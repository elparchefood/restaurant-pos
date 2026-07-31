/* ═══════════════ INFORMES · arranque ═══════════════
   Enchufa el módulo (diseño de Sergio) con la sesión real de Cobra:
     · le pasa tenant/sucursal a los cargadores de datos,
     · reemplaza los KPIs de ejemplo de la portada por los del mes de verdad,
     · hace que "Exportar" descargue el informe que está en pantalla.
   Va DESPUÉS de informes-app.js porque usa lo que ese deja montado.        */
(function () {
  'use strict';

  var COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  var NUM = new Intl.NumberFormat('es-CO');

  function esperarSesion(cb) {
    var t0 = Date.now();
    (function ver() {
      var st = window._pos && window._pos.state;
      if (st && st.tenantId) return cb(st);
      if (Date.now() - t0 > 12000) return cb(null);   // no bloquear la pantalla
      setTimeout(ver, 120);
    })();
  }

  // ── Portada: los 4 KPIs del mes, con datos reales ────────────────────
  async function pintarResumenMes() {
    var host = document.getElementById('rSnap');
    if (!host || !window.INFORMES_DATOS) return;
    try {
      var d = await window.INFORMES_DATOS.cargar('ger-resumen', 'mes');
      if (!d || d.vacio || !d.kpis) {
        host.innerHTML = '<div class="r-kpi"><div class="r-kpi-lbl">Ventas del mes</div>'
          + '<div class="r-kpi-val">' + COP.format(0) + '</div>'
          + '<div class="r-kpi-sub">Todavía no hay ventas este mes</div></div>';
        return;
      }
      // El diseño muestra 4 en la portada; el informe completo trae más.
      host.innerHTML = d.kpis.slice(0, 4).map(function (k) {
        return '<div class="r-kpi' + (k.tone ? ' ' + k.tone : '') + (k.big ? ' big' : '') + '">'
          + '<div class="r-kpi-lbl">' + esc(k.lbl) + '</div>'
          + '<div class="r-kpi-val">' + esc(k.val) + '</div>'
          + (k.sub ? '<div class="r-kpi-sub">' + esc(k.sub) + '</div>' : '') + '</div>';
      }).join('');
    } catch (e) {
      console.warn('[Informes] resumen de portada:', e);
      host.innerHTML = '<div class="r-kpi"><div class="r-kpi-lbl">Resumen del mes</div>'
        + '<div class="r-kpi-val">—</div><div class="r-kpi-sub">No se pudo cargar</div></div>';
    }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // El subtítulo decía "Julio 2026 · todas las sucursales" fijo en el diseño.
  function fecharPortada() {
    var sub = document.querySelector('#rScroll .r-card-sub');
    if (!sub) return;
    var m = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    sub.textContent = m.charAt(0).toUpperCase() + m.slice(1);
  }

  // ── Exportar de verdad ───────────────────────────────────────────────
  // El diseño dejaba un toast de mentira ("Exportando a Excel…") que no
  // descargaba nada. Se saca del informe que está en pantalla, para que lo
  // exportado sea EXACTAMENTE lo que se está viendo.
  function tablasEnPantalla() {
    return Array.prototype.slice.call(document.querySelectorAll('#rScroll table'));
  }
  function aCSV() {
    var out = [];
    tablasEnPantalla().forEach(function (t, i) {
      var titulo = t.closest('.r-card');
      titulo = titulo && titulo.querySelector('.r-card-title');
      if (i) out.push('');
      if (titulo) out.push([titulo.textContent.trim()]);
      Array.prototype.slice.call(t.querySelectorAll('tr')).forEach(function (tr) {
        out.push(Array.prototype.slice.call(tr.querySelectorAll('th,td')).map(function (c) {
          return c.textContent.replace(/\s+/g, ' ').trim();
        }));
      });
    });
    // Punto y coma: Excel en español usa la coma como separador decimal, así
    // que con comas partiría mal los precios ("$ 1.234,50").
    return out.map(function (fila) {
      return (Array.isArray(fila) ? fila : [fila]).map(function (c) {
        return /[";\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c;
      }).join(';');
    }).join('\r\n');
  }
  function descargar(nombre, csv) {
    // BOM para que Excel abra los acentos y el signo $ bien.
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-export]');
    if (!b) return;
    e.stopImmediatePropagation();   // desactiva el toast de mentira del diseño
    if (!tablasEnPantalla().length) {
      var t = document.getElementById('rToast');
      if (t) { t.querySelector('.msg').textContent = 'Este informe no tiene tabla para exportar'; t.hidden = false;
               setTimeout(function () { t.hidden = true; }, 2600); }
      return;
    }
    var crumb = document.getElementById('rCrumb');
    var nom = ((crumb && crumb.textContent) || 'informe').replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    descargar(nom + '-' + new Date().toISOString().slice(0, 10) + '.csv', aCSV());
    var tt = document.getElementById('rToast');
    if (tt) { tt.querySelector('.msg').textContent = 'Descargado'; tt.hidden = false;
              setTimeout(function () { tt.hidden = true; }, 2200); }
  }, true);   // en captura, para adelantarse al listener del diseño

  // ── Arranque ─────────────────────────────────────────────────────────
  esperarSesion(function (st) {
    if (!st) { console.warn('[Informes] sin sesión: no se cargan datos'); return; }
    if (window.INFORMES_DATOS) window.INFORMES_DATOS.setCtx(st.tenantId, st.branchId);
    fecharPortada();
    pintarResumenMes();
  });
})();
