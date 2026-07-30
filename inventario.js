/* inventario.js — Módulo de inventario Comanda POS (datos reales de Supabase) */

// ═══════════════════════════════════════════════════
// SUPABASE (inicialización directa, sin pos-core.js)
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const iv_sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: 'cobra-pos-session' }
});

// ═══════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════
let tenantId  = null;
let branchId  = null;
let params    = { fc: 30, op: 32, inf: 10, merma: true };
// Plantillas de costeo (porcentajes). Cada categoría: {nombre, pct, tipo:'materia'|'costo'|'ganancia'}.
// La plantilla ACTIVA define la meta de materia prima y el desglose que se muestra en costeo.
let plantillas = [];
let plantillaActivaId = null;
let _plEdit = null;   // borrador del editor de plantilla
let customUnits = [];

let insumos   = [];
let productos = [];
let recetas   = [];

let repInsumoId = null;
let activeFilter = 'todos';
let togglePrepOn = true;
let toggleManualOn = false;   // "Control manual (el cocinero avisa)" del insumo en edición
let toggleSubOn = false;      // "Sub-inventario (Bodega/En servicio)"
let toggleVenderBodegaOn = false;
let compraQty = {};
let compraPrices = {};
let mermaOn = true;
let ventaSinInvOn = false; // política: ¿permitir vender productos con insumos agotados?

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function ivCOP(n) {
  if (isNaN(n) || n === null) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CO');
}
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function getStockState(ins) {
  // Insumos de control manual: su disponibilidad NO depende de la cantidad,
  // sino de la marca a mano. 'out' solo si el cocinero avisó que se acabó.
  if (ins.controlManual) return ins.agotadoManual ? 'out' : 'ok';
  const { stock, min } = ins;
  if (stock <= 0) return 'out';
  if (stock <= min * 0.4) return 'critical';
  if (stock <= min) return 'low';
  return 'ok';
}
function stateLabel(s) {
  return { out:'Agotado', critical:'Crítico', low:'Stock bajo', ok:'En stock' }[s] || s;
}
function stateColors(s) {
  const m = {
    ok:      { txt:'#166534', bg:'#DCFCE7', ring:'#BBF7D0', bar:'#22C55E' },
    low:     { txt:'#B45309', bg:'#FEF3C7', ring:'#FCD34D', bar:'#F59E0B' },
    critical:{ txt:'#991B1B', bg:'#FEE2E2', ring:'#FECACA', bar:'#EF4444' },
    out:     { txt:'#991B1B', bg:'#FEE2E2', ring:'#FECACA', bar:'#EF4444' },
  };
  return m[s] || m.ok;
}
function costoPorUr(ins) { return ins.precio / (ins.conversion || 1); }

// ── Presentaciones y variables ─────────────────────────────────────────
// Un producto sin tamanos se trata como si tuviera uno solo, con id '_'.
function presDe(prod) {
  return (prod.pres && prod.pres.length) ? prod.pres : [{ id: '_', name: '', price: prod.precio }];
}
function opcionesDe(prod) {
  return prod.variantes ? prod.variantes.opciones : [];
}
// Todos los grupos de variables del producto (0, 1 o más). Fallback al grupo de
// precio si por alguna razón no viene 'grupos'.
function gruposDe(prod) {
  if (prod.grupos && prod.grupos.length) return prod.grupos;
  return prod.variantes ? [{ id: '_g', name: prod.variantes.grupo, isPricing: true, opciones: prod.variantes.opciones }] : [];
}
// Producto cartesiano de las opciones de todos los grupos → lista de arrays de
// opciones (una por grupo). Ej: [[Carne,Chorizo],[Carne,Tocineta],[Pollo,Chorizo]...].
function combosOpcionesDe(prod) {
  const grupos = gruposDe(prod);
  if (!grupos.length) return [[]];
  let acc = [[]];
  for (const g of grupos) {
    const opts = (g.opciones && g.opciones.length) ? g.opciones : [null];
    const next = [];
    for (const combo of acc) for (const o of opts) next.push(o ? combo.concat([o]) : combo);
    acc = next;
  }
  return acc.length ? acc : [[]];
}
// Precio de venta de una combinacion concreta (tamano + opcion).
function precioDe(prod, presId, opt) {
  const lista = presDe(prod);
  const idx   = lista.findIndex(p => p.id === presId);
  const pricingOpts = opcionesDe(prod);   // opciones del grupo de precio
  // De todas las opciones elegidas, la del grupo de precio es la que define el valor.
  let varOptId = null;
  if (Array.isArray(opt)) varOptId = opt.find(id => pricingOpts.some(o => o.id === id)) || null;
  else varOptId = opt;
  if (varOptId) {
    const o = pricingOpts.find(x => x.id === varOptId);
    if (o) {
      if (o.prices && idx >= 0 && o.prices[idx] > 0) return o.prices[idx];
      if (o.price > 0) return o.price;
    }
  }
  if (idx >= 0 && lista[idx].price > 0) return lista[idx].price;
  return prod.precio;
}
// Cantidad que lleva una linea en un tamano dado.
function qtyLinea(l, presId) {
  if (l.qty && l.qty[presId] != null) return l.qty[presId];
  if (l.qty && l.qty['_'] != null) return l.qty['_'];
  return 0;
}
// Una linea aplica si es base (sin variable) o si su opcion esta entre las
// elegidas para la combinacion. Acepta un id (compat) o un array de ids (2+ grupos).
function lineaAplica(l, opt) {
  if (!l.varOpt) return true;
  if (Array.isArray(opt)) return opt.indexOf(l.varOpt) >= 0;
  return l.varOpt === opt;
}
// Costeo de UNA combinacion (tamano + opcion de variable).
// Sin argumentos usa el primer tamano y la primera opcion, que es el
// comportamiento que tenian las pantallas antes de este cambio.
function calcReceta(prod, presId, optIds) {
  const fcPct = params.fc / 100;
  const opPct = params.op / 100;
  const lista = presDe(prod);
  if (presId == null) presId = lista[0].id;
  if (optIds === undefined) {
    // Por defecto: la primera opción de cada grupo (una combinación válida).
    optIds = gruposDe(prod).map(g => g.opciones[0] && g.opciones[0].id).filter(Boolean);
  } else if (!Array.isArray(optIds)) {
    optIds = optIds ? [optIds] : [];
  }
  let raw = 0;
  for (const l of prod.receta) {
    if (!lineaAplica(l, optIds)) continue;
    const ins = insumos.find(i => i.id === l.insId);
    if (!ins) continue;
    raw += qtyLinea(l, presId) * costoPorUr(ins) * (params.merma ? (1 + l.merma / 100) : 1);
  }
  const precio  = precioDe(prod, presId, optIds);
  const fc      = precio > 0 ? raw / precio : 0;
  const margen  = precio - raw;
  const otros   = precio * opPct;
  const neta    = precio - raw - otros;
  const sugerido = fcPct > 0 ? raw / fcPct : 0;
  return { raw, fc, margen, otros, neta, sugerido, precio, presId, optIds, varOptId: optIds[0] || null };
}

// Todas las combinaciones reales del producto, ya costeadas.
// Cruza TODOS los grupos de variables (no solo uno).
function combosDe(prod) {
  const out = [];
  const combosOpt = combosOpcionesDe(prod);   // arrays de opciones (una por grupo)
  for (const pres of presDe(prod)) {
    for (const optArr of combosOpt) {
      const optIds = optArr.map(o => o.id);
      const r = calcReceta(prod, pres.id, optIds);
      out.push({
        presId: pres.id, presName: pres.name,
        optIds,
        varOptId: optIds[0] || null,                       // compat
        varName: optArr.map(o => o.name).join(' · '),      // "Carne · Chorizo"
        pausado: isPausado(prod, optIds),
        ...r,
      });
    }
  }
  return out;
}

// Resumen para la tarjeta: rango de materia prima y cual es el peor caso.
function resumenReceta(prod) {
  const combos = combosDe(prod).filter(c => c.precio > 0);
  if (!combos.length) return null;
  let peor = combos[0], mejor = combos[0];
  for (const c of combos) {
    if (c.fc > peor.fc)  peor  = c;
    if (c.fc < mejor.fc) mejor = c;
  }
  const etiqueta = [peor.varName, peor.presName].filter(Boolean).join(' ');
  return { combos, peor, mejor, rango: combos.length > 1, etiqueta };
}
function semaforo(fc) {
  if (fc <= 0.30) return { color:'#22C55E', label:'Saludable' };
  if (fc <= 0.38) return { color:'#EAB308', label:'Aceptable' };
  if (fc <= 0.45) return { color:'#F97316', label:'Cuidado' };
  return { color:'#EF4444', label:'No rentable' };
}
// Una combinacion se pausa solo si le falta un insumo QUE ELLA usa.
// Antes, si faltaba la salchicha se pausaba tambien la version de pollo.
function isPausado(prod, opt) {
  if (!prod.receta || prod.receta.length === 0) return false;
  if (opt === undefined) {
    // Pausa "global" del producto: solo si TODAS las combinaciones están pausadas.
    const combos = combosOpcionesDe(prod);
    return combos.every(arr => isPausado(prod, arr.map(o => o.id)));
  }
  return prod.receta.some(l => {
    if (!lineaAplica(l, opt)) return false;
    const ins = insumos.find(i => i.id === l.insId);
    return ins && ins.prep && ins.stock <= 0;
  });
}
// Insumo faltante de una combinacion, para el mensaje de la tarjeta.
// Sin opcion (undefined) → cualquier insumo agotado del producto (base o variante).
function insumoFaltante(prod, opt) {
  const l = prod.receta.find(x => {
    if (opt !== undefined && !lineaAplica(x, opt)) return false;
    const i = insumos.find(y => y.id === x.insId);
    return i && i.prep && i.stock <= 0;
  });
  return l ? (insumos.find(y => y.id === l.insId) || {}).nombre || '—' : '—';
}
function countRecipes(insId) {
  return productos.filter(p => p.receta && p.receta.some(l => l.insId === insId)).length;
}

// ═══════════════════════════════════════════════════
// CARGA DE DATOS
// ═══════════════════════════════════════════════════
async function loadData() {
  mostrarCargando(true);
  try {
    const { data: { user }, error: authErr } = await iv_sb.auth.getUser();
    if (authErr || !user) { window.location.href = 'login.html'; return; }
    tenantId = user.user_metadata?.tenant_id || null;
    branchId = user.user_metadata?.branch_id || null;

    const meta     = user.user_metadata || {};
    const fullName = meta.full_name || user.email || 'Usuario';
    const initials = fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);

    document.getElementById('tb-avatar').textContent  = initials;
    document.getElementById('tb-uname').textContent   = fullName;
    document.getElementById('tb-urole').textContent   = meta.role || 'Administrador';
    // Bloque de marca del sidebar: lo gestiona pos-brand.js.

    await loadCustomUnits();
    await loadProductos();
    await loadInsumos();
    await loadModGroupsDB();
    await loadRecetasDB();
    await loadParamsDB();
    await loadPlantillasDB();
    await loadBasesDB();
    await loadPorciones();
  } catch(e) {
    console.error('[inventario] loadData:', e);
  } finally {
    mostrarCargando(false);
    updateTabBadges();
    showScreen('productos');
    updateKPIs();
  }
}

async function loadProductos() {
  if (!tenantId || !branchId) return;
  const { data, error } = await iv_sb
    .from('pos_products')
    .select('id, name, description, price, available, price_mode, presentations, variables, pos_categories(name, color)')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .order('name');
  if (error) { console.error('[inventario] loadProductos:', error); return; }
  productos = (data || []).map(p => ({
    id:      p.id,
    nombre:  p.name,
    cat:     p.pos_categories?.name || 'Sin categoría',
    catColor: p.pos_categories?.color || '#64748B',
    precio:  parseFloat(p.price) || 0,
    visible:     p.available !== false,
    descripcion: p.description || '',
    priceMode:   p.price_mode || 'simple',
    // Tamanos del catalogo. Si el producto no tiene, se usa el pseudo-id '_'.
    pres: (p.presentations || []).map(x => ({ id: x.id, name: x.name || '', price: parseFloat(x.price) || 0 })),
    // Grupo de variables que define precio (Mixta / Carne / Pollo).
    variantes: (function () {
      const gs = p.variables || [];
      const g  = gs.find(x => x.isPricing) || gs[0];
      if (!g || !(g.options || []).length) return null;
      return {
        grupo: g.name || 'Opcion',
        opciones: g.options.map(o => ({
          id: o.id, name: o.name || '',
          price: parseFloat(o.price) || 0,
          prices: Array.isArray(o.prices) ? o.prices.map(v => parseFloat(v) || 0) : null,
        })),
      };
    })(),
    // TODOS los grupos de variables (para productos con 2+ variantes obligatorias,
    // ej. Súper Queso: Primer Ingrediente × Segundo Ingrediente). El costeo cruza
    // todas las combinaciones. 'variantes' (arriba) sigue siendo el grupo de PRECIO.
    grupos: (p.variables || []).filter(g => (g.options || []).length).map(g => ({
      id: g.id, name: g.name || 'Opción', isPricing: !!g.isPricing,
      opciones: g.options.map(o => ({
        id: o.id, name: o.name || '',
        price: parseFloat(o.price) || 0,
        prices: Array.isArray(o.prices) ? o.prices.map(v => parseFloat(v) || 0) : null,
      })),
    })),
    receta:      [],
  }));
}

async function loadInsumos() {
  if (!tenantId || !branchId) return;
  const { data, error } = await iv_sb
    .from('iv_insumos')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('activo', true)
    .order('nombre');
  if (error) { console.error('[inventario] loadInsumos:', error); return; }
  insumos = (data || []).map(i => ({
    id:         i.id,
    nombre:     i.nombre,
    cat:        i.categoria,
    catColor:   i.cat_color,
    prep:       i.prep_requerido,
    controlManual: !!i.control_manual,
    agotadoManual: !!i.agotado_manual,
    sub:        !!i.sub_inventario,
    servicio:   parseFloat(i.stock_servicio) || 0,
    venderBodega: !!i.vender_bodega,
    avisoBodega: i.aviso_bodega || '',
    buyUnit:    i.buy_unit,
    useUnit:    i.use_unit,
    precio:     parseFloat(i.precio) || 0,
    conversion: parseFloat(i.conversion) || 1,
    stock:      parseFloat(i.stock) || 0,
    min:        parseFloat(i.min_stock) || 0,
  }));
}

// ── Adiciones (recetas vinculadas a opciones de modificadores) ─────────
// Una "adición" es un pseudo-producto: no vive en pos_products sino que apunta
// a una opción de un grupo de modificadores (ej. la opción "Tocineta" del grupo
// "Adiciones personales"). Reutiliza el mismo motor de receta y costeo.
let adiciones = [];   // {id:optId, esAdicion:true, modOptionId, nombre, cat, precio, pres:[], grupos:[], receta:[]}
let modGroups = [];   // {id, name, options:[{id,name,price}]}
function findRecetable(id) {
  return productos.find(p => p.id === id) || adiciones.find(a => a.id === id);
}
async function loadModGroupsDB() {
  if (!tenantId) return;
  try {
    const { data, error } = await iv_sb
      .from('pos_modifier_groups')
      .select('id,name,options')
      .eq('tenant_id', tenantId);
    if (error) { console.error('[inventario] loadModGroups:', error); modGroups = []; return; }
    modGroups = (data || []).map(g => ({
      id: g.id, name: g.name || 'Grupo',
      options: Array.isArray(g.options) ? g.options : [],
    }));
  } catch (e) { console.error('[inventario] loadModGroups:', e); modGroups = []; }
}
// Datos de una opción de modificador por su id (busca en todos los grupos).
function modOptInfo(optId) {
  for (const g of modGroups) {
    const o = (g.options || []).find(x => x.id === optId);
    if (o) return { nombre: o.name, precio: parseFloat(o.price) || 0, grupo: g.name };
  }
  return null;
}

async function loadRecetasDB() {
  if (!tenantId || !branchId) return;
  const { data, error } = await iv_sb
    .from('iv_recetas')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId);
  if (error) { console.error('[inventario] loadRecetas:', error); return; }
  recetas = data || [];
  for (const prod of productos) {
    const ids = presDe(prod).map(p => p.id);
    prod.receta = recetas
      .filter(r => r.product_id === prod.id)
      .map(r => {
        const mapa = r.cantidades || {};
        const qty = {}, porc = {}, manual = {};
        for (const k in mapa) {
          qty[k]    = parseFloat(mapa[k].q) || 0;
          porc[k]   = mapa[k].p || null;
          manual[k] = !mapa[k].p && qty[k] > 0;
        }
        // Recetas viejas (una sola cantidad): se replica en todos los tamanos.
        if (!Object.keys(qty).length) {
          const base = parseFloat(r.cantidad) || 0;
          for (const pid of ids) { qty[pid] = base; porc[pid] = null; manual[pid] = base > 0; }
        }
        return {
          insId:  r.insumo_id,
          merma:  parseFloat(r.merma) || 0,
          varOpt: r.variant_option_id || null,
          qty, porc, manual,
        };
      });
  }

  // ── Adiciones: recetas con mod_option_id (sin product_id) ────────────
  adiciones = [];
  const porOpt = {};
  for (const r of recetas) {
    if (!r.mod_option_id) continue;
    (porOpt[r.mod_option_id] = porOpt[r.mod_option_id] || []).push(r);
  }
  for (const optId in porOpt) {
    const info = modOptInfo(optId) || { nombre: '(modificador eliminado)', precio: 0, grupo: 'Adiciones' };
    const receta = porOpt[optId].map(r => {
      const mapa = r.cantidades || {};
      const qty = {}, porc = {}, manual = {};
      for (const k in mapa) {
        qty[k]    = parseFloat(mapa[k].q) || 0;
        porc[k]   = mapa[k].p || null;
        manual[k] = !mapa[k].p && qty[k] > 0;
      }
      if (!Object.keys(qty).length) {
        const base = parseFloat(r.cantidad) || 0;
        qty['_'] = base; porc['_'] = null; manual['_'] = base > 0;
      }
      return { insId: r.insumo_id, merma: parseFloat(r.merma) || 0, varOpt: null, qty, porc, manual };
    });
    adiciones.push({
      id: optId, esAdicion: true, modOptionId: optId,
      nombre: info.nombre, cat: 'Adición · ' + info.grupo, precio: info.precio,
      pres: [], variantes: null, grupos: [], receta,
    });
  }
}

// ── Porciones (medidas con nombre, por insumo) ─────────────────────────
let porciones = [];

async function loadPorciones() {
  if (!tenantId || !branchId) return;
  const { data, error } = await iv_sb
    .from('iv_porciones')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .order('cantidad');
  if (error) { console.error('[inventario] loadPorciones:', error); return; }
  porciones = (data || []).map(p => ({
    id: p.id, insId: p.insumo_id, nombre: p.nombre, cantidad: parseFloat(p.cantidad) || 0,
  }));
}

function porcionesDe(insId) { return porciones.filter(p => p.insId === insId); }
function porcionPorId(id)   { return porciones.find(p => p.id === id) || null; }

async function crearPorcion(insId, nombre, cantidad) {
  nombre = (nombre || '').trim();
  cantidad = parseFloat(cantidad) || 0;
  if (!nombre || cantidad <= 0) { showToast('Escribe nombre y cantidad'); return null; }
  if (porcionesDe(insId).some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
    showToast('Ya existe una porcion con ese nombre'); return null;
  }
  const { data, error } = await iv_sb.from('iv_porciones').insert({
    tenant_id: tenantId, branch_id: branchId,
    insumo_id: insId, nombre, cantidad,
  }).select().single();
  if (error) { console.error('[porciones] crear:', error); showToast('No se pudo crear: ' + (error.message || error.code || 'error desconocido')); return null; }
  const nueva = { id: data.id, insId, nombre, cantidad };
  porciones.push(nueva);
  return nueva;
}

