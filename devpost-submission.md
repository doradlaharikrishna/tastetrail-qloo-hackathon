# TasteTrail

## One-line Summary

Turn a few cultural favorites and a city into a Qloo-powered, personalized three-stop local outing.

## Problem

Choosing where to go often means stitching together generic search results that do not reflect what a person actually enjoys. Someone who likes particular music, films, or places needs recommendations grounded in those tastes, not just popularity or keywords.

## Solution

TasteTrail is a small local-discovery planner. A person enters a city and up to four cultural favorites. The server resolves those favorites with Qloo Search, sends the matched entities and city to Qloo Insights, then presents a short list of recommended places. “Try another trail” excludes the previous results and requests another set.

The Qloo taste graph is the core of the matching step: the app uses the returned place recommendations rather than generating recommendations from generic text. It is designed as a focused taste-aware planning tool that could also be called by a larger personal assistant.

## Why This Matters

Local discovery is more useful when it reflects a person’s cultural interests. TasteTrail demonstrates a direct path from familiar artists, films, or places to a city-specific outing, with Qloo supplying the taste-based ranking.

## How We Used AI

TasteTrail uses Qloo Taste AI through two live API stages: it resolves each supplied favorite through `/search`, then requests place recommendations from `/v2/insights` using the matched entity IDs and the selected city. The server returns Qloo’s place results to the interface. It does not claim to use an LLM; the recommendation intelligence in this build comes from Qloo.

## How We Used Codex

Codex helped create the responsive web interface, the Node.js server, and the server-side Qloo integration. It also helped prepare setup and usage documentation. A live API smoke check confirmed that search and Insights both returned HTTP 200; the Insights response contained 12 place results. A full browser-to-server interaction still needs a hosted or local end-to-end run.

## Key Features

- Enter a city and up to four artists, films, or places as taste signals.
- Resolve taste signals with Qloo Search and request city-specific place recommendations from Qloo Insights.
- Show a concise three-stop trail with place details returned by Qloo.
- Request a different trail while excluding previous results.
- Keep the Qloo API key on the server in an ignored `.env` file; never send it to the browser.
- Use clearly labeled sample stops in preview mode when no API key is configured.

## Architecture

- **Interface:** plain HTML, CSS, and browser JavaScript.
- **Server:** Node.js built-in HTTP server serves the interface and accepts trail requests.
- **Qloo:** server-side `X-Api-Key` requests to `/search` and `/v2/insights` at the Qloo Hackathon API.
- **Secrets:** `QLOO_API_KEY` is read from the local `.env` file; `.env` is excluded from the source repository.
- **License:** MIT, included in `LICENSE`.

## Testing Instructions

1. Install a current Node.js release.
2. Copy `.env.example` to `.env` and set `QLOO_API_KEY` to a valid Qloo Hackathon API key. Do not publish `.env`.
3. Run `npm start` from the project folder.
4. Open the local app, enter a city and one or more specific favorites, and create a trail. Confirm that the app shows live Qloo results rather than the sample preview.
5. Select “Try another trail” and confirm that a different result set is requested.

Verified so far: JavaScript syntax and project JSON checks passed in an earlier build pass; a live API check using the configured key received HTTP 200 from Qloo Search and Insights, with 12 place results. The full browser flow and public deployment have not yet been verified.

## Public Demo Link

**TODO:** Add the externally hosted, publicly accessible app URL. The current app is a local build and does not meet the event’s published-demo requirement yet.

## Public Repository Link

**TODO:** Add a public GitHub, GitLab, or Bitbucket repository URL. Before publishing, confirm `.env` and all credentials are excluded. The project includes an MIT `LICENSE` file.

## Demo Video

Not required by the Qloo Agentic Hackathon. Optional short outline: state the local-discovery problem; enter a city and cultural favorites; show the Qloo-powered trail; request another trail; briefly show the server-side Qloo integration and secret-handling approach.

## Screenshot Shot List

1. The empty planner form with city and taste inputs.
2. A populated form showing the selected city and favorites.
3. Live Qloo results showing the three-stop trail and its place details.
4. A second trail after requesting another set.
5. The preview-mode label, if demonstrating the no-key fallback.

No screenshots have been captured yet.

## Submission Readiness Notes

- The live Qloo API path has passed a direct server-side smoke check.
- The project has an MIT license and local run instructions.
- The hackathon requires a functional, externally hosted demo and a public source repository. Both links remain TODO, so the project is not ready to submit.
- A Devpost project exists as an unpublished `Untitled` pre-draft for this hackathon; it has no title, description, public slug, or submitted timestamp. TasteTrail has not been synced to it.
- Required Devpost form fields include the project start date, public demo URL, and public repository URL. Confirm the exact start date before using it.
- Qloo’s official requirements say a demo video is not required.

## Known Limitations

- The app currently presents Qloo results in a short itinerary format; it does not yet use an LLM or an autonomous multi-step agent framework.
- The `occasion` choice is captured by the interface but is not currently used to alter the Qloo query.
- The UI copy describes a concise three-stop outing, but the current result cards should be reviewed against live API data for useful names, addresses, and links.
- The app has not yet been run end-to-end through a browser against the local server, externally hosted, or tested across multiple cities and taste inputs.
- No public repository, public demo URL, or screenshots are available yet.

## TODO Official Form Fields

- **When did you begin your project?** October 5, 2026 is the earliest recorded Devpost project-draft date; confirm the actual project start date before submission.
- **The public URL to your project:** TODO — requires external hosting.
- **Link to your PUBLIC code repo:** TODO — requires a public repository.
- **Existing-project upgrade question:** Not applicable; TasteTrail was built for this Qloo hackathon.
