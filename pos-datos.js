/* ═══════════════════════════════════════════════════════════════════════════
   pos-datos.js — Lo que NO cambia durante un turno, traído UNA sola vez
   ───────────────────────────────────────────────────────────────────────────
   Decisión de Sergio, 24-ago-2026:

     "Es mejor que el ejecutable tarde un poco en abrir pero que todo el
      programa funcione fluido, a que abra rápido pero todo el tiempo se
      esfuerce para conseguir datos que nunca cambian."

   MEDIDO en el servicio de la noche del 23-ago, para saber qué entra aquí:

     | dato                        | veces que cambió esa noche |
     |-----------------------------|----------------------------|
     | carta (productos, precios)  | 0                          |
     | categorías                  | 0                          |
     | adiciones y sus precios     | 0                          |
     | plano del salón             | 0                          |
     | recetas                     | 0                          |
     | zonas de domicilio, pagos   | 0                          |
     | horarios, datos del negocio | 0                          |

   Cero. Y aun así cada pantalla lo volvía a pedir al abrirse.

   ── QUÉ NO ENTRA AQUÍ, Y ES LA REGLA IMPORTANTE ─────────────────────────
   El turno EN VIVO no se guarda nunca. Esa misma noche cambiaron: el estado
   de las mesas (284 veces por mesa), 211 mensajes, 230 movimientos de
   inventario, 21 pedidos, 37 líneas y 21 pagos. Si algo de eso se mostrara
   guardado, se vería una mesa libre que está ocupada o un pedido ya cobrado.

   Del salón se guarda LA FORMA (cuántas mesas, cómo se llaman, en qué zona);
   nunca el ESTADO (ocupada, el reloj, la cuenta). Esa distinción ya costó una
   corrección el 4-ago y no se toca.

   ── EL INSUMO NO ES SU CANTIDAD (lo corrigió Sergio, 24-ago) ────────────
   Yo había puesto los insumos en la lista de "cambia todo el tiempo". Está
   mal, y él lo dijo mejor: *"la carne siempre será carne... lo que cambia es
   la cantidad del insumo, no el insumo en sí"*.

   Y la base ya lo tiene separado desde antes:
     · `iv_insumos`     → nombre, unidad, precio, conversión, mínimo. ESTÁTICO.
       (sus viejas columnas de stock se llaman literalmente
        `stock_migrado_no_usar`: ya se sacaron de ahí)
     · `iv_existencias` → stock, stock_servicio, agotado_manual. EN VIVO.

   Por eso aquí entran los insumos y las recetas, pero JAMÁS las existencias.
   De las existencias sale el aviso de "agotado" en las pantallas de pedido, y
   eso sí cambia a cada rato: si se guardara, un cajero seguiría vendiendo algo
   que se acabó hace media hora. Y eso pasa todos los días, al revés que
   cambiar un precio.

   ── EN QUÉ SE DIFERENCIA DE pos-cache.js ────────────────────────────────
   `pos-cache` pinta con lo guardado y ADEMÁS sale a preguntar por detrás. Es
   rápido para el ojo, pero el programa sigue viajando. Aquí no: se trae una
   vez al abrir y durante toda la sesión no se vuelve a preguntar. Se apoya en
   `pos-cache` para guardar (que ya separa por restaurante y controla el
   tamaño), pero la política de refresco es otra.

   ── CUÁNDO SE ACTUALIZA ─────────────────────────────────────────────────
   1. Al abrir el programa.
   2. Cuando el dueño guarda un cambio: la pantalla que guardó llama a
      `posDatos.invalidar()` y lo deja fresco en ESE equipo al instante.
   En otro equipo se ve al reabrir. Sergio: "ninguna persona va a estar
   trabajando y en la mitad del turno cambiar el precio de un producto".

   ── QUIÉN LO USA ────────────────────────────────────────────────────────
   Las pantallas de TURNO (ventas, tomar pedido, venta rápida, domicilios),
   que solo leen. Las de EDICIÓN (catálogo, configuración, inventario) siguen
   preguntando en vivo a propósito: ahí es donde se cambian las cosas y hay que
   ver lo último.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var LLAVE = 'datos.turno';
  /* Ocho horas: más que un turno. Si alguien deja el programa abierto dos días,
     al octavo día de sesión vuelve a traerlo — no por necesidad, sino para que
     un equipo olvidado encendido no se quede con la carta del mes pasado. */
  var EDAD_MAX = 8 * 3600;

  var memoria = null;      // lo cargado en ESTA sesión
  var cargando = null;     // la promesa en curso, para no traerlo dos veces

  function sb() {
    try { return (w._pos && w._pos.sb) || w.sb || null; } catch (e) { return w.sb || null; }
  }
  function estado() { return (w._pos && w._pos.state) || {}; }

  /* Las columnas son la UNIÓN de lo que piden las pantallas de turno. Se pide
     una vez lo que antes se pedía cuatro veces con recortes distintos. */
  var COLS_PROD = 'id,name,price,price_mode,category_id,photo_url,available,'
                + 'presentations,variables,mod_group_ids,mod_group_pres,sort_order';

  async function traer() {
    var s = sb(), st = estado();
    var tid = st.tenantId, bid = st.branchId;
    if (!s || !tid) return null;

    /* TODO DE UNA VEZ, no en fila india. Son consultas independientes: pedirlas
       seguidas serían siete viajes de ida y vuelta (medido: 70–130 ms cada uno
       desde Popayán). Juntas, cuesta uno. */
    var r = await Promise.allSettled([
      s.from('pos_products').select(COLS_PROD).eq('tenant_id', tid).order('name'),
      s.from('pos_categories').select('*').eq('tenant_id', tid).order('sort_order'),
      s.from('pos_modifier_groups').select('id,name,rule,multi,options').eq('tenant_id', tid),
      bid ? s.from('pos_tables').select('id,name,zone_id,zone_name,sort_order,capacity').eq('branch_id', bid)
          : Promise.resolve({ data: [] }),
      bid ? s.from('ia_config').select('horarios,pagos,domicilios,frases,respuestas_rapidas').eq('branch_id', bid).maybeSingle()
          : Promise.resolve({ data: null }),
      /* La IDENTIDAD del insumo, SIN sus existencias. Ojo con no añadirle aquí
         el join a iv_existencias que hace pos-stock: eso congelaría el stock. */
      /* Viajan tambien brand_id/branch_id: pos-stock filtra los insumos por
         marca o por sede segun el modo de inventario, y sin esos campos no
         podria hacer el MISMO filtro que hace hoy. */
      s.from('iv_insumos').select('id,nombre,control_manual,sub_inventario,vender_bodega,aviso_bodega,buy_unit,use_unit,conversion,brand_id,branch_id,tenant_id').eq('tenant_id', tid),
      s.from('iv_recetas').select('product_id,insumo_id,variant_option_id,cantidades,mod_option_id,brand_id,branch_id,tenant_id').eq('tenant_id', tid),
    ]);

    function ok(i, porDefecto) {
      var x = r[i];
      if (x.status !== 'fulfilled' || (x.value && x.value.error)) return porDefecto;
      return (x.value && x.value.data) || porDefecto;
    }

    /* SI LA CARTA NO LLEGA, NO SE GUARDA NADA. Guardar una carta vacía sería
       peor que no guardar: la pantalla mostraría un restaurante sin productos y
       nadie sabría por qué. Mejor que esta vez pregunte a la base. */
    var productos = ok(0, null);
    if (!productos || !productos.length) return null;

    return {
      productos:  productos,
      categorias: ok(1, []),
      adiciones:  ok(2, []),
      plano:      ok(3, []),
      config:     ok(4, null),
      insumos:    ok(5, []),
      recetas:    ok(6, []),
      cuando:     Date.now(),
      tenant:     tid,
      sucursal:   bid || null
    };
  }

  /* Deja los datos listos. Se puede llamar desde varias pantallas a la vez: si
     ya hay una carga en curso, se espera a esa en vez de lanzar otra. */
  function cargar(forzar) {
    if (!forzar && memoria) return Promise.resolve(memoria);
    if (cargando) return cargando;

    if (!forzar) {
      try {
        var g = w.posCache && w.posCache.leer(LLAVE, EDAD_MAX);
        /* Solo sirve si es de ESTE restaurante y ESTA sucursal: en un equipo
           donde se cambia de sede, la carta puede ser otra. */
        if (g && g.datos && g.datos.tenant === estado().tenantId
            && (g.datos.sucursal || null) === (estado().branchId || null)) {
          memoria = g.datos;
          return Promise.resolve(memoria);
        }
      } catch (e) { /* sin guardado: se pide */ }
    }

    cargando = traer().then(function (d) {
      cargando = null;
      if (d) {
        memoria = d;
        try { if (w.posCache) w.posCache.guardar(LLAVE, d); } catch (e) {}
      }
      return d;
    }).catch(function (e) {
      cargando = null;
      console.warn('[datos] no se pudieron traer:', e && e.message);
      return null;
    });
    return cargando;
  }

  /* Lo que el dueño acaba de cambiar. Se vuelve a traer YA, para que en su
     propio equipo el cambio se vea sin cerrar el programa. */
  function invalidar() {
    memoria = null;
    try { if (w.posCache) w.posCache.borrar(LLAVE); } catch (e) {}
    return cargar(true);
  }

  function parte(nombre, porDefecto) {
    return function () {
      return (memoria && memoria[nombre] != null) ? memoria[nombre] : porDefecto;
    };
  }

  /* SE CARGA SOLO, sin que ninguna pantalla tenga que acordarse de llamarlo.
     Espera a que pos-core sepa el restaurante y la sucursal: sin eso no se
     puede pedir nada, y peor aun, se guardaria con la sucursal equivocada.
     `_pos.on` reentrega los avisos ya emitidos, asi que llegar tarde no cuelga.

     Es una carga de fondo: nadie la espera. Quien necesite los datos llama a
     `posDatos.cargar()` y recibe la misma promesa que ya esta en curso. */
  function arrancar() {
    try {
      if (w._pos && typeof w._pos.on === 'function') {
        w._pos.on('core:ready', function () { cargar(); });
        return;
      }
    } catch (e) {}
    /* Sin pos-core (una pantalla suelta): se intenta igual, sin prisa. */
    setTimeout(function () { cargar(); }, 1200);
  }
  arrancar();

  w.posDatos = {
    cargar:     cargar,
    invalidar:  invalidar,
    listo:      function () { return !!memoria; },
    productos:  parte('productos', []),
    categorias: parte('categorias', []),
    adiciones:  parte('adiciones', []),
    plano:      parte('plano', []),
    config:     parte('config', null),
    insumos:    parte('insumos', []),
    recetas:    parte('recetas', [])
  };
})(window);
