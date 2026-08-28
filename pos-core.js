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

// Zona horaria del negocio en horas vs UTC (Colombia = -5). Con esto "hoy" se calcula en
// hora LOCAL del negocio y NO se reinicia el día a las 7pm (medianoche UTC). Multi-tenant:
// a futuro se puede leer de ia_config.zona_horaria; por ahora Colombia por defecto.
const POS_TZ_OFFSET = -5;
const _posTzStr = (function (off) {
  const s = off <= 0 ? '-' : '+';
  const a = Math.abs(off);
  return s + String(Math.floor(a)).padStart(2, '0') + ':' + String(Math.round((a % 1) * 60)).padStart(2, '0');
})(POS_TZ_OFFSET);

function todayISO() {
  // Fecha "de hoy" en la zona horaria del negocio (no UTC).
  const d = new Date(Date.now() + POS_TZ_OFFSET * 3600000);
  return d.toISOString().slice(0, 10);
}
function todayRange() {
  const t = todayISO();
  // Medianoche local del negocio → instante UTC correcto (Colombia 00:00 = 05:00Z).
  return { start: t + 'T00:00:00.000' + _posTzStr, end: t + 'T23:59:59.999' + _posTzStr };
}
function daysAgoISO(n) {
  const d = new Date(Date.now() + POS_TZ_OFFSET * 3600000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── window._pos — Bus de eventos y estado global ──────────────────────────
(function () {
  const listeners = {};

  /* ¿Cuánto tiene que recibir el restaurante por este pedido?
     EL DOMICILIO NO CUENTA. El cliente lo paga, pero muchas veces va directo al
     domiciliario y nunca entra a la caja; y aunque entre, no es una venta.
     Sin esta regla, 13 domicilios reales aparecían como "pagados a medias"
     cuando lo único que faltaba era, exactamente, el valor del domicilio. */
  window.posCobrable = function (o) {
    if (!o) return 0;
    var total = parseFloat(o.total) || 0;
    var domi  = parseFloat(o.delivery_fee) || 0;
    return Math.max(0, total - domi);
  };
  /* ¿Está pagado? Se compara contra lo cobrable, no contra el total.
     El margen de $1 absorbe los redondeos al peso. */
  window.posEstaPagado = function (o) {
    if (!o) return false;
    if (o.status === 'paid' || o.status === 'completed') return true;
    var deb = window.posCobrable(o);
    return deb > 0 && (parseFloat(o.paid_amount) || 0) >= deb - 1;
  };

  var _emitidos = {};   // ultimo dato de cada evento ya emitido, para los oyentes que llegan tarde

  window._pos = {
    sb: sb,
    state: { user: null, branchId: null, tenantId: null },

    /* core:ready se emite UNA vez, apenas se lee la sesion — y eso hoy es
       instantaneo (sale del equipo). Una pantalla que registra su oyente
       dentro de DOMContentLoaded puede llegar TARDE: el evento ya paso y su
       oyente no corre nunca. Asi murio venta rapida: "Cargando categorias..."
       eterno, sin un solo error. Ahora el que llega tarde lo recibe de
       inmediato, como si hubiera llegado a tiempo. */
    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      if (event in _emitidos) { try { fn(_emitidos[event]); } catch(e) { console.error('[_pos.on tardio]', event, e); } }
    },

    emit(event, data) {
      _emitidos[event] = data;
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
        /*  HAY PANTALLAS QUE EXISTEN JUSTAMENTE PARA QUIEN NO TIENE CUENTA.
            Antes la regla era "si no estas en login, fuera", y con eso
            `register.html` rebotaba al login: quien iba a registrarse nunca
            llegaba a ver los planes. Un cliente nuevo no puede tener sesion
            todavia — esa es la definicion de cliente nuevo. */
        var PUBLICAS = ['login', 'register'];
        var ruta = window.location.pathname;
        var esPublica = PUBLICAS.some(function (p) { return ruta.includes(p); });
        if (!esPublica) window.location.href = 'login.html';
        return;
      }
      /* La sesión que acabamos de leer YA trae al usuario con sus datos. Antes
         aquí se volvía a preguntar al servidor exactamente lo mismo
         (auth.getUser sale a internet; medido: 350-700 ms en cada pantalla).
         Nota: si se le cambia el rol a alguien, lo verá cuando su sesión se
         renueve —dentro de la hora— o al volver a entrar. Es un cambio raro y
         no justifica un viaje al servidor en cada pantalla. */
      const user = session.user;
      window._pos.state.user     = user;
      window._pos.state.tenantId = user.user_metadata?.tenant_id || null;
      window._pos.state.branchId = user.user_metadata?.branch_id || null;

      /*  ══ LA CUENTA SUSPENDIDA NO ENTRA ═══════════════════════════════════
          Sergio, 28-ago-2026, antes de lanzar.

          El botón de suspender existía en la pantalla de administración y
          escribía bien `tenants.status`. Lo que NO existía es que alguien lo
          mirara: el restaurante suspendido seguía vendiendo igual. Un botón
          que dice que corta y no corta es peor que no tenerlo — te enteras el
          primer mes que alguien no pague, que es justo cuando lo necesitas.

          ── DOS DECISIONES QUE NO SON OBVIAS ──

          1. SI NO SE PUEDE PREGUNTAR, SE ENTRA. Un corte de internet, la base
             lenta o un error de permisos NO pueden cerrarle el restaurante a
             un cliente que sí pagó. El silencio nunca se interpreta como
             "suspendido": solo se cierra con un `status` que lo diga.

          2. SE PREGUNTA UNA VEZ POR SESIÓN, no en cada pantalla. Cobra abre
             quince pantallas al día y esto es un viaje al servidor; el estado
             de la cuenta cambia una vez al mes, no cada minuto. Se guarda en
             el equipo por 30 minutos. Quien suspenda a alguien a mitad de
             servicio verá el efecto en media hora, y eso está bien: cortarle
             la caja a alguien en pleno almuerzo no es lo que se quiere ni
             siquiera cuando no ha pagado.                                    */
      (async function comprobarCuenta() {
        var LLAVE = 'pos.cuenta.estado';
        var tid = window._pos.state.tenantId;
        if (!tid) return;
        try {
          var g = JSON.parse(localStorage.getItem(LLAVE) || 'null');
          if (g && g.tid === tid && (Date.now() - g.en) < 30 * 60000) {
            if (g.estado && g.estado !== 'active') cerrarPorCuenta(g.estado);
            return;
          }
        } catch (e) {}
        var estado = null;
        try {
          var r = await sb.from('tenants').select('status').eq('id', tid).maybeSingle();
          estado = (r && r.data && r.data.status) || null;
        } catch (e) { return; }        // no se pudo preguntar → se entra
        if (!estado) return;           // sin respuesta → se entra
        try { localStorage.setItem(LLAVE, JSON.stringify({ tid: tid, estado: estado, en: Date.now() })); } catch (e) {}
        if (estado !== 'active') cerrarPorCuenta(estado);
      })();

      /*  LA PANTALLA DE SUSPENSIÓN VIVE APARTE (`pos-suspendida.js`).
          No es un aviso de dos líneas: lleva el cobro, la cuenta a la que se
          transfiere, el comprobante y la espera de la aprobación. Eso no cabe
          aquí, y sobre todo no tiene por qué descargarse en las quince pantallas
          que abre un restaurante al día que SÍ está al día. Se trae solo cuando
          hace falta, que es casi nunca.

          Y NO se cierra la sesión — esto cambió el 28-ago. Sergio:
          *"la cuenta sigue existiendo... incluso puede ingresar, pero le
          aparece un modal que no lo deja hacer absolutamente nada hasta que no
          pague"*. Sacarlo al login lo dejaba sin manera de pagar solo.

          Que quede claro qué es esto y qué no: es un COBRO, no una cerradura.
          Tapa la pantalla, no la base de datos. Quien sepa de navegadores puede
          quitarse el aviso de encima; lo que no puede es ver ni tocar datos de
          otro restaurante, porque de eso se encargan los permisos del servidor,
          que no dependen de esta pantalla. */
      function cerrarPorCuenta(estado) {
        if (window.posPantallaSuspendida) return window.posPantallaSuspendida(estado);
        var sc = document.createElement('script');
        sc.src = 'pos-suspendida.js';
        sc.onload = function () {
          if (window.posPantallaSuspendida) window.posPantallaSuspendida(estado);
        };
        /*  Si el archivo no carga (sin internet, caché vieja) el restaurante se
            queda trabajando. Es lo correcto: entre cobrarle a alguien que ya
            pagó y dejar operar un día a alguien que no, lo segundo se arregla
            solo mañana. */
        sc.onerror = function () { console.warn('[cuenta] no se pudo cargar el aviso de suspensión'); };
        document.head.appendChild(sc);
      }

      /* ══ CONTEXTO: en qué MARCA y SUCURSAL se está trabajando ══
         Hasta hoy la sucursal salía del login y punto: cada pantalla leía
         `user_metadata.branch_id` por su cuenta (configuracion.js sola lo hacía
         en 6 sitios). Eso hacía imposible cambiar de sucursal — y por tanto de
         marca — sin volver a entrar. Un gerente con dos sedes tenía que cerrar
         sesión para ver la otra.

         Aquí se resuelve UNA vez y todas las pantallas lo heredan por
         `_pos.state.branchId`, que es lo que ya leen.

         Reglas:
         · Las sucursales permitidas salen de la BASE (`pos_users`), no del
           token — el usuario puede reescribir su metadata (ver
           DICCIONARIO-ACCESOS.md).
         · La elegida se recuerda entre recargas, pero SIEMPRE se valida contra
           las permitidas: un id guardado a mano no sirve de nada.
         · Si algo falla, se queda la del login. Nunca se deja a nadie fuera.
         · Esto es comodidad de pantalla, no seguridad: aunque alguien forzara
           una sucursal ajena, las políticas de la base no le devuelven nada. */
      window.posContexto = (function () {
        var _sucs = [], _marcas = [], _bId = window._pos.state.branchId, _mId = null;
        var LLAVE = 'pos.contexto.sucursal';

        /* Lo guardado en el equipo sirve YA: esto corre en 15 pantallas y sin
           caché serían 4 viajes al servidor en cada una. Se pinta con lo de
           ayer y se confirma por detrás — mismo patrón que pos-plan y
           pos-perms. Un dato viejo aquí no hace daño: si la sucursal dejó de
           estar permitida, la base no le devuelve nada igualmente. */
        function _aplicarGuardado() {
          try {
            var g = window.posCache && posCache.leer('contexto');
            if (!g || !g.datos || !g.datos.sucs) return false;
            _sucs = g.datos.sucs; _marcas = g.datos.marcas || [];
            var guardada = null;
            try { guardada = localStorage.getItem(LLAVE); } catch (e) {}
            if (_sucs.some(function (s) { return s.id === guardada; })) _bId = guardada;
            else if (_sucs.length && !_sucs.some(function (s) { return s.id === _bId; })) _bId = _sucs[0].id;
            var suc = _sucs.filter(function (s) { return s.id === _bId; })[0];
            _mId = suc ? suc.brand_id : null;
            if (_bId) { window._pos.state.branchId = _bId; window._branchId = _bId; }
            return true;
          } catch (e) { return false; }
        }

        async function resolver(porRed) {
          if (!porRed && _aplicarGuardado()) { resolver(true); return; }   // confirma por detrás
          try {
            var pu = await sb.from('pos_users')
              .select('branch_id,sucursales,tenant_id')
              .or('auth_user_id.eq.' + user.id + ',id.eq.' + user.id)
              .limit(1).maybeSingle();
            var fila = pu.data;
            if (!fila) return;                    // sin ficha: se queda la del login

            if (fila.tenant_id) window._pos.state.tenantId = fila.tenant_id;

            /* Permitidas = su sucursal de siempre + las que el dueño le asignó.
               El dueño las tiene todas: no se limita a sí mismo. */
            var permitidas = [];
            if (fila.branch_id) permitidas.push(fila.branch_id);
            (fila.sucursales || []).forEach(function (s) {
              if (s && permitidas.indexOf(s) < 0) permitidas.push(s);
            });
            try {
              var d = await sb.rpc('es_dueno');
              if (!d.error && d.data === true) permitidas = null;   // null = todas
            } catch (e) {}

            var q = sb.from('branches').select('id,name,brand_id').order('name');
            var br = await q;
            _sucs = (br.data || []).filter(function (s) {
              return permitidas === null || permitidas.indexOf(s.id) >= 0;
            });
            var ma = await sb.from('brands').select('id,name').order('name');
            var idsMarca = {};
            _sucs.forEach(function (s) { if (s.brand_id) idsMarca[s.brand_id] = 1; });
            _marcas = (ma.data || []).filter(function (m) { return idsMarca[m.id]; });

            /* La guardada manda, pero solo si sigue permitida. */
            var guardada = null;
            try { guardada = localStorage.getItem(LLAVE); } catch (e) {}
            var valida = _sucs.some(function (s) { return s.id === guardada; });
            if (valida) _bId = guardada;
            else if (!_sucs.some(function (s) { return s.id === _bId; }) && _sucs.length) _bId = _sucs[0].id;

            var suc = _sucs.filter(function (s) { return s.id === _bId; })[0];
            _mId = suc ? suc.brand_id : null;
            window._pos.state.branchId = _bId;
            window._branchId = _bId;
            /* Solo se guarda lo confirmado por la base. */
            try { if (window.posCache) posCache.guardar('contexto', { sucs: _sucs, marcas: _marcas }); } catch (e) {}
          } catch (e) {
            console.warn('[contexto] no se pudo resolver, se queda la del login:', e && e.message);
          }
        }

        return {
          resolver:    resolver,
          sucursalId:  function () { return _bId; },
          marcaId:     function () { return _mId; },
          sucursales:  function () { return _sucs.slice(); },
          marcas:      function () { return _marcas.slice(); },
          /* Sucursales de UNA marca: el desplegable nunca las mezcla. */
          sucursalesDe: function (brandId) {
            return _sucs.filter(function (s) { return s.brand_id === brandId; });
          },
          cambiar: function (branchId) {
            if (!_sucs.some(function (s) { return s.id === branchId; })) return false;
            try { localStorage.setItem(LLAVE, branchId); } catch (e) {}
            location.reload();     // que todas las pantallas relean su dato
            return true;
          }
        };
      })();
      await window.posContexto.resolver();

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

      // ── Turno (sesión de caja) abierto ────────────────────────────────
      // TODO pedido debe pertenecer a un turno: sin esto quedan "volando"
      // fuera de cualquier cuadre. Se cachea 30 s para no consultar en cada venta.
      window.posSessionId = async function () {
        try {
          var now = Date.now();
          if (window.__posSesCache && now - window.__posSesCacheTs < 30000) return window.__posSesCache;
          var bId = window._pos.state.branchId;
          if (!bId) return null;
          var r = await sb.from('pos_sessions').select('id')
            .eq('branch_id', bId).eq('status', 'open')
            .order('opened_at', { ascending: false }).limit(1).maybeSingle();
          window.__posSesCache = (r && r.data && r.data.id) || null;
          window.__posSesCacheTs = now;
          return window.__posSesCache;
        } catch (e) { return null; }
      };

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

/* ══════════════════════════════════════════════════════════════
   PUNTOS QUE DEJA UN PEDIDO
   La cuenta REAL la hace la base (trigger `award_loyalty_points`) cuando el
   pedido queda pagado. Esta funcion solo repite la MISMA formula para poder
   mostrarsela al cliente en el momento; si algun dia cambia una, hay que
   cambiar la otra.
   Se cuenta comida + empaque; el domicilio NO da puntos (no es venta).
   ══════════════════════════════════════════════════════════════ */
window.posPuntosPedido = function (o) {
  if (!o) return 0;
  var comida = (parseFloat(o.subtotal) || 0) + (parseFloat(o.packaging_fee) || 0);
  if (comida <= 0) comida = (parseFloat(o.total) || 0) - (parseFloat(o.delivery_fee) || 0);
  return Math.max(0, Math.floor(comida / 1000));
};

/* ══ LA REGLA DE PUNTOS DE ESTE RESTAURANTE (21-ago-2026) ══════════════
   "1 punto por cada $1.000" era la economia de El Parche escrita a fuego en
   cuatro sitios distintos (la ficha del cliente, el recibo, el chat y la
   caja). Cualquier restaurante que comprara Cobra la heredaba sin poder
   cambiarla. Ahora vive en `branches.operacion_config.puntos`, que pos-core
   ya sincroniza a este equipo, asi que leerla no cuesta una consulta.

   La MISMA regla la aplica el disparador de la base (`award_loyalty_points`):
   estos ayudantes son solo para MOSTRAR y estimar, nunca para abonar. */
window.posPuntosRegla = function () {
  var r = { pesosPorPunto: 1000, activo: true };
  try {
    var op = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || 'null');
    var p = op && op.puntos;
    if (p) {
      var n = Number(p.pesos_por_punto);
      if (n > 0) r.pesosPorPunto = n;
      if (p.activo === false) r.activo = false;
    }
  } catch (e) { /* sin config: la de siempre */ }
  return r;
};
/* Cuantos puntos da ESE gasto. Devuelve 0 si el restaurante no tiene
   programa de puntos — asi ninguna pantalla promete lo que no existe. */
window.posPuntosDe = function (pesos) {
  var r = window.posPuntosRegla();
  if (!r.activo) return 0;
  return Math.floor((Number(pesos) || 0) / r.pesosPorPunto);
};
/* La frase para explicarla, con el numero del restaurante. Vacia si esta
   apagado: mejor no decir nada que decir una regla que no se cumple. */
window.posPuntosFrase = function () {
  var r = window.posPuntosRegla();
  if (!r.activo) return '';
  var m = '$ ' + Math.round(r.pesosPorPunto).toLocaleString('es-CO');
  return '1 punto por cada ' + m;
};


/* ══════════════════════════════════════════════════════════════════
   LA LLAVE DEL PLANO DEL SALON — UNA SOLA, Y POR SEDE
   ──────────────────────────────────────────────────────────────────
   El plano se guardaba en `pos.config.salon.v1`, sin decir de que
   restaurante era, y esa misma cadena estaba escrita a mano en CUATRO
   archivos: ventas, configuracion, onboarding y tomar pedido.

   El 24-ago-2026, en pleno servicio, Sergio vio 16 mesas donde tiene 8, con
   la 01, 02, 03 y 04 repetidas: habia entrado al restaurante de pruebas en
   el mismo computador y el plano de aquel se quedo guardado. El salon junto
   los dos.

   Nadie lo habia visto porque hasta ese dia solo existia un restaurante por
   equipo. Se rompio justo cuando hubo dos.

   Aqui queda UNA sola funcion. Cuatro copias de la misma cadena es como se
   desincronizan las cosas: si manana alguien la cambia en un archivo, los
   otros tres siguen leyendo la vieja y la pantalla se queda en blanco sin
   decir por que.
   ══════════════════════════════════════════════════════════════════ */
window.posLlaveSalon = function () {
  var b = '';
  try { b = (window._pos && window._pos.state && window._pos.state.branchId) || ''; } catch (e) {}
  if (!b) { try { b = localStorage.getItem('pos.contexto.sucursal') || ''; } catch (e) {} }
  /* La vieja se borra al pasar: dejarla ahi es guardar basura que ademas
     confunde a quien la encuentre buscando este mismo fallo. */
  try { localStorage.removeItem('pos.config.salon.v1'); } catch (e) {}
  return 'pos.config.salon.v1.' + (b || 'sin-sede');
};
