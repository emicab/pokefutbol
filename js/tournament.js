/* ============ tournament.js — torneo local de eliminación directa ============
 * 8 equipos (el tuyo y 7 de la CPU, cada uno de un tipo): cuartos, semis y final.
 * Los partidos de tu equipo se juegan con el motor de siempre; los demás se
 * resuelven al instante según la fuerza de cada equipo. Se guarda en
 * PF.Save.data.tournament, así que se puede dejar y seguir después.
 *
 * t = { size, time, diff, stadium, keeper, teams: [equipo], rounds: [[partido]], round,
 *       champion, out, prize }
 * equipo  = { name, human?, members: [{ id, a }] }   (id del roster y habilidad; los primeros `size` juegan)
 * partido = { a, b, sa, sb, pen, w }                   (índices de equipo; w = ganador o null)
 */
PF.Tournament = (() => {
  const U = PF.U;
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

  /** Peso de cada tier al armar los equipos de la CPU (más fuertes en Difícil). */
  const WEIGHTS = {
    easy: { f1: 75, f2: 8, f3: 1.5, strong: 0.8, elite: 0, legend: 0 },
    normal: { f1: 55, f2: 24, f3: 6, strong: 4, elite: 0.6, legend: 0 },
    hard: { f1: 28, f2: 40, f3: 14, strong: 10, elite: 3, legend: 0 },
  };
  const RANK = { f1: 1, f2: 2, f3: 3, strong: 3, elite: 4, legend: 5 };
  const PRIZE = { 'Final': 120, 'Campeón': 300, 'Semifinales': 50 };   // monedas por la etapa alcanzada
  const DIFF_MULT = { easy: 0.6, normal: 1, hard: 1.6 };

  const save = () => PF.Save.save();
  const roster = (id) => PF.rosterById(id);
  const withAbil = (m) => PF.withAbility(roster(m.id), m.a);

  /** Elige n del pool según el peso de su tier. */
  function pickWeighted(pool, n, W) {
    const left = pool.slice(), out = [];
    while (out.length < n && left.length) {
      const total = left.reduce((s, r) => s + (W[r.tier] || 0), 0);
      if (total <= 0) break;
      let x = Math.random() * total, k = 0;
      while (k < left.length - 1 && (x -= W[left[k].tier] || 0) > 0) k++;
      out.push(left.splice(k, 1)[0]);
    }
    return out;
  }

  /** Equipo de la CPU del tipo del club (si el tipo no alcanza, se completa con otros). */
  function cpuTeam(club, n, diff, taken) {
    const W = WEIGHTS[diff] || WEIGHTS.normal;
    const free = PF.ROSTER.filter((r) => !taken.has(r.id) && (W[r.tier] || 0) > 0);
    const ofType = free.filter((r) => PF.typesOf(r).includes(club.type));
    let picks = pickWeighted(ofType, n, W);
    if (picks.length < n) picks = picks.concat(pickWeighted(free.filter((r) => !picks.includes(r)), n - picks.length, W));
    picks.forEach((r) => taken.add(r.id));
    return picks.map((r) => ({ id: r.id, a: Math.random() < 0.5 ? 0 : 1 }));
  }

  /** Arma un torneo con la configuración del partido rápido (formato, tiempo, dificultad, cancha). */
  function create(setup) {
    const size = setup.size;
    const mine = setup.picks.map((id) => ({ id, a: setup.abil[id] || 0 }));
    const taken = new Set(setup.picks);
    // equipo incompleto: el resto, al azar (como en el partido rápido)
    for (const id of PF.randomFill(setup.picks, Math.max(0, size - mine.length))) { mine.push({ id, a: 0 }); taken.add(id); }
    const teams = [{ name: 'Tu equipo', human: true, members: mine }];
    for (const club of U.shuffle(CLUBS).slice(0, 7)) {
      teams.push({ name: club.name, type: club.type, members: cpuTeam(club, size + BENCH, setup.diff, taken) });
    }
    const slots = U.shuffle(teams.map((_, i) => i));
    const first = [];
    for (let i = 0; i < 8; i += 2) first.push({ a: slots[i], b: slots[i + 1], sa: null, sb: null, pen: false, w: null });
    return {
      size, time: setup.time, diff: setup.diff, stadium: setup.stadium, keeper: setup.keeper,
      teams, rounds: [first], round: 0, champion: null, out: null, prize: 0,
    };
  }

  const humanIdx = (t) => t.teams.findIndex((x) => x.human);
  const roundName = (r) => ROUNDS[r];

  /** Partido pendiente de tu equipo en la ronda actual (o null: eliminado, o terminó). */
  function myMatch(t) {
    if (t.champion != null || t.out) return null;
    const h = humanIdx(t);
    return t.rounds[t.round].find((m) => m.w == null && (m.a === h || m.b === h)) || null;
  }

  const strength = (team) => team.members.slice(0, 5).reduce((s, m) => s + (RANK[roster(m.id).tier] || 1), 0);

  function poisson(l) {
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  /** Resultado simulado entre dos equipos de la CPU según su fuerza (con algo de azar). */
  function simulate(t, m) {
    const sz = t.size;
    const str = (i) => t.teams[i].members.slice(0, sz).reduce((s, x) => s + (RANK[roster(x.id).tier] || 1), 0) * (0.85 + Math.random() * 0.3);
    const ra = str(m.a), rb = str(m.b);
    m.sa = poisson(U.clamp(1.6 * (ra / rb) ** 1.1, 0.4, 4.5));
    m.sb = poisson(U.clamp(1.6 * (rb / ra) ** 1.1, 0.4, 4.5));
    m.pen = m.sa === m.sb;
    m.w = m.sa > m.sb ? m.a : m.sb > m.sa ? m.b : (Math.random() < ra / (ra + rb) ? m.a : m.b);
  }

  /** Anota el resultado de tu partido (m = partido del motor; tu equipo es el 0). */
  function report(t, match, engine) {
    const h = humanIdx(t);
    const mine = engine.score[0], theirs = engine.score[1];
    match.sa = match.a === h ? mine : theirs;
    match.sb = match.a === h ? theirs : mine;
    match.pen = false;
    const humanWon = engine.winner === 0;
    match.w = humanWon ? h : (match.a === h ? match.b : match.a);
    if (!humanWon) t.out = roundName(t.round);
  }

  /** Resuelve el resto de la ronda y arma la siguiente; devuelve true si el torneo terminó. */
  function advance(t) {
    const cur = t.rounds[t.round];
    for (const m of cur) if (m.w == null && !(myMatch(t) === m)) simulate(t, m);
    if (cur.some((m) => m.w == null)) return false;   // falta jugar el tuyo
    if (t.round === 2) { t.champion = cur[0].w; return true; }
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push({ a: cur[i].w, b: cur[i + 1].w, sa: null, sb: null, pen: false, w: null });
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

  /** Datos del partido de tu equipo para main.js: { mine, bench, opp, oppBench, rival }. */
  function matchSetup(t, match) {
    const h = humanIdx(t), rivalIdx = match.a === h ? match.b : match.a, rival = t.teams[rivalIdx];
    const mine = t.teams[h].members.map(withAbil), opp = rival.members.map(withAbil);
    return { mine: mine.slice(0, t.size), bench: mine.slice(t.size), opp: opp.slice(0, t.size), oppBench: opp.slice(t.size), rival, rivalIdx };
  }

  /** Cómo quedó tu equipo: 'Campeón', 'Final', 'Semifinales', 'Cuartos de final' o null (sigue). */
  function standing(t) {
    if (t.champion != null) return t.champion === humanIdx(t) ? 'Campeón' : t.out;
    return t.out || null;
  }

  return { ROUNDS, create, humanIdx, myMatch, report, advance, finishAll, prizeOf, matchSetup, standing, roundName, strength };
})();
