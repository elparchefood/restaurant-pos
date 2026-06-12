/* ============================================================
   TOMAR PEDIDO — tomar-pedido.js
   Página de pedido dentro de una mesa.
   Depende de: pos-core.js (sb, $, COPF, COP)
   ============================================================ */

// ── Estado global ────────────────────────────────────────────
const S = {
  userId: null, tenantId: null, branchId: null,
  waiterName: '—', tableId: null, table: null,
  cats: [], products: [],
  order: null,  // registro en pos_orders (si ya existe)
  cart: [],     // [{id, productId, name, qty, unitPrice, catColor, selections:{pres,var,mods}}]
  favs: new Set(JSON.parse(localStorage.getItem('pos_favs') || '[]')),
  personas: 2,
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
  S.waiterName= user.user_metadata?.nombre || user.user_metadata?.name || user.email?.split('@')[0] || '—';

  // 2. Leer tableId de la URL
  const params = new URLSearchParams(window.location.search);
  S.tableId = params.get('table');
  if (!S.tableId) { window.location.href = 'ventas.html'; return; }

  // 3. Pintar shell inmediato
  paintShell();

  // 4. Cargar datos en paralelo
  await Promise.all([
    loadTable(),
    loadCatalog(),
  ]);

  // 5. Cargar pedido activo de la mesa (si existe)
  await loadOpenOrder();

  // 6. Renderizar vistas
  renderCatGrid();
  renderMenuTab();
  renderFavs();
  paintCartState();

  // 7. Listeners
  bindEvents();
});

// ── Shell inmediato ──────────────────────────────────────────
function paintShell() {
  $('tp-user-name').textContent = S.waiterName;
  $('tp-waiter-name').textContent = S.waiterName;
  const initials = S.waiterName.slice(0,2).toUpperCase();
  $('tp-user-avatar').textContent = initials;
}

// ── Carga de mesa ────────────────────────────────────────────
async function loadTable() {
  try {
    const { data } = await sb.from('pos_tables').select('*').eq('id', S.tableId).single();
    S.table = data;
    paintTableInfo(data);
  } catch(e) {
    console.error('loadTable:', e);
  }
}

function paintTableInfo(t) {
  if (!t) return;
  const name = t.name || 'Mesa';
  $('tp-mesa-title').textContent     = name;
  $('tp-crumb-mesa').textContent      = name;
  $('tp-branch-name').textContent     = t.zone || '—';
  S.openAt = t.opened_at || new Date().toISOString();
  $('tp-hora-apertura').textContent   = fmtTime(S.openAt);
}

// ── Catálogo ─────────────────────────────────────────────────
async function loadCatalog() {
  try {
    const [{ data: cats }, { data: prods }] = await Promise.all([
      sb.from('pos_categories').select('*').eq('tenant_id', S.tenantId).order('name'),
      sb.from('pos_products')  .select('*').eq('tenant_id', S.tenantId).eq('available', true).order('name'),
    ]);
    S.cats     = (cats  || []).map((c, i) => ({
      ...c,
      color: c.color || CAT_PALETTE[i % CAT_PALETTE.length].color,
      tint:  c.color_tint || CAT_PALETTE[i % CAT_PALETTE.length].tint,
    }));
    S.products = prods || [];
  } catch(e) {
    console.error('loadCatalog:', e);
  }
}

