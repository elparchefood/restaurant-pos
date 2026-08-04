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
  var ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNDk2NzUsImV4cCI6MjA2ODcyNTY3NX0.CjLcMOJHDCgTPnE3ZhOlgGZgEZLM1SXCK6-fzq6rz9Q';
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
  /* Provisional: muestra lo suyo DE VERDAD —puntos, rango y barra, leídos del
     mismo motor que usa el chat— mientras entran las pantallas del handoff
     (inicio, carta, billetera, puntos, perfil). */
  function pantallaDentro() {
    var c = S.cliente || {};
    var n = c.nivel || null;
    var hora = new Date().getHours();
    var saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

    pinta('<div class="ep-dentro">' +
      '<div class="ep-hola">' + saludo + '</div>' +
      '<div class="ep-nombre">' + esc(c.nombre || 'Hola') + '</div>' +

      '<div class="ep-tarjeta ep-pts">' +
        '<div class="ep-pts-lbl">Puntos disponibles</div>' +
        '<div class="ep-pts-num">' + (Number(c.puntos) || 0) + '<span>pts</span></div>' +
      '</div>' +

      (n ? '<div class="ep-tarjeta">' +
        '<div class="ep-rango-lbl">Tu rango</div>' +
        '<div class="ep-rango-nom" style="color:' + esc(n.color || '#7C5CFF') + '">' + esc(n.nombre || '') + '</div>' +
        '<div class="ep-barra"><i style="width:' + (Number(n.progreso) || 0) + '%;background:' + esc(n.color || '#7C5CFF') + '"></i></div>' +
        '<div class="ep-mini">' +
          (n.siguiente ? (Number(n.progreso) || 0) + '% del camino a ' + esc(n.siguiente) : 'Estás en el nivel más alto') +
        '</div>' +
      '</div>' : '') +

      '<div class="ep-tarjeta">' +
        '<div class="ep-rango-lbl">Ya casi</div>' +
        '<div class="ep-mini" style="margin-top:6px">Aquí van tu saldo, la carta y tus pedidos. Estamos armándolas.</div>' +
      '</div>' +

      '<button class="ep-btn ep-btn--ghost ep-salir" id="b-salir">Cerrar sesión</button>' +
    '</div>');

    $('b-salir').addEventListener('click', async function () {
      await acceso({ accion: 'salir', token: leerToken() });
      borrarToken(); S.cliente = null; pantallaEntrar('', false);
    });
  }

  // ── Arranque ────────────────────────────────────────────────────────
  (async function () {
    pinta('<div class="ep-cargando">Un momento…</div>');

    /* Quién es el restaurante y si está abierto. Va por una función que solo
       devuelve lo público: sin eso, un desconocido tendría que poder leer la
       tabla de restaurantes, donde están los correos y los planes de todos. */
    var sb = window.supabase.createClient(SB_URL, ANON, { auth: { persistSession: false } });
    var r = await sb.rpc('fn_web_publica', { p_slug: S.slug });
    var neg = (r.data && r.data[0]) || null;
    if (!neg) {
      pinta('<div class="ep-login"><div class="ep-marca">' + ICONO + '</div>' +
        '<h1 class="ep-h1">Esta página no está disponible</h1>' +
        '<p class="ep-lead">Puede que la dirección esté mal escrita, o que el restaurante todavía no la haya abierto.</p></div>');
      return;
    }
    S.negocio = neg;
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
