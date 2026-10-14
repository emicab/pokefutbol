/* ============ tips.js — consejos al final del partido ============
 * Durante el partido match.js anota lo que hace cada humano (m.log[idx]):
 * sus tiros con la probabilidad de gol que tenían (el mismo modelo que usa
 * la IA, ai.js), sus pases (y si se los cortaron), las pelotas que perdió y
 * dónde, sus placajes, cuánto jugó agotado o presionando, qué orden tuvo su
 * equipo... Al final, of() elige los 3 consejos que más le sirven, con los
 * números de ese partido. Online sólo los ve el que corre el partido (el
 * anfitrión): el registro no viaja.
 */
PF.Tips = (() => {
  const blank = () => ({
    shots: [], pass: 0, passRisky: 0, passOk: 0, passCut: 0, received: 0, oneTouch: 0,
    tackleTry: 0, tackleHit: 0, lostHit: 0, lostSteal: 0, lostOwn: 0, feint: 0, feintOk: 0,
    playT: 0, tiredT: 0, pressT: 0, orderT: {},
  });
  const logOf = (m, idx) => { m.log = m.log || []; return m.log[idx] || (m.log[idx] = blank()); };

  /** Anota algo que hizo el Pokémon p (si lo maneja un humano). */
  function note(m, p, key, v) {
    if (m.demo || !p.human || !p.ctrl) return;
    const L = logOf(m, p.ctrl.idx);
    if (key === 'shot') L.shots.push(v);
    else if (key === 'pass') { L.pass++; if (v < 0.5) L.passRisky++; }
    else if (key === 'lostHit' || key === 'lostSteal') { L[key]++; if (v) L.lostOwn++; }
    else L[key] = (L[key] || 0) + 1;
  }

  /** El pase del humano idx terminó: ¿lo agarró su equipo o se lo cortaron? */
  function passEnd(m, idx, taker) {
    const h = m.humans[idx];
    if (!h || m.demo) return;
    const L = logOf(m, idx);
    if (taker.team === h.team) L.passOk++; else L.passCut++;
  }

  /** Cada paso con la pelota en juego: tiempo jugado, agotado, presionando y con cada orden. */
  function tick(m, dt) {
    if (m.demo) return;
    for (const h of m.humans) {
      const p = h.controlled;
      if (!p || h.gone) continue;
      const L = logOf(m, h.idx);
      L.playT += dt;
      if (PF.Match.energyPct(p) < 15) L.tiredT += dt;
      if (p.pressT > 0) L.pressT += dt;
      const o = PF.Match.ORDERS[m.orders[h.team]].id;
      L.orderT[o] = (L.orderT[o] || 0) + dt;
    }
  }

  /** Los consejos (hasta 3) para el humano idx, del más útil al menos. */
  function of(m, idx = m.view) {
    const L = m.log && m.log[idx];
    const h = m.humans[idx];
    if (!L || !h || L.playT < 20) return [];
    const K = PF.Input.label, team = h.team;
    const gf = m.score[team], ga = m.score[1 - team];
    const out = [];
    const add = (score, text) => out.push({ score, text });
    const n = L.shots.length;
    const low = L.shots.filter((o) => o < 0.05).length;
    const good = L.shots.filter((o) => o >= 0.25).length;
    const pct = (x) => Math.round(x * 100);

    // tiros
    if (n >= 3 && low >= 3 && low / n >= 0.5) {
      add(3 + low * 0.3, `De tus ${n} tiros, ${low} tenían menos de 5 % de chance de gol. Acercate o buscá a un compañero mejor ubicado: de frente al arco y apuntando al palo lejos del arquero entra mucho más.`);
    } else if (n <= 1 && L.playT > 60) {
      add(1.6, `Tiraste ${n ? 'una sola vez' : 'ninguna vez'}. Si tenés la línea al arco libre, animate: un toque de ${K('shoot')} ya sale fuerte, y ${K('up')}/${K('down')} al soltar eligen el palo.`);
    } else if (n >= 3 && good / n >= 0.5) {
      add(0.5, `Elegiste bien cuándo tirar: ${good} de tus ${n} tiros tenían más de 25 % de chance de gol.`);
    }
    // pases
    if (L.passCut >= 3 && L.passCut / Math.max(1, L.pass) >= 0.25) {
      add(2.5 + L.passCut * 0.2, `Te cortaron ${L.passCut} de ${L.pass} pases${L.passRisky >= 2 ? ` (${L.passRisky} salieron con un rival cerca de la línea)` : ''}. Esperá a que se abra la línea, movete para cambiar el ángulo o pasala al espacio por delante del compañero.`);
    }
    // pérdidas
    const lost = L.lostHit + L.lostSteal;
    if (L.lostOwn >= 2) {
      add(3 + L.lostOwn * 0.4, `Perdiste ${L.lostOwn} pelotas cerca de tu arco. Ahí no gambetees: pase seguro a un compañero libre o despejá lejos.`);
    }
    if (lost >= 4 && L.feint === 0 && L.feintOk === 0) {
      add(2.2 + lost * 0.1, `Te quitaron la pelota ${lost} veces. Con la pelota, ${K('press')} hace un amago: un quiebre rápido que deja pasado al que viene a placarte.`);
    }
    // placajes
    if (L.tackleTry >= 5 && L.tackleHit / L.tackleTry < 0.35) {
      add(2 + (L.tackleTry - L.tackleHit) * 0.1, `De ${L.tackleTry} placajes acertaste ${L.tackleHit}. Placá cuando el rival está a un paso; de lejos se te escapa y quedás pasado. Pararte delante de la pelota también la roba.`);
    }
    // energía
    if (L.tiredT >= 12) {
      add(2 + L.tiredT / 20, `Jugaste ${Math.round(L.tiredT)} s casi sin energía: corrés y pateás más lento y no podés placar. Cambiá de Pokémon con ${K('swap')} para que descanse, o usá el cambio rápido (${K('quick')}).`);
    }
    if (L.playT > 40 && L.pressT / L.playT > 0.25) {
      add(1.5, `Presionaste el ${pct(L.pressT / L.playT)} % del tiempo, y eso cansa más que correr. Usalo para cerrarle el paso al que lleva la pelota, no para recorrer la cancha.`);
    }
    // de primera
    if (L.oneTouch === 0 && L.received >= 6) {
      add(1.2, `Probá jugar de primera: apretá ${K('pass')} o ${K('shoot')} justo antes de que te llegue la pelota y sale apenas la tocás, hacia donde apuntás.`);
    }
    // órdenes al equipo
    const total = Object.values(L.orderT).reduce((a, b) => a + b, 0) || 1;
    const share = (id) => (L.orderT[id] || 0) / total;
    const name = (id) => PF.Match.ORDERS.find((o) => o.id === id).label.toLowerCase();
    if (ga >= 3 && share('atk') + share('press') > 0.6) {
      add(2, `Recibiste ${ga} goles con el equipo casi todo el partido en ${share('atk') >= share('press') ? name('atk') : name('press')}. Si te llegan mucho, probá ${name('def')} (${K('order')}): cuida el arco sin dejar de ir a la pelota.`);
    } else if (ga > gf && gf === 0 && share('def') + share('neutral') > 0.7 && L.playT > 60) {
      add(1.8, `No pudiste hacer goles y tu equipo jugó en ${share('def') > share('neutral') ? name('def') : name('neutral')}. Con ${name('atk')} o ${name('press')} (${K('order')}) tus compañeros suben más y se arriesgan.`);
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.text);
  }

  /** Bloque HTML para la pantalla de resultado (vacío si no hay consejos). */
  function html(m) {
    const t = of(m);
    if (!t.length) return '';
    return `<div class="tips"><div class="tips-h">Consejos</div>${t.map((x) => `<div class="tip">💡 ${x}</div>`).join('')}</div>`;
  }

  return { note, passEnd, tick, of, html };
})();
