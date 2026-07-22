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
let customUnits = [];

let insumos   = [];
let productos = [];
let recetas   = [];

let repInsumoId = null;
let activeFilter = 'todos';
let togglePrepOn = true;
let compraQty = {};
let compraPrices = {};
let mermaOn = true;

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function ivCOP(n) {
  if (isNaN(n) || n === null) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CO');
}
function getStockState(ins) {
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
function calcReceta(prod) {
  const fcPct = params.fc / 100;
  const opPct = params.op / 100;
  let raw = 0;
  for (const l of prod.receta) {
    const ins = insumos.find(i => i.id === l.insId);
    if (!ins) continue;
    raw += l.qty * costoPorUr(ins) * (params.merma ? (1 + l.merma / 100) : 1);
  }
  const fc      = prod.precio > 0 ? raw / prod.precio : 0;
  const margen  = prod.precio - raw;
  const otros   = prod.precio * opPct;
  const neta    = prod.precio - raw - otros;
  const sugerido = fcPct > 0 ? raw / fcPct : 0;
  return { raw, fc, margen, otros, neta, sugerido };
}
function semaforo(fc) {
  if (fc <= 0.30) return { color:'#22C55E', label:'Saludable' };
  if (fc <= 0.38) return { color:'#EAB308', label:'Aceptable' };
  if (fc <= 0.45) return { color:'#F97316', label:'Cuidado' };
  return { color:'#EF4444', label:'No rentable' };
}
function isPausado(prod) {
  if (!prod.receta || prod.receta.length === 0) return false;
  return prod.receta.some(l => {
    const ins = insumos.find(i => i.id === l.insId);
    return ins && ins.prep && ins.stock <= 0;
  });
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
    const restaurantName = meta.restaurant_name || 'El Parche Food';
    document.getElementById('sb-brand').textContent   = 'Cobra POS';
    document.getElementById('sb-subbrand').textContent = restaurantName + ' · Caja 01';

    await loadProductos();
    await loadInsumos();
    await loadRecetasDB();
    await loadParamsDB();
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
    .select('id, name, description, price, available, pos_categories(name)')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .order('name');
  if (error) { console.error('[inventario] loadProductos:', error); return; }
  productos = (data || []).map(p => ({
    id:      p.id,
    nombre:  p.name,
    cat:     p.pos_categories?.name || 'Sin categoría',
    precio:  parseFloat(p.price) || 0,
    visible:     p.available !== false,
    descripcion: p.description || '',
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
    buyUnit:    i.buy_unit,
    useUnit:    i.use_unit,
    precio:     parseFloat(i.precio) || 0,
    conversion: parseFloat(i.conversion) || 1,
    stock:      parseFloat(i.stock) || 0,
    min:        parseFloat(i.min_stock) || 0,
  }));
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
    prod.receta = recetas
      .filter(r => r.product_id === prod.id)
      .map(r => ({ insId: r.insumo_id, qty: parseFloat(r.cantidad), merma: parseFloat(r.merma) || 0 }));
  }
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
  const margenes   = conReceta.map(p => { const r = calcReceta(p); return r.margen / p.precio; });
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
}

// ═══════════════════════════════════════════════════
// PRODUCTOS
// ═══════════════════════════════════════════════════
function renderProductos() {
  const grid = document.getElementById('prod-grid');
  grid.innerHTML = '';
  if (productos.length === 0) {
    grid.innerHTML = `<div class="iv-empty" style="grid-column:1/-1">
      <div class="iv-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
      <div class="iv-empty-t">Sin productos en catálogo</div>
    </div>`;
    updateKPIs(); return;
  }
  for (const prod of productos) grid.appendChild(buildProdCard(prod));
  updateKPIs();
}

function filterProductos(q) {
  const grid = document.getElementById('prod-grid');
  const cards = grid.querySelectorAll('.iv-prod-card');
  const lq = (q || '').toLowerCase();
  cards.forEach(card => {
    const name = (card.querySelector('.iv-prod-name')?.textContent || '').toLowerCase();
    const cat  = (card.querySelector('.iv-prod-cat')?.textContent || '').toLowerCase();
    card.style.display = (!lq || name.includes(lq) || cat.includes(lq)) ? '' : 'none';
  });
}

