/* consola-chat.js — LAS CONVERSACIONES DE COBRA, con la pantalla de Chat IA (11-sep-2026)

   Sergio: el chat de la consola tiene que tener "exactamente el mismo diseño"
   que el de los restaurantes, y "no debes tocar, modificar ni dañar nada de lo
   que ya existe con los restaurantes".

   Por eso aquí NO hay otro chat. Al abrir se trae chat-ia.html tal cual, se
   toma su estructura y se cargan sus mismos archivos (chat-ia.js y compañía)
   SIN cambiarles una línea. Si mañana el Chat IA mejora, esto mejora solo.

   Lo único propio de esta página, todo desde AFUERA del chat:

   1. EL RESTAURANTE ES EL INTERNO DE COBRA. Se le pregunta a `chat-cobra`
      (que solo contesta al admin de plataforma) y se deja FIJO en
      `window._pos.state`: el núcleo lo cambia varias veces después de arrancar
      (lo lee de la sesión de Sergio, que es de El Parche) y sin el candado el
      chat podía terminar mostrando El Parche.

   2. NADA SE GUARDA EN EL EQUIPO. El navegador es el mismo de El Parche y la
      copia rápida de la bandeja, la sede guardada y los cachés llevan el
      restaurante de la SESIÓN en el nombre: escribirlos desde aquí pisaría los
      de El Parche. Lo que esta página escribe vive solo en memoria y se va al
      cerrarla. La sesión sí se guarda (si no, se cerraría).

   3. NO SUENA lo de El Parche: no se carga `pos-notify.js`.

   4. SE ESCONDE lo que solo sirve a un restaurante: Pagos por confirmar,
      Crear pedido, la Ficha del cliente y los botones de pago/domicilio.
      Y «Regresar» (que en el Chat IA lleva a Ventas) vuelve a la consola: el
      chat se ve a pantalla completa, como el Chat IA (Sergio, 11-sep).    */
