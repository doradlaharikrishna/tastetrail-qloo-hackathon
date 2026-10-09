# Common Table

## One-line Summary

One lunch choice for the whole group: Common Table runs separate Qloo taste reads for each diner, keeps only shared restaurant results, and ranks the most balanced fit first.

## Product Overview

Common Table solves the recurring “where should we eat?” decision for teams and friends. Two to four people add a meeting city and a few cultural favorites. Common Table resolves each person’s anchors with Qloo, runs a separate restaurant recommendation for each diner, keeps only the same restaurant entities returned for everyone, then ranks the overlap with the harmonic mean of individual Qloo affinities. Unlike a solo city guide, the decision target is a group: one person’s very high score cannot hide a weak fit for someone else.

Each result makes the evidence visible: per-diner Qloo affinity, the lowest individual fit, any matched taste anchors and useful venue tags. The live app explains the shared-result rule and harmonic-mean ranking; affinity is a model score, not a promise or probability. Map searches use the exact venue name and address. A regular table can be remembered on one device without accounts or group-chat setup. An MCP tool exposes the same planner to AI assistants.

## Problem

Office lunch is a small decision people repeat several times a week. Nearby lists optimize for popularity or distance; a group chat often lets the first suggestion win. Common Table turns the constraint into the product: a place must appear in each person’s own Qloo results, then the weakest individual fit remains visible while the group compares options.

## Key Features

1. Each diner enters one to three artists, athletes, films, brands, or places they like.
2. Common Table resolves each anchor through Qloo Search.
3. It calls Qloo Insights independently for each diner, asking for restaurants in the chosen city and enabling explainability.
4. It intersects the restaurant entity IDs returned for all diners; a venue must appear in every person's result set.
5. It calculates a harmonic mean across Qloo affinity scores and explains the shortlist with individual scores, taste signals, and Qloo tags.
6. Each result shows individual affinity bars, the lowest diner fit, and matched Qloo taste signals when returned. “Show another set” excludes current places; Maps searches the exact place name and address.

## How We Used AI

Qloo Taste AI is the decision engine. Common Table resolves each person's cultural anchors through Qloo Search, makes separate Qloo Insights requests with locality and restaurant filters, intersects canonical Qloo restaurant entity IDs, and ranks the shared results using Qloo affinity and explainability data. Without those independent taste reads, this shortlist and its per-person evidence do not exist. The app does not invent venue facts or present generated text as Qloo output.

The production app also exposes `find_shared_lunch` at `https://tastetrail-qloo-hackathon.vercel.app/api/mcp` as a Model Context Protocol Streamable HTTP tool. An assistant can supply a city and two to four taste profiles, then use structured restaurant results, per-person affinities, and map search URLs. The web UI and MCP tool share the same Qloo-backed planner.

## Why This Matters

The first audience is the person organizing a recurring team lunch. Common Table makes each diner’s contribution visible, keeps the shared evidence inspectable, and reduces the back-and-forth to a shortlist the group can decide from. It is designed to be useful again next workday: remember the table locally, refresh the shared picks, and open the exact map search.

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
- A live plan with contrasting anchors (“Virat Kohli” and “Taylor Swift”) returned HTTP 200, three shared places, distinct participant affinities, and a Maps link.
- The live website flow with those contrasting profiles rendered three cards (Soul City, Puran Da Dhaba, and Indigo XP), separate affinity rows for both diners, and Maps searches containing each venue name and address. Browser console had no warnings or errors during this run.
- MCP `initialize` returned HTTP 200, and `tools/list` exposed `find_shared_lunch`.
- Qloo results vary by request; these smoke checks do not guarantee future availability or ranking quality across cities and tastes.

## Screenshot Shot List

1. `screenshots/common-table-thumbnail.png` — Common Table's lunch-table interface and taste-profile setup; used as the project thumbnail.
2. `screenshots/common-table-contrast-input.jpg` — Bengaluru with Virat Kohli for one diner and Taylor Swift for the other.
3. `screenshots/common-table-contrast-results.jpg` — three live shared picks with both affinity rows and Maps actions. The MCP `tools/list` response was verified separately and exposed `find_shared_lunch`.

## Public Demo Link

- https://tastetrail-qloo-hackathon.vercel.app/

## Public Repository Link

- https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- License: MIT

## Demo Video

The copied Qloo Agentic Hackathon page says demo videos are not required. A short recording could still help showcase the workflow, but it is optional; the hosted, judge-usable application is the required demo.

### 50-second demo script

- **0–5 sec:** “A team lunch poll can turn into a debate. The first suggestion isn't necessarily the place everyone will enjoy.”
- **5–15 sec:** Set Bengaluru; enter Virat Kohli for one diner and Taylor Swift for the other; select “Find our common ground.”
- **15–32 sec:** Show the three live shared picks. Point to each diner’s affinity bar and the lowest-fit line; explain that only restaurants returned for both make the shared list.
- **32–40 sec:** Explain that the harmonic mean weights down a pick when one diner’s fit is weak; open Maps for the exact restaurant and address.
- **40–50 sec:** Show the MCP `find_shared_lunch` tool and close: “The same Qloo-backed group decision is available to an assistant.”

## Submission Readiness Notes

- The copied event page requires a functional hosted demo, a public source repository with code/assets/run instructions, a project description, and an open-source license file visible in the repository's About section. It states that a demo video is not required.
- Devpost confirmed “Project submitted!” and opened the public Common Table project page after the finalization form was completed.
- Core web, Qloo, city-search, and MCP routes have passed focused live checks; the public GitHub repository is visible and GitHub identifies its MIT license.
- A demo video is optional. The public project page includes its existing gallery image; additional contrasting-profile screenshots could improve the story but are not an eligibility requirement.

## Known Limitations

- Results and city suggestions depend on Qloo API availability, rate limits, and the current catalog.
- The app does not verify opening hours, reservations, dietary suitability, or business websites.
- Production validation covered two recommendation requests, including one with different tastes; it does not establish broad reliability or ranking quality across cities and tastes.

## Post-submission

- Devpost confirmed submission at `https://devpost.com/software/tastetrail`. The event page says edits remain available until the deadline.

## Submission Form Notes

- Project start date: October 6, 2026.
- Demo URL: https://tastetrail-qloo-hackathon.vercel.app/
- Repository URL: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- Existing-project upgrade answer: TasteTrail was created for this hackathon and rebuilt as Common Table with multi-person Qloo affinity intersection, fair shared ranking, an MCP tool, and correct Maps search links.
- Demo video: optional according to the copied event page; hosted working application is required.
- Current Devpost state: submitted; confirmation message appeared and the public project page opened.
