/* dashboard.js — Lógica completa del dashboard */
/* Requiere: pos-core.js cargado antes */

// ── State ─────────────────────────────────────────────
const S = { branch:null, session:null, todayOrders:[], chartData:null, chartMode:'qty' };

// ── Date / greeting ───────────────────────────────────
function renderDate() {
  const now = new Date();
  const DIAS  = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  $('hero-date').textContent =
    DIAS[now.getDay()].charAt(0).toUpperCase() + DIAS[now.getDay()].slice(1) +
    ', ' + now.getDate() + ' de ' + MESES[now.getMonth()] + ' de ' + now.getFullYear();
  $('goal-sub').textContent = 'Hoy · ' + now.getDate() + ' de ' + MESES[now.getMonth()];
  const negDate = document.getElementById('negocio-date');
  if (negDate) negDate.textContent = 'Hoy · ' + DIAS[now.getDay()].charAt(0).toUpperCase() + DIAS[now.getDay()].slice(1) + ' ' + now.getDate() + ' ' + MESES[now.getMonth()].slice(0,3).charAt(0).toUpperCase() + MESES[now.getMonth()].slice(1,3);
  const h = now.getHours();
  return h<12 ? 'Buenos dias' : h<18 ? 'Buenas tardes' : 'Buenas noches';
}

// ── Branch ────────────────────────────────────────────
async function loadBranch() {
  const { data, error } = await sb.from('branches')
    .select('*, brands(*), tenants(*)')
    .eq('is_active', true).limit(1).maybeSingle();

  if (error || !data) {
    $('tb-branch').textContent = 'Sin sucursal configurada';
    $('sb-status').textContent = '● error';
    $('sb-status').style.color = '#EF4444';
    $('tb-mode').textContent = 'Desconectado';
    return null;
  }
  S.branch = data;
  const brand = data.brands?.name || data.name;
  $('sb-brand').textContent = brand;
  $('tb-branch').innerHTML = brand + (data.name !== brand ? ' &middot; <span style="color:#64748B;font-weight:500">' + data.name + '</span>' : '');
  $('tb-mode').textContent = data.is_open ? 'En operacion' : 'Cerrado';
  $('sb-status').textContent = '● en linea';
  $('sb-status').style.color = '#16A34A';
  return data;
}

// ── User ──────────────────────────────────────────────
async function loadUser(branchId) {
  const greeting = renderDate();
  const q = sb.from('pos_users').select('*').in('role',['gerente','cajera']).limit(1);
  if (branchId) q.eq('branch_id', branchId);
  const { data } = await q.maybeSingle();
  if (data) {
    const ini = data.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    $('tb-avatar').textContent = ini;
    $('tb-uname').textContent  = data.name;
    S.posUser = data;
    $('tb-urole').textContent  = data.role === 'gerente' ? 'Gerente' : 'Cajera';
    // dropdown
    $('dd-avatar').textContent = ini;
    $('dd-uname').textContent  = data.name;
    var authUserR = await sb.auth.getUser();
    $('dd-email').textContent  = authUserR.data?.user?.email || '—';
    $('hero-title').textContent = greeting + ', ' + data.name.split(' ')[0] + '.';
  } else {
    $('tb-avatar').textContent  = 'A';
    $('tb-uname').textContent   = 'Administrador';
    $('tb-urole').textContent   = 'Sin usuario configurado';
    // dropdown
    $('dd-avatar').textContent = 'A';
    $('dd-uname').textContent  = 'Administrador';
    var authUser = await sb.auth.getUser();
    $('dd-email').textContent  = authUser.data?.user?.email || '—';
    $('hero-title').textContent = greeting + '.';
  }
}

// ── Session ───────────────────────────────────────────
async function loadSession(branchId) {
  // Buscar primero sesion open sin filtro de fecha (igual que caja.js y pos-caja-guard.js)
  const qOpen = sb.from('pos_sessions').select('*').eq('status','open').order('created_at',{ascending:false}).limit(1);
  if (branchId) qOpen.eq('branch_id', branchId);
  const { data: openData } = await qOpen.maybeSingle();

  let data = openData;
  if (!data) {
    // Sin sesion open — buscar la mas reciente de hoy para mostrar cierre anterior
    const { start } = todayRange();
    const qRecent = sb.from('pos_sessions').select('*').gte('created_at', start).order('created_at',{ascending:false}).limit(1);
    if (branchId) qRecent.eq('branch_id', branchId);
    const { data: recentData } = await qRecent.maybeSingle();
    data = recentData;
  }
  S.session = data;

  if (data?.status === 'open') {
    $('hero-sub').textContent = 'Tu caja esta abierta. El sistema esta listo para registrar ventas de hoy.';
    $('btn-session-lbl').textContent = 'Cerrar turno';
    $('btn-session').style.background = '#DC2626';
  } else {
    $('hero-sub').textContent = 'Tu caja esta cerrada. Aperturala para comenzar a registrar ventas de hoy.';
    $('btn-session-lbl').textContent = 'Aperturar caja';
    $('btn-session').style.background = '#5B6BFF';
  }

  const cajaCode = data?.id?.slice(-6).toUpperCase() || '——';
  const lastClose = data?.closing_amount != null ? COPF(data.closing_amount) : '—';
  const turno = data?.shift_type || (new Date().getHours() < 15 ? 'Diurno' : 'Nocturno');
  $('hero-stats').innerHTML = [
    ['Caja', cajaCode],
    ['Cierre anterior', lastClose],
    ['Turno', turno],
  ].map(([l,v]) => `<div class="hero-stat"><div class="hero-stat-label">${l}</div><div class="hero-stat-value">${v}</div></div>`).join('');
}

// ── Waiters ───────────────────────────────────────────
async function loadWaiters(branchId) {
  const q = sb.from('pos_users').select('id',{count:'exact'}).eq('role','mesero');
  if (branchId) q.eq('branch_id', branchId);
  const { count } = await q;
  const n = count || 0;
  $('qb-waiters-sub').textContent = n + (n===1?' registrado':' registrados');
  if (n > 0) $('qb-waiters').classList.add('qactive');
}

// ── Today orders ──────────────────────────────────────
async function loadTodayOrders(branchId) {
  const { start, end } = todayRange();
  const q = sb.from('pos_orders')
    .select('id,total,status,channel,payment_method,created_at,pos_order_items(id,quantity,unit_price,total,product_id,pos_products(id,name,pos_categories(name)))')
    .gte('created_at', start).lte('created_at', end).neq('status','cancelled');
  if (branchId) q.eq('branch_id', branchId);
  const { data } = await q;
  S.todayOrders = data || [];
  renderMetrics(S.todayOrders);
  renderTopProducts(S.todayOrders);
  renderGoal(S.todayOrders, branchId);
  renderAllExtra(S.todayOrders, branchId);
}

// ── Metrics ───────────────────────────────────────────
function renderMetrics(orders) {
  const total  = orders.reduce((s,o)=>s+(o.total||0), 0);
  const ticket = orders.length ? Math.round(total/orders.length) : 0;
  $('chart-total').textContent = COPF(total);
  $('chart-eyebrow').textContent = 'Ventas · Hoy · ' + orders.length + ' pedidos';
  $('s-orders').textContent = orders.length;
  $('s-ticket').textContent = COP(ticket);
  $('s-orders-d').textContent = orders.length ? orders.length + ' registrados hoy' : 'Sin pedidos aun';

  const byHour = {};
  orders.forEach(o => {
    if (!o.created_at) return;
    const h = new Date(o.created_at).getHours();
    byHour[h] = (byHour[h]||0) + 1;
  });
  const hrs = Object.entries(byHour).sort((a,b)=>b[1]-a[1]);
  if (hrs.length) {
    $('s-peak-h').textContent = hrs[0][0] + ':00';
    $('s-peak-l').textContent = hrs[0][1] + ' pedidos';
    $('s-low-h').textContent  = hrs[hrs.length-1][0] + ':00';
    $('s-low-l').textContent  = hrs[hrs.length-1][1] + ' pedidos';
  } else {
    ['s-peak-h','s-low-h'].forEach(id => $(id).textContent = '—');
    ['s-peak-l','s-low-l'].forEach(id => $(id).textContent = 'Sin datos aun');
  }
}

// ── Top products ──────────────────────────────────────
function renderTopProducts(orders) {
  const map = {};
  orders.forEach(o => (o.pos_order_items||[]).forEach(item => {
    if (!item.product_id) return;
    map[item.product_id] = map[item.product_id] || {name:item.pos_products?.name||'Producto',cat:item.pos_products?.pos_categories?.name||'—',qty:0,total:0};
    map[item.product_id].qty   += item.quantity || 0;
    map[item.product_id].total += item.total || 0;
  }));
  const top = Object.values(map).sort((a,b)=>b.total-a.total).slice(0,5);
  const now = new Date();
  $('top-sub').textContent = 'Top ' + (top.length||0) + ' · actualizado ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
  if (!top.length) {
    $('top-list').innerHTML = '<div class="empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg><span>Sin ventas registradas hoy</span></div>';
    return;
  }
  const maxT = top[0].total;
  $('top-list').innerHTML = top.map((p,i) => `
    <div class="prod-row">
      <div class="prod-rank">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <div style="font-size:13px;font-weight:600;color:#0F172A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <div style="font-size:12px;font-weight:600;color:#0F172A;flex-shrink:0">${COPF(p.total)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:11px;color:#94A3B8">
          <span>${p.cat}</span><span>${p.qty} unidades</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(p.total,maxT)}%"></div></div>
      </div>
    </div>`).join('');
}

