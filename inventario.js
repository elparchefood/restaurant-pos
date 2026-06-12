/* inventario.js — Lógica completa del módulo de inventario Comanda POS */

// ═══════════════════════════════════════════════════
// SUPABASE (inicialización directa, sin pos-core.js)
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const iv_sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════
let params = { fc: 30, op: 32, inf: 10, merma: true };
let customUnits = []; // unidades propias

// Datos de insumos (se cargan desde Supabase o datos semilla)
let insumos = [
  { id:1, nombre:'Carne', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'libra', useUnit:'gramo', precio:9000, conversion:453, stock:5, min:4 },
  { id:2, nombre:'Pollo', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'libra', useUnit:'gramo', precio:7500, conversion:453, stock:8, min:6 },
  { id:3, nombre:'Papa freír', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'kg', useUnit:'gramo', precio:3200, conversion:1000, stock:4, min:3 },
  { id:4, nombre:'Papa criolla', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'kg', useUnit:'gramo', precio:3500, conversion:1000, stock:2, min:2 },
  { id:5, nombre:'Salchicha', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'paq.×24', useUnit:'unidad', precio:18000, conversion:24, stock:3, min:2 },
  { id:6, nombre:'Maíz', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'paq.×300', useUnit:'gramo', precio:5000, conversion:300, stock:2, min:1 },
  { id:7, nombre:'Tocineta', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'libra', useUnit:'gramo', precio:12000, conversion:453, stock:1, min:1 },
  { id:8, nombre:'Cebolla', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'kg', useUnit:'gramo', precio:2500, conversion:1000, stock:2, min:1 },
  { id:9, nombre:'Pan perro', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'paq.×10', useUnit:'unidad', precio:8000, conversion:10, stock:3, min:2 },
  { id:10, nombre:'Pan hamburguesa', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'paq.×12', useUnit:'unidad', precio:9500, conversion:12, stock:12, min:40 },
  { id:11, nombre:'Limón', cat:'Materia prima', catColor:'#E11D48', prep:true, buyUnit:'kg', useUnit:'gramo', precio:4000, conversion:1000, stock:0.8, min:5 },
  { id:12, nombre:'Cheddar', cat:'Lácteos', catColor:'#F59E0B', prep:true, buyUnit:'libra', useUnit:'gramo', precio:15000, conversion:453, stock:2, min:2 },
  { id:13, nombre:'Crema de coco', cat:'Lácteos', catColor:'#F59E0B', prep:true, buyUnit:'lata', useUnit:'ml', precio:8000, conversion:400, stock:4, min:3 },
  { id:14, nombre:'Mozzarella', cat:'Lácteos', catColor:'#F59E0B', prep:true, buyUnit:'kg', useUnit:'gramo', precio:22000, conversion:1000, stock:1.2, min:4 },
  { id:15, nombre:'Aceite', cat:'Salsas', catColor:'#8B5CF6', prep:true, buyUnit:'litro', useUnit:'ml', precio:6000, conversion:1000, stock:3, min:2 },
  { id:16, nombre:'Azúcar', cat:'Salsas', catColor:'#8B5CF6', prep:true, buyUnit:'kg', useUnit:'gramo', precio:3000, conversion:1000, stock:2, min:1 },
  { id:17, nombre:'Salsa BBQ', cat:'Salsas', catColor:'#8B5CF6', prep:true, buyUnit:'frasco', useUnit:'ml', precio:6000, conversion:500, stock:2, min:6 },
  { id:18, nombre:'Coca-Cola', cat:'Bebidas envasadas', catColor:'#0EA5E9', prep:false, buyUnit:'paq.×24', useUnit:'unidad', precio:60000, conversion:24, stock:4, min:2 },
  { id:19, nombre:'Agua', cat:'Bebidas envasadas', catColor:'#0EA5E9', prep:false, buyUnit:'paq.×12', useUnit:'unidad', precio:18000, conversion:12, stock:3, min:2 },
  { id:20, nombre:'Gaseosa 1.5L', cat:'Bebidas envasadas', catColor:'#0EA5E9', prep:false, buyUnit:'paq.×24', useUnit:'unidad', precio:72000, conversion:24, stock:0, min:24 },
  { id:21, nombre:'Caja', cat:'Desechables', catColor:'#64748B', prep:false, buyUnit:'paq.×50', useUnit:'unidad', precio:25000, conversion:50, stock:4, min:2 },
  { id:22, nombre:'Servilletas', cat:'Desechables', catColor:'#64748B', prep:false, buyUnit:'paq.×100', useUnit:'unidad', precio:4000, conversion:100, stock:5, min:2 },
  { id:23, nombre:'Tenedores', cat:'Desechables', catColor:'#64748B', prep:false, buyUnit:'paq.×100', useUnit:'unidad', precio:8000, conversion:100, stock:3, min:2 },
  { id:24, nombre:'Bolsas', cat:'Desechables', catColor:'#64748B', prep:false, buyUnit:'paq.×100', useUnit:'unidad', precio:5000, conversion:100, stock:90, min:100 },
  { id:25, nombre:'Jabón', cat:'Aseo', catColor:'#14B8A6', prep:false, buyUnit:'unidad', useUnit:'unidad', precio:12000, conversion:1, stock:3, min:2 },
];

