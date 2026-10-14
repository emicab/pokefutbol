/* ============ rules.js — reglas especiales del partido rápido y el torneo ============
 * Se guardan en PF.Save.data.setup.rules (cualquier campo que falte vale el de DEFAULTS).
 *
 *   types      sólo Pokémon con alguno de estos tipos ([] = todos)
 *   tiers      sólo de estas fases/tiers ([] = todos): f1 f2 f3 strong elite legend
 *   distinct   los titulares no comparten ningún tipo
 *   cap        presupuesto de tiers de los titulares: 0 libre · 1 ajustado · 2 medio
 *   pure       fútbol puro: sin habilidades
 *   goal       0 normal · 1 gol de oro (el primero que marca gana) · 3 primero a 3 goles
 *   norepeat   (torneo) cada Pokémon juega una sola vez en todo el torneo
 *   teams      (torneo) equipos del cuadro: 4, 8 o 16
 *   legs       (torneo) serie de cada cruce: 1 único · 2 ida y vuelta (menos la final) · 3 o 5: al mejor de 3 o 5
 *   rotate     (torneo) una cancha distinta en cada ronda
 */
PF.Rules = (() => {
  const U = PF.U;
  const DEFAULTS = { types: [], tiers: [], distinct: false, cap: 0, pure: false, goal: 0, norepeat: false, teams: 8, legs: 1, rotate: false };
  const COST = { f1: 1, f2: 2, f3: 3, strong: 4, elite: 5, legend: 6 };
  const CAP_PER_SLOT = [Infinity, 1.5, 2.5];
  const GOAL_LABEL = { 1: 'Gol de oro', 3: 'Primero a 3' };

  /** Peso de cada tier al armar equipos de la CPU (más fuertes en Difícil). */
  const WEIGHTS = {
    easy: { f1: 75, f2: 8, f3: 1.5, strong: 0.8, elite: 0, legend: 0 },
    normal: { f1: 55, f2: 24, f3: 6, strong: 4, elite: 0.6, legend: 0 },
    hard: { f1: 28, f2: 40, f3: 14, strong: 10, elite: 3, legend: 0 },
  };

  const get = (setup) => Object.assign({}, DEFAULTS, (setup && setup.rules) || {});

  /** ¿Hay alguna regla puesta? (en el partido rápido; norepeat/legs/rotate son del torneo) */
  const restricts = (r) => r.types.length > 0 || r.tiers.length > 0 || r.distinct || r.cap > 0;
  const isDefault = (r, tournament = true) =>
    !restricts(r) && !r.pure && !r.goal && !(tournament && (r.norepeat || r.legs > 1 || r.teams !== 8 || r.rotate));

  /** ¿Este Pokémon del plantel cumple los filtros de tipo y fase? */
  function allows(r, rules) {
    if (rules.types.length && !PF.typesOf(r).some((t) => rules.types.includes(t))) return false;
    if (rules.tiers.length && !rules.tiers.includes(r.tier)) return false;
    return true;
  }

  const cost = (r) => COST[r.tier] || 1;
  const capOf = (rules, size) => (rules.cap ? Math.round(size * CAP_PER_SLOT[rules.cap]) : Infinity);

  /** Por qué un Pokémon no se puede elegir (o null si sí). */
  function whyNot(r, rules) {
    if (rules.types.length && !PF.typesOf(r).some((t) => rules.types.includes(t))) return 'No es de los tipos permitidos';
    if (rules.tiers.length && !rules.tiers.includes(r.tier)) return 'No es de las fases permitidas';
    return null;
  }

  /** Revisa los titulares (entradas del plantel): devuelve un mensaje de error o null. */
  function teamError(starters, rules, size) {
    const bad = starters.find((r) => !allows(r, rules));
    if (bad) return `${bad.name} no cumple las reglas`;
    if (rules.distinct) {
      const seen = new Map();
      for (const r of starters) for (const t of PF.typesOf(r)) {
        if (seen.has(t)) return `${seen.get(t).name} y ${r.name} comparten el tipo ${PF.TYPE_ES[t] || t}`;
        seen.set(t, r);
      }
    }
    const cap = capOf(rules, size);
    const total = starters.reduce((s, r) => s + cost(r), 0);
    if (total > cap) return `Presupuesto pasado: ${total} de ${cap} puntos`;
    return null;
  }

  /**
   * Arma n Pokémon al azar (para la CPU o para completar tu equipo) que cumplan las reglas.
   * `base` = los ya elegidos (cuentan para tipos distintos y presupuesto) · `taken` = ids prohibidos.
   * Los primeros `size` de la lista final son los titulares.
   */
  function fill(n, size, diff, rules, base = [], taken = new Set()) {
    const W = Object.assign({}, WEIGHTS[diff] || WEIGHTS.normal);
    for (const t of rules.tiers) W[t] = Math.max(W[t] || 0, 5);   // si pediste ese tier, aparece aunque pese poco
    const ids = new Set([...taken, ...base.map((r) => r.id)]);
    const pool = PF.ROSTER.filter((r) => !ids.has(r.id) && allows(r, rules) && (W[r.tier] || 0) > 0);
    const out = [];
    const types = new Set(base.flatMap((r) => PF.typesOf(r)));
    let spent = base.reduce((s, r) => s + cost(r), 0);
    const cap = capOf(rules, size);
    const left = pool.slice();
    while (base.length + out.length < n && left.length) {
      const total = left.reduce((s, r) => s + W[r.tier], 0);
      let x = Math.random() * total, k = 0;
      while (k < left.length - 1 && (x -= W[left[k].tier]) > 0) k++;
      const r = left.splice(k, 1)[0];
      const starter = base.length + out.length < size;
      if (starter && rules.distinct && PF.typesOf(r).some((t) => types.has(t))) continue;
      if (starter && spent + cost(r) > cap) continue;
      if (starter) { PF.typesOf(r).forEach((t) => types.add(t)); spent += cost(r); }
      out.push(r);
    }
    // si las reglas no dejan suficientes, se completa con lo que haya
    if (base.length + out.length < n) {
      const rest = PF.ROSTER.filter((r) => !ids.has(r.id) && !out.includes(r) && allows(r, rules));
      out.push(...U.shuffle(rest).slice(0, n - base.length - out.length));
    }
    return out;
  }

  /**
   * Arma el equipo de un jugador con sus elecciones (picks: [{ id, a }]) respetando las reglas: los titulares
   * (size) que cumplan, el resto al azar si faltan, y hasta benchMax suplentes. Devuelve [{ id, a }] (titulares primero).
   */
  function build(picks, size, diff, rules, benchMax = 2) {
    const out = [], types = new Set(), cap = capOf(rules, size);
    let spent = 0;
    for (const p of picks) {
      const r = PF.rosterById(p.id);
      if (out.length >= size) break;
      if (!r || out.some((q) => q.id === p.id) || !allows(r, rules)) continue;
      if (rules.distinct && PF.typesOf(r).some((t) => types.has(t))) continue;
      if (spent + cost(r) > cap) continue;
      PF.typesOf(r).forEach((t) => types.add(t));
      spent += cost(r);
      out.push({ id: p.id, a: p.a || 0 });
    }
    for (const r of fill(size, size, diff, rules, out.map((q) => PF.rosterById(q.id)))) out.push({ id: r.id, a: 0 });
    let bench = 0;
    for (const p of picks) {
      const r = PF.rosterById(p.id);
      if (bench >= benchMax) break;
      if (r && !out.some((q) => q.id === p.id) && allows(r, rules)) { out.push({ id: p.id, a: p.a || 0 }); bench++; }
    }
    return out;
  }

  /** Cuántos Pokémon (de los que tienes) pueden jugar con estas reglas. */
  const available = (rules) => PF.ROSTER.filter((r) => PF.isUnlocked(r) && allows(r, rules)).length;

  /** Líneas cortas para mostrar las reglas activas. */
  function summary(rules, tournament = true) {
    const out = [];
    if (rules.types.length) out.push('Sólo ' + rules.types.map((t) => PF.TYPE_ES[t] || t).join(' / '));
    if (rules.tiers.length) out.push('Sólo ' + rules.tiers.map((t) => PF.TIERS[t].label).join(' / '));
    if (rules.distinct) out.push('Tipos distintos');
    if (rules.cap) out.push(['', 'Presupuesto ajustado', 'Presupuesto medio'][rules.cap]);
    if (rules.pure) out.push('Fútbol puro');
    if (rules.goal) out.push(GOAL_LABEL[rules.goal]);
    if (tournament) {
      if (rules.norepeat) out.push('Sin repetir');
      if (rules.teams !== 8) out.push(`${rules.teams} equipos`);
      if (rules.legs === 2) out.push('Ida y vuelta');
      if (rules.legs === 3 || rules.legs === 5) out.push(`Mejor de ${rules.legs}`);
      if (rules.rotate) out.push('Canchas rotativas');
    }
    return out;
  }

  /** Atajos de la pantalla de reglas. */
  const PRESETS = [
    { name: 'Libre', rules: {} },
    { name: 'Copa de bronce', desc: 'Sólo fase 1', rules: { tiers: ['f1'] } },
    { name: 'Copa de élite', desc: 'Fase 3 en adelante', rules: { tiers: ['f3', 'strong', 'elite', 'legend'] } },
    { name: 'Colores', desc: 'Tipos distintos', rules: { distinct: true } },
    { name: 'Barato', desc: 'Presupuesto ajustado', rules: { cap: 1 } },
    { name: 'Fútbol puro', desc: 'Sin habilidades', rules: { pure: true } },
    { name: 'Muerte súbita', desc: 'El primer gol gana', rules: { goal: 1 } },
    { name: 'Maratón', desc: 'Sin repetir + ida y vuelta', rules: { norepeat: true, legs: 2 } },
  ];

  return { DEFAULTS, COST, GOAL_LABEL, PRESETS, get, restricts, isDefault, allows, whyNot, cost, capOf, teamError, fill, build, available, summary };
})();