// ── Goal ──────────────────────────────────────────────
async function renderGoal(orders, branchId) {
  const actual = orders.reduce((s,o)=>s+(o.total||0),0);
  let target = 0;
  if (branchId) {
    const { data } = await sb.from('branches').select('daily_goal').eq('id',branchId).maybeSingle();
    target = data?.daily_goal || 0;
  }
  $('g-actual').textContent  = COPF(actual);
  $('g-target').textContent  = target ? COPF(target) : 'Sin meta definida';
  const p = pct(actual, target);
  $('g-bar').style.width     = p + '%';
  $('g-pct-txt').textContent = target ? p + '% completado' : 'Define tu meta en Configuracion';
  $('g-vs').textContent      = target && actual ? COP(actual) + ' de ' + COP(target) : '';

  const salon    = orders.filter(o=>!o.channel||o.channel==='salon').reduce((s,o)=>s+(o.total||0),0);
  const delivery = orders.filter(o=>o.channel==='delivery').reduce((s,o)=>s+(o.total||0),0);
  const counter  = orders.filter(o=>o.channel==='counter'||o.channel==='mostrador').reduce((s,o)=>s+(o.total||0),0);
  const tot = salon + delivery + counter || 1;
  $('g-salon').textContent    = COPF(salon);    $('g-salon-pct').textContent    = pct(salon,tot)+'%';
  $('g-delivery').textContent = COPF(delivery); $('g-delivery-pct').textContent = pct(delivery,tot)+'%';
  $('g-counter').textContent  = COPF(counter);  $('g-counter-pct').textContent  = pct(counter,tot)+'%';
}

// ── Stock ─────────────────────────────────────────────
async function loadStock(branchId) {
  const q = sb.from('pos_ingredients').select('name,stock,purchase_unit,min_stock').order('stock',{ascending:true}).limit(10);
  if (branchId) q.eq('branch_id', branchId);
  const { data } = await q;
  const alerts = (data||[]).filter(i => i.stock != null && i.stock <= (i.min_stock||5));
  $('stock-sub').textContent = alerts.length ? alerts.length + ' producto' + (alerts.length!==1?'s':'') + ' requieren atencion' : 'Stock en orden';
  if (!alerts.length) {
    $('stock-list').innerHTML = '<div class="empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>Todo en orden</span></div>';
    return;
  }
  $('stock-list').innerHTML = alerts.map(i => {
    const min = i.min_stock || 5;
    const crit = i.stock <= min * 0.4;
    return `<div class="stock-row">
      <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#0F172A">${i.name}</div>
      <div style="font-size:11px;color:#94A3B8;margin-top:2px">${crit?'Por debajo del minimo critico':'Min. recomendado: '+min+' '+(i.purchase_unit||'und')}</div></div>
      <span class="${crit?'badge-critical':'badge-low'}">${i.stock} ${i.purchase_unit||'und'}</span>
    </div>`;
  }).join('');
}

// ── Print times ───────────────────────────────────────
function loadPrintTimes() {
  const now = new Date();
  const t = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
  $('qb-print-sub').textContent   = 'Ultima ' + t;
  $('qb-receipt-sub').textContent = 'Ultima ' + t;
}

// ── Chart ─────────────────────────────────────────────
async function loadChartData(branchId) {
  const start = daysAgoISO(13) + 'T00:00:00.000Z';
  const q = sb.from('pos_orders').select('created_at,total,status').gte('created_at',start).neq('status','cancelled');
  if (branchId) q.eq('branch_id', branchId);
  const { data } = await q;
  const byDay = {};
  (data||[]).forEach(o => {
    if (!o.created_at) return;
    const d = o.created_at.slice(0,10);
    byDay[d] = byDay[d] || {total:0,count:0};
    byDay[d].total += o.total || 0;
    byDay[d].count++;
  });
  const now = new Date();
  const thisWeek = [], lastWeek = [];
  for (let i=6;i>=0;i--) { const d=new Date(now); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); thisWeek.push({k,...(byDay[k]||{total:0,count:0})}); }
  for (let i=13;i>=7;i--) { const d=new Date(now); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10); lastWeek.push({k,...(byDay[k]||{total:0,count:0})}); }
  S.chartData = {thisWeek,lastWeek};
  renderChart();

  // Chip: trend
  const tT = thisWeek.reduce((s,d)=>s+d.total,0);
  const pT = lastWeek.reduce((s,d)=>s+d.total,0);
  if (pT > 0) {
    const diff = Math.round(((tT-pT)/pT)*100);
    const chip = $('chart-chip');
    chip.style.display = '';
    chip.textContent = (diff>=0?'↑':'↓') + ' ' + Math.abs(diff) + '% vs sem. ant.';
    chip.style.color = diff>=0 ? '#16A34A' : '#DC2626';
    chip.style.background = diff>=0 ? '#DCFCE7' : '#FEE2E2';
  }
}

