/* ============ input.js — teclado y mando ============
 * `is` = está pulsado ahora · `was` = se pulsó desde el último paso de simulación.
 * main.js llama a endStep() sólo cuando ha corrido al menos un paso, así no se
 * pierden pulsaciones en pantallas de más de 60 Hz.
 */
PF.Input = (() => {
  const MAP = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    pass: ['KeyJ', 'KeyZ'],
    shoot: ['KeyK', 'KeyX'],
    ability: ['KeyL', 'KeyC'],
    swap: ['KeyQ', 'ShiftLeft', 'ShiftRight'],
    press: ['Space', 'KeyI'],
    order: ['KeyT'],
    pause: ['Escape', 'KeyP'],
    mute: ['KeyM'],
  };
  // Mando estándar: A pase/placaje · B tiro · Y o RB habilidad · X presionar · LB cambiar
  //                 LT orden al compañero · Start pausa
  const PAD = { pass: [0], shoot: [1], ability: [3, 5], press: [2], swap: [4], order: [6], pause: [9] };

  const GAME_KEYS = new Set(Object.values(MAP).flat());
  const down = new Set(), pressed = new Set();
  let padDown = new Set(), padPressed = new Set(), padAxes = [0, 0];

  addEventListener('keydown', (e) => {
    PF.Audio.unlock();
    if (GAME_KEYS.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());
  addEventListener('pointerdown', () => PF.Audio.unlock());

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    const now = new Set();
    padAxes = [0, 0];
    if (gp) {
      gp.buttons.forEach((b, i) => { if (b.pressed) now.add(i); });
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.25) padAxes = [ax, ay];
      if (now.has(12)) padAxes[1] = -1;
      if (now.has(13)) padAxes[1] = 1;
      if (now.has(14)) padAxes[0] = -1;
      if (now.has(15)) padAxes[0] = 1;
    }
    for (const i of now) if (!padDown.has(i)) padPressed.add(i);
    padDown = now;
  }

  const is = (action) =>
    MAP[action].some((c) => down.has(c)) || (PAD[action] || []).some((i) => padDown.has(i));
  const was = (action) =>
    MAP[action].some((c) => pressed.has(c)) || (PAD[action] || []).some((i) => padPressed.has(i));

  function move() {
    let mx = (is('right') ? 1 : 0) - (is('left') ? 1 : 0);
    let my = (is('down') ? 1 : 0) - (is('up') ? 1 : 0);
    if (!mx && !my) [mx, my] = padAxes;
    return [mx, my];
  }

  function endStep() { pressed.clear(); padPressed.clear(); }

  return { is, was, move, pollPad, endStep };
})();
