/* ============ ui-online.js — sala online y menú durante el partido ============
 * Sólo pinta; main.js maneja la conexión (PF.Net) y avisa con los callbacks.
 */
PF.OnlineUI = (() => {
  const root = () => document.getElementById('ui');
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const MODES = { pvp: 'Uno contra otro (JcJ)', coop: 'Cooperativo contra la CPU' };
  const DIFF = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };

  /** Resumen del formato elegido por el anfitrión. */
  function setupLine(s, mode) {
    const st = PF.stadiumById(s.stadium);
    return `${s.size} vs ${s.size} · ${s.time / 60} min · arquero ${s.keeper === 'fixed' ? 'fijo' : 'dinámico'} · ${st ? st.name : s.stadium}` +
      (mode === 'coop' ? ` · rival ${DIFF[s.diff] || s.diff}` : '');
  }

  /** Tu equipo (el del partido rápido), con lo que hace falta para el modo. */
  function teamLine(picks, need) {
    const names = picks.map((id) => (PF.rosterById(id) || { name: id }).name);
    const miss = need - picks.length;
    return `${names.slice(0, need).join(', ') || '—'}` +
      (picks.length > need ? ` <small>(banco: ${names.slice(need).join(', ')})</small>` : '') +
      (miss > 0 ? ` <em>faltan ${miss}: se completa al azar</em>` : '');
  }

  /**
   * st: { phase: idle|creating|hosting|joining|joined, code, mode, connected, info, guestPicks }
   * cb: { onHost, onJoin(code), onMode(mode), onStart, onTeam, onBack }
   */
  function lobby(st, cb) {
    root().innerHTML = '';
    const setup = PF.Save.data.setup;
    const hostSide = st.phase === 'hosting' || st.phase === 'creating';
    const info = hostSide || st.phase === 'idle' ? Object.assign({ mode: st.mode }, setup) : st.info;
    const mode = (info && info.mode) || st.mode;
    const need = !info ? setup.size : mode === 'coop' ? (hostSide || st.phase === 'idle' ? Math.ceil(info.size / 2) : info.size - Math.ceil(info.size / 2)) : info.size;
    let body = '';
    if (st.phase === 'idle') {
      body = `
        <div class="netcols">
          <div class="box netcard">
            <h3>Crear sala</h3>
            <p>Te damos un código para pasarle a tu amigo. Tú eliges el modo y el formato.</p>
            <button class="btn big" data-act="host">Crear sala</button>
          </div>
          <div class="box netcard">
            <h3>Unirse</h3>
            <p>Escribe el código que te pasaron.</p>
            <input class="code" maxlength="5" placeholder="ABCDE" spellcheck="false" autocomplete="off">
            <button class="btn big" data-act="join">Unirse</button>
          </div>
        </div>`;
    } else if (st.phase === 'creating' || st.phase === 'joining') {
      body = `<div class="box netcard wide"><p class="wait">Conectando…</p></div>`;
    } else if (st.phase === 'hosting') {
      body = `
        <div class="box netcard wide">
          <div class="codebig">${st.code}</div>
          <p>Pásale este código a tu amigo para que se una.</p>
          <div class="chips" data-name="modo"><span>Modo</span>
            ${Object.entries(MODES).map(([k, v]) => `<button data-v="${k}" class="${k === st.mode ? 'on' : ''}">${v}</button>`).join('')}
          </div>
          <p class="setupline">${setupLine(setup, st.mode)} <small>(se cambia en «Armar equipo»)</small></p>
          <p class="status ${st.connected ? 'ok' : ''}">${st.connected
            ? `¡Tu amigo está conectado! Su equipo: ${st.guestPicks ? teamLine(st.guestPicks.map((x) => x.id), st.mode === 'coop' ? setup.size - Math.ceil(setup.size / 2) : setup.size) : '…'}`
            : 'Esperando a que se una alguien…'}</p>
          <button class="btn big" data-act="start" ${st.connected ? '' : 'disabled'}>¡Empezar!</button>
        </div>`;
    } else if (st.phase === 'joined') {
      body = `
        <div class="box netcard wide">
          <div class="codebig small">${st.code}</div>
          <p class="status ok">Conectado a la sala.</p>
          <p class="setupline">${info ? `${MODES[mode]} · ${setupLine(info, mode)}` : '…'}</p>
          <p class="wait">Esperando a que el anfitrión empiece el partido…</p>
        </div>`;
    }
    const s = el(`
      <div class="screen online">
        <div class="selhead"><h2>Online</h2></div>
        ${body}
        <div class="box netteam">
          <b>Tu equipo</b> ${teamLine(setup.picks, need)}
          <button class="btn small" data-act="team">Armar equipo</button>
        </div>
        <div class="row">
          <button class="btn" data-act="back">${st.phase === 'idle' ? 'Volver' : 'Salir de la sala'}</button>
        </div>
        <div class="foot">Conexión directa entre navegadores (PeerJS). Si no conecta, puede ser el router o un firewall.</div>
      </div>`);
    const q = (sel) => s.querySelector(sel);
    q('[data-act=back]').onclick = cb.onBack;
    q('[data-act=team]').onclick = cb.onTeam;
    if (q('[data-act=host]')) q('[data-act=host]').onclick = cb.onHost;
    if (q('[data-act=join]')) {
      const inp = q('input.code');
      const go = () => { const c = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 5) cb.onJoin(c); else inp.focus(); };
      q('[data-act=join]').onclick = go;
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); };
      inp.oninput = () => { inp.value = inp.value.toUpperCase(); };
    }
    if (q('[data-act=start]')) q('[data-act=start]').onclick = cb.onStart;
    s.querySelectorAll('[data-name=modo] button').forEach((b) => { b.onclick = () => cb.onMode(b.dataset.v); });
    root().appendChild(s);
  }

  /** Menú con Esc durante un partido online: el partido no se detiene. */
  function menu(onClose, onLeave) {
    root().innerHTML = '';
    const s = el(`
      <div class="screen netmenu">
        <div class="box menu">
          <h2>Online</h2>
          <div class="hint">El partido sigue corriendo: online no hay pausa. Los cambios son automáticos.</div>
          <button class="btn" data-act="close">Volver al partido</button>
          <button class="btn danger" data-act="leave">Abandonar</button>
        </div>
      </div>`);
    s.querySelector('[data-act=close]').onclick = onClose;
    s.querySelector('[data-act=leave]').onclick = onLeave;
    root().appendChild(s);
  }

  return { lobby, menu, MODES };
})();
