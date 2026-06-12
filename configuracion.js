/* configuracion.js — Mesas y zonas · Lumen POS */
/* Depende de: pos-core.js (sb, $) */

// ── Estado ──────────────────────────────────────────────
var STORAGE_KEY = 'lumen.config.salon.v1';

var SEED = {
  zones: [
    { id: 'z_adentro', name: 'Adentro'    },
    { id: 'z_ante',    name: 'Antejardín' },
    { id: 'z_terraza', name: 'Terraza'    }
  ],
  tables: [
    { id: 't01', zoneId: 'z_adentro', name: '01',    seats: 4 },
    { id: 't02', zoneId: 'z_adentro', name: '02',    seats: 4 },
    { id: 't03', zoneId: 'z_adentro', name: '03',    seats: 2 },
    { id: 't04', zoneId: 'z_adentro', name: '04',    seats: 6 },
    { id: 't05', zoneId: 'z_adentro', name: '05',    seats: 4 },
    { id: 't06', zoneId: 'z_adentro', name: 'Barra', seats: 8 },
    { id: 't07', zoneId: 'z_ante',    name: '06',    seats: 4 },
    { id: 't08', zoneId: 'z_ante',    name: '07',    seats: 2 },
    { id: 't09', zoneId: 'z_terraza', name: '08',    seats: 6 }
  ]
};

var S = {
  zones: [],
  tables: [],
  activeZone: null,
  selectedTable: null
};

// ── Persistencia ────────────────────────────────────────
function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed.zones && parsed.zones.length && parsed.tables) {
        S.zones  = parsed.zones;
        S.tables = parsed.tables;
        return;
      }
    }
  } catch(e) {}
  S.zones  = JSON.parse(JSON.stringify(SEED.zones));
  S.tables = JSON.parse(JSON.stringify(SEED.tables));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ zones: S.zones, tables: S.tables }));
  } catch(e) {}
  syncToSupabase(); // fire-and-forget
}

// ── Sync a Supabase pos_tables ────────────────────────
async function syncToSupabase() {
  try {
    var res = await sb.auth.getUser();
    var user = res.data && res.data.user;
    if (!user) return;
    var branchId = user.user_metadata && user.user_metadata.branch_id;
    if (!branchId) return;

    // IDs actuales en Supabase
    var exRes = await sb.from('pos_tables').select('id, status').eq('branch_id', branchId);
    var existing = exRes.data || [];
    var existingMap = {};
    existing.forEach(function(r){ existingMap[r.id] = r.status; });

    var localIds = S.tables.map(function(t){ return t.id; });

    // 1. Insertar mesas nuevas (no existen en Supabase)
    var toInsert = S.tables.filter(function(t){ return !existingMap[t.id]; }).map(function(t, idx){
      return {
        id: t.id,
        name: t.name,
        number: parseInt(t.name, 10) || (idx + 1),
        seats: t.seats,
        zone_id: t.zoneId,
        branch_id: branchId,
        status: 'libre'
      };
    });
    if (toInsert.length) {
      await sb.from('pos_tables').insert(toInsert);
    }

    // 2. Actualizar mesas existentes (solo campos estructurales, no status)
    var toUpdate = S.tables.filter(function(t){ return !!existingMap[t.id]; });
    for (var i = 0; i < toUpdate.length; i++) {
      var t = toUpdate[i];
      await sb.from('pos_tables')
        .update({ name: t.name, number: parseInt(t.name, 10) || i + 1, seats: t.seats, zone_id: t.zoneId })
        .eq('id', t.id);
    }

    // 3. Eliminar mesas borradas — solo si estan libres
    var toDelete = Object.keys(existingMap).filter(function(id){
      return !localIds.includes(id) && existingMap[id] === 'libre';
    });
    if (toDelete.length) {
      await sb.from('pos_tables').delete().in('id', toDelete);
    }

  } catch(e) {
    console.warn('[configuracion] syncToSupabase:', e.message || e);
  }
}

// ── Utilidades ──────────────────────────────────────────
function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function zoneById(id) { return S.zones.find(function(z){ return z.id === id; }); }
function tableById(id) { return S.tables.find(function(t){ return t.id === id; }); }
function tablesInZone(zoneId) { return S.tables.filter(function(t){ return t.zoneId === zoneId; }); }
function seatsInZone(zoneId) {
  return tablesInZone(zoneId).reduce(function(s,t){ return s + (t.seats||0); }, 0);
}
function nextTableName() {
  var nums = S.tables.map(function(t){
    var n = parseInt(t.name, 10);
    return isNaN(n) ? 0 : n;
  });
  var max = nums.length ? Math.max.apply(null, nums) : 0;
  return String(max + 1).padStart(2, '0');
}

