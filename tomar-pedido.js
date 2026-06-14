/* ============================================================
   TOMAR PEDIDO — tomar-pedido.js
   Página de pedido dentro de una mesa.
   Depende de: pos-core.js (sb, $, COPF, COP)
   ============================================================ */

// ── Estado global ────────────────────────────────────────────
const S = {
  userId: null, tenantId: null, branchId: null,
  waiterName: '—', userRole: '—', tableId: null, table: null,
  serviceEnabled: true,
  cats: [], products: [],
  order: null,  // registro en pos_orders (si ya existe)
  cart: [],     // [{id, productId, name, qty, unitPrice, catColor, selections:{pres,var,mods}}]
  modGroups: [],
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
  const { data: posUser } = await sb.from('pos_users').select('name, role').eq('auth_user_id', user.id).maybeSingle();
  S.waiterName = posUser?.name || user.user_metadata?.nombre || user.user_metadata?.name || user.email?.split('@')[0] || '—';
  S.userRole   = posUser?.role || user.user_metadata?.role || 'Administrador';

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
      const local = JSON.parse(localStorage.getItem('lumen.config.salon.v1') || '{}');
      const t = (local.tables || []).find(t => t.id === S.tableId);
      if (t) {
        S.table = t;
        paintTableInfo(t);
      }
    }
  } catch(e) {
    // Intentar localStorage si Supabase falla
    try {
      const local = JSON.parse(localStorage.getItem('lumen.config.salon.v1') || '{}');
      const t = (local.tables || []).find(t => t.id === S.tableId);
      if (t) { S.table = t; paintTableInfo(t); }
    } catch(_) {}
  }
}

