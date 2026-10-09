import assert from "node:assert/strict";
import test from "node:test";

process.env.QLOO_API_KEY = "test-key";
process.env.GROQ_API_KEY = "test-groq-key";
const { isExactDiningTagMatch, isExactFavoriteMatch, sharedLunchPlan } = await import("../server.js");

test("normalizes case and accents for exact named Qloo entities", () => {
  assert.equal(isExactFavoriteMatch("Beyonce", "Beyoncé", "urn:entity:artist"), true);
  assert.equal(isExactFavoriteMatch("taylor swift", "Taylor Swift", "urn:entity:artist"), true);
});

test("does not turn a generic cuisine word into a longer restaurant entity", () => {
  assert.equal(isExactFavoriteMatch("biryani", "Ghar Banduk Biryani", "urn:entity:place"), false);
});

test("does not turn an adjective into a longer culture entity", () => {
  assert.equal(isExactFavoriteMatch("spicy", "SPICY CHOCOLATE", "urn:entity:artist"), false);
});

test("rejects one-word place matches as ambiguous but accepts a full venue name", () => {
  assert.equal(isExactFavoriteMatch("Biryani", "Biryani", "urn:entity:place"), false);
  assert.equal(isExactFavoriteMatch("Ghar Banduk Biryani", "Ghar Banduk Biryani", "urn:entity:place"), true);
});

test("accepts only exact restaurant-relevant Qloo dining tags", () => {
  const biryaniTag = { id: "urn:tag:specialty_dish:place:biryani", name: "Biryani", type: "urn:tag:specialty_dish:place" };
  assert.equal(isExactDiningTagMatch("biryani", biryaniTag), true);
  assert.equal(isExactDiningTagMatch("biryani", { ...biryaniTag, name: "Ghar Banduk Biryani" }), false);
  assert.equal(isExactDiningTagMatch("Biryani", { ...biryaniTag, type: "urn:tag:genre:media:Biryani" }), false);
});