async function actualizarPorcion(id, nombre, cantidad) {
  const { error } = await iv_sb.from('iv_porciones')
    .update({ nombre: (nombre || '').trim(), cantidad: parseFloat(cantidad) || 0, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('[porciones] actualizar:', error); showToast('No se pudo guardar: ' + (error.message || error.code || 'error desconocido')); return false; }
  const p = porcionPorId(id);
  if (p) { p.nombre = (nombre || '').trim(); p.cantidad = parseFloat(cantidad) || 0; }
  return true;
}

async function eliminarPorcion(id) {
  const { error } = await iv_sb.from('iv_porciones').delete().eq('id', id);
  if (error) { console.error('[porciones] eliminar:', error); showToast('No se pudo eliminar: ' + (error.message || error.code || 'error desconocido')); return false; }
  porciones = porciones.filter(p => p.id !== id);
  return true;
}

let bases = [];   // pos_bases del tenant: [{id,name,ingredients:[],product_ids:[]}]
async function loadBasesDB() {
  if (!tenantId) return;
  const { data, error } = await iv_sb
    .from('pos_bases')
    .select('id,name,ingredients,product_ids')
    .eq('tenant_id', tenantId)
    .order('name');
  if (error) { console.error('[inventario] loadBases:', error); return; }
  bases = (data || []).map(b => ({
    id: b.id,
    name: b.name || '',
    ingredients: Array.isArray(b.ingredients) ? b.ingredients.slice() : [],
    product_ids: Array.isArray(b.product_ids) ? b.product_ids.slice() : [],
  }));
}

async function loadParamsDB() {
  if (!branchId) return;
  const { data, error } = await iv_sb
    .from('iv_params').select('*').eq('branch_id', branchId).maybeSingle();
  if (error) { console.error('[inventario] loadParams:', error); return; }
  if (data) {
    params  = { fc: parseFloat(data.fc_target)||30, op: parseFloat(data.op_cost)||32, inf: parseFloat(data.inflation)||10, merma: data.merma_enabled!==false };
    mermaOn = params.merma;
  }
}

// ══════════════ PLANTILLAS DE COSTEO ══════════════
function plantillaActiva() { return plantillas.find(p => p.id === plantillaActivaId) || plantillas[0] || null; }
function plCatMateria(pl) { return ((pl && pl.cats) || []).find(c => c.tipo === 'materia'); }
function plSumaTipo(pl, tipo) { return ((pl && pl.cats) || []).filter(c => c.tipo === tipo).reduce((s, c) => s + (parseFloat(c.pct) || 0), 0); }
function plTotal(pl) { return ((pl && pl.cats) || []).reduce((s, c) => s + (parseFloat(c.pct) || 0), 0); }

async function loadPlantillasDB() {
  if (!branchId) return;
  try {
    const { data } = await iv_sb.from('branches').select('operacion_config').eq('id', branchId).maybeSingle();
    const cfg = (data && data.operacion_config) || {};
    if (Array.isArray(cfg.costeoPlantillas) && cfg.costeoPlantillas.length) {
      plantillas = cfg.costeoPlantillas;
      plantillaActivaId = cfg.costeoPlantillaActiva || plantillas[0].id;
    }
  } catch (e) { console.warn('[inventario] loadPlantillas:', e && e.message); }
  if (!plantillas.length) {
    const gan = Math.max(0, 100 - (params.fc || 30) - (params.op || 0));
    plantillas = [{ id: 'default', nombre: 'Estándar', cats: [
      { nombre: 'Materia prima', pct: params.fc || 30, tipo: 'materia' },
      { nombre: 'Otros costos (empleados, servicios…)', pct: params.op || 32, tipo: 'costo' },
      { nombre: 'Ganancia', pct: gan, tipo: 'ganancia' },
    ] }];
    plantillaActivaId = 'default';
  }
  aplicarPlantillaAParams();
}
// La plantilla activa manda: materia prima → meta (fc); suma de costos → op.
function aplicarPlantillaAParams() {
  const pl = plantillaActiva(); if (!pl) return;
  const mat = plCatMateria(pl);
  if (mat) params.fc = parseFloat(mat.pct) || params.fc;
  params.op = plSumaTipo(pl, 'costo');
}
async function seleccionarPlantilla(id) {
  plantillaActivaId = id;
  aplicarPlantillaAParams();
  await saveOpConfigPatch({ costeoPlantillas: plantillas, costeoPlantillaActiva: plantillaActivaId });
  await guardarParams();
  renderPlantillas(); refrescarCosteo();
  showToast('Plantilla activa: ' + (plantillaActiva()?.nombre || ''));
}
function renderPlantillas() {
  const host = document.getElementById('pl-list'); if (!host) return;
  const cnt = document.getElementById('pl-count'); if (cnt) cnt.textContent = plantillas.length;
  host.innerHTML = plantillas.map(pl => {
    const activa = pl.id === plantillaActivaId;
    const total = plTotal(pl);
    const cats = (pl.cats || []).map(c => {
      const col = c.tipo === 'materia' ? { bg:'#EEF2FF', ink:'#4F46E5' } : c.tipo === 'ganancia' ? { bg:'#F0FDF4', ink:'#16A34A' } : { bg:'#F8FAFC', ink:'#475569' };
      return `<span class="iv-preset" style="background:${col.bg};color:${col.ink}">${escHtml(c.nombre)} · <b>${c.pct}%</b></span>`;
    }).join('');
    return `<div class="iv-units-card" style="padding:16px;margin-bottom:12px;${activa ? 'border:2px solid #5B6BFF' : ''}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="font-size:15px;font-weight:800;color:#0F172A;flex:1">${escHtml(pl.nombre || 'Sin nombre')}${activa ? ' <span style="font-size:11px;font-weight:700;color:#5B6BFF;background:#EEF2FF;padding:2px 8px;border-radius:999px;margin-left:6px">✓ Activa</span>' : ''}</div>
        <div style="font-size:12px;font-weight:700;color:${total === 100 ? '#16A34A' : '#DC2626'}">Total ${total}%</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${cats}</div>
      <div style="display:flex;gap:8px">
        ${activa ? '' : `<button class="iv-btn-ghost sm" onclick="seleccionarPlantilla('${pl.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Usar esta</button>`}
        <button class="iv-btn-ghost sm" onclick="abrirEditorPlantilla('${pl.id}')">Editar</button>
        ${plantillas.length > 1 ? `<button class="iv-btn-ghost sm" style="color:#DC2626" onclick="eliminarPlantilla('${pl.id}')">Eliminar</button>` : ''}
      </div>
    </div>`;
  }).join('');
}
function abrirEditorPlantilla(id) {
  const pl = id ? plantillas.find(p => p.id === id) : null;
  _plEdit = pl ? JSON.parse(JSON.stringify(pl)) : { id: 'pl_' + Date.now().toString(36), nombre: '', cats: [
    { nombre: 'Materia prima', pct: 30, tipo: 'materia' },
    { nombre: 'Ganancia', pct: 70, tipo: 'ganancia' },
  ] };
  renderEditorPlantilla();
}
function plRefreshTotal() {
  const t = _plEdit ? _plEdit.cats.reduce((s, c) => s + (parseFloat(c.pct) || 0), 0) : 0;
  const el = document.getElementById('pl-total'); if (el) { el.textContent = 'Total ' + t + '%'; el.style.color = t === 100 ? '#16A34A' : '#DC2626'; }
}
function plAddCat() { _plEdit.cats.push({ nombre: '', pct: 0, tipo: 'costo' }); renderEditorPlantilla(); }
function plDelCat(i) { _plEdit.cats.splice(i, 1); renderEditorPlantilla(); }
function renderEditorPlantilla() {
  document.getElementById('pl-modal')?.remove();
  const pl = _plEdit;
  const rows = pl.cats.map((c, i) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
    <input class="iv-input" style="flex:1" value="${escHtml(c.nombre)}" oninput="_plEdit.cats[${i}].nombre=this.value" placeholder="Ej. Empleados">
    <div style="position:relative;width:82px"><input class="iv-input" style="width:82px;padding-right:22px" type="number" min="0" max="100" value="${c.pct}" oninput="_plEdit.cats[${i}].pct=parseFloat(this.value)||0;plRefreshTotal()"><span style="position:absolute;right:9px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:12px">%</span></div>
    <select class="iv-input" style="width:130px" onchange="_plEdit.cats[${i}].tipo=this.value">
      <option value="materia" ${c.tipo === 'materia' ? 'selected' : ''}>Materia prima</option>
      <option value="costo" ${c.tipo === 'costo' ? 'selected' : ''}>Costo</option>
      <option value="ganancia" ${c.tipo === 'ganancia' ? 'selected' : ''}>Ganancia</option>
    </select>
    <button style="border:none;background:#FEE2E2;color:#DC2626;width:30px;height:30px;border-radius:8px;cursor:pointer;flex-shrink:0" onclick="plDelCat(${i})">✕</button>
  </div>`).join('');
  const ov = document.createElement('div');
  ov.id = 'pl-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
  ov.innerHTML = `<div style="background:#fff;border-radius:16px;padding:22px;width:520px;max-width:96vw;font-family:'DM Sans',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">
    <div style="font-size:16px;font-weight:800;color:#0F172A;margin-bottom:4px">${pl.id.startsWith('pl_') && !plantillas.find(x=>x.id===pl.id) ? 'Nueva plantilla' : 'Editar plantilla'}</div>
    <div style="font-size:12.5px;color:#64748B;margin-bottom:14px">Define en qué se reparte el precio. Debe sumar 100%. Marca UNA como "Materia prima" (será tu meta).</div>
    <div class="iv-field-label">Nombre de la plantilla</div>
    <input class="iv-input" id="pl-nombre" style="width:100%;margin-bottom:14px" value="${escHtml(pl.nombre)}" oninput="_plEdit.nombre=this.value" placeholder="Ej. Mi negocio">
    <div style="display:flex;gap:8px;font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:6px"><span style="flex:1">CATEGORÍA</span><span style="width:82px">%</span><span style="width:130px">TIPO</span><span style="width:30px"></span></div>
    ${rows}
    <button class="iv-btn-ghost sm" onclick="plAddCat()" style="margin-top:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar categoría</button>
    <div style="display:flex;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid #F1F5F9">
      <div id="pl-total" style="flex:1;font-size:14px;font-weight:800;color:${plTotal(pl) === 100 ? '#16A34A' : '#DC2626'}">Total ${plTotal(pl)}%</div>
      <button style="padding:11px 14px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer;margin-right:8px" onclick="document.getElementById('pl-modal').remove()">Cancelar</button>
      <button style="padding:11px 18px;border-radius:10px;border:none;background:#5B6BFF;color:#fff;font-weight:700;font-size:13px;cursor:pointer" onclick="guardarPlantillaEdit()">Guardar</button>
    </div>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}
async function guardarPlantillaEdit() {
  const pl = _plEdit;
  if (!pl.nombre.trim()) { alert('Ponle un nombre a la plantilla'); return; }
  pl.cats = pl.cats.filter(c => (c.nombre || '').trim());
  const total = plTotal(pl);
  if (total !== 100) { alert('Los porcentajes deben sumar 100% (van en ' + total + '%)'); return; }
  if (!pl.cats.some(c => c.tipo === 'materia')) { alert('Marca UNA categoría como "Materia prima" (es tu meta de costeo)'); return; }
  const idx = plantillas.findIndex(p => p.id === pl.id);
  if (idx >= 0) plantillas[idx] = pl; else plantillas.push(pl);
  if (!plantillaActivaId) plantillaActivaId = pl.id;
  await saveOpConfigPatch({ costeoPlantillas: plantillas, costeoPlantillaActiva: plantillaActivaId });
  if (pl.id === plantillaActivaId) { aplicarPlantillaAParams(); await guardarParams(); }
  document.getElementById('pl-modal')?.remove();
  renderPlantillas(); refrescarCosteo();
  showToast('✓ Plantilla guardada');
}
async function eliminarPlantilla(id) {
  if (plantillas.length <= 1) { showToast('Debe quedar al menos una plantilla', 'info'); return; }
  if (!confirm('¿Eliminar esta plantilla?')) return;
  plantillas = plantillas.filter(p => p.id !== id);
  if (plantillaActivaId === id) { plantillaActivaId = plantillas[0].id; aplicarPlantillaAParams(); await guardarParams(); }
  await saveOpConfigPatch({ costeoPlantillas: plantillas, costeoPlantillaActiva: plantillaActivaId });
  renderPlantillas(); refrescarCosteo();
}

function mostrarCargando(on) {
  const el = document.getElementById('iv-loading');
  if (el) el.classList.toggle('is-hidden', !on);
}

function updateTabBadges() {
  const conReceta = productos.filter(p => p.receta && p.receta.length > 0);
  document.getElementById('tab-n-productos').textContent = productos.length;
  document.getElementById('tab-n-insumos').textContent   = insumos.length;
  document.getElementById('tab-n-recetas').textContent   = conReceta.length;
  const unidades = customUnits.length;
  const badge = document.getElementById('nav-unidades-badge');
  if (badge) badge.textContent = unidades;
}

// ═══════════════════════════════════════════════════
// KPIs GLOBALES
// ═══════════════════════════════════════════════════
function updateKPIs() {
  const enAlerta   = insumos.filter(i => getStockState(i) !== 'ok').length;
  const pausados   = productos.filter(p => isPausado(p)).length;
  const conReceta  = productos.filter(p => p.receta && p.receta.length > 0);
  const margenes   = conReceta.map(p => {
    const res = resumenReceta(p);
    const r   = res ? res.peor : calcReceta(p);
    return r.precio > 0 ? r.margen / r.precio : 0;
  });
  const margenProm = margenes.length > 0 ? margenes.reduce((a,b)=>a+b,0)/margenes.length*100 : 0;

  document.getElementById('kpi-alerta-n').textContent   = enAlerta;
  document.getElementById('kpi-pausados-n').textContent  = pausados;
  document.getElementById('kpi-margen-n').textContent   = margenes.length > 0 ? margenProm.toFixed(1) + '%' : '—';

  // Tono KPI alerta: rojo si hay alertas, verde si no
  const kpiAlerta = document.getElementById('kpi-alerta');
  if (kpiAlerta) {
    kpiAlerta.classList.toggle('tone-red', enAlerta > 0);
    kpiAlerta.classList.toggle('tone-green', enAlerta === 0);
  }
  // Tono KPI pausados: rojo si hay pausados
  const kpiPausados = document.getElementById('kpi-pausados');
  if (kpiPausados) {
    kpiPausados.classList.toggle('tone-red', pausados > 0);
    kpiPausados.classList.toggle('tone-green', pausados === 0);
  }

  const sideAlert = document.getElementById('side-alert');
  if (enAlerta > 0) {
    sideAlert.classList.remove('is-hidden');
    document.getElementById('side-alert-txt').textContent = enAlerta + ' insumo' + (enAlerta>1?'s':'') + ' en alerta';
  } else {
    sideAlert.classList.add('is-hidden');
  }

  document.getElementById('inv-valor-total').textContent = ivCOP(insumos.reduce((s,i)=>s+i.stock*i.precio,0));
  updateTabBadges();
}

// ═══════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════
const screens = {
  productos: { title:'Productos',          eyebrow:'Control de inventario · El Parche Food', crumb:'Productos' },
  insumos:   { title:'Insumos',            eyebrow:'Control de inventario · El Parche Food', crumb:'Insumos' },
  recetas:   { title:'Recetas y costeo',   eyebrow:'Control de inventario · El Parche Food', crumb:'Recetas y costeo' },
  unidades:  { title:'Unidades de medida', eyebrow:'Configuración', crumb:'Unidades de medida' },
  plantillas:{ title:'Plantillas de costeo', eyebrow:'Configuración', crumb:'Plantillas de costeo' },
  bases:     { title:'Bases de recetas',    eyebrow:'Configuración', crumb:'Bases de recetas' },
};
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('on');
  document.querySelectorAll('.iv-tab').forEach(t => t.classList.remove('on'));
  const tab = document.querySelector('.iv-tab[data-screen="' + name + '"]');
  if (tab) tab.classList.add('on');
  document.querySelectorAll('.iv-nav-item').forEach(n => n.classList.remove('on'));
  const navItem = document.getElementById('nav-' + name);
  if (navItem) navItem.classList.add('on');
  const info = screens[name] || {};
  document.getElementById('page-title').textContent   = info.title || name;
  document.getElementById('page-eyebrow').textContent = info.eyebrow || '';
  document.getElementById('crumb-title').textContent  = info.crumb || info.title || name;
  if (name === 'productos') renderProductos();
  if (name === 'insumos')   renderInsumos();
  if (name === 'recetas')   refrescarCosteo();
  if (name === 'unidades')  renderUnidades();
  if (name === 'plantillas') renderPlantillas();
  if (name === 'bases')     renderBases();
}

// ═══════════════════════════════════════════════════
// PRODUCTOS
// ═══════════════════════════════════════════════════
// Filtros de la pestaña Productos. Se guardan en estado (no en el DOM)
// para que sobrevivan a los re-render que dispara el costeo.
let prodFiltroCat = 'todas';
let prodFiltroQ   = '';

function catsDeProductos() {
  const vistas = [];
  for (const p of productos) if (!vistas.some(v => v.nombre === p.cat)) {
    vistas.push({ nombre: p.cat, color: p.catColor || '#64748B' });
  }
  return vistas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function productosFiltrados() {
  const q = prodFiltroQ.toLowerCase();
  return productos.filter(p =>
    (prodFiltroCat === 'todas' || p.cat === prodFiltroCat) &&
    (!q || p.nombre.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q))
  );
}

function renderProdFiltros() {
  const cont = document.getElementById('prod-filters');
  if (!cont) return;
  // El nombre de la categoria viaja en un data-attribute, no en un onclick:
  // nombres con comilla romperian el atributo.
  let html = `<button class="iv-chip ${prodFiltroCat==='todas'?'on':''}" data-prodcat="todas">Todas <span class="n">${productos.length}</span></button>`;
  const cats = catsDeProductos();
  if (cats.length) html += '<div class="vsep"></div>';
  for (const cat of cats) {
    const cnt = productos.filter(p => p.cat === cat.nombre).length;
    html += `<button class="iv-chip ${prodFiltroCat===cat.nombre?'on':''}" data-prodcat="${escHtml(cat.nombre)}">
      <span class="iv-catdot" style="background:${cat.color}"></span>${escHtml(cat.nombre)} <span class="n">${cnt}</span>
    </button>`;
  }
  cont.innerHTML = html;
}

function setProdCat(cat) { prodFiltroCat = cat; renderProductos(); }

function renderProductos() {
  const grid = document.getElementById('prod-grid');
  grid.innerHTML = '';
  renderProdFiltros();
  if (productos.length === 0) {
    grid.innerHTML = `<div class="iv-empty" style="grid-column:1/-1">
      <div class="iv-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
      <div class="iv-empty-t">Sin productos en catálogo</div>
    </div>`;
    updateKPIs(); return;
  }
  const lista = productosFiltrados();
  if (lista.length === 0) {
    grid.innerHTML = `<div class="iv-empty" style="grid-column:1/-1">
      <div class="iv-empty-t">Ningun plato coincide con el filtro</div>
      <div style="font-size:12.5px;color:#94A3B8;margin-top:4px">Prueba con otra categoria o borra la busqueda.</div>
    </div>`;
    updateKPIs(); return;
  }
  for (const prod of lista) grid.appendChild(buildProdCard(prod));
  updateKPIs();
}

function filterProductos(q) {
  prodFiltroQ = q || '';
  renderProductos();
}

// Precio: un valor si el producto es simple, un rango si tiene tamanos u opciones.
function precioEtiqueta(prod) {
  const precios = [];
  const ops  = opcionesDe(prod);
  const opsL = ops.length ? ops : [null];
  for (const pres of presDe(prod)) {
    for (const op of opsL) {
      const v = precioDe(prod, pres.id, op ? op.id : null);
      if (v > 0) precios.push(v);
    }
  }
  if (!precios.length) return ivCOP(prod.precio);
  const min = Math.min(...precios), max = Math.max(...precios);
  return min === max ? ivCOP(min) : ivCOP(min) + ' \u2013 ' + ivCOP(max);
}

// Materia prima: un porcentaje, o el rango entre la mejor y la peor combinacion.
function fcEtiqueta(resumen, r) {
  if (!resumen || !resumen.rango) return (r.fc * 100).toFixed(1) + '%';
  const lo = (resumen.mejor.fc * 100).toFixed(1);
  const hi = (resumen.peor.fc  * 100).toFixed(1);
  return lo === hi ? hi + '%' : lo + ' \u2013 ' + hi + '%';
}

function buildProdCard(prod) {
  const tieneReceta = prod.receta && prod.receta.length > 0;
  const paused      = tieneReceta && isPausado(prod);
  const resumen     = tieneReceta ? resumenReceta(prod) : null;
  // El semaforo se pinta con el PEOR caso: es el que puede estar sangrando.
  const r           = resumen ? resumen.peor : (tieneReceta ? calcReceta(prod) : null);
  const sem         = r ? semaforo(r.fc) : null;
  const el          = document.createElement('div');
  el.className      = 'iv-prod-card' + (!prod.visible ? ' off' : '');
  el.dataset.product = prod.id;

  // HEAD: exacto del diseño (cat + name izq, precio der)
  const headHTML = `
    <div class="iv-prod-head">
      <div style="min-width:0">
        <div class="iv-prod-cat">${prod.cat}</div>
        <div class="iv-prod-name">${prod.nombre}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="iv-prod-price">${precioEtiqueta(prod)}</div>
        <div class="iv-prod-price-lbl">precio venta</div>
      </div>
    </div>`;

  // STATE BAND
  let stateHTML = '';
  if (!tieneReceta) {
    stateHTML = `<div class="iv-state sin-receta">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Sin receta · agrega insumos para costear</div>`;
  } else if (paused) {
    const nomFalt = insumoFaltante(prod, undefined);
    stateHTML = `<div class="iv-state paused">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      Pausado · falta ${nomFalt}</div>`;
  } else {
    stateHTML = `<div class="iv-state ok">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Disponible · insumos en stock</div>`;
  }

  // MINICOST: labels exactos del diseño
  let minicostHTML = '';
  if (tieneReceta && r) {
    const fcPct   = fcEtiqueta(resumen, r);
    const netaPct = r.precio > 0 ? (r.neta/r.precio*100).toFixed(1) : '0';
    const semColor = sem.color;
    // color de texto según semáforo (más oscuro)
    const inkMap = {'#22C55E':'#166534','#EAB308':'#854D0E','#F97316':'#9A3412','#EF4444':'#991B1B'};
    const fcInk = inkMap[semColor] || '#0F172A';
    minicostHTML = `<div class="iv-minicost">
      <div class="col">
        <div class="v" style="color:${fcInk}"><span style="width:9px;height:9px;border-radius:999px;background:${semColor};display:inline-block"></span>${fcPct}</div>
        <div class="l">${resumen && resumen.rango ? 'materia prima · peor: ' + escHtml(resumen.etiqueta) : 'materia prima'}</div>
      </div>
      <div class="sep"></div>
      <div class="col">
        <div class="v" style="color:#0F172A">${ivCOP(r.margen)}</div>
        <div class="l">margen contrib.</div>
      </div>
      <div class="sep"></div>
      <div class="col">
        <div class="v" style="color:#16A34A">${netaPct}%</div>
        <div class="l">ganancia neta</div>
      </div>
    </div>`;
  } else {
    minicostHTML = `<div class="iv-minicost empty">
      <div class="col"><div class="v" style="color:#CBD5E1">—</div><div class="l">materia prima</div></div>
      <div class="sep"></div>
      <div class="col"><div class="v" style="color:#CBD5E1">—</div><div class="l">margen contrib.</div></div>
      <div class="sep"></div>
      <div class="col"><div class="v" style="color:#CBD5E1">—</div><div class="l">ganancia neta</div></div>
    </div>`;
  }

  // FOOT
  let footHTML = '';
  if (!tieneReceta) {
    footHTML = `<div class="iv-prod-foot" style="gap:8px">
      <button class="iv-btn-sm primary" onclick="abrirEditorInsumoReceta('${prod.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Agregar insumos
      </button>
      <button class="iv-btn-sm ia" onclick="generarRecetaIA('${prod.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12"/><path d="M12 6v6l4 2"/></svg>
        Generar con IA
      </button>
    </div>`;
  } else if (paused) {
    footHTML = `<div class="iv-prod-foot">
      <div class="iv-prod-pausedlbl">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        Pausado por stock
      </div>
      <button class="iv-link" onclick="irAInsumos()">Ver insumos <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>`;
  } else {
    footHTML = `<div class="iv-prod-foot">
      <button class="iv-switch ${prod.visible?'on':''}" onclick="toggleVisible('${prod.id}', this)">
        <span class="iv-switch-label">${prod.visible?'Visible al mesero':'Oculto al mesero'}</span>
        <span class="iv-switch-track"><span class="iv-switch-knob"></span></span>
      </button>
      <button class="iv-link" onclick="abrirRecetaDetalle('${prod.id}')">Ver receta <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>`;
  }

  el.innerHTML = headHTML + stateHTML + minicostHTML + footHTML;
  return el;
}

async function toggleVisible(prodId, btn) {
  const prod = productos.find(p => p.id === prodId);
  if (!prod) return;
  prod.visible = !prod.visible;
  btn.classList.toggle('on', prod.visible);
  const label = btn.querySelector('.iv-switch-label');
  if (label) label.textContent = prod.visible ? 'Visible al mesero' : 'Oculto al mesero';
  await iv_sb.from('pos_products').update({ available: prod.visible }).eq('id', prodId);
  showToast(prod.nombre + (prod.visible ? ' visible al mesero' : ' ocultado al mesero'));
}

function irAInsumos() { showScreen('insumos'); }

// ═══════════════════════════════════════════════════
// EDITOR MANUAL DE RECETA (por producto)
// ═══════════════════════════════════════════════════
let recEdit = { prodId: null, lines: [] };   // lines: [{insId, qty}]

function abrirEditorInsumoReceta(prodId) {
  const prod = findRecetable(prodId);
  if (!prod) return;
  recEdit = {
    prodId,
    tab: null,                 // null = pestaña "Base"; si no, id de la opción
    nueva: null,               // formulario inline de porción nueva
    lines: (prod.receta || []).map(l => ({
      insId: l.insId, merma: l.merma || 0, varOpt: l.varOpt || null,
      qty: { ...l.qty }, porc: { ...l.porc }, manual: { ...l.manual },
    })),
  };
  document.getElementById('panel-receta-edit').classList.remove('is-hidden');
  renderRecEdit();
}

function recEditProd() { return findRecetable(recEdit.prodId); }

// Líneas visibles en la pestaña activa.
function recEditLineasVisibles() {
  return recEdit.lines
    .map((l, i) => ({ l, i }))
    .filter(x => (x.l.varOpt || null) === recEdit.tab);
}

function renderRecEdit() {
  const prod = recEditProd();
  if (!prod) return;
  document.getElementById('rec-edit-title').textContent = 'Editar receta · ' + prod.nombre;

  const lista  = presDe(prod);
  const grupos = gruposDe(prod);
  const allOps = grupos.flatMap(g => g.opciones);   // opciones de TODOS los grupos
  const host   = document.getElementById('rec-edit-list');

  // ── Pestañas de variable (Base + opciones de cada grupo) ───────────
  let tabsHTML = '';
  if (allOps.length) {
    const chip = (id, txt) =>
      '<button class="iv-chip ' + ((recEdit.tab || null) === id ? 'on' : '') + '" data-rectab="' + (id === null ? '' : escHtml(id)) + '">' + escHtml(txt) + '</button>';
    const nomTab = (allOps.find(o => o.id === recEdit.tab) || {}).name || '';
    // Un bloque de chips por grupo (con su nombre si hay más de uno).
    const bloques = grupos.map(g =>
      '<div class="vsep"></div>'
      + (grupos.length > 1 ? '<span style="font-size:10.5px;font-weight:700;color:#94A3B8;align-self:center;margin:0 3px 0 1px">' + escHtml(g.name) + '</span>' : '')
      + g.opciones.map(o => chip(o.id, o.name)).join('')
    ).join('');
    tabsHTML = '<div class="iv-filters" style="margin-bottom:10px;flex-wrap:wrap">'
      + chip(null, 'Base') + bloques
      + '</div><p class="iv-help" style="margin:0 0 12px">'
      + (recEdit.tab
          ? 'Solo lo que diferencia a <strong>' + escHtml(nomTab) + '</strong>. Lo de Base ya va incluido.'
          : 'Lo de <strong>Base</strong> va en TODAS las combinaciones. En cada opción agregas solo lo que la diferencia (ej. la carne en “Carne”, la tocineta en “Tocineta”).')
      + '</p>';
  }

  // ── Tabla: una columna por tamaño ─────────────────────────────────
  const visibles = recEditLineasVisibles();
  let tablaHTML;
  if (!visibles.length) {
    tablaHTML = '<div style="text-align:center;color:#94A3B8;font-size:12.5px;padding:18px 0">'
      + (recEdit.tab ? 'Sin insumos propios de esta opción.' : 'Sin ingredientes.')
      + ' Agrega uno abajo.</div>';
  } else {
    const th = lista.map(p =>
      '<th style="text-align:right;padding:6px 0 6px 8px;font-size:11.5px;font-weight:600;color:#64748B">'
      + escHtml(p.name || 'Cantidad') + '</th>').join('');
    const filas = visibles.map(function (x) {
      const l = x.l, i = x.i;
      const ins = insumos.find(y => y.id === l.insId);
      const celdas = lista.map(p =>
        '<td style="padding:6px 0 6px 8px;vertical-align:top">' + recEditCelda(l, i, p.id, ins) + '</td>').join('');
      return '<tr><td style="padding:6px 0;font-size:12.5px;font-weight:600;color:#0F172A;vertical-align:top">'
        + escHtml(ins ? ins.nombre : '(insumo eliminado)') + '</td>' + celdas
        + '<td style="padding:6px 0 6px 8px;vertical-align:top;text-align:right">'
        + '<button class="ia-ingr-del" title="Quitar" data-recdel="' + i + '">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
        + '</button></td></tr>';
    }).join('');
    tablaHTML = '<table style="width:100%;border-collapse:collapse">'
      + '<thead><tr style="border-bottom:1px solid #E2E8F0">'
      + '<th style="text-align:left;padding:6px 0;font-size:11.5px;font-weight:600;color:#64748B">Insumo</th>'
      + th + '<th style="width:28px"></th></tr></thead><tbody>' + filas + '</tbody></table>';
  }

  host.innerHTML = tabsHTML + tablaHTML + recEditResumen(prod);

  // Select de insumos disponibles en ESTA pestaña
  const sel = document.getElementById('rec-edit-add-select');
  const usados = new Set(visibles.map(x => x.l.insId));
  const disp = insumos.filter(i => !usados.has(i.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  sel.innerHTML = '<option value="">Agregar insumo…</option>' +
    disp.map(i => '<option value="' + i.id + '">' + escHtml(i.nombre) + ' (' + escHtml(i.useUnit) + ')</option>').join('');
}

// Una celda = desplegable de porciones, o campo manual si así se eligió.
function recEditCelda(l, i, presId, ins) {
  const unidad = ins ? ins.useUnit : '';
  const nueva  = recEdit.nueva;

  if (nueva && nueva.line === i && nueva.pres === presId) {
    return '<div style="display:flex;flex-direction:column;gap:5px;min-width:150px">'
      + '<input class="iv-input" style="font-size:12px;padding:5px 8px" placeholder="Nombre" value="' + escHtml(nueva.nombre) + '" data-recnuevanom="1">'
      + '<input class="iv-input" style="font-size:12px;padding:5px 8px" type="number" step="any" placeholder="Cantidad en ' + escHtml(unidad) + '" value="' + nueva.cantidad + '" data-recnuevacant="1">'
      + '<div style="display:flex;gap:5px">'
      + '<button class="iv-btn-sm primary" data-recnuevaok="1">Guardar</button>'
      + '<button class="iv-btn-sm" data-recnuevacancel="1">Cancelar</button>'
      + '</div></div>';
  }

  if (l.manual[presId]) {
    return '<div style="display:flex;align-items:center;gap:5px;justify-content:flex-end">'
      + '<input class="ia-ingr-qty" style="width:68px" type="number" min="0" step="any" value="' + (l.qty[presId] || 0) + '"'
      + ' data-recqty="' + i + '" data-recpres="' + escHtml(presId) + '">'
      + '<span style="font-size:11.5px;font-weight:600;color:#64748B">' + escHtml(unidad) + '</span>'
      + '<button title="Elegir una porción" data-recusarporc="' + i + '" data-recpres="' + escHtml(presId) + '"'
      + ' style="border:none;background:none;cursor:pointer;color:#94A3B8;padding:2px">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
      + '</button></div>';
  }

  const props = porcionesDe(l.insId);
  const elegida = l.porc[presId] || '';
  const opts = props.map(p =>
    '<option value="p:' + p.id + '"' + (elegida === p.id ? ' selected' : '') + '>'
    + escHtml(p.nombre) + ' · ' + p.cantidad + ' ' + escHtml(unidad) + '</option>').join('');
  return '<select class="iv-select" style="font-size:12px;padding:5px 8px;min-width:150px"'
    + ' data-recporc="' + i + '" data-recpres="' + escHtml(presId) + '">'
    + '<option value=""' + (elegida ? '' : ' selected') + '>Elegir…</option>'
    + opts
    + '<option value="__manual__">Escribir cantidad…</option>'
    + '<option value="__nueva__">Crear porción nueva…</option>'
    + '</select>';
}

// Costeo de todas las combinaciones, dentro del mismo panel.
function recEditResumen(prod) {
  const combos = recEditCombosPreview(prod);
  if (!combos.length) return '';
  const filas = combos.map(function (c) {
    const et  = [c.varName, c.presName].filter(Boolean).join(' · ') || 'Receta';
    const sem = semaforo(c.fc);
    return '<tr><td style="padding:5px 0;font-size:12px;color:#0F172A">' + escHtml(et) + '</td>'
      + '<td style="padding:5px 0;text-align:right;font-size:12px;color:#475569">' + ivCOP(c.raw) + '</td>'
      + '<td style="padding:5px 0;text-align:right;font-size:12px;color:#94A3B8">' + ivCOP(c.precio) + '</td>'
      + '<td style="padding:5px 0 5px 10px;text-align:right;font-size:12px;font-weight:700;color:' + sem.color + '">'
      + (c.fc * 100).toFixed(1) + '%</td></tr>';
  }).join('');
  return '<div data-recresumen="1" style="margin-top:18px;padding-top:14px;border-top:1px solid #E2E8F0">'
    + '<div class="iv-section-label" style="margin-bottom:6px">Costeo por combinación</div>'
    + '<table style="width:100%;border-collapse:collapse"><thead><tr>'
    + '<th style="text-align:left;padding:4px 0;font-size:11px;font-weight:600;color:#94A3B8">Combinación</th>'
    + '<th style="text-align:right;padding:4px 0;font-size:11px;font-weight:600;color:#94A3B8">Costo</th>'
    + '<th style="text-align:right;padding:4px 0;font-size:11px;font-weight:600;color:#94A3B8">Venta</th>'
    + '<th style="text-align:right;padding:4px 0 4px 10px;font-size:11px;font-weight:600;color:#94A3B8">Materia</th>'
    + '</tr></thead><tbody>' + filas + '</tbody></table></div>';
}

// Igual que combosDe(), pero sobre lo que hay en pantalla sin guardar todavía.
function recEditCombosPreview(prod) {
  const backup = prod.receta;
  prod.receta = recEdit.lines;
  let out = [];
  try { out = combosDe(prod); } finally { prod.receta = backup; }
  return out;
}

function recEditSetTab(tab) { recEdit.tab = tab || null; recEdit.nueva = null; renderRecEdit(); }

function recEditSetQty(i, presId, v) {
  const l = recEdit.lines[i];
  if (!l) return;
  l.qty[presId] = parseFloat(v) || 0;
  recEditRefrescarResumen();
}

// El resumen se repinta solo, para no perder el foco del campo que se escribe.
function recEditRefrescarResumen() {
  const prod = recEditProd();
  if (!prod) return;
  const viejo = document.querySelector('[data-recresumen]');
  if (!viejo) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = recEditResumen(prod);
  if (tmp.firstElementChild) viejo.parentNode.replaceChild(tmp.firstElementChild, viejo);
}

function recEditPorcSel(i, presId, val) {
  const l = recEdit.lines[i];
  if (!l) return;
  if (val === '__manual__') {
    l.manual[presId] = true;
    l.porc[presId] = null;
    recEdit.nueva = null;
  } else if (val === '__nueva__') {
    recEdit.nueva = { line: i, pres: presId, nombre: '', cantidad: '' };
  } else if (val.indexOf('p:') === 0) {
    const p = porcionPorId(val.slice(2));
    if (p) { l.porc[presId] = p.id; l.qty[presId] = p.cantidad; l.manual[presId] = false; }
    recEdit.nueva = null;
  } else {
    l.porc[presId] = null; l.qty[presId] = 0; l.manual[presId] = false;
  }
  renderRecEdit();
}

function recEditUsarPorcion(i, presId) {
  const l = recEdit.lines[i];
  if (!l) return;
  l.manual[presId] = false;
  renderRecEdit();
}

async function recEditGuardarNueva() {
  const n = recEdit.nueva;
  if (!n) return;
  const inpNom  = document.querySelector('[data-recnuevanom]');
  const inpCant = document.querySelector('[data-recnuevacant]');
  const l = recEdit.lines[n.line];
  if (!l) return;
  const p = await crearPorcion(l.insId, inpNom ? inpNom.value : '', inpCant ? inpCant.value : '');
  if (!p) return;
  l.porc[n.pres]   = p.id;
  l.qty[n.pres]    = p.cantidad;
  l.manual[n.pres] = false;
  recEdit.nueva = null;
  showToast('✓ Porción creada');
  renderRecEdit();
}

function recEditDelLine(i) {
  recEdit.lines.splice(i, 1);
  recEdit.nueva = null;
  renderRecEdit();
}

function recEditAddLine() {
  const sel = document.getElementById('rec-edit-add-select');
  const insId = sel.value;
  if (!insId) return;
  if (recEditLineasVisibles().some(x => x.l.insId === insId)) return;
  const qty = {}, porc = {}, manual = {};
  for (const p of presDe(recEditProd())) { qty[p.id] = 0; porc[p.id] = null; manual[p.id] = false; }
  recEdit.lines.push({ insId, merma: 0, varOpt: recEdit.tab || null, qty, porc, manual });
  renderRecEdit();
}

// El panel se redibuja entero en cada cambio, así que los listeners van
// en el documento y no en cada control.
document.addEventListener('click', function (ev) {
  const t = ev.target;
  if (!t || !t.closest) return;
  const tab = t.closest('[data-rectab]');
  if (tab) { recEditSetTab(tab.dataset.rectab || null); return; }
  const del = t.closest('[data-recdel]');
  if (del) { recEditDelLine(parseInt(del.dataset.recdel, 10)); return; }
  const usar = t.closest('[data-recusarporc]');
  if (usar) { recEditUsarPorcion(parseInt(usar.dataset.recusarporc, 10), usar.dataset.recpres); return; }
  if (t.closest('[data-recnuevaok]'))     { recEditGuardarNueva(); return; }
  if (t.closest('[data-recnuevacancel]')) { recEdit.nueva = null; renderRecEdit(); return; }
});
document.addEventListener('change', function (ev) {
  const s = ev.target.closest && ev.target.closest('[data-recporc]');
  if (s) recEditPorcSel(parseInt(s.dataset.recporc, 10), s.dataset.recpres, s.value);
});
document.addEventListener('input', function (ev) {
  const q = ev.target.closest && ev.target.closest('[data-recqty]');
  if (q) recEditSetQty(parseInt(q.dataset.recqty, 10), q.dataset.recpres, q.value);
});

function recEditRegenerarIA() {
  const prodId = recEdit.prodId;
  document.getElementById('panel-receta-edit').classList.add('is-hidden');
  generarRecetaIA(prodId);
}

async function guardarRecetaEdit() {
  const prodId = recEdit.prodId;
  const prod = findRecetable(prodId);
  if (!prod) return;
  const esAd = !!prod.esAdicion;
  const ids = presDe(prod).map(p => p.id);

  // Una linea sirve si tiene cantidad en al menos un tamano.
  const lines = recEdit.lines.filter(l =>
    l.insId && ids.some(pid => (l.qty[pid] || 0) > 0));

  const btn = document.getElementById('rec-edit-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando\u2026'; }

  if (esAd) {
    await iv_sb.from('iv_recetas').delete()
      .eq('mod_option_id', prod.modOptionId).eq('tenant_id', tenantId).eq('branch_id', branchId);
  } else {
    await iv_sb.from('iv_recetas').delete().eq('product_id', prodId);
  }
  if (lines.length) {
    const rows = lines.map(l => {
      const cantidades = {};
      for (const pid of ids) {
        const q = l.qty[pid] || 0;
        if (q > 0) cantidades[pid] = l.porc[pid] ? { q, p: l.porc[pid] } : { q };
      }
      return {
        tenant_id: tenantId, branch_id: branchId,
        product_id: esAd ? null : prodId,
        mod_option_id: esAd ? prod.modOptionId : null,
        insumo_id: l.insId,
        variant_option_id: l.varOpt || null,
        cantidades,
        cantidad: l.qty[ids[0]] || 0,   // compatibilidad con la columna vieja
        merma: l.merma || 0,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await iv_sb.from('iv_recetas').insert(rows);
    if (error) {
      console.error('[receta-edit] guardar:', error);
      showToast('No se pudo guardar la receta: ' + (error.message || error.code || 'error desconocido'));
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
      return;
    }
  }

  prod.receta = lines.map(l => ({
    insId: l.insId, merma: l.merma || 0, varOpt: l.varOpt || null,
    qty: { ...l.qty }, porc: { ...l.porc }, manual: { ...l.manual },
  }));
  document.getElementById('panel-receta-edit').classList.add('is-hidden');
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  showToast('\u2713 Receta guardada');
  updateTabBadges(); updateKPIs(); refrescarCosteo(); renderProductos();
}

// ═══════════════════════════════════════════════════
// EDITOR DE BASES DE RECETA (pos_bases)
// ═══════════════════════════════════════════════════
let baseEdit = { id: null, name: '', ingredients: [], product_ids: [] };
let baseProdFilter = '';

function renderBases() {
  const card = document.getElementById('bases-card');
  if (!card) return;
  document.getElementById('bases-count').textContent = bases.length;
  if (!bases.length) {
    card.innerHTML = '<div class="iv-units-emptywrap"><div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:6px">Sin bases</div><p style="font-size:12px;color:#94A3B8;max-width:320px;margin:0 auto">Las bases son los ingredientes comunes de un grupo de productos (ej. la base de las salchipapas). La IA los usa al generar recetas.</p></div>';
    return;
  }
  card.innerHTML = bases.map(b => {
    const nIng = (b.ingredients || []).length;
    const nProd = (b.product_ids || []).length;
    const chips = (b.ingredients || []).slice(0, 6).map(x => '<span class="base-chip sm">' + escHtml(x) + '</span>').join('') + (nIng > 6 ? '<span class="base-chip sm more">+' + (nIng - 6) + '</span>' : '');
    return '<button class="base-listitem" onclick="abrirBaseEditor(\'' + b.id + '\')">'
      + '<div style="flex:1;min-width:0;text-align:left">'
      + '<div class="base-li-name">' + escHtml(b.name) + '</div>'
      + '<div class="base-li-chips">' + chips + '</div>'
      + '<div class="base-li-meta">' + nIng + ' ingredientes · ' + nProd + ' productos</div>'
      + '</div>'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
      + '</button>';
  }).join('');
}

function nuevaBase() {
  baseEdit = { id: null, name: '', ingredients: [], product_ids: [] };
  baseProdFilter = '';
  document.getElementById('panel-base-edit').classList.remove('is-hidden');
  renderBaseEditor();
}

function abrirBaseEditor(id) {
  const b = bases.find(x => x.id === id);
  if (!b) return;
  baseEdit = { id: b.id, name: b.name, ingredients: b.ingredients.slice(), product_ids: b.product_ids.slice() };
  baseProdFilter = '';
  document.getElementById('panel-base-edit').classList.remove('is-hidden');
  renderBaseEditor();
}

function renderBaseEditor() {
  document.getElementById('base-edit-title').textContent = baseEdit.id ? 'Editar base' : 'Nueva base';
  const nameInp = document.getElementById('base-name');
  if (nameInp && document.activeElement !== nameInp) nameInp.value = baseEdit.name || '';
  document.getElementById('btn-base-eliminar').classList.toggle('is-hidden', !baseEdit.id);

  // Chips de ingredientes
  const chipsWrap = document.getElementById('base-ingr-chips');
  chipsWrap.innerHTML = baseEdit.ingredients.length
    ? baseEdit.ingredients.map((x, i) => '<span class="base-chip">' + escHtml(x) + '<button onclick="baseDelIngr(' + i + ')" title="Quitar">&times;</button></span>').join('')
    : '<span style="font-size:12px;color:#94A3B8">Sin ingredientes aún</span>';

  // Lista de productos con checkbox (filtrada)
  const q = baseProdFilter.toLowerCase().trim();
  const wrap = document.getElementById('base-prod-list');
  const prods = productos
    .filter(p => !q || p.nombre.toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q))
    .sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.nombre.localeCompare(b.nombre));
  const sel = new Set(baseEdit.product_ids);
  document.getElementById('base-prod-count').textContent = baseEdit.product_ids.length;
  wrap.innerHTML = prods.map(p => {
    const on = sel.has(p.id);
    return '<button class="base-prod-row' + (on ? ' on' : '') + '" onclick="baseToggleProd(\'' + p.id + '\')">'
      + '<span class="base-check">' + (on ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</span>'
      + '<span style="flex:1;min-width:0"><span class="base-prod-name">' + escHtml(p.nombre) + '</span> <span class="base-prod-cat">' + escHtml(p.cat || '') + '</span></span>'
      + '</button>';
  }).join('') || '<div style="font-size:12px;color:#94A3B8;padding:12px;text-align:center">Sin productos</div>';
}

function baseSetName(v) { baseEdit.name = v; }
function baseAddIngr() {
  const inp = document.getElementById('base-ingr-input');
  const v = (inp.value || '').trim();
  if (!v) return;
  if (!baseEdit.ingredients.some(x => x.toLowerCase() === v.toLowerCase())) baseEdit.ingredients.push(v);
  inp.value = '';
  renderBaseEditor();
  inp.focus();
}
function baseDelIngr(i) { baseEdit.ingredients.splice(i, 1); renderBaseEditor(); }
function baseToggleProd(prodId) {
  const idx = baseEdit.product_ids.indexOf(prodId);
  if (idx >= 0) baseEdit.product_ids.splice(idx, 1);
  else baseEdit.product_ids.push(prodId);
  renderBaseEditor();
}
function baseFilterProds(v) { baseProdFilter = v; renderBaseEditor(); }

async function guardarBase() {
  const name = (baseEdit.name || '').trim();
  if (!name) { alert('Ponle un nombre a la base'); return; }
  const btn = document.getElementById('base-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const payload = { name, ingredients: baseEdit.ingredients, product_ids: baseEdit.product_ids, tenant_id: tenantId };
  try {
    if (baseEdit.id) {
      await iv_sb.from('pos_bases').update(payload).eq('id', baseEdit.id);
    } else {
      await iv_sb.from('pos_bases').insert(payload);
    }
    await loadBasesDB();
    document.getElementById('panel-base-edit').classList.add('is-hidden');
    showToast('✓ Base guardada');
    renderBases();
  } catch (e) {
    console.error('[base] guardar:', e);
    showToast('Error al guardar la base');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
}

async function eliminarBase() {
  if (!baseEdit.id || !confirm('¿Eliminar esta base? Los productos ya no la usarán al generar recetas.')) return;
  try {
    await iv_sb.from('pos_bases').delete().eq('id', baseEdit.id);
    await loadBasesDB();
    document.getElementById('panel-base-edit').classList.add('is-hidden');
    showToast('Base eliminada');
    renderBases();
  } catch (e) { console.error('[base] eliminar:', e); showToast('Error al eliminar'); }
}

// ═══════════════════════════════════════════════════
// INSUMOS
// ═══════════════════════════════════════════════════
function renderInsumos(filtro) {
  filtro = filtro || activeFilter;
  activeFilter = filtro;
  buildFiltersChips();
  const searchVal = document.getElementById('ins-search')?.value.toLowerCase() || '';
  const container = document.getElementById('ins-groups');
  container.innerHTML = '';

  if (insumos.length === 0) {
    container.innerHTML = `<div class="iv-empty">
      <div class="iv-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3h6"/><path d="M10 3v6.5L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9.5V3"/><path d="M7.5 14h9"/></svg></div>
      <div class="iv-empty-t">Sin insumos registrados</div>
    </div>`;
    return;
  }

  const cats = [...new Set(insumos.map(i => i.cat))];
  let shown  = 0;
  for (const cat of cats) {
    let catIns = insumos.filter(i => i.cat === cat);
    if (filtro === 'alerta') catIns = catIns.filter(i => getStockState(i) !== 'ok');
    if (filtro !== 'todos' && filtro !== 'alerta') catIns = catIns.filter(i => i.cat === filtro);
    if (searchVal) catIns = catIns.filter(i => i.nombre.toLowerCase().includes(searchVal));
    if (catIns.length === 0) continue;
    shown += catIns.length;
    const sample = catIns[0];
    const noPrep = !catIns.some(i => i.prep);
    const groupEl = document.createElement('div');
    groupEl.className = 'iv-group';
    groupEl.innerHTML = `
      <div class="iv-group-head">
        <span class="iv-catdot" style="width:9px;height:9px;background:${sample.catColor}"></span>
        <span class="iv-group-title">${cat}</span>
        <span class="iv-group-count">${catIns.length}</span>
        ${noPrep ? '<span class="iv-group-noprep">No entra en preparaciones</span>' : ''}
      </div>
      <div class="iv-ins-list" id="list-${cat.replace(/\s/g,'-')}"></div>`;
    container.appendChild(groupEl);
    const listEl = groupEl.querySelector('.iv-ins-list');
    for (const ins of catIns) listEl.appendChild(buildInsRow(ins));
  }
  if (shown === 0) {
    container.innerHTML = `<div class="iv-empty"><div class="iv-empty-t">Sin resultados</div></div>`;
  }
}

function buildFiltersChips() {
  const container   = document.getElementById('ins-filters');
  const cats        = [...new Set(insumos.map(i => i.cat))];
  const alertaCount = insumos.filter(i => getStockState(i) !== 'ok').length;
  let html = `
    <button class="iv-chip ${activeFilter==='todos'?'on':''}" onclick="renderInsumos('todos')">Todos <span class="n">${insumos.length}</span></button>
    <button class="iv-chip ${activeFilter==='alerta'?'on':''}" style="color:#DC2626" onclick="renderInsumos('alerta')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      En alerta <span class="n">${alertaCount}</span>
    </button>
    <div class="vsep"></div>`;
  for (const cat of cats) {
    const cnt = insumos.filter(i => i.cat === cat).length;
    const col = insumos.find(i=>i.cat===cat)?.catColor||'#64748B';
    html += `<button class="iv-chip ${activeFilter===cat?'on':''}" onclick="renderInsumos('${cat}')">
      <span class="iv-catdot" style="background:${col}"></span>${cat} <span class="n">${cnt}</span>
    </button>`;
  }
  // prompt() no existe en Electron → formulario inline en lugar del chip
  if (_nuevaCatForm) {
    html += `<span class="iv-chip" style="gap:6px;cursor:default">
      <input id="iv-newcat-inp" placeholder="Nueva categoría" style="font-family:inherit;font-size:12px;border:1px solid #E2E8F0;border-radius:7px;padding:4px 8px;width:150px;outline:none" onkeydown="if(event.key==='Enter')confirmarNuevaCat();if(event.key==='Escape')cancelarNuevaCat()">
      <button type="button" onclick="confirmarNuevaCat()" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:#5B6BFF;color:#fff;padding:5px 10px;border-radius:8px;cursor:pointer">Crear</button>
      <button type="button" onclick="cancelarNuevaCat()" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:none;color:#94A3B8;padding:5px 4px;cursor:pointer">Cancelar</button>
    </span>`;
  } else {
    html += `<button class="iv-chip dashed" id="btn-nueva-cat" onclick="abrirNuevaCat()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Categoría
    </button>`;
  }
  container.innerHTML = html;
}

let _nuevaCatForm = false; // formulario inline "+ Categoría" abierto (prompt no existe en Electron)
function abrirNuevaCat() {
  _nuevaCatForm = true;
  buildFiltersChips();
  document.getElementById('iv-newcat-inp')?.focus();
}
function cancelarNuevaCat() { _nuevaCatForm = false; buildFiltersChips(); }
function confirmarNuevaCat() {
  const inp = document.getElementById('iv-newcat-inp');
  const nombre = (inp?.value || '').trim();
  if (!nombre) { inp?.focus(); return; }
  _nuevaCatForm = false;
  buildFiltersChips();
  showToast('Categoría "' + nombre + '" disponible al crear el próximo insumo');
}

function buildInsRow(ins) {
  const state    = getStockState(ins);
  const colors   = stateColors(state);
  const pct      = ins.min > 0 ? Math.min(100, ins.stock/ins.min*100) : 100;
  const usedCount = countRecipes(ins.id);
  const tagHTML  = ins.prep
    ? (usedCount > 0 ? `<span class="iv-tag-recipe">${usedCount} receta${usedCount>1?'s':''}</span>` : '')
    : `<span class="iv-tag-direct"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z"/></svg>Venta directa</span>`;
  const el = document.createElement('div');
  el.className = 'iv-ins-row';
  el.innerHTML = `
    <div class="iv-ins-main">
      <div style="display:flex;align-items:center;gap:8px"><span class="iv-ins-name">${ins.nombre}</span>${tagHTML}${ins.controlManual?'<span class="iv-tag-direct" style="color:#B45309;background:#FEF3C7"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>Manual</span>':''}</div>
      <div class="iv-ins-meta">Compra: <strong>${ivCOP(ins.precio)}</strong> / ${ins.buyUnit} · usa en ${ins.useUnit}</div>
    </div>
    <div class="iv-ins-stock">
      <div class="iv-ins-stock-top">
        ${ins.sub
          ? `<span class="iv-ins-stock-val" style="color:${colors.txt};font-size:12.5px">Bodega <b>${ins.stock}</b> · Servicio <b style="color:${ins.servicio>0?'#16A34A':'#DC2626'}">${ins.servicio}</b> <span class="u">${ins.buyUnit}</span></span>`
          : `<span class="iv-ins-stock-val" style="color:${colors.txt}">${ins.stock} <span class="u">${ins.buyUnit}</span></span>`}
        <span class="iv-ins-min">mín ${ins.min}</span>
      </div>
      <div class="iv-bar"><i style="width:${pct}%;background:${colors.bar}"></i></div>
    </div>
    <div class="iv-ins-badgewrap">
      ${ins.controlManual
        ? `<button class="iv-badge" onclick="toggleAgotadoManual('${ins.id}')" title="Toca para cambiar disponibilidad" style="cursor:pointer;border:none;font-weight:700;color:${ins.agotadoManual?'#DC2626':'#16A34A'};background:${ins.agotadoManual?'#FEE2E2':'#DCFCE7'}">${ins.agotadoManual?'⛔ Se acabó':'✅ Disponible'}</button>`
        : ins.sub
          ? `<span class="iv-badge" style="color:${(ins.servicio>0||(ins.stock>0&&ins.venderBodega))?'#16A34A':'#DC2626'};background:${(ins.servicio>0||(ins.stock>0&&ins.venderBodega))?'#DCFCE7':'#FEE2E2'}">${ins.servicio>0?'En servicio':(ins.stock>0&&ins.venderBodega?'Solo bodega':'Agotado')}</span>`
          : `<span class="iv-badge" style="color:${colors.txt};background:${colors.bg}">${stateLabel(state)}</span>`}
    </div>
    <div class="iv-ins-actions">
      ${ins.sub
        ? `<button class="iv-btn-ghost sm" onclick="abrirSurtir('${ins.id}')" title="Mover de bodega a servicio"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3h4v4"/><path d="M21 3l-7 7"/><path d="M8 21H4v-4"/><path d="M4 21l7-7"/></svg> Surtir</button>`
        : ''}
      <button class="iv-btn-ghost sm btn-reponer" onclick="abrirReponer('${ins.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Reponer
      </button>
      <button class="iv-row-btn btn-edit-insumo" onclick="abrirEditorInsumo('${ins.id}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      </button>
    </div>`;
  return el;
}

// Marca/desmarca un insumo de control manual como agotado ("Se acabó / Ya hay").
async function toggleAgotadoManual(insId) {
  const ins = insumos.find(i => i.id === insId); if (!ins) return;
  const nuevo = !ins.agotadoManual;
  ins.agotadoManual = nuevo;
  try {
    await iv_sb.from('iv_insumos').update({ agotado_manual: nuevo, updated_at: new Date().toISOString() }).eq('id', insId);
    showToast(nuevo ? '⛔ ' + ins.nombre + ' marcado como agotado' : '✅ ' + ins.nombre + ' disponible de nuevo');
  } catch (e) { ins.agotadoManual = !nuevo; showToast('No se pudo cambiar', 'error'); }
  renderInsumos();
  if (typeof refrescarCosteo === 'function') refrescarCosteo();
}

// Surtir: mover cantidad de Bodega (stock) → En servicio (stock_servicio).
// El stock se guarda en unidad de COMPRA (ej. "paq. ×12"), pero surtir suele
// hacerse por unidad INDIVIDUAL ("saqué 6 gaseosas"). El modal deja elegir en
// cuál de las dos se escribe la cantidad y convierte solo al guardar.
let surtirUnidad = 'compra';   // 'compra' | 'individual'

function abrirSurtir(insId) {
  const ins = insumos.find(i => i.id === insId); if (!ins) return;
  // Si la unidad de compra trae varias individuales (conversión > 1), lo más
  // cómodo es arrancar en individual — es como se piensa al surtir.
  surtirUnidad = ((ins.conversion || 1) > 1) ? 'individual' : 'compra';
  const ov = document.createElement('div');
  ov.id = 'surtir-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `<div style="background:#fff;border-radius:16px;padding:20px 22px;width:380px;max-width:94vw;font-family:'DM Sans',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">
    <div style="font-size:15px;font-weight:800;color:#0F172A">Surtir · ${escHtml(ins.nombre)}</div>
    <div style="font-size:12.5px;color:#64748B;margin:5px 0 14px;line-height:1.5">Mover de <b>Bodega</b> (${surtirFmt(ins.stock, ins)}) a <b>En servicio</b> (${surtirFmt(ins.servicio, ins)}).</div>
    <div id="surtir-tabs"></div>
    <div class="iv-field-label" id="surtir-lbl">Cantidad a surtir</div>
    <input id="surtir-qty" class="iv-input" type="number" min="0" step="any" placeholder="0" style="width:100%" oninput="surtirPreview('${insId}')">
    <div id="surtir-prev" style="font-size:12px;color:#64748B;margin-top:8px;min-height:17px"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button style="flex:1;padding:11px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer" onclick="document.getElementById('surtir-ov').remove()">Cancelar</button>
      <button style="flex:1;padding:11px;border-radius:10px;border:none;background:#0EA5E9;color:#fff;font-weight:700;font-size:13px;cursor:pointer" onclick="confirmarSurtir('${insId}')">Surtir a servicio</button>
    </div>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  renderSurtirTabs(insId);
  setTimeout(() => document.getElementById('surtir-qty')?.focus(), 40);
}
// Muestra una cantidad (en unidad de compra) de forma legible: si la unidad de
// compra agrupa varias, añade el equivalente individual entre paréntesis.
function surtirFmt(qtyCompra, ins) {
  const conv = ins.conversion || 1;
  const base = (+qtyCompra.toFixed(3)) + ' ' + ins.buyUnit;
  if (conv > 1) return base + ' = ' + (+(qtyCompra * conv).toFixed(2)) + ' ' + ins.useUnit;
  return base;
}
function renderSurtirTabs(insId) {
  const ins = insumos.find(i => i.id === insId); if (!ins) return;
  const host = document.getElementById('surtir-tabs'); if (!host) return;
  const conv = ins.conversion || 1;
  // Sin conversión (compra e individual son lo mismo) no tiene sentido elegir.
  if (conv <= 1) { host.innerHTML = ''; actualizarSurtirLabel(insId); return; }
  const tab = (val, txt) =>
    '<button class="iv-chip ' + (surtirUnidad === val ? 'on' : '') + '" style="flex:1;justify-content:center" onclick="setSurtirUnidad(\'' + val + '\',\'' + insId + '\')">' + escHtml(txt) + '</button>';
  host.innerHTML = '<div class="iv-field-label">¿En qué unidad lo vas a escribir?</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:12px">'
    + tab('individual', 'Individual (' + ins.useUnit + ')')
    + tab('compra', 'Completo (' + ins.buyUnit + ')')
    + '</div>';
  actualizarSurtirLabel(insId);
}
function setSurtirUnidad(val, insId) {
  surtirUnidad = val;
  renderSurtirTabs(insId);
  surtirPreview(insId);
  document.getElementById('surtir-qty')?.focus();
}
function actualizarSurtirLabel(insId) {
  const ins = insumos.find(i => i.id === insId); if (!ins) return;
  const lbl = document.getElementById('surtir-lbl');
  if (lbl) lbl.textContent = 'Cantidad a surtir (' + (surtirUnidad === 'individual' ? ins.useUnit : ins.buyUnit) + ')';
}
// Cantidad escrita → unidad de compra (que es como se guarda el stock).
function surtirACompra(qty, ins) {
  const conv = ins.conversion || 1;
  return (surtirUnidad === 'individual' && conv > 0) ? (qty / conv) : qty;
}
function surtirPreview(insId) {
  const ins = insumos.find(i => i.id === insId); if (!ins) return;
  const prev = document.getElementById('surtir-prev'); if (!prev) return;
  const qty = parseFloat(document.getElementById('surtir-qty')?.value) || 0;
  if (qty <= 0) { prev.textContent = ''; return; }
  const enCompra = surtirACompra(qty, ins);
  if (enCompra > ins.stock + 0.000001) {
    prev.innerHTML = '<span style="color:#DC2626;font-weight:700">La bodega solo tiene ' + surtirFmt(ins.stock, ins) + ' — se surtirá todo lo que hay.</span>';
    return;
  }
  prev.textContent = 'Quedará → En servicio: ' + surtirFmt(ins.servicio + enCompra, ins)
    + '  ·  Bodega: ' + surtirFmt(ins.stock - enCompra, ins);
}
async function confirmarSurtir(insId) {
  const ins = insumos.find(i => i.id === insId); if (!ins) return;
  const qty = parseFloat(document.getElementById('surtir-qty')?.value) || 0;
  if (qty <= 0) { showToast('Escribe una cantidad', 'info'); return; }
  const pedido = surtirACompra(qty, ins);            // siempre en unidad de compra
  const mover  = Math.min(pedido, ins.stock);        // no se puede surtir más de lo que hay en bodega
  const nuevaBodega = +(ins.stock - mover).toFixed(4);
  const nuevoServicio = +(ins.servicio + mover).toFixed(4);
  try {
    await iv_sb.from('iv_insumos').update({ stock: nuevaBodega, stock_servicio: nuevoServicio, updated_at: new Date().toISOString() }).eq('id', insId);
    ins.stock = nuevaBodega; ins.servicio = nuevoServicio;
    showToast('✓ Surtido → En servicio: ' + surtirFmt(nuevoServicio, ins) + (mover < pedido - 0.000001 ? ' (bodega no alcanzaba para más)' : ''));
  } catch (e) { showToast('No se pudo surtir', 'error'); }
  document.getElementById('surtir-ov')?.remove();
  renderInsumos(); updateKPIs();
}

// ═══════════════════════════════════════════════════
// PANEL REPONER
// ═══════════════════════════════════════════════════
function abrirReponer(insId) {
  const ins = insumos.find(i => i.id === insId);
  if (!ins) return;
  repInsumoId = insId;
  document.getElementById('rep-title').textContent      = 'Reponer · ' + ins.nombre;
  document.getElementById('rep-cat').textContent        = ins.cat;
  document.getElementById('rep-stock-val').textContent  = ins.stock;
  document.getElementById('rep-stock-unit').textContent = ins.buyUnit;
  document.getElementById('rep-min').textContent        = ins.min;
  document.getElementById('rep-price-unit').textContent = ins.buyUnit;
  document.getElementById('rep-price').value            = ins.precio;
  document.getElementById('rep-price-display').textContent = ivCOP(ins.precio);
  document.getElementById('rep-qty').value              = '0';
  const state  = getStockState(ins);
  const colors = stateColors(state);
  const badge  = document.getElementById('rep-badge');
  badge.textContent = stateLabel(state); badge.style.color = colors.txt; badge.style.background = colors.bg;
  const surtir = Math.max(0, Math.ceil(ins.min*1.25-ins.stock));
  const btn    = document.getElementById('rep-surtir-btn');
  btn.textContent = '+' + surtir + ' · surtir';
  btn.onclick = () => { document.getElementById('rep-qty').value = surtir; updateRepResult(); };
  document.getElementById('rep-result').classList.add('is-hidden');
  document.getElementById('btn-reponer-ok').disabled = true;
  document.getElementById('panel-reponer').classList.remove('is-hidden');
}
function repStep(delta) {
  const input = document.getElementById('rep-qty');
  input.value = Math.max(0, (parseFloat(input.value)||0)+delta);
  updateRepResult();
}
function repAdd(n) {
  const input = document.getElementById('rep-qty');
  input.value = (parseFloat(input.value)||0)+n;
  updateRepResult();
}
function updateRepResult() {
  const qty   = parseFloat(document.getElementById('rep-qty').value)||0;
  const price = parseFloat(document.getElementById('rep-price').value)||0;
  const ins   = insumos.find(i => i.id === repInsumoId);
  if (!ins) return;
  document.getElementById('rep-costo').textContent = ivCOP(qty*price);
  document.getElementById('btn-reponer-ok').disabled = qty <= 0;
  if (qty > 0) {
    const nuevoStock = ins.stock+qty;
    const nuevoState = getStockState({...ins, stock:nuevoStock});
    const colors     = stateColors(nuevoState);
    const res        = document.getElementById('rep-result');
    res.classList.remove('is-hidden');
    res.style.background = colors.bg; res.style.border = '1px solid ' + colors.ring;
    res.querySelector('.rt').textContent = 'Quedará en '+nuevoStock+' '+ins.buyUnit+' · '+stateLabel(nuevoState);
    res.querySelector('.rx').textContent = ins.stock+' + '+qty+' '+ins.buyUnit+' · costo '+ivCOP(qty*price);
    res.querySelector('.rt').style.color = colors.txt;
    res.querySelector('.rx').style.color = colors.txt;
  } else { document.getElementById('rep-result').classList.add('is-hidden'); }
}
async function aplicarReponer() {
  const qty   = parseFloat(document.getElementById('rep-qty').value)||0;
  const price = parseFloat(document.getElementById('rep-price').value)||0;
  if (qty<=0) return;
  const ins = insumos.find(i => i.id === repInsumoId);
  if (!ins) return;
  const nuevoStock  = ins.stock+qty;
  const nuevoPrecio = price>0?price:ins.precio;
  await iv_sb.from('iv_insumos').update({stock:nuevoStock,precio:nuevoPrecio,updated_at:new Date().toISOString()}).eq('id',ins.id);
  ins.stock=nuevoStock; ins.precio=nuevoPrecio;
  closePanel('panel-reponer');
  showToast('✓ '+ins.nombre+' reponido → '+nuevoStock+' '+ins.buyUnit);
  renderInsumos(); updateKPIs(); refrescarCosteo();
  if (document.getElementById('screen-productos').classList.contains('on')) renderProductos();
}

// ═══════════════════════════════════════════════════
// PANEL REGISTRAR COMPRA
// ═══════════════════════════════════════════════════
function abrirCompra() {
  compraQty={}; compraPrices={};
  insumos.forEach(i=>{compraPrices[i.id]=i.precio;});
  filterCompra();
  document.getElementById('compra-search').value='';
  document.getElementById('compra-summary').textContent='Indica cuánto compraste';
  document.getElementById('btn-compra-ok').disabled=true;
  document.getElementById('panel-compra').classList.remove('is-hidden');
}
function filterCompra() {
  const search = document.getElementById('compra-search').value.toLowerCase();
  const list   = document.getElementById('compra-list');
  list.innerHTML='';
  if (insumos.length===0) {
    list.innerHTML=`<div style="padding:32px;text-align:center;color:#94A3B8;font-size:13px">Sin insumos registrados.</div>`;
    return;
  }
  const sorted = [...insumos].sort((a,b)=>{
    const sa=getStockState(a)!=='ok'?0:1; const sb=getStockState(b)!=='ok'?0:1;
    return sa-sb||a.nombre.localeCompare(b.nombre);
  });
  for (const ins of sorted) {
    if (search && !ins.nombre.toLowerCase().includes(search)) continue;
    const state=getStockState(ins); const colors=stateColors(state); const qty=compraQty[ins.id]||0;
    const row=document.createElement('div');
    row.className='iv-buy-row'+(qty>0?' active':''); row.id='buy-row-'+ins.id;
    row.innerHTML=`
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px"><span class="iv-catdot" style="width:7px;height:7px;background:${ins.catColor}"></span><span class="iv-buy-name">${ins.nombre}</span></div>
        <div class="iv-buy-sub">Hay ${ins.stock} ${ins.buyUnit} · <span style="color:${colors.txt};font-weight:700">${stateLabel(state)}</span></div>
      </div>
      <span class="iv-step"><button onclick="updateCompraRow('${ins.id}',null,-1)">−</button><input type="number" min="0" step="any" placeholder="0" value="${qty||''}" oninput="updateCompraRow('${ins.id}',this.value,null)"><button onclick="updateCompraRow('${ins.id}',null,1)">＋</button></span>
      <label class="iv-money" style="width:116px"><span class="cur">$</span><input type="number" min="0" placeholder="0" value="${compraPrices[ins.id]||''}" oninput="updateCompraPrice('${ins.id}',this.value)"></label>`;
    list.appendChild(row);
  }
  updateCompraSummary();
}
function updateCompraRow(insId,qty,delta) {
  if (qty!==null) compraQty[insId]=Math.max(0,parseFloat(qty)||0);
  if (delta!==null) compraQty[insId]=Math.max(0,(compraQty[insId]||0)+delta);
  const row=document.getElementById('buy-row-'+insId);
  if (row) {
    row.classList.toggle('active',(compraQty[insId]||0)>0);
    const inp=row.querySelector('input[type=number]');
    if (inp&&delta!==null) inp.value=compraQty[insId]||'';
  }
  updateCompraSummary();
}
function updateCompraPrice(insId,price) { compraPrices[insId]=parseFloat(price)||0; updateCompraSummary(); }
function updateCompraSummary() {
  const active=Object.entries(compraQty).filter(([,v])=>v>0);
  const total=active.reduce((s,[id,q])=>s+q*(compraPrices[id]||0),0);
  document.getElementById('compra-summary').textContent=active.length>0?(active.length+' insumos · '+ivCOP(total)):'Indica cuánto compraste';
  document.getElementById('btn-compra-ok').disabled=active.length===0;
}
async function aplicarCompra() {
  let n=0;
  for (const [id,qty] of Object.entries(compraQty)) {
    if (qty<=0) continue;
    const ins=insumos.find(i=>i.id===id); if (!ins) continue;
    const nuevoStock=ins.stock+qty; const nuevoPrecio=compraPrices[id]>0?compraPrices[id]:ins.precio;
    await iv_sb.from('iv_insumos').update({stock:nuevoStock,precio:nuevoPrecio,updated_at:new Date().toISOString()}).eq('id',ins.id);
    ins.stock=nuevoStock; ins.precio=nuevoPrecio; n++;
  }
  closePanel('panel-compra');
  showToast('✓ Compra registrada — '+n+' insumos actualizados');
  renderInsumos(); updateKPIs(); refrescarCosteo();
}

// ═══════════════════════════════════════════════════
// EDITOR DE INSUMO
// ── Unidades: base + personalizadas ────────────────────────────
const BASE_BUY_UNITS = ['unidad','libra','kg','gramo','litro','ml','galón','lata','frasco','paq. ×10','paq. ×12','paq. ×24','paq. ×50','paq. ×100','caja ×12','caja ×24','loncha','porción'];
const BASE_USE_UNITS = ['g','ml','unidad','libra','kg','litro','loncha','porción'];
function buildUnitOptions(selId, baseList, current) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const all = baseList.slice();
  customUnits.forEach(u => { if (u && u.nombre && all.indexOf(u.nombre) < 0) all.push(u.nombre); });
  if (current && all.indexOf(current) < 0) all.push(current); // no perder el valor guardado
  sel.innerHTML = all.map(u => '<option value="' + escHtml(u) + '">' + escHtml(u) + '</option>').join('');
  setSelectVal(sel, current);
}

