/* informes.js — Módulo de informes y reportes · Cobra POS */
/* REGLA: todo dato viene de Supabase. Nada hardcodeado. */

// ── Estado ────────────────────────────────────────────────────────────────
let IR = {
  tenantId: null,
  branchId: null,
  period: 'today',
  dateFrom: null,
  dateTo: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────
const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-CO');
const fmtN = n => Math.round(n || 0).toLocaleString('es-CO');

function periodRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'today') {
    return {
      from: today.toISOString(),
      to: new Date(today.getTime() + 86400000).toISOString(),
      label: 'Hoy',
    };
  }
  if (period === 'week') {
    const day = today.getDay(); // 0=Dom
    const mon = new Date(today.getTime() - (day === 0 ? 6 : day - 1) * 86400000);
    return {
      from: mon.toISOString(),
      to: new Date(today.getTime() + 86400000).toISOString(),
      label: 'Esta semana',
    };
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      from: start.toISOString(),
      to: new Date(today.getTime() + 86400000).toISOString(),
      label: 'Este mes',
    };
  }
  if (period === 'custom' && IR.dateFrom && IR.dateTo) {
    return {
      from: new Date(IR.dateFrom).toISOString(),
      to: new Date(new Date(IR.dateTo).getTime() + 86400000).toISOString(),
      label: IR.dateFrom + ' — ' + IR.dateTo,
    };
  }
  return periodRange('today');
}

// ── Boot ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const sb = window._pos && window._pos.sb;
  if (!sb) {
    document.getElementById('sb-status').textContent = 'error';
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const user = session.user;
  IR.tenantId = user.user_metadata?.tenant_id || null;
  IR.branchId = user.user_metadata?.branch_id  || null;

  // Nombre de sucursal
  if (IR.branchId) {
    const { data: br } = await sb.from('branches').select('name').eq('id', IR.branchId).maybeSingle();
    if (br) document.getElementById('sb-brand').textContent = br.name;
  }

  document.getElementById('sb-status').textContent = 'en línea';
  document.getElementById('sb-status').style.color = '#16A34A';
  document.getElementById('sb-user').textContent = user.email || '—';

  setupPeriodButtons();
  await loadReport();

  let authInitialized = false;
  sb.auth.onAuthStateChange((event) => {
    if (!authInitialized) { authInitialized = true; return; }
    if (event === 'SIGNED_OUT') window.location.href = 'login.html';
  });
});

// ── Period buttons ────────────────────────────────────────────────────────
function setupPeriodButtons() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      IR.period = btn.dataset.period;
      const customRange = document.getElementById('custom-range');
      if (IR.period === 'custom') {
        customRange.style.display = 'flex';
        return; // Wait for user to click Apply
      }
      customRange.style.display = 'none';
      loadReport();
    });
  });

  // Default dates for custom
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date-from').value = today;
  document.getElementById('date-to').value = today;
}

window.applyCustomRange = () => {
  IR.dateFrom = document.getElementById('date-from').value;
  IR.dateTo   = document.getElementById('date-to').value;
  if (!IR.dateFrom || !IR.dateTo) return;
  loadReport();
};