test("rejects an ambiguous surname instead of guessing between people or restaurants", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("query");
    const type = parsed.searchParams.get("type");
    const entities = type === "urn:entity:person" && query === "Singh"
      ? [{ entity_id: "virat-singh", name: "Virat Singh" }, { entity_id: "other-singh", name: "Another Singh" }]
      : type === "urn:entity:place"
        ? [{ entity_id: "place-biryani", name: "Ghar Banduk Biryani" }]
        : [];
    return new Response(JSON.stringify({ results: { entities } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    await assert.rejects(
      sharedLunchPlan({
        city: "Bengaluru",
        participants: [
          { name: "Hari", favorites: ["Singh"] },
          { name: "Chandrika", favorites: ["Taylor Swift"] }
        ]
      }),
      (error) => error.status === 422
        && error.message.includes("didn’t recognize “Singh”")
        && error.message.includes("Virat Kohli")
    );
    assert.equal(requests.some((url) => url.includes("/v2/insights")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("routes an exact cuisine tag entered as a favorite into dining signals", async () => {
  const originalFetch = globalThis.fetch;
  const insightBodies = [];
  const requests = [];
  const searchQueries = [];
  const tagQueries = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    requests.push(parsed.pathname);
    if (parsed.pathname === "/v2/tags") {
      const query = parsed.searchParams.get("filter.query");
      tagQueries.push(query);
      const tags = query?.toLowerCase() === "biryani"
        ? [{ id: "urn:tag:specialty_dish:place:biryani", name: "Biryani", type: "urn:tag:specialty_dish:place" }]
        : [];
      return new Response(JSON.stringify({ results: { tags } }), { status: 200 });
    }
    if (parsed.pathname === "/search") {
      const query = parsed.searchParams.get("query");
      searchQueries.push(query);
      const type = parsed.searchParams.get("type");
      const entity = type === "urn:entity:person" && query === "Kohli"
        ? [{ entity_id: "person-virat-kohli", name: "Virat Kohli" }]
        : type === "urn:entity:artist" && query === "Taylor Swift"
        ? [{ entity_id: `artist-${query.toLowerCase().replaceAll(" ", "-")}`, name: query }]
        : [];
      return new Response(JSON.stringify({ results: { entities: entity } }), { status: 200 });
    }
    if (parsed.pathname === "/v2/insights") {
      const body = JSON.parse(options.body);
      insightBodies.push(body);
      const explainability = {
        "signal.interests.entities": body["signal.interests.entities"].map((entity_id) => ({ entity_id, score: 0.7 })),
        "signal.interests.tags": (body["signal.interests.tags"] || []).map(({ tag }) => ({ tag_id: tag, score: 0.6 }))
      };
      return new Response(JSON.stringify({ results: { entities: [{
        entity_id: "shared-restaurant",
        name: "A Shared Restaurant",
        properties: { address: { locality: "Bengaluru" } },
        query: { affinity: 0.72, explainability }
      }] } }), { status: 200 });
    }
    throw new Error(`Unexpected Qloo request: ${parsed.pathname}`);
  };

  try {
    const plan = await sharedLunchPlan({
      city: "Bengaluru",
      participants: [
        { name: "Hari", favorites: ["Kohli", "biryani", "more quantity"] },
        { name: "Chandrika", favorites: ["Taylor Swift"], diningPreferences: ["Biryani"] }
      ]
    });
    const biryaniSignal = { tag: "urn:tag:specialty_dish:place:biryani", weight: 7 };
    assert.equal(plan.diningPreferences[0].usedByQloo[0], "Biryani");
    assert.deepEqual(plan.diningPreferences[0].unverified, ["more quantity"]);
    assert.equal(plan.diningPreferences[1].usedByQloo[0], "Biryani");
    assert.deepEqual(plan.matchedFavorites[0].favorites, ["Virat Kohli"]);
    assert.equal(searchQueries.includes("more quantity"), false, "known portion requests do not use Qloo entity-search calls");
    assert.equal(tagQueries.includes("more quantity"), false, "known portion requests do not use Qloo tag-search calls");
    assert.ok(insightBodies.every((body) => body["signal.interests.tags"]?.some((tag) => tag.tag === biryaniSignal.tag)));
    assert.ok(requests.filter((path) => path === "/v2/tags").length <= 2, "identical dining tags are deduplicated by the result cache");
    assert.ok(plan.places[0].affinityByParticipant.every((person) => person.signals.includes("Biryani")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function qlooPayload(url) {
  const parsed = new URL(String(url));
  if (parsed.pathname === "/v2/tags") return { results: { tags: [] } };
  if (parsed.pathname === "/search") {
    const query = parsed.searchParams.get("query");
    const type = parsed.searchParams.get("type");
    if (query === "Virat Kohli" && type === "urn:entity:person") {
      return { results: { entities: [{ entity_id: "virat-kohli", name: "Virat Kohli" }] } };
    }
    if (query === "Taylor Swift" && type === "urn:entity:artist") {
      return { results: { entities: [{ entity_id: "taylor-swift", name: "Taylor Swift" }] } };
    }
    return { results: { entities: [] } };
  }
  throw new Error(`Unexpected Qloo request: ${parsed.pathname}`);
}

test("offers a Groq candidate only after an exact Qloo match and explicit user review", async () => {
  const originalFetch = globalThis.fetch;
  const groqRequests = [];
  const qlooRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://api.groq.com/")) {
      const body = JSON.parse(options.body);
      groqRequests.push({ url: String(url), body, authorization: options.headers.authorization });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ suggestions: [{ id: "item-1", candidates: ["Virat Kohli"] }] }) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    qlooRequests.push(String(url));
    return new Response(JSON.stringify(qlooPayload(url)), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await assert.rejects(
      sharedLunchPlan({
        city: "Bengaluru",
        allowGroqAssist: true,
        participants: [
          { name: "Hari", favorites: ["Virat"] },
          { name: "Chandrika", favorites: ["Taylor Swift"] }
        ]
      }),
      (error) => {
        assert.equal(error.status, 409);
        assert.deepEqual(error.suggestions, [{
          participantIndex: 0,
          favoriteIndex: 0,
          participantName: "Hari",
          original: "Virat",
          suggested: "Virat Kohli",
          verifiedBy: "Qloo"
        }]);
        return true;
      }
    );
    assert.equal(groqRequests.length, 1);
    assert.equal(groqRequests[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(groqRequests[0].body.model, "openai/gpt-oss-20b");
    assert.equal(groqRequests[0].authorization, "Bearer test-groq-key");
    assert.equal(groqRequests[0].body.messages[1].content.includes("Bengaluru"), false);
    assert.equal(groqRequests[0].body.messages[1].content.includes("Hari"), false);
    assert.equal(qlooRequests.some((url) => url.includes("/v2/insights")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not call Groq when the user did not opt in", async () => {
  const originalFetch = globalThis.fetch;
  let groqCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://api.groq.com/")) groqCalls += 1;
    return new Response(JSON.stringify(qlooPayload(url)), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await assert.rejects(
      sharedLunchPlan({
        city: "Bengaluru",
        allowGroqAssist: false,
        participants: [
          { name: "Hari", favorites: ["Virat"] },
          { name: "Chandrika", favorites: ["Taylor Swift"] }
        ]
      }),
      (error) => error.status === 422 && error.message.includes("didn’t recognize “Virat”")
    );
    assert.equal(groqCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
