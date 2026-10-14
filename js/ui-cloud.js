/* ============ ui-cloud.js — pantalla «Partida en la nube» (y exportar / importar archivo) ============ */
PF.CloudUI = (() => {
  const root = () => document.getElementById('ui');
  const C = () => PF.Cloud;

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const STATUS_TXT = {
    ok: 'Sincronizada ✔', syncing: 'Sincronizando…', offline: 'Sin conexión con la nube', conflict: 'La nube cambió desde otro dispositivo',
    paused: 'En pausa (borraste el progreso)', error: 'Hubo un error', off: '',
  };

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* sin permiso: se prueba el otro modo */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  /** Descarga la partida como archivo. */
  function exportFile() {
    const blob = new Blob([JSON.stringify({ game: 'pokefutbol', exported: new Date().toISOString(), data: PF.Save.snapshot() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pokefutbol-partida-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /** Aviso corto y recarga (para ver la partida nueva en todos los menús). */
  function reloadSoon(msg) {
    PF.UI.toast(msg);
    setTimeout(() => location.reload(), 900);
  }

  /** onBack() al volver. */
  function screen(onBack) {
    let mode = 'main';        // main | code | choose
    let found = null;         // { code, res } de «Ya tengo un código»
    let fresh = '';           // código recién creado (se muestra una vez bien visible)
    let showCode = false;
    let busy = false;
    const unsub = C().onChange(() => { if (s.isConnected && mode === 'main') draw(); });

    const s = el('<div class="screen cloudscr"></div>');
    const note = (t) => PF.UI.toast(t);

    function draw() {
      const i = C().info();
      const local = PF.Save.hasProgress();
      let body = '';
      if (mode === 'code') {
        body = `
          <h3>Conectar con un código</h3>
          <p>Escribe el código de la partida que quieres traer a este dispositivo.</p>
          <input class="codein" maxlength="30" placeholder="PF-ABCD-EFGH-JKLM-NPQR" spellcheck="false" autocomplete="off">
          <div class="row"><button class="btn" data-act="cancel">Volver</button><button class="btn big" data-act="lookup" ${busy ? 'disabled' : ''}>Buscar</button></div>`;
      } else if (mode === 'choose') {
        const d = new Date(found.res.updated_at);
        const cloudInfo = (found.res.data && found.res.data.stats) ? `${found.res.data.stats.played || 0} partidos jugados, ${found.res.data.coins | 0} monedas` : 'partida guardada';
        body = `
          <h3>Encontré esa partida</h3>
          <p>En la nube: <b>${esc(cloudInfo)}</b> · última vez ${esc(d.toLocaleString())}${found.res.device ? ' desde ' + esc(found.res.device) : ''}.<br>
          En este dispositivo: <b>${PF.Save.data.stats.played} partidos jugados, ${PF.Save.data.coins} monedas</b>.</p>
          <p class="warn">Elige cuál conservar. La otra se pierde.</p>
          <div class="row">
            <button class="btn big" data-act="usecloud" ${busy ? 'disabled' : ''}>Usar la de la nube</button>
            <button class="btn danger" data-act="uselocal" ${busy ? 'disabled' : ''}>Usar la de este dispositivo</button>
          </div>
          <div class="row"><button class="btn" data-act="cancel">Volver</button></div>`;
      } else if (!i.connected) {
        body = `
          <p>Guarda tu progreso (monedas, Pokémon, club, torneos…) en la nube y recupéralo en cualquier otro dispositivo.
          No hace falta cuenta ni mail: se crea un <b>código secreto</b> que funciona como llave.</p>
          <div class="row">
            <button class="btn big" data-act="enable" ${busy ? 'disabled' : ''}>☁ Activar la nube</button>
            <button class="btn" data-act="havecode">🔑 Ya tengo un código</button>
          </div>`;
      } else {
        const code = showCode || fresh ? i.code : i.code.replace(/[A-Z0-9]/g, (c, k) => (k > 6 && k < 18 ? '•' : c));
        body = `
          ${fresh ? '<p class="warn">¡Listo! Anota este código en un lugar seguro: es la <b>única forma</b> de recuperar tu partida en otro dispositivo, y quien lo tenga puede leerla y reemplazarla.</p>' : ''}
          <div class="codebox"><code>${esc(code)}</code><button class="btn small" data-act="show">${showCode || fresh ? 'Ocultar' : 'Mostrar'}</button><button class="btn small" data-act="copy">Copiar</button></div>
          <p class="stline st-${i.status}">${esc(STATUS_TXT[i.status] || '')}${i.detail ? ' — ' + esc(i.detail) : ''}${i.dirty && i.status !== 'conflict' && i.status !== 'paused' ? ' · cambios pendientes de subir' : ''}</p>
          ${i.status === 'conflict' ? `
            <p class="warn">${i.dirty ? 'Jugaste en otro dispositivo y también hay cambios acá.' : 'La nube tiene una partida más nueva (jugaste en otro dispositivo).'} Elige cuál conservar (la otra se pierde).</p>
            <div class="row"><button class="btn big" data-act="rescloud" ${busy ? 'disabled' : ''}>Usar la de la nube</button><button class="btn danger" data-act="reslocal" ${busy ? 'disabled' : ''}>Usar la de este dispositivo</button></div>` : ''}
          ${i.status === 'paused' ? `
            <p class="warn">Borraste el progreso de este dispositivo, así que no se sube nada por ahora. ¿Qué hacemos con la nube?</p>
            <div class="row"><button class="btn big" data-act="rescloud" ${busy ? 'disabled' : ''}>Restaurar mi partida de la nube</button><button class="btn danger" data-act="reslocal" ${busy ? 'disabled' : ''}>Empezar de cero y reemplazar la nube</button></div>` : ''}
          <div class="row">
            <button class="btn" data-act="sync" ${busy ? 'disabled' : ''}>Sincronizar ahora</button>
            <button class="btn danger" data-act="off">Desconectar este dispositivo</button>
          </div>
          <p class="tiny">Desconectar no borra nada: tu partida sigue acá y en la nube, y puedes volver a conectar con el código.</p>`;
      }
      s.innerHTML = `
        <div class="box menu cloudbox">
          <h2>☁ Partida en la nube</h2>
          ${body}
          <h3>Copia en un archivo</h3>
          <p class="tiny">Sirve como respaldo o para pasar la partida sin la nube.</p>
          <div class="row">
            <button class="btn small" data-act="export">Exportar a archivo</button>
            <button class="btn small" data-act="import">Importar de archivo</button>
            <input type="file" accept=".json,application/json" hidden>
          </div>
          ${mode === 'main' ? '<div class="row"><button class="btn" data-act="back">Volver</button></div>' : ''}
        </div>`;
      wire();
      const first = s.querySelector('.codein') || s.querySelector('button.big') || s.querySelector('button');
      if (first && !s.contains(document.activeElement)) first.focus();
    }

    function wire() {
      const on = (a, f) => { const b = s.querySelector(`[data-act=${a}]`); if (b) b.onclick = f; };
      const run = async (f) => { if (busy) return; busy = true; draw(); try { await f(); } catch (e) { note(e.message || 'No se pudo.'); PF.Audio.sfx.fail(); } busy = false; if (s.isConnected) draw(); };
      on('back', () => { unsub(); onBack(); });
      on('cancel', () => { mode = 'main'; found = null; draw(); });
      on('havecode', () => { mode = 'code'; draw(); });
      on('show', () => { showCode = !showCode; fresh = ''; draw(); });
      on('copy', async () => { note((await copy(C().info().code)) ? 'Código copiado.' : 'No pude copiarlo: selecciónalo y cópialo a mano.'); });
      on('enable', () => run(async () => { await C().enable(); fresh = 'x'; PF.Audio.sfx.coin(); }));
      on('sync', () => run(async () => {
        const r = await C().check(true, true);
        if (r === 'updated') return reloadSoon('Se cargó la partida más nueva de la nube.');
        if (r === 'ok') await C().push();
        note(C().info().status === 'ok' ? 'Todo al día.' : (C().info().detail || 'No se pudo sincronizar.'));
      }));
      on('off', () => { C().disconnect(); fresh = ''; showCode = false; note('Este dispositivo ya no está conectado.'); draw(); });
      on('rescloud', () => run(async () => { if (await C().resolve('cloud')) reloadSoon('Partida restaurada desde la nube.'); }));
      on('reslocal', () => run(async () => { if (await C().resolve('local')) note('La nube ahora tiene la partida de este dispositivo.'); }));
      on('lookup', () => { const v = s.querySelector('.codein').value; run(async () => {
        found = await C().lookup(v);
        if (!PF.Save.hasProgress()) { await C().adopt(found, 'cloud'); return reloadSoon('¡Partida cargada!'); }   // este dispositivo está vacío: no hay nada que pisar
        mode = 'choose';
      }); });
      on('usecloud', () => run(async () => { await C().adopt(found, 'cloud'); reloadSoon('¡Partida cargada desde la nube!'); }));
      on('uselocal', () => run(async () => { if (await C().adopt(found, 'local')) { mode = 'main'; found = null; note('La nube ahora tiene la partida de este dispositivo.'); } else throw new Error(C().info().detail || 'No se pudo subir.'); }));
      on('export', () => { exportFile(); note('Archivo descargado.'); });
      const file = s.querySelector('input[type=file]');
      const imp = s.querySelector('[data-act=import]');
      if (imp) {
        imp.onclick = () => {
          if (PF.Save.hasProgress() && !imp.dataset.sure) { imp.dataset.sure = '1'; imp.textContent = '¿Reemplazar lo de acá? Pulsa otra vez'; return; }
          file.click();
        };
        file.onchange = async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          try {
            const obj = JSON.parse(await f.text());
            const r = PF.Save.replaceWith(obj && obj.game === 'pokefutbol' ? obj.data : obj);
            if (!r.ok) throw new Error(r.error);
            reloadSoon('Partida importada.');
          } catch (e) { note(e instanceof SyntaxError ? 'Ese archivo no es una partida válida.' : e.message); PF.Audio.sfx.fail(); }
        };
      }
    }

    PF.UI.clear();
    root().appendChild(s);
    draw();
  }

  return { screen };
})();
