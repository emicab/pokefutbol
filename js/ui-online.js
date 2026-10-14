/* ============ ui-online.js — sala online y menú durante el partido ============
 * Sólo pinta; main.js maneja la conexión (PF.Net) y avisa con los callbacks.
 * En la sala hay tres lugares: equipo A, equipo B y espectadores. Todos
 * entran mirando y cada uno elige dónde ir; hasta 4 jugadores en total.
 */
PF.OnlineUI = (() => {
  const root = () => document.getElementById('ui');
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const DIFF = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
  const PLACES = [
    { id: 'A', label: 'Equipo A', color: PF.TEAM_COLORS[0] },
    { id: 'B', label: 'Equipo B', color: PF.TEAM_COLORS[1] },
    { id: 'spec', label: 'Mirando', color: '#a9b6d3' },
  ];

  /** Resumen del formato elegido por el anfitrión. */
  function setupLine(s) {
    const st = PF.stadiumById(s.stadium);
    return `${s.size} vs ${s.size} · ${s.time / 60} min · arquero ${s.keeper === 'fixed' ? 'fijo' : 'dinámico'} · ${st ? st.name : s.stadium}`;
  }

  /** Qué partido sale con la sala como está: "2 contra 2", "cooperativo contra la CPU"... */
  function matchLine(room) {
    const a = room.members.filter((x) => x.place === 'A').length, b = room.members.filter((x) => x.place === 'B').length;
    const cpu = `la CPU (${DIFF[room.setup.diff] || room.setup.diff})`;
    if (!a && !b) return 'Elijan un equipo para jugar.';
    if (!a || !b) {
      const n = a || b;
      return n === 1 ? `Uno contra ${cpu}` : `Cooperativo: ${n} contra ${cpu}`;
    }
    return `${a} contra ${b}`;
  }

  /** Tu equipo (el del partido rápido). */
  function teamLine(picks, n) {
    const names = picks.map((id) => (PF.rosterById(id) || { name: id }).name);
    return `${names.slice(0, n).join(', ') || '—'}` + (names.length < n ? ` <em>+${n - names.length} 🎲</em>` : '');
  }

  /**
   * st: { phase: idle|creating|joining|room, code, me, room }
   * cb: { onHost, onJoin(code), onStart, onTeam, onBack, onPlace(place), onName(name), onMode(mode), onRules }
   */
  function lobby(st, cb) {
    root().innerHTML = '';
    const setup = PF.Save.data.setup;
    const room = st.room;
    const isHost = st.me === 'host';
    const name = PF.Save.data.settings.name || '';
    let body = '';
    if (st.phase === 'idle') {
      body = `
        <div class="netcols">
          <div class="box netcard">
            <h3>Crear sala</h3>
            <p>Te damos un código para pasarle a tus amigos (hasta 4 jugadores, y los que quieran mirar).</p>
            <button class="btn big" data-act="host">Crear sala</button>
          </div>
          <div class="box netcard">
            <h3>Unirse</h3>
            <p>Escribe el código que te pasaron.</p>
            <input class="code" maxlength="5" placeholder="ABCDE" spellcheck="false" autocomplete="off">
            <button class="btn big" data-act="join">Unirse</button>
          </div>
        </div>`;
    } else if (st.phase === 'creating' || st.phase === 'joining' || !room) {
      body = `<div class="box netcard wide"><p class="wait">Conectando…</p></div>`;
    } else {
      const tour = room.mode === 'tour' || room.mode === 'cup', cup = room.mode === 'cup';
      const cols = PLACES.filter((pl) => !(tour && pl.id === 'B')).map((pl) => {
        const who = room.members.filter((x) => x.place === pl.id);
        const mine = who.some((x) => x.id === st.me);
        const cap = pl.id === 'spec' ? '' : ` <small>${who.length}/${cup ? 4 : room.setup.size}</small>`;
        const label = tour && pl.id === 'A' ? (cup ? 'Participantes' : 'Equipo (todos juntos)') : pl.label;
        return `
          <div class="place" style="--pc:${pl.color}">
            <div class="ph">${label}${cap}</div>
            <div class="who">${who.map((x) => `<div class="${x.id === st.me ? 'me' : ''}">${esc(x.name)}${x.host ? ' 👑' : ''}${x.id === st.me ? ' (tú)' : ''}${pl.id !== 'spec' && !x.host ? (x.ready ? ' <span class="rdy">✔ listo</span>' : ' <span class="wt">…</span>') : ''}</div>`).join('') || '<div class="none">—</div>'}</div>
            ${mine ? '' : `<button class="btn small" data-place="${pl.id}">${pl.id === 'spec' ? 'Mirar' : 'Ir acá'}</button>`}
          </div>`;
      }).join('');
      // los invitados que juegan tienen que marcarse listos; sin eso el anfitrión no empieza
      const players = room.members.filter((x) => x.place !== 'spec');
      const waiting = players.filter((x) => !x.host && !x.ready);
      const me = room.members.find((x) => x.id === st.me);
      const canStart = players.length > 0 && !waiting.length;
      const footer = isHost
        ? `<button class="btn big" data-act="start" ${canStart ? '' : 'disabled'}>${tour ? '¡Empezar el torneo!' : '¡Empezar!'}</button>
           <p class="tiny readyline ${canStart ? 'ok' : ''}">${!players.length ? 'Elijan un equipo para jugar.' : waiting.length ? 'Esperando que estén listos: ' + waiting.map((x) => esc(x.name)).join(', ') : 'Todos listos.'}</p>`
        : me && me.place !== 'spec'
          ? `<button class="btn big ${me.ready ? 'on' : ''}" data-act="ready">${me.ready ? '✔ Listo (tocar para cancelar)' : '¡Estoy listo!'}</button>
             <p class="tiny readyline">${me.ready ? 'Esperando a que el anfitrión empiece…' : 'Cuando estés listo, avísale al anfitrión: sin eso no puede empezar.'}</p>`
          : '<p class="wait">Elige un equipo para jugar; si sólo quieres mirar, espera a que el anfitrión empiece.</p>';
      body = `
        <div class="box netcard wide room">
          <div class="roomhead">
            <div class="codebig ${isHost ? '' : 'small'}">${st.code}</div>
            <div>
              <p class="setupline">${setupLine(room.setup)}</p>
              <p class="matchline">${cup ? `🏆 Torneo: ${room.members.filter((x) => x.place === 'A').length || '—'} participante(s), cada uno con su equipo, contra la CPU (${DIFF[room.setup.diff] || room.setup.diff}). Se juega de a un partido y los demás miran.` : tour ? `🏆 Torneo cooperativo: ${room.members.filter((x) => x.place === 'A').length || '—'} jugador(es) contra la CPU (${DIFF[room.setup.diff] || room.setup.diff})` : matchLine(room)}</p>
              ${tour && room.rules && room.rules.length ? `<p class="tiny">Reglas: ${esc(room.rules.join(' · '))}</p>` : ''}
              ${isHost ? `<div class="chips modechips"><span>Modo</span><button data-mode="match" class="${tour ? '' : 'on'}">Partido</button><button data-mode="tour" class="${room.mode === 'tour' ? 'on' : ''}">🏆 Cooperativo</button><button data-mode="cup" class="${cup ? 'on' : ''}">🏆 Cada uno su equipo</button>${tour ? '<button data-act="rules">⚙ Reglas</button>' : ''}</div>` : ''}
              ${isHost ? '<p class="tiny">Pásales el código. El formato se cambia en «Armar equipo».</p>' : '<p class="tiny">Elige tu lugar, arma tu equipo y márcate listo. El anfitrión empieza el partido.</p>'}
            </div>
          </div>
          <div class="places">${cols}</div>
          ${footer}
        </div>`;
    }
    const s = el(`
      <div class="screen online">
        <div class="selhead"><h2>Online</h2></div>
        ${body}
        <div class="box netteam">
          <label>Nombre <input class="pname" maxlength="14" value="${esc(name)}" placeholder="Entrenador" spellcheck="false" autocomplete="off"></label>
          <b>Tu equipo</b> ${teamLine(setup.picks, setup.size)}
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
    const pname = q('.pname');
    pname.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') pname.blur(); };
    pname.onchange = () => cb.onName(pname.value);
    if (q('[data-act=host]')) q('[data-act=host]').onclick = cb.onHost;
    if (q('[data-act=join]')) {
      const inp = q('input.code');
      const go = () => { const c = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 5) cb.onJoin(c); else inp.focus(); };
      q('[data-act=join]').onclick = go;
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); };
      inp.oninput = () => { inp.value = inp.value.toUpperCase(); };
    }
    if (q('[data-act=start]')) q('[data-act=start]').onclick = cb.onStart;
    s.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => cb.onMode(b.dataset.mode); });
    if (q('[data-act=rules]')) q('[data-act=rules]').onclick = cb.onRules;
    if (q('[data-act=ready]')) q('[data-act=ready]').onclick = cb.onReady;
    s.querySelectorAll('[data-place]').forEach((b) => { b.onclick = () => cb.onPlace(b.dataset.place); });
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

  return { lobby, menu };
})();
