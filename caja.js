/* ============================================================
   caja.js  —  Lumen POS · Módulo de Caja
   ============================================================ */

// ── Estado global ─────────────────────────────────────────────
const S = {
  session: null,      // pos_sessions row activo
  orders: [],         // pos_orders del turno
  items: [],          // pos_order_items del turno
  sessions: [],       // todos los cierres
  branchId: null,
  tenantId: null,
  user: null,
  arqueoContado: null
};

const COPF = n => '$' + Math.round(n || 0).toLocaleString('es-CO');

// ── Boot ───────────────────────────────────────────────────────
window._pos.on('core:ready', async function({ user }) {
  S.user     = user;
  S.branchId = window._pos.state.branchId;
  S.tenantId = window._pos.state.tenantId;

  // Poblar topbar
  const meta = user.user_metadata || {};
  const initials = (meta.nombre || user.email || '??').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const el = id => document.getElementById(id);
  el('user-avatar').textContent = initials;
  el('user-name').textContent   = meta.nombre || user.email;
  el('user-role').textContent   = meta.role   || 'Cajero';

  // Render en blanco primero
  renderCajaState();
  renderMovimientos([]);
  renderMovimientosSummary([]);
  renderCierres([]);
  renderHistorial([]);

  // Cargar datos reales
  await refreshAll();
});

// ── Refresh completo ───────────────────────────────────────────
async function refreshAll() {
  S.session  = await loadActiveSession(S.branchId);
  S.sessions = await loadAllSessions(S.branchId);

  if (S.session) {
    S.orders = await loadOrders(S.branchId, S.session.opened_at);
    S.items  = await loadOrderItems(S.branchId, S.session.opened_at);
  } else {
    S.orders = [];
    S.items  = [];
  }

  const moves = getMoves();
  renderCajaState();
  renderHero(S.orders, moves);
  renderKPIs(S.orders);
  renderDesglosePago(S.orders);
  renderCanalVentas(S.orders, moves);
  renderTopVentas(S.items);
  renderMovimientos(moves);
  renderMovimientosSummary(moves);
  renderCierres(S.sessions);
  renderHistorial(S.orders);
  updateStatusBar();
}

// ── Loaders Supabase ───────────────────────────────────────────
async function loadActiveSession(branchId) {
  try {
    const q = sb.from('pos_sessions').select('*').eq('status', 'open');
    if (branchId) q.eq('branch_id', branchId);
    q.order('opened_at', { ascending: false }).limit(1);
    const { data } = await q;
    return (data && data[0]) || null;
  } catch(e) { console.error('loadActiveSession:', e); return null; }
}

