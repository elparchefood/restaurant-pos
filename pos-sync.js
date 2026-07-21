/**
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
