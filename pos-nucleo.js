/* pos-nucleo.js — GENERADO por herramientas/armar-nucleo.py. NO editar a mano:
   edita el modulo original y vuelve a correr el armador. */

/* ═══════ pos-sync.js ═══════ */
;/**
 * pos-sync.js — Cola offline + caché de lecturas para Cobra POS
 * Cargar ANTES de pos-core.js en cada página del mesero.
 *
 * API pública: window.posSync
 *   .isOnline          → boolean
 *   .onStatusChange(cb)→ registrar callback(online: bool)
 *   .write(table, op, data, match)  → Promise<{ok, data, offline}>
 *   .writeOrderBatch(orderData, itemsData, tableMatch, tableData) → Promise<{ok, offline, tempOrderId}>
 *   .cacheSet(key, data, ttlMs)     → Promise
 *   .cacheGet(key)                  → Promise<data|null>
 *   .pendingCount()                 → Promise<number>
 *   .syncNow()                      → Promise
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════
     IndexedDB — DB interna del cliente
  ══════════════════════════════════════════ */

  const DB_NAME = 'cobra_pos_sync';
  const DB_VER  = 1;
  let _db = null;

  function _openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('queue')) {
          const qs = db.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
          qs.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _idbPut(store, record) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    }));
  }

  function _idbGet(store, key) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    }));
  }

  function _idbGetAll(store, indexName, value) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readonly');
      const os  = tx.objectStore(store);
      const req = indexName ? os.index(indexName).getAll(value) : os.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    }));
  }

  function _idbDelete(store, key) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    }));
  }

  /* ══════════════════════════════════════════
     UI — Indicador de estado de red
  ══════════════════════════════════════════ */

  function _ensureUI() {
    if (document.getElementById('pos-sync-pill')) return;
    const style = document.createElement('style');
    style.textContent = `
      #pos-sync-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
        height: 3px; background: #F59E0B;
        opacity: 0; transition: opacity .35s; pointer-events: none;
      }
      #pos-sync-pill {
        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
        z-index: 99999; color: #fff;
        font: 600 12px/1.4 system-ui, sans-serif;
        padding: 6px 16px; border-radius: 999px;
        box-shadow: 0 2px 10px rgba(0,0,0,.22);
        opacity: 0; transition: opacity .35s; pointer-events: none;
        white-space: nowrap; max-width: calc(100vw - 32px); text-align: center;
      }
    `;
    document.head.appendChild(style);
    const bar  = document.createElement('div'); bar.id  = 'pos-sync-bar';
    const pill = document.createElement('div'); pill.id = 'pos-sync-pill';
    document.body.appendChild(bar);
    document.body.appendChild(pill);
  }

  function _ui(mode, count) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => _ui(mode, count)); return; }
    _ensureUI();
    const bar  = document.getElementById('pos-sync-bar');
    const pill = document.getElementById('pos-sync-pill');
    if (!bar || !pill) return;

    const colors = { offline: '#F59E0B', syncing: '#5B6BFF', online: '#22C55E', error: '#EF4444' };
    const msgs   = {
      offline: '● Sin conexión — los pedidos se guardan localmente',
      syncing: `↑ Sincronizando ${count || ''} operacion${count === 1 ? '' : 'es'}…`,
      online:  '✓ Conexión restablecida',
      error:   `⚠ ${count || 1} operacion${count === 1 ? '' : 'es'} no se pudieron sincronizar`
    };

    bar.style.background   = colors[mode];
    bar.style.opacity      = mode === 'online' ? '0' : '1';
    pill.style.background  = colors[mode];
    pill.textContent       = msgs[mode];
    pill.style.opacity     = '1';

    if (mode === 'online') {
      setTimeout(() => { pill.style.opacity = '0'; }, 2500);
    }
    if (mode === 'error') {
      setTimeout(() => { pill.style.opacity = '0'; }, 5000);
    }
  }

  /* ══════════════════════════════════════════
     Ejecutor de operaciones individuales
  ══════════════════════════════════════════ */

  function _getSB() {
    // pos-core.js expone el cliente como window._pos.sb
    const sb = (window._pos && (window._pos.sb || window._pos.supabase)) || window._posSB;
    if (!sb) throw new Error('[posSync] Supabase no inicializado todavía');
    return sb;
  }

  async function _execOp(entry) {
    const sb = _getSB();
    let q = sb.from(entry.table);

    if (entry.op === 'insert') {
      const r = await q.insert(entry.data).select();
      return r;
    }
    if (entry.op === 'update') {
      q = q.update(entry.data);
      if (entry.match) {
        for (const [col, val] of Object.entries(entry.match)) q = q.eq(col, val);
      }
      return await q.select();
    }
    if (entry.op === 'upsert') {
      return await q.upsert(entry.data, { onConflict: entry.onConflict || 'id' });
    }
    if (entry.op === 'delete') {
      q = q.delete();
      if (entry.match) {
        for (const [col, val] of Object.entries(entry.match)) q = q.eq(col, val);
      }
      return await q;
    }
    throw new Error('[posSync] Operación desconocida: ' + entry.op);
  }

  /* Batch de creación de orden (INSERT order + items + UPDATE table) */
  async function _execOrderBatch(entry) {
    const sb = _getSB();
    const tempId = entry.orderData._tempId;

    // 1. Crear la orden usando tempId como el UUID real (idempotente en reintentos).
    // Si ya existe (23505 = unique_violation) significa que un intento anterior
    // ya la insertó — seguimos sin crear duplicado.
    const orderPayload = { ...entry.orderData, id: tempId };
    delete orderPayload._tempId;

    const { data: orderRows, error: orderErr } = await sb
      .from('pos_orders').insert(orderPayload).select().single();

    let realOrderId = tempId;
    let orderAlreadyExisted = false;
    if (orderErr) {
      if (orderErr.code !== '23505') throw orderErr; // error real, propagar
      // La orden ya existía de un intento anterior — usamos el mismo tempId
      orderAlreadyExisted = true;
    } else {
      realOrderId = orderRows.id;
    }

    // 2. Insertar los items — solo si la orden es nueva (en retry, asumimos que ya existen)
    if (!orderAlreadyExisted) {
      const items = entry.itemsData.map(item => {
        const it = { ...item };
        if (it.order_id === tempId) it.order_id = realOrderId;
        return it;
      });
      if (items.length > 0) {
        const { error: itemsErr } = await sb.from('pos_order_items').insert(items);
        if (itemsErr && itemsErr.code !== '23505') throw itemsErr;
      }
    }

    // 3. Actualizar la mesa (no-fatal: si falla el status update, la orden sigue siendo válida)
    if (entry.tableMatch && entry.tableData) {
      try {
        let q = sb.from('pos_tables').update(entry.tableData);
        for (const [col, val] of Object.entries(entry.tableMatch)) q = q.eq(col, val);
        const { error: tableErr } = await q;
        if (tableErr) console.warn('[posSync] table update warning:', tableErr.message);
      } catch(tableEx) { console.warn('[posSync] table update excepción:', tableEx); }
    }

    return { orderId: realOrderId };
  }

  /* ══════════════════════════════════════════
     Sincronizador
  ══════════════════════════════════════════ */

  let _syncing = false;

  async function _syncNow() {
    if (_syncing || (!_isElectron && !navigator.onLine)) return;
    _syncing = true;
    try {
      const pending = await _idbGetAll('queue', 'status', 'pending');
      if (pending.length === 0) return;

      _ui('syncing', pending.length);
      pending.sort((a, b) => a.qid - b.qid);

      const MAX_RETRIES = 5;
      let failed = 0;
      for (const entry of pending) {
        try {
          if (entry.type === 'order_batch') {
            await _execOrderBatch(entry);
          } else {
            const { error } = await _execOp(entry);
            // 23505 = unique_violation: ya existe en BD (reintento idempotente)
            if (error && error.code !== '23505') throw error;
          }
          await _idbDelete('queue', entry.qid);
        } catch (e) {
          const retries = (entry.failCount || 0) + 1;
          console.warn('[posSync] Error al sincronizar entrada', entry.qid, `(intento ${retries}/${MAX_RETRIES})`, e.message);
          if (retries >= MAX_RETRIES) {
            // Descartar operaciones que fallan repetidamente para no bloquear la cola
            console.error('[posSync] Descartando entrada', entry.qid, '— demasiados fallos:', e.message);
            await _idbDelete('queue', entry.qid);
          } else {
            await _idbPut('queue', { ...entry, failCount: retries });
            failed++;
          }
        }
      }

      if (failed === 0) _ui('online');
      else              _ui('error', failed);
    } finally {
      _syncing = false;
    }
  }

  /* ══════════════════════════════════════════
     Detección de red
  ══════════════════════════════════════════ */

  // En Electron (app de escritorio) navigator.onLine da falsos negativos:
  // reporta "offline" aunque haya internet, lo que encolaba pedidos con id
  // temporal y rompía la auto-impresión. En Electron confiamos en el
  // resultado real de cada escritura (el try/catch cae a la cola si falla).
  const _isElectron = !!(window.electronPOS);
  let _online  = _isElectron ? true : navigator.onLine;
  const _cbs   = [];

  window.addEventListener('online', async () => {
    _online = true;
    _cbs.forEach(cb => cb(true));
    await _syncNow();
  });

  window.addEventListener('offline', () => {
    if (_isElectron) return; // navigator.onLine no es confiable en Electron
    _online = false;
    _cbs.forEach(cb => cb(false));
    _ui('offline');
  });

  /* Al cargar: sincronizar lo que quedó pendiente */
  _openDB().then(async () => {
    if (!_isElectron && !navigator.onLine) {
      _online = false;
      _ui('offline');
    } else {
      const pending = await _idbGetAll('queue', 'status', 'pending');
      if (pending.length > 0) await _syncNow();
    }
  });

  /* ══════════════════════════════════════════
     API pública
  ══════════════════════════════════════════ */

  window.posSync = {

    get isOnline() { return _online; },

    onStatusChange(cb) { _cbs.push(cb); },

    /** UUID generado en cliente — para IDs provisionales */
    makeTempId() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'offline_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    },

    /**
     * Ejecutar una operación de escritura simple.
     * Si hay conexión → Supabase directo.
     * Si no → encola en IndexedDB.
     * @param {string} table
     * @param {'insert'|'update'|'upsert'|'delete'} op
     * @param {object} data
     * @param {object} [match]   — columnas para WHERE en update/delete
     * @param {string} [onConflict] — para upsert
     * @returns {Promise<{ok:boolean, data:any, offline:boolean}>}
     */
    /*  Como write(), pero SIN esperar al servidor nunca: encola y dispara la
        subida por detras. Para escrituras que el usuario no tiene por que
        mirar (cerrar el pedido, liberar la mesa). El registro del dinero
        (pos_payments) NO va por aqui: ese se espera. */
    async enqueueWrite(table, op, data, match, onConflict) {
      const entry = { type: 'single', table, op, data, match, onConflict, timestamp: Date.now(), status: 'pending' };
      const qid = await _idbPut('queue', entry);
      _syncNow().catch(() => {});
      return { ok: true, offline: !_online, qid };
    },

    async write(table, op, data, match, onConflict) {
      if (_online) {
        try {
          const result = await _execOp({ table, op, data, match, onConflict });
          if (result.error) throw result.error;
          return { ok: true, data: result.data, offline: false };
        } catch (e) {
          console.warn('[posSync] Fallo online, encolando:', table, op, e.message);
          // Caer a la cola offline
        }
      }
      const entry = { type: 'single', table, op, data, match, onConflict, timestamp: Date.now(), status: 'pending' };
      const qid = await _idbPut('queue', entry);
      return { ok: true, data: null, offline: true, qid };
    },

    /**
     * Crear una orden completa de forma atómica (order + items + mesa).
     * Usa un id temporal cuando está offline; al sincronizar se reemplaza con el id real de Supabase.
     * @param {object} orderData   — datos para pos_orders (sin id)
     * @param {Array}  itemsData   — array de items para pos_order_items
     * @param {object} tableMatch  — {id: tableId} para el WHERE del UPDATE pos_tables
     * @param {object} tableData   — datos para actualizar en pos_tables
     * @returns {Promise<{ok:boolean, offline:boolean, orderId:string}>}
     */
    /*  ══ EL BOTON INSTANTANEO (29-ago-2026, pedido de Sergio) ═══════════

        `writeOrderBatch` espera al servidor cuando hay internet: eso protege
        la venta pero deja al mesero mirando el boton medio segundo o mas.

        Esta variante NUNCA espera: guarda el pedido en el equipo (IndexedDB),
        dispara la subida SIN esperarla y devuelve el id al instante. El id
        provisional ES el id definitivo (el batch inserta con ese uuid), asi
        que navegar a otra pantalla no rompe nada: si la subida muere por el
        cambio de pagina, la cola queda 'pending' y la proxima pantalla con
        pos-sync la sube al abrir — ventas, pagos y tomar-pedido lo cargan.

        Cuando NO usarla: si el paso siguiente necesita leer el pedido del
        servidor ya mismo (ir a cobrar). Ahi va la de siempre.               */
    async enqueueOrderBatch(orderData, itemsData, tableMatch, tableData) {
      const tempOrderId = this.makeTempId();
      const entry = {
        type: 'order_batch',
        orderData: { ...orderData, _tempId: tempOrderId },
        itemsData: itemsData.map(it => ({ ...it, order_id: tempOrderId })),
        tableMatch, tableData,
        timestamp: Date.now(),
        status: 'pending'
      };
      await _idbPut('queue', entry);          //  esto es local: milisegundos
      _syncNow().catch(() => {});             //  se sube por detras, sin esperar
      return { ok: true, offline: !_online, orderId: tempOrderId };
    },

    async writeOrderBatch(orderData, itemsData, tableMatch, tableData) {
      const tempOrderId = this.makeTempId();

      if (_online) {
        try {
          const result = await _execOrderBatch({
            type: 'order_batch',
            orderData: { ...orderData, _tempId: tempOrderId },
            itemsData: itemsData.map(it => ({ ...it, order_id: tempOrderId })),
            tableMatch,
            tableData
          });
          return { ok: true, offline: false, orderId: result.orderId };
        } catch (e) {
          console.warn('[posSync] writeOrderBatch falló online, encolando:', e.message);
        }
      }

      const entry = {
        type: 'order_batch',
        orderData: { ...orderData, _tempId: tempOrderId },
        itemsData: itemsData.map(it => ({ ...it, order_id: tempOrderId })),
        tableMatch,
        tableData,
        timestamp: Date.now(),
        status: 'pending'
      };
      await _idbPut('queue', entry);
      return { ok: true, offline: true, orderId: tempOrderId };
    },

    /** Guardar datos en caché local con TTL */
    async cacheSet(key, data, ttlMs = 10 * 60 * 1000) {
      await _idbPut('cache', { key, data, expiresAt: Date.now() + ttlMs });
    },

    /** Leer de caché (null si expiró o no existe) */
    async cacheGet(key) {
      const entry = await _idbGet('cache', key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) { await _idbDelete('cache', entry.key); return null; }
      return entry.data;
    },

    /** Cuántas operaciones están esperando sincronizarse */
    async pendingCount() {
      const rows = await _idbGetAll('queue', 'status', 'pending');
      return rows.length;
    },

    /** Forzar sincronización manual */
    syncNow: _syncNow
  };

})();

;
/* ═══════ pos-cache.js ═══════ */
;/* ═══════════════════════════════════════════════════════════════════════════
   pos-cache.js — Guardar en el equipo lo que casi nunca cambia
   ───────────────────────────────────────────────────────────────────────────
   La idea, en una frase: la pantalla se pinta PRIMERO con lo que ya está
   guardado en el computador —eso es instantáneo, no toca internet— y solo
   después se le pregunta a la base si algo cambió, sin que el usuario espere.

   Por qué hace falta: el catálogo de un restaurante cambia dos o tres veces al
   mes, pero hoy se vuelve a pedir entero cada vez que se abre la pantalla. Es
   como volver a preguntar el nombre de un empleado cada vez que uno lo saluda.

   Reglas que este archivo respeta:
   · Todo lo guardado lleva el id del restaurante en la llave. Un equipo donde
     entren dos cuentas de negocios distintos NUNCA puede mezclar datos.
   · Nada se guarda para siempre: cada cosa tiene una edad máxima. Pasada esa
     edad se sigue mostrando (mejor eso que una pantalla en blanco) pero se
     marca como vieja.
   · Si el navegador no tiene espacio, no se rompe nada: se sigue trabajando
     contra la base, como antes.
   · Al cerrar sesión se borra todo (posCache.limpiar).

   Lo que NO va aquí: nada que cambie a cada minuto. Pedidos, caja, turnos y
   stock se piden siempre frescos. Esto es para catálogo, categorías,
   modificadores, configuración y marca.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PREFIJO = 'pos.cache.';
  var TOPE_BYTES = 1500000;   // ~1,5 MB por entrada: más que eso no vale la pena

  function tenantActual() {
    /* Se lee de la sesión que ya está en el equipo, sin salir a internet. La
       sesión de Cobra POS siempre vive bajo la llave 'cobra-pos-session'. */
    try {
      var crudo = localStorage.getItem('cobra-pos-session');
      if (!crudo) return '';
      var s = JSON.parse(crudo);
      var u = (s && (s.user || (s.currentSession && s.currentSession.user))) || null;
      return (u && u.user_metadata && u.user_metadata.tenant_id) || '';
    } catch (e) { return ''; }
  }

  function llave(nombre) {
    return PREFIJO + (tenantActual() || 'sin-negocio') + '.' + nombre;
  }

  /* Devuelve { datos, edadSeg, viejo } o null si no hay nada guardado.
     Ojo: devuelve los datos AUNQUE estén viejos. Quien llama decide si los
     pinta mientras espera lo fresco — que es justamente lo que queremos. */
  function leer(nombre, maxEdadSeg) {
    try {
      var crudo = localStorage.getItem(llave(nombre));
      if (!crudo) return null;
      var g = JSON.parse(crudo);
      if (!g || typeof g.t !== 'number') return null;
      var edad = Math.round((Date.now() - g.t) / 1000);
      return { datos: g.d, edadSeg: edad, viejo: maxEdadSeg ? edad > maxEdadSeg : false };
    } catch (e) { return null; }
  }

  function guardar(nombre, datos) {
    try {
      var texto = JSON.stringify({ t: Date.now(), d: datos });
      if (texto.length > TOPE_BYTES) return false;
      localStorage.setItem(llave(nombre), texto);
      return true;
    } catch (e) {
      /* Sin espacio. Se hace sitio botando lo más viejo de este mismo módulo
         antes de rendirse: vale más guardar el catálogo que un resto de ayer. */
      try {
        var viejas = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIJO) === 0) {
            var g = JSON.parse(localStorage.getItem(k) || '{}');
            viejas.push({ k: k, t: g.t || 0 });
          }
        }
        viejas.sort(function (a, b) { return a.t - b.t; });
        for (var j = 0; j < Math.ceil(viejas.length / 2); j++) localStorage.removeItem(viejas[j].k);
        localStorage.setItem(llave(nombre), JSON.stringify({ t: Date.now(), d: datos }));
        return true;
      } catch (e2) { return false; }
    }
  }

  function borrar(nombre) {
    try { localStorage.removeItem(llave(nombre)); } catch (e) {}
  }

  /* Se llama al cerrar sesión: en un computador compartido no puede quedar el
     catálogo del restaurante anterior. */
  function limpiar() {
    try {
      var fuera = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIJO) === 0) fuera.push(k);
      }
      for (var j = 0; j < fuera.length; j++) localStorage.removeItem(fuera[j]);
    } catch (e) {}
  }

  /* Guardar es barato pero no gratis (hay que convertir a texto). Las pantallas
     redibujan muchas veces seguidas, así que se agrupa: se guarda una vez
     cuando la mano se queda quieta. */
  var pendientes = {};
  function guardarPronto(nombre, obtenerDatos, esperaMs) {
    if (pendientes[nombre]) clearTimeout(pendientes[nombre]);
    pendientes[nombre] = setTimeout(function () {
      pendientes[nombre] = null;
      try { guardar(nombre, obtenerDatos()); } catch (e) {}
    }, esperaMs || 800);
  }

  window.posCache = {
    leer: leer,
    guardar: guardar,
    guardarPronto: guardarPronto,
    borrar: borrar,
    limpiar: limpiar,
    tenant: tenantActual
  };
})();

;
/* ═══════ pos-datos.js ═══════ */
;/* ═══════════════════════════════════════════════════════════════════════════
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

;
/* ═══════ pos-core.js ═══════ */
;/* pos-core.js — Helpers compartidos por todas las páginas del POS */
/* Incluye: Supabase client, $(), COPF(), COP(), todayRange(), daysAgoISO() */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
    storageKey: 'cobra-pos-session'
  }
});

// ── Helpers ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const COP = n => {
  if (n == null) return '—';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(n%1e6===0?0:1) + 'M';
  if (n >= 1e3)  return '$' + Math.round(n/1e3) + 'k';
  return '$' + Math.round(n).toLocaleString('es-CO');
};
const COPF = n => '$' + Math.round(n||0).toLocaleString('es-CO');
const pct  = (a,b) => b ? Math.min(100, Math.round((a/b)*100)) : 0;

// Zona horaria del negocio en horas vs UTC (Colombia = -5). Con esto "hoy" se calcula en
// hora LOCAL del negocio y NO se reinicia el día a las 7pm (medianoche UTC). Multi-tenant:
// a futuro se puede leer de ia_config.zona_horaria; por ahora Colombia por defecto.
const POS_TZ_OFFSET = -5;
const _posTzStr = (function (off) {
  const s = off <= 0 ? '-' : '+';
  const a = Math.abs(off);
  return s + String(Math.floor(a)).padStart(2, '0') + ':' + String(Math.round((a % 1) * 60)).padStart(2, '0');
})(POS_TZ_OFFSET);

