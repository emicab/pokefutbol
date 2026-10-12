/* ============ main.js — arranque, pantallas y bucle principal ============
 * Simulación a paso fijo (60 Hz) y dibujo en cada frame. En el menú se juega
 * un CPU contra CPU de fondo. Dos caminos: partido rápido (selección →
 * partido → resultado) y modo historia (club → copa de gimnasio → partido →
 * experiencia/evoluciones → ...).
 */
(() => {
  const STEP = 1 / 60;
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');
  const game = document.getElementById('game');

  let screen = 'title';        // title | menu | match | pause | result
  let match = null;            // partido en pantalla (o el de demostración)
  let current = null;          // { cfg, onEnd, quitLabel, onQuit } del partido en juego
  let acc = 0, last = performance.now(), clock = 0;

  function fit() {
    const s = Math.min(innerWidth / PF.W, innerHeight / PF.H);
    game.style.transform = `scale(${s})`;
    game.style.left = Math.round((innerWidth - PF.W * s) / 2) + 'px';
    game.style.top = Math.round((innerHeight - PF.H * s) / 2) + 'px';
  }
  addEventListener('resize', fit);
  fit();

  function applySettings() {
    const st = PF.Save.data.settings;
    PF.Audio.setVolumes(st.music, st.sfx);
  }

  // ---------------------------------------------------------------- partidos
  const randomAbility = (r) => PF.withAbility(r, Math.random() < 0.5 ? 0 : 1);

  function demoMatch() {
    PF.configureField(2);
    const r = PF.U.shuffle(PF.ROSTER).map(randomAbility);
    return PF.Match.create({
      teams: [[r[0], r[1]], [r[2], r[3]]],
      humanTeam: -1, demo: true, time: 60, stadium: 'estadio', keeperMode: 'dynamic', flip: Math.random() < 0.5,
      skills: [PF.AI.SKILLS.normal, PF.AI.SKILLS.normal],
    });
  }

  /**
   * cfg: { size, teams, bench?, formations?, keeperMode, stadium, time, diff, mods? }
   * onEnd(match) al terminar; quit = { label, fn } para la pausa.
   */
  function playMatch(cfg, onEnd, quit) {
    current = { cfg, onEnd, quit };
    const st = PF.Save.data.settings;
    PF.configureField(cfg.size);
    match = PF.Match.create({
      teams: cfg.teams, formations: cfg.formations, keeperMode: cfg.keeperMode, mods: cfg.mods, bench: cfg.bench,
      humanTeam: 0, time: cfg.time, stadium: cfg.stadium, replays: st.replays,
      flip: Math.random() < 0.5,   // tu equipo arranca de un lado al azar
      skills: [PF.AI.SKILLS.mate, PF.AI.SKILLS[cfg.diff]],
    });
    screen = 'match';
    PF.UI.clear();
    PF.Audio.music('match');
    PF.Audio.setAmbience(1);
  }

  function restartMatch() { playMatch(current.cfg, current.onEnd, current.quit); }

  // ---------------------------------------------------------------- partido rápido
  /** Rival: Pokémon que no elegiste (repite si no alcanzan). Puede usar bloqueados. */
  function pickRival(picks, n) {
    const free = PF.U.shuffle(PF.ROSTER.filter((r) => !picks.includes(r.id)));
    const out = [];
    for (let i = 0; i < n; i++) out.push(free[i % free.length]);
    return out;
  }

  function quickMatch() {
    const setup = PF.Save.data.setup;
    const all = setup.picks.map((id) => PF.withAbility(PF.rosterById(id), setup.abil[id] || 0));
    const mine = all.slice(0, setup.size), bench = all.slice(setup.size);
    const rival = pickRival(setup.picks, setup.size + 2).map(randomAbility);
    const key = setup.size + '-' + setup.keeper;
    setup.spots[key] = setup.spots[key] || {};
    playMatch({
      size: setup.size, keeperMode: setup.keeper, stadium: setup.stadium, time: setup.time, diff: setup.diff,
      teams: [mine, rival.slice(0, setup.size)],
      bench: [bench, rival.slice(setup.size)],
      formations: [PF.Board.spotsFor(setup.spots[key], mine, setup.keeper), null],
    }, quickResult, { label: 'Salir al menú', fn: toTitle });
  }

  /** Monedas por el partido y retos cumplidos. Devuelve el detalle para la pantalla. */
  function reward(m) {
    const save = PF.Save.data, setup = save.setup;
    const mult = { easy: 0.6, normal: 1, hard: 1.6 }[setup.diff] * (setup.time / 120) ** 0.5;
    const lines = [];
    lines.push(['Partido jugado', 30]);
    if (m.winner === 0) lines.push(['Victoria', 70]);
    else if (m.winner === -1) lines.push(['Empate', 30]);
    if (m.score[0]) lines.push([`Goles (${m.score[0]})`, 10 * m.score[0]]);
    if (m.winner === 0 && m.score[1] === 0) lines.push(['Valla invicta', 25]);
    for (const l of lines) l[1] = Math.round(l[1] * mult);
    const coins = lines.reduce((s, l) => s + l[1], 0);
    save.coins += coins;
    countStats(m, setup.diff);
    const unlocked = checkChallenges();
    PF.Save.save();
    if (coins) PF.Audio.sfx.coin();
    return { coins, lines, unlocked };
  }

  function countStats(m, diff) {
    const stats = PF.Save.data.stats;
    stats.played++;
    stats.goals += m.score[0];
    if (m.winner === 0) stats.won++;
    if (m.winner === 0 && diff === 'hard') stats.hardWins++;
    if (m.winner === 0 && m.score[0] - m.score[1] >= 3) stats.bigWins++;
  }

  function checkChallenges() {
    const save = PF.Save.data, out = [];
    for (const r of PF.ROSTER) {
      if (r.unlock && r.unlock.challenge && !save.unlocked.includes(r.id) && PF.CHALLENGES[r.unlock.challenge](save.stats)) {
        save.unlocked.push(r.id);
        out.push(r.name);
      }
    }
    return out;
  }

  function quickResult(m) {
    screen = 'result';
    PF.UI.result(m, reward(m), restartMatch, toSelect, toTitle);
  }

  // ---------------------------------------------------------------- modo historia
  const C = PF.Career;
  let careerFocus = null;

  function toCareer() {
    toMenu();
    if (!C.data()) {
      PF.CareerUI.start((dex, name) => { C.start(dex, name); careerHub(); }, toTitle);
      return;
    }
    careerHub();
  }

  function careerHub() {
    toMenu();
    PF.CareerUI.hub({
      focus: careerFocus,
      onBack: toTitle,
      onChallenge: (gymId) => { C.startRun(gymId); careerStage(); },
      onContinue: careerStage,
    });
  }

  function careerStage() {
    toMenu();
    const run = C.data().run;
    if (!run) return careerHub();
    const opp = C.opponent(run);
    PF.CareerUI.versus(opp, () => {
      const cfg = C.matchConfig(opp);
      playMatch(cfg, (m) => careerAfter(m, opp), { label: 'Volver al club (la copa sigue)', fn: careerHub });
    }, () => { C.data().run = null; PF.Save.save(); careerHub(); });
  }

  function careerAfter(m, opp) {
    toMenu();
    PF.Audio.setAmbience(0.25);
    const res = C.applyMatch(m, opp);
    countStats(m, opp.diff);
    const unlocked = checkChallenges();
    PF.Save.save();
    if (unlocked.length) PF.UI.toast(`¡Nuevo Pokémon para partido rápido: ${unlocked.join(', ')}!`);
    PF.CareerUI.post(m, res, () => evolveAll(res.evolutions.slice(), () => afterRun(m)));
  }

  /** Evoluciones pendientes, una tras otra. */
  function evolveAll(list, done) {
    const mb = list.shift();
    if (!mb) return done();
    PF.CareerUI.evolve(mb, () => evolveAll(list, done));
  }

  function afterRun(m) {
    const run = C.data().run;
    const g = run && C.gymOf(run);
    const out = C.advanceRun(m.winner === 0);
    if (!out) return careerHub();
    if (out.result === 'retry') { PF.UI.toast('¡Usaste la Poción! Repites el partido.'); return careerStage(); }
    if (out.result === 'lost') return PF.CareerUI.runEnd(out, careerHub);
    if (out.result === 'won') {
      // reclutar a uno del equipo del líder
      const opts = C.leaderRecruits(out.gym);
      const full = C.data().club.length >= C.CLUB_MAX;
      PF.CareerUI.choose(
        `¡Le ganaste a ${out.gym.leader}!`,
        full ? 'Tu club está lleno (9). Libera a alguien para reclutar la próxima vez.' : 'Uno de su equipo quiere unirse a tu club. ¿A quién eliges?',
        full ? [] : opts.map((o) => ({ dex: o.dex, title: PF.species(o.dex).name, sub: `Nv ${o.level}`, color: PF.species(o.dex).color })),
        (i) => {
          if (i !== null) { const o = opts[i]; C.addMember(o.dex, o.level, 12); PF.UI.toast(`¡${PF.species(o.dex).name} se unió al club!`); }
          PF.CareerUI.runEnd(out, careerHub);
        },
        full ? 'Continuar' : 'Ahora no',
      );
      return;
    }
    // siguiente etapa: quizá alguien quiere unirse, luego elegir mejora
    const wild = C.wildJoin(g);
    const perks = () => {
      const ch = C.perkChoices(C.data().run);
      PF.CareerUI.choose('Elige una mejora', 'Dura hasta que termine esta copa.',
        ch.map((p) => ({ title: p.name, sub: p.desc })),
        (i) => { C.takePerk(C.data().run, ch[i].id); careerStage(); });
    };
    if (!wild) return perks();
    PF.CareerUI.choose('¡Un Pokémon quiere unirse!', 'Le gustó cómo juega tu equipo.',
      [{ dex: wild.dex, title: PF.species(wild.dex).name, sub: `Nv ${wild.level}`, color: PF.species(wild.dex).color }],
      (i) => { if (i !== null) { C.addMember(wild.dex, wild.level); PF.UI.toast(`¡${PF.species(wild.dex).name} se unió al club!`); } perks(); },
      'No, gracias');
  }

  // ---------------------------------------------------------------- pantallas
  function menuMusic() {
    PF.Audio.music('menu');
    PF.Audio.setAmbience(0.25);
  }

  /** Pantalla de menú con el partido de demostración de fondo. */
  function toMenu() {
    if (!match || !match.demo) match = demoMatch();
    screen = 'menu';
    menuMusic();
  }

  function toTitle() {
    toMenu();
    screen = 'title';
    PF.UI.title(toSelect, toCareer, toOptions);
  }

  function toOptions() {
    toMenu();
    PF.UI.options(toTitle, applySettings);
  }

  function toSelect() {
    toMenu();
    PF.UI.select(quickMatch, toTitle);
  }

  function togglePause() {
    if (screen === 'match') {
      screen = 'pause';
      PF.UI.pause(resume, restartMatch, current.quit.fn, current.quit.label, {
        left: match.subsLeft[0], bench: match.bench[0].length,
        open: () => PF.UI.subs(match, () => { screen = 'match'; togglePause(); }),
      });
    } else if (screen === 'pause') resume();
  }
  function resume() { screen = 'match'; PF.UI.clear(); last = performance.now(); }

  // ---------------------------------------------------------------- bucle
  function humanIntent() {
    const I = PF.Input;
    const [mx, my] = I.move();
    return {
      mx, my,
      pass: I.was('pass'),
      shootHold: I.is('shoot') || I.was('shoot'),
      ability: I.was('ability'),
      press: I.is('press'),
      swap: I.was('swap'),
      order: I.was('order'),
      skip: I.was('shoot') || I.was('press') || I.was('ability'),
    };
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    PF.Input.pollPad();

    if (PF.Input.was('pause') && (screen === 'match' || screen === 'pause')) togglePause();
    if (PF.Input.was('mute')) PF.Audio.toggleMute();

    let steps = 0;
    if (screen !== 'pause') {
      acc += dt;
      while (acc >= STEP && steps < 5) {
        PF.Match.step(match, STEP, screen === 'match' ? humanIntent() : null);
        acc -= STEP;
        steps++;
        PF.Input.endStep();
      }
      if (steps === 5) acc = 0;
    } else {
      PF.Input.endStep();
    }

    // demo: cuando termina, otra
    if (match.demo && match.state === 'end' && match.stateT > 3) match = demoMatch();
    if (screen === 'match' && match.state === 'end' && match.stateT > 1.8) {
      screen = 'result';
      current.onEnd(match);
    }

    const menuBg = screen === 'title' || screen === 'menu';
    PF.Render.draw(ctx, match, { noHud: menuBg, aids: PF.Save.data.settings.aids });
    if (menuBg) {
      ctx.fillStyle = 'rgba(8,12,22,0.55)';
      ctx.fillRect(0, 0, PF.W, PF.H);
    }
    PF.UI.tickPortraits(clock);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- arranque
  PF.debug = { get match() { return match; }, get screen() { return screen; } };   // para la consola
  PF.Sprites.preloadAll();
  applySettings();
  const fontReady = document.fonts ? document.fonts.load('20px Pixelify') : Promise.resolve();
  fontReady.catch(() => {}).then(() => {
    toTitle();
    requestAnimationFrame((t) => { last = t; frame(t); });
  });
})();
