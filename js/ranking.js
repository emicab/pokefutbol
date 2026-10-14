/* ============ ranking.js — ranking online por modo (2, 3 o 5 por equipo) ============
 * Usa el mismo proyecto de Supabase que la nube (cloud.js) con tres funciones: rank_register, rank_report y
 * rank_top (ver tools/supabase-ranking.sql). Para aparecer hay que inscribir un nombre de equipo (único);
 * al inscribirse se genera un id secreto que queda en la partida (PF.Save.data.rank), así viaja con la nube y
 * los archivos. El servidor sólo guarda su SHA-256.
 *
 * Cuentan los partidos contra la CPU del partido rápido y del torneo (no el modo historia ni el online).
 * Puntos: victoria 3, empate 1, por la dificultad (fácil ×1, normal ×2, difícil ×3); abandonar un partido
 * empezado es derrota. Cada fila del ranking muestra el equipo (los titulares) con el que más puntos sumó.
 * Si no hay conexión, los resultados esperan en este dispositivo ('pokefutbol.rank') y se mandan después.
 */
PF.Ranking = (() => {
  const STORE = 'pokefutbol.rank';
  const MODES = [2, 3, 5];
  const MULT = { easy: 1, normal: 2, hard: 3 };
  const DIFF_NAME = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
  const RETRY = 60000;
  const NAME_RE = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .'!_-]{3,20}$/;

  let queue = [];
  try { const raw = localStorage.getItem(STORE); if (raw) queue = JSON.parse(raw) || []; } catch (e) { /* sin almacenamiento */ }
  let busy = false, timer = 0;
  const store = () => { try { localStorage.setItem(STORE, JSON.stringify(queue)); } catch (e) { /* sin almacenamiento */ } };

  const me = () => PF.Save.data.rank;
  const registered = () => !!(me() && me().id && me().name);
  const rpc = (fn, args) => PF.Cloud.rpc(fn, args);

  async function hashOf(id) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pokefutbol-rank:' + id));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const randomId = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');

  /** Inscribe el equipo (o le cambia el nombre). Lanza un Error con el motivo si no se pudo. */
  async function register(input) {
    const name = cleanName(input);
    if (!NAME_RE.test(name)) throw new Error('El nombre lleva de 3 a 20 letras, números o espacios.');
    const id = registered() ? me().id : randomId(24);
    let r;
    try { r = await rpc('rank_register', { p_hash: await hashOf(id), p_name: name }); } catch (e) { throw new Error(PF.Cloud.nice(e)); }
    if (!r || !r.ok) throw new Error(r && r.error === 'ocupado' ? 'Ese nombre ya lo usa otro equipo. Prueba con otro.' : 'Ese nombre no sirve. Prueba con otro.');
    PF.Save.data.rank = { id, name: r.name || name };
    PF.Save.save();
    return PF.Save.data.rank.name;
  }

  /** Puntos que vale un resultado (los mismos que calcula el servidor). */
  function pointsFor(gf, ga, diff, abandon) {
    const res = abandon ? -1 : Math.sign(gf - ga);
    return (res > 0 ? 3 : res === 0 ? 1 : 0) * (MULT[diff] || 1);
  }

  /**
   * Un partido terminado (o abandonado): { size, lineup: [ids], diff, gf, ga, abandon }.
   * Devuelve { points, size, diff, abandon } si cuenta, o null si el jugador no está inscrito o el modo no va.
   */
  function report(r) {
    if (!registered() || !MODES.includes(r.size) || !MULT[r.diff] || !r.lineup || r.lineup.length !== r.size) return null;
    const gf = Math.max(0, Math.min(40, r.gf | 0)), ga = Math.max(0, Math.min(40, r.ga | 0));
    queue.push({ id: me().id, size: r.size, lineup: r.lineup.join(','), gf, ga, diff: r.diff, abandon: !!r.abandon, nonce: randomId(12) });
    if (queue.length > 200) queue.splice(0, queue.length - 200);
    store();
    flush();
    return { points: pointsFor(gf, ga, r.diff, r.abandon), size: r.size, diff: r.diff, abandon: !!r.abandon };
  }

  /** Manda los resultados pendientes, de a uno y en orden. */
  async function flush() {
    if (busy || !queue.length) return;
    busy = true;
    clearTimeout(timer);
    try {
      while (queue.length) {
        const q = queue[0];
        const r = await rpc('rank_report', {
          p_hash: await hashOf(q.id), p_size: q.size, p_lineup: q.lineup, p_gf: q.gf, p_ga: q.ga,
          p_diff: q.diff, p_abandon: q.abandon, p_nonce: q.nonce,
        });
        if (r && !r.ok && r.error === 'limite') { timer = setTimeout(flush, RETRY); break; }   // demasiados seguidos: más tarde
        queue.shift();   // mandado (o rechazado por datos / sin inscripción: no tiene arreglo)
        store();
      }
    } catch (e) {
      timer = setTimeout(flush, RETRY);   // sin conexión: se reintenta
    } finally { busy = false; }
  }

  /** Tabla de un modo: { total, rows, me }. */
  async function top(size) {
    return rpc('rank_top', { p_size: size, p_hash: registered() ? await hashOf(me().id) : null });
  }

  /** Línea para la pantalla de resultado. */
  function resultHtml(rep) {
    if (rep) {
      const why = rep.abandon ? 'abandono' : `×${MULT[rep.diff]} ${DIFF_NAME[rep.diff]}`;
      return `<div class="rankline">🏅 Ranking ${rep.size} vs ${rep.size}: <b>+${rep.points} pts</b> <small>(${why})</small></div>`;
    }
    if (!registered()) return '<div class="rankline">🏅 <button class="btn small" data-act="ranking">Inscribe tu equipo en el ranking</button></div>';
    return '';
  }

  // ------------------------------------------------------------------ pantalla
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /** Las caritas del equipo (ids del servidor → Pokémon que existan). */
  function lineupHtml(lineup) {
    return String(lineup || '').split(',').map(PF.rosterById).filter(Boolean)
      .map((r) => `<canvas width="44" height="40" data-dex="${r.dex}" title="${esc(r.name)}"></canvas>`).join('');
  }

  function rowHtml(r) {
    const rec = r.bd ? `${r.bw}-${r.bd}-${r.bl}` : `${r.bw}-${r.bl}`;
    return `<tr class="${r.me ? 'me' : ''}">
      <td class="pos">${r.pos}</td>
      <td><div class="rkteam"><b>${esc(r.name)}</b><span class="lu">${lineupHtml(r.lineup)}</span><small title="Puntos y G-P de ese equipo">${r.bpts} pts · ${rec}</small></div></td>
      <td class="pts">${r.pts}</td><td>${r.pj}</td><td>${r.w}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td>
    </tr>`;
  }

  /** onBack() al volver. */
  function screen(onBack) {
    let size = MODES.includes(PF.Save.data.setup.size) ? PF.Save.data.setup.size : 2;
    let data = null, error = '', editing = !registered(), busyReg = false, loadId = 0;
    const s = el('<div class="screen rankscr"></div>');

    async function load() {
      const id = ++loadId;
      data = null; error = '';
      draw();
      try { const d = await top(size); if (id === loadId) data = d; } catch (e) { if (id === loadId) error = PF.Cloud.nice(e); }
      if (id === loadId && s.isConnected) draw();
    }

    function draw() {
      const reg = registered();
      const old = s.querySelector('.namein');   // lo que estaba escribiendo (la tabla puede llegar mientras tanto)
      const typed = old ? { v: old.value, focus: document.activeElement === old } : null;
      const head = editing
        ? `<p>${reg ? 'Nuevo nombre para tu equipo:' : 'Ponle nombre a tu equipo para aparecer en el ranking. Desde ahí cuentan tus partidos.'}</p>
           <div class="row"><input class="namein" maxlength="20" placeholder="Nombre del equipo" value="${reg ? esc(me().name) : ''}" spellcheck="false" autocomplete="off">
           <button class="btn small big" data-act="reg" ${busyReg ? 'disabled' : ''}>${reg ? 'Guardar' : 'Inscribir'}</button>
           ${reg ? '<button class="btn small" data-act="cancel">Cancelar</button>' : ''}</div>`
        : `<p>Tu equipo: <b class="myname">${esc(me().name)}</b> <button class="btn small" data-act="rename">Cambiar nombre</button>${queue.length ? ` <small>· ${queue.length} partido${queue.length > 1 ? 's' : ''} por enviar</small>` : ''}</p>`;
      let table;
      if (error) table = `<p class="warn">${esc(error)}</p><button class="btn small" data-act="retry">Reintentar</button>`;
      else if (!data) table = '<p>Cargando…</p>';
      else if (!data.rows.length) table = '<p>Todavía nadie sumó puntos en este modo. ¡Puedes ser el primero!</p>';
      else {
        const mine = data.me && !data.rows.some((r) => r.me) ? `<tr class="gap"><td colspan="7">…</td></tr>${rowHtml(data.me)}` : '';
        table = `<div class="ranktable"><table>
          <thead><tr><th>#</th><th>Equipo <small>(con el que más puntos sumó)</small></th><th>Pts</th><th>PJ</th><th>G</th><th>P</th><th>Goles</th></tr></thead>
          <tbody>${data.rows.map(rowHtml).join('')}${mine}</tbody></table></div>
          <p class="tiny">${data.total} equipo${data.total === 1 ? '' : 's'} en ${size} vs ${size}${reg && !data.me ? ' · todavía no jugaste este modo' : ''}</p>`;
      }
      PF.UI.clearPortraits();
      s.innerHTML = `
        <div class="box menu rankbox">
          <h2>🏅 Ranking</h2>
          ${head}
          <div class="row tabs">${MODES.map((n) => `<button class="btn small ${n === size ? 'on' : ''}" data-size="${n}">${n} vs ${n}</button>`).join('')}</div>
          ${table}
          <p class="tiny">Cuentan el partido rápido y el torneo contra la CPU. Victoria 3 pts y empate 1, por la dificultad:
          Fácil ×1 · Normal ×2 · Difícil ×3. Abandonar un partido empezado cuenta como derrota.</p>
          <div class="row"><button class="btn" data-act="back">Volver</button></div>
        </div>`;
      s.querySelectorAll('canvas[data-dex]').forEach((cv) => PF.UI.addPortrait(cv, +cv.dataset.dex, 0.55));
      const inp = s.querySelector('.namein');
      if (inp && typed) { inp.value = typed.v; if (typed.focus) inp.focus(); }
      wire();
    }

    function wire() {
      const on = (a, f) => { const b = s.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
      on('back', () => { loadId++; PF.UI.clearPortraits(); onBack(); });
      on('retry', load);
      on('rename', () => { editing = true; draw(); s.querySelector('.namein').focus(); });
      on('cancel', () => { editing = false; draw(); });
      const inp = s.querySelector('.namein');
      const doReg = async () => {
        if (busyReg) return;
        busyReg = true; draw();
        const v = inp.value;
        try {
          const name = await register(v);
          editing = false;
          PF.UI.toast(`¡${esc(name)} ya está en el ranking!`);
          PF.Audio.sfx.coin();
          busyReg = false;
          return load();
        } catch (e) {
          PF.UI.toast(esc(e.message));
          PF.Audio.sfx.fail();
        }
        busyReg = false;
        draw();
        const again = s.querySelector('.namein');
        if (again) again.focus();
      };
      on('reg', doReg);
      if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') doReg(); };
      s.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { size = +b.dataset.size; PF.Audio.sfx.click(); load(); }; });
    }

    PF.UI.clear();
    document.getElementById('ui').appendChild(s);
    load();
    const first = s.querySelector('.namein') || s.querySelector('[data-act=back]');
    if (first) first.focus();
  }

  flush();
  addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });

  return { MODES, registered, register, report, pointsFor, flush, top, resultHtml, screen };
})();
