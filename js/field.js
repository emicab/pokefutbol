/* ============ field.js — paredes de la cancha y choques contra ellas ============
 * La cancha es un polígono cerrado (con los bolsillos de los arcos) hecho de
 * segmentos. Las bocas de los arcos son segmentos sólo para jugadores: la
 * pelota entra, los Pokémon no.
 */
PF.Field = (() => {
  const F = PF.FIELD;
  const segs = [];

  (function build() {
    const { x0, x1, y0, y1, cx, cy, goalHalf: g, goalDepth: d, chamfer: c } = F;
    const pts = [
      [x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, cy - g],
      [x1 + d, cy - g], [x1 + d, cy + g], [x1, cy + g], [x1, y1 - c],
      [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, cy + g],
      [x0 - d, cy + g], [x0 - d, cy - g], [x0, cy - g], [x0, y0 + c],
    ];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      segs.push({ ax, ay, bx, by, playersOnly: false });
    }
    segs.push({ ax: x1, ay: cy - g, bx: x1, by: cy + g, playersOnly: true });
    segs.push({ ax: x0, ay: cy - g, bx: x0, by: cy + g, playersOnly: true });
    F.outline = pts;
  })();

  /**
   * Saca un círculo de las paredes y hace rebotar su velocidad.
   * Devuelve la velocidad de impacto (0 si no tocó nada).
   */
  function collide(body, r, restitution, isBall) {
    let impact = 0;
    for (const s of segs) {
      if (s.playersOnly && isBall) continue;
      const ex = s.bx - s.ax, ey = s.by - s.ay;
      const len2 = ex * ex + ey * ey;
      let t = ((body.x - s.ax) * ex + (body.y - s.ay) * ey) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + ex * t, py = s.ay + ey * t;
      const dx = body.x - px, dy = body.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      body.x += nx * (r - d);
      body.y += ny * (r - d);
      const vn = body.vx * nx + body.vy * ny;
      if (vn < 0) {
        body.vx -= (1 + restitution) * vn * nx;
        body.vy -= (1 + restitution) * vn * ny;
        impact = Math.max(impact, -vn);
      }
    }
    return impact;
  }

  /** ¿El punto quedó fuera de la cancha? (red de seguridad contra túneles) */
  function outside(x, y) {
    return x < F.x0 - F.goalDepth - 20 || x > F.x1 + F.goalDepth + 20 || y < F.y0 - 20 || y > F.y1 + 20;
  }

  return { collide, outside };
})();
