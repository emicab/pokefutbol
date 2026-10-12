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
    normal: ['quick', 'slam'], fire: ['fireshot', 'embers'], water: ['hydro', 'puddle'], grass: ['vine', 'sleep'],
    electric: ['zap', 'quick'], ice: ['ice', 'surf'], fighting: ['punch', 'throw'], poison: ['sleep', 'embers'],
    ground: ['dig', 'wall'], flying: ['quick', 'jump'], psychic: ['confusion', 'psywave'], bug: ['shuriken', 'quick'],
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
    95: { to: 208, level: 35 },
    447: { to: 448, level: 30 },
    656: { to: 657, level: 16 }, 657: { to: 658, level: 36 },
    446: { to: 143, level: 25 },
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
  });

  /** Evoluciones que cambian tanto que no heredan (Gyarados no salpica; las Eeveelutions son de su tipo). */
  const NO_INHERIT = new Set([130, 134, 135, 136]);

  function abilitiesFor(dex, types) {
    const own = PF.ROSTER.find((x) => x.dex === dex);
    if (own) return own.abilities;
    // 1) alguien de su línea está en el plantel a mano: hereda sus habilidades
    for (const d of NO_INHERIT.has(dex) ? [] : lineOf(dex)) {
      const r = PF.ROSTER.find((x) => x.dex === d);
      if (r) return r.abilities;
    }
    // 2) por tipo: la primera de cada tipo, o las dos del único tipo
    const t1 = TYPE_ABILITIES[types[0]] || TYPE_ABILITIES.normal;
    const t2 = types[1] && TYPE_ABILITIES[types[1]];
    const ids = t2 && t2[0] !== t1[0] ? [t1[0], t2[0]] : t1;
    return ids.map((id) => ABILITY_INFO[id]);
  }

  const cache = {};
  /** Definición de cancha de una especie (stats base, sin nivel). */
  PF.species = (dex) => {
    if (cache[dex]) return cache[dex];
    const d = PF.POKEDEX[dex];
    if (!d) throw new Error('Especie sin datos: ' + dex);
    const heavy = d.types.some((t) => t === 'rock' || t === 'steel' || t === 'ground') ? 0.6 : 0;
    const mass = 0.75 + ((d.hp - 79) / 63) * 2 + Math.max(0, d.bst - 450) / 230 * 0.4 + heavy;
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

  // ------------------------------------------------------------------ modo historia
  PF.CAREER_STARTERS = [4, 7, 1, 25];
  /** Pokémon que pueden aparecer en el club al empezar o unirse tras un partido. */
  PF.CAREER_COMMONS = [16, 19, 74, 66, 92, 54, 39, 129, 63, 58, 447, 656, 446, 133, 100, 43, 77, 120];

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
