/* ============ abilities.js — una habilidad por Pokémon ============
 * fn(m, p) se llama al pulsar habilidad con el enfriamiento listo.
 * Devolver false = no hizo nada (enfriamiento corto, sonido de fallo).
 */
PF.Abilities = (() => {
  const U = PF.U, F = PF.FIELD;
  const foes = (m, p) => m.players.filter((q) => q.team !== p.team);
  const near = (m, p, R) => foes(m, p).filter((q) => U.dist(p.x, p.y, q.x, q.y) < R);
  /** Al arquero con la pelota en las manos nadie se la saca. */
  const safe = (b) => !!(b.holder && b.holder.gkHold);

  /** Abanico de agua/ola: empuja rivales y pelota dentro del cono. */
  function cone(m, p, R, half, force, stun, ballSpeed) {
    const M = PF.Match;
    const inCone = (x, y) => {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      return d < R && d > 1 && Math.abs(U.angDiff(p.facing, Math.atan2(dy, dx))) < half;
    };
    for (const q of foes(m, p)) {
      if (!inCone(q.x, q.y)) continue;
      const d = U.dist(p.x, p.y, q.x, q.y) || 1;
      M.knock(m, q, (q.x - p.x) / d, (q.y - p.y) / d, force, stun);
    }
    const b = m.ball;
    if (ballSpeed && !safe(b) && (!b.holder || b.holder.team !== p.team) && inCone(b.x, b.y)) {
      if (b.holder) { b.holder.pickupCd = 0.6; b.holder = null; }
      b.vx = Math.cos(p.facing) * ballSpeed; b.vy = Math.sin(p.facing) * ballSpeed; b.last = p; b.vine = null;
    }
    return inCone;
  }

  const A = {
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
      if (!safe(b) && (!b.holder || b.holder.team !== p.team) && inCone(b.x, b.y)) {
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
      if (U.dist(p.x, p.y, b.x, b.y) > 440 || (b.holder && b.holder.phase > 0) || safe(b)) {
        PF.FX.text(m.fx, p.x, p.y - 56, 'no llega...', '#cfcfcf', 0.6, 0.7);
        PF.Audio.sfx.fail();
        return false;
      }
      if (b.holder) { b.holder.pickupCd = 0.6; b.holder.charge = -1; b.holder = null; }
      b.vine = p; b.vineT = 1.2; b.vineColor = '#7dff9e'; b.fire = 0; b.last = p;
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
      PF.Match.jump(m, p, 190, false);
      PF.Audio.sfx.jump();
    },

    // ------------------------------------------------ Pokémon desbloqueables

    /** Eevee: una habilidad al azar de otro Pokémon. */
    adapt(m, p) {
      const pool = Object.keys(A).filter((k) => k !== 'adapt' && k !== 'splash');
      const id = U.pick(pool);
      const r = PF.ROSTER.find((x) => x.abilities.some((a) => a.id === id));
      const name = r ? r.abilities.find((a) => a.id === id).name : id;
      PF.FX.text(m.fx, p.x, p.y - 90, name + '!', '#ffe0b0', 0.8, 1.1);
      m.hit = { from: p, type: PF.ABILITY_TYPE[id] };   // sus golpes cuentan con el tipo de la habilidad sorteada
      return A[id](m, p);
    },

    /** Psyduck: los rivales cercanos dan vueltas mareados. */
    confusion(m, p) {
      const M = PF.Match;
      PF.FX.ring(m.fx, p.x, p.y, 260, '#ffd84a', 0.4, 6);
      for (const q of near(m, p, 260)) {
        if (M.stunInPlace(m, q, 1.0)) {
          q.spinT = 1.0;
          PF.FX.text(m.fx, q.x, q.y - 50, '¿¡?!', '#ffd84a', 0.8, 0.8);
        }
      }
      PF.FX.text(m.fx, p.x, p.y - 64, '¡CONFUSIÓN!', '#ffd84a', 1);
      PF.Audio.sfx.phase();
    },

    /** Jigglypuff: duerme a todos los rivales cercanos. */
    sing(m, p) {
      const M = PF.Match, R = 230;
      PF.FX.ring(m.fx, p.x, p.y, R, '#ff9ccf', 0.6, 5);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        PF.FX.particle(m.fx, p.x, p.y - 30, Math.cos(a) * 220, Math.sin(a) * 140, '#ffd1ea', 0.8, 5);
      }
      for (const q of near(m, p, R)) {
        if (M.stunInPlace(m, q, 1.6)) { q.asleep = true; PF.FX.text(m.fx, q.x, q.y - 50, 'Zzz...', '#ffd1ea', 0.9); }
      }
      PF.FX.text(m.fx, p.x, p.y - 64, '♪ ¡Jiggly~! ♪', '#ff9ccf', 1);
      PF.Audio.sfx.sing();
    },

    /** Jigglypuff: rueda arrollando a todos (no se detiene al chocar). */
    roll(m, p) {
      p.dash = 0.6; p.ram = 0.6; p.dashSpeed = 720;
      p.dashDx = Math.cos(p.facing); p.dashDy = Math.sin(p.facing);
      PF.FX.text(m.fx, p.x, p.y - 60, '¡RODAR!', '#ff9ccf', 1);
      PF.Audio.sfx.swoosh();
    },

    /** Machamp: agarra al rival más cercano y lo lanza. */
    throw(m, p) {
      const M = PF.Match;
      let best = null, bd = 110;
      for (const q of foes(m, p)) {
        const d = U.dist(p.x, p.y, q.x, q.y);
        if (d < bd && !M.untouchable(q)) { bd = d; best = q; }
      }
      if (!best) {
        PF.FX.text(m.fx, p.x, p.y - 56, 'no hay nadie...', '#cfcfcf', 0.6, 0.7);
        PF.Audio.sfx.fail();
        return false;
      }
      M.knock(m, best, Math.cos(p.facing), Math.sin(p.facing), 820, 1.4);
      best.z = 0;
      PF.FX.text(m.fx, best.x, best.y - 60, '¡SÍSMICO!', '#ffd23f', 1.2);
      PF.FX.burst(m.fx, best.x, best.y - 10, 16, '#fff', 260);
      PF.Audio.sfx.slam();
      m.shake = Math.max(m.shake, 8);
      m.freeze = 0.08;
    },

    /** Machamp: puñetazo en cono corto que tumba y despeja la pelota. */
    punch(m, p) {
      cone(m, p, 140, 0.75, 680, 1.4, 900);
      const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
      PF.FX.burst(m.fx, p.x + fx * 60, p.y + fy * 60 - 14, 18, '#ffd23f', 260);
      PF.FX.text(m.fx, p.x + fx * 70, p.y + fy * 70 - 50, '¡PUÑO!', '#ffd23f', 1.2);
      PF.Audio.sfx.tackle();
      m.shake = Math.max(m.shake, 6);
    },

    /** Lapras: suelo congelado delante. */
    ice(m, p) {
      const x = U.clamp(p.x + Math.cos(p.facing) * 150, F.x0 + 40, F.x1 - 40);
      const y = U.clamp(p.y + Math.sin(p.facing) * 150, F.y0 + 40, F.y1 - 40);
      PF.Match.addHazard(m, { kind: 'ice', x, y, r: 95, life: 6, team: p.team });
      PF.FX.burst(m.fx, x, y, 30, '#dff6ff', 260, 0.5, 4);
      PF.FX.text(m.fx, x, y - 40, '¡CRIIC!', '#bfeeff', 1.1);
      PF.Audio.sfx.zap();
    },

    /** Lapras: ola larga que arrastra todo hacia delante. */
    surf(m, p) {
      const HALF = 0.42;
      cone(m, p, 440, HALF, 650, 0.7, 860);
      const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
      for (let i = 0; i < 70; i++) {
        const a = p.facing + U.rand(-HALF, HALF), s = U.rand(400, 860);
        PF.FX.particle(m.fx, p.x + fx * 20, p.y + fy * 20 - 10, Math.cos(a) * s, Math.sin(a) * s,
          U.pick(['#6cc6ff', '#b8e6ff', '#3b9cff', '#ffffff']), U.rand(0.35, 0.6), U.rand(4, 7));
      }
      PF.FX.text(m.fx, p.x + fx * 120, p.y + fy * 120 - 50, '¡SURF!', '#8fd8ff', 1.3);
      PF.Audio.sfx.water();
      m.shake = Math.max(m.shake, 5);
    },

    /** Onix: bajo tierra 1,2 s (intocable); al salir tumba a los de alrededor (match.js). */
    dig(m, p) {
      p.dig = 1.2;
      PF.FX.burst(m.fx, p.x, p.y, 20, '#8a6a4a', 220, 0.4, 5, 400);
      PF.FX.text(m.fx, p.x, p.y - 60, '¡EXCAVAR!', '#e8d2b0', 1);
      PF.Audio.sfx.slam();
    },

    /** Esfera aural que persigue al rival más cercano (por tipo: Lucha/Acero). */
    aura(m, p) {
      PF.Match.addProjectile(m, {
        x: p.x + Math.cos(p.facing) * 24, y: p.y - 18 + Math.sin(p.facing) * 24,
        vx: Math.cos(p.facing) * 560, vy: Math.sin(p.facing) * 560,
        team: p.team, kind: 'aura', life: 2.6, r: 14, homing: true, stun: 1.2,
        color: '#7fb8ff', hitText: '¡AURA!',
      });
      PF.FX.text(m.fx, p.x, p.y - 64, '¡ESFERA AURAL!', '#7fb8ff', 0.9);
      PF.Audio.sfx.zap();
    },

    /** Alakazam: esfera psíquica que persigue al rival más cercano. */
    psybeam(m, p) {
      PF.Match.addProjectile(m, {
        x: p.x + Math.cos(p.facing) * 24, y: p.y - 18 + Math.sin(p.facing) * 24,
        vx: Math.cos(p.facing) * 560, vy: Math.sin(p.facing) * 560,
        team: p.team, kind: 'aura', life: 2.6, r: 14, homing: true, stun: 1.2,
        color: '#e6a8ff', hitText: '¡PSICO!',
      });
      PF.FX.text(m.fx, p.x, p.y - 64, '¡PSICORRAYO!', '#e6a8ff', 0.9);
      PF.Audio.sfx.phase();
    },

    /** Jolteon: cinco agujas en abanico. */
    pinmissile(m, p) {
      for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) {
        const a = p.facing + off;
        PF.Match.addProjectile(m, {
          x: p.x + Math.cos(a) * 22, y: p.y - 16 + Math.sin(a) * 22,
          vx: Math.cos(a) * 860, vy: Math.sin(a) * 860,
          team: p.team, kind: 'shuriken', life: 0.75, r: 9, stun: 0.6,
          color: '#ffe066', hitText: '¡PIN!',
        });
      }
      PF.FX.text(m.fx, p.x, p.y - 64, '¡PIN MISIL!', '#ffe066', 0.9);
      PF.Audio.sfx.zap();
    },

    /** Tres estrellas de agua en abanico (por tipo: Agua/Siniestro/Bicho). */
    shuriken(m, p) {
      for (const off of [-0.22, 0, 0.22]) {
        const a = p.facing + off;
        PF.Match.addProjectile(m, {
          x: p.x + Math.cos(a) * 22, y: p.y - 16 + Math.sin(a) * 22,
          vx: Math.cos(a) * 820, vy: Math.sin(a) * 820,
          team: p.team, kind: 'shuriken', life: 0.9, r: 11, stun: 0.75,
          color: '#9fdcff', hitText: '¡ZING!',
        });
      }
      PF.FX.text(m.fx, p.x, p.y - 64, '¡SHURIKEN!', '#9fdcff', 0.9);
      PF.Audio.sfx.swoosh();
    },

    /** Magikarp: ...no pasa nada. Casi nunca. */
    splash(m, p) {
      const M = PF.Match;
      PF.FX.burst(m.fx, p.x, p.y - 10, 20, '#8fd8ff', 160, 0.5, 4, 300);
      PF.Audio.sfx.water();
      if (Math.random() < 0.1) {
        for (const q of near(m, p, 280)) {
          const d = U.dist(p.x, p.y, q.x, q.y) || 1;
          M.knock(m, q, (q.x - p.x) / d, (q.y - p.y) / d, 600, 1.6);
        }
        PF.FX.ring(m.fx, p.x, p.y, 280, '#8fd8ff', 0.5, 10);
        PF.FX.text(m.fx, p.x, p.y - 70, '¡¿¡QUÉ!?!', '#ffd23f', 1.6);
        PF.Audio.crowd('cheer', 0.8);
        m.shake = Math.max(m.shake, 12);
      } else {
        PF.FX.text(m.fx, p.x, p.y - 64, '¡Pero no pasa nada!', '#cfe8ff', 0.8, 1.1);
      }
    },

    /** Magikarp: salto enorme, sin onda expansiva. */
    jump(m, p) {
      PF.Match.jump(m, p, 260, true);
      PF.FX.text(m.fx, p.x, p.y - 64, '¡BOING!', '#ffd23f', 1);
      PF.Audio.sfx.jump();
    },

    /** Mewtwo: trae la pelota con la mente, desde donde sea. */
    psychic(m, p) {
      const b = m.ball;
      if (b.holder === p || (b.holder && b.holder.phase > 0) || safe(b)) return false;
      if (b.holder) { b.holder.pickupCd = 0.6; b.holder.charge = -1; b.holder = null; }
      b.vine = p; b.vineT = 2.2; b.vineColor = '#d6a6ff'; b.fire = 0; b.last = p;
      PF.FX.text(m.fx, p.x, p.y - 64, '¡PSÍQUICO!', '#d6a6ff', 1.1);
      PF.Audio.sfx.phase();
    },

    /** Mewtwo: onda que aparta y aturde a los rivales alrededor. */
    psywave(m, p) {
      const M = PF.Match, R = 300;
      for (const q of near(m, p, R)) {
        const d = U.dist(p.x, p.y, q.x, q.y) || 1;
        M.knock(m, q, (q.x - p.x) / d, (q.y - p.y) / d, 620 - d, 0.7);
      }
      PF.FX.ring(m.fx, p.x, p.y, R * 1.3, '#d6a6ff', 0.5, 10);
      PF.FX.ring(m.fx, p.x, p.y, R * 0.8, '#ffffff', 0.35, 5);
      PF.FX.text(m.fx, p.x, p.y - 70, '¡ONDA MENTAL!', '#d6a6ff', 1.1);
      PF.Audio.sfx.zap();
      m.shake = Math.max(m.shake, 8);
    },
  };

  return A;
})();
