/* ============ ui.js — pantallas en DOM sobre el canvas ============
 * Título, selección de equipo, pausa y resultado. main.js decide cuándo
 * se muestra cada una; aquí sólo se pinta y se avisa de los clics.
 */
PF.UI = (() => {
  const root = () => document.getElementById('ui');
  let portraits = [];          // canvases animados de la pantalla de selección

  function clear() { root().innerHTML = ''; portraits = []; }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function title(onPlay) {
    clear();
    const s = el(`
      <div class="screen title">
        <div class="logo">Poké<span>Fútbol</span></div>
        <div class="tagline">2 vs 2 · fútbol de dibujos animados · sin reglas, con rayos</div>
        <button class="btn big" data-act="play">¡A jugar!</button>
        <div class="box controls">
          <div><kbd>WASD</kbd> mover</div>
          <div><kbd>J</kbd> pase · sin pelota: placaje</div>
          <div><kbd>K</kbd> tiro (mantén para cargar)</div>
          <div><kbd>L</kbd> habilidad del Pokémon</div>
          <div><kbd>Espacio</kbd> presionar (ir a la pelota)</div>
          <div><kbd>Q</kbd> cambiar de Pokémon</div>
          <div>al tirar, <kbd>↑</kbd>/<kbd>↓</kbd> eligen palo</div>
          <div><kbd>T</kbd> orden al compañero: neutro, ataque o defensa</div>
          <div><kbd>Esc</kbd> pausa · <kbd>M</kbd> sonido</div>
        </div>
        <div class="foot">Sprites de SpriteCollab (CC BY-NC 4.0) · proyecto de fans sin ánimo de lucro · ver CREDITS.md</div>
      </div>`);
    s.querySelector('[data-act=play]').onclick = onPlay;
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  function statBar(label, v) {
    return `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`;
  }

  /** onDone(picksIds, difficulty, abilityIndexById) */
  function select(prev, onDone, onBack) {
    clear();
    let picks = prev && prev.picks ? prev.picks.slice() : [];
    let diff = (prev && prev.diff) || 'normal';
    const abil = Object.assign({}, prev && prev.abil);
    const s = el(`
      <div class="screen select">
        <h2>Elige a tus 2 Pokémon</h2>
        <div class="cards"></div>
        <div class="row">
          <div class="diff">Rival:
            <button data-d="easy">Fácil</button><button data-d="normal">Normal</button><button data-d="hard">Difícil</button>
          </div>
        </div>
        <div class="row">
          <button class="btn" data-act="back">Volver</button>
          <button class="btn big" data-act="go" disabled>¡A la cancha!</button>
        </div>
      </div>`);
    const cards = s.querySelector('.cards');
    for (const r of PF.ROSTER) {
      abil[r.id] = abil[r.id] || 0;
      const c = el(`
        <div class="card" role="button" tabindex="0" data-id="${r.id}" style="--tc:${r.color}">
          <span class="pick"></span>
          <canvas width="112" height="96"></canvas>
          <div class="name">${r.name} <small>${r.type}</small></div>
          ${statBar('Velocidad', (r.speed - 200) / 150)}
          ${statBar('Tiro', (r.power - 0.8) / 0.5)}
          ${statBar('Peso', r.mass / 2.4)}
          <div class="abs">
            ${r.abilities.map((a, i) => `<button class="abtn" data-i="${i}">${a.name} <small>${a.cd} s</small></button>`).join('')}
          </div>
          <div class="ab"></div>
        </div>`);
      portraits.push({ canvas: c.querySelector('canvas'), dex: r.dex });
      const toggle = () => {
        const i = picks.indexOf(r.id);
        if (i >= 0) picks.splice(i, 1);
        else { picks.push(r.id); if (picks.length > 2) picks.shift(); }
        refresh();
      };
      c.onclick = toggle;
      c.onkeydown = (e) => { if (e.key === 'Enter') toggle(); };
      c.querySelectorAll('.abtn').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          abil[r.id] = +b.dataset.i;
          if (!picks.includes(r.id)) { picks.push(r.id); if (picks.length > 2) picks.shift(); }
          refresh();
        };
      });
      cards.appendChild(c);
    }
    s.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { diff = b.dataset.d; refresh(); }; });
    s.querySelector('[data-act=back]').onclick = onBack;
    s.querySelector('[data-act=go]').onclick = () => onDone(picks.slice(), diff, Object.assign({}, abil));

    function refresh() {
      s.querySelectorAll('.card').forEach((c) => {
        const id = c.dataset.id, r = PF.rosterById(id), i = picks.indexOf(id);
        c.classList.toggle('on', i >= 0);
        c.querySelector('.pick').textContent = i >= 0 ? String(i + 1) : '';
        c.querySelectorAll('.abtn').forEach((b) => b.classList.toggle('on', +b.dataset.i === abil[id]));
        const a = r.abilities[abil[id]];
        c.querySelector('.ab').innerHTML = `${a.desc} <b>Recarga: ${a.cd} s.</b>`;
      });
      s.querySelectorAll('[data-d]').forEach((b) => b.classList.toggle('on', b.dataset.d === diff));
      s.querySelector('[data-act=go]').disabled = picks.length !== 2;
    }
    refresh();
    root().appendChild(s);
  }

  function tickPortraits(t) {
    for (const p of portraits) {
      const g = p.canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, p.canvas.width, p.canvas.height);
      PF.Sprites.draw(g, p.dex, 'Idle', t, true, Math.PI / 2, 56, 84, 1);
    }
  }

  function pause(onResume, onRestart, onQuit) {
    clear();
    const s = el(`
      <div class="screen">
        <div class="box menu">
          <h2>Pausa</h2>
          <button class="btn" data-act="resume">Seguir</button>
          <button class="btn" data-act="restart">Reiniciar partido</button>
          <button class="btn" data-act="quit">Salir al menú</button>
        </div>
      </div>`);
    s.querySelector('[data-act=resume]').onclick = onResume;
    s.querySelector('[data-act=restart]').onclick = onRestart;
    s.querySelector('[data-act=quit]').onclick = onQuit;
    root().appendChild(s);
    s.querySelector('button').focus();
  }

  function result(m, onRematch, onTeam, onMenu) {
    clear();
    const won = m.winner === 0, lost = m.winner === 1;
    const s = el(`
      <div class="screen">
        <div class="box menu result">
          <h2 class="${won ? 'won' : lost ? 'lost' : ''}">${won ? '¡Ganaste!' : lost ? 'Perdiste...' : 'Empate'}</h2>
          <div class="final"><span style="color:${PF.TEAM_COLORS[0]}">${m.score[0]}</span> - <span style="color:${PF.TEAM_COLORS[1]}">${m.score[1]}</span></div>
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

  return { clear, title, select, tickPortraits, pause, result };
})();
