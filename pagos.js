/* pagos.js — Módulo de cobro de mesa · Cobra POS */
/* REGLA: nada hardcodeado. Todo dato viene de Supabase. */

// ── Estado ────────────────────────────────────────────────────────────────
const SP = {
  userId: null, tenantId: null, branchId: null,
  waiterName: '—', userRole: '—',
  orderId: null, tableId: null,
  order: null, table: null,
  items: [],      // [{id, name, qty, unitPrice, catName, catColor}]
  cliente: '',
  method: 'efectivo',
  methodDefs: [],  // métodos configurados (de ia_config.pagos)
  entry: 0,
  payments: [],   // [{id, method, amount, received}]
  // Propina (nuevo modelo configurable)
  propinaActiva: true,       // ¿el restaurante recibe propina? (de config)
  propinaPcts: [10],         // porcentajes sugeridos (de config)
  tipOn: true,               // ¿la propina está incluida en este cobro?
  tipMode: 'pct',            // 'pct' | 'fijo'
  tipPct: 10,                // porcentaje elegido
  tipFixed: 0,               // cantidad fija elegida
  adelantado: false,
  discount: 0,
  empaque: 0,          // costo de empaque (siempre se cobra al cliente)
  domicilio: 0,        // valor del domicilio (delivery_fee)
  cobrarDomicilio: false, // si true, se suma el domicilio al total a cobrar
  channel: 'salon',
};

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-CO');

const METHOD_META = {
  efectivo:      { label: 'Efectivo',      hint: 'Monto recibido del cliente',        color: 'var(--cash)',     tint: 'var(--cash-tint)',     ring: 'var(--cash-ring)' },
  tarjeta:       { label: 'Tarjeta',       hint: 'Monto a registrar para tarjeta',    color: 'var(--card)',     tint: 'var(--card-tint)',     ring: 'var(--card-ring)' },
  transferencia: { label: 'Transferencia', hint: 'Monto a registrar para transferencia', color: 'var(--transfer)', tint: 'var(--transfer-tint)', ring: 'var(--transfer-ring)' },
  nequi:         { label: 'Nequi / QR',    hint: 'Monto a registrar para Nequi',      color: 'var(--qr)',       tint: 'var(--qr-tint)',       ring: 'var(--qr-ring)' },
};

const METHOD_ICONS = {
  efectivo:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  tarjeta:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  transferencia: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  nequi:         `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/></svg>`,
};

const APPLIED_ICONS = {
  efectivo:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  tarjeta:       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  transferencia: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  nequi:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/></svg>`,
};

// ── Métodos de pago configurados (fuente: ia_config.pagos) ──────────────────
// Estilo visual por TIPO, reusando la paleta existente. cssKey mapea al
// data-method que ya conocen los estilos (efectivo/tarjeta/transferencia/nequi).
const TIPO_STYLE = {
  efectivo:      { cssKey:'efectivo',      icon: METHOD_ICONS.efectivo,      color:'var(--cash)',     tint:'var(--cash-tint)',     ring:'var(--cash-ring)',     sub:'Billetes y monedas' },
  tarjeta:       { cssKey:'tarjeta',       icon: METHOD_ICONS.tarjeta,       color:'var(--card)',     tint:'var(--card-tint)',     ring:'var(--card-ring)',     sub:'Débito o crédito' },
  transferencia: { cssKey:'transferencia', icon: METHOD_ICONS.transferencia, color:'var(--transfer)', tint:'var(--transfer-tint)', ring:'var(--transfer-ring)', sub:'PSE · bancos' },
  banco:         { cssKey:'transferencia', icon: METHOD_ICONS.transferencia, color:'var(--transfer)', tint:'var(--transfer-tint)', ring:'var(--transfer-ring)', sub:'Cuenta bancaria' },
  billetera:     { cssKey:'nequi',         icon: METHOD_ICONS.nequi,         color:'var(--qr)',       tint:'var(--qr-tint)',       ring:'var(--qr-ring)',       sub:'Billetera digital' },
  otro:          { cssKey:'efectivo',      icon: METHOD_ICONS.efectivo,      color:'var(--cash)',     tint:'var(--cash-tint)',     ring:'var(--cash-ring)',     sub:'' },
  // Puntos: método propio, para que se distinga de un pago en dinero.
  puntos:        { cssKey:'puntos',      icon: '⭐',                    color:'#7C3AED',         tint:'#F5F3FF',              ring:'#DDD6FE',              sub:'Canje del catálogo' },
  // Saldo: tampoco entra plata nueva — el cliente ya pagó al recargar.
  saldo:         { cssKey:'saldo',      icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><rect x="5" y="9.5" width="4.5" height="3.5" rx="1"/><path d="M15.5 10a3.2 3.2 0 0 1 0 4"/><path d="M18 8.4a6 6 0 0 1 0 7.2"/></svg>`, color:'#0891B2', tint:'#ECFEFF', ring:'#A5F3FC', sub:'Recargado en la página' },
};
function _payEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _payAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _payDef(){ return (SP.methodDefs||[]).find(function(m){ return m.key===SP.method; }) || (SP.methodDefs||[])[0] || { nombre:'Efectivo', tipo:'efectivo', key:'efectivo' }; }
function _esEfectivo(){ var d=(SP.methodDefs||[]).find(function(m){ return m.key===SP.method; }); return d ? d.tipo==='efectivo' : SP.method==='efectivo'; }

/* Aplica una lista de metodos a la pantalla. SINCRONO a proposito: es lo que
   permite pintar al instante desde el cache del equipo, sin esperar la red. */
function _mpAplicarLista(metodos){
  SP.metodosCrudos = metodos || SP.metodosCrudos || [];   // para repintar al saber el plan
  var canal = SP.channel==='domicilio' ? 'domicilio' : (SP.channel==='rapido' ? 'rapida' : 'mesa');
  var list = (metodos||[]).filter(function(m){ return m && String(m.nombre||'').trim() && m.activo!==false; });
  /* Lo que el plan no incluye ni se ofrece. Va ANTES del filtro de canales
     para que el "si no queda ninguno, efectivo" de abajo siga cubriendo el
     caso de un restaurante cuyos unicos metodos fueran de un plan superior. */
  list = list.filter(function(m){
    if ((m.tipo||'') === 'puntos') return _pgHayPuntos();
    if ((m.tipo||'') === 'saldo')  return _pgHaySaldo();
    return true;
  });
  list = list.filter(function(m){ return !Array.isArray(m.canales) || !m.canales.length || m.canales.indexOf(canal)>=0; });
  if (!list.length) list = [{ id:'efectivo', nombre:'Efectivo', tipo:'efectivo', digital:false }];
  list.sort(function(a,b){ return (a.orden||0)-(b.orden||0); });
  /* El saldo se llamaba "Saldo <negocio>" y ahora es "Billetera <negocio>".
     Se corrige al pintar y no solo en Configuracion, para que el cajero vea el
     nombre nuevo desde ya, sin esperar a que alguien vuelva a guardar la
     pantalla de metodos de pago. El tipo interno sigue siendo `saldo`. */
  SP.methodDefs = list.map(function(m){
    var nom = String(m.nombre||'');
    if ((m.tipo||'') === 'saldo') nom = nom.replace(/^Saldo\b/i, 'Billetera');
    return { key:(m.id||m.nombre), nombre:nom, tipo:m.tipo||'otro', digital:!!m.digital };
  });
  /* Si el cajero ya habia elegido uno y sigue existiendo, se respeta: el
     repintado fresco no le puede quitar la seleccion de las manos. */
  var sigue = SP.method && SP.methodDefs.some(function(m){ return m.key===SP.method; });
  if (!sigue) {
    var def = list.find(function(m){ return m.porDefecto; }) || list[0];
    SP.method = (def.id||def.nombre);
  }
  _renderMethodButtons();
  return list;
}

async function loadPaymentMethods(){
  var metodos = [];
  try {
    if (SP.branchId) {
      var r = await sb.from('ia_config').select('pagos').eq('branch_id', SP.branchId).maybeSingle();
      var p = (r && r.data && r.data.pagos) || {};
      metodos = Array.isArray(p.metodos) ? p.metodos : [];
    }
  } catch(e){ console.warn('loadPaymentMethods:', e); }
  /* Se guardan para la PROXIMA apertura: es lo que hace instantaneo el proximo
     arranque. Con la red caida, lo guardado sigue sirviendo. */
  try { if (window.posCache && metodos.length) posCache.guardar('pagos.metodos', metodos); } catch(e){}
  _mpAplicarLista(metodos);

  /* Lo que SI necesita red: cuanto saldo y cuantos puntos tiene el cliente.
     Llega un instante despues y solo refresca los subtitulos. */
  var _st = (window._pos && window._pos.state) || {};
  SP.puntosSaldo = 0; SP.saldoDisp = 0;
  SP.saldoActivo = SP.methodDefs.some(function (m) { return m.tipo === 'saldo'; });
  try {
    if (window.posPuntos && SP.methodDefs.some(function (m) { return m.tipo === 'puntos'; })) {
      posPuntos.setCtx(_st.tenantId || SP.tenantId, SP.branchId);
      await posPuntos.cargar();
      SP.puntosSaldo = SP.clienteTel ? await posPuntos.disponibles(SP.clienteTel) : 0;
      /* Los puntos sin catálogo no sirven para nada: no hay qué canjear. */
      if (!posPuntos.hayCatalogo()) {
        SP.methodDefs = SP.methodDefs.filter(function (m) { return m.tipo !== 'puntos'; });
      }
    }
  } catch (e) { console.warn('[pagos] puntos no disponibles:', e); }
  try {
    if (window.posSaldo && SP.methodDefs.some(function (m) { return m.tipo === 'saldo'; })) {
      posSaldo.setCtx(_st.tenantId || SP.tenantId, SP.branchId);
      SP.saldoDisp = SP.clienteId ? await posSaldo.disponibles(SP.clienteId) : 0;
    }
  } catch (e) { console.warn('[pagos] saldo no disponible:', e); }
  _renderMethodButtons();
  /* El saldo llega un instante despues que el nombre, asi que el nombre se
     repinta cuando ya se sabe cuanto tiene. */
  try { pgPintarCliente(); } catch (e) {}
}
function _renderMethodButtons(){
  var row = document.querySelector('.pg-method-row');
  if(!row) return;
  row.innerHTML = (SP.methodDefs||[]).map(function(m){
    var st = TIPO_STYLE[m.tipo] || TIPO_STYLE.otro;
    /* Debajo del nombre, lo que de verdad importa decidir: cuánto tiene. Sin
       cliente identificado se dice eso mismo, que es lo que falta. */
    var sub = st.sub;
    if (m.tipo === 'saldo') {
      sub = !SP.clienteId ? 'Falta identificar al cliente'
          : (SP.saldoDisp > 0 ? 'Tiene ' + _payMoney(SP.saldoDisp) : 'Sin saldo');
    } else if (m.tipo === 'puntos') {
      sub = !SP.clienteTel ? 'Falta identificar al cliente'
          : (SP.puntosSaldo > 0 ? 'Tiene ' + Number(SP.puntosSaldo).toLocaleString('es-CO') + ' pts' : 'Sin puntos');
    }
    return '<button class="lm-method'+(m.key===SP.method?' is-active':'')+'" data-method="'+_payAttr(m.key)+'" data-tipo="'+_payAttr(st.cssKey||'efectivo')+'">'
      +'<span class="pg-method-icon">'+st.icon+'</span>'
      +'<span class="pg-method-txt"><span class="pg-method-label">'+_payEsc(m.nombre)+'</span><span class="pg-method-sub">'+_payEsc(sub)+'</span></span>'
      +'<span class="pg-method-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'
      +'</button>';
  }).join('');
}

const CAT_PALETTE = ['#5B6BFF','#8B5CF6','#EC4899','#F59E0B','#10B981','#0EA5E9','#EF4444','#14B8A6'];
function catColorFor(id) {
  if (!id) return CAT_PALETTE[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return CAT_PALETTE[Math.abs(h) % CAT_PALETTE.length];
}

// ── Propina ───────────────────────────────────────────────────────────────
// Lee la configuración de "Impuestos y propina" (mismo blob que Operación).
function tipLoadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
    SP.propinaActiva = cfg.propinaActiva !== false;   // por defecto sí recibe
    SP.propinaPcts   = (Array.isArray(cfg.propinaPorcentajes) && cfg.propinaPorcentajes.length)
      ? cfg.propinaPorcentajes.slice() : [10];
    SP.tipMode = cfg.propinaModoDefault === 'fijo' ? 'fijo' : 'pct';
    SP.tipPct  = SP.propinaPcts[0] || 10;             // precarga el primer sugerido
    SP.tipFixed = 0;
    // La propina llega ENCENDIDA por defecto (si el restaurante la recibe).
    SP.tipOn = SP.propinaActiva;
  } catch (e) {
    SP.propinaActiva = true; SP.propinaPcts = [10]; SP.tipMode = 'pct'; SP.tipPct = 10; SP.tipFixed = 0; SP.tipOn = true;
  }
}

function tipCalc(subtotal) {
  if (!SP.propinaActiva || !SP.tipOn) return 0;
  if (SP.tipMode === 'fijo') return Math.max(0, Math.round(Number(SP.tipFixed) || 0));
  return Math.round(subtotal * (Number(SP.tipPct) || 0) / 100);
}

