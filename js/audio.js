/* ============ audio.js — efectos, música y público, todo sintetizado ============
 * Nada de archivos: cada sonido es un oscilador o ruido filtrado.
 * Tres buses con su volumen: efectos (sfx), música y público (va con los efectos).
 * El contexto se crea con la primera tecla o clic (los navegadores no dejan
 * sonar nada antes).
 */
PF.Audio = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, crowdBus = null, noiseBuf = null;
  let muted = false;
  const vol = { music: 0.5, sfx: 0.8 };

  function unlock() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.connect(master);
        musicBus = ctx.createGain(); musicBus.connect(master);
        crowdBus = ctx.createGain(); crowdBus.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        applyVolumes();
        startAmbience();
        if (Music.want) Music.play(Music.want);
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function applyVolumes() {
    if (!ctx) return;
    sfxBus.gain.value = 0.36 * vol.sfx;
    crowdBus.gain.value = 0.5 * vol.sfx;
    musicBus.gain.value = 0.32 * vol.music;
  }

  function setVolumes(music, sfx) {
    vol.music = music; vol.sfx = sfx;
    applyVolumes();
  }

  // ---------------------------------------------------------------- primitivas
  function tone(freq, dur, type = 'square', v = 0.3, slide = 0, delay = 0, bus = sfxBus, at = null) {
    if (!ctx) return;
    const t = at ?? ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, v = 0.3, freq = 1200, type = 'lowpass', delay = 0, bus = sfxBus, at = null, sweepTo = 0) {
    if (!ctx) return;
    const t = at ?? ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = type === 'bandpass' ? 2.5 : 0.7;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1); src.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- efectos
  let lastBounce = 0;
  const sfx = {
    touch() { tone(320, 0.04, 'triangle', 0.18); },
    kick(p = 1) { tone(160, 0.1, 'triangle', 0.5, -90); noise(0.07, 0.3 * p, 2600); },
    pass() { tone(240, 0.07, 'triangle', 0.35, -60); noise(0.04, 0.12, 2000); },
    bounce(imp) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - lastBounce < 0.06) return;
      lastBounce = now;
      tone(200 + Math.min(imp, 900) * 0.2, 0.05, 'square', Math.min(0.2, imp / 3000));
    },
    post() { tone(880, 0.5, 'triangle', 0.35, -40); tone(1320, 0.4, 'sine', 0.2, -60); },
    swoosh() { noise(0.12, 0.18, 900, 'bandpass'); },
    tackle() { noise(0.14, 0.45, 700); tone(110, 0.14, 'sawtooth', 0.25, -60); },
    zap() { tone(1100, 0.28, 'sawtooth', 0.18, -900); noise(0.25, 0.22, 4500, 'highpass'); tone(700, 0.2, 'square', 0.12, 500, 0.05); },
    fire() { noise(0.45, 0.4, 1300); tone(180, 0.3, 'sawtooth', 0.15, 200); },
    water() { noise(0.5, 0.35, 900, 'bandpass'); noise(0.3, 0.15, 3000, 'highpass', 0.1); },
    vine() { tone(380, 0.16, 'triangle', 0.3, 520); tone(900, 0.06, 'square', 0.12, 0, 0.14); },
    phase() { tone(640, 0.5, 'sine', 0.25, -480); tone(660, 0.5, 'sine', 0.15, -470, 0.03); },
    sing() { [659, 784, 880, 784, 659].forEach((f, i) => tone(f, 0.22, 'sine', 0.22, 0, i * 0.12)); },
    jump() { tone(200, 0.3, 'square', 0.2, 300); },
    slam() { tone(70, 0.4, 'sawtooth', 0.5, -40); noise(0.4, 0.55, 500); },
    pickup() { tone(660, 0.07, 'square', 0.2); tone(990, 0.12, 'square', 0.2, 0, 0.07); tone(1320, 0.15, 'square', 0.18, 0, 0.15); },
    coin() { tone(988, 0.08, 'square', 0.18); tone(1319, 0.25, 'square', 0.18, 0, 0.08); },
    fail() { tone(220, 0.15, 'square', 0.15, -80); },
    click() { tone(520, 0.05, 'square', 0.12); },
    whistle(long = false) { tone(2300, long ? 0.8 : 0.28, 'sine', 0.22, 0); tone(2360, long ? 0.8 : 0.28, 'sine', 0.12, 0); },
    goal() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.16, 0, i * 0.11));
      tone(1047, 0.6, 'square', 0.14, 0, 0.5);
    },
  };

  // ---------------------------------------------------------------- público
  let ambience = null, ambienceLevel = 0;
  function startAmbience() {
    if (!ctx || ambience) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.8;
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(crowdBus);
    src.start();
    ambience = g;
  }

  /** Murmullo de fondo: 0 en el menú, ~1 en el partido. */
  function setAmbience(level) {
    ambienceLevel = level;
    if (ambience) ambience.gain.setTargetAtTime(0.06 * level, ctx.currentTime, 0.5);
  }

  /** Reacciones: 'cheer' (gol), 'ooh' (casi gol), 'oh' (golpe fuerte). */
  function crowd(kind, k = 1) {
    if (!ctx || muted) return;
    if (kind === 'cheer') {
      noise(2.6, 0.5 * k, 900, 'bandpass', 0, crowdBus, null, 1400);
      noise(2.2, 0.25 * k, 2600, 'bandpass', 0.15, crowdBus);
      for (let i = 0; i < 6; i++) tone(300 + Math.random() * 400, 0.5, 'sawtooth', 0.02 * k, 120, Math.random() * 0.8, crowdBus);
    } else if (kind === 'ooh') {
      noise(1.1, 0.35 * k, 1100, 'bandpass', 0, crowdBus, null, 380);
      for (let i = 0; i < 5; i++) tone(220 + i * 37, 0.9, 'sawtooth', 0.025 * k, -110, i * 0.02, crowdBus);
    } else if (kind === 'oh') {
      noise(0.5, 0.25 * k, 800, 'bandpass', 0, crowdBus, null, 500);
    }
  }

  // ---------------------------------------------------------------- música
  /**
   * Secuenciador de chiptune: 4 compases de 16 semicorcheas, en bucle.
   * Cada tema: tempo, acordes (uno por compás, en MIDI), melodía en corcheas
   * (null = silencio) y patrón de batería.
   */
  const SONGS = {
    menu: {
      bpm: 112,
      chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
      melody: [76, null, 79, null, 84, null, 83, 81, 79, null, 74, null, 79, null, null, null,
        76, null, 72, null, 76, 79, 81, null, 77, null, 76, null, 74, null, null, null],
      drums: { kick: [0, 8], snare: [], hat: [4, 12] },
    },
    match: {
      bpm: 148,
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      melody: [69, 72, 76, 72, 81, null, 79, 76, 77, null, 76, 74, 72, null, 74, null,
        72, 76, 79, 76, 84, null, 83, 79, 79, null, 77, 76, 74, null, 71, null],
      drums: { kick: [0, 6, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    },
  };
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const Music = {
    want: null, song: null, step: 0, next: 0, timer: null,
    play(name) {
      this.want = name;
      if (!ctx) return;
      if (this.song === SONGS[name]) return;
      this.song = SONGS[name];
      this.step = 0;
      this.next = ctx.currentTime + 0.1;
      if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
    },
    stop() {
      this.want = null; this.song = null;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },
    tick() {
      const s = this.song;
      if (!s || !ctx) return;
      const st = 60 / s.bpm / 4;                 // una semicorchea
      while (this.next < ctx.currentTime + 0.15) {
        this.note(s, this.step, this.next, st);
        this.step = (this.step + 1) % 64;
        this.next += st;
      }
    },
    note(s, i, t, st) {
      if (muted) return;
      const bar = Math.floor(i / 16), pos = i % 16, ch = s.chords[bar];
      // bajo: fundamental en negras, octava en corcheas intermedias
      if (pos % 4 === 0) tone(midi(ch[0] - 12), st * 3, 'triangle', 0.5, 0, 0, musicBus, t);
      else if (pos % 4 === 2) tone(midi(ch[0]), st * 1.5, 'triangle', 0.3, 0, 0, musicBus, t);
      // arpegio suave
      tone(midi(ch[pos % 3] + 12), st * 0.9, 'square', 0.05, 0, 0, musicBus, t);
      // melodía en corcheas
      if (pos % 2 === 0) {
        const n = s.melody[(bar * 8 + pos / 2) % s.melody.length];
        if (n) { tone(midi(n), st * 1.8, 'square', 0.12, 0, 0, musicBus, t); tone(midi(n) * 1.004, st * 1.8, 'square', 0.05, 0, 0, musicBus, t); }
      }
      // batería
      if (s.drums.kick.includes(pos)) tone(150, 0.12, 'sine', 0.7, -110, 0, musicBus, t);
      if (s.drums.snare.includes(pos)) noise(0.12, 0.35, 1800, 'highpass', 0, musicBus, t);
      if (s.drums.hat.includes(pos)) noise(0.03, 0.12, 7000, 'highpass', 0, musicBus, t);
    },
  };

  return {
    unlock,
    sfx,
    crowd,
    setAmbience,
    setVolumes,
    music: (name) => (name ? Music.play(name) : Music.stop()),
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
  };
})();
