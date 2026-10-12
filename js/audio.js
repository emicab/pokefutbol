/* ============ audio.js — efectos sintetizados con WebAudio ============
 * Nada de archivos: cada sonido es un oscilador o un poco de ruido filtrado.
 * El contexto se crea con la primera tecla o clic (los navegadores no dejan
 * sonar nada antes).
 */
PF.Audio = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;

  function unlock() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.32;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.3, freq = 1200, type = 'lowpass', delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

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
    swoosh() { noise(0.12, 0.18, 900, 'bandpass'); },
    tackle() { noise(0.14, 0.45, 700); tone(110, 0.14, 'sawtooth', 0.25, -60); },
    zap() { tone(1100, 0.28, 'sawtooth', 0.18, -900); noise(0.25, 0.22, 4500, 'highpass'); tone(700, 0.2, 'square', 0.12, 500, 0.05); },
    fire() { noise(0.45, 0.4, 1300); tone(180, 0.3, 'sawtooth', 0.15, 200); },
    water() { noise(0.5, 0.35, 900, 'bandpass'); noise(0.3, 0.15, 3000, 'highpass', 0.1); },
    vine() { tone(380, 0.16, 'triangle', 0.3, 520); tone(900, 0.06, 'square', 0.12, 0, 0.14); },
    phase() { tone(640, 0.5, 'sine', 0.25, -480); tone(660, 0.5, 'sine', 0.15, -470, 0.03); },
    jump() { tone(200, 0.3, 'square', 0.2, 300); },
    slam() { tone(70, 0.4, 'sawtooth', 0.5, -40); noise(0.4, 0.55, 500); },
    pickup() { tone(660, 0.07, 'square', 0.2); tone(990, 0.12, 'square', 0.2, 0, 0.07); tone(1320, 0.15, 'square', 0.18, 0, 0.15); },
    fail() { tone(220, 0.15, 'square', 0.15, -80); },
    whistle(long = false) { tone(2300, long ? 0.8 : 0.28, 'sine', 0.22, 0); tone(2360, long ? 0.8 : 0.28, 'sine', 0.12, 0); },
    goal() {
      noise(1.8, 0.35, 900, 'bandpass');
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.16, 0, i * 0.11));
      tone(1047, 0.6, 'square', 0.14, 0, 0.5);
    },
  };

  return {
    unlock,
    sfx,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
  };
})();
