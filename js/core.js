/* ============ core.js — espacio de nombres, medidas y utilidades ============
 * Scripts clásicos (no módulos ES) para que el juego se abra con doble clic:
 * los módulos están bloqueados en file://.
 */
var PF = window.PF = {};

/** Tamaño lógico del canvas (la "cámara"). Se escala entero a la ventana (main.js). */
PF.W = 1280;
PF.H = 760;

/**
 * Cancha: rectángulo con esquinas achaflanadas y un arco en cada lado.
 * Es un objeto único que se MODIFICA (no se reemplaza) al cambiar el formato,
 * porque varios módulos guardan la referencia `const F = PF.FIELD`.
 */
PF.FIELD = {};
PF.WORLD = { w: PF.W, h: PF.H };

/** Medidas por formato (jugadores por equipo). 2 vs 2 cabe justo en pantalla. */
PF.FIELD_SIZES = {
  2: { w: 1100, h: 616, goalHalf: 88, chamfer: 50 },
  3: { w: 1420, h: 790, goalHalf: 100, chamfer: 60 },
  5: { w: 1850, h: 1010, goalHalf: 118, chamfer: 70 },
};

PF.configureField = (size) => {
  const s = PF.FIELD_SIZES[size] || PF.FIELD_SIZES[2];
  const marginX = 90, top = 96, bottom = 48;
  Object.assign(PF.FIELD, {
    size, x0: marginX, x1: marginX + s.w, y0: top, y1: top + s.h,
    goalHalf: s.goalHalf, goalDepth: 46, chamfer: s.chamfer,
  });
  PF.FIELD.cx = (PF.FIELD.x0 + PF.FIELD.x1) / 2;
  PF.FIELD.cy = (PF.FIELD.y0 + PF.FIELD.y1) / 2;
  PF.WORLD.w = s.w + marginX * 2;
  PF.WORLD.h = s.h + top + bottom;
  if (PF.Field) PF.Field.rebuild();
};
PF.configureField(2);

PF.MATCH_TIME = 120;                       // segundos (por defecto)
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