function todayISO() {
  // Fecha "de hoy" en la zona horaria del negocio (no UTC).
  const d = new Date(Date.now() + POS_TZ_OFFSET * 3600000);
  return d.toISOString().slice(0, 10);
}
function todayRange() {
  const t = todayISO();
  // Medianoche local del negocio → instante UTC correcto (Colombia 00:00 = 05:00Z).
  return { start: t + 'T00:00:00.000' + _posTzStr, end: t + 'T23:59:59.999' + _posTzStr };
}
function daysAgoISO(n) {
  const d = new Date(Date.now() + POS_TZ_OFFSET * 3600000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── window._pos — Bus de eventos y estado global ──────────────────────────
(function () {
  const listeners = {};

  /* ¿Cuánto tiene que recibir el restaurante por este pedido?
     EL DOMICILIO NO CUENTA. El cliente lo paga, pero muchas veces va directo al
     domiciliario y nunca entra a la caja; y aunque entre, no es una venta.
     Sin esta regla, 13 domicilios reales aparecían como "pagados a medias"
     cuando lo único que faltaba era, exactamente, el valor del domicilio. */
  window.posCobrable = function (o) {
    if (!o) return 0;
    var total = parseFloat(o.total) || 0;
    var domi  = parseFloat(o.delivery_fee) || 0;
    return Math.max(0, total - domi);
  };
  /* ¿Está pagado? Se compara contra lo cobrable, no contra el total.
     El margen de $1 absorbe los redondeos al peso. */
  window.posEstaPagado = function (o) {
    if (!o) return false;
    if (o.status === 'paid' || o.status === 'completed') return true;
    var deb = window.posCobrable(o);
    return deb > 0 && (parseFloat(o.paid_amount) || 0) >= deb - 1;
  };

  var _emitidos = {};   // ultimo dato de cada evento ya emitido, para los oyentes que llegan tarde

  window._pos = {
    sb: sb,
    state: { user: null, branchId: null, tenantId: null },

    /* core:ready se emite UNA vez, apenas se lee la sesion — y eso hoy es
       instantaneo (sale del equipo). Una pantalla que registra su oyente
       dentro de DOMContentLoaded puede llegar TARDE: el evento ya paso y su
       oyente no corre nunca. Asi murio venta rapida: "Cargando categorias..."
       eterno, sin un solo error. Ahora el que llega tarde lo recibe de
       inmediato, como si hubiera llegado a tiempo. */
    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      if (event in _emitidos) { try { fn(_emitidos[event]); } catch(e) { console.error('[_pos.on tardio]', event, e); } }
    },

    emit(event, data) {
      _emitidos[event] = data;
      (listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.error('[_pos.emit]', event, e); } });
    },

    modules: {}
  };

  // ── Motor central de EMPAQUES ──────────────────────────────────────
  // Una sola lógica para mesas, venta rápida, domicilios y cobro.
  // items: [{productId, catId, presId, qty, unitPrice}] · opts: {domicilio:true}
  // Modo "especifico": tarifa fija por unidad en cascada
  //   presentación (empaquePresCfg[prodId::presId]) → producto (empaqueProdCfg)
  //   → categoría (empaqueCatCfg) → valor general.
  // Modo "unificado" (default): comportamiento clásico (fijo/%, unidad/pedido, canal).
  window.posEmpaqueCalc = function (items, opts) {
    try {
      var cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      if (!cfg.empaquesActivo || !items || !items.length) return 0;
      var prod = 0, units = 0;
      items.forEach(function (i) { prod += (Number(i.unitPrice) || 0) * (Number(i.qty) || 0); units += (Number(i.qty) || 0); });
      if (prod <= 0) return 0;
      if (cfg.empaqueModo === 'especifico') {
        var packs = cfg.empaquePacks || [];
        var general = Number(cfg.empaqueMonto) || 0;
        var packMonto = function (id) { for (var k = 0; k < packs.length; k++) if (packs[k].id === id) return Number(packs[k].monto) || 0; return 0; };
        var total = 0;
        items.forEach(function (i) {
          var fee = general;
          var cc = (cfg.empaqueCatCfg || {})[i.catId];
          if (cc) { if (cc.on === false) fee = 0; else if (cc.packId) fee = packMonto(cc.packId); }
          var pc = (cfg.empaqueProdCfg || {})[i.productId];
          if (pc !== undefined && pc !== null && pc !== '') {
            if (pc === 'none') fee = 0;
            else if (pc === 'general') fee = general;
            else fee = packMonto(pc);
          }
          // Nivel más específico: la PRESENTACIÓN del producto (ej. solo Personal)
          var sc = i.presId ? (cfg.empaquePresCfg || {})[(i.productId || '') + '::' + i.presId] : undefined;
          if (sc !== undefined && sc !== null && sc !== '') {
            if (sc === 'none') fee = 0;
            else if (sc === 'general') fee = general;
            else fee = packMonto(sc);
          }
          total += fee * (Number(i.qty) || 0);
        });
        return total;
      }
      var usaDomi = (cfg.empaqueCanal === 'distinto') && !!(opts && opts.domicilio);
      var esPct = cfg.empaqueTipo === 'porcentaje';
      var rate = esPct
        ? (usaDomi ? (cfg.empaquePctDomicilio || 0) : (cfg.empaquePct || 0))
        : (usaDomi ? (cfg.empaqueMontoDomicilio || 0) : (cfg.empaqueMonto || 0));
      if (cfg.empaqueBase === 'pedido') return esPct ? Math.round(prod * rate / 100) : rate;
      return esPct ? Math.round(prod * rate / 100) : rate * units;
    } catch (e) { return 0; }
  };

    /*  ══ LA SUCURSAL SE LEE UNA SOLA VEZ ══════════════════════════════

        Medido el 28-ago en la pantalla de ventas: **la tabla `branches` se
        consultaba diez veces** al abrir, casi siempre la MISMA fila, sólo
        que cada módulo pedía sus dos o tres columnas por su cuenta —
        `pos-brand` el logo, `pos-stock` la marca, `pos-arranque` la
        dirección, el salón el cobro adelantado, y así. Siete de esos viajes
        se podían ver uno detrás de otro en el cronómetro, unos 2 segundos
        en total, para traer campos de un único registro de 1 kB.

        Cada módulo pedía poco y creía estar siendo prudente. Sumados, eran
        lo más caro de la pantalla.

        Ahora se pide UNA vez, con todas las columnas que alguien usa, y se
        reparte. Quien necesite algo de la sucursal llama a `posSucursal()`.

        ── DOS DETALLES QUE IMPORTAN ──
        · Se guarda la PROMESA, no el resultado: si tres módulos preguntan a
          la vez —que es exactamente lo que pasa al arrancar— los tres se
          cuelgan del mismo viaje en vez de salir cada uno con el suyo.
        · Quien ESCRIBA en la sucursal tiene que llamar a
          `posSucursal.olvidar()`. Si no, seguiría repartiendo lo viejo. */
    var _suc = null, _sucId = null;
    window.posSucursal = function (branchId) {
      var bId = branchId || (window._pos && window._pos.state.branchId);
      if (!bId) return Promise.resolve(null);
      if (_suc && _sucId === bId) return _suc;
      _sucId = bId;
      _suc = sb.from('branches')
        .select('id,name,address,phone,brand_id,tenant_id,cobro_adelantado,acepta_reservas,operacion_config,brands(name,logo_url)')
        .eq('id', bId).maybeSingle()
        .then(function (r) { return (r && r.data) || null; })
        .catch(function (e) {
          /*  Si falla, se olvida: que el siguiente lo vuelva a intentar en
              vez de repartir un error para toda la sesión. */
          _suc = null; _sucId = null;
          console.warn('[pos-core] sucursal:', e && e.message);
          return null;
        });
      return _suc;
    };
    window.posSucursal.olvidar = function () { _suc = null; _sucId = null; };

    /*  ══ LO MISMO, PERO PARA CUALQUIER COSA ═══════════════════════════════

        `posSucursal` resolvio el caso mas caro, pero el patron se repite: dos
        o tres modulos preguntan lo mismo al arrancar y cada uno paga su viaje.
        En el cronometro se veian `pos_users` tres veces y `es_dueno` dos.

        `posUna(clave, fn)` guarda la PROMESA de la primera llamada y se la da
        a todos los que pregunten despues. Es para datos que no cambian
        mientras la pantalla esta abierta: quien eres, si eres el dueno, como
        se llama el equipo. Para lo que cambia estan las consultas normales.  */
    var _unas = {};
    window.posUna = function (clave, fn) {
      if (_unas[clave]) return _unas[clave];
      _unas[clave] = Promise.resolve().then(fn).catch(function (e) {
        delete _unas[clave];     //  que el siguiente lo reintente
        throw e;
      });
      return _unas[clave];
    };
    window.posUna.olvidar = function (clave) {
      if (clave) delete _unas[clave]; else _unas = {};
    };

  // Inicializar: leer sesión, poblar state, emitir core:ready
  async function boot() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        /*  HAY PANTALLAS QUE EXISTEN JUSTAMENTE PARA QUIEN NO TIENE CUENTA.
            Hoy la unica es `login.html`, que lleva dentro todo el registro:
            entrar, elegir plan, pagar. Un cliente nuevo no puede tener sesion
            todavia — esa es la definicion de cliente nuevo — asi que cualquier
            pantalla que se le añada al registro tiene que entrar en esta lista
            o rebotara al login sin decir por que. */
        var PUBLICAS = ['login'];
        var ruta = window.location.pathname;
        var esPublica = PUBLICAS.some(function (p) { return ruta.includes(p); });
        if (!esPublica) window.location.href = 'login.html';
        return;
      }
      /* La sesión que acabamos de leer YA trae al usuario con sus datos. Antes
         aquí se volvía a preguntar al servidor exactamente lo mismo
         (auth.getUser sale a internet; medido: 350-700 ms en cada pantalla).
         Nota: si se le cambia el rol a alguien, lo verá cuando su sesión se
         renueve —dentro de la hora— o al volver a entrar. Es un cambio raro y
         no justifica un viaje al servidor en cada pantalla. */
      const user = session.user;
      window._pos.state.user     = user;
      window._pos.state.tenantId = user.user_metadata?.tenant_id || null;
      window._pos.state.branchId = user.user_metadata?.branch_id || null;

      /*  ══ LA CUENTA SUSPENDIDA NO ENTRA ═══════════════════════════════════
          Sergio, 28-ago-2026, antes de lanzar.

          El botón de suspender existía en la pantalla de administración y
          escribía bien `tenants.status`. Lo que NO existía es que alguien lo
          mirara: el restaurante suspendido seguía vendiendo igual. Un botón
          que dice que corta y no corta es peor que no tenerlo — te enteras el
          primer mes que alguien no pague, que es justo cuando lo necesitas.

          ── DOS DECISIONES QUE NO SON OBVIAS ──

          1. SI NO SE PUEDE PREGUNTAR, SE ENTRA. Un corte de internet, la base
             lenta o un error de permisos NO pueden cerrarle el restaurante a
             un cliente que sí pagó. El silencio nunca se interpreta como
             "suspendido": solo se cierra con un `status` que lo diga.

          2. SE PREGUNTA UNA VEZ POR SESIÓN, no en cada pantalla. Cobra abre
             quince pantallas al día y esto es un viaje al servidor; el estado
             de la cuenta cambia una vez al mes, no cada minuto. Se guarda en
             el equipo por 30 minutos. Quien suspenda a alguien a mitad de
             servicio verá el efecto en media hora, y eso está bien: cortarle
             la caja a alguien en pleno almuerzo no es lo que se quiere ni
             siquiera cuando no ha pagado.                                    */
      (async function comprobarCuenta() {
        var LLAVE = 'pos.cuenta.estado';
        var tid = window._pos.state.tenantId;
        if (!tid) return;
        try {
          var g = JSON.parse(localStorage.getItem(LLAVE) || 'null');
          if (g && g.tid === tid && (Date.now() - g.en) < 30 * 60000) {
            if (g.estado && g.estado !== 'active') cerrarPorCuenta(g.estado);
            return;
          }
        } catch (e) {}
        var estado = null;
        try {
          var r = await sb.from('tenants').select('status').eq('id', tid).maybeSingle();
          estado = (r && r.data && r.data.status) || null;
        } catch (e) { return; }        // no se pudo preguntar → se entra
        if (!estado) return;           // sin respuesta → se entra
        try { localStorage.setItem(LLAVE, JSON.stringify({ tid: tid, estado: estado, en: Date.now() })); } catch (e) {}
        if (estado !== 'active') cerrarPorCuenta(estado);
      })();

      /*  LA PANTALLA DE SUSPENSIÓN VIVE APARTE (`pos-suspendida.js`).
          No es un aviso de dos líneas: lleva el cobro, la cuenta a la que se
          transfiere, el comprobante y la espera de la aprobación. Eso no cabe
          aquí, y sobre todo no tiene por qué descargarse en las quince pantallas
          que abre un restaurante al día que SÍ está al día. Se trae solo cuando
          hace falta, que es casi nunca.

          Y NO se cierra la sesión — esto cambió el 28-ago. Sergio:
          *"la cuenta sigue existiendo... incluso puede ingresar, pero le
          aparece un modal que no lo deja hacer absolutamente nada hasta que no
          pague"*. Sacarlo al login lo dejaba sin manera de pagar solo.

          Que quede claro qué es esto y qué no: es un COBRO, no una cerradura.
          Tapa la pantalla, no la base de datos. Quien sepa de navegadores puede
          quitarse el aviso de encima; lo que no puede es ver ni tocar datos de
          otro restaurante, porque de eso se encargan los permisos del servidor,
          que no dependen de esta pantalla. */
      function cerrarPorCuenta(estado) {
        if (window.posPantallaSuspendida) return window.posPantallaSuspendida(estado);
        var sc = document.createElement('script');
        sc.src = 'pos-suspendida.js';
        sc.onload = function () {
          if (window.posPantallaSuspendida) window.posPantallaSuspendida(estado);
        };
        /*  Si el archivo no carga (sin internet, caché vieja) el restaurante se
            queda trabajando. Es lo correcto: entre cobrarle a alguien que ya
            pagó y dejar operar un día a alguien que no, lo segundo se arregla
            solo mañana. */
        sc.onerror = function () { console.warn('[cuenta] no se pudo cargar el aviso de suspensión'); };
        document.head.appendChild(sc);
      }

      /* ══ CONTEXTO: en qué MARCA y SUCURSAL se está trabajando ══
         Hasta hoy la sucursal salía del login y punto: cada pantalla leía
         `user_metadata.branch_id` por su cuenta (configuracion.js sola lo hacía
         en 6 sitios). Eso hacía imposible cambiar de sucursal — y por tanto de
         marca — sin volver a entrar. Un gerente con dos sedes tenía que cerrar
         sesión para ver la otra.

         Aquí se resuelve UNA vez y todas las pantallas lo heredan por
         `_pos.state.branchId`, que es lo que ya leen.

         Reglas:
         · Las sucursales permitidas salen de la BASE (`pos_users`), no del
           token — el usuario puede reescribir su metadata (ver
           DICCIONARIO-ACCESOS.md).
         · La elegida se recuerda entre recargas, pero SIEMPRE se valida contra
           las permitidas: un id guardado a mano no sirve de nada.
         · Si algo falla, se queda la del login. Nunca se deja a nadie fuera.
         · Esto es comodidad de pantalla, no seguridad: aunque alguien forzara
           una sucursal ajena, las políticas de la base no le devuelven nada. */
      window.posContexto = (function () {
        var _sucs = [], _marcas = [], _bId = window._pos.state.branchId, _mId = null;
        var LLAVE = 'pos.contexto.sucursal';

        /* Lo guardado en el equipo sirve YA: esto corre en 15 pantallas y sin
           caché serían 4 viajes al servidor en cada una. Se pinta con lo de
           ayer y se confirma por detrás — mismo patrón que pos-plan y
           pos-perms. Un dato viejo aquí no hace daño: si la sucursal dejó de
           estar permitida, la base no le devuelve nada igualmente. */
        function _aplicarGuardado() {
          try {
            var g = window.posCache && posCache.leer('contexto');
            if (!g || !g.datos || !g.datos.sucs) return false;
            _sucs = g.datos.sucs; _marcas = g.datos.marcas || [];
            var guardada = null;
            try { guardada = localStorage.getItem(LLAVE); } catch (e) {}
            if (_sucs.some(function (s) { return s.id === guardada; })) _bId = guardada;
            else if (_sucs.length && !_sucs.some(function (s) { return s.id === _bId; })) _bId = _sucs[0].id;
            var suc = _sucs.filter(function (s) { return s.id === _bId; })[0];
            _mId = suc ? suc.brand_id : null;
            if (_bId) { window._pos.state.branchId = _bId; window._branchId = _bId; }
            return true;
          } catch (e) { return false; }
        }

        async function resolver(porRed) {
          if (!porRed && _aplicarGuardado()) { resolver(true); return; }   // confirma por detrás
          try {
            var pu = await window.posUna('pos_users_ctx', function () {
              return sb.from('pos_users')
                .select('branch_id,sucursales,tenant_id')
                .or('auth_user_id.eq.' + user.id + ',id.eq.' + user.id)
                .limit(1).maybeSingle();
            });
            var fila = pu.data;
            if (!fila) return;                    // sin ficha: se queda la del login

            if (fila.tenant_id) window._pos.state.tenantId = fila.tenant_id;

            /* Permitidas = su sucursal de siempre + las que el dueño le asignó.
               El dueño las tiene todas: no se limita a sí mismo. */
            var permitidas = [];
            if (fila.branch_id) permitidas.push(fila.branch_id);
            (fila.sucursales || []).forEach(function (s) {
              if (s && permitidas.indexOf(s) < 0) permitidas.push(s);
            });
            try {
              var d = await window.posUna('es_dueno', function () { return sb.rpc('es_dueno'); });
              if (!d.error && d.data === true) permitidas = null;   // null = todas
            } catch (e) {}

            var q = sb.from('branches').select('id,name,brand_id').order('name');
            var br = await q;
            _sucs = (br.data || []).filter(function (s) {
              return permitidas === null || permitidas.indexOf(s.id) >= 0;
            });
            var ma = await sb.from('brands').select('id,name').order('name');
            var idsMarca = {};
            _sucs.forEach(function (s) { if (s.brand_id) idsMarca[s.brand_id] = 1; });
            _marcas = (ma.data || []).filter(function (m) { return idsMarca[m.id]; });

            /* La guardada manda, pero solo si sigue permitida. */
            var guardada = null;
            try { guardada = localStorage.getItem(LLAVE); } catch (e) {}
            var valida = _sucs.some(function (s) { return s.id === guardada; });
            if (valida) _bId = guardada;
            else if (!_sucs.some(function (s) { return s.id === _bId; }) && _sucs.length) _bId = _sucs[0].id;

            var suc = _sucs.filter(function (s) { return s.id === _bId; })[0];
            _mId = suc ? suc.brand_id : null;
            window._pos.state.branchId = _bId;
            window._branchId = _bId;
            /* Solo se guarda lo confirmado por la base. */
            try { if (window.posCache) posCache.guardar('contexto', { sucs: _sucs, marcas: _marcas }); } catch (e) {}
          } catch (e) {
            console.warn('[contexto] no se pudo resolver, se queda la del login:', e && e.message);
          }
        }

        return {
          resolver:    resolver,
          sucursalId:  function () { return _bId; },
          marcaId:     function () { return _mId; },
          sucursales:  function () { return _sucs.slice(); },
          marcas:      function () { return _marcas.slice(); },
          /* Sucursales de UNA marca: el desplegable nunca las mezcla. */
          sucursalesDe: function (brandId) {
            return _sucs.filter(function (s) { return s.brand_id === brandId; });
          },
          cambiar: function (branchId) {
            if (!_sucs.some(function (s) { return s.id === branchId; })) return false;
            try { localStorage.setItem(LLAVE, branchId); } catch (e) {}
            location.reload();     // que todas las pantallas relean su dato
            return true;
          }
        };
      })();
      await window.posContexto.resolver();

      // Guard: si no tiene tenant/branch y no está en onboarding → redirigir
      var currentPath = window.location.pathname;
      var isOnboarding = currentPath.includes('onboarding');
      var isLogin = currentPath.includes('login');
      if (!window._pos.state.tenantId || !window._pos.state.branchId) {
        if (!isOnboarding && !isLogin) {
          window.location.href = 'onboarding.html';
          return;
        }
      }

      sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.href = 'login.html';
      });

      window._pos.emit('core:ready', { user });

      // ── Turno (sesión de caja) abierto ────────────────────────────────
      // TODO pedido debe pertenecer a un turno: sin esto quedan "volando"
      // fuera de cualquier cuadre. Se cachea 30 s para no consultar en cada venta.
      window.posSessionId = async function () {
        try {
          var now = Date.now();
          if (window.__posSesCache && now - window.__posSesCacheTs < 30000) return window.__posSesCache;
          /*  Y si ya hay una pregunta en el aire, se espera ESA. La cache se
              guarda al terminar, asi que sin esto tres llamadas a la vez
              —lo normal al arrancar— salen las tres a internet. */
          if (window.__posSesVuelo) return window.__posSesVuelo;
          window.__posSesVuelo = (async function () {
            try { return await _leerSesion(now); }
            finally { window.__posSesVuelo = null; }
          })();
          return window.__posSesVuelo;
        } catch (e) { return null; }
      };
      async function _leerSesion(now) {
        try {
          var bId = window._pos.state.branchId;
          if (!bId) return null;
          var r = await sb.from('pos_sessions').select('id')
            .eq('branch_id', bId).eq('status', 'open')
            .order('opened_at', { ascending: false }).limit(1).maybeSingle();
          window.__posSesCache = (r && r.data && r.data.id) || null;
          window.__posSesCacheTs = now;
          return window.__posSesCache;
        } catch (e) { return null; }
      };

      // ── Sincronizar config de Operación entre dispositivos ─────────────
      // Antes vivía SOLO en localStorage del equipo donde se configuró → la
      // tablet no veía el empaque (ni ninguna regla de Operación). La fuente
      // de verdad ahora es branches.operacion_config; localStorage es caché.
      try {
        var OPK = 'pos.config.operacion.v1';
        var bId = window._pos.state.branchId;
        if (bId) {
          var rOp = await window.posSucursal(bId);
          var dbCfg = rOp && rOp.operacion_config;
          var localOp = null;
          try { localOp = JSON.parse(localStorage.getItem(OPK) || 'null'); } catch (e2) {}
          var dbTs    = (dbCfg && dbCfg._ts) || 0;
          var localTs = (localOp && localOp._ts) || 0;
          var dbTiene = dbCfg && typeof dbCfg === 'object' && Object.keys(dbCfg).length;
          // Gana la config MÁS NUEVA (marca _ts). Si la local es más reciente
          // (p. ej. el guardado a BD falló), se SUBE — auto-sanado.
          if (dbTiene && dbTs >= localTs) {
            localStorage.setItem(OPK, JSON.stringify(dbCfg));
          } else if (localOp && typeof localOp === 'object' && Object.keys(localOp).length) {
            await sb.from('branches').update({ operacion_config: localOp }).eq('id', bId);
            window.posSucursal.olvidar();
          }
        }
      } catch (e) { console.warn('[pos-core] sync operacion_config:', e); }
    } catch (e) {
      console.error('[pos-core] Error en boot:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ══════════════════════════════════════════════════════════════
   PUNTOS QUE DEJA UN PEDIDO
   La cuenta REAL la hace la base (trigger `award_loyalty_points`) cuando el
   pedido queda pagado. Esta funcion solo repite la MISMA formula para poder
   mostrarsela al cliente en el momento; si algun dia cambia una, hay que
   cambiar la otra.
   Se cuenta comida + empaque; el domicilio NO da puntos (no es venta).
   ══════════════════════════════════════════════════════════════ */
window.posPuntosPedido = function (o) {
  if (!o) return 0;
  var comida = (parseFloat(o.subtotal) || 0) + (parseFloat(o.packaging_fee) || 0);
  if (comida <= 0) comida = (parseFloat(o.total) || 0) - (parseFloat(o.delivery_fee) || 0);
  return Math.max(0, Math.floor(comida / 1000));
};

/* ══ LA REGLA DE PUNTOS DE ESTE RESTAURANTE (21-ago-2026) ══════════════
   "1 punto por cada $1.000" era la economia de El Parche escrita a fuego en
   cuatro sitios distintos (la ficha del cliente, el recibo, el chat y la
   caja). Cualquier restaurante que comprara Cobra la heredaba sin poder
   cambiarla. Ahora vive en `branches.operacion_config.puntos`, que pos-core
   ya sincroniza a este equipo, asi que leerla no cuesta una consulta.

   La MISMA regla la aplica el disparador de la base (`award_loyalty_points`):
   estos ayudantes son solo para MOSTRAR y estimar, nunca para abonar. */
window.posPuntosRegla = function () {
  var r = { pesosPorPunto: 1000, activo: true };
  try {
    var op = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || 'null');
    var p = op && op.puntos;
    if (p) {
      var n = Number(p.pesos_por_punto);
      if (n > 0) r.pesosPorPunto = n;
      if (p.activo === false) r.activo = false;
    }
  } catch (e) { /* sin config: la de siempre */ }
  return r;
};
/* Cuantos puntos da ESE gasto. Devuelve 0 si el restaurante no tiene
   programa de puntos — asi ninguna pantalla promete lo que no existe. */
window.posPuntosDe = function (pesos) {
  var r = window.posPuntosRegla();
  if (!r.activo) return 0;
  return Math.floor((Number(pesos) || 0) / r.pesosPorPunto);
};
/* La frase para explicarla, con el numero del restaurante. Vacia si esta
   apagado: mejor no decir nada que decir una regla que no se cumple. */
window.posPuntosFrase = function () {
  var r = window.posPuntosRegla();
  if (!r.activo) return '';
  var m = '$ ' + Math.round(r.pesosPorPunto).toLocaleString('es-CO');
  return '1 punto por cada ' + m;
};


/* ══════════════════════════════════════════════════════════════════
   LA LLAVE DEL PLANO DEL SALON — UNA SOLA, Y POR SEDE
   ──────────────────────────────────────────────────────────────────
   El plano se guardaba en `pos.config.salon.v1`, sin decir de que
   restaurante era, y esa misma cadena estaba escrita a mano en CUATRO
   archivos: ventas, configuracion, onboarding y tomar pedido.

   El 24-ago-2026, en pleno servicio, Sergio vio 16 mesas donde tiene 8, con
   la 01, 02, 03 y 04 repetidas: habia entrado al restaurante de pruebas en
   el mismo computador y el plano de aquel se quedo guardado. El salon junto
   los dos.

   Nadie lo habia visto porque hasta ese dia solo existia un restaurante por
   equipo. Se rompio justo cuando hubo dos.

   Aqui queda UNA sola funcion. Cuatro copias de la misma cadena es como se
   desincronizan las cosas: si manana alguien la cambia en un archivo, los
   otros tres siguen leyendo la vieja y la pantalla se queda en blanco sin
   decir por que.
   ══════════════════════════════════════════════════════════════════ */
window.posLlaveSalon = function () {
  var b = '';
  try { b = (window._pos && window._pos.state && window._pos.state.branchId) || ''; } catch (e) {}
  if (!b) { try { b = localStorage.getItem('pos.contexto.sucursal') || ''; } catch (e) {} }
  /* La vieja se borra al pasar: dejarla ahi es guardar basura que ademas
     confunde a quien la encuentre buscando este mismo fallo. */
  try { localStorage.removeItem('pos.config.salon.v1'); } catch (e) {}
  return 'pos.config.salon.v1.' + (b || 'sin-sede');
};

;
/* ═══════ pos-solo-app.js ═══════ */
;/* ═══════════════════════════════════════════════════════════════════════════
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

  /* ⚠️ APAGADO A PROPOSITO — 24-ago-2026, en pleno servicio.

     El bloqueo le cerro la puerta a la APK del mesero con un cliente en la
     mesa. Intente reconocer la tablet por el navegador que dice ser y NO
     BASTO: el aviso siguio saliendo. No se por que, y averiguarlo con Sergio
     despachando no es una opcion.

     Asi que se apaga entero. Es una funcion comoda, no una necesaria: nadie
     pierde nada porque un dueño pueda vender desde su portatil. Lo que si se
     pierde es una noche de trabajo si la tablet no deja tomar pedidos.

     PARA VOLVER A ENCENDERLO hace falta, en este orden:
       1. Leer el `navigator.userAgent` DE LA TABLET DE VERDAD. Hasta saber que
          dice, cualquier deteccion es adivinar — y ya adivine una vez.
       2. Probarlo EN LOS TRES SITIOS: navegador de escritorio, ejecutable y
          tablet. Probar dos de tres fue exactamente el error.
       3. Encenderlo fuera de horario de servicio, nunca antes de abrir.

     Basta con devolverle las cinco entradas a esta lista. Todo lo demas
     —el aviso, la marca del menu, las descargas— quedo escrito y funcionando. */
  var SOLO_APP = {};

  /* ⚠️ LA TABLET TAMBIEN ES LA APP (24-ago-2026, en pleno servicio).
     La primera version solo miraba `electronPOS`, que inyecta el ejecutable de
     Windows. Pero la APK del mesero es un WebView de Android que carga ESTAS
     MISMAS pantallas y NO inyecta nada — asi que el sistema la tomo por un
     navegador y le dijo "esto se hace en el programa" cuando Sergio iba a tomar
     un pedido en la mesa.

     No hay marcador que buscar, asi que se le da la vuelta al criterio: lo que
     se bloquea es el NAVEGADOR DE ESCRITORIO. Un telefono o una tablet es la
     app, por definicion — nadie administra Cobra desde un celular.

     Y el sentido del bloqueo se conserva entero: la regla era "no vendas desde
     tu portatil, instala el programa". Un portatil sigue bloqueado. */
  function enLaApp() {
    if (w.electronPOS) return true;                    // el ejecutable de Windows
    try {
      var ua = navigator.userAgent || '';
      if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) return true;
      /* iPad moderno miente y dice ser un Mac de escritorio. Se delata porque
         tiene pantalla tactil, cosa que un Mac no. */
      if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    } catch (e) {}
    return false;
  }

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

