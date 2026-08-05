const fetch = require('node-fetch');
const Parser = require('rss-parser');
const parser = new Parser();

// In-memory store for demo. Replace with DB/Redis in production.
const RECENT = []; // newest first, capped
const SEEN = new Set();

function normalizeEvent({ id, title, link, summary, timestamp, source, severity, lat, lon, raw }) {
  return { id, title, link, summary, timestamp, source, severity: severity||2, lat, lon, raw };
}

function pushEvent(ev, broadcast) {
  const key = ev.id || (ev.link||'') + '|' + (ev.title||'');
  if (SEEN.has(key)) return false;
  SEEN.add(key);
  RECENT.unshift(ev);
  if (RECENT.length > 500) RECENT.pop();
  // broadcast to SSE clients
  if (broadcast) broadcast(ev);
  return true;
}

async function fetchUSGS(broadcast) {
  // USGS significant earthquakes feed (past hour/day depending)
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson';
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    (json.features||[]).forEach(f => {
      const props = f.properties || {};
      const coords = (f.geometry && f.geometry.coordinates) || [];
      const ev = normalizeEvent({
        id: f.id,
        title: `Earthquake M${props.mag} - ${props.place}`,
        link: props.url,
        summary: props.title || props.detail || '',
        timestamp: new Date(props.time).toISOString(),
        source: 'USGS Earthquake',
        severity: props.mag >= 6 ? 5 : (props.mag >= 4 ? 3 : 2),
        lat: coords[1], lon: coords[0],
        raw: f
      });
      pushEvent(ev, broadcast);
    });
  } catch (e) { console.error('USGS fetch', e); }
}

async function fetchReliefWeb(broadcast) {
  // ReliefWeb RSS (humanitarian)
  const url = 'https://reliefweb.int/updates/rss.xml';
  try {
    const feed = await parser.parseURL(url);
    const sourceTitle = (feed && feed.title) || 'ReliefWeb';
    (feed.items || []).slice(0,25).forEach(item => {
      const ev = normalizeEvent({
        id: item.guid || item.link || item.title,
        title: item.title,
        link: item.link,
        summary: item.contentSnippet || item.content || item.description || '',
        timestamp: item.isoDate || item.pubDate || new Date().toISOString(),
        source: sourceTitle,
        severity: 2,
        lat: null, lon: null,
        raw: item
      });
      pushEvent(ev, broadcast);
    });
  } catch (e) { console.error('ReliefWeb fetch', e); }
}

async function fetchNOAA(broadcast) {
  // NOAA active alerts (US). GeoJSON-like
  const url = 'https://api.weather.gov/alerts/active';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'warroom-demo/1.0' } });
    if (!res.ok) return;
    const json = await res.json();
    (json.features||[]).slice(0,50).forEach(f => {
      const props = f.properties || {};
      const ev = normalizeEvent({
        id: f.id || props.id || props.@id,
        title: props.headline || props.event || 'Weather Alert',
        link: props.uri || props.@id || '',
        summary: props.description || props.instruction || '',
        timestamp: props.sent || new Date().toISOString(),
        source: 'NOAA/NWS',
        severity: props.severity === 'Severe' ? 4 : 2,
        lat: null, lon: null,
        raw: f
      });
      pushEvent(ev, broadcast);
    });
  } catch (e) { console.error('NOAA fetch', e); }
}

async function fetchUSStateDept(broadcast) {
  // Example travel advisories RSS (US State Dept)
  const url = 'https://travel.state.gov/_res/rss/TWs.xml';
  try {
    const feed = await parser.parseURL(url);
    const src = (feed && feed.title) || 'Travel Advisories';
    (feed.items || []).slice(0,30).forEach(item => {
      const ev = normalizeEvent({
        id: item.guid || item.link || item.title,
        title: item.title,
        link: item.link,
        summary: item.contentSnippet || item.description || '',
        timestamp: item.isoDate || item.pubDate || new Date().toISOString(),
        source: src,
        severity: 2,
        lat: null, lon: null,
        raw: item
      });
      pushEvent(ev, broadcast);
    });
  } catch (e) { console.error('State Dept fetch', e); }
}

let polling = false;

async function pollAll(broadcast) {
  await Promise.all([
    fetchUSGS(broadcast),
    fetchReliefWeb(broadcast),
    fetchNOAA(broadcast),
    fetchUSStateDept(broadcast)
  ]);
}

async function startAggregator(broadcast) {
  if (polling) return;
  polling = true;
  // Run immediately
  await pollAll(broadcast);
  // Poll every 60s
  setInterval(() => pollAll(broadcast), 60 * 1000);
}

function getRecentEvents() { return RECENT.slice(0,200); }

module.exports = { startAggregator, getRecentEvents };
