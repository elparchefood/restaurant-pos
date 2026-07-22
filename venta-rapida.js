/* venta-rapida.js — Venta Rápida (para llevar) */
/* Pedidos en pos_orders con channel='rapido', table_id=null */

(function () {
  'use strict';

  /* ─── Estado ─────────────────────────────────────────────────── */
  const S = {
    cart:       [],   // [{id,name,price,catId,catName,catColor,fav,qty}]
    descuento:  0,
    cliente:    null,
    clientes:   [],
    editCliId:  null,
    turno:      1,
    branchId:   null,
    tenantId:   null,
    orderId:    null,   // orden activa en Supabase
    categories: [],
    products:   [],
    modGroups:  [],
    currentCatId: null,
  };

  const CART_KEY    = 'pos.rapida.cart';
  const CLIENTE_KEY = 'pos.rapida.cliente';
  const TURNO_KEY   = 'pos.rapida.turno';

  /* ─── Helpers ────────────────────────────────────────────────── */
  const $  = id => document.getElementById(id);
  const fmt = n  => '$' + Math.round(n || 0).toLocaleString('es-CO');
  function getSb() { return window._pos && window._pos.sb; }

  /* ─── Cálculos ───────────────────────────────────────────────── */
  function calcCount()    { return S.cart.reduce((s, i) => s + i.qty, 0); }
  function calcSubtotal() { return S.cart.reduce((s, i) => s + i.price * i.qty, 0); }
  // Venta rápida = pedido PARA LLEVAR, así que también lleva empaque (tarifa
  // base de la config de Operación, no la de domicilio). Mismo criterio que
  // domicilios.js / pagos.js.
  function calcEmpaque() {
    // Motor central (pos-core): soporta modo específico por categoría/producto
    if (window.posEmpaqueCalc) {
      return window.posEmpaqueCalc(S.cart.map(i => ({ productId: i.productId || i.id, catId: i.catId, presId: i.presId || null, qty: i.qty, unitPrice: i.price })), {});
    }
    try {
      const cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
      if (!cfg.empaquesActivo) return 0;
      const prod = calcSubtotal(); if (prod <= 0) return 0;
      const esPct = cfg.empaqueTipo === 'porcentaje';
      const rate  = esPct ? (cfg.empaquePct || 0) : (cfg.empaqueMonto || 0);
      if (cfg.empaqueBase === 'pedido') return esPct ? Math.round(prod * rate / 100) : rate;
      const units = S.cart.reduce((a, i) => a + i.qty, 0);
      return esPct ? Math.round(prod * rate / 100) : rate * units;
    } catch (e) { return 0; }
  }
  function calcTotal()    { return Math.max(0, calcSubtotal() + calcEmpaque() - S.descuento); }

  /* ─── Persistencia ───────────────────────────────────────────── */
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch(e) {}
  }
  function loadCart() {
    try { S.cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch(e) { S.cart = []; }
  }
  const CLIENTES_KEY = 'pos.clientes';
  function saveClientes() {
    try { localStorage.setItem(CLIENTES_KEY, JSON.stringify(S.clientes)); } catch(e) {}
  }
  function loadClientes() {
    try {
      // Migración: pos.rapida.clientes → pos.clientes (clave compartida)
      const _shared = localStorage.getItem(CLIENTES_KEY);
      if (_shared) {
        S.clientes = JSON.parse(_shared);
      } else {
        // Intentar migrar desde cualquier clave antigua
        const _fromRapida = localStorage.getItem('pos.rapida.clientes');
        const _fromDomi   = localStorage.getItem('pos.domi.clientes');
        const _raw = _fromRapida || _fromDomi;
        if (_raw) { S.clientes = JSON.parse(_raw); localStorage.setItem(CLIENTES_KEY, _raw); }
        else S.clientes = [];
      }
    } catch(e) { S.clientes = []; }
  }
  function saveTurno() {
    try { localStorage.setItem(TURNO_KEY, String(S.turno)); } catch(e) {}
  }
  function loadTurno() {
    try { S.turno = parseInt(localStorage.getItem(TURNO_KEY) || '1', 10) || 1; } catch(e) {}
  }

  /* ─── Render: comanda ────────────────────────────────────────── */
  function renderComanda() {
    const count = calcCount();
    const sub   = calcSubtotal();
    const total = calcTotal();

    // Turno
    $('vr-turno').textContent = '#' + String(S.turno).padStart(3, '0');

    // Meta-count
    $('vr-meta-count').textContent = count;

    // Cliente cabecera
    $('vr-meta-cliente').textContent = (S.cliente && S.cliente.nombre) || '—';

    // Estado vacío / lleno
    $('vr-empty').hidden       = count > 0;
    $('vr-cart-scroll').hidden = count === 0;
    $('vr-comanda-foot').hidden = count === 0;

    // Pill
    const pill = $('vr-open-pill');
    if (count === 0) {
      pill.classList.add('is-empty');
    } else {
      pill.classList.remove('is-empty');
    }

    // Count label
    $('vr-count-label').textContent = count;

    // Totales
    $('vr-subtotal').textContent = fmt(sub);
    $('vr-total').textContent    = fmt(total);

    // Empaque (para llevar)
    const emp = calcEmpaque();
    const empRow = $('vr-empaque-row');
    if (empRow) {
      if (emp > 0) { empRow.hidden = false; $('vr-empaque-val').textContent = fmt(emp); }
      else empRow.hidden = true;
    }

    // Descuento row
    const dRow = $('vr-descuento-row');
    if (S.descuento > 0) {
      dRow.hidden = false;
      $('vr-descuento-val').textContent = '-' + fmt(S.descuento);
    } else {
      dRow.hidden = true;
    }

    // Mini sidebar
    const mini = $('vr-mini-icon');
    if (count === 0) {
      mini.classList.add('is-empty');
      $('vr-mini-sub').textContent = 'Sin productos aún';
    } else {
      mini.classList.remove('is-empty');
      $('vr-mini-sub').textContent = count + ' ítem' + (count !== 1 ? 's' : '') + ' · ' + fmt(total) + ' · Turno #' + String(S.turno).padStart(3,'0');
    }

    // Botones dependientes del carrito
    const hasItems = count > 0;
    $('vr-btn-pago').disabled     = !hasItems;
    $('vr-btn-vale').disabled     = !hasItems;
    $('vr-btn-discount').disabled = !hasItems;
    $('vr-btn-cancelar').disabled = !hasItems;

    // Renderizar lista
    renderCartList();

    // Actualizar badges en catálogo
    refreshBadges();
  }

  function renderCartList() {
    const list = $('vr-cart-list');
    if (!list) return;

    if (S.cart.length === 0) { list.innerHTML = ''; return; }

    list.innerHTML = S.cart.map(item => {
      const isOne = item.qty === 1;
      return `
        <div class="tp-cartline" data-line="${item.id}">
          <div class="tp-cartline-meta" style="flex-shrink:0">
            <span class="tp-cartline-meta dot" style="background:${item.catColor || '#94A3B8'};width:7px;height:7px;border-radius:50%;display:inline-block"></span>
          </div>
          <div class="tp-cartline-main">
            <div class="tp-cartline-name">${item.name}</div>
            ${item.modSummary ? `<div class="tp-cartline-meta"><span class="txt" style="color:#0EA5E9">+ ${vrEsc(item.modSummary)}</span></div>` : ''}
            ${item.note ? `<div class="tp-cartline-meta"><span class="txt" style="font-style:italic">📝 ${vrEsc(item.note)}</span></div>` : ''}
            <div class="tp-cartline-meta">
              <span class="txt">${item.catName || ''} · ${fmt(item.price)}</span>
            </div>
          </div>
          <div class="tp-line-stepper">
            <button class="lm-step sm" data-dec="${item.id}" title="Quitar">
              ${isOne
                ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`
                : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
              }
            </button>
            <span class="num">${item.qty}</span>
            <button class="lm-step sm" data-inc="${item.id}" title="Agregar">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          <div class="tp-cartline-total">${fmt(item.price * item.qty)}</div>
        </div>`;
    }).join('');

    // Steppers
    list.querySelectorAll('[data-inc]').forEach(btn => {
      btn.addEventListener('click', function() { addToCart(this.dataset.inc); });
    });
    list.querySelectorAll('[data-dec]').forEach(btn => {
      btn.addEventListener('click', function() { removeFromCart(this.dataset.dec); });
    });
  }

  /* ─── Cantidad total de un producto en el carrito (sumando líneas) ─── */
  function prodQtyInCart(pid) {
    return S.cart.reduce((s, i) =>
      (String(i.productId) === String(pid) || String(i.id) === String(pid)) ? s + (i.qty || 0) : s, 0);
  }

  /* ─── Acciones carrito ───────────────────────────────────────── */
  function addToCart(productId) {
    // Si el id es de una linea en carrito (modal items usan lineId), incrementar esa linea
    const lineIdx = S.cart.findIndex(i => String(i.id) === String(productId));
    if (lineIdx >= 0) {
      S.cart[lineIdx].qty += 1;
      saveCart(); renderComanda(); pulseItem(productId);
      return;
    }
    // Si no, buscar producto por product.id y agregar
    const prod = S.products.find(p => p.id === productId || String(p.id) === String(productId));
    if (!prod) return;
    S.cart.push({
      id:       prod.id,
      name:     prod.name,
      price:    prod.price,
      catId:    prod.category_id,
      catName:  prod.catName || '',
      catColor: prod.catColor || '#94A3B8',
      fav:      !!prod.is_favorite,
      qty:      1,
    });
    saveCart();
    renderComanda();
    pulseItem(prod.id);
  }

  function removeFromCart(productId) {
    const idx = S.cart.findIndex(i => String(i.id) === String(productId));
    if (idx < 0) return;
    if (S.cart[idx].qty > 1) {
      S.cart[idx].qty -= 1;
    } else {
      S.cart.splice(idx, 1);
    }
    saveCart();
    renderComanda();
  }

  function vaciarCart() {
    S.cart      = [];
    S.descuento = 0;
    S.orderId   = null;
    saveCart();
    renderComanda();
    renderAllProducts();
  }

  function pulseItem(productId) {
    const row = document.querySelector(`[data-line="${productId}"]`);
    if (row) {
      const item = S.cart.find(i => String(i.id) === String(productId));
      const tint = item ? hexTint(item.catColor) : '#EEF2FF';
      row.style.background = tint;
      setTimeout(() => { row.style.background = ''; }, 420);
    }
    // Pulso en tarjeta de producto
    const card = document.querySelector(`[data-add="${productId}"]`);
    if (card) {
      card.classList.add('pulse');
      setTimeout(() => card.classList.remove('pulse'), 420);
    }
  }

  function hexTint(hex) {
    // Devuelve una versión muy suave del color para el pulso
    const tints = {
      '#F59E0B': '#FFFBEB', '#0EA5E9': '#F0F9FF', '#5B6BFF': '#EEF2FF',
      '#F43F5E': '#FFF1F2', '#10B981': '#ECFDF5', '#8B5CF6': '#F5F3FF',
    };
    return tints[hex] || '#EEF2FF';
  }

  /* ─── Refresh badges en catálogo ─────────────────────────────── */
  function refreshBadges() {
    document.querySelectorAll('[data-add]').forEach(card => {
      const pid = card.dataset.add;
      const qtyTot = prodQtyInCart(pid);
      let badge = card.querySelector('.tp-qty-badge');
      if (qtyTot > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tp-qty-badge';
          const wrap = card.querySelector('.tp-prod-thumbwrap');
          if (wrap) wrap.appendChild(badge);
        }
        badge.textContent = qtyTot;
      } else {
        if (badge) badge.remove();
      }
    });
    // Badges en menú
    document.querySelectorAll('[data-menu-add]').forEach(row => {
      const pid = row.dataset.menuAdd;
      const qtyTot = prodQtyInCart(pid);
      let badge = row.querySelector('.tp-menu-qty');
      if (qtyTot > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tp-menu-qty';
          const priceEl = row.querySelector('.tp-menurow-price');
          if (priceEl) priceEl.before(badge);
        }
        badge.textContent = qtyTot;
      } else {
        if (badge) badge.remove();
      }
    });
  }

  /* ─── Render catálogo ────────────────────────────────────────── */
  function renderCatGrid() {
    const grid = $('vr-catgrid');
    if (!grid) return;
    if (!S.categories.length) {
      grid.innerHTML = '<div style="color:#94A3B8;font-size:12px;grid-column:1/-1;padding:20px 0;text-align:center">Sin categorías</div>';
      return;
    }
    grid.innerHTML = S.categories.map(cat => {
      const count = S.products.filter(p => p.category_id === cat.id).length;
      return `
        <button class="lm-cat" data-open-cat="${cat.id}" style="border-color:${cat.ring || '#ECEEF2'}">
          <div class="tp-thumb" style="height:80px;margin:7px 7px 0">${cat.image_url ? `<img src="${vrAttr(cat.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : ''}</div>
          <div class="tp-cat-foot">
            <div>
              <div class="tp-cat-name">${cat.name}</div>
              <div class="tp-cat-count">${count} producto${count !== 1 ? 's' : ''}</div>
            </div>
            <div class="tp-cat-badge" style="background:${cat.tint || '#F1F5F9'};color:${cat.color || '#64748B'}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        </button>`;
    }).join('');

    grid.querySelectorAll('[data-open-cat]').forEach(btn => {
      btn.addEventListener('click', function() { openCategory(this.dataset.openCat); });
    });
  }

  function openCategory(catId) {
    S.currentCatId = catId;
    const cat   = S.categories.find(c => String(c.id) === String(catId));
    const prods = S.products.filter(p => String(p.category_id) === String(catId));

    $('vr-cat-dot').style.background = cat ? cat.color : '#94A3B8';
    $('vr-cat-title').textContent     = cat ? cat.name : '';
    $('vr-cat-count').textContent     = prods.length + ' producto' + (prods.length !== 1 ? 's' : '');

    $('vr-prodgrid').innerHTML = renderProdCards(prods);
    attachProdEvents($('vr-prodgrid'));

    // Cambiar sub-vista
    document.querySelectorAll('[data-sub]').forEach(s => s.classList.remove('on'));
    document.querySelector('[data-sub="products"]').classList.add('on');
    refreshBadges();
  }

  function renderProdCards(prods) {
    if (!prods.length) return '<div style="color:#94A3B8;font-size:12px;padding:20px 0;text-align:center">Sin productos</div>';
    return prods.map(p => {
      const qty = prodQtyInCart(p.id);
      return `
        <button class="lm-prod" data-add="${p.id}">
          <div class="tp-prod-thumbwrap">
            ${p.photo_url
              ? `<img src="${p.photo_url}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:9px 9px 0 0;display:block">`
              : `<div class="tp-thumb" style="height:90px"><span class="tp-thumb-label">foto · …</span></div>`
            }
            ${p.is_favorite ? `<span class="tp-star-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>` : ''}
            ${qty > 0 ? `<span class="tp-qty-badge">${qty}</span>` : ''}
          </div>
          <div class="tp-prod-foot">
            <div class="tp-prod-name">${p.name}</div>
            <div class="tp-prod-row">
              <span class="tp-prod-price">${fmt(p.price)}</span>
              <span class="tp-addbtn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </span>
            </div>
          </div>
        </button>`;
    }).join('');
  }

  function attachProdEvents(container) {
    container.querySelectorAll('[data-add]').forEach(card => {
      card.addEventListener('click', function() { vrOpenProductModal(this.dataset.add); });
    });
  }

  function renderAllProducts() {
    // Re-renderizar grid de productos si está visible
    if (S.currentCatId) openCategory(S.currentCatId);
    renderMenuPane();
    renderFavs();
  }

  function renderMenuPane() {
    const scroll = $('vr-menuscroll');
    if (!scroll) return;
    if (!S.categories.length) { scroll.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:20px 0;text-align:center">Sin productos</div>'; return; }

    scroll.innerHTML = S.categories.map(cat => {
      const prods = S.products.filter(p => String(p.category_id) === String(cat.id));
      if (!prods.length) return '';
      const rows = prods.map(p => {
        const qty = prodQtyInCart(p.id);
        return `
          <button class="lm-menurow" data-menu-add="${p.id}">
            <div class="tp-menurow-main">
              <div class="tp-menurow-name">${p.name}</div>
              ${p.is_favorite ? `<div class="tp-menurow-fav">★ Favorito</div>` : ''}
            </div>
            <span class="tp-menurow-price">${fmt(p.price)}</span>
            ${qty > 0 ? `<span class="tp-menu-qty">${qty}</span>` : ''}
            <span class="tp-addbtn-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </span>
          </button>`;
      }).join('');
      return `
        <div class="tp-menu-group">
          <div class="tp-menu-grouphead">
            <span class="tp-catdot" style="background:${cat.color || '#94A3B8'}"></span>
            <span class="tp-menu-groupname">${cat.name}</span>
            <div class="tp-menu-grouprule"></div>
          </div>
          <div class="tp-menu-rows">${rows}</div>
        </div>`;
    }).join('');

    scroll.querySelectorAll('[data-menu-add]').forEach(btn => {
      btn.addEventListener('click', function() { vrOpenProductModal(this.dataset.menuAdd); });
    });
  }

  function renderFavs() {
    const grid = $('vr-favgrid');
    const count = $('vr-fav-count');
    if (!grid) return;
    const favs = S.products.filter(p => p.is_favorite);
    if (count) count.textContent = favs.length;
    if (!favs.length) {
      grid.innerHTML = `
        <div class="tp-soft-empty" style="grid-column:1/-1">
          <div class="tp-soft-empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
          <div class="tp-soft-empty-title">Sin favoritos todavía</div>
          <div class="tp-soft-empty-text">Marca productos como favoritos desde el catálogo.</div>
        </div>`;
      return;
    }
    grid.innerHTML = renderProdCards(favs);
    attachProdEvents(grid);
    refreshBadges();
  }

  /* ─── Búsqueda ───────────────────────────────────────────────── */
  function setupSearch() {
    const input   = $('vr-search-input');
    const clear   = $('vr-search-clear');
    const empty   = $('vr-search-empty');
    const results = $('vr-search-results');
    const hint    = $('vr-search-hint');

    if (!input) return;

    // Total hint
    hint.textContent = 'Busca entre los ' + S.products.length + ' productos del catálogo.';

    input.addEventListener('input', function() {
      const q = this.value.trim().toLowerCase();
      clear.hidden = !q;
      if (!q) {
        empty.hidden   = false;
        results.hidden = true;
        return;
      }
      const found = S.products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.catName || '').toLowerCase().includes(q)
      );
      if (!found.length) {
        empty.hidden   = false;
        results.hidden = true;
        const t = empty.querySelector('.tp-soft-empty-title');
        if (t) t.textContent = 'Sin resultados para "' + q + '"';
        return;
      }
      const t = empty.querySelector('.tp-soft-empty-title');
      if (t) t.textContent = 'Escribe para buscar';
      empty.hidden   = true;
      results.hidden = false;
      results.innerHTML = renderProdCards(found);
      attachProdEvents(results);
      refreshBadges();
    });

    clear.addEventListener('click', function() {
      input.value = '';
      clear.hidden = true;
      empty.hidden = false;
      results.hidden = true;
      const t = empty.querySelector('.tp-soft-empty-title');
      if (t) t.textContent = 'Escribe para buscar';
    });
  }

  /* ─── Cliente ─────────────────────────────────────────────── */
  function setupClienteRow() {
    const row = $('vr-cliente-row');
    if (!row) return;
    row.addEventListener('click', function(e) {
      renderClienteList();
      openModalById('modal-cliente');
    });
  }

  function openModalById(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }
  function closeModalById(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  function updateClienteDisplay() {
    const row = $('vr-cliente-row');
    const ph  = $('vr-cliente-placeholder');
    const mc  = $('vr-meta-cliente');
    const name = S.cliente ? S.cliente.nombre : null;
    if (ph)  { ph.textContent = name || 'Selecciona un cliente'; }
    if (row) { row.classList.toggle('has-value', !!name); }
    if (mc)  { mc.textContent = name || '—'; }
  }

  function renderClienteList() {
    const input = document.getElementById('vr-cli-search-input');
    const list  = document.getElementById('vr-cli-list');
    if (!list) return;
    const lq = input ? input.value.trim().toLowerCase() : '';
    const shown = lq
      ? S.clientes.filter(c => (c.nombre + ' ' + (c.tel || '')).toLowerCase().includes(lq))
      : S.clientes;
    if (!shown.length) {
      list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0">' + (lq ? 'Sin resultados' : 'No hay clientes guardados. Crea el primero.') + '</div>';
      return;
    }
    list.innerHTML = shown.map(c => `
      <button class="d-clirow" data-cli-id="${c.id}">
        <div class="d-clirow-main">
          <div class="d-clirow-name">${c.nombre}</div>
          ${c.tel ? `<div class="d-clirow-sub">${c.tel}</div>` : ''}
        </div>
        <span class="d-clirow-edit" data-edit-cli="${c.id}" onclick="event.stopPropagation()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </span>
      </button>`).join('');
  }

  function openNuevoCli(editId) {
    S.editCliId = editId || null;
    const title = document.getElementById('vr-nuevocli-title');
    if (title) title.textContent = editId ? 'Editar cliente' : 'Nuevo cliente';
    document.getElementById('vr-cli-nombres').value   = '';
    document.getElementById('vr-cli-telefono').value  = '';
    document.getElementById('vr-cli-barrio').value    = '';
    document.getElementById('vr-cli-direccion').value = '';
    if (editId) {
      const c = S.clientes.find(x => x.id === editId);
      if (c) {
        document.getElementById('vr-cli-nombres').value   = c.nombre || '';
        document.getElementById('vr-cli-telefono').value  = c.tel    || '';
        document.getElementById('vr-cli-barrio').value    = c.barrio || '';
        document.getElementById('vr-cli-direccion').value = c.dir    || '';
      }
    }
    closeModalById('modal-cliente');
    openModalById('modal-nuevocli');
  }

  function guardarClienteVR() {
    const nombre  = (document.getElementById('vr-cli-nombres').value  || '').trim();
    const tel     = (document.getElementById('vr-cli-telefono').value || '').trim();
    const barrio  = (document.getElementById('vr-cli-barrio').value   || '').trim();
    const dir     = (document.getElementById('vr-cli-direccion').value|| '').trim();
    if (!nombre) { alert('Ingresa un nombre'); return; }
    if (S.editCliId) {
      const idx = S.clientes.findIndex(c => c.id === S.editCliId);
      if (idx >= 0) {
        Object.assign(S.clientes[idx], { nombre, tel, barrio, dir });
        if (S.cliente && S.cliente.id === S.editCliId) S.cliente = S.clientes[idx];
      }
    } else {
      const newCli = { id: 'C-' + Date.now(), nombre, tel, barrio, dir };
      S.clientes.unshift(newCli);
      S.cliente = newCli;
    }
    saveClientes();
    closeModalById('modal-nuevocli');
    updateClienteDisplay();
  }

  /* ─── Modales ────────────────────────────────────────────────── */
  function openModal(name) {
    const overlay = document.querySelector(`[data-modal="${name}"]`);
    if (!overlay) return;

    // Rellenar datos del vale
    if (name === 'vale') {
      $('vr-vale-turno').textContent  = '#' + String(S.turno).padStart(3,'0');
      $('vr-vale-cliente').textContent = (S.cliente && S.cliente.nombre) || 'Consumidor final';
      $('vr-vale-items').textContent   = calcCount() + ' productos';
      $('vr-vale-total').textContent   = fmt(calcTotal());
    }

    overlay.hidden = false;
    overlay.addEventListener('click', function onVeil(e) {
      if (e.target === overlay) { closeAllModals(); overlay.removeEventListener('click', onVeil); }
    });
  }

  function closeAllModals() {
    document.querySelectorAll('[data-modal]').forEach(m => { m.hidden = true; });
  }

  function setupModals() {
    // Botones modal-close
    document.querySelectorAll('[data-action="modal-close"]').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    // Descuento — chips de porcentaje
    document.querySelectorAll('[data-pct]').forEach(chip => {
      chip.addEventListener('click', function() {
        document.querySelectorAll('[data-pct]').forEach(c => c.classList.remove('on'));
        this.classList.add('on');
        const pct = parseInt(this.dataset.pct, 10);
        const monto = Math.round(calcSubtotal() * pct / 100);
        $('vr-discount-input').value = monto;
      });
    });

    // Aplicar descuento
    $('vr-discount-apply').addEventListener('click', function() {
      const raw = parseInt($('vr-discount-input').value || '0', 10);
      S.descuento = Math.min(raw, calcSubtotal());
      closeAllModals();
      renderComanda();
    });

    // Cancelar venta
    $('vr-cancelar-confirm').addEventListener('click', function() {
      vaciarCart();
      S.descuento = 0;
      S.cliente   = null;
      S.turno    += 1;
      saveTurno();
      updateClienteDisplay();
      closeAllModals();
      renderComanda();
    });
  }

  /* ─── Tabs navegación ────────────────────────────────────────── */
  function setupTabs() {
    document.querySelectorAll('.lm-bigtab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.lm-bigtab').forEach(t => t.classList.remove('is-active'));
        document.querySelectorAll('.tp-pane').forEach(p => p.classList.remove('on'));
        this.classList.add('is-active');
        const pane = document.querySelector(`[data-pane="${this.dataset.tab}"]`);
        if (pane) {
          pane.classList.add('on');
          if (this.dataset.tab === 'menu')      renderMenuPane();
          if (this.dataset.tab === 'favoritos') renderFavs();
        }
      });
    });

    // Volver a categorías
    const backBtn = $('vr-back-cats');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        document.querySelectorAll('[data-sub]').forEach(s => s.classList.remove('on'));
        document.querySelector('[data-sub="grid"]').classList.add('on');
        S.currentCatId = null;
      });
    }
  }

  /* ─── Acciones sidebar ───────────────────────────────────────── */
  function setupSidebarActions() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', function() {
        const action = this.dataset.action;
        switch (action) {
          case 'back':
            window.location.href = 'ventas.html';
            break;
          case 'pago':
            irAPagos();
            break;
          case 'cliente':
            renderClienteList();
            openModalById('modal-cliente');
            break;
          case 'vale':
            openModal('vale');
            break;
          case 'discount':
            // Reset chips y monto
            document.querySelectorAll('[data-pct]').forEach(c => c.classList.remove('on'));
            $('vr-discount-input').value = S.descuento > 0 ? S.descuento : '';
            openModal('discount');
            break;
          case 'cancelar':
            openModal('cancelar');
            break;
        }
      });
    });

    // Vaciar
    $('vr-btn-vaciar').addEventListener('click', function() {
      if (confirm('¿Vaciar el pedido?')) vaciarCart();
    });

    // Guardar
    $('vr-btn-guardar').addEventListener('click', guardarPedido);

    // Enviar a cocina
    $('vr-btn-enviar').addEventListener('click', enviarACocina);
  }

  /* ─── Supabase: cargar datos ─────────────────────────────────── */
  async function loadBranch() {
    const sb = getSb();
    if (!sb) return;
    const { data: _authData } = await sb.auth.getUser();
    const user = (_authData && _authData.user)
      || (window._pos && window._pos.state && window._pos.state.user);
    S.branchId = (user && user.user_metadata && user.user_metadata.branch_id) || null;
    S.tenantId = (user && user.user_metadata && user.user_metadata.tenant_id) || null;
    // Nombre sucursal
    if (S.branchId) {
      const { data } = await sb.from('branches').select('name').eq('id', S.branchId).maybeSingle();
      if (data) $('vr-branch-name').textContent = data.name || '';
    }
    // Usuario
    if (user) {
      const meta = user.user_metadata || {};
      const nombre = meta.nombre || meta.name || user.email || 'Usuario';
      const rol    = meta.role || 'mesero';
      const initials = nombre.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      $('vr-user-avatar').textContent  = initials;
      $('vr-user-name').textContent    = nombre;
      $('vr-user-role').textContent    = rol;
    }
  }

  async function loadCatalog() {
    const sb = getSb();
    if (!sb || !S.tenantId) return;
    const _ck = 'pos.catalog.v4.' + S.tenantId;
    try {
      const _raw = localStorage.getItem(_ck);
      if (_raw) {
        const _cd = JSON.parse(_raw);
        // Solo confiar en caché CON productos (una caché vacía es basura de una
        // eliminación/importación a medias → traer fresco)
        if (_cd && _cd.cats && Array.isArray(_cd.products) && _cd.products.length > 0) {
          S.categories = _cd.cats;
          S.products   = _cd.products;
          S.modGroups  = _cd.modGroups || [];
          renderCatGrid(); renderFavs(); setupSearch(); refreshBadges();
          setTimeout(function() { _catalogFetch(sb, _ck, true); }, 0);
          return;
        }
      }
    } catch(e) {}
    await _catalogFetch(sb, _ck, false);
  }

  async function _catalogFetch(sb, cacheKey, isBackground) {
    for (let intento = 1; intento <= 3; intento++) {
    try {
      const PALETA = [
        {color:'#5B6BFF',tint:'#F0F1FF',ring:'#C7CBFF'},
        {color:'#8B5CF6',tint:'#F5F3FF',ring:'#DDD6FE'},
        {color:'#EC4899',tint:'#FDF2F8',ring:'#FBCFE8'},
        {color:'#F59E0B',tint:'#FFFBEB',ring:'#FDE68A'},
        {color:'#10B981',tint:'#ECFDF5',ring:'#A7F3D0'},
        {color:'#0EA5E9',tint:'#F0F9FF',ring:'#BAE6FD'},
      ];
      const [{ data: cats }, { data: prods }, { data: mods }] = await Promise.all([
        sb.from('pos_categories').select('id,name,color,color_tint,color_ring,image_url,comanda_alias').eq('active', true).eq('tenant_id', S.tenantId).order('name'),
        sb.from('pos_products').select('id,name,price,price_mode,category_id,photo_url,available,presentations,variables,mod_group_ids,mod_group_pres').eq('available', true).eq('tenant_id', S.tenantId).order('name'),
        sb.from('pos_modifier_groups').select('id,name,rule,multi,options').eq('tenant_id', S.tenantId),
      ]);
      S.categories = (cats || []).map((c, i) => ({
        ...c,
        color: c.color      || PALETA[i % PALETA.length].color,
        tint:  c.color_tint || PALETA[i % PALETA.length].tint,
        ring:  c.color_ring || PALETA[i % PALETA.length].ring,
      }));
      S.products = (prods || []).map(p => {
        const cat = S.categories.find(c => String(c.id) === String(p.category_id));
        return {
          ...p,
          price_mode:    p.price_mode || 'fixed',
          presentations: Array.isArray(p.presentations) ? p.presentations : [],
          variables:     Array.isArray(p.variables)     ? p.variables     : [],
          mod_group_ids: Array.isArray(p.mod_group_ids) ? p.mod_group_ids : [],
          mod_group_pres: (p.mod_group_pres && typeof p.mod_group_pres === 'object') ? p.mod_group_pres : {},
          catName:  cat ? cat.name  : '',
          catAlias: cat ? (cat.comanda_alias || null) : null,
          catColor: cat ? cat.color : '#94A3B8',
        };
      });
      S.modGroups = (mods || []).map(g => ({
        id: g.id, name: g.name, rule: g.rule || 'opcional', multi: !!g.multi,
        options: Array.isArray(g.options) ? g.options : [],
      }));
      try {
        if (S.products.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({ cats: S.categories, products: S.products, modGroups: S.modGroups }));
        }
      } catch(e) {}
      renderCatGrid(); renderFavs(); setupSearch(); refreshBadges();
      return;
    } catch(e) {
      console.error('[venta-rapida] _catalogFetch intento ' + intento + ':', e);
      if (intento < 3) await new Promise(function(r){ setTimeout(r, 1200 * intento); });
    }
    }
    renderCatGrid(); renderFavs(); setupSearch(); refreshBadges();
  }

  /* ─── Supabase: enviar pedido ────────────────────────────────── */
  async function guardarPedido() {
    if (!S.cart.length) return;
    const sb = getSb();
    if (!sb) return;
    try {
      await upsertOrder(sb, false);
      alert('Pedido guardado.');
    } catch(e) {
      console.error('guardarPedido:', e);
      alert('Error al guardar: ' + e.message);
    }
  }

  // Tras enviar una venta: limpiar el carrito persistido y avanzar el turno.
  // (Antes el carrito quedaba en localStorage y al volver a la pantalla se
  // re-enviaba el MISMO pedido → órdenes duplicadas; y el turno solo avanzaba
  // al cancelar, nunca al vender.)
  function finalizarVenta() {
    S.cart = [];
    saveCart();
    S.turno += 1;
    saveTurno();
    S.orderId = null;
    S.descuento = 0;
  }

  async function enviarACocina() {
    if (!S.cart.length) return;
    const sb = getSb();
    if (!sb) return;
    try {
      const cobroAdelantado = localStorage.getItem('pos.config.cobro_adelantado') === 'true';
      let _oid;
      if (cobroAdelantado) {
        // Cobro adelantado: quedar como pendiente_pago y volver al salón
        // El cajero cobra desde la vista de ventas cuando el pedido esté listo
        _oid = await upsertOrder(sb, true, 'pendiente_pago');
      } else {
        // Cobro al final: enviar a cocina y volver a ventas
        _oid = await upsertOrder(sb, true);
      }
      // Imprimir la comanda en el acto (Electron). Antes venta rápida no
      // imprimía: dependía del realtime de la caja, que perdía el evento al
      // navegar. El candado de posAutoprint evita duplicados si el realtime
      // también dispara.
      if (_oid && typeof window.posAutoprint === 'function' && window.electronPOS) {
        await Promise.race([window.posAutoprint(_oid), new Promise(res => setTimeout(res, 9000))]);
      }
      finalizarVenta();
      window.location.href = 'ventas.html';
    } catch(e) {
      console.error('enviarACocina:', e);
      alert('Error al enviar: ' + e.message);
    }
  }

  async function irAPagos() {
    if (!S.cart.length) return;
    const sb = getSb();
    if (!sb) return;
    try {
      const orderId = await upsertOrder(sb, true);
      // Imprimir la comanda de cocina en el acto (Electron) antes de ir a cobrar.
      // Antes, cobrar por "Opciones de pago" no imprimía nada porque la impresión
      // solo ocurría en "Enviar a cocina". El candado de posAutoprint evita duplicados.
      if (orderId && typeof window.posAutoprint === 'function' && window.electronPOS) {
        await Promise.race([window.posAutoprint(orderId), new Promise(res => setTimeout(res, 9000))]);
      }
      finalizarVenta();
      window.location.href = `pagos.html?order=${orderId}&channel=rapido`;
    } catch(e) {
      alert('Error: ' + e.message);
    }
  }

  async function upsertOrder(sb, visible, orderStatus) {
    const user   = window._pos && window._pos.state && window._pos.state.user;
    const userId = user ? user.id : null;
    const total  = calcTotal();
    const sub    = calcSubtotal();
    const status = orderStatus || 'in_progress';

    // Crear o reusar orden
    if (!S.orderId) {
      const _vrBarrio = S.cliente && S.cliente.barrio ? S.cliente.barrio.trim() : '';
      const { data: order, error } = await sb.from('pos_orders').insert({
        branch_id:      S.branchId,
        waiter_id:      userId,
        table_id:       null,
        channel:        'rapido',
        status:         status,
        total:          total,
        subtotal:       sub,
        packaging_fee:  calcEmpaque(),
        discount:        S.descuento,
        discount_amount: S.descuento,
        service_charge: 0,
        customer_name:  (S.cliente && S.cliente.nombre) || null,
        notes:          _vrBarrio ? '[barrio:' + _vrBarrio.toUpperCase() + ']' : null,
        visible_cocina: !!visible,
        turno:          S.turno,
      }).select('id').single();
      if (error) throw error;
      S.orderId = order.id;
    } else {
      // Actualizar orden existente
      const updatePayload = {
        total:          total,
        subtotal:       sub,
        packaging_fee:  calcEmpaque(),
        discount:        S.descuento,
        discount_amount: S.descuento,
        customer_name:  (S.cliente && S.cliente.nombre) || null,
        visible_cocina: !!visible,
      };
      if (orderStatus) updatePayload.status = orderStatus;
      await sb.from('pos_orders').update(updatePayload).eq('id', S.orderId);
      // Borrar ítems anteriores
      await sb.from('pos_order_items').delete().eq('order_id', S.orderId);
    }

    // Insertar ítems
    const items = S.cart.map(i => ({
      order_id:      S.orderId,
      product_id:    i.productId || i.id,
      name:          i.name,
      product_name:  i.name,
      product_price: i.price,
      quantity:      i.qty,
      unit_price:    i.price,
      total:         i.price * i.qty,
      branch_id:     S.branchId,
      tenant_id:     S.tenantId,
      notes:         i.note || null,
      selections:    i.selections || {},
      status:        'pending',
    }));
    if (items.length) {
      const { error: itemErr } = await sb.from('pos_order_items').insert(items);
      if (itemErr) console.warn('items insert:', itemErr);
    }

    return S.orderId;
  }


  /* ─── Modal producto VR (Presentaciones / Variables / Personalizar) ─── */
  let VR_WIP = { prod:null, stepIdx:0, pres:null, vars:{}, mods:{}, qty:1, note:'' };

  const VR_SVG = {
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
  };

  function vrFmt(n){ return '$'+Number(Math.round(n||0)).toLocaleString('es-CO'); }
  function vrEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function vrAttr(s){ return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function vrOpenProductModal(prodId) {
    const p = S.products.find(x => String(x.id) === String(prodId));
    if (!p) return;
    const hasPres = (p.presentations||[]).length > 1;
    // Igual que Mesa: SIEMPRE abrir el modal (para poder elegir presentación,
    // adiciones y notas), incluso para productos "simples".
    VR_WIP = { prod:p, stepIdx:0, pres:null, vars:{}, mods:{}, qty:1, note:'' };
    if (!hasPres) {
      const pArr = p.presentations || [];
      VR_WIP.pres = pArr.length === 1 ? pArr[0] : { id:'_base', name:'', price: parseFloat(p.price)||0 };
    }
    const el = document.getElementById('vr-modal-producto');
    if (el) el.style.display = 'flex';
    vrRenderMP();
  }
  // Un paso por CADA variable (además de Presentación y Personalizar).
  function vrSteps(p){
    const steps=[];
    if((p.presentations||[]).length>1) steps.push({kind:'pres',label:p.presLabel||'Presentacion'});
    (p.variables||[]).forEach(function(vg){ steps.push({kind:'var',varId:vg.id,vg:vg,label:vg.name||'Variante'}); });
    steps.push({kind:'custom',label:'Personalizar'});
    return steps;
  }
  function vrModGroupApplies(prod,gid,presId){
    const map=(prod&&prod.mod_group_pres)||{};
    const list=map[gid];
    if(!list||!list.length) return true;
    if(!presId) return true;
    return list.indexOf(presId)!==-1;
  }

  function vrComputePrice() {
    const p = VR_WIP.prod;
    const isMatrix = p && p.price_mode === 'matrix';
    let base;
    if (isMatrix) {
      const presIdx = (p.presentations||[]).findIndex(pr => pr.id === VR_WIP.pres?.id);
      base = Object.values(VR_WIP.vars).reduce((s, v) => {
        let price = v.price || 0;
        if (presIdx >= 0) {
          for (const vg of p.variables||[]) {
            const o = (vg.options||[]).find(o => o.id === v.id);
            if (o && Array.isArray(o.prices) && o.prices.length) { price = o.prices[presIdx]||0; break; }
          }
        }
        return s + price;
      }, 0);
    } else {
      const baseP = p ? parseFloat(p.price)||0 : 0;
      base = VR_WIP.pres ? (VR_WIP.pres.price || baseP) : baseP;
      base += Object.values(VR_WIP.vars).reduce((s, v) => s + (v.price||0), 0);
    }
    const modX = Object.values(VR_WIP.mods).reduce((s, m) => s + ((m.price||0)*(m.qty||1)), 0);
    return (base + modX) * VR_WIP.qty;
  }

  function vrRenderMP() {
    const p = VR_WIP.prod; if (!p) return;
    const inner = document.getElementById('vr-pm-inner'); if (!inner) return;
    const steps = vrSteps(p);
    let curIdx = VR_WIP.stepIdx||0; if(curIdx<0)curIdx=0; if(curIdx>=steps.length)curIdx=steps.length-1;
    VR_WIP.stepIdx = curIdx;
    const cur = steps[curIdx];
    const stepperHTML = steps.length > 1
      ? '<div class="pm-steps">' + steps.map((s, i) => {
          const done = i < curIdx, on = i === curIdx;
          return '<button class="pm-step'+(done?' done':on?' on':'')+'" data-step-idx="'+i+'">'
            +'<span class="pm-step-dot">'+(done?VR_SVG.check:String(i+1))+'</span>'
            +'<span class="pm-step-lbl">'+vrEsc(s.label)+'</span></button>'
            +(i < steps.length-1 ? '<span class="pm-step-line'+(done?' done':'')+'"></span>' : '');
        }).join('') + '</div>'
      : '';
    const presLabel = VR_WIP.pres && VR_WIP.pres.name ? VR_WIP.pres.name : '';
    const varLabels = Object.values(VR_WIP.vars).map(v => v.name).join(' \xb7 ');
    const selParts  = [presLabel, varLabels].filter(Boolean).join(' \xb7 ');
    let paneHTML = '';
    if (cur.kind === 'pres') paneHTML = vrBuildPresPane(p);
    else if (cur.kind === 'var') paneHTML = vrBuildVarPane(p, cur.vg);
    else paneHTML = vrBuildCustomPane(p);
    const canNext = cur.kind==='pres' ? !!VR_WIP.pres : cur.kind==='var' ? !!VR_WIP.vars[cur.varId] : true;
    const isFirst = curIdx === 0;
    const footLeft = isFirst
      ? '<button class="pm-btn-ghost" onclick="vrCloseMP()">Cancelar</button>'
      : '<button class="pm-btn-ghost" onclick="vrMPBack()">'+VR_SVG.back+' Atras</button>';
    const isLast = cur.kind === 'custom';
    const footRight = isLast
      ? '<button class="pm-btn-primary" onclick="vrMPAddToCart()">'+VR_SVG.cart+' Agregar \xb7 <span id="vr-foot-price">'+vrFmt(vrComputePrice())+'</span></button>'
      : '<button class="pm-btn-primary" id="vr-mp-next"'+(canNext?'':' disabled')+' onclick="vrMPAdvance()">Continuar '+VR_SVG.chev+'</button>';
    const subTxt = selParts ? vrEsc(p.catName||'') + ' &middot; <strong style="color:#0F172A">' + vrEsc(selParts) + '</strong>' : vrEsc(p.catName||'');
    inner.innerHTML =
      '<div class="pm-head">'
      +'<div style="display:flex;align-items:center;gap:12px;min-width:0">'
      +'<div class="pm-head-ic">'+VR_SVG.food+'</div>'
      +'<div style="min-width:0"><div class="pm-title">'+vrEsc(p.name)+'</div>'
      +'<div class="pm-sub">'+subTxt+'</div></div></div>'
      +'<button class="pm-close" onclick="vrCloseMP()">'+VR_SVG.x+'</button>'
      +'</div>'
      +stepperHTML
      +'<div class="pm-body">'+paneHTML+'</div>'
      +'<div class="pm-foot">'+footLeft+footRight+'</div>';
    vrAttachHandlers(inner, p, cur);
  }

  function vrBuildPresPane(p) {
    const pres = p.presentations || [];
    const hasVars = (p.variables||[]).length > 0;
    return '<div class="pm-choice-grid">' + pres.map(pr => {
      const on = VR_WIP.pres && VR_WIP.pres.id === pr.id;
      const _img = pr.image_url || p.photo_url;   // imagen propia de la presentación o, si no, la del producto
      const thumb = _img
        ? '<div class="pm-choice-thumb"><img src="'+vrAttr(_img)+'" style="width:100%;height:100%;object-fit:cover"></div>'
        : '<div class="pm-choice-thumb" style="display:flex;align-items:center;justify-content:center;background:#F1F5F9"><span style="font-size:11px;color:#94A3B8">'+vrEsc(pr.name)+'</span></div>';
      const priceLabel = hasVars ? 'Incluido' : (pr.price ? vrFmt(pr.price) : 'Incluido');
      return '<button class="pm-choice'+(on?' on':'')+'" data-pres-id="'+vrAttr(pr.id)+'" data-pres-name="'+vrAttr(pr.name)+'" data-pres-price="'+(pr.price||0)+'">'
        +thumb
        +'<div class="pm-choice-body"><div class="pm-choice-name">'+vrEsc(pr.name)+'</div>'
        +'<div class="pm-choice-price">'+priceLabel+'</div></div>'
        +'<span class="pm-radio">'+(on?VR_SVG.check:'')+'</span>'
        +'</button>';
    }).join('') + '</div>';
  }

  function vrBuildVarPane(p, v) {
    if (!v) v = (p.variables||[])[0];
    if (!v) return '';
    const isMatrix = p.price_mode === 'matrix';
    const presIdx = (p.presentations||[]).findIndex(pr => pr.id === VR_WIP.pres?.id);
    return '<div style="display:flex;flex-direction:column;gap:20px"><div>'
      +'<div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">'+vrEsc(v.name)+'</div>'
      +'<div class="pm-choice-grid">' + (v.options||[]).map(o => {
          const sel = VR_WIP.vars[v.id] && VR_WIP.vars[v.id].id === o.id;
          const optPrice = isMatrix && Array.isArray(o.prices) && presIdx >= 0 ? (o.prices[presIdx]||0) : (o.price||0);
          const priceLabel = optPrice ? (isMatrix ? vrFmt(optPrice) : '+'+vrFmt(optPrice)) : 'Incluido';
          return '<button class="pm-choice compact'+(sel?' on':'')+'" data-var-id="'+vrAttr(v.id)+'" data-opt-id="'+vrAttr(o.id)+'" data-opt-name="'+vrAttr(o.name)+'" data-opt-price="'+optPrice+'">'
            +'<div class="pm-choice-body"><div class="pm-choice-name">'+vrEsc(o.name)+'</div>'
            +'<div class="pm-choice-price">'+priceLabel+'</div></div>'
            +'<span class="pm-radio">'+(sel?VR_SVG.check:'')+'</span>'
            +'</button>';
        }).join('') + '</div></div></div>';
  }

  function vrBuildCustomPane(p) {
    const _presId = VR_WIP.pres && VR_WIP.pres.id;
    const modGroups = (p.mod_group_ids||[])
      .filter(gid => vrModGroupApplies(p, gid, _presId))
      .map(gid => (S.modGroups||[]).find(g => g.id === gid)).filter(Boolean);
    const presLabel = VR_WIP.pres && VR_WIP.pres.name ? VR_WIP.pres.name : '';
    const varLabels = Object.values(VR_WIP.vars).map(v => v.name).join(' \xb7 ');
    const selParts  = [presLabel, varLabels].filter(Boolean);
    const photoHTML = p.photo_url
      ? '<div class="pm-photo"><img src="'+vrAttr(p.photo_url)+'" style="width:100%;height:100%;object-fit:cover"></div>'
      : '<div class="pm-photo pm-photo-ph"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
    const selSummary = selParts.length
      ? vrEsc(p.name)+' &middot; <span class="sel">'+vrEsc(selParts.join(' \xb7 '))+'</span>'
      : vrEsc(p.name);
    const modSumTxt = Object.values(VR_WIP.mods).filter(m=>m.qty>0).map(m=>m.qty>1?m.qty+'x '+m.name:m.name).join(', ')||'Sin adiciones seleccionadas';
    const groupsHTML = modGroups.length
      ? modGroups.map(g => {
          const maxHint = g.multi ? 'Max. '+(g.options||[]).length : 'Elige una';
          const optRows = (g.options||[]).map(o => {
            const modEntry = VR_WIP.mods[o.id]; const modQty = modEntry?(modEntry.qty||0):0;
            const grpOpts = (g.options||[]).map(opt=>opt.id);
            const totalGroupQty = grpOpts.reduce((s,oid)=>s+((VR_WIP.mods[oid]&&VR_WIP.mods[oid].qty)||0),0);
            const groupMax = g.multi?(g.max_total||(g.options||[]).length):1;
            const canInc = totalGroupQty<groupMax;
            return '<div class="pm-mod'+(modQty>0?' on':'')+'" data-mod-id="'+vrAttr(o.id)+'">'
              +'<div style="min-width:0;text-align:left;flex:1"><div class="pm-mod-name">'+vrEsc(o.name)+'</div>'
              +'<div class="pm-mod-price">'+(o.price?'+ '+vrFmt(o.price):'Gratis')+'</div></div>'
              +'<div class="pm-mod-qty-ctrl">'
              +'<button class="pm-mod-dec"'+(modQty<=0?' disabled="disabled"':'')+' data-mod-dec="'+vrAttr(o.id)+'">&#8722;</button>'
              +'<span class="pm-mod-qty-num">'+modQty+'</span>'
              +'<button class="pm-mod-inc"'+(!canInc?' disabled="disabled"':'')+' data-mod-inc="'+vrAttr(o.id)+'" data-mod-name="'+vrAttr(o.name)+'" data-mod-price="'+(o.price||0)+'">+</button>'
              +'</div></div>';
          }).join('');
          return '<div style="margin-top:14px">'
            +'<div class="pm-group-head"><span>'+vrEsc(g.name)+'</span><span class="pm-group-hint">'+maxHint+'</span></div>'
            +'<div class="pm-mods-grid">'+optRows+'</div></div>';
        }).join('')
      : '<div class="pm-nomods"><p>Sin adiciones disponibles para este producto.</p></div>';
    return '<div class="pm-custom">'
      +'<div class="pm-left">'
      +photoHTML
      +'<div class="pm-prodname">'+selSummary+'</div>'
      +'<div class="pm-modsum" id="vr-mod-sum">'+vrEsc(modSumTxt)+'</div>'
      +'<div class="pm-field-lbl">'+VR_SVG.note+' Nota para cocina</div>'
      +'<textarea class="pm-note" placeholder="Ej. sin cebolla, bien caliente..." id="vr-note-input">'+vrEsc(VR_WIP.note)+'</textarea>'
      +'</div>'
      +'<div class="pm-right">'
      +'<div class="pm-qty-row">'
      +'<div style="display:flex;align-items:center;gap:12px">'
      +'<span style="font-size:13px;font-weight:600;color:#475569">Cantidad</span>'
      +'<div class="pm-stepper"><button id="vr-qty-dec">'+VR_SVG.minus+'</button>'
      +'<span id="vr-qty-val">'+VR_WIP.qty+'</span>'
      +'<button id="vr-qty-inc">'+VR_SVG.plus+'</button></div></div>'
      +'<div style="text-align:right"><div class="pm-pf-lbl">Precio</div>'
      +'<div class="pm-pf-val" id="vr-price-val">'+vrFmt(vrComputePrice())+'</div></div></div>'
      +'<div class="pm-search">'+VR_SVG.srch+'<input placeholder="Buscar adiciones..." id="vr-search-inp"></div>'
      +groupsHTML
      +'</div></div>';
  }

  function vrAttachHandlers(inner, p, cur) {
    inner.querySelectorAll('.pm-step.done').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.stepIdx,10);
        if(!isNaN(i)){ VR_WIP.stepIdx = i; vrRenderMP(); }
      });
    });
    if (cur.kind === 'pres') {
      inner.querySelectorAll('.pm-choice[data-pres-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.presId, name = btn.dataset.presName, price = +btn.dataset.presPrice;
          VR_WIP.pres = { id, name, price };
          inner.querySelectorAll('.pm-choice[data-pres-id]').forEach(b => {
            const on = b.dataset.presId === id;
            b.classList.toggle('on', on);
            b.querySelector('.pm-radio').innerHTML = on ? VR_SVG.check : '';
          });
          const nb = document.getElementById('vr-mp-next'); if (nb) nb.disabled = false;
        });
      });
    }
    if (cur.kind === 'var') {
      inner.querySelectorAll('.pm-choice[data-var-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const vid = btn.dataset.varId, oid = btn.dataset.optId, oname = btn.dataset.optName, oprice = +btn.dataset.optPrice;
          VR_WIP.vars[vid] = { id:oid, name:oname, price:oprice };
          inner.querySelectorAll('.pm-choice[data-var-id="'+vid+'"]').forEach(b => {
            const on = b.dataset.optId === oid;
            b.classList.toggle('on', on);
            b.querySelector('.pm-radio').innerHTML = on ? VR_SVG.check : '';
          });
          const nb = document.getElementById('vr-mp-next'); if (nb) nb.disabled = !VR_WIP.vars[cur.varId];
        });
      });
    }
    if (cur.kind === 'custom') {
      const qdec = document.getElementById('vr-qty-dec'), qinc = document.getElementById('vr-qty-inc');
      if (qdec) qdec.addEventListener('click', () => { VR_WIP.qty = Math.max(1, VR_WIP.qty-1); vrUpdatePrices(); });
      if (qinc) qinc.addEventListener('click', () => { VR_WIP.qty++; vrUpdatePrices(); });
      const noteEl = document.getElementById('vr-note-input');
      if (noteEl) { noteEl.value = VR_WIP.note; noteEl.addEventListener('input', function(){ VR_WIP.note = this.value; }); }
      inner.querySelectorAll('[data-mod-inc]').forEach(function(incBtn){
        incBtn.addEventListener('click', function(e){
          e.stopPropagation();
          var id=incBtn.dataset.modInc, mname=incBtn.dataset.modName, price=parseFloat(incBtn.dataset.modPrice)||0;
          var g=(p.mod_group_ids||[]).map(function(gid){return (S.modGroups||[]).find(function(g){return g.id===gid;});}).filter(Boolean)
                   .find(function(g){return (g.options||[]).some(function(o){return o.id===id;});});
          var groupMax=g?(g.max_total||(g.options||[]).length):999;
          var grpOpts=g?(g.options||[]).map(function(o){return o.id;}):[];
          var totalGroupQty=grpOpts.reduce(function(s,oid){return s+((VR_WIP.mods[oid]&&VR_WIP.mods[oid].qty)||0);},0);
          if(totalGroupQty>=groupMax) return;
          if(!VR_WIP.mods[id]) VR_WIP.mods[id]={name:mname,price:price,qty:0};
          VR_WIP.mods[id].qty=(VR_WIP.mods[id].qty||0)+1;
          vrSyncModUI(inner,p); vrUpdatePrices();
          var ms=document.getElementById('vr-mod-sum');
          if(ms) ms.textContent=Object.values(VR_WIP.mods).filter(function(m){return m.qty>0;}).map(function(m){return m.qty>1?m.qty+'x '+m.name:m.name;}).join(', ')||'Sin adiciones seleccionadas';
        });
      });
      inner.querySelectorAll('[data-mod-dec]').forEach(function(decBtn){
        decBtn.addEventListener('click', function(e){
          e.stopPropagation();
          var id=decBtn.dataset.modDec;
          if(!VR_WIP.mods[id]||VR_WIP.mods[id].qty<=0) return;
          VR_WIP.mods[id].qty--;
          if(VR_WIP.mods[id].qty<=0) delete VR_WIP.mods[id];
          vrSyncModUI(inner,p); vrUpdatePrices();
          var ms=document.getElementById('vr-mod-sum');
          if(ms) ms.textContent=Object.values(VR_WIP.mods).filter(function(m){return m.qty>0;}).map(function(m){return m.qty>1?m.qty+'x '+m.name:m.name;}).join(', ')||'Sin adiciones seleccionadas';
        });
      });
      const sinp=document.getElementById('vr-search-inp');
      if(sinp) sinp.addEventListener('input',function(){
        const q=this.value.toLowerCase().trim();
        inner.querySelectorAll('.pm-mod').forEach(b=>{
          const nm=b.querySelector('.pm-mod-name')?b.querySelector('.pm-mod-name').textContent.toLowerCase():'';
          b.style.display=q&&!nm.includes(q)?'none':'';
        });
      });
    }
  }
  function vrSyncModUI(inner,p){
    inner.querySelectorAll('[data-mod-id]').forEach(function(div){
      var id=div.dataset.modId;
      var entry=VR_WIP.mods[id];
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
        var grpOpts=g?(g.options||[]).map(function(o){return o.id;}):[];
        var totalGroupQty=grpOpts.reduce(function(s,oid){return s+((VR_WIP.mods[oid]&&VR_WIP.mods[oid].qty)||0);},0);
        incBtn.disabled=totalGroupQty>=groupMax;
      }
    });
  }

  function vrUpdatePrices() {
    const p = document.getElementById('vr-price-val'); if (p) p.textContent = vrFmt(vrComputePrice());
    const f = document.getElementById('vr-foot-price'); if (f) f.textContent = vrFmt(vrComputePrice());
    const q = document.getElementById('vr-qty-val'); if (q) q.textContent = VR_WIP.qty;
  }

  function vrCloseMP() {
    const el = document.getElementById('vr-modal-producto'); if (el) el.style.display = 'none';
  }

  function vrCheckOverlayClose(e) { if (e.target === e.currentTarget) vrCloseMP(); }

  function vrMPAdvance() {
    const steps = vrSteps(VR_WIP.prod);
    VR_WIP.stepIdx = Math.min(steps.length-1, (VR_WIP.stepIdx||0)+1);
    vrRenderMP();
  }

  function vrMPBack() {
    VR_WIP.stepIdx = Math.max(0, (VR_WIP.stepIdx||0)-1);
    vrRenderMP();
  }

  function vrMPAddToCart() {
    const p = VR_WIP.prod;
    // Si la presentación no tiene nombre, usar el nombre de la CATEGORÍA como prefijo.
    const presLabel = (VR_WIP.pres && VR_WIP.pres.name ? VR_WIP.pres.name : '') || (p.catAlias || p.catName || '');
    const varLabels = Object.values(VR_WIP.vars).map(v => v.name).join(' \xb7 ');
    const displayName = [presLabel, p.name, varLabels].filter(Boolean).join(' \xb7 ');
    const unitPrice = vrComputePrice() / VR_WIP.qty;
    const modSummary = Object.values(VR_WIP.mods).filter(m=>m.qty>0).map(m=>(m.qty>1?m.qty+'x ':'')+m.name).join(', ');
    const lineId = 'vr_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const cat = S.categories.find(c => String(c.id) === String(p.category_id));
    S.cart.push({
      id:        lineId,
      productId: p.id,
      presId:    (VR_WIP.pres && VR_WIP.pres.id !== '_base') ? VR_WIP.pres.id : null,
      name:      displayName,
      price:     unitPrice,
      qty:       VR_WIP.qty,
      note:      VR_WIP.note || '',
      modSummary: modSummary,
      catId:     p.category_id,
      catName:   p.catName || '',
      catColor:  p.catColor || '#94A3B8',
      fav:       !!p.is_favorite,
      fromModal: true,
      selections:{ pres: presLabel||null, vars:{...VR_WIP.vars}, mods:{...VR_WIP.mods} },
    });
    vrCloseMP();
    saveCart();
    renderComanda();
  }

  /* ─── window expose (IIFE) ───────────────────────────────────── */
  window.vrCloseMP           = vrCloseMP;
  window.vrCheckOverlayClose = vrCheckOverlayClose;
  window.vrMPAdvance         = vrMPAdvance;
  window.vrMPBack            = vrMPBack;
  window.vrMPAddToCart       = vrMPAddToCart;

  /* ─── Boot ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    // Restaurar estado local
    loadCart();
    loadClientes();
    loadTurno();

    // Restaurar fila cliente
    updateClienteDisplay();

    setupTabs();
    setupClienteRow();
    setupSidebarActions();
    setupModals();
    renderComanda();

    // Event delegation para modales de cliente
    document.addEventListener('click', function(e) {
      const el = e.target.closest('[data-close-modal],[data-open-vrnuevocli],[data-back-cli],[data-guardar-cli],[data-cli-id],[data-edit-cli]');
      if (!el) return;
      if (el.dataset.closeModal) { closeModalById(el.dataset.closeModal); return; }
      if (el.hasAttribute('data-open-vrnuevocli')) { openNuevoCli(null); return; }
      if (el.hasAttribute('data-back-cli')) { closeModalById('modal-nuevocli'); openModalById('modal-cliente'); return; }
      if (el.hasAttribute('data-guardar-cli')) { guardarClienteVR(); return; }
      if (el.dataset.editCli) { openNuevoCli(el.dataset.editCli); return; }
      if (el.dataset.cliId) {
        const c = S.clientes.find(x => x.id === el.dataset.cliId);
        if (c) { S.cliente = c; updateClienteDisplay(); }
        closeModalById('modal-cliente');
      }
    });
    // Busqueda en lista de clientes
    document.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'vr-cli-search-input') renderClienteList();
    });

    // Esperar a que pos-core esté listo
    if (window._pos) {
      window._pos.on('core:ready', async function() {
        if (window.cajaGuard && !(await window.cajaGuard(window._pos.state.branchId))) return;
            await loadBranch();
        await loadCatalog();
        refreshBadges();
      });
    }
  });

})();