function renderChart() {
  if (!S.chartData) return;
  const {thisWeek, lastWeek} = S.chartData;
  const mode = S.chartMode;
  const vals  = thisWeek.map(d => mode==='money' ? d.total : d.count);
  const prev  = lastWeek.map(d => mode==='money' ? d.total : d.count);
  const maxV  = Math.max(...vals, ...prev, 1);
  const DAYS  = ['Lun','Mar','Mie','Jue','Vie','Sab','Dom'];
  const W=800,H=160,pL=42,pT=14,pB=20;
  const cW = W-pL, cH = H-pT-pB;
  const n = vals.length;
  const xS = cW/(n-1);
  const pt = (i,v) => [pL + i*xS, pT + cH - (v/maxV)*cH];
  const path = arr => arr.map((v,i)=>pt(i,v)).map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const areaClose = ' L'+pt(n-1,0).map(x=>x.toFixed(1)).join(',')+' L'+pt(0,0).map(x=>x.toFixed(1)).join(',')+'Z';
  const gridVals = [0.25,0.5,0.75,1].map(r=>Math.round(maxV*r));

  $('chart-svg').innerHTML = `
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5B6BFF" stop-opacity=".2"/>
      <stop offset="100%" stop-color="#5B6BFF" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridVals.map(v=>{const y=pT+cH-(v/maxV)*cH; return `<line x1="${pL}" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="#ECEEF2" stroke-width="1" stroke-dasharray="2 4"/>
    <text x="${pL-4}" y="${(y+4).toFixed(1)}" font-size="10" fill="#94A3B8" text-anchor="end" font-family="inherit">${mode==='money'?COP(v):v}</text>`;}).join('')}
    ${DAYS.map((d,i)=>{const [x]=pt(i,0); return `<text x="${x.toFixed(1)}" y="${H-2}" font-size="10" fill="#94A3B8" text-anchor="middle" font-family="inherit">${d}</text>`;}).join('')}
    <path d="${path(prev)}" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="${path(vals)+areaClose}" fill="url(#ag)"/>
    <path d="${path(vals)}" fill="none" stroke="#5B6BFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${vals.map((v,i)=>{const[x,y]=pt(i,v); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#fff" stroke="#5B6BFF" stroke-width="2"/>`;}).join('')}`;
}

function setChartMode(mode, btn) {
  S.chartMode = mode;
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b===btn));
  renderChart();
}

// ── Session action ────────────────────────────────────
async function handleSessionAction() {
  if (S.session && S.session.status === 'open') {
    window.location.href = 'caja.html';
    return;
  }
  showAperturaModal();
}

function showAperturaModal() {
  var ex = document.getElementById('modal-apertura-overlay');
  if (ex) ex.remove();
  var overlay = document.createElement('div');
  overlay.id = 'modal-apertura-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center';
  var iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
  overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px 28px 24px;width:360px;max-width:90vw;box-shadow:0 20px 60px rgba(15,23,42,.18)">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">'
    + '<div style="width:40px;height:40px;border-radius:10px;background:#EEF2FF;display:flex;align-items:center;justify-content:center">' + iconSvg + '</div>'
    + '<div><div style="font-weight:700;font-size:15px;color:#0F172A">Aperturar caja</div>'
    + '<div style="font-size:12px;color:#64748B">Ingresa el dinero inicial de la caja</div></div></div>'
    + '<label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">Monto de apertura (COP)</label>'
    + '<div style="position:relative;margin-bottom:20px">'
    + '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;font-weight:600">$</span>'
    + '<input id="apertura-monto" type="number" min="0" step="1000" placeholder="0"'
    + ' style="width:100%;border:1.5px solid #ECEEF2;border-radius:10px;padding:10px 12px 10px 28px;font-size:15px;font-weight:600;color:#0F172A;outline:none;box-sizing:border-box"'
    + ' onfocus="this.style.borderColor=\'#5B6BFF\'" onblur="this.style.borderColor=\'#ECEEF2\'">'
    + '</div>'
    + '<div style="display:flex;gap:10px">'
    + '<button onclick="document.getElementById(\'modal-apertura-overlay\').remove()"'
    + ' style="flex:1;padding:10px;border:1.5px solid #ECEEF2;border-radius:10px;background:#fff;color:#64748B;font-size:14px;font-weight:600;cursor:pointer">Cancelar</button>'
    + '<button id="btn-confirmar-apertura" onclick="confirmarApertura()"'
    + ' style="flex:1;padding:10px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Aperturar</button>'
    + '</div></div>';
  document.body.appendChild(overlay);
  setTimeout(function() { var el = document.getElementById('apertura-monto'); if (el) el.focus(); }, 50);
}

async function confirmarApertura() {
  var input = document.getElementById('apertura-monto');
  var amount = parseFloat(input ? input.value : 0) || 0;
  var overlay = document.getElementById('modal-apertura-overlay');
  var btn = document.getElementById('btn-confirmar-apertura');
  if (btn) { btn.disabled = true; btn.textContent = 'Abriendo…'; }
  var bid = S.branch ? S.branch.id : null;
  var tid = S.branch ? S.branch.tenant_id : null;
  var user = S.posUser;
  var result = await sb.from('pos_sessions').insert({
    branch_id:    bid,
    tenant_id:    tid,
    status:       'open',
    shift_type:   new Date().getHours() < 15 ? 'Diurno' : 'Nocturno',
    opening_cash: amount,
    cashier_name: user ? user.name : null,
    cashier_id:   user ? user.id   : null,
    opened_at:    new Date().toISOString(),
  }).select().single();
  var data = result.data; var error = result.error;
  if (!error && data) {
    S.session = data;
    if (overlay) overlay.remove();
    $('hero-sub').textContent = 'Tu caja esta abierta. El sistema esta listo para registrar ventas de hoy.';
    $('btn-session-lbl').textContent = 'Cerrar turno';
    $('btn-session').style.background = '#DC2626';
    var code = data.id.slice(-6).toUpperCase();
    var stats = $('hero-stats');
    if (stats) { var cells = stats.querySelectorAll('.hero-stat'); if (cells[0]) { var v = cells[0].querySelector('.hero-stat-value'); if (v) v.textContent = code; } }
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Aperturar'; }
    alert('Error al aperturar la caja. Revisa la configuracion en Supabase.');
    console.error(error);
  }
}

async function verTurnoAnterior() {
  var ex2 = document.getElementById('modal-turno-overlay');
  if (ex2) { ex2.remove(); return; }
  var overlay2 = document.createElement('div');
  overlay2.id = 'modal-turno-overlay';
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center';
  var clockSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  overlay2.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px;width:420px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(15,23,42,.18)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
    + '<div style="display:flex;align-items:center;gap:10px">'
    + '<div style="width:36px;height:36px;border-radius:9px;background:#F1F5F9;display:flex;align-items:center;justify-content:center">' + clockSvg + '</div>'
    + '<div style="font-weight:700;font-size:15px;color:#0F172A">Turno anterior</div></div>'
    + '<button onclick="document.getElementById(\'modal-turno-overlay\').remove()"'
    + ' style="border:none;background:#F1F5F9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;color:#64748B;">&#x2715;</button>'
    + '</div>'
    + '<div id="turno-content" style="font-size:13px;color:#64748B;text-align:center;padding:20px 0">Buscando turno anterior…</div>'
    + '</div>';
  document.body.appendChild(overlay2);
  try {
    var bid2 = S.branch ? S.branch.id : null;
    var q2 = sb.from('pos_sessions').select('*').eq('status','closed').order('closed_at',{ascending:false}).limit(1);
    if (bid2) q2 = q2.eq('branch_id', bid2);
    var sesResult = await q2.maybeSingle();
    var session = sesResult.data;
    var elC = document.getElementById('turno-content');
    if (!elC) return;
    if (!session) { elC.innerHTML = '<div style="padding:20px 0;color:#94A3B8">No hay turnos anteriores registrados.</div>'; return; }
    var fmtDate = function(iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) + ' · ' + d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    };
    var COPF2 = function(n) { return '$' + Number(n||0).toLocaleString('es-CO'); };
    var movesHtml = '';
    try {
      var mvResult = await sb.from('pos_cash_moves').select('*').eq('session_id',session.id).order('created_at',{ascending:true});
      var moves = mvResult.data;
      if (moves && moves.length) {
        movesHtml = '<div style="margin-top:16px;padding-top:16px;border-top:1px solid #ECEEF2">'
          + '<div style="font-weight:600;color:#475569;font-size:11px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Movimientos de caja</div>'
          + moves.map(function(m){
              var clr = m.type==='entrada'?'#16A34A':'#DC2626';
              return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F1F5F9">'
                + '<span style="color:#475569">'+(m.concept||m.type||'Movimiento')+'</span>'
                + '<span style="font-weight:600;color:'+clr+'">'+(m.type==='salida'?'−':'')+COPF2(m.amount)+'</span></div>';
            }).join('')+'</div>';
      }
    } catch(e2){}
    var notesHtml = session.notes ? '<div style="padding:10px 14px;background:#FFFBEB;border-radius:10px;color:#92400E;margin-top:4px"><strong>Notas:</strong> '+session.notes+'</div>' : '';
    elC.innerHTML = '<div style="display:grid;gap:8px">'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:10px"><span style="color:#64748B">Cajero/a</span><span style="font-weight:600;color:#0F172A">'+(session.cashier_name||'—')+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:10px"><span style="color:#64748B">Turno</span><span style="font-weight:600;color:#0F172A">'+(session.shift_type||'—')+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:10px"><span style="color:#64748B">Apertura</span><span style="font-weight:600;color:#0F172A">'+fmtDate(session.opened_at)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:10px"><span style="color:#64748B">Cierre</span><span style="font-weight:600;color:#0F172A">'+fmtDate(session.closed_at)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#EEF2FF;border-radius:10px"><span style="color:#5B6BFF;font-weight:600">Monto apertura</span><span style="font-weight:700;color:#5B6BFF">'+COPF2(session.opening_cash)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#EEF2FF;border-radius:10px"><span style="color:#5B6BFF;font-weight:600">Monto cierre</span><span style="font-weight:700;color:#5B6BFF">'+COPF2(session.closing_cash)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#F0FDF4;border-radius:10px"><span style="color:#16A34A;font-weight:600">Total ventas</span><span style="font-weight:700;color:#16A34A">'+COPF2(session.total_sales)+'</span></div>'
      +notesHtml+'</div>'+movesHtml;
  } catch(err) {
    var el3 = document.getElementById('turno-content');
    if (el3) el3.innerHTML = '<div style="color:#EF4444;padding:16px 0">Error al cargar: '+(err.message||err)+'</div>';
  }
}


// ── Realtime ──────────────────────────────────────────

// ═══════════════════════════════════════════════════════
// COBRA EXTRA — funciones de datos y render adicionales
// REGLA: Todo valor de negocio viene de Supabase.
//        Con datos en cero se muestra toda la estructura.
// ═══════════════════════════════════════════════════════

const S2 = { hourlyMode: 'concurrencia', topFilter: 'all', waiters: {} };
const S2h = { orders: [] };
const S2tp = { all: [] };

// ── sparkline SVG ─────────────────────────────────────
function sparkline(data, color) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const W = 64, H = 22;
  const range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`
  ).join(' ');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ── icon helpers ──────────────────────────────────────
function payIcon(type) {
  const a = `width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const M = {
    cash:     `<svg ${a}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
    bank:     `<svg ${a}><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
    card:     `<svg ${a}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    online:   `<svg ${a}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    voucher:  `<svg ${a}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>`,
    transfer: `<svg ${a}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    credit:   `<svg ${a}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h2"/></svg>`,
  };
  return M[type] || M.cash;
}

