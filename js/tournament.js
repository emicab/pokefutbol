/* ============ tournament.js — torneo de eliminación directa ============
 * Un cuadro de 4, 8 o 16 equipos (el tuyo y los de la CPU). Los partidos de tu
 * equipo se juegan con el motor de siempre; los demás se resuelven al instante
 * según la fuerza de cada equipo. Cada cruce puede ser a partido único, ida y vuelta
 * (resultado global) o al mejor de 3 o 5. Se guarda en PF.Save.data.tournament, así
 * que se puede dejar y seguir después. Las reglas (rules.js) valen para todos los
 * equipos; las propias del torneo son tamaño del cuadro, serie, sin repetir y canchas rotativas.
 * También lo usa el torneo online (cooperativo, y cada uno con su equipo: createCup).
 *
 * t = { size, time, diff, stadium, stadiums, keeper, rules, nTeams, nRounds, teams: [equipo],
 *       rounds: [[partido]], round, used, champion, out, prize }
 * equipo  = { name, human?, owner?, out?, members: [{ id, a }] }  (los primeros `size` juegan)
 * partido = { a, b, sa, sb, pen, w, legs, l1, bo, games }
 *           w = ganador o null · legs 2: l1 = [goles de a, de b] en la ida
 *           bo 3|5: games = [[goles a, goles b, ganador]] y sa/sb = partidos ganados en la serie
 */