function renderTip(subtotal, tipAmt) {
  const block = document.getElementById('tip-block');
  if (!block) return;
  // Si el restaurante no recibe propina, no se muestra nada.
  if (!SP.propinaActiva) { block.hidden = true; return; }
  block.hidden = false;

  const on = SP.tipOn;
  // Interruptor
  const sw = document.getElementById('tip-switch');
  if (sw) {
    sw.classList.toggle('is-on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    const lbl = document.getElementById('tip-switch-lbl');
    if (lbl) lbl.textContent = on ? 'Incluida' : 'Sin propina';
  }
  // Cuerpo (porcentajes / fijo) solo si está incluida
  const body = document.getElementById('tip-body');
  if (body) body.style.opacity = on ? '1' : '.4';
  document.querySelectorAll('#tip-body button, #tip-fixed-input').forEach(el => { el.disabled = !on; });

  // Botones de porcentaje (+ "Otro")
  const pctsEl = document.getElementById('tip-pcts');
  if (pctsEl) {
    let html = (SP.propinaPcts || []).map(p =>
      `<button class="pg-tip-pct${(SP.tipMode==='pct' && Number(SP.tipPct)===Number(p))?' is-on':''}" data-tippct="${p}" type="button">${p}%</button>`
    ).join('');
    html += `<button class="pg-tip-pct pg-tip-other${_tipCustomOpen?' is-on':''}" data-tipother="1" type="button">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg> Otro</button>`;
    if (_tipCustomOpen) {
      html += `<span class="pg-tip-customwrap"><input id="tip-custom-input" type="tel" inputmode="numeric" value="${Number(SP.tipPct)||''}" aria-label="Otro porcentaje"><span>%</span></span>`;
    }
    pctsEl.innerHTML = html;
    pctsEl.hidden = (SP.tipMode === 'fijo');
    if (_tipCustomOpen) { const ci = document.getElementById('tip-custom-input'); if (ci && document.activeElement !== ci) ci.focus(); }
  }

  // Campo de cantidad fija
  const fixedWrap = document.getElementById('tip-fixed-wrap');
  if (fixedWrap) {
    fixedWrap.hidden = (SP.tipMode !== 'fijo');
    const fi = document.getElementById('tip-fixed-input');
    if (fi && document.activeElement !== fi) fi.value = Math.round(Number(SP.tipFixed) || 0);
  }

  // Segmento % / $ fijo
  const seg = document.getElementById('tip-modeseg');
  if (seg) seg.querySelectorAll('[data-tipmode]').forEach(b =>
    b.classList.toggle('is-on', b.dataset.tipmode === SP.tipMode));

  // Monto
  const amtEl = document.getElementById('tip-amt');
  if (amtEl) amtEl.textContent = (on && tipAmt > 0) ? '+ ' + fmt(tipAmt) : '$0';
}
var _tipCustomOpen = false;

// ── Cálculos ──────────────────────────────────────────────────────────────
function calc() {
  /* Lo canjeado con puntos NO es venta.
     Regla de Sergio: "300 puntos no es igual a 8.000 pesos... en las ventas no
     se suma lo que no entró". El producto se entrega y descuenta inventario,
     pero su precio sale del total: si se cobrara como un pago de $8.000, la
     venta del día quedaría inflada con plata que nunca llegó a la caja. */
  const canjeIds = (SP.canje && SP.canje.itemIds) || [];
  /* CANJE MIXTO: si el premio es "200 puntos + $10.000", esos $10.000 los paga
     el cliente de verdad, así que SÍ son venta. Solo sale del total la
     diferencia. Sin esto la caja quedaría corta justo por la plata que entró. */
  const canjeDinero = Number(SP.canje && SP.canje.dinero) || 0;
  const subtotal = SP.items.reduce((s, i) =>
    s + (canjeIds.indexOf(i.id) >= 0 ? 0 : i.qty * i.unitPrice), 0) + canjeDinero;
  const canjeValor = Math.max(0, SP.items.reduce((s, i) =>
    s + (canjeIds.indexOf(i.id) >= 0 ? i.qty * i.unitPrice : 0), 0) - canjeDinero);
  const empaque  = Number(SP.empaque) || 0;                       // siempre se cobra
  const domi     = SP.cobrarDomicilio ? (Number(SP.domicilio) || 0) : 0; // opcional
  const tipAmt   = tipCalc(subtotal);                             // propina solo sobre productos
  const total    = Math.max(0, subtotal + empaque + domi + tipAmt - SP.discount);
  const paid     = SP.payments.reduce((s, p) => s + p.amount, 0);
  const falta    = Math.max(0, total - paid);
  // Vuelto ya "guardado" en los pagos aplicados: por cada pago en efectivo,
  // lo recibido por encima de lo que cubría (received - amount). Antes esto se
  // perdía al aplicar el pago (el vuelto se veía al escribir y desaparecía). #5
  const vueltoGuardado = SP.payments.reduce((s, p) => s + Math.max(0, (p.received || p.amount) - p.amount), 0);
  const vuelto   = _esEfectivo()
    ? vueltoGuardado + Math.max(0, SP.entry - falta)   // exceso ya guardado + lo que se está digitando de más
    : vueltoGuardado + Math.max(0, paid - total);
  /* Un pedido cubierto entero con puntos (o con un descuento del 100%) deja
     el total en 0. Con `total > 0` el boton de Finalizar quedaba bloqueado
     para siempre y la venta no se podia cerrar: le paso a Sandra el 24-ago
     pagando una salsa de $2.000 con 100 puntos.
     Lo que NO se debe poder cerrar es una cuenta VACIA, asi que la condicion
     pasa a ser "hay algo que cobrar" en vez de "el total es mayor que cero". */
  const hayAlgo  = (SP.items && SP.items.length > 0) || total > 0;
  const cubierto = hayAlgo && paid >= total;
  return { subtotal, empaque, domi, tipAmt, total, paid, falta, vuelto, cubierto, canjeValor };
}

// Calcula el empaque desde la config de Operación (mismo criterio que domicilios.js).
// Se usa solo si la orden no trae ya packaging_fee guardado (p. ej. pedidos del bot).
function computeEmpaquePagos(prodTotal, units, esDomicilio) {
  // Motor central (pos-core): soporta modo específico por categoría/producto
  if (window.posEmpaqueCalc) {
    return window.posEmpaqueCalc((SP.items || []).map(i => ({ productId: i.productId, catId: i.catId, qty: i.qty, unitPrice: i.unitPrice })), { domicilio: !!esDomicilio });
  }
  try {
    const cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
    if (!cfg.empaquesActivo || prodTotal <= 0) return 0;
    const usaDomi = (cfg.empaqueCanal === 'distinto') && esDomicilio;
    const esPct   = cfg.empaqueTipo === 'porcentaje';
    const rate = esPct
      ? (usaDomi ? (cfg.empaquePctDomicilio || 0) : (cfg.empaquePct || 0))
      : (usaDomi ? (cfg.empaqueMontoDomicilio || 0) : (cfg.empaqueMonto || 0));
    if (cfg.empaqueBase === 'pedido') return esPct ? Math.round(prodTotal * rate / 100) : rate;
    return esPct ? Math.round(prodTotal * rate / 100) : rate * units;
  } catch (e) { return 0; }
}

// ── Render ────────────────────────────────────────────────────────────────
function renderItems() {
  const scroll = document.getElementById('ticket-scroll');
  const total = SP.items.reduce((s, i) => s + i.qty, 0);
  document.getElementById('items-count').textContent = total + ' ítem' + (total !== 1 ? 's' : '');

  const listHead = scroll.querySelector('.pg-ticket-listhead');
  // Limpiar ítems anteriores
  scroll.querySelectorAll('.pg-tline').forEach(el => el.remove());

  if (!SP.items.length) {
    scroll.insertAdjacentHTML('beforeend', '<div style="padding:20px 4px;color:var(--muted);font-size:12px;">Sin ítems en esta orden.</div>');
    return;
  }

  SP.items.forEach(it => {
    const line = document.createElement('div');
    line.className = 'pg-tline';
    line.innerHTML = `
      <span class="pg-tline-qty">${it.qty}</span>
      <div class="pg-tline-body">
        <div class="pg-tline-name">${it.name}</div>
        <div class="pg-tline-meta"><span class="dot" style="background:${it.catColor}"></span><span class="txt">${it.catName ? it.catName + ' · ' : ''}${fmt(it.unitPrice)}</span></div>
      </div>
      <span class="pg-tline-total">${fmt(it.qty * it.unitPrice)}</span>`;
    scroll.appendChild(line);
  });
}

function renderTotals() {
  const { subtotal, empaque, domi, tipAmt, total, paid, falta, vuelto, cubierto, canjeValor } = calc();
  const cobro = document.getElementById('cobro');

  document.getElementById('t-subtotal').textContent = fmt(subtotal);
  document.getElementById('t-total').textContent    = fmt(total);
  document.getElementById('side-total').textContent = fmt(total);
  document.getElementById('exact-amt').textContent  = fmt(falta);

  // Empaque (siempre visible si hay costo de empaque)
  const empRow = document.getElementById('t-empaque-row');
  if (empRow) {
    if (empaque > 0) { empRow.hidden = false; document.getElementById('t-empaque').textContent = fmt(empaque); }
    else empRow.hidden = true;
  }

  // Domicilio — toggle para cobrarlo también al cliente (solo en domicilios)
  const domiRow = document.getElementById('t-domi-row');
  if (domiRow) {
    domiRow.hidden = (SP.channel !== 'domicilio');
    const domiToggle = document.getElementById('domi-toggle');
    if (domiToggle) domiToggle.classList.toggle('is-on', SP.cobrarDomicilio);
    const domiInput = document.getElementById('domi-input');
    if (domiInput && document.activeElement !== domiInput) domiInput.value = Math.round(Number(SP.domicilio) || 0);
  }

  // Descuento
  const discRow = document.getElementById('t-discount-row');
  if (SP.discount > 0) {
    discRow.hidden = false;
    document.getElementById('t-discount').textContent = '− ' + fmt(SP.discount);
    document.getElementById('discount-flag').hidden = false;
    document.querySelector('[data-action="discount"]').classList.add('is-active');
  } else {
    discRow.hidden = true;
    document.getElementById('discount-flag').hidden = true;
    document.querySelector('[data-action="discount"]').classList.remove('is-active');
  }

  // Puntos que ganaria el cliente con este pedido (todavia no cobrado)
  // Canje: los productos pagados con puntos salen del total
  ptRenderCanje(canjeValor);

  pgPuntosPreview(subtotal, empaque);

  // Propina (bloque completo)
  renderTip(subtotal, tipAmt);

  // Falta / cuenta cubierta
  if (cubierto) {
    cobro.classList.add('is-covered');
    document.getElementById('falta-label').textContent = 'Cuenta cubierta';
    document.getElementById('falta-value').textContent = fmt(0);
  } else {
    cobro.classList.remove('is-covered');
    document.getElementById('falta-label').textContent = 'Falta por pagar';
    document.getElementById('falta-value').textContent = fmt(falta);
  }

  // Monto en captura
  const amtCard = document.getElementById('amount-card');
  amtCard.classList.toggle('has-value', SP.entry > 0);
  document.getElementById('amount-value').textContent = fmt(SP.entry);

  // Vuelto card (solo efectivo)
  const vueltoCard = document.getElementById('vuelto-card');
  if (_esEfectivo() && vuelto > 0) {
    vueltoCard.hidden = false;
    document.getElementById('vuelto-card-amt').textContent = fmt(vuelto);
  } else {
    vueltoCard.hidden = true;
  }

  // Botón exacto
  const btnExact = document.getElementById('btn-exact');
  btnExact.disabled = falta === 0;

  ptRenderVerificar();

  // Botón agregar pago
  const btnApply = document.getElementById('btn-apply');
  /* Con PUNTOS no se digita un valor: el monto sale de los productos que se
     elijan en el modal. Si se exigiera `SP.entry > 0` el botón quedaría
     bloqueado para siempre y el método no se podría usar. */
  const esPuntos = _ptEsPuntos();
  const canApply = (esPuntos ? true : SP.entry > 0) && !cubierto;
  btnApply.disabled = !canApply;
  const toAdd = _esEfectivo() ? Math.min(SP.entry, falta) : SP.entry;
  document.getElementById('apply-label').textContent = !canApply
    ? 'Agregar pago'
    : esPuntos ? 'Elegir productos a canjear'
    : 'Agregar pago · ' + fmt(toAdd);

  // Pie cobro
  document.getElementById('foot-paid').textContent = fmt(paid);
  const footFalta = document.getElementById('foot-falta');
  footFalta.textContent = fmt(falta);
  footFalta.className = 'pg-foot-value ' + (falta > 0 ? 'is-falta' : 'is-zero');
  const footVuelto = document.getElementById('foot-vuelto');
  footVuelto.textContent = fmt(vuelto);
  footVuelto.className = 'pg-foot-value ' + (vuelto > 0 ? 'is-vuelto' : 'is-muted');

  // Botón finalizar
  const btnFinish = document.getElementById('btn-finish');
  btnFinish.disabled = !cubierto;

  // Botón guardar abono: activo solo si hay pagos NUEVOS sin guardar y aún falta
  const btnAbono = document.getElementById('btn-abono');
  if (btnAbono) btnAbono.disabled = !(SP.payments.some(p => !p.saved) && falta > 0);

  // Split: mostrar importe de la parte actual en botón Exacto
  if (SP.splitObj && typeof calcSplitInfo === 'function') {
    const info = calcSplitInfo();
    if (info) {
      const eAmt = document.getElementById('exact-amt');
      if (eAmt) eAmt.textContent = fmt(info.partRemaining);
      const bEx = document.getElementById('btn-exact');
      if (bEx) bEx.disabled = info.partRemaining === 0;
    }
  }
}

function renderApplied() {
  const list  = document.getElementById('applied-list');
  const empty = document.getElementById('applied-empty');

  const btnView = document.getElementById('btn-view-payments');
  if (!SP.payments.length) {
    empty.hidden   = false;
    list.hidden    = true;
    if (btnView) btnView.hidden = true;
    return;
  }
  empty.hidden = true;
  list.hidden  = false;
  if (btnView) {
    btnView.hidden = false;
    btnView.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Ver pagos (${SP.payments.length})`;
  }

  list.innerHTML = SP.payments.map(p => {
    const hasCambio = p.received > p.amount;
    const sub = p.saved
      ? 'Abono registrado'
      : hasCambio ? `Recibido ${fmt(p.received)} · vuelto ${fmt(p.received - p.amount)}` : '';
    const delBtn = p.saved ? '' : `
        <button class="lm-del" data-action="remove-payment" data-id="${p.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>`;
    const _st = TIPO_STYLE[p.methodTipo] || TIPO_STYLE[p.method] || TIPO_STYLE.otro;
    return `
      <div class="pg-applied-item" data-method="${_st.cssKey}">
        <span class="pg-applied-icon">${APPLIED_ICONS[_st.cssKey] || ''}</span>
        <div class="pg-applied-body">
          <div class="pg-applied-name">${METHOD_META[p.method]?.label || p.method}</div>
          ${sub ? `<div class="pg-applied-sub">${sub}</div>` : ''}
        </div>
        <span class="pg-applied-amt">${fmt(p.amount)}</span>${delBtn}
      </div>`;
  }).join('');
}

