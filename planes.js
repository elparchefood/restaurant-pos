/*  ══ LOS PLANES ═══════════════════════════════════════════════════════════

    Las cuentas y el comportamiento de la eleccion de plan. Lo usan DOS
    pantallas, con el mismo HTML y el mismo `styles/planes.css`:

      · login.html  — el paso 2 del registro (ahi se compra)
      · index.html  — la seccion de precios de cobrapos.app (ahi se decide)

    ⚠️ POR QUE ESTA COMPARTIDO, y no es por orden. Hasta el 30-ago-2026 la
    pagina de venta tenia sus propias cuentas escritas aparte, y NO CUADRABAN
    con las del registro: cotizaba trimestral −7%% y anual −15%% cuando el
    registro cobra −10%% y −20%%, y encima no aplicaba el descuento por
    sucursales. Alguien veia un precio en la pagina y le cobraban otro al
    pagar. Eso no se arregla acordandose de cambiar los dos sitios: se arregla
    dejando UN solo sitio.

    Este archivo no depende de nada — ni del nucleo del POS, ni del cliente de
    Supabase. La pagina de venta es publica y no puede cargar medio programa
    para enseñar dos precios.

    ── Las tres reglas del precio, que decidio Sergio ──────────────────────

    1. LOS PRECIOS SALEN DE LA BASE (`pos_planes`), no del codigo. Estaban
       escritos en el codigo, y por eso la pantalla podia mostrar un precio
       mientras la consola cobraba otro. Los numeros de aqui son solo el
       salvavidas por si la consulta falla, y hoy son los correctos.

    2. LOS DOS DESCUENTOS SE APLICAN EN ORDEN: *"primero se calcula el precio
       con descuento por sucursales, y al total ya descontado se le hace el
       descuento si paga trimestral o anual"*. Esta asi en los terminos y en
       la pantalla de cuenta suspendida. Los sitios tienen que dar el mismo
       numero o alguien va a reclamar con razon.

    3. LOS TRAMOS SON 8+ / 4–7 / 2–3.                                        */

