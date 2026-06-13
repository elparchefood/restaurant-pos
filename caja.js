/* ============================================================
   caja.js  —  Lumen POS · Módulo de Caja
   ============================================================ */

const S = {
  session: null, orders: [], items: [], sessions: [],
  branchId: null, tenantId: null, user: null, arqueoContado: null
};

const COPF = n => '$' + Math.round(n || 0).toLocaleString('es-CO');

// SVGs de medios de pago (coinciden con el diseño)
const MEDIO_SVG = {
  efectivo:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  tarjeta:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  transferencia: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>',
  nequi:         '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
  daviplata:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
};

const METODOS = [
  { key:'efectivo',      label:'Efectivo',      color:'#16A34A', bg:'#DCFCE7' },
  { key:'tarjeta',       label:'Tarjeta',        color:'#5B6BFF', bg:'#EEF2FF' },
  { key:'transferencia', label:'Transferencia',  color:'#0EA5E9', bg:'#F0F9FF' },
  { key:'nequi',         label:'Nequi',          color:'#8B5CF6', bg:'#F5F3FF' },
  { key:'daviplata',     label:'Daviplata',      color:'#E11D48', bg:'#FFF1F2' },
];

const CANALES = [
  { key:'salon',     label:'Salón',     color:'#5B6BFF', bg:'#EEF2FF' },
  { key:'mostrador', label:'Mostrador', color:'#06B6D4', bg:'#CFFAFE' },
  { key:'domicilio', label:'Domicilio', color:'#10B981', bg:'#D1FAE5' },
];

// ── Boot ───────────────────────────────────────────────────────
window._pos.on('core:ready', async function({ user }) {
  S.user     = user;
  S.branchId = window._pos.state.branchId;
  S.tenantId = window._pos.state.tenantId;

  const meta = user.user_metadata || {};
  const initials = (meta.nombre || user.email || '??').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const el = id => document.getElementById(id);
  el('user-avatar').textContent = initials;
  el('user-name').textContent   = meta.nombre || user.email;
  el('user-role').textContent   = meta.role   || 'Cajero';

  renderCajaState();
  renderDesglosePago([]);
  renderCanalVentas([], []);
  renderTopVentas([]);
  renderMovimientos([]);
  renderMovimientosSummary([]);
  renderCierres([]);
  renderHistorial([]);

  await refreshAll();
});

