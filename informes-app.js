/* ═══════════════ INFORMES · app ═══════════════ */
(function(){
const {IC, MODULES, CATEGORIES, REPORTS} = window.INFORMES;
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---- estado ---- */
const MODULE_SETS = {
  todos:  {delivery:1,reservas:1,qr:1,afluencia:1,multimarca:1,multisucursal:1,dian:1},
  basico: {delivery:0,reservas:0,qr:0,afluencia:0,multimarca:0,multisucursal:0,dian:0},
};
let state = {
  moduleMode:'todos',   // TODO: leerlo de la configuración del restaurante
  current:null,          // id de informe o null (home)
  search:'',
  open:{},               // categorías expandidas en el navegador
  preset:'mes',
  chips:{},              // filtros marcados por informe
};
const activeModules = ()=>MODULE_SETS[state.moduleMode];
const repVisible = r => !r.module || activeModules()[r.module];
const catReports = k => REPORTS.filter(r=>r.cat===k && repVisible(r));

/* ---- filtros: definiciones ---- */
const FDEF = {
  sucursal:{label:'Sucursal',def:'Todas',applied:'Chapinero'},
  caja:{label:'Caja',def:'Todas',applied:'Caja 1'},
  turno:{label:'Turno',def:'Todos',applied:'Noche'},
  canal:{label:'Canal',def:'Todos',applied:'WhatsApp'},
  categoria:{label:'Categoría',def:'Todas',applied:'Hamburguesas'},
  empleado:{label:'Empleado',def:'Todos',applied:'Luis Pardo'},
  estado:{label:'Estado',def:'Todos',applied:'Activas'},
  cliente:{label:'Cliente',def:'Todos',applied:'Carolina R.'},
  proveedor:{label:'Proveedor',def:'Todos',applied:'Cárnicos JR'},
  marca:{label:'Marca',def:'Todas',applied:'El Parche'},
};
const PRESETS = [['hoy','Hoy'],['ayer','Ayer'],['semana','Esta semana'],['mes','Este mes'],['custom','Personalizado']];

/* ¿La categoría se ve desplegada?
   Al buscar se abren todas. Si el usuario la abrió o cerró a mano, manda eso.
   Si no la ha tocado, se abre sola cuando contiene el informe abierto (o si es
   Ventas, la primera). */
function catAbierta(k, q, curCat){
  if(q) return true;
  if(state.open[k] !== undefined) return state.open[k];
  return !!curCat || k === 'ventas';
}

/* ═══════════ NAVEGADOR ═══════════ */
function renderNav(){
  const q = state.search.trim().toLowerCase();
  let html='';
  CATEGORIES.forEach(c=>{
    let reps = catReports(c.k);
    if(q) reps = reps.filter(r=>r.name.toLowerCase().includes(q)||r.desc.toLowerCase().includes(q));
    if(!reps.length) return;
    const curCat = state.current && reps.some(r=>r.id===state.current);
    const open = catAbierta(c.k, q, curCat);
    html+=`<div class="r-cat${open?' open':''}" data-cat="${c.k}">
      <button class="r-cat-head" data-cathead="${c.k}">
        <span class="r-cat-ic" style="background:${c.tint};color:${c.color}">${c.icon}</span>
        <span class="r-cat-name">${esc(c.name)}</span>
        <span class="r-cat-n">${reps.length}</span>
        <span class="r-cat-chev">${IC.chev}</span>
      </button>
      <div class="r-cat-items">
        ${reps.map(r=>{
          // Punto verde = ya trae datos del negocio. Sin punto = está diseñado
          // pero todavía sin conectar (y lo dice al abrirlo, no inventa cifras).
          const vivo = window.INFORMES_DATOS && window.INFORMES_DATOS.tiene(r.id);
          return `<button class="r-rep${state.current===r.id?' on':''}" data-rep="${r.id}"><span class="mdot"></span><span style="flex:1">${esc(r.name)}</span>${vivo?`<span class="r-live" title="Con datos reales"></span>`:''}${r.viz==='chart'?`<span class="r-rep-tag" title="Incluye gráfico">${IC.vizmini}</span>`:''}</button>`;
        }).join('')}
      </div></div>`;
  });
  if(!html) html=`<div style="padding:30px 14px;text-align:center;color:var(--muted);font-size:12px">Sin informes que coincidan con “${esc(state.search)}”.</div>`;
  $('#rNavList').innerHTML=html;
}

/* ═══════════ HOME (portada: bienvenida + resumen + accesos) ═══════════ */
const FEATURED = ['ger-resumen','sal-todas','sal-hora','inv-foodcost','can-domicilios','ger-comparativo'];
const SNAPSHOT = [
  {lbl:'Ventas del mes',val:'$ 42,7M',tone:'accent'},
  {lbl:'# Ventas',val:'1.842'},
  {lbl:'Ticket promedio',val:'$ 21.045'},
  {lbl:'Utilidad estimada',val:'$ 24,3M',tone:'good'},
];
function renderHome(){
  const modCount = MODULES.filter(m=>activeModules()[m.k]).length;
  const total = REPORTS.filter(repVisible).length;
  const feat = FEATURED.map(id=>REPORTS.find(r=>r.id===id)).filter(r=>r&&repVisible(r));
  let html=`<div class="r-home">
    <div class="r-home-head">
      <div>
        <div class="r-eyebrow">Analítica del negocio</div>
        <h1 class="r-title">Informes</h1>
        <div class="r-home-sub">${total} informes en 6 categorías. Ábrelos desde el panel de la izquierda o entra por un acceso rápido.</div>
      </div>
    </div>

    <div class="r-card" style="margin-top:22px">
      <div class="r-card-head"><div><div class="r-card-title">Resumen de este mes</div><div class="r-card-sub">Julio 2026 · todas las sucursales</div></div><button class="lm-btn-ghost sm" data-rep="ger-resumen">Ver resumen del negocio ${IC.arrow}</button></div>
      <div style="padding:16px"><div class="r-kpis" id="rSnap">${SNAPSHOT.map(kpiCard).join('')}</div></div>
    </div>

    <div class="r-catblock" style="margin-top:26px">
      <div class="r-catblock-head">
        <span class="r-catblock-ic" style="background:var(--brand-tint);color:var(--brand)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
        <div><div class="r-catblock-name">Accesos rápidos</div><div class="r-catblock-desc">Los informes que más se consultan.</div></div>
      </div>
      <div class="r-cardgrid">
        ${feat.map(r=>`<button class="r-repcard" data-rep="${r.id}">
          <div class="r-repcard-top"><span class="r-repcard-viz ${r.viz==='chart'?'chart':''}">${r.viz==='chart'?'Gráfico + tabla':'Tabla'}</span><span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">${esc(CATEGORIES.find(c=>c.k===r.cat).name)}</span></div>
          <div class="r-repcard-name">${esc(r.name)}</div>
          <div class="r-repcard-desc">${esc(r.desc)}</div>
          <span class="r-repcard-go">Abrir ${IC.arrow}</span>
        </button>`).join('')}
      </div>
    </div>

    <div style="margin-top:24px;padding:14px 16px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-2xl);display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:12.5px;font-weight:500">
      ${IC.search} ¿Buscas otro informe? Usa el buscador o navega por las 6 categorías en el panel de la izquierda.
    </div>
  </div>`;
  $('#rScroll').innerHTML=html;
  $('#rCrumb').textContent='Informes';
}

/* ═══════════ INFORME ═══════════ */
function chipState(rep){ return state.chips[rep.id]||{}; }

async function renderReport(id){
  const r = REPORTS.find(x=>x.id===id); if(!r) return renderHome();
  const cat = CATEGORIES.find(c=>c.k===r.cat);
  const cs = chipState(r);
  const filtersApplied = false;
  // filtros
  let chipsHtml = (r.filters||[]).filter(f=>f!=='fecha').map(f=>{
    const d=FDEF[f]; if(!d) return '';
    const on = filtersApplied || cs[f];
    const val = on ? d.applied : d.def;
    return `<button class="cc-fchip${on?' on':''}" data-chip="${f}"><span>${esc(d.label)}:</span><span class="v">${esc(val)}</span>${on?`<span class="x">${IC.x}</span>`:''}</button>`;
  }).join('');
  const anyOn = filtersApplied || Object.values(cs).some(Boolean);

  let head=`<div class="r-rep-head">
    <button class="r-back" data-home>${IC.back} Todos los informes</button>
    <div class="r-rep-headrow">
      <div>
        <div class="r-eyebrow" style="color:${cat.color}">${esc(cat.name)}</div>
        <h1 class="r-rep-title">${esc(r.name)}</h1>
        <div class="r-rep-desc">${esc(r.desc)}</div>
      </div>
      <div class="r-rep-actions">
        <button class="lm-btn-primary" data-export>${IC.export} Exportar</button>
      </div>
    </div>
  </div>`;

  let filters=`<div class="r-filters">
    <span class="r-flabel">Fecha</span>
    <div class="r-preset" id="rPreset">${PRESETS.map(p=>`<button data-preset="${p[0]}" class="${state.preset===p[0]?'on':''}">${p[1]}</button>`).join('')}</div>
    ${chipsHtml}
    <div class="r-filters-right">${anyOn?`<button class="r-clearfilters" data-clear>${IC.x} Limpiar filtros</button>`:''}<button class="lm-btn-ghost sm" data-export>${IC.export} CSV / Excel</button></div>
  </div>`;

  // Se pinta primero la cabecera y los filtros (respuesta inmediata) y el
  // cuerpo entra cuando llegan los datos.
  $('#rScroll').innerHTML = head + filters +
    `<div class="r-body"><div class="r-skel"><div class="r-skel-row"></div><div class="r-skel-row tall"></div></div></div>`;
  $('#rCrumb').textContent = r.name;

  const D = window.INFORMES_DATOS;
  const bodyEl = $('#rScroll').querySelector('.r-body');
  const pintar = html => { if(state.current===id && bodyEl) bodyEl.innerHTML = html; };

  // Informe sin fuente de datos: se dice de frente. NUNCA se muestran los
  // datos de ejemplo del diseño como si fueran del negocio.
  if(!D || !D.tiene(id)) return pintar(pendienteHtml(r));

  let d;
  try { d = await D.cargar(id, state.preset); }
  catch(e){
    console.warn('[Informes]', id, e);
    return pintar(`<div class="r-empty"><div class="r-empty-ic">${IC.empty}</div>
      <div class="r-empty-title">No se pudieron cargar los datos</div>
      <div class="r-empty-desc">${esc(e && e.message || e)}</div></div>`);
  }
  if(state.current!==id) return;   // el usuario ya se fue a otro informe

  if(!d || d.vacio) return pintar(`<div class="r-empty">
      <div class="r-empty-ic">${IC.empty}</div>
      <div class="r-empty-title">Sin datos en este rango</div>
      <div class="r-empty-desc">No hay ventas registradas para “${esc(r.name)}” en el período seleccionado. Prueba con otro rango de fechas.</div>
      <div style="display:flex;gap:8px"><button class="lm-btn-ghost" data-preset2="mes">Ver este mes</button></div>
    </div>`);

  let inner='';
  if(d.kpis && d.kpis.length) inner+=`<div class="r-kpis">${d.kpis.map(kpiCard).join('')}</div>`;
  (d.blocks||[]).forEach(b=>inner+=renderBlock(b));
  pintar(inner);
}

/* Informe del catálogo que todavía no tiene de dónde sacar los datos. */
function pendienteHtml(r){
  return `<div class="r-pendiente">
    <div class="r-pendiente-ic">${IC.empty}</div>
    <div class="r-pendiente-tag">Aún sin conectar</div>
    <div class="r-pendiente-t">${esc(r.name)}</div>
    <div class="r-pendiente-d">Este informe ya está diseñado, pero todavía no tiene los datos del negocio conectados. Se prefiere dejarlo vacío antes que mostrarte números que no son reales.</div>
    <button class="lm-btn-ghost" data-home>${IC.back} Ver los informes disponibles</button>
  </div>`;
}

/* ---- KPI ---- */
function kpiCard(k){
  const tone=k.tone?` ${k.tone}`:''; const big=k.big?' big':'';
  return `<div class="r-kpi${tone}${big}">
    <div class="r-kpi-lbl">${esc(k.lbl)}</div>
    <div class="r-kpi-val">${esc(k.val)}</div>
    ${k.sub?`<div class="r-kpi-sub">${esc(k.sub)}</div>`:''}</div>`;
}

/* ---- bloques ---- */
function renderBlock(b){
  switch(b.t){
    case 'kpi': return kpiCard({lbl:b.lbl,val:b.val,sub:b.sub,tone:b.tone,big:b.big});
    case 'grid2': return `<div class="r-grid-2">${b.children.map(renderBlock).join('')}</div>`;
    case 'grid3': return `<div class="r-grid-3">${b.children.map(renderBlock).join('')}</div>`;
    case 'card': return renderCard(b);
    default: return renderCard({title:'',body:b});
  }
}
function renderCard(b){
  const tools = b.body && b.body.seg ? '' : (b.seg?segHtml(b.seg):'');
  const rep = REPORTS.find(x=>x.id===state.current);
  const segFromRep = (b.body && b.body.t==='table' && rep && rep.seg) ? segHtml(rep.seg) : '';
  let head='';
  if(b.title) head=`<div class="r-card-head"><div><div class="r-card-title">${esc(b.title)}</div>${b.sub?`<div class="r-card-sub">${esc(b.sub)}</div>`:''}</div><div class="r-card-tools">${segFromRep}</div></div>`;
  return `<div class="r-card">${head}${renderViz(b.body)}</div>`;
}
function segHtml(seg){ return `<div class="cc-seg">${seg.map((s,i)=>`<button class="${i===0?'on':''}">${esc(s)}</button>`).join('')}</div>`; }

function renderViz(v){
  if(!v) return '';
  switch(v.t){
    case 'table': return renderTable(v);
    case 'hbars': return renderHbars(v);
    case 'vbars': return renderVbars(v);
    case 'donut': return renderDonut(v);
    case 'line': return renderLine(v);
    case 'gbars': return renderGbars(v);
    default: return '';
  }
}

/* ---- tabla ---- */
function cell(val,col){
  if(val && typeof val==='object'){
    if(val._pay) return `<span class="r-pay">${val._pay.map(p=>`<span class="r-pill neu">${esc(p[0])}${p[1]?` · ${esc(p[1])}`:''}</span>`).join('')}</span>`;
    if(val._pill) return `<span class="r-pill ${val._pill[0]}">${esc(val._pill[1])}</span>`;
    if(val._cat) return `<span class="r-catdot" style="background:${window.INFORMES.CATC[val._cat[0]]||'#94A3B8'}"></span>${esc(val._cat[1])}`;
    if(val._main) return `<span class="r-cellmain">${esc(val._main)}</span>`;
    if(val._neg) return `<span style="color:var(--danger);font-weight:700">${esc(val._neg)}</span>`;
    if(val._btn) return `<button class="lm-btn-ghost sm" style="padding:4px 10px">${esc(val._btn)}</button>`;
  }
  if(val==='_act') return `<span class="r-rowact"><button class="r-rowbtn" title="Ver detalle">${IC.eye}</button><button class="r-rowbtn" title="Reimprimir">${IC.print}</button><button class="r-rowbtn" title="PDF">${IC.pdf}</button></span>`;
  return esc(val==null?'':val);
}
function renderTable(v){
  const th = v.cols.map(c=>`<th class="${c.num?'num':''}">${esc(c.label)}</th>`).join('');
  const rows = v.rows.map(row=>{
    const tds=v.cols.map(c=>{
      const raw=row[c.k]; const isNeg=raw&&raw._neg;
      return `<td class="${c.num?'num ':''}${isNeg?'neg':''}">${cell(raw,c)}</td>`;
    }).join('');
    return `<tr${row.dim?' style="opacity:.55"':''}>${tds}</tr>`;
  }).join('');
  let total='';
  if(v.total){
    total=`<tr class="r-total-row">${v.cols.map(c=>`<td class="${c.num?'num':''}">${esc(v.total[c.k]||'')}</td>`).join('')}</tr>`;
  }
  const min = v.min!=null?v.min:640;
  return `<div class="r-tablewrap"><table class="r-table" style="${min?`min-width:${min}px`:'min-width:0'}"><thead><tr>${th}</tr></thead><tbody>${rows}${total}</tbody></table></div>`;
}

/* ---- barras horizontales ---- */
function renderHbars(v){
  return `<div class="r-hbars">${v.items.map((it,i)=>`<div class="r-hbar">
    <div class="r-hbar-lbl">${it.rank!==0?`<span class="rk">${i+1}</span>`:''}${esc(it.lbl)}</div>
    <div class="r-hbar-track"><div class="r-hbar-fill" style="width:${it.w}%;background:${it.color||'var(--brand)'}"></div></div>
    <div class="r-hbar-val">${esc(it.val)}</div></div>`).join('')}</div>`;
}
/* ---- barras verticales ---- */
function renderVbars(v){
  let items=v.items.slice();
  if(v.autopeak){ const max=Math.max(...items.map(i=>i.w)); items=items.map(i=>({...i,cls:i.w===max?'peak':i.cls})); }
  return `<div class="r-vbars">${items.map(it=>`<div class="r-vbar">
    <div class="r-vbar-track"><div class="r-vbar-fill ${it.cls||''}" style="height:${it.w}%"><span class="r-vbar-tip">${esc(it.val)}</span></div></div>
    <div class="r-vbar-x">${esc(it.x)}</div></div>`).join('')}</div>`;
}
/* ---- dona ---- */
function renderDonut(v){
  let acc=0; const stops=v.segs.map(s=>{const a=acc;acc+=s.pct;return `${s.color} ${a}% ${acc}%`;}).join(',');
  return `<div class="r-donutwrap">
    <div class="r-donut" style="background:conic-gradient(${stops})"><div class="r-donut-center"><span class="big">${esc(v.centerBig)}</span><span class="lbl">${esc(v.centerLbl)}</span></div></div>
    <div class="r-legend">${v.segs.map(s=>`<div class="r-legend-row"><span class="r-legend-dot" style="background:${s.color}"></span><span class="r-legend-name">${esc(s.name)}</span><span class="r-legend-val">${esc(s.val)}</span><span class="r-legend-pct">${s.pct}%</span></div>`).join('')}</div>
  </div>`;
}
/* ---- barras agrupadas ---- */
function renderGbars(v){
  const legend=v.legend?`<div style="display:flex;gap:16px;justify-content:center;padding:0 0 14px">${v.legend.map(l=>`<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--ink-2)"><span style="width:11px;height:11px;border-radius:3px;background:${l.color}"></span>${esc(l.name)}</span>`).join('')}</div>`:'';
  return `<div style="padding-top:14px">${legend}<div class="r-gbars">${v.groups.map(g=>`<div class="r-gbar"><div class="r-gbar-track">${g.cols.map(c=>`<div class="r-gbar-col" style="height:${c.h}%;background:${c.color}"></div>`).join('')}</div><div class="r-gbar-x">${esc(g.x)}</div></div>`).join('')}</div></div>`;
}
/* ---- línea (SVG data-viz) ---- */
function renderLine(v){
  const W=600,H=190,padL=34,padB=26,padT=12,padR=12;
  const pts=v.points, n=pts.length, ymax=v.ymax||Math.max(...pts.map(p=>p.y))*1.2;
  const x=i=>padL+(W-padL-padR)*(n===1?0.5:i/(n-1));
  const y=val=>padT+(H-padT-padB)*(1-val/ymax);
  const line=pts.map((p,i)=>`${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const area=`${x(0).toFixed(1)},${(H-padB).toFixed(1)} ${line} ${x(n-1).toFixed(1)},${(H-padB).toFixed(1)}`;
  const grid=[0,.5,1].map(f=>{const yy=padT+(H-padT-padB)*f;const val=Math.round(ymax*(1-f));return `<line class="r-line-grid" x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}"/><text class="r-line-ylbl" x="${padL-6}" y="${yy+3}" text-anchor="end">${val}${v.ysuffix||''}</text>`;}).join('');
  const target=v.target!=null?`<line class="r-line-target" x1="${padL}" y1="${y(v.target)}" x2="${W-padR}" y2="${y(v.target)}"/>`:'';
  const dots=pts.map((p,i)=>`<circle class="r-line-dot" cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="4"/>`).join('');
  const xlbls=pts.map((p,i)=>`<text class="r-line-xlbl" x="${x(i).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(p.x)}</text>`).join('');
  return `<div class="r-linechart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5B6BFF" stop-opacity=".18"/><stop offset="100%" stop-color="#5B6BFF" stop-opacity="0"/></linearGradient></defs>
    ${grid}${target}<polygon class="r-line-area" points="${area}"/><polyline class="r-line-path" points="${line}"/>${dots}${xlbls}</svg></div>`;
}

/* ═══════════ INTERACCIONES ═══════════ */
function go(id){ state.current=id; if(id) renderReport(id); else renderHome(); renderNav(); $('#rScroll').scrollTop=0; }
function toast(msg){ const t=$('#rToast'); t.querySelector('.msg').textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2200); }