// Catálogo de productos (platos)
let productos = [
  { id:1, nombre:'Premium', cat:'Hamburguesas', precio:14000, visible:true,
    receta:[
      { insId:3, qty:220, merma:5 }, { insId:2, qty:90, merma:8 },
      { insId:5, qty:1.5, merma:0 }, { insId:6, qty:30, merma:2 },
      { insId:14, qty:40, merma:3 }, { insId:17, qty:25, merma:0 },
      { insId:21, qty:1, merma:0 }
    ]
  },
  { id:2, nombre:'El Parche Especial', cat:'Hamburguesas', precio:28000, visible:true,
    receta:[
      { insId:1, qty:200, merma:8 }, { insId:3, qty:180, merma:5 },
      { insId:12, qty:60, merma:0 }, { insId:7, qty:40, merma:3 },
      { insId:17, qty:30, merma:0 }, { insId:21, qty:1, merma:0 }
    ]
  },
  { id:3, nombre:'Perro Ranchero', cat:'Perros calientes', precio:18000, visible:true,
    receta:[
      { insId:5, qty:2, merma:0 }, { insId:9, qty:1, merma:0 },
      { insId:17, qty:20, merma:0 }, { insId:16, qty:10, merma:0 }
    ]
  },
  { id:4, nombre:'Limonada de Coco', cat:'Bebidas', precio:12000, visible:true,
    receta:[
      { insId:11, qty:80, merma:10 }, { insId:13, qty:100, merma:0 },
      { insId:16, qty:30, merma:0 }
    ]
  },
  { id:5, nombre:'Coca-Cola', cat:'Bebidas', precio:4500, visible:true, receta:[] },
];

// Estado de panel reponer
let repInsumoId = null;

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
    ok:    { txt:'#166534', bg:'#DCFCE7', ring:'#BBF7D0', bar:'#22C55E' },
    low:   { txt:'#B45309', bg:'#FEF3C7', ring:'#FCD34D', bar:'#F59E0B' },
    critical:{ txt:'#991B1B', bg:'#FEE2E2', ring:'#FECACA', bar:'#EF4444' },
    out:   { txt:'#991B1B', bg:'#FEE2E2', ring:'#FECACA', bar:'#EF4444' },
  };
  return m[s] || m.ok;
}

function costoPorUr(ins) { return ins.precio / ins.conversion; }

function calcReceta(prod) {
  const fcPct = params.fc / 100;
  const opPct = params.op / 100;
  let raw = 0;
  for (const l of prod.receta) {
    const ins = insumos.find(i => i.id === l.insId);
    if (!ins) continue;
    const cpu = costoPorUr(ins);
    const factor = params.merma ? (1 + l.merma / 100) : 1;
    raw += l.qty * cpu * factor;
  }
  const fc = prod.precio > 0 ? raw / prod.precio : 0;
  const margen = prod.precio - raw;
  const otros = prod.precio * opPct;
  const neta = prod.precio - raw - otros;
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
  if (prod.receta.length === 0) return false;
  return prod.receta.some(l => {
    const ins = insumos.find(i => i.id === l.insId);
    return ins && ins.prep && ins.stock <= 0;
  });
}

// ═══════════════════════════════════════════════════
// KPIs GLOBALES
// ═══════════════════════════════════════════════════
function updateKPIs() {
  const enAlerta = insumos.filter(i => getStockState(i) !== 'ok').length;
  const pausados = productos.filter(p => isPausado(p)).length;
  const margenes = productos.filter(p => p.receta.length > 0).map(p => {
    const r = calcReceta(p);
    return r.margen / p.precio;
  });
  const margenProm = margenes.length > 0 ? margenes.reduce((a,b) => a+b, 0) / margenes.length * 100 : 0;

  document.getElementById('kpi-alerta-n').textContent = enAlerta;
  document.getElementById('kpi-pausados-n').textContent = pausados;
  document.getElementById('kpi-margen-n').textContent = margenProm.toFixed(1) + '%';

  const kpiAlerta = document.getElementById('kpi-alerta');
  const kpiPausados = document.getElementById('kpi-pausados');
  kpiAlerta.classList.toggle('alert', enAlerta > 0);
  kpiPausados.classList.toggle('warn', pausados > 0);

  // alerta lateral
  const sideAlert = document.getElementById('side-alert');
  if (enAlerta > 0) {
    sideAlert.classList.remove('is-hidden');
    document.getElementById('side-alert-txt').textContent = enAlerta + ' insumo' + (enAlerta > 1 ? 's' : '') + ' en alerta';
  } else {
    sideAlert.classList.add('is-hidden');
  }

  // valor inventario
  const valorTotal = insumos.reduce((s, i) => s + i.stock * i.precio, 0);
  document.getElementById('inv-valor-total').textContent = ivCOP(valorTotal);
}

// ═══════════════════════════════════════════════════
// NAVEGACIÓN (tabs + sidebar)
// ═══════════════════════════════════════════════════
const screens = {
  productos: { title:'Productos', eyebrow:'Control de inventario · Platos' },
  insumos:   { title:'Insumos', eyebrow:'Control de inventario · Materias primas' },
  recetas:   { title:'Recetas y costeo', eyebrow:'Control de inventario · Costeo' },
  unidades:  { title:'Unidades de medida', eyebrow:'Configuración' },
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
  document.getElementById('page-title').textContent = info.title || name;
  document.getElementById('page-eyebrow').textContent = info.eyebrow || '';
  document.getElementById('crumb-title').textContent = info.title || name;

  if (name === 'productos') renderProductos();
  if (name === 'insumos') renderInsumos();
  if (name === 'recetas') renderRecetasList();
  if (name === 'unidades') renderUnidades();
}

// ═══════════════════════════════════════════════════
// PRODUCTOS
// ═══════════════════════════════════════════════════
function renderProductos() {
  const grid = document.getElementById('prod-grid');
  grid.innerHTML = '';
  for (const prod of productos) {
    grid.appendChild(buildProdCard(prod));
  }
  updateKPIs();
}