window.CobraPlan = (function () {
  'use strict';

  //  Precios base (COP/mes/sucursal). Se sobrescriben con los de `pos_planes`.
  var PRECIOS_BASE = { starter: 149000, pro: 249000 };

  var PERIODOS = {
    mensual:    { meses: 1,  off: 0,    ciclo: '/ mes',       largo: 'mensual'    },
    trimestral: { meses: 3,  off: 0.10, ciclo: '/ trimestre', largo: 'trimestral' },
    anual:      { meses: 12, off: 0.20, ciclo: '/ año',       largo: 'anual'      }
  };

  /*  El estado de la eleccion. En el registro ESTE MISMO objeto es `REG`: se
      le cuelgan encima el nombre, el correo y la clave. Asi no hay dos
      verdades que sincronizar.                                             */
  var ESTADO = { plan: 'pro', branches: 1, billing: 'mensual', totalMes: 0, totalCiclo: 0 };

  var OPC = {};   // lo que cada pantalla quiere que pase al tocar los botones

  function $(id) { return document.getElementById(id); }
  function COPF(n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); }

  // ── Las cuentas ──────────────────────────────────────────────────────
  function volDiscount(n) {
    if (n >= 8) return .30;
    if (n >= 4) return .20;
    if (n >= 2) return .10;
    return 0;
  }

  /*  Lo que cuesta UNA sucursal al mes con los dos descuentos puestos. Es la
      cifra grande de la tarjeta: la gente compara planes por sucursal, no por
      factura.                                                              */
  function unitMensual(plan, branches, billing) {
    var base = PRECIOS_BASE[plan] || 0;
    var per  = PERIODOS[billing] || PERIODOS.mensual;
    return base * (1 - volDiscount(branches)) * (1 - per.off);
  }
  //  Lo que transfiere HOY: el mes, el trimestre o el año completo.
  function montoAhora(plan, branches, billing) {
    var per = PERIODOS[billing] || PERIODOS.mensual;
    return unitMensual(plan, branches, billing) * per.meses * branches;
  }
  //  Y a cuanto le sale el mes, para poder compararlo con el precio mensual.
  function mensualEfectivo(plan, branches, billing) {
    return unitMensual(plan, branches, billing) * branches;
  }

  /*  Los precios de verdad. Si la consulta falla quedan los de arriba: lo que
      no puede pasar es una pantalla en blanco o en $0 mientras carga.

      Se acepta el cliente de Supabase si la pantalla ya tiene uno (el
      registro), y si no se pide por HTTP normal (la pagina de venta, que no
      carga el nucleo). La tabla la puede leer cualquiera: su politica se
      llama "planes: los lee cualquiera".                                   */
  var SB_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

  function cargarPrecios(sb) {
    var pide;
    if (sb && sb.from) {
      pide = sb.from('pos_planes').select('plan,precio').eq('a_la_venta', true)
               .then(function (r) { return r.error ? null : r.data; });
    } else {
      pide = fetch(SB_URL + '/rest/v1/pos_planes?select=plan,precio&a_la_venta=eq.true',
                   { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
               .then(function (r) { return r.ok ? r.json() : null; });
    }
    return pide.then(function (filas) {
      if (!filas || !filas.length) return;
      filas.forEach(function (p) {
        if (p.precio != null) PRECIOS_BASE[p.plan] = Number(p.precio);
      });
      pintar();
    }).catch(function (e) {
      console.warn('[planes] no se pudieron leer los precios:', e && e.message);
    });
  }

  // ── Los controles ────────────────────────────────────────────────────
  function enganchar(opciones) {
    OPC = opciones || {};
    var raiz = $('plan-root');
    if (!raiz) return;

    raiz.querySelectorAll('[data-branches]').forEach(function (b) {
      b.addEventListener('click', function () { setChip(parseInt(b.dataset.branches, 10)); });
    });
    var menos = $('branch-minus'), mas = $('branch-plus');
    if (menos) menos.addEventListener('click', function () { stepBranch(-1); });
    if (mas)   mas.addEventListener('click',   function () { stepBranch(1); });

    raiz.querySelectorAll('[data-billing]').forEach(function (b) {
      b.addEventListener('click', function () { setBilling(b.dataset.billing); });
    });

    /*  La tarjeta entera selecciona, pero el boton de dentro NO puede propagar
        el clic: contaria dos veces y la seleccion parpadearia.             */
    raiz.querySelectorAll('.p2-card').forEach(function (card) {
      card.addEventListener('click', function () { seleccionar(card.dataset.plan); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(card.dataset.plan); }
      });
    });

    /*  El boton de cada tarjeta. En el registro SELECCIONA; en la pagina de
        venta LLEVA AL REGISTRO con ese plan ya escogido. Lo decide la
        pantalla, no este archivo.                                          */
    ['starter', 'pro'].forEach(function (id) {
      var b = $('choose-' + id);
      if (!b) return;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (OPC.alElegir) OPC.alElegir(id);
        else seleccionar(id);
      });
    });

    var verPro = $('ver-pro');
    if (verPro) verPro.addEventListener('click', function (e) { e.stopPropagation(); seleccionar('pro'); });

    var atras = $('btn-back');
    if (atras && OPC.alVolver) atras.addEventListener('click', OPC.alVolver);
    var seguir = $('btn-continue');
    if (seguir && OPC.alContinuar) seguir.addEventListener('click', OPC.alContinuar);
  }

  function seleccionar(plan) {
    if (plan !== 'starter' && plan !== 'pro') return;
    ESTADO.plan = plan;
    pintar();
  }
  function setChip(n) {
    ESTADO.branches = Math.max(1, Math.min(99, parseInt(n, 10) || 1));
    pintar();
  }
  function stepBranch(delta) { setChip(ESTADO.branches + delta); }
  function setBilling(mode) {
    if (!PERIODOS[mode]) return;
    ESTADO.billing = mode;
    pintar();
  }

  /*  ── La animacion de las cifras ──────────────────────────────────────
      260 ms contando desde el valor anterior hasta el nuevo. Es lo que hace
      que se ENTIENDA que el precio bajo al añadir sucursales o al pasar a
      anual: un numero que cambia de golpe se lee como si siempre hubiera
      dicho eso.                                                            */
  var _cifras = {};
  function animarCifra(el, hasta, colaHtml) {
    if (!el) return;
    var id = el.id || (el.id = 'c' + Math.random().toString(36).slice(2));
    var desde = _cifras[id];
    _cifras[id] = hasta;
    var pinta = function (v) { el.innerHTML = COPF(v) + (colaHtml || ''); };
    var DUR = 260;
    /*  Y si no puede animar, PINTA EL NUMERO Y YA. `document.hidden` es el
        caso que casi se cuela: en una pestaña que no se esta viendo el
        navegador no llama a requestAnimationFrame ni una sola vez, asi que la
        animacion no es que se vea fea — es que **el precio se queda en el
        anterior**. Un total viejo en la pantalla de cobro no es un detalle
        visual.                                                             */
    if (desde == null || desde === hasta || !window.requestAnimationFrame ||
        document.hidden ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pinta(hasta);
      return;
    }
    /*  Y por si el navegador deja la animacion a medias (cambio de pestaña
        mientras corre), un ultimo repaso al final: si nadie pidio otra cifra
        despues, la buena es esta.                                          */
    setTimeout(function () { if (_cifras[id] === hasta) pinta(hasta); }, DUR + 150);
    var t0 = null;
    var paso = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR);
      pinta(desde + (hasta - desde) * (1 - Math.pow(1 - p, 3)));   // easeOutCubic
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function _ver(id, mostrar) { var e = $(id); if (e) e.hidden = !mostrar; }
  function _txt(id, val)     { var e = $(id); if (e) e.textContent = val; }

  // ── Pintar ───────────────────────────────────────────────────────────
  function pintar() {
    if (!$('plan-root')) return;
    var off = volDiscount(ESTADO.branches);
    var per = PERIODOS[ESTADO.billing] || PERIODOS.mensual;

    document.querySelectorAll('[data-branches]').forEach(function (b) {
      b.classList.toggle('on', parseInt(b.dataset.branches, 10) === ESTADO.branches);
    });
    _txt('branch-count', ESTADO.branches);

    document.querySelectorAll('[data-billing]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.billing === ESTADO.billing);
    });

    _ver('volume-off', off > 0);
    _txt('volume-off-pct', '−' + Math.round(off * 100) + '%');

    ['starter', 'pro'].forEach(function (id) {
      var base = PRECIOS_BASE[id] || 0;
      var unit = unitMensual(id, ESTADO.branches, ESTADO.billing);
      var card = $('card-' + id);
      if (card) card.classList.toggle('on', id === ESTADO.plan);

      animarCifra($('price-' + id), unit, '<span class="p2-per">/ mes</span>');
      _txt('perday-' + id, COPF(unit / 30));

      _ver('strike-' + id, unit < base - 0.5);
      _txt('strike-' + id, COPF(base));

      var pct = Math.round((1 - unit / (base || 1)) * 100);
      _ver('savepill-' + id, pct > 0);
      _txt('savepill-' + id, 'Ahorra ' + pct + '%');

      /*  El boton de la tarjeta elegida dice "Seleccionado" con su check; el
          de la otra vuelve a invitar. Sin esto las dos se ven iguales y no hay
          manera de saber cual se esta comprando.

          En la pagina de venta no se esta comprando todavia, asi que ahi el
          boton siempre invita: lo decide `OPC.textoBoton`.                 */
      var btn = $('choose-' + id);
      if (btn) {
        btn.innerHTML = OPC.textoBoton
          ? OPC.textoBoton(id, id === ESTADO.plan)
          : ((id === ESTADO.plan)
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Seleccionado'
              : 'Elegir ' + (id === 'pro' ? 'Pro' : 'Starter'));
      }
    });

    ESTADO.totalMes   = mensualEfectivo(ESTADO.plan, ESTADO.branches, ESTADO.billing);
    ESTADO.totalCiclo = montoAhora(ESTADO.plan, ESTADO.branches, ESTADO.billing);

    var nombrePlan = ESTADO.plan === 'pro' ? 'Pro' : 'Starter';
    _txt('foot-plan', nombrePlan);
    _txt('foot-branches', ESTADO.branches === 1 ? '1 sucursal' : ESTADO.branches + ' sucursales');
    _txt('foot-billing', per.largo);
    _ver('foot-off', off > 0);
    _txt('foot-off', '−' + Math.round(off * 100) + '%');
    animarCifra($('foot-amount'), ESTADO.totalCiclo, '');
    _txt('foot-cycle', per.ciclo);
    _ver('foot-eq', ESTADO.billing !== 'mensual');
    _txt('foot-eq', '≈ ' + COPF(ESTADO.totalMes) + '/mes');
    _txt('btn-continue-label', 'Continuar con ' + nombrePlan);

    if (OPC.alPintar) OPC.alPintar(ESTADO);
  }

  /*  Arranca todo de un golpe: engancha, pinta con los precios de respaldo y
      pide los de verdad. Se pinta ANTES de la consulta a proposito: nadie
      puede ver $0 mientras carga.                                          */
  function iniciar(opciones) {
    enganchar(opciones);
    pintar();
    cargarPrecios(opciones && opciones.sb);
  }

  return {
    ESTADO: ESTADO,
    PERIODOS: PERIODOS,
    PRECIOS_BASE: PRECIOS_BASE,
    COPF: COPF,
    iniciar: iniciar,
    enganchar: enganchar,
    pintar: pintar,
    seleccionar: seleccionar,
    cargarPrecios: cargarPrecios,
    volDiscount: volDiscount,
    unitMensual: unitMensual,
    montoAhora: montoAhora,
    mensualEfectivo: mensualEfectivo
  };
})();
