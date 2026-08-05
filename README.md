# warroom

This branch adds a simple server-side aggregator and SSE broadcaster so the frontend can display live events on a map and in a feed.

What's included
- index.html (updated frontend with Leaflet map, SSE client, feed UI)
- server/index.js (Express app serving static files, /api/events and /events SSE)
- server/aggregator.js (polls several public feeds: USGS, ReliefWeb, NOAA, State Dept RSS)
- server/broadcast.js (SSE client registry and broadcaster)
- package.json, .env.example

Quick start (local)
1. Checkout branch enhanced-intel-aggregator
   git clone https://github.com/WWR1993/warroom.git
   cd warroom
   git checkout enhanced-intel-aggregator

2. Install
   npm install

3. Run
   cp .env.example .env
   npm run start

4. Open in browser
   http://localhost:3000/

Notes
- This is a demo. Aggregation is in-memory. For production, replace in-memory stores with a DB (Postgres/Timescale) and Redis for dedupe and broadcast persistence.
- Add API keys and providers for richer data (OpenWeatherMap, Mapbox, premium OSINT feeds).
- Sanitize content and respect source TOS.

Next steps you can ask me to do
- Add Redis-backed dedupe and persistence
- Add a WebSocket option alongside SSE
- Add geocoding for textual locations
- Harden polling with rate-limits and backoff
- Open a PR with these changes (I already created the branch)