function buildProdCard(prod) {
  const isDirect = prod.receta.length === 0;
  const paused = !isDirect && isPausado(prod);
  const r = isDirect ? null : calcReceta(prod);
  const sem = r ? semaforo(r.fc) : null;

  const el = document.createElement('div');
  el.className = 'iv-prod-card' + (!prod.visible ? ' off' : '');

  // head
  let headHTML = `
    <div>
      <div class="iv-prod-cat">${prod.cat}</div>
      <div class="iv-prod-name">${prod.nombre}</div>
    </div>
    <div style="text-align:right">
      <div class="iv-prod-price-lbl">Precio</div>
      <div class="iv-prod-price">${ivCOP(prod.precio)}</div>
    </div>`;

  // state band
  let stateHTML = '';
  if (isDirect) {
    stateHTML = `<div class="iv-state direct">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      Venta directa · sin preparación</div>`;
  } else if (paused) {
    const faltante = prod.receta.find(l => {
      const i = insumos.find(x => x.id === l.insId); return i && i.prep && i.stock <= 0;
    });
    const nomFalt = faltante ? insumos.find(x => x.id === faltante.insId)?.nombre : '—';
    stateHTML = `<div class="iv-state paused">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      Pausado · falta ${nomFalt}</div>`;
  } else {
    stateHTML = `<div class="iv-state ok">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Disponible · insumos en stock</div>`;
  }

  // mini costeo
  let minicostHTML = '';
  if (!isDirect && r) {
    const fcPct = (r.fc * 100).toFixed(1);
    const netaPct = (r.neta / prod.precio * 100).toFixed(1);
    minicostHTML = `<div class="iv-minicost">
      <div class="col">
        <div class="v" style="color:${sem.color}"><span style="width:8px;height:8px;border-radius:999px;background:${sem.color};display:inline-block"></span>${fcPct}%</div>
        <div class="l">Food cost</div>
      </div>
      <div class="sep"></div>
      <div class="col">
        <div class="v">${ivCOP(r.margen)}</div>
        <div class="l">Margen contrib.</div>
      </div>
      <div class="sep"></div>
      <div class="col">
        <div class="v">${netaPct}%</div>
        <div class="l">Ganancia neta</div>
      </div>
    </div>`;
  }

  // foot
  let footHTML = '';
  if (paused) {
    footHTML = `<div class="iv-prod-pausedlbl">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      Pausado por stock
    </div>
    <button class="iv-btn-link" onclick="irAInsumos()">Ver insumos →</button>`;
  } else {
    footHTML = `<button class="iv-switch ${prod.visible ? 'on' : ''}" title="Visible al mesero" onclick="toggleVisible(${prod.id}, this)"></button>
    <span style="font-size:11px;color:#64748B;font-weight:600">Visible al mesero</span>
    <button class="iv-btn-link" onclick="abrirRecetaDetalle(${prod.id})">Ver receta →</button>`;
  }

  el.innerHTML = `
    <div class="iv-prod-head">${headHTML}</div>
    ${stateHTML}
    ${minicostHTML}
    <div class="iv-prod-foot">${footHTML}</div>`;
  return el;
}

function toggleVisible(prodId, btn) {
  const prod = productos.find(p => p.id === prodId);
  if (!prod) return;
  prod.visible = !prod.visible;
  btn.classList.toggle('on', prod.visible);
  showToast(prod.nombre + (prod.visible ? ' visible al mesero' : ' ocultado al mesero'));
}

function irAInsumos() { showScreen('insumos'); }

// ═══════════════════════════════════════════════════
// INSUMOS
// ═══════════════════════════════════════════════════
let activeFilter = 'todos';

function renderInsumos(filtro) {
  filtro = filtro || activeFilter;
  activeFilter = filtro;
  buildFiltersChips();

  const searchVal = document.getElementById('ins-search')?.value.toLowerCase() || '';
  const container = document.getElementById('ins-groups');
  container.innerHTML = '';

  const cats = [...new Set(insumos.map(i => i.cat))];
  let shown = 0;
  for (const cat of cats) {
    let catIns = insumos.filter(i => i.cat === cat);
    if (filtro === 'alerta') catIns = catIns.filter(i => getStockState(i) !== 'ok');
    if (searchVal) catIns = catIns.filter(i => i.nombre.toLowerCase().includes(searchVal));
    if (catIns.length === 0) continue;
    shown += catIns.length;

    const sample = catIns[0];
    const noPrep = !catIns.some(i => i.prep);
    const groupEl = document.createElement('div');
    groupEl.className = 'iv-group';
    groupEl.innerHTML = `
      <div class="iv-group-head">
        <span class="iv-catdot" style="background:${sample.catColor}"></span>
        <span class="iv-group-title">${cat}</span>
        <span class="iv-group-count">${catIns.length}</span>
        ${noPrep ? '<span class="iv-group-noprep">Sin preparaciones</span>' : ''}
      </div>
      <div class="iv-ins-list" id="list-${cat.replace(/\s/g,'-')}"></div>`;
    container.appendChild(groupEl);
    const listEl = groupEl.querySelector('.iv-ins-list');
    for (const ins of catIns) {
      listEl.appendChild(buildInsRow(ins));
    }
  }
  if (shown === 0) {
    container.innerHTML = `<div class="iv-empty"><div class="iv-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div class="iv-empty-t">Sin resultados</div></div>`;
  }
}

function buildFiltersChips() {
  const container = document.getElementById('ins-filters');
  const cats = [...new Set(insumos.map(i => i.cat))];
  const alertaCount = insumos.filter(i => getStockState(i) !== 'ok').length;
  let html = `
    <button class="iv-chip ${activeFilter==='todos'?'on':''}" onclick="renderInsumos('todos')">Todos <span class="n">${insumos.length}</span></button>
    <button class="iv-chip ${activeFilter==='alerta'?'on':''}" onclick="renderInsumos('alerta')">En alerta <span class="n">${alertaCount}</span></button>
    <span class="iv-chip" style="border-color:transparent;background:none;width:1px;padding:0"></span>`;
  for (const cat of cats) {
    const cnt = insumos.filter(i => i.cat === cat).length;
    html += `<button class="iv-chip ${activeFilter===cat?'on':''}" onclick="renderInsumos('${cat}')">${cat} <span class="n">${cnt}</span></button>`;
  }
  container.innerHTML = html;
}

