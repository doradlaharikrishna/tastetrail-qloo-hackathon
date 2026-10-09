import assert from "node:assert/strict";
import test from "node:test";

process.env.QLOO_API_KEY = "test-key";
const { isExactFavoriteMatch, sharedLunchPlan } = await import("../server.js");

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

test("does not call Insights when a generic input only partially matches an entity", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const parsed = new URL(String(url));
    const type = parsed.searchParams.get("type");
    const entities = type === "urn:entity:place"
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
          { name: "Hari", favorites: ["biryani", "spicy", "more quantity"] },
          { name: "Chandrika", favorites: ["Taylor Swift"] }
        ]
      }),
      (error) => error.status === 422
        && error.message.includes("couldn’t match “biryani”")
        && error.message.includes("didn’t use it or guess at a lookalike")
    );
    assert.equal(requests.some((url) => url.includes("/v2/insights")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
