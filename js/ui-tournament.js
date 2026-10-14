/* ============ ui-tournament.js — pantalla del cuadro del torneo ============ */
PF.TournamentUI = (() => {
  const T = () => PF.Tournament;
  const root = () => document.getElementById('ui');
  const SIZES = [4, 2, 1];   // partidos por ronda

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

  /** h = { onPlay(match), onMenu(), onAbandon(), onNew() } */
  function bracket(t, h) {
    const mine = T().humanIdx(t), next = T().myMatch(t), stand = T().standing(t);
    const done = t.champion != null;
    const col = (r) => {
      const ms = t.rounds[r] || null;
      const cards = Array.from({ length: SIZES[r] }, (_, k) => {
        const m = ms && ms[k];
        if (!m) return '<div class="bm ghost"><div class="bt"><span>Por definir</span></div><div class="bt"><span>Por definir</span></div></div>';
        const row = (i, sc0) => { const sc = m.w == null && m.l1 ? m.l1[i === m.a ? 0 : 1] : sc0; return `<div class="bt ${i === mine ? 'me' : ''} ${m.w == null ? '' : m.w === i ? 'win' : 'lose'}" style="--tc:${teamColor(t, i)}">
          <span>${t.teams[i].name}</span><b>${sc == null ? '' : sc}${m.pen && m.w === i ? ' <small>pen.</small>' : ''}</b></div>`; };
        const tag = m.legs === 2 ? `<div class="bl">${m.l1 ? `ida ${m.l1[0]}–${m.l1[1]}${m.w == null ? ' · falta la vuelta' : ' · global'}` : 'ida y vuelta'}</div>` : '';
        return `<div class="bm ${m === next ? 'cur' : ''}">${row(m.a, m.sa)}${row(m.b, m.sb)}${tag}</div>`;
      }).join('');
      return `<div class="bcol ${r === t.round && !done ? 'now' : ''}"><h3>${T().ROUNDS[r]}</h3><div class="bcards">${cards}</div></div>`;
    };
    let banner = '';
    if (done) {
      banner = stand === 'Campeón'
        ? `<div class="tbanner win">🏆 ¡Eres el campeón del torneo! <b>+${t.prize}</b> monedas</div>`
        : `<div class="tbanner">Quedaste eliminado en ${String(stand).toLowerCase()}. El campeón fue <b>${t.teams[t.champion].name}</b>.${t.prize ? ` Premio: <b>+${t.prize}</b> monedas.` : ''}</div>`;
    }
    let rival = '';
    if (next) {
      const s = T().matchSetup(t, next);
      rival = `<div class="trival box">
        <div><b>Tu equipo</b><div class="tminis">${minis(t.teams[mine].members.slice(0, t.size))}</div></div>
        <div class="tvs">VS</div>
        <div><b>${s.rival.name}</b><div class="tminis">${minis(s.rival.members.slice(0, t.size))}</div></div>
      </div>`;
    }
    const rulesTxt = PF.Rules.summary(t.rules || PF.Rules.DEFAULTS, true).join(' · ');
    const diffES = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' }[t.diff];
    const s = el(`
      <div class="screen tour">
        <div class="selhead">
          <h2>🏆 Torneo</h2>
          <div class="rsub">${t.size} vs ${t.size} · ${t.time / 60 >= 1 ? t.time / 60 + ' min' : t.time + ' s'} · ${diffES}${rulesTxt ? ' · ' + rulesTxt : ''}</div>
          <span class="coins"><i class="coin"></i>${PF.Save.data.coins}</span>
        </div>
        <div class="bracket box">${[0, 1, 2].map(col).join('')}</div>
        ${banner}
        ${rival}
        <div class="row">
          ${done
            ? '<button class="btn" data-act="menu">Menú</button><button class="btn big" data-act="new">Nuevo torneo</button>'
            : `<button class="btn danger" data-act="quit">Abandonar torneo</button><button class="btn" data-act="menu">Salir (se guarda)</button><button class="btn big" data-act="play">${next && t.rules.norepeat && !next.l1 ? 'Elegir equipo' : next && next.l1 ? '¡Jugar la vuelta!' : `¡Jugar ${T().ROUNDS[t.round].toLowerCase()}!`}</button>`}
        </div>
      </div>`);
    const on = (a, f) => { const b = s.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
    on('menu', h.onMenu);
    on('new', h.onNew);
    on('play', () => h.onPlay(next));
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
