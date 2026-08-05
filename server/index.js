const express = require('express');
const path = require('path');
const cors = require('cors');
const { startAggregator, getRecentEvents } = require('./aggregator');
const { registerClient, broadcastEvent } = require('./broadcast');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend (index.html at project root)
app.use(express.static(path.join(__dirname, '..')));

// SSE endpoint
app.get('/events', (req, res) => {
  registerClient(req, res);
});

// Simple API to read recent events
app.get('/api/events', (req, res) => {
  res.json(getRecentEvents());
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  // start aggregator after server up
  startAggregator(broadcastEvent).catch(err => console.error('Aggregator failed', err));
});
