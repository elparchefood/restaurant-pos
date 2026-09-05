/* historial.js — Lógica del módulo Historial de pedidos */
/* Stack: Vanilla JS + Supabase PostgREST */

/* ─── Estado global ─── */
const HS = {
  orders:     [],
  filtered:   [],
  items:      {},   /* orderId → [items] */
  users:      {},   /* userId  → name    */
  tables:     {},   /* tableId → name    */
  range:      'today',
  canal:      'all',
  query:      '',
  selectedId: null,
  branchId:   null,
  feOn:       false,   //  esta sede emite factura electronica
  fac:        null,    //  la factura del pedido abierto
  facPudo:    false,   //  se pudo PREGUNTAR (distinto de "no tiene")
  hfPedido:   null,
  hfModo:     null,
};

/* ─── Helpers ─── */
/*  ⚠️ AQUI ESTABA `function COPF(...)`, Y TUMBABA LA PANTALLA ENTERA.

    El nucleo ya declara `const COPF` (pos-core.js). Declararla otra vez aqui,
    en el mismo ambito global, no es un aviso: es un SyntaxError — y el
    navegador descarta el ARCHIVO COMPLETO. Por eso el historial se quedaba en
    "Cargando pedidos..." para siempre y sin un solo error visible: no es que
    la consulta fallara, es que este archivo nunca llego a ejecutarse.

    Se usa la del nucleo, que ademas es la que usa el resto del producto.  */

function todayRange() {
  const s = new Date(); s.setHours(0,0,0,0);
  const e = new Date(); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function yesterdayRange() {
  const s = new Date(); s.setDate(s.getDate()-1); s.setHours(0,0,0,0);
  const e = new Date(); e.setDate(e.getDate()-1); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function last7Range() {
  const s = new Date(); s.setDate(s.getDate()-6); s.setHours(0,0,0,0);
  const e = new Date(); e.setHours(23,59,59,999);
  return { start: s.toISOString(), end: e.toISOString() };
}
function getRange() {
  if (HS.range === 'yesterday') return yesterdayRange();
  if (HS.range === '7d') return last7Range();
  return todayRange();
}
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day:'2-digit', month:'short' });
}
function highlight(text, q) {
  if (!q || !text) return text || '';
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return String(text).replace(re, '<mark>$1</mark>');
}

/* ─── Carga de datos ─── */
async function loadOrders() {
  const { start, end } = getRange();
  let q = sb.from('pos_orders').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
  if (HS.branchId) q = q.eq('branch_id', HS.branchId);
  const { data } = await q;
  HS.orders = data || [];
}

async function loadUsers() {
  const { data } = await sb.from('pos_users').select('id, name, role');
  (data || []).forEach(u => { HS.users[u.id] = u.name; });
}

async function loadTables() {
  const { data } = await sb.from('pos_tables').select('id, name');
  (data || []).forEach(t => { HS.tables[t.id] = t.name; });
}

async function loadItems(orderId) {
  if (HS.items[orderId]) return;
  const { data } = await sb.from('pos_order_items').select('*').eq('order_id', orderId);
  HS.items[orderId] = data || [];
}

/* ─── Filtrar y buscar ─── */
function applyFilters() {
  let list = HS.orders.slice();

  /*  POR ESTADO. `entregado` no vive en `status` sino en la columna `estado`
      (y en `delivery_status` para los domicilios): un pedido entregado sigue
      con status 'paid'. Por eso se mira en los tres sitios — preguntar solo
      por `status` devolveria cero entregados y pareceria que no hay.        */
  if (HS.estado && HS.estado !== 'all') {
    list = list.filter(function (o) {
      if (HS.estado === 'entregado') {
        return String(o.estado || '') === 'entregado'
            || String(o.delivery_status || '') === 'entregado'
            || !!o.delivered_at;
      }
      if (HS.estado === 'paid') return o.status === 'paid' || o.status === 'completed';
      if (HS.estado === 'in_progress') return o.status === 'in_progress' || o.status === 'ready';
      return o.status === HS.estado;
    });
  }

  if (HS.canal !== 'all') {
    list = list.filter(o => {
      if (HS.canal === 'salon') return o.channel !== 'rapido' && o.channel !== 'domicilio';
      if (HS.canal === 'rapido') return o.channel === 'rapido';
      if (HS.canal === 'domicilio') return o.channel === 'domicilio';
      return true;
    });
  }

  const q = HS.query.trim().toLowerCase();
  if (q) {
    list = list.filter(o => {
      const waiter = (HS.users[o.waiter_id] || '').toLowerCase();
      const table  = (HS.tables[o.table_id] || '').toLowerCase();
      const client = (o.customer_name || '').toLowerCase();
      const turno  = ('Turno #' + String(o.turno || 0).padStart(3,'0')).toLowerCase();
      const canal  = (o.channel || '').toLowerCase();
      /* El MOVIL de Rapid (20-ago): "27" o "movil 27" trae los pedidos que
         llevo ese movil — el caso inverso de "¿que movil llevo este pedido?". */
      const movil  = o.domi_movil ? ('movil ' + String(o.domi_movil)).toLowerCase() : '';
      return waiter.includes(q) || table.includes(q) || client.includes(q) || turno.includes(q) || canal.includes(q) || (movil && movil.includes(q));
    });
  }

  HS.filtered = list;
}

