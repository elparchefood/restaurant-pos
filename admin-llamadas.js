/* admin-llamadas.js — Videollamadas de soporte, en la consola (10-sep-2026)

   La otra mitad del punto 7: aqui Sergio ve quien agendo, entra a su sala de
   Meet, marca la llamada como hecha o la cancela (al restaurante le llega un
   correo), y configura su sala, su horario y los dias que no atiende.
   Todo pasa por la Edge Function `soporte-llamadas`, que revisa que quien
   pide sea de la plataforma. */
(function () {
  var FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/soporte-llamadas';
  var ZONA = 'America/Bogota';
  var DIAS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
  var CFG = null;

  if (typeof PAGE_META !== 'undefined') PAGE_META.llamadas = { kicker: 'Plataforma', crumb: 'Videollamadas de soporte' };
  var _setView = window.setView;
  window.setView = function (id) { _setView(id); if (id === 'llamadas') cargar(); };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var fmt = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  function cuando(iso) { var t = fmt.format(new Date(iso)); return t.charAt(0).toUpperCase() + t.slice(1); }
  function toast(m, tono) { if (typeof showToast === 'function') showToast(m, tono); }

  async function llamar(c) {
    var tok = '';
    try { tok = (await sb.auth.getSession()).data.session.access_token; } catch (e) {}
    try {
      var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(c) });
      return r.ok ? await r.json() : { ok: false, error: 'Sin conexión con el servidor.' };
    } catch (e) { return { ok: false, error: 'Sin conexión con el servidor.' }; }
  }

  var CARD = 'background:#fff;border:1px solid #ECEEF2;border-radius:14px;padding:16px 18px;';
  var BTN = 'border-radius:9px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;';
  var PRI = BTN + 'background:#5B6BFF;color:#fff;border:none;';
  var GHO = BTN + 'background:#fff;color:#475569;border:1px solid #ECEEF2;';
  var CAMPO = 'box-sizing:border-box;padding:8px 10px;border:1px solid #ECEEF2;border-radius:9px;font-size:13px;font-family:inherit;color:#0F172A;';

  async function cargar() {
    var box = $('ll-lista');
    if (!box) return;
    box.innerHTML = '<div style="font-size:13px;color:#94A3B8">Cargando…</div>';
    var res = await Promise.all([llamar({ accion: 'lista' }), llamar({ accion: 'config' })]);
    var r = res[0], c = res[1];
    if (!r.ok) { box.innerHTML = '<div style="font-size:13px;color:#DC2626">' + esc(r.error) + '</div>'; return; }
    CFG = (c && c.config) || {};
    pintarLista(r);
    pintarConfig();
    marcarBadge(r.proximas.length);
  }

  function marcarBadge(n) {
    var b = $('llamadas-badge');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  }

  function pintarLista(r) {
    var box = $('ll-lista');
    var prox = r.proximas || [], pas = r.pasadas || [];
    var h = '<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;margin:0 0 10px">Próximas · ' + prox.length + '</div>';
    if (!prox.length) {
      h += '<div style="' + CARD + 'font-size:13px;color:#64748B">Nadie ha agendado todavía. Las nuevas te llegan también al correo.</div>';
    } else {
      h += prox.map(function (l) {
        return '<div style="' + CARD + 'margin-bottom:10px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">'
          + '<div style="flex:1;min-width:240px">'
          + '<div style="font-size:14.5px;font-weight:800;color:#0F172A">' + esc(cuando(l.inicio)) + '</div>'
          + '<div style="font-size:13px;color:#5B6BFF;font-weight:700;margin-top:2px">' + esc(l.restaurante || '') + '</div>'
          + (l.motivo ? '<div style="font-size:13px;color:#334155;margin-top:8px;line-height:1.5">«' + esc(l.motivo) + '»</div>' : '')
          + '<div style="font-size:12px;color:#64748B;margin-top:8px">' + [l.contacto, l.correo, l.telefono].filter(Boolean).map(esc).join(' · ') + '</div>'
          + '</div>'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
          + (r.meet_url ? '<button data-meet style="' + PRI + '">Entrar a Meet</button>' : '')
          + '<button data-hecha="' + l.id + '" style="' + GHO + '">Hecha</button>'
          + '<button data-cancelar="' + l.id + '" style="' + GHO + 'color:#DC2626">Cancelar</button>'
          + '</div></div>';
      }).join('');
    }
    if (pas.length) {
      h += '<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8;margin:22px 0 10px">Anteriores</div>'
        + '<div style="' + CARD + 'padding:6px 18px">' + pas.map(function (l) {
          var est = l.estado === 'hecha' ? ['Hecha', '#16A34A', '#DCFCE7']
                  : l.estado === 'cancelada' ? ['Cancelada' + (l.cancelada_por === 'cobra' ? ' por Cobra' : ''), '#64748B', '#F1F5F9']
                  : ['Sin marcar', '#F59E0B', '#FFFBEB'];
          return '<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:12.5px">'
            + '<span style="flex:1;color:#334155"><b style="color:#0F172A">' + esc(l.restaurante || '') + '</b> · ' + esc(cuando(l.inicio)) + '</span>'
            + '<span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;color:' + est[1] + ';background:' + est[2] + '">' + est[0] + '</span></div>';
        }).join('') + '</div>';
    }
    box.innerHTML = h;
    box.querySelectorAll('[data-meet]').forEach(function (b) { b.onclick = function () { window.open(r.meet_url, '_blank', 'noopener'); }; });
    box.querySelectorAll('[data-hecha]').forEach(function (b) {
      b.onclick = async function () {
        b.disabled = true;
        var x = await llamar({ accion: 'marcar', id: b.dataset.hecha, estado: 'hecha' });
        if (!x.ok) { toast(x.error || 'No se pudo marcar.', 'red'); b.disabled = false; return; }
        toast('Marcada como hecha'); cargar();
      };
    });
    box.querySelectorAll('[data-cancelar]').forEach(function (b) {
      b.onclick = function () {
        var fn = async function () {
          var x = await llamar({ accion: 'cancelar', id: b.dataset.cancelar });
          if (!x.ok) { toast(x.error || 'No se pudo cancelar.', 'red'); return; }
          toast('Cancelada. Al restaurante le llegó un correo.'); cargar();
        };
        if (typeof showConfirm === 'function') showConfirm('Cancelar la videollamada', 'Al restaurante le llega un correo avisándole que escoja otra hora.', fn);
        else fn();
      };
    });
  }

  function pintarConfig() {
    var box = $('ll-config');
    if (!box || !CFG) return;
    var hor = CFG.horario || {};
    var filas = DIAS.map(function (d) {
      var r = (hor[d[0]] || [])[0];
      return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px">'
        + '<label style="width:118px;display:flex;align-items:center;gap:7px;color:#0F172A;font-weight:600">'
        + '<input type="checkbox" data-atiende="' + d[0] + '"' + (r ? ' checked' : '') + '> ' + d[1] + '</label>'
        + '<input type="time" data-desde="' + d[0] + '" value="' + esc(r ? r[0] : '09:00') + '" style="' + CAMPO + 'width:136px">'
        + '<span style="color:#94A3B8">a</span>'
        + '<input type="time" data-hasta="' + d[0] + '" value="' + esc(r ? r[1] : '18:00') + '" style="' + CAMPO + 'width:118px"></div>';
    }).join('');
    var bloq = (CFG.bloqueos || []).map(function (f) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#F1F5F9;font-size:12px;color:#334155;margin:0 6px 6px 0">'
        + esc(f) + '<button data-quitar="' + esc(f) + '" style="border:none;background:none;cursor:pointer;color:#94A3B8;font-size:14px;line-height:1">×</button></span>';
    }).join('');
    function sel(id, val, ops) {
      return '<select id="' + id + '" style="' + CAMPO + '">' + ops.map(function (o) {
        return '<option value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>';
    }
    function rot(t, h) { return '<div style="font-size:12.5px;font-weight:700;color:#0F172A;margin:14px 0 6px">' + t + (h ? '<span style="font-weight:500;color:#94A3B8"> · ' + h + '</span>' : '') + '</div>'; }
    box.innerHTML = '<div style="' + CARD + '">'
      + '<div style="font-size:15px;font-weight:800;color:#0F172A">Tu agenda</div>'
      + rot('Tu sala de Google Meet', 'la misma para todas las citas')
      + '<input id="ll-meet" placeholder="https://meet.google.com/abc-defg-hij" value="' + esc(CFG.meet_url || '') + '" style="' + CAMPO + 'width:100%">'
      + rot('Correo donde te avisa')
      + '<input id="ll-correo" value="' + esc(CFG.correo_aviso || '') + '" style="' + CAMPO + 'width:100%">'
      + '<div style="display:flex;gap:14px;flex-wrap:wrap">'
      + '<div>' + rot('Duración') + sel('ll-dur', CFG.duracion_min, [[15, '15 minutos'], [30, '30 minutos'], [45, '45 minutos'], [60, '1 hora']]) + '</div>'
      + '<div>' + rot('Con cuánta anticipación') + sel('ll-ant', CFG.anticipacion_min, [[0, 'Sin mínimo'], [60, '1 hora antes'], [120, '2 horas antes'], [240, '4 horas antes'], [1440, '1 día antes']]) + '</div>'
      + '<div>' + rot('Hasta cuántos días adelante') + sel('ll-dias', CFG.dias_adelante, [[7, '7 días'], [14, '14 días'], [21, '21 días'], [30, '30 días']]) + '</div>'
      + '</div>'
      + rot('Horario', 'hora de Colombia') + filas
      + rot('Días que no atiendes')
      + '<div>' + (bloq || '<span style="font-size:12px;color:#94A3B8">Ninguno.</span>') + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:6px"><input type="date" id="ll-nuevo-bloq" style="' + CAMPO + '"><button id="ll-add-bloq" style="' + GHO + '">Agregar</button></div>'
      + '<div style="display:flex;justify-content:flex-end;margin-top:18px"><button id="ll-guardar" style="' + PRI + '">Guardar</button></div>'
      + '</div>';
    box.querySelectorAll('[data-quitar]').forEach(function (b) {
      b.onclick = function () { CFG.bloqueos = (CFG.bloqueos || []).filter(function (x) { return x !== b.dataset.quitar; }); leerForm(); pintarConfig(); };
    });
    $('ll-add-bloq').onclick = function () {
      var v = $('ll-nuevo-bloq').value;
      if (!v) return;
      leerForm();
      CFG.bloqueos = (CFG.bloqueos || []).filter(function (x) { return x !== v; }).concat([v]).sort();
      pintarConfig();
    };
    $('ll-guardar').onclick = guardar;
  }

  function leerForm() {
    if (!$('ll-meet')) return;
    CFG.meet_url = $('ll-meet').value.trim();
    CFG.correo_aviso = $('ll-correo').value.trim();
    CFG.duracion_min = Number($('ll-dur').value);
    CFG.anticipacion_min = Number($('ll-ant').value);
    CFG.dias_adelante = Number($('ll-dias').value);
    var hor = {};
    DIAS.forEach(function (d) {
      var on = document.querySelector('[data-atiende="' + d[0] + '"]').checked;
      var a = document.querySelector('[data-desde="' + d[0] + '"]').value;
      var b = document.querySelector('[data-hasta="' + d[0] + '"]').value;
      hor[d[0]] = on && a && b ? [[a, b]] : [];
    });
    CFG.horario = hor;
  }

  async function guardar() {
    leerForm();
    var b = $('ll-guardar'); b.disabled = true; b.textContent = 'Guardando…';
    var r = await llamar({ accion: 'guardar_config', config: CFG });
    b.disabled = false; b.textContent = 'Guardar';
    if (!r.ok) { toast(r.error || 'No se pudo guardar.', 'red'); return; }
    CFG = r.config || CFG;
    pintarConfig();
    toast('Agenda guardada');
  }

  //  El numerito del menu, apenas abre la consola.
  setTimeout(async function () {
    var r = await llamar({ accion: 'lista' });
    if (r.ok) marcarBadge((r.proximas || []).length);
  }, 1500);
})();
