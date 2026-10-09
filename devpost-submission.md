# Common Table

## One-line Summary

A fair lunch shortlist shaped by everyone’s taste: Common Table intersects each diner’s separate Qloo restaurant results, then ranks the shared places by the harmonic mean of individual affinity.

## Problem

Choosing a team lunch spot is a recurring group decision. A nearby-popular list does not account for what each person likes, and a group chat can favor whoever suggests the first place. Common Table makes the group constraint explicit: a venue must appear in every diner’s own Qloo results, and the individual fit for each person stays visible.

## Solution

Two to four people enter a city, named cultural favorites, and optional dining preferences. Qloo resolves the favorites and runs a separate restaurant recommendation for each person. Common Table keeps only restaurant entities returned for everyone, then ranks that shared set by harmonic mean so a very high affinity for one diner cannot conceal a weaker fit for another.

Each pick shows the individual Qloo affinity scores, the lowest individual fit, matched taste signals and useful Qloo tags when available. Map actions search the exact venue name and address. A table can be remembered locally on one device, and the same planner is available through an MCP tool for AI assistants.

## Why This Matters

The first audience is the person organizing a recurring team lunch. Common Table turns the usual back-and-forth into an inspectable shortlist where every diner’s contribution is represented. It is designed for repeat use: keep a regular table on one device, refresh the shared picks, and open the exact map search. The app does not claim a venue is open, bookable, or suitable for a dietary need; diners should verify those details with the restaurant.

## How We Used AI

Qloo Taste AI supplies the restaurant recommendations and affinity evidence. Common Table resolves each diner’s cultural anchors with Qloo Search, calls Qloo Insights separately for each person with restaurant and locality filters, intersects the returned Qloo restaurant entity IDs, and ranks the common results using Qloo affinities and explainability data. The app does not generate venue facts or label generated text as Qloo output.

Groq is an optional, narrow recovery step for an unresolved taste name. It is used only when the user checks **“Allow Groq to help with an unmatched favorite”** and Qloo has not resolved another named anchor for that diner. The server sends Groq only the unresolved favorite text—not the city or table member names—and requests at most one possible full entity name per input. Qloo must then find an exact match. Common Table shows the original and Qloo-matched name to the user; only after the user chooses **“Use this name”** does the app apply it and run the plan. If the user does not opt in, Groq is not called. Groq does not choose restaurants, score tastes, or silently change a preference, and it cannot prevent Qloo rate limits or guarantee recommendations.

The production web app exposes `find_shared_lunch` at `https://tastetrail-qloo-hackathon.vercel.app/api/mcp` as a Model Context Protocol Streamable HTTP tool. The web UI and MCP tool share the Qloo-backed planner.

## How We Used Codex

Codex helped reshape the initial solo night-out concept into a recurring group-lunch product; implement the per-person Qloo workflow, balanced ranking, and MCP endpoint; refine the interface and venue links; add the optional, consent-based Groq name-recovery flow; and run fixture-backed and live end-to-end checks. The Qloo recommendation and ranking logic remains explicit server code.

## Key Features

1. Supports two to four diners, city or neighborhood suggestions, named taste anchors, and optional dining preferences.
2. Resolves cultural anchors through Qloo Search and makes an independent Qloo restaurant recommendation request for each diner.
3. Includes a venue only when the same Qloo restaurant entity appears in every diner’s results.
4. Ranks the shared set with the harmonic mean of individual Qloo affinities and shows each diner’s score and the lowest individual fit.
5. Shows matched taste signals and relevant Qloo venue tags when returned; affinity is a model score, not a probability.
6. Lets diners request another set without current picks and opens name-and-address-based Google Maps searches.
7. Remembers an optional table profile in browser storage on the same device, without an account.
8. Offers Groq-assisted name recovery only after an explicit opt-in; Qloo verification and a second user approval are required before the suggested name is used.
9. Exposes the shared planner as the `find_shared_lunch` MCP tool.

## Architecture

- Dependency-free Node.js server with a responsive HTML, CSS, and browser JavaScript interface.
- Server-side Qloo Search and per-diner `/v2/insights` requests with restaurant, locality, and explainability filters.
- A server-side `GROQ_API_KEY` enables optional Groq name suggestions. The default model is `openai/gpt-oss-20b`; `GROQ_MODEL` can override it. Neither key is sent to browser code.
- MCP Streamable HTTP endpoint implements `initialize`, `ping`, `tools/list`, and `tools/call` for `find_shared_lunch`.
- MIT-licensed public source repository.

## Testing Instructions

Use Node.js 20 or newer. Copy `.env.example` to `.env`, set the private `QLOO_API_KEY`, and run:

```sh
npm start
```

Open `http://localhost:3000`. Add at least two diners, a city, and at least one named cultural anchor for each person. The results should contain only restaurants present in each diner’s separate Qloo result set, show individual affinity scores, and provide a Google Maps search using each venue’s name and address. Dining preferences that Qloo cannot resolve are shown as unverified rather than presented as verified facts.

To exercise the optional Groq path, also set `GROQ_API_KEY` in the server-side `.env`. Leave the consent checkbox unchecked to confirm the app does not call Groq. For the opt-in path, check it and use an anchor that Qloo cannot resolve for that diner when no other anchor for that diner resolves. If Groq proposes a name, verify that the screen shows the original and the exact Qloo-matched name; choose **“Use this name”** to approve it and continue the plan. No candidate should be applied without that action. Groq is optional: without its key or consent, standard Qloo planning still works.

