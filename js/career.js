/* ============ career.js — modo historia: club, niveles, evoluciones, gimnasios ============
 * Mixto: el CLUB es persistente (niveles, IVs, evoluciones, medallas) y cada
 * GIMNASIO se juega como una copa de 3 partidos (2 entrenadores + líder) con
 * mejoras temporales que se eligen entre partido y partido. Perder termina la
 * copa (salvo que tengas una Poción), pero la experiencia ganada se queda.
 *
 * Datos en PF.Save.data.career (null hasta empezar):
 *   name, club: [miembro], lineup: [uid x3], spots: {modo: {defId: [d, f]}}, keeper,
 *   badges: [gymId], run: null | { gym, stage, perks, lives }, nextUid
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
    });
  }

  // ------------------------------------------------------------------ club
  function start(starterDex, name) {
    PF.Save.data.career = {
      name: name || 'Club Paleta', club: [], lineup: [], spots: {}, keeper: 'spider',
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
    data().run = { gym: gymId, stage: 0, perks: [], lives: 0 };
    save();
  }

  const gymOf = (run) => PF.GYMS.find((g) => g.id === run.gym);
  const easier = { hard: 'normal', normal: 'easy', easy: 'easy' };

  /** Rival de la etapa actual: entrenadores con el pool del gimnasio, o el líder. */
  function opponent(run) {
    const g = gymOf(run), [lo, hi] = g.levels;
    if (run.stage >= 2) {
      return {
        title: `Líder ${g.leader}`, leader: true, diff: g.diff,
        members: g.team.map((dex) => ({ uid: -1, dex, level: hi, xp: 0, abil: Math.random() < 0.5 ? 0 : 1, ivs: { spd: 22, pow: 22, mass: 22 } })),
      };
    }
    const lvl = Math.round(U.lerp(lo, (lo + hi) / 2, run.stage));
    return {
      title: `Entrenador ${run.stage + 1} de ${g.name}`, leader: false,
      diff: run.stage === 0 ? easier[g.diff] : g.diff,
      members: U.shuffle(g.pool).slice(0, TEAM_SIZE).map((dex) => ({
        uid: -1, dex, level: lvl + Math.floor(U.rand(-1, 2)), xp: 0, abil: Math.random() < 0.5 ? 0 : 1,
        ivs: { spd: randIv(5, 20), pow: randIv(5, 20), mass: randIv(5, 20) },
      })),
    };
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
      const p = m.players.find((q) => q.team === 0 && q.def.uid === mb.uid);
      let xp;
      if (p) {
        const st = p.stats;
        xp = 30 + (won ? 30 : lost ? 0 : 10) + st.goals * 20 + st.assists * 12 + st.tackles * 4 + st.saves * 8;
      } else xp = 12;   // suplente: entrena
      xp = Math.round(xp * U.clamp(1 + (oppLevel - mb.level) * 0.06, 0.5, 2) * xpMult);
      const before = mb.level;
      mb.xp += xp;
      while (mb.level < LEVEL_MAX && mb.xp >= xpToNext(mb.level)) { mb.xp -= xpToNext(mb.level); mb.level++; }
      if (mb.level >= LEVEL_MAX) mb.xp = 0;
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
  function advanceRun(won) {
    const c = data(), run = c.run;
    if (!run) return null;
    if (won) {
      if (run.stage >= 2) {
        const g = gymOf(run);
        const first = !c.badges.includes(g.id);
        if (first) c.badges.push(g.id);
        PF.Save.data.coins += first ? 250 : 80;
        c.run = null;
        save();
        return { result: 'won', gym: g, first };
      }
      run.stage++;
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

  /** A veces, tras ganarle a un entrenador, un Pokémon salvaje quiere unirse. */
  function wildJoin(g) {
    if (Math.random() > 0.35 || data().club.length >= CLUB_MAX) return null;
    return { dex: U.pick(g.pool.concat(PF.CAREER_COMMONS)), level: g.levels[0] - 2 };
  }

  // ------------------------------------------------------------------ partido
  /** Configuración del partido de la etapa actual (para main.js). */
  function matchConfig(opp) {
    const c = data(), run = c.run, g = gymOf(run);
    const mine = lineupMembers();
    const defs = mine.map(defOf);
    const spots = spotsFor(defs);
    return {
      size: TEAM_SIZE, keeperMode: c.keeper, stadium: g.stadium, time: 120,
      teams: [defs, opp.members.map(defOf)],
      formations: [spots, null],
      diff: opp.diff,
      mods: [runMods(run), opp.leader ? { speed: 1.04 } : {}],
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
    TEAM_SIZE, CLUB_MAX, LEVEL_MAX, ABILITY2_LEVEL, PERKS,
    data, start, defOf, ivGrade, xpToNext, member, lineupMembers, toggleLineup, release, addMember,
    gymStatus, startRun, gymOf, opponent, perkChoices, takePerk, applyMatch, evolve, advanceRun,
    leaderRecruits, wildJoin, matchConfig, spotsFor, saveSpots,
  };
})();
