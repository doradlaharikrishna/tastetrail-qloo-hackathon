# TasteTrail

TasteTrail is a taste-aware local discovery agent for the Qloo Agentic Hackathon. It resolves a few cultural favorites with Qloo search, then asks Qloo Insights to rank nearby places using those taste signals and the selected city. Users can ask the planner for another trail while excluding the current picks.

## Current status

The app includes a dependency-free Node server, a container deployment for Vercel, a public hosted demo, and a sample preview mode. When `QLOO_API_KEY` is set on the server, TasteTrail uses the Qloo Hackathon API. The API key is never sent to browser code.

Never put the Qloo API key in browser JavaScript or commit it to this public repository. Keep it in a server-side environment variable.

## Run locally

Use Node.js 20 or later. Copy `.env.example` to `.env`, put the key after `QLOO_API_KEY=`, then start the app:

```sh
cp .env.example .env
# add your private key to .env
npm start
```

Then open `http://localhost:3000`. `.env` is git-ignored and hidden files are not served by the app. Without the key, the app remains in preview mode. The page uses remote Google Fonts when online and falls back to system fonts otherwise.

## Vercel deployment

The production deployment runs the Node server in `Dockerfile.vercel`; it serves the interface and the live trail endpoint. The `api/` folder also contains Vercel function handlers. `QLOO_API_KEY` is stored as a sensitive Vercel environment variable. Never add the key to source control.

## Before hackathon submission

- Public demo: https://tastetrail-qloo-hackathon.vercel.app/
- Public source: https://github.com/doradlaharikrishna/tastetrail-qloo-hackathon (MIT license).
- For local verification, run `npm start`, open `http://localhost:3000`, enter a city and one or more favorites, and create a trail. The hosted demo is configured for live Qloo results.
- Confirm the recommendations, project description, and testing instructions match the working app.

## License

MIT. See `LICENSE`.