Run the automated tests and syntax checks with:

```sh
npm test
node --check server.js
node --check app.js
git diff --check
```

A direct web API plan uses `POST /api/plan`:

```json
{
  "city": "Bengaluru",
  "participants": [
    { "name": "You", "favorites": ["Virat Kohli"] },
    { "name": "Taylor", "favorites": ["Taylor Swift"] }
  ],
  "allowGroqAssist": false
}
```

The hosted web demo is https://tastetrail-qloo-hackathon.vercel.app/ and the hosted MCP endpoint is https://tastetrail-qloo-hackathon.vercel.app/api/mcp.

### Production smoke check — October 9, 2026

- The prior live Qloo smoke check returned a three-place shared shortlist for Bengaluru with different taste anchors, separate affinities, and map searches based on each venue’s name and address.
- The deployed Groq-assisted flow was exercised with an unmatched favorite: Groq proposed “Virat Kohli,” Qloo returned an exact match, and the user approved it before the normal shared plan ran. The resulting page showed three places and both diners’ affinity rows.
- Automated fixture tests cover the opt-in path, Qloo verification, omission of city and table-member names from the Groq request, and the no-Groq-call opt-out path.
- The MCP endpoint’s `initialize` response and `tools/list` exposure of `find_shared_lunch` were previously verified.
- These are point-in-time checks. Qloo’s catalog, API availability, rate limits, and rankings can change; the checks do not establish reliability for every city or taste profile.

## Public Demo Link

- https://tastetrail-qloo-hackathon.vercel.app/

## Public Repository Link

- https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- License: MIT

## Demo Video

No demo-video file or URL is in the local project materials. The current signed-in project-details form showed a video link field without a required marker. If adding a short video, show the problem, the two-diner flow, the consent and Qloo verification step, the shared results, and the MCP tool.

### 50-second demo outline

- **0–5 sec:** “Team lunch is a group decision, but nearby lists rarely show whether a place fits everyone.”
- **5–15 sec:** Set Bengaluru, add one taste anchor per diner, and find the shared shortlist.
- **15–28 sec:** Show that each venue appeared in both separate Qloo result sets; point to each diner’s affinity and the lowest individual fit.
- **28–38 sec:** Explain the harmonic-mean ranking and open a Maps search for a venue’s exact name and address.
- **38–46 sec:** Show the unchecked Groq consent control, then the Qloo-verified name review. Explain that a name is used only after the user approves it.
- **46–50 sec:** Show the `find_shared_lunch` MCP tool and close: “The same group decision is available to an assistant.”

## Screenshot Shot List

Fresh screenshots captured from the production site on October 9, 2026. The plan and name-review flows use generic diner labels; only the public favorite alias “Kohli” was used in the opt-in Groq check.

1. `screenshots/common-table-home-latest.jpg` — current landing page and top of the planner.
2. `screenshots/common-table-planner-groq-latest.jpg` — current planner with the Groq consent control unchecked and the privacy explanation visible.
3. `screenshots/common-table-groq-review-latest.jpg` — after opt-in, Groq’s candidate is displayed only after Qloo verifies an exact match; the user must still approve it.
4. `screenshots/common-table-how-it-works-latest.jpg` — current “How it works” section.
5. `screenshots/common-table-live-results-latest.jpg` — fresh live Qloo shared picks with generic diner labels, individual affinities, and the ranking explanation.


## Submission Readiness Notes

- On October 9, 2026, the signed-in Devpost editor was used to update the public story, tagline, Built With tags, gallery, and existing-project upgrade answer. The project remained marked **Submitted** after saving.
- The public page now includes the optional, consent-based Groq name-recovery flow and five current production screenshots. Its existing gallery image was retained.
- Current Devpost form fields were checked in the signed-in editor: project name and elevator pitch; project story, Built With, links, gallery, and a video-link field; submission date, public demo URL, public repository URL, and an optional existing-project upgrade answer. No separate test, “How it works,” or Codex-session-ID field appeared.
- The Devpost connector returned `-32603: Internal error` for account and read-only event calls, but the signed-in browser editor worked. The current live form and public project page were verified there.

## Known Limitations

- Restaurant results and city suggestions depend on Qloo’s current catalog, API availability, and rate limits.
- Groq only suggests a possible full entity name; Qloo must verify it and the user must approve it. This narrow assist does not make arbitrary or irrelevant taste inputs resolvable.
- The app does not verify opening hours, current menus, reservations, dietary suitability, or ambience.
- Production checks cover a small number of profiles and locations, not broad ranking quality or reliability.

## Submission Form Notes

- Project start date: October 6, 2026.
- Demo URL: https://tastetrail-qloo-hackathon.vercel.app/
- Repository URL: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon
- Existing-project upgrade answer (saved, 254 characters): Rebuilt solo TasteTrail into Common Table: separate Qloo reads for 2–4 diners, shared restaurant matching, balanced affinity ranking, explainable picks, and an MCP tool. Optional Groq name help requires opt-in, exact Qloo verification, and user approval.
- Do not state that Groq generates recommendations. It only proposes a possible name for user-approved Qloo matching.

## Post-submission

The existing submission remains marked **Submitted** at https://devpost.com/software/tastetrail. Edits were saved through the browser editor and appeared on the public page; the finalization page continued to show “Project submitted!” No duplicate submission was created.