/* ─── Render lista ─── */
function renderList() {
  applyFilters();
  const list = HS.filtered;
  const total = list.reduce((s, o) => s + (o.total || 0), 0);
  const rangeLabel = HS.range === 'today' ? 'HOY' : HS.range === 'yesterday' ? 'AYER' : '7 DÍAS';

  document.getElementById('hs-count').textContent = list.length + ' PEDIDOS · ' + rangeLabel;
  document.getElementById('hs-total').textContent = list.length ? COPF(total) : '';

  const q = HS.query.trim();
  const el = document.getElementById('hs-order-list');

  if (!list.length) {
    el.innerHTML = `<div class="hs-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
      <p>${q ? 'Sin resultados' : 'Sin pedidos'}</p>
      <span>${q ? 'Prueba con otra palabra clave' : 'No hay pedidos en este rango'}</span>
    </div>`;
    return;
  }

  el.innerHTML = list.map(o => {
    const isSelected = o.id === HS.selectedId;
    const waiter = HS.users[o.waiter_id] || '—';
    const table  = HS.tables[o.table_id];
    const label  = orderLabel(o, table);
    const canal  = canalBadge(o.channel);
    const status = statusBadge(o.status);

    return `<div class="hs-order${isSelected ? ' selected' : ''}" data-id="${o.id}">
      <div class="hs-order-head">
        <span class="hs-order-id">${highlight(label, q)}</span>
        <span class="hs-order-total">${COPF(o.total)}</span>
      </div>
      <div class="hs-order-meta">
        <span class="hs-order-time">${fmtTime(o.created_at)}</span>
        <span class="hs-order-sep">·</span>
        <span class="hs-order-waiter" title="${waiter}">${highlight(waiter, q)}</span>
      </div>
      <div class="hs-order-badges">${canal}${status}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('.hs-order').forEach(card => {
    card.addEventListener('click', () => selectOrder(card.dataset.id));
  });
}

function orderLabel(o, tableName) {
  if (o.channel === 'rapido') return 'Turno #' + String(o.turno || 0).padStart(3,'0');
  if (o.channel === 'domicilio') return o.customer_name ? 'Domicilio — ' + o.customer_name : 'Domicilio';
  return tableName ? tableName : (o.customer_name || 'Mesa');
}

function canalBadge(ch) {
  if (ch === 'rapido')    return '<span class="hs-badge hs-badge-rapido">Rápido</span>';
  if (ch === 'domicilio') return '<span class="hs-badge hs-badge-domicilio">Domicilio</span>';
  return '<span class="hs-badge hs-badge-salon">Salón</span>';
}

function statusBadge(st) {
  if (st === 'paid' || st === 'completed') return '<span class="hs-badge hs-badge-paid">Pagado</span>';
  if (st === 'cancelled')  return '<span class="hs-badge hs-badge-cancelled">Anulado</span>';
  if (st === 'pendiente_pago') return '<span class="hs-badge hs-badge-pendiente">Pendiente de pago</span>';
  if (st === 'in_progress' || st === 'ready') return '<span class="hs-badge hs-badge-inprogress">En preparación</span>';
  return '<span class="hs-badge hs-badge-cancelled">' + st + '</span>';
}

/* ─── Seleccionar pedido y mostrar detalle ─── */
async function selectOrder(id) {
  HS.selectedId = id;
  renderList();

  const o = HS.orders.find(x => x.id === id);
  if (!o) return;

  const detailEl = document.getElementById('hs-detail');
  detailEl.innerHTML = `<div class="hs-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Cargando detalle…</p></div>`;

  /*  Los dos van juntos: sin la factura, el detalle se pintaria una vez
      sin ella y otra con ella, y se veria el salto.                   */
  await Promise.all([loadItems(id), HS.feOn ? hsFacCargar(id) : Promise.resolve()]);
  renderDetail(o);
}

/*  El nombre llega como «Personal · Premium · Mixta»: el PRIMER trozo es
    siempre la presentación (Personal, Familiar, 1.5 Litros, Litro, Único),
    y el resto es el producto. Comprobado contra los 22 nombres más
    vendidos de El Parche, no supuesto.

    Puesto todo en una línea no se lee: la presentación pesa igual que el
    producto y hay que leer la frase entera para saber qué se vendió. Con
    el producto arriba y la presentación abajo, la columna se barre de un
    vistazo.

    Si un nombre no trae «·» se muestra tal cual: nunca se inventa nada. */
function splitProducto(nombre) {
  const partes = String(nombre || '').split('·').map(p => p.trim()).filter(Boolean);
  if (partes.length < 2) return { nombre: partes[0] || '—', presentacion: '' };
  return { nombre: partes.slice(1).join(' · '), presentacion: partes[0] };
}

function renderDetail(o) {
  const table  = HS.tables[o.table_id];
  const waiter = HS.users[o.waiter_id] || '';
  const label  = orderLabel(o, table);
  const items  = HS.items[o.id] || [];

  const canal  = o.channel === 'rapido' ? 'Venta rápida' : o.channel === 'domicilio' ? 'Domicilio' : 'Salón';
  const payMethod = o.payment_method ? fmtPayMethod(o.payment_method) : '—';
  const discount  = o.discount || 0;
  const unidades  = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);

  const dateLabel = HS.range === 'today' ? 'Hoy' : fmtDate(o.created_at);
  const tl = buildTimeline(o);

  document.getElementById('hs-detail').innerHTML = `
    <div class="hs-dhead">
      <div class="hs-dhead-l">
        <div class="hs-dchips">${canalBadge(o.channel)}${statusBadge(o.status)}</div>
        <div class="hs-dtitle">${label}</div>
        <div class="hs-dsub">
          <span>${dateLabel} ${fmtTime(o.created_at)}</span>
          ${waiter ? `<span class="hs-dsub-sep">·</span><span>${waiter}</span>` : ''}
          ${o.domi_movil ? `<span class="hs-dsub-sep">·</span><span style="color:#0F766E;font-weight:700">Móvil ${o.domi_movil}</span>` : ''}
        </div>
      </div>
      <div class="hs-dactions">
        <button class="btn-hs btn-hs-ghost" onclick="printComanda('${o.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Reimprimir comanda
        </button>
        <button class="btn-hs btn-hs-primary" onclick="printReceipt('${o.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
          Reimprimir recibo
        </button>
      </div>
    </div>

    <div class="hs-resumen">
      <div class="hs-res-total">
        <div class="hs-res-lbl">Total cobrado</div>
        <div class="hs-res-big">${COPF(o.total)}</div>
      </div>
      <div class="hs-res-dato">
        <div class="hs-res-lbl">Pago</div>
        <div class="hs-res-val">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6BFF" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          ${payMethod}
        </div>
      </div>
      <div class="hs-res-dato">
        <div class="hs-res-lbl">Descuento</div>
        <div class="hs-res-val${discount > 0 ? '' : ' flojo'}">${discount > 0 ? COPF(discount) : 'Sin descuento'}</div>
      </div>
      <div class="hs-res-dato">
        <div class="hs-res-lbl">Unidades</div>
        <div class="hs-res-val">${unidades || '—'}</div>
      </div>
    </div>

    <div class="hs-section">
      <div class="hs-section-title">Productos</div>
      ${items.length ? `
      <div class="hs-prods">
        ${items.map(i => {
          const p = splitProducto(i.product_name || i.name);
          const unit = Number(i.unit_price || i.product_price || 0);
          const cant = Number(i.quantity) || 1;
          const pie = [p.presentacion, unit ? COPF(unit) + ' c/u' : ''].filter(Boolean).join(' · ');
          return `
          <div class="hs-prod">
            <div class="hs-prod-qty">${cant}</div>
            <div class="hs-prod-nom">
              <div class="hs-prod-n">${p.nombre}</div>
              ${pie ? `<div class="hs-prod-d">${pie}</div>` : ''}
            </div>
            <div class="hs-prod-t">${COPF(i.total || 0)}</div>
          </div>`;
        }).join('')}
        <div class="hs-prod-total"><span>Total</span><span>${COPF(o.total)}</span></div>
      </div>` : '<div class="hs-prods-vacio">Sin ítems registrados</div>'}
    </div>

    ${hsFacHTML(o)}

    <div class="hs-section">
      <div class="hs-section-title">Cronología</div>
      <div class="hs-timeline">${tl}</div>
    </div>
  `;
}

/*  Los pasos son los MISMOS de siempre y en el mismo orden. Lo único que
    cambia es que la hora se guarda aparte del texto: con las horas en su
    propia columna se ve de un golpe cuánto tardó cada paso, que antes
    había que ir leyendo línea por línea.                                */
function buildTimeline(o) {
  const steps = [];

  steps.push({
    tono: 'gris', evento: 'Pedido creado',
    hora: fmtTime(o.created_at),
    detalle: HS.users[o.waiter_id] || '',
  });

  if (o.visible_cocina) {
    steps.push({ tono: 'ambar', evento: 'Enviado a cocina', hora: fmtTime(o.created_at), detalle: '' });
  }

  if (o.delivered_at) {
    const min = Math.round((new Date(o.delivered_at) - new Date(o.created_at)) / 60000);
    steps.push({
      tono: 'azul', evento: 'Entregado al cliente',
      hora: fmtTime(o.delivered_at),
      detalle: min > 0 ? min + ' min de preparación' : '',
    });
  }

  const isPaid = o.status === 'paid' || o.status === 'completed';
  const abonado = Number(o.paid_amount) || 0;
  if (!isPaid && abonado > 0 && o.status !== 'cancelled') {
    // Sin el domicilio: es lo que de verdad falta por cobrar.
    const faltaAb = Math.max(0, (Number(o.total) || 0) - (Number(o.delivery_fee) || 0) - abonado);
    steps.push({
      tono: 'verde', evento: 'Abono recibido', hora: '',
      detalle: COPF(abonado) + (faltaAb > 0 ? ' · faltan ' + COPF(faltaAb) : ''),
    });
  }
  if (isPaid) {
    steps.push({
      tono: 'verde', evento: 'Pago recibido',
      hora: fmtTime(o.updated_at || o.created_at),
      detalle: o.payment_method ? fmtPayMethod(o.payment_method) + ' · ' + COPF(o.total) : COPF(o.total),
    });
  } else if (o.status === 'pendiente_pago') {
    steps.push({ tono: 'ambar', evento: 'Pendiente de pago', hora: '', detalle: 'En espera de cobro' });
  } else if (o.status === 'cancelled') {
    steps.push({ tono: 'rojo', evento: 'Pedido anulado', hora: fmtTime(o.updated_at || o.created_at), detalle: '' });
  }

  return steps.map(s => `
    <div class="hs-tl-item">
      <div class="hs-tl-hora">${s.hora || ''}</div>
      <div class="hs-tl-left">
        <div class="hs-tl-dot ${s.tono}"></div>
        <div class="hs-tl-line"></div>
      </div>
      <div class="hs-tl-txt">
        <div class="hs-tl-event">${s.evento}</div>
        ${s.detalle ? `<div class="hs-tl-detalle">${s.detalle}</div>` : ''}
      </div>
    </div>`).join('');
}

function fmtPayMethod(m) {
  /* La regla vive en pos-metodos.js y es la misma para todas las pantallas:
     ids configurados, marcadores del sistema, claves viejas en ingles y texto
     libre del bot. Aqui habia una copia que se iba quedando atras. */
  try { if (window.posMetodos) return posMetodos.nombre(m); } catch (e) {}
  return m || 'Otros';
}

/* ─── Imprimir ─── */
function printComanda(orderId) {
  const o = HS.orders.find(x => x.id === orderId);
  if (!o) return;
  const items = HS.items[orderId] || [];
  const table = HS.tables[o.table_id];
  const label = orderLabel(o, table);
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Comanda</title><style>
    body{font-family:Arial,sans-serif;font-size:14px;padding:16px;}
    h2{font-size:16px;margin:0 0 4px;}
    .sub{font-size:12px;color:#555;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;}
    td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left;}
    th{font-size:11px;color:#999;text-transform:uppercase;}
    td:last-child{text-align:right;font-weight:bold;}
  </style></head><body>
    <h2>COMANDA — ${label}</h2>
    <div class="sub">${fmtTime(o.created_at)} · ${HS.users[o.waiter_id] || '—'}</div>
    <table><thead><tr><th>Producto</th><th>Cant.</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${i.product_name||'—'}</td><td>${i.quantity||1}</td></tr>`).join('')}
    </tbody></table>
  </body></html>`);
  w.document.close();
  w.print();
}

function printReceipt(orderId) {
  const o = HS.orders.find(x => x.id === orderId);
  if (!o) return;
  const items = HS.items[orderId] || [];
  const table = HS.tables[o.table_id];
  const label = orderLabel(o, table);
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>Recibo</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:16px;max-width:340px;}
    h2{font-size:15px;margin:0 0 2px;text-align:center;}
    .center{text-align:center;font-size:11px;color:#555;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;}
    td{padding:5px 2px;border-bottom:1px solid #f0f0f0;}
    td:last-child{text-align:right;font-weight:bold;}
    .total td{font-size:15px;font-weight:bold;border-top:2px solid #000;border-bottom:none;padding-top:8px;}
    .foot{margin-top:14px;font-size:11px;color:#777;text-align:center;}
  </style></head><body>
    <h2>${(function(){ try { return localStorage.getItem('pos.brand.restaurante') || 'Recibo'; } catch(e){ return 'Recibo'; } })()}</h2>
    <div class="center">${label} · ${fmtTime(o.created_at)}</div>
    <table><tbody>
    ${items.map(i => `<tr><td>${i.product_name||'—'} ×${i.quantity||1}</td><td>${COPF(i.total||0)}</td></tr>`).join('')}
    </tbody><tfoot><tr class="total"><td>TOTAL</td><td>${COPF(o.total)}</td></tr></tfoot></table>
    <div class="foot">Método de pago: ${fmtPayMethod(o.payment_method || '—')}<br>¡Gracias por su visita!</div>
  </body></html>`);
  w.document.close();
  w.print();
}

/* ─── UI: filtros y búsqueda ─── */
function bindFilters() {
  /* Chips de fecha */
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      HS.range = btn.dataset.range;
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      HS.selectedId = null;
      HS.items = {};
      loadAndRender();
    });
  });

  /* Canal dropdown */
  if (!HS.estado) HS.estado = 'all';
  const canalBtn = document.getElementById('btn-canal-filter');
  const canalDd  = document.getElementById('canal-dropdown');
  canalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    canalDd.classList.toggle('open');
  });
  document.addEventListener('click', () => canalDd.classList.remove('open'));
  /*  El de estado, con el mismo comportamiento que el de canal: se abre uno y
      se cierra el otro, para que no queden dos listas abiertas encima.     */
  const estBtn = document.getElementById('btn-estado-filter');
  const estDd  = document.getElementById('estado-dropdown');
  if (estBtn && estDd) {
    estBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      canalDd.classList.remove('open');
      estDd.classList.toggle('open');
    });
    document.addEventListener('click', () => estDd.classList.remove('open'));
    document.querySelectorAll('[data-estado]').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        HS.estado = opt.dataset.estado;
        document.querySelectorAll('[data-estado]').forEach(o => o.classList.remove('on'));
        opt.classList.add('on');
        estDd.classList.remove('open');
        //  El boton dice cual esta puesto: un filtro activo que no se ve es
        //  la forma mas facil de creer que faltan pedidos.
        estBtn.classList.toggle('on', HS.estado !== 'all');
        HS.selectedId = null;
        renderList();
      });
    });
  }

  document.querySelectorAll('[data-canal]').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      HS.canal = opt.dataset.canal;
      document.querySelectorAll('[data-canal]').forEach(o => o.classList.remove('on'));
      opt.classList.add('on');
      const label = opt.textContent.trim();
      canalBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>${HS.canal === 'all' ? 'Canal' : label}`;
      canalBtn.classList.toggle('on', HS.canal !== 'all');
      canalDd.classList.remove('open');
      renderList();
    });
  });

  /* Búsqueda */
  const searchInput = document.getElementById('hs-search');
  const searchClear = document.getElementById('hs-search-clear');
  searchInput.addEventListener('input', () => {
    HS.query = searchInput.value;
    searchClear.hidden = !HS.query;
    renderList();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    HS.query = '';
    searchClear.hidden = true;
    searchInput.focus();
    renderList();
  });
}

