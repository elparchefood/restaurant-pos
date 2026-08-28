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
    preparacion: { label: 'En preparación', color: '#F59E0B', tint: '#FFFBEB', ring: '#FDE68A' },
    listo:       { label: 'Listo',          color: '#8B5CF6', tint: '#F5F3FF', ring: '#DDD6FE' },
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



  const DELIVERY_NEXT = { preparacion: 'listo', listo: 'camino', camino: 'entregado' };
  const DELIVERY_BTN  = { preparacion: 'Listo', listo: 'En camino', camino: 'Entregado' };
  // Estado de fulfillment de VENTA RÁPIDA (sincroniza con la pastilla del chat vía pos_orders.estado)
  const QUICK_ESTADO_FLOW = ['en_preparacion', 'listo', 'entregado'];
  const QUICK_ESTADO_META = {
    en_preparacion: { label: 'En preparación', color: '#f97316' },
    listo:          { label: 'Listo',          color: '#3b82f6' },
    entregado:      { label: 'Entregado',       color: '#22c55e' },
  };
  function quickEstadoControl(o) {
    const est = o.estado || 'en_preparacion';
    const meta = QUICK_ESTADO_META[est] || QUICK_ESTADO_META.en_preparacion;
    const idx = QUICK_ESTADO_FLOW.indexOf(est);
    const next = (idx >= 0 && idx < QUICK_ESTADO_FLOW.length - 1) ? QUICK_ESTADO_FLOW[idx + 1] : null;
    const nextLbl = next ? QUICK_ESTADO_META[next].label : null;
    // Solo el boton de avanzar. La pastilla del estado ya esta arriba, junto
    // al nombre: repetirla debajo en grande era decir lo mismo dos veces y es
    // parte de lo que hacia que esta tarjeta se viera distinta a las otras.
    return next
      ? '<button class="lm-btn-ghost" data-action="quick-estado" data-estado="' + next + '" data-quick-id="' + o.id + '">Marcar ' + nextLbl + '</button>'
      : '';
  }

  const CHIP_ORDER_KEY = 'pos.ventas.chipOrder';
  /* ⚠️ EL PLANO GUARDADO ES POR SEDE (24-ago-2026, en pleno servicio).
     Era `pos.config.salon.v1` a secas, sin decir de que restaurante. En cuanto
     alguien entro a DOS restaurantes en el mismo computador, el plano del
     primero se quedo guardado y el salon empezo a pintar las mesas de los dos:
     Sergio vio 16 mesas donde tiene 8, con la 01, 02, 03 y 04 repetidas.

     Nadie lo habia visto porque hasta hoy solo existia un restaurante por
     equipo. Se rompio el dia que hubo un restaurante de pruebas.

     La llave lleva la sede. Y la vieja se borra al pasar: si se quedara ahi,
     seguiria ocupando espacio y confundiendo al que la encuentre. */
  /* La llave la arma `pos-core` (posLlaveSalon): es la MISMA para las cuatro
     pantallas que guardan o leen el plano. Ver la nota larga alli. */
  const CONFIG_KEY = (window.posLlaveSalon ? window.posLlaveSalon() : 'pos.config.salon.v1');
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

  /* El pie del panel de Ventas: la cuenta que tiene la sesión abierta.
     Antes aquí iba un selector de moneda. En Colombia todo se cobra en pesos y
     ese selector estaba escondido detrás de un PIN, así que ocupaba el mejor
     sitio del panel para algo que nadie usa. Ahora va el mismo bloque del
     dashboard —foto del restaurante, nombre y rol— para que el mesero sepa de un
     vistazo con qué cuenta está trabajando.
     La conversión de moneda sigue funcionando igual; lo único que se fue es su
     botón de esta pantalla. */
  function updateFxChip() {
    var chipEl = document.getElementById('vs-fx-chip');
    if (!chipEl || chipEl.dataset.userDone === '1') return;
    chipEl.dataset.userDone = '1';
    chipEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:8px 6px;min-width:0">'
      + '<div class="user-avatar" id="vs-user-av" style="width:36px;height:36px;border-radius:50%;'
      +   'background:#EEF2FF;color:#5B6BFF;display:flex;align-items:center;justify-content:center;'
      +   'font-weight:700;font-size:13px;flex-shrink:0;overflow:hidden">?</div>'
      + '<div style="min-width:0">'
      +   '<div id="vs-user-nom" style="font-weight:600;font-size:12.5px;color:#0F172A;'
      +     'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Cargando…</div>'
      +   '<div id="vs-user-rol" style="font-size:10.5px;color:#94A3B8;'
      +     'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">—</div>'
      + '</div></div>';
    pintarCuentaVS();
  }

  async function pintarCuentaVS() {
    var sbRef = (window._pos && window._pos.sb) || window.sb;
    if (!sbRef) return;
    var nombre = '', rol = '';
    try {
      var u = await sbRef.auth.getUser();
      var meta = (u && u.data && u.data.user && u.data.user.user_metadata) || {};
      nombre = meta.nombre || meta.full_name || meta.name || (u.data.user && u.data.user.email) || '';
      rol    = meta.role || meta.rol || '';
    } catch (e) {}

    var nEl = document.getElementById('vs-user-nom');
    var rEl = document.getElementById('vs-user-rol');
    var aEl = document.getElementById('vs-user-av');
    if (nEl) nEl.textContent = nombre || 'Mi cuenta';
    if (rEl) rEl.textContent = rol ? (rol.charAt(0).toUpperCase() + rol.slice(1)) : 'Usuario';
    if (aEl && !aEl.querySelector('img')) {
      aEl.textContent = (nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2)
        .map(function (w) { return w[0]; }).join('').toUpperCase() || '?';
    }
    /* La foto del restaurante la pone pos-brand.js, que conoce este círculo por
       su id. Se le pide que repase por si ya la tenía en cache. */
    if (typeof window.posBrandLogo === 'function') {
      try { window.posBrandLogo(localStorage.getItem('pos.brand.logo') || ''); } catch (e) {}
    }
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
      /* Igual que en el otro candado: el PIN no baja, se comprueba en el
         servidor contra una huella. Ver la nota larga de mas abajo. */
      var hay = await sbRef.rpc('fn_pin_existe');
      if (!hay.error && hay.data === false) {
        if(errEl){errEl.textContent='PIN no configurado. Ve a Configuracion para establecerlo.';errEl.style.display='block';}
        return;
      }
      var r = await sbRef.rpc('fn_pin_verificar', { p_pin: String(entered).trim(), p_accion: 'moneda' });
      if (r.error) {
        if(errEl){errEl.textContent='Error al verificar el PIN';errEl.style.display='block';}
        return;
      }
      if (r.data !== true) {
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

  // ─── UI state (no data) ─────────────────────────────
  let sidebarExpanded = false;

  // ─── Estado del módulo ───────────────────────────────
  let state = {
    floor: null,
    zones: [],
    selectedTableId: null,
    tables: [],
    orderItems: [],
    sessionOrders: [],   // todos los pedidos de la visita actual de la mesa
    openPax: 2,   // nº de personas elegido en el selector de "abrir mesa"
    loading: true,
    chipOrder: loadChipOrder(),
    dragKey: null,
    cobroAdelantado: false,
    userRole: 'mesero',
    canCobrar: false,
    currentOrder: null,
    deliveries: [],
    selectedDomiId: null,
    domiItems: {},
    quickItems: {},      // items del pedido rapido, para mostrar la comanda
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
    // Si el fallback de Supabase ya pobló state.zones, usarlo
    if (state.zones && state.zones.length) return state.zones;
    return [{ id: 'z_adentro', name: 'Adentro' }];
  }

  // ─── Supabase — fetch data ────────────────────────────

  // Devuelve mesas del config localStorage enriquecidas con estado live de Supabase
  /* El salón —cuántas mesas hay, cómo se llaman, en qué zona están— ya vive en
     el equipo: lo guarda Configuración. No hay ninguna razón para esperar al
     servidor para dibujarlo. Palabras de Sergio: "pintar una mesa siempre es la
     misma, ¿por qué tiene que tardarse cargando?".
     Esto se saca aparte para poder llamarlo también al arrancar, sin esperas.
     Lo que SÍ viene del servidor es el estado de cada mesa (libre, ocupada, el
     reloj, la cuenta): eso cambia a cada rato y llega un instante después. */
  /* El plano del salón, guardado por NOSOTROS. No basta con leer la
     configuración: esa llave solo existe si el dueño pasó por Configuración y
     guardó en ESTE computador. En el equipo de Sergio no estaba, y por eso al
     entrar seguía diciendo "Cargando mesas…". Ahora, la primera vez que las
     mesas llegan del servidor —vengan de donde vengan— se guarda su plano
     (cuáles son, cómo se llaman, en qué zona), y a partir de ahí el salón se
     dibuja al instante. El ESTADO de cada mesa nunca se guarda: eso cambia a
     cada rato y siempre viene fresco. */
  function guardarPlanoSalon() {
    if (!window.posCache || !state.tables || !state.tables.length) return;
    posCache.guardarPronto('salon', function () {
      return {
        zones: state.zones || [],
        tables: state.tables.map(function (t) {
          return { id: t.id, name: t.name, number: t.number, seats: t.seats, zone_id: t.zone_id };
        })
      };
    }, 300);
  }

  function planoGuardado() {
    var g = window.posCache && posCache.leer('salon');
    var d = g && g.datos;
    if (!d || !d.tables || !d.tables.length) return null;
    return {
      zones: d.zones || [],
      tables: d.tables.map(function (t) {
        return {
          id: t.id, name: t.name, number: t.number, seats: t.seats, zone_id: t.zone_id,
          status: 'libre', total: 0, items_count: 0, minutes: 0, mesero_initials: '', persons: 0
        };
      })
    };
  }

  /* El plano guardado en el equipo. En funcion NOMBRADA porque lo necesitan
     DOS sitios: mesasBase() y el armado de zonas de fetchTables(). Antes vivia
     escondido dentro de mesasBase y fetchTables lo llamaba por un nombre que
     alli no existia: ReferenceError, el catch se lo tragaba, y la pantalla se
     quedaba con las mesas base — que van con status 'libre' escrito a mano.
     ESE era el "todas las mesas libres" de cada manana en el .exe. La tablet
     nunca lo sufrio porque no tiene plano guardado: entra por el camino de
     respaldo que lee los estados reales. */
  function leerPlanLocal() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) { var c = JSON.parse(raw); if (c.tables) return c; }
    } catch(e) {}
    return { zones: [], tables: [] };
  }

  function mesasBase() {
    var localConfig = leerPlanLocal();
    return localConfig.tables.map(function(t, i) {
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
  }

  async function fetchTables() {
    const baseTables = mesasBase();

    // Fallback: si localStorage no tiene mesas, leer desde Supabase con zone_id/zone_name/sort_order
    if (!baseTables.length) {
      try {
        var sbFallback = window._pos && window._pos.sb;
        var branchFallback = window._pos && window._pos.state && window._pos.state.branchId;
        if (sbFallback && branchFallback) {
          var fbResult = await sbFallback
            .from('pos_tables')
            .select('id, name, status, current_order_id, zone_id, zone_name, sort_order, capacity, pendiente_pago_at, esperando_at, comiendo_at, sesion_at')
            .eq('branch_id', branchFallback)
            .order('sort_order', { ascending: true });
          var fbRows = fbResult.data || [];
          if (fbRows.length) {
            // Reconstruir zonas únicas en orden para el estado global
            var zonesMap = {};
            fbRows.forEach(function(t) {
              var zid = t.zone_id || 'z_adentro';
              if (!zonesMap[zid]) zonesMap[zid] = { id: zid, name: t.zone_name || zid };
            });
            state.zones = Object.values(zonesMap);
            return fbRows.map(function(t) {
              return {
                id: t.id, name: t.name || ('Mesa ' + t.number),
                number: parseInt(t.name, 10) || t.number || 1,
                seats: t.capacity || 4,
                zone_id: t.zone_id || 'z_adentro',
                status: t.status || 'libre',
                current_order_id: t.current_order_id || null,
                total: 0, items_count: 0, minutes: 0, mesero_initials: '', persons: 0, openedAt: null
              };
            });
          }
        }
      } catch(fbErr) { console.warn('[fetchTables] fallback error:', fbErr.message); }
      return [];
    }

    // 2. Enriquecer con Supabase: status live, sort_order y zone_id de todas las mesas del branch.
    //    - Las zonas configuradas en localStorage son la fuente de verdad para la ESTRUCTURA de zonas.
    //    - Supabase puede añadir zonas nuevas (mesas en zonas que aún no están en localStorage).
    //    - Las mesas se combinan de ambas fuentes (no se pierden mesas de localStorage).
    //    - NUNCA se sobrescriben las zonas del localStorage desde aquí.
    try {
      const sb = window._pos && window._pos.sb;
      const branchId = window._pos && window._pos.state && window._pos.state.branchId;
      if (sb && branchId) {
        const { data: sbRows } = await sb
          .from('pos_tables')
          .select('id, name, status, current_order_id, zone_id, zone_name, sort_order, capacity, pendiente_pago_at, esperando_at, comiendo_at, sesion_at')
          .eq('branch_id', branchId)
          .order('sort_order', { ascending: true });
        const sbMap = {};
        (sbRows || []).forEach(function(r){ sbMap[r.id] = r; });

        // Zonas: empezar con las de localStorage (estructura configurada por el usuario)
        const freshZonesMap = {};
        const planLocal = leerPlanLocal();
        if (planLocal.zones) {
          planLocal.zones.forEach(function(z){ freshZonesMap[z.id] = { id: z.id, name: z.name }; });
        }
        // Añadir zonas nuevas que Supabase reporta y que aún no están en localStorage
        (sbRows || []).forEach(function(r) {
          var zid = r.zone_id || 'z_adentro';
          if (!freshZonesMap[zid]) freshZonesMap[zid] = { id: zid, name: r.zone_name || zid };
        });
        if (Object.keys(freshZonesMap).length) {
          state.zones = Object.values(freshZonesMap);
        }

        /* Mesas: combinar lo guardado + Supabase (Supabase puede tener mesas nuevas)

           ⚠️ PERO LO GUARDADO NO PUEDE INVENTAR MESAS. Si una mesa guardada en
           este computador ya no existe en la base, es basura de otro
           restaurante o de un plano viejo — y colarla pinta mesas que no
           existen. Fue exactamente lo que paso el 24-ago: 16 mesas donde hay 8.

           Solo se descarta cuando la base SI respondio. Si no llegaron filas
           —sin internet— se conserva lo guardado, que es justo para lo que
           sirve. */
        const mergedMap = {};
        const idsReales = {};
        (sbRows || []).forEach(function(r){ idsReales[r.id] = 1; });
        const hayRespuesta = !!(sbRows && sbRows.length);
        baseTables.forEach(function(t){
          if (hayRespuesta && !idsReales[t.id]) return;   // mesa fantasma: se ignora
          mergedMap[t.id] = t;
        });
        (sbRows || []).forEach(function(r) {
          var lsT = mergedMap[r.id];
          mergedMap[r.id] = {
            id:         r.id,
            name:       r.name || (lsT && lsT.name) || r.id,
            number:     parseInt(r.name, 10) || (lsT && lsT.number) || 1,
            seats:      r.capacity || (lsT && lsT.seats) || 4,
            zone_id:    r.zone_id || (lsT && lsT.zone_id) || 'z_adentro',
            sort_order: (r.sort_order != null) ? r.sort_order : 9999,
            status:     r.status || 'libre',
            current_order_id: r.current_order_id || null,
            sesion_at:  r.sesion_at || null,
            total: 0, items_count: 0, minutes: 0, mesero_initials: '', persons: 0, openedAt: null
          };
        });

        // Órdenes activas para todas las mesas combinadas
        const allIds = Object.keys(mergedMap);
        const { data: ordersData } = await sb
          .from('pos_orders')
          .select('id, table_id, total, guests, waiter_name, waiter_id, opened_at, created_at')
          .in('table_id', allIds)
          .not('status', 'eq', 'completed')
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'paid');
        const orderMap = {};
        (ordersData || []).forEach(function(o){ orderMap[o.table_id] = o; });

        // Además, las órdenes ACTUALES de cada mesa (current_order_id). Pueden estar
        // 'paid' en cobro adelantado y aun así siguen en curso (comida por entregar).
        // Tienen PRIORIDAD sobre el respaldo por table_id. Se consultan una a una
        // porque .in() con múltiples UUIDs falla en algunos entornos (tablet/WebView).
        const curIds = Object.values(mergedMap)
          .map(function(t){ return t.current_order_id; })
          .filter(Boolean);
        if (curIds.length > 0) {
          const curOrders = (await Promise.all(curIds.map(function(oid){
            return sb.from('pos_orders')
              .select('id, table_id, total, guests, waiter_name, waiter_id, opened_at, created_at')
              .eq('id', oid)
              .not('status', 'eq', 'cancelled')
              .maybeSingle()
              .then(function(r){ return r.data; })
              .catch(function(){ return null; });
          }))).filter(Boolean);
          curOrders.forEach(function(o){ orderMap[o.table_id] = o; });
        }

        // Contar ítems por orden — usamos .eq() individual por orden en vez de .in()
        // porque .in() con múltiples UUIDs falla en algunos entornos (tablet/WebView).
        const itemsCountMap = {};
        const activeOrders = Object.values(orderMap).filter(function(o){ return o && o.id; });
        if (activeOrders.length > 0) {
          const countResults = await Promise.all(activeOrders.map(function(o) {
            return sb.from('pos_order_items').select('id').eq('order_id', o.id)
              .then(function(r){ return { oid: o.id, count: (r.data || []).length }; });
          }));
          countResults.forEach(function(c){ itemsCountMap[c.oid] = c.count; });
        }

        const _vsUsr = await vsUsuarios();
        const enriched = Object.values(mergedMap).map(function(t) {
          const ord = orderMap[t.id];
          // El nombre completo de quien atiende. Antes solo se guardaban las
          // iniciales y luego se intentaba reconstruir el nombre con una lista
          // fija de ejemplo; como los meseros reales no estaban en esa lista,
          // la tarjeta terminaba mostrando "SA" en vez de "Sergio Abadia".
          const _mesero = (ord && ord.waiter_name) || (ord && _vsUsr[ord.waiter_id]) || '';
          const now = Date.now();
          const openedAt = ord ? (ord.opened_at || ord.created_at) : null;
          const minutes = openedAt ? Math.round((now - new Date(openedAt).getTime()) / 60000) : 0;
          const initials = (ord && ord.waiter_name)
            ? ord.waiter_name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2)
            : '';
          return {
            id:              t.id,
            name:            t.name,
            number:          t.number,
            seats:           t.seats,
            zone_id:         t.zone_id,
            sort_order:      t.sort_order,
            current_order_id: t.current_order_id || null,
            sesion_at:       t.sesion_at || null,
            openedAt:        openedAt || null,
            status:          t.status || 'libre',
            // Sellos por estado: el reloj arranca desde el del estado ACTUAL
            pendiente_pago_at: t.pendiente_pago_at || null,
            esperando_at:      t.esperando_at || null,
            comiendo_at:       t.comiendo_at || null,
            total:           ord ? (ord.total || 0) : 0,
            items_count:     ord ? (itemsCountMap[ord.id] || 0) : 0,
            minutes:         minutes,
            mesero:          _mesero,
            mesero_initials: initials || (_mesero ? _mesero.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2) : ''),
            persons:         ord ? (ord.guests || 0) : 0,
          };
        });
        enriched.sort(function(a, b){ return (a.sort_order != null ? a.sort_order : 9999) - (b.sort_order != null ? b.sort_order : 9999); });
        return enriched;
      }
    } catch(e) {
      console.warn('[ventas-salon] Supabase fetch failed:', e.message || e);
      /* En el ejecutable no hay consola, asi que el error se guarda en la base
         para poder leerlo desde fuera. Solo escribe cuando YA fallo; no cambia
         nada de lo que se ve. */
      try {
        var _sbD = window._pos && window._pos.sb;
        if (_sbD) {
          _sbD.from('pos_diag').insert({
            donde: 'ventas-salon/fetchTables',
            mensaje: String((e && (e.message || e.error_description)) || e).slice(0, 500),
            extra: {
              nombre: e && e.name, codigo: e && e.code, detalle: e && e.details, hint: e && e.hint,
              mesas_local: (baseTables || []).length,
              branch: (window._pos && window._pos.state && window._pos.state.branchId) || null
            }
          }).then(function(){}, function(){});
        }
      } catch (_ignore) {}
    }

    return baseTables;
  }

  async function fetchOrderData(tableId) {
    const sb = window._pos && window._pos.sb;
    if (!sb || !tableId) return { order: null, items: [] };

    // La mesa apunta a su orden activa vía current_order_id (se guarda al
    // enviar a cocina). Preferimos esa orden para NO resucitar órdenes viejas
    // huérfanas que quedaron 'open' y nunca se cerraron.
    const _tRow  = state.tables.find(t => t.id === tableId);
    const _curId = _tRow && _tRow.current_order_id;
    const _libre = _tRow && _tRow.status === 'libre';

    let orders, ordErr;
    if (_curId && !_libre) {
      // Mostrar la orden actual de la mesa TAL CUAL, aunque esté 'paid':
      // en cobro adelantado el pedido se paga primero y sigue en curso
      // (la mesa lo necesita para ver la comanda y entregar los platos).
      // Solo se descarta si está cancelada.
      const r = await sb
        .from('pos_orders')
        .select('id, status, total, subtotal, packaging_fee, created_at, opened_at, waiter_name, guests')
        .eq('id', _curId)
        .not('status', 'eq', 'cancelled')
        .limit(1);
      orders = r.data; ordErr = r.error;
    } else if (!_libre) {
      // Sin current_order_id: fallback conservador a la orden abierta más
      // reciente (excluyendo cerradas) para no resucitar huérfanas.
      const r = await sb
        .from('pos_orders')
        .select('id, status, total, subtotal, packaging_fee, created_at, opened_at, waiter_name, guests')
        .eq('table_id', tableId)
        .not('status', 'eq', 'completed')
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'paid')
        .order('created_at', { ascending: false })
        .limit(1);
      orders = r.data; ordErr = r.error;
    } else {
      // Mesa libre: sin pedido activo.
      orders = []; ordErr = null;
    }

    if (ordErr) { console.error('[ventas-salon] fetchOrderData orders:', ordErr); }
    if (!orders || !orders.length) return { order: null, items: [] };

    const order = orders[0];

    // TODOS los pedidos de esta visita, no solo el que se va a cobrar. Cuando
    // se agrega algo a una mesa ya pagada nace un pedido aparte (asi al cobrar
    // sale solo lo nuevo), pero en pantalla el mesero tiene que seguir viendo
    // la mesa completa.
    let sessionOrders = [order];
    const _ses = _tRow && _tRow.sesion_at;
    if (_ses) {
      const rs = await sb
        .from('pos_orders')
        .select('id, status, total, subtotal, packaging_fee, created_at, paid_amount')
        .eq('table_id', tableId)
        .gte('created_at', _ses)
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'abandoned')
        .order('created_at', { ascending: true });
      if (rs.data && rs.data.length) sessionOrders = rs.data;
    }

    // Sin join a pos_products — evita fallo silencioso si no hay FK definida en Supabase
    const { data: items, error: itemErr } = await sb
      .from('pos_order_items')
      .select('id, order_id, quantity, product_name, name, product_price, unit_price, notes, product_id, selections')
      .in('order_id', sessionOrders.map(o => o.id))
      .order('created_at', { ascending: true });

    if (itemErr) { console.error('[ventas-salon] fetchOrderData items:', itemErr); }

    // Que ronda esta cobrada y cual no, para poder marcarlo en la comanda.
    const _pagadoDe = {};
    sessionOrders.forEach(function (o) {
      const t = Number(o.total) || 0;
      _pagadoDe[o.id] = t > 0 && (Number(o.paid_amount) || 0) >= t - 1;
    });
    (items || []).forEach(function (it) { it._pagado = !!_pagadoDe[it.order_id]; });

    return { order, items: items || [], sessionOrders };
  }

  // ─── Permisos de usuario ─────────────────────────────
  async function fetchUserPerms() {
    const sb   = window._pos && window._pos.sb;
    const user = window._pos && window._pos.state && window._pos.state.user;
    if (!sb || !user) return;

    const role     = user.user_metadata?.role || user.app_metadata?.role || 'mesero';
    state.userRole = role;

    // Nada se oculta: el botón Cobrar SIEMPRE se muestra. El permiso se revisa
    // al TOCARLO (handleAction): si el rol no tiene 'pedidos.cobrar', aparece
    // el PIN de administrador. Cargar los permisos para que estén listos.
    if (typeof window.posPermsReady === 'function') {
      try { await window.posPermsReady(); } catch (e) {}
    }
    state.canCobrar = true;
    //  A quien le suena el timbre de cocina. No se espera: si tarda, lo unico
    //  que pasa es que el primer aviso de la sesion no suene.
    cargarAvisa();
  }

  // ─── Realtime subscription ───────────────────────────
  function subscribeRealtime() {
    const sb = window._pos && window._pos.sb;
    if (!sb) return;

    const _br = window._pos && window._pos.state && window._pos.state.branchId;
    const _fb = _br ? `branch_id=eq.${_br}` : undefined;

    realtimeSub = sb
      .channel('ventas-salon-tables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_tables', filter: _fb }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_orders', filter: _fb }, (payload) => {
        loadData();
        timbreSiEsMio(payload);
        if (payload.eventType === 'UPDATE'
            && payload.new && payload.new.status === 'in_progress'
            && payload.new.id
            && typeof window.posAutoprint === 'function') {
          window.posAutoprint(payload.new.id);
        }
      })
      .subscribe();
  }

  /*  ═══ EL TIMBRE DE "PEDIDO LISTO" ═══════════════════════════════════

      Cuando la cocina marca un pedido listo, alguien tiene que ir por el. Ese
      alguien depende del tipo de pedido y lo decide el restaurante en
      Configuracion -> Operacion: la mesa suele ser del mesero y el domicilio
      del cajero, pero no en todos lados.

      Suena en LA PANTALLA de quien tenga ese rol con sesion abierta: la tablet
      del mesero, el computador de la caja. No hay que instalar nada ni
      registrar aparatos — quien esta trabajando ya esta conectado.

      Si el restaurante no ha configurado nada, no suena. Un timbre que suena
      donde nadie lo espera se apaga el primer dia y ya no vuelve a servir. */
  /*  SE LEE DEL SERVIDOR, NO DE LA COPIA DEL EQUIPO.

      `_getCfg()` lee lo que quedo guardado en ESTE aparato la ultima vez que
      alguien abrio Configuracion. En la tablet del mesero eso puede no haber
      pasado nunca: el timbre no sonaria y no habria forma de saber por que.

      Se pide una vez al arrancar y se guarda en memoria. Si falla, no suena —
      pero no se cae nada: lo que hace el mesero no depende de esto. */
  var _avisaCfg = null;

  async function cargarAvisa() {
    try {
      const sb = window._pos && window._pos.sb;
      const bid = window._pos && window._pos.state && window._pos.state.branchId;
      if (!sb || !bid) return;
      const { data } = await sb.from('branches').select('operacion_config').eq('id', bid).maybeSingle();
      const op = (data && data.operacion_config) || {};
      _avisaCfg = op.cocinaAvisa || {};
    } catch (e) { console.warn('[VS] no se pudo leer a quien avisar:', e && e.message); }
  }

  function _cfgAvisa() {
    if (_avisaCfg) return _avisaCfg;
    //  Mientras llega, sirve la copia del equipo si la hay.
    const cfg = _getCfg() || {};
    return cfg.cocinaAvisa || {};
  }

  function timbreSiEsMio(payload) {
    try {
      if (!payload || payload.eventType !== 'UPDATE') return;
      const n = payload.new, o = payload.old;
      //  Solo el SALTO a listo. Sin comparar con el estado anterior, cualquier
      //  otro cambio del pedido —un pago, una nota— volveria a sonar.
      if (!n || n.estado !== 'listo' || (o && o.estado === 'listo')) return;

      const canal = String(n.channel || '').toLowerCase();
      const zona = canal === 'salon' ? 'salon'
                 : (canal === 'domicilio' || canal === 'whatsapp') ? 'domicilio'
                 : 'llevar';
      const avisa = _cfgAvisa();
      const rolQueVa = String(avisa[zona] || '').trim();
      if (!rolQueVa) return;

      const mio = String(state.userRole || '').toLowerCase();
      if (mio !== rolQueVa.toLowerCase()) return;

      try { window.posTocarTono(avisa.tono || 'campana', avisa.vol == null ? 80 : avisa.vol); } catch (e) {}
      const donde = zona === 'salon' ? 'de una mesa' : zona === 'domicilio' ? 'de domicilio' : 'para llevar';
      if (typeof vsToast === 'function') vsToast('Pedido ' + donde + ' listo en cocina');
    } catch (e) { console.error('[VS] timbre:', e); }
  }

  function unsubscribeRealtime() {
    if (realtimeSub) {
      const sb = window._pos && window._pos.sb;
      if (sb) sb.removeChannel(realtimeSub);
      realtimeSub = null;
    }
  }

  // ─── Supabase — fetch deliveries ────────────────────
  // Inicio del turno de caja actual (pos_sessions abierta). Se usa para que los
  // tableros (domicilios, etc.) muestren SOLO el turno vigente y se reinicien al
  // cerrar y volver a abrir la caja. Cachea 60 s. Si no hay caja abierta, cae a
  // "hoy" para no mostrar todo el histórico.
  var _cajaStartCache = null, _cajaStartAt = 0;
  async function getCajaSessionStart() {
    var now = Date.now();
    if (_cajaStartCache && (now - _cajaStartAt) < 60000) return _cajaStartCache;
    var sb = window._pos && window._pos.sb;
    var branchId = window._pos && window._pos.state && window._pos.state.branchId;
    var start = null;
    try {
      if (sb && branchId) {
        var r = await sb.from('pos_sessions')
          .select('opened_at')
          .eq('branch_id', branchId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1);
        if (r.data && r.data.length && r.data[0].opened_at) {
          start = r.data[0].opened_at;
          /* ══ LA CAJA CUENTA DESDE QUE SE CERRO LA ANTERIOR ═══════════════
             (19-ago, decision de Sergio). Antes contaba desde que se ABRIO, y
             entre el cierre de anoche y la apertura de hoy quedaba un hueco:
             un pedido que entraba a las 6:30 desaparecia de las pantallas en
             cuanto se abria la caja a las 6:40, y su plata no entraba al
             arqueo. **Le paso 4 veces, $246.000** — $205.000 de eso en
             efectivo, plata que entro al cajon sin aparecer en el conteo.

             Ahora el turno arranca donde termino el anterior: lo que llegue
             con la caja cerrada entra a la siguiente al abrirla. Sin huecos.

             Si no hay caja anterior (la primera de todas) se queda en su
             propia apertura: no hay de donde arrancar. */
          try {
            var ant = await sb.from('pos_sessions')
              .select('closed_at')
              .eq('branch_id', branchId)
              .not('closed_at', 'is', null)
              .lte('closed_at', r.data[0].opened_at)
              .order('closed_at', { ascending: false })
              .limit(1);
            if (ant.data && ant.data.length && ant.data[0].closed_at) start = ant.data[0].closed_at;
          } catch (e) { /* se queda con la apertura */ }
        }
      }
    } catch (e) { /* fallback abajo */ }
    if (!start) { var t = new Date(); t.setHours(0, 0, 0, 0); start = t.toISOString(); }
    _cajaStartCache = start; _cajaStartAt = now;
    return start;
  }

  async function fetchDeliveries() {
    var sb = window._pos && window._pos.sb;
    if (!sb) return [];
    var branchId = window._pos && window._pos.state && window._pos.state.branchId;
    try {
      var cajaStart = await getCajaSessionStart();
      /* Las empresas de domicilio, de una vez: la banda de "quien lo llevo"
         necesita su NOMBRE para pintarse, y si llegaran despues se veria un
         instante "Movil 52" a secas y luego "Rappi Service · Movil 52". Se
         piden una sola vez por pantalla y quedan guardadas. */
      try { await vsEmpresas(); } catch (e) {}
      var q = sb.from('pos_orders')
        .select('id, customer_name, channel, total, subtotal, packaging_fee, delivery_fee, paid_amount, payment_method, waiter_name, waiter_id, domiciliario, status, created_at, opened_at, delivery_status, delivered_at, estado, estado_at, cliente_id, notes, domi_movil, domi_empresa_id, origen')
        .eq('channel', 'domicilio')
        .not('status', 'eq', 'cancelled')
        .gte('created_at', cajaStart)
        .order('created_at', { ascending: false })
        .limit(50);
      if (branchId) q = q.eq('branch_id', branchId);
      var result = await q;
      var rows = result.data || [];
      var _vsUsr = await vsUsuarios();
      return rows.map(function(r) {
        /* El reloj cuenta desde el ULTIMO CAMBIO DE ESTADO, no desde que se creo
           el pedido. Antes un domicilio entregado seguia diciendo "1 hora",
           porque sumaba toda la vida del pedido en vez de lo que lleva EN ESO. */
        var createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
        var desdeEstado = r.estado_at ? new Date(r.estado_at).getTime() : createdMs;
        var mins = Math.round((Date.now() - desdeEstado) / 60000);
        var minsTotal = Math.round((Date.now() - createdMs) / 60000);
        // Estado de entrega PERSISTIDO (delivery_status); fallback al status legacy
        var estado = 'preparacion';
        if (r.delivery_status) estado = (r.delivery_status === 'recibido') ? 'preparacion' : r.delivery_status;
        else if (r.delivered_at) estado = 'entregado';
        else if (r.status === 'paid' || r.status === 'completed') estado = 'entregado';
        else if (r.status === 'in_progress') estado = 'camino';
        // Estado de pago REAL: lo abonado (paid_amount — lo llenan el bot al verificar
        // transferencias y los abonos de caja) contra el total del pedido.
        // Contra lo COBRABLE (sin domicilio), no contra el total: si no, todo
        // domicilio en que el cliente pagó solo la comida se ve "a medias".
        var totalNum = parseFloat(r.total) || 0;
        var paidNum  = parseFloat(r.paid_amount) || 0;
        var payStatus = (window.posEstaPagado ? window.posEstaPagado(r)
                          : (r.status === 'paid' || r.status === 'completed')) ? 'pagado'
                      : paidNum > 0 ? 'parcial'
                      : 'pendiente';
        return {
          id: r.id,
          cliente: r.customer_name || 'Sin cliente',
          canal: r.channel || 'whatsapp',
          items: 0,
          total: totalNum,
          subtotal: parseFloat(r.subtotal) || 0,        // solo productos
          empaque:  parseFloat(r.packaging_fee) || 0,
          domiFee:  parseFloat(r.delivery_fee) || 0,
          paidAmount: paidNum,
          estado: estado,
          payStatus: payStatus,
          metodo: r.payment_method || 'efectivo',
          // `waiter_name` es quien TOMO el pedido (cajero o Chat IA), no quien
          // reparte. Estaban confundidos y la tarjeta decia "Domiciliario: Chat IA".
          cajero:       r.waiter_name || _vsUsr[r.waiter_id] || '',
          /* DE DONDE VINO EL PEDIDO. Los que hace el cliente solo, desde la
             app, no tienen cajero — y el espacio donde iria su nombre quedaba
             vacio. Con esto se puede decir quien lo tomo de verdad: la app. */
          origen:       r.origen || '',
          domiciliario: r.domiciliario || '',
          /* El movil de la empresa externa, si el despacho lo anoto
             (20-ago). El nombre de la empresa sale de la lista que cada
             restaurante guarda en Configuracion > Domicilios: aqui decia
             "Rapid" a fuego, que es la que usa El Parche, y se le mostraba
             a todos los restaurantes del sistema. */
          movil: r.domi_movil || '',
          /* QUE EMPRESA lo llevo. No es lo mismo el movil 28 de Rappi que el
             28 de Inter Domiciliarios: el numero solo no identifica a nadie. */
          empresaId: r.domi_empresa_id || '',
          clienteId: r.cliente_id || null,
          min: mins,                 // en el estado actual
          minTotal: minsTotal,       // desde que entro el pedido
          estadoAt: r.estado_at || r.created_at || null,
          /* PARA DONDE VA (19-ago, pedido de Sergio). Estando en la pantalla de
             domicilios le tocaba irse hasta el chat a mirar la direccion. Vive
             en las notas del pedido, que ya se traian para otras cosas. */
          notas: r.notes || '',
        };
      });
    } catch(e) {
      console.warn('[ventas-salon] fetchDeliveries error:', e.message || e);
      return [];
    }
  }

  // ─── Data loading ─────────────────────────────────────
  async function loadData() {
    // El mapa de productos se necesita para desglosar el empaque por linea.
    // Va dentro del mismo Promise.all para no agregar una espera.
    /* allSettled, no all: cada carga responde por si misma. Con Promise.all,
       si una sola fallaba no se asignaba ninguna y el render() de abajo ni se
       ejecutaba — la pantalla se quedaba con el plano instantaneo, que tiene
       todas las mesas en 'libre'. Asi es como dos pedidos de mesa reales se
       vieron como mesas libres toda una noche. Ahora lo que llega se pinta, y
       lo que falla solo se queda sin actualizar su parte. */
    const _res = await Promise.allSettled([
      fetchTables(), fetchDeliveries(), fetchQuickOrders(), fetchQuickDeliveredCount(), vsProdMapCargar()
    ]);
    const _ok = function (i, actual) {
      if (_res[i] && _res[i].status === 'fulfilled' && _res[i].value !== undefined) return _res[i].value;
      if (_res[i] && _res[i].status === 'rejected') {
        console.warn('[ventas-salon] carga ' + i + ' fallo:', (_res[i].reason && _res[i].reason.message) || _res[i].reason);
      }
      return actual;
    };
    state.tables              = _ok(0, state.tables);
    state.deliveries          = _ok(1, state.deliveries);
    state.quickOrders         = _ok(2, state.quickOrders);
    state.quickDeliveredCount = _ok(3, state.quickDeliveredCount);

    state.loading = false;
    /* RASTRO: el salon volvio a mostrar todas las mesas libres teniendo los
       datos buenos, y sin ningun error. Se anota que trajo la carga y que quedo
       en pantalla, para verlo escrito la proxima vez en vez de deducirlo. */
    try {
      var _libres = (state.tables || []).filter(function (t) { return t.status === 'libre'; }).length;
      var _tot = (state.tables || []).length;
      if (_tot && _libres === _tot) {
        var _sbD = window._pos && window._pos.sb;
        if (_sbD) _sbD.from('pos_diag').insert({
          donde: 'ventas-salon/todasLibres',
          mensaje: 'Quedaron ' + _tot + ' mesas y TODAS libres tras cargar',
          extra: {
            desde_plano: !!(window.posCache && posCache.leer('salon')),
            mesas: (state.tables || []).map(function (t) { return t.name + ':' + t.status; }).join(' '),
            branch: (window._pos && window._pos.state && window._pos.state.branchId) || null
          }
        }).then(function(){}, function(){});
      }
    } catch (_e) {}
    guardarPlanoSalon();   // para que la próxima vez el salón salga al instante
    if (state.selectedTableId) {
      const { order, items, sessionOrders: _sess } = await fetchOrderData(state.selectedTableId);
      state.currentOrder = order;
      state.orderItems   = items;
      state.sessionOrders = _sess || [];
    }
    render();
    syncMesaTimers(); // C9: sync per-table notification timers
  }

  async function selectTable(tableId) {
    // Tocar la misma mesa cierra el sheet (solo en tablet)
    if (state.selectedTableId === tableId) {
      hideSheet();
      state.selectedTableId = null;
      updateMesaHighlight(null);
      return;
    }
    state.selectedTableId = tableId;
    state.openPax = 2; // reiniciar el selector de personas al elegir otra mesa
    updateMesaHighlight(tableId);
    showSheetLoading(); // muestra "Cargando…" en tablet; no-op en desktop
    const { order, items, sessionOrders } = await fetchOrderData(tableId);
    // Guardia: si el usuario cambió de mesa o cerró el sheet durante el fetch, descartar
    if (state.selectedTableId !== tableId) return;
    state.currentOrder = order;
    state.orderItems = items;
    state.sessionOrders = sessionOrders || [];
    renderRail();          // actualiza el rail de desktop
    updateSheetContent();  // actualiza el sheet de tablet
  }

  // ─── Bottom sheet helpers ─────────────────────────────

  function updateMesaHighlight(selectedId) {
    if (!container) return;
    container.querySelectorAll('.lm-mesa[data-table-id]').forEach(function(btn) {
      const t = state.tables.find(function(t){ return t.id === btn.dataset.tableId; });
      if (!t) return;
      const meta = STATE_META[t.status] || STATE_META.libre;
      const isLibre = t.status === 'libre';
      const isSel = t.id === selectedId;
      btn.style.background = isLibre ? '#fff' : meta.tint;
      btn.style.borderColor = isSel ? meta.color : (isLibre ? '#ECEEF2' : meta.ring);
      btn.style.boxShadow = isSel ? ('0 0 0 3px ' + meta.color + '33') : '';
    });
  }

  function showSheetLoading() {
    const sheet = document.getElementById('vs-bottom-sheet');
    const backdrop = document.getElementById('vs-sheet-backdrop');
    const inner = document.getElementById('vs-sheet-inner');
    if (!sheet) { renderRail(); return; }
    if (inner) inner.innerHTML = '<div class="vs-sheet-loading">Cargando…</div>';
    sheet.classList.add('vs-sheet--open');
    if (backdrop) backdrop.classList.add('vs-sheet-backdrop--visible');
  }

  function _currentRailHTML() {
    if (state.floor === '__domicilios__') return renderDomiRailContent();
    if (state.floor === '__rapidas__') return renderQuickRailContent();
    return renderRailContent();
  }

  function _attachCurrentEvents() {
    if (state.floor === '__domicilios__') attachDomiRailEvents();
    else if (state.floor === '__rapidas__') attachQuickRailEvents();
    else { attachRailEvents(); startLiveTimers(); }
  }

  function updateSheetContent() {
    const inner = document.getElementById('vs-sheet-inner');
    if (!inner) { renderRail(); return; }
    inner.innerHTML = _currentRailHTML();
    _attachCurrentEvents();
  }

  function showSheet() {
    const sheet = document.getElementById('vs-bottom-sheet');
    const backdrop = document.getElementById('vs-sheet-backdrop');
    const inner = document.getElementById('vs-sheet-inner');
    if (!sheet) return;
    if (inner) inner.innerHTML = _currentRailHTML();
    sheet.classList.add('vs-sheet--open');
    if (backdrop) backdrop.classList.add('vs-sheet-backdrop--visible');
    _attachCurrentEvents();
  }

  function hideSheet() {
    const sheet = document.getElementById('vs-bottom-sheet');
    const backdrop = document.getElementById('vs-sheet-backdrop');
    if (sheet) { sheet.classList.remove('vs-sheet--open'); sheet.style.transform = ''; }
    if (backdrop) backdrop.classList.remove('vs-sheet-backdrop--visible');
  }

  function attachSheetSwipeDismiss() {
    const sheet = document.getElementById('vs-bottom-sheet');
    if (!sheet) return;
    var startX = 0;
    var dragging = false;

    sheet.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      dragging = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', function(e) {
      if (!dragging) return;
      var dx = e.touches[0].clientX - startX;
      // Solo permite arrastrar hacia la derecha (para cerrar)
      if (dx > 0) sheet.style.transform = 'translateX(' + dx + 'px)';
    }, { passive: true });

    sheet.addEventListener('touchend', function(e) {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      var dx = e.changedTouches[0].clientX - startX;
      if (dx > 90) {
        hideSheet();
        state.selectedTableId = null;
        state.selectedDomiId = null;
        state.selectedQuickId = null;
        updateMesaHighlight(null);
      } else {
        sheet.style.transform = '';
      }
    }, { passive: true });
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

  function getSelectedTable() {
    return state.tables.find(t => t.id === state.selectedTableId) || null;
  }

  // ─── Render: Full page ───────────────────────────────
  function render() {
    if (!container) return;


    // Get user info from _pos state
    const user = (window._pos && window._pos.state && window._pos.state.user) || {};
    const branch = (window._pos && window._pos.state && window._pos.state.branch) || {};
    const isSalon = state.floor !== '__domicilios__' && state.floor !== '__rapidas__';

    container.innerHTML = `
      <div class="vs-root">
        <div class="vs-sidebar-backdrop${sidebarExpanded ? ' is-visible' : ''}" id="vs-sidebar-backdrop"></div>
        ${renderSidebar(user, branch)}
        <main class="vs-main">
          ${renderTopbar(user)}
          <section class="vs-body vs-body--fullgrid">
            <div class="vs-body-left">
              ${state.floor === '__domicilios__' ? renderDomicilioSummaryRow() : state.floor === '__rapidas__' ? renderQuickSummaryRow() : renderSummaryRow()}
              ${state.floor === '__domicilios__' ? renderDomicilioGrid() : state.floor === '__rapidas__' ? renderQuickGrid() : renderGrid()}
            </div>
            <aside class="vs-rail" id="vs-rail">${state.floor === '__domicilios__' ? renderDomiRailContent() : state.floor === '__rapidas__' ? renderQuickRailContent() : renderRailContent()}</aside>
            <div class="vs-sheet-backdrop" id="vs-sheet-backdrop"></div>
            <div class="vs-bottom-sheet" id="vs-bottom-sheet">
              <div class="vs-sheet-handle" id="vs-sheet-handle"></div>
              <div class="vs-sheet-inner" id="vs-sheet-inner"></div>
            </div>
          </section>
        </main>
      </div>
    `;

    attachEvents();
    if (isSalon && state.selectedTableId) showSheet();
    else if (state.floor === '__domicilios__' && state.selectedDomiId) showSheet();
    else if (state.floor === '__rapidas__' && state.selectedQuickId) showSheet();
  }

  /* EL NOMBRE DEL NEGOCIO, debajo de "Cobra POS".
     `branch.name` llega vacio en algunos arranques (la sede aun no responde) y
     entonces salia "Mi negocio", que no es de nadie. pos-brand.js ya guarda el
     nombre bueno en el equipo: se usa ese antes de rendirse. Se escribe solo el
     nombre —sin "Caja 01"— porque es lo que muestran las demas pantallas. */
  function _negocio(branch) {
    var n = (branch && branch.name) || "";
    if (!n) { try { n = localStorage.getItem("pos.brand.restaurante") || ""; } catch (e) {} }
    return _esc(n) || "Mi negocio";
  }

  // ─── Render: Sidebar ─────────────────────────────────
  function renderSidebar(user, branch) {
    const initials = user.initials || (user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'SA');
    return `
      <aside class="vs-sidebar${sidebarExpanded ? ' vs-sidebar-expanded' : ''}">
        <button class="vs-sidebar-toggle" id="vs-sidebar-toggle" title="${sidebarExpanded ? 'Cerrar menú' : 'Abrir menú'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <!-- EL LOGO VA ESCRITO AQUI, NO SE PINTA DESPUES (22-ago-2026).
             Antes decia la letra "L" y pos-brand.js la reemplazaba por el logo.
             Pero esta barra se REDIBUJA en cada accion (abrir una mesa, avanzar
             un domicilio: render() se llama 15 veces), y cada vez volvia la "L".
             El vigilante que la repintaba se apaga a los 20 segundos a proposito,
             para no gastar procesador — asi que cualquier redibujado despues de
             ese rato dejaba la "L" para siempre. De ahi que Sergio la viera
             "a veces si, a veces no". Escrito de una, no depende de nadie. -->
        <div class="vs-brand-mark">
          <div class="vs-brand-logo" data-brand-done="1" style="background:transparent;box-shadow:none;color:transparent;padding:0;overflow:hidden;max-width:40px;max-height:40px"><img src="assets/brand/cobra-logo.png?v=2" alt="Cobra POS" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit"></div>
          <div>
            <div class="vs-brand-name">Cobra POS</div>
            <div class="vs-brand-sub">${_negocio(branch)}</div>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="M14 3h4l3 5h-7z"/><path d="M21 8v6a2 2 0 0 1-2 2h-1"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></svg>
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
          <div id="vs-fx-chip" style="padding:0 4px"></div>
          <!-- CERRAR SESION.
               En la tablet del mesero esta pantalla es TODO lo que hay: no hay
               escritorio al que volver ni menu de usuario donde buscarlo. Sin
               este boton, quien entra una vez se queda dentro para siempre y
               la unica salida es borrar la aplicacion. -->
          <button class="lm-nav" style="color:#DC2626" data-action="cerrar-sesion">
            <span class="lm-nav-inner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span style="font-weight:600">Cerrar sesión</span>
            </span>
          </button>
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
    const meta  = DELIVERY_META[d.estado] || DELIVERY_META.preparacion;
    const canal = CANAL_META[d.canal] || { label: d.canal, color: '#64748B', bg: '#F1F5F9' };
    const mins  = d.min || 0;
    // "18m aqui" se lee como lo que es: lleva 18 minutos EN ESTE ESTADO.
    const _dur = mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`;
    const timeStr = d.estado === 'entregado' ? _dur : `${_dur} aqui`;
    const isPagado  = d.payStatus === 'pagado';
    const isParcial = d.payStatus === 'parcial';
    const payColor = isPagado ? '#16A34A' : isParcial ? '#C2410C' : '#D97706';
    const payBg    = isPagado ? '#DCFCE7' : isParcial ? '#FFEDD5' : '#FEF3C7';
    const payLabel = isPagado ? 'Pagado'
                   : isParcial ? ('Faltan ' + fmtCurrency(Math.max(0, (d.total||0) - (d.paidAmount||0))))
                   : 'Por pagar';
    const hasNext  = !!DELIVERY_NEXT[d.estado];

    return `
      <button class="lm-mesa vs-domi-card" data-domi-id="${d.id}"
        style="background:${meta.tint};border-color:${meta.ring};height:160px;max-height:160px;min-height:0;overflow:hidden">
        <div class="vs-mesa-header">
          <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
            <span class="vs-state-dot" style="background:${meta.color}"></span>
            ${meta.label}
          </span>
          <span class="vs-time-badge" title="Tiempo en este estado &middot; toca para ver el desglose"
            data-domi-tiempos="${d.id}"
            ${d.estado !== 'entregado' ? `data-timer="${d.estadoAt || new Date(Date.now() - (d.min||0)*60000).toISOString()}"` : ''}>${SVG_CLOCK(10)} <span class="vs-timer-val">${timeStr}</span></span>
        </div>
        <div class="vs-mesa-num-row">
          <div class="vs-mesa-num vs-mesa-num--active" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${d.cliente}</div>
          <span style="font-size:10px;font-weight:600;color:${canal.color};background:${canal.bg};padding:1px 6px;border-radius:4px;flex-shrink:0">${canal.label}</span>
        </div>
        <div class="vs-mesa-footer">
          <div class="vs-mesa-footer-active">
            <div class="vs-mesa-footer-left">
              <span class="vs-mesa-items">${d.items} ítems · <span style="color:${payColor};font-weight:600">${payLabel}</span></span>
            </div>
            <div class="vs-mesa-total">${fmtCurrency(d.total)}</div>
          </div>
        </div>
      </button>
    `;
  }

  // ─── Render: Mesa grid ────────────────────────────────
  function renderGrid() {
    /* Solo se dice "Cargando mesas…" si de verdad no hay mesas que mostrar
       (primera vez en este equipo). Si el plano del salón ya está guardado, se
       dibuja de una y los estados entran encima cuando lleguen. */
    if (state.loading && !state.tables.length) {
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
    // Solo inyectar box-shadow inline cuando está seleccionada (ring de color);
    // el resto lo maneja el CSS para que la sombra de elevación sea visible.
    const selectedStyle = `background:${bgColor};border-color:${borderColor}${isSelected ? `;box-shadow:0 0 0 3px ${meta.color}33` : ''}`;

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
          ${!isLibre ? `<span class="vs-time-badge" data-timer="${vsEstadoDesde(t) || new Date(Date.now() - (t.minutes||0)*60000).toISOString()}">${SVG_CLOCK(10)} <span class="vs-timer-val">${t.minutes || 0} min</span></span>` : ''}
        </div>
        <div class="vs-mesa-num-row">
          <div class="vs-mesa-num ${isLibre ? 'vs-mesa-num--libre' : 'vs-mesa-num--active'}">${numStr}</div>
          ${paxHtml}
        </div>
        <div class="vs-mesa-footer">${footerHtml}</div>
      </button>
    `;
  }


  // ═══════════════════════════════════════════════════════
  // COMANDA DESPLEGABLE (compartida por domicilios, mesas y rápidas)
  // Cerrado: el producto y su total, ya con adiciones y empaque incluidos.
  // Desplegado: precio del producto, cada adición con su valor, y el empaque.
  // ═══════════════════════════════════════════════════════
  /* Los ítems del pedido guardan el producto pero NO su categoría ni el id de
     su presentación, y el empaque se configura justamente por ahí. Se carga
     una vez y se guarda en memoria. Si falla, todo sigue funcionando: el
     empaque simplemente no se desglosa por línea. */
  let _vsProdMap = null;
  async function vsProdMapCargar() {
    if (_vsProdMap) return _vsProdMap;
    const sb = window._pos && window._pos.sb;
    if (!sb) return {};
    try {
      /* De lo guardado en el equipo si esta (`posDatos`, traido una vez al
         abrir el programa). Aqui se necesitan TODOS los productos, tambien los
         apagados: un pedido de hace un rato puede llevar uno que acaban de
         desactivar, y sin su ficha no se sabria traducir la presentacion. Por
         eso se usa `posDatos.productos()` en crudo y no `carta()`, que filtra
         por disponible. */
      let data = null;
      if (window.posDatos) {
        try {
          await posDatos.cargar();
          const g = posDatos.productos();
          if (g && g.length) data = g;
        } catch (e) {}
      }
      if (!data) data = (await sb.from('pos_products').select('id,category_id,presentations')).data;
      const m = {};
      (data || []).forEach(function (pr) { m[pr.id] = pr; });
      _vsProdMap = m;
    } catch (e) { _vsProdMap = {}; }
    return _vsProdMap;
  }
  // La presentación se guarda por NOMBRE en el ítem ("Personal"), y la config
  // del empaque la busca por id: hay que traducir.
  function vsPresId(it) {
    const pr = (_vsProdMap || {})[it && it.product_id];
    const nom = it && it.selections && it.selections.pres;
    if (!pr || !nom) return null;
    const hit = (pr.presentations || []).find(function (x) { return x && x.name === nom; });
    return hit ? hit.id : null;
  }

  function vsEmpaqueCfg() {
    try { return JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}'); }
    catch (e) { return {}; }
  }
  // El empaque solo se puede repartir entre los productos si se cobra POR
  // PRODUCTO (por unidad, específico por producto, o un porcentaje). Si está
  // configurado como un monto único POR PEDIDO no pertenece a ningún plato:
  // en ese caso se muestra abajo, junto a los demás totales.
  function vsEmpaqueEsPorPedido() {
    const c = vsEmpaqueCfg();
    return c.empaqueModo !== 'especifico' && c.empaqueBase === 'pedido' && c.empaqueTipo !== 'porcentaje';
  }
  // Reparte el empaque cobrado entre los productos. El redondeo se ajusta en la
  // última línea para que la suma dé EXACTO lo que se cobró (nunca $1 de más).
  function vsEmpaquePorItem(its, fee) {
    const n = (its || []).length;
    const cero = new Array(n).fill(0);
    if (!n || !fee || vsEmpaqueEsPorPedido()) return cero;
    const cfg = vsEmpaqueCfg();
    const esPct = cfg.empaqueTipo === 'porcentaje';
    /* Modo ESPECIFICO: cada producto tiene su propio empaque configurado, asi
       que se muestra el suyo y NO se reparte nada. Repartir era lo que ponia
       $500 en una salsa que no lleva empaque. */
    if (cfg.empaqueModo === 'especifico' && window.posEmpaqueCalc) {
      const reales = its.map(function (it) {
        const pr = (_vsProdMap || {})[it.product_id] || {};
        const v = window.posEmpaqueCalc([{
          productId: it.product_id || null,
          catId: pr.category_id || null,
          presId: vsPresId(it),
          qty: Number(it.quantity) || 0, unitPrice: Number(it.unit_price) || 0,
        }], { domicilio: true });
        return Number(v) || 0;
      });
      const sumaR = reales.reduce(function (a, b) { return a + b; }, 0);
      // Si no cuadra con lo cobrado (la configuracion cambio despues de crear
      // el pedido) no se inventa un desglose: se deja el empaque en el total.
      return sumaR === Number(fee) ? reales : cero;
    }

    const pesos = its.map(function (it) {
      return esPct ? (Number(it.total) || 0) : (Number(it.quantity) || 0);
    });
    const suma = pesos.reduce(function (a, b) { return a + b; }, 0);
    if (suma <= 0) return cero;
    const out = pesos.map(function (p) { return Math.round(fee * p / suma); });
    out[n - 1] += fee - out.reduce(function (a, b) { return a + b; }, 0);
    return out;
  }
  /* ── QUIEN LLEVO EL DOMICILIO: empresa + movil ──────────────────────────
     Pedido de Sergio, 24-ago-2026: *"no es lo mismo el movil 28 de Rappi que
     el movil 28 de Inter Domiciliarios"*. Antes solo se guardaba el numero, y
     un numero suelto no identifica a nadie: dos empresas pueden tener el mismo.

     El color pasa a morado, el de los puntos (#7C3AED sobre #F5F3FF). Antes
     era verde azulado y no pegaba con nada mas del panel. */

  var _vsEmpresas = null;      // se piden una sola vez por pantalla

  async function vsEmpresas() {
    if (_vsEmpresas) return _vsEmpresas;
    try {
      var sbRef = (window._pos && window._pos.sb) || window.sb;
      var t = window._pos && window._pos.state && window._pos.state.tenantId;
      if (!sbRef || !t) return (_vsEmpresas = []);
      var r = await sbRef.from('pos_domi_empresas').select('id,nombre')
        .eq('tenant_id', t).eq('activa', true).order('nombre');
      _vsEmpresas = (r && r.data) || [];
    } catch (e) { _vsEmpresas = []; }
    return _vsEmpresas;
  }

  /* Lo que se ve en la banda cuando NO se esta editando. */
  window.vsMovilTexto = function (d) {
    if (!d || !d.movil) return '+ Quién lo llevó';
    var e = (_vsEmpresas || []).find(function (x) { return String(x.id) === String(d.empresaId); });
    return e ? (_esc(e.nombre) + ' · Móvil ' + _esc(d.movil)) : ('Lo llevó el Móvil ' + _esc(d.movil));
  };

  window.vsMovilEditar = async function (btn, orderId) {
    if (btn.dataset.editando === '1') return;
    var d = (state.deliveries || []).find(function (x) { return String(x.id) === String(orderId); });
    var actual = (d && d.movil) || '';
    var empActual = (d && d.empresaId) || '';
    var empresas = await vsEmpresas();

    /* ⚠️ EL DESPLEGABLE NO PUEDE IR DENTRO DEL BOTON.
       Asi lo hice primero y no funcionaba: un <select> dentro de un <button>
       es HTML invalido, y el navegador se traga la interaccion — ni salia la
       manito ni se abria la lista; el clic lo atrapaba el boton y cerraba el
       panel. Lo reporto Sergio.

       Ahora el boton se ESCONDE y en su lugar se pone un <div> hermano con los
       dos campos. Al guardar, el div se va y el boton vuelve. */
    var caja = document.createElement('div');
    caja.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:4px 0 0;'
      + 'padding:4px 10px;border-radius:8px;background:#F5F3FF;font-size:12px;font-weight:700;'
      + 'color:#7C3AED;font-family:inherit';

    var campo = 'border:1px solid #DDD6FE;border-radius:6px;background:#fff;font:inherit;'
              + 'font-weight:600;color:#0F172A;outline:none;padding:3px 6px;cursor:pointer';
    var partes = '';
    if (empresas.length) {
      partes += '<select style="' + campo + ';max-width:130px">'
        + '<option value="">Empresa…</option>'
        + empresas.map(function (e) {
            return '<option value="' + _esc(e.id) + '"'
              + (String(e.id) === String(empActual) ? ' selected' : '') + '>' + _esc(e.nombre) + '</option>';
          }).join('')
        + '</select>';
    }
    partes += '<span>Móvil</span><input inputmode="numeric" maxlength="6" value="' + _esc(actual) + '"'
      + ' style="' + campo + ';width:54px;cursor:text" placeholder="27">';
    caja.innerHTML = partes;

    btn.dataset.editando = '1';
    btn.style.display = 'none';
    btn.parentNode.insertBefore(caja, btn);

    var inp = caja.querySelector('input');
    var sel = caja.querySelector('select');
    inp.focus(); inp.select();

    /* Nada de lo que pase aqui dentro llega al panel: sin esto, cualquier clic
       —incluido abrir la lista— lo cierra. Se frena tambien `mousedown`,
       porque es el que dispara el cierre ANTES de que llegue el clic. */
    ['click', 'mousedown', 'touchstart'].forEach(function (ev) {
      caja.addEventListener(ev, function (e) { e.stopPropagation(); });
    });

    var guardado = false;
    async function guardar() {
      if (guardado) return; guardado = true;
      var v = (inp.value || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 6);
      var emp = sel ? (sel.value || '') : empActual;
      if (d) { d.movil = v; d.empresaId = emp; }

      caja.remove();
      btn.style.display = '';
      delete btn.dataset.editando;
      btn.innerHTML = window.vsMovilTexto(d || { movil: v, empresaId: emp });
      btn.style.color = v ? '#7C3AED' : '#94A3B8';
      btn.style.background = v ? '#F5F3FF' : '#F1F5F9';

      try {
        var sbRef = (window._pos && window._pos.sb) || window.sb;
        var r = await sbRef.from('pos_orders')
          .update({ domi_movil: v || null, domi_empresa_id: emp || null })
          .eq('id', orderId);
        if (r && r.error) console.error('[ventas] movil:', r.error.message);
      } catch (e) { console.error('[ventas] movil:', e); }
    }

    /* Se guarda al salir de TODA la caja, no de un campo: pasar del
       desplegable al numero no puede cerrar la edicion. El respiro de 120 ms
       deja que el foco aterrice en el otro campo antes de decidir. */
    function quizaGuardar() {
      setTimeout(function () {
        if (!caja.isConnected) return;
        if (caja.contains(document.activeElement)) return;   // sigue adentro
        guardar();
      }, 120);
    }
    inp.addEventListener('blur', quizaGuardar);
    if (sel) sel.addEventListener('blur', quizaGuardar);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); guardar(); }
      if (e.key === 'Escape') { guardado = true; caja.remove(); btn.style.display = ''; delete btn.dataset.editando; }
    });
    if (sel) sel.addEventListener('change', function () { inp.focus(); inp.select(); });
  };

  // Adiciones del ítem (selections.mods) → [{name, price, qty}]
  function vsAdiciones(it) {
    const mods = (it && it.selections && it.selections.mods) || {};
    const out = [];
    for (const k in mods) {
      const m = mods[k] || {};
      const p = Number(m.price) || 0;
      if (m.name || p > 0) out.push({ name: m.name || 'Adición', price: p, qty: Number(m.qty) || 1 });
    }
    return out;
  }
  /* Quien atendio y, si lo hay, quien reparte. Son dos personas distintas:
     el cajero TOMA el pedido y el domiciliario lo LLEVA. Estaban mezclados
     bajo la etiqueta "Domiciliario", que ademas mostraba "Chat IA" cuando el
     pedido entraba por el bot. El domiciliario solo sale si es interno: del
     externo no sabemos ni el nombre. */
  /* EL LOGO Y EL NOMBRE DEL RESTAURANTE, para los pedidos de la app.
     Los guarda pos-brand.js en este equipo, asi que no hay que salir a la red
     para pintarlos. Si todavia no estan (equipo recien estrenado), se cae al
     nombre de la sucursal y a la letra inicial, que es lo que ya hacia. */
  function _appMarca() {
    var logo = "", nom = "";
    try { logo = localStorage.getItem("pos.brand.logo") || ""; } catch (e) {}
    try { nom  = localStorage.getItem("pos.brand.restaurante") || ""; } catch (e) {}
    return { logo: logo, nombre: nom };
  }

  function vsQuienRow(cajero, domiciliario, chipHtml, origen) {
    const limpio = function (s) {
      const t = String(s == null ? '' : s).trim();
      if (!t || t === '—' || t === 'Externo' || t.indexOf('@') >= 0) return '';
      return t;
    };
    const caj = limpio(cajero);
    const dom = limpio(domiciliario);
    const fila = function (etiqueta, nombre, chip) {
      return '<div class="vs-mesero-row">'
        + '<div class="lm-avatar lm-avatar-md">' + _esc(nombre[0].toUpperCase()) + '</div>'
        + '<div class="vs-mesero-spacer"><div class="vs-mesero-label">' + etiqueta + '</div>'
        + '<div class="vs-mesero-name">' + _esc(nombre) + '</div></div>'
        + (chip || '') + '</div>';
    };
    /* PEDIDO HECHO DESDE LA APP (23-ago-2026, pedido de Sergio). Aqui no hay
       cajero porque no lo tomo nadie: lo hizo el cliente solo. Antes el hueco
       quedaba vacio y no se sabia de donde habia salido el pedido; ahora dice
       el restaurante con su logo, en el mismo sitio donde iria el cajero. */
    if (!caj && String(origen || "") === "web") {
      var m = _appMarca();
      var nombreApp = m.nombre || "la app";
      var icono = m.logo
        ? '<img src="' + _esc(m.logo) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit">'
        : _esc(nombreApp[0].toUpperCase());
      var filaApp = '<div class="vs-mesero-row">'
        + '<div class="lm-avatar lm-avatar-md" style="overflow:hidden;padding:0">' + icono + '</div>'
        + '<div class="vs-mesero-spacer"><div class="vs-mesero-label">Pedido por la app</div>'
        + '<div class="vs-mesero-name">' + _esc(nombreApp) + '</div></div>'
        + (chipHtml || '') + '</div>';
      return filaApp + (dom ? fila('Domiciliario', dom, '') : '');
    }

    if (!caj && !dom) {
      // Sin ningun nombre no se pinta la banda: quedaba un recuadro gris vacio
      // con el chip flotando dentro. Solo el chip, alineado a la derecha.
      return chipHtml ? '<div style="display:flex;justify-content:flex-end;margin:8px 0 2px">' + chipHtml + '</div>' : '';
    }
    // El chip de pago va con la primera fila, que es la que siempre esta.
    if (caj && dom) return fila('Cajero', caj, chipHtml) + fila('Domiciliario', dom, '');
    if (caj)        return fila('Cajero', caj, chipHtml);
    return fila('Domiciliario', dom, chipHtml);
  }

  /* El metodo de pago SIEMPRE pasa por pos-metodos: esa es la unica regla que
     sabe traducir 'cash' -> "Efectivo" y, sobre todo, que un id interno como
     'pm_q8ybbdpqb' NUNCA se le muestra a nadie. Aqui se pintaba `d.metodo` en
     crudo y el id salia en la comanda del domicilio. */
  function vsMetodoNombre(valor) {
    if (window.posMetodos && typeof window.posMetodos.nombre === 'function') {
      return window.posMetodos.nombre(valor);
    }
    var v = String(valor == null ? '' : valor).trim();
    if (!v || /^pm_[a-z0-9]+$/i.test(v) || v.indexOf('__') === 0) return 'Otros';
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  function vsComandaHTML(its, empaques) {
    if (!its) return '<div class="vs-comanda-empty">Cargando…</div>';
    if (!its.length) return '<div class="vs-comanda-empty">Sin ítems</div>';
    return its.map(function (it, i) {
      const qty   = Number(it.quantity) || 1;
      const unit  = Number(it.unit_price) || 0;
      const linea = Number(it.total) || unit * qty;
      const emp   = (empaques && empaques[i]) || 0;
      const adics = vsAdiciones(it);
      // El precio unitario ya trae las adiciones sumadas: se descuentan para
      // mostrar cuánto vale el producto solo.
      const baseUnit = unit - adics.reduce(function (s, a) { return s + a.price * a.qty; }, 0);
      const uid = 'vscmd_' + i + '_' + String(it.id || '').slice(0, 8);
      let det = '<div class="vs-cmd-row"><span>Producto'
        + (qty > 1 ? ' · ' + qty + ' × ' + fmt(baseUnit) : '')
        + '</span><span>' + fmt(baseUnit * qty) + '</span></div>';
      adics.forEach(function (a) {
        const uds = qty * a.qty;
        det += '<div class="vs-cmd-row is-adic"><span>+ ' + a.name + ' · adición'
          + (uds > 1 ? ' · ' + uds : '') + '</span><span>' + fmt(a.price * uds) + '</span></div>';
      });
      if (emp > 0) det += '<div class="vs-cmd-row"><span>Empaque</span><span>' + fmt(emp) + '</span></div>';
      if (it.notes) det += '<div class="vs-cmd-note">' + it.notes + '</div>';
      return '<div class="vs-cmd" data-cmd="' + uid + '">'
        + '<button class="vs-cmd-head" data-cmd-toggle="' + uid + '">'
        +   '<span class="vs-cmd-chev">›</span>'
        +   '<span class="vs-item-qty">' + qty + '×</span>'
        +   '<span class="vs-item-name">' + (it.name || 'Producto') + '</span>'
        +   (it.pagado ? '<span class="vs-cmd-pagado">pagado</span>' : '')
        +   '<span class="vs-item-price">' + fmt(linea + emp) + '</span>'
        + '</button>'
        + '<div class="vs-cmd-detail">' + det + '</div>'
      + '</div>';
    }).join('');
  }
  // Abrir/cerrar el detalle (delegado: el panel se repinta constantemente).
  if (!window._vsCmdBound) {
    window._vsCmdBound = true;
    document.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-cmd-toggle]');
      if (!b) return;
      const box = b.closest('.vs-cmd');
      if (box) box.classList.toggle('is-open');
    });
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
    const isPagado  = d.payStatus === 'pagado';
    const isParcial = d.payStatus === 'parcial';
    const payColor = isPagado ? '#16A34A' : isParcial ? '#C2410C' : '#D97706';
    const payBg    = isPagado ? '#DCFCE7' : isParcial ? '#FFEDD5' : '#FEF3C7';
    const payLabel = isPagado ? 'Pagado'
                   : isParcial ? ('Abonado ' + fmtCurrency(d.paidAmount||0) + ' · faltan ' + fmtCurrency(Math.max(0, (d.total||0)-(d.paidAmount||0))))
                   : 'Por pagar';
    // Los totales se arman abajo con los valores REALES del pedido
    // (subtotal + empaque + domicilio). Antes aquí había un domicilio fijo
    // de $5.000 de la maqueta y se usaba d.total como "subtotal".
    const hasNext  = !!DELIVERY_NEXT[d.estado];
    const nextLabel = DELIVERY_BTN[d.estado];

    const _cobrarBtn = (!isPagado && state.canCobrar)
      ? `<button class="lm-btn-primary" data-domi-action="cobrar" data-domi-id="${d.id}">Cobrar</button>`
      : '';
    const actionsHtml = hasNext
      ? `<div class="vs-actions">
           <button class="lm-btn-ghost" data-domi-action="print" data-domi-id="${d.id}">Imprimir</button>
           ${_cobrarBtn}
           <button class="lm-btn-primary" data-domi-action="advance" data-domi-id="${d.id}">${nextLabel} →</button>
         </div>`
      : `<div class="vs-actions">
           <button class="lm-btn-ghost" data-domi-action="print" data-domi-id="${d.id}">Imprimir</button>
           ${_cobrarBtn}
           <button class="lm-btn-primary" style="background:#22C55E" data-domi-action="close" data-domi-id="${d.id}">✓ Entregado</button>
         </div>`;

    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Domicilio seleccionado</div>
          <div class="vs-rail-title-row">
            <div class="vs-rail-title-main">
              <h2 class="vs-rail-title" title="${_esc(d.cliente)}" data-nombre-largo="${_esc(d.cliente)}">${d.cliente}</h2>
              ${vsPuntosChip(d, isPagado)}
            </div>
            <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
              <span class="vs-state-dot" style="background:${meta.color}"></span>${meta.label}
            </span>
          </div>
          ${vsDireccionHTML(d)}
        </div>
        <div style="position:relative">
          <button class="lm-icon-sm" data-domi-action="menu" data-domi-id="${d.id}">${SVG_DOTS(14)}</button>
          <div id="vs-domi-menu-${d.id}" hidden style="position:absolute;right:0;top:100%;background:#fff;border:1.5px solid #ECEEF2;border-radius:10px;box-shadow:0 4px 16px rgba(15,23,42,.12);z-index:999;min-width:170px;padding:4px">
            <button data-domi-action="vermapa" data-domi-id="${d.id}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#475569;border-radius:7px;text-align:left" onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background='none'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Ver en el mapa
            </button>
            <button data-domi-action="pasar" data-domi-id="${d.id}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#475569;border-radius:7px;text-align:left" onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background='none'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16H3m0 0 3-3m-3 3 3 3"/><path d="M17 8h4m0 0-3-3m3 3-3 3"/></svg>
              Pasar a otro modo
            </button>
            <button data-domi-action="cancel" data-domi-id="${d.id}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#DC2626;border-radius:7px;text-align:left" onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='none'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cancelar pedido
            </button>
          </div>
        </div>
      </div>

      <div class="vs-rail-fixed-top">
        <div class="vs-info-row">
          <div class="vs-info-cell">
            <div class="vs-info-label">Canal</div>
            <div class="vs-info-value" style="font-size:12px;color:${canal.color}">${canal.label}</div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Tiempo</div>
            <div class="vs-info-value" ${d.estado !== 'entregado' ? `data-timer="${d.estadoAt || new Date(Date.now() - (d.min||0)*60000).toISOString()}"` : ''}><span class="vs-timer-val">${d.min || 0} min</span></div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Ítems</div>
            <div class="vs-info-value">${(state.domiItems[d.id] || []).length || d.items || 0}</div>
          </div>
        </div>
        ${vsQuienRow(d.cajero, d.domiciliario,
            '<span style="font-size:11px;font-weight:600;color:'+payColor+';background:'+payBg+';padding:3px 8px;border-radius:6px">'+payLabel+'</span>', d.origen)}
        ${(function () {
          /* EL MOVIL SE ANOTA AQUI MISMO (20-ago, Sergio despacha desde esta
             pantalla): un toque abre el campo, Enter o salir guarda en
             pos_orders.domi_movil. El mismo dato que el chip del monitor. */
          return '<button type="button" onclick="window.vsMovilEditar(this, &quot;' + d.id + '&quot;)"'
            + ' style="margin:4px 0 0;border:none;cursor:pointer;font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;font-family:inherit;'
            /* Morado, el mismo de los puntos. Antes era verde azulado y no
               pegaba con nada mas del panel. */
            + (d.movil ? 'color:#7C3AED;background:#F5F3FF' : 'color:#94A3B8;background:#F1F5F9') + '">'
            + window.vsMovilTexto(d) + '</button>';
        })()}

      </div>

      <div class="vs-rail-scroll">
        <div class="vs-order-head">
          <div class="vs-order-section-label">Comanda</div>
          ${d.estado === 'preparacion'
            ? `<button class="lm-link" data-domi-action="add-item" data-domi-id="${d.id}">+ Agregar ítem</button>`
            : `<span style="font-size:11px;color:#94A3B8">${vsMetodoNombre(d.metodo)}</span>`}
        </div>
        <div class="vs-order-list">
          ${vsComandaHTML(state.domiItems[d.id], vsEmpaquePorItem(state.domiItems[d.id] || [], d.empaque))}
        </div>
      </div>

      <div class="vs-rail-footer">
        <div class="vs-totals">
          ${(function(){
            // "Pedido" = productos + empaque (eso es la VENTA). El domicilio va
            // aparte y solo suma en el total a cobrar — nunca es venta.
            const _empPedido = vsEmpaqueEsPorPedido() ? d.empaque : 0;
            const _pedido = (d.subtotal || 0) + (d.empaque || 0);
            const _domi   = d.domiFee || 0;
            const _cobrar = d.total || (_pedido + _domi);
            return ''
              + '<div class="vs-total-row"><span>Pedido</span><span>' + fmt(_pedido - _empPedido) + '</span></div>'
              + (_empPedido ? '<div class="vs-total-row"><span>Empaque</span><span>' + fmt(_empPedido) + '</span></div>' : '')
              + (_domi ? '<div class="vs-total-row"><span>Domicilio</span><span>' + fmt(_domi) + '</span></div>' : '')
              + '<div class="vs-total-row vs-total-grand"><span>Total a cobrar</span><span>' + fmt(_cobrar) + '</span></div>';
          })()}
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  /* Quien atiende no siempre queda escrito con nombre: muchos pedidos guardan
     solo el id del usuario (los 19 pedidos rapidos sin nombre SI tenian id).
     Aqui se traduce id -> nombre, una sola vez por carga de pantalla. */
  let _vsUsuariosCache = null;
  async function vsUsuarios() {
    if (_vsUsuariosCache) return _vsUsuariosCache;
    const sb = window._pos && window._pos.sb;
    if (!sb) return {};
    try {
      const r = await sb.from('pos_users').select('auth_user_id, name');
      const m = {};
      (r.data || []).forEach(function (u) { if (u.auth_user_id && u.name) m[u.auth_user_id] = u.name; });
      _vsUsuariosCache = m;
      return m;
    } catch (e) { return {}; }
  }

  // ─── Fetch: Quick Orders ────────────────────────────────
  async function fetchQuickOrders() {
    const sb = window._pos && window._pos.sb;
    if (!sb) return [];
    const branchId = window._pos.state && window._pos.state.branchId;
    const cajaStart = await getCajaSessionStart();
    // #6: NO se filtra por delivered_at. Los pedidos ya entregados de este
    // turno se quedan visibles en estado "Entregado" hasta que se cierre la
    // caja (al cerrar, cajaStart avanza y estos quedan fuera del rango).
    let q = sb.from('pos_orders')
      .select('id, customer_name, turno, total, subtotal, packaging_fee, discount, status, channel, created_at, waiter_name, waiter_id, notes, delivered_at, paid_amount, estado, estado_at, cliente_id, delivery_fee, payment_method')
      .eq('channel', 'rapido')
      .neq('status', 'cancelled')
      .gte('created_at', cajaStart)
      .order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) { console.error('[VS] fetchQuickOrders:', error); return []; }
    // Estado derivado: si ya se entregó, se muestra como "entregado".
    const _vsUsr = await vsUsuarios();
    return (data || []).map(function (o) {
      if (o.delivered_at) o.status = 'entregado';
      // Muchos pedidos rapidos guardaron solo el id de quien atendio, sin el
      // nombre: por eso la fila del cajero salia en blanco.
      if (!o.waiter_name && o.waiter_id && _vsUsr[o.waiter_id]) o.waiter_name = _vsUsr[o.waiter_id];
      return o;
    });
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
          <p class="vs-empty-desc">Indica el número de personas antes de abrir la mesa.</p>
          <div class="vs-guests-picker">
            <span class="vs-guests-label">Personas</span>
            <div class="vs-guests-controls">
              <button class="vs-guests-btn" data-pax-action="minus">−</button>
              <span class="vs-guests-val" data-pax-val>${state.openPax || 2}</span>
              <button class="vs-guests-btn" data-pax-action="plus">+</button>
            </div>
          </div>
          <div class="vs-empty-btn-row">
            <button class="lm-btn-primary" style="width:100%" data-action="open-table" data-table-id="${mesa.id}">Abrir mesa ${numStr}</button>
            <button class="lm-btn-ghost" style="width:100%" data-action="reserve-table" data-table-id="${mesa.id}">Reservar mesa</button>
          </div>
        </div>
      `;
    }

    const ord = state.currentOrder;
    const subtotal = ord?.total || mesa.total || 0;
    // La propina NO es fija: sale de la configuración del restaurante. Estaba
    // escrito 10% a fuego, así que el panel la sumaba al total aunque el
    // restaurante la tuviera apagada — mostrando un total que no se iba a cobrar.
    const _cfgProp = vsEmpaqueCfg();
    const _propOn  = _cfgProp.propinaActiva !== false;
    const _propPct = Number(_cfgProp.propinaPct);
    const servicio = _propOn ? Math.round(subtotal * ((isFinite(_propPct) ? _propPct : 10) / 100)) : 0;
    const _propLbl = 'Servicio ' + (isFinite(_propPct) ? _propPct : 10) + '%';
    const total = subtotal + servicio;
    // Lo de las rondas ya cobradas. Sin separarlo, el "Total" del panel diria
    // solo lo que falta por cobrar y pareceria que la mesa consumio menos.
    const _yaPagado = (state.sessionOrders || [])
      .filter(o => o.id !== (ord && ord.id))
      .reduce((s, o) => {
        const t = Number(o.total) || 0;
        return s + ((t > 0 && (Number(o.paid_amount) || 0) >= t - 1) ? t : 0);
      }, 0);
    const _totalMesa = _yaPagado + total;
    const waiterName = ord?.waiter_name || mesa.mesero || '—';
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

    // Comanda desplegable: cerrado el producto con su total, desplegado el
    // detalle (producto, adiciones y empaque). Mismo componente que domicilios.
    const _mesaEmp   = parseFloat(ord?.packaging_fee) || 0;
    const _mesaItems = state.orderItems.map(it => ({
      id: it.id, name: it.product_name || it.name || '—',
      quantity: it.quantity, unit_price: it.product_price || it.unit_price || 0,
      total: (it.product_price || it.unit_price || 0) * it.quantity,
      notes: it.notes, selections: it.selections, product_id: it.product_id,
      pagado: !!it._pagado,
    }));
    const itemsHtml = state.orderItems.length
      ? vsComandaHTML(_mesaItems, vsEmpaquePorItem(_mesaItems, _mesaEmp))
      : `<div class="vs-comanda-empty">Sin ítems registrados</div>`;

    const canCobrar = state.canCobrar;

    const actionsHtml = isPendientePago
      ? `<div class="vs-pending-notice">
           ${SVG_DOLLAR(14)} <span>Esperando cobro — pedido en preparación</span>
         </div>
         <div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           ${canCobrar ? `<button class="lm-btn-primary vs-cobrar-btn" data-action="cobrar" data-table-id="${mesa.id}">
             ${SVG_DOLLAR(14)} Cobrar y enviar a cocina
           </button>` : ''}
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
             ${canCobrar ? `<button class="lm-btn-primary" data-action="collect" data-table-id="${mesa.id}">Cobrar</button>` : ''}
           </div>`
      : mesa.status === 'esperando' && state.cobroAdelantado
      ? `<div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
           ${canCobrar ? `<button class="lm-btn-primary vs-cobrar-disabled" data-action="collect" data-table-id="${mesa.id}" disabled>Cobrar</button>` : ''}
         </div>`
      : mesa.status === 'esperando'
      ? `<div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
           ${canCobrar ? `<button class="lm-btn-primary" data-action="collect" data-table-id="${mesa.id}">Cobrar</button>` : ''}
         </div>`
      : `<div class="vs-actions">
           <button class="lm-btn-ghost" data-action="print" data-table-id="${mesa.id}">Imprimir</button>
           <button class="lm-btn-ghost" data-action="split" data-table-id="${mesa.id}">Dividir cuenta</button>
           ${canCobrar ? `<button class="lm-btn-primary" data-action="collect" data-table-id="${mesa.id}">Cobrar</button>` : ''}
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
        <button class="lm-icon-sm" data-action="mesa-dots" data-table-id="${mesa.id}">${SVG_DOTS(14)}</button>
      </div>
      ${mesa.status === 'esperando'
        ? `<button class="vs-rail-entregue-btn" data-action="mark-entregado" data-table-id="${mesa.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Ya entregué los platos
          </button>`
        : ''}

      <div class="vs-rail-fixed-top">
        <div class="vs-info-row">
          <div class="vs-info-cell">
            <div class="vs-info-label">Personas</div>
            <div class="vs-info-value vs-pax-display" id="vs-pax-detail">
              <span>${guests || '—'}</span>
              <button class="vs-pax-edit-btn" data-action="edit-personas" data-table-id="${mesa.id}" data-pax-current="${guests || 0}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Tiempo</div>
            <div class="vs-info-value vs-timer-click ${minutesElapsed > 60 ? 'vs-info-value--alert' : ''}" data-timer="${vsEstadoDesde(mesa) || openedAt || new Date(Date.now() - minutesElapsed*60000).toISOString()}" data-timer-alert="60" data-tiempos="${mesa.id}" title="Ver el desglose por estado"><span class="vs-timer-val">${minutesElapsed} min</span></div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Ítems</div>
            <div class="vs-info-value">${mesa.items_count || state.orderItems.length || '—'}</div>
          </div>
        </div>
        <div class="vs-mesero-row">
          <div class="lm-avatar lm-avatar-md">${waiterInitials}</div>
          <div class="vs-mesero-spacer">
            <div class="vs-mesero-label">Mesero asignado</div>
            <div class="vs-mesero-name">${_esc(waiterName)}</div>
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
          <div class="vs-total-row"><span>Pedido</span><span>${fmt(subtotal - (vsEmpaqueEsPorPedido() ? _mesaEmp : 0))}</span></div>
          ${vsEmpaqueEsPorPedido() && _mesaEmp ? `<div class="vs-total-row"><span>Empaque</span><span>${fmt(_mesaEmp)}</span></div>` : ''}
          ${servicio ? `<div class="vs-total-row"><span>${_propLbl}</span><span>${fmt(servicio)}</span></div>` : ''}
          ${_yaPagado ? `<div class="vs-total-row"><span>Ya pagado</span><span>${fmt(_yaPagado)}</span></div>` : ''}
          <div class="vs-total-row vs-total-grand"><span>${_yaPagado ? 'Por cobrar' : 'Total'}</span><span>${fmt(total)}</span></div>
          ${_yaPagado ? `<div class="vs-total-row vs-total-mesa"><span>Total de la mesa</span><span>${fmt(_totalMesa)}</span></div>` : ''}
        </div>
        ${actionsHtml}
      </div>
    `;
  }


  async function fetchQuickDeliveredCount() {
    const sb = window._pos && window._pos.sb;
    if (!sb) return 0;
    const branchId = window._pos.state && window._pos.state.branchId;
    const cajaStart = await getCajaSessionStart();
    let q = sb.from('pos_orders')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'rapido')
      .neq('status', 'cancelled')
      .gte('created_at', cajaStart)
      .not('delivered_at', 'is', null);
    if (branchId) q = q.eq('branch_id', branchId);
    const { count, error } = await q;
    if (error) return 0;
    return count || 0;
  }

  // ─── Render: Quick Orders ────────────────────────────
  function renderQuickSummaryRow() {
    const active = state.quickOrders.filter(o => o.status !== 'paid' && o.status !== 'entregado');
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
    const _qEmp = parseFloat(o.packaging_fee) || 0;   // empaque cobrado en esta venta
    const hora = new Date(o.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    /* "Pagado" NO es solo status==='paid': al entregar, el estado pasa a
       'entregado' y se perdia el pagado. Se mira lo que de verdad se cobro. */
    const _qPagado = isPaid || ((Number(o.paid_amount) || 0) >= total - 1 && total > 0);
    /* El reloj cuenta desde el ultimo cambio de estado, igual que el domicilio
       (no desde que se creo el pedido). */
    const _qDesde = o.estado_at || o.created_at;
    const _qMin = Math.max(0, Math.round((Date.now() - new Date(_qDesde).getTime()) / 60000));

    const isPendientePagoQ = o.status === 'pendiente_pago';
    const isEntregadoQ = o.status === 'entregado';
    let actionsHtml;
    if (isEntregadoQ) {
      // Pedido ya entregado. Si además está PAGADO → solo iniciar otra venta.
      // Si está entregado pero SIN pagar (p.ej. pedidos del chat que se marcaron
      // "Ya entregué" sin haberse cobrado), igual debe poder COBRARSE.
      const _pagadoE = (Number(o.paid_amount) || 0) >= total && total > 0;
      actionsHtml = _pagadoE
        ? `<div class="vs-actions">
          <button class="lm-btn-ghost" data-action="quick-nueva" data-quick-id="${o.id}">Nueva venta</button>
        </div>`
        : `<div class="vs-actions">
          <button class="lm-btn-ghost" data-action="quick-nueva" data-quick-id="${o.id}">Nueva venta</button>
          <button class="lm-btn-primary vs-cobrar-btn" data-action="quick-cobrar" data-quick-id="${o.id}">Cobrar</button>
        </div>`;
    } else if (isPaid) {
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
    } else if ((Number(o.paid_amount) || 0) >= total && total > 0) {
      // Ya fue pagado DE VERDAD (cobro adelantado directo = status 'paid', o
      // transferencia verificada por el bot que registró paid_amount): solo entregar.
      // OJO: NO basarse en state.cobroAdelantado, porque los pedidos creados desde
      // el CHAT quedan 'open' con paid_amount 0 (sin pagar) y deben mostrar "Cobrar".
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

    /* IMPRIMIR VA SIEMPRE, EN TODAS LAS RAMAS (22-ago-2026).

       Sergio: "si hay un pedido que recibió Paco para llevar no aparece el
       botón de imprimir. Solo pasa si lo recibió Paco". Y era exacto: de las
       CINCO ramas de botones de aquí arriba, Imprimir estaba escrito en UNA
       sola — la de status igual a 'paid'.

       Por qué justo los de Paco: un pedido que toma el asistente queda en
       'open' con el pago YA registrado en paid_amount (no pasa por la caja),
       así que cae en la rama de "pagado de verdad" y no en la de 'paid'.
       Los del cajero sí quedan 'paid' y por eso a esos sí les salía.

       En MESAS y en DOMICILIOS el botón está en TODAS las ramas: esa es la
       regla del sistema —una comanda siempre se puede imprimir, sin importar
       cómo se pagó— y aquí faltaba. Se pone en UN SOLO SITIO, igual que el
       botón de avanzar estado, para que la próxima rama que alguien agregue
       lo tenga sola y esto no se pueda volver a olvidar. */
    actionsHtml = actionsHtml.replace(
      '<div class="vs-actions">',
      '<div class="vs-actions">' +
      '<button class="lm-btn-ghost" data-action="quick-print" data-quick-id="' + o.id + '">Imprimir</button>');

    // El boton de avanzar estado va con los demas botones, no suelto arriba.
    const _avanzar = quickEstadoControl(o);
    if (_avanzar) actionsHtml = actionsHtml.replace('<div class="vs-actions">', '<div class="vs-actions">' + _avanzar);

    return `
      <div class="vs-rail-head">
        <div>
          <div class="vs-eyebrow">Pedido rápido</div>
          <div class="vs-rail-title-row">
            <div class="vs-rail-title-main">
              <h2 class="vs-rail-title" title="${_esc(titulo)}" data-nombre-largo="${_esc(titulo)}">${titulo}</h2>
              ${vsPuntosChip({ id: o.id, clienteId: o.cliente_id, cliente: titulo,
                               subtotal: o.subtotal, empaque: o.packaging_fee,
                               total: total, domiFee: o.delivery_fee }, _qPagado)}
            </div>
            <span class="vs-state-pill" style="color:${meta.color};background:${meta.tint}">
              <span class="vs-state-dot" style="background:${meta.color}"></span>
              ${meta.label}
            </span>
          </div>
        </div>
        <!-- Los mismos tres puntos que en la mesa: un pedido para llevar
             tambien se puede volver de mesa o de domicilio. -->
        <button class="lm-icon-sm" data-action="quick-pasar" data-orden-id="${o.id}">${SVG_DOTS(14)}</button>
      </div>
      <div class="vs-rail-fixed-top">
        <div class="vs-info-row">
          <div class="vs-info-cell">
            <div class="vs-info-label">Canal</div>
            <div class="vs-info-value" style="font-size:12px">Venta rápida</div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Tiempo</div>
            <div class="vs-info-value" title="En este estado desde las ${hora}"
              ${isEntregadoQ ? '' : `data-timer="${_qDesde}"`}><span class="vs-timer-val">${_qMin} min</span></div>
          </div>
          <div class="vs-info-cell">
            <div class="vs-info-label">Ítems</div>
            <div class="vs-info-value">${(state.quickItems[o.id] || []).length || 0}</div>
          </div>
        </div>
        ${(function () {
          const _pagQ = Number(o.paid_amount) || 0;
          const _okQ  = _qPagado || (total > 0 && _pagQ >= total);
          const _parQ = !_okQ && _pagQ > 0;
          const _col  = _okQ ? '#16A34A' : _parQ ? '#C2410C' : '#D97706';
          const _bg   = _okQ ? '#DCFCE7' : _parQ ? '#FFEDD5' : '#FEF3C7';
          const _lbl  = _okQ ? 'Pagado'
                      : _parQ ? ('Abonado ' + fmt(_pagQ) + ' · faltan ' + fmt(Math.max(0, total - _pagQ)))
                      : 'Por pagar';
          const _chip = '<span style="font-size:11px;font-weight:600;color:' + _col + ';background:' + _bg + ';padding:3px 8px;border-radius:6px">' + _lbl + '</span>';
          return vsQuienRow(o.waiter_name, '', _chip);
        })()}
      </div>

      <div class="vs-rail-scroll">
        ${(function () {
          /* Las notas se limpian de los marcadores internos ([etq:...],
             [tel:...], [barrio:...]) que el sistema mete para uso propio: al
             operador le salia "[etq:ESPERAN]" en pantalla. */
          const _n = vsNotasLimpias(o.notes);
          return _n ? `<div class="vs-order-nota">${_n}</div>` : '';
        })()}
        <div class="vs-order-head">
          <div class="vs-order-section-label">Comanda</div>
          ${!isEntregadoQ
            ? `<button class="lm-link" data-action="quick-add-item" data-quick-id="${o.id}">+ Agregar ítem</button>`
            : `<span style="font-size:11px;color:#94A3B8">${_esc(o.payment_method || '')}</span>`}
        </div>
        <div class="vs-order-list">
          ${vsComandaHTML(state.quickItems[o.id], vsEmpaquePorItem(state.quickItems[o.id] || [], _qEmp))}
        </div>
      </div>

      <div class="vs-rail-footer">
        <div class="vs-totals">
          <div class="vs-total-row"><span>Pedido</span><span>${fmt(subtotal + (vsEmpaqueEsPorPedido() ? 0 : _qEmp))}</span></div>
          ${vsEmpaqueEsPorPedido() && _qEmp ? `<div class="vs-total-row"><span>Empaque</span><span>${fmt(_qEmp)}</span></div>` : ''}
          ${descuento ? `<div class="vs-total-row"><span>Descuento</span><span>-${fmt(descuento)}</span></div>` : ''}
          <div class="vs-total-row vs-total-grand"><span>Total a cobrar</span><span>${fmt(total)}</span></div>
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  // ─── Events ───────────────────────────────────────────
  function attachEvents() {
    if (!container) return;

    // Sidebar toggle (tablet overlay)
    const sidebarToggle = document.getElementById('vs-sidebar-toggle');
    if (sidebarToggle) sidebarToggle.addEventListener('click', () => {
      sidebarExpanded = !sidebarExpanded;
      const sidebar = container.querySelector('.vs-sidebar');
      const backdrop = document.getElementById('vs-sidebar-backdrop');
      if (sidebar) sidebar.classList.toggle('vs-sidebar-expanded', sidebarExpanded);
      if (backdrop) backdrop.classList.toggle('is-visible', sidebarExpanded);
      sidebarToggle.title = sidebarExpanded ? 'Cerrar menú' : 'Abrir menú';
    });
    const sidebarBackdrop = document.getElementById('vs-sidebar-backdrop');
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => {
      sidebarExpanded = false;
      const sidebar = container.querySelector('.vs-sidebar');
      if (sidebar) sidebar.classList.remove('vs-sidebar-expanded');
      sidebarBackdrop.classList.remove('is-visible');
    });

    // Sheet backdrop: cerrar al tocar fuera del panel
    const sheetBackdrop = document.getElementById('vs-sheet-backdrop');
    if (sheetBackdrop) sheetBackdrop.addEventListener('click', () => {
      hideSheet();
      state.selectedTableId = null;
      state.selectedDomiId = null;
      state.selectedQuickId = null;
      updateMesaHighlight(null);
    });

    // Swipe hacia la derecha para cerrar el drawer lateral en tablet
    attachSheetSwipeDismiss();

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

    // Chip de puntos: abre el detalle sin seleccionar la tarjeta.
    container.querySelectorAll('[data-pts-domi]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        vsPuntosDetalle(el.getAttribute('data-pts-domi'));
      });
    });

    /* Nombre recortado: si no cabe en una línea, al tocarlo se ve completo.
       Se marca solo cuando de verdad está cortado, para no dar un cursor de
       "tocable" a un nombre que ya se lee entero. */
    container.querySelectorAll('.vs-rail-title[data-nombre-largo]').forEach(function (el) {
      if (el.scrollWidth > el.clientWidth + 1) {
        el.classList.add('is-cortado');
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          vsAviso('Cliente', _esc(el.getAttribute('data-nombre-largo')));
        });
      }
    });

    // El reloj de la tarjeta abre el desglose por estado (no selecciona la tarjeta).
    container.querySelectorAll('[data-domi-tiempos]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        vsDomiTiempos(el.getAttribute('data-domi-tiempos'));
      });
    });

    // Domicilio cards: click selects + shows rail (desktop) + drawer (tablet)
    container.querySelectorAll('.vs-domi-card').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.selectedDomiId === btn.dataset.domiId) {
          hideSheet();
          state.selectedDomiId = null;
          const rail = document.getElementById('vs-rail');
          if (rail) rail.innerHTML = renderDomiRailEmpty();
          return;
        }
        state.selectedDomiId = btn.dataset.domiId;
        const rail = document.getElementById('vs-rail');
        if (rail) { rail.innerHTML = renderDomiRailContent(); attachDomiRailEvents(); }
        showSheet();
        container.querySelectorAll('.vs-domi-card').forEach(c => {
          const m = DELIVERY_META[state.deliveries.find(x=>x.id===c.dataset.domiId)?.estado] || DELIVERY_META.preparacion;
          c.style.boxShadow = c.dataset.domiId === state.selectedDomiId ? `0 0 0 3px ${m.color}33` : 'none';
          c.style.borderColor = c.dataset.domiId === state.selectedDomiId ? m.color : m.ring;
        });
        (async function() {
          const _sb = window._pos && window._pos.sb;
          if (!_sb) return;
          const { data: _items } = await _sb.from('pos_order_items')
            .select('id,name,quantity,unit_price,total,notes,selections,product_id')
            .eq('order_id', btn.dataset.domiId);
          state.domiItems[btn.dataset.domiId] = _items || [];
          if (state.selectedDomiId === btn.dataset.domiId) {
            const _rail = document.getElementById('vs-rail');
            if (_rail) { _rail.innerHTML = renderDomiRailContent(); attachDomiRailEvents(); }
          }
        })();
      });
    });

    // Quick order cards: click selects + shows rail (desktop) + drawer (tablet)
    container.querySelectorAll('.lm-mesa[data-quick-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.selectedQuickId === btn.dataset.quickId) {
          hideSheet();
          state.selectedQuickId = null;
          const rail = document.getElementById('vs-rail');
          if (rail) rail.innerHTML = renderQuickRailEmpty();
          return;
        }
        state.selectedQuickId = btn.dataset.quickId;
        const rail = document.getElementById('vs-rail');
        if (rail) { rail.innerHTML = renderQuickRailContent(); attachQuickRailEvents(); }
        showSheet();
        /* La comanda del pedido rapido se trae igual que la del domicilio.
           Antes este panel NO mostraba los productos —solo el total—, asi que
           no se podia ver que pidio el cliente sin abrir otra pantalla. */
        (async function () {
          const _sb = window._pos && window._pos.sb;
          if (!_sb) return;
          const { data: _items } = await _sb.from('pos_order_items')
            .select('id,name,quantity,unit_price,total,notes,selections,product_id')
            .eq('order_id', btn.dataset.quickId);
          state.quickItems[btn.dataset.quickId] = _items || [];
          if (state.selectedQuickId === btn.dataset.quickId) {
            const _r = document.getElementById('vs-rail');
            if (_r) { _r.innerHTML = renderQuickRailContent(); attachQuickRailEvents(); }
          }
        })();
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

    // Botones +/- del selector de personas en mesa libre.
    // Usamos una función NOMBRADA (no anónima) para que addEventListener la
    // deduplique aunque attachRailEvents corra 2 veces (rail + sheet) — evita
    // el "+2" en escritorio. El valor vive en state.openPax (no en el DOM) y se
    // refleja en TODAS las vistas del contador, evitando el desfase por IDs
    // duplicados entre rail y sheet que dejaba el botón "muerto" en tablet.
    container.querySelectorAll('[data-pax-action]').forEach(function(btn) {
      btn.addEventListener('click', _paxStep);
    });
  }

  function _paxStep(e) {
    e.stopPropagation();
    const dir = e.currentTarget.dataset.paxAction === 'plus' ? 1 : -1;
    state.openPax = Math.max(1, Math.min(30, (state.openPax || 2) + dir));
    if (container) {
      container.querySelectorAll('[data-pax-val]').forEach(function(el) {
        el.textContent = state.openPax;
      });
    }
  }

  function attachQuickRailEvents() {
    if (!container) return;
    container.querySelectorAll('[data-action^="quick-"]').forEach(btn => {
      /*  Una sola escucha por boton, igual que en domicilios: esta funcion se
          llama desde el render completo Y desde el repintado parcial del rail,
          asi que sin la marca el mismo boton acaba con dos. Con acciones que
          preguntan algo, eso se ve: la ventana sale dos veces, una encima de
          la otra. */
      if (btn.dataset.quickBound === '1') return;
      btn.dataset.quickBound = '1';
      btn.addEventListener('click', handleAction);
    });
  }


  function attachDomiRailEvents() {
    if (!container) return;
    container.querySelectorAll('[data-domi-action]').forEach(btn => {
      /* Cada boton se engancha UNA sola vez.
         attachDomiRailEvents() se llama desde dos sitios —el render completo y
         _attachCurrentEvents() del repintado parcial del rail— asi que sin esta
         marca el mismo boton terminaba con DOS escuchas de clic. Un clic corria
         el handler dos veces sobre el MISMO objeto `d`: la primera vuelta
         preguntaba "¿pasa a En camino?" y dejaba d.estado='camino'; la segunda
         leia ese estado ya mutado y preguntaba "¿pasa a Entregado?". De ahi el
         modal de entrega que salia solo. */
      if (btn.dataset.domiBound === '1') return;
      btn.dataset.domiBound = '1';
      btn.addEventListener('click', async () => {
        const action = btn.dataset.domiAction;
        const id = btn.dataset.domiId;
        const d = state.deliveries.find(x => x.id === id);
        if (!d) return;
        if (action === 'menu') {
          const drop = document.getElementById('vs-domi-menu-' + id);
          if (drop) drop.hidden = !drop.hidden;
          return;
        }
        if (action === 'pasar') {
          const dropP = document.getElementById('vs-domi-menu-' + id);
          if (dropP) dropP.hidden = true;
          vsPasarPedido(id, 'domicilio', {});
          return;
        }
        if (action === 'vermapa') {
          const drop0 = document.getElementById('vs-domi-menu-' + id);
          if (drop0) drop0.hidden = true;
          vsMapaAbrir(d);
          return;
        }
        if (action === 'cancel') {
          var _preg = '¿Cancelar el pedido de ' + (d.cliente || id) + '? Esta acción no se puede deshacer.';
          /* El saldo pagado vuelve al cliente (ver pos-saldo.js). */
          var _perm = window.posSaldo
            ? await posSaldo.pedirAnular(id, _preg)
            : (confirm(_preg) ? { devolver: async function(){} } : null);
          if (!_perm) return;
          var sb = window._pos && window._pos.sb;
          if (sb) {
            await sb.from('pos_orders').update({ status: 'cancelled' }).eq('id', id);
            await _perm.devolver();
          }
          state.deliveries = state.deliveries.filter(function(x) { return x.id !== id; });
          state.selectedDomiId = null;
          render();
          return;
        }
        if (action === 'print') {
          if (typeof posOpenPrintModal === 'function') posOpenPrintModal(id);
          else if (typeof toast === 'function') toast('Impresión no disponible');
          return;
        }
        if (action === 'add-item') {
          // Se suma AL MISMO pedido para que salga todo junto. Solo tiene
          // sentido mientras se prepara; si ya salio, se hace uno nuevo.
          window.location.href = 'domicilios.html?agregar=' + encodeURIComponent(id);
          return;
        }
        if (action === 'cobrar') {
          const irCobrarDomi = function () { window.location.href = `pagos.html?order=${id}&channel=domicilio`; };
          if (typeof window.posHasPerm === 'function' && !window.posHasPerm('pedidos.cobrar') && typeof window.posPinPrompt === 'function') {
            window.posPinPrompt('Cobrar requiere permiso de administrador.', irCobrarDomi);
          } else { irCobrarDomi(); }
        } else if (action === 'advance' && DELIVERY_NEXT[d.estado]) {
          const next = DELIVERY_NEXT[d.estado];
          const nextLbl = DELIVERY_BTN[d.estado] || next;
          if (!confirm('¿El pedido pasa a "' + nextLbl + '"?')) return;
          d.estado = next;
          render();
          // Función central: sincroniza con el chat (estado + delivery_status),
          // marca delivered_at si entregado y dispara etiqueta + mensaje al cliente.
          fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/cambiar-estado', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: d.id, estado: next })
          }).then(function(r){ return r.json(); }).then(function(x){ if (x && x.error) console.error('cambiar-estado:', x.error); })
            .catch(function(e){ console.error('cambiar-estado:', e); });
        } else if (action === 'close') {
          if (!confirm('¿Marcar el pedido como "Entregado"?')) return;
          d.estado = 'entregado';
          render();
          fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/cambiar-estado', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: d.id, estado: 'entregado' })
          }).then(function(r){ return r.json(); }).then(function(x){ if (x && x.error) console.error('cambiar-estado:', x.error); })
            .catch(function(e){ console.error('cambiar-estado:', e); });
        }
      });
    });
  }

  // Acción → permiso requerido. Nada se oculta: si el rol no tiene el permiso,
  // se pide el PIN de administrador y la acción procede solo si es correcto
  // (override de gerente desde cualquier cuenta).
  const VS_PERM_ACCION = {
    cobrar:  'pedidos.cobrar',
    collect: 'pedidos.cobrar',
    'open-table': 'pedidos.crear',
    'add-item': 'pedidos.crear',
    'cancelar-pedido-mesa': 'pedidos.anular',
    'quick-cancelar': 'pedidos.anular',
  };
  const VS_PERM_MOTIVO = {
    'pedidos.cobrar':  'Cobrar requiere permiso de administrador.',
    'pedidos.crear':   'Abrir una mesa requiere permiso de administrador.',
    'pedidos.anular':  'Anular un pedido requiere permiso de administrador.',
  };

  function handleAction(e) {
    const el = e.currentTarget;
    const action = el.dataset.action;
    const tableId = el.dataset.tableId;

    const permReq = VS_PERM_ACCION[action];
    if (permReq && typeof window.posHasPerm === 'function' && !window.posHasPerm(permReq) && !e.__pinOk) {
      if (typeof window.posPinPrompt === 'function') {
        // Copiar TODO el dataset (tableId, quickId, etc.) para re-ejecutar igual.
        const ds = Object.assign({}, el.dataset);
        window.posPinPrompt(VS_PERM_MOTIVO[permReq], function () {
          handleAction({ currentTarget: { dataset: ds }, __pinOk: true });
        });
      }
      return;
    }

    switch (action) {
      case 'open-table': {
        const guests = state.openPax || 2;
        window._pos && window._pos.emit && window._pos.emit('table:open', { tableId, guests });
        break;
      }
      case 'reserve-table':
        window._pos && window._pos.emit && window._pos.emit('table:reserve', { tableId });
        break;
      case 'edit-personas': {
        const paxDetail = document.getElementById('vs-pax-detail');
        if (!paxDetail) break;
        const curPax = parseInt(e.currentTarget.dataset.paxCurrent, 10) || state.currentOrder?.guests || 1;
        paxDetail.innerHTML = `
          <div class="vs-pax-edit">
            <button class="vs-guests-btn" id="vs-pax-edit-minus">−</button>
            <span class="vs-pax-edit-val" id="vs-pax-edit-num">${curPax}</span>
            <button class="vs-guests-btn" id="vs-pax-edit-plus">+</button>
            <button class="vs-pax-save" id="vs-pax-save">✓</button>
            <button class="vs-pax-cancel" id="vs-pax-cancel">✕</button>
          </div>`;
        document.getElementById('vs-pax-edit-minus')?.addEventListener('click', function(ev) {
          ev.stopPropagation();
          const n = document.getElementById('vs-pax-edit-num');
          if (n) n.textContent = Math.max(1, (parseInt(n.textContent, 10) || 1) - 1);
        });
        document.getElementById('vs-pax-edit-plus')?.addEventListener('click', function(ev) {
          ev.stopPropagation();
          const n = document.getElementById('vs-pax-edit-num');
          if (n) n.textContent = Math.min(30, (parseInt(n.textContent, 10) || 1) + 1);
        });
        document.getElementById('vs-pax-save')?.addEventListener('click', async function() {
          const newCount = parseInt(document.getElementById('vs-pax-edit-num')?.textContent, 10) || 1;
          const ordId = state.currentOrder && state.currentOrder.id;
          if (ordId) {
            if (window.posSync) {
              await posSync.write('pos_orders', 'update', { guests: newCount }, { id: ordId });
            } else {
              const sbPax = window._pos && window._pos.sb;
              if (sbPax) await sbPax.from('pos_orders').update({ guests: newCount }).eq('id', ordId);
            }
            state.currentOrder = Object.assign({}, state.currentOrder, { guests: newCount });
            const tIdx = state.tables.findIndex(function(t){ return t.id === tableId; });
            if (tIdx >= 0) state.tables[tIdx] = Object.assign({}, state.tables[tIdx], { persons: newCount });
          }
          renderRail(); updateSheetContent();
        });
        document.getElementById('vs-pax-cancel')?.addEventListener('click', function() {
          renderRail(); updateSheetContent();
        });
        break;
      }
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
      case 'mesa-dots': {
        document.querySelectorAll('.vs-dots-menu').forEach(el => el.remove());
        const dotsBtn = e.currentTarget;
        const rect = dotsBtn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'vs-dots-menu';
        /*  ══ MOVER UN PEDIDO QUE YA EXISTE ═════════════════════════

            Sergio, 28-ago-2026. Lo del enlace «Pasar a…» de la comanda solo
            sirve MIENTRAS se toma el pedido. Esto es lo otro: el pedido ya se
            envio, esta en cocina, la gente esta comiendo — y de repente se
            cambian de mesa, o dicen que se lo llevan.

            Va en los tres puntos y no en un boton nuevo porque no es algo de
            todos los dias: los botones grandes de la tarjeta son los de cada
            servicio (imprimir, dividir, cobrar) y meter ahi algo que se usa
            una vez al dia les quita sitio a los que se usan cien.        */
        menu.innerHTML =
          `<button class="vs-dots-menu-item" data-action="mover-mesa" data-table-id="${tableId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16H3m0 0 3-3m-3 3 3 3"/><path d="M17 8h4m0 0-3-3m3 3-3 3"/></svg>Cambiar de mesa</button>` +
          `<button class="vs-dots-menu-item" data-action="mover-modo" data-modo="rapido" data-table-id="${tableId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>Pasar a Para llevar</button>` +
          `<button class="vs-dots-menu-item" data-action="mover-modo" data-modo="domicilio" data-table-id="${tableId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-6l-2-9h-3"/><path d="M9 8.5h7l2 9"/></svg>Pasar a Domicilio</button>` +
          `<button class="vs-dots-menu-item vs-dots-menu-item--danger" data-action="cancelar-pedido-mesa" data-table-id="${tableId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Cancelar pedido</button>`;
        menu.style.cssText = 'top:' + (rect.bottom + 4) + 'px;right:' + (window.innerWidth - rect.right) + 'px;';
        document.body.appendChild(menu);
        menu.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', handleAction));
        setTimeout(() => {
          document.addEventListener('click', function closeDots(ev) {
            if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeDots); }
          });
        }, 0);
        break;
      }
      case 'cancelar-pedido-mesa': {
        document.querySelectorAll('.vs-dots-menu').forEach(el => el.remove());
        const mesaCancel = state.tables.find(t => t.id === tableId);
        const numStrC = mesaCancel ? (mesaCancel.name || String(mesaCancel.number || '')) : tableId;
        vsConfirm({
          title: 'Cancelar pedido',
          msg: '¿Cancelar el pedido de la <strong>Mesa ' + numStrC + '</strong>? El pedido se anulará y la mesa quedará libre.',
          okLabel: 'Sí, cancelar pedido',
          variant: 'danger',
        }).then(async function(ok) {
          if (!ok) return;
          try {
            const sbC = window._pos && window._pos.sb;
            if (!sbC) return;
            const ordId = state.currentOrder?.id || mesaCancel?.current_order_id;
            if (ordId) {
              const { error: ordErr } = await sbC.from('pos_orders').update({ status: 'cancelled' }).eq('id', ordId);
              if (ordErr) throw ordErr;
            }
            const { error: tblErr } = await sbC.from('pos_tables').update({ status: 'libre', current_order_id: null, sesion_at: null }).eq('id', tableId);
            if (tblErr) throw tblErr;
            const tbl = state.tables.find(x => x.id === tableId);
            if (tbl) { tbl.status = 'libre'; tbl.current_order_id = null; }
            state.selectedTableId = null;
            state.currentOrder = null;
            state.orderItems = [];
            render();
            vsToast('Pedido cancelado — mesa liberada');
          } catch(err) {
            vsToast('Error al cancelar: ' + (err.message || String(err)));
          }
        });
        break;
      }
      /*  ⚠️ EL NOMBRE DEL ATRIBUTO ES LO QUE ENGANCHA EL CLIC.

          Este boton nacio como `data-action="pasar-dots"` y no hacia NADA al
          tocarlo. No era el codigo: es que cada pestana engancha los suyos con
          un selector distinto — mesas toma `[data-action]`, venta rapida solo
          los que EMPIEZAN por `quick-`, y domicilios usa otro atributo
          (`data-domi-action`). Un boton con el nombre de otra pestana se pinta
          igual de bien y se queda mudo.

          Por eso este se llama `quick-pasar`: para que el selector de venta
          rapida lo recoja. El de domicilios va por su propio camino, abajo,
          con `data-domi-action="pasar"`.                                  */
      case 'quick-pasar': {
        document.querySelectorAll('.vs-dots-menu').forEach(x => x.remove());
        vsPasarPedido(el.dataset.ordenId, 'rapido', {});
        break;
      }
      case 'mover-mesa': {
        document.querySelectorAll('.vs-dots-menu').forEach(el => el.remove());
        vsMoverDeMesa(tableId);
        break;
      }
      case 'mover-modo': {
        document.querySelectorAll('.vs-dots-menu').forEach(el => el.remove());
        vsMoverDeModo(tableId, el.dataset.modo);
        break;
      }
      case 'liberar-mesa':
        liberarMesa(tableId);
        break;
      case 'free-table':
        window._pos && window._pos.emit && window._pos.emit('table:free', { tableId });
        break;
      case 'print': {
        const mesaPrint = state.tables.find(t => t.id === tableId);
        const printOrderId = mesaPrint && mesaPrint.current_order_id;
        if (printOrderId && typeof posOpenPrintModal === 'function') {
          posOpenPrintModal(printOrderId);
        }
        break;
      }
      case 'split':
        window._pos && window._pos.emit && window._pos.emit('table:split', { tableId });
        break;
      case 'add-item': {
        // Se puede agregar a una mesa ocupada en cualquier estado. Lo nuevo se
        // suma; si la mesa ya pagó (prepago), al cobrar solo aparece lo nuevo.
        window._pos && window._pos.emit && window._pos.emit('table:addItem', { tableId });
        break;
      }
      case 'reassign':
        window._pos && window._pos.emit && window._pos.emit('table:reassign', { tableId });
        break;
      case 'nav-back':
        window._pos && window._pos.emit && window._pos.emit('nav:back');
        break;
      case 'cerrar-sesion':
        /* Se pregunta antes, y con la ventana del producto — nunca la del
           navegador. Un toque sin querer en plena hora pico no puede sacar al
           mesero de la sesion. */
        (async function () {
          const ok = await vsConfirm({
            title: 'Cerrar sesión',
            msg: 'Vas a salir de la cuenta en esta tablet. Para volver a entrar necesitas el usuario y la contraseña.',
            /* `brand` y no `danger`: el icono de `danger` es una caneca de
               basura, y salir de la sesion no borra nada. */
            okLabel: 'Cerrar sesión', variant: 'brand',
          });
          if (!ok) return;
          try { if (window.posCache && window.posCache.limpiar) window.posCache.limpiar(); } catch (e) {}
          try { await window._pos.sb.auth.signOut(); } catch (e) {}
          /* A la misma puerta por la que entro. `mesero-login` es la de las
             tablets; el escritorio entra por `login`. */
          window.location.href = 'mesero-login.html';
        })();
        break;
      case 'nav-rapida':
        (async function() { if (await window.cajaGuard(window._pos && window._pos.state && window._pos.state.branchId)) window.location.href = 'venta-rapida.html'; })();
        break;
      case 'nav-domicilio':
        (async function() { if (await window.cajaGuard(window._pos && window._pos.state && window._pos.state.branchId)) window.location.href = 'domicilios.html'; })();
        break;
      case 'quick-estado': {
        const qsId = e.currentTarget.dataset.quickId;
        const qsNext = e.currentTarget.dataset.estado;
        const nextLbl = (QUICK_ESTADO_META[qsNext] || {}).label || qsNext;
        vsConfirm({ title: 'Cambiar estado', msg: '¿El pedido pasa a "' + nextLbl + '"?', okLabel: 'Sí, cambiar' }).then(function(ok) {
          if (!ok) return;
          const oo = state.quickOrders.find(function(x){ return x.id === qsId; });
          if (oo) { oo.estado = qsNext; if (qsNext === 'entregado') oo.delivered_at = new Date().toISOString(); render(); }
          // Función central: sincroniza con el chat + dispara etiqueta/mensaje al cliente
          fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/cambiar-estado', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: qsId, estado: qsNext })
          }).then(function(r){ return r.json(); }).then(function(x){ if (x && x.error) console.error('cambiar-estado:', x.error); }).catch(function(){});
        });
        break;
      }
      case 'quick-cobrar': {
        const qcId = e.currentTarget.dataset.quickId;
        if (qcId) window.location.href = `pagos.html?order=${qcId}&channel=rapido`;
        break;
      }
      case 'quick-entregar': {
        const qeId = e.currentTarget.dataset.quickId;
        if (qeId) {
          const nowIso = new Date().toISOString();
          // #6: NO se quita la tarjeta. Queda visible en estado "Entregado"
          // hasta que se cierre la caja.
          const oo = state.quickOrders.find(function(x){ return x.id === qeId; });
          if (oo) { oo.status = 'entregado'; oo.estado = 'entregado'; oo.delivered_at = nowIso; }
          render();
          // Función central: marca entregado + delivered_at Y SINCRONIZA la pastilla/
          // etiqueta del chat (antes se escribía delivered_at directo y el chat quedaba
          // con la pastilla vieja, p.ej. "En preparación").
          fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/cambiar-estado', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: qeId, estado: 'entregado' })
          }).then(function(r){ return r.json(); }).then(function(x){ if (x && x.error) console.error('cambiar-estado:', x.error); }).catch(function(){});
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
        }).then(async function(ok) {
          if (!ok) return;
          const sbQX = window._pos && window._pos.sb;
          if (sbQX && qxId) {
            /* Ya preguntó la ventana de arriba. Aquí solo se devuelve el saldo
               —que no es negociable— y se avisa de que se hizo. */
            await sbQX.from('pos_orders').update({ status: 'cancelled' }).eq('id', qxId);
            const _devQX = window.posSaldo ? await posSaldo.devolverDeOrden(qxId) : 0;
            if (_devQX > 0 && typeof toast === 'function') {
              toast('Se le devolvieron ' + posSaldo.money(_devQX) + ' de saldo al cliente');
            }
            state.quickOrders = state.quickOrders.filter(x => x.id !== qxId);
            state.selectedQuickId = null;
            render();
          }
        });
        break;
      }
      case 'quick-print': {
        const _pid = el.dataset.quickId;
        if (_pid && typeof posOpenPrintModal === 'function') posOpenPrintModal(_pid);
        else if (typeof toast === 'function') toast('Impresión no disponible');
        break;
      }
      case 'quick-add-item': {
        // Se suma al MISMO pedido: al cobrar queda pendiente solo lo nuevo.
        const _qid = el.dataset.quickId;
        if (!_qid) break;
        (async function() {
          if (await window.cajaGuard(window._pos && window._pos.state && window._pos.state.branchId)) {
            window.location.href = 'venta-rapida.html?agregar=' + encodeURIComponent(_qid);
          }
        })();
        break;
      }
      case 'quick-nueva':
        (async function() { if (await window.cajaGuard(window._pos && window._pos.state && window._pos.state.branchId)) window.location.href = 'venta-rapida.html'; })();
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
  // Al volver a esta ventana (cambio de pestana/app, o traer el .exe al
  // frente) se relee el valor real de la base: si en otro dispositivo se
  // cambio en Configuracion, aqui se refleja sin recargar.
  let _cobroFocusHooked = false;
  function hookCobroRefresh() {
    if (_cobroFocusHooked) return;
    _cobroFocusHooked = true;
    var refrescar = async function () {
      if (document.hidden) return;
      var antes = state.cobroAdelantado;
      await loadCobroAdelantado();
      if (state.cobroAdelantado !== antes) pintarToggleCobro();
    };
    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', refrescar);
  }

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

  function esRolAdmin(role) {
    return role === 'admin' || role === 'administrador' || role === 'gerente';
  }

  async function toggleCobro() {
    const _posUser = window._pos && window._pos.state && window._pos.state.user;
    const role = (_posUser && (_posUser.user_metadata?.role || _posUser.app_metadata?.role)) || 'mesero';
    // El gerente/admin cambia libre. Cualquier otro rol necesita el PIN de
    // administrador (mismo candado que Configuracion, pero sin salir de Ventas).
    if (esRolAdmin(role)) {
      await aplicarCobro(!state.cobroAdelantado);
    } else {
      _posVSPromptPin('Cambiar el modo de cobro requiere el PIN de administrador.',
        function () { aplicarCobro(!state.cobroAdelantado); });
    }
  }

  async function aplicarCobro(nuevoValor) {
    const sb = window._pos && window._pos.sb;
    state.cobroAdelantado = nuevoValor;
    localStorage.setItem(COBRO_KEY, String(nuevoValor));
    // branches.cobro_adelantado es la fuente de verdad compartida con
    // Configuracion → Operacion. Al escribir aqui, esa pantalla lo vera.
    try {
      const branchId = window._pos && window._pos.state && window._pos.state.branchId;
      if (sb && branchId) {
        await sb.from('branches').update({ cobro_adelantado: nuevoValor }).eq('id', branchId);
      }
    } catch(e) { /* queda en localStorage; se re-sincroniza al volver al foco */ }
    pintarToggleCobro();
  }

  // Refleja el estado actual en el boton del topbar sin re-render completo.
  function pintarToggleCobro() {
    const btn = document.getElementById('vs-cobro-toggle');
    if (!btn) return;
    const on = state.cobroAdelantado;
    btn.className = 'vs-cobro-toggle' + (on ? ' vs-cobro-on' : '');
    btn.title = on ? 'Desactivar cobro adelantado' : 'Activar cobro adelantado';
    const lbl = btn.querySelector('.vs-cobro-label');
    if (lbl) lbl.textContent = on ? 'Cobro adelantado' : 'Cobro al final';
  }

  // Candado de PIN reutilizable: valida contra pos_users.pin (mismo que el
  // modal de moneda) y ejecuta onOk() solo si el PIN es correcto.
  window._posVSPromptPin = function (motivo, onOk) {
    var prev = document.getElementById('vs-pinlock-modal');
    if (prev) prev.remove();
    var ov = document.createElement('div');
    ov.id = 'vs-pinlock-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9200;display:flex;align-items:center;justify-content:center';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:340px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.18)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<div style="font-weight:700;font-size:15px;color:#0F172A">PIN de administrador</div>'
      + '<button id="vs-pinlock-x" style="border:none;background:#F1F5F9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;color:#64748B">&#x2715;</button>'
      + '</div>'
      + '<p style="font-size:12px;color:#64748B;margin-bottom:12px">' + (motivo || 'Esta accion requiere el PIN de administrador.') + '</p>'
      + '<input id="vs-pinlock-input" type="password" inputmode="numeric" maxlength="8" placeholder="••••"'
      + ' style="width:100%;border:1.5px solid #ECEEF2;border-radius:10px;padding:10px 14px;font-size:18px;letter-spacing:4px;text-align:center;outline:none;box-sizing:border-box">'
      + '<p id="vs-pinlock-err" style="color:#EF4444;font-size:12px;margin-top:6px;display:none"></p>'
      + '<button id="vs-pinlock-ok" style="margin-top:12px;width:100%;padding:10px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Confirmar</button>'
      + '</div>';
    document.body.appendChild(ov);
    var inp = document.getElementById('vs-pinlock-input');
    var err = document.getElementById('vs-pinlock-err');
    setTimeout(function(){ if(inp) inp.focus(); }, 50);
    function cerrar(){ ov.remove(); }
    document.getElementById('vs-pinlock-x').addEventListener('click', cerrar);
    ov.addEventListener('click', function(e){ if (e.target === ov) cerrar(); });
    async function validar() {
      var entered = (inp.value || '').trim();
      if (!entered) { err.textContent = 'Ingresa el PIN'; err.style.display = 'block'; return; }
      var sbRef = window._pos && window._pos.sb;
      var branchId = window._pos && window._pos.state && window._pos.state.branchId;
      if (!sbRef) { err.textContent = 'Error de conexion'; err.style.display = 'block'; return; }
      try {
        /* EL PIN NO BAJA AL COMPUTADOR (24-ago-2026). Antes esta pantalla se
           traia el PIN y lo comparaba aqui mismo, asi que cualquiera con la
           consola del navegador podia leerlo — y todos los empleados podian,
           porque la unica regla de `pos_users` deja ver la ficha de los demas.
           Ahora se le manda al servidor lo que escribieron y responde si o no.
           El servidor guarda solo una HUELLA del PIN: ni leyendo la base se
           puede saber cual es. Y lleva freno: 5 fallos por hora y se bloquea. */
        var hay = await sbRef.rpc('fn_pin_existe');
        if (!hay.error && hay.data === false) {
          err.textContent = 'No hay PIN configurado. Ve a Configuracion → Operacion.';
          err.style.display = 'block'; return;
        }
        var r = await sbRef.rpc('fn_pin_verificar', { p_pin: entered, p_accion: 'autorizacion', p_motivo: motivo || null });
        if (r.error) { err.textContent = 'Error al verificar el PIN'; err.style.display = 'block'; return; }
        if (r.data !== true) {
          err.textContent = 'PIN incorrecto'; err.style.display = 'block'; inp.value = ''; inp.focus(); return;
        }
        cerrar();
        if (typeof onOk === 'function') onOk();
      } catch(e) {
        err.textContent = 'Error al verificar el PIN'; err.style.display = 'block';
      }
    }
    document.getElementById('vs-pinlock-ok').addEventListener('click', validar);
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') validar(); });
  };

  // ══════════════════════════════════════════════════════════════
  // TIEMPOS POR ESTADO DE LA MESA
  // Antes un solo reloj corría desde que se abría el pedido hasta que se
  // liberaba la mesa. Ahora cada estado tiene su propio sello de tiempo y el
  // reloj se reinicia en cada cambio: se ve cuánto lleva EN ESO, no cuánto
  // lleva sentada la gente. Al salir de un estado se guarda el tramo en
  // pos_mesa_tiempos para poder sacar promedios después (Informes).
  // ══════════════════════════════════════════════════════════════
  const VS_TS = { pendiente_pago: 'pendiente_pago_at', esperando: 'esperando_at', comiendo: 'comiendo_at' };

  function vsEstadoDesde(t) {
    if (!t) return null;
    const campo = VS_TS[t.status];
    return (campo && t[campo]) || t.openedAt || null;
  }
  async function vsMarcarEstado(tableId, nuevoEstado, extra) {
    const sb = window._pos && window._pos.sb;
    if (!sb) return;
    const t = state.tables.find(x => x.id === tableId);
    const ahora = new Date();
    const patch = Object.assign({ status: nuevoEstado }, extra || {});
    const campoNuevo = VS_TS[nuevoEstado];
    if (campoNuevo) patch[campoNuevo] = ahora.toISOString();
    if (nuevoEstado === 'libre') {
      patch.pendiente_pago_at = null; patch.esperando_at = null; patch.comiendo_at = null;
    }
    try { await sb.from('pos_tables').update(patch).eq('id', tableId); }
    catch (e) { console.error('[VS] vsMarcarEstado:', e); }

    /*  COMIENDO AQUI = LISTO EN COCINA (Sergio, 28-ago-2026).

        El otro sentido del mismo vinculo: si el mesero marca que ya estan
        comiendo, es que el plato salio — y la comanda no tiene por que seguir
        pidiendo trabajo en la pantalla de la cocina.

        Solo cuando el estado CAMBIA: reescribir lo mismo dispararia el aviso
        de vuelta y las dos pantallas se estarian escribiendo sin parar. */
    if (nuevoEstado === 'comiendo' && t && t.status !== 'comiendo' && t.current_order_id) {
      try { await sb.from('pos_orders').update({ estado: 'listo' }).eq('id', t.current_order_id); }
      catch (e) { console.error('[VS] la comanda no paso a listo:', e); }
    }
    try {
      const desde = t ? vsEstadoDesde(t) : null;
      if (t && desde && t.status && t.status !== 'libre' && t.status !== nuevoEstado) {
        const seg = Math.max(0, Math.round((ahora - new Date(desde)) / 1000));
        if (seg > 0) {
          await sb.from('pos_mesa_tiempos').insert([{
            tenant_id: (window._pos.state && window._pos.state.tenantId) || null,
            branch_id: (window._pos.state && window._pos.state.branchId) || null,
            table_id: tableId, order_id: t.current_order_id || null,
            estado: t.status, desde: new Date(desde).toISOString(),
            hasta: ahora.toISOString(), segundos: seg,
          }]);
        }
      }
    } catch (e) { console.warn('[VS] tiempo no registrado:', e && e.message); }
    if (t) {
      t.status = nuevoEstado;
      if (campoNuevo) t[campoNuevo] = ahora.toISOString();
      if (nuevoEstado === 'libre') { t.pendiente_pago_at = null; t.esperando_at = null; t.comiendo_at = null; }
    }
  }

  // Modal con el desglose de tiempos de ESTA mesa: cuánto tardó en pagar,
  // cuánto en prepararse y cuánto lleva comiendo. Los tramos cerrados salen de
  // pos_mesa_tiempos; el estado actual se calcula en vivo.
  const VS_EST_LBL = {
    pendiente_pago: 'Esperando el pago',
    esperando:      'En preparación',
    comiendo:       'Comiendo',
  };
  function vsFmtDur(seg) {
    seg = Math.max(0, Math.round(seg));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), sg = seg % 60;
    if (h) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m) return m + ' min ' + String(sg).padStart(2, '0') + 's';
    return sg + 's';
  }
  async function vsAbrirTiempos(tableId) {
    const mesa = state.tables.find(t => t.id === tableId);
    if (!mesa) return;
    const sb = window._pos && window._pos.sb;
    let tramos = [];
    try {
      if (sb && mesa.current_order_id) {
        const r = await sb.from('pos_mesa_tiempos').select('estado,segundos,desde')
          .eq('order_id', mesa.current_order_id).order('desde', { ascending: true });
        tramos = r.data || [];
      }
    } catch (e) { console.warn('[VS] tiempos:', e && e.message); }

    // El estado actual sigue corriendo: se calcula al vuelo.
    const desdeActual = vsEstadoDesde(mesa);
    if (mesa.status && mesa.status !== 'libre' && desdeActual) {
      tramos = tramos.concat([{
        estado: mesa.status, desde: desdeActual,
        segundos: Math.max(0, Math.round((Date.now() - new Date(desdeActual)) / 1000)),
        _vivo: true,
      }]);
    }
    // Si el cobro adelantado está apagado no existe el tiempo de "esperando pago".
    if (!state.cobroAdelantado) tramos = tramos.filter(t => t.estado !== 'pendiente_pago');

    const total = tramos.reduce((a, t) => a + (Number(t.segundos) || 0), 0);
    const filas = tramos.length
      ? tramos.map(t => {
          const pct = total > 0 ? Math.round((Number(t.segundos) || 0) * 100 / total) : 0;
          const meta = STATE_META[t.estado] || {};
          const color = meta.color || '#5B6BFF';
          return '<div class="vs-tm-row">'
            + '<div class="vs-tm-top">'
            +   '<span class="vs-tm-dot" style="background:' + color + '"></span>'
            +   '<span class="vs-tm-lbl">' + (VS_EST_LBL[t.estado] || t.estado) + (t._vivo ? ' <i>· ahora</i>' : '') + '</span>'
            +   '<span class="vs-tm-val">' + vsFmtDur(t.segundos) + '</span>'
            + '</div>'
            + '<div class="vs-tm-bar"><i style="width:' + pct + '%;background:' + color + '"></i></div>'
          + '</div>';
        }).join('')
      : '<div class="vs-tm-empty">Todavía no hay tiempos que mostrar.</div>';

    const ov = document.createElement('div');
    ov.className = 'vs-tm-ov';
    ov.innerHTML = '<div class="vs-tm-box">'
      + '<div class="vs-tm-hd">Tiempos de ' + (mesa.name || ('Mesa ' + (mesa.number || ''))) + '</div>'
      + '<div class="vs-tm-sub">Desde que se abrió el pedido</div>'
      + filas
      + (tramos.length ? '<div class="vs-tm-tot"><span>Total en la mesa</span><b>' + vsFmtDur(total) + '</b></div>' : '')
      + '<button type="button" class="vs-tm-close">Cerrar</button>'
    + '</div>';
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.classList.contains('vs-tm-close')) ov.remove();
    });
    document.body.appendChild(ov);
  }
  // Un solo oyente para toda la pantalla (el panel se repinta constantemente).
  if (!window._vsTmBound) {
    window._vsTmBound = true;
    document.addEventListener('click', function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-tiempos]');
      if (el) vsAbrirTiempos(el.dataset.tiempos);
    });
  }

  async function cobrarMesa(tableId) {
    const sb = window._pos && window._pos.sb;
    if (!sb) return;
    try {
      // Marcar mesa como esperando (cocina puede verlo) + reiniciar el reloj
      await vsMarcarEstado(tableId, 'esperando');
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

  /*  ══ ELEGIR ENTRE VARIAS ══════════════════════════════════
      Mismo marco que `vsConfirm` para que no aparezca una ventana con otro
      aire en medio del servicio. Devuelve el id elegido, o null.          */
  function vsElegir({ title, msg, opciones }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'vs-confirm-overlay';
      overlay.innerHTML = `
        <div class="vs-confirm-card" style="max-width:420px">
          <div class="vs-confirm-title">${title}</div>
          ${msg ? `<div class="vs-confirm-msg">${msg}</div>` : ''}
          <div class="vs-elegir">${opciones.map(o =>
            `<button class="vs-elegir-op" data-op="${o.id}"><b>${o.titulo}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</button>`
          ).join('')}</div>
          <div class="vs-confirm-actions"><button class="vs-c-cancel">Cancelar</button></div>
        </div>`;
      document.body.appendChild(overlay);
      function close(r) { overlay.remove(); resolve(r); }
      overlay.querySelectorAll('.vs-elegir-op').forEach(b =>
        b.addEventListener('click', () => close(b.dataset.op)));
      overlay.querySelector('.vs-c-cancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    });
  }

  /*  Un formulario corto, con el mismo marco. Devuelve un objeto con los
      valores, o null si cancela.                                          */
  /*  El `segmento` es un interruptor arriba del formulario que decide QUE
      campos se ven. Nace del modal de crear cliente, que ya tenia
      «Casa / Conjunto o edificio»: preguntar lo mismo de dos formas distintas
      en dos pantallas del mismo programa es como tener dos programas.

      Cada campo puede llevar `solo: '<opcion>'` para verse unicamente en esa.
      Lo que se escribe en un campo escondido NO cuenta al guardar — si
      contara, un conjunto tecleado y luego escondido haria pasar una
      direccion de casa como si fuera de conjunto.                          */
  function vsFormulario({ title, msg, campos, okLabel = 'Guardar', valida, segmento }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'vs-confirm-overlay';
      overlay.innerHTML = `
        <div class="vs-confirm-card" style="max-width:420px">
          <div class="vs-confirm-title">${title}</div>
          ${msg ? `<div class="vs-confirm-msg">${msg}</div>` : ''}
          ${segmento ? `<div class="vs-form-seg" role="group">${segmento.opciones.map(o =>
            `<button type="button" data-seg="${o.id}" class="${o.id === segmento.valor ? 'on' : ''}">${o.label}</button>`
          ).join('')}</div>` : ''}
          <div class="vs-form">${campos.map(c =>
            `<label class="vs-form-campo" data-campo="${c.id}"${c.solo ? ` data-solo="${c.solo}"` : ''}><span>${c.label}</span>
              <input id="vsf-${c.id}" type="${c.tipo || 'text'}" placeholder="${c.ej || ''}" value="${c.valor || ''}" autocomplete="off"></label>`
          ).join('')}</div>
          <div class="vs-form-error" hidden></div>
          <div class="vs-confirm-actions">
            <button class="vs-c-cancel">Cancelar</button>
            <button class="vs-c-ok brand">${okLabel}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      function close(r) { overlay.remove(); resolve(r); }
      /*  El aviso va DENTRO de la ventana, nunca en un cuadro del navegador:
          en medio del servicio, un cuadro del sistema obliga a soltar la
          pantalla tactil para darle a Aceptar. */
      const _err = overlay.querySelector('.vs-form-error');
      function fallo(txt) { _err.textContent = txt; _err.hidden = false; }

      let _seg = segmento ? segmento.valor : null;
      function pintarSeg() {
        overlay.querySelectorAll('[data-seg]').forEach(b =>
          b.classList.toggle('on', b.dataset.seg === _seg));
        overlay.querySelectorAll('[data-solo]').forEach(l => {
          l.hidden = l.dataset.solo !== _seg;
        });
        /*  El texto del campo cambia con el modo: con conjunto, la calle es
            opcional; sin conjunto, es lo unico que hay. */
        const dirL = overlay.querySelector('[data-campo="dir"] span');
        if (dirL && segmento) dirL.textContent = (_seg === 'conjunto') ? 'Direcci\u00f3n (opcional)' : 'Direcci\u00f3n';
      }
      if (segmento) {
        overlay.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => {
          /*  Cambiar de idea NO borra lo que ya se escribio, igual que en el
              modal de crear cliente: solo se esconde. Si vuelve, ahi sigue. */
          _seg = b.dataset.seg; _err.hidden = true; pintarSeg();
        }));
        pintarSeg();
      }
      overlay.querySelectorAll('input').forEach(i =>
        i.addEventListener('input', () => { _err.hidden = true; i.style.borderColor = ''; }));
      overlay.querySelector('.vs-c-ok').addEventListener('click', () => {
        const out = {};
        let falta = null;
        campos.forEach(c => {
          //  Un campo escondido no cuenta: vale vacio, aunque tenga texto.
          const oculto = c.solo && segmento && c.solo !== _seg;
          const v = oculto ? '' : (overlay.querySelector('#vsf-' + c.id).value || '').trim();
          out[c.id] = v;
          if (c.obliga && !oculto && !v && !falta) falta = c;
        });
        if (segmento) out[segmento.id || 'tipo'] = _seg;
        if (falta) {
          const inp = overlay.querySelector('#vsf-' + falta.id);
          inp.style.borderColor = '#DC2626'; inp.focus();
          fallo('Falta ' + String(falta.label).toLowerCase());
          return;
        }
        /*  Una comprobacion que mira TODO el formulario junto, no campo por
            campo: hay datos que solo son obligatorios segun lo que tenga otro
            — con conjunto la calle sobra, sin conjunto la calle es lo unico
            que hay. */
        if (typeof valida === 'function') {
          const m = valida(out);
          if (m) { fallo(m); return; }
        }
        close(out);
      });
      overlay.querySelector('.vs-c-cancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
      /*  El cursor va al primer campo QUE SE VE. Con el interruptor en Casa,
          el primero del HTML es el del conjunto — escondido— y enfocarlo
          deja el teclado abierto sin que se vea donde escribe. */
      setTimeout(() => {
        const vis = Array.prototype.filter.call(overlay.querySelectorAll('.vs-form-campo'),
          l => !l.hidden)[0];
        const p = vis && vis.querySelector('input');
        if (p) p.focus();
      }, 30);
    });
  }

  /*  ══ PASAR UN PEDIDO YA HECHO ════════════════════════════

      Sergio, 28-ago-2026: «lo mismo deberia poderse hacer desde venta rapida y
      desde domicilio... en las 3 tiene que ver los modos».

      UN SOLO MOTOR para las seis combinaciones (mesa→llevar, mesa→domicilio,
      llevar→mesa, llevar→domicilio, domicilio→mesa, domicilio→llevar) mas el
      cambio de mesa a mesa. Escribirlas por separado en las tres pantallas
      serian tres sitios donde arreglar el mismo fallo, y el dia que uno se
      quede sin arreglar nadie lo va a notar: los pedidos seguirian
      moviendose, solo que mal.

      EL PEDIDO NO SE RECREA NUNCA. Mismo id, mismos productos, y en cocina
      conserva el tiempo que llevaba. Cancelar y rehacer le quitaria a la
      cocina algo que ya esta haciendo para devolverselo con el reloj en cero.

      Lo que se lee de la base y no del estado de la pantalla es el pedido: las
      tres pantallas lo guardan en su propia forma, y una consulta de una fila
      cuesta menos que tres formas de equivocarse.                        */
  const VS_MODOS = {
    salon:     { nombre: 'Mesa',         sub: 'eliges la mesa' },
    rapido:    { nombre: 'Para llevar',  sub: 'cobras y listo' },
    domicilio: { nombre: 'Domicilio',    sub: 'te pide la dirección' },
  };

  /*  ══ LA DIRECCION QUE EL CLIENTE YA TIENE ═══════════════════════

      Sergio, 28-ago-2026: «seria mucho trabajo que cada vez que vaya a pasar
      un pedido para domicilio me aparezca como al vacio sabiendo que ese
      cliente ya tiene una direccion guardada». Y ademas: «un cliente puede
      tener varias direcciones... la otra igual queda guardada».

      Dos reglas que salen de ahi:

      1. SE OFRECEN LAS QUE YA TIENE. Escribir de nuevo una direccion que el
         sistema ya sabe no es solo lento: es la forma mas facil de que quede
         escrita distinta a la de la vez pasada, y entonces son dos
         direcciones donde habia una.

      2. AGREGAR UNA NUEVA NO BORRA LA VIEJA. La misma persona pide a la casa
         y a la oficina. La nueva se AGREGA a la lista; la vieja sigue ahi
         para la proxima.

      Las direcciones viven en `pos_clientes.direcciones`, una lista de
      `{dir, barrio}`, mas la principal en `direccion`/`barrio`. Se juntan las
      dos fuentes y se quitan las repetidas: hay fichas viejas donde la
      principal tambien esta en la lista.                                   */
  function vsDirEtiqueta(d) {
    return [d.conjunto, d.unidad, d.dir].filter(Boolean).join(' · ') || d.barrio || 'Sin direcci\u00f3n';
  }
  function vsDirLlave(d) {
    return [d.conjunto, d.unidad, d.dir].filter(Boolean).join('|').toLowerCase().replace(/\s+/g, ' ');
  }

  function vsDirsDe(cli) {
    const out = [];
    const vistas = new Set();
    const meter = (d) => {
      if (!d) return;
      const limpia = {
        conjunto: String(d.conjunto || '').trim(),
        unidad:   String(d.unidad   || '').trim(),
        barrio:   String(d.barrio   || '').trim(),
        dir:      String(d.dir || d.direccion || '').trim(),
      };
      if (!limpia.conjunto && !limpia.dir) return;
      const llave = vsDirLlave(limpia);
      if (vistas.has(llave)) return;
      vistas.add(llave);
      out.push(limpia);
    };
    if (cli) {
      meter({ dir: cli.direccion, barrio: cli.barrio });
      (Array.isArray(cli.direcciones) ? cli.direcciones : []).forEach(meter);
    }
    return out;
  }

  /*  \u2550\u2550 LA DIRECCION DEL PEDIDO, ENTERA \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      Una direccion de Popayan no siempre es una calle. Muy a menudo es un
      CONJUNTO y un numero de casa \u2014 \u00abLlanos de Calibio, casa 32\u00bb\u2014 y ahi la
      calle sobra. Por eso las notas guardan `[conjunto:...][unidad:...]`
      aparte, y por eso un pedido asi tiene la parte de calle VACIA.

      Sergio lo vio en la primera prueba: el modal le pidio la direccion sin
      el numero de casa, teniendolo guardado. Leer solo el texto de antes del
      primer corchete es leer media direccion \u2014 y en ese caso, ninguna.     */
  function vsDirDeNotas(notas) {
    const t = String(notas || '');
    if (!t.trim()) return null;
    const tag = (n) => { const m = t.match(new RegExp('\\[' + n + ':([^\\]]*)\\]', 'i')); return m ? m[1].trim() : ''; };
    const corte = t.indexOf('[');
    const calle = (corte >= 0 ? t.slice(0, corte) : t).replace(/[\u2014\-·,\s]+$/, '').trim();
    const d = { conjunto: tag('conjunto'), unidad: tag('unidad'), barrio: tag('barrio'), dir: calle };
    return (d.conjunto || d.dir) ? d : null;
  }

  /*  \u2550\u2550 LA DIRECCION QUE EL CLIENTE YA TIENE \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      Sergio, 28-ago-2026: \u00abseria mucho trabajo que cada vez que vaya a pasar
      un pedido para domicilio me aparezca como al vacio sabiendo que ese
      cliente ya tiene una direccion guardada\u00bb. Y: \u00abun cliente puede tener
      varias direcciones... la otra igual queda guardada\u00bb.

      1. SE OFRECEN LAS QUE YA TIENE. Volver a escribir una direccion que el
         sistema ya sabe no es solo lento: es la forma mas facil de que quede
         escrita distinta a la de la vez pasada, y entonces son dos
         direcciones donde habia una.

      2. AGREGAR UNA NUEVA NO BORRA LA VIEJA. La misma persona pide a la casa
         y a la oficina. La nueva se AGREGA; la vieja sigue ahi.

      Se juntan la ficha del cliente y lo que el PROPIO PEDIDO trae en sus
      notas \u2014 un pedido que ya fue domicilio conserva la suya, y puede no
      estar en la ficha porque se escribio a mano esa vez. Esa va de primera:
      cuando existe, casi siempre es a donde va otra vez.                   */
  async function vsPedirDireccion(sbM, ord, hayMesa) {
    let cli = null;
    if (ord.cliente_id) {
      try {
        const { data } = await sbM.from('pos_clientes')
          .select('id,nombre,telefono,direccion,barrio,direcciones')
          .eq('id', ord.cliente_id).maybeSingle();
        cli = data;
      } catch (e) { /* sin ficha se pide todo, como antes */ }
    }
    const guardadas = vsDirsDe(cli);
    const delPedido = vsDirDeNotas(ord.notes);
    if (delPedido && !guardadas.some(g => vsDirLlave(g) === vsDirLlave(delPedido))) {
      guardadas.unshift(delPedido);
    }

    let elegida = null;
    if (guardadas.length) {
      const pick = await vsElegir({
        title: 'A d\u00f3nde lo llevamos',
        msg: (cli && cli.nombre ? '<strong>' + _esc(cli.nombre) + '</strong> ya tiene ' : 'Este pedido ya tiene ')
          + (guardadas.length === 1 ? 'esta direcci\u00f3n' : 'estas direcciones') + ' guardada'
          + (guardadas.length === 1 ? '' : 's') + '.',
        opciones: guardadas.map((d, i) => ({
          id: String(i), titulo: vsDirEtiqueta(d), sub: d.barrio || 'sin barrio',
        })).concat([{ id: 'nueva', titulo: '+ Otra direcci\u00f3n', sub: 'se agrega a las que ya tiene' }]),
      });
      if (pick === null) return null;
      if (pick !== 'nueva') elegida = guardadas[Number(pick)] || null;
    }

    const e = elegida || {};
    /*  ¿Casa o conjunto? Si se eligio una guardada, la que sea. Si es NUEVA,
        casa — que es lo normal. Sergio, 28-ago-2026: «da por hecho que es un
        conjunto, pero puede que esa persona esta vez pida desde una direccion
        normal». Dar por hecho el caso del cliente anterior es justo lo que
        hace que alguien teclee una calle en la casilla del conjunto.      */
    const tipoIni = (e.conjunto ? 'conjunto' : 'casa');
    /*  Los cuatro campos SIEMPRE, aunque a veces sobre uno. Esconder el
        conjunto cuando la direccion es de calle obligaria a adivinar cual de
        los dos casos es antes de preguntarlo \u2014 y equivocarse ahi es lo que
        dejo el numero de casa por fuera.                                   */
    const d = await vsFormulario({
      title: elegida ? 'Confirmar el domicilio' : 'Pasar a domicilio',
      msg: 'El pedido se manda a domicilios' + (hayMesa ? ' y la mesa queda libre' : '') + '.',
      okLabel: 'Pasar a domicilio',
      segmento: { id: 'tipo', valor: tipoIni, opciones: [
        { id: 'casa', label: 'Casa' },
        { id: 'conjunto', label: 'Conjunto o edificio' },
      ] },
      campos: [
        { id: 'conjunto', label: 'Conjunto o edificio', ej: 'Ciudadela Llanos de Calib\u00edo', valor: e.conjunto || '', solo: 'conjunto' },
        { id: 'unidad', label: 'Casa o apto', ej: 'Casa 32', valor: e.unidad || '', solo: 'conjunto' },
        { id: 'dir', label: 'Direcci\u00f3n', ej: 'Cra 9B #63N-58', valor: e.dir || '' },
        { id: 'barrio', label: 'Barrio', ej: 'Variante Norte', valor: e.barrio || '' },
        { id: 'tel', label: 'Tel\u00e9fono', ej: '3001234567', tipo: 'tel', valor: (cli && cli.telefono) || '' },
        { id: 'fee', label: 'Valor del domicilio', ej: '5000', tipo: 'number' },
      ],
      /*  Con conjunto, la calle sobra; sin conjunto, la calle es lo unico que
          hay. Se exige UNA de las dos y no una en concreto.                */
      valida: (v) => (v.conjunto || v.dir) ? null : 'Pon la direcci\u00f3n o el nombre del conjunto',
    });
    if (!d) return null;

    /*  Si es una direccion que no tenia, se le guarda a la ficha. Solo si hay
        ficha: sin cliente identificado no hay a quien guardarsela, y el
        pedido sale igual \u2014 esto es una comodidad, no un requisito.        */
    const nueva = { conjunto: d.conjunto, unidad: d.unidad, barrio: d.barrio, dir: d.dir };
    if (cli && cli.id && !guardadas.some(g => vsDirLlave(g) === vsDirLlave(nueva))) {
      try {
        const lista = (Array.isArray(cli.direcciones) ? cli.direcciones.slice() : []);
        lista.push(Object.assign({
          id: 'd' + Math.random().toString(36).slice(2, 13),
          tipo: nueva.conjunto ? 'conjunto' : 'casa',
        }, nueva));
        await sbM.from('pos_clientes').update({ direcciones: lista }).eq('id', cli.id);
      } catch (err) { console.warn('[pasar] no se pudo guardar la direccion:', err && err.message); }
    }
    return d;
  }

  function vsLiberarMesaCampos() {
    return { status: 'libre', current_order_id: null, sesion_at: null,
             esperando_at: null, comiendo_at: null, pendiente_pago_at: null, comiendo_method: null };
  }

  async function vsPasarPedido(ordId, desde, ctx, destinoForzado) {
    const sbM = window._pos && window._pos.sb;
    if (!sbM || !ordId) { vsToast('No encuentro ese pedido'); return; }
    ctx = ctx || {};

    //  El pedido, de la base: es la unica version que las tres pantallas
    //  comparten.
    let ord = null;
    try {
      const { data } = await sbM.from('pos_orders')
        .select('id,total,subtotal,delivery_fee,channel,table_id,branch_id,status,cliente_id,customer_name,notes')
        .eq('id', ordId).maybeSingle();
      ord = data;
    } catch (e) {}
    if (!ord) { vsToast('No encuentro ese pedido'); return; }

    let destino = destinoForzado || null;
    if (!destino) {
      destino = await vsElegir({
        title: 'Pasar el pedido a',
        msg: 'Sigue siendo el mismo pedido: mismos productos y el tiempo que lleva en cocina.',
        opciones: Object.keys(VS_MODOS).filter(k => k !== desde)
          .map(k => ({ id: k, titulo: VS_MODOS[k].nombre, sub: VS_MODOS[k].sub })),
      });
      if (!destino) return;
    }
    /*  'mesa' es como se llama en el menu y 'salon' como se llama en la base.
        Se unifica AQUI, en la entrada, y no en cada sitio que lo use: un
        nombre con dos formas es un fallo esperando el dia que alguien mire
        solo una de las dos.                                               */
    if (destino === 'mesa') destino = 'salon';

    const cambios = { channel: destino };
    let mesaDestino = null;

    /*  → MESA. Solo las LIBRES: ofrecer una ocupada seria ofrecer perder el
        otro pedido.                                                       */
    if (destino === 'salon') {
      const libres = state.tables.filter(t => t.status === 'libre' && t.id !== ctx.tableId);
      if (!libres.length) { vsToast('No hay ninguna mesa libre ahora mismo'); return; }
      const elegida = await vsElegir({
        title: desde === 'salon' ? 'Cambiar de mesa' : 'Pasar a una mesa',
        msg: desde === 'salon'
          ? 'El pedido se pasa completo, con su estado y su tiempo.'
          : 'El pedido pasa al salón y la mesa queda ocupada.',
        opciones: libres.map(t => ({
          id: t.id,
          titulo: 'Mesa ' + (t.name || t.number || ''),
          sub: (t.zone_name ? t.zone_name + ' · ' : '') + (t.capacity ? t.capacity + ' puestos' : 'libre'),
        })),
      });
      if (!elegida) return;
      mesaDestino = state.tables.find(t => t.id === elegida);
      cambios.table_id = elegida;
    }

    /*  → DOMICILIO. La direccion no se puede adivinar, y un domicilio sin
        direccion es un pedido que nadie puede entregar. Las notas van con el
        MISMO formato que escribe la pantalla de domicilios — es el que lee la
        app del domiciliario.                                              */
    if (destino === 'domicilio') {
      const d = await vsPedirDireccion(sbM, ord, !!ctx.tableId);
      if (!d) return;
      /*  El MISMO formato de notas que escribe la pantalla de domicilios: es
          el que lee la app del domiciliario. Inventar otro aqui dejaria el
          pedido sin direccion en la moto.                                  */
      cambios.notes = ((d.dir ? d.dir + ' ' : '')
        + (d.conjunto ? '[conjunto:' + d.conjunto + ']' : '')
        + (d.unidad ? '[unidad:' + d.unidad + ']' : '')
        + (d.barrio ? '[barrio:' + d.barrio.toUpperCase() + ']' : '')
        + (d.tel ? ' [tel:' + d.tel + ']' : '')).trim() || null;
      const fee = parseInt(d.fee, 10) || 0;
      cambios.delivery_fee = fee;
      cambios.delivery_status = 'recibido';
      cambios.table_id = null;
      //  El total llevaba el domicilio viejo (si venia de domicilio): se
      //  quita el de antes y se pone el de ahora.
      const base = (Number(ord.total) || 0) - (Number(ord.delivery_fee) || 0);
      cambios.total = base + fee;
    }

    /*  → PARA LLEVAR. Si venia de domicilio, el cobro del domicilio SE QUITA:
        ya nadie lo va a llevar, y dejarlo cobrado es cobrarle al cliente un
        viaje que no existe.                                               */
    if (destino === 'rapido') {
      cambios.table_id = null;
      if ((Number(ord.delivery_fee) || 0) > 0) {
        cambios.delivery_fee = 0;
        cambios.total = (Number(ord.total) || 0) - (Number(ord.delivery_fee) || 0);
      }
      /*  UN NUMERO DE TURNO, porque la cocina lo pinta: en esa columna el
          titulo de la tarjeta es «Turno #007», y sin numero saldria «Turno» a
          secas — sin nada con que llamarla desde la cocina. Se toma el
          siguiente de los de hoy en la sede: la cuenta que lleva venta rapida
          vive en SU equipo y no se puede leer desde aqui.                */
      try {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        let q = sbM.from('pos_orders').select('turno')
          .eq('channel', 'rapido').gte('opened_at', hoy.toISOString());
        if (ord.branch_id) q = q.eq('branch_id', ord.branch_id);
        const { data: ult } = await q.order('turno', { ascending: false }).limit(1);
        cambios.turno = (((ult && ult[0] && ult[0].turno) || 0) + 1);
      } catch (e) { /* sin turno la tarjeta sale sin numero, pero sale */ }

      const ok = await vsConfirm({
        title: 'Pasar a Para llevar',
        msg: 'El pedido pasa a Para llevar'
          + (ctx.tableId ? ' y la mesa queda libre' : '')
          + ((Number(ord.delivery_fee) || 0) > 0 ? '. Se quita el cobro del domicilio' : '')
          + '. En cocina se mueve de columna, con el tiempo que lleva.',
        okLabel: 'Sí, pasarlo',
      });
      if (!ok) return;
    }

    /*  ⚠️ QUE NO DESAPAREZCA DE LA COCINA (Sergio lo vio en la primera
        prueba: «desaparece de la columna de mesa pero no aparece en la de
        para llevar»).

        La pantalla de cocina no trae los pedidos de una sola forma: trae los
        que tienen `visible_cocina`, y APARTE trae todos los de canal `salon`.
        Esa segunda consulta existe porque una comanda de salon con cobro
        adelantado NO lleva `visible_cocina` — se ve en cocina solo por ser
        de salon.

        Entonces al cambiarle el canal se caia de las dos: ya no era de salon,
        y nunca tuvo la marca. Desaparecia del todo, que es lo peor que puede
        pasar en una cocina: un plato que hay que hacer y que ya nadie ve.

        Se le pone la marca al salir del salon. Solo si el pedido YA se habia
        enviado (`in_progress`): uno que todavia se esta armando no tiene por
        que aparecerle a la cocina de repente.                             */
    if (ord.channel === 'salon' && destino !== 'salon' && ord.status === 'in_progress') {
      cambios.visible_cocina = true;
    }

    //  Y si viene de domicilio a una mesa, el domicilio tampoco se cobra.
    if (cambios.channel === 'salon' && (Number(ord.delivery_fee) || 0) > 0) {
      cambios.delivery_fee = 0;
      cambios.total = (Number(ord.total) || 0) - (Number(ord.delivery_fee) || 0);
    }

    try {
      const { error: e1 } = await sbM.from('pos_orders').update(cambios).eq('id', ordId);
      if (e1) throw e1;

      //  La mesa de la que sale, si salia de una.
      const vieja = ctx.tableId ? state.tables.find(t => t.id === ctx.tableId) : null;
      if (ctx.tableId) {
        const { error: e2 } = await sbM.from('pos_tables').update(vsLiberarMesaCampos()).eq('id', ctx.tableId);
        if (e2) throw e2;
      }

      //  La mesa a la que llega. Si viene de otra mesa se copia su estado y
      //  sus tiempos — si no, los relojes se reiniciarian y una mesa de 40
      //  minutos apareceria recien sentada. Si viene de fuera del salon,
      //  empieza ocupada ahora.
      if (mesaDestino) {
        const campos = vieja
          ? { status: vieja.status, current_order_id: ordId,
              sesion_at: vieja.sesion_at || new Date().toISOString(),
              esperando_at: vieja.esperando_at || null, comiendo_at: vieja.comiendo_at || null,
              pendiente_pago_at: vieja.pendiente_pago_at || null,
              comiendo_method: vieja.comiendo_method || null }
          : { status: 'ocupada', current_order_id: ordId, sesion_at: new Date().toISOString() };
        const { error: e3 } = await sbM.from('pos_tables').update(campos).eq('id', mesaDestino.id);
        if (e3) throw e3;
        Object.assign(mesaDestino, campos);
      }

      if (vieja) Object.assign(vieja, vsLiberarMesaCampos());
      state.selectedTableId = mesaDestino ? mesaDestino.id : null;
      if (!mesaDestino) { state.currentOrder = null; state.orderItems = []; }
      render();
      vsToast(mesaDestino
        ? 'Pedido movido a la Mesa ' + (mesaDestino.name || mesaDestino.number || '')
        : 'Pedido pasado a ' + VS_MODOS[destino].nombre);
      /*  Y SE RECARGA DE VERDAD. Este pedido acaba de cambiar de lista: si
          era un domicilio y ahora es de mesa, tiene que desaparecer de una
          pestana y aparecer en la otra. `render()` solo repinta lo que ya
          esta en memoria — el pedido movido seguiria viendose donde estaba,
          y eso es peor que no moverlo: pareceria que esta en dos sitios. */
      try { await loadData(); } catch (e) { console.warn('[pasar] recarga:', e && e.message); }
    } catch (err) {
      vsToast('No se pudo pasar: ' + (err.message || String(err)));
    }
  }

  //  Las tres puertas de entrada. Cada pantalla llama a la suya.
  function vsMoverDeMesa(tableId) {
    const mesa = state.tables.find(t => t.id === tableId);
    const ordId = (state.currentOrder && state.currentOrder.id) || (mesa && mesa.current_order_id);
    if (!ordId) { vsToast('Esta mesa no tiene un pedido para mover'); return; }
    vsPasarPedido(ordId, 'salon', { tableId }, 'mesa');
  }
  function vsMoverDeModo(tableId, modo) {
    const mesa = state.tables.find(t => t.id === tableId);
    const ordId = (state.currentOrder && state.currentOrder.id) || (mesa && mesa.current_order_id);
    if (!ordId) { vsToast('Esta mesa no tiene un pedido para mover'); return; }
    vsPasarPedido(ordId, 'salon', { tableId }, modo);
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
    marcarComiendo(tableId);
  }

  async function marcarComiendo(tableId) {
    try {
      const sbRef = window._pos && window._pos.sb;
      if (!sbRef) return;
      await vsMarcarEstado(tableId, 'comiendo');
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
      const { error } = await sbRef.from('pos_tables').update({
        status:           'libre',
        current_order_id: null,
      }).eq('id', tableId);
      if (error) throw error;
      const t = state.tables.find(x => x.id === tableId);
      if (t) { t.status = 'libre'; t.current_order_id = null; }
      state.selectedTableId = null;
      render();
    } catch(e) { console.error('[VS] liberarMesa:', e); }
  }

  // ─── C9: Sistema T1/T2/T3 de automatización esperando→comiendo ───────────
  const _mesaTimers = {}; // key: tableId, value: { t1Id, t2Id, t3Id, notifEl }
  const _comiendoTimers = {}; // key: tableId — C10: sistema Comiendo→Libre

  function _getCfg() {
    try { return JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}'); }
    catch(e) { return {}; }
  }

  function _fmtElapsedStr(startIso) {
    if (!startIso) return '';
    const ms = Date.now() - new Date(startIso).getTime();
    if (ms < 0) return '';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m + ':' + String(s).padStart(2, '0');
  }

  async function _advanceMesaToComiendo(tableId) {
    try {
      const sbRef = window._pos && window._pos.sb;
      if (!sbRef) return;
      await vsMarcarEstado(tableId, 'comiendo');
      render();
    } catch(e) { console.error('[VS] advanceMesa:', e); }
  }

  function _dismissMesaNotif(tableId) {
    const entry = _mesaTimers[tableId];
    if (entry && entry.notifEl && entry.notifEl.parentNode) {
      const el = entry.notifEl; // capture before nulling
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(function() { if (el.parentNode) el.remove(); }, 200);
    }
    if (entry) { clearTimeout(entry.t3Id); entry.t3Id = null; entry.notifEl = null; }
  }

  function _showMesaNotif(tableId, tableName, startIso) {
    const cfg = _getCfg();
    const t3Mins = cfg.mesaT3 || 3;
    const t2Mins = cfg.mesaT2 || 5;
    const elapsed = _fmtElapsedStr(startIso);

    // Remove existing notif for this table
    _dismissMesaNotif(tableId);

    // Create notification element — stack vertically if other notifs already visible
    const activeNotifCount = Object.values(_mesaTimers).filter(function(e){ return e.notifEl && e.notifEl.parentNode; }).length;
    const bottomOffset = 24 + activeNotifCount * 116; // ~100px notif height + 16px gap
    const notif = document.createElement('div');
    notif.style.cssText = 'position:fixed;bottom:' + bottomOffset + 'px;right:24px;background:#fff;border-radius:14px;padding:16px 18px;'
      + 'box-shadow:0 8px 28px rgba(15,23,42,.16),0 2px 8px rgba(15,23,42,.08);z-index:8000;max-width:300px;'
      + 'border:1px solid #ECEEF2;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(10px)';

    notif.innerHTML = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px">'
      + '<div>'
      + '<div style="font-weight:700;font-size:13px;color:#0F172A">¿Ya entregaste los platos?</div>'
      + '<div style="font-size:11px;color:#64748B;margin-top:3px">Mesa ' + (tableName||tableId)
      + (elapsed ? ' · <span style="font-weight:600;color:#F97316">' + elapsed + '</span>' : '') + '</div>'
      + '</div>'
      + '<button onclick="_mesaNotifRespond(\'' + tableId + '\',null)" '
      + 'style="border:none;background:#F1F5F9;border-radius:7px;width:24px;height:24px;cursor:pointer;color:#94A3B8;font-size:12px;flex-shrink:0">✕</button>'
      + '</div>'
      + '<div style="display:flex;gap:8px">'
      + '<button onclick="_mesaNotifRespond(\'' + tableId + '\',false)" '
      + 'style="flex:1;padding:8px;border:1.5px solid #ECEEF2;border-radius:9px;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Todavía no</button>'
      + '<button onclick="_mesaNotifRespond(\'' + tableId + '\',true)" '
      + 'style="flex:1;padding:8px;border:none;border-radius:9px;background:#5B6BFF;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Sí, ya entregué</button>'
      + '</div>';

    document.body.appendChild(notif);
    // Animate in
    requestAnimationFrame(function() {
      notif.style.opacity = '1';
      notif.style.transform = 'translateY(0)';
    });

    // Start T3 auto-change timer (fires only if notification is IGNORED, not answered)
    const t3Id = setTimeout(async function() {
      if (_mesaTimers[tableId] && _mesaTimers[tableId].notifEl === notif) {
        _dismissMesaNotif(tableId);
        await _advanceMesaToComiendo(tableId, 'auto_ignorado');
        delete _mesaTimers[tableId];
      }
    }, t3Mins * 60 * 1000);

    if (!_mesaTimers[tableId]) _mesaTimers[tableId] = {};
    _mesaTimers[tableId].notifEl = notif;
    _mesaTimers[tableId].t3Id = t3Id;
    _mesaTimers[tableId].t2Mins = t2Mins;
    _mesaTimers[tableId].startIso = startIso;
    _mesaTimers[tableId].tableName = tableName;
  }

  // Global so onclick="" in innerHTML can call it
  window._mesaNotifRespond = function(tableId, answer) {
    const entry = _mesaTimers[tableId];
    if (!entry) return;
    _dismissMesaNotif(tableId);  // also clears T3

    if (answer === true) {
      // "Sí" → advance to comiendo
      _advanceMesaToComiendo(tableId);
      delete _mesaTimers[tableId];
    } else {
      // "No" or dismiss → schedule T2 repeat
      const t2Id = setTimeout(function() {
        const t = state.tables.find(x => x.id === tableId);
        if (t && t.status === 'esperando') {
          _showMesaNotif(tableId, entry.tableName, entry.startIso);
        } else {
          delete _mesaTimers[tableId];
        }
      }, (entry.t2Mins || 5) * 60 * 1000);
      _mesaTimers[tableId].t2Id = t2Id;
    }
  };

  function syncMesaTimers() {
    const cfg = _getCfg();
    const t1Mins = cfg.mesaT1 || cfg.entregaMin || 10;

    // Start T1 for newly-esperando tables not yet tracked
    state.tables.forEach(function(t) {
      if (t.status === 'esperando') {
        if (!_mesaTimers[t.id]) {
          _mesaTimers[t.id] = { tableName: t.name || t.id, startIso: t.openedAt || t.esperando_at || null };
          const startIso = t.esperando_at || t.openedAt;
          const elapsed = startIso ? (Date.now() - new Date(startIso).getTime()) : 0;
          const remaining = Math.max(0, t1Mins * 60 * 1000 - elapsed);
          _mesaTimers[t.id].t1Id = setTimeout(function() {
            const tbl = state.tables.find(x => x.id === t.id);
            if (tbl && tbl.status === 'esperando') {
              _showMesaNotif(t.id, tbl.name || t.id, tbl.esperando_at || tbl.openedAt);
            } else {
              delete _mesaTimers[t.id];
            }
          }, remaining);
        }
      } else {
        // Table left esperando → clean up timers & notification
        if (_mesaTimers[t.id]) {
          const entry = _mesaTimers[t.id];
          clearTimeout(entry.t1Id);
          clearTimeout(entry.t2Id);
          _dismissMesaNotif(t.id);
          delete _mesaTimers[t.id];
        }
      }
    });
  }

  function startAutoAvance() {
    // Kick initial sync and then poll every 60s as server-side fallback
    syncMesaTimers();
    syncComiendoTimers();
    setInterval(function() { syncMesaTimers(); syncComiendoTimers(); }, 60 * 1000);
  }


  // ─── C10: Sistema T1/T2/T3 automatización comiendo→libre ──────────────

  function _dismissLibreNotif(tableId) {
    var entry = _comiendoTimers[tableId];
    if (!entry) return;
    if (entry.t3Id) { clearTimeout(entry.t3Id); entry.t3Id = null; }
    if (entry.notifEl && entry.notifEl.parentNode) {
      var el = entry.notifEl;
      el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      entry.notifEl = null;
    }
  }

  async function _advanceMesaToLibre(tableId) {
    try {
      var sbRef = window._pos && window._pos.sb;
      if (!sbRef) return;
      await vsMarcarEstado(tableId, 'libre', { current_order_id: null });
      var t = state.tables.find(function(x) { return x.id === tableId; });
      if (t) t.current_order_id = null;
      render();
    } catch(e) { console.error('[VS] advanceMesaLibre:', e); }
  }

  function _showLibreNotif(tableId, tableName, comiendoSince) {
    var cfg = _getCfg();
    var t3Mins = cfg.liberarT3 || 10;
    var t2Mins = cfg.liberarT2 || 15;
    var elapsed = _fmtElapsedStr(comiendoSince);
    _dismissLibreNotif(tableId);

    var notif = document.createElement('div');
    notif.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#fff;border-radius:14px;padding:16px 18px;'
      + 'box-shadow:0 8px 28px rgba(15,23,42,.16),0 2px 8px rgba(15,23,42,.08);z-index:8000;max-width:300px;'
      + 'border:1px solid #ECEEF2;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(10px)';
    notif.innerHTML = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px">'
      + '<div>'
      + '<div style="font-weight:700;font-size:13px;color:#0F172A">¿Ya se fueron los clientes?</div>'
      + '<div style="font-size:11px;color:#64748B;margin-top:3px">Mesa ' + (tableName || tableId)
      + (elapsed ? ' · <span style="font-weight:600;color:#5B6BFF">' + elapsed + '</span>' : '') + '</div>'
      + '</div>'
      + '<button onclick="_libreNotifRespond(\'' + tableId + '\',null)" '
      + 'style="border:none;background:#F1F5F9;border-radius:7px;width:24px;height:24px;cursor:pointer;color:#94A3B8;font-size:12px;flex-shrink:0">✕</button>'
      + '</div>'
      + '<div style="display:flex;gap:8px">'
      + '<button onclick="_libreNotifRespond(\'' + tableId + '\',false)" '
      + 'style="flex:1;padding:8px;border:1.5px solid #ECEEF2;border-radius:9px;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Siguen comiendo</button>'
      + '<button onclick="_libreNotifRespond(\'' + tableId + '\',true)" '
      + 'style="flex:1;padding:8px;border:none;border-radius:9px;background:#22C55E;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Sí, mesa libre</button>'
      + '</div>';

    document.body.appendChild(notif);
    requestAnimationFrame(function() { notif.style.opacity = '1'; notif.style.transform = 'translateY(0)'; });

    var t3Id = setTimeout(async function() {
      if (_comiendoTimers[tableId] && _comiendoTimers[tableId].notifEl === notif) {
        _dismissLibreNotif(tableId);
        await _advanceMesaToLibre(tableId);
        delete _comiendoTimers[tableId];
      }
    }, t3Mins * 60 * 1000);

    if (!_comiendoTimers[tableId]) _comiendoTimers[tableId] = {};
    _comiendoTimers[tableId].notifEl = notif;
    _comiendoTimers[tableId].t3Id = t3Id;
    _comiendoTimers[tableId].t2Mins = t2Mins;
    _comiendoTimers[tableId].comiendoSince = comiendoSince;
    _comiendoTimers[tableId].tableName = tableName;
  }

  window._libreNotifRespond = function(tableId, answer) {
    var entry = _comiendoTimers[tableId];
    if (!entry) return;
    _dismissLibreNotif(tableId);
    if (answer === true) {
      _advanceMesaToLibre(tableId);
      delete _comiendoTimers[tableId];
    } else {
      // "Siguen comiendo" o cerrar → re-preguntar tras T2
      var t2Id = setTimeout(function() {
        var t = state.tables.find(function(x) { return x.id === tableId; });
        if (t && t.status === 'comiendo') {
          _showLibreNotif(tableId, entry.tableName, entry.comiendoSince);
        } else {
          delete _comiendoTimers[tableId];
        }
      }, (entry.t2Mins || 15) * 60 * 1000);
      _comiendoTimers[tableId].t2Id = t2Id;
    }
  };

  function syncComiendoTimers() {
    var cfg = _getCfg();
    var t1Mins = cfg.liberarT1 || 45;
    state.tables.forEach(function(t) {
      if (t.status === 'comiendo') {
        if (!_comiendoTimers[t.id]) {
          var comiendoSince = new Date().toISOString();
          _comiendoTimers[t.id] = { tableName: t.name || t.id, comiendoSince: comiendoSince };
          _comiendoTimers[t.id].t1Id = setTimeout(function() {
            var tbl = state.tables.find(function(x) { return x.id === t.id; });
            if (tbl && tbl.status === 'comiendo') {
              _showLibreNotif(t.id, tbl.name || t.id, _comiendoTimers[t.id] ? _comiendoTimers[t.id].comiendoSince : null);
            } else {
              delete _comiendoTimers[t.id];
            }
          }, t1Mins * 60 * 1000);
        }
      } else {
        if (_comiendoTimers[t.id]) {
          var entry = _comiendoTimers[t.id];
          clearTimeout(entry.t1Id); clearTimeout(entry.t2Id);
          _dismissLibreNotif(t.id);
          delete _comiendoTimers[t.id];
        }
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────
  async function init(mountContainer) {
    container = mountContainer;

    // Inject stylesheet (always fresh)
    /* El CSS vive en el <head> de ventas.html desde el arreglo del logo
       gigante: cargado aqui por codigo llegaba ~1 s tarde y la pantalla se
       pintaba sin medidas. Solo se inyecta si alguna otra pagina usara este
       modulo sin traer la hoja. */
    if (!document.querySelector('link[href*="ventas-salon.css"]')) {
      const link = document.createElement('link');
      link.id = 'vs-styles';
      link.rel = 'stylesheet';
      link.href = 'styles/modules/ventas-salon.css?v=1788320000';
      document.head.appendChild(link);
    }

    // Cargar zonas desde localStorage de configuracion
    state.zones = loadZonesFromConfig();
    state.floor = state.zones.length ? state.zones[0].id : null;
    const _urlFloor = new URLSearchParams(location.search).get('floor');
    if (_urlFloor) state.floor = _urlFloor;

    /* ── Dibujar YA, preguntar después ────────────────────────────────────
       Antes esto esperaba a que volvieran DOS preguntas al servidor antes de
       pintar un solo pixel, y la pantalla se quedaba en blanco mientras tanto.
       En la conexión de Popayán el saludo al servidor solo ya cuesta 739 ms.
       Las dos respuestas se pueden tener después sin que nadie espere:
         · el modo de cobro adelantado ya vive en el equipo (COBRO_KEY);
         · el rol sale de la sesión, que también está en el equipo;
         · el botón Cobrar SIEMPRE se muestra (el permiso se revisa al tocarlo),
           así que no hay riesgo de enseñar de más mientras llegan los permisos.
       Cuando lleguen, se vuelve a dibujar. */
    state.cobroAdelantado = localStorage.getItem(COBRO_KEY) === 'true';
    var _usr = window._pos && window._pos.state && window._pos.state.user;
    state.userRole = (_usr && (_usr.user_metadata?.role || _usr.app_metadata?.role)) || 'mesero';
    state.canCobrar = true;

    /* El salón se dibuja YA con las mesas que están guardadas en el equipo,
       todas en libre. Un instante después llega el estado real y las que estén
       ocupadas se pintan. Antes esto decía "Cargando mesas…" contra el
       servidor teniendo el plano del salón en el disco. */
    /* Primero lo que guardamos nosotros la última vez (siempre existe si ya se
       entró una vez); si no, la configuración local. */
    var _plano = planoGuardado();
    if (_plano) {
      state.tables = _plano.tables;
      if (!state.zones.length && _plano.zones.length) {
        state.zones = _plano.zones;
        if (!state.floor) state.floor = state.zones[0].id;
      }
    } else {
      var _mesas = mesasBase();
      if (_mesas.length) state.tables = _mesas;
    }
    /* Ojo: NO se apaga state.loading. Si se apagara, los pedidos rápidos y los
       domicilios —que sí dependen del servidor— dirían "no hay ninguno" antes
       de saberlo, y eso es mentirle a un mesero. Solo el salón se adelanta. */

    // Initial render (loading state)
    render();
    hookCobroRefresh();

    Promise.all([loadCobroAdelantado(), fetchUserPerms()]).then(function () { render(); });

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


  // ══════════════════════════════════════════════════════════════
  // DESGLOSE DE TIEMPOS DE UN DOMICILIO
  // Sergio: "los pedidos que están en camino llevan casi 1 hora en camino...
  // tenemos que aplicar el mismo sistema de reloj que en mesa: que se reinicie
  // cada vez que cambien de estado y mostrar cuánto se ha demorado en cada
  // estado". Los tramos cerrados los escribe la función `cambiar-estado` en
  // pos_domi_tiempos; el estado actual se calcula en vivo.
  // ══════════════════════════════════════════════════════════════
  /* Ojo: `cambiar-estado` normaliza los nombres, asi que en pos_domi_tiempos
     quedan como `en_preparacion` / `en_camino`, mientras que la tarjeta usa
     `preparacion` / `camino`. Se contemplan las dos formas. */
  const VS_DOMI_LBL = {
    recibido:       'Recibido',
    preparacion:    'En preparación',
    en_preparacion: 'En preparación',
    camino:         'En camino',
    en_camino:      'En camino',
    entregado:      'Entregado',
  };
  function vsDomiFmtDur(seg) {
    seg = Math.max(0, Math.round(seg));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    if (h) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m) return m + ' min ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  }
  async function vsDomiTiempos(domiId) {
    const d = state.deliveries.find(x => x.id === domiId);
    if (!d) return;
    const sb = window._pos && window._pos.sb;
    let tramos = [];
    try {
      if (sb) {
        const r = await sb.from('pos_domi_tiempos').select('estado,segundos,desde')
          .eq('order_id', domiId).order('desde', { ascending: true });
        tramos = r.data || [];
      }
    } catch (e) { console.warn('[VS] tiempos domi:', e && e.message); }

    // El estado actual sigue corriendo mientras no esté entregado.
    if (d.estado !== 'entregado' && d.estadoAt) {
      tramos = tramos.concat([{
        estado: d.estado, desde: d.estadoAt,
        segundos: Math.max(0, Math.round((Date.now() - new Date(d.estadoAt).getTime()) / 1000)),
        _vivo: true,
      }]);
    }

    const total = tramos.reduce((a, t) => a + (Number(t.segundos) || 0), 0);
    const filas = tramos.length
      ? tramos.map(t =>
          '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #F1F5F9">'
        +   '<span style="color:#334155;font-size:13px">' + (VS_DOMI_LBL[t.estado] || t.estado)
        +     (t._vivo ? ' <span style="color:#F97316;font-size:11px;font-weight:600">· ahora</span>' : '') + '</span>'
        +   '<span style="font-weight:600;color:#0F172A;font-size:13px">' + vsDomiFmtDur(t.segundos) + '</span>'
        + '</div>').join('')
      : '<div style="color:#94A3B8;font-size:13px;padding:10px 0">Todavía no hay cambios de estado registrados.</div>';

    const bd = document.createElement('div');
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    bd.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:340px;width:100%;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.22)">'
    +   '<div style="font-weight:700;color:#0F172A;font-size:15px">Tiempos del pedido</div>'
    +   '<div style="color:#64748B;font-size:12.5px;margin-top:2px;margin-bottom:12px">' + (d.cliente || '') + '</div>'
    +   filas
    +   '<div style="display:flex;justify-content:space-between;padding-top:11px;margin-top:4px">'
    +     '<span style="color:#64748B;font-size:13px">Desde que entró</span>'
    +     '<span style="font-weight:700;color:#0F172A;font-size:13px">' + vsDomiFmtDur((d.minTotal || 0) * 60) + '</span>'
    +   '</div>'
    +   '<button type="button" style="margin-top:14px;width:100%;border:0;background:#0F172A;color:#fff;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer">Cerrar</button>'
    + '</div>';
    const cerrar = () => bd.remove();
    bd.addEventListener('click', e => { if (e.target === bd) cerrar(); });
    bd.querySelector('button').addEventListener('click', cerrar);
    document.body.appendChild(bd);
    // Aviso honesto: el total no siempre es la suma de los tramos, porque los
    // pedidos anteriores a hoy no tienen registro por estado.
    void total;
  }


  /* Puntos que dejo el pedido, en el resumen de Ventas.
     Sergio lo pidio "cuando el cliente ha pagado": antes de pagar no hay
     puntos que anunciar, y sin cliente identificado tampoco — decirle al
     operador unos puntos que no se van a acumular seria enganarlo. */
  /* Los marcadores internos ([etq:...], [tel:...], [barrio:...], Ref:) los mete
     el sistema para uso propio; en pantalla no significan nada para nadie.
     `pos-print.js` ya los limpiaba antes de imprimir — aqui faltaba. */
  function vsNotasLimpias(notas) {
    var t = String(notas == null ? '' : notas)
      .replace(/\[etq:[^\]]*\]/gi, '')
      .replace(/\[tel:[^\]]*\]/gi, '')
      .replace(/\[barrio:[^\]]*\]/gi, '')
      .replace(/·?\s*Ref:\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t ? _esc(t) : '';
  }

  /* ══ PARA DONDE VA EL DOMICILIO ══════════════════════════════════════════
     Las notas de un pedido a domicilio vienen siempre asi:

         Carrera 55 # 2 c 11 [barrio:LOMAS DE SAN BENITO] [tel:324...] [web] — sin cebolla

     La direccion es todo lo que va ANTES del primer marcador; el barrio sale
     de su propio marcador. Lo que va despues del guion es la nota del cliente
     y ya se muestra en la comanda, asi que aqui no se repite.

     Se lee de las notas y no de una columna porque no existe tal columna: la
     direccion nunca se guardo aparte, y los cuatro caminos que crean pedidos
     (la pagina y los tres de Paco) la escriben aqui con este mismo formato. */
  function vsDireccionDe(notas) {
    var t = String(notas == null ? '' : notas);
    if (!t.trim()) return null;
    var mBarrio = t.match(/\[barrio:([^\]]*)\]/i);
    var barrio = mBarrio ? mBarrio[1].trim() : '';
    /* Todo lo anterior al primer marcador. Si no hay ninguno, no es un pedido
       a domicilio con direccion: es una nota suelta y no se inventa nada. */
    var corte = t.indexOf('[');
    var dir = corte >= 0 ? t.slice(0, corte).trim() : '';
    dir = dir.replace(/[—\-·,\s]+$/, '').trim();
    if (!dir && !barrio) return null;
    return { direccion: dir, barrio: barrio };
  }

  /* El bloque que lo muestra, debajo del nombre y los puntos: es lo primero
     que se necesita al tocar un domicilio, pero no es lo que se cobra — por
     eso va tranquilo y no compite con la comanda ni con el total. */
  function vsDireccionHTML(d) {
    if (d.canal !== 'domicilio') return '';
    var x = vsDireccionDe(d.notas);
    if (!x) return '';
    return '<div class="vs-dir">'
      + '<svg class="vs-dir-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
      +   '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
      + '<div class="vs-dir-tx">'
      +   (x.direccion ? '<div class="vs-dir-calle">' + _esc(x.direccion) + '</div>' : '')
      +   (x.barrio ? '<div class="vs-dir-barrio">' + _esc(x.barrio) + '</div>' : '')
      + '</div></div>';
  }

  /* ══ VER EN EL MAPA, SIN SALIR DE POR SALON (21-ago, pedido de Sergio) ══
     El visor ya existia en Domicilio express; aqui se reutiliza pos-mapa.js
     tal cual —la llave nunca baja al navegador, la imagen la da el servidor
     y los alfileres los dibuja Cobra encima—. En esta pantalla van dos
     puntos: el restaurante y la casa del cliente. El seguimiento del
     domiciliario en vivo sigue viviendo en Domicilio express, que es donde
     esta el dato de quien lo lleva. */
  var MAPA_VS = { sede: null, ciudad: '', cargada: false };

  async function vsMapaSede() {
    if (MAPA_VS.cargada) return;
    MAPA_VS.cargada = true;    // una sola vez por sesion, acierte o no
    try {
      var sb = (window._pos && window._pos.sb) || window.sb;
      var bid = window._pos && window._pos.state && window._pos.state.branchId;
      if (!sb || !bid || !window.posMapa) return;
      var r = await sb.from('branches').select('address,city').eq('id', bid).maybeSingle();
      var b = r && r.data;
      if (!b) return;
      MAPA_VS.ciudad = b.city || '';
      if (!b.address) return;
      var g = await posMapa.ubicar(b.address, '', b.city || '');
      if (g && isFinite(g.lat)) MAPA_VS.sede = { lat: g.lat, lng: g.lng };
    } catch (e) { /* sin sede el mapa igual muestra al cliente */ }
  }

  async function vsMapaAbrir(d) {
    if (!window.posMapa) return;
    var x = vsDireccionDe(d.notas);
    if (!x) {
      if (typeof toast === 'function') toast('Este pedido no tiene dirección');
      return;
    }
    var viejo = document.getElementById('vs-mapa-overlay');
    if (viejo) viejo.remove();
    var ov = document.createElement('div');
    ov.id = 'vs-mapa-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.32);backdrop-filter:blur(2px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px';
    ov.innerHTML = '<div style="width:640px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px -20px rgba(15,23,42,.4)">'
      + '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #F1F5F9">'
      +   '<div style="flex:1;min-width:0">'
      +     '<div style="font-size:14.5px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(d.cliente || 'Domicilio') + '</div>'
      +     '<div style="font-size:11.5px;color:#94A3B8">' + _esc([x.direccion, x.barrio].filter(Boolean).join(' · ')) + '</div>'
      +   '</div>'
      +   '<button id="vs-mapa-ruta" class="lm-btn-ghost" style="padding:6px 10px;font-size:11.5px">Cómo llegar</button>'
      +   '<button id="vs-mapa-cerrar" class="lm-icon-sm" title="Cerrar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      + '</div>'
      + '<div id="vs-mapa-lienzo" style="min-height:200px"><div style="padding:44px;text-align:center;color:#94A3B8;font-size:12.5px">Buscando la dirección…</div></div>'
      + '<div id="vs-mapa-pie" style="padding:10px 18px;font-size:11.5px;color:#64748B;border-top:1px solid #F1F5F9"></div>'
      + '</div>';
    document.body.appendChild(ov);
    var cerrar = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
    ov.querySelector('#vs-mapa-cerrar').addEventListener('click', cerrar);
    ov.querySelector('#vs-mapa-ruta').addEventListener('click', function () {
      var destino = [x.direccion, x.barrio, MAPA_VS.ciudad].filter(Boolean).join(', ');
      window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destino), '_blank');
    });

    var puntos = [], notas = [];
    await vsMapaSede();
    if (MAPA_VS.sede) puntos.push({ lat: MAPA_VS.sede.lat, lng: MAPA_VS.sede.lng, tipo: 'negocio', etiqueta: 'Aquí' });
    var geo = await posMapa.ubicar(x.direccion, x.barrio, MAPA_VS.ciudad);
    if (geo && isFinite(geo.lat)) {
      puntos.push({ lat: geo.lat, lng: geo.lng, tipo: 'destino', etiqueta: d.cliente || 'Entrega' });
      if (geo.origen === 'domiciliario') notas.push('El punto de entrega lo marcó un domiciliario en la puerta: es exacto.');
      else if (geo.origen === 'cliente') notas.push('El punto lo mandó el cliente por WhatsApp.');
      else if (geo.cache) notas.push('Esta dirección ya estaba ubicada: no costó ninguna consulta.');
    } else if (geo && geo.no_encontrada) {
      notas.push('Google no encontró esta dirección. Cuando un domiciliario entregue aquí, el punto queda guardado.');
    }
    if (d.domiciliario) notas.push('Para seguir al domiciliario en vivo, ábrelo en Domicilio express.');

    var lienzo = ov.querySelector('#vs-mapa-lienzo');
    var pie = ov.querySelector('#vs-mapa-pie');
    if (lienzo) await posMapa.pintar(lienzo, { puntos: puntos, alto: 340 });
    if (pie) pie.innerHTML = notas.map(function (n) { return '· ' + n; }).join('<br>');
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Puntos del cliente, como CHIP junto al nombre (diseño aprobado por Sergio).
     Antes era una franja de ancho completo que empujaba la comanda hacia abajo;
     lo importante de esta tarjeta es ver qué pidió y cuánto es. El chip no
     ocupa fila propia y al tocarlo muestra el detalle.
     Solo aparece si el pedido ya se pagó y hay cliente identificado: anunciar
     puntos que no se le van a acumular a nadie sería engañar al operador. */
  function vsPuntosChip(d, pagado) {
    if (!pagado || !d || !d.clienteId) return '';
    var pts = window.posPuntosPedido ? window.posPuntosPedido({
      subtotal: d.subtotal, packaging_fee: d.empaque, total: d.total, delivery_fee: d.domiFee,
    }) : 0;
    if (pts <= 0) return '';
    return '<button type="button" class="vs-pts-chip" data-pts-domi="' + d.id + '"'
      + ' title="Puntos que ganó con este pedido">\u2b50 ' + pts + ' pts</button>';
  }

  // Detalle de los puntos: cuántos ganó y cuántos tiene ahora.
  async function vsPuntosDetalle(domiId) {
    var d = state.deliveries.filter(function (x) { return x.id === domiId; })[0];
    if (!d) return;
    var pts = window.posPuntosPedido ? window.posPuntosPedido({
      subtotal: d.subtotal, packaging_fee: d.empaque, total: d.total, delivery_fee: d.domiFee,
    }) : 0;
    var total = null;
    try {
      var sb = window._pos && window._pos.sb;
      var st = (window._pos && window._pos.state) || {};
      if (sb && d.clienteId) {
        var rc = await sb.from('pos_clientes').select('telefono').eq('id', d.clienteId).maybeSingle();
        var tel = (rc.data && String(rc.data.telefono || '').replace(/[^0-9]/g, '').slice(-10)) || '';
        if (tel) {
          var rp = await sb.from('pos_puntos').select('puntos')
            .eq('tenant_id', st.tenantId).ilike('telefono', '%' + tel).maybeSingle();
          total = (rp.data && Number(rp.data.puntos)) || 0;
        }
      }
    } catch (e) { /* si no se puede leer el total, se muestra solo lo ganado */ }
    vsAviso('\u2b50 Puntos',
      (d.cliente && d.cliente !== 'Sin cliente' ? _esc(d.cliente) + ' gan\u00f3 ' : 'Gan\u00f3 ')
      + '<b>' + pts + ' puntos</b> con este pedido.'
      + (total !== null ? '<br><span style="color:#64748B">Ahora tiene <b>' + total.toLocaleString('es-CO')
          + ' puntos</b> en total.</span>' : '')
      + '<br><span style="color:#94A3B8;font-size:12px">El domicilio no suma puntos.</span>');
  }

  // Avisito reutilizable (nombre completo, detalle de puntos).
  function vsAviso(titulo, htmlCuerpo) {
    var bd = document.createElement('div');
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:99999;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';
    bd.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:340px;width:100%;'
      + 'padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.22);font-family:inherit">'
      + '<div style="font-weight:700;color:#0F172A;font-size:14.5px;margin-bottom:7px">' + titulo + '</div>'
      + '<div style="font-size:13.5px;color:#334155;line-height:1.55">' + htmlCuerpo + '</div>'
      + '<button type="button" style="margin-top:15px;width:100%;border:0;background:#0F172A;color:#fff;'
      + 'border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">'
      + 'Cerrar</button></div>';
    var cerrar = function () { bd.remove(); };
    bd.addEventListener('click', function (e) { if (e.target === bd) cerrar(); });
    bd.querySelector('button').addEventListener('click', cerrar);
    document.body.appendChild(bd);
  }


})();