// ── Pedido abierto ───────────────────────────────────────────
async function loadOpenOrder() {
  try {
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
    S.personas = data.guests || 2;
    $('personas-num').textContent = S.personas;
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
    return `
    <button class="lm-cat" data-cat-id="${cat.id}" data-cat-name="${escHtml(cat.name)}" data-cat-color="${cat.color}">
      <div class="tp-thumb" style="height:90px;width:100%;margin:0;border-radius:0">
        <div class="tp-thumb-label">${escHtml(cat.name.slice(0,14))}</div>
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
function renderMenuTab() {
  const scroll = $('menu-scroll');
  if (!S.cats.length) {
    scroll.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:28px 0;text-align:center">Sin productos en el catálogo</div>`;
    return;
  }
  scroll.innerHTML = S.cats.map(cat => {
    const prods = S.products.filter(p => p.category_id === cat.id);
    if (!prods.length) return '';
    return `
    <div class="tp-menusection" style="margin-bottom:22px">
      <div class="tp-gridhead" style="margin-bottom:10px;flex-shrink:0">
        <span class="tp-catdot" style="background:${cat.color}"></span>
        <span class="tp-gridhead-title" style="font-size:14px;font-weight:700">${escHtml(cat.name)}</span>
        <span class="tp-countpill">${prods.length}</span>
      </div>
      <div class="tp-prodgrid-row" style="display:flex;flex-wrap:wrap;gap:12px">
        ${prods.map(p => prodCard(p, cat.color)).join('')}
      </div>
    </div>`;
  }).join('');
}

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
  <button class="lm-prod${inCart ? ' pulse' : ''}" data-prod-id="${p.id}" style="position:relative">
    <div class="tp-prod-thumbwrap">
      ${p.photo_url
        ? `<img src="${p.photo_url}" alt="${escHtml(p.name)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:9px 9px 0 0;display:block">`
        : `<div class="tp-thumb" style="height:90px;width:100%;border-radius:9px 9px 0 0;border:none">
             <div class="tp-thumb-label">${escHtml(p.name.slice(0,12))}</div>
           </div>`
      }
      <button class="lm-fav-btn${isFav ? ' is-fav' : ''}" data-fav-id="${p.id}" title="Favorito" style="position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.9);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="${isFav ? '#F59E0B' : 'none'}" stroke="${isFav ? '#F59E0B' : '#94A3B8'}" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
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
  const service = total * 0.10;
  const grand   = total + service;

  $('t-subtotal').textContent = COPF(total);
  $('t-servicio').textContent = COPF(service);
  $('t-total').textContent    = COPF(grand);

  $('cart-count-label').textContent = `Comanda · ${S.cart.length} ítem${S.cart.length !== 1 ? 's' : ''}`;
  $('cartmini-title').textContent   = `${S.cart.length} ítem${S.cart.length !== 1 ? 's' : ''} en cuenta`;
  $('cartmini-sub').textContent     = COPF(grand);

  $('cart-lines').innerHTML = S.cart.map((it, idx) => `
  <div class="tp-cartline" id="cartline-${idx}">
    <div class="tp-cartline-main">
      <div class="tp-cartline-name">${escHtml(it.name)}</div>
      <div class="tp-cartline-meta">
        <span class="dot" style="background:${it.catColor || '#94A3B8'}"></span>
        <span class="txt">${COPF(it.unitPrice)} c/u${it.selections?.pres ? ' · ' + escHtml(it.selections.pres) : ''}${it.selections?.var ? ' · ' + escHtml(it.selections.var) : ''}</span>
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
  </div>`).join('');
}

// ── Agregar al carrito ────────────────────────────────────────
function addToCart(prodId) {
  const prod = S.products.find(p => p.id === prodId);
  if (!prod) return;
  const color = catColorFor(prodId);
  const price = basePrice(prod);
  const existing = S.cart.find(it => it.productId === prodId && !it.selections?.pres && !it.selections?.var);
  if (existing) {
    existing.qty++;
  } else {
    S.cart.push({
      id: null,
      productId: prodId,
      name: prod.name,
      qty: 1,
      unitPrice: price,
      catColor: color,
      selections: {},
    });
  }
  paintCartState();
  // Pulso visual en la tarjeta
  const btn = document.querySelector(`[data-prod-id="${prodId}"]`);
  if (btn) { btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 600); }
}

// ── Guardar orden ─────────────────────────────────────────────
async function saveOrder() {
  if (!S.cart.length) { toast('Agrega productos antes de guardar', 'warn'); return; }
  try {
    const total   = cartTotal();
    const service = total * 0.10;
    const grand   = total + service;

    let orderId = S.order?.id;

    // Upsert pos_orders
    if (!orderId) {
      const { data, error } = await sb.from('pos_orders').insert({
        tenant_id:  S.tenantId,
        branch_id:  S.branchId,
        table_id:   S.tableId,
        waiter_id:  S.userId,
        status:     'open',
        channel:    'salon',
        total:      grand,
        guests:     S.personas,
      }).select().single();
      if (error) throw error;
      S.order = data;
      orderId = data.id;
      // Marcar mesa como ocupada
      await sb.from('pos_tables').update({ status: 'ocupada' }).eq('id', S.tableId);
    } else {
      await sb.from('pos_orders').update({ total: grand, guests: S.personas }).eq('id', orderId);
    }

    // Sincronizar ítems
    // Eliminar ítems con id (guardados) y re-insertar todos (simple y seguro)
    await sb.from('pos_order_items').delete().eq('order_id', orderId);
    const rows = S.cart.map(it => ({
      tenant_id:  S.tenantId,
      branch_id:  S.branchId,
      order_id:   orderId,
      product_id: it.productId,
      name:       it.name,
      quantity:   it.qty,
      unit_price: it.unitPrice,
      total:      it.unitPrice * it.qty,
      selections: it.selections || {},
    }));
    const { error: itemsErr } = await sb.from('pos_order_items').insert(rows);
    if (itemsErr) throw itemsErr;

    // Actualizar ids en carrito
    const { data: fresh } = await sb.from('pos_order_items').select('id, product_id, name').eq('order_id', orderId);
    if (fresh) {
      S.cart.forEach(it => {
        const row = fresh.find(r => r.product_id === it.productId && r.name === it.name);
        if (row) it.id = row.id;
      });
    }

    toast('Pedido guardado', 'ok');
  } catch(e) {
    console.error('saveOrder:', e);
    toast('Error al guardar: ' + (e?.message || e), 'error');
  }
}

