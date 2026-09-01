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
      /*  Cuando hay algo ATASCADO el aviso se puede tocar: abre la lista de
          lo que no subio. Y late, porque es lo unico de esta barra que exige
          que alguien haga algo.                                            */
      #pos-sync-pill.tocable { pointer-events: auto; cursor: pointer; animation: posSyncLatido 2s ease-in-out infinite; }
      @keyframes posSyncLatido { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.04); } }
      @media (prefers-reduced-motion: reduce) { #pos-sync-pill.tocable { animation: none; } }

      #pos-sync-fondo {
        position: fixed; inset: 0; z-index: 100000; background: rgba(15,23,42,.42);
        display: flex; align-items: center; justify-content: center; padding: 20px;
        font: 400 13px/1.5 system-ui, sans-serif;
      }
      #pos-sync-panel {
        background: #fff; color: #0F172A; border-radius: 16px; width: 560px;
        max-width: 100%; max-height: 82vh; display: flex; flex-direction: column;
        overflow: hidden; box-shadow: 0 30px 70px -20px rgba(15,23,42,.45);
      }
      #pos-sync-panel h3 { margin: 0 0 4px; font-size: 16px; font-weight: 800; }
      #pos-sync-panel .sub { color: #64748B; font-size: 12.5px; }
      #pos-sync-panel .cab { padding: 18px 20px 14px; border-bottom: 1px solid #ECEEF2; }
      #pos-sync-panel .lista { overflow-y: auto; padding: 8px 20px; }
      #pos-sync-panel .fila { padding: 11px 0; border-bottom: 1px solid #F1F5F9; }
      #pos-sync-panel .fila b { font-size: 13.5px; }
      #pos-sync-panel .fila .det { color: #64748B; font-size: 11.5px; margin-top: 2px; }
      #pos-sync-panel .fila .err { color: #B91C1C; font-size: 11px; margin-top: 3px; word-break: break-word; }
      #pos-sync-panel .pie { padding: 14px 20px; border-top: 1px solid #ECEEF2; display: flex; gap: 8px; justify-content: flex-end; }
      #pos-sync-panel button {
        font: 700 12.5px/1 system-ui, sans-serif; padding: 10px 15px;
        border-radius: 9px; border: 1px solid #ECEEF2; background: #fff;
        color: #475569; cursor: pointer;
      }
      #pos-sync-panel button.pri { background: #5B6BFF; border-color: #5B6BFF; color: #fff; }
    `;
    document.head.appendChild(style);
    const bar  = document.createElement('div'); bar.id  = 'pos-sync-bar';
    const pill = document.createElement('div'); pill.id = 'pos-sync-pill';
    document.body.appendChild(bar);
    document.body.appendChild(pill);
  }

  /*  ══ EN UNA PANTALLA PÚBLICA NO SE AVISA NADA ═══════════════════════════

      Sergio, 29-ago-2026: se le fue el internet y en la pantalla de entrar
      apareció «Sin conexión — los pedidos se guardan localmente». Ahí no hay
      pedidos ni hay nadie: la mayoría de quien abre esa página **todavía no se
      ha registrado**. Hablarle de pedidos guardados a alguien que viene a
      comprar es hablarle de un problema que no tiene.

      El aviso es de la cola de escritura, y la cola solo existe cuando alguien
      está trabajando. Estas pantallas no escriben nada, así que no tienen nada
      que avisar.

      `pos-sync.js` va dentro de pos-nucleo.js y lo carga TODA la plataforma,
      login incluido. Por eso el filtro va aquí y no en cada pantalla: una
      lista de excepciones repartida por veinte archivos se rompe con la
      pantalla veintiuno.                                                     */
  var PUBLICAS = ['login', 'terms', 'privacy', 'data-deletion'];
  function _esPublica() {
    try {
      var ruta = String(window.location.pathname || '').toLowerCase();
      return PUBLICAS.some(function (p) { return ruta.indexOf(p) >= 0; });
    } catch (e) { return false; }
  }

  function _ui(mode, count) {
    if (_esPublica()) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => _ui(mode, count)); return; }
    _ensureUI();
    const bar  = document.getElementById('pos-sync-bar');
    const pill = document.getElementById('pos-sync-pill');
    if (!bar || !pill) return;

    const colors = { offline: '#F59E0B', syncing: '#5B6BFF', online: '#22C55E', error: '#EF4444', atascado: '#DC2626' };
    const msgs   = {
      offline: '● Sin conexión — los pedidos se guardan localmente',
      syncing: `↑ Sincronizando ${count || ''} operacion${count === 1 ? '' : 'es'}…`,
      online:  '✓ Conexión restablecida',
      error:   `⚠ ${count || 1} operacion${count === 1 ? '' : 'es'} no se pudieron sincronizar`,
      /*  ATASCADO es distinto de ERROR: error = fallo pero se sigue
          intentando; atascado = se rindió y ahí está, guardada, esperando a
          que alguien la mire. Por eso este aviso no desaparece solo.      */
      atascado: `⚠ ${count || 1} ${count === 1 ? 'venta no subió' : 'ventas no subieron'} — toca aquí`
    };

    bar.style.background   = colors[mode];
    bar.style.opacity      = mode === 'online' ? '0' : '1';
    pill.style.background  = colors[mode];
    pill.textContent       = msgs[mode];
    pill.style.opacity     = '1';

    /*  Solo el aviso de atascado se puede tocar, y es el unico que se queda
        puesto. Los demas son informativos y se van solos.                 */
    pill.classList.toggle('tocable', mode === 'atascado');
    pill.onclick = (mode === 'atascado') ? _verAtascados : null;

    if (mode === 'online') {
      setTimeout(() => { pill.style.opacity = '0'; }, 2500);
    }
    if (mode === 'error') {
      setTimeout(() => { pill.style.opacity = '0'; }, 5000);
    }
    //  'atascado' NO lleva setTimeout: se queda hasta que se resuelva.
  }

  /* ══════════════════════════════════════════
     Lo que no subió — la lista y el reintento
  ══════════════════════════════════════════ */

  /*  Con lo suficiente para volver a escribirlo A MANO si no hay forma de
      subirlo: qué era, cuánto, cuántos productos y a qué hora.            */
  function _describir(e) {
    if (e.type === 'order_batch') {
      const o = e.orderData || {};
      const n = (e.itemsData || []).length;
      const total = Number(o.total_final != null ? o.total_final : o.total) || 0;
      const plata = '$' + total.toLocaleString('es-CO', { maximumFractionDigits: 0 });
      return { que: 'Pedido de ' + plata, det: n + (n === 1 ? ' producto' : ' productos') +
               (o.customer_name ? ' · ' + o.customer_name : '') };
    }
    const plata = (v) => '$' + (Number(v) || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
    const d = e.data || {};

    /*  LA PLATA VA PRIMERO Y CON SU CIFRA. Un cobro que no subió es lo más
        grave de esta lista, y el cajero necesita saber CUÁNTO para poder
        cuadrar: "Alta en pos_payments" no le sirve de nada.                */
    if (e.table === 'pos_payments') {
      return { que: 'Un cobro de ' + plata(d.amount),
               det: (d.method ? String(d.method) + ' · ' : '') + 'no quedó registrado en la caja' };
    }
    if (e.table === 'pos_cash_moves') {
      return { que: (d.type === 'egreso' ? 'Un gasto de ' : 'Un ingreso de ') + plata(d.amount),
               det: d.concepto || d.nota || 'movimiento de caja' };
    }
    if (e.table === 'pos_orders') {
      const t = d.total_final != null ? d.total_final : d.total;
      return { que: t != null ? 'Un pedido de ' + plata(t) : 'Un cambio en un pedido',
               det: d.customer_name || d.status || 'pedido' };
    }

    const acciones = { insert: 'Se creó', update: 'Se cambió', upsert: 'Se guardó', delete: 'Se borró' };
    const tablas = {
      pos_order_items: 'los productos de un pedido', pos_tables: 'una mesa',
      pos_clientes: 'un cliente', pos_sessions: 'un turno de caja',
      pos_puntos_movimientos: 'unos puntos de un cliente',
    };
    return {
      que: (acciones[e.op] || e.op) + ' ' + (tablas[e.table] || e.table),
      det: 'no llegó al servidor',
    };
  }

  function _cuando(ts) {
    try {
      return new Date(ts).toLocaleString('es-CO',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function _cerrarPanel() {
    const f = document.getElementById('pos-sync-fondo');
    if (f) f.remove();
  }

  async function _verAtascados() {
    _cerrarPanel();
    const filas = await _idbGetAll('queue', 'status', 'atascado');
    _ensureUI();

    const fondo = document.createElement('div');
    fondo.id = 'pos-sync-fondo';
    const cuerpo = filas.sort((a, b) => a.qid - b.qid).map(function (e) {
      const d = _describir(e);
      return '<div class="fila"><b>' + d.que + '</b>'
           + '<div class="det">' + d.det + ' · ' + _cuando(e.timestamp) + '</div>'
           + (e.ultimoError ? '<div class="err">' + String(e.ultimoError).slice(0, 160) + '</div>' : '')
           + '</div>';
    }).join('');

    fondo.innerHTML =
      '<div id="pos-sync-panel">'
      + '<div class="cab"><h3>Esto no se pudo guardar en el servidor</h3>'
      + '<div class="sub">Está a salvo en este equipo. No se ha perdido nada, pero '
      + 'todavía no está en el sistema: no aparece en ventas ni en la caja.</div></div>'
      + '<div class="lista">' + (cuerpo || '<div class="fila">Ya no queda nada atascado.</div>') + '</div>'
      + '<div class="pie">'
      + '<button id="pos-sync-cerrar">Cerrar</button>'
      + (filas.length ? '<button class="pri" id="pos-sync-reintentar">Intentar de nuevo</button>' : '')
      + '</div></div>';

    document.body.appendChild(fondo);
    fondo.addEventListener('click', function (ev) { if (ev.target === fondo) _cerrarPanel(); });
    const bC = document.getElementById('pos-sync-cerrar');
    if (bC) bC.onclick = _cerrarPanel;
    const bR = document.getElementById('pos-sync-reintentar');
    if (bR) bR.onclick = async function () {
      bR.disabled = true; bR.textContent = 'Intentando…';
      await _reintentarAtascados();
      _cerrarPanel();
    };
  }

  /*  Vuelven a la cola. El contador de fallos se pone a cero: si se reintenta
      es porque algo cambió (volvió el internet, se arregló el dato).       */
  async function _reintentarAtascados() {
    const filas = await _idbGetAll('queue', 'status', 'atascado');
    for (const e of filas) {
      await _idbPut('queue', { ...e, status: 'pending', failCount: 0 });
    }
    if (filas.length) await _syncNow();
    return filas.length;
  }

  async function _avisarSiHayAtascados() {
    const filas = await _idbGetAll('queue', 'status', 'atascado');
    if (filas.length) _ui('atascado', filas.length);
    return filas.length;
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
    /*  Nace con la cocina apagada cuando trae comida: se enciende en el paso
        2, cuando los platos ya están dentro. Un pedido que no trae productos
        (no debería existir) conserva lo que traiga, para no cambiarle nada. */
    const _avisarCocina = !!orderPayload.visible_cocina
                       && !!(entry.itemsData && entry.itemsData.length);
    if (_avisarCocina) orderPayload.visible_cocina = false;

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

    /*  2. LOS PRODUCTOS. ⚠️ NO SE DA POR HECHO QUE YA ESTEN (29-ago-2026).

        Aquí decía: «solo si la orden es nueva; en retry, asumimos que ya
        existen». Esa suposición es justo la contraria de lo que pasa.

        Lo que ocurre de verdad: el botón encola el pedido y navega de una
        —para eso se hizo, para que responda al instante—. La subida arranca
        por detrás, mete el PEDIDO, y el cambio de página mata la petición
        antes de que entren los PRODUCTOS. La cola queda pendiente y la
        siguiente pantalla la reintenta: el pedido choca con el suyo propio
        (23505), se marcaba «ya existía»... y los productos no se mandaban
        nunca más.

        Resultado: un pedido con precio y sin comida, que además sacaba una
        comanda vacía por la impresora. Le pasó a Sergio y a Mónica toda la
        noche del 29-ago, y era intermitente porque depende de si a la subida
        le da tiempo o no antes de que cambie la pantalla.

        Ahora, si el pedido ya estaba, se PREGUNTA si tiene productos. Solo
        se saltan si de verdad hay alguno.                                  */
    let faltanItems = !orderAlreadyExisted;
    if (orderAlreadyExisted) {
      const { data: yaHay, error: leerErr } = await sb
        .from('pos_order_items').select('id').eq('order_id', realOrderId).limit(1);
      //  Si no se puede comprobar, se deja pendiente y se reintenta luego:
      //  mandarlos a ciegas duplicaría la comida de un pedido bueno.
      if (leerErr) throw leerErr;
      faltanItems = !(yaHay && yaHay.length);
    }

    if (faltanItems) {
      const items = entry.itemsData.map(item => {
        const it = { ...item };
        if (it.order_id === tempId) it.order_id = realOrderId;
        return it;
      });
      if (items.length > 0) {
        const { error: itemsErr } = await sb.from('pos_order_items').insert(items);
        if (itemsErr && itemsErr.code !== '23505') throw itemsErr;
        /*  La cocina se entera cuando HAY COMIDA, no antes.

            El pedido se inserta con la marca de cocina apagada (más abajo, en
            el paso 1) y se enciende aquí, ya con los platos dentro. Así la
            impresora no puede volver a sacar una comanda en blanco ni la
            pantalla de cocina mostrar un pedido sin nada que cocinar.     */
        if (_avisarCocina) {
          try { await sb.from('pos_orders').update({ visible_cocina: true }).eq('id', realOrderId); }
          catch (e) { console.warn('[posSync] no se pudo avisar a cocina:', e); }
        }
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
      let failed = 0, atascadas = 0;
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
            /*  ⚠️ AQUI SE BORRABA LA VENTA. Textualmente: «descartar
                operaciones que fallan repetidamente para no bloquear la cola»
                + `_idbDelete`. El motivo era bueno —una entrada rota atasca a
                las de atras— pero borrar es lo unico que no se puede
                deshacer, y el unico aviso era un `console.error` que en una
                caja no lee nadie.

                Ahora pasa a `atascado`: deja de bloquear la cola igual que
                antes (la cola solo recoge las `pending`), pero SIGUE GUARDADA
                en el equipo, con su error y su hora, y sale un aviso rojo que
                no se va hasta que alguien lo mire.                        */
            await _idbPut('queue', {
              ...entry,
              status: 'atascado',
              failCount: retries,
              ultimoError: e && e.message ? e.message : String(e),
              atascadoAt: Date.now(),
            });
            console.error('[posSync] Entrada', entry.qid, 'ATASCADA (guardada, no perdida):', e.message);
            atascadas++;
          } else {
            await _idbPut('queue', { ...entry, failCount: retries });
            failed++;
          }
        }
      }

      /*  El aviso de atascado manda sobre los demas: es el unico que pide que
          alguien haga algo. Y se cuentan TODAS las atascadas, no solo las de
          esta pasada, porque las de antes tampoco se han resuelto.        */
      if (atascadas > 0)      await _avisarSiHayAtascados();
      else if (failed === 0)  { if (!(await _avisarSiHayAtascados())) _ui('online'); }
      else                    _ui('error', failed);
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
    /*  Lo que se atasco durante el corte se vuelve a intentar solo: la causa
        normal de atascarse es justo el corte que acaba de terminar.       */
    await _reintentarAtascados();
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
    /*  Lo atascado se avisa SIEMPRE, en cada pantalla que se abra, aunque no
        haya nada pendiente. Un aviso que se ve una sola vez y se pierde al
        cambiar de pantalla no sirve de aviso.                             */
    await _avisarSiHayAtascados();
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

    /*  ── Lo que se rindió ────────────────────────────────────────────────
        `atascado` = falló 5 veces y dejó de intentarlo. NO está perdido:
        sigue guardado en el equipo. Estas tres son para que cualquier
        pantalla pueda enseñarlo o reintentarlo.                          */

    /** Cuántas ventas no lograron subir */
    async stuckCount() {
      const rows = await _idbGetAll('queue', 'status', 'atascado');
      return rows.length;
    },

    /** Qué no logró subir, ya descrito en palabras */
    async stuckList() {
      const rows = await _idbGetAll('queue', 'status', 'atascado');
      return rows.sort((a, b) => a.qid - b.qid).map(function (e) {
        const d = _describir(e);
        return { qid: e.qid, que: d.que, detalle: d.det, cuando: e.timestamp, error: e.ultimoError };
      });
    },

    /** Devolverlas a la cola y volver a intentarlo */
    retryStuck: _reintentarAtascados,

    /** Abrir la lista de lo que no subió */
    showStuck: _verAtascados,

    /** Forzar sincronización manual */
    syncNow: _syncNow
  };

})();