// Persistencia de unidades personalizadas en operacion_config (sincroniza a la tablet)
async function loadCustomUnits() {
  customUnits = [];
  if (!branchId) return;
  try {
    const { data } = await iv_sb.from('branches').select('operacion_config').eq('id', branchId).maybeSingle();
    const cfg = data && data.operacion_config;
    if (cfg && Array.isArray(cfg.unidadesPersonalizadas)) {
      customUnits = cfg.unidadesPersonalizadas.map(u => typeof u === 'string' ? { nombre: u } : u).filter(u => u && u.nombre);
    }
    ventaSinInvOn = !!(cfg && cfg.ventaSinInventario);
  } catch (e) { console.warn('[inventario] loadCustomUnits:', e && e.message); }
}
// Guarda un parche en operacion_config (read-merge-write, sincroniza a la tablet).
async function saveOpConfigPatch(patch) {
  if (!branchId) return;
  try {
    const { data } = await iv_sb.from('branches').select('operacion_config').eq('id', branchId).maybeSingle();
    const cfg = (data && data.operacion_config && typeof data.operacion_config === 'object') ? data.operacion_config : {};
    Object.assign(cfg, patch);
    cfg._ts = Date.now();
    await iv_sb.from('branches').update({ operacion_config: cfg }).eq('id', branchId);
    try { localStorage.setItem('pos.config.operacion.v1', JSON.stringify(cfg)); } catch (e) {}
  } catch (e) { console.warn('[inventario] saveOpConfigPatch:', e && e.message); }
}
function saveCustomUnits() { return saveOpConfigPatch({ unidadesPersonalizadas: customUnits }); }