function buildProdCard(prod) {
  const tieneReceta = prod.receta && prod.receta.length > 0;
  const paused      = tieneReceta && isPausado(prod);
  const r           = tieneReceta ? calcReceta(prod) : null;
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
        <div class="iv-prod-price">${ivCOP(prod.precio)}</div>
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
    const faltante = prod.receta.find(l => { const i=insumos.find(x=>x.id===l.insId); return i&&i.prep&&i.stock<=0; });
    const nomFalt  = faltante ? (insumos.find(x=>x.id===faltante.insId)?.nombre||'—') : '—';
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
    const fcPct   = (r.fc*100).toFixed(1);
    const netaPct = prod.precio > 0 ? (r.neta/prod.precio*100).toFixed(1) : '0';
    const semColor = sem.color;
    // color de texto según semáforo (más oscuro)
    const inkMap = {'#22C55E':'#166534','#EAB308':'#854D0E','#F97316':'#9A3412','#EF4444':'#991B1B'};
    const fcInk = inkMap[semColor] || '#0F172A';
    minicostHTML = `<div class="iv-minicost">
      <div class="col">
        <div class="v" style="color:${fcInk}"><span style="width:9px;height:9px;border-radius:999px;background:${semColor};display:inline-block"></span>${fcPct}%</div>
        <div class="l">materia prima</div>
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

function abrirEditorInsumoReceta(prodId) {
  showToast('Próximamente: editor de receta por producto · por ahora agrega insumos en la pestaña Insumos');
  showScreen('insumos');
  setTimeout(() => abrirEditorInsumo(null), 300);
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
  html += `<button class="iv-chip dashed" id="btn-nueva-cat" onclick="abrirNuevaCat()">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Categoría
  </button>`;
  container.innerHTML = html;
}

function abrirNuevaCat() {
  const nombre = prompt('Nombre de la nueva categoría:')?.trim();
  if (!nombre) return;
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
      <div style="display:flex;align-items:center;gap:8px"><span class="iv-ins-name">${ins.nombre}</span>${tagHTML}</div>
      <div class="iv-ins-meta">Compra: <strong>${ivCOP(ins.precio)}</strong> / ${ins.buyUnit} · usa en ${ins.useUnit}</div>
    </div>
    <div class="iv-ins-stock">
      <div class="iv-ins-stock-top">
        <span class="iv-ins-stock-val" style="color:${colors.txt}">${ins.stock} <span class="u">${ins.buyUnit}</span></span>
        <span class="iv-ins-min">mín ${ins.min}</span>
      </div>
      <div class="iv-bar"><i style="width:${pct}%;background:${colors.bar}"></i></div>
    </div>
    <div class="iv-ins-badgewrap">
      <span class="iv-badge" style="color:${colors.txt};background:${colors.bg}">${stateLabel(state)}</span>
    </div>
    <div class="iv-ins-actions">
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
  const catSel = document.getElementById('ins-cat');
  const cats   = [...new Set(insumos.map(i=>i.cat))];
  catSel.innerHTML='<option value="">Seleccionar categoría…</option>'+
    cats.map(c=>`<option value="${c}" ${ins&&ins.cat===c?'selected':''}>${c}</option>`).join('')+
    '<option value="__new__">＋ Nueva categoría…</option>';
  setSelectVal(document.getElementById('ins-buy-unit'), ins?.buyUnit||'unidad');
  setSelectVal(document.getElementById('ins-use-unit'), ins?.useUnit||'g');
  updateTogglePrepUI();
  document.getElementById('ins-cost-hint').classList.add('is-hidden');
  document.getElementById('btn-ins-eliminar').classList.toggle('is-hidden',!ins);
  document.getElementById('panel-insumo').classList.remove('is-hidden');
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
  const stock   = parseFloat(document.getElementById('ins-stock').value)||0;
  const min     = parseFloat(document.getElementById('ins-min').value)||0;
  const buyUnit = document.getElementById('ins-buy-unit').value;
  const useUnit = document.getElementById('ins-use-unit').value;
  if (cat==='__new__') { cat=prompt('Nombre de la nueva categoría:')?.trim(); if (!cat) return; }
  if (!nombre||!cat||precio<=0) { alert('Completa nombre, categoría y precio'); return; }
  const catColor = CAT_COLORS[cat]||'#64748B';
  const editId   = document.getElementById('ins-edit-id').value;
  const payload  = { nombre, categoria:cat, cat_color:catColor, prep_requerido:togglePrepOn, buy_unit:buyUnit, use_unit:useUnit, precio, conversion, stock, min_stock:min, updated_at:new Date().toISOString() };
  if (editId) {
    await iv_sb.from('iv_insumos').update(payload).eq('id',editId);
    const ins=insumos.find(i=>i.id===editId);
    if (ins) Object.assign(ins,{nombre,cat,catColor,prep:togglePrepOn,buyUnit,useUnit,precio,conversion,stock,min});
  } else {
    const {data,error}=await iv_sb.from('iv_insumos').insert({...payload,tenant_id:tenantId,branch_id:branchId,activo:true}).select().single();
    if (error) { console.error('guardarInsumo:',error); alert('Error al guardar'); return; }
    insumos.push({id:data.id,nombre,cat,catColor,prep:togglePrepOn,buyUnit,useUnit,precio,conversion,stock,min});
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

function renderRecetasList() {
  const list=document.getElementById('rec-list');
  list.innerHTML='';
  const conReceta=productos.filter(p=>p.receta&&p.receta.length>0);
  if (conReceta.length===0) {
    list.innerHTML=`<div style="padding:24px 16px;text-align:center;color:#94A3B8;font-size:13px">Aún no hay recetas configuradas.<br>Agrega insumos a tus productos.</div>`;
    return;
  }
  for (const prod of conReceta) {
    const r=calcReceta(prod); const sem=semaforo(r.fc);
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

function abrirRecetaDetalle(prodId) {
  const prod=productos.find(p=>p.id===prodId);
  if (!prod||!prod.receta||prod.receta.length===0) return;
  _recetaAbierta = prodId;
  if (!document.getElementById('screen-recetas').classList.contains('on')) {
    showScreen('recetas');
    setTimeout(()=>{document.querySelectorAll('.iv-rec-listitem').forEach(b=>b.classList.toggle('on',b.dataset.receta===prodId));abrirRecetaDetalle(prodId);},50);
    return;
  }
  document.querySelectorAll('.iv-rec-listitem').forEach(b=>b.classList.toggle('on',b.dataset.receta===prodId));
  const r=calcReceta(prod); const sem=semaforo(r.fc);
  const fcPct=(r.fc*100).toFixed(1); const netaPct=(r.neta/prod.precio*100).toFixed(1);
  const margenPct=(r.margen/prod.precio*100).toFixed(1); const opPct=(r.otros/prod.precio*100).toFixed(1);
  let bannerHTML='';
  if (r.fc<=0.30) {
    bannerHTML=`<div class="iv-alert okbox"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg><div><div class="at">Plato rentable · ${fcPct}% materia prima</div></div></div>`;
  } else {
    const lvl={Aceptable:{bg:'#FEF9C3',border:'#FDE68A',ink:'#854D0E'},Cuidado:{bg:'#FFEDD5',border:'#FED7AA',ink:'#9A3412'},'No rentable':{bg:'#FEE2E2',border:'#FECACA',ink:'#991B1B'}}[sem.label]||{bg:'#FEE2E2',border:'#FECACA',ink:'#991B1B'};
    bannerHTML=`<div class="iv-alert" style="background:${lvl.bg};border:1px solid ${lvl.border}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${lvl.ink}" stroke-width="2.2" stroke-linecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div><div class="at" style="color:${lvl.ink}">${sem.label} · ${fcPct}% en materia prima</div><div class="ax" style="color:${lvl.ink}">Considera subir el precio a ${ivCOP(Math.ceil(r.sugerido/100)*100)} para llegar al ${params.fc}% de meta.</div></div></div>`;
  }
  let recetaRows='';
  for (const l of prod.receta) {
    const ins=insumos.find(i=>i.id===l.insId); if (!ins) continue;
    const cpu=costoPorUr(ins); const lineCost=l.qty*cpu*(params.merma?(1+l.merma/100):1);
    const linePct=r.raw>0?(lineCost/r.raw*100).toFixed(1):'0';
    recetaRows+=`<div class="iv-recipe-row"><div style="flex:1"><div class="iv-recipe-name">${ins.nombre}</div><div class="iv-recipe-sub">${ivCOP(cpu)}/${ins.useUnit} · ${linePct}% del costo</div></div><div style="width:80px;text-align:center;font-size:13px;font-weight:700">${l.qty} ${ins.useUnit}</div><div class="iv-recipe-cost">${ivCOP(lineCost)}</div></div>`;
  }
  const inf=params.inf/100; const raw6=r.raw*Math.pow(1+inf,0.5); const raw12=r.raw*(1+inf);
  const fc6=raw6/prod.precio; const fc12=raw12/prod.precio;
  const dot=fc=>fc<=0.30?'#22C55E':fc<=0.38?'#EAB308':fc<=0.45?'#F97316':'#EF4444';
  document.getElementById('receta-detalle').innerHTML=`
    <div class="iv-rec-head"><div><div class="iv-prod-cat">${prod.cat}</div><div class="iv-rec-title">${prod.nombre}</div></div><div style="text-align:right"><div class="iv-rec-pricelbl">Precio de venta</div><div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums">${ivCOP(prod.precio)}</div></div></div>
    ${bannerHTML}
    <div class="iv-metrics">
      <div class="iv-metric"><div class="ml">Materia prima</div><div class="mv" style="color:${sem.color}">${ivCOP(r.raw)}</div><div class="ms">${fcPct}% del precio</div><div class="iv-bar" style="margin-top:8px"><i style="width:${Math.min(100,r.fc*100)}%;background:${sem.color}"></i></div></div>
      <div class="iv-metric"><div class="ml">Margen contribución</div><div class="mv">${ivCOP(r.margen)}</div><div class="ms">${margenPct}%</div></div>
      <div class="iv-metric"><div class="ml">Otros costos op.</div><div class="mv">${ivCOP(r.otros)}</div><div class="ms">${opPct}%</div></div>
      <div class="iv-metric hl"><div class="ml">Ganancia neta</div><div class="mv" style="color:#16A34A">${ivCOP(r.neta)}</div><div class="ms">${netaPct}%</div></div>
    </div>
    <div class="iv-recipe"><div class="iv-recipe-head"><span style="flex:1">Ingrediente</span><span style="width:80px;text-align:center">Cantidad</span><span>Costo</span></div>${recetaRows}<div class="iv-recipe-total"><span style="font-size:12.5px;font-weight:700;color:#475569">Costo total materia prima</span><span style="font-size:15px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${ivCOP(r.raw)}</span></div></div>
    <div class="iv-cards2">
      <div class="iv-suggest"><div class="h"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></svg> Precio sugerido</div><div class="v">${ivCOP(Math.ceil(r.sugerido/100)*100)}</div><div class="x">Para que la materia prima sea ${params.fc}% del precio (tu meta).</div><button class="iv-btn-primary" style="margin-top:12px;width:100%;justify-content:center" onclick="aplicarPrecioSugerido('${prod.id}',${Math.ceil(r.sugerido/100)*100})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aplicar ${ivCOP(Math.ceil(r.sugerido/100)*100)}</button></div>
      <div class="iv-proj"><div class="h">Proyección · inflación ${params.inf}%/año</div><div style="display:flex;flex-direction:column;gap:10px"><div class="iv-proj-row base"><span class="pl">Hoy</span><span class="praw">${ivCOP(r.raw)}</span><span class="pfc"><span class="d" style="background:${dot(r.fc)}"></span><span class="vv" style="color:${dot(r.fc)}">${fcPct}%</span></span></div><div class="iv-proj-row"><span class="pl">+6 meses</span><span class="praw">${ivCOP(raw6)}</span><span class="pfc"><span class="d" style="background:${dot(fc6)}"></span><span class="vv" style="color:${dot(fc6)}">${(fc6*100).toFixed(1)}%</span></span></div><div class="iv-proj-row"><span class="pl">+12 meses</span><span class="praw">${ivCOP(raw12)}</span><span class="pfc"><span class="d" style="background:${dot(fc12)}"></span><span class="vv" style="color:${dot(fc12)}">${(fc12*100).toFixed(1)}%</span></span></div></div><div class="iv-proj-note">Si mantienes el precio actual, la materia prima subirá y tu margen bajará.</div></div>
    </div>`;
}

function aplicarPrecioSugerido(prodId,precio) {
  const prod=productos.find(p=>p.id===prodId); if (!prod) return;
  prod.precio=precio; abrirRecetaDetalle(prodId);
  showToast('✓ Precio actualizado a '+ivCOP(precio));
}

// ═══════════════════════════════════════════════════
// PARÁMETROS
// ═══════════════════════════════════════════════════
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
  if (customUnits.length===0) {
    card.innerHTML=`<div class="iv-units-emptywrap"><div class="iv-units-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></div><div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:6px">Sin unidades propias</div><p style="font-size:12px;color:#94A3B8;max-width:280px;margin:0 auto">Crea unidades personalizadas como "porción", "bandeja" o cualquier medida específica de tu restaurante.</p></div>`;
    return;
  }
  card.innerHTML=customUnits.map(u=>{
    const uses=insumos.filter(i=>i.buyUnit===u.nombre||i.useUnit===u.nombre).length;
    return `<div class="iv-unit-row"><span class="iv-unit-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></span><span class="iv-unit-name">${u.nombre}</span>${uses>0?`<span class="iv-unit-use">En uso · ${uses} insumos</span>`:'<span class="iv-unit-nouse">Sin uso</span>'}<button class="iv-row-btn btn-edit-unit" onclick="editarUnidad('${u.nombre}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button><button class="iv-row-btn danger btn-del-unit" onclick="eliminarUnidad('${u.nombre}')" ${uses>0?'disabled style="opacity:.4;cursor:not-allowed"':''}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`;
  }).join('');
}
function eliminarUnidad(nombre) { customUnits=customUnits.filter(u=>u.nombre!==nombre); renderUnidades(); showToast('Unidad eliminada'); }
function editarUnidad(nombre) { const nuevo=prompt('Nuevo nombre:',nombre)?.trim(); if(!nuevo||nuevo===nombre) return; customUnits=customUnits.map(u=>u.nombre===nombre?{...u,nombre:nuevo}:u); renderUnidades(); }

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
document.getElementById('nav-params')?.addEventListener('click',()=>document.getElementById('panel-params').classList.remove('is-hidden'));
document.getElementById('btn-nuevo-insumo')?.addEventListener('click',()=>abrirEditorInsumo(null));
document.getElementById('btn-registrar-compra')?.addEventListener('click',abrirCompra);
document.getElementById('btn-nueva-unidad')?.addEventListener('click',()=>{
  const nombre=prompt('Nombre de la nueva unidad:')?.trim();
  if (!nombre) return;
  if (customUnits.find(u=>u.nombre===nombre)){alert('Esa unidad ya existe');return;}
  customUnits.push({nombre}); renderUnidades(); showToast('✓ Unidad "'+nombre+'" creada');
});

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
    prod.receta = recetaLinks.map(l => ({ insId: l.insId, qty: l.qty, merma: 0 }));
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
