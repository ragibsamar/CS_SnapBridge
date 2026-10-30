/* ==========================================================
   CyberShop SnapBridge: app.js
   Sections:
     1. Helpers + state          6. Sending
     2. Theme + tabs             7. Receiving + auto-save (Saver)
     3. Radar + animations       8. Pairing dialog
     4. Progress rows            9. Photo flow + FlatScan hand-off
     5. WebRTC connections      10. Start-up
   Depends on: transport.js (window.Transport), flatscan.js (window.FlatScan)
   ========================================================== */
'use strict';

/* ---------- 1. HELPERS + STATE ---------- */
const $ = s => document.querySelector(s);
const T = window.Transport;
const mob = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const plat = !mob && /Mac/i.test(navigator.platform || navigator.userAgent) ? 'Mac' : 'PC';
const PAL = ['#ff7a45', '#f5b02e', '#2fb3e0', '#3fbf8f', '#e86fa3', '#a78bfa'];
const my = { nm: (mob ? 'Phone ' : plat + ' ') + Math.floor(10 + Math.random() * 90), face: mob ? '📱' : '🖥️', col: PAL[Math.random() * PAL.length | 0] };
const st = { target: null, uid: 0, code: '' };
const CONN = {}, RECV = {}, SEND = {}, SENDQ = {}, DIRN = {}, POS = {};   // peer connections, transfers, radar state
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
const HISTORY_LIMIT = 50;
let historyItems = [];

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.k); toast.k = setTimeout(() => t.classList.remove('show'), 2800); }
const size = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const icon = t => (t || '').startsWith('image') ? '🖼️' : (t || '').startsWith('video') ? '🎬' : (t || '').startsWith('audio') ? '🎵' : '📄';
const chk = () => { $('#e1').hidden = !!$('#active .row'); $('#e2').hidden = !!$('#done .row'); };
const others = () => T.peers().filter(p => !p.me && p.presence && p.presence.nm);
const pname = id => { const p = others().find(p => p.peer === id); return p ? String(p.presence.nm).slice(0, 30) : 'Device'; };