function renderMethodUI() {
  const def  = _payDef();
  const st   = TIPO_STYLE[def.tipo] || TIPO_STYLE.otro;
  const cobro = document.getElementById('cobro');
  cobro.dataset.method = st.cssKey;  // estilos CSS por tipo conocido

  // Botones método
  document.querySelectorAll('.lm-method').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.method === SP.method);
  });

  // Amount card colores
  const card = document.getElementById('amount-card');
  card.style.borderColor = st.ring;

  // Amount method label + chip
  const chip = document.getElementById('amount-chip');
  chip.innerHTML = st.icon || '';
  chip.style.background = st.tint;
  chip.style.color = st.color;
  const methodEl = document.getElementById('amount-method');
  methodEl.style.color = st.color;
  document.getElementById('amount-method-name').textContent = def.nombre;

  // Hint
  document.getElementById('amount-hint').textContent = (def.tipo==='efectivo')
    ? 'Monto recibido del cliente'
    : ('Monto a registrar para ' + def.nombre);
}

function renderAll() {
  renderMethodUI();
  renderTotals();
  renderApplied();
  if (typeof renderSplitStrip === 'function') renderSplitStrip();
}

// ══════════════ CRÉDITO COMO MÉTODO DE PAGO ══════════════
// El pedido queda PAGADO y la caja cuadra; la deuda pasa a la persona. Por eso
// el crédito se aplica como cualquier otro pago y no deja el pedido a medias.
// El consumo contra la base se hace al FINALIZAR (no al aplicar el pago), para
// que cancelar el cobro a medias no le deje deuda a nadie.
var _crPagoSel = null;   // { id, nombre, disponible }

function _crEsCredito() {
  var d = _payDef();
  return String(d && (d.tipo || d.key || d.nombre) || '').toLowerCase().indexOf('credito') >= 0
      || String(d && d.nombre || '').toLowerCase().indexOf('crédito') >= 0;
}

/* El aviso de "no le alcanza", con nombre y cifras. Antes eran tres alert()
   distintos del navegador que no decian de quien hablaban. */
function _sdAvisoSinSaldo(necesita, yaApuntado, disponible) {
  var tiene = (disponible != null) ? disponible : (Number(SP.saldoDisp) || 0);
  if (!window.posSaldo || !posSaldo.modalInsuficiente) {
    alert('Al cliente no le alcanza el saldo: tiene ' + _payMoney(tiene) + '.');
    return;
  }
  posSaldo.modalInsuficiente({
    nombre: SP.cliente || SP.clienteTel || '',
    tiene: tiene, necesita: necesita, yaApuntado: yaApuntado || 0,
  });
}

/* ── Pago con billetera: el codigo al celular ─────────────────────────
   Al tocar "Agregar pago" el codigo YA sale volando (plantilla → WhatsApp →
   SMS, el mismo canal del registro) y el modal queda esperando a que el
   cliente se lo dicte al cajero. Sin codigo valido no se apunta nada. */
var _SD_ACCESO = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/web-acceso';
async function _sdAcceso(cuerpo) {
  var tok = '';
  try { tok = (await sb.auth.getSession()).data.session.access_token; } catch (e) {}
  var r = await fetch(_SD_ACCESO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ pos_token: tok }, cuerpo)),
  });
  return r.json();
}
function _sdCobrarConCodigo(def, amount) {
  var tel = String(SP.clienteTel || '').replace(/[^0-9]/g, '').slice(-10);
  /* Con la TARJETA en el lector no se pide codigo: la tarjeta fisica es la
     prueba de que el dueNo esta presente. El codigo por SMS queda para quien
     paga solo con su numero. */
  if (SP.tarjetaTel && String(SP.tarjetaTel).replace(/[^0-9]/g, '').slice(-10) === tel) {
    SP.payments.push({ id: Date.now(), method: def.nombre, methodKey: def.key,
                       methodTipo: 'saldo', amount: amount, received: amount });
    SP.entry = 0;
    renderAll();
    return;
  }
  if (tel.length !== 10) {
    _sdModalBase('Falta el celular', '<div style="font-size:13px;color:#475569;line-height:1.55">La billetera está atada al celular del cliente y esta ficha no tiene uno válido. Corrige el teléfono del cliente y vuelve a intentar.</div>', null);
    return;
  }
  var oculto = '••• ' + tel.slice(-4);
  var cuerpo = ''
    + '<div style="font-size:13px;color:#475569;line-height:1.55;margin-bottom:12px">Le enviamos un código de 6 dígitos al celular <b>' + oculto + '</b>. Pídeselo al cliente: es la prueba de que la cuenta es suya.</div>'
    + '<input id="sdCod" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #ECEEF2;border-radius:10px;font-size:22px;letter-spacing:8px;text-align:center;font-family:inherit;font-variant-numeric:tabular-nums" oninput="this.value=this.value.replace(/[^0-9]/g,&quot;&quot;)">'
    + '<div id="sdCodErr" style="display:none;font-size:12.5px;color:#DC2626;margin-top:8px"></div>'
    + '<div id="sdCodEstado" style="font-size:12px;color:#94A3B8;margin-top:8px">Enviando el código…</div>';
  var ov = _sdModalBase('Confirmar pago con billetera', cuerpo, [
    { txt: 'Cancelar', ghost: true, fn: function () { ov.remove(); } },
    { txt: 'Reenviar código', ghost: true, id: 'sdReenviar', fn: function () { _sdMandarCodigo(ov, tel, amount); } },
    { txt: 'Confirmar ' + _payMoney(amount), id: 'sdConfirmar', fn: async function () {
        var inp = ov.querySelector('#sdCod');
        var cod = (inp.value || '').replace(/[^0-9]/g, '');
        var err = ov.querySelector('#sdCodErr');
        if (cod.length !== 6) { err.textContent = 'El código es de 6 dígitos.'; err.style.display = 'block'; return; }
        var btn = ov.querySelector('#sdConfirmar');
        btn.disabled = true; btn.textContent = 'Verificando…';
        var d = {};
        try { d = await _sdAcceso({ accion: 'pago-verificar', telefono: tel, codigo: cod }); }
        catch (e) { d = { ok: false, mensaje: 'Sin conexión con el servidor.' }; }
        if (!d.ok) {
          err.textContent = d.mensaje || 'No se pudo verificar.'; err.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Confirmar ' + _payMoney(amount);
          return;
        }
        ov.remove();
        SP.payments.push({ id: Date.now(), method: def.nombre, methodKey: def.key,
                           methodTipo: 'saldo', amount: amount, received: amount });
        SP.entry = 0;
        renderAll();
      } },
  ]);
  var inp0 = ov.querySelector('#sdCod'); if (inp0) inp0.focus();
  _sdMandarCodigo(ov, tel, amount);
}
async function _sdMandarCodigo(ov, tel, monto) {
  var est = ov.querySelector('#sdCodEstado');
  var re = ov.querySelector('#sdReenviar');
  if (re) re.disabled = true;
  if (est) { est.textContent = 'Enviando el código…'; est.style.color = '#94A3B8'; }
  var d = {};
  /* El monto viaja para que el mensaje diga "para pagar $ X": el cliente
     distingue un codigo de pago de uno de entrada con solo leerlo. */
  try { d = await _sdAcceso({ accion: 'pago-codigo', telefono: tel, monto: monto }); }
  catch (e) { d = { ok: false, mensaje: 'Sin conexión con el servidor.' }; }
  if (!ov.isConnected) return;   // el cajero ya cerro el modal
  if (d.ok) {
    if (est) { est.textContent = 'Código enviado. Vence en ' + (d.vence_en_min || 10) + ' minutos.'; est.style.color = '#16A34A'; }
    /* Reenviar se despierta a los 20 s: antes de eso el mensaje va en camino
       y reenviar solo gastaria el cupo del cliente. */
    setTimeout(function () { if (re && ov.isConnected) re.disabled = false; }, 20000);
  } else {
    if (est) { est.textContent = d.mensaje || 'No se pudo enviar el código.'; est.style.color = '#DC2626'; }
    if (re) re.disabled = false;
  }
}
function _sdModalBase(titulo, cuerpoHTML, botones) {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';
  var b = (botones || [{ txt: 'Entendido', fn: function () { ov.remove(); } }]).map(function (x, i) {
    return '<button data-sdb="' + i + '"' + (x.id ? ' id="' + x.id + '"' : '') + ' style="' + (x.ghost
      ? 'background:#fff;color:#475569;border:1px solid #ECEEF2'
      : 'background:#5B6BFF;color:#fff;border:none;box-shadow:0 2px 8px -2px rgba(91,107,255,.45)')
      + ';padding:10px 14px;border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">' + x.txt + '</button>';
  }).join('');
  ov.innerHTML = '<div style="background:#fff;border-radius:16px;width:400px;max-width:94vw;padding:20px 22px;box-shadow:0 30px 70px -20px rgba(15,23,42,.4);font-family:inherit">'
    + '<div style="font-size:15.5px;font-weight:800;color:#0F172A;letter-spacing:-.02em;margin-bottom:10px">' + titulo + '</div>'
    + cuerpoHTML
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">' + b + '</div>'
    + '</div>';
  (botones || [{ fn: function () { ov.remove(); } }]).forEach(function (x, i) {
    var el = ov.querySelector('[data-sdb="' + i + '"]');
    if (el) el.addEventListener('click', function () { x.fn(); });
  });
  document.body.appendChild(ov);
  return ov;
}

// Al tocar "Aplicar" con el método Crédito, primero hay que elegir a quién.
async function crElegirPersona(monto) {
  var lista = [];
  try { lista = await posCreditos.listar(); } catch (e) { alert('No se pudo cargar los créditos: ' + (e.message || e)); return null; }
  lista = lista.filter(function (c) { return c.activo; });
  if (!lista.length) {
    alert('Todavía no hay nadie con crédito. Un administrador puede asignarlo en Configuración → Créditos.');
    return null;
  }
  return new Promise(function (resolve) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';
    function filas(q) {
      var l = lista;
      if (q) l = l.filter(function (c) { return (c.nombre || '').toLowerCase().indexOf(q) >= 0; });
      if (!l.length) return '<div style="padding:24px;text-align:center;color:#94A3B8;font-size:12.5px">Nadie coincide</div>';
      return l.map(function (c) {
        var disp = Number(c.disponible) || 0;
        // Se ve a todos, pero el que no alcanza queda deshabilitado con el
        // motivo a la vista: es más claro que esconderlo.
        var alcanza = disp >= monto;
        return '<button class="cr-pick" data-id="' + c.id + '"' + (alcanza ? '' : ' disabled') + '>'
          + '<span class="cr-pick-l"><b>' + posCreditos.esc(c.nombre) + '</b>'
          + '<span>' + (c.tipo === 'empleado' ? 'Empleado' : 'Cliente')
          + (Number(c.saldo) > 0 ? ' · debe ' + posCreditos.money(c.saldo) : '') + '</span></span>'
          + '<span class="cr-pick-r ' + (alcanza ? 'ok' : 'bad') + '">' + posCreditos.money(disp)
          + '<span>' + (alcanza ? 'disponible' : 'no alcanza') + '</span></span></button>';
      }).join('');
    }
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:20px 22px;width:440px;max-width:94vw;font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35);max-height:88vh;display:flex;flex-direction:column">'
      + '<div style="font-size:15px;font-weight:800;color:#0F172A">¿A nombre de quién?</div>'
      + '<div style="font-size:12.5px;color:#64748B;margin:5px 0 12px;line-height:1.5">Se le van a cargar <b>' + posCreditos.money(monto) + '</b> a su crédito.</div>'
      + '<input id="cr-pick-q" class="iv-input" placeholder="Buscar…" style="width:100%;margin-bottom:10px">'
      + '<div id="cr-pick-list" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px">' + filas('') + '</div>'
      + '<button style="width:100%;margin-top:14px;padding:11px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer" id="cr-pick-cancel">Cancelar</button>'
      + '</div>';
    document.body.appendChild(ov);
    var listEl = ov.querySelector('#cr-pick-list');
    function bind() {
      listEl.querySelectorAll('.cr-pick').forEach(function (b) {
        b.onclick = function () {
          var c = lista.filter(function (x) { return x.id === b.dataset.id; })[0];
          ov.remove();
          resolve({ id: c.id, nombre: c.nombre, disponible: Number(c.disponible) || 0 });
        };
      });
    }
    bind();
    ov.querySelector('#cr-pick-q').oninput = function () {
      listEl.innerHTML = filas(this.value.toLowerCase().trim()); bind();
    };
    ov.querySelector('#cr-pick-cancel').onclick = function () { ov.remove(); resolve(null); };
    ov.onclick = function (e) { if (e.target === ov) { ov.remove(); resolve(null); } };
    setTimeout(function () { ov.querySelector('#cr-pick-q').focus(); }, 40);
  });
}