// ── Stock: modo de captura POR CAMPO (compra vs uso), independiente ────
let _stockMode = { actual: 'buy', min: 'buy' };
function stockUnitFor(field) {
  const buy = (document.getElementById('ins-buy-unit') || {}).value || 'u.compra';
  const use = (document.getElementById('ins-use-unit') || {}).value || 'u.uso';
  return _stockMode[field] === 'use' ? use : buy;
}
function updateStockLabel() {
  const sl = document.getElementById('ins-stock-lbl'); if (sl) sl.textContent = 'Stock actual (' + stockUnitFor('actual') + ')';
  const ml = document.getElementById('ins-min-lbl');   if (ml) ml.textContent = 'Stock mínimo (' + stockUnitFor('min') + ')';
  document.querySelectorAll('.ins-stockmode').forEach(seg => {
    const field = seg.dataset.for;
    seg.querySelectorAll('[data-stockmode]').forEach(b => {
      const on = b.dataset.stockmode === _stockMode[field];
      b.classList.toggle('on', on);
      b.style.background = on ? '#fff' : 'transparent';
      b.style.color = on ? '#0F172A' : '#64748B';
      b.style.fontWeight = on ? '700' : '600';
      b.style.boxShadow = on ? '0 1px 2px rgba(15,23,42,.1)' : 'none';
    });
  });
}
// Cambia el modo de UN campo y convierte su valor para que siga siendo coherente.
function setStockMode(field, mode) {
  if (mode === _stockMode[field]) return;
  const conv = parseFloat((document.getElementById('ins-conversion') || {}).value) || 1;
  const d = conv > 0 ? conv : 1;
  const inp = document.getElementById(field === 'actual' ? 'ins-stock' : 'ins-min');
  if (inp) {
    const cur = parseFloat(inp.value);
    if (!isNaN(cur) && cur !== 0) inp.value = mode === 'use' ? +(cur * d).toFixed(3) : +(cur / d).toFixed(3);
  }
  _stockMode[field] = mode;
  updateStockLabel();
}