// ── Load report ───────────────────────────────────────────────────────────
async function loadReport() {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;

  const { from, to, label } = periodRange(IR.period);

  // Fetch orders con items
  let q = sb
    .from('pos_orders')
    .select(`
      id, status, channel, total, total_final, delivery_fee, tip_amount, discount_amount,
      guests, waiter_name, payment_method, closed_at, opened_at,
      pos_order_items ( id, product_id, product_name, name, quantity, unit_price, total )
    `)
    .eq('status', 'paid')
    .gte('closed_at', from)
    .lt('closed_at', to)
    .order('closed_at', { ascending: true });

  if (IR.branchId) q = q.eq('branch_id', IR.branchId);
  if (IR.tenantId) q = q.eq('tenant_id', IR.tenantId);

  const { data: orders, error } = await q;
  if (error) { console.error('[Informes] fetch error', error); return; }

  // "Las ventas son las ventas": el domicilio NUNCA cuenta como venta. Normalizamos
  // total_final = SOLO comida (total − domicilio), robusto ante el bug histórico donde
  // el domi quedó dentro de total_final. Todos los informes usan total_final.
  const list = (orders || []).map(o => {
    const dom = parseFloat(o.delivery_fee)||0;
    const tot = parseFloat(o.total);
    if(dom>0 && !isNaN(tot)) o.total_final = tot - dom;
    return o;
  });

  renderKPIs(list, label);
  renderChart(list, from, to, label);
  // Desglose REAL de pagos (pos_payments) — los pagos 'multiple' se reparten
  // en sus métodos verdaderos en lugar de mostrarse como una barra opaca
  let pagosRows = [];
  try {
    const oIds = list.map(o => o.id);
    if (oIds.length) {
      let qp = sb.from('pos_payments').select('order_id, method, amount').in('order_id', oIds);
      const { data: pd } = await qp;
      pagosRows = pd || [];
    }
  } catch(e) { console.warn('[Informes] pos_payments:', e); }
  renderPayMethods(list, pagosRows);
  renderTopProducts(list, label);
  try { const rawByProduct = await loadCostosRecetas(sb); renderRentabilidad(list, rawByProduct, label); } catch (e) { console.warn('[Informes] rentabilidad:', e); }
  renderMeseroRanking(list, label);
  renderCanales(list, label);
}

// ── KPIs ─────────────────────────────────────────────────────────────────
function renderKPIs(orders, label) {
  const total   = orders.reduce((s, o) => s + parseFloat(o.total_final || 0), 0);
  const count   = orders.length;
  const ticket  = count > 0 ? total / count : 0;
  const guests  = orders.reduce((s, o) => s + (parseInt(o.guests) || 1), 0);

  setText('kpi-total',  fmt(total));
  setText('kpi-orders', fmtN(count));
  setText('kpi-ticket', fmt(ticket));
  setText('kpi-guests', fmtN(guests));

  setText('kpi-total-delta',  label, 'neu');
  setText('kpi-orders-delta', label, 'neu');
  setText('kpi-ticket-delta', count > 0 ? (count + ' ventas') : 'Sin datos', 'neu');
  setText('kpi-guests-delta', guests > 0 ? (guests + ' personas') : 'Sin datos', 'neu');
}

function setText(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (cls) el.className = 'kpi-delta ' + cls;
}

