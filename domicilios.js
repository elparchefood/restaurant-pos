/* domicilios.js — Módulo Domicilios Express · Lumen POS
   Stack: HTML/CSS/JS vanilla + Supabase
   Credenciales: definidas en pos-core.js (sb ya disponible)
   Reglas: nada hardcodeado de negocio, productos de Supabase,
           clientes semilla local, sin sesión → login.html
*/

// ── Canales config ────────────────────────────────────────────────────
var CANALES = {
  whatsapp:  { mono: 'WA',  label: 'WhatsApp',   color: '#25D366', bg: '#E7F8EE' },
  instagram: { mono: 'IG',  label: 'Instagram',  color: '#E1306C', bg: '#FCE7F0' },
  facebook:  { mono: 'FB',  label: 'Facebook',   color: '#1877F2', bg: '#E7F0FE' },
  tiktok:    { mono: 'TT',  label: 'TikTok',     color: '#111827', bg: '#EEF0F3' },
  llamada:   { mono: 'Tel', label: 'Llamada',    color: '#5B6BFF', bg: '#EEF2FF' },
  web:       { mono: 'Web', label: 'Página web', color: '#0EA5E9', bg: '#F0F9FF' }
};

var MODALIDADES = {
  express:    'Domicilio express',
  programado: 'Domicilio programado',
  recogo:     'Recogo en tienda'
};

var KAN_ORDEN = ['recibido', 'preparacion', 'listo', 'camino', 'entregado'];
var KAN_NEXT  = { recibido: 'preparacion', preparacion: 'listo', listo: 'camino', camino: 'entregado', entregado: null };
var KAN_BTN   = { recibido: 'En preparación', preparacion: 'Listo', listo: 'En camino', camino: 'Entregado', entregado: null };

// ── Estado global ─────────────────────────────────────────────────────
var S = {
  canal:     'whatsapp',
  modalidad: 'express',
  fee:       0,
  cart:      [],
  cliente:   null,
  courier:   'interno',
  cobramos:  false,
  asignado:  null,
  pago:      { when: 'contraentrega', status: 'pendiente', metodo: 'efectivo' },
  kpRaw:     '',
  editCliId: null,
  products:  [],
  cats:      [],
  deliveries: [],
  tenantId:  null,
  favorites: [],
  clientes: [
    { id: 'c1', nombres: 'Jesús',          apellidos: 'Gómez',          telefono: '300 412 8890', direccion: 'Cra. 45 #12-30, Centro' },
    { id: 'c2', nombres: 'Karen Juliana',  apellidos: 'San Ignacio',    telefono: '311 765 2210', direccion: 'Cl. 116 #18-30, Norte' },
    { id: 'c3', nombres: 'Víctor Raúl',    apellidos: 'Llanos',         telefono: '320 998 1145', direccion: 'Av. 1 de Mayo #34-12, Sur' },
    { id: 'c4', nombres: 'Adriana',        apellidos: 'Eraso',          telefono: '301 220 7788', direccion: 'Cl. 63 #11-20, Chapinero' },
    { id: 'c5', nombres: 'Camilo',         apellidos: 'Restrepo',       telefono: '315 644 0091', direccion: 'Cra. 9 #70-15, Quinta Camacho' },
    { id: 'c6', nombres: 'Mariana',        apellidos: 'Ortiz',          telefono: '318 330 5566', direccion: 'Cl. 53 #24-60, Galerías' }
  ],
  couriers: [
    { id: 'dm1', initials: 'FR', name: 'Felipe Ríos',      phone: '301 555 2210', status: 'ok',  statusLbl: 'Disponible' },
    { id: 'dm2', initials: 'DQ', name: 'Daniel Quintero',  phone: '312 880 4471', status: 'ok',  statusLbl: 'Disponible' },
    { id: 'dm3', initials: 'MS', name: 'Mateo Salas',      phone: '318 224 9930', status: '',    statusLbl: 'En ruta' }
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function fmt(n) {
  if (!n) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function initials(nombre) {
  var parts = (nombre || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function cliFullName(c) {
  return (c.nombres + ' ' + c.apellidos).trim();
}

function toast(msg, duration) {
  var el = $('toast');
  el.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ' + msg;
  el.hidden = false;
  setTimeout(function () { el.hidden = true; }, duration || 2200);
}

function svgCheck() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
}

function svgClock() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
}

function svgUser() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
}

function svgScoot() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 18H15"/><path d="M4 7h4l3 8"/><path d="M14 9h3l3 6"/><path d="M14 9V6h2"/></svg>';
}

// ── Boot ──────────────────────────────────────────────────────────────
function boot() {
  sb.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) {
      window.location.href = 'login.html';
      return;
    }
    sb.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) { window.location.href = 'login.html'; return; }
      S.tenantId = (user.user_metadata && user.user_metadata.tenant_id) || null;
      var name = (user.user_metadata && user.user_metadata.full_name) || user.email || 'Usuario';
      var role = (user.user_metadata && user.user_metadata.role) || 'Operador';
      $('topbar-name').textContent = name;
      $('topbar-role').textContent = role;
      $('topbar-role2').textContent = role;
      $('topbar-avatar').textContent = initials(name);
      loadProducts();
    });
  });

  bindAll();
  renderAsigList();
  renderCatGrid();
  renderCart();
  renderDetBtn();
  openModal('modal-registro');
}

