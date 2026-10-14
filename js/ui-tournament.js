/* ============ ui-tournament.js — pantalla del cuadro del torneo ============
 * Sirve al torneo de uno, al cooperativo online (h.coop) y al de cada uno con su equipo (h.cup).
 */
PF.TournamentUI = (() => {
  const T = () => PF.Tournament;
  const root = () => document.getElementById('ui');

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const teamColor = (t, i) => (t.teams[i].human ? 'var(--yellow)' : PF.rosterById(t.teams[i].members[0].id).color);
  const minis = (members) => members.map((m) => {
    const r = PF.rosterById(m.id);
    return `<span class="tmini" style="--tc:${r.color}"><canvas width="56" height="48" data-dex="${r.dex}" data-sc="0.7"></canvas><small>${r.name}</small></span>`;
  }).join('');
  const lc = (s) => String(s).toLowerCase();

  /** Texto del botón de jugar según el cruce (m) y, en el torneo de cada uno, el partido de la cola (entry). */
  function playLabel(t, m, entry) {
    const leg = entry ? entry.leg : m.legs === 2 ? (m.l1 ? 2 : 1) : 0;
    if (leg === 2) return '¡Jugar la vuelta!';
    if (leg === 1) return '¡Jugar la ida!';
    if (m.bo) return `¡Jugar el partido ${T().played(m) + 1} de la serie!`;
    return `¡Jugar ${lc(T().roundName(t, t.round))}!`;
  }

  /**
   * h = { onPlay(match | entry), onMenu(), onAbandon(), onNew() }
   * Online: h.coop = true; h.guest = true si no eres el anfitrión (sólo mira el cuadro);
   * h.cup = true (cada uno con su equipo) y h.owner = tu id en la sala.
   */
  function bracket(t, h) {
    const cup = !!h.cup;
    const mine = cup ? t.teams.findIndex((x) => x.owner === h.owner) : T().humanIdx(t);
    const entry = cup ? T().cupNext(t) : null;
    const next = cup ? (entry && entry.match) : T().myMatch(t);
    const stand = cup ? (mine >= 0 ? T().standingOf(t, mine) : null) : T().standing(t);
    const done = t.champion != null;

    const col = (r) => {
      const ms = t.rounds[r] || null;
      const cards = Array.from({ length: T().matchesIn(t, r) }, (_, k) => {
        const m = ms && ms[k];
        if (!m) return '<div class="bm ghost"><div class="bt"><span>Por definir</span></div><div class="bt"><span>Por definir</span></div></div>';
        const wins = T().wins(m);
        const score = (i) => {
          const side = i === m.a ? 0 : 1;
          if (m.bo) return (m.games || []).length || m.w != null ? wins[side] : null;
          if (m.w == null) return m.l1 ? m.l1[side] : null;
          return side ? m.sb : m.sa;
        };
        const row = (i) => {
          const sc = score(i);
          const cls = `${i === mine ? 'me' : t.teams[i].human ? 'hum' : ''} ${m.w == null ? '' : m.w === i ? 'win' : 'lose'}`;
          return `<div class="bt ${cls}" style="--tc:${teamColor(t, i)}"><span>${t.teams[i].name}</span><b>${sc == null ? '' : sc}${m.pen && m.w === i ? ' <small>pen.</small>' : ''}</b></div>`;
        };
        let tag = '';
        if (m.bo) tag = `<div class="bl">Mejor de ${m.bo}</div>`;
        else if (m.legs === 2) tag = `<div class="bl">${m.l1 ? `ida ${m.l1[0]}–${m.l1[1]}${m.w == null ? ' · falta la vuelta' : ' · global'}` : 'ida y vuelta'}</div>`;
        return `<div class="bm ${m === next ? 'cur' : ''}">${row(m.a)}${row(m.b)}${tag}</div>`;
      }).join('');
      return `<div class="bcol ${r === t.round && !done ? 'now' : ''}"><h3>${T().roundName(t, r)}</h3><div class="bcards">${cards}</div></div>`;
    };

    let banner = '';
    if (done) {
      const prize = cup ? ((t.prizes || {})[mine] || 0) : t.prize;
      if (stand === 'Campeón') {
        banner = `<div class="tbanner win">🏆 ${h.coop && !cup ? '¡Son los campeones del torneo!' : '¡Eres el campeón del torneo!'} <b>+${prize}</b> monedas</div>`;
      } else if (cup && mine < 0) {
        banner = `<div class="tbanner">El campeón fue <b>${t.teams[t.champion].name}</b>.</div>`;
      } else {
        banner = `<div class="tbanner">${h.coop && !cup ? 'Quedaron eliminados' : 'Quedaste eliminado'} en ${lc(stand)}. El campeón fue <b>${t.teams[t.champion].name}</b>.${prize ? ` Premio: <b>+${prize}</b> monedas.` : ''}</div>`;
      }
    }

    let rival = '';
    if (cup && entry) {
      const ms = T().cupSetup(t, entry);
      const side = (i) => `<div><b>${t.teams[i].name}${t.teams[i].human ? ' 🎮' : ''}</b><div class="tminis">${minis(t.teams[i].members.slice(0, t.size))}</div></div>`;
      rival = `<div class="trival box">${side(ms.e0)}<div class="tvs">VS</div>${side(ms.e1)}</div>`;
    } else if (next && !cup) {
      const s = T().matchSetup(t, next);
      rival = `<div class="trival box">
        <div><b>${h.coop ? (t.coop ? t.coop.names.join(' + ') : 'Equipo') : 'Tu equipo'}</b><div class="tminis">${h.coop ? '<span class="tcoop">el equipo se arma con los Pokémon de cada uno</span>' : minis(t.teams[mine].members.slice(0, t.size))}</div></div>
        <div class="tvs">VS</div>
        <div><b>${s.rival.name}</b><div class="tminis">${minis(s.rival.members.slice(0, t.size))}</div></div>
      </div>`;
    }

    const rulesTxt = PF.Rules.summary(t.rules || PF.Rules.DEFAULTS, true).join(' · ');
    const diffES = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' }[t.diff];
    const title = cup ? ' (cada uno con su equipo)' : h.coop ? ' cooperativo' : '';
    let buttons;
    if (h.coop) {
      if (h.guest) buttons = `<button class="btn" data-act="menu">Salir de la sala</button><span class="wait">${done ? 'Terminó el torneo.' : 'Esperando al anfitrión…'}</span>`;
      else if (done) buttons = '<button class="btn big" data-act="menu">Volver a la sala</button>';
      else buttons = `<button class="btn" data-act="menu">Terminar y volver a la sala</button><button class="btn big" data-act="play">${playLabel(t, next, entry)}</button>`;
    } else if (done) {
      buttons = '<button class="btn" data-act="menu">Menú</button><button class="btn big" data-act="new">Nuevo torneo</button>';
    } else {
      const lbl = next && t.rules.norepeat && T().played(next) === 0 ? 'Elegir equipo' : playLabel(t, next);
      buttons = `<button class="btn danger" data-act="quit">Abandonar torneo</button><button class="btn" data-act="menu">Salir (se guarda)</button><button class="btn big" data-act="play">${lbl}</button>`;
    }
    const s = el(`
      <div class="screen tour">
        <div class="selhead">
          <h2>🏆 Torneo${title}</h2>
          <div class="rsub">${t.size} vs ${t.size} · ${t.time / 60 >= 1 ? t.time / 60 + ' min' : t.time + ' s'} · ${diffES}${rulesTxt ? ' · ' + rulesTxt : ''}</div>
          <span class="coins"><i class="coin"></i>${PF.Save.data.coins}</span>
        </div>
        <div class="bracket box n${t.nTeams || 8}">${Array.from({ length: t.nRounds || 3 }, (_, r) => col(r)).join('')}</div>
        ${banner}
        ${rival}
        <div class="row">${buttons}</div>
      </div>`);
    const on = (a, f) => { const b = s.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
    on('menu', h.onMenu);
    on('new', h.onNew);
    on('play', () => h.onPlay(cup ? entry : next));
    const q = s.querySelector('[data-act=quit]');
    if (q) q.onclick = () => { if (q.dataset.sure) h.onAbandon(); else { q.dataset.sure = '1'; q.textContent = '¿Seguro? Se pierde'; } };
    PF.UI.clear();
    root().appendChild(s);
    s.querySelectorAll('canvas[data-dex]').forEach((cv) => PF.UI.addPortrait(cv, +cv.dataset.dex, +(cv.dataset.sc || 1)));
    const b = s.querySelector('button.big') || s.querySelector('button');
    if (b) b.focus();
  }

  return { bracket };
})();
