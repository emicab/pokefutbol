/* ============ main.js — arranque, pantallas y bucle principal ============
 * Simulación a paso fijo (60 Hz) y dibujo en cada frame. En el menú se juega
 * un CPU contra CPU de fondo.
 */
(() => {
  const STEP = 1 / 60;
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');
  const game = document.getElementById('game');

  let screen = 'title';        // title | select | match | pause | result
  let match = null;            // partido en pantalla (o el de demostración)
  let setup = null;            // { picks, diff, rival } del último partido
  let acc = 0, last = performance.now(), clock = 0;

  function fit() {
    const s = Math.min(innerWidth / PF.W, innerHeight / PF.H);
    game.style.transform = `scale(${s})`;
    game.style.left = Math.round((innerWidth - PF.W * s) / 2) + 'px';
    game.style.top = Math.round((innerHeight - PF.H * s) / 2) + 'px';
  }
  addEventListener('resize', fit);
  fit();

  // ---------------------------------------------------------------- partidos
  const randomAbility = (r) => PF.withAbility(r, Math.random() < 0.5 ? 0 : 1);

  function demoMatch() {
    const r = PF.U.shuffle(PF.ROSTER).map(randomAbility);
    return PF.Match.create({
      teams: [[r[0], r[1]], [r[2], r[3]]],
      humanTeam: -1, demo: true, time: 60,
      skills: [PF.AI.SKILLS.normal, PF.AI.SKILLS.normal],
    });
  }

  function startMatch() {
    const mine = setup.picks.map((id) => PF.withAbility(PF.rosterById(id), setup.abil[id] || 0));
    match = PF.Match.create({
      teams: [mine, setup.rival.map((id) => randomAbility(PF.rosterById(id)))],
      humanTeam: 0,
      skills: [PF.AI.SKILLS.mate, PF.AI.SKILLS[setup.diff]],
    });
    screen = 'match';
    PF.UI.clear();
  }

  function pickRival(picks) {
    return PF.U.shuffle(PF.ROSTER.filter((r) => !picks.includes(r.id))).slice(0, 2).map((r) => r.id);
  }

  // ---------------------------------------------------------------- pantallas
  function toTitle() {
    screen = 'title';
    match = demoMatch();
    PF.UI.title(toSelect);
  }

  function toSelect() {
    if (screen !== 'title' && screen !== 'select') match = demoMatch();
    screen = 'select';
    PF.UI.select(setup, (picks, diff, abil) => {
      setup = { picks, diff, abil, rival: pickRival(picks) };
      startMatch();
    }, toTitle);
  }

  function togglePause() {
    if (screen === 'match') {
      screen = 'pause';
      PF.UI.pause(resume, startMatch, toTitle);
    } else if (screen === 'pause') resume();
  }
  function resume() { screen = 'match'; PF.UI.clear(); last = performance.now(); }

  function toResult() {
    screen = 'result';
    PF.UI.result(match, startMatch, toSelect, toTitle);
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

    const menuBg = screen === 'title' || screen === 'select';
    PF.Render.draw(ctx, match, { noHud: menuBg });
    if (menuBg) {
      ctx.fillStyle = 'rgba(8,12,22,0.45)';
      ctx.fillRect(0, 0, PF.W, PF.H);
    }
    if (screen === 'select') PF.UI.tickPortraits(clock);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- arranque
  PF.debug = { get match() { return match; }, get screen() { return screen; } };   // para la consola
  PF.Sprites.preloadAll();
  const fontReady = document.fonts ? document.fonts.load('20px Pixelify') : Promise.resolve();
  fontReady.catch(() => {}).then(() => {
    toTitle();
    requestAnimationFrame((t) => { last = t; frame(t); });
  });
})();
