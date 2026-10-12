/* ============ board.js — pizarra táctica ============
 * Mitad propia de la cancha (arco a la izquierda) con una ficha por Pokémon.
 * Se arrastran para elegir su posición: la profundidad decide el puesto
 * (arquero, defensa, medio, delantero) y la ★ indica que es su puesto natural
 * (bonus en el partido). Con arquero fijo hay una sola ficha en el arco; soltar
 * otra ahí los intercambia.
 *
 * mount(el, { defs, spots, mode, onChange(spots) }) → { canvases }
 *   defs   definiciones de los Pokémon (en orden)
 *   spots  [[profundidad 0..1, lateral -1..1], ...] en el mismo orden
 */
PF.Board = (() => {
  const W = 380, H = 168, PAD = 16, DMAX = 0.85;
  const toX = (d) => PAD + (d / DMAX) * (W - PAD * 2);
  const toY = (f) => H / 2 + f * (H / 2 - PAD);
  const toD = (x) => ((x - PAD) / (W - PAD * 2)) * DMAX;
  const toF = (y) => (y - H / 2) / (H / 2 - PAD);

  function pitch(canvas) {
    const g = canvas.getContext('2d');
    g.fillStyle = '#3f8a3a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#468f40' : '#3f8a3a'; g.fillRect(i * (W / 7), 0, W / 7, H); }
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    g.strokeRect(PAD - 6, 6, W - PAD * 2 + 12, H - 12);
    g.beginPath(); g.arc(toX(0.5), H / 2, 30, 0, Math.PI * 2); g.stroke();      // medio campo
    g.beginPath(); g.moveTo(toX(0.5), 6); g.lineTo(toX(0.5), H - 6); g.stroke();
    g.strokeRect(PAD - 6, H / 2 - 50, 46, 100);                               // área
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(PAD - 14, H / 2 - 24, 8, 48);   // arco
    // zonas
    g.font = '11px Pixelify, monospace'; g.fillStyle = 'rgba(255,255,255,0.55)'; g.textAlign = 'center';
    for (const [d0, d1, r] of [[0.1, 0.34, 'DEF'], [0.34, 0.56, 'MED'], [0.56, DMAX, 'DEL']]) {
      g.fillText(r, (toX(d0) + toX(d1)) / 2, 18);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(toX(d0), 24); g.lineTo(toX(d0), H - 8); g.stroke(); g.setLineDash([]);
    }
  }

  function mount(el, opts) {
    const { defs, mode } = opts;
    const spots = opts.spots.map((s) => s.slice());
    el.innerHTML = '';
    el.classList.add('board');
    el.style.width = W + 'px'; el.style.height = H + 'px';
    const bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    el.appendChild(bg);
    pitch(bg);

    const canvases = [];
    const tokens = defs.map((def, i) => {
      const t = document.createElement('div');
      t.className = 'token';
      t.style.setProperty('--tc', def.color);
      t.innerHTML = `<canvas width="48" height="44"></canvas><span class="role"></span><span class="nm">${def.name}</span>`;
      canvases.push({ canvas: t.querySelector('canvas'), r: def, small: true });
      el.appendChild(t);
      t.addEventListener('pointerdown', (e) => startDrag(e, i));
      return t;
    });

    function place() {
      tokens.forEach((t, i) => {
        const [d, f] = spots[i];
        const role = PF.zoneRole(d), nat = PF.naturalRole(defs[i]);
        t.style.left = toX(d) + 'px';
        t.style.top = toY(f) + 'px';
        const r = t.querySelector('.role');
        r.textContent = PF.ROLES[role].short + (role === nat ? '★' : '');
        r.style.background = PF.ROLES[role].color;
        t.title = `${defs[i].name} · puesto natural: ${PF.ROLES[nat].label}`;
      });
    }

    function startDrag(e, i) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const scale = rect.width / W;                  // el juego entero está escalado
      const t = tokens[i];
      t.setPointerCapture(e.pointerId);
      t.classList.add('drag');
      const move = (ev) => {
        const x = (ev.clientX - rect.left) / scale, y = (ev.clientY - rect.top) / scale;
        let d = Math.max(0, Math.min(DMAX, toD(x))), f = Math.max(-1, Math.min(1, toF(y)));
        if (mode === 'fixed' && spots[i][0] < 0.1) { d = 0.03; f = 0; }           // el arquero no sale del arco…
        else if (mode !== 'fixed') d = Math.max(0.12, d);                          // …y sin arquero fijo nadie entra
        spots[i] = [d, f];
        place();
      };
      const up = (ev) => {
        t.releasePointerCapture(ev.pointerId);
        t.classList.remove('drag');
        t.removeEventListener('pointermove', move);
        t.removeEventListener('pointerup', up);
        // arquero fijo: soltar un jugador en el arco lo hace arquero (intercambio)
        if (mode === 'fixed') {
          const x = (ev.clientX - rect.left) / scale;
          const k = spots.findIndex((s, j) => j !== i && s[0] < 0.1);
          if (toD(x) < 0.1 && k >= 0) {
            const mine = spots[i];
            spots[i] = [0.03, 0];
            spots[k] = [Math.max(0.18, mine[0]), mine[1]];
          } else if (spots[i][0] < 0.1 && k >= 0) spots[i][0] = 0.12;
        }
        place();
        opts.onChange(spots.map((s) => s.slice()));
      };
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', up);
    }

    place();
    return { canvases };
  }

  /**
   * Posiciones guardadas (mapa id → [d, f]) o automáticas, validando el arco:
   * con arquero fijo tiene que haber exactamente uno; sin él, nadie en el arco.
   */
  function spotsFor(saved, defs, mode) {
    const auto = PF.Match.autoFormation(defs, mode);
    let spots = defs.map((d, i) => (saved && saved[d.id] ? saved[d.id].slice() : auto[i]));
    if (mode === 'fixed') { if (spots.filter((s) => s[0] < 0.1).length !== 1) spots = auto; }
    else spots = spots.map((s) => (s[0] < 0.12 ? [0.12, s[1]] : s));
    return spots;
  }

  /** Guarda las posiciones en el mapa id → [d, f]. */
  function storeSpots(saved, defs, spots) {
    defs.forEach((d, i) => { saved[d.id] = spots[i]; });
  }

  return { mount, spotsFor, storeSpots };
})();
