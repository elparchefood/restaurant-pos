// modules/kitchen.js — KDS (Kitchen Display System) · Cobra POS
// Renderiza en #pos-app (index.html). Usa window._pos.sb y window._pos.state.

(function () {
  'use strict';

  // ─── Estado ──────────────────────────────────────────────────────────────
  let orders = [];
  let filter = 'all'; // 'all' | 'new' | 'cooking' | 'ready'
  let timerTick = null;
  let realtimeSub = null;
  let soundEnabled = true;
  try { soundEnabled = localStorage.getItem('pos.kds.sound') !== 'false'; } catch(e) {}

  const ACTIVE_STATUSES = ['open', 'in_progress', 'esperando', 'pendiente_pago'];

  // Urgency thresholds (minutos)
  const WARN_MIN = 15;
  const CRIT_MIN = 30;

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const sb = () => window._pos && window._pos.sb;
  const state = () => window._pos && window._pos.state;

  function elapsed(iso) {
    if (!iso) return '0:00';
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms) || ms < 0) return '0:00';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
      ? h + ':' + String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0')
      : m + ':' + String(ss).padStart(2,'0');
  }

  function elapsedMins(iso) {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  }

  function urgencyClass(iso) {
    const m = elapsedMins(iso);
    if (m >= CRIT_MIN) return 'kds-card--critical';
    if (m >= WARN_MIN) return 'kds-card--warning';
    return '';
  }

  function statusMeta(status) {
    const map = {
      open:             { label: 'Nueva',        color: '#F59E0B' },
      in_progress:      { label: 'En cocina',    color: '#F97316' },
      esperando:        { label: 'En cocina',    color: '#F97316' },
      pendiente_pago:   { label: 'Listo·cobrar', color: '#EF4444' },
      ready_for_pickup: { label: 'Listo',        color: '#22C55E' },
    };
    return map[status] || { label: status, color: '#94A3B8' };
  }

  function channelLabel(order) {
    const c = order.channel || 'salon';
    if (c === 'domicilio') return 'Dom · ' + (order.customer_name || '');
    if (c === 'rapida' || c === 'rapido') return 'Mostrador';
    return order.tableName || 'Mesa';
  }

  function playBeep() {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.4);
    } catch(e) {}
  }

  // ─── Fetch ───────────────────────────────────────────────────────────────
  async function fetchOrders() {
    const client = sb();
    const st = state();
    if (!client) return [];

    let q = client
      .from('pos_orders')
      .select(`
        id, status, channel, table_id, waiter_name, guests, opened_at, created_at,
        notes, customer_name,
        pos_tables ( id, name ),
        pos_order_items ( id, quantity, product_name, name, unit_price, notes, status, created_at )
      `)
      .not('status', 'eq', 'completed')
      .not('status', 'eq', 'cancelled')
      .not('status', 'eq', 'paid')
      .order('opened_at', { ascending: true });

    if (st && st.branchId) q = q.eq('branch_id', st.branchId);
    if (st && st.tenantId) q = q.eq('tenant_id', st.tenantId);

    const { data, error } = await q;
    if (error) { console.error('[KDS] fetch error', error); return []; }

    return (data || []).map(o => ({
      id: o.id,
      status: o.status || 'open',
      channel: o.channel || 'salon',
      tableId: o.table_id,
      tableName: (o.pos_tables && o.pos_tables.name) || null,
      customer_name: o.customer_name || '',
      waiter: o.waiter_name || '—',
      guests: o.guests || 0,
      openedAt: o.opened_at || o.created_at,
      notes: o.notes || '',
      items: (o.pos_order_items || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(it => ({
          id: it.id,
          qty: it.quantity || 1,
          name: it.product_name || it.name || 'Ítem',
          notes: it.notes || '',
          status: it.status || 'pending',
        })),
    }));
  }

  // ─── Mutaciones ──────────────────────────────────────────────────────────
  async function markOrderReady(orderId) {
    const client = sb();
    if (!client) return;
    const { error } = await client
      .from('pos_orders')
      .update({ status: 'ready_for_pickup' })
      .eq('id', orderId);
    if (error) { alert('Error al marcar listo: ' + error.message); return; }
    await reload();
  }

  async function markItemDone(itemId, currentStatus) {
    const client = sb();
    if (!client) return;
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    const { error } = await client
      .from('pos_order_items')
      .update({ status: newStatus })
      .eq('id', itemId);
    if (error) { console.error('[KDS] markItemDone error', error); return; }
    await reload();
  }

  async function markOrderComplete(orderId) {
    const client = sb();
    if (!client) return;
    const { error } = await client
      .from('pos_orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);
    if (error) { alert('Error: ' + error.message); return; }
    await reload();
  }

  // ─── Reload ───────────────────────────────────────────────────────────────
  async function reload() {
    const prev = orders.length;
    orders = await fetchOrders();
    if (orders.length > prev) playBeep();
    renderCards();
  }

  // ─── Filtro ───────────────────────────────────────────────────────────────
  function filteredOrders() {
    if (filter === 'new')     return orders.filter(o => o.status === 'open');
    if (filter === 'cooking') return orders.filter(o => o.status === 'in_progress' || o.status === 'esperando');
    if (filter === 'ready')   return orders.filter(o => o.status === 'ready_for_pickup' || o.status === 'pendiente_pago');
    return orders;
  }

  // ─── Render: Cards ───────────────────────────────────────────────────────
  function renderCards() {
    const grid = document.getElementById('kds-grid');
    if (!grid) return;

    const list = filteredOrders();
    updateCounters();

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="kds-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
          <div class="kds-empty-title">Sin pedidos ${filter !== 'all' ? 'en este filtro' : 'activos'}</div>
          <div class="kds-empty-sub">Los pedidos nuevos aparecen aquí automáticamente</div>
        </div>`;
      return;
    }

    grid.innerHTML = list.map(o => {
      const meta   = statusMeta(o.status);
      const label  = channelLabel(o);
      const urg    = urgencyClass(o.openedAt);
      const mins   = elapsedMins(o.openedAt);
      const allDone = o.items.length > 0 && o.items.every(it => it.status === 'done');
      const canMarkReady = o.status !== 'ready_for_pickup' && o.status !== 'pendiente_pago';

      return `
        <div class="kds-card ${urg}" data-order="${o.id}">
          <div class="kds-card-head">
            <div class="kds-card-id">
              <span class="kds-table-label">${label}</span>
              ${o.waiter !== '—' ? `<span class="kds-waiter">${o.waiter}</span>` : ''}
            </div>
            <span class="kds-status-chip" style="background:${meta.color}22;color:${meta.color}">${meta.label}</span>
          </div>

          <div class="kds-timer" data-opened="${o.openedAt}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span class="kds-timer-val">${elapsed(o.openedAt)}</span>
            ${mins >= WARN_MIN ? `<span class="kds-warn-badge">${mins >= CRIT_MIN ? 'URGENTE' : 'Demorado'}</span>` : ''}
          </div>

          ${o.notes ? `<div class="kds-order-note">${o.notes}</div>` : ''}

          <ul class="kds-items">
            ${o.items.map(it => `
              <li class="kds-item ${it.status === 'done' ? 'kds-item--done' : ''}"
                  onclick="kdsToggleItem('${it.id}','${it.status}')">
                <span class="kds-item-check">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <span class="kds-item-qty">${it.qty}×</span>
                <span class="kds-item-name">${it.name}</span>
                ${it.notes ? `<span class="kds-item-note">${it.notes}</span>` : ''}
              </li>`).join('')}
          </ul>

          <div class="kds-card-foot">
            ${canMarkReady
              ? `<button class="kds-btn-ready ${allDone ? 'kds-btn-ready--go' : ''}"
                         onclick="kdsMarkReady('${o.id}')">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                   Listo para servir
                 </button>`
              : `<span class="kds-served-label">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                   Esperando cobro
                 </span>`}
            ${o.guests > 0 ? `<span class="kds-guests">${o.guests} pers.</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function updateCounters() {
    const all     = orders.length;
    const newO    = orders.filter(o => o.status === 'open').length;
    const cooking = orders.filter(o => o.status === 'in_progress' || o.status === 'esperando').length;
    const ready   = orders.filter(o => o.status === 'ready_for_pickup' || o.status === 'pendiente_pago').length;

    const setN = (id, n) => { const el = document.getElementById(id); if(el) el.textContent = n > 0 ? n : ''; };
    setN('kds-n-all', all);
    setN('kds-n-new', newO);
    setN('kds-n-cooking', cooking);
    setN('kds-n-ready', ready);

    const hdr = document.getElementById('kds-count-label');
    if (hdr) hdr.textContent = all + ' pedido' + (all !== 1 ? 's' : '');
  }

  // Exponemos para onclick inline
  window.kdsMarkReady  = async (id) => await markOrderReady(id);
  window.kdsToggleItem = async (id, st) => await markItemDone(id, st);

  // ─── Reloj en vivo ───────────────────────────────────────────────────────
  function startClock() {
    if (timerTick) clearInterval(timerTick);
    timerTick = setInterval(() => {
      document.querySelectorAll('.kds-timer').forEach(el => {
        const opened = el.dataset.opened;
        const valEl  = el.querySelector('.kds-timer-val');
        if (valEl && opened) valEl.textContent = elapsed(opened);
      });
      document.getElementById('kds-clock-now') &&
        (document.getElementById('kds-clock-now').textContent = new Date().toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'}));
    }, 1000);
  }

  // ─── Realtime ─────────────────────────────────────────────────────────────
  function subscribeRealtime() {
    const client = sb();
    if (!client) return;
    const st = state();
    if (realtimeSub) { try { client.removeChannel(realtimeSub); } catch(e) {} }

    realtimeSub = client.channel('kds-orders-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pos_orders',
        filter: st && st.branchId ? `branch_id=eq.${st.branchId}` : undefined,
      }, () => reload())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pos_order_items',
      }, () => reload())
      .subscribe();
  }

  // ─── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('kds-styles')) return;
    const s = document.createElement('style');
    s.id = 'kds-styles';
    s.textContent = `
      #kds-root {
        display:flex;flex-direction:column;height:100vh;overflow:hidden;
        background:#0F172A;font-family:'DM Sans',system-ui,sans-serif;color:#F1F5F9;
      }
      /* Header */
      #kds-header {
        display:flex;align-items:center;justify-content:space-between;
        padding:0 20px;height:56px;background:#1E293B;
        border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;
      }
      .kds-brand { display:flex;align-items:center;gap:12px; }
      .kds-brand-icon {
        width:32px;height:32px;border-radius:8px;background:#5B6BFF;
        display:flex;align-items:center;justify-content:center;
      }
      .kds-brand-name { font-size:14px;font-weight:700;color:#F1F5F9; }
      .kds-brand-sub  { font-size:11px;color:#64748B; }
      .kds-head-mid { display:flex;align-items:center;gap:8px; }
      #kds-clock-now { font-size:22px;font-weight:700;font-variant-numeric:tabular-nums; }
      #kds-count-label { font-size:13px;color:#64748B;margin-left:8px; }
      .kds-head-right { display:flex;align-items:center;gap:8px; }
      .kds-icon-btn {
        width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.07);
        border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;
        color:#94A3B8;transition:background .15s;
      }
      .kds-icon-btn:hover { background:rgba(255,255,255,.12); }
      .kds-icon-btn.is-muted { color:#475569; }
      .kds-back-btn {
        height:34px;padding:0 14px;border-radius:8px;background:rgba(255,255,255,.07);
        border:none;cursor:pointer;color:#94A3B8;font-size:13px;font-weight:600;
        display:flex;align-items:center;gap:6px;transition:background .15s;
      }
      .kds-back-btn:hover { background:rgba(255,255,255,.12);color:#F1F5F9; }

      /* Filter bar */
      #kds-filters {
        display:flex;align-items:center;gap:6px;padding:12px 20px;
        background:#1E293B;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;
      }
      .kds-filter {
        padding:5px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.1);
        background:transparent;color:#94A3B8;font-size:12.5px;font-weight:600;
        cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s;
      }
      .kds-filter.is-active {
        background:#5B6BFF;border-color:#5B6BFF;color:#fff;
      }
      .kds-filter-n {
        min-width:18px;height:18px;border-radius:9px;
        background:rgba(255,255,255,.15);font-size:11px;font-weight:700;
        display:inline-flex;align-items:center;justify-content:center;padding:0 4px;
      }

      /* Grid */
      #kds-grid {
        flex:1;overflow-y:auto;padding:16px 20px;
        display:grid;gap:14px;
        grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
        align-content:start;
      }

      /* Cards */
      .kds-card {
        background:#1E293B;border-radius:14px;padding:16px;
        border:1.5px solid rgba(255,255,255,.07);
        display:flex;flex-direction:column;gap:12px;
        transition:border-color .2s;
      }
      .kds-card--warning { border-color:#F59E0B55; }
      .kds-card--critical { border-color:#EF444455;animation:kds-pulse 2s infinite; }
      @keyframes kds-pulse {
        0%,100% { border-color:#EF444455; }
        50%      { border-color:#EF4444AA; }
      }

      .kds-card-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px; }
      .kds-card-id   { display:flex;flex-direction:column;gap:2px; }
      .kds-table-label { font-size:16px;font-weight:700;color:#F1F5F9; }
      .kds-waiter      { font-size:11px;color:#64748B;font-weight:500; }
      .kds-status-chip {
        font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;
        white-space:nowrap;
      }

      .kds-timer {
        display:flex;align-items:center;gap:5px;
        font-size:13px;font-weight:600;color:#94A3B8;
      }
      .kds-timer-val { font-variant-numeric:tabular-nums;font-size:18px;font-weight:700;color:#F1F5F9; }
      .kds-warn-badge {
        font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
        padding:2px 7px;border-radius:4px;background:#F59E0B;color:#fff;
      }
      .kds-card--critical .kds-warn-badge { background:#EF4444; }

      .kds-order-note {
        font-size:12px;color:#F59E0B;font-weight:600;
        background:rgba(245,158,11,.1);border-radius:6px;padding:6px 10px;
      }

      .kds-items { list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px; }
      .kds-item {
        display:flex;align-items:flex-start;gap:8px;padding:7px 10px;
        border-radius:8px;background:rgba(255,255,255,.04);cursor:pointer;
        transition:background .15s;
      }
      .kds-item:hover { background:rgba(255,255,255,.08); }
      .kds-item--done { opacity:.4; }
      .kds-item--done .kds-item-check { background:#22C55E;border-color:#22C55E;color:#fff; }
      .kds-item-check {
        width:20px;height:20px;border-radius:5px;flex-shrink:0;
        border:1.5px solid rgba(255,255,255,.15);
        display:flex;align-items:center;justify-content:center;color:transparent;
        margin-top:1px;
      }
      .kds-item-qty  { font-size:13px;font-weight:700;color:#5B6BFF;min-width:20px; }
      .kds-item-name { font-size:13px;font-weight:600;color:#F1F5F9;flex:1; }
      .kds-item-note { font-size:11px;color:#F59E0B;margin-top:2px; }

      .kds-card-foot {
        display:flex;align-items:center;justify-content:space-between;
        padding-top:8px;border-top:1px solid rgba(255,255,255,.07);
      }
      .kds-btn-ready {
        flex:1;height:38px;border-radius:9px;border:1.5px solid rgba(91,107,255,.4);
        background:rgba(91,107,255,.1);color:#818CF8;font-size:13px;font-weight:700;
        cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;
        transition:all .15s;
      }
      .kds-btn-ready--go {
        background:#22C55E;border-color:#22C55E;color:#fff;
      }
      .kds-btn-ready:hover { background:rgba(91,107,255,.2); }
      .kds-btn-ready--go:hover { background:#16A34A; }
      .kds-served-label {
        display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
        color:#22C55E;
      }
      .kds-guests { font-size:12px;color:#64748B;font-weight:500; }

      /* Empty */
      .kds-empty {
        grid-column:1/-1;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:12px;padding:80px 20px;
      }
      .kds-empty-title { font-size:16px;font-weight:700;color:#475569; }
      .kds-empty-sub   { font-size:13px;color:#334155;text-align:center; }
    `;
    document.head.appendChild(s);
  }

  // ─── Render: Shell ────────────────────────────────────────────────────────
  function renderShell() {
    const app = document.getElementById('pos-app');
    if (!app) return;
    const branchName = (state() && state().branchName) || 'Restaurante';

    app.innerHTML = `
      <div id="kds-root">
        <header id="kds-header">
          <div class="kds-brand">
            <div class="kds-brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <div>
              <div class="kds-brand-name">Pantalla Cocina</div>
              <div class="kds-brand-sub">${branchName}</div>
            </div>
          </div>

          <div class="kds-head-mid">
            <span id="kds-clock-now">--:--</span>
            <span id="kds-count-label">0 pedidos</span>
          </div>

          <div class="kds-head-right">
            <button class="kds-icon-btn ${soundEnabled ? '' : 'is-muted'}" id="kds-sound-btn" title="${soundEnabled ? 'Silenciar' : 'Activar sonido'}" onclick="kdsToggleSound()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <button class="kds-icon-btn" title="Recargar" onclick="kdsReload()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>
            </button>
            <a href="dashboard.html" class="kds-back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Dashboard
            </a>
          </div>
        </header>

        <div id="kds-filters">
          <button class="kds-filter ${filter==='all'?'is-active':''}" onclick="kdsSetFilter('all')">
            Todos <span class="kds-filter-n" id="kds-n-all"></span>
          </button>
          <button class="kds-filter ${filter==='new'?'is-active':''}" onclick="kdsSetFilter('new')">
            Nuevos <span class="kds-filter-n" id="kds-n-new"></span>
          </button>
          <button class="kds-filter ${filter==='cooking'?'is-active':''}" onclick="kdsSetFilter('cooking')">
            En cocina <span class="kds-filter-n" id="kds-n-cooking"></span>
          </button>
          <button class="kds-filter ${filter==='ready'?'is-active':''}" onclick="kdsSetFilter('ready')">
            Listos <span class="kds-filter-n" id="kds-n-ready"></span>
          </button>
        </div>

        <div id="kds-grid">
          <div class="kds-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div class="kds-empty-title">Cargando pedidos...</div>
          </div>
        </div>
      </div>`;
  }

  // ─── Acciones globales ────────────────────────────────────────────────────
  window.kdsSetFilter = (f) => {
    filter = f;
    document.querySelectorAll('.kds-filter').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('onclick').includes(`'${f}'`));
    });
    renderCards();
  };

  window.kdsReload = () => reload();

  window.kdsToggleSound = () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('pos.kds.sound', soundEnabled ? 'true' : 'false'); } catch(e) {}
    const btn = document.getElementById('kds-sound-btn');
    if (btn) btn.classList.toggle('is-muted', !soundEnabled);
  };

  // ─── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    injectCSS();
    renderShell();
    startClock();
    await reload();
    subscribeRealtime();

    // Recargar cada 30s como fallback
    setInterval(() => reload(), 30000);
  }

  // Esperar core:ready si pos-core ya está cargado
  if (window._pos && window._pos.state) {
    init();
  } else {
    window._pos && window._pos.on
      ? window._pos.on('core:ready', init)
      : document.addEventListener('pos:ready', init);
  }

})();