// ── Toast ────────────────────────────────────────────────
var _toastTimer = null;
function showToast(msg) {
  var el = $('toast');
  $('toast-msg').textContent = msg;
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.hidden = true; }, 2200);
}

// ── Navegación de secciones ─────────────────────────────
var SECTION_LABELS = {
  general:   'General',
  mesas:     'Mesas y zonas',
  horario:   'Horarios',
  pagos:     'Métodos de pago',
  impuesto:  'Impuestos y propina',
  impresora: 'Impresoras',
  usuarios:  'Usuarios y roles'
};

function setSection(sec) {
  if (sec === 'back') { window.location.href = 'dashboard.html'; return; }

  document.querySelectorAll('.lm-nav').forEach(function(b){
    b.classList.toggle('on', b.dataset.section === sec);
  });

  var screenMesas    = $('screen-mesas');
  var screenGeneral  = $('screen-general');
  var screenPh       = $('screen-placeholder');

  screenMesas.classList.remove('on');
  screenGeneral.classList.remove('on');
  screenPh.classList.remove('on');

  if (sec === 'mesas') {
    screenMesas.classList.add('on');
    $('crumb').textContent = 'Mesas y zonas';
    deselectTable();
  } else if (sec === 'general') {
    screenGeneral.classList.add('on');
    $('crumb').textContent = 'General';
    if (!window._generalLoaded) { loadGeneral(); window._generalLoaded = true; }
  } else {
    screenPh.classList.add('on');
    $('placeholder-title').textContent = SECTION_LABELS[sec] || sec;
    $('crumb').textContent = SECTION_LABELS[sec] || sec;
  }
}

// ── Render zona-tabs ────────────────────────────────────
function renderZoneTabs() {
  var container = $('zone-tabs');
  container.innerHTML = '';
  S.zones.forEach(function(z) {
    var btn = document.createElement('button');
    btn.className = 'cf-ztab' + (z.id === S.activeZone ? ' on' : '');
    btn.dataset.zone = z.id;
    var count = tablesInZone(z.id).length;
    btn.innerHTML = escHtml(z.name) + '<span class="cf-ztab-n">' + count + '</span>';
    btn.addEventListener('click', function(){ setActiveZone(z.id); });
    container.appendChild(btn);
  });
}

// ── Render grilla de mesas ──────────────────────────────
function renderGrid() {
  var grid  = $('mesa-grid');
  var empty = $('grid-empty');
  var mesas = tablesInZone(S.activeZone);

  if (!mesas.length) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.hidden = false;
    return;
  }

  grid.style.display = '';
  empty.hidden = true;
  grid.innerHTML = '';

  mesas.forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'lm-mesa' + (t.id === S.selectedTable ? ' selected' : '');
    btn.dataset.table = t.id;
    var isLong = t.name.length > 3;
    var foot   = t.id === S.selectedTable ? 'Editando…' : 'Toca para editar';
    btn.innerHTML =
      '<span class="lm-mesa-top">' +
        '<span class="cf-mesa-eyebrow">Mesa</span>' +
        '<span class="cf-seats-pill">' + PERSON_ICON + ' ' + t.seats + '</span>' +
      '</span>' +
      '<span class="cf-mesa-name' + (isLong ? ' long' : '') + '">' + escHtml(t.name) + '</span>' +
      '<span class="cf-mesa-foot">' + foot + '</span>';
    btn.addEventListener('click', function(){ selectTable(t.id); });
    grid.appendChild(btn);
  });

  // tile "Nueva mesa"
  var tile = document.createElement('button');
  tile.className = 'cf-add-mesa';
  tile.id = 'btn-add-mesa-tile';
  tile.innerHTML =
    '<span class="cf-add-mesa-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>' +
    '<span class="cf-add-mesa-label">Nueva mesa</span>';
  tile.addEventListener('click', createTable);
  grid.appendChild(tile);
}

