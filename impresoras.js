/* ============================================================
   LUMEN POS · CONFIGURACIÓN — Impresoras
   Todo viene de Supabase. Sin datos hardcodeados.
   Tablas: pos_printers, pos_print_config, branches, brands, pos_users
   ============================================================ */

const CPL = { 58: 32, 80: 48 };

/* ── Estado ── */
// sb es global de pos-core.js
let currentUser, branchId, tenantId, brandName, branchName, userName, userInitials;
let printers       = [];
let systemPrinters = [];  // Impresoras reales detectadas vía Electron
let config         = null;
let dirty          = false;

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
  // Detectar impresoras del sistema si estamos en Electron
  if (window.electronPOS) {
    detectSystemPrinters();
  } else {
    var btn = document.getElementById('btn-detect-printers');
    if (btn) btn.style.display = 'none';
    var hint = document.getElementById('imp-electron-hint');
    if (hint) hint.textContent = 'La detección de impresoras del sistema solo está disponible en el ejecutable.';
  }
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
    auto_print: true, copies: 1, cut: 'total',
    same_printer_for_all: false, default_system_printer: ''
  };
}

async function detectSystemPrinters() {
  try {
    var btn = document.getElementById('btn-detect-printers');
    var hint = document.getElementById('imp-electron-hint');
    if (btn) { btn.disabled = true; btn.textContent = 'Detectando…'; }
    var list = await window.electronPOS.getPrinters();
    systemPrinters = (list || []).filter(function(p) { return p && (p.displayName || p.name); });
    if (hint) {
      hint.textContent = systemPrinters.length
        ? systemPrinters.length + ' impresora' + (systemPrinters.length > 1 ? 's' : '') + ' detectada' + (systemPrinters.length > 1 ? 's' : '')
        : 'No se encontraron impresoras instaladas.';
    }
    if (btn) { btn.disabled = false; btn.innerHTML = SVG_SCAN + ' Detectar de nuevo'; }
    renderPrinterList();
    renderDetectedPanel();
    applyConfigToUI();
  } catch(e) {
    var hint2 = document.getElementById('imp-electron-hint');
    if (hint2) hint2.textContent = 'Error al detectar impresoras: ' + e.message;
    var btn2 = document.getElementById('btn-detect-printers');
    if (btn2) { btn2.disabled = false; btn2.innerHTML = SVG_SCAN + ' Detectar de nuevo'; }
  }
}

function renderDetectedPanel() {
  var panel = document.getElementById('imp-detected-panel');
  if (!panel) return;
  if (!window.electronPOS || systemPrinters.length === 0) { panel.innerHTML = ''; return; }

  var THERMAL = ['thermal','pos','tm-','tm_','receipt','epson','star','bixolon','citizen','tsp','rp-','xp-','xprinter','sewoo','rongta','zjiang','hoin'];
  var SVG_PR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';

  var rows = systemPrinters.map(function(sp) {
    var nm = sp.displayName || sp.name || '';
    var isT = THERMAL.some(function(k){ return nm.toLowerCase().includes(k); });
    var assignedAreas = printers.filter(function(p){ return p.system_name === nm; }).map(function(p){ return p.area; });
    var areaBtns = ['cocina','barra','caja'].map(function(area) {
      var on = assignedAreas.includes(area);
      return '<button class="imp-det-area' + (on ? ' on' : '') + '" data-assign-nm="' + esc(nm) + '" data-assign-area="' + area + '">' +
        area.charAt(0).toUpperCase() + area.slice(1) + (on ? ' ✓' : '') + '</button>';
    }).join('');
    return '<div class="imp-det-row' + (isT ? ' is-t' : '') + '">' +
      '<div class="imp-det-info">' + SVG_PR +
        '<span class="imp-det-name">' + esc(nm) + '</span>' +
        (isT ? '<span class="imp-det-badge">Térmica</span>' : '') +
      '</div>' +
      '<div class="imp-det-acts"><span class="imp-det-lbl">Usar en:</span>' + areaBtns +
        '<button class="imp-det-test" data-test-nm="' + esc(nm) + '">Probar</button>' +
      '</div></div>';
  }).join('');

  panel.innerHTML = '<div class="imp-det-panel">' +
    '<div class="imp-det-head">' + SVG_SCAN +
      '<span>' + systemPrinters.length + ' impresora' + (systemPrinters.length > 1 ? 's' : '') +
      ' detectada' + (systemPrinters.length > 1 ? 's' : '') +
      ' — toca <b>el área</b> para asignar directamente</span></div>' +
    rows + '</div>';

  panel.querySelectorAll('[data-assign-nm]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      assignDetectedPrinter(btn.dataset.assignNm, btn.dataset.assignArea);
    });
  });
  panel.querySelectorAll('[data-test-nm]').forEach(function(btn) {
    btn.addEventListener('click', function() { testDetectedPrinter(btn.dataset.testNm); });
  });
}

