/* ============ fx.js — partículas, onomatopeyas, ondas y rayos ============
 * Todo lo que es puramente visual y caduca solo. Cada partido tiene su
 * propio contenedor (PF.FX.create()).
 */
PF.FX = (() => {
  const U = PF.U;

  function create() { return { parts: [], texts: [], rings: [], bolts: [], lines: [] }; }

  function particle(fx, x, y, vx, vy, color, life = 0.4, size = 3, grav = 0) {
    fx.parts.push({ x, y, vx, vy, color, life, max: life, size, grav });
  }

  function burst(fx, x, y, n, color, speed = 200, life = 0.4, size = 3, grav = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * U.rand(0.3, 1);
      particle(fx, x, y, Math.cos(a) * s, Math.sin(a) * s, color, life * U.rand(0.6, 1.2), size, grav);
    }
  }

  /** Onomatopeya de cómic: aparece con un "pop", sube y se desvanece. */
  function text(fx, x, y, str, color = '#ffd23f', size = 1, life = 1.0) {
    fx.texts.push({ x, y, str, color, size, life, max: life, rot: U.rand(-0.14, 0.14) });
  }

  function ring(fx, x, y, r, color, life = 0.4, width = 6) {
    fx.rings.push({ x, y, r, color, life, max: life, width });
  }

  /** Rayo quebrado entre dos puntos. */
  function bolt(fx, x1, y1, x2, y2, color = '#fff36b', life = 0.28) {
    const pts = [[x1, y1]];
    const n = 7;
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n, off = U.rand(-22, 22);
      pts.push([U.lerp(x1, x2, t) + (nx / nl) * off, U.lerp(y1, y2, t) + (ny / nl) * off]);
    }
    pts.push([x2, y2]);
    fx.bolts.push({ pts, color, life, max: life });
  }

  /** Lluvia de papelitos sobre lo que ve la cámara. */
  function confetti(fx, colors, cam = { x: 0, y: 0 }, n = 140) {
    for (let i = 0; i < n; i++) {
      particle(fx, cam.x + U.rand(0, PF.W), cam.y + U.rand(-60, 0), U.rand(-60, 60), U.rand(60, 260),
        U.pick(colors), U.rand(1.6, 2.6), U.rand(3, 6), 120);
    }
  }

  function update(fx, dt) {
    for (const p of fx.parts) {
      p.life -= dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 2.5); if (!p.grav) p.vy *= 1 - Math.min(1, dt * 2.5);
    }
    fx.parts = fx.parts.filter((p) => p.life > 0);
    for (const t of fx.texts) { t.life -= dt; t.y -= 34 * dt; }
    fx.texts = fx.texts.filter((t) => t.life > 0);
    for (const r of fx.rings) r.life -= dt;
    fx.rings = fx.rings.filter((r) => r.life > 0);
    for (const b of fx.bolts) b.life -= dt;
    fx.bolts = fx.bolts.filter((b) => b.life > 0);
  }

  function drawUnder(ctx, fx) {
    for (const r of fx.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * (0.3 + 0.7 * k), r.r * (0.3 + 0.7 * k) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawOver(ctx, fx) {
    for (const p of fx.parts) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    for (const b of fx.bolts) {
      ctx.globalAlpha = b.life / b.max;
      for (const [w, c] of [[7, 'rgba(255,255,160,0.35)'], [3, b.color], [1, '#fff']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath();
        b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      const age = t.max - t.life;
      const pop = age < 0.1 ? 0.4 + (age / 0.1) * 0.9 : age < 0.2 ? 1.3 - ((age - 0.1) / 0.1) * 0.3 : 1;
      ctx.globalAlpha = Math.min(1, t.life / 0.25);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      ctx.scale(pop * t.size, pop * t.size);
      ctx.font = '28px Pixelify, monospace';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7; ctx.strokeStyle = '#141018';
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  return { create, particle, burst, text, ring, bolt, confetti, update, drawUnder, drawOver };
})();
