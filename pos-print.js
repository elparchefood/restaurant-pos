// pos-print.js — Sistema compartido de impresion (C5, C6, C8)
// Modal de impresion con 3 opciones + comanda auto al enviar a cocina
// RF4: un solo lugar, reutilizable desde tomar-pedido y pagos
(function() {
  'use strict';

  var MODELS_KEY = 'pos.config.recibos.v1';

  // Estado de pago para impresos: PAGADO / ABONADO+COBRAR / COBRAR.
  // Usa order.paid (pos_orders.paid_amount) — las transferencias verificadas por
  // el bot y los abonos de caja llegan aquí. Sin datos → no imprime nada.
  function _pagoEstadoHtml(order) {
    if (!order || order.paid === undefined || order.total === undefined) return '';
    var total = Number(order.total || 0), paid = Number(order.paid || 0);
    if (total <= 0) return '';
    var f = function(n){ return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
    if (paid >= total) return '<div style="text-align:center;font-size:15px;font-weight:900;border:2px solid #000;padding:3px;margin:6px 0;">*** PAGADO ***</div>';
    if (paid > 0) return '<div style="text-align:center;font-size:13px;font-weight:900;border:2px solid #000;padding:3px;margin:6px 0;">ABONADO ' + f(paid) + '<br>COBRAR: ' + f(total - paid) + '</div>';
    return '<div style="text-align:center;font-size:14px;font-weight:900;border:2px solid #000;padding:3px;margin:6px 0;">COBRAR: ' + f(total) + '</div>';
  }

  function _buildComanda(order, items) {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    var dateStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate())
      + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    var mesa = (order.table || '-').toUpperCase();
    var mesaMatch = mesa.match(/^T(\d+)$/);
    if (mesaMatch) mesa = String(parseInt(mesaMatch[1], 10));
    var pax    = order.guests  || 0;
    var waiter = (order.waiter || '').toUpperCase();
    var sala   = (order.sala   || '').toUpperCase();
    var channel = (order.channel || '').toUpperCase();
    var isParaLlevar = channel.indexOf('LLEVAR') >= 0;
    var isDomicilio  = channel === 'DOMICILIO';
    var isRapido     = channel === 'RAPIDO';
    var _notes = order.notes || '';
    var _barrioMatch = _notes.match(/\[barrio:([^\]]+)\]/i);
    var _barrio = _barrioMatch ? _barrioMatch[1] : '';
    // Etiqueta de venta rápida (Espera / Avisar / …) — se guarda en notes
    var _etqMatch = _notes.match(/\[etq:([^\]]+)\]/i);
    var _etq = _etqMatch ? _etqMatch[1] : '';

    var _customerName = (order.customer_name || '').toUpperCase();

    var rows = (items || []).map(function(it) {
      var qty  = it.qty || 1;
      var name = (it.name || 'Item').toUpperCase();
      var line = '(' + qty + ') ' + name;
      var modsHtml = (it.mods && it.mods.length)
        ? it.mods.map(function(m) {
            return '<div style="font-style:italic;font-size:12px;font-weight:700;margin-left:10px;margin-top:1px;margin-bottom:3px;">+ ' + String(m).toUpperCase() + '</div>';
          }).join('')
        : '';
      var noteText = it.notes || it.note || '';
      var note = noteText
        ? '<div style="font-style:italic;font-size:12px;font-weight:700;margin-left:10px;margin-top:1px;margin-bottom:5px;">NOTA - ' + noteText.toUpperCase() + '</div>'
        : '';
      return '<div style="font-size:15px;font-weight:700;margin:5px 0 2px;line-height:1.3;">' + line + '</div>' + modsHtml + note;
    }).join('');

    function sep(text) {
      return '<div style="position:relative;margin:8px 0 5px;">'
        + '<div style="border-top:1px dashed #000;"></div>'
        + '<div style="position:absolute;top:-9px;left:0;right:0;text-align:center;">'
        + '<span style="background:#fff;padding:0 5px;font-size:10px;font-weight:400;letter-spacing:0.5px;">' + text + '</span>'
        + '</div></div><div style="height:5px;"></div>';
    }

    var paraLlevar = isParaLlevar
      ? '<div style="text-align:center;font-size:13px;font-weight:900;margin:2px 0 5px;">==== PARA LLEVAR ====</div>'
      : '';

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;width:80mm;max-width:80mm;margin:0;padding:6px 8px;color:#000;line-height:1.35;}</style>'
      + '</head><body>'
      + ((isDomicilio || isRapido)
          ? (_barrio
              ? '<div style="font-size:13px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:1px;">' + (isDomicilio ? 'DOMICILIO' : 'VENTA RAPIDA') + '</div>'
                + '<div style="font-size:24px;font-weight:900;text-align:center;margin-bottom:2px;">' + _barrio + '</div>'
                + (isRapido && _etq ? '<div style="font-size:14px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:2px;">' + _etq + '</div>' : '')
                + (_customerName ? '<div style="font-size:14px;font-weight:700;text-align:center;margin-bottom:2px;">' + _customerName + '</div>' : '')
              : '<div style="font-size:' + (isRapido ? '16px' : '20px') + ';font-weight:900;text-align:center;margin-bottom:2px;">' + (isDomicilio ? 'DOMICILIO' : 'VENTA RAPIDA') + '</div>'
                + (isRapido && _etq ? '<div style="font-size:14px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:2px;">' + _etq + '</div>' : '')
                + (_customerName ? '<div style="font-size:14px;font-weight:700;text-align:center;margin-bottom:2px;">' + _customerName + '</div>' : ''))
          : '<div style="font-size:20px;font-weight:900;text-align:center;margin-bottom:2px;">MESA ' + mesa + '</div>')
      + (!isDomicilio && !isRapido && pax ? '<div style="font-size:13px;font-weight:700;padding-left:55%;">( ' + pax + ' PAX)</div>' : '')
      + '<div style="height:5px;"></div>'
      + '<div>AREA - COCINA</div>'
      + '<div>FECHA: ' + dateStr + '</div>'
      + (waiter ? '<div>' + (isDomicilio || isRapido ? 'CAJERO' : 'MESERO') + ' - ' + waiter + '</div>' : '')
      + (sala   ? '<div>SALA - '   + sala   + '</div>' : '')
      + sep('INICIO PEDIDO')
      + paraLlevar
      + rows
      + sep('FIN PEDIDO')
      + '</body></html>';
  }

  function _buildReceiptDesc(order, items) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    var dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    var rows = (items || []).map(function(it) {
      return '<tr><td style="padding:4px 0">' + (it.qty || 1) + 'x ' + (it.name || 'Item') + '</td><td style="text-align:right;padding:4px 0">$' + Number(it.total || 0).toLocaleString('es-CO') + '</td></tr>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;width:80mm;max-width:80mm;margin:0;padding:10px}table{width:100%;border-collapse:collapse}</style></head><body>'
      + '<div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px"><div style="font-size:16px;font-weight:bold">RECIBO</div><div style="font-size:11px;color:#555">' + dateStr + ' - ' + timeStr + '</div></div>'
      + (order.table ? '<div style="margin-bottom:6px">Mesa: <b>' + order.table + '</b></div>' : '')
      + '<table><tbody>' + rows + '</tbody><tr><td colspan="2" style="border-top:1px dashed #000;padding-top:4px"></td></tr><tr><td><b>TOTAL</b></td><td style="text-align:right;font-weight:bold">$' + Number(order.total || 0).toLocaleString('es-CO') + '</td></tr></table>'
      + _pagoEstadoHtml(order)
      + '<div style="text-align:center;font-size:10px;color:#888;margin-top:12px;border-top:1px dashed #000;padding-top:6px">Gracias por su preferencia</div>'
      + '</body></html>';
  }

  function _buildReceiptFinal(order, items, payments) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    var dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    var rows = (items || []).map(function(it) {
      return '<tr><td style="padding:3px 0">' + (it.qty || 1) + 'x ' + (it.name || 'Item') + '</td><td style="text-align:right;padding:3px 0">$' + Number(it.total || 0).toLocaleString('es-CO') + '</td></tr>';
    }).join('');
    var pRows = (payments || []).map(function(p) {
      return '<tr><td style="padding:2px 0;font-size:12px">' + (p.method || 'Pago') + '</td><td style="text-align:right;padding:2px 0;font-size:12px">$' + Number(p.amount || 0).toLocaleString('es-CO') + '</td></tr>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;width:80mm;max-width:80mm;margin:0;padding:10px}table{width:100%;border-collapse:collapse}</style></head><body>'
      + '<div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px"><div style="font-size:16px;font-weight:bold">CUENTA FINAL</div><div style="font-size:11px;color:#555">' + dateStr + ' - ' + timeStr + '</div></div>'
      + (order.table ? '<div style="margin-bottom:6px">Mesa: <b>' + order.table + '</b></div>' : '')
      + '<table><tbody>' + rows + '</tbody>'
      + '<tr><td colspan="2" style="border-top:1px dashed #000;padding-top:4px"></td></tr>'
      + '<tr><td style="color:#555;font-size:12px">Subtotal</td><td style="text-align:right;font-size:12px">$' + Number(order.subtotal || order.total || 0).toLocaleString('es-CO') + '</td></tr>'
      + (order.discount ? '<tr><td style="color:#555;font-size:12px">Descuento</td><td style="text-align:right;font-size:12px;color:#DC2626">-$' + Number(order.discount || 0).toLocaleString('es-CO') + '</td></tr>' : '')
      + (order.tip ? '<tr><td style="color:#555;font-size:12px">Propina</td><td style="text-align:right;font-size:12px">$' + Number(order.tip || 0).toLocaleString('es-CO') + '</td></tr>' : '')
      + '<tr><td colspan="2" style="border-top:1px solid #000;padding-top:4px"></td></tr>'
      + '<tr><td><b>TOTAL</b></td><td style="text-align:right;font-weight:bold">$' + Number(order.total || 0).toLocaleString('es-CO') + '</td></tr>'
      + (pRows ? '<tr><td colspan="2" style="border-top:1px dashed #000;padding-top:4px;font-size:11px;color:#555">Forma de pago</td></tr>' + pRows : '')
      + '</table>'
      + _pagoEstadoHtml(order)
      + '<div style="text-align:center;font-size:10px;color:#888;margin-top:12px;border-top:1px dashed #000;padding-top:6px">Gracias por su preferencia</div>'
      + '</body></html>';
  }

  // ── RECIBO DEL CLIENTE (domicilio/rápido) — detallado, con datos y precios ──
  function _money(n){ return '$' + Number(Math.round(n||0)).toLocaleString('es-CO'); }
  function _buildReceiptDomicilio(order, items, branch) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    var dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    branch = branch || {};
    var negocio = (branch.brand_name || branch.name || 'Recibo').toUpperCase();
    var dirLocal = branch.address || '';
    var telLocal = branch.phone || '';
    // Datos del cliente desde notes: dirección + [barrio:X] + [tel:Y] (· Ref:… se ignora)
    var notes = String(order.notes || '');
    var mB = notes.match(/\[barrio:([^\]]+)\]/i); var barrio = mB ? mB[1] : '';
    var mT = notes.match(/\[tel:([^\]]+)\]/i);    var telCli = mT ? mT[1] : (order.customer_phone || '');
    var dirCli = notes.replace(/\[barrio:[^\]]+\]/ig,'').replace(/\[tel:[^\]]+\]/ig,'').replace(/\[etq:[^\]]+\]/ig,'').replace(/·\s*Ref:\S+/ig,'').trim();
    var esLlevar = String(order.channel||'').toLowerCase().indexOf('rapid')>=0 || /para\s+llevar|recog/i.test(dirCli);
    var num = '#' + String(order.id||'').slice(-5).toUpperCase();

    var itemRows = (items||[]).map(function(it){
      var qty = it.qty || 1;
      var line = _money(it.total || 0);
      var mods = (it.mods && it.mods.length)
        ? it.mods.map(function(m){ return '<div style="font-size:11px;color:#333;padding-left:14px">+ '+String(m)+'</div>'; }).join('')
        : '';
      return '<tr><td style="padding:3px 0;vertical-align:top">'+qty+'x '+(it.name||'Item')+mods+'</td>'
           + '<td class="pcol" style="padding:3px 0">'+line+'</td></tr>';
    }).join('');

    var subtotal = Number(order.subtotal || 0) || (items||[]).reduce(function(a,it){return a+(it.total||0);},0);
    var empaque  = Number(order.packaging_fee || 0);
    var domi     = Number(order.delivery_fee || 0);
    var descuento= Number(order.discount || 0);
    var total    = Number(order.total || 0) || (subtotal+empaque+domi-descuento);
    var footer = '';
    try { footer = localStorage.getItem('pos.config.recibo.footer') || ''; } catch(e){}
    if (!footer) footer = '¡Gracias por tu pedido! 🍟';

    var sep = '<div style="border-top:1px dashed #000;margin:7px 0"></div>';
    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:12.5px;width:72mm;max-width:72mm;margin:0;padding:8px 6px;color:#000;line-height:1.35}table{width:100%;border-collapse:collapse}td{word-break:break-word}.pcol{width:26%;white-space:nowrap;text-align:right;vertical-align:top}</style></head><body>';
    // Encabezado del negocio
    h += '<div style="text-align:center;margin-bottom:2px"><div style="font-size:17px;font-weight:900;letter-spacing:.5px">'+negocio+'</div>';
    if (dirLocal) h += '<div style="font-size:10.5px;color:#333">'+dirLocal+'</div>';
    if (telLocal) h += '<div style="font-size:10.5px;color:#333">Tel: '+telLocal+'</div>';
    h += '</div>'+sep;
    // Título + pedido
    h += '<div style="text-align:center"><div style="font-size:13px;font-weight:800">'+(esLlevar?'RECIBO · PARA LLEVAR':'RECIBO DE DOMICILIO')+'</div>'
       + '<div style="font-size:11px;color:#333">Pedido '+num+' · '+dateStr+' '+timeStr+'</div></div>'+sep;
    // Cliente
    h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase">Cliente</div>';
    h += '<div style="font-size:13px;font-weight:700">'+(order.customer_name||'—')+'</div>';
    if (telCli) h += '<div style="font-size:12px">Tel: '+telCli+'</div>';
    if (!esLlevar) {
      if (barrio) h += '<div style="font-size:12.5px;font-weight:700;margin-top:2px">'+barrio+'</div>';
      if (dirCli) h += '<div style="font-size:12px">'+dirCli+'</div>';
    } else {
      h += '<div style="font-size:12px;font-weight:700;margin-top:2px">Recoge en el local 🏃</div>';
    }
    h += sep;
    // Items
    h += '<table><tbody>'+itemRows+'</tbody></table>'+sep;
    // Totales
    h += '<table>';
    h += '<tr><td style="font-size:12px;color:#333">Subtotal</td><td class="pcol" style="font-size:12px">'+_money(subtotal)+'</td></tr>';
    if (empaque>0)  h += '<tr><td style="font-size:12px;color:#333">Empaque</td><td class="pcol" style="font-size:12px">'+_money(empaque)+'</td></tr>';
    if (!esLlevar && domi>0) h += '<tr><td style="font-size:12px;color:#333">Domicilio</td><td class="pcol" style="font-size:12px">'+_money(domi)+'</td></tr>';
    if (descuento>0) h += '<tr><td style="font-size:12px;color:#333">Descuento</td><td class="pcol" style="font-size:12px">-'+_money(descuento)+'</td></tr>';
    h += '<tr><td colspan="2" style="border-top:1px solid #000;padding-top:3px"></td></tr>';
    h += '<tr><td style="font-size:15px;font-weight:900">TOTAL</td><td class="pcol" style="font-size:15px;font-weight:900">'+_money(total)+'</td></tr>';
    h += '</table>';
    // Estado de pago (grande, para el domiciliario)
    var pm = order.payment_method ? String(order.payment_method) : '';
    if (pm && pm!=='multiple') h += '<div style="text-align:center;font-size:11.5px;margin-top:6px">Pago: '+pm.charAt(0).toUpperCase()+pm.slice(1)+'</div>';
    h += _pagoEstadoHtml(order);
    var mRef = notes.match(/Ref:(\S+)/i); if (mRef) h += '<div style="text-align:center;font-size:10.5px;color:#555">Ref: '+mRef[1]+'</div>';
    // Pie
    h += sep+'<div style="text-align:center;font-size:11px;color:#333;margin-top:2px">'+footer+'</div>';
    h += '</body></html>';
    return h;
  }

  var _printerCache = null;
  var _printerCacheTs = 0;

  async function _getTargetPrinter(docType) {
    try {
      var sb = window._pos && window._pos.sb;
      var branchId = (window._pos.state && window._pos.state.branchId) || localStorage.getItem('pos.branchId');
      if (!sb || !branchId) return '';
      var now = Date.now();
      if (!_printerCache || now - _printerCacheTs > 30000) {
        var cfg = await sb.from('pos_print_config').select('same_printer_for_all, default_system_printer').eq('branch_id', branchId).maybeSingle();
        var prs = await sb.from('pos_printers').select('system_name, area, is_default').eq('branch_id', branchId);
        _printerCache = { cfg: (cfg && cfg.data) || {}, printers: (prs && prs.data) || [] };
        _printerCacheTs = now;
      }
      if (_printerCache.cfg.same_printer_for_all) return _printerCache.cfg.default_system_printer || '';
      var area = (docType === 'comanda') ? 'cocina' : 'caja';
      var match = _printerCache.printers.find(function(p) { return p.area === area && p.is_default; });
      if (!match) match = _printerCache.printers.find(function(p) { return p.area === area; });
      return (match && match.system_name) ? match.system_name : '';
    } catch(e) { return ''; }
  }

  async function _printHtml(html, docType) {
    if (window.electronPOS && window.electronPOS.printHtmlSilent) {
      try {
        var printerName = await _getTargetPrinter(docType || 'comanda');
        var result = await window.electronPOS.printHtmlSilent(html, printerName);
        if (result && result.ok) return;
        console.warn('[posprint] silent print falló, fallback web:', result && result.error);
      } catch(e) { console.warn('[posprint] silent print excepción:', e); }
    }
    // Fallback: impresión web normal (abre diálogo)
    var existing = document.getElementById('pos-print-frame');
    if (existing) existing.remove();
    var iframe = document.createElement('iframe');
    iframe.id = 'pos-print-frame';
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:80mm;height:600px;border:none;visibility:hidden';
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    iframe.onload = function() {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch(e) { var win = window.open('', '_blank', 'width=400,height=600'); if (win) { win.document.write(html); win.document.close(); win.print(); } }
    };
  }

  // Imprimir un ticket ya armado (cierre de caja / paloteo). Usa la impresora
  // configurada; docType 'recibo' → impresora de caja.
  window.posPrintTicket = async function (html, docType) {
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return false; }
    try { await _printHtml(html, docType || 'recibo'); return true; }
    catch (e) { _diagToast('❌ Error al imprimir: ' + (e && e.message || e), '#dc2626'); return false; }
  };

  function _noprinterToast() {
    var ex = document.getElementById('pos-noprinter-toast');
    if (ex) { clearTimeout(ex._t); ex.remove(); }
    var el = document.createElement('div');
    el.id = 'pos-noprinter-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#334155;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(15,23,42,.22);white-space:nowrap';
    el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Sin impresora configurada';
    document.body.appendChild(el);
    el._t = setTimeout(function() { if (el.parentNode) el.remove(); }, 3500);
  }

  async function _hasPrinter() {
    try {
      var sb = window._pos && window._pos.sb;
      if (!sb) return false;
      var branchId = (window._pos.state && window._pos.state.branchId) || localStorage.getItem('pos.branchId');
      if (!branchId) return false;
      var r = await sb.from('pos_print_config').select('id').eq('branch_id', branchId).maybeSingle();
      return !!(r && r.data && r.data.id);
    } catch(e) { return false; }
  }

  async function _fetchOrder(orderId) {
    try {
      var sb = window._pos && window._pos.sb;
      if (!sb || !orderId) return null;
      // pos_orders → pos_order_items tiene FK real; pos_tables NO tiene FK desde pos_orders
      // por eso hacemos dos queries separadas en vez de un join inválido
      var r = await sb.from('pos_orders').select('*, pos_order_items(*)').eq('id', orderId).maybeSingle();
      if (!r || !r.data) {
        if (r && r.error) { _diagToast('❌ fetchOrder: ' + (r.error.message || r.error.code), '#7c2d12'); }
        return null;
      }
      var order = r.data;
      // Obtener nombre de mesa por separado (sin FK no se puede hacer join inline)
      if (order.table_id) {
        var rt = await sb.from('pos_tables').select('name, number').eq('id', order.table_id).maybeSingle();
        order.pos_tables = (rt && rt.data) ? rt.data : null;
      }
      return order;
    } catch(e) { _diagToast('❌ fetchOrder excepción: ' + (e && e.message || e), '#7c2d12'); return null; }
  }

  function _tableDisplay(order) {
    var t = order.pos_tables;
    if (t) return t.name || String(t.number || '') || order.table_id || '-';
    return order.table_name || order.table_id || '-';
  }

  function _diagToast(msg, color) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:' + (color||'#1d4ed8') + ';color:#fff;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:700;z-index:99999;white-space:nowrap;pointer-events:none';
    el.textContent = msg;
    document.body && document.body.appendChild(el);
    setTimeout(function() { el.parentNode && el.parentNode.removeChild(el); }, 5000);
  }

  // Candado anti-duplicado: un mismo pedido solo se auto-imprime UNA vez por
  // dispositivo. En la caja (ventas.html) hay dos listeners de realtime que
  // disparan con el INSERT y con el UPDATE a in_progress del mismo pedido; sin
  // este candado la comanda salía dos veces por los pedidos hechos en la tablet.
  function _sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  // Memoria PERSISTENTE de comandas ya impresas en este equipo (sobrevive
  // navegación entre pantallas — el candado en memoria no). Evita que el
  // receptor global re-imprima algo ya impreso tras cambiar de página.
  var _LS_PRINTED = 'pos.printed.v1';
  function _lsPrintedMap() {
    try { return JSON.parse(localStorage.getItem(_LS_PRINTED) || '{}') || {}; } catch(e) { return {}; }
  }
  function _lsWasPrinted(orderId) { return !!_lsPrintedMap()[orderId]; }
  function _lsMarkPrinted(orderId) {
    try {
      var m = _lsPrintedMap(), now = Date.now();
      for (var k in m) { if (now - m[k] > 21600000) delete m[k]; } // podar > 6 h
      m[orderId] = now;
      localStorage.setItem(_LS_PRINTED, JSON.stringify(m));
    } catch(e) {}
  }
  function _lsUnmarkPrinted(orderId) {
    try { var m = _lsPrintedMap(); delete m[orderId]; localStorage.setItem(_LS_PRINTED, JSON.stringify(m)); } catch(e) {}
  }

  var _autoPrinted = {};
  window.posAutoprint = async function(orderId, opts) {
    if (!orderId) return;
    var force = !!(opts && opts.force);   // reimpresión pedida explícitamente
    var _now = Date.now();
    // Podar entradas viejas (> 1 hora) para no crecer sin límite en turnos largos
    for (var _k in _autoPrinted) { if (_now - _autoPrinted[_k] > 3600000) delete _autoPrinted[_k]; }
    if (force) { delete _autoPrinted[orderId]; _lsUnmarkPrinted(orderId); }
    if (_autoPrinted[orderId] || _lsWasPrinted(orderId)) {
      // Ya impresa en este equipo. Si la marca en BD quedó pendiente (p. ej. la
      // página navegó antes de guardarla), sanarla para que el barrido no la
      // siga viendo como "sin imprimir".
      try {
        var sbH = window._pos && window._pos.sb;
        if (sbH) sbH.from('pos_orders').update({ printed_at: new Date().toISOString() }).eq('id', orderId).is('printed_at', null).then(function(){});
      } catch(e) {}
      return;
    }
    _autoPrinted[orderId] = _now;
    _diagToast('🖨 Verificando impresora…', '#1d4ed8');

    // 1) Impresora: reintentar por si la lectura de config falla transitoriamente (WiFi tablet)
    var hasPrinter = false;
    for (var hp = 0; hp < 3 && !hasPrinter; hp++) {
      hasPrinter = await _hasPrinter();
      if (!hasPrinter && hp < 2) await _sleep(500);
    }
    if (!hasPrinter) { delete _autoPrinted[orderId]; _noprinterToast(); _diagToast('❌ Sin config de impresora en BD', '#dc2626'); return; }
    _diagToast('✓ Impresora OK — buscando pedido…', '#15803d');

    // 2) Pedido + ítems: REINTENTAR hasta que los ítems sean visibles. Causa #1 de
    // impresiones perdidas: el pedido se guarda pero al leerlo de inmediato los ítems
    // todavía no aparecen (lag de escritura→lectura). Reintentamos ~4s antes de rendirnos.
    var order = null, items = [];
    for (var att = 0; att < 9; att++) {
      order = await _fetchOrder(orderId);
      if (order) {
        items = (order.pos_order_items || []).map(function(it) {
          var sel = it.selections || {};
          var modsArr = Object.values(sel.mods || {}).map(function(m){ return m.name || String(m); });
          return { name: it.product_name || it.name || 'Item', qty: it.quantity || 1, note: it.note || '', notes: it.notes || '', mods: modsArr };
        });
        if (items.length) break;
      }
      await _sleep(450);
    }
    if (!order || !items.length) { delete _autoPrinted[orderId]; _diagToast('❌ Pedido sin ítems tras reintentos', '#dc2626'); return; }
    _diagToast('✓ Pedido OK — enviando a impresora…', '#15803d');

    // 3) Imprimir, con reintento si el envío a la impresora falla transitoriamente
    var printed = false;
    for (var pr = 0; pr < 2 && !printed; pr++) {
      try {
        await _printHtml(_buildComanda({ table: _tableDisplay(order), channel: order.channel, total: order.total || 0, paid: order.paid_amount || 0, guests: order.guests || order.persons || 0, waiter: order.waiter_name || '', sala: order.floor_name || order.zone_name || '', notes: order.notes || '', customer_name: order.customer_name || '' }, items), 'comanda');
        printed = true;
        _diagToast('✓ Comanda impresa OK', '#15803d');
      } catch(e) {
        if (pr < 1) { await _sleep(600); }
        else { delete _autoPrinted[orderId]; _diagToast('❌ Error al imprimir: ' + (e && e.message || e), '#dc2626'); }
      }
    }
    if (printed) {
      _lsMarkPrinted(orderId);
      // Marcar en BD que la comanda ya salió — el receptor global y el barrido de
      // seguridad usan esta marca para saber qué falta por imprimir. Best-effort.
      try {
        var sb2 = window._pos && window._pos.sb;
        if (sb2) await sb2.from('pos_orders').update({ printed_at: new Date().toISOString() }).eq('id', orderId);
      } catch(e) { console.warn('[posprint] printed_at update:', e); }
    }
  };

  window.posOpenPrintModal = function(orderId) {
    var ex = document.getElementById('pos-print-modal-wrap');
    if (ex) ex.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pos-print-modal-wrap';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9900;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    var SVG_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:330px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.2)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px"><div style="font-weight:700;font-size:15px;color:#0F172A">Imprimir</div>'
      + '<button onclick="document.getElementById(\'pos-print-modal-wrap\').remove()" style="border:none;background:#F1F5F9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748B;display:flex;align-items:center;justify-content:center">' + SVG_X + '</button></div>'
      + '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<button onclick="posPrintAction(\'comanda\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Reimprimir comanda</div><div style="font-size:11px;color:#64748B">Ticket de cocina</div></div></button>'
      + '<button onclick="posPrintAction(\'recibo\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Recibo del cliente</div><div style="font-size:11px;color:#64748B">Con precios, dirección y datos</div></div></button>'
      + '</div></div>';
    document.body.appendChild(overlay);
  };

  window.posPrintAction = async function(type, orderId) {
    var overlay = document.getElementById('pos-print-modal-wrap');
    if (overlay) overlay.remove();
    // Sin impresora local (tablet/celular): mandar la SEÑAL de reimpresión al
    // equipo de la caja — su receptor global la recibe al instante y la imprime.
    if (!window.electronPOS && type === 'comanda' && orderId) {
      try {
        var sbT = window._pos && window._pos.sb;
        if (sbT) {
          await sbT.from('pos_orders').update({ reprint_at: new Date().toISOString() }).eq('id', orderId);
          _diagToast('🖨 Enviado a la caja para imprimir', '#1d4ed8');
          return;
        }
      } catch(e) { console.warn('[posprint] señal reimpresión:', e); }
    }
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return; }
    var order = await _fetchOrder(orderId);
    if (!order) { _noprinterToast(); return; }
    var items = (order.pos_order_items || []).map(function(it) {
      var sel = it.selections || {};
      var modsArr = Object.values(sel.mods || {}).map(function(m){ return m.name || String(m); });
      return { name: it.product_name || it.name || 'Item', qty: it.quantity || 1, note: it.note || '', mods: modsArr, total: (it.unit_price || 0) * (it.quantity || 1) };
    });
    var orderData = { table: _tableDisplay(order), channel: order.channel, id: order.id, total: order.total || 0, paid: order.paid_amount || 0, subtotal: order.subtotal || order.total || 0, packaging_fee: order.packaging_fee || 0, delivery_fee: order.delivery_fee || 0, discount: order.discount_amount || 0, tip: order.tip_amount || 0, guests: order.guests || order.persons || 0, waiter: order.waiter_name || '', sala: order.floor_name || order.zone_name || '', notes: order.notes || '', customer_name: order.customer_name || '', payment_method: order.payment_method || '' };
    var html;
    if (type === 'comanda') html = _buildComanda(orderData, items);
    else if (type === 'recibo') {
      var ch = String(order.channel||'').toLowerCase();
      if (ch === 'domicilio' || ch === 'rapido') {
        // Info del negocio para el encabezado del recibo
        var branch = {};
        try {
          var sb2 = window._pos && window._pos.sb;
          var bid = order.branch_id || (window._pos.state && window._pos.state.branchId);
          if (sb2 && bid) {
            var br = await sb2.from('branches').select('name,address,phone,brand_id').eq('id', bid).maybeSingle();
            if (br && br.data) {
              branch = br.data;
              if (branch.brand_id) { var bd = await sb2.from('brands').select('name').eq('id', branch.brand_id).maybeSingle(); if (bd && bd.data) branch.brand_name = bd.data.name; }
            }
          }
        } catch(e) {}
        html = _buildReceiptDomicilio(orderData, items, branch);
      } else {
        var payments = [];
        try {
          var sb = window._pos && window._pos.sb;
          if (sb && orderId) { var pr = await sb.from('pos_payments').select('*').eq('order_id', orderId); payments = (pr && pr.data) ? pr.data : []; }
        } catch(e) {}
        html = _buildReceiptFinal(orderData, items, payments);
      }
    }
    if (html) _printHtml(html, type === 'comanda' ? 'comanda' : 'recibo');
  };

})();