;
/* ═══════ pos-carta.js ═══════ */
;/* ══════════════════════════════════════════════════════════════════════
   LA CARTA DE ESTA SUCURSAL — un solo sitio que resuelve la herencia.

   La regla, decidida el 2-ago-2026 y escrita en PLAN-MULTIMARCA.md:

     La carta es de la MARCA. El ajuste del local manda cuando existe; si no,
     rige el precio de la marca. Cambiar el precio base NO pisa a los locales
     que ya tienen ajuste propio.

   Nada se copia: una sucursal nueva ve los productos de su marca desde el
   primer segundo. Solo se guarda una fila en `pos_producto_sucursal` cuando
   ese local se APARTA — por eso "restablecer" es borrar esa fila.

   POR QUE UN MODULO Y NO EN CADA PANTALLA: el precio se lee en domicilios,
   venta rapida, salon, pagos y catalogo. Si cada una resolviera la herencia a
   su manera, dos pantallas cobrarian distinto — que es exactamente lo que ya
   paso con `payment_method` y con las notas frecuentes. Una regla, un sitio.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _ajustes = null;     // { product_id: {precio, activo} } de la sucursal activa
  var _branch  = null;
  var _cargando = null;
  /* Sucursal dicha a mano por la pantalla. La usa el Catalogo, que no carga
     pos-core y por tanto no tiene posContexto: sin esto, guardar un precio de
     sede fallaba con "no se sabe en que sucursal estas" — y el error moria
     dentro de un catch, que es como un ajuste desaparece sin que nadie lo
     note. */
  var _fijada = null;
  /* Rastro, no adivinanza: cuantas veces esta pantalla aplico la carta de su
     sede y a cuantos productos. Sin esto, la unica forma de saber si una
     pantalla cobra los precios del local era abrir el pedido y mirar el total.
     `posCarta.diag()` en la consola lo responde en un segundo. */
  var _veces = 0, _ultimo = 0;

  /* El cliente de Supabase.
     Se llama `cli` y no `sb` a proposito: varias pantallas declaran su cliente
     como `const sb` en el nivel superior del archivo, y eso NO queda en
     `window`. Con el nombre `sb` esta funcion se tapaba a si misma y nunca
     alcanzaba esa constante — el Catalogo lanzaba "no se sabe en que sucursal
     estas" teniendo la sucursal delante. */
  function cli() {
    try {
      if (window.sb) return window.sb;
      if (window._pos && window._pos.sb) return window._pos.sb;
      if (typeof sb !== 'undefined' && sb) return sb;
      return null;
    } catch (e) { return null; }
  }
  /* La sucursal activa. El ultimo recurso es lo guardado en el equipo porque
     el Catalogo NO carga pos-core (declara su propio `sb`, y cargar los dos
     revienta la pagina con "sb ya fue declarado"). Ahi no existe posContexto,
     pero la eleccion del switch sigue en el mismo sitio. */
  function sucursalActiva() {
    try {
      return _fijada
          || (window.posContexto && window.posContexto.sucursalId())
          || (window._pos && window._pos.state && window._pos.state.branchId)
          || localStorage.getItem('pos.contexto.sucursal')
          || null;
    } catch (e) { return null; }
  }

  /* Trae los ajustes de la sucursal activa. Una sola vez por pantalla.
     Si falla, se queda sin ajustes: la carta se ve con los precios de la
     marca, que es el comportamiento de siempre. Nunca deja una pantalla sin
     carta por un problema de red. */
  async function cargar(forzar) {
    var b = sucursalActiva();
    if (!b) { _ajustes = {}; return _ajustes; }
    if (!forzar && _ajustes && _branch === b) return _ajustes;
    if (_cargando) return _cargando;

    _cargando = (async function () {
      var mapa = {};
      try {
        var s = cli();
        if (s) {
          var r = await s.from('pos_producto_sucursal')
            .select('product_id,precio,activo,precios_pres').eq('branch_id', b);
          (r.data || []).forEach(function (x) {
            mapa[x.product_id] = { precio: x.precio, activo: x.activo, pres: x.precios_pres || null };
          });
        }
      } catch (e) { console.warn('[carta] sin ajustes de sucursal:', e && e.message); }
      _ajustes = mapa; _branch = b; _cargando = null;
      return _ajustes;
    })();
    return _cargando;
  }

  /* El precio que se COBRA en esta sucursal. */
  function precio(productId, precioBase) {
    var a = _ajustes && _ajustes[productId];
    return (a && a.precio != null) ? Number(a.precio) : Number(precioBase) || 0;
  }
  /* ¿Se vende aqui? Un local puede apagar un plato sin tocar la carta de la
     marca. `available` del producto sigue mandando si no hay ajuste. */
  function activo(productId, disponibleBase) {
    var a = _ajustes && _ajustes[productId];
    if (a && a.activo != null) return !!a.activo;
    return disponibleBase !== false;
  }
  function ajustado(productId) {
    var a = _ajustes && _ajustes[productId];
    if (!a) return false;
    var tienePres = a.pres && Object.keys(a.pres).length > 0;
    return !!(a.precio != null || a.activo != null || tienePres);
  }

  /* El precio de UNA presentacion en esta sucursal.
     Existe porque 22 de los 53 productos de El Parche se venden por
     presentacion (Personal/Familiar): el cobro sale de ahi, no de `price`.
     Ajustar solo `price` habria dejado sin efecto el 41% de la carta, en
     silencio. */
  function precioPres(productId, presId, precioBase) {
    var a = _ajustes && _ajustes[productId];
    var v = a && a.pres && a.pres[presId];
    return (v != null) ? Number(v) : Number(precioBase) || 0;
  }
  function precioBaseDe(productId, precioBase) { return Number(precioBase) || 0; }

  /* Aplica la herencia a una lista ya cargada de productos.
     Devuelve la MISMA lista con `price` y `available` resueltos para esta
     sucursal, y deja el original en `price_base` para poder mostrarlo. */
  function aplicar(productos) {
    _veces++; _ultimo = (productos || []).length;
    (productos || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (p.price_base === undefined) p.price_base = p.price;
      p.price     = precio(p.id, p.price_base);
      p.available = activo(p.id, p.available);
      p.ajustado  = ajustado(p.id);

      /* Las presentaciones tambien: el precio que se cobra sale de aqui
         cuando el producto se vende por tamaños. */
      var min = null;
      if (Array.isArray(p.presentations)) {
        p.presentations.forEach(function (pr) {
          if (!pr || !pr.id) return;
          if (pr.price_base === undefined) pr.price_base = pr.price;
          pr.price = precioPres(p.id, pr.id, pr.price_base);
          if (pr.price > 0 && (min === null || pr.price < min)) min = pr.price;
        });
      }
      /* El cuadro del producto muestra `price`. En la carta actual el precio
         base ES la presentacion mas barata (20 de los 22 productos con
         tamaños de El Parche), asi que al ajustar solo las presentaciones hay
         que mover tambien el base: si no, el cuadro anuncia $18.000 y la caja
         cobra $15.000. No se toca si la sede fijo un precio base a mano. */
      var a = _ajustes && _ajustes[p.id];
      if (min !== null && a && a.pres && Object.keys(a.pres).length && a.precio == null) {
        p.price = min;
      }
    });
    return productos || [];
  }

  /* Guardar un ajuste SOLO para esta sucursal. */
  async function ajustar(productId, opts) {
    var s = cli(), b = sucursalActiva();
    if (!s || !b) throw new Error('No se sabe en que sucursal estas');
    var tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    var fila = { product_id: productId, branch_id: b, updated_at: new Date().toISOString() };
    /* Solo se manda si se sabe. Mandar null lo pisaria: la columna tiene
       DEFAULT current_tenant_id(), que acierta siempre. En el Catalogo no hay
       pos-core y por tanto no hay tenant a mano. */
    if (tenantId) fila.tenant_id = tenantId;
    if (opts && 'precio' in opts) fila.precio = (opts.precio === null ? null : Number(opts.precio));
    if (opts && 'activo' in opts) fila.activo = opts.activo;
    /* Se manda el mapa COMPLETO de presentaciones ajustadas, no un parche:
       quitar el ajuste de una presentacion es mandarla fuera del mapa. */
    if (opts && 'pres' in opts) {
      var m = opts.pres || {}, limpio = {};
      Object.keys(m).forEach(function (k) { if (m[k] != null) limpio[k] = Number(m[k]); });
      fila.precios_pres = Object.keys(limpio).length ? limpio : null;
    }
    var r = await s.from('pos_producto_sucursal')
      .upsert(fila, { onConflict: 'product_id,branch_id' }).select('id');
    /* 0 filas sin error es el fallo silencioso de siempre. */
    if (r.error || !r.data || !r.data.length) {
      throw new Error((r.error && r.error.message) || 'no se guardo el ajuste');
    }
    await cargar(true);
    return true;
  }

  /* RESTABLECER: borrar la excepcion. El producto vuelve al precio de la
     marca — no se "copia de vuelta" un valor, simplemente se deja de tener
     opinion propia. */
  async function restablecer(productId) {
    var s = cli(), b = sucursalActiva();
    if (!s || !b) throw new Error('No se sabe en que sucursal estas');
    var q = s.from('pos_producto_sucursal').delete().eq('branch_id', b);
    if (productId) q = q.eq('product_id', productId);
    var r = await q;
    if (r.error) throw new Error(r.error.message);
    await cargar(true);
    return true;
  }

  /* Cuantos productos estan ajustados en esta sucursal. Para el aviso de
     "esta carta tiene N precios propios". */
  function cuantosAjustados() {
    return Object.keys(_ajustes || {}).length;
  }

  /* Lo que esta ajustado hoy para un producto. Lo usa la pantalla para pintar
     los campos sin volver a consultar. */
  function ajustesDe(productId) {
    var a = (_ajustes && _ajustes[productId]) || {};
    return { precio: a.precio != null ? Number(a.precio) : null,
             activo: a.activo != null ? !!a.activo : null,
             pres: a.pres ? JSON.parse(JSON.stringify(a.pres)) : {} };
  }

  window.posCarta = {
    cargar: cargar, aplicar: aplicar,
    precio: precio, precioPres: precioPres,
    activo: activo, ajustado: ajustado, ajustesDe: ajustesDe, precioBase: precioBaseDe,
    ajustar: ajustar, restablecer: restablecer,
    cuantosAjustados: cuantosAjustados,
    sucursal: sucursalActiva,
    fijarSucursal: function (id) { if (id && id !== _fijada) { _fijada = id; _ajustes = null; } },
    diag: function () {
      return { sucursal: sucursalActiva(), aplicada_veces: _veces,
               productos_ultima_vez: _ultimo, ajustes: cuantosAjustados() };
    }
  };

  /* Se precarga en cuanto pos-core sabe la sucursal, para que la primera
     pantalla que pregunte ya lo tenga. */
  try {
    if (window._pos && window._pos.on) window._pos.on('core:ready', function () { cargar(); });
  } catch (e) {}
})();

;
/* ═══════ pos-plan.js ═══════ */
;/* pos-plan.js — Qué puede usar cada restaurante según su plan.
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
  var oyentes = [];        // a quien avisarle cuando el plan quede confirmado

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
    mapa: {
      titulo: 'Mapa y ruta del domiciliario',
      plan: 'Pro',
      que: 'El domiciliario ve en el mapa dónde queda la casa del cliente y el camino hasta allá, sin salir de la app.',
      mas: ['Mapa de Google, con los negocios de la cuadra como referencia', 'La ruta se calcula sola al tocar "en ruta"'],
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
      /* Está en Pro, no en Premium. Quien más la necesita es el dueño que anda
         en la cocina con el celular, no la cadena que tiene a alguien sentado
         frente a un computador; y a Cobra no le cuesta nada, porque los
         mensajes los factura Meta a la cuenta del propio restaurante. */
      plan: 'Pro',
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

  /* Lo guardado en el equipo, si sirve. `fresco:false` marca que todavia no
     se confirmo contra la base. */
  function delEquipo() {
    try {
      var g = window.posCache && posCache.leer('plan');
      if (!g || !g.datos || typeof g.datos.plan !== 'string') return null;
      return { plan: g.datos.plan, nombrePlan: g.datos.nombrePlan,
               funciones: g.datos.funciones, fresco: false };
    } catch (e) { return null; }
  }

  /* La consulta de verdad, por detras. Si el plan cambio, se vuelven a poner
     los candados —quitando los que ya no corresponden— y recien ahi se puede
     sacar a alguien de una pantalla. */
  async function refrescarPorDetras() {
    var antes = ctx ? JSON.stringify(ctx.funciones) + '|' + ctx.plan : '';
    try {
      /* Ojo: NO se vacia ctx. Si se vacia, durante los dos viajes a internet
         puede() responde "si" a todo y el candado del menu deja de frenar el
         clic. Se sigue trabajando con el dato viejo hasta tener el nuevo. */
      cargando = null;
      await cargar(true);
    } catch (e) { return; }
    var ahora = ctx ? JSON.stringify(ctx.funciones) + '|' + ctx.plan : '';
    try { marcarNav(); } catch (e) {}
    if (antes !== ahora) console.info('[plan] cambio:', antes, '->', ahora);
    try { protegerPantalla(); } catch (e) {}
    avisar();
  }

  /* `porRed` obliga a preguntarle a la base y saltarse lo guardado. Sin eso,
     el refresco de fondo se llamaba a si mismo: pedia cargar(), cargar() veia
     que habia algo guardado, lo devolvia y programaba otro refresco. Nunca
     salia a internet y el candado viejo no se corregia jamas. */
  var refrescando = false;   // para no encadenar veinte confirmaciones

  async function cargar(porRed) {
    if (ctx && !porRed) {
      /* Lo guardado sirve YA, pero todavia no esta confirmado contra la base.
         Sin esta linea, precargar `ctx` al abrir el archivo dejaba a `cargar()`
         volviendo al instante para siempre: nunca salia a internet y un plan
         que cambio no se enteraba jamas. */
      if (!ctx.fresco && !refrescando) {
        refrescando = true;
        setTimeout(function () {
          refrescarPorDetras().then(function () { refrescando = false; },
                                    function () { refrescando = false; });
        }, 0);
      }
      return ctx;
    }
    if (cargando && !porRed) return cargando;
    if (!porRed) {
      var guardado = delEquipo();
      if (guardado) { ctx = guardado; return cargar(false); }   // cae al bloque de arriba
    }
    cargando = (async function () {
      var s = sb();
      /* Sin sesion (login, registro, onboarding) no se bloquea nada:
         `funciones: null` significa "dejar pasar". Poner una lista vacia aqui
         haria que esas pantallas se comporten como un Starter sin nada. */
      var por_defecto = { plan: '', funciones: null };
      if (!s) return (ctx = por_defecto);
      try {
        var u = (window._pos && window._pos.state && window._pos.state.user) || null;
        if (!u) { try { u = (await s.auth.getSession()).data.session.user; } catch (e) {} }
        if (!u) return (ctx = por_defecto);   // sin sesion: no bloquear
        var tenantId = (u.user_metadata && u.user_metadata.tenant_id) || u.id;

        var t = await s.from('tenants').select('plan').eq('id', tenantId).maybeSingle();
        var plan = (t.data && t.data.plan) || 'starter';
        var p = await s.from('pos_planes').select('nombre,funciones').eq('plan', plan).maybeSingle();
        ctx = {
          plan: plan,
          nombrePlan: (p.data && p.data.nombre) || plan,
          funciones: (p.data && p.data.funciones) || [],
          fresco: true,
        };
        /* Solo se guarda lo que vino BIEN de la base. Un fallo se responde con
           "dejar pasar todo", y eso no se puede quedar guardado en el equipo:
           el proximo arranque creeria que el plan lo permite todo. */
        try {
          if (window.posCache) posCache.guardar('plan', {
            plan: ctx.plan, nombrePlan: ctx.nombrePlan, funciones: ctx.funciones,
          });
        } catch (e) {}
      } catch (e) {
        /* Si falla la consulta NO se bloquea nada: es peor dejar a un cliente
           que sí pagó sin poder trabajar que dejar entrar a uno que no. */
        console.warn('[plan] no se pudo leer, se deja pasar todo:', e);
        ctx = { plan: 'desconocido', nombrePlan: '', funciones: null, fresco: false };
      }
      return ctx;
    })();
    return cargando;
  }

  /* Le avisa a las pantallas que el plan ya se sabe (o que cambio). Sirve para
     lo que se pinta ANTES de que llegue la respuesta: la pantalla de cobro se
     dibuja al instante desde el cache del equipo, y si el plan tarda, alcanza a
     mostrar un boton que ese restaurante no tiene. Con esto se repinta sola. */
  function avisar() {
    for (var i = 0; i < oyentes.length; i++) {
      try { oyentes[i](ctx); } catch (e) { console.warn('[plan] oyente:', e); }
    }
  }

  /* Se llama YA con lo que se sepa ahora, y otra vez cuando se confirme. */
  function alSaber(fn) {
    if (typeof fn !== 'function') return;
    oyentes.push(fn);
    try { fn(ctx); } catch (e) {}
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
  /* Se puede llamar las veces que haga falta: pone los candados que faltan y
     QUITA los que ya no corresponden. Sin lo segundo, un candado puesto con un
     dato viejo se quedaba ahi aunque la consulta dijera que si se puede. */
  /* Elementos marcados a mano con data-plan="clave". Sirve para lo que NO es
     una pantalla propia: un boton dentro de Configuracion, una pestana, una
     seccion. Dos comportamientos:
       · data-plan          -> se queda visible con candado; al tocarlo, el aviso.
       · data-plan-oculta   -> desaparece. Solo para lo que no tiene sentido
                               anunciar en medio del trabajo (el letrero de
                               puntos en la pantalla de cobro, por ejemplo:
                               ahi el cajero esta cobrandole a alguien). */
  function marcarSueltos() {
    var ocultar = document.querySelectorAll('[data-plan-oculta]');
    for (var j = 0; j < ocultar.length; j++) {
      var o = ocultar[j];
      o.style.display = puede(o.getAttribute('data-plan-oculta')) ? '' : 'none';
    }

    var marc = document.querySelectorAll('[data-plan]');
    for (var k = 0; k < marc.length; k++) {
      var el = marc[k], cl = el.getAttribute('data-plan');
      var lk = el.querySelector('.pos-plan-lock');
      if (puede(cl)) { if (lk) lk.remove(); continue; }
      if (!lk) {
        lk = document.createElement('span');
        lk.className = 'pos-plan-lock';
        lk.style.cssText = 'margin-left:6px;display:inline-flex;align-items:center;opacity:.55;flex-shrink:0;vertical-align:middle';
        lk.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" '
          + 'height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        el.appendChild(lk);
      }
      if (!el.dataset.posPlanClick) {
        el.dataset.posPlanClick = '1';
        (function (c) {
          el.addEventListener('click', function (ev) {
            if (puede(c)) return;
            ev.preventDefault(); ev.stopPropagation();
            mostrar(c);
          }, true);
        })(cl);
      }
    }
  }

  function marcarNav() {
    try { marcarSueltos(); } catch (e) {}
    var items = document.querySelectorAll('a[href]');
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var destino = (a.getAttribute('href') || '').split('?')[0].split('/').pop();
      var clave = PANTALLAS[destino];
      if (!clave) continue;
      var lock = a.querySelector('.pos-plan-lock');

      if (puede(clave)) { if (lock) lock.remove(); continue; }
      if (lock) continue;                       // ya estaba marcado

      // El botón se queda igual, solo con un candado pequeño al lado.
      lock = document.createElement('span');
      lock.className = 'pos-plan-lock';
      lock.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;opacity:.55;flex-shrink:0';
      lock.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" ' +
        'height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      a.appendChild(lock);

      /* El aviso decide EN EL CLIC, no ahora: asi, si la consulta de fondo
         dice que el plan si lo permite, el enlace vuelve a funcionar solo.
         Un escuchador puesto una vez no se puede quitar despues. */
      if (!a.dataset.posPlanClick) {
        a.dataset.posPlanClick = '1';
        (function (k) {
          a.addEventListener('click', function (ev) {
            if (puede(k)) return;
            ev.preventDefault();
            ev.stopPropagation();
            mostrar(k);
          }, true);
        })(clave);
      }
    }
  }

  /* Proteger la PANTALLA, no solo el boton: si alguien escribe la direccion a
     mano o llega por un enlace viejo, tiene que encontrarse lo mismo. Sin esto
     el candado del menu seria decorativo. */
  function protegerPantalla() {
    /* Solo con el dato confirmado contra la base. Echar a alguien de una
       pantalla por algo guardado que quedo viejo es mucho peor que dejarlo
       entrar el segundo que tarda la consulta. */
    if (!ctx || !ctx.fresco) return;
    var aqui = location.pathname.split('/').pop();
    var clave = PANTALLAS[aqui];
    if (!clave || puede(clave)) return;
    if (document.getElementById('pos-plan-modal')) return;   // ya esta puesto
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
    alSaber: alSaber,
    ctx: function () { return ctx; },
  };

  /* EN CUANTO CARGA EL ARCHIVO, sin esperar nada, se toma lo guardado en el
     equipo. Antes `ctx` quedaba en null hasta core:ready (o 400 ms), y `puede()`
     con ctx en null responde "si" a todo — a proposito, para no estorbar. El
     efecto era que la pantalla de cobro alcanzaba a pintar el boton de puntos
     de un restaurante que no los tiene, y se corregia medio segundo despues.
     Con esto, de la segunda visita en adelante el plan se sabe desde el primer
     trazo. La consulta de verdad sale igual, por detras. */
  try {
    var _g = delEquipo();
    if (_g) ctx = _g;
  } catch (e) {}

  // Arranca solo: carga el plan y pone los candados del menú.
  function arrancar() {
    cargar().then(function () {
      try { marcarNav(); } catch (e) {}
      try { protegerPantalla(); } catch (e) {}
      avisar();
    });
  }
  if (window._pos && window._pos.on) window._pos.on('core:ready', arrancar);
  if (document.readyState !== 'loading') setTimeout(arrancar, 400);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(arrancar, 400); });
})();

;
/* ═══════ pos-perms.js ═══════ */
;/* ==========================================================================
   pos-perms.js — Permisos de rol (candado del lado de la app)
   --------------------------------------------------------------------------
   Se carga en las páginas que necesitan controlar acceso, DESPUÉS de pos-core.

   Resuelve UNA vez el rol del usuario y sus permisos (pos_roles.perms) y los
   deja disponibles para todas las pantallas:

     await window.posPermsReady();       // espera a que carguen
     window.posHasPerm('pedidos.anular') // ¿tiene este permiso?
     window.posHasAny(['a','b'])         // ¿tiene alguno?
     window.posRole()                    // nombre del rol (minúsculas)

   Reglas:
     · admin / administrador / gerente / dueño  → todos los permisos.
     · rol del sistema (pos_roles.system_role)  → todos los permisos.
     · cualquier otro rol                       → su lista pos_roles.perms.
     · rol no reconocido                        → acceso completo (fail-open),
       para NO dejar al dueño encerrado durante el despliegue. El candado
       REAL (contra fraude por código) es el blindaje RLS pendiente aparte.

   OJO: esto bloquea la INTERFAZ, no la base de datos. Alguien técnico que
   llame la API directo podría saltárselo — ese endurecimiento es un pendiente
   documentado en ESTADO-SISTEMA.md.
   ========================================================================== */
