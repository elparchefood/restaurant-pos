// ══════════════════════════════════════════════════════════════════
// CATÁLOGO DE CANJE POR PUNTOS  ·  Configuración → Puntos
//
// Regla de Sergio, textual: "ante el sistema nada fue gratis, simplemente se
// usaron puntos para hacer el pago". Los puntos son un MÉTODO DE PAGO más y
// SOLO sirven para los productos que estén en este catálogo. Si alguien
// intenta pagar con puntos algo que no está aquí, la pantalla de cobro lo
// rechaza y lo dice.
//
// El catálogo se arma con productos que YA EXISTEN, con sus presentaciones y
// variantes: se puede poner precio en puntos a todas las presentaciones o solo
// a algunas, y permitir todas las variantes o solo unas.
// Una fila por presentación, porque una Personal y una Familiar no valen lo
// mismo — y puede que la Familiar ni se ofrezca.
// ══════════════════════════════════════════════════════════════════
var _ptCat = [];        // filas de pos_puntos_catalogo
var _ptProds = [];      // productos del catálogo (con presentaciones y variantes)
var _ptCats = {};       // id categoría -> nombre

function ptSb() { return (window._pos && window._pos.sb) || (typeof sb !== 'undefined' ? sb : null); }
function ptCtx() { return (window._pos && window._pos.state) || {}; }
function ptEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function ptInit() {
  var s = ptSb(), st = ptCtx();
  if (!s) return;
  try {
    var rp = await s.from('pos_products')
      .select('id,name,category_id,presentations,variables,available')
      .eq('tenant_id', st.tenantId).order('name');
    _ptProds = (rp.data || []).filter(function (p) { return p.available !== false; });
    var rc = await s.from('pos_categories').select('id,name').eq('tenant_id', st.tenantId);
    (rc.data || []).forEach(function (c) { _ptCats[c.id] = c.name; });
  } catch (e) { console.error('[puntos] catálogo de productos:', e); }
  await ptCargar();
}

async function ptCargar() {
  var host = document.getElementById('pt-lista');
  if (host) host.innerHTML = '<div class="cf-empty">Cargando…</div>';
  var s = ptSb(), st = ptCtx();
  try {
    var r = await s.from('pos_puntos_catalogo').select('*')
      .eq('tenant_id', st.tenantId).order('created_at', { ascending: true });
    if (r.error) throw r.error;
    _ptCat = r.data || [];
  } catch (e) {
    if (host) host.innerHTML = '<div class="cf-empty">No se pudo cargar: ' + ptEsc(e.message || e) + '</div>';
    return;
  }
  ptRender();
  ptKpis();
}

/* Las tres cifras de arriba. La de "puntos en circulacion" es la que importa:
   es plata comprometida en premios que todavia no se han canjeado. */
async function ptKpis() {
  var host = document.getElementById('pt-kpis');
  if (!host) return;
  var canjeables = _ptCat.filter(function (f) { return f.activo; }).length;
  var clientes = 0, circulacion = 0;
  try {
    var st = ptCtx();
    var r = await ptSb().from('pos_puntos').select('puntos').eq('tenant_id', st.tenantId);
    (r.data || []).forEach(function (x) {
      var n = Number(x.puntos) || 0;
      if (n > 0) { clientes++; circulacion += n; }
    });
  } catch (e) { /* si no se pueden leer, se muestran las que si */ }
  var mil = function (n) { return Number(n || 0).toLocaleString('es-CO'); };
  host.innerHTML =
      '<div class="pt-kpi"><b>' + canjeables + '</b><span>producto' + (canjeables === 1 ? '' : 's') + ' canjeable' + (canjeables === 1 ? '' : 's') + '</span></div>'
    + '<div class="pt-kpi"><b>' + mil(clientes) + '</b><span>cliente' + (clientes === 1 ? '' : 's') + ' con puntos</span></div>'
    + '<div class="pt-kpi is-pts"><b>' + mil(circulacion) + '</b><span>puntos en circulación</span></div>';
}

