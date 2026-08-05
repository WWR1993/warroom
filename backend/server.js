const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const RSSParser = require('rss-parser');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const parser = new RSSParser();
const app = express();

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 60) * 1000;
const FEEDS_RAW = process.env.FEEDS || '';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.PG_CONN || 'postgres://warroom:warroom@localhost:5432/warroom' });

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

function normalizeFeedList(raw) {
  if (!raw) return [];
  return raw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).map(s => {
    const parts = s.split('|').map(p => p.trim());
    return { url: parts[0], source: parts[1] || parts[0] };
  });
}

function severityFromText(text) {
  if (!text) return 2;
  const t = text.toLowerCase();
  if (t.match(/death|killed|massive|catastroph|fatal/)) return 5;
  if (t.match(/outage|explosion|fire|attack|evacu/)) return 4;
  if (t.match(/disrupt|downtime|leak|compromis/)) return 3;
  return 2;
}

async function upsertEvent(ev) {
  const sql = `INSERT INTO events (id,title,link,severity,lat,lon,source,timestamp,summary)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO NOTHING`;
  const vals = [ev.id, ev.title, ev.link, ev.severity, ev.lat, ev.lon, ev.source, ev.timestamp, ev.summary];
  try { await pool.query(sql, vals); } catch (e) { console.warn('upsert', e.message); }
}

// SSE clients
const clients = new Set();
app.get('/events', (req, res) => {
  res.set({ Connection: 'keep-alive', 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream' });
  res.flushHeaders();
  res.write('\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
function broadcast(ev) { const payload = `data: ${JSON.stringify(ev)}\n\n`; for (const r of clients) { try { r.write(payload); } catch (e) { clients.delete(r); } } }

app.get('/api/events', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 5000);
    const rows = await pool.query('SELECT * FROM events ORDER BY timestamp DESC LIMIT $1', [limit]);
    res.json(rows.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal' }); }
});

app.get('/api/sources', async (req, res) => {
  try {
    const rows = await pool.query('SELECT DISTINCT source FROM events ORDER BY source');
    res.json(rows.rows.map(r => r.source));
  } catch (err) { res.status(500).json({ error: 'internal' }); }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// serve static if frontend built in ../frontend/dist
const path = require('path');
const staticDir = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(staticDir));
app.get('/', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));

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
      let feed = null;
      try { feed = await parser.parseURL(f.url); } catch (e) { feed = null; }
      if (feed && Array.isArray(feed.items)) {
        for (const item of feed.items.slice(0, 200)) {
          const id = item.guid || item.id || item.link || (f.url + '|' + (item.title||'')).slice(0,255);
          const title = item.title || '';
          const summary = item.contentSnippet || item.content || item.summary || '';
          const severity = severityFromText(title + ' ' + summary);
          let lat = null, lon = null;
          if (item.lat && item.lon) { lat = Number(item.lat); lon = Number(item.lon); }
          if (item['georss:point']) { const [a,b] = item['georss:point'].split(/\s+/); lat = Number(a); lon = Number(b); }
          const timestamp = item.isoDate || item.pubDate || new Date().toISOString();
          const ev = { id: String(id), title, link: item.link || '', severity, lat, lon, source: f.source, timestamp, summary };
          await upsertEvent(ev);
          broadcast(ev);
        }
      } else {
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
        } catch (e) {}
      }
    } catch (err) { console.warn('Feed fetch failed', f.url, err.message); }
  }
}

setInterval(() => { fetchFeedsOnce().catch(e => console.warn('poll err', e)); }, POLL_INTERVAL);

(async () => {
  try { await initDb(); console.log('DB ready'); await fetchFeedsOnce(); console.log('Initial fetch done'); } catch (e) { console.error('startup', e); process.exit(1); }
})();

app.listen(PORT, () => console.log(`Warroom backend listening on ${PORT}`));
