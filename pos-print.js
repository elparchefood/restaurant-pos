// pos-print.js — Sistema compartido de impresion (C5, C6, C8)
// Modal de impresion con 3 opciones + comanda auto al enviar a cocina
// RF4: un solo lugar, reutilizable desde tomar-pedido y pagos
(function() {
  'use strict';

  var MODELS_KEY = 'pos.config.recibos.v1';

  function _buildComanda(order, items) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    var dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    var rows = (items || []).map(function(it) {
      var mods = (it.mods && it.mods.length) ? '<div style="padding-left:22px;font-size:11px;color:#555;margin-bottom:2px">+ ' + it.mods.join(', ') + '</div>' : '';
      var note = it.note ? '<div style="padding-left:22px;font-size:11px;font-style:italic;color:#888;margin-bottom:2px">&#8618; ' + it.note + '</div>' : '';
      return '<div style="display:flex;padding:5px 0;border-bottom:1px solid #eee"><span style="font-weight:700;width:22px;flex-shrink:0">' + (it.qty || 1) + 'x</span><span style="flex:1">' + (it.name || 'Item') + '</span></div>' + mods + note;
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;width:80mm;max-width:80mm;margin:0;padding:10px}*{box-sizing:border-box}</style></head><body>'
      + '<div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px"><div style="font-size:18px;font-weight:bold;letter-spacing:2px">COMANDA</div><div style="font-size:11px;color:#555;margin-top:4px">' + dateStr + ' - ' + timeStr + '</div></div>'
      + '<div style="font-size:15px;font-weight:bold;margin-bottom:4px">Mesa: ' + (order.table || '-') + '</div>'
      + (order.channel ? '<div style="display:inline-block;background:#000;color:#fff;padding:2px 10px;font-size:12px;margin-bottom:8px">' + order.channel.toUpperCase() + '</div>' : '')
      + '<div style="margin-top:6px">' + rows + '</div>'
      + '<div style="text-align:center;font-size:10px;color:#888;margin-top:12px;border-top:1px dashed #000;padding-top:8px">** FIN COMANDA **</div>'
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
      + '<div style="text-align:center;font-size:10px;color:#888;margin-top:12px;border-top:1px dashed #000;padding-top:6px">Gracias por su preferencia</div>'
      + '</body></html>';
  }

  function _printHtml(html) {
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
      var r = await sb.from('pos_orders').select('*, pos_order_items(*)').eq('id', orderId).maybeSingle();
      return (r && r.data) ? r.data : null;
    } catch(e) { console.warn('[posprint] fetch:', e); return null; }
  }

  window.posAutoprint = async function(orderId) {
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return; }
    var order = await _fetchOrder(orderId);
    if (!order) return;
    var items = (order.pos_order_items || []).map(function(it) {
      return { name: it.product_name || it.name || 'Item', qty: it.quantity || 1, note: it.note || '', mods: Array.isArray(it.mods) ? it.mods : [] };
    });
    _printHtml(_buildComanda({ table: order.table_id || order.table_name || '-', channel: order.channel }, items));
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
      + '<button onclick="posPrintAction(\'desc\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Recibo con descripcion</div><div style="font-size:11px;color:#64748B">Productos y precios detallados</div></div></button>'
      + '<button onclick="posPrintAction(\'final\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#FFFBEB;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Recibo final con cuenta</div><div style="font-size:11px;color:#64748B">Cuenta exacta y formas de pago</div></div></button>'
      + '</div></div>';
    document.body.appendChild(overlay);
  };

  window.posPrintAction = async function(type, orderId) {
    var overlay = document.getElementById('pos-print-modal-wrap');
    if (overlay) overlay.remove();
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return; }
    var order = await _fetchOrder(orderId);
    if (!order) { _noprinterToast(); return; }
    var items = (order.pos_order_items || []).map(function(it) {
      return { name: it.product_name || it.name || 'Item', qty: it.quantity || 1, note: it.note || '', mods: Array.isArray(it.mods) ? it.mods : [], total: (it.unit_price || 0) * (it.quantity || 1) };
    });
    var orderData = { table: order.table_id || order.table_name || '-', channel: order.channel, total: order.total || 0, subtotal: order.subtotal || order.total || 0, discount: order.discount_amount || 0, tip: order.tip_amount || 0 };
    var html;
    if (type === 'comanda') html = _buildComanda(orderData, items);
    else if (type === 'desc') html = _buildReceiptDesc(orderData, items);
    else if (type === 'final') {
      var payments = [];
      try {
        var sb = window._pos && window._pos.sb;
        if (sb && orderId) { var pr = await sb.from('pos_payments').select('*').eq('order_id', orderId); payments = (pr && pr.data) ? pr.data : []; }
      } catch(e) {}
      html = _buildReceiptFinal(orderData, items, payments);
    }
    if (html) _printHtml(html);
  };

})();