function ptProd(id) {
  for (var i = 0; i < _ptProds.length; i++) if (_ptProds[i].id === id) return _ptProds[i];
  return null;
}

// Texto de qué variantes se pueden pedir en ese canje.
function ptVariantesTxt(fila, prod) {
  if (!fila.variantes || !prod) return 'todas las variantes';
  var grupos = prod.variables || [];
  var partes = [];
  grupos.forEach(function (g) {
    var permitidas = fila.variantes[g.id];
    if (!permitidas || !permitidas.length) return;
    var nombres = (g.options || [])
      .filter(function (o) { return permitidas.indexOf(o.id) >= 0; })
      .map(function (o) { return o.name; });
    if (nombres.length && nombres.length < (g.options || []).length) {
      partes.push(g.name + ': ' + nombres.join(', '));
    }
  });
  return partes.length ? partes.join(' · ') : 'todas las variantes';
}

function ptRender() {
  var host = document.getElementById('pt-lista');
  if (!host) return;
  if (!_ptCat.length) {
    host.innerHTML = '<div class="cf-empty">Todavía no hay productos para canjear con puntos.<br>'
      + 'Toca <b>Agregar producto</b> y elige cuáles se pueden pagar con puntos.</div>';
    return;
  }
  // Agrupado por producto: el mismo plato puede tener varias presentaciones.
  var porProd = {};
  _ptCat.forEach(function (f) {
    if (!porProd[f.product_id]) porProd[f.product_id] = [];
    porProd[f.product_id].push(f);
  });

  host.innerHTML = Object.keys(porProd).map(function (pid) {
    var prod = ptProd(pid);
    var nombre = prod ? prod.name : '(producto eliminado)';
    var cat = prod ? (_ptCats[prod.category_id] || '') : '';
    var filas = porProd[pid].map(function (f) {
      return '<div class="pt-row' + (f.activo ? '' : ' is-off') + '">'
        + '<div class="pt-row-l">'
        +   '<div class="pt-pres">' + ptEsc(f.pres_nombre || 'Único') + '</div>'
        +   '<div class="pt-vars">' + ptEsc(ptVariantesTxt(f, prod)) + '</div>'
        + '</div>'
        + '<span class="pt-pts">' + Number(f.puntos).toLocaleString('es-CO') + ' pts</span>'
        + '<button class="cf-mini-btn" onclick="ptToggle(' + "'" + f.id + "'" + ')">'
        +   (f.activo ? 'Desactivar' : 'Activar') + '</button>'
        + '<button class="cf-mini-btn is-danger" onclick="ptBorrar(' + "'" + f.id + "'" + ')">Quitar</button>'
        + '</div>';
    }).join('');
    return '<div class="pt-card">'
      + '<div class="pt-card-hd">'
      +   '<div><div class="pt-prod">' + ptEsc(nombre) + '</div>'
      +   (cat ? '<div class="pt-cat">' + ptEsc(cat) + '</div>' : '') + '</div>'
      +   '<button class="cf-mini-btn" onclick="ptEditar(' + "'" + pid + "'" + ')">Editar</button>'
      + '</div>' + filas + '</div>';
  }).join('');
}

async function ptToggle(id) {
  var f = _ptCat.filter(function (x) { return x.id === id; })[0];
  if (!f) return;
  try {
    await ptSb().from('pos_puntos_catalogo')
      .update({ activo: !f.activo, updated_at: new Date().toISOString() }).eq('id', id);
  } catch (e) { alert('No se pudo cambiar: ' + (e.message || e)); }
  ptCargar();
}

async function ptBorrar(id) {
  if (!confirm('¿Quitar esta presentación del catálogo de puntos?')) return;
  try { await ptSb().from('pos_puntos_catalogo').delete().eq('id', id); }
  catch (e) { alert('No se pudo quitar: ' + (e.message || e)); }
  ptCargar();
}

// ── Modal: elegir producto y armar su canje ──────────────────────────
function ptNuevo() { ptModal(null); }
function ptEditar(productId) { ptModal(productId); }