(function () {
  'use strict';

  /* Esta lista YA NO decide quien es el dueño.
     Antes traia 'gerente' y 'administrador' y bastaba con tener ese texto en la
     metadata para quedarse con acceso total. Pero la metadata la puede
     reescribir el propio usuario (comprobado el 12-ago en la app real con
     sb.auth.updateUser), asi que cualquier empleado podia ascenderse solo.
     Y ademas 'administrador' es un ROL NORMAL: solo puede lo que el dueño le
     conceda (ver DICCIONARIO-ACCESOS.md).
     Ahora el dueño se le pregunta a la BASE, con es_dueno(). */
  var ADMIN_ROLES = [];

  /* NOMBRE VIEJO → CLAVE INTERNA.
     Durante aNos el sistema guardo en el usuario el NOMBRE del rol en
     minusculas ('gerente', 'cajera'...). Eso sigue guardado en las cuentas
     que ya existen, asi que hay que saber leerlo: sin esta tabla, las 4
     cuentas de 'gerente' que hay hoy dejarian de reconocerse. */
  var _ALIAS_ROL = {
    admin:'admin', administrador:'admin', gerente:'admin', propietario:'admin', dueno:'admin',
    cajero:'cajero', cajera:'cajero', caja:'cajero',
    mesero:'mesero', mesera:'mesero',
    cocina:'cocina', cocinero:'cocina', cocinera:'cocina', chef:'cocina',
    domiciliario:'domiciliario', domiciliaria:'domiciliario',
    repartidor:'domiciliario', repartidora:'domiciliario'
  };
  function posRolClave(v) {
    var k = (v == null ? '' : String(v)).toLowerCase().trim();
    return _ALIAS_ROL[k] || null;   // null = rol propio del restaurante
  }
  window.posRolClave = posRolClave;

  var _perms = null;   // array de ids, o '*' = todos, o null = aún cargando
  var _role  = null;
  var _fresco = false; // true solo cuando _perms vino confirmado de la base
  /* Lo que posGate escondio o dejo pasar, para poder re-evaluarlo cuando
     llegue el dato confirmado. Sin esto, un boton escondido por un dato
     viejo se quedaba escondido toda la pantalla. */
  var _puertas = [];

  function cliente() {
    try { return (typeof sb !== 'undefined' && sb) ? sb : (window.sb || (window._pos && window._pos.sb)); }
    catch (e) { return window.sb || (window._pos && window._pos.sb); }
  }

  /* Esperar a que pos-core sepa en que SUCURSAL estamos.
     pos-perms arranca apenas se carga el archivo, y pos-core resuelve la sesion
     y el contexto de forma asincrona. Sin esta espera, la primera resolucion no
     sabia la sucursal, se saltaba el rol-por-sucursal y caia en el camino
     viejo: a un cajero le daba permisos de mas. Comprobado el 12-ago.
     `_pos.on` reentrega los eventos ya emitidos, asi que llegar tarde no
     cuelga; y hay tope de tiempo por si esta pantalla no carga pos-core. */
  function _esperarContexto() {
    return new Promise(function (res) {
      try {
        if (!window._pos || typeof window._pos.on !== 'function') return res();
        if (window.posContexto || (window._pos.state && window._pos.state.branchId)) return res();
        var hecho = false;
        var fin = function () { if (!hecho) { hecho = true; res(); } };
        window._pos.on('core:ready', fin);
        setTimeout(fin, 2500);
      } catch (e) { res(); }
    });
  }

  async function resolver(porRed) {
    var sb = cliente();
    if (!sb) { _perms = '*'; return; }
    await _esperarContexto();
    try {
      /* De la sesion guardada en el equipo, no del servidor: getUser sale a
         internet y esto corre en 15 pantallas. */
      var ur = await sb.auth.getSession();
      var user = ur && ur.data && ur.data.session && ur.data.session.user;
      if (!user) { _perms = '*'; return; }
      var meta = user.user_metadata || {};
      var role = (meta.role || '').toString().toLowerCase().trim();
      _role = role;

      if (ADMIN_ROLES.indexOf(role) >= 0) { _perms = '*'; _fresco = true; return; }

      /* ¿ES EL DUEÑO? Se le pregunta a la BASE, no a la metadata.
         El dueño es la cuenta con la que se registro el restaurante
         (tenants.owner_user_id) y tiene acceso total POR SERLO, sin rol
         asignado — no porque el sistema no lo reconozca, que era lo que
         pasaba antes.
         Lo guardado en el equipo evita salir a la red en cada pantalla; solo
         se guarda el SI confirmado, nunca un fallo. */
      var _cacheDueno = null;
      try { _cacheDueno = window.posCache && posCache.leer('dueno'); } catch (e) {}
      if (!porRed && _cacheDueno && _cacheDueno.datos && _cacheDueno.datos.dueno === true) {
        _perms = '*';
        _readyFresco = resolver(true);   // la base confirma por detras
        return;
      }
      try {
        //  La misma pregunta que hace pos-core: se comparte el viaje.
        var _rd = window.posUna ? await window.posUna('es_dueno', function () { return sb.rpc('es_dueno'); })
                                : await sb.rpc('es_dueno');
        if (!_rd.error && _rd.data === true) {
          _perms = '*'; _fresco = true;
          try { if (window.posCache) posCache.guardar('dueno', { dueno: true }); } catch (e) {}
          _reEvaluarPuertas();
          return;
        }
      } catch (e) { /* sin red: sigue por el camino del rol */ }

      /* ROL POR SUCURSAL. Una persona puede ser cajero en una sede y mesero en
         otra, asi que los permisos dependen de DONDE esta trabajando ahora
         mismo — no de un rol unico pegado a la persona.
         La sucursal activa la da posContexto (pos-core).
         Si no hay fila para esa sucursal, devuelve null y se sigue por el
         camino de antes: durante la transicion nadie se queda encerrado. */
      var _suc = null;
      try { _suc = (window.posContexto && window.posContexto.sucursalId()) ||
                   (window._pos && window._pos.state && window._pos.state.branchId) || null; } catch (e) {}
      if (_suc) {
        var _llaveSuc = 'perms.suc.' + _suc;
        if (!porRed) {
          var gs = null;
          try { gs = window.posCache && posCache.leer(_llaveSuc); } catch (e) {}
          if (gs && gs.datos && Array.isArray(gs.datos.perms)) {
            _perms = gs.datos.perms.slice();
            _readyFresco = resolver(true);
            return;
          }
        }
        try {
          var _rs = await sb.rpc('permisos_en_sucursal', { p_branch: _suc });
          if (!_rs.error && Array.isArray(_rs.data)) {
            _perms = _rs.data.slice(); _fresco = true;
            try { if (window.posCache) posCache.guardar(_llaveSuc, { perms: _perms }); } catch (e) {}
            _reEvaluarPuertas();
            return;
          }
        } catch (e) { /* sin red o sin fila: sigue por el camino del rol */ }
      }

      /* Lo guardado en el equipo sirve YA — pero solo para CONCEDER. La
         llave lleva el rol: en un mismo equipo pueden turnarse un mesero y
         un cajero, y los permisos de uno no pueden pintar los del otro. */
      if (!porRed) {
        var g = null;
        try { g = window.posCache && posCache.leer('perms.' + role); } catch (e) {}
        if (g && g.datos && Array.isArray(g.datos.perms)) {
          _perms = g.datos.perms.slice();
          _readyFresco = resolver(true);   // la base confirma por detras
          return;
        }
      }

      var tenantId = meta.tenant_id;
      var q = sb.from('pos_roles').select('clave,name,perms,system_role');
      if (tenantId) q = q.eq('tenant_id', tenantId);
      var rr = await q;
      if (rr && rr.error) throw rr.error;
      var rows = (rr && rr.data) || [];

      /* SE BUSCA POR LA CLAVE INTERNA, NO POR EL NOMBRE (21-ago-2026).
         Antes esta comparacion era contra `name`, el nombre que el dueNo VE
         Y PUEDE EDITAR. Osea que el dia que renombrara "Cajero" a "Cajera
         de mostrador" —que es justamente lo que Cobra le ofrece hacer— sus
         cajeros se quedaban sin permisos, y por el fail-open de abajo
         terminaban con acceso TOTAL. La clave no cambia nunca. */
      var claveBuscada = posRolClave(role);
      var match = null, i;
      for (i = 0; i < rows.length; i++) {
        if (claveBuscada && rows[i].clave === claveBuscada) { match = rows[i]; break; }
      }
      if (!match) {   /* rol propio del restaurante: ese si va por nombre */
        for (i = 0; i < rows.length; i++) {
          if ((rows[i].name || '').toString().toLowerCase().trim() === role) { match = rows[i]; break; }
        }
      }
      if (match) {
        /* ACCESO TOTAL SOLO PARA EL ADMINISTRADOR.
           Aqui decia `if (match.system_role)`, y `system_role` cambio de
           significado: hoy marca los 5 roles que Cobra siembra para que no
           se puedan BORRAR (admin, cajero, mesero, cocina, domiciliario).
           Dejarlo asi le habria dado acceso total a todos los meseros y
           domiciliarios del sistema. Quien manda es la clave. */
        if (match.clave === 'admin') { _perms = '*'; _fresco = true; _reEvaluarPuertas(); return; }
        _perms = Array.isArray(match.perms) ? match.perms.slice() : [];
        _fresco = true;
        /* Solo se guarda lo confirmado. El '*' de un fallo no se guarda
           nunca: dejaria el equipo concediendo todo en el proximo arranque. */
        try { if (window.posCache) posCache.guardar('perms.' + role, { perms: _perms }); } catch (e) {}
        _reEvaluarPuertas();
        return;
      }
      /* Rol no encontrado en pos_roles → no encerrar al usuario.
         Se mantiene la red de seguridad (encerrar a alguien en pleno servicio
         es peor), pero DEJANDO RASTRO: hasta hoy era un console.warn que nadie
         miraba, y por ahi pasaba cualquier rol mal escrito con acceso total.
         El dato de verdad ya no depende de esto: la base bloquea por su cuenta
         aunque la pantalla abra de mas. */
      console.warn('[pos-perms] rol no reconocido:', role, '→ acceso completo (fail-open)');
      try {
        sb.from('pos_diag').insert({
          donde: 'pos-perms/rol-no-reconocido',
          mensaje: 'rol "' + role + '" no existe en pos_roles; se abrio todo por seguridad',
          extra: { role: role, tenant: meta.tenant_id || null, roles_vistos: rows.map(function (x) { return x.name; }) }
        });
      } catch (e) {}
      _perms = '*';
    } catch (e) {
      console.warn('[pos-perms] error resolviendo permisos', e);
      /* Si esto es el refresco de fondo y ya hay permisos guardados del
         equipo, se quedan: son un dato real de ayer, mejor que abrirlo todo
         por un fallo de red de hoy. El '*' de emergencia es solo para cuando
         no hay NADA con que trabajar. */
      if (porRed && Array.isArray(_perms)) return;
      _perms = '*';
    }
  }

  /* Vuelve a decidir cada puerta con el dato confirmado: muestra lo que un
     dato viejo escondio de mas, y esconde lo que dejo pasar de mas. */
  function _reEvaluarPuertas() {
    for (var i = 0; i < _puertas.length; i++) {
      var p = _puertas[i];
      if (!p.el || !p.el.isConnected) continue;
      var ok = Array.isArray(p.ids) ? window.posHasAny(p.ids) : window.posHasPerm(p.ids);
      p.el.style.display = ok ? p.antes : 'none';
    }
  }

  var _ready = resolver();
  var _readyFresco = _ready;

  /* Espera el dato CONFIRMADO antes de negar algo. Negar con un dato viejo
     — esconder un boton, plantar el PIN, frenar una pagina — castiga a un
     mesero al que quiza acaban de darle ese permiso. Conceder de mas un
     instante ya pasa hoy (mientras carga se concede todo), asi que esa
     direccion no empeora. */
  async function _confirmarSiNiega(idOrIds) {
    var ok = Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
    if (ok || _fresco) return ok;
    try { await _readyFresco; } catch (e) {}
    return Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
  }

  window.posPermsReady = function () { return _ready; };
  window.posRole = function () { return _role; };
  window.posPerms = function () { return _perms; };

  window.posHasPerm = function (id) {
    if (_perms === '*') return true;
    if (_perms === null) return true;   // aún no carga → no bloquear de más
    return _perms.indexOf(id) >= 0;
  };

  window.posHasAny = function (ids) {
    if (_perms === '*' || _perms === null) return true;
    for (var i = 0; i < (ids || []).length; i++) if (_perms.indexOf(ids[i]) >= 0) return true;
    return false;
  };

  /* Oculta un elemento del DOM si el usuario no tiene el/los permiso(s).
     Uso: posGate(el, 'pedidos.anular')  ·  posGate(el, ['config.general','config.salon']) */
  window.posGate = function (el, idOrIds) {
    if (!el) return;
    var ok = Array.isArray(idOrIds) ? window.posHasAny(idOrIds) : window.posHasPerm(idOrIds);
    /* Se recuerda SIEMPRE (con el display que traia), no solo cuando
       esconde: la confirmacion de la base puede llegar diciendo lo
       contrario en cualquiera de las dos direcciones. */
    _puertas.push({ el: el, ids: idOrIds, antes: el.style.display === 'none' ? '' : el.style.display });
    if (!ok) el.style.display = 'none';
    return ok;
  };

  /* ── PIN de administrador (override de gerente) ─────────────────────────
     Nada se oculta. Cuando alguien SIN permiso toca una acción, aparece el
     PIN: si es correcto, la acción procede. Así el gerente puede resolver
     algo rápido desde la cuenta de cualquier rol con solo poner el PIN.
     Valida contra pos_users.pin (mismo PIN de Configuración → Operación). */
  window.posPinPrompt = function (motivo, onOk, onCancel) {
    var prev = document.getElementById('pos-pin-modal');
    if (prev) prev.remove();
    var ov = document.createElement('div');
    ov.id = 'pos-pin-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:inherit';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:340px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.25)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<div style="font-weight:700;font-size:15px;color:#0F172A">PIN de administrador</div>'
      + '<button id="pos-pin-x" style="border:none;background:#F1F5F9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:16px;color:#64748B">&#x2715;</button>'
      + '</div>'
      + '<p style="font-size:12.5px;color:#64748B;margin:0 0 12px;line-height:1.5">' + (motivo || 'Esta acción requiere permiso. Ingresa el PIN para continuar.') + '</p>'
      + '<input id="pos-pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="••••"'
      + ' style="width:100%;border:1.5px solid #ECEEF2;border-radius:10px;padding:11px 14px;font-size:20px;letter-spacing:6px;text-align:center;outline:none;box-sizing:border-box;color:#0F172A">'
      + '<p id="pos-pin-err" style="color:#EF4444;font-size:12px;margin:6px 0 0;display:none"></p>'
      + '<button id="pos-pin-ok" style="margin-top:14px;width:100%;padding:11px;border:none;border-radius:10px;background:#5B6BFF;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Confirmar</button>'
      + '</div>';
    document.body.appendChild(ov);
    var inp = document.getElementById('pos-pin-input');
    var err = document.getElementById('pos-pin-err');
    setTimeout(function () { if (inp) inp.focus(); }, 50);
    function cerrar() { ov.remove(); }
    function cancelar() { cerrar(); if (typeof onCancel === 'function') onCancel(); }
    document.getElementById('pos-pin-x').addEventListener('click', cancelar);
    ov.addEventListener('click', function (e) { if (e.target === ov) cancelar(); });
    async function validar() {
      var sb = cliente();
      var entered = (inp.value || '').trim();
      if (!entered) { err.textContent = 'Ingresa el PIN'; err.style.display = 'block'; return; }
      if (!sb) { err.textContent = 'Error de conexión'; err.style.display = 'block'; return; }
        /* EL PIN NO BAJA AL COMPUTADOR (24-ago-2026). Antes esta pantalla se
           traia el PIN y lo comparaba aqui mismo, asi que cualquiera con la
           consola del navegador podia leerlo — y todos los empleados podian,
           porque la unica regla de `pos_users` deja ver la ficha de los demas.
           Ahora se le manda al servidor lo que escribieron y responde si o no.
           El servidor guarda solo una HUELLA del PIN: ni leyendo la base se
           puede saber cual es. Y lleva freno: 5 fallos por hora y se bloquea. */
        try {
        var hay = await sb.rpc('fn_pin_existe');
        if (!hay.error && hay.data === false) {
          err.textContent = 'No hay PIN configurado. Ve a Configuración → Operación.'; err.style.display = 'block'; return;
        }
        var r = await sb.rpc('fn_pin_verificar', { p_pin: entered, p_accion: 'pantalla' });
        if (r.error) { err.textContent = 'Error al verificar el PIN'; err.style.display = 'block'; return; }
        if (r.data !== true) {
          err.textContent = 'PIN incorrecto'; err.style.display = 'block'; inp.value = ''; inp.focus(); return;
        }
        cerrar();
        if (typeof onOk === 'function') onOk();
      } catch (e) {
        err.textContent = 'Error al verificar el PIN'; err.style.display = 'block';
      }
    }
    document.getElementById('pos-pin-ok').addEventListener('click', validar);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') validar(); });
  };

  /* Candado de una ACCIÓN por permiso. Si el usuario tiene el permiso, corre
     onOk() de una; si no, aparece el PIN y corre onOk() solo si es correcto.
        posGuard('pedidos.cobrar', function(){ irACobrar(); }); */
  window.posGuard = async function (idOrIds, onOk, motivo) {
    try { await _ready; } catch (e) {}
    /* Antes de plantar el PIN, el dato confirmado: que el permiso se lo
       hayan dado hace cinco minutos no puede terminar en un PIN en la cara. */
    var ok = await _confirmarSiNiega(idOrIds);
    if (ok) { if (typeof onOk === 'function') onOk(); return; }
    window.posPinPrompt(motivo || 'Esta acción requiere permiso de administrador.', onOk);
  };

  /* Candado de ENTRADA a una página. Nada se oculta: si no tiene el permiso,
     aparece el PIN encima de la página. PIN correcto → se queda; cancelar →
     sale a un lugar seguro (por defecto Ventas).
        posRequirePin('ventas.ver');
        posRequirePin(['config.general','config.salon','config.usuarios']); */
  window.posRequirePin = async function (idOrIds, backTo) {
    try { await _ready; } catch (e) {}
    /* Frenar una pagina entera exige el dato confirmado, no el guardado. */
    var ok = await _confirmarSiNiega(idOrIds);
    if (ok) return true;
    window.posPinPrompt(
      'Esta sección requiere permiso. Ingresa el PIN de administrador para entrar.',
      function () { /* desbloqueado: se queda en la página */ },
      function () { window.location.replace(backTo || 'ventas.html'); }
    );
    return false;
  };
})();

;
/* ═══════ pos-brand.js ═══════ */
;/* ==========================================================================
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
      /*  Antes pedia "la primera sucursal activa" con su propio viaje. Ahora
          sale de la sucursal que pos-core ya trajo, que ademas es LA del
          usuario y no la primera que aparezca. */
      var d = window.posSucursal ? await window.posSucursal() : null;
      if (!d) {
        var r = await sb.from('branches').select('name, brands(name)')
          .eq('is_active', true).limit(1).maybeSingle();
        d = r && r.data;
      }
      if (d) return (d.brands && d.brands.name) || d.name || '';
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
      var _d = window.posSucursal ? await window.posSucursal() : null;
      if (_d && _d.brands && _d.brands.logo_url) return _d.brands.logo_url;
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

;
/* ═══════ pos-events.js ═══════ */
;// =================================================
// pos-events.js — Registro de eventos del sistema
// Los módulos se comunican via window._pos.emit() / .on()
// =================================================

/*
  EVENTOS DISPONIBLES:

  core:ready          → Core listo, rol detectado           { role }
  order:new           → Pedido nuevo creado                 { order }
  order:updated       → (retirado 28-ago-2026: lo emitia pos-realtime.js, que
                        abria 3 canales de tiempo real para avisos que NINGUNA
                        pantalla escuchaba. Cada pantalla se suscribe a lo suyo.)
  order:ready         → Cocina marcó pedido como listo      { orderId }
  order:paid          → Pedido cobrado y cerrado            { orderId }
  table:updated       → Estado de una mesa cambió           { table }
  session:opened      → Turno de caja abierto               { session }
  session:closed      → Turno de caja cerrado               { session }
*/

console.log('[POS Events] Sistema de eventos listo');

;
/* ═══════ pos-impuestos.js ═══════ */
;/* ══════════════ pos-impuestos.js — IMPUESTOS (INC / IVA) ══════════════
   Un solo lugar donde se calcula el impuesto, para que el cobro, el recibo y
   los informes NUNCA den números distintos.

   VIENE APAGADO. Un restaurante pequeño en Colombia suele ser "no responsable"
   de impoconsumo y no cobra nada (es el caso de El Parche). Si está apagado,
   todas las funciones devuelven cero y el sistema se comporta exactamente como
   si esto no existiera.

   TRES REGLAS QUE NO SE NEGOCIAN
   1. El precio de la carta manda. Con "precio incluye impuesto" (lo normal en
      Colombia), subir la tarifa NO cambia lo que paga el cliente: cambia cuánto
      de ese precio es impuesto.
   2. Se calcula POR LÍNEA y después se suma. Sobre el total, con varias tarifas
      mezcladas, el resultado queda mal y el redondeo se desvía.
   3. La tarifa se CONGELA al vender. Los informes leen lo guardado, no
      recalculan. Si mañana sube el impuesto, las ventas ya declaradas no pueden
      cambiar.

   Cascada de la tarifa:  producto → categoría → restaurante                  */
(function () {
  'use strict';

  var CFG = null;        // {activo, tipo, pct, incluido, nit, razon_social, resolucion}
  var PCT_CAT = {};      // categoría → tarifa (o undefined si hereda)
  var PCT_PROD = {};     // producto  → tarifa (o undefined si hereda)

  var NOMBRES = { inc: 'Impoconsumo', iva: 'IVA', otro: 'Impuesto' };

  function defaults() {
    return { activo: false, tipo: 'inc', pct: 8, incluido: true,
             nit: '', razon_social: '', resolucion: '' };
  }

  /* Config del restaurante. Sale de branches.operacion_config.impuestos. */
  function setConfig(imp) {
    CFG = Object.assign(defaults(), imp || {});
    return CFG;
  }
  function config() { return CFG || defaults(); }
  function activo() { return !!config().activo; }
  function nombre() { var c = config(); return NOMBRES[c.tipo] || NOMBRES.otro; }

  /* Excepciones por categoría y por producto (NULL = hereda). */
  function setTarifas(cats, prods) {
    PCT_CAT = {}; PCT_PROD = {};
    (cats || []).forEach(function (c) {
      if (c && c.id != null && c.impuesto_pct != null) PCT_CAT[c.id] = Number(c.impuesto_pct);
    });
    (prods || []).forEach(function (p) {
      if (!p || p.id == null) return;
      if (p.impuesto_pct != null) PCT_PROD[p.id] = Number(p.impuesto_pct);
      if (p.category_id != null) PCT_PROD['_cat_' + p.id] = p.category_id;
    });
  }

  /* Tarifa que le toca a un producto, siguiendo la cascada. */
  function tarifaDe(productId, categoryId) {
    if (!activo()) return 0;
    if (productId != null && PCT_PROD[productId] != null) return PCT_PROD[productId];
    var cat = categoryId != null ? categoryId : PCT_PROD['_cat_' + productId];
    if (cat != null && PCT_CAT[cat] != null) return PCT_CAT[cat];
    return Number(config().pct) || 0;
  }

  /* El corazón: de un valor cobrado a base + impuesto.
     · incluido = true  → el precio YA trae el impuesto adentro (Colombia).
     · incluido = false → el impuesto se suma encima. */
  function desglosar(valor, pct) {
    var v = Number(valor) || 0, p = Number(pct) || 0;
    if (!activo() || p <= 0) return { base: v, impuesto: 0, total: v, pct: 0 };
    if (config().incluido) {
      var base = v / (1 + p / 100);
      return { base: round(base), impuesto: round(v - base), total: v, pct: p };
    }
    var imp = v * p / 100;
    return { base: v, impuesto: round(imp), total: round(v + imp), pct: p };
  }
  // Al peso: en Colombia no se factura con centavos.
  function round(n) { return Math.round((Number(n) || 0)); }

  /* Impuesto de un pedido completo, línea por línea.
     items: [{product_id, category_id, total}]  (total = lo cobrado por la línea)
     Devuelve los totales y el desglose POR TARIFA, que es lo que pide el
     contador y lo que se congela en la venta. */
  function calcularPedido(items, extras) {
    var out = { activo: activo(), base: 0, impuesto: 0, total: 0, porTarifa: [], lineas: [] };
    var acum = {};
    (items || []).forEach(function (it) {
      var pct = tarifaDe(it.product_id, it.category_id);
      var d = desglosar(it.total, pct);
      out.lineas.push({ product_id: it.product_id, tax_pct: d.pct, tax_base: d.base, tax_amount: d.impuesto });
      out.base += d.base; out.impuesto += d.impuesto; out.total += d.total;
      if (d.pct > 0) {
        if (!acum[d.pct]) acum[d.pct] = { pct: d.pct, base: 0, monto: 0 };
        acum[d.pct].base += d.base; acum[d.pct].monto += d.impuesto;
      }
    });
    // Empaque y domicilio: si el restaurante los cobra, van a la tarifa general.
    // (Qué tratamiento llevan de verdad lo confirma el contador de cada quien.)
    (extras || []).forEach(function (x) {
      var pct = Number(x.pct != null ? x.pct : config().pct) || 0;
      var d = desglosar(x.valor, pct);
      out.base += d.base; out.impuesto += d.impuesto; out.total += d.total;
      if (d.pct > 0) {
        if (!acum[d.pct]) acum[d.pct] = { pct: d.pct, base: 0, monto: 0 };
        acum[d.pct].base += d.base; acum[d.pct].monto += d.impuesto;
      }
    });
    out.porTarifa = Object.keys(acum).map(function (k) { return acum[k]; })
      .sort(function (a, b) { return b.pct - a.pct; });
    out.base = round(out.base); out.impuesto = round(out.impuesto); out.total = round(out.total);
    return out;
  }

  /* Texto para el recibo. Si está apagado devuelve null y no se imprime nada. */
  function lineasRecibo(taxDetail, taxBase) {
    if (!activo()) return null;
    var det = taxDetail || [];
    if (!det.length) return null;
    var out = [{ label: 'Base gravable', valor: taxBase }];
    det.forEach(function (t) {
      out.push({ label: nombre() + ' ' + fmtPct(t.pct) + '%', valor: t.monto });
    });
    return out;
  }
  function fmtPct(p) { return String(Math.round((Number(p) || 0) * 100) / 100).replace('.', ','); }

  /* Leyenda legal para el que NO cobra impuesto. */
  function leyendaNoResponsable() {
    return activo() ? null : 'No responsable de impuesto al consumo.';
  }

  window.posImpuestos = {
    defaults: defaults, setConfig: setConfig, config: config, activo: activo,
    nombre: nombre, setTarifas: setTarifas, tarifaDe: tarifaDe,
    desglosar: desglosar, calcularPedido: calcularPedido,
    lineasRecibo: lineasRecibo, leyendaNoResponsable: leyendaNoResponsable,
    fmtPct: fmtPct,
  };
})();