// ═══════════════════════════════════════════════════
function abrirEditorInsumo(insId) {
  const ins = insId ? insumos.find(i=>i.id===insId) : null;
  document.getElementById('ins-panel-title').textContent = ins?'Editar insumo':'Nuevo insumo';
  document.getElementById('ins-edit-id').value    = ins?ins.id:'';
  document.getElementById('ins-nombre').value     = ins?ins.nombre:'';
  document.getElementById('ins-precio').value     = ins?ins.precio:'';
  document.getElementById('ins-conversion').value = ins?ins.conversion:'';
  document.getElementById('ins-stock').value      = ins?ins.stock:'';
  document.getElementById('ins-min').value        = ins?ins.min:'';
  togglePrepOn = ins?ins.prep:true;
  toggleManualOn = ins?!!ins.controlManual:false;
  toggleSubOn = ins?!!ins.sub:false;
  toggleVenderBodegaOn = ins?!!ins.venderBodega:false;
  { const s=document.getElementById('ins-servicio'); if (s) s.value = ins?(ins.servicio||''):''; }
  { const a=document.getElementById('ins-aviso-bodega'); if (a) a.value = ins?(ins.avisoBodega||''):''; }
  const catSel = document.getElementById('ins-cat');
  const cats   = [...new Set(insumos.map(i=>i.cat))];
  catSel.innerHTML='<option value="">Seleccionar categoría…</option>'+
    cats.map(c=>`<option value="${c}" ${ins&&ins.cat===c?'selected':''}>${c}</option>`).join('')+
    '<option value="__new__">＋ Nueva categoría…</option>';
  catSel.onchange = onCatSelChange;
  const catNewInp = document.getElementById('ins-cat-new');
  if (catNewInp) { catNewInp.value=''; catNewInp.classList.add('is-hidden'); }
  buildUnitOptions('ins-buy-unit', BASE_BUY_UNITS, ins?.buyUnit || 'unidad');
  buildUnitOptions('ins-use-unit', BASE_USE_UNITS, ins?.useUnit || 'g');
  _stockMode = { actual: 'buy', min: 'buy' };  // el stock guardado siempre está en u.compra
  updateStockLabel();
  updateTogglePrepUI();
  updateToggleManualUI();
  updateToggleSubUI();
  updateToggleVenderBodegaUI();
  document.getElementById('ins-cost-hint').classList.add('is-hidden');
  document.getElementById('btn-ins-eliminar').classList.toggle('is-hidden',!ins);
  renderPorcionesInsumo(ins ? ins.id : null);
  document.getElementById('panel-insumo').classList.remove('is-hidden');
}

// ── Porciones dentro de la ficha del insumo ────────────────────────────
let _porcNueva = false;
let _porcEdit  = null;

