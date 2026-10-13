/* ============ ui-career.js — pantallas del modo historia ============
 * Inicio (elegir inicial), club (titulares, habilidades, pizarra, gimnasios),
 * previa del partido, experiencia ganada, evolución, reclutar y mejoras.
 * Comparten el sistema de retratos animados de ui.js (PF.UI.addPortrait).
 */
PF.CareerUI = (() => {
  const C = () => PF.Career;
  const root = () => document.getElementById('ui');

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const coinHTML = (n) => `<span class="coins"><i class="coin"></i>${n}</span>`;
  const roleChip = (def) => {
    const r = PF.ROLES[PF.naturalRole(def)];
    return `<span class="rolechip" style="background:${r.color}">${r.short}</span>`;
  };
  function show(node) {
    PF.UI.clear();
    root().appendChild(node);
    node.querySelectorAll('canvas[data-dex]').forEach((cv) => PF.UI.addPortrait(cv, +cv.dataset.dex, +(cv.dataset.sc || 1)));
    const b = node.querySelector('button.big, button');
    if (b) b.focus();
  }
  const portrait = (dex, w = 72, h = 64, sc = 0.8) => `<canvas width="${w}" height="${h}" data-dex="${dex}" data-sc="${sc}"></canvas>`;

  // ------------------------------------------------------------------ inicio
  function start(onStart, onBack) {
    let pick = PF.CAREER_STARTERS[0];
    const s = el(`
      <div class="screen career">
        <h2>Modo Historia</h2>
        <div class="intro">Arma tu club, gana experiencia, evoluciona a tus Pokémon y conquista los 7 gimnasios.
          Cada gimnasio es una copa de 3 partidos: si pierdes, la copa se termina… pero tu club conserva lo que aprendió.</div>
        <div class="starters">
          ${PF.CAREER_STARTERS.map((dex) => {
            const sp = PF.species(dex);
            return `<div class="starter" data-dex="${dex}" style="--tc:${sp.color}" tabindex="0" role="button">
              ${portrait(dex, 120, 100, 1)}
              <div class="nm">${sp.name}</div>
              <div class="tp">${sp.type} ${roleChip(sp)}</div>
            </div>`;
          }).join('')}
        </div>
        <label class="clubname">Nombre del club <input maxlength="24" value="Club Paleta"></label>
        <div class="row">
          <button class="btn" data-act="back">Volver</button>
          <button class="btn big" data-act="go">¡Empezar!</button>
        </div>
      </div>`);
    const mark = () => s.querySelectorAll('.starter').forEach((c) => c.classList.toggle('on', +c.dataset.dex === pick));
    s.querySelectorAll('.starter').forEach((c) => { c.onclick = () => { pick = +c.dataset.dex; PF.Audio.sfx.click(); mark(); }; });
    mark();
    s.querySelector('[data-act=back]').onclick = onBack;
    s.querySelector('[data-act=go]').onclick = () => onStart(pick, s.querySelector('input').value.trim());
    show(s);
  }

  // ------------------------------------------------------------------ club
  function hub(h) {
    const car = C().data();
    for (const mb of car.club) PF.Sprites.preload(mb.dex);
    let focus = h.focus ?? car.lineup[0];
    const s = el(`
      <div class="screen career hub">
        <div class="selhead">
          <h2>${car.name}</h2>
          <div class="badges">${PF.GYMS.map((g) => `<i class="badge ${car.badges.includes(g.id) ? 'on' : ''}" title="${g.badge}" style="--tc:${PF.species(g.team[2]).color}"></i>`).join('')}</div>
          ${coinHTML(PF.Save.data.coins)}
        </div>
        <div class="hubcols">
          <div class="col">
            <div class="clubgrid"></div>
            <div class="mdetail box"></div>
          </div>
          <div class="col right">
            <div class="boardbox box">
              <div class="bt">Pizarra <small>titulares · el resto, al banco</small>
                <span class="chips keeper" data-name="Arquero"><span>Arquero</span><button data-v="fixed" title="Uno es el arquero; sale a cerrar cuando hace falta y un compañero lo releva">Fijo</button><button data-v="dynamic" title="Ataja el que esté más cerca del arco en cada momento">Dinámico</button></span></div>
              <div class="boardslot"></div>
            </div>
            <div class="gyms box"></div>
          </div>
        </div>
        <div class="row foot-row">
          <button class="btn" data-act="back">Menú</button>
        </div>
      </div>`);
    s.querySelector('[data-act=back]').onclick = h.onBack;
    s.querySelectorAll('.keeper button').forEach((b) => {
      b.onclick = () => { car.keeper = b.dataset.v; PF.Save.save(); PF.Audio.sfx.click(); refresh(); };
    });

    function refresh() {
      PF.UI.clearPortraits();
      // club
      const grid = s.querySelector('.clubgrid');
      grid.innerHTML = '';
      for (const mb of car.club) {
        const def = C().defOf(mb), sp = PF.species(mb.dex), li = car.lineup.indexOf(mb.uid);
        const evo = sp.evolve;
        const c = el(`
          <div class="mcard ${li >= 0 ? 'on' : ''} ${mb.uid === focus ? 'focus' : ''}" style="--tc:${def.color}" tabindex="0" role="button">
            <span class="pick">${li >= 0 ? li + 1 : ''}</span>
            ${portrait(mb.dex, 64, 56, 0.7)}
            <div class="mi">
              <div class="nm">${def.name} ${roleChip(def)}</div>
              <div class="lv">Nv ${mb.level} <small>IV ${C().ivGrade(mb.ivs)}</small></div>
              <div class="xpbar"><b style="width:${Math.round((mb.xp / C().xpToNext(mb.level)) * 100)}%"></b></div>
              ${evo ? `<div class="evo">evoluciona al Nv ${evo.level}</div>` : ''}
            </div>
          </div>`);
        c.onclick = () => { focus = mb.uid; PF.Audio.sfx.click(); refresh(); };
        grid.appendChild(c);
      }
      refreshDetail();
      refreshBoard();
      refreshGyms();
      s.querySelectorAll('.keeper button').forEach((b) => b.classList.toggle('on', b.dataset.v === car.keeper));
      s.querySelectorAll('canvas[data-dex]').forEach((cv) => PF.UI.addPortrait(cv, +cv.dataset.dex, +(cv.dataset.sc || 1)));
    }

    function refreshDetail() {
      const d = s.querySelector('.mdetail');
      const mb = C().member(focus) || car.club[0];
      focus = mb.uid;
      const def = C().defOf(mb), sp = PF.species(mb.dex);
      const inLineup = car.lineup.includes(mb.uid);
      const ivBar = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.round((v / 31) * 100)}%"></b></i><em>${v}</em></div>`;
      d.style.setProperty('--tc', def.color);
      d.innerHTML = `
        <div class="dl">
          <div class="name">${def.name} <small>${def.type} · Nv ${mb.level}</small></div>
          <div class="nums">Vel ${def.speed} · Tiro ${def.power.toFixed(2)} · Peso ${def.mass.toFixed(2)} · Energía ${def.stamina}</div>
          ${ivBar('IV Vel', mb.ivs.spd)}${ivBar('IV Tiro', mb.ivs.pow)}${ivBar('IV Peso', mb.ivs.mass)}
        </div>
        <div class="dr">
          <div class="abs">
            ${sp.abilities.map((a, i) => {
              const locked = i >= def.unlockedAbilities;
              return `<button class="abtn ${i === Math.min(mb.abil, def.unlockedAbilities - 1) ? 'on' : ''}" data-i="${i}" ${locked ? 'disabled' : ''}>
                ${locked ? '🔒 ' : ''}${a.name} <small>${locked ? 'Nv ' + C().ABILITY2_LEVEL : a.cd + ' s'}</small></button>`;
            }).join('')}
          </div>
          <div class="ab">${def.ability.desc}</div>
          <div class="row">
            <button class="btn small" data-act="lineup">${inLineup ? 'Quitar de titulares' : 'Poner de titular'}</button>
            <button class="btn small danger" data-act="release">Liberar</button>
          </div>
        </div>`;
      d.querySelectorAll('.abtn').forEach((b) => {
        b.onclick = () => { mb.abil = +b.dataset.i; PF.Save.save(); PF.Audio.sfx.click(); refresh(); };
      });
      d.querySelector('[data-act=lineup]').onclick = () => { C().toggleLineup(mb.uid); PF.Audio.sfx.click(); refresh(); };
      const rel = d.querySelector('[data-act=release]');
      rel.onclick = () => {
        if (!rel.dataset.sure) { rel.dataset.sure = '1'; rel.textContent = '¿Seguro?'; return; }
        if (C().release(mb.uid)) { focus = null; PF.UI.toast(`${def.name} volvió a la naturaleza.`); refresh(); }
        else PF.UI.toast('Necesitas al menos 3 Pokémon en el club.');
      };
    }

    function refreshBoard() {
      const slot = s.querySelector('.boardslot');
      const members = C().lineupMembers();
      if (members.length < C().TEAM_SIZE) {
        slot.classList.remove('board');
        slot.innerHTML = `<div class="empty">Elige ${C().TEAM_SIZE} titulares (te faltan ${C().TEAM_SIZE - members.length}).</div>`;
        return;
      }
      const defs = members.map(C().defOf);
      const b = PF.Board.mount(slot, {
        defs, spots: C().spotsFor(defs), mode: car.keeper,
        onChange: (sp) => C().saveSpots(defs, sp),
      });
      for (const p of b.canvases) PF.UI.addPortrait(p.canvas, p.r.dex, 0.55);
    }

    function refreshGyms() {
      const box = s.querySelector('.gyms');
      const ready = C().lineupMembers().length === C().TEAM_SIZE;
      box.innerHTML = '<div class="bt">Gimnasios</div>';
      if (car.run) {
        const g = C().gymOf(car.run);
        const r = el(`<div class="gym run"><div><b>${g.name}</b><small>Copa en curso · paso ${car.run.at ? car.run.at.l + 2 : 1} de ${C().MAP_LAYERS + 1}</small></div>
          <button class="btn small big" ${ready ? '' : 'disabled'}>Ver mapa</button></div>`);
        r.querySelector('button').onclick = () => h.onContinue();
        box.appendChild(r);
      }
      for (const g of PF.GYMS) {
        const st = C().gymStatus(g);
        const r = el(`<div class="gym ${st}">
          <i class="badge ${st === 'won' ? 'on' : ''}" style="--tc:${PF.species(g.team[2]).color}"></i>
          <div><b>${g.name}</b><small>${g.leader} · ${PF.TYPE_ES[g.type]} · Nv ${g.levels[0]}–${g.levels[1]}</small></div>
          ${st === 'locked' ? '<span class="lockt">🔒</span>' : `<button class="btn small" ${ready && !car.run ? '' : 'disabled'}>${st === 'won' ? 'Revancha' : 'Desafiar'}</button>`}
        </div>`);
        const b = r.querySelector('button');
        if (b) b.onclick = () => h.onChallenge(g.id);
        box.appendChild(r);
      }
    }

    show(s);
    refresh();
  }

  // ------------------------------------------------------------------ previa
  function versus(info, node, onGo, onMap, onAbandon) {
    const run = C().data().run, g = C().gymOf(run);
    const team = (members) => members.map((mb) => {
      const sp = PF.species(mb.dex);
      return `<div class="vsmon" style="--tc:${sp.color}">${portrait(mb.dex, 96, 84, 0.9)}<div>${sp.name}</div><small>Nv ${mb.level}</small></div>`;
    }).join('');
    const perks = run.perks.map((id) => C().PERKS.find((p) => p.id === id)).filter(Boolean);
    const s = el(`
      <div class="screen career">
        <div class="box menu vs">
          <h2>${g.name}</h2>
          <div class="stage">${Array.from({ length: C().MAP_LAYERS + 1 }, (_, i) => `<i class="${i < node.l ? 'done' : i === node.l ? 'cur' : ''}">${i === C().MAP_LAYERS ? 'Líder' : 'Paso ' + (i + 1)}</i>`).join('')}</div>
          <div class="vsrow">
            <div class="vsteam">${team(C().lineupMembers())}</div>
            <div class="vsx">VS</div>
            <div class="vsteam">${team(info.members)}</div>
          </div>
          <div class="vstitle">${C().NODE_INFO[node.type].icon} ${info.title}${info.leader ? ' — ¡el líder del gimnasio!' : info.elite ? ' — ¡cuidado, es de élite!' : info.wild ? ` — partido corto, ${info.time} s` : ''}</div>
          ${perks.length ? `<div class="perks">Mejoras: ${perks.map((p) => `<b title="${p.desc}">${p.name}</b>`).join(' · ')}</div>` : ''}
          <div class="row">
            <button class="btn danger" data-act="quit">Abandonar copa</button>
            <button class="btn" data-act="map">Volver al mapa</button>
            <button class="btn big" data-act="go">¡A jugar!</button>
          </div>
        </div>
      </div>`);
    s.querySelector('[data-act=go]').onclick = onGo;
    s.querySelector('[data-act=map]').onclick = onMap;
    const q = s.querySelector('[data-act=quit]');
    q.onclick = () => { if (q.dataset.sure) onAbandon(); else { q.dataset.sure = '1'; q.textContent = '¿Seguro? Se pierde la copa'; } };
    show(s);
  }

  // ------------------------------------------------------------------ después del partido
  function post(m, res, onContinue) {
    const rows = res.rows.filter((r) => r.starter).concat(res.rows.filter((r) => !r.starter));
    const s = el(`
      <div class="screen career">
        <div class="box menu post">
          <h2 class="${res.won ? 'won' : res.lost ? 'lost' : ''}">${res.won ? '¡Victoria!' : res.lost ? 'Derrota...' : 'Empate'}
            <span class="final small">${m.score[0]} - ${m.score[1]}</span></h2>
          <div class="xprows">
            ${rows.map((r) => {
              const sp = PF.species(r.mb.dex), st = r.stats;
              const up = r.after > r.before;
              return `<div class="xprow ${r.starter ? '' : 'bench'}" style="--tc:${sp.color}">
                ${portrait(r.mb.dex, 48, 42, 0.55)}
                <div class="nm">${sp.name}${r.starter ? '' : ' <small>(suplente)</small>'}</div>
                <div class="st">${st ? `⚽${st.goals} 🅰${st.assists} 💥${st.tackles} 🧤${st.saves}` : ''}</div>
                <div class="gain">+${r.xp} exp</div>
                <div class="lvl ${up ? 'up' : ''}">Nv ${r.before}${up ? ` → ${r.after}` : ''}</div>
                <div class="xpbar"><b style="width:${Math.round((r.mb.xp / C().xpToNext(r.mb.level)) * 100)}%"></b></div>
              </div>`;
            }).join('')}
          </div>
          ${res.abilityUnlocks.map((mb) => `<div class="new">¡${PF.species(mb.dex).name} aprendió una segunda habilidad!</div>`).join('')}
          <div class="reward"><div class="total"><span>Monedas</span>${coinHTML('+' + res.coins)}</div></div>
          <button class="btn big" data-act="go">Continuar</button>
        </div>
      </div>`);
    s.querySelector('[data-act=go]').onclick = onContinue;
    show(s);
  }

  // ------------------------------------------------------------------ evolución
  function evolve(mb, onDone) {
    const from = mb.dex, evo = PF.species(from).evolve;
    const opts = evo.options || [evo.to];
    opts.forEach(PF.Sprites.preload);
    const name = PF.species(from).name;
    const s = el(`
      <div class="screen career">
        <div class="box menu evo">
          <h2>¿Qué? ¡${name} está evolucionando!</h2>
          <canvas class="evocv" width="220" height="190"></canvas>
          <div class="evomsg">&nbsp;</div>
          <div class="row choices"></div>
        </div>
      </div>`);
    show(s);
    const cv = s.querySelector('.evocv');
    PF.Audio.sfx.phase();
    const finish = (to) => {
      PF.UI.addEvolution(cv, from, to, () => {
        C().evolve(mb, to);
        s.querySelector('.evomsg').textContent = `¡${name} evolucionó en ${PF.species(to).name}!`;
        PF.Audio.sfx.goal();
        const b = el('<button class="btn big">¡Genial!</button>');
        b.onclick = onDone;
        s.querySelector('.choices').appendChild(b);
        b.focus();
      });
    };
    if (opts.length === 1) finish(opts[0]);
    else {
      PF.UI.addPortrait(cv, from, 1.3);
      s.querySelector('.evomsg').textContent = '¿En qué quieres que evolucione?';
      const row = s.querySelector('.choices');
      for (const to of opts) {
        const sp = PF.species(to);
        const b = el(`<button class="btn" style="border-color:${sp.color}">${sp.name} <small>(${sp.type})</small></button>`);
        b.onclick = () => { row.innerHTML = ''; PF.UI.clearPortraits(); finish(to); };
        row.appendChild(b);
      }
    }
  }

  // ------------------------------------------------------------------ elegir (reclutar / mejoras)
  /** items: [{ dex?, title, sub }] · onPick(i) o onPick(null) si se salta. */
  function choose(title, subtitle, items, onPick, skipLabel) {
    const s = el(`
      <div class="screen career">
        <div class="box menu choose">
          <h2>${title}</h2>
          <div class="intro">${subtitle}</div>
          <div class="options">
            ${items.map((it, i) => `<div class="opt" data-i="${i}" tabindex="0" role="button" ${it.color ? `style="--tc:${it.color}"` : ''}>
              ${it.dex ? portrait(it.dex, 110, 96, 1) : ''}
              <b>${it.title}</b><small>${it.sub}</small></div>`).join('')}
          </div>
          ${skipLabel ? `<button class="btn" data-act="skip">${skipLabel}</button>` : ''}
        </div>
      </div>`);
    s.querySelectorAll('.opt').forEach((o) => {
      const go = () => { PF.Audio.sfx.pickup(); onPick(+o.dataset.i); };
      o.onclick = go;
      o.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
    const sk = s.querySelector('[data-act=skip]');
    if (sk) sk.onclick = () => onPick(null);
    show(s);
  }

  // ------------------------------------------------------------------ mapa de la copa
  /** h = { onNode(nd), onClub(), onAbandon() } */
  function map(run, h) {
    const g = C().gymOf(run), info = C().NODE_INFO;
    C().ensureMap(run);
    const lay = run.map;
    const px = (nd) => 9 + nd.l * (82 / C().MAP_LAYERS);
    const py = (nd) => ((nd.i + 1) / (lay[nd.l].length + 1)) * 100;
    const mine = C().lineupMembers();
    for (const mb of mine) PF.Sprites.preload(mb.dex);
    PF.Sprites.preload(g.team[2]);
    const perks = run.perks.map((id) => C().PERKS.find((p) => p.id === id)).filter(Boolean);
    // líneas: recorrido hecho (verde), próximos pasos (amarillo), el resto apagado
    const lines = [];
    for (const col of lay) for (const nd of col) for (const j of nd.to) {
      const nx = lay[nd.l + 1][j];
      const walked = nd.done && nx.done;
      const next = run.at ? (run.at.l === nd.l && run.at.i === nd.i && C().isAvailable(run, nx)) : false;
      lines.push(`<line x1="${px(nd)}" y1="${py(nd)}" x2="${px(nx)}" y2="${py(nx)}" class="${walked ? 'walk' : next ? 'next' : ''}"/>`);
    }
    const nodes = lay.flat().map((nd) => {
      const av = C().isAvailable(run, nd), cls = nd.done ? 'done' : av ? 'avail' : 'lock';
      const inf = info[nd.type];
      const face = nd.type === 'leader' ? portrait(g.team[2], 84, 74, 1.25) : `<span class="ico">${inf.icon}</span>`;
      return `<button class="rnode t-${nd.type} ${cls}" data-l="${nd.l}" data-i="${nd.i}" style="left:${px(nd)}%;top:${py(nd)}%;--tc:${nd.type === 'leader' ? PF.species(g.team[2]).color : '#5b6f99'}" ${av ? '' : 'tabindex="-1"'}>
        ${face}${nd.done ? '<em>✔</em>' : ''}<small>${nd.type === 'leader' ? g.leader : inf.name}</small></button>`;
    }).join('');
    const s = el(`
      <div class="screen career rmapscreen">
        <div class="selhead">
          <h2>${g.name}</h2>
          <div class="rsub">Líder ${g.leader} · ${PF.TYPE_ES[g.type]} · Nv ${g.levels[0]}–${g.levels[1]}</div>
          ${coinHTML(PF.Save.data.coins)}
        </div>
        <div class="rmap box">
          <svg class="rlines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines.join('')}</svg>
          ${nodes}
        </div>
        <div class="rinfo">${run.at ? 'Elige tu próximo paso.' : 'Elige por dónde empezar: cada camino tiene sus propios rivales y sorpresas.'}</div>
        <div class="rteam">
          ${mine.map((mb) => `<span class="rmon" style="--tc:${PF.species(mb.dex).color}">${portrait(mb.dex, 40, 36, 0.5)}<small>Nv ${mb.level}</small></span>`).join('')}
          <span class="perks">${perks.length ? 'Mejoras: ' + perks.map((p) => `<b title="${p.desc}">${p.name}</b>`).join(' · ') : 'Sin mejoras todavía'}</span>
        </div>
        <div class="row">
          <button class="btn danger" data-act="quit">Abandonar copa</button>
          <button class="btn" data-act="club">Volver al club</button>
        </div>
      </div>`);
    const infoEl = s.querySelector('.rinfo');
    s.querySelectorAll('.rnode').forEach((b) => {
      const nd = lay[+b.dataset.l][+b.dataset.i], inf = info[nd.type];
      const say = () => {
        infoEl.innerHTML = `<b>${inf.icon} ${nd.type === 'leader' ? 'Líder ' + g.leader : inf.name}</b> — ${inf.desc}${nd.done ? ' <i>(ya pasaste por acá)</i>' : !C().isAvailable(run, nd) ? ' <i>(todavía no se puede llegar)</i>' : ''}`;
      };
      b.onmouseenter = b.onfocus = say;
      b.onclick = () => { if (C().isAvailable(run, nd)) { PF.Audio.sfx.click(); h.onNode(nd); } else { PF.Audio.sfx.fail(); say(); } };
    });
    s.querySelector('[data-act=club]').onclick = h.onClub;
    const q = s.querySelector('[data-act=quit]');
    q.onclick = () => { if (q.dataset.sure) h.onAbandon(); else { q.dataset.sure = '1'; q.textContent = '¿Seguro? Se pierde la copa'; } };
    show(s);
    const first = s.querySelector('.rnode.avail');
    if (first) first.focus();
  }

  // ------------------------------------------------------------------ tienda
  /** buy(i) → { ok, msg }. */
  function shop(run, node, buy, onLeave) {
    const sh = C().shopOf(run, node);
    const s = el(`
      <div class="screen career">
        <div class="box menu choose">
          <h2>🛒 Tienda</h2>
          <div class="intro">Un vendedor ambulante te muestra su mercadería. Lo que compras dura hasta que termine esta copa.</div>
          <div class="coinline"></div>
          <div class="options"></div>
          <button class="btn big" data-act="leave">Seguir camino</button>
        </div>
      </div>`);
    const draw = () => {
      s.querySelector('.coinline').innerHTML = coinHTML(PF.Save.data.coins);
      const box = s.querySelector('.options');
      box.innerHTML = sh.items.map((it, i) => `<div class="opt ${sh.sold[i] ? 'sold' : PF.Save.data.coins < it.price ? 'poor' : ''}" data-i="${i}" tabindex="0" role="button">
        <b>${it.title}</b><small>${it.sub}</small>
        <span class="price">${sh.sold[i] ? 'Vendido' : coinHTML(it.price)}</span></div>`).join('');
      box.querySelectorAll('.opt').forEach((o) => {
        const go = () => {
          const r = buy(+o.dataset.i);
          PF.UI.toast(r.msg);
          if (r.ok) PF.Audio.sfx.pickup(); else PF.Audio.sfx.fail();
          draw();
        };
        o.onclick = go;
        o.onkeydown = (e) => { if (e.key === 'Enter') go(); };
      });
    };
    s.querySelector('[data-act=leave]').onclick = onLeave;
    draw();
    show(s);
  }

  function runEnd(out, onBack) {
    const won = out.result === 'won';
    const s = el(`
      <div class="screen career">
        <div class="box menu">
          <h2 class="${won ? 'won' : 'lost'}">${won ? `¡Ganaste la ${out.gym.badge}!` : 'Se terminó la copa'}</h2>
          <div class="intro">${won
            ? (out.first ? `Le ganaste a ${out.gym.leader}. +250 monedas y la medalla para el club.` : `Revancha ganada contra ${out.gym.leader}. +80 monedas.`)
            : 'Tus Pokémon conservan la experiencia ganada. ¡Entrena y vuelve a intentarlo!'}</div>
          <button class="btn big" data-act="go">Volver al club</button>
        </div>
      </div>`);
    s.querySelector('[data-act=go]').onclick = onBack;
    if (won) PF.Audio.crowd('cheer', 1);
    show(s);
  }

  return { start, hub, map, shop, versus, post, evolve, choose, runEnd };
})();
