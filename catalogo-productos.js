/* Catálogo de Productos — Lumen POS — Con autenticación Supabase */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

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


const S = {
  tenantId:null, branchId:null, tab:'productos', cats:[], products:[], combos:[], mods:[],
  filterCat:null, query:'', overlay:null,
  editProd:null, editCombo:null, editMod:null, editCat:null,
  aiStage:'source', aiTab:'file', aiFile:null, aiUrl:'', aiResult:null, aiError:null,
  aiExcluded:{}, aiOpenCat:null, aiTimers:[],
  aiProgress:0, aiStepKey:'inventory', aiMsgIdx:0,
  aiEditKey:null, aiExcludedMods:{},
  selectMode:false, selected:new Set(), loading:true,
};

// ── Fotos Supabase Storage ──────────────────────────────────────────────
async function uploadPhoto(file, entityId) {
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = S.tenantId+'/'+entityId+'.'+ext;
    const { error } = await sb.storage.from('catalog-photos').upload(path, file, {upsert:true});
    if (error) throw error;
    const { data } = sb.storage.from('catalog-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch(e) {
    return await new Promise(res=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(file);});
  }
}

// ── Loaders ───────────────────────────────────────────────────────────────
async function loadCategories() {
  try {
    const {data,error} = await sb.from('pos_categories').select('*').eq('tenant_id',S.tenantId).order('name');
    if(error||!data) return;
    S.cats = data.map((c,i)=>({...c,color:c.color||CAT_PALETTE[i%8].color,tint:c.color_tint||CAT_PALETTE[i%8].tint,ring:c.color_ring||CAT_PALETTE[i%8].ring}));
  } catch(e){}
}
async function loadProducts() {
  try {
    const {data,error} = await sb.from('pos_products').select('*').eq('tenant_id',S.tenantId).order('name');
    if(error||!data) return;
    S.products = data.map(p=>({
      id:p.id, cat:p.category_id||'_', name:p.name, desc:p.description||'',
      active:p.available!==false, photo:p.photo_url||null, price:p.price||0,
      presentations:p.presentations||[{id:uid('pr'),name:'Unico',price:p.price||0}],
      variables:p.variables||[], modGroupIds:p.mod_group_ids||[], priceMode:p.price_mode||'simple', priceMode:p.price_mode||'simple',
    }));
  } catch(e){}
}
async function loadCombos() {
  try {
    const {data,error} = await sb.from('pos_combos').select('*').eq('tenant_id',S.tenantId).order('name');
    if(error||!data) return;
    S.combos = data.map(c=>({id:c.id,name:c.name,desc:c.description||'',price:c.price||0,active:c.active!==false,photo:c.photo_url||null,items:c.items||[]}));
  } catch(e){}
}
async function loadModifierGroups() {
  try {
    const {data,error} = await sb.from('pos_modifier_groups').select('*').eq('tenant_id',S.tenantId).order('name');
    if(error||!data) return;
    S.mods = data.map(g=>({id:g.id,name:g.name,rule:g.rule||'opcional',multi:g.multi!==false,options:g.options||[]}));
  } catch(e){}
}

// ── Saves ──────────────────────────────────────────────────────────────────
async function saveProductToSupabase(p) {
  try {
    const isMatrix=p.priceMode==='matrix';
    const matrixPrices=isMatrix?(p.variables||[]).flatMap(v=>v.isPricing?(v.options||[]).flatMap(o=>o.prices||[]):[]).filter(Boolean):[];
    const presPrices=(p.presentations||[]).map(x=>x.price||0).filter(Boolean);const varPrices=(p.variables||[]).flatMap(v=>(v.options||[]).map(o=>o.price||0)).filter(Boolean);const basePrice=isMatrix?(matrixPrices.length?Math.min(...matrixPrices):0):(presPrices.length?Math.min(...presPrices):(varPrices.length?Math.min(...varPrices):0));
    const row={tenant_id:S.tenantId,branch_id:S.branchId,name:p.name,price:basePrice,price_mode:p.priceMode||'simple',category_id:p.cat==='_'?null:p.cat,available:p.active,description:p.desc||null,photo_url:p.photo||null,presentations:p.presentations||[],variables:p.variables||[],mod_group_ids:p.modGroupIds||[]};
    const isNew=!p.id||p.id.startsWith('p_');
    if(isNew){const {data,error}=await sb.from('pos_products').insert([row]).select().single();if(error)throw error;return data.id;}
    else{await sb.from('pos_products').update(row).eq('id',p.id).eq('tenant_id',S.tenantId);return p.id;}
  } catch(e){console.error('saveProduct:',e);return p.id;}
}
async function saveCategoryToSupabase(c) {
  try {
    const row={tenant_id:S.tenantId,branch_id:S.branchId,name:c.name,color:c.color,color_tint:c.tint,color_ring:c.ring};
    const isNew=!c.id||c.id.startsWith('cat_');
    if(isNew){const {data,error}=await sb.from('pos_categories').insert([row]).select().single();if(error)throw error;return{...c,id:data.id};}
    else{await sb.from('pos_categories').update(row).eq('id',c.id).eq('tenant_id',S.tenantId);return c;}
  } catch(e){console.error('saveCat:',e);return c;}
}
async function saveComboToSupabase(c) {
  try {
    const row={tenant_id:S.tenantId,branch_id:S.branchId,name:c.name,description:c.desc||null,price:c.price||0,active:c.active!==false,photo_url:c.photo||null,items:c.items||[]};
    const isNew=!c.id||c.id.startsWith('c_');
    if(isNew){const {data,error}=await sb.from('pos_combos').insert([row]).select().single();if(error)throw error;return data.id;}
    else{await sb.from('pos_combos').update(row).eq('id',c.id).eq('tenant_id',S.tenantId);return c.id;}
  } catch(e){console.error('saveCombo:',e);return c.id;}
}
async function saveModGroupToSupabase(g) {
  try {
    const row={tenant_id:S.tenantId,branch_id:S.branchId,name:g.name,rule:g.rule||'opcional',multi:g.multi!==false,options:g.options||[]};
    const isNew=!g.id||g.id.startsWith('mg_');
    if(isNew){const {data,error}=await sb.from('pos_modifier_groups').insert([row]).select().single();if(error)throw error;return data.id;}
    else{await sb.from('pos_modifier_groups').update(row).eq('id',g.id).eq('tenant_id',S.tenantId);return g.id;}
  } catch(e){console.error('saveMod:',e);return g.id;}
}
async function deleteCategoryFromSupabase(id){try{await sb.from('pos_categories').delete().eq('id',id).eq('tenant_id',S.tenantId);}catch(e){}}
async function deleteProductFromSupabase(id){try{await sb.from('pos_products').delete().eq('id',id).eq('tenant_id',S.tenantId);}catch(e){}}
async function deleteComboFromSupabase(id){try{await sb.from('pos_combos').delete().eq('id',id).eq('tenant_id',S.tenantId);}catch(e){}}
async function deleteModGroupFromSupabase(id){try{await sb.from('pos_modifier_groups').delete().eq('id',id).eq('tenant_id',S.tenantId);}catch(e){}}

// ── Auth ──────────────────────────────────────────────────────────────────
async function signOut(){await sb.auth.signOut();window.location.href='login.html';}

// ── UI helpers ────────────────────────────────────────────────────────────
function toast(msg){const el=$('cp-toast');if(!el)return;el.innerHTML='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9 11 14 8.5 11.5"/></svg> '+msg;el.style.display='flex';clearTimeout(el._t);el._t=setTimeout(()=>{el.style.display='none';},2600);}
function catOf(id){return S.cats.find(c=>c.id===id)||{id:'_',name:'Sin categoria',color:'#94A3B8',tint:'#F1F5F9',ring:'#ECEEF2'};}
function modById(id){return S.mods.find(m=>m.id===id);}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function icon(name,size,sw){
  size=size||16;sw=sw||2;
  const p='width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"';
  switch(name){
    case 'back':    return '<svg '+p+'><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
    case 'box':     return '<svg '+p+'><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
    case 'combo':   return '<svg '+p+'><rect x="2" y="3" width="9" height="9" rx="1.5"/><rect x="13" y="3" width="9" height="9" rx="1.5"/><rect x="2" y="14" width="9" height="7" rx="1.5"/><rect x="13" y="14" width="9" height="7" rx="1.5"/></svg>';
    case 'layers':  return '<svg '+p+'><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';
    case 'tag':     return '<svg '+p+'><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
    case 'sparkle': return '<svg '+p+'><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>';
    case 'plus':    return '<svg '+p+'><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    case 'x':       return '<svg '+p+'><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    case 'trash':   return '<svg '+p+'><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    case 'image':   return '<svg '+p+'><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    case 'upload':  return '<svg '+p+'><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    case 'link':    return '<svg '+p+'><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    case 'drive':   return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l3.43 6 6.56-11.5L7.71 3.5z" opacity=".9"/><path d="M22.85 15L16.29 3.5H9.43L16 15h6.85z" opacity=".7"/><path d="M4.58 21h13.13l3.43-6H8L4.58 21z" opacity=".5"/></svg>';
    case 'check':   return '<svg '+p+'><polyline points="20 6 9 17 4 12"/></svg>';
    case 'checkc':  return '<svg '+p+'><circle cx="12" cy="12" r="10"/><polyline points="16 9 11 14 8.5 11.5"/></svg>';
    case 'chevron': return '<svg '+p+'><polyline points="9 18 15 12 9 6"/></svg>';
    case 'down':    return '<svg '+p+'><polyline points="6 9 12 15 18 9"/></svg>';
    case 'search':  return '<svg '+p+'><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    case 'edit':    return '<svg '+p+'><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>';
    case 'sliders': return '<svg '+p+'><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';
    case 'file':    return '<svg '+p+'><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    case 'grip':    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>';
    case 'check-square': return '<svg '+p+'><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    case 'logout':  return '<svg '+p+'><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    default: return '';
  }
}

// ── Nav ───────────────────────────────────────────────────────────────────
function renderNav(){
  const nav=$('cp-nav');if(!nav)return;
  const tabs=[
    {id:'back',icon:'back',label:'Regresar',href:'dashboard.html'},
    {sep:true},
    {id:'productos',icon:'box',label:'Productos',badge:()=>S.products.length},
    {id:'combos',icon:'combo',label:'Combos',badge:()=>S.combos.length},
    {id:'categorias',icon:'layers',label:'Categorías',badge:()=>S.cats.length},
    {id:'modificadores',icon:'tag',label:'Modificadores',badge:()=>S.mods.length},
    {sep:true},
    {id:'ai',icon:'sparkle',label:'Importar con IA',ai:true},
    {sep:true},
    {id:'logout',icon:'logout',label:'Cerrar sesión',logout:true},
  ];
  nav.innerHTML=tabs.map(t=>{
    if(t.sep) return '<div class="cp-nav-divider"></div>';
    if(t.href) return '<a class="cp-nav-item" href="'+t.href+'"><span class="cp-nav-inner">'+icon(t.icon,16)+' '+t.label+'</span></a>';
    if(t.logout) return '<button class="cp-nav-item" onclick="signOut()" style="color:#EF4444"><span class="cp-nav-inner">'+icon(t.icon,16)+' '+t.label+'</span></button>';
    const active=S.tab===t.id?' active':'';
    const aiClass=t.ai?' ai-item':'';
    const badge=t.badge?'<span class="cp-nav-badge">'+t.badge()+'</span>':'';
    return '<button class="cp-nav-item'+active+aiClass+'" onclick="setTab(\''+t.id+'\')"><span class="cp-nav-inner">'+icon(t.icon,16)+' '+t.label+'</span>'+badge+'</button>';
  }).join('');
}

function updateStats(){
  const sp=$('stat-products'),sc=$('stat-cats'),sm=$('stat-mods');
  if(sp)sp.textContent=S.products.length;
  if(sc)sc.textContent=S.cats.length;
  if(sm)sm.textContent=S.mods.length;
}

function setTab(tab){if(tab==='ai'){openAIImport();return;}S.tab=tab;S.filterCat=null;renderPage();}

function renderPage(){renderNav();updateStats();renderPageHead();renderTabsRow();renderFilterRow();renderBody();}

