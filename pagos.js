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
  if (typeof renderSplitStrip === 'function') renderSplitStrip();
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
  const el = e.target.closest('[data-action],[data-digit],[data-bill],[data-method],[data-dtype],[data-dval],[data-motivo],[data-smode],[data-item-id]');
  // Cerrar modales al hacer click en el overlay
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
    case 'split':          openSplitModal();    break;
    case 'discount':       openDiscountModal(); break;
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
    case 'voucher':
    case 'credit':
    case 'cliente':
      // Módulos futuros
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
  if (!document.getElementById('discount-modal')?.hidden === false) return;
  if (!document.getElementById('split-modal')?.hidden    === false) return;

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