// ── Acciones ──────────────────────────────────────────────────────────────
async function applyPayment() {
  const { falta, total } = calc();
  if (_ptEsPuntos()) { if (falta <= 0) return; ptAplicarPuntos(); return; }
  if (SP.entry <= 0 || falta <= 0) return;
  const amount   = _esEfectivo() ? Math.min(SP.entry, falta) : SP.entry;
  const received = SP.entry;
  const def      = _payDef();

  // Crédito: hay que decir a nombre de QUIÉN queda la deuda. El cargo real se
  // hace al finalizar, no aquí: si se cancela el cobro a medias, nadie queda
  // debiendo algo que nunca se cobró.
  // Puntos: no se descuenta un valor suelto, se eligen los PRODUCTOS que se
  // pagan con puntos. El cargo real se hace al finalizar, igual que el crédito.
  if (_ptEsPuntos()) { ptAplicarPuntos(); return; }

  /* SALDO: se valida aquí y se apunta, pero NO se descuenta todavía. El
     descuento va al finalizar, igual que el crédito y los puntos: si el cobro
     se cae a medias, al cliente no le falta plata que nadie le cobró. */
  if (_sdEsSaldo()) {
    if (!SP.clienteId) {
      alert('Primero identifica al cliente: toca "Consumidor final" arriba del ticket.');
      return;
    }
    /* Lo ya apuntado cuenta: dos abonos con saldo no pueden sumar más de lo
       que tiene. Sin esto, el segundo lo rechazaría la base al finalizar, con
       el cliente ya en la puerta. */
    var _yaConSaldo = (SP.payments || []).reduce(function (t, p) {
      return t + (p.methodTipo === 'saldo' && !p.saved ? (Number(p.amount) || 0) : 0);
    }, 0);
    var _libre = Math.max(0, (Number(SP.saldoDisp) || 0) - _yaConSaldo);
    if (_libre <= 0 || amount > _libre) {
      _sdAvisoSinSaldo(amount, _yaConSaldo);
      return;
    }
    /* DAR EL NUMERO NO BASTA (20-ago-2026, decision de Sergio): antes de
       apuntar el pago se le manda un codigo al celular del dueNo de la cuenta
       y el pago solo entra con ese codigo en la mano. Quien no tenga el
       celular del cliente, no gasta su plata. */
    _sdCobrarConCodigo(def, amount);
    return;
  }

  if (_crEsCredito()) {
    if (!window.posCreditos) { alert('El módulo de créditos no está disponible.'); return; }
    const st = (window._pos && window._pos.state) || {};
    posCreditos.setCtx(st.tenantId, SP.branchId);
    const sel = await crElegirPersona(amount);
    if (!sel) return;                       // canceló
    _crPagoSel = sel;
    SP.payments.push({ id: Date.now(), method: def.nombre, methodKey: def.key, methodTipo: 'credito',
                       amount, received: amount, creditoId: sel.id, creditoNombre: sel.nombre });
    SP.entry = 0;
    renderAll();
    return;
  }
  // Guardamos el NOMBRE del método (lo que se muestra y con lo que agrupa el
  // cuadre de caja) + su id/tipo para referencia.
  SP.payments.push({ id: Date.now(), method: def.nombre, methodKey: def.key, methodTipo: def.tipo, amount, received });
  SP.entry = 0;
  renderAll();
}

function ptEtiquetaPago(p) {
  return p && p.methodTipo === 'puntos' && p.puntos
    ? ' · ' + Number(p.puntos).toLocaleString('es-CO') + ' pts' : '';
}

function removePayment(id) {
  // Los abonos guardados (saved) no se pueden quitar desde aquí
  SP.payments = SP.payments.filter(p => p.saved || p.id !== Number(id));
  renderAll();
}

// ── Guardar ABONO: registra los pagos nuevos sin cerrar la orden ──────────

/* ── COMO SE GUARDA EL METODO DE PAGO ──────────────────────────────────────
   Encontrado el 4-ago-2026: en la base convivian 'efectivo' y 'Efectivo',
   'transferencia' y 'Transferencia'. Los de mayuscula eran TODOS del 3 y 4 de
   agosto — o sea que no era suciedad vieja: los metodos de pago configurables
   empezaron a guardar el nombre TAL COMO lo escribio el dueño, mientras que
   antes se guardaba una clave fija en minuscula.
   Los informes lo disimulaban al pintar, pero los datos quedaban partidos en
   dos y cualquier calculo nuevo se equivocaria.
   Aqui se guarda SIEMPRE en minuscula y sin tildes. El nombre bonito se sigue
   mostrando en pantalla; lo que se normaliza es lo que queda escrito. */
function metodoNormalizado(p) {
  var base = (p && (p.methodKey || p.method)) || 'efectivo';
  return String(base).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

async function guardarAbono() {
  const nuevos = SP.payments.filter(p => !p.saved);
  if (!nuevos.length) return;
  const btn = document.getElementById('btn-abono');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    /* Un abono con saldo tambien mueve plata de verdad, asi que se descuenta
       aqui —antes de guardarlo— por el mismo camino que al finalizar. Sin
       esto, el abono quedaba registrado y el saldo del cliente intacto. */
    for (const sp of nuevos.filter(p => p.methodTipo === 'saldo' && !p.saldoOk)) {
      try {
        await posSaldo.consumir(SP.clienteId, sp.amount, SP.orderId,
          'pedido:' + SP.orderId + ':' + sp.id, 'Abono del pedido');
        sp.saldoOk = true;
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar abono'; }
        if (e && e.codigo === 'SALDO_INSUFICIENTE') _sdAvisoSinSaldo(sp.amount, 0, e.disponible);
        else alert('No se pudo descontar el saldo: ' + (e.message || e));
        return;
      }
    }
    const payRows = nuevos.map(p => ({
      order_id:  SP.orderId,
      branch_id: SP.branchId,
      tenant_id: SP.tenantId,
      method:    metodoNormalizado(p),
      amount:    p.amount,
      received:  p.received || p.amount,
      vuelto:    Math.max(0, (p.received || p.amount) - p.amount),
    }));
    const { error: e1 } = await sb.from('pos_payments').insert(payRows);
    if (e1) throw e1;
    const paidTotal = SP.payments.reduce((s, p) => s + p.amount, 0);
    const { error: e2 } = await sb.from('pos_orders')
      .update({ paid_amount: paidTotal })
      .eq('id', SP.orderId);
    if (e2) throw e2;
    nuevos.forEach(p => { p.saved = true; });
    renderAll();
    if (btn) btn.textContent = 'Abono guardado ✓';
    setTimeout(() => { if (btn) btn.textContent = 'Guardar abono'; }, 2000);
  } catch (e) {
    console.error('guardarAbono:', e);
    alert('Error al guardar el abono: ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar abono'; }
  }
}

async function cobrarDespues() {
    try {
      const { error } = await sb.from('pos_orders').update({ status: 'pendiente_pago' }).eq('id', SP.orderId);
      if (error) throw error;
      window.location.href = 'ventas.html';
    } catch(e) {
      alert('Error al actualizar estado: ' + e.message);
    }
  }

  async function finalizarPago() {
  const { total, paid, vuelto } = calc();
  const btnFinish = document.getElementById('btn-finish');
  btnFinish.disabled = true;
  btnFinish.textContent = 'Procesando…';

  try {
    const { subtotal, empaque, domi, tipAmt, total } = calc();
    // Siempre en minusculas: convivian 'Efectivo' (61 pedidos) y 'efectivo'
    // (6) como si fueran metodos distintos. Quien lo muestre le pone la
    // mayuscula; quien lo agrupa necesita un solo valor.
    /* Sin ningun pago en dinero pero con canje, el metodo es 'puntos'.
       Antes caia en 'multiple' y el informe mostraba un pago multiple que
       nunca existio. */
    const payMethod   = SP.payments.length === 1
      ? String(SP.payments[0].method || '').toLowerCase()
      : (SP.payments.length === 0 && SP.canje && SP.canje.puntos > 0) ? 'puntos'
      : 'multiple';
    const vueltoTotal = SP.payments.reduce((s, p) => s + Math.max(0, (p.received || p.amount) - p.amount), 0);
    const now         = new Date().toISOString();

    const _write = window.posSync
      ? (t, op, d, m) => posSync.write(t, op, d, m)
      : async (t, op, d, m) => {
          let q = sb.from(t);
          if (op === 'update') { q = q.update(d); if (m) for (const [c,v] of Object.entries(m)) q = q.eq(c,v); }
          else if (op === 'insert') q = q.insert(d);
          const r = await q; return { ok: !r.error };
        };

    // Impuesto CONGELADO: se guarda lo calculado hoy y los informes leen esto,
    // nunca recalculan. Si mañana sube la tarifa, las ventas ya declaradas no
    // pueden cambiar.
    let _tax = null;
    if (window.posImpuestos && posImpuestos.activo()) {
      const _extras = [];
      if (empaque) _extras.push({ valor: empaque });
      // El domicilio NO entra: no es venta y su tratamiento tributario lo
      // define el contador de cada restaurante.
      _tax = posImpuestos.calcularPedido(
        (SP.items || []).map(function (i) {
          return { product_id: i.productId, category_id: i.catId, total: i.qty * i.unitPrice };
        }), _extras);
    }

    // CRÉDITO: cargar la deuda ANTES de cerrar el pedido. Si el cupo no alcanza
    // la base lo rechaza, se avisa y NO se cobra nada — así el pedido nunca
    // queda pagado con un crédito que no existía.
    const _cred = (SP.payments || []).filter(function (p) { return p.creditoId && !p.saved; });
    for (const cp of _cred) {
      try {
        const st = (window._pos && window._pos.state) || {};
        const quien = (st.user && (st.user.user_metadata && st.user.user_metadata.nombre || st.user.email)) || null;
        await posCreditos.consumir(cp.creditoId, cp.amount, SP.orderId, quien, 'Pedido ' + (SP.orderId || '').slice(0, 8));
        cp.creditoOk = true;
      } catch (e) {
        btnFinish.disabled = false; btnFinish.textContent = 'Finalizar';
        if (e && e.codigo === 'CREDITO_INSUFICIENTE') posCreditos.modalInsuficiente(e, cp.creditoNombre);
        else alert('No se pudo cargar el crédito: ' + (e.message || e));
        return;
      }
    }

    // SALDO: se descuenta ANTES de cerrar el pedido, igual que el crédito. Si
    // la base lo rechaza, el pedido NO queda pagado con un saldo que no había.
    // La referencia lleva el id del pago (no solo el del pedido) porque un
    // pedido puede tener dos abonos con saldo, y son cobros distintos.
    const _sal = (SP.payments || []).filter(function (p) {
      return p.methodTipo === 'saldo' && !p.saved && !p.saldoOk;
    });
    for (const sp of _sal) {
      try {
        await posSaldo.consumir(SP.clienteId, sp.amount, SP.orderId,
          'pedido:' + SP.orderId + ':' + sp.id,
          'Pago del pedido ' + String(SP.orderId || '').slice(0, 8));
        sp.saldoOk = true;
      } catch (e) {
        btnFinish.disabled = false; btnFinish.textContent = 'Finalizar';
        if (e && e.codigo === 'SALDO_INSUFICIENTE') _sdAvisoSinSaldo(e.pedido, 0, e.disponible);
        else alert('No se pudo descontar el saldo: ' + (e.message || e));
        return;
      }
    }

    // Puntos: se descuentan aquí, no al aplicar. Si el cobro se cancela a
    // medias, al cliente no se le quitó nada. Es el mismo criterio del crédito.
    const pp = (SP.canje && SP.canje.puntos > 0 && !SP.canje.hecho) ? SP.canje : null;
    if (pp) {
      try {
        const st2 = (window._pos && window._pos.state) || {};
        const quien2 = (st2.user && (st2.user.user_metadata && st2.user.user_metadata.nombre || st2.user.email)) || null;
        await posPuntos.consumir(SP.clienteTel, pp.puntos, SP.orderId, pp.detalle, quien2);
        pp.hecho = true;
      } catch (e) {
        btnFinish.disabled = false; btnFinish.textContent = 'Finalizar';
        if (e && e.codigo === 'PUNTOS_INSUFICIENTES') posPuntos.modalInsuficiente(e);
        else alert('No se pudieron descontar los puntos: ' + (e.message || e));
        return;
      }
    }

    // 1. Marcar pedido como pagado con todos los datos financieros
    await _write('pos_orders', 'update', {
      status:          'paid',
      payment_method:  payMethod,
      closed_at:       now,
      // "Las ventas son las ventas": total_final = SOLO comida+empaque, SIN domicilio.
      // El domi va aparte (delivery_fee). paid_amount sí es todo lo que pagó el cliente (incluye domi).
      // "Las ventas son las ventas": lo canjeado con puntos NO entra aquí.
      // `total` ya viene sin ello (calc lo resta), así que total_final es lo
      // que de verdad se vendió en dinero.
      total_final:     total - domi,
      puntos_redimidos: (SP.canje && SP.canje.puntos) || null,
      puntos_valor:     (SP.canje && SP.canje.puntos) ? (calc().canjeValor || 0) : null,
      paid_amount:     total,
      discount_amount: SP.discount || 0,
      discount_motivo: SP.discountObj?.motivo || null,
      tip_amount:      tipAmt,
      packaging_fee:   empaque || 0,
      vuelto_total:    vueltoTotal,
      ...(_tax ? { tax_total: _tax.impuesto, tax_base: _tax.base, tax_detail: _tax.porTarifa } : {}),
    }, { id: SP.orderId });

    // 2. Insertar desglose de pagos — SOLO los nuevos (los abonos ya guardados
    // y las transferencias verificadas por el bot ya están en pos_payments)
    const payNuevos = SP.payments.filter(p => !p.saved);
    if (payNuevos.length > 0) {
      const payRows = payNuevos.map(p => ({
        order_id:  SP.orderId,
        branch_id: SP.branchId,
        tenant_id: SP.tenantId,
        method:    metodoNormalizado(p),
        amount:    p.amount,
        received:  p.received || p.amount,
        vuelto:    Math.max(0, (p.received || p.amount) - p.amount),
      }));
      await _write('pos_payments', 'insert', payRows);
    }

    // 3. Actualizar mesa según modo de cobro (solo si hay mesa)
    if (SP.tableId) {
      if (!SP.adelantado) {
        await _write('pos_tables', 'update', { status: 'libre' }, { id: SP.tableId });
      } else {
        await _write('pos_tables', 'update', { status: 'esperando' }, { id: SP.tableId });
      }
    }

    // 4. Mostrar overlay con mensaje según canal
    const mesaName = SP.tableId
      ? document.getElementById('mesa-title').textContent
      : SP.channel === 'domicilio'
        ? (SP.order?.customer_name || 'Domicilio')
        : ('Turno ' + (SP.order?.turno ? ('#' + String(SP.order.turno).padStart(3,'0')) : ''));
    document.getElementById('done-mesa').textContent   = mesaName;
    document.getElementById('done-total').textContent  = fmt(total);
    document.getElementById('done-paid').textContent   = fmt(paid);
    document.getElementById('done-vuelto').textContent = fmt(vuelto);
    document.getElementById('done-text').innerHTML = SP.tableId
      ? (SP.adelantado
          ? `El pago de la <strong>${mesaName}</strong> fue registrado. La mesa sigue abierta por si piden algo más.`
          : `La cuenta de la <strong>${mesaName}</strong> quedó saldada. La mesa se liberará automáticamente.`)
      : SP.channel === 'domicilio'
        ? `El domicilio de <strong>${mesaName}</strong> fue cobrado correctamente.`
        : `Venta rápida <strong>${mesaName}</strong> cobrada correctamente.`;
    document.getElementById('done-overlay').hidden     = false;
    // Puntos que gano el cliente con esta compra (solo si quedo identificado).
    pgMostrarPuntosGanados(total, domi, empaque);

  } catch(e) {
    console.error('finalizarPago:', e);
    btnFinish.disabled = false;
    btnFinish.innerHTML = 'Finalizar pago <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
    alert('Error al procesar el pago. Intenta de nuevo.');
  }
}