async function assignDetectedPrinter(printerName, area) {
  var existing = printers.find(function(p){ return p.area === area; });
  if (existing) {
    existing.system_name = printerName;
    existing.is_default  = true;
    if (!existing.name) existing.name = printerName;
  } else {
    printers.push({
      id: 'new_' + Math.random().toString(36).slice(2),
      branch_id: branchId, tenant_id: tenantId,
      name: printerName, conn: '', model: '',
      area: area, is_default: true, system_name: printerName
    });
  }
  markDirty();
  renderPrinterList();
  // Guardar inmediatamente en Supabase — sin necesitar el botón "Guardar cambios"
  await saveDetectedAssignment();
  toast('"' + printerName + '" guardada para ' + area.charAt(0).toUpperCase() + area.slice(1) + ' ✓');
}

async function saveDetectedAssignment() {
  try {
    for (var i = 0; i < printers.length; i++) {
      var p = printers[i];
      if (p.id.startsWith('new_')) {
        var res = await sb.from('pos_printers').insert({
          branch_id: branchId, tenant_id: tenantId,
          name: p.name || 'Impresora', conn: p.conn || '', model: p.model || '',
          area: p.area || 'cocina', is_default: p.is_default, system_name: p.system_name || ''
        }).select().single();
        if (res.data) p.id = res.data.id;
      } else {
        await sb.from('pos_printers').update({
          name: p.name || 'Impresora', conn: p.conn || '', model: p.model || '',
          area: p.area || 'cocina', is_default: p.is_default, system_name: p.system_name || ''
        }).eq('id', p.id);
      }
    }
    clearDirty();
    renderDetectedPanel();
  } catch(e) {
    toast('Error al guardar: ' + (e.message || 'desconocido'));
  }
}

async function testDetectedPrinter(printerName) {
  if (!window.electronPOS || !window.electronPOS.printHtmlSilent) {
    toast('Test solo disponible en el ejecutable.'); return;
  }
  toast('Enviando prueba a "' + printerName + '"…');
  var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;width:80mm;margin:0;padding:12px;text-align:center}hr{border:none;border-top:1px dashed #000;margin:8px 0}</style></head><body>' +
    '<div style="font-size:15px;font-weight:bold;margin-bottom:4px">COBRA POS</div><hr>' +
    '<div style="font-size:13px;margin:4px 0"><b>' + esc(printerName) + '</b></div>' +
    '<div style="font-size:10px;color:#888;margin-top:8px">** TEST OK **</div></body></html>';
  var res = await window.electronPOS.printHtmlSilent(h, printerName);
  if (res && res.ok) toast('✓ Test enviado a "' + printerName + '"');
  else toast('Error: ' + ((res && res.error) || 'desconocido'));
}

