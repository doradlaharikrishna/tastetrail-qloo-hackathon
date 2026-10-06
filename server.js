import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const qlooBaseUrl = (process.env.QLOO_API_BASE_URL || "https://hackathon.api.qloo.com").replace(/\/$/, "");
const qlooApiKey = process.env.QLOO_API_KEY;
const maxBodyBytes = 4096;
const rateWindowMs = 10 * 60 * 1000;
const rateLimit = 18;
const requestsByIp = new Map();
const citySearchesByIp = new Map();
const citySuggestionCache = new Map();
const entityTypes = ["urn:entity:artist", "urn:entity:movie", "urn:entity:place"];
const sampleStops = [
  { title: "The candlelit table", meta: "Dinner · Japanese comfort food", reason: "A familiar favorite, with a menu that leaves room to explore." },
  { title: "A listening room", meta: "Music · Live jazz", reason: "For the part of your taste that likes to slow down and listen." },
  { title: "One last little pour", meta: "Drinks · Natural wine bar", reason: "Easygoing, low-lit, and just a few blocks from the music." }
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function resultEntities(payload) {
  const results = payload?.results;
  if (Array.isArray(results)) return results;
  if (Array.isArray(results?.entities)) return results.entities;
  if (Array.isArray(payload?.entities)) return payload.entities;
  return [];
}

function entityId(entity) {
  return entity?.entity_id || entity?.id || entity?.entity?.entity_id || entity?.entity?.id || "";
}

function publicPlace(entity) {
  const properties = entity?.properties || {};
  const geocode = properties.geocode || {};
  const address = properties.address || {};
  const addressText = typeof address === "string"
    ? address
    : [address.street, address.locality, address.region, address.postal_code].filter(Boolean).join(", ");
  const site = properties.website || properties.url || entity?.url || "";
  const rawKind = entity?.subtype || entity?.type || "place";
  const kind = rawKind.replace(/^urn:entity:/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    id: entityId(entity),
    name: entity?.name || properties.name || "A local favorite",
    kind,
    location: addressText || [geocode.name, geocode.city].filter(Boolean).join(", "),
    url: typeof site === "string" && /^https?:\/\//i.test(site) ? site : "",
    reason: "Qloo ranked this place using your selected taste signals and location."
  };
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Please send valid JSON."), { status: 400 });
  }
}

function isRateLimited(request) {
  const now = Date.now();
  const forwardedFor = request.headers["x-forwarded-for"]?.split(",")[0]?.trim();
  const ip = forwardedFor || request.socket.remoteAddress || "unknown";
  const previous = requestsByIp.get(ip) || [];
  const recent = previous.filter((timestamp) => now - timestamp < rateWindowMs);
  recent.push(now);
  requestsByIp.set(ip, recent);
  return recent.length > rateLimit;
}

function isCitySearchRateLimited(request) {
  const now = Date.now();
  const forwardedFor = request.headers["x-forwarded-for"]?.split(",")[0]?.trim();
  const ip = forwardedFor || request.socket.remoteAddress || "unknown";
  const previous = citySearchesByIp.get(ip) || [];
  const recent = previous.filter((timestamp) => now - timestamp < rateWindowMs);
  recent.push(now);
  citySearchesByIp.set(ip, recent);
  return recent.length > 60;
}

