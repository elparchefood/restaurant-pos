/* ============================================================
   TOMAR PEDIDO — tomar-pedido.js
   Página de pedido dentro de una mesa.
   Depende de: pos-core.js (sb, $, COPF, COP)
   ============================================================ */

// ── Estado global ────────────────────────────────────────────
const S = {
  userId: null, tenantId: null, branchId: null,
  waiterName: '—', userRole: '—', tableId: null, table: null,
  // La propina/servicio la decide el CAJERO al cobrar (pagos.html tiene su propio
  // control). En la tablet ya no hay interruptor, así que el mesero ve el total limpio.
  serviceEnabled: false,
  cats: [], products: [],
  order: null,  // registro en pos_orders (si ya existe)
  cart: [],     // [{id, productId, name, qty, unitPrice, catColor, selections:{pres,var,mods}}]
  modGroups: [],
  favs: new Set(JSON.parse(localStorage.getItem('pos_favs') || '[]')),
  personas: 2,
  clienteId: null, clienteNombre: '', clienteTel: '',
  openAt: null,
};

// Paleta para categorías sin color propio
const CAT_PALETTE = [
  {color:'#5B6BFF',tint:'#EEF2FF'},{color:'#8B5CF6',tint:'#F5F3FF'},
  {color:'#EC4899',tint:'#FDF2F8'},{color:'#F59E0B',tint:'#FFFBEB'},
  {color:'#10B981',tint:'#ECFDF5'},{color:'#0EA5E9',tint:'#F0F9FF'},
  {color:'#EF4444',tint:'#FEF2F2'},{color:'#14B8A6',tint:'#F0FDFA'},
];

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Autenticar
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  S.userId    = user.id;
  S.tenantId  = user.user_metadata?.tenant_id || user.id;
  S.branchId  = user.user_metadata?.branch_id || null;
  const { data: posUser } = await sb.from('pos_users').select('name, role').eq('auth_user_id', user.id).maybeSingle();
  S.waiterName = posUser?.name || user.user_metadata?.nombre || user.user_metadata?.name || user.email?.split('@')[0] || '—';
  S.userRole   = posUser?.role || user.user_metadata?.role || 'Administrador';

  // 2. Leer tableId de la URL
  const params = new URLSearchParams(window.location.search);
  S.tableId = params.get('table');
  if (!S.tableId) { window.location.href = 'ventas.html'; return; }
  const urlGuests = parseInt(params.get('guests') || '0', 10);
  if (urlGuests > 0) S.personas = urlGuests;
  pintarPersonas();

  // 3. Pintar shell inmediato
  paintShell();

  // 4. Cargar datos en paralelo
  /* allSettled, no all: en la venta rapida NO hay mesa, asi que loadTable()
     falla — y con Promise.all esa caida se llevaba tambien el catalogo, aunque
     el catalogo hubiera cargado bien. El renderCatGrid() de mas abajo no
     llegaba a ejecutarse nunca y la pantalla se quedaba en Cargando
     categorias... para siempre. Cada carga responde por si misma. */
  const _cargas = await Promise.allSettled([
    loadTable(),
    loadCatalog(),
  ]);
  _cargas.forEach(function (r, i) {
    if (r.status === 'rejected') {
      console.warn('[tomar-pedido] carga ' + (i === 0 ? 'mesa' : 'catalogo') + ' fallo:',
                   (r.reason && r.reason.message) || r.reason);
    }
  });

  // 4b. Estado de inventario (para bloquear/avisar productos sin insumo)
  if (window.posStock) { try { await posStock.load(sb); } catch (e) { console.warn('posStock:', e); } }

  // 5. Cargar pedido activo de la mesa (si existe)
  await loadOpenOrder();

  // 6. Renderizar vistas
  renderCatGrid();
  
  renderFavs();
  paintCartState();

  // 6b. Toast si la mesa está en esperando
  tpCheckEsperandoToast();

  // 6c. Botón proactivo Ya entregué
  tpRenderEntregueBtn();

  // 7. Listeners
  bindEvents();
});

// ── Shell inmediato ──────────────────────────────────────────
function paintShell() {
  $('tp-user-name').textContent   = S.waiterName;
  $('tp-waiter-name').textContent = S.waiterName;
  $('tp-user-role').textContent   = capitalizeRole(S.userRole);
  const parts = S.waiterName.replace(/\s+/g,' ').trim().split(' ');
  const initials = parts.map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?';
  $('tp-user-avatar').textContent = initials;
}
function capitalizeRole(r){ if(!r)return'Mesero'; return r.charAt(0).toUpperCase()+r.slice(1).toLowerCase(); }

// ── Carga de mesa ────────────────────────────────────────────
async function loadTable() {
  try {
    const { data } = await sb.from('pos_tables').select('*').eq('id', S.tableId).maybeSingle();
    if (data) {
      S.table = data;
      paintTableInfo(data);
    } else {
      // Fallback: leer de localStorage (configuracion.js guarda mesas ahí)
      const local = JSON.parse(localStorage.getItem('pos.config.salon.v1') || '{}');
      const t = (local.tables || []).find(t => t.id === S.tableId);
      if (t) {
        S.table = t;
        paintTableInfo(t);
      }
    }
  } catch(e) {
    // Intentar localStorage si Supabase falla
    try {
      const local = JSON.parse(localStorage.getItem('pos.config.salon.v1') || '{}');
      const t = (local.tables || []).find(t => t.id === S.tableId);
      if (t) { S.table = t; paintTableInfo(t); }
    } catch(_) {}
  }
}

function paintTableInfo(t) {
  if (!t) return;
  const name = t.name || 'Mesa';
  $('tp-mesa-title').textContent   = name;
  // El numero va dentro del cuadro: si el nombre es largo ("Terraza 3"), bajar
  // el tamano para que no se desborde.
  const _mn = $('tp-mesa-title');
  if (_mn) _mn.style.fontSize = name.length <= 3 ? '19px' : name.length <= 5 ? '14px' : '11px';
  $('tp-crumb-mesa').textContent   = name;
  /* La zona del salon va en el titulo de la seccion, no en el bloque de marca:
     ese renglon es del nombre del restaurante. Antes decia "—" casi siempre. */
  var _z = t.zone || t.zoneId || '';
  var _sec = document.querySelector('.tp-side-section');
  if (_sec) _sec.textContent = _z ? 'Mesa · ' + _z : 'Mesa';
  // hora apertura: usar la del pedido activo; por ahora marcar now como fallback
  if (!S.openAt) {
    S.openAt = new Date().toISOString();
    $('tp-hora-apertura').textContent = fmtTime(S.openAt);
  }
}

// ── Catálogo ─────────────────────────────────────────────────
/* ── COMBOS ────────────────────────────────────────────────────────────────
   Se suman al catalogo con forma de producto, para que la grilla, el buscador,
   los favoritos y el carrito sigan funcionando sin cambios. Es idempotente: se
   quitan los que hubiera antes y se vuelven a poner, porque el catalogo se
   recarga en segundo plano y si no se duplicarian.
   A proposito NO se guardan en la cache del equipo: son pocos y cambian mas
   seguido que la carta. */
/* Un combo no es un producto: product_id queda vacio y lo que llevaba se anota
   en selections, para que la comanda y el inventario lo lean despues aunque
   mañana el combo cambie en el catalogo. */
function _filaConCombo(fila, id) {
  if (!window.posCombos || !posCombos.esCombo(id)) return fila;
  var extra = posCombos.camposDB(id);
  if (!extra) return fila;
  fila.product_id = null;
  fila.selections = Object.assign({}, fila.selections || {}, extra.selections);
  return fila;
}

async function _sumarCombos() {
  if (!window.posCombos) return;
  try {
    await posCombos.cargar(sb, S.tenantId);
    var nuevos = posCombos.comoProductos();
    S.cats = (S.cats || []).filter(function (c) { return c.id !== posCombos.CAT_ID; });
    S.products = (S.products || []).filter(function (p) { return !posCombos.esCombo(p.id); });
    if (nuevos.length) {
      S.products = S.products.concat(nuevos);
    }
    /* La pestaña de COMBOS y la de PUNTOS. Se registran aqui porque es
       donde el catalogo ya esta completo. */
    if (window.posTabs) {
      posTabs.registrar({
        combos: 'tp-combos-grid', puntos: 'tp-puntos-grid',
        tenantId: S.tenantId, branchId: S.branchId,
        productos: function () { return S.products || []; },
        card: function (p, color) { return prodCard(p, color); },
      });
    }
  } catch (e) { console.warn('combos:', e); }
}

async function loadCatalog() {
  var _ck = 'pos.catalog.v4.' + S.tenantId;
  // Servir desde caché si existe — sin delay de red
  try {
    var _raw = localStorage.getItem(_ck);
    if (_raw) {
      var _cd = JSON.parse(_raw);
      // Solo confiar en la caché si TIENE productos. Una caché con 0 productos casi
      // siempre es basura de una eliminación/importación a medias (bug real: mesas
      // mostraba categorías vacías tras reimportar la carta) → traer fresco.
      if (_cd && _cd.cats && Array.isArray(_cd.products) && _cd.products.length > 0) {
        S.cats      = _cd.cats;
        S.products  = _cd.products;
        S.modGroups = _cd.modGroups || [];
        // Actualizar en segundo plano sin bloquear el arranque
        setTimeout(function() { _catalogFetch(_ck, true); }, 0);
        await _sumarCombos();
        renderCatGrid(); 
        return;
      }
    }
  } catch(e) {}
  // Sin caché (o caché vacía) — esperar datos frescos
  await _catalogFetch(_ck, false);
}

