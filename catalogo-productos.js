/* Catálogo de Productos — Lumen POS — Toda la lógica */

// ── Supabase ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

// ── Paleta de categorías ──────────────────────────────────────────────────
const CAT_PALETTE = [
  {color:'#10B981',tint:'#ECFDF5',ring:'#A7F3D0'},
  {color:'#5B6BFF',tint:'#EEF2FF',ring:'#C7D2FE'},
  {color:'#F43F5E',tint:'#FFF1F2',ring:'#FECDD3'},
  {color:'#8B5CF6',tint:'#F5F3FF',ring:'#DDD6FE'},
  {color:'#0EA5E9',tint:'#F0F9FF',ring:'#BAE6FD'},
  {color:'#F59E0B',tint:'#FFFBEB',ring:'#FDE68A'},
  {color:'#EC4899',tint:'#FDF2F8',ring:'#FBCFE8'},
  {color:'#14B8A6',tint:'#F0FDFA',ring:'#99F6E4'},
];
const RULE_LABEL = {opcional:'Opcional',obligatorio:'Obligatorio'};
const fmt = n => '$' + (n||0).toLocaleString('es-CO');
const fmtDelta = n => n===0?'Incluido':(n>0?'+':'−')+'$'+Math.abs(n).toLocaleString('es-CO');
const uid = p => (p||'id')+'_'+Math.random().toString(36).slice(2,8);

// ── AI simulation data ────────────────────────────────────────────────────
const AI_EXTRACTION = {
  source:'menu-el-parche.pdf',
  stats:{categorias:6,productos:23,presentaciones:38,modificadores:11},
  categories:[
    {name:'Salchipapas',products:[
      {name:'Sencilla',pres:['Personal · $14.000','Familiar · $24.000'],mods:2},
      {name:'Premium Mixta',pres:['Personal · $16.000','Familiar · $28.000'],mods:3},
      {name:'Suprema Pollo',pres:['Personal · $17.000','Familiar · $30.000'],mods:2},
    ]},
    {name:'Hamburguesas',products:[
      {name:'Clásica',pres:['Sencilla · $18.000','Doble · $26.000'],mods:2},
      {name:'El Parche',pres:['Sencilla · $28.000','Doble · $38.000'],mods:3},
      {name:'Crispy Pollo',pres:['Única · $24.000'],mods:2},
    ]},
    {name:'Perros Calientes',products:[
      {name:'Sencillo',pres:['Único · $12.000'],mods:1},
      {name:'Especial',pres:['Único · $16.000'],mods:2},
      {name:'Ranchero',pres:['Único · $18.000'],mods:2},
    ]},
    {name:'Bebidas',products:[
      {name:'Gaseosa',pres:['350 ml · $4.500','1.5 L · $8.000'],mods:0},
      {name:'Limonada de Coco',pres:['Vaso · $12.000','Jarra · $28.000'],mods:0},
    ]},
  ],
};
const AI_STEPS = [
  {label:'Leyendo el documento',detail:'menu-el-parche.pdf · 3 páginas'},
  {label:'Detectando categorías',detail:'6 secciones identificadas'},
  {label:'Extrayendo productos y precios',detail:'23 productos · 38 presentaciones'},
  {label:'Identificando modificadores',detail:'11 grupos de adiciones'},
];

// ── Estado global ─────────────────────────────────────────────────────────
const S = {
  tab: 'productos',
  cats: [],
  products: [],
  combos: [],
  mods: [],
  filterCat: null,
  query: '',
  branchId: null,
  overlay: null,
  editProd: null,
  editCombo: null,
  editMod: null,
  editCat: null,
  // AI import state
  aiStage: 'source',
  aiTab: 'file',
  aiFile: null,
  aiUrl: '',
  aiStepIdx: 0,
  aiExcluded: {},
  aiOpenCat: null,
  aiTimers: [],
};

// ── Helpers localStorage ─────────────────────────────────────────────────
function lsGet(key, def) { try { const v=JSON.parse(localStorage.getItem(key)); return (Array.isArray(v)&&v.length)?v:def; } catch(e){ return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
function getCatColor(idx) { return CAT_PALETTE[idx % CAT_PALETTE.length]; }
function catPalette(cats) {
  // assign colors from localStorage or sequential
  const stored = JSON.parse(localStorage.getItem('lumen.cat.colors')||'{}');
  return cats.map((c,i) => ({
    ...c,
    ...(stored[c.id] ? stored[c.id] : getCatColor(i))
  }));
}
function saveCatColors(cats) {
  const map = {};
  cats.forEach(c => { map[c.id] = {color:c.color,tint:c.tint,ring:c.ring}; });
  lsSet('lumen.cat.colors', map);
}

// ── Supabase loaders ──────────────────────────────────────────────────────
async function loadBranch() {
  try {
    const {data} = await sb.from('branches').select('id').limit(1);
    S.branchId = data?.[0]?.id || null;
  } catch(e) { S.branchId = null; }
}

async function loadCategories() {
  try {
    const {data, error} = await sb.from('pos_categories').select('*').order('name');
    if(error || !data) return;
    S.cats = catPalette(data);
  } catch(e) {}
}

async function loadProducts() {
  try {
    const q = sb.from('pos_products').select('*').order('name');
    if(S.branchId) q.eq('branch_id', S.branchId);
    const {data, error} = await q;
    if(error || !data) return;
    // merge with localStorage meta (presentations, variables, modGroupIds)
    const meta = JSON.parse(localStorage.getItem('lumen.prod.meta')||'{}');
    S.products = data.map(p => ({
      id: p.id,
      cat: p.category_id || '_',
      name: p.name,
      desc: p.description || '',
      active: p.available !== false,
      photo: p.photo_url || null,
      price: p.price || 0,
      presentations: meta[p.id]?.presentations || [{id:uid('pr'),name:'Único',price:p.price||0}],
      variables:     meta[p.id]?.variables     || [],
      modGroupIds:   meta[p.id]?.modGroupIds   || [],
    }));
  } catch(e) {}
}

async function saveProductToSupabase(p) {
  try {
    const basePrice = p.presentations.length ? Math.min(...p.presentations.map(x=>x.price||0)) : 0;
    const row = {name:p.name, price:basePrice, category_id:p.cat==='_'?null:p.cat, available:p.active};
    if(S.branchId) row.branch_id = S.branchId;
    let id = p.id;
    if(!p.id || p.id.startsWith('p_')) {
      const {data} = await sb.from('pos_products').insert([row]).select().single();
      if(data) id = data.id;
    } else {
      await sb.from('pos_products').update(row).eq('id', p.id);
    }
    // Save extra meta to localStorage
    const meta = JSON.parse(localStorage.getItem('lumen.prod.meta')||'{}');
    meta[id] = {presentations:p.presentations, variables:p.variables, modGroupIds:p.modGroupIds};
    lsSet('lumen.prod.meta', meta);
    return id;
  } catch(e) { console.error('saveProduct:', e); return p.id; }
}

async function saveCategoryToSupabase(c) {
  try {
    const row = {name:c.name};
    if(S.branchId) row.branch_id = S.branchId;
    if(!c.id || c.id.startsWith('cat_')) {
      const {data} = await sb.from('pos_categories').insert([row]).select().single();
      if(data) return {...c, id:data.id};
    } else {
      await sb.from('pos_categories').update(row).eq('id', c.id);
    }
    return c;
  } catch(e) { console.error('saveCat:', e); return c; }
}

async function deleteCategoryFromSupabase(id) {
  try { await sb.from('pos_categories').delete().eq('id', id); } catch(e) {}
}

async function deleteProductFromSupabase(id) {
  try {
    await sb.from('pos_products').delete().eq('id', id);
    const meta = JSON.parse(localStorage.getItem('lumen.prod.meta')||'{}');
    delete meta[id];
    lsSet('lumen.prod.meta', meta);
  } catch(e) {}
}

// ── Helpers de UI ─────────────────────────────────────────────────────────
function toast(msg) {
  const el = $('cp-toast');
  if(!el) return;
  el.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9 11 14 8.5 11.5"/></svg> ${msg}`;
  el.style.display = 'flex';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display='none'; }, 2600);
}

function catOf(id) {
  return S.cats.find(c=>c.id===id) || {id:'_',name:'Sin categoría',color:'#94A3B8',tint:'#F1F5F9',ring:'#ECEEF2'};
}
function modById(id) { return S.mods.find(m=>m.id===id); }