function buildInsRow(ins) {
  const state = getStockState(ins);
  const colors = stateColors(state);
  const pct = ins.min > 0 ? Math.min(100, ins.stock / ins.min * 100) : 100;
  const usedInRecipes = productos.some(p => p.receta.some(l => l.insId === ins.id));
  const tagHTML = ins.prep ? (usedInRecipes ? `<span class="iv-tag-recipe">${countRecipes(ins.id)} recetas</span>` : '') : `<span class="iv-tag-direct"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>Venta directa</span>`;

  const el = document.createElement('div');
  el.className = 'iv-ins-row';
  el.innerHTML = `
    <div class="iv-ins-main">
      <div class="iv-ins-name">${ins.nombre} ${tagHTML}</div>
      <div class="iv-ins-meta">Compra: <strong>${ivCOP(ins.precio)}</strong>/${ins.buyUnit} · usa en ${ins.useUnit}</div>
    </div>
    <div class="iv-ins-stock">
      <div class="iv-ins-stock-top">
        <div class="iv-ins-stock-val" style="color:${colors.txt}">${ins.stock}<span class="u"> ${ins.buyUnit}</span></div>
        <div class="iv-ins-min">mín ${ins.min}</div>
      </div>
      <div class="iv-bar"><i style="width:${pct}%;background:${colors.bar}"></i></div>
    </div>
    <div class="iv-ins-badgewrap">
      <span class="iv-badge" style="color:${colors.txt};background:${colors.bg}">${stateLabel(state)}</span>
    </div>
    <div class="iv-ins-actions">
      <button class="iv-btn-sm primary" onclick="abrirReponer(${ins.id})">＋ Reponer</button>
      <button class="iv-btn-sm" onclick="abrirEditorInsumo(${ins.id})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>`;
  return el;
}

function countRecipes(insId) {
  return productos.filter(p => p.receta.some(l => l.insId === insId)).length;
}

// ═══════════════════════════════════════════════════
// PANEL REPONER
// ═══════════════════════════════════════════════════
function abrirReponer(insId) {
  const ins = insumos.find(i => i.id === insId);
  if (!ins) return;
  repInsumoId = insId;
  document.getElementById('rep-title').textContent = 'Reponer · ' + ins.nombre;
  document.getElementById('rep-cat').textContent = ins.cat;
  document.getElementById('rep-stock-val').textContent = ins.stock;
  document.getElementById('rep-stock-unit').textContent = ins.buyUnit;
  document.getElementById('rep-min').textContent = ins.min;
  document.getElementById('rep-price-unit').textContent = ins.buyUnit;
  document.getElementById('rep-qty').value = '0';
  document.getElementById('rep-price').value = ins.precio;

  const state = getStockState(ins);
  const colors = stateColors(state);
  const badge = document.getElementById('rep-badge');
  badge.textContent = stateLabel(state);
  badge.style.color = colors.txt;
  badge.style.background = colors.bg;

  // surtir
  const surtir = Math.max(0, Math.ceil(ins.min * 1.25 - ins.stock));
  const btn = document.getElementById('rep-surtir-btn');
  btn.textContent = '+' + surtir + ' · surtir';
  btn.onclick = () => { document.getElementById('rep-qty').value = surtir; updateRepResult(); };

  document.getElementById('rep-result').classList.add('is-hidden');
  document.getElementById('btn-reponer-ok').disabled = true;
  document.getElementById('panel-reponer').classList.remove('is-hidden');
}

function repStep(delta) {
  const input = document.getElementById('rep-qty');
  const val = Math.max(0, (parseFloat(input.value) || 0) + delta);
  input.value = val;
  updateRepResult();
}
function repAdd(n) {
  const input = document.getElementById('rep-qty');
  input.value = (parseFloat(input.value) || 0) + n;
  updateRepResult();
}

function updateRepResult() {
  const qty = parseFloat(document.getElementById('rep-qty').value) || 0;
  const price = parseFloat(document.getElementById('rep-price').value) || 0;
  const ins = insumos.find(i => i.id === repInsumoId);
  if (!ins) return;

  const costo = qty * price;
  document.getElementById('rep-costo').textContent = ivCOP(costo);
  document.getElementById('btn-reponer-ok').disabled = qty <= 0;

  if (qty > 0) {
    const nuevoStock = ins.stock + qty;
    const nuevoState = getStockState({ ...ins, stock: nuevoStock });
    const colors = stateColors(nuevoState);
    const res = document.getElementById('rep-result');
    res.classList.remove('is-hidden');
    res.style.background = colors.bg;
    res.querySelector('.rt').textContent = 'Quedará en ' + nuevoStock + ' ' + ins.buyUnit + ' · ' + stateLabel(nuevoState);
    res.querySelector('.rx').textContent = ins.stock + ' + ' + qty + ' ' + ins.buyUnit + ' · costo ' + ivCOP(costo);
    res.querySelector('.rt').style.color = colors.txt;
  } else {
    document.getElementById('rep-result').classList.add('is-hidden');
  }
}

function aplicarReponer() {
  const qty = parseFloat(document.getElementById('rep-qty').value) || 0;
  const price = parseFloat(document.getElementById('rep-price').value) || 0;
  if (qty <= 0) return;
  const ins = insumos.find(i => i.id === repInsumoId);
  if (!ins) return;
  ins.stock += qty;
  ins.precio = price > 0 ? price : ins.precio;
  closePanel('panel-reponer');
  showToast('✓ ' + ins.nombre + ' reponido → ' + ins.stock + ' ' + ins.buyUnit);
  renderInsumos();
  updateKPIs();
  if (document.getElementById('screen-productos').classList.contains('on')) renderProductos();
}

