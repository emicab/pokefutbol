/* ============ ui.js — pantallas en DOM sobre el canvas ============
 * Título, opciones, selección de equipo (con desbloqueos), pausa y resultado.
 * main.js decide cuándo se muestra cada una; aquí sólo se pinta, se guarda
 * lo que se elige en PF.Save y se avisa de los clics.
 */
PF.UI = (() => {
  const root = () => document.getElementById('ui');
  let portraits = [];          // canvases animados (selección)

  function clear() { root().innerHTML = ''; portraits = []; }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const K = PF.Input;
  /** Una línea con las teclas actuales, para ayudas. */
  const hintLine = () => `${K.label('pass')} pase/placaje · ${K.label('shoot')} tiro · ${K.label('ability')} habilidad · ${K.label('press')} presionar · ${K.label('swap')} cambiar · ${K.label('order')} orden · ${K.label('subs')} cambios · ${K.label('quick')} cambio rápido`;
  const BENCH_MAX = 2;   // suplentes en partido rápido
  const selFilter = { tier: 'all', type: '', q: '' };   // filtros de la selección (se recuerdan al volver)
  const KEEPER_HELP = {
    fixed: 'Arquero fijo: uno es el arquero; sale a cerrar cuando hace falta y un compañero lo releva.',
    dynamic: 'Arquero dinámico: ataja el que esté más cerca del arco en cada momento.',
  };

  const coinHTML = (n) => `<span class="coins"><i class="coin"></i>${n}</span>`;

  function toast(msg) {
    const t = el(`<div class="toast">${msg}</div>`);
    root().appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------------------------------------------------------------- título
  function title(onPlay, onCareer, onOptions, onOnline, onTournament) {
    clear();
    const s = el(`
      <div class="screen title">
        <div class="topbar">${coinHTML(PF.Save.data.coins)}</div>
        <div class="logo">Poké<span>Fútbol</span></div>
        <div class="tagline">fútbol de dibujos animados · sin reglas, con rayos</div>
        <div class="modegrid">
          <button class="modecard play" data-act="play"><i>⚽</i><b>Partido rápido</b><small>2, 3 o 5 contra 5 contra la CPU, con reglas especiales</small></button>
          <button class="modecard story" data-act="career"><i>🗺️</i><b>Modo Historia</b><small>Tu club, los gimnasios, tu rival y la Liga</small></button>
          <button class="modecard tour" data-act="tour"><i>🏆</i><b>Torneo</b><small>Cuadros de 4 a 16 equipos, series y premios</small></button>
          <button class="modecard online" data-act="online"><i>🌐</i><b>Online</b><small>Con amigos: partido o torneo, juntos o cada uno con su equipo</small></button>
        </div>
        <div class="row subrow">
          <button class="btn small" data-act="opts">⚙ Opciones</button>
          <button class="btn small" data-act="ctrls">⌨ Controles</button>
        </div>
        <div class="box controls ${PF.Save.data.stats.played ? 'hidden' : ''}">
          <div><kbd>${K.moveLabel()}</kbd> mover</div>
          <div><kbd>${K.label('pass')}</kbd> pase (mantén: más fuerte) · sin pelota: placaje</div>
          <div><kbd>${K.label('shoot')}</kbd> tiro (mantén para cargar)</div>
          <div><kbd>${K.label('ability')}</kbd> habilidad del Pokémon</div>
          <div><kbd>${K.label('press')}</kbd> presionar (ir a la pelota; máx. 2 s)</div>
          <div><kbd>${K.label('swap')}</kbd> cambiar de Pokémon</div>
          <div>al tirar, <kbd>${K.label('up')}</kbd>/<kbd>${K.label('down')}</kbd> eligen palo</div>
          <div><kbd>${K.label('order')}</kbd> orden al equipo: neutro, ataque o defensa</div>
          <div><kbd>${K.label('subs')}</kbd> cambios (suplentes) · <kbd>${K.label('quick')}</kbd> cambio rápido</div>
          <div><kbd>${K.label('pause')}</kbd> pausa · <kbd>${K.label('mute')}</kbd> silencio</div>
        </div>
        <div class="foot">Sprites de SpriteCollab (CC BY-NC 4.0) · proyecto de fans sin ánimo de lucro · ver CREDITS.md</div>
      </div>`);
    s.querySelector('[data-act=play]').onclick = onPlay;
    s.querySelector('[data-act=career]').onclick = onCareer;
    s.querySelector('[data-act=opts]').onclick = onOptions;
    s.querySelector('[data-act=online]').onclick = onOnline;
    s.querySelector('[data-act=tour]').onclick = onTournament;
    s.querySelector('[data-act=ctrls]').onclick = () => { s.querySelector('.controls').classList.toggle('hidden'); PF.Audio.sfx.click(); };
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  // ---------------------------------------------------------------- opciones
  function options(onBack, onChange) {
    clear();
    const st = PF.Save.data.settings;
    const s = el(`
      <div class="screen">
        <div class="box menu opts">
          <h2>Opciones</h2>
          <label>Música <input type="range" min="0" max="1" step="0.05" data-k="music" value="${st.music}"></label>
          <label>Efectos y público <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${st.sfx}"></label>
          <label class="chk"><input type="checkbox" data-k="aids" ${st.aids ? 'checked' : ''}> Ayudas de apuntado (flecha, mira, línea de pase)</label>
          <label class="chk"><input type="checkbox" data-k="replays" ${st.replays ? 'checked' : ''}> Repetición de los goles</label>
          <h3>Controles <small>clic en una acción y pulsa la tecla nueva</small></h3>
          <div class="keys"></div>
          <div class="row">
            <button class="btn small" data-act="keysreset">Restaurar teclas</button>
          </div>
          <div class="row">
            <button class="btn" data-act="back">Volver</button>
            <button class="btn danger" data-act="reset">Borrar progreso</button>
          </div>
        </div>
      </div>`);
    s.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => {
        st[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
        PF.Save.save();
        onChange();
      };
    });
    // controles: cada acción con sus teclas; clic → la próxima tecla pasa a ser la principal
    function drawKeys() {
      const box = s.querySelector('.keys');
      box.innerHTML = '';
      for (const [action, name] of K.ACTIONS) {
        const row = el(`<button class="keyrow"><span>${name}</span><b>${K.keys(action).map(K.keyName).join(' · ')}</b></button>`);
        row.onclick = () => {
          s.querySelectorAll('.keyrow').forEach((r) => r.classList.remove('wait'));
          row.classList.add('wait');
          row.querySelector('b').textContent = 'pulsa una tecla… (Esc cancela)';
          K.captureNext((code) => {
            if (code !== 'Escape' || action === 'pause') K.bind(action, code);
            PF.Audio.sfx.click();
            drawKeys();
          });
        };
        box.appendChild(row);
      }
    }
    drawKeys();
    s.querySelector('[data-act=keysreset]').onclick = () => { K.cancelCapture(); K.reset(); drawKeys(); toast('Teclas de fábrica restauradas.'); };

    s.querySelector('[data-act=back]').onclick = () => { K.cancelCapture(); onBack(); };
    const reset = s.querySelector('[data-act=reset]');
    reset.onclick = () => {
      if (reset.dataset.sure) { PF.Save.reset(); onChange(); options(onBack, onChange); toast('Progreso borrado.'); }
      else { reset.dataset.sure = '1'; reset.textContent = '¿Seguro? Pulsa otra vez'; }
    };
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  // ---------------------------------------------------------------- selección
  function statBar(label, v) {
    return `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(U01(v) * 100)}%"></b></i></div>`;
  }
  const U01 = (v) => Math.max(0.04, Math.min(1, v));

  function chips(name, options, value) {
    return `<div class="chips" data-name="${name}"><span>${name}</span>` +
      options.map(([v, label]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('') +
      '</div>';
  }

  // ---------------------------------------------------------------- reglas
  /** Pantalla de reglas especiales (mode: 'quick' o 'tournament'); las cambia en setup.rules y llama a onDone. */
  function rulesScreen(mode, onDone) {
    clear();
    const setup = PF.Save.data.setup, RU = PF.Rules, tourney = mode === 'tournament' || mode === 'coop';
    if (!setup.rules) setup.rules = {};
    const cur = () => RU.get(setup);
    const flip = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : list.concat(v));
    const typeIds = Object.keys(PF.TYPE_ES).filter((k) => PF.ROSTER.some((r) => PF.typesOf(r).includes(k)));
    const btn = (on, label, act, v, title = '') => `<button class="${on ? 'on' : ''}" data-act="${act}" data-v="${v}" ${title ? `title="${title}"` : ''}>${label}</button>`;

    const s = el('<div class="screen rules"></div>');
    const set = (patch) => { setup.rules = Object.assign({}, cur(), patch); PF.Save.save(); PF.Audio.sfx.click(); draw(); };
    function draw() {
      const r = cur();
      const avail = RU.available(r);
      const norep = mode === 'tournament' && r.norepeat;
      const need = norep ? setup.size * 3 : setup.size;
      const warn = avail < need ? `<div class="rwarn">Con estas reglas tienes ${avail} Pokémon y hacen falta ${need}${norep ? ' (3 equipos distintos)' : ''}.</div>` : '';
      s.innerHTML = `
        <div class="selhead"><h2>Reglas ${mode === 'coop' ? 'del torneo cooperativo' : tourney ? 'del torneo' : 'del partido'}</h2></div>
        <div class="box rbox">
          <div class="rpresets">${RU.PRESETS.map((p, i) => `<button class="btn small" data-act="preset" data-v="${i}" title="${p.desc || 'Sin reglas especiales'}">${p.name}</button>`).join('')}</div>
          <div class="chips rtypes"><span>Tipos</span>${typeIds.map((t) => btn(r.types.includes(t), PF.TYPE_ES[t], 'type', t)).join('')}<em>${r.types.length ? '' : 'todos'}</em></div>
          <div class="chips"><span>Fases</span>${['f1', 'f2', 'f3', 'strong', 'elite', 'legend'].map((t) => btn(r.tiers.includes(t), PF.TIERS[t].label, 'tier', t)).join('')}<em>${r.tiers.length ? '' : 'todas'}</em></div>
          <div class="chips"><span>Equipo</span>
            ${btn(r.distinct, 'Tipos distintos', 'distinct', 1, 'Los titulares no pueden compartir ningún tipo')}
            <span class="sp">Presupuesto</span>${[[0, 'Libre'], [1, 'Ajustado'], [2, 'Medio']].map(([v, l]) => btn(r.cap === v, l, 'cap', v, 'Puntos por titular: fase 1 = 1, fase 2 = 2, fase 3 = 3, fuerte = 4, élite = 5, legendario = 6. Ajustado: 1,5 por puesto; medio: 2,5.')).join('')}
            <em>${r.cap ? `máx. ${RU.capOf(r, setup.size)} puntos con ${setup.size}` : ''}</em></div>
          <div class="chips"><span>Partido</span>
            ${btn(r.pure, 'Fútbol puro (sin habilidades)', 'pure', 1)}
            <span class="sp">Final</span>${[[0, 'Normal'], [1, 'Gol de oro'], [3, 'Primero a 3']].map(([v, l]) => btn(r.goal === v, l, 'goal', v, v ? 'Termina cuando alguien llega a ese número de goles' : 'Tiempo reglamentario (y gol de oro si empatan)')).join('')}</div>
          ${tourney ? `<div class="chips"><span>Torneo</span>
            ${mode === 'tournament' ? btn(r.norepeat, 'Sin repetir Pokémon', 'norepeat', 1, 'Cada Pokémon juega una sola vez en todo el torneo: eliges un equipo nuevo en cada cruce') : ''}
            ${btn(r.rotate, 'Canchas rotativas', 'rotate', 1, 'Una cancha distinta en cada ronda (entre las que tengas)')}</div>
          <div class="chips"><span>Cuadro</span>${[[4, '4 equipos'], [8, '8 equipos'], [16, '16 equipos']].map(([v, l]) => btn(r.teams === v, l, 'teams', v, 'Cantidad de equipos del torneo (2, 3 o 4 rondas)')).join('')}
            <span class="sp">Cada cruce</span>${[[1, 'Partido único'], [2, 'Ida y vuelta'], [3, 'Mejor de 3'], [5, 'Mejor de 5']].map(([v, l]) => btn(r.legs === v, l, 'legs', v, v === 2 ? 'Dos partidos con resultado global (la final es única)' : v > 2 ? 'El primero en ganar la mayoría de los partidos pasa' : 'Un solo partido')).join('')}</div>` : ''}
          <div class="rinfo2">${r.goal && tourney && r.legs === 2 ? 'El final "primero a N" no vale en los partidos de ida y vuelta. ' : ''}Con estas reglas puedes usar <b>${avail}</b> Pokémon de los que tienes.</div>
          ${warn}
        </div>
        <div class="row"><button class="btn" data-act="reset">Quitar reglas</button><button class="btn big" data-act="done">Listo</button></div>`;
      s.querySelectorAll('button[data-act]').forEach((b) => {
        const a = b.dataset.act, v = b.dataset.v;
        b.onclick = () => {
          const rr = cur();
          if (a === 'preset') set(Object.assign({}, RU.DEFAULTS, RU.PRESETS[+v].rules));
          else if (a === 'type') set({ types: flip(rr.types, v) });
          else if (a === 'tier') set({ tiers: flip(rr.tiers, v) });
          else if (a === 'distinct') set({ distinct: !rr.distinct });
          else if (a === 'cap') set({ cap: +v });
          else if (a === 'pure') set({ pure: !rr.pure });
          else if (a === 'goal') set({ goal: +v });
          else if (a === 'norepeat') set({ norepeat: !rr.norepeat });
          else if (a === 'legs') set({ legs: +v });
          else if (a === 'teams') set({ teams: +v });
          else if (a === 'rotate') set({ rotate: !rr.rotate });
          else if (a === 'reset') set(Object.assign({}, RU.DEFAULTS));
          else if (a === 'done') onDone();
        };
      });
      const d = s.querySelector('[data-act=done]');
      if (d) d.focus();
    }
    root().appendChild(s);
    draw();
  }

  /** onGo() cuando el equipo está completo; la elección queda en PF.Save.data.setup. */
  function select(onGo, onBack, goLabel = '¡A la cancha!', opts = {}) {
    clear();
    const save = PF.Save.data, setup = save.setup;
    const rules = opts.rules || PF.Rules.get(setup), exclude = opts.exclude || new Set();   // reglas y Pokémon que ya no se pueden usar
    const banned = (r) => (exclude.has(r.id) ? 'Ya jugó en este torneo' : PF.Rules.whyNot(r, rules));
    let focus = setup.picks[0] || PF.ROSTER[0].id;
    let abFocus = null;   // { id, i }: habilidad sin comprar que se está mirando

    const s = el(`
      <div class="screen select ${opts.lock ? 'lockcfg' : ''}">
        <div class="selhead">
          <h2>Arma tu equipo</h2>
          ${coinHTML(save.coins)}
        </div>
        <div class="setup">
          ${chips('Formato', [[2, '2 vs 2'], [3, '3 vs 3'], [5, '5 vs 5']], setup.size)}
          ${chips('Tiempo', [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']], setup.time)}
          ${chips('Rival', [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']], setup.diff)}
          ${chips('Arquero', [['fixed', 'Fijo'], ['dynamic', 'Dinámico']], setup.keeper)}
          <em class="keeperhelp"></em>
          <button class="btn small rulesbtn" data-act="rules"></button>
        </div>
        <div class="setup stadiums"></div>
        <div class="filters">
          <div class="chips" data-filter="tier"><span>Ver</span>
            ${[['all', 'Todos'], ['mine', 'Míos'], ['f1', 'Fase 1'], ['f2', 'Fase 2'], ['f3', 'Fase 3'], ['strong', 'Fuertes'], ['elite', 'Élite'], ['legend', 'Legendarios']]
              .map(([v, l]) => `<button data-v="${v}" class="${selFilter.tier === v ? 'on' : ''}">${l}</button>`).join('')}
          </div>
          <select class="typesel">
            <option value="">Todos los tipos</option>
            ${Object.entries(PF.TYPE_ES).filter(([k]) => PF.ROSTER.some((r) => PF.typesOf(r).includes(k)))
              .map(([k, v]) => `<option value="${k}" ${selFilter.type === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <input class="search" placeholder="Buscar…" value="${selFilter.q}" spellcheck="false" autocomplete="off">
          <em class="count"></em>
        </div>
        <div class="grid"></div>
        <div class="lower">
          <div class="detail box"></div>
          <div class="boardbox box">
            <div class="bt">Pizarra <small>arrastra a cada uno · ★ = su puesto</small></div>
            <div class="boardslot"></div>
          </div>
        </div>
        <div class="rulemsg"></div>
        <div class="row foot-row">
          <div class="team"></div>
          <button class="btn" data-act="back">Volver</button>
          <button class="btn big" data-act="go">${goLabel}</button>
        </div>
      </div>`);

    const grid = s.querySelector('.grid');
    // con 151 Pokémon, sólo se animan (y se cargan) los retratos que se ven
    function updateVisible() {
      const top = grid.scrollTop - 60, bottom = grid.scrollTop + grid.clientHeight + 60;
      s.querySelectorAll('.mini').forEach((c) => {
        const y = c.offsetTop;
        c._portrait.hidden = c.style.display === 'none' || y + c.offsetHeight < top || y > bottom;
      });
    }
    grid.addEventListener('scroll', updateVisible, { passive: true });
    for (const r of PF.ROSTER) {
      const c = el(`
        <div class="mini" role="button" tabindex="0" data-id="${r.id}" style="--tc:${r.color}">
          <span class="pick"></span>
          <canvas width="88" height="60"></canvas>
          <div class="nm">${r.name}</div>
          <div class="lock"></div>
        </div>`);
      const p = { canvas: c.querySelector('canvas'), r, hidden: true };
      c._portrait = p;
      portraits.push(p);
      c.onclick = () => clickPokemon(r);
      c.onkeydown = (e) => { if (e.key === 'Enter') clickPokemon(r); };
      grid.appendChild(c);
    }

    /** Filtros de la grilla: tier (o sólo los míos), tipo y búsqueda por nombre. */
    function applyFilter() {
      const q = selFilter.q.trim().toLowerCase();
      let n = 0;
      s.querySelectorAll('.mini').forEach((c) => {
        const r = PF.rosterById(c.dataset.id);
        const ok = (selFilter.tier === 'all' || (selFilter.tier === 'mine' ? PF.isUnlocked(r) : r.tier === selFilter.tier)) &&
          (!selFilter.type || PF.typesOf(r).includes(selFilter.type)) &&
          (!q || r.name.toLowerCase().includes(q) || String(r.dex) === q);
        c.style.display = ok ? '' : 'none';
        if (ok) n++;
      });
      s.querySelector('.filters .count').textContent = `${n} Pokémon`;
      if (s.isConnected) updateVisible();
    }
    s.querySelectorAll('[data-filter=tier] button').forEach((b) => {
      b.onclick = () => {
        selFilter.tier = b.dataset.v;
        s.querySelectorAll('[data-filter=tier] button').forEach((x) => x.classList.toggle('on', x === b));
        PF.Audio.sfx.click();
        applyFilter();
        grid.scrollTop = 0;
      };
    });
    s.querySelector('.typesel').onchange = (e) => { selFilter.type = e.target.value; applyFilter(); grid.scrollTop = 0; };
    const search = s.querySelector('.search');
    search.oninput = () => { selFilter.q = search.value; applyFilter(); grid.scrollTop = 0; };
    search.onkeydown = (e) => e.stopPropagation();

    function clickPokemon(r) {
      focus = r.id;
      const why = banned(r);
      if (why && !setup.picks.includes(r.id)) { toast(why + '.'); PF.Audio.sfx.fail(); refresh(); return; }
      if (PF.isUnlocked(r)) {
        const i = setup.picks.indexOf(r.id);
        if (i >= 0) setup.picks.splice(i, 1);
        else { setup.picks.push(r.id); while (setup.picks.length > setup.size + BENCH_MAX) setup.picks.shift(); }
        PF.Audio.sfx.click();
      }
      PF.Save.save();
      refresh();
    }

    s.querySelectorAll('.setup .chips').forEach((g) => {
      g.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const name = g.dataset.name, v = b.dataset.v;
          if (name === 'Formato') {
            setup.size = +v;
            while (setup.picks.length > setup.size + BENCH_MAX) setup.picks.pop();
            setup.keeper = setup.size >= 5 ? 'fixed' : 'dynamic';   // lo habitual en cada formato
          }
          if (name === 'Tiempo') setup.time = +v;
          if (name === 'Rival') setup.diff = v;
          if (name === 'Arquero') setup.keeper = v;
          PF.Audio.sfx.click();
          PF.Save.save();
          refresh();
        };
      });
    });

    s.querySelector('[data-act=back]').onclick = onBack;
    s.querySelector('[data-act=go]').onclick = () => { if (setup.picks.length >= 1 && !teamProblem()) onGo(); };
    s.querySelector('[data-act=rules]').onclick = () => rulesScreen(opts.mode || 'quick', () => select(onGo, onBack, goLabel, opts));

    /** Saca de la lista los que no se pueden usar y, si el equipo sigue mal, el último titular hasta que cumpla. */
    function fixPicks() {
      setup.picks = setup.picks.filter((id) => !banned(PF.rosterById(id)));
      let guard = 20;
      while (guard-- > 0 && PF.Rules.teamError(setup.picks.slice(0, setup.size).map((id) => PF.rosterById(id)), rules, setup.size)) {
        setup.picks.splice(Math.min(setup.size, setup.picks.length) - 1, 1);
      }
    }

    /** Qué le pasa al equipo elegido con las reglas (o null si está bien). */
    function teamProblem() {
      const bad = setup.picks.map((id) => PF.rosterById(id)).find((r) => banned(r));
      if (bad) return `${bad.name}: ${banned(bad).toLowerCase()}`;
      return PF.Rules.teamError(setup.picks.slice(0, setup.size).map((id) => PF.rosterById(id)), rules, setup.size);
    }

    function buy(price, apply, label) {
      if (save.coins < price) { toast(`Te faltan ${price - save.coins} monedas.`); PF.Audio.sfx.fail(); return; }
      save.coins -= price;
      apply();
      PF.Save.save();
      PF.Audio.sfx.coin();
      toast(`¡${label} desbloqueado!`);
      refresh();
    }

    function refreshStadiums() {
      const box = s.querySelector('.stadiums');
      box.innerHTML = '<div class="chips"><span>Cancha</span></div>';
      const row = box.firstChild;
      for (const st of PF.STADIUMS) {
        const owned = save.stadiums.includes(st.id);
        const b = el(`<button class="${setup.stadium === st.id ? 'on' : ''} ${owned ? '' : 'locked'}" title="${st.desc}">
          ${st.name}${owned ? '' : ` <small><i class="coin"></i>${st.price}</small>`}</button>`);
        b.onclick = () => {
          if (!owned) {
            if (b.dataset.sure) buy(st.price, () => { save.stadiums.push(st.id); setup.stadium = st.id; }, st.name);
            else { b.dataset.sure = '1'; b.innerHTML = `¿Comprar? <small><i class="coin"></i>${st.price}</small>`; }
            return;
          }
          setup.stadium = st.id;
          PF.Audio.sfx.click();
          PF.Save.save();
          refresh();
        };
        row.appendChild(b);
      }
      const cur = PF.stadiumById(setup.stadium);
      row.appendChild(el(`<em>${cur.desc}</em>`));
    }

    function refreshDetail() {
      const r = PF.rosterById(focus);
      const d = s.querySelector('.detail');
      const unlocked = PF.isUnlocked(r);
      const ai = setup.abil[r.id] || 0;
      // la habilidad que se muestra: la elegida, o la que se tocó para ver/comprar
      const shown = abFocus && abFocus.id === r.id ? abFocus.i : ai;
      d.style.setProperty('--tc', r.color);
      const role = PF.ROLES[PF.naturalRole(r)];
      const tier = PF.TIERS[r.tier];
      const types = PF.typesOf(r).map((t) => PF.TYPE_ES[t] || t).join(' / ');
      d.innerHTML = `
        <canvas width="120" height="104"></canvas>
        <div class="info">
          <div class="name">${r.name} <small>#${r.dex} · ${types}</small> <span class="rolechip" style="background:${role.color}">${role.short}</span> <span class="tierchip t-${r.tier}">${tier.label}</span></div>
          ${statBar('Velocidad', (r.speed - 200) / 150)}
          ${statBar('Tiro', (r.power - 0.7) / 0.6)}
          ${statBar('Peso', r.mass / 2.8)}
          ${statBar('Energía', (PF.staminaMax(r) - 60) / 75)}
          ${statBar('Vida', (PF.hpMax(r) - 60) / 80)}
        </div>
        <div class="abil">
          <div class="abs">
            ${r.abilities.map((a, i) => `<button class="abtn ${i === ai ? 'on' : ''} ${i === shown && i !== ai ? 'peek' : ''} ${PF.abilityOwned(r, i) ? '' : 'locked'}" data-i="${i}">${PF.abilityOwned(r, i) ? '' : '🔒 '}${a.name} <small>${a.cd} s</small></button>`).join('')}
          </div>
          <div class="ab">${r.abilities[shown].desc} <b>Recarga: ${r.abilities[shown].cd} s.</b></div>
          <div class="unlock"></div>
        </div>`;
      portraits.push({ canvas: d.querySelector('canvas'), r, big: true });
      d.querySelectorAll('.abtn').forEach((b) => {
        b.onclick = () => {
          const i = +b.dataset.i;
          if (PF.abilityOwned(r, i)) { setup.abil[r.id] = i; abFocus = null; PF.Save.save(); }
          else abFocus = { id: r.id, i };   // sin comprar: se muestra y aparece el botón de compra
          PF.Audio.sfx.click();
          refresh();
        };
      });
      const u = d.querySelector('.unlock');
      if (!unlocked) {
        if (r.unlock.coins) {
          // las evoluciones piden tener la preevolución y haber jugado con ella
          const cb = PF.canBuy(r);
          if (r.unlock.needs) {
            const pn = cb.prev ? cb.prev.name : r.unlock.needs;
            u.appendChild(el(`<div class="req ${cb.ok ? 'ok' : ''}">
              ${cb.owned ? '✔' : '✘'} Tener a ${pn} ·
              ${cb.have >= cb.plays ? '✔' : '✘'} ${Math.min(cb.have, cb.plays)}/${cb.plays} partidos con ${pn}</div>`));
          }
          const b = el(`<button class="btn buy" ${cb.ok ? '' : 'disabled'}>Desbloquear · <i class="coin"></i>${r.unlock.coins}</button>`);
          b.onclick = () => buy(r.unlock.coins, () => save.unlocked.push(r.id), r.name);
          u.appendChild(b);
        } else {
          u.innerHTML = `<span class="challenge">🔒 Reto: ${r.unlock.label}</span>`;
        }
      } else if (!PF.abilityOwned(r, shown)) {
        const price = PF.abilityPrice(r, shown), ab = r.abilities[shown];
        const b = el(`<button class="btn buy small">Comprar ${ab.name} · <i class="coin"></i>${price}</button>`);
        b.onclick = () => buy(price, () => { PF.buyAbility(r, shown); setup.abil[r.id] = shown; abFocus = null; }, ab.name);
        u.appendChild(b);
      } else if (r.abilities.some((_, i) => !PF.abilityOwned(r, i))) {
        u.innerHTML = '<span class="hint2">Toca un movimiento con 🔒 para verlo y comprarlo.</span>';
      }
    }

    function refreshBoard() {
      const slot = s.querySelector('.boardslot');
      const defs = setup.picks.slice(0, setup.size).map((id) => PF.withAbility(PF.rosterById(id), setup.abil[id] || 0));
      if (!defs.length) { slot.innerHTML = '<div class="empty">Elige tus Pokémon para acomodarlos.</div>'; slot.classList.remove('board'); return; }
      const key = setup.size + '-' + setup.keeper;
      setup.spots[key] = setup.spots[key] || {};
      const spots = PF.Board.spotsFor(setup.spots[key], defs, setup.keeper, setup.size);
      const b = PF.Board.mount(slot, {
        defs, spots, mode: setup.keeper,
        onChange: (sp) => { PF.Board.storeSpots(setup.spots[key], defs, sp); PF.Save.save(); },
      });
      portraits.push(...b.canvases);
    }

    function refresh() {
      // retratos: quitar los del detalle y la pizarra viejos (se vuelven a añadir)
      portraits = portraits.filter((p) => !p.big && !p.small);
      s.querySelectorAll('.chips[data-name]').forEach((g) => {
        const name = g.dataset.name;
        const val = { Formato: setup.size, Tiempo: setup.time, Rival: setup.diff, Arquero: setup.keeper }[name];
        g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(val)));
      });
      s.querySelectorAll('.mini').forEach((c) => {
        const r = PF.rosterById(c.dataset.id), i = setup.picks.indexOf(r.id), un = PF.isUnlocked(r);
        c.classList.toggle('on', i >= 0);
        c.classList.toggle('focus', r.id === focus);
        c.classList.toggle('locked', !un);
        const why = banned(r);
        c.classList.toggle('banned', !!why && un);
        c.title = why || '';
        c.querySelector('.pick').textContent = i < 0 ? '' : i < setup.size ? String(i + 1) : 'S';
        c.querySelector('.lock').innerHTML = un ? '' : r.unlock.coins ? `<i class="coin"></i>${r.unlock.coins}` : '🔒 reto';
      });
      s.querySelector('.selhead .coins').outerHTML = coinHTML(save.coins);
      refreshStadiums();
      refreshDetail();
      refreshBoard();
      const team = s.querySelector('.team');
      s.querySelector('.keeperhelp').textContent = KEEPER_HELP[setup.keeper];
      team.innerHTML = `<span>Tu equipo</span>` + Array.from({ length: setup.size + BENCH_MAX }, (_, i) => {
        const r = setup.picks[i] && PF.rosterById(setup.picks[i]), sup = i >= setup.size;
        return `<b class="${r ? 'full' : ''} ${sup ? 'sup' : ''}" style="--tc:${r ? r.color : '#5b6f99'}">${sup ? '<small>SUP</small> ' : ''}${r ? r.name : sup ? 'opcional' : '🎲 al azar'}</b>`;
      }).join('');
      // con uno solo ya se puede jugar: el resto se completa al azar (PF.randomFill)
      const go = s.querySelector('[data-act=go]');
      const missing = setup.size - setup.picks.length;
      const problem = setup.picks.length ? teamProblem() : null;
      const msg = s.querySelector('.rulemsg');
      const sum = PF.Rules.summary(rules, opts.mode === 'tournament');
      msg.innerHTML = problem ? `<span class="bad">⚠ ${problem}</span> <button class="btn small" data-act="fix">Quitar los que no cumplen</button>` : sum.length ? `Reglas: ${sum.join(' · ')}` : '';
      const fixb = msg.querySelector('[data-act=fix]');
      if (fixb) fixb.onclick = () => { fixPicks(); PF.Save.save(); refresh(); };
      s.querySelector('.rulesbtn').textContent = sum.length ? `⚙ Reglas (${sum.length})` : '⚙ Reglas';
      go.disabled = setup.picks.length < 1 || !!problem;
      go.textContent = go.disabled ? (problem ? 'Revisa las reglas' : 'Elige al menos 1') : missing > 0 && goLabel === '¡A la cancha!' ? `¡A la cancha! (+${missing} 🎲)` : goLabel;
    }

    // limpia elecciones que ya no valen (p. ej. tras borrar el progreso)
    setup.picks = setup.picks.filter((id) => { const r = PF.rosterById(id); return r && PF.isUnlocked(r); });
    if (!PF.STADIUMS.some((x) => x.id === setup.stadium) || !save.stadiums.includes(setup.stadium)) setup.stadium = 'estadio';
    root().appendChild(s);
    applyFilter();
    refresh();
    const cur = s.querySelector(`.mini[data-id="${focus}"]`);
    if (cur && cur.style.display !== 'none') grid.scrollTop = Math.max(0, cur.offsetTop - 8);
    updateVisible();
  }

  /** Retrato animado de una especie (modo historia). */
  function addPortrait(canvas, dex, sc = 1) {
    portraits.push({ canvas, dex, sc: sc * PF.species(dex).scale });
  }
  function clearPortraits() { portraits = []; }

  /** Animación de evolución: parpadea entre las dos formas cada vez más rápido. */
  function addEvolution(canvas, from, to, onDone) {
    portraits.push({ canvas, evo: { from, to, t0: null, onDone } });
  }

  function tickPortraits(t) {
    for (const p of portraits) {
      if (p.hidden || !p.canvas.isConnected) continue;
      const g = p.canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, p.canvas.width, p.canvas.height);
      const cx = p.canvas.width / 2, by = p.canvas.height - 10;
      if (p.evo) {
        const e = p.evo;
        if (e.t0 === null) e.t0 = t;
        const k = Math.min(1, (t - e.t0) / 3.2);
        const showTo = k >= 1 || Math.sin((t - e.t0) * (4 + k * k * 40)) > 0;
        const dex = showTo ? e.to : e.from;
        PF.Sprites.draw(g, dex, 'Idle', t, true, Math.PI / 2, cx, by, 1.3 * PF.species(dex).scale);
        if (k < 1) {
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * k})`;
          g.fillRect(0, 0, p.canvas.width, p.canvas.height);
          g.globalCompositeOperation = 'source-over';
        } else if (e.onDone) { const cb = e.onDone; e.onDone = null; cb(); }
        continue;
      }
      if (p.dex) { PF.Sprites.draw(g, p.dex, 'Idle', t, true, Math.PI / 2, cx, by, p.sc); continue; }
      const sc = (p.big ? 1 : p.small ? 0.55 : 0.8) * (p.r.scale || 1);
      PF.Sprites.draw(g, p.r.dex, 'Idle', t, true, Math.PI / 2, cx, by, sc);
    }
  }

  // ---------------------------------------------------------------- pausa / resultado
  function pause(onResume, onRestart, onQuit, quitLabel = 'Salir al menú', subs = null) {
    clear();
    const s = el(`
      <div class="screen">
        <div class="box menu">
          <h2>Pausa</h2>
          <button class="btn" data-act="resume">Seguir</button>
          ${subs ? `<button class="btn" data-act="subs" ${subs.left > 0 && subs.bench > 0 ? '' : 'disabled'}>Cambios (${subs.left} restantes)</button>` : ''}
          <button class="btn" data-act="restart">Reiniciar partido</button>
          <button class="btn" data-act="quit">${quitLabel}</button>
          <div class="hint">${hintLine()}</div>
        </div>
      </div>`);
    s.querySelector('[data-act=resume]').onclick = onResume;
    if (subs) s.querySelector('[data-act=subs]').onclick = subs.open;
    s.querySelector('[data-act=restart]').onclick = onRestart;
    s.querySelector('[data-act=quit]').onclick = onQuit;
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  /**
   * Cambios: elegir uno de la cancha y uno del banco. Muestra la energía de
   * cada uno; los cambios se hacen al instante (el partido está en pausa).
   */
  function subs(m, onBack) {
    clear();
    const team = m.humanTeam;
    let out = null, inn = null;
    const s = el(`
      <div class="screen">
        <div class="box menu subs">
          <h2>Cambios <small class="left"></small></h2>
          <div class="hint">Elige quién sale y quién entra. <kbd>${K.label('subs')}</kbd> o <kbd>${K.label('pause')}</kbd> para volver al partido.</div>
          <div class="subcols"><div class="field"><h3>En cancha</h3></div><div class="benchc"><h3>Banco</h3></div></div>
          <div class="row">
            <button class="btn" data-act="back">Volver</button>
            <button class="btn big" data-act="do" disabled>Hacer el cambio</button>
          </div>
        </div>
      </div>`);
    const color = (v) => (v > 60 ? '#5fd68a' : v > 40 ? '#ffd23f' : v > 15 ? '#ff8a3d' : '#ff5a5f');
    // x = jugador o suplente (con vida y energía); los K.O. no pueden entrar
    const row = (x, extra) => {
      const def = x.def, e = Math.round(PF.Match.energyPct(x)), hp = Math.round(PF.Match.hpPct(x));
      const r = el(`<div class="subrow ${x.fainted ? 'ko' : ''}" tabindex="0" role="button">
        <canvas width="52" height="44"></canvas>
        <div>${def.name} <small>${extra}${x.fainted ? ` · K.O. ${Math.ceil(x.ko)} s` : ''}</small></div>
        <div class="bars">
          <div class="ebar" title="Vida"><b style="width:${hp}%;background:${hp > 55 ? '#4fd1ff' : hp > 30 ? '#ffd23f' : '#ff5a5f'}"></b></div>
          <div class="ebar" title="Energía"><b style="width:${e}%;background:${color(e)}"></b></div>
        </div></div>`);
      portraits.push({ canvas: r.querySelector('canvas'), r: def, small: true });
      return r;
    };
    function refresh() {
      portraits = [];
      s.querySelector('.left').textContent = `(${m.subsLeft[team]} restantes)`;
      const f = s.querySelector('.field'), b = s.querySelector('.benchc');
      f.querySelectorAll('.subrow').forEach((x) => x.remove());
      b.querySelectorAll('.subrow').forEach((x) => x.remove());
      for (const p of PF.Match.teamOf(m, team)) {
        const r = row(p, PF.ROLES[p.pos].short + (p === m.keeper[team] ? ' · arquero' : ''));
        r.classList.toggle('on', p === out);
        r.onclick = () => { out = p; refresh(); };
        f.appendChild(r);
      }
      m.bench[team].forEach((seat, i) => {
        const r = row(seat, PF.ROLES[PF.naturalRole(seat.def)].short);
        r.classList.toggle('on', i === inn);
        r.onclick = () => { if (!seat.fainted) { inn = i; refresh(); } };
        b.appendChild(r);
      });
      s.querySelector('[data-act=do]').disabled = !(out && inn !== null && m.subsLeft[team] > 0);
    }
    s.querySelector('[data-act=back]').onclick = onBack;
    s.querySelector('[data-act=do]').onclick = () => {
      if (PF.Match.substitute(m, out, inn)) { out = null; inn = null; refresh(); }
    };
    root().appendChild(s);
    refresh();
  }

  /** reward: { coins, lines: [[texto, monedas]], unlocked: [nombres] } */
  /**
   * Botones con callback null no se muestran. extra: { rematch, team, menu } (textos), note.
   * Ganar o perder se cuenta desde el equipo de quien mira (m.humanTeam).
   */
  function result(m, reward, onRematch, onTeam, onMenu, extra = {}) {
    clear();
    const mine = Math.max(0, m.humanTeam);
    const won = m.winner === mine, lost = m.winner === 1 - mine;
    const s = el(`
      <div class="screen">
        <div class="box menu result">
          <h2 class="${extra.title ? '' : won ? 'won' : lost ? 'lost' : ''}">${extra.title || (won ? '¡Ganaste!' : lost ? 'Perdiste...' : 'Empate')}</h2>
          <div class="final"><span style="color:${PF.TEAM_COLORS[0]}">${m.score[0]}</span> - <span style="color:${PF.TEAM_COLORS[1]}">${m.score[1]}</span></div>
          ${reward.lines.length ? `<div class="reward">
            ${reward.lines.map(([t, c]) => `<div><span>${t}</span><b>+${c}</b></div>`).join('')}
            <div class="total"><span>Total</span>${coinHTML('+' + reward.coins)}</div>
          </div>` : ''}
          ${reward.unlocked.map((n) => `<div class="new">¡Nuevo Pokémon desbloqueado: <b>${n}</b>!</div>`).join('')}
          ${extra.note ? `<div class="hint">${extra.note}</div>` : ''}
          ${onRematch ? `<button class="btn big" data-act="rematch">${extra.rematch || 'Revancha'}</button>` : ''}
          ${onTeam ? `<button class="btn" data-act="team">${extra.team || 'Cambiar equipo'}</button>` : ''}
          <button class="btn" data-act="menu">${extra.menu || 'Menú'}</button>
        </div>
      </div>`);
    if (onRematch) s.querySelector('[data-act=rematch]').onclick = onRematch;
    if (onTeam) s.querySelector('[data-act=team]').onclick = onTeam;
    s.querySelector('[data-act=menu]').onclick = onMenu;
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  return { clear, title, options, select, rulesScreen, tickPortraits, addPortrait, clearPortraits, addEvolution, pause, subs, result, toast };
})();
