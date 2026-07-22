// =====================================================================
// pos-cierre-print.js — Tickets térmicos de CAJA (80mm)
//
//  1. PALOTEO       — planilla de conteo por denominación (para contar y firmar)
//  2. CIERRE DE CAJA — cierre Z: base, ventas, métodos, efectivo esperado,
//                      billetes grandes / sencillo / monedas, contado y cuadre.
//
// Reutiliza la impresora ya configurada vía pos-print.js (_printHtml interno):
// aquí se expone window.posPrintTicket(html) desde pos-print.js.
// =====================================================================
(function () {
  function cop(n) {
    var v = Math.round(Number(n) || 0);
    var s = Math.abs(v).toLocaleString('es-CO');
    return (v < 0 ? '-$' : '$') + s;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fecha(d) {
    var x = d ? new Date(d) : new Date();
    return x.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + x.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  var CSS = '<style>*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;width:80mm;max-width:80mm;padding:6px 8px;color:#000;line-height:1.35}'
    + '.t{text-align:center}.b{font-weight:900}'
    + '.h1{font-size:17px;font-weight:900;text-align:center}'
    + '.h2{font-size:13px;font-weight:900;text-align:center;margin-bottom:2px}'
    + '.r{display:flex;justify-content:space-between;gap:6px;margin:2px 0}'
    + '.r span:last-child{text-align:right;white-space:nowrap}'
    + '.big{font-size:15px;font-weight:900}'
    + '.sep{border-top:1px dashed #000;margin:6px 0}'
    + '.sepd{border-top:2px solid #000;margin:6px 0}'
    + '.sm{font-size:11px;font-weight:400}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'td{padding:2px 0;font-size:12px;font-weight:700}'
    + '.rt{text-align:right}.ctr{text-align:center}'
    + '.fl{margin-top:14px;font-size:11px;font-weight:400;text-align:center}'
    + '.ln{border-top:1px solid #000;margin:22px 12px 3px}'
    + '</style>';

  function head(negocio, titulo, ses) {
    var abre  = ses && ses.opened_at ? fecha(ses.opened_at) : '—';
    var cierra= ses && ses.closed_at ? fecha(ses.closed_at) : fecha();
    return '<div class="h1">' + esc(negocio || 'CAJA') + '</div>'
      + '<div class="h2">' + esc(titulo) + '</div>'
      + '<div class="sep"></div>'
      + '<div class="r"><span>APERTURA</span><span>' + abre + '</span></div>'
      + '<div class="r"><span>CIERRE</span><span>' + cierra + '</span></div>'
      + (ses && ses.cashier_name ? '<div class="r"><span>CAJERO</span><span>' + esc(ses.cashier_name).toUpperCase() + '</span></div>' : '')
      + (ses && ses.shift_type ? '<div class="r"><span>TURNO</span><span>' + esc(ses.shift_type).toUpperCase() + '</span></div>' : '')
      + (ses && ses.id ? '<div class="r"><span>CAJA</span><span>' + esc(String(ses.id).slice(-6).toUpperCase()) + '</span></div>' : '');
  }

  function firma(txt) {
    return '<div class="ln"></div><div class="fl">' + esc(txt) + '</div>';
  }

  // ── 1. PALOTEO — planilla de conteo ────────────────────────────────
  // d = getArqueoDenoms() · info = {negocio, session, esperado}
  window.posBuildPaloteo = function (d, info) {
    d = d || { lineas: [], billetes: 0, monedas: 0, grandes: 0, sencillo: 0, total: 0 };
    info = info || {};
    var bil = d.lineas.filter(function (l) { return l.grupo === 'billete'; });
    var mon = d.lineas.filter(function (l) { return l.grupo === 'moneda'; });
    function filas(arr) {
      if (!arr.length) return '<tr><td colspan="3" class="ctr sm">— sin conteo —</td></tr>';
      return arr.map(function (l) {
        return '<tr><td>' + cop(l.denom) + '</td><td class="ctr">x' + l.qty + '</td><td class="rt">' + cop(l.total) + '</td></tr>';
      }).join('');
    }
    var esperado = Number(info.esperado) || 0;
    var diff = d.total - esperado;
    return '<!DOCTYPE html><html><head><meta charset="UTF-8">' + CSS + '</head><body>'
      + head(info.negocio, 'PALOTEO DE CAJA', info.session)
      + '<div class="sep"></div>'
      + '<div class="b">BILLETES</div>'
      + '<table>' + filas(bil) + '</table>'
      + '<div class="r b"><span>Subtotal billetes</span><span>' + cop(d.billetes) + '</span></div>'
      + '<div class="sep"></div>'
      + '<div class="b">MONEDAS</div>'
      + '<table>' + filas(mon) + '</table>'
      + '<div class="r b"><span>Subtotal monedas</span><span>' + cop(d.monedas) + '</span></div>'
      + '<div class="sep"></div>'
      + '<div class="r"><span>Billetes 50 - 100</span><span>' + cop(d.grandes) + '</span></div>'
      + '<div class="r"><span>Billetes sencillo</span><span>' + cop(d.sencillo) + '</span></div>'
      + '<div class="r"><span>Monedas</span><span>' + cop(d.monedas) + '</span></div>'
      + '<div class="sepd"></div>'
      + '<div class="r big"><span>TOTAL CONTADO</span><span>' + cop(d.total) + '</span></div>'
      + (info.esperado !== undefined
          ? '<div class="r"><span>Esperado sistema</span><span>' + cop(esperado) + '</span></div>'
            + '<div class="r big"><span>' + (diff === 0 ? 'CUADRE' : diff > 0 ? 'SOBRANTE' : 'FALTANTE') + '</span><span>' + cop(diff) + '</span></div>'
          : '')
      + firma('Firma cajero')
      + '</body></html>';
  };

  // ── 2. CIERRE DE CAJA (Z) ──────────────────────────────────────────
  // c = { negocio, session, base, ventas, nPedidos, metodos:{nombre:monto},
  //       ingresos, egresos, esperado, denoms, contado, diff, obs }
  window.posBuildCierre = function (c) {
    c = c || {};
    var d = c.denoms || null;
    var contado = (c.contado != null) ? c.contado : (d ? d.total : null);
    var diff = (c.diff != null) ? c.diff : (contado != null ? contado - (c.esperado || 0) : null);
    var metodos = c.metodos || {};
    var mk = Object.keys(metodos).filter(function (k) { return Math.round(metodos[k] || 0) !== 0; });
    var digital = mk.filter(function (k) { return k.toLowerCase() !== 'efectivo'; })
                    .reduce(function (s, k) { return s + (metodos[k] || 0); }, 0);

    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8">' + CSS + '</head><body>'
      + head(c.negocio, 'CIERRE DE CAJA', c.session)
      + '<div class="sepd"></div>'
      + '<div class="r"><span>BASE</span><span>' + cop(c.base) + '</span></div>'
      + '<div class="r"><span>VENTAS SISTEMA</span><span>' + cop(c.ventas) + '</span></div>'
      + (c.nPedidos ? '<div class="r sm"><span>Pedidos del turno</span><span>' + c.nPedidos + '</span></div>' : '')
      + '<div class="sep"></div>'
      + '<div class="b">FORMAS DE PAGO</div>';
    if (mk.length) {
      mk.forEach(function (k) {
        h += '<div class="r"><span>' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</span><span>' + cop(metodos[k]) + '</span></div>';
      });
    } else {
      h += '<div class="sm ctr">— sin cobros registrados —</div>';
    }
    if (digital) h += '<div class="r sm"><span>(No efectivo)</span><span>' + cop(digital) + '</span></div>';

    if (c.ingresos || c.egresos) {
      h += '<div class="sep"></div>'
        + (c.ingresos ? '<div class="r"><span>Ingresos caja</span><span>+' + cop(c.ingresos) + '</span></div>' : '')
        + (c.egresos ? '<div class="r"><span>Egresos caja</span><span>-' + cop(c.egresos) + '</span></div>' : '');
    }

    h += '<div class="sepd"></div>'
      + '<div class="r big"><span>EFECTIVO ESPERADO</span><span>' + cop(c.esperado) + '</span></div>'
      + '<div class="sm">Base + efectivo recibido +/- movimientos.<br>No incluye pagos digitales.</div>';

    if (d) {
      h += '<div class="sep"></div>'
        + '<div class="b">ARQUEO (CONTADO)</div>'
        + '<div class="r"><span>Billetes 50 - 100</span><span>' + cop(d.grandes) + '</span></div>'
        + '<div class="r"><span>Billetes sencillo</span><span>' + cop(d.sencillo) + '</span></div>'
        + '<div class="r"><span>Monedas</span><span>' + cop(d.monedas) + '</span></div>';
    }
    if (contado != null) {
      h += '<div class="r big"><span>TOTAL CONTADO</span><span>' + cop(contado) + '</span></div>';
    }
    if (diff != null) {
      h += '<div class="sepd"></div>'
        + '<div class="r big"><span>' + (diff === 0 ? 'CUADRE' : diff > 0 ? 'SOBRANTE' : 'FALTANTE') + '</span><span>' + cop(diff) + '</span></div>';
    }
    if (c.obs) h += '<div class="sep"></div><div class="sm">OBS: ' + esc(c.obs) + '</div>';

    h += firma('Firma responsable') + '</body></html>';
    return h;
  };
})();
