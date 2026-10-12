/* ============ input.js — teclado (configurable) y mando ============
 * `is` = está pulsado ahora · `was` = se pulsó desde el último paso de simulación.
 * main.js llama a endStep() sólo cuando ha corrido al menos un paso, así no se
 * pierden pulsaciones en pantallas de más de 60 Hz.
 *
 * Las teclas se pueden cambiar en Opciones; se guardan en
 * PF.Save.data.settings.keys como { acción: [códigos...] } (el primero es el
 * principal, el que se muestra en las ayudas).
 */
PF.Input = (() => {
  const DEFAULTS = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    pass: ['KeyJ', 'KeyZ'],
    shoot: ['KeyK', 'KeyX'],
    ability: ['KeyL', 'KeyC'],
    press: ['Space', 'KeyI'],
    swap: ['KeyQ', 'ShiftLeft', 'ShiftRight'],
    order: ['KeyT'],
    subs: ['KeyR'],
    pause: ['Escape', 'KeyP'],
    mute: ['KeyM'],
  };
  /** Acciones que se pueden reasignar, en el orden de la pantalla de Opciones. */
  const ACTIONS = [
    ['up', 'Arriba'], ['down', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha'],
    ['pass', 'Pase (mantén = más fuerte) · placaje'], ['shoot', 'Tiro (mantén para cargar)'],
    ['ability', 'Habilidad'], ['press', 'Presionar'], ['swap', 'Cambiar de Pokémon'],
    ['order', 'Orden al equipo'], ['subs', 'Cambios'], ['pause', 'Pausa'], ['mute', 'Silencio'],
  ];
  // Mando estándar: A pase/placaje · B tiro · Y o RB habilidad · X presionar · LB cambiar
  //                 LT orden al compañero · Select cambios · Start pausa
  const PAD = { pass: [0], shoot: [1], ability: [3, 5], press: [2], swap: [4], order: [6], subs: [8], pause: [9] };

  let MAP = {};
  let GAME_KEYS = new Set();

  function load() {
    const saved = (PF.Save.data.settings && PF.Save.data.settings.keys) || {};
    MAP = {};
    for (const [a, codes] of Object.entries(DEFAULTS)) MAP[a] = Array.isArray(saved[a]) && saved[a].length ? saved[a].slice() : codes.slice();
    GAME_KEYS = new Set(Object.values(MAP).flat());
  }
  load();

  function persist() {
    PF.Save.data.settings.keys = JSON.parse(JSON.stringify(MAP));
    PF.Save.save();
    GAME_KEYS = new Set(Object.values(MAP).flat());
  }

  /** Asigna `code` como tecla principal de `action` (y se la quita a cualquier otra). */
  function bind(action, code) {
    for (const a of Object.keys(MAP)) MAP[a] = MAP[a].filter((c) => c !== code);
    MAP[action] = [code].concat(MAP[action].filter((c) => c !== code).slice(1));
    // si a alguna acción le quedó sin teclas, recupera la suya por defecto (si está libre)
    for (const a of Object.keys(MAP)) {
      if (!MAP[a].length) MAP[a] = DEFAULTS[a].filter((c) => !Object.values(MAP).flat().includes(c)).slice(0, 1);
    }
    persist();
  }

  function reset() {
    PF.Save.data.settings.keys = null;
    PF.Save.save();
    load();
  }

  const NAMES = {
    Space: 'Espacio', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'Shift', ShiftRight: 'Shift der.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl der.',
    AltLeft: 'Alt', AltRight: 'Alt der.', Comma: ',', Period: '.', Slash: '/', Semicolon: 'Ñ',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backquote: 'º', Quote: '´', IntlBackslash: '<',
  };
  /** Nombre legible de un código de tecla. */
  function keyName(code) {
    if (!code) return '—';
    if (NAMES[code]) return NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  }
  /** Tecla principal de una acción, para las ayudas en pantalla. */
  const label = (action) => keyName(MAP[action] && MAP[action][0]);
  /** Movimiento: "WASD" si son las de siempre, si no las cuatro teclas. */
  function moveLabel() {
    const k = ['up', 'left', 'down', 'right'].map(label);
    return k.join('') === 'WASD' ? 'WASD' : k.join(' ');
  }

  const down = new Set(), pressed = new Set();
  let padDown = new Set(), padPressed = new Set(), padAxes = [0, 0];
  let capture = null;   // función que recibe la próxima tecla (al reasignar)

  addEventListener('keydown', (e) => {
    PF.Audio.unlock();
    if (capture) {
      e.preventDefault();
      const fn = capture;
      capture = null;
      fn(e.code);
      return;
    }
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

  return {
    ACTIONS, is, was, move, pollPad, endStep,
    bind, reset, reload: load, keyName, label, moveLabel,
    keys: (action) => MAP[action].slice(),
    /** La próxima tecla pulsada se entrega a fn (para reasignar). */
    captureNext: (fn) => { capture = fn; },
    cancelCapture: () => { capture = null; },
  };
})();