function renderPageHead(){
  const titles={productos:'Catálogo de productos',combos:'Combos',categorias:'Categorías',modificadores:'Modificadores'};;
  const t=$('page-title');if(t)t.textContent=titles[S.tab]||'Catálogo';
  const crumb=$('crumb-title');if(crumb)crumb.textContent=titles[S.tab]||'Catálogo';
  const isManage=S.tab==='categorias'||S.tab==='modificadores';
  const actions=$('page-actions');if(!actions)return;
  if(isManage){actions.innerHTML='';return;}
  const isProd=S.tab==='productos';
  let search='';
  if(isProd)search='<div class="cp-search">'+icon('search',14)+'<input id="cp-search-input" placeholder="Buscar producto…" oninput="S.query=this.value;renderBody()" value="'+escHtml(S.query||'')+'"></div>';
  if(isProd&&S.selectMode){
    actions.innerHTML=search
      +'<button class="lm-btn-ghost sm" onclick="selectAll()">'+icon('check',13)+' Todo</button>'
      +'<button class="lm-btn-ghost sm" style="color:#EF4444" '+(S.selected.size===0?'disabled':'')+' onclick="deleteSelected()">'+icon('trash',13)+' Eliminar ('+S.selected.size+')</button>'
      +'<button class="lm-btn-ghost sm" onclick="toggleSelectMode()">Cancelar</button>';
  } else {
    const type=isProd?'product':'combo';
    const label=isProd?'Nuevo producto':'Nuevo combo';
    actions.innerHTML=search
      +(isProd?'<button class="lm-btn-ghost sm" onclick="toggleSelectMode()">'+icon('check',13)+' Seleccionar</button>':'')
      +'<button class="cc-btn-ai ghost" onclick="openAIImport()">'+icon('sparkle',14)+' Importar con IA</button>'
      +'<button class="lm-btn-primary" onclick="openEditor(null,\''+type+'\')">'+icon('plus',14)+' '+label+'</button>';
  }
}

function renderTabsRow(){
  const row=$('cp-tabs-row');if(!row)return;
  if(S.tab==='categorias'||S.tab==='modificadores'){row.innerHTML='';return;}
  row.innerHTML='<button class="cp-tab'+(S.tab==='productos'?' on':'')+'" onclick="setTab(\'productos\')">'+icon('box',15)+' Productos <span class="cp-tab-n">'+S.products.length+'</span></button><button class="cp-tab'+(S.tab==='combos'?' on':'')+'" onclick="setTab(\'combos\')">'+icon('combo',15)+' Combos <span class="cp-tab-n">'+S.combos.length+'</span></button>';
}

function renderFilterRow(){
  const row=$('cp-filter-row');if(!row)return;
  if(S.tab!=='productos'){row.style.display='none';return;}
  row.style.display='flex';
  row.innerHTML='<button class="cp-fchip'+(!S.filterCat?' on':'')+'" onclick="setFilter(null)">Todas <span class="chip-count">'+S.products.length+'</span></button>'+
    S.cats.map(c=>{const cnt=S.products.filter(p=>p.cat===c.id).length;const isOn=S.filterCat===c.id;return '<span style="display:inline-flex;align-items:center;gap:2px"><button class="cp-fchip'+(isOn?' on':'')+' " onclick="setFilter(\''+c.id+'\')" style="'+(isOn?'border-color:'+c.color+';color:'+c.color+';background:'+c.tint:'')+'"><span class="chip-dot" style="background:'+c.color+'"></span>'+escHtml(c.name)+' <span class="chip-count">'+cnt+'</span></button>'+(cnt>0?'<button class="cp-cat-del-chip" title="Borrar todos los productos de '+escHtml(c.name)+'" onclick="deleteByCat(\''+c.id+'\',\''+escHtml(c.name)+'\','+cnt+')">'+icon('trash',11)+'</button>':'')+'</span>';}).join('');
}

function renderBody(){
  const body=$('cp-body');if(!body)return;
  if(S.tab==='productos'){renderProductGrid(body);return;}
  if(S.tab==='combos'){renderComboGrid(body);return;}
  if(S.tab==='categorias'){renderCategoriesView(body);return;}
  if(S.tab==='modificadores'){renderModifiersView(body);return;}
}

// ── Products ──────────────────────────────────────────────────────────────
function renderProductGrid(body){
  const q=S.query.trim().toLowerCase();
  const filtered=S.products.filter(p=>(!S.filterCat||p.cat===S.filterCat)&&(!q||p.name.toLowerCase().includes(q)||catOf(p.cat).name.toLowerCase().includes(q)));
  if(S.loading){
    body.innerHTML='<div class="cp-loading-grid">'+'<div class="cp-skel-card"></div>'.repeat(8)+'</div>';
    return;
  }
  if(!filtered.length){
    body.innerHTML='<div class="cp-empty"><div class="cp-empty-icon">'+icon('box',28,1.6)+'</div><h3>No hay productos en esta vista</h3><p>Crea tu primer producto o importa tu carta con IA.</p><div class="cp-empty-actions"><button class="cc-btn-ai" onclick="openAIImport()">'+icon('sparkle',14)+' Importar con IA</button><button class="lm-btn-ghost" onclick="openEditor(null,\'product\')">'+icon('plus',14)+' Nuevo producto</button></div></div>';
    return;
  }
  body.innerHTML='<div class="cp-card-grid">'+filtered.map(p=>productCardHTML(p)).join('')+'</div>';
}

function productCardHTML(p){
  const cat=catOf(p.cat);
  const _mxPrices=p.priceMode==='matrix'?(p.variables||[]).flatMap(v=>v.isPricing?(v.options||[]).flatMap(o=>o.prices||[]):[]).filter(Boolean):p.presentations.map(x=>x.price).filter(Boolean);
  const prices=_mxPrices;
  const range=prices.length?(Math.min(...prices)===Math.max(...prices)?fmt(prices[0]):(fmt(Math.min(...prices))+' – '+fmt(Math.max(...prices)))):'--';
  const groups=(p.modGroupIds||[]).map(modById).filter(Boolean);
  const opts=groups.reduce((a,g)=>a+g.options.length,0);
  const varGroups=p.variables||[];
  const thumb=p.photo?'<img class="cp-thumb-img" src="'+escHtml(p.photo)+'" alt="">':'<div class="cp-thumb-placeholder"><span class="cp-thumb-label">foto · '+escHtml(cat.name.toLowerCase())+'</span></div>';
  const inactive=p.active?'':'<span class="cp-inactive-chip">Inactivo</span>';
  const varTag=varGroups.length?'<span class="cp-meta-tag var">'+icon('sliders',12)+' '+varGroups.reduce((a,v)=>a+v.options.length,0)+' variables</span>':'';
  const _selClass=S.selectMode&&S.selected.has(p.id)?' cp-selected':'';
  const _chkHtml=S.selectMode?'<div class="cp-card-check">'+(S.selected.has(p.id)?'<svg width="16" height="16" viewBox="0 0 24 24" fill="#8B5CF6"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2.5" fill="none"/></svg>':'<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#CBD5E1" stroke-width="2"/></svg>')+'</div>':'';
  const _cardClick=S.selectMode?('toggleSelect(\''+p.id+'\')'):('openEditor(\''+p.id+'\''+',\'product\')');
  return '<div class="cp-card'+_selClass+'" style="'+(p.active?'':'opacity:.72')+'" onclick="'+_cardClick+'">'+_chkHtml+'<div class="cp-thumb">'+thumb+'<span class="cp-cat-chip" style="color:'+cat.color+';background:'+cat.tint+'">'+escHtml(cat.name)+'</span>'+inactive+'</div>'+'<div class="cp-card-body"><div class="cp-card-row"><div class="cp-card-name">'+escHtml(p.name)+'</div><div class="cp-card-price">'+range+'</div></div>'+(p.desc?'<div class="cp-card-desc">'+escHtml(p.desc)+'</div>':'')+'<div class="cp-meta-row"><span class="cp-meta-tag">'+icon('layers',12)+' '+p.presentations.length+' '+(p.presentations.length===1?'presentación':'presentaciones')+'</span>'+varTag+'<span class="cp-meta-tag">'+icon('tag',12)+' '+(groups.length?(groups.length+' '+(groups.length===1?'grupo':'grupos')+' · '+opts+' adic.'):'Sin adiciones')+'</span></div></div>'+'<div class="cp-card-foot" onclick="event.stopPropagation()"><button class="cp-switch'+(p.active?' on':'')+'" onclick="toggleProduct(\''+p.id+'\')"><span class="cp-switch-lbl">'+(p.active?'Activo':'Inactivo')+'</span><span class="cp-switch-track"><span class="cp-switch-knob"></span></span></button><div style="display:flex;gap:5px;align-items:center"><button class="cp-card-del-btn" onclick="confirmDeleteProduct(\''+p.id+'\')" title="Eliminar">'+icon('trash',13)+'</button><button class="cp-card-edit-btn" onclick="openEditor(\''+p.id+'\',\'product\')">Editar '+icon('chevron',13)+'</button></div></div></div>';
}

function confirmDeleteProduct(id){
  const p=S.products.find(x=>x.id===id);if(!p)return;
  openOverlay('<div class="cc-overlay center" onmousedown="handleOverlayClose(event)">'
    +'<div class="cc-modal" style="width:340px;max-width:92vw" onmousedown="event.stopPropagation()">'
    +'<div class="cc-modal-head" style="border-bottom:none;padding-bottom:6px">'
    +'<div style="display:flex;align-items:center;gap:10px">'
    +'<span style="width:36px;height:36px;border-radius:10px;background:#FFF1F2;color:#F43F5E;display:flex;align-items:center;justify-content:center">'+icon('trash',16)+'</span>'
    +'<div style="font-size:14px;font-weight:800;color:#0F172A">Eliminar producto</div></div>'
    +'<button class="lm-icon-sm" onclick="closeOverlay()">'+icon('x',15)+'</button></div>'
    +'<div style="padding:2px 20px 20px">'
    +'<div style="font-size:13px;color:#475569;line-height:1.55">¿Eliminar <strong>'+escHtml(p.name)+'</strong>? Esta acción no se puede deshacer.</div>'
    +'<div style="display:flex;gap:8px;margin-top:16px">'
    +'<button class="lm-btn-ghost" style="flex:1" onclick="closeOverlay()">Cancelar</button>'
    +'<button style="flex:1;background:#EF4444;border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;height:38px;cursor:pointer;font-family:inherit" onclick="doDeleteProduct(\''+p.id+'\')">' + 'Eliminar</button>'
    +'</div></div></div></div>');
}
async function doDeleteProduct(id){
  await deleteProductFromSupabase(id);
  S.products=S.products.filter(x=>x.id!==id);
  closeOverlay();renderPage();toast('Producto eliminado');
}
async function toggleProduct(id){
  const p=S.products.find(x=>x.id===id);if(!p)return;
  p.active=!p.active;
  await sb.from('pos_products').update({available:p.active}).eq('id',id).eq('tenant_id',S.tenantId);
  renderBody();
}

// ── Combos ────────────────────────────────────────────────────────────────
function renderComboGrid(body){
  if(!S.combos.length){body.innerHTML='<div class="cp-empty"><div class="cp-empty-icon">'+icon('combo',28,1.6)+'</div><h3>No hay combos creados</h3><p>Crea combos para ofrecer productos juntos a un precio especial.</p><div class="cp-empty-actions"><button class="lm-btn-primary" onclick="openEditor(null,\'combo\')">'+icon('plus',14)+' Nuevo combo</button></div></div>';return;}
  body.innerHTML='<div class="cp-card-grid">'+S.combos.map(c=>comboCardHTML(c)).join('')+'</div>';
}
function comboCardHTML(c){
  const thumb=c.photo?'<img class="cp-thumb-img" src="'+escHtml(c.photo)+'" alt="">':'<div class="cp-thumb-placeholder"><span class="cp-thumb-label">foto · combo</span></div>';
  const inactive=c.active?'':'<span class="cp-inactive-chip">Inactivo</span>';
  const items=(c.items||[]).map(it=>'<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:#475569"><span style="color:#8B5CF6;display:flex">'+icon('check',12,3)+'</span>'+escHtml(it.name)+'</div>').join('');
  return '<div class="cp-card" style="'+(c.active?'':'opacity:.72')+'" onclick="openEditor(\''+c.id+'\',\'combo\')">'+'<div class="cp-thumb">'+thumb+'<span class="cp-cat-chip" style="color:#8B5CF6;background:#F5F3FF">Combo</span>'+inactive+'</div>'+'<div class="cp-card-body"><div class="cp-card-row"><div class="cp-card-name">'+escHtml(c.name)+'</div><div class="cp-card-price">'+fmt(c.price)+'</div></div>'+(c.desc?'<div class="cp-card-desc">'+escHtml(c.desc)+'</div>':'')+'<div style="display:flex;flex-direction:column;gap:4px;margin-top:10px">'+items+'</div></div>'+'<div class="cp-card-foot" onclick="event.stopPropagation()"><button class="cp-switch'+(c.active?' on':'')+'" onclick="toggleCombo(\''+c.id+'\')"><span class="cp-switch-lbl">'+(c.active?'Activo':'Inactivo')+'</span><span class="cp-switch-track"><span class="cp-switch-knob"></span></span></button><button class="cp-card-edit-btn" onclick="openEditor(\''+c.id+'\',\'combo\')">Editar '+icon('chevron',13)+'</button></div></div>';
}
async function toggleCombo(id){const c=S.combos.find(x=>x.id===id);if(!c)return;c.active=!c.active;await sb.from('pos_combos').update({active:c.active}).eq('id',id).eq('tenant_id',S.tenantId);renderBody();}

