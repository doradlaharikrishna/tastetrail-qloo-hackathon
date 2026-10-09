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
const favoriteCache = new Map();
const qlooRequestSpacingMs = 400;
let qlooRequestQueue = Promise.resolve();
let lastQlooRequestAt = 0;
const entityTypes = ["urn:entity:person", "urn:entity:artist", "urn:entity:movie", "urn:entity:place"];
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

function sendJson(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
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

function publicPlace(entity, { matchedFavorites, occasion }) {
  const properties = entity?.properties || {};
  const geocode = properties.geocode || {};
  const address = properties.address || {};
  const addressText = typeof address === "string"
    ? address
    : [address.street, address.locality, address.region, address.postal_code].filter(Boolean).join(", ");
  const rawKind = entity?.subtype || entity?.type || "place";
  const kind = rawKind.replace(/^urn:entity:/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const signalNames = new Map(matchedFavorites.map((favorite) => [favorite.id, favorite.name]));
  const explainedSignals = entity?.query?.explainability?.["signal.interests.entities"] || [];
  const tasteMatch = explainedSignals
    .filter((signal) => signal.score >= 0.1 && signalNames.has(signal.entity_id))
    .sort((left, right) => right.score - left.score)[0];
  const affinity = Number(entity?.query?.affinity);
  const usefulTags = (entity?.tags || [])
    .filter((tag) => /^(urn:tag:(ambience|decor|interests|time_of_day_fit|menu_highlight|cuisine):)/.test(tag.type || ""))
    .map((tag) => cleanText(tag.name, 60))
    .filter(Boolean)
    .slice(0, 2);
  const reasons = [];
  if (occasion === "Dinner and a good conversation") reasons.push("Restaurant match for dinner");
  if (tasteMatch) {
    reasons.push(Number.isFinite(affinity)
      ? `Qloo affinity ${affinity.toFixed(2)} for ${signalNames.get(tasteMatch.entity_id)}`
      : `Taste connection: ${signalNames.get(tasteMatch.entity_id)}`);
  } else if (Number.isFinite(affinity)) {
    reasons.push(`Qloo affinity ${affinity.toFixed(2)}`);
  }
  if (usefulTags.length) reasons.push(`Qloo tags: ${usefulTags.join(", ")}`);
  return {
    id: entityId(entity),
    name: entity?.name || properties.name || "A local favorite",
    kind: occasion === "Dinner and a good conversation" ? "Restaurant" : kind,
    location: addressText || [geocode.name, geocode.city].filter(Boolean).join(", "),
    url: googleMapsUrl(entity?.name || properties.name, addressText, geocode.city),
    reason: reasons.join(" · ")
  };
}

function googleMapsUrl(name, address, city) {
  const query = [name, address, city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
  const request = qlooRequestQueue.then(async () => {
    const waitMs = Math.max(0, lastQlooRequestAt + qlooRequestSpacingMs - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastQlooRequestAt = Date.now();
    return fetch(`${qlooBaseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(12000),
      headers: {
        accept: "application/json",
        "x-api-key": qlooApiKey,
        ...options.headers
      }
    });
  });
  qlooRequestQueue = request.then(() => undefined, () => undefined);
  const response = await request;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "Qloo rejected the API key or this endpoint is not enabled for it."
      : response.status === 429
        ? "Qloo is temporarily rate-limiting requests. Please try again shortly."
        : "Qloo could not complete that recommendation request.";
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader
      ? Math.max(1, Math.ceil(Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader)
        : (Date.parse(retryAfterHeader) - Date.now()) / 1000))
      : undefined;
    throw Object.assign(new Error(safeMessage), {
      status: response.status === 429 ? 503 : 502,
      upstreamStatus: response.status,
      retryAfterSeconds
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

function normalizeFavorite(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isExactFavoriteMatch(query, candidateName, type) {
  const normalizedQuery = normalizeFavorite(query);
  if (!normalizedQuery || normalizedQuery !== normalizeFavorite(candidateName)) return false;
  // A one-word place result can turn a cuisine or adjective into a restaurant
  // signal without the diner intending to name that business.
  return !(type === "urn:entity:place" && !normalizedQuery.includes(" "));
}

async function lookupFavorite(query) {
  const normalizedQuery = normalizeFavorite(query);
  const cached = favoriteCache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) return cached.match;
  const typePriority = new Map([["urn:entity:person", 0], ["urn:entity:artist", 1], ["urn:entity:movie", 2], ["urn:entity:place", 3]]);
  const matches = [];
  for (const type of entityTypes) {
    const search = new URLSearchParams({ query, type });
    try {
      const payload = await qlooRequest(`/search?${search}`);
      matches.push(...resultEntities(payload)
        .filter((entity) => entityId(entity) && entity.name)
        .map((entity) => {
          const score = isExactFavoriteMatch(query, entity.name, type) ? 100 : 0;
          return { id: entityId(entity), name: entity.name, type, score };
        }));
      if (matches.some((match) => match.score === 100)) break;
    } catch (error) {
      if ([401, 403, 404, 429].includes(error.upstreamStatus) || error.upstreamStatus >= 500) throw error;
    }
  }
  const match = matches.filter((candidate) => candidate.score === 100)
    .sort((left, right) => right.score - left.score || typePriority.get(left.type) - typePriority.get(right.type))[0] || null;
  favoriteCache.set(normalizedQuery, { match, expiresAt: Date.now() + 30 * 60 * 1000 });
  if (favoriteCache.size > 500) favoriteCache.delete(favoriteCache.keys().next().value);
  return match;
}

async function liveTrail({ city, favorites, occasion, excludeIds }) {
  if (!favorites.length) {
    throw Object.assign(new Error("Add at least one specific person, artist, film, brand, or place name for live taste matching."), { status: 400 });
  }

  const resolved = [];
  for (const input of favorites) {
    const match = await lookupFavorite(input);
    if (!match) {
      throw Object.assign(new Error(
        `I couldn’t match “${input}” to an exact Qloo name, so I didn’t use it or guess at a lookalike. Enter a specific person, artist, film, brand, or place name. Cuisine, spice, portions, and ambience are dining requirements, not taste anchors.`
      ), { status: 422 });
    }
    resolved.push(match);
  }

  const body = {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": resolved.map((entity) => entity.id),
    "filter.location.query": city,
    "filter.location.radius": 0,
    "take": 12,
    "feature.explainability": true
  };
  if (occasion === "Dinner and a good conversation") {
    body["filter.tags"] = "urn:tag:category:place:restaurant";
  }
  if (excludeIds.length) body["filter.exclude.entities"] = excludeIds.join(",");

  const insight = await qlooRequest("/v2/insights", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const places = resultEntities(insight)
    .map((entity) => publicPlace(entity, { matchedFavorites: resolved, occasion }))
    .filter((place) => place.id && place.name);
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

function balancedAffinity(scores) {
  const validScores = scores.filter((score) => Number.isFinite(score) && score > 0);
  if (validScores.length !== scores.length || !validScores.length) return 0;
  return validScores.length / validScores.reduce((total, score) => total + (1 / score), 0);
}

export async function sharedLunchPlan({ city, participants, excludeIds = [] }) {
  city = cleanText(city, 90);
  participants = Array.isArray(participants) ? participants.slice(0, 4).map((participant, index) => ({
    name: cleanText(participant?.name, 40) || `Person ${index + 1}`,
    favorites: Array.isArray(participant?.favorites)
      ? participant.favorites.map((favorite) => cleanText(favorite, 80)).filter(Boolean).slice(0, 3)
      : []
  })) : [];
  if (!city) throw Object.assign(new Error("Add a city to find a shared lunch."), { status: 400 });
  if (participants.length < 2) throw Object.assign(new Error("Add at least two people so we can find a fair match."), { status: 400 });
  if (participants.some((participant) => !participant.favorites.length)) {
    throw Object.assign(new Error("Add at least one taste anchor for each person at the table."), { status: 400 });
  }
  excludeIds = Array.isArray(excludeIds) ? excludeIds.map((id) => cleanText(id, 100)).filter((id) => /^[\w-]+$/.test(id)).slice(0, 15) : [];
  if (!qlooApiKey) {
    return {
      mode: "preview",
      city,
      participants: participants.map(({ name, favorites }) => ({ name, matchedFavorites: favorites })),
      places: []
    };
  }

  const resolvedParticipants = [];
  for (const [index, participant] of participants.entries()) {
    const favorites = [];
    for (const input of participant.favorites) {
      const match = await lookupFavorite(input);
      if (!match) {
        throw Object.assign(new Error(
          `I couldn’t match “${input}” to an exact Qloo name for ${participant.name}, so I didn’t use it or guess at a lookalike. Enter a specific person, artist, film, brand, or place name they already like. Cuisine, spice, portion size, and ambience are dining requirements, not taste anchors.`
        ), { status: 422 });
      }
      favorites.push(match);
    }
    resolvedParticipants.push({ id: `person-${index + 1}`, name: participant.name, favorites });
  }

  const perPersonResults = await Promise.all(resolvedParticipants.map(async (participant) => {
    const body = {
      "filter.type": "urn:entity:place",
      "filter.tags": "urn:tag:category:place:restaurant",
      "signal.interests.entities": participant.favorites.map((favorite) => favorite.id),
      "filter.location.query": city,
      "filter.location.radius": 0,
      "take": 50,
      "feature.explainability": true
    };
    if (excludeIds.length) body["filter.exclude.entities"] = excludeIds.join(",");
    const insight = await qlooRequest("/v2/insights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { participant, entities: resultEntities(insight) };
  }));

  const candidates = new Map();
  for (const { participant, entities } of perPersonResults) {
    for (const entity of entities) {
      const id = entityId(entity);
      const name = cleanText(entity?.name, 140);
      if (!id || !name || /\b(hotel|resort|hostel|motel|guest house|lodging)\b/i.test(name)) continue;
      const affinity = Number(entity?.query?.affinity);
      if (!Number.isFinite(affinity) || affinity <= 0) continue;
      const candidate = candidates.get(id) || { entity, affinities: new Map(), signalNames: new Map() };
      candidate.affinities.set(participant.id, affinity);
      const explainedSignals = entity?.query?.explainability?.["signal.interests.entities"] || [];
      const participantSignals = new Map(participant.favorites.map((favorite) => [favorite.id, favorite.name]));
      const matched = explainedSignals
        .filter((signal) => signal.score >= 0.1 && participantSignals.has(signal.entity_id))
        .sort((left, right) => right.score - left.score)
        .map((signal) => participantSignals.get(signal.entity_id));
      candidate.signalNames.set(participant.id, matched);
      candidates.set(id, candidate);
    }
  }

  const ranked = [...candidates.values()]
    .filter((candidate) => candidate.affinities.size === resolvedParticipants.length)
    .map((candidate) => {
      const scores = resolvedParticipants.map((participant) => candidate.affinities.get(participant.id));
      return { ...candidate, balancedFit: balancedAffinity(scores) };
    })
    .sort((left, right) => right.balancedFit - left.balancedFit)
    .slice(0, 3);

  if (!ranked.length) {
    throw Object.assign(new Error("Qloo didn’t find a restaurant that ranked for everyone yet. Add one more taste anchor for each person or try a broader city."), { status: 404 });
  }

  const places = ranked.map(({ entity, balancedFit, affinities, signalNames }) => {
    const address = entity?.properties?.address;
    const addressText = typeof address === "string"
      ? address
      : [address?.street, address?.locality, address?.region, address?.postal_code].filter(Boolean).join(", ");
    const geocode = entity?.properties?.geocode || {};
    const location = addressText || [geocode.name, geocode.city, geocode.admin1_region].filter(Boolean).join(", ") || city;
    const tags = (entity?.tags || [])
      .filter((tag) => /^(urn:tag:(ambience|decor|interests|time_of_day_fit|menu_highlight|cuisine):)/.test(tag.type || ""))
      .map((tag) => cleanText(tag.name, 60))
      .filter(Boolean)
      .slice(0, 2);
    const affinityByParticipant = resolvedParticipants.map((participant) => ({
      name: participant.name,
      score: affinities.get(participant.id),
      signals: signalNames.get(participant.id) || []
    }));
    const reason = [
      `Balanced Qloo fit ${balancedFit.toFixed(2)}`,
      ...affinityByParticipant.map(({ name, score }) => `${name}: ${score.toFixed(2)}`),
      tags.length ? `Qloo tags: ${tags.join(", ")}` : ""
    ].filter(Boolean).join(" · ");
    return {
      id: entityId(entity),
      name: entity.name,
      kind: "Restaurant",
      location,
      url: googleMapsUrl(entity.name, addressText || location, city),
      balancedFit,
      affinityByParticipant,
      tags,
      reason
    };
  });

  return {
    mode: "live",
    city,
    occasion: "Lunch",
    participantNames: resolvedParticipants.map(({ name }) => name),
    matchedFavorites: resolvedParticipants.map(({ name, favorites }) => ({ name, favorites: favorites.map(({ name }) => name) })),
    ranking: "harmonic-mean-of-individual-qloo-affinity",
    places
  };
}

async function handleSharedLunch(request, response) {
  if (isRateLimited(request)) return sendJson(response, 429, { error: "Please pause a moment before planning another shared lunch." });
  try {
    const input = await readJsonBody(request);
    const city = cleanText(input.city, 90);
    const rawParticipants = Array.isArray(input.participants) ? input.participants.slice(0, 4) : [];
    const participants = rawParticipants.map((participant, index) => ({
      name: cleanText(participant?.name, 40) || `Person ${index + 1}`,
      favorites: Array.isArray(participant?.favorites)
        ? participant.favorites.map((favorite) => cleanText(favorite, 80)).filter(Boolean).slice(0, 3)
        : cleanText(participant?.favorites, 240).split(",").map((favorite) => cleanText(favorite, 80)).filter(Boolean).slice(0, 3)
    }));
    const excludeIds = Array.isArray(input.excludeIds)
      ? input.excludeIds.map((id) => cleanText(id, 100)).filter((id) => /^[\w-]+$/.test(id)).slice(0, 15)
      : [];
    if (!city) return sendJson(response, 400, { error: "Add a city to find a shared lunch." });
    if (participants.length < 2) return sendJson(response, 400, { error: "Add at least two people so we can find a fair match." });
    if (participants.some((participant) => !participant.favorites.length)) {
      return sendJson(response, 400, { error: "Add at least one taste anchor for each person at the table." });
    }
    const result = await sharedLunchPlan({ city, participants, excludeIds });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "The lunch planner couldn’t reach Qloo. Please try again in a moment.",
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {})
    }, error.retryAfterSeconds ? { "retry-after": String(error.retryAfterSeconds) } : {});
  }
}

const mcpTool = {
  name: "find_shared_lunch",
  title: "Find a shared lunch spot",
  description: "Resolve each person's cultural taste anchors with Qloo, request restaurant recommendations separately for each person, and rank only venues that appear in everyone's results using a balanced harmonic-mean affinity score. Returns Qloo affinity details and a Google Maps search link built from the place name and address.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["city", "participants"],
    properties: {
      city: { type: "string", description: "A city or locality name, such as Bengaluru." },
      participants: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "favorites"],
          properties: {
            name: { type: "string", description: "Display name for this person's taste profile." },
            favorites: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" }, description: "One to three exact Qloo entity names this person likes: a specific person, artist, film, brand, or place. Do not use dining requirements such as cuisine, spice, portion size, or ambience." }
          }
        }
      }
    }
  }
};

async function handleMcp(request, response) {
  if (request.method !== "POST") return response.writeHead(405, { allow: "POST" }).end("Method not allowed");
  const origin = request.headers.origin;
  if (origin) {
    let parsedOrigin;
    try { parsedOrigin = new URL(origin); } catch { return response.writeHead(403).end(); }
    const host = parsedOrigin.hostname.toLowerCase();
    const localOrigin = ["localhost", "127.0.0.1", "::1"].includes(host);
    const appOrigin = host === "tastetrail-qloo-hackathon.vercel.app"
      || (host.startsWith("tastetrail-qloo-hackathon-") && host.endsWith(".vercel.app"));
    if ((!localOrigin && !appOrigin) || !["http:", "https:"].includes(parsedOrigin.protocol)) return response.writeHead(403).end();
  }
  if (request.method === "GET") return response.writeHead(405, { allow: "POST" }).end();
  const accept = request.headers.accept || "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return sendJson(response, 406, { error: "MCP clients must accept application/json and text/event-stream." });
  }
  let message;
  try { message = await readJsonBody(request); } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
  if (Array.isArray(message)) return sendJson(response, 400, { error: "Send one JSON-RPC request per MCP call." });
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return sendJson(response, 400, { error: "Send a valid JSON-RPC 2.0 request." });
  }
  if (message.method.startsWith("notifications/")) return response.writeHead(202).end();

  let result;
  if (message.method === "initialize") {
    result = {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "common-table-qloo", version: "1.0.0" }
    };
  } else if (message.method === "ping") {
    result = {};
  } else if (message.method === "tools/list") {
    result = { tools: [mcpTool] };
  } else if (message.method === "tools/call") {
    if (isRateLimited(request)) {
      return sendJson(response, 429, { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Please pause a moment before planning another shared lunch." } });
    }
    if (message.params?.name !== mcpTool.name) {
      return sendJson(response, 200, { jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "Unknown tool." } });
    }
    try {
      const plan = await sharedLunchPlan(message.params?.arguments || {});
      result = { content: [{ type: "text", text: JSON.stringify(plan) }], structuredContent: plan, isError: false };
    } catch (error) {
      result = { content: [{ type: "text", text: error.message || "The shared lunch tool failed." }], isError: true };
    }
  } else {
    return sendJson(response, 200, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found." } });
  }
  if (message.id === undefined) return response.writeHead(202).end();
  return sendJson(response, 200, { jsonrpc: "2.0", id: message.id, result });
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
  if (request.method === "POST" && url.pathname === "/api/plan") return handleSharedLunch(request, response);
  if (url.pathname === "/mcp" || url.pathname === "/api/mcp") return handleMcp(request, response);
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
    console.log(`Common Table ready on port ${port} (${qlooApiKey ? "Qloo API configured" : "preview mode"}).`);
  });
}