function paintTableInfo(t) {
  if (!t) return;
  const name = t.name || 'Mesa';
  $('tp-mesa-title').textContent   = name;
  $('tp-crumb-mesa').textContent   = name;
  $('tp-branch-name').textContent  = t.zone || t.zoneId || '—';
  // hora apertura: usar la del pedido activo; por ahora marcar now como fallback
  if (!S.openAt) {
    S.openAt = new Date().toISOString();
    $('tp-hora-apertura').textContent = fmtTime(S.openAt);
  }
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
    S.products = (prods || []).map(p => ({
      ...p,
      presentations: Array.isArray(p.presentations) ? p.presentations : [],
      variables:     Array.isArray(p.variables)     ? p.variables     : [],
      mod_group_ids: Array.isArray(p.mod_group_ids) ? p.mod_group_ids : [],
    }));
    // Cargar modificadores en segundo plano (no bloquea catálogo)
    sb.from('pos_modifier_groups').select('id,name,rule,multi,options').eq('tenant_id', S.tenantId)
      .then(({data}) => {
        S.modGroups = (data||[]).map(g => ({
          id:g.id, name:g.name, rule:g.rule||'opcional', multi:!!g.multi,
          options: Array.isArray(g.options)?g.options:[],
        }));
      });
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
function toggleService(){
  S.serviceEnabled = !S.serviceEnabled;
  paintCartState();
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

  $('t-subtotal').textContent = COPF(total);
  $('t-servicio').textContent = S.serviceEnabled ? COPF(service) : '—';
  $('t-total').textContent    = COPF(grand);
  const tog = $('service-toggle');
  if(tog) tog.classList.toggle('on', S.serviceEnabled);

  $('cart-count-label').textContent = `Comanda · ${S.cart.length} ítem${S.cart.length !== 1 ? 's' : ''}`;
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

let TP_WIP = { prod:null, step:1, pres:null, vars:{}, mods:{}, qty:1, note:'', forHere:true };

function tpOpenProductModal(prodId) {
  const p = S.products.find(x=>x.id===prodId);
  if(!p) return;
  TP_WIP = { prod:p, step:1, pres:null, vars:{}, mods:{}, qty:1, note:'', forHere:true };
  const hasPres=(p.presentations||[]).length>1, hasVars=(p.variables||[]).length>0;
  if(!hasPres){
    const pArr=p.presentations||[];
    TP_WIP.pres = pArr.length===1?pArr[0]:{id:'_base',name:'',price:parseFloat(p.price)||0};
    TP_WIP.step = hasVars?2:3;
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
  const modX=Object.values(TP_WIP.mods).reduce((s,m)=>s+(m.price||0),0);
  return (base+modX)*TP_WIP.qty;
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
  const hasPres=(p.presentations||[]).length>1, hasVars=(p.variables||[]).length>0;
  const steps=[];
  if(hasPres) steps.push({id:'pres',label:p.presLabel||'Presentacion'});
  if(hasVars) steps.push({id:'var',label:p.varLabel||(p.variables[0]&&p.variables[0].name)||'Variante'});
  steps.push({id:'custom',label:'Personalizar'});
  const curId=TP_WIP.step===1&&hasPres?'pres':TP_WIP.step===2&&hasVars?'var':'custom';
  const curIdx=steps.findIndex(s=>s.id===curId);
  const stepperHTML=steps.length>1?'<div class="pm-steps">'+steps.map((s,i)=>{
    const done=i<curIdx,on=i===curIdx;
    return '<button class="pm-step'+(done?' done':on?' on':'')+'" data-step-id="'+s.id+'">'
      +'<span class="pm-step-dot">'+(done?PM_SVG.check:String(i+1))+'</span>'
      +'<span class="pm-step-lbl">'+s.label+'</span></button>'
      +(i<steps.length-1?'<span class="pm-step-line'+(done?' done':'')+'"></span>':'');
  }).join('')+'</div>':'';
  const presLabel=TP_WIP.pres&&TP_WIP.pres.name?TP_WIP.pres.name:'';
  const varLabels=Object.values(TP_WIP.vars).map(v=>v.name).join(' · ');
  const selParts=[presLabel,varLabels].filter(Boolean).join(' · ');
  let paneHTML='';
  if(curId==='pres') paneHTML=pmBuildPresPane(p);
  else if(curId==='var') paneHTML=pmBuildVarPane(p);
  else paneHTML=pmBuildCustomPane(p);
  const canNext=curId==='pres'?!!TP_WIP.pres:curId==='var'?(p.variables||[]).every(v=>TP_WIP.vars[v.id]):true;
  const isFirst=curIdx===0;
  const footLeft=isFirst
    ?'<button class="pm-btn-ghost" onclick="tpCloseMP()">Cancelar</button>'
    :'<button class="pm-btn-ghost" onclick="tpMPBack()">'+PM_SVG.back+' Atras</button>';
  const isLast=curId==='custom';
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
  pmAttachHandlers(inner,p,curId);
}

function pmBuildPresPane(p){
  const pres=p.presentations||[];
  const hasVars=(p.variables||[]).length>0;
  return '<div class="pm-choice-grid">'+pres.map(pr=>{
    const on=TP_WIP.pres&&TP_WIP.pres.id===pr.id;
    const thumb=pr.photo_url
      ?'<div class="pm-choice-thumb"><img src="'+pmAttr(pr.photo_url)+'" style="width:100%;height:100%;object-fit:cover"></div>'
      :'<div class="pm-choice-thumb ph"><span>'+pmEsc(pr.name)+'</span></div>';
    const priceLabel=hasVars?'Incluido':(pr.price?pmFmt(pr.price):'Incluido');
    return '<button class="pm-choice'+(on?' on':'')+'" data-pres-id="'+pmAttr(pr.id)+'" data-pres-name="'+pmAttr(pr.name)+'" data-pres-price="'+(pr.price||0)+'">'
      +thumb
      +'<div class="pm-choice-body"><div class="pm-choice-name">'+pmEsc(pr.name)+'</div>'
      +'<div class="pm-choice-price">'+priceLabel+'</div></div>'
      +'<span class="pm-radio">'+(on?PM_SVG.check:'')+'</span>'
      +'</button>';
  }).join('')+'</div>';
}

function pmBuildVarPane(p){
  const vars=p.variables||[];
  const isMatrix=p.price_mode==='matrix';
  const presIdx=(p.presentations||[]).findIndex(pr=>pr.id===TP_WIP.pres?.id);
  return '<div style="display:flex;flex-direction:column;gap:20px">'+vars.map(v=>{
    return '<div><div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">'+pmEsc(v.name)+'</div>'
      +'<div class="pm-choice-grid">'+(v.options||[]).map(o=>{
        const sel=TP_WIP.vars[v.id]&&TP_WIP.vars[v.id].id===o.id;
        const optPrice=isMatrix&&Array.isArray(o.prices)&&presIdx>=0?(o.prices[presIdx]||0):o.price||0;
        const priceLabel=optPrice?(isMatrix?pmFmt(optPrice):'+'+pmFmt(optPrice)):'Incluido';
        return '<button class="pm-choice compact'+(sel?' on':'')+'" data-var-id="'+pmAttr(v.id)+'" data-opt-id="'+pmAttr(o.id)+'" data-opt-name="'+pmAttr(o.name)+'" data-opt-price="'+optPrice+'">'
          +'<div class="pm-choice-body"><div class="pm-choice-name">'+pmEsc(o.name)+'</div>'
          +'<div class="pm-choice-price">'+priceLabel+'</div></div>'
          +'<span class="pm-radio">'+(sel?PM_SVG.check:'')+'</span>'
          +'</button>';
      }).join('')+'</div></div>';
  }).join('')+'</div>';
}

function pmBuildCustomPane(p){
  const modGroups=(p.mod_group_ids||[]).map(gid=>(S.modGroups||[]).find(g=>g.id===gid)).filter(Boolean);
  const presLabel=TP_WIP.pres&&TP_WIP.pres.name?TP_WIP.pres.name:'';
  const varLabels=Object.values(TP_WIP.vars).map(v=>v.name).join(' · ');
  const selParts=[presLabel,varLabels].filter(Boolean);
  const photoHTML=p.photo_url
    ?'<div class="pm-photo"><img src="'+pmAttr(p.photo_url)+'" style="width:100%;height:100%;object-fit:cover"></div>'
    :'<div class="pm-photo" style="display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,#F1F5F9 0 10px,#F8FAFC 10px 20px)">'
    +'<span style="font-size:40px;color:#CBD5E1">'+pmEsc((p.name||'?')[0].toUpperCase())+'</span></div>';
  const selSummary=selParts.length
    ?pmEsc(p.name)+' &middot; <span class="sel">'+pmEsc(selParts.join(' · '))+'</span>'
    :pmEsc(p.name);
  const modSumTxt=Object.values(TP_WIP.mods).map(m=>m.name).join(', ')||'Sin adiciones seleccionadas';
  const groupsHTML=modGroups.length
    ?modGroups.map(g=>{
        const maxHint=g.multi?'Max. '+(g.options||[]).length:'Elige una';
        const optRows=(g.options||[]).map(o=>{
          const sel=!!TP_WIP.mods[o.id];
          return '<button class="pm-mod'+(sel?' on':'')+'" data-mod-id="'+pmAttr(o.id)+'" data-mod-name="'+pmAttr(o.name)+'" data-mod-price="'+(o.price||0)+'">'
            +'<div style="min-width:0;text-align:left"><div class="pm-mod-name">'+pmEsc(o.name)+'</div>'
            +'<div class="pm-mod-price">'+(o.price?'+ '+pmFmt(o.price):'Gratis')+'</div></div>'
            +'<span class="pm-mod-add">'+(sel?PM_SVG.check:PM_SVG.plus)+'</span>'
            +'</button>';
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

function pmAttachHandlers(inner,p,curId){
  inner.querySelectorAll('.pm-step.done').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const sid=btn.dataset.stepId;
      TP_WIP.step=sid==='pres'?1:sid==='var'?2:3;
      tpRenderMP();
    });
  });
  if(curId==='pres'){
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
  if(curId==='var'){
    inner.querySelectorAll('.pm-choice[data-var-id]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const vid=btn.dataset.varId,oid=btn.dataset.optId,oname=btn.dataset.optName,oprice=+btn.dataset.optPrice;
        TP_WIP.vars[vid]={id:oid,name:oname,price:oprice};
        inner.querySelectorAll('.pm-choice[data-var-id="'+vid+'"]').forEach(b=>{
          const on=b.dataset.optId===oid;
          b.classList.toggle('on',on);
          b.querySelector('.pm-radio').innerHTML=on?PM_SVG.check:'';
        });
        const allDone=(p.variables||[]).every(v=>TP_WIP.vars[v.id]);
        const nb=document.getElementById('tp-mp-next'); if(nb) nb.disabled=!allDone;
      });
    });
  }
  if(curId==='custom'){
    const qdec=document.getElementById('pm-qty-dec'),qinc=document.getElementById('pm-qty-inc');
    if(qdec) qdec.addEventListener('click',()=>{ TP_WIP.qty=Math.max(1,TP_WIP.qty-1); pmUpdatePrices(); });
    if(qinc) qinc.addEventListener('click',()=>{ TP_WIP.qty++; pmUpdatePrices(); });
    const noteEl=document.getElementById('pm-note-input');
    if(noteEl){ noteEl.value=TP_WIP.note; noteEl.addEventListener('input',function(){ TP_WIP.note=this.value; }); }
    inner.querySelectorAll('.pm-seg button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        TP_WIP.forHere=btn.dataset.dest==='here';
        inner.querySelectorAll('.pm-seg button').forEach(b=>b.classList.toggle('on',b.dataset.dest===(TP_WIP.forHere?'here':'go')));
      });
    });
    inner.querySelectorAll('.pm-mod').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const id=btn.dataset.modId,name=btn.dataset.modName,price=+btn.dataset.modPrice;
        if(TP_WIP.mods[id]) delete TP_WIP.mods[id]; else TP_WIP.mods[id]={name,price};
        const on=!!TP_WIP.mods[id];
        btn.classList.toggle('on',on);
        btn.querySelector('.pm-mod-add').innerHTML=on?PM_SVG.check:PM_SVG.plus;
        pmUpdatePrices();
        const ms=document.getElementById('pm-mod-sum');
        if(ms) ms.textContent=Object.values(TP_WIP.mods).map(m=>m.name).join(', ')||'Sin adiciones seleccionadas';
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

function pmUpdatePrices(){
  const p=document.getElementById('pm-price-val'); if(p) p.textContent=pmFmt(tpComputePrice());
  const f=document.getElementById('pm-foot-price'); if(f) f.textContent=pmFmt(tpComputePrice());
  const q=document.getElementById('pm-qty-val'); if(q) q.textContent=TP_WIP.qty;
}

function tpCheckOverlayClose(e){ if(e.target===e.currentTarget) tpCloseMP(); }

function tpMPAdvance(){
  const p=TP_WIP.prod, hasVars=(p.variables||[]).length>0;
  if(TP_WIP.step===1){TP_WIP.step=hasVars?2:3;}else if(TP_WIP.step===2){TP_WIP.step=3;}
  tpRenderMP();
}

function tpMPBack(){
  const p=TP_WIP.prod, hasPres=(p.presentations||[]).length>1, hasVars=(p.variables||[]).length>0;
  if(TP_WIP.step===3){TP_WIP.step=hasVars?2:(hasPres?1:3);}else if(TP_WIP.step===2){TP_WIP.step=hasPres?1:2;}
  tpRenderMP();
}

function tpCloseMP(){ const el=document.getElementById('tp-modal-producto'); if(el) el.style.display='none'; }

function tpMPAddToCart(){
  const p=TP_WIP.prod;
  const presLabel=TP_WIP.pres&&TP_WIP.pres.name?TP_WIP.pres.name:'';
  const varLabels=Object.values(TP_WIP.vars).map(v=>v.name).join(' · ');
  const displayName=[p.name,presLabel,varLabels].filter(Boolean).join(' · ');
  const modSummary=Object.values(TP_WIP.mods).map(m=>m.name).join(', ');
  const unitPrice=tpComputePrice()/TP_WIP.qty;
  const lineId='li_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  S.cart.push({
    id:null, lineId, productId:p.id, name:displayName, qty:TP_WIP.qty,
    unitPrice, catColor:catColorFor(p.id), modSummary, note:TP_WIP.note||'',
    forHere:TP_WIP.forHere,
    selections:{pres:presLabel||null,vars:{...TP_WIP.vars},mods:{...TP_WIP.mods}},
  });
  tpCloseMP(); paintCartState();
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

    // Upsert pos_orders
    if (!orderId) {
      const { data, error } = await sb.from('pos_orders').insert({
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
      tenant_id:     S.tenantId,
      branch_id:     S.branchId,
      order_id:      orderId,
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
