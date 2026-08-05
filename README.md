# Remake: Crisis24-style Warroom

This project contains a full-stack remake of the Warroom UI and backend.

Structure:
- backend/ - Express API, feed poller (Postgres), SSE endpoint
- frontend/ - React + Vite UI with Leaflet map

Quick local run (docker):
- Copy backend/.env.example to backend/.env and edit (DATABASE_URL, FEEDS)
- From repo root: docker-compose up --build
- Open http://localhost:3000

Deploy:
- Recommended: Render (connect your GitHub repo to Render and create a Web Service from branch `remake-crisis24`). Set DATABASE_URL and FEEDS env vars in Render.