var SVG_SCAN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6V2h4"/><path d="M23 6V2h-4"/><path d="M1 18v4h4"/><path d="M23 18v4h-4"/><rect x="7" y="7" width="10" height="10"/></svg>';

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
  // Área: presets rápidos + campo libre
  const AREA_PRESETS = ['cocina','barra','caja'];
  const isPreset = AREA_PRESETS.includes(p.area);
  const areaPresetBtns = AREA_PRESETS.map(a =>
    `<button class="imp-seg-btn${p.area===a?' on':''}" data-area="${a}" title="${a.charAt(0).toUpperCase()+a.slice(1)}"><span>${a.charAt(0).toUpperCase()+a.slice(1)}</span></button>`
  ).join('');

  // system_name: dropdown de impresoras reales si hay alguna detectada
  const sysOpts = systemPrinters.map(function(sp) {
    var nm = sp.displayName || sp.name || '';
    var selected = nm === p.system_name ? ' selected' : '';
    return `<option value="${esc(nm)}"${selected}>${esc(nm)}</option>`;
  }).join('');
  const sysSelect = `<select class="cf-input imp-sys-sel" data-field="system_name">
    <option value=""${!p.system_name?' selected':''}>— Sin asignar (impresora predeterminada del sistema) —</option>
    ${sysOpts}
  </select>`;
  const sysFieldLabel = window.electronPOS
    ? `<span class="imp-pr-field-lbl" title="Impresora real de Windows a usar al imprimir">🖨 Impresora del sistema</span>`
    : `<span class="imp-pr-field-lbl" style="color:var(--ink-4)" title="Solo disponible en el ejecutable">🖨 Impresora del sistema</span>`;
  const sysFieldHint = !window.electronPOS
    ? `<span style="font-size:11px;color:var(--ink-4)">Solo en el ejecutable</span>` : '';

  const defBtn = p.is_default
    ? `<button class="imp-chip on" disabled>${SVG.star} Predeterminada</button>`
    : `<button class="imp-chip" data-action="set-default">${SVG.star} Hacer predeterminada</button>`;
  const badge = p.is_default ? `<span class="imp-def-badge">${SVG.star} Predeterminada</span>` : '';

  return `
    <div class="imp-printer" data-printer="${p.id}" data-area="${esc(p.area||'cocina')}">
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
        <label class="imp-pr-field" style="grid-column:1/-1">
          ${sysFieldLabel}
          ${window.electronPOS ? sysSelect : `<input class="cf-input" value="${esc(p.system_name)}" placeholder="Detectar desde el ejecutable" disabled data-field="system_name">`}
          ${sysFieldHint}
        </label>
      </div>
      <div class="imp-pr-foot">
        <div class="imp-pr-area">
          <span class="imp-pr-field-lbl">Área</span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div class="imp-seg" data-seg="area">${areaPresetBtns}</div>
            <input class="cf-input imp-area-custom" style="width:100px;padding:5px 8px;font-size:12px" value="${!isPreset?esc(p.area):''}" placeholder="Área personalizada" data-field="area_custom" title="Escribe un área personalizada (ej: mostrador, vidriera)">
          </div>
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
  renderDetectedPanel();
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

  // Dropdown de impresora del sistema
  list.querySelectorAll('select[data-field="system_name"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const p = getPrinter(sel); if (!p) return;
      p.system_name = sel.value; markDirty();
    });
  });

  // Área personalizada (text input)
  list.querySelectorAll('.imp-area-custom').forEach(input => {
    input.addEventListener('input', () => {
      const p = getPrinter(input); if (!p) return;
      if (input.value.trim()) {
        p.area = input.value.trim();
        // Desmarcar presets
        const card = input.closest('[data-printer]');
        card.querySelectorAll('.imp-seg[data-seg="area"] .imp-seg-btn').forEach(b => b.classList.remove('on'));
        markDirty();
      }
    });
  });

  list.querySelectorAll('.imp-seg[data-seg="area"] .imp-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getPrinter(btn); if (!p) return;
      p.area = btn.dataset.area;
      // Limpiar campo personalizado
      const card = btn.closest('[data-printer]');
      const custom = card.querySelector('.imp-area-custom');
      if (custom) custom.value = '';
      markDirty(); renderPrinterList();
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
    btn.addEventListener('click', async () => {
      const p = getPrinter(btn);
      if (!p) return;
      toast(`Enviando prueba a "${p.name}"…`);
      if (window.electronPOS && window.electronPOS.printHtmlSilent) {
        const testHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;width:80mm;margin:0;padding:12px;text-align:center}hr{border:none;border-top:1px dashed #000;margin:8px 0}</style></head><body><div style="font-size:16px;font-weight:bold;margin-bottom:4px">COBRA POS</div><div style="font-size:11px;color:#555;margin-bottom:8px">Impresora de prueba</div><hr><div style="font-size:13px;margin:4px 0"><b>Impresora:</b> ${p.name}</div><div style="font-size:13px;margin:4px 0"><b>Área:</b> ${p.area || '—'}</div><div style="font-size:11px;color:#555;margin:4px 0">Sistema: ${p.system_name || 'Predeterminada'}</div><hr><div style="font-size:10px;color:#888;margin-top:6px">** TEST OK **</div></body></html>`;
        const res = await window.electronPOS.printHtmlSilent(testHtml, p.system_name || '');
        if (res && res.ok) toast(`✓ Test enviado a "${p.system_name || 'impresora predeterminada'}"`);
        else toast(`Error en test: ${(res && res.error) || 'desconocido'}`);
      } else {
        toast('Test de impresión solo disponible en el ejecutable.');
      }
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
    name: '', conn: '', model: '', area: 'cocina', is_default: false, system_name: ''
  });
  markDirty(); renderPrinterList();
}