function ptModal(productId) {
  var bd = document.createElement('div');
  bd.className = 'pt-bd';
  bd.innerHTML =
    '<div class="pt-modal">'
  +   '<div class="pt-modal-hd">'
  +     '<div class="pt-modal-t">Producto canjeable con puntos</div>'
  +     '<button class="pt-x" onclick="this.closest(' + "'.pt-bd'" + ').remove()">✕</button>'
  +   '</div>'
  +   '<div class="pt-modal-bd">'
  +     '<input class="cf-search" style="width:100%;box-sizing:border-box" id="pt-buscar" placeholder="Buscar producto…" autocomplete="off">'
  +     '<div id="pt-sug" class="pt-sug"></div>'
  +     '<div id="pt-detalle"></div>'
  +   '</div>'
  +   '<div class="pt-modal-ft">'
  +     '<button class="cf-mini-btn" onclick="this.closest(' + "'.pt-bd'" + ').remove()">Cancelar</button>'
  +     '<button class="lm-btn-primary" id="pt-guardar" onclick="ptGuardar()" disabled>Guardar</button>'
  +   '</div>'
  + '</div>';
  document.body.appendChild(bd);
  bd.addEventListener('click', function (e) { if (e.target === bd) bd.remove(); });

  var inp = document.getElementById('pt-buscar');
  inp.addEventListener('input', function () { ptSugerir(inp.value); });
  if (productId) { ptElegir(productId); }
  else { inp.focus(); ptSugerir(''); }
}

function ptSugerir(txt) {
  var host = document.getElementById('pt-sug');
  if (!host) return;
  var t = String(txt || '').toLowerCase().trim();
  var lista = _ptProds.filter(function (p) {
    return !t || String(p.name || '').toLowerCase().indexOf(t) >= 0
      || String(_ptCats[p.category_id] || '').toLowerCase().indexOf(t) >= 0;
  }).slice(0, 12);
  host.innerHTML = lista.map(function (p) {
    return '<button class="pt-sug-item" onclick="ptElegir(' + "'" + p.id + "'" + ')">'
      + '<span>' + ptEsc(p.name) + '</span>'
      + '<span class="pt-sug-cat">' + ptEsc(_ptCats[p.category_id] || '') + '</span></button>';
  }).join('') || '<div class="cf-empty">Sin resultados</div>';
}

// Pinta las presentaciones y variantes del producto elegido, con lo que ya
// estuviera guardado (para poder editar sin volver a cargarlo todo).
function ptElegir(productId) {
  var prod = ptProd(productId);
  if (!prod) return;
  document.getElementById('pt-sug').innerHTML = '';
  var inp = document.getElementById('pt-buscar');
  if (inp) inp.value = prod.name;

  var yaGuardadas = _ptCat.filter(function (f) { return f.product_id === productId; });
  var byPres = {};
  yaGuardadas.forEach(function (f) { byPres[f.pres_id || ''] = f; });

  var press = (prod.presentations && prod.presentations.length)
    ? prod.presentations
    : [{ id: '', name: 'Único' }];

  var htmlPres = press.map(function (pr) {
    var g = byPres[pr.id || ''];
    var on = !!g;
    return '<label class="pt-pres-row">'
      + '<input type="checkbox" class="pt-chk-pres" data-pres="' + ptEsc(pr.id || '') + '"'
      +   ' data-nombre="' + ptEsc(pr.name || 'Único') + '"' + (on ? ' checked' : '') + '>'
      + '<span class="pt-pres-n">' + ptEsc(pr.name || 'Único') + '</span>'
      + '<span class="pt-pres-p">'
      +   '<input type="number" min="1" step="1" class="pt-inp-pts" placeholder="puntos"'
      +     ' data-pres="' + ptEsc(pr.id || '') + '" value="' + (g ? g.puntos : '') + '">'
      +   '<span class="pt-pts-lbl">puntos</span>'
      + '</span></label>';
  }).join('');

  // Variantes: por defecto TODAS permitidas. Si se desmarca alguna, se guarda
  // la lista de las permitidas para ese grupo.
  var grupos = prod.variables || [];
  var htmlVars = '';
  if (grupos.length) {
    var guardadas = yaGuardadas[0] && yaGuardadas[0].variantes;
    htmlVars = '<div class="pt-sub">Variantes que se pueden pedir</div>'
      + grupos.map(function (g) {
          var permitidas = guardadas && guardadas[g.id];
          return '<div class="pt-vgroup"><div class="pt-vgroup-n">' + ptEsc(g.name) + '</div>'
            + (g.options || []).map(function (o) {
                var on = !permitidas || permitidas.indexOf(o.id) >= 0;
                return '<label class="pt-vopt"><input type="checkbox" class="pt-chk-var"'
                  + ' data-grupo="' + ptEsc(g.id) + '" data-opt="' + ptEsc(o.id) + '"'
                  + (on ? ' checked' : '') + '><span>' + ptEsc(o.name) + '</span></label>';
              }).join('')
            + '</div>';
        }).join('');
  }

  document.getElementById('pt-detalle').innerHTML =
      '<input type="hidden" id="pt-pid" value="' + ptEsc(productId) + '">'
    + '<div class="pt-sub">Presentaciones y su precio en puntos</div>'
    + '<div class="pt-nota">Marca solo las que quieras ofrecer. Lo que dejes sin marcar '
    + 'no se podrá pagar con puntos.</div>'
    + htmlPres + htmlVars;
  var bg = document.getElementById('pt-guardar');
  if (bg) bg.disabled = false;
}

