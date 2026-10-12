/* ============ net.js — partido online entre dos navegadores ============
 * Conexión directa (WebRTC) con PeerJS: el anfitrión crea una sala con un
 * código de 5 letras y el invitado se une con ese código. PeerJS se carga
 * sólo al entrar en Online (el resto del juego sigue funcionando sin internet).
 *
 * Modelo: el anfitrión corre el partido de verdad. El invitado manda sus
 * teclas (intención) y recibe, en cada paso, lo que cambió del estado
 * (jugadores, pelota, marcador...) más los efectos y sonidos que hubo, y
 * con eso dibuja su copia del partido.
 *
 * Mensajes { t: tipo, ... }:
 *   hello  invitado → anfitrión  { v, picks }          al conectar o cambiar de equipo
 *   info   anfitrión → invitado  { setup }             formato, tiempo, modo...
 *   start  anfitrión → invitado  { cfg }               arranca un partido
 *   in     invitado → anfitrión  { i }                 intención de este frame
 *   s      anfitrión → invitado  { p, m, b, h, e }     estado (sólo lo que cambió) y eventos
 *   lobby  anfitrión → invitado                        volver a la sala
 */
PF.Net = (() => {
  const VERSION = 'pf-net-1';
  const LIB = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'pokefutbol-sala-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let peer = null, conn = null;
  let role = null;              // 'host' | 'guest' | null
  const handlers = {};

  function on(type, fn) { handlers[type] = fn; }
  function emit(type, msg) { if (handlers[type]) handlers[type](msg); }

  let libPromise = null;
  function loadLib() {
    if (window.Peer) return Promise.resolve();
    if (!libPromise) {
      libPromise = new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = LIB;
        s.onload = () => ok();
        s.onerror = () => { libPromise = null; fail(new Error('No se pudo cargar PeerJS (¿sin internet?)')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

  function attach(c) {
    conn = c;
    c.on('data', (msg) => { if (msg && msg.t) emit(msg.t, msg); });
    c.on('close', () => { if (conn === c) { conn = null; emit('close'); } });
    c.on('error', () => {});
  }

  /** Crea una sala. onCode(código) cuando está lista; onGuest() cuando entra alguien. */
  async function host(onCode, onGuest, onError) {
    close();
    try { await loadLib(); } catch (e) { onError(e.message); return; }
    role = 'host';
    const tryOpen = (tries) => {
      const code = newCode();
      peer = new window.Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => onCode(code));
      peer.on('connection', (c) => {
        if (conn && conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); }); return; }
        c.on('open', () => { attach(c); onGuest(); });
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && tries > 0) { peer.destroy(); tryOpen(tries - 1); }
        else onError(errorText(e));
      });
      peer.on('disconnected', () => { if (peer && !peer.destroyed) peer.reconnect(); });
    };
    tryOpen(3);
  }

  /** Se une a la sala `code`. onOpen() al conectar. */
  async function join(code, onOpen, onError) {
    close();
    try { await loadLib(); } catch (e) { onError(e.message); return; }
    role = 'guest';
    peer = new window.Peer({ debug: 0 });
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
      c.on('open', () => { attach(c); onOpen(); });
    });
    peer.on('error', (e) => onError(errorText(e)));
  }

  function errorText(e) {
    if (e.type === 'peer-unavailable') return 'No existe esa sala (revisa el código).';
    if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') return 'Sin conexión con el servidor de salas.';
    if (e.type === 'browser-incompatible') return 'Este navegador no soporta WebRTC.';
    return 'Error de conexión: ' + (e.type || e.message || e);
  }

  function send(msg) { if (conn && conn.open) conn.send(msg); }
  const connected = () => !!(conn && conn.open);

  function close() {
    const c = conn;
    conn = null;
    if (c) try { c.close(); } catch (e) { /* ya cerrada */ }
    if (peer) try { peer.destroy(); } catch (e) { /* idem */ }
    peer = null;
    role = null;
  }

  /** Para pruebas: dos extremos conectados en la misma página. */
  function loopback() {
    const mk = () => ({ open: true, fns: {}, on(ev, fn) { this.fns[ev] = fn; }, close() { this.open = false; } });
    const a = mk(), b = mk();
    a.send = (msg) => setTimeout(() => b.fns.data && b.fns.data(JSON.parse(JSON.stringify(msg))));
    b.send = (msg) => setTimeout(() => a.fns.data && a.fns.data(JSON.parse(JSON.stringify(msg))));
    return [a, b];
  }

  // ------------------------------------------------------------ estado del partido
  /** "id:habilidad" de un Pokémon del plantel (online sólo se juega con el de partido rápido). */
  const defKey = (d) => d.id + ':' + Math.max(0, d.abilities.findIndex((a) => a.id === d.ability.id));
  const defOf = (key) => { const [id, a] = key.split(':'); return PF.withAbility(PF.rosterById(id), +a); };

  const P_SKIP = new Set(['def', 'skill', 'ai', 'types', 'ctrl', 'spot']);
  const M_FIELDS = ['score', 'time', 'totalTime', 'golden', 'state', 'stateT', 'clock', 'kickoffTeam', 'kicker', 'goalTeam',
    'ownGoal', 'winner', 'scorer', 'items', 'itemT', 'hazards', 'projs', 'shake', 'nearT', 'tactic', 'keeper', 'sides',
    'bench', 'subsLeft', 'orders'];
  const B_SKIP = new Set([]);

  /** Valor del partido → algo que viaja en JSON (los Pokémon van por índice). */
  function enc(m, v, depth = 0) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : { $i: Math.sign(v) };
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function' || v instanceof Set || v instanceof Map) return undefined;
    if (Array.isArray(v)) return v.map((x) => { const e = enc(m, x, depth + 1); return e === undefined ? null : e; });
    const pi = m.players.indexOf(v);
    if (pi >= 0) return { $p: pi };
    const hi = m.humans.indexOf(v);
    if (hi >= 0) return { $h: hi };
    if (v.abilities && v.ability) return { $d: defKey(v) };
    if (v.def && v.team !== undefined) return null;   // uno que ya salió de la cancha
    if (depth > 5) return undefined;
    const o = {};
    for (const k in v) { const e = enc(m, v[k], depth + 1); if (e !== undefined) o[k] = e; }
    return o;
  }

  function dec(m, v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => dec(m, x));
    if (v.$p !== undefined) return m.players[v.$p] || null;
    if (v.$h !== undefined) return m.humans[v.$h] || null;
    if (v.$d !== undefined) return defOf(v.$d);
    if (v.$i !== undefined) return v.$i * Infinity;
    const o = {};
    for (const k in v) o[k] = dec(m, v[k]);
    return o;
  }

  /** Arma, del lado del anfitrión, el paquete con lo que cambió desde el último. */
  function makeSync() {
    const last = { p: [], m: {}, b: {}, h: [] };
    const diff = (store, key, val, out) => {
      const s = JSON.stringify(val);
      if (store[key] !== s) { store[key] = s; out[key] = val; return true; }
      return false;
    };
    return function pack(m, events) {
      const msg = { t: 's', p: {}, m: {}, b: {}, h: [], e: events };
      m.players.forEach((p, i) => {
        const st = last.p[i] || (last.p[i] = {});
        const out = {};
        let any = false;
        for (const k in p) {
          if (P_SKIP.has(k)) continue;
          const e = enc(m, p[k], 1);
          if (e !== undefined) any = diff(st, k, e, out) || any;
        }
        any = diff(st, '$def', defKey(p.def), out) || any;
        any = diff(st, '$ctrl', p.ctrl ? p.ctrl.idx : -1, out) || any;
        if (any) msg.p[i] = out;
      });
      for (const k of M_FIELDS) { const e = enc(m, m[k]); if (e !== undefined) diff(last.m, k, e, msg.m); }
      for (const k in m.ball) { if (B_SKIP.has(k)) continue; const e = enc(m, m.ball[k]); if (e !== undefined) diff(last.b, k, e, msg.b); }
      m.humans.forEach((h, i) => {
        const st = last.h[i] || (last.h[i] = {});
        const out = {};
        if (diff(st, 'controlled', enc(m, h.controlled), out)) msg.h[i] = out;
      });
      return msg;
    };
  }

  /** Aplica un paquete al partido del invitado. */
  function applySync(m, msg) {
    for (const i in msg.p) {
      const p = m.players[i], d = msg.p[i];
      if (!p) continue;
      if (d.$def) p.def = defOf(d.$def);
      for (const k in d) if (k[0] !== '$') p[k] = dec(m, d[k]);
      if (d.$ctrl !== undefined) p.ctrl = d.$ctrl >= 0 ? m.humans[d.$ctrl] : null;
    }
    for (const k in msg.m) m[k] = dec(m, msg.m[k]);
    for (const k in msg.b) m.ball[k] = dec(m, msg.b[k]);
    (msg.h || []).forEach((d, i) => { if (d && m.humans[i]) m.humans[i].controlled = dec(m, d.controlled); });
    for (const ev of msg.e || []) playEvent(m, ev);
  }

  // ------------------------------------------------------------ efectos y sonidos
  // Del lado del anfitrión se graban los efectos (PF.FX) y sonidos (PF.Audio)
  // que produce el partido online, para repetirlos en el invitado.
  let rec = null, recFx = null;
  const FX_FNS = ['particle', 'burst', 'text', 'ring', 'bolt', 'confetti'];
  let hooked = false;
  function hook() {
    if (hooked) return;
    hooked = true;
    for (const name of FX_FNS) {
      const orig = PF.FX[name];
      PF.FX[name] = function (fx, ...args) {
        if (rec && fx === recFx) rec.push(['f', name, args.map((a) => (typeof a === 'number' ? Math.round(a * 10) / 10 : a))]);
        return orig.call(this, fx, ...args);
      };
    }
    for (const name of Object.keys(PF.Audio.sfx)) {
      const orig = PF.Audio.sfx[name];
      PF.Audio.sfx[name] = function (...args) {
        if (rec) rec.push(['a', name, args]);
        return orig.apply(this, args);
      };
    }
    const crowd = PF.Audio.crowd;
    PF.Audio.crowd = function (...args) {
      if (rec) rec.push(['c', 'crowd', args]);
      return crowd.apply(this, args);
    };
  }
  /** Corre fn() grabando los efectos de `m`; devuelve la lista. */
  function capture(m, fn) {
    hook();
    rec = []; recFx = m.fx;
    try { fn(); } finally { recFx = null; }
    const out = rec;
    rec = null;
    return out;
  }
  function playEvent(m, [kind, name, args]) {
    if (kind === 'f' && PF.FX[name]) PF.FX[name](m.fx, ...args);
    else if (kind === 'a' && PF.Audio.sfx[name]) PF.Audio.sfx[name](...args);
    else if (kind === 'c') PF.Audio.crowd(...args);
  }

  // ------------------------------------------------------------ teclas del invitado
  /**
   * Buffer de intenciones que llegan por red: lo sostenido (mover, mantener)
   * se reemplaza; lo pulsado (pase, habilidad...) se acumula hasta que el
   * anfitrión lo usa en un paso, así no se pierde ningún toque.
   */
  function makeInputBuffer() {
    const EDGES = ['pass', 'ability', 'swap', 'order', 'skip'];
    let cur = { mx: 0, my: 0, passHold: false, shootHold: false, press: false };
    let edges = {}, held = {};
    return {
      push(i) {
        cur = i;
        for (const k of EDGES) if (i[k]) edges[k] = true;
        if (i.passHold) held.passHold = true;
        if (i.shootHold) held.shootHold = true;
      },
      take() {
        const out = Object.assign({}, cur, edges);
        if (held.passHold) out.passHold = true;
        if (held.shootHold) out.shootHold = true;
        edges = {}; held = {};
        return out;
      },
    };
  }

  return {
    VERSION, on, host, join, send, close, connected, loopback, attach,
    get role() { return role; },
    defKey, defOf, makeSync, applySync, capture, makeInputBuffer,
  };
})();
