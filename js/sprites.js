/* ============ sprites.js — hojas de Mundo Misterioso (SpriteCollab) ============
 * assets/pokemon/{dex}/{Anim}.png, geometría en PF.SPRITE_META.
 *   columnas = fotogramas · filas = 8 direcciones
 *   0 Down · 1 DownRight · 2 Right · 3 UpRight · 4 Up · 5 UpLeft · 6 Left · 7 DownLeft
 * El ancla (ax, ay) de cada animación cae en los pies de la entidad, así el
 * sprite no salta al pasar de Walk a Attack.
 */
PF.Sprites = (() => {
  const PX = 2;                       // píxeles de pantalla por píxel de arte
  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt'];
  const sheets = new Map();

  function sheet(dex, anim) {
    const key = dex + '/' + anim;
    let s = sheets.get(key);
    if (!s) {
      const img = new Image();
      s = { img, ready: false };
      img.onload = () => { s.ready = true; };
      img.src = `assets/pokemon/${dex}/${anim}.png`;
      sheets.set(key, s);
    }
    return s;
  }

  function preload(dex) { for (const a of ANIMS) sheet(dex, a); }
  function preloadAll() { for (const r of PF.ROSTER) preload(r.dex); }

  function anim(dex, name) {
    const m = PF.SPRITE_META[dex];
    return (m && (m.a[name] || m.a.Idle)) || null;
  }

  /** Duración de una animación completa, en segundos. */
  function duration(dex, name) {
    const a = anim(dex, name);
    return a ? a.d.reduce((s, x) => s + x, 0) / 60 : 0;
  }

  /** Altura aproximada de la cabeza sobre los pies (para estrellas, marcadores...). */
  function headHeight(dex) {
    const a = anim(dex, 'Walk');
    return a ? a.ay * PX + 4 : 40;
  }

  function frameAt(a, t, loop) {
    const total = a.d.reduce((s, x) => s + x, 0);
    let f = t * 60;
    if (loop) f %= total;
    else if (f >= total) return a.n - 1;
    for (let i = 0; i < a.n; i++) {
      f -= a.d[i];
      if (f < 0) return i;
    }
    return a.n - 1;
  }

  // ángulo de pantalla (0 = derecha, π/2 = abajo) -> fila de la hoja
  const ROW = [2, 1, 0, 7, 6, 5, 4, 3];
  function dirRow(angle) {
    let i = Math.round(angle / (Math.PI / 4));
    i = ((i % 8) + 8) % 8;
    return ROW[i];
  }

  function draw(ctx, dex, name, t, loop, angle, x, y, scale = 1) {
    const m = PF.SPRITE_META[dex];
    if (!m) return;
    if (!m.a[name]) name = 'Idle';
    const a = m.a[name];
    const s = sheet(dex, name);
    if (!s.ready) return;
    const fi = frameAt(a, t, loop);
    const row = a.r > 1 ? dirRow(angle) : 0;
    const k = PX * scale;
    ctx.drawImage(s.img, fi * a.w, row * a.h, a.w, a.h,
      Math.round(x - a.ax * k), Math.round(y - a.ay * k), a.w * k, a.h * k);
  }

  return { PX, preload, preloadAll, duration, headHeight, draw };
})();