document.addEventListener('click',e=>{
  const t=e.target;
  const rep=t.closest('[data-rep]'); if(rep){ go(rep.dataset.rep); return; }
  if(t.closest('[data-home]')){ go(null); return; }
  const ch=t.closest('[data-cathead]'); if(ch){
    const k=ch.dataset.cathead;
    const curCat = state.current && REPORTS.some(r=>r.id===state.current && r.cat===k);
    state.open[k] = !catAbierta(k, state.search.trim().toLowerCase(), curCat);
    renderNav(); return; }
  const pr=t.closest('[data-preset]'); if(pr){ state.preset=pr.dataset.preset; renderReport(state.current); return; }
  const pr2=t.closest('[data-preset2]'); if(pr2){ state.preset=pr2.dataset.preset2; renderReport(state.current); return; }
  const cl=t.closest('[data-clear]'); if(cl){ state.chips[state.current]={}; renderReport(state.current); return; }
  const cp=t.closest('[data-chip]'); if(cp){ const f=cp.dataset.chip; const cs=state.chips[state.current]=state.chips[state.current]||{}; cs[f]=!cs[f]; renderReport(state.current); return; }
  if(t.closest('[data-export]')){ toast('Exportando a Excel…'); return; }
  const segb=t.closest('.cc-seg button, .r-preset button'); if(segb && !segb.hasAttribute('data-preset')){ const wrap=segb.parentElement; wrap.querySelectorAll('button').forEach(b=>b.classList.remove('on')); segb.classList.add('on'); return; }
});
$('#rSearch').addEventListener('input',e=>{ state.search=e.target.value; renderNav(); });

/* init */
state.open.ventas=true;
renderNav(); renderHome();
})();
