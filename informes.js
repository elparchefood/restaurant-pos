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
      id, status, channel, total_final, tip_amount, discount_amount,
      guests, waiter_name, payment_method, closed_at, opened_at,
      pos_order_items ( id, product_name, name, quantity, unit_price )
    `)
    .eq('status', 'paid')
    .gte('closed_at', from)
    .lt('closed_at', to)
    .order('closed_at', { ascending: true });

  if (IR.branchId) q = q.eq('branch_id', IR.branchId);
  if (IR.tenantId) q = q.eq('tenant_id', IR.tenantId);

  const { data: orders, error } = await q;
  if (error) { console.error('[Informes] fetch error', error); return; }

  const list = orders || [];

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
