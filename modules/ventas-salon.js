// =======================================================
// ventas-salon.js — Módulo: Ventas > Por Salón
// Responsabilidad: Vista de mesas por salón, selección
//   de mesa, detalle de pedido en curso.
// Usa: window._pos.sb (Supabase), window._pos.state
// =======================================================

(function () {
  'use strict';

  // ─── Constantes de estado de mesa ───────────────────
  const STATE_META = {
    libre:          { label: 'Mesa libre',        short: 'Libres',    color: '#94A3B8', tint: '#F8FAFC', ring: '#ECEEF2', hint: 'disponibles',        icon: SVG_PLUS },
    pendiente_pago: { label: 'Pendiente de pago', short: 'Pendiente', color: '#EF4444', tint: '#FEF2F2', ring: '#FECACA', hint: 'esperando cobro',     icon: SVG_DOLLAR },
    esperando:      { label: 'Esperando pedido',  short: 'Esperando', color: '#F97316', tint: '#FFF7ED', ring: '#FED7AA', hint: 'pedido en cocina',    icon: SVG_CLOCK },
    comiendo:       { label: 'Comiendo',          short: 'Comiendo',  color: '#5B6BFF', tint: '#EEF2FF', ring: '#C7D2FE', hint: 'servidas en mesa',    icon: SVG_FOOD },
  };

  const CHIP_ORDER_KEY = 'lumen.ventas.chipOrder';
  const CONFIG_KEY = 'lumen.config.salon.v1';
  const COBRO_KEY = 'lumen.config.cobro_adelantado';
  const DEFAULT_CHIP_ORDER = ['libre', 'pendiente_pago', 'esperando', 'comiendo'];

  const MESERO_NAMES = { SA: 'Sergio Andrés', JM: 'Juan Manuel', AC: 'Andrea Castro', LM: 'Laura Mejía' };

  // ─── Estado del módulo ───────────────────────────────
  let state = {
    floor: null,
    zones: [],
    selectedTableId: null,
    tables: [],
    orderItems: [],
    loading: true,
    chipOrder: loadChipOrder(),
    dragKey: null,
    cobroAdelantado: false,
    userRole: 'mesero',
    currentOrder: null,
  };

  let container = null;
  let realtimeSub = null;

  // ─── Helpers ─────────────────────────────────────────
  function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function loadChipOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHIP_ORDER_KEY) || 'null');
      if (Array.isArray(saved) && saved.length === DEFAULT_CHIP_ORDER.length &&
          DEFAULT_CHIP_ORDER.every(k => saved.includes(k))) return saved;
    } catch (e) { /* ignore */ }
    return [...DEFAULT_CHIP_ORDER];
  }

  function saveChipOrder() {
    try { localStorage.setItem(CHIP_ORDER_KEY, JSON.stringify(state.chipOrder)); } catch (e) { /* ignore */ }
  }

  // ─── SVG helpers ─────────────────────────────────────
  function SVG_PLUS(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  }
  function SVG_CLOCK(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  }
  function SVG_FOOD(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M5 2v20"/><path d="M19 2v20"/><path d="M19 11c1.66 0 3-2 3-5s-1.34-4-3-4"/></svg>`;
  }
  function SVG_CHECK(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  }
  function SVG_CHEVRON(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  }
  function SVG_SEARCH(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  }
  function SVG_GRIP() {
    return `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>`;
  }
  function SVG_PAX(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  function SVG_DOTS(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
  }
  function SVG_DOLLAR(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  }
  function SVG_OK(size, sw) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="${sw||2.4}" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  }

  function loadZonesFromConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (c.zones && c.zones.length) return c.zones;
      }
    } catch(e) {}
    return [{ id: 'z_adentro', name: 'Adentro' }];
  }

  // ─── Supabase — fetch data ────────────────────────────

  // Devuelve mesas del config localStorage enriquecidas con estado live de Supabase
  async function fetchTables() {
    // 1. Base: mesas configuradas en localStorage
    const localConfig = (function() {
      try {
        var raw = localStorage.getItem(CONFIG_KEY);
        if (raw) { var c = JSON.parse(raw); if (c.tables) return c; }
      } catch(e) {}
      return { zones: [], tables: [] };
    })();

    const baseTables = localConfig.tables.map(function(t, i) {
      return {
        id: t.id,
        name: t.name,
        number: parseInt(t.name, 10) || (i + 1),
        seats: t.seats,
        zone_id: t.zoneId,
        status: 'libre',
        total: 0,
        items_count: 0,
        minutes: 0,
        mesero_initials: '',
        persons: 0,
      };
    });

    if (!baseTables.length) return [];

    // 2. Enriquecer con estado de pos_tables y datos reales de pos_orders
    try {
      const sb = window._pos && window._pos.sb;
      if (sb) {
        const ids = baseTables.map(function(t){ return t.id; });
        const { data: tablesData } = await sb.from('pos_tables').select('id, status, current_order_id').in('id', ids);
        const tableMap = {};
        (tablesData || []).forEach(function(r){ tableMap[r.id] = r; });
        const { data: ordersData } = await sb
          .from('pos_orders')
          .select('id, table_id, total, guests, waiter_name, opened_at, created_at')
          .in('table_id', ids)
          .not('status', 'eq', 'completed')
          .not('status', 'eq', 'cancelled');
        const orderMap = {};
        (ordersData || []).forEach(function(o){ orderMap[o.table_id] = o; });
        return baseTables.map(function(t) {
          const live = tableMap[t.id];
          const ord  = orderMap[t.id];
          const now  = Date.now();
          const openedAt = ord?.opened_at || ord?.created_at;
          const minutes = openedAt ? Math.round((now - new Date(openedAt).getTime()) / 60000) : 0;
          const initials = ord?.waiter_name
            ? ord.waiter_name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2)
            : '';
          return Object.assign({}, t, {
            status:          live?.status || t.status,
            total:           ord?.total   || 0,
            items_count:     0,
            minutes:         minutes,
            mesero_initials: initials,
            persons:         ord?.guests  || 0,
          });
        });
      }
    } catch(e) {
      console.warn('[ventas-salon] Supabase enrichment failed:', e.message || e);
    }

    return baseTables;
  }

  async function fetchOrderData(tableId) {
    const sb = window._pos && window._pos.sb;
    if (!sb || !tableId) return { order: null, items: [] };

    const { data: orders, error: ordErr } = await sb
      .from('pos_orders')
      .select('id, status, total, created_at, opened_at, waiter_name, guests')
      .eq('table_id', tableId)
      .not('status', 'eq', 'completed')
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);

    if (ordErr || !orders || !orders.length) return { order: null, items: [] };

    const order = orders[0];
    const { data: items, error: itemErr } = await sb
      .from('pos_order_items')
      .select('id, quantity, product_name, name, product_price, unit_price, notes, product_id, pos_products(category_id, pos_categories(name))')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    if (itemErr) { console.error('[ventas-salon] fetchOrderData:', itemErr); }
    return { order, items: items || [] };
  }

  // ─── Realtime subscription ───────────────────────────
  function subscribeRealtime() {
    const sb = window._pos && window._pos.sb;
    if (!sb) return;

    realtimeSub = sb
      .channel('ventas-salon-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_tables' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_orders' }, () => {
        loadData();
      })
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (realtimeSub) {
      const sb = window._pos && window._pos.sb;
      if (sb) sb.removeChannel(realtimeSub);
      realtimeSub = null;
    }
  }

  // ─── Data loading ─────────────────────────────────────
  async function loadData() {
    state.tables = await fetchTables();

    if (state.selectedTableId) {
      state.orderItems = await fetchOrderItems(state.selectedTableId);
    }

    state.loading = false;
    if (state.selectedTableId) {
      const { order, items } = await fetchOrderData(state.selectedTableId);
      state.currentOrder = order;
      state.orderItems   = items;
    }
    render();
  }

  async function selectTable(tableId) {
    state.selectedTableId = tableId;
    const { order, items } = await fetchOrderData(tableId);
    state.currentOrder = order;
    state.orderItems = items;
    renderRail();
    renderGrid(); // update selected highlight
  }

  // ─── Computed helpers ────────────────────────────────
  function countsByState() {
    return state.tables.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});
  }

  function totalEnCurso() {
    return state.tables
      .filter(t => t.total && t.status !== 'libre')
      .reduce((a, t) => a + (t.total || 0), 0);
  }

  function totalItems() {
    return state.tables
      .filter(t => t.status !== 'libre')
      .reduce((a, t) => a + (t.items_count || 0), 0);
  }

  function avgTime() {
    const occupied = state.tables.filter(t => t.status !== 'libre' && t.minutes);
    if (!occupied.length) return 0;
    return Math.round(occupied.reduce((a, t) => a + t.minutes, 0) / occupied.length);
  }

  function getMeseroName(initials) {
    return MESERO_NAMES[initials] || initials || '—';
  }

  function getSelectedTable() {
    return state.tables.find(t => t.id === state.selectedTableId) || null;
  }

  // ─── Render: Full page ───────────────────────────────
  function render() {
    if (!container) return;

    // Get user info from _pos state
    const user = (window._pos && window._pos.state && window._pos.state.user) || {};
    const branch = (window._pos && window._pos.state && window._pos.state.branch) || {};

    container.innerHTML = `
      <div class="vs-root">
        ${renderSidebar(user, branch)}
        <main class="vs-main">
          ${renderTopbar(user)}
          ${renderPageHead()}
          ${renderSummaryRow()}
          <section class="vs-body">
            <div class="vs-body-left">
              ${renderSalonTabs()}
              ${renderGrid()}
            </div>
            <aside class="vs-rail" id="vs-rail">
              ${renderRailContent()}
            </aside>
          </section>
        </main>
      </div>
    `;

    attachEvents();
  }

  // ─── Render: Sidebar ─────────────────────────────────
  function renderSidebar(user, branch) {
    const initials = user.initials || (user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'SA');
    return `
      <aside class="vs-sidebar">
        <div class="vs-brand-mark">
          <div class="vs-brand-logo">L</div>
          <div>
            <div class="vs-brand-name">Lumen POS</div>
            <div class="vs-brand-sub">${branch.name || 'El Parche Food'} · Caja 01</div>
          </div>
        </div>

        <div class="vs-sidebar-section-label">Ventas</div>

        <nav class="vs-nav">
          <button class="lm-nav" data-action="nav-back" style="color:#475569">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span style="font-weight:500">Regresar</span>
            </span>
          </button>
          <div class="vs-nav-divider"></div>
          <button class="lm-nav" style="background:#EEF2FF;color:#5B6BFF">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span style="font-weight:700">Por salón</span>
            </span>
          </button>
          <button class="lm-nav" style="color:#475569" data-action="nav-rapida">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style="font-weight:500">Venta rápida</span>
            </span>
          </button>
          <button class="lm-nav" style="color:#475569" data-action="nav-domicilio">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M2 17h2l1-7h12l4 7h2"/></svg>
              <span style="font-weight:500">Domicilio express</span>
            </span>
          </button>
          <button class="lm-nav" style="color:#475569" data-action="nav-manual">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v9"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
              <span style="font-weight:500">Venta manual</span>
            </span>
          </button>
          <button class="lm-nav" style="color:#475569" data-action="nav-entregados">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span style="font-weight:500">Entregados</span>
            </span>
            <span class="lm-nav-badge" id="vs-badge-entregados">—</span>
          </button>
        </nav>

        <div class="vs-sidebar-spacer"></div>

        <div class="vs-sidebar-footer">
          <button class="lm-nav" style="color:#DC2626;background:#FEF2F2" data-action="anular">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span style="font-weight:500">Anular venta</span>
            </span>
          </button>
          <div class="vs-fx-chip">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="vs-fx-icon">${SVG_DOLLAR(14)}</div>
              <div>
                <div class="vs-fx-pair">EUR/COP</div>
                <div class="vs-fx-change" id="vs-fx-rate">—</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    `;
  }

  // ─── Render: Topbar ──────────────────────────────────
  function renderTopbar(user) {
    const name = user.name || 'Usuario';
    const initials = user.initials || (name ? name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '??');
    const role = user.role_label || 'Mesero';

    return `
      <header class="vs-topbar">
        <div class="vs-topbar-left">
          <div class="vs-mode-badge">
            <span class="vs-mode-dot"></span>
            Modo Servidor
          </div>
          <div class="vs-crumbs">
            <span class="vs-crumb-parent">Ventas</span>
            ${SVG_CHEVRON(10).replace('stroke="currentColor"','stroke="#CBD5E1"')}
            <span class="vs-crumb-current">Por salón</span>
          </div>
        </div>
        <div class="vs-topbar-right">
          <div class="vs-pill-success">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Actualizado
          </div>
          <button class="lm-icon" title="Ayuda">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button class="lm-icon" title="Cocina">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
          </button>
          <button class="lm-icon" title="Caja">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M18 12h.01"/></svg>
          </button>
          <div class="vs-ram-chip" id="vs-ram">RAM —</div>
          <div class="vs-user-info">
            <div class="lm-avatar lm-avatar-sm">${initials}</div>
            <div>
              <div class="vs-user-name">${name}</div>
              <div class="vs-user-role">${role}</div>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  // ─── Render: Page header ──────────────────────────────
  function renderPageHead() {
    const now = new Date();
    const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const eyebrow = `Servicio en curso · ${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} · ${formatTime(now)}`;

    return `
      <section class="vs-page-head">
        <div>
          <div class="vs-eyebrow">${eyebrow}</div>
          <h1 class="vs-page-title">Por salón</h1>
        </div>
        <div class="vs-page-head-right">
          <div class="vs-search-box">
            ${SVG_SEARCH(14)}
            <input id="vs-search" placeholder="Buscar mesa, mesero o cuenta…" />
            <span class="vs-kbd">⌘ K</span>
          </div>
          <button class="lm-btn-ghost" id="vs-btn-lista">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Vista lista
          </button>
          <button class="lm-btn-primary" id="vs-btn-open-table">
            ${SVG_PLUS(14)}
            Abrir mesa
          </button>
          <button class="vs-cobro-toggle ${state.cobroAdelantado ? 'vs-cobro-on' : ''}"
            id="vs-cobro-toggle"
            title="${state.cobroAdelantado ? 'Cobro adelantado activo' : 'Cobro al final activo'}">
            <span class="vs-cobro-dot"></span>
            <span class="vs-cobro-label">${state.cobroAdelantado ? 'Cobro adelantado' : 'Cobro al final'}</span>
          </button>
        </div>
      </section>
    `;
  }

  function formatTime(d) {
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  // ─── Render: Summary row (chips + metrics) ────────────
  function renderSummaryRow() {
    const counts = countsByState();
    const total = state.tables.length;
    const enCurso = totalEnCurso();
    const items = totalItems();
    const tProm = avgTime();

    const chipsHtml = state.chipOrder.map(key => {
      const meta = STATE_META[key];
      const count = counts[key] || 0;
      return `
        <div class="lm-chip" data-chip-key="${key}"
          draggable="true"
          style="border-left: 3px solid ${meta.color}"
          data-drag-key="${key}">
          <span class="lm-grip" title="Arrastra para reordenar">${SVG_GRIP()}</span>
          <span class="lm-chip-icon" style="color:${meta.color};background:${meta.tint}">
            ${meta.icon(15)}
          </span>
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:baseline;gap:6px">
              <span class="lm-chip-count">${count}</span>
              <span class="lm-chip-label">${meta.short}</span>
            </div>
            <div class="lm-chip-hint">${meta.hint}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="vs-summary-row">
        <div class="vs-chips-track" id="vs-chips-track">
          ${chipsHtml}
        </div>
        <div class="vs-metric-strip">
          <div class="vs-metric-cell">
            <div class="vs-metric-label">Ventas en curso</div>
            <div class="vs-metric-value">${state.loading ? '—' : fmt(enCurso)}</div>
            <div class="vs-metric-hint">${state.loading ? '…' : items + ' ítems activos'}</div>
          </div>
          <div class="vs-metric-divider"></div>
          <div class="vs-metric-cell">
            <div class="vs-metric-label">Tiempo promedio</div>
            <div class="vs-metric-value">${state.loading ? '—' : tProm + ' min'}</div>
            <div class="vs-metric-hint">atención por mesa</div>
          </div>
        </div>
      </section>
    `;
  }

  // ─── Render: Salon tabs ───────────────────────────────
  function renderSalonTabs() {
    const zones = state.zones.length ? state.zones : loadZonesFromConfig();

    const tabsHtml = zones.map(z => {
      const count = state.tables.filter(t => t.zone_id === z.id).length;
      return `
        <button class="lm-tab ${state.floor === z.id ? 'is-active' : ''}" data-floor="${z.id}">
          ${z.name}
          <span class="vs-tab-count">${count}</span>
        </button>
      `;
    }).join('');

    const legendHtml = Object.entries(STATE_META).map(([k, m]) => `
      <span class="vs-legend-item">
        <span class="vs-legend-dot" style="background:${m.color}"></span>
        ${m.label}
      </span>
    `).join('');

    return `
      <div class="vs-salon-tabs" id="vs-salon-tabs">
        <div class="vs-tabs-group">${tabsHtml}</div>
        <div class="vs-legend">${legendHtml}</div>
      </div>
    `;
  }

  // ─── Render: Mesa grid ────────────────────────────────
  function renderGrid() {
    if (state.loading) {
      return `<div class="vs-grid"><div class="vs-loading">Cargando mesas…</div></div>`;
    }

    // Filtrar por zona activa
    const visible = state.floor
      ? state.tables.filter(t => t.zone_id === state.floor)
      : state.tables;

    if (!visible.length) {
      return `
        <div class="vs-grid">
          <div class="vs-empty-grid">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>No hay mesas en esta zona</span>
          </div>
        </div>
      `;
    }

    const cards = visible.map(t => renderMesaCard(t)).join('');
    return `<div class="vs-grid" id="vs-grid" style="grid-auto-rows:160px;align-content:start">${cards}</div>`;
  }

  function renderMesaCard(t) {
    const meta = STATE_META[t.status] || STATE_META.libre;
    const isLibre = t.status === 'libre';
    const isSelected = t.id === state.selectedTableId;
    const numStr = t.name || pad2(t.number || t.n || 0);

    const bgColor = isLibre ? '#fff' : meta.tint;
    const borderColor = isSelected ? meta.color : (isLibre ? '#ECEEF2' : meta.ring);
    const boxShadow = isSelected ? `0 0 0 3px ${meta.color}33` : 'none';
    const selectedStyle = `background:${bgColor};border-color:${borderColor};box-shadow:${boxShadow}`;

    const footerHtml = isLibre
      ? `<div class="vs-mesa-footer-libre">Disponible · Toca para abrir</div>`
      : `<div class="vs-mesa-footer-active">
          <div class="vs-mesa-footer-left">
            <div class="lm-avatar lm-avatar-xs">${t.mesero_initials || '?'}</div>
            <span class="vs-mesa-items">${t.items_count || 0} ítems</span>
          </div>
          <div class="vs-mesa-total">${fmt(t.total)}</div>
        </div>`;

    const paxHtml = !isLibre
      ? `<div class="vs-mesa-pax">${SVG_PAX(11)} ${t.persons || 0}</div>`
      : '';

    return `
      <button class="lm-mesa" data-table-id="${t.id}" style="${selectedStyle};height:160px;max-height:160px;min-height:0;overflow:hidden">
        <div class="vs-mesa-header">
          <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
            <span class="vs-state-dot" style="background:${meta.color}"></span>
            ${meta.label}
          </span>
          ${!isLibre ? `<span class="vs-time-badge">${SVG_CLOCK(10)} ${t.minutes || 0} min</span>` : ''}
        </div>
        <div class="vs-mesa-num-row">
          <div class="vs-mesa-num ${isLibre ? 'vs-mesa-num--libre' : 'vs-mesa-num--active'}">${numStr}</div>
          ${paxHtml}
        </div>
        <div class="vs-mesa-footer">${footerHtml}</div>
      </button>
    `;
  }

  // ─── Render: Rail ─────────────────────────────────────
  function renderRail() {
    const el = document.getElementById('vs-rail');
    if (!el) return;
    el.innerHTML = renderRailContent();
    attachRailEvents();
  }

  function renderRailContent() {
    const mesa = getSelectedTable();
    if (!mesa) return renderRailEmpty();
    return renderRailDetail(mesa);
  }

  function renderRailEmpty() {
    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Mesa seleccionada</div>
          <div class="vs-rail-title-row">
            <h2 class="vs-rail-title">—</h2>
          </div>
        </div>
      </div>
      <div class="vs-empty-rail">
        <div class="vs-empty-icon">${SVG_PLUS(22)}</div>
        <div class="vs-empty-title">Selecciona una mesa</div>
        <p class="vs-empty-desc">Elige una mesa del plano para ver su estado, comanda y acciones disponibles.</p>
      </div>
    `;
  }

  function renderRailDetail(mesa) {
    const meta = STATE_META[mesa.status] || STATE_META.libre;
    const isLibre = mesa.status === 'libre';
    const isPendientePago = mesa.status === 'pendiente_pago';
    const numStr = pad2(mesa.number || mesa.n || 0);

    if (isLibre) {
      return `
        <div class="vs-rail-head">
          <div>
            <div class="vs-eyebrow">Mesa seleccionada</div>
            <div class="vs-rail-title-row">
              <h2 class="vs-rail-title">Mesa ${numStr}</h2>
              <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
                <span class="vs-state-dot" style="background:${meta.color}"></span>${meta.label}
              </span>
            </div>
          </div>
          <button class="lm-icon-sm">${SVG_DOTS(14)}</button>
        </div>
        <div class="vs-empty-rail">
          <div class="vs-empty-icon">${SVG_PLUS(22)}</div>
          <div class="vs-empty-title">Mesa libre</div>
          <p class="vs-empty-desc">Abre la mesa para empezar una cuenta nueva o reservarla para más tarde.</p>
          <div class="vs-empty-btn-row">
            <button class="lm-btn-primary" style="width:100%" data-action="open-table" data-table-id="${mesa.id}">Abrir mesa ${numStr}</button>
            <button class="lm-btn-ghost" style="width:100%" data-action="reserve-table" data-table-id="${mesa.id}">Reservar mesa</button>
          </div>
        </div>
      `;
    }

    const ord = state.currentOrder;
    const subtotal = ord?.total || mesa.total || 0;
    const servicio = Math.round(subtotal * 0.10);
    const total = subtotal + servicio;
    const waiterName = ord?.waiter_name || '—';
    const waiterInitials = waiterName !== '—'
      ? waiterName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)
      : '?';
    const guests = ord?.guests || mesa.persons || 0;
    const itemsCount = state.orderItems.length || mesa.items_count || 0;

    // Calcular minutos transcurridos
    const openedAt = ord?.opened_at || ord?.created_at || mesa.openedAt;
    const minutesElapsed = openedAt
      ? Math.round((Date.now() - new Date(openedAt).getTime()) / 60000)
      : (mesa.minutes || 0);

    const itemsHtml = state.orderItems.length
      ? state.orderItems.map(it => {
          const itemName = it.product_name || it.name || '—';
          const itemPrice = it.product_price || it.unit_price || 0;
          const categoryName = it.pos_products?.pos_categories?.name || '';
        return `
          <div class="vs-order-item">
            <span class="vs-order-qty">${it.quantity}×</span>
            <div class="vs-order-item-info">
              <div class="vs-order-item-name">${itemName}</div>
              ${categoryName ? `<div class="vs-order-item-area">${categoryName}</div>` : (it.notes ? `<div class="vs-order-item-area">${it.notes}</div>` : '')}
            </div>
            <div class="vs-order-item-price">${fmt(itemPrice * it.quantity)}</div>
          </div>`;
        }).join('')
      : `<div style="font-size:12px;color:#94A3B8;padding:16px 0;text-align:center">Sin ítems registrados</div>`;

    const actionsHtml = isPendientePago
      ? `<div class="vs-pending-notice">
           ${SVG_DOLLAR(14)} <span>Esperando cobro — pedido en preparación</span>
         </div>
         <div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-primary vs-cobrar-btn" data-action="cobrar" data-table-id="${mesa.id}">
             ${SVG_DOLLAR(14)} Cobrar y enviar a cocina
           </button>
         </div>`
      : mesa.status === 'comiendo'
      ? `<div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
           <button class="lm-btn-primary" data-action="collect" data-table-id="${mesa.id}">Cobrar</button>
         </div>`
      : `<div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
           <button class="lm-btn-primary" data-action="collect" data-table-id="${mesa.id}">Cobrar</button>
         </div>`;

    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Mesa seleccionada</div>
          <div class="vs-rail-title-row">
            <h2 class="vs-rail-title">Mesa ${numStr}</h2>
            <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
              <span class="vs-state-dot" style="background:${meta.color}"></span>${meta.label}
            </span>
          </div>
        </div>
        <button class="lm-icon-sm">${SVG_DOTS(14)}</button>
      </div>

      <div class="vs-rail-fixed-top">
        <div class="vs-info-row">
          <div class="vs-info-cell">
            <div class="vs-info-label">Personas</div>
            <div class="vs-info-value">${mesa.persons || '—'}</div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Tiempo</div>
            <div class="vs-info-value ${(mesa.minutes || 0) > 60 ? 'vs-info-value--alert' : ''}">${mesa.minutes || 0} min</div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Ítems</div>
            <div class="vs-info-value">${mesa.items_count || state.orderItems.length || '—'}</div>
          </div>
        </div>
        <div class="vs-mesero-row">
          <div class="lm-avatar lm-avatar-md">${mesa.mesero_initials || '?'}</div>
          <div class="vs-mesero-spacer">
            <div class="vs-mesero-label">Mesero asignado</div>
            <div class="vs-mesero-name">${getMeseroName(mesa.mesero_initials)}</div>
          </div>
          <button class="lm-btn-ghost-sm" data-action="reassign" data-table-id="${mesa.id}">Reasignar</button>
        </div>
      </div>

      <div class="vs-rail-scroll">
        <div class="vs-order-head">
          <div class="vs-order-section-label">Comanda</div>
          <button class="lm-link" data-action="add-item" data-table-id="${mesa.id}">+ Agregar ítem</button>
        </div>
        <div class="vs-order-list">${itemsHtml}</div>
      </div>

      <div class="vs-rail-footer">
        <div class="vs-totals">
          <div class="vs-total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
          <div class="vs-total-row"><span>Servicio 10%</span><span>${fmt(servicio)}</span></div>
          <div class="vs-total-row vs-total-grand"><span>Total</span><span>${fmt(total)}</span></div>
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  // ─── Events ───────────────────────────────────────────
  function attachEvents() {
    if (!container) return;

    // Toggle cobro adelantado
    const cobroToggle = document.getElementById('vs-cobro-toggle');
    if (cobroToggle) cobroToggle.addEventListener('click', toggleCobro);

    // Mesa cards
    container.querySelectorAll('[data-table-id]').forEach(btn => {
      if (btn.classList.contains('lm-mesa')) {
        btn.addEventListener('click', () => {
          selectTable(btn.dataset.tableId);
        });
      }
    });

    // Floor tabs
    container.querySelectorAll('[data-floor]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.floor = btn.dataset.floor;
        state.selectedTableId = null;
        render();
      });
    });

    // Chip drag-to-reorder
    attachChipDragEvents();

    // Rail events
    attachRailEvents();
  }

  function attachRailEvents() {
    if (!container) return;
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleAction);
    });
  }

  function handleAction(e) {
    const action = e.currentTarget.dataset.action;
    const tableId = e.currentTarget.dataset.tableId;

    switch (action) {
      case 'open-table':
        window._pos && window._pos.emit && window._pos.emit('table:open', { tableId });
        break;
      case 'reserve-table':
        window._pos && window._pos.emit && window._pos.emit('table:reserve', { tableId });
        break;
      case 'cobrar':
        cobrarMesa(tableId);
        break;
      case 'collect':
        window._pos && window._pos.emit && window._pos.emit('table:collect', { tableId });
        break;
      case 'free-table':
        window._pos && window._pos.emit && window._pos.emit('table:free', { tableId });
        break;
      case 'print':
        window._pos && window._pos.emit && window._pos.emit('table:print', { tableId });
        break;
      case 'split':
        window._pos && window._pos.emit && window._pos.emit('table:split', { tableId });
        break;
      case 'add-item':
        window._pos && window._pos.emit && window._pos.emit('table:addItem', { tableId });
        break;
      case 'reassign':
        window._pos && window._pos.emit && window._pos.emit('table:reassign', { tableId });
        break;
      case 'nav-back':
        window._pos && window._pos.emit && window._pos.emit('nav:back');
        break;
      case 'nav-domicilio':
        window.location.href = 'domicilios.html';
        break;
      default:
        break;
    }
  }

  // ─── Chip drag-to-reorder ─────────────────────────────
  function attachChipDragEvents() {
    const track = document.getElementById('vs-chips-track');
    if (!track) return;

    let dragKey = null;

    track.querySelectorAll('[data-chip-key]').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        dragKey = chip.dataset.chipKey;
        e.dataTransfer.effectAllowed = 'move';
        chip.style.opacity = '0.4';
      });
      chip.addEventListener('dragend', () => {
        dragKey = null;
        chip.style.opacity = '';
        track.querySelectorAll('[data-chip-key]').forEach(c => {
          c.style.boxShadow = '';
          c.style.borderColor = '';
        });
      });
      chip.addEventListener('dragover', e => {
        e.preventDefault();
        if (dragKey && dragKey !== chip.dataset.chipKey) {
          const meta = STATE_META[chip.dataset.chipKey];
          chip.style.boxShadow = `0 0 0 3px ${meta.color}22`;
        }
      });
      chip.addEventListener('dragleave', () => {
        chip.style.boxShadow = '';
      });
      chip.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragKey || dragKey === chip.dataset.chipKey) return;
        const from = dragKey;
        const to = chip.dataset.chipKey;
        const next = state.chipOrder.filter(k => k !== from);
        const idx = next.indexOf(to);
        next.splice(idx, 0, from);
        state.chipOrder = next;
        saveChipOrder();
        // Re-render only the chips section
        const summaryRow = container.querySelector('.vs-summary-row');
        if (summaryRow) summaryRow.outerHTML = renderSummaryRow();
        // Re-attach chip events
        attachChipDragEvents();
      });
    });
  }

  // ─── Cobro adelantado ────────────────────────────────
  async function loadCobroAdelantado() {
    // 1. localStorage primero (respuesta inmediata)
    state.cobroAdelantado = localStorage.getItem(COBRO_KEY) === 'true';
    // 2. Sincronizar con Supabase (fuente de verdad)
    try {
      const sb = window._pos && window._pos.sb;
      const branchId = window._pos && window._pos.state && window._pos.state.branchId;
      if (sb && branchId) {
        const { data } = await sb.from('branches').select('cobro_adelantado').eq('id', branchId).maybeSingle();
        if (data) {
          state.cobroAdelantado = !!data.cobro_adelantado;
          localStorage.setItem(COBRO_KEY, String(state.cobroAdelantado));
        }
      }
    } catch(e) { /* usa el valor de localStorage */ }
  }

  async function toggleCobro() {
    const sb = window._pos && window._pos.sb;
    const role = (window._pos && window._pos.state && window._pos.state.role) || 'mesero';
    // Si no es admin, pedir PIN (flujo de PIN deferred — por ahora solo admins)
    if (role !== 'admin' && role !== 'administrador' && role !== 'gerente') {
      alert('Solo el administrador puede cambiar el modo de cobro.');
      return;
    }
    const nuevoValor = !state.cobroAdelantado;
    state.cobroAdelantado = nuevoValor;
    localStorage.setItem(COBRO_KEY, String(nuevoValor));
    // Persistir en Supabase
    try {
      const branchId = window._pos && window._pos.state && window._pos.state.branchId;
      if (sb && branchId) {
        await sb.from('branches').update({ cobro_adelantado: nuevoValor }).eq('id', branchId);
      }
    } catch(e) { /* ignore */ }
    // Re-render header para reflejar cambio de toggle
    const pageHead = container && container.querySelector('.vs-page-head');
    if (pageHead) {
      pageHead.outerHTML = renderPageHead();
      // Re-attach toggle event
      const btn = container.getElementById ? container.getElementById('vs-cobro-toggle') : document.getElementById('vs-cobro-toggle');
      if (btn) btn.addEventListener('click', toggleCobro);
    }
  }

  async function cobrarMesa(tableId) {
    const sb = window._pos && window._pos.sb;
    if (!sb) return;
    try {
      // Marcar mesa como esperando (cocina puede verlo)
      await sb.from('pos_tables').update({ status: 'esperando' }).eq('id', tableId);
      // Hacer visible en cocina el pedido activo de esta mesa
      await sb.from('pos_orders')
        .update({ visible_cocina: true })
        .eq('table_id', tableId)
        .eq('status', 'in_progress');
      // Actualizar local y re-render
      const t = state.tables.find(t => t.id === tableId);
      if (t) t.status = 'esperando';
      selectTable(tableId);
      render();
    } catch(e) {
      alert('Error al cobrar: ' + (e.message || e));
    }
  }

  // ─── RAM chip (live) ──────────────────────────────────
  function startRamMonitor() {
    function update() {
      const el = document.getElementById('vs-ram');
      if (!el) return;
      if (performance && performance.memory) {
        const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
        el.innerHTML = `RAM <strong style="color:#0F172A;font-variant-numeric:tabular-nums;margin-left:4px">${mb} mb</strong>`;
      }
    }
    update();
    setInterval(update, 5000);
  }

  // ─── Init ─────────────────────────────────────────────
  async function init(mountContainer) {
    container = mountContainer;

    // Inject stylesheet if not already present
    if (!document.getElementById('vs-styles')) {
      const link = document.createElement('link');
      link.id = 'vs-styles';
      link.rel = 'stylesheet';
      link.href = 'styles/modules/ventas-salon.css';
      document.head.appendChild(link);
    }

    // Cargar zonas desde localStorage de configuracion
    state.zones = loadZonesFromConfig();
    state.floor = state.zones.length ? state.zones[0].id : null;

    // Cargar modo cobro
    await loadCobroAdelantado();

    // Initial render (loading state)
    render();

    // Start RAM monitor
    startRamMonitor();

    // Load data from Supabase
    await loadData();

    // Subscribe to realtime updates
    subscribeRealtime();
  }

  // ─── Destroy ──────────────────────────────────────────
  function destroy() {
    unsubscribeRealtime();
    if (container) container.innerHTML = '';
    container = null;
  }

  // ─── Export ───────────────────────────────────────────
  window._pos = window._pos || {};
  window._pos.modules = window._pos.modules || {};
  window._pos.modules.ventasSalon = { init, destroy };

})();
