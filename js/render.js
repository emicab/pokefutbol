/* ============ render.js — cancha, jugadores, pelota y marcador ============ */
PF.Render = (() => {
  const U = PF.U, F = PF.FIELD;
  let fieldCanvas = null, fieldKey = '';

  // ---------------------------------------------------------------- cancha (una vez por formato y estadio)
  function buildField(st) {
    const Wd = PF.WORLD;
    const c = document.createElement('canvas');
    c.width = Wd.w; c.height = Wd.h;
    const g = c.getContext('2d');

    // gradas: público pixelado
    g.fillStyle = '#18202f';
    g.fillRect(0, 0, Wd.w, Wd.h);
    const shirts = ['#ff5a5f', '#4d8dff', '#ffd23f', '#f2f2f2', '#5fd68a', '#a27bff', '#ff8a3d'];
    for (let y = 4; y < Wd.h; y += 10) {
      for (let x = 4; x < Wd.w; x += 9) {
        const inside = x > F.x0 - F.goalDepth - 30 && x < F.x1 + F.goalDepth + 30 && y > F.y0 - 28 && y < F.y1 + 28;
        if (inside || Math.random() < 0.18) continue;
        g.fillStyle = shirts[(Math.random() * shirts.length) | 0];
        g.globalAlpha = 0.35 + Math.random() * 0.3;
        g.fillRect(x, y + 3, 6, 5);
        g.fillStyle = '#e8c39e';
        g.fillRect(x + 1, y, 4, 3);
      }
    }
    g.globalAlpha = 1;

    // pista alrededor
    g.fillStyle = st.track;
    g.fillRect(F.x0 - F.goalDepth - 24, F.y0 - 22, F.x1 - F.x0 + 2 * (F.goalDepth + 24), F.y1 - F.y0 + 44);

    // césped (o hielo, arena...) a franjas, recortado al polígono
    g.save();
    g.beginPath();
    F.outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    for (let x = F.x0 - F.goalDepth, i = 0; x < F.x1 + F.goalDepth; x += 55, i++) {
      g.fillStyle = st.grass[i % 2];
      g.fillRect(x, F.y0, 55, F.y1 - F.y0);
    }
    // textura: briznas
    for (let i = 0; i < 1600 * ((F.x1 - F.x0) / 1100) * ((F.y1 - F.y0) / 616); i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(U.rand(F.x0 - 50, F.x1 + 50) | 0, U.rand(F.y0, F.y1) | 0, 2, 2);
    }
    // redes
    for (const side of [0, 1]) {
      const gx = side ? F.x1 : F.x0 - F.goalDepth;
      g.fillStyle = 'rgba(20,30,40,0.35)';
      g.fillRect(gx, F.cy - F.goalHalf, F.goalDepth, F.goalHalf * 2);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 1;
      for (let x = gx; x <= gx + F.goalDepth; x += 8) { g.beginPath(); g.moveTo(x + 0.5, F.cy - F.goalHalf); g.lineTo(x + 0.5, F.cy + F.goalHalf); g.stroke(); }
      for (let y = F.cy - F.goalHalf; y <= F.cy + F.goalHalf; y += 8) { g.beginPath(); g.moveTo(gx, y + 0.5); g.lineTo(gx + F.goalDepth, y + 0.5); g.stroke(); }
    }
    g.restore();

    // líneas
    const k = (F.y1 - F.y0) / 616;   // las áreas crecen con la cancha
    g.strokeStyle = st.line;
    g.lineWidth = 4;
    g.beginPath();
    F.outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    g.beginPath(); g.moveTo(F.cx, F.y0); g.lineTo(F.cx, F.y1); g.stroke();
    g.beginPath(); g.arc(F.cx, F.cy, 92 * k, 0, Math.PI * 2); g.stroke();
    g.fillStyle = st.line;
    g.fillRect(F.cx - 4, F.cy - 4, 8, 8);
    for (const side of [0, 1]) {
      const s = side ? -1 : 1, x = side ? F.x1 : F.x0;
      const bw = F.boxW, bh = F.boxH, sw = 60 * k, sh = 115 * k;
      g.strokeRect(Math.min(x, x + s * bw), F.cy - bh, bw, bh * 2);
      g.strokeRect(Math.min(x, x + s * sw), F.cy - sh, sw, sh * 2);
      g.beginPath(); g.arc(x + s * bw, F.cy, 60 * k, side ? Math.PI / 2 : -Math.PI / 2, side ? 1.5 * Math.PI : Math.PI / 2); g.stroke();
      // postes con el color del equipo que defiende
      g.fillStyle = PF.TEAM_COLORS[side];
      for (const y of [F.cy - F.goalHalf, F.cy + F.goalHalf]) {
        g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = '#fff'; g.fillRect(x - 3, y - 3, 6, 6); g.fillStyle = PF.TEAM_COLORS[side];
      }
    }
    return c;
  }

  function fieldFor(st) {
    const key = `${F.size}/${st.id}`;
    if (key !== fieldKey) { fieldCanvas = buildField(st); fieldKey = key; }
    return fieldCanvas;
  }

  // ---------------------------------------------------------------- entidades
  function drawItem(ctx, it) {
    const bob = Math.sin(it.t * 4) * 4, x = it.x, y = it.y - 16 + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(it.x, it.y, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    const pulse = 0.5 + 0.5 * Math.sin(it.t * 8);
    ctx.fillStyle = '#141018';
    ctx.fillRect(x - 15, y - 15, 30, 30);
    ctx.fillStyle = it.kind.color;
    ctx.fillRect(x - 12, y - 12, 24, 24);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
    ctx.fillRect(x - 12, y - 12, 24, 6);
    ctx.fillStyle = '#141018';
    ctx.font = '22px Pixelify, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + 1);
  }

  function drawStars(ctx, x, y, t) {
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 16, sy = y + Math.sin(a) * 5;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx - 1, sy - 4, 3, 9);
      ctx.fillRect(sx - 4, sy - 1, 9, 3);
    }
  }

  function drawZzz(ctx, x, y, t) {
    ctx.font = '16px Pixelify, monospace'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.8 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#e6c3ff';
      ctx.fillText('z', x + 8 + k * 14, y - k * 22);
    }
    ctx.globalAlpha = 1;
  }

  /** Anillo del equipo; en tu equipo, además, la recarga de la habilidad. */
  function drawRing(ctx, m, p, r) {
    const color = PF.TEAM_COLORS[p.team];
    const rx = r * 1.25, ry = r * 0.6, y = p.y + 2;
    const mine = m.humanTeam >= 0 && p.team === m.humanTeam;
    ctx.lineWidth = p.human ? 4 : 2.5;
    ctx.strokeStyle = color;
    ctx.globalAlpha = mine ? 0.45 : 0.9;
    ctx.beginPath(); ctx.ellipse(p.x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    if (!mine) return;
    const ab = p.def.ability;
    if (p.cd > 0) {
      const k = 1 - p.cd / ab.cd;
      ctx.strokeStyle = color;
      ctx.lineWidth = p.human ? 4 : 2.5;
      ctx.beginPath(); ctx.ellipse(p.x, y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    } else {
      // lista: brilla con el color del Pokémon
      const pulse = 0.5 + 0.5 * Math.sin(m.clock * 7);
      ctx.strokeStyle = p.def.color;
      ctx.lineWidth = (p.human ? 4 : 3) + pulse * 2;
      ctx.beginPath(); ctx.ellipse(p.x, y, rx + 2, ry + 1, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function arrow(ctx, x, y, a, len, color, width = 6) {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    ctx.lineCap = 'round';
    for (const [w, c] of [[width + 4, '#141018'], [width, color]]) {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      const h = 10 + w;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a) * h * 0.6, ey + Math.sin(a) * h * 0.6);
      ctx.lineTo(ex + Math.cos(a + 2.4) * h * 0.7, ey + Math.sin(a + 2.4) * h * 0.7);
      ctx.lineTo(ex + Math.cos(a - 2.4) * h * 0.7, ey + Math.sin(a - 2.4) * h * 0.7);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  /** Ayudas del Pokémon que controlas con la pelota: apuntado, pase y tiro. */
  function drawAimAids(ctx, m) {
    const p = m.controlled, b = m.ball;
    if (!p || b.holder !== p) return;
    if (p.charge >= 0) {
      // tiro: flecha que crece con la potencia y mira en el arco
      const k = p.charge / PF.Match.CHARGE_MAX;
      const aim = PF.Match.shotAim(p);
      const c = k > 0.95 ? '#ffffff' : k > 0.6 ? '#ff8a3d' : '#ffd23f';
      arrow(ctx, b.x, b.y - 4, aim.a, 30 + k * 70, c, 5);
      if (aim.goal) {
        const pulse = Math.sin(m.clock * 14) * 2;
        ctx.strokeStyle = '#141018'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(aim.tx, aim.ty, 13 + pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(aim.tx, aim.ty, 13 + pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = c;
        ctx.fillRect(aim.tx - 2, aim.ty - 20, 4, 9); ctx.fillRect(aim.tx - 2, aim.ty + 11, 4, 9);
        ctx.fillRect(aim.tx - 20, aim.ty - 2, 9, 4); ctx.fillRect(aim.tx + 11, aim.ty - 2, 9, 4);
      }
      return;
    }
    // sin cargar: flechita de hacia dónde miras y línea de pase
    const mate = PF.Match.passTarget(m, p);
    if (mate) {
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -m.clock * 40;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(mate.x, mate.y); ctx.stroke();
      ctx.setLineDash([]);
      const pulse = Math.sin(m.clock * 8) * 3;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(mate.x, mate.y + 2, 30 + pulse, 15 + pulse / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      arrow(ctx, b.x, b.y - 4, p.facing, 34, 'rgba(255,255,255,0.85)', 3);
    }
  }

  function drawPowerBar(ctx, p, head) {
    const k = p.charge / PF.Match.CHARGE_MAX, w = 64, h = 12, x = p.x - w / 2, y = head - 40;
    ctx.fillStyle = '#141018'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#3a3346'; ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5fd68a'); g.addColorStop(0.55, '#ffd23f'); g.addColorStop(1, '#ff5a5f');
    ctx.fillStyle = g; ctx.fillRect(x, y, w * k, h);
    ctx.fillStyle = '#141018';
    for (let i = 1; i < 4; i++) ctx.fillRect(x + (w * i) / 4 - 1, y, 2, h);
    if (k > 0.95) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); }
  }

  /** Guantes verdes a los lados: éste es el arquero (en araña, el de ahora). */
  function drawGloves(ctx, m, p, head, r) {
    const y = (p.y + head) / 2 + 4;
    const wave = p.gkHold ? 0 : Math.sin(m.clock * 8) * 2;
    for (const s of [-1, 1]) {
      const x = p.x + s * (r + 5);
      ctx.fillStyle = '#141018'; ctx.fillRect(x - 6, y - 6 + wave * s, 12, 12);
      ctx.fillStyle = '#9cff6b'; ctx.fillRect(x - 4, y - 4 + wave * s, 8, 8);
    }
    if (p.gkHold) {
      ctx.font = '12px Pixelify, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#9cff6b'; ctx.fillText('MANOS', p.x, p.y + r + 14);
    }
  }

  function drawPlayer(ctx, m, p) {
    const sc = (p.giant > 0 ? 1.5 : 1) * (p.def.scale || 1);
    const r = PF.Match.radius(p);
    let z = p.z || 0;
    if (m.state === 'goal' && p.team === m.goalTeam) z = Math.abs(Math.sin(m.clock * 9 + p.slot * 1.7)) * 16;
    const color = PF.TEAM_COLORS[p.team];

    if (p.dig > 0) {
      // bajo tierra: sólo se ve el montículo que avanza
      ctx.fillStyle = '#6b5038';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.1, r * 0.55, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#8a6a4a';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, r * 0.8, r * 0.35, 0, Math.PI, 0); ctx.fill();
      drawRing(ctx, m, p, r);
      return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, r * (1 - z / 260), r * 0.45 * (1 - z / 260), 0, 0, Math.PI * 2); ctx.fill();
    drawRing(ctx, m, p, r);
    if (p.wall > 0) {
      ctx.fillStyle = 'rgba(232,224,204,0.25)';
      ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.6, r * 1.6, r * 1.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (p.magnet > 0) {
      ctx.strokeStyle = `rgba(176,184,200,${0.3 + 0.2 * Math.sin(m.clock * 10)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 170, 85, 0, 0, Math.PI * 2); ctx.stroke();
    }

    if (p.phase > 0) ctx.globalAlpha = 0.4 + 0.15 * Math.sin(m.clock * 20);
    const loop = p.anim === 'Idle' || p.anim === 'Walk' || p.anim === 'Charge';
    PF.Sprites.draw(ctx, p.def.dex, p.anim, p.animT, loop, p.facing, p.x, p.y - z, sc);
    ctx.globalAlpha = 1;

    const head = p.y - z - PF.Sprites.headHeight(p.def.dex) * sc;
    if (m.keeper && m.keeper[p.team] === p) drawGloves(ctx, m, p, head, r);
    if (p.stun > 0) (p.asleep ? drawZzz : drawStars)(ctx, p.x, head, m.clock);
    if (p.slow > 0 && p.stun <= 0) {
      ctx.font = '14px Pixelify, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#c77dff'; ctx.fillText('lento', p.x, head - 4 + Math.sin(m.clock * 5) * 2);
    }
    const order = PF.Match.ORDERS[m.order];
    if (!m.demo && m.state !== 'replay' && p.team === m.humanTeam && !p.human && order.short) {
      ctx.font = '13px Pixelify, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = 34, y = head - 12;
      ctx.fillStyle = '#141018'; ctx.fillRect(p.x - w / 2 - 2, y - 9, w + 4, 18);
      ctx.fillStyle = order.color; ctx.fillRect(p.x - w / 2, y - 7, w, 14);
      ctx.fillStyle = '#141018'; ctx.fillText(order.short, p.x, y + 1);
    }
    if (p.human && m.state !== 'replay') {
      const y = head - 14 + Math.sin(m.clock * 6) * 2;
      ctx.fillStyle = '#141018';
      ctx.beginPath(); ctx.moveTo(p.x - 10, y - 12); ctx.lineTo(p.x + 10, y - 12); ctx.lineTo(p.x, y + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(p.x - 7, y - 10); ctx.lineTo(p.x + 7, y - 10); ctx.lineTo(p.x, y - 1); ctx.closePath(); ctx.fill();
    }
    if (p.charge >= 0 && p.team === m.humanTeam) drawPowerBar(ctx, p, head);
  }

  function drawHazards(ctx, m) {
    for (const h of m.hazards) {
      const fade = h.life === Infinity ? Math.min(1, h.t / 0.3) : Math.min(1, (h.life - h.t) / 0.5, h.t / 0.15);
      if (h.kind === 'puddle' || h.kind === 'ice') {
        const ice = h.kind === 'ice';
        ctx.globalAlpha = (ice ? 0.75 : 0.55) * fade;
        ctx.fillStyle = ice ? '#dff6ff' : '#3b9cff';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6 * fade;
        ctx.fillStyle = ice ? '#ffffff' : '#b8e6ff';
        ctx.beginPath(); ctx.ellipse(h.x - h.r * 0.3, h.y - h.r * 0.15, h.r * 0.35, h.r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        if (ice) {
          ctx.strokeStyle = '#9fd8f0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (h.kind === 'fire') {
        const f = 0.8 + 0.2 * Math.sin(m.clock * 25 + h.x);
        ctx.globalAlpha = 0.7 * fade;
        ctx.fillStyle = '#ff6b3d';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * f, h.r * 0.5 * f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.ellipse(h.x, h.y - 2, h.r * 0.5 * f, h.r * 0.25 * f, 0, 0, Math.PI * 2); ctx.fill();
      } else if (h.kind === 'lava') {
        const f = 1 + 0.04 * Math.sin(m.clock * 3 + h.x);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#2a1410';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * 1.12, h.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8481c';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * f, h.r * 0.55 * f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb02e';
        for (let i = 0; i < 4; i++) {
          const a = m.clock * 0.7 + i * 1.7 + h.y;
          ctx.beginPath(); ctx.ellipse(h.x + Math.cos(a) * h.r * 0.5, h.y + Math.sin(a * 1.3) * h.r * 0.25, h.r * 0.22, h.r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (Math.random() < 0.15) PF.FX.particle(m.fx, h.x + U.rand(-h.r, h.r) * 0.7, h.y, 0, -50, '#ffb02e', 0.5, 3);
      } else if (h.kind === 'sleep') {
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = '#d9a6ff';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + m.clock * 0.6;
          ctx.beginPath(); ctx.arc(h.x + Math.cos(a) * h.r * 0.5, h.y - 10 + Math.sin(a) * h.r * 0.3, h.r * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawProjectiles(ctx, m) {
    for (const pr of m.projs) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(pr.x, pr.y + 18, pr.r * 0.8, pr.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      if (pr.kind === 'shuriken') {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(m.clock * 25);
        ctx.fillStyle = pr.color;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(0, -pr.r); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#fff'; ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(127,184,255,0.35)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pr.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(pr.x - 3, pr.y - 3, pr.r * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBall(ctx, m) {
    const b = m.ball, r = b.r;
    const lift = b.holder ? 2 : 4;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 3, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    const x = b.x, y = b.y - lift;
    if (b.fire > 0) {
      ctx.fillStyle = 'rgba(255,140,40,0.35)';
      ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
    }
    if (b.crazy > 0) {
      ctx.fillStyle = `rgba(255,90,176,${0.25 + 0.15 * Math.sin(m.clock * 18)})`;
      ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = b.fire > 0 ? '#ffcf7a' : b.crazy > 0 ? '#ffd1ea' : '#fafafa';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // parches que ruedan
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = b.fire > 0 ? '#c2410c' : b.crazy > 0 ? '#c2186b' : '#1d1d24';
    const dir = Math.atan2(b.vy, b.vx), k = r / 10;
    for (let i = 0; i < 3; i++) {
      const off = (((b.spin * 3 + i * 7) % 21) - 10.5) * k;
      const px = x + Math.cos(dir) * off + Math.cos(dir + Math.PI / 2) * (i - 1) * 6 * k;
      const py = y + Math.sin(dir) * off + Math.sin(dir + Math.PI / 2) * (i - 1) * 6 * k;
      ctx.beginPath(); ctx.arc(px, py, 3.2 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#141018'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  function drawVine(ctx, m) {
    const b = m.ball, p = b.vine;
    if (!p) return;
    ctx.strokeStyle = '#141018'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(b.x, b.y - 4); ctx.stroke();
    ctx.strokeStyle = b.vineColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(b.x, b.y - 4); ctx.stroke();
  }

  // ---------------------------------------------------------------- HUD
  function fmtTime(t) {
    const s = Math.ceil(t);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = '#0b1222'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#24365c'); g.addColorStop(1, '#1a2742');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }

  function abilityPanel(ctx, p, x, y) {
    panel(ctx, x, y, 232, 30);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '15px Pixelify, monospace';
    ctx.fillStyle = p.human ? '#ffd23f' : '#a9b6d3';
    ctx.fillText((p.human ? '▶ ' : '  ') + p.def.name, x + 6, y + 15);
    const bx = x + 118, bw = 106;
    const k = 1 - p.cd / p.def.ability.cd;
    ctx.fillStyle = '#0b1222'; ctx.fillRect(bx, y + 8, bw, 14);
    ctx.fillStyle = p.cd <= 0 ? p.def.color : '#4a5878';
    ctx.fillRect(bx + 2, y + 10, (bw - 4) * k, 10);
    ctx.font = '11px Pixelify, monospace';
    ctx.fillStyle = p.cd <= 0 ? '#141018' : '#d6def0';
    ctx.textAlign = 'center';
    ctx.fillText(p.cd <= 0 ? p.def.ability.name.toUpperCase() : p.def.ability.name, bx + bw / 2, y + 15);
  }

  /** Minimapa (sólo si la cancha no entra en pantalla). */
  function drawRadar(ctx, m) {
    const w = 190, h = w * (F.y1 - F.y0) / (F.x1 - F.x0), x = 16, y = 16;
    const sx = (v) => x + ((v - F.x0) / (F.x1 - F.x0)) * w;
    const sy = (v) => y + ((v - F.y0) / (F.y1 - F.y0)) * h;
    ctx.globalAlpha = 0.85;
    panel(ctx, x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    // lo que ve la cámara
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeRect(sx(m.cam.x), sy(m.cam.y), (PF.W / (F.x1 - F.x0)) * w, (PF.H / (F.y1 - F.y0)) * h);
    for (const p of m.players) {
      ctx.fillStyle = PF.TEAM_COLORS[p.team];
      const s = p.human ? 7 : 5;
      ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
      if (p.human) { ctx.strokeStyle = '#ffd23f'; ctx.strokeRect(sx(p.x) - 5, sy(p.y) - 5, 10, 10); }
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx(m.ball.x) - 2, sy(m.ball.y) - 2, 4, 4);
  }

  /** Flecha en el borde si el Pokémon que controlas queda fuera de cámara. */
  function drawOffscreen(ctx, m) {
    const p = m.controlled;
    if (!p) return;
    const x = p.x - m.cam.x, y = p.y - m.cam.y;
    const pad = 30;
    if (x > pad && x < PF.W - pad && y > 90 && y < PF.H - 60) return;
    const ax = U.clamp(x, pad, PF.W - pad), ay = U.clamp(y, 100, PF.H - 70);
    const a = Math.atan2(y - ay, x - ax);
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = '#141018';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawHUD(ctx, m, names) {
    const cx = PF.W / 2;
    const n = PF.Match.teamOf(m, 0).length;
    panel(ctx, cx - 210, 14, 420, 62);
    ctx.textBaseline = 'middle';
    for (const team of [0, 1]) {
      const s = team ? 1 : -1;
      ctx.fillStyle = PF.TEAM_COLORS[team];
      ctx.fillRect(cx + s * 196 - (team ? 14 : 0), 14, 14, 62);
      ctx.font = '16px Pixelify, monospace';
      ctx.textAlign = team ? 'right' : 'left';
      ctx.fillStyle = '#a9b6d3';
      ctx.fillText(names[team], cx + s * 172, 30);
      // mini retratos (si caben)
      const gap = n <= 2 ? 40 : n <= 3 ? 28 : 18;
      PF.Match.teamOf(m, team).forEach((p, i) => {
        PF.Sprites.draw(ctx, p.def.dex, 'Idle', m.clock, true, Math.PI / 2, cx + s * (150 - i * gap), 72, (n <= 2 ? 0.75 : 0.55) * (p.def.scale || 1));
      });
      ctx.font = '44px Pixelify, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(m.score[team]), cx + s * 52, 46);
    }
    ctx.font = m.golden ? '15px Pixelify, monospace' : '24px Pixelify, monospace';
    ctx.fillStyle = m.golden ? '#ffd23f' : m.time < 10 ? '#ff8a8a' : '#e8f0ff';
    ctx.fillText(m.golden ? 'GOL DE ORO' : fmtTime(m.time), cx, 46);

    if (m.humanTeam < 0) return;
    // habilidades: en 2 vs 2, las dos; si no, sólo la del que controlas
    const mine = n <= 2 ? PF.Match.teamOf(m, m.humanTeam) : [m.controlled];
    mine.forEach((p, i) => abilityPanel(ctx, p, 18 + i * 250, PF.H - 40));
    // orden a los compañeros
    const order = PF.Match.ORDERS[m.order], ox = 18 + mine.length * 250, oy = PF.H - 40;
    panel(ctx, ox, oy, 168, 30);
    ctx.textAlign = 'left'; ctx.font = '13px Pixelify, monospace';
    ctx.fillStyle = '#a9b6d3'; ctx.fillText(n <= 2 ? '[T] compañero' : '[T] equipo', ox + 6, oy + 15);
    ctx.font = '15px Pixelify, monospace';
    ctx.fillStyle = order.color; ctx.fillText(order.label, ox + 100, oy + 15);
    if (n <= 2) {
      ctx.textAlign = 'right';
      ctx.font = '14px Pixelify, monospace';
      ctx.fillStyle = '#a9b6d3';
      ctx.fillText('J pase/placaje · K tiro · L habilidad · Espacio presionar · Q cambiar · Esc pausa', PF.W - 18, PF.H - 25);
    }
    if (PF.WORLD.w > PF.W || PF.WORLD.h > PF.H) drawRadar(ctx, m);
  }

  function outlined(ctx, text, x, y, size, color, lw = 8) {
    ctx.font = `${size}px Pixelify, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = lw; ctx.strokeStyle = '#141018';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  // ---------------------------------------------------------------- frame
  function draw(ctx, m, opts = {}) {
    const field = fieldFor(m.stadium);
    const aids = opts.aids !== false;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e1420';
    ctx.fillRect(0, 0, PF.W, PF.H);
    ctx.save();
    let ox = -Math.round(m.cam.x), oy = -Math.round(m.cam.y);
    if (m.shake > 0) { ox += U.rand(-m.shake, m.shake) * 0.6; oy += U.rand(-m.shake, m.shake) * 0.6; }
    ctx.translate(ox, oy);
    ctx.drawImage(field, 0, 0);
    drawHazards(ctx, m);
    PF.FX.drawUnder(ctx, m.fx);
    if (!m.demo && aids && m.state !== 'replay') drawAimAids(ctx, m);

    const ents = [];
    for (const it of m.items) ents.push({ y: it.y, draw: () => drawItem(ctx, it) });
    for (const p of m.players) ents.push({ y: p.y, draw: () => drawPlayer(ctx, m, p) });
    ents.push({ y: m.ball.y + (m.ball.holder && Math.sin(m.ball.holder.facing) < 0 ? -0.1 : 0.1), draw: () => drawBall(ctx, m) });
    ents.sort((a, b) => a.y - b.y);
    drawVine(ctx, m);
    for (const e of ents) e.draw();
    drawProjectiles(ctx, m);

    PF.FX.drawOver(ctx, m.fx);
    ctx.restore();

    const cx = PF.W / 2, cy = PF.H / 2;
    if (m.state === 'kickoff' && !m.demo) {
      const mine = m.kicker.human;
      outlined(ctx, mine ? '¡SAQUE!' : 'SAQUE RIVAL', cx, cy - 110, 40, mine ? '#ffd23f' : '#fff');
      if (mine) outlined(ctx, 'apunta con WASD · J pase', cx, cy - 76, 20, '#fff', 6);
    }
    if (m.state === 'replay') {
      // franjas de cine y cartel
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, PF.W, 70);
      ctx.fillRect(0, PF.H - 70, PF.W, 70);
      if (Math.floor(m.clock * 2) % 2 === 0) { ctx.fillStyle = '#ff5a5f'; ctx.beginPath(); ctx.arc(40, 35, 9, 0, Math.PI * 2); ctx.fill(); }
      outlined(ctx, 'REPETICIÓN', 150, 36, 30, '#fff', 6);
      outlined(ctx, 'J / K / Espacio para saltar', PF.W - 190, PF.H - 35, 18, '#a9b6d3', 5);
      return;
    }
    if (!opts.noHud) {
      drawHUD(ctx, m, opts.names || PF.TEAM_NAMES);
      if (!m.demo) drawOffscreen(ctx, m);
    }
  }

  return { draw };
})();
