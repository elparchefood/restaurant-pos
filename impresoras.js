/* ============================================================
   LUMEN POS · CONFIGURACIÓN — Impresoras
   Todo viene de Supabase. Sin datos hardcodeados.
   Tablas: pos_printers, pos_print_config, branches, brands, pos_users
   ============================================================ */

const CPL = { 58: 32, 80: 48 };

/* ── Estado ── */
let sb, currentUser, branchId, tenantId, brandName, branchName, userName, userInitials;
let printers   = [];   // pos_printers rows
let config     = null; // pos_print_config row
let dirty      = false;

/* ════════════════════════════════════════
   INIT — esperar Supabase listo
════════════════════════════════════════ */
function waitForPos(cb) {
  if (window._pos && window._pos.sb && window._pos.state && window._pos.state.user) {
    cb();
  } else {
    document.addEventListener('pos:ready', cb, { once: true });
    window.addEventListener('pos:ready', cb, { once: true });
    if (window._pos) {
      window._pos.on && window._pos.on('core:ready', cb);
    }
    setTimeout(() => { if (!sb) initFallback(); }, 3000);
  }
}

async function initFallback() {
  // Si pos-core no dispara el evento, inicializar Supabase directamente
  const SUPA_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
  const SUPA_KEY = document.querySelector('meta[name="supa-key"]')?.content
    || (window._pos?.sb ? null : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU2NzcwMjgsImV4cCI6MjA1MTI1MzAyOH0.YlRBe1WEyFX_xBKkAEaJOvjTIovQwODIHjOHVzxMOBE');
  if (!SUPA_KEY) return;
  if (!window.supabase) return;
  sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  currentUser = session.user;
  branchId    = currentUser.user_metadata?.branch_id;
  tenantId    = currentUser.user_metadata?.tenant_id;
  await loadAndRender();
}

async function onPosReady() {
  sb        = window._pos.sb;
  currentUser = window._pos.state.user;
  branchId  = currentUser?.user_metadata?.branch_id;
  tenantId  = currentUser?.user_metadata?.tenant_id;
  if (!branchId || !tenantId) { window.location.href = 'login.html'; return; }
  await loadAndRender();
}

/* ════════════════════════════════════════
   CARGA DE DATOS
════════════════════════════════════════ */
async function loadAndRender() {
  await Promise.all([loadBranchInfo(), loadUserInfo(), loadPrinters(), loadConfig()]);
  renderSidebar();
  renderTopbar();
  renderPrinterList();
  applyConfigToUI();
  bindGlobalEvents();
  clearDirty();
}

async function loadBranchInfo() {
  try {
    const { data: br } = await sb.from('branches')
      .select('name, brand_id').eq('id', branchId).single();
    branchName = br?.name || '';
    if (br?.brand_id) {
      const { data: bd } = await sb.from('brands')
        .select('name').eq('id', br.brand_id).single();
      brandName = bd?.name || '';
    }
  } catch(e) { brandName = ''; branchName = ''; }
}

async function loadUserInfo() {
  try {
    const { data: u } = await sb.from('pos_users')
      .select('name, role').eq('auth_user_id', currentUser.id).single();
    userName     = u?.name || currentUser.email || '';
    userInitials = userName.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || 'U';
  } catch(e) { userName = currentUser?.email || ''; userInitials = 'U'; }
}

async function loadPrinters() {
  try {
    const { data } = await sb.from('pos_printers')
      .select('*').eq('branch_id', branchId).order('created_at');
    printers = data || [];
  } catch(e) { printers = []; }
}

async function loadConfig() {
  try {
    const { data } = await sb.from('pos_print_config')
      .select('*').eq('branch_id', branchId).single();
    config = data || defaultConfig();
  } catch(e) { config = defaultConfig(); }
}

function defaultConfig() {
  return {
    paper_width: 80, font_size: 'normal', comanda_model: 'estandar',
    content_orden: true, content_canal: true, content_prep: true,
    content_cliente: true, content_notas: true, content_precio: false,
    auto_print: true, copies: 1, cut: 'total'
  };
}

/* ════════════════════════════════════════
   RENDERIZADO DEL SHELL (sidebar / topbar)
════════════════════════════════════════ */
function renderSidebar() {
  const brandEl = document.getElementById('brand-name');
  const subEl   = document.getElementById('brand-sub');
  if (brandEl) brandEl.textContent = brandName || 'Lumen POS';
  if (subEl)   subEl.textContent   = branchName || '';
}

function renderTopbar() {
  const nameEl = document.getElementById('user-name');
  const avEl   = document.getElementById('user-av');
  const roleEl = document.getElementById('user-role');
  if (nameEl) nameEl.textContent = userName;
  if (avEl)   avEl.textContent   = userInitials;
}

/* ════════════════════════════════════════
   RENDERIZADO DE IMPRESORAS
════════════════════════════════════════ */
const SVG = {
  printer: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  star:    `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  trash:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  play:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  conn:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v2a6 6 0 0 1-12 0V8zM12 16v6"/></svg>`,
  model:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`
};

function renderPrinterCard(p) {
  const areas = ['cocina','barra','caja'];
  const areaButtons = areas.map(a =>
    `<button class="imp-seg-btn${p.area===a?' on':''}" data-area="${a}"><span>${a.charAt(0).toUpperCase()+a.slice(1)}</span></button>`
  ).join('');
  const defBtn = p.is_default
    ? `<button class="imp-chip on" disabled>${SVG.star} Predeterminada</button>`
    : `<button class="imp-chip" data-action="set-default">${SVG.star} Hacer predeterminada</button>`;
  const badge = p.is_default ? `<span class="imp-def-badge">${SVG.star} Predeterminada</span>` : '';

  return `
    <div class="imp-printer" data-printer="${p.id}" data-area="${p.area}">
      <div class="imp-pr-head">
        <span class="imp-pr-icon">${SVG.printer}</span>
        <input class="imp-name" value="${esc(p.name)}" placeholder="Nombre de la impresora">
        ${badge}
        <button class="imp-row-del" title="Eliminar">${SVG.trash}</button>
      </div>
      <div class="imp-pr-grid">
        <label class="imp-pr-field">
          <span class="imp-pr-field-lbl">${SVG.conn} IP o puerto</span>
          <input class="cf-input" value="${esc(p.conn)}" placeholder="192.168.1.50 · USB001 · COM3" data-field="conn">
        </label>
        <label class="imp-pr-field">
          <span class="imp-pr-field-lbl">${SVG.model} Modelo</span>
          <input class="cf-input" value="${esc(p.model)}" placeholder="Ej. Epson TM-T20III" data-field="model">
        </label>
      </div>
      <div class="imp-pr-foot">
        <div class="imp-pr-area">
          <span class="imp-pr-field-lbl">Área</span>
          <div class="imp-seg" data-seg="area">${areaButtons}</div>
        </div>
        <div class="imp-pr-actions">
          ${defBtn}
          <button class="imp-chip test" data-action="test">${SVG.play} Test</button>
        </div>
      </div>
    </div>`;
}

const ADD_TILE = `
  <button class="imp-add" id="btn-add-printer-tile">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Agregar impresora
  </button>`;

function renderPrinterList() {
  const list = document.getElementById('imp-printer-list');
  list.innerHTML = (printers.length ? printers.map(renderPrinterCard).join('') : '') + ADD_TILE;
  renderLegend();
  bindPrinterEvents();
}

function renderLegend() {
  const legend = document.getElementById('imp-legend');
  const areas  = ['cocina','barra','caja'];
  const SVG_WARN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  legend.innerHTML = areas.map(area => {
    const def = printers.find(p => p.area === area && p.is_default);
    const val = def
      ? `<span class="imp-legend-val">${SVG.star}${esc(def.name)}</span>`
      : `<span class="imp-legend-empty">${SVG_WARN} Sin predeterminada</span>`;
    return `<div class="imp-legend-chip" data-area="${area}">
      <span class="imp-legend-lbl">${area.charAt(0).toUpperCase()+area.slice(1)}</span>${val}
    </div>`;
  }).join('');
}

function bindPrinterEvents() {
  const list = document.getElementById('imp-printer-list');

  list.querySelectorAll('.imp-name').forEach(input => {
    input.addEventListener('input', () => {
      const p = getPrinter(input); if (!p) return;
      p.name = input.value; renderLegend(); markDirty();
    });
  });

  list.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      const p = getPrinter(input); if (!p) return;
      p[input.dataset.field] = input.value; markDirty();
    });
  });

  list.querySelectorAll('.imp-seg[data-seg="area"] .imp-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getPrinter(btn); if (!p) return;
      p.area = btn.dataset.area; markDirty(); renderPrinterList();
    });
  });

  list.querySelectorAll('[data-action="set-default"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getPrinter(btn); if (!p) return;
      printers.forEach(x => { if (x.area === p.area) x.is_default = false; });
      p.is_default = true; markDirty(); renderPrinterList();
    });
  });

  list.querySelectorAll('[data-action="test"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getPrinter(btn);
      if (p) toast(`Imprimiendo prueba en "${p.name}"…`);
    });
  });

  list.querySelectorAll('.imp-row-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-printer]');
      const id   = card.dataset.printer;
      if (id && !id.startsWith('new_')) {
        await sb.from('pos_printers').delete().eq('id', id);
      }
      printers = printers.filter(x => x.id !== id);
      markDirty(); renderPrinterList();
    });
  });

  const tile = document.getElementById('btn-add-printer-tile');
  if (tile) tile.addEventListener('click', addPrinter);
}

function getPrinter(el) {
  const id = el.closest('[data-printer]')?.dataset.printer;
  return printers.find(p => p.id === id);
}

function addPrinter() {
  printers.push({
    id: 'new_' + Math.random().toString(36).slice(2),
    branch_id: branchId, tenant_id: tenantId,
    name: '', conn: '', model: '', area: 'cocina', is_default: false
  });
  markDirty(); renderPrinterList();
}

/* ════════════════════════════════════════
   VISTA PREVIA — MODELO 1 (Arial bold)
════════════════════════════════════════ */
function updatePreview() {
  const stage = document.getElementById('rcpt-stage');
  if (!stage) return;

  const w   = config.paper_width;
  const cpl = CPL[w];
  const fz  = config.font_size === 'grande' ? '14px' : '12px';
  const nameLine = brandName ? brandName.toUpperCase() : 'MI RESTAURANTE';

  // Construir la comanda con Modelo 1 (Arial bold, sin datos hardcodeados de negocio)
  const sep = `<div style="border-top:1px dashed #000;margin:5px 0;"></div>`;
  const dashedLine = (txt) => `
    <div style="display:flex;align-items:center;gap:4px;margin:4px 0;font-size:${fz === '14px' ? '11px' : '10px'};">
      <span style="flex:1;border-top:1px dashed #000;"></span>
      <span style="white-space:nowrap;">${txt}</span>
      <span style="flex:1;border-top:1px dashed #000;"></span>
    </div>`;

  const rows = [];
  if (config.content_orden)   rows.push(`<div>PEDIDO: C1-####</div>`);
  if (config.content_canal)   rows.push(`<div>CANAL: Mesa / Delivery</div>`);
  if (config.content_cliente) rows.push(`<div>CLIENTE: [Nombre cliente]</div>`);
  if (config.content_prep)    rows.push(`<div>TIEMPO PREPARACION: -- min</div>`);

  const items = [];
  items.push(`<div style="margin:4px 0;font-weight:700;">(1) PRODUCTO EJEMPLO</div>`);
  if (config.content_notas) items.push(`<div style="font-weight:400;font-size:${fz === '14px' ? '12px' : '11px'};margin-left:12px;">» Nota de ejemplo</div>`);
  items.push(`<div style="margin:4px 0;font-weight:700;">(2) OTRO PRODUCTO</div>`);
  if (config.content_precio) {
    items.push(`<div style="display:flex;justify-content:space-between;font-weight:700;margin:4px 0;"><span>(1) PRODUCTO EJEMPLO</span><span>$12.000</span></div>`);
    items.push(`<div style="display:flex;justify-content:space-between;font-weight:700;margin:4px 0;"><span>(2) OTRO PRODUCTO</span><span>$18.000</span></div>`);
    items.push(`${sep}<div style="display:flex;justify-content:space-between;font-weight:700;">TOTAL<span>$30.000</span></div>`);
  }

  const copyStack = config.copies > 1
    ? `<div style="position:absolute;top:6px;left:6px;width:100%;height:100%;background:#fff;border:1px solid #ddd;border-radius:2px;z-index:0;"></div>
       <div style="position:absolute;top:3px;left:3px;width:100%;height:100%;background:#fff;border:1px solid #eee;border-radius:2px;z-index:0;"></div>`
    : '';

  const cutStyles = {
    total:   'border-top:2px solid #ef4444;',
    parcial: 'border-top:2px dashed #f97316;',
    none:    'opacity:0.3;border-top:1px solid #ccc;'
  };
  const cutLabels = { total:'Corte total', parcial:'Corte parcial', none:'Sin corte' };

  stage.innerHTML = `
    <div style="position:relative;display:inline-block;">
      ${copyStack}
      <div style="
        position:relative;z-index:1;
        font-family:Arial,Helvetica,sans-serif;
        font-size:${fz};
        font-weight:700;
        background:#fff;
        color:#000;
        width:${w === 58 ? '208px' : '280px'};
        padding:14px 12px;
        box-shadow:0 10px 30px -10px rgba(15,23,42,.28);
        line-height:1.55;
      ">
        <div style="font-size:${fz === '14px' ? '16px' : '14px'};font-weight:700;text-align:center;">${nameLine}</div>
        <div style="font-size:${fz};font-weight:700;text-align:center;">COCINA</div>
        ${sep}
        ${rows.join('')}
        ${dashedLine('INICIO  PEDIDO')}
        ${items.join('')}
        ${dashedLine('FIN PEDIDO')}
      </div>
      <div style="width:${w === 58 ? '208px' : '280px'};height:24px;position:relative;z-index:1;${cutStyles[config.cut]}margin-top:0;">
        <span style="position:absolute;left:50%;top:6px;transform:translateX(-50%);font-size:10px;font-weight:700;color:#94A3B8;white-space:nowrap;">${cutLabels[config.cut]}</span>
      </div>
    </div>`;

  document.getElementById('imp-cpl').textContent          = cpl;
  document.getElementById('imp-preview-meta').textContent = `${w} mm · ${cpl} car`;

  const cutLabel = { total:'corte total', parcial:'corte parcial', none:'desactivado' };
  document.getElementById('imp-preview-foot').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    ${config.copies} copia${config.copies>1?'s':''} · ${config.auto_print?'auto':'manual'} · ${cutLabel[config.cut]}`;
}

/* ════════════════════════════════════════
   APLICAR CONFIG AL DOM
════════════════════════════════════════ */
function applyConfigToUI() {
  // Papel
  document.querySelectorAll('#seg-paper .imp-seg-btn').forEach(b =>
    b.classList.toggle('on', parseInt(b.dataset.w) === config.paper_width));
  // Fuente
  document.querySelectorAll('#seg-font .imp-seg-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.size === config.font_size));
  // Switches contenido
  ['orden','canal','prep','cliente','notas','precio'].forEach(key => {
    const sw = document.querySelector(`.cf-switch[data-content="${key}"]`);
    if (!sw) return;
    const val = config['content_' + key];
    sw.classList.toggle('on', val);
    sw.setAttribute('aria-pressed', String(val));
  });
  // Autoprint
  const swAuto = document.getElementById('sw-autoprint');
  swAuto.classList.toggle('on', config.auto_print);
  swAuto.setAttribute('aria-pressed', String(config.auto_print));
  document.getElementById('hint-autoprint').textContent = config.auto_print
    ? 'La comanda sale apenas se confirma el pedido.'
    : 'El cajero imprime la comanda manualmente.';
  // Copias
  document.querySelectorAll('#seg-copies .imp-seg-btn').forEach(b =>
    b.classList.toggle('on', parseInt(b.dataset.copies) === config.copies));
  // Modelo
  document.querySelectorAll('.imp-model:not(.locked)').forEach(c =>
    c.classList.toggle('on', c.dataset.model === config.comanda_model));
  // Corte
  document.querySelectorAll('.imp-cut').forEach(c =>
    c.classList.toggle('on', c.dataset.cut === config.cut));

  updatePreview();
}

/* ════════════════════════════════════════
   GUARDAR EN SUPABASE
════════════════════════════════════════ */
async function saveAll() {
  const btnSave = document.getElementById('btn-save');
  btnSave.textContent = 'Guardando…';
  btnSave.disabled = true;

  try {
    // 1. Guardar config
    const configPayload = {
      branch_id: branchId, tenant_id: tenantId,
      paper_width:      config.paper_width,
      font_size:        config.font_size,
      comanda_model:    config.comanda_model,
      content_orden:    config.content_orden,
      content_canal:    config.content_canal,
      content_prep:     config.content_prep,
      content_cliente:  config.content_cliente,
      content_notas:    config.content_notas,
      content_precio:   config.content_precio,
      auto_print:       config.auto_print,
      copies:           config.copies,
      cut:              config.cut,
      updated_at:       new Date().toISOString()
    };
    await sb.from('pos_print_config').upsert(configPayload, { onConflict: 'branch_id' });

    // 2. Guardar impresoras (upsert existentes, insertar nuevas)
    for (const p of printers) {
      if (p.id.startsWith('new_')) {
        const { data } = await sb.from('pos_printers').insert({
          branch_id: branchId, tenant_id: tenantId,
          name: p.name || 'Nueva impresora', conn: p.conn, model: p.model,
          area: p.area, is_default: p.is_default
        }).select().single();
        if (data) p.id = data.id;
      } else {
        await sb.from('pos_printers').update({
          name: p.name, conn: p.conn, model: p.model,
          area: p.area, is_default: p.is_default
        }).eq('id', p.id);
      }
    }

    clearDirty();
    toast('Configuración de impresión guardada');
    renderPrinterList();
  } catch(e) {
    toast('Error al guardar. Intenta de nuevo.');
    btnSave.disabled = false;
  } finally {
    btnSave.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Guardar cambios`;
  }
}

