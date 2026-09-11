/* soporte-llamada.js — "¿Necesitas ayuda?" del Escritorio (10-sep-2026)

   Punto 7 de la lista: el restaurante agenda una videollamada con el equipo
   de Cobra sin salir de Cobra (sin Calendly). Decidido con Sergio: Google
   Meet, 30 minutos, aviso por correo y lista en su consola. "Escribir ahora"
   (WhatsApp) queda para cuando exista la bandeja de Cobra (punto 4).

   El servidor (`soporte-llamadas`) decide que horas hay libres y valida la
   que se escoge: aqui solo se muestra y se pide. Las horas son de Colombia. */
(function () {
  var FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/soporte-llamadas';
  var ZONA = 'America/Bogota';
  var S = { llamada: null, huecos: null, dia: null, hora: null, motivo: '', tel: '' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var fmtDia  = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
  var fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' });
  var fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
  function hora(iso) { return fmtHora.format(new Date(iso)).replace(/\s/g, ' '); }
  function cuando(iso) { return fmtDia.format(new Date(iso)) + ' a las ' + hora(iso); }
  function etiquetaDia(fecha) {
    var hoy = fmtFecha.format(new Date());
    var man = fmtFecha.format(new Date(Date.now() + 86400000));
    if (fecha === hoy) return 'Hoy';
    if (fecha === man) return 'Mañana';
    var d = new Date(fecha + 'T12:00:00Z');
    var t = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(d);
    t = t.replace(/[.,]/g, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /*  EL CALENDARIO DEL MES (Sergio, 10-sep-2026: "en lugar de pestañas con
      las fechas, que aparezca literalmente el calendario"). Semana de lunes a
      domingo; los dias con horas libres se pueden tocar, el resto va en gris. */
  var fmtMes = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  function sumarMes(ym, n) {
    var d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  }
  function calendario(h, diaSel) {
    var libres = {};
    h.dias.forEach(function (d) { libres[d.fecha] = d.slots.length; });
    var fechas = Object.keys(libres).sort();
    var ym = S.mes || diaSel.slice(0, 7);
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    var primero = new Date(Date.UTC(y, m, 1));
    var diasMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var hueco = (primero.getUTCDay() + 6) % 7;   // lunes primero
    var hoy = fmtFecha.format(new Date());
    var titulo = fmtMes.format(primero).replace(' de ', ' ');
    titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    var FLECHA = 'width:30px;height:30px;border-radius:8px;border:1px solid #ECEEF2;background:#fff;color:#475569;cursor:pointer;font-size:16px;line-height:1;font-family:inherit;';
    var ant = ym <= fechas[0].slice(0, 7), sig = ym >= fechas[fechas.length - 1].slice(0, 7);
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
      + '<button data-mes="-1" aria-label="Mes anterior" style="' + FLECHA + (ant ? 'opacity:.35;cursor:default;' : '') + '"' + (ant ? ' disabled' : '') + '>‹</button>'
      + '<div style="font-size:14px;font-weight:800;color:#0F172A">' + esc(titulo) + '</div>'
      + '<button data-mes="1" aria-label="Mes siguiente" style="' + FLECHA + (sig ? 'opacity:.35;cursor:default;' : '') + '"' + (sig ? ' disabled' : '') + '>›</button></div>'
      + '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center">'
      + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (x) {
          return '<div style="font-size:11px;font-weight:700;color:#94A3B8;padding:4px 0">' + x + '</div>';
        }).join('');
    for (var i = 0; i < hueco; i++) html += '<div></div>';
    for (var d = 1; d <= diasMes; d++) {
      var f = ym + '-' + (d < 10 ? '0' : '') + d;
      var hay = !!libres[f], on = f === diaSel;
      var st = 'height:38px;border-radius:10px;font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums;';
      if (on) st += 'background:#5B6BFF;color:#fff;border:1px solid #5B6BFF;font-weight:800;cursor:pointer;';
      else if (hay) st += 'background:#EEF2FF;color:#4F5BE3;border:1px solid #EEF2FF;font-weight:800;cursor:pointer;';
      else st += 'background:transparent;color:#CBD5E1;border:1px solid transparent;cursor:default;';
      if (f === hoy && !on) st += 'box-shadow:inset 0 0 0 1px #94A3B8;';
      html += hay ? '<button data-dia="' + f + '" style="' + st + '">' + d + '</button>'
                  : '<div style="' + st + 'display:flex;align-items:center;justify-content:center">' + d + '</div>';
    }
    return html + '</div>';
  }

  async function llamar(cuerpo) {
    var tok = '';
    try { tok = (await window._pos.sb.auth.getSession()).data.session.access_token; } catch (e) {}
    try {
      var r = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify(cuerpo)
      });
      if (!r.ok) return { ok: false, error: 'No hay conexión con el servidor. Intenta de nuevo.' };
      return await r.json();
    } catch (e) { return { ok: false, error: 'No hay conexión con el servidor. Intenta de nuevo.' }; }
  }

  function aviso(txt, malo) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9100;'
      + 'background:' + (malo ? '#DC2626' : '#0F172A') + ';color:#fff;border-radius:12px;padding:12px 18px;'
      + 'font-size:13px;font-weight:600;box-shadow:0 12px 30px -8px rgba(15,23,42,.5);max-width:90vw';
    t.textContent = txt;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
  }

  /* ── El bloque del Escritorio ─────────────────────────────────────── */
  function pintar() {
    var t = $('sp-texto'), bt = $('sp-botones');
    if (!t || !bt) return;
    var l = S.llamada;
    if (l) {
      t.innerHTML = 'Tu videollamada es el <b style="color:#0F172A">' + esc(cuando(l.inicio)) + '</b>.';
      bt.innerHTML = '<button class="btn-primary-sm" id="sp-entrar">Entrar a la llamada</button>'
        + '<button class="btn-ghost-sm" id="sp-cancelar">Cancelar</button>';
      $('sp-entrar').onclick = entrar;
      $('sp-cancelar').onclick = confirmarCancelar;
    } else {
      t.textContent = 'Agenda una videollamada con el equipo de Cobra.';
      bt.innerHTML = '<button class="btn-primary-sm" id="sp-agendar">Agendar una llamada</button>'
        + '<button class="btn-ghost-sm" id="sp-tutos">Ver tutoriales</button>';
      $('sp-agendar').onclick = abrir;
      $('sp-tutos').onclick = function () { (window.posIr || function (h) { location.href = h; })('tutoriales.html'); };
    }
  }

  function entrar() {
    var l = S.llamada;
    if (!l || !l.meet_url) { aviso('El enlace de la videollamada te llegó al correo. Si no lo ves, escríbenos.'); return; }
    window.open(l.meet_url, '_blank', 'noopener');
  }

  /* ── La ventana ───────────────────────────────────────────────────── */
  var BTN = 'border:none;border-radius:9px;padding:10px 14px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;';
  var PRI = BTN + 'background:#5B6BFF;color:#fff;box-shadow:0 2px 8px -2px rgba(91,107,255,.45);';
  var GHO = BTN + 'background:#fff;color:#475569;border:1px solid #ECEEF2;';
  var CAMPO = 'width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ECEEF2;border-radius:9px;'
    + 'font-size:13px;font-family:inherit;color:#0F172A;outline:none;';

  function cerrar() { var m = $('sp-modal'); if (m) m.remove(); }
  function ventana(html, ancho) {
    cerrar();
    var ov = document.createElement('div');
    ov.id = 'sp-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.32);backdrop-filter:blur(2px);z-index:9000;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div id="sp-caja" style="background:#fff;border-radius:18px;width:' + (ancho || 520) + 'px;max-width:100%;max-height:92vh;'
      + 'overflow:auto;box-shadow:0 30px 70px -20px rgba(15,23,42,.4)">' + html + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
    document.body.appendChild(ov);
    enlazarX();
  }
  function cabecera(titulo, sub) {
    return '<div style="padding:20px 22px 0;display:flex;gap:12px;align-items:flex-start">'
      + '<div style="flex:1"><div style="font-size:16px;font-weight:800;color:#0F172A;letter-spacing:-.02em">' + esc(titulo) + '</div>'
      + (sub ? '<div style="font-size:12.5px;color:#64748B;margin-top:3px;line-height:1.45">' + sub + '</div>' : '') + '</div>'
      + '<button id="sp-x" aria-label="Cerrar" style="border:none;background:none;font-size:20px;color:#94A3B8;cursor:pointer;line-height:1">×</button></div>';
  }
  function enlazarX() { var x = $('sp-x'); if (x) x.onclick = cerrar; }
  function rotulo(t) { return '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;margin:14px 0 7px">' + t + '</div>'; }
  function sub() { return (S.huecos ? S.huecos.duracion : 30) + ' minutos por Google Meet con el equipo de Cobra. Las horas son de Colombia.'; }

  async function abrir() {
    S.dia = null; S.hora = null; S.mes = null;
    ventana(cabecera('Agenda una videollamada', sub())
      + '<div style="padding:18px 22px 24px;font-size:13px;color:#94A3B8">Buscando las horas libres…</div>', 780);
    var r = await llamar({ accion: 'huecos' });
    if (!$('sp-modal')) return;
    if (!r.ok) {
      $('sp-caja').innerHTML = cabecera('Agenda una videollamada', '')
        + '<div style="padding:16px 22px 24px;font-size:13px;color:#DC2626">' + esc(r.error || 'No se pudieron traer las horas.') + '</div>';
      enlazarX();
      return;
    }
    S.huecos = r;
    S.dia = r.dias.length ? r.dias[0].fecha : null;
    pintarVentana();
  }

  function leerCampos() {
    var m = $('sp-motivo'), t = $('sp-tel');
    if (m) S.motivo = m.value;
    if (t) S.tel = t.value;
  }

  function pintarVentana() {
    var h = S.huecos, caja = $('sp-caja');
    if (!caja) return;
    if (!h.dias.length) {
      caja.innerHTML = cabecera('Agenda una videollamada', sub())
        + '<div style="padding:16px 22px 24px;font-size:13px;color:#475569;line-height:1.5">No hay horas libres en los próximos días. Intenta de nuevo más tarde.</div>';
      enlazarX();
      return;
    }
    var dia = h.dias.filter(function (d) { return d.fecha === S.dia; })[0] || h.dias[0];
    var cal = calendario(h, dia.fecha);
    var diaLargo = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
      .format(new Date(dia.fecha + 'T12:00:00Z'));
    diaLargo = diaLargo.charAt(0).toUpperCase() + diaLargo.slice(1);
    var horas = dia.slots.map(function (iso) {
      var on = iso === S.hora;
      return '<button data-hora="' + iso + '" style="padding:8px 0;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;font-variant-numeric:tabular-nums;'
        + (on ? 'background:#5B6BFF;border:1px solid #5B6BFF;color:#fff' : 'background:#fff;border:1px solid #ECEEF2;color:#0F172A') + '">'
        + esc(hora(iso)) + '</button>';
    }).join('');
    caja.innerHTML = cabecera('Agenda una videollamada', sub())
      + '<div style="padding:4px 22px 22px">'
      + '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:14px">'
      +   '<div style="flex:1 1 300px;min-width:0">' + cal + '</div>'
      +   '<div style="flex:1 1 240px;min-width:0">'
      +     '<div style="font-size:13px;font-weight:800;color:#0F172A;margin:4px 0 10px">' + esc(diaLargo) + '</div>'
      +     '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;max-height:272px;overflow:auto;padding-right:2px">' + horas + '</div>'
      +   '</div>'
      + '</div>'
      + rotulo('¿En qué te podemos ayudar?')
      + '<textarea id="sp-motivo" rows="3" placeholder="No me imprime la comanda de la cocina" style="' + CAMPO + 'resize:vertical">' + esc(S.motivo) + '</textarea>'
      + rotulo('Tu celular, por si se cae la llamada')
      + '<input id="sp-tel" inputmode="tel" placeholder="300 000 0000" value="' + esc(S.tel) + '" style="' + CAMPO + '">'
      + '<div id="sp-err" style="display:none;color:#DC2626;font-size:12.5px;margin-top:10px"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">'
      + '<button id="sp-no" style="' + GHO + '">Cancelar</button>'
      + '<button id="sp-ok" style="' + PRI + (S.hora ? '' : 'opacity:.5;cursor:default;') + '">'
      + (S.hora ? 'Agendar ' + esc(/^(Hoy|Mañana)$/.test(etiquetaDia(dia.fecha))
            ? etiquetaDia(dia.fecha).toLowerCase()
            : new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric' }).format(new Date(dia.fecha + 'T12:00:00Z')).replace(',', ''))
          + ', ' + esc(hora(S.hora)) : 'Escoge una hora') + '</button>'
      + '</div></div>';
    enlazarX();
    caja.querySelectorAll('[data-dia]').forEach(function (b) {
      b.onclick = function () { leerCampos(); S.dia = b.dataset.dia; S.hora = null; pintarVentana(); };
    });
    caja.querySelectorAll('[data-hora]').forEach(function (b) {
      b.onclick = function () { leerCampos(); S.hora = b.dataset.hora; pintarVentana(); };
    });
    caja.querySelectorAll('[data-mes]').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        leerCampos();
        S.mes = sumarMes(S.mes || dia.fecha.slice(0, 7), +b.dataset.mes);
        pintarVentana();
      };
    });
    $('sp-no').onclick = cerrar;
    $('sp-ok').onclick = function () { if (S.hora) agendar(); };
  }

  async function agendar() {
    leerCampos();
    var btn = $('sp-ok'), err = $('sp-err');
    btn.disabled = true; btn.textContent = 'Agendando…';
    var r = await llamar({
      accion: 'agendar', inicio: S.hora, motivo: S.motivo, telefono: S.tel,
      branch_id: (window._pos && window._pos.state && window._pos.state.branchId) || null
    });
    if (!$('sp-modal')) return;
    if (!r.ok) {
      err.textContent = r.error || 'No se pudo agendar.'; err.style.display = 'block';
      //  Si alguien mas tomo esa hora, se traen de nuevo las libres.
      if (/disponible|tomar/i.test(r.error || '')) {
        var n = await llamar({ accion: 'huecos' });
        if (n.ok) { S.huecos = n; S.hora = null; pintarVentana(); var e2 = $('sp-err'); if (e2) { e2.textContent = r.error; e2.style.display = 'block'; } }
        return;
      }
      btn.disabled = false; btn.textContent = 'Agendar';
      return;
    }
    S.llamada = r.llamada;
    S.motivo = ''; S.tel = '';
    cerrar();
    pintar();
    aviso('Listo: tu videollamada es el ' + cuando(r.llamada.inicio) + '. Te llegó la confirmación al correo.');
  }

  function confirmarCancelar() {
    var l = S.llamada; if (!l) return;
    ventana(cabecera('¿Cancelar la videollamada?', 'La del ' + esc(cuando(l.inicio)) + '. Puedes agendar otra cuando quieras.')
      + '<div style="display:flex;gap:8px;justify-content:flex-end;padding:18px 22px 22px">'
      + '<button id="sp-no" style="' + GHO + '">No, dejarla</button>'
      + '<button id="sp-si" style="' + BTN + 'background:#DC2626;color:#fff">Sí, cancelar</button></div>');
    $('sp-no').onclick = cerrar;
    $('sp-si').onclick = async function () {
      var b = $('sp-si'); b.disabled = true; b.textContent = 'Cancelando…';
      var r = await llamar({ accion: 'cancelar', id: l.id });
      cerrar();
      if (!r.ok) { aviso(r.error || 'No se pudo cancelar.', true); return; }
      S.llamada = null;
      pintar();
      aviso('Videollamada cancelada.');
    };
  }

  /* ── Arranque ─────────────────────────────────────────────────────── */
  var intentos = 0;
  async function arrancar() {
    pintar();   // los botones sirven desde ya
    var st = window._pos && window._pos.state;
    if (!window._pos || !window._pos.sb || !st || !st.user) {
      if (intentos++ < 40) setTimeout(arrancar, 700);
      return;
    }
    var r = await llamar({ accion: 'mia' });
    if (r.ok) { S.llamada = r.llamada; pintar(); }
  }
  if (document.readyState !== 'loading') arrancar();
  else document.addEventListener('DOMContentLoaded', arrancar);
})();
