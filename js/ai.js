/* ============ ai.js — cerebro de los Pokémon que no controlas ============
 * Máquina de estados sencilla, re-evaluada cada `skill.react` segundos:
 *   con pelota          conducir al arco esquivando, tirar de cerca, pasar si aprietan
 *   me la pasan         ir a buscarla
 *   suelta / del rival  la persigue el más cercano del equipo (con histéresis)
 *   el resto            2 vs 2: apoyar por delante o cubrir el arco;
 *                       3 y 5: ocupar su puesto de la formación, que se mueve con la pelota
 * Las habilidades se usan cuando la situación las pide (WANTS).
 * En el equipo humano, la orden de la tecla T (neutro/ataque/defensa) corre
 * el bloque hacia delante o atrás y cambia cuándo salen a presionar.
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
    easy: { speed: 0.78, react: 0.5, aggro: 0.25, ability: 0.12, aim: 0.3, steal: 0.9, tackleCd: 2.6, keeper: 0.8 },
    normal: { speed: 0.9, react: 0.28, aggro: 0.55, ability: 0.35, aim: 0.15, steal: 0.45, tackleCd: 1.6, keeper: 1 },
    hard: { speed: 1.0, react: 0.14, aggro: 0.9, ability: 0.7, aim: 0.07, steal: 0.22, tackleCd: 1.15, keeper: 1.12 },
    mate: { speed: 0.95, react: 0.2, aggro: 0.6, ability: 0.45, aim: 0.1, steal: 0.3, tackleCd: 1.3, keeper: 1 },
  };

  /**
   * Cuándo conviene cada habilidad. Reciben el contexto `c` y devuelven
   * true, un ángulo (usarla mirando hacia ahí) o nada.
   */
  const WANTS = {
    zap: (c) => (c.mine ? c.pressure < 200 : c.foeHolder && c.dHolder < 300),
    quick: (c) => (c.mine ? (c.pressure < 120 || c.dGoal < 650) && c.aimGoal : !c.b.holder && c.dMe > 220 && c.chasing && c.aimBall),
    roll: (c) => (c.mine ? c.pressure < 140 && c.aimGoal : c.foeHolder && c.dHolder < 300 && c.aimHolder),
    fireshot: (c) => c.mine && c.dGoal < 700 && c.aimGoal,
    embers: (c) => (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 180),
    hydro: (c) => c.foeHolder && c.dHolder < 250 && c.aimHolder,
    surf: (c) => (c.mine ? c.dGoal < 520 && c.aimGoal : c.foeHolder && c.dHolder < 380 && c.aimHolder),
    puddle: (c) => c.foeHolder && c.dHolder < 230 && c.aimHolder,
    ice: (c) => c.foeHolder && c.dHolder < 230 && c.aimHolder,
    vine: (c) => !c.mine && c.dMe < 420 && (c.foeHolder || c.dMe > 200),
    psychic: (c) => !c.mine && (c.foeHolder || c.dMe > 320),
    sleep: (c) => c.foeHolder && c.dHolder < 170 && c.aimHolder,
    sing: (c) => c.foesNear > 0 && (c.mine ? c.pressure < 160 : c.foeHolder && c.dHolder < 210),
    confusion: (c) => c.foesNear > 0 && (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 240),
    psywave: (c) => (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 260),
    phase: (c) => (c.mine ? c.pressure < 130 : !c.b.holder && c.dMe > 250 && c.chasing),
    teleport: (c) => (c.mine ? c.pressure < 110 && c.aimGoal : !c.b.holder && c.dMe > 260 && c.chasing && c.aimBall),
    dig: (c) => (c.mine ? c.pressure < 120 && c.aimGoal : !c.b.holder && c.dMe > 260 && c.chasing && c.aimBall),
    slam: (c) => (c.mine ? c.pressure < 150 && c.aimGoal : c.foeHolder && c.dHolder < 210 && c.aimHolder),
    jump: (c) => c.mine && c.pressure < 100 && c.aimGoal,
    wall: (c) => !c.mine && Math.abs(c.b.x - c.ownX) < 330 && c.dMe < 260,
    throw: (c) => c.foeHolder && c.dHolder < 100,
    punch: (c) => c.foeHolder && c.dHolder < 130 && c.aimHolder,
    aura: (c) => c.foeHolder && c.dHolder < 650,
    psybeam: (c) => c.foeHolder && c.dHolder < 650,
    pinmissile: (c) => c.foeHolder && c.dHolder < 420 && c.aimHolder,
    shuriken: (c) => c.foeHolder && c.dHolder < 480 && c.aimHolder,
    adapt: (c) => (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 220),
    splash: (c) => c.pressure < 220,
  };

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

  // ------------------------------------------------------------------ arquero
  /**
   * Arquero (fijo, o dinámico con la pelota en su mitad):
   *   1) tiro que viene al arco → ir al punto por donde cruza; estirarse si no llega
   *   2) pelota suelta cerca del arco y él llega antes que los rivales → salir a por ella
   *   3) rival con la pelota cerca del arco y él es quien mejor llega → salir
   *      directo a cerrarle el ángulo y placarlo (aunque sea fuera del área;
   *      las manos sólo valen dentro). Un compañero lo releva en el arco.
   *   4) si no, se mueve por el área grande: adelantado (de líbero) con la
   *      pelota lejos, sobre la línea cuando se acerca; siempre entre la
   *      pelota y el centro del arco.
   */
  function keeperThink(p, m, it, c) {
    const M = PF.Match, b = m.ball, s = p.skill;
    const dir = M.dirOf(p.side), gx = M.ownGoalX(p.side);
    const lineX = gx + dir * 34;
    const maxY = F.goalHalf - 8;
    it.aim = c.aimBall;

    if (!b.holder && b.vx * dir < -250) {
      const t = (lineX - b.x) / b.vx;
      if (t > 0 && t < 0.9) {
        const yAt = b.y + b.vy * t;
        if (Math.abs(yAt - F.cy) < F.goalHalf + 40) {
          const ty = U.clamp(yAt, F.cy - maxY - 12, F.cy + maxY + 12);
          const far = U.dist(p.x, p.y, lineX, ty) > 26;
          if (far && t < 0.42 && p.dash <= 0 && Math.random() > s.react * 0.8) { it.dive = [lineX, ty]; return it; }
          moveTo(it, p, lineX, ty);
          return it;
        }
      }
    }
    const ballToGoal = U.dist(b.x, b.y, gx, F.cy);
    const foes = m.players.filter((q) => q.team !== p.team);
    const mates = M.matesOf(m, p).filter((q) => q.stun <= 0);
    if (!b.holder && (M.inBox(p.side, b.x, b.y, 20) || ballToGoal < 380)) {
      const foeD = foes.reduce((d, q) => Math.min(d, U.dist(q.x, q.y, b.x, b.y)), Infinity);
      if (c.dMe < foeD * 1.15 || c.dMe < 120) { moveTo(it, p, b.x, b.y); return it; }
    }
    if (c.foeHolder && ballToGoal < 430) {
      // ¿llego yo mejor que mis compañeros? (o ya lo tengo encima)
      const mateD = mates.reduce((d, q) => Math.min(d, U.dist(q.x, q.y, b.x, b.y)), Infinity);
      if (c.dHolder < 170 || c.dHolder < mateD * 0.9) {
        moveTo(it, p, U.lerp(gx, b.x, 0.85), U.lerp(F.cy, b.y, 0.85));   // por delante, del lado del arco
        if (c.dHolder < 80 && p.tackleCd <= 0 && Math.random() < s.aggro + 0.2) { it.aim = c.aimHolder; it.pass = true; }
        return it;
      }
    }
    // cuanto más lejos la pelota, más se adelanta (hasta el 75 % del área)
    const dGoal = U.dist(b.x, b.y, gx, F.cy);
    const near = 1 - U.clamp((dGoal - 150) / 650, 0, 1);
    const depth = U.lerp(F.boxW * 0.75, 30, near);
    const ang = Math.atan2(b.y - F.cy, (b.x - gx) * dir);
    const ty = F.cy + U.clamp(Math.sin(ang) * depth * 0.9 + (b.y - F.cy) * 0.25, -F.boxH * 0.6, F.boxH * 0.6);
    moveTo(it, p, gx + dir * depth, Math.abs(depth) < 60 ? U.clamp(ty, F.cy - maxY, F.cy + maxY) : ty);
    if (Math.hypot(it.mx, it.my) < 0.05) it.aim = c.aimBall;
    return it;
  }

  /** Arquero con la pelota en las manos: pase a un compañero libre o despeje largo. */
  function keeperDistribute(p, m, it) {
    const M = PF.Match, ai = p.ai, dirX = M.dirOf(p.side);
    if (p.gkT < 0.7 + (p.slot % 3) * 0.15) return it;
    const mate = M.passTarget(m, p);
    if (mate && M.nearestFoeDist(m, mate, mate.x, mate.y) > 120) { it.pass = true; return it; }
    // despeje largo hacia una banda, lejos del arco
    it.clear = Math.atan2((p.y < F.cy ? 1 : -1) * 0.3, dirX);
    it.aim = it.clear;
    return it;
  }

  /**
   * Marcas del equipo: cada IA que no va a la pelota se asigna a un rival,
   * empezando por el más peligroso (el más cerca de nuestro arco, sin contar
   * al que lleva la pelota, que es del que persigue). Sólo cuando defendemos
   * en nuestra mitad. Se recalcula cada medio segundo.
   */
  function markOf(p, m) {
    const M = PF.Match, b = m.ball;
    m.marks = m.marks || [null, null];
    m.markT = m.markT || [0, 0];
    const team = p.team;
    if (!m.marks[team] || m.clock - m.markT[team] > 0.5) {
      m.markT[team] = m.clock;
      const own = M.ownGoalX(p.side), dir = M.dirOf(p.side);
      // con el arquero rival sacando de las manos no se marca: se vuelve a la formación
      // en 5 vs 5 la marca es más floja: sólo en el último tercio, y con dos marcadores como mucho
      const big = M.teamOf(m, team).length >= 5;
      const zone = (big ? 0.36 : 0.55) * (F.x1 - F.x0);
      const ballDepth = (b.x - own) * dir;
      const foeHas = b.holder && b.holder.team !== team && !b.holder.gkHold;
      const defending = big ? (foeHas || !b.holder) && ballDepth < zone : foeHas || (!b.holder && ballDepth < zone);
      const map = new Map();
      if (defending) {
        const keeper = M.keeperOf(m, team);
        const markers = M.teamOf(m, team).filter((q) => !q.human && q !== keeper && !q.ai.chasing && q.stun <= 0);
        const threats = m.players.filter((q) => q.team !== team && q !== b.holder && !M.isActiveKeeper(m, q))
          .sort((a, c) => U.dist(a.x, a.y, own, F.cy) - U.dist(c.x, c.y, own, F.cy));
        const free = markers.slice();
        let assigned = 0;
        for (const t of threats) {
          if (!free.length || (big && assigned >= 2)) break;
          if ((t.x - own) * dir > (F.x1 - F.x0) * (big ? 0.42 : 0.6)) continue;   // muy arriba: no hace falta
          assigned++;
          free.sort((a, c) => U.dist(a.x, a.y, t.x, t.y) - U.dist(c.x, c.y, t.x, t.y));
          map.set(free.shift(), t);
        }
      }
      m.marks[team] = map;
    }
    return m.marks[team].get(p) || null;
  }

  /** Relevo del arquero fijo: si salió de su área, el más cercano al arco (libre) se pone en la línea. */
  function coverGoal(p, m, it) {
    const M = PF.Match, b = m.ball;
    if (m.keeperMode !== 'fixed') return false;
    const keeper = M.keeperOf(m, p.team);
    if (!keeper || keeper === p || M.inBox(keeper.side, keeper.x, keeper.y, 30)) return false;
    const gx = M.ownGoalX(p.side), dir = M.dirOf(p.side);
    const candidates = M.teamOf(m, p.team).filter((q) => q !== keeper && !q.human && !q.ai.chasing && q.stun <= 0);
    const closest = candidates.reduce((a, q) => (!a || U.dist(q.x, q.y, gx, F.cy) < U.dist(a.x, a.y, gx, F.cy) ? q : a), null);
    if (closest !== p) return false;
    moveTo(it, p, gx + dir * 40, F.cy + U.clamp((b.y - F.cy) * 0.4, -F.goalHalf + 10, F.goalHalf - 10));
    return true;
  }

  /**
   * Desmarque: alrededor de su puesto (hx, hy), el punto con más aire, la línea
   * de pase desde `holder` libre, algo más adelante y sin amontonarse con
   * compañeros. Bonus si desde ahí hay tiro limpio.
   */
  function openSpot(p, m, holder, hx, hy, dirX, goalX) {
    const M = PF.Match;
    const mates = M.matesOf(m, p).filter((q) => q !== holder);
    let best = [hx, hy], bestS = -Infinity;
    for (const ax of [-100, 30, 160, 290]) {
      for (const ay of [-200, -80, 80, 200]) {
        const x = U.clamp(hx + ax * dirX, F.x0 + 80, F.x1 - 80);
        const y = U.clamp(hy + ay, F.y0 + 50, F.y1 - 50);
        if ((goalX - x) * dirX < 70) continue;   // no pegarse a la línea de fondo
        let s = Math.min(260, M.nearestFoeDist(m, p, x, y));
        s += Math.min(150, M.laneClear(m, p.team, holder.x, holder.y, x, y)) * 0.8;
        s += U.clamp((x - holder.x) * dirX, -200, 320) * 0.35;
        s -= U.dist(x, y, hx, hy) * 0.22;
        for (const q of mates) if (U.dist(x, y, q.x, q.y) < 170) s -= 120;
        if (U.dist(x, y, goalX, F.cy) < 420 && M.bestShot(m, p, x, y).clear > 30) s += 90;
        if (s > bestS) { bestS = s; best = [x, y]; }
      }
    }
    return best;
  }

  /** Saque: mirar al mejor compañero y pasársela. */
  function kickoff(p, m) {
    const mate = PF.Match.passTarget(m, p);
    const aim = mate ? Math.atan2(mate.y - p.y, mate.x - p.x) : p.facing;
    return { mx: 0, my: 0, aim, pass: m.stateT > 1.0, shootHold: false, ability: false };
  }

  /**
   * ¿Persigo yo la pelota? Uno por equipo: el más cercano entre las IA, con
   * histéresis para que no se la pasen el turno a cada paso. Si el humano
   * está más cerca, las IA se quedan en su sitio.
   */
  function shouldChase(p, m, dMe, order) {
    const ai = p.ai, b = m.ball;
    const mates = PF.Match.matesOf(m, p).filter((q) => q.stun <= 0 && !q.slam);
    let dOtherAI = Infinity, otherChasing = false, dHuman = Infinity;
    for (const q of mates) {
      if (PF.Match.keeperOf(m, q.team) === q && !q.human) continue;   // el arquero no sale a perseguir
      const d = U.dist(q.x, q.y, b.x, b.y);
      if (q.human) dHuman = Math.min(dHuman, d);
      else { dOtherAI = Math.min(dOtherAI, d); if (q.ai.chasing && d < dMe * 1.25) otherChasing = true; }
    }
    let chase;
    if (otherChasing) chase = dMe < dOtherAI * 0.8;          // relevo sólo si estoy claramente más cerca
    else chase = ai.chasing ? dMe <= dOtherAI * 1.25 : dMe <= dOtherAI;
    if (dHuman < Infinity) chase = chase && dMe < dHuman * 0.7;

    const ownX = p.side === 0 ? F.x0 : F.x1;
    const ownThird = Math.abs(b.x - ownX) < (F.x1 - F.x0) / 3;
    if (order === 'def') chase = (chase && ownThird) || dMe < 110;
    else if (order === 'atk') chase = chase && dMe < 220 && dMe < dHuman * 0.5;
    return chase;
  }

  function think(p, m, dt) {
    const s = p.skill, ai = p.ai, b = m.ball, M = PF.Match;
    const it = { mx: 0, my: 0, pass: false, shootHold: false, ability: false };
    const dirX = p.side === 0 ? 1 : -1;
    const goalX = p.side === 0 ? F.x1 : F.x0;
    const ownX = p.side === 0 ? F.x0 : F.x1;
    const teamSize = M.teamOf(m, p.team).length;
    const foes = m.players.filter((q) => q.team !== p.team);
    const order = M.orderOf(m, p);
    ai.t -= dt;
    const decide = ai.t <= 0;
    if (decide) ai.t = s.react * U.rand(0.7, 1.3);

    const holder = b.holder;
    const mine = holder === p;
    const gy = F.cy + (p.y < F.cy ? 1 : -1) * U.rand(20, F.goalHalf * 0.65);   // al palo contrario
    const c = {
      b, mine, ownX,
      // el arquero rival con la pelota en las manos no cuenta: no se le puede quitar
      foeHolder: !!(holder && holder.team !== p.team && !holder.gkHold),
      dHolder: holder ? U.dist(p.x, p.y, holder.x, holder.y) : Infinity,
      aimHolder: holder ? Math.atan2(holder.y - p.y, holder.x - p.x) : 0,
      dMe: U.dist(p.x, p.y, b.x, b.y),
      aimBall: Math.atan2(b.y - p.y, b.x - p.x),
      dGoal: U.dist(p.x, p.y, goalX, F.cy),
      aimGoal: Math.atan2(gy - p.y, goalX + dirX * 30 - p.x),
      pressure: M.nearestFoeDist(m, p, p.x, p.y),
      foesNear: foes.filter((q) => U.dist(p.x, p.y, q.x, q.y) < 220).length,
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
      if (p.gkHold) return keeperDistribute(p, m, it);
      // de lejos la pelota llega frenada y el arquero la ataja: mejor acercarse
      const range = teamSize >= 3 ? 400 : 440;
      const facingGoal = (p.x - goalX) * dirX < -20;
      if (decide) {
        if (tryAbility(p, m, it, c)) return it;
        const shot = M.bestShot(m, p);
        const shootAt = (ty) => {
          ai.aim = Math.atan2(ty - p.y, goalX + dirX * 30 - p.x) + U.rand(-s.aim, s.aim);
          ai.shotT = U.lerp(0.12, M.CHARGE_MAX, U.clamp((c.dGoal - 120) / 320, 0, 1));
          it.shootHold = true;
          it.aim = ai.aim;
          return it;
        };
        if (c.dGoal < range && facingGoal) {
          // línea libre a algún palo, muy cerca, o encima y sin salida: tiro
          if (shot.clear > 26 || c.dGoal < 230 || (c.pressure < 70 && c.dGoal < 360)) return shootAt(shot.y);
          // tapado: ¿hay un compañero con mejor tiro y la línea de pase libre?
          const mate = M.passTarget(m, p);
          if (mate && mate.stun <= 0 && M.laneClear(m, p.team, p.x, p.y, mate.x, mate.y) > 40 &&
              M.bestShot(m, mate).clear > shot.clear + 20 && Math.random() < 0.75) { it.pass = true; return it; }
          // si no, lo intenta igual de vez en cuando (si no, se queda trabado)
          if (Math.random() < 0.25) return shootAt(shot.y);
        } else if (facingGoal && c.dGoal < range * 1.2 && shot.clear > 90 && Math.random() < 0.1) {
          return shootAt(shot.y);   // remate de media distancia con todo despejado
        }
        const mate = M.passTarget(m, p);
        if (mate && mate.stun <= 0) {
          const mateFree = M.nearestFoeDist(m, mate, mate.x, mate.y);
          const mateAhead = (mate.x - p.x) * dirX;
          const lane = M.laneClear(m, p.team, p.x, p.y, mate.x, mate.y);
          if (c.pressure < 90 && mateFree > 110 && lane > 30 && Math.random() < 0.7) { it.pass = true; return it; }
          if (mateAhead > 160 && mateFree > 170 && lane > 45 && Math.random() < (teamSize > 2 ? 0.4 : 0.2)) { it.pass = true; return it; }
        }
      }
      // conducir hacia el arco apartándose de los rivales; en canchas grandes, si el
      // centro está cargado, abrirse a la banda en vez de meterse en el embudo
      let ty0 = gy;
      if (teamSize >= 3 && c.dGoal > 260) {
        const wall = foes.filter((q) => {
          const ahead = (q.x - p.x) * dirX;
          return ahead > 0 && ahead < 320 && Math.abs(q.y - F.cy) < F.goalHalf + 120;
        }).length;
        if (wall >= 2) {
          ai.wing = ai.wing || (p.y < F.cy ? -1 : 1);
          ty0 = F.cy + ai.wing * (F.y1 - F.y0) * 0.32;
        } else ai.wing = 0;
      }
      let vx = goalX - p.x, vy = ty0 - p.y;
      const l = Math.hypot(vx, vy) || 1;
      vx /= l; vy /= l;
      for (const q of foes) {
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
        // los que tengo delante pesan más (los esquivo antes de chocarlos)
        const front = (q.x - p.x) * dirX > 0 ? 210 : 170;
        if (d < front && d > 1) {
          const w = ((front - d) / front) * 1.4;
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

    // ---------------------------------------------- arquero
    // me la pasan: ir a buscarla (antes que nada; también el arquero, que si no
    // se iba a su línea y dejaba la pelota suelta)
    if (b.passTo === p && !holder) {
      ai.chasing = true;
      const t = Math.min(0.6, c.dMe / p.def.speed);
      moveTo(it, p, b.x + b.vx * t * 0.7, b.y + b.vy * t * 0.7);
      return it;
    }

    const isKeeper = M.keeperOf(m, p.team) === p;
    if (isKeeper) {
      const ownHalf = (b.x - ownX) * dirX < (F.x1 - F.x0) * 0.5;
      if (p.fixedKeeper || ownHalf) { ai.pushUp = false; return keeperThink(p, m, it, c); }
      // dinámico con la pelota en campo rival: a veces se suma al ataque (y
      // otro pasa a ser el arquero por estar más cerca del arco); si no, líbero
      if (decide && holder && holder.team === p.team) ai.pushUp = Math.random() < (order === 'atk' ? 0.5 : order === 'def' ? 0.05 : 0.2);
      if (!ai.pushUp) {
        ai.chasing = false;
        const [tx, ty] = M.homeSpot(m, p, -0.25);
        moveTo(it, p, tx, ty);
        return it;
      }
    }

    // ---------------------------------------------- arquero rival con la pelota en las manos:
    // no hay nada que disputar; volver al puesto y darle espacio para sacar
    if (holder && holder.team !== p.team && holder.gkHold) {
      ai.chasing = false;
      let [tx, ty] = M.homeSpot(m, p, 0);
      const dx = tx - holder.x, dy = ty - holder.y, d = Math.hypot(dx, dy) || 1;
      if (d < 200) { tx = holder.x + (dx / d) * 200; ty = holder.y + (dy / d) * 200; }
      moveTo(it, p, U.clamp(tx, F.x0 + 40, F.x1 - 40), U.clamp(ty, F.y0 + 40, F.y1 - 40));
      return it;
    }


    const shift = order === 'atk' ? 0.2 : order === 'def' ? -0.2 : 0;

    // ---------------------------------------------- la tiene un compañero
    if (holder && holder.team === p.team) {
      ai.chasing = false;
      let tx, ty;
      if (teamSize > 2) {
        [tx, ty] = M.homeSpot(m, p, shift);
        // medios y delanteros: con la pelota pasada la mitad de la cancha propia,
        // buscan un hueco libre (línea de pase limpia, lejos de las marcas)
        const progress = ((holder.x - ownX) * dirX) / (F.x1 - F.x0);
        if (p.spot[0] >= 0.38 && progress > 0.3 && order !== 'def') {
          if (decide || !ai.run) ai.run = openSpot(p, m, holder, tx, ty, dirX, goalX);
          [tx, ty] = ai.run;
        } else ai.run = null;
      } else if (order === 'def') {
        // quedarse atrás, cubriendo el contraataque
        tx = holder.x - dirX * 240;
        ty = F.cy + (holder.y - F.cy) * -0.3;
      } else {
        tx = holder.x + dirX * (order === 'atk' ? 290 : 200);
        ty = holder.y < F.cy ? F.cy + 140 : F.cy - 140;
      }
      moveTo(it, p, U.clamp(tx, F.x0 + 70, F.x1 - 70), U.clamp(ty, F.y0 + 40, F.y1 - 40));
      return it;
    }

    // ---------------------------------------------- suelta o del rival
    ai.chasing = shouldChase(p, m, c.dMe, order);
    c.chasing = ai.chasing;

    if (decide && tryAbility(p, m, it, c)) return it;

    // relevo: si el arquero salió de su área, el compañero libre más cercano al arco lo cubre
    if (!ai.chasing && coverGoal(p, m, it)) return it;
    // marca: defendiendo en mi mitad, me pego a un rival (entre él y el arco)
    if (!ai.chasing && order !== 'atk') {
      const mark = markOf(p, m);
      if (mark) {
        const [gx2, gy2] = [ownX, F.cy];
        const dx = gx2 - mark.x, dy = gy2 - mark.y, d = Math.hypot(dx, dy) || 1;
        const gap = M.teamOf(m, p.team).length >= 5 ? 75 : 45;   // en 5 vs 5, marca más separada
        const tx = mark.x + (dx / d) * gap, ty = mark.y + (dy / d) * gap;
        moveTo(it, p, U.lerp(tx, b.x, 0.2), U.lerp(ty, b.y, 0.2));   // un poco hacia la pelota: cortar el pase
        return it;
      }
    }

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
    } else if (teamSize > 2) {
      const [tx, ty] = M.homeSpot(m, p, shift);
      moveTo(it, p, tx, ty);
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