;
/* ═══════ pos-print.js ═══════ */
;// pos-print.js — Sistema compartido de impresion (C5, C6, C8)
// Modal de impresion con 3 opciones + comanda auto al enviar a cocina
// RF4: un solo lugar, reutilizable desde tomar-pedido y pagos
(function() {
  'use strict';

  var MODELS_KEY = 'pos.config.recibos.v1';

  // Estado de pago para impresos: PAGADO / ABONADO+COBRAR / COBRAR.
  // Usa order.paid (pos_orders.paid_amount) — las transferencias verificadas por
  // el bot y los abonos de caja llegan aquí. Sin datos → no imprime nada.
  function _pagoEstadoHtml(order) {
    if (!order || order.paid === undefined || order.total === undefined) return '';
    var total = Number(order.total || 0), paid = Number(order.paid || 0);
    if (total <= 0) return '';
    var f = function(n){ return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
    // Sin repetir el TOTAL DEL PEDIDO: ya sale en la tabla de totales, dos
    // lineas mas arriba. Y sin asteriscos, que solo hacian ruido.
    var caja = 'text-align:center;font-weight:900;border:2px solid #000;border-radius:9px;padding:6px;margin:6px 0;';
    if (paid >= total) return '<div style="' + caja + 'font-size:15px">PAGADO<br><span style="font-size:11px;font-weight:700">No cobrar nada</span></div>';
    if (paid > 0)      return '<div style="' + caja + 'font-size:13px">Ya abonó ' + f(paid) + '<br>COBRAR: ' + f(total - paid) + '</div>';
    return '<div style="' + caja + 'font-size:14px">COBRAR: ' + f(total) + '</div>';
  }

  function _buildComanda(order, items) {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    var dateStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate())
      + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    var mesa = (order.table || '-').toUpperCase();
    var mesaMatch = mesa.match(/^T(\d+)$/);
    if (mesaMatch) mesa = String(parseInt(mesaMatch[1], 10));
    var pax    = order.guests  || 0;
    var waiter = (order.waiter || '').toUpperCase();
    var sala   = (order.sala   || '').toUpperCase();
    var channel = (order.channel || '').toUpperCase();
    var isParaLlevar = channel.indexOf('LLEVAR') >= 0;
    var isDomicilio  = channel === 'DOMICILIO';
    var isRapido     = channel === 'RAPIDO';
    var _notes = order.notes || '';
    /*  EL CONJUNTO MANDA SOBRE EL BARRIO (Sergio, 28-ago-2026).

        Un barrio agrupa cientos de casas; un conjunto es UN sitio con
        porteria. Cuando el pedido va a uno, el nombre del conjunto dice mucho
        mas — y en un barrio grande, cuatro comandas seguidas salian todas
        con el mismo titulo.

        Va igual que en la PANTALLA de cocina, a proposito: el papel y la
        pantalla tienen que decir lo mismo, o el que mira una y el que mira la
        otra estan hablando de comandas distintas.                         */
    var _conjMatch = _notes.match(/\[conjunto:([^\]]+)\]/i);
    var _barrioMatch = _notes.match(/\[barrio:([^\]]+)\]/i);
    var _barrio = (_conjMatch && _conjMatch[1].trim())
      || (_barrioMatch ? _barrioMatch[1] : '');
    // Etiqueta de venta rápida (Espera / Avisar / …) — se guarda en notes
    var _etqMatch = _notes.match(/\[etq:([^\]]+)\]/i);
    var _etq = _etqMatch ? _etqMatch[1] : '';

    var _customerName = (order.customer_name || '').toUpperCase();

    var rows = (items || []).map(function(it) {
      var qty  = it.qty || 1;
      var name = (it.name || 'Item').toUpperCase();
      var line = '(' + qty + ') ' + name;
      var modsHtml = (it.mods && it.mods.length)
        ? it.mods.map(function(m) {
            /* La adicion llega de DOS formas segun quien imprime: como texto
               (la comanda automatica) o como objeto {name, qty, price} (la
               reimpresion, que arma los items pensando en el recibo). Con
               String(m) a secas, el objeto salia "+ [OBJECT OBJECT]" en la
               cocina — paso el 20-ago con el Super Queso de Fernanda. */
            var txt = (m && typeof m === 'object')
              ? (((Number(m.qty) || 1) > 1 ? (Number(m.qty)) + 'x ' : '') + (m.name || ''))
              : String(m);
            return '<div style="font-style:italic;font-size:12px;font-weight:700;margin-left:10px;margin-top:1px;margin-bottom:3px;">+ ' + txt.toUpperCase() + '</div>';
          }).join('')
        : '';
      var noteText = it.notes || it.note || '';
      var note = noteText
        ? '<div style="font-style:italic;font-size:12px;font-weight:700;margin-left:10px;margin-top:1px;margin-bottom:5px;">NOTA - ' + noteText.toUpperCase() + '</div>'
        : '';
      return '<div style="font-size:15px;font-weight:700;margin:5px 0 2px;line-height:1.3;">' + line + '</div>' + modsHtml + note;
    }).join('');

    function sep(text) {
      return '<div style="position:relative;margin:8px 0 5px;">'
        + '<div style="border-top:1px dashed #000;"></div>'
        + '<div style="position:absolute;top:-9px;left:0;right:0;text-align:center;">'
        + '<span style="background:#fff;padding:0 5px;font-size:10px;font-weight:400;letter-spacing:0.5px;">' + text + '</span>'
        + '</div></div><div style="height:5px;"></div>';
    }

    var paraLlevar = isParaLlevar
      ? '<div style="text-align:center;font-size:13px;font-weight:900;margin:2px 0 5px;">==== PARA LLEVAR ====</div>'
      : '';

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;width:' + _anchoMM + 'mm;max-width:' + _anchoMM + 'mm;margin:0;padding:6px 8px;color:#000;line-height:1.35;}</style>'
      + '</head><body>'
      // VENTA RÁPIDA: título + etiqueta. El barrio NO se imprime (solo sirve al
      // repartidor) y el cliente baja al bloque de datos, alineado a la izquierda.
      + (isRapido
          ? '<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:2px;">VENTA RAPIDA</div>'
            + (_etq ? '<div style="font-size:14px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:2px;">' + _etq + '</div>' : '')
          : isDomicilio
            ? (_barrio
                ? '<div style="font-size:13px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:1px;">DOMICILIO</div>'
                  + '<div style="font-size:24px;font-weight:900;text-align:center;margin-bottom:2px;">' + _barrio + '</div>'
                  + (_customerName ? '<div style="font-size:14px;font-weight:700;text-align:center;margin-bottom:2px;">' + _customerName + '</div>' : '')
                : '<div style="font-size:20px;font-weight:900;text-align:center;margin-bottom:2px;">DOMICILIO</div>'
                  + (_customerName ? '<div style="font-size:14px;font-weight:700;text-align:center;margin-bottom:2px;">' + _customerName + '</div>' : ''))
            : '<div style="font-size:20px;font-weight:900;text-align:center;margin-bottom:2px;">MESA ' + mesa + '</div>')
      + (!isDomicilio && !isRapido && pax ? '<div style="font-size:13px;font-weight:700;padding-left:55%;">( ' + pax + ' PAX)</div>' : '')
      + '<div style="height:5px;"></div>'
      /*  El area de la hoja. Con un solo sitio de preparacion dice COCINA
          como siempre; con varios dice cual, que es lo que hace que dos
          hojas del mismo pedido no se confundan sobre el mesón. */
      + '<div>AREA - ' + String(order.area || 'COCINA').toUpperCase() + '</div>'
      + '<div>FECHA: ' + dateStr + '</div>'
      + (isRapido && _customerName ? '<div>CLIENTE - ' + _customerName + '</div>' : '')
      + (waiter ? '<div>' + (isDomicilio || isRapido ? 'CAJERO' : 'MESERO') + ' - ' + waiter + '</div>' : '')
      + (sala   ? '<div>SALA - '   + sala   + '</div>' : '')
      + sep('INICIO PEDIDO')
      + paraLlevar
      + rows
      + sep('FIN PEDIDO')
      + '</body></html>';
  }

  // Aqui vivian _buildReceiptDesc y _buildReceiptFinal, los recibos viejos de
  // mesa. Se borraron al unificar: a _buildReceiptDesc no lo llamaba nadie
  // desde hacia tiempo, y _buildReceiptFinal quedo reemplazado por el recibo
  // comun, que ademas lleva encabezado del negocio, adiciones, notas y puntos.
  // La propina y el desglose de pago que solo tenia mesa se conservaron alli.

  // ── RECIBO DEL CLIENTE (domicilio / venta rapida / mesa) ──
  function _money(n){ return '$' + Number(Math.round(n||0)).toLocaleString('es-CO'); }

  // `solo` = fue el unico pago: entonces la fila se llama "Efectivo", como en
  // cualquier recibo de caja. Si hubo varios metodos NO puede llamarse igual:
  // arriba ya hay una linea "Efectivo" con lo que se aplico a la cuenta, y dos
  // lineas "Efectivo" con numeros distintos se contradicen. Ahi va "Recibido".
  function _vueltoFilas(p, solo) {
    var met = String((p && p.method) || '').toLowerCase();
    if (met.indexOf('efect') < 0) return '';
    var recibido = Number(p.received || 0), cambio = Number(p.vuelto || 0);
    if (!(cambio > 0) || !(recibido > 0)) return '';
    // Con varios metodos solo va el cambio: arriba ya esta lo que se abono en
    // efectivo, y sumandole el cambio se sabe con cuanto pago. Una fila mas
    // seria decir lo mismo con otro numero.
    var sangria = solo ? '' : 'padding-left:14px;';
    var fila1 = solo
      ? '<tr><td style="font-size:12px;color:#333">Efectivo</td><td class="pcol" style="font-size:12px">'+_money(recibido)+'</td></tr>'
      : '';
    return fila1
         + '<tr><td style="font-size:12.5px;'+sangria+'font-weight:800">Cambio</td><td class="pcol" style="font-size:12.5px;font-weight:800">'+_money(cambio)+'</td></tr>';
  }

  function _buildReceiptDomicilio(order, items, branch, payments) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    var dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    branch = branch || {};
    var negocio = (branch.brand_name || branch.name || 'Recibo').toUpperCase();
    var dirLocal = branch.address || '';
    var telLocal = branch.phone || '';
    // Datos del cliente desde notes: dirección + [barrio:X] + [tel:Y] (· Ref:… se ignora)
    var notes = String(order.notes || '');
    var mB = notes.match(/\[barrio:([^\]]+)\]/i); var barrio = mB ? mB[1] : '';
    /*  El conjunto y la casa SON la direccion cuando no hay calle. Antes se
        quitaban solo `[barrio:]`, `[tel:]` y `[etq:]`, asi que en un pedido a
        un conjunto la direccion del recibo salia con los corchetes crudos
        — «[conjunto:Llanos De Calibio][unidad:32]»— o vacia. Ahora se leen y
        se escriben como lo que son.                                       */
    var mCj = notes.match(/\[conjunto:([^\]]+)\]/i); var conjunto = mCj ? mCj[1].trim() : '';
    var mUn = notes.match(/\[unidad:([^\]]+)\]/i);   var unidad   = mUn ? mUn[1].trim() : '';
    var mT = notes.match(/\[tel:([^\]]+)\]/i);    var telCli = mT ? mT[1] : (order.customer_phone || '');
    var dirCli = notes.replace(/\[conjunto:[^\]]+\]/ig,'').replace(/\[unidad:[^\]]+\]/ig,'').replace(/\[barrio:[^\]]+\]/ig,'').replace(/\[tel:[^\]]+\]/ig,'').replace(/\[etq:[^\]]+\]/ig,'').replace(/·\s*Ref:\S+/ig,'').trim();
    //  El conjunto va DELANTE de la calle: es lo que ubica, y la calle (si la
    //  hay) es la referencia de como llegar.
    dirCli = [conjunto, unidad, dirCli].filter(Boolean).join(' · ');
    var esLlevar = String(order.channel||'').toLowerCase().indexOf('rapid')>=0 || /para\s+llevar|recog/i.test(dirCli);
    /* OJO con el guion: cuando el pedido no tiene mesa, `_tableDisplay`
       devuelve "-", que NO esta vacio. Con `!!order.table` todos los
       domicilios se tomaban por pedidos de mesa: salian titulados "RECIBO DE
       MESA", con "Mesa: -", y sin direccion ni barrio, porque la rama de mesa
       no los imprime. El domiciliario salia con un recibo sin direccion. */
    var mesaTxt = String(order.table == null ? '' : order.table).trim();
    if (mesaTxt === '-' || mesaTxt === '—') mesaTxt = '';
    var esMesa = String(order.channel||'').toLowerCase() === 'mesa' || (!!mesaTxt && !esLlevar);
    var num = '#' + String(order.id||'').slice(-5).toUpperCase();

    var itemRows = (items||[]).map(function(it){
      var qty = it.qty || 1;
      var line = _money(it.total || 0);
      // Las adiciones con su cantidad y su precio. Antes salia solo "+ Papas",
      // sin decir cuanto costo, y el cliente no entendia de donde salia el
      // total. El precio va ENTRE PARENTESIS porque ya esta dentro del valor
      // de la linea: con un "+ $8.000" pareceria que hay que sumarlo aparte.
      var mods = (it.mods && it.mods.length)
        ? it.mods.map(function(m){
            var nom = (m && m.name) ? m.name : String(m);
            var cuantos = ((m && m.qty) || 1) * qty;
            var vale = (m && m.price) ? m.price * cuantos : 0;
            return '<div style="font-size:11px;color:#333;padding-left:14px">+ '
                 + (cuantos > 1 ? cuantos + 'x ' : '') + nom
                 + (vale > 0 ? ' (' + _money(vale) + ')' : '')
                 + '</div>';
          }).join('')
        : '';
      // La nota del producto ("SIN AJO", "poca salsa"), en negrilla: es lo que
      // mas reclama el cliente si sale mal. Nunca se imprimia porque el recibo
      // pedia it.note y en la base la columna se llama notes.
      var nota = it.notes ? '<div style="font-size:11px;font-weight:700;padding-left:14px">Nota: '+it.notes+'</div>' : '';
      return '<tr><td style="padding:3px 0;vertical-align:top">'+qty+'x '+(it.name||'Item')+mods+nota+'</td>'
           + '<td class="pcol" style="padding:3px 0">'+line+'</td></tr>';
    }).join('');

    var subtotal = Number(order.subtotal || 0) || (items||[]).reduce(function(a,it){return a+(it.total||0);},0);
    var empaque  = Number(order.packaging_fee || 0);
    var domi     = Number(order.delivery_fee || 0);
    var descuento= Number(order.discount || 0);
    var total    = Number(order.total || 0) || (subtotal+empaque+domi-descuento+Number(order.tip||0));
    var footer = '';
    try { footer = localStorage.getItem('pos.config.recibo.footer') || ''; } catch(e){}
    if (!footer) footer = '¡Gracias por tu pedido!';   // sin emoji: lo pone cada restaurante en su pie

    var sep = '<div style="border-top:1px dashed #000;margin:7px 0"></div>';
    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:12.5px;width:' + _anchoMM + 'mm;max-width:' + _anchoMM + 'mm;margin:0;padding:8px 6px;color:#000;line-height:1.35}table{width:100%;border-collapse:collapse}td{word-break:break-word}.pcol{width:26%;white-space:nowrap;text-align:right;vertical-align:top}</style></head><body>';
    // Encabezado del negocio
    h += '<div style="text-align:center;margin-bottom:2px"><div style="font-size:17px;font-weight:900;letter-spacing:.5px">'+negocio+'</div>';
    if (dirLocal) h += '<div style="font-size:10.5px;color:#333">'+dirLocal+'</div>';
    if (telLocal) h += '<div style="font-size:10.5px;color:#333">Tel: '+telLocal+'</div>';
    h += '</div>'+sep;
    // Título + pedido
    var titulo = esMesa ? 'RECIBO DE MESA' : (esLlevar ? 'RECIBO · PARA LLEVAR' : 'RECIBO DE DOMICILIO');
    h += '<div style="text-align:center"><div style="font-size:13px;font-weight:800">'+titulo+'</div>'
       + '<div style="font-size:11px;color:#333">Pedido '+num+' · '+dateStr+' '+timeStr+'</div></div>'+sep;
    if (esMesa) {
      // En mesa lo primero es DONDE, que es lo que busca el mesero al repartir
      // las cuentas. El cliente va despues y solo si lo seleccionaron.
      h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase">Mesa</div>';
      h += '<div style="font-size:13px;font-weight:700">'+(mesaTxt||'—')+'</div>';
      var linea2 = [];
      if (order.sala)   linea2.push(order.sala);
      if (order.guests) linea2.push(order.guests + (order.guests === 1 ? ' persona' : ' personas'));
      if (order.waiter) linea2.push('Atendió ' + order.waiter);
      if (linea2.length) h += '<div style="font-size:12px">'+linea2.join(' · ')+'</div>';
      if (order.customer_name) {
        h += '<div style="font-size:12px;margin-top:3px">Cliente: <b>'+order.customer_name+'</b></div>';
        if (telCli) h += '<div style="font-size:12px">Tel: '+telCli+'</div>';
        if (order.customer_phone2) h += '<div style="font-size:12px">Otro: '+order.customer_phone2+'</div>';
      }
    } else {
      // Cliente
      h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase">Cliente</div>';
      h += '<div style="font-size:13px;font-weight:700">'+(order.customer_name||'—')+'</div>';
      if (telCli) h += '<div style="font-size:12px">Tel: '+telCli+'</div>';
      // Segundo numero del cliente, solo si lo tiene guardado.
      if (order.customer_phone2) h += '<div style="font-size:12px">Otro: '+order.customer_phone2+'</div>';
      if (!esLlevar) {
        if (barrio) h += '<div style="font-size:12.5px;font-weight:700;margin-top:2px">'+barrio+'</div>';
        if (dirCli) h += '<div style="font-size:12px">'+dirCli+'</div>';
      } else {
        h += '<div style="font-size:12px;font-weight:700;margin-top:2px">Recoge en el local</div>';
      }
    }
    h += sep;
    // Items
    h += '<table><tbody>'+itemRows+'</tbody></table>'+sep;
    // Totales
    h += '<table>';
    h += '<tr><td style="font-size:12px;color:#333">Subtotal</td><td class="pcol" style="font-size:12px">'+_money(subtotal)+'</td></tr>';
    // Desglose del impuesto. Solo sale si el restaurante lo cobra; si no, ni
    // se imprime (un restaurante no responsable no debe mostrar nada).
    if (window.posImpuestos && posImpuestos.activo()) {
      var _lin = posImpuestos.lineasRecibo(order.tax_detail, order.tax_base);
      (_lin || []).forEach(function (l) {
        h += '<tr><td style="font-size:12px;color:#333">'+l.label+'</td><td class="pcol" style="font-size:12px">'+_money(l.valor)+'</td></tr>';
      });
    }
    if (empaque>0)  h += '<tr><td style="font-size:12px;color:#333">Empaque</td><td class="pcol" style="font-size:12px">'+_money(empaque)+'</td></tr>';
    if (!esLlevar && domi>0) h += '<tr><td style="font-size:12px;color:#333">Domicilio</td><td class="pcol" style="font-size:12px">'+_money(domi)+'</td></tr>';
    if (descuento>0) h += '<tr><td style="font-size:12px;color:#333">Descuento</td><td class="pcol" style="font-size:12px">-'+_money(descuento)+'</td></tr>';
    // La propina venia solo en el recibo viejo de mesa; ahora la lleva
    // cualquiera que la tenga.
    var propina = Number(order.tip || 0);
    if (propina>0) h += '<tr><td style="font-size:12px;color:#333">Propina</td><td class="pcol" style="font-size:12px">'+_money(propina)+'</td></tr>';
    h += '<tr><td colspan="2" style="border-top:1px solid #000;padding-top:3px"></td></tr>';
    h += '<tr><td style="font-size:15px;font-weight:900">TOTAL</td><td class="pcol" style="font-size:15px;font-weight:900">'+_money(total)+'</td></tr>';
    h += '</table>';
    // Estado de pago (grande, para el domiciliario)
    // Si pago con varios metodos se desglosa; si fue uno solo basta la linea.
    // El desglose solo lo tenia el recibo de mesa y le sirve a todos.
    /* El metodo puede venir como ID (pm_...). En un RECIBO no puede salir eso:
       se traduce con la configuracion si esta cargada; si no, un id se
       disfraza de 'Pago' — mejor generico que basura tecnica. */
    function _metVisible(v) {
      v = String(v || '');
      try {
        if (window.posMetodos && posMetodos.lista().length) {
          var m = posMetodos.resolver(v);
          if (m) return m.nombre;
        }
      } catch (e) {}
      if (/^pm_[a-z0-9]+$/i.test(v) || /^__/.test(v)) return 'Pago';
      return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    }
    var pgs = (payments || []).filter(function(p){ return Number(p.amount) > 0; });
    var pm = order.payment_method ? String(order.payment_method) : '';
    if (pgs.length > 1) {
      h += '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;margin-top:6px">Forma de pago</div>';
      h += '<table>';
      pgs.forEach(function(p){
        var met = _metVisible(p.method) || 'Pago';
        h += '<tr><td style="font-size:12px">'+met+'</td><td class="pcol" style="font-size:12px">'+_money(p.amount)+'</td></tr>';
        h += _vueltoFilas(p, false);
      });
      h += '</table>';
    } else if (pgs.length === 1) {
      var m1 = String(pgs[0].method || '');
      var fv = _vueltoFilas(pgs[0], true);
      // Con cambio, la fila ya dice "Efectivo": repetir "Pago: Efectivo" arriba
      // seria decir lo mismo dos veces.
      if (fv) h += '<table>'+fv+'</table>';
      else h += '<div style="text-align:center;font-size:11.5px;margin-top:6px">Pago: '+_metVisible(m1)+'</div>';
    } else if (pm && pm!=='multiple') {
      h += '<div style="text-align:center;font-size:11.5px;margin-top:6px">Pago: '+_metVisible(pm)+'</div>';
    }
    h += _pagoEstadoHtml(order);
    var mRef = notes.match(/Ref:(\S+)/i); if (mRef) h += '<div style="text-align:center;font-size:10.5px;color:#555">Ref: '+mRef[1]+'</div>';
    // Puntos del cliente. Solo si es un cliente guardado; en una venta al paso
    // el recibo queda igual que siempre, sin un "0 puntos" que no dice nada.
    /* La base sigue sumando los puntos (el trigger no sabe de planes), pero un
       restaurante que no tiene el programa no puede entregar un recibo que le
       promete puntos al cliente. */
    if (order.puntos_total != null && (!window.posPlan || posPlan.puede('puntos'))) {
      h += sep;
      h += '<div style="text-align:center;font-size:10px;font-weight:700;color:#555;text-transform:uppercase">Tus puntos</div>';
      h += '<table>';
      // Lo que gano con ESTA compra solo se imprime si ya esta acreditado. Si
      // el recibo sale antes de cobrar, todavia no existe y no se inventa.
      if (order.puntos_ganados > 0) {
        // Antes de cobrar se habla en futuro: todavia no estan acreditados.
        h += '<tr><td style="font-size:12px">'+(order.puntos_estimados ? 'Ganar&aacute;s con esta compra' : 'Ganaste con esta compra')+'</td><td class="pcol" style="font-size:12px">+'+Number(order.puntos_ganados).toLocaleString('es-CO')+'</td></tr>';
      }
      h += '<tr><td style="font-size:13px;font-weight:800">'+(order.puntos_estimados ? 'Tu total quedar&aacute; en' : 'Tu total acumulado')+'</td><td class="pcol" style="font-size:13px;font-weight:800">'+Number(order.puntos_total).toLocaleString('es-CO')+'</td></tr>';
      h += '</table>';
    }
    // Pie
    h += sep+'<div style="text-align:center;font-size:11px;color:#333;margin-top:2px">'+footer+'</div>';
    h += '</body></html>';
    return h;
  }

  // Trae de la ficha del cliente lo que el pedido no guarda: su segundo
  // numero y sus puntos. El telefono PRINCIPAL manda: los puntos viven ahi,
  // aunque el pedido haya entrado por el otro numero.
  async function _datosClienteRecibo(order, orderData) {
    var sb = window._pos && window._pos.sb;
    if (!sb) return;
    var tenant = order.tenant_id || (window._pos.state && window._pos.state.tenantId);
    var mT = String(order.notes || '').match(/\[tel:([^\]]+)\]/i);
    var tel10 = String((mT && mT[1]) || order.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);

    var cli = null;
    if (order.cliente_id) {
      var r0 = await sb.from('pos_clientes').select('telefono,telefono2').eq('id', order.cliente_id).maybeSingle();
      cli = (r0 && r0.data) || null;
    }
    if (!cli && tel10.length >= 7 && tenant) {
      var r1 = await sb.from('pos_clientes').select('telefono,telefono2').eq('tenant_id', tenant).ilike('telefono', '%' + tel10).limit(1);
      cli = (r1 && r1.data && r1.data[0]) || null;
      if (!cli) {
        var r2 = await sb.from('pos_clientes').select('telefono,telefono2').eq('tenant_id', tenant).ilike('telefono2', '%' + tel10).limit(1);
        cli = (r2 && r2.data && r2.data[0]) || null;
      }
    }
    if (!cli) return;   // venta al paso: el recibo queda como siempre

    if (cli.telefono2) orderData.customer_phone2 = cli.telefono2;

    var principal = String(cli.telefono || '').replace(/[^0-9]/g, '').slice(-10);
    if (!principal) return;
    var rp = await sb.from('pos_puntos').select('puntos').ilike('telefono', '%' + principal).maybeSingle();
    // Sin fila de puntos todavia (primera compra) el saldo es 0, no "no hay
    // puntos": igual hay que decirle cuantos va a ganar.
    orderData.puntos_total = Number(rp && rp.data && rp.data.puntos) || 0;

    // Lo ganado con ESTE pedido, tal como quedo registrado. Si todavia no se
    // acredito (recibo impreso antes de cobrar), no se imprime esa linea.
    var rm = await sb.from('pos_puntos_movimientos').select('puntos,tipo,revertido').eq('order_id', order.id);
    var gano = ((rm && rm.data) || []).reduce(function(a, m) {
      return a + ((m.tipo === 'acumulacion' && !m.revertido) ? (Number(m.puntos) || 0) : 0);
    }, 0);
    if (gano > 0) {
      orderData.puntos_ganados = gano;
      return;
    }

    /* Todavia no se acreditaron porque los puntos entran al COBRAR, y la
       mayoria de recibos se imprimen antes. Se calculan con la MISMA regla que
       usa la respuesta rapida del chat (/puntos): productos + empaque, SIN el
       domicilio, un punto por cada mil. Se marcan como estimados para que el
       recibo hable en futuro y no prometa un saldo que aun no existe. */
    var basePuntos = (Number(order.subtotal) || 0) + (Number(order.packaging_fee) || 0);
    var estimado = window.posPuntosDe ? posPuntosDe(basePuntos) : Math.floor(basePuntos / PUNTOS_POR_MIL);
    if (estimado > 0) {
      orderData.puntos_ganados   = estimado;
      orderData.puntos_estimados = true;
      orderData.puntos_total     = orderData.puntos_total + estimado;
    }
  }

  /* YA ES CONFIGURABLE (21-ago-2026): la regla sale de `posPuntosRegla()`
     —branches.operacion_config— y este numero solo queda de respaldo por si
     pos-core todavia no cargo. El aviso que estaba aqui («el dia que se haga
     configurable, los dos sitios tienen que leer de la configuracion») ya
     se cumplio: el chat y el recibo leen del mismo ayudante. */
  var PUNTOS_POR_MIL = 1000;   // respaldo si pos-core aun no cargo

/*  DE DONDE SALEN LA CONEXION Y LA SEDE.

    Este modulo daba por hecho `window._pos`, que lo crea `pos-core.js`. Pero
    el Chat NO carga pos-core: tiene su propia conexion. Resultado: al imprimir
    desde el chat, `window._pos.state` reventaba, el try/catch se lo tragaba y
    la respuesta era "sin impresora configurada" — con la impresora conectada y
    andando.

    Un modulo compartido no puede exigir que otro modulo haya cargado antes. Se
    busca por varios lados y se usa el primero que aparezca.               */
