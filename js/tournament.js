/* ============ tournament.js — torneo local de eliminación directa ============
 * 8 equipos (el tuyo y 7 de la CPU): cuartos, semis y final. Los partidos de tu
 * equipo se juegan con el motor de siempre; los demás se resuelven al instante
 * según la fuerza de cada equipo. Se guarda en PF.Save.data.tournament, así que
 * se puede dejar y seguir después. Las reglas (rules.js) valen para todos los
 * equipos; las propias del torneo son sin repetir, ida y vuelta y canchas rotativas.
 *
 * t = { size, time, diff, stadium, stadiums, keeper, rules, teams: [equipo], rounds: [[partido]],
 *       round, used, champion, out, prize }
 * equipo  = { name, human?, members: [{ id, a }] }   (id del roster y habilidad; los primeros `size` juegan)
 * partido = { a, b, sa, sb, pen, w, legs, l1 }        (índices de equipo; w = ganador o null;
 *                                                      legs 2: l1 = [goles de a, goles de b] en la ida)
 */
PF.Tournament = (() => {
  const U = PF.U;
  const R = () => PF.Rules;
  const ROUNDS = ['Cuartos de final', 'Semifinales', 'Final'];
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
  const CITIES = ['Plateada', 'Celeste', 'Carmín', 'Azulona', 'Azafrán', 'Canela', 'Verde', 'Fucsia', 'Lavanda', 'Paleta'];

  const RANK = { f1: 1, f2: 2, f3: 3, strong: 3, elite: 4, legend: 5 };
  const PRIZE = { 'Final': 120, 'Campeón': 300, 'Semifinales': 50 };   // monedas por la etapa alcanzada
  const DIFF_MULT = { easy: 0.6, normal: 1, hard: 1.6 };

  const roster = (id) => PF.rosterById(id);
  const withAbil = (m) => PF.withAbility(roster(m.id), m.a);
  const toMembers = (rs) => rs.map((r) => ({ id: r.id, a: Math.random() < 0.5 ? 0 : 1 }));

  /** Equipo de la CPU: temático si las reglas lo permiten; si no, con nombre de ciudad. */
  function cpuTeam(club, i, n, diff, rules, taken) {
    const themed = !rules.types.length && !rules.distinct;
    const rs = themed ? Object.assign({}, rules, { types: [club.type] }) : rules;
    let picks = R().fill(n, n - BENCH, diff, rs, [], taken);
    if (picks.length < n) picks = R().fill(n, n - BENCH, diff, rs, [], new Set());   // reglas muy estrechas: se repiten
    picks.forEach((r) => taken.add(r.id));
    return { name: themed ? club.name : `${CITIES[i % CITIES.length]} FC`, type: themed ? club.type : null, members: toMembers(picks) };
  }

  /** Arma un torneo con la configuración del partido rápido (formato, tiempo, dificultad, cancha, reglas). */
  function create(setup) {
    const size = setup.size, rules = R().get(setup);
    const taken = new Set(setup.picks);
    let mine = [];
    if (!rules.norepeat) {
      // equipo incompleto: el resto, al azar (como en el partido rápido)
      const chosen = setup.picks.map(roster);
      mine = chosen.concat(R().fill(size, size, setup.diff, rules, chosen)).map((r) => ({ id: r.id, a: setup.abil[r.id] || 0 }));
      mine.forEach((m) => taken.add(m.id));
    }   // sin repetir: cada ronda se elige el equipo (ver setTeam)
    const teams = [{ name: 'Tu equipo', human: true, members: mine }];
    U.shuffle(CLUBS).slice(0, 7).forEach((club, i) => teams.push(cpuTeam(club, i, size + BENCH, setup.diff, rules, taken)));
    const slots = U.shuffle(teams.map((_, i) => i));
    const legs = rules.legs === 2 ? 2 : 1;
    const first = [];
    for (let i = 0; i < 8; i += 2) first.push({ a: slots[i], b: slots[i + 1], sa: null, sb: null, pen: false, w: null, legs, l1: null });
    // canchas: la elegida, o una distinta por ronda entre las que tienes
    const own = PF.Save.data.stadiums.filter((s) => PF.STADIUMS.some((x) => x.id === s));
    const stadiums = rules.rotate && own.length > 1 ? U.shuffle(own).concat(U.shuffle(own)).slice(0, 3) : [setup.stadium, setup.stadium, setup.stadium];
    return {
      size, time: setup.time, diff: setup.diff, stadium: setup.stadium, stadiums, keeper: setup.keeper, rules,
      teams, rounds: [first], round: 0, used: [], champion: null, out: null, prize: 0,
    };
  }

  /** Torneos guardados antes de las reglas: les faltan campos. */
  function normalize(t) {
    if (!t.rules) t.rules = PF.Rules.get(null);
    if (!t.stadiums) t.stadiums = [t.stadium, t.stadium, t.stadium];
    if (!t.used) t.used = [];
    return t;
  }

  const humanIdx = (t) => t.teams.findIndex((x) => x.human);
  const roundName = (r) => ROUNDS[r];
  const stadiumFor = (t) => t.stadiums[t.round] || t.stadium;

  /** Partido pendiente de tu equipo en la ronda actual (o null: eliminado, o terminó). */
  function myMatch(t) {
    if (t.champion != null || t.out) return null;
    const h = humanIdx(t);
    return t.rounds[t.round].find((m) => m.w == null && (m.a === h || m.b === h)) || null;
  }

  /** ¿Hay que elegir equipo antes de este partido? (sin repetir: al empezar cada cruce) */
  const needsPick = (t, match) => !!t.rules.norepeat && !match.l1;

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
    const leg = (x, y) => [poisson(U.clamp(1.6 * (x / y) ** 1.1, 0.4, 4.5)), poisson(U.clamp(1.6 * (y / x) ** 1.1, 0.4, 4.5))];
    let [sa, sb] = leg(ra, rb);
    if (m.legs === 2) { const [a2, b2] = leg(ra, rb); sa += a2; sb += b2; }
    m.sa = sa; m.sb = sb;
    m.pen = sa === sb;
    m.w = sa > sb ? m.a : sb > sa ? m.b : (Math.random() < ra / (ra + rb) ? m.a : m.b);
  }

  /**
   * Anota el resultado de tu partido (engine = partido del motor; tu equipo es el 0).
   * Devuelve 'leg1' si era la ida (el cruce sigue) o 'done' si el cruce quedó resuelto.
   */
  function report(t, match, engine) {
    const h = humanIdx(t), mine = engine.score[0], theirs = engine.score[1], aIsMe = match.a === h;
    if (match.legs === 2 && !match.l1) {
      match.l1 = aIsMe ? [mine, theirs] : [theirs, mine];
      return 'leg1';
    }
    match.sa = aIsMe ? mine : theirs;   // en la vuelta el motor ya trae el global
    match.sb = aIsMe ? theirs : mine;
    match.pen = false;
    const humanWon = engine.winner === 0;
    match.w = humanWon ? h : (aIsMe ? match.b : match.a);
    if (!humanWon) t.out = roundName(t.round);
    return 'done';
  }

  /** Resuelve el resto de la ronda y arma la siguiente; devuelve true si el torneo terminó. */
  function advance(t) {
    const cur = t.rounds[t.round];
    const mine = myMatch(t);
    for (const m of cur) if (m.w == null && m !== mine) simulate(t, m);
    if (cur.some((m) => m.w == null)) return false;   // falta jugar el tuyo
    if (t.round === 2) { t.champion = cur[0].w; return true; }
    const legs = t.rules.legs === 2 && t.round + 1 < 2 ? 2 : 1;   // la final es a partido único
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push({ a: cur[i].w, b: cur[i + 1].w, sa: null, sb: null, pen: false, w: null, legs, l1: null });
    t.rounds.push(next);
    t.round++;
    return false;
  }

  /** Si estás eliminado, el torneo sigue solo hasta el campeón. */
  function finishAll(t) {
    let guard = 0;
    while (t.champion == null && guard++ < 5) advance(t);
  }

  /** Monedas por la etapa alcanzada (se paga una sola vez, al terminar tu participación). */
  function prizeOf(t) {
    const h = humanIdx(t);
    const stage = t.champion === h ? 'Campeón' : t.out;
    return Math.round((PRIZE[stage] || 0) * (DIFF_MULT[t.diff] || 1) * (t.time / 120) ** 0.5);
  }

  /**
   * Datos del partido de tu equipo para main.js:
   * { mine, bench, opp, oppBench, rival, leg (0 único · 1 ida · 2 vuelta), startScore, allowDraw }.
   */
  function matchSetup(t, match) {
    const h = humanIdx(t), aIsMe = match.a === h, rivalIdx = aIsMe ? match.b : match.a, rival = t.teams[rivalIdx];
    const mine = t.teams[h].members.map(withAbil), opp = rival.members.map(withAbil);
    const leg = match.legs === 2 ? (match.l1 ? 2 : 1) : 0;
    const startScore = leg === 2 ? (aIsMe ? match.l1.slice() : [match.l1[1], match.l1[0]]) : null;
    return {
      mine: mine.slice(0, t.size), bench: mine.slice(t.size), opp: opp.slice(0, t.size), oppBench: opp.slice(t.size),
      rival, rivalIdx, leg, startScore, allowDraw: leg === 1,
    };
  }

  /** Cómo quedó tu equipo: 'Campeón', 'Final', 'Semifinales', 'Cuartos de final' o null (sigue). */
  function standing(t) {
    if (t.champion != null) return t.champion === humanIdx(t) ? 'Campeón' : t.out;
    return t.out || null;
  }

  return { ROUNDS, normalize, create, humanIdx, myMatch, needsPick, usedSet, setTeam, stadiumFor, report, advance, finishAll, prizeOf, matchSetup, standing, roundName };
})();
