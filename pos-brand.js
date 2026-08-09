/* ==========================================================================
   pos-brand.js — Identidad de marca unificada
   --------------------------------------------------------------------------
   Se carga en TODAS las páginas (después de pos-core.js).

   Reglas de producto (multi-tenant):
     · La primera línea del bloque de marca SIEMPRE dice "Cobra POS".
     · La segunda línea SIEMPRE es el nombre del restaurante del tenant.
     · El recuadro del logo lleva el logo oficial de Cobra POS.

   Cada página tiene su propio prefijo de clases (cj-, cf-, iv-, d-, tp-,
   vs-, o el genérico brand-*), así que en vez de editar 13 HTML distintos
   este script normaliza el bloque sea cual sea su marcado.
   ========================================================================== */
(function () {
  'use strict';

  /* La version al final obliga a volver a bajar la imagen. El .exe guarda los
     archivos en cache con mas insistencia que el navegador, y una entrada
     dañada deja el logo roto aunque el archivo del servidor este perfecto —
     que es justo lo que paso: en Chrome se veia bien y en la app no. */
  var LOGO_SRC = 'assets/brand/cobra-logo.png?v=2';
  var LS_KEY   = 'pos.brand.restaurante';

  /* Páginas donde la segunda línea la controla la propia página
     (en tablet muestra la ZONA de la mesa, no el restaurante). */
  /* Antes mesa y venta rapida escribian aqui la zona del salon o la sucursal,
     y por eso el nombre del restaurante no aparecia en ninguna de las dos. Ya
     no: las dos muestran el restaurante como el resto. Se deja la lista por si
     alguna pantalla futura necesita ese renglon para otra cosa. */
  var SUB_RESERVADO = [];

  /* ── Nombre del restaurante ─────────────────────────────────────────── */

  function nombreCache() {
    try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
  }

  // El cliente Supabase se llama `sb` en todas las páginas, pero unas lo
  // declaran en pos-core.js y otras en su propio script.
  function cliente() {
    try { return (typeof sb !== 'undefined' && sb) ? sb : (window.sb || null); }
    catch (e) { return window.sb || null; }
  }

  async function nombreDesdeDB() {
    var sb = cliente();
    if (!sb) return '';
    try {
      var r = await sb.from('branches')
        .select('name, brands(name)')
        .eq('is_active', true).limit(1).maybeSingle();
      if (r && r.data) return (r.data.brands && r.data.brands.name) || r.data.name || '';
    } catch (e) { /* sin conexión: se queda con el cache */ }
    try {
      /* De la sesión guardada en el equipo. Ojo con la forma: getSession
         devuelve data.session.user, no data.user como getUser. */
      var u = await sb.auth.getSession();
      var meta = (u && u.data && u.data.session && u.data.session.user
                  && u.data.session.user.user_metadata) || {};
      if (meta.restaurant_name) return meta.restaurant_name;
    } catch (e) {}
    return '';
  }

  window.posBrandName = function () {
    return nombreCache() || 'Mi restaurante';
  };

  /* ── Normalización del bloque de marca ──────────────────────────────── */

  function pintarLogo(el) {
    if (!el || el.dataset.brandDone === '1') return;
    el.dataset.brandDone = '1';
    el.innerHTML = '<img src="' + LOGO_SRC + '" alt="Cobra POS" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block;' +
      'border-radius:inherit">';
    // El recuadro traía un degradado de fondo con la letra placeholder
    // ("L"/"C"); el app icon oficial ya trae su propio fondo índigo.
    /* Tope duro: si el CSS del recuadro aun no llego (pantallas que lo cargan
       por codigo), sin esto el recuadro no tiene medida y el logo al 100% es
       la pantalla entera durante un segundo. */
    el.style.maxWidth  = '40px';
    el.style.maxHeight = '40px';
    el.style.background = 'transparent';
    el.style.boxShadow  = 'none';
    el.style.color      = 'transparent';
    el.style.padding    = '0';
    el.style.overflow   = 'hidden';
  }

  function pintarTextos(cont, restaurante) {
    var name = cont.querySelector('[class*="brand-name"]');
    var sub  = cont.querySelector('[class*="brand-sub"], [class*="brand-ver"]');

    // domicilios.html sólo tiene la línea de abajo: le creamos la de arriba.
    if (!name && sub) {
      name = document.createElement('div');
      name.className = sub.className.replace(/brand-sub/, 'brand-name');
      name.style.fontWeight = '700';
      sub.parentNode.insertBefore(name, sub);
    }

    /* Arriba "Cobra POS", abajo el restaurante. En TODAS las pantallas igual:
       el bloque de marca dice de quien es el programa y de quien es el negocio,
       y no cambia de significado segun donde este uno parado. */
    if (name) name.textContent = 'Cobra POS';
    if (sub && SUB_RESERVADO.indexOf(sub.id) === -1 && restaurante) {
      sub.textContent = restaurante;
    }
  }

  /* El recuadro del logo se llama brand-logo en casi todas las pantallas,
     pero en catálogo y chat IA se llama brand-mark. Ojo: en el dashboard
     "brand-mark" es el CONTENEDOR, así que descartamos los que contienen
     otras piezas de marca dentro. */
  function esRecuadroLogo(el) {
    if (/brand-logo/.test(el.className)) return true;
    return !el.querySelector('[class*="brand-logo"], [class*="brand-name"]');
  }

  /* Los renglones que llevan el nombre del negocio en el texto ("Caja · El
     Parche Food") ya no lo traen escrito: traen una marca y aqui se rellena.
     Sin nombre conocido, el sufijo queda vacio y el renglon dice solo "Caja"
     — mejor corto que con el nombre de otro restaurante. */
  function pintarNegocio(restaurante) {
    var i, els;
    els = document.querySelectorAll('[data-negocio]');
    for (i = 0; i < els.length; i++) els[i].textContent = restaurante || 'Mi negocio';
    els = document.querySelectorAll('[data-negocio-suf]');
    for (i = 0; i < els.length; i++) els[i].textContent = restaurante ? ' \u00b7 ' + restaurante : '';
  }

  function aplicar(restaurante) {
    pintarNegocio(restaurante);
    var cand = document.querySelectorAll('[class*="brand-logo"], [class*="brand-mark"]');
    var logos = [];
    for (var k = 0; k < cand.length; k++) {
      if (esRecuadroLogo(cand[k])) logos.push(cand[k]);
      // Los contenedores descartados también se marcan para que el
      // observador no los vuelva a evaluar en cada mutación del DOM.
      else cand[k].dataset.brandDone = '1';
    }
    for (var i = 0; i < logos.length; i++) {
      var logo = logos[i];
      pintarLogo(logo);
      // Ojo: closest() se incluye a sí mismo y la clase del recuadro ya
      // contiene "brand" (cj-brand-logo), así que hay que subir un nivel.
      var padre = logo.parentElement;
      var cont  = padre && (padre.closest('[class*="brand"]') || padre);
      if (cont) pintarTextos(cont, restaurante);
    }
  }

  async function init() {
    // 1) Pintado inmediato con lo que haya en cache (sin parpadeo).
    aplicar(nombreCache());
    // 2) Refresco desde la base; si cambió, se repinta y se guarda.
    var fresco = await nombreDesdeDB();
    if (fresco) {
      try { localStorage.setItem(LS_KEY, fresco); } catch (e) {}
      aplicar(fresco);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Ventas ("Por salón") dibuja su sidebar por JS después del load.
     Observamos el DOM para pintar el bloque en cuanto aparezca. */
  /* OJO con el costo: este vigilante se despierta con CUALQUIER cambio del
     documento, y las pantallas que redibujan listas largas (Ventas, Catálogo)
     cambian el documento sin parar. Por eso:
       · se agrupa el trabajo con requestAnimationFrame — muchos cambios
         seguidos se atienden UNA vez, no una por cambio;
       · se apaga a los 20 segundos. El bloque de marca lo dibujan las pantallas
         al arrancar; pasado ese rato ya no aparece ninguno nuevo y seguir
         mirando solo cuesta.
     Antes no tenía ninguna de las dos cosas y revisaba el documento entero en
     cada movimiento: eso es parte de lo que puso lento el sistema. */
  var obsPedido = false;
  var obs = new MutationObserver(function () {
    if (obsPedido) return;
    obsPedido = true;
    requestAnimationFrame(function () {
      obsPedido = false;
      var pendiente = document.querySelector(
        '[class*="brand-logo"]:not([data-brand-done]), [class*="brand-mark"]:not([data-brand-done])');
      if (pendiente) aplicar(nombreCache());
    });
  });
  function observar() {
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 20000);
  }
  if (document.body) observar();
  else document.addEventListener('DOMContentLoaded', observar);


  /* ── LA FOTO DEL RESTAURANTE ────────────────────────────────────────
     El recuadro de arriba a la IZQUIERDA lleva siempre el logo de Cobra POS:
     eso no cambia. Esta foto va en el círculo de arriba a la DERECHA, el que
     acompaña al nombre y al rol de quien tiene la sesión abierta.

     Es del RESTAURANTE, no de la persona: la sube el dueño una vez y la ven
     todas las cuentas de ese negocio — el cajero, el mesero, la cocina. Por eso
     sale de `brands.logo_url` y no de los datos de cada usuario.

     Cada pantalla bautizó ese círculo a su manera (tb-avatar, user-avatar,
     topbar-avatar, userAv...), así que se buscan todos en vez de editar diez
     archivos. Es el mismo criterio con el que este archivo normaliza el bloque
     de marca. */
  var LS_LOGO = 'pos.brand.logo';
  var LS_FOTO = 'pos.brand.foto';   // la imagen misma, guardada en el equipo
  var AVATARES = ['tb-avatar', 'dd-avatar', 'user-avatar', 'topbar-avatar', 'userAv', 'mesero-avatar', 'vs-user-av'];

  function logoCache() {
    try { return localStorage.getItem(LS_LOGO) || ''; } catch (e) { return ''; }
  }

  /* La foto guardada AQUÍ, en el equipo, no en internet. Se guarda junto con la
     dirección de la que salió: si el dueño la cambia, la dirección cambia y
     sabemos que la copia local quedó vieja. Así ninguna pantalla tiene que
     esperar a la red para pintar el círculo. */
  function fotoLocal(url) {
    try {
      var g = JSON.parse(localStorage.getItem(LS_FOTO) || 'null');
      return (g && g.url === url && g.datos) ? g.datos : '';
    } catch (e) { return ''; }
  }

  function guardarFotoLocal(url) {
    if (!url || fotoLocal(url)) return;
    fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
      if (b.size > 400 * 1024) return;         // demasiado grande para guardarla
      var fr = new FileReader();
      fr.onload = function () {
        try { localStorage.setItem(LS_FOTO, JSON.stringify({ url: url, datos: fr.result })); }
        catch (e) {}                            // sin espacio: se sigue usando la de internet
      };
      fr.readAsDataURL(b);
    }).catch(function () {});
  }

  // Lo que se pinta: primero la copia local; si no hay, la dirección de internet.
  function fuenteFoto() {
    var url = logoCache();
    return url ? (fotoLocal(url) || url) : '';
  }

  async function logoDesdeDB() {
    var s = cliente();
    if (!s) return '';
    try {
      var u = await s.auth.getSession();
      var _u = u && u.data && u.data.session && u.data.session.user;
      var tid = _u && _u.user_metadata && _u.user_metadata.tenant_id;
      if (!tid) return '';
      var r = await s.from('brands').select('logo_url').eq('tenant_id', tid)
        .order('created_at').limit(1).maybeSingle();
      return (r && r.data && r.data.logo_url) || '';
    } catch (e) { return ''; }   // sin conexión: se queda con lo que haya en cache
  }

  function pintarFoto(el, url) {
    if (!el || !url) return;
    if (el.dataset.fotoUrl === url) return;   // ya está puesta
    el.dataset.fotoUrl = url;
    el.innerHTML = '<img src="' + url + '" alt="" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit">';
    el.style.background = 'transparent';
    el.style.color = 'transparent';
  }

  function pintarFotoEnTodos(url) {
    if (!url) return;
    for (var i = 0; i < AVATARES.length; i++) pintarFoto(document.getElementById(AVATARES[i]), url);
  }

  function arrancarFoto() {
    var url = logoCache();
    pintarFotoEnTodos(fuenteFoto());

    /* Varias pantallas escriben las iniciales en ese círculo DESPUÉS de que
       esto corre, y borrarían la foto. En vez de adivinar el orden de carga, se
       vigila el elemento y se vuelve a poner si alguien lo pisa. */
    if (url && window.MutationObserver) {
      for (var i = 0; i < AVATARES.length; i++) {
        (function (el) {
          if (!el) return;
          new MutationObserver(function () {
            if (!el.querySelector('img')) { el.dataset.fotoUrl = ''; pintarFoto(el, fuenteFoto()); }
          }).observe(el, { childList: true, characterData: true, subtree: true });
        })(document.getElementById(AVATARES[i]));
      }
    }

    // Y se refresca desde la base, por si el dueño la cambió en otro equipo.
    logoDesdeDB().then(function (nueva) {
      if (nueva === url) { guardarFotoLocal(url); return; }
      try { nueva ? localStorage.setItem(LS_LOGO, nueva) : localStorage.removeItem(LS_LOGO); } catch (e) {}
      if (nueva) { pintarFotoEnTodos(nueva); guardarFotoLocal(nueva); }
    });
  }

  /* Ventas dibuja su panel por JavaScript despues del load, asi que ese circulo
     todavia no existe cuando esto corre. Se vigila el documento y se pinta en
     cuanto aparezca — mismo criterio que el bloque de marca de mas arriba. */
  if (window.MutationObserver) {
    var fotoPedido = false;
    var obsFoto = new MutationObserver(function () {
      if (fotoPedido) return;          // mismo criterio de arriba: agrupar y apagar
      fotoPedido = true;
      requestAnimationFrame(function () {
        fotoPedido = false;
        var src = fuenteFoto();
        if (!src) return;
        for (var k = 0; k < AVATARES.length; k++) {
          var el = document.getElementById(AVATARES[k]);
          if (el && !el.querySelector('img')) pintarFoto(el, src);
        }
      });
    });
    var arrancarObs = function () {
      obsFoto.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { obsFoto.disconnect(); }, 20000);
    };
    if (document.body) arrancarObs();
    else document.addEventListener('DOMContentLoaded', arrancarObs);
  }

  /* Para que Configuración avise cuando la acaban de cambiar, sin recargar. */
  window.posBrandLogo = function (url) {
    try {
      if (url) localStorage.setItem(LS_LOGO, url);
      else { localStorage.removeItem(LS_LOGO); localStorage.removeItem(LS_FOTO); }
    } catch (e) {}
    if (url) { pintarFotoEnTodos(url); guardarFotoLocal(url); }
    return url || '';
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarFoto);
  else arrancarFoto();

  window.posBrandRefresh = init;
})();
