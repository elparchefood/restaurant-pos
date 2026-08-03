/* pos-plan.js — Qué puede usar cada restaurante según su plan.
 *
 * Regla de Sergio: los botones NO desaparecen. Todo se ve exactamente igual.
 * Si alguien toca algo que su plan no incluye, se le explica qué es y en qué
 * plan viene, con la opción de actualizar.
 *
 * Esconder la función haría que el dueño ni sepa que existe — y lo que no se
 * ve, no se compra. Un candado visible es publicidad; un botón ausente no es
 * nada.
 *
 * Lo que incluye cada plan vive en `pos_planes.funciones` (una lista de texto),
 * no aquí: así se cambia sin tocar código y sin volver a desplegar.
 */
(function () {
  'use strict';

  var ctx = null;          // { plan, funciones[], nombrePlan }
  var cargando = null;     // promesa en curso, para no consultar dos veces

  function sb() {
    return (window._pos && window._pos.sb) || (typeof window.sb !== 'undefined' ? window.sb : null);
  }

  /* Qué es cada función y en qué plan viene. Es lo que se le muestra al dueño
     cuando toca algo que no tiene, así que está escrito en su idioma: dice el
     RESULTADO, no la función. */
  var CATALOGO = {
    inventario: {
      titulo: 'Control de inventario',
      plan: 'Pro',
      que: 'Insumos, recetas y costeo por plato. El sistema sabe solo cuándo un producto se acabó y lo deja de ofrecer.',
      mas: ['Bodega y nevera por separado', 'Cuánto te cuesta cada plato de verdad', 'Qué hay que comprar, al cerrar la caja'],
    },
    chat_ia: {
      titulo: 'Atención automatizada',
      plan: 'Pro',
      que: 'Contesta tu WhatsApp y toma los pedidos sola, también cuando el local está cerrado.',
      mas: ['5.000 mensajes al mes', 'Crea el pedido sin que nadie lo escriba', 'Le avisa al cliente cuando su pedido va en camino'],
    },
    comprobantes_ia: {
      titulo: 'Lectura de comprobantes',
      plan: 'Pro',
      que: 'Lee el comprobante que manda el cliente y confirma monto, cuenta y hora contra el correo de tu banco.',
      mas: ['Se acabaron los comprobantes falsos', 'Sin salir del chat'],
    },
    avisos_estado: {
      titulo: 'Avisos al cliente',
      plan: 'Pro',
      que: 'Le avisa al cliente solo cuando su pedido cambia de estado.',
      mas: ['Menos llamadas preguntando "¿ya salió?"'],
    },
    puntos: {
      titulo: 'Puntos y fidelización',
      plan: 'Pro',
      que: 'Tus clientes acumulan puntos por compra y los redimen en productos que tú eliges.',
      mas: ['Catálogo de canje configurable', 'El cliente consulta sus puntos por el chat', 'Los puntos van al teléfono, no a una tarjeta que se pierde'],
    },
    multimarca: {
      titulo: 'Varias marcas y sucursales',
      plan: 'Pro',
      que: 'Maneja más de una marca y todas las sucursales que quieras desde la misma cuenta.',
      mas: ['Carta por marca con precios por sucursal', 'Cambias de una a otra sin volver a entrar'],
    },
    informes_avanzados: {
      titulo: 'Informes avanzados',
      plan: 'Pro',
      que: 'Productos más vendidos, horas pico, ventas por mesero y ranking de rentabilidad.',
      mas: ['Saber qué plato deja plata de verdad', 'A qué hora necesitas más gente'],
    },
    dian: {
      titulo: 'Facturación electrónica',
      plan: 'Pro',
      que: 'Factura electrónica DIAN desde el mismo sistema.',
      mas: ['1.000 documentos al mes'],
    },
    admin_whatsapp: {
      titulo: 'Administración por WhatsApp',
      plan: 'Premium',
      que: 'Maneja el inventario y pide reportes escribiéndole al sistema por WhatsApp, sin abrir el computador.',
      mas: ['"Compré 2 pacas de gaseosa a 30 mil" y el inventario se actualiza solo', '"¿Qué falta?" y te responde'],
    },
    nfc: {
      titulo: 'Tarjeta física y recargas',
      plan: 'Premium',
      que: 'Tarjeta NFC para tus clientes y saldo prepagado.',
      mas: ['El cliente acerca la tarjeta y listo'],
    },
    consolidado: {
      titulo: 'Informes consolidados',
      plan: 'Premium',
      que: 'Todas tus sucursales en un solo informe.',
      mas: ['Comparar sucursales entre sí'],
    },
    kardex: {
      titulo: 'Kardex valorado',
      plan: 'Premium',
      que: 'El movimiento de cada insumo con su valor, para saber cuánta plata tienes en bodega.',
      mas: [],
    },
    marketing: {
      titulo: 'Anuncios de Meta',
      plan: 'Premium',
      que: 'Crea y mide anuncios de Facebook e Instagram desde el sistema.',
      mas: [],
    },
  };

  /* Qué función pide cada pantalla. Se usa para poner el candado en el menú.
     Ojo: Informes NO va aquí — el plan Starter sí tiene informes básicos, así
     que la pantalla debe abrir y el candado va adentro, en las secciones
     avanzadas. */
  var PANTALLAS = {
    'chat-ia.html':    'chat_ia',
    'inventario.html': 'inventario',
  };

  async function cargar() {
    if (ctx) return ctx;
    if (cargando) return cargando;
    cargando = (async function () {
      var s = sb();
      /* Sin sesion (login, registro, onboarding) no se bloquea nada:
         `funciones: null` significa "dejar pasar". Poner una lista vacia aqui
         haria que esas pantallas se comporten como un Starter sin nada. */
      var por_defecto = { plan: '', funciones: null };
      if (!s) return (ctx = por_defecto);
      try {
        var u = (window._pos && window._pos.state && window._pos.state.user) || null;
        if (!u) { try { u = (await s.auth.getUser()).data.user; } catch (e) {} }
        if (!u) return (ctx = por_defecto);   // sin sesion: no bloquear
        var tenantId = (u.user_metadata && u.user_metadata.tenant_id) || u.id;

        var t = await s.from('tenants').select('plan').eq('id', tenantId).maybeSingle();
        var plan = (t.data && t.data.plan) || 'starter';
        var p = await s.from('pos_planes').select('nombre,funciones').eq('plan', plan).maybeSingle();
        ctx = {
          plan: plan,
          nombrePlan: (p.data && p.data.nombre) || plan,
          funciones: (p.data && p.data.funciones) || [],
        };
      } catch (e) {
        /* Si falla la consulta NO se bloquea nada: es peor dejar a un cliente
           que sí pagó sin poder trabajar que dejar entrar a uno que no. */
        console.warn('[plan] no se pudo leer, se deja pasar todo:', e);
        ctx = { plan: 'desconocido', nombrePlan: '', funciones: null };
      }
      return ctx;
    })();
    return cargando;
  }

  function puede(clave) {
    if (!ctx) return true;                 // todavía no cargó: no estorbar
    if (ctx.funciones === null) return true;   // falló la consulta: dejar pasar
    return ctx.funciones.indexOf(clave) >= 0;
  }

  // ── El modal ──────────────────────────────────────────────────────────
  function cerrar() {
    var m = document.getElementById('pos-plan-modal');
    if (m) m.remove();
  }

  function mostrar(clave) {
    var f = CATALOGO[clave];
    if (!f) return;
    cerrar();
    var ov = document.createElement('div');
    ov.id = 'pos-plan-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(4px);' +
      'z-index:99000;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.onclick = function (e) { if (e.target === ov) cerrar(); };

    var extras = (f.mas || []).map(function (x) {
      return '<div style="display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#334155;line-height:1.55">' +
        '<span style="color:#16A34A;flex-shrink:0;margin-top:1px">&#10003;</span><span>' + x + '</span></div>';
    }).join('');

    ov.innerHTML =
      '<div style="background:#fff;border-radius:18px;padding:26px;width:400px;max-width:100%;' +
      'box-shadow:0 24px 70px rgba(15,23,42,.28);font-family:inherit">' +
        '<div style="display:flex;align-items:center;gap:13px;margin-bottom:16px">' +
          '<div style="width:44px;height:44px;border-radius:12px;background:#EEF2FF;display:flex;' +
          'align-items:center;justify-content:center;flex-shrink:0">' +
            '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/>' +
            '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
          '</div>' +
          '<div style="min-width:0">' +
            '<div style="font-size:16.5px;font-weight:700;color:#0F172A">' + f.titulo + '</div>' +
            '<div style="font-size:12.5px;color:#5B6BFF;font-weight:600">Viene con el plan ' + f.plan + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:13.5px;color:#475569;line-height:1.65;margin-bottom:' + (extras ? '14px' : '20px') + '">' +
          f.que + '</div>' +
        (extras ? '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;padding:14px;' +
                  'background:#F8FAFC;border-radius:12px">' + extras + '</div>' : '') +
        '<div style="display:flex;gap:9px">' +
          '<button id="pos-plan-no" style="flex:1;padding:11px;border:1.5px solid #E2E8F0;background:#fff;' +
          'border-radius:11px;font-size:13.5px;font-weight:600;color:#64748B;cursor:pointer;font-family:inherit">' +
          'Ahora no</button>' +
          '<button id="pos-plan-si" style="flex:1.4;padding:11px;border:none;background:#5B6BFF;color:#fff;' +
          'border-radius:11px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">' +
          'Quiero el plan ' + f.plan + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);
    ov.querySelector('#pos-plan-no').onclick = cerrar;
    ov.querySelector('#pos-plan-si').onclick = function () {
      cerrar();
      /* El camino para comprar todavía no existe. Cuando exista, se engancha
         aquí definiendo window.posPlanContratar. Mientras tanto se avisa, en vez
         de dejar un botón que no hace nada. */
      if (typeof window.posPlanContratar === 'function') { window.posPlanContratar(clave, f.plan); return; }
      alert('Para activar el plan ' + f.plan + ', comunícate con nosotros.');
    };
  }

  /* Pide una función. Si el plan la tiene, devuelve true y sigue el flujo.
     Si no, muestra el modal y devuelve false. Se usa así:
        if (!posPlan.exigir('puntos')) return; */
  function exigir(clave) {
    if (puede(clave)) return true;
    mostrar(clave);
    return false;
  }

  // ── El candado en el menú ─────────────────────────────────────────────
  function marcarNav() {
    var items = document.querySelectorAll('a[href]');
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var destino = (a.getAttribute('href') || '').split('?')[0].split('/').pop();
      var clave = PANTALLAS[destino];
      if (!clave || puede(clave)) continue;
      if (a.dataset.posPlanMarcado) continue;
      a.dataset.posPlanMarcado = '1';

      // El botón se queda igual, solo con un candado pequeño al lado.
      var lock = document.createElement('span');
      lock.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;opacity:.55;flex-shrink:0';
      lock.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" ' +
        'height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      a.appendChild(lock);

      (function (k) {
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          mostrar(k);
        }, true);
      })(clave);
    }
  }

  /* Proteger la PANTALLA, no solo el boton: si alguien escribe la direccion a
     mano o llega por un enlace viejo, tiene que encontrarse lo mismo. Sin esto
     el candado del menu seria decorativo. */
  function protegerPantalla() {
    var aqui = location.pathname.split('/').pop();
    var clave = PANTALLAS[aqui];
    if (!clave || puede(clave)) return;
    mostrar(clave);
    // Al cerrar el modal se vuelve al escritorio: no tiene sentido dejarlo
    // parado en una pantalla que no puede usar.
    var mod = document.getElementById('pos-plan-modal');
    if (mod) {
      var volver = function () { location.href = 'dashboard.html'; };
      mod.querySelector('#pos-plan-no').onclick = volver;
      mod.onclick = function (e) { if (e.target === mod) volver(); };
    }
  }

  window.posPlan = {
    cargar: cargar,
    puede: puede,
    exigir: exigir,
    mostrar: mostrar,
    marcarNav: marcarNav,
    ctx: function () { return ctx; },
  };

  // Arranca solo: carga el plan y pone los candados del menú.
  function arrancar() {
    cargar().then(function () {
      try { marcarNav(); } catch (e) {}
      try { protegerPantalla(); } catch (e) {}
    });
  }
  if (window._pos && window._pos.on) window._pos.on('core:ready', arrancar);
  if (document.readyState !== 'loading') setTimeout(arrancar, 400);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(arrancar, 400); });
})();
