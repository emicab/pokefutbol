/* ============ render.js — cancha, jugadores, pelota y marcador ============ */
PF.Render = (() => {
  const U = PF.U, F = PF.FIELD;
  let fieldCanvas = null;

  // ---------------------------------------------------------------- cancha (una vez)
  function buildField() {
    const c = document.createElement('canvas');
    c.width = PF.W; c.height = PF.H;
    const g = c.getContext('2d');

    // gradas: público pixelado
    g.fillStyle = '#18202f';
    g.fillRect(0, 0, PF.W, PF.H);
    const shirts = ['#ff5a5f', '#4d8dff', '#ffd23f', '#f2f2f2', '#5fd68a', '#a27bff', '#ff8a3d'];
    for (let y = 4; y < PF.H; y += 10) {
      for (let x = 4; x < PF.W; x += 9) {
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
    g.fillStyle = '#2b6b3a';
    g.fillRect(F.x0 - F.goalDepth - 24, F.y0 - 22, F.x1 - F.x0 + 2 * (F.goalDepth + 24), F.y1 - F.y0 + 44);

    // césped a franjas, recortado al polígono
    g.save();
    g.beginPath();
    F.outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    for (let x = F.x0 - F.goalDepth, i = 0; x < F.x1 + F.goalDepth; x += 55, i++) {
      g.fillStyle = i % 2 ? '#56b04a' : '#4ea443';
      g.fillRect(x, F.y0, 55, F.y1 - F.y0);
    }
    // textura: briznas
    for (let i = 0; i < 1600; i++) {
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
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 4;
    g.beginPath();
    F.outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    g.beginPath(); g.moveTo(F.cx, F.y0); g.lineTo(F.cx, F.y1); g.stroke();
    g.beginPath(); g.arc(F.cx, F.cy, 92, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(F.cx - 4, F.cy - 4, 8, 8);
    for (const side of [0, 1]) {
      const s = side ? -1 : 1, x = side ? F.x1 : F.x0;
      g.strokeRect(Math.min(x, x + s * 150), F.cy - 175, 150, 350);
      g.strokeRect(Math.min(x, x + s * 60), F.cy - 115, 60, 230);
      g.beginPath(); g.arc(x + s * 150, F.cy, 60, side ? Math.PI / 2 : -Math.PI / 2, side ? 1.5 * Math.PI : Math.PI / 2); g.stroke();
      // postes con el color del equipo que defiende
      g.fillStyle = PF.TEAM_COLORS[side];
      for (const y of [F.cy - F.goalHalf, F.cy + F.goalHalf]) {
        g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = '#fff'; g.fillRect(x - 3, y - 3, 6, 6); g.fillStyle = PF.TEAM_COLORS[side];
      }
    }
    fieldCanvas = c;
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
    const mate = PF.Match.mateOf(m, p);
    if (mate && PF.Match.passGoesToMate(m, p)) {
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

  function drawPlayer(ctx, m, p) {
    const sc = p.giant > 0 ? 1.5 : 1;
    const r = PF.Match.radius(p);
    let z = p.z || 0;
    if (m.state === 'goal' && p.team === m.goalTeam) z = Math.abs(Math.sin(m.clock * 9 + p.slot * 1.7)) * 16;
    const color = PF.TEAM_COLORS[p.team];

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, r * (1 - z / 200), r * 0.45 * (1 - z / 200), 0, 0, Math.PI * 2); ctx.fill();
    drawRing(ctx, m, p, r);
    if (p.wall > 0) {
      ctx.fillStyle = 'rgba(232,224,204,0.25)';
      ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.6, r * 1.6, r * 1.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    if (p.phase > 0) ctx.globalAlpha = 0.4 + 0.15 * Math.sin(m.clock * 20);
    const loop = p.anim === 'Idle' || p.anim === 'Walk' || p.anim === 'Charge';
    PF.Sprites.draw(ctx, p.def.dex, p.anim, p.animT, loop, p.facing, p.x, p.y - z, sc);
    ctx.globalAlpha = 1;

    const head = p.y - z - PF.Sprites.headHeight(p.def.dex) * sc;
    if (p.stun > 0) (p.asleep ? drawZzz : drawStars)(ctx, p.x, head, m.clock);
    if (p.slow > 0 && p.stun <= 0) {
      ctx.font = '14px Pixelify, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#c77dff'; ctx.fillText('lento', p.x, head - 4 + Math.sin(m.clock * 5) * 2);
    }
    const order = PF.Match.ORDERS[m.order];
    if (!m.demo && p.team === m.humanTeam && !p.human && order.short) {
      ctx.font = '13px Pixelify, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = 34, y = head - 12;
      ctx.fillStyle = '#141018'; ctx.fillRect(p.x - w / 2 - 2, y - 9, w + 4, 18);
      ctx.fillStyle = order.color; ctx.fillRect(p.x - w / 2, y - 7, w, 14);
      ctx.fillStyle = '#141018'; ctx.fillText(order.short, p.x, y + 1);
    }
    if (p.human) {
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
      const fade = Math.min(1, (h.life - h.t) / 0.5, h.t / 0.15);
      if (h.kind === 'puddle') {
        ctx.globalAlpha = 0.55 * fade;
        ctx.fillStyle = '#3b9cff';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6 * fade;
        ctx.fillStyle = '#b8e6ff';
        ctx.beginPath(); ctx.ellipse(h.x - h.r * 0.3, h.y - h.r * 0.15, h.r * 0.35, h.r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      } else if (h.kind === 'fire') {
        const f = 0.8 + 0.2 * Math.sin(m.clock * 25 + h.x);
        ctx.globalAlpha = 0.7 * fade;
        ctx.fillStyle = '#ff6b3d';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * f, h.r * 0.5 * f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.ellipse(h.x, h.y - 2, h.r * 0.5 * f, h.r * 0.25 * f, 0, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = b.fire > 0 ? '#ffcf7a' : '#fafafa';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // parches que ruedan
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = b.fire > 0 ? '#c2410c' : '#1d1d24';
    const dir = Math.atan2(b.vy, b.vx);
    for (let i = 0; i < 3; i++) {
      const off = ((b.spin * 3 + i * 7) % 21) - 10.5;
      const px = x + Math.cos(dir) * off + Math.cos(dir + Math.PI / 2) * (i - 1) * 6;
      const py = y + Math.sin(dir) * off + Math.sin(dir + Math.PI / 2) * (i - 1) * 6;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#141018'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  function drawVine(ctx, m) {
    const b = m.ball, p = b.vine;
    if (!p) return;
    ctx.strokeStyle = '#2f8f3f'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 18); ctx.lineTo(b.x, b.y - 4); ctx.stroke();
    ctx.strokeStyle = '#7dff9e'; ctx.lineWidth = 2;
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

  function drawHUD(ctx, m, names) {
    const cx = PF.W / 2;
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
      // mini retratos
      m.players.filter((p) => p.team === team).forEach((p, i) => {
        PF.Sprites.draw(ctx, p.def.dex, 'Idle', m.clock, true, Math.PI / 2, cx + s * (172 - 22 - i * 40) + (team ? -0 : 0), 72, 0.75);
      });
      ctx.font = '44px Pixelify, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(m.score[team]), cx + s * 52, 46);
    }
    ctx.font = m.golden ? '15px Pixelify, monospace' : '24px Pixelify, monospace';
    ctx.fillStyle = m.golden ? '#ffd23f' : m.time < 10 ? '#ff8a8a' : '#e8f0ff';
    ctx.fillText(m.golden ? 'GOL DE ORO' : fmtTime(m.time), cx, 46);

    // habilidades del equipo humano
    if (m.humanTeam >= 0) {
      m.players.filter((p) => p.team === m.humanTeam).forEach((p, i) => {
        const x = 18 + i * 250, y = PF.H - 40;
        panel(ctx, x, y, 232, 30);
        ctx.textAlign = 'left';
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
      });
      // orden al compañero
      const order = PF.Match.ORDERS[m.order], ox = 518, oy = PF.H - 40;
      panel(ctx, ox, oy, 168, 30);
      ctx.textAlign = 'left'; ctx.font = '13px Pixelify, monospace';
      ctx.fillStyle = '#a9b6d3'; ctx.fillText('[T] compañero', ox + 6, oy + 15);
      ctx.font = '15px Pixelify, monospace';
      ctx.fillStyle = order.color; ctx.fillText(order.label, ox + 100, oy + 15);
      ctx.textAlign = 'right';
      ctx.font = '14px Pixelify, monospace';
      ctx.fillStyle = '#a9b6d3';
      ctx.fillText('J pase/placaje · K tiro · L habilidad · Espacio presionar · Q cambiar · Esc pausa', PF.W - 18, PF.H - 25);
    }
  }

  // ---------------------------------------------------------------- frame
  function draw(ctx, m, opts = {}) {
    if (!fieldCanvas) buildField();
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (m.shake > 0) ctx.translate(U.rand(-m.shake, m.shake) * 0.6, U.rand(-m.shake, m.shake) * 0.6);
    ctx.drawImage(fieldCanvas, 0, 0);
    drawHazards(ctx, m);
    PF.FX.drawUnder(ctx, m.fx);
    if (!m.demo) drawAimAids(ctx, m);

    const ents = [];
    for (const it of m.items) ents.push({ y: it.y, draw: () => drawItem(ctx, it) });
    for (const p of m.players) ents.push({ y: p.y, draw: () => drawPlayer(ctx, m, p) });
    ents.push({ y: m.ball.y + (m.ball.holder && Math.sin(m.ball.holder.facing) < 0 ? -0.1 : 0.1), draw: () => drawBall(ctx, m) });
    ents.sort((a, b) => a.y - b.y);
    drawVine(ctx, m);
    for (const e of ents) e.draw();

    PF.FX.drawOver(ctx, m.fx);
    ctx.restore();

    if (m.state === 'kickoff' && !m.demo) {
      const mine = m.kicker.human;
      const lines = mine ? ['¡SAQUE!', 'apunta con WASD · J pase'] : ['SAQUE RIVAL', ''];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#141018';
      ctx.font = '40px Pixelify, monospace';
      ctx.strokeText(lines[0], F.cx, F.cy - 110);
      ctx.fillStyle = mine ? '#ffd23f' : '#fff'; ctx.fillText(lines[0], F.cx, F.cy - 110);
      if (lines[1]) {
        ctx.font = '20px Pixelify, monospace'; ctx.lineWidth = 6;
        ctx.strokeText(lines[1], F.cx, F.cy - 76);
        ctx.fillStyle = '#fff'; ctx.fillText(lines[1], F.cx, F.cy - 76);
      }
    }
    if (!opts.noHud) drawHUD(ctx, m, opts.names || PF.TEAM_NAMES);
  }

  return { draw };
})();
