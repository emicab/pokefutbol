/* ============ save.js — progreso y opciones en localStorage ============
 * Monedas, Pokémon y estadios desbloqueados, estadísticas, opciones, la
 * última configuración de partido y el club del modo historia. Si el navegador no deja guardar (modo
 * privado, archivo local con almacenamiento bloqueado...), el juego sigue
 * funcionando y sólo se pierde al cerrar. Se puede exportar a un archivo, importar de uno
 * y sincronizar con la nube (cloud.js); las opciones (sonido, teclas) quedan en cada dispositivo.
 */
PF.Save = (() => {
  const KEY = 'pokefutbol.v1';

  const defaults = () => ({
    v: 2,                         // versión del guardado (ver migrate)
    coins: 0,
    unlocked: [],                 // ids de Pokémon comprados o ganados (los gratis no hace falta)
    abil: {},                     // id → [índices de habilidades compradas] (la 0 viene con él)
    plays: {},                    // id → partidos jugados con ese Pokémon (para comprar su evolución)
    stadiums: ['estadio'],
    stats: { played: 0, won: 0, goals: 0, hardWins: 0, bigWins: 0, cups: 0 },
    settings: { music: 0.5, sfx: 0.8, aids: true, replays: true, keys: null },
    setup: { size: 2, time: 120, diff: 'normal', stadium: 'estadio', picks: [], abil: {}, keeper: 'dynamic', spots: {}, rules: {} },
    career: null,                 // modo historia (career.js)
    tournament: null,             // torneo local en curso (tournament.js)
  });

  /** Un guardado cualquiera (de localStorage, de un archivo o de la nube) → uno válido, con lo que falte por defecto. */
  function fromRaw(s) {
    const d = defaults();
    migrate(s);
    return {
      v: 2,
      coins: s.coins | 0,
      unlocked: Array.isArray(s.unlocked) ? s.unlocked : [],
      abil: s.abil && typeof s.abil === 'object' ? s.abil : {},
      plays: s.plays && typeof s.plays === 'object' ? s.plays : {},
      stadiums: Array.isArray(s.stadiums) ? s.stadiums : d.stadiums,
      stats: Object.assign(d.stats, s.stats),
      settings: Object.assign(d.settings, s.settings),
      setup: Object.assign(d.setup, s.setup),
      career: s.career && Array.isArray(s.career.club) ? s.career : null,
      tournament: s.tournament && Array.isArray(s.tournament.teams) && Array.isArray(s.tournament.rounds) ? s.tournament : null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return fromRaw(JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  /** Pokémon que ya no están (sólo Gen 1 por ahora) → su reemplazo. */
  const RENAMED = { lucario: 'alakazam', greninja: 'jolteon' };
  const DEX_GEN1 = { 446: 143, 447: 66, 448: 68, 656: 7, 657: 8, 658: 9, 208: 95 };

  /** Guardados viejos: arquero "araña" → "dinámico"; Pokémon fuera de la Gen 1 → reemplazos. */
  function migrate(s) {
    const ren = (id) => RENAMED[id] || id;
    if (Array.isArray(s.unlocked)) s.unlocked = [...new Set(s.unlocked.map(ren))];
    if (s.setup) {
      if (Array.isArray(s.setup.picks)) s.setup.picks = [...new Set(s.setup.picks.map(ren))];
      if (s.setup.abil) for (const [a, b] of Object.entries(RENAMED)) if (a in s.setup.abil) { s.setup.abil[b] = 0; delete s.setup.abil[a]; }
    }
    if (s.career && Array.isArray(s.career.club)) for (const mb of s.career.club) if (DEX_GEN1[mb.dex]) mb.dex = DEX_GEN1[mb.dex];
    const fix = (o) => { if (o && o.keeper === 'spider') o.keeper = 'dynamic'; };
    fix(s.setup);
    fix(s.career);
    if (s.setup && s.setup.spots) {
      for (const k of Object.keys(s.setup.spots)) {
        if (k.endsWith('-spider')) { s.setup.spots[k.replace('-spider', '-dynamic')] = s.setup.spots[k]; delete s.setup.spots[k]; }
      }
    }
    if (s.career && s.career.spots && s.career.spots.spider) { s.career.spots.dynamic = s.career.spots.spider; delete s.career.spots.spider; }
    // v2: la segunda habilidad pasa a comprarse; la que ya tenías elegida queda tuya
    if (!s.v || s.v < 2) {
      s.abil = s.abil || {};
      if (s.setup && s.setup.abil) for (const [id, i] of Object.entries(s.setup.abil)) if (i === 1) s.abil[id] = true;
    }
  }

  let data = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* sin almacenamiento: seguimos */ }
    if (PF.Cloud) PF.Cloud.touch();   // hay cambios para subir a la nube
  }

  function reset() {
    if (PF.Cloud) PF.Cloud.pause();   // borrar el progreso no pisa la copia de la nube
    data = defaults();
    save();
  }

  /** Lo que viaja a la nube y a los archivos: todo menos las opciones del dispositivo. */
  function snapshot() {
    const o = JSON.parse(JSON.stringify(data));
    delete o.settings;
    return o;
  }

  /**
   * Reemplaza el progreso por el de un guardado externo (conserva las opciones de este dispositivo).
   * Devuelve { ok } o { ok: false, error }.
   */
  function replaceWith(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || typeof obj.coins === 'undefined' || !obj.stats) return { ok: false, error: 'No parece una partida de PokéFútbol.' };
    try {
      const next = fromRaw(JSON.parse(JSON.stringify(obj)));
      next.settings = data.settings;
      data = next;
      save();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'El archivo está dañado.' };
    }
  }

  /** ¿Hay algo de progreso? (para no pisar una partida con una vacía) */
  const hasProgress = () => data.stats.played > 0 || data.coins > 0 || data.unlocked.length > 0 || !!data.career;

  return {
    get data() { return data; },
    save,
    reset,
    snapshot,
    replaceWith,
    hasProgress,
  };
})();
