/* ══════════════ pos-clientes.js — UN SOLO CLIENTE PARA TODA LA APP ══════════════
   Antes cada pantalla tenía su propia lista: el chat leía la tabla `pos_clientes`
   de Supabase, y Domicilios y Venta rápida guardaban la suya en el localStorage
   del navegador. Eso significaba que editar un cliente en una pantalla no se veía
   en la otra, y que cada equipo (el .exe y el navegador) tenía clientes distintos.

   Ahora la TABLA es la única fuente de verdad y el localStorage queda solo como
   caché para arrancar rápido y para no quedarse ciego si se cae el internet.

   La llave del cliente es el TELÉFONO: ahí viven sus direcciones, sus puntos y
   su nivel. Dos pantallas nunca deben crear dos fichas del mismo número.

   Forma que usan las pantallas (la de Domicilios, que ya estaba):
     { id, nombre, tel, barrio, dir, dirId, direcciones:[{id,barrio,dir}],
       tipdoc, numdoc, email, notas }
   Forma en la tabla:
     { id, nombre, telefono, barrio, direccion, direcciones:[{id,dir,barrio}],
       tipdoc, numdoc, email, notas }                                        */
(function () {
  'use strict';

  /* ⚠️ UNA LLAVE POR RESTAURANTE, y esto es un arreglo de seguridad.

     Antes era una sola, 'pos.clientes', igual para todos. La cache existe
     para que la pantalla abra rapido sin esperar a la base — pero al entrar
     con OTRO restaurante en el mismo navegador, lo primero que se pintaba
     eran los clientes del restaurante ANTERIOR. Nombres, telefonos y
     direcciones de gente real, en la pantalla de otro negocio.

     Sergio lo vio con sus propios ojos: el Restaurante de Prueba le mostraba
     los 228 clientes de El Parche. La base estaba bien —la consulta devuelve
     cero— pero la pantalla enseñaba lo que quedo guardado antes. En un
     producto que se vende a muchos restaurantes eso es un escape de datos:
     dos negocios en el mismo computador se ven los clientes.

     Ahora cada restaurante tiene su propio cajon y no puede ver el del otro. */
  var KEY_VIEJA = 'pos.clientes';
  function KEY_DE(t) { return 'pos.clientes.' + (t || 'sin'); }

  // Cada pantalla resuelve la sesión a su manera, así que puede pasarnos el
  // contexto con setCtx(); si no, se toma el de pos-core.
  var CTX = { tenantId: null, branchId: null };
  function setCtx(t, b) { CTX.tenantId = t || null; CTX.branchId = b || null; }

  function sb()      { return window._pos && window._pos.sb; }
  function tenantId(){ return CTX.tenantId || (window._pos && window._pos.state && window._pos.state.tenantId); }
  function branchId(){ return CTX.branchId || (window._pos && window._pos.state && window._pos.state.branchId); }

  function tel10(t) { return String(t || '').replace(/\D/g, '').slice(-10); }
  function dirId()  { return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function titulo(s){
    return String(s || '').trim().toLowerCase().replace(/(^|\s)\S/g, function (t) { return t.toUpperCase(); });
  }

  // ── Traducción entre las dos formas ──────────────────────────────────
  function deDB(r) {
    var dirs = Array.isArray(r.direcciones) ? r.direcciones : [];
    dirs = dirs.map(function (d) {
      if (d && typeof d === 'object') return { id: d.id || dirId(), dir: d.dir || '', barrio: d.barrio || '' };
      return { id: dirId(), dir: String(d || ''), barrio: '' };
    }).filter(function (d) { return String(d.dir).trim(); });
    if (!dirs.length && (r.direccion || r.barrio)) {
      dirs = [{ id: dirId(), dir: r.direccion || '', barrio: r.barrio || '' }];
    }
    // La dirección ACTIVA es la última usada, que es la que la tabla guarda
    // suelta en `direccion` (es la que el cliente pidió la última vez).
    var act = dirs.filter(function (d) { return d.dir === r.direccion; })[0] || dirs[dirs.length - 1] || null;
    return {
      id: r.id, nombre: r.nombre || '', tel: r.telefono || '',
      // Segundo numero: solo contacto. La identidad y los puntos son del
      // telefono principal, siempre.
      tel2: r.telefono2 || '',
      direcciones: dirs,
      dir:    act ? act.dir    : '',
      barrio: act ? act.barrio : '',
      dirId:  act ? act.id     : null,
      tipdoc: r.tipdoc || '', numdoc: r.numdoc || '', email: r.email || '', notas: r.notas || '',
    };
  }

  function aDB(c) {
    var dirs = (Array.isArray(c.direcciones) ? c.direcciones : []).map(function (d) {
      return { id: d.id || dirId(), dir: String(d.dir || '').trim(), barrio: titulo(d.barrio || '') };
    }).filter(function (d) { return d.dir; });
    var act = dirs.filter(function (d) { return d.id === c.dirId; })[0] || dirs[dirs.length - 1] || null;
    return {
      nombre: c.nombre || '', telefono: c.tel || '',
      telefono2: c.tel2 || null,
      direcciones: dirs,
      // `direccion` y `barrio` sueltos = la dirección activa. Otras pantallas
      // y las funciones del servidor los leen así, no como lista.
      direccion: act ? act.dir : null,
      barrio:    act ? act.barrio : null,
      tipdoc: c.tipdoc || null, numdoc: c.numdoc || null,
      email:  c.email  || null, notas:  c.notas  || null,
      updated_at: new Date().toISOString(),
    };
  }

  // ── Caché local (solo para arrancar rápido / sin internet) ───────────
  function leerCache() {
    try {
      /* La compartida se BORRA en cuanto se ve: mientras exista, cualquier
         pantalla vieja que la lea sigue enseñando clientes de otro negocio. */
      if (localStorage.getItem(KEY_VIEJA)) localStorage.removeItem(KEY_VIEJA);
      var v = JSON.parse(localStorage.getItem(KEY_DE(tenantId())) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function grabarCache(lista) {
    var t = tenantId();
    if (!t) return;              // sin saber de quien es, no se guarda
    try { localStorage.setItem(KEY_DE(t), JSON.stringify(lista)); } catch (e) {}
  }

  // ── Cargar TODOS los clientes de la tabla ────────────────────────────
  // PostgREST corta en 1000 filas aunque se pida más, así que hay que pedir
  // por páginas o se pierden clientes en silencio.
  async function cargar() {
    var s = sb(), t = tenantId();
    if (!s || !t) return leerCache();
    var todos = [], desde = 0, PASO = 1000;
    try {
      for (;;) {
        var r = await s.from('pos_clientes').select('*')
          .eq('tenant_id', t).order('nombre', { ascending: true })
          .range(desde, desde + PASO - 1);
        if (r.error) throw r.error;
        var lote = r.data || [];
        todos = todos.concat(lote);
        if (lote.length < PASO) break;
        desde += PASO;
      }
    } catch (e) {
      console.warn('[pos-clientes] sin conexión, usando caché:', e && e.message);
      return leerCache();
    }
    var lista = todos.map(deDB);
    grabarCache(lista);
    return lista;
  }

  // ── Guardar (crea o actualiza). El teléfono manda. ───────────────────
  async function guardar(c) {
    var s = sb(), t = tenantId();
    if (!s || !t) throw new Error('Sin conexión con la base de datos');
    var fila = aDB(c);
    fila.tenant_id = t;
    if (branchId()) fila.branch_id = branchId();

    // ¿Ya existe una ficha con ese teléfono? Entonces es la misma persona:
    // se actualiza, nunca se duplica.
    var existente = null;
    var t10 = tel10(c.tel);
    if (t10.length >= 7) {
      var b = await s.from('pos_clientes').select('id').eq('tenant_id', t)
        .ilike('telefono', '%' + t10).limit(1);
      if (b.data && b.data.length) existente = b.data[0].id;
    }
    // Un id de la tabla es un uuid; los ids viejos del localStorage empiezan
    // por 'c' y no existen en la base, así que esos van como alta nueva.
    if (!existente && c.id && /^[0-9a-f-]{36}$/i.test(String(c.id))) existente = c.id;

    var r;
    if (existente) r = await s.from('pos_clientes').update(fila).eq('id', existente).select().maybeSingle();
    else           r = await s.from('pos_clientes').insert(fila).select().maybeSingle();
    if (r.error) throw r.error;
    return deDB(r.data);
  }

  async function borrar(id) {
    var s = sb();
    if (!s || !id) return;
    var r = await s.from('pos_clientes').delete().eq('id', id);
    if (r.error) throw r.error;
  }

  // ── Subida única de los clientes que solo existían en este equipo ────
  // Hasta hoy Domicilios y Venta rápida guardaban solo en el navegador. Esos
  // clientes se suben a la tabla la primera vez, para no perderlos.
  async function subirLocales() {
    var s = sb(), t = tenantId();
    if (!s || !t) return { subidos: 0, ya: 0 };
    var marca = 'pos.clientes.subidos.' + t;
    if (localStorage.getItem(marca)) return { subidos: 0, ya: 0 };

    var locales = leerCache().filter(function (c) { return (c.nombre || '').trim() || tel10(c.tel).length >= 7; });
    if (!locales.length) { localStorage.setItem(marca, '1'); return { subidos: 0, ya: 0 }; }

    var r = await s.from('pos_clientes').select('telefono').eq('tenant_id', t).limit(5000);
    var yaHay = {};
    (r.data || []).forEach(function (x) { var k = tel10(x.telefono); if (k) yaHay[k] = 1; });

    var subidos = 0, ya = 0;
    for (var i = 0; i < locales.length; i++) {
      var c = locales[i], k = tel10(c.tel);
      if (k && yaHay[k]) { ya++; continue; }
      try { await guardar(c); subidos++; if (k) yaHay[k] = 1; }
      catch (e) { console.warn('[pos-clientes] no se pudo subir', c.nombre, e && e.message); }
    }
    localStorage.setItem(marca, '1');
    if (subidos) console.log('[pos-clientes] ' + subidos + ' cliente(s) de este equipo subidos a la base');
    return { subidos: subidos, ya: ya };
  }

  // Arranque: sube lo que solo estaba aquí y devuelve la lista ya unificada.
  async function iniciar() {
    try { await subirLocales(); } catch (e) { console.warn('[pos-clientes] subida inicial:', e && e.message); }
    return await cargar();
  }

  window.posClientes = {
    setCtx: setCtx,
    cargar: cargar, guardar: guardar, borrar: borrar,
    iniciar: iniciar, subirLocales: subirLocales,
    deDB: deDB, aDB: aDB, tel10: tel10, nuevoDirId: dirId,
    /* Para que ninguna pantalla se invente su propia llave de cache y
       vuelva a mezclar los clientes de dos restaurantes. */
    guardarCache: grabarCache, leerCache: leerCache,
  };
})();
