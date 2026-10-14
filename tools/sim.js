/* ============ sim.js — partidos CPU contra CPU sin pantalla, para medir la IA ============
 * Carga el motor real del juego (match, habilidades, física, IA) en Node, sin
 * canvas ni audio, y enfrenta dos versiones de ai.js. Cada partido se juega dos
 * veces con los mismos equipos cambiando qué IA maneja a cuál (espejo), así la
 * suerte del sorteo de Pokémon no pesa.
 *
 *   node tools/sim.js [--a=ruta/ai.js] [--b=ruta/ai.js] [--n=20] [--size=2|3|5]
 *                     [--diff=normal] [--diffA=…] [--diffB=…] [--time=120] [--keeper=dynamic|fixed]
 *                     [--stadium=estadio] [--pure] [--seed=1] [--tacticA=atk|neutral|def] [--tacticB=…]
 *
 * Por defecto A = js/ai.js (la actual) y B = la misma: sirve para ver el ruido
 * (con 40 partidos espejo, ±10 % en los goles es azar). Para comparar con otra versión:
 *   git show <commit>:js/ai.js > /tmp/ai_old.js && node tools/sim.js --b=/tmp/ai_old.js
 * Además del resultado muestra tiros, pases, posesión, atajadas y cuánto tarda
 * la IA por cuadro (promedio, percentil 99 y peor caso).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const N = +(args.n || 20), SIZE = +(args.size || 2), TIME = +(args.time || 120);
const DIFF = args.diff || 'normal';
const DIFF_A = args.diffA || DIFF, DIFF_B = args.diffB || DIFF;
const KEEPER = args.keeper || (SIZE >= 5 ? 'fixed' : 'dynamic');
const STADIUM = args.stadium || 'estadio';
const fileA = path.resolve(args.a || path.join(ROOT, 'js/ai.js'));
const fileB = path.resolve(args.b || path.join(ROOT, 'js/ai.js'));

// azar con semilla (para repetir una corrida)
let seed = +(args.seed || Date.now() % 1e9);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ---------------------------------------------------------------- navegador falso
const noop = () => {};
const deep = () => new Proxy(noop, { get: (t, k) => (k === 'then' ? undefined : deep()), apply: () => undefined });
const store = {};
const ctx = {
  console, Math: Object.create(Math), Date, JSON, Map, Set, Array, Object, Number, String, Boolean, Infinity, NaN, isFinite, parseInt, parseFloat, Proxy, Symbol, Error,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  navigator: { getGamepads: () => [] }, addEventListener: noop, setTimeout, clearTimeout,
};
ctx.Math.random = rnd;
ctx.window = ctx;
vm.createContext(ctx);
const load = (f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });

for (const f of ['core', 'save', 'sprites-meta', 'pokedex', 'roster', 'rules', 'species', 'stadiums']) load(path.join(ROOT, 'js', f + '.js'));
vm.runInContext(`
  PF.Sprites = { preload() {}, duration: () => 0.3, headHeight: () => 40 };
  PF.Input = { label: () => '' };
`, ctx);
ctx.PF.Audio = deep();
for (const f of ['fx', 'field', 'abilities', 'match', 'tips']) load(path.join(ROOT, 'js', f + '.js'));
load(fileA); const AI_A = ctx.PF.AI;
load(fileB); const AI_B = ctx.PF.AI;
const PF = ctx.PF;

// cada equipo con su IA; `who[team]` = 'A' o 'B'
let who = ['A', 'B'];
const brain = (team) => (who[team] === 'A' ? AI_A : AI_B);
const cost = { A: 0, B: 0, frames: 0, frame: { A: 0, B: 0 }, max: { A: 0, B: 0 }, all: {} };
const p99 = (k) => { const a = (cost.all[k] || [0]).slice().sort((x, y) => x - y); return a[Math.floor(a.length * 0.99)]; };
PF.AI = {
  SKILLS: AI_A.SKILLS,
  think: (p, m, dt) => {
    const t = performance.now(), it = brain(p.team).think(p, m, dt);
    const d = performance.now() - t;
    cost[who[p.team]] += d;
    cost.frame[who[p.team]] += d;
    return it;
  },
  kickoff: (p, m) => brain(p.team).kickoff(p, m),
};

// ---------------------------------------------------------------- un partido
function play(teams, flip) {
  PF.configureField(SIZE);
  const m = PF.Match.create({
    teams, humanTeam: -1, demo: true, time: TIME, stadium: STADIUM, keeperMode: KEEPER, flip,
    replays: false, pure: !!args.pure,
    skills: who.map((w) => (w === 'A' ? AI_A.SKILLS[DIFF_A] : AI_B.SKILLS[DIFF_B])),
  });
  // en el demo el partido se termina con el reloj (puede haber empate)
  const st = [0, 1].map(() => ({ shots: 0, onTarget: 0, shotDist: 0, passes: 0, passOk: 0, poss: 0, steals: 0 }));
  let prevHolder = null, pendingPass = null, charging = false;
  const dt = 1 / 60;
  let guard = 0;
  // táctica fija (si no, el entrenador de la CPU la cambia según el partido)
  const forced = who.map((w) => args['tactic' + w]);
  while (m.state !== 'end' && guard++ < (TIME + 60) * 60 * 3) {
    const b = m.ball;
    if (forced[0] || forced[1]) { m.coachT = 999; forced.forEach((t, team) => { if (t) m.tactic[team] = t; }); }
    cost.frame.A = cost.frame.B = 0;
    PF.Match.step(m, dt, []);
    cost.frames++;
    // (los primeros segundos no cuentan para el peor caso: el JIT todavía está compilando)
    if (cost.frames > 1800) for (const k of ['A', 'B']) { cost.max[k] = Math.max(cost.max[k], cost.frame[k]); (cost.all[k] = cost.all[k] || []).push(cost.frame[k]); }
    if (m.state === 'replay') m.state = 'goal';
    if (m.state !== 'play') { prevHolder = null; pendingPass = null; charging = false; continue; }
    const h = b.holder;
    if (h) st[h.team].poss++;
    if (prevHolder && !h && b.last === prevHolder) {
      const t = prevHolder.team;
      if (b.passTo) { st[t].passes++; pendingPass = t; }
      else {
        // tiro = se soltó después de cargar (los pases al hueco y los despejes no se cargan)
        const gx = prevHolder.side === 0 ? PF.FIELD.x1 : PF.FIELD.x0;
        if (charging) {
          st[t].shots++;
          st[t].shotDist += Math.hypot(gx - b.x, PF.FIELD.cy - b.y);
          const tl = (gx - b.x) / b.vx, yAt = b.y + b.vy * tl;
          if (Math.abs(yAt - PF.FIELD.cy) < PF.FIELD.goalHalf + 4) st[t].onTarget++;
        }
        pendingPass = null;
      }
    }
    if (h && pendingPass !== null && h !== prevHolder) { if (h.team === pendingPass) st[pendingPass].passOk++; pendingPass = null; }
    if (h && prevHolder && h.team !== prevHolder.team) st[h.team].steals++;
    prevHolder = h;
    charging = !!(h && h.charge >= 0);
  }
  const saves = [0, 1].map((t) => m.players.filter((p) => p.team === t).reduce((s, p) => s + p.stats.saves, 0));
  const tackles = [0, 1].map((t) => m.players.filter((p) => p.team === t).reduce((s, p) => s + p.stats.tackles, 0));
  return { score: m.score.slice(), st, saves, tackles };
}

// ---------------------------------------------------------------- torneo A vs B
const tot = { A: blank(), B: blank() };
function blank() { return { w: 0, d: 0, l: 0, gf: 0, ga: 0, shots: 0, onTarget: 0, shotDist: 0, passes: 0, passOk: 0, poss: 0, steals: 0, saves: 0, tackles: 0 }; }
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = PF.U.shuffle(PF.ROSTER.filter((x) => x.tier !== 'legend'));
  const base = r.slice(0, SIZE * 2).map((x) => PF.withAbility(x, rnd() < 0.5 ? 0 : 1));
  const teams = [base.slice(0, SIZE), base.slice(SIZE)];
  const flip = rnd() < 0.5;
  for (const order of [['A', 'B'], ['B', 'A']]) {
    who = order;
    const res = play(teams, flip);
    for (const team of [0, 1]) {
      const T = tot[who[team]], gf = res.score[team], ga = res.score[1 - team];
      T.gf += gf; T.ga += ga;
      if (gf > ga) T.w++; else if (gf < ga) T.l++; else T.d++;
      for (const k of ['shots', 'onTarget', 'shotDist', 'passes', 'passOk', 'poss', 'steals']) T[k] += res.st[team][k];
      T.saves += res.saves[team]; T.tackles += res.tackles[team];
    }
  }
  if (!args.quiet) process.stdout.write(`\r${i + 1}/${N}  A ${tot.A.gf} - ${tot.B.gf} B`);
}
const games = N * 2;
const row = (k, T) => {
  const possTot = tot.A.poss + tot.B.poss || 1;
  return `${k}  G/E/P ${T.w}/${T.d}/${T.l}  goles ${T.gf}-${T.ga} (${(T.gf / games).toFixed(2)}/pj)  ` +
    `tiros ${T.shots} (al arco ${T.onTarget}, ${(100 * T.gf / Math.max(1, T.shots)).toFixed(0)}% gol, a ${(T.shotDist / Math.max(1, T.shots)).toFixed(0)} px)  ` +
    `pases ${T.passOk}/${T.passes} (${(100 * T.passOk / Math.max(1, T.passes)).toFixed(0)}%)  ` +
    `posesión ${(100 * T.poss / possTot).toFixed(0)}%  recuperos ${T.steals}  atajadas ${T.saves}  placajes ${T.tackles}`;
};
console.log(`\n${SIZE} vs ${SIZE} · ${DIFF_A === DIFF_B ? DIFF : DIFF_A + ' vs ' + DIFF_B} · ${KEEPER} · ${STADIUM} · ${games} partidos de ${TIME}s · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('A = ' + path.relative(process.cwd(), fileA));
console.log('B = ' + path.relative(process.cwd(), fileB));
console.log(row('A', tot.A));
console.log(row('B', tot.B));
console.log(`IA por cuadro (todo el equipo): A ${(1000 * cost.A / cost.frames).toFixed(1)} µs (p99 ${p99('A').toFixed(2)} ms, peor ${cost.max.A.toFixed(2)} ms) · B ${(1000 * cost.B / cost.frames).toFixed(1)} µs (p99 ${p99('B').toFixed(2)} ms, peor ${cost.max.B.toFixed(2)} ms)`);