// ── Event delegation ──────────────────────────────────────────────────────
// Edición en vivo del valor del domicilio
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'domi-input') {
    SP.domicilio = Math.max(0, parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0);
    if (SP.cobrarDomicilio) renderTotals();
  }
  // Propina — cantidad fija
  if (e.target && e.target.id === 'tip-fixed-input') {
    SP.tipFixed = Math.max(0, parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0);
    renderTotals();
  }
  // Propina — porcentaje personalizado ("Otro")
  if (e.target && e.target.id === 'tip-custom-input') {
    SP.tipPct = Math.max(0, Math.min(100, parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0));
    renderTotals();
  }
});

document.addEventListener('click', e => {
  if (e.target.dataset.pinDigit !== undefined) { pinDigit(e.target.dataset.pinDigit); return; }
  const el = e.target.closest('[data-action],[data-digit],[data-bill],[data-method],[data-dtype],[data-dval],[data-motivo],[data-smode],[data-item-id],[data-tippct],[data-tipother],[data-tipmode]');
  // Cerrar modales al hacer click en el overlay
  if (e.target.id === 'payments-modal')  { closePaymentsModal(); return; }
  if (e.target.id === 'pin-modal')        { closePinModal();       return; }
  if (e.target.id === 'discount-modal') { closeDiscountModal(); return; }
  if (e.target.id === 'split-modal')    { closeSplitModal();    return; }

  if (!el) return;

  // Teclado numérico
  if (el.dataset.digit !== undefined) {
    const d = el.dataset.digit;
    const next = Number(String(SP.entry) + d);
    if (next <= 99999999) SP.entry = next;
    renderAll();
    return;
  }
  if (el.dataset.bill) {
    SP.entry = Math.min(99999999, SP.entry + Number(el.dataset.bill));
    renderAll();
    return;
  }

  // Método de pago
  if (el.dataset.method && el.classList.contains('lm-method')) {
    SP.method = el.dataset.method;
    SP.entry  = 0;
    renderAll();
    return;
  }

  // ── Atributos de modales ──────────────────────────────────────────────────
  if (el.dataset.dtype) {
    DM.type  = el.dataset.dtype;
    DM.value = DM.type === 'pct' ? 10 : 10000;
    renderDiscountModal();
    return;
  }
  if (el.dataset.dval !== undefined) {
    DM.value = Number(el.dataset.dval);
    renderDiscountModal();
    return;
  }
  if (el.dataset.motivo) {
    DM.motivo = el.dataset.motivo;
    renderDiscountModal();
    return;
  }
  if (el.dataset.smode) {
    SM.mode = el.dataset.smode;
    if (SM.mode === 'producto') {
      SP.items.forEach(it => { if (SM.assign[it.id] == null) SM.assign[it.id] = 0; });
    }
    renderSplitModal();
    return;
  }
  if (el.dataset.itemId !== undefined && el.dataset.person !== undefined) {
    SM.assign[el.dataset.itemId] = Number(el.dataset.person);
    renderSplitModal();
    return;
  }

  // ── Propina ──────────────────────────────────────────────────────────────
  if (el.dataset.tippct !== undefined) {
    SP.tipMode = 'pct';
    SP.tipPct  = Number(el.dataset.tippct) || 0;
    _tipCustomOpen = false;
    renderAll();
    return;
  }
  if (el.dataset.tipother !== undefined) {
    SP.tipMode = 'pct';
    _tipCustomOpen = !_tipCustomOpen;
    renderAll();
    return;
  }
  if (el.dataset.tipmode) {
    SP.tipMode = el.dataset.tipmode === 'fijo' ? 'fijo' : 'pct';
    _tipCustomOpen = false;
    renderAll();
    return;
  }

  // Acciones
  switch(el.dataset.action) {
    case 'backspace':
      SP.entry = Math.floor(SP.entry / 10);
      renderAll();
      break;
    case 'clear':
      SP.entry = 0;
      renderAll();
      break;
    case 'exact': {
      const { falta } = calc();
      SP.entry = falta;
      renderAll();
      break;
    }
    case 'tip':
      SP.tipOn = !SP.tipOn;
      renderAll();
      break;
    case 'cobrar-domi': {
      // Toma el valor actual del input al activar
      const di = document.getElementById('domi-input');
      if (di) SP.domicilio = Math.max(0, parseInt(String(di.value).replace(/\D/g, ''), 10) || 0);
      SP.cobrarDomicilio = !SP.cobrarDomicilio;
      renderAll();
      break;
    }
    case 'apply':
      applyPayment();
      break;
    case 'remove-payment':
      removePayment(el.dataset.id);
      break;
    case 'finish':
      finalizarPago();
      break;
    case 'cobrar-despues':
      cobrarDespues();
      break;
    case 'guardar-abono':
      guardarAbono();
      break;
    case 'new-sale':
      window.location.href = 'ventas.html';
      break;
    case 'back':
      window.location.href = 'ventas.html';
      break;
    case 'print':
    case 'print-receipt':
      // C6/C8: open 3-option print modal (pos-print.js)
      if (typeof posOpenPrintModal === 'function' && SP.orderId) {
        posOpenPrintModal(SP.orderId);
      } else if (typeof posOpenPrintModal === 'function') {
        posOpenPrintModal(null);
      } else {
        window.print();
      }
      break;
    case 'split':          openSplitModal();    break;
    case 'discount':
      if (window.posGuard) window.posGuard('pedidos.descuento', openDiscountModal, 'Aplicar descuentos requiere permiso de administrador.');
      else openDiscountModal();
      break;
    case 'view-payments':    openPaymentsModal();   break;
    case 'close-payments':   closePaymentsModal();  break;
    case 'close-pin':        closePinModal();       break;
    case 'pin-clear': _pinBuffer = ''; renderPinDots(); document.getElementById('pin-error').hidden=true; break;
    case 'pin-back':  _pinBuffer = _pinBuffer.slice(0,-1); renderPinDots(); break;
    case 'modal-remove-payment':
      removePayment(el.dataset.id);
      if (!SP.payments.length) closePaymentsModal();
      else openPaymentsModal();
      break;
    case 'close-discount': closeDiscountModal(); break;
    case 'discount-apply': applyDiscount();      break;
    case 'discount-quitar': quitarDiscount();    break;
    case 'close-split':    closeSplitModal();    break;
    case 'split-apply':    applySplit();         break;
    case 'split-quitar':
    case 'split-remove':   quitarSplit();        break;
    case 'split-minus':
      SM.n = Math.max(2, SM.n - 1);
      renderSplitModal();
      break;
    case 'split-plus':
      SM.n = Math.min(8, SM.n + 1);
      renderSplitModal();
      break;
    case 'cliente':
      pgCliente();
      break;
    /* Si se selecciono al cliente equivocado no habia forma de deshacerlo:
       tocaba salirse del cobro. Se limpia igual que se puso, en el pedido. */
    case 'cliente-quitar':
      e.stopPropagation();
      /* Deshacer, no borrar: vuelve a como estaba al abrir la pantalla. */
      pgGuardarCliente(null, SP.nombreDeFuera || '', '');
      break;
  }
});

// ── Carga de datos ────────────────────────────────────────────────────────
async function loadOrder() {
  const { data: order, error } = await sb
    .from('pos_orders')
    .select('*, pos_order_items(*)')
    .eq('id', SP.orderId)
    .maybeSingle();

  if (error || !order) {
    console.error('loadOrder error:', error);
    alert('No se encontró la orden. Volviendo a ventas.');
    window.location.href = 'ventas.html';
    return;
  }
  SP.order = order;

  // ── ABONOS: cargar pagos ya registrados de esta orden (parciales guardados,
  // transferencias verificadas por el bot, etc.). Aparecen como pagos aplicados
  // NO removibles y solo se cobra lo que falta.
  try {
    const { data: prevPays } = await sb
      .from('pos_payments')
      .select('id, method, amount, received')
      .eq('order_id', SP.orderId)
      .order('created_at', { ascending: true });
    if (prevPays && prevPays.length) {
      SP.payments = prevPays.map(p => ({
        id:       'saved-' + p.id,
        method:   p.method || 'efectivo',
        amount:   Number(p.amount) || 0,
        received: Number(p.received) || Number(p.amount) || 0,
        saved:    true,
      }));
    }
  } catch (e) { console.error('carga de abonos previos:', e); }

  // ── RED DE SEGURIDAD: si el pedido tiene paid_amount pero el detalle de pagos
  // no lo cubre (lectura parcial/fallida), reflejar el abono desde paid_amount para
  // que la cuenta NUNCA "olvide" lo ya abonado. Así, aunque falle la lectura del
  // detalle, la mesa recuerda cuánto se abonó y solo cobra lo que falta.
  try {
    const paidRows  = SP.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paidOrder = Number(order.paid_amount) || 0;
    if (paidOrder > paidRows + 1) {
      SP.payments.push({
        id:       'saved-prev-' + SP.orderId,
        method:   'efectivo',
        amount:   paidOrder - paidRows,
        received: paidOrder - paidRows,
        saved:    true,
      });
    }
  } catch (e) { console.error('reconciliar abono con paid_amount:', e); }

  // Cargar tabla (null para ventas rapidas)
  SP.table = null;
  if (SP.tableId) {
    const { data: table } = await sb
      .from('pos_tables')
      .select('*')
      .eq('id', SP.tableId)
      .maybeSingle();
    SP.table = table;
  }

  // Cargar colores de categorías
  const productIds = (order.pos_order_items || []).map(i => i.product_id).filter(Boolean);
  let prodMap = {};
  if (productIds.length) {
    const { data: prods } = await sb
      .from('pos_products')
      .select('id, pos_categories(id, name, color)')
      .in('id', productIds);
    (prods || []).forEach(p => { prodMap[p.id] = p; });
  }

  // Construir items
  SP.items = (order.pos_order_items || []).map(it => {
    const prod = prodMap[it.product_id] || {};
    const cat  = prod.pos_categories || {};
    return {
      id:        it.id,
      productId: it.product_id || null,
      catId:     cat.id || null,
      name:      it.name || it.product_name || 'Producto',
      qty:       it.quantity || 1,
      unitPrice: parseFloat(it.unit_price) || 0,
      // Presentación y variantes elegidas: sin esto no se puede saber si ese
      // tamaño concreto está en el catálogo de puntos.
      selections: it.selections || {},
      catName:   cat.name  || '',
      catColor:  cat.color || catColorFor(it.product_id),
    };
  });

  // ── Empaque y domicilio ──────────────────────────────────────────────
  // Empaque: usar el que quedó guardado en la orden; si no hay (p. ej. pedidos
  // creados por el bot, que no leen la config local), calcularlo desde Operación.
  let emp = Number(order.packaging_fee) || 0;
  if (emp <= 0 && (SP.channel === 'domicilio' || SP.channel === 'rapido')) {
    const prodTotal = SP.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const units     = SP.items.reduce((s, i) => s + i.qty, 0);
    emp = computeEmpaquePagos(prodTotal, units, SP.channel === 'domicilio');
  }
  SP.empaque = emp;
  // Domicilio: valor sugerido (se puede editar). Por defecto NO se cobra al
  // cliente — solo si el cajero activa el toggle "Cobrar domicilio".
  SP.domicilio = Number(order.delivery_fee) || 0;
  SP.cobrarDomicilio = false;

  // Datos del cliente (si el pedido ya trae uno, se muestra con sus puntos)
  SP.cliente = order.customer_name || '';
  SP.clienteId = order.cliente_id || null;
  SP.clienteTel = '';
  /* El nombre que el pedido traia de AFUERA: un domicilio del chat llega con
     "Katherin" escrito antes de que nadie seleccione a nadie, y ese nombre es
     el que sale en la comanda y en la lista de Domicilios. Se guarda para que
     la X pueda deshacer la seleccion sin llevarselo por delante. Si el pedido
     ya venia con cliente registrado, el nombre lo puso esa seleccion y no hay
     nada ajeno que conservar. */
  SP.nombreDeFuera = (!order.cliente_id && order.customer_name) ? order.customer_name : '';
  if (SP.clienteId) {
    try {
      const rc = await sb.from('pos_clientes').select('telefono,nombre').eq('id', SP.clienteId).maybeSingle();
      if (rc.data) { SP.clienteTel = rc.data.telefono || ''; SP.cliente = SP.cliente || rc.data.nombre || ''; }
    } catch (e) { /* sin telefono solo se pierde el contador, no el cliente */ }
  }
  pgPintarCliente();
  /* La verificación de transferencia lee el COMPROBANTE que el cliente mandó
     por el chat, así que solo tiene sentido en pedidos que vienen de ahí.
     Si el pedido no tiene conversación, el botón no se ofrece. */
  SP.convId = null;
  try {
    const rc2 = await sb.from('chat_conversations').select('id').eq('order_id', SP.orderId).maybeSingle();
    SP.convId = (rc2.data && rc2.data.id) || null;
  } catch (e) { /* sin chat, simplemente no hay botón */ }

  // Topbar + meta
  const mesaName = SP.table?.name || (SP.channel === 'rapido' ? 'Venta Rápida' : SP.channel === 'domicilio' ? 'Domicilio' : 'Mesa');
  document.getElementById('mesa-title').textContent  = mesaName;
  document.getElementById('crumb-mesa').textContent  = mesaName;
  document.getElementById('sb-section').textContent  = mesaName + ' · Opciones de pago';
  document.getElementById('done-mesa').textContent   = mesaName;
  document.getElementById('meta-mesero').textContent  = SP.waiterName;
  document.getElementById('meta-personas').textContent = order.guests || '—';
}

