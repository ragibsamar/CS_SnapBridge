/* ==========================================================
   CyberShop SnapBridge: transport.js
   Signalling + presence layer. app.js only talks to window.Transport,
   so the backend can be swapped without touching the UI.

   Backends (auto-selected by Transport.init()):
     "claude" : inside claude.ai, uses the artifact "room" + "assets" capabilities
     "sse"    : the bundled server.js (Server-Sent Events + POST), for PC/Mac/LAN use

   Public API
     await Transport.init()            -> "claude" | "sse" | null
     await Transport.join(code)        join the room for a 6-digit pairing code
     Transport.emit(topic, data)       broadcast to everyone in the room
     Transport.on(topic, fn)           fn(data, peerId, isMe)
     Transport.setPresence(obj)        publish this device (name, face, colour)
     Transport.onPeers(fn)             fn() whenever the device list changes
     Transport.peers()                 [{peer, presence, me}]
     Transport.myId()
     await Transport.relayUpload(blob) -> url   (fallback when WebRTC cannot connect)
     await Transport.relayFetch(url)   -> Blob
     await Transport.baseUrl()         -> address another device should open
   ========================================================== */
(function () {
  'use strict';
  const handlers = {};           // topic -> [fn]
  const peerFns = [];
  let be = null;

  /* ---------------- backend 1: claude.ai room ---------------- */
  const claude = {
    kind: 'claude', CL: null, R: null, rm: null,
    async init() {
      this.CL = window.claude;
      if (!this.CL || !this.CL.use) return false;
      try { this.R = await this.CL.use('room'); } catch (e) { this.R = null; }
      return !!this.R;
    },
    async join(code) {
      if (this.rm) await this.rm.leave().catch(() => {});
      this.rm = await this.R.join('sb' + code);
      ['sig', 'relay'].forEach(t => this.rm.on(t, m => T._msg(t, m.data, m.peer, m.sameTab)));
      this.rm.onPeers(() => T._peers());
    },
    emit(t, d) { return this.rm && this.rm.emit(t, d); },
    presence(p) { return this.rm && this.rm.presence(p); },
    peers() { return this.rm ? this.rm.peers().map(p => ({ peer: p.peer, presence: p.presence || {}, me: p.sameTab })) : []; },
    myId() { const p = this.rm && this.rm.peers().find(p => p.sameTab); return p && p.peer; },
    async relayUpload(blob) {
      const A = await this.CL.use('assets');
      if (!A || blob.size > 20e6) throw new Error('relay unavailable');
      return (await A.upload(blob)).url;
    },
    async relayFetch(url) {
      if (!String(url).startsWith('/_blob/')) throw new Error('bad url');
      return (await fetch(url)).blob();
    },
    async baseUrl() { return T.PAGE_URL || location.href.split('#')[0]; }
  };

  /* ---------------- backend 2: bundled server.js ---------------- */
  const sse = {
    kind: 'sse', es: null, room: '', list: [], id: Math.random().toString(36).slice(2, 10),
    async init() {
      if (!/^https?:$/.test(location.protocol)) return false;
      try { const r = await fetch('ping'); return r.ok && (await r.text()) === 'snapbridge'; } catch (e) { return false; }
    },
    join(code) {
      return new Promise(res => {
        this.leave(); this.room = code;
        const es = this.es = new EventSource('events?room=' + code + '&id=' + this.id);
        es.addEventListener('peers', e => { this.list = JSON.parse(e.data).map(p => ({ peer: p.peer, presence: p.presence || {}, me: p.peer === this.id })); T._peers(); });
        es.addEventListener('msg', e => { const m = JSON.parse(e.data); T._msg(m.topic, m.data, m.peer, m.peer === this.id); });
        es.onopen = () => res();
        setTimeout(res, 3000);
      });
    },
    leave() { if (this.es) this.es.close(); this.es = null; this.list = []; },
    post(path, body) {
      return fetch(path + '?room=' + this.room + '&id=' + this.id, { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
    },
    emit(topic, data) { return this.post('emit', { topic, data }); },
    presence(p) { return this.post('presence', p); },
    peers() { return this.list; },
    myId() { return this.id; },
    async relayUpload(blob) { const r = await fetch('relay', { method: 'POST', body: blob }); if (!r.ok) throw new Error('relay failed'); return (await r.json()).url; },
    async relayFetch(url) { if (!/^\/?relay\/\w+$/.test(url)) throw new Error('bad url'); return (await fetch(url)).blob(); },
    async baseUrl() {
      try { const i = await (await fetch('info')).json(); const h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return i.urls[0] || location.origin; } catch (e) {}
      return location.origin;
    }
  };

  /* ---------------- public facade ---------------- */
  const T = window.Transport = {
    kind: null,
    PAGE_URL: '',   // set to the public link when the app is hosted inside claude.ai
    async init() {
      for (const b of [claude, sse]) { if (await b.init()) { be = b; this.kind = b.kind; return b.kind; } }
      return null;
    },
    join: c => be.join(c),
    emit: (t, d) => be && be.emit(t, d),
    on(topic, fn) { (handlers[topic] = handlers[topic] || []).push(fn); },
    setPresence: p => be && be.presence(p),
    onPeers(fn) { peerFns.push(fn); },
    peers: () => be ? be.peers() : [],
    myId: () => be && be.myId(),
    relayUpload: b => be.relayUpload(b),
    relayFetch: u => be.relayFetch(u),
    baseUrl: () => be.baseUrl(),
    _msg(topic, data, peer, me) { (handlers[topic] || []).forEach(fn => { try { fn(data, peer, me); } catch (e) { console.error(e); } }); },
    _peers() { peerFns.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
  };
})();
