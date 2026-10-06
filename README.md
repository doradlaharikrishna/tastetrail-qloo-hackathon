# Common Table

**Lunch your whole table can say yes to.** Common Table turns the daily “where should we eat?” thread into a fair, taste-aware group decision. Each person gets a separate Qloo Taste AI recommendation query. Only restaurants present in every person's Qloo results are eligible, and a harmonic mean of their Qloo affinities ranks the fairest overlap first.

This is a web app and a callable agent tool for the Qloo Agentic Hackathon. It is designed for recurring team lunches: remember a table's names and taste anchors on one device, refresh the shared shortlist, and share a clear map-search link. It does not claim that a venue is open, bookable, or suitable for dietary needs; verify those details with the restaurant.

## What makes the ranking fair

1. Common Table resolves each person's cultural taste anchors independently with Qloo Search.
2. It requests Qloo Insights for restaurants in the selected city for each person separately, with explainability enabled.
3. It intersects the returned Qloo place entity IDs. A pick must appear in every person's result set.
4. It ranks shared venues by the harmonic mean of those individual Qloo affinities, so one high score cannot hide a poor fit for someone else.
5. It shows each affinity and Qloo's useful venue tags. “Find this place on Maps” searches the venue name and address instead of trusting an unverified third-party website field.

## Run locally

Use Node.js 20 or later. Copy `.env.example` to `.env`, set `QLOO_API_KEY` to your private hackathon key, and start the app:

```sh
cp .env.example .env
npm start
```

Open `http://localhost:3000`. The key stays on the server and is never sent to browser code. The table profile is stored in the browser's local storage only when “Remember our table” is enabled. Without the key, the planner displays a clear preview state rather than fabricated recommendations.

## Agent interface

The app exposes a Model Context Protocol Streamable HTTP endpoint at:

```text
https://tastetrail-qloo-hackathon.vercel.app/mcp
```

Tool: **`find_shared_lunch`** — accepts `city` and two to four `participants`; each participant has a `name` and one to three `favorites`. It returns shared Qloo-ranked restaurants, individual affinities, useful tags, and name/address-based Google Maps search URLs. The MCP server implements `initialize`, `ping`, `tools/list`, and `tools/call` over JSON-RPC 2.0 POST requests. Clients should send an `Accept` header containing `application/json, text/event-stream`.

Example MCP `tools/call` arguments:

```json
{
  "city": "Bengaluru",
  "participants": [
    { "name": "You", "favorites": ["Virat Kohli"] },
    { "name": "Taylor", "favorites": ["Taylor Swift"] }
  ]
}
```

The web interface calls `POST /api/plan` with the same fields and optional `excludeIds` when someone asks for another set. City suggestions are provided by `GET /api/cities?q=...`.

## Qloo integration and architecture

- Plain HTML, CSS, and browser JavaScript for the accessible, responsive interface.
- A dependency-free Node.js HTTP server for static files, validation, rate limiting, Qloo calls, and the MCP endpoint.
- Qloo `/search` resolves supported people, artists, films, and places; `/v2/insights` is called once per participant with restaurant category, locality, and explainability filters.
- The API key is provided via the server-side `QLOO_API_KEY` environment variable. `.env` is ignored by Git. Never put the key in client code or commit it.
- MIT license.

## Public links

- Live demo: https://tastetrail-qloo-hackathon.vercel.app/
- Source: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- [Live Qloo lunch-plan screenshot](screenshots/common-table-live.png)

## Verification

Run syntax and whitespace checks from this directory:

```sh
node --check server.js
node --check app.js
git diff --check
```

With a valid key configured, try two-person plans in different cities and with multiple taste anchors per person. Confirm that every returned venue is a restaurant, appears in each person's Qloo result set, includes separate affinity scores, and opens a Google Maps search containing the venue name and address. API availability and rate limits are controlled by Qloo.