// ── Render panel de zonas (rail izquierdo) ──────────────
function renderPaneZones() {
  var list = $('zone-list');
  list.innerHTML = '';
  S.zones.forEach(function(z) {
    var isActive = z.id === S.activeZone;
    var count    = tablesInZone(z.id).length;
    var row = document.createElement('div');
    row.className = 'cf-zonerow' + (isActive ? ' on' : '');
    row.dataset.zone = z.id;
    row.innerHTML =
      '<span class="cf-zone-dot"></span>' +
      '<input class="cf-zoneinput" value="' + escHtml(z.name) + '">' +
      '<span class="cf-zone-count">' + count + '</span>' +
      '<button class="cf-mini-del" data-zone="' + z.id + '">' + TRASH_ICON + '</button>';

    // click en la fila → activar zona
    row.addEventListener('click', function(e){
      if (e.target.closest('.cf-zoneinput')) return; // no cambiar al renombrar
      if (e.target.closest('.cf-mini-del')) return;
      setActiveZone(z.id);
    });

    // renombrar zona
    var input = row.querySelector('.cf-zoneinput');
    input.addEventListener('click', function(e){ e.stopPropagation(); });
    input.addEventListener('input', function(){
      var zone = zoneById(z.id);
      if (zone) {
        zone.name = input.value;
        // actualizar pestaña
        document.querySelectorAll('.cf-ztab').forEach(function(tab){
          if (tab.dataset.zone === z.id) {
            var count2 = tablesInZone(z.id).length;
            tab.innerHTML = escHtml(input.value) + '<span class="cf-ztab-n">' + count2 + '</span>';
            tab.addEventListener('click', function(){ setActiveZone(z.id); });
          }
        });
        // actualizar select del inspector
        renderInspZoneSelect();
        saveState();
      }
    });

    // botón borrar zona
    var delBtn = row.querySelector('.cf-mini-del');
    delBtn.addEventListener('click', function(e){
      e.stopPropagation();
      deleteZone(z.id);
    });

    list.appendChild(row);
  });
}

// ── Stats ─────────────────────────────────────────────
function renderStats() {
  $('stat-mesas').textContent  = tablesInZone(S.activeZone).length;
  $('stat-puestos').textContent = seatsInZone(S.activeZone);
}