/*  ══ EL ANCHO DE LO QUE SE IMPRIME ═══════════════════════════════════════

    Tres sitios de este archivo escribían su propio ancho, y no coincidían: la
    comanda a 80 mm, el recibo a 72, el marco que los lleva a la impresora a
    80. El ancho del ROLLO es 80, pero la cabeza imprime unos 10 menos — ese
    margen es del papel y lo que se sale no se recorta limpio: empuja el resto
    y se lleva el borde derecho.

    O sea que la comanda lleva meses saliendo cortada por la derecha, solo que
    no se notaba porque su contenido es texto suelto y sobra sitio. La nota
    lleva marco, y ahí sí se vio — Sergio la tuvo que mandar con las esquinas
    comidas porque el domicilio no daba espera.

    Ahora hay UN ancho, sale de `pos_print_config.paper_width` (lo que el
    restaurante escogió en Impresoras) y lo usan los tres. Un negocio con rollo
    de 58 recibe 48 sin que nadie toque nada.

    Los 10 mm de margen los midió Sergio en su impresora: "en 80 mm siempre se
    corta". Dos milímetros de más no le quitan nada a un recibo; una esquina
    cortada arruina una nota entera.                                        */
  var MARGEN_MM = 10;
  var _anchoMM = 70;          // hasta que la impresora diga lo suyo

  function _anchoUtil(rollo) {
    var w = parseInt(rollo, 10);
    if (!w || w < 40 || w > 120) return 70;
    return Math.max(38, w - MARGEN_MM);
  }

  window.posAnchoPapel = function () { return _anchoMM; };

  function _sbRef() {
    return (window._pos && window._pos.sb) || window.sb || null;
  }

  function _branchRef() {
    try {
      if (window._pos && window._pos.state && window._pos.state.branchId) return window._pos.state.branchId;
      if (window.S && window.S.branchId) return window.S.branchId;
      return localStorage.getItem('pos.branchId') || '';
    } catch (e) { return ''; }
  }

  var _printerCache = null;
  var _printerCacheTs = 0;

  async function _getTargetPrinter(docType, areaPedida) {
    try {
      var sb = _sbRef();
      var branchId = _branchRef();
      if (!sb || !branchId) return '';
      var now = Date.now();
      if (!_printerCache || now - _printerCacheTs > 30000) {
        var cfg = await sb.from('pos_print_config').select('same_printer_for_all, default_system_printer, paper_width').eq('branch_id', branchId).maybeSingle();
        /*  Se aprovecha la misma consulta: el ancho viaja al lado de la
            impresora y no cuesta una llamada aparte. */
        if (cfg && cfg.data && cfg.data.paper_width) _anchoMM = _anchoUtil(cfg.data.paper_width);
        var prs = await sb.from('pos_printers').select('system_name, area, is_default').eq('branch_id', branchId);
        _printerCache = { cfg: (cfg && cfg.data) || {}, printers: (prs && prs.data) || [] };
        _printerCacheTs = now;
      }
      if (_printerCache.cfg.same_printer_for_all) return _printerCache.cfg.default_system_printer || '';
      /*  El area puede venir dicha (una comanda de barra) o deducirse del tipo
          de documento, como siempre. */
      var area = areaPedida || ((docType === 'comanda') ? 'cocina' : 'caja');
      var match = _printerCache.printers.find(function(p) { return p.area === area && p.is_default; });
      if (!match) match = _printerCache.printers.find(function(p) { return p.area === area; });
      /*  SI NO HAY UNA PARA ESA AREA, SE USA LA QUE HAYA (28-ago-2026).

          El Parche tiene UNA sola impresora, registrada como de cocina. Todo lo
          que fuera "recibo" buscaba una de caja, no encontraba ninguna, y salia
          con el nombre VACIO — y con el nombre vacio no falla: imprime en la
          impresora que Windows tenga por defecto, que puede ser una que ni
          existe. Desde afuera eso es "no imprimio nada", sin un solo error.

          Un restaurante con una impresora quiere que todo salga por ella. No
          hay que hacerle configurar dos areas para algo que solo tiene una
          respuesta posible.                                                */
      if (!match) {
        match = _printerCache.printers.find(function(p) { return p.is_default; })
             || _printerCache.printers[0];
        if (match) console.warn('[print] sin impresora de ' + area + ', se usa ' + match.system_name);
      }
      return (match && match.system_name) ? match.system_name : '';
    } catch(e) { return ''; }
  }

  async function _printHtml(html, docType, area) {
    if (window.electronPOS && window.electronPOS.printHtmlSilent) {
      try {
        var printerName = await _getTargetPrinter(docType || 'comanda', area);
        var result = await window.electronPOS.printHtmlSilent(html, printerName);
        if (result && result.ok) return;
        console.warn('[posprint] silent print falló, fallback web:', result && result.error);
      } catch(e) { console.warn('[posprint] silent print excepción:', e); }
    }
    // Fallback: impresión web normal (abre diálogo)
    var existing = document.getElementById('pos-print-frame');
    if (existing) existing.remove();
    var iframe = document.createElement('iframe');
    iframe.id = 'pos-print-frame';
    /*  El marco donde se arma la pagina antes de mandarla: si mide mas que el
        papel, el navegador maqueta con un ancho que la impresora no tiene. */
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:' + _anchoMM + 'mm;height:600px;border:none;visibility:hidden';
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    iframe.onload = function() {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch(e) { var win = window.open('', '_blank', 'width=400,height=600'); if (win) { win.document.write(html); win.document.close(); win.print(); } }
    };
  }

  // Imprimir un ticket ya armado (cierre de caja / paloteo). Usa la impresora
  // configurada; docType 'recibo' → impresora de caja.
  /* ¿Cuántas copias imprimir de este documento?
     El recibo del domicilio suele necesitar dos: una para el cliente y otra
     que el domiciliario devuelve firmada. Se configura en Operación
     (`domiCopias`); si no hay config, una sola. */
  function _copias(docType) {
    try {
      var cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      if (docType === 'domiciliario' || docType === 'recibo-domi') {
        return Math.max(1, Math.min(3, parseInt(cfg.domiCopias, 10) || 1));
      }
    } catch (e) {}
    return 1;
  }

  window.posPrintTicket = async function (html, docType) {
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return false; }
    var n = _copias(docType);
    try {
      for (var i = 0; i < n; i++) {
        await _printHtml(html, docType || 'recibo');
        // Un respiro entre copias: algunas térmicas se atropellan si les llegan
        // dos trabajos pegados y sacan una sola.
        if (i < n - 1) await new Promise(function (r) { setTimeout(r, 400); });
      }
      return true;
    }
    catch (e) { _diagToast('❌ Error al imprimir: ' + (e && e.message || e), '#dc2626'); return false; }
  };

  function _noprinterToast() {
    var ex = document.getElementById('pos-noprinter-toast');
    if (ex) { clearTimeout(ex._t); ex.remove(); }
    var el = document.createElement('div');
    el.id = 'pos-noprinter-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#334155;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 16px rgba(15,23,42,.22);white-space:nowrap';
    el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Sin impresora configurada';
    document.body.appendChild(el);
    el._t = setTimeout(function() { if (el.parentNode) el.remove(); }, 3500);
  }

  async function _hasPrinter() {
    try {
      var sb = _sbRef();
      if (!sb) return false;
      var branchId = _branchRef();
      if (!branchId) return false;
      var r = await sb.from('pos_print_config').select('id').eq('branch_id', branchId).maybeSingle();
      return !!(r && r.data && r.data.id);
    } catch(e) { return false; }
  }

  /*  ══ DONDE SE PREPARA CADA COSA ═════════════════════════════

      Sergio, 28-ago-2026, pensando en vender el sistema: «va a haber otro
      restaurante que tenga areas y tengan varias impresoras por area».

      Las areas YA existian: se configuran en Operacion y la PANTALLA de cocina
      ya filtra por ellas. Lo que no existia es que el PAPEL las respetara —
      la comanda entera salia siempre por la impresora de «cocina», aunque las
      bebidas fueran de barra.

      La regla de a que area va un producto es EXACTAMENTE la de la pantalla
      de cocina (`areaDeItem` en cocina.js): lo suyo manda sobre lo de su
      categoria, y si no dice nada, la primera area. Tiene que ser la misma o
      el papel y la pantalla mandarian el mismo plato a sitios distintos.  */
  var _areasCache = null, _areasCacheTs = 0;
  async function _cargarAreas() {
    var ahora = Date.now();
    if (_areasCache && ahora - _areasCacheTs < 30000) return _areasCache;
    var vacio = { areas: [], areaCat: {}, areaProd: {}, catDe: {} };
    try {
      var sb = _sbRef(); var branchId = _branchRef();
      if (!sb || !branchId) return vacio;
      var b = await sb.from('branches').select('operacion_config').eq('id', branchId).maybeSingle();
      var op = (b && b.data && b.data.operacion_config) || {};
      var areas = Array.isArray(op.areas) ? op.areas.filter(function (a) { return a && a.id; }) : [];
      var out = { areas: areas, areaCat: op.areaCatCfg || {}, areaProd: op.areaProdCfg || {}, catDe: {} };
      /*  La categoria de cada producto solo hace falta si hay DOS areas o mas.
          Con una sola, preguntarla seria una consulta para nada. */
      if (areas.length >= 2) {
        var pr = await sb.from('pos_products').select('id, category_id').eq('branch_id', branchId);
        ((pr && pr.data) || []).forEach(function (p) { out.catDe[p.id] = p.category_id; });
      }
      _areasCache = out; _areasCacheTs = ahora;
      return out;
    } catch (e) { return vacio; }
  }

  function _areaDeItem(it, mapa) {
    var pid = it.product_id;
    if (pid && mapa.areaProd[pid]) return mapa.areaProd[pid];
    var cid = pid ? mapa.catDe[pid] : null;
    if (cid && mapa.areaCat[cid]) return mapa.areaCat[cid];
    return mapa.areas.length ? mapa.areas[0].id : 'cocina';
  }

  /*  ══ ¿SALE LA COMANDA SOLA? ═════════════════════════════════

      Sergio, 28-ago-2026: va a poner pantallas en la cocina y entonces la
      comanda en papel deja de hacer falta — los recibos si.

      El interruptor YA EXISTIA en Impresoras («Imprimir automaticamente al
      enviar a cocina») y ya se guardaba en `pos_print_config.auto_print`.
      Lo que faltaba es que alguien lo obedeciera: se apagaba y la comanda
      salia igual. Un interruptor que no hace nada es peor que no tener
      interruptor, porque quien lo apaga cree que ya esta resuelto.

      Se comprueba AQUI y no en el receptor de impresion porque por aqui pasan
      TODOS los caminos automaticos: el aviso en vivo, el barrido de seguridad
      cada 45 segundos y los items que se agregan a una mesa. Ponerlo en uno
      solo dejaria los otros dos imprimiendo.

      ⚠️ Lo que se pide A MANO sale SIEMPRE (`force`): el boton Imprimir y
      Reimprimir comanda. Apagar el automatico es dejar de imprimir SOLO,
      no quedarse sin poder imprimir.                                       */
  async function _autoprintOn(areaId) {
    try {
      var sb = _sbRef(); if (!sb) return true;
      var branchId = _branchRef(); if (!branchId) return true;
      var r = await sb.from('pos_print_config').select('auto_print, auto_print_areas').eq('branch_id', branchId).maybeSingle();
      var d = (r && r.data) || {};
      /*  El interruptor de CADA AREA manda sobre el general. Un restaurante
          con pantalla en cocina y sin pantalla en barra apaga cocina y deja
          barra encendida — que es justo el caso que Sergio va a vender.

          Si un area no dice nada, vale lo general. Asi el interruptor de
          siempre sigue significando lo mismo para quien tiene una sola area,
          que son casi todos.                                              */
      var porArea = d.auto_print_areas || {};
      if (areaId && Object.prototype.hasOwnProperty.call(porArea, areaId)) return !!porArea[areaId];
      //  Sin dato, ENCENDIDO: es como se comporto siempre, y un restaurante
      //  sin pantallas en cocina que deje de recibir comandas se queda ciego.
      if (d.auto_print == null) return true;
      return !!d.auto_print;
    } catch (e) { return true; }
  }

  async function _fetchOrder(orderId) {
    try {
      var sb = window._pos && window._pos.sb;
      if (!sb || !orderId) return null;
      // pos_orders → pos_order_items tiene FK real; pos_tables NO tiene FK desde pos_orders
      // por eso hacemos dos queries separadas en vez de un join inválido
      var r = await sb.from('pos_orders').select('*, pos_order_items(*)').eq('id', orderId).maybeSingle();
      if (!r || !r.data) {
        if (r && r.error) { _diagToast('❌ fetchOrder: ' + (r.error.message || r.error.code), '#7c2d12'); }
        return null;
      }
      var order = r.data;
      // Obtener nombre de mesa por separado (sin FK no se puede hacer join inline)
      if (order.table_id) {
        var rt = await sb.from('pos_tables').select('name, number').eq('id', order.table_id).maybeSingle();
        order.pos_tables = (rt && rt.data) ? rt.data : null;
      }
      return order;
    } catch(e) { _diagToast('❌ fetchOrder excepción: ' + (e && e.message || e), '#7c2d12'); return null; }
  }

  function _tableDisplay(order) {
    var t = order.pos_tables;
    if (t) return t.name || String(t.number || '') || order.table_id || '-';
    return order.table_name || order.table_id || '-';
  }

  function _diagToast(msg, color) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:' + (color||'#1d4ed8') + ';color:#fff;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:700;z-index:99999;white-space:nowrap;pointer-events:none';
    el.textContent = msg;
    document.body && document.body.appendChild(el);
    setTimeout(function() { el.parentNode && el.parentNode.removeChild(el); }, 5000);
  }

  // Candado anti-duplicado: un mismo pedido solo se auto-imprime UNA vez por
  // dispositivo. En la caja (ventas.html) hay dos listeners de realtime que
  // disparan con el INSERT y con el UPDATE a in_progress del mismo pedido; sin
  // este candado la comanda salía dos veces por los pedidos hechos en la tablet.
  function _sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  // Memoria PERSISTENTE de comandas ya impresas en este equipo (sobrevive
  // navegación entre pantallas — el candado en memoria no). Evita que el
  // receptor global re-imprima algo ya impreso tras cambiar de página.
  var _LS_PRINTED = 'pos.printed.v1';
  function _lsPrintedMap() {
    try { return JSON.parse(localStorage.getItem(_LS_PRINTED) || '{}') || {}; } catch(e) { return {}; }
  }
  function _lsWasPrinted(orderId) { return !!_lsPrintedMap()[orderId]; }
  function _lsMarkPrinted(orderId) {
    try {
      var m = _lsPrintedMap(), now = Date.now();
      for (var k in m) { if (now - m[k] > 21600000) delete m[k]; } // podar > 6 h
      m[orderId] = now;
      localStorage.setItem(_LS_PRINTED, JSON.stringify(m));
    } catch(e) {}
  }
  function _lsUnmarkPrinted(orderId) {
    try { var m = _lsPrintedMap(); delete m[orderId]; localStorage.setItem(_LS_PRINTED, JSON.stringify(m)); } catch(e) {}
  }

  var _autoPrinted = {};
  var _printing = {};   // candado de concurrencia por pedido
  var _lastPrintSig = {};   // {orderId:{sig,ts}} anti-duplicado por firma
  window.posAutoprint = async function(orderId, opts) {
    if (!orderId) return;
    var force = !!(opts && opts.force);   // reimpresión pedida explícitamente

    // Candado de CONCURRENCIA (no permanente): evita dos corridas simultáneas
    // para el mismo pedido en este equipo. Antes bloqueaba "para siempre", lo
    // que impedía imprimir los ítems NUEVOS al agregar a una mesa ocupada.
    if (_printing[orderId]) return;
    _printing[orderId] = true;
    try {
      _diagToast('🖨 Verificando impresora…', '#1d4ed8');

      // 1) Impresora (reintento por lectura transitoria de config en tablet)
      var hasPrinter = false;
      for (var hp = 0; hp < 3 && !hasPrinter; hp++) {
        hasPrinter = await _hasPrinter();
        if (!hasPrinter && hp < 2) await _sleep(500);
      }
      if (!hasPrinter) { _noprinterToast(); _diagToast('❌ Sin config de impresora en BD', '#dc2626'); return; }
      _diagToast('✓ Impresora OK — buscando pedido…', '#15803d');

      // 2) Pedido + ítems (reintento por lag escritura→lectura)
      var order = null, raw = [];
      for (var att = 0; att < 9; att++) {
        order = await _fetchOrder(orderId);
        if (order) { raw = order.pos_order_items || []; if (raw.length) break; }
        await _sleep(450);
      }
      if (!order || !raw.length) { _diagToast('❌ Pedido sin ítems tras reintentos', '#dc2626'); return; }

      // 3) ¿QUÉ imprimir?
      //   · Reimpresión (force): TODO el pedido. (Reimprimir comanda)
      //   · Si el pedido ya tiene ítems enviados a cocina → solo los NUEVOS
      //     (los que no tienen kitchen_printed_at).
      //   · Si NUNCA se ha enviado nada → TODO (primera comanda / comanda
      //     pendiente en prepago que se reimprime completa mientras no se cobra).
      var yaEnviados = raw.some(function (it) { return it.kitchen_printed_at; });
      var fuente = (force || !yaEnviados)
        ? raw
        : raw.filter(function (it) { return !it.kitchen_printed_at; });
      if (!fuente.length) { _diagToast('Sin ítems nuevos por imprimir', '#64748b'); return; }
      // Candado por FIRMA: si acabamos de imprimir exactamente estos mismos
      // ítems hace < 6 s (p. ej. el envío directo + el eco del listener), no
      // repetir. Ítems genuinamente nuevos tienen otra firma → sí se imprimen.
      var _sig = fuente.map(function (it) { return it.id || (it.name + 'x' + it.qty); }).sort().join('|');
      var _prev = _lastPrintSig[orderId];
      if (!force && _prev && _prev.sig === _sig && (Date.now() - _prev.ts) < 6000) {
        _diagToast('Comanda ya impresa (evitando duplicado)', '#64748b'); return;
      }
      _lastPrintSig[orderId] = { sig: _sig, ts: Date.now() };
      // Se marca "enviado a cocina" solo cuando el pedido de verdad está en
      // cocina (visible_cocina). En prepago sin pagar (no visible) NO se marca:
      // así la comanda pendiente reimprime completa hasta que se cobre.
      var marcar = !force && !!order.visible_cocina;

      var items = fuente.map(function (it) {
        var sel = it.selections || {};
        var modsArr = Object.values(sel.mods || {}).map(function (m) { return m.name || String(m); });
        /* Un COMBO se imprime con su contenido debajo. Al cocinero "Combo El
           Parche" no le dice que preparar; los productos si. Van como si fueran
           adiciones para no tocar el diseño de la comanda. */
        if (sel.combo_id) {
          modsArr = (sel.combo_items || []).map(function (ci) {
            return ((ci.cantidad || 1) > 1 ? ci.cantidad + 'x ' : '') + (ci.nombre || '?');
          }).concat(modsArr);
        }
        return { id: it.id, product_id: it.product_id, name: it.product_name || it.name || 'Item', qty: it.quantity || 1, note: it.note || '', notes: it.notes || '', mods: modsArr };
      });
      _diagToast('✓ Pedido OK — enviando a impresora…', '#15803d');

      // 3.5) Candado ATÓMICO entre ventanas/equipos para la PRIMERA comanda.
      // Antes el anti-duplicado era solo EN MEMORIA por ventana, así que si el
      // pedido salía por dos lados a la vez (p.ej. la ventana del CHAT que imprime
      // directo + el RECEPTOR de la caja que imprime al detectar el pedido nuevo),
      // la comanda salía DOBLE. Ahora se reclama en la BD: printed_at NULL→now en
      // un solo UPDATE atómico; el que gane imprime, el otro ve 0 filas y NO repite.
      // A prueba de fallos: si el claim da error o no se puede leer, se imprime igual
      // (mejor imprimir que dejar a la cocina sin comanda).
      var claimed = false;
      if (marcar && !yaEnviados) {
        var sbClaim = window._pos && window._pos.sb;
        if (sbClaim) {
          try {
            var cl = await sbClaim.from('pos_orders')
              .update({ printed_at: new Date().toISOString() })
              .eq('id', orderId).is('printed_at', null).select('id');
            if (!cl.error) {
              if (cl.data && cl.data.length) claimed = true;
              else { _diagToast('Comanda ya enviada por otra ventana', '#64748b'); return; }
            }
            // claim con error → seguir e imprimir igual (fallback seguro)
          } catch (e) { /* red/permiso: imprimir igual */ }
        }
      }

      /*  ══ 4) UNA COMANDA POR AREA ═══════════════════════════

          Con un solo sitio de preparacion —que es casi todo el mundo— esto
          es exactamente lo de antes: un grupo, una comanda, una impresora.

          Con dos o mas, cada area recibe SOLO lo suyo y por SU impresora: a
          la barra no le sirve una hoja con seis platos y una gaseosa al
          final, y a la cocina no le sirve la gaseosa.

          Y cada area decide si sale sola. Un restaurante puede tener pantalla
          en cocina y seguir imprimiendo en barra — es el caso que Sergio va
          a vender.                                                        */
      var mapa = await _cargarAreas();
      var grupos = [];
      if (mapa.areas.length >= 2) {
        var porArea = {};
        items.forEach(function (it) {
          var a = _areaDeItem(it, mapa);
          (porArea[a] = porArea[a] || []).push(it);
        });
        mapa.areas.forEach(function (a) {
          if (porArea[a.id] && porArea[a.id].length) {
            grupos.push({ area: a.id, nombre: a.nombre || a.id, items: porArea[a.id] });
          }
        });
        //  Un area que ya no existe no deja su comida sin imprimir: cae en la
        //  primera, que es la cocina de toda la vida.
        Object.keys(porArea).forEach(function (k) {
          if (!grupos.some(function (g) { return g.area === k; })) {
            var pri = grupos[0];
            if (pri) pri.items = pri.items.concat(porArea[k]);
            else grupos.push({ area: mapa.areas[0].id, nombre: mapa.areas[0].nombre || '', items: porArea[k] });
          }
        });
      } else {
        grupos = [{ area: (mapa.areas[0] && mapa.areas[0].id) || 'cocina', nombre: '', items: items }];
      }

      var printed = false;
      var impresos = [];      // los items que de verdad salieron
      for (var gi = 0; gi < grupos.length; gi++) {
        var g = grupos[gi];
        //  Lo pedido a mano sale siempre; lo automatico pregunta, por area.
        if (!force && !(await _autoprintOn(g.area))) {
          _diagToast('Automático apagado en ' + (g.nombre || g.area), '#64748b');
          continue;
        }
        var cab = { table: _tableDisplay(order), channel: order.channel, total: order.total || 0,
          paid: order.paid_amount || 0, guests: order.guests || order.persons || 0,
          waiter: order.waiter_name || '', sala: order.floor_name || order.zone_name || '',
          notes: order.notes || '', customer_name: order.customer_name || '',
          //  El nombre del area va en la hoja SOLO cuando hay mas de una: con
          //  una sola, decir «COCINA» en cada comanda es ruido.
          area: (grupos.length > 1 || mapa.areas.length >= 2) ? (g.nombre || g.area) : '' };
        var okG = false;
        for (var pr = 0; pr < 2 && !okG; pr++) {
          try {
            await _printHtml(_buildComanda(cab, g.items), 'comanda', g.area);
            okG = true; printed = true;
            impresos = impresos.concat(g.items);
            _diagToast('✓ Comanda impresa' + (g.nombre ? ' · ' + g.nombre : '') + ' OK', '#15803d');
          } catch (e) {
            if (pr < 1) { await _sleep(600); }
            else { _diagToast('❌ Error al imprimir: ' + (e && e.message || e), '#dc2626'); }
          }
        }
      }
      if (!printed && !grupos.length) { _diagToast('Nada que imprimir', '#64748b'); }

      if (printed) {
        try {
          var sb2 = window._pos && window._pos.sb;
          if (sb2) {
            // Si ya se reclamó atómicamente arriba, printed_at ya quedó puesto; no re-marcar.
            if (!claimed) await sb2.from('pos_orders').update({ printed_at: new Date().toISOString() }).eq('id', orderId);
            // Marcar como "enviados a cocina" los ítems recién impresos, para que
            // el próximo agregado imprima únicamente lo nuevo.
            /*  Solo los que DE VERDAD salieron. Si la barra tiene el
                automatico apagado, sus items siguen sin marcar — y asi el
                dia que se encienda, o si alguien imprime a mano, no se los
                encuentra ya dados por enviados.                          */
            if (marcar) {
              var ids = impresos.map(function (it) { return it.id; }).filter(Boolean);
              if (ids.length) await sb2.from('pos_order_items').update({ kitchen_printed_at: new Date().toISOString() }).in('id', ids);
            }
          }
        } catch(e) { console.warn('[posprint] marcar impreso:', e); }
      } else if (claimed) {
        // Se reclamó pero la impresión FALLÓ → liberar (printed_at→null) para que
        // un reintento o el receptor de la caja pueda volver a imprimirla.
        try { var sb3 = window._pos && window._pos.sb; if (sb3) await sb3.from('pos_orders').update({ printed_at: null }).eq('id', orderId); } catch(e) {}
      }
    } finally {
      _printing[orderId] = false;
    }
  };

  window.posOpenPrintModal = function(orderId) {
    var ex = document.getElementById('pos-print-modal-wrap');
    if (ex) ex.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pos-print-modal-wrap';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:9900;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    var SVG_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:330px;max-width:92vw;box-shadow:0 20px 60px rgba(15,23,42,.2)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px"><div style="font-weight:700;font-size:15px;color:#0F172A">Imprimir</div>'
      + '<button onclick="document.getElementById(\'pos-print-modal-wrap\').remove()" style="border:none;background:#F1F5F9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748B;display:flex;align-items:center;justify-content:center">' + SVG_X + '</button></div>'
      + '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<button onclick="posPrintAction(\'comanda\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Reimprimir comanda</div><div style="font-size:11px;color:#64748B">Ticket de cocina</div></div></button>'
      + '<button onclick="posPrintAction(\'recibo\',\'' + orderId + '\')" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #ECEEF2;border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;text-align:left;width:100%">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg></div>'
      + '<div><div style="font-weight:600;font-size:13px;color:#0F172A">Recibo del cliente</div><div style="font-size:11px;color:#64748B">Con precios, dirección y datos</div></div></button>'
      + '</div></div>';
    document.body.appendChild(overlay);
  };

  window.posPrintAction = async function(type, orderId) {
    var overlay = document.getElementById('pos-print-modal-wrap');
    if (overlay) overlay.remove();
    // Sin impresora local (tablet/celular): mandar la SEÑAL de reimpresión al
    // equipo de la caja — su receptor global la recibe al instante y la imprime.
    if (!window.electronPOS && type === 'comanda' && orderId) {
      try {
        var sbT = window._pos && window._pos.sb;
        if (sbT) {
          await sbT.from('pos_orders').update({ reprint_at: new Date().toISOString() }).eq('id', orderId);
          _diagToast('🖨 Enviado a la caja para imprimir', '#1d4ed8');
          return;
        }
      } catch(e) { console.warn('[posprint] señal reimpresión:', e); }
    }
    var hasPrinter = await _hasPrinter();
    if (!hasPrinter) { _noprinterToast(); return; }
    var order = await _fetchOrder(orderId);
    if (!order) { _noprinterToast(); return; }
    var items = (order.pos_order_items || []).map(function(it) {
      var sel = it.selections || {};
      // La adicion completa (nombre, cuantas y a cuanto), no solo el nombre:
      // el recibo necesita poder decir "+ 2x Papas ($16.000)".
      var modsArr = Object.values(sel.mods || {}).map(function(m){
        if (m && typeof m === 'object') return { name: m.name || '', qty: Number(m.qty) || 1, price: Number(m.price) || 0 };
        return { name: String(m), qty: 1, price: 0 };
      }).filter(function(m){ return m.name; });
      // En el recibo el combo tambien lista lo que lleva, a $0: el cliente paga
      // el precio del combo, no la suma, y asi lo ve.
      if (sel.combo_id) {
        modsArr = (sel.combo_items || []).map(function (ci) {
          return { name: ci.nombre || '?', qty: Number(ci.cantidad) || 1, price: 0 };
        }).concat(modsArr);
      }
      // `notes`, no `note`: asi se llama la columna. Con el nombre viejo la
      // nota llegaba siempre vacia y no se imprimia nunca.
      return { name: it.product_name || it.name || 'Item', qty: it.quantity || 1, notes: it.notes || '', mods: modsArr, total: (it.unit_price || 0) * (it.quantity || 1) };
    });
    var orderData = { table: _tableDisplay(order), channel: order.channel, id: order.id, total: order.total || 0, tax_total: order.tax_total || 0, tax_base: order.tax_base || 0, tax_detail: order.tax_detail || null, paid: order.paid_amount || 0, subtotal: order.subtotal || order.total || 0, packaging_fee: order.packaging_fee || 0, delivery_fee: order.delivery_fee || 0, discount: order.discount_amount || 0, tip: order.tip_amount || 0, guests: order.guests || order.persons || 0, waiter: order.waiter_name || '', sala: order.floor_name || order.zone_name || '', notes: order.notes || '', customer_name: order.customer_name || '', payment_method: order.payment_method || '' };
    var html;
    if (type === 'comanda') html = _buildComanda(orderData, items);
    else if (type === 'recibo') {
      var ch = String(order.channel||'').toLowerCase();
      {
        // El mismo recibo para domicilio, venta rapida y mesa. Antes mesa
        // tenia el suyo aparte y se habia quedado atras: sin el nombre del
        // negocio, sin adiciones, sin notas y sin puntos.
        var branch = {};
        try {
          var sb2 = window._pos && window._pos.sb;
          var bid = order.branch_id || (window._pos.state && window._pos.state.branchId);
          if (sb2 && bid) {
            var br = await sb2.from('branches').select('name,address,phone,brand_id,operacion_config').eq('id', bid).maybeSingle();
            if (br && br.data) {
              branch = br.data;
              // La config de impuestos se carga AQUI, no en la pantalla. Antes
              // solo la cargaba Pagos, asi que el desglose de impuestos salia
              // impreso unicamente si se cobraba desde alli: el mismo pedido
              // impreso desde Ventas, Domicilios o el Chat salia sin nada.
              if (window.posImpuestos && branch.operacion_config && branch.operacion_config.impuestos) {
                posImpuestos.setConfig(branch.operacion_config.impuestos);
              }
              if (branch.brand_id) { var bd = await sb2.from('brands').select('name').eq('id', branch.brand_id).maybeSingle(); if (bd && bd.data) branch.brand_name = bd.data.name; }
            }
          }
        } catch(e) {}
        // El segundo telefono y los puntos no viven en el pedido: hay que ir a
        // buscarlos a la ficha del cliente. Si falla (sin internet, por ejemplo)
        // el recibo sale como siempre en vez de no salir.
        try { await _datosClienteRecibo(order, orderData); } catch(e) { console.warn('[posprint] datos cliente:', e); }
        // Los pagos: para el desglose cuando pago con varios metodos y para
        // el cambio cuando pago en efectivo.
        var payments = [];
        try {
          var sbP = window._pos && window._pos.sb;
          if (sbP && orderId) { var pr = await sbP.from('pos_payments').select('*').eq('order_id', orderId); payments = (pr && pr.data) ? pr.data : []; }
        } catch(e) {}
        html = _buildReceiptDomicilio(orderData, items, branch, payments);
      }
    }
    if (html) _printHtml(html, type === 'comanda' ? 'comanda' : 'recibo');
  };

})();
;
/* ═══════ pos-print-listener.js ═══════ */
;// =====================================================================
// pos-print-listener.js — Receptor GLOBAL de impresión (equipo de caja)
//
// Problema que resuelve: la impresión de pedidos creados desde la tablet
// dependía de que el PC estuviera en la pantalla de Ventas (el único lugar
// con el listener realtime). Si la caja estaba en dashboard, caja, informes,
// etc., la comanda no salía.
//
// Este receptor se carga en TODAS las pantallas del POS. Solo actúa en el
// equipo con impresora (Electron); en la tablet/celular queda inerte.
//
//  1. RECEPTOR (principal): escucha INSERT/UPDATE de pos_orders por realtime
//     y ordena imprimir al instante, esté la caja en la pantalla que esté.
//  2. SEÑAL DE REIMPRESIÓN: si otro dispositivo marca reprint_at, se fuerza
//     la reimpresión aunque ya se hubiera impreso antes.
//  3. BARRIDO DE SEGURIDAD (paracaídas): cada 45 s consulta si quedó algún
//     pedido sin imprimir (printed_at IS NULL) por si el realtime perdió la
//     conexión un instante. Consulta mínima (solo ids recientes).
// =====================================================================
(function () {
  function boot() {
    if (!window.electronPOS) return;                 // solo el equipo con impresora
    var sb = window._pos && window._pos.sb;
    if (!sb || typeof window.posAutoprint !== 'function') return;
    if (window.__posPrintListenerOn) return;          // no duplicar por doble carga
    window.__posPrintListenerOn = true;

    // Al arrancar, recuperar hasta 10 min hacia atrás (pedidos hechos mientras
    // esta página cargaba o el equipo estaba en otra pantalla sin receptor).
    var sinceIso = new Date(Date.now() - 10 * 60000).toISOString();
    var _seenReprint = {};   // {orderId: reprint_at} — dedupe de señales

    // Candado anti-bucle: solo la PRIMERA comanda (printed_at nulo). Sin este
    // filtro, el update de printed_at re-disparaba la impresión sin parar.
    // Los ítems agregados a una mesa ocupada se disparan por el listener de
    // pos_order_items (INSERT) más abajo, no por aquí.
    function shouldPrint(o) { return o && o.visible_cocina && !o.printed_at; }

    function handleRow(o) {
      if (!o || !o.id) return;
      // Señal de reimpresión desde otro dispositivo (tablet): forzar
      if (o.reprint_at && _seenReprint[o.id] !== o.reprint_at) {
        _seenReprint[o.id] = o.reprint_at;
        window.posAutoprint(o.id, { force: true });
        return;
      }
      if (shouldPrint(o)) window.posAutoprint(o.id);
    }

    // Ítems agregados a una mesa ya en cocina: se disparan por la INSERCIÓN de
    // ítems (no por updates del pedido), con anti-rebote para agrupar un lote y
    // no imprimir uno por uno. posAutoprint imprime solo los NO enviados. Esto
    // NO puede entrar en bucle: el marcado es un UPDATE de pos_order_items (no
    // INSERT) y printed_at es de pos_orders (con su candado). Delay > que el
    // primer print del pedido, para que ese ya haya marcado sus ítems.
    var _itemTimers = {};
    function handleItemInsert(row) {
      if (!row || !row.order_id) return;
      var oid = row.order_id;
      if (_itemTimers[oid]) clearTimeout(_itemTimers[oid]);
      _itemTimers[oid] = setTimeout(async function () {
        delete _itemTimers[oid];
        try {
          // Solo disparar si el pedido YA tuvo una comanda (printed_at). Es decir,
          // es una ADICIÓN a una mesa ya enviada. Un pedido nuevo (primera vez) o
          // un borrador guardado sin enviar NO deben imprimir por aquí.
          var r = await sb.from('pos_orders').select('printed_at, status').eq('id', oid).maybeSingle();
          var o = r && r.data;
          if (!o || !o.printed_at) return;
          if (o.status === 'cancelled' || o.status === 'abandoned') return;
          window.posAutoprint(oid);
        } catch (e) { /* silencioso */ }
      }, 2500);
    }

    // Solo los pedidos de esta sucursal: la impresora de un restaurante no
    // tiene nada que ver con los pedidos de otro.
    var _br = window._pos && window._pos.state && window._pos.state.branchId;
    var _fb = _br ? 'branch_id=eq.' + _br : undefined;
    sb.channel('pos-print-listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders', filter: _fb }, function (p) { handleRow(p.new); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_orders', filter: _fb }, function (p) { handleRow(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_order_items', filter: _fb }, function (p) { handleItemInsert(p.new); })
      .subscribe();

    // Barrido de seguridad: pedidos visibles sin imprimir (ventana reciente).
    var _sweeping = false;
    async function sweep() {
      if (_sweeping) return;
      _sweeping = true;
      try {
        /* SOLO los de esta sucursal. El aislamiento por restaurante no basta
           aqui: dos sucursales del MISMO dueño comparten tenant, asi que sin
           esto la impresora de una sucursal imprimiria los pedidos de la otra.
           Con una sola sucursal no se nota; con dos, si. */
        var q = sb.from('pos_orders')
          .select('id, reprint_at')
          .eq('visible_cocina', true)
          .is('printed_at', null)
          .gte('created_at', sinceIso)
          .not('status', 'in', '("cancelled","abandoned")')
          .order('created_at', { ascending: true })
          .limit(10);
        var _brSweep = window._pos && window._pos.state && window._pos.state.branchId;
        if (_brSweep) q = q.eq('branch_id', _brSweep);
        var r = await q;
        var rows = (r && r.data) || [];
        for (var i = 0; i < rows.length; i++) await window.posAutoprint(rows[i].id);
      } catch (e) { /* silencioso: reintenta en el próximo ciclo */ }
      _sweeping = false;
    }
    setTimeout(sweep, 3000);                          // recuperación al abrir la página
    setInterval(function () {
      // mantener la ventana del barrido siempre "reciente" (últimos 10 min)
      sinceIso = new Date(Date.now() - 10 * 60000).toISOString();
      sweep();
    }, 45000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sweep(); });

    console.log('[POS PrintListener] Receptor global de impresión activo');
  }

  if (window._pos && window._pos.on) window._pos.on('core:ready', boot);
  else document.addEventListener('DOMContentLoaded', function () {
    if (window._pos && window._pos.on) window._pos.on('core:ready', boot);
  });
})();