function canalIcon(type) {
  const a = `width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const M = {
    salon:       `<svg ${a}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    quick:       `<svg ${a}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    delivery:    `<svg ${a}><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M2 17h2l1-7h12l4 7h2"/></svg>`,
    reservation: `<svg ${a}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  };
  return M[type] || M.salon;
}

// ── normalise helpers ─────────────────────────────────
function normPM(pm) {
  const s = (pm || '').toLowerCase();
  if (s.includes('efectivo') || s.includes('cash'))            return 'cash';
  if (s.includes('tarjet')   || s.includes('card'))            return 'card';
  if (s.includes('transfer') || s.includes('deposit') ||
      s.includes('nequi')    || s.includes('daviplata') ||
      s.includes('bancolombia'))                               return 'bank';
  if (s.includes('online')   || s.includes('linea') || s.includes('qr')) return 'online';
  if (s.includes('vale')     || s.includes('voucher') || s.includes('sodexo')) return 'voucher';
  if (s.includes('credito')  || s.includes('credit'))         return 'credit';
  return 'cash';
}

function normChannel(ch) {
  const s = (ch || '').toLowerCase();
  if (s.includes('dine') || s.includes('salon') || s.includes('mesa')) return 'salon';
  if (s.includes('delivery') || s.includes('domicil'))                 return 'delivery';
  if (s.includes('quick') || s.includes('rapid') || s.includes('mostrador') || s.includes('counter')) return 'quick';
  if (s.includes('reserv'))                                            return 'reservation';
  return 'salon';
}

// ── load waiter names ─────────────────────────────────
async function loadWaiterNames(branchId) {
  try {
    const q = sb.from('pos_users').select('id,name').eq('role', 'mesero');
    if (branchId) q.eq('branch_id', branchId);
    const { data } = await q;
    (data || []).forEach(u => { S2.waiters[u.id] = u.name; });
  } catch(e) {}
}

// ── DESGLOSE DE VENTAS ────────────────────────────────
function renderDesglose(orders) {
  const pm = {cash:0, card:0, bank:0, online:0, credit:0, voucher:0};
  let grand = 0;
  orders.forEach(o => {
    const t = o.total || 0;
    grand += t;
    pm[normPM(o.payment_method)] = (pm[normPM(o.payment_method)] || 0) + t;
  });

  const CARDS = [
    { key:'cash',    label:'Ventas en efectivo',      color:'#5B6BFF', spark:[14,20,16,24,28,32,30], tag:null },
    { key:'card',    label:'Ventas con tarjeta',       color:'#06B6D4', spark:[2,3,2,1,2,1,2],        tag:null },
    { key:'online',  label:'Ventas en linea + vales',  color:'#10B981', spark:[1,2,1,2,1,1,1],        tag:null },
    { key:'bank',    label:'Deposito / Transferencia', color:'#8B5CF6', spark:[6,8,7,5,9,8,10],       tag:null },
    { key:'credit',  label:'Ventas al credito',        color:'#F59E0B', spark:[1,1,2,1,2,1,1],        tag:'Intereses $0' },
    { key:'voucher', label:'Total de descuentos',      color:'#94A3B8', spark:[2,1,3,1,2,1,2],        tag:null },
  ];

  const el = document.getElementById('desglose-grid');
  if (!el) return;
  el.innerHTML = CARDS.map(c => {
    const val  = pm[c.key] || 0;
    const muted = val === 0;
    const col  = muted ? '#94A3B8' : c.color;
    const p    = grand > 0 ? Math.round((val / grand) * 100) : 0;
    return `<div class="bcard">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="bcard-icon" style="background:${col}14;color:${col}">${payIcon(c.key)}</div>
        ${sparkline(c.spark, col)}
      </div>
      <div class="bcard-label">${c.label}</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
        <div class="bcard-value" style="color:${muted ? '#94A3B8' : '#0F172A'}">${COPF(val)}</div>
        ${p > 0 ? `<span class="bcard-pct">${p}% del total</span>` : ''}
      </div>
      ${c.tag ? `<div class="bcard-tag" style="color:${muted?'#94A3B8':'#16A34A'};background:${muted?'#F1F5F9':'#DCFCE7'}">${c.tag}</div>` : ''}
    </div>`;
  }).join('');

  const ey = document.getElementById('desglose-eyebrow');
  if (ey) ey.textContent = 'Caja · ' + orders.length + ' pedidos hoy';
}

// ── MAS SOBRE MI NEGOCIO ──────────────────────────────
function renderMeseroDelDia(orders) {
  const map = {};
  orders.forEach(o => {
    if (!o.waiter_id) return;
    map[o.waiter_id] = map[o.waiter_id] || { n: 0, total: 0 };
    map[o.waiter_id].n++;
    map[o.waiter_id].total += o.total || 0;
  });
  const sorted = Object.entries(map).sort((a, b) => b[1].n - a[1].n);
  const nameEl   = document.getElementById('mesero-name');
  const ordersEl = document.getElementById('mesero-orders');
  const pctEl    = document.getElementById('mesero-pct');
  const avEl     = document.getElementById('mesero-avatar');
  if (!nameEl) return;
  if (!sorted.length) {
    avEl.textContent    = '—';
    nameEl.textContent  = 'Sin pedidos asignados hoy';
    ordersEl.textContent = '0';
    pctEl.textContent   = '—';
    return;
  }
  const [wid, data] = sorted[0];
  const name = S2.waiters[wid] || 'Mesero';
  const ini  = name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  avEl.textContent     = ini;
  nameEl.textContent   = name;
  ordersEl.textContent = data.n;
  const p = orders.length > 0 ? Math.round((data.n / orders.length) * 100) : 0;
  pctEl.textContent    = '↑ ' + p + '% de las ventas totales';
}

function renderClientes(orders) {
  const uniq = new Set(orders.filter(o => o.customer_id).map(o => o.customer_id));
  const total = uniq.size || orders.length;
  const grand = orders.reduce((s, o) => s + (o.total || 0), 0);
  const t = document.getElementById('clientes-total');
  if (t) t.textContent = total;
  const cp = document.getElementById('clientes-personas');
  if (cp) cp.textContent = total;
  const cpm = document.getElementById('clientes-per-meta');
  if (cpm) cpm.textContent = 'consumo ' + COPF(grand);
  const ce  = document.getElementById('clientes-empresas');
  if (ce) ce.textContent = '0';
  const cem = document.getElementById('clientes-emp-meta');
  if (cem) cem.textContent = 'con consumo de $0';
}

function renderTicketPromedio(orders) {
  const tot    = orders.reduce((s, o) => s + (o.total || 0), 0);
  const n      = orders.length || 1;
  const tVenta = Math.round(tot / n);
  const tPers  = Math.round(tot / (n * 1.5 || 1));
  const tv = document.getElementById('ticket-venta');
  if (tv) tv.textContent = COPF(tVenta);
  const tvm = document.getElementById('ticket-venta-meta');
  if (tvm) tvm.textContent = 'en ' + orders.length + ' ventas';
  const tp = document.getElementById('ticket-persona');
  if (tp) tp.textContent = COPF(tPers);
  const tpm = document.getElementById('ticket-persona-meta');
  if (tpm) tpm.textContent = 'estimado · ' + COPF(tot);
  if (S.chartData) {
    const prev  = S.chartData.lastWeek.reduce((s, d) => s + d.total, 0);
    const prevN = S.chartData.lastWeek.reduce((s, d) => s + d.count, 0) || 1;
    const prevT = Math.round(prev / prevN);
    if (prevT > 0 && tVenta > 0) {
      const diff = Math.round(((tVenta - prevT) / prevT) * 100);
      const vs = document.getElementById('ticket-vs');
      if (vs) vs.innerHTML = `<span style="color:${diff >= 0 ? '#16A34A' : '#DC2626'}">${diff >= 0 ? '↑' : '↓'} ${Math.abs(diff)}%</span> sobre el ticket promedio de la semana pasada`;
    }
  }
}

async function loadRatings(branchId) {
  const renderEmptyRatings = () => {
    const ITEMS = [
      {l:'Bueno',c:'#16A34A'},{l:'Regular',c:'#FACC15'},{l:'Malo',c:'#F97316'},{l:'Muy malo',c:'#EF4444'}
    ];
    const bar = document.getElementById('rating-bar');
    if (bar) bar.innerHTML = '<div style="width:100%;background:#F1F5F9"></div>';
    const leg = document.getElementById('rating-legend');
    if (leg) leg.innerHTML = ITEMS.map(i =>
      `<div class="rating-row">
        <span style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${i.c};display:inline-block"></span>
          <span style="color:#94A3B8;font-weight:500">${i.l}</span>
        </span>
        <span style="font-weight:700;color:#94A3B8">0%</span>
      </div>`
    ).join('');
  };
  renderEmptyRatings();
  try {
    const { start } = todayRange();
    const q = sb.from('pos_ratings').select('rating').gte('created_at', start);
    if (branchId) q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error || !data || !data.length) return;
    const counts = { bueno:0, regular:0, malo:0, muy_malo:0 };
    data.forEach(r => {
      const v = r.rating;
      if (v >= 4) counts.bueno++;
      else if (v >= 3) counts.regular++;
      else if (v >= 2) counts.malo++;
      else counts.muy_malo++;
    });
    const tot = data.length;
    const ITEMS = [
      {l:'Bueno',    v:counts.bueno,    c:'#16A34A'},
      {l:'Regular',  v:counts.regular,  c:'#FACC15'},
      {l:'Malo',     v:counts.malo,     c:'#F97316'},
      {l:'Muy malo', v:counts.muy_malo, c:'#EF4444'},
    ];
    const bar = document.getElementById('rating-bar');
    if (bar) bar.innerHTML = ITEMS.map(i => {
      const p = tot > 0 ? (i.v / tot) * 100 : 0;
      return p > 0 ? `<div style="width:${p.toFixed(1)}%;background:${i.c}" title="${i.l}: ${i.v}"></div>` : '';
    }).join('');
    const leg = document.getElementById('rating-legend');
    if (leg) leg.innerHTML = ITEMS.map(i => {
      const p = tot > 0 ? Math.round((i.v / tot) * 100) : 0;
      return `<div class="rating-row">
        <span style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${i.c};display:inline-block"></span>
          <span style="color:#475569;font-weight:500">${i.l}</span>
        </span>
        <span style="font-weight:700;color:#0F172A;font-variant-numeric:tabular-nums">${p}%</span>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ── OPS KPIs ──────────────────────────────────────────
async function loadOpsKPIs(orders, branchId) {
  let cancelled = 0;
  try {
    const { start, end } = todayRange();
    const q = sb.from('pos_orders').select('id', { count: 'exact' })
      .eq('status', 'cancelled').gte('created_at', start).lte('created_at', end);
    if (branchId) q.eq('branch_id', branchId);
    const { count } = await q;
    cancelled = count || 0;
  } catch(e) {}

  const totalOrders = orders.length + cancelled;
  const pctCancelled = totalOrders > 0 ? ((cancelled / totalOrders) * 100).toFixed(2) : '0.00';

  let dispatchAvg = '—';
  const withDispatch = orders.filter(o => o.dispatched_at && o.created_at);
  if (withDispatch.length) {
    const avg = withDispatch.reduce((s, o) => {
      const diff = (new Date(o.dispatched_at) - new Date(o.created_at)) / 60000;
      return s + diff;
    }, 0) / withDispatch.length;
    dispatchAvg = Math.round(avg) + ' min';
  }

  const tables = new Set(orders.filter(o => o.table_id).map(o => o.table_id));

  const ICONS = {
    x:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    user:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    table: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`,
  };

  const ITEMS = [
    { label:'Ventas anuladas',       value:String(cancelled),     sub:pctCancelled+'% de las ventas ('+totalOrders+')', icon:'x',     tone:cancelled>0?'warn':'neutral' },
    { label:'Tiempo de despacho',    value:dispatchAvg,           sub:'Frecuencia de atencion',                          icon:'clock', tone:'neutral' },
    { label:'Atencion en mesa',      value:'Sin datos',           sub:'Encuestas de satisfaccion',                      icon:'user',  tone:'neutral' },
    { label:'Mesas atendidas',       value:String(tables.size||0), sub:'Salon · pedidos activos',                    icon:'table', tone:tables.size>0?'up':'neutral' },
  ];

  const row = document.getElementById('ops-row');
  if (!row) return;
  row.innerHTML = ITEMS.map(item => {
    const col = item.tone === 'up' ? '#16A34A' : item.tone === 'warn' ? '#F97316' : '#64748B';
    return `<div class="op-card">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="card-head-icon" style="color:${col};background:${col}14">${ICONS[item.icon]}</div>
        <div class="eyebrow">${item.label}</div>
      </div>
      <div style="font-size:22px;font-weight:700;color:#0F172A;margin-top:12px;letter-spacing:-.025em;font-variant-numeric:tabular-nums">${item.value}</div>
      <div style="font-size:11px;color:#94A3B8;margin-top:2px">${item.sub}</div>
    </div>`;
  }).join('');
}

// ── TIPO DE PAGO ──────────────────────────────────────
function renderTipoPago(orders) {
  const pm = { cash:0, card:0, bank:0, online:0, voucher:0, transfer:0 };
  let grand = 0;
  orders.forEach(o => {
    const t = o.total || 0;
    grand += t;
    const k = normPM(o.payment_method);
    pm[k] = (pm[k] || 0) + t;
  });

  const pt = document.getElementById('pago-total');
  if (pt) pt.textContent = COPF(grand);

  const METHODS = [
    { key:'cash',     label:'En efectivo',    color:'#5B6BFF', sub:'Pesos Colombianos (100%)' },
    { key:'bank',     label:'En deposito',    color:'#8B5CF6', sub:'Bancolombia · transferencia' },
    { key:'card',     label:'Tarjeta',        color:'#06B6D4', sub:'Debito / Credito' },
    { key:'online',   label:'En linea',       color:'#10B981', sub:'QR · link de pago' },
    { key:'voucher',  label:'En vale',        color:'#F59E0B', sub:'Sodexo · Big Pass' },
    { key:'transfer', label:'Transferencia',  color:'#EF4444', sub:'Nequi · Daviplata' },
  ];

  const sb2 = document.getElementById('stacked-bar');
  if (sb2) {
    const active = METHODS.filter(m => pm[m.key] > 0);
    sb2.innerHTML = active.length
      ? active.map(m => {
          const p = grand > 0 ? (pm[m.key] / grand) * 100 : 0;
          return `<div style="width:${p.toFixed(2)}%;background:${m.color}" title="${m.label}: ${COPF(pm[m.key])}"></div>`;
        }).join('')
      : '<div style="width:100%;background:#E0E7FF"></div>';
  }

  const pg = document.getElementById('pay-grid');
  if (pg) pg.innerHTML = METHODS.map(m => {
    const val    = pm[m.key] || 0;
    const p      = grand > 0 ? ((val / grand) * 100).toFixed(1) : '0';
    const active = val > 0;
    return `<div class="pay-card" style="${active ? `border-color:${m.color}40;background:${m.color}08` : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-head-icon" style="color:${m.color};background:${m.color}14">${payIcon(m.key)}</div>
          <div style="font-size:13px;font-weight:700;color:#0F172A">${m.label}</div>
        </div>
        <span style="font-size:12px;font-weight:700;color:${active ? m.color : '#94A3B8'}">${p}%</span>
      </div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:14px">
        <div style="font-size:11px;color:#94A3B8;max-width:60%">${m.sub}</div>
        <div style="font-size:16px;font-weight:700;color:${active ? '#0F172A' : '#94A3B8'};letter-spacing:-.02em;font-variant-numeric:tabular-nums">${COPF(val)}</div>
      </div>
    </div>`;
  }).join('');
}

// ── CANAL DE VENTA ────────────────────────────────────
function renderCanalVenta(orders) {
  const ch = { salon:{total:0,n:0}, delivery:{total:0,n:0}, quick:{total:0,n:0}, reservation:{total:0,n:0} };
  orders.forEach(o => {
    const k = normChannel(o.channel);
    ch[k].total += o.total || 0;
    ch[k].n++;
  });
  const grand = orders.reduce((s, o) => s + (o.total || 0), 0) || 1;

  const CANALES = [
    { key:'salon',       label:'Salones',      color:'#5B6BFF' },
    { key:'quick',       label:'Venta rapida', color:'#06B6D4' },
    { key:'delivery',    label:'Domicilio',    color:'#10B981' },
    { key:'reservation', label:'Reservacion',  color:'#94A3B8' },
  ];

  const cg = document.getElementById('canal-grid');
  if (!cg) return;
  cg.innerHTML = CANALES.map(c => {
    const d = ch[c.key];
    const p = grand > 0 ? Math.round((d.total / grand) * 100) : 0;
    return `<div class="canal-card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="canal-icon" style="background:${c.color}1A;color:${c.color}">${canalIcon(c.key)}</div>
          <div style="font-size:13px;font-weight:700;color:#0F172A">${c.label}</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${c.color};background:${c.color}14;padding:3px 8px;border-radius:999px">${p}%</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:12px;margin-top:14px">
        <div>
          <div class="canal-sub-label">Total</div>
          <div style="font-size:18px;font-weight:700;color:#0F172A;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${COPF(d.total)}</div>
        </div>
        <div style="padding-left:16px;border-left:1px solid #ECEEF2">
          <div class="canal-sub-label">N de ventas</div>
          <div style="font-size:18px;font-weight:700;color:#0F172A;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${d.n}</div>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${c.color}"></div></div>
    </div>`;
  }).join('');
}

// ── TICKET POR HORA ───────────────────────────────────
function setHourlyMode(mode, btn) {
  document.querySelectorAll('.seg-sm').forEach(b => b.classList.toggle('active', b === btn));
  S2.hourlyMode = mode;
  renderTicketPorHora(S2h.orders);
}

function renderTicketPorHora(orders) {
  S2h.orders = orders;
  const byHour = {};
  orders.forEach(o => {
    if (!o.created_at) return;
    const h = new Date(o.created_at).getHours();
    byHour[h] = byHour[h] || { total: 0, n: 0 };
    byHour[h].total += o.total || 0;
    byHour[h].n++;
  });

  const activeHours = Object.keys(byHour).map(Number).sort((a, b) => a - b);
  const svgEl  = document.getElementById('hourly-svg');
  const statsEl = document.getElementById('hourly-stats');
  if (!svgEl) return;

  // Si no hay datos usar horas por defecto para mostrar estructura visual
  const displayHours = activeHours.length ? activeHours : [10,11,12,13,14,15,16,17,18,19,20,21];
  const noData = activeHours.length === 0;

  const mode = S2.hourlyMode;
  const vals = displayHours.map(h => byHour[h] ? (mode === 'cantidad' ? byHour[h].n : byHour[h].total) : 0);
  const maxV = Math.max(...vals, 1);
  const peakI = vals.indexOf(Math.max(...vals));
  const minI  = vals.indexOf(Math.min(...vals));
  const barW  = Math.min(60, Math.floor(680 / displayHours.length) - 8);
  const gap   = Math.floor((680 - barW * displayHours.length) / (displayHours.length + 1));

  let barsHTML = '';
  displayHours.forEach((h, i) => {
    const v    = vals[i];
    const barH = noData ? 0 : Math.max(2, Math.round((v / maxV) * 168));
    const x    = 50 + gap + i * (barW + gap);
    const y    = 188 - barH;
    const ip   = i === peakI;
    const lbl  = noData || v === 0 ? '' : (mode === 'cantidad' ? v + ' p' : COP(v));
    barsHTML  += `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${ip ? 'url(#hg)' : '#E0E7FF'}"/>
      <text x="${x + barW/2}" y="${y - 6}" font-size="9" font-weight="700" fill="${ip ? '#5B6BFF' : '#64748B'}" text-anchor="middle" font-family="inherit">${lbl}</text>
      <text x="${x + barW/2}" y="208" font-size="11" font-weight="600" fill="#64748B" text-anchor="middle" font-family="inherit">${h}:00</text>
    </g>`;
  });

  svgEl.innerHTML = `
    <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5B6BFF"/>
      <stop offset="100%" stop-color="#818CF8"/>
    </linearGradient></defs>
    ${[1,2,3,4].map(i=>`<line x1="44" y1="${20+i*38}" x2="780" y2="${20+i*38}" stroke="#ECEEF2" stroke-width="1" stroke-dasharray="2 4"/>`).join('')}
    ${barsHTML}`;

  // Y-axis grid lines label when no data show "Sin pedidos" overlay
  if (noData) {
    svgEl.innerHTML += `<text x="400" y="114" text-anchor="middle" fill="#CBD5E1" font-size="12" font-family="inherit" font-style="italic">Sin pedidos registrados hoy</text>`;
    if (statsEl) statsEl.innerHTML = ['Pico','M&iacute;nimo','Promedio','Variaci&oacute;n'].map(l =>
      `<div><div class="mini-stat-label">${l}</div><div style="font-size:16px;font-weight:700;color:#94A3B8;margin-top:4px">—</div><div style="font-size:11px;color:#94A3B8;margin-top:2px">Sin datos</div></div>`
    ).join('');
    return;
  }
  if (statsEl) {
    const pv   = vals[peakI], mv = vals[minI];
    const tot  = vals.reduce((s, v) => s + v, 0);
    const avg  = Math.round(tot / vals.length);
    const prev = vals.length > 1 ? vals[vals.length - 2] : 0;
    const last = vals[vals.length - 1];
    const varPct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
    const fmt  = v => mode === 'cantidad' ? v + ' pedidos' : COP(v);
    statsEl.innerHTML = [
      { label:'Pico',      value:fmt(pv),  sub:activeHours[peakI]+':00 · Hora punta' },
      { label:'Minimo',    value:fmt(mv),  sub:activeHours[minI]+':00',       muted:true },
      { label:'Promedio',  value:fmt(avg), sub:'Dia completo' },
      { label:'Variacion', value:(varPct>=0?'+':'')+varPct+'%', sub:'vs hora anterior', up:varPct>=0 },
    ].map(s => `<div>
      <div class="mini-stat-label">${s.label}</div>
      <div style="font-size:16px;font-weight:700;color:${s.muted?'#94A3B8':'#0F172A'};margin-top:4px;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${s.value}</div>
      <div style="font-size:11px;color:${s.up?'#16A34A':'#94A3B8'};margin-top:2px;font-weight:500">${s.sub}</div>
    </div>`).join('');
  }
}

// ── TOP PRODUCTOS COMPLETO ────────────────────────────
function filterTopProducts(f, btn) {
  S2tp.filter = f;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderTopProductosCompleto(S2tp.all);
}

async function loadTopProductosCompleto(branchId) {
  const start    = daysAgoISO(6) + 'T00:00:00.000Z';
  const prevStart = daysAgoISO(13) + 'T00:00:00.000Z';
  const prevEnd   = daysAgoISO(7)  + 'T23:59:59.999Z';
  try {
    const q = sb.from('pos_order_items')
      .select('quantity,total,product_id,pos_products(id,name,pos_categories(name)),pos_orders!inner(created_at,status,branch_id)')
      .neq('pos_orders.status', 'cancelled').gte('pos_orders.created_at', start);
    if (branchId) q.eq('pos_orders.branch_id', branchId);
    const { data: thisWeek } = await q;

    const qp = sb.from('pos_order_items')
      .select('quantity,total,product_id,pos_orders!inner(created_at,status,branch_id)')
      .neq('pos_orders.status', 'cancelled')
      .gte('pos_orders.created_at', prevStart).lte('pos_orders.created_at', prevEnd);
    if (branchId) qp.eq('pos_orders.branch_id', branchId);
    const { data: prevWeek } = await qp;

    const map = {}, prevMap = {};
    (thisWeek || []).forEach(i => {
      if (!i.product_id) return;
      map[i.product_id] = map[i.product_id] || { name:i.pos_products?.name||'Producto', cat:i.pos_products?.pos_categories?.name||'—', qty:0, total:0 };
      map[i.product_id].qty   += i.quantity || 0;
      map[i.product_id].total += i.total    || 0;
    });
    (prevWeek || []).forEach(i => {
      if (!i.product_id) return;
      prevMap[i.product_id] = prevMap[i.product_id] || { total: 0 };
      prevMap[i.product_id].total += i.total || 0;
    });

    const sorted = Object.entries(map)
      .map(([pid, d]) => ({ ...d, pid, prevTotal: prevMap[pid]?.total || 0 }))
      .sort((a, b) => b.total - a.total);

    S2tp.all = sorted;
    renderTopProductosCompleto(sorted);
  } catch(e) {
    renderTopProductosCompleto([]);
  }
}

function renderTopProductosCompleto(prods) {
  let list;
  if (S2tp.filter === 'facturacion') {
    list = [...prods].sort((a, b) => b.total - a.total);
  } else if (S2tp.filter === 'area') {
    const byArea = {};
    prods.forEach(p => { const a = p.cat || 'General'; if (!byArea[a] || p.total > byArea[a].total) byArea[a] = p; });
    list = Object.values(byArea).sort((a, b) => b.total - a.total);
  } else {
    list = prods;
  }

  const heroEl   = document.getElementById('top-hero-card');
  const othersEl = document.getElementById('top-others-card');
  if (!heroEl || !othersEl) return;

  if (!list.length) {
    heroEl.innerHTML = `
      <div class="top-hero-ribbon" style="background:#F1F5F9;color:#94A3B8">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5z"/></svg>
        Ranking semanal
      </div>
      <div class="top-hero-num" style="color:#CBD5E1">#1</div>
      <div class="eyebrow" style="color:#94A3B8;margin-top:10px">Producto top</div>
      <div style="font-size:20px;font-weight:700;color:#CBD5E1;margin-top:4px">Sin ventas esta semana</div>
      <div style="font-size:12px;color:#94A3B8;margin-top:4px">—</div>
      <div class="top-hero-stats">
        <div>
          <div class="eyebrow">Ventas</div>
          <div style="font-size:26px;font-weight:800;color:#CBD5E1;letter-spacing:-.025em;line-height:1;margin-top:4px">0</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:2px">unidades vendidas</div>
        </div>
        <div>
          <div class="eyebrow">Facturacion</div>
          <div style="font-size:26px;font-weight:800;color:#CBD5E1;letter-spacing:-.025em;line-height:1;margin-top:4px">$0</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:2px;font-weight:600">Sin comparativa aun</div>
        </div>
      </div>`;
    othersEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:.06em">Otros productos top</div>
        <button class="link-btn" style="color:#94A3B8">Ver todos →</button>
      </div>
      <div style="padding:32px 0;text-align:center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>
        <div style="color:#94A3B8;font-size:12px;margin-top:8px">Sin productos vendidos esta semana</div>
      </div>`;
    return;
  }

  const top      = list[0];
  const diffPct  = top.prevTotal > 0 ? Math.round(((top.total - top.prevTotal) / top.prevTotal) * 100) : null;

  heroEl.innerHTML = `
    <div class="top-hero-ribbon">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5z"/></svg>
      Ranking semanal
    </div>
    <div class="top-hero-num">#1</div>
    <div class="eyebrow" style="color:#5B6BFF;margin-top:10px">Producto top</div>
    <div style="font-size:22px;font-weight:700;color:#0F172A;margin-top:4px;letter-spacing:-.02em;line-height:1.15">${top.name}</div>
    <div style="font-size:12px;color:#64748B;margin-top:4px">${top.cat}</div>
    <div class="top-hero-stats">
      <div>
        <div class="eyebrow">Ventas</div>
        <div style="font-size:26px;font-weight:800;color:#0F172A;letter-spacing:-.025em;line-height:1;margin-top:4px">${top.qty}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">unidades vendidas</div>
      </div>
      <div>
        <div class="eyebrow">Facturacion</div>
        <div style="font-size:26px;font-weight:800;color:#0F172A;letter-spacing:-.025em;line-height:1;margin-top:4px">${COPF(top.total)}</div>
        <div style="font-size:11px;color:${diffPct!=null&&diffPct>=0?'#16A34A':'#DC2626'};margin-top:2px;font-weight:600">
          ${diffPct!=null ? (diffPct>=0?'↑ +':'↓ ')+Math.abs(diffPct)+'% vs semana ant.' : 'Sin comparativa aun'}
        </div>
      </div>
    </div>`;

  const others = list.slice(1, 8);
  othersEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:.06em">Otros productos top</div>
      <button class="link-btn">Ver todos →</button>
    </div>
    ${others.length ? others.map((p, i) => {
      const diff = p.prevTotal > 0 ? Math.round(((p.total - p.prevTotal) / p.prevTotal) * 100) : null;
      return `<div class="top-ext-row">
        <div class="top-ext-rank">#${i + 2}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#0F172A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:2px">${p.cat}</div>
        </div>
        <div style="text-align:right;padding-right:12px">
          <div style="font-size:12px;color:#64748B;font-variant-numeric:tabular-nums">${p.qty} und.</div>
        </div>
        <div style="text-align:right;min-width:90px">
          <div style="font-size:13px;font-weight:700;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(p.total)}</div>
          <div style="font-size:11px;color:${diff!=null&&diff>=0?'#16A34A':'#DC2626'};margin-top:2px;font-weight:600">
            ${diff != null ? (diff >= 0 ? '+' : '') + diff + '%' : '—'}
          </div>
        </div>
      </div>`;
    }).join('') : '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:12px">Solo 1 producto vendido esta semana</div>'}`;
}

// ── Render ALL extra sections ─────────────────────────
function renderAllExtra(orders, branchId) {
  try { renderDesglose(orders); }       catch(e) { console.error('renderDesglose', e); }
  try { renderMeseroDelDia(orders); }   catch(e) { console.error('renderMeseroDelDia', e); }
  try { renderClientes(orders); }       catch(e) { console.error('renderClientes', e); }
  try { renderTicketPromedio(orders); } catch(e) { console.error('renderTicketPromedio', e); }
  try { renderTipoPago(orders); }       catch(e) { console.error('renderTipoPago', e); }
  try { renderCanalVenta(orders); }     catch(e) { console.error('renderCanalVenta', e); }
  try { renderTicketPorHora(orders); }  catch(e) { console.error('renderTicketPorHora', e); }
  loadOpsKPIs(orders, branchId).catch(e => console.error('loadOpsKPIs', e));
}

function setupRealtime(branchId) {
  const filter = branchId ? 'branch_id=eq.'+branchId : undefined;
  sb.channel('dash').on('postgres_changes',{event:'*',schema:'public',table:'pos_orders',filter},()=>{
    loadTodayOrders(branchId);
    loadChartData(branchId);
  }).subscribe();
}

// ── Boot ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Guard: meseros/cajeros no tienen acceso al dashboard
  (async function() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const role = session?.user?.user_metadata?.role || '';
      if (role === 'mesero' || role === 'cajero' || role === 'cajera') {
        window.location.href = 'ventas.html';
      }
    } catch(e) {}
  })();

  renderAllExtra([], null); // render empty structure immediately
  renderDate();
  const branch   = await loadBranch();
  const branchId = branch?.id;
  await Promise.all([
    loadUser(branchId),
    loadSession(branchId),
    loadWaiters(branchId),
    loadWaiterNames(branchId),
    loadTodayOrders(branchId),
    loadStock(branchId),
    loadChartData(branchId),
    loadRatings(branchId),
    loadTopProductosCompleto(branchId),
  ]);
  loadPrintTimes();
  setupRealtime(branchId);

  // Auto-refresh cada 5 minutos
  setInterval(() => {
    loadTodayOrders(branchId);
    loadStock(branchId);
    loadPrintTimes();
  }, 5 * 60 * 1000);
});

// ── User menu dropdown ──
function toggleUserMenu() {
  var dd = document.getElementById('user-dropdown');
  var chevron = document.getElementById('user-chevron');
  var open = dd.classList.toggle('open');
  chevron.style.transform = open ? 'rotate(180deg)' : '';
}

document.addEventListener('click', function(e) {
  var wrap = document.getElementById('user-menu-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('user-dropdown').classList.remove('open');
    document.getElementById('user-chevron').style.transform = '';
  }
});

async function signOutUser() {
  document.getElementById('user-dropdown').classList.remove('open');
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

function goToAdmin() {
  document.getElementById('user-dropdown').classList.remove('open');
  window.location.href = 'admin-reg.html';
}

// ══════════════════════════════════════════════════════════════
// QUICK ACTION PANELS — lógica de los 3 paneles modales
// ══════════════════════════════════════════════════════════════

var QM = {
  overlay: null,
  activeModal: null,
  ordersCache: [],
  selectedOrderId: null
};

function qmInit() {
  QM.overlay = document.getElementById('qmOverlay');

  // Botones disparadores
  document.querySelectorAll('.quick-btn[data-modal]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      qmOpen(btn.dataset.modal, btn);
    });
  });

  // Cerrar: botón X
  document.querySelectorAll('.qm-close').forEach(function(btn) {
    btn.addEventListener('click', qmClose);
  });

  // Cerrar: clic en fondo oscuro
  QM.overlay.addEventListener('click', function(e) {
    if (e.target === QM.overlay) qmClose();
  });

  // Cerrar: Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && QM.overlay.classList.contains('is-open')) qmClose();
  });

  // Filtros inventario
  document.querySelectorAll('.qm-filter').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.qm-filter').forEach(function(b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var f = btn.dataset.filter;
      document.querySelectorAll('.qm-inv-row').forEach(function(row) {
        if (f === 'todos') { row.classList.remove('is-hidden'); return; }
        var s = row.dataset.status;
        var show = (f === 'criticos' && (s === 'out' || s === 'critical')) ||
                   (f === 'bajos' && s === 'low');
        row.classList.toggle('is-hidden', !show);
      });
    });
  });

  // Marcar revisado (inventario)
  var markBtn = document.getElementById('invMarkReviewed');
  if (markBtn) markBtn.addEventListener('click', function() {
    document.getElementById('invContent').classList.add('is-hidden');
    document.getElementById('invEmpty').classList.remove('is-hidden');
    document.getElementById('invFootDefault').classList.add('is-hidden');
    document.getElementById('invFootEmpty').classList.remove('is-hidden');
    document.getElementById('invSub').textContent = 'Todo en orden';
  });
  var showBtn = document.getElementById('invShowAlerts');
  if (showBtn) showBtn.addEventListener('click', function() {
    document.getElementById('invContent').classList.remove('is-hidden');
    document.getElementById('invEmpty').classList.add('is-hidden');
    document.getElementById('invFootDefault').classList.remove('is-hidden');
    document.getElementById('invFootEmpty').classList.add('is-hidden');
  });

  // Búsqueda comprobantes
  var searchInput = document.getElementById('orderSearch');
  if (searchInput) searchInput.addEventListener('input', function() {
    qmFilterOrders(searchInput.value.trim());
  });
}

function qmOpen(modalId, triggerBtn) {
  // Quitar is-active de todos los botones
  document.querySelectorAll('.quick-btn[data-modal]').forEach(function(b) {
    b.classList.remove('qactive');
  });
  if (triggerBtn) triggerBtn.classList.add('qactive');

  // Mostrar overlay y el panel correcto
  document.querySelectorAll('.qm-modal').forEach(function(m) { m.classList.remove('is-open'); });
  var modal = document.getElementById('modal-' + modalId);
  if (modal) modal.classList.add('is-open');
  QM.overlay.classList.add('is-open');
  QM.activeModal = modalId;

  // Cargar datos según el panel
  if (modalId === 'meseros')       qmLoadMeseros();
  if (modalId === 'inventario')    qmLoadInventario();
  if (modalId === 'comprobantes')  qmLoadComprobantes();
}

function qmClose() {
  QM.overlay.classList.remove('is-open');
  document.querySelectorAll('.quick-btn[data-modal]').forEach(function(b) { b.classList.remove('qactive'); });
  QM.activeModal = null;
}

// ── MESEROS ───────────────────────────────────────────────────
async function qmLoadMeseros() {
  var list = document.getElementById('qmMeserosList');
  var sub  = document.getElementById('qmMeserosSub');
  var note = document.getElementById('qmMeserosNote');
  list.innerHTML = '<div style="text-align:center;color:#94A3B8;font-size:13px;padding:20px">Cargando...</div>';

  var branchId = window._branchId || null;
  var q = sb.from('pos_users').select('*').eq('role', 'mesero').eq('active', true);
  if (branchId) q = q.eq('branch_id', branchId);
  var { data: meseros } = await q;
  meseros = meseros || [];

  // Contar mesas activas por mesero
  var { data: openOrders } = await sb.from('pos_orders')
    .select('waiter_id, table_id')
    .eq('status', 'open')
    .not('table_id', 'is', null);
  openOrders = openOrders || [];

  var tablesByWaiter = {};
  openOrders.forEach(function(o) {
    if (!o.waiter_id) return;
    if (!tablesByWaiter[o.waiter_id]) tablesByWaiter[o.waiter_id] = [];
    if (o.table_id && tablesByWaiter[o.waiter_id].indexOf(o.table_id) < 0)
      tablesByWaiter[o.waiter_id].push(o.table_id);
  });

  // Ordenar por mesas (desc)
  meseros.sort(function(a,b) {
    return (tablesByWaiter[b.id]||[]).length - (tablesByWaiter[a.id]||[]).length;
  });

  var totalMesas = Object.values(tablesByWaiter).reduce(function(s,t){return s+t.length;},0);
  sub.textContent = meseros.length + ' activo' + (meseros.length!==1?'s':'') + ' · ' + totalMesas + ' mesa' + (totalMesas!==1?'s':'') + ' en servicio';
  note.textContent = 'Actualizado ahora';

  var gradients = [
    'linear-gradient(135deg,#5B6BFF,#8B5CF6)',
    'linear-gradient(135deg,#06B6D4,#3B82F6)',
    'linear-gradient(135deg,#8B5CF6,#EC4899)',
    'linear-gradient(135deg,#10B981,#06B6D4)',
    'linear-gradient(135deg,#F59E0B,#EF4444)',
    'linear-gradient(135deg,#EC4899,#F43F5E)'
  ];

  if (!meseros.length) {
    list.innerHTML = '<div style="text-align:center;color:#94A3B8;font-size:13px;padding:20px">No hay meseros activos en turno</div>';
    return;
  }

  list.innerHTML = '';
  meseros.forEach(function(m, i) {
    var tables = tablesByWaiter[m.id] || [];
    var nombre = m.name || 'Mesero';
    var initials = nombre.trim().split(/\s+/).map(function(p){return p[0]||'';}).slice(0,2).join('').toUpperCase();
    var isTop = i === 0 && tables.length > 0;
    var chips = tables.slice(0,6).map(function(tid){ return '<span class="qm-chip">M' + (typeof tid==='number'?tid:tid) + '</span>'; }).join('');
    var grad = gradients[i % gradients.length];
    var row = document.createElement('div');
    row.className = 'qm-mesero';
    row.innerHTML =
      '<div class="qm-avatar-wrap">' +
        '<div class="qm-avatar" style="background:' + grad + '">' + initials + '</div>' +
        '<span class="qm-online"></span>' +
      '</div>' +
      '<div class="qm-mesero-info">' +
        '<div class="qm-mesero-top">' +
          '<span class="qm-mesero-name">' + nombre + '</span>' +
          (isTop ? '<span class="qm-tag-gold">★ Mesero del día</span>' : '') +
        '</div>' +
        '<div class="qm-mesero-since">' + (m.role || 'Mesero') + '</div>' +
        (chips ? '<div class="qm-mesas">' + chips + '</div>' : '') +
      '</div>' +
      '<div class="qm-mesero-count">' +
        '<div class="qm-count-num">' + tables.length + '</div>' +
        '<div class="qm-count-label">mesas</div>' +
      '</div>';
    list.appendChild(row);
  });

  // Actualizar sub-texto del botón en el dashboard
  var sub2 = document.getElementById('qb-waiters-sub');
  if (sub2) sub2.textContent = meseros.length + ' en turno';
}

// ── INVENTARIO ────────────────────────────────────────────────
async function qmLoadInventario() {
  var invList = document.getElementById('invList');
  var invSub  = document.getElementById('invSub');
  invList.innerHTML = '<div style="text-align:center;color:#94A3B8;font-size:13px;padding:20px">Cargando...</div>';

  var branchId = window._branchId || null;
  var q = sb.from('pos_ingredients').select('*');
  if (branchId) q = q.eq('branch_id', branchId);
  var { data: items } = await q;
  items = (items || []).filter(function(it){ return it.min_stock && it.stock < it.min_stock; });
  items.sort(function(a,b){ return (a.stock/a.min_stock) - (b.stock/b.min_stock); });

  var nOut   = items.filter(function(i){ return i.stock <= 0; }).length;
  var nCrit  = items.filter(function(i){ return i.stock > 0 && i.stock/i.min_stock < 0.2; }).length;
  var nLow   = items.filter(function(i){ return i.stock/i.min_stock >= 0.2; }).length;

  document.getElementById('invFnTodos').textContent   = items.length;
  document.getElementById('invFnCriticos').textContent = nOut + nCrit;
  document.getElementById('invFnBajos').textContent   = nLow;

  // Botón en dashboard
  var invSub2 = document.getElementById('qb-inv-sub');
  if (items.length) {
    invSub.textContent = (nOut+nCrit) + ' agotado' + ((nOut+nCrit)!==1?'s':'') + ' · ' + nLow + ' con stock bajo';
    if (invSub2) invSub2.textContent = items.length + ' por revisar';
  } else {
    invSub.textContent = 'Todo en orden';
    if (invSub2) invSub2.textContent = 'Todo en orden';
  }

  if (!items.length) {
    document.getElementById('invContent').classList.add('is-hidden');
    document.getElementById('invEmpty').classList.remove('is-hidden');
    document.getElementById('invFootDefault').classList.add('is-hidden');
    document.getElementById('invFootEmpty').classList.remove('is-hidden');
    return;
  }
  document.getElementById('invContent').classList.remove('is-hidden');
  document.getElementById('invEmpty').classList.add('is-hidden');
  document.getElementById('invFootDefault').classList.remove('is-hidden');
  document.getElementById('invFootEmpty').classList.add('is-hidden');

  invList.innerHTML = '';
  items.forEach(function(it) {
    var pct = it.min_stock > 0 ? Math.round(it.stock / it.min_stock * 100) : 0;
    pct = Math.min(pct, 100);
    var status = it.stock <= 0 ? 'out' : (pct < 20 ? 'critical' : 'low');
    var badgeLabel = status === 'out' ? 'Agotado' : status === 'critical' ? 'Crítico' : 'Stock bajo';
    var cls = status === 'low' ? 'is-low' : (status === 'out' ? 'is-out' : 'is-critical');
    var stockFmt = Number.isInteger(it.stock) ? String(it.stock) : String(it.stock).replace('.', ',');
    var row = document.createElement('div');
    row.className = 'qm-inv-row';
    row.dataset.status = status;
    row.innerHTML =
      '<div class="qm-inv-main">' +
        '<div class="qm-inv-top">' +
          '<span class="qm-inv-name">' + (it.name||'Producto') + '</span>' +
          '<span class="qm-badge ' + cls + '">' + badgeLabel + '</span>' +
        '</div>' +
        '<div class="qm-inv-cat">' + (it.category||'') + '</div>' +
        '<div class="qm-inv-track"><div class="qm-inv-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<div class="qm-inv-stock">' +
        '<div class="qm-inv-current ' + cls + '">' + stockFmt + '</div>' +
        '<div class="qm-inv-min">de ' + it.min_stock + ' ' + (it.unit||'und') + '</div>' +
      '</div>';
    invList.appendChild(row);
  });
}

// ── COMPROBANTES ──────────────────────────────────────────────
async function qmLoadComprobantes() {
  var orderList = document.getElementById('orderList');
  orderList.innerHTML = '<div style="padding:16px;text-align:center;color:#94A3B8;font-size:13px">Cargando...</div>';

  var branchId = window._branchId || null;
  var today = new Date(); today.setHours(0,0,0,0);
  var q = sb.from('pos_orders')
    .select('id,total,status,channel,created_at,table_id,customer_name,delivery_address,delivery_person,payment_method')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
    .limit(50);
  if (branchId) q = q.eq('branch_id', branchId);
  var { data: orders } = await q;
  QM.ordersCache = orders || [];

  qmRenderOrderList(QM.ordersCache);
  if (QM.ordersCache.length) qmSelectOrder(QM.ordersCache[0].id);
}

function qmFilterOrders(q) {
  var term = q.toLowerCase().replace('#','');
  var filtered = QM.ordersCache.filter(function(o){
    var id = String(o.id || '').padStart(4,'0');
    var t = new Date(o.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    return id.includes(term) || t.includes(term);
  });
  qmRenderOrderList(filtered);
  if (filtered.length) qmSelectOrder(filtered[0].id);
}

function qmRenderOrderList(orders) {
  var list = document.getElementById('orderList');
  list.innerHTML = '';
  if (!orders.length) {
    list.innerHTML = '<div class="qm-noresults">Sin resultados</div>';
    return;
  }
  orders.forEach(function(o) {
    var id = String(o.id || '').padStart(4, '0');
    var ch = o.channel || 'salon';
    var chCls = ch === 'delivery' ? 'is-domicilio' : ch === 'counter' ? 'is-mostrador' : 'is-salon';
    var chLabel = ch === 'delivery' ? 'Domicilio' : ch === 'counter' ? 'Mostrador' : 'Salón' + (o.table_id ? ' · Mesa ' + o.table_id : '');
    var who = ch === 'delivery' ? (o.delivery_address || o.customer_name || 'Domicilio') : (o.customer_name || (ch === 'counter' ? 'Venta rápida' : 'Mesa ' + (o.table_id||'')));
    var t = new Date(o.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    var total = '$' + Math.round(o.total||0).toLocaleString('es-CO');
    var btn = document.createElement('button');
    btn.className = 'qm-order' + (o.id === QM.selectedOrderId ? ' is-active' : '');
    btn.dataset.id = o.id;
    btn.innerHTML =
      '<div class="qm-order-main">' +
        '<div class="qm-order-top">' +
          '<span class="qm-order-id">#' + id + '</span>' +
          '<span class="qm-type ' + chCls + '">' + chLabel + '</span>' +
        '</div>' +
        '<div class="qm-order-who">' + who + '</div>' +
      '</div>' +
      '<div class="qm-order-right">' +
        '<div class="qm-order-total">' + total + '</div>' +
        '<div class="qm-order-time">' + t + '</div>' +
      '</div>';
    btn.addEventListener('click', function() { qmSelectOrder(o.id); });
    list.appendChild(btn);
  });
}

function qmSelectOrder(id) {
  QM.selectedOrderId = id;
  document.querySelectorAll('.qm-order').forEach(function(b){ b.classList.toggle('is-active', b.dataset.id == id); });
  var o = QM.ordersCache.find(function(x){ return x.id == id; });
  if (!o) return;

  var ch = o.channel || 'salon';
  var chCls = ch === 'delivery' ? 'is-domicilio' : ch === 'counter' ? 'is-mostrador' : 'is-salon';
  var chLabel = ch === 'delivery' ? 'Domicilio' : ch === 'counter' ? 'Mostrador' : 'Salón' + (o.table_id ? ' · Mesa ' + o.table_id : '');
  var who = ch === 'delivery' ? (o.delivery_address || o.customer_name || 'Domicilio') : (o.customer_name || (ch === 'counter' ? 'Venta rápida' : 'Mesa ' + (o.table_id||'')));
  var t = new Date(o.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  var total = '$' + Math.round(o.total||0).toLocaleString('es-CO');
  var idStr = String(o.id||'').padStart(4,'0');
  var thirdMeta = ch === 'delivery'
    ? '<div><span class="qm-meta-k">Domiciliario</span><span class="qm-meta-v">' + (o.delivery_person || 'Por asignar') + '</span></div>'
    : '<div><span class="qm-meta-k">Canal</span><span class="qm-meta-v">' + chLabel + '</span></div>';
  var driverBtn = ch === 'delivery' ? (
    '<button class="qm-reprint qm-reprint-driver" data-doc="Copia para domiciliario">' +
      '<span class="qm-reprint-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M2 17h2l1-7h12l4 7h2"/><path d="M9 17h6"/></svg></span>' +
      '<span class="qm-reprint-text"><span class="qm-reprint-name">Copia para domiciliario</span><span class="qm-reprint-desc">Incluye dirección y ruta · ' + (o.delivery_person||'Domiciliario') + '</span></span>' +
      '<svg class="qm-reprint-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
    '</button>'
  ) : '';

  var detail = document.getElementById('orderDetail');
  detail.innerHTML =
    '<div class="qm-detail-head">' +
      '<div>' +
        '<div class="qm-detail-headline">' +
          '<span class="qm-detail-id">Pedido #' + idStr + '</span>' +
          '<span class="qm-type ' + chCls + '">' + chLabel + '</span>' +
        '</div>' +
        '<div class="qm-detail-who">' + who + ' · ' + t + '</div>' +
      '</div>' +
      '<div class="qm-detail-total">' + total + '</div>' +
    '</div>' +
    '<div class="qm-detail-meta">' +
      '<div><span class="qm-meta-k">Pago</span><span class="qm-meta-v">' + (o.payment_method || '—') + '</span></div>' +
      '<div><span class="qm-meta-k">Estado</span><span class="qm-meta-v">' + (o.status || '—') + '</span></div>' +
      thirdMeta +
    '</div>' +
    '<div class="qm-reprint-label">Reimprimir</div>' +
    '<div class="qm-reprint-grid">' +
      qmReprintBtn('Comanda','Ticket de cocina · Impresora Cocina','M9 4H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4') +
      qmReprintBtn('Precuenta','Cuenta previa al pago · Impresora Caja','M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z') +
      qmReprintBtn('Recibo','Comprobante de venta · Impresora Caja','M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z') +
      driverBtn +
    '</div>' +
    '<div class="qm-toast is-hidden" id="printToast"></div>';

  detail.querySelectorAll('.qm-reprint').forEach(function(btn){
    btn.addEventListener('click', function(){
      var doc = btn.dataset.doc;
      var toast = document.getElementById('printToast');
      toast.innerHTML = '✓ Enviando <strong>' + doc + '</strong> del pedido #' + idStr + ' a la impresora...';
      toast.classList.remove('is-hidden');
      setTimeout(function(){ toast.classList.add('is-hidden'); }, 2600);
    });
  });
}

function qmReprintBtn(name, desc, svgPath) {
  return '<button class="qm-reprint" data-doc="' + name + '">' +
    '<span class="qm-reprint-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + svgPath + '"/></svg></span>' +
    '<span class="qm-reprint-text"><span class="qm-reprint-name">' + name + '</span><span class="qm-reprint-desc">' + desc + '</span></span>' +
    '<svg class="qm-reprint-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
  '</button>';
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function(){ qmInit(); });
