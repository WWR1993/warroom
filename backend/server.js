const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const RSSParser = require('rss-parser');
const fetch = require('node-fetch');
const path = require('path');
const helmet = require('helmet');

const parser = new RSSParser();
const app = express();

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 60) * 1000; // seconds -> ms
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const FEEDS_RAW = process.env.FEEDS || ''; // comma or newline separated list: url|source or url

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

// Postgres pool using DATABASE_URL env
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT,
      link TEXT,
      severity INTEGER DEFAULT 2,
      lat DOUBLE PRECISION,
      lon DOUBLE PRECISION,
      source TEXT,
      timestamp TIMESTAMP WITH TIME ZONE,
      summary TEXT,
      inserted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC);');
}

// SSE clients
const clients = new Set();

app.get('/events', (req, res) => {
  res.set({
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
  });
  res.flushHeaders();
  res.write('\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcast(ev) {
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (e) { clients.delete(res); }
  }
}

// API: recent events
app.get('/api/events', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 5000);
    const rows = await pool.query('SELECT * FROM events ORDER BY timestamp DESC LIMIT $1', [limit]);
    res.json(rows.rows);
  } catch (err) {
    console.error('API error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Serve static frontend (if present)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// Simple severity heuristics
function severityFromText(text) {
  if (!text) return 2;
  const t = text.toLowerCase();
  if (t.includes('death') || t.includes('killed') || t.includes('massive') || t.includes('catastrophe') || t.includes('fatal')) return 5;
  if (t.includes('outage') || t.includes('explosion') || t.includes('fire') || t.includes('attack') || t.includes('evacu')) return 4;
  if (t.includes('disrupt') || t.includes('downtime') || t.includes('leak') || t.includes('compromis')) return 3;
  return 2;
}

function normalizeFeedList(raw) {
  if (!raw) return [];
  return raw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).map(s => {
    const parts = s.split('|').map(p => p.trim());
    return { url: parts[0], source: parts[1] || parts[0] };
  });
}

async function upsertEvent(ev) {
  const sql = `INSERT INTO events (id, title, link, severity, lat, lon, source, timestamp, summary)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO NOTHING`;
  const vals = [ev.id, ev.title, ev.link, ev.severity, ev.lat, ev.lon, ev.source, ev.timestamp, ev.summary];
  try {
    await pool.query(sql, vals);
  } catch (err) {
    console.warn('Upsert error', err.message);
  }
}

async function fetchJsonArray(url) {
  const res = await fetch(url, { timeout: 10000 });
  if (!res.ok) throw new Error('bad');
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  throw new Error('not-json');
}

async function fetchFeedsOnce() {
  const feeds = normalizeFeedList(FEEDS_RAW);
  for (const f of feeds) {
    try {
      // try RSS parser first
      let feed;
      try { feed = await parser.parseURL(f.url); }
      catch (e) { feed = null; }

      if (feed && Array.isArray(feed.items)) {
        for (const item of feed.items.slice(0, 200)) {
          const id = item.guid || item.id || item.link || (f.url + '|' + (item.title||'')).slice(0,255);
          const title = item.title || '';
          const summary = item.contentSnippet || item.content || item.summary || '';
          const severity = severityFromText(title + ' ' + summary);
          // attempt to parse lat/lon if present as georss:point or custom fields
          let lat = null, lon = null;
          if (item.lat && item.lon) { lat = Number(item.lat); lon = Number(item.lon); }
          if (item['georss:point']) {
            const [a,b] = item['georss:point'].split(/\s+/); lat = Number(a); lon = Number(b);
          }
          const timestamp = item.isoDate || item.pubDate || new Date().toISOString();
          const ev = { id: String(id), title, link: item.link || '', severity, lat, lon, source: f.source, timestamp, summary };
          await upsertEvent(ev);
          broadcast(ev);
        }
      } else {
        // try JSON feed returning array
        try {
          const arr = await fetchJsonArray(f.url);
          if (Array.isArray(arr)) {
            for (const item of arr.slice(0,200)) {
              const id = item.id || item.guid || item.link || (f.url + '|' + (item.title||'')).slice(0,255);
              const title = item.title || item.name || '';
              const summary = item.summary || item.description || item.body || '';
              const severity = severityFromText(title + ' ' + summary);
              const lat = item.lat || item.latitude || null;
              const lon = item.lon || item.longitude || null;
              const timestamp = item.timestamp || item.time || item.published || new Date().toISOString();
              const ev = { id: String(id), title, link: item.link || item.url || '', severity, lat, lon, source: f.source, timestamp, summary };
              await upsertEvent(ev);
              broadcast(ev);
            }
          }
        } catch (e) {
          // not JSON - ignore
        }
      }
    } catch (err) {
      console.warn('Feed fetch failed', f.url, err.message);
    }
  }
}

// Start polling
setInterval(() => {
  fetchFeedsOnce().catch(err => console.warn('poll err', err));
}, POLL_INTERVAL);

// initial run
(async () => {
  try {
    await initDb();
    await fetchFeedsOnce();
    console.log('Initialized DB and fetched feeds');
  } catch (err) {
    console.error('Startup failed', err);
    process.exit(1);
  }
})();

// Start server
app.listen(PORT, () => console.log(`Warroom backend listening on ${PORT}`));
