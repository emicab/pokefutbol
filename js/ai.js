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
    easy: { speed: 0.78, react: 0.5, aggro: 0.25, ability: 0.12, aim: 0.3, steal: 0.9, tackleCd: 2.6, keeper: 0.8, gkReact: 0.26, gkErr: 34 },
    normal: { speed: 0.9, react: 0.28, aggro: 0.55, ability: 0.35, aim: 0.15, steal: 0.45, tackleCd: 1.6, keeper: 1, gkReact: 0.17, gkErr: 22 },
    hard: { speed: 1.0, react: 0.14, aggro: 0.9, ability: 0.7, aim: 0.07, steal: 0.22, tackleCd: 1.15, keeper: 1.12, gkReact: 0.1, gkErr: 12 },
    mate: { speed: 0.95, react: 0.2, aggro: 0.6, ability: 0.45, aim: 0.1, steal: 0.3, tackleCd: 1.3, keeper: 1, gkReact: 0.14, gkErr: 18 },
  };

  /**
   * Cuándo conviene cada habilidad. Reciben el contexto `c` y devuelven
   * true, un ángulo (usarla mirando hacia ahí) o nada.
   */
  const WANTS = {
    zap: (c) => (c.mine ? c.pressure < 180 : c.foeHolder && c.dHolder < 220),
    quick: (c) => (c.mine ? (c.pressure < 120 || c.dGoal < 650) && c.aimGoal : !c.b.holder && c.dMe > 220 && c.chasing && c.aimBall),
    roll: (c) => (c.mine ? c.pressure < 140 && c.aimGoal : c.foeHolder && c.dHolder < 300 && c.aimHolder),
    fireshot: (c) => c.mine && c.dGoal < 560 && c.aimGoal,
    embers: (c) => (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 180),
    hydro: (c) => c.foeHolder && c.dHolder < 210 && c.aimHolder,
    surf: (c) => (c.mine ? c.dGoal < 360 && c.aimGoal : c.foeHolder && c.dHolder < 270 && c.aimHolder),
    puddle: (c) => c.foeHolder && c.dHolder < 230 && c.aimHolder,
    ice: (c) => c.foeHolder && c.dHolder < 230 && c.aimHolder,
    vine: (c) => !c.mine && c.dMe < 250 && (c.foeHolder || c.dMe > 140),
    psychic: (c) => !c.mine && c.dMe < 540 && (c.foeHolder || c.dMe > 280),
    sleep: (c) => c.foeHolder && c.dHolder < 170 && c.aimHolder,
    sing: (c) => c.foesNear > 0 && (c.mine ? c.pressure < 160 : c.foeHolder && c.dHolder < 180),
    confusion: (c) => c.foesNear > 0 && (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 190),
    psywave: (c) => (c.mine ? c.pressure < 150 : c.foeHolder && c.dHolder < 210),
    phase: (c) => (c.mine ? c.pressure < 130 : !c.b.holder && c.dMe > 250 && c.chasing),
    teleport: (c) => (c.mine ? c.pressure < 110 && c.aimGoal : !c.b.holder && c.dMe > 260 && c.chasing && c.aimBall),
    dig: (c) => (c.mine ? c.pressure < 120 && c.aimGoal : !c.b.holder && c.dMe > 260 && c.chasing && c.aimBall),
    slam: (c) => (c.mine ? c.pressure < 150 && c.aimGoal : c.foeHolder && c.dHolder < 210 && c.aimHolder),
    jump: (c) => c.mine && c.pressure < 100 && c.aimGoal,
    wall: (c) => !c.mine && Math.abs(c.b.x - c.ownX) < 330 && c.dMe < 260,
    throw: (c) => c.foeHolder && c.dHolder < 100,
    punch: (c) => c.foeHolder && c.dHolder < 130 && c.aimHolder,
    aura: (c) => c.foeHolder && c.dHolder < 480,
    psybeam: (c) => c.foeHolder && c.dHolder < 480,
    pinmissile: (c) => c.foeHolder && c.dHolder < 270 && c.aimHolder,
    shuriken: (c) => c.foeHolder && c.dHolder < 280 && c.aimHolder,
    flamethrower: (c) => c.foeHolder && c.dHolder < 180 && c.aimHolder,
    firespin: (c) => c.foeHolder && c.dHolder < 220 && c.aimHolder && !c.b.holder.status,
    blaze: (c) => (c.mine ? c.pressure < 120 && c.foesNear > 0 : c.foeHolder && c.dHolder < 130),
    watergun: (c) => c.foeHolder && c.dHolder < 290 && c.aimHolder,
    bubble: (c) => c.foeHolder && c.dHolder < 240 && c.aimHolder,
    thunderwave: (c) => c.foeHolder && c.dHolder < 290 && c.aimHolder && !c.b.holder.status,
    bolt: (c) => c.foeHolder && c.dHolder < 320 && c.aimHolder,
    leechseed: (c) => c.foeHolder && c.dHolder < 260 && c.aimHolder && !c.b.holder.status,
    razorleaf: (c) => c.foeHolder && c.dHolder < 220 && c.aimHolder,
    stunspore: (c) => c.foeHolder && c.dHolder < 190 && c.aimHolder && !c.b.holder.status,
    sludge: (c) => c.foeHolder && c.dHolder < 250 && c.aimHolder,
    smog: (c) => c.foeHolder && c.dHolder < 200 && c.aimHolder && !c.b.holder.status,
    confray: (c) => c.foeHolder && c.dHolder < 280 && c.aimHolder && !c.b.holder.status,
    curse: (c) => c.foeHolder && c.dHolder < 280 && c.aimHolder && !c.b.holder.status,
    blizzard: (c) => c.foeHolder && c.dHolder < 240 && c.aimHolder,
    jumpkick: (c) => (c.mine ? c.pressure < 110 && c.aimGoal : c.foeHolder && c.dHolder < 220 && c.aimHolder),
    counter: (c) => c.foeHolder && c.dHolder < 120,
    quake: (c) => (c.mine ? c.pressure < 140 && c.aimGoal : c.foeHolder && c.dHolder < 300 && c.aimHolder),
    rockthrow: (c) => c.foeHolder && c.dHolder < 270 && c.aimHolder,
    hypnosis: (c) => c.foeHolder && c.dHolder < 240 && c.aimHolder && !c.b.holder.stun,
    barrier: (c) => c.mine && c.pressure < 100 && c.foesNear > 0,
    gust: (c) => c.foeHolder && c.dHolder < 260 && c.aimHolder,
    web: (c) => c.foeHolder && c.dHolder < 250 && c.aimHolder,
    hyperbeam: (c) => c.foeHolder && c.dHolder < 280 && c.aimHolder,
    rest: (c) => !c.mine && c.hpPct < 65 && c.pressure > 220 && c.dMe > 240,
    dragontail: (c) => (c.mine ? c.pressure < 120 && c.foesNear > 0 : c.foeHolder && c.dHolder < 170),
    dragondance: (c) => (c.mine ? c.dGoal < 650 && c.pressure > 120 : c.chasing && !c.foeHolder && c.dMe > 220),
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
    if (p.cd > 0 || p.status === 'fear' || p.chan || Math.random() > p.skill.ability) return false;
    if (p.stamina < PF.Match.abilityCost(p)) return false;   // sin energía no hay habilidad
    const want = WANTS[p.def.ability.id];
    const r = want && want(c);
    if (!r) return false;
    // no gastarla si todos los rivales cerca son inmunes a su tipo (ej. Impactrueno contra Onix)
    const type = PF.ABILITY_TYPE[p.def.ability.id];
    if (type) {
      const near = m.players.filter((q) => q.team !== p.team && U.dist(p.x, p.y, q.x, q.y) < 420);
      if (near.length && near.every((q) => PF.typeImmune(type, q.types))) return false;
    }
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

    // tiro que viene al arco: reacciona un instante después de que sale (gkReact,
    // distinto en cada tiro) y lee el tiro con algo de error (gkErr); mientras
    // no reacciona se queda donde está (no sale corriendo a la pelota)
    const ai = p.ai;
    if (ai.kick !== b.kickT) {
      ai.kick = b.kickT;
      ai.gkr = (s.gkReact || 0.15) * U.rand(0.6, 1.6);
      ai.gkErr = U.rand(-1, 1) * (s.gkErr ?? 18);
    }
    const seen = m.clock - (b.kickT || 0) >= ai.gkr;
    if (!b.holder && b.vx * dir < -250 && !seen) return it;
    if (!b.holder && b.vx * dir < -250) {
      // cuándo cruza la línea, con el frenado de la pelota en esta cancha
      // (v·e^(-a·t)): si no, a los tiros lentos se estiraría antes de tiempo
      const tLin = (lineX - b.x) / b.vx, a = 0.95 * m.stadium.friction;
      const t = tLin <= 0 ? -1 : a > 0 ? (tLin * a < 1 ? -Math.log(1 - tLin * a) / a : Infinity) : tLin;
      if (t > 0 && t < 0.9) {
        const yAt = b.y + b.vy * tLin;   // la dirección no cambia: el punto de cruce es el mismo
        if (Math.abs(yAt - F.cy) < F.goalHalf + 40) {
          const ty = U.clamp(yAt + ai.gkErr, F.cy - maxY - 12, F.cy + maxY + 12);
          const far = U.dist(p.x, p.y, lineX, ty) > 26;
          if (far && t < 0.34 && p.dash <= 0 && Math.random() > s.react * 0.8) { it.dive = [lineX, ty]; return it; }
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
    // (con pocos jugadores el "tercio" es toda la mitad: si no, se quedan dos pegados al arco mirando)
    const ownThird = Math.abs(b.x - ownX) < (F.x1 - F.x0) / (PF.Match.teamOf(m, p.team).length <= 3 ? 2 : 3);
    // defensa: sólo sale a la pelota en nuestro tercio; ataque: presiona arriba como siempre
    if (order === 'def') chase = (chase && ownThird) || dMe < 110;
    return chase;
  }

  /**
   * ¿Me toca cubrir el arco? Sí si nadie del equipo (ni el arquero, ni un
   * humano) está cerca de nuestro arco y yo soy la IA de campo más cercana a
   * él (sin contar al que va a la pelota).
   */
  function lastMan(p, m, ownX, dirX) {
    const M = PF.Match, len = F.x1 - F.x0;
    const team = M.teamOf(m, p.team);
    const near = (q) => (q.x - ownX) * dirX < len * 0.24 && Math.abs(q.y - F.cy) < F.goalHalf + 220;
    if (team.some((q) => q !== p && q.stun <= 0 && near(q))) return false;
    const free = team.filter((q) => !q.human && !q.ai.chasing && q.stun <= 0 && !q.slam);
    const closest = free.reduce((a, q) => (!a || Math.abs(q.x - ownX) < Math.abs(a.x - ownX) ? q : a), null);
    return closest === p;
  }

  /** Separarse de compañeros pegados (si no, se quedaban dos en el mismo lugar chocando). */
  function spread(it, p, m) {
    let ax = 0, ay = 0;
    for (const q of PF.Match.matesOf(m, p)) {
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
      if (d > 0.5 && d < 90) { const w = ((90 - d) / 90) * 1.2; ax += (dx / d) * w; ay += (dy / d) * w; }
    }
    if (!ax && !ay) return;
    it.mx += ax; it.my += ay;
    const l = Math.hypot(it.mx, it.my);
    if (l > 1) { it.mx /= l; it.my /= l; }
  }

  function thinkInner(p, m, dt) {
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
      hpPct: M.hpPct(p),
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
      // (con histéresis: una vez que sube, no vuelve al arco por cruzar la mitad de ida y vuelta)
      const ownHalf = (b.x - ownX) * dirX < (F.x1 - F.x0) * (ai.pushUp ? 0.3 : holder && holder.team === p.team ? 0.4 : 0.5);
      if (p.fixedKeeper || ownHalf) { ai.pushUp = false; ai.pushRolled = false; return keeperThink(p, m, it, c); }
      // dinámico con la pelota en campo rival: se suma al ataque (casi siempre con
      // la orden de ataque) y otro pasa a ser el arquero por estar más cerca del
      // arco; si no, líbero. Se sortea una vez por posesión (si se re-sorteaba a
      // cada paso, iba y venía y se quedaba atrás). Apenas se pierde la pelota, vuelve.
      if (!(holder && holder.team === p.team)) { ai.pushUp = false; ai.pushRolled = false; }
      else if (!ai.pushRolled) {
        ai.pushRolled = true;
        ai.pushUp = Math.random() < (order === 'atk' ? 0.9 : order === 'def' ? 0.05 : 0.45);
      }
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


    // fases: con la pelota el bloque sube (más con la orden de ataque); sin
    // ella (la tiene el rival o está suelta en nuestra mitad) baja, y con
    // ataque sólo un poco menos. Así la orden cambia cuánto, no si se baja.
    const poss = !!(holder && holder.team === p.team);
    const ballDepth = ((b.x - ownX) * dirX) / (F.x1 - F.x0);
    const defending = !poss && ((holder && holder.team !== p.team) || ballDepth < 0.5);
    const SHIFT = poss ? { atk: 0.22, neutral: 0.08, def: -0.05 }
      : defending ? { atk: -0.06, neutral: -0.15, def: -0.26 } : { atk: 0.1, neutral: 0, def: -0.15 };
    let shift = SHIFT[order] ?? 0;
    // los delanteros (salvo con la orden de defensa) bajan poco: quedan de salida para el contragolpe
    if (defending && order !== 'def' && p.spot[0] >= 0.55) shift = Math.max(shift, order === 'atk' ? 0.06 : -0.02);

    // último hombre: sin la pelota, si nadie del equipo está cerca de nuestro
    // arco, el compañero de la IA más cercano a él (que no vaya a la pelota) baja a cubrirlo
    if (!poss && !ai.chasing && lastMan(p, m, ownX, dirX)) {
      const len = F.x1 - F.x0;
      const k = U.clamp(ballDepth * 0.35, 0.08, 0.2);
      moveTo(it, p, ownX + dirX * len * k, F.cy + (b.y - F.cy) * 0.35);
      return it;
    }

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
    // marca: defendiendo en mi mitad, me pego a un rival (entre él y el arco).
    // También con la orden de ataque: atacar no es dejar solos a los rivales
    if (!ai.chasing) {
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
        // contra uno mucho más pesado un placaje rebota: la IA lo intenta menos
        const sense = Math.min(1, Math.max(0.35, Math.pow(M.mass(p) / M.mass(holder), 0.8)));
        if (decide && c.dHolder < 95 && p.tackleCd <= 0 && holder.phase <= 0 && Math.random() < s.aggro * sense) {
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
    } else if (order === 'atk' && !defending) {
      // pelota suelta en campo rival: esperar arriba, del lado contrario, listo para el contragolpe
      const tx = F.cx + dirX * 200;
      const ty = b.y < F.cy ? F.cy + 130 : F.cy - 130;
      moveTo(it, p, tx, ty);
    } else {
      // cubrir: entre la pelota y el arco propio (más pegado al arco si defiende;
      // con ataque, un poco más adelante, pero cubriendo igual)
      const k = order === 'def' ? 0.22 : order === 'atk' ? 0.45 : 0.35;
      // nunca pegado al arco: ahí ya está el arquero (si no, se amontonaban los dos en el mismo punto)
      const minOut = (F.x1 - F.x0) * 0.2;
      const dx = Math.max(minOut, Math.abs(b.x - ownX) * k);
      const ty = F.cy + (b.y - F.cy) * 0.55;
      moveTo(it, p, ownX + dirX * Math.min(dx, (F.x1 - F.x0) - 70), ty);
    }
    return it;
  }

  /** Decisión de la IA, más separarse de los compañeros (salvo el que va a la pelota o ataja). */
  function think(p, m, dt) {
    const it = thinkInner(p, m, dt);
    const b = m.ball;
    if (b.holder !== p && b.passTo !== p && !p.ai.chasing && !it.dive && PF.Match.keeperOf(m, p.team) !== p) spread(it, p, m);
    return it;
  }

  return { SKILLS, think, kickoff };
})();
