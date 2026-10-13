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
  /**
   * Rival: Pokémon que no elegiste (puede usar bloqueados), sobre todo de
   * fase 1 y 2; más evolucionados cuanto más difícil. Nunca legendarios.
   */
  function pickRival(picks, n, diff = PF.Save.data.setup.diff) {
    return PF.randomFill(picks, n, diff).map(PF.rosterById);
  }

  function quickMatch() {
    const setup = PF.Save.data.setup;
    const all = setup.picks.map((id) => PF.withAbility(PF.rosterById(id), setup.abil[id] || 0));
    const mine = all.slice(0, setup.size), bench = all.slice(setup.size);
    // equipo incompleto: el resto, al azar (casi siempre fase 1)
    for (const id of PF.randomFill(setup.picks, setup.size - mine.length)) mine.push(PF.withAbility(PF.rosterById(id), 0));
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
    countPlays(m, 0);
    countStats(m, setup.diff);
    const unlocked = checkChallenges();
    PF.Save.save();
    if (coins) PF.Audio.sfx.coin();
    return { coins, lines, unlocked };
  }

  /**
   * Suma un partido a cada Pokémon del equipo `team` que jugó (también los que
   * entraron o salieron de cambio) y avisa si con eso ya se puede comprar alguna evolución.
   */
  function countPlays(m, team) {
    const ids = m.players.concat(m.retired).filter((p) => p.team === team).map((p) => PF.rosterIdOfDex(p.def.dex));
    const before = PF.ROSTER.filter((r) => !PF.isUnlocked(r) && r.unlock && r.unlock.needs && PF.canBuy(r).ok).map((r) => r.id);
    PF.addPlays(ids);
    const now = PF.ROSTER.filter((r) => !PF.isUnlocked(r) && r.unlock && r.unlock.needs && PF.canBuy(r).ok && !before.includes(r.id));
    if (now.length) setTimeout(() => PF.UI.toast(`¡Ya puedes comprar a ${now.map((r) => r.name).join(', ')}!`), 600);
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
    countPlays(m, 0);
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
  // Hasta 4 jugadores (y espectadores). El anfitrión corre el partido; cada
  // invitado manda sus teclas y dibuja lo que le llega (ver net.js). En la
  // sala todos entran mirando y cada uno elige su lugar: equipo A, equipo B o
  // mirar. Un equipo sin jugadores lo maneja la CPU.
  const N = PF.Net;
  const MAX_PLAYERS = 4;
  // online = { phase: idle|creating|joining|room, code, me (mi id en la sala), room, view,
  //            menu, humanIds (id de cada humano del partido), inbufs, pack }
  let online = null;

  const myPicks = () => PF.Save.data.setup.picks.map((id) => ({ id, a: PF.Save.data.setup.abil[id] || 0 }));
  const myName = () => PF.Save.data.settings.name || 'Entrenador';
  const roomSetup = () => { const s = PF.Save.data.setup; return { size: s.size, time: s.time, keeper: s.keeper, stadium: s.stadium, diff: s.diff }; };
  const hello = () => N.send({ t: 'hello', v: N.VERSION, name: myName(), picks: myPicks() });

  function toOnline() {
    toMenu();
    if (!online) online = { phase: 'idle' };
    drawLobby();
  }
  function drawLobby() {
    screen = 'menu';
    online.view = 'lobby';
    PF.OnlineUI.lobby(online, {
      onHost: hostRoom, onJoin: joinRoom, onStart: () => startOnlineHost(false), onTeam: onlineTeam, onBack: leaveOnline,
      onPlace: choosePlace, onName: setName, onReady: toggleReady,
    });
  }
  const redrawLobby = () => { if (online && online.view === 'lobby') drawLobby(); };

  // ---- anfitrión
  /** Manda a todos cómo está la sala (y la redibuja acá). */
  function pushRoom() {
    online.room.setup = roomSetup();
    N.send({ t: 'room', room: online.room });
    redrawLobby();
  }
  function hostRoom() {
    online.phase = 'creating';
    drawLobby();
    N.host(
      (code) => {
        Object.assign(online, { phase: 'room', code, me: 'host' });
        online.room = { code, members: [{ id: 'host', name: myName(), place: 'A', picks: myPicks(), host: true }], setup: roomSetup() };
        redrawLobby();
      },
      (id) => {
        online.room.members.push({ id, name: 'Invitado', place: 'spec', picks: [], ready: false });
        N.sendTo(id, { t: 'welcome', id });
        PF.Audio.sfx.coin();
        pushRoom();
      },
      (err) => { PF.UI.toast(err); N.close(); online = { phase: 'idle' }; redrawLobby(); },
    );
  }
  /** Mover a alguien de lugar, si hay espacio (4 jugadores como mucho; por equipo, hasta el formato). */
  function tryPlace(id, place) {
    const room = online.room, mb = room.members.find((x) => x.id === id);
    if (!mb || !['A', 'B', 'spec'].includes(place) || mb.place === place) return;
    if (place !== 'spec') {
      const playing = room.members.filter((x) => x !== mb && x.place !== 'spec').length;
      const there = room.members.filter((x) => x !== mb && x.place === place).length;
      if (playing >= MAX_PLAYERS || there >= room.setup.size) {
        if (id === 'host') PF.UI.toast('No hay lugar ahí.'); else N.sendTo(id, { t: 'nope', text: 'No hay lugar ahí.' });
        return;
      }
    }
    mb.place = place;
    mb.ready = false;   // cambió de lugar: tiene que volver a marcarse listo
    pushRoom();
  }
  N.on('ready', (msg, from) => {
    if (!online || !online.room || N.role !== 'host') return;
    const mb = online.room.members.find((x) => x.id === from);
    if (!mb || mb.place === 'spec') return;
    mb.ready = !!msg.ready;
    pushRoom();
  });
  N.on('hello', (msg, from) => {
    if (!online || !online.room || N.role !== 'host') return;
    const mb = online.room.members.find((x) => x.id === from);
    if (!mb) return;
    if (msg.v !== N.VERSION) { N.sendTo(from, { t: 'nope', text: 'Tienes otra versión del juego: recarga la página.' }); return; }
    mb.name = String(msg.name || 'Invitado').slice(0, 14);
    mb.picks = Array.isArray(msg.picks) ? msg.picks.filter((x) => x && PF.rosterById(x.id)) : [];
    mb.ready = false;   // cambió el equipo o el nombre: se confirma de nuevo
    pushRoom();
  });
  N.on('place', (msg, from) => { if (online && online.room && N.role === 'host') tryPlace(from, msg.place); });
  N.on('leave', (msg, from) => {
    if (!online || !online.room) return;
    const mb = online.room.members.find((x) => x.id === from);
    online.room.members = online.room.members.filter((x) => x.id !== from);
    if (mb) PF.UI.toast(`${mb.name} se fue.`);
    // en pleno partido, su Pokémon pasa a la IA
    if (match && match.online === 'host' && online.humanIds) {
      const i = online.humanIds.indexOf(from);
      if (i >= 0) PF.Match.dropHuman(match, i);
    }
    pushRoom();
  });

  // ---- invitado
  function joinRoom(code) {
    online.phase = 'joining';
    online.code = code;
    drawLobby();
    N.join(code,
      () => { online.phase = 'room'; hello(); redrawLobby(); },
      (err) => { PF.UI.toast(err); N.close(); online = { phase: 'idle' }; redrawLobby(); });
  }
  N.on('welcome', (msg) => { if (online) { online.me = msg.id; redrawLobby(); } });
  N.on('room', (msg) => { if (online) { online.room = msg.room; online.phase = 'room'; redrawLobby(); } });
  N.on('nope', (msg) => PF.UI.toast(msg.text));
  N.on('full', () => { PF.UI.toast('Esa sala ya está completa.'); N.close(); online = { phase: 'idle' }; redrawLobby(); });
  N.on('close', () => {
    PF.UI.toast('Se cortó la conexión con el anfitrión.');
    online = null;
    if (match && match.online) match = null;
    toTitle();
  });

  // ---- los dos
  /** Invitado: marcarse (o desmarcarse) como listo. Sin que todos los que juegan estén listos, el anfitrión no puede empezar. */
  function toggleReady() {
    if (N.role !== 'guest' || !online || !online.room) return;
    const me = online.room.members.find((x) => x.id === online.me);
    if (!me || me.place === 'spec') return;
    PF.Audio.sfx.click();
    N.send({ t: 'ready', ready: !me.ready });
  }
  function choosePlace(place) {
    PF.Audio.sfx.click();
    if (N.role === 'host') tryPlace('host', place);
    else N.send({ t: 'place', place });
  }
  function setName(name) {
    PF.Save.data.settings.name = String(name).trim().slice(0, 14);
    PF.Save.save();
    if (N.role === 'host' && online.room) { online.room.members[0].name = myName(); pushRoom(); }
    else if (N.role === 'guest') hello();
  }
  /** Armar el equipo con la pantalla del partido rápido y volver a la sala. */
  function onlineTeam() {
    online.view = 'team';
    const back = () => {
      if (N.role === 'host' && online.room) { online.room.members[0].picks = myPicks(); pushRoom(); }
      if (N.role === 'guest') hello();
      drawLobby();
    };
    PF.UI.select(back, back, 'Listo');
  }
  function leaveOnline() {
    N.close();
    online = null;
    toTitle();
  }

  N.on('start', (msg) => startOnline(msg.cfg, msg.view));
  N.on('in', (msg, from) => { if (online && online.inbufs && online.inbufs[from]) online.inbufs[from].push(msg.i); });
  N.on('s', (msg) => { if (match && match.online === 'guest') N.applySync(match, msg); });
  N.on('lobby', () => { if (online) toOnline(); });

  /**
   * El anfitrión arma el partido según la sala: en cada equipo con jugadores,
   * cada uno pone su parte de Pokémon (el formato repartido entre ellos) y lo
   * que falta se completa al azar; un equipo sin jugadores es de la CPU.
   */
  function startOnlineHost(rematch = false) {
    const room = online.room, s = PF.Save.data.setup, size = s.size;
    room.members[0].picks = myPicks();
    const players = room.members.filter((x) => x.place !== 'spec');
    if (!players.length) { PF.UI.toast('Alguien tiene que estar en un equipo.'); return; }
    // desde la sala hay que esperar a que todos los invitados que juegan estén listos (la revancha, no)
    const waiting = players.filter((x) => x.id !== 'host' && !x.ready);
    if (!rematch && waiting.length) { PF.UI.toast('Falta que estén listos: ' + waiting.map((x) => x.name).join(', ')); return; }
    const key = (x) => x.id + ':' + x.a;
    const teams = [[], []], bench = [[], []], formations = [null, null], humans = [], humanIds = [], skills = [];
    ['A', 'B'].forEach((place, team) => {
      const side = players.filter((x) => x.place === place);
      skills[team] = side.length ? 'mate' : s.diff;
      if (!side.length) {
        const taken = players.flatMap((x) => x.picks.map((p) => p.id));
        const rival = pickRival(taken, size + 2).map((r) => r.id + ':' + (Math.random() < 0.5 ? 0 : 1));
        teams[team] = rival.slice(0, size);
        bench[team] = rival.slice(size);
        return;
      }
      const picks = [];
      side.forEach((mb, i) => {
        const share = Math.floor(size / side.length) + (i < size % side.length ? 1 : 0);
        picks.push(...mb.picks.filter((p) => !picks.some((q) => q.id === p.id)).slice(0, share));
      });
      for (const id of PF.randomFill(picks.map((p) => p.id), size - picks.length)) picks.push({ id, a: 0 });
      teams[team] = picks.map(key);
      if (side.length === 1) {
        bench[team] = side[0].picks.slice(size, size + 2).map(key);
        if (side[0].id === 'host') formations[team] = PF.Board.spotsFor(s.spots[size + '-' + s.keeper] || {}, picks.map((p) => N.defOf(key(p))), s.keeper);
      }
      for (const mb of side) { humans.push({ team, name: mb.name }); humanIds.push(mb.id); }
    });
    const cfg = {
      size, time: s.time, stadium: s.stadium, keeperMode: s.keeper, flip: Math.random() < 0.5,
      replays: PF.Save.data.settings.replays, teams, bench, formations, humans, skills,
    };
    online.humanIds = humanIds;
    for (const mb of room.members) if (mb.id !== 'host') N.sendTo(mb.id, { t: 'start', cfg, view: humanIds.indexOf(mb.id) });
    startOnline(cfg, humanIds.indexOf('host'));
  }

  /** Arranca el partido online. view = mi humano en cfg.humans (-1: miro). */
  function startOnline(cfg, view) {
    const defs = (arr) => arr.map(N.defOf);
    PF.configureField(cfg.size);
    match = PF.Match.create({
      teams: cfg.teams.map(defs), bench: cfg.bench.map(defs), formations: cfg.formations,
      keeperMode: cfg.keeperMode, humans: cfg.humans, view, autoSubs: true,
      humanTeam: view >= 0 ? cfg.humans[view].team : -1,
      time: cfg.time, stadium: cfg.stadium, replays: cfg.replays, flip: cfg.flip,
      skills: cfg.skills.map((k) => PF.AI.SKILLS[k]),
    });
    match.online = N.role === 'host' ? 'host' : 'guest';
    match.netCfg = cfg;
    online.view = 'match';
    online.menu = false;
    if (match.online === 'host') {
      online.inbufs = {};
      for (const id of online.humanIds) if (id !== 'host') online.inbufs[id] = N.makeInputBuffer();
      online.pack = N.makeSync();
    }
    current = { cfg, onEnd: onlineResult, quit: { label: 'Abandonar', fn: leaveOnline } };
    screen = 'match';
    PF.UI.clear();
    PF.Audio.music('match');
    PF.Audio.setAmbience(1);
    if (view < 0) PF.UI.toast('Estás mirando el partido.');
  }

  function onlineReward(m) {
    const team = m.humanTeam, save = PF.Save.data;
    if (team < 0) return { coins: 0, lines: [], unlocked: [] };   // espectador
    const lines = [['Partido online', 30]];
    if (m.winner === team) lines.push(['Victoria', 70]);
    else if (m.winner === -1) lines.push(['Empate', 30]);
    if (m.score[team]) lines.push([`Goles (${m.score[team]})`, 10 * m.score[team]]);
    const coins = lines.reduce((s, l) => s + l[1], 0);
    save.coins += coins;
    countPlays(m, team);
    PF.Save.save();
    PF.Audio.sfx.coin();
    return { coins, lines, unlocked: [] };
  }

  function onlineResult(m) {
    screen = 'result';
    online.view = 'result';
    const host = m.online === 'host';
    PF.UI.result(m, onlineReward(m),
      host ? () => startOnlineHost(true) : null,
      host ? () => {
        // de vuelta en la sala todos tienen que confirmar de nuevo
        online.room.members.forEach((x) => { x.ready = false; });
        N.send({ t: 'lobby' });
        toOnline();
        pushRoom();
      } : null,
      leaveOnline,
      {
        team: 'Volver a la sala', menu: 'Salir', title: m.humanTeam < 0 ? 'Final' : null,
        note: host ? '' : 'Esperando a que el anfitrión elija revancha o volver a la sala…',
      });
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
      if ((PF.Input.was('subs') || PF.Input.was('quick')) && screen === 'match') PF.UI.toast('Online los cambios son automáticos.');
    } else {
      if (PF.Input.was('pause') && (screen === 'match' || screen === 'pause')) togglePause();
      // R: cambios directos (pausa el partido y abre la pantalla; al cerrarla se sigue jugando)
      if (PF.Input.was('subs') && screen === 'match' && match.state !== 'end') openSubs();
      else if (PF.Input.was('subs') && screen === 'pause' && document.querySelector('.subs')) resume();
      // F: cambio rápido, sin pausar (el K.O. o el más golpeado por el suplente más fresco)
      if (PF.Input.was('quick') && screen === 'match' && match.state !== 'end' && match.humanTeam >= 0) {
        const why = PF.Match.quickSub(match, match.humanTeam);
        if (why) PF.UI.toast(why);
      }
    }
    if (PF.Input.was('mute')) PF.Audio.toggleMute();

    let steps = 0;
    if (net === 'guest') {
      // invitado: manda sus teclas una vez por frame y sólo anima efectos y cámara
      if (screen === 'match' && match.view >= 0) N.send({ t: 'in', i: humanIntent() });
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
        const ins = online.humanIds.map((id) => (id === 'host' ? (screen === 'match' ? humanIntent() : null)
          : online.inbufs[id] ? online.inbufs[id].take() : null));
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