async function loadOrders(branchId, sinceISO) {
  try {
    const q = sb.from('pos_orders').select('*').gte('created_at', sinceISO);
    if (branchId) q.eq('branch_id', branchId);
    q.order('created_at', { ascending: false });
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadOrders:', e); return []; }
}

async function loadOrderItems(branchId, sinceISO) {
  try {
    const q = sb.from('pos_order_items').select('*').gte('created_at', sinceISO);
    if (branchId) q.eq('branch_id', branchId);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadOrderItems:', e); return []; }
}

async function loadAllSessions(branchId) {
  try {
    const q = sb.from('pos_sessions').select('*').eq('status', 'closed');
    if (branchId) q.eq('branch_id', branchId);
    q.order('closed_at', { ascending: false }).limit(30);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadAllSessions:', e); return []; }
}

// ── LocalStorage (movimientos) ─────────────────────────────────
function getMoves() {
  const key = 'lumen.caja.moves.' + (S.session ? S.session.id : 'tmp');
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}

function saveMoves(moves) {
  const key = 'lumen.caja.moves.' + (S.session ? S.session.id : 'tmp');
  localStorage.setItem(key, JSON.stringify(moves));
}

// ── Estado de caja (abierta / cerrada) ────────────────────────
function renderCajaState() {
  const openView   = document.getElementById('caja-open-view');
  const closedView = document.getElementById('caja-closed-view');
  if (S.session) {
    openView.style.display   = '';
    closedView.classList.add('is-hidden');
  } else {
    openView.style.display   = 'none';
    closedView.classList.remove('is-hidden');
  }
}

// ── Hero (efectivo en caja) ────────────────────────────────────
function renderHero(orders, moves) {
  const active = orders.filter(o => o.status !== 'cancelled');
  const ventasEf = active.filter(o => (o.payment_method||'').toLowerCase() === 'efectivo')
                         .reduce((s,o) => s + (o.total||0), 0);
  const ingresos = moves.filter(m => m.type === 'ingreso').reduce((s,m) => s + (m.amount||0), 0);
  const egresos  = moves.filter(m => m.type === 'egreso').reduce((s,m) => s + (m.amount||0), 0);
  const base     = S.session ? (S.session.opening_cash || 0) : 0;
  const total    = base + ventasEf + ingresos - egresos;

  const el = id => document.getElementById(id);
  el('hero-efectivo').textContent   = COPF(total);
  el('hero-apertura').textContent   = COPF(base);
  el('compose-base').textContent    = COPF(base);
  el('compose-ventas-ef').textContent = COPF(ventasEf);
  el('compose-ingresos').textContent  = COPF(ingresos);
  el('compose-egresos').textContent   = COPF(egresos);
  el('compose-total').textContent     = COPF(total);

  if (S.session) {
    const d = new Date(S.session.opened_at);
    el('hero-fecha').textContent  = d.toLocaleDateString('es-CO', { day:'2-digit', month:'short' });
    el('hero-cajero').textContent = S.session.cashier_name || S.user?.user_metadata?.nombre || '—';
    el('hero-turno').innerHTML    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Turno ${S.session.shift_type || '—'}`;
  }
}

// ── KPIs ───────────────────────────────────────────────────────
function renderKPIs(orders) {
  const active    = orders.filter(o => o.status !== 'cancelled');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  const totalVtas = active.reduce((s,o) => s + (o.total||0), 0);
  const ticket    = active.length ? totalVtas / active.length : 0;

  const el = id => document.getElementById(id);
  el('kpi-ventas').textContent      = COPF(totalVtas);
  el('kpi-ventas-sub').textContent  = active.length + ' ventas en el turno';
  el('kpi-ticket').textContent      = COPF(ticket);
  el('kpi-trans').textContent       = orders.length;
  el('kpi-trans-sub').textContent   = cancelled.length + ' anuladas';
}

// ── Desglose por medio de pago ─────────────────────────────────
const METODOS = [
  { key:'efectivo',       label:'Efectivo',      color:'#16A34A' },
  { key:'tarjeta',        label:'Tarjeta',        color:'#5B6BFF' },
  { key:'transferencia',  label:'Transferencia',  color:'#0EA5E9' },
  { key:'nequi',          label:'Nequi',          color:'#8B5CF6' },
  { key:'daviplata',      label:'Daviplata',      color:'#E11D48' },
];

function renderDesglosePago(orders) {
  const active = orders.filter(o => o.status !== 'cancelled');
  const total  = active.reduce((s,o) => s + (o.total||0), 0);
  const cont   = document.getElementById('desglose-pago');
  if (!cont) return;
  if (!active.length) { cont.innerHTML = '<div class="cj-empty-row">Sin ventas este turno</div>'; return; }

  cont.innerHTML = METODOS.map(m => {
    const sub  = active.filter(o => (o.payment_method||'').toLowerCase() === m.key);
    const amt  = sub.reduce((s,o) => s + (o.total||0), 0);
    const pct  = total > 0 ? (amt / total * 100).toFixed(0) : 0;
    return `
      <div class="cj-pay-row">
        <div style="display:flex;align-items:center;gap:9px;flex:1;min-width:0">
          <span style="width:8px;height:8px;border-radius:999px;background:${m.color};flex-shrink:0"></span>
          <span style="font-size:13px;font-weight:600;color:#0F172A;white-space:nowrap">${m.label}</span>
          <div class="cj-bar-wrap"><div class="cj-bar-fill" style="width:${pct}%;background:${m.color}20;border:1px solid ${m.color}50"></div></div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:10px">
          <div style="font-size:13.5px;font-weight:700;color:#0F172A">${COPF(amt)}</div>
          <div style="font-size:11px;color:#94A3B8">${pct}% · ${sub.length} ${sub.length===1?'venta':'ventas'}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Canales de venta ───────────────────────────────────────────
const CANALES = [
  { key:'salon',      label:'Salón',      color:'#5B6BFF' },
  { key:'mostrador',  label:'Mostrador',  color:'#06B6D4' },
  { key:'domicilio',  label:'Domicilio',  color:'#10B981' },
];

function renderCanalVentas(orders, moves) {
  const active = orders.filter(o => o.status !== 'cancelled');
  const cont   = document.getElementById('canales-lista');
  if (!cont) return;

  if (!active.length) {
    cont.innerHTML = '<div class="cj-empty-row">Sin ventas este turno</div>';
  } else {
    cont.innerHTML = CANALES.map(c => {
      const sub = active.filter(o => (o.channel||'').toLowerCase() === c.key);
      const amt = sub.reduce((s,o) => s + (o.total||0), 0);
      return `
        <div class="cj-canal-row">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="width:8px;height:8px;border-radius:999px;background:${c.color}"></span>
            <span style="font-size:13px;font-weight:600;color:#0F172A">${c.label}</span>
            <span style="font-size:11px;color:#94A3B8">${sub.length} ${sub.length===1?'venta':'ventas'}</span>
          </div>
          <span style="font-size:13.5px;font-weight:700;color:#0F172A">${COPF(amt)}</span>
        </div>`;
    }).join('');
  }

  const ingresos = moves.filter(m => m.type==='ingreso').reduce((s,m) => s+(m.amount||0), 0);
  const egresos  = moves.filter(m => m.type==='egreso').reduce((s,m) => s+(m.amount||0), 0);
  document.getElementById('ie-ingresos').textContent = COPF(ingresos);
  document.getElementById('ie-egresos').textContent  = COPF(egresos);
}

// ── Top ventas del turno ───────────────────────────────────────
function renderTopVentas(items) {
  const cont = document.getElementById('top-ventas');
  if (!cont) return;
  if (!items.length) { cont.innerHTML = '<div class="cj-empty-row" style="grid-column:1/-1">Sin ítems este turno</div>'; return; }

  const map = {};
  items.forEach(it => {
    const k = it.product_name || 'Sin nombre';
    if (!map[k]) map[k] = { name: k, qty: 0, total: 0 };
    map[k].qty   += it.quantity || 1;
    map[k].total += (it.product_price||0) * (it.quantity||1);
  });
  const top5 = Object.values(map).sort((a,b) => b.total - a.total).slice(0,5);
  const max  = top5[0]?.total || 1;

  cont.innerHTML = top5.map((p,i) => `
    <div class="cj-top-item">
      <div class="cj-top-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div class="cj-bar-wrap" style="margin-top:5px"><div class="cj-bar-fill" style="width:${(p.total/max*100).toFixed(0)}%;background:#5B6BFF20;border:1px solid #5B6BFF40"></div></div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px">
        <div style="font-size:13px;font-weight:700;color:#0F172A">${COPF(p.total)}</div>
        <div style="font-size:11px;color:#94A3B8">${p.qty} uds</div>
      </div>
    </div>`).join('');
}

// ── Movimientos ────────────────────────────────────────────────
function renderMovimientos(moves) {
  const cont  = document.getElementById('mv-lista');
  const badge = document.getElementById('mv-count');
  if (!cont) return;
  if (badge) badge.textContent = moves.length;

  if (!moves.length) {
    cont.innerHTML = '<div class="cj-empty-row">No hay movimientos en este turno</div>';
    return;
  }
  cont.innerHTML = [...moves].reverse().map(m => {
    const isIn  = m.type === 'ingreso';
    const color = isIn ? '#16A34A' : '#DC2626';
    const sign  = isIn ? '+' : '−';
    const d     = new Date(m.ts);
    const hora  = d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="cj-mv-row">
        <div class="cj-mv-dot" style="background:${isIn?'#DCFCE7':'#FEE2E2'};color:${color}">
          ${isIn
            ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'
            : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#0F172A">${m.concept || '—'}</div>
          <div style="font-size:11.5px;color:#94A3B8">${hora} · ${m.medio || 'Efectivo'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:14px;font-weight:800;color:${color}">${sign} ${COPF(m.amount)}</div>
          <div style="font-size:10.5px;color:#CBD5E1;text-transform:uppercase;letter-spacing:.05em">${isIn?'Ingreso':'Egreso'}</div>
        </div>
      </div>`;
  }).join('');
}

function renderMovimientosSummary(moves) {
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const neto     = ingresos - egresos;
  const el = id => document.getElementById(id);
  el('mv-total-in')   && (el('mv-total-in').textContent  = COPF(ingresos));
  el('mv-total-out')  && (el('mv-total-out').textContent = COPF(egresos));
  el('mv-total-neto') && (el('mv-total-neto').textContent = (neto >= 0 ? '' : '−') + COPF(Math.abs(neto)));
}

// ── Cierres ────────────────────────────────────────────────────
function renderCierres(sessions) {
  const cont = document.getElementById('cierres-grid');
  if (!cont) return;
  if (!sessions.length) {
    cont.innerHTML = '<div class="cj-empty" style="grid-column:1/-1"><div class="cj-empty-inner"><div class="cj-empty-ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg></div><div style="font-size:14px;font-weight:700;color:#0F172A">Sin cierres aún</div><div style="font-size:12px;color:#94A3B8;margin-top:4px">Cuando cierres la caja por primera vez aparecerá aquí.</div></div></div>';
    return;
  }
  cont.innerHTML = sessions.map(s => {
    const dAp  = new Date(s.opened_at);
    const dCi  = new Date(s.closed_at);
    const dur  = Math.round((dCi - dAp) / 60000);
    const hAp  = dAp.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    const hCi  = dCi.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    const fec  = dAp.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'2-digit' });
    return `
      <div class="cj-cierre-card">
        <div class="cj-cierre-head">
          <div style="font-size:11.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em">${fec}</div>
          <div class="cj-cierre-badge">Cerrada</div>
        </div>
        <div class="cj-cierre-kpi">
          <div><div style="font-size:10.5px;color:#94A3B8">Ventas</div><div style="font-size:16px;font-weight:800;color:#0F172A">${COPF(s.total_sales||0)}</div></div>
          <div style="text-align:right"><div style="font-size:10.5px;color:#94A3B8">Cierre</div><div style="font-size:16px;font-weight:800;color:#0F172A">${COPF(s.closing_cash||0)}</div></div>
        </div>
        <div style="height:1px;background:#ECEEF2;margin:10px 0"></div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#64748B">
          <span>${hAp} → ${hCi}</span>
          <span>${dur < 60 ? dur+'min' : (dur/60).toFixed(1)+'h'}</span>
        </div>
        ${s.cashier_name ? `<div style="font-size:11.5px;color:#94A3B8;margin-top:3px">${s.cashier_name}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Historial ──────────────────────────────────────────────────
function renderHistorial(orders) {
  const cont = document.getElementById('hist-lista');
  if (!cont) return;

  const active    = orders.filter(o => o.status !== 'cancelled');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  const total     = active.reduce((s,o) => s+(o.total||0), 0);
  const hc        = document.getElementById('hist-count');
  const ht        = document.getElementById('hist-total');
  if (hc) hc.textContent = `${active.length} ventas · ${cancelled.length} anuladas`;
  if (ht) ht.textContent = COPF(total);

  if (!orders.length) {
    cont.innerHTML = '<div class="cj-empty-row">No hay ventas en este turno</div>';
    return;
  }
  const PAGO_COLOR = { efectivo:'#16A34A', tarjeta:'#5B6BFF', transferencia:'#0EA5E9', nequi:'#8B5CF6', daviplata:'#E11D48' };
  cont.innerHTML = orders.map(o => {
    const anulada = o.status === 'cancelled';
    const d       = new Date(o.created_at);
    const hora    = d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    const pm      = (o.payment_method||'efectivo').toLowerCase();
    const color   = PAGO_COLOR[pm] || '#94A3B8';
    const shortId = (o.id||'').slice(-4).toUpperCase();
    return `
      <div class="cj-hist-row ${anulada?'cancelled':''}">
        <div style="font-size:12px;font-weight:700;color:#94A3B8;width:42px;flex-shrink:0">#${shortId}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:${anulada?'#94A3B8':'#0F172A'}">${o.waiter_name || 'Sin nombre'}</div>
          <div style="font-size:11.5px;color:#94A3B8">${hora} · ${o.channel||'salón'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:10px">
          <div style="font-size:14px;font-weight:800;color:${anulada?'#94A3B8':'#0F172A'}">${COPF(o.total)}</div>
          <div style="font-size:11px;font-weight:600;color:${color};text-transform:capitalize">${anulada?'Anulada':o.payment_method||'Efectivo'}</div>
        </div>
      </div>`;
  }).join('');

  // filtro de búsqueda
  const inp = document.getElementById('hist-search');
  if (inp && !inp.dataset.bound) {
    inp.dataset.bound = '1';
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      document.querySelectorAll('.cj-hist-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

// ── Status bar sidebar ─────────────────────────────────────────
function updateStatusBar() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const sub   = document.getElementById('status-sub');
  const ind   = document.getElementById('cj-status-indicator');
  if (!dot) return;
  if (S.session) {
    dot.style.background   = '#16A34A';
    label.textContent      = 'Caja abierta';
    ind.classList.replace('closed', 'open');
    const d = new Date(S.session.opened_at);
    sub.textContent = 'Desde ' + d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
  } else {
    dot.style.background   = '#94A3B8';
    label.textContent      = 'Caja cerrada';
    ind.classList.replace('open', 'closed');
    sub.textContent        = '—';
  }
}

// ── Navegación de pantallas ────────────────────────────────────
const CRUMB_LABELS = { caja:'Apertura y cierre', movimientos:'Ingresos y egresos', cierres:'Cierres de caja', historial:'Historial de ventas' };

document.querySelectorAll('.cj-nav-item[data-screen]').forEach(btn => {
  btn.addEventListener('click', function() {
    const target = this.dataset.screen;
    document.querySelectorAll('.cj-nav-item[data-screen]').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    this.classList.add('on');
    const sc = document.getElementById('screen-' + target);
    if (sc) sc.classList.add('on');
    const crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = CRUMB_LABELS[target] || target;
  });
});

// ── Paneles ────────────────────────────────────────────────────
function openPanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('is-hidden');
}
function closePanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('is-hidden');
}
window.openPanel  = openPanel;
window.closePanel = closePanel;

// Cerrar overlay al click fuera del modal
document.querySelectorAll('.cj-overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov) closePanel(ov.id);
  });
});

// ── Segmentos ──────────────────────────────────────────────────
function segSelect(btn, groupId) {
  document.querySelectorAll('#' + groupId + ' button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}
window.segSelect = segSelect;

// ── Medio de pago en movimiento ────────────────────────────────
function selectMedio(btn) {
  document.querySelectorAll('.mov-medio-btn').forEach(b => {
    b.style.background   = '';
    b.style.borderColor  = '';
    b.style.color        = '';
    b.classList.remove('active-medio');
  });
  btn.classList.add('active-medio');
  btn.style.background  = '#DCFCE7';
  btn.style.borderColor = '#16A34A';
  btn.style.color       = '#16A34A';
}
window.selectMedio = selectMedio;

// ── Botón: Abrir caja ──────────────────────────────────────────
document.getElementById('btn-confirmar-abrir').addEventListener('click', async function() {
  if (!S.session === false) { showToast('La caja ya está abierta'); return; }
  const monto     = parseFloat(document.getElementById('abrir-monto').value) || 0;
  const turnoBtn  = document.querySelector('#seg-turno button.on');
  const turno     = turnoBtn ? turnoBtn.textContent.trim() : 'Noche';
  await handleOpenSession(monto, turno);
  closePanel('panel-abrir');
});

document.getElementById('btn-cerrar').addEventListener('click', function() {
  // Pre-llenar resumen en panel cerrar
  const moves     = getMoves();
  const active    = S.orders.filter(o => o.status !== 'cancelled');
  const ventasEf  = active.filter(o => (o.payment_method||'').toLowerCase() === 'efectivo').reduce((s,o) => s+(o.total||0), 0);
  const ingresos  = moves.filter(m => m.type==='ingreso').reduce((s,m) => s+(m.amount||0), 0);
  const egresos   = moves.filter(m => m.type==='egreso').reduce((s,m) => s+(m.amount||0), 0);
  const base      = S.session ? (S.session.opening_cash||0) : 0;
  const totalVtas = active.reduce((s,o) => s+(o.total||0), 0);
  const efectivo  = base + ventasEf + ingresos - egresos;

  document.getElementById('cerrar-esperado').textContent = COPF(efectivo);
  document.getElementById('cerrar-sub').textContent      = 'Caja 01 · ' + active.length + ' ventas';

  const resumen = document.getElementById('cerrar-resumen');
  resumen.innerHTML = [
    ['Total ventas',       COPF(totalVtas), '#0F172A'],
    ['Ventas en efectivo', COPF(ventasEf),  '#16A34A'],
    ['Base de apertura',   COPF(base),      '#0F172A'],
    ['Ingresos',           COPF(ingresos),  '#16A34A'],
    ['Egresos',            COPF(egresos),   '#DC2626'],
  ].map(([k,v,c]) => `
    <div style="display:flex;justify-content:space-between;font-size:12.5px;color:#64748B;padding:3px 0;border-bottom:1px solid #F1F5F9">
      <span>${k}</span><span style="font-weight:700;color:${c}">${v}</span>
    </div>`).join('');

  openPanel('panel-cerrar');
});

document.getElementById('btn-confirmar-cerrar').addEventListener('click', async function() {
  if (!S.session) { showToast('No hay sesión activa'); return; }
  const moves    = getMoves();
  const active   = S.orders.filter(o => o.status !== 'cancelled');
  const ventasEf = active.filter(o => (o.payment_method||'').toLowerCase() === 'efectivo').reduce((s,o) => s+(o.total||0), 0);
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0), 0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0), 0);
  const base     = S.session.opening_cash || 0;
  const totalVtas= active.reduce((s,o)=>s+(o.total||0), 0);
  const efectivo = base + ventasEf + ingresos - egresos;
  await handleCloseSession(efectivo, totalVtas);
  closePanel('panel-cerrar');
});

// ── Botón: Movimiento ──────────────────────────────────────────
document.getElementById('btn-mov').addEventListener('click', function() {
  if (!S.session) { showToast('Abre la caja primero'); return; }
  openPanel('panel-movimiento');
});

document.getElementById('btn-confirmar-mov').addEventListener('click', function() {
  if (!S.session) { showToast('Abre la caja primero'); return; }
  const monto   = parseFloat(document.getElementById('mov-monto').value) || 0;
  if (!monto)   { showToast('Ingresa un monto válido'); return; }
  const concept = document.getElementById('mov-concepto').value.trim() || '—';
  const tipoBtn = document.querySelector('#seg-tipo-mov button.on');
  const tipo    = tipoBtn ? (tipoBtn.textContent.trim().toLowerCase().includes('ingreso') ? 'ingreso' : 'egreso') : 'egreso';
  const medioBtn= document.querySelector('.mov-medio-btn.active-medio');
  const medio   = medioBtn ? medioBtn.dataset.medio : 'Efectivo';
  handleAddMovimiento(tipo, monto, concept, medio);
  document.getElementById('mov-monto').value   = '';
  document.getElementById('mov-concepto').value= '';
  closePanel('panel-movimiento');
});

// ── Botón: Arqueo ──────────────────────────────────────────────
document.getElementById('btn-arqueo').addEventListener('click', function() {
  S.arqueoContado = null;
  document.querySelectorAll('.denom-input').forEach(inp => { inp.value = ''; });
  document.querySelectorAll('.cj-denom-total').forEach(td => { td.textContent = '$0'; });
  document.getElementById('subtotal-billetes').textContent = '$0';
  document.getElementById('subtotal-monedas').textContent  = '$0';
  document.getElementById('arqueo-contado').textContent    = '$0';
  document.getElementById('arqueo-pie').textContent        = '$0';
  document.getElementById('arqueo-diff').textContent       = '$0';
  updateArqueoEsperado();
  openPanel('panel-arqueo');
});

document.getElementById('btn-guardar-arqueo').addEventListener('click', function() {
  S.arqueoContado = getArqueoContado();
  showToast('Arqueo guardado: ' + COPF(S.arqueoContado));
  closePanel('panel-arqueo');
});

// Arqueo real-time
document.querySelectorAll('.denom-input').forEach(inp => {
  inp.addEventListener('input', updateArqueoTotals);
});

function updateArqueoTotals() {
  let billetes = 0, monedas = 0;
  const allRows = document.querySelectorAll('.cj-denom');
  // billetes = primer .cj-denom, monedas = segundo
  const groups = [[], []];
  document.querySelectorAll('.denom-input').forEach((inp, i) => {
    const val = parseInt(inp.value || '0', 10) || 0;
    const denom = parseInt(inp.dataset.val, 10);
    const total = val * denom;
    const td    = inp.closest('.cj-denom-row')?.querySelector('.cj-denom-total');
    if (td) td.textContent = COPF(total);
    // monedas: denom <= 1000 && parent es el segundo .cj-denom
    const group = inp.closest('.cj-denom');
    const allGroups = [...document.querySelectorAll('.cj-denom')];
    const gIdx = allGroups.indexOf(group);
    if (gIdx === 0) billetes += total;
    else monedas += total;
  });
  const total = billetes + monedas;
  document.getElementById('subtotal-billetes').textContent = COPF(billetes);
  document.getElementById('subtotal-monedas').textContent  = COPF(monedas);
  document.getElementById('arqueo-contado').textContent    = COPF(total);
  document.getElementById('arqueo-pie').textContent        = COPF(total);
  updateArqueoEsperado();
}

function getArqueoContado() {
  let total = 0;
  document.querySelectorAll('.denom-input').forEach(inp => {
    const val   = parseInt(inp.value || '0', 10) || 0;
    const denom = parseInt(inp.dataset.val, 10);
    total += val * denom;
  });
  return total;
}

function updateArqueoEsperado() {
  const moves    = getMoves();
  const active   = S.orders.filter(o => o.status !== 'cancelled');
  const ventasEf = active.filter(o => (o.payment_method||'').toLowerCase() === 'efectivo').reduce((s,o)=>s+(o.total||0), 0);
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0), 0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0), 0);
  const base     = S.session ? (S.session.opening_cash||0) : 0;
  const esperado = base + ventasEf + ingresos - egresos;
  document.getElementById('arqueo-esperado').textContent = COPF(esperado);
  const contado = getArqueoContado();
  const diff    = contado - esperado;
  const diffEl  = document.getElementById('arqueo-diff');
  const diffLbl = document.getElementById('arqueo-diff-lbl');
  const diffCard= document.getElementById('arqueo-diff-card');
  if (diffEl) {
    diffEl.textContent = (diff >= 0 ? '+' : '') + COPF(Math.abs(diff));
    diffEl.style.color = diff === 0 ? '#0F172A' : diff > 0 ? '#16A34A' : '#DC2626';
  }
  if (diffLbl) diffLbl.textContent = diff > 0 ? 'Sobrante' : diff < 0 ? 'Faltante' : 'Diferencia';
  if (diffCard) diffCard.style.borderColor = diff === 0 ? '#ECEEF2' : diff > 0 ? '#DCFCE7' : '#FEE2E2';
}

// ── Acciones Supabase ──────────────────────────────────────────
async function handleOpenSession(openingCash, shiftType) {
  try {
    const payload = {
      status:        'open',
      opening_cash:  openingCash,
      shift_type:    shiftType,
      opened_at:     new Date().toISOString(),
      cashier_name:  S.user?.user_metadata?.nombre || S.user?.email || 'Cajero',
    };
    if (S.branchId) payload.branch_id = S.branchId;
    if (S.tenantId) payload.tenant_id = S.tenantId;
    const { data, error } = await sb.from('pos_sessions').insert(payload).select().single();
    if (error) { showToast('Error al abrir caja: ' + error.message); return; }
    showToast('Caja abierta correctamente');
    await refreshAll();
  } catch(e) { console.error('handleOpenSession:', e); showToast('Error al abrir caja'); }
}

async function handleCloseSession(closingCash, totalSales) {
  try {
    const { error } = await sb.from('pos_sessions').update({
      status:       'closed',
      closing_cash:  closingCash,
      total_sales:   totalSales || 0,
      closed_at:     new Date().toISOString(),
    }).eq('id', S.session.id);
    if (error) { showToast('Error al cerrar caja: ' + error.message); return; }
    showToast('Caja cerrada correctamente');
    await refreshAll();
  } catch(e) { console.error('handleCloseSession:', e); showToast('Error al cerrar caja'); }
}

function handleAddMovimiento(type, amount, concept, medio) {
  const moves = getMoves();
  moves.push({ id: Date.now(), type, amount, concept, medio, ts: new Date().toISOString() });
  saveMoves(moves);
  const current = getMoves();
  renderHero(S.orders, current);
  renderCanalVentas(S.orders, current);
  renderMovimientos(current);
  renderMovimientosSummary(current);
  showToast((type === 'ingreso' ? 'Ingreso' : 'Egreso') + ' registrado: ' + COPF(amount));
}

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('cj-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cj-toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0F172A;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;opacity:0;transition:opacity .25s;max-width:320px;line-height:1.4;box-shadow:0 4px 16px rgba(0,0,0,.25)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}
