/* ============================================================
   LUMEN POS · CONFIGURACIÓN — Impresoras
   Estado guardado en localStorage: "lumen.config.impresoras.v1"
   ============================================================ */

const STORAGE_KEY = 'lumen.config.impresoras.v1';
const CPL = { 58: 32, 80: 48 };

const SEED = {
  printers: [
    { id: 'p_cocina', name: 'Cocina principal', conn: '192.168.1.50', model: 'Epson TM-T20III', area: 'cocina' },
    { id: 'p_barra',  name: 'Barra',            conn: 'USB001',       model: 'Xprinter XP-80',  area: 'barra'  },
    { id: 'p_caja',   name: 'Caja',             conn: '192.168.1.52', model: 'Epson TM-T88VI',  area: 'caja'   }
  ],
  defaults:   { cocina: 'p_cocina', barra: 'p_barra', caja: 'p_caja' },
  paperWidth: 80,
  fontSize:   'normal',
  model:      'estandar',
  content:    { orden: true, canal: true, prep: true, cliente: true, notas: true, precio: false },
  autoPrint:  true,
  copies:     1,
  cut:        'total'
};

function uid() { return 'p_' + Math.random().toString(36).slice(2, 8); }

/* ── Estado ── */
let saved  = JSON.parse(JSON.stringify(SEED));
let draft  = JSON.parse(JSON.stringify(SEED));
let dirty  = false;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      saved = JSON.parse(raw);
      draft = JSON.parse(JSON.stringify(saved));
    }
  } catch(e) { /* usa seed */ }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  saved = JSON.parse(JSON.stringify(draft));
}

/* ── Dirty state ── */
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

/* ── Toast ── */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ══════════════════════════════════════
   RENDERIZADO DE IMPRESORAS
══════════════════════════════════════ */

