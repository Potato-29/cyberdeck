// Work log — one backend, two clients.
//
// The Work tab and the ESP32 desk device are both just things that POST here.
// Runs in Termux (node v26) under tmux, exposed as work.prayas.space through
// the Cloudflare Tunnel. NOT in proot: proot's $HOME is /root, so ~/cyberdeck
// there is a different, stale checkout.
//
//   tmux new-session -d -s worklog 'node ~/cyberdeck/work-log-tool/server.js'

require('./lib/env');   // must come first: everything below reads config at require time

const path = require('node:path');
const express = require('express');

const { requireToken } = require('./lib/auth');
const contextsRouter = require('./routes/contexts');
const notesRouter = require('./routes/notes');
const { search } = require('./controllers/search.controller');
const friday = require('./controllers/friday.controller');
const { getToday } = require('./controllers/contexts.controller');

const app = express();
const PORT = Number(process.env.WORKLOG_PORT || process.env.PORT || 2127);

// Only claims application/json, so a streamed audio/* body falls through to the
// notes controller untouched. Deliberately no express.raw(): it would buffer the
// whole body and defeat the point of streaming from a device with ~4s of heap.
app.use(express.json({ limit: '1mb' }));

// Unauthenticated, so the deck's status checker can probe it.
app.get('/health', (req, res) => res.json({ ok: true, service: 'worklog' }));

// Express 5 rejects '/api/*' — path-to-regexp v8 needs a named wildcard. The
// bare prefix is what mounts middleware across the whole subtree anyway.
app.use('/api', requireToken);

app.use('/api/contexts', contextsRouter);
app.use('/api/notes', notesRouter);
app.get('/api/search', search);
app.get('/api/today', getToday);
app.get('/api/friday/draft', friday.draft);
app.post('/api/friday/approve', friday.approve);

// The page is served behind ?token= and re-sends that token for every API call
// from its own URL, so no secret is ever baked into the markup.
app.get('/work', requireToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'work.html'));
});
app.get('/', (req, res) => res.redirect('/work'));

// JSON, not Express 5's HTML error page — both clients here speak JSON only.
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
    console.log(`[worklog] ${req.method} ${req.path}: ${err.stack || err.message}`);
    if (res.headersSent) return next(err);
    return res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[worklog] listening on ${PORT}`);
});