async function qlooRequest(path, options = {}) {
  const response = await fetch(`${qlooBaseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      accept: "application/json",
      "x-api-key": qlooApiKey,
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "Qloo rejected the API key or this endpoint is not enabled for it."
      : response.status === 429
        ? "Qloo is temporarily rate-limiting requests. Please try again shortly."
        : "Qloo could not complete that recommendation request.";
    throw Object.assign(new Error(safeMessage), {
      status: response.status === 429 ? 503 : 502,
      upstreamStatus: response.status
    });
  }
  return data;
}

async function searchCitySuggestions(query) {
  const cacheKey = query.toLocaleLowerCase();
  const cached = citySuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.cities;

  const entityTypes = ["urn:entity:locality", "urn:entity:place"];
  const groups = await Promise.all(entityTypes.map(async (type) => {
    const search = new URLSearchParams({ query, type });
    try {
      const payload = await qlooRequest(`/search?${search}`);
      return resultEntities(payload).map((entity) => ({ entity, type }));
    } catch {
      return [];
    }
  }));
  const normalizedQuery = query.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
  const seen = new Set();
  const matches = groups.flat()
    .map(({ entity, type }) => {
      const name = cleanText(entity?.name, 100);
      const disambiguation = cleanText(entity?.disambiguation, 180);
      const isPlace = type === "urn:entity:place";
      const value = isPlace && disambiguation ? `${name}, ${disambiguation}` : disambiguation || name;
      const details = !isPlace && disambiguation.startsWith(`${name},`)
        ? disambiguation.slice(name.length + 1).trim()
        : disambiguation;
      const normalizedName = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
      const score = normalizedName === normalizedQuery
        ? 100
        : normalizedName.startsWith(normalizedQuery)
          ? 80
          : normalizedName.includes(normalizedQuery)
            ? 50
            : 0;
      return { name, details, value, score, isPlace };
    })
    .filter((city) => {
      if (!city.name || !city.value || seen.has(city.value.toLocaleLowerCase())) return false;
      seen.add(city.value.toLocaleLowerCase());
      return true;
    })
    .sort((left, right) => right.score - left.score || Number(left.isPlace) - Number(right.isPlace));
  const relevantMatches = matches.some((city) => city.score > 0)
    ? matches.filter((city) => city.score > 0)
    : matches;
  const cities = relevantMatches.slice(0, 6).map(({ name, details, value }) => ({ name, details, value }));

  citySuggestionCache.set(cacheKey, { cities, expiresAt: Date.now() + 5 * 60 * 1000 });
  if (citySuggestionCache.size > 100) citySuggestionCache.delete(citySuggestionCache.keys().next().value);
  return cities;
}

async function lookupFavorite(query) {
  const normalize = (value) => value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedQuery = normalize(query);
  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const typePriority = new Map([["urn:entity:place", 0], ["urn:entity:artist", 1], ["urn:entity:movie", 2]]);
  const attempts = entityTypes.map(async (type) => {
    const search = new URLSearchParams({ query, type });
    try {
      const payload = await qlooRequest(`/search?${search}`);
      return resultEntities(payload)
        .filter((entity) => entityId(entity) && entity.name)
        .map((entity) => {
          const name = normalize(entity.name);
          const tokens = new Set(name.split(" ").filter(Boolean));
          const overlap = [...queryTokens].filter((token) => tokens.has(token)).length;
          let score = queryTokens.size ? (overlap / queryTokens.size) * 40 : 0;
          if (name === normalizedQuery) score = 100;
          else if (name.startsWith(`${normalizedQuery} `)) score = Math.max(score, 65);
          else if (normalizedQuery.startsWith(`${name} `)) score = Math.max(score, 55);
          return { id: entityId(entity), name: entity.name, type, score };
        });
    } catch (error) {
      if ([401, 403, 404, 429].includes(error.upstreamStatus) || error.upstreamStatus >= 500) throw error;
      return [];
    }
  });
  const matches = (await Promise.all(attempts)).flat().filter((match) => match.score > 0);
  if (!matches.length) return null;
  return matches.sort((left, right) => right.score - left.score || typePriority.get(left.type) - typePriority.get(right.type))[0];
}

async function liveTrail({ city, favorites, occasion, excludeIds }) {
  if (!favorites.length) {
    throw Object.assign(new Error("Add at least one artist, film, cuisine, or place for live taste matching."), { status: 400 });
  }

  const resolved = (await Promise.all(favorites.map(lookupFavorite))).filter(Boolean);
  if (!resolved.length) {
    throw Object.assign(new Error("I couldn’t match those favorites in Qloo. Try a specific artist, film, restaurant, or place name."), { status: 422 });
  }

  const body = {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": resolved.map((entity) => entity.id),
    "filter.location.query": city,
    "filter.location.radius": 0,
    "take": 12,
    "feature.explainability": true
  };
  if (excludeIds.length) body["filter.exclude.entities"] = excludeIds.join(",");

  const insight = await qlooRequest("/v2/insights", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const places = resultEntities(insight).map(publicPlace).filter((place) => place.id && place.name);
  if (!places.length) {
    throw Object.assign(new Error("Qloo returned no places for that combination. Try another city or preference."), { status: 404 });
  }

  return {
    mode: "live",
    places: places.slice(0, 3),
    matchedFavorites: resolved.map((entity) => entity.name),
    city,
    occasion
  };
}

export async function handleTrail(request, response) {
  if (isRateLimited(request)) return sendJson(response, 429, { error: "Please pause a moment before planning another trail." });
  try {
    const input = await readJsonBody(request);
    const city = cleanText(input.city, 90);
    const occasion = cleanText(input.occasion, 100) || "A little of everything";
    const favorites = Array.isArray(input.favorites)
      ? input.favorites.map((favorite) => cleanText(favorite, 80)).filter(Boolean).slice(0, 4)
      : cleanText(input.favorites, 360).split(",").map((favorite) => cleanText(favorite, 80)).filter(Boolean).slice(0, 4);
    const excludeIds = Array.isArray(input.excludeIds)
      ? input.excludeIds.map((id) => cleanText(id, 100)).filter((id) => /^[\w-]+$/.test(id)).slice(0, 15)
      : [];

    if (!city) return sendJson(response, 400, { error: "Add a city to make your plan." });
    const result = qlooApiKey
      ? await liveTrail({ city, favorites, occasion, excludeIds })
      : {
          mode: "preview",
          places: sampleStops.map((stop, index) => ({
            id: `sample-${index + 1}`,
            name: stop.title,
            kind: stop.meta,
            location: city,
            url: "",
            reason: stop.reason
          })),
          matchedFavorites: [],
          city,
          occasion
        };
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "The planner couldn’t reach Qloo. Please try again in a moment."
    });
  }
}

async function serveStatic(pathname, response, method) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { decoded = "/"; }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (relative.split("/").some((segment) => segment.startsWith("."))) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filePath = resolve(root, relative);
  if (!filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("not a file");
  } catch {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  if (method === "HEAD") return response.end();
  createReadStream(filePath).pipe(response);
}

export default async function handler(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { mode: qlooApiKey ? "live" : "preview" });
  }
  if (request.method === "GET" && url.pathname === "/api/cities") {
    const query = cleanText(url.searchParams.get("q"), 80);
    if (query.length < 2 || !qlooApiKey) return sendJson(response, 200, { cities: [] });
    if (isCitySearchRateLimited(request)) return sendJson(response, 429, { cities: [] });
    try {
      return sendJson(response, 200, { cities: await searchCitySuggestions(query) });
    } catch {
      return sendJson(response, 200, { cities: [] });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/trail") return handleTrail(request, response);
  if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "Not found." });
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  return serveStatic(url.pathname, response, request.method);
}

const server = createServer(handler);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, "0.0.0.0", () => {
    console.log(`TasteTrail ready on port ${port} (${qlooApiKey ? "Qloo API configured" : "preview mode"}).`);
  });
}