/* ════════════════════════════════════════
   EVENTOS GLOBALES
════════════════════════════════════════ */
function bindGlobalEvents() {
  document.getElementById('btn-add-printer').addEventListener('click', addPrinter);

  document.getElementById('seg-paper').addEventListener('click', e => {
    const btn = e.target.closest('.imp-seg-btn'); if (!btn) return;
    config.paper_width = parseInt(btn.dataset.w);
    document.querySelectorAll('#seg-paper .imp-seg-btn').forEach(b => b.classList.toggle('on', b===btn));
    updatePreview(); markDirty();
  });

  document.getElementById('seg-font').addEventListener('click', e => {
    const btn = e.target.closest('.imp-seg-btn'); if (!btn) return;
    config.font_size = btn.dataset.size;
    document.querySelectorAll('#seg-font .imp-seg-btn').forEach(b => b.classList.toggle('on', b===btn));
    updatePreview(); markDirty();
  });

  document.getElementById('imp-model-grid').addEventListener('click', e => {
    const card = e.target.closest('.imp-model:not(.locked)'); if (!card) return;
    config.comanda_model = card.dataset.model;
    document.querySelectorAll('.imp-model:not(.locked)').forEach(c => c.classList.toggle('on', c===card));
    markDirty();
  });

  document.querySelectorAll('.cf-switch[data-content]').forEach(sw => {
    sw.addEventListener('click', () => {
      const key = 'content_' + sw.dataset.content;
      config[key] = !config[key];
      sw.classList.toggle('on', config[key]);
      sw.setAttribute('aria-pressed', String(config[key]));
      updatePreview(); markDirty();
    });
  });

  document.getElementById('sw-autoprint').addEventListener('click', () => {
    config.auto_print = !config.auto_print;
    const sw = document.getElementById('sw-autoprint');
    sw.classList.toggle('on', config.auto_print);
    sw.setAttribute('aria-pressed', String(config.auto_print));
    document.getElementById('hint-autoprint').textContent = config.auto_print
      ? 'La comanda sale apenas se confirma el pedido.'
      : 'El cajero imprime la comanda manualmente.';
    updatePreview(); markDirty();
  });

  document.getElementById('seg-copies').addEventListener('click', e => {
    const btn = e.target.closest('.imp-seg-btn'); if (!btn) return;
    config.copies = parseInt(btn.dataset.copies);
    document.querySelectorAll('#seg-copies .imp-seg-btn').forEach(b => b.classList.toggle('on', b===btn));
    updatePreview(); markDirty();
  });

  document.getElementById('btn-reimprimir').addEventListener('click', () =>
    toast('Reimprimiendo comanda del pedido activo…'));

  document.getElementById('imp-cut-grid').addEventListener('click', e => {
    const card = e.target.closest('.imp-cut'); if (!card) return;
    config.cut = card.dataset.cut;
    document.querySelectorAll('.imp-cut').forEach(c => c.classList.toggle('on', c===card));
    updatePreview(); markDirty();
  });

  document.getElementById('btn-save').addEventListener('click', saveAll);

  document.getElementById('btn-discard').addEventListener('click', async () => {
    await Promise.all([loadPrinters(), loadConfig()]);
    renderPrinterList();
    applyConfigToUI();
    clearDirty();
  });
}

/* ════════════════════════════════════════
   DIRTY STATE + TOAST
════════════════════════════════════════ */
function markDirty() {
  dirty = true;
  document.getElementById('btn-save').disabled = false;
  document.getElementById('btn-discard').hidden = false;
}
function clearDirty() {
  dirty = false;
  document.getElementById('btn-save').disabled = true;
  document.getElementById('btn-discard').hidden = true;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function esc(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ════════════════════════════════════════
   AJUSTE HTML: mover rcpt-stage al DOM
════════════════════════════════════════ */
function patchPreviewStage() {
  // Reemplazar el contenido fijo del recibo por un div dinámico
  const stage = document.querySelector('.imp-preview-stage');
  if (!stage) return;
  stage.innerHTML = `<div id="rcpt-stage"></div>`;
}

/* ════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  patchPreviewStage();
  waitForPos(onPosReady);
});