(function () {
  'use strict';
  var FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/chat-cobra';
  //  Ya cargados por esta página, o que no van (el sonido de El Parche).
  var NO_CARGAR = /(^|\/)(vendor\/supabase-2\.js|pos-nucleo\.js|pos-notify\.js)(\?|$)/;

  /* ── 2. Nada se guarda en el equipo ──────────────────────────────────── */
  var LS = window.localStorage;
  var sombra = new Map();                                   // lo que escribe esta página
  var esSesion = function (k) { return typeof k === 'string' && k.indexOf('cobra-pos-session') === 0; };
  var ajena = function (k) {                                 // lo de El Parche que no se lee aquí
    return typeof k === 'string' && (k.indexOf('pos.cache.') === 0 || k === 'pos.branchId' || k === 'pos.cuenta.estado');
  };
  var _get = Storage.prototype.getItem, _set = Storage.prototype.setItem, _del = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (k) {
    if (this !== LS || esSesion(k)) return _get.call(this, k);
    if (sombra.has(k)) return sombra.get(k);
    if (ajena(k)) return null;
    return _get.call(this, k);
  };
  Storage.prototype.setItem = function (k, v) {
    if (this !== LS || esSesion(k)) return _set.call(this, k, v);
    sombra.set(k, String(v));
  };
  Storage.prototype.removeItem = function (k) {
    if (this !== LS || esSesion(k)) return _del.call(this, k);
    sombra.set(k, null);                                    // borrado aquí, no en el equipo
  };

  /* ── Los "al terminar de cargar" del chat se guardan para después ─────── */
  var listos = [], capturando = true;
  var _add = document.addEventListener;
  document.addEventListener = function (tipo, fn, op) {
    if (capturando && tipo === 'DOMContentLoaded') { listos.push(fn); return; }
    return _add.call(document, tipo, fn, op);
  };

  function aviso(txt) {
    document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;'
      + 'font-family:\'DM Sans\',system-ui,sans-serif;color:#64748B;font-size:14px;text-align:center;padding:24px">' + txt + '</div>';
  }
  function cargar(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { no(new Error('no cargó ' + src)); };
      document.body.appendChild(s);
    });
  }

  /* ── 1. El restaurante: el interno de Cobra, fijo ─────────────────────── */
  function fijarCobra(tenantId, branchId) {
    window._pos = window._pos || {};
    var st = window._pos.state = window._pos.state || {};
    ['tenantId', 'branchId'].forEach(function (k) {
      var v = k === 'tenantId' ? tenantId : branchId;
      try {
        Object.defineProperty(st, k, { configurable: true, enumerable: true,
          get: function () { return v; }, set: function () { /* aquí manda Cobra */ } });
      } catch (e) { st[k] = v; }
    });
    window._branchId = branchId;
  }

  async function arrancar() {
    var tok = '';
    try { tok = (await sb.auth.getSession()).data.session.access_token; } catch (e) {}
    if (!tok) return aviso('Tu sesión venció. Vuelve a entrar a la consola.');
    var est = null;
    try {
      var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ accion: 'estado' }) });
      est = await r.json();
    } catch (e) {}
    if (!est || !est.ok) return aviso(esc((est && est.error) || 'No se pudo abrir el chat de Cobra.'));
    fijarCobra(est.tenant_id, est.branch_id);

    //  La pantalla de Chat IA, tal cual está publicada.
    var html = await (await fetch('chat-ia.html', { cache: 'no-store' })).text();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('head link[rel="stylesheet"]').forEach(function (l) {
      var n = document.createElement('link'); n.rel = 'stylesheet'; n.href = l.getAttribute('href');
      document.head.appendChild(n);
    });
    var t = doc.querySelector('title'); if (t) document.title = 'Conversaciones de Cobra';

    //  4. Lo que solo sirve a un restaurante.
    var st = document.createElement('style');
    st.textContent = ''
      + '.ci-nav-btn[data-view="pagos"],#createOrderBtn,.ci-more-item[onclick*="abrirFichaCliente"],'
      //  Confirmar pago, verificar transferencia y precio del domicilio: son
      //  del pedido de comida. En Cobra crearian cosas que no tienen sentido.
      + '#verifyPagoBtn,#pagoConfirmBtn,#domiConfirmBtn{display:none!important}';
    document.head.appendChild(st);

    var scripts = [];
    document.body.innerHTML = '';
    Array.prototype.slice.call(doc.body.childNodes).forEach(function (n) {
      if (n.nodeName === 'SCRIPT') { scripts.push(n); return; }
      document.body.appendChild(document.importNode(n, true));
    });

    //  REGRESAR vuelve a la consola. Dentro de la consola se le avisa a ella
    //  (que tapa y destapa el chat sin recargar nada); abierta sola, va a la
    //  consola. Va en la fase de captura: el nucleo tambien escucha los
    //  enlaces (el PIN antes de cambiar de pantalla) y aqui no aplica.
    var reg = document.querySelector('a.ci-nav-btn[href="ventas.html"]');
    if (reg) {
      reg.setAttribute('href', 'admin-reg.html');
      reg.addEventListener('click', function (e) {
        if (window.parent && window.parent !== window) {
          e.preventDefault(); e.stopImmediatePropagation();
          window.parent.postMessage({ cobra: 'cerrar-conversaciones' }, location.origin);
        }
      }, true);
    }

    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i], src = s.getAttribute('src');
      if (src) { if (!NO_CARGAR.test(src)) await cargar(src); }
      else if (!/posRequirePin/.test(s.textContent)) {
        var n2 = document.createElement('script'); n2.textContent = s.textContent; document.body.appendChild(n2);
      }
    }

    //  Ahora sí: el chat arranca, ya con Cobra.
    capturando = false;
    document.addEventListener = _add;
    listos.forEach(function (fn) {
      try { fn.call(document, new Event('DOMContentLoaded')); } catch (e) { console.error('[consola-chat]', e); }
    });

    /*  5. EL NOMBRE DEL ASISTENTE. El Chat IA le pone "Pako" a la burbuja del
        bot y "Asistente (Paco)" a su menú, escritos fijos. Aquí el asistente
        NO es Paco: se cambia el texto desde afuera, sin tocar el chat. Dice
        el nombre que Sergio le ponga en «Chat de Cobra → Asistente».       */
    var nombre = (est.asistente && est.asistente.nombre) || 'Asistente';
    var pendiente = false;
    function renombrar() {
      pendiente = false;
      document.querySelectorAll('.ci-org-bot').forEach(function (e) { if (e.textContent !== nombre) e.textContent = nombre; });
      document.querySelectorAll('.ci-more-tlabel').forEach(function (e) {
        if (/\(Paco\)/.test(e.textContent)) e.textContent = e.textContent.replace(/\s*\(Paco\)/, '');
      });
    }
    renombrar();
    new MutationObserver(function () {
      if (!pendiente) { pendiente = true; requestAnimationFrame(renombrar); }
    }).observe(document.body, { childList: true, subtree: true });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function empezar() {
    arrancar().catch(function (e) { console.error('[consola-chat]', e); aviso('No se pudo abrir el chat de Cobra: ' + esc(e.message || e)); });
  }
  if (document.readyState === 'loading') _add.call(document, 'DOMContentLoaded', empezar); else empezar();
})();