// ── Boot ──────────────────────────────────────────────────────────────────
// ── Modal resumen de pagos ────────────────────────────────────────────────
function openPaymentsModal() {
  const { subtotal, tipAmt, total, paid, falta } = calc();
  const list = document.getElementById('payments-modal-list');
  const summary = document.getElementById('payments-modal-summary');

  if (!SP.payments.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0">Sin pagos registrados aún.</div>';
  } else {
    list.innerHTML = SP.payments.map(p => `
      <div class="pg-payment-row">
        <div class="pg-payment-row-icon">${APPLIED_ICONS[p.method] || ''}</div>
        <div class="pg-payment-row-info">
          <div class="pg-payment-row-method">${METHOD_META[p.method]?.label || p.method}</div>
          ${p.received && p.received !== p.amount
            ? `<div class="pg-payment-row-sub">Recibido: ${fmt(p.received)} · Vuelto: ${fmt(p.received - p.amount)}</div>`
            : ''}
        </div>
        <div class="pg-payment-row-amt">${fmt(p.amount)}</div>
        <button class="pg-payment-row-del" data-action="modal-remove-payment" data-id="${p.id}" title="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`).join('');
  }

  summary.innerHTML = `
    <div class="pg-modal-summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${SP.discount > 0 ? `<div class="pg-modal-summary-row is-danger"><span>Descuento</span><span>− ${fmt(SP.discount)}</span></div>` : ''}
    ${tipAmt > 0 ? `<div class="pg-modal-summary-row"><span>Propina${SP.tipMode === 'fijo' ? '' : ' ' + (Number(SP.tipPct)||0) + ' %'}</span><span>${fmt(tipAmt)}</span></div>` : ''}
    <div class="pg-modal-summary-row is-total"><span>Total</span><span>${fmt(total)}</span></div>
    <div class="pg-modal-summary-row" style="margin-top:4px"><span>Pagado</span><span style="color:#16A34A;font-weight:700">${fmt(paid)}</span></div>
    ${falta > 0 ? `<div class="pg-modal-summary-row is-danger"><span>Falta</span><span>${fmt(falta)}</span></div>` : ''}`;

  document.getElementById('payments-modal').hidden = false;
}

function closePaymentsModal() {
  document.getElementById('payments-modal').hidden = true;
}

/* Quita el velo de apertura. Se puede llamar las veces que haga falta.

   EL TOPE DE TIEMPO NO ES ADORNO: si `init` revienta a mitad —sin internet, un
   pedido que no existe, un permiso— el velo se quedaria puesto y la pantalla
   de cobro seria un fondo gris para siempre. Eso es MUCHO peor que el parpadeo
   que vino a tapar. A los 4 segundos se cae solo, pase lo que pase. */
function pgQuitarVelo() {
  try { document.body.classList.remove('pg-abriendo'); } catch (e) {}
}
setTimeout(pgQuitarVelo, 4000);

/* Si algo revienta en cualquier punto del arranque, el velo se cae igual. Sin
   esto, un fallo de red dejaria la pantalla tapada sin decir por que. */
window.addEventListener('error', pgQuitarVelo);
window.addEventListener('unhandledrejection', pgQuitarVelo);

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  SP.userId = user.id;

  const meta = user.user_metadata || {};
  SP.tenantId   = meta.tenant_id  || null;
  SP.branchId   = meta.branch_id  || null;
  SP.waiterName = meta.nombre || meta.name || user.email?.split('@')[0] || '—';
  SP.userRole   = meta.role  || 'mesero';

  // Config de propina (Impuestos y propina)
  tipLoadConfig();

  // 2. Topbar usuario
  const initials = SP.waiterName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent   = SP.waiterName;
  document.getElementById('user-role').textContent   = SP.userRole;

  // 3. Branch nombre
  if (SP.branchId) {
    const { data: branch } = await sb.from('branches').select('name, cobro_adelantado, operacion_config').eq('id', SP.branchId).maybeSingle();
    // Impuestos: si el restaurante no los cobra (lo normal en uno pequeño),
    // todo lo de abajo queda en cero y el cobro se comporta como siempre.
    if (window.posImpuestos) {
      posImpuestos.setConfig((branch && branch.operacion_config && branch.operacion_config.impuestos) || null);
      if (posImpuestos.activo()) {
        try {
          const [rc, rp] = await Promise.all([
            sb.from('pos_categories').select('id,impuesto_pct').eq('branch_id', SP.branchId),
            sb.from('pos_products').select('id,category_id,impuesto_pct').eq('branch_id', SP.branchId),
          ]);
          posImpuestos.setTarifas(rc.data || [], rp.data || []);
        } catch (e) { console.warn('[pagos] tarifas de impuesto:', e); }
      }
    }
    if (branch) {
      document.getElementById('sb-branch').textContent = branch.name || '';
      // La DB es la fuente de verdad para el modo de cobro
      if (branch.cobro_adelantado !== undefined) SP.adelantado = !!branch.cobro_adelantado;
    }
  }

  // 4. Params de URL (SP.adelantado ya fue sobrescrito por branch query en paso 3)
  const params = new URLSearchParams(window.location.search);
  SP.orderId  = params.get('order');
  // (el parámetro 'servicio' quedó obsoleto: la propina ahora se controla por
  // la config de "Impuestos y propina" y llega encendida por defecto)
  SP.tableId  = params.get('table');
  SP.channel  = params.get('channel') || 'salon';

  // Mostrar botón Cobrar después solo en canal rapido
  const btnCobrarDespues = document.getElementById('btn-cobrar-despues');
  if (btnCobrarDespues && SP.channel === 'rapido') btnCobrarDespues.style.display = '';

  // canal rapido no tiene mesa
  if (!SP.orderId || (!SP.tableId && SP.channel !== 'rapido' && SP.channel !== 'domicilio')) {
    alert('Parámetros de orden inválidos.');
    window.location.href = 'ventas.html';
    return;
  }

  // 5. Pintar los metodos AL INSTANTE desde lo guardado en el equipo. La
  //    consulta fresca corre igual mas abajo y repinta si algo cambio.
  try {
    var _g = window.posCache && posCache.leer('pagos.metodos');
    if (_g && Array.isArray(_g.datos) && _g.datos.length) _mpAplicarLista(_g.datos);
  } catch (e) { /* sin cache no pasa nada: se espera la red como siempre */ }

  // 5b. Cargar datos
  await loadOrder();
  // 5b. Cargar métodos de pago configurados (fuente: Métodos de pago)
  await loadPaymentMethods();

  // 6. Render inicial
  renderItems();
  renderAll();

  /* AQUI, y no antes: la cuenta ya esta cargada y pintada con sus datos. Se
     quita despues de `renderAll` para que lo primero que se vea sea lo
     definitivo, no un intermedio. */
  pgQuitarVelo();
});

// ════════ MODAL DESCUENTO ════════════════════════════════════════════════

const NCOLORS = ['#5B6BFF','#10B981','#F59E0B','#0EA5E9','#8B5CF6','#F43F5E','#14B8A6','#EC4899'];
const PCTS    = [5, 10, 15, 20];
const MONTOS  = [5000, 10000, 20000, 50000];
const MOTIVOS = ['Cortesía', 'Cliente frecuente', 'Promoción', 'Ajuste'];

// Estado local del modal (se inicializa al abrir)
let DM = { type: 'pct', value: 10, motivo: 'Cortesía' };

function discountCalcAmt() {
  const { subtotal, tipAmt } = calc();
  const base = subtotal + tipAmt;
  return DM.type === 'pct'
    ? Math.round(base * Math.min(DM.value, 100) / 100)
    : Math.min(DM.value, base);
}

function renderDiscountModal() {
  const { subtotal, tipAmt } = calc();
  const base = subtotal + tipAmt;
  const amount = discountCalcAmt();

  // Segmented control
  document.querySelectorAll('#discount-seg .lm-seg').forEach(b => {
    b.classList.toggle('is-on', b.dataset.dtype === DM.type);
  });

  // Chips de valores
  const chipsEl = document.getElementById('discount-chips');
  const vals = DM.type === 'pct' ? PCTS : MONTOS;
  chipsEl.innerHTML = vals.map(v =>
    `<button class="lm-chip${v === DM.value ? ' is-on' : ''}" data-dval="${v}">
      ${DM.type === 'pct' ? v + '%' : fmt(v)}
    </button>`
  ).join('');

  // Chips de motivo
  const motivoEl = document.getElementById('motivo-chips');
  motivoEl.innerHTML = MOTIVOS.map(m =>
    `<button class="lm-chip sm${m === DM.motivo ? ' is-on' : ''}" data-motivo="${m}">${m}</button>`
  ).join('');

  // Resumen
  document.getElementById('discount-summary').innerHTML = `
    <div class="pg-modal-summary-row"><span>Total actual</span><span>${fmt(base)}</span></div>
    <div class="pg-modal-summary-row is-danger"><span>Descuento${DM.type === 'pct' ? ' ' + DM.value + '%' : ''}</span><span>− ${fmt(amount)}</span></div>
    <div class="pg-modal-summary-row is-total"><span>Nuevo total</span><span>${fmt(Math.max(0, base - amount))}</span></div>`;

  // Botón quitar
  document.getElementById('discount-quitar').hidden = !SP.discountObj;

  // Botón aplicar
  document.getElementById('discount-apply').disabled = amount <= 0;
}

function openDiscountModal() {
  // Inicializar estado desde discountObj actual si existe
  if (SP.discountObj) {
    DM = { type: SP.discountObj.type, value: SP.discountObj.value, motivo: SP.discountObj.motivo };
  } else {
    DM = { type: 'pct', value: 10, motivo: 'Cortesía' };
  }
  renderDiscountModal();
  document.getElementById('discount-modal').hidden = false;
}

function closeDiscountModal() {
  document.getElementById('discount-modal').hidden = true;
}

function applyDiscount() {
  const amount = discountCalcAmt();
  if (amount <= 0) return;
  SP.discountObj = { type: DM.type, value: DM.value, motivo: DM.motivo, amount };
  SP.discount    = amount;
  closeDiscountModal();
  renderAll();
}

function quitarDiscount() {
  SP.discountObj = null;
  SP.discount    = 0;
  closeDiscountModal();
  renderAll();
}

// ════════ MODAL DIVIDIR CUENTA ═══════════════════════════════════════════

let SM = { mode: 'iguales', n: 2, assign: {} };

function splitEqualParts(total, n) {
  const per = Math.floor(total / n);
  const parts = Array(n).fill(per);
  parts[n - 1] += total - per * n;
  return parts;
}

function splitItemParts(total, subtotal, n) {
  const sums = Array(n).fill(0);
  SP.items.forEach(it => {
    const idx = Math.min(SM.assign[it.id] ?? 0, n - 1);
    sums[idx] += it.qty * it.unitPrice;
  });
  const parts = sums.map(s => subtotal > 0 ? Math.round(s / subtotal * total) : 0);
  const diff = total - parts.reduce((a, b) => a + b, 0);
  const idx = parts.findIndex(p => p > 0);
  if (idx >= 0) parts[idx] += diff;
  return parts;
}

function getSplitParts() {
  const { total, subtotal } = calc();
  return SM.mode === 'iguales'
    ? splitEqualParts(total, SM.n)
    : splitItemParts(total, subtotal, SM.n);
}

function partCard(i, amt) {
  return `<div class="pg-part-card">
    <div class="pg-part-dot" style="background:${NCOLORS[i % 8]}">${i + 1}</div>
    <div>
      <div class="pg-part-label">Cuenta ${i + 1}</div>
      <div class="pg-part-value">${fmt(amt)}</div>
    </div>
  </div>`;
}

function renderSplitModal() {
  const { total } = calc();
  const parts = getSplitParts();

  document.getElementById('split-modal-sub').textContent = fmt(total) + ' en total';
  document.getElementById('split-n-display').textContent = SM.n;

  // Segmented
  document.querySelectorAll('#split-seg .lm-seg').forEach(b => {
    b.classList.toggle('is-on', b.dataset.smode === SM.mode);
  });

  // Contenido
  const content = document.getElementById('split-content');
  if (SM.mode === 'iguales') {
    content.innerHTML = `<div class="pg-part-grid">${parts.map((p, i) => partCard(i, p)).join('')}</div>`;
  } else {
    // Lista de ítems con botones de persona
    const rows = SP.items.map(it => {
      const cur = Math.min(SM.assign[it.id] ?? 0, SM.n - 1);
      const btns = Array.from({length: SM.n}).map((_, i) => {
        const on = cur === i;
        return `<button class="lm-person${on ? ' is-on' : ''}"
          style="${on ? 'background:' + NCOLORS[i % 8] + ';border-color:' + NCOLORS[i % 8] : ''}"
          data-item-id="${it.id}" data-person="${i}">${i + 1}</button>`;
      }).join('');
      return `<div class="pg-assign-row">
        <span class="pg-tline-qty">${it.qty}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.name}</div>
          <div style="font-size:10.5px;color:var(--muted)">${fmt(it.qty * it.unitPrice)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">${btns}</div>
      </div>`;
    }).join('');
    content.innerHTML = `<div class="pg-assign-list">${rows}</div>
      <div class="pg-part-grid">${parts.map((p, i) => partCard(i, p)).join('')}</div>`;
  }

  // Botón quitar
  document.getElementById('split-quitar').hidden = !SP.splitObj;
}

function openSplitModal() {
  if (SP.splitObj) {
    SM = { mode: SP.splitObj.mode, n: SP.splitObj.n, assign: Object.assign({}, SP.splitObj.assign) };
  } else {
    SM = { mode: 'iguales', n: 2, assign: {} };
    // Inicializar assign con persona 0 para todos los ítems
    SP.items.forEach(it => { SM.assign[it.id] = 0; });
  }
  renderSplitModal();
  document.getElementById('split-modal').hidden = false;
}

function closeSplitModal() {
  document.getElementById('split-modal').hidden = true;
}