async function ptGuardar() {
  var pid = (document.getElementById('pt-pid') || {}).value;
  if (!pid) return;
  var st = ptCtx(), s = ptSb();
  var btn = document.getElementById('pt-guardar');
  btn.disabled = true; btn.textContent = 'Guardando…';

  // Variantes permitidas por grupo. Si están TODAS marcadas se guarda null:
  // así, si mañana se agrega una variante nueva al producto, entra sola.
  var variantes = null;
  var prod = ptProd(pid);
  (prod.variables || []).forEach(function (g) {
    var chks = document.querySelectorAll('.pt-chk-var[data-grupo="' + g.id + '"]');
    var marcadas = [];
    chks.forEach(function (ch) { if (ch.checked) marcadas.push(ch.dataset.opt); });
    if (marcadas.length && marcadas.length < chks.length) {
      if (!variantes) variantes = {};
      variantes[g.id] = marcadas;
    }
  });

  var filas = [], errores = [];
  document.querySelectorAll('.pt-chk-pres').forEach(function (ch) {
    if (!ch.checked) return;
    var presId = ch.dataset.pres || '';
    var inp = document.querySelector('.pt-inp-pts[data-pres="' + presId + '"]');
    var pts = parseInt((inp && inp.value) || '0', 10);
    if (!pts || pts <= 0) { errores.push(ch.dataset.nombre); return; }
    filas.push({
      tenant_id: st.tenantId, branch_id: st.branchId || null,
      product_id: pid, pres_id: presId || null, pres_nombre: ch.dataset.nombre,
      puntos: pts, variantes: variantes, activo: true,
      updated_at: new Date().toISOString(),
    });
  });

  if (errores.length) {
    btn.disabled = false; btn.textContent = 'Guardar';
    alert('Falta el precio en puntos de: ' + errores.join(', '));
    return;
  }

  try {
    // Se borra lo que había de ese producto y se vuelve a escribir: así,
    // desmarcar una presentación de verdad la saca del catálogo.
    await s.from('pos_puntos_catalogo').delete().eq('tenant_id', st.tenantId).eq('product_id', pid);
    if (filas.length) {
      var r = await s.from('pos_puntos_catalogo').insert(filas);
      if (r.error) throw r.error;
    }
    var bd = document.querySelector('.pt-bd'); if (bd) bd.remove();
    ptCargar();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Guardar';
    alert('No se pudo guardar: ' + (e.message || e));
  }
}
