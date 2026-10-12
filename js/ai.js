/* ============ ai.js — cerebro de los Pokémon que no controlas ============
 * Máquina de estados sencilla, re-evaluada cada `skill.react` segundos:
 *   con pelota          conducir al arco esquivando, tirar de cerca, pasar si aprietan
 *   compañero la tiene  desmarcarse por delante, en la otra mitad de la cancha
 *   me la pasan         ir a buscarla
 *   suelta / del rival  uno va a por ella (con histéresis), el otro cubre el arco
 * Las habilidades se usan cuando la situación las pide (WANTS).
 */
PF.AI = (() => {
  const U = PF.U, F = PF.FIELD;

  /**
   * speed     multiplica la velocidad del Pokémon
   * react     segundos entre decisiones
   * aggro     probabilidad de placar cuando puede
   * ability   probabilidad de usar la habilidad cuando conviene
   * aim       error al apuntar (radianes)
   * steal     segundos de contacto con la pelota para robarla
   * tackleCd  recarga del placaje
   */
  const SKILLS = {
    easy: { speed: 0.78, react: 0.5, aggro: 0.25, ability: 0.12, aim: 0.3, steal: 0.9, tackleCd: 2.6 },
    normal: { speed: 0.9, react: 0.28, aggro: 0.55, ability: 0.35, aim: 0.15, steal: 0.45, tackleCd: 1.6 },
    hard: { speed: 1.0, react: 0.14, aggro: 0.9, ability: 0.7, aim: 0.07, steal: 0.22, tackleCd: 1.15 },
    mate: { speed: 0.95, react: 0.2, aggro: 0.6, ability: 0.45, aim: 0.1, steal: 0.3, tackleCd: 1.3 },
  };

  /**
   * Cuándo conviene cada habilidad. Reciben el contexto `c` y devuelven
   * true, un ángulo (usar mirando hacia ahí) o nada.
   */
  const WANTS = {
    zap: (c) => (c.mine ? c.pressure < 200 : c.foeHolder && c.dHolder < 300),
    quick: (c) => (c.mine ? (c.pressure < 120 || c.dGoal < 650) && c.aimGoal : !c.b.holder && c.dMe > 220 && c.chasing && c.aimBall),
    fireshot: (c) => c.mine && c.dGoal < 700 && c.aimGoal,
    embers: (c) => (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 180),
    hydro: (c) => c.foeHolder && c.dHolder < 250 && c.aimHolder,
    puddle: (c) => c.foeHolder && c.dHolder < 230 && c.aimHolder,
    vine: (c) => !c.mine && c.dMe < 420 && (c.foeHolder || c.dMe > 200),
    sleep: (c) => c.foeHolder && c.dHolder < 170 && c.aimHolder,
    phase: (c) => (c.mine ? c.pressure < 130 : !c.b.holder && c.dMe > 250 && c.chasing),
    teleport: (c) => (c.mine ? c.pressure < 110 && c.aimGoal : !c.b.holder && c.dMe > 260 && c.chasing && c.aimBall),
    slam: (c) => (c.mine ? c.pressure < 150 && c.aimGoal : c.foeHolder && c.dHolder < 210 && c.aimHolder),
    wall: (c) => !c.mine && Math.abs(c.b.x - c.ownX) < 330 && c.dMe < 260,
  };

  function nearestFoeDist(m, p, x, y) {
    let best = Infinity;
    for (const q of m.players) if (q.team !== p.team && q.stun <= 0) best = Math.min(best, U.dist(x, y, q.x, q.y));
    return best;
  }

  function moveTo(it, p, tx, ty) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 10) return;
    const k = Math.min(1, d / 50);
    it.mx = (dx / d) * k;
    it.my = (dy / d) * k;
  }

  /** Decide si usar la habilidad; si sí, rellena `it` y devuelve true. */
  function tryAbility(p, m, it, c) {
    if (p.cd > 0 || Math.random() > p.skill.ability) return false;
    const want = WANTS[p.def.ability.id];
    const r = want && want(c);
    if (!r) return false;
    if (typeof r === 'number') it.aim = r;
    it.ability = true;
    return true;
  }

  /** Saque: mirar al compañero y pasársela. */
  function kickoff(p, m) {
    const mate = PF.Match.mateOf(m, p);
    const aim = mate ? Math.atan2(mate.y - p.y, mate.x - p.x) : p.facing;
    return { mx: 0, my: 0, aim, pass: m.stateT > 1.0, shootHold: false, ability: false };
  }

  function think(p, m, dt) {
    const s = p.skill, ai = p.ai, b = m.ball;
    const it = { mx: 0, my: 0, pass: false, shootHold: false, ability: false };
    const dirX = p.team === 0 ? 1 : -1;
    const goalX = p.team === 0 ? F.x1 : F.x0;
    const ownX = p.team === 0 ? F.x0 : F.x1;
    const mate = PF.Match.mateOf(m, p);
    const foes = m.players.filter((q) => q.team !== p.team);
    ai.t -= dt;
    const decide = ai.t <= 0;
    if (decide) ai.t = s.react * U.rand(0.7, 1.3);

    const holder = b.holder;
    const mine = holder === p;
    const gy = F.cy + (p.y < F.cy ? 1 : -1) * U.rand(20, 60);   // al palo contrario
    const c = {
      b, mine, ownX,
      foeHolder: !!(holder && holder.team !== p.team),
      dHolder: holder ? U.dist(p.x, p.y, holder.x, holder.y) : Infinity,
      aimHolder: holder ? Math.atan2(holder.y - p.y, holder.x - p.x) : 0,
      dMe: U.dist(p.x, p.y, b.x, b.y),
      aimBall: Math.atan2(b.y - p.y, b.x - p.x),
      dGoal: U.dist(p.x, p.y, goalX, F.cy),
      aimGoal: Math.atan2(gy - p.y, goalX + dirX * 30 - p.x),
      pressure: nearestFoeDist(m, p, p.x, p.y),
      chasing: ai.chasing,
    };

    // ---------------------------------------------- con la pelota
    if (mine) {
      // terminar un tiro que ya se estaba cargando
      if (ai.shotT > 0) {
        ai.shotT -= dt;
        it.shootHold = ai.shotT > 0;
        it.aim = ai.aim;
        return it;
      }
      if (decide) {
        if (tryAbility(p, m, it, c)) return it;
        if (c.dGoal < 440 && (p.x - goalX) * dirX < -20) {
          ai.aim = c.aimGoal + U.rand(-s.aim, s.aim);
          ai.shotT = U.lerp(0.12, PF.Match.CHARGE_MAX, U.clamp((c.dGoal - 120) / 320, 0, 1));
          it.shootHold = true;
          it.aim = ai.aim;
          return it;
        }
        if (mate && mate.stun <= 0 && !mate.slam) {
          const mateFree = nearestFoeDist(m, mate, mate.x, mate.y);
          const mateAhead = (mate.x - p.x) * dirX;
          if (c.pressure < 90 && mateFree > 110 && Math.random() < 0.7) { it.pass = true; return it; }
          if (mateAhead > 160 && mateFree > 170 && Math.random() < 0.2) { it.pass = true; return it; }
        }
      }
      // conducir hacia el arco apartándose de los rivales
      let vx = goalX - p.x, vy = gy - p.y;
      const l = Math.hypot(vx, vy) || 1;
      vx /= l; vy /= l;
      for (const q of foes) {
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
        if (d < 170 && d > 1) {
          const w = ((170 - d) / 170) * 1.4;
          vx += (dx / d) * w; vy += (dy / d) * w;
        }
      }
      if (p.y < F.y0 + 70) vy += 0.9;
      if (p.y > F.y1 - 70) vy -= 0.9;
      if ((p.x - goalX) * dirX > -60) vx -= dirX;   // no quedarse pegado a la línea de fondo
      const vl = Math.hypot(vx, vy) || 1;
      it.mx = vx / vl; it.my = vy / vl;
      return it;
    }
    ai.shotT = 0;

    const order = PF.Match.orderOf(m, p);

    // ---------------------------------------------- la tiene mi compañero
    if (holder && holder.team === p.team) {
      ai.chasing = false;
      let tx, ty;
      if (order === 'def') {
        // quedarse atrás, cubriendo el contraataque
        tx = holder.x - dirX * 240;
        ty = F.cy + (holder.y - F.cy) * -0.3;
      } else {
        tx = holder.x + dirX * (order === 'atk' ? 290 : 200);
        ty = holder.y < F.cy ? F.cy + 140 : F.cy - 140;
      }
      moveTo(it, p, U.clamp(tx, F.x0 + 70, F.x1 - 70), ty);
      return it;
    }

    // ---------------------------------------------- me la pasan: ir a buscarla
    if (b.passTo === p && !holder) {
      ai.chasing = true;
      const t = Math.min(0.6, c.dMe / p.def.speed);
      moveTo(it, p, b.x + b.vx * t * 0.7, b.y + b.vy * t * 0.7);
      return it;
    }

    // ---------------------------------------------- suelta o del rival
    const mateOk = mate && mate.stun <= 0 && !mate.slam;
    const dMate = mateOk ? U.dist(mate.x, mate.y, b.x, b.y) : Infinity;
    const ownThird = Math.abs(b.x - ownX) < (F.x1 - F.x0) / 3;
    if (order === 'def') ai.chasing = (ownThird && c.dMe < dMate * 1.1) || c.dMe < 110;
    else if (order === 'atk') ai.chasing = c.dMe < dMate * 0.5 && c.dMe < 220;
    else if (mate && mate.human) ai.chasing = c.dMe < dMate * 0.7;
    else if (mateOk && mate.ai.chasing) ai.chasing = c.dMe < dMate * 0.8;   // relevo sólo si estoy claramente más cerca
    else ai.chasing = c.dMe <= dMate * 1.25;
    c.chasing = ai.chasing;

    if (decide && tryAbility(p, m, it, c)) return it;

    if (ai.chasing) {
      if (holder) {
        moveTo(it, p, b.x, b.y);
        if (decide && c.dHolder < 95 && p.tackleCd <= 0 && holder.phase <= 0 && Math.random() < s.aggro) {
          it.aim = c.aimHolder;
          it.pass = true;
        }
      } else {
        const t = Math.min(0.6, c.dMe / p.def.speed);
        moveTo(it, p, b.x + b.vx * t * 0.7, b.y + b.vy * t * 0.7);
      }
    } else if (order === 'atk') {
      // esperar arriba, del lado contrario a la pelota, listo para el contragolpe
      const tx = F.cx + dirX * 200;
      const ty = b.y < F.cy ? F.cy + 130 : F.cy - 130;
      moveTo(it, p, tx, ty);
    } else {
      // cubrir: entre la pelota y el arco propio (más pegado al arco si defiende)
      const k = order === 'def' ? 0.22 : 0.35;
      const tx = ownX + (b.x - ownX) * k;
      const ty = F.cy + (b.y - F.cy) * 0.55;
      moveTo(it, p, dirX > 0 ? Math.max(tx, F.x0 + 70) : Math.min(tx, F.x1 - 70), ty);
    }
    return it;
  }

  return { SKILLS, think, kickoff };
})();
