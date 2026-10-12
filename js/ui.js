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

  const BENCH_MAX = 2;   // suplentes en partido rápido
  const KEEPER_HELP = {
    fixed: 'Arquero fijo: uno se queda en el arco y se mueve por el área grande.',
    dynamic: 'Arquero dinámico: ataja el que esté más cerca del arco en cada momento.',
  };

  const coinHTML = (n) => `<span class="coins"><i class="coin"></i>${n}</span>`;

  function toast(msg) {
    const t = el(`<div class="toast">${msg}</div>`);
    root().appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------------------------------------------------------------- título
  function title(onPlay, onCareer, onOptions) {
    clear();
    const s = el(`
      <div class="screen title">
        <div class="topbar">${coinHTML(PF.Save.data.coins)}</div>
        <div class="logo">Poké<span>Fútbol</span></div>
        <div class="tagline">fútbol de dibujos animados · sin reglas, con rayos</div>
        <div class="row">
          <button class="btn big" data-act="play">Partido rápido</button>
          <button class="btn big story" data-act="career">Modo Historia</button>
          <button class="btn" data-act="opts">Opciones</button>
        </div>
        <div class="box controls">
          <div><kbd>WASD</kbd> mover</div>
          <div><kbd>J</kbd> pase · sin pelota: placaje</div>
          <div><kbd>K</kbd> tiro (mantén para cargar)</div>
          <div><kbd>L</kbd> habilidad del Pokémon</div>
          <div><kbd>Espacio</kbd> presionar (ir a la pelota)</div>
          <div><kbd>Q</kbd> cambiar de Pokémon</div>
          <div>al tirar, <kbd>↑</kbd>/<kbd>↓</kbd> eligen palo</div>
          <div><kbd>T</kbd> orden al equipo: neutro, ataque o defensa</div>
          <div><kbd>R</kbd> cambios (suplentes)</div>
          <div><kbd>Esc</kbd> pausa · <kbd>M</kbd> silencio</div>
        </div>
        <div class="foot">Sprites de SpriteCollab (CC BY-NC 4.0) · proyecto de fans sin ánimo de lucro · ver CREDITS.md</div>
      </div>`);
    s.querySelector('[data-act=play]').onclick = onPlay;
    s.querySelector('[data-act=career]').onclick = onCareer;
    s.querySelector('[data-act=opts]').onclick = onOptions;
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
    s.querySelector('[data-act=back]').onclick = onBack;
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

  /** onGo() cuando el equipo está completo; la elección queda en PF.Save.data.setup. */
  function select(onGo, onBack) {
    clear();
    const save = PF.Save.data, setup = save.setup;
    let focus = setup.picks[0] || PF.ROSTER[0].id;

    const s = el(`
      <div class="screen select">
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
        </div>
        <div class="setup stadiums"></div>
        <div class="grid"></div>
        <div class="lower">
          <div class="detail box"></div>
          <div class="boardbox box">
            <div class="bt">Pizarra <small>arrastra a cada uno · ★ = su puesto</small></div>
            <div class="boardslot"></div>
          </div>
        </div>
        <div class="row foot-row">
          <div class="team"></div>
          <button class="btn" data-act="back">Volver</button>
          <button class="btn big" data-act="go">¡A la cancha!</button>
        </div>
      </div>`);

    const grid = s.querySelector('.grid');
    for (const r of PF.ROSTER) {
      const c = el(`
        <div class="mini" role="button" tabindex="0" data-id="${r.id}" style="--tc:${r.color}">
          <span class="pick"></span>
          <canvas width="96" height="72"></canvas>
          <div class="nm">${r.name}</div>
          <div class="lock"></div>
        </div>`);
      portraits.push({ canvas: c.querySelector('canvas'), r });
      c.onclick = () => clickPokemon(r);
      c.onkeydown = (e) => { if (e.key === 'Enter') clickPokemon(r); };
      grid.appendChild(c);
    }

    function clickPokemon(r) {
      focus = r.id;
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
    s.querySelector('[data-act=go]').onclick = () => { if (setup.picks.length >= setup.size) onGo(); };

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
      d.style.setProperty('--tc', r.color);
      const role = PF.ROLES[PF.naturalRole(r)];
      d.innerHTML = `
        <canvas width="120" height="104"></canvas>
        <div class="info">
          <div class="name">${r.name} <small>${r.type}</small> <span class="rolechip" style="background:${role.color}">${role.short}</span></div>
          ${statBar('Velocidad', (r.speed - 200) / 150)}
          ${statBar('Tiro', (r.power - 0.7) / 0.6)}
          ${statBar('Peso', r.mass / 2.8)}
          ${statBar('Energía', (PF.staminaMax(r) - 60) / 75)}
        </div>
        <div class="abil">
          <div class="abs">
            ${r.abilities.map((a, i) => `<button class="abtn ${i === ai ? 'on' : ''}" data-i="${i}">${a.name} <small>${a.cd} s</small></button>`).join('')}
          </div>
          <div class="ab">${r.abilities[ai].desc} <b>Recarga: ${r.abilities[ai].cd} s.</b></div>
          <div class="unlock"></div>
        </div>`;
      portraits.push({ canvas: d.querySelector('canvas'), r, big: true });
      d.querySelectorAll('.abtn').forEach((b) => {
        b.onclick = () => { setup.abil[r.id] = +b.dataset.i; PF.Save.save(); PF.Audio.sfx.click(); refresh(); };
      });
      const u = d.querySelector('.unlock');
      if (!unlocked) {
        if (r.unlock.coins) {
          const b = el(`<button class="btn buy">Desbloquear · <i class="coin"></i>${r.unlock.coins}</button>`);
          b.onclick = () => buy(r.unlock.coins, () => save.unlocked.push(r.id), r.name);
          u.appendChild(b);
        } else {
          u.innerHTML = `<span class="challenge">🔒 Reto: ${r.unlock.label}</span>`;
        }
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
        return `<b class="${r ? 'full' : ''} ${sup ? 'sup' : ''}" style="--tc:${r ? r.color : '#5b6f99'}">${sup ? '<small>SUP</small> ' : ''}${r ? r.name : sup ? 'opcional' : '—'}</b>`;
      }).join('');
      const go = s.querySelector('[data-act=go]');
      go.disabled = setup.picks.length < setup.size;
      go.textContent = go.disabled ? `Elige ${setup.size - setup.picks.length} más` : '¡A la cancha!';
    }

    // limpia elecciones que ya no valen (p. ej. tras borrar el progreso)
    setup.picks = setup.picks.filter((id) => { const r = PF.rosterById(id); return r && PF.isUnlocked(r); });
    if (!PF.STADIUMS.some((x) => x.id === setup.stadium) || !save.stadiums.includes(setup.stadium)) setup.stadium = 'estadio';
    root().appendChild(s);
    refresh();
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
      if (!p.canvas.isConnected) continue;
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
          <div class="hint">J pase/placaje · K tiro · L habilidad · Espacio presionar · Q cambiar · T orden · R cambios</div>
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
          <div class="hint">Elige quién sale y quién entra. <kbd>R</kbd> o <kbd>Esc</kbd> para volver al partido.</div>
          <div class="subcols"><div class="field"><h3>En cancha</h3></div><div class="benchc"><h3>Banco</h3></div></div>
          <div class="row">
            <button class="btn" data-act="back">Volver</button>
            <button class="btn big" data-act="do" disabled>Hacer el cambio</button>
          </div>
        </div>
      </div>`);
    const color = (v) => (v > 60 ? '#5fd68a' : v > 40 ? '#ffd23f' : v > 15 ? '#ff8a3d' : '#ff5a5f');
    const row = (def, stamina, extra) => {
      const r = el(`<div class="subrow" tabindex="0" role="button">
        <canvas width="52" height="44"></canvas>
        <div>${def.name} <small>${extra}</small></div>
        <div class="ebar"><b style="width:${stamina}%;background:${color(stamina)}"></b></div></div>`);
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
        const r = row(p.def, Math.round(PF.Match.energyPct(p)), PF.ROLES[p.pos].short + (p === m.keeper[team] ? ' · arquero' : ''));
        r.classList.toggle('on', p === out);
        r.onclick = () => { out = p; refresh(); };
        f.appendChild(r);
      }
      m.bench[team].forEach((seat, i) => {
        const r = row(seat.def, Math.round(PF.Match.energyPct(seat)), PF.ROLES[PF.naturalRole(seat.def)].short);
        r.classList.toggle('on', i === inn);
        r.onclick = () => { inn = i; refresh(); };
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
  function result(m, reward, onRematch, onTeam, onMenu) {
    clear();
    const won = m.winner === 0, lost = m.winner === 1;
    const s = el(`
      <div class="screen">
        <div class="box menu result">
          <h2 class="${won ? 'won' : lost ? 'lost' : ''}">${won ? '¡Ganaste!' : lost ? 'Perdiste...' : 'Empate'}</h2>
          <div class="final"><span style="color:${PF.TEAM_COLORS[0]}">${m.score[0]}</span> - <span style="color:${PF.TEAM_COLORS[1]}">${m.score[1]}</span></div>
          <div class="reward">
            ${reward.lines.map(([t, c]) => `<div><span>${t}</span><b>+${c}</b></div>`).join('')}
            <div class="total"><span>Total</span>${coinHTML('+' + reward.coins)}</div>
          </div>
          ${reward.unlocked.map((n) => `<div class="new">¡Nuevo Pokémon desbloqueado: <b>${n}</b>!</div>`).join('')}
          <button class="btn big" data-act="rematch">Revancha</button>
          <button class="btn" data-act="team">Cambiar equipo</button>
          <button class="btn" data-act="menu">Menú</button>
        </div>
      </div>`);
    s.querySelector('[data-act=rematch]').onclick = onRematch;
    s.querySelector('[data-act=team]').onclick = onTeam;
    s.querySelector('[data-act=menu]').onclick = onMenu;
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  return { clear, title, options, select, tickPortraits, addPortrait, clearPortraits, addEvolution, pause, subs, result, toast };
})();