// ── Refresh ────────────────────────────────────────────────────
async function refreshAll() {
  S.session  = await loadActiveSession(S.branchId);
  S.sessions = await loadAllSessions(S.branchId);
  if (S.session) {
    S.orders = await loadOrders(S.branchId, S.session.opened_at);
    S.items  = await loadOrderItems(S.branchId, S.session.opened_at);
  } else { S.orders = []; S.items = []; }
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

// ── Loaders ────────────────────────────────────────────────────
async function loadActiveSession(branchId) {
  try {
    const q = sb.from('pos_sessions').select('*').eq('status','open');
    if (branchId) q.eq('branch_id', branchId);
    q.order('opened_at',{ascending:false}).limit(1);
    const { data } = await q;
    return (data && data[0]) || null;
  } catch(e) { console.error('loadActiveSession:',e); return null; }
}

async function loadOrders(branchId, sinceISO) {
  try {
    const q = sb.from('pos_orders').select('*').gte('created_at', sinceISO);
    if (branchId) q.eq('branch_id', branchId);
    q.order('created_at',{ascending:false});
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadOrders:',e); return []; }
}

async function loadOrderItems(branchId, sinceISO) {
  try {
    const q = sb.from('pos_order_items').select('*').gte('created_at', sinceISO);
    if (branchId) q.eq('branch_id', branchId);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadOrderItems:',e); return []; }
}

async function loadAllSessions(branchId) {
  try {
    const q = sb.from('pos_sessions').select('*').eq('status','closed');
    if (branchId) q.eq('branch_id', branchId);
    q.order('closed_at',{ascending:false}).limit(30);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadAllSessions:',e); return []; }
}

// ── localStorage ───────────────────────────────────────────────
function getMoves() {
  const key = 'lumen.caja.moves.' + (S.session ? S.session.id : 'tmp');
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}
function saveMoves(moves) {
  const key = 'lumen.caja.moves.' + (S.session ? S.session.id : 'tmp');
  localStorage.setItem(key, JSON.stringify(moves));
}

// ── Estado caja abierta/cerrada ────────────────────────────────
function renderCajaState() {
  const openV   = document.getElementById('caja-open-view');
  const closedV = document.getElementById('caja-closed-view');
  if (S.session) {
    openV.style.display = '';
    closedV.classList.add('is-hidden');
  } else {
    openV.style.display = 'none';
    closedV.classList.remove('is-hidden');
  }
}

// ── Hero ───────────────────────────────────────────────────────
function renderHero(orders, moves) {
  const active   = orders.filter(o => o.status !== 'cancelled');
  const ventasEf = active.filter(o => (o.payment_method||'').toLowerCase()==='efectivo').reduce((s,o)=>s+(o.total||0),0);
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session ? (S.session.opening_cash||0) : 0;
  const total    = base + ventasEf + ingresos - egresos;
  const el       = id => document.getElementById(id);
  el('hero-efectivo').textContent      = COPF(total);
  el('hero-apertura').textContent      = COPF(base);
  el('compose-base').textContent       = COPF(base);
  el('compose-ventas-ef').textContent  = COPF(ventasEf);
  el('compose-ingresos').textContent   = COPF(ingresos);
  el('compose-egresos').textContent    = COPF(egresos);
  el('compose-total').textContent      = COPF(total);
  if (S.session) {
    const d = new Date(S.session.opened_at);
    const fecha = d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hora  = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    el('hero-fecha').textContent  = fecha + ' · ' + hora;
    el('hero-cajero').textContent = S.session.cashier_name || (S.user?.user_metadata?.nombre) || '—';
    el('hero-turno').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Turno ${S.session.shift_type||'—'}`;
  }
}

// ── KPIs ───────────────────────────────────────────────────────
function renderKPIs(orders) {
  const active    = orders.filter(o=>o.status!=='cancelled');
  const cancelled = orders.filter(o=>o.status==='cancelled');
  const total     = active.reduce((s,o)=>s+(o.total||0),0);
  const ticket    = active.length ? total/active.length : 0;
  const el        = id => document.getElementById(id);
  el('kpi-ventas').textContent     = COPF(total);
  el('kpi-ventas-sub').textContent = active.length + ' ventas en el turno';
  el('kpi-ticket').textContent     = COPF(ticket);
  el('kpi-trans').textContent      = orders.length;
  el('kpi-trans-sub').textContent  = cancelled.length + ' anuladas';
}

// ── Desglose por medio de pago ─────────────────────────────────
function renderDesglosePago(orders) {
  const active = orders.filter(o=>o.status!=='cancelled');
  const total  = active.reduce((s,o)=>s+(o.total||0),0);
  METODOS.forEach(m => {
    const amt = active.filter(o=>(o.payment_method||'').toLowerCase()===m.key).reduce((s,o)=>s+(o.total||0),0);
    const pct = total > 0 ? (amt/total*100).toFixed(1) : 0;
    const valEl = document.getElementById('dp-'+m.key+'-val');
    const barEl = document.getElementById('dp-'+m.key+'-bar');
    if (valEl) valEl.textContent = COPF(amt);
    if (barEl) barEl.style.width = pct + '%';
  });
}

// ── Canales de venta ───────────────────────────────────────────
function renderCanalVentas(orders, moves) {
  const active = orders.filter(o=>o.status!=='cancelled');
  CANALES.forEach(c => {
    const amt = active.filter(o=>(o.channel||'').toLowerCase()===c.key).reduce((s,o)=>s+(o.total||0),0);
    const el = document.getElementById('canal-'+c.key);
    if (el) el.textContent = COPF(amt);
  });
  const ingresos = (moves||[]).filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = (moves||[]).filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const eli = document.getElementById('ie-ingresos');
  const ele = document.getElementById('ie-egresos');
  if (eli) eli.textContent = COPF(ingresos);
  if (ele) ele.textContent = COPF(egresos);
}


// ── Top ventas ─────────────────────────────────────────────────
function renderTopVentas(items) {
  const cont = document.getElementById('top-ventas');
  if (!cont) return;
  if (!items.length) {
    cont.innerHTML = '<div class="cj-empty-row">Sin ítems este turno</div>';
    return;
  }
  const map = {};
  items.forEach(it => {
    const k = it.product_name || 'Sin nombre';
    if (!map[k]) map[k] = { name:k, qty:0, total:0 };
    map[k].qty   += (it.quantity||1);
    map[k].total += (it.product_price||0)*(it.quantity||1);
  });
  const top5 = Object.values(map).sort((a,b)=>b.total-a.total).slice(0,5);
  const RANK_CLASS = ['first','','','',''];
  cont.innerHTML = top5.map((p,i) => `
    <div class="cj-top-item">
      <div class="cj-top-rank ${RANK_CLASS[i]}">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div class="cj-top-name">${p.name}</div>
        <div class="cj-top-sub">${p.qty} und · ${COPF(p.total)}</div>
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

  const arrowUp   = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  const arrowDown = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
  const xIcon     = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  cont.innerHTML = [...moves].reverse().map(m => {
    const isIn = m.type === 'ingreso';
    const d    = new Date(m.ts);
    const hora = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const sign = isIn ? '+' : '−';
    const col  = isIn ? '#16A34A' : '#DC2626';
    return `
      <div class="cj-mv-row">
        <div class="cj-mv-ic ${isIn?'in':'out'}">${isIn?arrowUp:arrowDown}</div>
        <div style="flex:1;min-width:0">
          <div class="cj-mv-concept">${m.concept||'—'}</div>
          <div class="cj-mv-meta">${hora} · ${m.medio||'Efectivo'}</div>
        </div>
        <div class="cj-mv-amount" style="color:${col}">${sign}${COPF(m.amount)}</div>
        <button class="cj-row-btn danger" onclick="deleteMov('${m.id}')">${xIcon}</button>
      </div>`;
  }).join('');
}

function renderMovimientosSummary(moves) {
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const neto     = ingresos - egresos;
  const el = id => document.getElementById(id);
  if(el('mv-total-in'))   el('mv-total-in').textContent   = COPF(ingresos);
  if(el('mv-total-out'))  el('mv-total-out').textContent  = COPF(egresos);
  if(el('mv-total-neto')) {
    el('mv-total-neto').textContent  = (neto>=0?'':'-') + COPF(Math.abs(neto));
    el('mv-total-neto').style.color  = neto >= 0 ? '#166534' : '#991B1B';
  }
}

// ── Cierres ────────────────────────────────────────────────────
function renderCierres(sessions) {
  const cont = document.getElementById('cierres-grid');
  if (!cont) return;

  let html = '';

  // Sesión EN CURSO (si hay caja abierta)
  if (S.session) {
    const dAp   = new Date(S.session.opened_at);
    const fAp   = dAp.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hAp   = dAp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const cajero= S.session.cashier_name || (S.user?.user_metadata?.nombre) || '—';
    const initials = cajero.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    html += `
      <div class="cj-card cj-cierre">
        <div class="cj-cierre-head">
          <div class="cj-cierre-user">
            <div class="cj-cierre-av">${initials}</div>
            <div>
              <div class="cj-cierre-name">${cajero}</div>
              <div class="cj-cierre-caja"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/></svg> Caja 01 · Turno ${S.session.shift_type||'—'}</div>
            </div>
          </div>
          <span class="cj-tag live"><span style="width:6px;height:6px;border-radius:999px;background:#16A34A"></span> En curso</span>
        </div>
        <div class="cj-cierre-rows">
          <div class="cj-cierre-line">
            <span class="lbl"><span class="cj-dot" style="background:#16A34A"></span> Apertura <span class="when">${fAp} · ${hAp}</span></span>
            <span class="cj-amt-open">${COPF(S.session.opening_cash||0)}</span>
          </div>
          <div class="cj-cierre-line">
            <span class="lbl"><span class="cj-dot" style="background:#CBD5E1"></span> Cierre <span class="when">—</span></span>
            <span class="cj-amt-na">—</span>
          </div>
        </div>
      </div>`;
  }

  if (!sessions.length && !S.session) {
    cont.innerHTML = '<div class="cj-empty"><div class="cj-empty-inner"><div class="cj-empty-ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg></div><div style="font-size:14px;font-weight:700;color:#0F172A">Sin cierres aún</div><div style="font-size:12px;color:#94A3B8;margin-top:4px">Cuando cierres la caja aparecerá aquí.</div></div></div>';
    return;
  }

  html += sessions.map(s => {
    const dAp  = new Date(s.opened_at);
    const dCi  = new Date(s.closed_at);
    const fAp  = dAp.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hAp  = dAp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const fCi  = dCi.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hCi  = dCi.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const cajero   = s.cashier_name || '—';
    const initials = cajero.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const shift    = s.shift_type || '—';
    // diferencia de arqueo
    const diff  = s.arqueo_diff || 0;
    let tagHtml = '<span class="cj-tag ok">Cuadrado</span>';
    if (diff > 0) tagHtml = `<span class="cj-tag sobra">Sobrante ${COPF(diff)}</span>`;
    if (diff < 0) tagHtml = `<span class="cj-tag falta">Faltante ${COPF(Math.abs(diff))}</span>`;
    return `
      <div class="cj-card cj-cierre">
        <div class="cj-cierre-head">
          <div class="cj-cierre-user">
            <div class="cj-cierre-av">${initials}</div>
            <div>
              <div class="cj-cierre-name">${cajero}</div>
              <div class="cj-cierre-caja"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/></svg> Caja 01 · Turno ${shift}</div>
            </div>
          </div>
          ${tagHtml}
        </div>
        <div class="cj-cierre-rows">
          <div class="cj-cierre-line">
            <span class="lbl"><span class="cj-dot" style="background:#16A34A"></span> Apertura <span class="when">${fAp} · ${hAp}</span></span>
            <span class="cj-amt-open">${COPF(s.opening_cash||0)}</span>
          </div>
          <div class="cj-cierre-line">
            <span class="lbl"><span class="cj-dot" style="background:#5B6BFF"></span> Cierre <span class="when">${fCi} · ${hCi}</span></span>
            <span class="cj-amt-close">${COPF(s.closing_cash||0)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  cont.innerHTML = html;
}

// ── Historial de ventas ────────────────────────────────────────
function renderHistorial(orders) {
  const cont = document.getElementById('hist-lista');
  if (!cont) return;
  const active    = orders.filter(o=>o.status!=='cancelled');
  const cancelled = orders.filter(o=>o.status==='cancelled');
  const total     = active.reduce((s,o)=>s+(o.total||0),0);
  const hc = document.getElementById('hist-count');
  const ht = document.getElementById('hist-total');
  if (hc) hc.textContent = `${active.length} ventas · ${cancelled.length} anuladas`;
  if (ht) ht.textContent = COPF(total);

  if (!orders.length) {
    cont.innerHTML = '<div class="cj-empty-row">No hay ventas en este turno</div>';
    return;
  }

  const PAGO_INFO = {
    efectivo:      { color:'#16A34A', bg:'#DCFCE7', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>' },
    tarjeta:       { color:'#5B6BFF', bg:'#EEF2FF', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
    transferencia: { color:'#0EA5E9', bg:'#F0F9FF', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>' },
    nequi:         { color:'#8B5CF6', bg:'#F5F3FF', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/></svg>' },
    daviplata:     { color:'#E11D48', bg:'#FFF1F2', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/></svg>' },
  };
  const CANAL_INFO = {
    salon:     { color:'#5B6BFF', bg:'#EEF2FF', label:'Salón' },
    mostrador: { color:'#06B6D4', bg:'#CFFAFE', label:'Mostrador' },
    domicilio: { color:'#10B981', bg:'#D1FAE5', label:'Domicilio' },
  };
  const xIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  cont.innerHTML = orders.map(o => {
    const anulada = o.status === 'cancelled';
    const d       = new Date(o.created_at);
    const hora    = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const shortId = '#' + (o.id||'').slice(-4).toUpperCase();
    const pm      = (o.payment_method||'efectivo').toLowerCase();
    const pi      = PAGO_INFO[pm] || PAGO_INFO.efectivo;
    const ch      = (o.channel||'salon').toLowerCase();
    const ci      = CANAL_INFO[ch]  || CANAL_INFO.salon;
    const pmLabel = (o.payment_method||'Efectivo');
    const deleteBtn = anulada ? '' : `<button class="cj-row-btn danger" onclick="anularVenta('${o.id}')">${xIcon}</button>`;
    const anulBadge = anulada ? `<span class="cj-badge" style="color:#DC2626;background:#FEE2E2">Anulada</span>` : '';
    return `
      <div class="cj-sale-row${anulada?' anulada':''}">
        <div style="width:52px;flex-shrink:0">
          <div class="cj-sale-id">${shortId}</div>
          <div class="cj-sale-time">${hora}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span class="cj-badge" style="color:${ci.color};background:${ci.bg}">${ci.label}</span>
            <span class="cj-badge method" style="color:${pi.color};background:${pi.bg}">${pi.svg} ${pmLabel}</span>
            ${anulBadge}
          </div>
          <div class="cj-sale-who">${o.waiter_name||'Sin nombre'}</div>
        </div>
        <div class="cj-sale-total">${COPF(o.total)}</div>
        ${deleteBtn}
      </div>`;
  }).join('');

  // buscador
  const inp = document.getElementById('hist-search');
  if (inp && !inp.dataset.bound) {
    inp.dataset.bound = '1';
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      document.querySelectorAll('.cj-sale-row').forEach(row => {
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
    dot.style.background = '#16A34A';
    label.textContent    = 'Caja abierta';
    if (ind) { ind.classList.remove('closed'); }
    const d = new Date(S.session.opened_at);
    const h = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    sub.textContent = `Turno ${S.session.shift_type||'—'} · desde ${h}`;
  } else {
    dot.style.background = '#94A3B8';
    label.textContent    = 'Caja cerrada';
    if (ind) { ind.classList.add('closed'); }
    sub.textContent      = '—';
  }
}

// ── Navegación ─────────────────────────────────────────────────
const CRUMB_LABELS = { caja:'Apertura y cierre', movimientos:'Ingresos y egresos', cierres:'Cierres de caja', historial:'Historial de ventas' };
document.querySelectorAll('.cj-nav-item[data-screen]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.cj-nav-item[data-screen]').forEach(function(b){ b.classList.remove('on'); });
    document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('on'); });
    this.classList.add('on');
    var sc = document.getElementById('screen-'+this.dataset.screen);
    if (sc) sc.classList.add('on');
    var crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = CRUMB_LABELS[this.dataset.screen]||this.dataset.screen;
  });
});

// ── Paneles ────────────────────────────────────────────────────
function openPanel(id) { document.getElementById(id)?.classList.remove('is-hidden'); }
function closePanel(id){ document.getElementById(id)?.classList.add('is-hidden'); }
window.openPanel  = openPanel;
window.closePanel = closePanel;

document.querySelectorAll('.cj-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target===ov) closePanel(ov.id); });
});

// ── Segmentos ──────────────────────────────────────────────────
function segSelect(btn, groupId) {
  document.querySelectorAll('#'+groupId+' button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}
window.segSelect = segSelect;

// ── Medio pago en movimiento ───────────────────────────────────
function selectMedio(btn) {
  document.querySelectorAll('.mov-medio-btn').forEach(b=>{
    b.style.background=''; b.style.borderColor=''; b.style.color='';
  });
  btn.style.background='#DCFCE7'; btn.style.borderColor='#16A34A'; btn.style.color='#16A34A';
}
window.selectMedio = selectMedio;

// ── Acciones principales ───────────────────────────────────────
document.getElementById('btn-confirmar-abrir').addEventListener('click', async function() {
  const monto    = parseFloat(document.getElementById('abrir-monto').value)||0;
  const turnoBtn = document.querySelector('#seg-turno button.on');
  const turno    = turnoBtn ? turnoBtn.textContent.trim() : 'Noche';
  await handleOpenSession(monto, turno);
  closePanel('panel-abrir');
});

document.getElementById('btn-cerrar').addEventListener('click', function() {
  if (!S.session) return;
  const moves    = getMoves();
  const active   = S.orders.filter(o=>o.status!=='cancelled');
  const ventasEf = active.filter(o=>(o.payment_method||'').toLowerCase()==='efectivo').reduce((s,o)=>s+(o.total||0),0);
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session.opening_cash||0;
  const totalV   = active.reduce((s,o)=>s+(o.total||0),0);
  const efectivo = base + ventasEf + ingresos - egresos;
  const cajero   = S.session.cashier_name || (S.user?.user_metadata?.nombre)||'—';
  const turno    = S.session.shift_type||'—';

  document.getElementById('cerrar-sub').textContent      = `Caja 01 · Turno ${turno}`;
  document.getElementById('cerrar-esperado').textContent = COPF(efectivo);

  // Filas kv del resumen
  const kvs = [
    ['Base de apertura',  COPF(base),     ''],
    ['Total de ventas',   COPF(totalV),   ' strong'],
    null, // divider
    ['Efectivo',          COPF(active.filter(o=>(o.payment_method||'').toLowerCase()==='efectivo').reduce((s,o)=>s+(o.total||0),0)), ' mut'],
    ['Tarjeta',           COPF(active.filter(o=>(o.payment_method||'').toLowerCase()==='tarjeta').reduce((s,o)=>s+(o.total||0),0)), ' mut'],
    ['Transferencia',     COPF(active.filter(o=>(o.payment_method||'').toLowerCase()==='transferencia').reduce((s,o)=>s+(o.total||0),0)), ' mut'],
    ['Nequi',             COPF(active.filter(o=>(o.payment_method||'').toLowerCase()==='nequi').reduce((s,o)=>s+(o.total||0),0)), ' mut'],
    ['Daviplata',         COPF(active.filter(o=>(o.payment_method||'').toLowerCase()==='daviplata').reduce((s,o)=>s+(o.total||0),0)), ' mut'],
    null,
    ['Ingresos',          `<span style="color:#16A34A">+${COPF(ingresos)}</span>`, ''],
    ['Egresos',           `<span style="color:#DC2626">−${COPF(egresos)}</span>`, ''],
  ];
  document.getElementById('cerrar-resumen').innerHTML = kvs.map(r => {
    if (!r) return `<div style="height:1px;background:#F1F5F9;margin:6px 0"></div>`;
    const [k, v, cls] = r;
    return `<div class="cj-kv"><span class="k${cls||''}">${k}</span><span class="v${cls||''}">${v}</span></div>`;
  }).join('');

  openPanel('panel-cerrar');
});

document.getElementById('btn-confirmar-cerrar').addEventListener('click', async function() {
  if (!S.session) { showToast('No hay sesión activa'); return; }
  const moves    = getMoves();
  const active   = S.orders.filter(o=>o.status!=='cancelled');
  const ventasEf = active.filter(o=>(o.payment_method||'').toLowerCase()==='efectivo').reduce((s,o)=>s+(o.total||0),0);
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session.opening_cash||0;
  const totalV   = active.reduce((s,o)=>s+(o.total||0),0);
  const efectivo = base + ventasEf + ingresos - egresos;
  await handleCloseSession(efectivo, totalV);
  closePanel('panel-cerrar');
});

document.getElementById('btn-mov').addEventListener('click', function() {
  if (!S.session) { showToast('Abre la caja primero'); return; }
  openPanel('panel-movimiento');
});

document.getElementById('btn-confirmar-mov').addEventListener('click', function() {
  if (!S.session) { showToast('Abre la caja primero'); return; }
  const monto   = parseFloat(document.getElementById('mov-monto').value)||0;
  if (!monto)   { showToast('Ingresa un monto válido'); return; }
  const concept = document.getElementById('mov-concepto').value.trim()||'—';
  const tipoBtn = document.querySelector('#seg-tipo-mov button.on');
  const tipo    = tipoBtn && tipoBtn.textContent.includes('Ingreso') ? 'ingreso' : 'egreso';
  const medioBtn= document.querySelector('.mov-medio-btn[style*="background"]');
  const medio   = medioBtn ? medioBtn.dataset.medio : 'Efectivo';
  handleAddMovimiento(tipo, monto, concept, medio);
  document.getElementById('mov-monto').value = '';
  document.getElementById('mov-concepto').value = '';
  closePanel('panel-movimiento');
});

document.getElementById('btn-arqueo').addEventListener('click', function() {
  S.arqueoContado = null;
  document.querySelectorAll('.denom-input').forEach(inp=>{ inp.value=''; });
  document.querySelectorAll('.cj-denom-total').forEach(td=>{ td.textContent='0'; });
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

document.querySelectorAll('.denom-input').forEach(inp => {
  inp.addEventListener('input', updateArqueoTotals);
});

function updateArqueoTotals() {
  const groups = document.querySelectorAll('.cj-denom');
  let billetes = 0, monedas = 0;
  groups.forEach((grp, gi) => {
    let sub = 0;
    grp.querySelectorAll('.denom-input').forEach(inp => {
      const qty   = parseInt(inp.value||'0',10)||0;
      const denom = parseInt(inp.dataset.val,10);
      const tot   = qty * denom;
      sub += tot;
      const td = inp.closest('.cj-denom-row')?.querySelector('.cj-denom-total');
      if (td) td.textContent = COPF(tot);
    });
    if (gi===0) billetes=sub; else monedas+=sub;
  });
  const total = billetes + monedas;
  document.getElementById('subtotal-billetes').textContent = COPF(billetes);
  document.getElementById('subtotal-monedas').textContent  = COPF(monedas);
  document.getElementById('arqueo-contado').textContent    = COPF(total);
  document.getElementById('arqueo-pie').textContent        = COPF(total);
  updateArqueoEsperado();
}

function getArqueoContado() {
  let t = 0;
  document.querySelectorAll('.denom-input').forEach(inp=>{
    t += (parseInt(inp.value||'0',10)||0) * parseInt(inp.dataset.val,10);
  });
  return t;
}

function updateArqueoEsperado() {
  const moves    = getMoves();
  const active   = S.orders.filter(o=>o.status!=='cancelled');
  const ventasEf = active.filter(o=>(o.payment_method||'').toLowerCase()==='efectivo').reduce((s,o)=>s+(o.total||0),0);
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session ? (S.session.opening_cash||0) : 0;
  const esperado = base + ventasEf + ingresos - egresos;
  const contado  = getArqueoContado();
  const diff     = contado - esperado;
  document.getElementById('arqueo-esperado').textContent = COPF(esperado);
  const diffEl  = document.getElementById('arqueo-diff');
  const diffLbl = document.getElementById('arqueo-diff-lbl');
  const diffCard= document.getElementById('arqueo-diff-card');
  if (diffEl) {
    diffEl.textContent = (diff>=0?'+':'') + COPF(diff);
    diffEl.style.color = diff===0?'#0F172A':diff>0?'#16A34A':'#DC2626';
  }
  if (diffLbl) diffLbl.textContent = diff>0?'Sobrante':diff<0?'Faltante':'Diferencia';
  if (diffCard) {
    diffCard.className = 'cj-arqueo-card' + (diff===0?'':diff>0?' sobra':' falta');
  }
}

// ── Acciones Supabase ──────────────────────────────────────────
async function handleOpenSession(openingCash, shiftType) {
  try {
    const payload = {
      status: 'open', opening_cash: openingCash, shift_type: shiftType,
      opened_at:    new Date().toISOString(),
      cashier_name: S.user?.user_metadata?.nombre || S.user?.email || 'Cajero',
    };
    if (S.branchId) payload.branch_id = S.branchId;
    if (S.tenantId) payload.tenant_id = S.tenantId;
    const { error } = await sb.from('pos_sessions').insert(payload);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Caja abierta correctamente');
    await refreshAll();
  } catch(e) { console.error(e); showToast('Error al abrir caja'); }
}

async function handleCloseSession(closingCash, totalSales) {
  try {
    const { error } = await sb.from('pos_sessions').update({
      status: 'closed', closing_cash: closingCash,
      total_sales: totalSales||0, closed_at: new Date().toISOString(),
    }).eq('id', S.session.id);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Caja cerrada correctamente');
    await refreshAll();
  } catch(e) { console.error(e); showToast('Error al cerrar caja'); }
}

function handleAddMovimiento(type, amount, concept, medio) {
  const moves = getMoves();
  moves.push({ id: Date.now().toString(), type, amount, concept, medio, ts: new Date().toISOString() });
  saveMoves(moves);
  const current = getMoves();
  renderHero(S.orders, current);
  renderCanalVentas(S.orders, current);
  renderMovimientos(current);
  renderMovimientosSummary(current);
  showToast((type==='ingreso'?'Ingreso':'Egreso') + ' registrado: ' + COPF(amount));
}

function deleteMov(id) {
  const moves = getMoves().filter(m => m.id !== id);
  saveMoves(moves);
  const current = getMoves();
  renderHero(S.orders, current);
  renderCanalVentas(S.orders, current);
  renderMovimientos(current);
  renderMovimientosSummary(current);
  showToast('Movimiento eliminado');
}
window.deleteMov = deleteMov;

async function anularVenta(orderId) {
  if (!confirm('¿Anular esta venta?')) return;
  const { error } = await sb.from('pos_orders').update({ status:'cancelled' }).eq('id', orderId);
  if (error) { showToast('Error al anular: ' + error.message); return; }
  showToast('Venta anulada');
  await refreshAll();
}
window.anularVenta = anularVenta;

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('cj-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cj-toast';
    t.className = 'cj-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.style.opacity='0'; }, 3000);
}

// ── Render inicial (estructura visible sin esperar core:ready) ──
// Corre inmediatamente al cargar el script. Cuando core:ready dispare,
// refreshAll() reemplazará con datos reales.
renderDesglosePago([]);
renderCanalVentas([], []);
renderTopVentas([]);
renderMovimientos([]);
renderMovimientosSummary([]);
renderCierres([]);
renderHistorial([]);