// ── Categories view ───────────────────────────────────────────────────────
function renderCategoriesView(body){
  const count=id=>S.products.filter(p=>p.cat===id).length;
  const cards=S.cats.map(c=>{const n=count(c.id);const canDel=n===0;return '<div class="cp-card" style="cursor:default;padding:16px"><div style="display:flex;align-items:center;gap:12px"><span style="width:44px;height:44px;border-radius:12px;background:'+c.tint+';color:'+c.color+';display:flex;align-items:center;justify-content:center;flex-shrink:0">'+icon('layers',20)+'</span><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:#0F172A">'+escHtml(c.name)+'</div><div style="font-size:11.5px;color:#94A3B8;margin-top:1px">'+n+' '+(n===1?'producto':'productos')+'</div></div><span style="width:14px;height:14px;border-radius:999px;background:'+c.color+';flex-shrink:0"></span></div><div style="display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #F1F5F9"><button class="lm-btn-ghost sm" style="flex:1" onclick="openCatEditor(\''+c.id+'\')">'+icon('edit',13)+' Editar</button><button class="cc-mini-del" '+(canDel?'':'disabled title="Mueve o elimina sus productos primero"')+' onclick="deleteCat(\''+c.id+'\')">'+icon('trash',14)+'</button></div></div>';}).join('');
  body.innerHTML='<div><div class="cp-view-head"><div><div style="font-size:14px;font-weight:800;color:#0F172A">Categorías del menú</div><div style="font-size:12px;color:#94A3B8;margin-top:2px">Organizan los productos.</div></div><button class="lm-btn-primary" onclick="openCatEditor(null)">'+icon('plus',14)+' Nueva categoría</button></div><div class="cp-cat-grid">'+cards+'<button class="cp-add-tile" onclick="openCatEditor(null)"><div class="cp-add-tile-icon">'+icon('plus',20)+'</div><span>Crear categoría</span></button></div></div>';
}
async function deleteCat(id){const n=S.products.filter(p=>p.cat===id).length;if(n>0)return;await deleteCategoryFromSupabase(id);S.cats=S.cats.filter(c=>c.id!==id);renderPage();toast('Categoría eliminada');}

// ── Modifiers view ────────────────────────────────────────────────────────
function renderModifiersView(body){
  const usedBy=id=>S.products.filter(p=>(p.modGroupIds||[]).includes(id)).length;
  const cards=S.mods.map(g=>{const uses=usedBy(g.id);const rc=g.rule==='obligatorio'?{color:'#B45309',bg:'#FEF3C7'}:{color:'#64748B',bg:'#F1F5F9'};const opts=g.options.map(o=>'<span class="cc-opt-chip">'+escHtml(o.name)+'<span style="color:'+(o.price?'#16A34A':'#94A3B8')+';font-weight:700;margin-left:5px">'+fmtDelta(o.price)+'</span></span>').join('');return '<div class="cp-card" style="cursor:default;padding:16px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div style="display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:10px;background:#FFFBEB;color:#F59E0B;display:flex;align-items:center;justify-content:center">'+icon('tag',17)+'</span><div><div style="font-size:14.5px;font-weight:700;color:#0F172A">'+escHtml(g.name)+'</div><div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span class="cc-rule-chip" style="color:'+rc.color+';background:'+rc.bg+'">'+RULE_LABEL[g.rule]+'</span><span class="cc-rule-chip" style="color:#64748B;background:#F1F5F9">'+(g.multi?'Varias':'Una')+'</span></div></div></div><span class="cc-used-chip">'+uses+' '+(uses===1?'producto':'productos')+'</span></div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px">'+opts+'</div><div style="display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #F1F5F9"><button class="lm-btn-ghost sm" style="flex:1" onclick="openModEditor(\''+g.id+'\')">'+icon('edit',13)+' Editar grupo</button><button class="cc-mini-del" '+(uses?'disabled title="Lo usan productos activos"':'')+' onclick="deleteMod(\''+g.id+'\')">'+icon('trash',14)+'</button></div></div>';}).join('');
  body.innerHTML='<div><div class="cp-view-head"><div><div style="font-size:14px;font-weight:800;color:#0F172A">Grupos de modificadores</div><div style="font-size:12px;color:#94A3B8;margin-top:2px">Crea grupos (ej. "Adiciones") y actívalos en cada producto.</div></div><button class="lm-btn-primary" onclick="openModEditor(null)">'+icon('plus',14)+' Nuevo grupo</button></div><div class="cp-mod-grid">'+cards+'<button class="cp-add-tile" onclick="openModEditor(null)"><div class="cp-add-tile-icon" style="background:#FFFBEB;color:#F59E0B">'+icon('plus',20)+'</div><span>Crear grupo</span></button></div></div>';
}
async function deleteMod(id){const uses=S.products.filter(p=>(p.modGroupIds||[]).includes(id)).length;if(uses>0)return;await deleteModGroupFromSupabase(id);S.mods=S.mods.filter(m=>m.id!==id);renderPage();toast('Grupo eliminado');}

function setFilter(catId){S.filterCat=catId;renderFilterRow();renderBody();}
function onSearch(val){S.query=val;renderBody();}

// ── Overlays ──────────────────────────────────────────────────────────────
function closeOverlay(){const el=$('cp-overlay');if(el)el.innerHTML='';S.overlay=null;S.aiTimers.forEach(clearTimeout);S.aiTimers=[];}
function openOverlay(html){const el=$('cp-overlay');if(el)el.innerHTML=html;}
function handleOverlayClose(e){if(e.target===e.currentTarget)closeOverlay();}

// ── Product Editor ────────────────────────────────────────────────────────
function openEditor(id,type){
  if(type==='product'){
    const existing=id?S.products.find(p=>p.id===id):null;
    S.editProd=existing?JSON.parse(JSON.stringify(existing)):{id:uid('p'),cat:(S.cats[0]||{}).id||'_',name:'',desc:'',active:true,photo:null,presentations:[{id:uid('pr'),name:'',price:0}],variables:[],modGroupIds:[],_photoFile:null};
    S.overlay='product';renderProductEditor();
  } else {
    const existing=id?S.combos.find(c=>c.id===id):null;
    S.editCombo=existing?JSON.parse(JSON.stringify(existing)):{id:uid('c'),name:'',desc:'',price:0,active:true,photo:null,items:[{name:''}],_photoFile:null};
    S.overlay='combo';renderComboEditor();
  }
}