;
/* ═══════ pos-caja-guard.js ═══════ */
;(function() {
  var _cache = null;
  var _cacheAt = 0;

  function _showModal() {
    if (document.getElementById('caja-guard-overlay')) return;
    var o = document.createElement('div');
    o.id = 'caja-guard-overlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.50);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:DM Sans,system-ui,sans-serif';
    o.innerHTML = [
      '<div style="background:#fff;border-radius:16px;padding:32px 28px 24px;max-width:340px;width:92%;box-shadow:0 8px 40px rgba(15,23,42,.22)">',
        '<div style="text-align:center;margin-bottom:22px">',
          '<div style="background:#FEF3C7;border-radius:12px;width:52px;height:52px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">',
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
          '</div>',
          '<div style="font-size:16px;font-weight:700;color:#0F172A;margin-bottom:6px">Caja cerrada</div>',
          '<div style="font-size:13px;color:#64748B;line-height:1.55">Debes aperturar la caja antes de registrar ventas. Todas las ventas quedan guardadas en el cuadre de caja.</div>',
        '</div>',
        '<div style="display:flex;flex-direction:column;gap:10px">',
          '<button id="caja-guard-btn-open" style="background:#5B6BFF;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;width:100%">Abrir caja</button>',
          '<button id="caja-guard-btn-cancel" style="background:#F1F5F9;color:#64748B;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;width:100%">Cancelar</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(o);
    document.getElementById('caja-guard-btn-open').onclick = function() { window.location.href = 'caja.html'; };
    document.getElementById('caja-guard-btn-cancel').onclick = function() { o.remove(); };
    o.addEventListener('click', function(e) { if (e.target === o) o.remove(); });
  }

  window.cajaGuard = async function(branchId) {
    var now = Date.now();
    if (_cache !== null && (now - _cacheAt) < 60000) {
      if (!_cache) _showModal();
      return _cache;
    }

    var sb = window._pos && window._pos.sb;
    if (!sb || !branchId) return true;

    try {
      var result = await sb.from('pos_sessions')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .limit(1);
      var open = !result.error && result.data && result.data.length > 0;
      _cache = open;
      _cacheAt = now;
      if (!open) _showModal();
      return open;
    } catch(e) {
      console.warn('[cajaGuard] error:', e);
      return true;
    }
  };

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') _cache = null;
  });
})();

;
/* ═══════ pos-metodos.js ═══════ */
;/* pos-metodos.js — LA ÚNICA fuente de métodos de pago.
 *
 * Regla de Sergio: los métodos que él configura en Configuración → Métodos de
 * pago son los únicos que existen. Ninguna pantalla debe inventarse uno.
 *
 * Antes cada pantalla hacía lo suyo:
 *   · la caja comparaba por nombre → lo guardado con id caía en "Otros"
 *     ($437.000 de $550.500 la noche del 7-ago, con el efectivo en $0);
 *   · el tablero adivinaba con una lista de palabras y, lo que no reconocía,
 *     LO CONTABA COMO EFECTIVO — una transferencia guardada con id entraba
 *     como efectivo y descuadraba el arqueo en silencio;
 *   · los informes pintaban una columna llamada "Pm_x719c1pqb".
 *
 * Aquí se traduce cualquier cosa —id, nombre, con mayúsculas o con tildes— al
 * método configurado al que pertenece. Lo que no se reconoce se devuelve como
 * desconocido: es mejor un "Otros" visible que un número mal sumado.
 */
(function (w) {
  'use strict';

  var _mets = null;      // los métodos configurados, ya cargados
  var _porId = {};       // id           -> método
  var _porNom = {};      // nombre normalizado -> método
  var _porTipo = {};     // tipo         -> método (último recurso)

  function norm(v) {
    return String(v == null ? '' : v).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  function indexar(lista) {
    _mets = lista || [];
    _porId = {}; _porNom = {}; _porTipo = {};
    _mets.forEach(function (m) {
      if (m.id) _porId[String(m.id)] = m;
      if (m.nombre) _porNom[norm(m.nombre)] = m;
      /* El nombre con el que se guardaron los pagos viejos. Sin esto, un cobro
         de la semana pasada aparecería en "Otros" al cambiarle el nombre. */
      if (m._alias) _porNom[norm(m._alias)] = m;
      /* El tipo se indexa DESPUÉS del nombre y sin pisarlo: si dos métodos son
         de tipo "transferencia" (Nequi y Daviplata), el tipo solo desempata
         cuando no hay nada mejor. */
      if (m.tipo && !_porTipo[norm(m.tipo)]) _porTipo[norm(m.tipo)] = m;
    });
    return _mets;
  }

  /* Carga los métodos del restaurante. Se pide una sola vez por pantalla. */
  /* "Saldo <negocio>" pasó a llamarse "Billetera <negocio>". El tipo interno
     sigue siendo `saldo` —eso NO se toca, es lo que llevan los pagos ya
     registrados—. Se guarda el nombre viejo como alias para que un pago hecho
     antes del cambio se siga reconociendo. */
  function _renombrarSaldo(m) {
    if (!m || String(m.tipo || '') !== 'saldo') return m;
    var n = String(m.nombre || '');
    if (!/^Saldo\b/i.test(n)) return m;
    var c = {}; for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) c[k] = m[k];
    c.nombre = n.replace(/^Saldo\b/i, 'Billetera');
    c._alias = n;
    return c;
  }

  function _ordenar(lista) {
    return indexar((lista || []).map(_renombrarSaldo)
      .filter(function (m) { return m && String(m.nombre || '').trim(); })
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); }));
  }

  async function _traer(sb, branchId) {
    var r = await sb.from('ia_config').select('pagos').eq('branch_id', branchId).maybeSingle();
    var p = (r && r.data && r.data.pagos) || {};
    return Array.isArray(p.metodos) ? p.metodos : [];
  }

  async function cargar(sb, branchId) {
    if (_mets) return _mets;
    if (!sb || !branchId) return indexar([]);

    /* Lo guardado en el equipo sirve YA: son cuatro nombres que cambian dos
       veces al ano, y siete pantallas estaban esperando esta consulta antes de
       pintar nada. La consulta sale igual, por detras. */
    var g = null;
    try { g = window.posCache && posCache.leer('metodos'); } catch (e) {}
    if (g && Array.isArray(g.datos) && g.datos.length) {
      var listo = _ordenar(g.datos);
      setTimeout(function () {
        _traer(sb, branchId).then(function (arr) {
          if (!arr.length) return;
          if (JSON.stringify(arr) === JSON.stringify(g.datos)) return;   // nada cambio
          _ordenar(arr);
          try { posCache.guardar('metodos', arr); } catch (e) {}
          console.info('[metodos] la lista cambio; ya esta al dia');
        }).catch(function () {});
      }, 0);
      return listo;
    }

    try {
      var arr2 = await _traer(sb, branchId);
      /* Solo se guarda una lista con algo. Una lista vacia puede ser una
         consulta que fallo a medias, y guardarla dejaria la pantalla siguiente
         sin metodos de pago. */
      try { if (window.posCache && arr2.length) posCache.guardar('metodos', arr2); } catch (e) {}
      return _ordenar(arr2);
    } catch (e) { console.warn('[metodos] no se pudieron cargar:', e); return indexar([]); }
  }

  /* Devuelve el método configurado al que corresponde lo guardado, o null. */
  function resolver(valor) {
    var v = String(valor == null ? '' : valor).trim();
    if (!v) return null;
    return _porId[v] || _porNom[norm(v)] || _porTipo[norm(v)] || null;
  }

  /* Marcadores del sistema y claves viejas en ingles. No son metodos que el
     restaurante configure, pero estan guardados en pedidos y hay que saber
     leerlos. Vivian repartidos: historial tenia su propio mapita. */
  var ESPECIALES = {
    multiple: 'Varios métodos',
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
    nequi: 'Nequi', daviplata: 'Daviplata',
  };

  /* El nombre para mostrar, en el orden en que hay que preguntarse las cosas. */
  function nombre(valor) {
    var m = resolver(valor);
    if (m) return m.nombre;

    var v = String(valor == null ? '' : valor).trim();
    if (!v) return 'Otros';

    var esp = ESPECIALES[norm(v)];
    if (esp) return esp;

    /* Un id interno NUNCA se le muestra a nadie: 'pm_x719c1pqb' ya salio una
       vez en la pantalla de un cliente y no puede volver a pasar. */
    if (/^pm_[a-z0-9]+$/i.test(v) || v.indexOf('__') === 0) return 'Otros';

    /* Texto libre que anoto el bot desde la conversacion ("Nequi"): se muestra
       tal cual. Es mas honesto que "Otros" — el pago SI se hizo por ahi; lo
       que falta es que ese metodo este configurado. */
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  /* Agrupa una lista de pagos por método configurado.
     Devuelve [{ id, nombre, tipo, monto }] en el orden de la configuración,
     con los no reconocidos al final bajo "Otros". */
  function agrupar(pagos, campoMetodo, campoMonto) {
    var km = campoMetodo || 'method', ka = campoMonto || 'amount';
    var acc = {}, otros = 0;
    (_mets || []).forEach(function (m) { acc[m.id || m.nombre] = 0; });
    (pagos || []).forEach(function (p) {
      var m = resolver(p[km]);
      var v = parseFloat(p[ka]) || 0;
      if (m) acc[m.id || m.nombre] = (acc[m.id || m.nombre] || 0) + v;
      else otros += v;
    });
    var filas = (_mets || []).map(function (m) {
      return { id: m.id || m.nombre, nombre: m.nombre, tipo: m.tipo || 'otro',
               monto: acc[m.id || m.nombre] || 0 };
    });
    if (otros > 0) filas.push({ id: '__otros', nombre: 'Otros', tipo: 'otro', monto: otros });
    return filas;
  }

  function lista() { return _mets || []; }

  w.posMetodos = { cargar: cargar, resolver: resolver, nombre: nombre,
                   agrupar: agrupar, lista: lista, norm: norm };
})(window);

;
/* ═══════ pos-saldo.js ═══════ */
;/* pos-saldo.js — cobrar con el saldo que el cliente recargó en la página.
 *
 * El saldo NO es un método de pago tradicional: no entra plata nueva al
 * negocio. El cliente ya te pagó cuando recargó; aquí solo se consume. Por eso
 * vive junto a los puntos y no junto al efectivo.
 *
 * PERO SÍ ES VENTA. La venta ocurre el día que el cliente se come la comida,
 * no el día que recargó (criterio de Sergio, 8-ago-2026). Por eso el cobro
 * entra en pos_payments como cualquier otro y suma en el cuadre de caja; lo
 * que se guarda aparte es la recarga, que no es venta.
 *
 * La plata se mueve SOLO en la base, con `fn_saldo_mover`: bloquea la fila y
 * no deja el saldo en negativo. Este archivo no calcula saldos; solo pregunta
 * y ordena. Si un día cambia la regla, cambia en un solo sitio.
 */