/* ---------- 2. THEME + TABS ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('on', b.dataset.themeBtn === t));
  try { localStorage.setItem('sb-theme', t); } catch (e) {}
}
document.querySelectorAll('[data-theme-btn]').forEach(b => b.onclick = () => applyTheme(b.dataset.themeBtn));
let savedTheme = null; try { savedTheme = localStorage.getItem('sb-theme'); } catch (e) {}
applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

function showTab(t) {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#tr').hidden = t !== 'tr'; $('#scanPanel').hidden = t !== 'fs';
  if (t === 'fs') setTimeout(() => FlatScan.refresh(), 30);
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- 3. RADAR + ANIMATIONS ---------- */
function draw() {
  const sp = others();
  if (!sp.some(p => p.peer === st.target)) st.target = sp[0] ? sp[0].peer : null;
  let h = '<defs><radialGradient id="g"><stop offset="0" stop-color="#6c4dff" stop-opacity=".55"/><stop offset="1" stop-color="#6c4dff" stop-opacity=".08"/></radialGradient></defs>';
  h += '<circle cx="200" cy="200" r="185" fill="none" stroke="var(--line)"/><circle cx="200" cy="200" r="170" fill="url(#g)"/>';
  [60, 110, 160].forEach(r => h += `<circle cx="200" cy="200" r="${r}" fill="none" stroke="var(--line)"/>`);
  h += '<g class="sweep"><path d="M200 200 L370 200 A170 170 0 0 0 320 80 Z" fill="#9b86ff" opacity=".22"/></g>';
  sp.forEach((p, i) => {
    const a = (i / sp.length) * Math.PI * 2 - Math.PI / 2 + .5, r = [120, 150, 110, 140, 125][i % 5];
    const x = 200 + Math.cos(a) * r, y = 200 + Math.sin(a) * r, sel = p.peer === st.target;
    POS[p.peer] = { x, y };
    h += `<line class="dash ${DIRN[p.peer] ? 'live' : ''}" x1="200" y1="200" x2="${x}" y2="${y}"/>`;
    h += `<g class="dev"><circle cx="${x}" cy="${y}" r="20" fill="${/^#[0-9a-f]{6}$/i.test(p.presence.col) ? p.presence.col : '#888'}" stroke="${sel ? '#fff' : '#9b86ff'}" stroke-width="${sel ? 3 : 2}"/><text x="${x}" y="${y + 6}" style="font-size:18px;fill:#000"> </text><text x="${x}" y="${y + 38}"> </text></g>`;
    if (DIRN[p.peer]) for (let k = 0; k < 3; k++) h += `<circle class="pkt" data-p="${p.peer}" data-k="${k}" r="4" cx="200" cy="200"/>`;
  });
  h += `<circle cx="200" cy="200" r="30" fill="${my.col}" stroke="#9b86ff" stroke-width="3"/><text x="200" y="208" style="font-size:24px;text-anchor:middle">${my.face}</text>`;
  const svg = $('#radar'); svg.innerHTML = h;
  svg.querySelectorAll('.dev').forEach((g, i) => {      // names are set with textContent (never HTML)
    const t = g.querySelectorAll('text'); t[0].textContent = String(sp[i].presence.face || '🤖').slice(0, 4); t[1].textContent = pname(sp[i].peer);
    g.onclick = () => { st.target = sp[i].peer; draw(); };
  });
  const chips = $('#chips'); chips.innerHTML = '';
  sp.forEach(p => { const b = document.createElement('button'); b.className = 'pill' + (p.peer === st.target ? ' on' : ''); b.textContent = (p.presence.face || '🤖') + ' ' + pname(p.peer); b.onclick = () => { st.target = p.peer; draw(); }; chips.appendChild(b); });
  if (!sp.length) { const e = document.createElement('span'); e.className = 'sub'; e.textContent = T.kind === 'sse' ? 'Open SnapBridge on this network to find another device.' : 'No other device yet. Use Pair device.'; chips.appendChild(e); }
  $('#me').textContent = my.nm;
  $('#fsTo').textContent = st.target ? 'to ' + pname(st.target) : 'no device selected';
}
/* data packets travelling along the dashed link while a transfer is running */
function tick(ts) {
  if (!reduced) document.querySelectorAll('.pkt').forEach(c => {
    const pos = POS[c.dataset.p]; if (!pos) return;
    let t = ((ts / 900) + c.dataset.k / 3) % 1; if (DIRN[c.dataset.p] === 'out') t = 1 - t;   // 'in' = towards me
    c.setAttribute('cx', pos.x + (200 - pos.x) * t); c.setAttribute('cy', pos.y + (200 - pos.y) * t);
    c.setAttribute('opacity', Math.sin(Math.PI * (1 - t)).toFixed(2));
  });
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function setLive(peer, dir) { dir ? DIRN[peer] = dir : delete DIRN[peer]; draw(); }
/* a file badge flies in from outside the screen (receiving) or out of it (sending) */
function fly(el, name, inbound) {
  if (reduced) return;
  const b = el.getBoundingClientRect(), f = document.createElement('div'), x = b.left + 16, y = b.top + 4;
  f.className = 'fly'; f.textContent = '📄 ' + name.slice(0, 24); document.body.append(f);
  const a = { transform: `translate(${-280}px,${y + 120}px)`, opacity: 0 }, c = { transform: `translate(${x}px,${y}px)`, opacity: 1 };
  const o = { transform: `translate(${x}px,${y}px)`, opacity: 1 }, z = { transform: `translate(${innerWidth + 40}px,${y - 90}px)`, opacity: 0 };
  f.animate(inbound ? [a, c] : [o, z], { duration: 850, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => f.remove();
}

/* ---------- 4. PROGRESS ROWS ---------- */
function mkrow(ic, name, sub, onCancel, inbound) {
  const r = document.createElement('div'); r.className = 'row in';
  r.innerHTML = '<span></span><div class="meta"><div class="name"></div><div class="bar"><i></i></div><div class="sub"></div></div><button class="x" aria-label="Cancel">✕</button>';
  r.children[0].textContent = ic; r.querySelector('.name').textContent = name; r.querySelector('.sub').textContent = sub;
  r.querySelector('.x').onclick = onCancel;
  $('#active').prepend(r); chk(); fly(r, name, inbound); return r;
}
const prog = (r, p) => { r.querySelector('i').style.width = Math.max(0, Math.min(100, p * 100)) + '%'; };

/* ---------- 5. WEBRTC CONNECTIONS (signalling goes through Transport) ---------- */
const sig = (to, k, v) => T.emit('sig', { to, k, v });
function conn(peer) {
  if (CONN[peer]) return CONN[peer];
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), c = CONN[peer] = { pc, q: [] };
  c.open = new Promise(r => c.res = r);
  pc.onicecandidate = e => e.candidate && sig(peer, 'ice', e.candidate.toJSON());
  pc.ondatachannel = e => setup(peer, e.channel);
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && CONN[peer] === c) delete CONN[peer]; };
  return c;
}
function setup(peer, dc) {
  const c = CONN[peer]; c.dc = dc; dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = 262144;
  dc.onopen = () => c.res(dc); dc.onmessage = e => onData(peer, e.data); if (dc.readyState === 'open') c.res(dc);
}
async function connect(peer) {
  const c = conn(peer); if (c.dc && c.dc.readyState === 'open') return c.dc;
  if (!c.started) { c.started = true; setup(peer, c.pc.createDataChannel('f')); await c.pc.setLocalDescription(await c.pc.createOffer()); sig(peer, 'offer', c.pc.localDescription.toJSON()); }
  return Promise.race([c.open, new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 10000))]);
}
T.on('sig', async (d, peer, me) => {
  if (!d || me || d.to !== T.myId()) return;
  try {
    const c = conn(peer), pc = c.pc, flush = () => c.q.splice(0).forEach(x => pc.addIceCandidate(x).catch(() => {}));
    if (d.k === 'offer') { await pc.setRemoteDescription(d.v); flush(); await pc.setLocalDescription(await pc.createAnswer()); sig(peer, 'answer', pc.localDescription.toJSON()); }
    else if (d.k === 'answer') { await pc.setRemoteDescription(d.v); flush(); }
    else if (d.k === 'ice') { pc.remoteDescription ? pc.addIceCandidate(d.v).catch(() => {}) : c.q.push(d.v); }
  } catch (e) { console.warn('signal', e); }
});

