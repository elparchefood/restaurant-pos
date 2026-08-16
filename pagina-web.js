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
    { k: 've',      t: 'Qué ve el cliente', secs: ['ve'] },
    { k: 'prueba',  t: 'Probar y medir',   secs: ['probar', 'comova'] },
  ];

  var S = {
    t: null,          // la fila de tenants
    marca: '',        // el nombre que ve el cliente
    estado: null,     // lo que devuelve fn_web_estado
    horarios: null,   // los de ia_config
    stats: null,
    prev: 'movil',
    tab: 'pagina',
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
      .select('id,name,slug,web_activa,web_cerrado_manual,web_cerrado_hasta,web_cierres,web_programar_pedidos,web_visible')
      .eq('id', tenantId).maybeSingle();
    if (r.error || !r.data) { $('pw-main').innerHTML = '<div class="pw-cargando">No se pudo cargar. Recarga la pantalla.</div>'; return; }
    S.t = r.data;
    if (!S.t.web_visible || typeof S.t.web_visible !== 'object') S.t.web_visible = {};
    if (!Array.isArray(S.t.web_cierres)) S.t.web_cierres = [];

    await Promise.all([cargarMarca(tenantId), cargarHorario(tenantId), cargarEstado(tenantId), cargarStats(tenantId)]);
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
      ve: seccionVe, probar: seccionProbar, comova: seccionComoVa,
    };
    var tab = TABS.filter(function (x) { return x.k === S.tab; })[0] || TABS[0];

    $('pw-main').innerHTML =
      '<div class="lm-tabsrow pw-tabs">' + TABS.map(function (x) {
        return '<button class="cc-tab' + (x.k === S.tab ? ' on' : '') + '" data-tab="' + x.k + '">' +
          esc(x.t) + avisoTab(x.k) + '</button>';
      }).join('') + '</div>' +
      '<div class="mw-cols"><div class="mw-stack">' +
        tab.secs.map(function (k) { return pinta[k](); }).join('') +
      '</div>' + seccionPrevia() + '</div>';

    /* El QR solo existe en su pestaña; dibujarlo cuando no está pintado tiraría
       un error en la consola cada vez que se cambia de pestaña. */
    if (S.tab === 'pagina') dibujarQR();
    enganchar();
  }

  /* Esconder no puede ser TAPAR: si algo esta cerrado o apagado, la pestaña lo
     dice con un punto, aunque no se este mirando. */
  function avisoTab(k) {
    var e = S.estado || {};
    if (k === 'pagina' && !S.t.web_activa) return '<span class="pw-tab-pt"></span>';
    if (k === 'horario' && (S.t.web_cerrado_manual || e.motivo === 'programado' || !S.horarios))
      return '<span class="pw-tab-pt"></span>';
    if (k === 've' && VE.some(function (v) { return !ve(v.k); })) return '<span class="pw-tab-pt gris"></span>';
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
