/* ============ save.js — progreso y opciones en localStorage ============
 * Monedas, Pokémon y estadios desbloqueados, estadísticas, opciones, la
 * última configuración de partido y el club del modo historia. Si el navegador no deja guardar (modo
 * privado, archivo local con almacenamiento bloqueado...), el juego sigue
 * funcionando y sólo se pierde al cerrar.
 */
PF.Save = (() => {
  const KEY = 'pokefutbol.v1';

  const defaults = () => ({
    coins: 0,
    unlocked: [],                 // ids de Pokémon comprados o ganados (los iniciales no hace falta)
    stadiums: ['estadio'],
    stats: { played: 0, won: 0, goals: 0, hardWins: 0, bigWins: 0 },
    settings: { music: 0.5, sfx: 0.8, aids: true, replays: true },
    setup: { size: 2, time: 120, diff: 'normal', stadium: 'estadio', picks: [], abil: {}, keeper: 'dynamic', spots: {} },
    career: null,                 // modo historia (career.js)
  });

  function load() {
    const d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const s = JSON.parse(raw);
      migrate(s);
      return {
        coins: s.coins | 0,
        unlocked: Array.isArray(s.unlocked) ? s.unlocked : [],
        stadiums: Array.isArray(s.stadiums) ? s.stadiums : d.stadiums,
        stats: Object.assign(d.stats, s.stats),
        settings: Object.assign(d.settings, s.settings),
        setup: Object.assign(d.setup, s.setup),
        career: s.career && Array.isArray(s.career.club) ? s.career : null,
      };
    } catch (e) {
      return d;
    }
  }

  /** Guardados viejos: el arquero "araña" pasó a llamarse "dinámico". */
  function migrate(s) {
    const fix = (o) => { if (o && o.keeper === 'spider') o.keeper = 'dynamic'; };
    fix(s.setup);
    fix(s.career);
    if (s.setup && s.setup.spots) {
      for (const k of Object.keys(s.setup.spots)) {
        if (k.endsWith('-spider')) { s.setup.spots[k.replace('-spider', '-dynamic')] = s.setup.spots[k]; delete s.setup.spots[k]; }
      }
    }
    if (s.career && s.career.spots && s.career.spots.spider) { s.career.spots.dynamic = s.career.spots.spider; delete s.career.spots.spider; }
  }

  let data = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* sin almacenamiento: seguimos */ }
  }

  function reset() {
    data = defaults();
    save();
  }

  return {
    get data() { return data; },
    save,
    reset,
  };
})();
