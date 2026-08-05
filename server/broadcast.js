// Simple SSE broadcaster
const clients = new Set();

function registerClient(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders && res.flushHeaders();
  res.write('\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function broadcastEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (e) { clients.delete(res); }
  }
}

module.exports = { registerClient, broadcastEvent };