const SVG_PRINTER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
const SVG_STAR    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const SVG_TRASH   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const SVG_CONN    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v2a6 6 0 0 1-12 0V8zM12 16v6"/></svg>`;
const SVG_MODEL   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`;
const SVG_PLAY    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

function renderPrinterCard(p) {
  const isDefault = draft.defaults[p.area] === p.id;
  const areas = ['cocina', 'barra', 'caja'];

  const badgeHtml = isDefault
    ? `<span class="imp-def-badge">${SVG_STAR} Predeterminada</span>`
    : '';

  const areaButtons = areas.map(a =>
    `<button class="imp-seg-btn${p.area === a ? ' on' : ''}" data-area="${a}"><span>${a.charAt(0).toUpperCase() + a.slice(1)}</span></button>`
  ).join('');

  const defBtn = isDefault
    ? `<button class="imp-chip on" disabled>${SVG_STAR} Predeterminada</button>`
    : `<button class="imp-chip" data-action="set-default">${SVG_STAR} Hacer predeterminada</button>`;

  return `
    <div class="imp-printer" data-printer="${p.id}" data-area="${p.area}">
      <div class="imp-pr-head">
        <span class="imp-pr-icon">${SVG_PRINTER}</span>
        <input class="imp-name" value="${escHtml(p.name)}" placeholder="Nombre de la impresora">
        ${badgeHtml}
        <button class="imp-row-del" title="Eliminar">${SVG_TRASH}</button>
      </div>
      <div class="imp-pr-grid">
        <label class="imp-pr-field">
          <span class="imp-pr-field-lbl">${SVG_CONN} IP o puerto</span>
          <input class="cf-input" value="${escHtml(p.conn)}" placeholder="192.168.1.50 · USB001 · COM3" data-field="conn">
        </label>
        <label class="imp-pr-field">
          <span class="imp-pr-field-lbl">${SVG_MODEL} Modelo</span>
          <input class="cf-input" value="${escHtml(p.model)}" placeholder="Ej. Epson TM-T20III" data-field="model">
        </label>
      </div>
      <div class="imp-pr-foot">
        <div class="imp-pr-area">
          <span class="imp-pr-field-lbl">Área</span>
          <div class="imp-seg" data-seg="area">${areaButtons}</div>
        </div>
        <div class="imp-pr-actions">
          ${defBtn}
          <button class="imp-chip test" data-action="test">${SVG_PLAY} Test</button>
        </div>
      </div>
    </div>`;
}

const ADD_TILE = `
  <button class="imp-add" id="btn-add-printer-tile">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar impresora
  </button>`;

function renderPrinterList() {
  const list = document.getElementById('imp-printer-list');
  list.innerHTML = draft.printers.map(renderPrinterCard).join('') + ADD_TILE;
  bindPrinterEvents();
  renderLegend();
}

function renderLegend() {
  const legend = document.getElementById('imp-legend');
  const areas = ['cocina', 'barra', 'caja'];
  legend.innerHTML = areas.map(area => {
    const defId = draft.defaults[area];
    const printer = draft.printers.find(p => p.id === defId);
    const valHtml = printer
      ? `<span class="imp-legend-val">${SVG_STAR}${escHtml(printer.name)}</span>`
      : `<span class="imp-legend-empty"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Sin predeterminada</span>`;
    return `<div class="imp-legend-chip" data-area="${area}">
      <span class="imp-legend-lbl">${area.charAt(0).toUpperCase() + area.slice(1)}</span>
      ${valHtml}
    </div>`;
  }).join('');
}

function bindPrinterEvents() {
  const list = document.getElementById('imp-printer-list');

  /* nombre */
  list.querySelectorAll('.imp-name').forEach(input => {
    input.addEventListener('input', () => {
      const card = input.closest('[data-printer]');
      const id = card.dataset.printer;
      const p = draft.printers.find(x => x.id === id);
      if (p) { p.name = input.value; renderLegend(); markDirty(); }
    });
  });

  /* conn / model */
  list.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      const card = input.closest('[data-printer]');
      const id = card.dataset.printer;
      const p = draft.printers.find(x => x.id === id);
      if (p) { p[input.dataset.field] = input.value; markDirty(); }
    });
  });

  /* área */
  list.querySelectorAll('.imp-seg[data-seg="area"] .imp-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-printer]');
      const id = card.dataset.printer;
      const p = draft.printers.find(x => x.id === id);
      if (!p) return;
      p.area = btn.dataset.area;
      markDirty();
      renderPrinterList();
    });
  });

  /* hacer predeterminada */
  list.querySelectorAll('[data-action="set-default"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-printer]');
      const id = card.dataset.printer;
      const p = draft.printers.find(x => x.id === id);
      if (!p) return;
      draft.defaults[p.area] = p.id;
      markDirty();
      renderPrinterList();
    });
  });

  /* test */
  list.querySelectorAll('[data-action="test"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-printer]');
      const id = card.dataset.printer;
      const p = draft.printers.find(x => x.id === id);
      if (p) toast(`Imprimiendo prueba en "${p.name}"…`);
    });
  });

  /* eliminar */
  list.querySelectorAll('.imp-row-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-printer]');
      const id = card.dataset.printer;
      const p = draft.printers.find(x => x.id === id);
      if (!p) return;
      if (draft.defaults[p.area] === p.id) draft.defaults[p.area] = null;
      draft.printers = draft.printers.filter(x => x.id !== id);
      markDirty();
      renderPrinterList();
    });
  });

  /* agregar (tile) */
  const tile = document.getElementById('btn-add-printer-tile');
  if (tile) tile.addEventListener('click', addPrinter);
}

function addPrinter() {
  draft.printers.push({ id: uid(), name: 'Nueva impresora', conn: '', model: '', area: 'cocina' });
  markDirty();
  renderPrinterList();
}

/* ══════════════════════════════════════
   VISTA PREVIA — actualizar recibo
══════════════════════════════════════ */

function updatePreview() {
  const rcpt = document.getElementById('rcpt');
  const edge = document.getElementById('rcpt-edge');
  const wrap = document.getElementById('rcpt-wrap');

  /* ancho */
  rcpt.className = `rcpt w${draft.paperWidth} fz-${draft.fontSize}`;
  edge.className = `rcpt-edge ${draft.cut}${draft.paperWidth === 58 ? ' w58' : ''}`;
  if (draft.paperWidth === 58) wrap.classList.add('w58'); else wrap.classList.remove('w58');

  /* CPL */
  document.getElementById('imp-cpl').textContent = CPL[draft.paperWidth];
  document.getElementById('imp-preview-meta').textContent = `${draft.paperWidth} mm · ${CPL[draft.paperWidth]} car`;

  /* contenido (show/hide filas del recibo) */
  Object.entries(draft.content).forEach(([key, val]) => {
    rcpt.querySelectorAll(`[data-content="${key}"]`).forEach(el => {
      el.hidden = !val;
    });
  });

  /* corte — caption */
  const capMap = { total: 'Corte total', parcial: 'Corte parcial', none: 'Sin corte' };
  const cap = edge.querySelector('.rcpt-edge-cap');
  if (cap) {
    const SVG_SCISSORS = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`;
    cap.innerHTML = `${SVG_SCISSORS} ${capMap[draft.cut]}`;
  }

  /* copias apiladas */
  wrap.querySelectorAll('.rcpt-stack, .rcpt-stack2').forEach(el => el.remove());
  if (draft.copies > 1) {
    const s2 = document.createElement('div'); s2.className = 'rcpt-stack2'; wrap.prepend(s2);
    const s1 = document.createElement('div'); s1.className = 'rcpt-stack';  wrap.prepend(s1);
  }

  /* pie de preview */
  const cutLabel = { total: 'corte total', parcial: 'corte parcial', none: 'desactivado' };
  document.getElementById('imp-preview-foot').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    ${draft.copies} copia${draft.copies > 1 ? 's' : ''} · ${draft.autoPrint ? 'auto' : 'manual'} · ${cutLabel[draft.cut]}`;
}

/* ══════════════════════════════════════
   APLICAR ESTADO AL DOM (reconstruir UI)
══════════════════════════════════════ */

function applyStateToUI() {
  /* papel */
  document.querySelectorAll('#seg-paper .imp-seg-btn').forEach(btn => {
    btn.classList.toggle('on', parseInt(btn.dataset.w) === draft.paperWidth);
  });

  /* fuente */
  document.querySelectorAll('#seg-font .imp-seg-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.size === draft.fontSize);
  });

  /* contenido switches */
  document.querySelectorAll('.cf-switch[data-content]').forEach(sw => {
    const key = sw.dataset.content;
    const val = draft.content[key];
    sw.classList.toggle('on', val);
    sw.setAttribute('aria-pressed', String(val));
  });

  /* autoprint */
  const swAuto = document.getElementById('sw-autoprint');
  swAuto.classList.toggle('on', draft.autoPrint);
  swAuto.setAttribute('aria-pressed', String(draft.autoPrint));
  document.getElementById('hint-autoprint').textContent = draft.autoPrint
    ? 'La comanda sale apenas se confirma el pedido.'
    : 'El cajero imprime la comanda manualmente.';

  /* copias */
  document.querySelectorAll('#seg-copies .imp-seg-btn').forEach(btn => {
    btn.classList.toggle('on', parseInt(btn.dataset.copies) === draft.copies);
  });

  /* modelos */
  document.querySelectorAll('.imp-model:not(.locked)').forEach(card => {
    card.classList.toggle('on', card.dataset.model === draft.model);
  });

  /* corte */
  document.querySelectorAll('.imp-cut').forEach(card => {
    card.classList.toggle('on', card.dataset.cut === draft.cut);
  });

  renderPrinterList();
  updatePreview();
}

/* ══════════════════════════════════════
   EVENTOS GLOBALES
══════════════════════════════════════ */

function bindGlobalEvents() {

  /* agregar impresora (cabecera) */
  document.getElementById('btn-add-printer').addEventListener('click', addPrinter);

  /* papel */
  document.getElementById('seg-paper').addEventListener('click', e => {
    const btn = e.target.closest('.imp-seg-btn');
    if (!btn) return;
    draft.paperWidth = parseInt(btn.dataset.w);
    document.querySelectorAll('#seg-paper .imp-seg-btn').forEach(b => b.classList.toggle('on', b === btn));
    updatePreview();
    markDirty();
  });

  /* fuente */
  document.getElementById('seg-font').addEventListener('click', e => {
    const btn = e.target.closest('.imp-seg-btn');
    if (!btn) return;
    draft.fontSize = btn.dataset.size;
    document.querySelectorAll('#seg-font .imp-seg-btn').forEach(b => b.classList.toggle('on', b === btn));
    updatePreview();
    markDirty();
  });

  /* modelos */
  document.getElementById('imp-model-grid').addEventListener('click', e => {
    const card = e.target.closest('.imp-model:not(.locked)');
    if (!card) return;
    draft.model = card.dataset.model;
    document.querySelectorAll('.imp-model:not(.locked)').forEach(c => c.classList.toggle('on', c === card));
    markDirty();
  });

  /* switches de contenido */
  document.querySelectorAll('.cf-switch[data-content]').forEach(sw => {
    sw.addEventListener('click', () => {
      const key = sw.dataset.content;
      draft.content[key] = !draft.content[key];
      sw.classList.toggle('on', draft.content[key]);
      sw.setAttribute('aria-pressed', String(draft.content[key]));
      updatePreview();
      markDirty();
    });
  });

  /* autoprint */
  document.getElementById('sw-autoprint').addEventListener('click', () => {
    draft.autoPrint = !draft.autoPrint;
    const sw = document.getElementById('sw-autoprint');
    sw.classList.toggle('on', draft.autoPrint);
    sw.setAttribute('aria-pressed', String(draft.autoPrint));
    document.getElementById('hint-autoprint').textContent = draft.autoPrint
      ? 'La comanda sale apenas se confirma el pedido.'
      : 'El cajero imprime la comanda manualmente.';
    updatePreview();
    markDirty();
  });

  /* copias */
  document.getElementById('seg-copies').addEventListener('click', e => {
    const btn = e.target.closest('.imp-seg-btn');
    if (!btn) return;
    draft.copies = parseInt(btn.dataset.copies);
    document.querySelectorAll('#seg-copies .imp-seg-btn').forEach(b => b.classList.toggle('on', b === btn));
    updatePreview();
    markDirty();
  });

  /* reimprimir */
  document.getElementById('btn-reimprimir').addEventListener('click', () => {
    toast('Reimprimiendo comanda del pedido activo…');
  });

  /* corte */
  document.getElementById('imp-cut-grid').addEventListener('click', e => {
    const card = e.target.closest('.imp-cut');
    if (!card) return;
    draft.cut = card.dataset.cut;
    document.querySelectorAll('.imp-cut').forEach(c => c.classList.toggle('on', c === card));
    updatePreview();
    markDirty();
  });

  /* guardar */
  document.getElementById('btn-save').addEventListener('click', () => {
    saveToStorage();
    clearDirty();
    toast('Configuración de impresión guardada');
  });

  /* descartar */
  document.getElementById('btn-discard').addEventListener('click', () => {
    draft = JSON.parse(JSON.stringify(saved));
    clearDirty();
    applyStateToUI();
  });
}

/* ══════════════════════════════════════
   UTILIDADES
══════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  bindGlobalEvents();
  applyStateToUI();
  clearDirty();
});