// ═══════════════════════════════════════════════════
// PANEL REGISTRAR COMPRA
// ═══════════════════════════════════════════════════
let compraQty = {};
let compraPrices = {};

function abrirCompra() {
  compraQty = {};
  compraPrices = {};
  insumos.forEach(i => { compraPrices[i.id] = i.precio; });
  filterCompra();
  document.getElementById('compra-search').value = '';
  document.getElementById('compra-summary').textContent = '0 insumos · $0';
  document.getElementById('btn-compra-ok').disabled = true;
  document.getElementById('panel-compra').classList.remove('is-hidden');
}

function filterCompra() {
  const search = document.getElementById('compra-search').value.toLowerCase();
  const list = document.getElementById('compra-list');
  list.innerHTML = '';
  const sorted = [...insumos].sort((a,b) => {
    const sa = getStockState(a) !== 'ok' ? 0 : 1;
    const sb = getStockState(b) !== 'ok' ? 0 : 1;
    return sa - sb || a.nombre.localeCompare(b.nombre);
  });
  for (const ins of sorted) {
    if (search && !ins.nombre.toLowerCase().includes(search)) continue;
    const state = getStockState(ins);
    const colors = stateColors(state);
    const qty = compraQty[ins.id] || 0;
    const row = document.createElement('div');
    row.className = 'iv-buy-row' + (qty > 0 ? ' active' : '');
    row.id = 'buy-row-' + ins.id;
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="iv-buy-name">${ins.nombre}</div>
        <div class="iv-buy-sub" style="color:${colors.txt}">Hay ${ins.stock} ${ins.buyUnit} · ${stateLabel(state)}</div>
      </div>
      <input type="number" min="0" step="any" placeholder="0" value="${qty||''}"
        style="width:64px;padding:6px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:700;text-align:center;font-family:inherit;outline:none"
        oninput="updateCompraRow(${ins.id}, this.value, null)">
      <div class="iv-money" style="width:110px">
        <span class="cur">$</span>
        <input type="number" min="0" placeholder="0" value="${compraPrices[ins.id]||''}"
          oninput="updateCompraRow(${ins.id}, null, this.value)">
      </div>`;
    list.appendChild(row);
  }
  updateCompraSummary();
}

function updateCompraRow(insId, qty, price) {
  if (qty !== null) compraQty[insId] = parseFloat(qty) || 0;
  if (price !== null) compraPrices[insId] = parseFloat(price) || 0;
  const row = document.getElementById('buy-row-' + insId);
  if (row) row.classList.toggle('active', (compraQty[insId] || 0) > 0);
  updateCompraSummary();
}

function updateCompraSummary() {
  const active = Object.entries(compraQty).filter(([,v]) => v > 0);
  const total = active.reduce((s, [id, q]) => s + q * (compraPrices[id] || 0), 0);
  document.getElementById('compra-summary').textContent = active.length + ' insumos · ' + ivCOP(total);
  document.getElementById('btn-compra-ok').disabled = active.length === 0;
}

function aplicarCompra() {
  let n = 0;
  for (const [id, qty] of Object.entries(compraQty)) {
    if (qty <= 0) continue;
    const ins = insumos.find(i => i.id === parseInt(id));
    if (!ins) continue;
    ins.stock += qty;
    if (compraPrices[id] > 0) ins.precio = compraPrices[id];
    n++;
  }
  closePanel('panel-compra');
  showToast('✓ Compra registrada — ' + n + ' insumos actualizados');
  renderInsumos();
  updateKPIs();
}

// ═══════════════════════════════════════════════════
// EDITOR DE INSUMO
// ═══════════════════════════════════════════════════
let togglePrepOn = true;

function abrirEditorInsumo(insId) {
  const ins = insId ? insumos.find(i => i.id === insId) : null;
  document.getElementById('ins-panel-title').textContent = ins ? 'Editar insumo' : 'Nuevo insumo';
  document.getElementById('ins-edit-id').value = ins ? ins.id : '';
  document.getElementById('ins-nombre').value = ins ? ins.nombre : '';
  document.getElementById('ins-precio').value = ins ? ins.precio : '';
  document.getElementById('ins-conversion').value = ins ? ins.conversion : '';
  document.getElementById('ins-stock').value = ins ? ins.stock : '';
  document.getElementById('ins-min').value = ins ? ins.min : '';
  togglePrepOn = ins ? ins.prep : true;

  // populate cats
  const catSel = document.getElementById('ins-cat');
  const cats = [...new Set(insumos.map(i => i.cat))];
  catSel.innerHTML = '<option value="">Seleccionar categoría...</option>' +
    cats.map(c => `<option value="${c}" ${ins && ins.cat === c ? 'selected' : ''}>${c}</option>`).join('') +
    '<option value="__new__">＋ Nueva categoría...</option>';

  setSelectVal(document.getElementById('ins-buy-unit'), ins?.buyUnit || 'unidad');
  setSelectVal(document.getElementById('ins-use-unit'), ins?.useUnit || 'gramo');

  updateTogglePrepUI();
  document.getElementById('ins-cost-hint').classList.add('is-hidden');
  document.getElementById('btn-ins-eliminar').classList.toggle('is-hidden', !ins);
  document.getElementById('panel-insumo').classList.remove('is-hidden');
}

function setSelectVal(sel, val) {
  for (const opt of sel.options) { if (opt.value === val) { opt.selected = true; return; } }
}

function togglePrep() {
  togglePrepOn = !togglePrepOn;
  updateTogglePrepUI();
}
function updateTogglePrepUI() {
  const toggle = document.getElementById('toggle-prep');
  const sw = document.getElementById('toggle-prep-sw');
  const desc = document.getElementById('toggle-prep-desc');
  toggle.classList.toggle('on', togglePrepOn);
  sw.classList.toggle('on', togglePrepOn);
  desc.textContent = togglePrepOn ? 'Activo — puede usarse en recetas' : 'Desactivado — venta directa';
}

function updateCostHint() {
  const precio = parseFloat(document.getElementById('ins-precio').value) || 0;
  const conv = parseFloat(document.getElementById('ins-conversion').value) || 0;
  const buyUnit = document.getElementById('ins-buy-unit').value;
  const useUnit = document.getElementById('ins-use-unit').value;
  const hint = document.getElementById('ins-cost-hint');
  const txt = document.getElementById('ins-cost-hint-txt');
  if (precio > 0 && conv > 0) {
    const cpu = precio / conv;
    txt.textContent = `Costo por ${useUnit}: ${ivCOP(cpu)} (${ivCOP(precio)} ÷ ${conv} ${useUnit}/${buyUnit})`;
    hint.classList.remove('is-hidden');
  } else {
    hint.classList.add('is-hidden');
  }
}

function guardarInsumo() {
  const nombre = document.getElementById('ins-nombre').value.trim();
  const cat = document.getElementById('ins-cat').value;
  const precio = parseFloat(document.getElementById('ins-precio').value) || 0;
  const conversion = parseFloat(document.getElementById('ins-conversion').value) || 1;
  const stock = parseFloat(document.getElementById('ins-stock').value) || 0;
  const min = parseFloat(document.getElementById('ins-min').value) || 0;
  const buyUnit = document.getElementById('ins-buy-unit').value;
  const useUnit = document.getElementById('ins-use-unit').value;
  if (!nombre || !cat || precio <= 0) { alert('Completa nombre, categoría y precio'); return; }

  const catColors = { 'Materia prima':'#E11D48','Lácteos':'#F59E0B','Salsas':'#8B5CF6','Bebidas envasadas':'#0EA5E9','Desechables':'#64748B','Aseo':'#14B8A6' };
  const catColor = catColors[cat] || '#64748B';

  const editId = document.getElementById('ins-edit-id').value;
  if (editId) {
    const ins = insumos.find(i => i.id === parseInt(editId));
    if (ins) { Object.assign(ins, { nombre, cat, catColor, precio, conversion, stock, min, buyUnit, useUnit, prep: togglePrepOn }); }
  } else {
    const newId = Math.max(0, ...insumos.map(i => i.id)) + 1;
    insumos.push({ id: newId, nombre, cat, catColor, prep: togglePrepOn, buyUnit, useUnit, precio, conversion, stock, min });
  }
  closePanel('panel-insumo');
  showToast('✓ Insumo guardado');
  renderInsumos();
  updateKPIs();
}

function eliminarInsumo() {
  const editId = parseInt(document.getElementById('ins-edit-id').value);
  if (!editId || !confirm('¿Eliminar este insumo? Esta acción no se puede deshacer.')) return;
  insumos = insumos.filter(i => i.id !== editId);
  closePanel('panel-insumo');
  showToast('Insumo eliminado');
  renderInsumos();
  updateKPIs();
}

// ═══════════════════════════════════════════════════
// RECETAS Y COSTEO
// ═══════════════════════════════════════════════════
function renderRecetasList() {
  const list = document.getElementById('rec-list');
  list.innerHTML = '';
  for (const prod of productos) {
    if (prod.receta.length === 0) continue;
    const r = calcReceta(prod);
    const sem = semaforo(r.fc);
    const btn = document.createElement('button');
    btn.className = 'iv-rec-listitem';
    btn.dataset.receta = prod.id;
    btn.innerHTML = `
      <span style="width:10px;height:10px;border-radius:999px;background:${sem.color};flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div class="nm">${prod.nombre}</div>
        <div class="ct">${prod.cat}</div>
      </div>
      <div class="fc" style="color:${sem.color}">${(r.fc*100).toFixed(1)}%</div>`;
    btn.onclick = () => { document.querySelectorAll('.iv-rec-listitem').forEach(b => b.classList.remove('on')); btn.classList.add('on'); abrirRecetaDetalle(prod.id); };
    list.appendChild(btn);
  }
}

function abrirRecetaDetalle(prodId) {
  const prod = productos.find(p => p.id === prodId);
  if (!prod || prod.receta.length === 0) return;

  if (document.getElementById('screen-recetas').classList.contains('on')) {
    document.querySelectorAll('.iv-rec-listitem').forEach(b => b.classList.toggle('on', parseInt(b.dataset.receta) === prodId));
  } else {
    showScreen('recetas');
    setTimeout(() => {
      document.querySelectorAll('.iv-rec-listitem').forEach(b => b.classList.toggle('on', parseInt(b.dataset.receta) === prodId));
      abrirRecetaDetalle(prodId);
    }, 50);
    return;
  }

  const r = calcReceta(prod);
  const sem = semaforo(r.fc);
  const fcPct = (r.fc * 100).toFixed(1);
  const netaPct = (r.neta / prod.precio * 100).toFixed(1);
  const margenPct = (r.margen / prod.precio * 100).toFixed(1);
  const opPct = (r.otros / prod.precio * 100).toFixed(1);

  // banner
  let bannerHTML = '';
  if (r.fc <= 0.30) {
    bannerHTML = `<div class="iv-alert okbox"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><div class="at">Plato rentable · ${fcPct}% en materia prima</div></div></div>`;
  } else {
    const alertColors = { Aceptable:{bg:'#FEF9C3',border:'#FDE68A',ink:'#854D0E'}, Cuidado:{bg:'#FFEDD5',border:'#FED7AA',ink:'#9A3412'}, 'No rentable':{bg:'#FEE2E2',border:'#FECACA',ink:'#991B1B'} };
    const ac = alertColors[sem.label] || alertColors['No rentable'];
    const reco = r.fc > 0.45 ? `Sube el precio a ${ivCOP(r.sugerido)} o reduce porciones para llegar al 30%.`
      : r.fc > 0.38 ? `Considera subir ${ivCOP(r.sugerido - prod.precio)} (a ${ivCOP(r.sugerido)}) o renegociar el insumo más caro.`
      : `Vigila el insumo de mayor peso; un alza podría pasarte de 38%.`;
    bannerHTML = `<div class="iv-alert" style="background:${ac.bg};border:1px solid ${ac.border}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${ac.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div><div class="at" style="color:${ac.ink}">${sem.label} · ${fcPct}% food cost</div><div class="ax" style="color:${ac.ink}">${reco}</div></div></div>`;
  }

  // líneas receta
  let recetaRows = '';
  for (const l of prod.receta) {
    const ins = insumos.find(i => i.id === l.insId);
    if (!ins) continue;
    const cpu = costoPorUr(ins);
    const factor = params.merma ? (1 + l.merma / 100) : 1;
    const lineCost = l.qty * cpu * factor;
    const linePct = r.raw > 0 ? (lineCost / r.raw * 100).toFixed(1) : '0';
    recetaRows += `<div class="iv-recipe-row">
      <div style="flex:1">
        <div class="iv-recipe-name">${ins.nombre}</div>
        <div class="iv-recipe-sub">${ivCOP(cpu)}/${ins.useUnit}${l.merma > 0 && params.merma ? ' · merma '+l.merma+'%' : ''} · ${linePct}% del costo</div>
      </div>
      <div style="width:80px;text-align:center">
        <div style="font-size:13px;font-weight:700">${l.qty} ${ins.useUnit}</div>
      </div>
      <div class="iv-recipe-cost">${ivCOP(lineCost)}</div>
    </div>`;
  }

  // proyección inflación
  const inf = params.inf / 100;
  const raw6 = r.raw * Math.pow(1 + inf, 6/12);
  const raw12 = r.raw * Math.pow(1 + inf, 1);
  const fc6 = raw6 / prod.precio;
  const fc12 = raw12 / prod.precio;
  const dotColor = (fc) => fc <= 0.30 ? '#22C55E' : fc <= 0.38 ? '#EAB308' : fc <= 0.45 ? '#F97316' : '#EF4444';

  const detalle = document.getElementById('receta-detalle');
  detalle.innerHTML = `
    <div class="iv-rec-head">
      <div>
        <div class="iv-rec-pricelbl">Precio de venta</div>
        <div class="iv-rec-title">${prod.nombre}</div>
      </div>
      <div style="text-align:right">
        <div class="iv-rec-pricelbl">Precio</div>
        <div style="font-size:22px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${ivCOP(prod.precio)}</div>
      </div>
    </div>
    ${bannerHTML}
    <div class="iv-metrics">
      <div class="iv-metric">
        <div class="ml">Materia prima</div>
        <div class="mv" style="color:${sem.color}">${ivCOP(r.raw)}</div>
        <div class="ms">${fcPct}% food cost</div>
      </div>
      <div class="iv-metric">
        <div class="ml">Margen contrib.</div>
        <div class="mv">${ivCOP(r.margen)}</div>
        <div class="ms">${margenPct}%</div>
      </div>
      <div class="iv-metric">
        <div class="ml">Otros costos op.</div>
        <div class="mv">${ivCOP(r.otros)}</div>
        <div class="ms">${opPct}%</div>
      </div>
      <div class="iv-metric hl">
        <div class="ml">Ganancia neta</div>
        <div class="mv" style="color:#16A34A">${ivCOP(r.neta)}</div>
        <div class="ms">${netaPct}%</div>
      </div>
    </div>
    <div class="iv-recipe">
      <div class="iv-recipe-head">
        <div style="flex:1">Ingrediente</div>
        <div style="width:80px;text-align:center">Cantidad</div>
        <div>Costo</div>
      </div>
      ${recetaRows}
      <div class="iv-recipe-total">
        <div style="font-size:12px;font-weight:700;color:#64748B">${prod.receta.length} ingredientes</div>
        <div style="font-size:14px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${ivCOP(r.raw)}</div>
      </div>
    </div>
    <div class="iv-cards2">
      <div class="iv-suggest">
        <div class="h">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Precio sugerido (meta ${params.fc}%)
        </div>
        <div class="v">${ivCOP(Math.ceil(r.sugerido / 100) * 100)}</div>
        <div class="x">Con este precio la materia prima sería el ${params.fc}% del precio de venta.</div>
        <button class="iv-btn-primary" style="margin-top:10px;font-size:12px;padding:7px 12px" onclick="aplicarPrecioSugerido(${prod.id}, ${Math.ceil(r.sugerido/100)*100})">Aplicar ${ivCOP(Math.ceil(r.sugerido/100)*100)}</button>
      </div>
      <div class="iv-proj">
        <div class="h">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Proyección (inflación ${params.inf}%/año)
        </div>
        <div class="iv-proj-row base">
          <div class="pl">Hoy</div>
          <div class="praw">${ivCOP(r.raw)}</div>
          <div style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:999px;background:${dotColor(r.fc)}"></span><span style="width:44px;text-align:right;font-size:12px;font-weight:700">${fcPct}%</span></div>
        </div>
        <div class="iv-proj-row">
          <div class="pl">+6 meses</div>
          <div class="praw">${ivCOP(raw6)}</div>
          <div style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:999px;background:${dotColor(fc6)}"></span><span style="width:44px;text-align:right;font-size:12px;font-weight:700">${(fc6*100).toFixed(1)}%</span></div>
        </div>
        <div class="iv-proj-row">
          <div class="pl">+12 meses</div>
          <div class="praw">${ivCOP(raw12)}</div>
          <div style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:999px;background:${dotColor(fc12)}"></span><span style="width:44px;text-align:right;font-size:12px;font-weight:700">${(fc12*100).toFixed(1)}%</span></div>
        </div>
        <div class="iv-proj-note">Inflación ${params.inf}%/año aplicada al costo de materia prima.</div>
      </div>
    </div>`;
}