// ── SVG icons ─────────────────────────────────────────────────────────────
function icon(name, size, sw) {
  size = size||16; sw = sw||2;
  const p = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  switch(name) {
    case 'back':    return `<svg ${p}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
    case 'box':     return `<svg ${p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
    case 'combo':   return `<svg ${p}><rect x="2" y="3" width="9" height="9" rx="1.5"/><rect x="13" y="3" width="9" height="9" rx="1.5"/><rect x="2" y="14" width="9" height="7" rx="1.5"/><rect x="13" y="14" width="9" height="7" rx="1.5"/></svg>`;
    case 'layers':  return `<svg ${p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
    case 'tag':     return `<svg ${p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    case 'sparkle': return `<svg ${p}><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>`;
    case 'plus':    return `<svg ${p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case 'x':       return `<svg ${p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    case 'trash':   return `<svg ${p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    case 'image':   return `<svg ${p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    case 'upload':  return `<svg ${p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
    case 'link':    return `<svg ${p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    case 'drive':   return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l3.43 6 6.56-11.5L7.71 3.5z" opacity=".9"/><path d="M22.85 15L16.29 3.5H9.43L16 15h6.85z" opacity=".7"/><path d="M4.58 21h13.13l3.43-6H8L4.58 21z" opacity=".5"/></svg>`;
    case 'check':   return `<svg ${p}><polyline points="20 6 9 17 4 12"/></svg>`;
    case 'checkc':  return `<svg ${p}><circle cx="12" cy="12" r="10"/><polyline points="16 9 11 14 8.5 11.5"/></svg>`;
    case 'chevron': return `<svg ${p}><polyline points="9 18 15 12 9 6"/></svg>`;
    case 'down':    return `<svg ${p}><polyline points="6 9 12 15 18 9"/></svg>`;
    case 'search':  return `<svg ${p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    case 'edit':    return `<svg ${p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`;
    case 'sliders': return `<svg ${p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;
    case 'file':    return `<svg ${p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    case 'grip':    return `<svg width="${size}" height="${size}" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>`;
    default: return '';
  }
}

// ── Render: nav sidebar ───────────────────────────────────────────────────
function renderNav() {
  const nav = $('cp-nav');
  if(!nav) return;
  const tabs = [
    {id:'back',    icon:'back',    label:'Regresar',    href:'dashboard.html'},
    {sep:true},
    {id:'productos',icon:'box',   label:'Productos',   badge:()=>S.products.length},
    {id:'combos',  icon:'combo',  label:'Combos',      badge:()=>S.combos.length},
    {id:'categorias',icon:'layers',label:'Categorías', badge:()=>S.cats.length},
    {id:'modificadores',icon:'tag',label:'Modificadores',badge:()=>S.mods.length},
    {sep:true},
    {id:'ai',      icon:'sparkle',label:'Importar con IA', ai:true},
  ];
  nav.innerHTML = tabs.map(t => {
    if(t.sep) return '<div class="cp-nav-divider"></div>';
    if(t.href) return `<a class="cp-nav-item" href="${t.href}"><span class="cp-nav-inner">${icon(t.icon,16)} ${t.label}</span></a>`;
    const active = S.tab === t.id ? ' active' : '';
    const aiClass = t.ai ? ' ai-item' : '';
    const badge = t.badge ? `<span class="cp-nav-badge">${t.badge()}</span>` : '';
    return `<button class="cp-nav-item${active}${aiClass}" onclick="setTab('${t.id}')"><span class="cp-nav-inner">${icon(t.icon,16)} ${t.label}</span>${badge}</button>`;
  }).join('');
}

function updateStats() {
  const sp = $('stat-products'), sc = $('stat-cats'), sm = $('stat-mods');
  if(sp) sp.textContent = S.products.length;
  if(sc) sc.textContent = S.cats.length;
  if(sm) sm.textContent = S.mods.length;
}

// ── Tab switching ─────────────────────────────────────────────────────────
function setTab(tab) {
  if(tab === 'ai') { openAIImport(); return; }
  S.tab = tab;
  S.filterCat = null;
  renderPage();
}

// ── Main page render ──────────────────────────────────────────────────────
function renderPage() {
  renderNav();
  updateStats();
  renderPageHead();
  renderTabsRow();
  renderFilterRow();
  renderBody();
}

function renderPageHead() {
  const titles = {productos:'Catálogo de productos',combos:'Combos',categorias:'Categorías',modificadores:'Modificadores'};
  const t = $('page-title'); if(t) t.textContent = titles[S.tab]||'Catálogo';
  const crumb = $('crumb-title'); if(crumb) crumb.textContent = titles[S.tab]||'Catálogo';
  const isManage = S.tab==='categorias'||S.tab==='modificadores';
  const actions = $('page-actions');
  if(!actions) return;
  if(isManage) { actions.innerHTML = ''; return; }
  let search = '';
  if(S.tab==='productos') {
    search = `<div class="cp-search">${icon('search',14)}<input id="cp-search-input" placeholder="Buscar producto…" value="${escHtml(S.query)}" oninput="onSearch(this.value)"></div>`;
  }
  actions.innerHTML = `${search}
    <button class="cc-btn-ai ghost" onclick="openAIImport()">${icon('sparkle',14)} Importar con IA</button>
    <button class="lm-btn-primary" onclick="openEditor(null,'${S.tab==='productos'?'product':'combo'}')">${icon('plus',14)} ${S.tab==='productos'?'Nuevo producto':'Nuevo combo'}</button>`;
}

function renderTabsRow() {
  const row = $('cp-tabs-row'); if(!row) return;
  const isManage = S.tab==='categorias'||S.tab==='modificadores';
  if(isManage) { row.innerHTML=''; return; }
  row.innerHTML = `
    <button class="cp-tab${S.tab==='productos'?' on':''}" onclick="setTab('productos')">${icon('box',15)} Productos <span class="cp-tab-n">${S.products.length}</span></button>
    <button class="cp-tab${S.tab==='combos'?' on':''}" onclick="setTab('combos')">${icon('combo',15)} Combos <span class="cp-tab-n">${S.combos.length}</span></button>`;
}

function renderFilterRow() {
  const row = $('cp-filter-row'); if(!row) return;
  if(S.tab!=='productos') { row.style.display='none'; return; }
  row.style.display='flex';
  const countAll = S.products.length;
  const catCount = id => S.products.filter(p=>p.cat===id).length;
  row.innerHTML = `
    <button class="cp-fchip${!S.filterCat?' on':''}" onclick="setFilter(null)">Todas <span class="chip-count">${countAll}</span></button>
    ${S.cats.map(c=>`
      <button class="cp-fchip${S.filterCat===c.id?' on':''}" onclick="setFilter('${c.id}')"
        style="${S.filterCat===c.id?`border-color:${c.color};color:${c.color};background:${c.tint}`:''}"
      ><span class="chip-dot" style="background:${c.color}"></span>${escHtml(c.name)} <span class="chip-count">${catCount(c.id)}</span></button>
    `).join('')}`;
}

function renderBody() {
  const body = $('cp-body'); if(!body) return;
  if(S.tab==='productos') { renderProductGrid(body); return; }
  if(S.tab==='combos')    { renderComboGrid(body); return; }
  if(S.tab==='categorias'){ renderCategoriesView(body); return; }
  if(S.tab==='modificadores'){ renderModifiersView(body); return; }
}

// ── Product grid ──────────────────────────────────────────────────────────
function renderProductGrid(body) {
  const q = S.query.trim().toLowerCase();
  const filtered = S.products.filter(p =>
    (!S.filterCat || p.cat===S.filterCat) &&
    (!q || p.name.toLowerCase().includes(q) || catOf(p.cat).name.toLowerCase().includes(q))
  );
  if(!filtered.length) {
    body.innerHTML = `<div class="cp-empty">
      <div class="cp-empty-icon">${icon('box',28,1.6)}</div>
      <h3>No hay productos en esta vista</h3>
      <p>Crea tu primer producto manualmente o deja que la IA arme el catálogo desde tu carta en PDF o imagen.</p>
      <div class="cp-empty-actions">
        <button class="cc-btn-ai" onclick="openAIImport()">${icon('sparkle',14)} Importar con IA</button>
        <button class="lm-btn-ghost" onclick="openEditor(null,'product')">${icon('plus',14)} Nuevo producto</button>
      </div></div>`;
    return;
  }
  body.innerHTML = `<div class="cp-card-grid">${filtered.map(p=>productCardHTML(p)).join('')}</div>`;
}

function productCardHTML(p) {
  const cat = catOf(p.cat);
  const prices = p.presentations.map(x=>x.price).filter(Boolean);
  const range = prices.length ? (Math.min(...prices)===Math.max(...prices)?fmt(prices[0]):`${fmt(Math.min(...prices))} – ${fmt(Math.max(...prices))}`) : '—';
  const groups = (p.modGroupIds||[]).map(modById).filter(Boolean);
  const opts = groups.reduce((a,g)=>a+g.options.length,0);
  const varGroups = p.variables||[];
  const varOpts = varGroups.reduce((a,v)=>a+v.options.length,0);
  const thumb = p.photo
    ? `<img class="cp-thumb-img" src="${escHtml(p.photo)}" alt="">`
    : `<div class="cp-thumb-placeholder"><span class="cp-thumb-label">foto · ${escHtml(cat.name.toLowerCase())}</span></div>`;
  const inactive = p.active ? '' : `<span class="cp-inactive-chip">Inactivo</span>`;
  const varTag = varGroups.length ? `<span class="cp-meta-tag var">${icon('sliders',12)} ${varOpts} variables</span>` : '';
  return `<div class="cp-card" style="${p.active?'':'opacity:.72'}" onclick="openEditor('${p.id}','product')">
    <div class="cp-thumb">
      ${thumb}
      <span class="cp-cat-chip" style="color:${cat.color};background:${cat.tint}">${escHtml(cat.name)}</span>
      ${inactive}
    </div>
    <div class="cp-card-body">
      <div class="cp-card-row">
        <div class="cp-card-name">${escHtml(p.name)}</div>
        <div class="cp-card-price">${range}</div>
      </div>
      ${p.desc?`<div class="cp-card-desc">${escHtml(p.desc)}</div>`:''}
      <div class="cp-meta-row">
        <span class="cp-meta-tag">${icon('layers',12)} ${p.presentations.length} ${p.presentations.length===1?'presentación':'presentaciones'}</span>
        ${varTag}
        <span class="cp-meta-tag">${icon('tag',12)} ${groups.length?`${groups.length} ${groups.length===1?'grupo':'grupos'} · ${opts} adic.`:'Sin adiciones'}</span>
      </div>
    </div>
    <div class="cp-card-foot" onclick="event.stopPropagation()">
      <button class="cp-switch${p.active?' on':''}" onclick="toggleProduct('${p.id}')">
        <span class="cp-switch-lbl">${p.active?'Activo':'Inactivo'}</span>
        <span class="cp-switch-track"><span class="cp-switch-knob"></span></span>
      </button>
      <button class="cp-card-edit-btn" onclick="openEditor('${p.id}','product')">Editar ${icon('chevron',13)}</button>
    </div>
  </div>`;
}

function toggleProduct(id) {
  const p = S.products.find(x=>x.id===id);
  if(!p) return;
  p.active = !p.active;
  // Update in Supabase
  sb.from('pos_products').update({available:p.active}).eq('id',id).then(()=>{});
  renderBody();
}

// ── Combo grid ────────────────────────────────────────────────────────────
function renderComboGrid(body) {
  if(!S.combos.length) {
    body.innerHTML = `<div class="cp-empty">
      <div class="cp-empty-icon">${icon('combo',28,1.6)}</div>
      <h3>No hay combos creados</h3>
      <p>Crea combos para ofrecer productos juntos a un precio especial.</p>
      <div class="cp-empty-actions">
        <button class="lm-btn-primary" onclick="openEditor(null,'combo')">${icon('plus',14)} Nuevo combo</button>
      </div></div>`;
    return;
  }
  body.innerHTML = `<div class="cp-card-grid">${S.combos.map(c=>comboCardHTML(c)).join('')}</div>`;
}

function comboCardHTML(c) {
  const thumb = c.photo
    ? `<img class="cp-thumb-img" src="${escHtml(c.photo)}" alt="">`
    : `<div class="cp-thumb-placeholder"><span class="cp-thumb-label">foto · combo</span></div>`;
  const inactive = c.active ? '' : `<span class="cp-inactive-chip">Inactivo</span>`;
  const items = (c.items||[]).map(it=>`<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:#475569"><span style="color:#8B5CF6;display:flex">${icon('check',12,3)}</span>${escHtml(it.name)}</div>`).join('');
  return `<div class="cp-card" style="${c.active?'':'opacity:.72'}" onclick="openEditor('${c.id}','combo')">
    <div class="cp-thumb">
      ${thumb}
      <span class="cp-cat-chip" style="color:#8B5CF6;background:#F5F3FF">Combo</span>
      ${inactive}
    </div>
    <div class="cp-card-body">
      <div class="cp-card-row">
        <div class="cp-card-name">${escHtml(c.name)}</div>
        <div class="cp-card-price">${fmt(c.price)}</div>
      </div>
      ${c.desc?`<div class="cp-card-desc">${escHtml(c.desc)}</div>`:''}
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:10px">${items}</div>
    </div>
    <div class="cp-card-foot" onclick="event.stopPropagation()">
      <button class="cp-switch${c.active?' on':''}" onclick="toggleCombo('${c.id}')">
        <span class="cp-switch-lbl">${c.active?'Activo':'Inactivo'}</span>
        <span class="cp-switch-track"><span class="cp-switch-knob"></span></span>
      </button>
      <button class="cp-card-edit-btn" onclick="openEditor('${c.id}','combo')">Editar ${icon('chevron',13)}</button>
    </div>
  </div>`;
}

function toggleCombo(id) {
  const c = S.combos.find(x=>x.id===id);
  if(!c) return;
  c.active = !c.active;
  lsSet('lumen.combos', S.combos);
  renderBody();
}

// ── Categories view ───────────────────────────────────────────────────────
function renderCategoriesView(body) {
  const count = id => S.products.filter(p=>p.cat===id).length;
  const cards = S.cats.map(c => {
    const n = count(c.id);
    const canDel = n===0;
    return `<div class="cp-card" style="cursor:default;padding:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:44px;height:44px;border-radius:12px;background:${c.tint};color:${c.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon('layers',20)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:#0F172A">${escHtml(c.name)}</div>
          <div style="font-size:11.5px;color:#94A3B8;margin-top:1px">${n} ${n===1?'producto':'productos'}</div>
        </div>
        <span style="width:14px;height:14px;border-radius:999px;background:${c.color};flex-shrink:0"></span>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #F1F5F9">
        <button class="lm-btn-ghost sm" style="flex:1" onclick="openCatEditor('${c.id}')">${icon('edit',13)} Editar</button>
        <button class="cc-mini-del" ${canDel?'':'disabled title="Mueve o elimina sus productos primero"'} onclick="deleteCat('${c.id}')">${icon('trash',14)}</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = `<div>
    <div class="cp-view-head">
      <div>
        <div style="font-size:14px;font-weight:800;color:#0F172A">Categorías del menú</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:2px">Organizan los productos. Las usarás al crear cada producto.</div>
      </div>
      <button class="lm-btn-primary" onclick="openCatEditor(null)">${icon('plus',14)} Nueva categoría</button>
    </div>
    <div class="cp-cat-grid">
      ${cards}
      <button class="cp-add-tile" onclick="openCatEditor(null)">
        <div class="cp-add-tile-icon">${icon('plus',20)}</div>
        <span>Crear categoría</span>
      </button>
    </div>
  </div>`;
}

async function deleteCat(id) {
  const n = S.products.filter(p=>p.cat===id).length;
  if(n>0) return;
  await deleteCategoryFromSupabase(id);
  S.cats = S.cats.filter(c=>c.id!==id);
  saveCatColors(S.cats);
  renderPage();
  toast('Categoría eliminada');
}

// ── Modifiers view ────────────────────────────────────────────────────────
function renderModifiersView(body) {
  const usedBy = id => S.products.filter(p=>(p.modGroupIds||[]).includes(id)).length;
  const cards = S.mods.map(g => {
    const uses = usedBy(g.id);
    const ruleColor = g.rule==='obligatorio' ? {color:'#B45309',bg:'#FEF3C7'} : {color:'#64748B',bg:'#F1F5F9'};
    const opts = g.options.map(o=>`<span class="cc-opt-chip">${escHtml(o.name)}<span style="color:${o.price?'#16A34A':'#94A3B8'};font-weight:700;margin-left:5px">${fmtDelta(o.price)}</span></span>`).join('');
    return `<div class="cp-card" style="cursor:default;padding:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:38px;height:38px;border-radius:10px;background:#FFFBEB;color:#F59E0B;display:flex;align-items:center;justify-content:center">${icon('tag',17)}</span>
          <div>
            <div style="font-size:14.5px;font-weight:700;color:#0F172A">${escHtml(g.name)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
              <span class="cc-rule-chip" style="color:${ruleColor.color};background:${ruleColor.bg}">${RULE_LABEL[g.rule]}</span>
              <span class="cc-rule-chip" style="color:#64748B;background:#F1F5F9">${g.multi?'Varias':'Una'}</span>
            </div>
          </div>
        </div>
        <span class="cc-used-chip">${uses} ${uses===1?'producto':'productos'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px">${opts}</div>
      <div style="display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #F1F5F9">
        <button class="lm-btn-ghost sm" style="flex:1" onclick="openModEditor('${g.id}')">${icon('edit',13)} Editar grupo</button>
        <button class="cc-mini-del" ${uses?'disabled title="Lo usan productos activos"':''} onclick="deleteMod('${g.id}')">${icon('trash',14)}</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = `<div>
    <div class="cp-view-head">
      <div>
        <div style="font-size:14px;font-weight:800;color:#0F172A">Grupos de modificadores</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:2px">Crea grupos (ej. "Adiciones") y reutilízalos activándolos en cada producto.</div>
      </div>
      <button class="lm-btn-primary" onclick="openModEditor(null)">${icon('plus',14)} Nuevo grupo</button>
    </div>
    <div class="cp-mod-grid">
      ${cards}
      <button class="cp-add-tile" onclick="openModEditor(null)">
        <div class="cp-add-tile-icon" style="background:#FFFBEB;color:#F59E0B">${icon('plus',20)}</div>
        <span>Crear grupo</span>
      </button>
    </div>
  </div>`;
}

function deleteMod(id) {
  const uses = S.products.filter(p=>(p.modGroupIds||[]).includes(id)).length;
  if(uses>0) return;
  S.mods = S.mods.filter(m=>m.id!==id);
  S.products = S.products.map(p=>({...p,modGroupIds:(p.modGroupIds||[]).filter(x=>x!==id)}));
  lsSet('lumen.mods', S.mods);
  renderPage();
  toast('Grupo eliminado');
}

// ── Filter & search ────────────────────────────────────────────────────────
function setFilter(catId) {
  S.filterCat = catId;
  renderFilterRow();
  renderBody();
}

function onSearch(val) {
  S.query = val;
  renderBody();
}

// ── Overlay management ────────────────────────────────────────────────────
function closeOverlay() {
  const el = $('cp-overlay'); if(el) el.innerHTML='';
  S.overlay=null;
  S.aiTimers.forEach(clearTimeout); S.aiTimers=[];
}

function openOverlay(html) {
  const el = $('cp-overlay'); if(el) el.innerHTML=html;
}

// ── Product Editor ────────────────────────────────────────────────────────
function openEditor(id, type) {
  if(type==='product') {
    const existing = id ? S.products.find(p=>p.id===id) : null;
    S.editProd = existing ? JSON.parse(JSON.stringify(existing)) : {
      id:uid('p'), cat:(S.cats[0]||{}).id||'_', name:'', desc:'', active:true, photo:null,
      presentations:[{id:uid('pr'),name:'',price:0}], variables:[], modGroupIds:[],
    };
    S.overlay = 'product';
    renderProductEditor();
  } else {
    const existing = id ? S.combos.find(c=>c.id===id) : null;
    S.editCombo = existing ? JSON.parse(JSON.stringify(existing)) : {
      id:uid('c'), name:'', desc:'', price:0, active:true, photo:null, items:[{name:''}],
    };
    S.overlay = 'combo';
    renderComboEditor();
  }
}

function renderProductEditor() {
  const p = S.editProd;
  const isNew = !S.products.find(x=>x.id===p.id);
  const cat = catOf(p.cat);
  const priceRange = () => {
    const ps = p.presentations.map(x=>x.price).filter(Boolean);
    if(!ps.length) return '—';
    const lo=Math.min(...ps),hi=Math.max(...ps);
    return lo===hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
  };
  const canSave = p.name.trim() && p.presentations.some(x=>x.name.trim()&&x.price>0);
  const catOptions = S.cats.map(c=>`<option value="${c.id}" ${p.cat===c.id?'selected':''}>${escHtml(c.name)}</option>`).join('');
  const presRows = p.presentations.map((pr,i)=>`
    <div class="cp-pres-row" id="pres-row-${pr.id}">
      <span class="cc-grip">${icon('grip',14)}</span>
      <input class="cc-input flat" value="${escHtml(pr.name)}" placeholder="Nombre (ej. Familiar)" style="flex:1" oninput="setPres('${pr.id}','name',this.value)">
      <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="${pr.price||''}" placeholder="0" oninput="setPres('${pr.id}','price',parseInt(this.value)||0)"></div>
      <button class="cc-mini-del" ${p.presentations.length===1?'disabled':''} onclick="delPres('${pr.id}')">${icon('trash',13)}</button>
    </div>`).join('');
  const varSections = p.variables.length===0
    ? `<button class="cc-add-group" onclick="addVar()">${icon('sliders',15)} Agregar una variable (ej. Proteína: Pollo / Carne / Mixta)</button>`
    : p.variables.map(v=>`
      <div class="cc-var-card" id="var-${v.id}">
        <div class="cc-var-head">
          <span class="cc-var-tag">${icon('sliders',12)} Elección única</span>
          <input class="cc-input flat" style="flex:1;font-weight:700" value="${escHtml(v.name)}" placeholder="Nombre (ej. Proteína)" oninput="setVar('${v.id}','name',this.value)">
          <button class="cc-mini-del" onclick="delVar('${v.id}')">${icon('trash',13)}</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
          ${v.options.map(o=>`
            <div class="cp-pres-row">
              <span class="cc-var-dot"></span>
              <input class="cc-input flat" style="flex:1" value="${escHtml(o.name)}" placeholder="Opción (ej. Mixta)" oninput="setVarOpt('${v.id}','${o.id}','name',this.value)">
              <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="${o.price||''}" placeholder="0" oninput="setVarOpt('${v.id}','${o.id}','price',parseInt(this.value)||0)"></div>
              <button class="cc-mini-del" ${v.options.length===1?'disabled':''} onclick="delVarOpt('${v.id}','${o.id}')">${icon('x',13)}</button>
            </div>`).join('')}
        </div>
        <button class="lm-link" style="margin-top:8px" onclick="addVarOpt('${v.id}')">+ Agregar opción</button>
      </div>`).join('');
  const modRows = S.mods.length===0
    ? `<button class="cc-add-group" onclick="openModEditorInProduct()">${icon('plus',15)} Crear el primer grupo de modificadores</button>`
    : S.mods.map(g=>{
        const on = (p.modGroupIds||[]).includes(g.id);
        return `<button class="cc-modtoggle${on?' on':''}" onclick="toggleModGroup('${g.id}')">
          <span class="cc-check${on?' on':''}">${on?icon('check',12,3):''}</span>
          <div style="flex:1;min-width:0;text-align:left">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="font-size:13px;font-weight:700;color:#0F172A">${escHtml(g.name)}</span>
              <span class="cc-tiny-chip">${RULE_LABEL[g.rule]}</span>
              <span class="cc-tiny-chip">${g.multi?'Varias':'Una'}</span>
            </div>
            <div style="font-size:11px;color:#94A3B8;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.options.map(o=>o.name).join(' · ')}</div>
          </div>
          <span style="font-size:10.5px;font-weight:700;color:#94A3B8;flex-shrink:0">${g.options.length} opc.</span>
        </button>`;
      }).join('');
  const photoHTML = p.photo
    ? `<div class="cc-photo-wrap">
        <img src="${escHtml(p.photo)}" alt="">
        <div class="cc-photo-overlay">
          <button class="cc-pill-btn" onclick="document.getElementById('prod-photo-input').click()">${icon('image',13)} Cambiar</button>
          <button class="cc-pill-btn danger" onclick="setProdPhoto(null)">${icon('trash',13)} Quitar</button>
        </div>
      </div>`
    : `<div class="cc-drop" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="handleProdPhotoDrop(event)" onclick="document.getElementById('prod-photo-input').click()">
        <div class="cc-drop-icon">${icon('upload',20)}</div>
        <div style="font-size:13px;font-weight:700;color:#0F172A">Foto del producto</div>
        <div style="font-size:11.5px;color:#94A3B8;margin-top:3px">Arrastra una imagen o <span style="color:#5B6BFF;font-weight:700">búscala en tu equipo</span></div>
      </div>
      <div class="cc-url-row">
        <span style="color:#94A3B8;display:flex">${icon('link',14)}</span>
        <input id="prod-photo-url" placeholder="…o pega un enlace de imagen / Drive" style="flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:12.5px">
        <button class="lm-link" onclick="useProdPhotoUrl()">Usar</button>
      </div>`;
  openOverlay(`
    <div class="cc-overlay" onmousedown="handleOverlayClose(event)">
      <aside class="cc-drawer" onmousedown="event.stopPropagation()">
        <div class="cc-drawer-head">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="cc-drawer-glyph" style="color:${cat.color};background:${cat.tint}">${icon('box',17)}</span>
            <div>
              <div class="cc-drawer-eyebrow">${isNew?'Nuevo producto':'Editar producto'}</div>
              <div class="cc-drawer-title" id="ed-prod-title">${escHtml(p.name)||'Sin nombre'}</div>
            </div>
          </div>
          <button class="lm-icon-sm" onclick="closeOverlay()">${icon('x',15)}</button>
        </div>
        <div class="cc-drawer-body">
          <input type="file" id="prod-photo-input" accept="image/*" style="display:none" onchange="handleProdPhotoFile(this)">
          ${photoHTML}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px">
            <label><span class="field-label">Nombre del producto</span>
              <input class="cc-input" value="${escHtml(p.name)}" placeholder="Ej. Premium Mixta" oninput="setProdName(this.value)"></label>
            <label><span class="field-label">Categoría</span>
              <div class="cc-select">
                <select onchange="setProdCat(this.value)">${catOptions}</select>
                <span class="cc-sel-arrow">${icon('down',14)}</span>
              </div>
            </label>
          </div>
          <div style="margin-top:12px"><label><span class="field-label">Descripción <span class="hint">· opcional</span></span>
            <textarea class="cc-input" rows="2" placeholder="Ingredientes, detalles del plato…" oninput="setProdDesc(this.value)">${escHtml(p.desc||'')}</textarea>
          </label></div>
          <div class="cc-section">
            <div class="cc-section-head">
              <div><div class="cc-section-title">Presentaciones</div><div class="cc-section-sub">Tamaño o variable del producto (Personal, Familiar, 1.5L…). Cada una con su precio.</div></div>
              <button class="lm-btn-ghost sm" onclick="addPres()">${icon('plus',13)} Agregar</button>
            </div>
            <div id="pres-list" style="display:flex;flex-direction:column;gap:8px">${presRows}</div>
          </div>
          <div class="cc-section">
            <div class="cc-section-head">
              <div><div class="cc-section-title">Variables</div><div class="cc-section-sub">Definen el producto y el cliente elige <strong>una</strong> opción por grupo (proteína, sabor, término…).</div></div>
              <button class="lm-btn-ghost sm" onclick="addVar()">${icon('plus',13)} Variable</button>
            </div>
            <div id="var-list">${varSections}</div>
          </div>
          <div class="cc-section">
            <div class="cc-section-head">
              <div><div class="cc-section-title">Modificadores</div><div class="cc-section-sub">Activa los grupos que aplican a este producto. Se administran en la sección <strong>Modificadores</strong>.</div></div>
              <button class="lm-btn-ghost sm" onclick="openModEditorInProduct()">${icon('plus',13)} Crear grupo</button>
            </div>
            <div id="mod-list">${modRows}</div>
          </div>
        </div>
        <div class="cc-drawer-foot">
          <div style="display:flex;flex-direction:column">
            <span style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Rango de precio</span>
            <span id="ed-price-range" style="font-size:15px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${priceRange()}</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>
            <button class="lm-btn-primary" id="save-prod-btn" ${canSave?'':'disabled'} onclick="saveProduct()">${icon('check',14)} Guardar producto</button>
          </div>
        </div>
      </aside>
    </div>`);
}

// Product editor helpers (mutate S.editProd and re-render sections)
function setProdName(v) { S.editProd.name=v; const t=$('ed-prod-title'); if(t) t.textContent=v||'Sin nombre'; updateSaveProdBtn(); }
function setProdCat(v)  { S.editProd.cat=v; }
function setProdDesc(v) { S.editProd.desc=v; }
function setProdPhoto(src) { S.editProd.photo=src; renderProductEditor(); }
function useProdPhotoUrl() { const el=$('prod-photo-url'); if(el&&el.value.trim()) setProdPhoto(el.value.trim()); }
function handleProdPhotoFile(inp) { const f=inp.files[0]; if(!f||!f.type.startsWith('image/')) return; const r=new FileReader(); r.onload=e=>setProdPhoto(e.target.result); r.readAsDataURL(f); }
function handleProdPhotoDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('over'); const f=e.dataTransfer.files[0]; if(f) { const r=new FileReader(); r.onload=ev=>setProdPhoto(ev.target.result); r.readAsDataURL(f); } }

function addPres() { S.editProd.presentations.push({id:uid('pr'),name:'',price:0}); refreshPresList(); updatePriceRange(); }
function delPres(id) { if(S.editProd.presentations.length===1) return; S.editProd.presentations=S.editProd.presentations.filter(x=>x.id!==id); refreshPresList(); updatePriceRange(); }
function setPres(id, field, val) { const pr=S.editProd.presentations.find(x=>x.id===id); if(pr) { pr[field]=val; if(field==='price') updatePriceRange(); updateSaveProdBtn(); } }
function updatePriceRange() { const el=$('ed-price-range'); if(!el) return; const ps=S.editProd.presentations.map(x=>x.price).filter(Boolean); el.textContent=ps.length?(Math.min(...ps)===Math.max(...ps)?fmt(Math.min(...ps)):`${fmt(Math.min(...ps))} – ${fmt(Math.max(...ps))}`):'—'; }
function refreshPresList() {
  const el=$('pres-list'); if(!el) return;
  el.innerHTML=S.editProd.presentations.map(pr=>`
    <div class="cp-pres-row">
      <span class="cc-grip">${icon('grip',14)}</span>
      <input class="cc-input flat" value="${escHtml(pr.name)}" placeholder="Nombre (ej. Familiar)" style="flex:1" oninput="setPres('${pr.id}','name',this.value)">
      <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="${pr.price||''}" placeholder="0" oninput="setPres('${pr.id}','price',parseInt(this.value)||0)"></div>
      <button class="cc-mini-del" ${S.editProd.presentations.length===1?'disabled':''} onclick="delPres('${pr.id}')">${icon('trash',13)}</button>
    </div>`).join('');
}
function addVar() { S.editProd.variables.push({id:uid('vg'),name:'',options:[{id:uid('vo'),name:'',price:0}]}); refreshVarList(); }
function delVar(vid) { S.editProd.variables=S.editProd.variables.filter(v=>v.id!==vid); refreshVarList(); }
function setVar(vid,f,v) { const vg=S.editProd.variables.find(x=>x.id===vid); if(vg) vg[f]=v; }
function addVarOpt(vid) { const vg=S.editProd.variables.find(x=>x.id===vid); if(vg) { vg.options.push({id:uid('vo'),name:'',price:0}); refreshVarList(); } }
function delVarOpt(vid,oid) { const vg=S.editProd.variables.find(x=>x.id===vid); if(vg&&vg.options.length>1) { vg.options=vg.options.filter(o=>o.id!==oid); refreshVarList(); } }
function setVarOpt(vid,oid,f,v) { const vg=S.editProd.variables.find(x=>x.id===vid); if(vg) { const o=vg.options.find(x=>x.id===oid); if(o) o[f]=v; } }
function refreshVarList() {
  const el=$('var-list'); if(!el) return;
  if(!S.editProd.variables.length) { el.innerHTML=`<button class="cc-add-group" onclick="addVar()">${icon('sliders',15)} Agregar una variable (ej. Proteína: Pollo / Carne / Mixta)</button>`; return; }
  el.innerHTML=S.editProd.variables.map(v=>`
    <div class="cc-var-card">
      <div class="cc-var-head">
        <span class="cc-var-tag">${icon('sliders',12)} Elección única</span>
        <input class="cc-input flat" style="flex:1;font-weight:700" value="${escHtml(v.name)}" placeholder="Nombre (ej. Proteína)" oninput="setVar('${v.id}','name',this.value)">
        <button class="cc-mini-del" onclick="delVar('${v.id}')">${icon('trash',13)}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
        ${v.options.map(o=>`
          <div class="cp-pres-row">
            <span class="cc-var-dot"></span>
            <input class="cc-input flat" style="flex:1" value="${escHtml(o.name)}" placeholder="Opción" oninput="setVarOpt('${v.id}','${o.id}','name',this.value)">
            <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="${o.price||''}" placeholder="0" oninput="setVarOpt('${v.id}','${o.id}','price',parseInt(this.value)||0)"></div>
            <button class="cc-mini-del" ${v.options.length===1?'disabled':''} onclick="delVarOpt('${v.id}','${o.id}')">${icon('x',13)}</button>
          </div>`).join('')}
      </div>
      <button class="lm-link" style="margin-top:8px" onclick="addVarOpt('${v.id}')">+ Agregar opción</button>
    </div>`).join('');
}
function toggleModGroup(gid) {
  const ids=S.editProd.modGroupIds||[];
  S.editProd.modGroupIds=ids.includes(gid)?ids.filter(x=>x!==gid):[...ids,gid];
  const el=$('mod-list'); if(!el) return;
  el.querySelectorAll('.cc-modtoggle').forEach(btn => {
    const onBtn = btn.getAttribute('onclick').includes(`'${gid}'`);
    if(!onBtn) return;
    const on = S.editProd.modGroupIds.includes(gid);
    btn.classList.toggle('on',on);
    const chk=btn.querySelector('.cc-check'); if(chk){chk.classList.toggle('on',on);chk.innerHTML=on?icon('check',12,3):'';}
  });
}
function updateSaveProdBtn() { const btn=$('save-prod-btn'); if(btn) btn.disabled=!(S.editProd.name.trim()&&S.editProd.presentations.some(x=>x.name.trim()&&x.price>0)); }
async function saveProduct() {
  const p=S.editProd;
  if(!p.name.trim()) return;
  const savedId = await saveProductToSupabase(p);
  p.id = savedId;
  const idx=S.products.findIndex(x=>x.id===p.id);
  if(idx>=0) S.products[idx]=p; else S.products.unshift(p);
  closeOverlay();
  renderPage();
  toast(`Producto "${p.name}" guardado`);
}

// ── Mod editor in product context ─────────────────────────────────────────
function openModEditorInProduct() { openModEditor(null, true); }

// ── Combo Editor ──────────────────────────────────────────────────────────
function renderComboEditor() {
  const c=S.editCombo;
  const isNew=!S.combos.find(x=>x.id===c.id);
  const canSave=c.name.trim()&&c.price>0&&c.items.some(x=>x.name.trim());
  const itemRows=c.items.map((it,i)=>`
    <div class="cp-pres-row">
      <span class="cc-item-num">${i+1}</span>
      <input class="cc-input flat" value="${escHtml(it.name)}" placeholder="Ej. 2 Hamburguesas Sencillas" style="flex:1" oninput="setComboItem(${i},this.value)">
      <button class="cc-mini-del" ${c.items.length===1?'disabled':''} onclick="delComboItem(${i})">${icon('trash',13)}</button>
    </div>`).join('');
  const photoHTML=c.photo
    ?`<div class="cc-photo-wrap"><img src="${escHtml(c.photo)}" alt=""><div class="cc-photo-overlay"><button class="cc-pill-btn" onclick="document.getElementById('combo-photo-input').click()">${icon('image',13)} Cambiar</button><button class="cc-pill-btn danger" onclick="setComboPhoto(null)">${icon('trash',13)} Quitar</button></div></div>`
    :`<div class="cc-drop" onclick="document.getElementById('combo-photo-input').click()"><div class="cc-drop-icon">${icon('upload',20)}</div><div style="font-size:13px;font-weight:700;color:#0F172A">Foto del combo</div><div style="font-size:11.5px;color:#94A3B8;margin-top:3px">Arrastra una imagen o <span style="color:#5B6BFF;font-weight:700">búscala en tu equipo</span></div></div>`;
  openOverlay(`
    <div class="cc-overlay" onmousedown="handleOverlayClose(event)">
      <aside class="cc-drawer" onmousedown="event.stopPropagation()">
        <div class="cc-drawer-head">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="cc-drawer-glyph" style="color:#8B5CF6;background:#F5F3FF">${icon('combo',16)}</span>
            <div><div class="cc-drawer-eyebrow">${isNew?'Nuevo combo':'Editar combo'}</div>
              <div class="cc-drawer-title">${escHtml(c.name)||'Sin nombre'}</div></div>
          </div>
          <button class="lm-icon-sm" onclick="closeOverlay()">${icon('x',15)}</button>
        </div>
        <div class="cc-drawer-body">
          <input type="file" id="combo-photo-input" accept="image/*" style="display:none" onchange="handleComboPhotoFile(this)">
          ${photoHTML}
          <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:12px;margin-top:18px">
            <label><span class="field-label">Nombre del combo</span>
              <input class="cc-input" value="${escHtml(c.name)}" placeholder="Ej. Combo El Parche x2" oninput="setComboName(this.value)"></label>
            <label><span class="field-label">Precio del combo</span>
              <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="1000" value="${c.price||''}" placeholder="0" oninput="setComboPrice(parseInt(this.value)||0)"></div></label>
          </div>
          <div style="margin-top:12px"><label><span class="field-label">Descripción <span class="hint">· opcional</span></span>
            <input class="cc-input" value="${escHtml(c.desc||'')}" placeholder="Ideal para compartir…" oninput="setComboDesc(this.value)"></label></div>
          <div class="cc-section">
            <div class="cc-section-head">
              <div><div class="cc-section-title">Productos incluidos</div><div class="cc-section-sub">Qué trae el combo. Puedes escribir cantidades y presentaciones.</div></div>
              <button class="lm-btn-ghost sm" onclick="addComboItem()">${icon('plus',13)} Ítem</button>
            </div>
            <div id="combo-items">${itemRows}</div>
          </div>
        </div>
        <div class="cc-drawer-foot">
          <div style="display:flex;flex-direction:column">
            <span style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Precio combo</span>
            <span id="combo-price-display" style="font-size:15px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${fmt(c.price)}</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>
            <button class="lm-btn-primary" id="save-combo-btn" ${canSave?'':'disabled'} onclick="saveCombo()">${icon('check',14)} Guardar combo</button>
          </div>
        </div>
      </aside>
    </div>`);
}
function setComboName(v) { S.editCombo.name=v; updateComboSaveBtn(); }
function setComboPrice(v) { S.editCombo.price=v; const el=$('combo-price-display'); if(el) el.textContent=fmt(v); updateComboSaveBtn(); }
function setComboDesc(v) { S.editCombo.desc=v; }
function setComboPhoto(src) { S.editCombo.photo=src; renderComboEditor(); }
function handleComboPhotoFile(inp) { const f=inp.files[0]; if(!f||!f.type.startsWith('image/')) return; const r=new FileReader(); r.onload=e=>setComboPhoto(e.target.result); r.readAsDataURL(f); }
function setComboItem(i,v) { S.editCombo.items[i].name=v; updateComboSaveBtn(); }
function addComboItem() { S.editCombo.items.push({name:''}); refreshComboItems(); }
function delComboItem(i) { if(S.editCombo.items.length===1) return; S.editCombo.items.splice(i,1); refreshComboItems(); }
function refreshComboItems() {
  const el=$('combo-items'); if(!el) return;
  el.innerHTML=S.editCombo.items.map((it,i)=>`
    <div class="cp-pres-row">
      <span class="cc-item-num">${i+1}</span>
      <input class="cc-input flat" value="${escHtml(it.name)}" placeholder="Ej. 2 Hamburguesas Sencillas" style="flex:1" oninput="setComboItem(${i},this.value)">
      <button class="cc-mini-del" ${S.editCombo.items.length===1?'disabled':''} onclick="delComboItem(${i})">${icon('trash',13)}</button>
    </div>`).join('');
}
function updateComboSaveBtn() { const btn=$('save-combo-btn'); if(btn) btn.disabled=!(S.editCombo.name.trim()&&S.editCombo.price>0&&S.editCombo.items.some(x=>x.name.trim())); }
function saveCombo() {
  const c=S.editCombo;
  const idx=S.combos.findIndex(x=>x.id===c.id);
  if(idx>=0) S.combos[idx]=c; else S.combos.unshift(c);
  lsSet('lumen.combos',S.combos);
  closeOverlay();
  renderPage();
  toast(`Combo "${c.name}" guardado`);
}

// ── Mod Group Editor ──────────────────────────────────────────────────────
function openModEditor(id, fromProduct) {
  const existing = id ? S.mods.find(m=>m.id===id) : null;
  S.editMod = existing ? JSON.parse(JSON.stringify(existing)) : {id:uid('mg'),name:'',rule:'opcional',multi:true,options:[{id:uid('op'),name:'',price:0}]};
  S.editMod._fromProduct = !!fromProduct;
  renderModEditor();
}
function renderModEditor() {
  const g=S.editMod;
  const isNew=!S.mods.find(x=>x.id===g.id);
  const canSave=g.name.trim()&&g.options.some(o=>o.name.trim());
  const optRows=g.options.map(o=>`
    <div class="cp-pres-row">
      <span class="cc-grip">${icon('grip',14)}</span>
      <input class="cc-input flat" value="${escHtml(o.name)}" placeholder="Ej. Queso fundido" style="flex:1" oninput="setModOpt('${o.id}','name',this.value)">
      <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="${o.price||''}" placeholder="0" oninput="setModOpt('${o.id}','price',parseInt(this.value)||0)"></div>
      <button class="cc-mini-del" ${g.options.length===1?'disabled':''} onclick="delModOpt('${o.id}')">${icon('x',13)}</button>
    </div>`).join('');
  const zIndex = g._fromProduct ? 'z-index:120' : '';
  openOverlay(`
    <div class="cc-overlay" style="${zIndex}" onmousedown="handleOverlayClose(event)">
      <aside class="cc-drawer narrow" onmousedown="event.stopPropagation()">
        <div class="cc-drawer-head">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="cc-drawer-glyph" style="color:#F59E0B;background:#FFFBEB">${icon('tag',16)}</span>
            <div><div class="cc-drawer-eyebrow">${isNew?'Nuevo grupo de modificadores':'Editar grupo'}</div>
              <div class="cc-drawer-title">${escHtml(g.name)||'Sin nombre'}</div></div>
          </div>
          <button class="lm-icon-sm" onclick="closeModEditorBack()">${icon('x',15)}</button>
        </div>
        <div class="cc-drawer-body">
          <label><span class="field-label">Nombre del grupo <span class="hint">· ej. Adiciones, Salsas, Término</span></span>
            <input class="cc-input" value="${escHtml(g.name)}" placeholder="Ej. Adiciones" oninput="setModName(this.value)" autofocus></label>
          <div style="display:flex;gap:18px;margin-top:14px;flex-wrap:wrap">
            <div><div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">¿Es obligatorio elegir?</div>
              <div class="cc-seg">
                <button class="${g.rule==='opcional'?'on':''}" onclick="setModRule('opcional')">Opcional</button>
                <button class="${g.rule==='obligatorio'?'on':''}" onclick="setModRule('obligatorio')">Obligatorio</button>
              </div></div>
            <div><div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">¿Cuántas puede elegir?</div>
              <div class="cc-seg">
                <button class="${!g.multi?'on':''}" onclick="setModMulti(false)">Una opción</button>
                <button class="${g.multi?'on':''}" onclick="setModMulti(true)">Varias</button>
              </div></div>
          </div>
          <div class="cc-section">
            <div class="cc-section-head">
              <div><div class="cc-section-title">Opciones del grupo</div><div class="cc-section-sub">Cada opción puede sumar un valor al precio. Déjalo en $0 si está incluida.</div></div>
              <button class="lm-btn-ghost sm" onclick="addModOpt()">${icon('plus',13)} Opción</button>
            </div>
            <div id="mod-opts">${optRows}</div>
          </div>
        </div>
        <div class="cc-drawer-foot">
          <span style="font-size:12px;color:#64748B;font-weight:600">${g.options.filter(o=>o.name.trim()).length} opciones</span>
          <div style="display:flex;gap:8px">
            <button class="lm-btn-ghost" onclick="closeModEditorBack()">Cancelar</button>
            <button class="lm-btn-primary" id="save-mod-btn" ${canSave?'':'disabled'} onclick="saveMod()">${icon('check',14)} Guardar grupo</button>
          </div>
        </div>
      </aside>
    </div>`);
}
function closeModEditorBack() {
  if(S.editMod._fromProduct) { renderProductEditor(); }
  else { closeOverlay(); }
}
function setModName(v) { S.editMod.name=v; updateModSaveBtn(); }
function setModRule(r) { S.editMod.rule=r; renderModEditor(); }
function setModMulti(v) { S.editMod.multi=v; renderModEditor(); }
function addModOpt() { S.editMod.options.push({id:uid('op'),name:'',price:0}); refreshModOpts(); }
function delModOpt(id) { if(S.editMod.options.length===1) return; S.editMod.options=S.editMod.options.filter(o=>o.id!==id); refreshModOpts(); }
function setModOpt(id,f,v) { const o=S.editMod.options.find(x=>x.id===id); if(o){o[f]=v;} updateModSaveBtn(); }
function refreshModOpts() {
  const el=$('mod-opts'); if(!el) return;
  el.innerHTML=S.editMod.options.map(o=>`
    <div class="cp-pres-row">
      <span class="cc-grip">${icon('grip',14)}</span>
      <input class="cc-input flat" value="${escHtml(o.name)}" placeholder="Ej. Queso fundido" style="flex:1" oninput="setModOpt('${o.id}','name',this.value)">
      <div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="${o.price||''}" placeholder="0" oninput="setModOpt('${o.id}','price',parseInt(this.value)||0)"></div>
      <button class="cc-mini-del" ${S.editMod.options.length===1?'disabled':''} onclick="delModOpt('${o.id}')">${icon('x',13)}</button>
    </div>`).join('');
}
function updateModSaveBtn() { const btn=$('save-mod-btn'); if(btn) btn.disabled=!(S.editMod.name.trim()&&S.editMod.options.some(o=>o.name.trim())); }
function saveMod() {
  const g=S.editMod;
  const fromProduct=g._fromProduct; delete g._fromProduct;
  const idx=S.mods.findIndex(x=>x.id===g.id);
  if(idx>=0) S.mods[idx]=g; else S.mods.push(g);
  lsSet('lumen.mods',S.mods);
  if(fromProduct) {
    if(!S.editProd.modGroupIds.includes(g.id)) S.editProd.modGroupIds.push(g.id);
    renderProductEditor();
  } else {
    closeOverlay();
    renderPage();
  }
  toast(`Grupo "${g.name}" guardado`);
}

// ── Category Editor ────────────────────────────────────────────────────────
function openCatEditor(id) {
  const existing=id?S.cats.find(c=>c.id===id):null;
  S.editCat = existing ? JSON.parse(JSON.stringify(existing)) : {id:uid('cat'),name:'',...CAT_PALETTE[S.cats.length%8]};
  renderCatEditor();
}
function renderCatEditor() {
  const c=S.editCat;
  const isNew=!S.cats.find(x=>x.id===c.id);
  const palBtns=CAT_PALETTE.map((p,i)=>
    `<button class="cc-pal-btn" style="background:${p.tint};border-color:${JSON.stringify(c.color)===JSON.stringify(p.color)?p.color:'transparent'}" onclick="setCatPal(${i})"><span style="width:16px;height:16px;border-radius:999px;background:${p.color};display:block"></span></button>`
  ).join('');
  openOverlay(`
    <div class="cc-overlay center" onmousedown="handleOverlayClose(event)">
      <div class="cc-modal narrow" onmousedown="event.stopPropagation()">
        <div class="cc-modal-head">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="cc-modal-glyph" style="color:${c.color};background:${c.tint}">${icon('layers',16)}</span>
            <div><div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;font-weight:700">${isNew?'Nueva categoría':'Editar categoría'}</div>
              <div style="font-size:16px;font-weight:800;color:#0F172A;letter-spacing:-.02em">${escHtml(c.name)||'Sin nombre'}</div></div>
          </div>
          <button class="lm-icon-sm" onclick="closeOverlay()">${icon('x',15)}</button>
        </div>
        <div style="padding:20px">
          <label><span class="field-label">Nombre de la categoría</span>
            <input class="cc-input" value="${escHtml(c.name)}" placeholder="Ej. Salchipapas" oninput="setCatName(this.value)" autofocus></label>
          <div style="margin-top:16px">
            <div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Color de etiqueta</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">${palBtns}</div>
          </div>
          <div class="cc-preview-bar">
            <span style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Vista previa</span>
            <span id="cat-preview-tag" class="cc-cat-tag-preview" style="color:${c.color};background:${c.tint}">${escHtml(c.name)||'Categoría'}</span>
          </div>
        </div>
        <div class="cc-modal-foot">
          <span></span>
          <div style="display:flex;gap:8px">
            <button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>
            <button class="lm-btn-primary" id="save-cat-btn" ${c.name.trim()?'':'disabled'} onclick="saveCat()">${icon('check',14)} Guardar categoría</button>
          </div>
        </div>
      </div>
    </div>`);
}
function setCatName(v) { S.editCat.name=v; const t=$('cat-preview-tag'); if(t) t.textContent=v||'Categoría'; const btn=$('save-cat-btn'); if(btn) btn.disabled=!v.trim(); }
function setCatPal(i) { const p=CAT_PALETTE[i]; S.editCat.color=p.color; S.editCat.tint=p.tint; S.editCat.ring=p.ring; renderCatEditor(); }
async function saveCat() {
  const c=S.editCat;
  if(!c.name.trim()) return;
  const saved=await saveCategoryToSupabase(c);
  const idx=S.cats.findIndex(x=>x.id===c.id||x.id===saved.id);
  const finalCat={...c,...saved};
  if(idx>=0) S.cats[idx]=finalCat; else S.cats.push(finalCat);
  saveCatColors(S.cats);
  closeOverlay();
  renderPage();
  toast(`Categoría "${c.name}" guardada`);
}

// ── AI Import ─────────────────────────────────────────────────────────────
function openAIImport() {
  S.aiStage='source'; S.aiTab='file'; S.aiFile=null; S.aiUrl=''; S.aiStepIdx=0; S.aiExcluded={}; S.aiOpenCat=AI_EXTRACTION.categories[0]?.name||null;
  S.aiTimers.forEach(clearTimeout); S.aiTimers=[];
  renderAIImport();
}
function renderAIImport() {
  const stage=S.aiStage;
  const steps=['Fuente','Análisis','Revisión'];
  const stageMap=['source','analyzing','review'];
  const stepDots=steps.map((s,i)=>{
    const cur=stageMap.indexOf(stage);
    const state=i<cur?'done':i===cur?'active':'todo';
    const bg=state==='todo'?'#F1F5F9':'#8B5CF6', col=state==='todo'?'#94A3B8':'#fff';
    const inner=state==='done'?icon('check',12,3):i+1;
    return `<div style="display:flex;align-items:center;gap:8px">
      <span class="cc-step-dot" style="background:${bg};color:${col}">${inner}</span>
      <span style="font-size:12px;font-weight:700;color:${state==='todo'?'#94A3B8':'#0F172A'}">${s}</span>
    </div>${i<2?`<span style="flex:1;height:2px;background:${i<cur?'#8B5CF6':'#ECEEF2'};border-radius:2px"></span>`:''}`;
  }).join('');
  let bodyHTML='', footHTML='';
  if(stage==='source') {
    const fileContent=S.aiFile
      ?`<div class="cc-file-card"><span class="cc-file-icon">${icon('file',20)}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(S.aiFile.name)}</div><div style="font-size:11px;color:#94A3B8">${(S.aiFile.size/1024).toFixed(0)} KB · listo para analizar</div></div><button class="lm-icon-sm" onclick="S.aiFile=null;renderAIImport()">${icon('x',14)}</button></div>`
      :`<div class="cc-drop big" id="ai-dropzone" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="handleAIFileDrop(event)" onclick="document.getElementById('ai-file-input').click()"><div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#F5F3FF,#EEF2FF);color:#8B5CF6;display:flex;align-items:center;justify-content:center;margin-bottom:12px">${icon('upload',24)}</div><div style="font-size:14px;font-weight:700;color:#0F172A">Arrastra tu menú aquí</div><div style="font-size:12px;color:#94A3B8;margin-top:4px">PDF o imagen (JPG, PNG) · o <span style="color:#8B5CF6;font-weight:700">búscalo en tu equipo</span></div></div>`;
    const driveContent=`<div class="cc-input-wrap"><span style="color:#94A3B8;display:flex">${icon('drive',16)}</span><input id="ai-drive-url" value="${escHtml(S.aiUrl)}" placeholder="https://drive.google.com/file/d/…" oninput="S.aiUrl=this.value"></div><div class="cc-hint-row">${icon('link',13)}<span>Pega el enlace de tu carta en Drive (PDF o imagen). Asegúrate de que tenga permiso "cualquiera con el enlace".</span></div>`;
    bodyHTML=`<input type="file" id="ai-file-input" accept="application/pdf,image/*" style="display:none" onchange="handleAIFileSelect(this)">
      <div class="cc-seg lg" style="margin-bottom:16px">
        <button class="${S.aiTab==='file'?'on':''}" onclick="S.aiTab='file';renderAIImport()">${icon('upload',14)} Archivo</button>
        <button class="${S.aiTab==='drive'?'on':''}" onclick="S.aiTab='drive';renderAIImport()">${icon('drive',14)} Google Drive</button>
      </div>
      ${S.aiTab==='file'?fileContent:driveContent}
      <div class="cc-tip-box"><span class="cc-tip-icon">${icon('sparkle',14)}</span><div style="font-size:12px;color:#5B21B6;line-height:1.5">La IA detecta <strong>categorías, productos, presentaciones (tamaños), precios y adiciones</strong>. Después podrás revisar y ajustar todo antes de importarlo.</div></div>`;
    const ready=(S.aiTab==='file'&&!!S.aiFile)||(S.aiTab==='drive'&&S.aiUrl.trim().length>6);
    footHTML=`<span style="font-size:11.5px;color:#94A3B8">Tus datos no se publican hasta confirmar.</span><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button><button class="cc-btn-ai" ${ready?'':'disabled'} onclick="startAIAnalysis()">${icon('sparkle',14)} Analizar con IA</button></div>`;
  } else if(stage==='analyzing') {
    const aiSteps=AI_STEPS.map((s,i)=>{
      const done=i<S.aiStepIdx, active=i===S.aiStepIdx;
      const dotBg=done?'#ECFDF5':active?'#F5F3FF':'#F1F5F9';
      const dotCol=done?'#10B981':active?'#8B5CF6':'#CBD5E1';
      const inner=done?icon('check',13,3):active?'<span class="cc-pulse" style="background:currentColor"></span>':`<span style="width:6px;height:6px;border-radius:999px;background:currentColor"></span>`;
      return `<div class="cc-ai-step" style="opacity:${i<=S.aiStepIdx?1:.45}">
        <span class="cc-ai-step-dot" style="background:${dotBg};color:${dotCol}">${inner}</span>
        <div style="flex:1"><div style="font-size:13px;font-weight:700;color:${done||active?'#0F172A':'#94A3B8'}">${s.label}</div>${(done||active)?`<div style="font-size:11px;color:#94A3B8;margin-top:1px">${s.detail}</div>`:''}</div>
      </div>`;
    }).join('');
    bodyHTML=`<div style="padding:8px 0"><div style="display:flex;align-items:center;gap:14px;margin-bottom:22px"><div class="cc-spinner"></div><div><div style="font-size:15px;font-weight:800;color:#0F172A">Analizando tu menú…</div><div style="font-size:12px;color:#94A3B8">Esto toma unos segundos</div></div></div><div style="display:flex;flex-direction:column;gap:4px">${aiSteps}</div></div>`;
    footHTML=`<span style="font-size:11.5px;color:#94A3B8">Procesando con IA…</span><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>`;
  } else {
    const ex=AI_EXTRACTION;
    const incl=ex.categories.filter(c=>!S.aiExcluded[c.name]);
    const inclProds=incl.reduce((a,c)=>a+c.products.length,0);
    const catBlocks=ex.categories.map(c=>{
      const off=!!S.aiExcluded[c.name];
      const open=S.aiOpenCat===c.name;
      const prodRows=open&&!off?c.products.map(pr=>`<div class="cc-prod-row"><span style="font-size:12.5px;font-weight:600;color:#0F172A;min-width:130px">${escHtml(pr.name)}</span><div style="display:flex;gap:5px;flex-wrap:wrap;flex:1">${pr.pres.map(p=>`<span class="cc-pres-tag">${escHtml(p)}</span>`).join('')}</div>${pr.mods>0?`<span class="cc-mod-tag">${pr.mods} grupo${pr.mods>1?'s':''} mod.</span>`:''}</div>`).join(''):'';
      return `<div class="cc-cat-block" style="opacity:${off?.55:1};border-color:${open&&!off?'#DDD6FE':'#ECEEF2'}">
        <div class="cc-cat-row">
          <button class="cc-check${off?'':' on'}" onclick="toggleAICat('${escHtml(c.name)}')" style="${off?'':'background:#8B5CF6;border-color:#8B5CF6;color:#fff'}">${off?'':icon('check',12,3)}</button>
          <button class="cc-cat-toggle" onclick="S.aiOpenCat=S.aiOpenCat==='${escHtml(c.name)}'?null:'${escHtml(c.name)}';renderAIImport()">
            <span style="font-size:13.5px;font-weight:700;color:#0F172A">${escHtml(c.name)}</span>
            <span class="cc-cat-count">${c.products.length} productos</span>
            <span style="margin-left:auto;color:#CBD5E1;transform:${open?'rotate(90deg)':'none'};transition:transform .15s;display:flex">${icon('chevron',15)}</span>
          </button>
        </div>
        ${prodRows?`<div class="cc-prod-list">${prodRows}</div>`:''}
      </div>`;
    }).join('');
    bodyHTML=`<div class="cc-result-banner"><span style="color:#10B981;display:flex">${icon('checkc',18)}</span><div style="flex:1"><div style="font-size:13.5px;font-weight:800;color:#0F172A">Menú analizado con éxito</div><div style="font-size:11.5px;color:#64748B;margin-top:1px">${ex.stats.categorias} categorías · ${ex.stats.productos} productos · ${ex.stats.presentaciones} presentaciones · ${ex.stats.modificadores} grupos de adiciones</div></div><span style="font-size:11px;color:#8B5CF6;font-weight:700;display:inline-flex;align-items:center;gap:4px">${icon('file',12)} ${ex.source}</span></div>
    <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;margin:4px 2px 8px">Revisa y ajusta antes de importar</div>
    <div style="display:flex;flex-direction:column;gap:8px">${catBlocks}</div>`;
    footHTML=`<span style="font-size:12px;color:#64748B;font-weight:600">${incl.length} categorías · ${inclProds} productos seleccionados</span><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="S.aiStage='source';renderAIImport()">Volver</button><button class="cc-btn-ai" ${inclProds?'':'disabled'} onclick="importFromAI()">${icon('check',14)} Importar al catálogo</button></div>`;
  }
  openOverlay(`
    <div class="cc-overlay center" onmousedown="handleOverlayClose(event)">
      <div class="cc-modal wide" onmousedown="event.stopPropagation()">
        <div class="cc-modal-head">
          <div style="display:flex;align-items:center;gap:11px">
            <span class="cc-modal-glyph" style="background:linear-gradient(135deg,#8B5CF6,#5B6BFF);color:#fff;box-shadow:0 4px 12px -3px rgba(139,92,246,.5)">${icon('sparkle',18)}</span>
            <div><div style="font-size:15px;font-weight:800;color:#0F172A;letter-spacing:-.02em">Importar menú con IA</div>
              <div style="font-size:11.5px;color:#94A3B8">Sube tu carta y la convertimos en catálogo automáticamente</div></div>
          </div>
          <button class="lm-icon-sm" onclick="closeOverlay()">${icon('x',15)}</button>
        </div>
        <div class="cc-steps-bar">${stepDots}</div>
        <div class="cc-modal-body">${bodyHTML}</div>
        <div class="cc-modal-foot">${footHTML}</div>
      </div>
    </div>`);
}
function handleAIFileSelect(inp) { if(inp.files[0]) { S.aiFile=inp.files[0]; renderAIImport(); } }
function handleAIFileDrop(e) { e.preventDefault(); e.currentTarget.classList.remove('over'); if(e.dataTransfer.files[0]) { S.aiFile=e.dataTransfer.files[0]; renderAIImport(); } }
function toggleAICat(name) { S.aiExcluded[name]=!S.aiExcluded[name]; renderAIImport(); }
function startAIAnalysis() {
  S.aiStage='analyzing'; S.aiStepIdx=0;
  S.aiTimers.forEach(clearTimeout); S.aiTimers=[];
  AI_STEPS.forEach((_,i)=>{
    S.aiTimers.push(setTimeout(()=>{S.aiStepIdx=i+1;renderAIImport();},750*(i+1)));
  });
  S.aiTimers.push(setTimeout(()=>{S.aiStage='review';renderAIImport();},750*(AI_STEPS.length+1)));
  renderAIImport();
}
function importFromAI() {
  const incl=AI_EXTRACTION.categories.filter(c=>!S.aiExcluded[c.name]);
  const newCats=[], newProds=[];
  const nameToCat={};
  S.cats.forEach(c=>nameToCat[c.name.toLowerCase()]=c.id);
  let palI=S.cats.length;
  incl.forEach(c=>{
    let catId=nameToCat[c.name.toLowerCase()];
    if(!catId){catId=uid('cat');const p=CAT_PALETTE[palI%8];newCats.push({id:catId,name:c.name,...p});nameToCat[c.name.toLowerCase()]=catId;palI++;}
    c.products.forEach(pr=>{
      newProds.push({id:uid('p'),cat:catId,name:pr.name,desc:'',active:true,photo:null,
        presentations:pr.pres.map(s=>{const parts=s.split(' · ');const raw=parts[1]||parts[0];return{id:uid('pr'),name:parts[1]?parts[0]:'Único',price:parseInt(raw.replace(/[^0-9]/g,''),10)||0};}),
        variables:[],modGroupIds:[]});
    });
  });
  if(newCats.length){S.cats=[...S.cats,...newCats];saveCatColors(S.cats);}
  S.products=[...newProds,...S.products];
  // save to supabase in background
  newCats.forEach(c=>saveCategoryToSupabase(c).catch(()=>{}));
  newProds.forEach(p=>saveProductToSupabase(p).catch(()=>{}));
  closeOverlay();
  S.tab='productos'; S.filterCat=null;
  renderPage();
  toast(`${newProds.length} productos importados con IA`);
}

// ── Overlay close on backdrop ─────────────────────────────────────────────
function handleOverlayClose(e) { if(e.target===e.currentTarget) closeOverlay(); }

// ── XSS-safe HTML escape ──────────────────────────────────────────────────
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load persisted combos/mods from localStorage
  S.combos = lsGet('lumen.combos', []);
  S.mods   = lsGet('lumen.mods', []);

  // Phase 1 — render immediately with empty data
  renderPage();

  // Phase 2 — load from Supabase
  await loadBranch();
  await loadCategories();
  await loadProducts();
  renderPage();
});
