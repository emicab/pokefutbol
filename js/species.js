/* ============ species.js — especies, roles, evoluciones y gimnasios ============
 * Stats de cancha generados desde la Pokédex (pokedex.js), así cualquier
 * Pokémon importado es jugable sin escribir nada a mano:
 *   speed  ← velocidad base        power ← ataque
 *   mass   ← PS, total de stats y tipo (roca/acero/tierra pesan más)
 *   radius ← tamaño del sprite     habilidades ← su línea evolutiva o su tipo
 * El modo historia usa estas especies; el partido rápido usa PF.ROSTER
 * (ajustado a mano).
 */
(() => {
  const TYPE_ES = {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', ice: 'Hielo',
    fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
  };
  const TYPE_COLOR = {
    normal: '#c9b79c', fire: '#ff8a3d', water: '#59b8ff', grass: '#5fd68a', electric: '#f6d32d', ice: '#7fd4f0',
    fighting: '#d0604a', poison: '#b06fd0', ground: '#d9b56a', flying: '#9fb6ff', psychic: '#ff7fb0', bug: '#a8c840',
    rock: '#b8a26a', ghost: '#8a7bd0', dragon: '#7a6aff', dark: '#7a6a60', steel: '#a9b8c8', fairy: '#ff9ccf',
  };
  /** Habilidades por tipo, para especies sin habilidades propias. */
  const TYPE_ABILITIES = {
    normal: ['quick', 'slam'], fire: ['fireshot', 'embers', 'flamethrower', 'firespin', 'blaze'],
    water: ['hydro', 'puddle', 'watergun', 'bubble'], grass: ['vine', 'sleep'],
    electric: ['zap', 'quick', 'thunderwave', 'bolt'], ice: ['ice', 'surf'], fighting: ['punch', 'throw'], poison: ['sleep', 'embers'],
    ground: ['dig', 'wall'], flying: ['quick', 'jump'], psychic: ['confusion', 'psywave'], bug: ['pinmissile', 'quick'],
    rock: ['wall', 'dig'], ghost: ['phase', 'teleport'], dragon: ['surf', 'psywave'], dark: ['teleport', 'shuriken'],
    steel: ['wall', 'aura'], fairy: ['sing', 'roll'],
  };

  /** Evoluciones: a qué y a qué nivel. `options` = se elige (Eevee). */
  const EVOLVE = {
    4: { to: 5, level: 16 }, 5: { to: 6, level: 36 },
    7: { to: 8, level: 16 }, 8: { to: 9, level: 36 },
    1: { to: 2, level: 16 }, 2: { to: 3, level: 32 },
    25: { to: 26, level: 30 },
    129: { to: 130, level: 20 },
    133: { options: [134, 135, 136], level: 25 },
    54: { to: 55, level: 33 },
    39: { to: 40, level: 30 },
    66: { to: 67, level: 28 }, 67: { to: 68, level: 40 },
    92: { to: 93, level: 25 }, 93: { to: 94, level: 38 },
    16: { to: 17, level: 18 }, 17: { to: 18, level: 36 },
    19: { to: 20, level: 20 },
    74: { to: 75, level: 25 }, 75: { to: 76, level: 40 },
    63: { to: 64, level: 16 }, 64: { to: 65, level: 36 },
    58: { to: 59, level: 30 },
    120: { to: 121, level: 28 },
    100: { to: 101, level: 30 },
    43: { to: 44, level: 21 }, 44: { to: 45, level: 36 },
    111: { to: 112, level: 42 },
    77: { to: 78, level: 40 },
  };

  // forma base de cada línea (para heredar habilidades)
  const prev = {};
  for (const [from, e] of Object.entries(EVOLVE)) for (const to of e.options || [e.to]) prev[to] = +from;
  const baseOf = (dex) => (prev[dex] ? baseOf(prev[dex]) : dex);
  const lineOf = (dex) => {
    const out = [];
    const walk = (d) => { out.push(d); const e = EVOLVE[d]; if (e) for (const t of e.options || [e.to]) walk(t); };
    walk(baseOf(dex));
    return out;
  };

  /** Catálogo de habilidades (nombre, recarga, descripción) sacado del plantel. */
  const ABILITY_INFO = {};
  for (const r of PF.ROSTER) for (const a of r.abilities) if (!ABILITY_INFO[a.id]) ABILITY_INFO[a.id] = a;
  // nombres más genéricos para las que se reparten por tipo
  Object.assign(ABILITY_INFO, {
    teleport: { id: 'teleport', name: 'Teletransporte', cd: 6, desc: 'Desapareces y reapareces más adelante, con la pelota incluida.' },
    quick: { id: 'quick', name: 'Ataque Rápido', cd: 5, desc: 'Embestida veloz sin soltar la pelota: arrolla a quien se cruce.' },
    pinmissile: { id: 'pinmissile', name: 'Pin Misil', cd: 9, desc: 'Cinco agujas en abanico que aturden al que tocan.' },
    shuriken: { id: 'shuriken', name: 'Shuriken de Agua', cd: 8, desc: 'Tres estrellas de agua en abanico que tumban al que tocan.' },
    aura: { id: 'aura', name: 'Esfera Aural', cd: 9, desc: 'Esfera que persigue al rival más cercano y lo tumba.' },
    // ---- con estados (Quemado, Paralizado...: ver STATUS en match.js)
    flamethrower: { id: 'flamethrower', name: 'Lanzallamas', cd: 7, desc: 'Chorro de fuego en cono corto durante 1 s: hace soltar la pelota y puede dejar Quemado (pierde vida y tira más flojo). Te mueves lento mientras lo usas.' },
    firespin: { id: 'firespin', name: 'Giro Fuego', cd: 9, desc: 'Remolino de fuego delante que frena a los que entran, los lastima y puede quemarlos.' },
    blaze: { id: 'blaze', name: 'Llamarada', cd: 12, desc: 'Cargas 0,6 s quieto y estalla en un radio grande: empuja y aturde, puede quemar. Gasta mucha energía.' },
    watergun: { id: 'watergun', name: 'Pistola Agua', cd: 5, desc: 'Chorro rápido y recto: empuja al rival que toca y desvía la pelota. Apaga tu Quemadura.' },
    bubble: { id: 'bubble', name: 'Burbuja', cd: 8, desc: 'Burbuja lenta que atrapa al primero que toca: lo frena 2,5 s. Apaga tu Quemadura.' },
    thunderwave: { id: 'thunderwave', name: 'Onda Trueno', cd: 8, desc: 'Onda lenta que, si toca, deja Paralizado al rival (más lento y a veces se traba). Inofensiva contra Eléctricos y Tierra.' },
    bolt: { id: 'bolt', name: 'Rayo', cd: 9, desc: 'Rayo instantáneo en línea que atraviesa a todos los rivales delante: aturde y a veces Paraliza.' },
  });

  /** Evoluciones que cambian tanto que no heredan (Gyarados no salpica; las Eeveelutions son de su tipo). */
  const NO_INHERIT = new Set([130, 134, 135, 136]);

  function abilitiesFor(dex, types) {
    // (el modo historia usa dos; los movimientos extra de las evoluciones son del partido rápido)
    const own = PF.ROSTER.find((x) => x.dex === dex);
    if (own) return own.abilities.slice(0, 2);
    // 1) alguien de su línea está en el plantel a mano: hereda sus habilidades
    for (const d of NO_INHERIT.has(dex) ? [] : lineOf(dex)) {
      const r = PF.ROSTER.find((x) => x.dex === d);
      if (r) return r.abilities.slice(0, 2);
    }
    // 2) por tipo: la primera de cada tipo, o las dos del único tipo (cada especie
    //    con su propio orden dentro del tipo: ver poolFor)
    const t1 = poolFor(dex, types[0]);
    const t2 = types[1] && TYPE_ABILITIES[types[1]] && poolFor(dex, types[1]);
    const ids = t2 && t2[0] !== t1[0] ? [t1[0], t2[0]] : t1.slice(0, 2);
    return ids.map((id) => ABILITY_INFO[id] || ABILITY_INFO.quick);
  }

  /**
   * Las habilidades de un tipo en el orden de esta especie: se barajan con un
   * valor fijo sacado de su número de Pokédex, así dos Pokémon del mismo tipo
   * no reciben siempre las mismas (y siempre las mismas cada vez que se juega).
   */
  function poolFor(dex, type) {
    const base = TYPE_ABILITIES[type] || TYPE_ABILITIES.normal;
    const h = (id) => {
      let x = (dex * 2654435761 + id.length * 40503 + id.charCodeAt(0) * 9973 + id.charCodeAt(id.length - 1) * 131) >>> 0;
      x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
      return x;
    };
    return base.slice().sort((a, b) => h(a) - h(b));
  }

  const cache = {};
  /** Definición de cancha de una especie (stats base, sin nivel). */
  PF.species = (dex) => {
    if (cache[dex]) return cache[dex];
    const d = PF.POKEDEX[dex];
    if (!d) throw new Error('Especie sin datos: ' + dex);
    const heavy = d.types.some((t) => t === 'rock' || t === 'steel' || t === 'ground') ? 0.6 : 0;
    // tope 2,8 (Onix): Chansey, con PS enormes, sería una pared imposible de mover
    const mass = Math.min(2.8, 0.75 + ((d.hp - 79) / 63) * 2 + Math.max(0, d.bst - 450) / 230 * 0.4 + heavy);
    const walk = PF.SPRITE_META[dex] && PF.SPRITE_META[dex].a.Walk;
    const h = walk ? walk.h : 40;
    const radius = Math.round(Math.min(30, Math.max(16 + (mass - 0.75) * 4, 12 + h * 0.2)));
    const roster = PF.ROSTER.find((r) => r.dex === dex);
    const def = {
      id: 's' + dex, dex, name: d.name,
      type: TYPE_ES[d.types[0]] || d.types[0], types: d.types,
      color: TYPE_COLOR[d.types[0]] || '#c9b79c',
      speed: Math.round(230 + (d.spd - 80) * 2.3),
      power: +(0.8 + (d.atk - 0.78) * 0.92).toFixed(2),
      mass: +mass.toFixed(2),
      radius,
      scale: Math.min(1, 58 / h),
      abilities: abilitiesFor(dex, d.types),
      role: roster && roster.role,
      evolve: EVOLVE[dex] || null,
    };
    cache[dex] = def;
    return def;
  };

  PF.TYPE_ES = TYPE_ES;
  PF.EVOLVE = EVOLVE;

  // ------------------------------------------------------------------ tabla de tipos
  /** Ataque → tipos defensores con ×2, ×0,5 y ×0 (aquí ×0,25: casi no le afecta). */
  const CHART = {
    normal: { half: ['rock', 'steel'], zero: ['ghost'] },
    fire: { double: ['grass', 'ice', 'bug', 'steel'], half: ['fire', 'water', 'rock', 'dragon'] },
    water: { double: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'] },
    electric: { double: ['water', 'flying'], half: ['electric', 'grass', 'dragon'], zero: ['ground'] },
    grass: { double: ['water', 'ground', 'rock'], half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
    ice: { double: ['grass', 'ground', 'flying', 'dragon'], half: ['fire', 'water', 'ice', 'steel'] },
    fighting: { double: ['normal', 'ice', 'rock', 'dark', 'steel'], half: ['poison', 'flying', 'psychic', 'bug', 'fairy'], zero: ['ghost'] },
    poison: { double: ['grass', 'fairy'], half: ['poison', 'ground', 'rock', 'ghost'], zero: ['steel'] },
    ground: { double: ['fire', 'electric', 'poison', 'rock', 'steel'], half: ['grass', 'bug'], zero: ['flying'] },
    flying: { double: ['grass', 'fighting', 'bug'], half: ['electric', 'rock', 'steel'] },
    psychic: { double: ['fighting', 'poison'], half: ['psychic', 'steel'], zero: ['dark'] },
    bug: { double: ['grass', 'psychic', 'dark'], half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
    rock: { double: ['fire', 'ice', 'flying', 'bug'], half: ['fighting', 'ground', 'steel'] },
    ghost: { double: ['psychic', 'ghost'], half: ['dark'], zero: ['normal'] },
    dragon: { double: ['dragon'], half: ['steel'], zero: ['fairy'] },
    dark: { double: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'] },
    steel: { double: ['ice', 'rock', 'fairy'], half: ['fire', 'water', 'electric', 'steel'] },
    fairy: { double: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'] },
  };

  /** Multiplicador de un ataque de tipo `att` contra un Pokémon de tipos `defTypes`. */
  PF.typeEffect = (att, defTypes) => {
    const c = CHART[att];
    if (!c) return 1;
    let k = 1;
    for (const t of defTypes || []) {
      if (c.double && c.double.includes(t)) k *= 2;
      else if (c.half && c.half.includes(t)) k *= 0.5;
      else if (c.zero && c.zero.includes(t)) k *= 0.25;
    }
    return k;
  };
  /** ¿Inmune según la tabla? (ej. Eléctrico contra Tierra). typeEffect lo suaviza a ×0,25. */
  PF.typeImmune = (att, defTypes) => {
    const c = CHART[att];
    return !!(c && c.zero && (defTypes || []).some((t) => c.zero.includes(t)));
  };

  /** Tipo de cada habilidad (para la efectividad de sus golpes). */
  PF.ABILITY_TYPE = {
    zap: 'electric', quick: 'normal', fireshot: 'fire', embers: 'fire', hydro: 'water', puddle: 'water',
    vine: 'grass', sleep: 'grass', phase: 'ghost', teleport: 'ghost', slam: 'normal', wall: 'rock',
    confusion: 'psychic', sing: 'fairy', roll: 'fairy', throw: 'fighting', punch: 'fighting', ice: 'ice',
    surf: 'water', dig: 'ground', aura: 'fighting', shuriken: 'water', splash: 'water', jump: 'normal',
    psychic: 'psychic', psywave: 'psychic', adapt: null, psybeam: 'psychic', pinmissile: 'bug',
    flamethrower: 'fire', firespin: 'fire', blaze: 'fire', watergun: 'water', bubble: 'water',
    thunderwave: 'electric', bolt: 'electric',
  };

  /**
   * Energía máxima (aguante) según los PS: de ~70 (Magikarp, Pikachu) a ~130
   * (Snorlax, Lapras). En el modo historia además sube con el nivel (career.js
   * la deja en def.stamina).
   */
  PF.staminaMax = (def) => {
    if (def.stamina) return def.stamina;
    const hp = def.hp || (PF.POKEDEX[def.dex] && PF.POKEDEX[def.dex].hp) || 90;
    return Math.round(Math.max(65, Math.min(135, 70 + (hp - 79) * 0.95)));
  };

  /**
   * Vida (aguante a los golpes), aparte de la energía: de 60 (Pikachu, Magikarp)
   * a ~140 (Chansey, Snorlax). Se pierde con choques y habilidades; en 0 el
   * Pokémon queda K.O. unos segundos. En el modo historia sube con el nivel
   * (career.js la deja en def.hpMax).
   */
  PF.hpMax = (def) => {
    if (def.hpMax) return def.hpMax;
    const d = PF.POKEDEX[def.dex];
    const hp = def.hp || (d && d.hp) || 90, bst = (d && d.bst) || 450;
    return Math.round(Math.max(60, Math.min(140, 66 + (hp - 79) * 0.8 + (bst - 450) * 0.04)));
  };

  /** Agilidad (cuánto tarda en acelerar y frenar) según la velocidad: 0,85 lentos … 1,15 rápidos. */
  PF.agility = (def) => 0.85 + 0.3 * Math.max(0, Math.min(1, (def.speed - 230) / 120));

  /** Tipos de un Pokémon (del plantel o de la Pokédex). */
  PF.typesOf = (def) => def.types || (PF.POKEDEX[def.dex] && PF.POKEDEX[def.dex].types) || ['normal'];

  // ------------------------------------------------------------------ roles
  PF.ROLES = {
    POR: { label: 'Arquero', short: 'POR', color: '#9cff6b' },
    DEF: { label: 'Defensa', short: 'DEF', color: '#59d0ff' },
    MED: { label: 'Medio', short: 'MED', color: '#ffd23f' },
    DEL: { label: 'Delantero', short: 'DEL', color: '#ff8a3d' },
  };

  /** Afinidad con cada puesto según stats: pesado → arco/defensa, tiro → delantero... */
  PF.roleScores = (d) => {
    const s = (d.speed - 230) / 120, pw = (d.power - 0.75) / 0.55, ms = (d.mass - 0.8) / 2;
    return {
      POR: ms * 1.4 + (1 - s) * 0.5,
      DEF: ms * 0.9 + (1 - s) * 0.2 + (1 - pw) * 0.3 + 0.15,
      MED: 0.55 + 0.3 * s - 0.3 * Math.abs(pw - 0.5),
      DEL: pw * 0.75 + s * 0.55,
    };
  };

  /** Puesto natural: el que fija el plantel a mano, o el de mayor afinidad. */
  PF.naturalRole = (d) => {
    if (d.role) return d.role;
    const sc = PF.roleScores(d);
    return Object.keys(sc).reduce((a, b) => (sc[b] > sc[a] ? b : a));
  };

  /** Puesto de una posición de la pizarra según la profundidad (0 = arco propio). */
  PF.zoneRole = (depth) => (depth < 0.1 ? 'POR' : depth < 0.34 ? 'DEF' : depth < 0.56 ? 'MED' : 'DEL');

  // ------------------------------------------------------------------ plantel completo (Gen 1)
  /**
   * Familias de la primera generación (sólo evoluciones de la Gen 1), para
   * saber la fase de cada uno. Eevee: sus tres evoluciones son fase 2.
   */
  const FAMILIES = [
    [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18], [19, 20], [21, 22], [23, 24],
    [25, 26], [27, 28], [29, 30, 31], [32, 33, 34], [35, 36], [37, 38], [39, 40], [41, 42], [43, 44, 45],
    [46, 47], [48, 49], [50, 51], [52, 53], [54, 55], [56, 57], [58, 59], [60, 61, 62], [63, 64, 65],
    [66, 67, 68], [69, 70, 71], [72, 73], [74, 75, 76], [77, 78], [79, 80], [81, 82], [83], [84, 85],
    [86, 87], [88, 89], [90, 91], [92, 93, 94], [95], [96, 97], [98, 99], [100, 101], [102, 103], [104, 105],
    [106], [107], [108], [109, 110], [111, 112], [113], [114], [115], [116, 117], [118, 119], [120, 121],
    [122], [123], [124], [125], [126], [127], [128], [129, 130], [131], [132], [133, 134], [135], [136],
    [137], [138, 139], [140, 141], [142], [143], [144], [145], [146], [147, 148, 149], [150], [151],
  ];
  const STAGE = {}, SINGLE = new Set();
  for (const f of FAMILIES) {
    f.forEach((d, i) => { STAGE[d] = i + 1; });
    if (f.length === 1) SINGLE.add(f[0]);
  }
  STAGE[135] = STAGE[136] = 2; SINGLE.delete(135); SINGLE.delete(136);   // Jolteon y Flareon también vienen de Eevee

  /** Legendarios: se ganan con un reto (ver PF.CHALLENGES). */
  const LEGENDS = {
    144: { challenge: 'bigWins3', label: 'Gana 3 partidos por 3 goles o más' },
    145: { challenge: 'goals50', label: 'Mete 50 goles' },
    146: { challenge: 'won15', label: 'Gana 15 partidos' },
    150: { challenge: 'hardWin', label: 'Gana un partido en Difícil' },
    151: { challenge: 'hardWins5', label: 'Gana 5 partidos en Difícil' },
  };
  /** Los más poderosos (fuera de los legendarios). */
  const ELITE = new Set([130, 143, 149]);

  /**
   * Tiers del partido rápido:
   *   f1      fase 1 (sin preevolución en la Gen 1): 80 monedas (gratis los iniciales: FREE)
   *   f2      fase 2: 150, teniendo su preevolución y 5 partidos con ella
   *   f3      fase 3: 300, teniendo su fase 2 y 8 partidos con ella
   *   strong  sin evolución pero fuerte (stats ≥ 490): 300
   *   elite   Dragonite, Gyarados, Snorlax: 500 (+ requisito de evolución si tienen)
   *   legend  legendarios: por reto
   * abil = precio de la segunda habilidad (las siguientes, algo más: PF.abilityPrice).
   * moves = cuántas habilidades tiene (las evoluciones aprenden más).
   */
  const TIERS = {
    f1: { id: 'f1', label: 'Fase 1', price: 80, abil: 60, moves: 2 },
    f2: { id: 'f2', label: 'Fase 2', price: 150, abil: 90, moves: 3 },
    f3: { id: 'f3', label: 'Fase 3', price: 300, abil: 120, moves: 4 },
    strong: { id: 'strong', label: 'Fuerte', price: 300, abil: 120, moves: 3 },
    elite: { id: 'elite', label: 'Élite', price: 500, abil: 150, moves: 4 },
    legend: { id: 'legend', label: 'Legendario', price: 0, abil: 200, moves: 4 },
  };
  /** Los iniciales de siempre: los únicos que vienen desde el principio. */
  const FREE = new Set([1, 4, 7, 25]);
  /** Partidos con la preevolución para poder comprar la evolución, según su fase. */
  const PLAYS_TO_EVOLVE = { 2: 5, 3: 8 };
  // preevolución de cada uno (Gen 1)
  const PREV = {};
  for (const f of FAMILIES) for (let i = 1; i < f.length; i++) PREV[f[i]] = f[i - 1];
  PREV[135] = PREV[136] = 133;
  PF.TIERS = TIERS;
  PF.tierOf = (dex) => {
    if (LEGENDS[dex]) return TIERS.legend;
    if (ELITE.has(dex)) return TIERS.elite;
    if (SINGLE.has(dex)) return PF.POKEDEX[dex] && PF.POKEDEX[dex].bst >= 490 ? TIERS.strong : TIERS.f1;
    return TIERS[['f1', 'f2', 'f3'][(STAGE[dex] || 1) - 1]];
  };
  /**
   * Rango de poder por tier (1 fase 1 … 5 legendario): en los choques y
   * golpes, la diferencia de rango pesa un poco a favor del de más tier.
   */
  const RANK = { f1: 1, f2: 2, f3: 3, strong: 3, elite: 4, legend: 5 };
  PF.powerRank = (def) => (def.dex && PF.POKEDEX[def.dex] ? RANK[PF.tierOf(def.dex).id] || 1 : 2);
  const slug = (name) => name.toLowerCase().replace('♀', 'f').replace('♂', 'm').normalize('NFD').replace(/[^a-z0-9]/g, '');
  const idOfDex = {};
  for (const dex of Object.keys(PF.POKEDEX)) idOfDex[dex] = slug(PF.POKEDEX[dex].name);
  for (const r of PF.ROSTER) idOfDex[r.dex] = r.id;
  /** Id del plantel de un número de Pokédex (para contar partidos desde el modo historia). */
  PF.rosterIdOfDex = (dex) => idOfDex[dex];

  /**
   * Cómo se consigue: { coins, needs?, plays? } (needs = id de la preevolución
   * que hay que tener, plays = partidos jugados con ella) o un reto.
   */
  const unlockFor = (dex) => {
    const t = PF.tierOf(dex);
    if (t.id === 'legend') return LEGENDS[dex];
    if (FREE.has(dex)) return undefined;
    const u = { coins: t.price };
    if (PREV[dex]) { u.needs = idOfDex[PREV[dex]]; u.plays = PLAYS_TO_EVOLVE[STAGE[dex]] || 5; }
    return u;
  };

  /**
   * Movimientos extra de las evoluciones: después de los suyos, los de su
   * línea evolutiva y los de sus tipos, hasta tener los que marca su tier.
   */
  function movesFor(dex, base) {
    const want = PF.tierOf(dex).moves;
    const out = base.slice(0, want);
    const add = (id) => { if (out.length < want && ABILITY_INFO[id] && !out.some((a) => a.id === id)) out.push(ABILITY_INFO[id]); };
    // (Gyarados no salpica ni las Eeveelutions se adaptan: no heredan de su línea)
    const fam = NO_INHERIT.has(dex) ? [dex] : FAMILIES.find((f) => f.includes(dex)) || [dex];
    for (const d of fam) { const r = PF.ROSTER.find((x) => x.dex === d && x.handmade); if (r) r.abilities.slice(0, 2).forEach((a) => add(a.id)); }
    for (const t of PF.POKEDEX[dex].types) if (TYPE_ABILITIES[t]) poolFor(dex, t).forEach(add);
    for (const id of ['quick', 'slam', 'jump', 'psywave']) add(id);
    return out;
  }

  // Los del plantel hecho a mano conservan stats y habilidades (más las que
  // aprendan por su fase), pero se desbloquean por su tier; el resto de la
  // Gen 1 sale de la Pokédex.
  for (const r of PF.ROSTER) r.handmade = true;
  for (const r of PF.ROSTER) {
    r.tier = PF.tierOf(r.dex).id;
    r.unlock = unlockFor(r.dex);
    r.abilities = movesFor(r.dex, r.abilities);
  }
  const made = new Set(PF.ROSTER.map((r) => r.dex));
  for (let dex = 1; dex <= 151; dex++) {
    if (made.has(dex) || !PF.POKEDEX[dex]) continue;
    const sp = PF.species(dex);
    PF.ROSTER.push(Object.assign({}, sp, {
      id: idOfDex[dex], tier: PF.tierOf(dex).id, unlock: unlockFor(dex), evolve: undefined,
      abilities: movesFor(dex, sp.abilities),
    }));
  }
  PF.ROSTER.sort((a, b) => a.dex - b.dex);

  // ------------------------------------------------------------------ modo historia
  PF.CAREER_STARTERS = [4, 7, 1, 25];
  /** Pokémon que pueden aparecer en el club al empezar o unirse tras un partido. */
  PF.CAREER_COMMONS = [16, 19, 74, 66, 92, 54, 39, 129, 63, 58, 133, 100, 43, 77, 120, 111];

  /**
   * Gimnasios: cada uno es una copa de 3 partidos (2 entrenadores + líder).
   * pool = especies de los entrenadores · leader = equipo del líder.
   */
  PF.GYMS = [
    { id: 'roca', name: 'Gimnasio Plateada', leader: 'Brock', type: 'rock', badge: 'Medalla Roca',
      levels: [8, 12], diff: 'easy', stadium: 'playa', pool: [74, 95, 111, 75], team: [74, 111, 95] },
    { id: 'agua', name: 'Gimnasio Celeste', leader: 'Misty', type: 'water', badge: 'Medalla Cascada',
      levels: [14, 18], diff: 'easy', stadium: 'estadio', pool: [120, 54, 129, 7, 8], team: [120, 54, 121] },
    { id: 'rayo', name: 'Gimnasio Carmín', leader: 'Lt. Surge', type: 'electric', badge: 'Medalla Trueno',
      levels: [20, 24], diff: 'normal', stadium: 'estadio', pool: [100, 25, 101, 26], team: [100, 101, 26] },
    { id: 'planta', name: 'Gimnasio Azulona', leader: 'Erika', type: 'grass', badge: 'Medalla Arcoíris',
      levels: [26, 30], diff: 'normal', stadium: 'estadio', pool: [43, 44, 1, 2], team: [44, 2, 45] },
    { id: 'psiquico', name: 'Gimnasio Azafrán', leader: 'Sabrina', type: 'psychic', badge: 'Medalla Pantano',
      levels: [32, 36], diff: 'normal', stadium: 'hielo', pool: [63, 64, 122, 54], team: [64, 122, 65] },
    { id: 'fuego', name: 'Gimnasio Canela', leader: 'Blaine', type: 'fire', badge: 'Medalla Volcán',
      levels: [38, 42], diff: 'hard', stadium: 'volcan', pool: [58, 77, 4, 5], team: [59, 78, 6] },
    { id: 'liga', name: 'Liga Pokémon', leader: 'Campeón Azul', type: 'dragon', badge: 'Copa de Campeón',
      levels: [45, 50], diff: 'hard', stadium: 'estadio', pool: [18, 65, 59, 112, 130, 9], team: [18, 130, 65] },
  ];
})();
