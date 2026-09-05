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
  var S = { ready: false, allow: false, _lines: {}, _ins: {}, _modLines: {} };
  function num(v) { return Number(v) || 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── Helpers de recetas por VARIANTE ──────────────────────────
  // Cada linea: { ins:insumo_id, varOpt:variant_option_id|'' , qty:cantidades|null }
  //   varOpt vacio  → linea BASE: aplica a TODAS las combinaciones del producto.
  //   varOpt lleno  → aplica solo a esa opcion (sabor/variante).
  // Un insumo está agotado:
  //  · control manual ON  → SOLO si lo marcaron a mano (agotado_manual), sin importar el stock.
  //  · sub-inventario ON  → disponible si hay EN SERVICIO; si en servicio=0 pero hay
  //       en bodega y "vender de bodega" está ON, sigue disponible (con aviso); si no, agotado.
  //  · normal            → si su stock llegó a 0.
  /*  ⚠️ CERO NO ES `> 0`. Sergio, 27-ago-2026: la Coca Cola 1.5 estaba
      agotada y la pantalla de ventas la dejaba pedir. Le ofrecio una a un
      cliente y tuvo que ir a cambiarsela.

      En la nevera quedaban `0.00000000000000000001` paquetes. Eso es una
      billonesima de botella — cero para cualquiera menos para un `> 0`, que
      contestaba "si hay". Sale de dividir: una botella de un paquete de doce
      es 1/12, que en decimal no termina; al restar doce veces queda polvo.

      El polvo ya se limpia en la base al escribir, pero el margen se queda
      aqui tambien: esta funcion es la que decide si se puede vender algo, y
      esa decision no puede depender de que la limpieza de otro lado corriera.
      Una millonesima de unidad de compra es, en el peor caso, una
      millonesima de galon.                                                */
  var NADA = 0.000001;

  function insAgotado(insId) {
    var i = S._ins[insId];
    if (!i) return false;

    /*  HAY INSUMOS QUE NO AGOTAN EL PRODUCTO (Sergio, 27-ago-2026).

        «cuando se acaba la salsa barbecue marca el producto como agotado, y no
        quiero que sea asi: se puede preparar igual con otras salsas. Mientras
        que si falta otro ingrediente importante, si no se puede».

        Es una distincion de cocina y solo la sabe el restaurante — el mismo
        insumo puede ser imprescindible en un sitio y un acompanamiento en
        otro. Aqui solo se obedece.

        Ojo: esto NO lo saca del inventario. Se sigue descontando, se sigue
        viendo en rojo y sigue saliendo en el aviso de compras. Lo unico que
        deja de hacer es bloquear la venta. Confundir las dos cosas dejaria al
        restaurante sin saber que hay que comprar salsa.                    */
    if (i.agota === false) return false;

    if (i.manual) return !!i.agotadoManual;
    if (i.sub) {
      if (i.servicio > NADA) return false;              // hay en servicio (nevera) → OK
      if (i.stock > NADA && i.venderBodega) return false; // se acabó en servicio pero se puede vender de bodega
      return true;                                    // sin servicio y sin bodega (o no se vende de bodega)
    }
    return i.stock <= NADA;
  }
  // Aviso a mostrar si el insumo se está vendiendo DESDE BODEGA (servicio=0, bodega>0, vender_bodega ON).
  function avisoBodegaIns(insId) {
    var i = S._ins[insId];
    if (i && i.sub && i.servicio <= NADA && i.stock > NADA && i.venderBodega) {
      return i.avisoBodega || (i.nombre + ': se acabó en servicio, queda en bodega.');
    }
    return null;
  }

  /* CUANTO LLEVA UNA LINEA EN UNA PRESENTACION.
     El formato guardado es {presentacion: {q: 2}} —un objeto con la cantidad
     adentro—, no el numero suelto. Leerlo como numero daba NaN, que aqui se
     entendia como "esta presentacion no lleva este insumo", y la linea se
     descartaba EN SILENCIO: con una presentacion elegida no se detectaba
     NUNCA un agotado. El HIT Litro de Mango se dejaba vender sin un solo
     aviso. Nada fallaba a la vista; simplemente no avisaba.
     Devuelve null cuando esta presentacion no aparece en la receta. */
  function cantDe(mapa, presId) {
    if (!mapa || typeof mapa !== 'object' || !Object.keys(mapa).length) return null;
    var v = (mapa[presId] != null) ? mapa[presId] : (mapa['_'] != null ? mapa['_'] : null);
    if (v == null) return null;
    return num(v && typeof v === 'object' ? v.q : v);   // recetas viejas: numero suelto
  }

  // Nombres de insumos agotados que aplican a una combinacion (opcion + presentacion).
  // Si varOptId es undefined/null → SOLO lineas base (el producto "entero").
  function faltForCombo(pid, varOptId, presId) {
    var lines = S._lines[pid] || [], out = [], seen = {};
    var soloBase = (varOptId === undefined || varOptId === null || varOptId === '');
    lines.forEach(function (l) {
      if (l.varOpt) { if (soloBase || l.varOpt !== varOptId) return; }   // linea de variante: solo si coincide la opcion
      /* Con una presentacion elegida, la linea solo cuenta si esa presentacion
         la lleva. Si la receta va por presentacion y esta no esta listada, no
         lleva ese insumo: contarla marcaria agotado un producto que si hay. */
      if (presId !== undefined && presId !== null && l.qty) {
        var q = cantDe(l.qty, presId);
        if (!(num(q) > 0)) return;
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
      S.ready = false; S._lines = {}; S._ins = {}; S._modLines = {};
      try {
        var cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
        S.allow = !!cfg.ventaSinInventario;
      } catch (e) { S.allow = false; }
      try {
//  getSession lee del equipo; getUser salia a internet por el mismo dato.
        var _su = (window._pos && window._pos.state && window._pos.state.user) || null;
        if (!_su) { try { _su = (await sb.auth.getSession()).data.session.user; } catch (e) {} }
        var meta = (_su && _su.user_metadata) || {};
        var tenantId = meta.tenant_id;

        /* LA SEDE EN LA QUE SE ESTA VENDIENDO, no la del login. Este modulo
           decide que se puede vender: con la sede equivocada bloquearia
           productos que aqui si hay, o dejaria vender lo que no. */
        var branchId = meta.branch_id;
        try {
          var elegida = localStorage.getItem('pos.contexto.sucursal');
          if (elegida) branchId = elegida;
        } catch (e) {}

        /* Los insumos y las recetas son de la MARCA. Filtrar por sede dejaba a
           una sucursal nueva SIN recetas — y sin recetas nada se marca agotado
           nunca: se venderia todo, en silencio.

           Estas dos preguntas ya NO se hacen siempre: normalmente vienen con
           lo guardado (`posDatos.negocio`). Solo se preguntan si lo guardado
           no esta, que es la primera vez que se abre el programa. */
        var brandId = null, modo = 'global', yaSeLaMarca = false;
        async function averiguarMarca() {
          try {
            //  La sucursal ya la trajo pos-core; aqui solo se le pide el dato.
            var br = window.posSucursal ? await window.posSucursal(branchId)
                   : ((await sb.from('branches').select('brand_id').eq('id', branchId).maybeSingle()).data);
            brandId = (br && br.brand_id) || null;
            if (brandId) {
              var ma = await sb.from('brands').select('inventario_modo').eq('id', brandId).maybeSingle();
              modo = (ma.data && ma.data.inventario_modo) || 'global';
            }
            yaSeLaMarca = true;
          } catch (e) {}
        }

        /* ══════════════════════════════════════════════════════════════
           QUE SE GUARDA Y QUE NO — la regla de todo este modulo
           ──────────────────────────────────────────────────────────────
           Sergio, 24-ago-2026: *"la carne siempre sera carne... lo que
           cambia es la CANTIDAD del insumo, no el insumo en si"*.

           Asi que se parte en dos:
             · IDENTIDAD (nombre, si es de control manual, si va por
               sub-inventario, si se vende de bodega) y RECETAS  -> de
               `posDatos`, traidas UNA vez al abrir el programa.
             · EXISTENCIAS (stock, stock en servicio, agotado a mano) -> EN
               VIVO, siempre. Es lo unico que se pregunta aqui.

           Esto NO es un detalle de velocidad: de las existencias sale el
           aviso de "agotado". Si se guardaran, un cajero seguiria vendiendo
           algo que se acabo hace media hora — y eso pasa todos los dias.

           Antes esta pantalla pedia cinco cosas seguidas cada vez que se
           abria: la marca, el modo de inventario, 44 insumos y 374 recetas,
           ademas de las existencias. Ninguna de las cuatro primeras cambia
           durante un turno.

           SI `posDatos` NO ESTA LISTO se hace lo de siempre, entero. Nunca
           se deja la pantalla sin saber que hay agotado: eso seria vender
           lo que no hay. */
        var insumos = null, recetas = null;
        if (window.posDatos) {
          try {
            var d = await posDatos.cargar();
            /* `negocio` es OBLIGATORIO para usar lo guardado, no un extra. Sin
               el no se sabe la marca, y sin marca el filtro caeria al de sede
               — que para los insumos de una marca con inventario comun
               descarta TODO. El resultado no seria un error a la vista: seria
               una pantalla que no marca nada agotado y deja vender lo que no
               hay. Un blob guardado antes de que existiera `negocio` (hasta 8
               horas) cae por aqui y se pregunta a la base, como siempre. */
            if (d && d.negocio && d.insumos && d.insumos.length && d.recetas) {
              insumos = d.insumos;
              recetas = d.recetas;
              brandId = d.negocio.brandId;
              modo = d.negocio.inventarioModo || 'global';
              yaSeLaMarca = true;
            }
          } catch (e) { console.warn('[posStock] datos guardados:', e && e.message); }
        }

        /* Sin lo guardado: el camino de siempre. Los tres filtros en el mismo
           orden de antes — marca, sede, restaurante. */
        if (!insumos) {
          if (!yaSeLaMarca) await averiguarMarca();
          var qi = sb.from('iv_insumos').select('id,nombre,control_manual,sub_inventario,vender_bodega,aviso_bodega,agota_producto,brand_id,branch_id,tenant_id');
          if (brandId) qi = qi.eq('brand_id', brandId);
          else if (branchId) qi = qi.eq('branch_id', branchId);
          else if (tenantId) qi = qi.eq('tenant_id', tenantId);
          var qr = sb.from('iv_recetas').select('product_id,insumo_id,variant_option_id,cantidades,mod_option_id');
          if (brandId) qr = qr.eq('brand_id', brandId);
          else if (branchId) qr = qr.eq('branch_id', branchId);
          else if (tenantId) qr = qr.eq('tenant_id', tenantId);
          /* Los dos A LA VEZ. Estaban en fila india (`await qi; await qr;`), o
             sea dos viajes a Bogota uno detras del otro por dos preguntas que
             no dependen entre si. */
          var par = await Promise.all([qi, qr]);
          insumos = (par[0] && par[0].data) || [];
          recetas = (par[1] && par[1].data) || [];
        } else {
          /* Lo guardado viene del restaurante entero; aqui se aplica el MISMO
             filtro que haria la base, para que el resultado sea identico. */
          if (brandId) {
            insumos = insumos.filter(function (x) { return x.brand_id === brandId; });
            recetas = recetas.filter(function (x) { return x.brand_id === brandId; });
          } else if (branchId) {
            insumos = insumos.filter(function (x) { return x.branch_id === branchId; });
            recetas = recetas.filter(function (x) { return x.branch_id === branchId; });
          }
        }

        /* ── LO UNICO QUE SE PREGUNTA EN VIVO ── */
        var sedeEx = (modo === 'sucursal') ? branchId : null;
        var ex = {};
        try {
          var qe = sb.from('iv_existencias').select('insumo_id,branch_id,stock,stock_servicio,agotado_manual');
          if (tenantId) qe = qe.eq('tenant_id', tenantId);
          var re = await qe;
          /* Se queda la fila de la bolsa que corresponde. En modo `global` esa
             fila tiene la sede VACIA, a proposito: es una sola bolsa para toda
             la marca. Copiarle la sede fue justo el error que dejo todo
             marcado "Agotado" en el restaurante de pruebas (24-ago). */
          (re.data || []).forEach(function (e) {
            if ((e.branch_id || null) === sedeEx) ex[e.insumo_id] = e;
          });
        } catch (e) { console.warn('[posStock] existencias:', e && e.message); }

        (insumos || []).forEach(function (i) {
          var e = ex[i.id] || {};
          S._ins[i.id] = { nombre: i.nombre, stock: num(e.stock), manual: !!i.control_manual,
                           agotadoManual: !!e.agotado_manual, sub: !!i.sub_inventario,
                           servicio: num(e.stock_servicio), venderBodega: !!i.vender_bodega,
                           /*  Sin el dato se asume QUE SI AGOTA. Un blob guardado
                               ayer no trae la columna nueva, y equivocarse hacia
                               "no bloquea" seria dejar vender lo que no hay. */
                           agota: i.agota_producto !== false,
                           avisoBodega: i.aviso_bodega || '' };
        });
        (recetas || []).forEach(function (r) {
          if (r.mod_option_id) {   // receta de una adición (opción de modificador)
            if (!S._modLines[r.mod_option_id]) S._modLines[r.mod_option_id] = [];
            S._modLines[r.mod_option_id].push({ ins: r.insumo_id, qty: r.cantidades || null });
            return;
          }
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
    /* PARA MARCAR LA OPCION EN EL SELECTOR DE SABORES (21-ago, pedido de
       Sergio): "aqui tambien deberia aparecerme una marca que me diga que
       esta agotado". Avisar al final, al agregar, llega tarde: ya eligio.
       Ninguna de las dos tira error jamas: si el modulo no alcanzo a cargar,
       devuelven vacio y la pantalla se pinta igual. Esto no puede frenar una
       venta ni dejar un modal a medio dibujar. */
    optChip: function (pid, varOptId, presId) {
      try {
        if (!S.ready) return '';
        return faltForCombo(pid, varOptId, presId).length
          ? '<span class="pm-agotado">Agotado</span>' : '';
      } catch (e) { return ''; }
    },
    optClase: function (pid, varOptId, presId) {
      try {
        return (S.ready && faltForCombo(pid, varOptId, presId).length) ? ' sin-stock' : '';
      } catch (e) { return ''; }
    },
    agotadoVariante: function (pid, varOptId, presId) { return faltForCombo(pid, varOptId, presId).length > 0; },

    // Avisos de "vendiendo de bodega" de los insumos que aplican a la combinacion
    // (sub-inventario: se acabo en servicio pero se vende de bodega, con su texto).
    avisos: function (pid, varOptId, presId) {
      var lines = S._lines[pid] || [], out = [], seen = {};
      var soloBase = (varOptId === undefined || varOptId === null || varOptId === '');
      lines.forEach(function (l) {
        if (l.varOpt) {  // linea de variante: solo si su opcion esta elegida
          if (soloBase) return;
          if (Array.isArray(varOptId) ? varOptId.indexOf(l.varOpt) < 0 : l.varOpt !== varOptId) return;
        }
        if (presId !== undefined && presId !== null && l.qty) {
          var q = (l.qty[presId] != null) ? l.qty[presId] : (l.qty['_'] != null ? l.qty['_'] : null);
          if (q != null && !(num(q) > 0)) return;
        }
        var a = avisoBodegaIns(l.ins);
        if (a && !seen[a]) { seen[a] = 1; out.push(a); }
      });
      return out;
    },

    // ¿Hay ALGUNA opcion (sabor/variante) agotada, aunque el producto entero tenga stock?
    // Sirve para un indicador suave en la tarjeta ("algunas opciones agotadas").
    algunasAgotadas: function (pid) {
      var lines = S._lines[pid] || [];
      return lines.some(function (l) { return l.varOpt && insAgotado(l.ins); });
    },

    // ── Adiciones (opciones de modificadores) ──
    // Una adición está agotada si algún insumo de su receta está agotado.
    // Si la opción no tiene receta configurada, NUNCA se bloquea (opcional por restaurante).
    modFaltantes: function (optId) {
      var lines = S._modLines[optId] || [], out = [], seen = {};
      lines.forEach(function (l) {
        if (insAgotado(l.ins)) {
          var nm = (S._ins[l.ins] || {}).nombre || 'insumo';
          if (!seen[nm]) { seen[nm] = 1; out.push(nm); }
        }
      });
      return out;
    },
    modAgotado: function (optId) {
      var lines = S._modLines[optId] || [];
      return lines.some(function (l) { return insAgotado(l.ins); });
    },
    modAvisos: function (optId) {
      var lines = S._modLines[optId] || [], out = [], seen = {};
      lines.forEach(function (l) {
        var a = avisoBodegaIns(l.ins);
        if (a && !seen[a]) { seen[a] = 1; out.push(a); }
      });
      return out;
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

  /*  ══ CUANDO LOS DATOS CAMBIAN EN OTRO EQUIPO ═══════════════════════════
      `pos-datos` avisa con `posDatosCambiaron` cuando alguien toco los
      insumos o las recetas desde otra pantalla u otro equipo. Sin esto,
      `pos-datos` se refrescaba y ESTE modulo seguia con su copia vieja del
      mapa — que es justo el sintoma de Sergio: apago el interruptor de las
      salsas en el computador y la tablet siguio bloqueando.

      Se vuelve a armar el mapa y se avisa a la pantalla para que repinte
      las tarjetas: si no repinta, el dato esta bien por dentro pero el
      mesero sigue viendo el letrero rojo.                                */
  try {
    window.addEventListener('posDatosCambiaron', function () {
      var sb = (window._pos && window._pos.sb) || window.sb;
      if (!sb || !S.ready) return;
      window.posStock.load(sb).then(function () {
        try { window.dispatchEvent(new CustomEvent('posStockCambio')); } catch (e) {}
      });
    });
  } catch (e) { /* sin window (pruebas) */ }
})();
