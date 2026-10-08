# Common Table

## One-line Summary

Lunch your whole table can say yes to: Common Table uses separate Qloo taste reads to find restaurants every diner can get behind.

## Product Overview

Common Table solves a surprisingly frequent problem: the team lunch chat that never reaches a decision. Two to four people add a few cultural favorites and a city. Common Table asks Qloo for a separate restaurant ranking for every person, keeps only the actual restaurant entities present in everyone's Qloo results, then ranks that overlap with a harmonic mean of their individual affinities. The result is a shortlist where one person's strong preference cannot drown out everyone else's fit.

Each pick shows the Qloo affinity for each person and any useful venue tags Qloo returned. Map search URLs are built from the exact place name and address. A table can be remembered on one device for the next workday; no account or group-chat setup is required. The same planner is exposed as an MCP tool so an AI assistant can find a fair lunch spot from a natural-language request.

## Problem

Group lunch is a small decision people repeat almost every day. Generic “near me” lists rank popularity or proximity, while a group chat makes the person who suggests first disproportionately influential. A venue that one person loves and everyone else dislikes is not a good group recommendation.

## Key Features

1. Each diner enters one to three artists, athletes, films, brands, or places they like.
2. Common Table resolves each anchor through Qloo Search.
3. It calls Qloo Insights independently for each diner, asking for restaurants in the chosen city and enabling explainability.
4. It intersects the restaurant entity IDs returned for all diners; a venue must appear in every person's result set.
5. It calculates a harmonic mean across Qloo affinity scores and explains the shortlist with individual scores, taste signals, and Qloo tags.
6. “Show another set” excludes the current places. The map action searches the restaurant's exact name and address.

## How We Used AI

Qloo Taste AI is the matching system. Common Table resolves each person's cultural anchors through Qloo Search, makes separate Qloo Insights requests with locality and restaurant filters, and uses Qloo's affinity and explainability data to find and rank shared venues. It does not generate venue facts or present invented recommendations as Qloo results.

The production app also exposes `find_shared_lunch` at `/api/mcp` as a Model Context Protocol Streamable HTTP tool. An assistant can supply a city and two to four taste profiles, then use structured restaurant results, per-person affinities, and map search URLs. The web UI and MCP tool share the same Qloo-backed planner.

## Why This Matters

The initial use case is the recurring office lunch decision. Common Table makes each person's taste contribution visible and ranks shared options so one strong preference cannot mask a poor fit for someone else. The same fair-overlap pattern can support friend groups choosing coffee, dinner, or a neighborhood activity.

## How We Used Codex

Codex helped turn the initial solo night-out planner into Common Table, implement the per-person Qloo workflow and MCP endpoint, refine the interface and place links, run fixture-backed and live end-to-end checks, and publish the app and project materials. The Qloo API calls and ranking are implemented directly in the server; no LLM-generated venue claims are presented as Qloo results.

## Architecture

- Dependency-free Node.js server with server-side Qloo API calls.
- Accessible, responsive HTML, CSS, and browser JavaScript interface.
- Qloo `/search` plus per-participant `/v2/insights` requests with restaurant and locality filters and explainability enabled.
- MCP Streamable HTTP endpoint with `initialize`, `ping`, `tools/list`, and `tools/call` for `find_shared_lunch`.
- Optional local table memory in browser storage; API credentials remain server-side.
- MIT-licensed public source repository.

## Testing Instructions

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

The hosted MCP endpoint is `https://tastetrail-qloo-hackathon.vercel.app/api/mcp` and the web demo is `https://tastetrail-qloo-hackathon.vercel.app/`.

### Production smoke check — October 8, 2026

- `GET /api/health` returned HTTP 200 and reported live mode.
- `GET /api/cities?q=San` returned HTTP 200 with six city suggestions.
- One live `POST /api/plan` for two Bengaluru diners returned HTTP 200, three Qloo-ranked restaurants, and a Google Maps search link for the first pick.
- A second live plan with different anchors (“Virat Kohli” and “Taylor Swift”) returned HTTP 200, three shared places, distinct participant affinities, and a Maps link.
- MCP `initialize` returned HTTP 200, and `tools/list` exposed `find_shared_lunch`.
- Qloo results vary by request; these smoke checks do not guarantee future availability or ranking quality across cities and tastes.

## Screenshot Shot List

1. `screenshots/common-table-thumbnail.png` — Common Table's lunch-table interface and taste-profile setup; used as the project thumbnail.
2. Capture a fresh setup screenshot with Bengaluru, Virat Kohli for one diner, and Taylor Swift for the other.
3. Capture the resulting shared shortlist with both per-person affinity scores and the Maps action visible. The existing `screenshots/common-table-live.png` shows an earlier live result and should be replaced with this contrasting-taste proof.
4. Capture the MCP `tools/list` response showing `find_shared_lunch` for the agent integration proof.

## Public Demo Link

- https://tastetrail-qloo-hackathon.vercel.app/

## Public Repository Link

- https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- License: MIT

## Demo Video

Not recorded yet. Requirement status is unverified because Devpost's connected tools were unavailable during this draft update.

### 50-second demo script

- **0–5 sec:** “A team lunch poll can turn into a debate. The first suggestion isn't necessarily the place everyone will enjoy.”
- **5–15 sec:** Set Bengaluru; enter Virat Kohli for one diner and Taylor Swift for the other; select “Find our common ground.”
- **15–32 sec:** Show the three live shared picks. Point out that each card shows a separate affinity per diner, while the shortlist contains only restaurants returned for both.
- **32–40 sec:** Open “View on Maps” for one pick and show the restaurant name and address in the Maps search.
- **40–50 sec:** Show the MCP `find_shared_lunch` tool and close: “The same Qloo-backed group planner is available to an assistant.”

## Submission Readiness Notes

- Core web, Qloo, city-search, and MCP routes have passed focused live checks.
- Replace the older live-result screenshot with the contrasting-profile run and capture the MCP tool list.
- Record the 50-second demo after checking the live event's video requirement.
- Confirm the current Devpost form fields and judging criteria before finalizing the project write-up; Devpost's connected tools were unavailable during this draft update.

## Known Limitations

- Results and city suggestions depend on Qloo API availability, rate limits, and the current catalog.
- The app does not verify opening hours, reservations, dietary suitability, or business websites.
- Production validation covered two recommendation requests, including one with different tastes; it does not establish broad reliability or ranking quality across cities and tastes.

## TODO Official Form Fields

- Confirm any event-specific required fields and exact answer limits in the live Devpost form before entering this draft.

## Submission Form Notes

- Project start date: October 6, 2026.
- Demo URL: https://tastetrail-qloo-hackathon.vercel.app/
- Repository URL: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- Existing-project upgrade answer: TasteTrail was created for this hackathon and rebuilt as Common Table with multi-person Qloo affinity intersection, fair shared ranking, an MCP tool, and correct Maps search links.
- Demo video: check the live event form for the current requirement.