// ── Enviar a cocina ───────────────────────────────────────────
async function sendToKitchen() {
  if (!S.cart.length) { toast('Agrega productos antes de enviar', 'warn'); return; }
  await saveOrder();
  if (!S.order?.id) return;
  try {
    await sb.from('pos_orders').update({ status: 'in_progress' }).eq('id', S.order.id);
    S.order.status = 'in_progress';
    toast('¡Enviado a cocina!', 'ok');
    // Pulso visual breve en comanda
    const foot = $('comanda-foot');
    if (foot) { foot.style.background = '#DCFCE7'; setTimeout(() => foot.style.background = '', 900); }
  } catch(e) {
    console.error('sendToKitchen:', e);
    toast('Error al enviar: ' + (e?.message || e), 'error');
  }
}

// ── Búsqueda ──────────────────────────────────────────────────
function doSearch(q) {
  const results   = $('search-results');
  const empty     = $('search-empty');
  const clearBtn  = $('search-clear');
  const hint      = $('search-hint');
  q = q.trim().toLowerCase();

  if (!q) {
    results.style.display = 'none';
    empty.style.display   = '';
    clearBtn.style.display = 'none';
    hint.textContent = 'Busca entre los productos del menú';
    return;
  }

  clearBtn.style.display = '';
  const found = S.products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  );

  if (!found.length) {
    results.style.display = 'none';
    empty.style.display   = '';
    hint.textContent = `Sin resultados para "${q}"`;
    return;
  }

  empty.style.display   = 'none';
  results.style.display = '';
  results.innerHTML = found.map(p => prodCard(p, catColorFor(p.id))).join('');
}

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
function changPersonas(dir) {
  S.personas = Math.max(1, S.personas + dir);
  $('personas-num').textContent = S.personas;
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
        case 'enviar-cocina':sendToKitchen(); break;
        case 'pago':         toast('Módulo de pago próximamente', 'warn'); break;
        case 'vaciar':       clearCart(); break;
        case 'release':      releaseTable(); break;
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
      addToCart(prodBtn.dataset.prodId);
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

    // Incrementar en carrito
    const incBtn = e.target.closest('[data-cart-inc]');
    if (incBtn) {
      const idx = parseInt(incBtn.dataset.cartInc);
      S.cart[idx].qty++;
      paintCartState();
      return;
    }

    // Decrementar en carrito
    const decBtn = e.target.closest('[data-cart-dec]');
    if (decBtn) {
      const idx = parseInt(decBtn.dataset.cartDec);
      S.cart[idx].qty--;
      if (S.cart[idx].qty <= 0) S.cart.splice(idx, 1);
      paintCartState();
      return;
    }
  });

  // Búsqueda
  const searchInput = $('search-input');
  searchInput?.addEventListener('input', () => doSearch(searchInput.value));
  $('search-clear')?.addEventListener('click', () => {
    searchInput.value = '';
    doSearch('');
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
function clearCart() {
  if (!S.cart.length) return;
  if (!confirm('¿Vaciar toda la comanda?')) return;
  S.cart = [];
  paintCartState();
}

// ── Liberar mesa ──────────────────────────────────────────────
async function releaseTable() {
  if (S.cart.length && !confirm('¿Liberar la mesa? Se perderá la comanda no guardada.')) return;
  try {
    await sb.from('pos_tables').update({ status: 'libre' }).eq('id', S.tableId);
    if (S.order?.id && S.order.status === 'open') {
      await sb.from('pos_orders').update({ status: 'cancelled' }).eq('id', S.order.id);
    }
    window.location.href = 'ventas.html';
  } catch(e) {
    toast('Error al liberar: ' + (e?.message || e), 'error');
  }
}
