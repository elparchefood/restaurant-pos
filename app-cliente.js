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
    return '<div class="ep-marca">' + ICONO + '</div>' +
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
    reloj: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z|M12 7v5l3 2'
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
      '<div class="ep-side-hd"><div class="ep-side-logo">' + ico('bolsa', 19) + '</div>' +
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
    document.querySelectorAll('[data-tema]').forEach(function (b) {
      b.addEventListener('click', alternarTema);
    });
    document.querySelectorAll('[data-rango]').forEach(function (b) {
      b.addEventListener('click', function () { chartRango = b.dataset.rango; pantallaDentro(); });
    });
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
    var saldo = '<div class="ep-wcard">' +
      '<div class="ep-wc-top"><span class="ep-wc-marca">' + esc((e.nombre || '').toUpperCase()) + '</span>' +
        '<span class="ep-wc-rango">' + esc((n && n.nombre) || '') + '</span></div>' +
      '<div class="ep-wc-lbl">Saldo disponible</div>' +
      '<div class="ep-wc-monto">' + COP(c.saldo) + '</div>' +
      '<div class="ep-wc-num">•••• •••• •••• ' + esc(tel.slice(-4)) + '</div>' +
      '<div class="ep-wc-nom">' + esc(c.nombre || '') + '</div>' +
      '<div class="ep-wc-spark">' + ico('estrella', 17) + '</div>' +
      '<div class="ep-wc-cut"></div>' +
      '<button class="ep-wc-btn" data-ir="billetera">＋ Recargar</button>' +
    '</div>';

    var puntos = '<div class="ep-pts-hero">' +
      '<div class="ep-pts-gema"></div>' +
      '<div class="ep-pts-lbl">Puntos disponibles</div>' +
      '<div class="ep-pts-num">' + (Number(c.puntos) || 0) + '<span>pts</span></div>' +
      '<div class="ep-pts-nota">Ganas puntos con todos tus pedidos</div>' +
      '<div class="ep-pts-cut"></div>' +
      '<button class="ep-pts-btn" data-ir="puntos">' + ico('gift', 18) + '</button>' +
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
        '<div class="ep-avatar">' + esc(iniciales(c.nombre)) + '</div>' +
        '<div><div class="ep-saludo-t">' + saludo + '</div>' +
        '<div class="ep-saludo-n">' + esc((c.nombre || '').split(' ')[0] || 'Hola') + '</div></div>' +
        '<div class="ep-saludo-btns">' +
          '<button class="ep-redondo ep-tema" data-tema="1" title="Cambiar el tema">' +
            ico(esOscuroAhora() ? 'sol' : 'luna', 17) + '</button>' +
          '<button class="ep-redondo" data-ir="local">' + ico('pin', 17) + '</button>' +
          '<button class="ep-redondo" data-salir="1">' + ico('salir', 17) + '</button>' +
        '</div>' +
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

  function encabezado(titulo, sub) {
    return '<div class="ep-saludo">' +
      '<div><div class="ep-saludo-t">' + esc(sub || (S.negocio && S.negocio.nombre) || '') + '</div>' +
      '<div class="ep-saludo-n">' + esc(titulo) + '</div></div>' +
      '<div class="ep-saludo-btns"><button class="ep-redondo" data-ir="inicio">' + ico('home', 17) + '</button></div>' +
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

    var platos = '<div class="ep-platos">' + (c.productos || []).map(function (p) {
      /* Si tiene presentaciones (Personal / Familiar) el precio se muestra como
         "desde": enseñar solo uno haría que el cliente se lleve una sorpresa. */
      var pres = p.presentaciones || [];
      var precio = Number(p.precio) || 0;
      var desde = false;
      if (pres.length) {
        var mins = pres.map(function (x) { return Number(x.precio) || 0; }).filter(function (x) { return x > 0; });
        if (mins.length) { precio = Math.min.apply(null, mins); desde = mins.length > 1; }
      }
      return '<button class="ep-plato">' +
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

    return encabezado('Carta', 'Lo que hay hoy') + chips + cerrado + platos;
  }

  // ── Puntos ──────────────────────────────────────────────────────────
  function cuerpoPuntos() {
    var c = S.cliente || {};
    var mios = Number(c.puntos) || 0;
    var cat = S.catalogo || [];

    var hero = '<div class="ep-pts-hero" style="margin-bottom:16px">' +
      '<div class="ep-pts-gema"></div>' +
      '<div class="ep-pts-lbl">Mis puntos</div>' +
      '<div class="ep-pts-num">' + mios + '<span>pts</span></div>' +
      '<div class="ep-pts-nota">Ganas 1 punto por cada $1.000 de tus pedidos</div>' +
    '</div>';

    /* El catálogo se muestra SIEMPRE completo, con la distancia de cada premio.
       Nunca "todavía no puedes redimir nada": ver cuánto falta es lo que hace
       que el cliente vuelva. */
    var lista = cat.length ? cat.map(function (k) {
      var costo = Number(k.costo) || 0;
      var alcanza = mios >= costo;
      var faltan = Math.max(0, costo - mios);
      return '<div class="ep-canje' + (alcanza ? '' : ' lejos') + '">' +
        '<div class="ep-canje-ico">' + (k.foto ? '<img src="' + esc(k.foto) + '" alt="">' : ico('gift', 20)) + '</div>' +
        '<div class="ep-canje-b"><div class="ep-canje-n">' + esc(k.nombre) + '</div>' +
        '<div class="ep-canje-s">' + (alcanza ? '¡Ya puedes pedirlo!' : 'Te faltan ' + faltan + ' pts') + '</div></div>' +
        '<button class="ep-canje-btn"' + (alcanza ? '' : ' disabled') + '>' + costo + ' pts</button>' +
      '</div>';
    }).join('') : '<div class="ep-vacio">Todavía no hay premios para canjear. Sigue sumando puntos.</div>';

    return encabezado('Puntos', 'Tu programa de fidelidad') + hero +
      '<div class="ep-tile-lbl" style="font-size:16px;margin:4px 0 2px">Qué puedes pedir con ellos</div>' + lista;
  }

  // ── Billetera ───────────────────────────────────────────────────────
  function cuerpoBilletera() {
    var c = S.cliente || {};
    return encabezado('Billetera', 'Tu saldo') +
      '<div class="ep-wcard" style="margin-bottom:14px">' +
        '<div class="ep-wc-top"><span class="ep-wc-marca">' + esc(((S.negocio && S.negocio.nombre) || '').toUpperCase()) + '</span></div>' +
        '<div class="ep-wc-lbl">Saldo disponible</div>' +
        '<div class="ep-wc-monto">' + COP(c.saldo) + '</div>' +
        '<div class="ep-wc-num">•••• •••• •••• ' + esc(String(c.telefono || '').slice(-4)) + '</div>' +
        '<div class="ep-wc-nom">' + esc(c.nombre || '') + '</div>' +
      '</div>' +
      '<div class="ep-aviso">Las recargas todavía no están abiertas. Cuando lo estén, vas a poder recargar aquí y pagar tus pedidos con tu saldo.</div>';
  }

  // ── Perfil ──────────────────────────────────────────────────────────
  function cuerpoPerfil() {
    var c = S.cliente || {};
    var n = c.nivel || null;
    var tel = String(c.telefono || '');
    return encabezado('Perfil', 'Tu cuenta') +
      '<div class="ep-perfil-hd">' +
        '<div class="ep-avatar-g">' + esc(iniciales(c.nombre)) + '</div>' +
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

  function cuerpoDe(vista, c, n, saludo) {
    if (vista === 'inicio')    return cuerpoInicio(c, n, saludo);
    if (vista === 'carta')     return cuerpoCarta();
    if (vista === 'puntos')    return cuerpoPuntos();
    if (vista === 'billetera') return cuerpoBilletera();
    if (vista === 'perfil')    return cuerpoPerfil();
    if (vista === 'local')     return cuerpoLocal();
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