function renderProductEditor(){try{
  const p=S.editProd,isNew=!S.products.find(x=>x.id===p.id),cat=catOf(p.cat);
  const priceRange=()=>{let ps;if(p.priceMode==='matrix'){ps=(p.variables||[]).flatMap(v=>v.isPricing?(v.options||[]).flatMap(o=>o.prices||[]):[]).filter(Boolean);}else{const pres=p.presentations.map(x=>x.price).filter(Boolean);const vars=(p.variables||[]).flatMap(v=>(v.options||[]).map(o=>o.price||0)).filter(Boolean);ps=pres.length?pres:vars;}if(!ps.length)return '--';const lo=Math.min(...ps),hi=Math.max(...ps);return lo===hi?fmt(lo):(fmt(lo)+' – '+fmt(hi));};
  const hasPres_=p.presentations.some(x=>x.name.trim()&&x.price>0);const hasVar_=(p.variables||[]).some(v=>(v.options||[]).some(o=>o.price>0));const canSave=p.name.trim()&&p.presentations.some(x=>x.name.trim())&&(p.priceMode==='matrix'?(p.variables||[]).some(v=>v.isPricing&&(v.options||[]).some(o=>(o.prices||[]).some(pr=>pr>0))):(hasPres_||hasVar_));
  const catOptions=S.cats.map(c=>'<option value="'+c.id+'" '+(p.cat===c.id?'selected':'')+'>'+escHtml(c.name)+'</option>').join('');
  const presRows=p.presentations.map(pr=>'<div class="cp-pres-row"><span class="cc-grip">'+icon('grip',14)+'</span><input class="cc-input flat" value="'+escHtml(pr.name)+'" placeholder="Nombre (ej. Familiar)" style="flex:1" oninput="setPres(\''+pr.id+'\',\'name\',this.value)"><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="'+(pr.price||'')+'" placeholder="0" oninput="setPres(\''+pr.id+'\',\'price\',parseInt(this.value)||0)"></div><button class="cc-mini-del" '+(p.presentations.length===1?'disabled':'')+' onclick="delPres(\''+pr.id+'\')">'+icon('trash',13)+'</button></div>').join('');
  const varSections=p.variables.length===0?'<button class="cc-add-group" onclick="addVar()">'+icon('sliders',15)+' Agregar una variable (ej. Proteína: Pollo / Carne / Mixta)</button>':p.variables.map(v=>'<div class="cc-var-card"><div class="cc-var-head"><span class="cc-var-tag">'+icon('sliders',12)+' Elección única</span><input class="cc-input flat" style="flex:1;font-weight:700" value="'+escHtml(v.name)+'" placeholder="Nombre" oninput="setVar(\''+v.id+'\',\'name\',this.value)"><button class="cc-mini-del" onclick="delVar(\''+v.id+'\')">'+icon('trash',13)+'</button></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">'+v.options.map(o=>'<div class="cp-pres-row"><span class="cc-var-dot"></span><input class="cc-input flat" style="flex:1" value="'+escHtml(o.name)+'" placeholder="Opción" oninput="setVarOpt(\''+v.id+'\',\''+o.id+'\',\'name\',this.value)"><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="'+(o.price||'')+'" placeholder="0" oninput="setVarOpt(\''+v.id+'\',\''+o.id+'\',\'price\',parseInt(this.value)||0)"></div><button class="cc-mini-del" '+(v.options.length===1?'disabled':'')+' onclick="delVarOpt(\''+v.id+'\',\''+o.id+'\')">'+icon('x',13)+'</button></div>').join('')+'</div><button class="lm-link" style="margin-top:8px" onclick="addVarOpt(\''+v.id+'\')">+ Agregar opción</button></div>').join('');
  const modRows=S.mods.length===0?'<button class="cc-add-group" onclick="openModEditorInProduct()">'+icon('plus',15)+' Crear el primer grupo de modificadores</button>':S.mods.map(g=>{const on=(p.modGroupIds||[]).includes(g.id);return '<button class="cc-modtoggle'+(on?' on':'')+'" onclick="toggleModGroup(\''+g.id+'\')"><span class="cc-check'+(on?' on':'')+'">'+( on?icon('check',12,3):'')+'</span><div style="flex:1;min-width:0;text-align:left"><div style="display:flex;align-items:center;gap:7px"><span style="font-size:13px;font-weight:700;color:#0F172A">'+escHtml(g.name)+'</span><span class="cc-tiny-chip">'+RULE_LABEL[g.rule]+'</span><span class="cc-tiny-chip">'+(g.multi?'Varias':'Una')+'</span></div><div style="font-size:11px;color:#94A3B8;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+g.options.map(o=>o.name).join(' · ')+'</div></div><span style="font-size:10.5px;font-weight:700;color:#94A3B8;flex-shrink:0">'+g.options.length+' opc.</span></button>';}).join('');
  const photoHTML=p.photo?'<div class="cc-photo-wrap"><img src="'+escHtml(p.photo)+'" alt=""><div class="cc-photo-overlay"><button class="cc-pill-btn" onclick="document.getElementById(\'prod-photo-input\').click()">'+icon('image',13)+' Cambiar</button><button class="cc-pill-btn danger" onclick="clearProdPhoto()">'+icon('trash',13)+' Quitar</button></div></div>':'<div class="cc-drop" ondragover="event.preventDefault();this.classList.add(\'over\')" ondragleave="this.classList.remove(\'over\')" ondrop="handleProdPhotoDrop(event)" onclick="document.getElementById(\'prod-photo-input\').click()"><div class="cc-drop-icon">'+icon('upload',20)+'</div><div style="font-size:13px;font-weight:700;color:#0F172A">Foto del producto</div><div style="font-size:11.5px;color:#94A3B8;margin-top:3px">Arrastra una imagen o <span style="color:#5B6BFF;font-weight:700">búscala en tu equipo</span></div></div><div class="cc-url-row"><span style="color:#94A3B8;display:flex">'+icon('link',14)+'</span><input id="prod-photo-url" placeholder="…o pega un enlace de imagen" style="flex:1;border:none;outline:none;background:transparent;font-family:inherit;font-size:12.5px"><button class="lm-link" onclick="useProdPhotoUrl()">Usar</button></div>';
  openOverlay('<div class="cc-overlay" onmousedown="handleOverlayClose(event)"><aside class="cc-drawer" onmousedown="event.stopPropagation()"><div class="cc-drawer-head"><div style="display:flex;align-items:center;gap:10px"><span class="cc-drawer-glyph" style="color:'+cat.color+';background:'+cat.tint+'">'+icon('box',17)+'</span><div><div class="cc-drawer-eyebrow">'+(isNew?'Nuevo producto':'Editar producto')+'</div><div class="cc-drawer-title" id="ed-prod-title">'+(escHtml(p.name)||'Sin nombre')+'</div></div></div><button class="lm-icon-sm" onclick="closeOverlay()">'+icon('x',15)+'</button></div><div class="cc-drawer-body"><input type="file" id="prod-photo-input" accept="image/*" style="display:none" onchange="handleProdPhotoFile(this)">'+photoHTML+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px"><label><span class="field-label">Nombre del producto</span><input class="cc-input" value="'+escHtml(p.name)+'" placeholder="Ej. Premium Mixta" oninput="setProdName(this.value)"></label><label><span class="field-label">Categoría</span><div class="cc-select"><select onchange="setProdCat(this.value)">'+catOptions+'</select><span class="cc-sel-arrow">'+icon('down',14)+'</span></div></label></div><div style="margin-top:12px"><label><span class="field-label">Descripción <span class="hint">· opcional</span></span><textarea class="cc-input" rows="2" placeholder="Ingredientes, detalles…" oninput="setProdDesc(this.value)">'+escHtml(p.desc||'')+'</textarea></label></div><div class="cc-section"><div class="cc-section-head"><div><div class="cc-section-title">Presentaciones</div><div class="cc-section-sub">Cada presentación tiene su propio precio. Ej: Personal, Familiar, Para llevar.</div></div><button class="lm-btn-ghost sm" onclick="addPres()">'+icon('plus',13)+' Agregar</button></div><div id="pres-list" style="display:flex;flex-direction:column;gap:8px">'+presRows+'</div></div><div class="cc-section"><div class="cc-section-head"><div><div class="cc-section-title">Variables</div><div class="cc-section-sub">El cliente elige <strong>una</strong> opción por grupo.</div></div><button class="lm-btn-ghost sm" onclick="addVar()">'+icon('plus',13)+' Variable</button></div><div id="var-list">'+varSections+'</div></div><div class="cc-section"><div class="cc-section-head"><div><div class="cc-section-title">Modificadores</div><div class="cc-section-sub">Activa los grupos que aplican a este producto.</div></div><button class="lm-btn-ghost sm" onclick="openModEditorInProduct()">'+icon('plus',13)+' Crear grupo</button></div><div id="mod-list">'+modRows+'</div></div></div><div class="cc-drawer-foot"><div style="display:flex;flex-direction:column"><span style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Rango de precio</span><span id="ed-price-range" style="font-size:15px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">'+priceRange()+'</span></div><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button><button class="lm-btn-primary" id="save-prod-btn" '+(canSave?'':'disabled')+' onclick="saveProduct()">'+icon('check',14)+' Guardar</button></div></div></aside></div>');
}catch(e){console.error('renderProductEditor error:',e);openOverlay('<div class="cc-overlay" style="display:flex;align-items:center;justify-content:center" onclick="closeOverlay()"><div style="background:#fff;padding:32px;border-radius:16px;max-width:420px;text-align:center"><div style="color:#EF4444;font-size:15px;font-weight:700;margin-bottom:12px">⚠️ Error al abrir editor</div><pre style="font-size:11px;color:#475569;text-align:left;white-space:pre-wrap">'+String(e)+'</pre><button onclick="closeOverlay()" style="margin-top:16px;padding:8px 18px;background:#5B6BFF;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">Cerrar</button></div></div>');}
}
function setProdName(v){S.editProd.name=v;const t=$('ed-prod-title');if(t)t.textContent=v||'Sin nombre';updateSaveProdBtn();}
function setProdCat(v){S.editProd.cat=v;}
function setProdDesc(v){S.editProd.desc=v;}
function clearProdPhoto(){S.editProd.photo=null;S.editProd._photoFile=null;renderProductEditor();}
function useProdPhotoUrl(){const el=$('prod-photo-url');if(el&&el.value.trim()){S.editProd.photo=el.value.trim();S.editProd._photoFile=null;renderProductEditor();}}
function handleProdPhotoFile(inp){const f=inp.files[0];if(!f||!f.type.startsWith('image/'))return;S.editProd._photoFile=f;const r=new FileReader();r.onload=e=>{S.editProd.photo=e.target.result;renderProductEditor();};r.readAsDataURL(f);}
function handleProdPhotoDrop(e){e.preventDefault();e.currentTarget.classList.remove('over');const f=e.dataTransfer.files[0];if(!f)return;S.editProd._photoFile=f;const r=new FileReader();r.onload=ev=>{S.editProd.photo=ev.target.result;renderProductEditor();};r.readAsDataURL(f);}
function addPres(){S.editProd.presentations.push({id:uid('pr'),name:'',price:0});refreshPresList();updatePriceRange();}
function delPres(id){if(S.editProd.presentations.length===1)return;S.editProd.presentations=S.editProd.presentations.filter(x=>x.id!==id);refreshPresList();updatePriceRange();}
function setPres(id,field,val){const pr=S.editProd.presentations.find(x=>x.id===id);if(pr){pr[field]=val;if(field==='price')updatePriceRange();updateSaveProdBtn();}}
function updatePriceRange(){const el=$('ed-price-range');if(!el)return;const pres=S.editProd.presentations.map(x=>x.price).filter(Boolean);const vars=(S.editProd.variables||[]).flatMap(v=>(v.options||[]).map(o=>o.price||0)).filter(Boolean);const ps=pres.length?pres:vars;el.textContent=ps.length?(Math.min(...ps)===Math.max(...ps)?fmt(Math.min(...ps)):(fmt(Math.min(...ps))+' – '+fmt(Math.max(...ps)))):'--';}
function refreshPresList(){const el=$('pres-list');if(!el)return;el.innerHTML=S.editProd.presentations.map(pr=>'<div class="cp-pres-row"><span class="cc-grip">'+icon('grip',14)+'</span><input class="cc-input flat" value="'+escHtml(pr.name)+'" placeholder="Nombre (ej. Familiar)" style="flex:1" oninput="setPres(\''+pr.id+'\',\'name\',this.value)"><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="'+(pr.price||'')+'" placeholder="0" oninput="setPres(\''+pr.id+'\',\'price\',parseInt(this.value)||0)"></div><button class="cc-mini-del" '+(S.editProd.presentations.length===1?'disabled':'')+' onclick="delPres(\''+pr.id+'\')">'+icon('trash',13)+'</button></div>').join('');}
function addVar(){S.editProd.variables.push({id:uid('vg'),name:'',options:[{id:uid('vo'),name:'',price:0}]});refreshVarList();}
function delVar(vid){S.editProd.variables=S.editProd.variables.filter(v=>v.id!==vid);refreshVarList();}
function setVar(vid,f,v){const vg=S.editProd.variables.find(x=>x.id===vid);if(vg)vg[f]=v;}
function addVarOpt(vid){const vg=S.editProd.variables.find(x=>x.id===vid);if(vg){vg.options.push({id:uid('vo'),name:'',price:0});refreshVarList();}}
function delVarOpt(vid,oid){const vg=S.editProd.variables.find(x=>x.id===vid);if(vg&&vg.options.length>1){vg.options=vg.options.filter(o=>o.id!==oid);refreshVarList();}}
function setVarOpt(vid,oid,f,v){const vg=S.editProd.variables.find(x=>x.id===vid);if(vg){const o=vg.options.find(x=>x.id===oid);if(o)o[f]=v;if(f==='price'){updatePriceRange();updateSaveProdBtn();}}}
function refreshVarList(){const el=$('var-list');if(!el)return;if(!S.editProd.variables.length){el.innerHTML='<button class="cc-add-group" onclick="addVar()">'+icon('sliders',15)+' Agregar una variable (ej. Proteína: Pollo / Carne / Mixta)</button>';return;}el.innerHTML=S.editProd.variables.map(v=>'<div class="cc-var-card"><div class="cc-var-head"><span class="cc-var-tag">'+icon('sliders',12)+' Elección única</span><input class="cc-input flat" style="flex:1;font-weight:700" value="'+escHtml(v.name)+'" placeholder="Nombre" oninput="setVar(\''+v.id+'\',\'name\',this.value)"><button class="cc-mini-del" onclick="delVar(\''+v.id+'\')">'+icon('trash',13)+'</button></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">'+v.options.map(o=>'<div class="cp-pres-row"><span class="cc-var-dot"></span><input class="cc-input flat" style="flex:1" value="'+escHtml(o.name)+'" placeholder="Opción" oninput="setVarOpt(\''+v.id+'\',\''+o.id+'\',\'name\',this.value)"><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="'+(o.price||'')+'" placeholder="0" oninput="setVarOpt(\''+v.id+'\',\''+o.id+'\',\'price\',parseInt(this.value)||0)"></div><button class="cc-mini-del" '+(v.options.length===1?'disabled':'')+' onclick="delVarOpt(\''+v.id+'\',\''+o.id+'\')">'+icon('x',13)+'</button></div>').join('')+'</div><button class="lm-link" style="margin-top:8px" onclick="addVarOpt(\''+v.id+'\')">+ Agregar opción</button></div>').join('');}
function toggleModGroup(gid){const ids=S.editProd.modGroupIds||[];S.editProd.modGroupIds=ids.includes(gid)?ids.filter(x=>x!==gid):[...ids,gid];const el=$('mod-list');if(!el)return;el.querySelectorAll('.cc-modtoggle').forEach(btn=>{if(!btn.getAttribute('onclick').includes('\''+gid+'\''))return;const on=S.editProd.modGroupIds.includes(gid);btn.classList.toggle('on',on);const chk=btn.querySelector('.cc-check');if(chk){chk.classList.toggle('on',on);chk.innerHTML=on?icon('check',12,3):'';}});}
function updateSaveProdBtn(){const p=S.editProd;const hasPres=p.presentations.some(x=>x.name.trim()&&x.price>0);const hasVar=(p.variables||[]).some(v=>(v.options||[]).some(o=>o.price>0));const btn=$('save-prod-btn');if(btn)btn.disabled=!(p.name.trim()&&p.presentations.some(x=>x.name.trim())&&(hasPres||hasVar));}
async function saveProduct(){
  const p=S.editProd;if(!p.name.trim())return;
  const saveBtn=$('save-prod-btn');if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Guardando…';}
  if(p._photoFile){p.photo=await uploadPhoto(p._photoFile,p.id||uid('p'));p._photoFile=null;}
  const savedId=await saveProductToSupabase(p);p.id=savedId;
  const idx=S.products.findIndex(x=>x.id===p.id);if(idx>=0)S.products[idx]=p;else S.products.unshift(p);
  closeOverlay();renderPage();toast('Producto "'+p.name+'" guardado');
}

// ── Combo Editor ──────────────────────────────────────────────────────────
function openModEditorInProduct(){openModEditor(null,true);}
function renderComboEditor(){
  const c=S.editCombo,isNew=!S.combos.find(x=>x.id===c.id);
  const canSave=c.name.trim()&&c.price>0&&c.items.some(x=>x.name.trim());
  const itemRows=c.items.map((it,i)=>'<div class="cp-pres-row"><span class="cc-item-num">'+(i+1)+'</span><input class="cc-input flat" value="'+escHtml(it.name)+'" placeholder="Ej. 2 Hamburguesas Sencillas" style="flex:1" oninput="setComboItem('+i+',this.value)"><button class="cc-mini-del" '+(c.items.length===1?'disabled':'')+' onclick="delComboItem('+i+')">'+icon('trash',13)+'</button></div>').join('');
  const photoHTML=c.photo?'<div class="cc-photo-wrap"><img src="'+escHtml(c.photo)+'" alt=""><div class="cc-photo-overlay"><button class="cc-pill-btn" onclick="document.getElementById(\'combo-photo-input\').click()">'+icon('image',13)+' Cambiar</button><button class="cc-pill-btn danger" onclick="clearComboPhoto()">'+icon('trash',13)+' Quitar</button></div></div>':'<div class="cc-drop" onclick="document.getElementById(\'combo-photo-input\').click()"><div class="cc-drop-icon">'+icon('upload',20)+'</div><div style="font-size:13px;font-weight:700;color:#0F172A">Foto del combo</div><div style="font-size:11.5px;color:#94A3B8;margin-top:3px">Arrastra o <span style="color:#5B6BFF;font-weight:700">búscala</span></div></div>';
  openOverlay('<div class="cc-overlay" onmousedown="handleOverlayClose(event)"><aside class="cc-drawer" onmousedown="event.stopPropagation()"><div class="cc-drawer-head"><div style="display:flex;align-items:center;gap:10px"><span class="cc-drawer-glyph" style="color:#8B5CF6;background:#F5F3FF">'+icon('combo',16)+'</span><div><div class="cc-drawer-eyebrow">'+(isNew?'Nuevo combo':'Editar combo')+'</div><div class="cc-drawer-title">'+(escHtml(c.name)||'Sin nombre')+'</div></div></div><button class="lm-icon-sm" onclick="closeOverlay()">'+icon('x',15)+'</button></div><div class="cc-drawer-body"><input type="file" id="combo-photo-input" accept="image/*" style="display:none" onchange="handleComboPhotoFile(this)">'+photoHTML+'<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:12px;margin-top:18px"><label><span class="field-label">Nombre del combo</span><input class="cc-input" value="'+escHtml(c.name)+'" placeholder="Ej. Combo El Parche x2" oninput="setComboName(this.value)"></label><label><span class="field-label">Precio del combo</span><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="1000" value="'+(c.price||'')+'" placeholder="0" oninput="setComboPrice(parseInt(this.value)||0)"></div></label></div><div style="margin-top:12px"><label><span class="field-label">Descripción <span class="hint">· opcional</span></span><input class="cc-input" value="'+escHtml(c.desc||'')+'" placeholder="Ideal para compartir…" oninput="setComboDesc(this.value)"></label></div><div class="cc-section"><div class="cc-section-head"><div><div class="cc-section-title">Productos incluidos</div></div><button class="lm-btn-ghost sm" onclick="addComboItem()">'+icon('plus',13)+' Ítem</button></div><div id="combo-items">'+itemRows+'</div></div></div><div class="cc-drawer-foot"><div style="display:flex;flex-direction:column"><span style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Precio combo</span><span id="combo-price-display" style="font-size:15px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">'+fmt(c.price)+'</span></div><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button><button class="lm-btn-primary" id="save-combo-btn" '+(canSave?'':'disabled')+' onclick="saveCombo()">'+icon('check',14)+' Guardar</button></div></div></aside></div>');
}
function setComboName(v){S.editCombo.name=v;updateComboSaveBtn();}
function setComboPrice(v){S.editCombo.price=v;const el=$('combo-price-display');if(el)el.textContent=fmt(v);updateComboSaveBtn();}
function setComboDesc(v){S.editCombo.desc=v;}
function clearComboPhoto(){S.editCombo.photo=null;S.editCombo._photoFile=null;renderComboEditor();}
function handleComboPhotoFile(inp){const f=inp.files[0];if(!f||!f.type.startsWith('image/'))return;S.editCombo._photoFile=f;const r=new FileReader();r.onload=e=>{S.editCombo.photo=e.target.result;renderComboEditor();};r.readAsDataURL(f);}
function setComboItem(i,v){S.editCombo.items[i].name=v;updateComboSaveBtn();}
function addComboItem(){S.editCombo.items.push({name:''});refreshComboItems();}
function delComboItem(i){if(S.editCombo.items.length===1)return;S.editCombo.items.splice(i,1);refreshComboItems();}
function refreshComboItems(){const el=$('combo-items');if(!el)return;el.innerHTML=S.editCombo.items.map((it,i)=>'<div class="cp-pres-row"><span class="cc-item-num">'+(i+1)+'</span><input class="cc-input flat" value="'+escHtml(it.name)+'" placeholder="Ej. 2 Hamburguesas" style="flex:1" oninput="setComboItem('+i+',this.value)"><button class="cc-mini-del" '+(S.editCombo.items.length===1?'disabled':'')+' onclick="delComboItem('+i+')">'+icon('trash',13)+'</button></div>').join('');}
function updateComboSaveBtn(){const btn=$('save-combo-btn');if(btn)btn.disabled=!(S.editCombo.name.trim()&&S.editCombo.price>0&&S.editCombo.items.some(x=>x.name.trim()));}
async function saveCombo(){
  const c=S.editCombo;if(!c.name.trim())return;
  const saveBtn=$('save-combo-btn');if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Guardando…';}
  if(c._photoFile){c.photo=await uploadPhoto(c._photoFile,c.id||uid('c'));c._photoFile=null;}
  const savedId=await saveComboToSupabase(c);c.id=savedId;
  const idx=S.combos.findIndex(x=>x.id===c.id);if(idx>=0)S.combos[idx]=c;else S.combos.unshift(c);
  closeOverlay();renderPage();toast('Combo "'+c.name+'" guardado');
}

// ── Mod Group Editor ──────────────────────────────────────────────────────
function openModEditor(id,fromProduct){
  const existing=id?S.mods.find(m=>m.id===id):null;
  S.editMod=existing?JSON.parse(JSON.stringify(existing)):{id:uid('mg'),name:'',rule:'opcional',multi:true,options:[{id:uid('op'),name:'',price:0}]};
  S.editMod._fromProduct=!!fromProduct;
  renderModEditor();
}
function renderModEditor(){
  const g=S.editMod,isNew=!S.mods.find(x=>x.id===g.id),canSave=g.name.trim()&&g.options.some(o=>o.name.trim());
  const optRows=g.options.map(o=>'<div class="cp-pres-row"><span class="cc-grip">'+icon('grip',14)+'</span><input class="cc-input flat" value="'+escHtml(o.name)+'" placeholder="Ej. Queso fundido" style="flex:1" oninput="setModOpt(\''+o.id+'\',\'name\',this.value)"><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="'+(o.price||'')+'" placeholder="0" oninput="setModOpt(\''+o.id+'\',\'price\',parseInt(this.value)||0)"></div><button class="cc-mini-del" '+(g.options.length===1?'disabled':'')+' onclick="delModOpt(\''+o.id+'\')">'+icon('x',13)+'</button></div>').join('');
  openOverlay('<div class="cc-overlay" style="'+(g._fromProduct?'z-index:120':'')+'" onmousedown="handleOverlayClose(event)"><aside class="cc-drawer narrow" onmousedown="event.stopPropagation()"><div class="cc-drawer-head"><div style="display:flex;align-items:center;gap:10px"><span class="cc-drawer-glyph" style="color:#F59E0B;background:#FFFBEB">'+icon('tag',16)+'</span><div><div class="cc-drawer-eyebrow">'+(isNew?'Nuevo grupo':'Editar grupo')+'</div><div class="cc-drawer-title">'+(escHtml(g.name)||'Sin nombre')+'</div></div></div><button class="lm-icon-sm" onclick="closeModEditorBack()">'+icon('x',15)+'</button></div><div class="cc-drawer-body"><label><span class="field-label">Nombre del grupo</span><input class="cc-input" value="'+escHtml(g.name)+'" placeholder="Ej. Adiciones" oninput="setModName(this.value)" autofocus></label><div style="display:flex;gap:18px;margin-top:14px;flex-wrap:wrap"><div><div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">¿Es obligatorio elegir?</div><div class="cc-seg"><button class="'+(g.rule==='opcional'?'on':'')+'" onclick="setModRule(\'opcional\')">Opcional</button><button class="'+(g.rule==='obligatorio'?'on':'')+'" onclick="setModRule(\'obligatorio\')">Obligatorio</button></div></div><div><div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">¿Cuántas puede elegir?</div><div class="cc-seg"><button class="'+(!g.multi?'on':'')+'" onclick="setModMulti(false)">Una opción</button><button class="'+(g.multi?'on':'')+'" onclick="setModMulti(true)">Varias</button></div></div></div><div class="cc-section"><div class="cc-section-head"><div><div class="cc-section-title">Opciones</div><div class="cc-section-sub">Déjalo en $0 si está incluida.</div></div><button class="lm-btn-ghost sm" onclick="addModOpt()">'+icon('plus',13)+' Opción</button></div><div id="mod-opts">'+optRows+'</div></div></div><div class="cc-drawer-foot"><span style="font-size:12px;color:#64748B;font-weight:600">'+g.options.filter(o=>o.name.trim()).length+' opciones</span><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="closeModEditorBack()">Cancelar</button><button class="lm-btn-primary" id="save-mod-btn" '+(canSave?'':'disabled')+' onclick="saveMod()">'+icon('check',14)+' Guardar</button></div></div></aside></div>');
}
function closeModEditorBack(){if(S.editMod._fromProduct)renderProductEditor();else closeOverlay();}
function setModName(v){S.editMod.name=v;updateModSaveBtn();}
function setModRule(r){S.editMod.rule=r;renderModEditor();}
function setModMulti(v){S.editMod.multi=v;renderModEditor();}
function addModOpt(){S.editMod.options.push({id:uid('op'),name:'',price:0});refreshModOpts();}
function delModOpt(id){if(S.editMod.options.length===1)return;S.editMod.options=S.editMod.options.filter(o=>o.id!==id);refreshModOpts();}
function setModOpt(id,f,v){const o=S.editMod.options.find(x=>x.id===id);if(o){o[f]=v;}updateModSaveBtn();}
function refreshModOpts(){const el=$('mod-opts');if(!el)return;el.innerHTML=S.editMod.options.map(o=>'<div class="cp-pres-row"><span class="cc-grip">'+icon('grip',14)+'</span><input class="cc-input flat" value="'+escHtml(o.name)+'" placeholder="Ej. Queso fundido" style="flex:1" oninput="setModOpt(\''+o.id+'\',\'name\',this.value)"><div class="cc-money"><span class="cc-money-sym">$</span><input type="number" min="0" step="500" value="'+(o.price||'')+'" placeholder="0" oninput="setModOpt(\''+o.id+'\',\'price\',parseInt(this.value)||0)"></div><button class="cc-mini-del" '+(S.editMod.options.length===1?'disabled':'')+' onclick="delModOpt(\''+o.id+'\')">'+icon('x',13)+'</button></div>').join('');}
function updateModSaveBtn(){const btn=$('save-mod-btn');if(btn)btn.disabled=!(S.editMod.name.trim()&&S.editMod.options.some(o=>o.name.trim()));}
async function saveMod(){
  const g=S.editMod,fromProduct=g._fromProduct;delete g._fromProduct;
  const savedId=await saveModGroupToSupabase(g);g.id=savedId;
  const idx=S.mods.findIndex(x=>x.id===g.id);if(idx>=0)S.mods[idx]=g;else S.mods.push(g);
  if(fromProduct){if(!S.editProd.modGroupIds.includes(g.id))S.editProd.modGroupIds.push(g.id);renderProductEditor();}
  else{closeOverlay();renderPage();}
  toast('Grupo "'+g.name+'" guardado');
}

// ── Category Editor ───────────────────────────────────────────────────────
function openCatEditor(id){
  const existing=id?S.cats.find(c=>c.id===id):null;
  S.editCat=existing?JSON.parse(JSON.stringify(existing)):{id:uid('cat'),name:'',...CAT_PALETTE[S.cats.length%8]};
  renderCatEditor();
}
function renderCatEditor(){
  const c=S.editCat,isNew=!S.cats.find(x=>x.id===c.id);
  const palBtns=CAT_PALETTE.map((p,i)=>'<button class="cc-pal-btn" style="background:'+p.tint+';border-color:'+(c.color===p.color?p.color:'transparent')+'" onclick="setCatPal('+i+')"><span style="width:16px;height:16px;border-radius:999px;background:'+p.color+';display:block"></span></button>').join('');
  openOverlay('<div class="cc-overlay center" onmousedown="handleOverlayClose(event)"><div class="cc-modal narrow" onmousedown="event.stopPropagation()"><div class="cc-modal-head"><div style="display:flex;align-items:center;gap:10px"><span class="cc-modal-glyph" style="color:'+c.color+';background:'+c.tint+'">'+icon('layers',16)+'</span><div><div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;font-weight:700">'+(isNew?'Nueva categoría':'Editar categoría')+'</div><div style="font-size:16px;font-weight:800;color:#0F172A;letter-spacing:-.02em">'+(escHtml(c.name)||'Sin nombre')+'</div></div></div><button class="lm-icon-sm" onclick="closeOverlay()">'+icon('x',15)+'</button></div><div style="padding:20px"><label><span class="field-label">Nombre de la categoría</span><input class="cc-input" value="'+escHtml(c.name)+'" placeholder="Ej. Salchipapas" oninput="setCatName(this.value)" autofocus></label><div style="margin-top:16px"><div style="font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Color de etiqueta</div><div style="display:flex;gap:10px;flex-wrap:wrap">'+palBtns+'</div></div><div class="cc-preview-bar"><span style="font-size:11px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Vista previa</span><span id="cat-preview-tag" class="cc-cat-tag-preview" style="color:'+c.color+';background:'+c.tint+'">'+escHtml(c.name)||'Categoría'+'</span></div></div><div class="cc-modal-foot"><span></span><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button><button class="lm-btn-primary" id="save-cat-btn" '+(c.name.trim()?'':'disabled')+' onclick="saveCat()">'+icon('check',14)+' Guardar</button></div></div></div></div>');
}
function setCatName(v){S.editCat.name=v;const t=$('cat-preview-tag');if(t)t.textContent=v||'Categoría';const btn=$('save-cat-btn');if(btn)btn.disabled=!v.trim();}
function setCatPal(i){const p=CAT_PALETTE[i];S.editCat.color=p.color;S.editCat.tint=p.tint;S.editCat.ring=p.ring;renderCatEditor();}
async function saveCat(){
  const c=S.editCat;if(!c.name.trim())return;
  const saved=await saveCategoryToSupabase(c);
  const idx=S.cats.findIndex(x=>x.id===c.id||x.id===saved.id);
  const finalCat={...c,...saved};if(idx>=0)S.cats[idx]=finalCat;else S.cats.push(finalCat);
  closeOverlay();renderPage();toast('Categoría "'+c.name+'" guardada');
}

// ── AI Import ─────────────────────────────────────────────────────────────
function openAIImport(){S.aiStage='source';S.aiTab='file';S.aiFile=null;S.aiUrl='';S.aiResult=null;S.aiError=null;S.aiExcluded={};S.aiExcludedMods={};S.aiOpenCat=null;S.aiEditKey=null;S.aiTimers.forEach(clearTimeout);S.aiTimers=[];renderAIImport();}
function renderAIImport(){
  const stage=S.aiStage,stageMap=['source','analyzing','review'],steps=['Fuente','Análisis','Revisión'];
  const stepDots=steps.map((s,i)=>{const cur=stageMap.indexOf(stage),state=i<cur?'done':i===cur?'active':'todo',bg=state==='todo'?'#F1F5F9':'#8B5CF6',col=state==='todo'?'#94A3B8':'#fff',inner=state==='done'?icon('check',12,3):i+1;return '<div style="display:flex;align-items:center;gap:8px"><span class="cc-step-dot" style="background:'+bg+';color:'+col+'">'+inner+'</span><span style="font-size:12px;font-weight:700;color:'+(state==='todo'?'#94A3B8':'#0F172A')+'">'+s+'</span></div>'+(i<2?'<span style="flex:1;height:2px;background:'+(i<cur?'#8B5CF6':'#ECEEF2')+';border-radius:2px"></span>':'');}).join('');
  let bodyHTML='',footHTML='';

  if(stage==='source'){
    const errBanner=S.aiError?'<div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:10px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px;margin-bottom:14px"><span style="color:#F43F5E;flex-shrink:0;display:flex">'+icon('x',16)+'</span><div style="font-size:12.5px;color:#9F1239;line-height:1.5">'+escHtml(S.aiError)+'</div></div>':'';
    const fileContent=S.aiFile?'<div class="cc-file-card"><span class="cc-file-icon">'+icon('file',20)+'</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(S.aiFile.name)+'</div><div style="font-size:11px;color:#94A3B8">'+(S.aiFile.size/1024).toFixed(0)+' KB</div></div><button class="lm-icon-sm" onclick="S.aiFile=null;renderAIImport()">'+icon('x',14)+'</button></div>':'<div class="cc-drop big" ondragover="event.preventDefault();this.classList.add(\'over\')" ondragleave="this.classList.remove(\'over\')" ondrop="handleAIFileDrop(event)" onclick="document.getElementById(\'ai-file-input\').click()"><div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#F5F3FF,#EEF2FF);color:#8B5CF6;display:flex;align-items:center;justify-content:center;margin-bottom:12px">'+icon('upload',24)+'</div><div style="font-size:14px;font-weight:700;color:#0F172A">Arrastra tu menú aquí</div><div style="font-size:12px;color:#94A3B8;margin-top:4px">PDF o imagen · o <span style="color:#8B5CF6;font-weight:700">búscalo en tu equipo</span></div></div>';
    bodyHTML='<input type="file" id="ai-file-input" accept="application/pdf,image/*" style="display:none" onchange="handleAIFileSelect(this)">'+errBanner+'<div class="cc-seg lg" style="margin-bottom:16px"><button class="'+(S.aiTab==='file'?'on':'')+'" onclick="S.aiTab=\'file\';renderAIImport()">'+icon('upload',14)+' Archivo</button><button class="'+(S.aiTab==='drive'?'on':'')+'" onclick="S.aiTab=\'drive\';renderAIImport()">'+icon('drive',14)+' Google Drive</button></div>'+(S.aiTab==='file'?fileContent:'<div class="cc-input-wrap"><span style="color:#94A3B8;display:flex">'+icon('drive',16)+'</span><input id="ai-drive-url" value="'+escHtml(S.aiUrl)+'" placeholder="https://drive.google.com/file/d/…" oninput="S.aiUrl=this.value"></div>')+'<div class="cc-tip-box"><span class="cc-tip-icon">'+icon('sparkle',14)+'</span><div style="font-size:12px;color:#5B21B6;line-height:1.5">GPT-4o detecta <strong>categorías, productos, presentaciones, variables y adiciones</strong> automáticamente.</div></div>';
    const ready=(S.aiTab==='file'&&!!S.aiFile)||(S.aiTab==='drive'&&S.aiUrl.trim().length>6);
    footHTML='<span style="font-size:11.5px;color:#94A3B8">Tus datos no se publican hasta confirmar.</span><div style="display:flex;gap:8px"><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button><button class="cc-btn-ai" '+(ready?'':'disabled')+' onclick="startAIAnalysis()">'+icon('sparkle',14)+' Analizar con IA</button></div>';

  } else if(stage==='analyzing'){
    const AI_MSGS={'inventory':['Estudiando el menú de arriba abajo, sin saltarse nada…','Memorizando cada sección como mesero nuevo el primer día…','Identificando todas las categorías, una por una…','Buscando cada plato hasta el último de la columna…'],'prices':['Calculando precios como abuela que sabe cuánto cuesta todo…','Diferenciando el Personal del Familiar con ojo de experto…','Convirtiendo cada $K a número real más rápido que el cajero…','Anotando el valor de cada presentación en la libreta mental…'],'variables':['Detectando qué platos son familia, como en reunión de fin de año…','Buscando variaciones: mixta, carne o pollo… decisión difícil…','Agrupando los primos del menú que comparten apellido…','Analizando relaciones entre productos con ojo de sommelier…'],'modifiers':['Encontrando los extras que hacen la diferencia en el plato…','Buscando las adiciones que le suben el sabor al pedido…','Identificando todo lo que se puede personalizar…','Revisando cada ingrediente opcional con ojo de chef…']};
    const stepKey=S.aiStepKey||'inventory';
    const msgs=AI_MSGS[stepKey]||AI_MSGS['inventory'];
    const msg=msgs[S.aiMsgIdx%msgs.length];
    const stepNum={inventory:1,prices:2,variables:3,modifiers:4}[stepKey]||1;
    const stepLabel={inventory:'Inventario de la carta',prices:'Precios y presentaciones',variables:'Variables y agrupaciones',modifiers:'Adiciones y extras'}[stepKey]||'Iniciando';
    const progress=S.aiProgress||0;
    bodyHTML='<div style="padding:8px 0">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      +'<span style="font-size:10.5px;font-weight:800;color:#8B5CF6;text-transform:uppercase;letter-spacing:.07em">Paso '+stepNum+' de 4 — '+stepLabel+'</span>'
      +'<span style="font-size:12px;font-weight:800;color:#8B5CF6">'+progress+'%</span>'
      +'</div>'
      +'<div style="height:7px;background:#F1F5F9;border-radius:99px;overflow:hidden;margin-bottom:20px">'
      +'<div style="height:100%;width:'+progress+'%;background:linear-gradient(90deg,#8B5CF6,#5B6BFF);border-radius:99px;transition:width .9s ease"></div>'
      +'</div>'
      +'<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:20px">'
      +'<div class="cc-spinner" style="width:30px;height:30px;border-width:3px;flex-shrink:0;margin-top:2px"></div>'
      +'<div><div id="ai-creative-msg" style="font-size:14px;font-weight:700;color:#0F172A;line-height:1.45;min-height:42px">'+msg+'</div>'
      +'<div style="font-size:11.5px;color:#94A3B8;margin-top:5px">GPT-4o en el paso '+stepNum+' de 4…</div>'
      +'</div></div>'
      +'<div class="cc-tip-box" style="margin-top:0"><span class="cc-tip-icon">'+icon('sparkle',14)+'</span>'
      +'<div style="font-size:11.5px;color:#5B21B6;line-height:1.5">Este análisis en 4 pasos tarda <strong>30–60 segundos</strong>. Cada paso se enfoca en una sola cosa para no perderse ningún producto.</div>'
      +'</div></div>';
    footHTML='<span style="font-size:11.5px;color:#94A3B8">No cierres esta ventana mientras analiza.</span><button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>';

  } else {
    const ex=S.aiResult||{categories:[],modifier_groups:[]};
    const incl=ex.categories.filter(cat=>!S.aiExcluded[cat.name]),inclProds=incl.reduce((a,cat)=>a+cat.products.length,0);
    const inclMods=(ex.modifier_groups||[]).filter(g=>!S.aiExcludedMods[g.name]);

    const catBlocks=ex.categories.map((cat,ci)=>{
      const off=!!S.aiExcluded[cat.name],open=S.aiOpenCat===cat.name;
      const prodRows=open&&!off?cat.products.map((pr,pi)=>{
        const editKey=ci+':'+pi;
        const isEditing=S.aiEditKey===editKey;
        if(isEditing){
          const catOpts=ex.categories.map((ct,idx)=>'<option value="'+idx+'"'+(idx===ci?' selected':'')+'>'+escHtml(ct.name)+'</option>').join('');
          const presInputs=(pr.presentations||[]).map((p,psi)=>
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">'
            +'<input class="cc-input" style="flex:1;font-size:12px;padding:5px 9px" value="'+escHtml(p.name)+'" placeholder="Nombre" oninput="aiUpdatePresName('+ci+','+pi+','+psi+',this.value)">'
            +'<input class="cc-input" type="number" style="width:90px;font-size:12px;padding:5px 9px;text-align:right" value="'+p.price+'" placeholder="Precio" oninput="aiUpdatePresPrice('+ci+','+pi+','+psi+',+this.value)">'
            +'<button class="lm-icon-sm" onclick="aiRemovePres('+ci+','+pi+','+psi+')">'+icon('x',13)+'</button>'
            +'</div>'
          ).join('');
          const varInputs=(pr.variables||[]).map((v,vi)=>{
            const opts=v.options.map((o,oi)=>{
              const priceInp=v.isPricing
                ?'<input class="cc-input" type="number" style="width:75px;font-size:11px;padding:4px 7px;text-align:right" value="'+(o.prices?o.prices[0]||0:o.price||0)+'" placeholder="$" oninput="aiUpdateVarOptPrice('+ci+','+pi+','+vi+','+oi+',+this.value)">'
                :'';
              return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">'
                +'<input class="cc-input" style="flex:1;font-size:11.5px;padding:4px 9px" value="'+escHtml(o.name)+'" oninput="aiUpdateVarOptName('+ci+','+pi+','+vi+','+oi+',this.value)">'
                +priceInp
                +'<button class="lm-icon-sm" onclick="aiRemoveVarOpt('+ci+','+pi+','+vi+','+oi+')">'+icon('x',13)+'</button>'
                +'</div>';
            }).join('');
            return '<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:#8B5CF6;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Variable: '+escHtml(v.name)+'</div>'
              +opts
              +'<button class="lm-btn-ghost" style="font-size:11px;padding:3px 9px;margin-top:2px" onclick="aiAddVarOpt('+ci+','+pi+','+vi+')">+ Opcion</button></div>';
          }).join('');
          return '<div class="cc-prod-row" style="flex-direction:column;align-items:stretch;gap:6px;padding:10px 0">'
            +'<div style="display:flex;align-items:center;gap:8px">'
            +'<span style="font-size:12px;font-weight:700;color:#8B5CF6;flex:1">'+escHtml(pr.name)+'</span>'
            +'<button class="lm-btn-primary" style="font-size:11px;padding:4px 12px" onclick="S.aiEditKey=null;renderAIImport()">'+icon('check',12)+' Listo</button>'
            +'</div>'
            +'<div><div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Categoria</div>'
            +'<select class="cc-input" style="width:100%;font-size:12px;padding:5px 9px" onchange="aiMoveProd('+ci+','+pi+',+this.value)">'+catOpts+'</select></div>'
            +'<div><div style="font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Presentaciones y precios</div>'
            +presInputs
            +'<button class="lm-btn-ghost" style="font-size:11px;padding:3px 9px" onclick="aiAddPres('+ci+','+pi+')">+ Presentacion</button></div>'
            +(varInputs?'<div>'+varInputs+'</div>':'')
            +'</div>';
        }
        const pTags=(pr.presentations||[]).map(p=>'<span class="cc-pres-tag" style="background:#F0FDF4;color:#16A34A;border:1px solid #BBF7D0">'+escHtml(p.name)+(p.price>0?(' · $'+Number(p.price).toLocaleString('es-CO')):'')+'</span>').join('');
        const vRows=(pr.variables||[]).map(v=>'<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span style="font-size:9.5px;font-weight:800;color:#8B5CF6;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">'+escHtml(v.name)+':</span>'+v.options.map(o=>'<span class="cc-pres-tag" style="background:#F5F3FF;color:#7C3AED;border:1px solid #DDD6FE">'+escHtml(o.name)+'</span>').join('')+'</div>').join('');
        const presRow=pTags?'<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span style="font-size:9.5px;font-weight:800;color:#16A34A;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Pres.:</span>'+pTags+'</div>':'';
        const modeChip=pr.priceMode==='matrix'?'<span style="font-size:9px;font-weight:700;background:#EDE9FE;color:#7C3AED;padding:2px 6px;border-radius:99px">MATRIZ</span>':'';
        const varChip=pr.variables&&pr.variables.length?'<span style="font-size:9px;font-weight:700;background:#F5F3FF;color:#8B5CF6;padding:2px 6px;border-radius:99px">'+pr.variables.length+' var.</span>':'';
        return '<div class="cc-prod-row" style="flex-direction:column;align-items:flex-start;gap:3px">'
          +'<div style="display:flex;align-items:center;gap:6px;width:100%">'
          +'<span style="font-size:12.5px;font-weight:700;color:#0F172A;flex:1">'+escHtml(pr.name)+'</span>'
          +modeChip+varChip
          +'<button class="lm-icon-sm" title="Editar" data-key="'+editKey+'" onclick="S.aiEditKey=this.dataset.key;renderAIImport()" style="opacity:.55">'+icon('edit',13)+'</button>'
          +'</div>'+presRow+vRows+'</div>';
      }).join(''):'';
      return '<div class="cc-cat-block" style="opacity:'+(off?.55:1)+';border-color:'+(open&&!off?'#DDD6FE':'#ECEEF2')+'">'
        +'<div class="cc-cat-row">'
        +'<button class="cc-check'+(off?'':' on')+'" data-cat="'+escHtml(cat.name)+'" onclick="toggleAICat(this.dataset.cat)" style="'+(off?'':'background:#8B5CF6;border-color:#8B5CF6;color:#fff')+'">'+(off?'':icon('check',12,3))+'</button>'
        +'<button class="cc-cat-toggle" data-cat="'+escHtml(cat.name)+'" onclick="var n=this.dataset.cat;S.aiOpenCat=S.aiOpenCat===n?null:n;renderAIImport()">'
        +'<span style="font-size:13.5px;font-weight:700;color:#0F172A">'+escHtml(cat.name)+'</span>'
        +'<span class="cc-cat-count">'+cat.products.length+' productos</span>'
        +'<span style="margin-left:auto;color:#CBD5E1;transform:'+(open?'rotate(90deg)':'none')+';transition:transform .15s;display:flex">'+icon('chevron',15)+'</span>'
        +'</button></div>'
        +(prodRows?'<div class="cc-prod-list">'+prodRows+'</div>':'')
        +'</div>';
    }).join('');

    const mgroups=ex.modifier_groups||[];
    const modBlock=mgroups.length?'<div style="margin-top:12px">'
      +'<div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Grupos de adiciones detectados</div>'
      +mgroups.map(g=>{
        const off=!!S.aiExcludedMods[g.name];
        const optList=(g.options||[]).map(o=>'<span class="cc-pres-tag" style="background:#FFFBEB;color:#92400E;border:1px solid #FDE68A">'+escHtml(o.name)+(o.price?' · $'+Number(o.price).toLocaleString('es-CO'):'')+'</span>').join('');
        return '<div class="cc-cat-block" style="opacity:'+(off?.55:1)+';border-color:#FDE68A">'
          +'<div class="cc-cat-row">'
          +'<button class="cc-check'+(off?'':' on')+'" data-mod="'+escHtml(g.name)+'" onclick="toggleAIMod(this.dataset.mod)" style="'+(off?'':'background:#F59E0B;border-color:#F59E0B;color:#fff')+'">'+(off?'':icon('check',12,3))+'</button>'
          +'<div style="flex:1"><span style="font-size:13px;font-weight:700;color:#0F172A">'+escHtml(g.name)+'</span><span class="cc-cat-count">'+(g.options||[]).length+' opciones</span></div>'
          +'</div>'
          +(optList?'<div class="cc-prod-list" style="padding:8px 12px"><div style="display:flex;gap:5px;flex-wrap:wrap">'+optList+'</div></div>':'')
          +'</div>';
      }).join('')+'</div>':'';

    const stats=ex._stats||{};
    bodyHTML='<div class="cc-result-banner"><span style="color:#10B981;display:flex">'+icon('checkc',18)+'</span>'
      +'<div style="flex:1"><div style="font-size:13.5px;font-weight:800;color:#0F172A">Menu analizado con GPT-4o</div>'
      +'<div style="font-size:11.5px;color:#64748B;margin-top:1px">'+(stats.categories||incl.length)+' categorias · '+(stats.products||inclProds)+' productos'+(mgroups.length?' · '+mgroups.length+' grupos de adiciones':'')+'</div>'
      +'</div></div>'
      +'<div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;margin:4px 2px 8px">Revisa y edita antes de importar</div>'
      +'<div style="display:flex;flex-direction:column;gap:8px">'+catBlocks+'</div>'
      +modBlock;
    footHTML='<span style="font-size:12px;color:#64748B;font-weight:600">'+incl.length+' cat. · '+inclProds+' prods'+(inclMods.length?' · '+inclMods.length+' grupos mod.':'')+'</span>'
      +'<div style="display:flex;gap:8px">'
      +'<button class="lm-btn-ghost" onclick="S.aiStage=\'source\';renderAIImport()">Volver</button>'
      +'<button class="cc-btn-ai" '+(inclProds?'':'disabled')+' onclick="importFromAI()">'+icon('check',14)+' Importar al catalogo</button>'
      +'</div>';
  }
  openOverlay('<div class="cc-overlay center" onmousedown="handleOverlayClose(event)"><div class="cc-modal wide" onmousedown="event.stopPropagation()"><div class="cc-modal-head"><div style="display:flex;align-items:center;gap:11px"><span class="cc-modal-glyph" style="background:linear-gradient(135deg,#8B5CF6,#5B6BFF);color:#fff;box-shadow:0 4px 12px -3px rgba(139,92,246,.5)">'+icon('sparkle',18)+'</span><div><div style="font-size:15px;font-weight:800;color:#0F172A;letter-spacing:-.02em">Importar menú con IA</div><div style="font-size:11.5px;color:#94A3B8">Sube tu carta y GPT-4o la convierte en catálogo automáticamente</div></div></div><button class="lm-icon-sm" onclick="closeOverlay()">'+icon('x',15)+'</button></div><div class="cc-steps-bar">'+stepDots+'</div><div class="cc-modal-body">'+bodyHTML+'</div><div class="cc-modal-foot">'+footHTML+'</div></div></div>');
}

function handleAIFileSelect(inp){if(inp.files[0]){S.aiFile=inp.files[0];renderAIImport();}}
function handleAIFileDrop(e){e.preventDefault();e.currentTarget.classList.remove('over');if(e.dataTransfer.files[0]){S.aiFile=e.dataTransfer.files[0];renderAIImport();}}
function toggleAICat(name){S.aiExcluded[name]=!S.aiExcluded[name];renderAIImport();}
function toggleAIMod(name){S.aiExcludedMods[name]=!S.aiExcludedMods[name];renderAIImport();}
function aiMoveProd(ci,pi,newCi){if(+newCi===ci)return;const p=S.aiResult.categories[ci].products.splice(pi,1)[0];S.aiResult.categories[+newCi].products.push(p);S.aiEditKey=null;renderAIImport();}
function aiUpdatePresName(ci,pi,psi,v){S.aiResult.categories[ci].products[pi].presentations[psi].name=v;}
function aiUpdatePresPrice(ci,pi,psi,v){S.aiResult.categories[ci].products[pi].presentations[psi].price=v;}
function aiRemovePres(ci,pi,psi){S.aiResult.categories[ci].products[pi].presentations.splice(psi,1);renderAIImport();}
function aiAddPres(ci,pi){S.aiResult.categories[ci].products[pi].presentations.push({name:'Nueva',price:0});renderAIImport();}
function aiUpdateVarOptName(ci,pi,vi,oi,v){S.aiResult.categories[ci].products[pi].variables[vi].options[oi].name=v;}
function aiUpdateVarOptPrice(ci,pi,vi,oi,v){const o=S.aiResult.categories[ci].products[pi].variables[vi].options[oi];if(o.prices)o.prices=o.prices.map(()=>v);else o.price=v;}
function aiRemoveVarOpt(ci,pi,vi,oi){S.aiResult.categories[ci].products[pi].variables[vi].options.splice(oi,1);renderAIImport();}
function aiAddVarOpt(ci,pi,vi){S.aiResult.categories[ci].products[pi].variables[vi].options.push({name:'Nueva opcion',price:0});renderAIImport();}
async function fileToBase64Ai(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});}
async function pdfToImages(file){
  if(!window.pdfjsLib){
    await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf=await file.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
  const imgs=[];const max=Math.min(pdf.numPages,4);
  for(let i=1;i<=max;i++){const page=await pdf.getPage(i);const vp=page.getViewport({scale:2});const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;imgs.push({data:cv.toDataURL('image/jpeg',0.9).split(',')[1],mimeType:'image/jpeg'});}
  return imgs;
}
function setAIProgress(progress,stepKey,resetMsg){
  S.aiProgress=progress;S.aiStepKey=stepKey;
  if(resetMsg)S.aiMsgIdx=0;
  renderAIImport();
  S.aiTimers.forEach(clearInterval);S.aiTimers=[];
  const AI_MSGS={'inventory':['Estudiando el menu de arriba abajo, sin saltarse nada…','Memorizando cada seccion como mesero nuevo el primer dia…','Identificando todas las categorias, una por una…','Buscando cada plato hasta el ultimo de la columna…'],'prices':['Calculando precios como abuela que sabe cuanto cuesta todo…','Diferenciando el Personal del Familiar con ojo de experto…','Convirtiendo cada $K a numero real mas rapido que el cajero…','Anotando el valor de cada presentacion en la libreta mental…'],'variables':['Detectando que platos son familia, como en reunion de fin de ano…','Buscando variaciones: mixta, carne o pollo… decision dificil…','Agrupando los primos del menu que comparten apellido…','Analizando relaciones entre productos con ojo de sommelier…'],'modifiers':['Encontrando los extras que hacen la diferencia en el plato…','Buscando las adiciones que le suben el sabor al pedido…','Identificando todo lo que se puede personalizar…','Revisando cada ingrediente opcional con ojo de chef…']};
  const msgs=AI_MSGS[stepKey]||[];
  if(msgs.length>1){
    const iv=setInterval(()=>{
      S.aiMsgIdx++;
      const el=document.getElementById('ai-creative-msg');
      if(el)el.textContent=msgs[S.aiMsgIdx%msgs.length];
    },3500);
    S.aiTimers.push(iv);
  }
}
async function startAIAnalysis(){
  S.aiStage='analyzing';S.aiError=null;S.aiProgress=0;S.aiStepKey='inventory';S.aiMsgIdx=0;
  S.aiTimers.forEach(clearInterval);S.aiTimers=[];
  renderAIImport();
  try{
    let images;
    if(S.aiTab==='drive'){
      throw new Error('Google Drive aun no soportado en el pipeline. Usa imagen o PDF.');
    } else {
      const file=S.aiFile;
      images=file.type==='application/pdf'?await pdfToImages(file):[{data:await fileToBase64Ai(file),mimeType:file.type||'image/jpeg'}];
    }
    const {data:{session}}=await sb.auth.getSession();
    const hdrs={'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_KEY};
    const ep='https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/analyze-menu';

    // Paso 1 — Inventario
    setAIProgress(5,'inventory',true);
    const inv=await fetch(ep,{method:'POST',headers:hdrs,body:JSON.stringify({mode:'inventory',images})}).then(r=>r.json());
    if(inv.error)throw new Error('Paso 1: '+inv.error);
    if(!inv.categories?.length)throw new Error('No se detectaron categorias. Intenta con una imagen mas clara.');

    // Paso 2 — Precios y presentaciones
    setAIProgress(28,'prices',true);
    const priced=await fetch(ep,{method:'POST',headers:hdrs,body:JSON.stringify({mode:'prices',images,context:inv})}).then(r=>r.json());
    if(priced.error)throw new Error('Paso 2: '+priced.error);

    // Paso 3 — Variables y agrupacion
    setAIProgress(54,'variables',true);
    let withVars=priced;
    try{
      const vres=await fetch(ep,{method:'POST',headers:hdrs,body:JSON.stringify({mode:'variables',images,context:priced})}).then(r=>r.json());
      if(!vres.error&&vres.categories?.length)withVars=vres;
    }catch(e){console.warn('Variables step failed, using prices result',e);}

    // Paso 4 — Modificadores
    setAIProgress(78,'modifiers',true);
    let mods={modifier_groups:[]};
    try{
      const mres=await fetch(ep,{method:'POST',headers:hdrs,body:JSON.stringify({mode:'modifiers',images})}).then(r=>r.json());
      if(!mres.error)mods=mres;
    }catch(e){console.warn('Modifiers step failed',e);}

    setAIProgress(100,'modifiers',false);
    S.aiTimers.forEach(clearInterval);S.aiTimers=[];

    const finalResult={categories:withVars.categories||[],modifier_groups:mods.modifier_groups||[]};
    S.aiResult=finalResult;S.aiExcluded={};S.aiOpenCat=finalResult.categories[0]?.name||null;
    S.aiStage='review';renderAIImport();
  } catch(e){
    S.aiTimers.forEach(clearInterval);S.aiTimers=[];
    S.aiError=e.message;S.aiStage='source';renderAIImport();
  }
}
async function importFromAI(){
  const ex=S.aiResult||{categories:[]};
  const incl=ex.categories.filter(c=>!S.aiExcluded[c.name]);
  const newCats=[],newProds=[],nameToCat={};
  S.cats.forEach(c=>nameToCat[c.name.toLowerCase()]=c.id);
  let palI=S.cats.length;
  for(const c of incl){
    let catId=nameToCat[c.name.toLowerCase()];
    if(!catId){const pal=CAT_PALETTE[palI%8];const saved=await saveCategoryToSupabase({id:uid('cat'),name:c.name,...pal});catId=saved.id;newCats.push({...saved,...pal});nameToCat[c.name.toLowerCase()]=catId;palI++;}
    for(const pr of c.products){
      const presentations=(pr.presentations||[{name:'Único',price:0}]).map(p=>({id:uid('pr'),name:p.name||'Único',price:p.price||0}));
      const variables=(pr.variables||[]).map(v=>({id:uid('vg'),name:v.name,isPricing:v.isPricing||false,options:(v.options||[]).map(o=>({id:uid('vo'),name:o.name,price:o.price||0,prices:o.prices||null}))}));
      const modGroupIds=[];
      for(const m of (pr.modifiers||[])){
        const group={id:uid('mg'),name:m.name,rule:m.rule||'opcional',multi:m.multi!==false,options:(m.options||[]).map(o=>({id:uid('op'),name:o.name,price:o.price||0}))};
        const savedId=await saveModGroupToSupabase(group);group.id=savedId;
        const idx=S.mods.findIndex(x=>x.id===group.id);if(idx>=0)S.mods[idx]=group;else S.mods.push(group);
        modGroupIds.push(savedId);
      }
      const prod={id:uid('p'),cat:catId,name:pr.name,desc:pr.description||'',active:true,photo:null,presentations,variables,modGroupIds,priceMode:pr.priceMode||'simple'};
      const savedId=await saveProductToSupabase(prod);prod.id=savedId;newProds.push(prod);
    }
  }
  const inclModsArr=(ex.modifier_groups||[]).filter(g=>!S.aiExcludedMods[g.name]);
  for(const g of inclModsArr){
    const group={id:uid('mg'),name:g.name,rule:g.rule||'opcional',multi:g.multi!==false,options:(g.options||[]).map(o=>({id:uid('op'),name:o.name,price:o.price||0}))};
    const savedId=await saveModGroupToSupabase(group);group.id=savedId;
    const idx=S.mods.findIndex(x=>x.id===group.id);if(idx>=0)S.mods[idx]=group;else S.mods.push(group);
  }
  S.cats=[...S.cats,...newCats];S.products=[...newProds,...S.products];
  closeOverlay();S.tab='productos';S.filterCat=null;renderPage();
  toast(newProds.length+' productos'+(inclModsArr.length?' y '+inclModsArr.length+' grupos de adiciones':'')+' importados con IA ✓');
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  const { data: { user } } = await sb.auth.getUser();
  S.tenantId = user.user_metadata?.tenant_id || null;
  S.branchId  = user.user_metadata?.branch_id  || null;

  // Mostrar nombre en topbar
  const chip = document.getElementById('cp-user-chip-name');
  if (chip) chip.textContent = (user.user_metadata?.name || user.email || '').split('@')[0];

  // Render inmediato con estructura vacía
  renderPage();

  // Cargar datos del usuario autenticado
  try {
    await Promise.all([loadCategories(), loadModifierGroups()]);
    await loadProducts();
    await loadCombos();
  } catch(e) {
    console.error('Boot load error:', e);
  } finally {
    S.loading=false;
    renderPage();
  }

  // Redirigir si la sesión expira
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = 'login.html';
  });
});