function aplicarPrecioSugerido(prodId, precio) {
  const prod = productos.find(p => p.id === prodId);
  if (!prod) return;
  prod.precio = precio;
  abrirRecetaDetalle(prodId);
  showToast('✓ Precio actualizado a ' + ivCOP(precio));
}

// ═══════════════════════════════════════════════════
// PARÁMETROS
// ═══════════════════════════════════════════════════
let mermaOn = true;

function toggleMerma() {
  mermaOn = !mermaOn;
  params.merma = mermaOn;
  const sw = document.getElementById('toggle-merma-sw');
  const toggle = document.getElementById('toggle-merma');
  sw.classList.toggle('on', mermaOn);
  toggle.classList.toggle('on', mermaOn);
}

function guardarParams() {
  params.fc = parseInt(document.getElementById('param-fc').value);
  params.op = parseInt(document.getElementById('param-op').value);
  params.inf = parseInt(document.getElementById('param-inf').value);
  params.merma = mermaOn;
  closePanel('panel-params');
  showToast('✓ Parámetros actualizados');
  renderRecetasList();
  renderProductos();
}

// ═══════════════════════════════════════════════════
// UNIDADES
// ═══════════════════════════════════════════════════
function renderUnidades() {
  const card = document.getElementById('units-card');
  document.getElementById('units-count').textContent = customUnits.length;
  if (customUnits.length === 0) {
    card.innerHTML = `<div class="iv-units-emptywrap">
      <div class="iv-units-empty-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg></div>
      <div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:6px">Sin unidades propias</div>
      <p style="font-size:12px;color:#94A3B8;max-width:280px;margin:0 auto">Crea unidades personalizadas como "porción", "bandeja" o cualquier medida específica de tu restaurante.</p>
    </div>`;
    return;
  }
  card.innerHTML = customUnits.map(u => {
    const uses = insumos.filter(i => i.buyUnit === u.nombre || i.useUnit === u.nombre).length;
    return `<div class="iv-unit-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/></svg>
      <div class="iv-unit-name">${u.nombre} <span style="font-size:11px;color:#94A3B8">· propia</span></div>
      ${uses > 0 ? `<span class="iv-unit-use">En uso · ${uses} insumos</span>` : '<span class="iv-unit-nouse">Sin uso</span>'}
      <button class="iv-btn-sm" onclick="eliminarUnidad('${u.nombre}')" ${uses > 0 ? 'disabled title="En uso"' : ''}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`;
  }).join('');
}