async function _catalogFetch(cacheKey, isBackground) {
  // Reintentos: navigator.onLine puede dar falso "offline" en el ejecutable y una
  // lectura puede fallar transitoriamente — no dejar el catálogo vacío por eso.
  for (var intento = 1; intento <= 3; intento++) {
    try {
      const [catsRes, prodsRes] = await Promise.all([
        sb.from('pos_categories').select('*').eq('tenant_id', S.tenantId).order('name'),
        sb.from('pos_products')  .select('*').eq('tenant_id', S.tenantId).eq('available', true).order('name'),
      ]);
      if (catsRes.error) throw catsRes.error;
      if (prodsRes.error) throw prodsRes.error;
      const cats = catsRes.data, prods = prodsRes.data;
      S.cats = (cats || []).map((c, i) => ({
        ...c,
        color: c.color || CAT_PALETTE[i % CAT_PALETTE.length].color,
        tint:  c.color_tint || CAT_PALETTE[i % CAT_PALETTE.length].tint,
      }));
      S.products = (prods || []).map(p => ({
        ...p,
        presentations: Array.isArray(p.presentations) ? p.presentations : [],
        variables:     Array.isArray(p.variables)     ? p.variables     : [],
        mod_group_ids: Array.isArray(p.mod_group_ids) ? p.mod_group_ids : [],
        mod_group_pres: (p.mod_group_pres && typeof p.mod_group_pres === 'object') ? p.mod_group_pres : {},
      }));
      const { data: mods } = await sb.from('pos_modifier_groups')
        .select('id,name,rule,multi,options').eq('tenant_id', S.tenantId);
      S.modGroups = (mods || []).map(g => ({
        id:g.id, name:g.name, rule:g.rule||'opcional', multi:!!g.multi,
        options: Array.isArray(g.options) ? g.options : [],
      }));
      // Cachear SOLO si hay productos (nunca persistir un catálogo vacío que
      // luego tape los datos reales)
      try {
        if (S.products.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({
            cats: S.cats, products: S.products, modGroups: S.modGroups, ts: Date.now()
          }));
        }
      } catch(e) {}
      await _sumarCombos();
      renderCatGrid(); 
      return;
    } catch(e) {
      console.error('loadCatalog intento ' + intento + ':', e);
      if (intento < 3) await new Promise(function(r){ setTimeout(r, 1200 * intento); });
    }
  }
  // Tras agotar reintentos: refrescar la UI con lo que haya (evita pantalla congelada)
  renderCatGrid(); 
}

