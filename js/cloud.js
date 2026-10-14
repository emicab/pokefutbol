/* ============ cloud.js — guardado en la nube (Supabase) con un código secreto ============
 * Sin cuentas ni mails: al activarlo se genera un código largo (PF-XXXX-XXXX-XXXX-XXXX, 80 bits) que
 * funciona como llave; en otro dispositivo se escribe ese código y baja la misma partida. El servidor
 * sólo guarda el SHA-256 del código (nunca el código) y una copia del progreso; la tabla no se puede leer
 * directamente, sólo con las funciones save_get / save_put (ver README). La llave "publishable" es pública
 * por diseño: no da acceso a nada que no sea esas dos funciones.
 *
 * Sincronización: cada vez que el juego guarda (PF.Save.save) se marca como pendiente y, a los pocos
 * segundos, se sube. Si la copia de la nube cambió desde la última sincronización de este dispositivo
 * (se jugó en otro lado) no se pisa nada: queda en "conflicto" y el jugador elige cuál conservar.
 * Borrar el progreso pausa la sincronización para no vaciar la nube por accidente. Las opciones
 * (sonido, teclas) no viajan. Lo local (código, versión sincronizada) vive en 'pokefutbol.cloud'.
 */
PF.Cloud = (() => {
  const URL = 'https://vmotmiapscyldrlxuukl.supabase.co';
  const KEY = 'sb_publishable_mpcvqnZDGVdw0wO0_zR-Lg_w6V4Jvb5';
  const STORE = 'pokefutbol.cloud';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LEN = 16;
  const DEBOUNCE = 4000, RETRY = 60000, CHECK_EVERY = 30000;

  const blank = () => ({ code: '', base: null, dirty: false, paused: false });
  let st = blank();
  try { const raw = localStorage.getItem(STORE); if (raw) st = Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* sin almacenamiento */ }

  // off | ok | syncing | offline | conflict | paused | error
  let status = st.code ? (st.paused ? 'paused' : 'ok') : 'off';
  let detail = '';
  let timer = 0, busy = false, again = false, applying = false, lastCheck = 0;
  const listeners = [];

  const store = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* sin almacenamiento */ } };
  function setStatus(s, d = '') {
    status = s;
    detail = d;
    for (const f of listeners.slice()) { try { f(info()); } catch (e) { /* un oyente roto no frena a los demás */ } }
  }
  /** Suscribe a cambios de estado (devuelve cómo desuscribir). */
  function onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  // ------------------------------------------------------------------ código
  /** Lo que escribió el jugador → los 16 caracteres del código (o null si no es válido). */
  function normalize(input) {
    let c = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.startsWith('PF') && c.length === CODE_LEN + 2) c = c.slice(2);
    return c.length === CODE_LEN && [...c].every((ch) => ALPHA.includes(ch)) ? c : null;
  }
  const format = (c) => 'PF-' + c.match(/.{4}/g).join('-');
  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
    return [...bytes].map((b) => ALPHA[b % 32]).join('');   // 32 símbolos: sin sesgo
  }
  async function sha(code) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pokefutbol:' + code));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ------------------------------------------------------------------ red
  async function rpc(fn, args) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: ctl.signal,
      });
      if (!res.ok) {
        let msg = '';
        try { msg = (await res.json()).message || ''; } catch (e) { /* sin cuerpo */ }
        const err = new Error(msg || `Error ${res.status}`);
        err.http = res.status;
        throw err;
      }
      return await res.json();
    } finally { clearTimeout(t); }
  }
  const deviceName = () => String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'navegador').slice(0, 30);

  /** Mensaje corto para el jugador a partir de un error de red o del servidor. */
  function nice(e) {
    if (e && e.name === 'AbortError') return 'La nube tardó demasiado en responder.';
    if (e && e.http) return /quota|restricted/i.test(e.message) ? 'El servicio de la nube está restringido (cuota del proyecto de Supabase).' : `La nube respondió con un error (${e.http}).`;
    return 'No hay conexión con la nube.';
  }

  // ------------------------------------------------------------------ sincronizar
  const connected = () => !!st.code;

  /** El juego guardó: hay cambios para subir. */
  function touch() {
    if (applying || !connected()) return;
    st.dirty = true;
    store();
    if (st.paused) { if (status !== 'paused') setStatus('paused'); return; }
    if (status === 'conflict') return;   // hasta que el jugador elija, no se sube nada
    schedule();
  }
  function schedule(ms = DEBOUNCE) {
    clearTimeout(timer);
    timer = setTimeout(() => push(), ms);
  }

  /** Sube el progreso (force: pisa la nube aunque haya cambiado). */
  async function push(force = false) {
    if (!connected() || (st.paused && !force)) return false;
    if (busy) { again = true; return false; }
    busy = true;
    setStatus('syncing');
    try {
      const r = await rpc('save_put', { p_hash: await sha(st.code), p_data: PF.Save.snapshot(), p_device: deviceName(), p_base: st.base, p_force: !!force });
      if (r && r.ok) {
        st.base = r.updated_at; st.dirty = false; st.paused = false;
        store();
        setStatus('ok');
        return true;
      }
      if (r && r.conflict) { setStatus('conflict'); return false; }
      setStatus('error', 'La nube no aceptó la partida.');
    } catch (e) {
      setStatus('offline', nice(e));
      schedule(RETRY);
    } finally {
      busy = false;
      if (again) { again = false; schedule(500); }
    }
    return false;
  }

  /** Baja la copia de la nube (null si no hay). */
  async function pull() {
    return rpc('save_get', { p_hash: await sha(st.code) });
  }

  /** Reemplaza el progreso local por la copia de la nube. */
  function applyCloud(res) {
    applying = true;
    const r = PF.Save.replaceWith(res.data);
    applying = false;
    if (!r.ok) throw new Error(r.error);
    st.base = res.updated_at; st.dirty = false; st.paused = false;
    store();
    setStatus('ok');
  }

  /**
   * ¿Cambió la nube desde la última vez? Si este dispositivo no tiene cambios y apply = true, se actualiza solo
   * (devuelve 'updated'); si no, queda en 'conflicto' para que el jugador elija (así no se cambia la partida en plena jugada).
   */
  async function check(force = false, apply = false) {
    if (!connected() || st.paused || busy) return 'skip';
    if (!force && Date.now() - lastCheck < CHECK_EVERY) return 'skip';
    lastCheck = Date.now();
    try {
      setStatus('syncing');
      const res = await pull();
      if (!res) { if (st.dirty) await push(true); else setStatus('ok'); return 'ok'; }   // la nube está vacía: se sube lo local
      if (st.base && res.updated_at <= st.base) {
        if (st.dirty) await push(); else setStatus('ok');
        return 'ok';
      }
      if (st.dirty || !apply) { setStatus('conflict'); return 'conflict'; }
      applyCloud(res);
      return 'updated';   // main.js recarga para ver la partida nueva
    } catch (e) {
      setStatus('offline', nice(e));
      return 'offline';
    }
  }

  // ------------------------------------------------------------------ acciones del jugador
  /** Activa la nube con un código nuevo y sube la partida. Devuelve el código ya formateado. */
  async function enable() {
    const code = newCode();
    const prev = st;
    st = Object.assign(blank(), { code, dirty: true });
    store();
    if (!(await push(true))) {
      const why = detail;
      st = prev; store();
      setStatus(prev.code ? 'ok' : 'off');
      throw new Error(why || 'No se pudo activar la nube.');
    }
    return format(code);
  }

  /** Busca la partida de un código. Devuelve { code, res }; lanza si el código no sirve o no existe. */
  async function lookup(input) {
    const code = normalize(input);
    if (!code) throw new Error('Ese código no es válido (son 16 letras y números, como PF-ABCD-EFGH-JKLM-NPQR).');
    let res;
    try { res = await rpc('save_get', { p_hash: await sha(code) }); } catch (e) { throw new Error(nice(e)); }
    if (!res) throw new Error('No encontré ninguna partida con ese código.');
    return { code, res };
  }

  /** Conecta este dispositivo a esa partida: 'cloud' baja la de la nube; 'local' sube la de este dispositivo. */
  async function adopt(found, choice) {
    st = Object.assign(blank(), { code: found.code, base: found.res.updated_at, dirty: choice === 'local' });
    store();
    if (choice === 'cloud') { applyCloud(found.res); return true; }
    return push(true);
  }

  /** Resolver un conflicto o la pausa tras borrar el progreso. */
  async function resolve(choice) {
    if (!connected()) return false;
    if (choice === 'local') { st.paused = false; return push(true); }
    try {
      const res = await pull();
      if (!res) { st.paused = false; setStatus('ok'); return true; }
      applyCloud(res);
      return true;
    } catch (e) { setStatus('offline', nice(e)); return false; }
  }

  function disconnect() {
    clearTimeout(timer);
    st = blank();
    store();
    setStatus('off');
  }

  /** Borraron el progreso: no se sube nada hasta que el jugador decida. */
  function pause() {
    if (!connected()) return;
    clearTimeout(timer);
    st.paused = true;
    store();
    setStatus('paused');
  }

  const info = () => ({
    connected: connected(), status, detail, dirty: st.dirty, paused: st.paused, code: st.code ? format(st.code) : '', base: st.base,
  });

  /** Texto corto del estado para la pantalla de inicio. */
  function badge() {
    if (!connected()) return '';
    return { ok: '☁ sincronizada', syncing: '☁ sincronizando…', offline: '☁ sin conexión', conflict: '☁ ⚠ revisar', paused: '☁ en pausa', error: '☁ ⚠ error' }[status] || '';
  }

  /** Arranque: si hay una partida más nueva en la nube se baja (devuelve true si cambió el progreso). */
  async function start() {
    if (!connected()) return false;
    const r = await check(true, true);
    return r === 'updated';
  }

  document.addEventListener('visibilitychange', () => {
    if (!connected()) return;
    if (document.hidden) { if (st.dirty && !st.paused && status !== 'conflict') push(); }
    else check();
  });

  return { URL, rpc, nice, normalize, format, touch, push, check, start, enable, lookup, adopt, resolve, disconnect, pause, info, badge, onChange };
})();