function applySplit() {
  const parts = getSplitParts();
  SP.splitObj = { mode: SM.mode, n: SM.n, parts, assign: Object.assign({}, SM.assign) };
  closeSplitModal();
  renderAll();
}

function quitarSplit() {
  SP.splitObj = null;
  closeSplitModal();
  renderAll();
}

// ════════ SPLIT STRIP (en panel cobro) ═══════════════════════════════════

function calcSplitInfo() {
  if (!SP.splitObj) return null;
  const { paid } = calc();
  const parts = SP.splitObj.parts;
  let cum = 0;
  const rows = parts.map((amt, i) => { cum += amt; return { i, amt, cum }; });
  const cur  = rows.find(r => paid < r.cum) || rows[rows.length - 1];
  return {
    rows,
    curIndex:      cur.i,
    partRemaining: Math.max(0, cur.cum - paid),
    paidParts:     rows.filter(r => paid >= r.cum).length,
    n:             rows.length,
  };
}

function renderSplitStrip() {
  const strip = document.getElementById('split-strip');
  if (!SP.splitObj) { strip.hidden = true; return; }

  const info = calcSplitInfo();
  if (!info) { strip.hidden = true; return; }

  strip.hidden = false;
  document.getElementById('split-strip-title').textContent =
    'Cobrando parte ' + (info.curIndex + 1) + ' de ' + info.n;
  document.getElementById('split-strip-sub').textContent =
    'Faltan ' + fmt(info.partRemaining) + ' · ' + info.paidParts + '/' + info.n + ' cobradas';

  document.getElementById('split-dots').innerHTML = info.rows.map(r => {
    const color = info.paid >= r.cum ? '#16A34A'
      : r.i === info.curIndex ? '#5B6BFF' : '#CBD5E1';
    return `<span class="pg-split-dot" style="background:${color}"></span>`;
  }).join('');
}

// ════════ PARCHAR renderTotals PARA USAR exactTarget DE SPLIT ═══════════


// ── Teclado físico → teclado numérico en pantalla ─────────────────────────
document.addEventListener('keydown', e => {
  // No interferir si hay un input/textarea enfocado
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  // No interferir si hay un modal abierto
  if (document.getElementById('discount-modal')?.hidden === false) return;
  if (document.getElementById('split-modal')?.hidden    === false) return;

  switch (e.key) {
    case '0': SP.entry = Math.min(99999999, Number(String(SP.entry) + '0')); renderAll(); break;
    case '1': SP.entry = Math.min(99999999, Number(String(SP.entry) + '1')); renderAll(); break;
    case '2': SP.entry = Math.min(99999999, Number(String(SP.entry) + '2')); renderAll(); break;
    case '3': SP.entry = Math.min(99999999, Number(String(SP.entry) + '3')); renderAll(); break;
    case '4': SP.entry = Math.min(99999999, Number(String(SP.entry) + '4')); renderAll(); break;
    case '5': SP.entry = Math.min(99999999, Number(String(SP.entry) + '5')); renderAll(); break;
    case '6': SP.entry = Math.min(99999999, Number(String(SP.entry) + '6')); renderAll(); break;
    case '7': SP.entry = Math.min(99999999, Number(String(SP.entry) + '7')); renderAll(); break;
    case '8': SP.entry = Math.min(99999999, Number(String(SP.entry) + '8')); renderAll(); break;
    case '9': SP.entry = Math.min(99999999, Number(String(SP.entry) + '9')); renderAll(); break;
    case 'Backspace': SP.entry = Math.floor(SP.entry / 10); renderAll(); break;
    case 'Delete':    SP.entry = 0; renderAll(); break;
    case 'Enter':     applyPayment(); break;
    case 'Escape':    SP.entry = 0; renderAll(); break;
    default: return;
  }
  e.preventDefault();
});

// ── Modal PIN administrador ───────────────────────────────────────────────
let _pinBuffer = '';

function openPinModal() {
  _pinBuffer = '';
  renderPinDots();
  document.getElementById('pin-error').hidden = true;
  document.getElementById('pin-modal').hidden = false;
}
function closePinModal() {
  _pinBuffer = '';
  document.getElementById('pin-modal').hidden = true;
}
function renderPinDots(shake) {
  document.querySelectorAll('.pg-pin-dot').forEach((d, i) => {
    d.classList.toggle('filled', i < _pinBuffer.length);
    d.classList.toggle('error', !!shake);
  });
}
async function validatePin() {
  if (_pinBuffer.length < 4) return;
  try {
    const { data, error } = await sb
      .from('pos_users')
      .select('id')
      .eq('tenant_id', SP.tenantId)
      .eq('pin', _pinBuffer)
      .eq('is_authorized_admin', true)
      .limit(1)
      .maybeSingle();

    if (data && !error) {
      // PIN correcto (flujo heredado): quita la propina de este cobro.
      SP.tipOn = false;
      closePinModal();
      renderAll();
    } else {
      // PIN incorrecto
      renderPinDots(true);
      document.getElementById('pin-error').hidden = false;
      setTimeout(() => {
        _pinBuffer = '';
        renderPinDots(false);
      }, 800);
    }
  } catch(e) {
    console.error('validatePin:', e);
  }
}
function pinDigit(d) {
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += d;
  document.getElementById('pin-error').hidden = true;
  renderPinDots();
  if (_pinBuffer.length === 4) validatePin();
}


/* ══════════════════════════════════════════════════════════════════
   IDENTIFICAR AL CLIENTE PARA QUE ACUMULE PUNTOS
   Pedido de Sergio: que los puntos se sumen "también en los pedidos de mesa y
   venta rápida, y domicilio", y que si el cliente no está guardado se guarde
   con ese teléfono.

   Los puntos NO se calculan aquí: los da la base sola (trigger
   `award_loyalty_points`) cuando el pedido queda pagado, siempre que el pedido
   tenga a quién asignárselos. Ese era justo el hueco: los domicilios traían el
   cliente (39 de 39), la venta rápida a veces (10 de 26) y las mesas NUNCA
   (0 de 50). Aquí solo se le pone nombre y teléfono al pedido.

   El teléfono es la llave del cliente, así que aunque solo se tenga el número
   los puntos ya quedan en su cuenta y aparecen después al completarle el nombre.
   ══════════════════════════════════════════════════════════════════ */
function pgSoloDigitos(s) { return String(s == null ? '' : s).replace(/[^0-9]/g, ''); }
function pgTel10(s) { var d = pgSoloDigitos(s); return d.length > 10 ? d.slice(-10) : d; }

async function pgBuscarCliente(tel) {
  var t10 = pgTel10(tel);
  if (t10.length < 7) return null;
  try {
    var r = await sb.from('pos_clientes').select('id,nombre,telefono,barrio')
      .eq('tenant_id', SP.tenantId).ilike('telefono', '%' + t10).limit(1);
    return (r.data && r.data[0]) || null;
  } catch (e) { return null; }
}

async function pgPuntosDe(tel) {
  var t10 = pgTel10(tel);
  if (t10.length < 7) return 0;
  try {
    var r = await sb.from('pos_puntos').select('puntos')
      .eq('tenant_id', SP.tenantId).ilike('telefono', '%' + t10).maybeSingle();
    return (r.data && Number(r.data.puntos)) || 0;
  } catch (e) { return 0; }
}

function pgCliente() {
  /* El MISMO selector de Domicilios y de la toma de pedido en mesa
     (pos-cliente-picker.js): lista completa con avatar, teléfono, dirección y
     puntos, buscador que filtra al escribir, y creación de cliente nuevo.
     Antes esta pantalla tenía un modal propio que solo pedía el teléfono: tres
     pantallas distintas para lo mismo. */
  if (!window.posClientePicker) { alert('El selector de clientes no está disponible.'); return; }
  posClientePicker.abrir({
    tenantId: SP.tenantId,
    branchId: SP.branchId,
    onPick: function (c) {
      if (!c) return;
      pgGuardarCliente(c.id || null, c.nombre || '', c.tel || '');
    },
  });
}

/* Se guarda en el pedido AL INSTANTE, no al finalizar: si el cajero se sale a
   mitad de camino, el cliente ya quedó asociado y los puntos no se pierden. */
/* ── La tarjeta fisica en la caja (20-ago-2026) ───────────────────────
   Acercar la tarjeta al lector IDENTIFICA al cliente (igual que dar su
   numero) y ademas AUTORIZA su billetera: tener la tarjeta en la mano es la
   prueba de que la cuenta es suya, asi que no se le pide el codigo por SMS.
   Sin tarjeta, el codigo sigue siendo obligatorio. */
var _nfcListo = false;
function pgArrancarLector() {
  if (_nfcListo || !window.posNfc) return;
  _nfcListo = true;
  var _st = (window._pos && window._pos.state) || {};
  posNfc.setCtx(_st.tenantId || SP.tenantId);
  posNfc.escuchar(async function (uid) {
    try {
      var t = await posNfc.buscar(uid);
      if (!t) { _sdModalBase('Tarjeta sin vincular', '<div style="font-size:13px;color:#475569;line-height:1.55">Esta tarjeta (····' + uid.slice(-4) + ') no está vinculada a ningún cliente. Se vincula desde <b>Clientes</b>, en la ficha de la persona.</div>', null); return; }
      if (!t.activa) { _sdModalBase('Tarjeta desactivada', '<div style="font-size:13px;color:#475569">Esta tarjeta está desactivada.</div>', null); return; }
      var nombre = (t.cliente && t.cliente.nombre) || ('Cliente ••• ' + t.telefono.slice(-4));
      await pgGuardarCliente((t.cliente && t.cliente.id) || null, nombre, t.telefono);
      SP.tarjetaTel = t.telefono;   // la posesion de la tarjeta autoriza su billetera
    } catch (e) { console.error('[pagos] tarjeta:', e); }
  });
}
try { pgArrancarLector(); } catch (e) {}

async function pgGuardarCliente(id, nombre, tel) {
  SP.clienteId = id; SP.cliente = nombre || ''; SP.clienteTel = tel || '';
  /* Cambiar de cliente mata la autorizacion de la tarjeta anterior. */
  if (SP.tarjetaTel && String(SP.tarjetaTel).replace(/[^0-9]/g, '').slice(-10) !== String(tel || '').replace(/[^0-9]/g, '').slice(-10)) SP.tarjetaTel = null;
  try {
    await sb.from('pos_orders').update({
      cliente_id: id,
      customer_name: nombre || null
    }).eq('id', SP.orderId);
  } catch (e) { console.error('[pagos] no se pudo asociar el cliente:', e); }
  pgPintarCliente();
  /* Recargar los métodos: es aquí donde Puntos y Saldo se enteran de a quién
     le van a cobrar. Al identificar al cliente aparece cuánto tiene de cada
     uno debajo del botón; al quitarlo, vuelve a decir que falta. */
  try { await loadPaymentMethods(); } catch (e) { /* no bloquea el cobro */ }
  renderAll();
}

async function pgPintarCliente() {
  var row = document.getElementById('cliente-row');
  var lbl = document.getElementById('cliente-name');
  if (!row || !lbl) return;
  var xq = document.getElementById('cliente-clear');
  if (!SP.cliente && !SP.clienteTel) {
    row.classList.remove('has-client');
    lbl.textContent = 'Consumidor final';
    if (xq) xq.hidden = true;
    return;
  }
  row.classList.add('has-client');
  var pts = SP.clienteTel ? await pgPuntosDe(SP.clienteTel) : 0;
  /* El saldo va aqui y no solo debajo del boton de pago: el cajero necesita
     poder decirle al cliente cuanto tiene ANTES de elegir como cobrar, sin
     tener que ir a buscarlo. Solo aparece donde el saldo esta encendido. */
  var txt = (SP.cliente || SP.clienteTel);
  if (SP.clienteTel) txt += ' · ' + pts + ' pts';
  /* Solo con cliente registrado: un nombre suelto del chat no tiene bolsa,
     y decir 'sin saldo' de alguien a quien nadie identifico engaña. */
  if (SP.saldoActivo && SP.clienteId) txt += ' · ' + (Number(SP.saldoDisp) > 0
    ? _payMoney(SP.saldoDisp) + ' de saldo' : 'sin saldo');
  lbl.textContent = txt;
  /* Sin cliente registrado no hay nada que deshacer: el nombre suelto de un
     domicilio del chat no lo puso el cajero y no se quita desde aqui. */
  var x = document.getElementById('cliente-clear');
  if (x) x.hidden = !SP.clienteId;
}


/* Cuantos puntos gano el cliente con ESTA compra, en la pantalla de "Pago
   registrado". Pedido de Sergio: que se vea el resumen de puntos apenas se
   cobra, para poder decirselo. Si no se identifico a nadie, no se muestra nada:
   inventar unos puntos que no se van a acumular seria peor que no decir nada. */
async function pgMostrarPuntosGanados(total, domi, empaque) {
  var caja = document.getElementById('done-puntos');
  var stats = document.querySelector('.pg-done-stats');
  if (!stats) return;
  if (!_pgHayPuntos()) { if (caja) caja.style.display = 'none'; return; }
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'done-puntos';
    caja.style.cssText = 'margin-top:12px;padding:11px 14px;border-radius:11px;background:#F0FDF4;border:1px solid #BBF7D0;text-align:left';
    stats.parentNode.insertBefore(caja, stats.nextSibling);
  }
  if (!SP.clienteTel) { caja.style.display = 'none'; return; }

  var gano = window.posPuntosPedido
    ? window.posPuntosPedido({ subtotal: (total - domi - (empaque || 0)), packaging_fee: empaque || 0, total: total, delivery_fee: domi })
    : 0;
  if (gano <= 0) { caja.style.display = 'none'; return; }

  caja.style.display = '';
  caja.innerHTML = '<div style="font-size:13px;color:#166534;font-weight:700">'
    + (SP.cliente ? _payEsc(SP.cliente) + ' gano ' : 'Gano ') + gano + ' puntos con esta compra</div>'
    + '<div id="done-puntos-tot" style="font-size:12px;color:#15803D;margin-top:2px">Actualizando su total...</div>';

  // El total lo da la base, ya sumado por el trigger: no se calcula aqui.
  try {
    var pts = await pgPuntosDe(SP.clienteTel);
    var sub = document.getElementById('done-puntos-tot');
    if (sub) sub.textContent = 'Ahora tiene ' + pts + ' puntos en total.';
  } catch (e) {
    var s2 = document.getElementById('done-puntos-tot');
    if (s2) s2.textContent = '';
  }
}