// ── Pedido abierto ───────────────────────────────────────────
async function loadOpenOrder() {
  try {
    // Si la mesa está libre no hay orden activa válida.
    // Cerrar cualquier orden huérfana (nunca cerrada) para mantener consistencia.
    if (S.table?.status === 'libre') {
      await sb.from('pos_orders')
        .update({ status: 'abandoned' })
        .eq('table_id', S.tableId)
        .eq('tenant_id', S.tenantId)
        .in('status', ['open', 'in_progress']);
      return;
    }
    const { data } = await sb
      .from('pos_orders')
      .select('*, pos_order_items(*)')
      .eq('table_id', S.tableId)
      .eq('tenant_id', S.tenantId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;
    S.order = data;
    // Cliente ya asociado a esta mesa (si lo hay), para pintarlo en la fila.
    S.clienteId = data.cliente_id || null;
    S.clienteNombre = data.customer_name || '';
    S.clienteTel = '';
    if (S.clienteId) {
      try {
        const rc = await sb.from('pos_clientes').select('telefono,nombre').eq('id', S.clienteId).maybeSingle();
        if (rc.data) { S.clienteTel = rc.data.telefono || ''; S.clienteNombre = S.clienteNombre || rc.data.nombre || ''; }
      } catch (e) { /* sin telefono solo se pierde el contador de puntos */ }
    }
    tpPintarCliente();
    // Reconstruir carrito desde ítems guardados
    S.cart = (data.pos_order_items || []).map(it => ({
      id:        it.id,
      productId: it.product_id,
      name:      it.name,
      qty:       it.quantity,
      unitPrice: parseFloat(it.unit_price) || 0,
      catColor:  catColorFor(it.product_id),
      selections: it.selections || {},
    }));
    /* Si el pedido guardado no trae personas, se deja lo que ya se sabia (lo
       que se eligio al abrir la mesa). Antes lo pisaba con un 2 fijo. */
    if (Number(data.guests) > 0) S.personas = Number(data.guests);
    pintarPersonas();
    S.openAt = data.created_at || S.openAt || new Date().toISOString();
    $('tp-hora-apertura').textContent = fmtTime(S.openAt);
  } catch(e) {
    console.error('loadOpenOrder:', e);
  }
}

// ── Helpers ──────────────────────────────────────────────────
function catColorFor(productId) {
  const prod = S.products.find(p => p.id === productId);
  if (!prod?.category_id) return '#94A3B8';
  const cat = S.cats.find(c => c.id === prod.category_id);
  return cat?.color || '#94A3B8';
}

function basePrice(prod) {
  // simple: primera presentación con price > 0
  if (prod.price > 0) return prod.price;
  const pres = prod.presentations?.[0];
  if (pres?.price > 0) return pres.price;
  return 0;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function cartTotal() {
  return S.cart.reduce((s, it) => s + it.unitPrice * it.qty, 0);
}

// ── RENDER: Grid de categorías ────────────────────────────────
function renderCatGrid() {
  const grid = $('cat-grid');
  if (!S.cats.length) {
    grid.innerHTML = `<div style="color:var(--muted);font-size:13px;grid-column:1/-1;padding:28px 0;text-align:center">Sin categorías en el catálogo</div>`;
    return;
  }
  grid.innerHTML = S.cats.map(cat => {
    const count = S.products.filter(p => p.category_id === cat.id).length;
    const _bg = cat.image_url ? `background:#F1F5F9 center/cover no-repeat url('${cat.image_url}')` : '';
    return `
    <button class="lm-cat" data-cat-id="${cat.id}" data-cat-name="${escHtml(cat.name)}" data-cat-color="${cat.color}">
      <div class="tp-thumb" style="height:90px;width:100%;margin:0;border-radius:0;${_bg}">
        ${cat.image_url ? '' : `<div class="tp-thumb-label">${escHtml(cat.name.slice(0,14))}</div>`}
      </div>
      <div class="tp-cat-foot">
        <div>
          <div class="tp-cat-name">${escHtml(cat.name)}</div>
          <div class="tp-cat-count">${count} producto${count !== 1 ? 's' : ''}</div>
        </div>
        <div class="tp-cat-badge" style="background:${cat.tint || '#EEF2FF'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${cat.color}" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </button>`;
  }).join('');
}

// ── RENDER: Productos de categoría ───────────────────────────
function renderProdGrid(catId, catName, catColor) {
  const prods = S.products.filter(p => p.category_id === catId);
  $('prod-cat-name').textContent  = catName;
  $('prod-cat-dot').style.background = catColor || '#5B6BFF';
  $('prod-cat-count').textContent = `${prods.length} producto${prods.length !== 1 ? 's' : ''}`;
  $('prod-grid').innerHTML = prods.length
    ? prods.map(p => prodCard(p, catColor)).join('')
    : `<div style="color:var(--muted);font-size:13px;padding:28px 0;text-align:center;grid-column:1/-1">Sin productos en esta categoría</div>`;
}

// ── RENDER: Menú completo ─────────────────────────────────────
// ── RENDER: Favoritos ─────────────────────────────────────────
function renderFavs() {
  const grid = $('fav-grid');
  const list = S.products.filter(p => S.favs.has(p.id));
  $('fav-count').textContent = list.length;
  grid.innerHTML = list.length
    ? list.map(p => prodCard(p, catColorFor(p.id))).join('')
    : `<div style="color:var(--muted);font-size:13px;padding:28px 0;text-align:center;grid-column:1/-1">Ningún producto marcado como favorito</div>`;
}

// ── Tarjeta de producto ───────────────────────────────────────
function prodCard(p, color) {
  const isFav  = S.favs.has(p.id);
  const precio = basePrice(p);
  const inCart = S.cart.some(it => it.productId === p.id);
  return `
  <button class="lm-prod${inCart ? ' pulse' : ''}${window.posStock ? ' ' + posStock.cardClass(p.id) : ''}" data-prod-id="${p.id}" style="position:relative">
    <div class="tp-prod-thumbwrap">
      ${window.posStock ? posStock.badge(p.id) : ''}
      ${p.photo_url
        ? `<img src="${p.photo_url}" alt="${escHtml(p.name)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:9px 9px 0 0;display:block">`
        : `<div class="tp-thumb" style="aspect-ratio:4/3;width:100%;border-radius:9px 9px 0 0;border:none">
             <div class="tp-thumb-label">${escHtml(p.name.slice(0,12))}</div>
           </div>`
      }
      <!-- OJO: span y no button. Un <button> DENTRO de otro <button> es HTML
           invalido: el navegador cierra el de fuera al encontrar el de dentro y
           saca el resto como hermanos. La tarjeta se partia en TRES celdas de la
           rejilla (el recuadro de la foto, la estrella y el pie con nombre y
           precio), y por eso se veia de un tamaño raro. Se notaba sobre todo en
           Combos, donde hay una sola tarjeta. El clic va por delegacion
           (data-fav-id), asi que un span funciona igual. -->
      <span role="button" tabindex="-1" class="lm-fav-btn${isFav ? ' is-fav' : ''}" data-fav-id="${p.id}" title="Favorito" style="position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.9);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="${isFav ? '#F59E0B' : 'none'}" stroke="${isFav ? '#F59E0B' : '#94A3B8'}" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </span>
    </div>
    <div class="tp-prod-foot">
      <div class="tp-prod-name">${escHtml(p.name)}</div>
      <div class="tp-prod-row">
        <div class="tp-prod-price" style="color:${color || 'var(--brand)'}">${precio > 0 ? COPF(precio) : '—'}</div>
        <div class="tp-qty-badge" style="background:${color || 'var(--brand)'}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </div>
    </div>
  </button>`;
}

// ── RENDER: Comanda ───────────────────────────────────────────
function toggleService(){
  S.serviceEnabled = !S.serviceEnabled;
  paintCartState();
}

// ── Toast no-bloqueante: mesa en esperando ───────────────────────────────
function tpCheckEsperandoToast() {
  if (!S.table || S.table.status !== 'esperando') return;
  // No mostrar si ya está en comiendo o libre
  const existing = document.getElementById('tp-esperando-toast');
  if (existing) return; // ya visible

  const mesa = S.table.name || 'esta mesa';
  const toast = document.createElement('div');
  toast.id = 'tp-esperando-toast';
  toast.className = 'tp-delivery-toast';
  toast.innerHTML = `
    <div>
      <div class="tp-delivery-toast-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${mesa} — pedido en cocina
      </div>
      <div class="tp-delivery-toast-sub">¿Ya entregaste los platos en esta mesa?</div>
    </div>
    <div class="tp-delivery-toast-actions">
      <button class="tp-toast-btn-confirm" id="tp-toast-confirm">Ya se entregó</button>
      <button class="tp-toast-btn-later"   id="tp-toast-later">Aún no</button>
      <button class="tp-toast-btn-close"   id="tp-toast-close">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;

  document.body.appendChild(toast);

  function closeToast() { toast.remove(); }

  document.getElementById('tp-toast-confirm').addEventListener('click', function() {
    closeToast();
    tpMarcarComiendo('toast');
  });
  document.getElementById('tp-toast-later').addEventListener('click', closeToast);
  document.getElementById('tp-toast-close').addEventListener('click', closeToast);
}

// ── Botón proactivo "Ya entregué" en topbar de la comanda ────────────────
function tpConfirm({ title, msg, okLabel = 'Confirmar', variant = 'brand', cancelLabel = 'Cancelar' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'vs-confirm-overlay';
    const iconSvg = {
      green:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      danger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      brand:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    }[variant] || '';
    overlay.innerHTML = `<div class="vs-confirm-card"><div class="vs-confirm-icon ${variant}">${iconSvg}</div><div class="vs-confirm-title">${title}</div><div class="vs-confirm-msg">${msg}</div><div class="vs-confirm-actions"><button class="vs-c-cancel">${cancelLabel}</button><button class="vs-c-ok ${variant}">${okLabel}</button></div></div>`;
    document.body.appendChild(overlay);
    const close = r => { overlay.remove(); resolve(r); };
    overlay.querySelector('.vs-c-ok').addEventListener('click', () => close(true));
    overlay.querySelector('.vs-c-cancel').addEventListener('click', () => close(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
  });
}

function tpRenderEntregueBtn() {
  if (!S.table || S.table.status !== 'esperando') return;
  // Buscar contenedor del topbar para inyectar el botón
  const topbar = document.querySelector('.tp-topbar-r');
  if (!topbar) return;
  const existing = document.getElementById('tp-btn-entregue');
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = 'tp-btn-entregue';
  btn.className = 'tp-entregue-topbar-btn';
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Ya entregué los platos`;
  btn.addEventListener('click', async function() {
    const ok = await tpConfirm({
      title: 'Confirmar entrega',
      msg: '¿Ya entregaste los platos en <strong>' + (S.table && S.table.name || 'esta mesa') + '</strong>?',
      okLabel: 'Sí, ya entregué',
      variant: 'green',
    });
    if (!ok) return;
    tpMarcarComiendo('proactive');
    btn.remove();
    const t = document.getElementById('tp-esperando-toast');
    if (t) t.remove();
  });
  topbar.insertBefore(btn, topbar.firstChild);
}

// ── Marcar mesa como comiendo desde tomar-pedido ─────────────────────────
async function tpMarcarComiendo(method) {
  try {
    await sb.from('pos_tables').update({
      status:          'comiendo',
      comiendo_method: method,
    }).eq('id', S.tableId);
    if (S.table) S.table.status = 'comiendo';
    // Quitar toast y botón si siguen visibles
    const t = document.getElementById('tp-esperando-toast');
    if (t) t.remove();
    const b = document.getElementById('tp-btn-entregue');
    if (b) b.remove();
  } catch(e) { console.error('[TP] marcarComiendo:', e); }
}

function paintCartState() {
  const empty   = $('comanda-empty');
  const scroll  = $('cart-scroll');
  const foot    = $('comanda-foot');
  const mini    = $('cartmini-icon');

  if (!S.cart.length) {
    empty.removeAttribute('hidden');
    scroll.setAttribute('hidden', '');
    foot.setAttribute('hidden', '');
    mini.classList.add('is-empty');
    $('cartmini-title').textContent = '0 ítems en cuenta';
    $('cartmini-sub').textContent   = 'Sin productos aún';
    return;
  }

  empty.setAttribute('hidden', '');
  scroll.removeAttribute('hidden');
  foot.removeAttribute('hidden');
  mini.classList.remove('is-empty');

  const total   = cartTotal();
  const service = S.serviceEnabled ? total * 0.10 : 0;
  const grand   = total + service;

  // Subtotal y Servicio solo aparecen si aportan información (si no, repiten el Total)
  const rowSub = $('row-subtotal'), rowSvc = $('row-servicio');
  if (rowSub) rowSub.hidden = (grand === total);
  if (rowSvc) rowSvc.hidden = !service;
  $('t-subtotal').textContent = COPF(total);
  $('t-servicio').textContent = COPF(service);
  $('t-total').textContent    = COPF(grand);

  $('cart-count-label').textContent = `${S.cart.length} ítem${S.cart.length !== 1 ? 's' : ''}`;
  $('cartmini-title').textContent   = `${S.cart.length} ítem${S.cart.length !== 1 ? 's' : ''} en cuenta`;
  $('cartmini-sub').textContent     = COPF(grand);

  $('cart-lines').innerHTML = S.cart.map((it, idx) => `
  <div class="tp-cartline" id="cartline-${idx}">
    <div class="tp-cartline-main">
      <div class="tp-cartline-name">${escHtml(it.name)}</div>
      <div class="tp-cartline-meta">
        <span class="dot" style="background:${it.catColor || '#94A3B8'}"></span>
        <span class="txt">${COPF(it.unitPrice)} c/u${it.selections?.pres ? ' · ' + escHtml(it.selections.pres) : ''}</span>
        ${it.modSummary ? `<div class="tp-cartline-mods">${escHtml(it.modSummary)}</div>` : ''}
        ${it.note ? `<div class="tp-cartline-note">📝 ${escHtml(it.note)}</div>` : ''}
      </div>
    </div>
    <div class="tp-line-stepper">
      <button class="lm-step sm" data-cart-dec="${idx}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <span class="num">${it.qty}</span>
      <button class="lm-step sm" data-cart-inc="${idx}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
    <div class="tp-cartline-total">${COPF(it.unitPrice * it.qty)}</div>
    <div class="tp-line-acts">
      <button class="tp-line-act" data-cart-edit="${idx}" title="Editar adiciones y notas">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      </button>
      <button class="tp-line-act danger" data-cart-del="${idx}" title="Quitar producto">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
  </div>`).join('');
}

// ── Agregar al carrito ────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
// ── Modal flujo de producto ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function tp_fmt(n){ return '$'+Math.round(n||0).toLocaleString('es-CO'); }
function tp_svg(name,size){
  size=size||14;
  const p=`width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  if(name==='chevron-r') return `<svg ${p}><polyline points="9 18 15 12 9 6"/></svg>`;
  if(name==='back2')     return `<svg ${p}><polyline points="15 18 9 12 15 6"/></svg>`;
  if(name==='check')     return `<svg ${p}><polyline points="20 6 9 12 4 9"/></svg>`;
  return '';
}

let TP_WIP = { prod:null, stepIdx:0, pres:null, vars:{}, mods:{}, qty:1, note:'', forHere:true };

// Lista dinámica de pasos del asistente: Presentación (si hay 2+), UN paso por
// CADA variable (ej. "Primer ingrediente", "Segundo ingrediente"), y Personalizar.
function pmSteps(p){
  const steps=[];
  if((p.presentations||[]).length>1) steps.push({kind:'pres',label:p.presLabel||'Presentacion'});
  (p.variables||[]).forEach(function(vg){
    steps.push({kind:'var',varId:vg.id,vg:vg,label:vg.name||'Variante'});
  });
  steps.push({kind:'custom',label:'Personalizar'});
  return steps;
}

function tpOpenProductModal(prodId) {
  const p = S.products.find(x=>x.id===prodId);
  if(!p) return;
  // editIdx null = producto NUEVO (si viniera de editar, reemplazaría una línea)
  TP_WIP = { prod:p, stepIdx:0, pres:null, vars:{}, mods:{}, qty:1, note:'', forHere:true, editIdx:null };
  const hasPres=(p.presentations||[]).length>1;
  if(!hasPres){
    const pArr=p.presentations||[];
    TP_WIP.pres = pArr.length===1?pArr[0]:{id:'_base',name:'',price:parseFloat(p.price)||0};
    // Sin paso de presentación → stepIdx 0 ya es la primera variable (o Personalizar)
  }
  const el=document.getElementById('tp-modal-producto'); if(el) el.style.display='flex';
  tpRenderMP();
}

function tpComputePrice(){
  const p=TP_WIP.prod, isMatrix=p&&p.price_mode==='matrix';
  let base;
  if(isMatrix){
    const presIdx=(p.presentations||[]).findIndex(pr=>pr.id===TP_WIP.pres?.id);
    base=Object.values(TP_WIP.vars).reduce((s,v)=>{
      let price=v.price||0;
      if(presIdx>=0){
        for(const vg of p.variables||[]){
          const o=(vg.options||[]).find(o=>o.id===v.id);
          if(o&&Array.isArray(o.prices)&&o.prices.length){price=o.prices[presIdx]||0;break;}
        }
      }
      return s+price;
    },0);
  } else {
    // If pres.price is 0/null, fall back to product base price
    const baseP = p ? parseFloat(p.price)||0 : 0;
    base = TP_WIP.pres ? (TP_WIP.pres.price || baseP) : baseP;
    base += Object.values(TP_WIP.vars).reduce((s,v)=>s+(v.price||0),0);
  }
  const modX=Object.values(TP_WIP.mods).reduce((s,m)=>s+((m.price||0)*(m.qty||1)),0);
  let subtotal = (base+modX)*TP_WIP.qty;
  if (!TP_WIP.forHere) {
    // Motor central (pos-core): soporta modo específico por categoría/producto
    if (window.posEmpaqueCalc && TP_WIP.prod) {
      subtotal += window.posEmpaqueCalc([{ productId: TP_WIP.prod.id, catId: TP_WIP.prod.category_id, presId: (TP_WIP.pres && TP_WIP.pres.id !== '_base') ? TP_WIP.pres.id : null, qty: TP_WIP.qty, unitPrice: base + modX }], {});
    } else try {
      const cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      if (cfg.empaquesActivo) {
        const monto = cfg.empaqueTipo === 'porcentaje' ? (cfg.empaquePct||0) : (cfg.empaqueMonto||0);
        if (cfg.empaqueBase === 'pedido') {
          subtotal += cfg.empaqueTipo === 'porcentaje' ? Math.round(subtotal * monto / 100) : monto;
        } else {
          subtotal += cfg.empaqueTipo === 'porcentaje' ? Math.round((base+modX) * monto / 100) * TP_WIP.qty : monto * TP_WIP.qty;
        }
      }
    } catch(e) {}
  }
  return subtotal;
}

/* ─────────────────────────────────────────────────────────────
   MODAL PRODUCTO — diseño 3 pasos (pm-*)
   ───────────────────────────────────────────────────────────── */
const PM_SVG = {
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  back:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  cart:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  chev:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  plus:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  srch:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  food:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M5 2v20M17 2v20M21 7c0-3-2-5-4-5v9c2 0 4-1 4-4z"/></svg>',
  note:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  table: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h18"/><path d="M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M6 10v9M18 10v9"/></svg>',
  bag:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
};
function pmFmt(n){ return '$'+Number(Math.round(n||0)).toLocaleString('es-CO'); }
function pmEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pmAttr(s){ return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function tpRenderMP(){
  const p=TP_WIP.prod; if(!p) return;
  const inner=document.getElementById('pm-modal-inner'); if(!inner) return;
  const steps=pmSteps(p);
  let curIdx=TP_WIP.stepIdx||0; if(curIdx<0)curIdx=0; if(curIdx>=steps.length)curIdx=steps.length-1;
  TP_WIP.stepIdx=curIdx;
  const cur=steps[curIdx];
  const stepperHTML=steps.length>1?'<div class="pm-steps">'+steps.map((s,i)=>{
    const done=i<curIdx,on=i===curIdx;
    return '<button class="pm-step'+(done?' done':on?' on':'')+'" data-step-idx="'+i+'">'
      +'<span class="pm-step-dot">'+(done?PM_SVG.check:String(i+1))+'</span>'
      +'<span class="pm-step-lbl">'+pmEsc(s.label)+'</span></button>'
      +(i<steps.length-1?'<span class="pm-step-line'+(done?' done':'')+'"></span>':'');
  }).join('')+'</div>':'';
  const presLabel=TP_WIP.pres&&TP_WIP.pres.name?TP_WIP.pres.name:'';
  const varLabels=Object.values(TP_WIP.vars).map(v=>v.name).join(' · ');
  const selParts=[presLabel,varLabels].filter(Boolean).join(' · ');
  let paneHTML='';
  if(cur.kind==='pres') paneHTML=pmBuildPresPane(p);
  else if(cur.kind==='var') paneHTML=pmBuildVarPane(p,cur.vg);
  else paneHTML=pmBuildCustomPane(p);
  const canNext=cur.kind==='pres'?!!TP_WIP.pres:cur.kind==='var'?!!TP_WIP.vars[cur.varId]:true;
  const isFirst=curIdx===0;
  const footLeft=isFirst
    ?'<button class="pm-btn-ghost" onclick="tpCloseMP()">Cancelar</button>'
    :'<button class="pm-btn-ghost" onclick="tpMPBack()">'+PM_SVG.back+' Atras</button>';
  const isLast=cur.kind==='custom';
  const footRight=isLast
    ?'<button class="pm-btn-primary" onclick="tpMPAddToCart()">'+PM_SVG.cart+' Agregar al pedido &middot; <span id="pm-foot-price">'+pmFmt(tpComputePrice())+'</span></button>'
    :'<button class="pm-btn-primary" id="tp-mp-next"'+(canNext?'':' disabled')+' onclick="tpMPAdvance()">Continuar '+PM_SVG.chev+'</button>';
  const subTxt=selParts?pmEsc(p.category||'')+' &middot; <strong style="color:#0F172A">'+pmEsc(selParts)+'</strong>':pmEsc(p.category||'');
  inner.innerHTML=
    '<div class="pm-head">'
    +'<div style="display:flex;align-items:center;gap:12px;min-width:0">'
    +'<div class="pm-head-ic">'+PM_SVG.food+'</div>'
    +'<div style="min-width:0"><div class="pm-title">'+pmEsc(p.name)+'</div>'
    +'<div class="pm-sub">'+subTxt+'</div></div></div>'
    +'<button class="pm-close" onclick="tpCloseMP()">'+PM_SVG.x+'</button>'
    +'</div>'
    +stepperHTML
    +'<div class="pm-body">'+paneHTML+'</div>'
    +'<div class="pm-foot">'+footLeft+footRight+'</div>';
  pmAttachHandlers(inner,p,cur);
}

function pmBuildPresPane(p){
  const pres=p.presentations||[];
  const hasVars=(p.variables||[]).length>0;
  return '<div class="pm-choice-grid">'+pres.map(pr=>{
    const on=TP_WIP.pres&&TP_WIP.pres.id===pr.id;
    const priceLabel=hasVars?'Incluido':(pr.price?pmFmt(pr.price):'Incluido');
    const _img=pr.image_url||p.photo_url;   // imagen propia de la presentación o, si no, la del producto
    const thumb=_img
      ?'<div class="pm-choice-thumb pm-thumb-img"><img src="'+pmAttr(_img)+'" alt="'+pmAttr(pr.name)+'" style="width:100%;height:100%;object-fit:cover;display:block"><div class="pm-thumb-overlay"><div class="pm-thumb-name">'+pmEsc(pr.name)+'</div><div class="pm-thumb-price">'+priceLabel+'</div></div></div>'
      :'<div class="pm-choice-thumb pm-thumb-ph"><svg width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#CBD5E1\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><polyline points=\"21 15 16 10 5 21\"/></svg></div>';
    return '<button class="pm-choice'+(on?' on':'')+'" data-pres-id="'+pmAttr(pr.id)+'" data-pres-name="'+pmAttr(pr.name)+'" data-pres-price="'+(pr.price||0)+'">'
      +thumb
      +(_img?''  :'<div class="pm-choice-body"><div class="pm-choice-name">'+pmEsc(pr.name)+'</div>')
      +(_img?''  :'<div class="pm-choice-price">'+priceLabel+'</div></div>')
      +'<span class="pm-radio">'+(on?PM_SVG.check:'')+'</span>'
      +'</button>';
  }).join('')+'</div>';
}

function pmBuildVarPane(p,v){
  if(!v) v=(p.variables||[])[0];
  if(!v) return '';
  const isMatrix=p.price_mode==='matrix';
  const presIdx=(p.presentations||[]).findIndex(pr=>pr.id===TP_WIP.pres?.id);
  return '<div style="display:flex;flex-direction:column;gap:20px"><div>'
    +'<div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">'+pmEsc(v.name)+'</div>'
    +'<div class="pm-choice-grid">'+(v.options||[]).map(o=>{
        const sel=TP_WIP.vars[v.id]&&TP_WIP.vars[v.id].id===o.id;
        const optPrice=isMatrix&&Array.isArray(o.prices)&&presIdx>=0?(o.prices[presIdx]||0):o.price||0;
        const priceLabel=optPrice?(isMatrix?pmFmt(optPrice):'+'+pmFmt(optPrice)):'Incluido';
        return '<button class="pm-choice compact'+(sel?' on':'')+'" data-var-id="'+pmAttr(v.id)+'" data-opt-id="'+pmAttr(o.id)+'" data-opt-name="'+pmAttr(o.name)+'" data-opt-price="'+optPrice+'">'
          +'<div class="pm-choice-body"><div class="pm-choice-name">'+pmEsc(o.name)+'</div>'
          +'<div class="pm-choice-price">'+priceLabel+'</div></div>'
          +'<span class="pm-radio">'+(sel?PM_SVG.check:'')+'</span>'
          +'</button>';
      }).join('')+'</div></div></div>';
}

// Un grupo de modificadores puede estar limitado a ciertas presentaciones
// (mod_group_pres[gid] = [presId,...]). Sin lista → aplica a todas.
function modGroupAppliesToPres(prod, gid, presId){
  const map=(prod&&prod.mod_group_pres)||{};
  const list=map[gid];
  if(!list||!list.length) return true;   // sin restricción → todas las presentaciones
  if(!presId) return true;
  return list.indexOf(presId)!==-1;
}

function pmBuildCustomPane(p){
  const _presId=TP_WIP.pres&&TP_WIP.pres.id;
  const modGroups=(p.mod_group_ids||[])
    .filter(gid=>modGroupAppliesToPres(p,gid,_presId))
    .map(gid=>(S.modGroups||[]).find(g=>g.id===gid)).filter(Boolean);
  const presLabel=TP_WIP.pres&&TP_WIP.pres.name?TP_WIP.pres.name:'';
  const varLabels=Object.values(TP_WIP.vars).map(v=>v.name).join(' · ');
  const selParts=[presLabel,varLabels].filter(Boolean);
  const photoHTML=p.photo_url
    ?'<div class="pm-photo"><img src="'+pmAttr(p.photo_url)+'" style="width:100%;height:100%;object-fit:cover"></div>'
    :'<div class="pm-photo pm-photo-ph"><svg width=\"40\" height=\"40\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#CBD5E1\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><polyline points=\"21 15 16 10 5 21\"/></svg></div>';
  const selSummary=selParts.length
    ?pmEsc(p.name)+' &middot; <span class="sel">'+pmEsc(selParts.join(' · '))+'</span>'
    :pmEsc(p.name);
  const modSumTxt=Object.values(TP_WIP.mods).map(m=>m.name).join(', ')||'Sin adiciones seleccionadas';
  const groupsHTML=modGroups.length
    ?modGroups.map(g=>{
        const maxHint=g.multi?'Max. '+(g.options||[]).length:'Elige una';
        const optRows=(g.options||[]).map(o=>{
          const modEntry=TP_WIP.mods[o.id]; const modQty=modEntry?(modEntry.qty||0):0;
          const grpOpts=(g.options||[]).map(opt=>opt.id);
          const totalGroupQty=grpOpts.reduce((s,oid)=>s+((TP_WIP.mods[oid]&&TP_WIP.mods[oid].qty)||0),0);
          const groupMax=g.multi?(g.max_total||(g.options||[]).length):1;
          // ¿La adición está agotada? (solo si tiene receta de insumos vinculada).
          const modOut=(window.posStock&&posStock.ready&&posStock.modAgotado)?posStock.modAgotado(o.id):false;
          const modBlocked=modOut&&!(window.posStock&&posStock.allow);
          const canInc=totalGroupQty<groupMax&&!modBlocked;
          const priceHTML=modOut
            ? '<span class="pm-mod-out-tag">Agotado</span>'
            : (o.price?'+ '+pmFmt(o.price):'Gratis');
          return '<div class="pm-mod'+(modQty>0?' on':'')+(modOut?' pm-mod-out':'')+'" data-mod-id="'+pmAttr(o.id)+'">'
            +'<div style="min-width:0;text-align:left;flex:1"><div class="pm-mod-name">'+pmEsc(o.name)+'</div>'
            +'<div class="pm-mod-price">'+priceHTML+'</div></div>'
            +'<div class="pm-mod-qty-ctrl">'
            +'<button class="pm-mod-dec"'+(modQty<=0?' disabled="disabled"':'')+' data-mod-dec="'+pmAttr(o.id)+'">−</button>'
            +'<span class="pm-mod-qty-num">'+modQty+'</span>'
            +'<button class="pm-mod-inc"'+(!canInc?' disabled="disabled"':'')+' data-mod-inc="'+pmAttr(o.id)+'" data-mod-name="'+pmAttr(o.name)+'" data-mod-price="'+(o.price||0)+'">+</button>'
            +'</div></div>';
        }).join('');
        return '<div style="margin-top:14px">'
          +'<div class="pm-group-head"><span>'+pmEsc(g.name)+'</span><span class="pm-group-hint">'+maxHint+'</span></div>'
          +'<div class="pm-mods-grid">'+optRows+'</div></div>';
      }).join('')
    :'<div class="pm-nomods"><p>Sin adiciones disponibles para este producto.</p></div>';
  return '<div class="pm-custom">'
    +'<div class="pm-left">'
    +photoHTML
    +'<div class="pm-prodname">'+selSummary+'</div>'
    +'<div class="pm-modsum" id="pm-mod-sum">'+pmEsc(modSumTxt)+'</div>'
    +'<div class="pm-field-lbl">'+PM_SVG.note+' Nota para cocina</div>'
    +'<div id="pm-nf-wrap" class="pm-nf-wrap"></div>'
    +'<textarea class="pm-note" placeholder="Ej. caliente, con aji, sin salsa..." id="pm-note-input">'+pmEsc(TP_WIP.note)+'</textarea>'
    +'<div class="pm-field-lbl">Para donde es?</div>'
    +'<div class="pm-seg">'
    +'<button class="'+(TP_WIP.forHere?'on':'')+'" data-dest="here">'+PM_SVG.table+' Para mesa</button>'
    +'<button class="'+(!TP_WIP.forHere?'on':'')+'" data-dest="go">'+PM_SVG.bag+' Para llevar</button>'
    +'</div></div>'
    +'<div class="pm-right">'
    +'<div class="pm-qty-row">'
    +'<div style="display:flex;align-items:center;gap:12px">'
    +'<span style="font-size:13px;font-weight:600;color:#475569">Cantidad</span>'
    +'<div class="pm-stepper"><button id="pm-qty-dec">'+PM_SVG.minus+'</button>'
    +'<span id="pm-qty-val">'+TP_WIP.qty+'</span>'
    +'<button id="pm-qty-inc">'+PM_SVG.plus+'</button></div></div>'
    +'<div style="text-align:right"><div class="pm-pf-lbl">Precio del producto</div>'
    +'<div class="pm-pf-val" id="pm-price-val">'+pmFmt(tpComputePrice())+'</div></div></div>'
    +'<div class="pm-search">'+PM_SVG.srch+'<input placeholder="Buscar adiciones..." id="pm-search-inp"></div>'
    +groupsHTML
    +'</div></div>';
}

// ── Notas frecuentes (selector con chips + buscador) ──────────
var _pmPickerOpen=false, _pmPickerQ='';
function pmNoteTokens(){ return (TP_WIP.note||'').split(',').map(function(s){return s.trim();}).filter(Boolean); }
function pmSetNoteTokens(tokens){ TP_WIP.note=tokens.join(', '); var el=document.getElementById('pm-note-input'); if(el) el.value=TP_WIP.note; }
function pmNotasSource(){
  var cfg={}; try{ cfg=JSON.parse(localStorage.getItem('pos.config.operacion.v1')||'{}'); }catch(e){}
  var nf=cfg.notasFrecuentes; if(!nf||typeof nf!=='object') return [];
  if(nf.modo==='cat'){
    var p=TP_WIP.prod||{}; var cat=(S.cats||[]).find(function(c){return c.id===p.category_id;});
    var name=cat?cat.name:(p.category||''); return (nf.cats&&nf.cats[name])||[];
  }
  return nf.global||[];
}
function pmNotasUso(){ try{ return JSON.parse(localStorage.getItem('pos.notas.uso')||'{}'); }catch(e){ return {}; } }
function pmNotasUsoInc(n){ var u=pmNotasUso(); u[n]=(u[n]||0)+1; try{ localStorage.setItem('pos.notas.uso',JSON.stringify(u)); }catch(e){} }
function pmSelHtml(){
  var src=pmNotasSource(), tokens=pmNoteTokens();
  var selected=src.filter(function(n){return tokens.indexOf(n)>=0;});
  var h='';
  selected.forEach(function(n){ h+='<span class="pm-nf-chip" data-nf-tok="'+pmEsc(n)+'">'+pmEsc(n)+'<button type="button" data-nf-rm="'+pmEsc(n)+'" title="Quitar">&times;</button></span>'; });
  h+='<button type="button" class="pm-nf-add" id="pm-nf-add">+ '+(selected.length?'Otra nota':'Nota frecuente')+'</button>';
  return h;
}
function pmRefreshSelArea(){ var s=document.getElementById('pm-nf-sel'); if(s) s.innerHTML=pmSelHtml(); }
function pmPchip(n,tokens){ var on=tokens.indexOf(n)>=0; return '<button type="button" class="pm-nf-pchip'+(on?' on':'')+'" data-nf-pick="'+pmEsc(n)+'">'+pmEsc(n)+'</button>'; }
function pmRenderPickerList(){
  var list=document.getElementById('pm-nf-list'); if(!list) return;
  var src=pmNotasSource(), tokens=pmNoteTokens();
  var q=(_pmPickerQ||'').trim().toLowerCase();
  var h='';
  if(!q){
    var uso=pmNotasUso();
    var top=src.filter(function(n){return uso[n];}).sort(function(a,b){return uso[b]-uso[a];}).slice(0,4);
    if(top.length){ h+='<div class="pm-nf-grp">Más usadas</div><div class="pm-nf-chips">'+top.map(function(n){return pmPchip(n,tokens);}).join('')+'</div>'; }
  }
  var filtered=src.filter(function(n){return n.toLowerCase().indexOf(q)>=0;});
  h+='<div class="pm-nf-grp">Todas</div>';
  h+= filtered.length ? '<div class="pm-nf-chips">'+filtered.map(function(n){return pmPchip(n,tokens);}).join('')+'</div>' : '<div class="pm-nf-empty">Nada coincide.</div>';
  list.innerHTML=h;
}
function pmRenderNotasFrec(){
  var wrap=document.getElementById('pm-nf-wrap'); if(!wrap) return;
  var src=pmNotasSource();
  if(!src.length){ wrap.innerHTML=''; return; }  // sin notas configuradas → no ocupar espacio
  var h='<div class="pm-nf-sel" id="pm-nf-sel">'+pmSelHtml()+'</div>';
  h+='<div class="pm-nf-picker" id="pm-nf-picker"'+(_pmPickerOpen?'':' hidden')+'>';
  h+='<input class="pm-nf-search" id="pm-nf-search" placeholder="Buscar nota...">';
  h+='<div class="pm-nf-list" id="pm-nf-list"></div>';
  h+='</div>';
  wrap.innerHTML=h;
  if(_pmPickerOpen){ var s=document.getElementById('pm-nf-search'); if(s) s.value=_pmPickerQ; pmRenderPickerList(); }
}

function pmAttachHandlers(inner,p,cur){
  inner.querySelectorAll('.pm-step.done').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const i=parseInt(btn.dataset.stepIdx,10);
      if(!isNaN(i)){ TP_WIP.stepIdx=i; tpRenderMP(); }
    });
  });
  if(cur.kind==='pres'){
    inner.querySelectorAll('.pm-choice[data-pres-id]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const id=btn.dataset.presId,name=btn.dataset.presName,price=+btn.dataset.presPrice;
        TP_WIP.pres={id,name,price};
        inner.querySelectorAll('.pm-choice[data-pres-id]').forEach(b=>{
          const on=b.dataset.presId===id;
          b.classList.toggle('on',on);
          b.querySelector('.pm-radio').innerHTML=on?PM_SVG.check:'';
        });
        const nb=document.getElementById('tp-mp-next'); if(nb) nb.disabled=false;
      });
    });
  }
  if(cur.kind==='var'){
    inner.querySelectorAll('.pm-choice[data-var-id]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const vid=btn.dataset.varId,oid=btn.dataset.optId,oname=btn.dataset.optName,oprice=+btn.dataset.optPrice;
        TP_WIP.vars[vid]={id:oid,name:oname,price:oprice};
        inner.querySelectorAll('.pm-choice[data-var-id="'+vid+'"]').forEach(b=>{
          const on=b.dataset.optId===oid;
          b.classList.toggle('on',on);
          b.querySelector('.pm-radio').innerHTML=on?PM_SVG.check:'';
        });
        // Habilitar "Continuar" cuando la variable de ESTE paso quedó elegida
        const nb=document.getElementById('tp-mp-next'); if(nb) nb.disabled=!TP_WIP.vars[cur.varId];
      });
    });
  }
  if(cur.kind==='custom'){
    const qdec=document.getElementById('pm-qty-dec'),qinc=document.getElementById('pm-qty-inc');
    if(qdec) qdec.addEventListener('click',()=>{ TP_WIP.qty=Math.max(1,TP_WIP.qty-1); pmUpdatePrices(); });
    if(qinc) qinc.addEventListener('click',()=>{ TP_WIP.qty++; pmUpdatePrices(); });
    const noteEl=document.getElementById('pm-note-input');
    if(noteEl){ noteEl.value=TP_WIP.note; noteEl.addEventListener('input',function(){ TP_WIP.note=this.value; if(_pmPickerOpen) pmRenderPickerList(); }); }
    // Notas frecuentes — selector con chips + buscador
    const nfWrap=document.getElementById('pm-nf-wrap');
    if(nfWrap && !nfWrap._bound){
      nfWrap._bound=true;
      nfWrap.addEventListener('click',function(e){
        const add=e.target.closest('#pm-nf-add');
        if(add){ _pmPickerOpen=!_pmPickerOpen; pmRenderNotasFrec(); if(_pmPickerOpen){ const s=document.getElementById('pm-nf-search');
          /* En la tablet, enfocar el buscador ABRE el teclado y tapa justo la
             lista que se acaba de abrir. Solo se enfoca donde hay raton. */
          if(s && window.matchMedia && window.matchMedia('(pointer: fine)').matches) s.focus(); } return; }
        const rm=e.target.closest('[data-nf-rm]');
        if(rm){ const t=pmNoteTokens().filter(function(x){return x!==rm.dataset.nfRm;}); pmSetNoteTokens(t); pmRefreshSelArea(); if(_pmPickerOpen) pmRenderPickerList(); return; }
        const pick=e.target.closest('[data-nf-pick]');
        if(pick){ const n=pick.dataset.nfPick; const toks=pmNoteTokens(); const i=toks.indexOf(n);
          if(i>=0){ toks.splice(i,1); } else { toks.push(n); pmNotasUsoInc(n); }
          pmSetNoteTokens(toks); pick.classList.toggle('on'); pmRefreshSelArea(); return; }
      });
      nfWrap.addEventListener('input',function(e){ if(e.target && e.target.id==='pm-nf-search'){ _pmPickerQ=e.target.value; pmRenderPickerList(); } });
    }
    _pmPickerOpen=false; _pmPickerQ='';
    pmRenderNotasFrec();
    inner.querySelectorAll('.pm-seg button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        TP_WIP.forHere=btn.dataset.dest==='here';
        inner.querySelectorAll('.pm-seg button').forEach(b=>b.classList.toggle('on',b.dataset.dest===(TP_WIP.forHere?'here':'go')));
        pmUpdatePrices(); // C3b: refresh price on llevar/mesa change
      });
    });
    // C4: +/- qty handlers for modifier groups
    inner.querySelectorAll("[data-mod-inc]").forEach(function(incBtn){
      incBtn.addEventListener("click",function(e){
        e.stopPropagation();
        var id=incBtn.dataset.modInc, mname=incBtn.dataset.modName, price=parseFloat(incBtn.dataset.modPrice)||0;
        var g=(p.mod_group_ids||[]).map(function(gid){return (S.modGroups||[]).find(function(g){return g.id===gid;});}).filter(Boolean)
                 .find(function(g){return (g.options||[]).some(function(o){return o.id===id;});});
        var groupMax=g?(g.max_total||(g.options||[]).length):999;
        var grpOpts=g?(g.options||[]).map(function(o){return o.id;})  :[];
        var totalGroupQty=grpOpts.reduce(function(s,oid){return s+((TP_WIP.mods[oid]&&TP_WIP.mods[oid].qty)||0);},0);
        if(totalGroupQty>=groupMax) return;
        if(!TP_WIP.mods[id]) TP_WIP.mods[id]={name:mname,price:price,qty:0};
        TP_WIP.mods[id].qty=(TP_WIP.mods[id].qty||0)+1;
        pmSyncModUI(inner,p);
        pmUpdatePrices();
        var ms=document.getElementById("pm-mod-sum");
        if(ms) ms.textContent=Object.values(TP_WIP.mods).filter(function(m){return m.qty>0;}).map(function(m){return m.qty>1?m.qty+"x "+m.name:m.name;}).join(", ")||"Sin adiciones seleccionadas";
      });
    });
    inner.querySelectorAll("[data-mod-dec]").forEach(function(decBtn){
      decBtn.addEventListener("click",function(e){
        e.stopPropagation();
        var id=decBtn.dataset.modDec;
        if(!TP_WIP.mods[id]||TP_WIP.mods[id].qty<=0) return;
        TP_WIP.mods[id].qty--;
        if(TP_WIP.mods[id].qty<=0) delete TP_WIP.mods[id];
        pmSyncModUI(inner,p);
        pmUpdatePrices();
        var ms=document.getElementById("pm-mod-sum");
        if(ms) ms.textContent=Object.values(TP_WIP.mods).filter(function(m){return m.qty>0;}).map(function(m){return m.qty>1?m.qty+"x "+m.name:m.name;}).join(", ")||"Sin adiciones seleccionadas";
      });
    });
    const sinp=document.getElementById('pm-search-inp');
    if(sinp) sinp.addEventListener('input',function(){
      const q=this.value.toLowerCase().trim();
      inner.querySelectorAll('.pm-mod').forEach(b=>{
        const nm=b.querySelector('.pm-mod-name')?b.querySelector('.pm-mod-name').textContent.toLowerCase():'';
        b.style.display=q&&!nm.includes(q)?'none':'';
      });
    });
  }
}

function pmSyncModUI(inner,p){
  inner.querySelectorAll('[data-mod-id]').forEach(function(div){
    var id=div.dataset.modId;
    var entry=TP_WIP.mods[id];
    var qty=entry?(entry.qty||0):0;
    div.classList.toggle('on',qty>0);
    var numEl=div.querySelector('.pm-mod-qty-num');
    if(numEl) numEl.textContent=qty;
    var decBtn=div.querySelector('[data-mod-dec]');
    if(decBtn) decBtn.disabled=qty<=0;
    var incBtn=div.querySelector('[data-mod-inc]');
    if(incBtn){
      var g=(p.mod_group_ids||[]).map(function(gid){return (S.modGroups||[]).find(function(g){return g.id===gid;});}).filter(Boolean)
                .find(function(g){return (g.options||[]).some(function(o){return o.id===id;});});
      var groupMax=g?(g.max_total||(g.options||[]).length):999;
      var grpOpts=g?(g.options||[]).map(function(o){return o.id;})  :[];
      var totalGroupQty=grpOpts.reduce(function(s,oid){return s+((TP_WIP.mods[oid]&&TP_WIP.mods[oid].qty)||0);},0);
      incBtn.disabled=totalGroupQty>=groupMax;
    }
  });
}

function pmUpdatePrices(){
  const p=document.getElementById('pm-price-val'); if(p) p.textContent=pmFmt(tpComputePrice());
  const f=document.getElementById('pm-foot-price'); if(f) f.textContent=pmFmt(tpComputePrice());
  const q=document.getElementById('pm-qty-val'); if(q) q.textContent=TP_WIP.qty;
}

function tpCheckOverlayClose(e){ if(e.target===e.currentTarget) tpCloseMP(); }

function tpMPAdvance(){
  const steps=pmSteps(TP_WIP.prod);
  TP_WIP.stepIdx=Math.min(steps.length-1,(TP_WIP.stepIdx||0)+1);
  tpRenderMP();
}

function tpMPBack(){
  TP_WIP.stepIdx=Math.max(0,(TP_WIP.stepIdx||0)-1);
  tpRenderMP();
}

function tpCloseMP(){ const el=document.getElementById('tp-modal-producto'); if(el) el.style.display='none'; }

function tpMPAddToCart(){
  const p=TP_WIP.prod;
  // ── Inventario por VARIANTE (Fase 2) ──────────────────────────
  // Chequea SOLO los insumos de la variante/tamaño elegidos (no todo el producto).
  // Envuelto en try/catch: si algo falla, la venta jamás se bloquea.
  try {
    if (!TP_WIP._psOk && window.posStock && posStock.ready) {
      const _sel  = Object.values(TP_WIP.vars || {}).map(function(v){ return v && v.id; }).filter(Boolean);
      const _pres = (TP_WIP.pres && TP_WIP.pres.id && TP_WIP.pres.id !== '_base') ? TP_WIP.pres.id : null;
      let _falt = [];
      if (_sel.length) {
        _sel.forEach(function(oid){ posStock.faltantesVariante(p.id, oid, _pres).forEach(function(n){ if (_falt.indexOf(n) < 0) _falt.push(n); }); });
      } else {
        _falt = posStock.faltantesVariante(p.id, null, _pres);
      }
      if (_falt.length) {
        if (!posStock.allow) { posStock.toast('Sin inventario: ' + _falt.join(', ') + (_falt.length === 1 ? ' agotado' : ' agotados')); return; }
        posStock.warn(p.name, _falt).then(function(ok){ if (ok) { TP_WIP._psOk = true; tpMPAddToCart(); } });
        return;
      }
    }
  } catch (e) { /* fail-safe: nunca bloquear la venta por un error del detector */ }
  TP_WIP._psOk = false;
  // Aviso "vendiendo de bodega" (sub-inventario) — informativo, no bloquea.
  try {
    if (window.posStock && posStock.avisos) {
      const _sel2 = Object.values(TP_WIP.vars || {}).map(v => v && v.id).filter(Boolean);
      const _pres2 = (TP_WIP.pres && TP_WIP.pres.id && TP_WIP.pres.id !== '_base') ? TP_WIP.pres.id : null;
      let _av = [];
      if (_sel2.length) _sel2.forEach(oid => { posStock.avisos(TP_WIP.prod.id, oid, _pres2).forEach(a => { if (_av.indexOf(a) < 0) _av.push(a); }); });
      else _av = posStock.avisos(TP_WIP.prod.id, null, _pres2);
      if (_av.length) posStock.toast('⚠️ ' + _av.join(' · '));
    }
  } catch (e) {}
  // Si la presentación no tiene nombre, usar el nombre de la CATEGORÍA como prefijo.
  const _cat=S.cats.find(c=>c.id===p.category_id);
  const presLabel=(TP_WIP.pres&&TP_WIP.pres.name?TP_WIP.pres.name:'')||(_cat?(_cat.comanda_alias||_cat.name):'');
  const varLabels=Object.values(TP_WIP.vars).map(v=>v.name).join(' · ');
  const displayName=[presLabel,p.name,varLabels].filter(Boolean).join(' · ');
  const modSummary=Object.values(TP_WIP.mods).map(m=>m.name).join(', ');
  const unitPrice=tpComputePrice()/TP_WIP.qty;
  const lineId='li_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const linea = {
    id:null, lineId, productId:p.id, name:displayName, qty:TP_WIP.qty,
    unitPrice, catColor:catColorFor(p.id), modSummary, note:TP_WIP.note||'',
    forHere:TP_WIP.forHere,
    // Guardamos el estado crudo del modal para poder REABRIRLO tal cual al editar
    wip:{ presId:(TP_WIP.pres&&TP_WIP.pres.id)||null, vars:{...TP_WIP.vars}, mods:{...TP_WIP.mods} },
    selections:{pres:presLabel||null,vars:{...TP_WIP.vars},mods:{...TP_WIP.mods}},
  };
  if (TP_WIP.editIdx !== null && TP_WIP.editIdx !== undefined && S.cart[TP_WIP.editIdx]) {
    linea.lineId = S.cart[TP_WIP.editIdx].lineId;   // conservar identidad de la línea
    linea.id     = S.cart[TP_WIP.editIdx].id;
    S.cart[TP_WIP.editIdx] = linea;
  } else {
    S.cart.push(linea);
  }
  tpCloseMP(); paintCartState();
}

// Reabrir el modal de personalización sobre una línea YA agregada, con sus
// adiciones, variables, nota y cantidad tal como quedaron.
function tpEditCartLine(idx) {
  const it = S.cart[idx];
  if (!it) return;
  const p = S.products.find(x => x.id === it.productId);
  if (!p) { showToast && showToast('Producto no disponible en el catálogo'); return; }
  TP_WIP = {
    prod: p, stepIdx: 0, pres: null, vars: {}, mods: {},
    qty: it.qty || 1, note: it.note || '', forHere: it.forHere !== false,
    editIdx: idx,
  };
  const w = it.wip || {};
  const pArr = p.presentations || [];
  TP_WIP.pres = (w.presId && pArr.find(x => x.id === w.presId))
    || (pArr.length === 1 ? pArr[0] : null)
    || (pArr.length ? null : { id:'_base', name:'', price: parseFloat(p.price)||0 });
  if (!TP_WIP.pres && pArr.length <= 1) TP_WIP.pres = { id:'_base', name:'', price: parseFloat(p.price)||0 };
  TP_WIP.vars = { ...(w.vars || it.selections?.vars || {}) };
  TP_WIP.mods = { ...(w.mods || it.selections?.mods || {}) };
  // Abrir directo en "Personalizar" (último paso): es a lo que se va a editar
  const steps = pmSteps(p);
  TP_WIP.stepIdx = Math.max(0, steps.length - 1);
  const el = document.getElementById('tp-modal-producto');
  if (el) el.style.display = 'flex';
  tpRenderMP();
}

function addToCart(prodId) {
  tpOpenProductModal(prodId);
}

// ── Guardar orden ─────────────────────────────────────────────
async function saveOrder() {
  if (!S.cart.length) { toast('Agrega productos antes de guardar', 'warn'); return; }
  try {
    const total   = cartTotal();
    const service = S.serviceEnabled ? total * 0.10 : 0;
    const grand   = total + service;

    let orderId = S.order?.id;

    const cartRows = S.cart.map(it => (_filaConCombo({
      tenant_id:     S.tenantId,
      branch_id:     S.branchId,
      order_id:      null, // se rellena abajo con el orderId real o temporal
      product_id:    it.productId,
      name:          it.name,
      product_name:  it.name,
      unit_price:    it.unitPrice,
      product_price: it.unitPrice,
      quantity:      it.qty,
      total:         it.unitPrice * it.qty,
      notes:         it.note || null,
      status:        'pending',
      selections:    it.selections || {},
    }, it.productId)));

    if (!orderId) {
      // ── Orden nueva: usar batch offline-safe ────────────────
      // Atar el pedido al turno abierto (si no, queda fuera de todo cuadre)
      let _mesaSes = null;
      try { if (typeof window.posSessionId === 'function') _mesaSes = await window.posSessionId(); } catch(e) {}
      const orderData = {
        session_id:  _mesaSes,
        tenant_id:   S.tenantId,
        branch_id:   S.branchId,
        table_id:    S.tableId,
        waiter_id:   S.userId,
        waiter_name: S.waiterName,
        status:      'open',
        channel:     'salon',
        total:       grand,
        guests:      S.personas,
        opened_at:   new Date().toISOString(),
        // Cliente identificado: sin esto la mesa nunca acumula puntos.
        cliente_id:    S.clienteId || null,
        customer_name: S.clienteNombre || null,
      };
      const itemsData = cartRows.map(r => ({ ...r })); // order_id se asigna en el batch

      const sync = window.posSync
        ? await posSync.writeOrderBatch(
            orderData,
            itemsData,
            { id: S.tableId },
            { status: 'esperando' }
          )
        : await (async () => {
            const { data, error } = await sb.from('pos_orders').insert(orderData).select().single();
            if (error) throw error;
            const oid = data.id;
            await sb.from('pos_tables').update({ status: 'ocupada' }).eq('id', S.tableId);
            // Marca de la VISITA. Solo si no habia: si esta mesa ya estaba
            // ocupada y esto es un pedido mas (una segunda ronda), la visita
            // sigue siendo la misma y no se reinicia.
            await sb.from('pos_tables').update({ sesion_at: new Date().toISOString() })
              .eq('id', S.tableId).is('sesion_at', null);
            await sb.from('pos_order_items').insert(itemsData.map(r => ({ ...r, order_id: oid })));
            return { ok: true, offline: false, orderId: oid };
          })();

      if (!sync.ok) throw new Error('No se pudo guardar la orden');
      orderId = sync.orderId;
      S.order = { id: orderId, _offline: sync.offline };
    } else {
      // ── Orden existente: diff en vez de borrar-todo + reinsertar ──────────
      // Los ítems ya guardados conservan su kitchen_printed_at (marca de "ya
      // fue a cocina"); los NUEVOS entran sin marca → al enviar salen solos.
      // (id vacío = ítem nuevo de esta sesión; id real = cargado de la BD.)
      const nuevos      = S.cart.filter(it => !it.id);
      const existentes  = S.cart.filter(it => it.id);
      const idsQueQuedan = existentes.map(it => it.id);

      await sb.from('pos_orders').update({ total: grand, guests: S.personas }).eq('id', orderId);

      // Borrar los ítems que el usuario quitó del carrito
      const { data: dbItems } = await sb.from('pos_order_items').select('id').eq('order_id', orderId);
      const aBorrar = (dbItems || []).map(r => r.id).filter(id => idsQueQuedan.indexOf(id) < 0);
      if (aBorrar.length) await sb.from('pos_order_items').delete().in('id', aBorrar);

      // Actualizar los existentes (cantidad/nombre/selección) SIN tocar kitchen_printed_at
      for (const it of existentes) {
        await sb.from('pos_order_items').update({
          name: it.name, product_name: it.name,
          unit_price: it.unitPrice, product_price: it.unitPrice,
          quantity: it.qty, total: it.unitPrice * it.qty,
          notes: it.note || null, selections: it.selections || {},
        }).eq('id', it.id);
      }

      // Insertar los nuevos (kitchen_printed_at queda null → se imprimen como nuevos)
      if (nuevos.length) {
        const rowsNuevos = nuevos.map(it => (_filaConCombo({
          tenant_id: S.tenantId, branch_id: S.branchId, order_id: orderId,
          product_id: it.productId, name: it.name, product_name: it.name,
          unit_price: it.unitPrice, product_price: it.unitPrice,
          quantity: it.qty, total: it.unitPrice * it.qty,
          notes: it.note || null, status: 'pending', selections: it.selections || {},
        }, it.productId)));
        const { error: insErr } = await sb.from('pos_order_items').insert(rowsNuevos);
        if (insErr) throw insErr;
      }
    }

    // Actualizar ids en carrito (solo si estamos online y hay id real de Supabase)
    if (!S.order?._offline) {
      const { data: fresh } = await sb.from('pos_order_items').select('id, product_id, name').eq('order_id', orderId);
      if (fresh) {
        S.cart.forEach(it => {
          const row = fresh.find(r => r.product_id === it.productId && r.name === it.name);
          if (row) it.id = row.id;
        });
      }
    }

    toast('Pedido guardado' + (S.order?._offline ? ' (sin conexión)' : ''), 'ok');
  } catch(e) {
    console.error('saveOrder:', e);
    toast('Error al guardar: ' + (e?.message || e), 'error');
  }
}

// ── Enviar a cocina ───────────────────────────────────────────
async function sendToKitchen() {
  if (!S.cart.length) { toast('Agrega productos antes de enviar', 'warn'); return; }
  const btn = document.querySelector('[data-action="enviar-cocina"]');
  const iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

  // Leer modo cobro desde localStorage (sincronizado por ventas-salon)
  const cobroAdelantado = localStorage.getItem('pos.config.cobro_adelantado') === 'true';

  await saveOrder();
  if (!S.order?.id) {
    if (btn) { btn.disabled = false; btn.innerHTML = iconSvg + ' Enviar a cocina'; }
    return;
  }
  try {
    // Determinar estado según modo cobro:
    // Cobro adelantado: mesa → pendiente_pago, pedido NO visible en cocina aún
    // Cobro al final:   mesa → esperando,       pedido visible en cocina de una
    const tableSt     = cobroAdelantado ? 'pendiente_pago' : 'esperando';
    const visibleCoc  = !cobroAdelantado;

    // 1. Actualizar pedido
    await sb.from('pos_orders')
      .update({ status: 'in_progress', visible_cocina: visibleCoc })
      .eq('id', S.order.id);
    S.order.status = 'in_progress';

    // 2. Upsert mesa en pos_tables
    const tableData = S.table || {};
    const tableRow = {
      id:               S.tableId,
      name:             tableData.name || S.tableId,
      number:           parseInt(tableData.name, 10) || 0,
      status:           tableSt,
      branch_id:        S.branchId,
      tenant_id:        S.tenantId,
      current_order_id: S.order.id,
    };
    await sb.from('pos_tables').upsert(tableRow, { onConflict: 'id' });

    // 3. Toast + imprimir comanda + redirect
    const msg = cobroAdelantado
      ? '¡Pedido creado! Pendiente de cobro.'
      : '¡Enviado a cocina! Volviendo…';
    toast(msg, 'ok');
    if (btn) { btn.textContent = cobroAdelantado ? '✓ Pendiente cobro' : '✓ En cocina'; }
    // Esperar a que la comanda termine de imprimir antes de redirigir (máx 4 seg)
    if (typeof posAutoprint === 'function' && S.order?.id && !S.order._offline && window.electronPOS) {
      await Promise.race([posAutoprint(S.order.id), new Promise(res => setTimeout(res, 9000))]);
    }
    setTimeout(() => { window.location.href = 'ventas.html'; }, window.electronPOS ? 600 : 1500);
  } catch(e) {
    console.error('sendToKitchen:', e);
    toast('Error al enviar: ' + (e?.message || e), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = iconSvg + ' Enviar a cocina'; }
  }
}

// ── Búsqueda ──────────────────────────────────────────────────
// ── Tabs ──────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.lm-bigtab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tp-pane').forEach(p => {
    p.classList.toggle('on', p.dataset.pane === name);
  });
  // Al abrir favoritos, refrescar por si cambió
  if (name === 'favoritos') renderFavs();
}

// ── Personas stepper ──────────────────────────────────────────
/* El numero de personas se pintaba en dos sitios y se OLVIDABA en un tercero:
   el que llega por la URL al abrir la mesa desde el salon. Se guardaba bien (por
   eso la comanda salia correcta) pero en pantalla quedaba el "2" escrito a mano
   en el HTML. Ahora hay un solo sitio que lo pinta. */
function pintarPersonas() {
  var el = $('personas-num');
  if (el) el.textContent = S.personas;
}
function changPersonas(dir) {
  S.personas = Math.max(1, S.personas + dir);
  pintarPersonas();
}

// ── Sub-vistas de categoría ───────────────────────────────────
function showCatSub(name) {
  document.querySelectorAll('[data-pane="categoria"] .tp-sub').forEach(s => {
    s.classList.toggle('on', s.dataset.sub === name);
  });
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  let el = document.getElementById('pos-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pos-toast';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.16);transition:opacity .3s;pointer-events:none;font-family:DM Sans,system-ui,sans-serif';
    document.body.appendChild(el);
  }
  const styles = {
    ok:    'background:#16A34A;color:#fff',
    error: 'background:#EF4444;color:#fff',
    warn:  'background:#F59E0B;color:#fff',
  };
  el.style.cssText += ';' + (styles[type] || styles.ok);
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

// ── Escape HTML ───────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event listeners ───────────────────────────────────────────
function bindEvents() {

  // Sidebar toggle (tablet compacto)
  // ── Barra lateral en tablet: se DESLIZA (o se toca) ──────────────────
  // Abrir: arrastrar el asa a la derecha, o tocarla.
  // Cerrar: arrastrar a la izquierda (asa o barra), tocar el asa, o tocar fuera.
  (function setupSideGesture() {
    const side = document.querySelector('.tp-side');
    const grip = document.getElementById('tp-side-toggle');
    const backdrop = document.getElementById('tp-side-backdrop');
    if (!side || !grip) return;
    const UMBRAL = 40;   // px de arrastre para que cuente como deslizamiento

    const abierta = () => side.classList.contains('tp-side--expanded');
    function setOpen(open) {
      side.classList.toggle('tp-side--expanded', open);
      if (backdrop) backdrop.classList.toggle('is-visible', open);
      const t = open ? 'Desliza o toca para cerrar el menú' : 'Desliza o toca para abrir el menú';
      grip.title = t;
      grip.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    }

    let x0 = 0, y0 = 0, dx = 0, arrastrando = false, movio = false;
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      arrastrando = true; movio = false; dx = 0;
      x0 = e.clientX; y0 = e.clientY;
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', e => {
      if (!arrastrando) return;
      dx = e.clientX - x0;
      if (Math.abs(dx) > 6 || Math.abs(e.clientY - y0) > 6) movio = true;
      // El asa acompaña al dedo (tope de 34px) para que el gesto se sienta vivo
      const lim = Math.max(-34, Math.min(34, dx));
      grip.style.transform = `translateX(${lim}px)`;
    });
    function finArrastre() {
      if (!arrastrando) return;
      arrastrando = false;
      grip.style.transform = '';
      if (!movio) { setOpen(!abierta()); return; }   // fue un toque simple
      if (dx >  UMBRAL) setOpen(true);
      else if (dx < -UMBRAL) setOpen(false);
    }
    grip.addEventListener('pointerup', finArrastre);
    grip.addEventListener('pointercancel', finArrastre);

    // Deslizar hacia la izquierda sobre la barra abierta también cierra
    let sx = 0, siguiendo = false;
    side.addEventListener('pointerdown', e => {
      if (!abierta() || e.target.closest('.tp-side-grip')) return;
      siguiendo = true; sx = e.clientX;
    });
    side.addEventListener('pointerup', e => {
      if (!siguiendo) return;
      siguiendo = false;
      if (e.clientX - sx < -UMBRAL) setOpen(false);
    });

    // Tocar fuera de la barra la cierra
    if (backdrop) backdrop.addEventListener('click', () => setOpen(false));
  })();

  // Tabs del browser
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Acciones del sidebar
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      switch (btn.dataset.action) {
        case 'back':         window.location.href = 'ventas.html'; break;
        case 'nav-domicilio': window.location.href = 'domicilios.html'; break;
        case 'guardar':      saveOrder(); break;
        case 'enviar-cocina':
          if (window.posGuard) window.posGuard('pedidos.cocina', sendToKitchen, 'Enviar a cocina requiere permiso de administrador.');
          else sendToKitchen();
          break;
        // 'pago' eliminado: el cobro se hace desde el panel de mesa en ventas.html
        // ("Cobrar" / "Cobrar y enviar a cocina", modules/ventas-salon.js). Este
        // botón dentro de la mesa era un atajo duplicado.
        case 'vaciar':       clearCart(); break;
        default: break;
      }
    });
  });

  // Personas stepper
  document.querySelectorAll('[data-personas]').forEach(btn => {
    btn.addEventListener('click', () => changPersonas(btn.dataset.personas === 'inc' ? 1 : -1));
  });

  // Clics delegados en el body (tarjetas, carrito, favoritos)
  document.body.addEventListener('click', e => {

    // Botón favorito
    const favBtn = e.target.closest('[data-fav-id]');
    if (favBtn) {
      e.stopPropagation();
      toggleFav(favBtn.dataset.favId, favBtn);
      return;
    }

    // Tarjeta de producto → agregar
    const prodBtn = e.target.closest('[data-prod-id]');
    if (prodBtn) {
      const _pid = prodBtn.dataset.prodId;
      if (window.posStock && posStock.agotado(_pid)) {
        const _falt = posStock.faltantes(_pid);
        if (!posStock.allow) { posStock.toast('Sin inventario: ' + _falt.join(', ') + (_falt.length === 1 ? ' agotado' : ' agotados')); return; }
        const _pr = S.products.find(p => p.id === _pid);
        posStock.warn(_pr ? _pr.name : 'Producto', _falt).then(function (ok) { if (ok) addToCart(_pid); });
        return;
      }
      addToCart(_pid);
      return;
    }

    // Categoría
    const catBtn = e.target.closest('[data-cat-id]');
    if (catBtn) {
      renderProdGrid(catBtn.dataset.catId, catBtn.dataset.catName, catBtn.dataset.catColor);
      showCatSub('products');
      return;
    }

    // Volver al grid de categorías
    if (e.target.closest('[data-sub-back]')) {
      showCatSub('grid');
      return;
    }

    // Editar una línea (reabre el modal de personalización)
    const editBtn = e.target.closest('[data-cart-edit]');
    if (editBtn) {
      tpEditCartLine(parseInt(editBtn.dataset.cartEdit, 10));
      return;
    }

    // Quitar una línea completa
    const delBtn = e.target.closest('[data-cart-del]');
    if (delBtn) {
      S.cart.splice(parseInt(delBtn.dataset.cartDel, 10), 1);
      paintCartState();
      return;
    }

    // Incrementar en carrito
    const incBtn = e.target.closest('[data-cart-inc]');
    if (incBtn) {
      const idx = parseInt(incBtn.dataset.cartInc);
      S.cart[idx].qty++;
      paintCartState();
      return;
    }

    // Decrementar en carrito
    if(e.target.closest('[data-tp-mp-cancel]')){tpCloseMP();return;}
    if(e.target.id==='tp-modal-producto'){tpCloseMP();return;}
    const decBtn = e.target.closest('[data-cart-dec]');
    if (decBtn) {
      const idx = parseInt(decBtn.dataset.cartDec);
      S.cart[idx].qty--;
      if (S.cart[idx].qty <= 0) S.cart.splice(idx, 1);
      paintCartState();
      return;
    }
  });

}

// ── Favoritos ─────────────────────────────────────────────────
function toggleFav(prodId, btn) {
  if (S.favs.has(prodId)) {
    S.favs.delete(prodId);
    btn.querySelector('svg').setAttribute('fill', 'none');
    btn.querySelector('svg').setAttribute('stroke', '#94A3B8');
    btn.classList.remove('is-fav');
  } else {
    S.favs.add(prodId);
    btn.querySelector('svg').setAttribute('fill', '#F59E0B');
    btn.querySelector('svg').setAttribute('stroke', '#F59E0B');
    btn.classList.add('is-fav');
  }
  localStorage.setItem('pos_favs', JSON.stringify([...S.favs]));
  $('fav-count').textContent = S.favs.size;
}

// ── Vaciar carrito ────────────────────────────────────────────
async function clearCart() {
  if (!S.cart.length) return;
  const okClear = await tpConfirm({ title: 'Vaciar comanda', msg: '¿Eliminar todos los productos de la comanda?', okLabel: 'Vaciar', variant: 'danger' });
  if (!okClear) return;
  S.cart = [];
  paintCartState();
}

/* ══════════════════════════════════════════════════════════════════
   CLIENTE DE LA MESA
   La fila "Selecciona un cliente" existia en el HTML pero NO tenia codigo
   detras: era decorativa. Por eso ninguna mesa acumulaba puntos — de 50
   pedidos de salon, 0 tenian cliente.

   Al elegirlo se guarda `cliente_id` en el pedido, y con eso la base le suma
   los puntos sola cuando la mesa se cobra (trigger `award_loyalty_points`).
   ══════════════════════════════════════════════════════════════════ */
function tpDig(s) { return String(s == null ? '' : s).replace(/[^0-9]/g, ''); }
function tpTel10(s) { const d = tpDig(s); return d.length > 10 ? d.slice(-10) : d; }
function tpEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function tpBuscarCliente(tel) {
  const t = tpTel10(tel);
  if (t.length < 7) return null;
  try {
    const r = await sb.from('pos_clientes').select('id,nombre,telefono,barrio')
      .eq('tenant_id', S.tenantId).ilike('telefono', '%' + t).limit(1);
    return (r.data && r.data[0]) || null;
  } catch (e) { return null; }
}

async function tpPuntosDe(tel) {
  const t = tpTel10(tel);
  if (t.length < 7) return 0;
  try {
    const r = await sb.from('pos_puntos').select('puntos')
      .eq('tenant_id', S.tenantId).ilike('telefono', '%' + t).maybeSingle();
    return (r.data && Number(r.data.puntos)) || 0;
  } catch (e) { return 0; }
}

async function tpPintarCliente() {
  const ph = document.getElementById('cliente-placeholder');
  const row = document.getElementById('cliente-row');
  if (!ph) return;
  if (!S.clienteId && !S.clienteTel) {
    ph.textContent = 'Selecciona un cliente';
    if (row) row.classList.remove('has-client');
    return;
  }
  if (row) row.classList.add('has-client');
  const pts = S.clienteTel ? await tpPuntosDe(S.clienteTel) : 0;
  ph.textContent = (S.clienteNombre || S.clienteTel)
    + (S.clienteTel ? '  ·  ' + pts + ' pts' : '');
}

function tpModalCliente() {
  /* El MISMO selector de Domicilios (pos-cliente-picker.js): lista completa con
     avatar, telefono y direccion, buscador que filtra al escribir y creacion de
     cliente nuevo. Lee y escribe en `pos_clientes` por `posClientes`, o sea la
     misma base que Domicilios — un cliente creado aqui aparece alla y al reves. */
  if (!window.posClientePicker) { alert('El selector de clientes no está disponible.'); return; }
  posClientePicker.abrir({
    tenantId: S.tenantId,
    branchId: S.branchId,
    onPick: function (c) {
      if (!c) return;
      tpGuardarCliente(c.id || null, c.nombre || '', c.tel || '');
    },
  });
}

/* Si la mesa ya tiene pedido, se guarda YA. Si todavia no existe (comanda
   vacia), queda en memoria y se escribe al crear la orden. */
async function tpGuardarCliente(id, nombre, tel) {
  S.clienteId = id; S.clienteNombre = nombre || ''; S.clienteTel = tel || '';
  if (S.order && S.order.id) {
    try {
      await sb.from('pos_orders').update({
        cliente_id: id, customer_name: nombre || null,
      }).eq('id', S.order.id);
    } catch (e) { console.error('[tomar-pedido] no se pudo asociar el cliente:', e); }
  }
  tpPintarCliente();
}

document.addEventListener('DOMContentLoaded', function () {
  const row = document.getElementById('cliente-row');
  if (row) {
    row.style.cursor = 'pointer';
    row.addEventListener('click', tpModalCliente);
  }
});
