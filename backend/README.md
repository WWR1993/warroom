# Warroom backend

This directory contains a production-ready backend for the Warroom frontend. It:

- Aggregates RSS/JSON feeds on a configurable interval
- Stores events in Postgres
- Serves /api/events (recent events JSON)
- Serves /events (Server-Sent Events) for realtime updates
- Serves static files from ./public so you can host the frontend from the same domain

Files added:
- backend/server.js - main app
- backend/package.json - dependencies
- backend/Dockerfile - container image
- docker-compose.yml - local dev (app + postgres)
- backend/.env.example - environment variables
- backend/public/index.html - copy of your frontend so it serves from the backend root

Important: Configure DATABASE_URL before running in production.

Quick local run (recommended for testing):

1. Copy `.env.example` to `.env` and edit values.
2. With Docker installed:
   - docker-compose up --build
   - Visit http://localhost:3000 to see the frontend (it will use the running backend for /api/events and /events)

Deploy:
- Deploy the backend service to a container host (Render, Railway, DigitalOcean App Platform, AWS ECS/Fargate).
- Ensure a Postgres add-on is configured and DATABASE_URL is set.
- The easiest path is to deploy the repo to Render (connect GitHub) and set env vars in the Render dashboard.

FEEDS format (in .env):
- Comma or newline separated list. Each entry can be `url` or `url|SOURCENAME`.
- Example:
  https://example.com/incidents.rss|ExampleFeed
  https://example.com/incidents.json|JSONFeed

Notes on production hardening (do these before high traffic):
- Use connection pooling and retries for DB
- Add auth or admin endpoints for feed management
- Add rate limiting, logging, and monitoring
- Review OSINT/legal requirements for source content