/* ════════════════════════════════════════
   VISTA PREVIA — MODELO 1 (Arial bold)
   Estructura exacta del ticket físico
════════════════════════════════════════ */
function updatePreview() {
  const stage = document.getElementById('rcpt-stage');
  if (!stage) return;

  const w   = config.paper_width;
  const cpl = CPL[w];
  const fzBase  = config.font_size === 'grande' ? 13.5 : 11.5;  // px
  const fzTitle = fzBase + 2.5;
  const fzItem  = fzBase + 2;
  const fzSmall = fzBase - 1;
  const px = (n) => n + 'px';

  const brand = brandName ? brandName.toUpperCase() : 'MI RESTAURANTE';
  const W = w === 58 ? '210px' : '284px';

  // Separador punteado con texto centrado — réplica exacta del ticket físico
  const dashed = (txt) => {
    const side = '- - - - -';
    return `<div style="font-size:${px(fzSmall)};font-weight:700;letter-spacing:0.5px;margin:5px 0;white-space:pre-wrap;word-break:break-all;">${side} ${txt} ${side}</div>`;
  };

  // Línea separadora simple (entre encabezado y meta)
  const rule = `<div style="border-top:1px dashed #000;margin:4px 0;"></div>`;

  // Encabezado
  const header = [
    `<div style="font-size:${px(fzSmall)};font-weight:700;text-align:left;">Nº: ###</div>`,
    `<div style="font-size:${px(fzTitle)};font-weight:700;text-align:center;">DELIVERY #C1-####</div>`,
    config.content_cliente
      ? `<div style="font-size:${px(fzBase)};font-weight:700;text-align:center;">(NOMBRE DEL CLIENTE)</div>`
      : '',
    rule
  ];

  // Campos meta
  const meta = [];
  meta.push(`<div style="font-size:${px(fzBase)};font-weight:700;">MODALIDAD - ENTREGA INMEDIATA</div>`);
  meta.push(`<div style="font-size:${px(fzBase)};font-weight:700;">AREA - COCINA</div>`);
  meta.push(`<div style="font-size:${px(fzBase)};font-weight:700;">FECHA: 2026-06-14 19:14:34</div>`);
  if (config.content_canal)  meta.push(`<div style="font-size:${px(fzBase)};font-weight:700;">CANAL: Delivery Telefonico</div>`);
  if (config.content_prep)   meta.push(`<div style="font-size:${px(fzBase)};font-weight:700;">TIEMPO PREPARACION: 0</div>`);
  if (config.content_orden)  meta.push(`<div style="font-size:${px(fzBase)};font-weight:700;">PEDIDO: C1-####</div>`);

  // Ítems
  const itemLines = [];
  const sampleItems = [
    { qty:1, name:'MAICITOS ESPECIAL - POLLO PERSONAL', nota:'Sin salsa' },
    { qty:1, name:'PREMIUM - POLLO PERSONAL', nota:'' },
    { qty:2, name:'PREMIUM - MIXTA PERSONAL', nota:'Extra queso' },
    { qty:1, name:'HAMBURGUESA CARNE', nota:'' },
  ];
  sampleItems.forEach(it => {
    if (config.content_precio) {
      itemLines.push(`<div style="display:flex;justify-content:space-between;font-size:${px(fzItem)};font-weight:700;margin:3px 0;"><span>(${it.qty}) ${it.name}</span><span>$##.###</span></div>`);
    } else {
      itemLines.push(`<div style="font-size:${px(fzItem)};font-weight:700;margin:3px 0;">(${it.qty}) ${it.name}</div>`);
    }
    if (config.content_notas && it.nota) {
      itemLines.push(`<div style="font-size:${px(fzSmall)};font-weight:700;margin:1px 0 3px 8px;">» ${it.nota}</div>`);
    }
  });
  if (config.content_precio) {
    itemLines.push(rule);
    itemLines.push(`<div style="display:flex;justify-content:space-between;font-size:${px(fzItem)};font-weight:700;">TOTAL<span>$##.###</span></div>`);
  }

  // Copias (efecto stack)
  const stack = config.copies >= 3
    ? `<div style="position:absolute;top:7px;left:7px;width:100%;height:100%;background:#fff;border:1px solid #e2e8f0;z-index:0;"></div>
       <div style="position:absolute;top:3.5px;left:3.5px;width:100%;height:100%;background:#fff;border:1px solid #e2e8f0;z-index:0;"></div>`
    : config.copies === 2
    ? `<div style="position:absolute;top:4px;left:4px;width:100%;height:100%;background:#fff;border:1px solid #e2e8f0;z-index:0;"></div>`
    : '';

  // Corte
  const cutCSS = { total:'border-top:2px solid #ef4444;', parcial:'border-top:2px dashed #f97316;', none:'border-top:1px dashed #cbd5e1;opacity:0.4;' };
  const cutLabel = { total:'Corte total', parcial:'Corte parcial', none:'Sin corte' };

  stage.innerHTML = `
    <div style="position:relative;display:inline-block;">
      ${stack}
      <div style="
        position:relative;z-index:1;
        font-family:Arial,Helvetica,sans-serif;
        background:#fff;color:#000;
        width:${W};padding:12px 10px;
        box-shadow:0 10px 32px -10px rgba(15,23,42,.22);
        line-height:1.5;
      ">
        ${header.join('')}
        ${meta.join('')}
        ${dashed('INICIO  PEDIDO')}
        ${itemLines.join('')}
        ${dashed('FIN PEDIDO')}
      </div>
      <div style="width:${W};height:22px;position:relative;z-index:1;${cutCSS[config.cut]}">
        <span style="position:absolute;left:50%;top:5px;transform:translateX(-50%);font-size:10px;font-weight:700;font-family:Arial,sans-serif;color:#94A3B8;white-space:nowrap;">${cutLabel[config.cut]}</span>
      </div>
    </div>`;

  document.getElementById('imp-cpl').textContent          = cpl;
  document.getElementById('imp-preview-meta').textContent = `${w} mm · ${cpl} car`;
  document.getElementById('imp-preview-foot').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    ${config.copies} copia${config.copies>1?'s':''} · ${config.auto_print?'auto':'manual'} · ${cutLabel[config.cut].toLowerCase()}`;
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

  // Misma impresora para todo
  const swSame = document.getElementById('sw-same-printer');
  if (swSame) {
    swSame.classList.toggle('on', !!config.same_printer_for_all);
    swSame.setAttribute('aria-pressed', String(!!config.same_printer_for_all));
  }
  const samePrinterRow = document.getElementById('same-printer-select-row');
  if (samePrinterRow) samePrinterRow.style.display = config.same_printer_for_all ? 'flex' : 'none';
  const selDefault = document.getElementById('sel-default-printer');
  if (selDefault) {
    selDefault.innerHTML = '<option value="">— Predeterminada del sistema —</option>'
      + systemPrinters.map(function(sp) {
          var nm = sp.displayName || sp.name || '';
          return `<option value="${esc(nm)}"${nm === config.default_system_printer ? ' selected' : ''}>${esc(nm)}</option>`;
        }).join('');
  }

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
      paper_width:              config.paper_width,
      font_size:                config.font_size,
      comanda_model:            config.comanda_model,
      content_orden:            config.content_orden,
      content_canal:            config.content_canal,
      content_prep:             config.content_prep,
      content_cliente:          config.content_cliente,
      content_notas:            config.content_notas,
      content_precio:           config.content_precio,
      auto_print:               config.auto_print,
      copies:                   config.copies,
      cut:                      config.cut,
      same_printer_for_all:     config.same_printer_for_all,
      default_system_printer:   config.default_system_printer,
      updated_at:               new Date().toISOString()
    };
    await sb.from('pos_print_config').upsert(configPayload, { onConflict: 'branch_id' });

    // 2. Guardar impresoras (upsert existentes, insertar nuevas)
    for (const p of printers) {
      if (p.id.startsWith('new_')) {
        const { data } = await sb.from('pos_printers').insert({
          branch_id: branchId, tenant_id: tenantId,
          name: p.name || 'Nueva impresora', conn: p.conn || '', model: p.model || '',
          area: p.area || 'cocina', is_default: p.is_default, system_name: p.system_name || ''
        }).select().single();
        if (data) p.id = data.id;
      } else {
        await sb.from('pos_printers').update({
          name: p.name, conn: p.conn || '', model: p.model || '',
          area: p.area || 'cocina', is_default: p.is_default, system_name: p.system_name || ''
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

  // Detectar impresoras del sistema
  const btnDetect = document.getElementById('btn-detect-printers');
  if (btnDetect) btnDetect.addEventListener('click', detectSystemPrinters);

  // Toggle "misma impresora para todo"
  const swSame = document.getElementById('sw-same-printer');
  if (swSame) swSame.addEventListener('click', () => {
    config.same_printer_for_all = !config.same_printer_for_all;
    swSame.classList.toggle('on', config.same_printer_for_all);
    swSame.setAttribute('aria-pressed', String(config.same_printer_for_all));
    const row = document.getElementById('same-printer-select-row');
    if (row) row.style.display = config.same_printer_for_all ? 'flex' : 'none';
    markDirty();
  });

  // Selector de impresora predeterminada
  const selDefault = document.getElementById('sel-default-printer');
  if (selDefault) selDefault.addEventListener('change', () => {
    config.default_system_printer = selDefault.value;
    markDirty();
  });

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
  const stage = document.querySelector('.imp-preview-stage');
  if (!stage) return;
  stage.innerHTML = `<div id="rcpt-stage"></div>`;
}

/* ════════════════════════════════════════
   ARRANQUE — patrón idéntico a caja.js
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  patchPreviewStage();
  bindNavEvents();
});

function bindNavEvents() {
  const back = document.getElementById('nav-back');
  if (back) back.addEventListener('click', () => { window.location.href = 'configuracion.html'; });
  document.querySelectorAll('.lm-nav[data-section]').forEach(btn => {
    if (btn.dataset.section !== 'impresora') {
      btn.addEventListener('click', () => { window.location.href = 'configuracion.html'; });
    }
  });
}

window._pos.on('core:ready', async function({ user }) {
  currentUser = user;
  branchId    = window._pos.state.branchId;
  tenantId    = window._pos.state.tenantId;
  await loadAndRender();
});
