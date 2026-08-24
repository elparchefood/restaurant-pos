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
  /* Version de ESTE archivo. Subirla junto con el SELLO del index. */
  var VERSION_APP = '0820q';

  var LLAVE_SESION = 'cobra.web.sesion';

  var S = { slug: window.COBRA_SLUG || '', negocio: null, cliente: null, tel: '', pase: null };

  var app = document.getElementById('app');
  /* LA PANTALLA DE ENTRAR NO SE MUEVE. En una app instalada, que la pantalla
     rebote al arrastrarla se siente rota: las apps de verdad no hacen eso.

     El bloqueo se pone y se quita AQUI y no en cada pantalla, porque hay cinco
     pantallas de entrada (telefono, codigo, clave, registro, recuperar) y si se
     hiciera una por una, la que se olvide se queda rebotando.

     Se reconoce por la clase, no por una bandera aparte: una bandera se puede
     desincronizar de lo que se esta pintando; la clase ES lo que se esta
     pintando. */
  function pinta(html) {
    app.innerHTML = html;
    var entrando = html.indexOf('class="ep-login"') >= 0;
    document.documentElement.classList.toggle('ep-quieto', entrando);
  }
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
      /* DOS botones y no uno (pedido de Sergio, 17-ago). Por dentro hacen lo
         mismo —mandar el código por WhatsApp; el servidor ya distingue solo si
         el número es cliente o no—, pero "Es mi primera vez · Olvidé mi
         contraseña" en un solo renglón confundía: el nuevo no se siente
         aludido por "contraseña" y el que la olvidó no está "empezando".
         Cada quien debe encontrar SU botón. Lo único que cambia entre ambos
         es el mensaje que acompaña el código. */
      '<div class="ep-login-links">' +
        '<button class="ep-link" id="b-nuevo">Es mi primera vez, registrarme</button>' +
        '<button class="ep-link" id="b-olvide">Olvidé mi contraseña</button>' +
      '</div>' +
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

    function porCodigo(mensaje) {
      var tel = ($('i-tel').value || '').replace(/\D/g, '').slice(-10);
      if (tel.length !== 10) return pantallaEntrar('Escribe tu celular arriba y te mandamos un código por WhatsApp.', true);
      pedirCodigo(tel, mensaje);
    }
    $('b-nuevo').addEventListener('click', function () {
      porCodigo('¡Bienvenido! Te mandamos un código por WhatsApp para crear tu cuenta.');
    });
    $('b-olvide').addEventListener('click', function () {
      porCodigo('Tranquilo, pasa en las mejores familias 😊 Te mandamos un código por WhatsApp para crear una contraseña nueva.');
    });
  }

  // ── 2. Código por WhatsApp ──────────────────────────────────────────
  async function pedirCodigo(tel, aviso) {
    S.tel = tel;
    pinta('<div class="ep-login">' + cabecera() + '<p class="ep-lead">Enviando tu código…</p></div>');
    /* SOLO EL QUE LO NECESITA (19-ago, pedido de Sergio). El renglon
       "@cobrapos.app #codigo" del SMS es lo que deja al celular escribir el
       codigo solo, pero se VE en el mensaje y afea. En iPhone no hace falta
       —ahi lo resuelve el propio campo— asi que ahi el mensaje va limpio.
       No se pregunta "¿eres Android?" sino "¿este navegador sabe hacerlo?",
       que es la condicion exacta que vuelve util ese renglon. */
    var d = await acceso({
      accion: 'pedir-codigo', telefono: tel,
      otp: (typeof window !== 'undefined' && 'OTPCredential' in window),
    });
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

    /* QUE EL CELULAR LO ESCRIBA SOLO (19-ago, pedido de Sergio).
       En iPhone ya lo hacia el `autocomplete="one-time-code"` del campo. En
       Android hay que pedirlo: el navegador lee el SMS —solo el que termina
       con "@cobrapos.app #codigo"— y lo entrega aqui. El cliente ni siquiera
       tiene que salir de la pagina.

       Va todo dentro de un `try`: en los navegadores que no lo tienen,
       `navigator.credentials` no existe y no debe romper la pantalla. Y se
       cancela al salir del formulario, para no dejar la escucha viva. */
    try {
      if (window.OTPCredential && navigator.credentials && window.AbortController) {
        if (otpCancelar) otpCancelar.abort();
        otpCancelar = new AbortController();
        navigator.credentials.get({ otp: { transport: ['sms'] }, signal: otpCancelar.signal })
          .then(function (cred) {
            var campo = $('i-cod');
            if (!cred || !cred.code || !campo) return;
            campo.value = String(cred.code).replace(/\D/g, '').slice(0, 6);
            /* Se envia solo: si el codigo ya esta completo, hacerle tocar
               "Continuar" es un paso de mas que no aporta nada. */
            if (campo.value.length === 6 && $('f-cod')) {
              $('f-cod').dispatchEvent(new Event('submit', { cancelable: true }));
            }
          })
          .catch(function () { /* lo cancelo el usuario o no llego: sin ruido */ });
      }
    } catch (e) { /* navegador sin soporte */ }

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
  /* AL QUE YA ES CLIENTE NO SE LE PIDEN SUS DATOS OTRA VEZ (15-ago). Quien
     olvido su contraseña ya tiene nombre, direccion, puntos e historial: verlo
     todo en blanco bajo un "solo falta esto y quedas registrado" da la
     impresion de que su cuenta se perdio. Ahora solo escribe su clave nueva y
     entra; si quiere corregir sus datos, hay un enlace que abre el formulario
     completo (ya prellenado). `abrirDatos` lo fuerza desde ese enlace. */
  function pantallaDatos(cli, yaEra, teniaClave, aviso, malo, abrirDatos) {
    var c = cli || {};
    var soloClave = !!yaEra && !abrirDatos;
    var campos = soloClave ? '' :
        /* NOMBRE Y APELLIDO SEPARADOS (20-ago, Sergio). El campo `nombre` de
           la ficha ya trae el nombre completo, asi que aqui se muestra sin el
           apellido para no repetirlo dentro de su propia casilla. */
        '<label class="ep-campo"><span class="ep-lbl">Tu nombre</span>' +
          '<input class="ep-in" id="d-nombre" autocomplete="given-name" maxlength="80" value="' +
            esc(soloNombre(c)) + '" placeholder="Como quieres que te llamemos"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Tu apellido</span>' +
          '<input class="ep-in" id="d-apellido" autocomplete="family-name" maxlength="60" value="' +
            esc(c.apellido || '') + '" placeholder="Tu apellido"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Dirección <span style="opacity:.6">· para tus domicilios</span></span>' +
          '<input class="ep-in" id="d-dir" autocomplete="street-address" maxlength="160" value="' + esc(c.direccion || '') + '" placeholder="Calle 5 # 10-20, apto 301"></label>' +
        '<label class="ep-campo"><span class="ep-lbl">Barrio</span>' +
          '<input class="ep-in" id="d-barrio" maxlength="60" value="' + esc(c.barrio || '') + '" placeholder="Escríbelo como lo conoces"></label>';
    var saludo = c.nombre ? ('¡Hola de nuevo, ' + esc(String(c.nombre).split(' ')[0]) + '! ') : '¡Ya te conocemos! ';
    pinta('<div class="ep-login">' + cabecera() +
      '<form class="ep-form" id="f-datos">' +
        msg(aviso || (soloClave
          ? saludo + (teniaClave ? 'Escribe tu contraseña nueva y entras.' : 'Crea tu contraseña y entras.')
          : (yaEra ? 'Revisa tus datos y sigue.' : 'Solo falta esto y quedas registrado.')), malo) +
        campos +
        '<label class="ep-campo"><span class="ep-lbl">' + (soloClave && teniaClave ? 'Tu contraseña nueva' : 'Crea tu contraseña') + '</span>' +
          '<input class="ep-in" id="d-clave" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>' +
        /* Escribirla dos veces: la contraseña va tapada y un dedo torcido deja
           al cliente fuera de su cuenta sin manera de saber por que. */
        '<label class="ep-campo"><span class="ep-lbl">Repite tu contraseña</span>' +
          '<input class="ep-in" id="d-clave2" type="password" autocomplete="new-password" placeholder="La misma de arriba"></label>' +
        '<label class="ep-fila"><input type="checkbox" id="d-recordar" checked> Mantener mi sesión</label>' +
        '<button class="ep-btn ep-btn--main" type="submit" id="b-datos">Entrar</button>' +
      '</form>' +
      (soloClave ? '<button class="ep-link" id="b-editar">Actualizar mis datos</button>' : '') +
      '<p class="ep-nota">' + (soloClave
        ? 'Tus puntos y tu historial siguen intactos.'
        : 'La próxima vez entras solo con tu celular y tu contraseña.') + '</p>' +
    '</div>');

    if (soloClave) $('b-editar').addEventListener('click', function () {
      pantallaDatos(c, yaEra, teniaClave, '', false, true);
    });

    $('f-datos').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      /* Se comprueba ANTES de mandar nada, y sin borrar lo que ya escribió:
         se vuelve a pintar la pantalla con sus datos y el aviso. */
      var cl1 = $('d-clave').value || '', cl2 = $('d-clave2').value || '';
      var escrito = soloClave ? c : { nombre: $('d-nombre').value, apellido: $('d-apellido').value,
                                      direccion: $('d-dir').value, barrio: $('d-barrio').value };
      if (cl1.length < 6) {
        return pantallaDatos(escrito, yaEra, teniaClave, 'La contraseña debe tener al menos 6 caracteres.', true, abrirDatos);
      }
      if (cl1 !== cl2) {
        return pantallaDatos(escrito, yaEra, teniaClave, 'Las dos contraseñas no son iguales. Escríbelas otra vez.', true, abrirDatos);
      }
      var b = $('b-datos'); b.disabled = true; b.textContent = 'Un momento…';
      // En modo "solo clave" se mandan los datos que ya tenía, sin tocarlos.
      var envio = {
        accion: 'crear-cuenta', telefono: S.tel, pase: S.pase,
        nombre: soloClave ? soloNombre(c) : $('d-nombre').value,
        apellido: soloClave ? (c.apellido || '') : $('d-apellido').value,
        direccion: soloClave ? (c.direccion || '') : $('d-dir').value,
        barrio: soloClave ? (c.barrio || '') : $('d-barrio').value,
        clave: cl1, recordar: $('d-recordar').checked,
      };
      var d = await acceso(envio);
      /* Si algo falla se devuelve lo que ya habia escrito, para no hacerselo
         teclear otra vez. Va como lo escribio: nombre y apellido separados. */
      if (!d.ok) return pantallaDatos({ nombre: envio.nombre, apellido: envio.apellido,
                                        direccion: envio.direccion, barrio: envio.barrio },
                                      yaEra, teniaClave, d.mensaje || 'No se pudo.', true, abrirDatos);
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
    campana: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0',
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
    camara: 'M4 8h3l1.5-2h7L17 8h3v11H4z|M12 11a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z',
    flecha: 'M5 12h13|M13 6l6 6-6 6'
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

  /* EL INICIO NECESITA SUS DATOS AUNQUE NADIE TOQUE EL MENÚ (16-ago).
     Quien entra con la sesión abierta cae directo en el inicio: la pantalla se
     pintaba y ahí terminaba, así que el banner salía sin las fotos y sin las
     tres tarjetas — parecía que se habían borrado. Se piden aquí, una sola vez,
     y cuando llegan se repinta. No se espera a que lleguen para pintar: primero
     se ve la pantalla, después se llena. */
  /* EL PEDIDO EN CURSO SE PIDE AL PINTAR, no solo al navegar (corregido el
     19-ago). Quien entra con la sesion abierta cae directo en `pantallaDentro`
     sin pasar por `irA`, asi que el boton y la tarjeta del pedido NO aparecian
     hasta que se fuera a otra pestaNa y volviera. Es el mismo hueco que ya
     habia mordido con las promos y la carta, dos parrafos mas arriba.

     Con dos candados para no entrar en bucle: uno mientras la consulta va en
     camino, y otro de 15 segundos — `pantallaDentro` se llama en CADA toque de
     la pantalla, y sin eso serian decenas de consultas por minuto. */
  var pidiendoVivo = false, vivoAl = 0;
  function asegurarPedidoVivo() {
    if (pidiendoVivo) return;
    if (Date.now() - vivoAl < 15000) return;
    if (!leerToken()) return;
    pidiendoVivo = true;
    var antes = S.pedidoVivo ? String(S.pedidoVivo.id) + String(S.pedidoVivo.estado) : '';
    cargarPedidoVivo().then(function () {
      pidiendoVivo = false; vivoAl = Date.now();
      var ahora = S.pedidoVivo ? String(S.pedidoVivo.id) + String(S.pedidoVivo.estado) : '';
      /* Solo se repinta si CAMBIO algo: repintar por repintar le quita al
         cliente lo que estuviera escribiendo. */
      if (ahora !== antes) pantallaDentro();
    }).catch(function () { pidiendoVivo = false; vivoAl = Date.now(); });
  }

  var pidiendoInicio = false;
  function asegurarDatosInicio() {
    if (vista !== 'inicio' || pidiendoInicio) return;
    if (S.promos && S.carta) return;
    pidiendoInicio = true;
    Promise.all([cargarPromos(), cargarCarta()])
      .then(function () { pidiendoInicio = false; pantallaDentro(); })
      .catch(function () { pidiendoInicio = false; });
  }

  /* Se ofrece UNA vez por visita, no en cada repintado: `pantallaDentro` se
     llama cada vez que el cliente toca algo, y ofrecer en cada toque seria
     insoportable. */
  /* LE CUENTA AL SERVIDOR DESDE QUE APARATO ENTRO — TAMBIEN LA PRIMERA VEZ.

     Antes esto solo pasaba al RESTAURAR una sesion guardada (accion
     'sesion' al cargar la pagina). El que se acababa de registrar entraba
     por otro camino y nunca reportaba: de 27 sesiones de un dia, solo 5
     tenian el dato, y la pantalla del dueNo mostraba guiones por todas
     partes. Entrar es entrar, venga por donde venga. */
  function reportarAparato() {
    try {
      var t = leerToken();
      if (!t) return;
      acceso({ accion: 'sesion', token: t,
        instalada: yaInstalada(),
        plataforma: esIOS() ? 'ios' : (/android/i.test(navigator.userAgent) ? 'android' : 'escritorio') });
    } catch (e) { /* si falla, no puede frenar la pantalla */ }
  }

  var yaOfreci = false;
  function pantallaDentro() {
    if (!yaOfreci) {
      yaOfreci = true;
      registrarAyudante();
      reportarAparato();
      asegurarPush();
      ofrecerInstalar();
      ofrecerNotificar();
      ofrecerFoto();
    }
    asegurarPedidoVivo();
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
      /* El badge del carrito vive en la pestaña Carta (handoff celular): el
         cliente que sigue navegando ve cuantas cosas lleva sin tener que
         volver. Solo aparece con algo adentro — un "0" permanente es ruido. */
      var badge = (t.k === 'carta' && carroCuantos() > 0)
        ? '<i class="ep-tab-badge">' + carroCuantos() + '</i>' : '';
      return '<button class="ep-tab' + (t.k === vista ? ' on' : '') + '" data-ir="' + t.k + '">' +
        '<span class="ep-tab-ic">' + ico(t.i, 21) + badge + '</span><span>' + t.n + '</span></button>';
    }).join('') + '</nav>';

    pinta('<div class="ep-app">' + lateral +
      '<div class="ep-cuerpo"><div class="ep-scroll">' + cuerpoDe(vista, c, n, saludo) + '</div>' +
      tabs + '</div></div>');

    armarBanner();
    asegurarDatosInicio();

    document.querySelectorAll('[data-ir]').forEach(function (b) {
      b.addEventListener('click', function () { irADestino(b.dataset.ir); });
    });
    document.querySelectorAll('[data-esc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.esc.split(':');
        /* Tocar el que ya esta abierto lo cierra: -1 en vez de borrar la clave,
           porque `undefined` significa "todavia no ha escogido" y volveria a
           abrir el de siempre. */
        escalonAbierto[t[0]] = (escalonAbierto[t[0]] === Number(t[1])) ? -1 : Number(t[1]);
        pantallaDentro();
      });
    });
    document.querySelectorAll('[data-canje]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = (S.catalogo || []).filter(function (x) { return String(x.id) === b.dataset.canje; })[0];
        if (!k) return;
        canje = k;
        S.cuenta = null;        // la cuenta del carrito no vale para esto
        irA('pedido');
      });
    });

    document.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        /* Escoger una categoria vuelve a pintar la pantalla entera, y la tira
           de categorias nace de nuevo en el arranque. Si el cliente deslizo
           hasta la ultima y la toco, la tira se le devolvia al principio y
           perdia de vista la que acababa de escoger. Se guarda donde iba. */
        var tira = b.parentElement;
        var donde = tira ? tira.scrollLeft : 0;
        catActiva = Number(b.dataset.cat) || 0;
        pantallaDentro();
        var nueva = document.querySelector('.ep-cats');
        if (!nueva) return;
        nueva.scrollLeft = donde;   // volver a donde iba: instantaneo, sin saltos
        // Y si quedo cortada contra un borde, se acomoda para verla entera.
        var on = nueva.querySelector('.ep-cat.on');
        if (on) {
          var izq = on.offsetLeft, der = izq + on.offsetWidth, aire = 18, meta = donde;
          if (izq < donde + aire) meta = izq - aire;
          else if (der > donde + nueva.clientWidth - aire) meta = der - nueva.clientWidth + aire;
          if (meta !== donde) nueva.scrollTo({ left: meta, behavior: 'smooth' });
        }
        marcarTiraCats();
      });
    });
    prepararTiraCats();
    acomodarFotos();
    document.querySelectorAll('[data-salir]').forEach(function (b) {
      b.addEventListener('click', salir);
    });
    // La foto del perfil. El campo va escondido dentro del circulo: se toca la
    // foto y se escoge, sin un boton aparte que explicar.
    var irRecarga = $('rc-ir');
    if (irRecarga) {
      irRecarga.addEventListener('click', function () {
        var f = $('rc-otro');
        if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    document.querySelectorAll('[data-monto]').forEach(function (b) {
      b.addEventListener('click', function () {
        recargaMonto = Number(b.dataset.monto) || 0;
        recargaOtro = '';
        var campo = $('rc-otro');
        if (campo) campo.value = '';
        refrescarBono();
      });
    });
    var pasos = $('rc-pasos');
    if (pasos) pasos.addEventListener('click', abrirPasos);
    var otro = $('rc-otro');
    if (otro) {
      /* EN VIVO, TECLA A TECLA (pedido de Sergio). El que escribe su propio
         monto tiene el mismo derecho a ver lo que va a recibir que el que toca
         uno de los botones — y ademas es a quien mas ayuda el aviso de cuanto
         le falta para el siguiente regalo.
         Antes esto solo se repintaba al SALIR del campo, y se repintaba la
         pantalla entera; ahora se refresca solo el bloque del bono, que es lo
         unico que cambia, y el foco se queda donde esta. */
      otro.addEventListener('input', function () {
        recargaOtro = this.value;
        refrescarBono();
      });
    }
    /* El bloque de datos de pago ENTERO abre las instrucciones — menos el
       boton de copiar, que hace lo suyo sin abrir nada. */
    var pgP = $('pg-pasos');
    if (pgP) pgP.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-copiar]')) return;
      abrirPasos('pedido');
    });
    /* Copiar la llave desde la pantalla, sin entrar al modal. Es el mismo
       comportamiento del boton de adentro: el propio boton avisa que copio. */
    document.querySelectorAll('.ep-pago [data-copiar]').forEach(function (bc) {
      bc.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        copiarTexto(bc.dataset.copiar, bc);
      });
    });
    /* Activar los avisos desde el Perfil. Pide el permiso y, si lo dan,
       suscribe el celular ahi mismo y repinta para que el bloque ya diga
       "Encendidos". */
    var pfI = $('pf-instalar');
    if (pfI) pfI.addEventListener('click', function () { pantallaInstalar(true); });

    var pfA = $('pf-avisos');
    if (pfA) pfA.addEventListener('click', async function () {
      pfA.disabled = true; pfA.textContent = 'Un momento…';
      try {
        var permiso = await Notification.requestPermission();
        /* Ya no se apunta "ya se le pidio": nadie lo lee y ademas era lo que
           dejaba a la gente sin avisos para siempre (ver tocaNotificar). */
        if (permiso === 'granted') {
          await suscribirPush();
          aviso('Listo, te avisaremos de tu pedido', 'bien');
        } else {
          aviso('No se activaron. Puedes hacerlo desde los ajustes del navegador.', 'mal');
        }
      } catch (e) { console.error('[avisos]', e); }
      pantallaDentro();
    });

    /* Pagar desde el seguimiento: se rearma el pedido con lo que ya se sabe y
       se abre la MISMA pantalla de pago de siempre, en vez de escribir una
       segunda que se desincronizaria con la primera. */
    var sgPagar = $('sg-pagar');
    if (sgPagar) sgPagar.addEventListener('click', function () {
      var p = S.pedidoVivo;
      if (!p) return;
      var tot = Math.max(Number(p.total) || 0,
        (Number(p.subtotal) || 0) + (Number(p.empaque) || 0) + (Number(p.domicilio) || 0));
      pedidoHecho = {
        /* La pantalla de pago llama a web-pagar con `order_id`: con otro
           nombre el boton habria dicho "No encontramos tu pedido". */
        order_id: p.id, corto: p.corto,
        subtotal: Number(p.subtotal) || 0,
        domicilio: Number(p.domicilio) || 0,
        empaque: Number(p.empaque) || 0,
        total: Number(p.total) || tot,
        pagado: false,
        /* Sin precio de domicilio y siendo a domicilio, es el caso del barrio
           que el restaurante todavia no conoce: la pantalla de pago lo explica. */
        barrio_conocido: !(p.canal === 'domicilio' && !Number(p.domicilio)),
        pago: (S.negocio && S.negocio.pago) || null,
        puntos: Math.floor((Number(p.subtotal) || 0) / 1000),
        ahorro: 0,
        programado: false,
      };
      irA('pedido');
    });

    var pgS = $('pg-saldo');
    if (pgS) pgS.addEventListener('click', function () { pagarPedido('saldo', null); });
    var pgC = $('pg-comp');
    if (pgC) pgC.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) pagarPedido('transferencia', f);
    });

    var env = $('rc-enviar');
    if (env) env.addEventListener('click', enviarRecarga);
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
    /* El boton nuevo abre el MISMO campo escondido que el circulo: una sola
       forma de escoger la foto, dos maneras de llegar a ella. */
    var btnFoto = $('pf-foto-btn');
    if (btnFoto && campoFoto) {
      btnFoto.addEventListener('click', function () { campoFoto.click(); });
    }
    document.querySelectorAll('[data-menu]').forEach(function (b) {
      b.addEventListener('click', menuCuenta);
    });
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
    document.querySelectorAll('[data-cmas]').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = carro[Number(b.dataset.cmas)];
        if (l) { l.cantidad = Math.min(20, (l.cantidad || 1) + 1); pantallaDentro(); }
      });
    });
    document.querySelectorAll('[data-cmenos]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Number(b.dataset.cmenos), l = carro[n];
        if (!l) return;
        /* Bajar de uno saca la linea: es lo que espera quien toca el menos en
           el ultimo, y evita dejar un producto en cantidad cero. */
        if ((l.cantidad || 1) <= 1) carro.splice(n, 1);
        else l.cantidad = l.cantidad - 1;
        pantallaDentro();
      });
    });
    });
    document.querySelectorAll('[data-entrega]').forEach(function (b) {
      b.addEventListener('click', function () { entrega = b.dataset.entrega; pantallaDentro(); });
    });
    /* El barrio cambia el domicilio, y el domicilio cambia el total: al
       terminar de escribirlo se vuelve a pedir la cuenta. Se usa `change` (al
       salir del campo) y no cada tecla, para no llamar al servidor once veces
       mientras escribe "Bellavista". */
    var barrioIn = $('pd-barrio');
    if (barrioIn && barrioIn.tagName === 'INPUT') barrioIn.addEventListener('change', function () {
      barrioTecleado = String(this.value || '').trim();
      pantallaDentro();
    });

    // Escoger otra dirección (o agregar una) sin salirse del pedido.
    var dirSelEl = $('pd-dirsel');
    if (dirSelEl) dirSelEl.addEventListener('change', async function () {
      if (dirSelEl.value === '__nueva') {
        var ok = await pedirDireccionNueva();
        if (!ok) { dirSel = null; pantallaDentro(); }
        return;
      }
      dirSel = dirSelEl.value;
      barrioTecleado = '';          // lo tecleado era para la direccion anterior
      S.cuenta = null;              // otra dirección puede ser otro domicilio
      pantallaDentro();
    });

    // Perfil: agregar / quitar direcciones.
    var addDir = document.querySelector('[data-diragregar]');
    if (addDir) addDir.addEventListener('click', pedirDireccionNueva);
    document.querySelectorAll('[data-editar]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.editar === 'nombre') cambiarNombre(); else cambiarClave();
      });
    });
    document.querySelectorAll('[data-dirquitar]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var r = await preguntar({
          titulo: '¿Quitar esta dirección?',
          texto: 'Puedes volver a agregarla cuando quieras.',
          ok: 'Quitar', cancelar: 'Dejarla',
        });
        if (r) quitarDireccion(b.dataset.dirquitar);
      });
    });
    var cancelaCanje = $('pd-cancelar-canje');
    if (cancelaCanje) cancelaCanje.addEventListener('click', function () {
      canje = null; S.cuenta = null; irA('puntos');
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

  /* ── LA ESCALERA, COMO UN RIEL (20-ago-2026) ─────────────────────────
     Se veia rota, y no por el diseño: la clase se llamaba `.ep-paso`, igual
     que los pasos de la linea de tiempo del pedido. Como esa esta escrita
     despues en la hoja, GANABA: la escalera heredaba su reparto en dos
     columnas y el hilo vertical que une los pasos de un domicilio. De ahi las
     "lineas raras". Ahora se llama `ep-rango*`, que no choca con nada.

     El dibujo es una via horizontal con una parada por nivel: lo recorrido en
     color, lo que falta en gris. Se lee el orden y el avance de un golpe, sin
     tener que explicar nada. */
  function escalera(n) {
    var lista = S.niveles || [];
    if (!lista.length) return '';
    var actual = -1;
    for (var i = 0; i < lista.length; i++) if (n && lista[i].nombre === n.nombre) actual = i;

    /* La via une los CENTROS de la primera y la ultima parada, no los bordes
       de la tarjeta: si fuera de borde a borde, sobraria media parada a cada
       lado y la linea se saldria por debajo de los iconos. */
    var borde = 100 / (lista.length * 2);
    /* Entre n paradas hay n-1 tramos. El avance suma el nivel alcanzado mas lo
       que lleve dentro del suyo, para que la via crezca con cada pedido y no
       solo al cambiar de rango. */
    var tramos = Math.max(1, lista.length - 1);
    var avance = Math.max(0, Math.min(1,
      (Math.max(0, actual) + (Number(n && n.progreso) || 0) / 100) / tramos));

    var html = '';
    for (var j = 0; j < lista.length; j++) {
      var hecho = j <= actual, ahora = j === actual;
      html += '<div class="ep-rango' + (hecho ? ' hecho' : '') + (ahora ? ' ahora' : '') +
        '" style="color:' + esc(hecho ? (lista[j].color || '#e3b04b') : '') + '">' +
        '<span class="ep-rango-o">' + ico(ICO_PASO[j] || 'circulo', 17) + '</span>' +
        '<span class="ep-rango-l">' + esc(lista[j].nombre) + '</span>' +
        (ahora ? '<span class="ep-rango-aqui">Estás aquí</span>' : '') +
      '</div>';
    }
    return '<div class="ep-rangos">' +
      '<span class="ep-rangos-via" style="left:' + borde.toFixed(3) + '%;right:' + borde.toFixed(3) + '%"></span>' +
      '<span class="ep-rangos-ok" style="left:' + borde.toFixed(3) + '%;width:calc((100% - ' +
        (borde * 2).toFixed(3) + '%) * ' + avance.toFixed(4) + ')"></span>' +
      '<div class="ep-rangos-fila">' + html + '</div>' +
    '</div>';
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

    /* Tarjeta de saldo — el valor viene de la base (pos_saldo) vía web-acceso.
       OJO: hasta el 16-ago el servidor lo mandaba escrito a mano en CERO, de
       cuando las recargas no existían, y un cliente con plata recargada veía
       $0. Si algún día vuelve a salir en cero, mirar fichaCliente. */
    /* Estructura del handoff corregido: el boton es HERMANO de la tarjeta,
       dentro del wrap. Si va dentro, la mascara de la muesca lo recorta. */
    var saldo = '<div class="ep-wc-wrap"><div class="ep-wcard">' +
      '<div class="ep-wc-head">' +
        '<span class="ep-wc-brand">' + esc((e.nombre || '').toUpperCase()) + '</span>' +
        '<span class="ep-wc-exp"><svg class="ep-ic" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m12 4.4 2.3 4.9 5.2.7-3.8 3.7.9 5.3-4.6-2.6-4.6 2.6.9-5.3L4.5 10l5.2-.7z"/></svg>' +
          '<span class="ep-wc-rank">' + esc(((n && n.nombre) || '').toUpperCase()) + '</span></span>' +
      '</div>' +
      /* El chip, como el de una tarjeta de verdad (20-ago, idea de Sergio). Va
         vacio a proposito: todo el dibujo esta en el CSS. */
      '<span class="ep-wc-chip"></span>' +
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
        '<span class="ep-pts-note">Redímelos por lo que más te gusta</span>' +
      '</div>' +
      '<span class="ep-pts-gem"></span>' +
    '</div>' +
      '<button class="ep-pts-orb" data-ir="puntos"><svg class="ep-ic" width="19" height="19" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-2.5 0-4.2-.6-4.2-2.2S9.2 4 12 9zm0 0c2.5 0 4.2-.6 4.2-2.2S14.8 4 12 9z"/></g></svg></button>' +
    '</div>';

    var acts = '<div class="ep-acts">' +
      '<button class="ep-act primary" data-ir="carta">' + ico('bolsa') + 'Pedir</button>' +
      '<button class="ep-act" data-ir="billetera">' + ico('wallet') + 'Recargar</button>' +
      '<button class="ep-act" data-ir="puntos">' + ico('gift') + 'Redimir</button>' +
      '<button class="ep-act" data-ir="local">' + ico('pin') + 'El local</button>' +
    '</div>';

    var peds = c.pedidos || [];
    /* EL HISTORIAL, AL LADO DE LA GRÁFICA (16-ago). Antes era una lista suelta
       al final de la página; ahora es un bloque con su encabezado y del mismo
       alto que Tu actividad. Se muestran los últimos tres: los que caben sin
       que el bloque crezca y desalinee la fila. */
    var historial = '<div class="ep-panel ep-lista">' +
      '<div class="ep-lista-hd">' +
        '<div><div class="ep-tile-lbl">Historial</div>' +
        '<div class="ep-lista-sub">' + (peds.length ? 'Tus pedidos' : 'Todavía sin pedidos') + '</div></div>' +
        (peds.length > 3 ? '<button class="ep-lista-ver" data-ir="pedido">Ver todos</button>' : '') +
      '</div>' +
      (peds.length ? peds.slice(0, 3).map(function (p) {
        var f = new Date(p.fecha);
        var donde = p.canal === 'domicilio' ? 'Domicilio' : (p.canal === 'salon' ? 'En el local' : 'Para llevar');
        /* Qué pidió, no "Pedido": el cliente reconoce su comida. Con más de
           dos platos se nombran los dos primeros y se cuenta el resto — la
           línea tiene que caber sin empujar el precio fuera de la tarjeta. */
        var que = Array.isArray(p.que) ? p.que : [];
        var titulo = que.length === 0 ? 'Pedido'
          : que.length <= 2 ? que.join(' · ')
          : que.slice(0, 2).join(' · ') + ' +' + (que.length - 2);
        /* Y los puntos que ganó, que es a lo que entra a mirar. Si el pedido
           todavía no los generó (aún sin pagar), no se inventa un número. */
        var pts = Number(p.puntos) || 0;
        return '<div class="ep-li"><div class="ep-li-ico">' + ico('bolsa', 16) + '</div>' +
          '<div class="ep-li-b"><div class="ep-li-t">' + esc(titulo) + '</div>' +
          '<div class="ep-li-s">' + f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' · ' + donde + '</div></div>' +
          '<div class="ep-li-m' + (pts > 0 ? ' pts' : ' sin') + '">' +
            (pts > 0 ? '+' + pts + ' pts' : '—') + '</div></div>';
      }).join('') : '<div class="ep-vacio">Aquí verás tus pedidos cuando hagas el primero.</div>') +
    '</div>';

    /* EN EL CELULAR VA EN UNA SOLA LINEA: "Hola, Sergio" (opcion B de Sergio,
       17-ago). Entre el logo y la foto le quedan ~270px de 390: dos lineas ahi
       dejaban el nombre chiquito y la cabecera alta. En el computador sobra
       ancho, asi que se conserva el saludo por hora encima del nombre.

       El "Hola," va en su propio span y el nombre se escribe UNA sola vez: dos
       versiones del mismo texto se desincronizan el dia que alguien cambie una. */
    return '<div class="ep-saludo">' + logoArriba() +
        '<div class="ep-saludo-tx"><div class="ep-saludo-t">' + saludo + '</div>' +
        '<div class="ep-saludo-n"><span class="ep-hola">Hola, </span>' +
          esc((c.nombre || '').split(' ')[0] || 'Hola') + '</div></div>' +
        rangoBarra(n) +
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
      tarjetaPedidoVivo() +
      '<div class="ep-over">' + saldo + puntos + tarjetaPublicidad() + '</div>' +
      /* Los destacados (cuadro 2x2) con la billetera al lado, y debajo la
         gráfica junto al historial. Cada zona es una fila de la página. */
      '<div class="ep-zona-hoy"><div class="ep-hoy-col">' + filaDeHoy() + '</div>' + panelBilletera(c, n) + '</div>' +
      '<div class="ep-mid">' + panelGrafica(c) + historial + '</div>' +
      acts;
  }

  /* ── Las demás pantallas ──────────────────────────────────────────
     La carta y el catálogo de puntos se piden UNA vez y quedan en memoria: son
     los mismos para todos y no cambian entre pestaña y pestaña. */
  var catActiva = 0;

  /* Los botones de arriba a la derecha. En UN solo sitio porque los usan el
     inicio y todas las demas pantallas: copiados, un dia dejarian de coincidir. */
  /* EL LOGO DEL RESTAURANTE, a la izquierda del saludo (celular, 17-ago).
     En el computador ya esta arriba del menu lateral, asi que ahi estorbaria:
     se muestra solo en pantalla pequeña, donde no hay lateral. */
  function logoArriba() {
    var e = S.negocio || {};
    return '<div class="ep-hd-logo" aria-hidden="true">' +
      (e.logo ? '<img src="' + esc(e.logo) + '" alt="">' : ico('bolsa', 19)) + '</div>';
  }

  /* IR A UNA PANTALLA. Vive aparte porque ya no solo la llaman los botones
     `data-ir`: tambien el menu de la cuenta, que se pinta al vuelo y por eso
     no pasa por `enganchar`. Copiar estas lineas en el menu habria sido el
     patron que mas caro nos ha salido — dos caminos que se desincronizan. */
  /* ══ A DONDE LLEVA UN TOQUE ═══════════════════════════════════════════════
     (19-ago, pedido de Sergio para el banner.) Antes `data-ir` solo sabia de
     pantallas de la app. Ahora una imagen de publicidad puede llevar a tres
     sitios distintos, y el destino se guarda como texto en `pos_promos.ir_a`:

       carta | puntos | billetera | perfil | local | inicio  → una pantalla
       producto:<id>                                          → abre ese plato
       https://...                                            → sale a la web

     Se decide por la FORMA del texto y no por un campo aparte: asi el dia que
     haya un cuarto tipo no hay que migrar la tabla.

     Un enlace de afuera se abre en otra pestaNa: sacar al cliente de la pagina
     a mitad de un pedido seria perderle el carrito. */
  function irADestino(destino) {
    var d = String(destino || '').trim();
    if (!d) return;

    if (/^https?:\/\//i.test(d)) {
      window.open(d, '_blank', 'noopener');
      return;
    }

    if (d.indexOf('producto:') === 0) {
      var id = d.slice(9);
      /* La carta puede no estar cargada todavia: se trae y despues se busca.
         Si el producto ya no existe —lo quitaron de la carta— se lleva a la
         carta en vez de no hacer nada: un toque que no responde parece que la
         pagina esta rota. */
      cargarCarta().then(async function () {
        for (var ci = 0; ci < (S.carta || []).length; ci++) {
          var ps = (S.carta[ci] || {}).productos || [];
          for (var pi = 0; pi < ps.length; pi++) {
            if (String(ps[pi].id) === id) {
              /* Se ESPERA a que la carta este pintada antes de abrir la hoja
                 del plato. Con un temporizador a ojo, en un celular lento la
                 hoja se abria sobre una pantalla que todavia no existia. */
              catActiva = ci;
              if (vista !== 'carta') await irA('carta');
              abrirPlato(ci, pi);
              return;
            }
          }
        }
        irA('carta');
      });
      return;
    }

    irA(d);
  }

  async function irA(k) {
    vista = k;
    // Se trae lo que esa pestaña necesita ANTES de pintarla, para que no
    // aparezca vacia un instante y luego se llene de golpe.
    if (vista !== 'pedido') pedidoHecho = null;
    /* Salirse de la pantalla del pedido es abandonar el canje. Dejarlo vivo
       haria que al volver a "Tu pedido" apareciera un premio que el cliente ya
       habia soltado. */
    if (vista !== 'pedido' && canje) { canje = null; S.cuenta = null; }
    if (vista === 'carta')  await cargarCarta();
    /* El inicio necesita las dos cosas: las fotos del banner (promos) y la
       carta, porque las tres tarjetas son productos de verdad. */
    if (vista === 'inicio' && (!S.promos || !S.carta)) {
      await Promise.all([cargarPromos(), cargarCarta()]);
      pantallaDentro();
    }
    /* El inicio muestra el boton y la tarjeta del pedido en curso, asi que
       tiene que saber si hay uno. Va aparte del bloque de arriba porque ese
       solo corre la PRIMERA vez (cuando faltan carta o promos) y esto hay que
       refrescarlo cada vez que se vuelve al inicio. */
    if (vista === 'inicio') { await cargarPedidoVivo(); }
    if (vista === 'puntos') await cargarCatalogo();
    if (vista === 'seguir') await cargarPedidoVivo();
    /* El reloj SOLO vive mientras la pantalla esta abierta. */
    relojSeguir(vista === 'seguir');
    catActiva = 0;
    window.scrollTo(0, 0);
    pantallaDentro();
  }

  function botonesArriba(extra) {
    var c = S.cliente || {};
    /* EL PEDIDO EN CURSO, a la izquierda de la foto (19-ago, sitio elegido por
       Sergio). Solo existe mientras hay uno: un boton que lleva a una pantalla
       vacia es peor que no tenerlo. El punto que late dice "hay algo pasando"
       sin gritar, y se queda quieto si el celular pide menos movimiento. */
    var enCurso = S.pedidoVivo
      ? '<button class="ep-redondo ep-pedido" data-ir="seguir" title="Ver mi pedido" aria-label="Ver mi pedido">' +
          ico('bolsa', 16) + '<span class="ep-punto-vivo"></span></button>'
      : '';
    return '<div class="ep-saludo-btns">' + (extra || '') + enCurso +
      /* El boton del tema se queda para el COMPUTADOR; en el celular se
         esconde (CSS) porque su opcion vive dentro del menu de la foto. */
      '<button class="ep-redondo ep-tema" data-tema="1" title="Cambiar el tema">' +
        ico(esOscuroAhora() ? 'sol' : 'luna', 17) + '</button>' +
      /* La foto ABRE EL MENU, no lleva al perfil: "Mi perfil" es la primera
         opcion de ese menu, asi que no se pierde el camino de antes — y ahora
         tambien caben el tema y cerrar sesion, que en el celular no tenian
         donde vivir (el menu lateral no existe ahi). */
      '<button class="ep-redondo ep-yo" data-menu="1" aria-haspopup="menu" title="Mi cuenta">' +
        (c.foto ? '<img src="' + esc(c.foto) + '" alt="">' : esc(iniciales(c.nombre))) +
      '</button>' +
    '</div>';
  }

  /* El menu de la cuenta. Se pinta al vuelo y se quita al elegir o al tocar
     fuera: dejarlo siempre en el HTML obligaria a repintarlo con cada pantalla
     y a sincronizar su estado con el resto. */
  function menuCuenta() {
    var viejo = document.querySelector('.ep-menucap');
    if (viejo) { viejo.remove(); return; }        // segundo toque = cerrar
    var c = S.cliente || {};
    var cap = document.createElement('div');
    cap.className = 'ep-menucap';
    cap.innerHTML =
      '<div class="ep-menu" role="menu">' +
        '<div class="ep-menu-yo">' +
          '<span class="ep-menu-foto">' +
            (c.foto ? '<img src="' + esc(c.foto) + '" alt="">' : esc(iniciales(c.nombre))) + '</span>' +
          '<span class="ep-menu-nom">' + esc(c.nombre || '') + '</span>' +
        '</div>' +
        '<button class="ep-menu-it" data-mir="perfil">' + ico('user', 17) + 'Mi perfil</button>' +
        /* "El local" tambien vive en los cuatro botones del final del inicio,
           pero ahi hay que bajar hasta abajo para verla. En el celular no hay
           menu lateral, asi que este es el sitio donde uno la busca. */
        '<button class="ep-menu-it" data-mir="local">' + ico('pin', 17) + 'El local</button>' +
        '<button class="ep-menu-it" data-mtema="1">' +
          ico(esOscuroAhora() ? 'sol' : 'luna', 17) +
          (esOscuroAhora() ? 'Modo claro' : 'Modo oscuro') + '</button>' +
        '<button class="ep-menu-it malo" data-msalir="1">' + ico('salir', 17) + 'Cerrar sesión</button>' +
      '</div>';
    document.body.appendChild(cap);

    function cerrar() { cap.remove(); }
    cap.addEventListener('click', function (ev) { if (ev.target === cap) cerrar(); });
    /* Con mas de una opcion de navegacion, se recorren TODAS: `querySelector`
       a secas solo enganchaba la primera y "El local" habria quedado muerta. */
    cap.querySelectorAll('[data-mir]').forEach(function (b) {
      b.onclick = function () { cerrar(); irA(b.dataset.mir); };
    });
    cap.querySelector('[data-mtema]').onclick = function () { cerrar(); alternarTema(); };
    cap.querySelector('[data-msalir]').onclick = function () { cerrar(); salir(); };
  }

  /* A donde lleva la flecha de atras en el celular (handoff): del carrito se
     vuelve a la carta (para seguir agregando); de lo demas, al inicio. */
  function atrasDe(v) { return v === 'pedido' ? 'carta' : 'inicio'; }

  function encabezado(titulo, sub) {
    return '<div class="ep-saludo ep-saludo--int">' +
      /* La flecha solo se VE en el celular (CSS); en el computador ya esta el
         menu lateral y una flecha seria un segundo camino para lo mismo. */
      '<button class="ep-atras" data-ir="' + esc(atrasDe(vista)) + '" aria-label="Volver">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<div><div class="ep-saludo-t">' + esc(sub || (S.negocio && S.negocio.nombre) || '') + '</div>' +
      '<div class="ep-saludo-n">' + esc(titulo) + '</div></div>' +
      botonesArriba('<button class="ep-redondo" data-ir="inicio" title="Inicio">' + ico('home', 17) + '</button>') +
    '</div>';
  }

  /* ── FOTOS ALTAS: ENTERAS, NO RECORTADAS (17-ago) ──────────────────────
     El marco del plato es apaisado (1.55) y la foto lo llena con `cover`, que
     recorta lo que sobra. Con las fotos de comida eso esta bien: son apaisadas
     y recortar un poco los lados no quita nada. Pero las bebidas son recortes
     de producto altos o cuadrados: una botella de 140x500 metida a la fuerza en
     un marco apaisado perdia mas del 70% — se veia la mitad de la botella.

     Se mira la foto REAL (naturalWidth/naturalHeight) en vez de fiarse de la
     categoria: sirve para cualquier restaurante, no solo para las bebidas de
     este.
     ⚠️ La regla NO compara contra el marco. Se probo asi y estaba mal: en Cobra
     el ancho de la tarjeta cambia con el tamaNo de la ventana, asi que la MISMA
     hamburguesa salia recortada con la ventana angosta y con bordes vacios con la
     ventana ancha. Se mira solo la forma de la FOTO, que no cambia nunca:
     apaisada (>1.15) = foto de comida, se recorta; cuadrada o alta = recorte de
     producto, se muestra entera. */
  function acomodarFoto(im) {
    if (!im || !im.naturalWidth || !im.naturalHeight) return;
    im.classList.toggle('ep-foto-entera',
      im.naturalWidth / im.naturalHeight <= 1.15);
  }
  function acomodarFotos() {
    document.querySelectorAll('.ep-plato-img img').forEach(function (im) {
      if (im.complete) acomodarFoto(im);
      else im.addEventListener('load', function () { acomodarFoto(im); }, { once: true });
    });
  }

  /* La tira de categorias se desliza, pero nada lo decia: si la ultima
     categoria quedaba justo fuera, la tira parecia completa y el cliente no
     tenia motivo para deslizar. Ahora el borde por donde hay mas se desvanece,
     y el que ya no tiene nada mas queda limpio. */
  function marcarTiraCats() {
    var t = document.querySelector('.ep-cats');
    if (!t) return;
    var sobra = t.scrollWidth - t.clientWidth;
    var hayIzq = sobra > 1 && t.scrollLeft > 4;
    var hayDer = sobra > 1 && t.scrollLeft < sobra - 4;
    t.classList.toggle('ep-cats--mas-izq', hayIzq);
    t.classList.toggle('ep-cats--mas-der', hayDer);
  }
  function prepararTiraCats() {
    var t = document.querySelector('.ep-cats');
    if (!t) return;
    t.addEventListener('scroll', marcarTiraCats, { passive: true });
    marcarTiraCats();
  }
  addEventListener('resize', marcarTiraCats);

  /* Una tarjeta de la carta. `i` es la posicion ORIGINAL del producto en su
     categoria: es lo que usa `data-plato` para saber cual abrir, y por eso se
     pasa aparte del orden en que se pintan. */
  function platoHTML(p, i) {
    /* Si tiene presentaciones (Personal / Familiar) el precio se muestra como
       "desde": enseñar solo uno haría que el cliente se lleve una sorpresa. */
    var pres = p.presentaciones || [];
    var precio = Number(p.precio) || 0;
    var desde = false;
    if (pres.length) {
      var mins = pres.map(function (x) { return Number(x.precio) || 0; }).filter(function (x) { return x > 0; });
      if (mins.length) { precio = Math.min.apply(null, mins); desde = mins.length > 1; }
    }
    /* Tres formas de tarjeta (17-ago):
         · ancha  · ocupa dos columnas y rompe la cuadricula
         · agotada· hoy no hay: se ve en gris y NO se puede tocar. Antes
                    desaparecia, y desaparecer no le enseNa al cliente que ese
                    plato existe.
         · normal · las demas */
    var agotado = p.agotado === true;
    var clases = 'ep-plato' + (p.grande ? ' ep-plato--ancho' : '') + (agotado ? ' ep-plato--agotado' : '');
    return '<button class="' + clases + '"' +
      (agotado ? ' disabled aria-disabled="true"' : ' data-plato="' + catActiva + '|' + i + '"') + '>' +
      /* La medalla va DENTRO del marco de la foto: el CSS la coloca en
         absoluto y su ancla es `.ep-plato-img`, que es lo unico posicionado.
         Fuera de ahi se iria a la esquina de la pantalla.
         ⚠️ Hasta hoy la carta NO pintaba medallas — solo las pintaba el banner
         de inicio. Se marcaba un producto y no se veia por ningun lado. */
      '<div class="ep-plato-img">' + (p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : ico('bolsa', 34)) +
        medalla(p) +
        (agotado ? '<span class="ep-agotado">Se acabó por hoy</span>' : '') + '</div>' +
      '<div class="ep-plato-b">' +
        '<div class="ep-plato-n">' + esc(p.nombre) + '</div>' +
        (p.descripcion ? '<div class="ep-plato-d">' + esc(p.descripcion) + '</div>' : '') +
        '<div class="ep-plato-p">' + (desde ? '<small>desde </small>' : '') + COP(precio) + '</div>' +
      '</div></button>';
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

    /* LAS ANCHAS VAN PRIMERO (17-ago). Una tarjeta ancha en mitad de la lista
       empuja lo que sigue a una fila nueva y deja un hueco detras: la fila de
       arriba se queda con una sola tarjeta y el resto vacio. Poniendolas al
       principio, la cuadricula se llena entera y lo unico que puede sobrar es
       el final de la carta, que es lo normal.
       Se conserva el indice ORIGINAL para `data-plato`: si se reordenara sin
       el, tocar una tarjeta abriria otro plato. */
    var enOrden = (c.productos || []).map(function (p, i) { return { p: p, i: i }; });
    enOrden.sort(function (a, b) { return (b.p.grande ? 1 : 0) - (a.p.grande ? 1 : 0); });

    var platos = '<div class="ep-platos">' +
      enOrden.map(function (e) { return platoHTML(e.p, e.i); }).join('') + '</div>';

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
        '<span class="ep-pts-note">Redímelos por lo que más te gusta</span>' +
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
      var cuesta = Number(k.puntos) || 0;
      var falta = Math.max(0, cuesta - mios);
      /* "Te falta poco" es PROPORCIONAL al premio, no una cantidad fija. Con un
         corte de 20 puntos, un premio de 1.500 nunca entraba en "te falta poco"
         aunque el cliente llevara 1.450: le decia lo mismo que a quien va en
         cero. Se considera cerca cuando ya lleva del 60% para arriba. */
      var it = { k: k, falta: falta, cuesta: cuesta,
                 pct: cuesta > 0 ? Math.min(100, Math.round(mios * 100 / cuesta)) : 100 };
      if (falta === 0) listos.push(it);
      else if (it.pct >= 60) cerca.push(it);
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
        /* Solo los puntos que le faltan. Traducirlo a plata ("un pedido de
           $400.000") le pone precio al premio y desanima; ademas le enseña al
           cliente la cuenta con la que se ganan los puntos, que no es algo que
           se le diga de frente. */
        : 'Te faltan ' + it.falta + ' pts';
      /* La barra: el numero solo ("te faltan 225 pts") no dice si eso es mucho
         o poco. La barra sí — y es lo que hace volver. No va en los que ya
         alcanzan: una barra llena no informa nada. */
      var barra = it.falta === 0 ? '' :
        '<span class="ep-redeem-bar"><i style="width:' + it.pct + '%"></i></span>';
      return '<div class="ep-redeem' + (it.falta === 0 ? '' : ' soon') + '">' +
        '<span class="ep-redeem-ic">' + (k.foto
          ? '<img src="' + esc(k.foto) + '" alt="">' : ico('gift', 19)) + '</span>' +
        '<div class="ep-redeem-body"><b>' + esc(k.nombre || '') + '</b>' +
          '<small>' + esc(sub) + '</small>' + barra + '</div>' +
        (it.falta === 0
          /* EL BOTON SOLO CUANDO YA ALCANZA. A quien le falta se le sigue
             mostrando lo que cuesta —esa es la regla de Sergio, ver todo el
             catalogo— pero un boton que no se puede tocar solo frustra. */
          ? '<button class="ep-btn light sm" data-canje="' + esc(k.id) + '">Pedirlo</button>'
          : '<span class="ep-btn ghost sm">' + esc(precio) + '</span>') +
      '</div>';
    }

    /* LA IMAGEN DEL ESCALON (20-ago, idea de Sergio). No una cualquiera: la del
       premio MAS CARO del grupo que tenga foto — es el mas apetecible y el que
       da ganas de abrir. Y es SIEMPRE la misma: una que cambiara sola haria
       sentir la pantalla rota. Si ninguno tiene foto queda el icono de regalo,
       que es lo que se ve hoy en cada fila. */
    function caratula(g2) {
      var conFoto = g2.filter(function (x) { return x.k.foto; })
                      .sort(function (a, b) { return (b.k.puntos || 0) - (a.k.puntos || 0); });
      return conFoto.length
        ? '<span class="ep-esc-ic"><img src="' + esc(conFoto[0].k.foto) + '" alt=""></span>'
        : '<span class="ep-esc-ic vacia">' + ico('gift', 18) + '</span>';
    }

    /* POR ESCALONES, NO POR CATEGORIA (20-ago). La pregunta que trae el cliente
       es "que me alcanza", no "que bebidas hay": el titulo del grupo se la
       contesta antes de leer una sola tarjeta. Y sobre todo, la lista deja de
       crecer: con cuarenta premios siguen siendo seis o siete renglones. */
    function escalones(clave, g) {
      var mapa = {}, orden = [];
      g.forEach(function (it) {
        var p = Number(it.k.puntos) || 0;
        if (!mapa[p]) { mapa[p] = []; orden.push(p); }
        mapa[p].push(it);
      });
      /* Un solo escalon no se pliega: un desplegable para una sola cosa es un
         clic de mas y esconde justo lo que hay que ver. */
      if (orden.length <= 1) return g.map(fila).join('');

      if (escalonAbierto[clave] === undefined) {
        /* En los que YA alcanza se abre el mas caro —su mejor premio—; en los
           demas el mas barato, que es el que va a lograr primero. */
        escalonAbierto[clave] = (clave === 'listos') ? orden[orden.length - 1] : orden[0];
      }

      return orden.map(function (pts) {
        var g2 = mapa[pts], on = escalonAbierto[clave] === pts;
        var alcanza = g2[0].falta === 0;
        return '<div class="ep-esc' + (on ? ' abierto' : '') + '">' +
          '<button class="ep-esc-h" data-esc="' + clave + ':' + pts + '">' +
            caratula(g2) +
            '<span class="ep-esc-pts">Con ' + pts + ' pts</span>' +
            '<span class="ep-esc-n">' + g2.length + (g2.length === 1 ? ' premio' : ' premios') + '</span>' +
            '<span class="ep-esc-est">' +
              (alcanza
                ? '<span class="ep-esc-tag ok">Ya te alcanza</span>'
                : '<span class="ep-esc-tag">Te faltan ' + g2[0].falta + '</span>') +
              '<svg class="ep-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="6 9 12 15 18 9"/></svg>' +
            '</span>' +
          '</button>' +
          '<div class="ep-esc-body">' + g2.map(fila).join('') + '</div>' +
        '</div>';
      }).join('');
    }

    function grupo(titulo, clave, g) {
      if (!g.length) return '';   // un titulo sin nada debajo solo estorba
      return '<div class="ep-block"><div class="ep-block-h"><h3>' + titulo + '</h3>' +
        '<span class="ep-block-n">' + g.length + (g.length === 1 ? ' premio' : ' premios') + '</span></div>' +
        escalones(clave, g) + '</div>';
    }

    var lista = cat.length
      ? grupo('Ya puedes pedir', 'listos', listos) +
        grupo('Te falta poco', 'cerca', cerca) +
        grupo('Para ir juntando', 'lejos', lejos)
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
  /* El mínimo es $40.000, así que $20.000 ya no tiene sentido ofrecerlo.
     $50.000 va de segundo a propósito: es el primero que da saldo extra. */
  var MONTOS = [40000, 50000, 100000, 200000];
  var RECARGA_MINIMO = 40000, RECARGA_BLOQUE = 50000;
  var recargaMonto = 50000, recargaOtro = '';

  /* La regla la manda el servidor con la ficha del cliente, porque el bono
     DEPENDE de su nivel. Si no viene, se usan los de siempre y no se promete
     ningun regalo. */
  function reglaRecarga() {
    var r = (S.cliente && S.cliente.recarga) || {};
    return {
      minimo: Number(r.minimo) || RECARGA_MINIMO,
      bloque: Number(r.bloque) || RECARGA_BLOQUE,
      porBloque: Number(r.bono_por_bloque) || 0
    };
  }

  /* Bloques COMPLETOS: $70.000 es un bloque, no uno y medio. */
  function bonoDe(monto) {
    var g = reglaRecarga();
    if (!g.porBloque || !g.bloque) return 0;
    return Math.floor(monto / g.bloque) * g.porBloque;
  }

  /* EL CAMINO CON PARADAS (17-ago, disenado con Sergio).
     Tres piezas, en este orden: la franja que promete, los montos con lo que le
     queda a cada uno, y un camino donde cada parada regala mas.

     El camino llega hasta el monto mas alto que se ofrece. Si el cliente
     escribe MAS que eso, el camino se estira hasta el: quedarse con la barra
     llena y el mensaje quieto haria pensar que ya no gana mas, y si gana. */
  function bloqueBono(monto) {
    var g = reglaRecarga();
    if (!g.porBloque) return '';               // sin regla no se promete nada
    var bono = bonoDe(monto);
    var resto = g.bloque ? monto % g.bloque : 0;
    var falta = resto ? g.bloque - resto : 0;

    /* Las paradas se AGRUPAN, no se cortan. Cortarlas en las primeras ocho hacia
       que con montos grandes la ultima parada dijera "+$40.000" mientras el
       titulo decia "$50.000": el camino contradecia al texto. Si hay demasiados
       bloques, cada parada pasa a valer varios — pero siempre cae en un bloque
       de verdad, asi que su cifra sigue siendo exacta. */
    var bloques = Math.ceil(Math.max(MONTOS[MONTOS.length - 1], monto) / g.bloque);
    var paso = Math.ceil(bloques / 8);
    var paradas = [];
    for (var k = paso; k <= bloques; k += paso) paradas.push(k * g.bloque);
    if (!paradas.length || paradas[paradas.length - 1] < bloques * g.bloque) {
      paradas.push(bloques * g.bloque);
    }
    var tope = paradas[paradas.length - 1];

    var puntos = paradas.map(function (p) {
      var ok = monto >= p, x = (p / tope) * 100;
      return '<span class="ep-parada' + (ok ? ' on' : '') + '" style="left:' + x + '%"></span>';
    }).join('');
    /* En un celular solo caben unas CUATRO etiquetas: medido, con cinco o mas
       se montan unas sobre otras y no se lee ninguna. Los circulos se quedan
       todos — son los que cuentan la historia — y se rotula uno de cada tantos,
       siempre incluyendo el ultimo, que es la meta. */
    var cada = paradas.length <= 4 ? 1 : Math.ceil(paradas.length / 3);
    var etiquetas = paradas.map(function (p, i) {
      var ultima = (i === paradas.length - 1);
      if (!ultima && (paradas.length - 1 - i) % cada !== 0) return '';
      var ok = monto >= p, x = (p / tope) * 100;
      return '<span class="ep-parada-lb' + (ok ? ' on' : '') + (ultima ? ' fin' : '') +
             '" style="left:' + x + '%">+' + COP((p / g.bloque) * g.porBloque) + '</span>';
    }).join('');

    return '<div class="ep-camino">' +
      '<div class="ep-camino-t">' + (bono
        ? 'Ya te ganaste <b>' + COP(bono) + '</b> de regalo'
        : 'Llega a ' + COP(g.bloque) + ' y te ganas ' + COP(g.porBloque)) + '</div>' +
      '<div class="ep-camino-riel">' +
        '<div class="ep-camino-fill" style="width:' + Math.min(100, (monto / tope) * 100) + '%"></div>' +
        puntos +
      '</div>' +
      '<div class="ep-camino-lbs">' + etiquetas + '</div>' +
      /* Debajo del primer bloque el titulo YA dice "llega a $50.000 y te ganas
         $5.000": repetirlo aqui con otras palabras solo confunde. */
      (bono
        ? '<div class="ep-camino-p">Súmale ' + COP(falta || g.bloque) +
          ' y te ganas ' + COP(g.porBloque) + ' más</div>'
        : '') +
    '</div>';
  }

  /* EL PASO A PASO (17-ago, disenado con Sergio).
     Vive en una hoja que se abre tocando el bloque de datos de pago, y no
     suelto en la pantalla: quien ya sabe recargar no tiene por que leerlo cada
     vez. El paso 2 trae la llave grande con boton de copiar — transcribir diez
     digitos a mano es donde de verdad se pierde una transferencia. */
  function pasosRecarga() {
    var p = S.pago || {};
    var destino = p.llave || p.numero || '';
    var via = p.llave ? 'Nequi' : (p.entidad || 'transferencia');

    var llave = destino
      ? '<div class="ep-llave">' +
          '<div class="ep-llave-lb">' + (p.llave ? 'Llave' : esc(p.entidad || 'Cuenta')) + '</div>' +
          '<div class="ep-llave-fila">' +
            '<span class="ep-llave-n">' + esc(destino) + '</span>' +
            '<button class="ep-copiar" type="button" data-copiar="' + esc(destino) + '">Copiar</button>' +
          '</div>' +
          (p.titular ? '<div class="ep-llave-t">' + esc(p.titular) + '</div>' : '') +
        '</div>'
      : '';

    var pasos = [
      ['Elige cuánto quieres recargar', 'Ahí mismo ves cuánto te regalamos', ''],
      ['Transfiere por ' + esc(via), '', llave],
      ['Toma foto del comprobante y súbela', 'Con el botón “Adjuntar comprobante”', ''],
      ['Toca “Enviar recarga”', 'Tu saldo entra apenas verifiquemos el pago', '']
    ];

    return '<div class="ep-tirador"></div>' +
      '<div class="ep-ins-t">Cómo recargar</div>' +
      '<div class="ep-ins-lista">' + pasos.map(function (x, i) {
        return '<div class="ep-ins">' +
          '<span class="ep-ins-n">' + (i + 1) + '</span>' +
          '<div class="ep-ins-b"><div class="ep-ins-tt">' + x[0] + '</div>' +
            (x[1] ? '<div class="ep-ins-d">' + x[1] + '</div>' : '') + x[2] +
          '</div></div>';
      }).join('') + '</div>' +
      /* El pie va pegado abajo: en una pantalla corta la hoja se desplaza y el
         boton de cerrar quedaba por debajo del borde. */
      '<div class="ep-ins-pie">' +
        '<button class="ep-btn gold big" type="button" data-cerrar-pasos>Entendido</button>' +
      '</div>';
  }

  /* COMO PAGAR EL PEDIDO, paso a paso. Mismo formato que el de la recarga: el
     cliente que ya vio uno reconoce el otro. La llave va DENTRO del paso donde
     se necesita, con su boton de copiar — no al final, donde tocaria
     devolverse. */
  function pasosPago() {
    var d = pedidoHecho || {};
    var p = d.pago || {};
    var llave = p.llave ? String(p.llave) : '';
    var via = p.via || p.banco || 'transferencia';
    var caja = llave
      ? '<div class="ep-llave">' +
          '<div class="ep-llave-fila">' +
            '<span class="ep-llave-n">' + esc(llave) + '</span>' +
            '<button class="ep-copiar" type="button" data-copiar="' + esc(llave) + '">Copiar</button>' +
          '</div>' +
          (p.titular ? '<div class="ep-llave-t">' + esc(p.titular) + '</div>' : '') +
        '</div>'
      : '';
    var pasos = [
      ['Abre tu app del banco', 'Nequi, Daviplata, Bancolombia… la que uses', ''],
      ['Transfiere ' + COP(d.total), 'A esta llave — tócala para copiarla', caja],
      ['Toma foto del comprobante', 'El que te muestra el banco al terminar', ''],
      ['Súbela con “Ya transferí”', 'Confirmamos el pago y arrancamos tu pedido', '']
    ];
    return '<div class="ep-tirador"></div>' +
      '<div class="ep-ins-t">Cómo pagar tu pedido</div>' +
      '<div class="ep-ins-lista">' + pasos.map(function (x, i) {
        return '<div class="ep-ins">' +
          '<span class="ep-ins-n">' + (i + 1) + '</span>' +
          '<div class="ep-ins-b"><div class="ep-ins-tt">' + x[0] + '</div>' +
            (x[1] ? '<div class="ep-ins-d">' + x[1] + '</div>' : '') + x[2] +
          '</div></div>';
      }).join('') + '</div>' +
      '<div class="ep-ins-pie">' +
        '<button class="ep-btn gold big" type="button" data-cerrar-pasos>Entendido</button>' +
      '</div>';
  }

  function abrirPasos(cual) {
    if (document.querySelector('.ep-scrim.pasos')) return;
    var d = document.createElement('div');
    d.className = 'ep-scrim pasos';
    d.innerHTML = '<div class="ep-sheet">' + (cual === 'pedido' ? pasosPago() : pasosRecarga()) + '</div>';
    document.body.appendChild(d);

    function cerrar() {
      d.remove();
      document.removeEventListener('keydown', porTecla);
    }
    function porTecla(ev) { if (ev.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', porTecla);
    d.addEventListener('click', function (ev) {
      if (ev.target === d || ev.target.hasAttribute('data-cerrar-pasos')) cerrar();
    });

    var bc = d.querySelector('[data-copiar]');
    if (bc) bc.addEventListener('click', function () { copiarTexto(bc.dataset.copiar, bc); });
  }

  /* COPIAR, en un solo sitio. Lo usan el modal y la pantalla del pedido; antes
     vivia suelto dentro del modal y la pantalla no tenia como copiar nada.
     Sin cuadros del navegador: el propio boton dice que copio. Y con respaldo,
     porque el portapapeles moderno no existe fuera de https ni en navegadores
     viejos. */
  function copiarTexto(txt, btn) {
    function listo() {
      if (!btn) return;
      var antes = btn.textContent;
      btn.textContent = 'Copiado';
      btn.classList.add('ok');
      setTimeout(function () { btn.textContent = antes; btn.classList.remove('ok'); }, 1500);
    }
    function respaldo() {
      var a = document.createElement('textarea');
      a.value = txt; a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); listo(); } catch (e) {}
      a.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(listo, respaldo);
    } else respaldo();
  }

  /* POR QUE EL BOTON ESTA APAGADO (17-ago). Debajo del minimo el boton de
     enviar se deshabilitaba y ya: el cliente veia un boton muerto sin ninguna
     explicacion y no tenia como adivinar que le faltaba plata. Un control
     apagado sin motivo es un callejon sin salida. */
  function avisoMinimo(monto) {
    var g = reglaRecarga();
    if (!g.minimo || monto >= g.minimo) return '';
    return '<div class="ep-minimo">Sube a <b>' + COP(g.minimo) + '</b> para poder recargar' +
      (monto > 0 ? ' · te faltan ' + COP(g.minimo - monto) : '') + '</div>';
  }

  /* Repinta SOLO lo que depende del monto. Con "Otro monto" no se puede volver
     a pintar la pantalla entera en cada tecla: el campo perderia el foco y el
     cliente no podria seguir escribiendo. */
  function refrescarBono() {
    var g = reglaRecarga();
    var monto = recargaOtro
      ? parseInt(String(recargaOtro).replace(/\D/g, '') || '0', 10)
      : recargaMonto;

    var caja = $('rc-bono');
    if (caja) caja.innerHTML = bloqueBono(monto);

    var min = $('rc-min');
    if (min) min.innerHTML = avisoMinimo(monto);

    var tot = document.querySelector('.ep-pay-total b');
    if (tot) tot.textContent = COP(monto);

    var env = $('rc-enviar');
    if (env) env.disabled = monto < g.minimo;

    // Los montos de un toque se apagan cuando el cliente escribe el suyo.
    document.querySelectorAll('[data-monto]').forEach(function (b) {
      b.classList.toggle('on', !recargaOtro && Number(b.dataset.monto) === recargaMonto);
      b.classList.toggle('gana', bonoDe(Number(b.dataset.monto)) > 0);
    });
  }

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
      /* El chip, como el de una tarjeta de verdad (20-ago, idea de Sergio). Va
         vacio a proposito: todo el dibujo esta en el CSS. */
      '<span class="ep-wc-chip"></span>' +
      '<span class="ep-wc-lbl">Saldo disponible</span>' +
      '<div class="ep-wc-bal"><span class="ep-wc-amt">' + COP(c.saldo) + '</span>' +
        '<span class="ep-wc-spark"><svg class="ep-ic" width="19" height="19" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 3.6c.6 4.3 2.5 6.2 6.8 6.8-4.3.6-6.2 2.5-6.8 6.8-.6-4.3-2.5-6.2-6.8-6.8 4.3-.6 6.2-2.5 6.8-6.8z"/></svg></span></div>' +
      '<div class="ep-wc-num">\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ' +
        esc(String(c.telefono || '').slice(-4)) + '</div>' +
      '<div class="ep-wc-holder">' + esc(c.nombre || '') + '</div>' +
    '</div>' +
      /* El mismo boton de la pantalla principal. Aqui no navega: baja al
         formulario, que esta justo debajo. */
      '<button class="ep-wc-cta" id="rc-ir"><svg class="ep-ic" width="15" height="15" viewBox="0 0 24 24">' +
        '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
        'stroke-linejoin="round" d="M12 5v14M5 12h14"/></svg> Recargar</button>' +
    '</div>';

    /* Cada monto dice lo que le QUEDA, no solo lo que pone: es la diferencia
       entre una lista de precios y una oferta. */
    var botones = MONTOS.map(function (m) {
      var on = !recargaOtro && recargaMonto === m;
      var b = bonoDe(m);
      return '<button class="ep-monto' + (on ? ' on' : '') + (b ? ' gana' : '') + '" data-monto="' + m + '">' +
        COP(m) +
        (reglaRecarga().porBloque
          ? '<small>' + (b ? 'te quedan ' + COP(m + b) : 'sin regalo') + '</small>'
          : '') +
      '</button>';
    }).join('');

    var franja = reglaRecarga().porBloque
      ? '<div class="ep-promesa">Cada vez que recargas, te regalamos saldo</div>' : '';

    /* Los datos de pago salen de la CONFIGURACION del restaurante, no escritos
       aqui: cada uno tiene su cuenta, y una cuenta equivocada manda la plata a
       otro lado. Si no estan configurados, no se muestra el formulario. */
    var datos = '';
    if (pago.llave || pago.numero) {
      /* TODO el bloque abre el paso a paso (pedido de Sergio). Va como <button>
         y no como <div> con un onclick: asi tambien se abre con el teclado y el
         lector de pantalla lo anuncia como algo que se toca. */
      datos = '<button type="button" class="ep-pay" id="rc-pasos">' +
        '<h4>Datos de pago <span class="ep-pay-como">¿Cómo recargo?</span></h4>' +
        (pago.llave   ? '<div class="ep-pay-row"><span>Llave / Nequi</span><b>' + esc(pago.llave) + '</b></div>' : '') +
        (pago.numero  ? '<div class="ep-pay-row"><span>' + esc(pago.entidad || 'Cuenta') + '</span><b>' + esc(pago.numero) + '</b></div>' : '') +
        (pago.titular ? '<div class="ep-pay-row"><span>Titular</span><b>' + esc(pago.titular) + '</b></div>' : '') +
        '<div class="ep-pay-total"><span>Vas a recargar</span><b>' + COP(final) + '</b></div>' +
      '</button>';
    }

    var formulario = (pago.llave || pago.numero)
      ? '<div class="ep-card">' +
          '<h3>Recargar</h3>' +
          '<p class="sub">Elige el monto, transfiere y sube el comprobante. ' +
            'Tu saldo se acredita cuando el pago quede verificado.</p>' +
          franja +
          '<div class="ep-montos">' + botones + '</div>' +
          '<div id="rc-bono">' + bloqueBono(final) + '</div>' +
          '<input class="ep-input" id="rc-otro" placeholder="Otro monto" inputmode="numeric" value="' + esc(recargaOtro) + '">' +
          datos +
          '<label class="ep-upload"><input type="file" id="rc-comp" accept="image/*" hidden>' +
            '<span id="rc-comp-lbl">Adjuntar comprobante</span></label>' +
          '<div id="rc-min">' + avisoMinimo(final) + '</div>' +
          '<button class="ep-btn gold big" id="rc-enviar"' + (final < reglaRecarga().minimo ? ' disabled' : '') + '>Enviar recarga</button>' +
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

  /* Manda la recarga. El comprobante viaja como imagen y el servidor es quien
     decide: lee cuánto dice de verdad, lo cruza con el correo del banco (valor,
     referencia y hora de la transacción) y solo entonces acredita.

     El monto elegido se manda SOLO para que el servidor pueda avisar si no
     coincide con el comprobante. No decide nada: si mandara el monto como
     verdad, cualquiera escribiría medio millón. */
  /* Paga el pedido. El servidor decide: con saldo lo descuenta la base sin
     permitir negativos, y con transferencia lee el comprobante y lo cruza con
     el correo del banco. La página solo pide y muestra el resultado. */
  async function pagarPedido(metodo, archivo) {
    if (!pedidoHecho || !pedidoHecho.order_id) { aviso('No encontramos tu pedido.', 'mal'); return; }
    var btn = metodo === 'saldo' ? $('pg-saldo') : null;
    if (btn) { btn.disabled = true; btn.textContent = 'Pagando…'; }
    var lbl = $('pg-comp-lbl');
    if (lbl && metodo !== 'saldo') lbl.textContent = 'Verificando…';
    try {
      var cuerpo = { token: leerToken(), order_id: pedidoHecho.order_id, metodo: metodo };
      if (archivo) cuerpo.comprobante_url = await achicar(archivo, 1100);
      var d = await fetch(SB_URL + '/functions/v1/web-pagar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      }).then(function (r) { return r.json(); });

      if (!d.ok) { aviso(d.mensaje || 'No pudimos confirmar tu pago.', 'mal'); return; }
      if (d.saldo != null && S.cliente) S.cliente.saldo = d.saldo;
      pedidoHecho.pagado = true;
      aviso(d.mensaje || '¡Listo!', 'bien');
      pantallaDentro();
    } catch (e) {
      console.error('[pagar]', e);
      aviso('No se pudo confirmar el pago.\n\n' + ((e && e.message) || e), 'mal');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Pagar con mi saldo'; }
      if (lbl && metodo !== 'saldo') lbl.textContent = 'Ya transferí · subir comprobante';
    }
  }

  /* La recarga se celebra, no se notifica. Es el momento en que el cliente
     acaba de entregar plata: ver su saldo nuevo en grande y el regalo aparte
     es lo que hace que la próxima vez recargue más. */
  function avisoRecarga(monto, bono, saldo) {
    var viejo = document.querySelector('.ep-aviso-cap');
    if (viejo) viejo.remove();

    var cap = document.createElement('div');
    cap.className = 'ep-aviso-cap';
    cap.innerHTML =
      '<div class="ep-aviso-box bien ep-rec-box" role="alertdialog">' +
        '<div class="ep-rec-tit">¡Saldo recargado!</div>' +
        '<div class="ep-rec-saldo">' + COP(saldo) + '</div>' +
        '<div class="ep-rec-lbl">tu saldo disponible</div>' +
        '<div class="ep-rec-det">' +
          '<div class="ep-rec-fila"><span>Recargaste</span><b>' + COP(monto) + '</b></div>' +
          (bono > 0
            ? '<div class="ep-rec-fila regalo"><span>Te regalamos</span><b>+' + COP(bono) + '</b></div>'
            : '') +
        '</div>' +
        (bono > 0
          ? '<div class="ep-rec-pie">Recarga desde $50.000 y sigue ganando saldo extra 🎉</div>'
          : '<div class="ep-rec-pie">Recarga $50.000 o más y te regalamos saldo extra 🎉</div>') +
        '<button class="ep-btn gold big ep-aviso-ok" type="button">Entendido</button>' +
      '</div>';
    document.body.appendChild(cap);

    function cerrar() { cap.remove(); document.removeEventListener('keydown', porTecla); }
    function porTecla(e) { if (e.key === 'Escape') cerrar(); }
    cap.querySelector('.ep-aviso-ok').addEventListener('click', cerrar);
    cap.addEventListener('click', function (e) { if (e.target === cap) cerrar(); });
    document.addEventListener('keydown', porTecla);
    setTimeout(function () { cap.querySelector('.ep-aviso-ok').focus(); }, 30);
  }

  async function enviarRecarga() {
    var campo = $('rc-comp');
    var archivo = campo && campo.files && campo.files[0];
    if (!archivo) { aviso('Sube la foto del comprobante para acreditarte el saldo.', 'mal'); return; }

    var monto = recargaOtro
      ? parseInt(String(recargaOtro).replace(/\D/g, '') || '0', 10)
      : recargaMonto;
    if (monto < RECARGA_MINIMO) { aviso('La recarga mínima es ' + COP(RECARGA_MINIMO) + '.', 'mal'); return; }

    var btn = $('rc-enviar');
    if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
    try {
      /* 1100px: suficiente para que se lea la referencia y la hora en la
         captura, sin mandar una foto de 4 MB desde un celular con datos. */
      var img = await achicar(archivo, 1100);
      var d = await fetch(SB_URL + '/functions/v1/web-recarga', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: leerToken(), monto: monto, comprobante_url: img }),
      }).then(function (r) { return r.json(); });

      if (!d.ok) { aviso(d.mensaje || 'No pudimos acreditar la recarga.', 'mal'); return; }

      if (d.saldo != null) S.cliente.saldo = d.saldo;
      recargaOtro = '';
      avisoRecarga(Number(d.monto) || 0, Number(d.bono) || 0, Number(d.saldo) || 0);
      pantallaDentro();          // el saldo nuevo se ve al momento
    } catch (e) {
      /* El motivo, no un "algo falló": aquí hay plata de por medio y el cliente
         tiene derecho a saber por qué no se le acreditó. */
      console.error('[recarga]', e);
      aviso('No se pudo enviar la recarga.\n\n' + ((e && e.message) || e), 'mal');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar recarga'; }
    }
  }

  /* Un aviso con la cara de la página. `alert()` lo dibuja el navegador: sale
     gris, con el dominio arriba, y aparece justo cuando el cliente está por
     pagar — el peor momento para que algo parezca roto.

     Tres tonos: mal (algo falló), bien (salió), y neutro. Se cierra tocando
     fuera, con Escape o con el botón. */
  function aviso(texto, tono) {
    var viejo = document.querySelector('.ep-aviso-cap');
    if (viejo) viejo.remove();

    var cap = document.createElement('div');
    cap.className = 'ep-aviso-cap';
    cap.innerHTML =
      '<div class="ep-aviso-box ' + (tono || '') + '" role="alertdialog" aria-live="assertive">' +
        '<div class="ep-aviso-ic">' + (tono === 'bien' ? '\u2713' : tono === 'mal' ? '!' : 'i') + '</div>' +
        '<p class="ep-aviso-txt"></p>' +
        '<button class="ep-btn gold big ep-aviso-ok" type="button">Entendido</button>' +
      '</div>';
    /* El texto por textContent, no por innerHTML: parte de estos mensajes
       vienen del servidor y no se pintan como HTML ni por accidente. */
    cap.querySelector('.ep-aviso-txt').textContent = String(texto || '');
    document.body.appendChild(cap);

    function cerrar() {
      cap.remove();
      document.removeEventListener('keydown', porTecla);
    }
    function porTecla(e) { if (e.key === 'Escape') cerrar(); }
    cap.querySelector('.ep-aviso-ok').addEventListener('click', cerrar);
    cap.addEventListener('click', function (e) { if (e.target === cap) cerrar(); });
    document.addEventListener('keydown', porTecla);
    setTimeout(function () { cap.querySelector('.ep-aviso-ok').focus(); }, 30);
  }

  /* PREGUNTAR CON LA CARA DE LA PÁGINA ─────────────────────────────────
     Regla de Sergio (16-ago): NUNCA cuadros de diálogo del navegador. Un
     `prompt()` o un `confirm()` salen grises, con el dominio arriba y con
     botones en el idioma del teléfono — parecen de otra aplicación, y en el
     celular tapan media pantalla. Esta hoja es la misma de los avisos: se
     cierra tocando fuera o con Escape, y el Enter confirma.

     Devuelve una promesa: null si cancela, o un objeto con lo que escribió
     (o true si era solo una confirmación). */
  /* ══ INSTALAR LA PAGINA EN EL CELULAR ═══════════════════════════════
     Instalada se abre sin la barra del navegador, queda con su icono entre las
     demas apps y —lo que de verdad importa— puede mandar notificaciones.

     Android y iPhone NO se instalan igual, y esa es la razon de que esto sea
     una pantalla propia y no un boton:
       · Android avisa al navegador que la pagina se puede instalar
         (beforeinstallprompt). Ahi hay un boton que instala de una.
       · iPhone NO tiene esa señal ni ese boton: toca decirle a la persona
         "toca Compartir y luego Agregar a inicio". Un boton que no hace nada
         seria peor que no ponerlo.
     Y si entra con Chrome en un iPhone no hay forma de instalar: solo Safari
     puede. Decirselo es mas util que dejarlo intentando. */

  var instalador = null;   // la señal de Android, si llega

  function esIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      /* iPad moderno se hace pasar por Mac; se le nota por la pantalla tactil. */
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function esSafari() {
    var ua = navigator.userAgent;
    return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  }
  function yaInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           navigator.standalone === true;
  }
  /* EN IPHONE los avisos web SOLO existen con la app instalada — es una regla
     de Apple, no una decision nuestra. En Android y en el computador funcionan
     igual desde el navegador, asi que exigir la instalacion ahi les cerraba la
     puerta a clientes que podian tenerlos perfectamente. */
  function esIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function puedeAvisos() {
    return ('Notification' in window) && ('serviceWorker' in navigator) &&
           ('PushManager' in window) && (!esIOS() || yaInstalada());
  }
  function esCelular() {
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
           (window.innerWidth <= 820 && navigator.maxTouchPoints > 0);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    /* Se frena el aviso propio del navegador (una barrita fea abajo) para
       mostrar el nuestro, que explica PARA QUE sirve instalarla. */
    e.preventDefault();
    instalador = e;
  });
  window.addEventListener('appinstalled', function () {
    instalador = null;
    try { localStorage.setItem('ep-instalada', '1'); } catch (e) {}
  });

  /* Cuando volver a ofrecerlo si dijo "ahora no". Nunca mas seria perder a
     quien lo cerro sin leer; insistir cada visita es acoso. */
  var DIAS_ESPERA = 7;

  function tocaOfrecer() {
    if (!esCelular() || yaInstalada()) return false;
    /* En iPhone solo Safari instala; con Chrome no hay nada que ofrecer. PERO
       si esta dentro de Instagram/Facebook si conviene ofrecerlo, porque el
       modal ahora le ensena a salir hacia Safari. */
    if (esIOS() && !esSafari() && !enAppAjena()) return false;
    /* DENTRO DE INSTAGRAM la espera de 7 dias no aplica (20-ago-2026: el
       beacon mostro que eso era lo que callaba el aviso — se cerro una vez en
       una prueba y quedo mudo una semana). Ahi el aviso es la unica salida y
       quien llega de la biografia lo necesita SIEMPRE; solo se calla si lo
       cierra en esa misma visita. En navegadores normales, los 7 dias siguen. */
    try {
      if (enAppAjena()) return !sessionStorage.getItem('ep-instalar-no-visita');
      var v = Number(localStorage.getItem('ep-instalar-no') || 0);
      if (v && (Date.now() - v) < DIAS_ESPERA * 864e5) return false;
    } catch (e) {}
    return true;
  }

  /* ── EL NAVEGADOR DE ADENTRO DE INSTAGRAM (20-ago-2026) ────────────────
     Sergio: "si pongo el enlace en la biografia de Instagram, el celular lo
     abre en el navegador fantasma que tiene Instagram, no en Safari".

     Es cierto, y ademas ahi NO SE PUEDE INSTALAR: ese navegador no tiene el
     boton Compartir de Safari ni el menu de Chrome. Peor todavia, hasta hoy el
     modal le daba los pasos de Safari a alguien que no los tiene delante — una
     instruccion imposible de seguir, que es peor que no decir nada.

     Se reconoce por el nombre que se pone el navegador: Instagram y Facebook se
     identifican en el `user agent`. Es lo unico que dejan ver. */
  function enAppAjena() {
    var ua = navigator.userAgent || '';
    /* Los que se presentan con nombre propio. */
    if (/Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|TikTok|musical_ly|Snapchat/i.test(ua)) return true;
    /* Los que no se presentan (20-ago: en el iPhone de Sergio, Instagram no
       salia con el metodo de arriba). Se les nota por lo que les FALTA:
       - Android: todo navegador interno lleva "; wv)" en su identificacion.
       - iPhone: Safari siempre dice "Safari"; Chrome dice "CriOS", Firefox
         "FxiOS", Edge "EdgiOS", Opera "OPT". Un iPhone que no dice ninguno
         esta dentro de la ventana de otra app. */
    if (/; wv\)/i.test(ua)) return true;
    if (esIOS() && !yaInstalada() && !esSafari() && !/crios|fxios|edgios|opt\/|duckduckgo/i.test(ua)) return true;
    return false;
  }


  /* EN ANDROID SI SE PUEDE SACAR AL NAVEGADOR DE VERDAD. Un enlace `intent://`
     le dice al sistema "abre esto con Chrome", y el sistema obedece aunque
     estemos dentro de otra app.

     EN IPHONE NO EXISTE ESA PUERTA: Apple no deja que una pagina mande a abrir
     Safari. Cualquier truco que se lea por ahi (`x-safari-https://`) o no
     funciona desde este navegador o dejo de funcionar hace rato. Lo unico
     honesto es decirle donde tocar — y por suerte Instagram tiene la opcion. */
  function abrirEnNavegadorDeVerdad() {
    /* Sin el #hash: si la direccion trajera uno, se comeria el ;end del
       intent y Android no sabria que hacer con el enlace. */
    var url = (location.host + location.pathname + location.search);
    location.href = 'intent://' + url + '#Intent;scheme=https;package=com.android.chrome;end';
  }

  /* EL ICONO DE COMPARTIR DE IPHONE, dibujado igual que el de verdad: el
     cuadrito abierto por arriba con la flecha saliendo. Se pone al lado de la
     palabra para que la persona lo RECONOZCA en la lista en vez de tener que
     leerse los nombres uno por uno. */
  var ICO_COMPARTIR = '<svg class="ep-ico-compartir" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M8 11v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7"/>' +
    '<path d="M12 3v11"/><path d="M8.5 6.5 12 3l3.5 3.5"/></svg>';

  function pasosInstalar() {
    /* Dentro de Instagram no sirven ni los pasos de iPhone ni los de Android:
       hay que salir primero. */
    if (enAppAjena()) {
      return esIOS()
        ? [
            ['mas', 'Toca los <b>tres puntos</b> de arriba', 'En la esquina de arriba a la derecha, dentro de esta misma pantalla.'],
            ['compartir', 'Elige <b>Abrir en el navegador</b>', 'También puede decir “Abrir en Safari”.'],
            ['ok', 'Ya en Safari, vuelve a tocar <b>Instalar</b>', 'Ahí sí aparece el botón Compartir para agregarla.'],
          ]
        : [
            ['mas', 'Toca <b>Abrir en Chrome</b>', 'El botón de aquí abajo te lleva solo.'],
            ['ok', 'Ya en Chrome, toca <b>Instalar</b>', 'El navegador te lo ofrece de una.'],
          ];
    }
    if (esIOS()) {
      /* LOS TRES PUNTOS, NO EL CUADRITO DE COMPARTIR (23-ago-2026).
         Aqui decia 'Toca Compartir — el cuadrito con la flecha, abajo en el
         centro'. Sergio mando la captura de su iPhone y esa barra no tiene ese
         icono: trae atras, lectura, la direccion, recargar y los tres puntos a
         la derecha. Y ademas la flecha animada de esta pantalla apunta ahi, o
         sea que el dibujo y las letras se estaban contradiciendo.
         Los tres puntos sirven en todas las versiones —de ahi cuelga tanto
         Compartir como Agregar a inicio—, asi que es ademas la instruccion mas
         segura. */
      /* COMPARTIR NO SE SALTA, PERO VA JUNTO CON LOS TRES PUNTOS.
         Primero faltaba: de los tres puntos no se pasa directo a 'Agregar a
         inicio' —hay que entrar a Compartir, y ahi dentro esta la opcion—, y
         omitirlo deja a la persona mirando una lista donde no encuentra lo que
         le dijimos. Al ponerlo aparte quedaban cuatro pasos, y con cuatro el
         video se encogia a 198px de ancho en un iPhone normal: una grabacion
         de pantalla a ese tamaño no se lee.
         La salida la dio Sergio: los dos toques son seguidos y en la misma
         pantalla, asi que son UN paso. Nada de informacion se pierde y el video
         recupera su tamaño. (23-ago-2026.) */
      return [
        ['mas', 'Toca los <b>tres puntos</b> y luego <b>Compartir</b> ' + ICO_COMPARTIR,
               'Los tres puntos están abajo a la derecha, en la barra del navegador — la flecha te los señala.'],
        ['compartir', 'Busca <b>Agregar a inicio</b>', 'Deslízate hacia abajo en la lista de opciones.'],
        ['ok', 'Toca <b>Agregar</b>', 'Listo: te queda con el logo entre tus aplicaciones.'],
      ];
    }
    return [
      ['mas', 'Toca los <b>tres puntos</b>', 'Arriba a la derecha, en el navegador.'],
      ['ok', 'Elige <b>Instalar aplicación</b>', 'También puede decir “Agregar a pantalla de inicio”.'],
    ];
  }

  function pantallaInstalar(forzado) {
    var viejo = document.querySelector('.ep-aviso-cap');
    if (viejo) viejo.remove();

    /* Dentro del navegador de otra app NO se puede instalar, aunque por algun
       motivo tuvieramos guardada la senal: primero hay que salir de ahi. */
    var atrapado = enAppAjena();
    var directo = !!instalador && !atrapado;  // en Android se instala de un toque
    var puedeSalir = atrapado && !esIOS();    // solo Android tiene la puerta
    var cap = document.createElement('div');
    cap.className = 'ep-aviso-cap';
    cap.innerHTML =
      '<div class="ep-aviso-box ep-inst" role="dialog" aria-modal="true" aria-label="Instalar la aplicación">' +
        '<div class="ep-inst-cab">' +
          '<span class="ep-inst-ico"><img src="icono-192.png" alt=""></span>' +
          '<div><div class="ep-inst-tit">Ten ' + esc(S.negocio && S.negocio.nombre || 'la carta') + ' a un toque</div>' +
            '<div class="ep-inst-sub">Instálala en tu celular. Ocupa casi nada.</div></div>' +
        '</div>' +
        /* Decirle DONDE ESTA antes de darle los pasos: sin esto no entiende por
           que le pedimos salir de donde ya esta viendo la pagina. */
        (atrapado
          ? '<div class="ep-inst-ojo">Estás viendo esto dentro de otra aplicación ' +
            '(Instagram, Facebook…) y desde aquí no se puede instalar. ' +
            'Es un solo paso más:</div>'
          : '') +
        '<ul class="ep-inst-por">' +
          '<li>Se abre sola, sin buscarla en el navegador</li>' +
          '<li>Te avisamos cuando tu pedido va en camino</li>' +
          '<li>Tus puntos y tu saldo siempre a la mano</li>' +
        '</ul>' +
        (directo
          ? '<button class="ep-btn gold big ep-inst-ya" type="button">Instalar</button>'
          : '<div class="ep-inst-pasos">' + pasosInstalar().map(function (p, i) {
              return '<div class="ep-inst-paso"><span class="ep-inst-n">' + (i + 1) + '</span>' +
                '<div><div class="ep-inst-p-t">' + p[1] + '</div>' +
                '<div class="ep-inst-p-s">' + esc(p[2]) + '</div></div></div>';
            }).join('') + '</div>') +
        /* En Android el sistema SI obedece un enlace `intent://`, asi que le
           damos el boton en vez de hacerle buscar el menu. */
        (puedeSalir
          ? '<button class="ep-btn gold big ep-inst-chrome" type="button">Abrir en Chrome</button>'
          : '') +
        '<button class="ep-btn ep-btn--ghost ep-inst-no" type="button">' +
          (directo ? 'Ahora no' : 'Entendido') + '</button>' +
      '</div>';
    document.body.appendChild(cap);

    function cerrar(recordar) {
      cap.remove();
      /* Solo se apunta el "ahora no" cuando el cliente lo cierra el mismo. Si
         se cierra porque acepto instalar, no hay nada que recordar. */
      if (recordar) {
        try {
          if (enAppAjena()) sessionStorage.setItem('ep-instalar-no-visita', '1');
          else localStorage.setItem('ep-instalar-no', String(Date.now()));
        } catch (e) {}
      }
    }
    cap.querySelector('.ep-inst-no').onclick = function () { cerrar(!forzado); };
    cap.addEventListener('click', function (ev) { if (ev.target === cap) cerrar(!forzado); });

    /* En Android atrapado dentro de otra app: el boton saca al navegador de
       verdad, y alla el modal ya ofrece instalar de un toque. */
    var bChrome = cap.querySelector('.ep-inst-chrome');
    if (bChrome) bChrome.onclick = abrirEnNavegadorDeVerdad;

    var ya = cap.querySelector('.ep-inst-ya');
    if (ya) ya.onclick = async function () {
      var ev = instalador;
      if (!ev) { cerrar(true); return; }
      instalador = null;
      cerrar(false);
      try {
        ev.prompt();
        var r = await ev.userChoice;
        /* Si dijo que no al cuadro del navegador, se respeta igual que si
           hubiera cerrado el nuestro: nada de volver a preguntar mañana. */
        if (r && r.outcome !== 'accepted') {
          try { localStorage.setItem('ep-instalar-no', String(Date.now())); } catch (e) {}
        }
      } catch (e) { console.error('[instalar]', e); }
    };
  }

  /* ══ EL TUTORIAL DE INSTALACION, EN PANTALLA COMPLETA ═══════════════════

     A donde cae el boton de la plantilla de WhatsApp que se le manda a quien
     se registro y NO instalo la app. Se llega con #instalar en la direccion.

     Por que una pantalla nuestra y no un enlace a YouTube o a Drive: el boton
     que instala de verdad solo funciona DENTRO de este dominio (lo exige el
     navegador). Si el video viviera en YouTube, la persona lo veria... y
     quedaria dentro de YouTube, teniendo que volver a WhatsApp y empezar de
     nuevo. Aqui ve el video e instala en la misma pantalla, sin saltos.

     Se pinta ANTES de pedir sesion a proposito: quien llega por este enlace
     viene a aprender a instalar, no a entrar. Una pantalla de login en la cara
     seria justo el obstaculo que este mensaje existe para quitar.

     Los pasos escritos NO se escriben aqui: salen de pasosInstalar(), que ya
     los tiene y ya distingue iPhone de Android y de estar dentro de Instagram.
     Asi el video y las letras nunca se contradicen, y el dia que Apple cambie
     un menu se corrige en un solo sitio. */

  /* La direccion del video la pone CADA RESTAURANTE en su propio index.html
     (window.COBRA_TUTORIAL), que es el unico archivo propio de cada uno — el
     mismo sitio donde ya vive COBRA_SLUG. Cobra no es El Parche: aqui no va
     quemada ninguna direccion.
     Si todavia no hay video, la pantalla NO muestra un recuadro vacio: se ve
     completa con el titulo y los pasos. Un hueco que dice "aqui va el video"
     es peor que no tenerlo — la misma regla de los tutoriales. */
  function videoTutorial() {
    var c = window.COBRA_TUTORIAL || {};
    /* CADA APARATO SOLO VE SU VIDEO. Aqui habia un respaldo —si faltaba el de
       Android se ponia el de iPhone— y estaba mal pensado: los pasos escritos
       de abajo SI salen bien (los da pasosInstalar segun el aparato), asi que
       un usuario de Android habria visto un video diciendo "toca Compartir" y
       debajo, en letras, "toca los tres puntos". Justo la contradiccion que
       esta pantalla existe para evitar. Sin video propio no se pone ninguno:
       los pasos escritos solos se entienden perfectamente. */
    var u = esIOS() ? c.ios : c.android;
    u = String(u || '').trim();
    /* Solo direcciones de verdad: un `javascript:` metido en un src no se
       pinta. Viene del archivo del propio restaurante, pero el filtro es de
       una linea y quita la duda. */
    return /^https:\/\//i.test(u) ? u : '';
  }

  /* LA FLECHA QUE SEÑALA DONDE TOCAR (pedido de Sergio, 23-ago-2026).

     Donde va NO es un detalle de gusto: en iPhone el menu esta ABAJO a la
     derecha (la barra de Safari) y en Android ARRIBA a la derecha (los tres
     puntos de Chrome). Apuntar al sitio equivocado es peor que no apuntar.

     Y no siempre hay que apuntar:
       · Si el navegador nos dio el boton de instalar (Android), la persona no
         tiene que buscar nada — la flecha la mandaria a dar un rodeo.
       · Dentro de Instagram o Facebook no se puede instalar: primero hay que
         salir, y para eso ya estan los pasos y el boton 'Abrir en Chrome'.
       · Si ya la tiene instalada no hay nada que señalar.
     Devuelve null en esos casos y no se pinta nada. */
  function flechaInstalar(directo) {
    if (directo || enAppAjena() || yaInstalada()) return null;
    return esIOS() ? 'abajo' : 'arriba';
  }

  function pantallaTutorial() {
    var e = S.negocio || {};
    var url = videoTutorial();
    /* En Android hay boton que instala de un toque; en iPhone no existe esa
       señal —Apple no la da— y los pasos SON la accion. */
    var directo = !!instalador && !enAppAjena();
    var donde = flechaInstalar(directo);
    var pasos = pasosInstalar();

    /* CABECERA PROPIA, NO la de las demas pantallas (23-ago-2026).
       `cabecera()` trae el logo de 70px, el nombre a 27px, la frase 'Tu cuenta,
       tu saldo y tus puntos' y la pastilla de abierto/cerrado: unos 190px que
       aqui no dicen nada sobre instalar y son justo los que hacian falta para
       que todo cupiera sin bajar. Se deja el logo y el nombre en una sola fila. */
    var marca = e.logo
      ? '<img class="ep-marca-img" src="' + esc(e.logo) + '" alt="">'
      : ICONO;

    pinta(
      '<div class="ep-tuto">' +
        '<div class="ep-tuto-cab">' +
          '<div class="ep-tuto-marca">' + marca + '</div>' +
          '<span class="ep-tuto-nom">' + esc(e.nombre || '') + '</span>' +
        '</div>' +
        '<h2 class="ep-tuto-h">Instálala en tu celular</h2>' +
        /* EL REGALO, RECALCADO (pedido de Sergio, 23-ago-2026). Es la razon
           mas fuerte para hacerlo, asi que va antes que nada y con su propio
           realce.
           El monto sale de la BASE (tenants.web_bono_instalacion, via
           fn_web_publica), que es el MISMO numero con el que web-acceso lo
           entrega de verdad. Escribirlo aqui seria tenerlo en dos sitios: el
           dia que Sergio lo cambiara, la pantalla seguiria prometiendo el
           viejo — y esto es plata. Si el restaurante no da bono (0), no se
           promete nada. */
        (Number(e.bono_instalacion) > 0
          ? '<div class="ep-tuto-bono">' +
              '<span class="ep-tuto-bono-m">' + COP(e.bono_instalacion) + ' de regalo</span>' +
              '<span class="ep-tuto-bono-s">Por dejarla en tu pantalla de inicio</span>' +
            '</div>'
          : '') +
        '<p class="ep-tuto-lead">Se abre sola y te avisamos cuando tu pedido ' +
          'va en camino.</p>' +
        (url
          /* La CAJA va aparte del marco a proposito: el marco es el hueco
             elastico (ocupa todo el ancho) y la caja mide exactamente lo que
             el video, que es lo unico que puede recortarle las esquinas. */
          ? '<div class="ep-tuto-marco"><div class="ep-tuto-caja">' +
            /* SIN CONTROLES Y ARRANCANDO SOLO (pedido de Sergio, 23-ago).
               `muted` no es una eleccion: ningun navegador —ni iPhone ni
               Android— deja que un video empiece solo CON sonido. Sin `muted`
               el arranque automatico se rechaza y quedaria un cuadro quieto.
               `playsinline` para que en iPhone no se tome la pantalla entera,
               y `loop` porque son 79 segundos: quien llegue a mitad lo ve
               completo sin tener que buscar como repetirlo. */
            '<video class="ep-tuto-video" src="' + esc(url) + '" ' +
            'autoplay muted loop playsinline preload="auto" ' +
            'disablepictureinpicture></video>' +
            /* Nace visible porque el video SIEMPRE empieza en silencio: no hay
               navegador que deje otra cosa. Se va en cuanto lo tocan. */
            '<button class="ep-tuto-sonido" type="button">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
                '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
                '<path d="M19 5a9 9 0 0 1 0 14"/>' +
              '</svg>Activar sonido</button>' +
            '</div></div>'
          : '') +
        '<div class="ep-tuto-pasos-t">' +
          (url ? 'Los mismos pasos, escritos'
               : 'Son ' + ['cero','un','dos','tres','cuatro','cinco'][pasos.length] +
                 (pasos.length === 1 ? ' paso' : ' pasos')) +
        '</div>' +
        '<div class="ep-inst-pasos">' + pasos.map(function (p, i) {
          return '<div class="ep-inst-paso"><span class="ep-inst-n">' + (i + 1) + '</span>' +
            '<div><div class="ep-inst-p-t">' + p[1] + '</div>' +
            '<div class="ep-inst-p-s">' + esc(p[2]) + '</div></div></div>';
        }).join('') + '</div>' +
        /* AQUI HABIA UN BOTON 'Ya la instalé, entrar' Y NO SERVIA PARA NADA
           (lo vio Sergio, 23-ago): abria la pagina en el mismo navegador, que
           es de donde la persona viene. Quien ya la instalo no necesita un
           boton: la abre desde su pantalla de inicio, que es justo lo que
           acaba de aprender a hacer.
           En iPhone entonces no queda ningun boton, y esta bien: los pasos
           SON la accion. En Android si queda el que instala de un toque. */
        (directo
          ? '<button class="ep-btn gold big ep-tuto-ya" type="button">Instalar ahora</button>'
          : '') +
        /* Va FUERA del flujo (position:fixed), asi que no le quita ni un pixel
           al video ni empuja nada fuera de la pantalla. */
        (donde
          ? '<div class="ep-tuto-flecha ' + donde + '" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
                '<line x1="5" y1="12" x2="19" y2="12"/>' +
                '<polyline points="13 6 19 12 13 18"/>' +
              '</svg>' +
              '<span>Aquí</span>' +
            '</div>'
          : '') +
      '</div>');

    /* Al salir se quita el #instalar: si la persona recarga o vuelve mañana
       por el historial, no cae otra vez en el tutorial. */
    function seguir() {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (x) {}
      if (S.cliente) pantallaDentro(); else pantallaEntrar('', false);
    }
    /* TOCAR EL VIDEO LO PAUSA Y LO SIGUE, sin que se vea ningun boton.

       El unico dibujo que puede aparecer es el triangulo de 'play', y solo en
       un caso: que el arranque automatico lo haya bloqueado el navegador (pasa
       en iPhone con el ahorro de bateria encendido) y la persona todavia no
       haya tocado nada. Sin eso, ese celular mostraria un cuadro quieto sin
       ninguna pista de que hay que tocarlo, y el video no lo veria nadie.
       En cuanto toca una vez, no vuelve a salir nunca — que es lo que pidio
       Sergio: pausar y seguir sin ver un solo boton. */
    var vid  = document.querySelector('.ep-tuto-video');
    var caja = document.querySelector('.ep-tuto-caja');
    if (vid && caja) {
      var tocado = false;   // la persona ya toco el video alguna vez
      /* LO PARO ELLA, o lo paro el celular. No es lo mismo: si lo paro ella hay
         que respetarlo, y si lo paro el celular al irse la pagina al fondo hay
         que seguirlo al volver. Con un solo `tocado` no se distinguian, y
         bastaba con que hubiera tocado una vez —aunque fuera para SEGUIR— para
         que al volver del menu del navegador se quedara congelado. */
      var loParoElla = false;
      var arranco = false;  // el video llego a reproducirse alguna vez
      /* EL TRIANGULO SOLO SI NUNCA ARRANCO. Antes salia en CUALQUIER pausa, y
         eso incluye la que hace el propio celular al irse la pagina al fondo
         — que aqui pasa siempre, porque el paso 1 es justamente abrir el menu
         del navegador. La persona volvia y se encontraba el boton que Sergio
         pidio no ver. Si ya arranco una vez, no hay nada que avisar. */
      function avisarQuietoSiHaceFalta() {
        if (!tocado && !arranco && vid.paused) caja.classList.add('pausado');
      }
      /* SE INTENTA MAS DE UNA VEZ, y no por terco: el primer intento sale
         cuando el archivo todavia no tiene ni un fotograma cargado y el
         navegador lo rechaza por la carrera con la descarga, no porque no
         quiera reproducir. Comprobado en la prueba: ese primer play() se
         rechazaba y el mismo play() a mano, un segundo despues, funcionaba.
         Se reintenta cuando ya hay datos; si ahi tambien falla, entonces si es
         que el navegador no deja (ahorro de bateria) y sale el triangulo. */
      function arrancar() {
        if (loParoElla || !vid.paused) return;
        var p = vid.play();
        if (p && p.catch) p.catch(avisarQuietoSiHaceFalta);
      }
      arrancar();
      vid.addEventListener('loadeddata', arrancar);
      vid.addEventListener('canplay', arrancar);
      vid.addEventListener('pause', avisarQuietoSiHaceFalta);
      vid.addEventListener('playing', function () {
        arranco = true;
        caja.classList.remove('pausado');
      });
      /* Al volver de abrir el menu del navegador, el video sigue solo. Si la
         persona lo habia pausado ELLA, se respeta y se queda quieto. */
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) arrancar();
      });
      caja.addEventListener('click', function () {
        tocado = true;
        caja.classList.remove('pausado');
        if (vid.paused) {
          loParoElla = false;
          var p = vid.play(); if (p && p.catch) p.catch(function () {});
        } else {
          loParoElla = true;
          vid.pause();
        }
      });
    }

    /* ACTIVAR EL SONIDO Y VOLVER A EMPEZAR (pedido de Sergio, 23-ago).
       Se rebobina a proposito: el video arranco callado, asi que lo que ya
       corrio se lo perdio. Devolverlo es la unica forma de que lo vea entero
       con sonido, que es justo para lo que toco el boton.
       `stopPropagation` es imprescindible: el toque cae DENTRO de la caja, y
       sin esto tambien dispararia el pausar/seguir y el video se quedaria
       quieto justo al activarle el sonido. */
    var bSon = document.querySelector('.ep-tuto-sonido');
    if (bSon && vid) {
      bSon.addEventListener('click', function (ev) {
        ev.stopPropagation();
        vid.muted = false;
        vid.currentTime = 0;
        loParoElla = false;
        caja.classList.remove('pausado');
        var p = vid.play(); if (p && p.catch) p.catch(function () {});
        bSon.remove();   // ya no hay nada que activar
      });
    }

    var bYa = document.querySelector('.ep-tuto-ya');
    if (bYa) bYa.onclick = async function () {
      var ev = instalador;
      if (!ev) return;
      instalador = null;
      try { ev.prompt(); await ev.userChoice; } catch (x) { console.error('[tutorial]', x); }
      seguir();
    };
  }

  /* Se ofrece cuando la persona YA ESTA ADENTRO, no al abrir. Al abrir todavia
     no sabe que es esto y lo cierra sin leer; despues de entrar ya vio sus
     puntos y la oferta tiene sentido. */
  function ofrecerInstalar() {
    if (!tocaOfrecer()) return;
    setTimeout(function () { if (tocaOfrecer()) pantallaInstalar(false); }, 2500);
  }

  /* ══ LAS NOTIFICACIONES ═════════════════════════════════════════════
     Se piden UNA sola vez y solo con la aplicacion YA INSTALADA. Dos razones:
       · el navegador da una sola oportunidad de verdad — si dice que no, no
         hay forma de volver a preguntar desde la pagina;
       · en iPhone las notificaciones web SOLO existen si esta instalada.
     Y se piden despues de explicar para que son: un cuadro del sistema que
     salta de la nada casi siempre se cierra con "Bloquear". */
  function pantallaNotificar() {
    var cap = document.createElement('div');
    cap.className = 'ep-aviso-cap';
    cap.innerHTML =
      '<div class="ep-aviso-box ep-inst" role="dialog" aria-modal="true">' +
        '<div class="ep-inst-cab"><span class="ep-inst-ico campana">' + ico('campana', 26) + '</span>' +
          '<div><div class="ep-inst-tit">¿Te avisamos?</div>' +
          '<div class="ep-inst-sub">Solo lo importante de tus pedidos.</div></div></div>' +
        '<ul class="ep-inst-por">' +
          /* ESTO ES LO QUE DE VERDAD SE ENVIA (19-ago). Antes la lista era un
             ejemplo para explicar la idea, y prometia avisos de puntos que
             nadie manda. Pedir un permiso ofreciendo algo que no ocurre es la
             forma mas rapida de que lo quiten. */
          '<li>Cuando empezamos a preparar tu pedido</li>' +
          '<li>Cuando sale para tu casa o queda listo para recoger</li>' +
          '<li>Cuando te lo entregamos</li>' +
        '</ul>' +
        '<button class="ep-btn gold big ep-not-si" type="button">Sí, avísenme</button>' +
        '<button class="ep-btn ep-btn--ghost ep-not-no" type="button">Ahora no</button>' +
      '</div>';
    document.body.appendChild(cap);

    function cerrar() { cap.remove(); }
    cap.querySelector('.ep-not-no').onclick = function () {
      /* Un "ahora no" NO se le pregunta al navegador: asi el permiso queda
         intacto y se le puede volver a ofrecer la proxima vez que entre.
         Ya no se apunta la fecha: Sergio pidio que se ofrezca en cada visita
         mientras no lo haya negado de verdad. */
      cerrar();
    };
    cap.querySelector('.ep-not-si').onclick = async function () {
      cerrar();
      try {
        var permiso = await Notification.requestPermission();
        /* Aqui se guardaba "ya se le pidio" y con eso la app se callaba para
           siempre — aunque el cuadro de Apple no hubiera concedido nada. Ese
           es exactamente el limbo en el que quedo Camerón. Ahora no se guarda
           nada: si el permiso sigue en "default", en la proxima visita se le
           vuelve a ofrecer. */
        if (permiso === 'granted') await suscribirPush();
      } catch (e) { console.error('[notif]', e); }
    };
  }

  /* SE OFRECE EN CADA VISITA, NO UNA VEZ (23-ago-2026, pedido de Sergio).

     El caso que lo destapo: Camerón (3044868407) instalo la app en su iPhone,
     Sergio la acompaño a hacerlo, y ella quedo convencida de que habia
     activado los avisos. En la base: cero suscripciones. En iPhone son DOS
     pasos —nuestra tarjeta y despues el cuadro de Apple— y es facilisimo
     quedarse a medias creyendo que ya esta.

     Antes, con una sola negativa ("ahora no") la app se callaba 14 dias, y
     con `ep-notif-pedido` se callaba PARA SIEMPRE — bastaba con que el cuadro
     de Apple se hubiera abierto una vez, aunque no se hubiera concedido nada.
     Asi es como alguien se queda meses sin avisos sin enterarse.

     La UNICA razon para no volver a ofrecerlo es que el cliente lo haya
     NEGADO de verdad (permission === "denied"): ahi el navegador ya no vuelve
     a mostrar el cuadro, asi que insistir solo seria molestar sin que pueda
     pasar nada. Si esta concedido, tampoco: de eso se encarga asegurarPush,
     que lo repara solo. */
  /* ══ LA FOTO DE PERFIL: SE INVITA DOS VECES ═══════════════════════════
     Pedido de Sergio (23-ago-2026). Dos veces y no siempre: a la tercera ya
     no es una invitacion, es insistencia — y quien no quiere poner foto no la
     va a poner por verlo una vez mas.

     No se le ofrece a quien YA tiene foto: seria pedirle algo que ya hizo.
     Y la cuenta se lleva por CLIENTE, no por aparato, para que quien entre en
     el celular de otro no se gaste las dos veces del dueño.

     Va despues del aviso de instalar y del de avisos a proposito: esos dos
     sirven para que le lleguen sus pedidos; la foto es lo bonito. Si los tres
     tocan la misma visita, primero lo que importa. */
  function llaveFoto() {
    var c = S.cliente || {};
    return 'ep-foto-invit-' + (c.id || c.telefono || '');
  }
  function vecesFoto() {
    try { return Number(localStorage.getItem(llaveFoto()) || 0); } catch (e) { return 99; }
  }

  function ofrecerFoto() {
    var c = S.cliente || {};
    if (c.foto) return;                         // ya la tiene
    if (vecesFoto() >= 2) return;
    /* Con calma: si se abre encima de los otros avisos, se pisan. */
    setTimeout(pantallaFoto, 6000);
  }

  function pantallaFoto() {
    /* Si en estos segundos se abrio otro aviso, este se espera a la proxima
       visita en vez de taparlo. */
    if (document.querySelector('.ep-aviso-cap')) return;
    var c = S.cliente || {};
    if (c.foto) return;
    /* LA CUENTA SE APUNTA AQUI Y NO AL PROGRAMARLA: si se apuntara antes, una
       invitacion que nunca llego a verse —porque habia otro aviso encima— se
       habria gastado igual, y al cliente le quedaria una sola oportunidad
       real de las dos que pidio Sergio. */
    if (vecesFoto() >= 2) return;
    try { localStorage.setItem(llaveFoto(), String(vecesFoto() + 1)); } catch (e) {}
    var cap = document.createElement("div");
    cap.className = "ep-aviso-cap";
    cap.innerHTML =
      '<div class="ep-aviso-box ep-inst" role="dialog" aria-modal="true" aria-label="Tu foto de perfil">' +
        '<div class="ep-inst-cab">' +
          /* `flex:0 0 auto` porque la fila es flex y le aplastaba el circulo
             (medido: salia 45x50 en vez de redondo). */
          '<span class="ep-avatar-g" style="flex:0 0 auto;width:50px;height:50px;font-size:18px">' +
            esc(iniciales(c.nombre)) + '</span>' +
          '<div><div class="ep-inst-tit">Ponle tu foto</div>' +
            '<div class="ep-inst-sub">Para que te reconozcamos cuando pidas 😊</div></div>' +
        '</div>' +
        '<button class="ep-btn gold big ep-foto-si" type="button">Poner mi foto</button>' +
        '<button class="ep-btn ep-btn--ghost ep-foto-no" type="button">Ahora no</button>' +
      '</div>';
    document.body.appendChild(cap);
    function cerrar() { cap.remove(); }
    cap.querySelector('.ep-foto-no').onclick = cerrar;
    cap.addEventListener("click", function (ev) { if (ev.target === cap) cerrar(); });
    cap.querySelector('.ep-foto-si').onclick = function () {
      cerrar();
      irA('perfil');
    };
  }

  function tocaNotificar() {
    if (!puedeAvisos()) return false;   // en iPhone hace falta instalarla; en Android no
    return Notification.permission === 'default';
  }
  function ofrecerNotificar() {
    if (!tocaNotificar()) return;
    setTimeout(function () { if (tocaNotificar()) pantallaNotificar(); }, 3500);
  }

  /* La llave publica del servidor. Es publica de verdad: sirve para que el
     navegador sepa a quien le va a permitir mandar avisos a este celular, y no
     sirve para mandarlos — eso necesita la privada, que vive solo en el
     servidor y nunca sale de ahi. */
  var LLAVE_PUSH = 'BKo8A7QSgRUy8uamhUiFUNl_moyGn4lLCRdb7hxG-4OegZibl7g3KdPqRQYBTKHXhe33D2gILr1jPNocTExwSxg';

  function llaveABytes(b64) {
    var relleno = '='.repeat((4 - b64.length % 4) % 4);
    var limpio = (b64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
    var crudo = atob(limpio), a = new Uint8Array(crudo.length);
    for (var i = 0; i < crudo.length; i++) a[i] = crudo.charCodeAt(i);
    return a;
  }

  /* El ayudante se registra SIEMPRE que se pueda, aunque todavia no haya
     permiso: registrarlo tarda y hacerlo justo cuando el cliente dice "sí"
     dejaría el permiso concedido y la suscripción a medias. */
  async function registrarAyudante() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await navigator.serviceWorker.register('sw.js', { scope: './' });
    } catch (e) { console.error('[sw]', e); return null; }
  }

  /* Devuelve `true` solo si el celular quedo REGISTRADO en el servidor. Antes
     se tragaba cualquier fallo en silencio, y por eso nadie se entero de que
     habia permiso concedido pero cero celulares guardados. */
  async function suscribirPush() {
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          /* Obligatorio: sin esto el navegador permitiría avisos silenciosos y
             Chrome directamente lo rechaza. */
          userVisibleOnly: true,
          applicationServerKey: llaveABytes(LLAVE_PUSH),
        });
      }
      var j = sub.toJSON();
      var r = await fetch(ACCESO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'push-suscribir', token: leerToken(), slug: S.slug,
          endpoint: j.endpoint, p256dh: j.keys && j.keys.p256dh, auth: j.keys && j.keys.auth,
        }),
      }).then(function (x) { return x.json(); });
      S.pushOk = !!(r && r.ok);
      return S.pushOk;
    } catch (e) { console.error('[push]', e); S.pushOk = false; return false; }
  }

  /* ── EL REGISTRO SE REPARA SOLO (19-ago) ──────────────────────────────
     Sergio tenia el permiso concedido desde antes y aun asi no le llegaba
     nada: dar el permiso y quedar REGISTRADO son dos cosas distintas, y la
     segunda solo ocurria en el instante en que se aceptaba el cuadro. Si eso
     fallaba —o si el permiso se acepto antes de que existiera el registro,
     que es justo su caso— nadie volvia a intentarlo nunca y el cliente se
     quedaba con la ilusion de tener avisos.

     Ahora, con el permiso ya concedido, se comprueba en cada arranque. Es
     barato (el navegador devuelve la suscripcion que ya tiene) y arregla solo
     a todo el que estuviera en ese limbo, sin pedirle que reinstale nada. */
  var pushRevisado = false;
  function asegurarPush() {
    if (pushRevisado) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'granted') return;
    if (!leerToken()) return;
    pushRevisado = true;
    suscribirPush().then(function (ok) {
      /* Si se acababa de reparar, se repinta: el Perfil estaba diciendo otra
         cosa. */
      if (ok && vista === 'perfil') pantallaDentro();
    });
  }

  function preguntar(opciones) {
    var o = opciones || {};
    var campos = o.campos || [];
    return new Promise(function (resolver) {
      var viejo = document.querySelector('.ep-aviso-cap');
      if (viejo) viejo.remove();

      var cap = document.createElement('div');
      cap.className = 'ep-aviso-cap';
      cap.innerHTML =
        '<div class="ep-aviso-box ep-preg" role="dialog" aria-modal="true">' +
          '<div class="ep-preg-tit"></div>' +
          (o.texto ? '<p class="ep-aviso-txt ep-preg-sub"></p>' : '') +
          campos.map(function (c, i) {
            /* `tipo` para poder pedir una contrasena sin que se lea por encima
               del hombro. `autocomplete` le dice al celular que no la guarde
               como si fuera un nombre. */
            var tipo = c.tipo === 'password' ? 'password' : 'text';
            return '<label class="ep-campo"><span class="ep-lbl">' + esc(c.label || '') + '</span>' +
              '<input class="ep-in" id="pg-c' + i + '" type="' + tipo + '" ' +
              (tipo === 'password' ? 'autocomplete="new-password" ' : '') +
              'maxlength="' + (c.max || 160) + '" ' +
              'placeholder="' + esc(c.placeholder || '') + '" value="' + esc(c.valor || '') + '"></label>';
          }).join('') +
          /* Una salida distinta a "aceptar" o "cancelar" — hoy, "olvide mi
             contrasena". Va DEBAJO de los botones y como enlace, para que no
             compita con la accion principal. */
          (o.link ? '<button class="ep-link ep-preg-link" type="button">' + esc(o.link.texto) + '</button>' : '') +
          '<div class="ep-preg-btns">' +
            '<button class="ep-btn ep-btn--ghost ep-preg-no" type="button">' + esc(o.cancelar || 'Cancelar') + '</button>' +
            '<button class="ep-btn gold big ep-preg-si" type="button">' + esc(o.ok || 'Guardar') + '</button>' +
          '</div>' +
        '</div>';
      cap.querySelector('.ep-preg-tit').textContent = String(o.titulo || '');
      if (o.texto) cap.querySelector('.ep-preg-sub').textContent = String(o.texto);
      document.body.appendChild(cap);

      function cerrar(valor) {
        cap.remove();
        document.removeEventListener('keydown', porTecla);
        resolver(valor);
      }
      function aceptar() {
        if (!campos.length) return cerrar(true);
        var out = {};
        for (var i = 0; i < campos.length; i++) {
          var v = String((cap.querySelector('#pg-c' + i) || {}).value || '').trim();
          if (campos[i].minimo && v.length < campos[i].minimo) {
            var inp = cap.querySelector('#pg-c' + i);
            if (inp) { inp.classList.add('malo'); inp.focus(); }
            return;
          }
          out[campos[i].clave || ('c' + i)] = v;
        }
        cerrar(out);
      }
      function porTecla(e) {
        if (e.key === 'Escape') cerrar(null);
        if (e.key === 'Enter') { e.preventDefault(); aceptar(); }
      }
      if (o.link) {
        cap.querySelector('.ep-preg-link').addEventListener('click', function () {
          cerrar(null);
          o.link.al();
        });
      }
      cap.querySelector('.ep-preg-si').addEventListener('click', aceptar);
      cap.querySelector('.ep-preg-no').addEventListener('click', function () { cerrar(null); });
      cap.addEventListener('click', function (e) { if (e.target === cap) cerrar(null); });
      document.addEventListener('keydown', porTecla);
      setTimeout(function () {
        var primero = cap.querySelector('.ep-in') || cap.querySelector('.ep-preg-si');
        if (primero) primero.focus();
      }, 30);
    });
  }

  /* ── CAMBIAR EL NOMBRE Y LA CONTRASENA (20-ago, Sergio) ──────────────
     El nombre solo se ponia al registrarse: un error de dedo se quedaba para
     siempre, y ese nombre es el que sale en la comanda de la cocina. */
  async function cambiarNombre() {
    var c = S.cliente || {};
    var r = await preguntar({
      titulo: 'Tu nombre',
      texto: 'Es el que ve el restaurante en tu pedido.',
      ok: 'Guardar',
      campos: [
        { clave: 'nombre',   label: 'Nombre', valor: soloNombre(c),
          placeholder: 'Como quieres que te llamen', minimo: 2, max: 80 },
        { clave: 'apellido', label: 'Apellido', valor: c.apellido || '',
          placeholder: 'Tu apellido', max: 60 },
      ],
    });
    if (!r) return;
    try {
      var d = await fetch(ACCESO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'nombre', token: leerToken(),
                               nombre: r.nombre, apellido: r.apellido }),
      }).then(function (x) { return x.json(); });
      if (!d.ok) { aviso(d.mensaje || 'No se pudo guardar tu nombre.', 'mal'); return; }
      S.cliente = d.cliente || S.cliente;
      aviso('Listo, ahora te llamas ' + (S.cliente.nombre || r.nombre), 'bien');
      pantallaDentro();
    } catch (e) { aviso('No se pudo guardar tu nombre.', 'mal'); }
  }

  /* Se pide la contrasena ACTUAL aunque la sesion este abierta: un celular
     prestado no puede volverse "cambio la clave y se quedo con la cuenta", que
     ademas tiene saldo adentro. */
  async function cambiarClave() {
    var r = await preguntar({
      titulo: 'Cambiar tu contraseña',
      texto: 'Escribe la que usas hoy y la nueva.',
      ok: 'Cambiarla',
      campos: [
        { clave: 'actual', label: 'Tu contraseña de ahora', tipo: 'password', minimo: 1, max: 80 },
        { clave: 'nueva',  label: 'La nueva', tipo: 'password', minimo: 6, max: 80,
          placeholder: 'Mínimo 6 caracteres' },
      ],
      link: { texto: 'No la recuerdo', al: olvideClave },
    });
    if (!r) return;
    try {
      var d = await fetch(ACCESO, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'clave', token: leerToken(),
                               actual: r.actual, nueva: r.nueva }),
      }).then(function (x) { return x.json(); });
      if (!d.ok) { aviso(d.mensaje || 'No se pudo cambiar la contraseña.', 'mal'); return; }
      aviso('Tu contraseña quedó cambiada', 'bien');
    } catch (e) { aviso('No se pudo cambiar la contraseña.', 'mal'); }
  }

  /* ── "NO LA RECUERDO" (20-ago, Sergio) ───────────────────────────────
     Quien no se acuerda de su contrasena se quedaba encerrado: el unico camino
     para recuperarla estaba en la pantalla de ENTRAR, y a esa no llega quien ya
     tiene la sesion abierta. Tendria que cerrar sesion a proposito para poder
     recuperar su clave, que es justo lo que nadie se le ocurre.

     No se inventa nada nuevo: se reusa el MISMO camino de siempre —codigo al
     celular, verificar, escribir la clave nueva—, que ya se autocompleta solo
     en Android y en iPhone. Al terminar queda con sesion abierta y la clave
     cambiada, sin haber tenido que recordar la anterior. */
  async function olvideClave() {
    var c = S.cliente || {};
    var tel = String(c.telefono || '').replace(/[^0-9]/g, '').slice(-10);
    if (tel.length !== 10) {
      aviso('No tenemos tu celular guardado. Escríbenos y lo arreglamos.', 'mal');
      return;
    }
    S.tel = tel;
    await pedirCodigo(tel, 'Te mandamos un código a tu celular. Escríbelo y creas tu contraseña nueva, sin necesidad de la anterior.');
  }

  async function guardarFoto(archivo) {
    if (!archivo || !/^image\//.test(archivo.type)) { aviso('Escoge una imagen.', 'mal'); return; }
    var caja = document.querySelector('.ep-avatar-g');
    if (caja) caja.classList.add('cargando');
    try {
      var chica = await achicar(archivo, 256);
      var d = await fetch(SB_URL + '/functions/v1/web-acceso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'foto', token: leerToken(), foto: chica }),
      }).then(function (r) { return r.json(); });
      if (!d.ok) { aviso(d.mensaje || 'No se pudo guardar la foto.', 'mal'); return; }
      S.cliente.foto = d.foto;
      pantallaDentro();               // se ve al momento, en el perfil y arriba
    } catch (e) {
      /* El motivo, no un "algo fallo". Un mensaje generico aqui me costo dos
         vueltas: el error de verdad era que la funcion del servidor pedia una
         variable que no existia, y desde afuera se veia igual que una foto
         corrupta. Si no se dice que paso, no hay como arreglarlo. */
      console.error('[foto]', e);
      aviso('No se pudo guardar la foto.\n\n' + ((e && e.message) || e), 'mal');
    } finally {
      if (caja) caja.classList.remove('cargando');
    }
  }

  /* ── SUS DIRECCIONES ─────────────────────────────────────────────────
     La lista viene del servidor (pos_clientes.direcciones). Si un cliente
     todavía no tiene lista pero sí una dirección suelta —los que se
     registraron antes—, esa cuenta como su primera dirección: nadie tiene que
     volver a escribir lo que ya dio. */
  function dirsDe(c) {
    var lista = (c && c.direcciones) || [];
    if (!lista.length && c && c.direccion) return [{ id: 'actual', dir: c.direccion, barrio: c.barrio || '' }];
    return lista;
  }
  function normDirJS(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  async function guardarDireccion(dir, barrio) {
    var d = await acceso({ accion: 'direccion-agregar', token: leerToken(), direccion: dir, barrio: barrio });
    if (!d.ok) { aviso(d.mensaje || 'No pudimos guardar la dirección.', 'mal'); return false; }
    S.cliente = d.cliente;
    S.cuenta = null;                 // cambió la dirección: la cuenta se rehace

    /* EL DOMICILIO SE DICE AQUI (17-ago). Antes el cliente se enteraba del
       precio al final, armando ya el pedido. Ahora, al guardar la direccion:
       si reconocemos el barrio se le dice cuanto cuesta llegarle, y si no, se
       le dice la verdad — que se lo confirmamos — en vez de dejarlo creer que
       el domicilio es gratis porque salio en cero. */
    var dm = d.domicilio || null;
    if (dm && dm.conocido) {
      aviso('Listo. El domicilio a ' + esc(barrio || 'tu dirección') + ' cuesta ' + COP(dm.precio) + '.', 'bien');
    } else if (dm) {
      aviso('Dirección guardada. Te confirmamos el valor del domicilio antes de cobrarte.', 'bien');
    }
    return true;
  }
  async function quitarDireccion(id) {
    var d = await acceso({ accion: 'direccion-quitar', token: leerToken(), id: id });
    if (d.ok) { S.cliente = d.cliente; S.cuenta = null; pantallaDentro(); }
  }
  /* Pedir una dirección nueva. Se usa desde el perfil y desde el checkout: es
     la misma pregunta en los dos lados, así que es el mismo código. */
  /* Cuál está seleccionada en el checkout: la que el cliente escogió en esta
     visita; si no ha escogido, la que viene marcada como suya. */
  var dirSel = null;
  function dirElegida(lista, c) {
    return (dirSel && lista.filter(function (d) { return d.id === dirSel; })[0]) ||
           lista.filter(function (d) { return normDirJS(d.dir) === normDirJS(c && c.direccion); })[0] ||
           lista[0] || { id: '', dir: '', barrio: '' };
  }

  async function pedirDireccionNueva() {
    // Los dos datos en UNA sola hoja: dirección y barrio se piensan juntos.
    var r = await preguntar({
      titulo: 'Agregar dirección',
      texto: 'Para que no tengas que escribirla en cada pedido.',
      ok: 'Guardar',
      campos: [
        { clave: 'dir', label: 'Dirección', placeholder: 'Calle 5 # 10-20, apto 301', minimo: 5, max: 160 },
        { clave: 'barrio', label: 'Barrio', placeholder: 'Escríbelo como lo conoces', max: 60 },
      ],
    });
    if (!r) return false;
    var ok = await guardarDireccion(r.dir, r.barrio);
    if (ok) pantallaDentro();
    return ok;
  }

  /* EL NIVEL, CONTADO PARA QUE SE ENTIENDA Y MOTIVE (20-ago, Sergio).
     Antes decia "0% del camino a Premium": una cifra que ademas de no explicar
     nada, arranca desanimando a quien apenas empieza. Ahora el mensaje cambia
     segun lo lejos que este, y debajo se dice QUE GANA con el nivel — que era
     lo que faltaba para que la palabra "Estandar" significara algo.

     NUNCA se menciona el dinero gastado. Los niveles tienen dos escalas a
     proposito: el cliente ve la de experiencia y no puede deducir cuanto lleva
     gastado, porque verlo asusta en vez de premiar. Es decision de Sergio. */
  function bloqueNivel(n) {
    var prog = Number(n.progreso) || 0;
    var sig = n.siguiente ? esc(n.siguiente) : '';
    var frase;
    if (!n.siguiente)   frase = 'Estás en el nivel más alto. No hay uno mejor.';
    else if (prog >= 80) frase = '¡Ya casi eres cliente ' + sig + '!';
    else if (prog >= 50) frase = 'Ya pasaste la mitad del camino a cliente ' + sig;
    else if (prog > 0)   frase = 'Vas ' + prog + '% del camino a cliente ' + sig;
    else                 frase = 'Con tus pedidos vas subiendo a cliente ' + sig;

    /* Lo que gana de verdad con el nivel, con SU cifra: la manda el servidor
       con la ficha porque el bono depende del rango. Si no viene, no se promete
       nada — es mejor no decir el beneficio que decir uno que no es. */
    var g = reglaRecarga();
    var premio = g.porBloque
      ? '<div class="ep-nota" style="margin-top:10px">Por ser cliente ' + esc(n.nombre) +
        ', cada ' + COP(g.bloque) + ' que recargas te damos <b>' + COP(g.porBloque) +
        '</b> de regalo.' + (n.siguiente ? ' Al subir de nivel ese regalo crece.' : '') + '</div>'
      : '';

    return '<div class="ep-tile" style="margin-bottom:12px">' +
      '<div class="ep-tile-lbl">Tu nivel</div>' +
      '<div class="ep-tile-sub">' + frase + '</div>' +
      '<div class="ep-bar" style="margin-top:12px"><i style="width:' + prog +
        '%;background:' + esc(n.color || '#7C5CFF') + '"></i></div>' +
      premio +
    '</div>';
  }

  /* El nombre SIN el apellido. `nombre` guarda el completo —es lo que lee todo
     el sistema— y el apellido viene aparte; restarlo es mas seguro que partir
     por el primer espacio, que rompe los nombres compuestos. */
  function soloNombre(c) {
    var full = String((c && c.nombre) || '').trim();
    var ape  = String((c && c.apellido) || '').trim();
    if (!ape) return full;
    var fin = full.toLowerCase().lastIndexOf(ape.toLowerCase());
    if (fin > 0 && fin + ape.length === full.length) return full.slice(0, fin).trim();
    return full;
  }

  function cuerpoPerfil() {
    var c = S.cliente || {};
    var n = c.nivel || null;
    var tel = String(c.telefono || '');
    return encabezado('Perfil', 'Tu cuenta') +
      '<div class="ep-perfil-hd">' +
        /* LA CAMARITA SE FUE, Y AHORA HAY UN BOTON (23-ago-2026, Sergio:
           "no se entiende qué botón hay que tocar para cambiar la foto").
           Ese circulito dorado en la esquina de la foto se leia como una
           insignia de la foto, no como algo que se toca — y era la unica
           pista de que el circulo entero era el boton.
           El circulo SIGUE funcionando al tocarlo: quien ya le cogio el truco
           lo conserva, y sin la insignia ya no promete nada que confunda. */
        '<label class="ep-avatar-g ep-avatar-sub" title="Cambiar mi foto">' +
          (c.foto ? '<img src="' + esc(c.foto) + '" alt="">' : esc(iniciales(c.nombre))) +
          '<input type="file" id="pf-foto" accept="image/*" hidden>' +
        '</label>' +
        '<div class="ep-perfil-n">' + esc(c.nombre || '') + '</div>' +
        '<div class="ep-perfil-t">' + esc(tel.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')) + '</div>' +
        /* El chip y el boton comparten fila para no gastar una linea entera
           (idea de Sergio). Medido en 375px: ocupan 297 de 315 disponibles, y
           en una pantalla de 320px el boton se baja solo a la linea de abajo
           en vez de apretarse — de eso se encarga el flex-wrap. */
        '<div class="ep-perfil-fila">' +
          /* "Eres cliente Estandar" y no solo "Estandar" (20-ago, Sergio): la
             palabra sola no dice nada, y el cliente no tiene por que adivinar
             que es una categoria suya. */
          (n ? '<span class="ep-chip-rango" style="color:' + esc(n.color || '') + '">Eres cliente ' +
            esc(n.nombre) + '</span>' : '') +
          '<button class="ep-btn ep-btn--ghost ep-btn--foto" id="pf-foto-btn" type="button">' +
            ico('camara', 15) + (c.foto ? 'Cambiar mi foto' : 'Poner mi foto') +
          '</button>' +
        '</div>' +
      '</div>' +

      (n ? bloqueNivel(n) : '') +

      '<div class="ep-stats">' +
        '<div class="ep-stat"><div class="ep-stat-v">' + ((n && n.pedidos) || (c.pedidos || []).length) + '</div><div class="ep-stat-l">Pedidos</div></div>' +
        '<div class="ep-stat"><div class="ep-stat-v">' + (Number(c.puntos) || 0) + '</div><div class="ep-stat-l">Puntos</div></div>' +
        '<div class="ep-stat"><div class="ep-stat-v">' + COP(c.saldo) + '</div><div class="ep-stat-l">Saldo</div></div>' +
      '</div>' +

      /* SUS DIRECCIONES (16-ago). Antes solo se veía una, la última que había
         escrito. Quien pide desde la casa y desde la oficina las tenía que
         volver a teclear en cada pedido — y ahí es donde se equivoca. */
      '<div class="ep-tile" style="margin-top:12px">' +
        '<div class="ep-tile-lbl" style="margin-bottom:8px">Tus direcciones</div>' +
        (dirsDe(c).length
          ? dirsDe(c).map(function (d) {
              var usando = normDirJS(d.dir) === normDirJS(c.direccion);
              return '<div class="ep-dato ep-dir-fila">' +
                '<span>' + esc(d.dir) + (d.barrio ? ' <span style="opacity:.6">· ' + esc(d.barrio) + '</span>' : '') +
                  (usando ? ' <b style="color:var(--accent)">·  en uso</b>' : '') + '</span>' +
                '<button class="ep-link ep-dir-x" data-dirquitar="' + esc(d.id) + '" title="Quitar">Quitar</button>' +
              '</div>';
            }).join('')
          : '<div class="ep-dato"><span style="opacity:.7">Todavía no has guardado ninguna</span><span></span></div>') +
        '<button class="ep-btn ep-btn--ghost" style="margin-top:10px" data-diragregar="1">+ Agregar dirección</button>' +
      '</div>' +

      bloqueAvisos() +

      /* TU CUENTA (20-ago). Va despues de las direcciones y antes de cerrar
         sesion: son los datos que uno viene a tocar de vez en cuando, no en
         cada visita. */
      '<div class="ep-tile" style="margin-top:12px">' +
        '<div class="ep-tile-lbl" style="margin-bottom:8px">Tu cuenta</div>' +
        '<div class="ep-dato"><span>Nombre</span>' +
          '<button class="ep-link" data-editar="nombre">' + esc(soloNombre(c) || 'Ponerlo') + ' ·  cambiar</button></div>' +
        '<div class="ep-dato"><span>Apellido</span>' +
          '<button class="ep-link" data-editar="nombre">' + esc(c.apellido || 'Ponerlo') + ' ·  cambiar</button></div>' +
        '<div class="ep-dato"><span>Contraseña</span>' +
          '<button class="ep-link" data-editar="clave">Cambiarla</button></div>' +
      '</div>' +

      '<button class="ep-btn ep-btn--ghost" style="margin-top:16px" data-salir="1">Cerrar sesión</button>';
  }

  /* ── LOS AVISOS SE PUEDEN ENCENDER DESDE AQUI (19-ago) ────────────────
     Hasta hoy el permiso se ofrecia UNA sola vez, al principio y solo con la
     app instalada. Quien tocara "ahora no" —o quien nunca viera el ofrecimiento
     porque entro desde el navegador— no tenia NINGUNA forma de activarlos
     despues. Con los avisos del pedido ya funcionando, eso pasa de detalle a
     estorbo: es la funcion nueva y no habia como estrenarla.

     Cada caso dice la verdad de lo que pasa, que es lo unico util aqui: el
     navegador no deja volver a preguntar si ya dijeron que no. */
  function bloqueAvisos() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return '';
    var p = Notification.permission;
    var cuerpo;
    if (p === 'granted' && S.pushOk) {
      cuerpo = '<div class="ep-dato"><span>Avisos de tu pedido</span>' +
        '<span style="color:var(--ok-tx)">Encendidos</span></div>' +
        '<div class="ep-nota" style="margin-top:6px">Te avisamos cuando empecemos a prepararlo, ' +
        'cuando salga y cuando te lo entreguemos.</div>';
    } else if (p === 'granted') {
      /* PERMISO SI, REGISTRO NO. Es el caso de quien acepto los avisos antes de
         que existieran: el celular nunca quedo guardado en el servidor. Decir
         "Encendidos" aqui seria mentirle — no le va a llegar nada. */
      cuerpo = '<div class="ep-dato"><span>Avisos de tu pedido</span>' +
        '<span style="color:var(--oro-tx)">Falta terminar de activarlos</span></div>' +
        '<div class="ep-nota" style="margin-top:6px">Diste el permiso, pero este celular todavía ' +
        'no quedó registrado. Se arregla de un toque.</div>' +
        '<button class="ep-btn ep-btn--sec" style="margin-top:10px" id="pf-avisos">Terminar de activarlos</button>';
    } else if (p === 'denied') {
      /* No se puede resolver desde la pagina: el navegador lo bloqueo. Decirle
         "toca aqui para activarlos" seria mandarlo a un boton que no hace
         nada. */
      cuerpo = '<div class="ep-dato"><span>Avisos de tu pedido</span>' +
        '<span style="color:var(--dim)">Bloqueados</span></div>' +
        '<div class="ep-nota" style="margin-top:6px">Tu celular los tiene bloqueados para esta página. ' +
        'Se activan desde los ajustes del navegador, en los permisos de este sitio.</div>';
    } else if (!puedeAvisos()) {
      /* Solo en iPhone: ahi los avisos web no existen sin la app instalada, y
         ofrecer el boton seria ofrecer algo que va a fallar. En Android y en el
         computador esta rama ya no se toca. */
      cuerpo = '<div class="ep-dato"><span>Avisos de tu pedido</span>' +
        '<span style="color:var(--dim)">Falta instalar la app</span></div>' +
        '<div class="ep-nota" style="margin-top:6px">En iPhone los avisos solo funcionan con la página ' +
        'instalada en la pantalla de inicio. Es de un minuto.</div>' +
        '<button class="ep-btn ep-btn--sec" style="margin-top:10px" id="pf-instalar">Cómo instalarla</button>';
    } else {
      cuerpo = '<div class="ep-dato"><span>Avisos de tu pedido</span>' +
        '<span style="color:var(--dim)">Apagados</span></div>' +
        '<div class="ep-nota" style="margin-top:6px">Para saber cuándo lo estamos preparando, ' +
        'cuándo sale y cuándo llega.</div>' +
        '<button class="ep-btn ep-btn--sec" style="margin-top:10px" id="pf-avisos">Activar los avisos</button>';
    }
    return '<div class="ep-tile" style="margin-top:12px">' +
      '<div class="ep-tile-lbl">Notificaciones</div>' + cuerpo + '</div>';
  }

  // ── El local ────────────────────────────────────────────────────────
  /* Las promociones del inicio. Se piden aparte y NUNCA bloquean: si fallan,
     la pagina se ve igual sin ellas. Un banner no vale una pantalla en blanco. */
  async function cargarPromos() {
    try {
      var r = await S.sb.rpc('fn_web_promos', { p_slug: S.slug });
      S.promos = Array.isArray(r && r.data) ? r.data : [];
    } catch (e) { S.promos = []; }
  }

  /* El mensaje de la fila "Para hoy". Es lo único de muestra que queda: cuando
     Sergio decida qué dice, sale de la configuración del restaurante. */
  var BANNER_TEXTO = {
    titulo: 'Pide hoy y suma puntos',
    /* NO se dice cuántos puntos da cada peso. Los puntos y la barra de niveles
       son dos escalas distintas a propósito (regla de Sergio): contar la
       equivalencia convierte el premio en una cuenta de tienda. */
    sub: 'Cada pedido te acerca a tu próximo premio',
    boton: 'Ver la carta', ir_a: 'carta',
  };

  /* LOS TRES PLATOS DE LA FILA son productos de verdad.
     Mientras Sergio no elija cuáles van, se escogen solos con criterio de
     vitrina: el plato FUERTE de cada categoría (el de mayor precio con foto).
     Con el orden natural salía "Agua botella" de primera, que es lo último que
     uno quiere anunciar. Las bebidas y las adiciones no compiten. */
  function productosDelBanner() {
    var fuera = /bebida|adicion|adición|salsa|extra/i;
    var porCat = [];

    /* LOS QUE ELIGIÓ EL DUEÑO MANDAN (16-ago). Vienen como una lista de ids en
       orden desde la pantalla "Mi página web". Si eligió menos de tres, los
       puestos que falten se llenan solos como siempre — así la página nunca
       queda a medias por dejar un puesto sin escoger. */
    var pedidos = (S.negocio && S.negocio.destacados) || [];
    var elegidos = [], yaVan = {};
    if (pedidos.length) {
      pedidos.forEach(function (id) {
        (S.carta || []).forEach(function (c, ci) {
          (c.productos || []).forEach(function (p, pi) {
            if (String(p.id) === String(id) && !yaVan[id]) {
              yaVan[id] = 1;
              elegidos.push({ p: p, cat: c.categoria, precio: precioDesde(p), ci: ci, pi: pi });
            }
          });
        });
      });
      // Un producto que el dueño eligió y luego borró de la carta no aparece:
      // no se avisa aquí, se rellena y ya. El aviso va en la pantalla del dueño.
      if (elegidos.length >= 3) return elegidos.slice(0, 3);
    }

    (S.carta || []).forEach(function (c, ci) {
      if (fuera.test(c.categoria || '')) return;
      var conFoto = (c.productos || []).filter(function (p) { return p && p.foto; });
      if (!conFoto.length) return;
      var mejor = conFoto.slice().sort(function (a, b) { return precioDesde(b) - precioDesde(a); })[0];
      /* Se guarda DONDE quedó el plato en la carta, no solo el plato: el botón
         "Pedir" abre la misma hoja de siempre, y esa hoja se pide por posición. */
      porCat.push({ p: mejor, cat: c.categoria, precio: precioDesde(mejor),
                    ci: ci, pi: (c.productos || []).indexOf(mejor) });
    });
    porCat.sort(function (a, b) { return b.precio - a.precio; });
    // Los elegidos van primero; el resto de puestos se completa solo.
    var libres = porCat.filter(function (x) { return !yaVan[String(x.p.id)]; });
    return elegidos.concat(libres).slice(0, 3);
  }

  /* Precio "desde": con presentaciones, el más barato de todas; si no, el del
     producto. Decir "$28.000" cuando la personal vale menos sería mentir. */
  function precioDesde(p) {
    var pres = (p.presentaciones || []).map(function (x) { return Number(x.precio) || 0; })
      .filter(function (n) { return n > 0; });
    if (pres.length) return Math.min.apply(null, pres);
    var vars = [];
    (p.variables || []).forEach(function (g) {
      (g.opciones || []).forEach(function (o) {
        (o.precios || []).forEach(function (n) { if (Number(n) > 0) vars.push(Number(n)); });
        if (Number(o.precio) > 0) vars.push(Number(o.precio));
      });
    });
    if (vars.length) return Math.min.apply(null, vars);
    return Number(p.precio) || 0;
  }

  /* EL RANGO, EN LA CABECERA (16-ago). Antes ocupaba una tarjeta entera del
     resumen; como barra larga al lado del nombre dice lo mismo —en qué nivel
     va y cuánto le falta— y libera ese cuadro para la publicidad. */
  function rangoBarra(n) {
    if (!n) return '';
    var pct = Number(n.progreso) || 0;
    /* "Tu nivel" va ESCRITO, no solo en un tooltip: un `title` del navegador
       tarda en salir y en el celular no existe, así que el cliente nunca se
       enteraría de qué es esa barra. El hover solo confirma que se puede tocar. */
    return '<button class="ep-rangob" data-ir="puntos" title="Mira tus puntos y cómo subir de nivel">' +
      '<span class="ep-rangob-et">Tu nivel</span>' +
      '<span class="ep-rangob-nom" style="color:' + esc(n.color || '#e3b04b') + '">' +
        ico('estrella', 13) + ' ' + esc(n.nombre || '') + '</span>' +
      '<span class="ep-rangob-bar"><i style="width:' + pct + '%;background:linear-gradient(90deg,#8f2242,#e3b04b)"></i></span>' +
      '<span class="ep-rangob-fal">' + (n.siguiente ? pct + '% para ' + esc(n.siguiente) : 'Nivel más alto') + '</span>' +
      '<span class="ep-rangob-ir">Ver mis puntos ' + ico('flecha', 13) + '</span>' +
    '</button>';
  }

  /* LA PUBLICIDAD, EN EL CUADRO DEL RESUMEN. Una sola foto grande que va
     rotando entre las que el restaurante subió: se ve mucho mejor que tres
     miniaturas y no gasta más espacio de página. */
  function tarjetaPublicidad() {
    var fotos = (S.promos || []).filter(function (x) { return x && x.imagen; }).slice(0, 5);
    if (!fotos.length) {
      return '<div class="ep-pub vacio"><span>Aquí va tu publicidad</span>' +
        '<span class="ep-pub-hint">Súbela en Promociones</span></div>';
    }
    return '<div class="ep-pub" id="ep-pub">' +
      fotos.map(function (f, i) {
        var img = '<img src="' + esc(f.imagen) + '" alt="' + esc(f.titulo || 'Promoción') + '"' +
                  (i ? ' loading="lazy"' : '') + '>';
        return f.ir_a
          ? '<button class="ep-pub-foto' + (i ? '' : ' on') + '" data-ir="' + esc(f.ir_a) + '">' + img + '</button>'
          : '<div class="ep-pub-foto' + (i ? '' : ' on') + '">' + img + '</div>';
      }).join('') +
      (fotos.length > 1
        ? '<div class="ep-pub-pts">' + fotos.map(function (_, i) {
            return '<button class="ep-pub-pt' + (i ? '' : ' on') + '" data-pub="' + i + '" aria-label="Foto ' + (i + 1) + '"></button>';
          }).join('') + '</div>'
        : '') +
    '</div>';
  }

  /* LAS MEDALLAS (16-ago, pedido de Sergio). Cuatro, y cada una dice algo
     distinto — por eso son de colores distintos y no una sola etiqueta:

       Más pedido (dorada) · no se pone a mano: sale de las ventas de verdad
                             de los últimos 60 días, y solo si pasa de 10.
       Nuevo      (vino)   · la marca el dueño en el producto
       Para 2     (blanca) · la marca el dueño
       2x1        (verde)  · la marca el dueño

     Va UNA por tarjeta: la tarjeta es pequeña y dos medallas encima de la foto
     se pelean entre ellas y no se lee ninguna. Si el dueño puso una a mano,
     manda la suya — la dorada solo llena el hueco que él dejó. */
  /* AMPLIADAS (17-ago, escogidas por Sergio). El COLOR dice de que se trata
     antes de leer la palabra, por eso son cinco colores y no uno por medalla:
       oro    · lo mide el sistema, no se pone a mano
       vino   · lo que el dueNo destaca
       blanca · tamaNo
       verde  · ahorro
       naranja· urgencia, picante
     Se quito 2x1: Sergio no maneja esa promocion. */
  var MEDALLAS = {
    mas_pedido:  { t: 'Más pedido',  c: 'oro' },
    nuevo:       { t: 'Nuevo',       c: 'vino' },
    recomendado: { t: 'Recomendado', c: 'vino' },
    para2:       { t: 'Para 2',      c: 'blanca' },
    picante:     { t: 'Picante',     c: 'naranja' },
    dulce:       { t: 'Dulce',       c: 'blanca' },
    solo_hoy:    { t: 'Solo hoy',    c: 'naranja' },
    ahorras:     { t: 'Ahorras',     c: 'verde' },
  };
  function medalla(p) {
    var m = MEDALLAS[String((p && p.medalla) || '')];
    if (!m) return '';
    var txt = m.t;
    // "Ahorras" sin monto no dice nada: si no viene, no se promete nada.
    if (p.medalla === 'ahorras') {
      var v = Number(p.medalla_valor) || 0;
      if (!v) return '';
      txt = 'Ahorras ' + COP(v);
    }
    return '<span class="ep-med ep-med--' + m.c + '">' + esc(txt) + '</span>';
  }

  /* La fila de cuatro: el mensaje con sus botones y tres platos de la carta.
     Aquí terminó el texto que vivía en el banner — justo encima de lo que se
     quiere que pidan, que es donde un gancho de venta sirve. */
  /* Traduce lo que el dueNo eligio a estilo. Todo lo que no se entienda cae
     al fondo de siempre: la pagina nunca se rompe por una configuracion rara. */
  function fondoDelBanner() {
    var b = (S.negocio && S.negocio.banner) || null;
    if (!b || !b.tipo) return { style: '', velo: '' };
    if (b.tipo === 'color' && b.color) {
      return { style: 'background:' + esc(b.color), velo: '' };
    }
    if (b.tipo === 'degradado' && b.color) {
      var ang = Number(b.angulo);
      if (!isFinite(ang)) ang = 140;
      var c2 = b.color2 || b.color;
      return { style: 'background:linear-gradient(' + ang + 'deg,' + esc(b.color) + ' 0%,' + esc(c2) + ' 100%)', velo: '' };
    }
    if (b.tipo === 'imagen' && b.imagen) {
      /* El velo va como una capa aparte y no como parte del fondo: asi la foto
         puede moverse (cover/center) sin arrastrar el velo, y el texto —que va
         despues en el HTML— queda por encima de los dos. */
      var op = Number(b.velo);
      if (!isFinite(op) || op < 0 || op > 1) op = 0.55;
      return {
        style: 'background-image:url(' + esc(b.imagen) + ');background-size:cover;background-position:center',
        velo: '<span class="ep-hoy-velo-fondo" style="background:rgba(0,0,0,' + op.toFixed(2) + ')"></span>'
      };
    }
    return { style: '', velo: '' };
  }

  function filaDeHoy() {
    var b = BANNER_TEXTO;
    var platos = productosDelBanner().map(function (e) {
      var p = e.p, precio = precioDesde(p);
      /* Antes llevaba a la carta y ahí el cliente tenía que volver a buscar el
         plato que acababa de ver. Ahora abre ESE plato. La tarjeta entera es el
         botón: en el celular no hay "pasar el mouse" que valga, y obligar a
         apuntarle a un botón pequeño encima de una foto es peor que tocar donde
         sea. El "Pedir" del velo es para que en el computador se vea que la
         tarjeta hace algo. */
      return '<button class="ep-hoy-card" data-plato="' + e.ci + '|' + e.pi + '"' +
             ' aria-label="Pedir ' + esc(nombrePlato(p)) + '">' +
        '<span class="ep-hoy-foto"' + (p.foto ? ' style="background-image:url(' + esc(p.foto) + ')"' : '') + '>' +
          medalla(p) +
          '<span class="ep-hoy-velo"><span class="ep-hoy-pedir">Pedir</span></span>' +
        '</span>' +
        '<span class="ep-hoy-tx">' +
          '<span class="ep-hoy-nom">' + esc(nombrePlato(p)) + '</span>' +
          '<span class="ep-hoy-pre">' + (precio ? 'Desde ' + COP(precio) : esc(e.cat || '')) + '</span>' +
        '</span>' +
      '</button>';
    }).join('');
    if (!platos) return '';
    /* EL FONDO DEL MENSAJE lo elige el dueNo desde "Mi pagina web": un color,
       un degradado, o su propia foto. Con foto va SIEMPRE un velo oscuro
       encima, porque el texto es blanco y sobre una imagen clara desaparece —
       el velo no es decoracion, es lo que deja leer. Sin nada configurado
       queda el vino tinto de siempre, que vive en el CSS. */
    var fondo = fondoDelBanner();
    return '<div class="ep-hoy">' +
      '<div class="ep-hoy-msg"' + (fondo.style ? ' style="' + fondo.style + '"' : '') + '>' +
        fondo.velo +
        '<div><div class="ep-hoy-t">' + esc(b.titulo) + '</div>' +
          (b.sub ? '<div class="ep-hoy-s">' + esc(b.sub) + '</div>' : '') + '</div>' +
        '<div class="ep-hoy-btns">' +
          '<button class="ep-hoy-b1" data-ir="' + esc(b.ir_a) + '">' + esc(b.boton) + '</button>' +
          '<button class="ep-hoy-b2" data-ir="puntos">Mis puntos</button>' +
        '</div>' +
      '</div>' + platos +
    '</div>';
  }

  /* EL PEDIDO EN CURSO, TAMBIEN EN EL INICIO. El boton de la cabecera es
     chiquito; esta tarjeta dice en que va sin tener que entrar. Solo aparece
     mientras el pedido esta vivo. */
  function tarjetaPedidoVivo() {
    var p = S.pedidoVivo;
    if (!p) return '';
    var domi = p.canal === 'domicilio';
    var pasos = domi ? PASOS_DOMI : PASOS_RECOGER;
    var i = !p.pagado ? -1 : indiceDe(pasos, p.estado);
    var titulo = !p.pagado ? 'Tu pedido espera el pago'
      : (pasos[i] ? pasos[i].t : 'Tu pedido va en camino');
    var desde = p.pagado ? horaCorta(p.estado_at) : horaCorta(p.creado);
    return '<button class="ep-vivo" data-ir="seguir">' +
        '<span class="ep-vivo-ico">' + ico('bolsa', 17) + '</span>' +
        '<span class="ep-vivo-tx">' +
          '<span class="ep-vivo-t">' + esc(titulo) + '</span>' +
          '<span class="ep-vivo-s">' + (desde ? 'desde las ' + desde : 'toca para ver el detalle') + '</span>' +
        '</span>' +
        '<span class="ep-vivo-fl">›</span>' +
      '</button>';
  }

  /* LA PUBLICIDAD ROTA SOLA. Se llama después de pintar. Las fotos están
     apiladas y se cambia cuál se ve: con una sola tarjeta no hay scroll que
     valga, y así el cambio es suave y no salta.

     Se detiene si la pestaña no se ve y si el cliente toca un punto: nada más
     molesto que una foto que cambia justo cuando la ibas a mirar. */
  var pubReloj = null;
  function armarBanner() {
    if (pubReloj) { clearInterval(pubReloj); pubReloj = null; }
    var caja = document.getElementById('ep-pub');
    if (!caja) return;
    var fotos = caja.querySelectorAll('.ep-pub-foto');
    var puntos = caja.querySelectorAll('.ep-pub-pt');

    /* EL BANNER TIENE UN SOLO TAMAÑO (19-ago, correccion de Sergio).

       Antes el cuadro tomaba la forma de CADA foto al pasar: si el dueNo subia
       una mas alta, el banner crecia y encogia solo mientras rotaba, y toda la
       pagina brincaba con el. Verlo moverse solo es peor que cualquier franja.

       Ahora manda la PRIMERA foto y las demas se acomodan a ese cuadro. Se
       mide una sola vez, al cargar, y no se vuelve a tocar. Con `contain` las
       que tengan otra forma entran completas —no se recorta el arte, que era
       justo lo que se queria evitar— aunque les queden franjas a los lados.
       La respuesta de fondo es subirlas todas del mismo tamaNo, y eso ya se
       dice en la pantalla de configuracion. */
    function fijarForma() {
      var im = fotos[0] && fotos[0].querySelector('img');
      if (!im || !im.naturalWidth || !im.naturalHeight) return;
      caja.style.setProperty('--pub-ar', (im.naturalWidth / im.naturalHeight).toFixed(4));
    }
    var prim = fotos[0] && fotos[0].querySelector('img');
    if (prim) {
      if (prim.complete) fijarForma();
      else prim.addEventListener('load', fijarForma, { once: true });
    }

    if (fotos.length < 2) return;

    var i = 0;
    function mostrar(k) {
      i = (k + fotos.length) % fotos.length;
      fotos.forEach(function (f, n) { f.classList.toggle('on', n === i); });
      puntos.forEach(function (p, n) { p.classList.toggle('on', n === i); });
    }
    puntos.forEach(function (p) {
      p.addEventListener('click', function (ev) {
        ev.stopPropagation();
        mostrar(Number(p.dataset.pub) || 0);
        arrancar();
      });
    });
    function arrancar() {
      if (pubReloj) clearInterval(pubReloj);
      pubReloj = setInterval(function () {
        if (document.hidden || !document.getElementById('ep-pub')) return;
        mostrar(i + 1);
      }, 6000);
    }
    arrancar();
  }

  function cuerpoLocal() {
    var e = S.negocio || {};
    var h = S.horarios || null;
    var dias = [['lunes','Lunes'],['martes','Martes'],['miercoles','Miércoles'],['jueves','Jueves'],
                ['viernes','Viernes'],['sabado','Sábado'],['domingo','Domingo']];
    /* En Colombia nadie dice "cierro a las 22:30": dice "a las 10:30 de la
       noche". El horario se guarda en 24 h y se muestra en 12 h. */
    function h12(t) {
      var m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
      if (!m) return String(t || '');
      var hh = Number(m[1]), am = hh < 12;
      var h = hh % 12; if (h === 0) h = 12;
      return h + ':' + m[2] + ' ' + (am ? 'a.m.' : 'p.m.');
    }
    var filas = h ? dias.map(function (d) {
      var x = h[d[0]] || {};
      return '<div class="ep-dato"><span>' + d[1] + '</span><span>' +
        (x.activo ? esc(h12(x.abre) + ' – ' + h12(x.cierra)) : 'Cerrado') + '</span></div>';
    }).join('') : '';

    /* DÓNDE QUEDA. Es lo primero que busca quien va a recoger, y tenerlo solo
       en el chat obliga a preguntar.

       Va el mapa de verdad, no solo un enlace: una dirección escrita en una
       ciudad que uno no conoce no dice nada, y un enlace obliga a salirse de la
       página para saber si queda cerca o lejos. El mapa incrustado de Google no
       necesita llave ni cuenta.

       Para buscar se manda dirección + ciudad + país: "Carrera 9 b # 63 n 58"
       a secas existe en media Colombia. */
    var dir = String(e.direccion || '').trim();
    var donde = [dir, e.ciudad, e.pais].filter(Boolean).join(', ');
    var ubic = dir
      ? '<div class="ep-tile" style="margin-bottom:12px">' +
          '<div class="ep-tile-lbl" style="margin-bottom:8px">Dónde estamos</div>' +
          '<div class="ep-dato"><span>Dirección</span><span>' + esc(dir) + '</span></div>' +
          (e.ciudad ? '<div class="ep-dato"><span>Ciudad</span><span>' + esc(e.ciudad) + '</span></div>' : '') +
          '<div class="ep-mapa"><iframe src="https://maps.google.com/maps?q=' +
            encodeURIComponent(donde) + '&z=16&output=embed" loading="lazy" ' +
            'title="Mapa de dónde queda el restaurante" referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
          /* "Cómo llegar" y no "Ver en el mapa": el mapa ya está a la vista, lo
             que falta es la ruta desde donde esté el cliente. */
          '<a class="ep-btn ep-btn--ghost" style="margin-top:10px;display:block;text-align:center" ' +
            'target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' +
            encodeURIComponent(donde) + '">Cómo llegar</a>' +
        '</div>'
      : '';

    return encabezado('El local', esc(e.nombre || '')) +
      '<div class="ep-tile" style="margin-bottom:12px">' +
        '<div class="ep-tile-lbl">Ahora mismo</div>' +
        '<div class="ep-estado' + (e.abierto ? ' abierto' : '') + '" style="margin-top:10px">' +
          '<span class="ep-punto"></span>' +
          /* El servidor a veces ya manda la frase en 12 horas ("Abre hoy a las
             6:30 p.m."). Convertirla otra vez producía "6:30 a.m. p.m.": el
             "6:30" se traducía solo y el "p.m." original quedaba pegado atrás.
             Si la frase ya trae a.m. o p.m., se deja como viene. */
          esc(/[ap]\.?\s?m\.?/i.test(String(e.detalle || ''))
            ? String(e.detalle)
            : String(e.detalle || (e.abierto ? 'Abierto' : 'Cerrado'))
                .replace(/(\d{1,2}):(\d{2})/g, function (_, hh, mm) { return h12(hh + ':' + mm); })) + '</div>' +
      '</div>' +
      ubic +
      (filas ? '<div class="ep-tile"><div class="ep-tile-lbl" style="margin-bottom:4px">Horarios</div>' + filas + '</div>'
             : '<div class="ep-aviso">El restaurante todavía no ha publicado sus horarios.</div>');
  }

  /* ══ EL PEDIDO EN CURSO ═══════════════════════════════════════════════
     Aprobado por Sergio el 19-ago. Cuatro pasos que se adaptan a si es
     domicilio o para recoger, con la hora de lo que YA paso — nunca una hora
     futura prometida. Los estados no se inventan: son los que el POS ya
     escribe (`en_preparacion`, `listo`, `en_camino`, `entregado`). */
  var relojPedido = null;

  async function cargarPedidoVivo() {
    var t = leerToken();
    if (!t) { S.pedidoVivo = null; return; }
    try {
      var r = await fetch(SB_URL + '/functions/v1/web-acceso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'pedido-activo', token: t }),
      }).then(function (x) { return x.json(); });
      S.pedidoVivo = (r && r.ok) ? (r.pedido || null) : null;
    } catch (e) { /* sin conexion se deja lo que ya se tenia */ }
  }

  /* Se refresca sola cada 20 segundos mientras la pantalla esta abierta, y al
     volver a la app. Es mas barato que mantener una conexion viva y el cliente
     no nota la diferencia. El reloj se apaga al salir: dejarlo corriendo seria
     gastarle bateria a alguien que ya se fue. */
  function relojSeguir(encender) {
    if (relojPedido) { clearInterval(relojPedido); relojPedido = null; }
    if (!encender) return;
    relojPedido = setInterval(async function () {
      if (document.hidden || vista !== 'seguir') return;
      var antes = S.pedidoVivo && S.pedidoVivo.estado;
      await cargarPedidoVivo();
      if (!S.pedidoVivo || S.pedidoVivo.estado !== antes) pantallaDentro();
    }, 20000);
  }

  var PASOS_DOMI = [
    { k: 'confirmado',     t: 'Pedido confirmado' },
    { k: 'en_preparacion', t: 'En preparación' },
    { k: 'en_camino',      t: 'En camino' },
    { k: 'entregado',      t: 'Entregado' }
  ];
  var PASOS_RECOGER = [
    { k: 'confirmado',     t: 'Pedido confirmado' },
    { k: 'en_preparacion', t: 'En preparación' },
    { k: 'listo',          t: 'Listo para recoger' },
    { k: 'entregado',      t: 'Entregado' }
  ];

  function horaCorta(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      /* Una fecha invalida NO lanza error: devuelve el texto "Invalid Date", y
         eso terminaba impreso en la pantalla del cliente. Se comprueba. */
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    } catch (e) { return ''; }
  }

  function indiceDe(pasos, estado) {
    if (!estado) return 0;
    for (var i = 0; i < pasos.length; i++) if (pasos[i].k === estado) return i;
    /* Un estado que no esta en la lista (por ejemplo `listo` en un domicilio)
       no puede tumbar la pantalla: se queda en preparacion, que es el ultimo
       punto seguro. */
    return 1;
  }

  /* El numero del restaurante, en formato para WhatsApp: solo digitos. */
  function telefonoNegocio() {
    var t = (S.negocio && S.negocio.telefono) ? String(S.negocio.telefono) : '';
    t = t.replace(/[^0-9]/g, '');
    if (!t) return '';
    /* Un numero colombiano sin indicativo no abre el chat correcto. */
    if (t.length === 10) t = '57' + t;
    return t;
  }

  function cuerpoSeguir() {
    var p = S.pedidoVivo;
    if (!p) {
      return '<div class="ep-vacio" style="margin-top:30px">No tienes ningún pedido en curso.' +
        '<div style="margin-top:12px"><button class="ep-btn gold" data-ir="carta">Ver la carta</button></div></div>';
    }
    var domi = p.canal === 'domicilio';
    var pasos = domi ? PASOS_DOMI : PASOS_RECOGER;
    /* En que paso va. Sin pagar todavia, el primero es el pago: es lo que
       falta y lo que el cliente puede resolver ahi mismo. */
    var actual = !p.pagado ? -1 : Math.max(0, indiceDe(pasos, p.estado));

    var lista = pasos.map(function (x, i) {
      var hecho = actual > i, ahora = actual === i;
      var clase = hecho ? 'hecho' : (ahora ? 'ahora' : 'futuro');
      /* La hora solo se sabe con certeza para el paso en el que esta (el POS
         guarda `estado_at`, que es CUANDO entro al actual) y para la creacion
         del pedido. Inventar las intermedias seria mentir con precision. */
      var h = i === 0 ? horaCorta(p.creado) : (ahora ? horaCorta(p.estado_at) : '');
      return '<li class="ep-paso ' + clase + '">' +
        '<span class="ep-bolita">' + (hecho ? '✓' : (ahora ? '•' : '')) + '</span>' +
        '<div><div class="ep-paso-t">' + esc(x.t) + '</div>' +
          (h ? '<div class="ep-paso-h">' + h + '</div>' : '') + '</div></li>';
    }).join('');

    /* El total del pedido no siempre trae el domicilio sumado (depende de por
       donde se creo), asi que se toma el mayor entre lo guardado y la suma de
       las partes: cobrarle de menos en la pantalla confunde al que ya pago. */
    var total = Math.max(Number(p.total) || 0,
      (Number(p.subtotal) || 0) + (Number(p.empaque) || 0) + (Number(p.domicilio) || 0));

    var items = (p.items || []).map(function (i) {
      return '<div class="ep-dato"><span>' + i.cantidad + '× ' + esc(i.nombre) + '</span>' +
        '<span>' + COP(i.precio * i.cantidad) + '</span></div>';
    }).join('');

    return '<div class="ep-seguir">' +
      '<div class="ep-sec-hd" style="margin-bottom:4px"><div>' +
        '<div class="ep-sec-t">Mi pedido</div>' +
        '<div class="ep-sec-s">' + (domi
          ? 'A domicilio' + (p.direccion ? ' · ' + esc(p.direccion) : '')
          : 'Para recoger en el local') + '</div></div>' +
        '<div class="ep-hd-der"><span class="ep-chip-rango">#' + esc(p.corto || '') + '</span></div>' +
      '</div>' +

      (!p.pagado
        /* EL BOTON DE PAGAR TENIA QUE ESTAR AQUI (19-ago). Estaba escrito y lo
           quite antes de subirlo porque llevaba a una pantalla vacia: la de
           pago se arma con el pedido que se acaba de crear, y quien vuelve al
           dia siguiente ya no lo tiene en memoria. Quitarlo dejo el problema
           peor de lo que estaba: la pantalla decia "falta que pagues" y no
           daba ninguna forma de pagar.
           Ahora el pedido se reconstruye con lo que devuelve el seguimiento
           mas los datos de pago del restaurante, y la pantalla de pago se abre
           igual que si lo acabara de hacer. */
        ? '<div class="ep-tile ep-falta" style="border-color:var(--accent)">' +
            '<div class="ep-tile-lbl" style="color:var(--oro-tx)">Falta que pagues</div>' +
            '<div class="ep-nota" style="margin-top:4px">Tu pedido está guardado. Apenas confirmemos el pago arrancamos.</div>' +
            '<button class="ep-btn gold big" style="margin-top:14px" id="sg-pagar">Pagar ahora · ' + COP(total) + '</button>' +
          '</div>'
        : '') +

      '<div class="ep-tile"><ul class="ep-pasos">' + lista + '</ul></div>' +

      '<div class="ep-tile">' +
        '<div class="ep-tile-lbl">Lo que pediste</div>' +
        '<div style="margin-top:6px">' + items +
          (Number(p.domicilio) > 0
            ? '<div class="ep-dato"><span>Domicilio</span><span>' + COP(p.domicilio) + '</span></div>'
            : (domi ? '<div class="ep-dato"><span>Domicilio</span><span style="color:var(--oro-tx)">lo pagas al recibir</span></div>' : '')) +
          '<div class="ep-total-fila grande"><span>' + (domi && !Number(p.domicilio) ? 'Pagaste' : 'Total') + '</span><b>' + COP(total) + '</b></div>' +
        '</div>' +
      '</div>' +

      /* ESCRIBIRLE AL RESTAURANTE va al numero que el dueNo configuro en su
         sucursal, con el pedido citado para que no tenga que explicar cual es.
         Si no hay numero configurado el boton no existe: mandar a un WhatsApp
         vacio es peor que no ofrecerlo. */
      (telefonoNegocio()
        ? '<a class="ep-btn ep-btn--sec" style="margin-top:14px" target="_blank" rel="noopener"' +
          ' href="https://wa.me/' + esc(telefonoNegocio()) +
          '?text=' + encodeURIComponent('Hola, es sobre mi pedido #' + (p.corto || '')) + '">' +
          '💬 Escribirle al restaurante</a>'
        : '') +
      '<button class="ep-btn ep-btn--ghost" style="margin-top:10px" data-ir="inicio">Volver al inicio</button>' +
    '</div>';
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
  /* LO QUE SE AHORRA EN TODO EL PEDIDO. Suma solo las lineas de combo; si no
     hay ninguna, da 0 y la cuenta no dice nada — anunciar "ahorras $0" es
     peor que no decir nada. */
  /* ══ COMO SE LLAMA EL PLATO ═══════════════════════════════════════════════
     Un producto puede llamarse solo "SENCILLA" o "CARNE": la palabra que dice
     que es ("Hamburguesa", "Perro", "Sandwich") vive en la CATEGORIA, en su
     nombre en comanda. El POS manual la antepone siempre; la pagina no la
     tenia, asi que el cliente veia "CARNE" en su resumen y en su historial sin
     saber si era una hamburguesa, un perro o un sandwich — y hay uno de cada
     uno con ese mismo nombre.

     La regla es la del POS (tomar-pedido.js): manda el tamaNo si lo eligio; si
     no, la etiqueta de la categoria. Despues el producto, despues las
     variantes. En la carta NO se usa: ahi cada plato va bajo el titulo de su
     categoria y "Hamburguesa · SENCILLA" debajo de "HAMBURGUESAS" sobra. */
  function nombrePlato(p, presentacion, variantes) {
    var etiqueta = presentacion || (p && p.etiqueta) || '';
    var partes = [etiqueta, (p && (p.nombre || p.name)) || ''];
    if (variantes && variantes.length) partes = partes.concat(variantes);
    return partes.filter(Boolean).join(' · ');
  }
  /* Lo mismo para una linea del carrito, que ya trae todo resuelto. */
  function nombreLinea(l) {
    return [l.presentacion || l.etiqueta || '', l.nombre]
      .concat(l.variantes || []).filter(Boolean).join(' · ');
  }

  function carroAhorro() {
    var t = 0;
    for (var i = 0; i < carro.length; i++) t += (Number(carro[i].ahorro) || 0) * carro[i].cantidad;
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
    /* La primera opción viene elegida: obliga a menos toques y nunca deja un
       producto a medio configurar si el cliente le da directo a Agregar. */
    var vars0 = {};
    (p.variables || []).forEach(function (g, i) { if ((g.opciones || []).length) vars0[i] = 0; });
    sheet = { p: p, talla: 0, cant: 1, nota: '', vars: vars0, mods: {}, modsAbiertos: {}, paso: 0 };
    pintarSheet();
  }

  /* El precio manda la VARIANTE cuando hay una elegida: una Premium Mixta
     personal cuesta lo suyo, no lo que costaría la Premium "a secas". Cada
     opción trae 'precios' con un valor por presentación, en el mismo orden que
     los tamaños; si no los trae, se usa su precio suelto. */
  function precioDe(p, talla, vars) {
    var grupos = p.variables || [];
    var elegidas = vars || {};
    for (var g = 0; g < grupos.length; g++) {
      var op = (grupos[g].opciones || [])[elegidas[g]];
      if (!op) continue;
      var pr = op.precios || [];
      var v = (pr.length > talla) ? Number(pr[talla]) : Number(op.precio);
      if (v > 0) return v;
    }
    var pres = p.presentaciones || [];
    if (pres.length) return Number(pres[talla] && pres[talla].precio) || Number(p.precio) || 0;
    return Number(p.precio) || 0;
  }

  /* Lo que suman las adiciones elegidas. Van aparte del precio base porque se
     SUMAN: una salchipapa con carne extra es la salchipapa MÁS la carne, no
     otra cosa distinta. */
  /* `talla` entra aquí a propósito: aunque al cambiar de tamaño se sueltan las
     adiciones del anterior, el precio y lo que viaja a la cocina no dependen de
     que esa limpieza haya corrido. Un extra de otro tamaño es plata mal cobrada. */
  function extrasDe(p, mods, talla) {
    var grupos = p.modificadores || [], elegidos = mods || {}, total = 0;
    grupos.forEach(function (g, gi) {
      if (talla != null && !modAplica(p, g, talla)) return;
      (elegidos[gi] || []).forEach(function (oi) {
        var o = (g.opciones || [])[oi];
        if (o) total += Number(o.precio) || 0;
      });
    });
    return total;
  }

  function nombresExtras(p, mods, talla) {
    var grupos = p.modificadores || [], elegidos = mods || {}, out = [];
    grupos.forEach(function (g, gi) {
      if (talla != null && !modAplica(p, g, talla)) return;
      var cuenta = {};
      (elegidos[gi] || []).forEach(function (oi) { cuenta[oi] = (cuenta[oi] || 0) + 1; });
      Object.keys(cuenta).forEach(function (oi) {
        var o = (g.opciones || [])[Number(oi)];
        // "Carne ×2" y no "Carne, Carne": es lo que la cocina necesita leer.
        if (o && o.nombre) out.push(String(o.nombre) + (cuenta[oi] > 1 ? ' ×' + cuenta[oi] : ''));
      });
    });
    return out;
  }

  /* Qué eligió, en palabras: "Mixta · Personal". Es lo que ve el cliente en el
     carrito y lo que llega a la cocina. */
  function variantesDe(p, vars) {
    var grupos = p.variables || [], elegidas = vars || {}, out = [];
    for (var g = 0; g < grupos.length; g++) {
      var op = (grupos[g].opciones || [])[elegidas[g]];
      if (op && op.nombre) out.push(String(op.nombre));
    }
    return out;
  }

  /* ¿Este grupo de adiciones es el del tamaño elegido? (16-ago)
     Cada grupo trae `pres` con los tamaños a los que pertenece. Una Premium
     Familiar ofrecía "Adiciones Personales" —el grupo del otro tamaño, con
     otros precios— porque aquí se mostraban TODOS. Sin `pres` (grupo común, o
     producto de un solo tamaño) aplica siempre: así nada desaparece por una
     configuración incompleta. */
  function modAplica(p, g, talla) {
    var suyas = (g && g.pres) || [];
    if (!suyas.length) return true;
    var pres = (p.presentaciones || [])[talla] || {};
    if (!pres.id) return true;
    return suyas.indexOf(pres.id) >= 0;
  }

  /* Los pasos de este producto: el tamaño (si tiene más de uno) y un paso por
     cada grupo de variantes. Un producto simple no tiene ninguno y se agrega de
     una. Los índices `gi` son los del producto COMPLETO (no los de esta lista):
     con ellos se guarda lo elegido en sheet.mods y los lee todo lo demás. */
  function pasosDe(p, talla) {
    var out = [];
    if ((p.presentaciones || []).length > 1) out.push({ tipo: 'pres', titulo: 'Tamaño' });
    (p.variables || []).forEach(function (g, i) {
      if ((g.opciones || []).length) out.push({ tipo: 'var', gi: i, titulo: g.nombre || 'Elige' });
    });
    (p.modificadores || []).forEach(function (g, i) {
      if ((g.opciones || []).length && modAplica(p, g, talla)) {
        out.push({ tipo: 'mod', gi: i, titulo: g.nombre || 'Adiciones' });
      }
    });
    return out;
  }

  /* Al cambiar de tamaño, lo elegido en las adiciones del tamaño ANTERIOR se
     suelta: si no, seguiría sumando al total y viajando a la cocina un extra
     que ya no existe para ese plato. */
  function soltarModsDeOtroTamano(p, mods, talla) {
    var limpio = {};
    (p.modificadores || []).forEach(function (g, i) {
      if (mods[i] && modAplica(p, g, talla)) limpio[i] = mods[i];
    });
    return limpio;
  }

  function pintarSheet() {
    var existente = document.querySelector('.ep-scrim');
    if (!sheet) { if (existente) existente.remove(); return; }
    var p = sheet.p;
    var pres = p.presentaciones || [];
    var pasos = pasosDe(p, sheet.talla);
    var paso = pasos[sheet.paso] || null;
    var ultimo = sheet.paso >= pasos.length - 1;

    /* Un solo grupo de botones a la vez: el del paso en el que va. Los precios
       en cero no se pintan — en varios productos el tamaño no lleva precio y
       un "$0" solo confunde. */
    var opciones = '';
    if (paso && paso.tipo === 'pres') {
      opciones = '<div class="ep-tallas">' + pres.map(function (x, i) {
        var v = Number(x.precio) || 0;
        return '<button class="ep-talla' + (i === sheet.talla ? ' on' : '') + '" data-talla="' + i + '">' +
          esc(x.nombre) + (v > 0 ? '<span>' + COP(v) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    } else if (paso && paso.tipo === 'mod') {
      var gm = (p.modificadores || [])[paso.gi] || {};
      var sel = sheet.mods[paso.gi] || [];
      /* La lista NO se abre sola. Soltarle veinte adiciones a alguien que solo
         quiere su salchipapa lo abruma y alarga el pedido. Primero se le
         pregunta; el que quiera, entra. El que no, sigue derecho. */
      if (!sheet.modsAbiertos[paso.gi] && !sel.length) {
        opciones = '<button class="ep-mod-invita" data-abrir="' + paso.gi + '">' +
          '<span class="ep-mod-mas">+</span>' +
          '<span><b>' + esc(gm.nombre || 'Adiciones') + '</b>' +
          '<small>Toca si quieres agregar algo</small></span></button>';
      } else {
      opciones = '<div class="ep-tallas">' + (gm.opciones || []).map(function (o, oi) {
        var v = Number(o.precio) || 0;
        /* Cuántas veces la eligió. Doble carne es una peticion normal, y antes
           no habia forma de pedirla: la adicion solo se marcaba o no. */
        var n = sel.filter(function (x) { return x === oi; }).length;
        /* Cuando ya eligio alguna, aparece un contador de verdad: menos, la
           cantidad, y mas. Antes solo estaba el menos y tocar el nombre sumaba,
           pero eso no se le ocurre a nadie: no habia nada que lo invitara. */
        return '<div class="ep-mod-fila">' +
          '<button class="ep-talla' + (n ? ' on' : '') + '" ' +
            'data-mod="' + paso.gi + '" data-opcion="' + oi + '">' + esc(o.nombre) +
            (v > 0 ? '<span>+' + COP(v * (n || 1)) + '</span>' : '') + '</button>' +
          (n ? '<div class="ep-cant ep-cant--mod">' +
                 '<button data-menos="' + paso.gi + '" data-opcion="' + oi + '">−</button>' +
                 '<b>' + n + '</b>' +
                 '<button data-mod="' + paso.gi + '" data-opcion="' + oi + '">+</button>' +
               '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
      }
    } else if (paso && paso.tipo === 'var') {
      var g = (p.variables || [])[paso.gi] || {};
      opciones = '<div class="ep-tallas">' + (g.opciones || []).map(function (o, oi) {
        var pr = o.precios || [];
        var v = (pr.length > sheet.talla) ? Number(pr[sheet.talla]) : Number(o.precio);
        return '<button class="ep-talla' + (sheet.vars[paso.gi] === oi ? ' on' : '') + '" ' +
          'data-grupo="' + paso.gi + '" data-opcion="' + oi + '">' + esc(o.nombre) +
          (v > 0 ? '<span>' + COP(v) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }

    /* El paso se dice con palabras, no solo con números: "Tamaño" o "Tipo" es
       lo que el cliente está eligiendo, y el "1 de 2" le dice cuánto falta. */
    /* En las adiciones se dice que son opcionales: si no, el cliente cree que
       tiene que elegir algo para poder seguir. */
    var extraGuia = (paso && paso.tipo === 'mod' && (sheet.modsAbiertos[paso.gi] || (sheet.mods[paso.gi] || []).length))
      ? ' <span class="ep-paso-op">· opcional, puedes elegir varias</span>' : '';
    var guia = pasos.length > 1
      ? '<div class="ep-paso-g">Paso ' + (sheet.paso + 1) + ' de ' + pasos.length +
        ' · <b>' + esc(paso ? paso.titulo : '') + '</b>' + extraGuia + '</div>'
      : (paso ? '<div class="ep-paso-g"><b>' + esc(paso.titulo) + '</b></div>' : '');

    var precioAhora = precioDe(p, sheet.talla, sheet.vars) + extrasDe(p, sheet.mods, sheet.talla);
    /* El contador va en TODOS los pasos, desde el primero. Decidir cuantas
       quiero es lo primero que uno piensa —"tres personales de pollo"— y
       tenerlo solo al final obligaba a configurar el producto sin saber que iba
       a poder pedir varios. */
    var contador = '<div class="ep-cant">' +
        '<button data-cant="-1"' + (sheet.cant <= 1 ? ' disabled' : '') + '>−</button>' +
        '<b>' + sheet.cant + '</b>' +
        '<button data-cant="1">+</button>' +
      '</div>';
    var pie = '<div class="ep-sheet-pie">' + contador +
      (ultimo
        ? '<button class="ep-btn ep-btn--main" id="sh-add">Agregar · ' +
            COP(precioAhora * sheet.cant) + '</button>'
        : '<button class="ep-btn ep-btn--main" id="sh-next">Siguiente</button>') +
    '</div>';

    /* La nota va solo en el último paso: pedirla antes estorba, y el cliente
       todavía no sabe qué está pidiendo. */
    var nota = ultimo
      ? '<textarea class="ep-nota-in" id="sh-nota" rows="2" maxlength="120" ' +
        'placeholder="¿Algo para la cocina? Sin cebolla, bien caliente…">' + esc(sheet.nota) + '</textarea>'
      : '';

    var atras = sheet.paso > 0
      ? '<button class="ep-paso-atras" id="sh-back">← Atrás</button>' : '';

    var dentro = '<div class="ep-grab"></div>' + atras +
      '<div class="ep-sheet-n">' + esc(nombrePlato(p)) + '</div>' +
      (p.descripcion ? '<div class="ep-sheet-d">' + esc(p.descripcion) + '</div>' : '') +
      guia + opciones + nota + pie;

    /* Si la hoja YA esta abierta solo se cambia su contenido. Antes se borraba
       y se volvia a crear en cada toque, y eso repetia la animacion de entrada:
       la hoja "reaparecia" cada vez que elegias algo. Se conserva ademas la
       posicion del desplazamiento, para que no salte al principio. */
    var d, scroll = 0;
    if (existente) {
      d = existente;
      var hoja = d.querySelector('.ep-sheet');
      scroll = hoja.scrollTop;
      hoja.innerHTML = dentro;
      hoja.scrollTop = scroll;
    } else {
      d = document.createElement('div');
      d.className = 'ep-scrim';
      d.innerHTML = '<div class="ep-sheet">' + dentro + '</div>';
      document.body.appendChild(d);
      // Cerrar tocando fuera se engancha UNA vez, no en cada repintado.
      d.addEventListener('click', function (ev) { if (ev.target === d) { sheet = null; pintarSheet(); } });
    }

    function recordarNota() {
      var t = document.getElementById('sh-nota');
      if (t) sheet.nota = t.value;
    }

    d.querySelectorAll('[data-talla]').forEach(function (b) {
      b.addEventListener('click', function () {
        sheet.talla = Number(b.dataset.talla);
        // Las adiciones del tamaño anterior no siguen puestas (ver soltarModsDeOtroTamano).
        sheet.mods = soltarModsDeOtroTamano(sheet.p, sheet.mods || {}, sheet.talla);
        pintarSheet();
      });
    });
    d.querySelectorAll('[data-grupo]').forEach(function (b) {
      b.addEventListener('click', function () {
        sheet.vars[Number(b.dataset.grupo)] = Number(b.dataset.opcion);
        pintarSheet();
      });
    });
    d.querySelectorAll('[data-abrir]').forEach(function (b) {
      b.addEventListener('click', function () {
        sheet.modsAbiertos[Number(b.dataset.abrir)] = true;
        pintarSheet();
      });
    });
    d.querySelectorAll('[data-mod]').forEach(function (b) {
      b.addEventListener('click', function () {
        var gi = Number(b.dataset.mod), oi = Number(b.dataset.opcion);
        var g = (p.modificadores || [])[gi] || {};
        var sel = sheet.mods[gi] || [];
        /* Tocar SUMA una. Para quitar está el menos: si tocar quitara, no
           habría forma de pedir dos. En los grupos de una sola opción, la
           nueva reemplaza a la anterior. */
        if (!g.varias) sel = [oi];
        else sel = sel.concat(oi);
        sheet.mods[gi] = sel;
        pintarSheet();
      });
    });
    d.querySelectorAll('[data-menos]').forEach(function (b) {
      b.addEventListener('click', function () {
        var gi = Number(b.dataset.menos), oi = Number(b.dataset.opcion);
        var sel = (sheet.mods[gi] || []).slice();
        var i = sel.indexOf(oi);
        if (i >= 0) sel.splice(i, 1);           // una sola, no todas
        sheet.mods[gi] = sel;
        pintarSheet();
      });
    });
    d.querySelectorAll('[data-cant]').forEach(function (b) {
      b.addEventListener('click', function () {
        recordarNota();
        sheet.cant = Math.max(1, Math.min(20, sheet.cant + Number(b.dataset.cant)));
        pintarSheet();
      });
    });
    var bn = d.querySelector('#sh-next');
    if (bn) bn.addEventListener('click', function () { sheet.paso++; pintarSheet(); });
    var bb = d.querySelector('#sh-back');
    if (bb) bb.addEventListener('click', function () { recordarNota(); sheet.paso--; pintarSheet(); });

    var ba = d.querySelector('#sh-add');
    if (ba) ba.addEventListener('click', function () {
      recordarNota();
      carro.push({
        producto_id: sheet.p.id,
        nombre: sheet.p.nombre,
        /* Como se llama su categoria en comanda: sin esto la linea dice
           "CARNE" y no se sabe de que plato habla. */
        etiqueta: sheet.p.etiqueta || '',
        presentacion: pres.length > 1 ? String(pres[sheet.talla].nombre) : '',
        variantes: variantesDe(sheet.p, sheet.vars),
        adiciones: nombresExtras(sheet.p, sheet.mods, sheet.talla),
        precio: precioDe(sheet.p, sheet.talla, sheet.vars) + extrasDe(sheet.p, sheet.mods, sheet.talla),
        cantidad: sheet.cant,
        nota: sheet.nota || '',
        /* CUANTO SE AHORRA por llevarlo en combo. Lo calcula la carta con los
           precios de hoy; aqui solo se guarda para poder sumarlo en la cuenta.
           Un producto suelto no trae este dato y vale 0. */
        ahorro: Number(sheet.p.ahorro) > 0 ? Number(sheet.p.ahorro) : 0,
      });
      sheet = null; pintarSheet(); pantallaDentro();
    });
  }

  // ── Pantalla del pedido ─────────────────────────────────────────────
  var entrega = 'recoger';
  /* QUE ESCALON DE PREMIOS ESTA ABIERTO, por bloque. Fuera del pintado:
     `pantallaDentro()` rearma el HTML entero y si viviera dentro se cerraria
     solo cada vez que el cliente toca cualquier cosa. */
  var escalonAbierto = {};
  /* EL BARRIO QUE EL CLIENTE TECLEA (20-ago). El campo se repintaba con
     `value=""` en cada pasada, asi que lo escrito se perdia y la pantalla
     volvia a preguntar la cuenta SIN barrio: el servidor devolvia $5.000 y
     un instante despues la app se los borraba sola. Vive aqui, no en el DOM. */
  var barrioTecleado = '';
  /* EL PREMIO QUE SE ESTA CANJEANDO. Va aparte del carrito a proposito: un
     canje es UNA cosa, no una lista, y mezclarlo con el carrito obligaria a
     decidir que pasa si alguien le suma una gaseosa a su premio. Hoy no se
     puede, y eso es mas simple de explicar que de programar. */
  var canje = null;
  var pedidoHecho = null;
  /* La escucha del SMS: se guarda para poder cancelarla al cambiar de pantalla. */
  var otpCancelar = null;

  /* LA CUENTA, SIEMPRE DEL SERVIDOR ─────────────────────────────────────
     `firmaCuenta` describe el pedido tal como está ahora mismo: si cambia algo
     —una cantidad, el tipo de entrega, el barrio— la cuenta guardada ya no
     sirve y se pide otra. Sin esa firma habría que acordarse de invalidarla en
     cada botón, y el día que se olvide uno, el cliente vería un total viejo. */
  /* A DONDE VA EL PEDIDO — SALE DEL ESTADO, NO DEL DOM (20-ago).
     `firmaCuenta` y `pedirCuenta` leian `$('pd-barrio')`, pero las dos corren
     DENTRO de `cuerpoPedido()`, que todavia no ha insertado su HTML: lo que
     leian era la pantalla ANTERIOR. Al escoger otra direccion se le pedia al
     servidor la cuenta del barrio viejo.
     La direccion elegida ya vive en `dirSel`, asi que se pregunta ahi. El unico
     dato que no esta en el estado es el barrio TECLEADO a mano, y ese solo
     existe cuando la direccion no trae barrio. */
  function destinoActual() {
    if (entrega !== 'domicilio') return { dir: '', barrio: '' };
    var c = S.cliente || {};
    var el = dirElegida(dirsDe(c), c);
    return {
      dir: el.dir || c.direccion || '',
      barrio: el.barrio || barrioTecleado || c.barrio || '',
    };
  }

  function firmaCuenta() {
    return JSON.stringify([
      canje ? ['canje', canje.id] : null,
      carro.map(function (l) {
        return [l.producto_id, l.presentacion, l.cantidad, l.precio, (l.adiciones || []).join('|')];
      }),
      entrega,
      /* La direccion entra en la firma, no solo el barrio: dos direcciones del
         mismo barrio son el mismo domicilio, pero si cambia el barrio hay que
         volver a preguntar el precio. */
      destinoActual().barrio,
      destinoActual().dir,
    ]);
  }

  var pidiendoCuenta = false;
  async function pedirCuenta() {
    /* EN UN CANJE EL CARRITO VA VACIO A PROPOSITO (el premio no es una linea
       del carro), y este guard lo confundia con "no hay nada que cotizar":
       la cuenta nunca se pedia, el domicilio se quedaba "calculando..." para
       siempre y el total caia al respaldo del carrito — $0 — con $20.000 de
       "parte en dinero" en la cara del cliente (20-ago, lo vio Sergio). */
    if (pidiendoCuenta || (!canje && !carro.length)) return;
    var firma = firmaCuenta();
    pidiendoCuenta = true;
    /* Cada intento arranca limpio: si no, un error de hace dos direcciones
       se queda pegado en pantalla aunque la nueva cuenta salga bien. */
    S.cuentaError = null;
    try {
      var d = await fetch(SB_URL + '/functions/v1/web-pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previo: true, token: leerToken(), tipo: entrega,
          direccion: destinoActual().dir,
          barrio: destinoActual().barrio,
          canje: canje ? canje.id : undefined,
          items: canje ? [] : carro.map(function (l) {
            return { producto_id: l.producto_id, presentacion: l.presentacion, cantidad: l.cantidad,
                     variantes: l.variantes, adiciones: l.adiciones, nota: l.nota };
          }),
        }),
      }).then(function (r) { return r.json(); });
      /* EL CANDADO SE SUELTA ANTES DE REPINTAR (20-ago). `pantallaDentro()`
         vuelve a pasar por `cuerpoPedido()`, que puede necesitar OTRA cuenta —
         es justo lo que pasa al cambiar de direccion. Con el `pidiendoCuenta`
         todavia en true, esa segunda peticion se cancelaba sola y la pantalla
         se quedaba para siempre con la cuenta del barrio anterior: por eso
         salia "no tenemos el precio del domicilio" aunque el barrio estuviera
         en la tabla. */
      pidiendoCuenta = false;
      if (d && d.ok) { S.cuenta = { firma: firma, datos: d }; pantallaDentro(); }
      else if (d && d.mensaje) {
        /* SI EL SERVIDOR DICE QUE NO, SE DICE. NO SE DEJA GIRANDO.

           Paso el 21-ago: un premio nuevo tenia mal guardada la presentacion,
           el servidor respondia "esa presentacion ya no existe" y esta linea
           lo tiraba a la basura. El cliente veia "calculando…" para siempre,
           sin ninguna pista de que habia fallado, y desde el restaurante no
           habia forma de saberlo.

           Girar para siempre es la peor respuesta posible: el cliente no sabe
           si esperar, si recargar o si el sitio esta roto. Se dice lo que
           pasa, aunque sea feo. */
        S.cuentaError = String(d.mensaje);
        pantallaDentro();
      }
    } catch (e) {
      /* Sin conexión no se inventa un total: se queda el de los productos y el
         cliente vera el desglose completo al enviar. */
      console.warn('[cuenta]', e && e.message);
    } finally { pidiendoCuenta = false; }
  }

  function cuerpoPedido() {
    if (pedidoHecho) return cuerpoConfirmado();
    if (!canje && !carro.length) {
      return encabezado('Tu pedido') +
        '<div class="ep-vacio" style="padding:40px 0">Tu pedido está vacío.</div>' +
        '<button class="ep-btn ep-btn--ghost" data-ir="carta">Ver la carta</button>';
    }
    var c = S.cliente || {};
    /* EL PREMIO SE VE COMO SE VE UN PLATO, pero sin los botones de cantidad ni
       el de eliminar: un canje es uno y no se multiplica. En lugar del precio
       dice lo que cuesta en puntos, que es lo que de verdad esta pagando. */
    var lineas = canje
      ? '<div class="ep-linea">' +
          '<div class="ep-linea-b"><div class="ep-linea-n">1× ' + esc(canje.nombre || '') + '</div>' +
            '<div class="ep-linea-s">Lo estás pidiendo con tus puntos</div></div>' +
          '<div class="ep-li-m ep-li-m--pts">' + (Number(canje.puntos) || 0) + ' pts</div>' +
        '</div>' +
        '<button class="ep-link" id="pd-cancelar-canje" style="margin:2px 0 12px">Mejor no, volver a mis puntos</button>'
      : carro.map(function (l, i) {
      return '<div class="ep-linea">' +
        '<div class="ep-linea-b"><div class="ep-linea-n">' + l.cantidad + '× ' + esc(nombreLinea(l)) +
          ((l.adiciones && l.adiciones.length) ? ' · + ' + esc(l.adiciones.join(', ')) : '') + '</div>' +
          (l.nota ? '<div class="ep-linea-s">' + esc(l.nota) + '</div>' : '') +
          '<div class="ep-cant ep-cant--carro">' +
            '<button data-cmenos="' + i + '">\u2212</button>' +
            '<b>' + (l.cantidad || 1) + '</b>' +
            '<button data-cmas="' + i + '">+</button>' +
          '</div>' +
          '<button class="ep-quitar" data-quitar="' + i + '">Eliminar</button></div>' +
        '<div class="ep-li-m">' + COP(l.precio * l.cantidad) + '</div></div>';
    }).join('');

    var sub = carroTotal();
    /* LA CUENTA LA HACE EL SERVIDOR (16-ago). Aquí se sumaban solo los
       productos: el cliente veía $42.000, enviaba, y el pedido se creaba con el
       empaque sumado — ver un total y que le cobren otro es lo que rompe la
       confianza. La página ya no calcula: le pide la cuenta a web-pedido con
       `previo`, que es la MISMA linea de codigo que despues cobra. Mientras
       llega (o si falla la conexion) se muestra lo que se sabe. */
    var cta = (S.cuenta && S.cuenta.firma === firmaCuenta()) ? S.cuenta.datos : null;
    if (!cta) pedirCuenta();
    /* TRES ESTADOS, NO DOS (20-ago, Sergio). Antes solo se miraba si el
       domicilio valia mas de cero, y mientras la cuenta venia en camino eso
       daba cero — asi que al cliente le salia "no sabemos cuanto vale" durante
       el segundo que tarda el servidor, aunque su barrio estuviera en la tabla
       de siempre. Son tres cosas distintas:
         · todavia no se     → la cuenta no ha llegado
         · no se conoce      → llego, y el servidor dice que ese barrio no esta
         · se conoce         → llego con su precio
       El servidor ya mandaba `barrio_conocido`; solo que nadie lo miraba. */
    /* Si el servidor ya dijo que algo esta mal, esto NO sigue 'calculando':
       se muestra el problema. Girar sin fin no es esperar, es no informar. */
    var calculando = !cta && !S.cuentaError;
    var barrioRaro = !!cta && cta.barrio_conocido === false;
    var empaque = cta ? Number(cta.empaque) || 0 : 0;
    var domiCta = cta ? Number(cta.domicilio) || 0 : 0;
    /* Mientras la cuenta llega, el respaldo de un canje es su parte en
       dinero, no el carrito (que en canje esta vacio): $0 aqui le decia al
       cliente que no pagaba nada debiendo $20.000. */
    var totalCta = cta ? Number(cta.total) || 0 : (canje ? Number(canje.dinero) || 0 : sub);
    // Los puntos se ganan sobre comida + empaque, nunca sobre el domicilio.
    var gana = Math.floor((cta ? (Number(cta.pedido) || sub) : sub) / 1000);

    return encabezado('Tu pedido') + lineas +
      '<div class="ep-seg-full">' +
        '<button data-entrega="recoger"' + (entrega === 'recoger' ? ' class="on"' : '') + '>Recoger</button>' +
        '<button data-entrega="domicilio"' + (entrega === 'domicilio' ? ' class="on"' : '') + '>Domicilio</button>' +
      '</div>' +
      /* A DÓNDE VA (16-ago): escoge entre las que ya tiene guardadas — sin
         volver a teclear nada — o agrega una nueva sin salirse del pedido. */
      (entrega === 'domicilio'
        ? (function () {
            var lista = dirsDe(c);
            var elegida = dirElegida(lista, c);
            return '<label class="ep-campo" style="margin-bottom:10px"><span class="ep-lbl">Dónde te lo dejamos</span>' +
                '<select class="ep-in" id="pd-dirsel">' +
                  lista.map(function (d) {
                    return '<option value="' + esc(d.id) + '"' + (d.id === elegida.id ? ' selected' : '') + '>' +
                      esc(d.dir) + (d.barrio ? ' · ' + esc(d.barrio) : '') + '</option>';
                  }).join('') +
                  '<option value="__nueva">+ Agregar otra dirección…</option>' +
                '</select></label>' +
              (elegida.barrio ? '' :
                /* Sin barrio no se puede cobrar el domicilio: se pide, y solo
                   entonces. Antes se pedía siempre, aunque ya se supiera. */
                '<label class="ep-campo" style="margin-bottom:10px"><span class="ep-lbl">Barrio</span>' +
                  '<input class="ep-in" id="pd-barrio" value="' + esc(barrioTecleado) +
                    '" placeholder="Tu barrio"></label>') +
              '<input type="hidden" id="pd-dir" value="' + esc(elegida.dir || '') + '">' +
              (elegida.barrio ? '<input type="hidden" id="pd-barrio" value="' + esc(elegida.barrio) + '">' : '');
          })()
        : '') +
      '<label class="ep-campo"><span class="ep-lbl">Nota para la cocina</span>' +
        '<input class="ep-in" id="pd-nota" maxlength="200" placeholder="Opcional"></label>' +

      '<div style="margin-top:18px">' +
        (canje
          /* En un canje el plato no se paga con plata: decir "Productos $0"
             confunde. Se dice lo que de verdad esta entregando. */
          ? '<div class="ep-total-fila"><span style="color:var(--sub)">Con tus puntos</span>' +
            '<span class="ep-pts-tx">-' + (Number(canje.puntos) || 0) + ' pts</span></div>' +
            (Number(canje.dinero) > 0
              ? '<div class="ep-total-fila"><span style="color:var(--sub)">Parte en dinero</span><span>' + COP(Number(canje.dinero)) + '</span></div>'
              : '')
          : '<div class="ep-total-fila"><span style="color:var(--sub)">Productos</span><span>' + COP(sub) + '</span></div>') +
        (empaque > 0
          ? '<div class="ep-total-fila"><span style="color:var(--sub)">Empaque</span><span>' + COP(empaque) + '</span></div>'
          : '') +
        (entrega === 'domicilio'
          ? '<div class="ep-total-fila"><span style="color:var(--sub)">Domicilio</span><span' +
            (calculando ? ' style="color:var(--dim)">calculando…'
             : domiCta > 0 ? '>' + COP(domiCta)
             : ' style="color:var(--oro-tx)">lo pagas al recibir') + '</span></div>'
          : '') +
        (S.cuentaError
          ? '<div class="ep-aviso" style="margin:10px 0;padding:11px 13px;border-radius:11px;'
            + 'background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.35);'
            + 'color:#FCA5A5;font-size:13px;line-height:1.55">' + esc(S.cuentaError)
            + '<br><span style="opacity:.8">Escríbenos por WhatsApp y te lo resolvemos.</span></div>'
          : '') +
        '<div class="ep-total-fila grande"><span>Total</span><b>' + COP(totalCta) + '</b></div>' +
        /* EL AHORRO DEL COMBO, donde el cliente esta mirando la plata (19-ago,
           pedido de Sergio). Va debajo del total y antes de los puntos: es el
           argumento mas fuerte que tiene el pedido y se pierde si queda
           escondido en la carta. Solo aparece si de verdad hay combo. */
        (carroAhorro() > 0
          ? '<div class="ep-ahorro">Te ahorras ' + COP(carroAhorro()) + ' por pedirlo en combo</div>'
          : '') +
        /* DIRECCION QUE EL RESTAURANTE TODAVIA NO CONOCE (19-ago, regla de
           Sergio). El cliente NO se queda esperando a que le confirmen el
           precio: paga su comida ahora y el domicilio se lo cobran al
           entregarle. Decirlo aqui, antes de pagar, es lo que evita el reclamo
           de "me cobraron algo que no estaba en el total". */
        (entrega === 'domicilio' && barrioRaro
          ? '<div class="ep-domi-luego">🛵 Todavía no tenemos el precio del domicilio para tu dirección. ' +
            '<b>Pagas ahora solo tu pedido</b> y el domicilio se lo pagas al domiciliario cuando te llegue.</div>'
          : '') +
        (canje
          ? (totalCta > 0
              ? '<div class="ep-gana">Solo pagas ' + COP(totalCta) + '; el resto va con tus puntos</div>'
              : '<div class="ep-gana">No pagas nada: va completo con tus puntos 🎁</div>')
          : '<div class="ep-gana">Ganarás +' + gana + ' puntos con este pedido</div>') +
      '</div>' +
      (S.negocio && !S.negocio.abierto
        ? '<div class="ep-aviso">' + esc(S.negocio.detalle || 'Ahora está cerrado') + '. ' +
          (S.negocio.permite_programar
            ? 'Tu pedido quedará <b>programado</b> para cuando abramos.'
            : 'No podemos recibir pedidos en este momento.') + '</div>'
        : '') +
      '<button class="ep-btn ep-btn--main" id="pd-enviar" style="margin-top:16px"' +
        ((S.negocio && !S.negocio.abierto && !S.negocio.permite_programar) ? ' disabled' : '') +
        '>' + (canje ? 'Canjear mi premio' : 'Enviar mi pedido') + '</button>' +
      (canje && totalCta === 0
        ? '<p class="ep-nota" style="text-align:center;margin-top:10px">No tienes que pagar nada. Te avisamos cuando esté listo.</p>'
        : '<p class="ep-nota" style="text-align:center;margin-top:10px">Se paga por transferencia. Te mostramos los datos al enviarlo.</p>');
  }

  function cuerpoConfirmado() {
    var d = pedidoHecho;
    var llave = (d.pago && d.pago.llave) ? String(d.pago.llave) : '';
    /* EL LOGO DEL RESTAURANTE, no una estrella generica (19-ago, Sergio): es el
       momento en que el cliente acaba de confiar su plata, y ver la marca ahi
       vale mas que un adorno. Si el restaurante no tiene logo, queda la
       estrella de siempre. */
    var sello = (S.negocio && S.negocio.logo)
      ? '<div class="ep-ok-ico marca"><img src="' + esc(S.negocio.logo) + '" alt=""></div>'
      : '<div class="ep-ok-ico">' + ico('estrella', 28) + '</div>';

    return '<div style="text-align:center;padding:26px 0 10px">' +
        sello +
        '<div class="ep-saludo-n">' + (d.programado ? '¡Pedido programado!' : '¡Pedido recibido!') + '</div>' +
        '<div class="ep-perfil-t" style="margin-top:6px">' +
          (d.programado ? 'Lo preparamos apenas abramos.' : 'Ya lo tenemos. Falta el pago.') + '</div>' +
      '</div>' +
      '<div class="ep-tile">' +
        '<div class="ep-total-fila"><span style="color:var(--sub)">Productos</span><span>' + COP(d.subtotal) + '</span></div>' +
        (d.domicilio ? '<div class="ep-total-fila"><span style="color:var(--sub)">Domicilio</span><span>' + COP(d.domicilio) + '</span></div>' : '') +
        '<div class="ep-total-fila grande"><span>Total a pagar</span><b>' + COP(d.total) + '</b></div>' +
        (d.domicilio === 0 && d.barrio_conocido === false
          ? '<div class="ep-domi-luego">🛵 El domicilio lo pagas al recibir: te lo cobra el domiciliario. ' +
            'Lo de arriba es solo tu pedido.</div>' : '') +
        /* LO QUE GANO CON ESTE PEDIDO (19-ago). Estaba solo en la cuenta previa
           y se perdia justo cuando el cliente mira si valio la pena. */
        (Number(d.ahorro) > 0
          ? '<div class="ep-ahorro">Te ahorraste ' + COP(d.ahorro) + ' por pedirlo en combo</div>' : '') +
        (Number(d.puntos) > 0
          ? '<div class="ep-gana">Ganaste +' + d.puntos + ' puntos con este pedido</div>' : '') +
      '</div>' +

      /* LOS DATOS DE PAGO, y como usarlos. Antes era una lista de datos muda:
         el cliente veia la llave pero tenia que copiarla a mano mirando la
         pantalla, y nadie le explicaba el procedimiento. Ahora el bloque
         ENTERO abre las instrucciones, lo dice con un boton visible, y la
         llave se copia de un toque sin abrir nada. */
      '<div class="ep-pago' + (llave ? ' clic' : '') + '"' + (llave ? ' id="pg-pasos"' : '') + '>' +
        '<div class="ep-pago-hd">' +
          '<div class="ep-tile-lbl">Paga por transferencia</div>' +
          (llave ? '<span class="ep-pago-como">¿Cómo transfiero?</span>' : '') +
        '</div>' +
        (llave
          ? '<div class="ep-dato llave"><span>Llave / cuenta</span>' +
              '<span class="ep-llave-val">' + esc(llave) +
                '<button class="ep-copiar" type="button" data-copiar="' + esc(llave) + '">Copiar</button>' +
              '</span></div>'
          : '') +
        (d.pago && d.pago.titular ? '<div class="ep-dato"><span>A nombre de</span><span>' + esc(d.pago.titular) + '</span></div>' : '') +
        '<div class="ep-dato"><span>Valor</span><span>' + COP(d.total) + '</span></div>' +
      '</div>' +

      /* Las dos formas de pagar, aquí mismo. Antes esto terminaba en "mándale
         el comprobante por WhatsApp" y el pedido quedaba esperando a que
         alguien lo verificara a mano. */
      (d.pagado
        ? '<div class="ep-pagado">' +
            '<span class="ep-pagado-ico">✓</span>' +
            '<div><b>Pago confirmado</b>' +
              '<span>Ya estamos preparando tu pedido.</span></div>' +
          '</div>'
        : ((S.cliente && Number(S.cliente.saldo) >= Number(d.total))
            ? '<button class="ep-btn gold big" style="margin-top:14px" id="pg-saldo">' +
                'Pagar con mi saldo · ' + COP(S.cliente.saldo) + '</button>'
            : (S.cliente && Number(S.cliente.saldo) > 0
                ? '<div class="ep-nota" style="margin-top:12px">Tu saldo es ' + COP(S.cliente.saldo) +
                  ' y te faltan ' + COP(Number(d.total) - Number(S.cliente.saldo)) +
                  '. <a href="#" data-ir="billetera">Recargar</a></div>' : '')) +
          /* "Ya transferí" es la accion que MAS se usa cuando no se paga con
             saldo, y era un recuadro punteado gris que parecia deshabilitado.
             Ahora es un boton de verdad. */
          '<label class="ep-btn ep-btn--sec" style="margin-top:10px" id="pg-comp-btn">' +
            '<input type="file" id="pg-comp" accept="image/*" hidden>' +
            '<span id="pg-comp-lbl">📎 Ya transferí · subir comprobante</span></label>') +
      '<button class="ep-btn ep-btn--ghost" style="margin-top:14px" data-ir="inicio">Volver al inicio</button>';
  }

  async function enviarPedido() {
    var b = $('pd-enviar');
    b.disabled = true; b.textContent = 'Enviando…';
    var d = await fetch(SB_URL + '/functions/v1/web-pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: leerToken(), tipo: entrega,
        direccion: destinoActual().dir,
        barrio:    destinoActual().barrio,
        notas: ($('pd-nota') || {}).value || '',
        /* TODO lo de cada línea, no solo el producto (16-ago): la cuenta previa
           sí mandaba variantes y adiciones, y esto no — así que el total que
           veía el cliente y el que se cobraba podían no coincidir, y a la
           cocina le llegaba una salchipapa sin decir si era mixta ni con qué
           adiciones. */
        /* En un canje va el premio y NO el carrito: el servidor lo traduce a
           un item normal con su precio de verdad, y decide la plata. */
        canje: canje ? canje.id : undefined,
        items: canje ? [] : carro.map(function (l) {
          return {
            producto_id: l.producto_id, presentacion: l.presentacion,
            cantidad: l.cantidad, variantes: l.variantes || [],
            adiciones: l.adiciones || [], nota: l.nota,
          };
        }),
      }),
    }).then(function (r) { return r.json(); }).catch(function () {
      return { ok: false, mensaje: 'No hay conexión.' };
    });

    if (!d.ok) {
      b.disabled = false; b.textContent = 'Enviar mi pedido';
      // Con la cara de la página, no con el cuadro gris del navegador.
      aviso(d.mensaje || 'No se pudo enviar.', 'mal');
      return;
    }
    /* Lo que se ahorro y lo que gano se calculan ANTES de vaciar el carrito:
       despues ya no hay de donde sacarlos. */
    d.ahorro = canje ? 0 : carroAhorro();
    d.puntos = canje ? 0 : Math.floor((Number(d.subtotal) || 0) / 1000);
    pedidoHecho = d;
    if (canje) {
      /* Los puntos ya se gastaron en el servidor: el numero de la pantalla
         tiene que reflejarlo o el cliente cree que sigue teniendo los mismos.
         Y el catalogo se vuelve a pedir, porque con menos puntos cambian los
         premios que ya alcanza. */
      if (S.cliente) S.cliente.puntos = Math.max(0, (Number(S.cliente.puntos) || 0) - (Number(canje.puntos) || 0));
      S.catalogo = null;
      canje = null;
    }
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
    if (vista === 'seguir')    return cuerpoSeguir();
    return cuerpoInicio(c, n, saludo);
  }

  /* LA CARTA SE REFRESCA SOLA (17-ago). Antes se pedia UNA vez y se quedaba
     asi toda la sesion: un cliente con la app abierta no veia nada de lo que el
     dueNo cambiara. Con "Agotado hoy" eso deja de ser un detalle — podria pedir
     algo que ya no hay, y alguien tiene que llamarlo a decirle que no.

     Se vuelve a pedir si han pasado mas de 3 minutos desde la ultima vez, y
     solo al entrar a la carta. No es tiempo real —eso costaria una consulta
     constante por cada cliente abierto— pero cierra la ventana de "pedi algo
     que ya no existe" a unos minutos. */
  var CARTA_FRESCA_MS = 3 * 60 * 1000;
  var cartaPedidaEn = 0;

  async function cargarCarta(forzar) {
    var vencida = (Date.now() - cartaPedidaEn) > CARTA_FRESCA_MS;
    if (S.carta && !forzar && !vencida) return;
    var r = await S.sb.rpc('fn_web_carta', { p_slug: S.slug });
    /* Si la consulta falla se conserva lo que ya se tenia: es preferible una
       carta de hace un rato que una pantalla vacia. */
    if (r && !r.error && r.data) { S.carta = r.data; cartaPedidaEn = Date.now(); }
    else if (!S.carta) S.carta = [];
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

    /* EL TUTORIAL MANDA SOBRE TODO LO DEMAS (23-ago-2026).
       Quien llega con #instalar viene del boton de la plantilla de WhatsApp
       que se le manda a los que se registraron y no instalaron la app. Va
       ANTES de mirar la sesion: si no, al que tenga sesion abierta le saldria
       su cuenta y no el tutorial, que es justo lo que fue a buscar. */
    if (String(location.hash || '').toLowerCase().indexOf('instalar') >= 0) {
      var t0 = leerToken();
      /* Se recupera la sesion en silencio para que el boton "ya la instale"
         lo deje adentro y no en el login. Si falla, no importa: el tutorial
         se ve igual, que es lo unico a lo que vino. */
      if (t0) {
        try {
          var d0 = await acceso({ accion: 'sesion', token: t0,
            instalada: yaInstalada(),
            plataforma: esIOS() ? 'ios' : (/android/i.test(navigator.userAgent) ? 'android' : 'escritorio') });
          if (d0.ok) S.cliente = d0.cliente;
        } catch (x) {}
      }
      return pantallaTutorial();
    }

    // ¿Ya tenía sesión abierta? (la casilla "mantener mi sesión")
    var t = leerToken();
    if (t) {
      /* Se le cuenta al servidor DESDE DONDE entro: instalada en la pantalla
         de inicio, o el navegador de siempre. Es el unico momento en que se
         puede saber, porque eso solo lo ve el propio telefono. */
      var d = await acceso({ accion: 'sesion', token: t,
        instalada: yaInstalada(),
        plataforma: esIOS() ? 'ios' : (/android/i.test(navigator.userAgent) ? 'android' : 'escritorio') });
      if (d.ok) { S.cliente = d.cliente; return pantallaDentro(); }
      borrarToken();
    }
    pantallaEntrar('', false);
    /* EL AVISO DE INSTALAR SALE AL LLEGAR, ANTES DE ENTRAR (decision de
       Sergio, 20-ago-2026: "asi es mas efectivo"). Antes solo salia despues de
       iniciar sesion, y quien llegaba desde la biografia de Instagram — sin
       sesion — no veia nada nunca. Si lo cierra, los 7 dias de espera de
       `tocaOfrecer` evitan que se lo repitamos al entrar. */
    if (tocaOfrecer()) {
      setTimeout(function () { if (tocaOfrecer()) pantallaInstalar(false); }, 1200);
    }
  })();
})();
