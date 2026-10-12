/* ============ abilities.js — una habilidad por Pokémon ============
 * fn(m, p) se llama al pulsar habilidad con el enfriamiento listo.
 * Devolver false = no hizo nada (enfriamiento corto, sonido de fallo).
 */
PF.Abilities = (() => {
  const U = PF.U, F = PF.FIELD;
  const foes = (m, p) => m.players.filter((q) => q.team !== p.team);

  return {
    /** Pikachu: rayo a todos los rivales en el radio. */
    zap(m, p) {
      const M = PF.Match, R = 330;
      PF.FX.ring(m.fx, p.x, p.y, R, '#ffe066', 0.35, 5);
      for (const q of foes(m, p)) {
        if (q.slam || U.dist(p.x, p.y, q.x, q.y) > R) continue;
        PF.FX.bolt(m.fx, p.x, p.y - 22, q.x, q.y - 20);
        if (M.stunInPlace(m, q, 1.2)) PF.FX.burst(m.fx, q.x, q.y - 20, 10, '#fff36b', 160);
      }
      PF.FX.text(m.fx, p.x, p.y - 64, '¡ZAP!', '#fff36b', 1.2);
      PF.Audio.sfx.zap();
      m.shake = Math.max(m.shake, 6);
      m.freeze = 0.05;
    },

    /** Charmander: con pelota, tiro de fuego al instante; sin ella, el próximo tiro arde. */
    fireshot(m, p) {
      p.fireShot = 6;
      if (m.ball.holder === p) PF.Match.shoot(m, p, 1);
      else {
        PF.FX.text(m.fx, p.x, p.y - 60, '¡EN LLAMAS!', '#ff9a3d', 0.9);
        PF.Audio.sfx.fire();
      }
    },

    /** Squirtle: abanico de agua que barre rivales y pelota. */
    hydro(m, p) {
      const M = PF.Match, R = 300, HALF = 0.62;
      const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
      const inCone = (x, y) => {
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
        return d < R && d > 1 && Math.abs(U.angDiff(p.facing, Math.atan2(dy, dx))) < HALF;
      };
      for (const q of foes(m, p)) {
        if (!inCone(q.x, q.y)) continue;
        const d = U.dist(p.x, p.y, q.x, q.y) || 1;
        M.knock(m, q, (q.x - p.x) / d, (q.y - p.y) / d, 600, 0.6);
      }
      const b = m.ball;
      if ((!b.holder || b.holder.team !== p.team) && inCone(b.x, b.y)) {
        if (b.holder) { b.holder.pickupCd = 0.6; b.holder = null; }
        b.vx = fx * 720; b.vy = fy * 720; b.last = p; b.vine = null;
      }
      for (let i = 0; i < 46; i++) {
        const a = p.facing + U.rand(-HALF, HALF), s = U.rand(320, 720);
        PF.FX.particle(m.fx, p.x + fx * 18, p.y + fy * 18 - 14, Math.cos(a) * s, Math.sin(a) * s,
          U.pick(['#6cc6ff', '#b8e6ff', '#3b9cff']), U.rand(0.3, 0.5), U.rand(3, 6));
      }
      PF.FX.text(m.fx, p.x + fx * 90, p.y + fy * 90 - 50, '¡SPLASH!', '#8fd8ff', 1.1);
      PF.Audio.sfx.water();
    },

    /** Bulbasaur: látigo que trae la pelota, aunque la tenga un rival. */
    vine(m, p) {
      const b = m.ball;
      if (b.holder === p) return false;
      if (U.dist(p.x, p.y, b.x, b.y) > 440 || (b.holder && b.holder.phase > 0)) {
        PF.FX.text(m.fx, p.x, p.y - 56, 'no llega...', '#cfcfcf', 0.6, 0.7);
        PF.Audio.sfx.fail();
        return false;
      }
      if (b.holder) { b.holder.pickupCd = 0.6; b.holder.charge = -1; b.holder = null; }
      b.vine = p; b.vineT = 1.2; b.fire = 0; b.last = p;
      PF.FX.text(m.fx, p.x, p.y - 60, '¡ZIP!', '#7dff9e', 1.1);
      PF.Audio.sfx.vine();
    },

    /** Gengar: intangible y más rápido durante 3 s. */
    phase(m, p) {
      p.phase = 3;
      PF.FX.burst(m.fx, p.x, p.y - 20, 22, '#a27bff', 200, 0.5, 4);
      PF.FX.text(m.fx, p.x, p.y - 64, '¡BUUU!', '#c9a8ff', 1.2);
      PF.Audio.sfx.phase();
    },

    // ------------------------------------------------ segundas habilidades

    /** Pikachu: embestida rápida; si llevas la pelota, la conservas. */
    quick(m, p) {
      p.dash = 0.3;
      p.dashSpeed = 920;
      p.dashDx = Math.cos(p.facing);
      p.dashDy = Math.sin(p.facing);
      PF.FX.burst(m.fx, p.x, p.y - 10, 14, '#fff36b', 200, 0.3, 3);
      PF.FX.text(m.fx, p.x, p.y - 60, '¡ZUUM!', '#fff36b', 1);
      PF.Audio.sfx.swoosh();
      PF.Audio.sfx.zap();
    },

    /** Charmander: 3 s dejando fuego a su paso (lo genera match.js). */
    embers(m, p) {
      p.embers = 3;
      p.emberT = 0;
      PF.FX.text(m.fx, p.x, p.y - 60, '¡ASCUAS!', '#ff9a3d', 1);
      PF.Audio.sfx.fire();
    },

    /** Squirtle: charco resbaloso delante. */
    puddle(m, p) {
      const x = U.clamp(p.x + Math.cos(p.facing) * 150, F.x0 + 40, F.x1 - 40);
      const y = U.clamp(p.y + Math.sin(p.facing) * 150, F.y0 + 40, F.y1 - 40);
      PF.Match.addHazard(m, { kind: 'puddle', x, y, r: 85, life: 6, team: p.team });
      PF.FX.burst(m.fx, x, y, 30, '#8fd8ff', 260, 0.5, 4);
      PF.FX.text(m.fx, x, y - 40, '¡CHOF!', '#8fd8ff', 1.1);
      PF.Audio.sfx.water();
    },

    /** Bulbasaur: nube de esporas que duerme a quien entra. */
    sleep(m, p) {
      const x = U.clamp(p.x + Math.cos(p.facing) * 90, F.x0 + 40, F.x1 - 40);
      const y = U.clamp(p.y + Math.sin(p.facing) * 90, F.y0 + 40, F.y1 - 40);
      PF.Match.addHazard(m, { kind: 'sleep', x, y, r: 100, life: 2.6, team: p.team });
      PF.FX.text(m.fx, x, y - 50, '¡FSSSH!', '#e6c3ff', 1);
      PF.Audio.sfx.phase();
    },

    /** Gengar: reaparece 230 px más adelante, con la pelota si la llevaba. */
    teleport(m, p) {
      const b = m.ball;
      const x = U.clamp(p.x + Math.cos(p.facing) * 230, F.x0 + 30, F.x1 - 30);
      const y = U.clamp(p.y + Math.sin(p.facing) * 230, F.y0 + 30, F.y1 - 30);
      PF.FX.burst(m.fx, p.x, p.y - 20, 24, '#a27bff', 220, 0.5, 5);
      if (b.holder === p) { b.x += x - p.x; b.y += y - p.y; }
      p.x = x; p.y = y;
      p.vx *= 0.3; p.vy *= 0.3;
      PF.FX.burst(m.fx, x, y - 20, 24, '#c9a8ff', 220, 0.5, 5);
      PF.FX.text(m.fx, x, y - 64, '¡PUF!', '#c9a8ff', 1.1);
      PF.Audio.sfx.phase();
    },

    /** Snorlax: muralla inamovible durante 3,5 s. */
    wall(m, p) {
      p.wall = 3.5;
      PF.FX.ring(m.fx, p.x, p.y, 90, '#e8e0cc', 0.4, 8);
      PF.FX.text(m.fx, p.x, p.y - 70, '¡NO PASAS!', '#e8e0cc', 1.1);
      PF.Audio.sfx.slam();
      m.shake = Math.max(m.shake, 4);
    },

    /** Snorlax: salto hacia delante y aterrizaje que tumba a todos. */
    slam(m, p) {
      const d = 190;
      const x1 = U.clamp(p.x + Math.cos(p.facing) * d, F.x0 + 40, F.x1 - 40);
      const y1 = U.clamp(p.y + Math.sin(p.facing) * d, F.y0 + 40, F.y1 - 40);
      p.slam = { t: 0, dur: 0.5, x0: p.x, y0: p.y, x1, y1 };
      p.vx = 0; p.vy = 0;
      PF.Audio.sfx.jump();
    },
  };
})();