/* ══════════════════════════════════════════════════════════════════
   PUNTOS QUE VA A GANAR EL CLIENTE — ANTES DE COBRAR
   Sergio: "por si algun cliente al momento de pagar pregunta cuantos puntos va
   a ganar, podemos informarle de inmediato".

   Es solo un ANUNCIO: no suma nada. Los puntos los carga la base cuando el
   pedido queda pagado. Si el cobro se cancela, no se sumo nunca nada, asi que
   no hay que deshacer nada.

   Se recalcula en cada `renderTotals()`, o sea que sigue al descuento, al
   empaque y al domicilio en vivo. La propina NO cuenta: no es venta del
   restaurante. El domicilio tampoco.
   ══════════════════════════════════════════════════════════════════ */
/* Los puntos son del plan Pro. Un restaurante Starter no debe verlos por
   ningun lado de la pantalla de cobro — ni el letrero, ni el boton de canje,
   ni el resumen despues de cobrar. Aqui se OCULTAN en vez de poner el candado:
   el cajero esta cobrandole a alguien, no es el momento de venderle un plan al
   dueno. El candado con la explicacion va en Configuracion, que es donde el
   dueno anda mirando. Mismo criterio para la billetera, que es de Premium.

   Si el plan todavia no se sabe, `puede()` responde que si: mas vale que un
   Pro lo vea medio segundo antes, a que un Pro que si pago no lo vea nunca
   porque se cayo la consulta. Cuando llega la respuesta se repinta (ver el
   posPlan.alSaber del final del archivo). */
function _pgHayPuntos() { return !window.posPlan || posPlan.puede('puntos'); }
function _pgHaySaldo()  { return !window.posPlan || posPlan.puede('nfc'); }

function pgPuntosPreview(subtotal, empaque) {
  var el = document.getElementById('t-puntos');
  if (!el) return;
  if (!_pgHayPuntos()) { el.hidden = true; return; }

  /* OJO: se calcula EXACTAMENTE igual que el trigger de la base
     (`subtotal + packaging_fee`), y el trigger NO descuenta el descuento
     porque `subtotal` se guarda sin el. Si aqui se restara, la pantalla
     anunciaria unos puntos y la base cargaria otros. Que el descuento deba o
     no bajar los puntos es una decision del negocio: el dia que se cambie,
     hay que cambiar el trigger Y esta linea. */
  var base = (Number(subtotal) || 0) + (Number(empaque) || 0);
  var pts = window.posPuntosPedido
    ? window.posPuntosPedido({ subtotal: base, packaging_fee: 0, total: base, delivery_fee: 0 })
    : Math.max(0, Math.floor(base / 1000));

  if (pts <= 0) { el.hidden = true; return; }

  el.hidden = false;
  if (SP.clienteTel) {
    el.classList.remove('is-anon');
    el.innerHTML = '<span>\u2b50</span><span>'
      + (SP.cliente ? _payEsc(SP.cliente) + ' ganar\u00e1 ' : 'Ganar\u00e1 ')
      + '<b>' + pts + ' puntos</b> con este pedido</span>';
  } else {
    // Sin cliente identificado los puntos NO se van a acumular. Se dice tal
    // cual, y de paso se recuerda como hacerlo.
    el.classList.add('is-anon');
    el.innerHTML = '<span>\u2b50</span><span>Este pedido vale <b>' + pts
      + ' puntos</b>. Toca <b>Consumidor final</b> arriba para asign\u00e1rselos a un cliente.</span>';
  }
}


/* ══════════════════════════════════════════════════════════════════
   PUNTOS COMO MÉTODO DE PAGO
   Regla de Sergio: nada es gratis. Se eligen los PRODUCTOS que se pagan con
   puntos y el pago se registra por el valor en pesos de esos productos, así la
   venta y la caja quedan igual que si hubiera pagado en efectivo.
   Solo se pueden pagar así los productos del catálogo; el resto sale apagado
   y con el motivo a la vista.
   ══════════════════════════════════════════════════════════════════ */
function _sdEsSaldo() {
  var d = _payDef();
  return !!(d && (d.tipo === 'saldo' || d.key === '__saldo'));
}
function _payMoney(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }

function _ptEsPuntos() {
  var d = _payDef();
  return !!(d && (d.tipo === 'puntos' || d.key === '__puntos'));
}

function ptAplicarPuntos() {
  if (!window.posPuntos) { alert('El módulo de puntos no está disponible.'); return; }
  if (!SP.clienteTel) {
    alert('Primero identifica al cliente: toca "Consumidor final" arriba del ticket.');
    return;
  }
  // Un pedido no se canjea dos veces.
  if (SP.canje && SP.canje.puntos > 0) {
    alert('Este pedido ya tiene un canje con puntos. Quítalo si quieres cambiarlo.');
    return;
  }
  posPuntos.modalCanje(SP.items, Number(SP.puntosSaldo) || 0, function (sel) {
    if (!sel || sel.puntos <= 0) return;
    /* El canje NO es un pago: es una salida de la venta. Se guarda aparte y
       calc() resta esos productos del total a cobrar. Así la caja solo cuenta
       el dinero que de verdad entró. */
    SP.canje = { puntos: sel.puntos, itemIds: sel.itemIds || [],
                 dinero: Number(sel.dinero) || 0, detalle: sel.detalle };
    SP.entry = 0;
    // Si el método sigue en Puntos no se puede seguir cobrando: se vuelve al primero.
    if (_ptEsPuntos()) {
      var otro = (SP.methodDefs || []).filter(function (m) { return m.tipo !== 'puntos'; })[0];
      if (otro) SP.method = otro.key;
      _renderMethodButtons();
    }
    renderAll();
  });
}

// Quitar el canje (el cliente cambió de opinión).
function ptQuitarCanje() {
  SP.canje = null;
  renderAll();
}


/* La fila del canje en el ticket. Se muestra en NEGATIVO y con los puntos,
   nunca como un pago: lo que se entrego a cambio de puntos no es venta. */
function ptRenderCanje(canjeValor) {
  var row = document.getElementById('t-canje-row');
  if (!row) {
    var totalRow = document.querySelector('.pg-trow.pg-tgrand');
    if (!totalRow) return;
    row = document.createElement('div');
    row.id = 't-canje-row';
    row.className = 'pg-trow pg-canje-row';
    totalRow.parentNode.insertBefore(row, totalRow);
  }
  if (!SP.canje || !SP.canje.puntos) { row.hidden = true; return; }
  row.hidden = false;
  row.innerHTML =
      '<span>Canjeado con puntos'
    +   '<button type="button" onclick="ptQuitarCanje()" title="Quitar el canje"'
    +     ' style="margin-left:7px;border:0;background:none;color:#94A3B8;cursor:pointer;font-size:12px">\u2715</button>'
    +   '<span style="display:block;font-size:11px;color:#94A3B8">' + _payEsc(SP.canje.detalle || '') + '</span>'
    + '</span>'
    + '<span style="text-align:right"><b style="color:#7C3AED">'
    +   Number(SP.canje.puntos).toLocaleString('es-CO') + ' pts</b>'
    +   '<span style="display:block;font-size:11px;color:#94A3B8">\u2212 ' + fmt(canjeValor) + ' no es venta</span>'
    + '</span>';
}


/* ══════════════════════════════════════════════════════════════════
   VERIFICAR TRANSFERENCIA desde la pantalla de cobro
   Sergio lo pidio para no tener que irse al chat a confirmar que la plata
   llego. Consulta el CORREO DEL BANCO buscando un abono por ese monto en las
   ultimas horas, en modo SOLO LECTURA: no marca nada como pagado ni le escribe
   al cliente. El cajero mira el resultado y decide.
   Sirve para cualquier pedido (mesa, venta rapida, domicilio) porque no
   necesita que exista un comprobante en el chat.
   ══════════════════════════════════════════════════════════════════ */
function ptRenderVerificar() {
  var host = document.getElementById('pg-verificar');
  var def = _payDef();
  // Sirve para CUALQUIER pedido: la consulta va al correo del banco por monto,
  // no depende de que haya un comprobante en el chat.
  var aplica = !!def && def.tipo !== 'efectivo' && def.tipo !== 'puntos';
  if (!host) {
    var anchor = document.querySelector('.pg-method-row');
    if (!anchor) return;
    host = document.createElement('div');
    host.id = 'pg-verificar';
    host.style.cssText = 'margin-top:10px';
    anchor.parentNode.insertBefore(host, anchor.nextSibling);
  }
  if (!aplica) { host.hidden = true; return; }
  host.hidden = false;
  if (host.dataset.busy === '1') return;
  host.innerHTML =
      '<button type="button" id="pg-verif-btn" onclick="ptVerificarTransferencia()"'
    + ' style="width:100%;padding:10px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;'
    + 'color:#334155;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer">'
    + 'Verificar transferencia</button>'
    + '<div id="pg-verif-res" style="font-size:12px;margin-top:6px;line-height:1.45"></div>';
}

async function ptVerificarTransferencia() {
  var host = document.getElementById('pg-verificar');
  var btn = document.getElementById('pg-verif-btn');
  var res = document.getElementById('pg-verif-res');
  var falta = calc().falta;
  var monto = Math.round(falta > 0 ? falta : calc().total);
  if (monto <= 0) return;
  host.dataset.busy = '1';
  btn.disabled = true; btn.textContent = 'Consultando el banco…';
  res.innerHTML = '<span style="color:#94A3B8">Buscando un abono por ' + fmt(monto) + '…</span>';
  try {
    /* Consulta de SOLO LECTURA: busca en el correo del banco un abono por ese
       monto en las ultimas horas. No marca nada como pagado ni le escribe al
       cliente — el cajero decide. (La funcion `verify-transfer` del chat NO
       sirve aqui: su modo manual da el pago por bueno sin verificar, puede
       crear un pedido duplicado y le manda un WhatsApp al cliente.) */
    var r = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/verificar-transferencia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 2 horas, no 6: aqui NO hay comprobante que cruzar (ese lo tiene el chat),
      // asi que la unica prueba es el monto — y los montos se repiten todas las
      // noches. Mientras mas corta la ventana, menos chance de confundir el abono
      // de un cliente con el de otro.
      // De que pedido se trata: sin esto la funcion no puede saber si ese abono
      // ya se uso para otro, y el mismo comprobante daba por buenos dos pedidos.
      body: JSON.stringify({ branch_id: SP.branchId, monto: String(monto), horas: 2, order_id: SP.orderId }),
    });
    var d = await r.json().catch(function () { return {}; });
    if (d && d.ok && d.ya_usada) {
      /* Ese abono ya lo reclamo otro pedido. Es el caso que faltaba: dos pedidos
         del mismo monto y un solo comprobante. */
      res.innerHTML = '<span style="color:#DC2626;font-weight:700">✕ Ese abono ya se uso</span>'
        + '<br><span style="color:#64748B">Referencia ' + _payEsc(d.referencia || '') + ', ya registrada en otro pedido.</span>'
        + '<br><span style="color:#94A3B8">No se puede cobrar dos veces con la misma transferencia. '
        + 'Si el cliente pago de verdad, pidele el comprobante de ESTE pedido.</span>';
    } else if (d && d.ok && d.encontrado && d.varios) {
      /* Varios abonos por el MISMO monto en la ventana: NO se da por bueno solo.
         El cajero es el unico que puede saber cual es el de su cliente. */
      res.innerHTML = '<span style="color:#B45309;font-weight:700">⚠ Hay ' + (d.cuantos || 2) + ' abonos por ese mismo monto</span>'
        + '<br><span style="color:#64748B">' + _payEsc(d.detalle || '') + '</span>'
        + '<br><span style="color:#94A3B8">Revisa cual es el de tu cliente antes de registrar el pago.</span>';
    } else if (d && d.ok && d.encontrado) {
      res.innerHTML = '<span style="color:#16A34A;font-weight:700">✓ Abono encontrado en el banco</span>'
        + (d.detalle ? '<br><span style="color:#64748B">' + _payEsc(d.detalle) + '</span>' : '')
        + (d.referencia
            ? '<br><span style="color:#94A3B8">Referencia ' + _payEsc(d.referencia)
              + ' — queda reservada para este pedido.</span>'
            : '')
        + '<br><span style="color:#94A3B8">Puedes registrar el pago con tranquilidad.</span>';
    } else if (d && d.ok) {
      res.innerHTML = '<span style="color:#B45309">' + _payEsc(d.mensaje || 'No aparece el abono todavia.') + '</span>'
        + '<br><span style="color:#94A3B8">El banco puede demorarse unos minutos en avisar.</span>';
    } else {
      res.innerHTML = '<span style="color:#B45309">' +
        _payEsc((d && (d.mensaje || d.error)) || 'No se pudo consultar el banco.') + '</span>';
    }
  } catch (e) {
    res.innerHTML = '<span style="color:#DC2626">No se pudo consultar: ' + _payEsc(e.message || e) + '</span>';
  }
  btn.disabled = false; btn.textContent = 'Verificar transferencia';
  host.dataset.busy = '';
}


/* ══════════════════════════════════════════════════════════════════
   CUANDO SE CONFIRMA EL PLAN, SE REPINTA
   La pantalla de cobro se dibuja al instante desde lo guardado en el equipo,
   sin esperar a internet — es lo que la hace rapida. El plan puede llegar un
   momento despues. Sin esto, un restaurante Starter alcanzaba a ver el letrero
   de puntos y el boton de canje, y se quedaban ahi hasta el siguiente repintado.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  if (!window.posPlan || !posPlan.alSaber) return;
  var antes = null;
  posPlan.alSaber(function (ctx) {
    var ahora = ctx ? (ctx.plan + '|' + JSON.stringify(ctx.funciones)) : '';
    if (ahora === antes) return;      // el primer aviso llega con lo que ya se pinto
    antes = ahora;
    try { if (SP.metodosCrudos) _mpAplicarLista(SP.metodosCrudos); } catch (e) {}
    try { renderTotals(); } catch (e) {}
  });
})();
