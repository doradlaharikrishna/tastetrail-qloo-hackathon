# Common Table

## Tagline

Lunch your whole table can say yes to.

## Project summary

Common Table solves a surprisingly frequent problem: the team lunch chat that never reaches a decision. Two to four people add a few cultural favorites and a city. Common Table asks Qloo for a separate restaurant ranking for every person, keeps only the actual restaurant entities present in everyone's Qloo results, then ranks that overlap with a harmonic mean of their individual affinities. The result is a shortlist where one person's strong preference cannot drown out everyone else's fit.

Each pick shows the Qloo affinity for each person and any useful venue tags Qloo returned. Map search URLs are built from the exact place name and address. A table can be remembered on one device for the next workday; no account or group-chat setup is required. The same planner is exposed as an MCP tool so an AI assistant can find a fair lunch spot from a natural-language request.

## The problem

Group lunch is a small decision people repeat almost every day. Generic “near me” lists rank popularity or proximity, while a group chat makes the person who suggests first disproportionately influential. A venue that one person loves and everyone else dislikes is not a good group recommendation.

## How it works

1. Each diner enters one to three artists, athletes, films, brands, or places they like.
2. Common Table resolves each anchor through Qloo Search.
3. It calls Qloo Insights independently for each diner, asking for restaurants in the chosen city and enabling explainability.
4. It intersects the restaurant entity IDs returned for all diners; a venue must appear in every person's result set.
5. It calculates a harmonic mean across Qloo affinity scores and explains the shortlist with individual scores, taste signals, and Qloo tags.
6. “Show another set” excludes the current places. The map action searches the restaurant's exact name and address.

## What is agentic

The production app exposes `find_shared_lunch` at `/mcp` as a Model Context Protocol Streamable HTTP tool. An assistant can supply a city and two to four taste profiles, then use structured restaurant results, per-person affinities, and map search URLs in its response. The MCP endpoint shares the exact same Qloo-backed planning logic as the web UI rather than a mock path.

## Use of Qloo Taste AI

Qloo is the core matching system, not a decorative API call. Search resolves the user's cultural anchors to Qloo entity IDs; separate Insights calls produce the taste-conditioned, locality-filtered restaurant lists; Qloo affinity and explainability data power the intersection, fairness ranking, and visible evidence. Common Table does not invent venue recommendations with generated text. It does not claim real-time opening hours, reservations, diet suitability, or verified business websites.

## Potential impact

The first use case is the recurring office lunch decision, where a saved table makes the tool reusable from Monday to Friday. The same fair-overlap model can support friend groups choosing coffee, dinner, or a neighborhood activity, while preserving each person's visible contribution instead of collapsing a group into one “average” profile.

## How Codex was used

Codex helped turn the initial solo night-out planner into Common Table, implement the per-person Qloo workflow and MCP endpoint, refine the interface and place links, run fixture-backed and live end-to-end checks, and publish the app and project materials. The Qloo API calls and ranking are implemented directly in the server; no LLM-generated venue claims are presented as Qloo results.

## Technology

- Dependency-free Node.js server with server-side Qloo API calls.
- Accessible, responsive HTML, CSS, and browser JavaScript interface.
- Qloo `/search` plus per-participant `/v2/insights` requests with restaurant and locality filters and explainability enabled.
- MCP Streamable HTTP endpoint with `initialize`, `ping`, `tools/list`, and `tools/call` for `find_shared_lunch`.
- Optional local table memory in browser storage; API credentials remain server-side.
- MIT-licensed public source repository.

## Run and verify

Use Node.js 20 or newer. Set `QLOO_API_KEY` in an ignored local `.env`, run `npm start`, and open `http://localhost:3000`. Add two or more distinct participants, a city, and one or more specific taste anchors per person. The UI should display only common Qloo restaurant results with each person's affinity and a map search based on the result's name and address. Try the example action for a prepared Bengaluru pair.

For a direct API request, send `POST /api/plan` with:

```json
{
  "city": "Bengaluru",
  "participants": [
    { "name": "You", "favorites": ["Virat Kohli"] },
    { "name": "Taylor", "favorites": ["Taylor Swift"] }
  ]
}
```

The hosted MCP endpoint is `https://tastetrail-qloo-hackathon.vercel.app/mcp` and the web demo is `https://tastetrail-qloo-hackathon.vercel.app/`.

## Screenshot shot list

1. `screenshots/common-table-thumbnail.png` — Common Table's lunch-table interface and taste-profile setup; used as the project thumbnail.
2. `screenshots/common-table-live.png` — the live Qloo Bengaluru shortlist, individual affinities, venue tags, and Maps actions; uploaded to the Devpost project gallery.

## Demo video outline

The event does not require a demo video. If one is recorded: open the lunch-decision problem; run the Bengaluru example; show the shared restaurant overlap and each person's Qloo fit; open a map search; finish by showing the `find_shared_lunch` MCP tool.

## Links

- Demo: https://tastetrail-qloo-hackathon.vercel.app/
- Public source: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- License: MIT

## Submission form notes

- Project start date: October 6, 2026.
- Demo URL: https://tastetrail-qloo-hackathon.vercel.app/
- Repository URL: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- Existing-project upgrade answer: TasteTrail was created for this hackathon and rebuilt as Common Table with multi-person Qloo affinity intersection, fair shared ranking, an MCP tool, and correct Maps search links.
- Demo video: the Qloo Agentic Hackathon does not require one.
