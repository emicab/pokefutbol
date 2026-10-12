/* ============ main.js — arranque, pantallas y bucle principal ============
 * Simulación a paso fijo (60 Hz) y dibujo en cada frame. En el menú se juega
 * un CPU contra CPU de fondo.
 */
(() => {
  const STEP = 1 / 60;
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');
  const game = document.getElementById('game');

  let screen = 'title';        // title | options | select | match | pause | result
  let match = null;            // partido en pantalla (o el de demostración)
  let rewarded = false;        // ya se dieron las monedas de este partido
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
      humanTeam: -1, demo: true, time: 60, stadium: 'estadio',
      skills: [PF.AI.SKILLS.normal, PF.AI.SKILLS.normal],
    });
  }

  /** Rival: Pokémon que no elegiste (repite si no alcanzan). Puede usar bloqueados. */
  function pickRival(picks, n) {
    const free = PF.U.shuffle(PF.ROSTER.filter((r) => !picks.includes(r.id)));
    const out = [];
    for (let i = 0; i < n; i++) out.push(free[i % free.length]);
    return out;
  }

  let rival = null;
  function startMatch(newRival = true) {
    const setup = PF.Save.data.setup, st = PF.Save.data.settings;
    PF.configureField(setup.size);
    const mine = setup.picks.map((id) => PF.withAbility(PF.rosterById(id), setup.abil[id] || 0));
    if (newRival || !rival || rival.length !== setup.size) rival = pickRival(setup.picks, setup.size).map(randomAbility);
    match = PF.Match.create({
      teams: [mine, rival],
      humanTeam: 0, time: setup.time, stadium: setup.stadium, replays: st.replays,
      skills: [PF.AI.SKILLS.mate, PF.AI.SKILLS[setup.diff]],
    });
    rewarded = false;
    screen = 'match';
    PF.UI.clear();
    PF.Audio.music('match');
    PF.Audio.setAmbience(1);
  }

  // ---------------------------------------------------------------- premios
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
    const stats = save.stats;
    stats.played++;
    stats.goals += m.score[0];
    if (m.winner === 0) stats.won++;
    if (m.winner === 0 && setup.diff === 'hard') stats.hardWins++;
    if (m.winner === 0 && m.score[0] - m.score[1] >= 3) stats.bigWins++;
    // retos
    const unlocked = [];
    for (const r of PF.ROSTER) {
      if (r.unlock && r.unlock.challenge && !save.unlocked.includes(r.id) && PF.CHALLENGES[r.unlock.challenge](stats)) {
        save.unlocked.push(r.id);
        unlocked.push(r.name);
      }
    }
    PF.Save.save();
    if (coins) PF.Audio.sfx.coin();
    return { coins, lines, unlocked };
  }

  // ---------------------------------------------------------------- pantallas
  function menuMusic() {
    PF.Audio.music('menu');
    PF.Audio.setAmbience(0.25);
  }

  function toTitle() {
    if (!match || !match.demo) match = demoMatch();
    screen = 'title';
    menuMusic();
    PF.UI.title(toSelect, toOptions);
  }

  function toOptions() {
    screen = 'options';
    PF.UI.options(toTitle, applySettings);
  }

  function toSelect() {
    if (!match || !match.demo) match = demoMatch();
    screen = 'select';
    menuMusic();
    PF.UI.select(() => startMatch(true), toTitle);
  }

  function togglePause() {
    if (screen === 'match') {
      screen = 'pause';
      PF.UI.pause(resume, () => startMatch(false), toTitle);
    } else if (screen === 'pause') resume();
  }
  function resume() { screen = 'match'; PF.UI.clear(); last = performance.now(); }

  function toResult() {
    screen = 'result';
    const r = rewarded ? { coins: 0, lines: [], unlocked: [] } : reward(match);
    rewarded = true;
    PF.UI.result(match, r, () => startMatch(false), toSelect, toTitle);
  }

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
    if (screen === 'match' && match.state === 'end' && match.stateT > 1.8) toResult();

    const menuBg = screen === 'title' || screen === 'select' || screen === 'options';
    PF.Render.draw(ctx, match, { noHud: menuBg, aids: PF.Save.data.settings.aids });
    if (menuBg) {
      ctx.fillStyle = 'rgba(8,12,22,0.5)';
      ctx.fillRect(0, 0, PF.W, PF.H);
    }
    if (screen === 'select') PF.UI.tickPortraits(clock);
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
