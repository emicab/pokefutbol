/* ============ match.js — un partido N vs N: reglas, física y acciones ============
 * Equipo 0 ataca hacia la derecha, equipo 1 hacia la izquierda.
 * Estados: kickoff (saque: el que saca apunta, el resto quieto) → play
 *          → goal (festejo) → replay (repetición, opcional) → kickoff ... → end.
 *
 * Cada paso, cada Pokémon recibe una "intención" (del teclado o de ai.js):
 *   { mx, my, pass, shootHold, ability, press, aim? }
 *   pass       con pelota: pase (al compañero hacia el que apuntas, si no al hueco)
 *              sin pelota: placaje
 *   shootHold  mantener para cargar el tiro; al soltar, dispara
 *   press      mantener: correr solo hacia la pelota
 *   aim        (sólo IA) hacia dónde mira
 * El humano manda además: swap (cambiar de Pokémon), order (orden a la IA
 * del equipo) y skip (saltar la repetición).
 */
PF.Match = (() => {
  const U = PF.U, F = PF.FIELD;

  const BALL_R = 10;
  const CONTROL_SPEED = 700;     // por debajo de esto, la pelota se controla al tocarla
  const CHARGE_MAX = 0.7;        // segundos para el tiro a máxima potencia
  const DASH_SPEED = 660, DASH_TIME = 0.2, TACKLE_CD = 1.1;
  const PASS_CONE = 1.1;         // radianes: apuntando así de cerca de un compañero, el pase va a él
  const HUMAN_STEAL = 0.12;      // segundos de contacto para robar (las IA usan skill.steal)
  const KICKOFF_WAIT = 0.4, KICKOFF_MAX = 6;
  const REC_FRAMES = 150;        // 2,5 s de repetición
  const NO_INTENT = { mx: 0, my: 0, pass: false, shootHold: false, ability: false, press: false };

  /**
   * Formaciones: [profundidad desde el arco propio (0..1), lateral (-1..1)].
   * El slot 0 es el que saca.
   */
  const FORMATIONS = {
    2: [[0.42, -0.3], [0.22, 0.28]],
    3: [[0.55, -0.35], [0.45, 0.38], [0.22, 0]],
    5: [[0.62, -0.33], [0.62, 0.33], [0.42, 0], [0.22, -0.42], [0.22, 0.42]],
  };

  /** Órdenes a la IA del equipo humano (tecla T). Ver ai.js. */
  const ORDERS = [
    { id: 'neutral', label: 'NEUTRO', short: '', color: '#e8f0ff' },
    { id: 'atk', label: 'ATAQUE', short: 'ATQ', color: '#ff8a3d' },
    { id: 'def', label: 'DEFENSA', short: 'DEF', color: '#59d0ff' },
  ];

  const ITEMS = [
    { id: 'recarga', label: '¡RECARGA!', color: '#59d0ff' },
    { id: 'turbo', label: '¡TURBO!', color: '#ffd23f' },
    { id: 'gigante', label: '¡GIGANTE!', color: '#ff8a3d' },
    { id: 'lento', label: '¡RIVALES LENTOS!', color: '#c77dff' },
    { id: 'gigaball', label: '¡PELOTA GIGANTE!', color: '#ffffff' },
    { id: 'loca', label: '¡PELOTA LOCA!', color: '#ff5ab0' },
    { id: 'iman', label: '¡IMÁN!', color: '#b0b8c8' },
  ];

  // ---------------------------------------------------------------- helpers
  const radius = (p) => p.r * (p.giant > 0 ? 1.5 : 1);
  const mass = (p) => p.def.mass * (p.giant > 0 ? 2.2 : 1) * (p.wall > 0 ? 20 : 1);
  const untouchable = (p) => p.phase > 0 || p.dig > 0 || !!p.slam;
  const teamOf = (m, team) => m.players.filter((q) => q.team === team);
  const matesOf = (m, p) => m.players.filter((q) => q.team === p.team && q !== p);
  const mateOf = (m, p) => matesOf(m, p)[0];
  const ownGoalX = (team) => (team === 0 ? F.x0 : F.x1);
  const dirOf = (team) => (team === 0 ? 1 : -1);

  function setAnim(p, name, lock = false) {
    p.anim = name;
    p.animT = 0;
    p.animLock = lock ? PF.Sprites.duration(p.def.dex, name) : 0;
  }

  function nearestFoeDist(m, p, x, y) {
    let best = Infinity;
    for (const q of m.players) if (q.team !== p.team && q.stun <= 0) best = Math.min(best, U.dist(x, y, q.x, q.y));
    return best;
  }

  function makePlayer(def, team, slot, skill) {
    return {
      def, team, slot, skill,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, facing: team === 0 ? 0 : Math.PI, r: def.radius,
      stun: 0, asleep: false, cd: def.ability.cd * 0.75, tackleCd: 0, dash: 0, dashDx: 0, dashDy: 0, dashSpeed: DASH_SPEED,
      pickupCd: 0, holdT: 0, stealT: 0, charge: -1, aimMy: 0,
      fireShot: 0, phase: 0, turbo: 0, giant: 0, slow: 0, wall: 0, embers: 0, emberT: 0, slip: 0, burnCd: 0,
      dig: 0, ram: 0, spinT: 0, magnet: 0,
      slam: null, anim: 'Idle', animT: 0, animLock: 0, human: false,
      ai: { t: 0, chasing: false, shotT: 0, aim: 0 },
    };
  }

  /** Hacia dónde ir para alcanzar la pelota (con un poco de anticipación). */
  function ballTarget(m, p) {
    const b = m.ball;
    if (b.holder) return [b.x, b.y];
    const t = Math.min(0.6, U.dist(p.x, p.y, b.x, b.y) / p.def.speed);
    return [b.x + b.vx * t * 0.7, b.y + b.vy * t * 0.7];
  }

  /** Posición de un slot de la formación, desplazada con la pelota (ai.js). */
  function homeSpot(m, p, shift = 0) {
    const n = teamOf(m, p.team).length;
    const [d, f] = (FORMATIONS[n] || FORMATIONS[2])[p.slot] || [0.4, 0];
    const len = F.x1 - F.x0, H = (F.y1 - F.y0) / 2, dir = dirOf(p.team), own = ownGoalX(p.team);
    const b = m.ball;
    const progress = U.clamp(((b.x - own) * dir) / len, 0, 1);
    const attacking = b.holder && b.holder.team === p.team;
    const depth = U.clamp(d * 0.65 + progress * 0.45 + (attacking ? 0.1 : -0.08) + shift, 0.06, 0.9);
    return [own + dir * depth * len, F.cy + f * H * 0.8 + (b.y - F.cy) * 0.3];
  }

  /**
   * ¿A quién iría el pase? Humano: al compañero hacia el que apunta (o null:
   * pase al hueco). IA: al más libre y adelantado.
   */
  function passTarget(m, p) {
    const mates = matesOf(m, p).filter((q) => !q.slam && q.dig <= 0);
    if (!mates.length) return null;
    let best = null, bestScore = p.human ? Infinity : -Infinity;
    for (const q of mates) {
      const d = U.dist(p.x, p.y, q.x, q.y);
      if (p.human) {
        const a = Math.abs(U.angDiff(p.facing, Math.atan2(q.y - p.y, q.x - p.x)));
        const score = a + d / 3000;
        if (a < PASS_CONE && score < bestScore) { best = q; bestScore = score; }
      } else {
        const free = Math.min(250, nearestFoeDist(m, q, q.x, q.y));
        const ahead = (q.x - p.x) * dirOf(p.team);
        const score = free + ahead * 0.4 - Math.max(0, d - 450) * 0.6 - (q.stun > 0 ? 999 : 0);
        if (score > bestScore) { best = q; bestScore = score; }
      }
    }
    return best;
  }

  /**
   * Dirección del tiro de un humano. Si mira más o menos al arco, apunta a un
   * punto de la boca: arriba/abajo eligen palo; sin dirección vertical, al
   * palo contrario a donde está. { a, goal, tx, ty }
   */
  function shotAim(p) {
    const gx = p.team === 0 ? F.x1 + 14 : F.x0 - 14;
    const ag = Math.atan2(F.cy - p.y, gx - p.x);
    if (!p.human || Math.abs(U.angDiff(p.facing, ag)) > 0.9) return { a: p.facing, goal: false };
    const side = p.aimMy || (p.y < F.cy ? 0.45 : -0.45);
    const ty = F.cy + side * (F.goalHalf - 18);
    return { a: Math.atan2(ty - p.y, gx - p.x), goal: true, tx: gx, ty };
  }

  // ---------------------------------------------------------------- creación
  /**
   * opts.teams      [[def...], [def...]]  (def = PF.withAbility(...)), mismo largo
   * opts.humanTeam  0, o -1 para CPU contra CPU (fondo del menú)
   * opts.skills     [skill equipo 0, skill equipo 1] (ver PF.AI.SKILLS)
   * opts.stadium    id de PF.STADIUMS
   * opts.time       segundos · opts.replays  repetición de los goles
   * Antes hay que llamar a PF.configureField(n) con el tamaño del equipo.
   */
  function create(opts) {
    const m = {
      players: [],
      ball: {
        x: F.cx, y: F.cy, vx: 0, vy: 0, r: BALL_R, holder: null, last: null, fire: 0,
        vine: null, vineT: 0, vineColor: '#7dff9e', passTo: null, passT: 0, spin: 0, big: 0, crazy: 0, curve: 1,
      },
      score: [0, 0], time: opts.time ?? PF.MATCH_TIME, golden: false,
      state: 'kickoff', stateT: 0, clock: 0, kickoffTeam: Math.random() < 0.5 ? 0 : 1, kicker: null,
      goalTeam: -1, ownGoal: false, winner: -1, scorer: null,
      items: [], itemT: 7, hazards: [], projs: [],
      fx: PF.FX.create(), shake: 0, freeze: 0, cam: { x: 0, y: 0 },
      rec: [], replay: null, replays: opts.replays !== false, nearT: 0,
      stadium: PF.stadiumById(opts.stadium),
      humanTeam: opts.humanTeam, controlled: null, demo: !!opts.demo,
      order: 0,
    };
    opts.teams.forEach((defs, team) => defs.forEach((d, i) => {
      m.players.push(makePlayer(d, team, i, opts.skills[team]));
    }));
    kickoff(m);
    return m;
  }

  function setControl(m, p) {
    if (m.controlled) m.controlled.human = false;
    m.controlled = p;
    p.human = true;
  }

  function kickoff(m) {
    const k = m.kickoffTeam, b = m.ball;
    Object.assign(b, { x: F.cx, y: F.cy, vx: 0, vy: 0, holder: null, last: null, fire: 0, vine: null, passTo: null, big: 0, crazy: 0 });
    const len = F.x1 - F.x0, H = (F.y1 - F.y0) / 2;
    for (const p of m.players) {
      const n = teamOf(m, p.team).length;
      const [d, f] = (FORMATIONS[n] || FORMATIONS[2])[p.slot] || [0.3, 0];
      const dir = dirOf(p.team);
      let x = ownGoalX(p.team) + dir * Math.min(d * 0.85, 0.42) * len;
      const y = F.cy + f * H;
      // fuera del círculo central
      if (U.dist(x, y, F.cx, F.cy) < 130) x = F.cx - dir * 130;
      Object.assign(p, {
        x, y, z: 0, vx: 0, vy: 0, stun: 0, asleep: false, dash: 0, charge: -1, slam: null,
        pickupCd: 0, holdT: 0, stealT: 0, phase: 0, wall: 0, embers: 0, slip: 0, dig: 0, ram: 0, spinT: 0,
      });
      p.facing = p.team === 0 ? 0 : Math.PI;
      p.ai.chasing = false; p.ai.shotT = 0;
      setAnim(p, 'Idle');
    }
    const kicker = m.players.find((p) => p.team === k && p.slot === 0);
    kicker.x = F.cx - dirOf(k) * (radius(kicker) + BALL_R + 3);
    kicker.y = F.cy;
    b.holder = kicker; b.last = kicker;
    m.kicker = kicker;
    if (m.humanTeam >= 0) setControl(m, m.players.find((p) => p.team === m.humanTeam && p.slot === 0));
    m.items = [];
    m.projs = [];
    m.hazards = [];
    const st = m.stadium;
    for (const [fx, fy] of st.hazards) {
      addHazard(m, { kind: 'lava', x: F.cx + fx * (F.x1 - F.x0) / 2, y: F.cy + fy * H, r: 46 + H * 0.06, life: Infinity, team: -1 });
    }
    m.rec = [];
    m.replay = null;
    m.state = 'kickoff';
    m.stateT = 0;
    updateCamera(m, 0, true);
  }

  function finish(m) {
    m.state = 'end';
    m.stateT = 0;
    m.winner = m.score[0] > m.score[1] ? 0 : m.score[1] > m.score[0] ? 1 : -1;
    PF.Audio.sfx.whistle(true);
    PF.Audio.crowd('cheer', 0.6);
    PF.FX.text(m.fx, m.cam.x + PF.W / 2, m.cam.y + PF.H / 2 - 40, '¡FINAL!', '#fff', 2.2, 2.5);
  }

  function afterGoal(m) {
    if (m.golden) finish(m);
    else kickoff(m);
  }

  // ---------------------------------------------------------------- cámara
  function updateCamera(m, dt, snap = false) {
    const W = PF.W, H = PF.H, Wd = PF.WORLD, b = m.ball;
    let tx = b.x, ty = b.y;
    const c = m.controlled;
    if (c && m.state !== 'replay') { tx = tx * 0.7 + c.x * 0.3; ty = ty * 0.7 + c.y * 0.3; }
    const cx = Wd.w <= W ? (Wd.w - W) / 2 : U.clamp(tx - W / 2, 0, Wd.w - W);
    const cy = Wd.h <= H ? (Wd.h - H) / 2 : U.clamp(ty - H / 2 + 20, 0, Wd.h - H);
    if (snap) { m.cam.x = cx; m.cam.y = cy; return; }
    const k = U.damp(4.5, dt);
    m.cam.x += (cx - m.cam.x) * k;
    m.cam.y += (cy - m.cam.y) * k;
  }

  // ---------------------------------------------------------------- repetición
  function snapshot(m) {
    const b = m.ball;
    return {
      p: m.players.map((p) => [p.x, p.y, p.z, p.facing, p.anim, p.animT, p.stun, p.asleep, p.phase, p.wall, p.giant, p.dig, p.charge]),
      b: [b.x, b.y, b.spin, b.fire, b.big],
    };
  }

  function applySnapshot(m, s) {
    s.p.forEach((v, i) => {
      const p = m.players[i];
      [p.x, p.y, p.z, p.facing, p.anim, p.animT, p.stun, p.asleep, p.phase, p.wall, p.giant, p.dig] = v;
      p.charge = -1;
      p.animLock = 0;
    });
    const b = m.ball;
    [b.x, b.y, b.spin, b.fire, b.big] = s.b;
    b.holder = null; b.vine = null;
  }

  function stepReplay(m, dt, hi) {
    const r = m.replay;
    r.i += 0.5;                                    // cámara lenta
    const idx = Math.floor(r.i);
    if (idx >= r.frames.length || (hi && (hi.skip || hi.pass))) { afterGoal(m); return; }
    applySnapshot(m, r.frames[idx]);
    updateCamera(m, dt);
  }

  // ---------------------------------------------------------------- bucle
  function step(m, dt, hi) {
    PF.FX.update(m.fx, dt);
    if (m.shake > 0) m.shake = Math.max(0, m.shake - dt * 40);
    if (m.freeze > 0) { m.freeze -= dt; return; }
    m.clock += dt;
    m.nearT = Math.max(0, m.nearT - dt);

    if (m.state === 'replay') { stepReplay(m, dt, hi); return; }

    if (m.state === 'kickoff') {
      m.stateT += dt;
    } else if (m.state === 'goal') {
      m.stateT -= dt;
      if (m.stateT <= 0) {
        if (m.replays && !m.demo && m.rec.length > 40) {
          m.state = 'replay';
          m.replay = { frames: m.rec.slice(-REC_FRAMES), i: 0 };
        } else afterGoal(m);
      }
    } else if (m.state === 'end') {
      m.stateT += dt;
    } else if (!m.golden) {
      m.time -= dt;
      if (m.time <= 0) {
        m.time = 0;
        if (m.score[0] !== m.score[1] || m.demo) finish(m);
        else {
          m.golden = true;
          PF.Audio.sfx.whistle();
          PF.FX.text(m.fx, m.cam.x + PF.W / 2, m.cam.y + PF.H / 2 - 60, '¡GOL DE ORO!', '#ffd23f', 1.8, 2);
        }
      }
    }

    const playing = m.state === 'play';
    const kicking = m.state === 'kickoff';
    if (playing && hi && hi.swap) {
      // al compañero más cerca de la pelota
      let best = null, bd = Infinity;
      for (const q of matesOf(m, m.controlled)) {
        const d = U.dist(q.x, q.y, m.ball.x, m.ball.y);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) setControl(m, best);
    }
    if (hi && hi.order && m.state !== 'end' && m.humanTeam >= 0) {
      m.order = (m.order + 1) % ORDERS.length;
      const o = ORDERS[m.order];
      for (const q of matesOf(m, m.controlled)) PF.FX.text(m.fx, q.x, q.y - 70, '¡' + o.label + '!', o.color, 0.8, 0.9);
      PF.Audio.sfx.touch();
    }

    // Las pulsaciones (pase, habilidad) se gastan en un solo Pokémon por paso:
    // si un pase cambia el control al compañero, éste no recibe el mismo "pase".
    let input = hi;
    for (const p of m.players) {
      let it = NO_INTENT, active = playing;
      const wasHuman = p.human;
      if (kicking) {
        active = p === m.kicker && m.stateT > KICKOFF_WAIT;
        if (active) {
          it = p.human ? input || NO_INTENT : PF.AI.kickoff(p, m);
          if (m.stateT > KICKOFF_MAX) it = Object.assign({}, NO_INTENT, { pass: true });
          // en el saque sólo se puede pasar: nada de tiros ni habilidades
          it = Object.assign({}, it, { ability: false, press: false, shootHold: false });
        }
      } else if (playing && p.stun <= 0 && !p.slam) {
        it = p.human ? input || NO_INTENT : PF.AI.think(p, m, dt);
      }
      applyIntent(m, p, it, dt, active);
      if (kicking) { p.vx = 0; p.vy = 0; }
      if (wasHuman && input) input = Object.assign({}, input, { pass: false, ability: false });
    }
    movePlayers(m, dt);
    collidePlayers(m);
    updateBall(m, dt, playing || kicking);
    if (kicking && m.ball.holder !== m.kicker) {
      m.state = 'play';
      PF.Audio.sfx.whistle();
    }
    updateProjectiles(m, dt, playing);
    updateHazards(m, dt, playing);
    if (playing) {
      checkGoal(m);
      updateItems(m, dt);
      m.rec.push(snapshot(m));
      if (m.rec.length > REC_FRAMES + 30) m.rec.shift();
    }
    for (const p of m.players) animate(m, p, dt);
    updateCamera(m, dt);
  }

  // ---------------------------------------------------------------- jugadores
  function applyIntent(m, p, it, dt, active) {
    const b = m.ball, st = m.stadium;
    const digging = p.dig > 0;
    for (const k of ['stun', 'tackleCd', 'pickupCd', 'phase', 'turbo', 'giant', 'slow', 'fireShot', 'wall', 'embers',
      'slip', 'burnCd', 'dig', 'ram', 'spinT', 'magnet']) {
      p[k] = Math.max(0, p[k] - dt);
    }
    // la habilidad sólo recarga con la pelota en juego (no en festejos ni saques)
    if (m.state === 'play') p.cd = Math.max(0, p.cd - dt);
    if (p.stun <= 0) p.asleep = false;
    if (b.holder === p) p.holdT += dt; else p.holdT = 0;
    if (digging && p.dig <= 0) popDig(m, p);

    let mx = it.mx, my = it.my;
    if (p.human) p.aimMy = Math.abs(my) > 0.3 ? Math.sign(my) : 0;

    // asistencias: presionar, o ir a buscar un pase que viene hacia mí
    const autoReceive = p.human && b.passTo === p && !b.holder && Math.hypot(mx, my) < 0.2;
    if (active && p.stun <= 0 && b.holder !== p && (it.press || autoReceive)) {
      const [tx, ty] = ballTarget(m, p);
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d > 8) { mx = dx / d; my = dy / d; }
    }

    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (p.spinT > 0) p.facing += dt * 16;
    else if (p.dash <= 0 && !p.slam && p.stun <= 0) {
      if (it.aim !== undefined) p.facing = it.aim;
      else if (ml > 0.2) p.facing = Math.atan2(my, mx);
    }

    let sp = p.def.speed * (p.human ? 1 : p.skill.speed) * st.speed;
    if (b.holder === p) sp *= 0.9;
    if (p.charge >= 0) sp *= 0.55;
    if (p.turbo > 0) sp *= 1.4;
    if (p.giant > 0) sp *= 0.9;
    if (p.phase > 0) sp *= 1.2;
    if (p.dig > 0) sp *= 1.3;
    if (p.slow > 0) sp *= 0.55;
    if (p.wall > 0) sp *= 0.3;

    if (p.slam) {
      // la trayectoria del salto la lleva movePlayers
    } else if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDx * p.dashSpeed;
      p.vy = p.dashDy * p.dashSpeed;
      if (Math.random() < 0.6) PF.FX.particle(m.fx, p.x, p.y, -p.vx * 0.1, -p.vy * 0.1, '#e9e2c8', 0.3, 4);
    } else if (p.stun > 0) {
      const k = U.damp(p.slip > 0 ? 0.8 : st.traction * 0.32, dt);
      p.vx -= p.vx * k; p.vy -= p.vy * k;
    } else {
      const k = U.damp(p.slip > 0 ? 1.3 : st.traction, dt);
      p.vx += (mx * sp - p.vx) * k;
      p.vy += (my * sp - p.vy) * k;
    }

    // estelas de estados
    if (p.fireShot > 0 && Math.random() < 0.5) {
      PF.FX.particle(m.fx, p.x + U.rand(-10, 10), p.y - U.rand(5, 30), 0, -60, U.pick(['#ffb347', '#ff6b3d', '#ffe066']), 0.35, 4);
    }
    if (p.turbo > 0 && Math.hypot(p.vx, p.vy) > 100 && Math.random() < 0.5) {
      PF.FX.particle(m.fx, p.x, p.y - 10, -p.vx * 0.2, -p.vy * 0.2, '#ffe066', 0.25, 3);
    }
    if (p.dig > 0 && Math.random() < 0.7) {
      PF.FX.particle(m.fx, p.x + U.rand(-12, 12), p.y, U.rand(-40, 40), U.rand(-90, -30), U.pick(['#8a6a4a', '#a98762', '#6b5038']), 0.4, 4, 300);
    }
    if (p.embers > 0) {
      p.emberT -= dt;
      if (p.emberT <= 0) {
        p.emberT = 0.06;
        addHazard(m, { kind: 'fire', x: p.x, y: p.y, r: 20, life: 2.6, team: p.team });
      }
    }

    if (!active || p.stun > 0 || p.slam) { p.charge = -1; return; }

    if (it.ability && p.cd <= 0) useAbility(m, p);
    if (b.holder === p) {
      if (it.pass) pass(m, p);
      else if (it.shootHold) p.charge = Math.min(CHARGE_MAX, Math.max(0, p.charge) + dt);
      else if (p.charge >= 0) shoot(m, p, p.charge / CHARGE_MAX);
    } else {
      p.charge = -1;
      // si me están pasando la pelota, J no es placaje
      if (it.pass && p.tackleCd <= 0 && p.dash <= 0 && b.passTo !== p) tackle(m, p);
    }
  }

  function movePlayers(m, dt) {
    for (const p of m.players) {
      if (p.slam) {
        const s = p.slam;
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        p.x = U.lerp(s.x0, s.x1, k);
        p.y = U.lerp(s.y0, s.y1, k);
        p.z = Math.sin(k * Math.PI) * s.h;
        if (k >= 1) { p.slam = null; p.z = 0; landSlam(m, p, s.soft); }
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      PF.Field.collide(p, radius(p), 0.2, false);
    }
  }

  function collidePlayers(m) {
    const P = m.players;
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const a = P[i], c = P[j];
        if (untouchable(a) || untouchable(c)) continue;
        const min = radius(a) + radius(c);
        let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.001) { dx = 1; dy = 0; d = 1; }
        const nx = dx / d, ny = dy / d;
        if (a.team !== c.team) {
          if (a.dash > 0 && c.stun <= 0) { tackleHit(m, a, c, nx, ny); continue; }
          if (c.dash > 0 && a.stun <= 0) { tackleHit(m, c, a, -nx, -ny); continue; }
          if (a.wall > 0 && c.stun <= 0) { wallBump(m, a, c, nx, ny); continue; }
          if (c.wall > 0 && a.stun <= 0) { wallBump(m, c, a, -nx, -ny); continue; }
        }
        const ma = mass(a), mc = mass(c), tot = ma + mc, over = min - d;
        a.x -= nx * over * (mc / tot); a.y -= ny * over * (mc / tot);
        c.x += nx * over * (ma / tot); c.y += ny * over * (ma / tot);
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = (-1.3 * rv) / (1 / ma + 1 / mc);
          a.vx -= (imp * nx) / ma; a.vy -= (imp * ny) / ma;
          c.vx += (imp * nx) / mc; c.vy += (imp * ny) / mc;
        }
      }
    }
  }

  function wallBump(m, w, v, nx, ny) {
    v.x = w.x + nx * (radius(w) + radius(v) + 1);
    v.y = w.y + ny * (radius(w) + radius(v) + 1);
    if (knock(m, v, nx, ny, 320, 0.4)) {
      PF.FX.text(m.fx, v.x, v.y - 50, '¡BOING!', '#e8e0cc', 0.8, 0.7);
      PF.Audio.sfx.bounce(600);
    }
  }

  function animate(m, p, dt) {
    p.animT += dt;
    if (p.animLock > 0) { p.animLock -= dt; return; }
    let want = 'Idle';
    if (p.stun > 0) want = 'Hurt';
    else if (m.state === 'goal' && p.team === m.goalTeam) want = 'Charge';
    else if (Math.hypot(p.vx, p.vy) > 40) want = 'Walk';
    if (p.anim !== want) { p.anim = want; p.animT = 0; }
  }

  // ---------------------------------------------------------------- acciones
  function release(m, p, vx, vy) {
    const b = m.ball;
    b.holder = null; b.last = p; b.vx = vx; b.vy = vy; b.vine = null; b.passTo = null;
    p.pickupCd = 0.3;
    p.charge = -1;
  }

  function pass(m, p) {
    const b = m.ball;
    const mate = passTarget(m, p);
    if (mate) {
      const tx = mate.x + mate.vx * 0.35, ty = mate.y + mate.vy * 0.35;
      const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
      const sp = U.clamp(d * 1.5 + 260, 380, 900);
      p.facing = Math.atan2(dy, dx);
      release(m, p, (dx / d) * sp, (dy / d) * sp);
      // el control pasa al que recibe, que va solo a buscarla
      b.passTo = mate; b.passT = 2;
      if (p.human) setControl(m, mate);
    } else {
      // pase al hueco: hacia donde miras; sigues controlando al mismo.
      // En el saque sale más flojo, para que no llegue al arco rival.
      const sp = m.state === 'kickoff' ? 380 : 560;
      release(m, p, Math.cos(p.facing) * sp, Math.sin(p.facing) * sp);
    }
    setAnim(p, 'Shoot', true);
    PF.Audio.sfx.pass();
  }

  function shoot(m, p, k) {
    const b = m.ball;
    const aim = shotAim(p);
    const power = U.lerp(0.42, 1, k) * p.def.power * (b.big > 0 ? 0.85 : 1);
    let sp = 1180 * power;
    const fire = p.fireShot > 0;
    if (fire) sp = 1450 * p.def.power;
    p.facing = aim.a;
    release(m, p, Math.cos(aim.a) * sp, Math.sin(aim.a) * sp);
    setAnim(p, 'Attack', true);
    PF.Audio.sfx.kick(power);
    PF.FX.burst(m.fx, b.x, b.y, fire ? 18 : 8, fire ? '#ff9a3d' : '#fff', 220, 0.3, 3);
    if (fire) {
      p.fireShot = 0;
      b.fire = 1.6;
      PF.Audio.sfx.fire();
      PF.FX.text(m.fx, p.x, p.y - 60, '¡FUEGO!', '#ff9a3d', 1.1);
      m.shake = Math.max(m.shake, 7);
    } else if (k > 0.9) {
      m.shake = Math.max(m.shake, 3);
      PF.FX.text(m.fx, p.x, p.y - 60, '¡ZAMBOMBAZO!', '#fff', 0.8, 0.7);
    }
  }

  function tackle(m, p) {
    p.dash = DASH_TIME;
    p.dashSpeed = DASH_SPEED;
    p.dashDx = Math.cos(p.facing);
    p.dashDy = Math.sin(p.facing);
    p.tackleCd = p.human ? TACKLE_CD : p.skill.tackleCd;
    setAnim(p, 'Attack', true);
    PF.Audio.sfx.swoosh();
  }

  function tackleHit(m, a, v, nx, ny) {
    if (a.ram <= 0) { a.dash = 0; a.vx *= 0.2; a.vy *= 0.2; }
    const ratio = Math.min(2.2, mass(a) / mass(v));
    if (!knock(m, v, nx, ny, 340 * ratio + 140, 0.9)) return;
    PF.FX.text(m.fx, v.x, v.y - 50, U.pick(['¡ZAS!', '¡PAF!', '¡TOMA!', '¡CATAPLÁN!']), '#ffd23f');
    PF.FX.burst(m.fx, v.x, v.y - 12, 12, '#fff', 200);
    PF.Audio.sfx.tackle();
    if (Math.random() < 0.35) PF.Audio.crowd('oh', 0.5);
    m.freeze = 0.07;
    m.shake = Math.max(m.shake, 5);
  }

  /** Empuja y aturde. Si tenía la pelota, la suelta. Devuelve false si no le afecta. */
  function knock(m, v, nx, ny, force, stun) {
    if (untouchable(v) || v.wall > 0) return false;
    if (m.ball.holder === v) loseBall(m, v, nx, ny);
    v.vx = nx * force; v.vy = ny * force;
    v.stun = Math.max(v.stun, stun);
    v.charge = -1; v.dash = 0;
    setAnim(v, 'Hurt');
    return true;
  }

  function stunInPlace(m, v, stun) {
    if (untouchable(v)) return false;
    if (m.ball.holder === v) loseBall(m, v, Math.cos(v.facing), Math.sin(v.facing));
    v.vx *= 0.15; v.vy *= 0.15;
    v.stun = Math.max(v.stun, stun);
    v.charge = -1; v.dash = 0;
    setAnim(v, 'Hurt');
    return true;
  }

  function loseBall(m, p, nx, ny) {
    const b = m.ball;
    b.holder = null; b.last = p; b.passTo = null;
    const a = Math.atan2(ny, nx) + U.rand(-0.7, 0.7);
    b.vx = Math.cos(a) * 260 + p.vx * 0.2;
    b.vy = Math.sin(a) * 260 + p.vy * 0.2;
    p.pickupCd = 0.6;
    p.charge = -1;
  }

  function take(m, p) {
    const b = m.ball;
    if (b.holder && b.holder !== p) b.holder.charge = -1;
    b.holder = p; b.last = p; b.vine = null; b.fire = 0; b.passTo = null;
    p.holdT = 0;
    PF.Audio.sfx.touch();
    if (m.humanTeam === p.team && m.controlled !== p && m.state === 'play') setControl(m, p);
  }

  function useAbility(m, p) {
    const fn = PF.Abilities[p.def.ability.id];
    const ok = fn(m, p);
    p.cd = ok === false ? 1.2 : p.def.ability.cd;
    if (ok !== false && p.anim !== 'Attack') setAnim(p, 'Charge', true);
  }

  /** Salto: lo usan Golpe Cuerpo y Salto (soft = sin onda expansiva). */
  function jump(m, p, dist, soft) {
    const x1 = U.clamp(p.x + Math.cos(p.facing) * dist, F.x0 + 40, F.x1 - 40);
    const y1 = U.clamp(p.y + Math.sin(p.facing) * dist, F.y0 + 40, F.y1 - 40);
    p.slam = { t: 0, dur: soft ? 0.7 : 0.5, x0: p.x, y0: p.y, x1, y1, h: soft ? 160 : 80, soft };
    p.vx = 0; p.vy = 0;
  }

  function landSlam(m, p, soft) {
    if (soft) {
      PF.FX.burst(m.fx, p.x, p.y, 14, '#d9c9a8', 200, 0.4, 4);
      PF.FX.text(m.fx, p.x, p.y - 60, '¡PLOF!', '#fff', 0.9);
      PF.Audio.sfx.bounce(500);
      return;
    }
    const R = 165, b = m.ball;
    for (const q of m.players) {
      if (q.team === p.team) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < R + radius(q)) knock(m, q, d > 1 ? dx / d : 1, d > 1 ? dy / d : 0, 560 - d, 1.1);
    }
    if (b.holder !== p) {
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d < R) {
        if (b.holder) b.holder.pickupCd = 0.6;
        b.holder = null; b.last = p;
        b.vx = (d > 1 ? dx / d : 1) * 650; b.vy = (d > 1 ? dy / d : 0) * 650;
      }
    }
    PF.FX.ring(m.fx, p.x, p.y, R * 1.4, '#fff', 0.45, 10);
    PF.FX.ring(m.fx, p.x, p.y, R, '#c9b79c', 0.35, 6);
    PF.FX.burst(m.fx, p.x, p.y, 30, '#d9c9a8', 340, 0.5, 5);
    PF.FX.text(m.fx, p.x, p.y - 70, '¡PATAPUM!', '#fff', 1.3);
    PF.Audio.sfx.slam();
    PF.Audio.crowd('oh', 0.6);
    m.shake = Math.max(m.shake, 14);
    m.freeze = 0.08;
    setAnim(p, 'Attack', true);
  }

  /** Onix sale de bajo tierra. */
  function popDig(m, p) {
    const R = 115;
    for (const q of m.players) {
      if (q.team === p.team) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < R + radius(q)) knock(m, q, d > 1 ? dx / d : 1, d > 1 ? dy / d : 0, 480, 0.9);
    }
    PF.FX.burst(m.fx, p.x, p.y, 28, '#8a6a4a', 300, 0.5, 5, 400);
    PF.FX.ring(m.fx, p.x, p.y, R * 1.3, '#a98762', 0.4, 8);
    PF.FX.text(m.fx, p.x, p.y - 70, '¡BRRUM!', '#e8d2b0', 1.2);
    PF.Audio.sfx.slam();
    m.shake = Math.max(m.shake, 9);
    setAnim(p, 'Attack', true);
  }

  // ---------------------------------------------------------------- proyectiles
  /** pr: { x, y, vx, vy, team, kind, life, r, homing?, stun, color } */
  function addProjectile(m, pr) {
    m.projs.push(Object.assign({ t: 0, r: 12, dead: false }, pr));
  }

  function updateProjectiles(m, dt, playing) {
    for (const pr of m.projs) {
      pr.t += dt;
      if (pr.homing) {
        let target = null, bd = Infinity;
        for (const q of m.players) {
          if (q.team === pr.team || q.stun > 0 || untouchable(q)) continue;
          const d = U.dist(pr.x, pr.y, q.x, q.y);
          if (d < bd) { bd = d; target = q; }
        }
        if (target) {
          const a = Math.atan2(pr.vy, pr.vx), want = Math.atan2(target.y - 12 - pr.y, target.x - pr.x);
          const na = a + U.clamp(U.angDiff(a, want), -5 * dt, 5 * dt);
          const s = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(na) * s; pr.vy = Math.sin(na) * s;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (Math.random() < 0.8) PF.FX.particle(m.fx, pr.x, pr.y, U.rand(-30, 30), U.rand(-30, 30), pr.color, 0.25, 3);
      if (pr.x < F.x0 || pr.x > F.x1 || pr.y < F.y0 || pr.y > F.y1 || pr.t > pr.life) { pr.dead = true; continue; }
      if (!playing) continue;
      for (const q of m.players) {
        if (q.team === pr.team || q.stun > 0 || untouchable(q)) continue;
        if (U.dist(pr.x, pr.y, q.x, q.y - 10) > radius(q) + pr.r) continue;
        const s = Math.hypot(pr.vx, pr.vy) || 1;
        if (knock(m, q, pr.vx / s, pr.vy / s, 220, pr.stun)) {
          PF.FX.burst(m.fx, q.x, q.y - 14, 14, pr.color, 220);
          PF.FX.text(m.fx, q.x, q.y - 50, pr.hitText || '¡PAM!', pr.color, 0.9);
          PF.Audio.sfx.tackle();
        }
        pr.dead = true;
        break;
      }
    }
    m.projs = m.projs.filter((pr) => !pr.dead);
  }

  // ---------------------------------------------------------------- zonas
  /** h: { kind: fire|lava|puddle|ice|sleep, x, y, r, life, team (-1 = afecta a todos) } */
  function addHazard(m, h) {
    h.t = 0;
    h.hit = new Set();
    m.hazards.push(h);
  }

  function updateHazards(m, dt, playing) {
    for (const h of m.hazards) h.t += dt;
    m.hazards = m.hazards.filter((h) => h.t < h.life);
    if (!playing) return;
    for (const h of m.hazards) {
      for (const p of m.players) {
        if (p.team === h.team || untouchable(p)) continue;
        if (U.dist(p.x, p.y, h.x, h.y) > h.r + radius(p) * 0.5) continue;
        if (h.kind === 'puddle') {
          p.slip = 0.3;
        } else if (h.kind === 'ice') {
          p.slip = 0.3;
          p.slow = Math.max(p.slow, 0.3);
        } else if ((h.kind === 'fire' || h.kind === 'lava') && p.burnCd <= 0 && p.stun <= 0) {
          p.burnCd = 1;
          let a = U.rand(0, Math.PI * 2);
          if (h.kind === 'lava') a = Math.atan2(p.y - h.y, p.x - h.x);   // la lava escupe hacia fuera
          if (knock(m, p, Math.cos(a), Math.sin(a), h.kind === 'lava' ? 420 : 240, 0.7)) {
            PF.FX.text(m.fx, p.x, p.y - 50, '¡QUEMA!', '#ff8a3d', 0.9);
            PF.FX.burst(m.fx, p.x, p.y - 10, 12, '#ff9a3d', 180);
            PF.Audio.sfx.tackle();
          }
        } else if (h.kind === 'sleep' && h.t > 0.2 && !h.hit.has(p)) {
          h.hit.add(p);
          if (stunInPlace(m, p, 1.8)) {
            p.asleep = true;
            PF.FX.text(m.fx, p.x, p.y - 50, 'Zzz...', '#e6c3ff', 1);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- pelota
  function updateBall(m, dt, playing) {
    const b = m.ball;
    b.fire = Math.max(0, b.fire - dt);
    b.big = Math.max(0, b.big - dt);
    b.crazy = Math.max(0, b.crazy - dt);
    b.r = b.big > 0 ? 20 : BALL_R;
    if (b.passTo) { b.passT -= dt; if (b.passT <= 0) b.passTo = null; }

    if (b.holder) {
      const p = b.holder;
      const r = radius(p) + b.r + 3;
      const tx = p.x + Math.cos(p.facing) * r, ty = p.y + Math.sin(p.facing) * r;
      const k = U.damp(28, dt);
      const nx = b.x + (tx - b.x) * k, ny = b.y + (ty - b.y) * k;
      b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt;
      b.x = nx; b.y = ny;
      b.spin += (Math.hypot(p.vx, p.vy) * dt) / b.r;
      PF.Field.collide(b, b.r, 0, true);
      // robo: un rival que aguanta en contacto con la pelota se la queda
      if (playing && p.phase <= 0 && p.dig <= 0) {
        for (const q of m.players) {
          if (q.team === p.team) continue;
          const touching = q.stun <= 0 && !untouchable(q) && q.pickupCd <= 0 &&
            U.dist(q.x, q.y, b.x, b.y) < radius(q) + b.r + 2;
          if (!touching) { q.stealT = 0; continue; }
          q.stealT += dt;
          if (q.stealT >= (q.human ? HUMAN_STEAL : q.skill.steal) && p.holdT > 0.2) {
            q.stealT = 0;
            take(m, q);
            p.pickupCd = 0.5;
            PF.FX.text(m.fx, q.x, q.y - 50, '¡ROBO!', '#9cf0ff', 0.8, 0.7);
            break;
          }
        }
      }
      return;
    }

    if (b.vine) {
      const p = b.vine;
      b.vineT -= dt;
      if (p.stun > 0 || b.vineT <= 0) b.vine = null;
      else {
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
        b.vx = (dx / d) * 950; b.vy = (dy / d) * 950;
        if (d < radius(p) + b.r + 8 && playing) { take(m, p); return; }
      }
    }

    // imán: la pelota suelta va hacia quien lo tiene
    if (playing && !b.vine) {
      for (const p of m.players) {
        if (p.magnet <= 0 || p.stun > 0) continue;
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
        if (d < 180 && d > 1) { b.vx += (dx / d) * 1100 * dt; b.vy += (dy / d) * 1100 * dt; }
      }
    }
    // pelota loca: curva hacia un lado que cambia sola
    if (b.crazy > 0) {
      if (Math.random() < dt * 1.5) b.curve = -b.curve;
      const s = Math.hypot(b.vx, b.vy);
      if (s > 60) { b.vx += (-b.vy / s) * b.curve * 700 * dt; b.vy += (b.vx / s) * b.curve * 700 * dt; }
    }

    const sp = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.7)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      const imp = PF.Field.collide(b, b.r, 0.78, true);
      if (imp > 120) PF.Audio.sfx.bounce(imp);
      if (imp > 350 && playing) nearMiss(m, b);
      if (ballVsPlayers(m, b, playing)) return;
    }
    if (b.fire > 0 && Math.random() < 0.9) {
      PF.FX.particle(m.fx, b.x, b.y - 6, U.rand(-40, 40), U.rand(-80, -20), U.pick(['#ffb347', '#ff6b3d', '#ffe066']), 0.35, 5);
    }

    if (!b.vine) {
      const fr = m.stadium.friction;
      const k = Math.exp(-0.95 * fr * dt);
      b.vx *= k; b.vy *= k;
      const s2 = Math.hypot(b.vx, b.vy);
      if (s2 > 0) {
        const ns = Math.max(0, s2 - 45 * fr * dt);
        b.vx *= ns / s2; b.vy *= ns / s2;
      }
    }
    b.spin += (sp * dt) / b.r;

    if (PF.Field.outside(b.x, b.y)) Object.assign(b, { x: F.cx, y: F.cy, vx: 0, vy: 0, fire: 0, vine: null });
  }

  /** Un tiro fuerte que pega en el fondo cerca del arco: ¡palo! o ¡uuuh! */
  function nearMiss(m, b) {
    if (m.nearT > 0) return;
    const atEnd = b.x < F.x0 + b.r + 3 || b.x > F.x1 - b.r - 3;
    if (!atEnd) return;
    const dy = Math.abs(b.y - F.cy);
    let txt = null;
    if (dy > F.goalHalf - 6 && dy < F.goalHalf + 14) txt = '¡PALO!';
    else if (dy < F.goalHalf + 110) txt = '¡UUUH!';
    if (!txt) return;
    m.nearT = 1.2;
    PF.FX.text(m.fx, b.x + (b.x < F.cx ? 60 : -60), b.y - 40, txt, '#fff', 1.2);
    PF.Audio.crowd('ooh', 1);
    if (txt === '¡PALO!') { PF.Audio.sfx.post(); m.shake = Math.max(m.shake, 6); }
  }

  /** Choques de la pelota suelta con los Pokémon. true si alguien la controló. */
  function ballVsPlayers(m, b, playing) {
    for (const p of m.players) {
      if (p.slam || p.dig > 0) continue;
      if (p === b.last && p.pickupCd > 0) continue;
      const pr = radius(p);
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d >= pr + b.r) continue;
      const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;

      if (b.fire > 0 && b.last) {
        // la bola de fuego atraviesa: derriba rivales e ignora compañeros
        if (p.team !== b.last.team && p.stun <= 0) {
          const s = Math.hypot(b.vx, b.vy) || 1;
          if (knock(m, p, b.vx / s, b.vy / s, 520, 1.2)) {
            PF.FX.text(m.fx, p.x, p.y - 50, '¡ARDE!', '#ff8a3d');
            PF.FX.burst(m.fx, p.x, p.y - 10, 16, '#ff9a3d', 240);
            PF.Audio.sfx.tackle();
            m.freeze = 0.05;
          }
        }
        if (p.wall <= 0) continue;
        b.fire = 0;   // el Bloqueo apaga el fuego
      }

      if (b.vine === p && playing) { take(m, p); return true; }

      const rvx = b.vx - p.vx, rvy = b.vy - p.vy, rel = Math.hypot(rvx, rvy);
      const canTake = playing && p.stun <= 0 && p.pickupCd <= 0;
      const control = CONTROL_SPEED * (p.giant > 0 ? 1.5 : 1) * (b.passTo === p ? 1.3 : 1) * (p.magnet > 0 ? 1.4 : 1);
      if (canTake && rel < control) { take(m, p); return true; }

      // rebote contra el cuerpo
      b.x = p.x + nx * (pr + b.r);
      b.y = p.y + ny * (pr + b.r);
      const vn = rvx * nx + rvy * ny;
      const bounce = p.wall > 0 ? 2.0 : 1.6;
      if (vn < 0) { b.vx -= bounce * vn * nx; b.vy -= bounce * vn * ny; }
      if (p.wall > 0) PF.FX.ring(m.fx, b.x, b.y, 40, '#e8e0cc', 0.25, 4);
      if (playing && rel > 820 && p.stun <= 0 && b.last && b.last.team !== p.team) {
        if (knock(m, p, -nx, -ny, 220, 0.45)) {
          PF.FX.text(m.fx, p.x, p.y - 50, '¡PLAF!', '#fff', 0.9);
          PF.Audio.sfx.tackle();
        }
      }
      b.last = p;
    }
    return false;
  }

  function checkGoal(m) {
    const b = m.ball;
    let team = -1;
    if (Math.abs(b.y - F.cy) < F.goalHalf + b.r) {
      if (b.x < F.x0 - b.r) team = 1;
      else if (b.x > F.x1 + b.r) team = 0;
    }
    if (team < 0) return;
    b.holder = null;
    b.vx *= 0.25; b.vy *= 0.25;   // que se quede en la red
    b.vine = null; b.passTo = null;
    m.score[team]++;
    m.state = 'goal';
    m.stateT = 1.8;
    m.goalTeam = team;
    m.kickoffTeam = 1 - team;
    m.ownGoal = !!(b.last && b.last.team !== team);
    m.scorer = b.last;
    const color = PF.TEAM_COLORS[team];
    PF.FX.text(m.fx, m.cam.x + PF.W / 2, m.cam.y + PF.H / 2 - 30, m.ownGoal ? '¡AUTOGOL!' : '¡GOOOOL!', color, 3, 2.2);
    PF.FX.confetti(m.fx, [color, '#fff', '#ffd23f'], m.cam);
    PF.FX.ring(m.fx, b.x, b.y, 140, '#fff', 0.6, 12);
    PF.Audio.sfx.goal();
    PF.Audio.crowd('cheer', 1);
    m.shake = 16;
    m.freeze = 0.12;
  }

  // ---------------------------------------------------------------- cajas
  function updateItems(m, dt) {
    if (m.items.length === 0) {
      m.itemT -= dt;
      if (m.itemT <= 0) {
        m.items.push({ x: U.rand(F.x0 + 180, F.x1 - 180), y: U.rand(F.y0 + 90, F.y1 - 90), kind: U.pick(ITEMS), t: 0 });
        m.itemT = U.rand(9, 14) * (4 / (2 + teamOf(m, 0).length));
      }
    }
    for (let i = m.items.length - 1; i >= 0; i--) {
      const it = m.items[i];
      it.t += dt;
      for (const p of m.players) {
        if (untouchable(p) || p.stun > 0) continue;
        if (U.dist(p.x, p.y, it.x, it.y) < radius(p) + 16) {
          applyItem(m, p, it.kind);
          m.items.splice(i, 1);
          break;
        }
      }
    }
  }

  function applyItem(m, p, kind) {
    const b = m.ball;
    if (kind.id === 'recarga') p.cd = 0;
    else if (kind.id === 'turbo') p.turbo = 6;
    else if (kind.id === 'gigante') p.giant = 7;
    else if (kind.id === 'lento') for (const q of m.players) if (q.team !== p.team) q.slow = 4;
    else if (kind.id === 'gigaball') b.big = 8;
    else if (kind.id === 'loca') b.crazy = 6;
    else if (kind.id === 'iman') p.magnet = 6;
    PF.FX.text(m.fx, p.x, p.y - 60, kind.label, kind.color, 1);
    PF.FX.burst(m.fx, p.x, p.y - 20, 16, kind.color, 220);
    PF.Audio.sfx.pickup();
  }

  /** Orden vigente para el Pokémon p (sólo afecta a la IA del equipo humano). */
  const orderOf = (m, p) => (p.team === m.humanTeam && !p.human ? ORDERS[m.order].id : 'neutral');

  return {
    create, step, CHARGE_MAX, ORDERS, orderOf,
    // usados por abilities.js, ai.js y render.js
    radius, mass, untouchable, mateOf, matesOf, teamOf, setAnim, knock, stunInPlace, loseBall, shoot,
    addHazard, addProjectile, jump, nearestFoeDist, homeSpot, shotAim, passTarget,
  };
})();
