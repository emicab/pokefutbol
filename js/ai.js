/* ============ ai.js — cerebro de los Pokémon que no controlas ============
 * La IA lee el partido con un modelo de la física del juego (la misma de match.js):
 *   - predice la trayectoria de la pelota (frenado de cada cancha y rebotes) y
 *     cuánto tarda cada Pokémon en llegar a cada punto (velocidad, cansancio,
 *     agarre, si tiene que darse vuelta): quién llega primero a la pelota
 *     suelta o a un pase;
 *   - estima la probabilidad de gol de un tiro (puntería, tiempo de vuelo,
 *     reflejos y estirada del arquero, rivales que pueden tapar la línea);
 *   - estima si un pase llega (cada rival que puede cortarlo a tiempo) y si
 *     una conducción se puede sostener sin que se la quiten.
 * Con eso:
 *   con pelota      compara tirar (a qué palo y con cuánta carga), pasar (al pie o
 *                   al espacio, por delante del compañero) y conducir (en nueve
 *                   direcciones, con la pelota del lado contrario al rival) y
 *                   elige la jugada que más vale; perderla cerca del arco propio cuesta caro
 *   me la pasan     va al punto en que la alcanza
 *   suelta / rival  va el que llega primero; al que la lleva lo encara del lado
 *                   del arco y placa adelantándose a su movimiento
 *   el resto        2 vs 2: apoyar por delante o cubrir el arco;
 *                   3 y 5: su puesto de la formación, que se mueve con la pelota,
 *                   desmarque (línea de pase limpia y zona de peligro), marca al
 *                   rival más peligroso cortando el pase, último hombre
 *   arquero         se para en la bisectriz del ángulo de tiro, a la profundidad
 *                   que deja el peor "mejor tiro" para el rival (contando a sus
 *                   defensores); ante un tiro va al punto de la trayectoria al
 *                   que llega a tiempo, o se estira justo a tiempo; sale a la
 *                   pelota suelta si llega antes que los rivales, y achica en el mano a mano
 * Las habilidades se usan cuando la situación las pide (WANTS).
 * La orden (neutro/ataque/defensa: la tecla T en el equipo humano, el
 * entrenador en la CPU) corre el bloque y cambia cuánto se arriesga con la pelota:
 *   ataque    el bloque sube mucho, el arquero se suma y se arriesgan más pases y gambetas
 *   defensa   con la pelota suben sólo los de arriba (salida de contragolpe), el
 *             resto queda cubriendo y se juega más seguro; sin ella, presiona como siempre
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
   * keeper    reflejos del arquero (multiplica la velocidad de tiro que ataja)
   * gkReact   segundos que tarda el arquero en reaccionar a un tiro (promedio)
   * gkErr     error al leer por dónde va el tiro (px)
   * iq        lectura del juego (0..1): con menos, más ruido en las decisiones y
   *           más "despistes" (jugadas ingenuas: conducir derecho al arco, correr
   *           a donde está la pelota), el arquero se ubica peor y no cuida la
   *           pelota ni pasa al espacio
   */
  const SKILLS = {
    easy: { speed: 0.78, react: 0.5, aggro: 0.25, ability: 0.12, aim: 0.3, steal: 0.9, tackleCd: 2.6, keeper: 0.8, gkReact: 0.26, gkErr: 34, iq: 0.3 },
    normal: { speed: 0.9, react: 0.28, aggro: 0.55, ability: 0.35, aim: 0.15, steal: 0.45, tackleCd: 1.6, keeper: 1, gkReact: 0.17, gkErr: 22, iq: 0.7 },
    hard: { speed: 1.0, react: 0.14, aggro: 0.9, ability: 0.7, aim: 0.07, steal: 0.22, tackleCd: 1.15, keeper: 1.12, gkReact: 0.1, gkErr: 12, iq: 1 },
    mate: { speed: 0.95, react: 0.2, aggro: 0.6, ability: 0.45, aim: 0.1, steal: 0.3, tackleCd: 1.3, keeper: 1, gkReact: 0.14, gkErr: 18, iq: 0.85 },
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

  // ================================================================ modelo del juego
  // Copias de las constantes de match.js que la IA necesita para predecir.
  const BALL_A = 0.95, BALL_C = 45;   // frenado de la pelota: exponencial y de rodadura (× friction de la cancha)
  const CTRL = 760;                   // pelota que se puede controlar al llegar (CONTROL_SPEED, con algo de margen)
  const DIVE_SPEED = 580, DIVE_TIME = 0.26, TACKLE_SPEED = 660;
  const PATH_DT = 1 / 30, PATH_T = 2.4;
  const SHOT_KS = [-0.8, -0.55, -0.28, 0, 0.28, 0.55, 0.8];   // puntos de la boca del arco (× goalHalf)

  const sig = (x) => 1 / (1 + Math.exp(-x));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const fric = (m) => m.stadium.friction;
  const foeTeam = (p) => 1 - p.team;

  /** Segundos que tarda la pelota en recorrer s px saliendo a v0 (Infinity si se frena antes). */
  function travelTime(m, v0, s) {
    if (s <= 0) return 0;
    const a = BALL_A * fric(m), c = BALL_C * fric(m);
    let t = 0;
    for (let i = 0; i < 2; i++) {
      const v = v0 - c * t * 0.5;   // la rodadura le resta un poco a la velocidad media
      const k = (a * s) / Math.max(1, v);
      if (k >= 0.995) return Infinity;
      t = -Math.log(1 - k) / a;
    }
    return t;
  }
  const speedAt = (m, v0, t) => Math.max(0, v0 * Math.exp(-BALL_A * fric(m) * t) - BALL_C * fric(m) * t);

  /** Velocidad de pase (passSpeed de match.js): sale para llegar a 360 px/s. */
  function passSpeed(m, d) {
    const k = BALL_A * fric(m), c = BALL_C * fric(m), arrive = 360;
    const v0 = arrive + k * d;
    return U.clamp(v0 + (c * d) / ((v0 + arrive) / 2), 300, 1900);
  }

  /** Velocidad de salida de un tiro de p cargado k (0..1), como shoot() de match.js. */
  function shotSpeed(m, p, k) {
    if (p.fireShot > 0) return 1200 * p.def.power;
    return 1180 * U.lerp(0.85, 1.3, k) * p.def.power * p.bonus.power * m.mods[p.team].power *
      (m.ball.big > 0 ? 0.85 : 1) * (0.75 + 0.25 * PF.Match.fatigue(p)) * (p.status === 'burn' ? 0.85 : 1) * (p.buff > 0 ? 1.25 : 1);
  }

  /** Velocidad máxima de tiro que el arquero q ataja (catchSpeed de match.js); más rápido, la desvía. */
  const catchSpeed = (m, q) => 1050 * q.bonus.reflex * m.mods[q.team].reflex * (q.human ? 1 : q.skill.keeper || 1);

  /** Velocidad de carrera de p ahora mismo (como applyIntent de match.js); se calcula una vez por paso. */
  function topSpeed(m, p) {
    if (p.ai.spT === m.clock) return p.ai.sp;
    p.ai.spT = m.clock;
    return (p.ai.sp = speedNow(m, p));
  }
  function speedNow(m, p) {
    let sp = p.def.speed * (p.human ? 1 : p.skill.speed) * m.stadium.speed * p.bonus.speed * m.mods[p.team].speed * PF.Match.fatigue(p);
    if (p.turbo > 0) sp *= 1.4;
    if (p.giant > 0) sp *= 0.9;
    if (p.slow > 0) sp *= 0.55;
    if (p.status === 'para') sp *= 0.65;
    if (p.mire > 0) sp *= 0.6;
    return Math.max(60, sp);
  }

  /**
   * Segundos que tarda p en quedar a `reach` px de (x, y): lo que tarda en
   * arrancar o darse vuelta (según el agarre de la cancha), más la carrera, más
   * lo que le quede aturdido, en el piso o bajo tierra.
   */
  function timeTo(m, p, x, y, reach = 0, sp = 0) {
    if (p.fainted) return 99;
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    const busy = Math.max(p.stun, p.down, p.dig, p.slam ? 0.5 : 0);
    if (d <= reach) return busy;
    sp = sp || topSpeed(m, p);
    const along = (p.vx * dx + p.vy * dy) / (d * sp);
    const lag = (1 - U.clamp(along, -1, 1)) * (1.1 / (m.stadium.traction * p.agility));
    return busy + (d - reach) / sp + lag;
  }

  /** Trayectoria de la pelota suelta: puntos { t, x, y, s } cada 1/30 s; `goal` si termina en un arco. */
  function ballPath(m) {
    const b = m.ball, pts = [];
    if (b.holder) { pts.push({ t: 0, x: b.x, y: b.y, s: 0 }); return pts; }
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    const a = Math.exp(-BALL_A * fric(m) * PATH_DT), c = BALL_C * fric(m) * PATH_DT, r = b.r;
    for (let t = 0; t <= PATH_T + 1e-6; t += PATH_DT) {
      const s = Math.hypot(vx, vy);
      pts.push({ t, x, y, s });
      if (s < 4) { pts.push({ t: PATH_T, x, y, s: 0 }); break; }
      x += vx * PATH_DT; y += vy * PATH_DT;
      if (y < F.y0 + r) { y = 2 * (F.y0 + r) - y; vy = -vy * 0.78; }
      else if (y > F.y1 - r) { y = 2 * (F.y1 - r) - y; vy = -vy * 0.78; }
      if (x < F.x0 + r || x > F.x1 - r) {
        if (Math.abs(y - F.cy) < F.goalHalf) { pts.push({ t: t + PATH_DT, x, y, s, goal: x < F.cx ? 'L' : 'R' }); break; }
        x = x < F.cx ? 2 * (F.x0 + r) - x : 2 * (F.x1 - r) - x;
        vx = -vx * 0.78;
      }
      vx *= a; vy *= a;
      const s2 = Math.hypot(vx, vy);
      if (s2 > 0) { const ns = Math.max(0, s2 - c) / s2; vx *= ns; vy *= ns; }
    }
    return pts;
  }

  /** Primer punto de la trayectoria al que p llega a tiempo (con la pelota a menos de maxS px/s). */
  function intercept(m, p, path, maxS = Infinity) {
    const reach = PF.Match.radius(p) + m.ball.r, sp = topSpeed(m, p);
    const ok = (pt) => !pt.goal && pt.s <= maxS && timeTo(m, p, pt.x, pt.y, reach, sp) <= pt.t;
    // de a tres puntos y, al encontrar uno, se busca hacia atrás el primero
    const n = path.length - (path[path.length - 1].goal ? 1 : 0);
    for (let i = 0; i < n; i += 3) {
      if (!ok(path[i])) continue;
      let j = i;
      while (j > 0 && i - j < 2 && ok(path[j - 1])) j--;
      return path[j];
    }
    const last = path[Math.max(0, n - 1)];
    return { t: Math.max(last.t, timeTo(m, p, last.x, last.y, reach, sp)), x: last.x, y: last.y, s: 0, late: true };
  }

  /**
   * Lectura del momento (una vez por paso, compartida por todos): trayectoria
   * de la pelota y, para cada Pokémon, dónde y cuándo la alcanza; el primero
   * de cada equipo en llegar.
   */
  const cache = new WeakMap();
  function situation(m) {
    let s = cache.get(m);
    if (s && s.clock === m.clock) return s;
    const b = m.ball, path = ballPath(m);
    s = { clock: m.clock, path, ic: new Map(), firstT: [Infinity, Infinity], first: [null, null] };
    for (const p of m.players) {
      if (p.fainted) continue;
      const ic = b.holder ? { t: timeTo(m, p, b.x, b.y, PF.Match.radius(p) + b.r), x: b.x, y: b.y } : intercept(m, p, path, CTRL);
      s.ic.set(p, ic);
      if (b.holder !== p && ic.t < s.firstT[p.team]) { s.firstT[p.team] = ic.t; s.first[p.team] = p; }
    }
    cache.set(m, s);
    return s;
  }

  /**
   * Peligro de una posición para quien ataca hacia `side` (0..~0.75): ángulo
   * con que se ve la boca del arco y distancia (la pelota llega frenada de
   * lejos), más un poco por avanzar.
   */
  function threat(side, x, y) {
    const dir = side === 0 ? 1 : -1, gx = side === 0 ? F.x1 : F.x0;
    const ax = (gx - x) * dir, len = F.x1 - F.x0;
    if (ax <= 4) return 0.05;
    const ang = Math.abs(Math.atan2(F.cy + F.goalHalf - y, ax) - Math.atan2(F.cy - F.goalHalf - y, ax));
    const d = Math.hypot(ax, y - F.cy);
    return Math.pow(Math.min(1, ang / 1.1), 1.3) * Math.exp(-Math.max(0, d - 140) / 380) * 0.65 + 0.1 * (1 - ax / len);
  }

  /**
   * Probabilidad de gol de un tiro desde (x, y) al punto `ty` de la boca, que
   * sale a v0 con un error de puntería de hasta ±aimErr. Cada rival puede
   * taparlo si llega a la línea antes que la pelota (tras reaccionar): el
   * arquero en su área llega más lejos (manos, estirada); si la pelota llega
   * más rápida de lo que ataja, la desvía (puede quedar un rebote).
   * `ghost` = { p, x, y }: evaluar como si p estuviera en (x, y) (posición del arquero).
   */
  function shotOdds(m, att, x, y, ty, v0, aimErr = 0, ghost = null) {
    const M = PF.Match, dir = M.dirOf(att.side), gx = att.side === 0 ? F.x1 : F.x0, br = m.ball.r;
    const dx = gx - x, dy = ty - y;
    if (dx * dir < 8) return 0;
    const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const lo = F.cy - F.goalHalf + br, hi = F.cy + F.goalHalf - br;
    const spread = (L * Math.tan(aimErr)) / Math.abs(ux);
    const pOn = spread < 1 ? (ty > lo && ty < hi ? 1 : 0) : Math.max(0, Math.min(hi, ty + spread) - Math.max(lo, ty - spread)) / (2 * spread);
    if (pOn <= 0 || travelTime(m, v0, L) === Infinity) return 0;
    let odds = pOn;
    for (const q of m.players) {
      if (q === att.p || q.fainted || q.slam || q.dig > 0 || q.phase > 0) continue;
      const g = ghost && ghost.p === q;
      const qx = g ? ghost.x : q.x, qy = g ? ghost.y : q.y;
      const rx = qx - x, ry = qy - y, along = rx * ux + ry * uy;
      if (along < -10 || along > L + 30) continue;
      const perp = Math.abs(rx * uy - ry * ux), R = M.radius(q);
      if (q.team === att.team) { if (perp < R + br) odds *= 0.3; continue; }   // un compañero en la línea
      const tb = travelTime(m, v0, U.clamp(along, 0, L));
      const keeper = M.keeperOf(m, q.team) === q && (g || M.inBox(q.side, qx, qy, 6));
      const react = (keeper ? (q.human ? 0.2 : q.skill.gkReact || 0.15) : 0.14) + Math.max(q.stun, q.down);
      const tau = Math.max(0, tb - react);
      let cover = topSpeed(m, q) * tau * 0.85;
      if (keeper && q.diveCd <= react) cover = Math.max(cover, DIVE_SPEED * Math.min(tau, DIVE_TIME) + R * 0.4);
      let block = sig(-(perp - R * (keeper ? 1.6 : 1) - br - cover) / 12);
      if (keeper && speedAt(m, v0, tb) > catchSpeed(m, q)) block *= 0.85;   // la desvía: puede quedar el rebote
      odds *= 1 - block;
    }
    return odds;
  }

  /** El mejor punto de la boca para p tirando desde (x, y) a v0: { ty, odds }. */
  function bestShot(m, p, x, y, v0, aimErr) {
    let best = { ty: F.cy, odds: 0 };
    const att = { team: p.team, side: p.side, p };
    for (const k of SHOT_KS) {
      const ty = F.cy + k * F.goalHalf;
      const o = shotOdds(m, att, x, y, ty, v0, aimErr);
      if (o > best.odds) best = { ty, odds: o };
    }
    return best;
  }

  /**
   * Probabilidad de que un pase de `from` a (tx, ty) llegue: para cada rival,
   * el punto de la línea al que mejor llega comparado con la pelota. Si el que
   * recibe (`recv`) no llega a tiempo al punto, la pelota sigue de largo.
   */
  function passOdds(m, from, tx, ty, recv) {
    const M = PF.Match;
    const dx = tx - from.x, dy = ty - from.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const v0 = passSpeed(m, L);
    let ok = 1;
    for (const q of m.players) {
      if (q.team === from.team || q.fainted || q.slam || q.dig > 0) continue;
      const along = U.clamp((q.x - from.x) * ux + (q.y - from.y) * uy, 0, L);
      const keeper = M.isActiveKeeper(m, q);
      const reach = M.radius(q) * (keeper ? 1.6 : 1) + m.ball.r + 4;
      let worst = 0;
      for (const s of [along, L * 0.4, L * 0.75, L]) {
        const tb = travelTime(m, v0, s);
        const tq = timeTo(m, q, from.x + ux * s, from.y + uy * s, reach) + 0.06;
        worst = Math.max(worst, sig((tb - tq) / 0.07));
      }
      ok *= 1 - worst;
    }
    if (recv) {
      const late = timeTo(m, recv, tx, ty, M.radius(recv)) - travelTime(m, v0, L);
      if (late > 0.15) ok *= sig(-(late - 0.35) / 0.12);
    }
    return ok;
  }

  /** Lo que tarda el rival más rápido en llegar a (x, y) (o a placar ahí). */
  function foeTime(m, team, x, y, reach = 30) {
    let best = Infinity;
    for (const q of m.players) {
      if (q.team === team || q.fainted) continue;
      let t = timeTo(m, q, x, y, reach);
      const d = U.dist(q.x, q.y, x, y);
      if (d < 170 && !q.human) t = Math.min(t, Math.max(q.tackleCd, q.stun) + 0.1 + Math.max(0, d - reach) / TACKLE_SPEED);
      if (d < 170 && q.human) t = Math.min(t, Math.max(q.tackleCd, q.stun) + 0.18 + Math.max(0, d - reach) / TACKLE_SPEED);
      best = Math.min(best, t);
    }
    return best;
  }

  // ================================================================ movimiento
  function moveTo(it, p, tx, ty, brisk = false) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < (brisk ? 3 : 10)) return;
    const k = Math.min(1, d / (brisk ? 18 : 50));
    it.mx = (dx / d) * k;
    it.my = (dy / d) * k;
  }

  /** Despiste: en esta decisión juega sin pensar (más seguido con poco iq; nunca con iq 1). */
  const lapse = (p) => Math.random() < (1 - (p.skill.iq ?? 0.7)) * 0.7;

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

  // ================================================================ arquero
  /**
   * Dónde pararse: sobre la bisectriz del ángulo que forman la pelota y los
   * dos palos, a la profundidad que minimiza el mejor tiro posible del rival
   * (con sus defensores donde están). Con la pelota lejos, de líbero.
   * Con poco `iq`, se queda cerca de la ubicación ingenua (más adelantado y al medio).
   */
  function keeperSpot(p, m) {
    const M = PF.Match, b = m.ball, dir = M.dirOf(p.side), gx = M.ownGoalX(p.side);
    const sx = b.x, sy = b.y, depthB = (sx - gx) * dir;
    const dGoal = U.dist(sx, sy, gx, F.cy);
    const maxY = F.goalHalf - 8;
    // la ubicación de siempre: cuanto más lejos la pelota, más adelantado (hasta el 75 % del área)
    const near = 1 - U.clamp((dGoal - 150) / 650, 0, 1);
    const depth = U.lerp(F.boxW * 0.75, 30, near);
    const ang = Math.atan2(sy - F.cy, (sx - gx) * dir);
    let ny = F.cy + U.clamp(Math.sin(ang) * depth * 0.9 + (sy - F.cy) * 0.25, -F.boxH * 0.6, F.boxH * 0.6);
    if (depth < 60) ny = U.clamp(ny, F.cy - maxY, F.cy + maxY);
    const naive = [gx + dir * depth, ny];
    if (depthB < 24) return [gx + dir * 22, U.clamp(sy, F.cy - maxY, F.cy + maxY)];   // pelota en la línea de fondo: al palo

    // bisectriz desde la pelota
    const a1 = Math.atan2(F.cy - F.goalHalf - sy, gx - sx), a2 = Math.atan2(F.cy + F.goalHalf - sy, gx - sx);
    const bis = a1 + U.angDiff(a1, a2) / 2, bx = Math.cos(bis), by = Math.sin(bis);
    const onBis = (d) => {
      const x = gx + dir * d, t = (x - sx) / (Math.abs(bx) > 1e-3 ? bx : 1e-3);
      return [x, U.clamp(sy + by * t, F.cy - F.boxH * 0.85, F.cy + F.boxH * 0.85)];
    };
    const own = b.holder && b.holder.team === p.team;
    if (dGoal > 620 || own) return onBis(depth);   // lejos (o la tenemos): de líbero, pero sobre la bisectriz

    // el que tiraría: el que la lleva, o el rival que mejor llega a la pelota suelta
    let shooter = b.holder && b.holder.team !== p.team ? b.holder : null;
    if (!shooter) {
      const s = situation(m);
      shooter = s.first[foeTeam(p)];
    }
    if (!shooter) return onBis(depth);
    const att = { team: shooter.team, side: shooter.side, p: shooter };
    const v0 = shotSpeed(m, shooter, 0.5);
    // otro rival peligroso (para el pase atrás / al medio): el arquero no puede regalarle el otro palo
    let other = null, ot = 0.22;
    for (const q of m.players) {
      if (q.team === p.team || q === shooter || q.fainted) continue;
      const th = threat(q.side, q.x, q.y);
      if (th > ot) { ot = th; other = q; }
    }
    const maxD = U.clamp(depthB - 55, 16, F.boxW * 0.95);
    let best = null;
    for (let i = 0; i <= 8; i++) {
      const d = U.lerp(16, maxD, i / 8);
      const [kx, ky] = onBis(d);
      const ghost = { p, x: kx, y: ky };
      let worst = 0;
      for (const k of SHOT_KS) worst = Math.max(worst, shotOdds(m, att, sx, sy, F.cy + k * F.goalHalf, v0, 0, ghost));
      if (other) for (const k of [-0.6, 0, 0.6]) worst = Math.max(worst, 0.6 * shotOdds(m, { team: other.team, side: other.side, p: other }, other.x, other.y, F.cy + k * F.goalHalf, shotSpeed(m, other, 0.3), 0, ghost));
      const score = worst + d * 0.00012;   // a igual peligro, más cerca de la línea (que no lo pasen por al lado)
      if (!best || score < best.score) best = { x: kx, y: ky, score };
    }
    const k = U.clamp(1.6 * (p.skill.iq ?? 0.7) - 0.3, 0, 1);
    return [U.lerp(naive[0], best.x, k), U.lerp(naive[1], best.y, k)];
  }

  /**
   * Arquero (fijo, o dinámico con la pelota en su mitad):
   *   1) tiro que viene al arco → reacciona un instante después (gkReact) y
   *      va al primer punto de la trayectoria al que llega a tiempo; si no
   *      llega caminando, se estira justo a tiempo hacia donde la alcanza
   *   2) pelota suelta: sale si la alcanza antes que los rivales (y que sus compañeros)
   *   3) mano a mano: el rival con la pelota cerca y nadie mejor ubicado →
   *      sale a achicarle el ángulo y lo placa
   *   4) si no, a su lugar (keeperSpot)
   */
  function keeperThink(p, m, it, c) {
    const M = PF.Match, b = m.ball, s = p.skill, ai = p.ai, sit = situation(m);
    const dir = M.dirOf(p.side), gx = M.ownGoalX(p.side);
    it.aim = c.aimBall;

    // ---- 1) tiro al arco
    if (ai.kick !== b.kickT) {
      ai.kick = b.kickT;
      ai.gkr = (s.gkReact || 0.15) * U.rand(0.6, 1.6);
      ai.gkErr = U.rand(-1, 1) * (s.gkErr ?? 18);
    }
    const path = sit.path, end = path[path.length - 1];
    const mySide = gx < F.cx ? 'L' : 'R';
    const toGoal = !b.holder && end.goal === mySide && b.vx * dir < -150;
    if (toGoal) {
      if (m.clock - (b.kickT || 0) < ai.gkr) return it;   // todavía no reaccionó: se queda donde está
      // lee el tiro con error: el error crece hacia la línea
      const read = (pt) => [pt.x, pt.y + ai.gkErr * U.clamp(pt.t / end.t, 0, 1)];
      const reachW = M.radius(p) * 1.6 + b.r, reachD = M.radius(p) * 2 + b.r;
      for (const pt of path) {
        if (pt.goal) break;
        const [x, y] = read(pt);
        if (timeTo(m, p, x, y, reachW) <= pt.t) { moveTo(it, p, x, y, true); return it; }
      }
      // no llega caminando: estirada hacia el punto que alcanza, justo a tiempo
      let dv = null;
      for (const pt of path) {
        if (pt.goal) break;
        const [x, y] = read(pt);
        const d = U.dist(p.x, p.y, x, y) - reachD;
        if (d <= DIVE_SPEED * DIVE_TIME && d / DIVE_SPEED <= pt.t + 0.02) { dv = { x, y, t: pt.t, dur: Math.max(0.08, d / DIVE_SPEED) }; break; }
      }
      if (!dv) {   // no llega de ninguna forma: al punto de la línea, por si acaso
        const [x, y] = read(path[Math.max(0, path.length - 2)]);
        dv = { x, y, t: end.t, dur: DIVE_TIME };
      }
      if (dv.t - dv.dur < 0.07 && p.dash <= 0 && p.diveCd <= 0 && Math.random() > s.react * 0.8) { it.dive = [dv.x, dv.y]; return it; }
      moveTo(it, p, dv.x, dv.y, true);
      return it;
    }

    const mates = M.matesOf(m, p).filter((q) => q.stun <= 0 && !q.fainted);
    // ---- 2) pelota suelta: ¿llego antes?
    const my = sit.ic.get(p);
    if (!b.holder && my) {
      const foeT = sit.firstT[foeTeam(p)];
      const mateT = mates.reduce((t, q) => Math.min(t, (sit.ic.get(q) || { t: Infinity }).t), Infinity);
      const inBox = M.inBox(p.side, my.x, my.y, 30);
      const zone = inBox || U.dist(my.x, my.y, gx, F.cy) < Math.max(330, (F.x1 - F.x0) * 0.28);
      const first = my.t < foeT - (inBox ? 0 : 0.15) && my.t < mateT + (inBox ? 0.15 : -0.1);
      if (zone && first && !my.late) { moveTo(it, p, my.x, my.y, true); return it; }
    }

    // ---- 3) mano a mano
    if (c.foeHolder) {
      const h = b.holder, dH = U.dist(h.x, h.y, gx, F.cy);
      const goalSide = (q) => ((q.x - h.x) * (gx - h.x) + (q.y - h.y) * (F.cy - h.y)) > 0;
      const mateBetter = mates.some((q) => goalSide(q) && U.dist(q.x, q.y, h.x, h.y) < c.dHolder * 0.8);
      const close = Math.min(320, (F.x1 - F.x0) * 0.26);
      if (!mateBetter && dH < close && (c.dHolder < 190 || dH < close * 0.7)) {
        const ux = (gx - h.x) / dH, uy = (F.cy - h.y) / dH, gap = M.radius(h) + M.radius(p) + 10;
        moveTo(it, p, h.x + ux * gap + h.vx * 0.12, h.y + uy * gap + h.vy * 0.12, true);
        if (c.dHolder < 85 && p.tackleCd <= 0 && Math.random() < s.aggro + 0.2) {
          const t = c.dHolder / TACKLE_SPEED;
          it.aim = Math.atan2(h.y + h.vy * t - p.y, h.x + h.vx * t - p.x);
          it.pass = true;
        }
        return it;
      }
    }

    // ---- 4) a su lugar
    if (!ai.spot || m.clock - ai.spotT > 0.08) { ai.spot = keeperSpot(p, m); ai.spotT = m.clock; }
    moveTo(it, p, ai.spot[0], ai.spot[1], true);
    if (Math.hypot(it.mx, it.my) < 0.05) it.aim = c.aimBall;
    return it;
  }

  /** Arquero con la pelota en las manos: el mejor pase seguro, o despeje largo hacia la banda más libre. */
  function keeperDistribute(p, m, it) {
    const M = PF.Match, dirX = M.dirOf(p.side);
    if (p.gkT < 0.7 + (p.slot % 3) * 0.15) return it;
    let best = null, bu = 0.25;
    for (const q of M.matesOf(m, p)) {
      if (q.stun > 0 || q.fainted || q.slam || q.dig > 0) continue;
      const tx = q.x + q.vx * 0.35, ty = q.y + q.vy * 0.35;
      const ok = passOdds(m, p, tx, ty, q);
      const u = ok * (0.5 + threat(p.side, tx, ty)) * (0.6 + 0.4 * U.clamp(foeTime(m, p.team, tx, ty) / 0.8, 0, 1));
      if (ok > 0.75 && u > bu) { bu = u; best = { q, tx, ty }; }
    }
    if (best) {
      it.pass = true; it.passTo = best.q; it.passPt = [best.tx, best.ty];
      it.aim = Math.atan2(best.ty - p.y, best.tx - p.x);
      return it;
    }
    // despeje hacia la banda con menos rivales
    const up = m.players.filter((q) => q.team !== p.team && q.y < F.cy).length;
    const down = m.players.filter((q) => q.team !== p.team && q.y >= F.cy).length;
    const sideY = up === down ? (p.y < F.cy ? 1 : -1) : up < down ? -1 : 1;
    it.clear = Math.atan2(sideY * 0.3, dirX);
    it.aim = it.clear;
    return it;
  }

  // ================================================================ órdenes
  /**
   * Lo que cambia cada orden (la tecla T en el equipo humano, el entrenador en la CPU):
   *   poss / defn / free  cuánto se corre el bloque (homeSpot) con la pelota, defendiendo y con
   *             la pelota suelta en campo rival
   *   fwd       lo mínimo que bajan los delanteros defendiendo (quedan de salida)
   *   risk      cuánto pesa perder la pelota en las decisiones con ella (choosePlay)
   *   push      probabilidad de que el arquero dinámico se sume al ataque
   *   runners   quiénes se desmarcan con la pelota: 'mid' medios y delanteros, pasada la
   *             mitad; 'fwd' sólo los de arriba, desde atrás (salida de contragolpe)
   *   ahead2    2 vs 2: cuánto por delante del que la lleva se ofrece el compañero
   *   wait2     2 vs 2: con la pelota suelta en campo rival, esperar arriba (si no, cubrir)
   *   cover2    2 vs 2: a qué fracción de la distancia pelota-arco se para el que cubre
   *   press     marca encima a todos, en toda la cancha (presión alta)
   *   direct    juego directo: siempre mira el pase al espacio y castiga más el pase atrás
   * Defensa no mete el bloque más atrás que neutro: esperar en el área le regala al
   * rival el remate de media distancia (medido con tools/sim.js: recibía más goles).
   */
  const ORDER = {
    neutral: { poss: 0.08, defn: -0.15, free: 0, fwd: -0.02, risk: 1, push: 0.45, runners: 'mid', ahead2: 200, wait2: false, cover2: 0.35 },
    atk: { poss: 0.22, defn: -0.06, free: 0.1, fwd: 0.06, risk: 0.7, push: 0.9, runners: 'mid', ahead2: 290, wait2: true, cover2: 0.45 },
    def: { poss: -0.02, defn: -0.15, free: 0, fwd: -0.1, risk: 1.2, push: 0.05, runners: 'fwd', ahead2: 140, wait2: false, cover2: 0.22 },
    press: { poss: 0.12, defn: -0.02, free: 0.1, fwd: 0.06, risk: 1, push: 0.45, runners: 'mid', ahead2: 220, wait2: true, cover2: 0.45, press: true },
    counter: { poss: 0.12, defn: -0.15, free: 0, fwd: 0.02, risk: 0.85, push: 0.2, runners: 'fwd', ahead2: 290, wait2: true, cover2: 0.35, direct: true },
  };
  const orderCfg = (id) => ORDER[id] || ORDER.neutral;

  // ================================================================ con la pelota
  /**
   * Elige la jugada: tirar, pasar o conducir. Cada opción vale lo que se
   * espera de ella (probabilidad de gol del tiro; peligro de la posición
   * siguiente, por la probabilidad de conservar la pelota) menos lo que
   * cuesta perderla (peligro para el arco propio en ese lugar, × `risk` de la orden).
   */
  function choosePlay(p, m, c) {
    const M = PF.Match, s = p.skill, iq = s.iq ?? 0.7, side = p.side, foeSide = 1 - side;
    const dir = M.dirOf(side), gx = side === 0 ? F.x1 : F.x0;
    const noise = () => gauss() * Math.pow(1 - iq, 1.5) * 0.16;   // poco iq: elige mal más seguido
    // perderla cuesta según el peligro para nuestro arco en ese lugar (y según la orden: en ataque se arriesga más)
    const O = orderCfg(c.order), risk = O.risk;
    const lossCost = (x, y) => (0.6 * threat(foeSide, x, y) + 0.04) * risk;
    const R = M.radius(p) + m.ball.r;
    const press = foeTime(m, p.team, p.x, p.y, R + 14);
    let best = { kind: 'drib', ang: Math.atan2(F.cy - p.y, gx - p.x), u: -Infinity };

    // ---- tiro (con distinta carga: más fuerte, pero tarda y frena la carrera)
    if (c.dGoal < 720) {
      for (const k of [0, 0.45, 1]) {
        const charge = k * M.CHARGE_MAX + 0.04;
        const sh = bestShot(m, p, p.x, p.y, shotSpeed(m, p, k), s.aim);
        const risk = sig((charge - press) / 0.07);   // que lo placan antes de soltarla
        const u = sh.odds * (1 - 0.85 * risk) + 0.02 - risk * lossCost(p.x, p.y) * 0.5 + noise();
        if (u > best.u) best = { kind: 'shot', k, ty: sh.ty, u };
      }
    }

    // ---- pase (al pie, o al espacio por delante del compañero)
    for (const q of M.matesOf(m, p)) {
      if (q.stun > 0 || q.slam || q.dig > 0 || q.fainted) continue;
      const isGk = M.keeperOf(m, q.team) === q;
      // al arquero sólo si está por perderla: si no, se la devolvían una y otra vez
      // (él la agarra con las manos, la vuelve a dar y vuelta a empezar)
      if (isGk && press > 0.3) continue;
      const opts = [[q.x + q.vx * 0.35, q.y + q.vy * 0.35, 0]];
      if (!isGk && Math.random() < (O.direct ? 1 : iq)) {
        let ux = gx - q.x, uy = (F.cy - q.y) * 0.6;
        const l = Math.hypot(ux, uy) || 1;
        ux /= l; uy /= l;
        for (const lead of [120, 210]) {
          const tx = U.clamp(q.x + ux * lead, F.x0 + 50, F.x1 - 50), ty = U.clamp(q.y + uy * lead, F.y0 + 40, F.y1 - 40);
          if ((gx - tx) * dir > 40) opts.push([tx, ty, lead]);
        }
      }
      for (const [tx, ty, lead] of opts) {
        const d = U.dist(p.x, p.y, tx, ty);
        if (d < 70) continue;
        const ok = passOdds(m, p, tx, ty, q);
        const space = U.clamp(foeTime(m, p.team, tx, ty) / 0.7, 0, 1);
        let val = threat(side, tx, ty) * (0.55 + 0.45 * space);
        if (isGk) val *= 0.4;   // al arquero sólo para salir de un apuro
        const mid = [U.lerp(p.x, tx, 0.5), U.lerp(p.y, ty, 0.5)];
        // pase atrás sin que lo apuren: vale un poco menos (si no, se la pasaban de lado sin avanzar)
        const back = (tx - p.x) * dir < -40 && press > 0.5 ? (O.direct ? 0.05 : 0.025) : 0;
        const u = ok * val * 0.95 - (1 - ok) * lossCost(mid[0], mid[1]) - (lead ? 0.01 : 0) - back + noise();
        if (u > best.u) best = { kind: 'pass', q, tx, ty, u };
      }
    }

    // ---- conducir
    const sp = topSpeed(m, p) * 0.9, step = sp * 0.55;
    const goalAng = Math.atan2(F.cy - p.y, gx - p.x);
    for (const da of [-1.7, -1.15, -0.7, -0.35, 0, 0.35, 0.7, 1.15, 1.7]) {
      const a = goalAng + da, ca = Math.cos(a), sa = Math.sin(a);
      const tx = p.x + ca * step, ty = p.y + sa * step;
      if (tx < F.x0 + 40 || tx > F.x1 - 40 || ty < F.y0 + 40 || ty > F.y1 - 40) continue;
      if ((gx - tx) * dir < 50) continue;   // no meterse en la línea de fondo
      let keep = 1;
      for (const q of m.players) {
        if (q.team === p.team || q.fainted) continue;
        let lose = 0;
        for (const f of [0.3, 0.65, 1]) {
          const x = p.x + ca * step * f, y = p.y + sa * step * f;
          const tm = (step * f) / sp;
          const tq = timeTo(m, q, x, y, M.radius(q) + m.ball.r + 6);
          lose = Math.max(lose, sig((tm - tq + 0.04) / 0.08));
        }
        keep *= 1 - 0.8 * lose;
      }
      const same = c.plan && c.plan.kind === 'drib' && Math.abs(U.angDiff(c.plan.ang, a)) < 0.3 ? 0.012 : 0;
      const u = keep * threat(side, tx, ty) * 0.97 - (1 - keep) * lossCost(tx, ty) + same + noise();
      if (u > best.u) best = { kind: 'drib', ang: a, u };
    }
    return best;
  }

  function carrierThink(p, m, it, c, decide, dt) {
    const M = PF.Match, s = p.skill, ai = p.ai, dirX = M.dirOf(p.side), goalX = p.side === 0 ? F.x1 : F.x0;
    // terminar un tiro que ya se estaba cargando (si se viene un rival encima, lo suelta ya)
    if (ai.shotT > 0) {
      ai.shotT -= dt;
      if (ai.shotT > 0 && foeTime(m, p.team, p.x, p.y, M.radius(p) + 24) < 0.1) ai.shotT = 0;
      it.shootHold = ai.shotT > 0;
      it.aim = ai.aim;
      return it;
    }
    if (p.gkHold) return keeperDistribute(p, m, it);
    if (!ai.had) { ai.had = true; ai.t = Math.min(ai.t, s.react * 0.5); }   // recién la recibe: decide pronto
    if (decide || !ai.plan) {
      if (decide && tryAbility(p, m, it, c)) return it;
      c.plan = ai.plan;
      // despiste: derecho al arco, y tiro al palo contrario si ya está cerca
      const play = !ai.lapse ? choosePlay(p, m, c)
        : c.dGoal < 330 ? { kind: 'shot', k: U.rand(0.2, 1), ty: F.cy + (p.y < F.cy ? 0.5 : -0.5) * F.goalHalf }
          : { kind: 'drib', ang: Math.atan2(F.cy - p.y, goalX - p.x) };
      ai.plan = play;
      ai.shield = Math.random() < (s.iq ?? 0.7);
      if (play.kind === 'shot') {
        ai.aim = Math.atan2(play.ty - p.y, goalX - p.x) + U.rand(-s.aim, s.aim);
        ai.shotT = Math.max(1 / 60, play.k * M.CHARGE_MAX);
        ai.plan = null;
        it.shootHold = true;
        it.aim = ai.aim;
        return it;
      }
      if (play.kind === 'pass') {
        ai.plan = null;
        it.pass = true; it.passTo = play.q; it.passPt = [play.tx, play.ty];
        it.aim = Math.atan2(play.ty - p.y, play.tx - p.x);
        return it;
      }
    }
    // conducir en la dirección elegida, apartándose de los rivales y de las paredes
    const ang = ai.plan ? ai.plan.ang : Math.atan2(F.cy - p.y, goalX - p.x);
    let vx = Math.cos(ang), vy = Math.sin(ang);
    let near = null, nd = Infinity;
    for (const q of m.players) {
      if (q.team === p.team || q.fainted) continue;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
      if (d < nd) { nd = d; near = q; }
      const front = (q.x - p.x) * dirX > 0 ? 150 : 110;
      if (d < front && d > 1) {
        const w = ((front - d) / front) * 0.9;
        vx += (dx / d) * w; vy += (dy / d) * w;
      }
    }
    avoidHazards(p, m, (ax, ay) => { vx += ax; vy += ay; });
    if (p.y < F.y0 + 60) vy += 0.9;
    if (p.y > F.y1 - 60) vy -= 0.9;
    if ((p.x - goalX) * dirX > -60) vx -= dirX;
    const vl = Math.hypot(vx, vy) || 1;
    it.mx = vx / vl; it.my = vy / vl;
    // cuidar la pelota: llevarla del lado contrario al rival que se acerca
    if (near && ai.shield && nd < 105) {
      const ma = Math.atan2(it.my, it.mx), fa = Math.atan2(near.y - p.y, near.x - p.x);
      const off = U.angDiff(fa, ma);
      if (Math.abs(off) < 1.5) it.aim = fa + (off >= 0 ? 1 : -1) * 1.5;
    }
    return it;
  }

  // ================================================================ sin la pelota
  /**
   * Marcas del equipo: cada IA que no va a la pelota se asigna a un rival,
   * empezando por el más peligroso (por dónde está y si le pueden pasar), sin
   * contar al que lleva la pelota, que es del que persigue. Sólo cuando
   * defendemos en nuestra mitad; con la orden de presión, en toda la cancha y
   * a todos. Se recalcula cada medio segundo.
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
      const ai1 = M.teamOf(m, team).find((q) => !q.human);
      const press = !!(ai1 && orderCfg(M.orderOf(m, ai1)).press);
      const big = M.teamOf(m, team).length >= 5 && !press;
      const zone = (press ? 2 : big ? 0.36 : 0.55) * (F.x1 - F.x0);
      const ballDepth = (b.x - own) * dir;
      const foeHas = b.holder && b.holder.team !== team && !b.holder.gkHold;
      const defending = big ? (foeHas || !b.holder) && ballDepth < zone : foeHas || (!b.holder && ballDepth < zone);
      const map = new Map();
      if (defending) {
        const keeper = M.keeperOf(m, team);
        const markers = M.teamOf(m, team).filter((q) => !q.human && q !== keeper && !q.ai.chasing && q.stun <= 0 && !q.fainted);
        const threats = m.players.filter((q) => q.team !== team && q !== b.holder && !q.fainted && !M.isActiveKeeper(m, q))
          .map((q) => ({ q, v: threat(q.side, q.x, q.y) + (b.holder && b.holder.team === q.team ? 0.25 * passOdds(m, b.holder, q.x, q.y, null) : 0) }))
          .sort((a, c) => c.v - a.v);
        const free = markers.slice();
        let assigned = 0;
        for (const { q: t } of threats) {
          if (!free.length || (big && assigned >= 2)) break;
          if (!press && (t.x - own) * dir > (F.x1 - F.x0) * (big ? 0.42 : 0.6)) continue;   // muy arriba: no hace falta
          assigned++;
          free.sort((a, c) => U.dist(a.x, a.y, t.x, t.y) - U.dist(c.x, c.y, t.x, t.y));
          map.set(free.shift(), t);
        }
      }
      m.marks[team] = map;
      m.markPress = m.markPress || [false, false];
      m.markPress[team] = press;
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
   * Desmarque: alrededor de su puesto (hx, hy), el punto que mejor combina
   * que el pase llegue, que sea peligroso, que haya aire para recibir y que
   * no se amontone con compañeros; se descuenta lo que tarda en llegar.
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
        const ok = passOdds(m, holder, x, y, null);
        const space = U.clamp(foeTime(m, p.team, x, y) / 0.7, 0, 1);
        let sc = ok * (0.15 + threat(p.side, x, y)) * (0.5 + 0.5 * space);
        sc += U.clamp((x - holder.x) * dirX, -200, 320) * 0.00025;
        sc -= timeTo(m, p, x, y) * 0.05;
        for (const q of mates) if (U.dist(x, y, q.x, q.y) < 170) sc -= 0.12;
        if (U.dist(x, y, holder.x, holder.y) < 120) sc -= 0.1;
        if (sc > bestS) { bestS = sc; best = [x, y]; }
      }
    }
    return best;
  }

  /** Saque: el mejor compañero para recibir. */
  function kickoff(p, m) {
    const M = PF.Match;
    let mate = null, bu = -Infinity;
    for (const q of M.matesOf(m, p)) {
      const u = passOdds(m, p, q.x, q.y, q) + (q.x - p.x) * M.dirOf(p.side) * 0.0004;
      if (u > bu) { bu = u; mate = q; }
    }
    const aim = mate ? Math.atan2(mate.y - p.y, mate.x - p.x) : p.facing;
    return { mx: 0, my: 0, aim, pass: m.stateT > 1.0, passTo: mate, shootHold: false, ability: false };
  }

  /**
   * ¿Persigo yo la pelota? Uno por equipo: el de la IA que llega primero
   * (según la trayectoria de la pelota), con histéresis para que no se pasen
   * el turno a cada paso. Si el humano llega casi igual, las IA se quedan en su sitio.
   */
  function shouldChase(p, m, sit) {
    const ai = p.ai, M = PF.Match;
    const myT = (sit.ic.get(p) || { t: Infinity }).t;
    let otherT = Infinity, otherChasingT = Infinity, humanT = Infinity;
    for (const q of M.matesOf(m, p)) {
      if (q.stun > 0 || q.slam || q.fainted) continue;
      if (M.keeperOf(m, q.team) === q && !q.human) continue;   // el arquero no sale a perseguir (lo decide él)
      const t = (sit.ic.get(q) || { t: Infinity }).t;
      if (q.human) humanT = Math.min(humanT, t);
      else { otherT = Math.min(otherT, t); if (q.ai.chasing) otherChasingT = Math.min(otherChasingT, t); }
    }
    let chase;
    if (otherChasingT < Infinity) chase = myT < otherChasingT - 0.2;   // relevo sólo si llego claramente antes
    else chase = ai.chasing ? myT <= otherT + 0.2 : myT <= otherT;
    if (humanT < Infinity) chase = chase && myT < humanT * 0.7 - 0.05;
    // (todas las órdenes salen a la pelota igual: esperar atrás le regalaba al
    // rival el remate de media distancia, y con eso recibía más goles, no menos)
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
    if (team.some((q) => q !== p && q.stun <= 0 && !q.fainted && near(q))) return false;
    const free = team.filter((q) => !q.human && !q.ai.chasing && q.stun <= 0 && !q.slam && !q.fainted);
    const closest = free.reduce((a, q) => (!a || Math.abs(q.x - ownX) < Math.abs(a.x - ownX) ? q : a), null);
    return closest === p;
  }

  /** Empuje para alejarse de los charcos que dañan (lava, fuego y trampas del rival). */
  function avoidHazards(p, m, push) {
    for (const h of m.hazards) {
      if (h.team === p.team) continue;
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy), r = h.r + 40;
      if (d < r && d > 1) push((dx / d) * ((r - d) / r) * 1.4, (dy / d) * ((r - d) / r) * 1.4);
    }
  }

  /** Separarse de compañeros pegados (si no, se quedaban dos en el mismo lugar chocando) y de los charcos. */
  function spread(it, p, m) {
    let ax = 0, ay = 0;
    for (const q of PF.Match.matesOf(m, p)) {
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
      if (d > 0.5 && d < 90) { const w = ((90 - d) / 90) * 1.2; ax += (dx / d) * w; ay += (dy / d) * w; }
    }
    avoidHazards(p, m, (x, y) => { ax += x; ay += y; });
    if (!ax && !ay) return;
    it.mx += ax; it.my += ay;
    const l = Math.hypot(it.mx, it.my);
    if (l > 1) { it.mx /= l; it.my /= l; }
  }

  /** Caja sorpresa cerca y nadie del rival llega antes: ir a buscarla (sólo si no hay nada urgente). */
  function grabItem(p, m, it) {
    if (!m.items.length || U.dist(p.x, p.y, m.ball.x, m.ball.y) < 260) return false;
    for (const box of m.items) {
      const d = U.dist(p.x, p.y, box.x, box.y);
      if (d > 230) continue;
      if (timeTo(m, p, box.x, box.y) + 0.25 < foeTime(m, p.team, box.x, box.y, 20)) { moveTo(it, p, box.x, box.y); return true; }
    }
    return false;
  }

  /** Ir a por el que lleva la pelota: encararlo del lado del arco, anticipando su movimiento, y placar a tiempo. */
  function pressHolder(p, m, it, c, decide) {
    const M = PF.Match, s = p.skill, b = m.ball, h = b.holder, iq = s.iq ?? 0.7;
    const gx = M.ownGoalX(p.side);
    const sp = topSpeed(m, p);
    const lead = Math.min(0.45, c.dHolder / sp) * 0.6 * iq;
    let tx = b.x + h.vx * lead, ty = b.y + h.vy * lead;
    // del lado del arco: si ya estoy por delante, me meto entre la pelota y el arco
    const gl = U.dist(h.x, h.y, gx, F.cy) || 1, ux = (gx - h.x) / gl, uy = (F.cy - h.y) / gl;
    const ahead = (p.x - h.x) * ux + (p.y - h.y) * uy;
    if (ahead > 0) { tx += ux * 10 * iq; ty += uy * 10 * iq; }
    moveTo(it, p, tx, ty, true);
    // contra uno mucho más pesado un placaje rebota: la IA lo intenta menos
    const sense = Math.min(1, Math.max(0.35, Math.pow(M.mass(p) / M.mass(h), 0.8)));
    if (decide && c.dHolder < 100 && p.tackleCd <= 0 && h.phase <= 0 && Math.random() < s.aggro * sense) {
      const t = (iq * Math.max(0, c.dHolder - M.radius(p) - M.radius(h))) / TACKLE_SPEED;
      it.aim = Math.atan2(h.y + h.vy * t - p.y, h.x + h.vx * t - p.x);
      it.pass = true;
    }
  }

  function thinkInner(p, m, dt) {
    const s = p.skill, ai = p.ai, b = m.ball, M = PF.Match;
    const it = { mx: 0, my: 0, pass: false, shootHold: false, ability: false };
    const dirX = p.side === 0 ? 1 : -1;
    const goalX = p.side === 0 ? F.x1 : F.x0;
    const ownX = p.side === 0 ? F.x0 : F.x1;
    const teamSize = M.teamOf(m, p.team).length;
    const foes = m.players.filter((q) => q.team !== p.team);
    const order = M.orderOf(m, p), O = orderCfg(order);
    ai.t -= dt;
    const decide = ai.t <= 0;
    if (decide) { ai.t = s.react * U.rand(0.7, 1.3); ai.lapse = lapse(p); }

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
      order,
    };

    // ---------------------------------------------- con la pelota
    if (mine) return carrierThink(p, m, it, c, decide, dt);
    ai.shotT = 0; ai.plan = null; ai.had = false;
    const sit = situation(m);

    // me la pasan: ir al punto donde la alcanzo (antes que nada; también el
    // arquero, que si no se iba a su línea y dejaba la pelota suelta)
    if (b.passTo === p && !holder) {
      ai.chasing = true;
      const ic = intercept(m, p, sit.path, CTRL * 1.2);
      moveTo(it, p, ic.x, ic.y, true);
      return it;
    }

    // ---------------------------------------------- arquero
    const isKeeper = M.keeperOf(m, p.team) === p;
    if (isKeeper) {
      // (con histéresis: una vez que sube, no vuelve al arco por cruzar la mitad de ida y vuelta)
      const ownHalf = (b.x - ownX) * dirX < (F.x1 - F.x0) * (ai.pushUp ? 0.3 : holder && holder.team === p.team ? 0.4 : 0.5);
      if (p.fixedKeeper || ownHalf) { ai.pushUp = false; ai.pushRolled = false; ai.chasing = false; return keeperThink(p, m, it, c); }
      // dinámico con la pelota en campo rival: se suma al ataque (casi siempre con
      // la orden de ataque) y otro pasa a ser el arquero por estar más cerca del
      // arco; si no, líbero. Se sortea una vez por posesión (si se re-sorteaba a
      // cada paso, iba y venía y se quedaba atrás). Apenas se pierde la pelota, vuelve.
      if (!(holder && holder.team === p.team)) { ai.pushUp = false; ai.pushRolled = false; }
      else if (!ai.pushRolled) {
        ai.pushRolled = true;
        ai.pushUp = Math.random() < O.push;
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

    // fases: con la pelota el bloque sube y sin ella (la tiene el rival o está
    // suelta en nuestra mitad) baja; la orden cambia cuánto (ORDER).
    const poss = !!(holder && holder.team === p.team);
    const ballDepth = ((b.x - ownX) * dirX) / (F.x1 - F.x0);
    // pelota suelta que el rival alcanza claramente antes: ya es como si la tuviera
    const foeFirst = !holder && sit.firstT[foeTeam(p)] < sit.firstT[p.team] - 0.2;
    const defending = !poss && ((holder && holder.team !== p.team) || ballDepth < 0.5 || foeFirst);
    let shift = poss ? O.poss : defending ? O.defn : O.free;
    // los delanteros bajan poco: quedan de salida para el contragolpe (con la orden de
    // defensa también, algo más atrás: si bajaban todos, al recuperarla no había a quién dársela)
    if (defending && p.spot[0] >= 0.55) shift = Math.max(shift, O.fwd);

    // último hombre: sin la pelota, si nadie del equipo está cerca de nuestro
    // arco, el compañero de la IA más cercano a él (que no vaya a la pelota) baja a cubrirlo
    if (!poss && !ai.chasing && lastMan(p, m, ownX, dirX)) {
      const len = F.x1 - F.x0;
      const k = U.clamp(ballDepth * 0.35, 0.08, 0.2);
      moveTo(it, p, ownX + dirX * len * k, F.cy + (b.y - F.cy) * 0.35);
      return it;
    }

    // ---------------------------------------------- la tiene un compañero
    if (poss) {
      ai.chasing = false;
      let tx, ty;
      if (teamSize > 2) {
        [tx, ty] = M.homeSpot(m, p, shift);
        // medios y delanteros: con la pelota pasada la mitad de la cancha propia,
        // buscan un hueco libre (línea de pase limpia, lejos de las marcas).
        // Con la orden de defensa, sólo los de arriba (y siempre): salida de contragolpe
        const progress = ((holder.x - ownX) * dirX) / (F.x1 - F.x0);
        if (O.runners === 'fwd' ? p.spot[0] >= 0.5 : p.spot[0] >= 0.38 && progress > 0.3) {
          if (decide || !ai.run) ai.run = openSpot(p, m, holder, tx, ty, dirX, goalX);
          [tx, ty] = ai.run;
        } else ai.run = null;
      } else {
        // 2 vs 2: por delante, del lado contrario, donde el pase llegue (con la
        // orden de defensa, más cerca: si se quedaba atrás, sólo había pase hacia atrás)
        const hx = holder.x + dirX * O.ahead2;
        const hy = holder.y < F.cy ? F.cy + 140 : F.cy - 140;
        if (decide || !ai.run) ai.run = openSpot(p, m, holder, hx, hy, dirX, goalX);
        [tx, ty] = ai.run;
      }
      if (grabItem(p, m, it)) return it;
      moveTo(it, p, U.clamp(tx, F.x0 + 70, F.x1 - 70), U.clamp(ty, F.y0 + 40, F.y1 - 40));
      return it;
    }
    ai.run = null;

    // ---------------------------------------------- suelta o del rival
    ai.chasing = shouldChase(p, m, sit);
    c.chasing = ai.chasing;

    if (decide && tryAbility(p, m, it, c)) return it;

    // relevo: si el arquero salió de su área, el compañero libre más cercano al arco lo cubre
    if (!ai.chasing && coverGoal(p, m, it)) return it;
    // marca: defendiendo en mi mitad, me pego a un rival, del lado del arco y
    // cerrando la línea de pase. También con la orden de ataque: atacar no es dejar solos a los rivales
    if (!ai.chasing) {
      const mark = markOf(p, m);
      if (mark) {
        const gl = U.dist(mark.x, mark.y, ownX, F.cy) || 1;
        const bl = U.dist(mark.x, mark.y, b.x, b.y) || 1;
        // con presión, encima y más del lado de la pelota (para cortar el pase o robarla al recibir)
        const tight = m.markPress && m.markPress[p.team];
        const toBall = tight ? 1.3 : 0.7;
        let ux = (ownX - mark.x) / gl + ((b.x - mark.x) / bl) * toBall;
        let uy = (F.cy - mark.y) / gl + ((b.y - mark.y) / bl) * toBall;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul; uy /= ul;
        const gap = tight ? 34 : teamSize >= 5 ? 75 : 50;   // en 5 vs 5, marca más separada
        moveTo(it, p, mark.x + mark.vx * 0.15 + ux * gap, mark.y + mark.vy * 0.15 + uy * gap);
        return it;
      }
    }

    if (ai.chasing) {
      if (holder) pressHolder(p, m, it, c, decide);
      else {
        const my = sit.ic.get(p), foe = sit.first[foeTeam(p)];
        const foeT = sit.firstT[foeTeam(p)];
        if (foe && foeT < my.t - 0.25 && !ai.lapse) {
          // llega antes el rival: ir a su punto, pero del lado del arco, para encararlo
          const fi = sit.ic.get(foe);
          const gl = U.dist(fi.x, fi.y, ownX, F.cy) || 1;
          moveTo(it, p, fi.x + ((ownX - fi.x) / gl) * 45, fi.y + ((F.cy - fi.y) / gl) * 45, true);
        } else if (ai.lapse) {   // despiste: corre a donde va la pelota "a ojo"
          const t = Math.min(0.6, c.dMe / p.def.speed);
          moveTo(it, p, b.x + b.vx * t * 0.7, b.y + b.vy * t * 0.7);
        } else moveTo(it, p, my.x, my.y, true);
      }
    } else if (teamSize > 2) {
      if (grabItem(p, m, it)) return it;
      const [tx, ty] = M.homeSpot(m, p, shift);
      moveTo(it, p, tx, ty);
    } else if (O.wait2 && !defending) {
      // pelota suelta en campo rival: esperar arriba, del lado contrario, listo para el contragolpe
      if (grabItem(p, m, it)) return it;
      const tx = F.cx + dirX * 200;
      const ty = b.y < F.cy ? F.cy + 130 : F.cy - 130;
      moveTo(it, p, tx, ty);
    } else {
      // cubrir: entre la pelota y el arco propio (más pegado al arco si defiende;
      // con ataque, un poco más adelante, pero cubriendo igual)
      const k = O.cover2;
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

  /**
   * Para los consejos del final (tips.js): probabilidad de gol de un tiro que
   * sale de p a velocidad v0 con ángulo `a` (0 si no va al arco)...
   */
  function shotChance(m, p, v0, a) {
    const gx = p.side === 0 ? F.x1 : F.x0, ca = Math.cos(a);
    if (Math.abs(ca) < 1e-3 || (gx - p.x) / ca <= 0) return 0;
    const ty = p.y + Math.tan(a) * (gx - p.x);
    return shotOdds(m, { team: p.team, side: p.side, p }, p.x, p.y, ty, v0, 0);
  }
  /** ...y de que llegue un pase de p a (tx, ty) para `recv`. */
  const passChance = (m, p, tx, ty, recv) => passOdds(m, p, tx, ty, recv);

  return { SKILLS, think, kickoff, shotChance, passChance };
})();
