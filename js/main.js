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
    PF.Input.reload();   // por si se borró el progreso (vuelven las teclas de fábrica)
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

  // ---------------------------------------------------------------- online
  // El anfitrión corre el partido; el invitado manda sus teclas y dibuja lo
  // que le llega (ver net.js). Jugador 1 = anfitrión, jugador 2 = invitado.
  const N = PF.Net;
  let online = null;   // { phase, mode, code, connected, info, guestPicks, view, inbuf, pack }

  const myPicks = () => PF.Save.data.setup.picks.map((id) => ({ id, a: PF.Save.data.setup.abil[id] || 0 }));
  const infoMsg = () => Object.assign({ mode: online.mode }, PF.Save.data.setup);

  function toOnline() {
    toMenu();
    if (!online) online = { phase: 'idle', mode: 'pvp' };
    drawLobby();
  }
  function drawLobby() {
    screen = 'menu';
    online.view = 'lobby';
    PF.OnlineUI.lobby(online, {
      onHost: hostRoom, onJoin: joinRoom, onStart: startOnlineHost, onTeam: onlineTeam, onBack: leaveOnline,
      onMode: (mode) => { online.mode = mode; N.send({ t: 'info', setup: infoMsg() }); PF.Audio.sfx.click(); drawLobby(); },
    });
  }
  const redrawLobby = () => { if (online && online.view === 'lobby') drawLobby(); };

  function hostRoom() {
    online.phase = 'creating';
    drawLobby();
    N.host(
      (code) => { online.phase = 'hosting'; online.code = code; redrawLobby(); },
      () => { online.connected = true; N.send({ t: 'info', setup: infoMsg() }); PF.Audio.sfx.coin(); redrawLobby(); },
      (err) => { PF.UI.toast(err); N.close(); online = { phase: 'idle', mode: online.mode }; redrawLobby(); },
    );
  }
  function joinRoom(code) {
    online.phase = 'joining';
    online.code = code;
    drawLobby();
    N.join(code,
      () => { online.phase = 'joined'; online.connected = true; N.send({ t: 'hello', v: N.VERSION, picks: myPicks() }); redrawLobby(); },
      (err) => { PF.UI.toast(err); N.close(); online = { phase: 'idle', mode: 'pvp' }; redrawLobby(); });
  }
  /** Armar el equipo con la pantalla del partido rápido y volver a la sala. */
  function onlineTeam() {
    online.view = 'team';
    const back = () => {
      if (N.role === 'host') N.send({ t: 'info', setup: infoMsg() });
      if (N.role === 'guest') N.send({ t: 'hello', v: N.VERSION, picks: myPicks() });
      drawLobby();
    };
    PF.UI.select(back, back, 'Listo');
  }
  function leaveOnline() {
    N.close();
    online = null;
    toTitle();
  }

  N.on('hello', (msg) => {
    if (msg.v !== N.VERSION) { PF.UI.toast('Tu amigo tiene otra versión del juego.'); return; }
    online.guestPicks = msg.picks;
    redrawLobby();
  });
  N.on('info', (msg) => { if (online) { online.info = msg.setup; online.mode = msg.setup.mode; redrawLobby(); } });
  N.on('start', (msg) => startOnline(msg.cfg, 1));
  N.on('in', (msg) => { if (online && online.inbuf) online.inbuf.push(msg.i); });
  N.on('s', (msg) => { if (match && match.online === 'guest') N.applySync(match, msg); });
  N.on('lobby', () => { if (online) toOnline(); });
  N.on('full', () => { PF.UI.toast('Esa sala ya está completa.'); N.close(); online = { phase: 'idle', mode: 'pvp' }; redrawLobby(); });
  N.on('close', () => {
    PF.UI.toast('Se cortó la conexión con tu amigo.');
    online = null;
    if (match && match.online) { match = null; toTitle(); } else toTitle();
  });

  /** El anfitrión arma el partido con los dos equipos y se lo manda al invitado. */
  function startOnlineHost() {
    if (!N.connected()) return;
    const s = PF.Save.data.setup, size = s.size, pvp = online.mode === 'pvp';
    const key = (x) => x.id + ':' + x.a;
    const fill = (picks, n) => {
      const out = picks.filter((x) => PF.rosterById(x.id));
      while (out.length < n) out.push({ id: PF.U.pick(PF.ROSTER).id, a: Math.random() < 0.5 ? 0 : 1 });
      return out;
    };
    const nHost = pvp ? size : Math.ceil(size / 2), nGuest = size - (pvp ? 0 : nHost);
    const host = fill(myPicks(), nHost), guest = fill(online.guestPicks || [], pvp ? size : nGuest);
    const hostDefs = host.slice(0, nHost).map((x) => N.defOf(key(x)));
    let cfg;
    if (pvp) {
      cfg = {
        teams: [host.slice(0, size).map(key), guest.slice(0, size).map(key)],
        bench: [host.slice(size, size + 2).map(key), guest.slice(size, size + 2).map(key)],
        humans: [{ team: 0 }, { team: 1 }], skills: ['mate', 'mate'],
        formations: [PF.Board.spotsFor(s.spots[size + '-' + s.keeper] || {}, hostDefs, s.keeper), null],
      };
    } else {
      const ids = host.concat(guest).map((x) => x.id);
      const rival = pickRival(ids, size + 2).map((r) => r.id + ':' + (Math.random() < 0.5 ? 0 : 1));
      cfg = {
        teams: [host.slice(0, nHost).concat(guest.slice(0, nGuest)).map(key), rival.slice(0, size)],
        bench: [[], rival.slice(size)],
        humans: [{ team: 0 }, { team: 0 }], skills: ['mate', s.diff],
        formations: [null, null],
      };
    }
    Object.assign(cfg, {
      mode: online.mode, size, time: s.time, stadium: s.stadium, keeperMode: s.keeper,
      flip: Math.random() < 0.5, replays: PF.Save.data.settings.replays,
    });
    N.send({ t: 'start', cfg });
    startOnline(cfg, 0);
  }

  /** Arranca el partido online (view 0 = anfitrión, 1 = invitado). */
  function startOnline(cfg, view) {
    const defs = (arr) => arr.map(N.defOf);
    PF.configureField(cfg.size);
    match = PF.Match.create({
      teams: cfg.teams.map(defs), bench: cfg.bench.map(defs), formations: cfg.formations,
      keeperMode: cfg.keeperMode, humans: cfg.humans, view, autoSubs: true,
      time: cfg.time, stadium: cfg.stadium, replays: cfg.replays, flip: cfg.flip,
      skills: cfg.skills.map((k) => PF.AI.SKILLS[k]),
    });
    match.online = view === 0 ? 'host' : 'guest';
    match.netCfg = cfg;
    online.view = 'match';
    online.menu = false;
    if (view === 0) { online.inbuf = N.makeInputBuffer(); online.pack = N.makeSync(); }
    current = { cfg, onEnd: onlineResult, quit: { label: 'Abandonar', fn: leaveOnline } };
    screen = 'match';
    PF.UI.clear();
    PF.Audio.music('match');
    PF.Audio.setAmbience(1);
  }

  function onlineReward(m) {
    const team = m.humanTeam, save = PF.Save.data;
    const lines = [['Partido online', 30]];
    if (m.winner === team) lines.push(['Victoria', 70]);
    else if (m.winner === -1) lines.push(['Empate', 30]);
    if (m.score[team]) lines.push([`Goles (${m.score[team]})`, 10 * m.score[team]]);
    const coins = lines.reduce((s, l) => s + l[1], 0);
    save.coins += coins;
    PF.Save.save();
    PF.Audio.sfx.coin();
    return { coins, lines, unlocked: [] };
  }

  function onlineResult(m) {
    screen = 'result';
    online.view = 'result';
    const host = m.online === 'host';
    PF.UI.result(m, onlineReward(m),
      host ? startOnlineHost : null,
      host ? () => { N.send({ t: 'lobby' }); toOnline(); } : null,
      leaveOnline,
      { team: 'Volver a la sala', menu: 'Salir', note: host ? '' : 'Esperando a que el anfitrión elija revancha o volver a la sala…' });
  }

  function toggleNetMenu() {
    online.menu = !online.menu;
    if (online.menu) PF.OnlineUI.menu(toggleNetMenu, leaveOnline);
    else PF.UI.clear();
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
    PF.UI.title(toSelect, toCareer, toOptions, toOnline);
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

  function openSubs() {
    if (!match.bench[0].length) { PF.UI.toast('No tienes suplentes en este partido.'); return; }
    screen = 'pause';
    PF.UI.subs(match, resume);
  }

  // ---------------------------------------------------------------- bucle
  function humanIntent() {
    const I = PF.Input;
    const [mx, my] = I.move();
    return {
      mx, my,
      pass: I.was('pass'),
      passHold: I.is('pass') || I.was('pass'),
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

    const net = match && match.online;   // 'host' | 'guest' | undefined
    if (net) {
      // online no hay pausa: Esc abre un menú y el partido sigue
      if (PF.Input.was('pause') && screen === 'match') toggleNetMenu();
      if (PF.Input.was('subs') && screen === 'match') PF.UI.toast('Online los cambios son automáticos.');
    } else {
      if (PF.Input.was('pause') && (screen === 'match' || screen === 'pause')) togglePause();
      // R: cambios directos (pausa el partido y abre la pantalla; al cerrarla se sigue jugando)
      if (PF.Input.was('subs') && screen === 'match' && match.state !== 'end') openSubs();
      else if (PF.Input.was('subs') && screen === 'pause' && document.querySelector('.subs')) resume();
    }
    if (PF.Input.was('mute')) PF.Audio.toggleMute();

    let steps = 0;
    if (net === 'guest') {
      // invitado: manda sus teclas una vez por frame y sólo anima efectos y cámara
      if (screen === 'match') N.send({ t: 'in', i: humanIntent() });
      PF.Input.endStep();
      acc += dt;
      while (acc >= STEP && steps < 5) {
        PF.FX.update(match.fx, STEP);
        PF.Match.updateCamera(match, STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 5) acc = 0;
    } else if (net === 'host') {
      // anfitrión: corre el partido con las teclas de los dos y manda lo que cambió
      acc += dt;
      while (acc >= STEP && steps < 5) {
        const ins = [screen === 'match' ? humanIntent() : null, online.inbuf.take()];
        const events = N.capture(match, () => PF.Match.step(match, STEP, ins));
        N.send(online.pack(match, events));
        acc -= STEP;
        steps++;
        PF.Input.endStep();
      }
      if (steps === 5) acc = 0;
    } else if (screen !== 'pause') {
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
  PF.debug = { get match() { return match; }, get screen() { return screen; }, get online() { return online; } };   // para la consola
  // retos ya cumplidos (por si se agregaron Pokémon nuevos) y equipo guardado al día
  const startUnlocked = checkChallenges();
  PF.sanitizeSetup();
  PF.Save.save();
  PF.Sprites.preloadAll();
  applySettings();
  if (startUnlocked.length) setTimeout(() => PF.UI.toast(`¡Desbloqueaste: ${startUnlocked.join(', ')}!`), 1200);
  const fontReady = document.fonts ? document.fonts.load('20px Pixelify') : Promise.resolve();
  fontReady.catch(() => {}).then(() => {
    toTitle();
    requestAnimationFrame((t) => { last = t; frame(t); });
  });
})();
