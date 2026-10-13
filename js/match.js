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
  const SHOT_TAP = 0.85, SHOT_FULL = 1.3;   // fuerza del tiro: con un toque y cargado a tope (× 1180 px/s)
  const DASH_SPEED = 660, DASH_TIME = 0.2, TACKLE_CD = 1.1;
  const PASS_CONE = 1.1;         // radianes: apuntando así de cerca de un compañero, el pase va a él
  const HUMAN_STEAL = 0.12;      // segundos de contacto para robar (las IA usan skill.steal)
  const KICKOFF_WAIT = 0.4, KICKOFF_MAX = 6;
  const REC_FRAMES = 150;        // 2,5 s de repetición
  const SUBS_PER_MATCH = 3;

  /**
   * Energía: el máximo sale de los PS (más PS = más aguante). Se gasta
   * corriendo, pateando, placando y con las habilidades, y al recibir golpes
   * (más si el ataque es súper eficaz); el gasto es igual para todos, así que
   * al que tiene más PS le pesa menos. Se recupera trotando o quieto, y en el
   * banco (en proporción a su máximo). Por debajo del 40 % el Pokémon está
   * cansado (más lento, patea más flojo, recarga más lento); en 0 está
   * agotado y no puede usar su habilidad.
   */
  const STAMINA = { press: 3, run: 0.9, regen: 4, rest: 7, bench: 6, shot: 1.5, shotCharge: 2.5, pass: 0.5, tackle: 3, hit: 5, hitStun: 8, ability: 2, abilityCd: 0.35 };
  const TIRED = 40;   // % de energía por debajo del cual está cansado
  /**
   * Vida (aparte de la energía): los golpes la gastan (HP.dmg × el desgaste de
   * hurt()) y la energía sólo se resiente un poco (hitStamina). Con 0 queda K.O.
   * koTime segundos y se levanta con 1/3. Recupera poquito jugando y rápido en el
   * banco (ahí el K.O. también pasa más rápido).
   */
  const HP = { dmg: 0.45, regen: 0.2, bench: 2.5, koTime: 7, koBench: 2.5, revive: 1 / 3, hitStamina: 0.3 };
  const hpPct = (x) => (100 * x.hp) / x.maxHp;
  /** Recuperación de energía por velocidad: los rápidos (esprínteres) se reponen antes, 0,8 … 1,3. */
  const recov = (p) => 0.8 + 0.5 * U.clamp((p.def.speed - 230) / 120, 0, 1);
  /**
   * Estados (uno a la vez por Pokémon; p.status / p.statusT):
   *   burn    pierde vida cada segundo y tira un 15 % más flojo
   *   poison  pierde vida cada segundo (un 2º impacto lo agrava)
   *   para    65 % de la velocidad y a veces se traba un instante
   *   freeze  inmóvil, y al terminar queda lento unos segundos
   *   conf    se desvía solo al moverse y los pases le salen torcidos
   *   fear    no puede usar su habilidad
   * Los tipos inmunes no los reciben. Quemadura y veneno no lo dejan K.O.
   * (se frenan en el 10 % de la vida).
   */
  const STATUS = {
    burn: { label: 'QUEMADO', color: '#ff8a3d', immune: ['fire'] },
    poison: { label: 'ENVENENADO', color: '#b06fd0', immune: ['poison', 'steel'] },
    para: { label: 'PARALIZADO', color: '#f6d32d', immune: ['electric'] },
    freeze: { label: 'CONGELADO', color: '#9fe3ff', immune: ['ice'] },
    conf: { label: 'CONFUSO', color: '#ffd84a', immune: ['psychic'] },
    fear: { label: 'ASUSTADO', color: '#8a7bd0', immune: ['ghost'] },
  };
  const DOT_FLOOR = 0.1;
  /** Energía en % del máximo (el máximo sale de los PS: PF.staminaMax). */
  const energyPct = (x) => (100 * x.stamina) / x.maxStamina;
  /** Multiplicador por cansancio: 1 descansado, 0,65 agotado. */
  const fatigue = (p) => { const e = energyPct(p); return e >= TIRED ? 1 : 0.65 + (0.35 * Math.max(0, e)) / TIRED; };
  function spend(p, amount) { p.stamina = Math.max(0, Math.min(p.maxStamina, p.stamina - amount)); }
  /**
   * Presionar (correr solo a la pelota): cansa más (STAMINA.press por segundo,
   * además de correr) y se sostiene como mucho PRESS_MAX segundos seguidos.
   * Al soltar, o al agotarse, se enfría: 0,8 s + 1,1 s por segundo presionado
   * (unos 3 s si se usó entero). Así no conviene llevarlo apretado todo el rato.
   */
  const PRESS_MAX = 2;
  /**
   * Estirada del arquero: dura DIVE_TIME a DIVE_SPEED (~150 px), después queda
   * DIVE_DOWN en el piso, y no puede volver a estirarse hasta DIVE_CD.
   */
  const DIVE_TIME = 0.26, DIVE_SPEED = 580, DIVE_DOWN = 0.35, DIVE_CD = 1.1;
  const pressCooldown = (t) => 0.8 + 1.1 * t;
  const NO_INTENT = { mx: 0, my: 0, pass: false, shootHold: false, ability: false, press: false };

  /**
   * Formaciones por defecto: [profundidad desde el arco propio (0..1), lateral (-1..1)].
   * Con arquero fijo, el que está casi en la línea (< 0.1) es el arquero.
   * La pizarra (board.js) deja moverlas; el puesto sale de la profundidad (PF.zoneRole).
   */
  const PRESETS = {
    dynamic: {
      2: [[0.42, -0.3], [0.22, 0.28]],
      3: [[0.55, -0.35], [0.45, 0.38], [0.22, 0]],
      5: [[0.62, -0.33], [0.62, 0.33], [0.42, 0], [0.22, -0.42], [0.22, 0.42]],
    },
    fixed: {
      2: [[0.45, 0], [0.03, 0]],
      3: [[0.55, -0.3], [0.35, 0.3], [0.03, 0]],
      5: [[0.65, 0], [0.45, -0.38], [0.45, 0.38], [0.22, 0], [0.03, 0]],
    },
  };
  const KEEPER_DEPTH = 0.1;

  /**
   * Formación por defecto para unos Pokémon: reparte las posiciones según el
   * puesto natural de cada uno (el más arquero al arco, el más delantero arriba).
   * Devuelve [[d, f], ...] en el mismo orden que `defs`.
   * `size` = formato del partido; con un equipo a medio elegir (menos Pokémon
   * que el formato) se usa la formación completa y se llenan sólo esos puestos.
   */
  function autoFormation(defs, mode, size = defs.length) {
    const presets = PRESETS[mode] || PRESETS.dynamic;
    const fit = Object.keys(presets).map(Number).sort((a, b) => a - b).find((n) => n >= Math.max(size, defs.length)) || 5;
    const spots = presets[fit];
    const sorted = spots.map((s, i) => ({ s, i })).sort((a, b) => a.s[0] - b.s[0]);   // del arco hacia arriba
    const left = defs.map((d, i) => ({ d, i, sc: PF.roleScores(d) }));
    const out = [];
    for (const { s } of sorted) {
      if (!left.length) break;
      const role = PF.zoneRole(s[0]);
      left.sort((a, b) => b.sc[role] - a.sc[role]);
      const pick = left.shift();
      out[pick.i] = s.slice();
    }
    // más Pokémon que puestos (no debería pasar): el resto en el medio
    left.forEach((l, k) => { out[l.i] = [0.4, (k % 2 ? 1 : -1) * 0.5]; });
    return out;
  }

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
  const mass = (p) => p.def.mass * p.bonus.mass * (p.giant > 0 ? 2.2 : 1) * (p.wall > 0 ? 20 : 1);

  /** ¿El punto está dentro del área grande del equipo `team`? */
  function inBox(side, x, y, pad = 0) {
    if (Math.abs(y - F.cy) > F.boxH + pad) return false;
    return side === 0 ? x < F.x0 + F.boxW + pad : x > F.x1 - F.boxW - pad;
  }
  /** Arquero de ese equipo en este momento y dentro de su área (puede usar las manos). */
  const isActiveKeeper = (m, p) => m.keeper[p.team] === p && inBox(p.side, p.x, p.y, 6);
  const keeperOf = (m, team) => m.keeper[team];

  /** Reflejos del arquero: velocidad máxima de tiro que atrapa (más rápido, desvía). */
  function catchSpeed(m, p) {
    return 1050 * p.bonus.reflex * m.mods[p.team].reflex * (p.human ? 1 : p.skill.keeper || 1);
  }
  const untouchable = (p) => p.phase > 0 || p.dig > 0 || !!p.slam || p.fainted;
  const teamOf = (m, team) => m.players.filter((q) => q.team === team);
  const matesOf = (m, p) => m.players.filter((q) => q.team === p.team && q !== p);
  const mateOf = (m, p) => matesOf(m, p)[0];
  // lado de la cancha: 0 = defiende el arco izquierdo, 1 = el derecho (se sortea en cada partido)
  const ownGoalX = (side) => (side === 0 ? F.x0 : F.x1);
  const dirOf = (side) => (side === 0 ? 1 : -1);

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

  /**
   * Qué tan libre está la línea de (ax,ay) a (bx,by) para el equipo `team`:
   * distancia del rival (no aturdido) más cercano al segmento. Infinity si no hay nadie en medio.
   */
  function laneClear(m, team, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let best = Infinity;
    for (const q of m.players) {
      if (q.team === team || q.stun > 0) continue;
      const t = ((q.x - ax) * dx + (q.y - ay) * dy) / L2;
      if (t < 0.05 || t > 1) continue;
      best = Math.min(best, Math.hypot(ax + dx * t - q.x, ay + dy * t - q.y) - q.r);
    }
    return best;
  }

  /**
   * Mejor punto de la boca del arco rival para tirar desde (x, y): prueba
   * palos y centro y se queda con el de la línea más libre (el arquero cuenta).
   * { y, clear }
   */
  function bestShot(m, p, x = p.x, y = p.y) {
    const gx = p.side === 0 ? F.x1 + 10 : F.x0 - 10;
    let best = { y: F.cy, clear: -Infinity };
    for (const k of [-0.75, -0.35, 0.35, 0.75]) {
      const ty = F.cy + k * F.goalHalf;
      const clear = laneClear(m, p.team, x, y, gx, ty);
      if (clear > best.clear) best = { y: ty, clear };
    }
    return best;
  }

  /**
   * Bonus por jugar en su puesto natural: arquero con mejores reflejos,
   * defensa más pesado, medio más rápido y con menos recarga, delantero con
   * más tiro. Fuera de puesto no hay castigo.
   */
  function roleBonus(natural, pos) {
    const b = { speed: 1, power: 1, mass: 1, reflex: 1, cd: 1 };
    if (natural === 'POR') b.reflex = 1.25;                 // de arquero siempre (también dinámico)
    if (natural !== pos) return b;
    if (pos === 'DEF') b.mass = 1.15;
    if (pos === 'MED') { b.speed = 1.04; b.cd = 0.9; }
    if (pos === 'DEL') b.power = 1.08;
    return b;
  }

  function makePlayer(def, team, slot, skill, spot, side) {
    const natural = PF.naturalRole(def), pos = PF.zoneRole(spot[0]);
    return {
      def, team, side, slot, skill, spot, natural, pos, bonus: roleBonus(natural, pos),
      stats: { goals: 0, assists: 0, tackles: 0, saves: 0 },
      stamina: PF.staminaMax(def), maxStamina: PF.staminaMax(def), agility: PF.agility(def),
      hp: PF.hpMax(def), maxHp: PF.hpMax(def), ko: 0, fainted: false, hurtT: -9, rank: PF.powerRank(def),
      status: null, statusT: 0, statusLvl: 0, confT: 0, confAng: 0, chan: null,
      types: PF.typesOf(def), tiredWarned: false,
      gkHold: false, gkT: 0, assistFrom: null, assistT: 0, ctrl: null,
      pressT: 0, pressCd: 0, pressCdMax: 1, pressLock: false, diveCd: 0, down: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, facing: 0, r: def.radius,
      stun: 0, asleep: false, cd: def.ability.cd * 0.75, tackleCd: 0, dash: 0, dashDx: 0, dashDy: 0, dashSpeed: DASH_SPEED,
      pickupCd: 0, holdT: 0, stealT: 0, charge: -1, passCharge: -1, aimMy: 0,
      fireShot: 0, phase: 0, turbo: 0, giant: 0, slow: 0, wall: 0, embers: 0, emberT: 0, slip: 0, burnCd: 0,
      dig: 0, ram: 0, spinT: 0, magnet: 0, diving: 0, fixedKeeper: false,
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
    const [d, f] = p.spot;
    const len = F.x1 - F.x0, H = (F.y1 - F.y0) / 2, dir = dirOf(p.side), own = ownGoalX(p.side);
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
    // la IA no le pasa a un compañero aturdido (el humano apunta a quien quiera)
    const mates = matesOf(m, p).filter((q) => !q.slam && q.dig <= 0 && (p.human || q.stun <= 0));
    if (!mates.length) return null;
    let best = null, bestScore = p.human ? Infinity : -Infinity;
    let nearest = null, nd = Infinity;
    for (const q of mates) {
      const d = U.dist(p.x, p.y, q.x, q.y);
      if (p.human) {
        const a = Math.abs(U.angDiff(p.facing, Math.atan2(q.y - p.y, q.x - p.x)));
        const score = a + d / 3000;
        if (a < PASS_CONE && score < bestScore) { best = q; bestScore = score; }
        // si no apunta a nadie (aunque esté de espaldas), al más cercano que no esté aturdido
        if (q.stun <= 0 && d < nd) { nd = d; nearest = q; }
      } else {
        const free = Math.min(250, nearestFoeDist(m, q, q.x, q.y));
        const ahead = (q.x - p.x) * dirOf(p.side);
        // al arquero sólo si no hay otra (pase atrás de seguridad)
        const backPass = m.keeper[q.team] === q ? 220 : 0;
        // línea de pase con un rival en medio: casi seguro que la cortan
        const lane = laneClear(m, p.team, p.x, p.y, q.x, q.y);
        const cut = lane < 40 ? 170 : lane < 80 ? 60 : 0;
        // en el último tercio, premiar al que queda de cara al arco con la línea de tiro libre
        const gx = q.side === 0 ? F.x1 : F.x0, dG = U.dist(q.x, q.y, gx, F.cy);
        const shotBonus = !backPass && dG < 480 ? (480 - dG) * (bestShot(m, q).clear > 30 ? 0.5 : 0.12) : 0;
        const score = free + ahead * 0.4 - Math.max(0, d - 450) * 0.6 - backPass - cut + shotBonus;
        if (score > bestScore) { best = q; bestScore = score; }
      }
    }
    return best || (p.human ? nearest : null);
  }

  /**
   * Dirección del tiro de un humano. Si mira más o menos al arco, apunta a un
   * punto de la boca: arriba/abajo eligen palo; sin dirección vertical, al
   * palo contrario a donde está. { a, goal, tx, ty }
   */
  function shotAim(p) {
    const gx = p.side === 0 ? F.x1 + 14 : F.x0 - 14;
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
   * opts.keeperMode 'dynamic' (arquero dinámico: ataja el más cercano a su arco) o 'fixed'
   * opts.formations [[[d, f]...], [[d, f]...]] posiciones (si falta, autoFormation)
   * opts.mods       [{speed, power, cd, reflex}, ...] multiplicadores por equipo (mejoras de la historia)
   * opts.bench      [[def...], [def...]] suplentes de cada equipo (hasta 3 cambios)
   * opts.flip       true: el equipo 0 defiende el arco derecho
   * Antes hay que llamar a PF.configureField(n) con el tamaño del equipo.
   */
  function create(opts) {
    const keeperMode = opts.keeperMode || 'dynamic';
    const neutral = { speed: 1, power: 1, cd: 1, reflex: 1 };
    const m = {
      players: [],
      ball: {
        x: F.cx, y: F.cy, vx: 0, vy: 0, r: BALL_R, holder: null, last: null, fire: 0,
        vine: null, vineT: 0, vineColor: '#7dff9e', passTo: null, passT: 0, passFrom: null, spin: 0, big: 0, crazy: 0, curve: 1,
      },
      score: [0, 0], time: opts.time ?? PF.MATCH_TIME, totalTime: opts.time ?? PF.MATCH_TIME, golden: false,
      state: 'kickoff', stateT: 0, clock: 0, kickoffTeam: Math.random() < 0.5 ? 0 : 1, kicker: null,
      goalTeam: -1, ownGoal: false, winner: -1, scorer: null,
      items: [], itemT: 7, hazards: [], projs: [],
      fx: PF.FX.create(), shake: 0, freeze: 0, cam: { x: 0, y: 0 },
      rec: [], replay: null, replays: opts.replays !== false, nearT: 0,
      stadium: PF.stadiumById(opts.stadium),
      // humanos: cada uno maneja un Pokémon de su equipo (dos en el mismo = cooperativo).
      // humanTeam = el equipo de quien mira esta pantalla (HUD, colores, cambios).
      humans: (opts.humans || (opts.humanTeam >= 0 ? [{ team: opts.humanTeam }] : [])).map((h, idx) => ({ idx, team: h.team, name: h.name || '', controlled: null })),
      view: opts.view ?? 0,   // -1: espectador (no maneja a nadie)
      humanTeam: opts.humanTeam ?? (opts.humans && opts.humans[opts.view ?? 0] ? opts.humans[opts.view ?? 0].team : -1),
      demo: !!opts.demo, autoSubs: !!opts.autoSubs,
      orders: [0, 0],   // orden (índice en ORDERS) de cada equipo con humanos
      tactic: ['neutral', 'neutral'], coachT: 4, rotateT: 2,   // táctica de los equipos de la CPU
      keeperMode, keeper: [null, null],
      sides: opts.flip ? [1, 0] : [0, 1],   // lado de cada equipo
      bench: [0, 1].map((t) => ((opts.bench && opts.bench[t]) || []).map((def) => ({ def, stamina: PF.staminaMax(def), maxStamina: PF.staminaMax(def), hp: PF.hpMax(def), maxHp: PF.hpMax(def), ko: 0, fainted: false }))),
      subsLeft: [SUBS_PER_MATCH, SUBS_PER_MATCH], subT: 0,
      retired: [],                          // los que salieron (para la experiencia)
      hit: null,
      mods: [Object.assign({}, neutral, opts.mods && opts.mods[0]), Object.assign({}, neutral, opts.mods && opts.mods[1])],
    };
    // el Pokémon que maneja quien mira esta pantalla, y la orden de su equipo
    Object.defineProperty(m, 'controlled', { get() { const h = this.humans[this.view]; return h ? h.controlled : null; } });
    Object.defineProperty(m, 'order', {
      get() { return this.humanTeam >= 0 ? this.orders[this.humanTeam] : 0; },
      set(v) { if (this.humanTeam >= 0) this.orders[this.humanTeam] = v; },
    });
    // sprites de todos los que pueden aparecer (se cargan mientras arranca el saque)
    for (const defs of opts.teams.concat(opts.bench || [])) for (const d of defs) PF.Sprites.preload(d.dex);
    opts.teams.forEach((defs, team) => {
      const given = opts.formations && opts.formations[team];
      const spots = given && given.length === defs.length ? given : autoFormation(defs, keeperMode);
      defs.forEach((d, i) => m.players.push(makePlayer(d, team, i, opts.skills[team], spots[i], m.sides[team])));
    });
    if (keeperMode === 'fixed') {
      for (const team of [0, 1]) {
        // el más pegado al arco es el arquero
        const t = teamOf(m, team);
        m.keeper[team] = t.reduce((a, b) => (b.spot[0] < a.spot[0] ? b : a));
        m.keeper[team].fixedKeeper = true;
      }
    }
    kickoff(m);
    return m;
  }

  const hasHuman = (m, team) => m.humans.some((h) => h.team === team && !h.gone);

  /** El humano `h` (por defecto, el de esta pantalla) pasa a manejar a `p`, si no lo maneja otro. */
  function setControl(m, p, h = m.humans[m.view] || m.humans[0]) {
    if (!h || (p.human && p.ctrl !== h)) return;
    const old = h.controlled;
    if (old && old !== p) {
      // el enfriamiento de presionar es del jugador humano, no del Pokémon:
      // cambiar de Pokémon no lo reinicia
      if (old.pressT > 0) endPress(m, old);
      if (old.pressCd > p.pressCd) { p.pressCd = old.pressCd; p.pressCdMax = old.pressCdMax; }
      p.pressLock = old.pressLock;
    }
    if (old) { old.human = false; old.ctrl = null; }
    h.controlled = p;
    p.human = true;
    p.ctrl = h;
  }
  function releaseControl(h) {
    if (h.controlled) { h.controlled.human = false; h.controlled.ctrl = null; }
    h.controlled = null;
  }
  /** Un jugador online se fue: su Pokémon pasa a la IA y no vuelve a tomar control. */
  function dropHuman(m, i) {
    const h = m.humans[i];
    if (!h) return;
    h.gone = true;
    releaseControl(h);
  }

  function kickoff(m) {
    const k = m.kickoffTeam, b = m.ball;
    Object.assign(b, { x: F.cx, y: F.cy, vx: 0, vy: 0, holder: null, last: null, fire: 0, vine: null, passTo: null, big: 0, crazy: 0 });
    const len = F.x1 - F.x0, H = (F.y1 - F.y0) / 2;
    for (const p of m.players) {
      const [d, f] = p.spot;
      const dir = dirOf(p.side);
      let x = ownGoalX(p.side) + dir * Math.max(0.02, Math.min(d * 0.85, 0.42)) * len;
      const y = F.cy + f * H * (d < KEEPER_DEPTH ? 0 : 1);
      // fuera del círculo central
      if (U.dist(x, y, F.cx, F.cy) < 130) x = F.cx - dir * 130;
      Object.assign(p, {
        x, y, z: 0, vx: 0, vy: 0, stun: p.fainted ? p.stun : 0, asleep: false, dash: 0, charge: -1, slam: null,
        status: null, statusT: 0, statusLvl: 0, chan: null, slow: 0,
        pickupCd: 0, holdT: 0, stealT: 0, phase: 0, wall: 0, embers: 0, slip: 0, dig: 0, ram: 0, spinT: 0,
        gkHold: false, gkT: 0, assistFrom: null,
      });
      p.facing = p.side === 0 ? 0 : Math.PI;
      p.ai.chasing = false; p.ai.shotT = 0;
      setAnim(p, 'Idle');
    }
    // saca el jugador de campo más adelantado
    const upfront = (team) => teamOf(m, team).filter((p) => !p.fixedKeeper).reduce((a, q) => (q.spot[0] > a.spot[0] ? q : a));
    const kicker = upfront(k);
    kicker.x = F.cx - dirOf(m.sides[k]) * (radius(kicker) + BALL_R + 3);
    kicker.y = F.cy;
    b.holder = kicker; b.last = kicker;
    m.kicker = kicker;
    // cada humano toma al más adelantado que quede libre (el primero, el que saca)
    for (const h of m.humans) releaseControl(h);
    for (const h of m.humans) {
      if (h.gone) continue;
      const free = teamOf(m, h.team).filter((p) => !p.human && (!p.fixedKeeper || teamOf(m, h.team).length <= 2));
      const pick = free.find((p) => p === kicker) || free.reduce((a, q) => (!a || q.spot[0] > a.spot[0] ? q : a), null);
      if (pick) setControl(m, pick, h);
    }
    updateKeepers(m, true);
    m.items = [];
    m.projs = [];
    m.hazards = [];
    const st = m.stadium;
    for (const [fx, fy] of st.hazards) {
      addHazard(m, { kind: 'lava', x: F.cx + fx * (F.x1 - F.x0) / 2, y: F.cy + fy * H, r: 46 + H * 0.06, life: Infinity, team: -1 });
    }
    for (const team of [0, 1]) if (!hasHuman(m, team) || m.autoSubs) aiSubs(m, team, 40);
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

  // ---------------------------------------------------------------- arquero
  /**
   * Arquero dinámico: el que está más cerca de su arco (de los que pueden) pasa a
   * ser el arquero. Sólo cambia si otro está claramente más cerca, para que no
   * salte de uno a otro a cada paso. Con arquero fijo no hace nada.
   */
  function updateKeepers(m, reset = false) {
    if (m.keeperMode === 'fixed') return;
    for (const team of [0, 1]) {
      const gx = ownGoalX(m.sides[team]);
      const cur = reset ? null : m.keeper[team];
      if (cur && cur.gkHold && m.ball.holder === cur) continue;   // con la pelota en las manos sigue siéndolo
      let best = null, bd = Infinity;
      for (const p of teamOf(m, team)) {
        if (p.stun > 0 || p.slam || p.dig > 0 || m.ball.holder === p) continue;
        const d = U.dist(p.x, p.y, gx, F.cy);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      if (!cur || cur.stun > 0 || cur.slam || m.ball.holder === cur) { m.keeper[team] = best; continue; }
      const dc = U.dist(cur.x, cur.y, gx, F.cy);
      if (best !== cur && bd < dc * 0.75 - 10) m.keeper[team] = best;
    }
  }

  /** El arquero no llega a atraparla: la desvía hacia fuera. */
  function parry(m, p, b) {
    const gx = ownGoalX(p.side);
    const s = Math.hypot(b.vx, b.vy);
    let a = Math.atan2(b.y - F.cy, b.x - gx);
    if (Math.abs(b.y - F.cy) < 20) a += U.pick([-1, 1]) * 0.9;   // de frente: al córner
    a += U.rand(-0.35, 0.35);
    b.vx = Math.cos(a) * Math.max(320, s * 0.45);
    b.vy = Math.sin(a) * Math.max(320, s * 0.45);
    b.x = p.x + Math.cos(a) * (radius(p) * 1.8 + b.r + 2);
    b.y = p.y + Math.sin(a) * (radius(p) * 1.8 + b.r + 2);
    const shot = b.last && b.last.team !== p.team;
    b.last = p;
    p.pickupCd = 0.3;
    if (shot) {
      p.stats.saves++;
      PF.FX.text(m.fx, p.x, p.y - 60, '¡DESVÍO!', '#9cff6b', 1);
      PF.Audio.crowd('ooh', 0.7);
    }
    PF.FX.burst(m.fx, b.x, b.y, 10, '#ffffff', 200);
    PF.Audio.sfx.bounce(700);
    setAnim(p, 'Attack', true);
  }

  // ---------------------------------------------------------------- entrenador de la CPU
  const TACTIC_TEXT = { atk: '¡AL ATAQUE!', def: '¡A DEFENDER!', neutral: '¡EQUILIBRIO!' };

  /**
   * Cada pocos segundos, los equipos de la CPU revisan su táctica: si van
   * perdiendo se van al ataque (más cuanto menos tiempo queda), si ganan
   * sobre el final se cierran atrás, y si no, varían para no ser previsibles.
   */
  function coach(m, dt) {
    if ((m.coachT -= dt) > 0) return;
    m.coachT = U.rand(5, 9);
    const left = m.golden ? 0 : m.time / m.totalTime;   // 1 al empezar, 0 al final
    for (const team of [0, 1]) {
      if (hasHuman(m, team)) continue;
      const diff = m.score[team] - m.score[1 - team];
      let t;
      if (m.golden) t = 'atk';
      else if (diff < 0) t = left < 0.6 || Math.random() < 0.5 ? 'atk' : 'neutral';
      else if (diff > 0 && left < 0.35) t = 'def';
      else if (diff >= 2) t = Math.random() < 0.5 ? 'def' : 'neutral';
      else { const r = Math.random(); t = r < 0.55 ? 'neutral' : r < 0.8 ? 'atk' : 'def'; }
      if (t !== m.tactic[team]) {
        m.tactic[team] = t;
        if (!m.demo) {
          const mates = teamOf(m, team);
          const cx = mates.reduce((s, q) => s + q.x, 0) / mates.length, cy = mates.reduce((s, q) => s + q.y, 0) / mates.length;
          PF.FX.text(m.fx, cx, cy - 80, TACTIC_TEXT[t], PF.TEAM_COLORS[team], 0.8, 1.2);
        }
      }
    }
  }

  /**
   * Rotación: si dos compañeros (de la IA) estarían más cerca de sus puestos
   * intercambiándolos, se los cambian. Así, si un defensa sube con la pelota,
   * el delantero que quedó atrás pasa a cubrir. El arquero fijo no rota.
   */
  function rotate(m, dt) {
    if ((m.rotateT -= dt) > 0) return;
    m.rotateT = 1;
    const swapSpots = (a, c) => {
      [a.spot, c.spot] = [c.spot, a.spot];
      for (const p of [a, c]) { p.pos = PF.zoneRole(p.spot[0]); p.bonus = roleBonus(p.natural, p.pos); }
    };
    // uno sube, otro baja: si el que lleva la pelota pasa por delante de un
    // compañero de puesto más adelantado, se cambian el puesto
    const h = m.ball.holder;
    if (h && !h.fixedKeeper && m.keeper[h.team] !== h) {
      const dir = dirOf(h.side);
      const behind = teamOf(m, h.team).filter((q) => q !== h && !q.fixedKeeper && m.keeper[h.team] !== q && !q.human &&
        q.spot[0] > h.spot[0] + 0.05 && (h.x - q.x) * dir > 120);
      if (behind.length) {
        const q = behind.reduce((a, c) => ((c.x - a.x) * dir < 0 ? c : a));   // el que quedó más atrás
        swapSpots(h, q);
        return;
      }
    }
    for (const team of [0, 1]) {
      // el que lleva la pelota también entra: si un defensa sube con ella, otro baja a cubrir su puesto
      const ps = teamOf(m, team).filter((p) => !p.fixedKeeper && (!p.human || m.ball.holder === p) && m.keeper[team] !== p);
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], c = ps[j];
          const [ax, ay] = homeSpot(m, a), [cx, cy] = homeSpot(m, c);
          const now = U.dist(a.x, a.y, ax, ay) + U.dist(c.x, c.y, cx, cy);
          const swapped = U.dist(a.x, a.y, cx, cy) + U.dist(c.x, c.y, ax, ay);
          if (now > 120 && swapped < now * 0.85) {
            swapSpots(a, c);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- cambios
  /**
   * Cambia al jugador `out` (de m.players) por el suplente `benchIdx`. El que
   * entra ocupa su puesto y su lugar en la cancha; el que sale se sienta y
   * descansa (puede volver a entrar). Devuelve false si no quedan cambios.
   */
  function substitute(m, out, benchIdx) {
    const team = out.team, seat = m.bench[team][benchIdx];
    if (!seat || seat.fainted || m.subsLeft[team] <= 0) return false;   // al K.O. del banco no se lo puede meter
    const np = makePlayer(seat.def, team, out.slot, out.skill, out.spot, out.side);
    Object.assign(np, { x: out.x, y: out.y, facing: out.facing, stamina: seat.stamina, hp: seat.hp, cd: seat.cd ?? np.cd });
    if (m.keeper[team] === out) { m.keeper[team] = np; np.fixedKeeper = out.fixedKeeper; }
    if (m.ball.holder === out) { m.ball.holder = np; np.gkHold = out.gkHold; }
    if (m.ball.passTo === out) m.ball.passTo = np;
    if (m.kicker === out) m.kicker = np;
    if (out.human) { const h = out.ctrl; releaseControl(h); setControl(m, np, h); }
    m.bench[team][benchIdx] = {
      def: out.def, stamina: out.stamina, maxStamina: out.maxStamina, cd: out.cd,
      hp: out.hp, maxHp: out.maxHp, ko: out.ko, fainted: out.fainted,
    };
    m.retired.push(out);
    m.players[m.players.indexOf(out)] = np;
    m.subsLeft[team]--;
    m.rec = [];                          // la repetición no puede mezclar a los dos
    PF.FX.text(m.fx, np.x, np.y - 70, `⇄ ${np.def.name}`, PF.TEAM_COLORS[team], 0.9, 1.4);
    PF.FX.burst(m.fx, np.x, np.y - 20, 14, '#ffffff', 160);
    PF.Audio.sfx.whistle();
    return true;
  }

  /** Qué tan fresco está un jugador o suplente: lo peor entre su energía y su vida. */
  const fresh = (x) => Math.min(energyPct(x), hpPct(x));
  /** El suplente más fresco que supere `need` (sin K.O. ni casi sin vida), o -1. */
  function bestSeat(m, team, need) {
    let best = -1;
    m.bench[team].forEach((s, i) => {
      if (s.fainted || hpPct(s) < 35) return;
      if (fresh(s) > need && (best < 0 || fresh(s) > fresh(m.bench[team][best]))) best = i;
    });
    return best;
  }

  /** La CPU cambia a sus K.O., cansados o maltrechos por el suplente más fresco. */
  function aiSubs(m, team, below) {
    const out = teamOf(m, team).filter((p) => p.fainted || energyPct(p) < below || hpPct(p) < 15);
    out.sort((a, b) => (b.fainted - a.fainted) || (fresh(a) - fresh(b)));
    for (const p of out) {
      if (m.subsLeft[team] <= 0) return;
      const best = bestSeat(m, team, p.fainted ? 40 : fresh(p) + 25);
      if (best >= 0) substitute(m, p, best);
    }
  }

  /**
   * Cambio rápido (tecla F) del equipo `team`, sin pausar: entra el suplente más
   * fresco por un K.O. (primero el que manejabas) o, si nadie está K.O., por el
   * que manejas si está muy golpeado o agotado. Devuelve null si se hizo, o el
   * motivo por el que no.
   */
  function quickSub(m, team, hi = m.view) {
    if (m.subsLeft[team] <= 0) return 'No quedan cambios.';
    if (!m.bench[team].length) return 'No tienes suplentes en este partido.';
    const mine = teamOf(m, team), c = m.humans[hi] && m.humans[hi].controlled;
    let out = mine.find((p) => p.fainted);
    if (!out && c && (hpPct(c) < 40 || energyPct(c) < 25)) out = c;
    if (!out) return 'Nadie para cambiar (R: elegir el cambio).';
    const best = bestSeat(m, team, 0);
    if (best < 0) return 'Ningún suplente está en condiciones.';
    return substitute(m, out, best) ? null : 'No se pudo hacer el cambio.';
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
  /**
   * hi: la intención del humano, o una lista con la de cada uno (m.humans[i]).
   */
  function step(m, dt, hi) {
    const ins = Array.isArray(hi) ? hi : hi ? [hi] : [];
    PF.FX.update(m.fx, dt);
    if (m.shake > 0) m.shake = Math.max(0, m.shake - dt * 40);
    if (m.freeze > 0) { m.freeze -= dt; return; }
    m.clock += dt;
    m.nearT = Math.max(0, m.nearT - dt);

    // la repetición la salta cualquiera de los jugadores
    if (m.state === 'replay') { stepReplay(m, dt, ins.find((x) => x && (x.skip || x.pass)) || null); return; }

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
    for (const bench of m.bench) {
      for (const s of bench) {
        s.stamina = Math.min(s.maxStamina, s.stamina + STAMINA.bench * dt * (s.maxStamina / 100));
        if (s.fainted) {
          s.ko -= dt * HP.koBench;
          if (s.ko <= 0) { s.fainted = false; s.ko = 0; s.hp = Math.ceil(s.maxHp * HP.revive); }
        } else s.hp = Math.min(s.maxHp, s.hp + HP.bench * dt * (s.maxHp / 100));
      }
    }
    if (playing) { coach(m, dt); rotate(m, dt); }
    if (playing && (m.subT -= dt) <= 0) {
      m.subT = 4;
      for (const team of [0, 1]) {
        if (hasHuman(m, team) && !m.autoSubs) continue;
        const far = teamOf(m, team).filter((p) => p.fainted || ((energyPct(p) < 15 || hpPct(p) < 15) && U.dist(p.x, p.y, m.ball.x, m.ball.y) > 450));
        if (far.length) aiSubs(m, team, 15);
      }
    }
    m.humans.forEach((h, i) => {
      const hin = ins[i], c = h.controlled;
      if (!hin || !c) return;
      if (playing && hin.swap) {
        // al compañero más cerca de la pelota (el arquero fijo no entra en la
        // rotación, ni el que maneja otro jugador)
        let best = null, bd = Infinity;
        for (const q of matesOf(m, c)) {
          if (q.fixedKeeper || q.human || q.fainted) continue;
          const d = U.dist(q.x, q.y, m.ball.x, m.ball.y);
          if (d < bd) { bd = d; best = q; }
        }
        if (best) setControl(m, best, h);
      }
      if (hin.order && m.state !== 'end') {
        m.orders[h.team] = (m.orders[h.team] + 1) % ORDERS.length;
        const o = ORDERS[m.orders[h.team]];
        for (const q of matesOf(m, c)) if (!q.human) PF.FX.text(m.fx, q.x, q.y - 70, '¡' + o.label + '!', o.color, 0.8, 0.9);
        PF.Audio.sfx.touch();
      }
    });

    // Las pulsaciones (pase, habilidad) se gastan en un solo Pokémon por paso:
    // si un pase cambia el control al compañero, éste no recibe el mismo "pase".
    const input = ins.slice();
    for (const p of m.players) {
      let it = NO_INTENT, active = playing;
      const wasHuman = p.human, hi2 = p.human && p.ctrl ? p.ctrl.idx : -1;
      if (kicking) {
        active = p === m.kicker && m.stateT > KICKOFF_WAIT;
        if (active) {
          it = p.human ? input[hi2] || NO_INTENT : PF.AI.kickoff(p, m);
          if (m.stateT > KICKOFF_MAX) it = Object.assign({}, NO_INTENT, { pass: true });
          // en el saque sólo se puede pasar: nada de tiros ni habilidades
          it = Object.assign({}, it, { ability: false, press: false, shootHold: false });
        }
      } else if (playing && p.stun <= 0 && !p.slam) {
        it = p.human ? input[hi2] || NO_INTENT : PF.AI.think(p, m, dt);
      }
      applyIntent(m, p, it, dt, active);
      if (kicking) { p.vx = 0; p.vy = 0; }
      if (wasHuman && input[hi2]) input[hi2] = Object.assign({}, input[hi2], { pass: false, passHold: false, ability: false });
    }
    movePlayers(m, dt);
    collidePlayers(m);
    if (playing) updateKeepers(m);
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
      'slip', 'burnCd', 'dig', 'ram', 'spinT', 'magnet', 'diving', 'pressCd', 'diveCd', 'down', 'ko']) {
      p[k] = Math.max(0, p[k] - dt);
    }
    if (p.fainted && p.ko <= 0) revive(m, p);
    if (p.status) statusTick(m, p, dt);
    // habilidades que se sostienen o cargan (Lanzallamas, Llamarada): se cortan si lo aturden
    if (p.chan) {
      if (p.stun > 0 || p.fainted || p.slam) p.chan = null;
      else {
        p.chan.t += dt;
        const id = p.chan.id;
        const done = withHit(m, p, PF.ABILITY_TYPE[id], () => PF.Abilities.tick(m, p, dt));
        if (done || (p.chan && p.chan.t >= p.chan.dur)) p.chan = null;
      }
    }
    // la habilidad sólo recarga con la pelota en juego (no en festejos ni saques)
    if (m.state === 'play') p.cd = Math.max(0, p.cd - dt * fatigue(p));
    // energía: correr gasta (más los pesados) y se recupera siempre, menos cuanto más
    // rápido va: quieto o trotando repone casi todo, y los veloces se reponen antes;
    // fuera de juego se descansa
    if (m.state === 'play') {
      const frac = Math.hypot(p.vx, p.vy) / p.def.speed;
      if (frac > 0.55 && p.stun <= 0) spend(p, STAMINA.run * frac * Math.sqrt(p.def.mass) * dt * (m.keeper[p.team] === p ? 0.5 : 1));
      spend(p, -STAMINA.regen * recov(p) * (1 - 0.75 * Math.min(1, frac)) * dt * (p.maxStamina / 100));
      if (!p.fainted) p.hp = Math.min(p.maxHp, p.hp + HP.regen * dt * (p.maxHp / 100));
      if (p.stamina <= 0 && hasHuman(m, p.team) && !p.tiredWarned) {
        p.tiredWarned = true;
        PF.FX.text(m.fx, p.x, p.y - 70, '¡AGOTADO!', '#ff8a8a', 0.9, 1.4);
      }
    } else spend(p, -STAMINA.rest * dt * (p.maxStamina / 100));
    if (p.stun <= 0) p.asleep = false;
    if (b.holder === p) p.holdT += dt; else p.holdT = 0;
    if (digging && p.dig <= 0) popDig(m, p);

    let mx = it.mx, my = it.my;
    if (p.down > 0 && p.dash <= 0) { mx = 0; my = 0; }   // en el piso tras estirarse
    if (p.chan && p.chan.root) { mx = 0; my = 0; }       // cargando (Llamarada)
    if (p.status === 'conf' && (mx || my)) {             // confuso: se desvía solo
      const ca = Math.cos(p.confAng), sa = Math.sin(p.confAng);
      [mx, my] = [mx * ca - my * sa, mx * sa + my * ca];
    }
    if (p.human) p.aimMy = Math.abs(my) > 0.3 ? Math.sign(my) : 0;

    // presionar: limitado en tiempo y con enfriamiento (ver PRESS_MAX)
    // (si se mantiene apretado, al terminar el enfriamiento hay que soltar y volver a apretar)
    let pressing = false;
    if (!it.press) p.pressLock = false;
    if (it.press && active && p.stun <= 0 && b.holder !== p && p.pressCd <= 0 && !p.pressLock) {
      pressing = true;
      p.pressT += dt;
      spend(p, STAMINA.press * dt);
      if (p.pressT >= PRESS_MAX) endPress(m, p);
    } else if (p.pressT > 0) endPress(m, p);

    // asistencias: presionar, o ir a buscar un pase que viene hacia mí. Al
    // recibir, el que la recibe va a la pelota aunque se esté moviendo (si no,
    // la pelota pasaba de largo y quedaba suelta); la dirección sólo lo corre un poco
    const receiving = p.human && b.passTo === p && !b.holder;
    if (active && p.stun <= 0 && b.holder !== p && (pressing || receiving)) {
      const [tx, ty] = ballTarget(m, p);
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d > 8) {
        const w = pressing ? 0 : Math.min(0.3, Math.hypot(mx, my) * 0.3);
        mx = (dx / d) * (1 - w) + mx * w;
        my = (dy / d) * (1 - w) + my * w;
      }
    }

    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if (p.spinT > 0) p.facing += dt * 16;
    else if (p.dash <= 0 && !p.slam && p.stun <= 0) {
      if (it.aim !== undefined) p.facing = it.aim;
      else if (ml > 0.2) p.facing = Math.atan2(my, mx);
      if (p.status === 'conf') p.facing += p.confAng * 0.35;   // los pases y tiros le salen torcidos
    }

    let sp = p.def.speed * (p.human ? 1 : p.skill.speed) * st.speed * p.bonus.speed * m.mods[p.team].speed * fatigue(p);
    if (b.holder === p) sp *= 0.9;
    if (p.charge >= 0) sp *= 0.55;
    if (p.turbo > 0) sp *= 1.4;
    if (p.giant > 0) sp *= 0.9;
    if (p.phase > 0) sp *= 1.2;
    if (p.dig > 0) sp *= 1.3;
    if (p.slow > 0) sp *= 0.55;
    if (p.status === 'para') sp *= 0.65;
    if (p.chan && p.chan.speed !== undefined) sp *= p.chan.speed;
    if (p.wall > 0) sp *= 0.3;

    if (p.slam) {
      // la trayectoria del salto la lleva movePlayers
    } else if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDx * p.dashSpeed;
      p.vy = p.dashDy * p.dashSpeed;
      // la estirada del arquero termina en seco (si no, se seguía deslizando más allá de la pelota)
      if (p.dash <= 0 && p.diving > 0) { const k = Math.max(0, p.dash + dt) / dt; p.vx *= k; p.vy *= k; }
      if (Math.random() < 0.6) PF.FX.particle(m.fx, p.x, p.y, -p.vx * 0.1, -p.vy * 0.1, '#e9e2c8', 0.3, 4);
    } else if (p.down > 0) {
      p.vx = 0; p.vy = 0;   // en el piso tras estirarse
    } else if (p.stun > 0) {
      const k = U.damp(p.slip > 0 ? 0.8 : st.traction * 0.32, dt);
      p.vx -= p.vx * k; p.vy -= p.vy * k;
    } else {
      const k = U.damp(p.slip > 0 ? 1.3 : st.traction * p.agility, dt);
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

    // arquero: estirada hacia donde va el tiro (la pide la IA). Una sola: después
    // queda un momento en el piso (DIVE_DOWN) y no puede volver a tirarse enseguida
    if (it.dive && p.dash <= 0 && p.diveCd <= 0) {
      const dx = it.dive[0] - p.x, dy = it.dive[1] - p.y, d = Math.hypot(dx, dy) || 1;
      // lo justo para llegar al punto (como mucho DIVE_TIME): si no, se pasaba de largo
      const dur = U.clamp(d / DIVE_SPEED, 0.08, DIVE_TIME);
      p.dash = dur; p.diving = dur + 0.12; p.dashSpeed = DIVE_SPEED;
      p.dashDx = dx / d; p.dashDy = dy / d;
      p.diveCd = DIVE_CD;
      p.down = dur + DIVE_DOWN;
      setAnim(p, 'Attack', true);
      PF.Audio.sfx.swoosh();
    }
    // con la pelota en las manos no se puede quedar para siempre
    if (p.gkHold) {
      p.gkT += dt;
      if (p.gkT > 4) { pass(m, p); return; }
    }

    // sin la energía que cuesta, no hay habilidad ni placaje
    if (it.ability && p.cd <= 0) {
      if (p.status === 'fear') {
        if (p.human && m.clock - (p.noEnergyT || -9) > 1) { p.noEnergyT = m.clock; PF.FX.text(m.fx, p.x, p.y - 60, '¡asustado!', STATUS.fear.color, 0.7, 0.8); PF.Audio.sfx.fail(); }
      } else if (p.stamina < abilityCost(p)) noEnergy(m, p);
      else useAbility(m, p);
    }
    if (b.holder === p) {
      if (it.clear !== undefined) { clearance(m, p, it.clear); return; }
      // pase: el humano lo carga manteniendo la tecla (toque = pase justo; más = más fuerte)
      if (p.human && it.passHold !== undefined) {
        if (it.passHold) { p.passCharge = Math.min(PASS_HOLD_MAX, Math.max(0, p.passCharge) + dt); p.charge = -1; return; }
        if (p.passCharge >= 0) {
          const k = U.clamp((p.passCharge - PASS_HOLD_MIN) / (PASS_HOLD_MAX - PASS_HOLD_MIN), 0, 1);
          p.passCharge = -1;
          pass(m, p, k);
          return;
        }
      } else if (it.pass) { pass(m, p, 0); return; }
      if (it.shootHold) p.charge = Math.min(CHARGE_MAX, Math.max(0, p.charge) + dt);
      else if (p.charge >= 0) shoot(m, p, p.charge / CHARGE_MAX);
    } else {
      p.charge = -1;
      p.passCharge = -1;
      // si me están pasando la pelota, J no es placaje
      if (it.pass && p.tackleCd <= 0 && p.dash <= 0 && b.passTo !== p) {
        if (p.stamina < STAMINA.tackle) noEnergy(m, p);
        else tackle(m, p);
      }
    }
  }

  /** Energía extra de algunas habilidades muy fuertes (además del costo por recarga). */
  const ABILITY_EXTRA = { fireshot: 14.5, blaze: 8 };
  const abilityCost = (p) => STAMINA.ability + p.def.ability.cd * STAMINA.abilityCd + (ABILITY_EXTRA[p.def.ability.id] || 0);
  /** Aviso de "sin energía" (como mucho uno por segundo). */
  function noEnergy(m, p) {
    if (!p.human || m.clock - (p.noEnergyT || -9) < 1) return;
    p.noEnergyT = m.clock;
    PF.FX.text(m.fx, p.x, p.y - 60, 'sin energía...', '#ff8a8a', 0.7, 0.8);
    PF.Audio.sfx.fail();
  }

  function endPress(m, p) {
    p.pressCd = p.pressCdMax = pressCooldown(p.pressT);
    p.pressT = 0;
    p.pressLock = true;
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
      if (p.gkHold && !inBox(p.side, p.x, p.y)) {
        // puede salir del área con la pelota, pero ya sin las manos: la lleva
        // en los pies y desde ahí se la pueden disputar como a cualquiera
        p.gkHold = false;
        p.gkT = 0;
        PF.FX.text(m.fx, p.x, p.y - 64, '¡SIN MANOS!', '#9cff6b', 0.8, 0.9);
      }
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
    if (withHit(m, w, 'rock', () => knock(m, v, nx, ny, 320, 0.4))) {
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
    b.holder = null; b.last = p; b.vx = vx; b.vy = vy; b.vine = null; b.passTo = null; b.passFrom = null;
    b.kickT = m.clock;   // cuándo salió (el arquero de la IA tarda un poco en reaccionar)
    p.pickupCd = 0.3;
    p.charge = -1;
    p.gkHold = false;
  }

  /**
   * Velocidad de salida para que la pelota recorra `d` y llegue con `arrive`
   * px/s, según cómo frena la cancha: el frenado exponencial resta k·d a la
   * velocidad y el de rodadura c·d/v (v ≈ velocidad media).
   */
  const PASS_ARRIVE = 360;
  const PASS_HOLD_MIN = 0.12, PASS_HOLD_MAX = 0.6;   // segundos de tecla: toque … pase a máxima fuerza
  function passSpeed(m, d, arrive = PASS_ARRIVE, max = 1900) {
    const fr = m.stadium.friction;
    const k = 0.95 * fr, c = 45 * fr;
    const v0 = arrive + k * d;
    return U.clamp(v0 + (c * d) / ((v0 + arrive) / 2), 300, max);
  }

  /**
   * Pase. k (0..1) = cuánto se cargó: 0 es el pase justo (llega al compañero
   * a velocidad cómoda); 1 sale 1,6 veces más fuerte (tenso, para pasar entre
   * rivales) y, al hueco, llega mucho más lejos.
   */
  function pass(m, p, k = 0) {
    const b = m.ball;
    const mate = passTarget(m, p);
    if (mate) {
      const tx = mate.x + mate.vx * 0.35, ty = mate.y + mate.vy * 0.35;
      const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(2200, passSpeed(m, d) * (1 + 0.6 * k));
      p.facing = Math.atan2(dy, dx);
      release(m, p, (dx / d) * sp, (dy / d) * sp);
      // el control pasa al que recibe, que va solo a buscarla
      b.passTo = mate; b.passT = 2; b.passFrom = p;
      // (si el que recibe es el compañero humano, cada uno sigue con el suyo)
      if (p.human) setControl(m, mate, p.ctrl);
    } else {
      // pase al hueco: hacia donde miras; sigues controlando al mismo.
      // En el saque sale más flojo, para que no llegue al arco rival.
      const sp = m.state === 'kickoff' ? passSpeed(m, 220, 120) : passSpeed(m, 320 + 420 * k, 260);
      release(m, p, Math.cos(p.facing) * sp, Math.sin(p.facing) * sp);
    }
    setAnim(p, 'Shoot', true);
    spend(p, STAMINA.pass);
    PF.Audio.sfx.pass();
  }

  /** Despeje largo (arquero): hacia `angle`, hasta campo rival, según cómo frena la pelota. */
  function clearance(m, p, angle) {
    const sp = passSpeed(m, (F.x1 - F.x0) * 0.45, 150);
    p.facing = angle;
    release(m, p, Math.cos(angle) * sp, Math.sin(angle) * sp);
    spend(p, STAMINA.shot + STAMINA.shotCharge);
    setAnim(p, 'Attack', true);
    PF.Audio.sfx.kick(1);
    PF.FX.burst(m.fx, m.ball.x, m.ball.y, 10, '#fff', 220, 0.3, 3);
  }

  function shoot(m, p, k) {
    const b = m.ball;
    spend(p, STAMINA.shot + STAMINA.shotCharge * k);
    const aim = shotAim(p);
    // un toque ya sale rápido (más que un pase); cargar le suma fuerza
    const power = U.lerp(SHOT_TAP, SHOT_FULL, k) * p.def.power * p.bonus.power * m.mods[p.team].power * (b.big > 0 ? 0.85 : 1) * (0.75 + 0.25 * fatigue(p)) * (p.status === 'burn' ? 0.85 : 1);
    let sp = 1180 * power;
    const fire = p.fireShot > 0;
    if (fire) sp = 1600 * p.def.power;
    p.facing = aim.a;
    release(m, p, Math.cos(aim.a) * sp, Math.sin(aim.a) * sp);
    setAnim(p, 'Attack', true);
    PF.Audio.sfx.kick(power);
    PF.FX.burst(m.fx, b.x, b.y, fire ? 18 : 8, fire ? '#ff9a3d' : '#fff', 220, 0.3, 3);
    if (fire) {
      p.fireShot = 0;
      b.fire = 1.6;
      b.fireTried = [];
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
    spend(p, STAMINA.tackle);
    setAnim(p, 'Attack', true);
    PF.Audio.sfx.swoosh();
  }

  /** El mejor de los tipos de `a` contra `v` (para los choques, que no son de ninguna habilidad). */
  function bestType(a, v) {
    let best = a.types[0], eff = -1;
    for (const t of a.types) { const e = PF.typeEffect(t, v.types); if (e > eff) { eff = e; best = t; } }
    return best;
  }

  /**
   * Placaje. El peso manda: r = masa del que pega / masa del golpeado.
   *   - el empuje y el aturdimiento escalan con r (un Meowth contra un Snorlax
   *     apenas lo mueve, y rebota él);
   *   - el desgaste (vida) también, más la tabla de tipos y la diferencia de tier (ver hurt);
   *   - si el golpeado lleva la pelota y es más pesado, a veces la conserva.
   */
  function tackleHit(m, a, v, nx, ny) {
    if (a.ram <= 0) { a.dash = 0; a.vx *= 0.2; a.vy *= 0.2; }
    const r = U.clamp(mass(a) / mass(v), 0.25, 3);
    const keepBall = m.ball.holder === v && Math.random() > U.clamp(0.9 * r, 0.25, 1);
    const hit = withHit(m, a, bestType(a, v),
      () => knock(m, v, nx, ny, 340 * Math.min(2.2, r) + 140, 0.9 * U.clamp(Math.pow(r, 1.3), 0.2, 1.6)), { phys: true, ratio: r, keepBall });
    if (!hit) return;
    a.stats.tackles++;
    if (r < 0.8) {
      // rebota contra el más pesado y se tambalea un instante
      a.vx -= nx * 300 * (1 - r); a.vy -= ny * 300 * (1 - r);
      if (r < 0.6) { a.stun = Math.max(a.stun, 0.9 * (0.8 - r)); setAnim(a, 'Hurt'); }
    }
    const word = r < 0.6 ? ['¡Ni le hizo cosquillas!', '¡Pesa demasiado!', '¡Duro como roca!'] : ['¡ZAS!', '¡PAF!', '¡TOMA!', '¡CATAPLÁN!'];
    PF.FX.text(m.fx, v.x, v.y - 50, U.pick(word), '#ffd23f');
    PF.FX.burst(m.fx, v.x, v.y - 12, 12, '#fff', 200);
    PF.Audio.sfx.tackle();
    if (Math.random() < 0.35) PF.Audio.crowd('oh', 0.5);
    m.freeze = 0.07 * Math.min(1, r + 0.3);
    m.shake = Math.max(m.shake, 5 * Math.min(1.2, r + 0.2));
  }

  /**
   * Desgaste por un golpe: le baja la VIDA (y un poco la energía). Si viene de
   * una habilidad o un choque (m.hit = { from, type, phys?, ratio? }), cuenta:
   *   - la tabla de tipos (súper eficaz casi el doble; en los choques, suavizada);
   *   - la diferencia de tier entre los dos (±10 % por escalón, hasta -25 %/+30 %):
   *     un Squirtle le saca más a un Charizard por el tipo, pero no se le sube a la parra;
   *   - en los choques, el peso (ratio): el pesado desgasta más.
   * Devuelve el multiplicador de aturdimiento.
   */
  function hurt(m, v, stun) {
    const h = m.hit, from = h && h.from;
    const raw = h && h.type ? PF.typeEffect(h.type, v.types) : 1;
    const eff = h && h.phys ? U.clamp(Math.sqrt(raw), 0.6, 1.5) : raw;
    const tier = from && from.rank ? U.clamp(1 + 0.1 * (from.rank - v.rank), 0.75, 1.3) : 1;
    const heft = h && h.ratio ? U.clamp(Math.pow(h.ratio, 0.6), 0.3, 1.8) : 1;
    // el fuego derrite al congelado
    if (v.status === 'freeze' && h && h.type === 'fire') {
      v.status = null; v.statusT = 0; v.stun = 0;
      PF.FX.text(m.fx, v.x, v.y - 98, '¡Derretido!', '#ff8a3d', 0.8, 1);
    }
    const base = STAMINA.hit + stun * STAMINA.hitStun;
    v.hp = Math.max(0, v.hp - base * eff * tier * heft * HP.dmg);
    v.hurtT = m.clock;
    spend(v, base * HP.hitStamina * eff);
    if (raw >= 2) PF.FX.text(m.fx, v.x, v.y - 78, '¡Súper eficaz!', '#ffd23f', 0.7, 1);
    else if (raw < 1) PF.FX.text(m.fx, v.x, v.y - 78, 'No es muy eficaz...', '#a9b6d3', 0.6, 1);
    return raw >= 2 ? 1.25 : raw < 1 ? 0.8 : 1;
  }

  /**
   * Intenta dejar `type` en `v` durante `dur` s (con probabilidad `chance`).
   * Devuelve true si quedó. No pisa a un estado que ya tiene (salvo agravar el veneno).
   */
  function applyStatus(m, v, type, dur, chance = 1) {
    const S = STATUS[type];
    if (!S || v.fainted || untouchable(v) || v.gkHold) return false;
    if (S.immune.some((t) => v.types.includes(t))) return false;
    if (v.status && !(type === 'poison' && v.status === 'poison')) return false;
    if (Math.random() >= chance) return false;
    if (v.status === 'poison') { v.statusLvl = Math.min(2, v.statusLvl + 1); v.statusT = Math.max(v.statusT, dur); }
    else { v.status = type; v.statusT = dur; v.statusLvl = 1; }
    if (type === 'freeze') {
      if (m.ball.holder === v) loseBall(m, v, Math.cos(v.facing), Math.sin(v.facing));
      v.stun = Math.max(v.stun, dur); v.vx = 0; v.vy = 0; v.charge = -1; v.dash = 0; v.chan = null;
    }
    PF.FX.text(m.fx, v.x, v.y - 98, S.label + '!', S.color, 0.8, 1.2);
    PF.FX.burst(m.fx, v.x, v.y - 20, 10, S.color, 150);
    return true;
  }

  /** Efecto de cada estado en cada paso. */
  function statusTick(m, p, dt) {
    if (p.fainted) { p.status = null; return; }
    p.statusT -= dt;
    const s = p.status;
    if (s === 'burn' || s === 'poison') {
      const floor = p.maxHp * DOT_FLOOR;
      if (m.state === 'play' && p.hp > floor) {
        p.hp = Math.max(floor, p.hp - p.maxHp * (s === 'burn' ? 0.015 : 0.012 * p.statusLvl) * dt);
        p.hurtT = m.clock;
      }
      if (Math.random() < dt * 8) PF.FX.particle(m.fx, p.x + U.rand(-10, 10), p.y - U.rand(10, 36), 0, -50, STATUS[s].color, 0.4, 3);
    } else if (s === 'para') {
      if (m.state === 'play' && Math.hypot(p.vx, p.vy) > 60 && Math.random() < dt * 0.9) {
        p.down = Math.max(p.down, 0.3);   // se traba
        PF.FX.burst(m.fx, p.x, p.y - 20, 6, '#fff36b', 140);
      }
    } else if (s === 'conf') {
      p.confT -= dt;
      if (p.confT <= 0) { p.confT = 0.4; p.confAng = U.rand(-0.9, 0.9); }
    }
    if (p.statusT <= 0) {
      if (s === 'freeze') p.slow = Math.max(p.slow, 3);
      p.status = null; p.statusLvl = 0;
    }
  }

  /** Sin vida: queda K.O. unos segundos (no se lo puede tocar) y se levanta con 1/3. */
  function faint(m, v) {
    if (v.fainted) return;
    v.fainted = true;
    v.status = null; v.chan = null;
    v.ko = HP.koTime;
    v.stun = v.ko; v.asleep = false;
    v.vx *= 0.3; v.vy *= 0.3;
    v.charge = -1; v.dash = 0; v.pressT = 0;
    if (m.ball.holder === v) loseBall(m, v, Math.cos(v.facing), Math.sin(v.facing));
    setAnim(v, 'Hurt');
    PF.FX.text(m.fx, v.x, v.y - 90, '¡K.O.!', '#ff5a5f', 1.2, 1.6);
    PF.FX.burst(m.fx, v.x, v.y - 20, 16, '#ffffff', 220);
    PF.Audio.sfx.fail();
    // quien lo manejaba pasa al compañero más cercano, y se avisa del cambio rápido
    const h = v.ctrl;
    if (h) {
      let best = null, bd = Infinity;
      for (const q of matesOf(m, v)) {
        if (q.fainted || q.human || q.fixedKeeper) continue;
        const d = U.dist(q.x, q.y, v.x, v.y);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) setControl(m, best, h);
    }
    if (hasHuman(m, v.team) && !m.online && m.bench[v.team].length && m.subsLeft[v.team] > 0) {
      PF.FX.text(m.fx, v.x, v.y - 112, `[${PF.Input.label('quick')}] cambio rápido`, '#ffd23f', 0.9, 2.2);
    }
  }

  function revive(m, p) {
    p.fainted = false;
    p.ko = 0; p.stun = 0;
    p.hp = Math.ceil(p.maxHp * HP.revive);
    PF.FX.text(m.fx, p.x, p.y - 80, '¡De pie!', '#9cff6b', 0.9, 1.2);
    PF.FX.burst(m.fx, p.x, p.y - 20, 10, '#9cff6b', 140);
  }

  /** Ejecuta fn con el contexto de golpe (quién y de qué tipo) para hurt(). */
  function withHit(m, from, type, fn, extra) {
    const prev = m.hit;
    m.hit = Object.assign({ from, type }, extra);
    try { return fn(); } finally { m.hit = prev; }
  }

  /**
   * Bola de fuego contra un rival: chance de frenarla según su tipo (resiste
   * el fuego 65 %, neutro 15 %, débil nada; el arquero en su área +25 %).
   * Se sortea una vez por rival y tiro. Si la frena, se apaga y pierde fuerza.
   */
  function stopsFire(m, p, b) {
    if (b.fireTried && b.fireTried.includes(p)) return false;
    (b.fireTried = b.fireTried || []).push(p);
    const eff = PF.typeEffect('fire', p.types);
    let chance = eff < 1 ? 0.65 : eff > 1 ? 0 : 0.15;
    if (isActiveKeeper(m, p)) chance += 0.25;
    if (Math.random() >= chance) return false;
    b.fire = 0;
    b.vx *= 0.3; b.vy *= 0.3;
    const water = p.types.includes('water');
    PF.FX.text(m.fx, p.x, p.y - 56, water ? '¡APAGADO!' : '¡LO FRENA!', water ? '#8fd8ff' : '#e8e0cc', 1);
    for (let i = 0; i < 18; i++) {
      PF.FX.particle(m.fx, b.x, b.y - 8, U.rand(-90, 90), U.rand(-160, -40), U.pick(['#e8f0ff', '#c9d6ea', '#9fb0c8']), U.rand(0.4, 0.8), U.rand(4, 7));
    }
    PF.Audio.sfx.water();
    return true;
  }

  /**
   * ¿Aguanta el golpe actual (m.hit) por su tipo? Inmune (x0, ej. Eléctrico
   * contra Tierra): nunca le hace nada. Poco eficaz: 50 % de aguantarlo de pie.
   * La tirada vale 0,6 s por víctima y tipo, para que un golpe que toca varios
   * pasos seguidos (zonas, rayos) no se vuelva a sortear en cada uno.
   */
  function resists(m, v) {
    const h = m.hit;
    if (!h || !h.type || h.phys) return false;   // un choque es físico: no hay inmunidad de tipo
    const immune = PF.typeImmune(h.type, v.types);
    const eff = PF.typeEffect(h.type, v.types);
    if (!immune && eff >= 1) return false;
    const r = v.resist;
    if (r && r.type === h.type && m.clock - r.t < 0.6) return r.ok;
    const ok = immune || Math.random() < 0.5;
    v.resist = { type: h.type, t: m.clock, ok };
    if (ok) PF.FX.text(m.fx, v.x, v.y - 72, immune ? '¡No le afecta!' : '¡Resiste!', '#a9b6d3', 0.7, 0.9);
    return ok;
  }

  /** Empuja y aturde. Si tenía la pelota, la suelta. Devuelve false si no le afecta. */
  function knock(m, v, nx, ny, force, stun) {
    if (untouchable(v) || v.wall > 0 || v.gkHold) return false;   // al arquero con la pelota en las manos no se le toca
    if (resists(m, v)) return false;
    if (m.ball.holder === v && !(m.hit && m.hit.keepBall)) loseBall(m, v, nx, ny);
    v.vx = nx * force; v.vy = ny * force;
    const k = hurt(m, v, stun);
    v.stun = Math.max(v.stun, stun * k);
    v.charge = -1; v.dash = 0;
    setAnim(v, 'Hurt');
    if (v.hp <= 0) faint(m, v);
    return true;
  }

  function stunInPlace(m, v, stun) {
    if (untouchable(v) || v.gkHold) return false;
    if (resists(m, v)) return false;
    if (m.ball.holder === v) loseBall(m, v, Math.cos(v.facing), Math.sin(v.facing));
    v.vx *= 0.15; v.vy *= 0.15;
    const k = hurt(m, v, stun);
    v.stun = Math.max(v.stun, stun * k);
    v.charge = -1; v.dash = 0;
    setAnim(v, 'Hurt');
    if (v.hp <= 0) faint(m, v);
    return true;
  }

  function loseBall(m, p, nx, ny) {
    const b = m.ball;
    b.holder = null; b.last = p; b.passTo = null; b.passFrom = null;
    p.gkHold = false;
    const a = Math.atan2(ny, nx) + U.rand(-0.7, 0.7);
    b.vx = Math.cos(a) * 260 + p.vx * 0.2;
    b.vy = Math.sin(a) * 260 + p.vy * 0.2;
    p.pickupCd = 0.6;
    p.charge = -1;
  }

  function take(m, p) {
    const b = m.ball;
    if (b.holder && b.holder !== p) { b.holder.charge = -1; b.holder.gkHold = false; }
    // asistencia: si me la pasó un compañero, el gol que haga cuenta para él
    p.assistFrom = b.passFrom && b.passFrom.team === p.team && b.passFrom !== p ? b.passFrom : null;
    p.assistT = m.clock;
    b.holder = p; b.last = p; b.vine = null; b.fire = 0; b.passTo = null; b.passFrom = null;
    p.holdT = 0;
    // el arquero en su área la agarra con las manos
    p.gkHold = isActiveKeeper(m, p) && m.state === 'play';
    p.gkT = 0;
    PF.Audio.sfx.touch();
    // la agarra un compañero de la IA: pasa a manejarlo el humano de ese equipo
    // (en cooperativo, el que estaba más cerca)
    if (!p.human && m.state === 'play') {
      let h = null, hd = Infinity;
      for (const x of m.humans) {
        if (x.team !== p.team || x.gone) continue;
        const d = x.controlled ? U.dist(x.controlled.x, x.controlled.y, p.x, p.y) : 0;
        if (d < hd) { hd = d; h = x; }
      }
      if (h) setControl(m, p, h);
    }
  }

  function useAbility(m, p) {
    const id = p.def.ability.id;
    const fn = PF.Abilities[id];
    const ok = withHit(m, p, PF.ABILITY_TYPE[id], () => fn(m, p));
    if (ok !== false) spend(p, abilityCost(p));
    // el agua apaga la quemadura propia
    if (ok !== false && p.status === 'burn' && PF.ABILITY_TYPE[id] === 'water') {
      p.status = null; p.statusT = 0;
      PF.FX.text(m.fx, p.x, p.y - 80, '¡Refrescado!', '#8fd8ff', 0.8, 1);
    }
    p.cd = ok === false ? 1.2 : p.def.ability.cd * p.bonus.cd * m.mods[p.team].cd;
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
    return withHit(m, p, 'normal', () => landSlamInner(m, p, soft));
  }
  function landSlamInner(m, p, soft) {
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
    if (b.holder !== p && !(b.holder && b.holder.gkHold)) {
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
    return withHit(m, p, 'ground', () => popDigInner(m, p));
  }
  function popDigInner(m, p) {
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
    m.projs.push(Object.assign({ t: 0, r: 12, dead: false, hit: m.hit }, pr));
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
      // chorro que desvía la pelota (Pistola Agua)
      const b = m.ball;
      if (pr.pushBall && !(b.holder && (b.holder.gkHold || b.holder.team === pr.team)) &&
          U.dist(pr.x, pr.y, b.x, b.y) < pr.r + b.r + 6) {
        if (b.holder) { b.holder.pickupCd = 0.6; b.holder.charge = -1; b.holder = null; }
        const s = Math.hypot(pr.vx, pr.vy) || 1;
        b.vx = (pr.vx / s) * 760; b.vy = (pr.vy / s) * 760; b.last = pr.hit && pr.hit.from; b.vine = null;
        PF.FX.text(m.fx, b.x, b.y - 30, pr.hitText || '¡PAM!', pr.color, 0.8);
        pr.dead = true;
        continue;
      }
      for (const q of m.players) {
        if (q.team === pr.team || q.stun > 0 || untouchable(q)) continue;
        if (U.dist(pr.x, pr.y, q.x, q.y - 10) > radius(q) + pr.r) continue;
        const s = Math.hypot(pr.vx, pr.vy) || 1;
        // inPlace: no lo empuja (ondas, burbujas), sólo lo aturde y le deja el estado
        const hit = withHit(m, pr.hit && pr.hit.from, pr.hit && pr.hit.type,
          () => (pr.inPlace ? stunInPlace(m, q, pr.stun) : knock(m, q, pr.vx / s, pr.vy / s, pr.force || 220, pr.stun)));
        if (hit) {
          PF.FX.burst(m.fx, q.x, q.y - 14, 14, pr.color, 220);
          PF.FX.text(m.fx, q.x, q.y - 50, pr.hitText || '¡PAM!', pr.color, 0.9);
          PF.Audio.sfx.tackle();
          if (pr.status) applyStatus(m, q, pr.status, pr.statusDur || 4, pr.statusChance ?? 1);
          if (pr.slowT) q.slow = Math.max(q.slow, pr.slowT);
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
    h.ctx = m.hit || { from: null, type: h.kind === 'lava' ? 'fire' : null };
    h.t = 0;
    h.hit = new Set();
    h.next = new Map();   // Giro Fuego: cuándo vuelve a lastimar a cada uno
    m.hazards.push(h);
  }

  function updateHazards(m, dt, playing) {
    for (const h of m.hazards) h.t += dt;
    m.hazards = m.hazards.filter((h) => h.t < h.life);
    if (!playing) return;
    for (const h of m.hazards) {
      m.hit = h.ctx;
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
        } else if (h.kind === 'firespin') {
          p.slow = Math.max(p.slow, 0.3);
          if (h.t >= (h.next.get(p) || 0)) {
            h.next.set(p, h.t + 0.7);
            if (stunInPlace(m, p, 0.2)) {
              PF.FX.burst(m.fx, p.x, p.y - 12, 8, '#ff9a3d', 160);
              applyStatus(m, p, 'burn', 4, 0.5);
            }
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
    m.hit = null;
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
      // en las manos del arquero la pelota no puede cruzar la línea (nada de autogol)
      if (p.gkHold) b.x = U.clamp(b.x, F.x0 + b.r + 2, F.x1 - b.r - 2);
      // robo: un rival que aguanta en contacto con la pelota se la queda
      if (playing && p.phase <= 0 && p.dig <= 0 && !p.gkHold) {
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
      // el arquero en su área llega más lejos con las manos (y más aún estirándose)
      const keeper = playing && isActiveKeeper(m, p) && p.stun <= 0;
      const pr = radius(p) * (keeper ? (p.diving > 0 ? 2.0 : 1.6) : 1);
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d >= pr + b.r) continue;
      const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;

      if (keeper && b.fire <= 0 && p.pickupCd <= 0) {
        // la velocidad del tiro, no la relativa: estirándose hacia donde va la
        // pelota no se vuelve más fácil de atrapar un tiro fuerte
        const rel = Math.hypot(b.vx, b.vy);
        if (rel < catchSpeed(m, p)) {
          const shot = b.last && b.last.team !== p.team && rel > 450;
          take(m, p);
          if (shot) {
            p.stats.saves++;
            PF.FX.text(m.fx, p.x, p.y - 60, '¡ATAJADA!', '#9cff6b', 1.1);
            PF.Audio.crowd('ooh', 0.6);
          }
          return true;
        }
        parry(m, p, b);
        continue;
      }

      if (b.fire > 0 && b.last && p.team !== b.last.team && p.stun <= 0 && stopsFire(m, p, b)) {
        // la frenó: si es el arquero, la ataja; si no, sigue como pelota común
        if (keeper && p.pickupCd <= 0) {
          take(m, p);
          p.stats.saves++;
          PF.FX.text(m.fx, p.x, p.y - 60, '¡ATAJADA!', '#9cff6b', 1.1);
          PF.Audio.crowd('ooh', 0.8);
          return true;
        }
      }
      if (b.fire > 0 && b.last) {
        // la bola de fuego atraviesa: derriba rivales e ignora compañeros
        if (p.team !== b.last.team && p.stun <= 0) {
          const s = Math.hypot(b.vx, b.vy) || 1;
          if (withHit(m, b.last, 'fire', () => knock(m, p, b.vx / s, b.vy / s, 520, 1.2))) {
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
    if (b.holder && b.holder.gkHold) return;
    let team = -1;
    if (Math.abs(b.y - F.cy) < F.goalHalf + b.r) {
      if (b.x < F.x0 - b.r) team = m.sides.indexOf(1);        // entró en el arco izquierdo: marca el de la derecha
      else if (b.x > F.x1 + b.r) team = m.sides.indexOf(0);
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
    if (b.last && !m.ownGoal) {
      b.last.stats.goals++;
      const a = b.last.assistFrom;
      if (a && m.clock - b.last.assistT < 10) a.stats.assists++;
    }
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

  /** Orden vigente para el Pokémon p: la tecla T en tu equipo, la táctica del entrenador en la CPU. */
  const orderOf = (m, p) => (hasHuman(m, p.team) ? (p.human ? 'neutral' : ORDERS[m.orders[p.team]].id) : m.tactic[p.team]);

  return {
    create, step, CHARGE_MAX, PASS_HOLD_MIN, PASS_HOLD_MAX, ORDERS, orderOf, PRESETS, KEEPER_DEPTH, autoFormation,
    substitute, quickSub, fatigue, energyPct, hpPct, TIRED, SUBS_PER_MATCH,
    inBox, isActiveKeeper, keeperOf, ownGoalX, dirOf,
    // usados por abilities.js, ai.js y render.js
    applyStatus, STATUS, radius, mass, untouchable, mateOf, matesOf, teamOf, setAnim, knock, stunInPlace, loseBall, shoot,
    addHazard, addProjectile, jump, nearestFoeDist, homeSpot, shotAim, passTarget, laneClear, bestShot,
    updateCamera, hasHuman, makePlayer, PRESS_MAX, dropHuman, abilityCost,
  };
})();
