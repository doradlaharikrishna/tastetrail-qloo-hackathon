# TasteTrail

## One-line Summary

Turn a few cultural favorites and a city into a Qloo-powered, personalized three-stop local outing.

## Problem

Choosing where to go often means stitching together generic search results that do not reflect what a person actually enjoys. Someone who likes particular music, films, or places needs recommendations grounded in those tastes, not just popularity or keywords.

## Solution

TasteTrail is a taste-aware local-discovery planner. A person enters a city and up to four cultural favorites. The server searches Qloo for matching artists, films, or places, selects the closest name match, sends those entity IDs and the city to Qloo Insights with strict locality filtering, and presents up to three recommended places. “Try another trail” excludes the previous results and requests another set.

The recommendation workflow is exposed as a simple HTTP endpoint that another assistant can call: provide a city and cultural signals, and it resolves those signals before requesting Qloo-ranked places. The Qloo taste graph is the core of the matching step; the app uses returned place recommendations rather than inventing them with generic text.

## Why This Matters

Local discovery is more useful when it reflects a person’s cultural interests. TasteTrail demonstrates a direct path from familiar artists, films, or places to a city-specific outing, with Qloo supplying the taste-based ranking.

## How We Used AI

TasteTrail uses Qloo Taste AI through two live API stages: it resolves each supplied favorite through `/search`, then requests place recommendations from `/v2/insights` using the matched entity IDs and the selected city. The server returns Qloo’s place results to the interface. It does not claim to use an LLM; the recommendation intelligence in this build comes from Qloo.

## How We Used Codex

Codex helped create the responsive web interface, the Node.js server, the server-side Qloo integration, deployment setup, and usage documentation. It checked the live Qloo search candidates, improved entity matching so an exact artist name outranks a longer venue name, and verified the local end-to-end API path. The public hosted app was also exercised in a browser and returned live Qloo results. The Qloo key remains a server-side environment variable.

## Key Features

- Enter a city and up to four artists, films, or places as taste signals.
- Resolve taste signals with Qloo Search, preferring the closest name match across artist, movie, and place entities.
- Request strictly city-bounded place recommendations from Qloo Insights through a workflow callable by an assistant.
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

Verified so far: `node --check` passes for the server, browser script, and endpoint handlers. A local end-to-end request using the configured key returned HTTP 200 in live mode; “Taylor Swift” resolved to the exact artist, and the strict Brooklyn locality filter returned three Brooklyn results. The public hosted browser flow returned live Qloo results.

## Public Demo Link

https://tastetrail-qloo-hackathon.vercel.app/ — public hosted demo; it reports live Qloo mode and returns recommendations.

## Public Repository Link

https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon — public GitHub repository. `.env` was excluded from the published files. The project includes an MIT `LICENSE` file.

## Demo Video

Not required by the Qloo Agentic Hackathon. Optional short outline: state the local-discovery problem; enter a city and cultural favorites; show the Qloo-powered trail; request another trail; briefly show the server-side Qloo integration and secret-handling approach.

## Screenshot Shot List

1. [Planner form](screenshots/planner-form.jpg).
2. [First live Brooklyn trail](screenshots/live-brooklyn-trail.jpg).
3. [Alternate live trail](screenshots/alternate-live-trail.jpg), returned after excluding the first set.

These three screenshots were captured from the public hosted app and are included in the public repository. The event does not require a demo video.

## Submission Readiness Notes

- The local live API path and public hosted browser flow have both returned Qloo results.
- The project has an MIT license and local run instructions.
- The public source repository is available at https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon.
- Public demo: https://tastetrail-qloo-hackathon.vercel.app/.
- A Devpost project exists as an unpublished `Untitled` pre-draft for this hackathon; it has no title, description, public slug, or submitted timestamp. TasteTrail has not been synced to it.
- Required Devpost form fields include the project start date, public demo URL, and public repository URL. Confirm the exact start date before using it.
- Qloo’s official requirements say a demo video is not required.

## Known Limitations

- The app currently presents Qloo results in a short itinerary format; it does not yet use an LLM or an autonomous multi-step agent framework.
- The `occasion` choice is captured by the interface but is not currently used to alter the Qloo query.
- The UI copy describes a concise three-stop outing, but the current result cards should be reviewed against live API data for useful names, addresses, and links.
- The hosted app was verified with one city and one artist; more combinations and cities need review.
- Qloo-ranked results can still vary in how directly they fit a night-out theme; the prototype displays Qloo's returned places without an additional editorial relevance filter.
- Upload the three included screenshots to the Devpost project gallery if the form offers a gallery section.

## TODO Official Form Fields

- **When did you begin your project?** October 5, 2026 is the earliest recorded Devpost project-draft date; confirm the actual project start date before submission.
- **The public URL to your project:** https://tastetrail-qloo-hackathon.vercel.app/
- **Link to your PUBLIC code repo:** https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- **Existing-project upgrade question:** Not applicable; TasteTrail was built for this Qloo hackathon.
