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
  var _screenUr = $('screen-usuarios');
  if (_screenUr) _screenUr.classList.remove('on');

  if (sec === 'mesas') {
    screenMesas.classList.add('on');
    $('crumb').textContent = 'Mesas y zonas';
    deselectTable();
  } else if (sec === 'general') {
    screenGeneral.classList.add('on');
    $('crumb').textContent = 'General';
    if (!window._generalLoaded) { loadGeneral(); window._generalLoaded = true; }
  } else if (sec === 'usuarios') {
    var screenUr = $('screen-usuarios');
    if (screenUr) {
      screenUr.classList.add('on');
      $('crumb').textContent = 'Usuarios y roles';
      if (!window._urLoaded) { urInit(); window._urLoaded = true; }
    }
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

    // Actualizar branch
    await sb.from('branches').update({
      name: branchName, address: addr,
      city: city, phone: fullPhone, daily_goal: dailyGoal, country: country
    }).eq('id', branchId);

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

// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// USUARIOS Y ROLES — conectado a Supabase Auth + pos_roles
// ════════════════════════════════════════════════════════════

// SB_URL reutiliza la URL del cliente Supabase existente (pos-core.js)
var SB_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';

var UR_PERMS = [
  { group: 'Dashboard', items: [
    { id: 'dashboard.ver', label: 'Ver dashboard', desc: 'Acceder al panel de estadísticas y ventas del día' }
  ]},
  { group: 'Pedidos', items: [
    { id: 'pedidos.crear',     label: 'Tomar pedidos',          desc: 'Abrir mesas y crear comandas' },
    { id: 'pedidos.cocina',    label: 'Enviar a cocina',         desc: 'Mandar comandas a preparación' },
    { id: 'pedidos.cobrar',    label: 'Cobrar y procesar pagos', desc: 'Cerrar la cuenta y registrar el pago' },
    { id: 'pedidos.descuento', label: 'Aplicar descuentos',      desc: 'Modificar precios y dar cortesías' },
    { id: 'pedidos.anular',    label: 'Anular ítems y pedidos',  desc: 'Eliminar productos o cancelar comandas' }
  ]},
  { group: 'Catálogo', items: [
    { id: 'catalogo.ver',    label: 'Ver catálogo',         desc: 'Consultar el menú y precios' },
    { id: 'catalogo.editar', label: 'Gestionar productos',  desc: 'Crear y editar el menú y precios' }
  ]},
  { group: 'Ventas e IA', items: [
    { id: 'ventas.ver', label: 'Ver informes de ventas', desc: 'Acceder a reportes y cierres' },
    { id: 'chat.usar',  label: 'Usar asistente IA',      desc: 'Acceder al chat de inteligencia artificial' }
  ]},
  { group: 'Configuración', items: [
    { id: 'config.general',   label: 'Configuración general',     desc: 'Editar marca, sucursal y meta diaria' },
    { id: 'config.salon',     label: 'Configurar mesas y zonas',  desc: 'Editar el plano del salón' },
    { id: 'config.usuarios',  label: 'Gestionar usuarios y roles',desc: 'Administrar el equipo y permisos' }
  ]}
];
var UR_TOTAL_PERMS = 13;
var UR_SWATCH_COLORS = ['#5B6BFF','#0EA5E9','#10B981','#F59E0B','#F43F5E','#8B5CF6','#EC4899','#0D9488'];

// Marcas y sucursales — se leen de Supabase (branches del tenant)
// Por ahora estructura fija; se reemplaza en urInit con datos reales
var UR_BRANDS  = [];
var UR_ALL_SUCS = [];

var UR = { users: [], roles: [], brands: [], activeTab: 'usuarios', selectedUserId: null, selectedRoleId: null };

// ── Helpers ──────────────────────────────────────────────────
function urInitials(name) { var p=(name||'').trim().split(/\s+/); return (p[0]?p[0][0]:'')+(p[1]?p[1][0]:''); }
function urGenId(prefix) { return prefix+'_'+Date.now().toString(36); }
function urGenPass() {
  var ch='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; var s='';
  for(var i=0;i<8;i++) s+=ch[Math.floor(Math.random()*ch.length)]; return s;
}
function urRoleById(id) { return UR.roles.find(function(r){ return r.id===id; }); }
function urUserById(id) { return UR.users.find(function(u){ return u.id===id; }); }

function urShowToast(msg) {
  var t=$('toast'), m=$('toast-msg');
  if(!t||!m) return;
  m.textContent = msg||'Cambios guardados';
  t.removeAttribute('hidden');
  setTimeout(function(){ t.setAttribute('hidden',''); }, 2400);
}

// ── Edge Function helper — manage-user ───────────────────────
// Evita CORS al llamar Admin Auth API directamente desde el browser.
// La Edge Function corre server-side con service_role.
async function manageUser(payload) {
  var { data: { session } } = await sb.auth.getSession();
  var token = session ? session.access_token : SB_SVC;
  var res = await fetch(SB_URL + '/functions/v1/manage-user', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  var json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ── Carga inicial desde Supabase ─────────────────────────────
async function urLoad() {
  var tenantId = window._pos && window._pos.state ? window._pos.state.tenantId : null;
  if (!tenantId) {
    var { data: { user } } = await sb.auth.getUser();
    tenantId = user && user.user_metadata && user.user_metadata.tenant_id;
  }

  // Roles
  var rolesRes = await sb.from('pos_roles').select('*').eq('tenant_id', tenantId).order('created_at');
  UR.roles = (rolesRes.data || []).map(function(r){
    return { id: r.id, name: r.name, color: r.color, system: r.system_role, perms: r.perms || [] };
  });

  // Usuarios (pos_users) — solo los del tenant
  var { data: { user: me } } = await sb.auth.getUser();
  var branchId = me && me.user_metadata && me.user_metadata.branch_id;
  var usersRes = await sb.from('pos_users').select('*').eq('branch_id', branchId);
  UR.users = (usersRes.data || []).map(function(u){
    var role = UR.roles.find(function(r){ return r.id === u.role_id; });
    return {
      id:          u.id,
      authId:      u.auth_user_id || null,
      name:        u.name || '',
      email:       u.email || '',
      pass:        u.pass_temp || '',
      roleId:      u.role_id || (role ? role.id : (UR.roles[0]||{}).id),
      sucursales:  u.sucursales || [],
      active:      u.active !== false
    };
  });

  // Branches para el selector de sucursales
  var brandsRes = await sb.from('brands').select('id,name').eq('tenant_id', tenantId);
  var branchesRes = await sb.from('branches').select('id,name,address,brand_id').eq('tenant_id', tenantId);
  UR_BRANDS = (brandsRes.data || []).map(function(brand){
    return {
      id: brand.id,
      name: brand.name,
      sucursales: (branchesRes.data || [])
        .filter(function(b){ return b.brand_id === brand.id; })
        .map(function(b){ return { id: b.id, name: b.name, addr: b.address||'' }; })
    };
  });
  UR_ALL_SUCS = UR_BRANDS.reduce(function(a,m){ return a.concat(m.sucursales); }, []);
}

// ── Crear usuario en Auth + pos_users ────────────────────────
async function urCreateAuthUser(u, tenantId, branchId) {
  var role = urRoleById(u.roleId);
  // 1. Crear en Supabase Auth via Edge Function (evita CORS)
  var authRes = await manageUser({
    action: 'create',
    email: u.email,
    password: u.pass || urGenPass(),
    metadata: {
      tenant_id: tenantId,
      branch_id: branchId,
      role: role ? role.name.toLowerCase() : 'empleado',
      nombre: u.name
    }
  });
  if (!authRes.id) throw new Error('Error creando usuario en Auth');
  var authUserId = authRes.id;

  // 2. Insertar en pos_users — UUIDs vacíos → null para evitar error de tipo
  var insertRes = await sb.from('pos_users').insert({
    name:         u.name,
    email:        u.email,
    phone:        '',
    role:         role ? role.name.toLowerCase() : 'empleado',
    role_id:      u.roleId  || null,
    branch_id:    branchId  || null,
    active:       u.active !== false,
    sucursales:   u.sucursales || [],
    auth_user_id: authUserId   || null,
    pass_temp:    u.pass
  }).select().single();

  if (insertRes.error) throw new Error(insertRes.error.message);
  return insertRes.data;
}

// ── Actualizar usuario ────────────────────────────────────────
async function urUpdateAuthUser(u) {
  var role = urRoleById(u.roleId);
  // Actualizar pos_users
  var upd = {
    name:       u.name,
    email:      u.email,
    role:       role ? role.name.toLowerCase() : 'empleado',
    role_id:    u.roleId || null,
    active:     u.active !== false,
    sucursales: u.sucursales || [],
    pass_temp:  u.pass
  };
  await sb.from('pos_users').update(upd).eq('id', u.id);

  // Actualizar Auth si tiene authId
  if (u.authId) {
    var authUpd = {
      email: u.email,
      user_metadata: { nombre: u.name, role: upd.role }
    };
    if (u.pass && u.pass.length >= 6) authUpd.password = u.pass;
    await manageUser({ action: 'update', userId: u.authId, email: authUpd.email, password: authUpd.password, metadata: authUpd.user_metadata });
  }
}

// ── Eliminar usuario ──────────────────────────────────────────
async function urDeleteAuthUser(u) {
  await sb.from('pos_users').delete().eq('id', u.id);
  if (u.authId) {
    await manageUser({ action: 'delete', userId: u.authId });
  }
}

// ── Guardar rol ────────────────────────────────────────────────
async function urSaveRole(r) {
  var tenantId = window._pos && window._pos.state ? window._pos.state.tenantId : null;
  if (!tenantId) {
    var { data: { user } } = await sb.auth.getUser();
    tenantId = user && user.user_metadata && user.user_metadata.tenant_id;
  }
  if (r._isNew) {
    delete r._isNew;
    var res = await sb.from('pos_roles').insert({
      tenant_id: tenantId, name: r.name, color: r.color,
      system_role: !!r.system, perms: r.perms
    }).select().single();
    if (res.data) r.id = res.data.id;
  } else {
    await sb.from('pos_roles').update({
      name: r.name, color: r.color, perms: r.perms
    }).eq('id', r.id);
  }
}

// ── Eliminar rol ───────────────────────────────────────────────
async function urDeleteRoleDb(id) {
  await sb.from('pos_roles').delete().eq('id', id);
}

// ── Tabs ─────────────────────────────────────────────────────
function urSetTab(tab) {
  UR.activeTab = tab;
  UR.selectedUserId = null;
  UR.selectedRoleId = null;
  ['usuarios','roles'].forEach(function(t){
    var btn=$('ur-tab-'+t); if(btn) btn.classList.toggle('on', t===tab);
    var scr=$('ur-screen-'+t); if(scr) scr.classList.toggle('on', t===tab);
  });
  var addLbl=$('ur-btn-add-label'); if(addLbl) addLbl.textContent = tab==='usuarios'?'Nuevo usuario':'Nuevo rol';
  var addBtn=$('ur-btn-add'); if(addBtn) addBtn.dataset.uradd = tab==='usuarios'?'usuario':'rol';
  urShowDefaultPane(tab);
}

function urShowDefaultPane(tab) {
  ['ur-pane-team','ur-pane-user','ur-pane-roles','ur-pane-role'].forEach(function(id){ var el=$(id); if(el) el.classList.remove('on'); });
  var el = $(tab==='usuarios' ? 'ur-pane-team' : 'ur-pane-roles'); if(el) el.classList.add('on');
}

function urShowPane(pane) {
  ['ur-pane-team','ur-pane-user','ur-pane-roles','ur-pane-role'].forEach(function(id){ var el=$(id); if(el) el.classList.remove('on'); });
  var el=$(pane); if(el) el.classList.add('on');
}

// ── Render lista usuarios ─────────────────────────────────────
function urRenderUsers() {
  var list=$('ur-list-usuarios'); if(!list) return;
  var n=$('ur-n-usuarios'); if(n) n.textContent=UR.users.length;
  list.innerHTML='';
  UR.users.forEach(function(u){
    var role=urRoleById(u.roleId), color=role?role.color:'#94A3B8';
    var avatarBg=u.active?color:'#CBD5E1';
    var sucs=u.sucursales||[];
    var allSucNames = UR_ALL_SUCS.length ? UR_ALL_SUCS : [];
    var chips=sucs.slice(0,2).map(function(sid){
      var s=allSucNames.find(function(x){return x.id===sid;});
      return s?'<span class="cf-chip">'+s.name+'</span>':'';
    }).join('');
    if(sucs.length>2) chips+='<span class="cf-chip more">+'+(sucs.length-2)+'</span>';
    if(!sucs.length) chips='<span style="font-size:11px;color:#CBD5E1;font-weight:600">Sin acceso</span>';
    var statusHtml=u.active
      ?'<span class="cf-status-ur on"><span class="dot"></span>Activo</span>'
      :'<span class="cf-status-ur"><span class="dot"></span>Inactivo</span>';
    var pillHtml=role?'<span class="cf-pill-ur" style="color:'+color+';background:'+color+'1A"><span class="dot" style="background:'+color+'"></span>'+role.name+'</span>':'';
    var row=document.createElement('button');
    row.className='cf-userrow'+(u.id===UR.selectedUserId?' on':'');
    row.dataset.userid=u.id;
    row.innerHTML=
      '<span class="cf-avatar" style="background:'+avatarBg+'">'+urInitials(u.name)+'</span>'+
      '<span class="cf-userrow-main">'+
        '<span class="cf-userrow-l1"><span class="cf-userrow-name">'+(u.name||'')+'</span>'+pillHtml+'<span class="cf-userrow-spacer"></span>'+statusHtml+'</span>'+
        '<span class="cf-userrow-l2">'+
          '<span class="cf-userrow-mail"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>'+(u.email||'')+'</span>'+
          '<span class="cf-dotsep"></span><span class="cf-chips">'+chips+'</span>'+
        '</span>'+
      '</span>'+
      '<span class="cf-chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>';
    row.addEventListener('click', function(){ urSelectUser(u.id); });
    list.appendChild(row);
  });
  var addBtn=document.createElement('button');
  addBtn.className='cf-add';
  addBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar usuario';
  addBtn.addEventListener('click', function(){ urAddUser(); });
  list.appendChild(addBtn);
  urUpdateTeamSummary();
}

// ── Render lista roles ────────────────────────────────────────
function urRenderRoles() {
  var list=$('ur-list-roles'); if(!list) return;
  var n=$('ur-n-roles'); if(n) n.textContent=UR.roles.length;
  list.innerHTML='';
  UR.roles.forEach(function(r){
    var cnt=UR.users.filter(function(u){ return u.roleId===r.id; }).length;
    var row=document.createElement('button');
    row.className='cf-rolerow'+(r.id===UR.selectedRoleId?' on':'');
    row.innerHTML=
      '<span class="cf-roleicon" style="color:'+r.color+';background:'+r.color+'1A"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>'+
      '<span class="cf-rolerow-main">'+
        '<span class="cf-rolerow-l1"><span class="cf-rolerow-name">'+r.name+'</span>'+(r.system?'<span class="cf-systag">Sistema</span>':'')+'</span>'+
        '<span class="cf-rolerow-sub">'+(r.perms||[]).length+' de '+UR_TOTAL_PERMS+' permisos</span>'+
      '</span>'+
      '<span class="cf-countpill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> '+cnt+'</span>'+
      '<span class="cf-chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>';
    row.addEventListener('click', function(){ urSelectRole(r.id); });
    list.appendChild(row);
  });
  var addBtn=document.createElement('button');
  addBtn.className='cf-add';
  addBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Crear rol';
  addBtn.addEventListener('click', function(){ urAddRole(); });
  list.appendChild(addBtn);
  urUpdateRolesSummary();
}

// ── Resúmenes ─────────────────────────────────────────────────
function urUpdateTeamSummary() {
  var t=$('ur-stat-total'); if(t) t.textContent=UR.users.length;
  var a=$('ur-stat-activos'); if(a) a.textContent=UR.users.filter(function(u){return u.active;}).length;
  var legend=$('ur-legend-roles');
  if(legend){
    legend.innerHTML='';
    UR.roles.forEach(function(r){
      var cnt=UR.users.filter(function(u){return u.roleId===r.id;}).length;
      if(!cnt) return;
      var row=document.createElement('div'); row.className='cf-legendrow';
      row.innerHTML='<span class="cf-legenddot" style="background:'+r.color+'"></span><span class="cf-legendname">'+r.name+'</span><span class="cf-statlbl">'+cnt+' usuario'+(cnt>1?'s':'')+'</span>';
      legend.appendChild(row);
    });
  }
}

function urUpdateRolesSummary() {
  var sr=$('ur-stat-roles'); if(sr) sr.textContent=UR.roles.length;
  var legend=$('ur-legend-roles-list');
  if(legend){
    legend.innerHTML='';
    UR.roles.forEach(function(r){
      var row=document.createElement('div'); row.className='cf-legendrow clickable';
      row.innerHTML='<span class="cf-roleicon sm" style="color:'+r.color+';background:'+r.color+'1A"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span><span class="cf-legendname">'+r.name+'</span><span class="cf-statlbl">'+(r.perms||[]).length+' permisos</span>';
      row.addEventListener('click', function(){ urSelectRole(r.id); });
      legend.appendChild(row);
    });
  }
}

// ── Inspector usuario ─────────────────────────────────────────
function urSelectUser(id) {
  UR.selectedUserId=id; UR.selectedRoleId=null;
  urRenderUsers();
  var u=urUserById(id); if(!u) return;
  var role=urRoleById(u.roleId), color=role?role.color:'#94A3B8';
  var av=$('ur-user-avatar'); if(av){ av.textContent=urInitials(u.name); av.style.background=u.active?color:'#CBD5E1'; }
  var ti=$('ur-user-title'); if(ti) ti.textContent=u.name||'–';
  var nm=$('ur-u-name');  if(nm) nm.value=u.name||'';
  var em=$('ur-u-email'); if(em) em.value=u.email||'';
  var ps=$('ur-u-pass');  if(ps) ps.value=u.pass||'';
  // Rol select
  var sel=$('ur-u-rol');
  if(sel){
    sel.innerHTML='';
    UR.roles.forEach(function(r){
      var opt=document.createElement('option');
      opt.value=r.id; opt.textContent=r.name;
      if(r.id===u.roleId) opt.selected=true;
      sel.appendChild(opt);
    });
    urUpdateRolDot(u.roleId);
    sel.onchange=function(){
      u.roleId=sel.value; urUpdateRolDot(sel.value);
      urRenderUsers();
    };
  }
  urSetUserStateUI(u);
  var sw=$('ur-u-state-sw');
  if(sw) sw.onclick=function(){
    u.active=!u.active; urSetUserStateUI(u); urRenderUsers();
  };
  urRenderAccessPanel(u);
  var nameIn=$('ur-u-name');
  if(nameIn) nameIn.oninput=function(){
    u.name=nameIn.value;
    var av2=$('ur-user-avatar'); if(av2) av2.textContent=urInitials(u.name);
    var ti2=$('ur-user-title'); if(ti2) ti2.textContent=u.name||'–';
    urRenderUsers();
  };
  var emailIn=$('ur-u-email');
  if(emailIn) emailIn.oninput=function(){ u.email=emailIn.value; };
  var passIn=$('ur-u-pass');
  if(passIn) passIn.oninput=function(){ u.pass=passIn.value; };
  // Botón "Crear usuario" — visible solo para usuarios nuevos
  // Botones footer según estado usuario
  var confirmBtn=$('ur-u-confirm'), cancelBtn=$('ur-u-cancel');
  var saveBtn=$('ur-u-save'), dupBtn=$('ur-u-dup'), delBtn=$('ur-u-del');
  if(u._isNew){
    if(confirmBtn){ confirmBtn.style.display=''; confirmBtn.onclick=function(){ urConfirmCreateUser(u); }; }
    if(cancelBtn) { cancelBtn.style.display=''; cancelBtn.onclick=function(){ urCancelNewUser(u); }; }
    if(saveBtn)   saveBtn.style.display='none';
    if(dupBtn)    dupBtn.style.display='none';
    if(delBtn)    delBtn.style.display='none';
  } else {
    if(confirmBtn) confirmBtn.style.display='none';
    if(cancelBtn)  cancelBtn.style.display='none';
    if(saveBtn)   { saveBtn.style.display=''; saveBtn.onclick=function(){ urSaveExistingUser(u); }; }
    if(dupBtn)    dupBtn.style.display='';
    if(delBtn)    delBtn.style.display='';
  }
  urShowPane('ur-pane-user');
}

var _urSaveTimer = {};
// urSaveUserDebounced eliminado — guardado solo por botón explícito

function urUpdateRolDot(roleId) {
  var role=urRoleById(roleId), dot=$('ur-u-rol-dot');
  if(dot&&role) dot.style.background=role.color;
}

function urSetUserStateUI(u) {
  var sw=$('ur-u-state-sw'), dot=$('ur-u-state-dot'), txt=$('ur-u-state-txt');
  if(sw)  sw.classList.toggle('on', u.active);
  if(dot){ dot.classList.toggle('on', u.active); }
  if(txt){ txt.classList.toggle('on', u.active); txt.textContent=u.active?'Activo':'Inactivo'; }
}

function urRenderAccessPanel(u) {
  var total=UR_ALL_SUCS.length, cnt=(u.sucursales||[]).length;
  var countEl=$('ur-u-access-count'); if(countEl) countEl.textContent=cnt+' de '+total;
  var totalEl=$('ur-u-access-total'); if(totalEl) totalEl.textContent=total;
  urUpdateMasterCheck(u);
  var master=$('ur-u-access-all');
  if(master) master.onclick=function(){
    var allSelected=(u.sucursales||[]).length===total;
    u.sucursales=allSelected?[]:UR_ALL_SUCS.map(function(s){return s.id;});
    urRenderAccessPanel(u); urRenderUsers();
  };
  var marcasEl=$('ur-u-marcas'); if(!marcasEl) return;
  marcasEl.innerHTML='';
  UR_BRANDS.forEach(function(brand){
    var div=document.createElement('div'); div.className='cf-marca';
    var allBrandSucs=brand.sucursales.map(function(s){return s.id;});
    var selBrand=allBrandSucs.filter(function(sid){return (u.sucursales||[]).indexOf(sid)>=0;}).length;
    var bs=selBrand===0?'':(selBrand===allBrandSucs.length?'on':'partial');
    var bChk=bs==='on'?'<span class="cf-check on"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>':bs==='partial'?'<span class="cf-check partial"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"/></svg></span>':'<span class="cf-check"></span>';
    var sucItems=brand.sucursales.map(function(s){
      var isOn=(u.sucursales||[]).indexOf(s.id)>=0;
      return '<button class="cf-access-suc'+(isOn?' on':'')+'" data-suc="'+s.id+'">'+
        (isOn?'<span class="cf-check on"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>':'<span class="cf-check"></span>')+
        '<span class="cf-suc-main"><span class="cf-suc-name">'+s.name+'</span><span class="cf-suc-addr">'+s.addr+'</span></span>'+
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg></button>';
    }).join('');
    div.innerHTML=
      '<button class="cf-marca-head" data-marca="'+brand.id+'">'+bChk+
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/><path d="M8 21v-6h4v6"/></svg>'+
      '<span class="cf-marca-name">'+brand.name+'</span><span class="cf-marca-n">'+selBrand+'/'+allBrandSucs.length+'</span></button>'+
      '<div class="cf-marca-list">'+sucItems+'</div>';
    div.querySelector('.cf-marca-head').addEventListener('click', function(){
      var allSel=allBrandSucs.every(function(sid){return (u.sucursales||[]).indexOf(sid)>=0;});
      if(allSel){ u.sucursales=(u.sucursales||[]).filter(function(sid){return allBrandSucs.indexOf(sid)<0;}); }
      else { allBrandSucs.forEach(function(sid){ if((u.sucursales||[]).indexOf(sid)<0) u.sucursales.push(sid); }); }
      urRenderAccessPanel(u); urRenderUsers();
    });
    div.querySelectorAll('.cf-access-suc').forEach(function(btn){
      btn.addEventListener('click', function(){
        var sid=btn.dataset.suc, idx=(u.sucursales||[]).indexOf(sid);
        if(idx>=0) u.sucursales.splice(idx,1); else { if(!u.sucursales) u.sucursales=[]; u.sucursales.push(sid); }
        urRenderAccessPanel(u); urRenderUsers();
      });
    });
    marcasEl.appendChild(div);
  });
}

function urUpdateMasterCheck(u) {
  var total=UR_ALL_SUCS.length, cnt=(u.sucursales||[]).length, el=$('ur-u-master-chk');
  if(!el) return;
  if(cnt===0){ el.className='cf-check'; el.innerHTML=''; }
  else if(cnt===total){ el.className='cf-check on'; el.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'; }
  else { el.className='cf-check partial'; el.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"/></svg>'; }
  var countEl=$('ur-u-access-count'); if(countEl) countEl.textContent=cnt+' de '+total;
}

// ── Inspector rol ─────────────────────────────────────────────
function urSelectRole(id) {
  UR.selectedRoleId=id; UR.selectedUserId=null;
  urRenderRoles();
  var r=urRoleById(id); if(!r) return;
  var icon=$('ur-role-icon');
  if(icon){ icon.style.color=r.color; icon.style.background=r.color+'1A'; }
  var ey=$('ur-role-eyebrow'); if(ey) ey.textContent=r.system?'Rol del sistema':'Rol';
  var ti=$('ur-role-title'); if(ti) ti.textContent=r.name;
  var nm=$('ur-r-name');
  if(nm){ nm.value=r.name; nm.oninput=function(){ r.name=nm.value; var t2=$('ur-role-title');if(t2)t2.textContent=r.name; urRenderRoles(); }; }
  document.querySelectorAll('#ur-r-swatches .cf-swatch').forEach(function(sw){
    sw.classList.toggle('on', sw.dataset.color===r.color);
    sw.onclick=function(){
      r.color=sw.dataset.color;
      document.querySelectorAll('#ur-r-swatches .cf-swatch').forEach(function(s){s.classList.toggle('on',s.dataset.color===r.color);});
      var ic=$('ur-role-icon'); if(ic){ic.style.color=r.color;ic.style.background=r.color+'1A';}
      urRenderRoles();
    };
  });
  urRenderPerms(r);
  var foot=$('ur-role-foot');
  if(foot){
    var delBtn=$('ur-r-del');
    if(r.system){ if(delBtn) delBtn.style.display='none';
      if(!foot.querySelector('.cf-lockednote')){ var ln=document.createElement('div'); ln.className='cf-lockednote'; ln.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Rol del sistema'; foot.appendChild(ln); }
    } else {
      if(delBtn) delBtn.style.display='';
      var ln2=foot.querySelector('.cf-lockednote'); if(ln2) ln2.remove();
    }
  }
  // Botones footer según estado del rol
  var rConfirm=$('ur-r-confirm'), rCancel=$('ur-r-cancel'), rSave=$('ur-r-save');
  var rDup=$('ur-r-dup'), rDel=$('ur-r-del');
  if(r._isNew){
    if(rConfirm) rConfirm.style.display='';
    if(rCancel)  rCancel.style.display='';
    if(rSave)    rSave.style.display='none';
    if(rDup)     rDup.style.display='none';
    if(rDel)     rDel.style.display='none';
  } else {
    if(rConfirm) rConfirm.style.display='none';
    if(rCancel)  rCancel.style.display='none';
    if(rSave)    rSave.style.display='';
    if(rDup)     rDup.style.display='';
    if(rDel)     rDel.style.display='';
  }
  urShowPane('ur-pane-role');
}

var _urRoleTimer = {};
// urSaveRoleDebounced eliminado — guardado solo por botón explícito

// ── Confirmar guardado de rol nuevo ──────────────────────────
async function urConfirmSaveRole(r) {
  if (!r.name || !r.name.trim()) { urShowToast('Escribe un nombre para el rol'); return; }
  var btn=$('ur-r-confirm'); if(btn){ btn.disabled=true; btn.textContent='Guardando…'; }
  try {
    await urSaveRole(r);
    // Mostrar botones de rol existente
    var rConfirm=$('ur-r-confirm'), rCancel=$('ur-r-cancel'), rSave=$('ur-r-save');
    var rDup=$('ur-r-dup'), rDel=$('ur-r-del');
    if(rConfirm) rConfirm.style.display='none';
    if(rCancel)  rCancel.style.display='none';
    if(rSave)    rSave.style.display='';
    if(rDup)     rDup.style.display='';
    if(rDel)     rDel.style.display='';
    urRenderRoles();
    urShowToast('Rol creado ✓');
  } catch(e) {
    var btn2=$('ur-r-confirm'); if(btn2){ btn2.disabled=false; btn2.textContent='Guardar rol'; }
    urShowToast('Error: ' + e.message);
  }
}

// ── Cancelar rol nuevo (descartarlo) ─────────────────────────
function urCancelNewRole(r) {
  UR.roles = UR.roles.filter(function(x){ return x.id !== r.id; });
  UR.selectedRoleId = null;
  urRenderRoles();
  urShowDefaultPane('roles');
}

// ── Guardar cambios de rol existente ─────────────────────────
async function urSaveExistingRole(r) {
  var btn=$('ur-r-save'); if(btn){ btn.disabled=true; btn.textContent='Guardando…'; }
  try {
    await urSaveRole(r);
    urRenderRoles();
    urShowToast('Rol guardado ✓');
  } catch(e) {
    urShowToast('Error: ' + e.message);
  } finally {
    var btn2=$('ur-r-save'); if(btn2){ btn2.disabled=false; btn2.textContent='Guardar cambios'; }
  }
}

// ── Cancelar usuario nuevo (descartarlo) ─────────────────────
function urCancelNewUser(u) {
  UR.users = UR.users.filter(function(x){ return x.id !== u.id; });
  UR.selectedUserId = null;
  urRenderUsers();
  urShowDefaultPane('usuarios');
}

// ── Guardar cambios de usuario existente ─────────────────────
async function urSaveExistingUser(u) {
  var btn=$('ur-u-save'); if(btn){ btn.disabled=true; btn.textContent='Guardando…'; }
  try {
    await urUpdateAuthUser(u);
    urRenderUsers();
    urShowToast('Usuario guardado ✓');
  } catch(e) {
    urShowToast('Error: ' + e.message);
  } finally {
    var btn2=$('ur-u-save'); if(btn2){ btn2.disabled=false; btn2.textContent='Guardar cambios'; }
  }
}

function urRenderPerms(r) {
  var container=$('ur-r-perms'); if(!container) return;
  var perms=r.perms||[];
  var sub=$('ur-perm-sub'); if(sub) sub.textContent=perms.length+' de '+UR_TOTAL_PERMS+' permisos activos';
  var allBtn=$('ur-perm-all-toggle');
  var allIds=UR_PERMS.reduce(function(a,g){return a.concat(g.items.map(function(i){return i.id;}));},[]);
  if(allBtn){
    allBtn.textContent=perms.length===UR_TOTAL_PERMS?'Quitar todos':'Activar todos';
    allBtn.onclick=function(){
      r.perms=r.perms.length===UR_TOTAL_PERMS?[]:allIds.slice();
      urRenderPerms(r); urRenderRoles();
    };
  }
  container.innerHTML='';
  UR_PERMS.forEach(function(group){
    var active=group.items.filter(function(i){return perms.indexOf(i.id)>=0;}).length;
    var wrap=document.createElement('div'); wrap.className='cf-permgroup-wrap';
    var items=group.items.map(function(perm){
      var on=perms.indexOf(perm.id)>=0;
      return '<div class="cf-perm" data-permid="'+perm.id+'"><div class="cf-perm-main"><div class="cf-perm-label">'+perm.label+'</div><div class="cf-perm-desc">'+perm.desc+'</div></div><button type="button" class="cf-switch'+(on?' on':'')+'" aria-pressed="'+(on?'true':'false')+'"></button></div>';
    }).join('');
    wrap.innerHTML='<div class="cf-permgroup"><span>'+group.group+'</span><span class="cf-permgroup-n">'+active+'/'+group.items.length+'</span></div>'+items;
    wrap.querySelectorAll('.cf-perm').forEach(function(pDiv){
      var sw=pDiv.querySelector('.cf-switch'), pid=pDiv.dataset.permid;
      sw.addEventListener('click', function(){
        var idx=r.perms.indexOf(pid);
        if(idx>=0) r.perms.splice(idx,1); else r.perms.push(pid);
        sw.classList.toggle('on',r.perms.indexOf(pid)>=0);
        sw.setAttribute('aria-pressed',r.perms.indexOf(pid)>=0?'true':'false');
        var sub2=$('ur-perm-sub'); if(sub2) sub2.textContent=r.perms.length+' de '+UR_TOTAL_PERMS+' permisos activos';
        var aBtn=$('ur-perm-all-toggle'); if(aBtn) aBtn.textContent=r.perms.length===UR_TOTAL_PERMS?'Quitar todos':'Activar todos';
        var ng=wrap.querySelector('.cf-permgroup-n');
        var an=group.items.filter(function(i){return r.perms.indexOf(i.id)>=0;}).length;
        if(ng) ng.textContent=an+'/'+group.items.length;
        urRenderRoles();
      });
    });
    container.appendChild(wrap);
  });
}

// ── CRUD ─────────────────────────────────────────────────────
async function urAddUser() {
  var defaultRole=UR.roles.find(function(r){return !r.system;})||UR.roles[0];
  var u={ id: urGenId('u'), name:'', email:'', pass: urGenPass(), roleId: defaultRole?defaultRole.id:'', sucursales:[], active:true, _isNew:true };
  UR.users.push(u);
  urRenderUsers();
  urSelectUser(u.id);
}

async function urConfirmCreateUser(u) {
  if (!u._isNew) return;
  if (!u.email || !u.pass) { urShowToast('Completa correo y contraseña primero'); return; }
  try {
    var { data: { user: me } } = await sb.auth.getUser();
    var tenantId = me.user_metadata.tenant_id;
    var branchId = me.user_metadata.branch_id;
    // role_id inválido → null (manejado en el insert con || null)
    var dbUser = await urCreateAuthUser(u, tenantId, branchId);
    u.id = dbUser.id;
    u.authId = dbUser.auth_user_id;
    delete u._isNew;
    // Restaurar botones footer
    var cb=$('ur-u-confirm'); if(cb) cb.style.display='none';
    var db=$('ur-u-dup'); if(db) db.style.display='';
    var dl=$('ur-u-del'); if(dl) dl.style.display='';
    urRenderUsers();
    urShowToast('Usuario creado ✓');
  } catch(e) {
    urShowToast('Error: ' + e.message);
  }
}

async function urAddRole() {
  var usedColors=UR.roles.map(function(r){return r.color;});
  var nextColor=UR_SWATCH_COLORS.find(function(c){return usedColors.indexOf(c)<0;})||UR_SWATCH_COLORS[0];
  var r={ id: urGenId('r'), name:'Nuevo rol', color:nextColor, system:false, perms:[], _isNew:true };
  UR.roles.push(r);
  urRenderRoles();
  urSelectRole(r.id);
  // Guardar en Supabase inmediatamente; tras guardar, actualizar cualquier selector de rol abierto
  urSaveRole(r).then(function(){
    urRenderRoles();
    // Si hay un usuario nuevo abierto cuyo roleId aún es el temp, actualizarlo al UUID real
    if (UR.selectedUserId) {
      var u = urUserById(UR.selectedUserId);
      if (u && u.roleId && u.roleId === r.id) {
        // r.id ya fue actualizado por urSaveRole al UUID real
        var sel = document.getElementById('ur-u-rol');
        if (sel) { sel.innerHTML=''; UR.roles.forEach(function(rx){ var o=document.createElement('option'); o.value=rx.id; o.textContent=rx.name; if(rx.id===u.roleId) o.selected=true; sel.appendChild(o); }); }
      }
    }
  }).catch(function(e){ urShowToast('Error guardando rol: '+e.message); });
}

async function urDeleteUser(id) {
  var u=urUserById(id); if(!u) return;
  try {
    if(!u._isNew) await urDeleteAuthUser(u);
    UR.users=UR.users.filter(function(x){return x.id!==id;});
    UR.selectedUserId=null;
    urRenderUsers(); urShowDefaultPane('usuarios');
    urShowToast('Usuario eliminado');
  } catch(e){ urShowToast('Error: '+e.message); }
}

async function urDeleteRole(id) {
  var r=urRoleById(id); if(!r) return;
  if(r.system){ urShowToast('No puedes eliminar un rol del sistema'); return; }
  var cnt=UR.users.filter(function(u){return u.roleId===id;}).length;
  if(cnt>0){ urShowToast('Reasigna los '+cnt+' usuarios primero'); return; }
  try {
    await urDeleteRoleDb(id);
    UR.roles=UR.roles.filter(function(x){return x.id!==id;});
    UR.selectedRoleId=null;
    urRenderRoles(); urShowDefaultPane('roles');
    urShowToast('Rol eliminado');
  } catch(e){ urShowToast('Error: '+e.message); }
}

async function urDupUser(id) {
  var u=urUserById(id); if(!u) return;
  var clone=JSON.parse(JSON.stringify(u));
  clone.id=urGenId('u'); clone.name=(u.name||'Usuario')+' (copia)';
  clone.email=''; clone.pass=urGenPass(); clone._isNew=true;
  UR.users.push(clone);
  urRenderUsers(); urSelectUser(clone.id);
}

async function urDupRole(id) {
  var r=urRoleById(id); if(!r) return;
  var clone=JSON.parse(JSON.stringify(r));
  clone.id=urGenId('r'); clone.name=r.name+' (copia)'; clone.system=false; clone._isNew=true;
  UR.roles.push(clone);
  urSaveRole(clone).then(function(){ urRenderRoles(); urSelectRole(clone.id); });
}

function urBindPassControls() {
  var tog=$('ur-pass-toggle'), gen=$('ur-pass-gen'), inp=$('ur-u-pass');
  if(tog&&inp) tog.onclick=function(){ inp.type=inp.type==='password'?'text':'password'; };
  if(gen&&inp) gen.onclick=function(){
    var np=urGenPass(); inp.value=np; inp.type='text';
    var u=urUserById(UR.selectedUserId);
    if(u){ u.pass=np; }
  };
}

// ── Init ─────────────────────────────────────────────────────
async function urInit() {
  // Mostrar loading
  var list=$('ur-list-usuarios'); if(list) list.innerHTML='<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px">Cargando...</div>';

  await urLoad();

  // Tabs
  document.querySelectorAll('[data-urtab]').forEach(function(btn){
    btn.addEventListener('click', function(){ urSetTab(btn.dataset.urtab); });
  });
  // Botón nuevo
  var addBtn=$('ur-btn-add');
  if(addBtn) addBtn.addEventListener('click', function(){ if(UR.activeTab==='usuarios') urAddUser(); else urAddRole(); });
  // Cerrar
  var cU=$('ur-close-user'); if(cU) cU.addEventListener('click', function(){ UR.selectedUserId=null; urRenderUsers(); urShowDefaultPane('usuarios'); });
  var cR=$('ur-close-role'); if(cR) cR.addEventListener('click', function(){ UR.selectedRoleId=null; urRenderRoles(); urShowDefaultPane('roles'); });
  // Dup / Del
  var uD=$('ur-u-dup'); if(uD) uD.addEventListener('click', function(){ if(UR.selectedUserId) urDupUser(UR.selectedUserId); });
  var uDel=$('ur-u-del'); if(uDel) uDel.addEventListener('click', function(){
    if(!UR.selectedUserId) return;
    var u=urUserById(UR.selectedUserId);
    if(u && u._isNew){ UR.users=UR.users.filter(function(x){return x.id!==UR.selectedUserId;}); UR.selectedUserId=null; urRenderUsers(); urShowDefaultPane('usuarios'); }
    else urDeleteUser(UR.selectedUserId);
  });
  var rD=$('ur-r-dup'); if(rD) rD.addEventListener('click', function(){ if(UR.selectedRoleId) urDupRole(UR.selectedRoleId); });
  var rDel=$('ur-r-del'); if(rDel) rDel.addEventListener('click', function(){ if(UR.selectedRoleId) urDeleteRole(UR.selectedRoleId); });
  // Botones rol: Guardar rol nuevo / Cancelar / Guardar cambios
  var rConfirmBtn=$('ur-r-confirm');
  if(rConfirmBtn) rConfirmBtn.addEventListener('click', function(){
    var r=urRoleById(UR.selectedRoleId); if(r) urConfirmSaveRole(r);
  });
  var rCancelBtn=$('ur-r-cancel');
  if(rCancelBtn) rCancelBtn.addEventListener('click', function(){
    var r=urRoleById(UR.selectedRoleId); if(r) urCancelNewRole(r);
  });
  var rSaveBtn=$('ur-r-save');
  if(rSaveBtn) rSaveBtn.addEventListener('click', function(){
    var r=urRoleById(UR.selectedRoleId); if(r) urSaveExistingRole(r);
  });
  // Guardado de usuario nuevo: via botón ur-u-confirm (ver urSelectUser)
  urBindPassControls();
  urRenderUsers();
  urRenderRoles();
  urSetTab('usuarios');
}
