/* ============ core.js — espacio de nombres, medidas y utilidades ============
 * Scripts clásicos (no módulos ES) para que el juego se abra con doble clic:
 * los módulos están bloqueados en file://.
 */
var PF = window.PF = {};

/** Tamaño lógico del canvas. Se escala entero a la ventana (main.js). */
PF.W = 1280;
PF.H = 760;

/** Cancha: rectángulo con esquinas achaflanadas y un arco en cada lado. */
PF.FIELD = (() => {
  const f = { x0: 90, x1: 1190, y0: 96, y1: 712, goalHalf: 88, goalDepth: 46, chamfer: 50 };
  f.cx = (f.x0 + f.x1) / 2;
  f.cy = (f.y0 + f.y1) / 2;
  return f;
})();

PF.MATCH_TIME = 120;                       // segundos
PF.TEAM_COLORS = ['#ff5a5f', '#4d8dff'];   // 0 = izquierda (tú), 1 = derecha (CPU)
PF.TEAM_NAMES = ['TÚ', 'CPU'];

PF.U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  rand: (a, b) => a + Math.random() * (b - a),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  /** Diferencia de ángulos en (-π, π]. */
  angDiff: (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  },
  /** Factor de acercamiento exponencial independiente del framerate. */
  damp: (k, dt) => 1 - Math.exp(-k * dt),
  shuffle: (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};