/* ---------- 6. SENDING ---------- */
function send(file) {
  if (!st.target) return toast(T.kind === 'sse' ? 'Open SnapBridge on another device on this network first.' : 'Pair a device first, then select it as the target.');
  const to = st.target, id = ++st.uid, t = SEND[id] = { id, file, to, cancel: false, started: false };
  const row = mkrow(icon(file.type), file.name, 'Queued · ' + size(file.size) + ' · to ' + pname(to), () => {
    t.cancel = true;
    if (!t.started) { row.remove(); delete SEND[id]; chk(); }
  }, false);
  const job = (SENDQ[to] || Promise.resolve()).then(() => runSend(t, row));
  SENDQ[to] = job.catch(() => {});
  return job;
}
async function runSend(t, row) {
  const { id, file, to } = t;
  if (t.cancel) return;
  t.started = true;
  row.querySelector('.sub').textContent = size(file.size) + ' · to ' + pname(to);
  setLive(to, 'out');
  try {
    try { await pump(await connect(to), t, row); }
    catch (e) { if (t.cancel) throw e; await relay(t, row); }
    if (!t.cancel) await saveHistory({ direction: 'sent', name: file.name, blob: file, peerName: pname(to) });
    toast(t.cancel ? 'Transfer cancelled' : 'Sent: ' + file.name);
  } catch (e) { toast('Could not send ' + file.name + '. Check that both devices are online.'); }
  row.remove(); delete SEND[id];
  if (!Object.values(SEND).some(item => item.to === to && item.started)) setLive(to, null);
  chk();
}
async function pump(dc, t, row) {
  const f = t.file, BLOCK = 1048576;
  const negotiatedMax = CONN[t.to].pc.sctp && CONN[t.to].pc.sctp.maxMessageSize;
  const CH = Math.max(1, Math.min(65536, Number.isFinite(negotiatedMax) && negotiatedMax > 0 ? negotiatedMax : 65536));
  dc.send(JSON.stringify({ t: 'meta', id: t.id, name: f.name, size: f.size, type: f.type }));
  while (off < f.size && !t.cancel) {
    const ab = await f.slice(off, off + BLOCK).arrayBuffer();
    for (let i = 0; i < ab.byteLength && !t.cancel; i += CH) {
      if (dc.readyState !== 'open') throw new Error('closed');
      if (dc.bufferedAmount > 1048576) await waitForBuffer(dc);
      dc.send(ab.slice(i, i + CH)); prog(row, (off + i - dc.bufferedAmount) / f.size);
    }
    off += ab.byteLength;
  }
  dc.send(JSON.stringify({ t: t.cancel ? 'cancel' : 'end', id: t.id, by: 's' }));
  while (dc.bufferedAmount > 0 && dc.readyState === 'open') await new Promise(r => setTimeout(r, 50));
  prog(row, 1);
}
function waitForBuffer(dc) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      dc.removeEventListener('bufferedamountlow', onLow);
      dc.removeEventListener('close', onClose);
      dc.removeEventListener('error', onError);
    };
    const onLow = () => { if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) { cleanup(); resolve(); } };
    const onClose = () => { cleanup(); reject(new Error('closed')); };
    const onError = () => { cleanup(); reject(new Error('data channel error')); };
    dc.addEventListener('bufferedamountlow', onLow);
    dc.addEventListener('close', onClose, { once: true });
    dc.addEventListener('error', onError, { once: true });
    if (dc.readyState !== 'open') onClose();
    else onLow();
  });
}
async function relay(t, row) {                         // fallback when no direct connection
  toast('Direct link unavailable, using relay…');
  const url = await T.relayUpload(t.file); prog(row, 1);
  await T.emit('relay', { to: t.to, name: t.file.name, type: t.file.type, size: t.file.size, url });
}
T.on('relay', (d, peer, me) => {
  if (!d || me || d.to !== T.myId() || typeof d.url !== 'string') return;
  T.relayFetch(d.url).then(b => got(peer, cleanName(d.name), new Blob([b], { type: String(d.type || '') }), null)).catch(() => toast('Relay download failed'));
});

