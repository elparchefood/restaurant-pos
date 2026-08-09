/* historial.js — Lógica del módulo Historial de pedidos */
/* Stack: Vanilla JS + Supabase PostgREST */

/* ─── Estado global ─── */
const HS = {
  orders:     [],
  filtered:   [],
  items:      {},   /* orderId → [items] */
  users:      {},   /* userId  → name    */
  tables:     {},   /* tableId → name    */
  range:      'today',
  canal:      'all',
  query:      '',
  selectedId: null,
  branchId:   null,
};

/* ─── Helpers ─── */
function COPF(n) { return '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }

function todayRange() {
  const s = new Date(); s.setHours(0,0,0,0);
  const e = new Date(); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function yesterdayRange() {
  const s = new Date(); s.setDate(s.getDate()-1); s.setHours(0,0,0,0);
  const e = new Date(); e.setDate(e.getDate()-1); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function last7Range() {
  const s = new Date(); s.setDate(s.getDate()-6); s.setHours(0,0,0,0);
  const e = new Date(); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function getRange() {
  if (HS.range === 'yesterday') return yesterdayRange();
  if (HS.range === '7d') return last7Range();
  return todayRange();
}
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day:'2-digit', month:'short' });
}
function highlight(text, q) {
  if (!q || !text) return text || '';
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return String(text).replace(re, '<mark>$1</mark>');
}

/* ─── Carga de datos ─── */
async function loadOrders() {
  const { start, end } = getRange();
  let q = sb.from('pos_orders').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
  if (HS.branchId) q = q.eq('branch_id', HS.branchId);
  const { data } = await q;
  HS.orders = data || [];
}

async function loadUsers() {
  const { data } = await sb.from('pos_users').select('id, name, role');
  (data || []).forEach(u => { HS.users[u.id] = u.name; });
}

async function loadTables() {
  const { data } = await sb.from('pos_tables').select('id, name');
  (data || []).forEach(t => { HS.tables[t.id] = t.name; });
}

async function loadItems(orderId) {
  if (HS.items[orderId]) return;
  const { data } = await sb.from('pos_order_items').select('*').eq('order_id', orderId);
  HS.items[orderId] = data || [];
}

/* ─── Filtrar y buscar ─── */
function applyFilters() {
  let list = HS.orders.slice();

  if (HS.canal !== 'all') {
    list = list.filter(o => {
      if (HS.canal === 'salon') return o.channel !== 'rapido' && o.channel !== 'domicilio';
      if (HS.canal === 'rapido') return o.channel === 'rapido';
      if (HS.canal === 'domicilio') return o.channel === 'domicilio';
      return true;
    });
  }

  const q = HS.query.trim().toLowerCase();
  if (q) {
    list = list.filter(o => {
      const waiter = (HS.users[o.waiter_id] || '').toLowerCase();
      const table  = (HS.tables[o.table_id] || '').toLowerCase();
      const client = (o.customer_name || '').toLowerCase();
      const turno  = ('Turno #' + String(o.turno || 0).padStart(3,'0')).toLowerCase();
      const canal  = (o.channel || '').toLowerCase();
      return waiter.includes(q) || table.includes(q) || client.includes(q) || turno.includes(q) || canal.includes(q);
    });
  }

  HS.filtered = list;
}

/* ─── Render lista ─── */
function renderList() {
  applyFilters();
  const list = HS.filtered;
  const total = list.reduce((s, o) => s + (o.total || 0), 0);
  const rangeLabel = HS.range === 'today' ? 'HOY' : HS.range === 'yesterday' ? 'AYER' : '7 DÍAS';

  document.getElementById('hs-count').textContent = list.length + ' PEDIDOS · ' + rangeLabel;
  document.getElementById('hs-total').textContent = list.length ? COPF(total) : '';

  const q = HS.query.trim();
  const el = document.getElementById('hs-order-list');

  if (!list.length) {
    el.innerHTML = `<div class="hs-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
      <p>${q ? 'Sin resultados' : 'Sin pedidos'}</p>
      <span>${q ? 'Prueba con otra palabra clave' : 'No hay pedidos en este rango'}</span>
    </div>`;
    return;
  }

  el.innerHTML = list.map(o => {
    const isSelected = o.id === HS.selectedId;
    const waiter = HS.users[o.waiter_id] || '—';
    const table  = HS.tables[o.table_id];
    const label  = orderLabel(o, table);
    const canal  = canalBadge(o.channel);
    const status = statusBadge(o.status);

    return `<div class="hs-order${isSelected ? ' selected' : ''}" data-id="${o.id}">
      <div class="hs-order-head">
        <span class="hs-order-id">${highlight(label, q)}</span>
        <span class="hs-order-total">${COPF(o.total)}</span>
      </div>
      <div class="hs-order-meta">
        <span class="hs-order-time">${fmtTime(o.created_at)}</span>
        <span class="hs-order-sep">·</span>
        <span class="hs-order-waiter" title="${waiter}">${highlight(waiter, q)}</span>
      </div>
      <div class="hs-order-badges">${canal}${status}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('.hs-order').forEach(card => {
    card.addEventListener('click', () => selectOrder(card.dataset.id));
  });
}

function orderLabel(o, tableName) {
  if (o.channel === 'rapido') return 'Turno #' + String(o.turno || 0).padStart(3,'0');
  if (o.channel === 'domicilio') return o.customer_name ? 'Domicilio — ' + o.customer_name : 'Domicilio';
  return tableName ? tableName : (o.customer_name || 'Mesa');
}

function canalBadge(ch) {
  if (ch === 'rapido')    return '<span class="hs-badge hs-badge-rapido">Rápido</span>';
  if (ch === 'domicilio') return '<span class="hs-badge hs-badge-domicilio">Domicilio</span>';
  return '<span class="hs-badge hs-badge-salon">Salón</span>';
}

function statusBadge(st) {
  if (st === 'paid' || st === 'completed') return '<span class="hs-badge hs-badge-paid">Pagado</span>';
  if (st === 'cancelled')  return '<span class="hs-badge hs-badge-cancelled">Anulado</span>';
  if (st === 'pendiente_pago') return '<span class="hs-badge hs-badge-pendiente">Pendiente de pago</span>';
  if (st === 'in_progress' || st === 'ready') return '<span class="hs-badge hs-badge-inprogress">En preparación</span>';
  return '<span class="hs-badge hs-badge-cancelled">' + st + '</span>';
}

/* ─── Seleccionar pedido y mostrar detalle ─── */
async function selectOrder(id) {
  HS.selectedId = id;
  renderList();

  const o = HS.orders.find(x => x.id === id);
  if (!o) return;

  const detailEl = document.getElementById('hs-detail');
  detailEl.innerHTML = `<div class="hs-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Cargando detalle…</p></div>`;

  await loadItems(id);
  renderDetail(o);
}

function renderDetail(o) {
  const table  = HS.tables[o.table_id];
  const waiter = HS.users[o.waiter_id] || '—';
  const label  = orderLabel(o, table);
  const items  = HS.items[o.id] || [];
  const itemsTotal = items.reduce((s, i) => s + (i.total || 0), 0);

  const canal  = o.channel === 'rapido' ? 'Venta rápida' : o.channel === 'domicilio' ? 'Domicilio' : 'Salón';
  const payMethod = o.payment_method ? fmtPayMethod(o.payment_method) : '—';
  const discount  = o.discount || 0;

  const dateLabel = HS.range === 'today' ? 'Hoy' : fmtDate(o.created_at);

  /* Cronología */
  const tl = buildTimeline(o);

  document.getElementById('hs-detail').innerHTML = `
    <div class="hs-dhead">
      <div>
        <div class="hs-dtitle">${label}</div>
        <div class="hs-dsub">
          <span>${dateLabel} ${fmtTime(o.created_at)}</span>
          <span class="hs-dsub-sep">·</span>
          <span>${waiter}</span>
          <span class="hs-dsub-sep">·</span>
          <span>${canal}</span>
          ${canalBadge(o.channel)}
          ${statusBadge(o.status)}
        </div>
      </div>
      <div class="hs-dactions">
        <button class="btn-hs btn-hs-ghost" onclick="printComanda('${o.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Reimprimir comanda
        </button>
        <button class="btn-hs btn-hs-primary" onclick="printReceipt('${o.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
          Reimprimir recibo
        </button>
      </div>
    </div>

    <div class="hs-kpis">
      <div class="hs-kpi"><div class="hs-kpi-label">Total cobrado</div><div class="hs-kpi-value">${COPF(o.total)}</div></div>
      <div class="hs-kpi"><div class="hs-kpi-label">Método de pago</div><div class="hs-kpi-value">${payMethod}</div></div>
      <div class="hs-kpi"><div class="hs-kpi-label">Descuento</div><div class="hs-kpi-value">${COPF(discount)}</div></div>
      <div class="hs-kpi"><div class="hs-kpi-label">Canal</div><div class="hs-kpi-value">${canal}</div></div>
    </div>

    <div class="hs-section">
      <div class="hs-section-title">Ítems pedidos</div>
      ${items.length ? `
      <table class="hs-table">
        <thead><tr><th>Producto</th><th>Cant.</th><th>Precio unit.</th><th>Total</th></tr></thead>
        <tbody>${items.map(i => `
          <tr>
            <td>${i.product_name || '—'}</td>
            <td>${i.quantity || 1}</td>
            <td>${COPF(i.unit_price || i.product_price || 0)}</td>
            <td>${COPF(i.total || 0)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="3">Total</td><td>${COPF(o.total)}</td></tr></tfoot>
      </table>` : '<div style="color:#94A3B8;font-size:13px">Sin ítems registrados</div>'}
    </div>

    <div class="hs-section">
      <div class="hs-section-title">Cronología</div>
      <div class="hs-timeline">${tl}</div>
    </div>
  `;
}

function buildTimeline(o) {
  const steps = [];

  steps.push({ done: true, event: 'Pedido creado', time: fmtTime(o.created_at) + (HS.users[o.waiter_id] ? ' · ' + HS.users[o.waiter_id] : '') });

  if (o.visible_cocina) {
    steps.push({ done: true, event: 'Enviado a cocina', time: fmtTime(o.created_at) });
  }

  if (o.delivered_at) {
    const min = Math.round((new Date(o.delivered_at) - new Date(o.created_at)) / 60000);
    steps.push({ done: true, event: 'Entregado al cliente', time: fmtTime(o.delivered_at) + (min > 0 ? ' · ' + min + ' min de preparación' : '') });
  }

  const isPaid = o.status === 'paid' || o.status === 'completed';
  const abonado = Number(o.paid_amount) || 0;
  if (!isPaid && abonado > 0 && o.status !== 'cancelled') {
    // Sin el domicilio: es lo que de verdad falta por cobrar.
    const faltaAb = Math.max(0, (Number(o.total) || 0) - (Number(o.delivery_fee) || 0) - abonado);
    steps.push({ done: true, event: 'Abono recibido · ' + COPF(abonado) + (faltaAb > 0 ? ' (faltan ' + COPF(faltaAb) + ')' : ''), time: '' });
  }
  if (isPaid) {
    const payMethod = o.payment_method ? ' · ' + fmtPayMethod(o.payment_method) + ' ' + COPF(o.total) : '';
    steps.push({ done: true, event: 'Pago recibido' + payMethod, time: fmtTime(o.updated_at || o.created_at) });
  } else if (o.status === 'pendiente_pago') {
    steps.push({ done: false, current: true, event: 'Pendiente de pago', time: 'En espera de cobro' });
  } else if (o.status === 'cancelled') {
    steps.push({ done: false, event: 'Pedido anulado', time: fmtTime(o.updated_at || o.created_at) });
  }

  return steps.map(s => `
    <div class="hs-tl-item">
      <div class="hs-tl-left">
        <div class="hs-tl-dot${s.done ? ' done' : s.current ? ' current' : ''}"></div>
        <div class="hs-tl-line"></div>
      </div>
      <div>
        <div class="hs-tl-event">${s.event}</div>
        <div class="hs-tl-time">${s.time}</div>
      </div>
    </div>`).join('');
}

function fmtPayMethod(m) {
  /* La regla vive en pos-metodos.js y es la misma para todas las pantallas:
     ids configurados, marcadores del sistema, claves viejas en ingles y texto
     libre del bot. Aqui habia una copia que se iba quedando atras. */
  try { if (window.posMetodos) return posMetodos.nombre(m); } catch (e) {}
  return m || 'Otros';
}

/* ─── Imprimir ─── */
function printComanda(orderId) {
  const o = HS.orders.find(x => x.id === orderId);
  if (!o) return;
  const items = HS.items[orderId] || [];
  const table = HS.tables[o.table_id];
  const label = orderLabel(o, table);
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Comanda</title><style>
    body{font-family:Arial,sans-serif;font-size:14px;padding:16px;}
    h2{font-size:16px;margin:0 0 4px;}
    .sub{font-size:12px;color:#555;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;}
    td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left;}
    th{font-size:11px;color:#999;text-transform:uppercase;}
    td:last-child{text-align:right;font-weight:bold;}
  </style></head><body>
    <h2>COMANDA — ${label}</h2>
    <div class="sub">${fmtTime(o.created_at)} · ${HS.users[o.waiter_id] || '—'}</div>
    <table><thead><tr><th>Producto</th><th>Cant.</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${i.product_name||'—'}</td><td>${i.quantity||1}</td></tr>`).join('')}
    </tbody></table>
  </body></html>`);
  w.document.close();
  w.print();
}

function printReceipt(orderId) {
  const o = HS.orders.find(x => x.id === orderId);
  if (!o) return;
  const items = HS.items[orderId] || [];
  const table = HS.tables[o.table_id];
  const label = orderLabel(o, table);
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Recibo</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:16px;max-width:340px;}
    h2{font-size:15px;margin:0 0 2px;text-align:center;}
    .center{text-align:center;font-size:11px;color:#555;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;}
    td{padding:5px 2px;border-bottom:1px solid #f0f0f0;}
    td:last-child{text-align:right;font-weight:bold;}
    .total td{font-size:15px;font-weight:bold;border-top:2px solid #000;border-bottom:none;padding-top:8px;}
    .foot{margin-top:14px;font-size:11px;color:#777;text-align:center;}
  </style></head><body>
    <h2>${(function(){ try { return localStorage.getItem('pos.brand.restaurante') || 'Recibo'; } catch(e){ return 'Recibo'; } })()}</h2>
    <div class="center">${label} · ${fmtTime(o.created_at)}</div>
    <table><tbody>
    ${items.map(i => `<tr><td>${i.product_name||'—'} ×${i.quantity||1}</td><td>${COPF(i.total||0)}</td></tr>`).join('')}
    </tbody><tfoot><tr class="total"><td>TOTAL</td><td>${COPF(o.total)}</td></tr></tfoot></table>
    <div class="foot">Método de pago: ${fmtPayMethod(o.payment_method || '—')}<br>¡Gracias por su visita!</div>
  </body></html>`);
  w.document.close();
  w.print();
}

/* ─── UI: filtros y búsqueda ─── */
function bindFilters() {
  /* Chips de fecha */
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      HS.range = btn.dataset.range;
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      HS.selectedId = null;
      HS.items = {};
      loadAndRender();
    });
  });

  /* Canal dropdown */
  const canalBtn = document.getElementById('btn-canal-filter');
  const canalDd  = document.getElementById('canal-dropdown');
  canalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    canalDd.classList.toggle('open');
  });
  document.addEventListener('click', () => canalDd.classList.remove('open'));
  document.querySelectorAll('[data-canal]').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      HS.canal = opt.dataset.canal;
      document.querySelectorAll('[data-canal]').forEach(o => o.classList.remove('on'));
      opt.classList.add('on');
      const label = opt.textContent.trim();
      canalBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>${HS.canal === 'all' ? 'Canal' : label}`;
      canalBtn.classList.toggle('on', HS.canal !== 'all');
      canalDd.classList.remove('open');
      renderList();
    });
  });

  /* Búsqueda */
  const searchInput = document.getElementById('hs-search');
  const searchClear = document.getElementById('hs-search-clear');
  searchInput.addEventListener('input', () => {
    HS.query = searchInput.value;
    searchClear.hidden = !HS.query;
    renderList();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    HS.query = '';
    searchClear.hidden = true;
    searchInput.focus();
    renderList();
  });
}

/* ─── Boot ─── */
async function loadAndRender() {
  document.getElementById('hs-order-list').innerHTML = `<div class="hs-empty">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    <p>Cargando…</p></div>`;
  await loadOrders();
  renderList();
}

document.addEventListener('DOMContentLoaded', async () => {
  /* Los pagos guardan el ID del metodo: para mostrarlo hay que traducirlo con
     la configuracion. Se carga una vez; si falla, fmtPayMethod tiene respaldo. */
  try {
    if (window.posMetodos && window._pos) {
      window._pos.on('core:ready', function(){ posMetodos.cargar(window._pos.sb, window._pos.state.branchId); });
    }
  } catch (e) {}
  /* Reloj */
  function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('sb-date');
    const timeEl = document.getElementById('sb-time');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('es-CO', { weekday:'short', day:'numeric', month:'short' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  /* Auth + branch */
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = 'index.html'; return; }

    const meta = user.user_metadata || {};
    const nombre = meta.nombre || meta.name || user.email || '—';
    const rol    = meta.role || 'Usuario';
    const initials = nombre.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

    document.getElementById('sb-user-name').textContent = nombre;
    document.getElementById('sb-role').textContent = rol;
    document.getElementById('sb-brand-name').textContent = 'Cobra POS';
    document.getElementById('tb-avatar').textContent = initials;
    document.getElementById('tb-user').textContent = nombre;
    document.getElementById('tb-role').textContent = rol;

    HS.branchId = meta.branch_id || null;
    if (HS.branchId) {
      const { data: branch } = await sb.from('branches').select('name').eq('id', HS.branchId).maybeSingle();
      // Nombre del restaurante en el sidebar: pos-brand.js.
    }
  } catch(e) {
    console.warn('auth:', e);
  }

  /* Datos de apoyo */
  await Promise.all([loadUsers(), loadTables()]);

  /* Vincular filtros */
  bindFilters();

  /* Carga inicial */
  await loadAndRender();
});