// ── Chart: ventas por hora/día ────────────────────────────────────────────
function renderChart(orders, from, to, label) {
  const svg = document.getElementById('rpt-chart');
  const xLabels = document.getElementById('chart-x-labels');
  if (!svg) return;

  const days = Math.round((new Date(to) - new Date(from)) / 86400000);
  const byHour = IR.period === 'today';

  setText('chart-period-label', label);
  setText('chart-label', byHour ? 'Ventas por hora' : 'Ventas por día');

  let buckets = [];
  let labels  = [];

  if (byHour) {
    for (let h = 6; h <= 23; h++) {
      const sum = orders
        .filter(o => new Date(o.closed_at).getHours() === h)
        .reduce((s, o) => s + parseFloat(o.total_final || 0), 0);
      buckets.push(sum);
      labels.push(h + ':00');
    }
  } else {
    const start = new Date(from);
    for (let d = 0; d < Math.min(days, 31); d++) {
      const day = new Date(start.getTime() + d * 86400000);
      const ds = day.toISOString().split('T')[0];
      const sum = orders
        .filter(o => (o.closed_at || '').startsWith(ds))
        .reduce((s, o) => s + parseFloat(o.total_final || 0), 0);
      buckets.push(sum);
      const wd = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'][day.getDay()];
      labels.push(d < 7 ? wd : (day.getDate() + ''));
    }
  }

  const max = Math.max(...buckets, 1);
  const W = 700, H = 160;
  const n = buckets.length;
  const bW = W / n;
  const pad = bW * 0.2;

  svg.innerHTML = buckets.map((v, i) => {
    const bH = Math.max(2, (v / max) * (H - 20));
    const x  = i * bW + pad;
    const y  = H - bH;
    const w  = bW - pad * 2;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${bH.toFixed(1)}"
              rx="3" fill="${v > 0 ? '#5B6BFF' : '#ECEEF2'}" opacity="${v > 0 ? '1' : '0.5'}"/>`;
  }).join('');

  // X labels (show every Nth)
  const step = n > 12 ? Math.ceil(n / 12) : 1;
  if (xLabels) {
    xLabels.innerHTML = buckets.map((_, i) =>
      i % step === 0 ? `<span>${labels[i]}</span>` : '<span></span>'
    ).join('');
  }
}

// ── Payment methods ───────────────────────────────────────────────────────
const PAY_COLORS = {
  efectivo:      '#10B981',
  tarjeta:       '#5B6BFF',
  transferencia: '#F59E0B',
  nequi:         '#8B5CF6',
  multiple:      '#64748B',
};
const PAY_NAMES = {
  efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia',
  nequi:'Nequi / QR', multiple:'Múltiple',
};

function renderPayMethods(orders, pagosRows) {
  const total = orders.reduce((s, o) => s + parseFloat(o.total_final || 0), 0);
  const byMethod = {};
  // 1) Desglose real desde pos_payments (incluye el reparto de pagos mixtos)
  const conDesglose = new Set();
  (pagosRows || []).forEach(p => {
    const m = (p.method || 'efectivo').toLowerCase();
    byMethod[m] = (byMethod[m] || 0) + (parseFloat(p.amount) || 0);
    conDesglose.add(p.order_id);
  });
  // 2) Fallback para pedidos pagados sin desglose (históricos)
  orders.forEach(o => {
    if (conDesglose.has(o.id)) return;
    const m = (o.payment_method || 'efectivo').toLowerCase();
    byMethod[m] = (byMethod[m] || 0) + parseFloat(o.total_final || 0);
  });

  const sorted = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
  const barsEl = document.getElementById('pay-bars');
  const legEl  = document.getElementById('pay-legend');

  if (!barsEl) return;
  if (sorted.length === 0) {
    barsEl.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px">Sin datos</div>';
    return;
  }

  barsEl.innerHTML = sorted.map(([method, amt]) => {
    const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
    const color = PAY_COLORS[method] || '#94A3B8';
    const name  = PAY_NAMES[method] || method;
    return `
      <div class="pay-bar-row">
        <div class="pay-bar-info">
          <span class="pay-bar-name">${name}</span>
          <span class="pay-bar-pct">${fmt(amt)} · ${pct}%</span>
        </div>
        <div class="pay-bar-track">
          <div class="pay-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');

  if (legEl) {
    legEl.innerHTML = sorted.map(([m]) =>
      `<div class="pay-leg-item"><span class="pay-leg-dot" style="background:${PAY_COLORS[m]||'#94A3B8'}"></span>${PAY_NAMES[m]||m}</div>`
    ).join('');
  }
}

// ── Top productos ─────────────────────────────────────────────────────────
function renderTopProducts(orders, label) {
  const tbody = document.getElementById('top-body');
  setText('top-sub', label);
  if (!tbody) return;

  const byProd = {};
  orders.forEach(o => {
    (o.pos_order_items || []).forEach(it => {
      const name = it.product_name || it.name || 'Producto';
      if (!byProd[name]) byProd[name] = { qty: 0, total: 0 };
      byProd[name].qty   += parseInt(it.quantity) || 1;
      byProd[name].total += parseFloat(it.unit_price || 0) * (parseInt(it.quantity) || 1);
    });
  });

  const sorted = Object.entries(byProd).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="rpt-loading">Sin datos para el período</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(([name, d], i) => `
    <tr>
      <td><span class="rpt-rank-num">${i + 1}</span></td>
      <td><span class="rpt-prod-name">${name}</span></td>
      <td>${fmtN(d.qty)}</td>
      <td><span class="rpt-total">${fmt(d.total)}</span></td>
    </tr>`).join('');
}

// ── Rentabilidad del negocio (ventas × costo de receta) ────────────────────
// Costo de materia prima por producto (combinación por defecto: base + 1ra opción
// de cada grupo). Aproximado pero útil para la rentabilidad global.
async function loadCostosRecetas(sb) {
  const out = {};
  try {
    let qi = sb.from('iv_insumos').select('id,precio,conversion');
    let qr = sb.from('iv_recetas').select('product_id,insumo_id,cantidad,variant_option_id,merma');
    let qp = sb.from('pos_products').select('id,variables');
    let qm = sb.from('iv_params').select('merma_enabled');
    if (IR.branchId) { qi = qi.eq('branch_id', IR.branchId); qr = qr.eq('branch_id', IR.branchId); qm = qm.eq('branch_id', IR.branchId); }
    if (IR.tenantId) { qp = qp.eq('tenant_id', IR.tenantId); }
    const [ri, rr, rp, rm] = await Promise.all([qi, qr, qp, qm]);
    const mermaOn = !(rm.data && rm.data[0] && rm.data[0].merma_enabled === false);
    const costoUr = {};
    (ri.data || []).forEach(i => { const conv = parseFloat(i.conversion) || 1; costoUr[i.id] = (parseFloat(i.precio) || 0) / (conv > 0 ? conv : 1); });
    const defOpts = {};
    (rp.data || []).forEach(p => { const set = new Set(); (p.variables || []).forEach(g => { const o = (g.options || [])[0]; if (o && o.id) set.add(o.id); }); defOpts[p.id] = set; });
    (rr.data || []).forEach(l => {
      const pid = l.product_id, vo = l.variant_option_id;
      if (vo && !(defOpts[pid] && defOpts[pid].has(vo))) return;   // solo combinación por defecto
      const cu = costoUr[l.insumo_id]; if (cu == null) return;
      const cant = parseFloat(l.cantidad) || 0;
      const merma = mermaOn ? (1 + (parseFloat(l.merma) || 0) / 100) : 1;
      out[pid] = (out[pid] || 0) + cant * cu * merma;
    });
  } catch (e) { console.warn('[Informes] costos recetas:', e); }
  return out;
}
function renderRentabilidad(orders, rawByProduct, label) {
  const host = document.getElementById('rent-body'); if (!host) return;
  setText('rent-sub', label);
  const byProd = {};
  let gRev = 0, gCost = 0, gConReceta = 0;
  orders.forEach(o => (o.pos_order_items || []).forEach(it => {
    const pid = it.product_id;
    const name = it.product_name || it.name || 'Producto';
    const qty = parseInt(it.quantity) || 1;
    const rev = (it.total != null ? parseFloat(it.total) : parseFloat(it.unit_price || 0) * qty) || 0;
    const tieneCosto = rawByProduct[pid] != null;
    const cost = (rawByProduct[pid] || 0) * qty;
    if (!byProd[name]) byProd[name] = { qty: 0, rev: 0, cost: 0, tieneCosto };
    byProd[name].qty += qty; byProd[name].rev += rev; byProd[name].cost += cost;
    gRev += rev; gCost += cost; if (tieneCosto) gConReceta += rev;
  }));
  const gMargin = gRev - gCost;
  const gPct = gRev > 0 ? gMargin / gRev * 100 : 0;
  setText('rent-rev', fmt(gRev));
  setText('rent-cost', fmt(gCost));
  setText('rent-margin', fmt(gMargin));
  setText('rent-pct', gPct.toFixed(1) + '%');
  const cob = gRev > 0 ? (gConReceta / gRev * 100) : 0;
  setText('rent-cob', cob >= 99 ? 'Todos los productos vendidos tienen receta.' : 'Nota: ' + cob.toFixed(0) + '% de las ventas tienen receta cargada; el resto cuenta como costo 0 (súbeles receta para más precisión).');
  const rows = Object.entries(byProd).map(([name, d]) => ({ name, qty: d.qty, rev: d.rev, cost: d.cost, tieneCosto: d.tieneCosto, margin: d.rev - d.cost, pct: d.rev > 0 ? (d.rev - d.cost) / d.rev * 100 : 0 }));
  rows.sort((a, b) => b.margin - a.margin);
  host.innerHTML = rows.length ? rows.map(d => `<tr>
    <td><span class="rpt-prod-name">${d.name}</span></td>
    <td>${fmtN(d.qty)}</td>
    <td>${fmt(d.rev)}</td>
    <td>${d.tieneCosto ? fmt(d.cost) : '<span style="color:#94A3B8">sin receta</span>'}</td>
    <td><span class="rpt-total">${fmt(d.margin)}</span></td>
    <td><span style="font-weight:700;color:${d.pct >= 60 ? '#16A34A' : d.pct >= 40 ? '#EAB308' : '#DC2626'}">${d.pct.toFixed(0)}%</span></td>
  </tr>`).join('') : '<tr><td colspan="6" class="rpt-loading">Sin datos para el período</td></tr>';
}

// ── Ranking meseros ───────────────────────────────────────────────────────
function renderMeseroRanking(orders, label) {
  const el = document.getElementById('mesero-ranking');
  setText('mesero-sub', label);
  if (!el) return;

  const byWaiter = {};
  orders.forEach(o => {
    const w = o.waiter_name || '(sin asignar)';
    if (!byWaiter[w]) byWaiter[w] = { orders: 0, total: 0 };
    byWaiter[w].orders++;
    byWaiter[w].total += parseFloat(o.total_final || 0);
  });

  const sorted = Object.entries(byWaiter).sort((a, b) => b[1].orders - a[1].orders);

  if (sorted.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px">Sin datos para el período</div>';
    return;
  }

  const posCls = ['gold', 'silver', 'bronze'];
  el.innerHTML = sorted.slice(0, 8).map(([name, d], i) => `
    <div class="mesero-row">
      <div class="mesero-pos ${posCls[i] || ''}">${i + 1}</div>
      <div class="mesero-info">
        <div class="mesero-nm">${name}</div>
        <div class="mesero-st">${fmtN(d.orders)} pedidos</div>
      </div>
      <div class="mesero-amt">${fmt(d.total)}</div>
    </div>`).join('');
}

// ── Canales ───────────────────────────────────────────────────────────────
const CANAL_META = {
  salon:     { label: 'Salón', icon: '🍽️' },
  domicilio: { label: 'Domicilio', icon: '🛵' },
  rapida:    { label: 'Mostrador', icon: '⚡' },
  rapido:    { label: 'Mostrador', icon: '⚡' },
};

function renderCanales(orders, label) {
  const el = document.getElementById('canal-row');
  setText('canal-sub', label);
  if (!el) return;

  const total = orders.reduce((s, o) => s + parseFloat(o.total_final || 0), 0);
  const byCh = {};
  orders.forEach(o => {
    const c = o.channel || 'salon';
    if (!byCh[c]) byCh[c] = { count: 0, total: 0 };
    byCh[c].count++;
    byCh[c].total += parseFloat(o.total_final || 0);
  });

  const sorted = Object.entries(byCh).sort((a, b) => b[1].total - a[1].total);

  if (sorted.length === 0) {
    el.innerHTML = '<div style="padding:20px;color:#94A3B8;font-size:13px">Sin datos</div>';
    return;
  }

  el.innerHTML = sorted.map(([ch, d]) => {
    const meta = CANAL_META[ch] || { label: ch, icon: '📌' };
    const pct  = total > 0 ? Math.round((d.total / total) * 100) : 0;
    return `
      <div class="canal-chip">
        <div class="canal-icon" style="font-size:22px">${meta.icon}</div>
        <div class="canal-name">${meta.label}</div>
        <div class="canal-val">${fmt(d.total)}</div>
        <div class="canal-pct">${pct}% · ${fmtN(d.count)} pedidos</div>
      </div>`;
  }).join('');
}