/* ---------- 7. RECEIVING + AUTO-SAVE ---------- */
const cleanName = n => String(n || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
async function onData(peer, d) {
  if (typeof d !== 'string') {                          // binary chunk
    const r = RECV[peer]; if (!r) return; r.got += d.byteLength; prog(r.row, r.got / r.m.size);
    if (r.out) r.q = r.q.then(() => r.out.w.write(d)).catch(() => { r.out = null; }); else r.ch.push(d); return;
  }
  let m; try { m = JSON.parse(d); } catch (e) { return; }
  if (m.t === 'meta') {
    const r = RECV[peer] = { m: { name: cleanName(m.name), size: +m.size || 1, type: String(m.type || '') }, got: 0, ch: [], q: Promise.resolve(), out: null };
    r.row = mkrow(icon(r.m.type), r.m.name, size(r.m.size) + ' · from ' + pname(peer), () => {
      const c = CONN[peer]; if (c && c.dc && c.dc.readyState === 'open') c.dc.send(JSON.stringify({ t: 'cancel', id: m.id, by: 'r' })); dropRecv(peer);
    }, true);
    setLive(peer, 'in');
    r.out = await Saver.open(r.m.name);                // stream straight to the folder when auto-save is on
    if (r.out) r.m.name = r.out.name;
  } else if (m.t === 'end') {
    const r = RECV[peer]; if (!r) return; await r.q; let blob, saved = null;
    if (r.out) { try { await r.out.w.close(); blob = await r.out.fh.getFile(); saved = Saver.label + ' › ' + r.out.name; } catch (e) {} }
    if (!blob) blob = new Blob(r.ch, { type: r.m.type });
    dropRecv(peer, true); got(peer, r.m.name, blob, saved);
  } else if (m.t === 'cancel') {
    if (m.by === 'r') { const t = SEND[m.id]; if (t) t.cancel = true; } else dropRecv(peer);
  }
}
function dropRecv(peer, keep) {
  const r = RECV[peer]; if (!r) return;
  if (r.out && !keep) try { r.out.w.abort(); } catch (e) {}
  r.row.remove(); delete RECV[peer]; setLive(peer, null); chk();
}
async function got(peer, name, blob, savedPath) {
  if (!savedPath && !Saver.ready() && T.kind === 'sse') { downloadAnchor(name, blob); savedPath = 'Browser Downloads folder › ' + name; }
  await saveHistory({ direction: 'received', name, blob, peerName: pname(peer), savedPath });
  toast('Received: ' + name);
}
function historyRow(item) {
  const r = document.createElement('div'); r.className = 'row land';
  const th = item.type.startsWith('image') ? Object.assign(document.createElement('img'), { className: 'thumb', alt: '', src: URL.createObjectURL(item.blob) })
    : Object.assign(document.createElement('div'), { className: 'thumb', textContent: icon(item.type) });
  const mt = document.createElement('div'); mt.className = 'meta'; mt.innerHTML = '<div class="name"></div><div class="sub"></div><div class="sub path"></div>';
  mt.children[0].textContent = item.name;
  mt.children[1].textContent = `${item.direction === 'sent' ? 'Sent to' : 'Received from'} ${item.peerName} · ${size(item.size)} · ${new Date(item.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
  mt.children[2].textContent = item.savedPath ? 'Saved: ' + item.savedPath : 'Available in local history';
  r.append(th, mt);
  const dl = document.createElement('button'); dl.className = 'mini'; dl.textContent = 'Download'; dl.onclick = () => saveBlob(item.name, item.blob); r.append(dl);
  if (item.type.startsWith('image')) { const sc = document.createElement('button'); sc.className = 'mini'; sc.textContent = 'Scan'; sc.onclick = () => { showTab('fs'); FlatScan.load(new File([item.blob], item.name, { type: item.type })); }; r.append(sc); }
  const tk = document.createElement('span'); tk.className = 'tick'; tk.textContent = '✓'; r.append(tk);
  return r;
}
function renderHistory() { $('#done').replaceChildren(...historyItems.map(historyRow)); chk(); }
async function loadHistory() {
  try { historyItems = await idb.getHistory(); renderHistory(); } catch (e) {}
}
async function saveHistory(item) {
  const entry = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type: item.blob.type || '', size: item.blob.size, time: Date.now() };
  historyItems.unshift(entry); historyItems = historyItems.slice(0, HISTORY_LIMIT); renderHistory();
  try { await idb.putHistory(entry); historyItems = await idb.getHistory(); renderHistory(); } catch (e) {}
}
function downloadAnchor(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function saveBlob(name, blob) {
  try {
    if (T.kind === 'claude') { const D = await window.claude.use('downloads'); if (!D) throw 0; await D.save({ filename: name, data: blob }); }
    else downloadAnchor(name, blob);
    toast('Saved ' + name);
  } catch (e) { toast(e && e.code === 'declined' ? 'Save cancelled' : 'This file type cannot be saved here. Use an auto-save folder (Chrome or Edge).'); }
}

/* Saver: remembers a folder (Downloads › SnapBridge) with the File System Access API.
   Needs Chrome/Edge on desktop over https or http://localhost. Handle is kept in IndexedDB. */
const idb = {
  open: () => new Promise((ok, no) => { const r = indexedDB.open('snapbridge', 2); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); if (!r.result.objectStoreNames.contains('history')) r.result.createObjectStore('history', { keyPath: 'id' }); }; r.onsuccess = () => ok(r.result); r.onerror = no; }),
  async get(k) { const d = await this.open(); return new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(); }); },
  async set(k, v) { const d = await this.open(); return new Promise(ok => { const q = d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); q.onsuccess = q.onerror = () => ok(); }); },
  async getHistory() { const d = await this.open(); return new Promise((ok, no) => { const q = d.transaction('history').objectStore('history').getAll(); q.onsuccess = () => ok(q.result.sort((a, b) => b.time - a.time)); q.onerror = () => no(q.error); }); },
  async putHistory(entry) { const d = await this.open(); return new Promise((ok, no) => { const tx = d.transaction('history', 'readwrite'), store = tx.objectStore('history'); store.put(entry); const q = store.getAll(); q.onsuccess = () => q.result.sort((a, b) => b.time - a.time).slice(HISTORY_LIMIT).forEach(item => store.delete(item.id)); tx.oncomplete = ok; tx.onerror = tx.onabort = () => no(tx.error); }); }
};
const Saver = {
  sub: null, label: '', perm: 'none',                  // perm: none | prompt | ready
  ready() { return this.perm === 'ready' && !!this.sub; },
  async init() {
    try { const h = await idb.get('dir'); if (h && h.sub) { this.sub = h.sub; this.label = (h.root.name || 'Folder') + ' › SnapBridge'; this.perm = (await h.sub.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ready' : 'prompt'; } } catch (e) {}
    this.ui();
  },
  async choose() {
    if (!window.showDirectoryPicker) return toast('Auto-save needs Chrome or Edge on desktop.');
    try {
      const root = await showDirectoryPicker({ id: 'snapbridge', mode: 'readwrite', startIn: 'downloads' });
      this.sub = await root.getDirectoryHandle('SnapBridge', { create: true });
      this.label = (root.name || 'Folder') + ' › SnapBridge'; this.perm = 'ready';
      await idb.set('dir', { root, sub: this.sub }); toast('Auto-save folder: ' + this.label);
    } catch (e) { toast('Folder not chosen (' + ((e && e.name) || 'cancelled') + ')'); }
    this.ui();
  },
  async resume() { try { if ((await this.sub.requestPermission({ mode: 'readwrite' })) === 'granted') this.perm = 'ready'; } catch (e) {} this.ui(); },
  async open(name) {                                     // returns {fh, w, name} or null
    if (!this.ready()) return null;
    try {
      let n = name, i = 1; const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
      for (; i < 100; i++) { try { await this.sub.getFileHandle(n); n = `${base} (${i})${ext}`; } catch (e) { break; } }
      const fh = await this.sub.getFileHandle(n, { create: true }); return { fh, w: await fh.createWritable(), name: n };
    } catch (e) { return null; }
  },
  ui() {
    const info = $('#saveInfo'), btn = $('#dirBtn');
    if (this.perm === 'ready') { info.textContent = 'Auto-saving to ' + this.label; btn.textContent = 'Change folder'; }
    else if (this.perm === 'prompt') { info.textContent = 'Auto-save paused: ' + this.label; btn.textContent = 'Resume'; }
    else { info.textContent = T.kind === 'sse' ? 'Files go to your browser Downloads folder' : 'Choose a folder to auto-save received files'; btn.textContent = 'Choose folder'; }
  }
};
$('#dirBtn').onclick = () => Saver.perm === 'prompt' ? Saver.resume() : Saver.choose();

/* ---------- 8. PAIRING ---------- */
async function joinCode(c) {
  Object.keys(CONN).forEach(k => { try { CONN[k].pc.close(); } catch (e) {} delete CONN[k]; });
  st.code = c; await T.join(c);
  await T.setPresence({ nm: my.nm, face: my.face, col: my.col });
  try { location.hash = 'join-' + c; } catch (e) {}
  draw();
}
async function showPair() {
  $('#code').textContent = st.code || '······'; const q = $('#qr'); q.innerHTML = '';
  $('#pairHelp').textContent = T.kind === 'sse' ? 'Open the same address on the other device (same Wi-Fi) and scan the QR or type the code.' : 'Open this page on the other device (signed in to claude.ai) and scan the QR or type the code.';
  $('#dlg').showModal();
  try { const base = (await T.baseUrl()).split('#')[0]; new QRCode(q, { text: base + '#join-' + st.code, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { q.textContent = st.code; }
}
$('#pairBtn').onclick = showPair; $('#close').onclick = () => $('#dlg').close();
$('#joinBtn').onclick = async () => {
  const v = $('#join').value.trim(); if (!/^\d{6}$/.test(v)) return toast('Enter the 6-digit code');
  $('#dlg').close(); await joinCode(v); toast('Joined ' + v);
};

/* ---------- 9. PHOTO FLOW + FLATSCAN HAND-OFF ---------- */
let pending = null;
const pick = list => [...list].forEach(send);
$('#fileBtn').onclick = () => $('#files').click();
$('#files').onchange = e => { pick(e.target.files); e.target.value = ''; };
$('#camBtn').onclick = () => $('#camIn').click();
$('#camIn').onchange = e => {                            // photo taken: offer FlatScan before sending
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!f.type.startsWith('image/')) return send(f);
  pending = f; $('#adjImg').src = URL.createObjectURL(f); $('#adjDlg').showModal();
};
$('#adjScan').onclick = () => { $('#adjDlg').close(); showTab('fs'); FlatScan.load(pending); };
$('#adjSend').onclick = () => { $('#adjDlg').close(); send(pending); };
$('#adjCancel').onclick = () => $('#adjDlg').close();
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); if (!$('#tr').hidden) pick(e.dataTransfer.files); });
$('#fsSendBtn').onclick = async () => {                  // finished scan -> selected device
  if (!FlatScan.hasResult()) return toast('Open an image in FlatScan first.');
  try { const b = await FlatScan.blob(); await send(new File([b], FlatScan.name() + '-scan.' + FlatScan.format(), { type: b.type })); showTab('tr'); }
  catch (e) { toast('Could not prepare the scan.'); }
};

/* ---------- 10. START-UP ---------- */
T.onPeers(draw);
draw(); chk(); Saver.init(); loadHistory();
(async () => {
  const kind = await T.init();
  Saver.ui();
  if (!kind || !window.RTCPeerConnection) { $('#ban').hidden = false; return; }
  const localNetwork = kind === 'sse';
  $('#pairBtn').hidden = localNetwork;
  $('#netLabel').textContent = localNetwork ? 'Devices on this local network' : 'Devices on your bridge';
  $('#discoverHint').textContent = localNetwork
    ? 'Open this same SnapBridge address on another device on your Wi-Fi; it will appear automatically.'
    : 'Pair a device to connect, then select it to send files.';
  const m = location.hash.match(/join-(\d{6})/);
  await joinCode(localNetwork ? '000000' : m ? m[1] : String(Math.floor(100000 + Math.random() * 900000)));
})();
