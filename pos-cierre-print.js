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
  // Compacta para el encabezado: "21/07 17:09" (24h, sin año) — permite meter
  // apertura y cierre en un solo renglón.
  function fechaCorta(d) {
    var x = d ? new Date(d) : new Date();
    var dd = String(x.getDate()).padStart(2, '0');
    var mm = String(x.getMonth() + 1).padStart(2, '0');
    var hh = String(x.getHours()).padStart(2, '0');
    var mi = String(x.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + ' ' + hh + ':' + mi;
  }

  // 72mm de ancho útil (el papel es de 80mm pero el área imprimible es menor;
  // a 80mm la columna derecha —los montos— se sale del papel).
  var CSS = '<style>*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;font-weight:700;width:72mm;max-width:72mm;margin:0;padding:8px 6px;color:#000;line-height:1.3;overflow-x:hidden}'
    + '.t{text-align:center}.b{font-weight:900}'
    + '.h1{font-size:13.5px;font-weight:900;text-align:center}'
    + '.h2{font-size:10.5px;font-weight:900;text-align:center;margin-bottom:1px}'
    + '.r{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin:1px 0}'
    + '.r span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.r span:last-child{text-align:right;white-space:nowrap;flex-shrink:0}'
    /* Totales más grandes: Sergio los lee en papel térmico y a 12-13px
       costaban. Se suben 2px. OJO: el recibo está fijado a 72 mm, así que
       no se puede crecer mucho más sin que las cifras largas se partan. */
    + '.big{font-size:14px;font-weight:900}'
    + '.xl{font-size:15.5px;font-weight:900}'
    + '.sep{border-top:1px dashed #000;margin:5px 0}'
    + '.sepd{border-top:2px solid #000;margin:5px 0}'
    + '.sm{font-size:10px;font-weight:400}'
    + '.mut{font-weight:400;font-size:9.5px}'
    + 'table{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed}'
    + 'td{padding:1px 0;font-size:10.5px;font-weight:700;overflow:hidden}'
    + '.rt{text-align:right}.ctr{text-align:center}'
    + '.fl{margin-top:2px;font-size:9px;font-weight:400;text-align:center}'
    + '.ln{border-top:1px solid #000;margin:14px 20px 2px}'
    + '</style>';

  // Anchos fijos de la tabla del paloteo: denominación · cantidad · total.
  // Sin esto, table-layout:fixed reparte 33% a cada una y el total se desborda.
  var COLS = '<colgroup><col style="width:40%"><col style="width:22%"><col style="width:38%"></colgroup>';

  // Encabezado COMPACTO: el código de caja va en el título, apertura→cierre en
  // una sola línea (24h) y cajero · turno en otra. Antes eran 5 renglones.
  function head(negocio, titulo, ses) {
    var cod = (ses && ses.id) ? ' · ' + esc(String(ses.id).slice(-6).toUpperCase()) : '';
    var abre   = ses && ses.opened_at ? fechaCorta(ses.opened_at) : '—';
    var cierra = ses && ses.closed_at ? fechaCorta(ses.closed_at) : fechaCorta();
    var quien  = [];
    if (ses && ses.cashier_name) quien.push(esc(ses.cashier_name));
    if (ses && ses.shift_type)   quien.push(esc(ses.shift_type));
    return '<div class="h1">' + esc(negocio || 'CAJA') + '</div>'
      + '<div class="h2">' + esc(titulo) + cod + '</div>'
      + '<div class="sep"></div>'
      + '<div class="sm ctr">' + abre + ' &rarr; ' + cierra + '</div>'
      + (quien.length ? '<div class="sm ctr">' + quien.join(' &middot; ') + '</div>' : '');
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
      + '<table>' + COLS + filas(bil) + '</table>'
      + '<div class="r b"><span>Subtotal billetes</span><span>' + cop(d.billetes) + '</span></div>'
      + '<div class="sep"></div>'
      + '<div class="b">MONEDAS</div>'
      + '<table>' + COLS + filas(mon) + '</table>'
      + '<div class="r b"><span>Subtotal monedas</span><span>' + cop(d.monedas) + '</span></div>'
      + '<div class="sep"></div>'
      + '<div class="r"><span>Billetes 50-100</span><span>' + cop(d.grandes) + '</span></div>'
      + '<div class="r"><span>Sencillo</span><span>' + cop(d.sencillo) + '</span></div>'
      + '<div class="r"><span>Monedas</span><span>' + cop(d.monedas) + '</span></div>'
      + '<div class="sepd"></div>'
      + '<div class="r big"><span>TOTAL CONTADO</span><span>' + cop(d.total) + '</span></div>'
      + (info.esperado !== undefined
          ? '<div class="r"><span>Esperado sistema</span><span>' + cop(esperado) + '</span></div>'
            + '<div class="r xl"><span>' + (diff === 0 ? 'CUADRE' : diff > 0 ? 'SOBRANTE' : 'FALTANTE') + '</span><span>' + cop(diff) + '</span></div>'
          : '')
      + firma('Firma')
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
      // "Pedidos del turno (n)" va en la MISMA línea de VENTAS, en letra delgada,
      // aprovechando el espacio libre antes del monto.
      + '<div class="r"><span>VENTAS'
        + (c.nPedidos ? ' <span class="mut">Pedidos del turno (' + c.nPedidos + ')</span>' : '')
        + '</span><span>' + cop(c.ventas) + '</span></div>'
      + '<div class="sep"></div>';
    if (mk.length) {
      mk.forEach(function (k) {
        h += '<div class="r"><span>' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</span><span>' + cop(metodos[k]) + '</span></div>';
      });
    } else {
      h += '<div class="sm ctr">— sin cobros registrados —</div>';
    }
    // "(No efectivo)" solo aporta cuando hay 2+ métodos digitales; con uno solo
    // repetiría el mismo número.
    var nDigital = mk.filter(function (k) { return k.toLowerCase() !== 'efectivo'; }).length;
    if (digital && nDigital > 1) h += '<div class="r sm"><span>(No efectivo)</span><span>' + cop(digital) + '</span></div>';

    if (c.ingresos || c.egresos) {
      h += '<div class="sep"></div>'
        + (c.ingresos ? '<div class="r"><span>Ingresos caja</span><span>+' + cop(c.ingresos) + '</span></div>' : '')
        + (c.egresos ? '<div class="r"><span>Egresos caja</span><span>-' + cop(c.egresos) + '</span></div>' : '');
    }

    h += '<div class="sepd"></div>'
      + '<div class="r big"><span>EFECT. ESPERADO</span><span>' + cop(c.esperado) + '</span></div>';

    if (d) {
      h += '<div class="sep"></div>'
        + '<div class="r"><span>Billetes 50-100</span><span>' + cop(d.grandes) + '</span></div>'
        + '<div class="r"><span>Sencillo</span><span>' + cop(d.sencillo) + '</span></div>'
        + '<div class="r"><span>Monedas</span><span>' + cop(d.monedas) + '</span></div>';
    }
    if (contado != null) {
      h += '<div class="r big"><span>TOTAL CONTADO</span><span>' + cop(contado) + '</span></div>';
    }
    if (diff != null) {
      h += '<div class="sepd"></div>'
        + '<div class="r xl"><span>' + (diff === 0 ? 'CUADRE' : diff > 0 ? 'SOBRANTE' : 'FALTANTE') + '</span><span>' + cop(diff) + '</span></div>';
    }
    /* POR COMPRAR. Va al final, después del cuadre: el cierre es lo último de
       la noche y esto es lo que se lleva para el otro día. */
    if (c.bajos && c.bajos.length) {
      h += '<div class="sepd"></div>'
         + '<div class="r big"><span>POR COMPRAR</span><span>' + c.bajos.length + '</span></div>';
      c.bajos.forEach(function (i) {
        var der = i.agotado ? 'SE ACABO'
                : (i.stock + (i.unidad ? ' ' + i.unidad : '') + ' / min ' + i.min);
        h += '<div class="r"><span>' + esc(i.nombre) + '</span><span>' + esc(der) + '</span></div>';
      });
    }

    if (c.obs) h += '<div class="sep"></div><div class="sm">OBS: ' + esc(c.obs) + '</div>';

    h += firma('Firma') + '</body></html>';
    return h;
  };
})();