function renderPorcionesInsumo(insId) {
  const wrap = document.getElementById('ins-porciones-wrap');
  const host = document.getElementById('ins-porciones-list');
  if (!wrap || !host) return;
  // Un insumo que aun no existe no puede tener porciones.
  wrap.classList.toggle('is-hidden', !insId);
  if (!insId) { _porcNueva = false; _porcEdit = null; return; }

  const ins  = insumos.find(i => i.id === insId);
  const unid = ins ? ins.useUnit : '';
  const cpu  = ins ? costoPorUr(ins) : 0;
  const lista = porcionesDe(insId);

  let filas = '';
  if (!lista.length) {
    filas = '<div style="font-size:12.5px;color:#94A3B8;padding:8px 0">Sin porciones todavia.</div>';
  } else {
    filas = lista.map(function (p) {
      if (_porcEdit === p.id) {
        return '<div style="display:flex;gap:6px;align-items:center;padding:6px 0">'
          + '<input class="iv-input" style="flex:1;font-size:12.5px;padding:6px 8px" value="' + escHtml(p.nombre) + '" data-porcnom="' + p.id + '">'
          + '<input class="iv-input" style="width:90px;font-size:12.5px;padding:6px 8px" type="number" step="any" value="' + p.cantidad + '" data-porccant="' + p.id + '">'
          + '<span style="font-size:11.5px;font-weight:600;color:#64748B;width:34px">' + escHtml(unid) + '</span>'
          + '<button class="iv-btn-sm primary" data-porcok="' + p.id + '">Guardar</button>'
          + '<button class="iv-btn-sm" data-porccancel="1">Cancelar</button>'
          + '</div>';
      }
      return '<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #F1F5F9">'
        + '<div style="flex:1;font-size:12.5px;font-weight:600;color:#0F172A">' + escHtml(p.nombre) + '</div>'
        + '<div style="font-size:12.5px;font-weight:700;color:#0F172A;font-variant-numeric:tabular-nums">' + p.cantidad + ' ' + escHtml(unid) + '</div>'
        + '<div style="font-size:12px;color:#94A3B8;width:74px;text-align:right;font-variant-numeric:tabular-nums">' + ivCOP(p.cantidad * cpu) + '</div>'
        + '<button title="Editar" data-porcedit="' + p.id + '" style="border:none;background:none;cursor:pointer;color:#94A3B8;padding:2px">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>'
        + '<button title="Eliminar" data-porcdel="' + p.id + '" style="border:none;background:none;cursor:pointer;color:#94A3B8;padding:2px">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>'
        + '</div>';
    }).join('');
  }

  let form = '';
  if (_porcNueva) {
    form = '<div style="margin-top:10px;border:1px dashed #CBD5E1;border-radius:10px;padding:10px">'
      + '<div style="display:flex;gap:6px;align-items:center">'
      + '<input class="iv-input" style="flex:1;font-size:12.5px;padding:6px 8px" placeholder="Nombre (ej. personal)" data-porcnuevanom="1">'
      + '<input class="iv-input" style="width:90px;font-size:12.5px;padding:6px 8px" type="number" step="any" placeholder="0" data-porcnuevacant="1">'
      + '<span style="font-size:11.5px;font-weight:600;color:#64748B;width:34px">' + escHtml(unid) + '</span>'
      + '</div><div style="display:flex;gap:6px;margin-top:8px">'
      + '<button class="iv-btn-sm primary" data-porcnuevaok="1">Guardar porcion</button>'
      + '<button class="iv-btn-sm" data-porcnuevacancel="1">Cancelar</button>'
      + '</div></div>';
  } else {
    form = '<button class="iv-btn-ghost sm" style="margin-top:10px" data-porcnueva="1">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + ' Nueva porcion</button>';
  }

  host.innerHTML = filas + form;
  host.dataset.insId = insId;
}

document.addEventListener('click', async function (ev) {
  const t = ev.target;
  if (!t || !t.closest) return;
  const host = document.getElementById('ins-porciones-list');
  const insId = host ? host.dataset.insId : null;

  if (t.closest('[data-porcnueva]'))       { _porcNueva = true;  _porcEdit = null; renderPorcionesInsumo(insId); return; }
  if (t.closest('[data-porcnuevacancel]')) { _porcNueva = false; renderPorcionesInsumo(insId); return; }
  if (t.closest('[data-porccancel]'))      { _porcEdit  = null;  renderPorcionesInsumo(insId); return; }

  const ed = t.closest('[data-porcedit]');
  if (ed) { _porcEdit = ed.dataset.porcedit; _porcNueva = false; renderPorcionesInsumo(insId); return; }

  if (t.closest('[data-porcnuevaok]')) {
    const nom  = document.querySelector('[data-porcnuevanom]');
    const cant = document.querySelector('[data-porcnuevacant]');
    const p = await crearPorcion(insId, nom ? nom.value : '', cant ? cant.value : '');
    if (p) { _porcNueva = false; showToast('\u2713 Porcion creada'); renderPorcionesInsumo(insId); }
    return;
  }

  const ok = t.closest('[data-porcok]');
  if (ok) {
    const id = ok.dataset.porcok;
    const nom  = document.querySelector('[data-porcnom="' + id + '"]');
    const cant = document.querySelector('[data-porccant="' + id + '"]');
    if (await actualizarPorcion(id, nom ? nom.value : '', cant ? cant.value : '')) {
      _porcEdit = null; showToast('\u2713 Porcion actualizada');
      renderPorcionesInsumo(insId); refrescarCosteo(); renderProductos();
    }
    return;
  }

  const del = t.closest('[data-porcdel]');
  if (del) {
    if (await eliminarPorcion(del.dataset.porcdel)) {
      showToast('Porcion eliminada'); renderPorcionesInsumo(insId);
    }
    return;
  }
});
// prompt() no existe en Electron → input inline para escribir la nueva categoría
function onCatSelChange() {
  const inp = document.getElementById('ins-cat-new');
  if (!inp) return;
  const isNew = document.getElementById('ins-cat').value === '__new__';
  inp.classList.toggle('is-hidden', !isNew);
  if (isNew) inp.focus();
}
function setSelectVal(sel,val) {
  for (const opt of sel.options) { if (opt.value===val){opt.selected=true;return;} }
}
function togglePrep() { togglePrepOn=!togglePrepOn; updateTogglePrepUI(); }
function updateTogglePrepUI() {
  document.getElementById('toggle-prep').classList.toggle('on',togglePrepOn);
  const sw=document.getElementById('toggle-prep-sw');
  if (sw) {
    sw.classList.toggle('on',togglePrepOn);
    const lbl=sw.querySelector('.iv-switch-label');
    if (lbl) lbl.textContent=togglePrepOn?'Sí':'No';
  }
}
// Control manual: el insumo no se agota por cantidad; se marca a mano cuando se acaba.
function toggleManual() { toggleManualOn=!toggleManualOn; updateToggleManualUI(); }
function updateToggleManualUI() {
  const box=document.getElementById('toggle-manual'); if (box) box.classList.toggle('on',toggleManualOn);
  const sw=document.getElementById('toggle-manual-sw');
  if (sw) {
    sw.classList.toggle('on',toggleManualOn);
    const lbl=sw.querySelector('.iv-switch-label');
    if (lbl) lbl.textContent=toggleManualOn?'Sí':'No';
  }
}
// Sub-inventario: dos niveles Bodega / En servicio.
function toggleSub() { toggleSubOn=!toggleSubOn; updateToggleSubUI(); }
function updateToggleSubUI() {
  const box=document.getElementById('toggle-sub'); if (box) box.classList.toggle('on',toggleSubOn);
  const sw=document.getElementById('toggle-sub-sw');
  if (sw) { sw.classList.toggle('on',toggleSubOn); const lbl=sw.querySelector('.iv-switch-label'); if (lbl) lbl.textContent=toggleSubOn?'Sí':'No'; }
  const fields=document.getElementById('sub-fields'); if (fields) fields.classList.toggle('is-hidden',!toggleSubOn);
}
function toggleVenderBodega() { toggleVenderBodegaOn=!toggleVenderBodegaOn; updateToggleVenderBodegaUI(); }
function updateToggleVenderBodegaUI() {
  const box=document.getElementById('toggle-venderbodega'); if (box) box.classList.toggle('on',toggleVenderBodegaOn);
  const sw=document.getElementById('toggle-venderbodega-sw');
  if (sw) { sw.classList.toggle('on',toggleVenderBodegaOn); const lbl=sw.querySelector('.iv-switch-label'); if (lbl) lbl.textContent=toggleVenderBodegaOn?'Sí':'No'; }
}
function updateCostHint() {
  const precio=parseFloat(document.getElementById('ins-precio').value)||0;
  const conv=parseFloat(document.getElementById('ins-conversion').value)||0;
  const useUnit=document.getElementById('ins-use-unit').value;
  const buyUnit=document.getElementById('ins-buy-unit').value;
  const hint=document.getElementById('ins-cost-hint');
  const txt=document.getElementById('ins-cost-hint-txt');
  if (precio>0&&conv>0) { txt.textContent=`Costo por ${useUnit}: ${ivCOP(precio/conv)} (${ivCOP(precio)} ÷ ${conv} ${useUnit}/${buyUnit})`; hint.classList.remove('is-hidden'); }
  else { hint.classList.add('is-hidden'); }
}
const CAT_COLORS = {'Materia prima':'#E11D48','Lácteos y quesos':'#F59E0B','Salsas y abarrotes':'#8B5CF6','Bebidas envasadas':'#0EA5E9','Desechables':'#64748B','Aseo y limpieza':'#14B8A6'};
async function guardarInsumo() {
  const nombre  = document.getElementById('ins-nombre').value.trim();
  let   cat     = document.getElementById('ins-cat').value;
  const precio  = parseFloat(document.getElementById('ins-precio').value)||0;
  const conversion=parseFloat(document.getElementById('ins-conversion').value)||1;
  let   stock   = parseFloat(document.getElementById('ins-stock').value)||0;
  let   min     = parseFloat(document.getElementById('ins-min').value)||0;
  // El stock SIEMPRE se guarda en unidad de compra. Cada campo tiene su propio
  // modo: si se digitó en unidad de uso (ej. "24 panes"), se divide por la
  // conversión para convertirlo a unidad de compra.
  {
    const d = conversion > 0 ? conversion : 1;
    if (_stockMode.actual === 'use') stock = stock / d;
    if (_stockMode.min === 'use')    min   = min / d;
  }
  const buyUnit = document.getElementById('ins-buy-unit').value;
  const useUnit = document.getElementById('ins-use-unit').value;
  if (cat==='__new__') { cat=(document.getElementById('ins-cat-new')?.value||'').trim(); if (!cat) { alert('Escribe el nombre de la nueva categoría'); return; } }
  if (!nombre||!cat||precio<=0) { alert('Completa nombre, categoría y precio'); return; }
  const catColor = CAT_COLORS[cat]||'#64748B';
  const editId   = document.getElementById('ins-edit-id').value;
  const _insPrev = editId ? insumos.find(i=>i.id===editId) : null;
  // Sub-inventario
  const servicio = toggleSubOn ? (parseFloat(document.getElementById('ins-servicio')?.value)||0) : 0;
  const avisoBodega = toggleSubOn ? (document.getElementById('ins-aviso-bodega')?.value||'').trim() : '';
  const payload  = { nombre, categoria:cat, cat_color:catColor, prep_requerido:togglePrepOn, control_manual:toggleManualOn, sub_inventario:toggleSubOn, stock_servicio:servicio, vender_bodega:(toggleSubOn && toggleVenderBodegaOn), aviso_bodega:avisoBodega, buy_unit:buyUnit, use_unit:useUnit, precio, conversion, stock, min_stock:min, updated_at:new Date().toISOString() };
  // Si se APAGA el control manual, se limpia el "agotado manual" (para que no quede pegado).
  // Si sigue manual, no se toca aquí (se maneja con el botón rápido "Se acabó / Ya hay").
  if (!toggleManualOn) payload.agotado_manual = false;
  const agotadoManualFinal = toggleManualOn ? (_insPrev ? !!_insPrev.agotadoManual : false) : false;
  const extra = { sub:toggleSubOn, servicio, venderBodega:(toggleSubOn && toggleVenderBodegaOn), avisoBodega };
  if (editId) {
    await iv_sb.from('iv_insumos').update(payload).eq('id',editId);
    const ins=insumos.find(i=>i.id===editId);
    if (ins) Object.assign(ins,{nombre,cat,catColor,prep:togglePrepOn,controlManual:toggleManualOn,agotadoManual:agotadoManualFinal,buyUnit,useUnit,precio,conversion,stock,min,...extra});
  } else {
    const {data,error}=await iv_sb.from('iv_insumos').insert({...payload,tenant_id:tenantId,branch_id:branchId,activo:true}).select().single();
    if (error) { console.error('guardarInsumo:',error); alert('Error al guardar'); return; }
    insumos.push({id:data.id,nombre,cat,catColor,prep:togglePrepOn,controlManual:toggleManualOn,agotadoManual:agotadoManualFinal,buyUnit,useUnit,precio,conversion,stock,min,...extra});
  }
  closePanel('panel-insumo');
  showToast('✓ Insumo guardado');
  renderInsumos(); updateKPIs(); refrescarCosteo();
}
async function eliminarInsumo() {
  const editId=document.getElementById('ins-edit-id').value;
  if (!editId||!confirm('¿Eliminar este insumo?')) return;
  await iv_sb.from('iv_insumos').update({activo:false}).eq('id',editId);
  insumos=insumos.filter(i=>i.id!==editId);
  closePanel('panel-insumo'); showToast('Insumo eliminado');
  renderInsumos(); updateKPIs();
}

// ═══════════════════════════════════════════════════
// RECETAS Y COSTEO
// ═══════════════════════════════════════════════════
let _recetaAbierta = null;   // id del producto cuya receta está abierta en el detalle de costeo

// Refresca la lista de costeo y el detalle abierto tras cambiar datos de un insumo
// (precio/conversión/etc.). Antes, editar un insumo NO actualizaba el costeo que ya
// estaba en pantalla → mostraba valores viejos (ej. salchicha en $15M).
function refrescarCosteo() {
  renderRecetasList();
  const onRecetas = document.getElementById('screen-recetas') && document.getElementById('screen-recetas').classList.contains('on');
  if (onRecetas && _recetaAbierta && productos.find(p => p.id === _recetaAbierta && p.receta && p.receta.length)) {
    const btn = document.querySelector('.iv-rec-listitem[data-receta="' + _recetaAbierta + '"]');
    if (btn) btn.classList.add('on');
    abrirRecetaDetalle(_recetaAbierta);
  }
}

let recFiltroCat = 'todas';
let recFiltroQ   = '';

function setRecCat(cat) { recFiltroCat = cat; renderRecetasList(); }

// Los chips se redibujan en cada render, asi que el listener va en el
// documento y no en cada boton.
document.addEventListener('click', function (ev) {
  const chip = ev.target.closest && ev.target.closest('[data-prodcat],[data-reccat]');
  if (!chip) return;
  if (chip.dataset.prodcat !== undefined) setProdCat(chip.dataset.prodcat);
  else setRecCat(chip.dataset.reccat);
});
function filterRecetas(q) { recFiltroQ = q || ''; renderRecetasList(); }

function renderRecFiltros(conReceta) {
  const cont = document.getElementById('rec-filters');
  if (!cont) return;
  // Solo se ofrecen las categorías que realmente tienen recetas.
  const cats = [];
  for (const p of conReceta) if (!cats.some(v => v.nombre === p.cat)) {
    cats.push({ nombre: p.cat, color: p.catColor || '#64748B' });
  }
  cats.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  let html = `<button class="iv-chip ${recFiltroCat==='todas'?'on':''}" data-reccat="todas">Todas <span class="n">${conReceta.length}</span></button>`;
  if (cats.length) html += '<div class="vsep"></div>';
  for (const cat of cats) {
    const cnt = conReceta.filter(p => p.cat === cat.nombre).length;
    html += `<button class="iv-chip ${recFiltroCat===cat.nombre?'on':''}" data-reccat="${escHtml(cat.nombre)}">
      <span class="iv-catdot" style="background:${cat.color}"></span>${escHtml(cat.nombre)} <span class="n">${cnt}</span>
    </button>`;
  }
  cont.innerHTML = html;
}

function renderRecetasList() {
  const list=document.getElementById('rec-list');
  list.innerHTML='';
  const conReceta=productos.filter(p=>p.receta&&p.receta.length>0)
    .concat(adiciones.filter(a=>a.receta&&a.receta.length>0));
  renderRecFiltros(conReceta);
  if (conReceta.length===0) {
    list.innerHTML=`<div style="padding:24px 16px;text-align:center;color:#94A3B8;font-size:13px">Aún no hay recetas configuradas.<br>Agrega insumos a tus productos.</div>`;
    return;
  }
  const q = recFiltroQ.toLowerCase();
  const visibles = conReceta.filter(p =>
    (recFiltroCat === 'todas' || p.cat === recFiltroCat) &&
    (!q || p.nombre.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q))
  );
  if (visibles.length===0) {
    list.innerHTML=`<div style="padding:24px 16px;text-align:center;color:#94A3B8;font-size:13px">Ninguna receta coincide con el filtro.</div>`;
    return;
  }
  for (const prod of visibles) {
    const res=resumenReceta(prod); const r=res?res.peor:calcReceta(prod); const sem=semaforo(r.fc);
    const btn=document.createElement('button');
    btn.className='iv-rec-listitem'; btn.dataset.receta=prod.id;
    btn.innerHTML=`
      <span style="width:10px;height:10px;border-radius:999px;background:${sem.color};flex-shrink:0"></span>
      <div style="flex:1;min-width:0"><div class="nm">${prod.nombre}</div><div class="ct">${prod.cat}</div></div>
      <span class="fc" style="color:${sem.color}">${(r.fc*100).toFixed(1)}%</span>`;
    btn.onclick=()=>{document.querySelectorAll('.iv-rec-listitem').forEach(b=>b.classList.remove('on'));btn.classList.add('on');abrirRecetaDetalle(prod.id);};
    list.appendChild(btn);
  }
}

// Combinacion visible en el detalle de receta.
let _recetaSel = { prodId: null, presId: null, optSel: {} };

document.addEventListener('click', function (ev) {
  if (!ev.target.closest) return;
  const p = ev.target.closest('[data-recdetpres]');
  if (p) { _recetaSel.presId = p.dataset.recdetpres; abrirRecetaDetalle(_recetaSel.prodId); return; }
  const v = ev.target.closest('[data-recdetvar]');
  if (v) { _recetaSel.optSel = _recetaSel.optSel || {}; _recetaSel.optSel[v.dataset.recdetgrp || '_g'] = v.dataset.recdetvar; abrirRecetaDetalle(_recetaSel.prodId); return; }
});