// ---- Bulk delete ----
function selectAll(){
  const filtered=S.products.filter(p=>!S.filterCat||p.cat===S.filterCat);
  const allSel=filtered.length&&filtered.every(p=>S.selected.has(p.id));
  if(allSel){filtered.forEach(p=>S.selected.delete(p.id));}
  else{filtered.forEach(p=>S.selected.add(p.id));}
  renderPage();renderPageHead();
}

function deleteByCat(catId,catName,count){
  showConfirmModal(
    'Borrar '+count+' producto'+(count!==1?'s':'')+' de "'+catName+'"',
    'Se eliminarán todos los productos de esta categoría. Esta acción no se puede deshacer.',
    async ()=>{
      const ids=S.products.filter(p=>p.cat===catId).map(p=>p.id);
      for(const id of ids){await deleteProductFromSupabase(id);}
      S.products=S.products.filter(p=>p.cat!==catId);
      if(S.filterCat===catId)S.filterCat=null;
      renderPage();
      toast(count+' producto'+(count!==1?'s':'')+' eliminado'+(count!==1?'s':''));
    }
  );
}

function toggleSelectMode(){
  S.selectMode=!S.selectMode;
  if(!S.selectMode) S.selected.clear();
  renderPage();
  renderPageHead();
}

function toggleSelect(id){
  if(S.selected.has(id)) S.selected.delete(id);
  else S.selected.add(id);
  // Update card style + bar count without full re-render
  const card=document.querySelector('.cp-card-grid .cp-card[onclick*="'+id+'"]');
  if(card){
    if(S.selected.has(id)) card.classList.add('cp-selected');
    else card.classList.remove('cp-selected');
  }
  // Update checkmark icon
  renderProductGrid(document.getElementById('cp-body'));
  const bar=document.getElementById('cp-sel-bar');
  if(bar){
    const span=bar.querySelector('span');
    if(span) span.textContent=S.selected.size+' seleccionado'+(S.selected.size!==1?'s':'');
  }
}

