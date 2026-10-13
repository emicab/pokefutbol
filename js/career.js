/* ============ career.js — modo historia: club, niveles, evoluciones, gimnasios ============
 * Mixto: el CLUB es persistente (niveles, IVs, evoluciones, medallas) y cada
 * GIMNASIO se juega como una copa: un MAPA de rutas (4 pasos y el líder) donde
 * se elige el camino entre partidos, Centros, tiendas y eventos, con mejoras
 * temporales que duran toda la copa. Perder termina la copa (salvo que tengas
 * una Poción), pero la experiencia ganada se queda.
 *
 * Datos en PF.Save.data.career (null hasta empezar):
 *   name, club: [miembro], lineup: [uid x3], spots: {modo: {defId: [d, f]}}, keeper,
 *   badges: [gymId], run: null | { gym, stage, perks, lives, map, at }, nextUid
 * run.map = capas 0..3 (2-3 nodos) + capa 4 (el líder) · nodo = { l, i, type, to: [i de la
 *   capa siguiente], done, foe?, shop?, ev? } · run.at = null | { l, i } (último nodo cumplido)
 * miembro = { uid, dex, level, xp, ivs: { spd, pow, mass }, abil }
 */
PF.Career = (() => {
  const U = PF.U;
  const TEAM_SIZE = 3, CLUB_MAX = 9, LEVEL_MAX = 60, ABILITY2_LEVEL = 12;

  /** Mejoras de copa (duran hasta que termina la copa). */
  const PERKS = [
    { id: 'veloz', name: 'Zapatillas', desc: '+8 % de velocidad para todo el equipo.' },
    { id: 'canon', name: 'Botines cañón', desc: '+10 % de fuerza de tiro.' },
    { id: 'recarga', name: 'Batido de bayas', desc: '−15 % de recarga de habilidades.' },
    { id: 'muro', name: 'Guantes de oro', desc: '+20 % de reflejos para el arquero.' },
    { id: 'xp', name: 'Repartir Exp.', desc: '+50 % de experiencia en esta copa.' },
    { id: 'monedas', name: 'Amuleto Moneda', desc: '+60 % de monedas en esta copa.' },
    { id: 'pocion', name: 'Poción', desc: 'Una vida extra: si pierdes, repites el partido.' },
  ];

  /** Tipos de nodo del mapa. */
  const NODE_INFO = {
    trainer: { name: 'Entrenador', icon: '🧢', desc: 'Partido contra un entrenador. Premio: una mejora para la copa.' },
    wild: { name: 'Salvajes', icon: '🌿', desc: 'Partido corto (75 s) contra Pokémon salvajes. Si ganas, uno se une al club.' },
    elite: { name: 'Élite', icon: '👑', desc: 'Rival más duro. Premio: una mejora, 120 monedas y a veces un Pokémon.' },
    center: { name: 'Centro Pokémon', icon: '💖', desc: 'Descanso: una Poción, entrenamiento para todo el club o una mejora.' },
    shop: { name: 'Tienda', icon: '🛒', desc: 'Gasta tus monedas en mejoras, Pociones y caramelos.' },
    event: { name: 'Evento', icon: '❓', desc: 'Un encuentro en el camino: puede salir bien… o no tanto.' },
    leader: { name: 'Líder', icon: '🏅', desc: 'El líder del gimnasio. Si ganas, la medalla y un Pokémon de su equipo.' },
  };
  const TRAINERS = ['Campista', 'Joven', 'Karateka', 'Pescador', 'Excursionista', 'Scout', 'Motociclista', 'Cinturón negro', 'Estudiante', 'Jugadora'];
  const NAMES = ['Álex', 'Marta', 'Tomás', 'Rocío', 'Bruno', 'Lía', 'Nico', 'Sofi', 'Dante', 'Vera', 'Iván', 'Lola'];
  const MAP_LAYERS = 4;   // capas de la ruta; después viene el líder

  const data = () => PF.Save.data.career;
  const save = () => PF.Save.save();
  const randIv = (lo = 0, hi = 31) => Math.floor(U.rand(lo, hi + 1));
  const xpToNext = (L) => 25 + L * 10;

  function newMember(dex, level, ivMin = 0) {
    const c = data();
    return {
      uid: c ? c.nextUid++ : 0, dex, level, xp: 0, abil: 0,
      ivs: { spd: randIv(ivMin), pow: randIv(ivMin), mass: randIv(ivMin) },
    };
  }

  /** Nota de los IVs (0..93) como letra, para mostrar. */
  function ivGrade(ivs) {
    const t = ivs.spd + ivs.pow + ivs.mass;
    return t >= 80 ? 'S' : t >= 62 ? 'A' : t >= 44 ? 'B' : t >= 26 ? 'C' : 'D';
  }

  /**
   * Definición de cancha de un miembro: la especie escalada por nivel e IVs,
   * como en los juegos (cada nivel sube un poco cada stat; los IVs dan hasta
   * un 7-8 % extra). La segunda habilidad se desbloquea al nivel 12.
   */
  function defOf(mb) {
    const s = PF.species(mb.dex), L = mb.level, iv = mb.ivs;
    const abilities = L >= ABILITY2_LEVEL ? s.abilities : s.abilities.slice(0, 1);
    return Object.assign({}, s, {
      id: 'c' + mb.uid, uid: mb.uid, level: L,
      speed: Math.round(s.speed * (0.78 + (0.27 * L) / 50) * (1 + (iv.spd / 31) * 0.07)),
      power: +(s.power * (0.8 + (0.3 * L) / 50) * (1 + (iv.pow / 31) * 0.08)).toFixed(3),
      mass: +(s.mass * (0.92 + (0.12 * L) / 50) * (1 + (iv.mass / 31) * 0.08)).toFixed(3),
      ability: abilities[Math.min(mb.abil, abilities.length - 1)],
      unlockedAbilities: abilities.length,
      role: PF.naturalRole(s),   // el puesto es de la especie, no depende del nivel
      stamina: Math.round(PF.staminaMax(s) * (0.85 + (0.3 * L) / 50)),   // aguante: PS de la especie y nivel
      hpMax: Math.round(PF.hpMax(s) * (0.85 + (0.3 * L) / 50)),          // vida, igual
    });
  }

  // ------------------------------------------------------------------ club
  function start(starterDex, name) {
    PF.Save.data.career = {
      name: name || 'Club Paleta', club: [], lineup: [], spots: {}, keeper: 'dynamic',
      badges: [], run: null, nextUid: 1,
    };
    const c = data();
    c.club.push(newMember(starterDex, 6, 10));
    for (const dex of U.shuffle(PF.CAREER_COMMONS).slice(0, 2)) c.club.push(newMember(dex, 4));
    c.lineup = c.club.map((m) => m.uid);
    save();
  }

  const member = (uid) => data().club.find((m) => m.uid === uid);
  const lineupMembers = () => data().lineup.map(member).filter(Boolean);

  function toggleLineup(uid) {
    const c = data();
    const i = c.lineup.indexOf(uid);
    if (i >= 0) c.lineup.splice(i, 1);
    else { c.lineup.push(uid); while (c.lineup.length > TEAM_SIZE) c.lineup.shift(); }
    save();
  }

  function release(uid) {
    const c = data();
    if (c.club.length <= TEAM_SIZE) return false;
    c.club = c.club.filter((m) => m.uid !== uid);
    c.lineup = c.lineup.filter((u) => u !== uid);
    for (const mode of Object.keys(c.spots)) delete c.spots[mode]['c' + uid];
    save();
    return true;
  }

  function addMember(dex, level, ivMin) {
    const c = data();
    if (c.club.length >= CLUB_MAX) return null;
    const m = newMember(dex, level, ivMin);
    c.club.push(m);
    if (c.lineup.length < TEAM_SIZE) c.lineup.push(m.uid);
    save();
    return m;
  }

  /** ¿Qué gimnasios se pueden jugar? El siguiente sin medalla, y los ya ganados. */
  function gymStatus(g) {
    const c = data(), i = PF.GYMS.indexOf(g);
    if (c.badges.includes(g.id)) return 'won';
    if (i === 0 || c.badges.includes(PF.GYMS[i - 1].id)) return 'open';
    return 'locked';
  }

  // ------------------------------------------------------------------ copa
  function startRun(gymId) {
    const run = { gym: gymId, stage: 0, perks: [], lives: 0, map: null, at: null };
    run.map = genMap();
    data().run = run;
    save();
  }

  const gymOf = (run) => PF.GYMS.find((g) => g.id === run.gym);
  const easier = { hard: 'normal', normal: 'easy', easy: 'easy' };
  const harder = { easy: 'normal', normal: 'hard', hard: 'hard' };

  // ------------------------------------------------------------------ mapa de rutas
  /**
   * Capas de nodos: 4 pasos con 2-3 opciones cada uno y, al final, el líder.
   * Cada nodo conecta con 1-2 de la capa siguiente (todos los de la última, con el líder).
   */
  function genMap() {
    const pool = [
      ['trainer', 'trainer', 'wild'],
      ['trainer', 'trainer', 'wild', 'event'],
      ['elite', 'trainer', 'shop', 'event', 'center'],
      ['center', 'shop', 'event'],
    ];
    const map = pool.map((types, l) => {
      const n = l === MAP_LAYERS - 1 ? 2 : 2 + (Math.random() < 0.55 ? 1 : 0);
      let pick = U.shuffle(types).slice(0, n);
      if (l === MAP_LAYERS - 1 && !pick.some((t) => t === 'center' || t === 'shop')) pick[0] = 'center';   // antes del líder siempre hay descanso o tienda
      return pick.map((type, i) => ({ l, i, type, to: [], done: false }));
    });
    map.push([{ l: MAP_LAYERS, i: 0, type: 'leader', to: [], done: false }]);
    for (let l = 0; l < MAP_LAYERS; l++) {
      const cur = map[l], nxt = map[l + 1];
      for (const nd of cur) {
        const c = Math.round(((nd.i + 0.5) / cur.length) * nxt.length - 0.5);
        nd.to.push(U.clamp(c, 0, nxt.length - 1));
        if (nxt.length > 1 && Math.random() < 0.45) {
          const o = U.clamp(c + (Math.random() < 0.5 ? -1 : 1), 0, nxt.length - 1);
          if (!nd.to.includes(o)) nd.to.push(o);
        }
      }
      nxt.forEach((nn, j) => {   // todo nodo tiene que poder alcanzarse
        if (cur.some((nd) => nd.to.includes(j))) return;
        let best = cur[0];
        for (const nd of cur) if (Math.abs(nd.i / cur.length - j / nxt.length) < Math.abs(best.i / cur.length - j / nxt.length)) best = nd;
        best.to.push(j);
      });
    }
    return map;
  }

  /** Copas guardadas antes del mapa: se les arma uno nuevo. */
  function ensureMap(run) {
    if (!run.map) { run.map = genMap(); run.at = null; run.stage = 0; save(); }
    return run.map;
  }

  const nodeAt = (run, l, i) => run.map[l] && run.map[l][i];

  /** ¿Se puede ir a ese nodo ahora? (el siguiente paso desde donde estás) */
  function isAvailable(run, nd) {
    if (nd.done) return false;
    if (!run.at) return nd.l === 0;
    return nd.l === run.at.l + 1 && nodeAt(run, run.at.l, run.at.i).to.includes(nd.i);
  }

  /** Nodo cumplido: el camino sigue desde ahí. */
  function completeNode(run, nd) {
    nd.done = true;
    run.at = { l: nd.l, i: nd.i };
    run.stage++;
    save();
  }

  /** Rival (guardado en el nodo, así no cambia al reintentar ni al recargar). */
  function opponent(run, nd) {
    if (nd.foe) return nd.foe;
    const g = gymOf(run), [lo, hi] = g.levels;
    const ivs = (a, b) => ({ spd: randIv(a, b), pow: randIv(a, b), mass: randIv(a, b) });
    const mk = (dex, level, iv) => ({ uid: -1, dex, level: Math.max(2, level), xp: 0, abil: Math.random() < 0.5 ? 0 : 1, ivs: iv });
    let foe;
    if (nd.type === 'leader') {
      foe = { title: `Líder ${g.leader}`, leader: true, diff: g.diff, time: 120, members: g.team.map((dex) => mk(dex, hi, { spd: 22, pow: 22, mass: 22 })) };
    } else {
      const lvl = Math.round(U.lerp(lo, (lo + hi) / 2, nd.l / (MAP_LAYERS - 1)));
      if (nd.type === 'wild') {
        const dexes = [...new Set(U.shuffle(g.pool.concat(PF.CAREER_COMMONS)))].slice(0, TEAM_SIZE);
        foe = { title: 'Pokémon salvajes', wild: true, diff: easier[g.diff], time: 75, members: dexes.map((d) => mk(d, lvl - 2 + Math.floor(U.rand(-1, 2)), ivs(2, 16))) };
      } else if (nd.type === 'elite') {
        foe = { title: `Entrenador élite ${U.pick(NAMES)}`, elite: true, diff: harder[g.diff], time: 120, members: U.shuffle(g.pool).slice(0, TEAM_SIZE).map((d) => mk(d, lvl + 2 + Math.floor(U.rand(0, 2)), ivs(12, 26))) };
      } else {
        foe = {
          title: `${U.pick(TRAINERS)} ${U.pick(NAMES)}`, diff: nd.l === 0 ? easier[g.diff] : g.diff, time: 120,
          members: U.shuffle(g.pool).slice(0, TEAM_SIZE).map((d) => mk(d, lvl + Math.floor(U.rand(-1, 2)), ivs(5, 20))),
        };
      }
    }
    nd.foe = foe;
    save();
    return foe;
  }

  /** Multiplicadores de equipo por las mejoras de la copa. */
  function runMods(run) {
    const mods = { speed: 1, power: 1, cd: 1, reflex: 1 };
    for (const p of run.perks) {
      if (p === 'veloz') mods.speed *= 1.08;
      if (p === 'canon') mods.power *= 1.1;
      if (p === 'recarga') mods.cd *= 0.85;
      if (p === 'muro') mods.reflex *= 1.2;
    }
    return mods;
  }

  function perkChoices(run) {
    const have = new Set(run.perks.filter((p) => p !== 'pocion'));
    return U.shuffle(PERKS.filter((p) => !have.has(p.id))).slice(0, 3);
  }

  function takePerk(run, id) {
    run.perks.push(id);
    if (id === 'pocion') run.lives++;
    save();
  }

  function addXp(mb, xp) {
    mb.xp += xp;
    while (mb.level < LEVEL_MAX && mb.xp >= xpToNext(mb.level)) { mb.xp -= xpToNext(mb.level); mb.level++; }
    if (mb.level >= LEVEL_MAX) mb.xp = 0;
  }

  /** Experiencia para todo el club (una fracción de lo que le falta a cada uno para subir). */
  function grantXp(frac) {
    const evolutions = [], abilityUnlocks = [];
    for (const mb of data().club) {
      const before = mb.level;
      addXp(mb, Math.round(xpToNext(mb.level) * frac));
      if (before < ABILITY2_LEVEL && mb.level >= ABILITY2_LEVEL) abilityUnlocks.push(mb);
      const evo = PF.species(mb.dex).evolve;
      if (evo && mb.level >= evo.level) evolutions.push(mb);
    }
    save();
    return { evolutions, abilityUnlocks };
  }

  // ------------------------------------------------------------------ después del partido
  /**
   * Reparte experiencia (titulares según lo que hicieron; suplentes un poco
   * por entrenar), sube niveles, da monedas y avanza la copa.
   * Devuelve el detalle para la pantalla: { won, lost, rows, coins, evolutions, abilityUnlocks }.
   */
  function applyMatch(m, opp) {
    const c = data(), run = c.run, perks = run ? run.perks : [];
    const won = m.winner === 0, lost = m.winner === 1;
    const oppLevel = opp.members.reduce((s, x) => s + x.level, 0) / opp.members.length;
    const xpMult = perks.includes('xp') ? 1.5 : 1;
    const rows = [];
    const evolutions = [], abilityUnlocks = [];

    for (const mb of c.club) {
      // jugó si estuvo en la cancha (aunque haya salido o entrado en un cambio);
      // si salió y volvió a entrar, sus estadísticas se suman
      const stints = m.players.concat(m.retired).filter((q) => q.team === 0 && q.def.uid === mb.uid);
      const p = stints.length ? { stats: { goals: 0, assists: 0, tackles: 0, saves: 0 } } : null;
      for (const q of stints) for (const k in p.stats) p.stats[k] += q.stats[k];
      let xp;
      if (p) {
        const st = p.stats;
        xp = 30 + (won ? 30 : lost ? 0 : 10) + st.goals * 20 + st.assists * 12 + st.tackles * 4 + st.saves * 8;
      } else xp = 12;   // suplente: entrena
      xp = Math.round(xp * U.clamp(1 + (oppLevel - mb.level) * 0.06, 0.5, 2) * xpMult);
      const before = mb.level;
      addXp(mb, xp);
      if (before < ABILITY2_LEVEL && mb.level >= ABILITY2_LEVEL) abilityUnlocks.push(mb);
      const evo = PF.species(mb.dex).evolve;
      if (evo && mb.level >= evo.level) evolutions.push(mb);   // también si quedó pendiente
      rows.push({ mb, xp, before, after: mb.level, stats: p ? p.stats : null, starter: !!p });
    }

    let coins = 40 + (won ? 60 : lost ? 0 : 20) + m.score[0] * 10;
    if (perks.includes('monedas')) coins = Math.round(coins * 1.6);
    PF.Save.data.coins += coins;
    save();
    return { won, lost, rows, coins, evolutions, abilityUnlocks };
  }

  /** Evoluciona a un miembro (a `to`, o a la única opción). Devuelve el dex nuevo. */
  function evolve(mb, to) {
    const evo = PF.species(mb.dex).evolve;
    if (!evo) return mb.dex;
    mb.dex = to || evo.to || evo.options[0];
    save();
    return mb.dex;
  }

  /** Resultado de la copa tras un partido: 'next' | 'retry' | 'won' | 'lost'. */
  function advanceRun(won, node) {
    const c = data(), run = c.run;
    if (!run) return null;
    if (won) {
      if (node.type === 'leader') {
        const g = gymOf(run);
        const first = !c.badges.includes(g.id);
        if (first) c.badges.push(g.id);
        PF.Save.data.coins += first ? 250 : 80;
        c.run = null;
        save();
        return { result: 'won', gym: g, first };
      }
      completeNode(run, node);
      if (node.type === 'elite') PF.Save.data.coins += 120;
      save();
      return { result: 'next' };
    }
    if (run.lives > 0) { run.lives--; run.perks.splice(run.perks.indexOf('pocion'), 1); save(); return { result: 'retry' }; }
    c.run = null;
    save();
    return { result: 'lost' };
  }

  /** Tras ganarle al líder: elegir a uno de su equipo para el club. */
  function leaderRecruits(g) {
    return g.team.map((dex) => ({ dex, level: g.levels[1] - 4 }));
  }

  /** A veces, tras ganarle a un entrenador, un Pokémon salvaje quiere unirse (más seguido con los de élite). */
  function wildJoin(g, chance = 0.25) {
    if (Math.random() > chance || data().club.length >= CLUB_MAX) return null;
    return { dex: U.pick(g.pool.concat(PF.CAREER_COMMONS)), level: g.levels[0] - 2 };
  }

  // ------------------------------------------------------------------ nodos sin partido
  const spend = (n) => { PF.Save.data.coins -= n; save(); };
  const gain = (n) => { PF.Save.data.coins += n; save(); return `+${n} monedas.`; };

  /** Opciones del Centro Pokémon. `apply(run)` devuelve { msg, perk?, evos? }. */
  const CENTER = [
    { title: 'Poción', sub: 'Una vida extra: si pierdes un partido, lo repites.', apply: (run) => { takePerk(run, 'pocion'); return { msg: '¡Una Poción para la copa!' }; } },
    { title: 'Entrenamiento', sub: 'Todo el club gana experiencia (casi la mitad de un nivel).', apply: () => ({ msg: 'El club entrenó a fondo.', xp: grantXp(0.45) }) },
    { title: 'Estrategia', sub: 'Eliges una mejora entre tres.', apply: () => ({ msg: '', perk: true }) },
  ];

  /** Eventos del camino (se sortea uno al entrar). */
  const EVENTS = [
    { title: 'Un cofre en el camino', text: 'Está cerrado con un candado oxidado. Dentro suena algo.', options: [
      { title: 'Forzarlo', sub: '70 %: 180 monedas · 30 %: estaba vacío.', apply: () => (Math.random() < 0.7 ? { msg: gain(180) } : { msg: 'Estaba vacío… ¡qué lástima!' }) },
      { title: 'Buscar la llave', sub: 'Seguro: 60 monedas.', apply: () => ({ msg: gain(60) }) },
    ] },
    { title: 'Un veterano te desafía a entrenar', text: 'Dice que llevó a su equipo hasta la Liga hace veinte años.', options: [
      { title: 'Entrenar con él', sub: 'Todo el club gana experiencia.', apply: () => ({ msg: 'Una práctica durísima, pero valió la pena.', xp: grantXp(0.35) }) },
      { title: 'Pedirle un consejo', sub: 'Eliges una mejora entre tres.', apply: () => ({ msg: '', perk: true }) },
    ] },
    { title: 'Un Pokémon herido', text: 'Está tirado al costado del camino y te mira con desconfianza.', options: [
      { title: 'Cuidarlo', sub: 'Si tienes lugar, se une al club (con buenos IVs).', apply: (run) => {
        const g = gymOf(run);
        if (data().club.length >= CLUB_MAX) return { msg: 'Tu club está lleno. Lo dejaste con unas bayas.' };
        return { msg: '', recruit: { dex: U.pick(g.pool.concat(PF.CAREER_COMMONS)), level: g.levels[0] - 3, ivMin: 14 } };
      } },
      { title: 'Seguir de largo', sub: 'Encuentras 50 monedas más adelante.', apply: () => ({ msg: gain(50) }) },
    ] },
    { title: 'Una fuente termal', text: 'El agua está tibia y huele a azufre. Tu equipo la mira con ganas.', options: [
      { title: 'Darse un baño', sub: 'Una Poción para la copa.', apply: (run) => { takePerk(run, 'pocion'); return { msg: '¡Salieron como nuevos! Una Poción para la copa.' }; } },
      { title: 'Vender el agua', sub: 'Llenas frascos y ganas 100 monedas.', apply: () => ({ msg: gain(100) }) },
    ] },
  ];

  /** Evento de un nodo (se sortea una vez y queda guardado). */
  function eventOf(nd) {
    if (nd.ev === undefined) { nd.ev = Math.floor(Math.random() * EVENTS.length); save(); }
    return EVENTS[nd.ev];
  }

  /** Ofertas de la tienda de un nodo (se arman una vez). */
  function shopOf(run, nd) {
    if (!nd.shop) {
      const perks = perkChoices(run).filter((p) => p.id !== 'pocion').slice(0, 2);
      nd.shop = {
        sold: [],
        items: perks.map((p) => ({ kind: 'perk', id: p.id, title: p.name, sub: p.desc, price: 90 })).concat([
          { kind: 'perk', id: 'pocion', title: 'Poción', sub: 'Una vida extra: si pierdes, repites el partido.', price: 130 },
          { kind: 'xp', title: 'Caramelos Raros', sub: 'Todo el club gana experiencia (un tercio de nivel).', price: 110 },
        ]),
      };
      save();
    }
    return nd.shop;
  }

  /** Compra el ítem i. Devuelve { ok, msg, xp? }. */
  function buy(run, nd, i) {
    const shop = shopOf(run, nd), it = shop.items[i];
    if (!it || shop.sold[i]) return { ok: false, msg: 'Ya lo compraste.' };
    if (PF.Save.data.coins < it.price) return { ok: false, msg: `Te faltan ${it.price - PF.Save.data.coins} monedas.` };
    spend(it.price);
    shop.sold[i] = true;
    if (it.kind === 'perk') { takePerk(run, it.id); return { ok: true, msg: `¡${it.title} para la copa!` }; }
    return { ok: true, msg: 'El club se puso las pilas.', xp: grantXp(0.33) };
  }

  /** Resuelve la opción elegida de un Centro o evento. */
  function pickOption(run, nd, i) {
    const opt = nd.type === 'center' ? CENTER[i] : eventOf(nd).options[i];
    return opt.apply(run);
  }

  // ------------------------------------------------------------------ partido
  /** Configuración del partido de la etapa actual (para main.js). */
  function matchConfig(opp) {
    const c = data(), run = c.run, g = gymOf(run);
    const mine = lineupMembers();
    const defs = mine.map(defOf);
    const spots = spotsFor(defs);
    const bench = c.club.filter((mb) => !c.lineup.includes(mb.uid)).map(defOf);   // todo el que no es titular
    return {
      size: TEAM_SIZE, keeperMode: c.keeper, stadium: g.stadium, time: opp.time || 120,
      teams: [defs, opp.members.map(defOf)],
      bench: [bench, []],
      formations: [spots, null],
      diff: opp.diff,
      mods: [runMods(run), opp.leader ? { speed: 1.04 } : opp.elite ? { speed: 1.02 } : {}],
    };
  }

  /** Posiciones de la pizarra del club (por modo de arquero) o automáticas. */
  function spotsFor(defs) {
    const c = data();
    c.spots[c.keeper] = c.spots[c.keeper] || {};
    return PF.Board.spotsFor(c.spots[c.keeper], defs, c.keeper);
  }

  function saveSpots(defs, spots) {
    const c = data();
    PF.Board.storeSpots(c.spots[c.keeper], defs, spots);
    save();
  }

  return {
    TEAM_SIZE, CLUB_MAX, LEVEL_MAX, ABILITY2_LEVEL, PERKS, NODE_INFO, MAP_LAYERS, CENTER,
    data, start, defOf, ivGrade, xpToNext, member, lineupMembers, toggleLineup, release, addMember,
    gymStatus, startRun, ensureMap, nodeAt, isAvailable, completeNode, eventOf, shopOf, buy, pickOption, grantXp, gymOf, opponent, perkChoices, takePerk, applyMatch, evolve, advanceRun,
    leaderRecruits, wildJoin, matchConfig, spotsFor, saveSpots,
  };
})();