function abrirRecetaDetalle(prodId) {
  const prod=findRecetable(prodId);
  if (!prod||!prod.receta||prod.receta.length===0) return;
  _recetaAbierta = prodId;
  if (!document.getElementById('screen-recetas').classList.contains('on')) {
    showScreen('recetas');
    setTimeout(()=>{document.querySelectorAll('.iv-rec-listitem').forEach(b=>b.classList.toggle('on',b.dataset.receta===prodId));abrirRecetaDetalle(prodId);},50);
    return;
  }
  document.querySelectorAll('.iv-rec-listitem').forEach(b=>b.classList.toggle('on',b.dataset.receta===prodId));

  // Combinacion que se esta viendo (tamano + una opcion por cada grupo de variable).
  const _pres = presDe(prod), _grupos = gruposDe(prod);
  const _allOps = _grupos.flatMap(g => g.opciones);
  if (_recetaSel.prodId !== prodId) {
    _recetaSel = { prodId, presId: _pres[0].id, optSel: {} };
  }
  if (!_pres.some(p => p.id === _recetaSel.presId)) _recetaSel.presId = _pres[0].id;
  _recetaSel.optSel = _recetaSel.optSel || {};
  _grupos.forEach(g => {
    if (!g.opciones.some(o => o.id === _recetaSel.optSel[g.id])) _recetaSel.optSel[g.id] = g.opciones[0] ? g.opciones[0].id : null;
  });
  const presId = _recetaSel.presId;
  const optIds = _grupos.map(g => _recetaSel.optSel[g.id]).filter(Boolean);

  const r=calcReceta(prod, presId, optIds); const sem=semaforo(r.fc);
  const precioComb = r.precio;
  const fcPct=(r.fc*100).toFixed(1); const netaPct=(r.neta/precioComb*100).toFixed(1);
  const margenPct=(r.margen/precioComb*100).toFixed(1); const opPct=(r.otros/precioComb*100).toFixed(1);

  // Selector de combinacion; una fila por presentacion y por cada grupo.
  let selectorHTML = '';
  if (_pres.length > 1 || _allOps.length > 1) {
    const fila = (label, items, activo, attr, grpId) =>
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
      + '<span style="font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:.04em;min-width:86px">' + escHtml(label) + '</span>'
      + items.map(it => '<button class="iv-chip ' + (it.id === activo ? 'on' : '') + '" '
          + attr + '="' + escHtml(it.id) + '"' + (grpId ? ' data-recdetgrp="' + escHtml(grpId) + '"' : '') + '>' + escHtml(it.name || 'Unico') + '</button>').join('')
      + '</div>';
    selectorHTML = '<div style="margin:0 0 14px">'
      + (_pres.length > 1 ? fila('Presentacion', _pres, presId, 'data-recdetpres', null) : '')
      + _grupos.filter(g => g.opciones.length > 1).map(g => fila(g.name || 'Opcion', g.opciones, _recetaSel.optSel[g.id], 'data-recdetvar', g.id)).join('')
      + '</div>';
  }
  let bannerHTML='';
  if (r.fc <= (params.fc||30)/100) {
    bannerHTML=`<div class="iv-alert okbox"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg><div><div class="at">Plato rentable · ${fcPct}% materia prima (meta ${params.fc}%)</div></div></div>`;
  } else {
    const lvl={Aceptable:{bg:'#FEF9C3',border:'#FDE68A',ink:'#854D0E'},Cuidado:{bg:'#FFEDD5',border:'#FED7AA',ink:'#9A3412'},'No rentable':{bg:'#FEE2E2',border:'#FECACA',ink:'#991B1B'}}[sem.label]||{bg:'#FEE2E2',border:'#FECACA',ink:'#991B1B'};
    bannerHTML=`<div class="iv-alert" style="background:${lvl.bg};border:1px solid ${lvl.border}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${lvl.ink}" stroke-width="2.2" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div><div class="at" style="color:${lvl.ink}">${sem.label} · ${fcPct}% en materia prima</div><div class="ax" style="color:${lvl.ink}">Considera subir el precio a ${ivCOP(Math.ceil(r.sugerido/100)*100)} para llegar al ${params.fc}% de meta.</div></div></div>`;
  }
  let recetaRows='';
  for (const l of prod.receta) {
    if (!lineaAplica(l, optIds)) continue;
    const ins=insumos.find(i=>i.id===l.insId); if (!ins) continue;
    const q=qtyLinea(l, presId); if (q<=0) continue;
    const cpu=costoPorUr(ins); const lineCost=q*cpu*(params.merma?(1+l.merma/100):1);
    const linePct=r.raw>0?(lineCost/r.raw*100).toFixed(1):'0';
    const orig=l.varOpt?' · solo '+escHtml((_allOps.find(o=>o.id===l.varOpt)||{}).name||''):'';
    recetaRows+=`<div class="iv-recipe-row"><div style="flex:1"><div class="iv-recipe-name">${ins.nombre}</div><div class="iv-recipe-sub">${ivCOP(cpu)}/${ins.useUnit} · ${linePct}% del costo${orig}</div></div><div style="width:80px;text-align:center;font-size:13px;font-weight:700">${q} ${ins.useUnit}</div><div class="iv-recipe-cost">${ivCOP(lineCost)}</div></div>`;
  }
  const inf=params.inf/100; const raw6=r.raw*Math.pow(1+inf,0.5); const raw12=r.raw*(1+inf);
  const fc6=raw6/precioComb; const fc12=raw12/precioComb;
  const dot=fc=>fc<=0.30?'#22C55E':fc<=0.38?'#EAB308':fc<=0.45?'#F97316':'#EF4444';
  // El "Precio sugerido" (subir precio) SOLO tiene sentido si la materia prima
  // está POR ENCIMA de la meta. Si el plato ya es rentable (FC <= meta), NUNCA
  // recomendar bajar el precio: mostramos que ya está saludable.
  const metaFrac = (params.fc || 30) / 100;
  const sugeridoRedondo = Math.ceil(r.sugerido/100)*100;
  const suggestCardHTML = (r.fc > metaFrac + 0.0005 && r.sugerido > 0)
    ? `<div class="iv-suggest"><div class="h"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></svg> Precio sugerido</div><div class="v">${ivCOP(sugeridoRedondo)}</div><div class="x">Sube el precio para que la materia prima baje al ${params.fc}% (tu meta).</div><button class="iv-btn-primary" style="margin-top:12px;width:100%;justify-content:center" onclick="aplicarPrecioSugerido('${prod.id}',${sugeridoRedondo})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aplicar ${ivCOP(sugeridoRedondo)}</button></div>`
    : `<div class="iv-suggest" style="background:#F0FDF4;border-color:#BBF7D0"><div class="h" style="color:#16A34A"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Precio saludable</div><div class="v" style="color:#16A34A">${ivCOP(precioComb)}</div><div class="x">Tu materia prima (${fcPct}%) está por debajo de tu meta del ${params.fc}%. El precio actual es rentable — no necesitas cambiarlo.</div></div>`;
  // Desglose de la plantilla activa: materia prima (REAL), costos (planeados), ganancia (residual real).
  const _plA = plantillaActiva();
  let metricsHTML;
  if (_plA && _plA.cats && _plA.cats.length) {
    const costoPlan = _plA.cats.filter(c => c.tipo === 'costo').reduce((s, c) => s + precioComb * (parseFloat(c.pct) || 0) / 100, 0);
    const gananciaReal = precioComb - r.raw - costoPlan;
    metricsHTML = '<div class="iv-metrics">' + _plA.cats.map(c => {
      if (c.tipo === 'materia')
        return `<div class="iv-metric"><div class="ml">${escHtml(c.nombre)}</div><div class="mv" style="color:${sem.color}">${ivCOP(r.raw)}</div><div class="ms">${fcPct}% real · meta ${c.pct}%</div><div class="iv-bar" style="margin-top:8px"><i style="width:${Math.min(100, r.fc * 100)}%;background:${sem.color}"></i></div></div>`;
      if (c.tipo === 'ganancia') {
        const gp = precioComb > 0 ? (gananciaReal / precioComb * 100) : 0;
        return `<div class="iv-metric hl"><div class="ml">${escHtml(c.nombre)}</div><div class="mv" style="color:${gananciaReal >= 0 ? '#16A34A' : '#DC2626'}">${ivCOP(gananciaReal)}</div><div class="ms">${gp.toFixed(1)}% real · meta ${c.pct}%</div></div>`;
      }
      const cval = precioComb * (parseFloat(c.pct) || 0) / 100;
      return `<div class="iv-metric"><div class="ml">${escHtml(c.nombre)}</div><div class="mv">${ivCOP(cval)}</div><div class="ms">${c.pct}% del precio (planeado)</div></div>`;
    }).join('') + '</div>';
  } else {
    metricsHTML = `<div class="iv-metrics"><div class="iv-metric"><div class="ml">Materia prima</div><div class="mv" style="color:${sem.color}">${ivCOP(r.raw)}</div><div class="ms">${fcPct}% del precio</div><div class="iv-bar" style="margin-top:8px"><i style="width:${Math.min(100, r.fc * 100)}%;background:${sem.color}"></i></div></div><div class="iv-metric"><div class="ml">Margen contribución</div><div class="mv">${ivCOP(r.margen)}</div><div class="ms">${margenPct}%</div></div><div class="iv-metric"><div class="ml">Otros costos op.</div><div class="mv">${ivCOP(r.otros)}</div><div class="ms">${opPct}%</div></div><div class="iv-metric hl"><div class="ml">Ganancia neta</div><div class="mv" style="color:#16A34A">${ivCOP(r.neta)}</div><div class="ms">${netaPct}%</div></div></div>`;
  }
  document.getElementById('receta-detalle').innerHTML=`
    <div class="iv-rec-head"><div><div class="iv-prod-cat">${prod.cat}</div><div class="iv-rec-title">${prod.nombre}</div></div><div style="text-align:right"><div class="iv-rec-pricelbl">Precio de venta</div><div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums">${ivCOP(precioComb)}</div></div></div>
    <div style="display:flex;justify-content:flex-end;margin:-2px 0 12px"><button class="iv-btn-ghost sm" onclick="abrirEditorInsumoReceta('${prod.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg> Editar receta</button></div>
    ${selectorHTML}
    ${bannerHTML}
    ${metricsHTML}
    <div class="iv-recipe"><div class="iv-recipe-head"><span style="flex:1">Ingrediente</span><span style="width:80px;text-align:center">Cantidad</span><span>Costo</span></div>${recetaRows}<div class="iv-recipe-total"><span style="font-size:12.5px;font-weight:700;color:#475569">Costo total materia prima</span><span style="font-size:15px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${ivCOP(r.raw)}</span></div></div>
    <div class="iv-cards2">
      ${suggestCardHTML}
      <div class="iv-proj"><div class="h">Proyección · inflación ${params.inf}%/año</div><div style="display:flex;flex-direction:column;gap:10px"><div class="iv-proj-row base"><span class="pl">Hoy</span><span class="praw">${ivCOP(r.raw)}</span><span class="pfc"><span class="d" style="background:${dot(r.fc)}"></span><span class="vv" style="color:${dot(r.fc)}">${fcPct}%</span></span></div><div class="iv-proj-row"><span class="pl">+6 meses</span><span class="praw">${ivCOP(raw6)}</span><span class="pfc"><span class="d" style="background:${dot(fc6)}"></span><span class="vv" style="color:${dot(fc6)}">${(fc6*100).toFixed(1)}%</span></span></div><div class="iv-proj-row"><span class="pl">+12 meses</span><span class="praw">${ivCOP(raw12)}</span><span class="pfc"><span class="d" style="background:${dot(fc12)}"></span><span class="vv" style="color:${dot(fc12)}">${(fc12*100).toFixed(1)}%</span></span></div></div><div class="iv-proj-note">Si mantienes el precio actual, la materia prima subirá y tu margen bajará.</div></div>
    </div>`;
}

function aplicarPrecioSugerido(prodId,precio) {
  const prod=findRecetable(prodId); if (!prod) return;
  prod.precio=precio; abrirRecetaDetalle(prodId);
  showToast('✓ Precio actualizado a '+ivCOP(precio));
}

// ═══════════════════════════════════════════════════
// NUEVA ADICIÓN (vincular opción de modificador con insumos)
// ═══════════════════════════════════════════════════
function abrirNuevaAdicion() {
  if (!modGroups.length) {
    showToast('Aún no has creado grupos de modificadores', 'info');
    return;
  }
  const ov = document.createElement('div');
  ov.id = 'adic-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `<div id="adic-box" style="background:#fff;border-radius:16px;padding:20px 22px;width:420px;max-width:94vw;font-family:'DM Sans',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35);max-height:86vh;overflow:auto"></div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  renderAdicPaso1();
}
function _adicRow(onclick, titulo, sub, tick) {
  return `<button onclick="${onclick}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:13px 14px;border:1px solid #E2E8F0;border-radius:11px;background:#fff;cursor:pointer;text-align:left;margin-bottom:8px">
    <span style="min-width:0"><span style="display:block;font-size:13.5px;font-weight:700;color:#0F172A">${titulo}</span><span style="font-size:11.5px;color:#94A3B8">${sub}</span></span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${tick?'#22C55E':'#94A3B8'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${tick?'<polyline points="20 6 9 17 4 12"/>':'<polyline points="9 18 15 12 9 6"/>'}</svg>
  </button>`;
}
function renderAdicPaso1() {
  const box = document.getElementById('adic-box'); if (!box) return;
  const rows = modGroups.map(g =>
    _adicRow("renderAdicPaso2('" + g.id + "')", escHtml(g.name), (g.options||[]).length + ' opciones', false)
  ).join('');
  box.innerHTML = `
    <div style="font-size:16px;font-weight:800;color:#0F172A">Nueva adición</div>
    <div style="font-size:12.5px;color:#64748B;margin:5px 0 16px;line-height:1.5">Elige el <b>grupo de modificadores</b> donde está la adición que quieres costear.</div>
    ${rows || '<div style="color:#94A3B8;font-size:13px;padding:12px 0">No hay grupos de modificadores.</div>'}
    <div style="display:flex;margin-top:8px"><button style="flex:1;padding:11px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer" onclick="document.getElementById('adic-ov').remove()">Cancelar</button></div>`;
}
function renderAdicPaso2(grpId) {
  const box = document.getElementById('adic-box'); if (!box) return;
  const g = modGroups.find(x => x.id === grpId); if (!g) return;
  const rows = (g.options || []).map(o => {
    const ya = recetas.some(r => r.mod_option_id === o.id) || adiciones.some(a => a.id === o.id && a.receta && a.receta.length);
    return _adicRow("crearAdicionDesde('" + escHtml(o.id) + "')", escHtml(o.name),
      ivCOP(parseFloat(o.price)||0) + (ya ? ' · ya tiene receta' : ''), ya);
  }).join('');
  box.innerHTML = `
    <button onclick="renderAdicPaso1()" style="display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:#64748B;font-size:12.5px;font-weight:600;cursor:pointer;padding:0;margin-bottom:10px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> ${escHtml(g.name)}</button>
    <div style="font-size:16px;font-weight:800;color:#0F172A">Elige el modificador</div>
    <div style="font-size:12.5px;color:#64748B;margin:5px 0 16px;line-height:1.5">Selecciona la adición que vas a vincular con sus insumos.</div>
    ${rows || '<div style="color:#94A3B8;font-size:13px;padding:12px 0">Este grupo no tiene opciones.</div>'}`;
}
function crearAdicionDesde(optId) {
  document.getElementById('adic-ov')?.remove();
  let ad = adiciones.find(a => a.id === optId);
  if (!ad) {
    const info = modOptInfo(optId) || { nombre: 'Adición', precio: 0, grupo: 'Adiciones' };
    ad = { id: optId, esAdicion: true, modOptionId: optId, nombre: info.nombre,
           cat: 'Adición · ' + info.grupo, precio: info.precio,
           pres: [], variantes: null, grupos: [], receta: [] };
    adiciones.push(ad);
  }
  abrirEditorInsumoReceta(optId);
}

// ═══════════════════════════════════════════════════
// PARÁMETROS
// ═══════════════════════════════════════════════════
function toggleVentaSinInv() {
  ventaSinInvOn = !ventaSinInvOn;
  document.getElementById('toggle-vsi')?.classList.toggle('on', ventaSinInvOn);
  const sw = document.getElementById('toggle-vsi-sw');
  if (sw) { sw.classList.toggle('on', ventaSinInvOn); const lbl = sw.querySelector('.iv-switch-label'); if (lbl) lbl.textContent = ventaSinInvOn ? 'Sí' : 'No'; }
}
function toggleMerma() {
  mermaOn=!mermaOn; params.merma=mermaOn;
  document.getElementById('toggle-merma').classList.toggle('on',mermaOn);
  const sw=document.getElementById('toggle-merma-sw');
  if (sw) { sw.classList.toggle('on',mermaOn); const lbl=sw.querySelector('.iv-switch-label'); if(lbl) lbl.textContent=mermaOn?'Sí':'No'; }
}
async function guardarParams() {
  params.fc=parseInt(document.getElementById('param-fc').value);
  params.op=parseInt(document.getElementById('param-op').value);
  params.inf=parseInt(document.getElementById('param-inf').value);
  params.merma=mermaOn;
  await iv_sb.from('iv_params').upsert({tenant_id:tenantId,branch_id:branchId,fc_target:params.fc,op_cost:params.op,inflation:params.inf,merma_enabled:params.merma,updated_at:new Date().toISOString()},{onConflict:'branch_id'});
  await saveOpConfigPatch({ ventaSinInventario: ventaSinInvOn }); // política de venta sin inventario (sincroniza a las pantallas de pedido)
  closePanel('panel-params');
  showToast('✓ Parámetros actualizados');
  renderRecetasList(); renderProductos();
}

// ═══════════════════════════════════════════════════
// UNIDADES
// ═══════════════════════════════════════════════════
function renderUnidades() {
  const card=document.getElementById('units-card');
  document.getElementById('units-count').textContent=customUnits.length;
  // prompt() no existe en Electron → formulario inline para crear la unidad
  const newFormHTML = _unitNewForm
    ? `<div class="iv-unit-row"><span class="iv-unit-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></span><input id="iv-unit-new-inp" placeholder="Nombre (ej. porción, bandeja)" style="font-family:inherit;font-size:12.5px;border:1px solid #C4B5FD;border-radius:7px;padding:5px 8px;width:190px;outline:none" onkeydown="if(event.key==='Enter')crearNuevaUnidad();if(event.key==='Escape')cancelarNuevaUnidad()"><button type="button" onclick="crearNuevaUnidad()" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:#5B6BFF;color:#fff;padding:6px 11px;border-radius:8px;cursor:pointer">Crear</button><button type="button" onclick="cancelarNuevaUnidad()" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:none;color:#94A3B8;padding:6px 4px;cursor:pointer">Cancelar</button></div>`
    : '';
  if (customUnits.length===0) {
    if (newFormHTML) { card.innerHTML=newFormHTML; return; }
    card.innerHTML=`<div class="iv-units-emptywrap"><div class="iv-units-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></div><div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:6px">Sin unidades propias</div><p style="font-size:12px;color:#94A3B8;max-width:280px;margin:0 auto">Crea unidades personalizadas como "porción", "bandeja" o cualquier medida específica de tu restaurante.</p></div>`;
    return;
  }
  card.innerHTML=customUnits.map(u=>{
    const uses=insumos.filter(i=>i.buyUnit===u.nombre||i.useUnit===u.nombre).length;
    // prompt() no existe en Electron → edición inline en la fila
    if (_unitEditing===u.nombre) {
      return `<div class="iv-unit-row"><span class="iv-unit-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></span><input id="iv-unit-edit-inp" value="${u.nombre}" style="font-family:inherit;font-size:12.5px;border:1px solid #C4B5FD;border-radius:7px;padding:5px 8px;width:160px;outline:none" onkeydown="if(event.key==='Enter')guardarEditUnidad();if(event.key==='Escape')cancelarEditUnidad()"><button type="button" onclick="guardarEditUnidad()" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:#5B6BFF;color:#fff;padding:6px 11px;border-radius:8px;cursor:pointer">Guardar</button><button type="button" onclick="cancelarEditUnidad()" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:none;color:#94A3B8;padding:6px 4px;cursor:pointer">Cancelar</button></div>`;
    }
    return `<div class="iv-unit-row"><span class="iv-unit-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></span><span class="iv-unit-name">${u.nombre}</span>${uses>0?`<span class="iv-unit-use">En uso · ${uses} insumos</span>`:'<span class="iv-unit-nouse">Sin uso</span>'}<button class="iv-row-btn btn-edit-unit" onclick="editarUnidad('${u.nombre}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button><button class="iv-row-btn danger btn-del-unit" onclick="eliminarUnidad('${u.nombre}')" ${uses>0?'disabled style="opacity:.4;cursor:not-allowed"':''}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`;
  }).join('')+newFormHTML;
}
function eliminarUnidad(nombre) { customUnits=customUnits.filter(u=>u.nombre!==nombre); renderUnidades(); saveCustomUnits(); showToast('Unidad eliminada'); }
// prompt() no existe en Electron → edición inline en la fila de la unidad
let _unitEditing = null;
function editarUnidad(nombre) {
  _unitEditing=nombre; _unitNewForm=false; renderUnidades();
  const inp=document.getElementById('iv-unit-edit-inp');
  if (inp) { inp.focus(); inp.select(); }
}
function cancelarEditUnidad() { _unitEditing=null; renderUnidades(); }
function guardarEditUnidad() {
  const inp=document.getElementById('iv-unit-edit-inp');
  const nuevo=(inp?.value||'').trim();
  if (!nuevo) { inp?.focus(); return; }
  const viejo=_unitEditing;
  if (nuevo!==viejo) {
    if (customUnits.find(u=>u.nombre===nuevo)) { alert('Esa unidad ya existe'); inp?.focus(); return; }
    customUnits=customUnits.map(u=>u.nombre===viejo?{...u,nombre:nuevo}:u);
    saveCustomUnits();
  }
  _unitEditing=null;
  renderUnidades();
}