// ── Cargar productos ──────────────────────────────────────────────────
function loadProducts() {
  if (!S.tenantId) return;
  sb.from('pos_categories')
    .select('id,name,color,image_url')
    .eq('tenant_id', S.tenantId)
    .eq('is_active', true)
    .order('name')
    .then(function (r) {
      S.cats = r.data || [];
      renderCatGrid();
      renderMenuPane();
    });

  sb.from('pos_products')
    .select('id,name,price,category_id,is_favorite,image_url')
    .eq('tenant_id', S.tenantId)
    .eq('is_active', true)
    .order('name')
    .then(function (r) {
      S.products = r.data || [];
      S.favorites = S.products.filter(function (p) { return p.is_favorite; });
      renderCatGrid();
      renderMenuPane();
      renderFavPane();
    });
}

// ── Render catgrid ────────────────────────────────────────────────────
function renderCatGrid() {
  var el = $('cat-grid');
  if (!el) return;
  if (!S.cats.length) {
    el.innerHTML = '<div class="d-empty" style="grid-column:1/-1"><div class="d-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><div style="font-size:13px;font-weight:600;color:var(--ink-2)">Sin categorías</div></div>';
    return;
  }
  el.innerHTML = S.cats.map(function (c) {
    var color = c.color || '#5B6BFF';
    var count = S.products.filter(function (p) { return p.category_id === c.id; }).length;
    var border = colorToLight(color);
    return '<button class="lm-cat" data-open-cat="' + c.id + '" style="border-color:' + border + '">' +
      '<div class="d-thumb" style="height:108px">' +
      (c.image_url ? '<img src="' + c.image_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:9px">' : '<span class="d-thumb-lbl">' + c.name + '</span>') +
      '</div>' +
      '<div class="d-cat-foot">' +
        '<div><div class="d-cat-name">' + c.name + '</div><div class="d-cat-count">' + count + ' productos</div></div>' +
        '<span class="d-cat-badge" style="color:' + color + ';background:' + colorTint(color) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>' +
      '</div></button>';
  }).join('');
}

function colorToLight(hex) {
  return hex + '66';
}

function colorTint(hex) {
  return hex + '18';
}

// ── Abrir categoría ───────────────────────────────────────────────────
function openCat(catId) {
  var cat = S.cats.find(function (c) { return c.id === catId; });
  var prods = S.products.filter(function (p) { return p.category_id === catId; });
  var color = (cat && cat.color) || '#5B6BFF';
  $('prod-catdot').style.background = color;
  $('prod-catname').textContent = cat ? cat.name : '—';
  $('prod-catcount').textContent = prods.length;
  renderProdGrid($('prod-grid'), prods);
  $('cat-grid').hidden = true;
  $('subview-products').hidden = false;
}

function renderProdGrid(el, prods) {
  if (!prods.length) {
    el.innerHTML = '<div class="d-softempty" style="grid-column:1/-1"><div class="d-softempty-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><div style="font-size:13px;font-weight:600;color:var(--ink-2)">Sin productos</div></div>';
    return;
  }
  el.innerHTML = prods.map(function (p) {
    var inCart = S.cart.find(function (i) { return i.id === p.id; });
    var qty = inCart ? inCart.qty : 0;
    return '<button class="lm-prod" data-add="' + p.id + '">' +
      '<div style="position:relative">' +
        '<div class="d-thumb" style="height:84px">' +
          (p.image_url ? '<img src="' + p.image_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:9px">' : '<span class="d-thumb-lbl">' + p.name + '</span>') +
        '</div>' +
        (p.is_favorite ? '<span class="d-star"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>' : '') +
        (qty > 0 ? '<span class="d-qty">' + qty + '</span>' : '') +
      '</div>' +
      '<div class="d-prod-foot">' +
        '<div class="d-prod-name">' + p.name + '</div>' +
        '<div class="d-prod-row"><span class="d-prod-price">' + fmt(p.price) + '</span><span class="d-add"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span></div>' +
      '</div></button>';
  }).join('');
}

// ── Render menu pane ──────────────────────────────────────────────────
function renderMenuPane() {
  var el = $('menu-scroll');
  if (!el) return;
  if (!S.cats.length) { el.innerHTML = '<div class="d-softempty" style="padding:24px;text-align:center;color:var(--muted)">Sin categorías</div>'; return; }
  el.innerHTML = S.cats.map(function (cat) {
    var prods = S.products.filter(function (p) { return p.category_id === cat.id; });
    if (!prods.length) return '';
    var rows = prods.map(function (p) {
      var inCart = S.cart.find(function (i) { return i.id === p.id; });
      var qty = inCart ? inCart.qty : 0;
      return '<button class="lm-menurow" data-add="' + p.id + '">' +
        '<span class="d-menuqty" style="' + (qty > 0 ? '' : 'visibility:hidden') + '">' + qty + '</span>' +
        '<span style="flex:1;font-size:12.5px;font-weight:600;color:var(--ink)">' + p.name + '</span>' +
        '<span style="font-size:13px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums">' + fmt(p.price) + '</span>' +
        '<span class="d-add-sm"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>' +
        '</button>';
    }).join('');
    return '<div class="d-menugroup">' +
      '<div class="d-menughead"><span class="d-menugname" style="color:' + (cat.color || '#5B6BFF') + '">' + cat.name + '</span><div class="d-menugrule"></div></div>' +
      '<div class="d-menurows">' + rows + '</div></div>';
  }).join('');
}

// ── Render fav pane ───────────────────────────────────────────────────
function renderFavPane() {
  var el = $('fav-grid');
  if (!el) return;
  var favs = S.products.filter(function (p) { return p.is_favorite; });
  $('fav-empty').hidden = favs.length > 0;
  if (favs.length) renderProdGrid(el, favs);
}

// ── Búsqueda ──────────────────────────────────────────────────────────
function renderBusqResults(q) {
  var grid = $('busq-grid');
  var empty = $('busq-empty');
  if (!q) { grid.innerHTML = ''; empty.hidden = true; return; }
  var results = S.products.filter(function (p) {
    return p.name.toLowerCase().includes(q.toLowerCase());
  });
  empty.hidden = results.length > 0;
  if (results.length) renderProdGrid(grid, results);
  else grid.innerHTML = '';
}

// ── Cart ──────────────────────────────────────────────────────────────
function addToCart(id) {
  var p = S.products.find(function (x) { return x.id === id; });
  if (!p) return;
  var existing = S.cart.find(function (i) { return i.id === id; });
  if (existing) {
    existing.qty++;
  } else {
    var cat = S.cats.find(function (c) { return c.id === p.category_id; });
    S.cart.push({ id: id, name: p.name, price: p.price, qty: 1, catName: cat ? cat.name : '', catColor: (cat && cat.color) || '#94A3B8' });
  }
  renderCart();
  renderDetBtn();
  refreshBrowserQtys();
}

function updateQty(id, delta) {
  var idx = S.cart.findIndex(function (i) { return i.id === id; });
  if (idx === -1) return;
  S.cart[idx].qty += delta;
  if (S.cart[idx].qty <= 0) S.cart.splice(idx, 1);
  renderCart();
  renderDetBtn();
  refreshBrowserQtys();
}

function clearCart() {
  S.cart = [];
  renderCart();
  renderDetBtn();
  refreshBrowserQtys();
}

function refreshBrowserQtys() {
  // Update qty badges in visible prod grids
  document.querySelectorAll('[data-add]').forEach(function (btn) {
    var id = btn.dataset.add;
    var item = S.cart.find(function (i) { return i.id === id; });
    var qty = item ? item.qty : 0;
    var qtyEl = btn.querySelector('.d-qty');
    if (qty > 0) {
      if (!qtyEl) {
        var rel = btn.querySelector('[style*="position:relative"]') || btn.querySelector('.d-thumb');
        if (rel && rel.parentElement) {
          var span = document.createElement('span');
          span.className = 'd-qty';
          span.textContent = qty;
          rel.parentElement.appendChild(span);
        }
      } else {
        qtyEl.textContent = qty;
      }
    } else {
      if (qtyEl) qtyEl.remove();
    }
    // menu rows
    var mqty = btn.querySelector('.d-menuqty');
    if (mqty) {
      mqty.textContent = qty;
      mqty.style.visibility = qty > 0 ? 'visible' : 'hidden';
    }
  });
}

function renderCart() {
  var lines = $('cart-lines');
  var emptyEl = $('cart-empty');
  var lbl = $('cart-count-lbl');
  var total = computeProductsTotal();

  if (!S.cart.length) {
    if (!$('cart-empty')) lines.innerHTML = '<div class="d-empty" id="cart-empty"><div class="d-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div><div style="font-size:13px;font-weight:600;color:var(--ink-2)">Sin productos aún</div><div style="font-size:11.5px;color:var(--muted);margin-top:4px">Selecciona del catálogo</div></div>';
    lbl.textContent = 'Pedido · 0 ítems';
    $('total-productos').textContent = '$0';
    renderTotals();
    return;
  }

  var totalItems = S.cart.reduce(function (a, i) { return a + i.qty; }, 0);
  lbl.textContent = 'Pedido · ' + totalItems + ' ítem' + (totalItems !== 1 ? 's' : '');

  var html = S.cart.map(function (item) {
    var lineTotal = item.price * item.qty;
    return '<div class="d-cartline" data-line="' + item.id + '">' +
      '<div style="flex:1;min-width:0">' +
        '<div class="d-cl-name">' + item.name + '</div>' +
        '<div class="d-cl-meta"><span class="dot" style="background:' + item.catColor + '"></span><span class="txt">' + item.catName + ' · ' + fmt(item.price) + '</span></div>' +
      '</div>' +
      '<div class="d-line-step">' +
        '<button class="lm-step sm" data-dec="' + item.id + '">' +
          (item.qty === 1
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
          ) +
        '</button>' +
        '<span class="num">' + item.qty + '</span>' +
        '<button class="lm-step sm" data-inc="' + item.id + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' +
      '</div>' +
      '<div class="d-cl-total">' + fmt(lineTotal) + '</div>' +
    '</div>';
  }).join('');

  lines.innerHTML = html;
  $('total-productos').textContent = fmt(total);
  renderTotals();
}

function computeProductsTotal() {
  return S.cart.reduce(function (a, i) { return a + i.price * i.qty; }, 0);
}

function computeMoney() {
  var prods = computeProductsTotal();
  var fee = S.fee;
  var domicilioLine = fee;
  var totalCobrar = prods;
  var note = null;

  if (S.courier === 'interno') {
    // Nosotros cobramos el domicilio + productos
    totalCobrar = prods + fee;
  } else {
    // Externo
    if (!S.cobramos) {
      // El cliente le paga al repartidor: el fee no entra como venta
      totalCobrar = prods;
      domicilioLine = fee;
      note = { type: 'warn', text: 'El cliente paga el domicilio (<b>' + fmt(fee) + '</b>) directamente al repartidor. No entra como ingreso tuyo.' };
    } else {
      // Lo cobramos nosotros (transferencia)
      totalCobrar = prods + fee;
      note = { type: 'info', text: 'Cobras el domicilio (<b>' + fmt(fee) + '</b>) y luego se lo pagas al repartidor en efectivo.' };
    }
  }
  return { prods: prods, fee: domicilioLine, total: totalCobrar, note: note };
}

function renderTotals() {
  var m = computeMoney();
  $('total-productos').textContent = fmt(m.prods);
  $('total-domicilio').textContent = fmt(m.fee);
  $('total-grand').textContent = fmt(m.total);

  var noteArea = $('money-note-area');
  if (m.note) {
    noteArea.innerHTML = '<div class="d-moneynote ' + m.note.type + '"><span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span><span>' + m.note.text + '</span></div>';
  } else {
    noteArea.innerHTML = '';
  }
}

// ── DetBtn ────────────────────────────────────────────────────────────
function renderDetBtn() {
  var btn = $('detbtn');
  var statusEl = $('detbtn-status');
  var chipsEl = $('detbtn-chips');
  if (!btn) return;

  var hasCliente  = !!S.cliente;
  var hasCourier  = S.courier === 'externo' || !!S.asignado;
  var isComplete  = hasCliente && hasCourier;

  btn.className = 'd-detbtn' + (isComplete ? '' : ' warn');

  if (isComplete) {
    statusEl.innerHTML = '<span class="d-detbtn-ok">' + svgCheck() + ' Completo</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  } else {
    statusEl.innerHTML = '<span class="d-detbtn-alert"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Faltan datos</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  }

  var chips = [];
  if (hasCliente) {
    chips.push('<span class="d-detbtn-chip">' + svgUser() + cliFullName(S.cliente) + '</span>');
  } else {
    chips.push('<span class="d-detbtn-chip miss">' + svgUser() + 'Sin cliente</span>');
  }

  if (hasCourier) {
    var courierLabel = S.courier === 'externo' ? 'Externo' : (S.asignado ? S.asignado.name : '—');
    chips.push('<span class="d-detbtn-chip">' + svgScoot() + courierLabel + '</span>');
  } else {
    chips.push('<span class="d-detbtn-chip miss">' + svgScoot() + 'Sin domiciliario</span>');
  }

  var pagoLabel = (S.pago.status === 'pagado' ? 'Pagado' : 'Por pagar') + ' · ' + S.pago.metodo;
  chips.push('<span class="d-detbtn-chip">' + svgClock() + pagoLabel + '</span>');

  chipsEl.innerHTML = chips.join('');
}

// ── Cliente card ──────────────────────────────────────────────────────
function renderClienteCard() {
  var el = $('cliente-card');
  if (!S.cliente) {
    el.innerHTML = '<button class="d-cliente" data-open-cliente><span class="d-cli-avatar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span><span class="d-cli-empty">Seleccionar cliente</span></button>';
    return;
  }
  var c = S.cliente;
  var ini = initials(cliFullName(c));
  el.innerHTML = '<div class="d-cliente has">' +
    '<span class="d-cli-avatar">' + ini + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="d-cli-name">' + cliFullName(c) + '</div>' +
      '<div class="d-cli-meta"><span class="ic"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span>' + (c.telefono || '—') + '</div>' +
      '<div class="d-cli-addr"><span style="color:var(--faint);flex-shrink:0;margin-top:1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>' + (c.direccion || '—') + '</div>' +
    '</div>' +
    '<button class="lm-icon-sm" data-edit-cliente><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>' +
    '</div>';
}

// ── Asig list ─────────────────────────────────────────────────────────
function renderAsigList() {
  var el = $('asig-list');
  if (!el) return;
  el.innerHTML = S.couriers.map(function (dm) {
    var isOn = S.asignado && S.asignado.id === dm.id;
    return '<button class="d-asig ' + (isOn ? 'on' : '') + '" data-asignar="' + dm.id + '">' +
      '<span class="d-asig-av">' + dm.initials + '</span>' +
      '<span style="flex:1;min-width:0;text-align:left">' +
        '<span class="d-asig-name">' + dm.name + '</span>' +
        '<span class="d-asig-sub"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ' + dm.phone + '<span class="d-asig-est ' + dm.status + '">' + dm.statusLbl + '</span></span>' +
      '</span>' +
      '<span class="d-radio"></span>' +
    '</button>';
  }).join('');
}

// ── Context header sync ───────────────────────────────────────────────
function renderContextHeader() {
  var ch = CANALES[S.canal] || CANALES.whatsapp;
  var badge = $('chan-badge');
  if (badge) { badge.style.color = ch.color; badge.style.background = ch.bg; }
  var mono = $('chan-mono');
  if (mono) { mono.textContent = ch.mono; mono.style.background = ch.color; }
  var nm = $('chan-name');
  if (nm) nm.textContent = ch.label;
  var mt = $('modalidad-title');
  if (mt) mt.textContent = MODALIDADES[S.modalidad] || S.modalidad;
  var fd = $('fee-display');
  if (fd) fd.textContent = fmt(S.fee);
  renderTotals();
}

// ── Modal helpers ─────────────────────────────────────────────────────
function openModal(id) {
  var el = $(id);
  if (el) el.hidden = false;
}

function closeModal(id) {
  var el = $(id);
  if (el) el.hidden = true;
}

function closeAllModals() {
  document.querySelectorAll('.d-overlay').forEach(function (el) { el.hidden = true; });
}

// ── Cliente list render ───────────────────────────────────────────────
function renderCliList(q) {
  var el = $('cli-list');
  if (!el) return;
  var list = S.clientes;
  if (q) {
    var lq = q.toLowerCase();
    list = list.filter(function (c) {
      return cliFullName(c).toLowerCase().includes(lq) ||
             (c.telefono || '').includes(lq) ||
             (c.direccion || '').toLowerCase().includes(lq);
    });
  }
  if (!list.length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">No se encontraron clientes</div>';
    return;
  }
  el.innerHTML = list.map(function (c) {
    var ini = initials(cliFullName(c));
    return '<button class="d-clirow" data-cliente="' + c.id + '">' +
      '<span class="d-cli-avatar">' + ini + '</span>' +
      '<span class="d-clirow-main">' +
        '<span class="d-clirow-name">' + cliFullName(c) + '</span>' +
        '<span class="d-clirow-sub"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ' + (c.telefono || '—') + ' · <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + (c.direccion || '—') + '</span>' +
      '</span>' +
      '<span class="d-clirow-edit" data-edit="' + c.id + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg> Editar</span>' +
    '</button>';
  }).join('');
}

// ── Open nuevo cliente form ───────────────────────────────────────────
function openNuevoCli(editId) {
  S.editCliId = editId || null;
  var title = $('nuevocli-title');
  if (title) title.textContent = editId ? 'Editar cliente' : 'Nuevo cliente';

  // Clear / fill form
  if (editId) {
    var c = S.clientes.find(function (x) { return x.id === editId; });
    if (c) {
      $('cli-nombres').value   = c.nombres   || '';
      $('cli-apellidos').value = c.apellidos || '';
      $('cli-telefono').value  = c.telefono  || '';
      $('cli-direccion').value = c.direccion || '';
      $('cli-tipdoc').value    = c.tipdoc    || 'CC';
      $('cli-numdoc').value    = c.numdoc    || '';
      $('cli-email').value     = c.email     || '';
      $('cli-notas').value     = c.notas     || '';
    }
  } else {
    ['cli-nombres','cli-apellidos','cli-telefono','cli-direccion','cli-numdoc','cli-email','cli-notas'].forEach(function (id) {
      if ($(id)) $(id).value = '';
    });
    if ($('cli-tipdoc')) $('cli-tipdoc').value = 'CC';
  }
  // Activate tab Básico
  document.querySelectorAll('#modal-nuevocli [data-clitab]').forEach(function (b) { b.classList.toggle('on', b.dataset.clitab === 'basico'); });
  document.querySelectorAll('#modal-nuevocli [data-clipane]').forEach(function (p) { p.hidden = (p.dataset.clipane !== 'basico'); });

  closeModal('modal-cliente');
  openModal('modal-nuevocli');
}

function guardarCliente() {
  var nombres   = ($('cli-nombres').value   || '').trim();
  var apellidos = ($('cli-apellidos').value || '').trim();
  var telefono  = ($('cli-telefono').value  || '').trim();
  var direccion = ($('cli-direccion').value || '').trim();
  if (!nombres) { alert('El nombre es obligatorio.'); return; }

  if (S.editCliId) {
    var idx = S.clientes.findIndex(function (c) { return c.id === S.editCliId; });
    if (idx !== -1) {
      S.clientes[idx].nombres   = nombres;
      S.clientes[idx].apellidos = apellidos;
      S.clientes[idx].telefono  = telefono;
      S.clientes[idx].direccion = direccion;
      S.clientes[idx].tipdoc    = ($('cli-tipdoc').value || '').trim();
      S.clientes[idx].numdoc    = ($('cli-numdoc').value || '').trim();
      S.clientes[idx].email     = ($('cli-email').value  || '').trim();
      S.clientes[idx].notas     = ($('cli-notas').value  || '').trim();
      if (S.cliente && S.cliente.id === S.editCliId) S.cliente = S.clientes[idx];
    }
  } else {
    var newId = 'c' + Date.now();
    var newCli = { id: newId, nombres: nombres, apellidos: apellidos, telefono: telefono, direccion: direccion,
                   tipdoc: ($('cli-tipdoc').value || '').trim(),
                   numdoc: ($('cli-numdoc').value || '').trim(),
                   email:  ($('cli-email').value  || '').trim(),
                   notas:  ($('cli-notas').value  || '').trim() };
    S.clientes.unshift(newCli);
    // auto-select
    S.cliente = newCli;
  }

  closeModal('modal-nuevocli');
  renderCliList('');
  renderClienteCard();
  renderDetBtn();
  toast('Cliente guardado');
}

// ── Enviar a cocina ───────────────────────────────────────────────────
function enviarACocina() {
  if (!S.cart.length) { toast('Agrega productos al pedido'); return; }
  if (!S.cliente) { toast('Selecciona un cliente'); return; }

  var m = computeMoney();
  var courierName = S.courier === 'externo' ? 'Externo' : (S.asignado ? S.asignado.name : '—');
  var ch = CANALES[S.canal] || CANALES.whatsapp;
  var domId = 'D-' + (1000 + S.deliveries.length + 1);

  var delivery = {
    id:         domId,
    status:     'recibido',
    clientName: cliFullName(S.cliente),
    canal:      S.canal,
    canalLabel: ch.label,
    canalMono:  ch.mono,
    canalColor: ch.color,
    canalBg:    ch.bg,
    items:      S.cart.length,
    courier:    courierName,
    courierExt: S.courier === 'externo',
    pago:       S.pago,
    cobramos:   S.cobramos,
    total:      m.total,
    domFee:     m.fee,
    createdAt:  Date.now()
  };

  S.deliveries.push(delivery);

  // Clear pedido
  S.cart     = [];
  S.cliente  = null;
  S.asignado = null;
  S.pago     = { when: 'contraentrega', status: 'pendiente', metodo: 'efectivo' };
  renderCart();
  renderClienteCard();
  renderDetBtn();
  renderContextHeader();
  refreshBrowserQtys();
  renderMonitor();
  updateMonitorBadge();
  toast('Domicilio ' + domId + ' enviado a cocina');
}

// ── Monitor ───────────────────────────────────────────────────────────
function renderMonitor() {
  var activos = 0, camino = 0, porpagar = 0;
  KAN_ORDEN.forEach(function (col) {
    var items = S.deliveries.filter(function (d) { return d.status === col; });
    var bodyEl = $('kan-' + col);
    var nEl = $('kan-n-' + col);
    if (nEl) nEl.textContent = items.length;
    if (!bodyEl) return;
    if (!items.length) {
      bodyEl.innerHTML = '<div class="d-kan-empty">Sin domicilios</div>';
    } else {
      bodyEl.innerHTML = items.map(function (d) { return renderKanCard(d); }).join('');
    }
    if (col !== 'entregado') activos += items.length;
    if (col === 'camino') camino += items.length;
    if (d_porpagar(items)) porpagar += d_porpagar(items);
  });
  if ($('mon-activos')) $('mon-activos').textContent = activos;
  if ($('mon-camino')) $('mon-camino').textContent = camino;
  if ($('mon-porpagar')) $('mon-porpagar').textContent = porpagar;
}

function d_porpagar(items) {
  return items.filter(function (d) { return d.pago && d.pago.status === 'pendiente'; }).length;
}

function renderKanCard(d) {
  var ch = CANALES[d.canal] || CANALES.whatsapp;
  var mins = Math.round((Date.now() - d.createdAt) / 60000);
  var timeLabel = mins < 1 ? 'ahora' : 'hace ' + mins + 'm';
  var pagoColor = d.pago.status === 'pagado' ? '#16A34A' : '#B45309';
  var pagoBg    = d.pago.status === 'pagado' ? '#DCFCE7' : '#FEF3C7';
  var pagoLabel = d.pago.status === 'pagado' ? 'Pagado' : 'Por pagar';
  var whenLabel = d.pago.when === 'adelantado' ? 'Adelantado' : 'Contra entrega';
  var metodIcon = metodoIcon(d.pago.metodo);

  var nextLabel = KAN_BTN[d.status];
  var subNote = '';
  if (d.courierExt && !d.cobramos) subNote = '<div class="d-domi-row"><span class="d-tag" style="color:#92660C;background:#FEF3C7"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Lo cobra el repartidor</span></div>';
  var courierBadge = '';
  if (d.courier !== '—') {
    courierBadge = '<span class="d-extbadge" style="color:#5B6BFF;background:#EEF2FF"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 18H15"/><path d="M4 7h4l3 8"/><path d="M14 9h3l3 6"/><path d="M14 9V6h2"/></svg> ' + d.courier + '</span>';
  }
  var totalSub = (!d.cobramos && d.courierExt) ? ' <span class="sub">· dom. aparte</span>' : '';

  return '<div class="d-domi" data-domi="' + d.id + '">' +
    '<div class="d-domi-top"><span class="d-domi-id">' + d.id + '</span><span class="d-domi-time"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + timeLabel + '</span></div>' +
    '<div class="d-domi-cli">' + d.clientName + '</div>' +
    '<div class="d-domi-row">' +
      '<span class="d-chanchip" style="color:' + ch.color + ';background:' + ch.bg + '"><span class="mn" style="background:' + ch.color + '">' + ch.mono + '</span>' + ch.label + '</span>' +
      '<span class="d-tag" style="color:#475569;background:#F1F5F9"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> ' + d.items + '</span>' +
      courierBadge +
    '</div>' +
    '<div class="d-domi-row">' +
      '<span class="d-tag" style="color:' + pagoColor + ';background:' + pagoBg + '">' + (d.pago.status === 'pagado' ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>') + ' ' + pagoLabel + '</span>' +
      '<span class="d-tag" style="color:#64748B;background:#F1F5F9">' + whenLabel + '</span>' +
      '<span class="d-tag" style="color:#64748B;background:#F1F5F9">' + metodIcon + ' ' + d.pago.metodo + '</span>' +
    '</div>' +
    subNote +
    '<div class="d-domi-tot">' +
      '<div class="d-domi-money">' + fmt(d.total) + totalSub + '</div>' +
      (nextLabel ? '<button class="d-adv" data-advance="' + d.id + '">' + nextLabel + ' <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>' : '<span class="d-tag" style="color:#16A34A;background:#DCFCE7"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Listo</span>') +
    '</div>' +
    '</div>';
}

function metodoIcon(m) {
  if (m === 'efectivo') return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/></svg>';
  if (m === 'tarjeta')  return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
  return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
}

function advanceDelivery(id) {
  var d = S.deliveries.find(function (x) { return x.id === id; });
  if (!d) return;
  var next = KAN_NEXT[d.status];
  if (!next) return;
  d.status = next;
  renderMonitor();
  updateMonitorBadge();
  toast(id + ' → ' + next);
}

function updateMonitorBadge() {
  var active = S.deliveries.filter(function (d) { return d.status !== 'entregado'; }).length;
  var badge = $('monitor-badge');
  if (badge) {
    badge.textContent = active;
    badge.style.display = active > 0 ? 'flex' : 'none';
  }
}

// ── Keypad ────────────────────────────────────────────────────────────
function kpAppend(k) {
  if (k === 'bksp') {
    S.kpRaw = S.kpRaw.slice(0, -1);
  } else if (k === '00') {
    S.kpRaw = S.kpRaw + '00';
  } else {
    S.kpRaw = S.kpRaw + k;
  }
  // Max 8 digits
  if (S.kpRaw.length > 8) S.kpRaw = S.kpRaw.slice(0, 8);
  var num = parseInt(S.kpRaw, 10) || 0;
  var el = $('kp-display');
  if (el) el.textContent = fmt(num);
  var prev = $('fee-preview');
  if (prev) prev.textContent = Math.round(num).toLocaleString('es-CO');
}

function kpOk() {
  var num = parseInt(S.kpRaw, 10) || 0;
  S.fee = num;
  S.kpRaw = '';
  closeModal('modal-keypad');
  renderContextHeader();
  var fp = $('fee-preview');
  if (fp) fp.textContent = Math.round(num).toLocaleString('es-CO');
}

// ── Nav tabs ──────────────────────────────────────────────────────────
function switchNav(nav) {
  document.querySelectorAll('.d-navitem[data-nav]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.nav === nav);
  });
  $('view-pedido').classList.toggle('on', nav === 'pedido');
  $('view-pedido').hidden = (nav !== 'pedido');
  $('view-monitor').hidden = (nav !== 'monitor');
  $('view-monitor').classList.toggle('on', nav === 'monitor');
  if (nav === 'monitor') renderMonitor();
}

function switchBrowserTab(tab) {
  document.querySelectorAll('.lm-bigtab').forEach(function (b) {
    b.classList.toggle('on', b.dataset.tab === tab);
  });
  $('cat-grid').hidden        = (tab !== 'categoria');
  $('subview-products').hidden = true;
  $('pane-menu').hidden       = (tab !== 'menu');
  $('pane-busqueda').hidden   = (tab !== 'busqueda');
  $('pane-favoritos').hidden  = (tab !== 'favoritos');
  if (tab === 'menu') renderMenuPane();
  if (tab === 'favoritos') renderFavPane();
}

// ── Cara flip ─────────────────────────────────────────────────────────
function flipToDetalles() {
  document.querySelector('[data-face="pedido"]').classList.remove('on');
  document.querySelector('[data-face="detalles"]').classList.add('on');
  renderClienteCard();
}

function flipToPedido() {
  document.querySelector('[data-face="detalles"]').classList.remove('on');
  document.querySelector('[data-face="pedido"]').classList.add('on');
  renderDetBtn();
  renderTotals();
}

// ── Bind all events ───────────────────────────────────────────────────
function bindAll() {
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (t) handleAction(t.dataset.action, t, e);

    if (e.target.closest('[data-nav]')) {
      switchNav(e.target.closest('[data-nav]').dataset.nav);
      return;
    }
    if (e.target.closest('[data-tab]')) {
      switchBrowserTab(e.target.closest('[data-tab]').dataset.tab);
      return;
    }
    if (e.target.closest('[data-open-detalles]')) { flipToDetalles(); return; }
    if (e.target.closest('[data-close-detalles]')) { flipToPedido(); return; }

    if (e.target.closest('[data-add]')) {
      var id = e.target.closest('[data-add]').dataset.add;
      addToCart(id);
      return;
    }
    if (e.target.closest('[data-inc]')) {
      updateQty(e.target.closest('[data-inc]').dataset.inc, 1); return;
    }
    if (e.target.closest('[data-dec]')) {
      updateQty(e.target.closest('[data-dec]').dataset.dec, -1); return;
    }
    if (e.target.closest('[data-open-cat]')) {
      openCat(e.target.closest('[data-open-cat]').dataset.openCat); return;
    }
    if (e.target.closest('[data-sub-back]')) {
      $('subview-products').hidden = true;
      $('cat-grid').hidden = false;
      return;
    }
    if (e.target.closest('[data-key]')) {
      kpAppend(e.target.closest('[data-key]').dataset.key); return;
    }
    if (e.target.closest('[data-open-keypad]')) {
      S.kpRaw = S.fee ? String(S.fee) : '';
      if ($('kp-display')) $('kp-display').textContent = fmt(S.fee);
      openModal('modal-keypad'); return;
    }
    if (e.target.closest('[data-close]')) {
      var modal = e.target.closest('.d-overlay');
      if (modal) modal.hidden = true; return;
    }
    if (e.target.closest('[data-open-cliente]')) {
      renderCliList('');
      if ($('cli-search-input')) $('cli-search-input').value = '';
      openModal('modal-cliente'); return;
    }
    if (e.target.closest('[data-open-nuevocli]')) {
      openNuevoCli(null); return;
    }
    if (e.target.closest('[data-back-cliente]')) {
      closeModal('modal-nuevocli');
      openModal('modal-cliente'); return;
    }
    var cliBtn = e.target.closest('[data-cliente]');
    if (cliBtn && !e.target.closest('[data-edit]')) {
      var cid = cliBtn.dataset.cliente;
      S.cliente = S.clientes.find(function (c) { return c.id === cid; });
      closeModal('modal-cliente');
      renderClienteCard();
      renderDetBtn();
      return;
    }
    var editBtn = e.target.closest('[data-edit]');
    if (editBtn && editBtn.closest('#modal-cliente')) {
      openNuevoCli(editBtn.dataset.edit); return;
    }
    var editCliBtnInCard = e.target.closest('[data-edit-cliente]');
    if (editCliBtnInCard && S.cliente) {
      openNuevoCli(S.cliente.id); return;
    }
    if (e.target.closest('[data-toggle-courier]')) {
      toggleCourier(); return;
    }
    var asigBtn = e.target.closest('[data-asignar]');
    if (asigBtn) {
      var did = asigBtn.dataset.asignar;
      S.asignado = S.couriers.find(function (c) { return c.id === did; }) || null;
      renderAsigList();
      renderDetBtn();
      return;
    }
    var cobroBtn = e.target.closest('[data-cobro]');
    if (cobroBtn) {
      S.cobramos = (cobroBtn.dataset.cobro === 'nosotros');
      document.querySelectorAll('[data-cobro]').forEach(function (b) {
        b.classList.toggle('on', b.dataset.cobro === cobroBtn.dataset.cobro);
      });
      renderDetBtn();
      renderTotals();
      return;
    }
    // pago segments
    var whenBtn = e.target.closest('[data-when]');
    if (whenBtn) {
      S.pago.when = whenBtn.dataset.when;
      document.querySelectorAll('[data-when]').forEach(function (b) { b.classList.toggle('on', b.dataset.when === S.pago.when); });
      return;
    }
    var statusBtn = e.target.closest('[data-status]');
    if (statusBtn) {
      S.pago.status = statusBtn.dataset.status;
      document.querySelectorAll('[data-status]').forEach(function (b) { b.classList.toggle('on', b.dataset.status === S.pago.status); });
      renderDetBtn();
      return;
    }
    var metodoBtn = e.target.closest('[data-metodo]');
    if (metodoBtn) {
      S.pago.metodo = metodoBtn.dataset.metodo;
      document.querySelectorAll('[data-metodo]').forEach(function (b) { b.classList.toggle('on', b.dataset.metodo === S.pago.metodo); });
      return;
    }
    // Chan selection in modal-registro
    var chanBtn = e.target.closest('[data-chan]');
    if (chanBtn) {
      document.querySelectorAll('[data-chan]').forEach(function (b) { b.classList.toggle('on', b.dataset.chan === chanBtn.dataset.chan); });
      S.canal = chanBtn.dataset.chan;
      return;
    }
    // Modalidad
    var modBtn = e.target.closest('[data-modalidad]');
    if (modBtn) {
      document.querySelectorAll('[data-modalidad]').forEach(function (b) { b.classList.toggle('on', b.dataset.modalidad === modBtn.dataset.modalidad); });
      S.modalidad = modBtn.dataset.modalidad;
      return;
    }
    // cli tabs in nuevocli
    var cliTab = e.target.closest('[data-clitab]');
    if (cliTab) {
      var pane = cliTab.dataset.clitab;
      document.querySelectorAll('[data-clitab]').forEach(function (b) { b.classList.toggle('on', b.dataset.clitab === pane); });
      document.querySelectorAll('[data-clipane]').forEach(function (p) { p.hidden = (p.dataset.clipane !== pane); });
      return;
    }
    // advance kanban
    var advBtn = e.target.closest('[data-advance]');
    if (advBtn) { advanceDelivery(advBtn.dataset.advance); return; }
  });

  // busq input
  var busqInput = $('busq-input');
  if (busqInput) {
    busqInput.addEventListener('input', function () {
      renderBusqResults(this.value);
    });
  }
  // cli search input
  var cliSearchInput = $('cli-search-input');
  if (cliSearchInput) {
    cliSearchInput.addEventListener('input', function () {
      renderCliList(this.value);
    });
  }
}

function handleAction(action, el, e) {
  if (action === 'regresar')      { window.location.href = 'ventas.html'; }
  else if (action === 'nuevo')    { resetPedido(); openModal('modal-registro'); }
  else if (action === 'editar-ctx') { openModal('modal-registro'); }
  else if (action === 'vaciar')   { clearCart(); }
  else if (action === 'guardar')  { toast('Pedido guardado (borrador)'); }
  else if (action === 'enviar')   { enviarACocina(); }
  else if (action === 'registro-next') {
    closeModal('modal-registro');
    renderContextHeader();
  }
  else if (action === 'keypad-ok')      { kpOk(); }
  else if (action === 'guardar-cliente') { guardarCliente(); }
}

function toggleCourier() {
  S.courier = (S.courier === 'interno') ? 'externo' : 'interno';
  var sw = $('courier-switch');
  var row = $('courier-row');
  var lbl = $('courier-label');
  var sub = $('courier-sub');
  if (sw) { sw.classList.toggle('on', S.courier === 'externo'); sw.setAttribute('aria-pressed', S.courier === 'externo'); }
  if (row) row.classList.toggle('on', S.courier === 'externo');
  if (lbl) lbl.textContent = S.courier === 'externo' ? 'Domiciliario externo' : 'Domiciliario interno';
  if (sub) sub.textContent = S.courier === 'externo' ? 'Usa un servicio de mensajería externo' : 'Reparte un domiciliario de El Parche';

  document.querySelector('[data-courier-pane="interno"]').hidden = (S.courier === 'externo');
  document.querySelector('[data-courier-pane="externo"]').hidden = (S.courier === 'interno');

  if (S.courier === 'interno') S.cobramos = false;
  renderDetBtn();
  renderTotals();
}

function resetPedido() {
  S.cart     = [];
  S.cliente  = null;
  S.asignado = null;
  S.canal    = 'whatsapp';
  S.modalidad = 'express';
  S.fee      = 0;
  S.courier  = 'interno';
  S.cobramos = false;
  S.pago     = { when: 'contraentrega', status: 'pendiente', metodo: 'efectivo' };
  renderCart();
  renderClienteCard();
  renderDetBtn();
  renderContextHeader();
  renderAsigList();
  refreshBrowserQtys();
  flipToPedido();
  // Restore modal defaults
  document.querySelectorAll('[data-chan]').forEach(function (b) { b.classList.toggle('on', b.dataset.chan === 'whatsapp'); });
  document.querySelectorAll('[data-modalidad]').forEach(function (b) { b.classList.toggle('on', b.dataset.modalidad === 'express'); });
  if ($('fee-preview')) $('fee-preview').textContent = '0';
}

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