// ── Select de zona en inspector ─────────────────────────
function renderInspZoneSelect() {
  var sel = $('insp-zone');
  var current = sel.value;
  sel.innerHTML = '';
  S.zones.forEach(function(z){
    var opt = document.createElement('option');
    opt.value = z.id;
    opt.textContent = z.name;
    if (z.id === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Activar zona ─────────────────────────────────────────
function setActiveZone(zoneId) {
  S.activeZone = zoneId;
  deselectTable();          // limpia selección sin re-render completo
  renderZoneTabs();
  renderGrid();
  renderPaneZones();
  renderStats();
}

// ── Seleccionar / deseleccionar mesa ─────────────────────
function selectTable(id) {
  S.selectedTable = id;
  var t = tableById(id);
  if (!t) return;

  // inspector
  $('insp-title').textContent = 'Mesa ' + t.name;
  $('insp-name').value        = t.name;
  $('seats-value').textContent = t.seats;
  renderInspZoneSelect();
  $('insp-zone').value = t.zoneId;

  // alternar paneles
  $('pane-zones').classList.remove('on');
  $('pane-inspector').classList.add('on');

  // actualizar tarjetas
  document.querySelectorAll('.lm-mesa').forEach(function(card){
    var isSel = card.dataset.table === id;
    card.classList.toggle('selected', isSel);
    var foot = card.querySelector('.cf-mesa-foot');
    if (foot) foot.textContent = isSel ? 'Editando…' : 'Toca para editar';
    var name = card.querySelector('.cf-mesa-name');
    if (name) name.style.color = isSel ? 'var(--accent)' : '';
  });

  // activar zona de la mesa si no coincide
  if (t.zoneId !== S.activeZone) setActiveZone(t.zoneId);
}

function deselectTable() {
  S.selectedTable = null;
  $('pane-inspector').classList.remove('on');
  $('pane-zones').classList.add('on');
  document.querySelectorAll('.lm-mesa').forEach(function(card){
    card.classList.remove('selected');
    var foot = card.querySelector('.cf-mesa-foot');
    if (foot) foot.textContent = 'Toca para editar';
    var name = card.querySelector('.cf-mesa-name');
    if (name) name.style.color = '';
  });
}

// ── Crear mesa ───────────────────────────────────────────
function createTable() {
  var newTable = {
    id:     uid(),
    zoneId: S.activeZone,
    name:   nextTableName(),
    seats:  4
  };
  S.tables.push(newTable);
  saveState();
  renderGrid();
  renderZoneTabs();
  renderPaneZones();
  renderStats();
  selectTable(newTable.id);
}

// ── Duplicar mesa ────────────────────────────────────────
function duplicateTable(id) {
  var t = tableById(id);
  if (!t) return;
  var copy = { id: uid(), zoneId: t.zoneId, name: t.name + '·', seats: t.seats };
  S.tables.push(copy);
  saveState();
  renderGrid();
  renderZoneTabs();
  renderPaneZones();
  renderStats();
  selectTable(copy.id);
}

// ── Eliminar mesa ────────────────────────────────────────
function deleteTable(id) {
  S.tables = S.tables.filter(function(t){ return t.id !== id; });
  S.selectedTable = null;
  saveState();
  $('pane-inspector').classList.remove('on');
  $('pane-zones').classList.add('on');
  renderGrid();
  renderZoneTabs();
  renderPaneZones();
  renderStats();
}

// ── Crear zona ───────────────────────────────────────────
function createZone() {
  var n = S.zones.length + 1;
  var zone = { id: 'z_' + uid(), name: 'Zona ' + n };
  S.zones.push(zone);
  saveState();
  S.activeZone = zone.id;
  deselectTable();
  renderZoneTabs();
  renderGrid();
  renderPaneZones();
  renderStats();
}

// ── Eliminar zona ────────────────────────────────────────
function deleteZone(zoneId) {
  if (S.zones.length <= 1) { showToast('Debe existir al menos una zona'); return; }
  if (tablesInZone(zoneId).length > 0) { showToast('Mueve o elimina sus mesas primero'); return; }
  S.zones = S.zones.filter(function(z){ return z.id !== zoneId; });
  if (S.activeZone === zoneId) S.activeZone = S.zones[0].id;
  saveState();
  renderZoneTabs();
  renderGrid();
  renderPaneZones();
  renderStats();
}

// ── Helpers HTML ─────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var PERSON_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
var TRASH_ICON  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// ── Inspector: handlers de cambio en vivo ────────────────
function bindInspector() {
  // nombre
  $('insp-name').addEventListener('input', function(){
    var t = tableById(S.selectedTable);
    if (!t) return;
    t.name = this.value;
    $('insp-title').textContent = 'Mesa ' + (this.value || '–');
    // actualizar tarjeta
    var card = document.querySelector('.lm-mesa.selected');
    if (card) {
      var nameEl = card.querySelector('.cf-mesa-name');
      if (nameEl) {
        nameEl.textContent = this.value;
        nameEl.className = 'cf-mesa-name' + (this.value.length > 3 ? ' long' : '');
      }
    }
    saveState();
  });

  // stepper –
  $('seats-minus').addEventListener('click', function(){
    var t = tableById(S.selectedTable);
    if (!t) return;
    t.seats = Math.max(1, t.seats - 1);
    $('seats-value').textContent = t.seats;
    var card = document.querySelector('.lm-mesa.selected');
    if (card) {
      var pill = card.querySelector('.cf-seats-pill');
      if (pill) pill.innerHTML = PERSON_ICON + ' ' + t.seats;
    }
    renderStats();
    saveState();
  });

  // stepper +
  $('seats-plus').addEventListener('click', function(){
    var t = tableById(S.selectedTable);
    if (!t) return;
    t.seats = Math.min(16, t.seats + 1);
    $('seats-value').textContent = t.seats;
    var card = document.querySelector('.lm-mesa.selected');
    if (card) {
      var pill = card.querySelector('.cf-seats-pill');
      if (pill) pill.innerHTML = PERSON_ICON + ' ' + t.seats;
    }
    renderStats();
    saveState();
  });

  // cambio de zona en inspector
  $('insp-zone').addEventListener('change', function(){
    var t = tableById(S.selectedTable);
    if (!t) return;
    t.zoneId = this.value;
    saveState();
    renderZoneTabs();
    renderGrid();
    renderPaneZones();
    renderStats();
    // la mesa desaparece de la grilla actual, deseleccionar
    S.selectedTable = null;
    $('pane-inspector').classList.remove('on');
    $('pane-zones').classList.add('on');
  });

  // cerrar inspector
  $('btn-insp-close').addEventListener('click', function(){
    deselectTable();
    renderGrid();
  });

  // duplicar
  $('btn-duplicar').addEventListener('click', function(){
    if (S.selectedTable) duplicateTable(S.selectedTable);
  });

  // eliminar
  $('btn-eliminar').addEventListener('click', function(){
    if (S.selectedTable) deleteTable(S.selectedTable);
  });
}

// ── Cargar usuario desde Supabase ────────────────────────
async function loadUser() {
  try {
    var res = await sb.auth.getUser();
    var user = res.data && res.data.user;
    if (!user) { window.location.href = 'login.html'; return; }
    var meta = user.user_metadata || {};
    var name = meta.name || user.email || 'Usuario';
    var role = meta.role || 'Administrador';
    var initials = name.split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase();
    $('user-av').textContent   = initials || 'U';
    $('user-name').textContent = name;
    $('user-role').textContent = role.charAt(0).toUpperCase() + role.slice(1);

    // brand sub
    var branchId = meta.branch_id;
    if (branchId) {
      var r = await sb.from('pos_branches').select('name').eq('id', branchId).single();
      if (r.data) $('brand-sub').textContent = r.data.name;
      else $('brand-sub').textContent = 'Mi restaurante';
    } else {
      $('brand-sub').textContent = 'Mi restaurante';
    }
  } catch(e) {
    console.error('loadUser:', e);
    $('user-name').textContent = 'Usuario';
    $('brand-sub').textContent = 'Mi restaurante';
  }
}


/* ── General — tipo de negocio seleccionado ───────────────── */
var G_TYPE = 'Restaurante';

function initGenTypeGrid() {
  var grid = $('gen-type-grid');
  if (!grid) return;
  grid.addEventListener('click', function(e) {
    var btn = e.target.closest('.cf-type-btn');
    if (!btn) return;
    grid.querySelectorAll('.cf-type-btn').forEach(function(b){ b.classList.remove('on'); });
    btn.classList.add('on');
    G_TYPE = btn.dataset.type;
  });
}

function setGenType(type) {
  G_TYPE = type || 'Restaurante';
  var grid = $('gen-type-grid');
  if (!grid) return;
  grid.querySelectorAll('.cf-type-btn').forEach(function(b){
    b.classList.toggle('on', b.dataset.type === G_TYPE);
  });
}

function initGoalFormat() {
  var input = $('gen-goal');
  if (!input) return;
  input.addEventListener('input', function() {
    var raw = input.value.replace(/\D/g, '');
    input.value = raw ? Number(raw).toLocaleString('es-CO') : '';
  });
}

async function loadGeneral() {
  try {
    var res = await sb.auth.getUser();
    var user = res.data && res.data.user;
    if (!user) return;
    var meta     = user.user_metadata || {};
    var branchId = meta.branch_id;
    var brandId  = null;

    // Nombre del gerente desde pos_users, fallback metadata
    var puRes = await sb.from('pos_users').select('name,phone').eq('id', user.id).maybeSingle();
    if (puRes.data && puRes.data.name) {
      $('gen-nombre').value = puRes.data.name;
    } else {
      $('gen-nombre').value = meta.nombre || '';
    }

    // Cargar branch (nombre + direccion)
    if (branchId) {
      var br = await sb.from('branches').select('id,name,address,brand_id').eq('id', branchId).single();
      if (br.data) {
        brandId = br.data.brand_id;
        $('gen-branch-name').value = br.data.name    || '';
        $('gen-addr').value        = br.data.address || '';
      }
    }

    // Cargar brand
    if (brandId) {
      var bd = await sb.from('brands').select('id,name').eq('id', brandId).single();
      if (bd.data) $('gen-brand-name').value = bd.data.name || '';
    }

    // Ciudad, pais, meta diaria desde user_metadata
    $('gen-city').value    = meta.ciudad || '';
    $('gen-country').value = meta.pais   || 'Colombia';
    if (meta.daily_goal) {
      $('gen-goal').value = Number(meta.daily_goal).toLocaleString('es-CO');
    }

    // Telefono: separar indicativo del numero
    var telFull = meta.telefono || (puRes.data && puRes.data.phone) || '';
    var dialSel = $('gen-dial');
    if (telFull && dialSel) {
      var m = telFull.match(/^\+(\d{1,4})\s*(.*)/);
      if (m) {
        for (var i = 0; i < dialSel.options.length; i++) {
          if (dialSel.options[i].value === m[1]) { dialSel.selectedIndex = i; break; }
        }
        $('gen-phone').value = m[2];
      } else {
        $('gen-phone').value = telFull;
      }
    }

    // Tipo de negocio
    setGenType(meta.tipo || 'Restaurante');

  } catch(e) {
    console.error('loadGeneral:', e);
  }
}

async function saveGeneral() {
  var btn = $('btn-save-general');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    var res = await sb.auth.getUser();
    var user = res.data && res.data.user;
    if (!user) throw new Error('Sin sesion');
    var meta        = user.user_metadata || {};
    var branchId    = meta.branch_id;
    var nombre      = ($('gen-nombre').value     || '').trim();
    var brandName   = ($('gen-brand-name').value || '').trim();
    var branchName  = ($('gen-branch-name').value || '').trim();
    var addr        = ($('gen-addr').value        || '').trim();
    var city        = ($('gen-city').value        || '').trim();
    var country     = ($('gen-country').value     || 'Colombia').trim();
    var dialCode    = $('gen-dial') ? $('gen-dial').value : '57';
    var phoneNum    = ($('gen-phone').value       || '').trim();
    var fullPhone   = phoneNum ? ('+' + dialCode + ' ' + phoneNum) : '';
    var goalRaw     = ($('gen-goal').value        || '').replace(/\D/g, '');
    var dailyGoal   = goalRaw ? Number(goalRaw) : null;

    if (!brandName || !branchName) {
      showToast('Completa el nombre del restaurante y la sucursal');
      return;
    }

    // Obtener brand_id desde branch
    var brData = await sb.from('branches').select('brand_id').eq('id', branchId).single();
    var brandId = brData.data && brData.data.brand_id;

    // Actualizar branch (solo name y address; city/phone/country en metadata)
    await sb.from('branches').update({ name: branchName, address: addr }).eq('id', branchId);

    // Actualizar brand
    if (brandId) {
      await sb.from('brands').update({ name: brandName }).eq('id', brandId);
    }

    // Actualizar pos_users (nombre + teléfono del gerente)
    try {
      var puUpdate = {};
      if (nombre)    puUpdate.name  = nombre;
      if (fullPhone) puUpdate.phone = fullPhone;
      if (Object.keys(puUpdate).length) {
        await sb.from('pos_users').update(puUpdate).eq('id', user.id);
      }
    } catch(e) { console.warn('pos_users update:', e); }

    // Actualizar user_metadata
    await sb.auth.updateUser({
      data: {
        nombre:     nombre,
        negocio:    brandName,
        tipo:       G_TYPE,
        ciudad:     city,
        pais:       country,
        telefono:   fullPhone,
        daily_goal: dailyGoal
      }
    });

    // Refrescar topbar inmediatamente
    $('brand-sub').textContent = branchName;
    if (nombre) {
      $('user-name').textContent = nombre;
      var ini = nombre.split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase();
      $('user-av').textContent = ini || 'G';
    }

    showToast('Cambios guardados');
  } catch(e) {
    console.error('saveGeneral:', e);
    showToast('Error al guardar. Intenta de nuevo.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
}

// ── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  loadState();
  S.activeZone = S.zones[0] ? S.zones[0].id : null;

  // render inicial completo
  renderZoneTabs();
  renderGrid();
  renderPaneZones();
  renderStats();
  renderInspZoneSelect();
  bindInspector();

  // botones "Nueva mesa"
  $('btn-nueva-mesa').addEventListener('click', createTable);
  $('btn-add-mesa-empty').addEventListener('click', createTable);

  // botones "Agregar zona"
  $('btn-add-zone').addEventListener('click', createZone);
  $('btn-add-zone-tab').addEventListener('click', createZone);

  // navegación lateral
  document.querySelectorAll('.lm-nav[data-section]').forEach(function(btn){
    btn.addEventListener('click', function(){ setSection(btn.dataset.section); });
  });

  // cargar usuario async
  loadUser();
  initGenTypeGrid();
  initGoalFormat();
  var btnSave = $('btn-save-general');
  if (btnSave) btnSave.addEventListener('click', saveGeneral);
});
