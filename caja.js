/* ============================================================
   caja.js  —  Cobra POS · Módulo de Caja
   ============================================================ */

const S = {
  session: null, orders: [], items: [], sessions: [],
  branchId: null, tenantId: null, user: null, arqueoContado: null
};


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
  const moves = await getMoves();
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

// ── pos_cash_moves (Supabase) ──────────────────────────────────
async function getMoves() {
  try {
    if (!S.session) return [];
    const { data } = await sb.from('pos_cash_moves')
      .select('*')
      .eq('session_id', S.session.id)
      .order('created_at', { ascending: true });
    return (data || []).map(m => ({
      id:      m.id,
      type:    m.type,
      amount:  parseFloat(m.amount) || 0,
      concept: m.concept || '',
      medio:   m.medio  || 'Efectivo',
      ts:      m.created_at,
    }));
  } catch(e) { console.error('getMoves:', e); return []; }
}
async function addMove(type, amount, concept, medio) {
  if (!S.session) return null;
  const { data, error } = await sb.from('pos_cash_moves').insert({
    tenant_id:  S.tenantId,
    branch_id:  S.branchId,
    session_id: S.session.id,
    type, amount, concept,
    medio:      medio || 'Efectivo',
    created_by: S.user?.id || null,
  }).select().single();
  if (error) throw error;
  return data;
}
async function deleteMove(id) {
  const { error } = await sb.from('pos_cash_moves').delete().eq('id', id);
  if (error) throw error;
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

// ── Verificar turnos abiertos de meseros ───────────────────────
async function checkOpenShifts() {
  try {
    const q = sb.from('pos_shifts').select('id, waiter_id, started_at, pos_users!waiter_id(name, role)')
      .eq('status', 'active');
    if (S.branchId) q.eq('branch_id', S.branchId);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('checkOpenShifts:', e); return []; }
}

async function closeShift(shiftId, rowEl) {
  try {
    const { error } = await sb.from('pos_shifts')
      .update({ status: 'closed', ended_at: new Date().toISOString() })
      .eq('id', shiftId);
    if (error) throw error;
    rowEl.style.opacity = '0.4';
    rowEl.querySelector('.cj-shift-close-btn').disabled = true;
    rowEl.querySelector('.cj-shift-close-btn').textContent = 'Cerrado';
    // Re-check si quedan turnos abiertos
    const remaining = document.querySelectorAll('.cj-shift-row:not([data-closed])');
    rowEl.dataset.closed = '1';
    const open = document.querySelectorAll('.cj-shift-row:not([data-closed="1"])');
    if (!open.length) {
      document.getElementById('shifts-warn').style.display = 'none';
      document.getElementById('btn-confirmar-cerrar').disabled = false;
    }
  } catch(e) { showToast('Error al cerrar turno'); }
}
window.closeShift = closeShift;

document.getElementById('btn-cerrar').addEventListener('click', async function() {
  if (!S.session) return;
  const moves    = await getMoves();
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

  // Verificar turnos de meseros abiertos
  const openShifts = await checkOpenShifts();
  const shiftsWarn = document.getElementById('shifts-warn');
  const shiftsList = document.getElementById('shifts-list');
  const confirmBtn = document.getElementById('btn-confirmar-cerrar');
  if (openShifts.length > 0) {
    shiftsList.innerHTML = openShifts.map(sh => {
      const nombre = sh.pos_users?.name || 'Mesero';
      const rol    = sh.pos_users?.role || 'mesero';
      const desde  = sh.started_at ? new Date(sh.started_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—';
      return `<div class="cj-shift-row" data-shift-id="${sh.id}">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <div style="width:30px;height:30px;border-radius:8px;background:#FEF3C7;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#92400E">${nombre[0].toUpperCase()}</div>
          <div><div style="font-size:13px;font-weight:600;color:#0F172A">${nombre}</div><div style="font-size:11px;color:#64748B">${rol} · desde ${desde}</div></div>
        </div>
        <button class="cj-shift-close-btn cj-btn-ghost sm" onclick="closeShift('${sh.id}', this.closest('.cj-shift-row'))">Cerrar turno</button>
      </div>`;
    }).join('');
    shiftsWarn.style.display = 'block';
    confirmBtn.disabled = true;
  } else {
    shiftsWarn.style.display = 'none';
    confirmBtn.disabled = false;
  }
  openPanel('panel-cerrar');
});

document.getElementById('btn-confirmar-cerrar').addEventListener('click', async function() {
  if (!S.session) { showToast('No hay sesión activa'); return; }
  const moves    = await getMoves();
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

async function updateArqueoEsperado() {
  const moves    = await getMoves();
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
    // Cerrar la sesion activa con datos de cierre
    const { error } = await sb.from('pos_sessions').update({
      status: 'closed', closing_cash: closingCash,
      total_sales: totalSales||0, closed_at: new Date().toISOString(),
    }).eq('id', S.session.id);
    if (error) { showToast('Error: ' + error.message); return; }

    // Cerrar tambien cualquier otra sesion abierta del mismo branch (sesiones huerfanas)
    const qOrfanas = sb.from('pos_sessions').update({
      status: 'closed', closed_at: new Date().toISOString(),
    }).eq('status', 'open').neq('id', S.session.id);
    if (S.branchId) qOrfanas.eq('branch_id', S.branchId);
    await qOrfanas;

    showToast('Caja cerrada correctamente');
    await refreshAll();
  } catch(e) { console.error(e); showToast('Error al cerrar caja'); }
}

async function handleAddMovimiento(type, amount, concept, medio) {
  try {
    await addMove(type, amount, concept, medio);
    const current = await getMoves();
    renderHero(S.orders, current);
    renderCanalVentas(S.orders, current);
    renderMovimientos(current);
    renderMovimientosSummary(current);
    showToast((type==='ingreso'?'Ingreso':'Egreso') + ' registrado: ' + COPF(amount));
  } catch(e) { console.error(e); showToast('Error al registrar movimiento'); }
}

async function deleteMov(id) {
  try {
    await deleteMove(id);
    const current = await getMoves();
    renderHero(S.orders, current);
    renderCanalVentas(S.orders, current);
    renderMovimientos(current);
    renderMovimientosSummary(current);
    showToast('Movimiento eliminado');
  } catch(e) { console.error(e); showToast('Error al eliminar movimiento'); }
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



// ══════════════════════════════════════════════════════════════════════════
// RESUMEN DEL CIERRE — vista detallada al hacer clic en un cierre
// ══════════════════════════════════════════════════════════════════════════

let _rSession = null;
let _rPid     = 'turno';

function rsvg(name, sz) {
  sz = sz||16;
  const p = `width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch(name) {
    case 'cash':     return `<svg ${p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>`;
    case 'card':     return `<svg ${p}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
    case 'transfer': return `<svg ${p}><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>`;
    case 'phone':    return `<svg ${p}><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>`;
    case 'bag':      return `<svg ${p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
    case 'register': return `<svg ${p}><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/><line x1="7" y1="14" x2="9" y2="14"/><line x1="12" y1="14" x2="17" y2="14"/></svg>`;
    case 'swap':     return `<svg ${p}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    case 'scale':    return `<svg ${p}><path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6Z"/><path d="m19 7-3 6h6Z"/><path d="M8 21h8"/></svg>`;
    case 'star':     return `<svg ${p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    case 'alert':    return `<svg ${p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'user':     return `<svg ${p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    case 'open':     return `<svg ${p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    case 'closebox': return `<svg ${p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M9 14l6 0"/></svg>`;
    case 'moon':     return `<svg ${p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    case 'bike':     return `<svg ${p}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17 10 7h3l3 10"/><path d="M13 7h3l1 3"/></svg>`;
    case 'clock':    return `<svg ${p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'history':  return `<svg ${p}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>`;
    case 'arrowup':  return `<svg ${p}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
    case 'arrowdown':return `<svg ${p}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
    case 'info':     return `<svg ${p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    case 'checkc':   return `<svg ${p}><circle cx="12" cy="12" r="10"/><polyline points="16 9 11 14 8.5 11.5"/></svg>`;
    default: return '';
  }
}

const RS_METHODS = [
  {id:'efectivo',      name:'Efectivo',      icon:'cash',     color:'#16A34A', tint:'#DCFCE7'},
  {id:'tarjeta',       name:'Tarjeta',        icon:'card',     color:'#5B6BFF', tint:'#EEF2FF'},
  {id:'transferencia', name:'Transferencia',  icon:'transfer', color:'#0EA5E9', tint:'#F0F9FF'},
  {id:'nequi',         name:'Nequi',          icon:'phone',    color:'#8B5CF6', tint:'#F5F3FF'},
  {id:'daviplata',     name:'Daviplata',      icon:'phone',    color:'#E11D48', tint:'#FFF1F2'},
];
const RS_CHANNELS = {
  salon:     {name:'Salón',     color:'#5B6BFF', tint:'#EEF2FF'},
  mostrador: {name:'Mostrador', color:'#06B6D4', tint:'#CFFAFE'},
  domicilio: {name:'Domicilio', color:'#10B981', tint:'#D1FAE5'},
};

async function openResumen(sessionId) {
  const session = S.sessions.find(s => s.id === sessionId);
  if (!session) { showToast('Sesión no encontrada'); return; }
  _rSession = session;
  _rPid = 'turno';
  document.querySelectorAll('.cj-nav-item[data-screen]').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  document.getElementById('screen-resumen').classList.add('on');
  document.getElementById('crumb').textContent = 'Resumen del cierre';
  document.querySelectorAll('#resumen-periodos button').forEach(b => b.classList.toggle('on', b.dataset.pid === 'turno'));
  await renderResumen();
}
window.openResumen = openResumen;

function backToCierres() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  document.getElementById('screen-cierres').classList.add('on');
  document.querySelectorAll('.cj-nav-item[data-screen]').forEach(b => {
    b.classList.toggle('on', b.dataset.screen === 'cierres');
  });
  document.getElementById('crumb').textContent = CRUMB_LABELS.cierres;
}
window.backToCierres = backToCierres;

async function onResumenPid(btn, pid) {
  document.querySelectorAll('#resumen-periodos button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  _rPid = pid;
  await renderResumen();
}
window.onResumenPid = onResumenPid;

async function loadResumenData(pid) {
  const s = _rSession;
  let startISO, endISO, scope, cuadreKind;

  if (pid === 'turno') {
    startISO = s.opened_at;
    endISO   = s.closed_at || new Date().toISOString();
    const d  = new Date(s.opened_at);
    const f  = d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const h  = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    scope = `Turno ${s.shift_type||'—'} · ${f} ${h}`;
    cuadreKind = 'session';
  } else if (pid === 'dia') {
    const d = new Date(s.opened_at); d.setHours(0,0,0,0);
    startISO = d.toISOString(); d.setHours(23,59,59,999); endISO = d.toISOString();
    scope = new Date(startISO).toLocaleDateString('es-CO',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    cuadreKind = 'acum';
  } else if (pid === 'semana') {
    const d = new Date(s.opened_at);
    const day = d.getDay(); const diff = d.getDate() - day + (day===0?-6:1);
    d.setDate(diff); d.setHours(0,0,0,0); startISO = d.toISOString();
    const end = new Date(d); end.setDate(end.getDate()+6); end.setHours(23,59,59,999); endISO = end.toISOString();
    scope = 'Semana en curso · 7 días';
    cuadreKind = 'acum';
  } else {
    const d = new Date(s.opened_at); d.setDate(1); d.setHours(0,0,0,0); startISO = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999); endISO = end.toISOString();
    scope = `Mes en curso · ${new Date(startISO).toLocaleDateString('es-CO',{month:'long',year:'numeric'})}`;
    cuadreKind = 'acum';
  }

  let orders = [], items = [], moves = [], periodSessions = [];

  try {
    const qOrd = sb.from('pos_orders').select('*').gte('created_at', startISO).lte('created_at', endISO);
    if (S.branchId) qOrd.eq('branch_id', S.branchId);
    const { data: od } = await qOrd;
    orders = od || [];
  } catch(e) { console.warn('rsOrders:', e); }

  try {
    const qIt = sb.from('pos_order_items').select('*').gte('created_at', startISO).lte('created_at', endISO);
    if (S.branchId) qIt.eq('branch_id', S.branchId);
    const { data: it } = await qIt;
    items = it || [];
  } catch(e) { console.warn('rsItems:', e); }

  try {
    if (pid === 'turno') {
      const { data: mv } = await sb.from('pos_cash_moves').select('*').eq('session_id', s.id);
      moves = mv || [];
    } else {
      const qMv = sb.from('pos_cash_moves').select('*').gte('created_at', startISO).lte('created_at', endISO);
      if (S.branchId) qMv.eq('branch_id', S.branchId);
      const { data: mv } = await qMv;
      moves = mv || [];
    }
  } catch(e) { console.warn('rsMoves:', e); }

  try {
    const qSess = sb.from('pos_sessions').select('*').eq('status','closed')
      .gte('closed_at', startISO).lte('closed_at', endISO);
    if (S.branchId) qSess.eq('branch_id', S.branchId);
    const { data: sd } = await qSess;
    periodSessions = sd || [];
  } catch(e) { console.warn('rsSessions:', e); }

  const active = orders.filter(o => o.status !== 'cancelled');
  const totalV = active.reduce((a,o) => a+(o.total||0), 0);
  const txns   = active.length;
  const ticket = txns ? Math.round(totalV/txns) : 0;

  const byMethod = {};
  RS_METHODS.forEach(m => byMethod[m.id] = 0);
  active.forEach(o => {
    const k = (o.payment_method||'efectivo').toLowerCase();
    if (byMethod[k] !== undefined) byMethod[k] += (o.total||0);
  });

  const byChannel = {salon:0,mostrador:0,domicilio:0};
  active.forEach(o => {
    const k = (o.channel||'salon').toLowerCase();
    if (byChannel[k] !== undefined) byChannel[k] += (o.total||0);
  });

  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);

  let cuadre;
  if (cuadreKind === 'session') {
    const base     = parseFloat(s.opening_cash)||0;
    const efV      = byMethod.efectivo||0;
    const efIn     = moves.filter(m=>m.type==='ingreso'&&(m.medio||'').toLowerCase()==='efectivo').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);
    const efOut    = moves.filter(m=>m.type==='egreso' &&(m.medio||'').toLowerCase()==='efectivo').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);
    const esperado = base + efV + efIn - efOut;
    const contado  = parseFloat(s.closing_cash)||0;
    const diff     = parseFloat(s.arqueo_diff)||0;
    cuadre = { kind:'session', base, esperado, contado, diff };
  } else {
    const cierres   = periodSessions.length;
    const cuadrados = periodSessions.filter(x => !x.arqueo_diff || x.arqueo_diff===0).length;
    const neto      = periodSessions.reduce((a,x)=>a+(parseFloat(x.arqueo_diff)||0),0);
    cuadre = { kind:'acum', cierres, cuadrados, neto };
  }

  const pMap = {};
  items.forEach(it => {
    const k = it.product_name || 'Sin nombre';
    if (!pMap[k]) pMap[k] = {name:k, cat:it.product_category||'', qty:0, total:0};
    pMap[k].qty   += (it.quantity||1);
    pMap[k].total += (it.product_price||0)*(it.quantity||1);
  });
  const top = Object.values(pMap).sort((a,b)=>b.total-a.total).slice(0,5);

  const mMap = {};
  active.forEach(o => {
    const k = o.waiter_name || 'Sin nombre';
    if (!mMap[k]) mMap[k] = {name:k, ini:k.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(), count:0, total:0};
    mMap[k].count++;
    mMap[k].total += (o.total||0);
  });
  const meseros = Object.values(mMap).sort((a,b)=>b.total-a.total);

  const hourMap = {salon:{},mostrador:{},domicilio:{}};
  active.forEach(o => {
    const ch = (o.channel||'salon').toLowerCase();
    if (hourMap[ch]) {
      const h = new Date(o.created_at).getHours();
      hourMap[ch][h] = (hourMap[ch][h]||0)+1;
    }
  });
  const horaPunta = Object.entries(hourMap).map(([ch, hM]) => {
    const best = Object.entries(hM).sort((a,b)=>b[1]-a[1])[0];
    const fr   = best ? `${String(best[0]).padStart(2,'0')}:00 – ${String(parseInt(best[0])+1).padStart(2,'0')}:00` : '—';
    return {ch, franja:fr};
  });

  let comp = {prev:0, prevLabel:'Turno anterior', this:totalV};
  try {
    const qPrev = sb.from('pos_sessions').select('total_sales,closed_at').eq('status','closed')
      .lt('closed_at', s.opened_at).order('closed_at',{ascending:false}).limit(1);
    if (S.branchId) qPrev.eq('branch_id', S.branchId);
    const { data: pd } = await qPrev;
    if (pd && pd[0]) comp.prev = parseFloat(pd[0].total_sales)||0;
  } catch(e) {}

  let spark = [];
  try {
    const qSp = sb.from('pos_sessions').select('total_sales').eq('status','closed')
      .lte('closed_at', endISO).order('closed_at',{ascending:false}).limit(6);
    if (S.branchId) qSp.eq('branch_id', S.branchId);
    const { data: spd } = await qSp;
    if (spd) spark = spd.reverse().map(x=>parseFloat(x.total_sales)||0);
  } catch(e) {}
  if (!spark.length) spark = [totalV];

  return {scope, byMethod, byChannel, totalVentas:totalV, txns, ticket, ingresos, egresos,
          cuadre, top, meseros, horaPunta, comp, spark,
          sessionUser: s.cashier_name||'—',
          openedAt: s.opened_at, closedAt: s.closed_at, shiftType: s.shift_type||'—'};
}

function rsSectionHead(icon, tone, kicker, title, desc) {
  return `<div style="display:flex;align-items:center;gap:12px;margin:26px 0 14px">
    <div style="width:38px;height:38px;border-radius:11px;background:${tone}22;color:${tone};display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg(icon,19)}</div>
    <div><div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.09em;font-weight:700">${kicker}</div>
    <div style="font-size:16px;font-weight:800;color:#0F172A;letter-spacing:-.02em;margin-top:1px">${title}</div></div>
    ${desc?`<div style="margin-left:auto;font-size:11.5px;color:#94A3B8;max-width:280px;text-align:right;line-height:1.4">${desc}</div>`:''}
  </div>`;
}

function rsBarRow(label, value, pct, color, sub, iconName) {
  return `<div style="display:flex;align-items:center;gap:12px">
    ${iconName?`<div style="width:30px;height:30px;border-radius:8px;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg(iconName,15)}</div>`:''}
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;gap:10px">
        <span style="font-size:12.5px;font-weight:600;color:#475569">${label}${sub?` <span style="color:#CBD5E1;font-weight:500">· ${sub}</span>`:''}</span>
        <span style="font-size:13px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(value)}</span>
      </div>
      <div style="height:6px;background:#F1F5F9;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(2,pct).toFixed(1)}%;background:${color};border-radius:999px"></div></div>
    </div>
  </div>`;
}

function rsRowKV(label, value, strong) {
  return `<div style="display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:12.5px;color:${strong?'#0F172A':'#64748B'};font-weight:${strong?700:500}">${label}</span>
    <span style="font-size:13.5px;font-weight:${strong?800:700};color:#0F172A;font-variant-numeric:tabular-nums">${value}</span>
  </div>`;
}

async function renderResumen() {
  const body = document.getElementById('resumen-body');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#94A3B8;font-size:13px">Cargando resumen…</div>';
  let R;
  try { R = await loadResumenData(_rPid); }
  catch(e) {
    body.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626">Error al cargar datos: ${e.message}</div>`;
    return;
  }

  document.getElementById('resumen-scope-text').textContent = R.scope;

  const maxMethod = Math.max(1, ...Object.values(R.byMethod));
  const totalChan = Math.max(1, Object.values(R.byChannel).reduce((a,b)=>a+b,0));
  const maxSpark  = Math.max(...R.spark, 1);
  const growthPct = R.comp.prev ? ((R.comp.this - R.comp.prev) / R.comp.prev * 100) : 0;
  const growthUp  = growthPct >= 0;

  const fmtDT = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' · ' +
           d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  };

  // cuadre
  let cuadreHTML = '';
  if (R.cuadre.kind === 'session') {
    const d = R.cuadre.diff, ok = d===0, over = d>0;
    const bg = ok?'#F0FDF4':over?'#F0F9FF':'#FEF2F2';
    const bd = ok?'#BBF7D0':over?'#BAE6FD':'#FECACA';
    const cl = ok?'#166534':over?'#0369A1':'#991B1B';
    cuadreHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:15px;flex:1">
      ${rsRowKV('Base de apertura', COPF(R.cuadre.base), false)}
      ${rsRowKV('Efectivo esperado', COPF(R.cuadre.esperado), true)}
      ${rsRowKV('Efectivo contado (real)', COPF(R.cuadre.contado), false)}
      <div style="height:1px;background:#ECEEF2;margin:2px 0"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${bg};border:1px solid ${bd};border-radius:12px">
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:${cl}">${rsvg(ok?'checkc':'alert',16)} ${ok?'Caja cuadrada':over?'Sobrante':'Faltante'}</span>
        <span style="font-size:18px;font-weight:800;color:${cl};font-variant-numeric:tabular-nums">${d===0?COPF(0):(over?'+':'−')+COPF(Math.abs(d)).slice(1)}</span>
      </div>
    </div>`;
  } else {
    const d = R.cuadre.neto, ok = d===0, over = d>0;
    const bg = ok?'#F0FDF4':over?'#F0F9FF':'#FEF2F2';
    const bd = ok?'#BBF7D0':over?'#BAE6FD':'#FECACA';
    const cl = ok?'#166534':over?'#0369A1':'#991B1B';
    cuadreHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:15px;flex:1">
      <div style="display:flex;gap:10px">
        <div style="flex:1;text-align:center;padding:14px 8px;background:#FAFAFB;border:1px solid #F1F5F9;border-radius:11px">
          <div style="font-size:24px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${R.cuadre.cierres}</div>
          <div style="font-size:11px;color:#94A3B8;font-weight:600;margin-top:2px">Cierres</div>
        </div>
        <div style="flex:1;text-align:center;padding:14px 8px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:11px">
          <div style="font-size:24px;font-weight:800;color:#166534;font-variant-numeric:tabular-nums">${R.cuadre.cuadrados}</div>
          <div style="font-size:11px;color:#16A34A;font-weight:600;margin-top:2px">Cuadrados</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${bg};border:1px solid ${bd};border-radius:12px">
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:${cl}">${rsvg(ok?'checkc':'alert',16)} Diferencia neta</span>
        <span style="font-size:18px;font-weight:800;color:${cl};font-variant-numeric:tabular-nums">${d===0?COPF(0):(over?'+':'−')+COPF(Math.abs(d)).slice(1)}</span>
      </div>
    </div>`;
  }

  const topHTML = R.top.length ? R.top.map((t,i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i<R.top.length-1?'border-bottom:1px solid #F5F6F8':''}">
      <div style="width:26px;height:26px;border-radius:7px;background:${i===0?'#FEF3C7':'#F1F5F9'};color:${i===0?'#B45309':'#94A3B8'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div>
        <div style="font-size:11px;color:#94A3B8">${t.cat||'Producto'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(t.total)}</div>
        <div style="font-size:11px;color:#94A3B8;font-variant-numeric:tabular-nums">${t.qty} und</div>
      </div>
    </div>`).join('') : '<div style="padding:20px 0;text-align:center;color:#94A3B8;font-size:12px">Sin datos de productos</div>';

  const meserosHTML = R.meseros.length ? R.meseros.map((m,i) => `
    <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;align-items:center;padding:12px 20px;${i<R.meseros.length-1?'border-bottom:1px solid #F5F6F8':''}">
      <span style="display:inline-flex;align-items:center;gap:10px;min-width:0">
        <span style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#5B6BFF,#8B5CF6);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${m.ini}</span>
        <span style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</span>
      </span>
      <span style="text-align:center;font-size:13px;font-weight:700;color:#475569;font-variant-numeric:tabular-nums">${m.count}</span>
      <span style="text-align:right">
        <div style="font-size:13px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(m.total)}</div>
        <div style="font-size:11px;color:#94A3B8;font-variant-numeric:tabular-nums">~${COPF(Math.round(m.total/Math.max(1,m.count)))} / venta</div>
      </span>
    </div>`).join('') : '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:12px">Sin datos de personal</div>';

  const horaPuntaHTML = R.horaPunta.filter(h=>h.franja!=='—').map(h => {
    const c = RS_CHANNELS[h.ch]||{name:h.ch,color:'#94A3B8',tint:'#F1F5F9'};
    return `<div style="display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid #ECEEF2;border-radius:12px">
      <div style="width:38px;height:38px;border-radius:10px;background:${c.tint};color:${c.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('clock',18)}</div>
      <div><div style="font-size:11px;color:#94A3B8;font-weight:600">${c.name}</div><div style="font-size:15px;font-weight:800;color:#0F172A">${h.franja}</div></div>
    </div>`;
  }).join('') || '<div style="color:#94A3B8;font-size:12px;padding:12px 0">Sin datos de hora punta</div>';

  const sparkBars = R.spark.map((v,i) => {
    const last = i === R.spark.length-1;
    const h = Math.max(4, Math.round((v/maxSpark)*100));
    const lbl = v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'k' : String(Math.round(v));
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end">
      <span style="font-size:10px;font-weight:700;color:${last?'#5B6BFF':'#94A3B8'};font-variant-numeric:tabular-nums">${lbl}</span>
      <div style="width:100%;max-width:46px;height:${h}%;background:${last?'linear-gradient(180deg,#5B6BFF,#8B5CF6)':'#E2E8F0'};border-radius:7px 7px 3px 3px"></div>
    </div>`;
  }).join('');

  const sparkLabels = R.spark.map((_,i)=>{
    const offset = R.spark.length-1-i;
    const last   = i===R.spark.length-1;
    return `<span style="${last?'color:#5B6BFF':''}">${last?'Actual':'-'+offset}</span>`;
  }).join('');

  body.innerHTML = `
    ${rsSectionHead('cash','#5B6BFF','Lo más importante','Financiero','Cuánto entró, cómo pagaron y si la caja cuadró.')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px">
      <div class="cj-card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#5B6BFF;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${rsvg('bag',13)} Ventas totales</div>
        <div style="font-size:30px;font-weight:800;color:#0F172A;margin-top:6px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${COPF(R.totalVentas)}</div>
        <div style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;margin-top:6px;color:${growthUp?'#16A34A':'#DC2626'}">${rsvg(growthUp?'arrowup':'arrowdown',12)} ${growthUp?'+':'−'}${Math.abs(growthPct).toFixed(1)}% vs ${R.comp.prevLabel.toLowerCase()}</div>
      </div>
      <div class="cj-card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#0EA5E9;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${rsvg('register',13)} Ticket promedio</div>
        <div style="font-size:30px;font-weight:800;color:#0F172A;margin-top:6px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${COPF(R.ticket)}</div>
        <div style="font-size:11.5px;color:#94A3B8;font-weight:500;margin-top:6px">por venta</div>
      </div>
      <div class="cj-card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#16A34A;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${rsvg('swap',13)} Transacciones</div>
        <div style="font-size:30px;font-weight:800;color:#0F172A;margin-top:6px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${R.txns}</div>
        <div style="font-size:11.5px;color:#94A3B8;font-weight:500;margin-top:6px">ventas realizadas</div>
      </div>
      <div class="cj-card" style="padding:16px 18px;display:flex;flex-direction:column;justify-content:center;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:34px;height:34px;border-radius:9px;background:#DCFCE7;color:#16A34A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('arrowup',16)}</div>
          <div><div style="font-size:15px;font-weight:800;color:#166534;font-variant-numeric:tabular-nums">${COPF(R.ingresos)}</div><div style="font-size:11px;color:#94A3B8;font-weight:600">Ingresos de caja</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:34px;height:34px;border-radius:9px;background:#FEE2E2;color:#DC2626;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('arrowdown',16)}</div>
          <div><div style="font-size:15px;font-weight:800;color:#991B1B;font-variant-numeric:tabular-nums">${COPF(R.egresos)}</div><div style="font-size:11px;color:#94A3B8;font-weight:600">Egresos (gastos)</div></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('cash',15)} Desglose por método de pago</div>
        <div style="display:flex;flex-direction:column;gap:13px;margin-top:15px">
          ${RS_METHODS.map(m => rsBarRow(m.name, R.byMethod[m.id]||0, ((R.byMethod[m.id]||0)/maxMethod)*100, m.color, R.totalVentas?Math.round(((R.byMethod[m.id]||0)/R.totalVentas)*100)+'%':'0%', m.icon)).join('')}
        </div>
      </div>
      <div class="cj-card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div class="cj-card-title">${rsvg('scale',15)} Cuadre de efectivo</div>
        ${cuadreHTML}
      </div>
    </div>

    ${rsSectionHead('bag','#8B5CF6','Qué se vendió','Productos','Los más pedidos del periodo.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('star',15)} Más vendidos</div>
        <div style="display:flex;flex-direction:column;gap:2px;margin-top:12px">${topHTML}</div>
      </div>
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('register',15)} Ventas por producto</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:15px">
          ${R.top.length ? R.top.map(t => rsBarRow(t.name, t.total, (t.total/Math.max(1,...R.top.map(x=>x.total)))*100, '#8B5CF6', t.qty+' und', null)).join('') : '<div style="color:#94A3B8;font-size:12px;padding:12px 0">Sin datos</div>'}
        </div>
      </div>
    </div>

    ${rsSectionHead('user','#0EA5E9','Quién atendió','Personal','Ventas y ticket promedio por mesero.')}
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#0F172A;padding:15px 20px;border-bottom:1px solid #ECEEF2">${rsvg('user',15)} Ventas por mesero</div>
        <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;padding:9px 20px;background:#FAFAFB;border-bottom:1px solid #F1F5F9;font-size:10.5px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.04em">
          <span>Mesero</span><span style="text-align:center">Txns</span><span style="text-align:right">Total · Prom.</span>
        </div>
        ${meserosHTML}
      </div>
      <div class="cj-card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div class="cj-card-title">${rsvg('register',15)} Turno de caja</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:15px">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #ECEEF2;border-radius:12px">
            <div style="width:36px;height:36px;border-radius:10px;background:#DCFCE7;color:#16A34A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('open',17)}</div>
            <div><div style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Abrió</div>
            <div style="font-size:13px;font-weight:700;color:#0F172A">${R.sessionUser}</div>
            <div style="font-size:11.5px;color:#94A3B8">${fmtDT(R.openedAt)}</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #ECEEF2;border-radius:12px">
            <div style="width:36px;height:36px;border-radius:10px;background:#EEF2FF;color:#5B6BFF;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('closebox',17)}</div>
            <div><div style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Cerró</div>
            <div style="font-size:13px;font-weight:700;color:#0F172A">${R.sessionUser}</div>
            <div style="font-size:11.5px;color:#94A3B8">${fmtDT(R.closedAt)}</div></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:auto;padding:9px 12px;font-size:11.5px;color:#7C3AED;background:#F5F3FF;border:1px solid #E9D5FF;border-radius:10px">
          ${rsvg('moon',13)} Turno ${R.shiftType}
        </div>
      </div>
    </div>

    ${rsSectionHead('bike','#10B981','Por dónde vendiste','Canales','Salón, domicilio y mostrador.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('bag',15)} Salón vs domicilio vs mostrador</div>
        <div style="display:flex;height:12px;border-radius:999px;overflow:hidden;margin-top:16px;gap:2px;background:#F1F5F9">
          ${Object.entries(RS_CHANNELS).map(([k,c])=>`<div style="width:${Math.max(0,((R.byChannel[k]||0)/totalChan)*100).toFixed(1)}%;background:${c.color}"></div>`).join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:11px;margin-top:16px">
          ${Object.entries(RS_CHANNELS).map(([k,c])=>{
            const v=R.byChannel[k]||0; const pct=totalChan>0?Math.round((v/totalChan)*100):0;
            return `<div style="display:flex;align-items:center;justify-content:space-between">
              <span style="display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:#0F172A">
                <span style="width:10px;height:10px;border-radius:3px;background:${c.color}"></span>${c.name}<span style="font-size:11.5px;color:#94A3B8;font-weight:600">${pct}%</span>
              </span>
              <span style="font-size:13.5px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(v)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('clock',15)} Hora punta por canal</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:15px">${horaPuntaHTML}</div>
      </div>
    </div>

    ${rsSectionHead('history','#E11D48','Cómo vamos','Comparativos','Contra el periodo anterior y la tendencia de ventas.')}
    <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:14px;margin-bottom:30px">
      <div class="cj-card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div class="cj-card-title">${rsvg('swap',15)} Este turno vs anterior</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:16px">
          <div style="font-size:30px;font-weight:800;color:#0F172A;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${COPF(R.comp.this)}</div>
          <div style="display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:800;color:${growthUp?'#16A34A':'#DC2626'};background:${growthUp?'#DCFCE7':'#FEE2E2'};padding:3px 9px;border-radius:999px">${rsvg(growthUp?'arrowup':'arrowdown',13)} ${growthUp?'+':'−'}${Math.abs(growthPct).toFixed(1)}%</div>
        </div>
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:11px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px"><span style="color:#0F172A;font-weight:700">Este turno</span><span style="font-weight:800;font-variant-numeric:tabular-nums">${COPF(R.comp.this)}</span></div>
            <div style="height:8px;background:#F1F5F9;border-radius:999px;overflow:hidden"><div style="height:100%;width:100%;background:#5B6BFF;border-radius:999px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px"><span style="color:#64748B;font-weight:600">${R.comp.prevLabel}</span><span style="font-weight:700;color:#64748B;font-variant-numeric:tabular-nums">${COPF(R.comp.prev)}</span></div>
            <div style="height:8px;background:#F1F5F9;border-radius:999px;overflow:hidden"><div style="height:100%;width:${R.comp.this?Math.min(100,(R.comp.prev/R.comp.this)*100).toFixed(1):0}%;background:#CBD5E1;border-radius:999px"></div></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:auto;padding-top:16px;font-size:11.5px;color:#64748B">${rsvg('info',13)} Diferencia de ${COPF(Math.abs(R.comp.this-R.comp.prev))} frente al periodo anterior.</div>
      </div>
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('arrowup',15)} Crecimiento en ventas</div>
        <p style="font-size:11.5px;color:#94A3B8;margin:5px 0 0">Últimos ${R.spark.length} periodos.</p>
        <div style="display:flex;align-items:flex-end;gap:12px;height:160px;margin-top:18px;padding:0 4px">${sparkBars}</div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding:0 4px;font-size:10.5px;color:#CBD5E1;font-weight:600">${sparkLabels}</div>
      </div>
    </div>
  `;
}

// ── Reemplazar renderCierres para cards clicables ─────────────────────────
renderCierres = function(sessions) {
  const cont = document.getElementById('cierres-grid');
  if (!cont) return;
  let html = '';

  if (S.session) {
    const dAp = new Date(S.session.opened_at);
    const fAp = dAp.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hAp = dAp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const cajero = S.session.cashier_name || (S.user?.user_metadata?.nombre) || '—';
    const initials = cajero.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    html += `<div class="cj-card cj-cierre">
      <div class="cj-cierre-head">
        <div class="cj-cierre-user"><div class="cj-cierre-av">${initials}</div><div>
          <div class="cj-cierre-name">${cajero}</div>
          <div class="cj-cierre-caja"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/></svg> Caja 01 · Turno ${S.session.shift_type||'—'}</div>
        </div></div>
        <span class="cj-tag live"><span style="width:6px;height:6px;border-radius:999px;background:#16A34A"></span> En curso</span>
      </div>
      <div class="cj-cierre-rows">
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#16A34A"></span> Apertura <span class="when">${fAp} · ${hAp}</span></span><span class="cj-amt-open">${COPF(S.session.opening_cash||0)}</span></div>
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#CBD5E1"></span> Cierre <span class="when">—</span></span><span class="cj-amt-na">—</span></div>
      </div>
    </div>`;
  }

  if (!sessions.length && !S.session) {
    cont.innerHTML = '<div class="cj-empty"><div class="cj-empty-inner"><div class="cj-empty-ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg></div><div style="font-size:14px;font-weight:700;color:#0F172A">Sin cierres aún</div><div style="font-size:12px;color:#94A3B8;margin-top:4px">Cuando cierres la caja aparecerá aquí.</div></div></div>';
    return;
  }

  html += sessions.map(s => {
    const dAp = new Date(s.opened_at), dCi = new Date(s.closed_at);
    const fAp = dAp.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hAp = dAp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const fCi = dCi.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hCi = dCi.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const cajero   = s.cashier_name||'—';
    const initials = cajero.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const diff = s.arqueo_diff||0;
    let tagHtml = '<span class="cj-tag ok">Cuadrado</span>';
    if (diff>0) tagHtml = `<span class="cj-tag sobra">Sobrante ${COPF(diff)}</span>`;
    if (diff<0) tagHtml = `<span class="cj-tag falta">Faltante ${COPF(Math.abs(diff))}</span>`;
    return `<div class="cj-card cj-cierre cj-cierre-click" onclick="openResumen('${s.id}')">
      <div class="cj-cierre-head">
        <div class="cj-cierre-user"><div class="cj-cierre-av">${initials}</div><div>
          <div class="cj-cierre-name">${cajero}</div>
          <div class="cj-cierre-caja"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/></svg> Caja 01 · Turno ${s.shift_type||'—'}</div>
        </div></div>
        <div style="display:flex;align-items:center;gap:8px">${tagHtml}<div class="cj-cierre-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div></div>
      </div>
      <div class="cj-cierre-rows">
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#16A34A"></span> Apertura <span class="when">${fAp} · ${hAp}</span></span><span class="cj-amt-open">${COPF(s.opening_cash||0)}</span></div>
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#5B6BFF"></span> Cierre <span class="when">${fCi} · ${hCi}</span></span><span class="cj-amt-close">${COPF(s.closing_cash||0)}</span></div>
      </div>
      <div class="cj-cierre-hint">Ver resumen completo →</div>
    </div>`;
  }).join('');

  cont.innerHTML = html;
};