PF.Tournament = (() => {
  const U = PF.U;
  const R = () => PF.Rules;
  const ROUND_NAMES = ['Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'];
  const BENCH = 2;   // suplentes de cada equipo

  const CLUBS = [
    { name: 'Llamas de Canela', type: 'fire' }, { name: 'Marea Celeste', type: 'water' },
    { name: 'Voltios de Carmín', type: 'electric' }, { name: 'Jardín Azulona', type: 'grass' },
    { name: 'Mentes de Azafrán', type: 'psychic' }, { name: 'Muralla Plateada', type: 'rock' },
    { name: 'Escamas de la Liga', type: 'dragon' }, { name: 'Sombras de Lavanda', type: 'ghost' },
    { name: 'Puños de Carmín', type: 'fighting' }, { name: 'Venenos de Fucsia', type: 'poison' },
    { name: 'Alas de Verde', type: 'flying' }, { name: 'Escarcha Canela', type: 'ice' },
    { name: 'Colmena del Bosque', type: 'bug' }, { name: 'Terremoto Ciudad', type: 'ground' },
    { name: 'Los Corrientes', type: 'normal' },
  ];
  /** Nombres sin tipo, para cuando las reglas no dejan armar equipos temáticos. */
  const CITIES = ['Plateada', 'Celeste', 'Carmín', 'Azulona', 'Azafrán', 'Canela', 'Verde', 'Fucsia', 'Lavanda', 'Paleta', 'Ciudad Verde', 'Isla Espuma', 'Pueblo Lavanda', 'Ciudad Fucsia', 'Isla Canela'];

  const RANK = { f1: 1, f2: 2, f3: 3, strong: 3, elite: 4, legend: 5 };
  const PRIZE = { 'Final': 120, 'Campeón': 300, 'Semifinales': 50 };   // monedas por la etapa alcanzada
  const DIFF_MULT = { easy: 0.6, normal: 1, hard: 1.6 };

  const roster = (id) => PF.rosterById(id);
  const withAbil = (m) => PF.withAbility(roster(m.id), m.a);
  const toMembers = (rs) => rs.map((r) => ({ id: r.id, a: Math.random() < 0.5 ? 0 : 1 }));

  // ------------------------------------------------------------------ tamaño del cuadro y series
  const teamsOf = (rules) => ([4, 8, 16].includes(rules.teams) ? rules.teams : 8);
  const roundNames = (t) => ROUND_NAMES.slice(-(t.nRounds || 3));
  const roundName = (t, r) => roundNames(t)[r];
  const matchesIn = (t, r) => t.nTeams / 2 ** (r + 1);

  /** Un cruce nuevo de la ronda r: único, ida y vuelta (menos la final) o mejor de 3 / 5. */
  function mkMatch(rules, r, nRounds, a, b) {
    const s = rules.legs;
    return {
      a, b, sa: null, sb: null, pen: false, w: null,
      legs: s === 2 && r < nRounds - 1 ? 2 : 1, l1: null,
      bo: s === 3 || s === 5 ? s : 0, games: [],
    };
  }

  const wins = (m) => [0, 1].map((k) => (m.games || []).filter((g) => g[2] === (k ? m.b : m.a)).length);
  /** Partidos ganados en la serie desde el punto de vista del equipo idx: [propios, del rival]. */
  const winsFor = (m, idx) => (idx === m.b ? wins(m).slice().reverse() : wins(m));
  /** Partidos ya jugados del cruce (para saber cuál sigue). */
  const played = (m) => (m.bo ? (m.games || []).length : m.l1 ? 1 : 0);

  /**
   * Anota un partido del cruce m (goles de a y de b; winnerIdx = quién ganó el del motor, null si empató la ida).
   * Devuelve 'next' si el cruce sigue (falta la vuelta u otro partido de la serie) o 'done' si quedó resuelto.
   */
  function recordGame(m, sa, sb, winnerIdx) {
    if (m.legs === 2 && !m.l1) { m.l1 = [sa, sb]; return 'next'; }
    if (m.bo) {
      m.games = m.games || [];
      m.games.push([sa, sb, winnerIdx]);
      const [wa, wb] = wins(m), need = Math.ceil(m.bo / 2);
      m.sa = wa; m.sb = wb; m.pen = false;
      if (wa < need && wb < need) return 'next';
      m.w = wa >= need ? m.a : m.b;
      return 'done';
    }
    m.sa = sa; m.sb = sb; m.pen = false; m.w = winnerIdx;   // en la vuelta el motor ya trae el global
    return 'done';
  }

  /** Texto corto de cómo va el cruce después de un partido (para la pantalla de resultado). */
  function seriesNote(m, engineScore, idx) {
    if (m.bo) { const [x, y] = winsFor(m, idx); return `Serie ${x}–${y} (al mejor de ${m.bo}).`; }
    if (m.legs === 2 && m.l1 && m.w == null) return `Ida: ${engineScore[0]}–${engineScore[1]}. Falta la vuelta.`;
    return '';
  }

  // ------------------------------------------------------------------ armado
  /** Equipo de la CPU: temático si las reglas lo permiten; si no, con nombre de ciudad. */
  function cpuTeam(club, i, n, diff, rules, taken) {
    const themed = !rules.types.length && !rules.distinct;
    const rs = themed ? Object.assign({}, rules, { types: [club.type] }) : rules;
    let picks = R().fill(n, n - BENCH, diff, rs, [], taken);
    if (picks.length < n) picks = R().fill(n, n - BENCH, diff, rs, [], new Set());   // reglas muy estrechas: se repiten
    picks.forEach((r) => taken.add(r.id));
    return { name: themed ? club.name : `${CITIES[i % CITIES.length]} FC`, type: themed ? club.type : null, members: toMembers(picks) };
  }

  /** Canchas de cada ronda: la elegida, o una distinta por ronda entre las que tienes. */
  function stadiumsFor(setup, rules, nRounds) {
    const own = PF.Save.data.stadiums.filter((s) => PF.STADIUMS.some((x) => x.id === s));
    if (rules.rotate && own.length > 1) {
      let list = [];
      while (list.length < nRounds) list = list.concat(U.shuffle(own));
      return list.slice(0, nRounds);
    }
    return Array.from({ length: nRounds }, () => setup.stadium);
  }

  /** Cuadro vacío con los equipos sorteados (teams ya armado). */
  function base(setup, rules, teams) {
    const n = teams.length, nRounds = Math.log2(n);
    const slots = U.shuffle(teams.map((_, i) => i));
    const first = [];
    for (let i = 0; i < n; i += 2) first.push(mkMatch(rules, 0, nRounds, slots[i], slots[i + 1]));
    return {
      size: setup.size, time: setup.time, diff: setup.diff, stadium: setup.stadium, stadiums: stadiumsFor(setup, rules, nRounds), keeper: setup.keeper, rules,
      nTeams: n, nRounds, teams, rounds: [first], round: 0, used: [], champion: null, out: null, prize: 0,
    };
  }

  /** Arma un torneo con la configuración del partido rápido (formato, tiempo, dificultad, cancha, reglas). */
  function create(setup) {
    const size = setup.size, rules = R().get(setup), n = teamsOf(rules);
    const taken = new Set(setup.picks);
    let mine = [];
    if (!rules.norepeat) {
      // equipo incompleto: el resto, al azar (como en el partido rápido)
      const chosen = setup.picks.map(roster);
      mine = chosen.concat(R().fill(size, size, setup.diff, rules, chosen)).map((r) => ({ id: r.id, a: setup.abil[r.id] || 0 }));
      mine.forEach((m) => taken.add(m.id));
    }   // sin repetir: cada ronda se elige el equipo (ver setTeam)
    const teams = [{ name: 'Tu equipo', human: true, members: mine }];
    U.shuffle(CLUBS).slice(0, n - 1).forEach((club, i) => teams.push(cpuTeam(club, i, size + BENCH, setup.diff, rules, taken)));
    return base(setup, Object.assign(rules, { teams: n }), teams);
  }

  /**
   * Torneo online donde cada humano tiene su propio equipo. humans: [{ id, name, picks: [{ id, a }] }].
   * Los cruces con humanos se juegan en cola (el motor online hace un partido a la vez).
   */
  function createCup(setup, humans) {
    const size = setup.size, rules = Object.assign({}, R().get(setup), { norepeat: false }), n = teamsOf(rules);
    const taken = new Set();
    const teams = humans.map((h) => {
      const members = R().build(h.picks, size, setup.diff, rules);
      members.forEach((x) => taken.add(x.id));
      return { name: h.name, human: true, owner: h.id, members };
    });
    U.shuffle(CLUBS).slice(0, n - teams.length).forEach((club, i) => teams.push(cpuTeam(club, i, size + BENCH, setup.diff, rules, taken)));
    const t = base(setup, Object.assign(rules, { teams: n }), teams);
    t.cup = true;
    t.prizes = null;
    return t;
  }

  /** Torneos guardados antes de las reglas / las series: les faltan campos. */
  function normalize(t) {
    if (!t.rules) t.rules = PF.Rules.get(null);
    if (!t.stadiums) t.stadiums = [t.stadium, t.stadium, t.stadium];
    if (!t.used) t.used = [];
    if (!t.nTeams) t.nTeams = 8;
    if (!t.nRounds) t.nRounds = 3;
    return t;
  }

  const humanIdx = (t) => t.teams.findIndex((x) => x.human);
  const stadiumFor = (t) => t.stadiums[t.round] || t.stadium;

  // ------------------------------------------------------------------ torneo de uno
  /** Partido pendiente de tu equipo en la ronda actual (o null: eliminado, o terminó). */
  function myMatch(t) {
    if (t.champion != null || t.out) return null;
    const h = humanIdx(t);
    return t.rounds[t.round].find((m) => m.w == null && (m.a === h || m.b === h)) || null;
  }

  /** ¿Hay que elegir equipo antes de este partido? (sin repetir: al empezar cada cruce) */
  const needsPick = (t, match) => !!t.rules.norepeat && played(match) === 0;

  /** Pokémon ya usados en el torneo (sin repetir). */
  const usedSet = (t) => new Set(t.used);

  /** Fija tu equipo de este cruce (ids del roster, titulares primero) y los marca como usados. */
  function setTeam(t, ids, abil) {
    t.teams[humanIdx(t)].members = ids.map((id) => ({ id, a: abil[id] || 0 }));
    for (const id of ids) if (!t.used.includes(id)) t.used.push(id);
  }

  function poisson(l) {
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  /** Resultado simulado entre dos equipos de la CPU según su fuerza (con algo de azar). */
  function simulate(t, m) {
    const str = (i) => t.teams[i].members.slice(0, t.size).reduce((s, x) => s + (RANK[roster(x.id).tier] || 1), 0) * (0.85 + Math.random() * 0.3);
    const ra = str(m.a), rb = str(m.b);
    const game = () => [poisson(U.clamp(1.6 * (ra / rb) ** 1.1, 0.4, 4.5)), poisson(U.clamp(1.6 * (rb / ra) ** 1.1, 0.4, 4.5))];
    const coin = () => Math.random() < ra / (ra + rb);
    if (m.bo) {
      const need = Math.ceil(m.bo / 2);
      let wa = 0, wb = 0;
      while (wa < need && wb < need) { const [x, y] = game(); if (x > y || (x === y && coin())) wa++; else wb++; }
      m.sa = wa; m.sb = wb; m.pen = false; m.w = wa > wb ? m.a : m.b;
      return;
    }
    let [sa, sb] = game();
    if (m.legs === 2) { const [a2, b2] = game(); sa += a2; sb += b2; }
    m.sa = sa; m.sb = sb;
    m.pen = sa === sb;
    m.w = sa > sb ? m.a : sb > sa ? m.b : (coin() ? m.a : m.b);
  }

  /**
   * Anota el resultado de tu partido (engine = partido del motor; tu equipo es el 0).
   * Devuelve 'next' si el cruce sigue o 'done' si quedó resuelto.
   */
  function report(t, match, engine) {
    const h = humanIdx(t), mine = engine.score[0], theirs = engine.score[1], aIsMe = match.a === h;
    const other = aIsMe ? match.b : match.a;
    const r = recordGame(match, aIsMe ? mine : theirs, aIsMe ? theirs : mine, engine.winner === 0 ? h : engine.winner === 1 ? other : null);
    if (r === 'done' && match.w !== h) t.out = roundName(t, t.round);
    return r;
  }

  /** Arma la ronda siguiente con los ganadores (o fija al campeón). true = terminó. */
  function nextRound(t) {
    const cur = t.rounds[t.round];
    if (t.round === t.nRounds - 1) { t.champion = cur[0].w; return true; }
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(mkMatch(t.rules, t.round + 1, t.nRounds, cur[i].w, cur[i + 1].w));
    t.rounds.push(next);
    t.round++;
    return false;
  }

  /** Resuelve el resto de la ronda y arma la siguiente; devuelve true si el torneo terminó. */
  function advance(t) {
    const cur = t.rounds[t.round];
    const mine = myMatch(t);
    for (const m of cur) if (m.w == null && m !== mine) simulate(t, m);
    if (cur.some((m) => m.w == null)) return false;   // falta jugar el tuyo
    return nextRound(t);
  }

  /** Si estás eliminado, el torneo sigue solo hasta el campeón. */
  function finishAll(t) {
    let guard = 0;
    while (t.champion == null && guard++ < 5) advance(t);
  }

  /** Premio base por la etapa alcanzada (más rondas, más premio). */
  const prizeFor = (t, stage) => Math.round((PRIZE[stage] || 0) * (DIFF_MULT[t.diff] || 1) * (t.time / 120) ** 0.5 * ((t.nRounds || 3) / 3));

  /** Monedas por la etapa alcanzada (se paga una sola vez, al terminar tu participación). */
  function prizeOf(t) {
    const h = humanIdx(t);
    return prizeFor(t, t.champion === h ? 'Campeón' : t.out);
  }

  /**
   * Datos del partido de tu equipo para main.js:
   * { mine, bench, opp, oppBench, rival, leg (0 único · 1 ida · 2 vuelta), startScore, allowDraw, game (n.º en la serie) }.
   */
  function matchSetup(t, match) {
    const h = humanIdx(t), aIsMe = match.a === h, rivalIdx = aIsMe ? match.b : match.a, rival = t.teams[rivalIdx];
    const mine = t.teams[h].members.map(withAbil), opp = rival.members.map(withAbil);
    const leg = match.legs === 2 ? (match.l1 ? 2 : 1) : 0;
    const startScore = leg === 2 ? (aIsMe ? match.l1.slice() : [match.l1[1], match.l1[0]]) : null;
    return {
      mine: mine.slice(0, t.size), bench: mine.slice(t.size), opp: opp.slice(0, t.size), oppBench: opp.slice(t.size),
      rival, rivalIdx, leg, startScore, allowDraw: leg === 1, game: played(match) + 1,
    };
  }

  /** Cómo quedó tu equipo: 'Campeón', 'Final', 'Semifinales', ... o null (sigue). */
  function standing(t) {
    if (t.champion != null) return t.champion === humanIdx(t) ? 'Campeón' : t.out;
    return t.out || null;
  }

  // ------------------------------------------------------------------ torneo online: cada uno con su equipo
  // Varios humanos (cada uno con su equipo) en el mismo cuadro con equipos de la CPU. El motor online juega
  // un partido a la vez: los cruces con humanos se juegan en cola (los demás miran) y los de CPU contra
  // CPU se resuelven al terminar los humanos de la ronda. Dos humanos que se cruzan juegan entre sí.

  const isHumanTie = (t, m) => t.teams[m.a].human || t.teams[m.b].human;

  /**
   * Partidos con humanos por jugar en la ronda, los de menos partidos jugados primero (así las idas van antes
   * que las vueltas y las series avanzan parejas): [{ match, leg, game }].
   */
  function cupPending(t) {
    if (t.champion != null) return [];
    return t.rounds[t.round]
      .filter((m) => m.w == null && isHumanTie(t, m))
      .map((m, i) => ({ match: m, i }))
      .sort((x, y) => played(x.match) - played(y.match) || x.i - y.i)
      .map(({ match }) => ({ match, leg: match.legs === 2 ? (match.l1 ? 2 : 1) : 0, game: played(match) + 1 }));
  }
  const cupNext = (t) => cupPending(t)[0] || null;

  /** Cómo se arma el partido del motor: e0 / e1 = equipos del cuadro en el lado 0 y 1 (el humano, primero). */
  function cupSetup(t, entry) {
    const m = entry.match;
    const e0 = !t.teams[m.a].human && t.teams[m.b].human ? m.b : m.a;
    const e1 = e0 === m.a ? m.b : m.a;
    const startScore = entry.leg === 2 ? (e0 === m.a ? m.l1.slice() : [m.l1[1], m.l1[0]]) : null;
    return { e0, e1, leg: entry.leg, game: entry.game, startScore, allowDraw: entry.leg === 1 };
  }

  /** Anota un partido jugado (engine.score[0] es de e0). Devuelve 'next' o 'done'. */
  function cupReport(t, entry, e0, engine) {
    const m = entry.match, e1 = e0 === m.a ? m.b : m.a;
    const s0 = engine.score[0], s1 = engine.score[1];
    const r = recordGame(m, e0 === m.a ? s0 : s1, e0 === m.a ? s1 : s0, engine.winner === 0 ? e0 : engine.winner === 1 ? e1 : null);
    if (r === 'done') markOut(t, m);
    return r;
  }

  /** El perdedor humano de un cruce resuelto queda eliminado en esa ronda. */
  function markOut(t, m) {
    const loser = m.w === m.a ? m.b : m.a;
    if (t.teams[loser].human) t.teams[loser].out = roundName(t, t.round);
  }

  /** Nadie conectado en ese cruce: se resuelve solo. */
  function cupSim(t, entry) {
    simulate(t, entry.match);
    markOut(t, entry.match);
  }

  /** Cuando no quedan partidos con humanos en la ronda, resuelve el resto y avanza. true = terminó. */
  function cupAdvance(t) {
    let guard = 0;
    while (t.champion == null && guard++ < 5) {
      if (cupPending(t).length) return false;
      for (const m of t.rounds[t.round]) if (m.w == null) simulate(t, m);
      nextRound(t);
    }
    return t.champion != null;
  }

  /** Cómo le fue a un equipo: 'Campeón', 'Final', ... o null (sigue). */
  function standingOf(t, i) {
    return t.champion === i ? 'Campeón' : t.teams[i].out || null;
  }

  /** Premio de cada humano por la etapa alcanzada (al terminar el torneo). */
  function cupPrizes(t) {
    t.prizes = {};
    t.teams.forEach((x, i) => { if (x.human) t.prizes[i] = prizeFor(t, standingOf(t, i)); });
  }

  return {
    ROUND_NAMES, roundNames, roundName, matchesIn, normalize, create, createCup, humanIdx, myMatch, needsPick, usedSet, setTeam,
    stadiumFor, report, advance, finishAll, prizeOf, matchSetup, standing, wins, winsFor, played, seriesNote,
    cupPending, cupNext, cupSetup, cupReport, cupSim, cupAdvance, cupPrizes, standingOf,
  };
})();
