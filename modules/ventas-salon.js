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


  // ─── Constantes de estado de domicilio ──────────────
  const DELIVERY_META = {
    preparacion: { label: 'En preparación', color: '#F97316', tint: '#FFF7ED', ring: '#FED7AA' },
    camino:      { label: 'En camino',      color: '#3B82F6', tint: '#EFF6FF', ring: '#BFDBFE' },
    entregado:   { label: 'Entregado',      color: '#22C55E', tint: '#F0FDF4', ring: '#BBF7D0' },
  };

  const QUICK_STATE_META = {
    in_progress:    { label: 'En preparación',    short: 'Preparando', color: '#F97316', tint: '#FFF7ED', ring: '#FED7AA' },
    esperando:      { label: 'En preparación',    short: 'Preparando', color: '#F97316', tint: '#FFF7ED', ring: '#FED7AA' },
    pendiente_pago: { label: 'Pendiente de pago', short: 'Pendiente',  color: '#EF4444', tint: '#FEF2F2', ring: '#FECACA' },
    paid:           { label: 'Cobrado',            short: 'Cobrado',   color: '#22C55E', tint: '#F0FDF4', ring: '#BBF7D0' },
    entregado:      { label: 'Entregado',          short: 'Entregado', color: '#94A3B8', tint: '#F8FAFC', ring: '#ECEEF2' },
  };
  // Orden de display y claves canónicas del legend
  const QUICK_LEGEND_KEYS = ['pendiente_pago', 'paid', 'in_progress', 'entregado'];

  const CANAL_META = {
    whatsapp: { label: 'WhatsApp', color: '#22C55E', bg: '#DCFCE7' },
    instagram: { label: 'Instagram', color: '#E1306C', bg: '#FCE7F3' },
    web:      { label: 'Página web', color: '#3B82F6', bg: '#DBEAFE' },
    facebook: { label: 'Facebook', color: '#1877F2', bg: '#DBEAFE' },
    tiktok:   { label: 'TikTok', color: '#0F172A', bg: '#F1F5F9' },
    telefono: { label: 'Teléfono', color: '#64748B', bg: '#F1F5F9' },
  };



  const DELIVERY_NEXT = { preparacion: 'camino', camino: 'entregado' };
  const DELIVERY_BTN  = { preparacion: 'En camino', camino: 'Entregado' };

  const CHIP_ORDER_KEY = 'pos.ventas.chipOrder';
  const CONFIG_KEY = 'pos.config.salon.v1';
  const COBRO_KEY = 'pos.config.cobro_adelantado';
  const CURRENCY_KEY = 'pos.ventas.currency';

  // ─── Multi-currency state ────────────────────────────
  var activeCurrency = (function() {
    try { return localStorage.getItem(CURRENCY_KEY) || 'COP'; } catch(e) { return 'COP'; }
  })();
  var fxRates = {};
  var fxTimestamp = 0;

  var CURRENCIES = [
    { code: 'COP', name: 'Peso colombiano', symbol: '$', flag: '🇨🇴' },
    { code: 'USD', name: 'Dólar americano',  symbol: 'US$', flag: '🇺🇸' },
    { code: 'EUR', name: 'Euro',             symbol: '€',   flag: '🇪🇺' },
    { code: 'GBP', name: 'Libra esterlina',  symbol: '£',   flag: '🇬🇧' },
    { code: 'MXN', name: 'Peso mexicano',    symbol: '$',   flag: '🇲🇽' },
    { code: 'BRL', name: 'Real brasileño',   symbol: 'R$',  flag: '🇧🇷' },
  ];

  function getCurrencyMeta(code) {
    return CURRENCIES.find(function(c){return c.code===code;}) || CURRENCIES[0];
  }

  async function fetchRates() {
    try {
      var res = await fetch('https://open.er-api.com/v6/latest/COP');
      var json = await res.json();
      if (json && json.rates) {
        fxRates = json.rates;
        fxTimestamp = Date.now();
        updateFxChip();
      }
    } catch(e) {
      console.warn('[fx] Rate fetch failed:', e.message);
    }
  }

  function convertFromCOP(amount) {
    if (activeCurrency === 'COP' || !fxRates[activeCurrency]) return amount;
    return amount * (fxRates[activeCurrency] || 1);
  }

  function fmtCurrency(n) {
    var amount = Number(n || 0);
    if (activeCurrency === 'COP') {
      return '$' + Math.round(amount).toLocaleString('es-CO');
    }
    var converted = convertFromCOP(amount);
    var meta = getCurrencyMeta(activeCurrency);
    return meta.symbol + converted.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function updateFxChip() {
    var chipEl = document.getElementById('vs-fx-chip');
    if (!chipEl) return;
    var meta = getCurrencyMeta(activeCurrency);
    var rateText = '—';
    if (activeCurrency === 'COP') {
      rateText = 'Moneda base';
    } else if (fxRates[activeCurrency]) {
      var rate = fxRates[activeCurrency];
      rateText = '1 COP = ' + rate.toFixed(6) + ' ' + activeCurrency;
    }
    chipEl.innerHTML =
      '<button class="lm-nav" style="color:#475569;width:100%;text-align:left" onclick="_posVSOpenCurrencyModal()" title="Cambiar moneda">'      +'<span class="lm-nav-inner">'      +'<span style="font-size:16px">'+meta.flag+'</span>'      +'<div style="min-width:0">'      +'<div style="font-weight:600;font-size:12px;color:#0F172A">'+activeCurrency+'</div>'      +'<div style="font-size:10px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+rateText+'</div>'      +'</div></span></button>';
  }

  window._posVSOpenCurrencyModal = function() {
    var ex = document.getElementById('vs-currency-modal');
    if (ex) { ex.remove(); return; }
    var overlay = document.createElement('div');
    overlay.id = 'vs-currency-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9100;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:360px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.18)">'      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'      +'<div style="font-weight:700;font-size:15px;color:#0F172A">Cambiar moneda</div>'      +'<button onclick="document.getElementById(\'vs-currency-modal\').remove()" style="border:none;background:#F1F5F9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;color:#64748B;">&#x2715;</button>'      +'</div>'      +'<div id="vs-pin-step">'      +'<p style="font-size:12px;color:#64748B;margin-bottom:12px">Requiere PIN de administrador</p>'      +'<input id="vs-pin-input" type="password" maxlength="8" placeholder="PIN"'      +' style="width:100%;border:1.5px solid #ECEEF2;border-radius:10px;padding:10px 14px;font-size:18px;letter-spacing:4px;text-align:center;outline:none;box-sizing:border-box"'      +' onfocus="this.style.borderColor=\'#5B6BFF\'" onblur="this.style.borderColor=\'#ECEEF2\'">'      +'<p id="vs-pin-error" style="color:#EF4444;font-size:12px;margin-top:6px;display:none">PIN incorrecto</p>'      +'<button onclick="_posVSValidatePIN()" style="margin-top:12px;width:100%;padding:10px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Continuar</button>'      +'</div>'      +'<div id="vs-currency-step" style="display:none">'      +'<p style="font-size:12px;color:#64748B;margin-bottom:12px">Selecciona la moneda de visualizacion</p>'      +'<div id="vs-currency-list" style="display:grid;gap:8px"></div>'      +'</div>'      +'</div>';
    document.body.appendChild(overlay);
    setTimeout(function(){ var el = document.getElementById('vs-pin-input'); if(el) el.focus(); }, 50);
    document.getElementById('vs-pin-input').addEventListener('keydown', function(e){ if(e.key==='Enter') window._posVSValidatePIN(); });
  };

  window._posVSValidatePIN = async function() {
    var pinEl = document.getElementById('vs-pin-input');
    var errEl = document.getElementById('vs-pin-error');
    if (!pinEl) return;
    var entered = pinEl.value.trim();
    if (!entered) { if(errEl){errEl.textContent='Ingresa el PIN';errEl.style.display='block';} return; }
    var sbRef = window._pos && window._pos.sb;
    var branchId = window._pos && window._pos.state && window._pos.state.branchId;
    if (!sbRef) { if(errEl){errEl.textContent='Error de conexion';errEl.style.display='block';} return; }
    try {
      var q = sbRef.from('pos_users').select('pin').eq('is_authorized_admin', true).limit(1);
      if (branchId) q = q.eq('branch_id', branchId);
      var res = await q.maybeSingle();
      var row = res.data;
      if (!row || row.pin === null) {
        if(errEl){errEl.textContent='PIN no configurado. Ve a Configuracion para establecerlo.';errEl.style.display='block';}
        return;
      }
      if (String(row.pin).trim() !== String(entered).trim()) {
        if(errEl){errEl.textContent='PIN incorrecto';errEl.style.display='block';}
        pinEl.value='';
        return;
      }
      document.getElementById('vs-pin-step').style.display='none';
      var stepEl = document.getElementById('vs-currency-step');
      stepEl.style.display='block';
      var listEl = document.getElementById('vs-currency-list');
      if (listEl) {
        listEl.innerHTML = CURRENCIES.map(function(c) {
          var isActive = c.code === activeCurrency;
          return '<button onclick="_posVSSelectCurrency(\''+c.code+'\')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:'+(isActive?'2px solid #5B6BFF':'1.5px solid #ECEEF2')+';background:'+(isActive?'#EEF2FF':'#fff')+';cursor:pointer;width:100%;text-align:left">'            +'<span style="font-size:20px">'+c.flag+'</span>'            +'<div><div style="font-weight:600;color:#0F172A;font-size:13px">'+c.code+' — '+c.name+'</div>'            +'<div style="font-size:11px;color:#94A3B8">'+c.symbol+'</div></div>'            +(isActive?'<svg style="margin-left:auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>':'')            +'</button>';
        }).join('');
      }
    } catch(e) {
      if(errEl){errEl.textContent='Error al verificar PIN';errEl.style.display='block';}
    }
  };

  window._posVSSelectCurrency = async function(code) {
    activeCurrency = code;
    try { localStorage.setItem(CURRENCY_KEY, code); } catch(e){}
    var overlay = document.getElementById('vs-currency-modal');
    if (overlay) overlay.remove();
    updateFxChip();
    if (code !== 'COP' && !fxRates[code]) await fetchRates();
    else updateFxChip();
    render();
  };


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
    deliveries: [],
    selectedDomiId: null,
    quickOrders: [],
    quickDeliveredCount: 0,
    selectedQuickId: null,
  };

  let container = null;
  let realtimeSub = null;
  let timerInterval = null;

  function fmtElapsed(startIso) {
    if (!startIso || startIso === 'null') return null;
    const ms = Date.now() - new Date(startIso).getTime();
    if (isNaN(ms) || ms < 0) return null;
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
  }

  function startLiveTimers() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!container) return;
      container.querySelectorAll('[data-timer]').forEach(el => {
        const iso = el.dataset.timer;
        const formatted = fmtElapsed(iso);
        if (!formatted) return;
        const val = el.querySelector('.vs-timer-val');
        if (val) val.textContent = formatted;
        if (el.dataset.timerAlert) {
          const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
          el.classList.toggle('vs-info-value--alert', mins > parseInt(el.dataset.timerAlert));
        }
      });
    }, 1000); // every second — user sees it move
  }

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

    // B6 fix: if localStorage has no tables, fetch directly from pos_tables
    if (!baseTables.length) {
      try {
        var sbFallback = window._pos && window._pos.sb;
        var branchFallback = window._pos && window._pos.state && window._pos.state.branchId;
        if (sbFallback && branchFallback) {
          var fbResult = await sbFallback.from('pos_tables')
            .select('id, name, status, current_order_id, branch_id')
            .eq('branch_id', branchFallback);
          var fbRows = fbResult.data || [];
          if (fbRows.length) {
            return fbRows.map(function(t, i) {
              return { id: t.id, name: t.name || ('Mesa ' + (i+1)), number: parseInt(t.name,10)||(i+1),
                seats: 4, zone_id: 'z_adentro', status: t.status || 'libre',
                total: 0, items_count: 0, minutes: 0, mesero_initials: '', persons: 0, openedAt: null };
            });
          }
        }
      } catch(fbErr) { console.warn('[fetchTables] fallback error:', fbErr.message); }
      return [];
    }

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
            openedAt:        openedAt || null,
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

  // ─── Supabase — fetch deliveries ────────────────────
  async function fetchDeliveries() {
    var sb = window._pos && window._pos.sb;
    if (!sb) return [];
    var branchId = window._pos && window._pos.state && window._pos.state.branchId;
    try {
      var q = sb.from('pos_orders')
        .select('id, customer_name, channel, total, payment_method, waiter_name, status, created_at, opened_at')
        .eq('channel', 'domicilio')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(50);
      if (branchId) q = q.eq('branch_id', branchId);
      var result = await q;
      var rows = result.data || [];
      return rows.map(function(r) {
        var createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
        var mins = Math.round((Date.now() - createdMs) / 60000);
        var estado = 'preparacion';
        if (r.status === 'paid' || r.status === 'completed') estado = 'entregado';
        else if (r.status === 'in_progress') estado = 'camino';
        return {
          id: r.id,
          cliente: r.customer_name || 'Sin cliente',
          canal: r.channel || 'whatsapp',
          items: 0,
          total: parseFloat(r.total) || 0,
          estado: estado,
          payStatus: (r.status === 'paid' || r.status === 'completed') ? 'pagado' : 'pendiente',
          metodo: r.payment_method || 'efectivo',
          domiciliario: r.waiter_name || '—',
          min: mins,
        };
      });
    } catch(e) {
      console.warn('[ventas-salon] fetchDeliveries error:', e.message || e);
      return [];
    }
  }

  // ─── Data loading ─────────────────────────────────────
  async function loadData() {
    state.tables = await fetchTables();
    state.deliveries = await fetchDeliveries();
    state.quickOrders = await fetchQuickOrders();
    state.quickDeliveredCount = await fetchQuickDeliveredCount();

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
          ${state.floor === '__domicilios__' ? renderDomicilioSummaryRow() : state.floor === '__rapidas__' ? renderQuickSummaryRow() : renderSummaryRow()}
          <section class="vs-body">
            <div class="vs-body-left">
              ${state.floor === '__domicilios__' ? renderDomicilioGrid() : state.floor === '__rapidas__' ? renderQuickGrid() : renderGrid()}
            </div>
            <aside class="vs-rail" id="vs-rail">${state.floor === '__domicilios__' ? renderDomiRailContent() : state.floor === '__rapidas__' ? renderQuickRailContent() : renderRailContent()}</aside>
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
            <div class="vs-brand-name">Cobra POS</div>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L8 7H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1l-2 5h14l-2-5h1a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-3L12 2z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
              <span style="font-weight:500">Domicilio express</span>
            </span>
          </button>
          <button class="lm-nav" style="color:#475569" onclick="location.href='historial.html'">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style="font-weight:500">Historial</span>
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
          <div id="vs-fx-chip" style="padding:0 4px"></div>
        </div>
      </aside>
    `;
  }

  // ─── Render: Topbar ──────────────────────────────────
  function renderTopbar(user) {
    const zones = state.zones.length ? state.zones : loadZonesFromConfig();
    const tabsHtml = zones.map(z => {
      const count = state.tables.filter(t => t.zone_id === z.id).length;
      return `<button class="lm-tab ${state.floor === z.id ? 'is-active' : ''}" data-floor="${z.id}">${z.name}<span class="vs-tab-count">${count}</span></button>`;
    }).join('');
    const isDomicilios = state.floor === '__domicilios__';
    const isRapidas = state.floor === '__rapidas__';
    let legendHtml;
    if (isDomicilios) {
      legendHtml = Object.entries(DELIVERY_META).map(([k, m]) => `<span class="vs-legend-item"><span class="vs-legend-dot" style="background:${m.color}"></span>${m.label}</span>`).join('');
    } else if (isRapidas) {
      legendHtml = QUICK_LEGEND_KEYS.map(k => { const m = QUICK_STATE_META[k]; return `<span class="vs-legend-item"><span class="vs-legend-dot" style="background:${m.color}"></span>${m.label}</span>`; }).join('');
    } else {
      legendHtml = Object.entries(STATE_META).map(([k, m]) => `<span class="vs-legend-item"><span class="vs-legend-dot" style="background:${m.color}"></span>${m.label}</span>`).join('');
    }
    return `
      <header class="vs-topbar" id="vs-salon-tabs">
        <div class="vs-topbar-left">
          <div class="vs-tabs-group">
            ${tabsHtml}
            <button class="lm-tab vs-tab-domicilios ${state.floor === '__domicilios__' ? 'is-active' : ''}" data-floor="__domicilios__">
              Domicilios
              <span class="vs-tab-count">${state.deliveries.filter(d => d.estado !== 'entregado').length}</span>
            </button>
            <button class="lm-tab ${state.floor === '__rapidas__' ? 'is-active' : ''}" data-floor="__rapidas__">
              Rápidas
              <span class="vs-tab-count">${state.quickOrders.length}</span>
            </button>
          </div>
        </div>
        <div class="vs-topbar-right">
          <div class="vs-legend">${legendHtml}</div>
          <button class="vs-cobro-toggle ${state.cobroAdelantado ? 'vs-cobro-on' : ''}" id="vs-cobro-toggle" title="${state.cobroAdelantado ? 'Desactivar cobro adelantado' : 'Activar cobro adelantado'}"><span class="vs-cobro-track"><span class="vs-cobro-thumb"></span></span><span class="vs-cobro-label">${state.cobroAdelantado ? 'Cobro adelantado' : 'Cobro al final'}</span></button>
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
                    <button class="vs-cobro-toggle ${state.cobroAdelantado ? 'vs-cobro-on' : ''}" id="vs-cobro-toggle" title="${state.cobroAdelantado ? 'Desactivar cobro adelantado' : 'Activar cobro adelantado'}"><span class="vs-cobro-track"><span class="vs-cobro-thumb"></span></span><span class="vs-cobro-label">${state.cobroAdelantado ? 'Cobro adelantado' : 'Cobro al final'}</span></button>
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


  // ─── Render: Domicilio summary row (chips) ────────────
  function renderDomicilioSummaryRow() {
    const counts = {};
    Object.keys(DELIVERY_META).forEach(k => { counts[k] = 0; });
    state.deliveries.forEach(d => { if (counts[d.estado] !== undefined) counts[d.estado]++; });

    const chipsHtml = Object.entries(DELIVERY_META).map(([key, meta]) => {
      const count = counts[key] || 0;
      return `
        <div class="lm-chip" style="border-left:3px solid ${meta.color}">
          <span class="lm-chip-icon" style="color:${meta.color};background:${meta.tint}">
            <span style="width:8px;height:8px;border-radius:50%;background:${meta.color};display:inline-block"></span>
          </span>
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:baseline;gap:6px">
              <span class="lm-chip-count">${count}</span>
              <span class="lm-chip-label">${meta.label}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const activos = state.deliveries.filter(d => d.estado !== 'entregado').length;
    const totalVal = state.deliveries.filter(d => d.estado !== 'entregado').reduce((s, d) => s + (d.total || 0), 0);

    return `
      <section class="vs-summary-row">
        <div class="vs-chips-track" id="vs-chips-track">
          ${chipsHtml}
        </div>
        <div class="vs-metric-strip">
          <div class="vs-metric-cell">
            <div class="vs-metric-label">Domicilios activos</div>
            <div class="vs-metric-value">${activos}</div>
            <div class="vs-metric-hint">en curso ahora</div>
          </div>
          <div class="vs-metric-divider"></div>
          <div class="vs-metric-cell">
            <div class="vs-metric-label">Total en curso</div>
            <div class="vs-metric-value">${fmtCurrency(totalVal)}</div>
            <div class="vs-metric-hint">sin entregados</div>
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


  // ─── Render: Domicilio grid ───────────────────────
  function renderDomicilioGrid() {
    const list = state.deliveries;
    if (!list.length) {
      return `<div class="vs-grid" style="grid-auto-rows:160px;align-content:start"><div class="vs-loading">Sin domicilios activos</div></div>`;
    }
    const cards = list.map(d => renderDomicilioCard(d)).join('');
    return `<div class="vs-grid vs-domi-grid" id="vs-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));grid-auto-rows:160px;align-content:start;display:grid;gap:12px">${cards}</div>`;
  }

  function renderDomicilioCard(d) {
    const meta  = DELIVERY_META[d.estado] || DELIVERY_META.recibido;
    const canal = CANAL_META[d.canal] || { label: d.canal, color: '#64748B', bg: '#F1F5F9' };
    const mins  = d.min || 0;
    const timeStr = mins < 60 ? `hace ${mins}m` : `hace ${Math.floor(mins/60)}h ${mins%60}m`;
    const isPagado = d.payStatus === 'pagado';
    const payColor = isPagado ? '#16A34A' : '#D97706';
    const payBg    = isPagado ? '#DCFCE7' : '#FEF3C7';
    const hasNext  = !!DELIVERY_NEXT[d.estado];

    return `
      <button class="lm-mesa vs-domi-card" data-domi-id="${d.id}"
        style="background:${meta.tint};border-color:${meta.ring};height:160px;max-height:160px;min-height:0;overflow:hidden">
        <div class="vs-mesa-header">
          <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
            <span class="vs-state-dot" style="background:${meta.color}"></span>
            ${meta.label}
          </span>
          <span class="vs-time-badge" data-timer="${new Date(Date.now() - (d.min||0)*60000).toISOString()}">${SVG_CLOCK(10)} <span class="vs-timer-val">${timeStr}</span></span>
        </div>
        <div class="vs-mesa-num-row">
          <div class="vs-mesa-num vs-mesa-num--active" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${d.cliente}</div>
          <span style="font-size:10px;font-weight:600;color:${canal.color};background:${canal.bg};padding:1px 6px;border-radius:4px;flex-shrink:0">${canal.label}</span>
        </div>
        <div class="vs-mesa-footer">
          <div class="vs-mesa-footer-active">
            <div class="vs-mesa-footer-left">
              <span class="vs-mesa-items">${d.items} ítems · <span style="color:${payColor};font-weight:600">${isPagado ? 'Pagado' : 'Por pagar'}</span></span>
            </div>
            <div class="vs-mesa-total">${fmtCurrency(d.total)}</div>
          </div>
        </div>
      </button>
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

    const isEsperando = t.status === 'esperando';
    const footerHtml = isLibre
      ? `<div class="vs-mesa-footer-libre">Disponible · Toca para abrir</div>`
      : isEsperando
      ? `<div class="vs-mesa-footer-active">
          <div class="vs-mesa-footer-left">
            <div class="lm-avatar lm-avatar-xs">${t.mesero_initials || '?'}</div>
            <span class="vs-mesa-items">${t.items_count || 0} ítems</span>
          </div>
          <div class="vs-mesa-total">${fmt(t.total)}</div>
        </div>`
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
          ${!isLibre ? `<span class="vs-time-badge" data-timer="${t.openedAt || new Date(Date.now() - (t.minutes||0)*60000).toISOString()}">${SVG_CLOCK(10)} <span class="vs-timer-val">${t.minutes || 0} min</span></span>` : ''}
        </div>
        <div class="vs-mesa-num-row">
          <div class="vs-mesa-num ${isLibre ? 'vs-mesa-num--libre' : 'vs-mesa-num--active'}">${numStr}</div>
          ${paxHtml}
        </div>
        <div class="vs-mesa-footer">${footerHtml}</div>
      </button>
    `;
  }


  // ─── Render: Domicilio rail ───────────────────────────
  function renderDomiRailContent() {
    if (!state.selectedDomiId) return renderDomiRailEmpty();
    const d = state.deliveries.find(x => x.id === state.selectedDomiId);
    if (!d) return renderDomiRailEmpty();
    return renderDomiRailDetail(d);
  }

  function renderDomiRailEmpty() {
    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Domicilio seleccionado</div>
          <div class="vs-rail-title-row">
            <h2 class="vs-rail-title">—</h2>
          </div>
        </div>
      </div>
      <div class="vs-empty-rail">
        <div class="vs-empty-icon">${SVG_PLUS(22)}</div>
        <div class="vs-empty-title">Selecciona un domicilio</div>
        <p class="vs-empty-desc">Elige un domicilio para ver su detalle, comanda y estado de entrega.</p>
      </div>
    `;
  }

  function renderDomiRailDetail(d) {
    const meta   = DELIVERY_META[d.estado] || DELIVERY_META.preparacion;
    const canal  = CANAL_META[d.canal] || { label: d.canal, color: '#64748B', bg: '#F1F5F9' };
    const isPagado = d.payStatus === 'pagado';
    const payColor = isPagado ? '#16A34A' : '#D97706';
    const payBg    = isPagado ? '#DCFCE7' : '#FEF3C7';
    const subtotal = d.total || 0;
    const domiFee  = 5000;
    const total    = subtotal + (isPagado ? 0 : 0); // total ya incluye domicilio en seed
    const hasNext  = !!DELIVERY_NEXT[d.estado];
    const nextLabel = DELIVERY_BTN[d.estado];

    const actionsHtml = hasNext
      ? `<div class="vs-actions">
           <button class="lm-btn-ghost" data-domi-action="print" data-domi-id="${d.id}">Imprimir</button>
           <button class="lm-btn-primary" data-domi-action="advance" data-domi-id="${d.id}">${nextLabel} →</button>
         </div>`
      : `<div class="vs-actions">
           <button class="lm-btn-ghost" data-domi-action="print" data-domi-id="${d.id}">Imprimir</button>
           <button class="lm-btn-primary" style="background:#22C55E" data-domi-action="close" data-domi-id="${d.id}">✓ Entregado</button>
         </div>`;

    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Domicilio seleccionado</div>
          <div class="vs-rail-title-row">
            <h2 class="vs-rail-title">${d.cliente}</h2>
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
            <div class="vs-info-label">Canal</div>
            <div class="vs-info-value" style="font-size:12px;color:${canal.color}">${canal.label}</div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Tiempo</div>
            <div class="vs-info-value" data-timer="${new Date(Date.now() - (d.min||0)*60000).toISOString()}"><span class="vs-timer-val">${d.min || 0} min</span></div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Ítems</div>
            <div class="vs-info-value">${d.items}</div>
          </div>
        </div>
        <div class="vs-mesero-row">
          <div class="lm-avatar lm-avatar-md">${(d.domiciliario || '?')[0].toUpperCase()}</div>
          <div class="vs-mesero-spacer">
            <div class="vs-mesero-label">Domiciliario</div>
            <div class="vs-mesero-name">${d.domiciliario || '—'}</div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${payColor};background:${payBg};padding:3px 8px;border-radius:6px">${isPagado ? 'Pagado' : 'Por pagar'}</span>
        </div>
      </div>

      <div class="vs-rail-scroll">
        <div class="vs-order-head">
          <div class="vs-order-section-label">Comanda</div>
          <span style="font-size:11px;color:#94A3B8">${d.metodo}</span>
        </div>
        <div class="vs-order-list">
          <div style="font-size:12px;color:#94A3B8;padding:16px 0;text-align:center">${d.items} ítem${d.items !== 1 ? 's' : ''} — detalle pendiente de integración</div>
        </div>
      </div>

      <div class="vs-rail-footer">
        <div class="vs-totals">
          <div class="vs-total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
          <div class="vs-total-row vs-total-grand"><span>Total</span><span>${fmt(subtotal)}</span></div>
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  // ─── Fetch: Quick Orders ────────────────────────────────
  async function fetchQuickOrders() {
    const sb = window._pos && window._pos.sb;
    if (!sb) return [];
    const branchId = window._pos.state && window._pos.state.branchId;
    const today = new Date(); today.setHours(0,0,0,0);
    let q = sb.from('pos_orders')
      .select('id, customer_name, turno, total, subtotal, discount, status, channel, created_at, waiter_name, notes, delivered_at')
      .eq('channel', 'rapido')
      .neq('status', 'cancelled')
      .gte('created_at', today.toISOString())
      .is('delivered_at', null)
      .order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) { console.error('[VS] fetchQuickOrders:', error); return []; }
    return data || [];
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
      ? state.cobroAdelantado
        ? `<div class="vs-actions">
             <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
             <button class="lm-btn-danger" data-action="liberar-mesa" data-table-id="${mesa.id}">Liberar mesa</button>
           </div>`
        : `<div class="vs-actions">
             <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
             <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
             <button class="lm-btn-primary" data-action="collect" data-table-id="${mesa.id}">Cobrar</button>
           </div>`
      : mesa.status === 'esperando' && state.cobroAdelantado
      ? `<div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
           <button class="lm-btn-primary vs-cobrar-disabled" data-action="collect" data-table-id="${mesa.id}" disabled>Cobrar</button>
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
      ${mesa.status === 'esperando' && state.cobroAdelantado
        ? `<button class="vs-rail-entregue-btn" data-action="mark-entregado" data-table-id="${mesa.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Ya entregué los platos
          </button>`
        : ''}

      <div class="vs-rail-fixed-top">
        <div class="vs-info-row">
          <div class="vs-info-cell">
            <div class="vs-info-label">Personas</div>
            <div class="vs-info-value">${mesa.persons || '—'}</div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Tiempo</div>
            <div class="vs-info-value ${minutesElapsed > 60 ? 'vs-info-value--alert' : ''}" data-timer="${openedAt || new Date(Date.now() - minutesElapsed*60000).toISOString()}" data-timer-alert="60"><span class="vs-timer-val">${minutesElapsed} min</span></div>
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
          ${isPendientePago
            ? `<span class="vs-rail-locked">${SVG_DOLLAR(12)} Esperando cobro</span>`
            : `<button class="lm-link" data-action="add-item" data-table-id="${mesa.id}">+ Agregar ítem</button>`}
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


  async function fetchQuickDeliveredCount() {
    const sb = window._pos && window._pos.sb;
    if (!sb) return 0;
    const branchId = window._pos.state && window._pos.state.branchId;
    const today = new Date(); today.setHours(0,0,0,0);
    let q = sb.from('pos_orders')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'rapido')
      .neq('status', 'cancelled')
      .gte('created_at', today.toISOString())
      .not('delivered_at', 'is', null);
    if (branchId) q = q.eq('branch_id', branchId);
    const { count, error } = await q;
    if (error) return 0;
    return count || 0;
  }

  // ─── Render: Quick Orders ────────────────────────────
  function renderQuickSummaryRow() {
    const active = state.quickOrders.filter(o => o.status !== 'paid');
    const total = state.quickOrders.reduce((s, o) => s + (o.total || 0), 0);
    const counts = {};
    state.quickOrders.forEach(o => {
      const k = (o.status === 'in_progress' || o.status === 'esperando') ? 'in_progress' : o.status;
      counts[k] = (counts[k] || 0) + 1;
    });
    counts['entregado'] = state.quickDeliveredCount || 0;

    const chipsHtml = QUICK_LEGEND_KEYS.map(key => {
      const meta = QUICK_STATE_META[key]; if (!meta) return '';
      const count = counts[key] || 0;
      return `
        <div class="lm-chip" style="border-left:3px solid ${meta.color};opacity:${count ? 1 : 0.4}">
          <span class="lm-chip-icon" style="color:${meta.color};background:${meta.tint}">
            ${SVG_CLOCK(15)}
          </span>
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:baseline;gap:6px">
              <span class="lm-chip-count">${count}</span>
              <span class="lm-chip-label">${meta.label}</span>
            </div>
            <div class="lm-chip-hint">pedidos</div>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="vs-summary-row">
        <div class="vs-chips-track">
          ${chipsHtml || '<div style="padding:12px 0;color:#94A3B8;font-size:13px">Sin pedidos rápidos hoy</div>'}
        </div>
        <div class="vs-metric-strip">
          <div class="vs-metric-cell">
            <div class="vs-metric-label">Activos ahora</div>
            <div class="vs-metric-value">${active.length}</div>
            <div class="vs-metric-hint">pedidos en curso</div>
          </div>
          <div class="vs-metric-divider"></div>
          <div class="vs-metric-cell">
            <div class="vs-metric-label">Total vendido hoy</div>
            <div class="vs-metric-value">${fmt(total)}</div>
            <div class="vs-metric-hint">ventas rápidas</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderQuickGrid() {
    if (state.loading) {
      return `<div class="vs-grid"><div class="vs-loading">Cargando pedidos rápidos…</div></div>`;
    }
    if (!state.quickOrders.length) {
      return `
        <div class="vs-grid">
          <div class="vs-empty-grid">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Sin pedidos rápidos hoy</span>
          </div>
        </div>
      `;
    }
    const cards = state.quickOrders.map(o => renderQuickCard(o)).join('');
    return `<div class="vs-grid" id="vs-quick-grid">${cards}</div>`;
  }

  function renderQuickCard(o) {
    const meta = QUICK_STATE_META[o.status] || QUICK_STATE_META.esperando;
    const isSelected = o.id === state.selectedQuickId;
    const titulo = o.customer_name || ('Turno #' + String(o.turno || 0).padStart(3, '0'));
    const mins = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    const selectedStyle = isSelected
      ? `border-color:${meta.color};box-shadow:0 0 0 3px ${meta.color}22`
      : `border-color:${meta.ring}`;
    return `
      <button class="lm-mesa" data-quick-id="${o.id}" style="${selectedStyle}">
        <div class="vs-mesa-header">
          <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
            <span class="vs-state-dot" style="background:${meta.color}"></span>
            ${meta.label}
          </span>
          <span class="vs-time-badge">${SVG_CLOCK(10)} ${mins} min</span>
        </div>
        <div class="vs-mesa-num-row">
          <div class="vs-mesa-num vs-mesa-num--active" style="font-size:${titulo.length > 12 ? '14px' : '22px'};font-weight:700">${titulo}</div>
        </div>
        <div class="vs-mesa-footer">
          <div class="vs-mesa-footer-active">
            <div class="vs-mesa-footer-left">
              <span class="vs-mesa-items">Venta rápida</span>
            </div>
            <div class="vs-mesa-total">${fmt(o.total)}</div>
          </div>
        </div>
      </button>
    `;
  }

  function renderQuickRailContent() {
    const o = state.quickOrders.find(x => x.id === state.selectedQuickId);
    if (!o) return renderQuickRailEmpty();
    return renderQuickRailDetail(o);
  }

  function renderQuickRailEmpty() {
    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Pedido seleccionado</div>
          <div class="vs-rail-title-row">
            <h2 class="vs-rail-title">—</h2>
          </div>
        </div>
      </div>
      <div class="vs-empty-rail">
        <div class="vs-empty-icon">${SVG_PLUS(22)}</div>
        <div class="vs-empty-title">Selecciona un pedido</div>
        <p class="vs-empty-desc">Elige un pedido rápido para ver su detalle y acciones disponibles.</p>
      </div>
    `;
  }

  function renderQuickRailDetail(o) {
    const meta = QUICK_STATE_META[o.status] || QUICK_STATE_META.esperando;
    const titulo = o.customer_name || ('Turno #' + String(o.turno || 0).padStart(3, '0'));
    const isPaid = o.status === 'paid';
    const total = o.total || 0;
    const subtotal = o.subtotal || total;
    const descuento = o.discount || 0;
    const hora = new Date(o.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    const isPendientePagoQ = o.status === 'pendiente_pago';
    let actionsHtml;
    if (isPaid) {
      actionsHtml = `<div class="vs-actions">
          <button class="lm-btn-ghost" data-action="quick-nueva" data-quick-id="${o.id}">Nueva venta</button>
          <button class="lm-btn-primary vs-cobrar-btn" data-action="quick-entregar" data-quick-id="${o.id}">Ya entregué</button>
        </div>`;
    } else if (isPendientePagoQ) {
      // Pendiente de pago: ir a cobrar (regresa a pagos.html)
      actionsHtml = `<div class="vs-actions">
          <button class="lm-btn-ghost" data-action="quick-cancelar" data-quick-id="${o.id}">Cancelar</button>
          <button class="lm-btn-primary vs-cobrar-btn" data-action="quick-cobrar" data-quick-id="${o.id}">Cobrar</button>
        </div>`;
    } else if (state.cobroAdelantado) {
      // Cobro adelantado + en preparación: ya fue pagado, solo entregar
      actionsHtml = `<div class="vs-actions">
          <button class="lm-btn-ghost" data-action="quick-cancelar" data-quick-id="${o.id}">Cancelar</button>
          <button class="lm-btn-primary vs-cobrar-btn" data-action="quick-entregar" data-quick-id="${o.id}">Ya entregué</button>
        </div>`;
    } else {
      // Cobro al final: primero cobrar, luego entregar
      actionsHtml = `<div class="vs-actions">
          <button class="lm-btn-ghost" data-action="quick-cancelar" data-quick-id="${o.id}">Cancelar</button>
          <button class="lm-btn-primary vs-cobrar-btn" data-action="quick-cobrar" data-quick-id="${o.id}">Cobrar</button>
        </div>`;
    }

    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Pedido rápido</div>
          <div class="vs-rail-title-row">
            <h2 class="vs-rail-title">${titulo}</h2>
            <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
              <span class="vs-state-dot" style="background:${meta.color}"></span>
              ${meta.label}
            </span>
          </div>
        </div>
      </div>
      <div class="vs-rail-body">
        <div class="vs-order-meta">
          <div class="vs-info-row">
            <span class="vs-info-label">Canal</span>
            <span class="vs-info-value">Venta rápida</span>
          </div>
          <div class="vs-info-row">
            <span class="vs-info-label">Hora</span>
            <span class="vs-info-value">${hora}</span>
          </div>
          ${o.notes ? `<div class="vs-info-row"><span class="vs-info-label">Notas</span><span class="vs-info-value">${o.notes}</span></div>` : ''}
        </div>
        <div class="vs-divider"></div>
        <div class="vs-totals">
          <div class="vs-total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
          ${descuento ? `<div class="vs-total-row"><span>Descuento</span><span>-${fmt(descuento)}</span></div>` : ''}
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

    // Botón "Entregado" en tarjeta (div, no button — evita nesting inválido)
    container.querySelectorAll('.vs-entregue-btn').forEach(div => {
      div.addEventListener('click', e => {
        e.stopPropagation(); // no seleccionar la mesa
        confirmEntregado(div.dataset.tableId);
      });
    });

    // Floor tabs
    container.querySelectorAll('[data-floor]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.floor = btn.dataset.floor;
        state.selectedTableId = null;
        render();
      });
    });

    // Domicilio cards: click selects + shows rail
    container.querySelectorAll('.vs-domi-card').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedDomiId = btn.dataset.domiId;
        const rail = document.getElementById('vs-rail');
        if (rail) { rail.innerHTML = renderDomiRailContent(); attachDomiRailEvents(); }
        // highlight selected
        container.querySelectorAll('.vs-domi-card').forEach(c => {
          const m = DELIVERY_META[state.deliveries.find(x=>x.id===c.dataset.domiId)?.estado] || DELIVERY_META.preparacion;
          c.style.boxShadow = c.dataset.domiId === state.selectedDomiId ? `0 0 0 3px ${m.color}33` : 'none';
          c.style.borderColor = c.dataset.domiId === state.selectedDomiId ? m.color : m.ring;
        });
      });
    });

    // Quick order cards
    container.querySelectorAll('.lm-mesa[data-quick-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedQuickId = btn.dataset.quickId;
        const rail = document.getElementById('vs-rail');
        if (rail) { rail.innerHTML = renderQuickRailContent(); attachQuickRailEvents(); }
        container.querySelectorAll('.lm-mesa[data-quick-id]').forEach(c2 => {
          const o2 = state.quickOrders.find(x => x.id === c2.dataset.quickId);
          const m2 = (o2 && QUICK_STATE_META[o2.status]) || QUICK_STATE_META.esperando;
          c2.style.boxShadow = c2.dataset.quickId === state.selectedQuickId ? `0 0 0 3px ${m2.color}33` : 'none';
          c2.style.borderColor = c2.dataset.quickId === state.selectedQuickId ? m2.color : m2.ring;
        });
      });
    });

    // Domi rail action buttons
    attachDomiRailEvents();

    // Chip drag-to-reorder
    attachChipDragEvents();

    // Rail events
    attachRailEvents();

    // Live timers
    startLiveTimers();
  }

  function attachRailEvents() {
    if (!container) return;
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleAction);
    });
  }

  function attachQuickRailEvents() {
    if (!container) return;
    container.querySelectorAll('[data-action^="quick-"]').forEach(btn => {
      btn.addEventListener('click', handleAction);
    });
  }


  function attachDomiRailEvents() {
    if (!container) return;
    container.querySelectorAll('[data-domi-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.domiAction;
        const id = btn.dataset.domiId;
        const d = state.deliveries.find(x => x.id === id);
        if (!d) return;
        if (action === 'advance' && DELIVERY_NEXT[d.estado]) {
          d.estado = DELIVERY_NEXT[d.estado];
          render();
        } else if (action === 'close') {
          d.estado = 'entregado';
          render();
        }
      });
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
      case 'cobrar': {
        // Cobro adelantado: navegar a pagos.html con adelantado=1
        const mesaCobrar = state.tables.find(t => t.id === tableId);
        const orderIdCobrar = mesaCobrar && mesaCobrar.current_order_id;
        if (orderIdCobrar) {
          window.location.href = `pagos.html?order=${orderIdCobrar}&table=${tableId}&adelantado=1`;
        } else {
          const sbRef2 = window._pos && window._pos.sb;
          if (sbRef2) {
            sbRef2.from('pos_orders').select('id').eq('table_id', tableId).in('status', ['open','in_progress']).order('created_at',{ascending:false}).limit(1).maybeSingle()
              .then(function(r){ if (r.data) window.location.href = `pagos.html?order=${r.data.id}&table=${tableId}&adelantado=1`; });
          }
        }
        break;
      }
      case 'collect': {
        // Buscar el order activo de esta mesa y navegar a pagos
        const mesa = state.tables.find(t => t.id === tableId);
        const orderId = mesa && mesa.current_order_id;
        const adelantadoParam = state.cobroAdelantado ? '&adelantado=1' : '';
        if (orderId) {
          window.location.href = `pagos.html?order=${orderId}&table=${tableId}${adelantadoParam}`;
        } else {
          // Si no hay current_order_id, buscar en Supabase
          const sbRef = window._pos && window._pos.sb;
          if (sbRef) {
            sbRef.from('pos_orders')
              .select('id')
              .eq('table_id', tableId)
              .in('status', ['open', 'in_progress'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
              .then(({ data }) => {
                if (data) window.location.href = `pagos.html?order=${data.id}&table=${tableId}${adelantadoParam}`;
                else alert('No se encontró un pedido activo para esta mesa.');
              });
          }
        }
        break;
      }
      case 'mark-entregado':
        confirmEntregado(tableId);
        break;
      case 'liberar-mesa':
        liberarMesa(tableId);
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
      case 'add-item': {
        const mesaAdd = state.tables.find(t => t.id === tableId);
        if (mesaAdd && mesaAdd.status === 'pendiente_pago') {
          vsToast('Esta mesa aún no ha sido cobrada. Primero cobra antes de agregar ítems.');
          return;
        }
        window._pos && window._pos.emit && window._pos.emit('table:addItem', { tableId });
        break;
      }
      case 'reassign':
        window._pos && window._pos.emit && window._pos.emit('table:reassign', { tableId });
        break;
      case 'nav-back':
        window._pos && window._pos.emit && window._pos.emit('nav:back');
        break;
      case 'nav-rapida':
        window.location.href = 'venta-rapida.html';
        break;
      case 'nav-domicilio':
        window.location.href = 'domicilios.html';
        break;
      case 'quick-cobrar': {
        const qcId = e.currentTarget.dataset.quickId;
        if (qcId) window.location.href = `pagos.html?order=${qcId}&channel=rapido`;
        break;
      }
      case 'quick-entregar': {
        const qeId = e.currentTarget.dataset.quickId;
        const sbQE = window._pos && window._pos.sb;
        if (sbQE && qeId) {
          sbQE.from('pos_orders').update({ delivered_at: new Date().toISOString() }).eq('id', qeId)
            .then(function() {
              state.quickOrders = state.quickOrders.filter(x => x.id !== qeId);
              state.selectedQuickId = null;
              render();
            });
        }
        break;
      }
      case 'quick-cancelar': {
        const qxId = e.currentTarget.dataset.quickId;
        vsConfirm({
          title: 'Cancelar pedido',
          msg: '¿Cancelar este pedido rápido?',
          okLabel: 'Sí, cancelar',
          variant: 'danger',
        }).then(function(ok) {
          if (!ok) return;
          const sbQX = window._pos && window._pos.sb;
          if (sbQX && qxId) {
            sbQX.from('pos_orders').update({ status: 'cancelled' }).eq('id', qxId)
              .then(function() {
                state.quickOrders = state.quickOrders.filter(x => x.id !== qxId);
                state.selectedQuickId = null;
                render();
              });
          }
        });
        break;
      }
      case 'quick-nueva':
        window.location.href = 'venta-rapida.html';
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
    const _posUser = window._pos && window._pos.state && window._pos.state.user;
    const role = (_posUser && (_posUser.user_metadata?.role || _posUser.app_metadata?.role)) || 'mesero';
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
    // Update toggle button in topbar
    const btn = document.getElementById('vs-cobro-toggle');
    if (btn) {
      btn.className = 'vs-cobro-toggle' + (nuevoValor ? ' vs-cobro-on' : '');
      btn.title = nuevoValor ? 'Desactivar cobro adelantado' : 'Activar cobro adelantado';
      btn.querySelector('.vs-cobro-label').textContent = nuevoValor ? 'Cobro adelantado' : 'Cobro al final';
      btn.addEventListener('click', toggleCobro);
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

  // ─── Modal de confirmación personalizado ──────────────────────────────
  function vsToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0F172A;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;z-index:9999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.25);animation:vsOverlayIn .2s ease';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function vsConfirm({ title, msg, okLabel = 'Confirmar', variant = 'brand', cancelLabel = 'Cancelar' }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'vs-confirm-overlay';

      const iconSvg = {
        green:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        danger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
        brand:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      }[variant] || '';

      overlay.innerHTML = `
        <div class="vs-confirm-card">
          <div class="vs-confirm-icon ${variant}">${iconSvg}</div>
          <div class="vs-confirm-title">${title}</div>
          <div class="vs-confirm-msg">${msg}</div>
          <div class="vs-confirm-actions">
            <button class="vs-c-cancel">${cancelLabel}</button>
            <button class="vs-c-ok ${variant}">${okLabel}</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      function close(result) { overlay.remove(); resolve(result); }

      overlay.querySelector('.vs-c-ok').addEventListener('click', () => close(true));
      overlay.querySelector('.vs-c-cancel').addEventListener('click', () => close(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
  }

  // ─── Confirmar entrega de platos (botón en tarjeta) ──────────────────
  async function confirmEntregado(tableId) {
    const mesa = state.tables.find(t => t.id === tableId);
    const numStr = mesa ? (mesa.name || String(mesa.number || '')) : tableId;
    const ok = await vsConfirm({
      title: 'Confirmar entrega',
      msg: '¿Ya entregaste los platos en la <strong>Mesa ' + numStr + '</strong>?',
      okLabel: 'Sí, ya entregué',
      variant: 'green',
    });
    if (!ok) return;
    marcarComiendo(tableId, 'proactive');
  }

  async function marcarComiendo(tableId, method) {
    try {
      const sbRef = window._pos && window._pos.sb;
      if (!sbRef) return;
      await sbRef.from('pos_tables').update({
        status:          'comiendo',
        comiendo_method: method,
      }).eq('id', tableId);
      const t = state.tables.find(x => x.id === tableId);
      if (t) { t.status = 'comiendo'; t.comiendo_method = method; }
      render();
    } catch(e) { console.error('[VS] marcarComiendo:', e); }
  }

  async function liberarMesa(tableId) {
    const mesa = state.tables.find(t => t.id === tableId);
    const numStr = mesa ? (mesa.name || String(mesa.number || '')) : tableId;
    const ok = await vsConfirm({
      title: 'Liberar mesa',
      msg: '¿Liberar la <strong>Mesa ' + numStr + '</strong>? Esto cerrará la sesión y la dejará disponible.',
      okLabel: 'Liberar mesa',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const sbRef = window._pos && window._pos.sb;
      if (!sbRef) return;
      await sbRef.from('pos_tables').update({
        status:           'libre',
        current_order_id: null,
        esperando_at:     null,
        comiendo_method:  null,
      }).eq('id', tableId);
      const t = state.tables.find(x => x.id === tableId);
      if (t) { t.status = 'libre'; t.current_order_id = null; }
      state.selectedTableId = null;
      render();
    } catch(e) { console.error('[VS] liberarMesa:', e); }
  }

  // ─── Auto-avance esperando→comiendo ───────────────────────────────────
  function startAutoAvance() {
    setInterval(async function() {
      try {
        const cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
        const mins = cfg.entregaMin || 12;
        const cutoff = new Date(Date.now() - mins * 60 * 1000).toISOString();
        const sbRef = window._pos && window._pos.sb;
        if (!sbRef) return;
        // Mesas en esperando cuyo esperando_at supera el umbral
        const { data } = await sbRef
          .from('pos_tables')
          .select('id')
          .eq('status', 'esperando')
          .not('esperando_at', 'is', null)
          .lt('esperando_at', cutoff);
        if (!data || !data.length) return;
        const ids = data.map(r => r.id);
        await sbRef.from('pos_tables').update({
          status:          'comiendo',
          comiendo_method: 'auto',
        }).in('id', ids);
        // Actualizar estado local
        ids.forEach(id => {
          const t = state.tables.find(x => x.id === id);
          if (t) { t.status = 'comiendo'; t.comiendo_method = 'auto'; }
        });
        if (ids.length) render();
      } catch(e) { console.error('[VS] autoAvance:', e); }
    }, 60 * 1000); // cada 60 segundos
  }

  // ─── Init ─────────────────────────────────────────────
  async function init(mountContainer) {
    container = mountContainer;

    // Inject stylesheet (always fresh)
    const existingStyle = document.getElementById('vs-styles');
    if (existingStyle) existingStyle.remove();
    if (true) {
      const link = document.createElement('link');
      link.id = 'vs-styles';
      link.rel = 'stylesheet';
      link.href = 'styles/modules/ventas-salon.css?v=' + Date.now();
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
    // Load FX rates for multi-currency
    fetchRates();
    // Initialize currency chip
    setTimeout(updateFxChip, 100);
    // Auto-avance esperando→comiendo
    startAutoAvance();
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
