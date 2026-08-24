/* ═══════════════════════════════════════════════════════════════════════════
   pos-solo-app.js — Vender se vende en el programa, no en el navegador
   ───────────────────────────────────────────────────────────────────────────
   Decisión de Sergio, 24-ago-2026: *"toda la parte de ventas debería estar
   bloqueada desde el navegador"*.

   El dueño se registra, paga y entra por la web. Desde ahí puede montar su
   restaurante entero —la carta, los precios, los horarios, las zonas— y ver
   cómo va. Lo que NO puede es despachar: para eso instala el programa.

   ── POR QUÉ ────────────────────────────────────────────────────────────
   No es un capricho de licencia. Lo que se bloquea es lo que necesita estar
   en el local para hacerse bien:

     · La caja y el arqueo   → el dinero se cuenta donde está el cajón.
     · Cobrar                → mismo motivo, y ahí está la impresora.
     · Tomar pedidos y venta rápida → van a cocina, y la comanda se imprime.
     · El salón              → el estado de las mesas es de quien está adentro.

   Y hay una razón más fea pero real: anular y descontar desde el celular en
   la calle, sin nadie mirando, es el fraude clásico de un punto de venta.

   ── LO QUE SÍ SE PUEDE DESDE EL NAVEGADOR ──────────────────────────────
   El escritorio, los informes, la configuración entera, la carta, el chat,
   los domicilios, los clientes y las reservas. Es decir: **todo el primer
   día**, que es cuando todavía no ha instalado nada.

   ── QUÉ ES ESTO Y QUÉ NO ES ────────────────────────────────────────────
   Es una regla de operación, no una cerradura contra un atacante: quien tiene
   la cuenta podría saltárselo escribiendo en la consola del navegador. Para lo
   que sí necesita ser infranqueable —anular, descontar— ya está el PIN de
   administrador, que se comprueba contra la base.

   ── LAS DESCARGAS, PENDIENTES A PROPÓSITO ──────────────────────────────
   Sergio, 24-ago: *"lo que el cliente puede descargar lo dejas pendiente
   porque debemos primero completar bien el instalador y pulir las APK"*.
   Cuando estén, se llenan las direcciones en `DESCARGAS` de aquí abajo y el
   botón aparece solo, en el aviso y en la campana. Mientras tanto el aviso
   explica sin ofrecer un botón que no lleva a ninguna parte.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  /* EL ÚNICO SITIO QUE HAY QUE TOCAR cuando el instalador y las APK estén
     listos. Mientras las direcciones estén vacías, no se ofrece descarga. */
  var DESCARGAS = [
    { id: 'exe',  nombre: 'Cobra POS para el computador',
      sub: 'El programa donde se vende, se cobra y se imprime. Windows.', url: '' },
    { id: 'domi', nombre: 'App del domiciliario',
      sub: 'Para el celular de quien reparte. Android.', url: '' },
    { id: 'mesero', nombre: 'App para tomar pedidos',
      sub: 'Para que el mesero tome el pedido en la mesa. Android.', url: '' },
  ];
  function hayDescargas() {
    return DESCARGAS.some(function (d) { return String(d.url || '').trim(); });
  }

  /* Las pantallas de VENDER. El resto del sistema no se toca. */
  var SOLO_APP = {
    'ventas.html':       'el salón',
    'tomar-pedido.html': 'tomar pedidos',
    'venta-rapida.html': 'la venta rápida',
    'pagos.html':        'cobrar',
    'caja.html':         'la caja',
  };

  /* En el ejecutable, `electronPOS` lo inyecta el propio programa. Es el mismo
     detector que ya usan las impresoras y el chat: no se inventa otro. */
  function enLaApp() { return !!w.electronPOS; }

  function aqui() {
    return (location.pathname || '').split('/').pop() || 'dashboard.html';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── El aviso ──────────────────────────────────────────────────────────
  function cerrar() {
    var m = document.getElementById('solo-app-modal');
    if (m) m.remove();
  }

  /* `volver` = el aviso salió porque la persona YA está en una pantalla que no
     puede usar. Entonces no hay "cerrar y seguir": hay que sacarla de ahí, o
     se queda mirando una pantalla muerta sin entender por qué. */
  function avisar(queEs, volver) {
    cerrar();
    var ov = document.createElement('div');
    ov.id = 'solo-app-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);'
      + 'z-index:99600;display:flex;align-items:center;justify-content:center;padding:20px;'
      + 'font-family:DM Sans,system-ui,sans-serif';

    var p = [];
    p.push('<div style="background:#fff;border-radius:18px;width:430px;max-width:100%;overflow:hidden;'
      + 'box-shadow:0 30px 70px -20px rgba(15,23,42,.4)">');
    p.push('<div style="padding:26px 26px 0">');
    p.push('<div style="width:44px;height:44px;border-radius:12px;background:#EEF2FF;display:flex;'
      + 'align-items:center;justify-content:center;margin-bottom:14px">'
      + '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/>'
      + '<line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>');
    p.push('<div style="font-size:19px;font-weight:800;letter-spacing:-.02em;color:#0F172A;margin-bottom:8px">'
      + 'Esto se hace en el programa</div>');
    p.push('<div style="font-size:13.5px;color:#475569;line-height:1.6">'
      + (queEs ? 'Para ' + esc(queEs) + ' hace falta ' : 'Para vender hace falta ')
      + 'Cobra POS instalado en el computador del negocio.</div>');

    /* El porqué, en su idioma. Sin esto parece una traba comercial; con esto se
       entiende que es donde están el cajón y la impresora. */
    p.push('<div style="margin-top:14px;padding:13px;background:#F8FAFC;border-radius:12px;'
      + 'font-size:12.5px;color:#475569;line-height:1.6">'
      + 'La caja, el cobro y las comandas van en el equipo del local: ahí están el cajón del '
      + 'dinero y la impresora de cocina.<br><b style="color:#0F172A">Desde el navegador sí puedes</b> '
      + 'montar tu carta, cambiar precios, configurar todo y ver tus informes.</div>');

    if (!hayDescargas()) {
      p.push('<div style="margin-top:12px;font-size:12.5px;color:#94A3B8;line-height:1.55">'
        + 'El instalador está en camino. Te avisamos aquí mismo cuando puedas descargarlo.</div>');
    }
    p.push('</div>');

    p.push('<div style="display:flex;gap:9px;padding:20px 26px 22px">');
    if (volver) {
      p.push('<button id="sa-volver" style="flex:1;padding:11px;border:none;background:#5B6BFF;color:#fff;'
        + 'border-radius:11px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;'
        + 'box-shadow:0 2px 8px -2px rgba(91,107,255,.45)">Volver al escritorio</button>');
    } else {
      p.push('<button id="sa-cerrar" style="flex:1;padding:11px;border:1.5px solid #E2E8F0;background:#fff;'
        + 'border-radius:11px;font-size:13px;font-weight:600;color:#475569;cursor:pointer;'
        + 'font-family:inherit">Entendido</button>');
    }
    if (hayDescargas()) {
      p.push('<button id="sa-bajar" style="flex:1.3;padding:11px;border:none;background:#0F172A;color:#fff;'
        + 'border-radius:11px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">'
        + 'Descargar</button>');
    }
    p.push('</div></div>');

    ov.innerHTML = p.join('');
    document.body.appendChild(ov);

    var volverAlEscritorio = function () { w.location.href = 'dashboard.html'; };
    if (volver) {
      ov.querySelector('#sa-volver').onclick = volverAlEscritorio;
      /* Tocar afuera TAMBIÉN saca de la pantalla. Si solo cerrara el aviso,
         quedaría delante de una pantalla que no funciona. */
      ov.onclick = function (e) { if (e.target === ov) volverAlEscritorio(); };
    } else {
      ov.querySelector('#sa-cerrar').onclick = cerrar;
      ov.onclick = function (e) { if (e.target === ov) cerrar(); };
    }
    var bajar = ov.querySelector('#sa-bajar');
    if (bajar) bajar.onclick = function () { cerrar(); descargas(); };
  }

  /* La pantalla de descargas. Hoy no se llama nunca porque `DESCARGAS` está
     vacío; queda escrita para el día que el instalador y las APK estén. */
  function descargas() {
    var listos = DESCARGAS.filter(function (d) { return String(d.url || '').trim(); });
    if (!listos.length) return avisar('', false);
    cerrar();
    var ov = document.createElement('div');
    ov.id = 'solo-app-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);'
      + 'z-index:99600;display:flex;align-items:center;justify-content:center;padding:20px;'
      + 'font-family:DM Sans,system-ui,sans-serif';
    var filas = listos.map(function (d) {
      return '<a href="' + esc(d.url) + '" download style="display:flex;align-items:center;gap:12px;'
        + 'padding:13px;border:1px solid #ECEEF2;border-radius:12px;text-decoration:none;color:inherit">'
        + '<span style="flex:1;min-width:0"><span style="display:block;font-size:13.5px;font-weight:700;'
        + 'color:#0F172A">' + esc(d.nombre) + '</span>'
        + '<span style="display:block;font-size:12px;color:#64748B;margin-top:2px">' + esc(d.sub) + '</span></span>'
        + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
        + '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>';
    }).join('');
    ov.innerHTML = '<div style="background:#fff;border-radius:18px;width:440px;max-width:100%;'
      + 'box-shadow:0 30px 70px -20px rgba(15,23,42,.4);padding:26px">'
      + '<div style="font-size:19px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px">Descarga Cobra POS</div>'
      + '<div style="font-size:13px;color:#64748B;line-height:1.6;margin-bottom:16px">'
      + 'Instala el programa en el computador del negocio. Las apps del celular son opcionales.</div>'
      + '<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:18px">' + filas + '</div>'
      + '<button id="sa-cerrar" style="width:100%;padding:11px;border:1.5px solid #E2E8F0;background:#fff;'
      + 'border-radius:11px;font-size:13px;font-weight:600;color:#475569;cursor:pointer;font-family:inherit">'
      + 'Cerrar</button></div>';
    document.body.appendChild(ov);
    ov.querySelector('#sa-cerrar').onclick = cerrar;
    ov.onclick = function (e) { if (e.target === ov) cerrar(); };
  }

  /* Se le pone una marca a las entradas del menú que no van a funcionar, y se
     frena el clic ANTES de navegar. Dejar que entre y sacarla después es peor:
     ve la pantalla dibujarse y luego se le cae encima un aviso. */
  function marcarMenu() {
    var enlaces = document.querySelectorAll('a[href]');
    for (var i = 0; i < enlaces.length; i++) {
      var a = enlaces[i];
      var destino = (a.getAttribute('href') || '').split('?')[0].split('/').pop();
      var queEs = SOLO_APP[destino];
      if (!queEs) continue;
      if (!a.querySelector('.solo-app-marca')) {
        var m = document.createElement('span');
        m.className = 'solo-app-marca';
        m.title = 'Se hace en el programa instalado';
        m.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;opacity:.5;flex-shrink:0';
        m.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" '
          + 'height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
        a.appendChild(m);
      }
      if (!a.dataset.soloApp) {
        a.dataset.soloApp = '1';
        (function (q) {
          a.addEventListener('click', function (ev) {
            if (enLaApp()) return;
            ev.preventDefault(); ev.stopPropagation();
            avisar(q, false);
          }, true);
        })(queEs);
      }
    }
  }

  /* Y la puerta de atrás: quien escriba la dirección a mano o llegue por un
     enlace guardado se encuentra lo mismo. Sin esto la marca del menú sería
     decorativa — el mismo error que casi se cuela con los planes. */
  function protegerPantalla() {
    var queEs = SOLO_APP[aqui()];
    if (!queEs || enLaApp()) return;
    avisar(queEs, true);
  }

  function arrancar() {
    if (enLaApp()) return;          // en el programa no se hace nada de esto
    try { protegerPantalla(); } catch (e) {}
    try { marcarMenu(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(arrancar, 300); });
  } else {
    setTimeout(arrancar, 300);
  }
  /* El menú lo pinta `pos-nav` cuando el sistema ya sabe quién eres, así que se
     vuelve a marcar entonces: si no, las marcas se pierden al repintarse. */
  if (w._pos && w._pos.on) w._pos.on('core:ready', function () { setTimeout(arrancar, 400); });

  w.posSoloApp = {
    enLaApp: enLaApp,
    avisar: avisar,
    descargas: descargas,
    hayDescargas: hayDescargas,
    marcarMenu: marcarMenu,
  };
})(window);