async function deleteSelected(){
  if(!S.selected.size) return;
  const ids=[...S.selected];
  showConfirmModal(
    'Eliminar '+ids.length+' producto'+(ids.length!==1?'s':''),
    'Esta acción no se puede deshacer.',
    async ()=>{
      for(const id of ids){ await deleteProductFromSupabase(id); S.products=S.products.filter(x=>x.id!==id); }
      S.selected.clear();
      S.selectMode=false;
      renderPage();
      toast('Productos eliminados');
    }
  );
}

function confirmDeleteAll(){
  if(!S.products.length) return;
  showConfirmModal(
    'Borrar todo el catálogo',
    'Se eliminarán '+S.products.length+' producto'+(S.products.length!==1?'s':'')+'. Esta acción no se puede deshacer.',
    async ()=>{
      for(const p of [...S.products]){ await deleteProductFromSupabase(p.id); }
      S.products=[];
      S.selected.clear();
      S.selectMode=false;
      renderPage();
      toast('Catálogo borrado');
    }
  );
}

function showConfirmModal(title, msg, onConfirm){
  openOverlay(
    '<div class="cc-overlay center" onmousedown="handleOverlayClose(event)">'
    +'<div class="cc-modal" style="width:340px;max-width:92vw" onmousedown="event.stopPropagation()">'
    +'<div class="cc-modal-head" style="border-bottom:none;padding-bottom:6px">'
    +'<div style="display:flex;align-items:center;gap:10px">'
    +'<span style="width:36px;height:36px;border-radius:10px;background:#FFF1F2;color:#F43F5E;display:flex;align-items:center;justify-content:center">'+icon('trash',16)+'</span>'
    +'<div style="font-size:14px;font-weight:800;color:#0F172A">'+escHtml(title)+'</div></div></div>'
    +'<div style="padding:0 20px 8px;font-size:13px;color:#64748B">'+escHtml(msg)+'</div>'
    +'<div class="cc-modal-foot">'
    +'<button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>'
    +'<button class="lm-btn-danger" id="confirm-del-btn">Sí, eliminar</button>'
    +'</div></div></div>'
  );
  setTimeout(()=>{
    const btn=document.getElementById('confirm-del-btn');
    if(btn) btn.onclick=async()=>{ closeOverlay(); await onConfirm(); };
  },0);
}
