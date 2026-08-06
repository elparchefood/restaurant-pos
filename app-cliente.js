/* app-cliente.js — la página que ve el cliente del restaurante.
 *
 * UNA sola aplicación compartida. Cada restaurante tiene una carpeta con un
 * index.html de quince líneas que solo dice cuál es (`window.COBRA_SLUG`) y
 * carga esto. Mejorar la página los mejora a todos a la vez.
 *
 * Es PÚBLICA: cualquiera con la dirección entra y ve el restaurante. Lo privado
 * es la cuenta, y va contra los clientes de ESE restaurante — el teléfono es la
 * llave, igual que en el chat y en la caja.
 */
(function () {
  'use strict';

  var SB_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  // La MISMA llave publica que usa el resto de Cobra (pos-core.js). La primera
  // vez puse una inventada y la pagina no podia ni preguntar quien era el
  // restaurante: decia "esta pagina no esta disponible" sin mas.
  var ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
  var ACCESO = SB_URL + '/functions/v1/web-acceso';
  var LLAVE_SESION = 'cobra.web.sesion';

  var S = { slug: window.COBRA_SLUG || '', negocio: null, cliente: null, tel: '', pase: null };

  var app = document.getElementById('app');
  function pinta(html) { app.innerHTML = html; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function guardarToken(t) { try { localStorage.setItem(LLAVE_SESION, t); } catch (e) {} }
  function leerToken()     { try { return localStorage.getItem(LLAVE_SESION) || ''; } catch (e) { return ''; } }
  function borrarToken()   { try { localStorage.removeItem(LLAVE_SESION); } catch (e) {} }

  async function acceso(cuerpo) {
    cuerpo.slug = S.slug;
    try {
      var r = await fetch(ACCESO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      return await r.json();
    } catch (e) {
      return { ok: false, mensaje: 'No hay conexión. Revisa tus datos e intenta otra vez.' };
    }
  }

  var ICONO = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

  function cabecera() {
    var e = S.negocio || {};
    /* La foto del restaurante, la MISMA que ya esta configurada en Cobra. Si
       no hay ninguna se cae al icono, para que la cabecera nunca quede coja. */
    var marca = e.logo
      ? '<img class="ep-marca-img" src="' + esc(e.logo) + '" alt="">'
      : ICONO;
    return '<div class="ep-marca">' + marca + '</div>' +
      '<div><h1 class="ep-h1">' + esc(e.nombre || '') + '</h1>' +
      '<p class="ep-lead">Tu cuenta, tu saldo y tus puntos.</p></div>' +
      /* Cerrado NO es apagado: se avisa, pero la página se usa igual. */
      '<div class="ep-estado' + (e.abierto ? ' abierto' : '') + '"><span class="ep-punto"></span>' +
        esc(e.abierto ? 'Abierto ahora' : (e.detalle || 'Cerrado')) + '</div>';
  }

  function msg(texto, mal) {
    return texto ? '<div class="ep-msg ep-msg--' + (mal ? 'mal' : 'ok') + '">' + esc(texto) + '</div>' : '';
  }

  /* ── Tema claro / oscuro ──────────────────────────────────────────
     Arranca como lo tenga el celular del cliente y él lo puede cambiar. Su
     elección se recuerda: es su pantalla y sus ojos. */
  var LLAVE_TEMA = 'cobra.web.tema';
  function temaActual() {
    try { return localStorage.getItem(LLAVE_TEMA) || 'auto'; } catch (e) { return 'auto'; }
  }
  function aplicarTema(t) {
    var h = document.documentElement;
    h.classList.remove('tema-claro', 'tema-oscuro');
    if (t === 'claro')  h.classList.add('tema-claro');
    if (t === 'oscuro') h.classList.add('tema-oscuro');
    try { localStorage.setItem(LLAVE_TEMA, t); } catch (e) {}
  }
  function esOscuroAhora() {
    var t = temaActual();
    if (t === 'claro')  return false;
    if (t === 'oscuro') return true;
    return !window.matchMedia || !window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  function alternarTema() {
    aplicarTema(esOscuroAhora() ? 'claro' : 'oscuro');
    if (S.cliente) pantallaDentro(); else pantallaEntrar('', false);
  }
  aplicarTema(temaActual());

  // ── 1. Entrar: teléfono + contraseña ────────────────────────────────
  function pantallaEntrar(aviso, malo) {
    pinta('<div class="ep-login">' + cabecera() +
      '<form class="ep-form" id="f-entrar">' +
        msg(aviso, malo) +
        '<label class="ep-campo"><span class="ep-lbl">Tu celular</span>' +
          '<input class="ep-in" id="i-tel" type="tel" inputmode="numeric" autocomplete="tel" ' +
            'maxlength="14" placeholder="300 123 4567" value="' + esc(S.tel) + '"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Tu contraseña</span>' +
          '<input class="ep-in" id="i-clave" type="password" autocomplete="current-password" placeholder="••••••"></label>' +
        '<label class="ep-fila"><input type="checkbox" id="i-recordar" checked> Mantener mi sesión</label>' +
        '<button class="ep-btn ep-btn--main" type="submit" id="b-entrar">Entrar</button>' +
      '</form>' +
      '<button class="ep-link" id="b-codigo">Es mi primera vez · Olvidé mi contraseña</button>' +
      '<p class="ep-nota">Entras con el mismo número con el que pides.</p>' +
    '</div>');

    $('f-entrar').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var tel = ($('i-tel').value || '').replace(/\D/g, '').slice(-10);
      var clave = $('i-clave').value || '';
      if (tel.length !== 10) return pantallaEntrar('Escribe tu celular a 10 dígitos.', true);
      S.tel = tel;
      var b = $('b-entrar'); b.disabled = true; b.textContent = 'Entrando…';
      var d = await acceso({ accion: 'entrar', telefono: tel, clave: clave, recordar: $('i-recordar').checked });
      if (d.ok) { guardarToken(d.token); S.cliente = d.cliente; return pantallaDentro(); }
      // Todavía no tiene contraseña: se le lleva derecho al código, sin regañarlo.
      if (d.razon === 'sin_clave') return pedirCodigo(tel, 'Vamos a crear tu contraseña. Te mandamos un código por WhatsApp.');
      pantallaEntrar(d.mensaje || 'No pudimos entrar.', true);
    });

    $('b-codigo').addEventListener('click', function () {
      var tel = ($('i-tel').value || '').replace(/\D/g, '').slice(-10);
      if (tel.length !== 10) return pantallaEntrar('Escribe tu celular y te mandamos un código.', true);
      pedirCodigo(tel, '');
    });
  }

  // ── 2. Código por WhatsApp ──────────────────────────────────────────
  async function pedirCodigo(tel, aviso) {
    S.tel = tel;
    pinta('<div class="ep-login">' + cabecera() + '<p class="ep-lead">Enviando tu código…</p></div>');
    var d = await acceso({ accion: 'pedir-codigo', telefono: tel });
    if (!d.ok) return pantallaEntrar(d.mensaje || 'No pudimos enviarte el código.', true);
    pantallaCodigo(aviso || ('Te enviamos un código por WhatsApp al ' + tel + '.'));
  }

  function pantallaCodigo(aviso, malo) {
    pinta('<div class="ep-login">' + cabecera() +
      '<form class="ep-form" id="f-cod">' +
        msg(aviso, malo) +
        '<label class="ep-campo"><span class="ep-lbl">Código de 6 dígitos</span>' +
          '<input class="ep-in ep-in--codigo" id="i-cod" inputmode="numeric" autocomplete="one-time-code" ' +
            'maxlength="6" placeholder="······"></label>' +
        '<button class="ep-btn ep-btn--main" type="submit" id="b-cod">Continuar</button>' +
      '</form>' +
      '<button class="ep-link" id="b-otro">Enviarme otro código</button>' +
    '</div>');
    $('i-cod').focus();

    $('f-cod').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var cod = ($('i-cod').value || '').replace(/\D/g, '');
      if (cod.length !== 6) return pantallaCodigo('El código son 6 dígitos.', true);
      var b = $('b-cod'); b.disabled = true; b.textContent = 'Comprobando…';
      var d = await acceso({ accion: 'verificar-codigo', telefono: S.tel, codigo: cod });
      if (!d.ok) return pantallaCodigo(d.mensaje || 'Ese código no es.', true);
      S.pase = d.pase;
      pantallaDatos(d.cliente || null, d.ya_registrado, d.tiene_clave);
    });
    $('b-otro').addEventListener('click', function () { pedirCodigo(S.tel, ''); });
  }

  // ── 3. Sus datos y su contraseña ────────────────────────────────────
  /* Si el restaurante ya lo conoce, el formulario sale LLENO. Es lo que le dice
     "aquí ya te conocemos" — y de paso corrige una dirección vieja. */
  function pantallaDatos(cli, yaEra, teniaClave, aviso, malo) {
    var c = cli || {};
    pinta('<div class="ep-login">' + cabecera() +
      '<form class="ep-form" id="f-datos">' +
        msg(aviso || (yaEra
          ? (teniaClave ? 'Cambia tu contraseña y sigue.' : '¡Ya te conocemos! Revisa tus datos y crea tu contraseña.')
          : 'Solo falta esto y quedas registrado.'), malo) +
        '<label class="ep-campo"><span class="ep-lbl">Tu nombre</span>' +
          '<input class="ep-in" id="d-nombre" autocomplete="name" maxlength="80" value="' + esc(c.nombre || '') + '" placeholder="Como quieres que te llamemos"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Dirección <span style="opacity:.6">· para tus domicilios</span></span>' +
          '<input class="ep-in" id="d-dir" autocomplete="street-address" maxlength="160" value="' + esc(c.direccion || '') + '" placeholder="Calle 5 # 10-20, apto 301"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Barrio</span>' +
          '<input class="ep-in" id="d-barrio" maxlength="60" value="' + esc(c.barrio || '') + '" placeholder="Escríbelo como lo conoces"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Crea tu contraseña</span>' +
          '<input class="ep-in" id="d-clave" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>' +
        '<label class="ep-fila"><input type="checkbox" id="d-recordar" checked> Mantener mi sesión</label>' +
        '<button class="ep-btn ep-btn--main" type="submit" id="b-datos">Entrar</button>' +
      '</form>' +
      '<p class="ep-nota">La próxima vez entras solo con tu celular y tu contraseña.</p>' +
    '</div>');

    $('f-datos').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var b = $('b-datos'); b.disabled = true; b.textContent = 'Un momento…';
      var d = await acceso({
        accion: 'crear-cuenta', telefono: S.tel, pase: S.pase,
        nombre: $('d-nombre').value, direccion: $('d-dir').value,
        barrio: $('d-barrio').value, clave: $('d-clave').value,
        recordar: $('d-recordar').checked,
      });
      if (!d.ok) return pantallaDatos({ nombre: $('d-nombre').value, direccion: $('d-dir').value, barrio: $('d-barrio').value },
                                      yaEra, teniaClave, d.mensaje || 'No se pudo.', true);
      guardarToken(d.token); S.cliente = d.cliente; pantallaDentro();
    });
  }

  // ── 4. Dentro ───────────────────────────────────────────────────────
  /* Iconos de línea propios, stroke 1.6, como pide el handoff. Sin emojis. */
  var IC = {
    home:  'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
    carta: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    wallet:'M21 12V7H5a2 2 0 0 1 0-4h14v4|M3 5v14a2 2 0 0 0 2 2h16v-5|M18 12a2 2 0 0 0 0 4h4v-4z',
    gift:  'M20 12v10H4V12|M2 7h20v5H2z|M12 22V7|M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z|M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    user:  'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
    pin:   'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z|M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    plus:  'M12 5v14|M5 12h14',
    salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9',
    bolsa: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z|M3 6h18|M16 10a4 4 0 0 1-8 0',
    circulo: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
    estrella: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
    corona: 'M2 18h20|M3 18l1.5-9 4.5 4 3-6 3 6 4.5-4L21 18z',
    diamante: 'M6 3h12l4 6-10 12L2 9z|M2 9h20|M12 3 8 9l4 12 4-12z',
    sol: 'M12 3v2|M12 19v2|M5.6 5.6l1.4 1.4|M17 17l1.4 1.4|M3 12h2|M19 12h2|M5.6 18.4 7 17|M17 7l1.4-1.4|M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
    luna: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    tarjeta: 'M2 6h20v12H2z|M2 10h20',
    reloj: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z|M12 7v5l3 2',
    camara: 'M4 8h3l1.5-2h7L17 8h3v11H4z|M12 11a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z'
  };
  function ico(n, t) {
    t = t || 20;
    return '<svg width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      IC[n].split('|').map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</svg>';
  }

  function COP(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }

  var TABS = [
    { k: 'inicio',    n: 'Inicio',    i: 'home'   },
    { k: 'carta',     n: 'Carta',     i: 'carta'  },
    { k: 'billetera', n: 'Billetera', i: 'wallet' },
    { k: 'puntos',    n: 'Puntos',    i: 'gift'   },
    { k: 'perfil',    n: 'Perfil',    i: 'user'   }
  ];
  var vista = 'inicio';

  function iniciales(nom) {
    return (nom || '?').split(' ').filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function pantallaDentro() {
    var c = S.cliente || {};
    var n = c.nivel || null;
    var e = S.negocio || {};
    var hora = new Date().getHours();
    var saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

    var lateral = '<aside class="ep-side">' +
      '<div class="ep-side-hd"><div class="ep-side-logo">' + ((S.negocio && S.negocio.logo) ? '<img class="ep-marca-img" src="' + esc(S.negocio.logo) + '" alt="">' : ico('bolsa', 19)) + '</div>' +
      '<div class="ep-side-nom">' + esc(e.nombre || '') + '</div></div>' +
      '<div class="ep-side-sec">Mi cuenta</div>' +
      TABS.map(function (t) {
        return '<button class="ep-nav' + (t.k === vista ? ' on' : '') + '" data-ir="' + t.k + '">' +
          ico(t.i, 18) + t.n + '</button>';
      }).join('') +
      '<div class="ep-side-sec">Más</div>' +
      '<button class="ep-nav" data-ir="local">' + ico('pin', 18) + 'El local</button>' +
      '<button class="ep-nav" data-salir="1">' + ico('salir', 18) + 'Cerrar sesión</button>' +
    '</aside>';

    var tabs = '<nav class="ep-tabs">' + TABS.map(function (t) {
      return '<button class="ep-tab' + (t.k === vista ? ' on' : '') + '" data-ir="' + t.k + '">' +
        ico(t.i, 21) + '<span>' + t.n + '</span></button>';
    }).join('') + '</nav>';

    pinta('<div class="ep-app">' + lateral +
      '<div class="ep-cuerpo"><div class="ep-scroll">' + cuerpoDe(vista, c, n, saludo) + '</div>' +
      tabs + '</div></div>');

    document.querySelectorAll('[data-ir]').forEach(function (b) {
      b.addEventListener('click', async function () {
        vista = b.dataset.ir;
        // Se trae lo que esa pestaña necesita ANTES de pintarla, para que no
        // aparezca vacia un instante y luego se llene de golpe.
        if (vista !== 'pedido') pedidoHecho = null;
        if (vista === 'carta')  await cargarCarta();
        if (vista === 'puntos') await cargarCatalogo();
        catActiva = 0;
        window.scrollTo(0, 0);
        pantallaDentro();
      });
    });
    document.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () { catActiva = Number(b.dataset.cat) || 0; pantallaDentro(); });
    });
    document.querySelectorAll('[data-salir]').forEach(function (b) {
      b.addEventListener('click', salir);
    });
    // La foto del perfil. El campo va escondido dentro del circulo: se toca la
    // foto y se escoge, sin un boton aparte que explicar.
    document.querySelectorAll('[data-monto]').forEach(function (b) {
      b.addEventListener('click', function () {
        recargaMonto = Number(b.dataset.monto) || 0;
        recargaOtro = '';
        pantallaDentro();
      });
    });
    var otro = $('rc-otro');
    if (otro) {
      otro.addEventListener('input', function () { recargaOtro = this.value; });
      /* Solo al salir del campo se repinta: hacerlo en cada tecla le quitaria
         el foco al usuario mientras escribe. */
      otro.addEventListener('blur', pantallaDentro);
    }
    var comp = $('rc-comp');
    if (comp) {
      comp.addEventListener('change', function () {
        var l = $('rc-comp-lbl');
        if (l) l.textContent = (this.files && this.files[0]) ? this.files[0].name : 'Adjuntar comprobante';
      });
    }

        var campoFoto = $('pf-foto');
    if (campoFoto) {
      campoFoto.addEventListener('change', function () {
        if (this.files && this.files[0]) guardarFoto(this.files[0]);
        this.value = '';   // para poder escoger la MISMA foto otra vez
      });
    }
    document.querySelectorAll('[data-tema]').forEach(function (b) {
      b.addEventListener('click', alternarTema);
    });
    document.querySelectorAll('[data-rango]').forEach(function (b) {
      b.addEventListener('click', function () { chartRango = b.dataset.rango; pantallaDentro(); });
    });
    document.querySelectorAll('[data-plato]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = b.dataset.plato.split('|');
        abrirPlato(Number(x[0]), Number(x[1]));
      });
    });
    document.querySelectorAll('[data-quitar]').forEach(function (b) {
      b.addEventListener('click', function () { carro.splice(Number(b.dataset.quitar), 1); pantallaDentro(); });
    });
    document.querySelectorAll('[data-entrega]').forEach(function (b) {
      b.addEventListener('click', function () { entrega = b.dataset.entrega; pantallaDentro(); });
    });
    var env = $('pd-enviar');
    if (env) env.addEventListener('click', enviarPedido);
  }

  async function salir() {
    await acceso({ accion: 'salir', token: leerToken() });
    borrarToken(); S.cliente = null; vista = 'inicio'; pantallaEntrar('', false);
  }

  /* La escalera de rangos. Los iconos van por posición —círculo, estrella,
     corona, diamante— así que sirve igual para un restaurante con tres niveles
     que para uno con cuatro. */
  var ICO_PASO = ['circulo', 'estrella', 'corona', 'diamante'];

  function escalera(n) {
    var lista = S.niveles || [];
    if (!lista.length) return '';
    var actual = -1;
    for (var i = 0; i < lista.length; i++) if (n && lista[i].nombre === n.nombre) actual = i;
    var html = '';
    for (var j = 0; j < lista.length; j++) {
      var hecho = j <= actual;
      html += '<div class="ep-paso' + (hecho ? ' hecho' : '') + '" style="color:' +
        esc(hecho ? (lista[j].color || '#e3b04b') : '') + '">' +
        '<div class="ep-paso-o">' + ico(ICO_PASO[j] || 'circulo', 13) + '</div>' +
        '<div class="ep-paso-l"' + (hecho ? ' style="color:inherit"' : '') + '>' + esc(lista[j].nombre) + '</div></div>';
    }
    return '<div class="ep-escalera">' + html + '</div>';
  }

  /* Panel "Mi billetera": el saldo grande, las cuatro cifras de un vistazo y la
     barra de nivel con su escalera. */
  function panelBilletera(c, n) {
    var mini = [
      { i: 'tarjeta', v: COP(c.saldo), d: 'Listo para pedir', l: 'Saldo' },
      { i: 'gift',    v: (Number(c.puntos) || 0) + ' pts', d: 'Para redimir', l: 'Puntos' },
      { i: 'bolsa',   v: String((n && n.pedidos) || (c.pedidos || []).length), d: 'Historial total', l: 'Pedidos' },
      { i: 'estrella', v: (n && n.nombre) || '—', d: n && n.siguiente ? 'Siguiente: ' + n.siguiente : 'El más alto', l: 'Rango' }
    ].map(function (m) {
      return '<div class="ep-mini-c"><div class="ep-mini-ico">' + ico(m.i, 14) + '</div>' +
        '<div class="ep-mini-d" style="margin:0 0 3px">' + esc(m.l) + '</div>' +
        '<div class="ep-mini-v">' + esc(m.v) + '</div>' +
        '<div class="ep-mini-d">' + esc(m.d) + '</div></div>';
    }).join('');

    return '<div class="ep-panel">' +
      '<div class="ep-panel-hd"><div>' +
        '<div class="ep-panel-lbl">Mi billetera</div>' +
        '<div class="ep-panel-val">' + COP(c.saldo) + '</div></div>' +
        '<button class="ep-gold" data-ir="billetera">＋ Recargar</button>' +
      '</div>' +
      '<div class="ep-mini-grid">' + mini + '</div>' +
      (n ? '<div class="ep-nivel-fila">' +
          '<span class="ep-nivel-chip">' + ico('estrella', 13) + esc(n.nombre) + '</span>' +
          '<span class="ep-nivel-sig">' + (n.siguiente ? 'Siguiente · ' + esc(n.siguiente) : 'Nivel máximo') + '</span>' +
        '</div>' +
        '<div class="ep-bar" style="margin-top:9px"><i style="width:' + (Number(n.progreso) || 0) +
          '%;background:linear-gradient(90deg,#8f2242,#e3b04b)"></i></div>' +
        '<div class="ep-nivel-txt">' + (n.siguiente
          ? 'Llevas <b>' + (Number(n.progreso) || 0) + '%</b> del camino a <b>' + esc(n.siguiente) + '</b>. Cada pedido te acerca.'
          : 'Llegaste al nivel más alto. Gracias por volver.') + '</div>' +
        escalera(n)
      : '') +
    '</div>';
  }

  /* Gráfica de actividad: los pedidos del cliente por mes. Es SU historial, no
     un dato de ejemplo — la barra más alta es su mejor mes. */
  var chartRango = 'mes';
  function panelGrafica(c) {
    var peds = c.pedidos || [];
    var ahora = new Date();
    var etiquetas = [], valores = [];

    if (chartRango === 'mes') {
      for (var d = 6; d >= 0; d--) {
        var f = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - d);
        etiquetas.push(f.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''));
        valores.push(peds.filter(function (p) {
          var x = new Date(p.fecha);
          return x.toDateString() === f.toDateString();
        }).length);
      }
    } else {
      for (var m = 6; m >= 0; m--) {
        var g = new Date(ahora.getFullYear(), ahora.getMonth() - m, 1);
        etiquetas.push(g.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''));
        valores.push(peds.filter(function (p) {
          var y = new Date(p.fecha);
          return y.getMonth() === g.getMonth() && y.getFullYear() === g.getFullYear();
        }).length);
      }
    }

    var max = Math.max.apply(null, valores.concat([1]));
    var barras = valores.map(function (v, i) {
      var alto = Math.round((v / max) * 100);
      return '<div class="ep-col">' +
        '<div class="ep-barra-v' + (v === max && v > 0 ? ' top' : '') + '" style="height:' + Math.max(alto, 4) + '%"></div>' +
        '<div class="ep-col-l">' + esc(etiquetas[i]) + '</div></div>';
    }).join('');

    return '<div class="ep-panel">' +
      '<div class="ep-panel-hd"><div>' +
        '<div class="ep-panel-lbl">Tu actividad</div>' +
        '<div class="ep-panel-val">' + peds.length + ' pedido' + (peds.length === 1 ? '' : 's') + '</div></div>' +
        '<div class="ep-seg">' +
          '<button data-rango="mes"' + (chartRango === 'mes' ? ' class="on"' : '') + '>Mes</button>' +
          '<button data-rango="anio"' + (chartRango === 'anio' ? ' class="on"' : '') + '>Año</button>' +
        '</div>' +
      '</div>' +
      '<div class="ep-plot">' + barras + '</div>' +
    '</div>';
  }

  function cuerpoInicio(c, n, saludo) {
    var e = S.negocio || {};
    var tel = String(c.telefono || '');

    /* Tarjeta de saldo. Va en cero porque las recargas todavía no existen: se
       pinta desde ya para no tener que rehacer el tablero cuando entren. */
    /* Estructura del handoff corregido: el boton es HERMANO de la tarjeta,
       dentro del wrap. Si va dentro, la mascara de la muesca lo recorta. */
    var saldo = '<div class="ep-wc-wrap"><div class="ep-wcard">' +
      '<div class="ep-wc-head">' +
        '<span class="ep-wc-brand">' + esc((e.nombre || '').toUpperCase()) + '</span>' +
        '<span class="ep-wc-exp"><svg class="ep-ic" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m12 4.4 2.3 4.9 5.2.7-3.8 3.7.9 5.3-4.6-2.6-4.6 2.6.9-5.3L4.5 10l5.2-.7z"/></svg>' +
          '<span class="ep-wc-rank">' + esc(((n && n.nombre) || '').toUpperCase()) + '</span></span>' +
      '</div>' +
      '<span class="ep-wc-lbl">Saldo disponible</span>' +
      '<div class="ep-wc-bal">' +
        '<span class="ep-wc-amt">' + COP(c.saldo) + '</span>' +
        '<span class="ep-wc-spark"><svg class="ep-ic" width="19" height="19" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 3.6c.6 4.3 2.5 6.2 6.8 6.8-4.3.6-6.2 2.5-6.8 6.8-.6-4.3-2.5-6.2-6.8-6.8 4.3-.6 6.2-2.5 6.8-6.8z"/></svg></span>' +
      '</div>' +
      '<div class="ep-wc-num">\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ' + esc(tel.slice(-4)) + '</div>' +
      '<div class="ep-wc-holder">' + esc(c.nombre || '') + '</div>' +
    '</div>' +
      '<button class="ep-wc-cta" data-ir="billetera"><svg class="ep-ic" width="15" height="15" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14"/></svg> Recargar</button>' +
    '</div>';

    var puntos = '<div class="ep-pts-wrap"><div class="ep-pts-hero">' +
      '<div class="ep-pts-head"><span class="ep-pts-lbl"><svg class="ep-ic" width="14" height="14" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-2.5 0-4.2-.6-4.2-2.2S9.2 4 12 9zm0 0c2.5 0 4.2-.6 4.2-2.2S14.8 4 12 9z"/></g></svg> Puntos disponibles</span></div>' +
      '<span class="ep-pts-big">' + (Number(c.puntos) || 0) + '<small>pts</small></span>' +
      '<div class="ep-pts-tags">' +
        '<span class="ep-pts-note">Ganas puntos con todos tus pedidos</span>' +
      '</div>' +
      '<span class="ep-pts-gem"></span>' +
    '</div>' +
      '<button class="ep-pts-orb" data-ir="puntos"><svg class="ep-ic" width="19" height="19" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-2.5 0-4.2-.6-4.2-2.2S9.2 4 12 9zm0 0c2.5 0 4.2-.6 4.2-2.2S14.8 4 12 9z"/></g></svg></button>' +
    '</div>';

    /* La escalera de rangos sale de la CONFIGURACIÓN del restaurante, no de una
       lista escrita aquí: cada uno tiene los suyos y puede cambiarlos. */
    var rango = '';
    if (n) {
      rango = '<div class="ep-tile">' +
        '<div class="ep-tile-lbl">Tu rango</div>' +
        '<div class="ep-tile-sub">' + (n.siguiente
          ? (Number(n.progreso) || 0) + '% a ' + esc(n.siguiente)
          : 'Estás en el nivel más alto') + '</div>' +
        '<div class="ep-rango-nom" style="color:' + esc(n.color || '#e3b04b') + '">' +
          ico('estrella', 15) + ' ' + esc(n.nombre || '') + '</div>' +
        '<div class="ep-bar"><i style="width:' + (Number(n.progreso) || 0) +
          '%;background:linear-gradient(90deg,#8f2242,#e3b04b)"></i></div>' +
        escalera(n) +
      '</div>';
    }

    var acts = '<div class="ep-acts">' +
      '<button class="ep-act primary" data-ir="carta">' + ico('bolsa') + 'Pedir</button>' +
      '<button class="ep-act" data-ir="billetera">' + ico('wallet') + 'Recargar</button>' +
      '<button class="ep-act" data-ir="puntos">' + ico('gift') + 'Redimir</button>' +
      '<button class="ep-act" data-ir="local">' + ico('pin') + 'El local</button>' +
    '</div>';

    var peds = c.pedidos || [];
    var actividad = '<div class="ep-lista">' +
      '<div class="ep-tile-lbl" style="font-size:17px;margin-bottom:4px">Tu actividad</div>' +
      (peds.length ? peds.map(function (p) {
        var f = new Date(p.fecha);
        var donde = p.canal === 'domicilio' ? 'Domicilio' : (p.canal === 'salon' ? 'En el local' : 'Para llevar');
        return '<div class="ep-li"><div class="ep-li-ico">' + ico('bolsa', 16) + '</div>' +
          '<div class="ep-li-b"><div class="ep-li-t">Pedido</div>' +
          '<div class="ep-li-s">' + f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' · ' + donde + '</div></div>' +
          '<div class="ep-li-m">' + COP(p.total) + '</div></div>';
      }).join('') : '<div class="ep-vacio">Todavía no has hecho tu primer pedido.</div>') +
    '</div>';

    return '<div class="ep-saludo">' +
        '<div><div class="ep-saludo-t">' + saludo + '</div>' +
        '<div class="ep-saludo-n">' + esc((c.nombre || '').split(' ')[0] || 'Hola') + '</div></div>' +
        botonesArriba() +
      '</div>' +
      '<div class="ep-sec-hd"><div><div class="ep-sec-t">Resumen</div>' +
        '<div class="ep-sec-s">Aquí está el estado de tu cuenta en ' + esc(e.nombre || '') + '</div></div>' +
        '<div class="ep-hd-der">' +
          (n ? '<span class="ep-chip-rango" style="color:' + esc(n.color || '') + '">' +
                 ico('estrella', 12) + ' ' + esc(n.nombre) + '</span>' : '') +
          '<button class="ep-gold" data-ir="carta">' + ico('bolsa', 15) + ' Pedir ahora</button>' +
        '</div>' +
      '</div>' +
      '<div class="ep-over">' + saldo + puntos + rango + '</div>' +
      '<div class="ep-mid">' + panelBilletera(c, n) + panelGrafica(c) + '</div>' +
      acts + actividad;
  }

  /* ── Las demás pantallas ──────────────────────────────────────────
     La carta y el catálogo de puntos se piden UNA vez y quedan en memoria: son
     los mismos para todos y no cambian entre pestaña y pestaña. */
  var catActiva = 0;

  /* Los botones de arriba a la derecha. En UN solo sitio porque los usan el
     inicio y todas las demas pantallas: copiados, un dia dejarian de coincidir. */
  function botonesArriba(extra) {
    var c = S.cliente || {};
    return '<div class="ep-saludo-btns">' + (extra || '') +
      '<button class="ep-redondo ep-tema" data-tema="1" title="Cambiar el tema">' +
        ico(esOscuroAhora() ? 'sol' : 'luna', 17) + '</button>' +
      '<button class="ep-redondo ep-yo" data-ir="perfil" title="Mi perfil">' +
        (c.foto ? '<img src="' + esc(c.foto) + '" alt="">' : esc(iniciales(c.nombre))) +
      '</button>' +
    '</div>';
  }

  function encabezado(titulo, sub) {
    return '<div class="ep-saludo">' +
      '<div><div class="ep-saludo-t">' + esc(sub || (S.negocio && S.negocio.nombre) || '') + '</div>' +
      '<div class="ep-saludo-n">' + esc(titulo) + '</div></div>' +
      botonesArriba('<button class="ep-redondo" data-ir="inicio" title="Inicio">' + ico('home', 17) + '</button>') +
    '</div>';
  }

  // ── Carta ───────────────────────────────────────────────────────────
  function cuerpoCarta() {
    var cats = S.carta || [];
    if (!cats.length) return encabezado('Carta') + '<div class="ep-vacio">La carta todavía no está publicada.</div>';
    if (catActiva >= cats.length) catActiva = 0;
    var c = cats[catActiva];

    var chips = '<div class="ep-cats">' + cats.map(function (x, i) {
      return '<button class="ep-cat' + (i === catActiva ? ' on' : '') + '" data-cat="' + i + '">' + esc(x.categoria) + '</button>';
    }).join('') + '</div>';

    var platos = '<div class="ep-platos">' + (c.productos || []).map(function (p, i) {
      /* Si tiene presentaciones (Personal / Familiar) el precio se muestra como
         "desde": enseñar solo uno haría que el cliente se lleve una sorpresa. */
      var pres = p.presentaciones || [];
      var precio = Number(p.precio) || 0;
      var desde = false;
      if (pres.length) {
        var mins = pres.map(function (x) { return Number(x.precio) || 0; }).filter(function (x) { return x > 0; });
        if (mins.length) { precio = Math.min.apply(null, mins); desde = mins.length > 1; }
      }
      return '<button class="ep-plato" data-plato="' + catActiva + '|' + i + '">' +
        '<div class="ep-plato-img">' + (p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : ico('bolsa', 34)) + '</div>' +
        '<div class="ep-plato-b">' +
          '<div class="ep-plato-n">' + esc(p.nombre) + '</div>' +
          (p.descripcion ? '<div class="ep-plato-d">' + esc(p.descripcion) + '</div>' : '') +
          '<div class="ep-plato-p">' + (desde ? '<small>desde </small>' : '') + COP(precio) + '</div>' +
        '</div></button>';
    }).join('') + '</div>';

    var cerrado = (S.negocio && !S.negocio.abierto)
      ? '<div class="ep-aviso">' + esc(S.negocio.detalle || 'Ahora está cerrado') + '. ' +
        (S.negocio.permite_programar
          ? 'Puedes dejar tu pedido programado para cuando abramos.'
          : 'Puedes mirar la carta, pero los pedidos se toman cuando abrimos.') + '</div>'
      : '';

    var barra = carro.length
      ? '<button class="ep-cartbar" data-ir="pedido"><span class="ep-cart-n">' + carroCuantos() + '</span>' +
        'Ver mi pedido<span class="ep-cart-tot">' + COP(carroTotal()) + '</span></button>'
      : '';
    return encabezado('Carta', 'Lo que hay hoy') + chips + cerrado + platos + barra;
  }

  // ── Puntos ──────────────────────────────────────────────────────────
  function cuerpoPuntos() {
    var c = S.cliente || {};
    var mios = Number(c.puntos) || 0;
    var cat = S.catalogo || [];

    /* La tarjeta de puntos, con la estructura del handoff corregido: el boton
       circular va FUERA, como hermano dentro del wrap. Dentro lo recortaria la
       mascara de la muesca. */
    var hero = '<div class="ep-pts-wrap" style="margin-bottom:14px"><div class="ep-pts-hero">' +
      '<div class="ep-pts-head"><span class="ep-pts-lbl"><svg class="ep-ic" width="14" height="14" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-2.5 0-4.2-.6-4.2-2.2S9.2 4 12 9zm0 0c2.5 0 4.2-.6 4.2-2.2S14.8 4 12 9z"/></g></svg> Puntos disponibles</span></div>' +
      '<span class="ep-pts-big">' + mios + '<small>pts</small></span>' +
      '<div class="ep-pts-tags">' +
        (c.puntos_ultimo ? '<span class="ep-pts-tag">+' + c.puntos_ultimo + ' pts en tu último pedido</span>' : '') +
        '<span class="ep-pts-note">Ganas 1 punto por cada $1.000 de tus pedidos</span>' +
      '</div>' +
      '<span class="ep-pts-gem"></span>' +
    '</div>' +
      '<button class="ep-pts-orb" data-ir="carta"><svg class="ep-ic" width="19" height="19" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-2.5 0-4.2-.6-4.2-2.2S9.2 4 12 9zm0 0c2.5 0 4.2-.6 4.2-2.2S14.8 4 12 9z"/></g></svg></button>' +
    '</div>';

    /* El catalogo se muestra SIEMPRE COMPLETO, con la distancia a cada premio.
       Decision de Sergio: nunca decirle a alguien "todavia no puedes redimir
       nada" — se le muestra todo y cuanto le falta, que es lo que hace que
       vuelva. En tres grupos, para que se vea de un golpe donde esta parado. */
    var listos = [], cerca = [], lejos = [];
    cat.forEach(function (k) {
      var falta = Math.max(0, (Number(k.puntos) || 0) - mios);
      var it = { k: k, falta: falta };
      if (falta === 0) listos.push(it);
      else if (falta <= 20) cerca.push(it);
      else lejos.push(it);
    });
    [listos, cerca, lejos].forEach(function (g) {
      g.sort(function (a, b) { return (Number(a.k.puntos) || 0) - (Number(b.k.puntos) || 0); });
    });

    function fila(it) {
      var k = it.k, pts = Number(k.puntos) || 0;
      var din = Number(k.dinero) || 0;
      var precio = pts + ' pts' + (din > 0 ? ' + ' + COP(din) : '');
      /* Cuando ya le alcanza, NO se le dice cuanto le falta: es la razon de
         tener dos grupos y no una lista con condiciones dentro del texto. */
      var sub = it.falta === 0
        ? (din > 0 ? 'Lo puedes pedir poniendo ' + COP(din) : 'Ya lo puedes pedir')
        : 'Te faltan ' + it.falta + ' pts · un pedido de ' + COP(it.falta * 1000);
      return '<div class="ep-redeem' + (it.falta === 0 ? '' : ' soon') + '">' +
        '<span class="ep-redeem-ic">' + (k.foto
          ? '<img src="' + esc(k.foto) + '" alt="">' : ico('gift', 19)) + '</span>' +
        '<div class="ep-redeem-body"><b>' + esc(k.nombre || '') + '</b>' +
          '<small>' + esc(sub) + '</small></div>' +
        '<span class="ep-btn ' + (it.falta === 0 ? 'light' : 'ghost') + ' sm">' + esc(precio) + '</span>' +
      '</div>';
    }

    function grupo(titulo, g) {
      if (!g.length) return '';   // un titulo sin nada debajo solo estorba
      return '<div class="ep-block"><div class="ep-block-h"><h3>' + titulo + '</h3></div>' +
        g.map(fila).join('') + '</div>';
    }

    var lista = cat.length
      ? grupo('Ya puedes pedir', listos) + grupo('Te falta poco', cerca) + grupo('Para ir juntando', lejos)
      : '<div class="ep-vacio">Todavía no hay premios para canjear. Sigue sumando puntos.</div>';

    /* Como se redime: en Cobra lo aplica el restaurante al cobrar, no se manda
       por WhatsApp como en el diseño. Se dice para que nadie se quede esperando
       un boton que no existe. */
    var comoVa = cat.length
      ? '<div class="ep-ok">Para usar tus puntos, dilos al hacer tu pedido o al pagar. ' +
        'El restaurante los descuenta en ese momento.</div>'
      : '';

    return encabezado('Puntos', 'Tu programa de fidelidad') + hero + lista + comoVa;
  }

  /* Los montos que se ofrecen de un toque. Redondos y en el orden en que la
     gente los piensa; el que quiera otro lo escribe. */
  var MONTOS = [20000, 50000, 100000, 200000];
  var recargaMonto = 50000, recargaOtro = '';

  function cuerpoBilletera() {
    var c = S.cliente || {};
    var e = S.negocio || {};
    var pago = S.pago || {};
    var final = recargaOtro
      ? parseInt(String(recargaOtro).replace(/\D/g, '') || '0', 10)
      : recargaMonto;

    /* La tarjeta, con la estructura del handoff: el boton va FUERA del recorte. */
    var tarjeta = '<div class="ep-wc-wrap" style="margin-bottom:14px"><div class="ep-wcard">' +
      '<div class="ep-wc-head"><span class="ep-wc-brand">' + esc((e.nombre || '').toUpperCase()) + '</span></div>' +
      '<span class="ep-wc-lbl">Saldo disponible</span>' +
      '<div class="ep-wc-bal"><span class="ep-wc-amt">' + COP(c.saldo) + '</span>' +
        '<span class="ep-wc-spark"><svg class="ep-ic" width="19" height="19" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 3.6c.6 4.3 2.5 6.2 6.8 6.8-4.3.6-6.2 2.5-6.8 6.8-.6-4.3-2.5-6.2-6.8-6.8 4.3-.6 6.2-2.5 6.8-6.8z"/></svg></span></div>' +
      '<div class="ep-wc-num">\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ' +
        esc(String(c.telefono || '').slice(-4)) + '</div>' +
      '<div class="ep-wc-holder">' + esc(c.nombre || '') + '</div>' +
    '</div></div>';

    var botones = MONTOS.map(function (m) {
      var on = !recargaOtro && recargaMonto === m;
      return '<button class="ep-monto' + (on ? ' on' : '') + '" data-monto="' + m + '">' + COP(m) + '</button>';
    }).join('');

    /* Los datos de pago salen de la CONFIGURACION del restaurante, no escritos
       aqui: cada uno tiene su cuenta, y una cuenta equivocada manda la plata a
       otro lado. Si no estan configurados, no se muestra el formulario. */
    var datos = '';
    if (pago.llave || pago.numero) {
      datos = '<div class="ep-pay"><h4>Datos de pago</h4>' +
        (pago.llave   ? '<div class="ep-pay-row"><span>Llave / Nequi</span><b>' + esc(pago.llave) + '</b></div>' : '') +
        (pago.numero  ? '<div class="ep-pay-row"><span>' + esc(pago.entidad || 'Cuenta') + '</span><b>' + esc(pago.numero) + '</b></div>' : '') +
        (pago.titular ? '<div class="ep-pay-row"><span>Titular</span><b>' + esc(pago.titular) + '</b></div>' : '') +
        '<div class="ep-pay-total"><span>Vas a recargar</span><b>' + COP(final) + '</b></div>' +
      '</div>';
    }

    var formulario = (pago.llave || pago.numero)
      ? '<div class="ep-card">' +
          '<h3>Recargar</h3>' +
          '<p class="sub">Elige el monto, transfiere y sube el comprobante. ' +
            'Tu saldo se acredita cuando el pago quede verificado.</p>' +
          '<div class="ep-montos">' + botones + '</div>' +
          '<input class="ep-input" id="rc-otro" placeholder="Otro monto" inputmode="numeric" value="' + esc(recargaOtro) + '">' +
          datos +
          '<label class="ep-field"><span>Referencia del pago</span>' +
            '<input class="ep-input" id="rc-ref" placeholder="N\u00ba de transacci\u00f3n"></label>' +
          '<label class="ep-upload"><input type="file" id="rc-comp" accept="image/*" hidden>' +
            '<span id="rc-comp-lbl">Adjuntar comprobante</span></label>' +
          '<button class="ep-btn gold big" id="rc-enviar"' + (final < 5000 ? ' disabled' : '') + '>Enviar recarga</button>' +
          /* Se dice ANTES de que pague, no despues: es plata suya y tiene
             derecho a saber la regla antes de entregarla. */
          '<div class="ep-nota" style="margin-top:12px">El saldo solo se usa en ' + esc(e.nombre || 'el restaurante') +
            ' y no se devuelve en efectivo. No vence.</div>' +
        '</div>'
      : '<div class="ep-aviso">El restaurante todav\u00eda no ha configurado sus datos de pago, ' +
        'as\u00ed que las recargas no est\u00e1n abiertas.</div>';

    var movs = (c.movimientos || []).length
      ? '<div class="ep-block"><div class="ep-block-h"><h3>Tus movimientos</h3></div>' +
        c.movimientos.map(function (m) {
          var suma = Number(m.monto) > 0;
          return '<div class="ep-row"><span class="ep-row-ic">' + ico(suma ? 'tarjeta' : 'bolsa', 18) + '</span>' +
            '<div class="ep-row-body"><b>' + (suma ? 'Recarga' : 'Consumo') + '</b>' +
            '<small>' + esc(new Date(m.fecha).toLocaleDateString('es-CO')) + (m.detalle ? ' \u00b7 ' + esc(m.detalle) : '') + '</small></div>' +
            '<span class="ep-row-amt' + (suma ? ' up' : '') + '">' + (suma ? '+' : '') + COP(m.monto) + '</span></div>';
        }).join('') + '</div>'
      : '';

    return encabezado('Billetera', 'Tu saldo') + tarjeta + formulario + movs;
  }

  function achicar(archivo, lado) {
    return new Promise(function (listo, falla) {
      var fr = new FileReader();
      fr.onerror = function () { falla(new Error('no se pudo leer')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { falla(new Error('no es una imagen')); };
        im.onload = function () {
          var lienzo = document.createElement('canvas');
          lienzo.width = lienzo.height = lado;
          var cx = lienzo.getContext('2d');
          var m = Math.min(im.width, im.height);        // el cuadrado del centro
          cx.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, lado, lado);
          listo(lienzo.toDataURL('image/jpeg', 0.82));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(archivo);
    });
  }

  async function guardarFoto(archivo) {
    if (!archivo || !/^image\//.test(archivo.type)) { alert('Escoge una imagen.'); return; }
    var caja = document.querySelector('.ep-avatar-g');
    if (caja) caja.classList.add('cargando');
    try {
      var chica = await achicar(archivo, 256);
      var d = await fetch(SB_URL + '/functions/v1/web-acceso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'foto', token: leerToken(), foto: chica }),
      }).then(function (r) { return r.json(); });
      if (!d.ok) { alert(d.mensaje || 'No se pudo guardar la foto.'); return; }
      S.cliente.foto = d.foto;
      pantallaDentro();               // se ve al momento, en el perfil y arriba
    } catch (e) {
      /* El motivo, no un "algo fallo". Un mensaje generico aqui me costo dos
         vueltas: el error de verdad era que la funcion del servidor pedia una
         variable que no existia, y desde afuera se veia igual que una foto
         corrupta. Si no se dice que paso, no hay como arreglarlo. */
      console.error('[foto]', e);
      alert('No se pudo guardar la foto.\n\n' + ((e && e.message) || e));
    } finally {
      if (caja) caja.classList.remove('cargando');
    }
  }

  function cuerpoPerfil() {
    var c = S.cliente || {};
    var n = c.nivel || null;
    var tel = String(c.telefono || '');
    return encabezado('Perfil', 'Tu cuenta') +
      '<div class="ep-perfil-hd">' +
        '<label class="ep-avatar-g ep-avatar-sub" title="Cambiar mi foto">' +
          (c.foto ? '<img src="' + esc(c.foto) + '" alt="">' : esc(iniciales(c.nombre))) +
          '<input type="file" id="pf-foto" accept="image/*" hidden>' +
          '<span class="ep-avatar-cam">' + ico('camara', 15) + '</span>' +
        '</label>' +
        '<div class="ep-perfil-n">' + esc(c.nombre || '') + '</div>' +
        '<div class="ep-perfil-t">' + esc(tel.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')) + '</div>' +
        (n ? '<span class="ep-chip-rango" style="color:' + esc(n.color || '') + '">' + esc(n.nombre) + '</span>' : '') +
      '</div>' +

      (n ? '<div class="ep-tile" style="margin-bottom:12px">' +
        '<div class="ep-tile-lbl">Tu progreso</div>' +
        '<div class="ep-tile-sub">' + (n.siguiente
          ? (Number(n.progreso) || 0) + '% del camino a ' + esc(n.siguiente)
          : 'Estás en el nivel más alto') + '</div>' +
        '<div class="ep-bar" style="margin-top:12px"><i style="width:' + (Number(n.progreso) || 0) + '%;background:' + esc(n.color || '#7C5CFF') + '"></i></div>' +
      '</div>' : '') +

      '<div class="ep-stats">' +
        '<div class="ep-stat"><div class="ep-stat-v">' + ((n && n.pedidos) || (c.pedidos || []).length) + '</div><div class="ep-stat-l">Pedidos</div></div>' +
        '<div class="ep-stat"><div class="ep-stat-v">' + (Number(c.puntos) || 0) + '</div><div class="ep-stat-l">Puntos</div></div>' +
        '<div class="ep-stat"><div class="ep-stat-v">' + COP(c.saldo) + '</div><div class="ep-stat-l">Saldo</div></div>' +
      '</div>' +

      '<div class="ep-tile" style="margin-top:12px">' +
        '<div class="ep-tile-lbl" style="margin-bottom:4px">Tus datos</div>' +
        '<div class="ep-dato"><span>Dirección</span><span>' + (esc(c.direccion) || '—') + '</span></div>' +
        '<div class="ep-dato"><span>Barrio</span><span>' + (esc(c.barrio) || '—') + '</span></div>' +
      '</div>' +

      '<button class="ep-btn ep-btn--ghost" style="margin-top:16px" data-salir="1">Cerrar sesión</button>';
  }

  // ── El local ────────────────────────────────────────────────────────
  function cuerpoLocal() {
    var e = S.negocio || {};
    var h = S.horarios || null;
    var dias = [['lunes','Lunes'],['martes','Martes'],['miercoles','Miércoles'],['jueves','Jueves'],
                ['viernes','Viernes'],['sabado','Sábado'],['domingo','Domingo']];
    var filas = h ? dias.map(function (d) {
      var x = h[d[0]] || {};
      return '<div class="ep-dato"><span>' + d[1] + '</span><span>' +
        (x.activo ? esc(x.abre + ' – ' + x.cierra) : 'Cerrado') + '</span></div>';
    }).join('') : '';

    return encabezado('El local', esc(e.nombre || '')) +
      '<div class="ep-tile" style="margin-bottom:12px">' +
        '<div class="ep-tile-lbl">Ahora mismo</div>' +
        '<div class="ep-estado' + (e.abierto ? ' abierto' : '') + '" style="margin-top:10px">' +
          '<span class="ep-punto"></span>' + esc(e.detalle || (e.abierto ? 'Abierto' : 'Cerrado')) + '</div>' +
      '</div>' +
      (filas ? '<div class="ep-tile"><div class="ep-tile-lbl" style="margin-bottom:4px">Horarios</div>' + filas + '</div>'
             : '<div class="ep-aviso">El restaurante todavía no ha publicado sus horarios.</div>');
  }

  /* ── El carrito ────────────────────────────────────────────────────
     Vive en memoria, no se guarda: un carrito viejo que reaparece al día
     siguiente con precios de ayer confunde más de lo que ayuda. */
  var carro = [];
  var sheet = null;   // el plato que se está configurando

  function carroTotal() {
    var t = 0;
    for (var i = 0; i < carro.length; i++) t += carro[i].precio * carro[i].cantidad;
    return t;
  }
  function carroCuantos() {
    var n = 0;
    for (var i = 0; i < carro.length; i++) n += carro[i].cantidad;
    return n;
  }

  // ── Hoja del plato ──────────────────────────────────────────────────
  function abrirPlato(catIdx, prodIdx) {
    var p = ((S.carta[catIdx] || {}).productos || [])[prodIdx];
    if (!p) return;
    sheet = { p: p, talla: 0, cant: 1, nota: '' };
    pintarSheet();
  }

  function precioDe(p, talla) {
    var pres = p.presentaciones || [];
    if (pres.length) return Number(pres[talla] && pres[talla].precio) || Number(p.precio) || 0;
    return Number(p.precio) || 0;
  }

  function pintarSheet() {
    var vieja = document.querySelector('.ep-scrim');
    if (vieja) vieja.remove();
    if (!sheet) return;
    var p = sheet.p;
    var pres = p.presentaciones || [];

    var tallas = pres.length > 1 ? '<div class="ep-tallas">' + pres.map(function (x, i) {
      return '<button class="ep-talla' + (i === sheet.talla ? ' on' : '') + '" data-talla="' + i + '">' +
        esc(x.nombre) + '<span>' + COP(x.precio) + '</span></button>';
    }).join('') + '</div>' : '';

    var d = document.createElement('div');
    d.className = 'ep-scrim';
    d.innerHTML = '<div class="ep-sheet">' +
      '<div class="ep-grab"></div>' +
      '<div class="ep-sheet-n">' + esc(p.nombre) + '</div>' +
      (p.descripcion ? '<div class="ep-sheet-d">' + esc(p.descripcion) + '</div>' : '') +
      tallas +
      '<textarea class="ep-nota-in" id="sh-nota" rows="2" maxlength="120" ' +
        'placeholder="¿Algo para la cocina? Sin cebolla, bien caliente…">' + esc(sheet.nota) + '</textarea>' +
      '<div class="ep-sheet-pie">' +
        '<div class="ep-cant">' +
          '<button data-cant="-1"' + (sheet.cant <= 1 ? ' disabled' : '') + '>−</button>' +
          '<b>' + sheet.cant + '</b>' +
          '<button data-cant="1">+</button>' +
        '</div>' +
        '<button class="ep-btn ep-btn--main" id="sh-add">Agregar · ' +
          COP(precioDe(p, sheet.talla) * sheet.cant) + '</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(d);

    d.addEventListener('click', function (ev) { if (ev.target === d) { sheet = null; pintarSheet(); } });
    d.querySelectorAll('[data-talla]').forEach(function (b) {
      b.addEventListener('click', function () { sheet.talla = Number(b.dataset.talla); pintarSheet(); });
    });
    d.querySelectorAll('[data-cant]').forEach(function (b) {
      b.addEventListener('click', function () {
        sheet.nota = (document.getElementById('sh-nota') || {}).value || sheet.nota;
        sheet.cant = Math.max(1, Math.min(20, sheet.cant + Number(b.dataset.cant)));
        pintarSheet();
      });
    });
    d.querySelector('#sh-add').addEventListener('click', function () {
      var pres = sheet.p.presentaciones || [];
      carro.push({
        producto_id: sheet.p.id,
        nombre: sheet.p.nombre,
        presentacion: pres.length > 1 ? String(pres[sheet.talla].nombre) : '',
        precio: precioDe(sheet.p, sheet.talla),
        cantidad: sheet.cant,
        nota: (document.getElementById('sh-nota') || {}).value || '',
      });
      sheet = null; pintarSheet(); pantallaDentro();
    });
  }

  // ── Pantalla del pedido ─────────────────────────────────────────────
  var entrega = 'recoger';
  var pedidoHecho = null;

  function cuerpoPedido() {
    if (pedidoHecho) return cuerpoConfirmado();
    if (!carro.length) {
      return encabezado('Tu pedido') +
        '<div class="ep-vacio" style="padding:40px 0">Tu pedido está vacío.</div>' +
        '<button class="ep-btn ep-btn--ghost" data-ir="carta">Ver la carta</button>';
    }
    var c = S.cliente || {};
    var lineas = carro.map(function (l, i) {
      return '<div class="ep-linea">' +
        '<div class="ep-linea-b"><div class="ep-linea-n">' + l.cantidad + '× ' + esc(l.nombre) +
          (l.presentacion ? ' · ' + esc(l.presentacion) : '') + '</div>' +
          (l.nota ? '<div class="ep-linea-s">' + esc(l.nota) + '</div>' : '') +
          '<button class="ep-quitar" data-quitar="' + i + '">Eliminar</button></div>' +
        '<div class="ep-li-m">' + COP(l.precio * l.cantidad) + '</div></div>';
    }).join('');

    var sub = carroTotal();
    var gana = Math.floor(sub / 1000);

    return encabezado('Tu pedido') + lineas +
      '<div class="ep-seg-full">' +
        '<button data-entrega="recoger"' + (entrega === 'recoger' ? ' class="on"' : '') + '>Recoger</button>' +
        '<button data-entrega="domicilio"' + (entrega === 'domicilio' ? ' class="on"' : '') + '>Domicilio</button>' +
      '</div>' +
      (entrega === 'domicilio'
        ? '<label class="ep-campo" style="margin-bottom:10px"><span class="ep-lbl">Dirección</span>' +
            '<input class="ep-in" id="pd-dir" value="' + esc(c.direccion || '') + '" placeholder="Calle 5 # 10-20"></label>' +
          '<label class="ep-campo" style="margin-bottom:10px"><span class="ep-lbl">Barrio</span>' +
            '<input class="ep-in" id="pd-barrio" value="' + esc(c.barrio || '') + '" placeholder="Tu barrio"></label>'
        : '') +
      '<label class="ep-campo"><span class="ep-lbl">Nota para la cocina</span>' +
        '<input class="ep-in" id="pd-nota" maxlength="200" placeholder="Opcional"></label>' +

      '<div style="margin-top:18px">' +
        '<div class="ep-total-fila"><span style="color:var(--sub)">Productos</span><span>' + COP(sub) + '</span></div>' +
        (entrega === 'domicilio'
          ? '<div class="ep-total-fila"><span style="color:var(--sub)">Domicilio</span><span style="color:var(--dim)">se calcula al enviar</span></div>'
          : '') +
        '<div class="ep-total-fila grande"><span>Total</span><b>' + COP(sub) + '</b></div>' +
        '<div class="ep-gana">Ganarás +' + gana + ' puntos con este pedido</div>' +
      '</div>' +
      (S.negocio && !S.negocio.abierto
        ? '<div class="ep-aviso">' + esc(S.negocio.detalle || 'Ahora está cerrado') + '. ' +
          (S.negocio.permite_programar
            ? 'Tu pedido quedará <b>programado</b> para cuando abramos.'
            : 'No podemos recibir pedidos en este momento.') + '</div>'
        : '') +
      '<button class="ep-btn ep-btn--main" id="pd-enviar" style="margin-top:16px"' +
        ((S.negocio && !S.negocio.abierto && !S.negocio.permite_programar) ? ' disabled' : '') +
        '>Enviar mi pedido</button>' +
      '<p class="ep-nota" style="text-align:center;margin-top:10px">Se paga por transferencia. Te mostramos los datos al enviarlo.</p>';
  }

  function cuerpoConfirmado() {
    var d = pedidoHecho;
    return '<div style="text-align:center;padding:26px 0 10px">' +
        '<div class="ep-ok-ico">' + ico('estrella', 28) + '</div>' +
        '<div class="ep-saludo-n">' + (d.programado ? '¡Pedido programado!' : '¡Pedido recibido!') + '</div>' +
        '<div class="ep-perfil-t" style="margin-top:6px">' +
          (d.programado ? 'Lo preparamos apenas abramos.' : 'Ya lo tenemos. Falta el pago.') + '</div>' +
      '</div>' +
      '<div class="ep-tile">' +
        '<div class="ep-total-fila"><span style="color:var(--sub)">Productos</span><span>' + COP(d.subtotal) + '</span></div>' +
        (d.domicilio ? '<div class="ep-total-fila"><span style="color:var(--sub)">Domicilio</span><span>' + COP(d.domicilio) + '</span></div>' : '') +
        '<div class="ep-total-fila grande"><span>Total a pagar</span><b>' + COP(d.total) + '</b></div>' +
        (d.domicilio === 0 && d.barrio_conocido === false
          ? '<div class="ep-nota" style="margin-top:6px">El domicilio de tu barrio lo confirma el restaurante.</div>' : '') +
      '</div>' +
      '<div class="ep-pago">' +
        '<div class="ep-tile-lbl" style="margin-bottom:6px">Paga por transferencia</div>' +
        (d.pago && d.pago.llave ? '<div class="ep-dato"><span>Llave / cuenta</span><span>' + esc(d.pago.llave) + '</span></div>' : '') +
        (d.pago && d.pago.titular ? '<div class="ep-dato"><span>A nombre de</span><span>' + esc(d.pago.titular) + '</span></div>' : '') +
        '<div class="ep-dato"><span>Valor</span><span>' + COP(d.total) + '</span></div>' +
      '</div>' +
      '<div class="ep-aviso">Cuando transfieras, mándale el comprobante al restaurante por WhatsApp y tu pedido entra a cocina.</div>' +
      '<button class="ep-btn ep-btn--ghost" style="margin-top:14px" data-ir="inicio">Volver al inicio</button>';
  }

  async function enviarPedido() {
    var b = $('pd-enviar');
    b.disabled = true; b.textContent = 'Enviando…';
    var d = await fetch(SB_URL + '/functions/v1/web-pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: leerToken(), tipo: entrega,
        direccion: entrega === 'domicilio' ? (($('pd-dir') || {}).value || '') : '',
        barrio:    entrega === 'domicilio' ? (($('pd-barrio') || {}).value || '') : '',
        notas: ($('pd-nota') || {}).value || '',
        items: carro.map(function (l) {
          return { producto_id: l.producto_id, presentacion: l.presentacion, cantidad: l.cantidad, nota: l.nota };
        }),
      }),
    }).then(function (r) { return r.json(); }).catch(function () {
      return { ok: false, mensaje: 'No hay conexión.' };
    });

    if (!d.ok) {
      b.disabled = false; b.textContent = 'Enviar mi pedido';
      alert(d.mensaje || 'No se pudo enviar.');
      return;
    }
    pedidoHecho = d;
    carro = [];
    pantallaDentro();
  }

  function cuerpoDe(vista, c, n, saludo) {
    if (vista === 'inicio')    return cuerpoInicio(c, n, saludo);
    if (vista === 'carta')     return cuerpoCarta();
    if (vista === 'puntos')    return cuerpoPuntos();
    if (vista === 'billetera') return cuerpoBilletera();
    if (vista === 'perfil')    return cuerpoPerfil();
    if (vista === 'local')     return cuerpoLocal();
    if (vista === 'pedido')    return cuerpoPedido();
    return cuerpoInicio(c, n, saludo);
  }

  /* Se piden una sola vez, la primera que se entra a esa pestaña. */
  async function cargarCarta() {
    if (S.carta) return;
    var r = await S.sb.rpc('fn_web_carta', { p_slug: S.slug });
    S.carta = (r.data || []);
  }
  async function cargarCatalogo() {
    if (S.catalogo) return;
    var r = await S.sb.rpc('fn_web_puntos_catalogo', { p_slug: S.slug });
    S.catalogo = (r.data || []);
  }

  // ── Arranque ────────────────────────────────────────────────────────
  (async function () {
    pinta('<div class="ep-cargando">Un momento…</div>');

    /* Quién es el restaurante y si está abierto. Va por una función que solo
       devuelve lo público: sin eso, un desconocido tendría que poder leer la
       tabla de restaurantes, donde están los correos y los planes de todos. */
    var sb = window.supabase.createClient(SB_URL, ANON, { auth: { persistSession: false } });
    S.sb = sb;
    var r = await sb.rpc('fn_web_publica', { p_slug: S.slug });
    var neg = (r.data && r.data[0]) || null;
    if (!neg) {
      pinta('<div class="ep-login"><div class="ep-marca">' + ICONO + '</div>' +
        '<h1 class="ep-h1">Esta página no está disponible</h1>' +
        '<p class="ep-lead">Puede que la dirección esté mal escrita, o que el restaurante todavía no la haya abierto.</p></div>');
      return;
    }
    S.negocio = neg;
    // Los rangos de ESTE restaurante, para la escalera. Cada uno tiene los suyos.
    S.niveles = Array.isArray(neg.niveles) ? neg.niveles : [];
    S.horarios = neg.horarios || null;
    S.pago = neg.pago || null;   // los datos para transferir, de la recarga
    document.title = neg.nombre;

    // ¿Ya tenía sesión abierta? (la casilla "mantener mi sesión")
    var t = leerToken();
    if (t) {
      var d = await acceso({ accion: 'sesion', token: t });
      if (d.ok) { S.cliente = d.cliente; return pantallaDentro(); }
      borrarToken();
    }
    pantallaEntrar('', false);
  })();
})();