function eliminarUnidad(nombre) {
  customUnits = customUnits.filter(u => u.nombre !== nombre);
  renderUnidades();
  showToast('Unidad eliminada');
}

document.getElementById('btn-nueva-unidad')?.addEventListener('click', () => {
  const nombre = prompt('Nombre de la nueva unidad:')?.trim();
  if (!nombre) return;
  if (customUnits.find(u => u.nombre === nombre)) { alert('Esa unidad ya existe'); return; }
  customUnits.push({ nombre });
  renderUnidades();
  showToast('✓ Unidad "' + nombre + '" creada');
});

// ═══════════════════════════════════════════════════
// PANELES — abrir/cerrar
// ═══════════════════════════════════════════════════
function closePanel(id) {
  document.getElementById(id).classList.add('is-hidden');
}

document.getElementById('btn-registrar-compra')?.addEventListener('click', abrirCompra);
document.getElementById('btn-nuevo-insumo')?.addEventListener('click', () => abrirEditorInsumo(null));
document.getElementById('nav-params')?.addEventListener('click', () => document.getElementById('panel-params').classList.remove('is-hidden'));
document.getElementById('side-alert')?.addEventListener('click', () => { showScreen('insumos'); renderInsumos('alerta'); });
document.getElementById('nav-unidades')?.addEventListener('click', () => showScreen('unidades'));

// cerrar overlay al hacer clic fuera del panel
document.querySelectorAll('.iv-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('is-hidden'); });
});

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('iv-toast');
  toast.textContent = msg;
  toast.classList.remove('is-hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('is-hidden'), 3000);
}

// ═══════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════
document.querySelectorAll('.iv-tab').forEach(tab => {
  tab.addEventListener('click', () => showScreen(tab.dataset.screen));
});

// búsqueda insumos
document.getElementById('ins-search')?.addEventListener('input', () => renderInsumos(activeFilter));

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
function init() {
  // Cargar nombre de usuario desde pos-core.js si está disponible
  try {
    const sb = iv_sb;
    if (sb) {
      sb.auth.getUser().then(({ data }) => {
        if (data?.user) {
          const meta = data.user.user_metadata || {};
          const initials = (meta.full_name || data.user.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
          document.getElementById('tb-avatar').textContent = initials;
          document.getElementById('tb-uname').textContent = meta.full_name || data.user.email;
          document.getElementById('tb-urole').textContent = meta.role || 'Usuario';
          document.getElementById('sb-brand').textContent = meta.restaurant_name || 'Comanda';
        }
      });
    }
  } catch(e) {}

  showScreen('productos');
  updateKPIs();
}

init();