/* ─── Boot ─── */
async function loadAndRender() {
  document.getElementById('hs-order-list').innerHTML = `<div class="hs-empty">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    <p>Cargando…</p></div>`;
  await loadOrders();
  renderList();
}

document.addEventListener('DOMContentLoaded', async () => {
  /* Los pagos guardan el ID del metodo: para mostrarlo hay que traducirlo con
     la configuracion. Se carga una vez; si falla, fmtPayMethod tiene respaldo. */
  try {
    if (window.posMetodos && window._pos) {
      window._pos.on('core:ready', function(){ posMetodos.cargar(window._pos.sb, window._pos.state.branchId); });
    }
  } catch (e) {}
  /* Reloj */
  function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('sb-date');
    const timeEl = document.getElementById('sb-time');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('es-CO', { weekday:'short', day:'numeric', month:'short' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  /* Auth + branch */
  try {
//  getSession lee del equipo; getUser salia a internet por el mismo dato.
    let user = (window._pos && window._pos.state && window._pos.state.user) || null;
    if (!user) { try { user = (await sb.auth.getSession()).data.session.user; } catch (e) {} }
    //  A login, no a index.html: desde el 30-ago-2026 index.html es la
    //  pagina de venta de Cobra, no el POS. Mandar ahi a alguien que solo
    //  perdio la sesion es sacarlo del programa.
    if (!user) { location.href = 'login.html'; return; }

    const meta = user.user_metadata || {};
    const nombre = meta.nombre || meta.name || user.email || '—';
    const rol    = meta.role || 'Usuario';
    const initials = nombre.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

    document.getElementById('sb-user-name').textContent = nombre;
    document.getElementById('sb-role').textContent = rol;
    document.getElementById('sb-brand-name').textContent = 'Cobra POS';
    document.getElementById('tb-avatar').textContent = initials;
    document.getElementById('tb-user').textContent = nombre;
    document.getElementById('tb-role').textContent = rol;

    HS.branchId = meta.branch_id || null;
    if (HS.branchId) {
      const { data: branch } = await sb.from('branches').select('name').eq('id', HS.branchId).maybeSingle();
      // Nombre del restaurante en el sidebar: pos-brand.js.
    }
  } catch(e) {
    console.warn('auth:', e);
  }

  /* Datos de apoyo: solo NOMBRES para las etiquetas. Con allSettled, que una
     falle no deja el historial en blanco — a lo sumo una etiqueta sale con el
     id en vez del nombre, que es infinitamente mejor que una pantalla vacia. */
  (await Promise.allSettled([loadUsers(), loadTables()]))
    .forEach(function (r, i) {
      if (r.status === 'rejected') console.warn('[historial] carga de apoyo ' + i + ' fallo:', r.reason);
    });

  /*  Se pregunta UNA vez, no en cada pedido que se abre: es un dato de la
      sede, no del pedido.                                             */
  HS.feOn = await hsFacturacionOn();

  /* Vincular filtros */
  bindFilters();

  /* Carga inicial */
  await loadAndRender();
});

/*  ══ LA FACTURA ELECTRONICA DEL PEDIDO ══════════════════════════════════
    Aqui se ve en que quedo la factura de una venta, y se hacen las dos
    cosas que hay que poder hacer DESPUES de cobrar:

      · mandarsela al cliente que la pide luego ("¿me la envia al
        correo?"), y
      · facturar una venta que se cobro sin factura — que es exactamente
        lo que la caja le promete al cajero cuando la venta pasa del tope:
        *"puedes cobrar igual y arreglarlo despues desde el historial"*.

    Todo va en el panel grande. La tarjeta de la lista NO lleva nada: esa
    dice lo minimo para escoger cual abrir.                              */

/*  El aviso de esta pantalla. Nada de alert(): en el ejecutable no sale y
    la accion se queda muda.                                             */
let _hsToastT = null;
function hsAviso(msg, tono) {
  const el = document.getElementById('hs-toast');
  if (!el) { console.warn('[historial]', msg); return; }
  el.textContent = msg;
  el.className = 'hs-toast on' + (tono ? ' ' + tono : '');
  clearTimeout(_hsToastT);
  //  Un motivo de rechazo hay que poder leerlo: dura mas.
  _hsToastT = setTimeout(function () { el.className = 'hs-toast'; }, msg.length > 90 ? 9000 : 4200);
}

/*  Lo que contesta el proveedor es texto de fuera: se escapa antes de
    ponerlo en la pantalla.                                              */
function hsEsc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/*  ¿Esta sede emite? Si la consulta FALLA no se enciende nada: ensenar la
    tarjeta y que al pulsar no pase nada es peor que no ensenarla.        */
async function hsFacturacionOn() {
  try {
    const r = await sb.from('pos_facturacion_cuentas')
      .select('activo,emitiendo').eq('branch_id', HS.branchId).limit(1);
    if (r.error) { console.error('[factura] no se pudo preguntar:', r.error.message); return false; }
    const c = r.data && r.data[0];
    return !!(c && c.activo && c.emitiendo !== false);
  } catch (e) { console.error('[factura] no se pudo preguntar:', e); return false; }
}

/*  `facPudo` separa "no tiene factura" de "no pude preguntar". Sin esa
    distincion, un permiso mal puesto se ve igual que una venta sin
    facturar — que es como la facturacion entera estuvo muda dos semanas
    sin que nadie se enterara.                                           */
async function hsFacCargar(orderId) {
  HS.fac = null;
  HS.facPudo = false;
  try {
    const r = await sb.from('pos_facturas')
      .select('id,estado,numero,prefijo,cufe,error,intentos,proximo_intento,correo_enviado_at,correo_error,emitida_at')
      .eq('order_id', orderId).eq('tipo', 'factura')
      .order('created_at', { ascending: false }).limit(1);
    if (r.error) { console.error('[factura] no se pudo leer:', r.error.message); return; }
    HS.facPudo = true;
    HS.fac = (r.data && r.data[0]) || null;
  } catch (e) { console.error('[factura] no se pudo leer:', e); }
}

function hsFacCuando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mismoDia = d.toDateString() === new Date().toDateString();
  return (mismoDia ? 'hoy' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/*  "En 3 minutos" se entiende; una fecha con segundos, no.              */
function hsFacEnCuanto(iso) {
  if (!iso) return '';
  const min = Math.round((new Date(iso) - Date.now()) / 60000);
  if (min <= 0) return 'en cualquier momento';
  if (min === 1) return 'en 1 minuto';
  if (min < 60) return 'en ' + min + ' minutos';
  const h = Math.round(min / 60);
  return h === 1 ? 'en 1 hora' : 'en ' + h + ' horas';
}

function hsFacHTML(o) {
  //  Sin cuenta conectada esta seccion no existe: no se le habla de la
  //  DIAN a un restaurante que no factura.
  if (!HS.feOn) return '';

  const f = HS.fac;
  const cobrado = o.status === 'paid' || o.status === 'completed';
  let clase = '', titulo = '', dice = '', acciones = '', datos = '', motivo = '';

  if (!HS.facPudo) {
    clase = 'espera';
    titulo = 'No se pudo consultar';
    dice = 'No pudimos preguntar en qué quedó esta factura. Revisa la conexión y vuelve a abrir el pedido.';
  } else if (!f) {
    if (!cobrado) {
      titulo = 'Sin factura todavía';
      dice = 'Esta venta aún no se ha cobrado. La factura sale al cobrar.';
    } else {
      clase = 'espera';
      titulo = 'Esta venta no tiene factura';
      dice = 'Se cobró sin factura electrónica. Si el cliente la pide, puedes emitirla ahora.';
      acciones = `<button class="btn-hs btn-hs-primary" onclick="hsFacAbrir('${o.id}','emitir')">Facturar esta venta</button>`;
    }
  } else if (f.estado === 'aceptada') {
    clase = 'bien';
    titulo = 'Factura emitida';
    dice = 'La DIAN ya la aceptó. Esta venta está en regla.';
    acciones = `<button class="btn-hs btn-hs-ghost" onclick="hsFacAbrir('${o.id}','correo')">`
      + (f.correo_enviado_at ? 'Volver a enviarla' : 'Enviar por correo') + '</button>';
  } else if (f.estado === 'enviada') {
    clase = 'espera';
    titulo = 'En la DIAN';
    dice = 'Ya salió y la DIAN la está validando. No hay que hacer nada: se confirma sola.';
    acciones = `<button class="btn-hs btn-hs-ghost" onclick="hsFacAbrir('${o.id}','correo')">Enviar por correo</button>`;
  } else if (f.estado === 'pendiente') {
    clase = 'espera';
    titulo = 'Todavía no sale';
    dice = 'Se está reintentando sola'
      + (f.proximo_intento ? ' — siguiente intento ' + hsFacEnCuanto(f.proximo_intento) : '')
      + '. No tienes que hacer nada; si quieres, puedes intentarlo ya.';
    acciones = `<button class="btn-hs btn-hs-primary" onclick="hsFacReintentar('${o.id}',this)">Intentar ahora</button>`;
    if (f.error) motivo = '<div class="hs-fac-motivo ojo"><b>Lo último que contestó:</b> ' + hsEsc(f.error) + '</div>';
  } else if (f.estado === 'rechazada') {
    clase = 'mal';
    titulo = 'No se pudo emitir';
    dice = 'Ya no se reintenta sola. Mira el motivo y vuelve a intentarlo cuando esté resuelto.';
    acciones = `<button class="btn-hs btn-hs-primary" onclick="hsFacReintentar('${o.id}',this)">Intentar de nuevo</button>`;
    if (f.error) motivo = '<div class="hs-fac-motivo"><b>Motivo:</b> ' + hsEsc(f.error) + '</div>';
  } else if (f.estado === 'anulada') {
    titulo = 'Factura anulada';
    dice = 'Esta factura se anuló con una nota crédito.';
  } else {
    clase = 'espera';
    titulo = 'Estado: ' + hsEsc(f.estado || '—');
    dice = 'No reconocemos este estado.';
  }

  if (f && (f.numero || f.cufe || f.correo_enviado_at || f.correo_error)) {
    const trozos = [];
    if (f.numero) {
      trozos.push('<div class="hs-fac-dato"><div class="hs-fac-lbl">Número</div>'
        + '<div class="hs-fac-val">' + hsEsc(f.numero) + '</div></div>');
    }
    if (f.emitida_at) {
      trozos.push('<div class="hs-fac-dato"><div class="hs-fac-lbl">Emitida</div>'
        + '<div class="hs-fac-val">' + hsFacCuando(f.emitida_at) + '</div></div>');
    }
    /*  El correo se dice SIEMPRE. Un envio que fallo y no se cuenta es un
        cliente que cree que tiene su factura y no la tiene.             */
    let correo = '<span class="hs-fac-val flojo">Sin enviar</span>';
    if (f.correo_enviado_at) {
      correo = '<span class="hs-fac-val">Enviado ' + hsFacCuando(f.correo_enviado_at) + '</span>';
    } else if (f.correo_error) {
      correo = '<span class="hs-fac-val" style="color:#B91C1C">No llegó</span>';
    }
    trozos.push('<div class="hs-fac-dato"><div class="hs-fac-lbl">Correo</div>' + correo + '</div>');
    if (f.cufe) {
      trozos.push('<div class="hs-fac-dato"><div class="hs-fac-lbl">Código CUFE</div>'
        + '<div class="hs-fac-val mono">' + hsEsc(f.cufe) + '</div></div>');
    }
    datos = '<div class="hs-fac-datos">' + trozos.join('') + '</div>';
    if (f.correo_error && !f.correo_enviado_at) {
      motivo += '<div class="hs-fac-motivo ojo"><b>El correo no salió:</b> ' + hsEsc(f.correo_error) + '</div>';
    }
  }

  return '<div class="hs-section">'
    + '<div class="hs-section-title">Factura electrónica</div>'
    + '<div class="hs-fac ' + clase + '">'
    +   '<div class="hs-fac-top">'
    +     '<div><div class="hs-fac-estado">' + titulo + '</div>'
    +     '<div class="hs-fac-dice">' + dice + '</div></div>'
    +     (acciones ? '<div class="hs-fac-acciones">' + acciones + '</div>' : '')
    +   '</div>'
    +   motivo + datos
    + '</div></div>';
}

// ── la ventana ────────────────────────────────────────────────────────

function hsFacAbrir(orderId, modo) {
  const ov = document.getElementById('hf-overlay');
  if (!ov) return;
  HS.hfPedido = orderId;
  HS.hfModo = modo;

  const o = HS.orders.find(x => x.id === orderId) || {};
  const c = o.factura_cliente || {};
  const esCorreo = modo === 'correo';

  document.getElementById('hf-title').textContent = esCorreo
    ? 'Enviar la factura por correo' : 'Facturar esta venta';
  document.getElementById('hf-sub').textContent = esCorreo
    ? 'Le llega en PDF, con el código de la DIAN.'
    : 'Si el cliente no da sus datos, sale a consumidor final.';
  document.getElementById('hf-ok').textContent = esCorreo ? 'Enviar' : 'Facturar';

  //  En modo correo sobra todo lo demas: se pregunta UNA cosa.
  document.getElementById('hf-seg').classList.toggle('is-hidden', esCorreo);
  document.getElementById('hf-campo-doc').classList.toggle('is-hidden', esCorreo);
  document.getElementById('hf-campo-nom').classList.toggle('is-hidden', esCorreo);

  hsFacTipo(c.tipo || 'cc');
  document.getElementById('hf-doc').value = c.documento || '';
  document.getElementById('hf-nom').value = c.nombre || o.customer_name || '';
  document.getElementById('hf-mail').value = c.correo || '';
  hsFacAviso('');
  ov.classList.add('show');
  setTimeout(function () {
    const foco = document.getElementById(esCorreo ? 'hf-mail' : 'hf-doc');
    if (foco) foco.focus();
  }, 60);
}

function hsFacCerrar() {
  const ov = document.getElementById('hf-overlay');
  if (ov) ov.classList.remove('show');
}

function hsFacTipo(t) {
  const seg = document.getElementById('hf-seg');
  if (seg) [].forEach.call(seg.children, function (b) {
    b.classList.toggle('on', b.dataset.tipo === t);
  });
  const esNit = t === 'nit';
  document.getElementById('hf-lbl-doc').textContent = esNit ? 'NIT (sin el dígito de verificación)' : 'Número de cédula';
  document.getElementById('hf-lbl-nom').textContent = esNit ? 'Razón social' : 'Nombre completo';
}

function hsFacAviso(msg, tono) {
  const el = document.getElementById('hf-aviso');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'fe-aviso' + (msg ? '' : ' is-hidden') + (tono ? ' ' + tono : '');
}

const HS_MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function hsFacConfirmar() {
  const btn = document.getElementById('hf-ok');
  const orderId = HS.hfPedido;
  const esCorreo = HS.hfModo === 'correo';
  const mail = (document.getElementById('hf-mail').value || '').trim();

  if (esCorreo && !mail) { hsFacAviso('Falta el correo del cliente.', 'mal'); return; }
  if (mail && !HS_MAIL_RE.test(mail)) {
    hsFacAviso('Ese correo no se ve bien. Revísalo.', 'mal'); return;
  }

  let datos = null;
  if (!esCorreo) {
    const btnTipo = document.querySelector('#hf-seg button.on');
    const doc = (document.getElementById('hf-doc').value || '').replace(/[^0-9-]/g, '').trim();
    const nom = (document.getElementById('hf-nom').value || '').trim();
    /*  Uno sin el otro no sirve: o van los dos, o va a consumidor final.
        Media identificacion es la forma segura de que la rechacen.      */
    if ((doc && !nom) || (nom && !doc)) {
      hsFacAviso('Para poner los datos del cliente hacen falta el documento Y el nombre. Si no los tienes, déjalos vacíos y sale a consumidor final.', 'mal');
      return;
    }
    if (doc && nom) {
      datos = { tipo: (btnTipo && btnTipo.dataset.tipo) || 'cc', documento: doc, nombre: nom, correo: mail };
    }
  }

  const antes = btn.textContent;
  btn.disabled = true;
  btn.textContent = esCorreo ? 'Enviando…' : 'Facturando…';
  try {
    if (datos) {
      /*  Los datos del cliente se guardan en el PEDIDO antes de emitir: de
          ahi los lee el servidor, y ademas quedan guardados para el dia
          que haya que volver a mirarlos.                               */
      const g = await sb.from('pos_orders').update({ factura_cliente: datos }).eq('id', orderId);
      if (g.error) throw new Error('No se pudieron guardar los datos: ' + g.error.message);
      const o = HS.orders.find(x => x.id === orderId);
      if (o) o.factura_cliente = datos;
    }
    const r = await hsFacLlamar(esCorreo
      ? { order_id: orderId, reenviar: true, correo: mail }
      : { order_id: orderId });

    hsFacCerrar();
    if (esCorreo) {
      if (r.correo_enviado) hsAviso('Factura enviada a ' + mail, 'bien');
      else hsAviso('No se pudo enviar: ' + (r.motivo || 'el proveedor no dijo por qué'), 'mal');
    } else if (r.factura && r.factura.numero) {
      hsAviso('Factura emitida: ' + r.factura.numero, 'bien');
    } else if (r.error) {
      hsAviso('No salió: ' + r.error + '. Queda en cola y se reintenta sola.', 'ojo');
    } else {
      hsAviso('Quedó en cola: se reintenta sola.', 'ojo');
    }
    await hsFacRefrescar(orderId);
  } catch (e) {
    hsFacAviso(String(e.message || e), 'mal');
  } finally {
    btn.disabled = false;
    btn.textContent = antes;
  }
}

async function hsFacReintentar(orderId, btn) {
  const antes = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Intentando…'; }
  try {
    const r = await hsFacLlamar({ order_id: orderId });
    if (r.factura && r.factura.numero) hsAviso('Factura emitida: ' + r.factura.numero, 'bien');
    else if (r.error) hsAviso('Sigue sin salir: ' + r.error, 'mal');
    else hsAviso('Sigue en cola. Se reintenta sola.', 'ojo');
  } catch (e) {
    hsAviso(String(e.message || e), 'mal');
    if (btn) { btn.disabled = false; btn.textContent = antes; }
  }
  await hsFacRefrescar(orderId);
}

/*  Una sola puerta al servidor. `fetch` NO lanza con un 403 ni con un 500:
    hay que mirar el cuerpo, o el fallo pasa por "no hay datos" — que es
    exactamente lo que tuvo la facturacion muda dos semanas.             */
async function hsFacLlamar(cuerpo) {
  const ses = await sb.auth.getSession();
  const tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
  if (!tok) throw new Error('Se cerró la sesión. Vuelve a entrar.');
  const r = await fetch(SUPABASE_URL + '/functions/v1/facturar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
    body: JSON.stringify(cuerpo),
  });
  const d = await r.json().catch(function () { return null; });
  if (!d) throw new Error('El servidor no contestó (' + r.status + ')');
  if (!r.ok && !d.error) throw new Error('El servidor contestó ' + r.status);
  return d;
}

/*  Vuelve a leer la factura y repinta SOLO su tarjeta: repintar el detalle
    entero perderia el sitio donde la persona estaba mirando.            */
async function hsFacRefrescar(orderId) {
  await hsFacCargar(orderId);
  const o = HS.orders.find(x => x.id === orderId);
  if (!o) return;
  const secciones = document.querySelectorAll('#hs-detail .hs-section');
  for (const sec of secciones) {
    const t = sec.querySelector('.hs-section-title');
    if (t && t.textContent.trim() === 'Factura electrónica') {
      const caja = document.createElement('div');
      caja.innerHTML = hsFacHTML(o);
      if (caja.firstChild) sec.replaceWith(caja.firstChild);
      return;
    }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const ok = document.getElementById('hf-ok');
  if (ok) ok.onclick = hsFacConfirmar;
  const ca = document.getElementById('hf-cancel');
  if (ca) ca.onclick = hsFacCerrar;
  const seg = document.getElementById('hf-seg');
  if (seg) [].forEach.call(seg.children, function (b) {
    b.onclick = function () { hsFacTipo(b.dataset.tipo); };
  });
  const ov = document.getElementById('hf-overlay');
  if (ov) ov.onclick = function (e) { if (e.target === ov) hsFacCerrar(); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hsFacCerrar();
  });
});