// ═══════════════════════════════════════════════════
// PANELES
// ═══════════════════════════════════════════════════
function closePanel(id) { document.getElementById(id)?.classList.add('is-hidden'); }
document.querySelectorAll('.iv-overlay').forEach(overlay=>{
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.add('is-hidden');});
});

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
let toastTimer=null;
function showToast(msg) {
  const toast=document.getElementById('iv-toast');
  toast.textContent=msg; toast.classList.remove('is-hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.add('is-hidden'),3000);
}

// ═══════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════
document.querySelectorAll('.iv-tab').forEach(tab=>{
  tab.addEventListener('click',()=>showScreen(tab.dataset.screen));
});
document.getElementById('nav-unidades')?.addEventListener('click',()=>showScreen('unidades'));
document.getElementById('nav-plantillas')?.addEventListener('click',()=>showScreen('plantillas'));
document.getElementById('nav-params')?.addEventListener('click',()=>{
  // Sincronizar la UI del panel con lo guardado (antes mostraba valores fijos del HTML).
  const setSlider=(id,val)=>{ const s=document.getElementById(id); if(s){s.value=val; const v=document.getElementById(id+'-val'); if(v) v.textContent=val+'%';} };
  setSlider('param-fc',params.fc); setSlider('param-op',params.op); setSlider('param-inf',params.inf);
  const syncTog=(tid,sid,on)=>{ document.getElementById(tid)?.classList.toggle('on',on); const sw=document.getElementById(sid); if(sw){sw.classList.toggle('on',on); const l=sw.querySelector('.iv-switch-label'); if(l) l.textContent=on?'Sí':'No';} };
  syncTog('toggle-merma','toggle-merma-sw',mermaOn);
  syncTog('toggle-vsi','toggle-vsi-sw',ventaSinInvOn);
  document.getElementById('panel-params').classList.remove('is-hidden');
});
document.getElementById('btn-nuevo-insumo')?.addEventListener('click',()=>abrirEditorInsumo(null));
document.querySelectorAll('.ins-stockmode').forEach(function(seg){
  seg.addEventListener('click',function(ev){
    const b=ev.target.closest('[data-stockmode]'); if (b) setStockMode(seg.dataset.for, b.dataset.stockmode);
  });
});
// Si cambian la unidad de compra o de receta, refrescar las etiquetas del stock.
document.getElementById('ins-buy-unit')?.addEventListener('change', updateStockLabel);
document.getElementById('ins-use-unit')?.addEventListener('change', updateStockLabel);
document.getElementById('btn-registrar-compra')?.addEventListener('click',function(){
  // Registrar compra: permiso inventario.compras; sin permiso pide PIN.
  if(window.posGuard) window.posGuard('inventario.compras',abrirCompra,'Registrar compras requiere permiso de administrador.');
  else abrirCompra();
});
// prompt() no existe en Electron → formulario inline dentro de la tarjeta de unidades
let _unitNewForm = false;
document.getElementById('btn-nueva-unidad')?.addEventListener('click',()=>{
  _unitNewForm=true; _unitEditing=null; renderUnidades();
  document.getElementById('iv-unit-new-inp')?.focus();
});
function cancelarNuevaUnidad() { _unitNewForm=false; renderUnidades(); }
function crearNuevaUnidad() {
  const inp=document.getElementById('iv-unit-new-inp');
  const nombre=(inp?.value||'').trim();
  if (!nombre) { inp?.focus(); return; }
  if (customUnits.find(u=>u.nombre===nombre)){alert('Esa unidad ya existe');inp?.focus();return;}
  customUnits.push({nombre});
  _unitNewForm=false;
  renderUnidades();
  saveCustomUnits();
  showToast('✓ Unidad "'+nombre+'" creada');
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
loadData();

// ═══════════════════════════════════════════════════
// MODAL IA RECETA
// ═══════════════════════════════════════════════════

const EDGE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/analyze-menu';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

const IA_MSGS = [
  'Identificando ingredientes de la descripción…',
  'Expandiendo los ingredientes de la Base…',
  'Calculando cantidades típicas por porción…',
  'Sugiriendo unidades de medida…',
  'Verificando ingredientes existentes en tu inventario…',
];

let iaState = {
  prodId:        null,
  prod:          null,
  baseIngrs:     [],     // string[] de la base
  iaIngredients: [],     // resultado del GPT: [{name,qty,unit,category,isBase,existingName,nota}]
  dedupChoices:  {},     // {name: 'link'|'new'} para ingredientes con existingName
};
let iaMsgTimer = null;

// ── Abrir modal ────────────────────────────────────
async function generarRecetaIA(prodId) {
  const prod = productos.find(p => p.id === prodId);
  if (!prod) return;

  // Reset state
  iaState = { prodId, prod, baseIngrs: [], iaIngredients: [], dedupChoices: {} };

  // Poblar banner del producto
  document.getElementById('ia-prod-cat').textContent  = prod.cat;
  document.getElementById('ia-prod-name').textContent = prod.nombre;
  document.getElementById('ia-prod-desc').textContent = prod.descripcion || '(sin descripción)';

  // Ir a paso 1
  iaSetStep(1);

  // Mostrar modal
  document.getElementById('panel-ia-receta').classList.remove('is-hidden');

  // 1. Obtener descripcion fresca del producto (directo por ID, sin filtros tenant/branch)
  let freshDesc = prod.descripcion || '';
  try {
    const { data: pRow } = await iv_sb
      .from('pos_products')
      .select('description')
      .eq('id', prodId)
      .single();
    if (pRow && pRow.description) freshDesc = pRow.description;
  } catch(e) { console.warn('[IA] desc fetch:', e); }
  document.getElementById('ia-prod-desc').textContent = freshDesc || '(sin descripción)';
  console.log('[IA] descripcion:', freshDesc);

  // 2. Obtener base del producto desde pos_bases
  try {
    const { data: bases, error: bErr } = await iv_sb
      .from('pos_bases')
      .select('name, ingredients, product_ids');

    if (bErr) console.warn('[IA] pos_bases error:', bErr);
    const baseRow = (bases || []).find(b =>
      Array.isArray(b.product_ids) && b.product_ids.includes(prodId)
    );
    iaState.baseIngrs = baseRow ? (baseRow.ingredients || []) : [];
    console.log('[IA] base encontrada:', baseRow ? baseRow.name : 'ninguna', '→', iaState.baseIngrs);
  } catch(e) {
    console.warn('[IA] No se pudo cargar pos_bases:', e);
  }

  // Iniciar mensajes rotatorios
  let msgIdx = 0;
  const msgEl = document.getElementById('ia-msg');
  if (iaMsgTimer) clearInterval(iaMsgTimer);
  iaMsgTimer = setInterval(() => {
    msgIdx = (msgIdx + 1) % IA_MSGS.length;
    if (msgEl) { msgEl.style.opacity = '0'; setTimeout(() => { if(msgEl) { msgEl.textContent = IA_MSGS[msgIdx]; msgEl.style.opacity = '1'; } }, 200); }
  }, 2200);

  // 3. Llamar Edge Function
  try {
    const body = {
      mode:            'recipe',
      productName:     prod.nombre,
      description:     freshDesc,
      baseIngredients: iaState.baseIngrs,
      existingInsumos: insumos.map(i => i.nombre),
    };
    console.log('[IA] enviando a Edge Function:', JSON.stringify(body).slice(0,300));
    const res  = await fetch(EDGE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    console.log('[IA] respuesta Edge Function:', JSON.stringify(data).slice(0,500));
    if (data.error) throw new Error(data.error);
    iaState.iaIngredients = data.ingredients || [];
    console.log('[IA] ingredientes recibidos:', iaState.iaIngredients.length);
  } catch(e) {
    clearInterval(iaMsgTimer);
    showToast('Error al analizar con IA: ' + e.message);
    closeIAReceta();
    return;
  }

  clearInterval(iaMsgTimer);

  // Si no hay ingredientes
  if (!iaState.iaIngredients.length) {
    showToast('La IA no detectó ingredientes. Revisa la descripción del producto.');
    closeIAReceta();
    return;
  }

  // Ir a paso 2
  iaSetStep(2);
  iaRenderPaso2();
}

// ── Paso 2: Revisar medidas ────────────────────────
function iaRenderPaso2() {
  const UNITS = ['g','kg','ml','l','unidad','porción','cucharada','cucharadita','taza','rodaja','trozo','paquete','lata','sobre'];
  const list  = document.getElementById('ia-ingr-list');
  list.innerHTML = '';

  for (let i = 0; i < iaState.iaIngredients.length; i++) {
    const ing  = iaState.iaIngredients[i];
    const row  = document.createElement('div');
    row.className = 'ia-ingr-row' + (ing.isBase ? ' is-base' : '');

    const badgeType = ing.isBase ? 'base' : 'extra';
    const badgeTxt  = ing.isBase ? 'B'    : '+';

    const unitOpts = UNITS.map(u => `<option value="${u}" ${u===ing.unit?'selected':''}>${u}</option>`).join('');

    row.innerHTML = `
      <span class="ia-ingr-badge ${badgeType}">${badgeTxt}</span>
      <div>
        <input class="ia-ingr-name-input" placeholder="Nombre del ingrediente"
               oninput="iaSetIngrName(${i}, this.value)">
        ${ing.nota ? `<div class="ia-ingr-nota">⚡ ${ing.nota}</div>` : ''}
      </div>
      <input  class="ia-ingr-qty"  type="number" min="0" step="any" value="${ing.qty}"
              oninput="iaState.iaIngredients[${i}].qty=parseFloat(this.value)||0">
      <select class="ia-ingr-unit" onchange="iaState.iaIngredients[${i}].unit=this.value">
        ${unitOpts}
      </select>
      <button class="ia-ingr-del" title="Quitar ingrediente" onclick="iaDeleteIngr(${i})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>`;

    // Asignar el nombre por propiedad (evita problemas de escape en el atributo)
    list.appendChild(row);
    const nameInp = row.querySelector('.ia-ingr-name-input');
    if (nameInp) nameInp.value = ing.name || '';
  }

  // Mostrar botón continuar
  document.getElementById('ia-btn-next').classList.remove('is-hidden');
  document.getElementById('ia-btn-save').classList.add('is-hidden');
}

// Editar el nombre de un ingrediente (corrige errores de la IA o nombra uno nuevo).
// Al cambiar el nombre limpiamos existingName para que al guardar se re-empareje
// por el nombre nuevo (o se cree un insumo nuevo si no existe).
function iaSetIngrName(i, v) {
  if (!iaState.iaIngredients[i]) return;
  iaState.iaIngredients[i].name = v;
  iaState.iaIngredients[i].existingName = null;
}

// Quitar un ingrediente sugerido por la IA que esté mal.
function iaDeleteIngr(i) {
  iaState.iaIngredients.splice(i, 1);
  iaRenderPaso2();
}

// Agregar un ingrediente en blanco (lo que la IA no detectó). Al guardar, si el
// nombre coincide con un insumo existente se vincula; si no, se crea nuevo.
function iaAddIngr() {
  iaState.iaIngredients.push({ name: '', qty: 1, unit: 'g', isBase: false, category: 'Materia prima' });
  iaRenderPaso2();
  // Enfocar el nombre del ingrediente recién agregado
  const rows = document.querySelectorAll('#ia-ingr-list .ia-ingr-name-input');
  const last = rows[rows.length - 1];
  if (last) last.focus();
}

// ── Paso 3: Deduplicación ──────────────────────────
function iaRenderPaso3() {
  const withMatch = iaState.iaIngredients.filter(ing => ing.existingName);
  const list      = document.getElementById('ia-dedup-list');
  list.innerHTML  = '';

  if (!withMatch.length) {
    // Nada que deduplicar → guardar directo
    iaGuardarReceta();
    return;
  }

  for (const ing of withMatch) {
    iaState.dedupChoices[ing.name] = 'link'; // default: vincular al existente
    const row = document.createElement('div');
    row.className = 'ia-dedup-row';
    row.innerHTML = `
      <div class="ia-dedup-label">Ingrediente detectado</div>
      <div class="ia-dedup-ingr">${ing.name}</div>
      <div class="ia-dedup-match">Ya existe como: <strong>${ing.existingName}</strong></div>
      <div class="ia-dedup-opts">
        <button class="ia-dedup-btn link sel" id="dedup-link-${CSS.escape(ing.name)}"
          onclick="iaToggleDedup('${ing.name}','link')">
          Vincular al existente
        </button>
        <button class="ia-dedup-btn new" id="dedup-new-${CSS.escape(ing.name)}"
          onclick="iaToggleDedup('${ing.name}','new')">
          Crear nuevo insumo
        </button>
      </div>`;
    list.appendChild(row);
  }

  document.getElementById('ia-btn-next').classList.add('is-hidden');
  document.getElementById('ia-btn-save').classList.remove('is-hidden');
}

function iaToggleDedup(name, choice) {
  iaState.dedupChoices[name] = choice;
  const linkBtn = document.getElementById('dedup-link-' + CSS.escape(name));
  const newBtn  = document.getElementById('dedup-new-'  + CSS.escape(name));
  if (linkBtn) linkBtn.classList.toggle('sel', choice === 'link');
  if (newBtn)  newBtn.classList.toggle('sel',  choice === 'new');
}

// ── Navegación entre pasos ─────────────────────────
function iaSetStep(n) {
  [1,2,3].forEach(i => {
    const step  = document.getElementById('ia-step-' + i);
    const dot   = document.getElementById('iadot-' + i);
    if (step) step.classList.toggle('is-hidden', i !== n);
    if (dot) {
      dot.className = 'ia-step-dot' + (i < n ? ' done' : i === n ? ' active' : '');
      dot.textContent = i < n
        ? '✓'
        : String(i);
    }
    const line = document.getElementById('iadot-line-' + i);
    if (line) line.classList.toggle('done', i < n);
  });

  const titles = { 1: 'Analizando receta', 2: 'Confirma las medidas', 3: 'Ingredientes existentes' };
  document.getElementById('ia-head-title').textContent = titles[n] || '';
}

function iaNext() {
  if (document.getElementById('ia-step-2').classList.contains('is-hidden')) return;
  // Descartar filas en blanco (ingredientes agregados sin nombre) y limpiar espacios
  iaState.iaIngredients = iaState.iaIngredients
    .map(ing => ({ ...ing, name: (ing.name || '').trim() }))
    .filter(ing => ing.name);
  if (!iaState.iaIngredients.length) { showToast('Agrega al menos un ingrediente'); return; }
  // Pasamos de paso 2 → paso 3
  iaSetStep(3);
  iaRenderPaso3();
}

// ── Guardar receta ─────────────────────────────────
// La IA todavia genera una sola cantidad: se replica en todos los tamanos
// y luego se ajusta en el editor.
function _iaCantidades(q) {
  const prod = productos.find(p => p.id === iaState.prodId);
  const out = {};
  for (const p of presDe(prod || { pres: [] })) out[p.id] = { q: q };
  return out;
}

async function iaGuardarReceta() {
  if (!iaState.prodId) return;
  document.getElementById('ia-btn-save').disabled = true;
  document.getElementById('ia-btn-save').textContent = 'Guardando…';

  const newInsumosToCreate = [];
  const recetaLinks        = [];  // {insId, qty, unit}

  for (const ing of iaState.iaIngredients) {
    const choice = iaState.dedupChoices[ing.name] || (ing.existingName ? 'link' : 'new');

    if (ing.existingName && choice === 'link') {
      // Vincular al insumo existente
      const ins = insumos.find(i => i.nombre === ing.existingName);
      if (ins) recetaLinks.push({ insId: ins.id, qty: ing.qty, unit: ing.unit });

    } else {
      // Verificar si ya existe por nombre exacto (por si la IA no detectó existingName)
      const existing = insumos.find(i => i.nombre.toLowerCase() === ing.name.toLowerCase());
      if (existing) {
        recetaLinks.push({ insId: existing.id, qty: ing.qty, unit: ing.unit });
      } else {
        // Crear nuevo insumo
        newInsumosToCreate.push(ing);
      }
    }
  }

  // Crear insumos nuevos
  const CAT_COLORS_LOCAL = {
    'Materia prima': '#E11D48', 'Lácteos y quesos': '#F59E0B',
    'Salsas y abarrotes': '#8B5CF6', 'Bebidas envasadas': '#0EA5E9',
    'Desechables': '#64748B', 'Aseo y limpieza': '#14B8A6',
  };

  for (const ing of newInsumosToCreate) {
    const catColor = CAT_COLORS_LOCAL[ing.category] || '#64748B';
    const payload  = {
      tenant_id: tenantId, branch_id: branchId, activo: true,
      nombre:    ing.name,
      categoria: ing.category || 'Materia prima',
      cat_color: catColor,
      prep_requerido: true,
      buy_unit:  ing.unit, use_unit: ing.unit,
      precio:    0, conversion: 1, stock: 0, min_stock: 0,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await iv_sb.from('iv_insumos').insert(payload).select().single();
    if (error) { console.error('[IA] crear insumo:', error); continue; }
    const newIns = {
      id: data.id, nombre: ing.name, cat: ing.category || 'Materia prima',
      catColor, prep: true, buyUnit: ing.unit, useUnit: ing.unit,
      precio: 0, conversion: 1, stock: 0, min: 0,
    };
    insumos.push(newIns);
    recetaLinks.push({ insId: data.id, qty: ing.qty, unit: ing.unit });
  }

  // Borrar receta anterior si existía
  await iv_sb.from('iv_recetas').delete().eq('product_id', iaState.prodId);

  // Insertar nuevas líneas de receta
  const recetaRows = recetaLinks.map(l => ({
    tenant_id:  tenantId, branch_id: branchId,
    product_id: iaState.prodId,
    insumo_id:  l.insId,
    cantidad:   l.qty,
    cantidades: _iaCantidades(l.qty),
    merma:      0,
    updated_at: new Date().toISOString(),
  }));

  if (recetaRows.length) {
    const { error } = await iv_sb.from('iv_recetas').insert(recetaRows);
    if (error) { console.error('[IA] guardar receta:', error); showToast('Error al guardar receta'); return; }
  }

  // Actualizar estado local
  const prod   = productos.find(p => p.id === iaState.prodId);
  if (prod) {
    prod.receta = recetaLinks.map(l => {
      const qty = {}, porc = {}, manual = {};
      for (const p of presDe(prod)) { qty[p.id] = l.qty; porc[p.id] = null; manual[p.id] = true; }
      return { insId: l.insId, merma: 0, varOpt: null, qty, porc, manual };
    });
    // También actualizar descripcion local si no existía
    if (!prod.descripcion) {
      const dbProd = await iv_sb.from('pos_products').select('description').eq('id', iaState.prodId).single();
      if (dbProd.data) prod.descripcion = dbProd.data.description;
    }
  }

  closeIAReceta();
  showToast('✓ Receta generada con ' + recetaLinks.length + ' ingredientes');
  updateTabBadges();
  renderProductos();
  updateKPIs();
}

// ── Cerrar modal ───────────────────────────────────
function closeIAReceta() {
  document.getElementById('panel-ia-receta').classList.add('is-hidden');
  if (iaMsgTimer) { clearInterval(iaMsgTimer); iaMsgTimer = null; }
  document.getElementById('ia-btn-next').classList.add('is-hidden');
  document.getElementById('ia-btn-save').classList.add('is-hidden');
  const btn = document.getElementById('ia-btn-save');
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Guardar receta'; }
}

// ═══════════════════════════════════════════════════
