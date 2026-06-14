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
  entry: 0,
  payments: [],   // [{id, method, amount, received}]
  tip: false,
  discount: 0,
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

const CAT_PALETTE = ['#5B6BFF','#8B5CF6','#EC4899','#F59E0B','#10B981','#0EA5E9','#EF4444','#14B8A6'];
function catColorFor(id) {
  if (!id) return CAT_PALETTE[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return CAT_PALETTE[Math.abs(h) % CAT_PALETTE.length];
}

// ── Cálculos ──────────────────────────────────────────────────────────────
function calc() {
  const subtotal = SP.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tipAmt   = SP.tip ? Math.round(subtotal * 0.10) : 0;
  const total    = Math.max(0, subtotal + tipAmt - SP.discount);
  const paid     = SP.payments.reduce((s, p) => s + p.amount, 0);
  const falta    = Math.max(0, total - paid);
  const vuelto   = SP.method === 'efectivo'
    ? Math.max(0, paid + SP.entry - total)
    : Math.max(0, paid - total);
  const cubierto = paid >= total && total > 0;
  return { subtotal, tipAmt, total, paid, falta, vuelto, cubierto };
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
  const { subtotal, tipAmt, total, paid, falta, vuelto, cubierto } = calc();
  const cobro = document.getElementById('cobro');

  document.getElementById('t-subtotal').textContent = fmt(subtotal);
  document.getElementById('tip-amt').textContent    = SP.tip ? '+ ' + fmt(tipAmt) : '$0';
  document.getElementById('t-total').textContent    = fmt(total);
  document.getElementById('side-total').textContent = fmt(total);
  document.getElementById('exact-amt').textContent  = fmt(falta);

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

  // Propina toggle
  document.getElementById('tip-toggle').classList.toggle('is-on', SP.tip);

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
  if (SP.method === 'efectivo' && vuelto > 0) {
    vueltoCard.hidden = false;
    document.getElementById('vuelto-card-amt').textContent = fmt(vuelto);
  } else {
    vueltoCard.hidden = true;
  }

  // Botón exacto
  const btnExact = document.getElementById('btn-exact');
  btnExact.disabled = falta === 0;

  // Botón agregar pago
  const btnApply = document.getElementById('btn-apply');
  const canApply = SP.entry > 0 && !cubierto;
  btnApply.disabled = !canApply;
  const toAdd = SP.method === 'efectivo' ? Math.min(SP.entry, falta) : SP.entry;
  document.getElementById('apply-label').textContent = canApply
    ? 'Agregar pago · ' + fmt(toAdd)
    : 'Agregar pago';

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
}

function renderApplied() {
  const list  = document.getElementById('applied-list');
  const empty = document.getElementById('applied-empty');

  if (!SP.payments.length) {
    empty.hidden = false;
    list.hidden  = true;
    return;
  }
  empty.hidden = true;
  list.hidden  = false;

  list.innerHTML = SP.payments.map(p => {
    const hasCambio = p.received > p.amount;
    const sub = hasCambio ? `Recibido ${fmt(p.received)} · vuelto ${fmt(p.received - p.amount)}` : '';
    return `
      <div class="pg-applied-item" data-method="${p.method}">
        <span class="pg-applied-icon">${APPLIED_ICONS[p.method] || ''}</span>
        <div class="pg-applied-body">
          <div class="pg-applied-name">${METHOD_META[p.method]?.label || p.method}</div>
          ${sub ? `<div class="pg-applied-sub">${sub}</div>` : ''}
        </div>
        <span class="pg-applied-amt">${fmt(p.amount)}</span>
        <button class="lm-del" data-action="remove-payment" data-id="${p.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
  }).join('');
}

function renderMethodUI() {
  const meta = METHOD_META[SP.method] || METHOD_META.efectivo;
  const cobro = document.getElementById('cobro');
  cobro.dataset.method = SP.method;

  // Botones método
  document.querySelectorAll('.lm-method').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.method === SP.method);
  });

  // Amount card colores
  const card = document.getElementById('amount-card');
  card.style.borderColor = meta.ring;

  // Amount method label + chip
  const chip = document.getElementById('amount-chip');
  chip.innerHTML = METHOD_ICONS[SP.method] || '';
  chip.style.background = meta.tint;
  chip.style.color = meta.color;
  const methodEl = document.getElementById('amount-method');
  methodEl.style.color = meta.color;
  document.getElementById('amount-method-name').textContent = meta.label;

  // Hint
  document.getElementById('amount-hint').textContent = meta.hint;
}

function renderAll() {
  renderMethodUI();
  renderTotals();
  renderApplied();
}

// ── Acciones ──────────────────────────────────────────────────────────────
function applyPayment() {
  const { falta, total } = calc();
  if (SP.entry <= 0 || falta <= 0) return;
  const amount   = SP.method === 'efectivo' ? Math.min(SP.entry, falta) : SP.entry;
  const received = SP.entry;
  SP.payments.push({ id: Date.now(), method: SP.method, amount, received });
  SP.entry = 0;
  renderAll();
}

function removePayment(id) {
  SP.payments = SP.payments.filter(p => p.id !== Number(id));
  renderAll();
}

async function finalizarPago() {
  const { total, paid, vuelto } = calc();
  const btnFinish = document.getElementById('btn-finish');
  btnFinish.disabled = true;
  btnFinish.textContent = 'Procesando…';

  try {
    const payMethod = SP.payments.length === 1 ? SP.payments[0].method : 'multiple';

    // 1. Marcar pedido como pagado
    await sb.from('pos_orders').update({
      status:         'paid',
      payment_method: payMethod,
    }).eq('id', SP.orderId);

    // 2. Liberar mesa
    await sb.from('pos_tables').update({
      status:           'libre',
      current_order_id: null,
    }).eq('id', SP.tableId);

    // 3. Mostrar overlay
    const mesaName = document.getElementById('mesa-title').textContent;
    document.getElementById('done-mesa').textContent   = mesaName;
    document.getElementById('done-total').textContent  = fmt(total);
    document.getElementById('done-paid').textContent   = fmt(paid);
    document.getElementById('done-vuelto').textContent = fmt(vuelto);
    document.getElementById('done-overlay').hidden     = false;

  } catch(e) {
    console.error('finalizarPago:', e);
    btnFinish.disabled = false;
    btnFinish.innerHTML = 'Finalizar pago <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
    alert('Error al procesar el pago. Intenta de nuevo.');
  }
}

// ── Event delegation ──────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action],[data-digit],[data-bill],[data-method]');
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
      SP.tip = !SP.tip;
      renderAll();
      break;
    case 'apply':
      applyPayment();
      break;
    case 'remove-payment':
      removePayment(el.dataset.id);
      break;
    case 'finish':
      finalizarPago();
      break;
    case 'new-sale':
      window.location.href = 'ventas.html';
      break;
    case 'back':
      window.location.href = SP.tableId
        ? `tomar-pedido.html?table=${SP.tableId}`
        : 'ventas.html';
      break;
    case 'print':
    case 'print-receipt':
      window.print();
      break;
    case 'split':
    case 'voucher':
    case 'credit':
    case 'cliente':
      // Módulos futuros
      break;
    case 'discount': {
      const val = prompt('Ingresa el descuento en pesos:');
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0) {
        SP.discount = n;
        renderAll();
      }
      break;
    }
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

  // Cargar tabla
  const { data: table } = await sb
    .from('pos_tables')
    .select('*')
    .eq('id', SP.tableId)
    .maybeSingle();
  SP.table = table;

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
      name:      it.name || 'Producto',
      qty:       it.quantity || 1,
      unitPrice: parseFloat(it.unit_price) || 0,
      catName:   cat.name  || '',
      catColor:  cat.color || catColorFor(it.product_id),
    };
  });

  // Datos del cliente
  SP.cliente = order.customer_name || '';
  if (SP.cliente) {
    const row = document.getElementById('cliente-row');
    row.classList.add('has-client');
    document.getElementById('cliente-name').textContent = SP.cliente;
  }

  // Topbar + meta
  const mesaName = table?.name || 'Mesa';
  document.getElementById('mesa-title').textContent  = mesaName;
  document.getElementById('crumb-mesa').textContent  = mesaName;
  document.getElementById('sb-section').textContent  = mesaName + ' · Opciones de pago';
  document.getElementById('done-mesa').textContent   = mesaName;
  document.getElementById('meta-mesero').textContent  = SP.waiterName;
  document.getElementById('meta-personas').textContent = order.guests || '—';
}

// ── Boot ──────────────────────────────────────────────────────────────────
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

  // 2. Topbar usuario
  const initials = SP.waiterName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent   = SP.waiterName;
  document.getElementById('user-role').textContent   = SP.userRole;

  // 3. Branch nombre
  if (SP.branchId) {
    const { data: branch } = await sb.from('pos_branches').select('name').eq('id', SP.branchId).maybeSingle();
    if (branch) document.getElementById('sb-branch').textContent = branch.name;
  }

  // 4. Params de URL
  const params = new URLSearchParams(window.location.search);
  SP.orderId  = params.get('order');
  SP.tableId  = params.get('table');

  if (!SP.orderId || !SP.tableId) {
    alert('Parámetros de orden inválidos.');
    window.location.href = 'ventas.html';
    return;
  }

  // 5. Cargar datos
  await loadOrder();

  // 6. Render inicial
  renderItems();
  renderAll();
});
