/* pos-core.js — Helpers compartidos por todas las páginas del POS */
/* Incluye: Supabase client, $(), COPF(), COP(), todayRange(), daysAgoISO() */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
    storageKey: 'cobra-pos-session'
  }
});

// ── Helpers ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const COP = n => {
  if (n == null) return '—';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(n%1e6===0?0:1) + 'M';
  if (n >= 1e3)  return '$' + Math.round(n/1e3) + 'k';
  return '$' + Math.round(n).toLocaleString('es-CO');
};
const COPF = n => '$' + Math.round(n||0).toLocaleString('es-CO');
const pct  = (a,b) => b ? Math.min(100, Math.round((a/b)*100)) : 0;

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function todayRange() {
  const t = todayISO();
  return { start: t + 'T00:00:00.000Z', end: t + 'T23:59:59.999Z' };
}
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10);
}

// ── window._pos — Bus de eventos y estado global ──────────────────────────
(function () {
  const listeners = {};

  window._pos = {
    sb: sb,
    state: { user: null, branchId: null, tenantId: null },

    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },

    emit(event, data) {
      (listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.error('[_pos.emit]', event, e); } });
    },

    modules: {}
  };

  // ── Motor central de EMPAQUES ──────────────────────────────────────
  // Una sola lógica para mesas, venta rápida, domicilios y cobro.
  // items: [{productId, catId, presId, qty, unitPrice}] · opts: {domicilio:true}
  // Modo "especifico": tarifa fija por unidad en cascada
  //   presentación (empaquePresCfg[prodId::presId]) → producto (empaqueProdCfg)
  //   → categoría (empaqueCatCfg) → valor general.
  // Modo "unificado" (default): comportamiento clásico (fijo/%, unidad/pedido, canal).
  window.posEmpaqueCalc = function (items, opts) {
    try {
      var cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      if (!cfg.empaquesActivo || !items || !items.length) return 0;
      var prod = 0, units = 0;
      items.forEach(function (i) { prod += (Number(i.unitPrice) || 0) * (Number(i.qty) || 0); units += (Number(i.qty) || 0); });
      if (prod <= 0) return 0;
      if (cfg.empaqueModo === 'especifico') {
        var packs = cfg.empaquePacks || [];
        var general = Number(cfg.empaqueMonto) || 0;
        var packMonto = function (id) { for (var k = 0; k < packs.length; k++) if (packs[k].id === id) return Number(packs[k].monto) || 0; return 0; };
        var total = 0;
        items.forEach(function (i) {
          var fee = general;
          var cc = (cfg.empaqueCatCfg || {})[i.catId];
          if (cc) { if (cc.on === false) fee = 0; else if (cc.packId) fee = packMonto(cc.packId); }
          var pc = (cfg.empaqueProdCfg || {})[i.productId];
          if (pc !== undefined && pc !== null && pc !== '') {
            if (pc === 'none') fee = 0;
            else if (pc === 'general') fee = general;
            else fee = packMonto(pc);
          }
          // Nivel más específico: la PRESENTACIÓN del producto (ej. solo Personal)
          var sc = i.presId ? (cfg.empaquePresCfg || {})[(i.productId || '') + '::' + i.presId] : undefined;
          if (sc !== undefined && sc !== null && sc !== '') {
            if (sc === 'none') fee = 0;
            else if (sc === 'general') fee = general;
            else fee = packMonto(sc);
          }
          total += fee * (Number(i.qty) || 0);
        });
        return total;
      }
      var usaDomi = (cfg.empaqueCanal === 'distinto') && !!(opts && opts.domicilio);
      var esPct = cfg.empaqueTipo === 'porcentaje';
      var rate = esPct
        ? (usaDomi ? (cfg.empaquePctDomicilio || 0) : (cfg.empaquePct || 0))
        : (usaDomi ? (cfg.empaqueMontoDomicilio || 0) : (cfg.empaqueMonto || 0));
      if (cfg.empaqueBase === 'pedido') return esPct ? Math.round(prod * rate / 100) : rate;
      return esPct ? Math.round(prod * rate / 100) : rate * units;
    } catch (e) { return 0; }
  };

  // Inicializar: leer sesión, poblar state, emitir core:ready
  async function boot() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        // Sin sesión → redirigir a login (solo si no estamos ya ahí)
        if (!window.location.pathname.includes('login')) {
          window.location.href = 'login.html';
        }
        return;
      }
      const { data: { user } } = await sb.auth.getUser();
      window._pos.state.user     = user;
      window._pos.state.tenantId = user.user_metadata?.tenant_id || null;
      window._pos.state.branchId = user.user_metadata?.branch_id || null;

      // Guard: si no tiene tenant/branch y no está en onboarding → redirigir
      var currentPath = window.location.pathname;
      var isOnboarding = currentPath.includes('onboarding');
      var isLogin = currentPath.includes('login');
      if (!window._pos.state.tenantId || !window._pos.state.branchId) {
        if (!isOnboarding && !isLogin) {
          window.location.href = 'onboarding.html';
          return;
        }
      }

      sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.href = 'login.html';
      });

      window._pos.emit('core:ready', { user });

      // ── Sincronizar config de Operación entre dispositivos ─────────────
      // Antes vivía SOLO en localStorage del equipo donde se configuró → la
      // tablet no veía el empaque (ni ninguna regla de Operación). La fuente
      // de verdad ahora es branches.operacion_config; localStorage es caché.
      try {
        var OPK = 'pos.config.operacion.v1';
        var bId = window._pos.state.branchId;
        if (bId) {
          var rOp = await sb.from('branches').select('operacion_config').eq('id', bId).maybeSingle();
          var dbCfg = rOp && rOp.data && rOp.data.operacion_config;
          var localOp = null;
          try { localOp = JSON.parse(localStorage.getItem(OPK) || 'null'); } catch (e2) {}
          var dbTs    = (dbCfg && dbCfg._ts) || 0;
          var localTs = (localOp && localOp._ts) || 0;
          var dbTiene = dbCfg && typeof dbCfg === 'object' && Object.keys(dbCfg).length;
          // Gana la config MÁS NUEVA (marca _ts). Si la local es más reciente
          // (p. ej. el guardado a BD falló), se SUBE — auto-sanado.
          if (dbTiene && dbTs >= localTs) {
            localStorage.setItem(OPK, JSON.stringify(dbCfg));
          } else if (localOp && typeof localOp === 'object' && Object.keys(localOp).length) {
            await sb.from('branches').update({ operacion_config: localOp }).eq('id', bId);
          }
        }
      } catch (e) { console.warn('[pos-core] sync operacion_config:', e); }
    } catch (e) {
      console.error('[pos-core] Error en boot:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
