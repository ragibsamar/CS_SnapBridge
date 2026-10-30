/* ==========================================================
   CyberShop SnapBridge: server.js
   Tiny zero-dependency Node.js server (Node 18+).
     - serves index.html, theme.css, app.js, transport.js, flatscan.js
     - signalling for pairing/WebRTC via Server-Sent Events (GET /events) and POST /emit, /presence
     - /relay: in-memory fallback for files when a direct link cannot be made
   Files never pass through the server unless the relay fallback is used.
   Run:  node server.js     (PORT=4000 node server.js to change the port)
   ========================================================== */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/theme.css': 'theme.css', '/app.js': 'app.js', '/transport.js': 'transport.js', '/flatscan.js': 'flatscan.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const MAX_RELAY = 500 * 1024 * 1024, RELAY_TTL = 10 * 60 * 1000;

const rooms = new Map();   // code -> Map(id -> {res, presence})
const blobs = new Map();   // id -> {buf, type, timer}

const lanUrls = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > MAX_RELAY) { no(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', no);
});
const send = (client, event, data) => client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const broadcastPeers = room => { const list = [...room].map(([peer, c]) => ({ peer, presence: c.presence })); room.forEach(c => send(c, 'peers', list)); };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  const code = u.searchParams.get('room') || '', id = u.searchParams.get('id') || '';
  const valid = /^\d{6}$/.test(code) && /^\w{4,16}$/.test(id);
  try {
    if (p === '/ping') return res.end('snapbridge');
    if (p === '/info') return json(res, { urls: lanUrls() });

    if (p === '/events' && valid) {                         // device joins a room
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      if (!rooms.has(code)) rooms.set(code, new Map());
      const room = rooms.get(code), client = { res, presence: {} };
      room.set(id, client); broadcastPeers(room);
      const beat = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(beat); room.delete(id); if (room.size) broadcastPeers(room); else rooms.delete(code); });
      return;
    }
    if (req.method === 'POST' && p === '/emit' && valid && rooms.has(code)) {
      const m = JSON.parse((await readBody(req)).toString() || '{}');
      rooms.get(code).forEach(c => send(c, 'msg', { topic: String(m.topic).slice(0, 32), data: m.data, peer: id }));
      return json(res, { ok: 1 });
    }
    if (req.method === 'POST' && p === '/presence' && valid && rooms.has(code)) {
      const c = rooms.get(code).get(id); if (!c) return json(res, { ok: 0 }, 404);
      c.presence = { ...c.presence, ...JSON.parse((await readBody(req)).toString() || '{}') };
      broadcastPeers(rooms.get(code)); return json(res, { ok: 1 });
    }
    if (req.method === 'POST' && p === '/relay') {          // fallback file relay
      const buf = await readBody(req), rid = crypto.randomBytes(8).toString('hex');
      blobs.set(rid, { buf, timer: setTimeout(() => blobs.delete(rid), RELAY_TTL) });
      return json(res, { url: '/relay/' + rid });
    }
    if (p.startsWith('/relay/')) {
      const b = blobs.get(p.slice(7)); if (!b) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(b.buf);
    }
    const file = STATIC[p];                                  // static files (whitelist only)
    if (file) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] }); return fs.createReadStream(path.join(__dirname, file)).pipe(res); }
    res.writeHead(404); res.end('Not found');
  } catch (e) { res.writeHead(400); res.end('Bad request'); }
}).listen(PORT, '0.0.0.0', () => {
  console.log('\nCyberShop SnapBridge is running.\n');
  console.log('  On this PC/Mac :  http://localhost:' + PORT);
  lanUrls().forEach(u => console.log('  On your phone  :  ' + u + '   (same Wi-Fi)'));
  console.log('\nPress Ctrl+C to stop.\n');
});
