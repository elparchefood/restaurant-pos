/* pagina-web.js — la pantalla desde donde el dueño maneja SU página de clientes.
 *
 * Aquí no se CREA nada: la página ya existe desde el día en que se aprobó el
 * restaurante. Lo que se hace aquí es publicarla, ponerle su dirección, decidir
 * cuándo está abierta y qué ve el cliente.
 *
 * La página en sí NO se abre desde Cobra: el cliente la abre en su navegador.
 * Desde aquí solo se configura, y se ve una vista previa.
 *
 * Diseño: handoff "Mi página web" (16-ago). Lo que el handoff traía como datos
 * de ejemplo aquí sale de la base; donde el dato no existe se dice que no
 * existe, nunca se rellena con un número inventado.
 */
(function () {
  'use strict';

  var ACCESO = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/web-acceso';
  var DOMINIO = 'cobrapos.app/';
  /* Las 5 secciones que el dueño puede apagar. LO QUE FALTA SE MUESTRA: el día
     que se agregue una sección nueva no puede aparecer apagada para todos los
     restaurantes que ya existen. */
  var VE = [
    { k: 'puntos', t: 'Sus puntos', s: 'Cuántos puntos lleva acumulados contigo.' },
    { k: 'canje', t: 'Catálogo de canje', s: 'Los premios que puede reclamar con sus puntos.', ir: 'configuracion.html#puntos', irT: 'Editar el catálogo' },
    { k: 'nivel', t: 'Nivel y barra de experiencia', s: 'Qué tan cerca está del siguiente nivel.' },
    { k: 'saldo', t: 'Saldo recargable', s: 'La plata que tiene cargada para gastar contigo.' },
    { k: 'carta', t: 'La carta', s: 'Tus productos con foto y precio.', ir: 'catalogo-productos.html', irT: 'Editar la carta' },
  ];
  var DIAS = [['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'], ['jueves', 'Jueves'],
              ['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo']];

  /* LAS PESTAÑAS. Agrupadas por lo que uno viene a HACER, no por parecido:
     "cuándo abro" junta cuatro tarjetas que antes estaban sueltas y que siempre
     se miran juntas, y deja la dirección y el QR —que se tocan una vez y no se
     vuelven a mirar— fuera del camino de todos los días. */
  var TABS = [
    { k: 'pagina',  t: 'Tu página',        secs: ['direccion', 'publicar'] },
    { k: 'horario', t: 'Cuándo abres',     secs: ['estado', 'mano', 'cierres', 'pedidos'] },
    { k: 've',      t: 'Qué ve el cliente', secs: ['ve', 'destacados', 'fondo', 'publicidad', 'avisos'] },
    { k: 'prueba',  t: 'Probar y medir',   secs: ['probar', 'comova'] },
    /* La pestana de la app va de ultima y es ANCHA: son tablas, y la vista
       previa del celular al lado las dejaria en una columna ilegible. */
    { k: 'clientes', t: 'Clientes de la app', ancha: true, secs: ['wApp'] },
  ];

  var S = {
    t: null,          // la fila de tenants
    marca: '',        // el nombre que ve el cliente
    estado: null,     // lo que devuelve fn_web_estado
    horarios: null,   // los de ia_config
    stats: null,
    productos: null,  // la carta, para el buscador de destacados
    promos: null,     // las imagenes de publicidad
    combos: null,     // para poder mandar una imagen a un combo
    grupoAbierto: null, // que categoria esta desplegada en la lista
    buscar: '',       // lo que se escribio en el buscador de productos
    hueco: 0,         // que puesto de los tres se esta llenando
    prev: 'movil',
    tab: 'pagina',
    web: null,        // lo de la app: embudo, usuarios, movimientos, solicitudes
    /* Lo de las sub-pestanas de la app: cual esta abierta, que se busco, que
       filtro esta puesto y cuantas filas se han pedido en cada lista. */
    sub: 'resumen',
    wq: '',
    wf: 'todos',
    tope: {},
    dar: null,        // que se esta regalando en el modal
    recarga: 0,       // sube cada vez que se guarda algo, para refrescar la vista previa
    tel: '',
    cierre: 'hoy',    // la opción marcada en el modal de cerrar
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function sb() { return (window._pos && window._pos.sb) || window.sb; }
  function COP(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-CO'); }
  function num(n) { return (Number(n) || 0).toLocaleString('es-CO'); }
  function ve(k) { return ((S.t && S.t.web_visible) || {})[k] !== false; }

  /* Las horas se guardan en 24 h y se muestran como las dice la gente. */
  function h12(t) {
    var m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(t || '');
    var hh = Number(m[1]), am = hh < 12, h = hh % 12;
    return (h === 0 ? 12 : h) + ':' + m[2] + ' ' + (am ? 'a.m.' : 'p.m.');
  }

  // ── Avisos ─────────────────────────────────────────────────────────
  var toastEl = null;
  function toast(msg) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'cc-toast';
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    var mio = toastEl;
    setTimeout(function () { if (mio.parentNode) mio.remove(); if (toastEl === mio) toastEl = null; }, 2600);
  }
  function guardando(si) { $('pw-guardando').className = 'pw-guardando' + (si ? ' ver' : ''); }

  // ── Cargar ─────────────────────────────────────────────────────────
  async function cargar() {
    var s = sb();
    if (!s) { setTimeout(cargar, 400); return; }

    /* MODULO EN PRUEBAS, solo para el administrador de la plataforma.
       Esconder el boton no protege nada: cualquiera puede escribir la direccion
       de esta pantalla. El candado va aqui, y ademas la base no le devolveria
       datos a quien no sea dueño de ese restaurante. */
    try {
      var adm = await s.rpc('es_admin_plataforma');
      if (!adm || adm.data !== true) { window.location.href = 'dashboard.html'; return; }
    } catch (e) { window.location.href = 'dashboard.html'; return; }

    /* El restaurante sale de la SESIÓN, nunca "el primero que se pueda ver":
       un administrador de plataforma ve todos, y adivinar le abriría la página
       de otro negocio. */
    var tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    if (!tenantId) {
      try {
        var u = await s.auth.getUser();
        tenantId = u.data && u.data.user && u.data.user.user_metadata && u.data.user.user_metadata.tenant_id;
      } catch (e2) {}
    }
    if (!tenantId) { $('pw-main').innerHTML = '<div class="pw-cargando">Tu cuenta no tiene un restaurante asignado. Vuelve a iniciar sesión.</div>'; return; }

    var r = await s.from('tenants')
      .select('id,name,slug,web_activa,web_cerrado_manual,web_cerrado_hasta,web_cierres,web_programar_pedidos,web_visible,web_destacados,web_banner,web_avisos')
      .eq('id', tenantId).maybeSingle();
    if (r.error || !r.data) { $('pw-main').innerHTML = '<div class="pw-cargando">No se pudo cargar. Recarga la pantalla.</div>'; return; }
    S.t = r.data;
    if (!S.t.web_visible || typeof S.t.web_visible !== 'object') S.t.web_visible = {};
    if (!Array.isArray(S.t.web_cierres)) S.t.web_cierres = [];

    await Promise.all([cargarMarca(tenantId), cargarHorario(tenantId), cargarEstado(tenantId),
                       cargarStats(tenantId), cargarProductos(tenantId), cargarPromos(tenantId),
                       cargarCombos(tenantId)]);

    /* Desde Clientes se entra directo a "Clientes de la app": sin esto el
       atajo dejaba al dueno en "Tu pagina" y tocaba buscar la pestana. */
    var qTab = (new URLSearchParams(location.search)).get('tab');
    if (qTab && TABS.some(function (x) { return x.k === qTab; })) S.tab = qTab;

    pintar();
  }

  /* El nombre que ve el cliente es el de la MARCA, no el de la cuenta: la
     cuenta suele estar registrada con el correo del dueño. */
  async function cargarMarca(id) {
    try {
      var r = await sb().from('brands').select('name').eq('tenant_id', id).order('created_at').limit(1);
      S.marca = (r.data && r.data[0] && r.data[0].name) || S.t.name || '';
    } catch (e) { S.marca = S.t.name || ''; }
  }

  async function cargarHorario(id) {
    try {
      var b = await sb().from('branches').select('id').eq('tenant_id', id).order('created_at').limit(1);
      var bid = b.data && b.data[0] && b.data[0].id;
      if (!bid) return;
      var c = await sb().from('ia_config').select('horarios').eq('branch_id', bid).limit(1);
      S.horarios = (c.data && c.data[0] && c.data[0].horarios) || null;
    } catch (e) {}
  }

  /* El estado NO se calcula aquí. Lo calcula la misma función que usa la página
     del cliente, así que lo que ve el dueño y lo que ve el cliente no se pueden
     desincronizar nunca. */
  async function cargarEstado(id) {
    try {
      var r = await sb().rpc('fn_web_estado', { p_tenant: id });
      S.estado = (r.data && r.data[0]) || null;
    } catch (e) { S.estado = null; }
  }

  /* La carta, para poder elegir los destacados. Solo lo que se necesita para
     pintar una lista: pedir la carta entera con presentaciones y variables seria
     traer megas para mostrar un nombre y una foto. */
  async function cargarProductos(id) {
    try {
      var r = await sb().from('pos_products')
        .select('id,name,photo_url,image_url,price,available,category_id')
        .eq('tenant_id', id).order('name');
      var c = await sb().from('pos_categories').select('id,name').eq('tenant_id', id);
      var cats = {};
      (c.data || []).forEach(function (x) { cats[x.id] = x.name; });
      S.productos = (r.data || []).map(function (p) {
        return { id: p.id, nombre: p.name, foto: p.photo_url || p.image_url || '',
                 precio: p.price, hay: p.available !== false, cat: cats[p.category_id] || '' };
      });
    } catch (e) { S.productos = []; }
  }

  /* Los combos, para poder mandar una imagen del banner directo a uno. Van
     aparte de `S.productos` porque NO son productos: viven en su propia tabla
     y en la carta del cliente llevan el prefijo `combo:` en el id. */
  async function cargarCombos(id) {
    try {
      var r = await sb().from('pos_combos')
        .select('id,name,photo_url,price,active')
        .eq('tenant_id', id).eq('active', true).order('name');
      S.combos = (r.data || []).map(function (c) {
        return { id: 'combo:' + c.id, nombre: c.name, foto: c.photo_url || '',
                 precio: c.price, hay: true, cat: 'Combos' };
      });
    } catch (e) { S.combos = []; }
  }

  async function cargarPromos(id) {
    try {
      var r = await sb().from('pos_promos').select('*').eq('tenant_id', id).order('orden').order('id');
      S.promos = r.data || [];
    } catch (e) { S.promos = []; }
  }

  async function cargarStats(id) {
    S.stats = { clientes: null, semana: null, pedidos: null };
    var s = sb(), hace7 = new Date(Date.now() - 7 * 864e5).toISOString();
    try {
      /* "Clientes registrados" = los que han ENTRADO a la página alguna vez. Se
         cuentan sesiones distintas por cliente, no filas de pos_clientes: casi
         todos los clientes llegaron por el chat, no por la página, y contarlos
         a todos sería inflar el número. */
      var a = await s.from('pos_web_sesiones').select('cliente_id').eq('tenant_id', id);
      if (!a.error && a.data) S.stats.clientes = new Set(a.data.map(function (x) { return x.cliente_id; })).size;

      var b = await s.from('pos_web_sesiones').select('cliente_id').eq('tenant_id', id).gte('created_at', hace7);
      if (!b.error && b.data) S.stats.semana = new Set(b.data.map(function (x) { return x.cliente_id; })).size;

      var c = await s.from('pos_orders').select('id', { count: 'exact', head: true })
        .eq('tenant_id', id).eq('origen', 'web').gte('created_at', hace7);
      if (!c.error) S.stats.pedidos = c.count || 0;
    } catch (e) {}
  }

  // ── Pintar ─────────────────────────────────────────────────────────
  function pintar() {
    var t = S.t, viva = !!t.web_activa;
    $('pill-publicada').className = 'mw-badge ' + (viva ? 'ok' : 'neutral');
    $('pill-publicada').textContent = viva ? 'Publicada' : 'Apagada';

    var pinta = {
      direccion: seccionDireccion, publicar: seccionPublicar, estado: seccionEstado,
      mano: seccionMano, cierres: seccionCierres, pedidos: seccionPedidos,
      ve: seccionVe, destacados: seccionDestacados, fondo: seccionFondo, publicidad: seccionPublicidad,
      avisos: seccionAvisos,
      probar: seccionProbar, comova: seccionComoVa,
      wApp: seccionWebApp,
    };
    var tab = TABS.filter(function (x) { return x.k === S.tab; })[0] || TABS[0];

    $('pw-main').innerHTML =
      '<div class="lm-tabsrow pw-tabs">' + TABS.map(function (x) {
        return '<button class="cc-tab' + (x.k === S.tab ? ' on' : '') + '" data-tab="' + x.k + '">' +
          esc(x.t) + avisoTab(x.k) + '</button>';
      }).join('') + '</div>' +
      '<div class="mw-cols' + (tab.ancha ? ' sola' : '') + '"><div class="mw-stack">' +
        tab.secs.map(function (k) { return pinta[k](); }).join('') +
      '</div>' + (tab.ancha ? '' : seccionPrevia()) + '</div>';

    /* El QR solo existe en su pestaña; dibujarlo cuando no está pintado tiraría
       un error en la consola cada vez que se cambia de pestaña. */
    if (S.tab === 'pagina') dibujarQR();
    enganchar();
    if (S.tab === 'clientes') {
      engancharClientesApp();
      /* Se piden los datos la PRIMERA vez que se abre la pestana, no al
         cargar el modulo: son cinco consultas que casi nadie mira. */
      if (!S.web) { S.web = {}; cargarClientesApp().then(pintar); }
      arrancarLectorPW();
    }
  }

  /* Esconder no puede ser TAPAR: si algo esta cerrado o apagado, la pestaña lo
     dice con un punto, aunque no se este mirando. */
  function avisoTab(k) {
    var e = S.estado || {};
    if (k === 'pagina' && !S.t.web_activa) return '<span class="pw-tab-pt"></span>';
    if (k === 'horario' && (S.t.web_cerrado_manual || e.motivo === 'programado' || !S.horarios))
      return '<span class="pw-tab-pt"></span>';
    if (k === 've' && VE.some(function (v) { return !ve(v.k); })) return '<span class="pw-tab-pt gris"></span>';
    /* Una recarga esperando decision se ve desde la pestana, este o no
       abierta: es plata de un cliente que ya consigno. */
    if (k === 'clientes' && S.web && (S.web.solicitudes || []).length) return '<span class="pw-tab-pt"></span>';
    return '';
  }

  // 1 · DIRECCIÓN Y QR
  function seccionDireccion() {
    var url = DOMINIO + (S.t.slug || '');
    return '<section class="mw-card"><div class="mw-addr"><div>' +
      '<div class="mw-eyebrow">La dirección de tu página</div>' +
      '<div class="mw-url"><span class="mw-url-fix">' + DOMINIO + '</span>' +
        '<span class="mw-url-name">' + esc(S.t.slug || '') + '</span></div>' +
      '<p class="mw-sub">Esta es la dirección que tus clientes escriben o abren con el código QR. Es tuya y no cambia sola.</p>' +
      '<div class="mw-actions" style="margin-top:14px">' +
        '<button class="lm-btn-primary" data-a="copiar">Copiar dirección</button>' +
        '<button class="lm-btn-ghost" data-a="cambiar-url">Cambiar dirección</button>' +
      '</div>' +
      '<div class="mw-note"><span>Pega el código QR en las mesas, en el empaque y en la vitrina. Cada persona que lo escanea queda registrada como cliente tuyo.</span></div>' +
      '</div><div class="mw-qr">' +
        '<canvas id="qr-canvas" width="180" height="180"></canvas>' +
        '<div class="mw-qr-cap">Lleva a<br><strong>' + esc(url) + '</strong></div>' +
        '<div class="mw-qr-btns">' +
          '<button class="lm-btn-ghost" data-a="qr-descargar">Descargar el QR</button>' +
          '<button class="lm-btn-ghost" data-a="qr-mesa">Hoja para la mesa</button>' +
        '</div>' +
      '</div></div></section>';
  }

  // 2 · PUBLICAR
  function seccionPublicar() {
    var viva = !!S.t.web_activa;
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Publicar</h2>' +
        '<p class="mw-sub">Decide si tus clientes ya pueden entrar a la página.</p></div></div>' +
      '<div class="mw-pub' + (viva ? ' on' : '') + '">' +
        '<div class="mw-grow">' +
          '<div class="mw-pub-t">' + (viva ? 'Tu página está publicada' : 'Tu página está apagada') + '</div>' +
          '<div class="mw-pub-s">' + (viva
            ? 'Cualquiera que abra la dirección o escanee el QR entra sin problema.'
            : 'La página existe, pero a quien entre le dice que todavía no está abierta.') + '</div>' +
        '</div>' +
        sw('publicar', viva, 'mw-switch-lg', 'Publicar la página') +
      '</div></section>';
  }

  function sw(accion, on, clase, etiqueta, texto) {
    return '<button class="cc-switch' + (on ? ' on' : '') + (clase ? ' ' + clase : '') +
      '" data-sw="' + accion + '" aria-label="' + esc(etiqueta || '') + '" role="switch" aria-checked="' + !!on + '">' +
      (texto ? '<span class="cc-switch-label">' + (on ? 'Encendido' : 'Apagado') + '</span>' : '') +
      '<span class="cc-switch-track"><span class="cc-switch-knob"></span></span></button>';
  }

  // 3 · ESTADO AHORA MISMO
  function seccionEstado() {
    var e = S.estado || {}, hay = !!S.horarios;
    var tono = 'neutral', titulo = 'Sin información', badge = '', clase = 'neutral';

    if (!hay) {
      tono = 'warn'; titulo = 'Sin horario configurado'; badge = 'Falta el horario'; clase = 'warn';
    } else if (S.t.web_cerrado_manual) {
      tono = 'closed'; titulo = 'Cerrado a mano'; badge = 'Tú lo cerraste'; clase = 'warn';
    } else if (e.motivo === 'programado') {
      tono = 'warn'; titulo = 'Cerrado por temporada'; badge = 'Cierre programado'; clase = 'warn';
    } else if (e.abierto) {
      tono = 'open'; titulo = 'Abierto'; badge = 'Recibiendo pedidos'; clase = 'ok';
    } else {
      tono = 'closed'; titulo = 'Cerrado por horario'; badge = 'Fuera de horario'; clase = 'neutral';
    }

    /* El detalle viene del servidor y a veces ya trae la hora escrita en 12
       horas. Convertirla otra vez producía "6:30 a.m. p.m.". */
    var det = String(e.detalle || '');
    if (det && !/[ap]\.?\s?m\.?/i.test(det)) {
      det = det.replace(/(\d{1,2}):(\d{2})/g, function (_, hh, mm) { return h12(hh + ':' + mm); });
    }

    var hoy = hoyHorario();
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Estado ahora mismo</h2>' +
        '<p class="mw-sub">Así ve tu restaurante un cliente que entre en este momento.</p></div></div>' +
      '<div class="mw-state" data-tone="' + tono + '"><span class="mw-state-dot"></span>' +
        '<div class="mw-grow"><div class="mw-state-t">' + titulo + '</div>' +
          '<div class="mw-state-s">' + esc(det || '—') + '</div></div>' +
        '<span class="mw-badge ' + clase + '">' + badge + '</span></div>' +
      '<div class="mw-sched"><div class="mw-sched-txt">' +
        (hay ? (hoy ? 'Horario de hoy: <strong>' + esc(hoy) + '</strong>' : 'Hoy el restaurante no abre')
             : 'Todavía no has puesto los horarios de atención') + '</div>' +
        '<button class="lm-link" data-a="horario">' + (hay ? 'Editar el horario →' : 'Poner el horario →') + '</button>' +
      '</div></section>';
  }

  function hoyHorario() {
    if (!S.horarios) return '';
    var k = DIAS[(new Date().getDay() + 6) % 7][0];   // getDay(): 0 = domingo
    var d = S.horarios[k];
    if (!d || !d.activo) return '';
    return h12(d.abre) + ' a ' + h12(d.cierra);
  }

  // 4 · CERRAR A MANO
  function seccionMano() {
    var cerrado = !!S.t.web_cerrado_manual;
    var hasta = S.t.web_cerrado_hasta;
    var cuerpo = cerrado
      ? '<div class="mw-alert"><span class="mw-alert-ico">!</span><div class="mw-grow">' +
          '<div class="mw-alert-t">El restaurante está cerrado a mano</div>' +
          '<div class="mw-alert-s">' + (hasta
            ? 'Vuelve a abrir solo mañana, con el horario de siempre.'
            : 'Va a seguir cerrado hasta que toques “Volver a abrir”. Nadie más lo abre por ti.') + '</div>' +
        '</div><button class="mw-btn-success" data-a="reabrir">Volver a abrir</button></div>'
      : '<div class="mw-row"><div class="mw-grow"><div class="mw-trow-t">El restaurante está recibiendo con normalidad</div>' +
          '<div class="mw-trow-s">Sigue tu horario de siempre.</div></div>' +
          '<button class="mw-btn-dangerghost" data-a="cerrar-ahora">Cerrar ahora</button></div>';
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Cerrar a mano</h2>' +
        '<p class="mw-sub">Para cuando toca cerrar sin aviso: se acabó el producto, un imprevisto, un daño.</p></div></div>' +
      cuerpo + '</section>';
  }

  // 5 · CIERRES PROGRAMADOS
  function seccionCierres() {
    var lista = S.t.web_cierres || [];
    var hoy = new Date().toISOString().slice(0, 10);
    var cuerpo;
    if (!lista.length) {
      cuerpo = '<div class="mw-empty"><div class="mw-empty-t">Todavía no hay cierres programados</div>' +
        '<div class="mw-empty-s">Cuando sepas que vas a cerrar unos días, prográmalo y la página lo hace sola.</div>' +
        '<button class="lm-btn-ghost sm" style="margin-top:12px" data-a="add-cierre">Agregar el primero</button></div>';
    } else {
      cuerpo = '<div class="mw-list">' + lista.map(function (c, i) {
        var activo = c.desde <= hoy && hoy <= c.hasta;
        return '<div class="mw-item' + (activo ? ' active' : '') + '">' +
          '<span class="mw-item-dates">' + esc(fecha(c.desde)) + ' — ' + esc(fecha(c.hasta)) + '</span>' +
          '<span class="mw-grow mw-item-why">' + esc(c.motivo || 'Cerrado') + '</span>' +
          '<span class="mw-badge ' + (activo ? 'warn' : 'neutral') + '">' + (activo ? 'Cerrado ahora' : 'Programado') + '</span>' +
          '<button class="lm-icon-sm" data-del="' + i + '" aria-label="Quitar este cierre">✕</button>' +
        '</div>';
      }).join('') + '</div>';
    }
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Cierres programados</h2>' +
        '<p class="mw-sub">Para lo que ya sabes con anticipación: vacaciones, un festivo, una remodelación.</p></div>' +
        '<button class="lm-btn-ghost sm" data-a="add-cierre">Agregar cierre</button></div>' +
      cuerpo + '</section>';
  }

  function fecha(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1].slice(2)) : String(iso || '');
  }

  // 6 · PEDIDOS CUANDO ESTÁ CERRADO
  function seccionPedidos() {
    var on = !!S.t.web_programar_pedidos;
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Pedidos cuando está cerrado</h2>' +
        '<p class="mw-sub">Qué pasa si un cliente quiere pedir mientras el restaurante está cerrado.</p></div>' +
        sw('pedidos', on, '', 'Recibir pedidos cuando está cerrado', true) + '</div>' +
      '<div class="mw-explain">' +
        '<div class="mw-exp' + (on ? ' on' : '') + '"><div class="mw-exp-l">Encendido</div>' +
          '<div class="mw-exp-t">Aunque esté cerrado, el cliente puede dejar su pedido programado para después.</div></div>' +
        '<div class="mw-exp' + (on ? '' : ' on') + '"><div class="mw-exp-l">Apagado</div>' +
          '<div class="mw-exp-t">El cliente ve que ahora no se puede pedir porque el restaurante está cerrado.</div></div>' +
      '</div>' +
      '<div class="mw-note"><span>Estar cerrado no apaga la página. El cliente entra igual, ve sus puntos, recarga saldo y navega la carta. Lo único que cambia es si puede mandar un pedido.</span></div>' +
      '</section>';
  }

  // 7 · QUÉ VE EL CLIENTE
  function seccionVe() {
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Qué ve el cliente</h2>' +
        '<p class="mw-sub">Enciende solo lo que quieras mostrar en tu página.</p></div></div>' +
      '<div class="mw-toggles">' + VE.map(function (v) {
        return '<div class="mw-trow"><div class="mw-grow"><div class="mw-trow-t">' + esc(v.t) + '</div>' +
          '<div class="mw-trow-s">' + esc(v.s) +
            (v.ir ? ' <button class="lm-link" style="font-size:11.5px" data-ir="' + esc(v.ir) + '">' + esc(v.irT) + ' →</button>' : '') +
          '</div></div>' + sw('ve:' + v.k, ve(v.k), '', v.t) + '</div>';
      }).join('') + '</div></section>';
  }

  // 7b · LOS DESTACADOS
  /* Tres puestos, en orden: el primero es el que mas se mira. Un puesto vacio no
     es un error — se llena solo con el plato mas caro con foto de una categoria,
     que es lo que la pagina ha venido haciendo desde el principio. */
  function seccionDestacados() {
    var ids = S.t.web_destacados || [];
    var libres = 3 - ids.filter(Boolean).length;
    var huecos = '';
    for (var i = 0; i < 3; i++) {
      var p = productoDe(ids[i]);
      huecos += '<div class="pw-hueco' + (p ? ' lleno' : '') + '">' +
        '<span class="pw-hueco-n">' + (i + 1) + '</span>' +
        (p
          ? (p.foto ? '<span class="pw-hueco-foto" style="background-image:url(' + esc(p.foto) + ')"></span>'
                    : '<span class="pw-hueco-foto"></span>') +
            '<span class="pw-hueco-tx"><b>' + esc(p.nombre) + '</b>' +
              '<small>' + esc(p.cat || '') + (p.hay ? '' : ' · agotado') + '</small></span>' +
            '<span class="pw-hueco-btns">' +
              (i > 0 ? '<button class="lm-icon-sm" data-dsub="' + i + '" title="Subir">↑</button>' : '') +
              '<button class="lm-icon-sm" data-dquitar="' + i + '" title="Quitar">✕</button>' +
            '</span>'
          : '<button class="pw-hueco-add" data-dponer="' + i + '">+ Elegir un producto</button>' +
            '<span class="pw-hueco-auto">Ahora lo escoge el sistema</span>') +
      '</div>';
    }
    /* Si eligio un producto que despues borro o agoto, hay que decirlo AQUI: en
       la pagina del cliente el puesto se rellena solo y el dueño no se entera. */
    var perdidos = ids.filter(Boolean).filter(function (id) { return !productoDe(id); }).length;
    var agotados = ids.filter(Boolean).map(productoDe).filter(function (p) { return p && !p.hay; }).length;

    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Productos destacados</h2>' +
        '<p class="mw-sub">Los tres platos grandes del inicio de tu página. Ponlos en el orden que quieras: el primero es el que más se mira.</p></div>' +
        (libres < 3 ? '<button class="lm-btn-ghost sm" data-a="dest-limpiar">Volver a automático</button>' : '') +
      '</div>' +
      '<div class="pw-huecos">' + huecos + '</div>' +
      (perdidos ? '<div class="mw-note warn"><span>' + perdidos + ' de los que elegiste ya no está en tu carta. Ese puesto lo está llenando el sistema.</span></div>' : '') +
      (agotados ? '<div class="mw-note warn"><span>Hay ' + agotados + ' destacado marcado como agotado. El cliente lo ve igual, pero no lo va a poder pedir.</span></div>' : '') +
      '</section>';
  }

  function productoDe(id) {
    if (!id) return null;
    return (S.productos || []).filter(function (p) { return String(p.id) === String(id); })[0] || null;
  }

  // 7c · LA PUBLICIDAD
  /* Las imagenes que rotan en el cuadro del inicio. Se guardan en el almacen y
     en la base va solo la direccion: una imagen dentro de la fila viajaria en
     cada visita a la pagina. */
  /* ── EL FONDO DEL BANNER DE TEXTO ──────────────────────────────────
     El bloque de "Pide hoy y suma puntos" era vino tinto para todos los
     restaurantes: un color escrito en el CSS. Aqui el dueNo elige el suyo —
     un color, un degradado o su propia foto.

     Con foto va SIEMPRE un velo oscuro encima. No es un adorno: el texto es
     blanco y sobre una foto clara desaparece. Por eso el velo se puede
     graduar pero no apagar. */
  var BANNER_PRESETS = [
    { n: 'Vino',    a: '#2a1a1e', b: '#5d2233' },
    { n: 'Noche',   a: '#111827', b: '#334155' },
    { n: 'Café',    a: '#231a12', b: '#6b4423' },
    { n: 'Bosque',  a: '#0f2417', b: '#276749' },
    { n: 'Océano',  a: '#0c1e33', b: '#1a5f8a' },
    { n: 'Ciruela', a: '#231436', b: '#6b21a8' },
  ];

  function bnr() {
    var b = S.t.web_banner;
    return (b && typeof b === 'object') ? b : { tipo: 'degradado', color: '#2a1a1e', color2: '#5d2233', angulo: 140 };
  }

  function bannerEstilo(b) {
    if (b.tipo === 'color')     return 'background:' + esc(b.color || '#2a1a1e');
    if (b.tipo === 'imagen' && b.imagen)
      return 'background-image:url(' + esc(b.imagen) + ');background-size:cover;background-position:center';
    var ang = isFinite(Number(b.angulo)) ? Number(b.angulo) : 140;
    return 'background:linear-gradient(' + ang + 'deg,' + esc(b.color || '#2a1a1e') + ' 0%,' + esc(b.color2 || b.color || '#5d2233') + ' 100%)';
  }

  function seccionFondo() {
    var b = bnr();
    var velo = isFinite(Number(b.velo)) ? Number(b.velo) : 0.55;
    var tipos = [['degradado', 'Degradado'], ['color', 'Un color'], ['imagen', 'Mi imagen']];

    /* La muestra es el MISMO bloque que ve el cliente, con su texto y sus
       botones: es la unica forma de saber si el texto se lee. Un cuadro de
       color suelto no dice nada. */
    var muestra = '<div class="pw-bnr-demo" style="' + bannerEstilo(b) + '">' +
      (b.tipo === 'imagen' && b.imagen
        ? '<span class="pw-bnr-velo" style="background:rgba(0,0,0,' + velo.toFixed(2) + ')"></span>' : '') +
      '<div class="pw-bnr-demo-tx">' +
        '<b>Pide hoy y suma puntos</b>' +
        '<small>Cada pedido te acerca a tu próximo premio</small>' +
        '<span class="pw-bnr-demo-btns"><i>Ver la carta</i><u>Mis puntos</u></span>' +
      '</div></div>';

    var cuerpo = '';
    if (b.tipo === 'imagen') {
      cuerpo =
        '<div class="pw-bnr-fila">' +
          '<button class="lm-btn-ghost sm" data-a="bnr-imagen">' + (b.imagen ? 'Cambiar la imagen' : 'Subir una imagen') + '</button>' +
          (b.imagen ? '<button class="lm-icon-sm" data-a="bnr-quitar-img" title="Quitar">✕</button>' : '') +
        '</div>' +
        (b.imagen
          ? '<label class="pw-bnr-velo-lb"><span>Qué tan oscura va la capa de encima</span>' +
              '<input type="range" id="pw-bnr-velo" min="0.15" max="0.85" step="0.05" value="' + velo + '">' +
              '<b id="pw-bnr-velo-n">' + Math.round(velo * 100) + '%</b></label>' +
            '<div class="mw-note"><span>Esa capa es la que deja leer el texto. Si la bajas mucho, la foto se ve más pero las letras se pierden.</span></div>'
          : '<div class="mw-note"><span>Que sea una foto ancha y sin texto: el texto lo pone la página encima.</span></div>');
    } else {
      var lista = BANNER_PRESETS.map(function (p, i) {
        var est = b.tipo === 'color' ? 'background:' + p.a
                : 'background:linear-gradient(140deg,' + p.a + ' 0%,' + p.b + ' 100%)';
        return '<button class="pw-bnr-p" data-bnrp="' + i + '" style="' + est + '" title="' + esc(p.n) + '"></button>';
      }).join('');
      cuerpo =
        '<div class="pw-bnr-presets">' + lista + '</div>' +
        '<div class="pw-bnr-fila">' +
          '<label class="pw-bnr-col"><span>' + (b.tipo === 'color' ? 'Color' : 'Color de arriba') + '</span>' +
            '<input type="color" id="pw-bnr-c1" value="' + esc(b.color || '#2a1a1e') + '"></label>' +
          (b.tipo === 'degradado'
            ? '<label class="pw-bnr-col"><span>Color de abajo</span>' +
                '<input type="color" id="pw-bnr-c2" value="' + esc(b.color2 || '#5d2233') + '"></label>' +
              '<label class="pw-bnr-col"><span>Inclinación</span>' +
                '<input type="range" id="pw-bnr-ang" min="0" max="360" step="10" value="' + (isFinite(Number(b.angulo)) ? Number(b.angulo) : 140) + '"></label>'
            : '') +
        '</div>';
    }

    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Fondo del mensaje</h2>' +
        '<p class="mw-sub">El bloque de bienvenida que va en el inicio de tu página, junto a los tres platos.</p></div>' +
        (S.t.web_banner ? '<button class="lm-btn-ghost sm" data-a="bnr-reset">Volver al de siempre</button>' : '') +
      '</div>' +
      muestra +
      '<div class="pw-bnr-tipos">' + tipos.map(function (t) {
        return '<button class="pw-bnr-tipo' + (b.tipo === t[0] ? ' on' : '') + '" data-bnrt="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      cuerpo +
      '<input type="file" id="pw-bnr-file" accept="image/*" hidden>' +
      '</section>';
  }

  /* ── LOS AVISOS AL CELULAR ─────────────────────────────────────────
     Los textos vivian escritos en el servidor: los mismos para todos los
     restaurantes y sin forma de cambiarles una palabra. Aqui los edita cada
     dueño; lo que no toque usa el de fabrica, asi que nadie tiene que escribir
     siete mensajes para empezar a usarlo.

     Las variables van entre llaves y se insertan con un boton: escribirlas a
     mano es la forma mas facil de equivocarse, y una variable mal escrita se
     borra sola al enviar en vez de salir en crudo en el celular del cliente. */
  var AVISOS = [
    { k: 'preparacion',  n: 'Empezamos a prepararlo',
      d: 'Apenas el pedido entra a cocina.', vars: ['negocio'],
      t: 'Manos a la obra 👨‍🍳', c: 'En {negocio} ya están preparando tu pedido.' },
    { k: 'listo_domicilio', n: 'Listo · a domicilio',
      d: 'Cuando lo marcas listo y va para la casa del cliente.', vars: [],
      t: 'Tu pedido está listo', c: 'Sale para tu casa en un momento.' },
    { k: 'listo_recoger', n: 'Listo · para recoger',
      d: 'Cuando el cliente lo va a recoger en el local.', vars: ['negocio'],
      t: '¡Listo para recoger! 🛍️', c: 'Te esperamos en {negocio}.' },
    { k: 'en_camino',    n: 'Va en camino',
      d: 'Cuando el domiciliario sale.', vars: [],
      t: 'Tu pedido va en camino 🛵', c: 'Ya salió para tu dirección.' },
    { k: 'entregado',    n: 'Entregado',
      d: 'Al cerrar el pedido.', vars: [],
      t: '¡Buen provecho! 🍟', c: 'Tu pedido fue entregado. Gracias por pedirnos.' },
    { k: 'recarga_con_bono', n: 'Recarga con bono',
      d: 'Cuando recargó y le diste regalo.', vars: ['monto', 'bono', 'saldo'],
      t: '¡Recarga lista! 🎉', c: 'Recargaste {monto} y te regalamos {bono}. Tienes {saldo} — ahora sí, a pedir 🍟' },
    { k: 'recarga_sin_bono', n: 'Recarga sin bono',
      d: 'Cuando recargó por debajo del bono.', vars: ['monto', 'saldo'],
      t: '¡Recarga lista! 🎉', c: 'Recargaste {monto}. Tienes {saldo} — ahora sí, a pedir 🍟' },
  ];
  /* Como se llama cada variable EN CRISTIANO. El dueño no tiene por que saber
     que adentro se llama `saldo`. */
  var VAR_NOM = {
    negocio: 'nombre del negocio', monto: 'lo que recargó',
    bono: 'el regalo', saldo: 'su saldo',
  };
  var EJEMPLO = { negocio: 'El Parche Food', monto: '$50.000', bono: '$5.000', saldo: '$55.000' };

  function avisosDelDueno() {
    var a = S.t.web_avisos;
    return (a && typeof a === 'object') ? a : {};
  }
  /* Lo que hoy le llega al cliente: lo suyo si lo escribio, lo de fabrica si no. */
  function avisoActual(x) {
    var mio = avisosDelDueno()[x.k] || {};
    return {
      titulo: String(mio.titulo || '').trim() || x.t,
      cuerpo: String(mio.cuerpo || '').trim() || x.c,
      propio: !!(String(mio.titulo || '').trim() || String(mio.cuerpo || '').trim()),
    };
  }
  function conEjemplo(txt) {
    return String(txt || '').replace(/\{([a-z_]+)\}/gi, function (m, k) {
      return EJEMPLO[k] !== undefined ? EJEMPLO[k] : m;
    });
  }

  function seccionAvisos() {
    var abierto = S.avisoAbierto || '';
    var filas = AVISOS.map(function (x) {
      var a = avisoActual(x);
      var esta = abierto === x.k;
      var chips = (x.vars || []).map(function (v) {
        return '<button class="pw-var" data-avar="' + x.k + '|' + v + '" title="Insertar">' +
          esc(VAR_NOM[v] || v) + '</button>';
      }).join('');
      return '<div class="pw-aviso' + (esta ? ' abierto' : '') + '">' +
        '<button class="pw-aviso-cab" data-aviso="' + x.k + '">' +
          '<div class="pw-aviso-tx"><b>' + esc(x.n) + '</b>' +
            '<small>' + esc(x.d) + '</small></div>' +
          (a.propio ? '<span class="pw-aviso-mio">Tuyo</span>' : '') +
          '<span class="pw-aviso-fl">' + (esta ? '▲' : '▼') + '</span>' +
        '</button>' +
        (esta
          ? '<div class="pw-aviso-cuerpo">' +
              /* La muestra es una notificacion, no un cuadro de texto: es la
                 unica forma de ver si cabe y si se entiende de una leida. */
              '<div class="pw-notif" id="pw-notif-' + x.k + '">' +
                '<span class="pw-notif-ico">' + esc((S.t.name || 'C').slice(0, 1).toUpperCase()) + '</span>' +
                '<div><b id="pw-nv-t">' + esc(conEjemplo(a.titulo)) + '</b>' +
                  '<span id="pw-nv-c">' + esc(conEjemplo(a.cuerpo)) + '</span></div>' +
              '</div>' +
              '<label class="pw-campo"><span>Título</span>' +
                '<input class="pw-in" id="pw-av-t" maxlength="60" value="' + esc(a.titulo) + '"></label>' +
              '<label class="pw-campo"><span>Mensaje</span>' +
                '<textarea class="pw-in" id="pw-av-c" rows="2" maxlength="160">' + esc(a.cuerpo) + '</textarea></label>' +
              (chips ? '<div class="pw-vars"><span>Insertar:</span>' + chips + '</div>' : '') +
              '<div class="pw-aviso-btns">' +
                '<button class="lm-btn-primary sm" data-avguardar="' + x.k + '">Guardar</button>' +
                (a.propio ? '<button class="lm-btn-ghost sm" data-avreset="' + x.k + '">Volver al de fábrica</button>' : '') +
              '</div>' +
            '</div>'
          : '') +
      '</div>';
    }).join('');

    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Avisos al celular</h2>' +
        '<p class="mw-sub">Lo que le llega al cliente cuando su pedido avanza o cuando recarga. ' +
        'Toca uno para cambiarle las palabras.</p></div></div>' +
      '<div class="pw-avisos">' + filas + '</div>' +
      '<div class="mw-note"><span>Solo le llegan a quien tenga la página instalada y haya aceptado los avisos. ' +
        'Máximo dos líneas: en el celular lo demás se corta.</span></div>' +
      '</section>';
  }

  /* Los sitios a los que puede llevar una imagen. El valor es lo que se guarda
     en `pos_promos.ir_a` y lo entiende la app por su FORMA: una palabra es una
     pantalla, "producto:<id>" es un plato, y lo que empiece por http es la web.
     Asi, el dia que haya un cuarto tipo, no hay que migrar la tabla. */
  var DESTINOS = [
    { v: '',          n: 'Nada (la imagen no se puede tocar)' },
    { v: 'carta',     n: 'La carta' },
    { v: 'puntos',    n: 'Sus puntos y premios' },
    { v: 'billetera', n: 'Su billetera' },
    { v: 'local',     n: 'El local (horarios y dirección)' },
  ];

  function nombreDestino(v) {
    var d = String(v || '');
    if (!d) return '';
    if (/^https?:\/\//i.test(d)) return 'Un enlace';
    if (d.indexOf('producto:') === 0) {
      var id = d.slice(9);
      var p = (S.productos || []).concat(S.combos || [])
        .filter(function (x) { return String(x.id) === id; })[0];
      return p ? p.nombre : (id.indexOf('combo:') === 0 ? 'Un combo' : 'Un producto');
    }
    var e = DESTINOS.filter(function (x) { return x.v === d; })[0];
    return e ? e.n : d;
  }

  function seccionPublicidad() {
    var lista = S.promos || [];
    var cuerpo = lista.length
      ? '<div class="pw-promos">' + lista.map(function (p, i) {
          return '<div class="pw-promo' + (p.activo ? '' : ' off') + '">' +
            '<span class="pw-promo-img"' + (p.imagen ? ' style="background-image:url(' + esc(p.imagen) + ')"' : '') + '></span>' +
            '<div class="pw-promo-tx"><b>' + esc(p.titulo || 'Sin título') + '</b>' +
              '<small>' + (p.activo ? 'Se está mostrando' : 'Apagada') + '</small>' +
              /* A DONDE LLEVA (19-ago, pedido de Sergio). No hay boton visible
                 encima de la imagen: se toca la imagen y ya. El dueNo pone el
                 arte que quiera —con su propio "Pedir ahora" dibujado— y aqui
                 solo se dice a donde va ese toque. */
              '<button class="pw-promo-ir" data-pir="' + i + '">' +
                (p.ir_a ? '↗ ' + esc(nombreDestino(p.ir_a)) : '+ ¿A dónde lleva?') +
              '</button></div>' +
            '<div class="pw-promo-btns">' +
              (i > 0 ? '<button class="lm-icon-sm" data-psub="' + i + '" title="Subir">↑</button>' : '') +
              '<button class="lm-icon-sm" data-pver="' + i + '" title="' + (p.activo ? 'Apagar' : 'Encender') + '">' + (p.activo ? '◉' : '○') + '</button>' +
              '<button class="lm-icon-sm" data-pdel="' + i + '" title="Quitar">✕</button>' +
            '</div></div>';
        }).join('') + '</div>'
      : '<div class="mw-empty"><div class="mw-empty-t">Todavía no has subido publicidad</div>' +
        '<div class="mw-empty-s">Sin imágenes, ese espacio de tu página queda vacío.</div></div>';

    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Publicidad</h2>' +
        '<p class="mw-sub">Las imágenes que van rotando en el inicio de tu página. Se cambian solas cada 6 segundos.</p></div>' +
        '<button class="lm-btn-ghost sm" data-a="promo-nueva">Subir imagen</button></div>' +
      cuerpo +
      '<input type="file" id="pw-promo-file" accept="image/*" hidden>' +
      '<div class="mw-note"><span>Que sean anchas, tipo aviso: se ven mejor a lo largo que cuadradas. Se muestran hasta 5.</span></div>' +
      '</section>';
  }

  // 9 · PROBAR EL ACCESO
  function seccionProbar() {
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Probar el acceso</h2>' +
        '<p class="mw-sub">Comprueba que un cliente puede entrar a tu página y ver sus datos.</p></div></div>' +
      '<div class="mw-step"><div class="mw-step-n">1</div><div class="mw-grow">' +
        '<div class="mw-step-t">Escribe un número de celular</div>' +
        '<div class="mw-step-s">Le va a llegar un código de 6 dígitos por WhatsApp.</div>' +
        '<div class="mw-inline"><input class="cc-input" id="in-tel" inputmode="numeric" maxlength="14" placeholder="300 000 0000">' +
          '<button class="lm-btn-ghost" data-a="enviar-codigo">Enviar código</button></div>' +
        '<div class="mw-note warn" style="max-width:520px"><span>El mensaje de WhatsApp se manda de verdad al número que escribas.</span></div>' +
      '</div></div>' +
      '<div class="mw-step"><div class="mw-step-n">2</div><div class="mw-grow">' +
        '<div class="mw-step-t">Escribe el código que llegó</div>' +
        '<div class="mw-step-s">Con eso comprobamos si ese número ya es cliente tuyo y con qué datos aparece.</div>' +
        '<div class="mw-inline"><input class="cc-input mw-code" id="in-codigo" inputmode="numeric" maxlength="6" placeholder="000000">' +
          '<button class="lm-btn-primary" data-a="comprobar">Comprobar</button></div>' +
        '<div class="mw-result" id="test-result" hidden></div>' +
      '</div></div></section>';
  }

  // 10 · CÓMO VA
  function seccionComoVa() {
    var s = S.stats || {};
    var hay = s.clientes != null;
    function stat(l, v, sub) {
      var vacio = (v == null);
      return '<div class="mw-stat"><div class="mw-stat-l">' + l + '</div>' +
        '<div class="mw-stat-v"' + (vacio ? ' style="color:var(--faint)"' : '') + '>' +
          (vacio ? '—' : num(v)) + '</div>' +
        '<div class="mw-stat-s">' + sub + '</div></div>';
    }
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Cómo va</h2>' +
        '<p class="mw-sub">Se cuenta desde que publicaste la página.</p></div>' +
        '<span class="mw-badge ' + (hay ? 'brand' : 'neutral') + '">' +
          (hay ? 'Al día de hoy' : 'Sin datos todavía') + '</span></div>' +
      '<div class="mw-stats">' +
        stat('Clientes que han entrado', s.clientes, 'Desde que publicaste') +
        stat('Entraron esta semana', s.semana, 'Últimos 7 días') +
        stat('Pedidos desde la página', s.pedidos, 'Últimos 7 días') +
      '</div></section>';
  }

  // 8 · VISTA PREVIA — LA PÁGINA DE VERDAD
  /* Antes esto era una maqueta dibujada aquí. Una maqueta siempre se termina
     despegando de la página real y entonces miente justo cuando más se confía
     en ella. Ahora es la página, cargada de verdad dentro de un marco.

     Se carga al tamaño REAL de un celular y de un computador y se encoge con
     zoom, no se aprieta a 268 px: apretándola saldría el diseño de celular en
     los dos casos y la vista de computador no serviría para nada. */
  var TAMANOS = { movil: [390, 800], desktop: [1280, 820] };

  function seccionPrevia() {
    var t = TAMANOS[S.prev] || TAMANOS.movil;
    /* Lo que cabe de verdad: la columna mide 384, la tarjeta le quita 18 de cada
       lado, el escenario otros 18 y sus bordes un par mas — quedan 309. Se deja
       en 300 con holgura: calcularlo al milimetro se rompe el dia que alguien
       cambie un padding, y aqui pasarse significa recortar la pagina. */
    var caja = S.prev === 'movil' ? 268 : 300;
    var z = caja / t[0];
    // En la vista de computador la barra del navegador va encima y suma alto.
    var barraNav = S.prev === 'desktop' ? 34 : 0;
    return '<aside class="mw-rail"><section class="mw-card">' +
      '<div class="mw-prev-head"><div><h2 class="mw-h">Vista previa</h2>' +
        '<p class="mw-sub" style="margin-top:2px">Es tu página de verdad, no un dibujo.</p></div>' +
        '<div class="cc-seg">' +
          '<button class="' + (S.prev === 'movil' ? 'on' : '') + '" data-prev="movil">Celular</button>' +
          '<button class="' + (S.prev === 'desktop' ? 'on' : '') + '" data-prev="desktop">Computador</button>' +
        '</div></div>' +
      '<div class="mw-prev-stage" style="margin-top:14px">' +
        '<div class="pw-marco ' + S.prev + '" style="width:' + Math.round(t[0] * z) +
          'px;height:' + (Math.round(t[1] * z) + barraNav) + 'px">' +
          (S.prev === 'desktop'
            ? '<div class="mw-desk-bar"><span class="mw-dot"></span><span class="mw-dot"></span><span class="mw-dot"></span>' +
              '<span class="mw-desk-url">' + esc(DOMINIO + (S.t.slug || '')) + '</span></div>'
            : '') +
          '<iframe id="pw-iframe" title="Tu página de clientes" loading="lazy"' +
            ' style="width:' + t[0] + 'px;height:' + t[1] + 'px;transform:scale(' + z.toFixed(4) + ')"' +
            ' src="' + esc(urlPagina() + '/?vp=' + S.recarga) + '"></iframe>' +
        '</div>' +
      '</div>' +
      '<div class="pw-prev-pie">' +
        '<span>Así la ve un cliente que entra por primera vez.</span>' +
        '<span class="mw-actions">' +
          '<button class="lm-link" data-a="prev-recargar">Recargar</button>' +
          '<button class="lm-link" data-a="prev-abrir">Abrir aparte →</button>' +
        '</span>' +
      '</div>' +
      '</section></aside>';
  }

  /* ═══════════════════════════════════════════════════════════════════
   * CLIENTES DE LA APP  ·  20-ago-2026
   *
   * POR QUÉ ESTÁ AQUÍ Y NO EN "CLIENTES":
   * La pantalla de Clientes la ve cualquier restaurante que use Cobra. Esto —
   * quién se registró en la app, cuánto saldo tiene, las recargas y los regalos
   * que damos a mano — solo existe si hay página de clientes, y esa función hoy
   * no se le vende a nadie. Mientras vivió allá, Clientes tenía que esconder
   * media pantalla con `data-solo-pagina` y la ficha cambiaba de forma según el
   * restaurante. Aquí, detrás del candado de es_admin_plataforma, cada cosa se
   * lee entera.
   *
   * CUATRO TARJETAS, CUATRO TRABAJOS DISTINTOS:
   *   1. Quién entra      → el embudo y la actividad de cada registrado.
   *   2. Saldos y recargas→ la plata: qué entró y cuánta comida se debe.
   *   3. Lo que he dado   → los regalos a mano, separados de lo que sí se pagó.
   *   4. Por revisar      → las recargas que el sistema no pudo confirmar solo.
   * ═══════════════════════════════════════════════════════════════════ */

  // ── Traer los datos ────────────────────────────────────────────────
  /* Cada consulta va por separado, no en un Promise.all: si una falla, las
     otras tres tienen que seguir pintando. Un Promise.all ya nos dejó pantallas
     congeladas sin un solo error en la consola. */
  async function cargarClientesApp() {
    var s = sb();
    if (!s || !S.t) return;
    var tid = S.t.id;
    S.web = S.web || {};

    try {
      var e = await s.rpc('fn_web_embudo', { p_tenant: tid });
      S.web.embudo = (e.data || [])[0] || null;
    } catch (err) { console.error('[web/embudo]', err); S.web.embudo = null; }

    try {
      var u = await s.rpc('fn_web_usuarios', { p_tenant: tid });
      S.web.usuarios = u.data || [];
    } catch (err) { console.error('[web/usuarios]', err); S.web.usuarios = []; }

    try {
      var m = await s.from('pos_saldo_mov')
        /* saldo_post FALTABA: la columna "Le quedo" pedia un dato que la
           consulta nunca traia, asi que mostraba $ 0 en TODAS las recargas.
           Un cero de verdad y un cero por falta de dato se ven igual. */
        .select('id, created_at, monto, motivo, referencia, detalle, saldo_post, cliente_id, pos_clientes(nombre, telefono)')
        .eq('tenant_id', tid)
        .in('motivo', ['recarga', 'bono_recarga', 'regalo', 'bono_instalacion'])
        .order('created_at', { ascending: false }).limit(300);
      S.web.movs = m.data || [];
    } catch (err) { console.error('[web/movs]', err); S.web.movs = []; }

    try {
      var p = await s.from('pos_puntos_movimientos')
        .select('id, created_at, telefono, puntos, detalle, quien')
        .eq('tenant_id', tid).eq('tipo', 'regalo')
        .order('created_at', { ascending: false }).limit(200);
      S.web.ptsRegalo = p.data || [];
    } catch (err) { console.error('[web/ptsRegalo]', err); S.web.ptsRegalo = []; }

    try {
      /* LAS YA APLICADAS TAMBIEN SE TRAEN (21-ago, pedido de Sergio): "las que
         ya se abonaron deben aparecer como que ya se aprobó, en verde, porque
         si yo la confirmo se abonaría doble". Esconderlas dejaba al dueño sin
         saber si esa plata entró. Las descartadas si se quedan fuera: esas ya
         las decidió él. */
      var q = await s.from('pos_recargas_solicitudes')
        .select('id, creado, monto_dicho, monto_leido, referencia, comprobante_url, comprobante_huella, estado, aplicado_at, aplicado_monto, aplicado_bono, nota_revision, cliente_id, pos_clientes(nombre, telefono)')
        .eq('tenant_id', tid).neq('estado', 'descartada')
        .order('creado', { ascending: false }).limit(200);
      S.web.solicitudes = q.data || [];
    } catch (err) { console.error('[web/solicitudes]', err); S.web.solicitudes = []; }

    /* El libro de comprobantes ya pagados. Sirve para avisarle al dueño, ANTES
       de que toque Aprobar, que esa foto ya se abonó — con otra solicitud. */
    try {
      var pg = await s.from('pos_recargas_pagadas')
        .select('comprobante_huella, solicitud_id, monto, bono, aplicado_at')
        .eq('tenant_id', tid);
      S.web.pagadas = pg.data || [];
    } catch (err) { console.error('[web/pagadas]', err); S.web.pagadas = []; }
  }

  // ── Ayudas de esta pestaña ─────────────────────────────────────────
  function inicialesPw(n) {
    var t = String(n || '?').trim().split(/\s+/);
    return ((t[0] || '?')[0] + ((t[1] || '')[0] || '')).toUpperCase();
  }
  /* "sin registro" se leia como "esta persona no se registro", que es
     justo lo contrario de lo que pasa: SI se registro (por eso esta en la
     lista) y SI entro (por eso tiene entradas). Lo que faltaba era el dato
     de la ultima visita. Con un guion no se afirma nada que no sea cierto. */
  function fechaPw(v) {
    if (!v) return '—';
    var d = new Date(v), hoy = new Date();
    var mismoDia = d.toDateString() === hoy.toDateString();
    var hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    if (mismoDia) return 'hoy, ' + hora;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + ', ' + hora;
  }
  function telPlano(t) { return String(t || '').replace(/[^0-9]/g, '').replace(/^57/, ''); }
  function nombrePorTel(tel) {
    var t = telPlano(tel);
    var u = (S.web && S.web.usuarios || []).filter(function (x) { return telPlano(x.telefono) === t; })[0];
    return u ? u.nombre : tel;
  }
  function cargandoPw(txt) { return '<div class="pw-cargando">' + esc(txt) + '</div>'; }

  /* ══ CLIENTES DE LA APP, EN SUB-PESTANAS (21-ago, pedido de Sergio) ═════
     Antes eran cinco bloques uno debajo del otro, todos abiertos a la vez: el
     embudo, la tabla de registrados, las recargas, los regalos y las
     solicitudes. Con 31 registrados ya tocaba bajar hasta el fondo para ver
     las recargas por revisar —lo unico que pide una decision—, y cada cliente
     nuevo alargaba la pagina. Con 300 no se acaba nunca.

     Ahora son cinco sub-pestanas y solo se pinta UNA lista a la vez, de a 25
     filas con "ver mas". La pantalla ya no crece por muchos clientes que
     entren.

     RECARGAS Y REGALOS VAN SEPARADOS A PROPOSITO: una recarga es plata que
     entro al banco, un regalo es plata que salio del bolsillo. Verlos en la
     misma lista fue justo lo que hizo que la pantalla vieja no se entendiera.
     Por eso son dos pestanas, no una con un filtro. */
  var PASO = 25;

  var SUBS = [
    { k: 'resumen',  t: 'Resumen' },
    { k: 'personas', t: 'Personas' },
    { k: 'recargas', t: 'Recargas' },
    { k: 'regalos',  t: 'Regalos' },
    { k: 'revisar',  t: 'Por revisar' },
  ];

  /* Los topes de las consultas. Si una lista llega justo a su tope, hay que
     DECIRLO: callarlo hace creer que no hay nada mas viejo. */
  var TOPE_MOVS = 300, TOPE_PTS = 200, TOPE_SOL = 200;

  function recargasDe() {
    return ((S.web && S.web.movs) || []).filter(function (m) {
      return m.motivo === 'recarga' || m.motivo === 'bono_recarga';
    });
  }
  /* El bono por instalar la app tambien es un regalo tuyo: sale de tu bolsillo
     igual que el saldo que das a mano. Se carga desde el 21-ago y hasta ahora
     no se veia en ninguna parte. */
  function regalosDe() {
    return ((S.web && S.web.movs) || []).filter(function (m) {
      return m.motivo === 'regalo' || m.motivo === 'bono_instalacion';
    }).map(function (m) {
      var cli = m.pos_clientes || {};
      return { t: m.created_at, n: cli.nombre || 'Cliente', tel: cli.telefono || '',
               tipo: 'saldo', auto: m.motivo === 'bono_instalacion',
               v: m.monto, mot: m.detalle };
    }).concat(((S.web && S.web.ptsRegalo) || []).map(function (p) {
      return { t: p.created_at, n: nombrePorTel(p.telefono), tel: p.telefono,
               tipo: 'puntos', auto: false, v: p.puntos, mot: p.detalle };
    })).sort(function (a, b) { return new Date(b.t) - new Date(a.t); });
  }

  function tope(k) { return (S.tope && S.tope[k]) || PASO; }

  /* El pie de una lista: cuantas se ven de cuantas y el boton de traer mas.
     Si no sobra ninguna, no se dibuja nada: un pie que siempre dice lo mismo
     es ruido. */
  function pieLista(k, mostradas, total, palabra) {
    if (total <= mostradas) return '';
    return '<div class="pw-mas"><small>Mostrando ' + num(mostradas) + ' de ' +
      num(total) + ' ' + esc(palabra) + '</small>' +
      '<button data-mas="' + k + '">Ver mas</button></div>';
  }
  function avisoTope(cargadas, maximo, que) {
    if (cargadas < maximo) return '';
    return '<p class="pw-tope">Solo se cargaron ' + num(maximo) + ' ' + esc(que) +
      '. Si necesitas ver mas atras, dime y lo ampliamos.</p>';
  }

  // ── La pestana entera: la barra de arriba y la lista que toque ──────
  function seccionWebApp() {
    if (!S.web || !S.web.usuarios) return '<section class="mw-card">' + cargandoPw('Cargando…') + '</section>';
    var k = S.sub || 'resumen';
    var cuenta = {
      personas: (S.web.usuarios || []).length,
      recargas: recargasDe().length,
      regalos:  regalosDe().length,
      /* Solo cuenta lo que ESPERA una decision. Las ya abonadas se ven en la
       lista, pero no son trabajo pendiente y no deben inflar el numero. */
      revisar:  pendientesDe().length,
    };
    var nav = '<div class="pw-snav">' + SUBS.map(function (x) {
      var n = cuenta[x.k];
      var etq = '';
      if (x.k === 'revisar') etq = n ? '<span class="n warn">' + num(n) + '</span>' : '';
      else if (x.k !== 'resumen') etq = '<span class="n">' + num(n) + '</span>';
      return '<button data-sub="' + x.k + '" class="' + (x.k === k ? 'on' : '') + '">' +
        esc(x.t) + etq + '</button>';
    }).join('') + '</div>';

    var cuerpo = k === 'personas' ? webPersonas()
               : k === 'recargas' ? webRecargas()
               : k === 'regalos'  ? webRegalos()
               : k === 'revisar'  ? webRevisar()
               : webResumen();
    return nav + cuerpo;
  }

  // ── RESUMEN: el embudo y los numeros de plata. No crece nunca ───────
  function webResumen() {
    var e = S.web.embudo || {};
    var base = Number(e.pidieron) || 0;
    var pasos = [
      ['Pidieron su código', e.pidieron, num(e.codigos) + ' códigos enviados'],
      ['Se registraron',     e.registrados, base ? Math.round(e.registrados / base * 100) + '% de los que lo pidieron' : '—'],
      ['Activaron avisos',   e.con_avisos, 'reciben el estado del pedido'],
      ['Pidieron por la app', e.con_pedido, Number(e.con_pedido) ? 'personas distintas' : 'todavía ninguno'],
    ];
    var embudo = '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Quién entra a tu página</h2>' +
        '<p class="mw-sub">Dónde se cae la gente entre pedir el código y hacer el pedido.</p></div></div>' +
      '<div class="pw-emb">' + pasos.map(function (x) {
        var pct = base ? Math.round((Number(x[1]) || 0) / base * 100) : 0;
        return '<div class="pw-emb-c"><div class="mw-eyebrow">' + esc(x[0]) + '</div>' +
          '<div class="pw-emb-v">' + num(x[1]) + '</div>' +
          '<div class="mw-sub">' + esc(x[2]) + '</div>' +
          '<div class="pw-emb-b"><i style="width:' + pct + '%"></i></div></div>';
      }).join('') + '</div></section>';

    var recargado = 0, bonos = 0, nRec = 0;
    recargasDe().forEach(function (m) {
      var v = Number(m.monto) || 0;
      if (m.motivo === 'recarga') { recargado += v; nRec++; }
      else { bonos += v; }
    });
    /* El bono NO se suma al total recargado: la plata que entro de verdad son
       las recargas. Sumarlos daria un total que no existe en el banco. */
    var regalado = regalosDe().reduce(function (a, r) {
      return a + (r.tipo === 'saldo' ? (Number(r.v) || 0) : 0);
    }, 0);
    var sinGastar = (S.web.usuarios || []).reduce(function (a, u) { return a + (Number(u.saldo) || 0); }, 0);

    var plata = '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">La plata de la app</h2>' +
        '<p class="mw-sub">Lo que ya te pagaron, lo que regalaste y lo que todavía te pueden cobrar en comida.</p></div></div>' +
      '<div class="pw-minis">' +
        miniK('Recargado por clientes', COP(recargado), num(nRec) + (nRec === 1 ? ' recarga' : ' recargas')) +
        miniK('Bonos de recarga', COP(bonos),
              recargado ? (Math.round(bonos / recargado * 1000) / 10) + '% sobre lo recargado' : '—') +
        miniK('Regalado a mano', COP(regalado), 'salió de tu bolsillo') +
        miniK('Saldo sin gastar', COP(sinGastar), 'comida que aún les debes') +
      '</div></section>';
    return embudo + plata;
  }
  function miniK(l, v, s2) {
    return '<div class="pw-mk"><div class="mw-eyebrow">' + esc(l) + '</div>' +
      '<div class="pw-mk-v">' + esc(v) + '</div><div class="mw-sub">' + esc(s2) + '</div></div>';
  }

  // ── PERSONAS: buscador, filtros y la tabla de a 25 ──────────────────
  var FILTROS_P = [
    { k: 'todos',     t: 'Todos' },
    { k: 'instalada', t: 'Instalada' },
    { k: 'navegador', t: 'Navegador' },
    { k: 'sindato',   t: 'Sin dato' },
    { k: 'saldo',     t: 'Con saldo' },
  ];

  /* Se conserva el PUESTO ORIGINAL de cada persona en la lista completa: los
     botones de Saldo y Puntos identifican al cliente por ese numero, y
     modalDar, si le llega uno que no existe, le da la plata al PRIMERO de la
     lista sin decir nada. Filtrar sin arrastrar el puesto original seria
     regalarle saldo a quien no era. */
  function personasFiltradas() {
    var q = (S.wq || '').toLowerCase().trim();
    var qN = q.replace(/[^0-9]/g, '');
    var f = S.wf || 'todos';
    return (S.web.usuarios || []).map(function (u, i) { return { u: u, i: i }; })
      .filter(function (x) {
        var u = x.u;
        if (f === 'instalada' && u.instalada !== true) return false;
        if (f === 'navegador' && u.instalada !== false) return false;
        if (f === 'sindato'   && u.instalada !== null && u.instalada !== undefined) return false;
        if (f === 'saldo'     && !(Number(u.saldo) > 0)) return false;
        if (!q) return true;
        var nom = String(u.nombre || '').toLowerCase();
        var tel = String(u.telefono || '').replace(/[^0-9]/g, '');
        /* El numero solo se compara si lo que escribieron TIENE digitos: con la
           busqueda vacia, indexOf('') da 0 y coincidiria con todo el mundo.
           Basta un digito: escribir "31" y que la lista se vacie hasta el
           tercero se siente como que el buscador esta roto. */
        return nom.indexOf(q) >= 0 || (qN.length >= 1 && tel.indexOf(qN) >= 0);
      });
  }

  function webPersonas() {
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Registrados en la app</h2>' +
        '<p class="mw-sub">Cada persona con su actividad. Desde aquí le das saldo o puntos.</p></div></div>' +
      '<div class="pw-bar">' +
        '<input class="cc-input" id="pw-wq" placeholder="Buscar por nombre o número…" value="' + esc(S.wq || '') + '">' +
        '<div class="pw-fch">' + FILTROS_P.map(function (f) {
          return '<button data-wf="' + f.k + '" class="' + ((S.wf || 'todos') === f.k ? 'on' : '') + '">' +
            esc(f.t) + '</button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div id="pw-personas-lista">' + listaPersonas() + '</div></section>';
  }

  function listaPersonas() {
    var todas = personasFiltradas();
    if (!todas.length) {
      return (S.web.usuarios || []).length
        ? '<div class="pw-vacio"><b>Nadie coincide</b><p>Prueba con otro nombre, con el número, o quita el filtro.</p></div>'
        : '<div class="pw-vacio"><b>Todavía nadie se ha registrado</b>' +
          '<p>Cuando alguien pida su código y entre, aparece aquí con toda su actividad.</p></div>';
    }
    var pag = todas.slice(0, tope('personas'));
    return '<div class="pw-scr"><div class="pw-row pw-ru pw-cab">' +
        '<div>Persona</div><div>Se registró</div><div>Última vez</div><div>Entradas</div>' +
        '<div>En su celular</div><div>Avisos</div><div>Pedidos</div><div>Saldo</div><div></div></div>' +
      pag.map(function (x) {
        var u = x.u;
        return '<div class="pw-row pw-ru">' +
          '<div class="pw-cn"><div class="pw-av">' + esc(inicialesPw(u.nombre)) + '</div>' +
            '<div><b>' + esc(u.nombre || 'Sin nombre') + '</b>' +
            '<small>' + esc(u.telefono || '') + '</small></div></div>' +
          '<div class="pw-tenue">' + esc(fechaPw(u.alta)) + '</div>' +
          '<div class="pw-tenue">' + esc(fechaPw(u.ultimo)) + '</div>' +
          '<div class="pw-num">' + num(u.entradas) + '</div>' +
          /* INSTALADA O NO. Los tres estados son distintos y hay que verlos:
             instalada / entro por el navegador / todavia no sabemos. "No
             sabemos" no es "no la tiene": es que no ha vuelto a entrar desde
             que el sistema empezo a preguntarlo (21-ago). Sobre esto se decide
             a quien mandarle la campana de "instalala". */
          '<div>' + (function () {
            var ap = u.plataforma === 'ios' ? 'iPhone'
                   : u.plataforma === 'android' ? 'Android'
                   : u.plataforma === 'escritorio' ? 'PC' : '';
            var chip = u.instalada === true
              ? '<span class="mw-badge ok">Instalada</span>'
              : u.instalada === false
                ? '<span class="mw-badge neutral">Navegador</span>'
                : '<span class="pw-tenue">sin dato</span>';
            return chip + (ap ? ' <small class="pw-tenue">' + ap + '</small>' : '');
          })() + '</div>' +
          '<div>' + (Number(u.avisos)
            ? '<span class="mw-badge ok">Activos</span>'
            : '<span class="mw-badge neutral">Apagados</span>') + '</div>' +
          '<div class="pw-num">' + num(u.pedidos_app) + '</div>' +
          '<div class="pw-num">' + COP(u.saldo) + '</div>' +
          '<div class="pw-acc2">' +
            '<button class="lm-btn-ghost pw-mini" data-dar="saldo" data-u="' + x.i + '">Saldo</button>' +
            '<button class="lm-btn-ghost pw-mini" data-dar="puntos" data-u="' + x.i + '">Puntos</button>' +
          '</div></div>';
      }).join('') +
      pieLista('personas', pag.length, todas.length, 'personas') + '</div>';
  }

  // ── RECARGAS: plata que ENTRO ───────────────────────────────────────
  function webRecargas() {
    var todas = recargasDe();
    var cuerpo;
    if (!todas.length) {
      cuerpo = '<div class="pw-vacio"><b>Nadie ha recargado todavía</b>' +
        '<p>Cuando alguien consigne y el sistema lea el comprobante, la recarga y su bono aparecen aquí.</p></div>';
    } else {
      var pag = todas.slice(0, tope('recargas'));
      cuerpo = '<div class="pw-scr"><div class="pw-row pw-rr pw-cab">' +
          '<div>Persona</div><div>Movimiento</div><div>Monto</div><div>Le quedó</div><div>Cuándo</div></div>' +
        pag.map(function (m) {
          var cli = m.pos_clientes || {};
          var esBono = m.motivo === 'bono_recarga';
          return '<div class="pw-row pw-rr">' +
            '<div class="pw-cn"><div class="pw-av">' + esc(inicialesPw(cli.nombre)) + '</div>' +
              '<div><b>' + esc(cli.nombre || 'Cliente') + '</b>' +
              '<small>' + esc(cli.telefono || '') + '</small></div></div>' +
            '<div>' + (esBono
              ? '<span class="mw-badge ok">Bono' + (m.detalle ? ' · ' + esc(m.detalle) : '') + '</span>'
              : '<span class="mw-badge brand">Recarga</span>') + '</div>' +
            '<div class="pw-num">' + COP(m.monto) + '</div>' +
            '<div class="pw-num">' + COP(m.saldo_post) + '</div>' +
            '<div class="pw-tenue">' + esc(fechaPw(m.created_at)) + '</div></div>';
        }).join('') +
        pieLista('recargas', pag.length, todas.length, 'movimientos') + '</div>';
    }
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Recargas</h2>' +
        '<p class="mw-sub">Plata que tus clientes ya te pagaron y todavía te pueden cobrar en comida.</p></div>' +
        '<button class="lm-btn-ghost" data-a="dar-recarga">Registrar una recarga</button></div>' +
      cuerpo + avisoTope(((S.web && S.web.movs) || []).length, TOPE_MOVS, 'movimientos') + '</section>';
  }

  // ── REGALOS: plata que SALIO de tu bolsillo ─────────────────────────
  function webRegalos() {
    var todos = regalosDe();
    var cuerpo;
    if (!todos.length) {
      cuerpo = '<div class="pw-vacio"><b>Todavía no le has regalado nada a nadie</b>' +
        '<p>Cuando des saldo o puntos a mano, cada regalo queda aquí con la persona, el monto, ' +
        'el motivo que escribiste y la hora. Así nunca se confunde con lo que un cliente sí pagó.</p></div>';
    } else {
      var pag = todos.slice(0, tope('regalos'));
      cuerpo = '<div class="pw-scr"><div class="pw-row pw-rr pw-cab">' +
          '<div>Persona</div><div>Qué le diste</div><div>Cuánto</div><div>Motivo</div><div>Cuándo</div></div>' +
        pag.map(function (r) {
          return '<div class="pw-row pw-rr">' +
            '<div class="pw-cn"><div class="pw-av">' + esc(inicialesPw(r.n)) + '</div>' +
              '<div><b>' + esc(r.n) + '</b><small>' + esc(r.tel) + '</small></div></div>' +
            '<div><span class="mw-badge vio">' + (r.auto ? 'Bono por instalar'
                : r.tipo === 'saldo' ? 'Saldo' : 'Puntos') + '</span></div>' +
            '<div class="pw-num">' + (r.tipo === 'saldo' ? COP(r.v) : num(r.v) + ' pts') + '</div>' +
            '<div class="pw-tenue">' + esc(r.mot || 'sin motivo') + '</div>' +
            '<div class="pw-tenue">' + esc(fechaPw(r.t)) + '</div></div>';
        }).join('') +
        pieLista('regalos', pag.length, todos.length, 'regalos') + '</div>';
    }
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Lo que yo he dado</h2>' +
        '<p class="mw-sub">Regalos a mano y bonos automáticos. Nada de esto entró plata a la caja.</p></div>' +
        '<button class="cc-btn-ai" data-a="dar-regalo">Dar saldo o puntos</button></div>' +
      cuerpo + avisoTope(((S.web && S.web.ptsRegalo) || []).length, TOPE_PTS, 'regalos de puntos') + '</section>';
  }

  function pendientesDe() {
    return ((S.web && S.web.solicitudes) || []).filter(function (p) { return p.estado !== 'aplicada'; });
  }
  /* ¿Esta foto ya se abonó, con otra solicitud? Devuelve el renglón del libro. */
  function yaPagada(p) {
    if (!p.comprobante_huella) return null;
    return ((S.web && S.web.pagadas) || []).filter(function (x) {
      return x.comprobante_huella === p.comprobante_huella && String(x.solicitud_id) !== String(p.id);
    })[0] || null;
  }

  // ── POR REVISAR: lo unico que pide una decision tuya ────────────────
  function webRevisar() {
    var ps = (S.web && S.web.solicitudes) || [];
    var nPend = pendientesDe().length;
    if (!ps.length) {
      return '<section class="mw-card">' +
        '<div class="mw-card-head"><div><h2 class="mw-h">Recargas por revisar</h2>' +
          '<p class="mw-sub">El sistema no pudo confirmarlas solo. Mira el comprobante y decide.</p></div></div>' +
        '<div class="pw-vacio"><b>No hay nada esperando</b>' +
        '<p>Cuando el sistema no pueda confirmar una recarga solo, te la deja aquí con su comprobante.</p></div></section>';
    }
    var pag = ps.slice(0, tope('revisar'));
    return '<section class="mw-card">' +
      '<div class="mw-card-head"><div><h2 class="mw-h">Recargas por revisar</h2>' +
        '<p class="mw-sub">El sistema no pudo confirmarlas solo. Mira el comprobante y decide.</p></div>' +
        '<span class="mw-badge ' + (nPend ? 'warn' : 'ok') + '">' +
          (nPend ? num(nPend) + ' pendiente' + (nPend === 1 ? '' : 's') : 'nada pendiente') + '</span></div>' +
      pag.map(function (p) {
        var cli = p.pos_clientes || {};
        var lista = p.estado === 'aplicada';
        var otra  = lista ? null : yaPagada(p);
        return '<div class="pw-sol' + (lista ? ' hecha' : '') + '">' +
          '<div class="pw-sol-izq"><b>' + esc(cli.nombre || 'Cliente') + '</b>' +
            '<small>' + esc(cli.telefono || '') + ' · ' + esc(fechaPw(p.creado)) + '</small>' +
            '<small>Dijo ' + COP(p.monto_dicho) + ' · el comprobante decía ' + COP(p.monto_leido) +
              (p.referencia ? ' · Ref ' + esc(p.referencia) : '') + '</small>' +
            /* Ya abonada: en verde, con lo que entró y cuándo. Sin botones —
               ofrecer "Aprobar" encima de plata ya abonada es la trampa que
               puso a Sergio a un clic de cobrarle doble a un cliente. */
            (lista
              ? '<div class="pw-sol-ok"><span class="mw-badge ok">✓ Ya aprobada</span> ' +
                '<small>Se le abonaron ' + COP(p.aplicado_monto) +
                (Number(p.aplicado_bono) > 0 ? ' + ' + COP(p.aplicado_bono) + ' de bono' : '') +
                (p.aplicado_at ? ' · ' + esc(fechaPw(p.aplicado_at)) : '') + '</small></div>' : '') +
            (lista && p.nota_revision
              ? '<div class="pw-sol-nota">' + esc(p.nota_revision) + '</div>' : '') +
            /* Todavía sin abonar, pero su foto YA se pagó con otra solicitud:
               se le dice antes de decidir, no después de intentarlo. */
            (otra
              ? '<div class="pw-sol-nota">Este mismo comprobante ya se abonó' +
                (otra.aplicado_at ? ' el ' + esc(fechaPw(otra.aplicado_at)) : '') +
                ' (' + COP(otra.monto) + '). Abonarlo otra vez sería cobrar dos veces la misma transferencia.</div>' : '') +
          '</div>' +
          /* La miniatura de 72px no deja LEER el comprobante, que es justo lo
             que hay que hacer antes de aprobar plata. Abre una ventana propia
             con la foto grande; el enlace a otra pestana no servia en el .exe. */
          (p.comprobante_url
            ? '<button class="pw-sol-img" data-ver-comp="' + esc(p.id) + '" title="Ver el comprobante grande">' +
              '<img src="' + esc(p.comprobante_url) + '" alt="Comprobante">' +
              '<span class="pw-lupa">Ampliar</span></button>' : '') +
          (lista ? '' :
            '<div class="pw-sol-der">' +
              /* Si la foto ya se pagó, Descartar pasa a ser el botón fuerte:
                 sigue pudiendo aprobar si él sabe algo que el sistema no, pero
                 lo que la pantalla sugiere es lo correcto. */
              '<button class="' + (otra ? 'lm-btn-ghost' : 'lm-btn-primary') + '" data-sol-ok="' + esc(p.id) + '">Aprobar</button>' +
              '<button class="' + (otra ? 'lm-btn-primary' : 'lm-btn-ghost') + '" data-sol-no="' + esc(p.id) + '">Descartar</button>' +
            '</div>') + '</div>';
      }).join('') +
      (ps.length > pag.length
        ? '<div class="pw-mas"><small>Mostrando ' + num(pag.length) + ' de ' + num(ps.length) +
          ' pendientes</small><button data-mas="revisar">Ver mas</button></div>' : '') +
      avisoTope(ps.length, TOPE_SOL, 'solicitudes') + '</section>';
  }

  // ── Enganchar los botones de esta pestaña ──────────────────────────
  /* VER EL COMPROBANTE DE VERDAD (21-ago, pedido de Sergio). Se muestra a
     tamano completo con la plata que dijo el cliente y la que leyo el sistema
     al lado: es la comparacion que hay que hacer para decidir, y tenerla en la
     misma ventana evita ir y volver. Con zoom, porque las referencias de
     Bancolombia salen en letra chiquita. */
  function verComprobante(id) {
    var p = (S.web && S.web.solicitudes || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p || !p.comprobante_url) return;
    var cli = p.pos_clientes || {};
    var cuadra = Number(p.monto_dicho) === Number(p.monto_leido);
    abrir('<div class="cc-modal pw-comp">' +
      cabezaModal('Comprobante de ' + esc(cli.nombre || 'un cliente'),
                  esc(cli.telefono || '') + ' · ' + esc(fechaPw(p.creado))) +
      '<div class="pw-comp-datos">' +
        '<div><div class="mw-eyebrow">Dijo que consignó</div><b>' + COP(p.monto_dicho) + '</b></div>' +
        '<div><div class="mw-eyebrow">El comprobante dice</div><b class="' + (cuadra ? 'ok' : 'no') + '">' +
          COP(p.monto_leido) + '</b></div>' +
        (p.referencia ? '<div><div class="mw-eyebrow">Referencia</div><b>' + esc(p.referencia) + '</b></div>' : '') +
      '</div>' +
      (cuadra ? '' : '<div class="mw-note warn"><span>Los dos números no coinciden. Mira bien la foto antes de decidir.</span></div>') +
      '<div class="pw-comp-foto" id="pw-comp-foto">' +
        '<img src="' + esc(p.comprobante_url) + '" alt="Comprobante"></div>' +
      '<div class="mw-mo-foot">' +
        '<button class="lm-btn-ghost" id="pw-comp-zoom">Acercar</button>' +
        '<button class="lm-btn-ghost" data-cerrar>Cerrar</button></div>' +
    '</div>');
    /* Acercar y alejar con el mismo boton: dos estados, no una barra. */
    var z = $('pw-comp-zoom'), caja = $('pw-comp-foto');
    if (z && caja) z.onclick = function () {
      var cerca = caja.classList.toggle('cerca');
      z.textContent = cerca ? 'Alejar' : 'Acercar';
      if (cerca) caja.scrollTop = 0;
    };
  }

  function engancharClientesApp() {
    /* Cambiar de sub-pestana empieza de cero en la lista nueva: dejar el tope
       de la anterior haria que una lista se abriera con 200 filas sin razon. */
    document.querySelectorAll('[data-sub]').forEach(function (b) {
      b.onclick = function () { S.sub = b.dataset.sub; S.tope = {}; pintar(); };
    });
    document.querySelectorAll('[data-mas]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.mas;
        S.tope[k] = tope(k) + PASO;
        pintar();
      };
    });
    document.querySelectorAll('[data-wf]').forEach(function (b) {
      b.onclick = function () { S.wf = b.dataset.wf; S.tope.personas = PASO; pintar(); };
    });
    /* El buscador repinta SOLO la lista, no la pestana entera: repintar todo
       le quita el foco al campo y hay que volver a hacer clic tras cada letra. */
    var q = $('pw-wq');
    if (q) q.oninput = function () {
      S.wq = this.value;
      S.tope.personas = PASO;
      var cont = $('pw-personas-lista');
      if (cont) { cont.innerHTML = listaPersonas(); engancharClientesApp(); }
    };
    document.querySelectorAll('[data-dar]').forEach(function (b) {
      b.onclick = function () { modalDar(b.dataset.dar, Number(b.dataset.u)); };
    });
    document.querySelectorAll('[data-ver-comp]').forEach(function (b) {
      b.onclick = function () { verComprobante(b.dataset.verComp); };
    });
    document.querySelectorAll('[data-sol-ok]').forEach(function (b) {
      b.onclick = function () { modalAprobar(b.dataset.solOk); };
    });
    document.querySelectorAll('[data-sol-no]').forEach(function (b) {
      b.onclick = function () { modalDescartar(b.dataset.solNo); };
    });
  }

  // ── Dar saldo o puntos ─────────────────────────────────────────────
  /* Nunca un confirm() del navegador: es la ventana del sistema operativo, no
     la del producto, y encima no deja escribir el motivo. */
  /* ── La tarjeta fisica al dar saldo o puntos (20-ago-2026) ─────────
     Con la pestana de clientes abierta, acercar la tarjeta de alguien al
     lector abre "Dar saldo" YA parado en esa persona: nada de buscarla en la
     lista. Si la tarjeta no esta vinculada o su dueNo no esta registrado en
     la app, se dice. */
  var _nfcPW = false;
  function arrancarLectorPW() {
    if (_nfcPW || !window.posNfc) return;
    _nfcPW = true;
    var t = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    posNfc.setCtx(t);
    posNfc.escuchar(async function (uid) {
      if (S.tab !== 'clientes' || !S.web) return;   // solo en la pestana de clientes
      try {
        var tj = await posNfc.buscar(uid);
        if (!tj) { toast('Esa tarjeta (····' + uid.slice(-4) + ') no está vinculada a nadie'); return; }
        var tel10 = String(tj.telefono).replace(/[^0-9]/g, '').slice(-10);
        var us = (S.web && S.web.usuarios) || [];
        var i = -1;
        us.forEach(function (x, k) {
          if (String(x.telefono || '').replace(/[^0-9]/g, '').slice(-10) === tel10) i = k;
        });
        if (i < 0) { toast('La tarjeta es de ••• ' + tel10.slice(-4) + ', pero esa persona no está registrada en la app'); return; }
        modalDar('recarga', i);
      } catch (e) { toast('No se pudo leer la tarjeta: ' + (e.message || e)); }
    });
  }

  function modalDar(modo, i) {
    arrancarLectorPW();
    var us = (S.web && S.web.usuarios) || [];
    if (!us.length) { toast('Todavía no hay nadie registrado en la app'); return; }
    if (!(i >= 0) || !us[i]) i = 0;
    S.dar = { modo: modo === 'puntos' ? 'puntos' : modo === 'recarga' ? 'recarga' : 'saldo', i: i };
    pintarModalDar();
  }

  function pintarModalDar() {
    var us = S.web.usuarios, d = S.dar, u = us[d.i];
    /* Tres modos, no dos (20-ago): RECARGAR es plata que el cliente PAGO
       (entra a la caja, aplica minimo y bono por los mismos rangos de la
       app); dar saldo y dar puntos son regalos tuyos. */
    var esR = d.modo === 'recarga';
    var esS = d.modo === 'saldo';
    var rapidos = esR ? [40000, 50000, 100000] : esS ? [10000, 20000, 50000] : [100, 200, 500];

    abrir('<div class="cc-modal mw-mo pw-mo-dar">' +
      cabezaModal(esR ? 'Recargar su billetera' : esS ? 'Dar saldo' : 'Dar puntos',
                  esR ? 'Plata que el cliente te pagó aquí en el local.'
                      : 'Queda anotado con tu nombre y la hora.') +
      '<div class="mw-mo-body">' +
        '<div class="cc-seg pw-seg2">' +
          '<button class="' + (esR ? 'on' : '') + '" data-dar-modo="recarga">Recargar</button>' +
          '<button class="' + (esS ? 'on' : '') + '" data-dar-modo="saldo">Dar saldo</button>' +
          '<button class="' + (!esR && !esS ? 'on' : '') + '" data-dar-modo="puntos">Dar puntos</button>' +
        '</div>' +
        '<div class="cc-field" style="margin-top:14px"><label class="cc-label">¿A quién?</label>' +
          '<select class="cc-input" id="pw-dar-quien">' +
            us.map(function (x, k) {
              return '<option value="' + k + '"' + (k === d.i ? ' selected' : '') + '>' +
                esc(x.nombre || 'Sin nombre') + ' · ' + esc(x.telefono || '') + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="cc-field"><label class="cc-label">' +
          (esR ? 'Cuánto te pagó' : esS ? 'Cuánto le vas a dar' : 'Cuántos puntos le vas a dar') + '</label>' +
          '<div class="mw-urlinput"><span>' + (esR || esS ? '$' : 'pts') + '</span>' +
          '<input id="pw-dar-monto" inputmode="numeric" value="' + (esR ? '40.000' : esS ? '20.000' : '200') + '"></div></div>' +
        '<div class="pw-rapidos">' + rapidos.map(function (v) {
          return '<button data-dar-v="' + v + '">' + (esR || esS ? COP(v) : num(v) + ' pts') + '</button>';
        }).join('') + '</div>' +
        (esR ? '' :
        '<div class="cc-field"><label class="cc-label">Por qué</label>' +
          '<input class="cc-input" id="pw-dar-motivo" maxlength="80" ' +
            'placeholder="Ej: recompensa, error en un pedido, prueba"></div>') +
        '<div class="mw-note warn"><span>' + (esR
          ? '<strong>Se acredita por el mismo camino que las recargas de la app:</strong> mismo mínimo y mismo bono por rangos. El bono sale solo, no lo sumes tú.'
          : esS
          ? '<strong>Esto no es una recarga que la persona pagó.</strong> Es plata que tú regalas: no entra a la caja y sale aparte en el informe.'
          : '<strong>Quedan marcados como regalo</strong>, aparte de los puntos que la persona gana comprando.') +
          '</span></div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="cc-btn-ai" id="pw-dar-ok">' + (esR ? 'Recargar' : 'Dárselo') + '</button></div>' +
    '</div>');

    document.querySelectorAll('[data-dar-modo]').forEach(function (b) {
      b.onclick = function () { S.dar.modo = b.dataset.darModo; pintarModalDar(); };
    });
    document.querySelectorAll('[data-dar-v]').forEach(function (b) {
      b.onclick = function () {
        $('pw-dar-monto').value = Number(b.dataset.darV).toLocaleString('es-CO');
      };
    });
    $('pw-dar-quien').onchange = function () { S.dar.i = Number(this.value); };
    $('pw-dar-ok').onclick = confirmarDar;
  }

  async function confirmarDar() {
    var u = S.web.usuarios[S.dar.i];
    var esR = S.dar.modo === 'recarga';
    var esS = S.dar.modo === 'saldo';
    var v = parseInt(String($('pw-dar-monto').value || '').replace(/[^0-9]/g, ''), 10) || 0;
    var motivo = esR ? '' : ($('pw-dar-motivo').value || '').trim();
    if (v <= 0) { toast(esR ? 'Escribe cuánto te pagó' : 'Escribe cuánto le vas a dar'); return; }
    if (!esR && !motivo) { toast('Escribe por qué se lo das'); return; }

    var btn = $('pw-dar-ok');
    btn.disabled = true; btn.textContent = esR ? 'Recargando…' : 'Dándoselo…';
    var yo = (window._pos && window._pos.state && window._pos.state.user) || {};
    try {
      if (esR) {
        /* El MISMO camino de las recargas de la app: fn_recarga_aplicar pone
           el minimo, calcula el bono por rangos y escribe el libro. La
           referencia lleva la hora para que un doble clic no la duplique. */
        var r = await sb().rpc('fn_recarga_aplicar', {
          p_tenant: S.t.id, p_cliente: u.cliente_id, p_monto: v,
          p_ref: 'local:' + u.cliente_id + ':' + Date.now(),
          p_branch: (window._pos.state.branchId || null), p_como: 'en el local',
          p_quien: yo.id || null,
        });
        if (r.error) throw r.error;
        var f = (r.data || [])[0];
        if (!f || f.ok !== true) {
          btn.disabled = false; btn.textContent = 'Recargar';
          toast((f && f.motivo) || 'No se pudo recargar');
          return;
        }
        /* El aviso al celular, igual que cuando se acredita una solicitud:
           misma plata, mismo aviso. Best-effort: la recarga ya entro. */
        try {
          fetch(SUPABASE_URL + '/functions/v1/avisar-cliente', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'recarga', cliente_id: u.cliente_id,
              monto: Number(f.acreditado) || v,
              bono: Number(f.bono) || 0, saldo: Number(f.saldo) || 0,
            }),
          }).catch(function () {});
        } catch (e2) {}
        cerrarModal();
        toast('Recarga de ' + COP(Number(f.acreditado) - Number(f.bono || 0)) +
              (Number(f.bono) > 0 ? ' + bono de ' + COP(f.bono) : '') +
              ' — le queda ' + COP(f.saldo));
        await cargarClientesApp();
        pintar();
        return;
      }
      if (esS) {
        var rs = await sb().rpc('fn_saldo_mover', {
          p_tenant: S.t.id, p_cliente: u.cliente_id, p_motivo: 'regalo', p_monto: v,
          p_branch: (window._pos.state.branchId || null), p_order: null,
          p_ref: null, p_detalle: motivo, p_quien: yo.id || null,
        });
        if (rs && rs.error) throw rs.error;
        /* El aviso en su app (20-ago, Sergio: que el regalo de saldo avise
           igual que el de puntos). Best-effort: el saldo ya quedo. */
        try {
          fetch(SUPABASE_URL + '/functions/v1/avisar-cliente', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'saldo_regalo', cliente_id: u.cliente_id, tenant_id: S.t.id,
              monto: v, saldo: Number(rs && rs.data) || 0,
            }),
          }).catch(function () {});
        } catch (e3) {}
      } else {
        await sb().rpc('fn_puntos_regalar', {
          p_tenant: S.t.id, p_branch: (window._pos.state.branchId || null),
          p_telefono: u.telefono, p_puntos: v, p_detalle: motivo,
          p_quien: yo.email || 'administrador',
        });
      }
      cerrarModal();
      toast(esS ? 'Le diste ' + COP(v) + ' de saldo a ' + (u.nombre || 'el cliente')
                : 'Le diste ' + num(v) + ' puntos a ' + (u.nombre || 'el cliente'));
      await cargarClientesApp();
      pintar();
    } catch (e) {
      console.error('[dar]', e);
      btn.disabled = false; btn.textContent = 'Dárselo';
      toast('No se pudo: ' + (e.message || e));
    }
  }

  // ── Aprobar o descartar una recarga ────────────────────────────────
  function solPorId(id) {
    return (S.web.solicitudes || []).filter(function (x) { return String(x.id) === String(id); })[0];
  }

  function modalAprobar(id) {
    var p = solPorId(id);
    if (!p) return;
    var cli = p.pos_clientes || {};
    var monto = Number(p.monto_leido) || Number(p.monto_dicho) || 0;
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Acreditar la recarga', 'La plata queda disponible de inmediato en su app.') +
      '<div class="mw-mo-body">' +
        '<div class="pw-conf"><div class="pw-conf-v">' + COP(monto) + '</div>' +
          '<div class="mw-sub">para ' + esc(cli.nombre || 'el cliente') +
          (cli.telefono ? ' · ' + esc(cli.telefono) : '') + '</div></div>' +
        '<div class="mw-note"><span>Se acredita por el mismo camino que la verificación ' +
          'automática, así que el bono y el libro salen idénticos.</span></div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="lm-btn-primary" id="pw-sol-ok">Acreditar ' + COP(monto) + '</button></div>' +
    '</div>');
    $('pw-sol-ok').onclick = function () { aprobarRecarga(p, monto); };
  }

  async function aprobarRecarga(p, monto) {
    var btn = $('pw-sol-ok');
    btn.disabled = true; btn.textContent = 'Acreditando…';
    try {
      var r = await sb().rpc('fn_recarga_aplicar', {
        p_tenant: S.t.id, p_cliente: p.cliente_id, p_monto: monto,
        p_ref: p.referencia || ('manual:' + p.id),
        p_branch: (window._pos.state.branchId || null), p_como: 'a mano',
        /* Con la solicitud en la mano, la funcion puede negarse si esa foto ya
           se pago — y cierra la solicitud ella misma, en la misma transaccion. */
        p_solicitud: p.id,
      });
      var f = (r.data || [])[0];
      if (!f || f.ok !== true) {
        btn.disabled = false; btn.textContent = 'Acreditar ' + COP(monto);
        /* 'comprobante_usado' es una clave del sistema, no algo que se le diga
           a una persona: se traduce a lo que de verdad pasó. */
        toast((f && f.motivo) === 'comprobante_usado'
          ? 'Ese comprobante ya se abonó antes. No se cobra dos veces.'
          : ((f && f.motivo) || 'No se pudo acreditar'));
        return;
      }
      /* La solicitud ya la cerró la propia función, en la misma transacción
         que el abono. Hacerlo aquí desde el navegador era el punto flojo: si
         se caía la conexión justo aquí, la plata quedaba abonada y la
         solicitud seguía ofreciendo el botón Aprobar. */

      /* EL AVISO AL CELULAR DEL CLIENTE (19-ago). Acreditar a mano tiene que
         sentirse igual que la verificación automática: si por un lado le llega
         el aviso y por el otro no, el cliente cree que su recarga no entró.
         Es best-effort: la plata ya quedó acreditada arriba. */
      try {
        fetch(SUPABASE_URL + '/functions/v1/avisar-cliente', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'recarga', cliente_id: p.cliente_id,
            monto: Number(f.acreditado) || monto,
            bono: Number(f.bono) || 0, saldo: Number(f.saldo) || 0,
          }),
        }).catch(function () {});
      } catch (e) { /* nunca estorba a la acreditación */ }

      cerrarModal();
      toast('Acreditado ' + COP(f.acreditado) + (f.bono > 0 ? ' + ' + COP(f.bono) + ' de bono' : ''));
      await cargarClientesApp();
      pintar();
    } catch (e) {
      console.error('[aprobar]', e);
      btn.disabled = false; btn.textContent = 'Acreditar ' + COP(monto);
      toast('No se pudo acreditar: ' + (e.message || e));
    }
  }

  function modalDescartar(id) {
    var p = solPorId(id);
    if (!p) return;
    var cli = p.pos_clientes || {};
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Descartar la solicitud', 'No se le acredita nada al cliente.') +
      '<div class="mw-mo-body">' +
        '<div class="mw-note warn"><span>La solicitud de <strong>' + esc(cli.nombre || 'el cliente') +
          '</strong> por ' + COP(p.monto_dicho) + ' desaparece de la lista. ' +
          'Si consignó de verdad, le tocará mandar el comprobante otra vez.</span></div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="lm-btn-danger" id="pw-sol-no">Descartar</button></div>' +
    '</div>');
    $('pw-sol-no').onclick = async function () {
      this.disabled = true; this.textContent = 'Descartando…';
      try {
        await sb().from('pos_recargas_solicitudes').update({ estado: 'descartada' }).eq('id', p.id);
        cerrarModal(); toast('Solicitud descartada');
        await cargarClientesApp(); pintar();
      } catch (e) { toast('No se pudo descartar'); }
    };
  }

  // ── El QR ──────────────────────────────────────────────────────────
  function urlPagina() { return 'https://' + DOMINIO + (S.t.slug || ''); }
  function dibujarQR() {
    var c = $('qr-canvas');
    if (!c || !window.posQR) return;
    try { window.posQR.aCanvas(c, urlPagina(), { px: 180 }); }
    catch (e) { console.error('[qr]', e); }
  }

  // ── Botones ────────────────────────────────────────────────────────
  function enganchar() {
    document.querySelectorAll('[data-a]').forEach(function (b) {
      b.onclick = function () { accion(b.dataset.a); };
    });
    document.querySelectorAll('[data-sw]').forEach(function (b) {
      b.onclick = function () { interruptor(b, b.dataset.sw); };
    });
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { S.tab = b.dataset.tab; pintar(); };
    });
    document.querySelectorAll('[data-prev]').forEach(function (b) {
      b.onclick = function () { S.prev = b.dataset.prev; pintar(); };
    });
    document.querySelectorAll('[data-ir]').forEach(function (b) {
      b.onclick = function () { window.location.href = b.dataset.ir; };
    });
    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () { quitarCierre(Number(b.dataset.del)); };
    });
    document.querySelectorAll('[data-dponer]').forEach(function (b) {
      b.onclick = function () { S.hueco = Number(b.dataset.dponer); S.buscar = ''; modalProducto(); };
    });
    document.querySelectorAll('[data-dquitar]').forEach(function (b) {
      b.onclick = function () { ponerDestacado(Number(b.dataset.dquitar), null); };
    });
    document.querySelectorAll('[data-dsub]').forEach(function (b) {
      b.onclick = function () { subirDestacado(Number(b.dataset.dsub)); };
    });
    document.querySelectorAll('[data-psub]').forEach(function (b) {
      b.onclick = function () { subirPromo(Number(b.dataset.psub)); };
    });
    document.querySelectorAll('[data-pver]').forEach(function (b) {
      b.onclick = function () { alternarPromo(Number(b.dataset.pver)); };
    });
    document.querySelectorAll('[data-pdel]').forEach(function (b) {
      b.onclick = function () { quitarPromo(Number(b.dataset.pdel)); };
    });
    document.querySelectorAll('[data-pir]').forEach(function (b) {
      b.onclick = function () { modalDestino(Number(b.dataset.pir)); };
    });
    var f = $('pw-promo-file');
    if (f) f.onchange = function () {
      if (this.files && this.files[0]) subirImagen(this.files[0]);
      this.value = '';   // para poder escoger la MISMA imagen otra vez
    };

    /* ── EL FONDO DEL MENSAJE ──────────────────────────────────────────
       Los colores y la inclinacion se ven EN VIVO en la muestra y solo se
       guardan al soltar: guardar en cada movimiento del dedo serian docenas
       de escrituras y la pantalla parpadeando. */
    document.querySelectorAll('[data-bnrt]').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.bnrt, a = bnr();
        var nuevo = { tipo: t };
        if (t === 'color')     nuevo.color = a.color || '#2a1a1e';
        if (t === 'degradado') { nuevo.color = a.color || '#2a1a1e'; nuevo.color2 = a.color2 || '#5d2233'; nuevo.angulo = isFinite(Number(a.angulo)) ? Number(a.angulo) : 140; }
        if (t === 'imagen')    { nuevo.imagen = a.imagen || null; nuevo.velo = isFinite(Number(a.velo)) ? Number(a.velo) : 0.55; }
        guardarFondo(nuevo);
      };
    });
    document.querySelectorAll('[data-bnrp]').forEach(function (b) {
      b.onclick = function () {
        var p = BANNER_PRESETS[Number(b.dataset.bnrp)], a = bnr();
        guardarFondo(a.tipo === 'color'
          ? { tipo: 'color', color: p.a }
          : { tipo: 'degradado', color: p.a, color2: p.b, angulo: isFinite(Number(a.angulo)) ? Number(a.angulo) : 140 });
      };
    });
    var demo = document.querySelector('.pw-bnr-demo');
    function enVivo() {
      if (!demo) return;
      var a = bnr();
      var c1 = $('pw-bnr-c1'), c2 = $('pw-bnr-c2'), an = $('pw-bnr-ang');
      var prev = {
        tipo: a.tipo,
        color: c1 ? c1.value : a.color,
        color2: c2 ? c2.value : a.color2,
        angulo: an ? Number(an.value) : a.angulo,
      };
      demo.setAttribute('style', bannerEstilo(prev));
    }
    ['pw-bnr-c1', 'pw-bnr-c2', 'pw-bnr-ang'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.oninput = enVivo;
      el.onchange = function () {
        var a = bnr(), c1 = $('pw-bnr-c1'), c2 = $('pw-bnr-c2'), an = $('pw-bnr-ang');
        var nuevo = { tipo: a.tipo };
        if (c1) nuevo.color = c1.value;
        if (a.tipo === 'degradado') {
          nuevo.color2 = c2 ? c2.value : a.color2;
          nuevo.angulo = an ? Number(an.value) : a.angulo;
        }
        guardarFondo(nuevo);
      };
    });
    var vel = $('pw-bnr-velo');
    if (vel) {
      vel.oninput = function () {
        var n = $('pw-bnr-velo-n'), capa = document.querySelector('.pw-bnr-velo');
        if (n) n.textContent = Math.round(Number(vel.value) * 100) + '%';
        if (capa) capa.style.background = 'rgba(0,0,0,' + Number(vel.value).toFixed(2) + ')';
      };
      vel.onchange = function () {
        var a = bnr();
        guardarFondo({ tipo: 'imagen', imagen: a.imagen || null, velo: Number(vel.value) });
      };
    }
    /* ── LOS AVISOS ────────────────────────────────────────────────────
       Se abre uno a la vez: siete cuadros de texto abiertos a la vez no se
       leen, y de todos modos se edita de a uno. */
    document.querySelectorAll('[data-aviso]').forEach(function (b) {
      b.onclick = function () {
        S.avisoAbierto = (S.avisoAbierto === b.dataset.aviso) ? '' : b.dataset.aviso;
        pintar();
      };
    });
    /* La muestra se mueve MIENTRAS escribe: es la unica forma de ver si el
       mensaje cabe en dos lineas antes de guardarlo. */
    var avT = $('pw-av-t'), avC = $('pw-av-c');
    function verVivo() {
      var t = $('pw-nv-t'), c = $('pw-nv-c');
      if (t && avT) t.textContent = conEjemplo(avT.value);
      if (c && avC) c.textContent = conEjemplo(avC.value);
    }
    if (avT) avT.oninput = verVivo;
    if (avC) avC.oninput = verVivo;

    document.querySelectorAll('[data-avar]').forEach(function (b) {
      b.onclick = function () {
        /* Se inserta donde tenga el cursor, no al final: si esta corrigiendo
           la mitad de la frase, mandarla al final le daNa el mensaje. */
        var v = b.dataset.avar.split('|')[1];
        var campo = (document.activeElement === avT) ? avT : avC;
        if (!campo) return;
        var ini = campo.selectionStart, fin = campo.selectionEnd, txt = campo.value;
        campo.value = txt.slice(0, ini) + '{' + v + '}' + txt.slice(fin);
        campo.focus();
        campo.selectionStart = campo.selectionEnd = ini + v.length + 2;
        verVivo();
      };
    });
    document.querySelectorAll('[data-avguardar]').forEach(function (b) {
      b.onclick = function () { guardarAviso(b.dataset.avguardar); };
    });
    document.querySelectorAll('[data-avreset]').forEach(function (b) {
      b.onclick = function () { guardarAviso(b.dataset.avreset, true); };
    });

    var bf = $('pw-bnr-file');
    if (bf) bf.onchange = function () {
      if (this.files && this.files[0]) subirFondo(this.files[0]);
      this.value = '';
    };
  }

  function accion(a) {
    if (a === 'copiar') {
      try { navigator.clipboard.writeText(urlPagina()); toast('Dirección copiada'); }
      catch (e) { toast('No se pudo copiar'); }
    } else if (a === 'cambiar-url') { modalDireccion(); }
    else if (a === 'qr-descargar') { descargarQR(); }
    else if (a === 'qr-mesa') { modalMesa(); }
    else if (a === 'horario') { window.location.href = 'configuracion.html'; }
    else if (a === 'cerrar-ahora') { modalCerrar(); }
    else if (a === 'reabrir') { reabrir(); }
    else if (a === 'add-cierre') { modalCierre(); }
    else if (a === 'enviar-codigo') { pedirCodigo(); }
    else if (a === 'comprobar') { verificarCodigo(); }
    else if (a === 'prev-recargar') { S.recarga++; pintar(); }
    else if (a === 'prev-abrir') { window.open(urlPagina(), '_blank', 'noopener'); }
    else if (a === 'dest-limpiar') { guardar({ web_destacados: [] }, 'Los destacados vuelven a escogerse solos'); }
    else if (a === 'promo-nueva') { $('pw-promo-file').click(); }
    else if (a === 'bnr-imagen') { $('pw-bnr-file').click(); }
    else if (a === 'bnr-quitar-img') { guardarFondo({ tipo: 'imagen', imagen: null }, 'Quité la imagen'); }
    else if (a === 'dar-regalo') { modalDar('saldo', 0); }
    /* Registrar a mano una recarga que el cliente pago en el local. El modo ya
       existia dentro del modal; faltaba poder entrar directo desde su lista. */
    else if (a === 'dar-recarga') { modalDar('recarga', 0); }
    else if (a === 'bnr-reset') { guardar({ web_banner: null }, 'El mensaje vuelve al fondo de siempre'); }
  }

  /* Un interruptor se bloquea mientras se guarda. Sin eso, dos clics seguidos
     mandan dos escrituras y la pantalla puede quedar mostrando lo contrario de
     lo que quedó guardado. */
  async function interruptor(btn, clave) {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      if (clave === 'publicar') {
        await guardar({ web_activa: !S.t.web_activa },
          !S.t.web_activa ? 'Tu página ya está publicada' : 'Tu página quedó apagada');
      } else if (clave === 'pedidos') {
        await guardar({ web_programar_pedidos: !S.t.web_programar_pedidos },
          !S.t.web_programar_pedidos ? 'Ahora aceptas pedidos con el negocio cerrado' : 'Ya no se puede pedir con el negocio cerrado');
      } else if (clave.indexOf('ve:') === 0) {
        var k = clave.slice(3), v = Object.assign({}, S.t.web_visible);
        v[k] = !ve(k);
        var nom = (VE.filter(function (x) { return x.k === k; })[0] || {}).t || k;
        await guardar({ web_visible: v }, v[k] ? nom + ': ahora se ve' : nom + ': ya no se ve');
      }
    } finally { btn.disabled = false; }
  }

  /* Se guarda primero y solo después se repinta. Al revés, un error de red
     dejaría la pantalla diciendo una cosa y la base guardando otra. */
  async function guardar(campos, msg) {
    guardando(true);
    var r = await sb().from('tenants').update(campos).eq('id', S.t.id).select('id');
    guardando(false);
    if (r.error || !r.data || !r.data.length) {
      toast('No se pudo guardar: ' + ((r.error && r.error.message) || 'sin permisos'));
      return false;
    }
    Object.assign(S.t, campos);
    await cargarEstado(S.t.id);
    /* La vista previa es la pagina de verdad: si no se recarga, seguiria
       mostrando lo de antes y el dueño creeria que su cambio no se guardo. */
    S.recarga++;
    pintar();
    if (msg) toast(msg);
    return true;
  }

  // ── Los destacados ─────────────────────────────────────────────────
  /* La lista siempre se guarda con tres puestos, aunque haya vacios: si se
     guardaran solo los llenos, quitar el primero correría los otros dos de
     puesto sin que nadie lo hubiera pedido. */
  function tresPuestos() {
    var a = (S.t.web_destacados || []).slice(0, 3);
    while (a.length < 3) a.push(null);
    return a;
  }

  async function ponerDestacado(i, id) {
    var a = tresPuestos();
    // Si ya estaba en otro puesto se quita de allá: el mismo plato dos veces
    // en la fila se ve como un error del sistema.
    if (id) a = a.map(function (x) { return String(x) === String(id) ? null : x; });
    a[i] = id;
    var limpia = a.filter(function (x, n) { return x || n < ultimoLleno(a); });
    await guardar({ web_destacados: limpia }, id ? 'Destacado puesto' : 'Puesto libre otra vez');
  }
  function ultimoLleno(a) {
    for (var i = a.length - 1; i >= 0; i--) if (a[i]) return i + 1;
    return 0;
  }

  async function subirDestacado(i) {
    var a = tresPuestos(), t = a[i];
    a[i] = a[i - 1]; a[i - 1] = t;
    await guardar({ web_destacados: a.filter(function (x, n) { return x || n < ultimoLleno(a); }) }, 'Orden cambiado');
  }

  /* ══ A DONDE LLEVA UNA IMAGEN DEL BANNER ══════════════════════════════════
     Tres formas de destino en una sola pantalla, porque para el dueNo es UNA
     decision ("¿que pasa si la tocan?") y partirla en tres botones lo obliga a
     entender la diferencia antes de elegir. */
  function modalDestino(i) {
    var p = (S.promos || [])[i];
    if (!p) return;
    var actual = String(p.ir_a || '');
    var esWeb = /^https?:\/\//i.test(actual);
    var esProd = actual.indexOf('producto:') === 0;

    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('¿A dónde lleva?', 'Cuando alguien toque esta imagen. No aparece ningún botón encima.') +
      '<div class="mw-mo-body">' +
        '<div class="pw-lista">' +
          DESTINOS.map(function (d) {
            var on = !esWeb && !esProd && actual === d.v;
            return '<button class="pw-dest' + (on ? ' on' : '') + '" data-dst="' + esc(d.v) + '">' +
              esc(d.n) + (on ? '<span>✓</span>' : '') + '</button>';
          }).join('') +
          '<button class="pw-dest' + (esProd ? ' on' : '') + '" data-dst-prod="1">' +
            'Un producto de la carta' +
            (esProd ? '<span>✓ ' + esc(nombreDestino(actual)) + '</span>' : '') +
          '</button>' +
        '</div>' +
        '<label class="pw-campo" style="margin-top:14px"><span>Un enlace de internet</span>' +
          '<input class="cc-input" id="pw-dst-url" placeholder="https://…" value="' +
            (esWeb ? esc(actual) : '') + '"></label>' +
        '<div class="mw-note" style="margin-top:8px"><span>Se abre en otra pestaña, ' +
          'para no sacar al cliente de su pedido.</span></div>' +
      '</div>' +
      '<div class="mw-mo-foot">' +
        '<button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="lm-btn-primary" id="pw-dst-ok">Guardar</button>' +
      '</div>' +
    '</div>');

    document.querySelectorAll('[data-dst]').forEach(function (b) {
      b.onclick = function () { guardarDestino(i, b.dataset.dst); };
    });
    var pr = document.querySelector('[data-dst-prod]');
    if (pr) pr.onclick = function () { S.destinoPara = i; S.buscar = ''; modalDestinoProducto(); };

    $('pw-dst-ok').onclick = function () {
      var u = ($('pw-dst-url').value || '').trim();
      if (!u) return guardarDestino(i, '');
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
      guardarDestino(i, u);
    };
  }

  /* Elegir el plato reusa la MISMA lista de productos de los destacados: es la
     misma pregunta y no hay razon para tener dos buscadores distintos. */
  function modalDestinoProducto() {
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('¿Cuál producto?', 'Al tocar la imagen se le abre este plato.') +
      '<div class="mw-mo-body">' +
        '<input class="cc-input" id="pw-buscar" placeholder="Busca por nombre…">' +
        '<div class="pw-lista" id="pw-lista">' + listaProductos(true) + '</div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button></div>' +
    '</div>');
    var b = $('pw-buscar');
    b.focus();
    b.oninput = function () {
      S.buscar = this.value;
      $('pw-lista').innerHTML = listaProductos(true);
      engancharGrupos();
      engancharDestinoProd();
    };
    engancharGrupos();
    engancharDestinoProd();
  }

  function engancharDestinoProd() {
    /* La lista de productos es la MISMA que la de los destacados y marca sus
       filas con `data-elegir`. Se reusa tal cual: dos listas de lo mismo se
       separan solas con el tiempo. */
    document.querySelectorAll('#pw-lista [data-elegir]').forEach(function (b) {
      b.onclick = function () { guardarDestino(S.destinoPara, 'producto:' + b.dataset.elegir); };
    });
  }

  async function guardarDestino(i, valor) {
    var p = (S.promos || [])[i];
    if (!p) return;
    try {
      var r = await sb().from('pos_promos').update({ ir_a: valor || null }).eq('id', p.id).select('id');
      /* Se comprueba que de verdad se guardo: un update de cero filas no falla
         y dejaria la pantalla diciendo que quedo, sin que quedara. */
      if (r.error || !r.data || !r.data.length) throw (r.error || new Error('no se guardo'));
      p.ir_a = valor || null;
      cerrarModal();
      pintar();
      toast(valor ? 'Listo, la imagen ya lleva a ese sitio' : 'La imagen ya no se puede tocar');
    } catch (e) {
      console.error('[promo destino]', e);
      toast('No se pudo guardar el destino');
    }
  }

  function modalProducto() {
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Elegir un producto', 'Va en el puesto ' + (S.hueco + 1) + ' de tu página.') +
      '<div class="mw-mo-body">' +
        '<input class="cc-input" id="pw-buscar" placeholder="Busca por nombre…" value="' + esc(S.buscar) + '">' +
        '<div class="pw-lista" id="pw-lista">' + listaProductos() + '</div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button></div>' +
    '</div>');
    var b = $('pw-buscar');
    b.focus();
    b.oninput = function () {
      S.buscar = this.value;
      $('pw-lista').innerHTML = listaProductos();
      engancharGrupos();
      engancharLista();
    };
    engancharGrupos();
    engancharLista();
  }

  /* LA LISTA, AGRUPADA POR CATEGORIA (19-ago, pedido de Sergio). Antes era una
     sola tira ordenada por "tiene foto": con 50 platos, encontrar uno era
     bajar leyendo. Agrupada se busca como en la carta, que es como el dueNo
     los tiene en la cabeza.

     `conCombos` solo lo pide el destino del banner. Los destacados NO lo
     piden: ahi se guarda un id que la pagina del cliente busca entre los
     productos, y meterle combos sin comprobar ese camino seria arriesgar una
     pantalla que hoy funciona por una comodidad. */
  function listaProductos(conCombos) {
    var q = (S.buscar || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var todos = (S.productos || []).concat(conCombos ? (S.combos || []) : []);
    var lista = todos.filter(function (p) {
      if (!q) return true;
      return p.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) >= 0;
    });
    if (!lista.length) return '<div class="mw-empty"><div class="mw-empty-t">Nada con ese nombre</div></div>';

    var grupos = {}, orden = [];
    lista.forEach(function (p) {
      var c = p.cat || 'Sin categoría';
      if (!grupos[c]) { grupos[c] = []; orden.push(c); }
      grupos[c].push(p);
    });
    /* Los combos de primeros: son lo que el dueNo quiere empujar, y por eso
       manda una imagen ahi. Lo demas queda en el orden de la carta. */
    orden.sort(function (a, b) { return (b === 'Combos') - (a === 'Combos'); });

    /* PLEGADAS, Y UNA A LA VEZ (19-ago, pedido de Sergio). Con 53 productos la
       lista abierta era una tira larguisima aunque estuviera agrupada. Ahora se
       ven los 8 titulos de un golpe y se abre el que interesa; abrir uno cierra
       el otro, que es lo que de verdad ahorra espacio.

       BUSCANDO SE ABREN TODAS: si el que busca "coca" tuviera que ademas
       adivinar en que grupo cayo, el buscador no serviria de nada. */
    var buscando = !!q;
    return orden.map(function (c) {
      var abierto = buscando || S.grupoAbierto === c;
      /* Dentro del grupo, primero los que TIENEN foto: un destino sin foto se
         ve como un hueco gris, que es peor que no ponerlo. */
      var items = grupos[c].sort(function (a, b) { return (b.foto ? 1 : 0) - (a.foto ? 1 : 0); });
      return '<div class="pw-grupo-caja">' +
        '<button class="pw-grupo' + (abierto ? ' on' : '') + '" data-grupo="' + esc(c) + '">' +
          '<span class="pw-grupo-fl">›</span>' +
          '<span class="pw-grupo-n">' + esc(c) + '</span>' +
          '<span class="pw-grupo-c">' + items.length + '</span>' +
        '</button>' +
        '<div class="pw-grupo-in"' + (abierto ? '' : ' hidden') + '>' + items.map(function (p) {
          return '<button class="pw-item" data-elegir="' + esc(p.id) + '">' +
            '<span class="pw-item-foto"' + (p.foto ? ' style="background-image:url(' + esc(p.foto) + ')"' : '') + '></span>' +
            '<span class="pw-item-tx"><b>' + esc(p.nombre) + '</b>' +
              '<small>' + (p.foto ? '' : 'sin foto') + (p.hay ? '' : (p.foto ? '' : ' · ') + 'agotado') + '</small></span>' +
          '</button>';
        }).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  /* El acordeon se abre y cierra EN LA PANTALLA, sin volver a armar la lista:
     rearmarla obligaria a saber si esta se pidio con combos o sin ellos, y ese
     es justo el tipo de dato que se olvida de pasar. `S.grupoAbierto` guarda
     cual quedo abierto para que sobreviva a la busqueda. */
  function engancharGrupos() {
    document.querySelectorAll('[data-grupo]').forEach(function (b) {
      b.onclick = function () {
        var c = b.dataset.grupo;
        var abrir = S.grupoAbierto !== c;
        S.grupoAbierto = abrir ? c : null;
        document.querySelectorAll('.pw-grupo-caja').forEach(function (caja) {
          var cab = caja.querySelector('.pw-grupo');
          var den = caja.querySelector('.pw-grupo-in');
          var mio = cab && cab.dataset.grupo === c && abrir;
          if (cab) cab.classList.toggle('on', !!mio);
          if (den) den.hidden = !mio;
        });
      };
    });
  }

  function engancharLista() {
    document.querySelectorAll('[data-elegir]').forEach(function (b) {
      b.onclick = function () { cerrarModal(); ponerDestacado(S.hueco, b.dataset.elegir); };
    });
  }

  // ── La publicidad ──────────────────────────────────────────────────
  /* La imagen se encoge ANTES de subirla y va al almacén, nunca a la base: una
     foto de 2 MB dentro de una fila tumba las consultas de la página. */
  function encoger(file) {
    return new Promise(function (listo) {
      try {
        var img = new Image();
        img.onload = function () {
          var max = 1400, w = img.width, h = img.height;
          if (w > max) { h = Math.round(h * max / w); w = max; }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          cv.toBlob(function (b) { listo(b || file); }, 'image/jpeg', 0.82);
        };
        img.onerror = function () { listo(file); };
        img.src = URL.createObjectURL(file);
      } catch (e) { listo(file); }
    });
  }

  /* Se guarda el objeto ENTERO, no un campo suelto: mezclar el tipo viejo con
     el color nuevo es como quedan las configuraciones a medias (una imagen
     guardada con tipo "color" que no se ve por ningun lado). */
  async function guardarFondo(nuevo, msg) {
    var a = bnr();
    var b = Object.assign({}, a, nuevo);
    /* Lo que no pertenece al tipo elegido se limpia. */
    if (b.tipo === 'color')     { delete b.color2; delete b.angulo; delete b.imagen; delete b.velo; }
    if (b.tipo === 'degradado') { delete b.imagen; delete b.velo; }
    if (b.tipo === 'imagen')    { delete b.color; delete b.color2; delete b.angulo; }
    await guardar({ web_banner: b }, msg);
  }

  /* Se guarda el objeto ENTERO de avisos con ese aviso cambiado. Vaciar los dos
     campos equivale a volver al de fabrica: la clave se borra y el servidor cae
     a su texto por defecto, sin dejar una fila vacia que nadie entiende. */
  async function guardarAviso(clave, defabrica) {
    var todos = Object.assign({}, avisosDelDueno());
    if (defabrica) {
      delete todos[clave];
    } else {
      var t = ($('pw-av-t') || {}).value || '';
      var c = ($('pw-av-c') || {}).value || '';
      if (!String(t).trim() && !String(c).trim()) delete todos[clave];
      else todos[clave] = { titulo: String(t).trim(), cuerpo: String(c).trim() };
    }
    S.avisoAbierto = defabrica ? '' : clave;
    await guardar({ web_avisos: Object.keys(todos).length ? todos : null },
                  defabrica ? 'Volvió al texto de siempre' : 'Aviso guardado');
  }

  async function subirFondo(file) {
    guardando(true);
    try {
      var blob = await encoger(file);
      var nombre = 'banner/' + S.t.id + '/' + Date.now() + '.jpg';
      var up = await sb().storage.from('chat-media').upload(nombre, blob, { upsert: true, contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      var url = sb().storage.from('chat-media').getPublicUrl(nombre).data.publicUrl;
      var a = bnr();
      await guardarFondo({ tipo: 'imagen', imagen: url, velo: isFinite(Number(a.velo)) ? Number(a.velo) : 0.55 },
                         'Listo, ese es el fondo de tu mensaje');
    } catch (e) {
      console.error('[fondo banner]', e);
      toast('No se pudo subir la imagen: ' + ((e && e.message) || e));
    } finally { guardando(false); }
  }

  async function subirImagen(file) {
    guardando(true);
    try {
      var blob = await encoger(file);
      var nombre = 'promos/' + S.t.id + '/' + Date.now() + '.jpg';
      var up = await sb().storage.from('chat-media').upload(nombre, blob, { upsert: true, contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      var url = sb().storage.from('chat-media').getPublicUrl(nombre).data.publicUrl;

      var orden = (S.promos || []).length + 1;
      var r = await sb().from('pos_promos').insert([{
        tenant_id: S.t.id, titulo: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Publicidad',
        imagen: url, activo: true, orden: orden,
      }]).select('*');
      if (r.error) throw r.error;
      S.promos = (S.promos || []).concat(r.data);
      S.recarga++;
      pintar();
      toast('Imagen subida');
    } catch (e) {
      console.error('[publicidad]', e);
      toast('No se pudo subir la imagen: ' + ((e && e.message) || e));
    } finally { guardando(false); }
  }

  async function alternarPromo(i) {
    var p = S.promos[i];
    guardando(true);
    var r = await sb().from('pos_promos').update({ activo: !p.activo }).eq('id', p.id).select('id');
    guardando(false);
    if (r.error) { toast('No se pudo guardar: ' + r.error.message); return; }
    p.activo = !p.activo;
    S.recarga++;
    pintar();
    toast(p.activo ? 'Se va a mostrar' : 'Ya no se muestra');
  }

  async function quitarPromo(i) {
    var p = S.promos[i];
    guardando(true);
    var r = await sb().from('pos_promos').delete().eq('id', p.id);
    guardando(false);
    if (r.error) { toast('No se pudo quitar: ' + r.error.message); return; }
    /* La imagen se queda en el almacén a propósito: borrarla es lo único que no
       tiene vuelta atrás, y ocupa muy poco. La fila sí se va. */
    S.promos.splice(i, 1);
    S.recarga++;
    pintar();
    toast('Imagen quitada');
  }

  async function subirPromo(i) {
    var a = S.promos[i], b = S.promos[i - 1];
    guardando(true);
    await sb().from('pos_promos').update({ orden: i }).eq('id', a.id);
    await sb().from('pos_promos').update({ orden: i + 1 }).eq('id', b.id);
    guardando(false);
    a.orden = i; b.orden = i + 1;
    S.promos[i] = b; S.promos[i - 1] = a;
    S.recarga++;
    pintar();
    toast('Orden cambiado');
  }

  // ── Modales ────────────────────────────────────────────────────────
  function abrir(html) {
    $('pw-modales').innerHTML = '<div class="cc-overlay center" id="pw-ov">' + html + '</div>';
    $('pw-ov').onmousedown = function (ev) { if (ev.target === ev.currentTarget) cerrarModal(); };
    document.querySelectorAll('[data-cerrar]').forEach(function (b) { b.onclick = cerrarModal; });
  }
  function cerrarModal() { $('pw-modales').innerHTML = ''; }

  function cabezaModal(t, s) {
    return '<div class="mw-mo-head"><div><div class="mw-mo-title">' + t + '</div>' +
      '<div class="mw-mo-sub">' + s + '</div></div>' +
      '<button class="lm-icon-sm" data-cerrar>✕</button></div>';
  }

  function modalDireccion() {
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Cambiar la dirección', 'Solo cambia la última parte, la que lleva el nombre de tu restaurante.') +
      '<div class="mw-mo-body">' +
        '<div class="cc-field"><label class="cc-label">Nueva dirección</label>' +
          '<div class="mw-urlinput"><span>' + DOMINIO + '</span>' +
          '<input id="in-nueva-url" maxlength="40" value="' + esc(S.t.slug || '') + '"></div></div>' +
        '<div class="mw-note warn"><span><strong>Los códigos QR que ya imprimiste dejan de servir.</strong> ' +
          'Toca imprimirlos otra vez con el nuevo código. Además, la dirección vieja queda libre y otro restaurante la puede tomar.</span></div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="lm-btn-primary" id="pw-ok-url">Cambiar la dirección</button></div>' +
    '</div>');
    $('in-nueva-url').focus();
    $('pw-ok-url').onclick = guardarSlug;
  }

  async function guardarSlug() {
    /* Se limpia igual que en la base (`pos_slug`): solo letras y números, sin
       tildes ni espacios. Si aquí se dejara pasar otra cosa, la dirección
       guardada no coincidiría con la que se escribe en el navegador. */
    var v = ($('in-nueva-url').value || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    if (v.length < 3) { toast('La dirección necesita al menos 3 letras'); return; }
    if (v === S.t.slug) { cerrarModal(); return; }

    guardando(true);
    var r = await sb().from('tenants').update({ slug: v }).eq('id', S.t.id).select('id');
    guardando(false);
    if (r.error) {
      // El índice único de la base es quien decide de verdad si está libre.
      toast(String(r.error.message || '').indexOf('duplicate') >= 0 || r.error.code === '23505'
        ? 'Esa dirección ya la tiene otro restaurante. Prueba con otra.'
        : 'No se pudo guardar: ' + r.error.message);
      return;
    }
    S.t.slug = v;
    cerrarModal();
    pintar();
    toast('Tu dirección ahora es ' + DOMINIO + v + ' · vuelve a imprimir el QR');
  }

  function modalCerrar() {
    S.cierre = 'hoy';
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Cerrar ahora', '¿Hasta cuándo queda cerrado?') +
      '<div class="mw-mo-body" id="pw-cierre-body">' + opcionesCierre() + '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="mw-btn-danger" id="pw-ok-cerrar">Cerrar ahora</button></div>' +
    '</div>');
    engancharCierre();
    $('pw-ok-cerrar').onclick = confirmarCierre;
  }
  function opcionesCierre() {
    return '<button class="mw-choice' + (S.cierre === 'hoy' ? ' on' : '') + '" data-cierre="hoy">' +
      '<span class="mw-radio"></span><span><span class="mw-choice-t">Solo por hoy</span>' +
      '<span class="mw-choice-s">Se vuelve a abrir mañana solo, con el horario de siempre.</span></span></button>' +
      '<button class="mw-choice' + (S.cierre === 'indef' ? ' on' : '') + '" data-cierre="indef">' +
      '<span class="mw-radio"></span><span><span class="mw-choice-t">Hasta que yo lo abra</span>' +
      '<span class="mw-choice-s">Queda cerrado hasta que toques “Volver a abrir”.</span></span></button>';
  }
  function engancharCierre() {
    document.querySelectorAll('[data-cierre]').forEach(function (b) {
      b.onclick = function () {
        S.cierre = b.dataset.cierre;
        $('pw-cierre-body').innerHTML = opcionesCierre();
        engancharCierre();
      };
    });
  }

  async function confirmarCierre() {
    /* "Solo por hoy" se guarda como una FECHA de vencimiento, no como una marca
       que alguien tenga que acordarse de quitar: mañana el propio servidor ve
       que ya pasó y el restaurante abre solo. */
    var hasta = null;
    if (S.cierre === 'hoy') {
      var d = new Date(); d.setHours(23, 59, 59, 0);
      hasta = d.toISOString();
    }
    cerrarModal();
    await guardar({ web_cerrado_manual: true, web_cerrado_hasta: hasta },
      S.cierre === 'hoy' ? 'Cerrado por hoy · abre mañana solo' : 'Cerrado hasta que lo vuelvas a abrir');
  }

  async function reabrir() {
    await guardar({ web_cerrado_manual: false, web_cerrado_hasta: null }, 'El restaurante volvió a abrir');
  }

  function modalCierre() {
    var hoy = new Date().toISOString().slice(0, 10);
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Agregar un cierre', 'Se cierra solo esos días y vuelve a abrir solo.') +
      '<div class="mw-mo-body">' +
        '<div class="mw-2col">' +
          '<div class="cc-field"><label class="cc-label">Desde</label><input class="cc-input" type="date" id="in-desde" min="' + hoy + '"></div>' +
          '<div class="cc-field"><label class="cc-label">Hasta</label><input class="cc-input" type="date" id="in-hasta" min="' + hoy + '"></div>' +
        '</div>' +
        '<div class="cc-field" style="margin-top:12px"><label class="cc-label">Motivo que va a leer el cliente</label>' +
          '<input class="cc-input" id="in-motivo" maxlength="60" placeholder="Vacaciones de diciembre"></div>' +
        '<div class="mw-note"><span>Escríbelo corto y en tus palabras. Es lo que ve el cliente cuando entre esos días.</span></div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cancelar</button>' +
        '<button class="lm-btn-primary" id="pw-ok-cierre">Guardar el cierre</button></div>' +
    '</div>');
    $('pw-ok-cierre').onclick = guardarCierre;
  }

  async function guardarCierre() {
    var desde = $('in-desde').value, hasta = $('in-hasta').value;
    var motivo = ($('in-motivo').value || '').trim() || 'Cerrado';
    if (!desde || !hasta) { toast('Pon las dos fechas'); return; }
    if (hasta < desde) { toast('La fecha de fin no puede ser antes de la de inicio'); return; }
    /* Que no se cruce con otro: dos cierres encima del mismo día no rompen
       nada, pero el dueño creería que borró uno y sigue cerrado por el otro. */
    var choca = (S.t.web_cierres || []).some(function (c) { return desde <= c.hasta && hasta >= c.desde; });
    if (choca) { toast('Esas fechas se cruzan con otro cierre que ya tienes'); return; }

    var lista = (S.t.web_cierres || []).concat([{ desde: desde, hasta: hasta, motivo: motivo }]);
    lista.sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
    cerrarModal();
    await guardar({ web_cierres: lista }, 'Cierre programado guardado');
  }

  async function quitarCierre(i) {
    var lista = (S.t.web_cierres || []).slice();
    lista.splice(i, 1);
    await guardar({ web_cierres: lista }, 'Cierre quitado');
  }

  // ── El QR: descargar e imprimir ────────────────────────────────────
  function descargarQR() {
    var c = document.createElement('canvas');
    /* Grande a propósito: un QR de 180 px se ve bien en pantalla pero impreso
       queda borroso, y un QR borroso no lo lee nadie. */
    window.posQR.aCanvas(c, urlPagina(), { px: 1200 });
    var a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'qr-' + (S.t.slug || 'mi-pagina') + '.png';
    a.click();
    toast('Descargando el código QR');
  }

  function modalMesa() {
    abrir('<div class="cc-modal mw-mo">' +
      cabezaModal('Hoja para la mesa', 'Imprímela y ponla en cada mesa, en la vitrina o en el empaque.') +
      '<div class="mw-mo-body" style="background:var(--surface-3)">' +
        '<div class="mw-sheet" id="pw-hoja">' +
          '<div class="mw-sheet-name">' + esc(S.marca) + '</div>' +
          '<div class="mw-sheet-line">Mira tus puntos y pide desde aquí</div>' +
          '<canvas id="qr-sheet" width="220" height="220"></canvas>' +
          '<div class="mw-sheet-url">' + esc(DOMINIO + (S.t.slug || '')) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mw-mo-foot"><button class="lm-btn-ghost" data-cerrar>Cerrar</button>' +
        '<button class="lm-btn-primary" id="pw-ok-hoja">Imprimir</button></div>' +
    '</div>');
    try { window.posQR.aCanvas($('qr-sheet'), urlPagina(), { px: 220 }); } catch (e) {}
    $('pw-ok-hoja').onclick = imprimirHoja;
  }

  /* Se imprime desde una ventana propia y no con window.print() de esta
     pantalla: si no, saldría impresa la pantalla entera de Cobra. El QR se pasa
     como imagen ya dibujada, en grande, para que salga nítido en papel. */
  function imprimirHoja() {
    var c = document.createElement('canvas');
    window.posQR.aCanvas(c, urlPagina(), { px: 900 });
    var v = window.open('', '_blank', 'width=820,height=1000');
    if (!v) { toast('El navegador bloqueó la ventana de impresión'); return; }
    v.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(S.marca) + '</title>' +
      '<style>@page{size:letter;margin:0}' +
      'body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0F172A}' +
      '.h{text-align:center}.n{font-size:34px;font-weight:800;letter-spacing:-.02em}' +
      '.l{font-size:15px;color:#475569;margin:8px 0 26px}' +
      'img{width:360px;height:360px;image-rendering:pixelated}' +
      '.u{font-size:17px;font-weight:700;color:#5B6BFF;margin-top:22px}</style></head>' +
      '<body><div class="h"><div class="n">' + esc(S.marca) + '</div>' +
      '<div class="l">Mira tus puntos y pide desde aquí</div>' +
      '<img src="' + c.toDataURL('image/png') + '">' +
      '<div class="u">' + esc(DOMINIO + (S.t.slug || '')) + '</div></div></body></html>');
    v.document.close();
    /* Se espera a que la imagen cargue: imprimir antes deja la hoja sin el QR,
       que es justo lo único que importa de la hoja. */
    v.onload = function () { v.focus(); v.print(); };
    cerrarModal();
  }

  // ── Probar el acceso ───────────────────────────────────────────────
  async function llamar(cuerpo) {
    cuerpo.slug = S.t.slug;
    var r = await fetch(ACCESO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return await r.json().catch(function () { return { ok: false, mensaje: 'No se pudo conectar.' }; });
  }

  function resultado(html, clase) {
    var e = $('test-result');
    e.hidden = false;
    e.className = 'mw-result ' + (clase || '');
    e.innerHTML = html;
  }

  async function pedirCodigo() {
    var tel = ($('in-tel').value || '').replace(/\D/g, '').slice(-10);
    if (tel.length !== 10) { toast('Escribe un celular de 10 dígitos'); return; }
    var b = document.querySelector('[data-a="enviar-codigo"]');
    b.disabled = true; b.textContent = 'Enviando…';
    var d = await llamar({ accion: 'pedir-codigo', telefono: tel });
    b.disabled = false; b.textContent = 'Enviar código';
    if (!d.ok) { resultado('<b>No se envió.</b><br>' + esc(d.mensaje || d.razon || ''), 'mal'); return; }
    S.tel = tel;
    toast('Código enviado por WhatsApp');
    resultado('<b>Código enviado.</b> Vence en ' + (d.vence_en_min || 10) + ' minutos. Escríbelo aquí abajo.', '');
    $('in-codigo').focus();
  }

  async function verificarCodigo() {
    var cod = ($('in-codigo').value || '').replace(/\D/g, '');
    if (!S.tel) { toast('Primero manda el código'); return; }
    if (cod.length !== 6) { toast('El código son 6 dígitos'); return; }
    var b = document.querySelector('[data-a="comprobar"]');
    b.disabled = true; b.textContent = 'Comprobando…';
    var d = await llamar({ accion: 'verificar-codigo', telefono: S.tel, codigo: cod });
    b.disabled = false; b.textContent = 'Comprobar';
    if (!d.ok) { resultado('<b>No cuadró.</b><br>' + esc(d.mensaje || d.razon || ''), 'mal'); return; }

    var c = d.cliente || {};
    if (!d.ya_registrado) {
      resultado('<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="mw-badge neutral">Todavía no es cliente tuyo</span></div>' +
        '<div style="margin-top:6px;font-size:12.5px;color:var(--ink-3)">El acceso funciona. Al entrar se le crearía su ficha en Cobra automáticamente.</div>', '');
      return;
    }
    resultado('<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span class="mw-badge ok">Sí es cliente tuyo</span>' +
      '<span style="font-size:12.5px;color:#15803D;font-weight:700">' + esc(c.nombre || '—') + ' · ' + esc(S.tel) + '</span></div>' +
      '<div class="mw-result-grid">' +
        kv('Puntos', c.puntos != null ? num(c.puntos) + ' pts' : '—') +
        kv('Dirección', c.direccion || '—') +
        kv('¿Ya tiene contraseña?', d.tiene_clave ? 'Sí' : 'Todavía no') +
      '</div>', '');
  }
  function kv(l, v) {
    return '<div><div class="mw-kv-l">' + esc(l) + '</div><div class="mw-kv-v">' + esc(v) + '</div></div>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cargar);
  else cargar();
})();