(function (w) {
  'use strict';

  var CTX = { tenantId: null, branchId: null };
  var COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  function sb() { return w._pos && w._pos.sb; }
  function setCtx(t, b) { CTX.tenantId = t || null; CTX.branchId = b || null; }
  function money(n) { return COP.format(Math.round(Number(n) || 0)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Cuánto tiene disponible. Devuelve 0 ante cualquier duda: es preferible que
     el cajero vea "sin saldo" y cobre de otra forma, a que el sistema prometa
     un saldo que la base va a rechazar un segundo después. */
  async function disponibles(clienteId) {
    var s = sb();
    if (!s || !clienteId || !CTX.tenantId) return 0;
    try {
      var r = await s.rpc('fn_saldo_cliente', { p_tenant: CTX.tenantId, p_cliente: clienteId });
      var d = r && r.data;
      var fila = Array.isArray(d) ? d[0] : d;
      return Math.max(0, Math.round(Number(fila && fila.saldo) || 0));
    } catch (e) { console.warn('[saldo] no se pudo leer:', e); return 0; }
  }

  /* Descuenta. `ref` es la llave contra el cobro doble: la base tiene un índice
     único por (tenant, referencia), así que si el cajero toca dos veces o se
     cae el internet a mitad, el segundo intento no descuenta otra vez.
     Por eso la referencia lleva el id del pago y no solo el del pedido: un
     pedido puede tener dos abonos con saldo, y son cobros distintos. */
  async function consumir(clienteId, monto, orderId, ref, detalle) {
    var s = sb();
    if (!s) throw new Error('Sin conexión');
    var valor = Math.round(Number(monto) || 0);
    if (valor <= 0) throw new Error('El monto debe ser mayor que cero');
    var r = await s.rpc('fn_saldo_mover', {
      p_tenant: CTX.tenantId, p_cliente: clienteId, p_motivo: 'consumo',
      p_monto: -valor, p_branch: CTX.branchId, p_order: orderId || null,
      p_ref: ref, p_detalle: detalle || 'Pago con saldo',
    });
    if (r && r.error) {
      var m = String(r.error.message || '');
      /* La base grita SALDO_INSUFICIENTE|<tenía>|<pedía>. Se traduce a algo que
         el cajero entienda, con las dos cifras, en vez del error de Postgres. */
      if (m.indexOf('SALDO_INSUFICIENTE') >= 0) {
        var p = m.split('|');
        var e = new Error('Al cliente no le alcanza el saldo.');
        e.codigo = 'SALDO_INSUFICIENTE';
        e.disponible = Math.round(Number(p[1]) || 0);
        e.pedido = Math.round(Number(p[2]) || valor);
        throw e;
      }
      /* Referencia repetida = este cobro YA se hizo. Pasa cuando el cajero toca
         dos veces o se reintenta tras un corte. No es un error: es la prueba de
         que el índice único hizo su trabajo. Se sigue como si hubiera pasado. */
      if (String(r.error.code) === '23505') {
        console.warn('[saldo] cobro repetido, se ignora:', ref);
        return await disponibles(clienteId);
      }
      throw r.error;
    }
    return Math.round(Number(r && r.data) || 0);   // saldo que le queda
  }

  /* Le devuelve el saldo al cliente al anular un pedido: la plata era suya, no
     nuestra. El motivo es 'anulacion' —uno de los que acepta la base— para que
     en el historial se vea POR QUÉ volvió, y no confundirlo con una recarga.
     La referencia lleva ":anul" para no chocar con la del cobro original. */
  async function devolver(clienteId, monto, orderId, ref, detalle) {
    var s = sb();
    if (!s) throw new Error('Sin conexión');
    var valor = Math.round(Number(monto) || 0);
    if (valor <= 0) return 0;
    var r = await s.rpc('fn_saldo_mover', {
      p_tenant: CTX.tenantId, p_cliente: clienteId, p_motivo: 'anulacion',
      p_monto: valor, p_branch: CTX.branchId, p_order: orderId || null,
      p_ref: ref, p_detalle: detalle || 'Devolución por pedido anulado',
    });
    if (r && r.error) {
      /* Ya se le habia devuelto: no se devuelve dos veces. */
      if (String(r.error.code) === '23505') return await disponibles(clienteId);
      throw r.error;
    }
    return Math.round(Number(r && r.data) || 0);
  }

  /* Cuánto se pagó con saldo en un pedido. Se lee de pos_payments, que es
     donde quedó el desglose, para no depender de que quien anula sepa el
     detalle del cobro. */
  async function pagadoEn(orderId) {
    var s = sb();
    if (!s || !orderId) return 0;
    try {
      var r = await s.from('pos_payments').select('amount, method').eq('order_id', orderId);
      var filas = (r && r.data) || [];
      var total = 0;
      filas.forEach(function (f) {
        var m = w.posMetodos && w.posMetodos.resolver(f.method);
        if ((m && m.tipo === 'saldo') || String(f.method) === '__saldo') total += Number(f.amount) || 0;
      });
      return Math.round(total);
    } catch (e) { console.warn('[saldo] no se pudo leer lo pagado:', e); return 0; }
  }

  /* Anular un pedido pagado con saldo: hay que devolvérselo. La plata era del
     cliente, no nuestra — no nos podemos quedar con algo que no es nuestro.
     (Criterio de Sergio, 8-ago-2026.)

     Se pregunta ANTES con una sola ventana que dice las dos cosas: que se va a
     anular y que el saldo vuelve. Y se devuelve DESPUÉS de que la anulación de
     verdad quedó guardada, para no regalarle saldo por un pedido que sigue vivo
     porque falló el guardado.

     Se usa así:
       var permiso = await posSaldo.pedirAnular(id, '¿Anular esta venta?');
       if (!permiso) return;                  // dijo que no
       ...anular el pedido...
       await permiso.devolver();              // ya con la anulación guardada
  */
  async function pedirAnular(orderId, pregunta) {
    var texto = pregunta || '¿Anular este pedido?';
    var monto = 0, clienteId = null, nombre = '';
    try {
      monto = await pagadoEn(orderId);
      if (monto > 0) {
        var s = sb();
        var r = await s.from('pos_orders')
          .select('cliente_id, pos_clientes(nombre)').eq('id', orderId).maybeSingle();
        clienteId = (r && r.data && r.data.cliente_id) || null;
        nombre = (r && r.data && r.data.pos_clientes && r.data.pos_clientes.nombre) || 'el cliente';
      }
    } catch (e) { console.warn('[saldo] no se pudo revisar el pedido:', e); }

    if (monto > 0 && clienteId) {
      texto += '\n\nEste pedido se pagó con ' + money(monto) + ' de saldo.'
             + '\nAl anularlo se le devuelven a ' + nombre + '.';
    } else if (monto > 0) {
      /* Se pagó con saldo pero no sabemos de quién: mejor decirlo que
         devolvérselo a la persona equivocada. */
      texto += '\n\nOJO: este pedido se pagó con ' + money(monto) + ' de saldo y no'
             + '\npudimos identificar al cliente. Tendrás que devolvérselo a mano.';
    }
    if (!w.confirm(texto)) return null;

    return {
      monto: monto,
      devolver: async function () {
        if (monto <= 0 || !clienteId) return 0;
        try {
          return await devolver(clienteId, monto, orderId,
            'pedido:' + orderId + ':anulado', 'Devolución por pedido anulado');
        } catch (e) {
          console.error('[saldo] no se pudo devolver:', e);
          w.alert('El pedido quedó anulado, pero NO se pudo devolver el saldo.\n\n'
                + 'Devuélveselo a mano desde Clientes: ' + money(monto) + ' a ' + nombre + '.');
          return 0;
        }
      },
    };
  }

  /* Devolver lo que se pagó con saldo en un pedido, sin preguntar nada. Para
     las pantallas que YA mostraron su propia ventana de confirmación: volver a
     preguntar algo cuya única respuesta correcta es "sí" solo estorba.
     Devuelve cuánto se devolvió, para poder avisarlo. */
  async function devolverDeOrden(orderId) {
    var monto = await pagadoEn(orderId);
    if (monto <= 0) return 0;
    try {
      var s = sb();
      var r = await s.from('pos_orders').select('cliente_id').eq('id', orderId).maybeSingle();
      var cli = (r && r.data && r.data.cliente_id) || null;
      if (!cli) { console.warn('[saldo] pedido sin cliente, no se puede devolver:', orderId); return 0; }
      await devolver(cli, monto, orderId, 'pedido:' + orderId + ':anulado',
                     'Devolución por pedido anulado');
      return monto;
    } catch (e) { console.error('[saldo] no se pudo devolver:', e); return 0; }
  }

  /* Modal de "no le alcanza el saldo". Solo informa: recargar es un acto del
     cliente en la pagina, no algo que el cajero se salte en el cobro.
     Se le dice cuanto tiene y cuanto falta, porque es justo lo que el cajero
     va a tener que decirle al cliente en voz alta. */
  function modalInsuficiente(op) {
    op = op || {};
    var tiene    = Math.round(Number(op.tiene) || 0);
    var necesita = Math.round(Number(op.necesita) || 0);
    var falta    = Math.max(0, necesita - tiene);
    var nombre   = String(op.nombre || '').trim();
    var apuntado = Math.round(Number(op.yaApuntado) || 0);

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';

    function linea(l, v, color) {
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;'
        + 'padding:7px 0;font-size:13px"><span style="color:#64748B">' + l + '</span>'
        + '<b style="color:' + (color || '#0F172A') + ';font-variant-numeric:tabular-nums">' + v + '</b></div>';
    }

    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:22px 24px;width:390px;max-width:94vw;'
      + 'font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      +   '<span style="width:36px;height:36px;border-radius:10px;background:#ECFEFF;color:#0891B2;'
      +   'display:flex;align-items:center;justify-content:center">'
      +     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      +     'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
      +     '<rect x="2" y="5" width="20" height="14" rx="2.5"/>'
      +     '<rect x="5" y="9.5" width="4.5" height="3.5" rx="1"/>'
      +     '<path d="M15.5 10a3.2 3.2 0 0 1 0 4"/><path d="M18 8.4a6 6 0 0 1 0 7.2"/></svg></span>'
      +   '<div style="font-size:16px;font-weight:800;color:#0F172A">'
      +     (tiene > 0 ? 'No le alcanza el saldo' : 'Este cliente no tiene saldo') + '</div>'
      + '</div>'
      + (nombre ? '<div style="font-size:13px;color:#475569;line-height:1.6;margin-bottom:10px">'
                  + '<b>' + esc(nombre) + '</b></div>' : '')
      + '<div style="background:#F8FAFC;border-radius:11px;padding:6px 13px">'
      +   linea('Tiene', money(tiene))
      +   (apuntado > 0 ? linea('Ya apuntado en este pedido', money(apuntado), '#B45309') : '')
      +   (necesita > 0 ? linea('Se necesita', money(necesita)) : '')
      +   (falta > 0 ? '<div style="border-top:1px solid #E2E8F0">'
                       + linea('Le falta', money(falta), '#DC2626') + '</div>' : '')
      + '</div>'
      + '<div style="font-size:12.5px;color:#64748B;line-height:1.55;margin-top:12px">'
      +   (tiene > 0
          ? 'Cobra <b>' + money(tiene - apuntado > 0 ? tiene - apuntado : 0)
            + '</b> con el saldo y el resto con otro método, o pídele que recargue en tu página.'
          : 'Puede recargar en tu página de clientes. Mientras tanto, cobra con otro método.')
      + '</div>'
      + '<button style="width:100%;margin-top:16px;padding:11px;border:none;border-radius:10px;'
      + 'background:#0F172A;color:#fff;font-weight:700;font-size:13.5px;cursor:pointer">Entendido</button>'
      + '</div>';

    ov.querySelector('button').onclick = function () { ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }

  w.posSaldo = {
    setCtx: setCtx, disponibles: disponibles, consumir: consumir,
    devolver: devolver, pagadoEn: pagadoEn, pedirAnular: pedirAnular,
    devolverDeOrden: devolverDeOrden, modalInsuficiente: modalInsuficiente,
    money: money, esc: esc,
  };
})(window);

;
/* ═══════ pos-mapa.js ═══════ */
;/* ══════════════════════════════════════════════════════════════════════
   POS-MAPA — el mapa de Cobra, sin darle la llave al navegador
   (21-ago-2026)

   COMO FUNCIONA Y POR QUE ASI:

   La imagen del mapa la pide el servidor a Google y la devuelve ya hecha,
   asi que la llave del restaurante nunca baja aqui. Si bajara, cualquiera
   que abra esta pantalla podria sacarla y gastarle el cupo —y el cobro le
   llega a el, porque es SU tarjeta.

   Los puntos (el domiciliario moviendose, la casa del cliente) NO se los
   pedimos a Google: los dibuja Cobra encima de la imagen, calculando en
   que pixel cae cada coordenada. Es la misma cuenta que usa Google para
   armar la imagen, asi que caen exactamente donde deben.

   La ganancia es grande: el domiciliario puede moverse mil veces y la
   imagen de fondo sigue siendo la misma. Mover el punto NO le cuesta al
   restaurante ni una sola llamada. De la otra forma —pidiendole a Google
   una imagen nueva con el punto ya dibujado— cada cuadra que avanzara
   seria una llamada mas que pagar.
   ══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var SB_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  var TAM = 256;   // el lado de un mosaico de mapa, en pixeles. Es el estandar.

  function cliente() {
    return (w._pos && w._pos.sb) || w.sb || null;
  }

  /* ── La cuenta de siempre: coordenadas → pixeles ─────────────────────
     Proyeccion de Mercator, la misma que usa Google. A una latitud dada
     le corresponde SIEMPRE el mismo pixel para un zoom dado; por eso se
     puede dibujar encima de la imagen sin volver a preguntarle a nadie. */
  function proyectar(lat, lng, zoom) {
    var escala = TAM * Math.pow(2, zoom);
    var x = (lng + 180) / 360 * escala;
    var senLat = Math.sin(lat * Math.PI / 180);
    //  Se recorta a ±85° porque en los polos la cuenta se va al infinito.
    senLat = Math.max(-0.9999, Math.min(0.9999, senLat));
    var y = (0.5 - Math.log((1 + senLat) / (1 - senLat)) / (4 * Math.PI)) * escala;
    return { x: x, y: y };
  }

  /* Que zoom hace falta para que TODOS los puntos quepan en la imagen. */
  function zoomQueQuepa(puntos, ancho, alto, margen) {
    if (puntos.length < 2) return 15;
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    puntos.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    });
    for (var z = 18; z >= 3; z--) {
      var a = proyectar(minLat, minLng, z), b = proyectar(maxLat, maxLng, z);
      if (Math.abs(b.x - a.x) < ancho - margen && Math.abs(b.y - a.y) < alto - margen) return z;
    }
    return 3;
  }

  function centroDe(puntos) {
    var sLat = 0, sLng = 0;
    puntos.forEach(function (p) { sLat += p.lat; sLng += p.lng; });
    return { lat: sLat / puntos.length, lng: sLng / puntos.length };
  }

  /* ── Los alfileres ───────────────────────────────────────────────────
     Se dibujan con SVG en linea, no con imagenes: asi no hay una segunda
     descarga y el color sale de los mismos tokens del producto. */
  var PIN = {
    destino: { color: '#DC2626', d: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z' },
    negocio: { color: '#0F172A', d: 'M3 9l1-5h16l1 5v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 12v8h14v-8' },
    domi:    { color: '#5B6BFF', d: 'M5.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm13 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM15 17.5H9l-2-8H4' }
  };

  function svgPin(tipo) {
    var p = PIN[tipo] || PIN.destino;
    return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" '
      + 'style="background:' + p.color + ';border-radius:999px;padding:5px;box-sizing:border-box;'
      + 'box-shadow:0 2px 8px -1px rgba(15,23,42,.45)">'
      + '<path d="' + p.d + '"/></svg>';
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ══════════════════════════════════════════════════════════════════
     DIBUJAR
     opciones = {
       puntos: [{lat, lng, tipo:'destino'|'negocio'|'domi', etiqueta}],
       alto:   pixeles (por defecto 320)
     }
     ══════════════════════════════════════════════════════════════════ */
  async function pintar(cont, opciones) {
    if (!cont) return;
    opciones = opciones || {};
    var puntos = (opciones.puntos || []).filter(function (p) {
      return p && isFinite(p.lat) && isFinite(p.lng);
    });

    if (!puntos.length) {
      cont.innerHTML = aviso('Todavía no sabemos dónde queda esta dirección.',
        'Cuando el domiciliario entregue, su celular deja el punto exacto guardado.');
      return;
    }

    var ancho = Math.min(640, Math.max(200, cont.clientWidth || 600));
    var alto = Math.min(640, opciones.alto || 320);
    var centro = puntos.length === 1 ? puntos[0] : centroDe(puntos);
    var zoom = puntos.length === 1 ? (opciones.zoom || 16)
             : zoomQueQuepa(puntos, ancho, alto, 90);

    var ses = await (cliente() ? cliente().auth.getSession() : Promise.resolve(null));
    var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
    if (!tok) { cont.innerHTML = aviso('Tu sesión se venció.', 'Vuelve a entrar para ver el mapa.'); return; }

    var url = SB_URL + '/functions/v1/mapa?accion=estatico'
      + '&lat=' + centro.lat + '&lng=' + centro.lng
      + '&zoom=' + zoom + '&w=' + Math.round(ancho) + '&h=' + Math.round(alto);

    /* La imagen se pide con fetch —y no con un <img src>— porque hay que
       mandar el token de la sesion. El servidor comprueba de que
       restaurante es antes de gastarle una llamada a nadie. */
    var blob = null, fallo = null;
    try {
      var r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
      if (r.status === 409) fallo = 'sin_conectar';
      else if (r.status === 429) fallo = 'tope';
      else if (!r.ok) fallo = 'error';
      else blob = await r.blob();
    } catch (e) { fallo = 'error'; }

    if (fallo === 'sin_conectar') {
      cont.innerHTML = aviso('El mapa necesita tu cuenta de Google.',
        'Conéctala en Configuración › Domicilios. Sin eso, todo lo demás sigue funcionando igual.');
      return;
    }
    if (fallo === 'tope') {
      cont.innerHTML = aviso('Llegaste al tope de consultas del mes.',
        'El mapa vuelve el mes entrante, o súbelo en Configuración › Domicilios.');
      return;
    }
    if (fallo || !blob) {
      cont.innerHTML = aviso('No se pudo cargar el mapa.', 'Revisa tu conexión e intenta otra vez.');
      return;
    }

    var src = URL.createObjectURL(blob);
    var c = proyectar(centro.lat, centro.lng, zoom);

    var marcas = puntos.map(function (p) {
      var q = proyectar(p.lat, p.lng, zoom);
      var x = ancho / 2 + (q.x - c.x);
      var y = alto / 2 + (q.y - c.y);
      //  Un punto que caiga fuera de la imagen no se dibuja: quedaria
      //  pegado al borde diciendo una mentira sobre donde esta.
      if (x < 0 || y < 0 || x > ancho || y > alto) return '';
      /* EN PORCENTAJE, NO EN PIXELES.

         Con pixeles, el alfiler se ubica segun el tamaNo que le PEDIMOS a
         Google; pero si el recuadro termina mostrandose mas angosto —porque
         el panel que lo contiene es mas chico, o por un borde de un pixel—,
         la imagen se encoge y los alfileres NO. Medido: pedimos 620 de ancho
         y se mostraron 598. Eso corre cada punto un 3,5%, que a este zoom son
         unos 15 metros: el domiciliario tocando en la casa de al lado.

         En porcentaje, el alfiler se encoge junto con la imagen y siempre cae
         en el mismo punto del mapa, mida lo que mida el recuadro. */
      return '<div style="position:absolute;left:' + (x / ancho * 100).toFixed(3) + '%;top:' + (y / alto * 100).toFixed(3) + '%;'
        + 'transform:translate(-50%,-50%);transition:left .8s linear,top .8s linear"'
        + ' data-mapa-pin="' + esc(p.tipo || 'destino') + '">'
        + svgPin(p.tipo)
        + (p.etiqueta
            ? '<div style="position:absolute;left:50%;top:34px;transform:translateX(-50%);'
              + 'white-space:nowrap;background:#fff;border:1px solid #ECEEF2;border-radius:7px;'
              + 'padding:2px 7px;font-size:10.5px;font-weight:700;color:#0F172A;'
              + 'box-shadow:0 1px 4px rgba(15,23,42,.18)">' + esc(p.etiqueta) + '</div>'
            : '')
        + '</div>';
    }).join('');

    /* EL RECUADRO MIDE EXACTAMENTE LO QUE SE LE PIDIO A GOOGLE.
       Antes iba a 'width:100%' con 'object-fit:cover': si el contenedor
       resultaba mas ancho que la imagen (Google no la da de mas de 640
       pixeles), el navegador la estiraba y recortaba... pero los alfileres
       se siguen ubicando con la cuenta original. O sea que el punto del
       cliente quedaria dibujado a media cuadra de donde de verdad esta,
       y nadie se daria cuenta mirando la pantalla. */
    cont.innerHTML =
      '<div style="position:relative;box-sizing:border-box;width:' + Math.round(ancho) + 'px;max-width:100%;'
      + 'aspect-ratio:' + Math.round(ancho) + '/' + alto + ';'
      + 'margin:0 auto;border-radius:14px;'
      + 'overflow:hidden;border:1px solid #ECEEF2;background:#F1F5F9">'
      + '<img src="' + src + '" alt="Mapa" style="width:100%;height:100%;display:block">'
      + marcas
      + '</div>';

    //  El navegador ya tiene la imagen; se suelta la referencia para no
    //  dejar memoria colgada cada vez que se repinta.
    var img = cont.querySelector('img');
    if (img) img.onload = function () { URL.revokeObjectURL(src); };

    return { centro: centro, zoom: zoom, ancho: ancho, alto: alto };
  }

  function aviso(titulo, sub) {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:7px;text-align:center;padding:34px 22px;border:1.5px dashed #DCE0E8;border-radius:14px;'
      + 'background:#FBFBFD;min-height:150px">'
      + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
      + '<div style="font-size:13px;font-weight:700;color:#475569">' + esc(titulo) + '</div>'
      + '<div style="font-size:12px;color:#94A3B8;line-height:1.6;max-width:280px">' + esc(sub) + '</div>'
      + '</div>';
  }

  /* ── Dónde queda una dirección ───────────────────────────────────────
     Pregunta al servidor, que mira PRIMERO lo que ya se sabe. A Google
     solo se le pregunta —y se le paga— por una direccion nueva. */
  /* `conjunto` va aparte a proposito: es el dato que Google encuentra por
     nombre, y mandarlo revuelto con el barrio obligaba al servidor a adivinar
     cual de los dos era un nombre propio. */
  async function ubicar(direccion, barrio, ciudad, conjunto) {
    var sb = cliente();
    if (!sb) return null;
    var ses = await sb.auth.getSession();
    var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
    if (!tok) return null;
    try {
      var r = await fetch(SB_URL + '/functions/v1/mapa', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'geocodificar', direccion: direccion, barrio: barrio, ciudad: ciudad, conjunto: conjunto || '' })
      });
      var j = await r.json();
      if (j && isFinite(j.lat) && isFinite(j.lng)) return j;
      return j || null;
    } catch (e) { return null; }
  }

  /* ── Por dónde va un domiciliario ─────────────────────────────────── */
  async function ultimaUbicacion(domiciliarioId) {
    var sb = cliente();
    if (!sb || !domiciliarioId) return null;
    var r = await sb.from('pos_domi_ubicaciones')
      .select('lat,lng,created_at')
      .eq('domiciliario_id', domiciliarioId)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    return (r && r.data) || null;
  }

  w.posMapa = {
    pintar: pintar,
    ubicar: ubicar,
    ultimaUbicacion: ultimaUbicacion,
    proyectar: proyectar
  };
})(window);

;
/* ═══════ pos-traspaso.js ═══════ */
;/* pos-traspaso.js — Pasar un pedido de una pantalla a otra sin rearmarlo.
 *
 * Sergio, 28-ago-2026: «el cliente me dice dame x producto, yo lo atiendo en
 * la mesa, y de un momento a otro me dice no, mejor dámelo para llevar. Me
 * toca salirme, pierdo todo lo que había seleccionado, y volver a meterme».
 *
 * Uso:
 *   posTraspaso.abrir({ origen:'mesa', etiqueta:'Mesa 3', items:[...],
 *                       total:55000, alSalir:fn });      // muestra el menú
 *   posTraspaso.recoger('llevar');                        // al cargar la otra
 */
(function (w) {
  'use strict';

  var LLAVE = 'pos.traspaso.v1';
  /*  QUINCE MINUTOS. Un traspaso es un gesto de un momento: se toca aquí y se
      llega allá en dos segundos. Si algo queda guardado más tiempo del que
      dura un cambio de pantalla, ya no es un traspaso — es basura que un día
      va a aparecer sola en medio de otra venta.                            */
  var VIDA_MS = 15 * 60 * 1000;

  var DESTINOS = {
    mesa:      { pagina: 'ventas.html',      nombre: 'Mesa',        sub: 'eliges la mesa' },
    llevar:    { pagina: 'venta-rapida.html', nombre: 'Para llevar', sub: 'cobras y listo' },
    domicilio: { pagina: 'domicilios.html',   nombre: 'Domicilio',   sub: 'te pide la dirección' },
  };

  function cop(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /*  ══ EL FORMATO COMÚN ═════════════════════════════════════════════════
      Las tres pantallas guardan la comanda distinto: mesas usa `unitPrice` y
      `wip`, venta rápida usa `price` y mete el id de la LÍNEA en `id`, y
      domicilios usa `price` pero mete el id del PRODUCTO en `id`. Nacieron
      en momentos distintos y cada una resolvió lo suyo.

      Traducir de cualquiera a cualquiera serían seis conversiones, y seis
      sitios donde se pierde una adición. Con un formato en medio son tres de
      ida y tres de vuelta, y —lo que importa— hay UN solo sitio donde mirar
      cuando algo no llegue.

      Lo que viaja es el estado CRUDO del modal (`pres`, `vars`, `mods`), no
      el texto ya armado: de ahí las tres pueden reconstruir su propia forma,
      incluido el nombre. Mandar solo el nombre pintado haría que el pedido
      se viera bien y llegara vacío a la cocina.                            */
  function normalizar(it) {
    if (!it) return null;
    var pres = it.pres || (it.wip && it.wip.presId ? { id: it.wip.presId, name: (it.selections && it.selections.pres) || '' } : null);
    if (!pres && it.presId) pres = { id: it.presId, name: (it.selections && it.selections.pres) || '' };
    return {
      productId: it.productId || it.product_id || it.id || null,
      name:      it.name || '',
      qty:       Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice != null ? it.unitPrice : it.price) || 0,
      note:      it.note || '',
      modSummary: it.modSummary || '',
      catId:     it.catId || it.category_id || null,
      catName:   it.catName || '',
      catColor:  it.catColor || '#94A3B8',
      pres:      pres,
      vars:      (it.vars || (it.wip && it.wip.vars) || (it.selections && it.selections.vars) || {}),
      mods:      (it.mods || (it.wip && it.wip.mods) || (it.selections && it.selections.mods) || {}),
    };
  }

  /*  Y de vuelta, a la forma de cada pantalla. Cada una es fiel a lo que esa
      pantalla ya construye cuando alguien agrega un producto a mano — se
      copió de ahí a propósito: si el traspaso inventara su propia forma,
      funcionaría hasta el día que alguien cambie el modal.                 */
  function aMesa(n) {
    var presLabel = (n.pres && n.pres.name) || '';
    return {
      id: null, lineId: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      productId: n.productId, name: n.name, qty: n.qty, unitPrice: n.unitPrice,
      catColor: n.catColor, modSummary: n.modSummary, note: n.note, forHere: true,
      wip: { presId: (n.pres && n.pres.id) || null, vars: n.vars, mods: n.mods },
      selections: { pres: presLabel || null, vars: n.vars, mods: n.mods },
    };
  }
  function aLlevar(n) {
    var presLabel = (n.pres && n.pres.name) || '';
    var lineId = 'vr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    return {
      /*  Ojo: aquí `id` es el de la LÍNEA y el producto va aparte. En
          domicilios es al revés. Confundirlos deja la venta sin descontar
          inventario, que no se ve hasta el cierre del mes.                */
      id: lineId, productId: n.productId,
      presId: (n.pres && n.pres.id) || null,
      name: n.name, price: n.unitPrice, qty: n.qty,
      note: n.note, modSummary: n.modSummary,
      catId: n.catId, catName: n.catName, catColor: n.catColor,
      fav: false, fromModal: true,
      selections: { pres: presLabel || null, vars: n.vars, mods: n.mods },
    };
  }
  function aDomicilio(n) {
    return {
      lineId: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      id: n.productId, name: n.name, price: n.unitPrice, qty: n.qty,
      catName: n.catName, catColor: n.catColor,
      note: n.note, modSummary: n.modSummary,
      pres: n.pres, vars: n.vars, mods: n.mods,
    };
  }

  var HACIA = { mesa: aMesa, llevar: aLlevar, domicilio: aDomicilio };

  /* ── Guardar y recoger ──────────────────────────────────────────────── */
  function guardar(destino, datos) {
    var paquete = {
      destino: destino,
      origen: datos.origen || '',
      etiqueta: datos.etiqueta || '',
      cliente: datos.cliente || null,
      items: (datos.items || []).map(normalizar).filter(Boolean),
      en: Date.now(),
    };
    try { localStorage.setItem(LLAVE, JSON.stringify(paquete)); return true; }
    catch (e) { return false; }
  }

  /*  Recoger BORRA. Un traspaso se usa una vez: si se quedara guardado, el
      pedido volvería a aparecer la próxima vez que se abra la pantalla — y
      esa vez nadie lo está esperando.                                      */
  function recoger(pantalla) {
    var crudo;
    try { crudo = localStorage.getItem(LLAVE); } catch (e) { return null; }
    if (!crudo) return null;
    var p;
    try { p = JSON.parse(crudo); } catch (e) { limpiar(); return null; }
    if (!p || p.destino !== pantalla) return null;
    if (!p.en || (Date.now() - p.en) > VIDA_MS) { limpiar(); return null; }
    limpiar();
    var conv = HACIA[pantalla];
    if (!conv) return null;
    return {
      origen: p.origen, etiqueta: p.etiqueta, cliente: p.cliente,
      items: (p.items || []).map(conv),
    };
  }

  function limpiar() { try { localStorage.removeItem(LLAVE); } catch (e) {} }

  /*  Mirar SIN consumir. La pantalla de mesas no recibe el pedido — lo recibe
      `tomar-pedido` cuando se elige la mesa— pero tiene que poder decir por
      que se llego ahi. Sin este aviso, elegir «Mesa» lleva a una pantalla de
      mesas igual a siempre y parece que no paso nada.                     */
  function hay(pantalla) {
    try {
      var p = JSON.parse(localStorage.getItem(LLAVE) || 'null');
      if (!p || p.destino !== pantalla) return null;
      if (!p.en || (Date.now() - p.en) > VIDA_MS) return null;
      return { origen: p.origen, etiqueta: p.etiqueta, n: (p.items || []).length };
    } catch (e) { return null; }
  }

  /* ── El menú ────────────────────────────────────────────────────────── */
  var ICONOS = {
    mesa: '<path d="M3 10h18M5 10v10M19 10v10M8 4h8l2 6H6z"/>',
    llevar: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    domicilio: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-6l-2-9h-3"/><path d="M9 8.5h7l2 9"/>',
  };

  function abrir(cfg) {
    cerrar();
    var items = cfg.items || [];
    var total = cfg.total != null ? cfg.total
      : items.reduce(function (s, i) { return s + (Number(i.unitPrice != null ? i.unitPrice : i.price) || 0) * (Number(i.qty) || 1); }, 0);
    var n = items.reduce(function (s, i) { return s + (Number(i.qty) || 1); }, 0);

    var ov = document.createElement('div');
    ov.className = 'tr-ov';
    ov.id = 'tr-ov';

    var filas = Object.keys(DESTINOS).map(function (k) {
      var d = DESTINOS[k];
      var aqui = k === cfg.origen;
      return '<button type="button" class="tr-op' + (aqui ? ' aqui' : '') + '"'
        + (aqui ? ' disabled' : ' data-destino="' + k + '"') + '>'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + ICONOS[k] + '</svg>'
        + '<span><b>' + esc(aqui && cfg.etiqueta ? cfg.etiqueta : d.nombre) + '</b>'
        + '<small>' + esc(aqui ? 'donde está ahora' : d.sub) + '</small></span>'
        + (aqui
          ? '<svg class="tr-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg class="tr-mas" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>')
        + '</button>';
    }).join('');

    ov.innerHTML = '<div class="tr-caja" role="dialog" aria-modal="true">'
      + '<div class="tr-tit">Pasar el pedido a</div>'
      + '<div class="tr-sub">' + n + (n === 1 ? ' ítem' : ' ítems') + ' · ' + cop(total)
      + ' — se van todos, con sus tamaños, adiciones y notas.</div>'
      + '<div class="tr-ops">' + filas + '</div>'
      + (cfg.aviso ? '<div class="tr-aviso">' + esc(cfg.aviso) + '</div>' : '')
      + '<div class="tr-pie"><button type="button" class="tr-cancelar">Cancelar</button></div>'
      + '</div>';

    ov.addEventListener('click', function (e) {
      if (e.target === ov) { cerrar(); return; }
      var b = e.target.closest ? e.target.closest('[data-destino]') : null;
      if (!b) {
        if (e.target.closest && e.target.closest('.tr-cancelar')) cerrar();
        return;
      }
      var destino = b.getAttribute('data-destino');
      if (!guardar(destino, { origen: cfg.origen, etiqueta: cfg.etiqueta, items: items, cliente: cfg.cliente })) return;
      /*  El aviso al salir es de quien lo abrió: solo esa pantalla sabe si
          tiene que soltar la mesa, borrar su copia guardada o no hacer nada. */
      try { if (typeof cfg.alSalir === 'function') cfg.alSalir(destino); } catch (err) {}
      w.location.href = DESTINOS[destino].pagina;
    });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(ov);
  }

  function tecla(e) { if (e.key === 'Escape') cerrar(); }
  function cerrar() {
    document.removeEventListener('keydown', tecla);
    var ov = document.getElementById('tr-ov');
    if (ov) ov.remove();
  }

  w.posTraspaso = { abrir: abrir, cerrar: cerrar, recoger: recoger, hay: hay, limpiar: limpiar, guardar: guardar };
})(window);

;