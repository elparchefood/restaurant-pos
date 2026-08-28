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
  /* TODAS las columnas de `pos_products`, a proposito. Dos de las tres
     pantallas de venta piden `select('*')`, asi que si aqui se guardara un
     recorte, cambiarlas por lo guardado les quitaria columnas en silencio: no
     dan error, simplemente dejan de pintar una medalla o de cobrar un
     impuesto. Escritas una por una y no como `*` para que se vea que se
     compararon con la tabla — si manana se agrega una columna, hay que
     anadirla aqui (y el dia que falte, se nota leyendo esta linea). */
  var COLS_PROD = 'id,category_id,name,description,price,image_url,available,'
                + 'sort_order,branch_id,tenant_id,photo_url,presentations,variables,'
                + 'mod_group_ids,price_mode,mod_group_pres,impuesto_pct,brand_id,'
                + 'medalla,agotado,carta_grande,medalla_valor';

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
      s.from('iv_insumos').select('id,nombre,control_manual,sub_inventario,vender_bodega,aviso_bodega,agota_producto,buy_unit,use_unit,conversion,brand_id,branch_id,tenant_id').eq('tenant_id', tid),
      s.from('iv_recetas').select('product_id,insumo_id,variant_option_id,cantidades,mod_option_id,brand_id,branch_id,tenant_id').eq('tenant_id', tid),
      /* De que MARCA es esta sede, y si el inventario es uno solo para toda la
         marca o uno por sucursal. Dos preguntas que el detector de agotados
         hacia UNA POR UNA cada vez que se abria una pantalla de venta, y cuya
         respuesta no cambia nunca durante un turno. */
      bid ? s.from('branches').select('brand_id').eq('id', bid).maybeSingle()
          : Promise.resolve({ data: null }),
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

    /* El modo de inventario cuelga de la marca, asi que su consulta no puede ir
       en el paquete de arriba: hasta ahi no se sabe cual es la marca. Es UN
       viaje mas al abrir, a cambio de dos menos en CADA pantalla de venta. */
    var marca = (ok(7, null) || {}).brand_id || null;
    var modo = 'global';
    if (marca) {
      try {
        var ma = await s.from('brands').select('inventario_modo').eq('id', marca).maybeSingle();
        modo = (ma.data && ma.data.inventario_modo) || 'global';
      } catch (e) { /* sin respuesta: 'global', que es lo de siempre */ }
    }

    return {
      negocio:    { brandId: marca, inventarioModo: modo },
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

  /* ── LA CARTA, LISTA PARA PINTAR ────────────────────────────────────────
     Las tres pantallas de venta pedian lo mismo con recortes y ordenes
     ligeramente distintos. Aqui se devuelve ya filtrado y ordenado como cada
     una lo espera, para que ninguna tenga que acordarse.

     Devuelve null si no hay nada guardado: entonces la pantalla pregunta a la
     base como siempre. NUNCA devuelve una carta a medias.

     opts:
       activas: true  -> solo categorias con `active` (lo que pide Venta rapida)
       orden:  'sort' -> por sort_order y luego nombre  (Tomar pedido, Venta rapida)
               'nombre' -> por nombre                    (Domicilios)

     OJO CON EL ORDEN. Los productos NO se reordenan: vienen de la base ya
     pedidos por nombre, asi que conservan su intercalacion exacta. Las
     categorias si se ordenan aqui, con `localeCompare('es')`, que es lo mas
     parecido a lo que hace la base. Comprobado contra las 7 categorias y los
     54 productos reales: mismo orden por los dos caminos. Si algun dia una
     categoria se acomoda sola en un sitio raro, mirar aqui primero. */
  function carta(opts) {
    if (!memoria || !memoria.productos || !memoria.productos.length) return null;
    opts = opts || {};

    var cats = (memoria.categorias || []).slice();
    /* Igualdad ESTRICTA, no `!== false`. La base filtraba con `active = true`,
       y eso deja fuera tambien las que estan vacias. Con `!== false` una fila
       vacia aparecería aqui y no en el camino de la base: la misma pantalla
       mostraria una categoria distinta segun si alcanzo a guardar o no. Hoy no
       hay ninguna vacia (0 de 17), pero el que se comporten igual no puede
       depender de eso. */
    if (opts.activas) cats = cats.filter(function (c) { return c.active === true; });
    if (opts.orden === 'nombre') {
      cats.sort(function (a, b) { return String(a.name||'').localeCompare(String(b.name||''), 'es'); });
    } else {
      cats.sort(function (a, b) {
        /* `nullsFirst:false`: las que no tienen posicion van al final. */
        var sa = (a.sort_order == null) ? Infinity : a.sort_order;
        var sb2 = (b.sort_order == null) ? Infinity : b.sort_order;
        if (sa !== sb2) return sa - sb2;
        return String(a.name||'').localeCompare(String(b.name||''), 'es');
      });
    }

    return {
      categorias: cats,
      /* `available` se filtra aqui y no al traerlo: si se guardara ya
         filtrado, activar un producto obligaria a volver a bajar la carta
         entera en vez de leerlo de lo que ya esta en el equipo. */
      productos:  (memoria.productos || []).filter(function (p) { return p.available === true; }),
      adiciones:  memoria.adiciones || [],
    };
  }

  w.posDatos = {
    cargar:     cargar,
    carta:      carta,
    invalidar:  invalidar,
    listo:      function () { return !!memoria; },
    productos:  parte('productos', []),
    categorias: parte('categorias', []),
    adiciones:  parte('adiciones', []),
    plano:      parte('plano', []),
    config:     parte('config', null),
    insumos:    parte('insumos', []),
    recetas:    parte('recetas', []),
    negocio:    parte('negocio', null)
  };
})(window);
