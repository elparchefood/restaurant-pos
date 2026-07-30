/* pos-stock.js — Detector de "sin inventario" para las pantallas de pedido.
 * Un producto está "agotado" si algún insumo de su receta tiene stock <= 0.
 * La política "vender sin inventario" vive en operacion_config.ventaSinInventario.
 * Uso en cada pantalla de venta:
 *   await posStock.load(sb);                       // tras cargar productos
 *   claseExtra  = posStock.cardClass(prodId);      // en la clase de la tarjeta
 *   badgeHTML   = posStock.badge(prodId);          // dentro del recuadro de la foto
 *   // al hacer clic en un producto:
 *   if (posStock.agotado(id)) {
 *     if (!posStock.allow) { posStock.toast('Sin inventario'); return; }
 *     if (!(await posStock.warn(nombre, posStock.faltantes(id)))) return;
 *   }
 */
(function () {
  var S = { ready: false, allow: false, _lines: {}, _ins: {} };
  function num(v) { return Number(v) || 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── Helpers de recetas por VARIANTE ──────────────────────────
  // Cada linea: { ins:insumo_id, varOpt:variant_option_id|'' , qty:cantidades|null }
  //   varOpt vacio  → linea BASE: aplica a TODAS las combinaciones del producto.
  //   varOpt lleno  → aplica solo a esa opcion (sabor/variante).
  // Un insumo está agotado:
  //  · control manual ON  → SOLO si lo marcaron a mano (agotado_manual), sin importar el stock.
  //  · control manual OFF → si su stock llegó a 0 (comportamiento normal).
  function insAgotado(insId) {
    var i = S._ins[insId];
    if (!i) return false;
    if (i.manual) return !!i.agotadoManual;
    return i.stock <= 0;
  }

  // Nombres de insumos agotados que aplican a una combinacion (opcion + presentacion).
  // Si varOptId es undefined/null → SOLO lineas base (el producto "entero").
  function faltForCombo(pid, varOptId, presId) {
    var lines = S._lines[pid] || [], out = [], seen = {};
    var soloBase = (varOptId === undefined || varOptId === null || varOptId === '');
    lines.forEach(function (l) {
      if (l.varOpt) { if (soloBase || l.varOpt !== varOptId) return; }   // linea de variante: solo si coincide la opcion
      // Si se pasa presentacion y la linea tiene mapa de cantidades, exigir qty>0 para esa presentacion.
      if (presId !== undefined && presId !== null && l.qty) {
        var q = (l.qty[presId] != null) ? l.qty[presId] : (l.qty['_'] != null ? l.qty['_'] : null);
        if (q != null && !(num(q) > 0)) return;
      }
      if (insAgotado(l.ins)) {
        var nm = (S._ins[l.ins] || {}).nombre || 'insumo';
        if (!seen[nm]) { seen[nm] = 1; out.push(nm); }
      }
    });
    return out;
  }

  window.posStock = {
    get allow() { return S.allow; },
    get ready() { return S.ready; },

    // Carga política + insumos + recetas y arma el mapa producto→faltantes.
    load: async function (sb) {
      S.ready = false; S._lines = {}; S._ins = {};
      try {
        var cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
        S.allow = !!cfg.ventaSinInventario;
      } catch (e) { S.allow = false; }
      try {
        var u = await sb.auth.getUser();
        var meta = (u && u.data && u.data.user && u.data.user.user_metadata) || {};
        var branchId = meta.branch_id, tenantId = meta.tenant_id;

        var qi = sb.from('iv_insumos').select('id,nombre,stock,control_manual,agotado_manual');
        if (branchId) qi = qi.eq('branch_id', branchId); else if (tenantId) qi = qi.eq('tenant_id', tenantId);
        // Ahora traemos variant_option_id + cantidades para diferenciar por sabor/variante.
        var qr = sb.from('iv_recetas').select('product_id,insumo_id,variant_option_id,cantidades');
        if (branchId) qr = qr.eq('branch_id', branchId); else if (tenantId) qr = qr.eq('tenant_id', tenantId);

        var resI = await qi;
        var resR = await qr;
        (resI.data || []).forEach(function (i) { S._ins[i.id] = { nombre: i.nombre, stock: num(i.stock), manual: !!i.control_manual, agotadoManual: !!i.agotado_manual }; });
        (resR.data || []).forEach(function (r) {
          if (!S._lines[r.product_id]) S._lines[r.product_id] = [];
          S._lines[r.product_id].push({ ins: r.insumo_id, varOpt: r.variant_option_id || '', qty: r.cantidades || null });
        });
      } catch (e) { console.warn('[posStock] load:', e && e.message); }
      S.ready = true;
    },

    // ── Producto ENTERO (solo lineas base) ──
    // Un producto solo se marca agotado si un insumo BASE (compartido por todas
    // las combinaciones) esta en 0. Si solo falta el insumo de UN sabor, el
    // producto NO se marca agotado — ese sabor se bloquea al elegirlo (agotadoVariante).
    faltantes: function (pid) { return faltForCombo(pid, null, null); },
    agotado: function (pid) { return faltForCombo(pid, null, null).length > 0; },

    // ── Combinacion concreta (sabor/variante + presentacion) ──
    faltantesVariante: function (pid, varOptId, presId) { return faltForCombo(pid, varOptId, presId); },
    agotadoVariante: function (pid, varOptId, presId) { return faltForCombo(pid, varOptId, presId).length > 0; },

    // ¿Hay ALGUNA opcion (sabor/variante) agotada, aunque el producto entero tenga stock?
    // Sirve para un indicador suave en la tarjeta ("algunas opciones agotadas").
    algunasAgotadas: function (pid) {
      var lines = S._lines[pid] || [];
      return lines.some(function (l) { return l.varOpt && insAgotado(l.ins); });
    },

    // Clase extra para la tarjeta del producto.
    cardClass: function (pid) {
      if (!this.agotado(pid)) return '';
      return S.allow ? 'ps-out ps-warn' : 'ps-out ps-blocked';
    },
    // Insignia "Agotado" (va dentro del recuadro de la foto, position:relative).
    badge: function (pid) {
      return this.agotado(pid) ? '<span class="ps-badge">Agotado</span>' : '';
    },

    // Modal de advertencia (modo permitir). Devuelve Promise<bool>.
    warn: function (prodName, faltantes) {
      return new Promise(function (resolve) {
        var ov = document.createElement('div');
        ov.className = 'ps-overlay';
        var chips = (faltantes || []).map(function (n) { return '<span class="ps-chip">' + esc(n) + ' · agotado</span>'; }).join('');
        ov.innerHTML =
          '<div class="ps-modal">' +
            '<div class="ps-modal-top">' +
              '<div class="ps-modal-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>' +
              '<div><div class="ps-modal-h">Atención — falta inventario</div><div class="ps-modal-p"><b>' + esc(prodName) + '</b> lleva insumos agotados. ¿Deseas venderlo de todos modos?</div></div>' +
            '</div>' +
            '<div class="ps-missing">' + chips + '</div>' +
            '<div class="ps-modal-foot"><button class="ps-btn" data-ps="cancel">Cancelar</button><button class="ps-btn ps-primary" data-ps="ok">Vender de todos modos</button></div>' +
          '</div>';
        document.body.appendChild(ov);
        function done(v) { try { ov.remove(); } catch (e) {} resolve(v); }
        ov.addEventListener('click', function (e) {
          if (e.target === ov) return done(false);
          var b = e.target.closest('[data-ps]');
          if (b) done(b.dataset.ps === 'ok');
        });
      });
    },

    // Toast simple para el modo bloqueado.
    toast: function (msg) {
      var t = document.createElement('div');
      t.className = 'ps-toast';
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('on'); });
      setTimeout(function () { t.classList.remove('on'); setTimeout(function () { try { t.remove(); } catch (e) {} }, 250); }, 1800);
    }
  };

  // ── CSS (inyectado) ──────────────────────────────────────────
  var css =
    '.lm-prod.ps-out{border-color:#FECACA !important;background:#FFF7F7 !important;}' +
    '.lm-prod.ps-blocked{cursor:not-allowed !important;}' +
    '.lm-prod.ps-blocked:hover{transform:none !important;box-shadow:none !important;border-color:#FECACA !important;}' +
    '.lm-prod.ps-blocked img{filter:grayscale(.45);opacity:.65;}' +
    '.lm-prod.ps-blocked .tp-prod-price,.lm-prod.ps-blocked .d-prod-price{color:#94A3B8 !important;}' +
    '.lm-prod.ps-blocked .tp-qty-badge,.lm-prod.ps-blocked .tp-addbtn,.lm-prod.ps-blocked .d-add{background:#E2E8F0 !important;color:#94A3B8 !important;}' +
    '.lm-prod.ps-warn .tp-qty-badge,.lm-prod.ps-warn .tp-addbtn,.lm-prod.ps-warn .d-add{background:#F59E0B !important;}' +
    '.ps-badge{position:absolute;top:6px;left:6px;z-index:3;font-size:9.5px;font-weight:800;letter-spacing:.02em;color:#fff;background:#DC2626;padding:2px 8px;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.2);}' +
    '.ps-overlay{position:fixed;inset:0;background:rgba(15,23,42,.32);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px;z-index:9999;animation:psFade .16s ease;}' +
    '@keyframes psFade{from{opacity:0}to{opacity:1}}' +
    '.ps-modal{width:420px;max-width:96vw;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(15,23,42,.4);font-family:"DM Sans",system-ui,sans-serif;animation:psPop .2s cubic-bezier(.2,.8,.2,1);}' +
    '@keyframes psPop{from{transform:scale(.96) translateY(8px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}' +
    '.ps-modal-top{padding:22px 22px 8px;display:flex;gap:14px;align-items:flex-start;}' +
    '.ps-modal-ic{flex-shrink:0;width:44px;height:44px;border-radius:12px;background:#FFFBEB;color:#F59E0B;display:flex;align-items:center;justify-content:center;}' +
    '.ps-modal-h{font-size:16px;font-weight:800;color:#0F172A;}' +
    '.ps-modal-p{font-size:13px;color:#475569;line-height:1.5;margin-top:4px;}.ps-modal-p b{color:#DC2626;}' +
    '.ps-missing{margin:12px 22px 0;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:10px 12px;display:flex;flex-wrap:wrap;gap:7px;}' +
    '.ps-chip{font-size:12px;font-weight:700;color:#DC2626;background:#fff;border:1px solid #FECACA;border-radius:999px;padding:4px 10px;}' +
    '.ps-modal-foot{display:flex;gap:10px;padding:18px 22px 22px;}' +
    '.ps-btn{flex:1;padding:11px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #ECEEF2;background:#fff;color:#475569;}' +
    '.ps-btn.ps-primary{border:none;background:#F59E0B;color:#fff;}' +
    '.ps-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(12px);background:#0F172A;color:#fff;font-size:13px;font-weight:600;padding:12px 18px;border-radius:12px;z-index:10000;opacity:0;transition:opacity .2s,transform .2s;font-family:"DM Sans",system-ui,sans-serif;pointer-events:none;}' +
    '.ps-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}';
  try { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); } catch (e) {}
})();
