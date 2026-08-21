﻿/* configuracion.js — Mesas y zonas · Cobra POS */
/* Depende de: pos-core.js (sb, $) */

// ── Estado ──────────────────────────────────────────────
var STORAGE_KEY = 'pos.config.salon.v1';

// Semilla mínima y genérica — SOLO se usa cuando un negocio nuevo no tiene
// NINGÚN dato ni en la base ni en la caché local. (Antes traía "Barra" y
// "Terraza" por defecto, que aparecían como zonas/mesas fantasma.)
var SEED = {
  zones: [
    { id: 'z_adentro', name: 'Adentro'    },
    { id: 'z_ante',    name: 'Antejardín' }
  ],
  tables: [
    { id: 't01', zoneId: 'z_adentro', name: '01', seats: 4 },
    { id: 't02', zoneId: 'z_adentro', name: '02', seats: 4 },
    { id: 't03', zoneId: 'z_adentro', name: '03', seats: 4 },
    { id: 't04', zoneId: 'z_adentro', name: '04', seats: 4 }
  ]
};

var S = {
  zones: [],
  tables: [],
  activeZone: null,
  selectedTable: null
};

// ── Persistencia ────────────────────────────────────────
// FUENTE DE VERDAD = la base (pos_tables). La memoria local es solo caché.
// NUNCA se borra en masa por diferencia contra la copia local (eso causaba
// que abrir Configuración en un equipo con memoria vacía borrara las mesas
// reales de todos). Ver #13 en ESTADO-SISTEMA.md.
/* ── Quién tiene la sesión abierta ────────────────────────────────────────
   sb.auth.getUser() SALE A INTERNET a preguntárselo al servidor. Esta pantalla
   lo hacía doce veces, y lo único que necesita —el restaurante, la sucursal y
   el rol— ya viene dentro de la sesión que está guardada en el equipo.
   Medido en la conexión de Popayán: entre 350 y 700 ms cada viaje. */
async function cfgUsuario() {
  try {
    var r = await sb.auth.getSession();
    return (r && r.data && r.data.session && r.data.session.user) || null;
  } catch (e) { return null; }
}

async function loadState() {
  // 1) Cargar desde la base — manda lo que hay en Configuración/BD
  try {
    var user = await cfgUsuario();
    var branchId = user && user.user_metadata && user.user_metadata.branch_id;
    if (branchId) {
      _cfgBranchId = branchId;
      var tRes = await sb.from('pos_tables')
        .select('id,name,capacity,zone_id,zone_name,sort_order')
        .eq('branch_id', branchId)
        .order('sort_order', { ascending: true });
      if (tRes.error) throw tRes.error;
      var rows = tRes.data || [];
      if (rows.length) {
        S.tables = rows.map(function(r){
          return { id: r.id, name: r.name, seats: r.capacity || 4, zoneId: r.zone_id || 'z_adentro' };
        });
        S.zones = zonesFromTables(rows);
        cacheLocal();
        return;
      }
      // La base no tiene mesas para esta sucursal → probar caché/semilla abajo.
    }
  } catch (e) {
    console.warn('[config] loadState: no pude leer la base, uso caché local:', e && e.message);
  }

  // 2) Caché local (solo si la base no dio nada)
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

  // 3) Semilla mínima — solo negocio nuevo, sin datos en ningún lado
  S.zones  = JSON.parse(JSON.stringify(SEED.zones));
  S.tables = JSON.parse(JSON.stringify(SEED.tables));
  S._fromSeed = true; // el boot la subirá a la base (solo inserta, nunca borra)
}

// Reconstruye la lista de zonas a partir de las mesas de la base.
// Garantiza que NINGUNA mesa quede huérfana: si una mesa apunta a una zona,
// esa zona siempre existe en la lista.
function zonesFromTables(rows) {
  var seen = {}, zones = [];
  rows.forEach(function(r){
    var id = r.zone_id || 'z_adentro';
    if (!seen[id]) { seen[id] = true; zones.push({ id: id, name: r.zone_name || 'Adentro' }); }
  });
  return zones.length ? zones : JSON.parse(JSON.stringify(SEED.zones));
}

function cacheLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ zones: S.zones, tables: S.tables })); } catch(e) {}
}

function saveState() {
  cacheLocal();
  syncToSupabase(); // fire-and-forget — solo INSERTA/ACTUALIZA, nunca borra en masa
}

// ── Sync a Supabase pos_tables ────────────────────────
async function syncToSupabase() {
  try {
    var user = await cfgUsuario();
    if (!user) return;
    var branchId = user.user_metadata && user.user_metadata.branch_id;
    if (!branchId) return;

    // IDs actuales en Supabase
    var exRes = await sb.from('pos_tables').select('id, status').eq('branch_id', branchId);
    var existing = exRes.data || [];
    var existingMap = {};
    existing.forEach(function(r){ existingMap[r.id] = r.status; });

    // Mapa de zona para resolver zone_name
    var zoneNameMap = {};
    S.zones.forEach(function(z){ zoneNameMap[z.id] = z.name; });

    // 1. Insertar mesas nuevas (no existen en Supabase)
    var toInsert = S.tables.filter(function(t){ return !existingMap[t.id]; }).map(function(t, idx){
      return {
        id:         t.id,
        name:       t.name,
        number:     parseInt(t.name, 10) || (idx + 1),
        capacity:   t.seats || 4,
        zone_id:    t.zoneId || 'z_adentro',
        zone_name:  zoneNameMap[t.zoneId] || t.zoneId || 'Adentro',
        sort_order: S.tables.indexOf(t),
        branch_id:  branchId,
        status:     'libre'
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
        .update({
          name:       t.name,
          number:     parseInt(t.name, 10) || i + 1,
          capacity:   t.seats || 4,
          zone_id:    t.zoneId || 'z_adentro',
          zone_name:  zoneNameMap[t.zoneId] || t.zoneId || 'Adentro',
          sort_order: S.tables.indexOf(t)
        })
        .eq('id', t.id);
    }

    // 3. (ELIMINADO) Antes se borraban en masa las mesas que no estaban en la
    //    copia local. Eso causaba pérdida de datos: un equipo con memoria vacía
    //    borraba las mesas reales de todos. El borrado ahora es EXPLÍCITO y por
    //    una sola mesa, dentro de deleteTable(). Ver #13.

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
  operacion: 'Operación',
  creditos:  'Créditos',
  usuarios:  'Usuarios y roles',
  domicilios:'Domicilios',
  chatia:    'Asistente IA'
};

function setSection(sec) {
  if (sec === 'back') { window.location.href = 'dashboard.html'; return; }

  document.querySelectorAll('.lm-nav').forEach(function(b){
    b.classList.toggle('on', b.dataset.section === sec);
  });

  /* ── Ocultar TODAS las pantallas, sin lista escrita a mano ───────────────
     Aquí había una lista con las pantallas una por una, y a "Impuestos y
     propina" se le olvidó ponerla: se le añadía la marca de visible pero nunca
     se le quitaba. Resultado: una vez abierta, esa pantalla se quedaba pegada
     debajo de TODAS las demás — por eso Operación y Métodos de pago se veían
     cortadas, con los impuestos colgando abajo.
     Con esto, cualquier pantalla que se agregue mañana se oculta sola. */
  var _panes = document.querySelectorAll('.cf-screen');
  for (var _i = 0; _i < _panes.length; _i++) _panes[_i].classList.remove('on');

  var screenMesas    = $('screen-mesas');
  var screenGeneral  = $('screen-general');
  var screenPh       = $('screen-placeholder');

  if (sec === 'mesas') {
    screenMesas.classList.add('on');
    $('crumb').textContent = 'Mesas y zonas';
      _ciaToggleTopbar(false);
    deselectTable();
  } else if (sec === 'general') {
    screenGeneral.classList.add('on');
    $('crumb').textContent = 'General';
      _ciaToggleTopbar(false);
    if (!window._generalLoaded) { loadGeneral(); window._generalLoaded = true; }
  } else if (sec === 'operacion') {
    var screenOp = $('screen-operacion');
    if (screenOp) {
      screenOp.classList.add('on');
      $('crumb').textContent = 'Operación';
      _ciaToggleTopbar(false);
      if (!window._opLoaded) { opInit(); window._opLoaded = true; }
    }
  } else if (sec === 'impuesto') {
    var screenImp = $('screen-impuesto');
    if (screenImp) {
      screenImp.classList.add('on');
      $('crumb').textContent = 'Impuestos y propina';
      _ciaToggleTopbar(false);
      // Comparte el mismo borrador/guardado que Operación (mismo blob).
      if (!window._opLoaded) { opInit(); window._opLoaded = true; }
      propInit();
    }
  } else if (sec === 'dian') {
    var screenDian = $('screen-dian');
    if (screenDian) {
      screenDian.classList.add('on');
      $('crumb').textContent = 'Facturación DIAN';
      _ciaToggleTopbar(false);
      if (!window._dianLoaded) { dianInit(); window._dianLoaded = true; }
    }
  } else if (sec === 'puntos') {
    var screenPt = $('screen-puntos');
    if (screenPt) {
      screenPt.classList.add('on');
      $('crumb').textContent = 'Puntos';
      _ciaToggleTopbar(false);
      if (!window._ptLoaded) { ptInit(); window._ptLoaded = true; }
      try { ptReglaInit(); } catch (e) { console.error('[puntos] regla:', e); }
    }
  } else if (sec === 'creditos') {
    var screenCr = $('screen-creditos');
    if (screenCr) {
      screenCr.classList.add('on');
      $('crumb').textContent = 'Créditos';
      _ciaToggleTopbar(false);
      if (!window._crLoaded) { crInit(); window._crLoaded = true; }
    }
  } else if (sec === 'domicilios') {
    var screenDm = $('screen-domicilios');
    if (screenDm) {
      screenDm.classList.add('on');
      $('crumb').textContent = 'Domicilios';
      _ciaToggleTopbar(false);
      if (!window._dmLoaded) { dmInit(); window._dmLoaded = true; }
    }
  } else if (sec === 'usuarios') {
    var screenUr = $('screen-usuarios');
    if (screenUr) {
      screenUr.classList.add('on');
      $('crumb').textContent = 'Usuarios y roles';
      _ciaToggleTopbar(false);
      if (!window._urLoaded) { urInit(); window._urLoaded = true; }
    }
  } else if (sec === 'chatia') {
    var screenChatia = $('screen-chatia');
    if (screenChatia) {
      screenChatia.classList.add('on');
      $('crumb').textContent = 'Asistente IA';
      if (!window._chatiaLoaded) { chatiaInit(); window._chatiaLoaded = true; }
      _ciaToggleTopbar(true);
      // Pestaña Pagos del asistente = solo lectura; se edita en Métodos de pago.
      if (window._mpMakeAsistenteReadonly) { setTimeout(window._mpMakeAsistenteReadonly, 60); }
    }
  } else if (sec === 'horario') {
    var screenHorario = $('screen-horario');
    if (screenHorario) {
      screenHorario.classList.add('on');
      $('crumb').textContent = 'Horarios';
      _ciaToggleTopbar(false);
      if (!window._horarioLoaded) { horarioInit(); window._horarioLoaded = true; }
    }
  } else if (sec === 'pagos') {
    var screenMp = $('screen-metodos-pago');
    if (screenMp) {
      screenMp.classList.add('on');
      $('crumb').textContent = 'Métodos de pago';
      _ciaToggleTopbar(false);
      metodosPagoInit();
    } else {
      screenPh.classList.add('on');
      $('placeholder-title').textContent = 'Métodos de pago';
      $('crumb').textContent = 'Métodos de pago';
    }
  } else if (sec === 'impresora') {
    window.location.href = 'impresoras.html';
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
// Borrado EXPLÍCITO y de una sola mesa. Nunca se borra una mesa ocupada, y
// nunca se borra nada como efecto secundario de sincronizar (ver #13).
async function deleteTable(id) {
  try {
    if (_cfgBranchId) {
      var del = await sb.from('pos_tables')
        .delete()
        .eq('id', id).eq('branch_id', _cfgBranchId).eq('status', 'libre')
        .select('id');
      if (del.error) throw del.error;
      // Si no borró nada, puede ser que la mesa esté OCUPADA (o que solo
      // existiera en local). Verificamos antes de quitarla de la pantalla.
      if (!del.data || !del.data.length) {
        var chk = await sb.from('pos_tables').select('status').eq('id', id).maybeSingle();
        if (chk.data && chk.data.status && chk.data.status !== 'libre') {
          showToast('No se puede borrar: la mesa está ocupada');
          return;
        }
      }
    }
  } catch (e) {
    console.warn('[config] deleteTable:', e && e.message);
    showToast('No se pudo borrar la mesa (revisa la conexión)');
    return;
  }
  // Confirmado en la base (o mesa que solo existía en local) → quitar de la UI
  S.tables = S.tables.filter(function(t){ return t.id !== id; });
  S.selectedTable = null;
  cacheLocal();
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
    var user = await cfgUsuario();
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
    _cfgBranchId = branchId || null;
    if (branchId) {
      var r = await sb.from('pos_branches').select('name').eq('id', branchId).single();
      if (r.data) $('brand-sub').textContent = r.data.name;  // sucursal activa
      else /* nombre del restaurante: pos-brand.js */;
    } else {
      /* nombre del restaurante: pos-brand.js */;
    }
  } catch(e) {
    console.error('loadUser:', e);
    $('user-name').textContent = 'Usuario';
    /* nombre del restaurante: pos-brand.js */;
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

// ── Catálogo de monedas (General → Moneda del negocio) ─────────
// El motor del bot y las pantallas leen ia_config.moneda {simbolo, miles, decimales, sufijo}
var MONEDAS = [
  { codigo:'COP', nombre:'Peso colombiano',       simbolo:'$',   miles:'.', decimales:0, sufijo:false },
  { codigo:'USD', nombre:'Dólar estadounidense',  simbolo:'US$', miles:',', decimales:2, sufijo:false },
  { codigo:'EUR', nombre:'Euro',                  simbolo:'€',   miles:'.', decimales:2, sufijo:true  },
  { codigo:'MXN', nombre:'Peso mexicano',         simbolo:'$',   miles:',', decimales:2, sufijo:false },
  { codigo:'BRL', nombre:'Real brasileño',        simbolo:'R$',  miles:'.', decimales:2, sufijo:false },
  { codigo:'ARS', nombre:'Peso argentino',        simbolo:'$',   miles:'.', decimales:2, sufijo:false },
  { codigo:'CLP', nombre:'Peso chileno',          simbolo:'$',   miles:'.', decimales:0, sufijo:false },
  { codigo:'PEN', nombre:'Sol peruano',           simbolo:'S/',  miles:',', decimales:2, sufijo:false },
  { codigo:'UYU', nombre:'Peso uruguayo',         simbolo:'$U',  miles:'.', decimales:2, sufijo:false },
  { codigo:'BOB', nombre:'Boliviano',             simbolo:'Bs',  miles:'.', decimales:2, sufijo:false },
  { codigo:'PYG', nombre:'Guaraní paraguayo',     simbolo:'₲',   miles:'.', decimales:0, sufijo:false },
  { codigo:'VES', nombre:'Bolívar venezolano',    simbolo:'Bs.', miles:'.', decimales:2, sufijo:false },
  { codigo:'GTQ', nombre:'Quetzal guatemalteco',  simbolo:'Q',   miles:',', decimales:2, sufijo:false },
  { codigo:'CRC', nombre:'Colón costarricense',   simbolo:'₡',   miles:'.', decimales:0, sufijo:false },
  { codigo:'HNL', nombre:'Lempira hondureño',     simbolo:'L',   miles:',', decimales:2, sufijo:false },
  { codigo:'NIO', nombre:'Córdoba nicaragüense',  simbolo:'C$',  miles:',', decimales:2, sufijo:false },
  { codigo:'DOP', nombre:'Peso dominicano',       simbolo:'RD$', miles:',', decimales:2, sufijo:false },
  { codigo:'PAB', nombre:'Balboa panameño',       simbolo:'B/.', miles:',', decimales:2, sufijo:false },
  { codigo:'GBP', nombre:'Libra esterlina',       simbolo:'£',   miles:',', decimales:2, sufijo:false },
  { codigo:'CAD', nombre:'Dólar canadiense',      simbolo:'C$',  miles:',', decimales:2, sufijo:false }
];

function fmtEjemploMoneda(m) {
  var n = 1234567;
  var decSep = m.miles === '.' ? ',' : '.';
  var s = m.decimales > 0 ? n.toFixed(m.decimales) : String(n);
  var parts = s.split('.');
  var ent = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, m.miles);
  var num = parts[1] ? ent + decSep + parts[1] : ent;
  return m.sufijo ? (num + ' ' + m.simbolo) : (m.simbolo + num);
}

function initMonedaSelect(actual) {
  var sel = $('gen-moneda');
  if (!sel) return;
  sel.innerHTML = MONEDAS.map(function(m) {
    return '<option value="' + m.codigo + '">' + m.codigo + ' — ' + m.nombre + '  (' + fmtEjemploMoneda(m) + ')</option>';
  }).join('');
  // Selección actual: por código guardado, o por coincidencia de símbolo+formato
  var cod = 'COP';
  if (actual) {
    if (actual.codigo) cod = actual.codigo;
    else {
      var match = MONEDAS.find(function(m) {
        return m.simbolo === actual.simbolo && m.miles === (actual.miles || '.') &&
               (m.decimales || 0) === (Number(actual.decimales) || 0);
      });
      if (match) cod = match.codigo;
    }
  }
  sel.value = cod;
  var updEj = function() {
    var m = MONEDAS.find(function(x){ return x.codigo === sel.value; }) || MONEDAS[0];
    var ej = $('gen-moneda-ej');
    if (ej) ej.textContent = fmtEjemploMoneda(m);
  };
  sel.addEventListener('change', updEj);
  updEj();
}

async function loadGeneral() {
  try {
    var user = await cfgUsuario();
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

    // Ya estan el nombre del restaurante y el del gerente: la vista previa
    // del rail se pinta con lo que de verdad hay guardado.
    if (typeof genPintarPreview === 'function') genPintarPreview();

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

    // Moneda del negocio (ia_config.moneda del branch)
    try {
      var monRes = await sb.from('ia_config').select('moneda').eq('branch_id', branchId).maybeSingle();
      initMonedaSelect(monRes.data && monRes.data.moneda);
    } catch(e) { initMonedaSelect(null); }

  } catch(e) {
    console.error('loadGeneral:', e);
  }
}

async function saveGeneral() {
  var btn = $('btn-save-general');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    var user = await cfgUsuario();
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

    // Guardar la moneda del negocio en ia_config (la leen el bot y las pantallas)
    try {
      var selMon = $('gen-moneda');
      if (selMon && selMon.value) {
        var mSel = MONEDAS.find(function(x){ return x.codigo === selMon.value; });
        if (mSel) {
          await sb.from('ia_config').upsert(
            { branch_id: branchId, tenant_id: meta.tenant_id,
              moneda: { codigo: mSel.codigo, simbolo: mSel.simbolo, miles: mSel.miles, decimales: mSel.decimales, sufijo: mSel.sufijo } },
            { onConflict: 'branch_id' }
          );
        }
      }
    } catch(e) { console.warn('moneda save:', e); }

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
document.addEventListener('DOMContentLoaded', async function() {
  // Cargar la config REAL desde la base antes de pintar nada.
  // (Antes se hacía syncToSupabase() aquí, que borraba las mesas de la base
  //  si este equipo tenía la memoria vacía. Eliminado. Ver #13.)
  await loadState();
  S.activeZone = S.zones[0] ? S.zones[0].id : null;

  // Negocio nuevo (la base estaba vacía y usamos la semilla): subir las mesas
  // iniciales UNA vez. syncToSupabase solo INSERTA/ACTUALIZA — nunca borra.
  if (S._fromSeed && _cfgBranchId) { S._fromSeed = false; syncToSupabase(); }

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

  /* El canvas vive dentro de un iframe y no puede cambiar de pantalla por su
     cuenta. Cuando el dueño toca "Abrir Pagos" o "Conectar el correo" desde la
     caja de pago, pide desde adentro que se le abra la pantalla. */
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || d.cobra !== 'ir' || !d.pantalla) return;
    if (typeof setSection === 'function') setSection(String(d.pantalla));
  });

  // navegación lateral
  document.querySelectorAll('.lm-nav[data-section]').forEach(function(btn){
    btn.addEventListener('click', function(){ setSection(btn.dataset.section); });
  });

  /* Se puede llegar aquí desde otra pantalla pidiendo una sección concreta
     (configuracion.html?s=puntos). Sin esto, tocar "Puntos" desde Impresoras
     aterrizaba en Mesas y había que buscarla otra vez. */
  try {
    var _q = new URLSearchParams(location.search);
    var _pedida = _q.get('s');
    if (_pedida && document.getElementById('nav-' + _pedida)) setSection(_pedida);
    /* Se puede pedir tambien la pestana y la fila plegada, para llegar desde
       el chat justo encima de las respuestas rapidas y no a buscarlas. */
    var _tab = _q.get('tab');
    if (_tab) { try { localStorage.setItem('cia-tab', _tab); } catch (e) {} }
    var _acc = _q.get('acc');
    if (_acc) setTimeout(function () {
      if (window.ciaAcc) ciaAcc(_acc);
      var f = document.querySelector('.cia-acc[data-acc="' + _acc + '"]');
      if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
      /* Y SI SE PIDIO UN PEDAZO CONCRETO de esa fila, se deja a la vista y se
         resalta un momento (19-ago). La campana manda a los barrios sin precio:
         llegar a la fila abierta pero con el bloque fuera de pantalla es
         llegar a medias, y el dueño no encuentra lo que el aviso le prometio. */
      var _ver = _q.get('ver');
      if (!_ver) return;
      setTimeout(function () {
        var el = document.getElementById(_ver);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('cfg-resalta');
        setTimeout(function () { el.classList.remove('cfg-resalta'); }, 2400);
      }, 260);
    }, 400);
  } catch (e) { /* si el navegador no puede, se queda en la de siempre */ }

  // cargar usuario async
  loadUser();
  initGenTypeGrid();
  initGoalFormat();
  var btnSave = $('btn-save-general');
  if (btnSave) btnSave.addEventListener('click', saveGeneral);
});

// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
/* Al cambiar un rol, los permisos guardados en ESTE equipo quedan viejos. Se
   borran todos los del prefijo: aqui no se sabe que rol edito el dueno ni
   cual tenia guardado el equipo del mesero. (El equipo del mesero se corrige
   solo: su proxima consulta confirmada pisa lo guardado.) */
function _permsInvalidar() {
  try {
    if (!window.posCache) return;
    var pre = 'pos.cache.' + (posCache.tenant() || 'sin-negocio') + '.perms.';
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf(pre) === 0) localStorage.removeItem(k);
    }
  } catch (e) {}
}
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
    { id: 'pedidos.anular',    label: 'Anular ítems y pedidos',  desc: 'Eliminar productos o cancelar comandas' },
    { id: 'pedidos.reabrir',   label: 'Reabrir o reimprimir cuentas', desc: 'Volver a abrir o reimprimir una cuenta cerrada' }
  ]},
  { group: 'Caja', items: [
    { id: 'caja.abrir',       label: 'Aperturar caja',        desc: 'Abrir el turno y la base de efectivo' },
    { id: 'caja.cerrar',      label: 'Cerrar caja',           desc: 'Cerrar el turno e imprimir el cierre Z' },
    { id: 'caja.movimientos', label: 'Ingresos y egresos',    desc: 'Registrar entradas y salidas de efectivo' },
    { id: 'pagos.anular',     label: 'Anular pagos',          desc: 'Anular un pago o venta ya registrada' },
    { id: 'caja.ver_todas',   label: 'Ver todas las cajas',   desc: 'Ver las demás cajas del turno (no solo la propia)' }
  ]},
  { group: 'Catálogo e inventario', items: [
    { id: 'catalogo.ver',      label: 'Ver catálogo',        desc: 'Consultar el menú y precios' },
    { id: 'catalogo.editar',   label: 'Gestionar productos', desc: 'Crear y editar el menú y precios' },
    { id: 'inventario.compras',label: 'Registrar compras',   desc: 'Registrar compras y ajustar el stock' }
  ]},
  { group: 'Ventas e IA', items: [
    { id: 'ventas.ver', label: 'Ver informes de ventas', desc: 'Acceder a reportes y cierres' },
    { id: 'chat.usar',  label: 'Usar asistente IA',      desc: 'Acceder al chat de inteligencia artificial' }
  ]},
  { group: 'Reservas y domicilios', items: [
    { id: 'reservas.gestionar',   label: 'Gestionar reservas',   desc: 'Crear y administrar reservas' },
    { id: 'domicilios.gestionar', label: 'Gestionar domicilios', desc: 'Administrar la pantalla de domicilios' }
  ]},
  { group: 'Configuración', items: [
    { id: 'config.general',   label: 'Configuración general',     desc: 'Editar marca, sucursal y meta diaria' },
    { id: 'config.propina',   label: 'Cambiar propina obligatoria', desc: 'Activar o desactivar la propina obligatoria' },
    { id: 'config.salon',     label: 'Configurar mesas y zonas',  desc: 'Editar el plano del salón' },
    { id: 'config.usuarios',  label: 'Gestionar usuarios y roles',desc: 'Administrar el equipo y permisos' }
  ]}
];
var UR_TOTAL_PERMS = UR_PERMS.reduce(function (n, g) { return n + g.items.length; }, 0);
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
var _uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeUUID(v) { return (_uuidRe.test(v) ? v : null); }
function slugNegocio() {
  var meta = window._pos && window._pos.state && window._pos.state.negocio;
  if (!meta) {
    try { var u = JSON.parse(localStorage.getItem('sb-tblujfduscslxjmrjbdr-auth-token')||'{}');
      meta = u.user && u.user.user_metadata && u.user.user_metadata.negocio; } catch(e){}
  }
  return (meta||'restaurante').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

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
  /* Aqui se nombraba una variable que NO EXISTE en ningun archivo del
     proyecto, asi que sin sesion esto reventaba con un ReferenceError en vez
     de decir que la sesion se vencio. (Y menos mal que no existia: una clave
     de servicio en este repo, que es publico, le daria a cualquiera acceso
     total a la base de TODOS los restaurantes.) */
  if (!session) throw new Error('Tu sesión se venció. Vuelve a entrar para poder guardar.');
  var token = session.access_token;
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
    var user = await cfgUsuario();
    tenantId = user && user.user_metadata && user.user_metadata.tenant_id;
  }

  // Roles
  var rolesRes = await sb.from('pos_roles').select('*').eq('tenant_id', tenantId).order('created_at');
  UR.roles = (rolesRes.data || []).map(function(r){
    return { id: r.id, clave: r.clave || null, name: r.name, color: r.color, system: r.system_role, dinero: r.domi_dinero || 'por_pedido', perms: r.perms || [] };
  });

  // Usuarios (pos_users) — solo los del tenant
  var me = await cfgUsuario();
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
      roleId:      (function(){
        var re=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        var base = u.role_id || (role ? role.id : null);
        if(re.test(base)) return base;
        /* Antes: "el primero que no sea del sistema". Desde que los 5 roles
           que Cobra siembra quedaron marcados como del sistema (para que no
           se puedan borrar), esa busqueda no devuelve nada en un restaurante
           que no haya creado roles propios. */
        var saved = urRolPorDefecto(UR.roles);
        return saved ? saved.id : null;
      })(),
      documento:   u.documento || '',
      vehiculo:    u.vehiculo  || '',
      placa:       u.placa     || '',
      sucursales:  u.sucursales || [],
      rolesPorSuc: {},          // se llena abajo, desde pos_usuario_sucursal
      active:      u.active !== false
    };
  });

  /* EL ROL POR SUCURSAL vive en su propia tabla (persona + sucursal + rol),
     porque la misma persona puede ser cajera en una sede y mesera en otra.
     Se carga en un solo viaje para todos los usuarios de la lista. */
  try {
    var _ids = UR.users.map(function(x){ return x.authId || x.id; }).filter(Boolean);
    if (_ids.length) {
      var _rs = await sb.from('pos_usuario_sucursal')
        .select('user_id,branch_id,role_id').in('user_id', _ids);
      (_rs.data || []).forEach(function(r){
        var us = UR.users.find(function(x){ return (x.authId || x.id) === r.user_id; });
        if (us && r.role_id) us.rolesPorSuc[r.branch_id] = r.role_id;
      });
    }
  } catch(e) { console.warn('[usuarios] roles por sucursal:', e && e.message); }

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
      role: urRolTexto(role),
      nombre: u.name
    }
  });
  if (!authRes.id) throw new Error('Error creando usuario en Auth');
  var authUserId = authRes.id;

  // 2. Insertar en pos_users — safeUUID() en todos los campos UUID
  var insertRes = await sb.from('pos_users').insert({
    name:         u.name,
    email:        u.email,
    phone:        '',
    role:         urRolTexto(role),
    role_id:      safeUUID(u.roleId),
    tenant_id:    safeUUID(tenantId),
    branch_id:    safeUUID(branchId),
    active:       u.active !== false,
    documento:    u.documento || null,
    vehiculo:     u.vehiculo  || null,
    placa:        u.placa     || null,
    sucursales:   u.sucursales || [],
    auth_user_id: safeUUID(authUserId),
    pass_temp:    u.pass
  }).select().single();

  if (insertRes.error) throw new Error(insertRes.error.message);
  return insertRes.data;
}

/* QUE SE GUARDA EN EL TEXTO `role` DEL USUARIO.

   Antes se guardaba `role.name.toLowerCase()`, o sea el nombre que el dueNo
   VE Y PUEDE EDITAR. El dia que renombrara "Cajero" a "Cajera de mostrador",
   sus cajeros quedaban guardados como 'cajera de mostrador' y ninguna
   pantalla los reconocia.

   Ahora se guarda la CLAVE INTERNA, que no cambia nunca. Los roles propios
   del restaurante (los que crea el dueNo) no tienen clave: esos si van por
   nombre, y esta bien, porque a esos el sistema no les da un trato especial.
   El nombre visible se saca del rol cuando hay que mostrarlo. */
function urRolTexto(role) {
  if (!role) return 'empleado';
  return role.clave || (role.name || '').toLowerCase().trim() || 'empleado';
}

/* EL ROL QUE SE PROPONE AL CREAR UN USUARIO NUEVO.
   Nunca el de administrador: proponer acceso total por descuido es como se
   crean las cuentas con mas permisos de los que debian. Se propone el de
   mesero, que es el mas comun y el mas limitado. */
function urRolPorDefecto(roles) {
  var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var validos = (roles || []).filter(function(r){ return uuidRe.test(r.id); });
  var pref = ['mesero','cajero','cocina','domiciliario'];
  for (var i = 0; i < pref.length; i++) {
    var m = validos.find(function(r){ return r.clave === pref[i]; });
    if (m) return m;
  }
  return validos.find(function(r){ return r.clave !== 'admin'; }) || validos[0] || null;
}

// ── Actualizar usuario ────────────────────────────────────────
async function urUpdateAuthUser(u) {
  var role = urRoleById(u.roleId);
  // Actualizar pos_users
  var upd = {
    name:       u.name,
    email:      u.email,
    role:       urRolTexto(role),
    role_id:    safeUUID(u.roleId),
    active:     u.active !== false,
    documento:  u.documento || null,
    vehiculo:   u.vehiculo  || null,
    placa:      u.placa     || null,
    sucursales: u.sucursales || [],
    pass_temp:  u.pass
  };
  var safeId = safeUUID(u.id);
  if (!safeId) { console.warn('urUpdateAuthUser: u.id no es UUID valido:', u.id); return; }
  await sb.from('pos_users').update(upd).eq('id', safeId);

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
    var user = await cfgUsuario();
    tenantId = user && user.user_metadata && user.user_metadata.tenant_id;
  }
  if (r._isNew) {
    delete r._isNew;
    _permsInvalidar();
    var res = await sb.from('pos_roles').insert({
      /* Un rol que crea el restaurante NUNCA es del sistema ni lleva clave:
         la clave es solo de los 5 que siembra Cobra. Antes se copiaba
         `r.system` del objeto en memoria, y duplicar un rol del sistema
         creaba una copia que tampoco se podia borrar. */
      tenant_id: tenantId, name: r.name, color: r.color, clave: null,
      system_role: false, perms: r.perms, domi_dinero: r.dinero || 'por_pedido'
    }).select().single();
    if (res.error) { r._isNew = true; throw new Error(res.error.message); }
    if (res.data) r.id = res.data.id;
  } else {
    var safeRoleId = safeUUID(r.id);
    if (!safeRoleId) { console.warn('urSaveRole: r.id no es UUID valido:', r.id); return; }
    _permsInvalidar();
    await sb.from('pos_roles').update({
      /* `clave` NO se manda nunca: es interna y la base la protege igual. */
      name: r.name, color: r.color, perms: r.perms,
      domi_dinero: r.dinero || 'por_pedido'
    }).eq('id', safeRoleId);
  }
}

// ── Eliminar rol ───────────────────────────────────────────────
async function urDeleteRoleDb(id) {
  _permsInvalidar();
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
/* ── LO DEL DOMICILIARIO ────────────────────────────────────────────
   Los campos de documento/vehiculo/placa y el interruptor del dinero
   NO se muestran siempre: aparecen solos cuando el rol escogido es el
   de domiciliario. Y se reconoce por la CLAVE INTERNA, no por como se
   llame: un restaurante puede haberlo renombrado a "Repartidor" o a
   "Mensajero" y tiene que seguir funcionando igual. */
function urEsRolDomi(role) {
  return !!(role && role.clave === 'domiciliario');
}

/* Pinta los datos del domiciliario en la ficha del usuario. */
function urPintarDomiUsuario(u) {
  var caja = $('ur-u-domi');
  if (!caja) return;
  var role = urRoleById(u && u.roleId);
  var mostrar = urEsRolDomi(role);
  caja.style.display = mostrar ? '' : 'none';
  if (!mostrar) return;
  var doc = $('ur-u-documento'), veh = $('ur-u-vehiculo'), pla = $('ur-u-placa');
  if (doc) { doc.value = u.documento || ''; doc.oninput = function(){ u.documento = doc.value.trim(); }; }
  if (veh) { veh.value = u.vehiculo  || ''; veh.onchange = function(){ u.vehiculo  = veh.value; }; }
  if (pla) { pla.value = u.placa     || ''; pla.oninput = function(){ u.placa = pla.value.trim().toUpperCase(); }; }
}

/* Pinta el interruptor del dinero en la ficha del ROL. */
function urPintarDomiRol(r) {
  var caja = $('ur-r-domi');
  if (!caja) return;
  var mostrar = urEsRolDomi(r);
  caja.style.display = mostrar ? '' : 'none';
  if (!mostrar) return;
  if (!r.dinero) r.dinero = 'por_pedido';
  var hint = $('ur-r-dinero-hint');
  var textos = {
    por_pedido: 'El domiciliario entrega la plata de cada pedido al volver. Entra a la caja como una venta normal.',
    al_final:   'Trae todo al terminar el turno. La venta se cuenta igual, pero la caja te va a mostrar cuanto efectivo lleva encima y debe entregar.'
  };
  var btns = document.querySelectorAll('#ur-r-dinero button');
  Array.prototype.forEach.call(btns, function(b){
    b.classList.toggle('on', b.dataset.dinero === r.dinero);
    b.onclick = function(){
      r.dinero = b.dataset.dinero;
      urPintarDomiRol(r);
    };
  });
  if (hint) hint.textContent = textos[r.dinero] || '';
}

function urSelectUser(id) {
  UR.selectedUserId=id; UR.selectedRoleId=null;
  urRenderUsers();
  var u=urUserById(id); if(!u) return;
  var role=urRoleById(u.roleId), color=role?role.color:'#94A3B8';
  var av=$('ur-user-avatar'); if(av){ av.textContent=urInitials(u.name); av.style.background=u.active?color:'#CBD5E1'; }
  var ti=$('ur-user-title'); if(ti) ti.textContent=u.name||'–';
  var nm=$('ur-u-name');  if(nm) nm.value=u.name||'';
  var emailDomain = '@' + slugNegocio();
  var prefixVal = (u.email||'').replace(/@.*/,'');
  var em=$('ur-u-email'); if(em) em.value=prefixVal;
  var domLbl=$('ur-u-email-domain'); if(domLbl) domLbl.textContent=emailDomain;
  var ps=$('ur-u-pass');  if(ps) ps.value=u.pass||'';
  // Rol select
  var sel=$('ur-u-rol');
  if(sel){
    sel.innerHTML='';
    var uuidReS=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    UR.roles.filter(function(r){return uuidReS.test(r.id);}).forEach(function(r){
      var opt=document.createElement('option');
      opt.value=r.id; opt.textContent=r.name;
      if(r.id===u.roleId) opt.selected=true;
      sel.appendChild(opt);
    });
    urUpdateRolDot(u.roleId);
    sel.onchange=function(){
      u.roleId=sel.value; urUpdateRolDot(sel.value);
      urPintarDomiUsuario(u);   // los campos del domiciliario aparecen/se van
      urRenderUsers();
    };
  }
  urPintarDomiUsuario(u);
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
  if(emailIn) emailIn.oninput=function(){
    u.email = emailIn.value.trim().toLowerCase().replace(/@.*/,'') + '@' + slugNegocio();
  };
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
      /* EL ROL VA POR SUCURSAL: la misma persona puede ser cajera en una sede y
         mesera en otra. Antes el rol era uno solo para toda la persona.
         El selector aparece solo en las sucursales a las que SÍ tiene acceso;
         si no elige ninguno, se usa el rol general del usuario. */
      var rolSuc = (u.rolesPorSuc && u.rolesPorSuc[s.id]) || '';
      var selector = isOn
        ? '<div class="cf-suc-rol" style="padding:6px 10px 10px 40px">'
          + '<select class="cf-input" data-rolsuc="'+s.id+'" style="width:100%;font-size:12px;padding:5px 8px">'
          + '<option value="">Mismo rol que su ficha</option>'
          + UR.roles.map(function(r){
              return '<option value="'+r.id+'"'+(r.id===rolSuc?' selected':'')+'>'+r.name+'</option>';
            }).join('')
          + '</select></div>'
        : '';
      return '<button class="cf-access-suc'+(isOn?' on':'')+'" data-suc="'+s.id+'">'+
        (isOn?'<span class="cf-check on"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>':'<span class="cf-check"></span>')+
        '<span class="cf-suc-main"><span class="cf-suc-name">'+s.name+'</span><span class="cf-suc-addr">'+s.addr+'</span></span>'+
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg></button>'
        + selector;
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
        if(idx>=0){
          u.sucursales.splice(idx,1);
          /* Al quitarle la sucursal se olvida tambien su rol ahi: dejarlo
             guardado haria que al devolverle el acceso reapareciera un rol que
             nadie volvio a elegir. */
          if(u.rolesPorSuc) delete u.rolesPorSuc[sid];
        } else {
          if(!u.sucursales) u.sucursales=[];
          u.sucursales.push(sid);
        }
        urRenderAccessPanel(u); urRenderUsers();
      });
    });
    /* El selector de rol NO debe propagar el clic: esta dentro de la fila de la
       sucursal, y sin esto elegir un rol quitaria el acceso. */
    div.querySelectorAll('[data-rolsuc]').forEach(function(sel){
      sel.addEventListener('click', function(e){ e.stopPropagation(); });
      sel.addEventListener('change', function(e){
        e.stopPropagation();
        if(!u.rolesPorSuc) u.rolesPorSuc={};
        if(sel.value) u.rolesPorSuc[sel.dataset.rolsuc]=sel.value;
        else delete u.rolesPorSuc[sel.dataset.rolsuc];
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
  urPintarDomiRol(r);
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
/* Guarda QUE ROL tiene esta persona EN CADA SUCURSAL.
   Se reescribe el juego completo de sus filas: se borran las de sucursales que
   ya no tiene y se dejan las actuales. Si no eligio rol para una sucursal, se
   guarda igual con el rol general de su ficha — asi la fila existe y el
   permiso se resuelve por sucursal, que es el camino nuevo. */
async function urGuardarRolesPorSucursal(u) {
  var uid = u.authId || u.id;
  if (!uid) return;
  var tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
  if (!tenantId) {
    var _me = await cfgUsuario();
    tenantId = _me && _me.user_metadata && _me.user_metadata.tenant_id;
  }
  if (!tenantId) return;

  var sucs = u.sucursales || [];
  var filas = sucs.map(function (sid) {
    return {
      tenant_id: tenantId,
      user_id:   uid,
      branch_id: sid,
      role_id:   (u.rolesPorSuc && u.rolesPorSuc[sid]) || u.roleId || null
    };
  });

  /* Primero se quitan las que sobran y despues se suben las que quedan: al
     reves habria un instante en que la persona no tendria ninguna. */
  var del = sb.from('pos_usuario_sucursal').delete().eq('user_id', uid);
  if (sucs.length) del = del.not('branch_id', 'in', '(' + sucs.join(',') + ')');
  var rDel = await del;
  if (rDel.error) throw new Error('No se pudieron limpiar los accesos: ' + rDel.error.message);

  if (filas.length) {
    var rUp = await sb.from('pos_usuario_sucursal')
      .upsert(filas, { onConflict: 'user_id,branch_id' }).select('id');
    /* 0 filas sin error es el fallo silencioso de siempre: diria "guardado"
       sin haber guardado. */
    if (rUp.error || !rUp.data || !rUp.data.length) {
      throw new Error('No se pudo guardar el rol por sucursal: ' +
        ((rUp.error && rUp.error.message) || 'sin permisos'));
    }
  }
}

async function urSaveExistingUser(u) {
  var btn=$('ur-u-save'); if(btn){ btn.disabled=true; btn.textContent='Guardando…'; }
  try {
    await urUpdateAuthUser(u);
    await urGuardarRolesPorSucursal(u);
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
  var defaultRole = urRolPorDefecto(UR.roles);
  var u={ id: urGenId('u'), name:'', email:'', pass: urGenPass(), roleId: defaultRole?defaultRole.id:'', sucursales:[], active:true, _isNew:true };
  UR.users.push(u);
  urRenderUsers();
  urSelectUser(u.id);
}

async function urConfirmCreateUser(u) {
  if (!u._isNew) return;
  var prefixCheck = (u.email||'').replace(/@.*/,'').trim();
  if (!prefixCheck || !u.pass) { urShowToast('Completa el nombre de usuario y la contrasena'); return; }
  u.email = prefixCheck + '@' + slugNegocio();
  try {
    var me = await cfgUsuario();
    if (!me) {
      var { data: { session } } = await sb.auth.getSession();
      me = session ? session.user : null;
    }
    if (!me) { urShowToast('Sesión expirada — recarga la página'); return; }
    var tenantId = me.user_metadata && me.user_metadata.tenant_id;
    var branchId = me.user_metadata && me.user_metadata.branch_id;
    if (!tenantId) { urShowToast('Error: no se encontró tenant_id en la sesión'); return; }
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
  // NO se guarda automáticamente — el usuario debe hacer clic en "Guardar rol"
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
  urRenderRoles();
  urSelectRole(clone.id);
  // NO auto-save — el usuario debe hacer clic en "Guardar rol"
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

// ════════════════════════════════════════════════════════════
// MÓDULO OPERACIÓN — lumen.config.operacion.v1
// ════════════════════════════════════════════════════════════

var OP_KEY = 'pos.config.operacion.v1';
var _cfgBranchId = null; // se rellena al cargar el usuario
var OP_DEFAULTS = {
  entregaMin: 12, cocinaMax: 20, propinaPct: 10, propinaObligatoria: false,
  metaDiaria: 1500000, cobroAdelantado: false, aceptaReservas: false, pin: '',
  // Impuestos: APAGADO por defecto. Un restaurante pequeño en Colombia suele
  // ser "no responsable" de impoconsumo y no cobra nada.
  impuestos: { activo: false, tipo: 'inc', pct: 8, incluido: true, nit: '', razon_social: '', resolucion: '' },
  // Propina (nuevo modelo — sección "Impuestos y propina")
  propinaActiva: true,          // ¿el restaurante recibe propina?
  propinaPorcentajes: [10],     // porcentajes sugeridos que aparecen en el cobro
  propinaModoDefault: 'pct',    // 'pct' | 'fijo' — cómo llega precargada al cobro
  // C3b — Empaques
  empaquesActivo: false,
  empaqueTipo: 'fijo',       // 'fijo' | 'porcentaje'
  empaqueBase: 'unidad',     // 'unidad' | 'pedido'
  empaqueCanal: 'mismo',     // 'mismo' | 'distinto'
  empaqueMonto: 500,
  empaquePct: 5,
  empaqueMontoDomicilio: 500,
  empaquePctDomicilio: 5,
  empaqueAlcance: 'todos',   // LEGADO (ya no se usa; se mantiene por compatibilidad)
  empaqueCategIds: '',       // LEGADO
  empaqueProductoIds: '',    // LEGADO
  empaqueModo: 'unificado',  // 'unificado' | 'especifico'
  empaquePacks: [],          // [{id, nombre, monto}] empaques personalizados
  etiquetasVRActivo: false,  // etiquetas de venta rápida (Espera / Avisar / …)
  etiquetasVR: [],           // [{id, nombre}]
  /* 'no' | 'recoger' | 'siempre' — ¿se puede guardar sin escoger etiqueta?
     Por defecto 'no' (opcional): quien ya venía trabajando así no se encuentra
     de un día para otro con que el sistema le exige algo nuevo. */
  etiquetasVRExigir: 'no',
  empaqueCatCfg: {},         // {catId: {on:bool, packId:string|null}} — null = valor general
  empaqueProdCfg: {},        // {prodId: 'none' | 'general' | packId} — ausente = hereda categoría
  empaquePresCfg: {},        // {'prodId::presId': 'none'|'general'|packId} — ausente = hereda producto
  // Notas frecuentes (chips de "sin cebolla", "solo BBQ"… al personalizar el plato)
  notasFrecuentes: { modo: 'global', global: [], cats: {} }, // modo: 'global'|'cat'; cats: {catName:[notas]}
  // C9 — Tiempos de automatización de mesa
  mesaT1: 10,  // min → primera notificación
  mesaT2: 5,   // min → re-notificación tras "No"
  mesaT3: 3,   // min → auto-avance si se ignora
  // C10 — Tiempos de automatización Comiendo → Libre
  liberarT1: 45, // min → primera notificación "¿ya se fueron?"
  liberarT2: 15, // min → re-notificación tras "Siguen comiendo"
  liberarT3: 10, // min → auto-liberar si se ignora
};

var _opSaved  = null;  // último guardado
var _opDraft  = null;  // borrador en edición

function opLoad() {
  var d;
  try { d = Object.assign({}, OP_DEFAULTS, JSON.parse(localStorage.getItem(OP_KEY) || '{}')); }
  catch(e) { d = Object.assign({}, OP_DEFAULTS); }
  // Migración del modelo viejo de propina (propinaPct único) al nuevo (lista).
  if (!Array.isArray(d.propinaPorcentajes) || !d.propinaPorcentajes.length) {
    d.propinaPorcentajes = [parseInt(d.propinaPct, 10) || 10];
  }
  if (d.propinaActiva === undefined) d.propinaActiva = true;
  if (d.propinaModoDefault !== 'fijo') d.propinaModoDefault = 'pct';
  // Notas frecuentes — garantizar forma correcta
  if (!d.notasFrecuentes || typeof d.notasFrecuentes !== 'object') d.notasFrecuentes = { modo: 'global', global: [], cats: {} };
  if (d.notasFrecuentes.modo !== 'cat') d.notasFrecuentes.modo = 'global';
  if (!Array.isArray(d.notasFrecuentes.global)) d.notasFrecuentes.global = [];
  if (!d.notasFrecuentes.cats || typeof d.notasFrecuentes.cats !== 'object') d.notasFrecuentes.cats = {};
  return d;
}

function opSave(data) {
  // Marca de tiempo: al sincronizar entre dispositivos SIEMPRE gana la más nueva
  // (sin esto, si el guardado a BD fallaba una vez, el boot restauraba la vieja).
  data._ts = Date.now();
  localStorage.setItem(OP_KEY, JSON.stringify(data));
  // Verificar que la escritura local realmente quedó (si algo falla, avisar YA)
  try {
    var _chk = JSON.parse(localStorage.getItem(OP_KEY) || '{}');
    if (_chk._ts !== data._ts) opToast('⚠️ No se pudo guardar la configuración en este equipo');
  } catch (eV) { opToast('⚠️ No se pudo guardar la configuración en este equipo'); }
  // Sync claves heredadas para compatibilidad con otros módulos
  localStorage.setItem('pos.config.cobro_adelantado', data.cobroAdelantado ? 'true' : 'false');
  localStorage.setItem('pos.config.acepta_reservas', data.aceptaReservas ? 'true' : 'false');
  // Sync a la base de datos (fuente de verdad para TODOS los dispositivos —
  // sin esto la tablet no ve la config de Operación: empaque, reglas, etc.)
  // Con reintentos, y si aun así falla se AVISA en pantalla (nunca silencioso).
  if (_cfgBranchId) {
    var _syncOp = function (intento) {
      sb.from('branches').update({ cobro_adelantado: !!data.cobroAdelantado, acepta_reservas: !!data.aceptaReservas, operacion_config: data }).eq('id', _cfgBranchId)
        .then(function (r) {
          if (r && r.error) {
            console.warn('opSave branch sync (intento ' + intento + '):', r.error);
            if (intento < 3) setTimeout(function () { _syncOp(intento + 1); }, 1500 * intento);
            else opToast('⚠️ Guardado local OK, pero no se pudo sincronizar a la nube: ' + (r.error.message || r.error.code || 'error'));
          }
        })
        .catch(function (e) {
          console.warn('opSave branch sync exc (intento ' + intento + '):', e);
          if (intento < 3) setTimeout(function () { _syncOp(intento + 1); }, 1500 * intento);
          else opToast('⚠️ Guardado local OK, pero no se pudo sincronizar a la nube');
        });
    };
    _syncOp(1);
  } else {
    opToast('⚠️ Guardado local OK · la sincronización a otros equipos se hará al recargar');
  }
}

// ── Init ──────────────────────────────────────────────────
function opInit() {
  _opSaved = opLoad();
  _opDraft = JSON.parse(JSON.stringify(_opSaved));  // clon PROFUNDO (empaqueCatCfg/packs son objetos)
  opRender();          // render inmediato desde local (sin esperar la red)
  opBindEvents();
  opSyncCobroDesdeBranch();  // corrige el toggle con la columna autoritativa
}

// El interruptor de cobro adelantado se comparte con la pantalla de Ventas a
// traves de branches.cobro_adelantado (fuente de verdad). El blob de Operacion
// guarda su propia copia que Ventas no toca, asi que al abrir se relee la
// columna y se impone sobre el toggle — nunca quedan en desacuerdo.
async function opSyncCobroDesdeBranch() {
  if (!_cfgBranchId) return;
  try {
    var r = await sb.from('branches').select('cobro_adelantado, acepta_reservas').eq('id', _cfgBranchId).maybeSingle();
    if (!r || !r.data || typeof r.data.cobro_adelantado !== 'boolean') return;
    var real = r.data.cobro_adelantado;
    // Corre al abrir el panel, antes de que el usuario toque nada: draft y
    // saved coinciden, asi que imponer la columna en ambos no pierde edits.
    var sinCambios = JSON.stringify(_opDraft) === JSON.stringify(_opSaved);
    _opSaved.cobroAdelantado = real;
    if (sinCambios) _opDraft.cobroAdelantado = real;
    opSetToggle('op-sw-cobro', _opDraft.cobroAdelantado);
    opPintarNotif();
    var cobroSt = $('op-cobro-state');
    if (cobroSt) { cobroSt.textContent = _opDraft.cobroAdelantado ? 'Activado' : 'Desactivado'; cobroSt.className = 'op-state ' + (_opDraft.cobroAdelantado ? 'on' : 'off'); }
    /* Reservas: mismo camino que el cobro adelantado — la columna de la base
       manda, para que la tablet y el .exe vean lo mismo. */
    if (typeof r.data.acepta_reservas === 'boolean') {
      _opSaved.aceptaReservas = r.data.acepta_reservas;
      if (sinCambios) _opDraft.aceptaReservas = r.data.acepta_reservas;
      opSetToggle('op-sw-reservas', _opDraft.aceptaReservas);
      var resSt = $('op-reservas-state');
      if (resSt) { resSt.textContent = _opDraft.aceptaReservas ? 'Activado' : 'Desactivado'; resSt.className = 'op-state ' + (_opDraft.aceptaReservas ? 'on' : 'off'); }
      try { localStorage.setItem('pos.config.acepta_reservas', _opDraft.aceptaReservas ? 'true' : 'false'); } catch (e) {}
    }
    opCheckDirty();
  } catch (e) { /* si falla, queda la copia local */ }
}

// ── Render completo desde el borrador ─────────────────────
/* ══════════════ OPERACION — secciones plegadas ══════════════
   Se abre UNA a la vez: abrir otra cierra la anterior. Es lo que evita volver
   al desorden de tener las diez abiertas.

   Plegada NO es escondida: cada fila muestra a la derecha como esta
   configurada, asi que se puede revisar la operacion entera sin abrir nada. */
window.opAcc = function (key) {
  var yo = document.querySelector('.op-acc[data-acc="' + key + '"]');
  if (!yo) return;
  var abrir = !yo.classList.contains('on');
  document.querySelectorAll('.op-acc.on').forEach(function (o) { o.classList.remove('on'); });
  if (abrir) {
    yo.classList.add('on');
    /* Si la seccion queda por debajo del borde al abrirse, se acerca. Sin
       esto, abrir la ultima no muestra nada: el contenido cae fuera. */
    var panel = yo.closest('.op-panel');
    if (panel) setTimeout(function () {
      var r = yo.getBoundingClientRect(), p = panel.getBoundingClientRect();
      if (r.bottom > p.bottom || r.top < p.top) {
        panel.scrollTop += r.top - p.top - 8;
      }
    }, 20);
  }
};

/* El texto de la derecha de cada fila plegada, y el resumen del rail. Los dos
   salen del MISMO borrador que se esta editando, asi que cambian al instante:
   apagar empaques y ver la fila decir "Apagado" es la confirmacion de que
   quedo hecho, sin tener que abrirla otra vez. */
function opPintarResumenes() {
  var d = _opDraft || _opSaved; if (!d) return;
  var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var min = function (v) { return (Number(v) || 0) + ' min'; };

  var etiq = Array.isArray(d.etiquetasVR) ? d.etiquetasVR.length : 0;
  var nf = d.notasFrecuentes || {};
  var nNotas = (Array.isArray(nf.global) ? nf.global.length : 0)
    + Object.keys(nf.cats || {}).reduce(function (t, k) {
        return t + ((nf.cats[k] || []).length); }, 0);

  var empaque = !d.empaquesActivo ? null
    : (d.empaqueTipo === 'porcentaje'
        ? (Number(d.empaquePct) || 0) + '%'
        : money(d.empaqueMonto)) + ' por ' + (d.empaqueBase === 'pedido' ? 'pedido' : 'unidad');

  var filas = {
    tiempos:  [min(d.entregaMin) + ' \u00b7 ' + min(d.cocinaMax), null],
    comiendo: [[d.mesaT1, d.mesaT2, d.mesaT3].map(Number).join(' \u00b7 ') + ' min', null],
    liberar:  [[d.liberarT1, d.liberarT2, d.liberarT3].map(Number).join(' \u00b7 ') + ' min', null],
    avisos:   ['', null],
    meta:     [money(d.metaDiaria), null],
    acceso:   [[d.cobroAdelantado ? 'Cobro adelantado' : null,
                d.aceptaReservas ? 'Reservas' : null,
                String(d.pin || '').length === 4 ? 'PIN' : null]
                .filter(Boolean).join(' \u00b7 ') || 'Nada activo', null],
    recibos:  ['', null],
    empaques: [empaque || 'Apagado', d.empaquesActivo ? 'si' : 'no'],
    etiquetas:[d.etiquetasVRActivo ? (etiq + (etiq === 1 ? ' etiqueta' : ' etiquetas')) : 'Apagado',
               d.etiquetasVRActivo ? 'si' : 'no'],
    notas:    [nNotas ? (nNotas + (nNotas === 1 ? ' nota' : ' notas')) : 'Ninguna',
               nNotas ? null : 'no'],
  };
  Object.keys(filas).forEach(function (k) {
    var el = document.getElementById('accsum-' + k); if (!el) return;
    el.textContent = filas[k][0];
    el.className = 'op-acc-sum' + (filas[k][1] ? ' ' + filas[k][1] : '');
  });

  var out = document.getElementById('op-resumen'); if (!out) return;
  var si = function (v, sino) {
    return v ? '<b class="si">S\u00ed</b>' : '<b class="no">' + (sino || 'No') + '</b>';
  };
  out.innerHTML =
      '<div class="op-res-l"><span>Cobro adelantado</span>' + si(d.cobroAdelantado) + '</div>'
    + '<div class="op-res-l"><span>Reservas</span>' + si(d.aceptaReservas) + '</div>'
    + '<div class="op-res-l"><span>PIN de administrador</span>'
      + si(String(d.pin || '').length === 4, 'Sin poner') + '</div>'
    + '<div class="op-res-l"><span>Empaques</span>' + si(d.empaquesActivo) + '</div>'
    + '<div class="op-res-l"><span>Etiquetas</span>' + si(d.etiquetasVRActivo) + '</div>'
    + '<div class="op-res-l"><span>Notas frecuentes</span>'
      + (nNotas ? '<b class="si">' + nNotas + '</b>' : '<b class="no">Ninguna</b>') + '</div>'
    + '<div class="op-res-meta"><div class="l">Meta del d\u00eda</div>'
      + '<div class="v">' + money(d.metaDiaria) + '</div></div>';
}

function opRender() {
  try { opPintarNotif(); } catch (e) {}
  var d = _opDraft;

  // Sección 1
  var elEntrega = $('op-entregaMin');
  var elCocina  = $('op-cocinaMax');
  if (elEntrega) elEntrega.textContent = d.entregaMin;
  if (elCocina)  elCocina.textContent  = d.cocinaMax;

  // Sección 2 — propina %
  var elPct = $('op-propinaPct');
  if (elPct) elPct.textContent = d.propinaPct;

  // Propina toggle
  opSetToggle('op-sw-propina', d.propinaObligatoria);
  var stEl = $('op-propina-state');
  var hintEl = $('op-propina-hint');
  var warnEl = $('op-propina-warn');
  if (stEl) { stEl.textContent = d.propinaObligatoria ? 'Obligatoria' : 'Voluntaria'; stEl.className = 'op-state ' + (d.propinaObligatoria ? 'on' : 'off'); }
  if (hintEl) hintEl.textContent = d.propinaObligatoria ? 'El empleado necesita el PIN de administrador para desmarcarla durante el cobro.' : 'El cliente puede aceptar o rechazar la propina libremente.';
  if (warnEl) warnEl.hidden = !(d.propinaObligatoria && !d.pin);

  // Meta diaria
  var elMeta = $('op-metaDiaria');
  if (elMeta) elMeta.value = (d.metaDiaria || 0).toLocaleString('es-CO');

  // Sección 3 — cobro adelantado
  opSetToggle('op-sw-cobro', d.cobroAdelantado);
  opSetToggle('op-sw-reservas', d.aceptaReservas);
  var cobroSt = $('op-cobro-state');
  if (cobroSt) { cobroSt.textContent = d.cobroAdelantado ? 'Activado' : 'Desactivado'; cobroSt.className = 'op-state ' + (d.cobroAdelantado ? 'on' : 'off'); }
  var resSt2 = $('op-reservas-state');
  if (resSt2) { resSt2.textContent = d.aceptaReservas ? 'Activado' : 'Desactivado'; resSt2.className = 'op-state ' + (d.aceptaReservas ? 'on' : 'off'); }

  // PIN status
  var pinSt = $('op-pin-status');
  var pinBtn = $('op-pin-btn-label');
  if (pinSt) {
    if (d.pin) {
      pinSt.className = 'pin-status ok';
      pinSt.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> PIN configurado';
    } else {
      pinSt.className = 'pin-status none';
      pinSt.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Sin PIN configurado';
    }
  }
  if (pinBtn) pinBtn.textContent = d.pin ? 'Cambiar PIN' : 'Establecer PIN';

  // C3b — Empaques toggle + cuerpo
  opSetToggle('op-sw-empaques', d.empaquesActivo);
  var empSt = $('op-empaques-state');
  if (empSt) { empSt.textContent = d.empaquesActivo ? 'Activado' : 'Desactivado'; empSt.className = 'op-state ' + (d.empaquesActivo ? 'on' : 'off'); }
  var empBody = $('op-empaques-body');
  if (empBody) empBody.style.display = d.empaquesActivo ? '' : 'none';
  var selTipo = $('op-empaque-tipo'); if (selTipo) selTipo.value = d.empaqueTipo || 'fijo';
  var selBase = $('op-empaque-base'); if (selBase) selBase.value = d.empaqueBase || 'unidad';
  var selCanal = $('op-empaque-canal'); if (selCanal) selCanal.value = d.empaqueCanal || 'mismo';
  var inpVal = $('op-empaqueVal');
  var inpValDomi = $('op-empaqueValDomi');
  if (inpVal) inpVal.value = d.empaqueTipo === 'porcentaje' ? (d.empaquePct || 5) : (d.empaqueMonto || 500);
  if (inpValDomi) inpValDomi.value = d.empaqueTipo === 'porcentaje' ? (d.empaquePctDomicilio || 5) : (d.empaqueMontoDomicilio || 500);
  var unitLbls = document.querySelectorAll('#op-empaque-unit, #op-empaque-unit-domi');
  unitLbls.forEach(function(el) { if (el) el.textContent = d.empaqueTipo === 'porcentaje' ? '%' : 'COP'; });
  var domiRow = $('op-empaque-domi-row'); if (domiRow) domiRow.style.display = (d.empaqueCanal === 'distinto') ? '' : 'none';
  // Modo unificado / específico
  var esp = d.empaqueModo === 'especifico';
  var btnUni = $('op-emp-modo-uni'), btnEsp = $('op-emp-modo-esp');
  var ON  = 'border:none;border-radius:7px;padding:7px 14px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;background:#fff;color:#5B6BFF;box-shadow:0 1px 3px rgba(15,23,42,.12)';
  var OFF = 'border:none;border-radius:7px;padding:7px 14px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;background:transparent;color:#64748B';
  if (btnUni) btnUni.style.cssText = esp ? OFF : ON;
  if (btnEsp) btnEsp.style.cssText = esp ? ON : OFF;
  // En específico la tarifa es fija por unidad → ocultar tipo/base/canal
  ['op-emp-row-tipo','op-emp-row-base','op-emp-row-canal'].forEach(function(id){ var r = $(id); if (r) r.style.display = esp ? 'none' : ''; });
  if (esp && domiRow) domiRow.style.display = 'none';
  var espBlock = $('op-emp-especifico');
  if (espBlock) espBlock.style.display = esp ? '' : 'none';
  // try/catch: un error del panel específico JAMÁS debe romper opRender
  // (si opRender muere antes de opCheckDirty, el botón Guardar queda muerto)
  if (esp) { try { opRenderEmpEsp(); } catch (e) { console.error('opRenderEmpEsp:', e); } }
  try { opRenderEtiquetas(); } catch (e) { console.error('opRenderEtiquetas:', e); }
  try { opRenderNotas(); } catch (e) { console.error('opRenderNotas:', e); }

  // C9 — T1/T2/T3
  var t1El = $('op-mesaT1'); if (t1El) t1El.textContent = d.mesaT1 || 10;
  var t2El = $('op-mesaT2'); if (t2El) t2El.textContent = d.mesaT2 || 5;
  var t3El = $('op-mesaT3'); if (t3El) t3El.textContent = d.mesaT3 || 3;

  // C10 — liberarT1/T2/T3
  var lt1El = $('op-liberarT1'); if (lt1El) lt1El.textContent = d.liberarT1 || 45;
  var lt2El = $('op-liberarT2'); if (lt2El) lt2El.textContent = d.liberarT2 || 15;
  var lt3El = $('op-liberarT3'); if (lt3El) lt3El.textContent = d.liberarT3 || 10;

  // C6 — Modelos de recibo
  var MODELS_KEY = 'pos.config.recibos.v1';
  var reciboModels;
  try { reciboModels = Object.assign({ descModel: 'estandar', finalModel: 'estandar' }, JSON.parse(localStorage.getItem(MODELS_KEY) || '{}')); }
  catch(e) { reciboModels = { descModel: 'estandar', finalModel: 'estandar' }; }
  document.querySelectorAll('[data-recibo="desc"]').forEach(function(c) { c.classList.toggle('on', c.dataset.model === reciboModels.descModel); });
  document.querySelectorAll('[data-recibo="final"]').forEach(function(c) { c.classList.toggle('on', c.dataset.model === reciboModels.finalModel); });

  opCheckDirty();

  /* Los resumenes salen del mismo borrador que se acaba de pintar. */
  if (typeof opPintarResumenes === 'function') opPintarResumenes();
}

function opSetToggle(id, on) {
  var sw = $(id);
  if (!sw) return;
  sw.classList.toggle('on', !!on);
  sw.setAttribute('aria-checked', on ? 'true' : 'false');
}

// ── Dirty tracking ────────────────────────────────────────
// ── Empaques ESPECÍFICOS (por categoría y producto) ────────────────
var _empCatalog = null;    // { cats:[{id,name}], prods:[{id,name,category_id}] }
var _empOpen = {};         // categorías desplegadas en la UI
var _empOpenProd = {};     // productos desplegados (muestran sus presentaciones)
var _empPackForm = false;  // formulario inline "Crear empaque" abierto (prompt no existe en Electron)
var _etqForm = false;      // formulario inline "Crear etiqueta" abierto

// ── Etiquetas de venta rápida ──────────────────────────────────
function opRenderEtiquetas() {
  var d = _opDraft;
  var st = $('op-etq-state');
  if (st) { st.textContent = d.etiquetasVRActivo ? 'Activado' : 'Desactivado'; st.className = 'op-state ' + (d.etiquetasVRActivo ? 'on' : 'off'); }
  opSetToggle('op-sw-etiquetas', d.etiquetasVRActivo);
  var body = $('op-etiquetas-body');
  if (body) body.style.display = d.etiquetasVRActivo ? '' : 'none';
  var cont = $('op-etq-chips');
  if (!cont || !d.etiquetasVRActivo) return;   // apagado: no hay nada que pintar
  var chips = (d.etiquetasVR || []).map(function (e) {
    return '<span style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;background:#EEF2FF;color:#4F5BE3;border:1px solid #C7D2FE;padding:5px 11px;border-radius:999px">'
      + _empEsc(e.nombre)
      + '<button type="button" data-etq-del="' + _empEsc(e.id) + '" title="Quitar" style="border:none;background:none;cursor:pointer;color:#818CF8;font-size:15px;line-height:1;padding:0">&times;</button></span>';
  }).join('');
  var ex = $('op-etq-exigir');
  if (ex) ex.querySelectorAll('[data-etq-exigir]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.etqExigir === (d.etiquetasVRExigir || 'no'));
  });

  cont.innerHTML = chips + (_etqForm
    ? '<span style="display:inline-flex;align-items:center;gap:6px;background:#FAFAFF;border:1.5px solid #C7D2FE;padding:5px 8px;border-radius:12px">'
      + '<input id="op-etq-nombre" placeholder="Nombre (ej. Avisar)" style="font-family:inherit;font-size:12px;border:1px solid #E2E8F0;border-radius:7px;padding:5px 8px;width:150px;outline:none">'
      + '<button type="button" id="op-etq-ok" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:#5B6BFF;color:#fff;padding:6px 11px;border-radius:8px;cursor:pointer">Agregar</button>'
      + '<button type="button" id="op-etq-cancel" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:none;color:#94A3B8;padding:6px 4px;cursor:pointer">Cancelar</button>'
      + '</span>'
    : '<button type="button" id="op-etq-new" style="display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:12.5px;font-weight:700;border:1.5px dashed #C7D2FE;background:#FAFAFF;color:#4F5BE3;padding:6px 12px;border-radius:999px;cursor:pointer">+ Crear etiqueta</button>');
}
// ── Notas frecuentes ──────────────────────────────────────
var _notasSelCat = null;
function _notasActiveList() {
  var nf = _opDraft.notasFrecuentes;
  if (nf.modo === 'global') return nf.global;
  if (!nf.cats[_notasSelCat]) nf.cats[_notasSelCat] = [];
  return nf.cats[_notasSelCat];
}
function _notasEditorHtml(arr, placeholder) {
  var chips = (arr || []).map(function (n) {
    return '<span style="display:inline-flex;align-items:center;gap:8px;padding:7px 8px 7px 12px;background:#F8FAFC;border:1px solid #ECEEF2;border-radius:999px;font-size:12.5px;font-weight:600;color:#475569">'
      + _empEsc(n)
      + '<button type="button" data-nf-del="' + _empEsc(n) + '" title="Quitar" style="width:18px;height:18px;border-radius:999px;border:none;background:#E9ECF3;color:#64748B;font-family:inherit;font-size:12px;line-height:1;cursor:pointer">&times;</button></span>';
  }).join('');
  return '<div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<input id="op-nf-input" placeholder="' + _empEsc(placeholder) + '" style="flex:1;font-family:inherit;font-size:13px;border:1px solid #ECEEF2;border-radius:9px;padding:9px 11px;outline:none">'
    + '<button type="button" id="op-nf-add" style="font-family:inherit;font-size:12.5px;font-weight:700;border:none;background:#5B6BFF;color:#fff;padding:9px 14px;border-radius:9px;cursor:pointer">Agregar</button>'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px">' + (chips || '<span style="color:#94A3B8;font-size:12px">Aún no hay notas. Agrega la primera arriba.</span>') + '</div>';
}
function opRenderNotas() {
  var cont = $('op-notas-cont');
  if (!cont) return;
  var nf = _opDraft.notasFrecuentes || (_opDraft.notasFrecuentes = { modo: 'global', global: [], cats: {} });
  function segBtn(mode, label) {
    var on = nf.modo === mode;
    return '<button type="button" data-nf-mode="' + mode + '" style="border:none;font-family:inherit;font-size:12px;font-weight:' + (on ? '700' : '600') + ';color:' + (on ? '#0F172A' : '#64748B') + ';background:' + (on ? '#fff' : 'transparent') + ';' + (on ? 'box-shadow:0 1px 2px rgba(15,23,42,.1);' : '') + 'padding:6px 14px;border-radius:6px;cursor:pointer">' + label + '</button>';
  }
  var html = '<div style="display:inline-flex;background:#F1F5F9;border-radius:8px;padding:3px;gap:2px;margin-bottom:14px">'
    + segBtn('global', 'Globales') + segBtn('cat', 'Por categoría') + '</div>';

  if (nf.modo === 'global') {
    html += _notasEditorHtml(nf.global, 'Escribe una nota (ej. Sin cebolla)…');
    cont.innerHTML = html;
    return;
  }
  // Por categoría
  if (!_empCatalog) {
    cont.innerHTML = html + '<div style="color:#94A3B8;font-size:12.5px;padding:8px 0">Cargando categorías…</div>';
    _empLoadCatalog().then(function () { if (_opDraft.notasFrecuentes.modo === 'cat') opRenderNotas(); });
    return;
  }
  var cats = _empCatalog.cats || [];
  if (!cats.length) {
    cont.innerHTML = html + '<div style="color:#94A3B8;font-size:12.5px;padding:8px 0">No hay categorías creadas todavía. Créalas primero en Productos.</div>';
    return;
  }
  if (!_notasSelCat || !cats.some(function (c) { return c.name === _notasSelCat; })) _notasSelCat = cats[0].name;
  html += '<div style="font-size:12px;font-weight:700;color:#64748B;margin:0 0 10px">Elige una categoría para crear sus notas:</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px">';
  cats.forEach(function (c) {
    var on = c.name === _notasSelCat;
    var n = (nf.cats[c.name] || []).length;
    html += '<button type="button" data-nf-catsel="' + _empEsc(c.name) + '" style="font-family:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;'
      + (on ? 'background:#EEF2FF;border:1px solid #5B6BFF;color:#5B6BFF' : 'background:#fff;border:1px solid #ECEEF2;color:#475569') + '">'
      + _empEsc(c.name) + (n ? ' <span style="font-size:10px;opacity:.7">' + n + '</span>' : '') + '</button>';
  });
  html += '</div>';
  if (!nf.cats[_notasSelCat]) nf.cats[_notasSelCat] = [];
  html += _notasEditorHtml(nf.cats[_notasSelCat], 'Nota para ' + _notasSelCat + '…');
  cont.innerHTML = html;
}

function _empEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _empFmt(n){ return '$' + Number(Math.round(n||0)).toLocaleString('es-CO'); }

async function _empLoadCatalog() {
  if (_empCatalog) return _empCatalog;
  try {
    var u = { data: { user: await cfgUsuario() } };
    var t = u && u.data && u.data.user && u.data.user.user_metadata ? u.data.user.user_metadata.tenant_id : null;
    if (!t) return null;
    var rc = await sb.from('pos_categories').select('id,name').eq('active', true).eq('tenant_id', t)
      .order('sort_order',{nullsFirst:false}).order('name');
    var rp = await sb.from('pos_products').select('id,name,category_id,presentations').eq('available', true).eq('tenant_id', t).order('name');
    _empCatalog = { cats: (rc.data || []), prods: (rp.data || []) };
  } catch (e) { console.error('empaques catálogo:', e); _empCatalog = { cats: [], prods: [] }; }
  return _empCatalog;
}

function opRenderEmpEsp() {
  var wrap = $('op-emp-cats');
  if (!wrap) return;
  if (!_empCatalog) {
    wrap.innerHTML = '<div style="padding:16px;text-align:center;color:#94A3B8;font-size:12.5px">Cargando categorías…</div>';
    _empLoadCatalog().then(function(){ if (_opDraft.empaqueModo === 'especifico') opRenderEmpEsp(); });
    return;
  }
  var d = _opDraft;
  var packs = d.empaquePacks || [];
  var general = Number(d.empaqueMonto) || 0;
  var packById = function(id){ return packs.find(function(p){ return p.id === id; }); };

  wrap.innerHTML = _empCatalog.cats.map(function(cat){
    var cc = (d.empaqueCatCfg || {})[cat.id] || {};
    var on = cc.on !== false;
    var open = !!_empOpen[cat.id];
    var catFeeTxt = !on ? 'Sin empaque' : (cc.packId && packById(cc.packId) ? _empFmt(packById(cc.packId).monto) + ' · ' + _empEsc(packById(cc.packId).nombre) : _empFmt(general) + ' · general');
    // Select de tarifa de la categoría (solo si está encendida)
    var catSel = on
      ? '<select data-emp-cat-pack="' + cat.id + '" style="font-family:inherit;font-size:11.5px;border:1px solid #E2E8F0;border-radius:7px;padding:4px 6px;max-width:150px;color:#0F172A;background:#fff">'
        + '<option value=""' + (!cc.packId ? ' selected' : '') + '>General · ' + _empFmt(general) + '</option>'
        + packs.map(function(p){ return '<option value="' + _empEsc(p.id) + '"' + (cc.packId === p.id ? ' selected' : '') + '>' + _empEsc(p.nombre) + ' · ' + _empFmt(p.monto) + '</option>'; }).join('')
        + '</select>'
      : '<span style="font-size:11.5px;color:#94A3B8">Sin empaque</span>';
    var toggle = '<button type="button" data-emp-cat-toggle="' + cat.id + '" title="' + (on ? 'Desactivar empaque en esta categoría' : 'Activar empaque') + '" style="width:34px;height:19px;border-radius:999px;border:none;cursor:pointer;position:relative;flex-shrink:0;background:' + (on ? '#16A34A' : '#CBD5E1') + '"><span style="position:absolute;top:2.5px;' + (on ? 'right:3px' : 'left:3px') + ';width:14px;height:14px;border-radius:50%;background:#fff"></span></button>';
    var head = '<div style="display:flex;align-items:center;gap:9px;padding:10px 12px;' + (open ? 'background:#FAFAFF;' : '') + 'border-bottom:1px solid #F1F5F9">'
      + '<button type="button" data-emp-open="' + cat.id + '" style="border:none;background:none;cursor:pointer;color:' + (open ? '#5B6BFF' : '#94A3B8') + ';display:flex;padding:2px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:rotate(' + (open ? '90' : '0') + 'deg)"><polyline points="9 18 15 12 9 6"/></svg></button>'
      + '<span style="flex:1;font-size:13px;font-weight:700;color:' + (on ? '#0F172A' : '#94A3B8') + '">' + _empEsc(cat.name) + '</span>'
      + catSel + toggle + '</div>';
    var body = '';
    if (open) {
      var prods = _empCatalog.prods.filter(function(p){ return p.category_id === cat.id; });
      body = '<div style="background:#FAFAFF;border-bottom:1px solid #F1F5F9;padding:4px 12px 10px 37px;display:flex;flex-direction:column;gap:5px">'
        + (prods.length ? prods.map(function(p){
            var pc = (d.empaqueProdCfg || {})[p.id];
            var heredaTxt = !on ? 'sin empaque' : (cc.packId && packById(cc.packId) ? _empFmt(packById(cc.packId).monto) : _empFmt(general));
            // Tarifa efectiva del producto (para el "Hereda" de sus presentaciones)
            var prodFeeTxt = heredaTxt;
            if (pc === 'none') prodFeeTxt = 'sin empaque';
            else if (pc === 'general') prodFeeTxt = _empFmt(general);
            else if (pc && packById(pc)) prodFeeTxt = _empFmt(packById(pc).monto);
            var presList = (p.presentations || []).filter(function(x){ return x && x.id && (x.name || '').trim(); });
            var canExpand = presList.length > 1;
            var pOpen = canExpand && !!_empOpenProd[p.id];
            var chev = canExpand
              ? '<button type="button" data-emp-open-prod="' + p.id + '" title="Ver presentaciones" style="border:none;background:none;cursor:pointer;color:' + (pOpen ? '#5B6BFF' : '#CBD5E1') + ';display:flex;padding:1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:rotate(' + (pOpen ? '90' : '0') + 'deg)"><polyline points="9 18 15 12 9 6"/></svg></button>'
              : '<span style="width:14px;flex-shrink:0"></span>';
            var row = '<div style="display:flex;align-items:center;gap:6px">'
              + chev
              + '<span style="flex:1;font-size:12.5px;color:#334155;font-weight:' + (pc ? '700' : '500') + '">' + _empEsc(p.name) + '</span>'
              + '<select data-emp-prod="' + p.id + '" style="font-family:inherit;font-size:11.5px;border:1px solid #E2E8F0;border-radius:7px;padding:4px 6px;max-width:170px;color:#0F172A;background:#fff">'
              + '<option value=""' + (!pc ? ' selected' : '') + '>Hereda · ' + heredaTxt + '</option>'
              + '<option value="general"' + (pc === 'general' ? ' selected' : '') + '>General · ' + _empFmt(general) + '</option>'
              + packs.map(function(k){ return '<option value="' + _empEsc(k.id) + '"' + (pc === k.id ? ' selected' : '') + '>' + _empEsc(k.nombre) + ' · ' + _empFmt(k.monto) + '</option>'; }).join('')
              + '<option value="none"' + (pc === 'none' ? ' selected' : '') + '>Sin empaque</option>'
              + '</select></div>';
            if (pOpen) {
              row += '<div style="display:flex;flex-direction:column;gap:4px;padding:2px 0 4px 20px">'
                + presList.map(function(pr){
                    var key = p.id + '::' + pr.id;
                    var sc = (d.empaquePresCfg || {})[key];
                    return '<div style="display:flex;align-items:center;gap:8px">'
                      + '<span style="flex:1;font-size:12px;color:#64748B;font-weight:' + (sc ? '700' : '500') + '">' + _empEsc(pr.name) + '</span>'
                      + '<select data-emp-pres="' + _empEsc(key) + '" style="font-family:inherit;font-size:11px;border:1px solid #E2E8F0;border-radius:7px;padding:3px 6px;max-width:160px;color:#0F172A;background:#fff">'
                      + '<option value=""' + (!sc ? ' selected' : '') + '>Hereda · ' + prodFeeTxt + '</option>'
                      + '<option value="general"' + (sc === 'general' ? ' selected' : '') + '>General · ' + _empFmt(general) + '</option>'
                      + packs.map(function(k){ return '<option value="' + _empEsc(k.id) + '"' + (sc === k.id ? ' selected' : '') + '>' + _empEsc(k.nombre) + ' · ' + _empFmt(k.monto) + '</option>'; }).join('')
                      + '<option value="none"' + (sc === 'none' ? ' selected' : '') + '>Sin empaque</option>'
                      + '</select></div>';
                  }).join('')
                + '</div>';
            }
            return row;
          }).join('') : '<div style="font-size:12px;color:#94A3B8;padding:4px 0">Sin productos en esta categoría</div>')
        + '</div>';
    }
    return head + body;
  }).join('') || '<div style="padding:16px;text-align:center;color:#94A3B8;font-size:12.5px">Sin categorías en el catálogo</div>';

  // Chips de packs
  var packsWrap = $('op-emp-packs');
  if (packsWrap) {
    var nUsos = function(pid){
      var n = 0;
      Object.keys(d.empaqueProdCfg || {}).forEach(function(k){ if (d.empaqueProdCfg[k] === pid) n++; });
      Object.keys(d.empaqueCatCfg || {}).forEach(function(k){ if ((d.empaqueCatCfg[k] || {}).packId === pid) n++; });
      Object.keys(d.empaquePresCfg || {}).forEach(function(k){ if (d.empaquePresCfg[k] === pid) n++; });
      return n;
    };
    packsWrap.innerHTML = packs.map(function(p){
      return '<span style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;background:#F5F3FF;color:#6D28D9;border:1px solid #DDD6FE;padding:6px 11px;border-radius:999px">'
        + _empEsc(p.nombre) + ' · ' + _empFmt(p.monto)
        + '<span style="font-weight:500;color:#8B5CF6">· ' + nUsos(p.id) + ' uso' + (nUsos(p.id) !== 1 ? 's' : '') + '</span>'
        + '<button type="button" data-emp-pack-del="' + _empEsc(p.id) + '" title="Eliminar empaque" style="border:none;background:none;color:#8B5CF6;cursor:pointer;font-size:15px;line-height:1;padding:0;font-weight:700">&times;</button>'
        + '</span>';
    }).join('')
    + (_empPackForm
        ? '<span style="display:inline-flex;align-items:center;gap:6px;background:#FAF9FF;border:1.5px solid #C4B5FD;padding:5px 8px;border-radius:12px">'
          + '<input id="op-emp-pack-nombre" placeholder="Nombre (ej. Empaque pequeño)" style="font-family:inherit;font-size:12px;border:1px solid #E2E8F0;border-radius:7px;padding:5px 8px;width:170px;outline:none">'
          + '<input id="op-emp-pack-monto" type="number" min="0" step="100" placeholder="$ valor" style="font-family:inherit;font-size:12px;border:1px solid #E2E8F0;border-radius:7px;padding:5px 8px;width:80px;outline:none">'
          + '<button type="button" id="op-emp-pack-ok" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:#5B6BFF;color:#fff;padding:6px 11px;border-radius:8px;cursor:pointer">Agregar</button>'
          + '<button type="button" id="op-emp-pack-cancel" style="font-family:inherit;font-size:12px;font-weight:700;border:none;background:none;color:#94A3B8;padding:6px 4px;cursor:pointer">Cancelar</button>'
          + '</span>'
        : '<button type="button" id="op-emp-pack-new" style="display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:12.5px;font-weight:700;border:1.5px dashed #C4B5FD;background:#FAF9FF;color:#7C3AED;padding:6px 12px;border-radius:999px;cursor:pointer">+ Crear empaque</button>');
  }
}

function opCheckDirty() {
  var dirty = JSON.stringify(_opDraft) !== JSON.stringify(_opSaved);
  var btnSave    = $('op-btn-save');
  var btnDiscard = $('op-btn-discard');
  if (btnSave)    btnSave.disabled = !dirty;
  if (btnDiscard) btnDiscard.hidden = !dirty;
  // La sección Impuestos y propina comparte el mismo borrador/guardado.
  var pSave    = $('prop-btn-save');
  var pDiscard = $('prop-btn-discard');
  if (pSave)    pSave.disabled = !dirty;
  if (pDiscard) pDiscard.hidden = !dirty;
}

// ── Toast ─────────────────────────────────────────────────
function opToast(msg) {
  var t = $('toast'); var m = $('toast-msg');
  if (!t || !m) return;
  m.textContent = msg;
  t.hidden = false;
  clearTimeout(opToast._tid);
  opToast._tid = setTimeout(function(){ t.hidden = true; }, 2200);
}

// ── Bind events ───────────────────────────────────────────
function opBindEvents() {
  var screen = $('screen-operacion');
  if (!screen || screen._opBound) return;
  screen._opBound = true;

  // Steppers
  screen.querySelectorAll('.num-stepper').forEach(function(stepper) {
    var field = stepper.dataset.field;
    var min   = parseInt(stepper.dataset.min, 10);
    var max   = parseInt(stepper.dataset.max, 10);
    stepper.querySelectorAll('.cf-step').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var delta = parseInt(btn.dataset.step, 10);
        var cur   = _opDraft[field] || 0;
        _opDraft[field] = Math.min(max, Math.max(min, cur + delta));
        opRender();
      });
    });
  });

  // Toggle propina obligatoria
  var swPropina = $('op-sw-propina');
  if (swPropina) swPropina.addEventListener('click', function() {
    var aplicar = function () { _opDraft.propinaObligatoria = !_opDraft.propinaObligatoria; opRender(); };
    // Cambiar la propina obligatoria requiere permiso config.propina; sin él, PIN.
    if (window.posGuard) window.posGuard('config.propina', aplicar, 'Cambiar la propina obligatoria requiere permiso de administrador.');
    else aplicar();
  });

  // Toggle cobro adelantado
  var swCobro = $('op-sw-cobro');
  if (swCobro) swCobro.addEventListener('click', function() {
    _opDraft.cobroAdelantado = !_opDraft.cobroAdelantado;
    opRender();
  });

  // Meta diaria — formateo en tiempo real
  var metaInput = $('op-metaDiaria');
  if (metaInput) {
    metaInput.addEventListener('input', function() {
      var raw = metaInput.value.replace(/\D/g, '');
      _opDraft.metaDiaria = parseInt(raw, 10) || 0;
      // Re-formatear sin mover el cursor
      metaInput.value = (_opDraft.metaDiaria).toLocaleString('es-CO');
      opCheckDirty();
    });
  }

  // PIN — solo dígitos
  var pinInput = $('op-pin-input');
  if (pinInput) {
    pinInput.addEventListener('input', function() {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  // PIN — mostrar/ocultar
  var pinEye = $('op-pin-eye');
  if (pinEye && pinInput) {
    pinEye.addEventListener('click', function() {
      pinInput.type = pinInput.type === 'password' ? 'text' : 'password';
    });
  }

  // PIN — guardar
  var pinSaveBtn = $('op-pin-save');
  if (pinSaveBtn && pinInput) {
    pinSaveBtn.addEventListener('click', function() {
      var val = pinInput.value.trim();
      if (!/^\d{4}$/.test(val)) { opToast('El PIN debe tener exactamente 4 dígitos'); return; }
      var wasPin = !!_opDraft.pin;
      _opDraft.pin = val;
      // El PIN se guarda de inmediato (igual que guardar todo)
      _opSaved = Object.assign({}, _opDraft);
      opSave(_opSaved);
      // C1: Persistir PIN en Supabase (pos_users.pin)
      if (_cfgBranchId && typeof sb !== 'undefined') {
        sb.from('pos_users').update({ pin: val })
          .eq('branch_id', _cfgBranchId)
          .eq('is_authorized_admin', true)
          .then(function(r){ if (r.error) console.warn('[cfg] pin sync error:', r.error); });
      }
      pinInput.value = '';
      pinInput.type = 'password';
      opRender();
      opToast(wasPin ? 'PIN actualizado' : 'PIN establecido');
    });
  }

  // Guardar todo
  var btnSave = $('op-btn-save');
  if (btnSave) {
    btnSave.addEventListener('click', function() {
      _opSaved = Object.assign({}, _opDraft);
      opSave(_opSaved);
      opRender();
      opToast('Cambios de operación guardados');
    });
  }

  // Etiquetas de venta rápida — switch + crear/borrar (delegación de clics)
  var swEtq = $('op-sw-etiquetas');
  if (swEtq) swEtq.addEventListener('click', function () {
    _opDraft.etiquetasVRActivo = !_opDraft.etiquetasVRActivo;
    opRender(); opCheckDirty();
  });
  var etqWrap = $('op-etiquetas-body');
  if (etqWrap) etqWrap.addEventListener('click', function (e) {
    var t = e.target.closest('[data-etq-del],#op-etq-new,#op-etq-ok,#op-etq-cancel');
    if (!t) return;
    if (t.id === 'op-etq-new') { _etqForm = true; opRenderEtiquetas(); var i = $('op-etq-nombre'); if (i) i.focus(); return; }
    if (t.id === 'op-etq-cancel') { _etqForm = false; opRenderEtiquetas(); return; }
    if (t.id === 'op-etq-ok') {
      var inp = $('op-etq-nombre');
      var nom = inp ? inp.value.trim() : '';
      if (!nom) { if (inp) inp.focus(); return; }
      _opDraft.etiquetasVR = (_opDraft.etiquetasVR || []).concat([{ id: 'et_' + Date.now().toString(36), nombre: nom }]);
      _etqForm = false; opRenderEtiquetas(); opCheckDirty(); return;
    }
    if (t.dataset.etqDel) {
      _opDraft.etiquetasVR = (_opDraft.etiquetasVR || []).filter(function (x) { return x.id !== t.dataset.etqDel; });
      opRenderEtiquetas(); opCheckDirty(); return;
    }
  });

  // Exigir etiqueta: opcional / solo para recoger / siempre
  var exWrap = $('op-etq-exigir');
  if (exWrap) exWrap.addEventListener('click', function (e) {
    var b = e.target.closest('[data-etq-exigir]');
    if (!b || !_opDraft) return;
    _opDraft.etiquetasVRExigir = b.dataset.etqExigir;
    opRenderEtiquetas(); opCheckDirty();
  });

  // Notas frecuentes — segmented + crear/borrar (delegación de clics)
  var notasCont = $('op-notas-cont');
  if (notasCont) {
    notasCont.addEventListener('click', function (e) {
      var t = e.target.closest('[data-nf-mode],[data-nf-catsel],#op-nf-add,[data-nf-del]');
      if (!t) return;
      if (t.dataset.nfMode) { _opDraft.notasFrecuentes.modo = t.dataset.nfMode; opRenderNotas(); opCheckDirty(); return; }
      if (t.dataset.nfCatsel) { _notasSelCat = t.dataset.nfCatsel; opRenderNotas(); return; }
      if (t.id === 'op-nf-add') {
        var inp = $('op-nf-input'); var v = inp ? inp.value.trim() : '';
        if (!v) { if (inp) inp.focus(); return; }
        var list = _notasActiveList();
        if (list.indexOf(v) < 0) list.push(v);
        opRenderNotas(); opCheckDirty();
        var i2 = $('op-nf-input'); if (i2) i2.focus();
        return;
      }
      if (t.dataset.nfDel) {
        var list2 = _notasActiveList();
        var idx = list2.indexOf(t.dataset.nfDel);
        if (idx >= 0) list2.splice(idx, 1);
        opRenderNotas(); opCheckDirty();
        return;
      }
    });
    notasCont.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'op-nf-input') { e.preventDefault(); var b = $('op-nf-add'); if (b) b.click(); }
    });
  }

  // C3b — Empaques switch
  var swEmpaques = $('op-sw-empaques');
  if (swEmpaques) swEmpaques.addEventListener('click', function() {
    _opDraft.empaquesActivo = !_opDraft.empaquesActivo;
    opRender();
  });

  // C3b — Empaques selects & inputs
  ['op-empaque-tipo', 'op-empaque-base', 'op-empaque-canal'].forEach(function(id) {
    var sel = $(id);
    if (!sel) return;
    sel.addEventListener('change', function() {
      var field = sel.getAttribute('data-op-field');
      if (field) _opDraft[field] = sel.value;
      // toggle domi row visibility
      var domiRow = $('op-empaque-domi-row');
      if (domiRow) domiRow.style.display = (_opDraft.empaqueCanal === 'distinto') ? '' : 'none';
      var unitLbls = document.querySelectorAll('#op-empaque-unit, #op-empaque-unit-domi');
      unitLbls.forEach(function(el) { el.textContent = _opDraft.empaqueTipo === 'porcentaje' ? '%' : 'COP'; });
      opCheckDirty();
    });
  });

  // C3b — Modo unificado / específico
  var btnModoUni = $('op-emp-modo-uni');
  var btnModoEsp = $('op-emp-modo-esp');
  if (btnModoUni) btnModoUni.addEventListener('click', function(){ _opDraft.empaqueModo = 'unificado'; opRender(); });
  if (btnModoEsp) btnModoEsp.addEventListener('click', function(){ _opDraft.empaqueModo = 'especifico'; opRender(); });

  // C3b — Panel específico (delegación: se re-renderiza completo en cada cambio)
  var espWrap = $('op-emp-especifico');
  if (espWrap) {
    espWrap.addEventListener('click', function(e){
      var t = e.target.closest('[data-emp-open],[data-emp-open-prod],[data-emp-cat-toggle],[data-emp-pack-del],#op-emp-pack-new,#op-emp-pack-ok,#op-emp-pack-cancel');
      if (!t) return;
      if (t.dataset.empOpen) { _empOpen[t.dataset.empOpen] = !_empOpen[t.dataset.empOpen]; opRenderEmpEsp(); return; }
      if (t.dataset.empOpenProd) { _empOpenProd[t.dataset.empOpenProd] = !_empOpenProd[t.dataset.empOpenProd]; opRenderEmpEsp(); return; }
      if (t.dataset.empCatToggle) {
        var cid = t.dataset.empCatToggle;
        var cc = Object.assign({}, (_opDraft.empaqueCatCfg || {})[cid] || {});
        cc.on = cc.on === false;   // invertir (default true)
        _opDraft.empaqueCatCfg = Object.assign({}, _opDraft.empaqueCatCfg, {});
        _opDraft.empaqueCatCfg[cid] = cc;
        opRenderEmpEsp(); opCheckDirty(); return;
      }
      if (t.dataset.empPackDel) {
        var pid = t.dataset.empPackDel;
        var usado = Object.keys(_opDraft.empaqueProdCfg || {}).some(function(k){ return _opDraft.empaqueProdCfg[k] === pid; })
                 || Object.keys(_opDraft.empaqueCatCfg || {}).some(function(k){ return (_opDraft.empaqueCatCfg[k] || {}).packId === pid; })
                 || Object.keys(_opDraft.empaquePresCfg || {}).some(function(k){ return _opDraft.empaquePresCfg[k] === pid; });
        if (usado && !confirm('Este empaque está asignado. Al eliminarlo, esos productos volverán a heredar su categoría. ¿Eliminar?')) return;
        _opDraft.empaquePacks = (_opDraft.empaquePacks || []).filter(function(p){ return p.id !== pid; });
        Object.keys(_opDraft.empaqueProdCfg || {}).forEach(function(k){ if (_opDraft.empaqueProdCfg[k] === pid) delete _opDraft.empaqueProdCfg[k]; });
        Object.keys(_opDraft.empaqueCatCfg || {}).forEach(function(k){ if ((_opDraft.empaqueCatCfg[k] || {}).packId === pid) _opDraft.empaqueCatCfg[k].packId = null; });
        Object.keys(_opDraft.empaquePresCfg || {}).forEach(function(k){ if (_opDraft.empaquePresCfg[k] === pid) delete _opDraft.empaquePresCfg[k]; });
        opRenderEmpEsp(); opCheckDirty(); return;
      }
      // prompt() NO existe en Electron → formulario inline
      if (t.id === 'op-emp-pack-new') { _empPackForm = true; opRenderEmpEsp(); var ni = $('op-emp-pack-nombre'); if (ni) ni.focus(); return; }
      if (t.id === 'op-emp-pack-cancel') { _empPackForm = false; opRenderEmpEsp(); return; }
      if (t.id === 'op-emp-pack-ok') {
        var ni2 = $('op-emp-pack-nombre'), mi2 = $('op-emp-pack-monto');
        var nombre = ni2 ? ni2.value.trim() : '';
        var monto = mi2 ? (parseInt(mi2.value, 10) || 0) : 0;
        if (!nombre) { if (ni2) ni2.focus(); return; }
        if (monto <= 0) { if (mi2) mi2.focus(); return; }
        _opDraft.empaquePacks = (_opDraft.empaquePacks || []).concat([{ id: 'pk_' + Date.now().toString(36), nombre: nombre, monto: monto }]);
        _empPackForm = false;
        opRenderEmpEsp(); opCheckDirty(); return;
      }
    });
    espWrap.addEventListener('change', function(e){
      var t = e.target;
      if (t.dataset && t.dataset.empCatPack !== undefined) {
        var cid = t.dataset.empCatPack;
        var cc = Object.assign({}, (_opDraft.empaqueCatCfg || {})[cid] || {});
        cc.packId = t.value || null;
        _opDraft.empaqueCatCfg = _opDraft.empaqueCatCfg || {};
        _opDraft.empaqueCatCfg[cid] = cc;
        opRenderEmpEsp(); opCheckDirty(); return;
      }
      if (t.dataset && t.dataset.empProd !== undefined) {
        _opDraft.empaqueProdCfg = _opDraft.empaqueProdCfg || {};
        if (t.value) _opDraft.empaqueProdCfg[t.dataset.empProd] = t.value;
        else delete _opDraft.empaqueProdCfg[t.dataset.empProd];
        opRenderEmpEsp(); opCheckDirty(); return;
      }
      if (t.dataset && t.dataset.empPres !== undefined) {
        _opDraft.empaquePresCfg = _opDraft.empaquePresCfg || {};
        if (t.value) _opDraft.empaquePresCfg[t.dataset.empPres] = t.value;
        else delete _opDraft.empaquePresCfg[t.dataset.empPres];
        opRenderEmpEsp(); opCheckDirty(); return;
      }
    });
  }
  var inpEmpVal = $('op-empaqueVal');
  if (inpEmpVal) inpEmpVal.addEventListener('input', function() {
    var v = parseFloat(this.value) || 0;
    if (_opDraft.empaqueTipo === 'porcentaje') _opDraft.empaquePct = v; else _opDraft.empaqueMonto = v;
    opCheckDirty();
  });
  var inpEmpValDomi = $('op-empaqueValDomi');
  if (inpEmpValDomi) inpEmpValDomi.addEventListener('input', function() {
    var v = parseFloat(this.value) || 0;
    if (_opDraft.empaqueTipo === 'porcentaje') _opDraft.empaquePctDomicilio = v; else _opDraft.empaqueMontoDomicilio = v;
    opCheckDirty();
  });
  var inpCategIds = $('op-empaqueCategIds');
  if (inpCategIds) inpCategIds.addEventListener('input', function() {
    _opDraft.empaqueCategIds = this.value;
    opCheckDirty();
  });

  // C6 — Recibo model cards
  document.querySelectorAll('[data-recibo]').forEach(function(card) {
    card.addEventListener('click', function() {
      var MODELS_KEY = 'pos.config.recibos.v1';
      var models;
      try { models = Object.assign({ descModel: 'estandar', finalModel: 'estandar' }, JSON.parse(localStorage.getItem(MODELS_KEY) || '{}')); }
      catch(e) { models = { descModel: 'estandar', finalModel: 'estandar' }; }
      if (card.dataset.recibo === 'desc') models.descModel = card.dataset.model;
      else models.finalModel = card.dataset.model;
      localStorage.setItem(MODELS_KEY, JSON.stringify(models));
      document.querySelectorAll('[data-recibo="desc"]').forEach(function(c) { c.classList.toggle('on', c.dataset.model === models.descModel); });
      document.querySelectorAll('[data-recibo="final"]').forEach(function(c) { c.classList.toggle('on', c.dataset.model === models.finalModel); });
      opToast('Modelo de recibo guardado');
    });
  });

  // Descartar
  var btnDiscard = $('op-btn-discard');
  if (btnDiscard) {
    btnDiscard.addEventListener('click', function() {
      _opDraft = JSON.parse(JSON.stringify(_opSaved));
      opRender();
    });
  }
}

// ════════════════════════════════════════════════════════════
// IMPUESTOS — Configuración → Impuestos y propina
// Viaja dentro del mismo blob operacion_config, así que se sincroniza a la
// base y a todos los equipos igual que el resto de Operación.
// ════════════════════════════════════════════════════════════
var IMP_TARIFAS = { inc: 8, iva: 19 };

function impLeerCfg() {
  var d = _opDraft || opLoad();
  return Object.assign((window.posImpuestos ? posImpuestos.defaults() : {}), d.impuestos || {});
}
function impGuardarCfg(patch) {
  var d = _opDraft || opLoad();
  d.impuestos = Object.assign(impLeerCfg(), patch || {});
  _opDraft = d;
  opSave(d);
  if (window.posImpuestos) posImpuestos.setConfig(d.impuestos);
  impPintar();
  return d.impuestos;
}

function impToggleActivo() { impGuardarCfg({ activo: !impLeerCfg().activo }); }
function impSetTipo(t) {
  var patch = { tipo: t };
  if (IMP_TARIFAS[t] != null) patch.pct = IMP_TARIFAS[t];
  impGuardarCfg(patch);
}
function impSetIncluido(v) { impGuardarCfg({ incluido: !!v }); }

// Pinta toda la tarjeta a partir de la config guardada.
function impPintar() {
  var c = impLeerCfg();

  var sw = document.getElementById('toggle-imp-sw');
  if (sw) {
    sw.classList.toggle('on', c.activo);
    var lbl = sw.querySelector('.iv-switch-label');
    if (lbl) lbl.textContent = c.activo ? 'Sí' : 'No';
  }
  var box = document.getElementById('toggle-imp');
  if (box) box.classList.toggle('on', c.activo);

  var st = document.getElementById('imp-state');
  if (st) {
    st.textContent = c.activo ? ((window.posImpuestos ? posImpuestos.nombre() : 'Impuesto') + ' ' + posImpuestos.fmtPct(c.pct) + '%') : 'Desactivado';
    st.className = 'op-state ' + (c.activo ? 'on' : 'off');
  }
  var hint = document.getElementById('imp-hint');
  if (hint) {
    hint.innerHTML = c.activo
      ? 'Cada venta guardará su base gravable y su impuesto, y el recibo lo mostrará desglosado.'
      : 'Tus precios se cobran tal cual, sin desglose. Si eres <b>no responsable de impoconsumo</b>, déjalo en No — es lo normal en un restaurante pequeño.';
  }
  var fields = document.getElementById('imp-fields');
  if (fields) fields.classList.toggle('is-hidden', !c.activo);

  document.querySelectorAll('[data-imp-tipo]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.impTipo === c.tipo);
  });
  var pw = document.getElementById('imp-pct-wrap');
  if (pw) pw.classList.toggle('is-hidden', c.tipo !== 'otro');
  var pct = document.getElementById('imp-pct');
  if (pct && document.activeElement !== pct) pct.value = c.pct;

  document.querySelectorAll('[data-imp-modo]').forEach(function (b) {
    b.classList.toggle('on', (b.dataset.impModo === '1') === !!c.incluido);
  });

  [['imp-nit', 'nit'], ['imp-razon', 'razon_social'], ['imp-resol', 'resolucion']].forEach(function (par) {
    var el = document.getElementById(par[0]);
    if (el && document.activeElement !== el) el.value = c[par[1]] || '';
  });

  impPintarEjemplo();
}

// El ejemplo en vivo: ver el efecto en un precio real quita el miedo a activarlo.
function impPintarEjemplo() {
  var out = document.getElementById('imp-ejemplo-out'); if (!out) return;
  var c = impLeerCfg();
  var pctEl = document.getElementById('imp-pct');
  if (c.tipo === 'otro' && pctEl) c.pct = parseFloat(pctEl.value) || 0;
  var precio = parseFloat((document.getElementById('imp-ejemplo') || {}).value) || 0;
  var money = function (n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); };
  var fila = function (l, v, clase) {
    return '<div class="imp-l' + (clase ? ' ' + clase : '') + '"><span>' + l + '</span><b>' + v + '</b></div>';
  };

  /* La propina sale de lo mismo que ve el cajero: el primer porcentaje
     sugerido. Si el restaurante no recibe propina, la linea no existe. */
  var d = _opDraft || _opSaved || null;
  var propAct = !!(d && d.propinaActiva);
  var propPct = 0;
  if (propAct && Array.isArray(d.propinaPorcentajes) && d.propinaPorcentajes.length) {
    propPct = parseFloat(d.propinaPorcentajes[0]) || 0;
  }

  var html = '';
  var total = precio;

  if (c.activo && window.posImpuestos) {
    posImpuestos.setConfig(c);
    var g = posImpuestos.desglosar(precio, c.pct);
    var nom = posImpuestos.nombre() + ' ' + posImpuestos.fmtPct(c.pct) + '%';
    total = g.total;
    html += fila('Base gravable', money(g.base))
          + fila(nom, money(g.impuesto));
  } else {
    /* Sin impuestos no hay desglose que mostrar: el precio es el precio. */
    html += fila('Producto', money(precio));
  }

  var propina = propPct > 0 ? Math.round(precio * propPct / 100) : 0;
  if (propina > 0) { html += fila('Propina ' + propPct + '%', money(propina)); total += propina; }

  html += fila('El cliente paga', money(total), 'tot');

  if (c.activo) {
    html += c.incluido
      ? '<div class="imp-nota ok">Tu carta sigue diciendo ' + money(precio) + '. El impuesto ya estaba adentro.</div>'
      : '<div class="imp-nota mal">Ojo: al cliente se le cobra ' + money(total) + ', no ' + money(precio) + '.</div>';
  }
  if (propina > 0) {
    html += '<div class="imp-nota">La propina se suma aparte y el cliente la puede quitar al pagar.</div>';
  } else if (!propAct) {
    html += '<div class="imp-nota">No recibes propina, así que no se le suma nada al cliente.</div>';
  }

  out.innerHTML = html;
}

// Guardar lo que se escribe a mano (tarifa "otro", NIT, razón social, resolución).
function impBindInputs() {
  [['imp-pct', 'pct', true], ['imp-nit', 'nit'], ['imp-razon', 'razon_social'], ['imp-resol', 'resolucion']]
    .forEach(function (par) {
      var el = document.getElementById(par[0]); if (!el) return;
      el.addEventListener('blur', function () {
        var v = par[2] ? (parseFloat(el.value) || 0) : el.value.trim();
        var patch = {}; patch[par[1]] = v;
        impGuardarCfg(patch);
      });
    });
}

// ════════════════════════════════════════════════════════════
// LISTAS DE ENVÍO — Configuración → Asistente IA → Plantillas
// Meta limita las conversaciones que inicia el negocio (hoy 250 cada 24 h), así
// que el envío va por tandas desde una COLA con estado: se sabe a quién ya se
// le escribió y se puede retomar mañana sin repetir ni saltarse a nadie.
// ════════════════════════════════════════════════════════════
var _wlListas = [];

// Mismo patrón que el resto de llamadas a Edge Functions (ver manageUser).
async function wlToken() {
  /* Igual que arriba: sin sesion se devuelve null y quien llama decide. */
  try { var s = await sb.auth.getSession(); return (s.data.session && s.data.session.access_token) || null; }
  catch (e) { return null; }
}

async function wlCargar() {
  var host = document.getElementById('wlLista');
  if (!host) return;
  host.innerHTML = '<div class="cfg-empty">Cargando…</div>';

  // La pestaña se activa al cargar la página, ANTES de que la sesión resuelva
  // la sucursal. Sin esperarla, la consulta salía con branch_id "null" y la
  // base respondía "invalid input syntax for type uuid".
  var bid = _cfgBranchId || (window._pos && window._pos.state && window._pos.state.branchId);
  if (!bid) {
    for (var t = 0; t < 40 && !bid; t++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      bid = _cfgBranchId || (window._pos && window._pos.state && window._pos.state.branchId);
    }
  }
  if (!bid) { host.innerHTML = '<div class="cfg-empty">No se pudo identificar la sucursal. Recarga la página.</div>'; return; }
  _cfgBranchId = _cfgBranchId || bid;

  try {
    var r = await sb.from('pos_wa_listas').select('*').eq('branch_id', bid)
      .order('created_at', { ascending: false });
    if (r.error) throw r.error;
    _wlListas = r.data || [];

    // Conteo por estado. Se pide un CONTEO, no las filas: PostgREST corta en
    // 1000 filas aunque se pida `.limit(5000)`, y con 1.381 contactos la
    // pantalla mostraba 1.000 — un número falso que asustaba con razón.
    var ESTADOS = ['pendiente', 'enviado', 'fallido', 'omitido', 'respondio'];
    for (var i = 0; i < _wlListas.length; i++) {
      var L = _wlListas[i];
      var por = {}, total = 0;
      for (var k = 0; k < ESTADOS.length; k++) {
        var e = ESTADOS[k];
        var r2 = await sb.from('pos_wa_envios')
          .select('id', { count: 'exact', head: true })
          .eq('lista_id', L.id).eq('estado', e);
        por[e] = r2.count || 0;
        total += por[e];
      }
      L._c = por;
      L._total = total;
    }
  } catch (e) {
    host.innerHTML = '<div class="cfg-empty">No se pudo cargar: ' + (e.message || e) + '</div>';
    return;
  }
  /* LAS PLANTILLAS APROBADAS (20-ago). Sin esto la lista se quedaba en
     "plantilla -" y no habia forma de decir QUE se manda. Solo las aprobadas:
     Meta rechaza el envio con una en revision, y ofrecerla seria ofrecer un
     error seguro. */
  try {
    var rp = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wa-plantillas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', branch_id: bid }),
    });
    var dp = await rp.json();
    _wlPlantillas = ((dp && dp.items) || []).filter(function (t) {
      return String(t.estado || t.status || '').toUpperCase() === 'APPROVED';
    });
  } catch (e) { _wlPlantillas = []; }

  wlRender();
  wlCupo();
}
var _wlPlantillas = [];

/* Escoger la plantilla de una lista. Queda guardada en la lista, asi que la
   proxima vez ya viene puesta. */
async function wlPlantilla(id, nombre){
  var L = (_wlListas || []).filter(function (x) { return x.id === id; })[0];
  if (!L) return;
  var f = Object.assign({}, L.filtros || {}, { plantilla: nombre });
  try {
    var r = await sb.from('pos_wa_listas').update({ filtros: f }).eq('id', id);
    if (r.error) throw r.error;
    L.filtros = f;
    wlRender();
  } catch (e) {
    var res = document.getElementById('wlRes-' + id);
    if (res) res.textContent = 'No se pudo guardar la plantilla: ' + (e.message || e);
  }
}

// Cuánto queda del cupo diario de Meta. Se pregunta al servidor porque la
// ventana es de 24 h móviles, no del día calendario.
async function wlCupo() {
  var el = document.getElementById('wlCupo');
  if (!el || !_wlListas.length) return;
  try {
    var r = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wa-enviar-lista', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await wlToken()) },
      body: JSON.stringify({ lista_id: _wlListas[0].id, branch_id: (_cfgBranchId || (window._pos && window._pos.state && window._pos.state.branchId)), solo_contar: true }),
    });
    var d = await r.json();
    if (d && d.ok) {
      el.innerHTML = 'Hoy puedes enviar <b>' + d.disponible + '</b> mensajes más '
        + '<span style="color:#94A3B8">(' + d.enviados24h + ' enviados en las últimas 24 h · límite ' + d.limite + ')</span>';
    }
  } catch (e) { /* si falla, no se bloquea la pantalla */ }
}

function wlRender() {
  var host = document.getElementById('wlLista'); if (!host) return;
  if (!_wlListas.length) {
    host.innerHTML = '<div class="cfg-empty">Todavía no hay listas de envío.</div>';
    return;
  }
  host.innerHTML = _wlListas.map(function (L) {
    var c = L._c || {};
    var pend = c.pendiente || 0, env = c.enviado || 0, fall = c.fallido || 0;
    var plant = (L.filtros && L.filtros.plantilla) || '';
    var hechos = env + fall + (c.omitido || 0);
    var pct = L._total ? Math.round(hechos / L._total * 100) : 0;
    return '<div class="wl-row">'
      + '<div class="wl-top">'
      +   '<div><div class="wl-nom">' + (L.nombre || 'Lista') + '</div>'
      +     '<div class="wl-sub">' + (L._total || 0) + ' contactos'
      +       (L._total ? '' : ' - se arman al enviar') + '</div>'
      +     '<div style="margin-top:6px;display:flex;align-items:center;gap:7px;flex-wrap:wrap">'
      +       '<span style="font-size:11.5px;color:#94A3B8">Plantilla</span>'
      +       (_wlPlantillas.length
                ? '<select class="inp" style="padding:5px 8px;font-size:12px;width:auto" '
                  + 'onchange="wlPlantilla(\'' + L.id + '\', this.value)">'
                  + '<option value="">Escoge una...</option>'
                  + _wlPlantillas.map(function (t) {
                      var n = t.nombre || t.name || '';
                      return '<option value="' + n + '"' + (n === plant ? ' selected' : '') + '>' + n + '</option>';
                    }).join('')
                  + '</select>'
                : '<span style="font-size:11.5px;color:#DC2626">No tienes plantillas aprobadas todavia</span>')
      +     '</div></div>'
      +   (L.envio_activo
            /* Armada: el servidor la esta terminando. El boton pasa a ser el
               de detener, porque es lo unico que queda por decidir. */
            ? '<button type="button" class="cfg-qr-btn ghost" onclick="wlDetener(\'' + L.id + '\')">Detener</button>'
            /* SIN PLANTILLA NO SE MANDA NADA: primero hay que escogerla. */
            : !plant
            ? '<button type="button" class="cfg-qr-btn" disabled>Escoge una plantilla</button>'
            /* UNA LISTA RECIEN CREADA TIENE 0 PENDIENTES porque todavia no se
               ha armado, no porque este terminada. Antes salia "Lista
               completada" con el boton apagado y no habia como estrenarla. */
            : (pend || !L._total)
            ? '<button type="button" class="cfg-qr-btn" onclick="wlEnviar(\'' + L.id + '\')" id="wlBtn-' + L.id + '">'
              + (pend ? 'Enviar tanda de hoy' : 'Armar y enviar') + '</button>'
            /* Ya se mandaron todos. Se deja volver a armar: desde entonces
               pueden haber entrado contactos nuevos que cumplen los filtros. */
            : '<button type="button" class="cfg-qr-btn ghost" onclick="wlEnviar(\'' + L.id + '\')" id="wlBtn-' + L.id + '">Buscar nuevos y enviar</button>')
      + '</div>'
      + '<div class="wl-bar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="wl-nums">'
      +   '<span class="ok">' + env + ' enviados</span>'
      +   '<span>' + pend + ' pendientes</span>'
      +   (fall ? '<span class="bad">' + fall + ' fallidos</span>' : '')
      +   '<span class="pct">' + pct + '%</span>'
      + '</div>'
      + (L.envio_activo
          ? '<div class="wl-vivo">Enviando\u2026 ya puedes cerrar esta pantalla, sigue solo.</div>'
          : '')
      + '<div class="wl-res" id="wlRes-' + L.id + '"></div>'
      + '</div>';
  }).join('');
  wlVigilar();
}

async function wlEnviar(id) {
  var L = _wlListas.filter(function (x) { return x.id === id; })[0];
  if (!L) return;
  var NL = String.fromCharCode(10);
  var pend = (L._c && L._c.pendiente) || 0;
  if (!confirm('Se va a enviar la plantilla "' + ((L.filtros && L.filtros.plantilla) || '') + '"' + NL
    + 'a los contactos de "' + L.nombre + '" que quepan en el cupo de hoy.' + NL + NL
    + 'Quedan ' + pend + ' pendientes en total.' + NL + NL
    + 'Ya puedes cerrar esta pantalla: el envio sigue solo.' + NL + NL
    + 'Enviar la tanda de hoy?')) return;

  var btn = document.getElementById('wlBtn-' + id);
  var res = document.getElementById('wlRes-' + id);
  if (btn) { btn.disabled = true; btn.textContent = 'Arrancando...'; }

  try {
    /* 0. SE LLENA LA COLA CON LOS QUE CUMPLEN LOS FILTROS (20-ago). Este paso
          no existia: se podian crear listas y se podia enviar, pero nadie metia
          los destinatarios. La unica campana que habia funciono porque su cola
          se lleno a mano desde el servidor. Se puede llamar cuantas veces se
          quiera: no vuelve a meter a quien ya esta en la lista, asi que armar
          otra vez solo agrega a los contactos nuevos. */
    if (btn) btn.textContent = 'Armando la lista...';
    var arm = await sb.rpc('fn_wa_armar_lista', { p_lista: id });
    if (arm.error) throw arm.error;
    var cuenta = (arm.data && arm.data[0]) || {};
    if (!Number(cuenta.total)){
      if (btn){ btn.disabled = false; btn.textContent = 'Enviar la tanda de hoy'; }
      if (res) res.textContent = 'Esta lista no tiene ningun contacto que cumpla sus filtros.';
      return;
    }

    /* 1. Se ARMA: es lo unico imprescindible. A partir de aqui el reloj de la
          base continua la tanda cada 2 minutos, aunque se cierre todo. */
    if (btn) btn.textContent = 'Arrancando...';
    var up = await sb.from('pos_wa_listas')
      .update({ envio_activo: true, envio_armado_at: new Date().toISOString() })
      .eq('id', id);
    if (up.error) throw up.error;

    /* 2. El primer empujon, para que se vea que arranco de una y no haya que
          esperar hasta dos minutos al primer tic. */
    var r = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wa-enviar-lista', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (await wlToken()) },
      body: JSON.stringify({ lista_id: id, branch_id: _cfgBranchId, cantidad: 250 }),
    });
    var d = await r.json();

    if (d && d.ok === false && d.razon === 'limite') {
      /* Sin cupo no hay nada que continuar: se desarma para no dejarlo colgado
         esperando un tic que no va a poder hacer nada. */
      await sb.from('pos_wa_listas').update({ envio_activo: false }).eq('id', id);
      if (res) res.innerHTML = '<span style="color:#B45309">\u26a0 ' + wlEsc(d.mensaje || 'Se acabo el cupo de hoy.') + '</span>';
    }
  } catch (e) {
    if (res) res.innerHTML = '<span style="color:#DC2626">No se pudo arrancar: ' + wlEsc(e.message || e) + '</span>';
  }
  await wlCargar();
  wlVigilar();
}

function wlEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* Detener a mitad de camino. Lo ya enviado queda enviado —no se le puede
   quitar un mensaje a nadie—; lo que para es lo que falta. */
async function wlDetener(id) {
  if (!confirm('Detener el envio?' + String.fromCharCode(10) + String.fromCharCode(10)
    + 'Lo que ya salio no se puede devolver. Los que falten quedan pendientes '
    + 'para cuando quieras seguir.')) return;
  try { await sb.from('pos_wa_listas').update({ envio_activo: false }).eq('id', id); }
  catch (e) { alert('No se pudo detener: ' + (e.message || e)); }
  await wlCargar();
}

/* Mientras la pantalla este abierta, se refresca sola para ver avanzar la
   tanda. Es solo un espejo: si se cierra, el envio sigue igual. */
var _wlVigia = null;
function wlVigilar() {
  if (_wlVigia) clearInterval(_wlVigia);
  var activas = (_wlListas || []).filter(function (l) { return l.envio_activo; }).length;
  if (!activas) return;
  _wlVigia = setInterval(async function () {
    if (!document.getElementById('wlLista')) { clearInterval(_wlVigia); _wlVigia = null; return; }
    await wlCargar();
    var quedan = (_wlListas || []).filter(function (l) { return l.envio_activo; }).length;
    if (!quedan) { clearInterval(_wlVigia); _wlVigia = null; }
  }, 20000);
}

// ════════════════════════════════════════════════════════════
// CRÉDITOS — Configuración (asignar cupos)
// Aquí SOLO se asignan y editan los cupos: es un acto del administrador y se
// hace poco. El día a día (ver saldos, registrar abonos) vive en Caja, porque
// el abono es plata que entra al turno y si no el arqueo no cuadra.
// ════════════════════════════════════════════════════════════
var _crTipo = 'cliente';     // pestaña activa
var _crLista = [];
var _crBuscar = '';

async function crInit() {
  var st = (window._pos && window._pos.state) || {};
  if (window.posCreditos) posCreditos.setCtx(st.tenantId, st.branchId);
  await crCargar();
}

async function crCargar() {
  var host = document.getElementById('cr-lista');
  if (host) host.innerHTML = '<div class="cf-empty">Cargando…</div>';
  try {
    _crLista = await posCreditos.listar();
  } catch (e) {
    if (host) host.innerHTML = '<div class="cf-empty">No se pudo cargar: ' + posCreditos.esc(e.message || e) + '</div>';
    return;
  }
  crRender();
}

function crSetTipo(t) { _crTipo = t; crRender(); }
function crBuscarInput(v) { _crBuscar = (v || '').toLowerCase().trim(); crRender(); }

function crRender() {
  document.querySelectorAll('[data-cr-tab]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.crTab === _crTipo);
  });

  var lista = _crLista.filter(function (c) { return c.tipo === _crTipo; });
  if (_crBuscar) {
    lista = lista.filter(function (c) {
      return (c.nombre || '').toLowerCase().indexOf(_crBuscar) >= 0
          || (c.telefono || '').indexOf(_crBuscar) >= 0;
    });
  }

  // Resumen arriba: lo primero que quiere saber el dueño es cuánto le deben.
  var deuda = lista.reduce(function (a, c) { return a + (Number(c.saldo) || 0); }, 0);
  var cupo  = lista.reduce(function (a, c) { return a + (Number(c.cupo) || 0); }, 0);
  var res = document.getElementById('cr-resumen');
  if (res) {
    res.innerHTML =
        '<div class="cr-kpi"><b>' + lista.length + '</b><span>' + (_crTipo === 'cliente' ? 'clientes' : 'empleados') + '</span></div>'
      + '<div class="cr-kpi"><b>' + posCreditos.money(deuda) + '</b><span>deben hoy</span></div>'
      + '<div class="cr-kpi"><b>' + posCreditos.money(cupo) + '</b><span>cupo asignado</span></div>';
  }

  var host = document.getElementById('cr-lista'); if (!host) return;
  if (!lista.length) {
    host.innerHTML = '<div class="cf-empty">'
      + (_crBuscar ? 'Nadie coincide con “' + posCreditos.esc(_crBuscar) + '”.'
                   : 'Todavía no le has dado crédito a ningún ' + (_crTipo === 'cliente' ? 'cliente' : 'empleado') + '.')
      + '</div>';
    return;
  }

  host.innerHTML = lista.map(function (c) {
    var saldo = Number(c.saldo) || 0, disp = Number(c.disponible) || 0;
    // Semáforo por lo que le queda: rojo si ya no puede consumir.
    var tono = disp <= 0 ? 'bad' : (Number(c.cupo) > 0 && disp / Number(c.cupo) < 0.25) ? 'warn' : 'ok';
    return '<div class="cr-row' + (c.activo ? '' : ' off') + '">'
      + '<div class="cr-row-main">'
      +   '<div class="cr-nom">' + posCreditos.esc(c.nombre) + (c.activo ? '' : ' <span class="cr-off">desactivado</span>') + '</div>'
      +   '<div class="cr-sub">' + posCreditos.esc(c.telefono || c.documento || '—') + '</div>'
      + '</div>'
      + (function(){
            /* Barra de cupo: se ve de un vistazo a quien ya casi no se le
               puede fiar, sin tener que comparar dos cifras mentalmente. */
            var cu = Number(c.cupo) || 0;
            var usado = cu > 0 ? Math.min(100, Math.round(saldo / cu * 100)) : 0;
            var clase = tono === 'bad' ? ' bad' : tono === 'warn' ? ' warn' : '';
            return '<div class="cr-bar" title="' + usado + '% del cupo usado">'
                 + '<i class="' + clase.trim() + '" style="width:' + usado + '%"></i></div>';
          })()
      + '<div class="cr-num"><b>' + posCreditos.money(c.cupo) + '</b><span>cupo</span></div>'
      + '<div class="cr-num"><b>' + posCreditos.money(saldo) + '</b><span>debe</span></div>'
      + '<div class="cr-num ' + tono + '"><b>' + posCreditos.money(disp) + '</b><span>le queda</span></div>'
      + '<button class="lm-btn-ghost sm" onclick="crEditar(\'' + c.id + '\')">Editar</button>'
      + '</div>';
  }).join('');
}

// ── Alta y edición ─────────────────────────────────────────────────────
function crNuevo() { crModal(null); }
function crEditar(id) { crModal(_crLista.filter(function (c) { return c.id === id; })[0] || null); }

function crModal(c) {
  var esNuevo = !c;
  c = c || { tipo: _crTipo, nombre: '', telefono: '', documento: '', cupo: 0, activo: true, notas: '' };
  var ov = document.createElement('div');
  ov.id = 'cr-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px';
  var esCliente = c.tipo === 'cliente';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:20px 22px;width:420px;max-width:94vw;font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35);max-height:90vh;overflow:auto">'
    + '<div style="font-size:15px;font-weight:800;color:#0F172A">' + (esNuevo ? 'Dar crédito a un ' + (esCliente ? 'cliente' : 'empleado') : posCreditos.esc(c.nombre)) + '</div>'
    + '<div style="font-size:12.5px;color:#64748B;margin:5px 0 14px;line-height:1.5">El cupo es el máximo que puede deber. Al llegar al límite, el sistema no lo deja pagar con crédito hasta que abone.</div>'
    + (esNuevo ? '<div class="iv-field-label">¿Para quién?</div>'
        + '<div style="display:flex;gap:6px;margin-bottom:12px" id="cr-m-tipo">'
        + '<button type="button" class="iv-chip ' + (esCliente ? 'on' : '') + '" onclick="crMTipo(\'cliente\')">Cliente</button>'
        + '<button type="button" class="iv-chip ' + (!esCliente ? 'on' : '') + '" onclick="crMTipo(\'empleado\')">Empleado</button>'
        + '</div>' : '')
    + '<div class="iv-field-label">Nombre</div>'
    + '<input id="cr-m-nombre" class="iv-input" style="width:100%" value="' + posCreditos.esc(c.nombre) + '" placeholder="Nombre y apellido">'
    + '<div style="display:flex;gap:8px;margin-top:10px">'
    +   '<div style="flex:1"><div class="iv-field-label">Teléfono</div>'
    +     '<input id="cr-m-tel" class="iv-input" style="width:100%" value="' + posCreditos.esc(c.telefono || '') + '"></div>'
    +   '<div style="flex:1"><div class="iv-field-label">Documento</div>'
    +     '<input id="cr-m-doc" class="iv-input" style="width:100%" value="' + posCreditos.esc(c.documento || '') + '"></div>'
    + '</div>'
    + '<div class="iv-field-label" style="margin-top:10px">Cupo</div>'
    + '<input id="cr-m-cupo" class="iv-input" type="number" min="0" step="any" style="width:100%" value="' + (Number(c.cupo) || 0) + '" oninput="crMPreview()">'
    + '<div id="cr-m-prev" style="font-size:12px;color:#64748B;margin-top:6px;min-height:17px"></div>'
    + '<div class="iv-field-label" style="margin-top:10px">Nota (opcional)</div>'
    + '<input id="cr-m-notas" class="iv-input" style="width:100%" value="' + posCreditos.esc(c.notas || '') + '" placeholder="Ej. cocinero, paga los viernes">'
    + (esNuevo ? '' :
        '<div class="iv-toggle" id="cr-m-activo" onclick="crMToggleActivo()" style="margin-top:12px">'
        + '<div style="flex:1"><div class="tt">Crédito activo</div><div class="tx">Si lo apagas, no podrá volver a pagar con crédito. Su historial y su deuda se conservan.</div></div>'
        + '<span class="iv-switch' + (c.activo ? ' on' : '') + '" id="cr-m-activo-sw"><span class="iv-switch-label">' + (c.activo ? 'Sí' : 'No') + '</span><span class="iv-switch-track"><span class="iv-switch-knob"></span></span></span>'
        + '</div>')
    + '<div style="display:flex;gap:8px;margin-top:16px">'
    +   '<button style="flex:1;padding:11px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer" onclick="document.getElementById(\'cr-ov\').remove()">Cancelar</button>'
    +   '<button style="flex:1;padding:11px;border-radius:10px;border:none;background:#5B6BFF;color:#fff;font-weight:700;font-size:13px;cursor:pointer" onclick="crGuardar()">Guardar</button>'
    + '</div></div>';
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  ov._cred = c;
  crMPreview();
  setTimeout(function () { var n = document.getElementById('cr-m-nombre'); if (n) n.focus(); }, 40);
}
function crMTipo(t) {
  var ov = document.getElementById('cr-ov'); if (!ov) return;
  ov._cred.tipo = t;
  ov.querySelectorAll('#cr-m-tipo .iv-chip').forEach(function (b, i) {
    b.classList.toggle('on', (i === 0) === (t === 'cliente'));
  });
}
function crMToggleActivo() {
  var ov = document.getElementById('cr-ov'); if (!ov) return;
  ov._cred.activo = !ov._cred.activo;
  var sw = document.getElementById('cr-m-activo-sw');
  if (sw) { sw.classList.toggle('on', ov._cred.activo); sw.querySelector('.iv-switch-label').textContent = ov._cred.activo ? 'Sí' : 'No'; }
}
function crMPreview() {
  var ov = document.getElementById('cr-ov'); if (!ov) return;
  var prev = document.getElementById('cr-m-prev'); if (!prev) return;
  var cupo = parseFloat((document.getElementById('cr-m-cupo') || {}).value) || 0;
  var saldo = Number(ov._cred.saldo) || 0;
  if (cupo <= 0) { prev.innerHTML = '<span style="color:#B45309">Con cupo en $0 no va a poder pagar con crédito.</span>'; return; }
  if (saldo > 0) {
    var disp = cupo - saldo;
    prev.innerHTML = 'Debe ' + posCreditos.money(saldo) + ' → le quedarían <b>' + posCreditos.money(Math.max(0, disp)) + '</b>'
      + (disp < 0 ? ' <span style="color:#DC2626;font-weight:700">(el cupo queda por debajo de lo que ya debe)</span>' : '');
  } else {
    prev.textContent = 'Podrá consumir hasta ' + posCreditos.money(cupo) + ' antes de tener que abonar.';
  }
}
async function crGuardar() {
  var ov = document.getElementById('cr-ov'); if (!ov) return;
  var c = ov._cred;
  c.nombre = (document.getElementById('cr-m-nombre').value || '').trim();
  c.telefono = (document.getElementById('cr-m-tel').value || '').trim();
  c.documento = (document.getElementById('cr-m-doc').value || '').trim();
  c.cupo = parseFloat(document.getElementById('cr-m-cupo').value) || 0;
  c.notas = (document.getElementById('cr-m-notas').value || '').trim();
  if (!c.nombre) { opToast('El nombre es obligatorio'); return; }
  try {
    await posCreditos.guardar(c);
    ov.remove();
    _crTipo = c.tipo;
    await crCargar();
    opToast('Crédito guardado');
  } catch (e) { opToast('No se pudo guardar: ' + (e.message || e)); }
}

// ── Impuestos y propina ───────────────────────────────────────────────
// Comparte _opDraft / _opSaved con Operación (mismo blob operacion_config).
/* ══ FACTURACION ELECTRONICA — la resolucion de la DIAN (21-ago-2026) ══
   Aqui SOLO se cargan los datos de la resolucion. El consecutivo (el
   numero de cada factura) NO se toca desde aqui a proposito: lo lleva la
   base con bloqueo, porque repetir o saltar un numero no es un error de
   pantalla, es un problema legal. */
var _dianRango = null;
function dianTenant() {
  return (window._pos && window._pos.state && window._pos.state.tenantId) || null;
}
function dianBranch() {
  return (window._pos && window._pos.state && window._pos.state.branchId) || null;
}

function dianTocar() {
  var b = $('dian-btn-save');
  if (b) b.disabled = false;
}

async function dianInit() {
  var b = $('dian-btn-save');
  if (b) b.onclick = dianGuardar;
  await dianCargar();
}

async function dianCargar() {
  try {
    var r = await sb.from('pos_facturacion_rangos')
      .select('id,resolucion,prefijo,desde,hasta,actual,vence_at')
      .eq('tenant_id', dianTenant()).eq('activo', true).limit(1);
    _dianRango = (r.data && r.data[0]) || null;
  } catch (e) { console.error('[dian] cargar:', e); _dianRango = null; }
  dianPintar();
}

function dianPintar() {
  var d = _dianRango;
  var set = function (id, v) { var el = $(id); if (el) el.value = v == null ? '' : v; };
  set('dian-resolucion', d && d.resolucion);
  set('dian-prefijo',    d && d.prefijo);
  set('dian-desde',      d && d.desde);
  set('dian-hasta',      d && d.hasta);
  set('dian-vence',      d && d.vence_at);

  var estado = $('dian-state'), sub = $('dian-estado-sub'), wrap = $('dian-barra-wrap');
  var actualEl = $('dian-actual');
  if (!d) {
    if (estado) { estado.textContent = 'Sin configurar'; estado.className = 'op-state off'; }
    if (sub) sub.textContent = 'Todavía no has cargado ninguna.';
    if (wrap) wrap.classList.add('is-hidden');
    if (actualEl) actualEl.textContent = '—';
    return;
  }
  var total   = (Number(d.hasta) - Number(d.desde) + 1) || 0;
  var usados  = Math.max(0, (Number(d.actual) - Number(d.desde) + 1));
  var quedan  = Math.max(0, Number(d.hasta) - Number(d.actual));
  var pct     = total > 0 ? Math.min(100, Math.round((usados / total) * 100)) : 0;

  if (estado) { estado.textContent = 'Activa'; estado.className = 'op-state on'; }
  if (sub) sub.textContent = 'Resolución ' + (d.resolucion || '—') +
    (d.vence_at ? ' · vence el ' + dianFecha(d.vence_at) : '');
  if (wrap) wrap.classList.remove('is-hidden');
  if (actualEl) actualEl.textContent = Number(d.actual) < Number(d.desde)
    ? 'Ninguna todavía' : (d.prefijo || '') + d.actual;

  var q = $('dian-quedan');
  if (q) q.textContent = quedan.toLocaleString('es-CO') + (quedan === 1 ? ' factura disponible' : ' facturas disponibles');
  var u = $('dian-usados');
  if (u) u.textContent = 'Usaste ' + usados.toLocaleString('es-CO') + ' de ' + total.toLocaleString('es-CO') + ' (' + pct + '%)';
  var barra = $('dian-barra');
  if (barra) {
    barra.style.width = pct + '%';
    /* El color avisa antes que el texto: verde tranquilo, ambar hay que
       moverse, rojo ya es urgente. */
    barra.style.background = pct >= 90 ? '#DC2626' : pct >= 75 ? '#F59E0B' : '#5B6BFF';
  }

  /* LA ALERTA. Pedirle otra resolucion a la DIAN toma dias, asi que avisa
     con margen y dice QUE HACER, no solo que algo pasa. */
  var al = $('dian-alerta');
  if (al) {
    var msg = '';
    if (quedan === 0) {
      msg = '<b>Se acabaron los números de esta resolución.</b> No se pueden emitir más facturas hasta que cargues una nueva. Pídela en el portal de la DIAN.';
    } else if (pct >= 90) {
      msg = '<b>Te quedan ' + quedan + ' facturas.</b> Pide ya la resolución nueva en el portal de la DIAN: se demora unos días en salir.';
    } else if (pct >= 75) {
      msg = 'Vas por el ' + pct + '% del rango. Ve pidiendo la resolución nueva para no quedarte sin números.';
    }
    var dias = dianDiasPara(d.vence_at);
    if (dias !== null && dias <= 45 && dias >= 0) {
      msg += (msg ? '<br><br>' : '') + '<b>La resolución vence en ' + dias + ' días</b> (' + dianFecha(d.vence_at) + ').';
    } else if (dias !== null && dias < 0) {
      msg = '<b>Esta resolución ya venció</b> el ' + dianFecha(d.vence_at) + '. No se puede facturar con ella.';
    }
    al.innerHTML = msg;
    al.classList.toggle('is-hidden', !msg);
  }
}

function dianFecha(f) {
  if (!f) return '';
  var p = String(f).slice(0, 10).split('-');
  var M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return p[2] + ' ' + (M[Number(p[1]) - 1] || '') + ' ' + p[0];
}
function dianDiasPara(f) {
  if (!f) return null;
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(String(f).slice(0, 10) + 'T00:00:00') - hoy) / 86400000);
}

async function dianGuardar() {
  var res    = ($('dian-resolucion').value || '').trim();
  var pref   = ($('dian-prefijo').value || '').trim().toUpperCase();
  var desde  = parseInt($('dian-desde').value, 10);
  var hasta  = parseInt($('dian-hasta').value, 10);
  var vence  = ($('dian-vence').value || '') || null;
  var b = $('dian-btn-save');

  if (!res) return showToast('Escribe el número de la resolución.');
  if (!(desde > 0) || !(hasta > 0)) return showToast('Escribe el rango: desde qué número hasta cuál.');
  if (hasta < desde) return showToast('El "hasta" no puede ser menor que el "desde".');

  b.disabled = true; b.textContent = 'Guardando…';
  try {
    if (_dianRango) {
      /* CAMBIAR EL RANGO DE UNA RESOLUCION EN USO ES DELICADO: si ya se
         emitieron facturas, el nuevo rango tiene que seguir cubriendo el
         ultimo numero usado. Si no, se rechaza — mover el piso debajo de
         una factura ya emitida la deja fuera de la resolucion. */
      if (Number(_dianRango.actual) >= Number(_dianRango.desde) &&
          (desde > Number(_dianRango.actual) || hasta < Number(_dianRango.actual))) {
        b.disabled = false; b.textContent = 'Guardar cambios';
        return showToast('Ya emitiste la factura ' + (_dianRango.prefijo || '') + _dianRango.actual +
          ' con esta resolución, así que el rango tiene que seguir incluyéndola. ' +
          'Si es una resolución NUEVA, primero desactiva la actual.');
      }
      var up = await sb.from('pos_facturacion_rangos')
        .update({ resolucion: res, prefijo: pref, desde: desde, hasta: hasta, vence_at: vence })
        .eq('id', _dianRango.id).select('id');
      if (up.error) throw up.error;
    } else {
      var ins = await sb.from('pos_facturacion_rangos').insert({
        tenant_id: dianTenant(), branch_id: dianBranch(),
        resolucion: res, prefijo: pref, desde: desde, hasta: hasta,
        /* `actual` arranca en desde-1: aun no se ha emitido ninguna. */
        actual: desde - 1, vence_at: vence, activo: true,
      }).select('id');
      if (ins.error) throw ins.error;
    }
    await dianCargar();
    b.textContent = 'Guardar cambios';
    showToast('Resolución guardada 👍');
  } catch (e) {
    console.error('[dian] guardar:', e);
    b.disabled = false; b.textContent = 'Guardar cambios';
    showToast('No se pudo guardar: ' + (e.message || e));
  }
}

/* ══ LA REGLA DE PUNTOS DE ESTE RESTAURANTE (21-ago-2026) ═════════════
   Vive en el MISMO blob que Operacion (branches.operacion_config), asi que
   se guarda con `opSave` y hereda su sincronizacion entre equipos, sus
   reintentos y su aviso si falla. Nada de un guardado paralelo. */
var _ptReglaDraft = null;

function ptReglaInit() {
  var op = opLoad() || {};
  var pu = op.puntos || {};
  _ptReglaDraft = {
    activo: pu.activo !== false,
    pesos: Number(pu.pesos_por_punto) > 0 ? Number(pu.pesos_por_punto) : 1000,
  };
  var inp = $('pt-pesos');
  if (inp) inp.value = _ptReglaDraft.pesos;
  ptReglaPintar();
  var b = $('pt-regla-save');
  if (b) b.disabled = true;
}

function ptReglaPintar() {
  var d = _ptReglaDraft; if (!d) return;
  var sw = $('pt-toggle-sw'), st = $('pt-regla-state'), campos = $('pt-regla-campos');
  if (sw) {
    sw.classList.toggle('on', d.activo);
    var lb = sw.querySelector('.iv-switch-label');
    if (lb) lb.textContent = d.activo ? 'Sí' : 'No';
  }
  if (st) { st.textContent = d.activo ? 'Activo' : 'Apagado'; st.className = 'op-state ' + (d.activo ? 'on' : 'off'); }
  if (campos) campos.classList.toggle('is-hidden', !d.activo);
  var hint = $('pt-toggle-hint');
  if (hint) hint.textContent = d.activo
    ? 'Los clientes acumulan puntos en cada pedido y los cambian por productos de la lista de abajo.'
    : 'Nadie acumula puntos y la lista de abajo no se usa. Los puntos que ya tengan tus clientes NO se borran.';

  /* EL EJEMPLO EN VIVO: es lo que de verdad se entiende. Un numero suelto
     ("1 punto por cada 1000") no dice nada; "un pedido de $30.000 da 30
     puntos" si. */
  var ej = $('pt-ejemplo');
  if (ej) {
    var por = Number(d.pesos) > 0 ? Number(d.pesos) : 1000;
    var demo = 30000;
    ej.textContent = 'Un pedido de $ 30.000 le da ' + Math.floor(demo / por) + ' puntos al cliente.';
  }
  var nota = $('pt-nota-regla');
  if (nota) nota.textContent = d.activo
    ? ('Los clientes acumulan 1 punto por cada $ ' + Number(d.pesos || 1000).toLocaleString('es-CO') + ' de comida y empaque (el domicilio no suma).')
    : 'Ahora mismo los puntos están apagados: nadie acumula.';
}

function ptToggleActivo() {
  if (!_ptReglaDraft) return;
  _ptReglaDraft.activo = !_ptReglaDraft.activo;
  ptReglaPintar();
  ptReglaTocar();
}

function ptReglaTocar() {
  var inp = $('pt-pesos');
  if (inp && _ptReglaDraft) _ptReglaDraft.pesos = parseInt(inp.value, 10) || 0;
  ptReglaPintar();
  var b = $('pt-regla-save');
  if (b) b.disabled = false;
}

function ptGuardarRegla() {
  var d = _ptReglaDraft; if (!d) return;
  var por = parseInt(d.pesos, 10);
  /* Un valor absurdo aqui sale caro: con 1 peso por punto, un pedido de
     $30.000 regala 30.000 puntos y el programa queda roto en una noche. */
  if (d.activo && (!(por > 0))) return showToast('Escribe cuántos pesos vale un punto.');
  if (d.activo && por < 100) return showToast('Ese valor es muy bajo: un pedido normal regalaría cientos de puntos. Usa al menos $100.');
  if (d.activo && por > 1000000) return showToast('Ese valor es muy alto: nadie ganaría un solo punto.');

  var op = opLoad() || {};
  op.puntos = { pesos_por_punto: d.activo ? por : (por > 0 ? por : 1000), activo: !!d.activo };
  opSave(op);
  var b = $('pt-regla-save');
  if (b) b.disabled = true;
  showToast(d.activo ? 'Listo: 1 punto por cada $ ' + por.toLocaleString('es-CO') : 'Los puntos quedaron apagados');
  ptReglaPintar();
}

function propInit() {
  propRender();
  propBind();
  impPintar();
  impBindInputs();
}

function propRender() {
  var d = _opDraft;
  var activa = !!d.propinaActiva;

  // Interruptor recibe / no recibe
  opSetToggle('prop-sw-activa', activa);
  var st = $('prop-state');
  if (st) { st.textContent = activa ? 'Sí recibe' : 'No recibe'; st.className = 'op-state ' + (activa ? 'on' : 'off'); }
  var det = $('prop-detalle');
  if (det) det.style.display = activa ? '' : 'none';

  // Chips de porcentajes
  var cont = $('prop-chips');
  if (cont) {
    var pcts = Array.isArray(d.propinaPorcentajes) ? d.propinaPorcentajes.slice() : [];
    var html = pcts.map(function (p, i) {
      return '<span class="prop-chip" data-i="' + i + '">' + p + '%'
        + '<button class="prop-chip-x" data-propdel="' + i + '" title="Quitar" aria-label="Quitar ' + p + '%">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button></span>';
    }).join('');
    if (_propNuevo) {
      html += '<span class="prop-newform"><input id="prop-new-inp" class="cf-bareinput" type="number" min="1" max="100" inputmode="numeric" placeholder="%" style="width:52px;text-align:center">'
        + '<button class="iv-btn-sm primary" id="prop-new-ok">Agregar</button>'
        + '<button class="iv-btn-sm" id="prop-new-cancel">Cancelar</button></span>';
    } else {
      html += '<button class="prop-chip-add" id="prop-add">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar</button>';
    }
    cont.innerHTML = html;
    if (_propNuevo) { var inp = $('prop-new-inp'); if (inp) inp.focus(); }
  }

  // Segmento de modo por defecto
  var seg = $('prop-modo');
  if (seg) {
    var modo = d.propinaModoDefault === 'fijo' ? 'fijo' : 'pct';
    seg.querySelectorAll('[data-modo]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.modo === modo);
    });
  }

  /* La cuenta de ejemplo del rail lleva la propina, asi que se repinta cuando
     la propina cambia. Si no, mostraria un total que ya no es el real. */
  if (typeof impPintarEjemplo === 'function') impPintarEjemplo();

  opCheckDirty();
}

var _propNuevo = false;

function propBind() {
  var screen = $('screen-impuesto');
  if (!screen || screen._propBound) return;
  screen._propBound = true;

  // Interruptor recibe / no recibe
  var sw = $('prop-sw-activa');
  if (sw) sw.addEventListener('click', function () {
    _opDraft.propinaActiva = !_opDraft.propinaActiva;
    _propNuevo = false;
    propRender();
  });

  // Delegación de clics dentro de la sección (chips, agregar, modo, guardar)
  screen.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t.closest) return;

    var del = t.closest('[data-propdel]');
    if (del) {
      var i = parseInt(del.dataset.propdel, 10);
      var arr = (_opDraft.propinaPorcentajes || []).slice();
      arr.splice(i, 1);
      if (!arr.length) { opToast('Debe quedar al menos un porcentaje'); return; }
      _opDraft.propinaPorcentajes = arr;
      propRender();
      return;
    }
    if (t.closest('#prop-add')) { _propNuevo = true; propRender(); return; }
    if (t.closest('#prop-new-cancel')) { _propNuevo = false; propRender(); return; }
    if (t.closest('#prop-new-ok')) {
      var v = parseInt(($('prop-new-inp') || {}).value, 10);
      if (!v || v < 1 || v > 100) { opToast('Escribe un porcentaje entre 1 y 100'); return; }
      var lista = (_opDraft.propinaPorcentajes || []).slice();
      if (lista.indexOf(v) >= 0) { opToast('Ese porcentaje ya está'); _propNuevo = false; propRender(); return; }
      lista.push(v);
      lista.sort(function (a, b) { return a - b; });
      _opDraft.propinaPorcentajes = lista;
      _propNuevo = false;
      propRender();
      return;
    }
    var modoBtn = t.closest('[data-modo]');
    if (modoBtn) {
      _opDraft.propinaModoDefault = modoBtn.dataset.modo === 'fijo' ? 'fijo' : 'pct';
      propRender();
      return;
    }
  });

  // Enter en el campo de nuevo porcentaje
  screen.addEventListener('keydown', function (ev) {
    if (ev.target && ev.target.id === 'prop-new-inp' && ev.key === 'Enter') {
      var ok = $('prop-new-ok'); if (ok) ok.click();
    }
  });

  // Guardar / descartar (mismo blob que Operación)
  var pSave = $('prop-btn-save');
  if (pSave) pSave.addEventListener('click', function () {
    _opSaved = JSON.parse(JSON.stringify(_opDraft));
    opSave(_opSaved);
    if (typeof opRender === 'function') opRender();
    propRender();
    opToast('Configuración de propina guardada');
  });
  var pDiscard = $('prop-btn-discard');
  if (pDiscard) pDiscard.addEventListener('click', function () {
    _opDraft = JSON.parse(JSON.stringify(_opSaved));
    _propNuevo = false;
    if (typeof opRender === 'function') opRender();
    propRender();
  });
}


// ── Horarios ────────────────────────────────────────────
function horarioInit() {
  var DAYS = [
    { key: 'lunes',     label: 'Lunes'     },
    { key: 'martes',    label: 'Martes'    },
    { key: 'miercoles', label: 'Miércoles' },
    { key: 'jueves',    label: 'Jueves'    },
    { key: 'viernes',   label: 'Viernes'   },
    { key: 'sabado',    label: 'Sábado'    },
    { key: 'domingo',   label: 'Domingo'   },
  ];
  var DEFAULT_ABRE   = '11:00';
  var DEFAULT_CIERRA = '22:00';

  var grid    = document.getElementById('hr-grid');
  var chip    = document.getElementById('hr-save-chip');
  var chipTxt = document.getElementById('hr-save-txt');
  var saveBtn = document.getElementById('hr-save-btn');

  function markDirty() {
    chip.className = 'hr-save-chip dirty';
    chip.querySelector('.hr-chip-dot').style.background = '#F59E0B';
    chipTxt.textContent = 'Cambios sin guardar';
  }
  function markSaved() {
    chip.className = 'hr-save-chip saved';
    chip.querySelector('.hr-chip-dot').style.background = '#16A34A';
    chipTxt.textContent = 'Guardado';
    setTimeout(function(){ chip.className = 'hr-save-chip'; }, 3000);
  }

  function buildRow(day, data) {
    var activo = data && data.activo !== false;
    var abre   = (data && data.abre)   || DEFAULT_ABRE;
    var cierra = (data && data.cierra) || DEFAULT_CIERRA;

    var row = document.createElement('div');
    row.className = 'hr-row' + (activo ? '' : ' closed');
    row.dataset.day = day.key;
    row.innerHTML =
      '<span class="hr-day">' + day.label + '</span>' +
      '<button class="hr-switch' + (activo ? ' on' : '') + '" type="button" aria-label="Activar ' + day.label + '">' +
        '<span class="hr-switch-knob"></span>' +
      '</button>' +
      '<div class="hr-times">' +
        '<span class="hr-time-label">Abre</span>' +
        '<input type="time" class="hr-time" data-role="abre" value="' + abre + '"' + (activo ? '' : ' disabled') + '>' +
        '<span class="hr-dash">—</span>' +
        '<span class="hr-time-label">Cierra</span>' +
        '<input type="time" class="hr-time" data-role="cierra" value="' + cierra + '"' + (activo ? '' : ' disabled') + '>' +
      '</div>' +
      '<span class="hr-closed">Cerrado</span>';

    row.querySelector('.hr-switch').addEventListener('click', function() {
      var isOn = this.classList.toggle('on');
      row.classList.toggle('closed', !isOn);
      row.querySelectorAll('.hr-time').forEach(function(inp){ inp.disabled = !isOn; });
      markDirty();
    });
    row.querySelectorAll('.hr-time').forEach(function(inp){
      inp.addEventListener('change', markDirty);
    });
    return row;
  }

  function readGrid() {
    var result = {};
    grid.querySelectorAll('.hr-row').forEach(function(row) {
      var key    = row.dataset.day;
      var activo = row.querySelector('.hr-switch').classList.contains('on');
      var abre   = row.querySelector('[data-role="abre"]').value   || DEFAULT_ABRE;
      var cierra = row.querySelector('[data-role="cierra"]').value || DEFAULT_CIERRA;
      result[key] = { activo: activo, abre: abre, cierra: cierra };
    });
    return result;
  }

  function renderGrid(horarios) {
    grid.innerHTML = '';
    DAYS.forEach(function(day) {
      grid.appendChild(buildRow(day, horarios ? horarios[day.key] : null));
    });
  }

  // Formato de hora
  var currentFmtHora = '12h';
  var fmtSeg = document.getElementById('hr-fmt-seg');
  if (fmtSeg) {
    fmtSeg.querySelectorAll('.hr-fmt-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        fmtSeg.querySelectorAll('.hr-fmt-opt').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        currentFmtHora = btn.dataset.fmt;
        markDirty();
      });
    });
  }
  function setFmtHora(fmt) {
    currentFmtHora = fmt || '12h';
    if (fmtSeg) {
      fmtSeg.querySelectorAll('.hr-fmt-opt').forEach(function(b){
        b.classList.toggle('active', b.dataset.fmt === currentFmtHora);
      });
    }
  }

  async function loadHorario() {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) return;
    var branchId = session.user.user_metadata.branch_id;
    var { data } = await sb.from('ia_config').select('horarios, formato_hora, zona_horaria').eq('branch_id', branchId).maybeSingle();
    renderGrid(data && data.horarios ? data.horarios : null);
    if (data && data.formato_hora) setFmtHora(data.formato_hora);
    // Zona horaria (la moneda vive en Configuración → General)
    var tzSel = document.getElementById('hr-tz');
    if (tzSel && data && data.zona_horaria != null && data.zona_horaria !== '') tzSel.value = String(data.zona_horaria);
    var tzEl = document.getElementById('hr-tz');
    if (tzEl) tzEl.addEventListener('change', markDirty);
  }

  saveBtn.addEventListener('click', async function() {
    saveBtn.disabled = true;
    var session = (await sb.auth.getSession()).data.session;
    if (!session) { saveBtn.disabled = false; return; }
    var meta     = session.user.user_metadata;
    var horarios = readGrid();
    var { error } = await sb.from('ia_config').upsert(
      { branch_id: meta.branch_id, tenant_id: meta.tenant_id, horarios: horarios, formato_hora: currentFmtHora,
        zona_horaria: (document.getElementById('hr-tz') || {}).value || '-5' },
      { onConflict: 'branch_id' }
    );
    saveBtn.disabled = false;
    if (!error) { markSaved(); } else { alert('Error guardando horarios: ' + error.message); }
  });

  loadHorario();
}

// ── Asistente IA config ─────────────────────────────────
async function estadosCfgInit() {
  if (window._estadosCfgLoaded) return;
  var body = document.getElementById('estadosCfgBody');
  var saveBtn = document.getElementById('estadosCfgSave');
  if (!body || !saveBtn || !_cfgBranchId) return;
  window._estadosCfgLoaded = true;
  var cfg = {}, etqs = [];
  try {
    var r = await sb.from('ia_config').select('estados_config,etiquetas').eq('branch_id', _cfgBranchId).maybeSingle();
    cfg = (r.data && r.data.estados_config) || {};
    etqs = (r.data && r.data.etiquetas) || [];
  } catch (e) {}

  /* ── Plantillas aprobadas de WhatsApp (para el aviso de puntos) ──
     Se leen de Meta con el token de la sucursal. Solo las APROBADAS:
     una pendiente o rechazada no se puede enviar y solo confundiría. */
  var waTpls = [];
  try {
    var chR = await sb.from('chat_channels').select('meta').eq('branch_id', _cfgBranchId).eq('channel', 'whatsapp').maybeSingle();
    var wm = (chR.data && chR.data.meta) || {};
    if (wm.access_token && wm.waba_id) {
      var tj = await (await fetch('https://graph.facebook.com/v22.0/' + wm.waba_id +
        '/message_templates?fields=name,status,language,category,components&limit=50&access_token=' + wm.access_token)).json();
      waTpls = (tj.data || []).filter(function (t) { return t.status === 'APPROVED'; });
    }
  } catch (e) {}
  var LBL = { en_preparacion: 'En preparación', listo: 'Listo', en_camino: 'En camino', entregado: 'Entregado' };
  var FLOW = { llevar: ['en_preparacion', 'listo', 'entregado'], domicilio: ['en_preparacion', 'listo', 'en_camino', 'entregado'] };
  var inpSt = 'width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--surface)';
  function etqOpts(sel) {
    return '<option value="">— Sin etiqueta —</option>' + etqs.map(function (e) { return '<option value="' + e.id + '"' + (e.id === sel ? ' selected' : '') + '>' + (e.name || '') + '</option>'; }).join('');
  }
  function typeBlock(tipo, titulo) {
    var rows = FLOW[tipo].map(function (k) {
      var e = (cfg[tipo] && cfg[tipo][k]) || {};
      return '<div style="display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:start;margin-bottom:12px">'
        + '<div style="font-size:13px;font-weight:600;padding-top:8px">' + LBL[k] + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'
        + '<select data-ecfg="' + tipo + '.' + k + '.etiqueta" style="' + inpSt + '">' + etqOpts(e.etiqueta || '') + '</select>'
        + '<textarea data-ecfg="' + tipo + '.' + k + '.mensaje" rows="2" placeholder="Mensaje al cliente (vacío = no enviar nada)" style="' + inpSt + ';resize:vertical">' + (e.mensaje || '') + '</textarea>'
        + '</div></div>';
    }).join('');
    return '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3);margin-bottom:12px">' + titulo + '</div>' + rows + '</div>';
  }
  /* ── Gana puntos: el aviso de WhatsApp cuando el pago hace efectivos los
     puntos. AQUÍ solo se decide si está activo y CUÁL plantilla aprobada se
     usa. Qué dato alimenta cada espacio de la plantilla se configura en su
     tarjeta de Difusión → plantillas (lo pidió Sergio así: una cosa es
     escoger el aviso, otra es editar la plantilla). */
  function escT(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function puntosBlock() {
    var p = cfg.puntos || {};
    var catNom = { MARKETING: 'Marketing', UTILITY: 'Utilidad', AUTHENTICATION: 'Autenticación' };
    var opts = waTpls.map(function (t) {
      return '<option value="' + escT(t.name) + '" data-lang="' + escT(t.language || 'es') + '"' + (t.name === (p.plantilla || '') ? ' selected' : '') + '>'
        + escT(t.name) + ' · ' + (catNom[t.category] || t.category) + '</option>';
    }).join('');
    return '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">'
      + '<div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3);margin-bottom:10px">Gana puntos</div>'
      + '<div style="font-size:12.5px;color:var(--text-3);margin-bottom:10px">Cuando un pago hace efectivos los puntos, el cliente recibe esta plantilla de WhatsApp. Los datos que van en cada espacio se configuran en <b>Difusión → plantillas</b>.</div>'
      + (waTpls.length
        ? '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">'
          + '<label style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;cursor:pointer">'
          + '<input type="checkbox" id="pt-activo"' + (p.activo === true ? ' checked' : '') + '> Avisar los puntos ganados</label>'
          + '<select id="pt-plantilla" style="' + inpSt + ';width:auto;min-width:220px">' + opts + '</select>'
          + '</div>'
        : '<div style="font-size:13px;color:var(--text-3)">Conecta WhatsApp en esta sucursal para poder elegir una plantilla.</div>')
      + '</div>';
  }

  body.innerHTML = typeBlock('llevar', 'Para llevar') + typeBlock('domicilio', 'Domicilio')
    + '<div style="display:flex;align-items:center;gap:10px;padding-top:14px;border-top:1px solid var(--border)">'
    + '<span style="font-size:13px;font-weight:600">Auto-entregado domicilio externo</span>'
    + '<input type="number" min="1" data-ecfg="auto_entregado_min" value="' + (cfg.auto_entregado_min || 30) + '" style="width:74px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">'
    + '<span style="font-size:13px;color:var(--text-3)">minutos</span></div>'
    + puntosBlock();
  saveBtn.onclick = async function () {
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    /* Se parte de lo YA guardado, no de un objeto vacío. Antes esto
       reconstruía estados_config desde cero y cualquier llave que la
       pantalla no pintara (como la conexión de puntos) se borraba en
       silencio al guardar — el mismo patrón del canvas que pisa config. */
    var out = Object.assign({}, cfg, { auto_entregado_min: 30, llevar: {}, domicilio: {} });
    body.querySelectorAll('[data-ecfg]').forEach(function (el) {
      var p = el.dataset.ecfg.split('.');
      if (p.length === 1) { out.auto_entregado_min = parseInt(el.value, 10) || 30; return; }
      out[p[0]] = out[p[0]] || {};
      out[p[0]][p[1]] = out[p[0]][p[1]] || { etiqueta: '', mensaje: '' };
      out[p[0]][p[1]][p[2]] = el.value;
    });
    // La fila de Gana puntos, solo si se pintó (hay WhatsApp conectado).
    // Los datos de cada espacio NO se guardan aquí: viven con la plantilla
    // en Difusión (ia_config.plantillas_vars).
    var ptOn = document.getElementById('pt-activo'), ptSel = document.getElementById('pt-plantilla');
    if (ptOn && ptSel) {
      var lang = (ptSel.selectedOptions && ptSel.selectedOptions[0] && ptSel.selectedOptions[0].dataset.lang) || 'es';
      out.puntos = { activo: !!ptOn.checked, plantilla: ptSel.value || '', idioma: lang };
    }
    try {
      await sb.from('ia_config').update({ estados_config: out }).eq('branch_id', _cfgBranchId);
      cfg = out;   // lo guardado pasa a ser la base del próximo guardado
      saveBtn.textContent = '✓ Guardado';
      setTimeout(function () { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }, 1600);
    } catch (e) { saveBtn.textContent = 'Error'; saveBtn.disabled = false; }
  };
}

/* ══════════════ LISTA NEGRA (Configuración) ══════════════ */
var _blTenant = null;
async function blGetTenant(){
  if(_blTenant) return _blTenant;
  try{ var r=await sb.from('branches').select('tenant_id').eq('id',_cfgBranchId).maybeSingle(); _blTenant=(r.data&&r.data.tenant_id)||null; }catch(e){}
  return _blTenant;
}
function blNormDir(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }
function blEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
async function blCfgInit(){
  var card=document.getElementById('blCfgCard'); if(!card) return;
  var addBtn=document.getElementById('blAddBtn');
  if(addBtn && !addBtn._wired){ addBtn._wired=true; addBtn.onclick=blOpenAdd; }
  await blRender();
}
async function blRender(){
  var body=document.getElementById('blCfgBody'); if(!body) return;
  var ten=await blGetTenant();
  if(!ten){ body.innerHTML='No se pudo cargar la lista.'; return; }
  var res=await sb.rpc('lista_negra_listar',{p_tenant:ten});
  var rows=(res&&res.data)||[];
  if(!rows.length){ body.innerHTML='No hay clientes en lista negra. Toca "+ Agregar" o usa el botón desde un chat.'; return; }
  body.innerHTML=rows.map(function(p){
    var tels=(p.telefonos||[]).map(function(t){ return '<span class="bl-chip">'+blEsc(t.telefono)+'<button title="Quitar teléfono" onclick="blDel(\'telefono\',\''+t.id+'\')">×</button></span>'; }).join('');
    var dirs=(p.direcciones||[]).map(function(d){ return '<span class="bl-chip bl-chip-dir">'+blEsc(d.direccion)+'<button title="Quitar dirección" onclick="blDel(\'direccion\',\''+d.id+'\')">×</button></span>'; }).join('');
    return '<div class="bl-person"'+(p.activo?'':' style="opacity:.5"')+'>'
      +'<div class="bl-person-head"><b>'+blEsc(p.nombre||'(sin nombre)')+'</b>'
      +'<button class="bl-del-person" onclick="blDelPersona(\''+p.id+'\')">Quitar</button></div>'
      +(p.razon?'<div class="bl-razon2">'+blEsc(p.razon)+'</div>':'')
      +'<div class="bl-chips">'+(tels+dirs||'<span style="font-size:12px;color:#94A3B8">sin datos</span>')+'</div>'
      +'</div>';
  }).join('');
}
async function blDel(tipo,id){ var ten=await blGetTenant(); await sb.rpc('lista_negra_eliminar',{p_tenant:ten,p_tipo:tipo,p_id:id}); blRender(); }
async function blDelPersona(id){ if(!confirm('¿Quitar esta persona de la lista negra? (se borran sus números y direcciones)')) return; var ten=await blGetTenant(); await sb.rpc('lista_negra_eliminar',{p_tenant:ten,p_tipo:'persona',p_id:id}); blRender(); }
function blOpenAdd(){
  var ov=document.createElement('div'); ov.className='bl-ov2';
  ov.innerHTML='<div class="bl-box2"><div class="bl-title2">🚫 Agregar a lista negra</div>'
    +'<input class="bl-inp2" id="blaN" placeholder="Nombre (referencia)">'
    +'<input class="bl-inp2" id="blaT" placeholder="Teléfono">'
    +'<input class="bl-inp2" id="blaD" placeholder="Dirección exacta (casa/apto)">'
    +'<textarea class="bl-inp2 bl-txa2" id="blaR" rows="2" placeholder="Razón"></textarea>'
    +'<div class="bl-btns2"><button class="bl-c2" type="button">Cancelar</button><button class="bl-s2" type="button">🚫 Bloquear</button></div></div>';
  document.body.appendChild(ov);
  var close=function(){ ov.remove(); };
  ov.querySelector('.bl-c2').onclick=close; ov.onclick=function(e){ if(e.target===ov) close(); };
  ov.querySelector('.bl-s2').onclick=async function(){
    var btn=this, t=ov.querySelector('#blaT').value.trim(), d=ov.querySelector('#blaD').value.trim();
    if(!t && !d){ alert('Pon al menos el teléfono o la dirección'); return; }
    btn.disabled=true; btn.textContent='Guardando…';
    try{ var ten=await blGetTenant();
      await sb.rpc('lista_negra_agregar',{p_tenant:ten,p_nombre:ov.querySelector('#blaN').value.trim()||null,p_razon:ov.querySelector('#blaR').value.trim()||null,p_tel:t||null,p_dir:d||null,p_dir_norm:d?blNormDir(d):null,p_auto:false});
      close(); blRender();
    }catch(e){ btn.disabled=false; btn.textContent='🚫 Bloquear'; alert('No se pudo agregar'); }
  };
}

function chatiaInit() {
  function $(id) { return document.getElementById(id); }
  estadosCfgInit();
  blCfgInit();

  // dirty / saved indicator
  var saveChip = $('saveChip'), saveTxt = $('saveTxt'), saveBtn = $('saveBtn');
  function markDirty() {
    if (!saveChip) return;
    saveChip.classList.remove('saved'); saveChip.classList.add('dirty');
    if (saveTxt) saveTxt.textContent = 'Cambios sin guardar';
  }
  function markSaved() {
    if (!saveChip) return;
    saveChip.classList.remove('dirty'); saveChip.classList.add('saved');
    if (saveTxt) saveTxt.textContent = 'Guardado';
  }
  var screen = $('screen-chatia');
  if (screen) screen.addEventListener('input', markDirty);
  if (screen) screen.addEventListener('change', markDirty);
  var menuFraseToggle = $('menuFraseVariable');
  if (menuFraseToggle) menuFraseToggle.addEventListener('change', function() {
    toggleMenuFraseTexto(menuFraseToggle.checked);
    markDirty();
  });
  var menuImgAddBtn = $('menuImgAdd');
  if (menuImgAddBtn) menuImgAddBtn.onclick = function() {
    var list = $('menuImgList');
    if (list) { list.appendChild(makeMenuImgRow('')); markDirty(); }
  };
  var prohAddBtn = $('prohAdd');
  if (prohAddBtn) prohAddBtn.onclick = function() {
    var list = $('prohList');
    if (list) { list.appendChild(makeProhRow('')); markDirty(); }
  };

var _storedZonas = [];

    // ── Leer el modelo actual del DOM ──────────────────────
  function readModel() {
    var chips = [];
    ($('wordBox') ? $('wordBox').querySelectorAll('.wchip') : []).forEach(function(c) {
      chips.push(c.textContent.replace('\xd7','').replace('×','').trim());
    });
    var faqs = [];
    ($('faqList') ? $('faqList').querySelectorAll('.faq-item') : []).forEach(function(item) {
      var q = item.querySelector('.faq-q input');
      var a = item.querySelector('.faq-a');
      if (q && a) faqs.push({ pregunta: q.value, respuesta: a.value });
    });
    var toneEl = $('toneGrid') ? $('toneGrid').querySelector('.tone.on') : null;
    var voiceEl = $('voicePick') ? $('voicePick').querySelector('.voice.on') : null;
    return {
      activo:          $('masterSwitch') ? $('masterSwitch').checked : true,
      delay_segundos:  $('iaDelay') ? parseInt($('iaDelay').value) : 5,
      perfil:          { nombre: ($('botName') ? $('botName').value : ''), descripcion: ($('botDesc') ? $('botDesc').value : ''), fotoUrl: window._iaChatAvatarUrl || null },
      tono:            toneEl ? toneEl.dataset.tone : 'cercano',
      instrucciones: $('iaInstr') ? $('iaInstr').value : '',
      resumen_plantilla: $('iaResumenPlantilla') ? $('iaResumenPlantilla').value.trim() : '',
      gmail_verificar: $('gmailVerificar') ? $('gmailVerificar').checked : false,
      vocabulario:   { usar: chips, evitar: ($('avoid') ? $('avoid').value : '') },
      faq:           faqs,
      negocio:       $('iaBiz') ? $('iaBiz').value : '',
      voz:           {
        activa:         $('voiceSwitch') ? $('voiceSwitch').checked : false,
        porcentajeVoz:  $('mixSlider')   ? parseInt($('mixSlider').value) : 30,
        voiceId:        voiceEl ? voiceEl.dataset.voice : 'valentina'
      },
      // La LISTA de métodos se administra en "Métodos de pago" (fuente de verdad):
      // aquí la reescribimos TAL CUAL (window._loadedPagos.metodos). El asistente
      // sigue editando los datos del bot: titular, llave, QR, mensaje, comprobante,
      // nota y correos de banco. Los booleanos derivados salen de la lista.
      pagos: (function(){
        var lp  = window._loadedPagos || {};
        var lc  = function(s){ return String(s||'').toLowerCase(); };
        var mts = Array.isArray(lp.metodos) ? lp.metodos : readMetodos();
        return Object.assign({}, lp, {
          metodos:             mts,
          efectivo:            mts.some(function(x){ return lc(x.nombre).indexOf('efectivo') >= 0 || !x.digital; }),
          nequi:               mts.some(function(x){ return lc(x.nombre).indexOf('nequi') >= 0; }),
          daviplata:           mts.some(function(x){ return lc(x.nombre).indexOf('daviplata') >= 0; }),
          tarjeta:             mts.some(function(x){ return lc(x.nombre).indexOf('tarjeta') >= 0; }),
          llave:               $('payLlave')      ? $('payLlave').value.trim() : '',
          titular:             $('payTitular')    ? $('payTitular').value.trim(): '',
          esperar_comprobante: $('payComprobante')? $('payComprobante').checked : true,
          nota:                $('payNota')       ? $('payNota').value.trim()  : '',
          qr_imagen_url:       window._qrImageUrl || '',
          qr_texto:            $('qrTexto')       ? $('qrTexto').value.trim()  : '',
          ventana_comprobante_horas: window._storedVentanaHoras || undefined,
          bancos_correo:       $('bancosCorreo')
            ? $('bancosCorreo').value.split(',').map(function(b){ return b.trim(); }).filter(Boolean)
            : []
        });
      })(),
      domicilios: {
        activo:           $('domiActivo')    ? $('domiActivo').checked    : true,
        para_llevar:      $('domiParaLlevar')? $('domiParaLlevar').checked: true,
        llevar_prepago:   $('domiLlevarPrepago') ? $('domiLlevarPrepago').checked : true,
        tiempo_estimado:  $('domiTiempo')   ? $('domiTiempo').value.trim(): '',
        copias_recibo:    (function(){
          // El selector vive en la pantalla de Domicilios, pero la IMPRESIÓN lee
          // el blob de Operación (branches.operacion_config, cacheado en
          // localStorage). Se guarda en los dos o quedan desincronizados y el
          // usuario elige 2 copias pero sale una.
          var n = $('domiCopias') ? (parseInt($('domiCopias').value,10)||1) : 1;
          try {
            var d = (typeof opLoad === 'function') ? opLoad() : null;
            if (d && d.domiCopias !== n) { d.domiCopias = n; if (typeof opSave === 'function') opSave(d); }
          } catch(e) { console.warn('sync domiCopias:', e); }
          return n;
        })(),
        zonas:            (function() { var z = readZones(); return z.length ? z : _storedZonas; })(),
      },
      frases:      readFrases(),
      situaciones: readSituaciones(),
      pedidos_programados: $('pedidosProg') ? $('pedidosProg').checked : false,
      menu_imagenes: readMenuImagenes(),
      menu_frase: readMenuFrase(),
      prohibiciones: readProhibiciones(),
      variables: window._ciaVariables || {},
      adiciones_palabras: $('adicionesPalabras')
        ? $('adicionesPalabras').value.split(',').map(function(w){ return w.trim(); }).filter(Boolean)
        : [],
      // Interruptor del aviso de compras al cerrar caja.
      avisar_insumos: $('avisarInsumos') ? $('avisarInsumos').checked : true,
      numeros_gerentes: $('numerosGerentes')
        ? $('numerosGerentes').value.split(/[,\n]/).map(function(n){ return n.replace(/\D/g,''); }).filter(Boolean)
        : [],
    };
  }

  // ── Aplicar modelo al DOM ───────────────────────────────
  function applyModel(m) {
    if (!m) return;
    window._ciaVariables = (m.variables && typeof m.variables === 'object' && !Array.isArray(m.variables)) ? m.variables : {};
    if (window.renderVariables) window.renderVariables();
    if ($('masterSwitch')) { $('masterSwitch').checked = !!m.activo; applyMaster(!!m.activo); }
    if ($('iaDelay') && m.delay_segundos != null) {
      $('iaDelay').value = m.delay_segundos;
      if ($('iaDelayVal')) $('iaDelayVal').textContent = m.delay_segundos;
    }
    if (m.perfil) {
      if ($('botName')) $('botName').value = m.perfil.nombre || '';
      if ($('botDesc')) $('botDesc').value = m.perfil.descripcion || '';
      if (m.perfil && m.perfil.fotoUrl) { setAvatarPreview(m.perfil.fotoUrl); window._iaChatAvatarUrl = m.perfil.fotoUrl; }
      if ($('pvName')) $('pvName').childNodes[0].textContent = m.perfil.nombre || 'Asistente';
    }
    if (m.tono && $('toneGrid')) {
      $('toneGrid').querySelectorAll('.tone').forEach(function(t) {
        t.classList.toggle('on', t.dataset.tone === m.tono);
      });
    }
    if ($('iaInstr')) { $('iaInstr').value = m.instrucciones || ''; updateCounter('iaInstr'); }
    if ($('adicionesPalabras')) $('adicionesPalabras').value = Array.isArray(m.adiciones_palabras) ? m.adiciones_palabras.join(', ') : '';

    /* Qué información ve el asistente. Solo se guarda lo DESCONECTADO, así que
       una fuente que no aparezca en el guardado se pinta conectada — y una
       fuente nueva arranca conectada sin migrar nada. */
    (function () {
      var conex = m.conexiones || {};
      document.querySelectorAll('.cfg-conex-chk').forEach(function (ch) {
        ch.checked = conex[ch.dataset.k] !== false;
      });
    })();
    /* Categorías que se responden en TEXTO (pedido de Sergio, 15-ago).
       Se pintan las categorías reales del catálogo como fichas con casilla;
       lo marcado se guarda en ia_config.categorias_texto (nombres
       normalizados, que es lo que compara el motor). Sin marcar = carta. */
    (function () {
      var box = $('catTextoBox');
      if (!box) return;
      var marcadas = Array.isArray(m.categorias_texto) ? m.categorias_texto : [];
      var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); };
      sb.from('pos_products').select('category_id(name)').eq('branch_id', _cfgBranchId).limit(300)
        .then(function (r) {
          var cats = {};
          (r.data || []).forEach(function (p) {
            var n = p.category_id && p.category_id.name;
            if (n) cats[norm(n)] = n;
          });
          box.innerHTML = Object.keys(cats).sort().map(function (k) {
            var on = marcadas.indexOf(k) >= 0;
            return '<label style="display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1.5px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';border-radius:999px;font-size:12.5px;cursor:pointer;user-select:none">'
              + '<input type="checkbox" class="cat-texto-chk" data-cat="' + k + '"' + (on ? ' checked' : '') + ' onchange="this.parentElement.style.borderColor=this.checked?\'var(--accent)\':\'var(--border)\'">'
              + cats[k].replace(/</g, '&lt;') + '</label>';
          }).join('');
        });
    })();
    if ($('numerosGerentes')) $('numerosGerentes').value = Array.isArray(m.numeros_gerentes) ? m.numeros_gerentes.join(', ') : '';
    if ($('avisarInsumos')) $('avisarInsumos').checked = m.avisar_insumos !== false;
    if ($('iaResumenPlantilla')) $('iaResumenPlantilla').value = m.resumen_plantilla || '';
    if (m.vocabulario) {
      if ($('avoid')) $('avoid').value = m.vocabulario.evitar || '';
      var wb = $('wordBox'), wi = $('wordInput');
      if (wb) wb.querySelectorAll('.wchip').forEach(function(ch) { ch.remove(); });
      if (wb && wi && Array.isArray(m.vocabulario.usar)) {
        m.vocabulario.usar.forEach(function(word) {
          var chip = document.createElement('span');
          chip.className = 'wchip';
          chip.innerHTML = word.replace(/</g,'&lt;') + ' <button data-x type="button">\xd7</button>';
          wb.insertBefore(chip, wi);
        });
      }
    }
    if (Array.isArray(m.faq) && $('faqList')) {
      $('faqList').innerHTML = '';
      m.faq.forEach(function(f) {
        var item = makeFaqItem();
        var q = item.querySelector('.faq-q input');
        var a = item.querySelector('.faq-a');
        if (q) q.value = f.pregunta || '';
        if (a) a.value = f.respuesta || '';
        $('faqList').appendChild(item);
      });
    }
    if ($('iaBiz')) { $('iaBiz').value = m.negocio || ''; updateCounter('iaBiz'); }
    if (m.voz) {
      if ($('voiceSwitch')) { $('voiceSwitch').checked = !!m.voz.activa; applyVoice(!!m.voz.activa); }
      if ($('mixSlider'))   { $('mixSlider').value = m.voz.porcentajeVoz || 30; updateMix(); }
      if (m.voz.voiceId && $('voicePick')) {
        $('voicePick').querySelectorAll('.voice').forEach(function(v) {
          v.classList.toggle('on', v.dataset.voice === m.voz.voiceId);
        });
      }
    }

    // Pagos — lista editable de métodos (migra desde los booleanos viejos si no hay lista)
    var p = m.pagos || {};
    window._loadedPagos = m.pagos || {}; // fuente de verdad compartida con "Métodos de pago"
    var metodosIni = (Array.isArray(p.metodos) && p.metodos.length) ? p.metodos : (function(){
      var arr = [];
      if (p.efectivo)  arr.push({nombre:'Efectivo',  digital:false});
      if (p.nequi)     arr.push({nombre:'Nequi',     digital:true});
      if (p.daviplata) arr.push({nombre:'Daviplata', digital:true});
      if (p.tarjeta)   arr.push({nombre:'Tarjeta',   digital:false});
      return arr;
    })();
    var mlist = $('metodosList');
    if (mlist) { mlist.innerHTML = ''; metodosIni.forEach(function(x){ addMetodoRow(x.nombre, !!x.digital); }); }
    if ($('payLlave'))      $('payLlave').value        = p.llave    || '';
    if ($('payTitular'))    $('payTitular').value      = p.titular  || '';
    if ($('payComprobante')) $('payComprobante').checked = p.esperar_comprobante !== false;
    if ($('payNota'))       $('payNota').value         = p.nota     || '';
    if ($('qrTexto'))       $('qrTexto').value         = p.qr_texto || '';
    if ($('bancosCorreo'))  $('bancosCorreo').value    = Array.isArray(p.bancos_correo) ? p.bancos_correo.join(', ') : '';
    // preservar claves de pagos que no tienen campo en el formulario
    window._storedVentanaHoras = p.ventana_comprobante_horas || undefined;
    if (p.qr_imagen_url) {
      window._qrImageUrl = p.qr_imagen_url;
      var prev = $('qrPreviewImg'), ph = $('qrPlaceholder');
      if (prev) { prev.src = p.qr_imagen_url; prev.style.display = 'block'; }
      if (ph)   { ph.style.display = 'none'; }
    }
    toggleDigitalFields();

    // Domicilios
    var d = m.domicilios || {};
    if ($('domiActivo'))    $('domiActivo').checked    = d.activo       !== false;
    if ($('domiParaLlevar'))$('domiParaLlevar').checked= d.para_llevar  !== false;
    if ($('domiLlevarPrepago')) $('domiLlevarPrepago').checked = d.llevar_prepago !== false;
    if ($('domiTiempo'))    $('domiTiempo').value      = d.tiempo_estimado || '';
    if ($('domiCopias'))    $('domiCopias').value      = String(d.copias_recibo || 1);
    _storedZonas = d.zonas || [];
    renderZones(d.zonas || []);
    toggleDomiFields();
    applyFrases(m.frases);
    applySituaciones(m.situaciones);
    if ($('pedidosProg')) $('pedidosProg').checked = !!m.pedidos_programados;
    applyMenuImagenes(m.menu_imagenes);
    applyMenuFrase(m.menu_frase);
    applyProhibiciones(m.prohibiciones);
    applyGmailStatus(m.gmail_email, m.gmail_connected_at);
    if ($('gmailVerificar')) $('gmailVerificar').checked = !!m.gmail_verificar;
  }

  // ── Gmail OAuth ──────────────────────────────────────────────────────────────

  function applyGmailStatus(email, connectedAt) {
    var status  = $('gmailStatus');
    var btnConn = $('gmailConnectBtn');
    var btnDisc = $('gmailDisconnectBtn');
    if (!status) return;
    if (email) {
      status.className = 'gmail-status gmail-status--connected';
      status.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>' + email + '</span>';
      if (btnConn) btnConn.style.display = 'none';
      if (btnDisc) btnDisc.style.display = '';
    } else {
      status.className = 'gmail-status gmail-status--disconnected';
      status.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Gmail no conectado</span>';
      if (btnConn) btnConn.style.display = '';
      if (btnDisc) btnDisc.style.display = 'none';
    }
  }

  async function connectGmail() {
    var branchId = _cfgBranchId || (window._pos && window._pos.state && window._pos.state.branchId) || '';
    if (!branchId) { alert('No se encontro el ID de la sucursal. Recarga la pagina e intenta de nuevo.'); return; }
    // Baseline: recordar la conexion ACTUAL para no confundirla con la nueva (evita que
    // el poll detecte el correo viejo y cierre la ventana de Google antes de tiempo).
    var baselineConn = null;
    try { var _bl = await sb.from('ia_config').select('gmail_connected_at').eq('branch_id', branchId).limit(1); baselineConn = (_bl && _bl.data && _bl.data[0]) ? _bl.data[0].gmail_connected_at : null; } catch(e){}
    var clientId = '673589658608-e3p5i9pt9gsjjivocu9unpsd2r8e2k34.apps.googleusercontent.com';
    var redirectUri = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/gmail-oauth-callback';
    var scope = 'https://www.googleapis.com/auth/gmail.readonly';
    var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code' +
      '&scope=' + encodeURIComponent(scope) +
      '&access_type=offline' +
      '&prompt=' + encodeURIComponent('select_account consent') +   // fuerza el selector de cuenta (permite elegir OTRO Gmail)
      '&state=' + encodeURIComponent(branchId);

    var authWin = window.open(authUrl, '_blank');

    var btn = $('gmailConnectBtn');
    var origText = btn ? btn.textContent : 'Conectar Gmail';
    if (btn) { btn.textContent = 'Esperando autorizacion...'; btn.disabled = true; }

    var attempts = 0;
    var pollTimer = setInterval(async function() {
      attempts++;
      try {
        var rows = await sb.from('ia_config')
          .select('gmail_email, gmail_connected_at')
          .eq('branch_id', branchId)
          .limit(1);
        var row = rows && rows.data && rows.data[0];
        if (row && row.gmail_email && row.gmail_connected_at && row.gmail_connected_at !== baselineConn) {
          clearInterval(pollTimer);
          if (authWin && !authWin.closed) { try { authWin.close(); } catch(e) {} }
          applyGmailStatus(row.gmail_email, row.gmail_connected_at);
          return;
        }
      } catch(e) { /* seguir */ }
      if (attempts >= 30) {
        clearInterval(pollTimer);
        if (btn) { btn.textContent = origText; btn.disabled = false; }
        alert('No se detecto la conexion con Gmail. Intenta de nuevo.');
      }
    }, 3000);
  }

    async function disconnectGmail() {
    if (!confirm('Desconectar Gmail? El bot dejara de verificar transferencias automaticamente.')) return;
    var branchId = _cfgBranchId || (window._pos && window._pos.state && window._pos.state.branchId) || '';
    if (branchId) {
      try { await sb.from('ia_config').update({ gmail_email: null, gmail_refresh_token: null, gmail_connected_at: null }).eq('branch_id', branchId); }
      catch(e) { console.error('desconectar gmail:', e); }
    }
    applyGmailStatus(null, null);
  }

  (function checkGmailCallback() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'ok') {
      var email = decodeURIComponent(params.get('email') || '');
      setTimeout(function() { applyGmailStatus(email, new Date().toISOString()); }, 800);
      history.replaceState({}, '', window.location.pathname);
    } else if (params.get('gmail') === 'error') {
      history.replaceState({}, '', window.location.pathname);
    }
  })();

  function updateCounter(id) {
    var ta = document.getElementById(id);
    var cc = document.getElementById('charc-' + id);
    if (!ta || !cc) return;
    cc.textContent = ta.value.length + ' / ' + (ta.dataset.max || 2000);
  }



  // ── Menu frase helpers ──────────────────────────────────
  function applyMenuFrase(mf) {
    mf = mf || { tipo: 'fija', texto: '¿Qué se te antoja? 🍟☺️' };
    var esVariable = mf.tipo === 'variable';
    if ($('menuFraseVariable')) $('menuFraseVariable').checked = esVariable;
    if ($('menuFraseTexto')) $('menuFraseTexto').value = mf.texto || '';
    toggleMenuFraseTexto(esVariable);
  }
  function readMenuFrase() {
    var esVariable = $('menuFraseVariable') ? $('menuFraseVariable').checked : false;
    return { tipo: esVariable ? 'variable' : 'fija', texto: $('menuFraseTexto') ? $('menuFraseTexto').value.trim() : '' };
  }
  function toggleMenuFraseTexto(esVariable) {
    var wrap = $('menuFraseTextoWrap');
    if (wrap) wrap.style.display = esVariable ? 'none' : '';
  }

  // ── Carta imágenes helpers ──────────────────────────────
  function applyMenuImagenes(urls) {
    urls = Array.isArray(urls) ? urls : [];
    var list = $('menuImgList');
    if (!list) return;
    list.innerHTML = '';
    urls.forEach(function(url) { list.appendChild(makeMenuImgRow(url)); });
  }
  function readMenuImagenes() {
    var out = [];
    var list = $('menuImgList');
    if (!list) return out;
    list.querySelectorAll('.menu-img-row input').forEach(function(inp) {
      var v = inp.value.trim();
      if (v) out.push(v);
    });
    return out;
  }
  function makeMenuImgRow(url) {
    var row = document.createElement('div');
    row.className = 'menu-img-row';
    var inp = document.createElement('input');
    inp.className = 'inp'; inp.placeholder = 'https://...enlace-directo-a-imagen.png'; inp.value = url || '';
    var thumb = document.createElement('img');
    thumb.className = 'menu-img-thumb';
    /* Tocar la miniatura la abre grande: en 54 px no se lee lo que dice la
       carta, y esa es justamente la razon de mirarla. */
    thumb.title = 'Ver la imagen completa';
    thumb.addEventListener('click', function () {
      if (thumb.src) cfgVerImagen(thumb.src);
    });
    inp.addEventListener('input', function() {
      thumb.src = inp.value.trim();
      thumb.onload = function() { thumb.classList.add('loaded'); };
      thumb.onerror = function() { thumb.classList.remove('loaded'); };
      markDirty();
    });
    if (url) { thumb.src = url; thumb.onload = function() { thumb.classList.add('loaded'); }; }
    var del = document.createElement('button');
    del.className = 'menu-img-del'; del.type = 'button';
    del.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    del.onclick = function() { row.remove(); markDirty(); };
    row.appendChild(inp); row.appendChild(thumb); row.appendChild(del);
    return row;
  }

  // ── Prohibiciones helpers ───────────────────────────────
  function applyProhibiciones(proh) {
    proh = Array.isArray(proh) ? proh : [];
    var list = $('prohList');
    if (!list) return;
    list.innerHTML = '';
    proh.forEach(function(p) { list.appendChild(makeProhRow(p)); });
  }
  function readProhibiciones() {
    var out = [];
    var list = $('prohList');
    if (!list) return out;
    list.querySelectorAll('.proh-row input').forEach(function(inp) {
      var v = inp.value.trim();
      if (v) out.push(v);
    });
    return out;
  }
  function makeProhRow(text) {
    var row = document.createElement('div');
    row.className = 'proh-row';
    var inp = document.createElement('input');
    inp.className = 'inp'; inp.placeholder = 'Ej. Nunca mencionar competidores...'; inp.value = text || '';
    inp.addEventListener('input', markDirty);
    var del = document.createElement('button');
    del.type = 'button';
    del.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    del.onclick = function() { row.remove(); markDirty(); };
    row.appendChild(inp); row.appendChild(del);
    return row;
  }

  // ── Frases helpers ──────────────────────────────────────
  function applyFrases(frases) {
    frases = frases || {};
    document.querySelectorAll('[data-frase]').forEach(function(el) {
      var key = el.dataset.frase;
      if (frases[key] !== undefined) el.value = frases[key];
    });
  }
  function readFrases() {
    var out = {};
    document.querySelectorAll('[data-frase]').forEach(function(el) {
      out[el.dataset.frase] = el.value.trim();
    });
    return out;
  }

  // ── Situaciones helpers ──────────────────────────────────
  function applySituaciones(sits) {
    sits = sits || {};
    document.querySelectorAll('[data-situacion]').forEach(function(el) {
      var key = el.dataset.situacion;
      if (sits[key] !== undefined) el.value = sits[key];
    });
  }
  function readSituaciones() {
    var out = {};
    document.querySelectorAll('[data-situacion]').forEach(function(el) {
      out[el.dataset.situacion] = el.value.trim();
    });
    return out;
  }

  // ── Cargar config desde Supabase ───────────────────────
  async function loadConfig() {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) return;
    var branchId = session.user.user_metadata.branch_id;
    var { data } = await sb.from('ia_config').select('*').eq('branch_id', branchId).maybeSingle();
    if (data) applyModel(data);
  }
  loadConfig();

  // ── Pagos: lista editable de métodos ───────────────────
  function readMetodos() {
    var out = [];
    document.querySelectorAll('#metodosList .metodo-row').forEach(function(r) {
      var inp = r.querySelector('.metodo-nombre');
      var dig = r.querySelector('.metodo-digital');
      var n = inp ? inp.value.trim() : '';
      if (n) out.push({ nombre: n, digital: !!(dig && dig.checked) });
    });
    return out;
  }
  window.addMetodoRow = function(nombre, digital) {
    var list = $('metodosList'); if (!list) return;
    var row = document.createElement('div');
    row.className = 'metodo-row';
    row.innerHTML =
      '<input class="inp metodo-nombre" placeholder="Ej. Nequi, Bancolombia, Efectivo…">' +
      '<label class="metodo-dig-lb">Digital <label class="switch"><input type="checkbox" class="metodo-digital"><span class="track"></span><span class="knob"></span></label></label>' +
      '<button type="button" class="metodo-del" title="Eliminar">&times;</button>';
    row.querySelector('.metodo-nombre').value = nombre || '';
    row.querySelector('.metodo-digital').checked = !!digital;
    row.querySelector('.metodo-nombre').addEventListener('input', markDirty);
    row.querySelector('.metodo-digital').addEventListener('change', function(){ toggleDigitalFields(); markDirty(); });
    row.querySelector('.metodo-del').addEventListener('click', function(){ row.remove(); toggleDigitalFields(); markDirty(); });
    list.appendChild(row);
  };
  function toggleDigitalFields() {
    var checks = document.querySelectorAll('#metodosList .metodo-digital');
    var show = Array.prototype.some.call(checks, function(c){ return c.checked; });
    var el = $('pay-digital-fields');
    if (el) el.style.display = show ? '' : 'none';
  }
  if ($('metodoAdd')) $('metodoAdd').addEventListener('click', function(){ addMetodoRow('', false); markDirty(); });
  if ($('payComprobante')) $('payComprobante').addEventListener('change', markDirty);
  ['payLlave','payTitular','payNota','bancosCorreo'].forEach(function(id) {
    var el = $(id);
    if (el) el.addEventListener('input', markDirty);
  });

  // ── Domicilios: helpers y eventos ─────────────────────
  function toggleDomiFields() {
    var el = $('domi-fields');
    if (el) el.style.display = ($('domiActivo') && $('domiActivo').checked) ? '' : 'none';
  }
  if ($('domiActivo')) $('domiActivo').addEventListener('change', toggleDomiFields);
  if ($('domiParaLlevar')) $('domiParaLlevar').addEventListener('change', markDirty);
  if ($('domiLlevarPrepago')) $('domiLlevarPrepago').addEventListener('change', markDirty);
  if ($('domiTiempo')) $('domiTiempo').addEventListener('input', markDirty);

  // Las zonas se guardan AGRUPADAS POR PRECIO: {precio, barrios:[...]}. Una zona
  // de $5.000 puede tener 61 barrios. Antes la pantalla esperaba una fila por
  // barrio ({nombre, precio}) y por eso mostraba filas vacías: no encontraba
  // "nombre". Peor: al guardar se habrían perdido los barrios.
  function addZoneRow(precio, barrios, conjuntos) {
    var list = $('zoneList');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'zone-row';
    var lista = Array.isArray(barrios) ? barrios : (barrios ? [barrios] : []);
    row.innerHTML =
      '<div class="zone-row-hd">' +
        '<span class="zone-lb">Precio</span>' +
        '<input class="inp zone-precio" type="number" min="0" step="500" placeholder="0" value="' + (precio || '') + '">' +
        '<span class="zone-count"></span>' +
        '<button class="zone-del" type="button" title="Quitar zona">&times;</button>' +
      '</div>' +
      '<textarea class="txa zone-barrios" rows="4" placeholder="Un barrio por línea"></textarea>' +
      /* Los conjuntos van aparte porque el bot los trata distinto: cobran el
         precio de esta zona igual que un barrio, pero a un conjunto NO se le
         pide calle ni número — se le pide la torre y el apartamento. */
      '<div class="zone-lb" style="margin-top:10px">Conjuntos cerrados de esta zona</div>' +
      '<div style="font-size:11.5px;color:var(--text-3);line-height:1.5;margin:2px 0 6px">Mismo precio que la zona. El bot no les pedirá calle ni número: les pedirá torre y apartamento.</div>' +
      '<textarea class="txa zone-conjuntos" rows="3" placeholder="Un conjunto por línea (ej. Torres del Bosque)"></textarea>';
    row.querySelector('.zone-barrios').value = lista.join('\n');
    row.querySelector('.zone-conjuntos').value = (Array.isArray(conjuntos) ? conjuntos : []).join('\n');
    var cont = row.querySelector('.zone-count');
    var pinta = function () {
      var n = row.querySelector('.zone-barrios').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).length;
      cont.textContent = n + (n === 1 ? ' barrio' : ' barrios');
    };
    pinta();
    row.querySelector('.zone-del').addEventListener('click', function () { row.remove(); markDirty(); });
    row.querySelectorAll('input, textarea').forEach(function (i) {
      i.addEventListener('input', function () { pinta(); markDirty(); });
    });
    list.appendChild(row);
  }

  // ── Barrios cobrados a mano que NO están en la tabla ────────────────
  // El chat los va guardando solo cuando el operador escribe el domicilio
  // porque el sistema no reconoció el barrio. Aquí se aprueban con un clic.
  /* Para comparar un nombre con lo que hay en la tabla: sin tildes, sin
     signos y sin importar mayusculas. 'Río Verde' y 'RIO VERDE' son el
     mismo sitio y no pueden contarse como dos. */
  function _domiClave(t) {
    return String(t == null ? '' : t).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  async function cargarAprendidos() {
    var host = $('domiAprendidos');
    if (!host) return;
    var bid = await cfgQrGetBranch();
    if (!bid) return;
    var r;
    try { r = await sb.from('pos_domi_aprendidos').select('*').eq('branch_id', bid).eq('descartado', false).order('veces', { ascending: false }); }
    catch (e) { host.innerHTML = ''; return; }
    var items = (r && r.data) || [];

    /* LO QUE YA APROBASTE NO VUELVE A SALIR (bug reportado por Sergio).

       Aprobar NO borra la fila de la base: se guarda como pendiente y solo
       se borra cuando el guardado sale bien. Eso es a proposito — si se
       borrara al aprobar y el dueno no le diera a Guardar cambios, el barrio
       desapareceria de los dos lados y se perderia el precio.

       Pero descartar OTRA fila vuelve a dibujar la lista entera desde la
       base, y los aprobados seguian ahi. Reaparecian como si no se hubieran
       aprobado: uno aprobaba tres, descartaba uno, y los tres volvian. Se
       entraba en un bucle del que no se salia.

       Se ocultaban con `display:none` sobre la fila, y al redibujar esa fila
       ya no existia. Ahora se filtran de los DATOS, que es lo unico que
       sobrevive al redibujado. */
    /* LO QUE YA ESTA RESUELTO EN LA TABLA NO SE VUELVE A PREGUNTAR.

       De 11 propuestas que tenia Sergio, 6 proponian EXACTAMENTE lo que ya
       estaba configurado: 'Okavango $6.000' cuando Okavango ya estaba a
       $6.000, 'Monteluna cambia a $5.000' cuando ya valia $5.000. Son
       propuestas viejas, de antes de que esos sitios entraran a la tabla.

       Aprobarlas no hacia nada (el codigo ya evita duplicados) y
       descartarlas una por una tampoco resolvia: la lista seguia llena de
       cosas sin nada que decidir. Y una lista llena de ruido se deja de
       mirar, que es justo lo contrario de para lo que existe.

       Se borran de una vez: no hay nada que perder, el valor ya esta en la
       tabla. Lo que SI se conserva es lo que propone un precio DISTINTO al
       de la tabla — eso es una decision de verdad. */
    var _tabla = {};
    try {
      var _cfgR = await sb.from('ia_config').select('domicilios').eq('branch_id', bid).maybeSingle();
      var _zs = ((_cfgR && _cfgR.data && _cfgR.data.domicilios) || {}).zonas || [];
      _zs.forEach(function (z) {
        (z.barrios || []).concat(z.conjuntos || []).forEach(function (n) {
          if (n) _tabla[_domiClave(n)] = Number(z.precio) || 0;
        });
      });
    } catch (e) { _tabla = {}; }

    var _resueltos = items.filter(function (x) {
      var enTabla = _tabla[_domiClave(x.barrio)];
      if (enTabla === undefined) return false;          // no esta: hay que decidir
      var prop = Number(x.precio) || 0;
      //  Sin precio propuesto y ya esta en la tabla -> no hay nada que hacer.
      if (!prop) return true;
      //  Propone lo mismo que ya vale -> tampoco.
      return prop === enTabla;
    });
    if (_resueltos.length) {
      var _ids = _resueltos.map(function (x) { return x.id; });
      items = items.filter(function (x) { return _ids.indexOf(x.id) < 0; });
      try { await sb.from('pos_domi_aprendidos').delete().in('id', _ids); } catch (e) {}
    }

    var yaAprobados = (window._domiAprobadosPendientes || []).map(function (a) { return a.id; });
    if (yaAprobados.length) {
      items = items.filter(function (x) { return yaAprobados.indexOf(x.id) < 0; });
    }
    /* La cuenta va en la fila plegada: con la fila cerrada, un "3 por aprobar"
       es lo unico que le dice al dueno que hay algo que mirar ahi dentro. */
    var sum = document.getElementById('ciasum-p-domi');
    if (sum) sum.textContent = items.length ? items.length + ' por aprobar' : '';
    if (!items.length) { host.innerHTML = ''; return; }
    var nuevos  = items.filter(function (x) { return x.tipo !== 'cambio'; });
    var cambios = items.filter(function (x) { return x.tipo === 'cambio'; });
    var fila = function (x) {
      var i = items.indexOf(x);
      var esCambio = x.tipo === 'cambio';
      var precio = (Number(x.precio) || 0).toLocaleString('es-CO');
      var antes  = (Number(x.precio_tabla) || 0).toLocaleString('es-CO');
      /* SIN PRECIO = HAY QUE ESCRIBIRLO AQUI (19-ago). Los barrios que llegan
         de la pagina de clientes y del asistente entran en $0: nadie les ha
         puesto valor todavia, que es justamente lo que hay que decidir. La
         fila mostraba "$0" y un boton "Agregar a la tabla" que lo habria
         guardado en cero — o sea, regalando el domicilio. Ahora se escribe el
         precio en la misma fila y de ahi sale.
         Los que vienen de un cobro a mano SI traen precio: ese no se toca. */
      var sinPrecio = !esCambio && (Number(x.precio) || 0) <= 0;
      var celdaPrecio = sinPrecio
        ? '<span class="domi-apr-pr"><span class="domi-apr-sig">$</span>' +
            '<input type="number" class="domi-apr-in" data-i="' + i + '" min="0" step="500" ' +
            'inputmode="numeric" placeholder="0"></span>'
        : '<span class="domi-apr-pr">' + (esCambio ? '<s>$' + antes + '</s> → ' : '') + '$' + precio + '</span>';
      /* La direccion que escribio el cliente ayuda a ubicar el barrio: hay
         nombres que solos no dicen nada. */
      var dirTxt = x.direccion ? '<span class="domi-apr-dir">' + cfgQrEsc(String(x.direccion).slice(0, 44)) + '</span>' : '';
      return '<div class="domi-apr-row' + (sinPrecio ? ' sin-precio' : '') + '" data-aprendido="' + x.id + '">' +
        '<span class="domi-apr-nm">' + cfgQrEsc(x.barrio) + dirTxt + '</span>' +
        celdaPrecio +
        '<span class="domi-apr-n">' + (x.veces > 1 ? x.veces + ' veces' : '') + '</span>' +
        '<button type="button" class="cfg-qr-btn primary domi-apr-add" data-i="' + i + '">' +
          (esCambio ? 'Actualizar precio' : (sinPrecio ? 'Guardar precio' : 'Agregar a la tabla')) + '</button>' +
        '<button type="button" class="cfg-qr-btn ghost domi-apr-del" data-i="' + i + '">Descartar</button>' +
        (esCambio ? '' :
          '<button type="button" class="cfg-qr-btn ghost domi-apr-no" data-i="' + i + '" ' +
          'title="No volver a proponerlo: el cliente escribió otra cosa donde iba la dirección">No es un barrio</button>') +
      '</div>';
    };
    host.innerHTML = '<div class="domi-apr">' +
      (nuevos.length
        ? '<div class="domi-apr-hd">⚠ ' + nuevos.length + ' barrio' + (nuevos.length === 1 ? '' : 's') +
          ' sin precio en tu tabla' +
          '<small>Mientras no tengan precio, ese domicilio se cobra en $0.</small></div>' +
          nuevos.map(fila).join('')
        : '') +
      (cambios.length
        ? '<div class="domi-apr-hd" style="margin-top:' + (nuevos.length ? '12px' : '0') + '">💲 ' + cambios.length +
          ' barrio' + (cambios.length === 1 ? '' : 's') + ' que cobraste a un precio distinto al de la tabla</div>' +
          cambios.map(fila).join('')
        : '') +
      '</div>';
    host.querySelectorAll('.domi-apr-add').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = items[+b.dataset.i];
        var campo = host.querySelector('.domi-apr-in[data-i="' + b.dataset.i + '"]');
        if (campo) {
          var v = Number(campo.value);
          /* Sin precio no se guarda: dejarlo en cero es regalar el domicilio en
             cada pedido de ese barrio, y nadie se entera. */
          if (!isFinite(v) || v <= 0) {
            campo.focus();
            campo.classList.add('malo');
            setTimeout(function () { campo.classList.remove('malo'); }, 1200);
            return;
          }
          x = Object.assign({}, x, { precio: v });
        }
        agregarAprendido(x);
      });
    });
    /* Enter guarda, que es lo que uno espera al escribir un numero. */
    host.querySelectorAll('.domi-apr-in').forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        var b = host.querySelector('.domi-apr-add[data-i="' + inp.dataset.i + '"]');
        if (b) b.click();
      });
    });
    host.querySelectorAll('.domi-apr-del').forEach(function (b) {
      b.addEventListener('click', function () { descartarAprendido(items[+b.dataset.i]); });
    });
    host.querySelectorAll('.domi-apr-no').forEach(function (b) {
      b.addEventListener('click', function () { noEsUnBarrio(items[+b.dataset.i]); });
    });
  }
  // Mete el barrio en la zona de ese precio (o crea la zona si no existe).
  function agregarAprendido(x) {
    var precio = Number(x.precio) || 0;
    var puesto = false;
    // Si es un CAMBIO de precio, primero se saca el barrio de su zona anterior
    // (si no, quedaría repetido en dos zonas con precios distintos).
    if (x.tipo === 'cambio') {
      document.querySelectorAll('.zone-row').forEach(function (r) {
        var ta = r.querySelector('.zone-barrios');
        var lineas = ta.value.split(String.fromCharCode(10)).map(function (t) { return t.trim(); }).filter(Boolean);
        var quedan = lineas.filter(function (t) { return t.toLowerCase() !== String(x.barrio).toLowerCase(); });
        if (quedan.length !== lineas.length) {
          ta.value = quedan.join(String.fromCharCode(10));
          ta.dispatchEvent(new Event('input'));
        }
      });
    }
    document.querySelectorAll('.zone-row').forEach(function (r) {
      if (puesto) return;
      var pr = parseInt(r.querySelector('.zone-precio').value) || 0;
      if (pr === precio) {
        var ta = r.querySelector('.zone-barrios');
        var actuales = ta.value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
        if (!actuales.some(function (t) { return t.toLowerCase() === String(x.barrio).toLowerCase(); })) {
          actuales.push(String(x.barrio));
          ta.value = actuales.join('\n');
          ta.dispatchEvent(new Event('input'));
        }
        puesto = true;
      }
    });
    if (!puesto) { addZoneRow(precio, [String(x.barrio)]); markDirty(); }
    // NO se borra de pendientes todavia. Antes se borraba aqui mismo: si el
    // usuario no le daba a Guardar cambios, el barrio desaparecia de los DOS
    // lados —ya no estaba en pendientes y nunca entro a la tabla— y se perdia
    // el precio aprendido. Le paso a Sergio con 6 barrios.
    // Ahora se apunta y se borra SOLO cuando el guardado sale bien.
    if (!window._domiAprobadosPendientes) window._domiAprobadosPendientes = [];
    window._domiAprobadosPendientes.push(x);
    var fila = document.querySelector('[data-aprendido="' + x.id + '"]');
    if (fila) fila.style.display = 'none';   // se oculta, no se borra
    showToast((x.tipo === 'cambio' ? 'Precio actualizado a $' : 'Barrio agregado a la zona de $') + precio.toLocaleString('es-CO') + '. Dale Guardar cambios para que quede.');
  }
  // Se llama despues de un guardado exitoso: recien ahi se pueden borrar de
  // pendientes, porque recien ahi el barrio quedo de verdad en la tabla.
  window.domiConfirmarAprobados = async function () {
    var lista = window._domiAprobadosPendientes || [];
    if (!lista.length) return;
    for (var i = 0; i < lista.length; i++) {
      try { await sb.from('pos_domi_aprendidos').delete().eq('id', lista[i].id); } catch (e) {}
    }
    window._domiAprobadosPendientes = [];
    try { cargarAprendidos(); } catch (e) {}
  };

  /* "NO ES UN BARRIO" — distinto de Descartar.
     Descartar borra la fila: la misma frase vuelve a la lista en cuanto otro
     cliente escriba algo parecido. Esto la deja marcada para siempre, y las
     tres puertas que aprenden barrios (el chat, la pagina y la campana) la
     ignoran. Es lo que hacia falta para que la lista no se llene de pedidos
     enteros escritos donde iba la direccion — y una lista llena de basura se
     deja de mirar. */
  async function noEsUnBarrio(x) {
    try { await sb.from('pos_domi_aprendidos').update({ descartado: true }).eq('id', x.id); }
    catch (e) { showToast('No se pudo guardar. Intenta de nuevo.'); return; }
    var fila = document.querySelector('[data-aprendido="' + x.id + '"]');
    if (fila) fila.style.display = 'none';
    showToast('Listo: "' + String(x.barrio).slice(0, 28) + '" no volvera a proponerse.');
    setTimeout(cargarAprendidos, 150);
  }

  async function descartarAprendido(x, silencioso) {
    try { await sb.from('pos_domi_aprendidos').delete().eq('id', x.id); } catch (e) {}
    if (!silencioso) cargarAprendidos(); else setTimeout(cargarAprendidos, 100);
  }
  (function () {
    function hook() {
      if (window.ciaAlAbrir) ciaAlAbrir('pedido', 'p-domi', cargarAprendidos);
      /* Y ademas SIEMPRE al abrir Configuracion: la fila viene plegada, asi
         que si esto solo corriera al desplegarla, el aviso de barrios por
         aprobar solo lo veria quien ya fue a buscarlo. La cuenta sale en la
         fila plegada justamente para que no haya que ir a buscarla. */
      cargarAprendidos();
    }
    if (document.readyState !== 'loading') hook();
    else document.addEventListener('DOMContentLoaded', hook);
  })();

  function renderZones(zonas) {
    var list = $('zoneList');
    if (!list) return;
    list.innerHTML = '';
    // Compatibilidad: si vienen del formato viejo ({nombre, precio}) se agrupan
    // por precio para no perder nada.
    var arr = zonas || [];
    var viejas = arr.filter(function (z) { return z && z.nombre !== undefined && !Array.isArray(z.barrios); });
    if (viejas.length) {
      var porPrecio = {};
      arr.forEach(function (z) {
        var pr = Number(z.precio) || 0;
        porPrecio[pr] = porPrecio[pr] || [];
        if (Array.isArray(z.barrios)) porPrecio[pr] = porPrecio[pr].concat(z.barrios);
        else if (z.nombre) porPrecio[pr].push(z.nombre);
      });
      arr = Object.keys(porPrecio).sort(function (a, b) { return a - b; })
        .map(function (pr) { return { precio: Number(pr), barrios: porPrecio[pr] }; });
    }
    arr.slice().sort(function (a, b) { return (Number(a.precio) || 0) - (Number(b.precio) || 0); })
       .forEach(function (z) { addZoneRow(z.precio, z.barrios, z.conjuntos); });
  }

  function readZones() {
    var rows = document.querySelectorAll('.zone-row');
    var result = [];
    rows.forEach(function (r) {
      var precio = r.querySelector('.zone-precio') ? parseInt(r.querySelector('.zone-precio').value) || 0 : 0;
      var txt = r.querySelector('.zone-barrios') ? r.querySelector('.zone-barrios').value : '';
      var barrios = txt.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var txc = r.querySelector('.zone-conjuntos') ? r.querySelector('.zone-conjuntos').value : '';
      var conjuntos = txc.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      /* Vale la zona si tiene barrios O conjuntos: puede haber zonas que sean
         solo conjuntos. */
      if (precio > 0 && (barrios.length || conjuntos.length)) {
        result.push({ precio: precio, barrios: barrios, conjuntos: conjuntos });
      }
    });
    return result;
  }

  if ($('zoneAdd')) $('zoneAdd').addEventListener('click', function() { addZoneRow('', []); markDirty(); });
  document.querySelectorAll('[data-frase], [data-situacion]').forEach(function(el) {
    el.addEventListener('input', markDirty);
  });

  // ── Guardar en Supabase ─────────────────────────────────
  if (saveBtn) saveBtn.addEventListener('click', async function() {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) return;
    var meta = session.user.user_metadata;
    var model = readModel();
    model.branch_id = meta.branch_id;
    model.tenant_id = meta.tenant_id;
    model.updated_at = new Date().toISOString();
    // Qué información ve el asistente. Solo se guarda lo DESCONECTADO: así, si
    // mañana se agrega una fuente nueva, arranca conectada sin migrar nada.
    (function () {
      var conex = {};
      document.querySelectorAll('.cfg-conex-chk').forEach(function (ch) {
        if (!ch.checked) conex[ch.dataset.k] = false;
      });
      model.conexiones = conex;
    })();
    // Categorías marcadas para responderse en texto (nombres normalizados).
    (function () {
      var chks = document.querySelectorAll('.cat-texto-chk');
      if (!chks.length) return;   // el panel no se pintó: no pisar lo guardado
      var lista = [];
      chks.forEach(function (ch) { if (ch.checked) lista.push(ch.dataset.cat); });
      model.categorias_texto = lista;
    })();

    var { error } = await sb.from('ia_config').upsert(model, { onConflict: 'branch_id' });
    if (!error) {
      markSaved();
      // Recien ahora los barrios aprobados quedaron de verdad en la tabla, asi
      // que se pueden sacar de pendientes. Si el guardado falla, siguen ahi.
      if (typeof window.domiConfirmarAprobados === 'function') {
        try { await window.domiConfirmarAprobados(); } catch (e) {}
      }
    } else { alert('Error guardando: ' + error.message); }
  });

  // ── Variables (constructor: dato / frase) ───────────────
  (function initVariables() {
   try {
    var elNombre = $('varNombre'), elFuente = $('varFuente'), elTexto = $('varTexto');
    var elDatoField = $('varDatoField'), elFraseField = $('varFraseField');
    var elAgregar = $('varAgregar'), elCancelar = $('varCancelar'), elList = $('varList');
    if (!elList) return; // el panel no está presente
    var tipoActual = 'dato';
    var editKey = null;
    if (!window._ciaVariables) window._ciaVariables = {};

    var FUENTE_LABEL = {
      producto:'Producto', tamano:'Tamaño', tipo:'Tipo', cantidad:'Cantidad', adiciones:'Adiciones',
      direccion:'Dirección del cliente', pago:'Método de pago', nombre:'Nombre del pedido',
      precio_domi:'Precio del domicilio', hora:'Hora actual', dia:'Día', fecha:'Fecha',
      saludo_hora:'Saludo según la hora', restaurante:'Nombre del restaurante',
      direccion_local:'Dirección del local', ciudad:'Ciudad', telefono_local:'Teléfono del local',
      horario_hoy:'Horario de hoy', tiempo_domicilio:'Tiempo de domicilio', nequi:'Llave Nequi',
      titular:'Titular', metodos_pago:'Métodos de pago', menu:'Menú completo',
      categorias:'Categorías', cliente:'Nombre del cliente'
    };
    function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

    function setTipo(t) {
      tipoActual = t;
      document.querySelectorAll('.var-tipo').forEach(function(b){ b.classList.toggle('on', b.dataset.vtipo === t); });
      if (elDatoField)  elDatoField.style.display  = (t === 'dato')  ? '' : 'none';
      if (elFraseField) elFraseField.style.display = (t === 'frase') ? '' : 'none';
    }
    document.querySelectorAll('.var-tipo').forEach(function(b){
      b.addEventListener('click', function(){ setTipo(this.dataset.vtipo); });
    });

    function resetForm() {
      editKey = null;
      if (elNombre) elNombre.value = '';
      if (elTexto)  elTexto.value = '';
      if (elFuente) elFuente.selectedIndex = 0;
      setTipo('dato');
      if (elAgregar)  elAgregar.textContent = 'Agregar variable';
      if (elCancelar) elCancelar.style.display = 'none';
    }

    window.renderVariables = function() {
      var vars = window._ciaVariables || {};
      var keys = Object.keys(vars);
      if (!keys.length) { elList.innerHTML = '<div class="var-empty">Aún no has creado variables. Crea una arriba 👆</div>'; return; }
      elList.innerHTML = keys.map(function(k){
        var v = vars[k] || {};
        var esFrase = v.tipo === 'frase';
        var badge = esFrase ? '<span class="var-item-badge var-badge-frase">Frase</span>' : '<span class="var-item-badge var-badge-dato">Dato</span>';
        var desc = esFrase ? (v.texto || '') : (FUENTE_LABEL[v.fuente] || v.fuente || '');
        return '<div class="var-item">' +
          '<span class="var-item-name">{{'+esc(k)+'}}</span>' + badge +
          '<span class="var-item-desc">'+esc(desc)+'</span>' +
          '<button class="var-item-act" data-edit="'+esc(k)+'">Editar</button>' +
          '<button class="var-item-act" data-del="'+esc(k)+'">Borrar</button>' +
        '</div>';
      }).join('');
      elList.querySelectorAll('[data-edit]').forEach(function(b){ b.addEventListener('click', function(){ editVar(this.getAttribute('data-edit')); }); });
      elList.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click', function(){ delVar(this.getAttribute('data-del')); }); });
    };

    function editVar(k) {
      var v = (window._ciaVariables||{})[k]; if (!v) return;
      editKey = k;
      if (elNombre) elNombre.value = k;
      setTipo(v.tipo === 'frase' ? 'frase' : 'dato');
      if (v.tipo === 'frase') { if (elTexto) elTexto.value = v.texto || ''; }
      else { if (elFuente) elFuente.value = v.fuente || 'producto'; }
      if (elAgregar)  elAgregar.textContent = 'Guardar cambios';
      if (elCancelar) elCancelar.style.display = '';
      if (elNombre) elNombre.focus();
    }

    function delVar(k) {
      if (!window._ciaVariables) return;
      delete window._ciaVariables[k];
      window.renderVariables(); markDirty();
      if (editKey === k) resetForm();
    }

    function agregar() {
      var nombre = (elNombre ? elNombre.value : '').trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_áéíóúñ]/g,'');
      if (!nombre) { if (elNombre) elNombre.focus(); return; }
      var v;
      if (tipoActual === 'frase') {
        var texto = (elTexto ? elTexto.value : '').trim();
        if (!texto) { if (elTexto) elTexto.focus(); return; }
        v = { tipo:'frase', texto: texto };
      } else {
        v = { tipo:'dato', fuente: (elFuente ? elFuente.value : 'producto') };
      }
      if (!window._ciaVariables) window._ciaVariables = {};
      if (editKey && editKey !== nombre) delete window._ciaVariables[editKey];
      window._ciaVariables[nombre] = v;
      window.renderVariables(); markDirty(); resetForm();
    }

    if (elAgregar)  elAgregar.addEventListener('click', agregar);
    if (elCancelar) elCancelar.addEventListener('click', resetForm);

    setTipo('dato');
    window.renderVariables();
   } catch(e) { console.warn('initVariables falló', e); }
  })();


  // -- Mejorar con IA --
  var IMPROVE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/improve-ia-text';
  var SPARKLE_HTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M12 1l2.5 7.5H22l-6.5 4.7 2.5 7.8L12 16.3l-6 4.7 2.5-7.8L2 8.5h7.5z"/></svg>';

  async function callImprove(type, ta, btn) {
    if (!ta.value.trim()) { ta.focus(); return; }
    btn.classList.add('loading');
    var sp = btn.querySelector('span'); if (sp) sp.textContent = 'Mejorando';
    try {
      var res = await fetch(IMPROVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, text: ta.value }),
      });
      var data = await res.json();
      if (data.improved) {
        ta.value = data.improved;
        if (ta.id) { var ct = $("charc-" + ta.id); if (ct) ct.textContent = ta.value.length + " / " + (parseInt(ta.dataset.max) || 1200); }
        markDirty();
      } else {
        alert('No se pudo mejorar: ' + (data.error || 'Error desconocido'));
      }
    } catch(err) {
      alert('Error al conectar con IA: ' + err.message);
    } finally {
      btn.classList.remove('loading');
      btn.innerHTML = SPARKLE_HTML + '<span>Mejorar con IA</span>';
    }
  }

  var chatiaScreen = $('screen-chatia');
  if (chatiaScreen) {
    chatiaScreen.addEventListener('click', function(e) {
      var btn = e.target.closest('.ia-imp-btn');
      if (!btn || btn.classList.contains('loading')) return;
      var type = btn.dataset.type;
      var ta = btn.closest('.ia-field-wrap').querySelector('textarea');
      if (ta && type) callImprove(type, ta, btn);
    });
  }

  // -- Foto de perfil --
  var avatarInput = $('ia-avatar-input');
  var avatarSlot  = $('ia-avatar');
  var avatarPv    = $('ia-avatar-pv');

  function setAvatarPreview(url) {
    [avatarSlot, avatarPv].forEach(function(slot) {
      if (!slot) return;
      var img = slot.querySelector('img');
      if (img) { img.src = url; }
      else { var el = document.createElement('img'); el.src = url; el.alt = ''; slot.insertBefore(el, slot.firstChild); }
      slot.classList.add('has-photo');
    });
  }

  if (avatarSlot && avatarInput) {
    avatarSlot.addEventListener('click', function(e) {
      if (e.target.tagName === 'INPUT') return;
      avatarInput.click();
    });
    avatarInput.addEventListener('change', async function() {
      var file = this.files[0]; if (!file) return;
      setAvatarPreview(URL.createObjectURL(file));
      var session = (await sb.auth.getSession()).data.session;
      if (!session) return;
      var branchId = session.user.user_metadata.branch_id;
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      var path = 'ia-profiles/' + branchId + '/avatar.' + ext;
      var { error: upErr } = await sb.storage.from('chat-media')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { console.error('Avatar upload error:', upErr); return; }
      var { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);
      window._iaChatAvatarUrl = pub.publicUrl;
      // Actualizar foto en WhatsApp Business
      var waSlot = $('ia-avatar');
      if (waSlot) waSlot.title = 'Actualizando en WhatsApp...';
      var efRes = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/update-wa-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branchId, imageUrl: pub.publicUrl, contentType: file.type }),
      });
      var efData = await efRes.json();
      if (waSlot) waSlot.title = efData.success ? 'Foto actualizada en WhatsApp' : ('Error: ' + (efData.error || 'desconocido'));
      markDirty();
    });
  }

  // ── QR de pago upload ─────────────────────────────────
  var qrSlot = $('qrUploadSlot'), qrInput = $('qrFileInput');
  if (qrSlot && qrInput) {
    qrSlot.addEventListener('click', function() { qrInput.click(); });
    qrInput.addEventListener('change', async function() {
      var file = this.files[0]; if (!file) return;
      var prev = $('qrPreviewImg'), ph = $('qrPlaceholder');
      if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
      if (ph)   { ph.style.display = 'none'; }
      var session = (await sb.auth.getSession()).data.session;
      if (!session) return;
      var branchId = session.user.user_metadata.branch_id;
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      var path = 'qr-pago/' + branchId + '/qr.' + ext;
      var { error: upErr } = await sb.storage.from('chat-media')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { console.error('QR upload error:', upErr); return; }
      var { data: pub } = sb.storage.from('chat-media').getPublicUrl(path);
      window._qrImageUrl = pub.publicUrl;
      markDirty();
    });
  }

  // master toggle
  var masterSwitch = $('masterSwitch'), masterEl = $('ia-master'), masterSt = $('masterSt'), pvSt = $('pvSt');
  function applyMaster(on) {
    if (!masterEl) return;
    masterEl.classList.toggle('on', on);
    if (masterSt) masterSt.textContent = on ? 'Activo' : 'Pausado';
    if (pvSt) {
      if (on) {
        pvSt.style.color = '#16A34A';
        pvSt.innerHTML = '<span class="dot"></span> En línea · responde al instante';
      } else {
        pvSt.style.color = '#94A3B8';
        pvSt.innerHTML = '<span class="dot" style="background:#94A3B8"></span> Pausado · atención manual';
      }
    }
  }
  if (masterSwitch) masterSwitch.addEventListener('change', function() { applyMaster(this.checked); });
  if (masterSwitch) applyMaster(masterSwitch.checked);

  var delaySlider = $('iaDelay'), delayVal = $('iaDelayVal');
  if (delaySlider) delaySlider.addEventListener('input', function() {
    if (delayVal) delayVal.textContent = this.value;
  });

  // bot name -> preview
  var botName = $('botName'), pvName = $('pvName');
  if (botName) botName.addEventListener('input', function() {
    if (pvName) pvName.childNodes[0].textContent = this.value || 'Asistente';
  });

  // tone radio
  var toneGrid = $('toneGrid');
  if (toneGrid) toneGrid.addEventListener('click', function(e) {
    var btn = e.target.closest('.tone');
    if (!btn) return;
    toneGrid.querySelectorAll('.tone').forEach(function(t) { t.classList.remove('on'); });
    btn.classList.add('on');
    markDirty();
  });

  // textarea char counters
  ['iaInstr', 'iaBiz'].forEach(function(id) {
    var el = $(id);
    var counter = $('charc-' + id);
    if (!el || !counter) return;
    var max = parseInt(el.dataset.max) || 1200;
    function update() { counter.textContent = el.value.length + ' / ' + max; }
    el.addEventListener('input', update); update();
  });

  // vocabulary chips
  var wordBox = $('wordBox'), wordInput = $('wordInput');
  if (wordInput) wordInput.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var val = this.value.trim();
    if (!val) return;
    var safe = val.replace(/</g, '&lt;');
    var chip = document.createElement('span');
    chip.className = 'wchip';
    chip.innerHTML = safe + ' <button data-x type="button">×</button>';
    wordBox.insertBefore(chip, this);
    this.value = '';
    markDirty();
  });
  if (wordBox) wordBox.addEventListener('click', function(e) {
    if (e.target.hasAttribute('data-x')) { e.target.closest('.wchip').remove(); markDirty(); }
  });

  // FAQ
  var faqList = $('faqList'), faqAdd = $('faqAdd');
  function makeFaqItem() {
    var item = document.createElement('div');
    item.className = 'faq-item';
    item.innerHTML =
      '<div class="faq-q"><span class="qbadge">P</span><input placeholder="Escribe la pregunta...">' +
      '<button class="del" data-delfaq type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
      '<div class="ia-field-wrap"><textarea class="faq-a" rows="2" placeholder="Escribe la respuesta..."></textarea><button class="ia-imp-btn" data-type="faq_respuesta" type="button"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M12 1l2.5 7.5H22l-6.5 4.7 2.5 7.8L12 16.3l-6 4.7 2.5-7.8L2 8.5h7.5z"/></svg><span>Mejorar con IA</span></button></div>';
    return item;
  }
  if (faqAdd) faqAdd.addEventListener('click', function() {
    var item = makeFaqItem();
    faqList.appendChild(item);
    item.querySelector('input').focus();
    markDirty();
  });
  if (faqList) faqList.addEventListener('click', function(e) {
    if (e.target.closest('[data-delfaq]')) { e.target.closest('.faq-item').remove(); markDirty(); }
  });

  // voice toggle
  var voiceSwitch = $('voiceSwitch'), voiceBody = $('voiceBody'), pvVoice = $('pvVoice');
  var mixSlider = $('mixSlider'), mixTxt = $('mixTxt'), legT = $('legT'), legV = $('legV');
  var mixOpt = $('mixOpt'), statVoice = $('statVoice');

  function applyVoice(on) {
    if (voiceBody) voiceBody.classList.toggle('off', !on);
    updateMix();
  }
  function updateMix() {
    if (!mixSlider) return;
    var voz = parseInt(mixSlider.value) || 0;
    var txt = 100 - voz;
    var voiceOn = voiceSwitch && voiceSwitch.checked;
    if (mixTxt) mixTxt.style.width = txt + '%';
    if (legT) legT.textContent = txt + '% Texto';
    if (legV) legV.textContent = voz + '% Voz';
    if (mixOpt) mixOpt.textContent = '· ' + voz + '% de las respuestas en voz';
    if (statVoice) statVoice.textContent = Math.round(60 * voz / 100);
    if (pvVoice) pvVoice.style.display = (voiceOn && voz > 0) ? 'flex' : 'none';
  }
  if (voiceSwitch) voiceSwitch.addEventListener('change', function() { applyVoice(this.checked); });
  if (mixSlider) mixSlider.addEventListener('input', function() { updateMix(); markDirty(); });
  if (voiceSwitch) applyVoice(voiceSwitch.checked);
  updateMix();

  // voice radio
  var voicePick = $('voicePick');
  if (voicePick) voicePick.addEventListener('click', function(e) {
    var btn = e.target.closest('.voice');
    if (!btn) return;
    voicePick.querySelectorAll('.voice').forEach(function(v) { v.classList.remove('on'); });
    btn.classList.add('on');
    markDirty();
  });

  window.connectGmail    = connectGmail;
  window.disconnectGmail = disconnectGmail;
}

// ── Tabs Asistente IA ────────────────────────────────────
(function(){
  /* Acordeon de la pestana Asistente: se abre UNA a la vez. El interruptor
     de arriba NO se pliega — es lo que se apaga con urgencia. */
  /* El rail acompaña a SU pestaña: cada una responde una pregunta distinta.
     En Asistente, "¿cómo suena?" (el chat de prueba). En Información, "¿qué
     sabe?" — los conteos de lo que tiene cargado, que es lo que decide si
     puede responder o no. */
  window.ciaRail = function (tab) {
    var phone = document.querySelector('.pv-phone');
    var clear = document.getElementById('pvClear');
    var stats = document.querySelector('.pv-stats');
    var cap   = document.querySelector('.pv-cap');
    var saber = document.getElementById('ciaSabe');
    if (!phone) return;
    var cuenta = document.getElementById('ciaCuenta');
    var msg    = document.getElementById('ciaMensaje');
    var difu   = document.getElementById('ciaDifusion');
    var esInfo = (tab === 'informacion');
    var esPed  = (tab === 'pedido');
    var esMsg  = (tab === 'mensajes');
    var esDif  = (tab === 'difusion');
    var esChat = !esInfo && !esPed && !esMsg && !esDif;
    phone.style.display = esChat ? '' : 'none';
    if (clear) clear.style.display = esChat ? '' : 'none';
    if (stats) stats.style.display = esChat ? '' : 'none';
    if (saber)  saber.style.display  = esInfo ? '' : 'none';
    if (cuenta) cuenta.style.display = esPed  ? '' : 'none';
    if (msg)    msg.style.display    = esMsg  ? '' : 'none';
    if (difu)   difu.style.display   = esDif  ? '' : 'none';
    if (cap) cap.lastChild.textContent = esInfo ? ' Lo que Paco sabe hoy'
                                       : esPed ? ' Un pedido de ejemplo'
                                       : esMsg ? ' Asi se ve el mensaje'
                                       : esDif ? ' Estado de la difusion'
                                       : ' Vista previa en vivo';
    if (esInfo) ciaPintarSabe();
    if (esPed)  ciaPintarCuenta();
    if (esMsg)  ciaPintarMensaje();
    if (esDif)  ciaPintarDifusion();
  };

  /* Los conteos salen de la MISMA configuración que lee Paco. Si algo aquí
     está en cero, Paco no lo puede responder — y eso es justo lo que el dueño
     necesita ver de un vistazo. */
  /* La cuenta de un pedido de ejemplo: comida + empaque + domicilio, con las
     tarifas REALES que el dueño acaba de configurar. Es la misma idea del
     simulador de impuestos: cambias el precio de un barrio y ves el total
     moverse, en vez de imaginártelo. */
  /* El resumen del pedido, RENDERIZADO como le llega al cliente: con la
     plantilla del duenno y los atajos ya reemplazados. Un texto con
     {{producto}} suelto no dice como se va a leer; esto si. */
  /* Cuantos contactos hay, cuantos mensajes se han iniciado en las ultimas
     24 h y cuanto queda del cupo de Meta. El contador de la pantalla decia
     "0 enviados" con mil afuera porque no lo sacaba de ningun lado; este sale
     de pos_wa_envios, que es donde queda el rastro real. */
  window.ciaPintarDifusion = async function () {
    var out = document.getElementById('ciaDifusion');
    if (!out) return;
    var contactos = 0, enviados24 = 0, pendientes = 0, fallidos = 0, ultima = null;
    try {
      var st = (window._pos && window._pos.state) || {};
      var ayer = new Date(Date.now() - 86400000).toISOString();
      var r = await Promise.allSettled([
        sb.from('pos_wa_contactos').select('id', { count: 'exact', head: true }).eq('tenant_id', st.tenantId),
        sb.from('pos_wa_envios').select('id', { count: 'exact', head: true })
          .eq('tenant_id', st.tenantId).eq('estado', 'enviado').gte('enviado_at', ayer),
        sb.from('pos_wa_envios').select('id', { count: 'exact', head: true })
          .eq('tenant_id', st.tenantId).eq('estado', 'pendiente'),
        sb.from('pos_wa_envios').select('id', { count: 'exact', head: true })
          .eq('tenant_id', st.tenantId).eq('estado', 'fallido'),
        sb.from('pos_wa_envios').select('enviado_at').eq('tenant_id', st.tenantId)
          .eq('estado', 'enviado').order('enviado_at', { ascending: false }).limit(1),
      ]);
      if (r[0].status === 'fulfilled') contactos = r[0].value.count || 0;
      if (r[1].status === 'fulfilled') enviados24 = r[1].value.count || 0;
      if (r[2].status === 'fulfilled') pendientes = r[2].value.count || 0;
      if (r[3].status === 'fulfilled') fallidos = r[3].value.count || 0;
      if (r[4].status === 'fulfilled' && r[4].value.data && r[4].value.data[0]) ultima = r[4].value.data[0].enviado_at;
    } catch (e) { console.warn('[cia] difusion:', e); }

    function fila(l, v, cls) { return '<div class="cia-sabe-l ' + (cls || '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; }
    function hace(f) {
      if (!f) return 'nunca';
      var d = Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
      if (d <= 0) return 'hoy';
      return d === 1 ? 'ayer' : 'hace ' + d + ' dias';
    }
    out.innerHTML =
        fila('Contactos', contactos.toLocaleString('es-CO'))
      + fila('Iniciados en 24 h', enviados24.toLocaleString('es-CO'))
      + (pendientes ? fila('En cola', pendientes.toLocaleString('es-CO'), 'cia-ojo') : '')
      + (fallidos ? fila('No se pudieron enviar', fallidos, 'cia-ojo') : '')
      + fila('Ultimo envio', hace(ultima))
      + '<div class="cia-sabe-pie">Meta limita cuantas conversaciones puede INICIAR tu numero cada 24 h. '
      + 'Contestar a quien te escribio no cuenta.</div>';
  };

  window.ciaPintarMensaje = async function () {
    var out = document.getElementById('ciaMensaje');
    if (!out) return;
    var plantilla = '', frases = 0, casos = 0, rapidas = 0;
    try {
      var st = (window._pos && window._pos.state) || {};
      var r = await sb.from('ia_config')
        .select('resumen_plantilla, frases, situaciones, respuestas_rapidas')
        .eq('branch_id', st.branchId).maybeSingle();
      var c = (r && r.data) || {};
      plantilla = String(c.resumen_plantilla || '');
      var arr = function (v) { return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0); };
      frases = arr(c.frases); casos = arr(c.situaciones); rapidas = arr(c.respuestas_rapidas);
    } catch (e) { console.warn('[cia] mensaje:', e); }

    /* Un pedido de mentira para rellenar los atajos, con los mismos nombres
       que reemplaza el motor. */
    var ej = {
      cliente: 'Ana', negocio: ciaNegocio() || 'tu restaurante',
      productos: '1x Salchipapa Premium personal@@   > Extra queso',
      total: '$33.000', domicilio: '$4.000', direccion: 'Cra 9b #63n-58',
      barrio: 'La Paz', pago: 'Transferencia', puntos: '33'
    };
    var texto = plantilla || 'Tu pedido@@{{productos}}@@Domicilio: {{domicilio}}@@*Total: {{total}}*';
    texto = texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, function (todo, k) {
      var v = ej[String(k).toLowerCase()];
      return v === undefined ? todo : v;
    });
    texto = texto.split('@@').join('\n');

    out.innerHTML =
        '<div class="cia-msg">' + ciaEsc(texto).split('\n').join('<br>')
          .replace(/[*]([^*]+)[*]/g, '<b>$1</b>') + '</div>'
      + '<div class="cia-sabe-l"><span>Frases del bot</span><b>' + frases + '</b></div>'
      + '<div class="cia-sabe-l"><span>Situaciones especiales</span><b>' + casos + '</b></div>'
      + '<div class="cia-sabe-l"><span>Respuestas rapidas</span><b>' + rapidas + '</b></div>'
      + '<div class="cia-sabe-pie">Ejemplo con un pedido de mentira: los atajos ya estan reemplazados, como los vera el cliente.</div>';
  };
  function ciaNegocio() {
    try {
      var u = (window._pos && window._pos.state && window._pos.state.user) || null;
      return (u && u.user_metadata && u.user_metadata.negocio) || '';
    } catch (e) { return ''; }
  }

  window.ciaPintarCuenta = async function () {
    var out = document.getElementById('ciaCuenta');
    if (!out) return;
    var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
    var COMIDA = 28000;   // una salchipapa cualquiera, para tener con qué mostrar
    var empaque = 0, domi = 0, barrio = '—', zonas = 0, verif = false, prog = false;
    try {
      var st = (window._pos && window._pos.state) || {};
      var r = await Promise.allSettled([
        sb.from('branches').select('operacion_config').eq('id', st.branchId).maybeSingle(),
        sb.from('ia_config').select('domicilios, pagos, pedidos_programados').eq('branch_id', st.branchId).maybeSingle(),
      ]);
      if (r[0].status === 'fulfilled' && r[0].value.data && window.posEmpaqueCalc) {
        empaque = posEmpaqueCalc(
          [{ productId: '', catId: '', presId: '', qty: 1, unitPrice: COMIDA }],
          { domicilio: true }) || 0;
      }
      if (r[1].status === 'fulfilled' && r[1].value.data) {
        var d = r[1].value.data.domicilios || {};
        var zs = Array.isArray(d.zonas) ? d.zonas : [];
        zonas = zs.reduce(function (t, z) { return t + ((z.barrios || []).length || 1); }, 0);
        if (zs.length) { domi = Number(zs[0].precio) || 0; barrio = (zs[0].barrios && zs[0].barrios[0]) || zs[0].nombre || '—'; }
        var pg = r[1].value.data.pagos || {};
        verif = !!(pg.bancos_correo || pg.esperar_comprobante);
        prog = !!r[1].value.data.pedidos_programados;
      }
    } catch (e) { console.warn('[cia] cuenta:', e); }
    var total = COMIDA + empaque + domi;
    function fila(l, v, cls) { return '<div class="cia-sabe-l ' + (cls || '') + '"><span>' + l + '</span><b>' + v + '</b></div>'; }
    out.innerHTML =
        fila('Comida', money(COMIDA))
      + fila('Empaque', empaque ? money(empaque) : 'sin cargo')
      + fila('Domicilio · ' + ciaEsc(barrio), domi ? money(domi) : 'sin definir')
      + fila('El cliente paga', money(total), 'cia-total')
      + '<div class="cia-sabe-pie">' + zonas + (zonas === 1 ? ' barrio con precio' : ' barrios con precio')
      + ' · Verificación de pagos ' + (verif ? 'activa' : 'apagada')
      + ' · Pedidos programados ' + (prog ? 'sí' : 'no') + '.</div>';
  };
  function ciaEsc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  window.ciaPintarSabe = async function () {
    var out = document.getElementById('ciaSabe');
    if (!out) return;
    function fila(l, v, ojo) {
      return '<div class="cia-sabe-l"><span>' + l + '</span><b class="' +
        (ojo ? 'ojo' : '') + '">' + v + '</b></div>';
    }
    var n = { prod: 0, faq: 0, adic: 0, prohib: 0, carta: 0 };
    try {
      var st = (window._pos && window._pos.state) || {};
      var r = await Promise.allSettled([
        sb.from('pos_products').select('id', { count: 'exact', head: true })
          .eq('tenant_id', st.tenantId).eq('available', true),
        sb.from('ia_config').select('faq, adiciones_palabras, prohibiciones, menu_imagenes')
          .eq('branch_id', st.branchId).maybeSingle(),
      ]);
      if (r[0].status === 'fulfilled') n.prod = r[0].value.count || 0;
      if (r[1].status === 'fulfilled' && r[1].value.data) {
        var c = r[1].value.data;
        var arr = function (v) { return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0); };
        n.faq = arr(c.faq); n.adic = arr(c.adiciones_palabras);
        n.prohib = arr(c.prohibiciones); n.carta = arr(c.menu_imagenes);
      }
    } catch (e) { console.warn('[cia] conteos:', e); }
    out.innerHTML =
        fila('Productos en la carta', n.prod, !n.prod)
      + fila('Fotos de la carta', n.carta, !n.carta)
      + fila('Preguntas frecuentes', n.faq, !n.faq)
      + fila('Palabras de adiciones', n.adic, false)
      + fila('Prohibiciones', n.prohib, false)
      + '<div class="cia-sabe-pie">Si algo está en cero, Paco no lo puede responder.</div>';
  };

  window.ciaAcc = function (key) {
    var yo = document.querySelector('.cia-acc[data-acc="' + key + '"]');
    if (!yo) return;
    var abrir = !yo.classList.contains('on');
    document.querySelectorAll('.cia-acc.on').forEach(function (o) { o.classList.remove('on'); });
    if (abrir) { yo.classList.add('on'); ciaDisparar(CIA_AL_ABRIR.acc, key); }
  };

  /* Lo que dice cada fila plegada. Sale de lo que hay en pantalla, asi que
     cambia al guardar sin recargar nada. */
  window.ciaResumenes = function () {
    function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
    function pon(k, t) { var e = document.getElementById('ciasum-' + k); if (e) e.textContent = t || ''; }
    var seg = val('iaDelay') || val('cfgDelay');
    pon('tiempo', seg ? seg + ' seg' : '');
    pon('perfil', val('iaNombrePerfil') || val('cfgBotName') || '');
    var per = val('iaPersonalidad') || val('cfgPersonalidad');
    pon('persona', per ? per.length.toLocaleString('es-CO') + ' car' : '');
    var voz = document.querySelector('#iaVozSwitch, [data-voz]');
    pon('voz', voz && voz.classList.contains('on') ? 'Activo' : '');
    var ger = document.querySelectorAll('#iaGerentesList .ger-item, [data-gerente]').length;
    pon('gerente', ger ? ger + (ger === 1 ? ' número' : ' números') : '');
  };

  /* Que hay que cargar cuando se abre cada parte. Un bloque se registra con
     su pestana y su fila plegable, y se dispara con cualquiera de las dos.
     Antes cada uno buscaba su pestana por nombre; al cambiarles el nombre
     los cuatro se quedaron callados. */
  var CIA_AL_ABRIR = { tab: {}, acc: {} };
  window.ciaAlAbrir = function (tab, acc, fn) {
    if (tab) (CIA_AL_ABRIR.tab[tab] = CIA_AL_ABRIR.tab[tab] || []).push(fn);
    if (acc) (CIA_AL_ABRIR.acc[acc] = CIA_AL_ABRIR.acc[acc] || []).push(fn);
  };
  function ciaDisparar(mapa, clave) {
    (mapa[clave] || []).forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[cia] al abrir ' + clave + ':', e); }
    });
  }

  function activar(tab){
    document.querySelectorAll('.cia-tab').forEach(function(b){
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    document.querySelectorAll('.cfg-col [data-tab]:not(.cia-tab):not(.cia-tabs)').forEach(function(el){
      el.classList.toggle('cia-active', el.dataset.tab === tab);
    });
    var aside = document.querySelector('#cfgAsistenteIA .cfg-aside');
    if (aside) aside.style.display = tab === 'flujo' ? 'none' : '';
    try { localStorage.setItem('cia-tab', tab); } catch(e) {}
    if (tab === 'asistente' && window.ciaResumenes) setTimeout(window.ciaResumenes, 60);
    if (window.ciaRail) ciaRail(tab);
    ciaDisparar(CIA_AL_ABRIR.tab, tab);
    // Las listas de envío (y sus contadores) viven en Difusión.
    if (tab === 'difusion' && typeof wlCargar === 'function') {
      setTimeout(function(){ try { wlCargar(); } catch(e) { console.warn('wlCargar:', e); } }, 60);
    }
  }
  document.addEventListener('DOMContentLoaded', function(){
    var saved = 'asistente';
    try { saved = localStorage.getItem('cia-tab') || 'asistente'; } catch(e) {}
    activar(saved);
    document.querySelectorAll('.cia-tab').forEach(function(b){
      b.addEventListener('click', function(){ activar(this.dataset.tab); });
    });
  });
})();

/* Las pestanas del Asistente las maneja UNA sola funcion (arriba). Aqui
   habia una copia identica: cada clic corria dos veces. */

function _ciaToggleTopbar(show){
  var nav   = document.getElementById("ciaTabs");
  var crumbs = document.querySelector(".cf-crumbs");
  if (!nav || !crumbs) return;
  if (show) {
    nav.style.display = "flex";
    crumbs.classList.add("cia-hidden");
    // activar tab guardado
    var saved = "asistente";
    try { saved = localStorage.getItem("cia-tab") || "asistente"; } catch(e) {}
    if (window._ciaActivar) window._ciaActivar(saved);
  } else {
    nav.style.display = "none";
    crumbs.classList.remove("cia-hidden");
  }
}

/* ═══════════ Respuestas rápidas — editor (Configuración → Asistente) ═══════════
   Fuente de verdad: ia_config.respuestas_rapidas (la MISMA que usa el chat con "/"). */
var CFGQR = { list: [], editIdx: -1, branchId: null, vars: false };
async function cfgQrGetBranch(){
  if (CFGQR.branchId) return CFGQR.branchId;
  try { var s = (await sb.auth.getSession()).data.session; CFGQR.branchId = (s && s.user && s.user.user_metadata) ? s.user.user_metadata.branch_id : null; } catch(e){}
  return CFGQR.branchId;
}
/* El texto de la respuesta vive en un contenteditable con fichas, no en un
   textarea. Todo pasa por aqui para que ningun sitio vuelva a tocar .value. */
function cfgQrLeerTexto(){
  if (CFGQR.vars && window.posVarsUI) return posVarsUI.leer();
  var el = document.getElementById('cfgQrEditor');
  return el ? (el.textContent || '') : '';
}
function cfgQrPonerTexto(t){
  if (CFGQR.vars && window.posVarsUI) { posVarsUI.poner(t || ''); return; }
  var el = document.getElementById('cfgQrEditor');
  if (el) el.textContent = t || '';
}
function cfgQrMontarVars(){
  if (CFGQR.vars) return;
  if (!window.posVarsUI || !document.getElementById('cfgQrEditor')) return;
  posVarsUI.montar({ editor:'cfgQrEditor', barra:'cfgQrBarra',
                     contexto:'pedido', onCambio: cfgQrPrev });
  CFGQR.vars = true;
}
function cfgQrEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function loadCfgQuickReplies(){
  var bid = await cfgQrGetBranch(); if (!bid) return;
  try {
    var r = await sb.from('ia_config').select('respuestas_rapidas').eq('branch_id', bid).maybeSingle();
    CFGQR.list = (r.data && Array.isArray(r.data.respuestas_rapidas)) ? r.data.respuestas_rapidas : [];
  } catch(e){ console.warn('loadCfgQuickReplies:', e); CFGQR.list = []; }
  cfgQrMontarVars();
  cfgQrRender();
}
function cfgQrRender(){
  var cont = document.getElementById('cfgQuickList'); if (!cont) return;
  var n = CFGQR.list.length;
  if (!n){ cont.innerHTML = '<div class="cfg-qr-empty">Aún no hay respuestas rápidas. Agrega la primera abajo.</div>'; return; }
  cont.innerHTML = '<div class="cfg-qr-count">'+n+' respuesta'+(n===1?'':'s')+'</div>' + CFGQR.list.map(function(r,i){
    return '<div class="cfg-qr-row">'
      + '<div class="cfg-qr-info"><div class="cfg-qr-k">'+(r.img?'📷 ':'')+'/'+cfgQrEsc(r.k)+(r.btn ? ' <span class="cfg-qr-btag">'+(r.btn.tipo==="lista"?"lista":(r.btn.tipo==="url"?"enlace":((r.btn.opciones||[]).length)+" botones"))+'</span>' : '')+'</div><div class="cfg-qr-t">'+cfgQrEsc(window.posVarsUI ? posVarsUI.resumen(r.t) : String(r.t||'')).replace(/\n/g,' ')+'</div></div>'
      + '<button type="button" class="cfg-qr-ed" title="Editar" onclick="cfgQrEdit('+i+')">✎</button>'
      + '<button type="button" class="cfg-qr-del" title="Eliminar" onclick="cfgQrDelete('+i+')">✕</button>'
      + '</div>';
  }).join('');
}
// ── Botones en las respuestas rápidas (mensajes interactivos de WhatsApp) ──
// Se guardan dentro de la respuesta: {k, t, btn:{tipo, texto_boton, url, pie, opciones:[...]}}
function cfgQrBtnTipoChange(){
  var tipo = document.getElementById('cfgQrBtnTipo').value;
  document.getElementById('cfgQrBtnBox').style.display   = tipo ? '' : 'none';
  document.getElementById('cfgQrUrlWrap').style.display  = tipo === 'url'   ? '' : 'none';
  document.getElementById('cfgQrOpcWrap').style.display  = tipo === 'url'   ? 'none' : '';
  document.getElementById('cfgQrBtnTextoWrap').style.display = (tipo === 'lista' || tipo === 'url') ? '' : 'none';
  var lb = document.querySelector('#cfgQrBtnTextoWrap .field-lb');
  if (lb) lb.textContent = tipo === 'url' ? 'Texto del botón' : 'Texto del botón que abre la lista';
  var add = document.getElementById('cfgQrOpcAdd');
  if (add) add.style.display = cfgQrOpcCount() >= cfgQrOpcMax() ? 'none' : '';
  cfgQrPrev();
  markDirty();
}
function cfgQrOpcMax(){ return document.getElementById('cfgQrBtnTipo').value === 'lista' ? 10 : 3; }
function cfgQrOpcCount(){ return document.querySelectorAll('#cfgQrOpciones .cfg-qr-opc').length; }
function cfgQrOpcAdd(titulo, desc){
  if (cfgQrOpcCount() >= cfgQrOpcMax()) return;
  var esLista = document.getElementById('cfgQrBtnTipo').value === 'lista';
  var row = document.createElement('div');
  row.className = 'cfg-qr-opc';
  row.innerHTML =
    '<input class="inp cfg-qr-opc-t" maxlength="' + (esLista ? 24 : 20) + '" placeholder="Texto del botón" value="' + cfgQrEsc(titulo || '') + '">' +
    (esLista ? '<input class="inp cfg-qr-opc-d" maxlength="72" placeholder="Descripción (opcional)" value="' + cfgQrEsc(desc || '') + '">' : '') +
    '<button type="button" class="cfg-qr-opc-x" title="Quitar">&times;</button>';
  row.querySelector('.cfg-qr-opc-x').addEventListener('click', function(){
    row.remove();
    var add = document.getElementById('cfgQrOpcAdd'); if (add) add.style.display = '';
    cfgQrPrev(); markDirty();
  });
  row.querySelectorAll('input').forEach(function(i){ i.addEventListener('input', function(){ cfgQrPrev(); markDirty(); }); });
  document.getElementById('cfgQrOpciones').appendChild(row);
  var add = document.getElementById('cfgQrOpcAdd');
  if (add && cfgQrOpcCount() >= cfgQrOpcMax()) add.style.display = 'none';
  cfgQrPrev();
}
// Lo que hay en el formulario → objeto de botones (o null si no tiene)
function cfgQrLeerBtn(){
  var tipo = document.getElementById('cfgQrBtnTipo').value;
  if (!tipo) return null;
  var out = { tipo: tipo };
  var tb = (document.getElementById('cfgQrBtnTexto').value || '').trim();
  var pie = (document.getElementById('cfgQrPie').value || '').trim();
  if (tb)  out.texto_boton = tb;
  if (pie) out.pie = pie;
  if (tipo === 'url'){ out.url = (document.getElementById('cfgQrUrl').value || '').trim(); return out; }
  out.opciones = [];
  document.querySelectorAll('#cfgQrOpciones .cfg-qr-opc').forEach(function(r, i){
    var t = (r.querySelector('.cfg-qr-opc-t').value || '').trim();
    if (!t) return;
    var o = { id: 'op' + i, titulo: t };
    var d = r.querySelector('.cfg-qr-opc-d');
    if (d && d.value.trim()) o.desc = d.value.trim();
    out.opciones.push(o);
  });
  return out;
}
function cfgQrPonerBtn(btn){
  var sel = document.getElementById('cfgQrBtnTipo');
  document.getElementById('cfgQrOpciones').innerHTML = '';
  document.getElementById('cfgQrBtnTexto').value = (btn && btn.texto_boton) || '';
  document.getElementById('cfgQrUrl').value      = (btn && btn.url) || '';
  document.getElementById('cfgQrPie').value      = (btn && btn.pie) || '';
  sel.value = (btn && btn.tipo) || '';
  cfgQrBtnTipoChange();
  if (btn && btn.opciones) btn.opciones.forEach(function(o){ cfgQrOpcAdd(o.titulo || o.texto, o.desc); });
  cfgQrPrev();
}
// Vista previa: burbuja de WhatsApp con sus botones
function cfgQrPrev(){
  var host = document.getElementById('cfgQrPrev'); if (!host) return;
  /* Con un cliente de muestra: un texto con {puntos} suelto no dice como se
     va a leer, y es justo lo que el duenno necesita ver antes de guardar. */
  var txt = cfgQrLeerTexto().trim();
  if (txt && window.posVars && window.posVarsUI) {
    try { txt = posVars.resolver(txt, posVarsUI.datosMuestra(0)).texto; }
    catch(e){ console.warn('cfgQrPrev:', e); }
  }
  txt = txt.trim() || 'Escribe el mensaje…';
  var btn = cfgQrLeerBtn();
  var pie = btn && btn.pie ? '<div style="font-size:11px;color:#8FA6A0;margin-top:5px">' + cfgQrEsc(btn.pie) + '</div>' : '';
  var abajo = '';
  if (btn && btn.tipo === 'url'){
    abajo = '<div class="qrp-btn">🔗 ' + cfgQrEsc(btn.texto_boton || 'Abrir') + '</div>';
  } else if (btn && btn.tipo === 'lista'){
    abajo = '<div class="qrp-btn">☰ ' + cfgQrEsc(btn.texto_boton || 'Ver opciones') + '</div>' +
      (btn.opciones || []).map(function(o){
        return '<div class="qrp-lista">' + cfgQrEsc(o.titulo) +
          (o.desc ? '<span>' + cfgQrEsc(o.desc) + '</span>' : '') + '</div>';
      }).join('');
  } else if (btn && btn.opciones && btn.opciones.length){
    abajo = btn.opciones.map(function(o){ return '<div class="qrp-btn">' + cfgQrEsc(o.titulo) + '</div>'; }).join('');
  }
  host.innerHTML = '<div class="qrp-bub">' + cfgQrEsc(txt).replace(/\n/g, '<br>') + pie + '</div>' + abajo;
}

function cfgQrEdit(i){
  var r = CFGQR.list[i]; if (!r) return;
  CFGQR.editIdx = i;
  document.getElementById('cfgQrKey').value  = r.k || '';
  cfgQrPonerTexto(r.t || '');
  cfgQrPonerBtn(r.btn || null);
  document.getElementById('cfgQrCancel').style.display = '';
  document.getElementById('cfgQrSaveBtn').textContent = 'Guardar cambios';
  var f = document.getElementById('cfgQrKey'); if (f){ f.focus(); f.scrollIntoView({block:'nearest'}); }
  cfgQrPrev();
}
function cfgQrCancel(){
  CFGQR.editIdx = -1;
  var k=document.getElementById('cfgQrKey'),
      c=document.getElementById('cfgQrCancel'), s=document.getElementById('cfgQrSaveBtn');
  if(k) k.value=''; cfgQrPonerTexto('');
  if(c) c.style.display='none'; if(s) s.textContent='Agregar respuesta';
  cfgQrPonerBtn(null);
}
async function cfgQrSave(){
  var kEl=document.getElementById('cfgQrKey'), tEl=document.getElementById('cfgQrEditor');
  var k = (kEl.value||'').trim().replace(/^\/+/, '');
  var t = cfgQrLeerTexto().trim();
  if (!k){ kEl.focus(); return; }
  if (!t){ if (tEl) tEl.focus(); return; }
  var btn = cfgQrLeerBtn();
  // Sin esto Meta rechaza el mensaje y el cliente no recibe nada.
  if (btn){
    if (btn.tipo === 'url' && !btn.url){ alert('Escribe el enlace del boton.'); return; }
    if (btn.tipo !== 'url' && !(btn.opciones||[]).length){ alert('Agrega al menos una opcion.'); return; }
  }
  var reg = { k:k, t:t };
  if (btn) reg.btn = btn;
  if (CFGQR.editIdx >= 0){
    var prev = Object.assign({}, CFGQR.list[CFGQR.editIdx], reg);
    if (!btn) delete prev.btn;
    CFGQR.list[CFGQR.editIdx] = prev;
  }
  else CFGQR.list.unshift(reg);
  await cfgQrPersist();
  cfgQrRender(); cfgQrCancel();
}
async function cfgQrDelete(i){
  CFGQR.list.splice(i,1);
  await cfgQrPersist();
  cfgQrRender();
}
async function cfgQrPersist(){
  var bid = await cfgQrGetBranch(); if (!bid) return;
  try { await sb.from('ia_config').update({ respuestas_rapidas: CFGQR.list }).eq('branch_id', bid); }
  catch(e){ console.error('cfgQrPersist:', e); }
}
(function(){
  function hook(){
    if (window.ciaAlAbrir) ciaAlAbrir('mensajes', 'm-rapidas', loadCfgQuickReplies);
    // Cargar una vez para que la lista esté lista aunque no se haya abierto la pestaña
    loadCfgQuickReplies();
  }
  if (document.readyState !== 'loading') hook();
  else document.addEventListener('DOMContentLoaded', hook);
})();


/* ══════════════════════════════════════════════════════════════════════════
   CONTACTOS DE WHATSAPP + LISTAS DE ENVÍO
   Los contactos viven en pos_wa_contactos; la vista v_wa_contactos ya trae
   calculado si el contacto escribió a Cobra, si tiene pedidos y si está en
   lista negra. Las listas guardan los FILTROS (no los contactos), así se
   recalculan solas.
   ══════════════════════════════════════════════════════════════════════════ */
var WC = { items: [], filtro: 'todos', tope: 60, listas: [], branchId: '', tenantId: '', sel: {} };

async function wcBranch(){
  if (WC.branchId) return WC.branchId;
  WC.branchId = await cfgQrGetBranch();
  return WC.branchId;
}
/* EL RESTAURANTE, OBLIGATORIO PARA GUARDAR (20-ago). `pos_wa_listas` tiene una
   regla de seguridad que exige `tenant_id` en cada fila —es lo que impide que
   un restaurante vea las listas de otro—, y el insert no lo mandaba: guardar
   fallaba SIEMPRE con "row violates row-level security policy". La unica lista
   que existia la habia creado yo desde el servidor, donde esa regla no aplica,
   asi que el fallo estuvo escondido hasta que Sergio intento crear la suya. */
async function wcTenant(){
  if (WC.tenantId) return WC.tenantId;
  try {
    var u = await sb.auth.getUser();
    WC.tenantId = (u && u.data && u.data.user && u.data.user.user_metadata)
      ? (u.data.user.user_metadata.tenant_id || '') : '';
  } catch(e){ WC.tenantId = ''; }
  return WC.tenantId;
}
function wcEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function wcTel(t){
  var d = String(t||'').replace(/\D/g,'');
  if (d.length >= 10){ d = d.slice(-10); return d.slice(0,3)+' '+d.slice(3,6)+' '+d.slice(6); }
  return String(t||'');
}
async function wcCargar(){
  var _l = document.getElementById('wcLista');
  if (_l && !WC.items.length) _l.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#94A3B8;text-align:center">Cargando contactos…</div>';
  var bid = await wcBranch();
  if (!bid){
    if (_l) _l.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#DC2626">No se pudo identificar la sede. Cierra sesión y vuelve a entrar.</div>';
    return;
  }
  try {
    // La API corta en 1.000 filas por respuesta, así que se pide por páginas
    // hasta traerlos todos (si no, con 1.421 contactos se perdían 421).
    var todos = [], desde = 0, PAG = 1000;
    while (true) {
      var r = await sb.from('v_wa_contactos').select('*')
        .eq('branch_id', bid)
        .order('created_at', { ascending: true })
        .range(desde, desde + PAG - 1);
      if (r.error) throw r.error;
      var lote = r.data || [];
      todos = todos.concat(lote);
      if (lote.length < PAG) break;      // última página
      desde += PAG;
      if (desde > 50000) break;          // tope de seguridad
    }
    WC.items = todos;
  } catch(e){
    console.error('wcCargar:', e);
    var l = document.getElementById('wcLista');
    if (l) l.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#DC2626">No se pudieron cargar los contactos: '+wcEsc(e.message||e)+'</div>';
    return;
  }
  try {
    var rl = await sb.from('pos_wa_listas').select('*').eq('branch_id', bid).order('created_at',{ascending:false});
    WC.listas = rl.data || [];
  } catch(e){ WC.listas = []; }
  wcStats(); wcRender(); wcRenderListas();
}
function wcStats(){
  var c = document.getElementById('wcStats'); if (!c) return;
  var it = WC.items;
  var n = function(f){ return it.filter(f).length; };
  var cards = [
    ['Total',            it.length,                                    '#0F172A'],
    ['Nunca han escrito', n(function(x){ return !x.ya_escribio; }),     '#5B6BFF'],
    ['Guardados',        n(function(x){ return x.guardado; }),          '#0F172A'],
    ['Con pedidos',      n(function(x){ return (+x.n_pedidos||0) > 0; }),'#16A34A'],
    ['Sin envíos',       n(function(x){ return x.no_atender || x.en_lista_negra; }), '#B45309'],
  ];
  c.innerHTML = cards.map(function(k){
    return '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:9px 11px">'
      + '<div style="font-size:18px;font-weight:800;color:'+k[2]+';font-variant-numeric:tabular-nums">'+k[1]+'</div>'
      + '<div style="font-size:10.5px;color:#94A3B8;margin-top:1px">'+k[0]+'</div></div>';
  }).join('');
}
function wcFiltro(f){
  WC.filtro = f; WC.tope = 60;
  document.querySelectorAll('#wcFiltros .wc-chip').forEach(function(b){ b.classList.toggle('on', b.dataset.f === f); });
  wcRender();
}
// Contactos que pasan los filtros actuales.
function wcFiltrados(){
  var q = (document.getElementById('wcBuscar')||{}).value || '';
  q = q.toLowerCase().trim();
  var soloEnv = (document.getElementById('wcSoloEnviables')||{}).checked;
  return WC.items.filter(function(x){
    if (soloEnv && (x.no_atender || x.en_lista_negra)) return false;
    if (WC.filtro === 'no_escribio' && x.ya_escribio) return false;
    if (WC.filtro === 'escribio'    && !x.ya_escribio) return false;
    if (WC.filtro === 'guardado'    && !x.guardado) return false;
    if (WC.filtro === 'pedidos'     && !((+x.n_pedidos||0) > 0)) return false;
    if (WC.filtro === 'sin_nombre'  && x.tiene_nombre) return false;
    /* Los que cruzan con la app (20-ago). La vista ya los trae calculados: el
       navegador no tiene que cruzar tres tablas por su cuenta. */
    if (WC.filtro === 'registrado'  && !x.registrado_app) return false;
    if (WC.filtro === 'puntos'      && !((+x.puntos||0) > 0)) return false;
    if (WC.filtro === 'saldo'       && !((+x.saldo||0) > 0)) return false;
    if (WC.filtro === 'una_vez'     && (+x.n_pedidos||0) !== 1) return false;
    if (WC.filtro === 'sin_pedidos' && (+x.n_pedidos||0) > 0) return false;
    if (WC.filtro === 'perdidos'){
      /* Perdido es quien YA compro y lleva mas de 60 dias sin volver. Quien
         nunca compro no esta perdido: nunca lo tuviste. */
      if (!((+x.n_pedidos||0) > 0)) return false;
      var u = x.ultimo_pedido ? new Date(x.ultimo_pedido).getTime() : 0;
      if (!u || (Date.now() - u) < 60*24*60*60*1000) return false;
    }
    if (q){
      // Se busca por nombre Y por número. El número solo se compara si lo que
      // escribieron tiene dígitos: si no, la búsqueda numérica queda vacía y
      // coincidiría con todos (por eso antes no filtraba nada).
      var et  = String(x.etiqueta||'').toLowerCase();
      var te  = String(x.telefono||'').replace(/\D/g,'');
      var qN  = q.replace(/\D/g,'');
      var okT = et.indexOf(q) >= 0;
      var okN = qN.length >= 3 && te.indexOf(qN) >= 0;
      if (!okT && !okN) return false;
    }
    return true;
  });
}
function wcRender(){
  var cont = document.getElementById('wcLista'); if (!cont) return;
  var res  = document.getElementById('wcResumen');
  var list = wcFiltrados();
  if (res) res.textContent = list.length + (list.length===1 ? ' contacto' : ' contactos') + ' con estos filtros';
  if (!list.length){
    cont.innerHTML = '<div style="padding:18px;font-size:12.5px;color:#94A3B8;text-align:center">Ningún contacto coincide.</div>';
    var m0 = document.getElementById('wcMas'); if (m0) m0.style.display = 'none';
    return;
  }
  var pag = list.slice(0, WC.tope);
  cont.innerHTML = pag.map(function(x){
    var etq = x.tiene_nombre ? wcEsc(x.etiqueta) : '<span style="color:#94A3B8">Sin nombre</span>';
    var tags = [];
    if (x.ya_escribio)   tags.push('<span style="font-size:9.5px;font-weight:700;color:#16A34A;background:#DCFCE7;padding:2px 6px;border-radius:999px">Ya escribió</span>');
    if ((+x.n_pedidos||0)>0) tags.push('<span style="font-size:9.5px;font-weight:700;color:#5B6BFF;background:#EEF0FF;padding:2px 6px;border-radius:999px">'+x.n_pedidos+' pedido'+((+x.n_pedidos)>1?'s':'')+'</span>');
    if (x.guardado)      tags.push('<span style="font-size:9.5px;font-weight:700;color:#64748B;background:#F1F5F9;padding:2px 6px;border-radius:999px">Guardado</span>');
    if (x.en_lista_negra) tags.push('<span style="font-size:9.5px;font-weight:700;color:#DC2626;background:#FEE2E2;padding:2px 6px;border-radius:999px">Lista negra</span>');
    if (x.no_atender)    tags.push('<span style="font-size:9.5px;font-weight:700;color:#B45309;background:#FEF3C7;padding:2px 6px;border-radius:999px" title="El cliente pidió no recibir envíos. Se atiende normal.">Sin envíos</span>');
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-bottom:1px solid #F1F5F9'
      + (WC.sel[x.id] ? ';background:#F5F3FF' : '') + '">'
      + '<input type="checkbox" style="width:15px;height:15px;flex:none;cursor:pointer"'
      +   (WC.sel[x.id] ? ' checked' : '') + ' onchange="wcToggleSel(\''+x.id+'\')">'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:12.5px;font-weight:600;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+etq+'</div>'
      +   '<div style="font-size:11px;color:#94A3B8;font-variant-numeric:tabular-nums">'+wcTel(x.telefono)+'</div>'
      + '</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:52%">'+tags.join('')+'</div>'
      + '<button type="button" class="cfg-qr-btn ghost" style="padding:4px 8px;font-size:10.5px;flex:none" onclick="wcNoAtender(\''+x.id+'\','+(x.no_atender?'false':'true')+')">'
      +   (x.no_atender ? 'Permitir envíos' : 'No enviarle')
      + '</button>'
    + '</div>';
  }).join('');
  var mas = document.getElementById('wcMas');
  if (mas){
    if (list.length > WC.tope){ mas.style.display=''; mas.textContent = 'Ver más ('+(list.length - WC.tope)+' restantes)'; }
    else mas.style.display = 'none';
  }
  wcSelBarra();
}
function wcVerMas(){ WC.tope += 100; wcRender(); }

// ── Selección múltiple y borrado ──────────────────────────────────────
function wcSelCount(){ return Object.keys(WC.sel).length; }
function wcSelBarra(){
  var bar = document.getElementById('wcSelBar');
  var n   = document.getElementById('wcSelN');
  var todos = document.getElementById('wcSelTodos');
  var c = wcSelCount();
  if (bar)   bar.style.display = c ? 'flex' : 'none';
  if (todos) todos.style.display = c ? 'none' : '';
  if (n)     n.textContent = c + (c === 1 ? ' seleccionado' : ' seleccionados');
}
function wcToggleSel(id){
  if (WC.sel[id]) delete WC.sel[id]; else WC.sel[id] = true;
  wcRender();
}
function wcSelTodosFiltrados(){
  wcFiltrados().forEach(function(x){ WC.sel[x.id] = true; });
  wcRender();
}
function wcSelNinguno(){ WC.sel = {}; wcRender(); }
async function wcBorrarSeleccionados(){
  var ids = Object.keys(WC.sel);
  if (!ids.length) return;
  var msg = 'Vas a ELIMINAR ' + ids.length + ' contacto' + (ids.length===1?'':'s') + ' de forma permanente.\n\n'
          + 'Esto no se puede deshacer. Si solo quieres dejar de mandarles publicidad, usa “No enviarle” en vez de borrar.\n\n¿Continuar?';
  if (!confirm(msg)) return;
  var msgEl = document.getElementById('wcMsg');
  var setMsg = function(t, ok){ if (msgEl){ msgEl.style.color = ok ? '#16A34A' : '#DC2626'; msgEl.textContent = t; } };
  setMsg('Eliminando…', true);
  try {
    // Por lotes: una sola petición con 1.400 ids es demasiado larga para la URL.
    var LOTE = 100, borrados = 0;
    for (var i = 0; i < ids.length; i += LOTE){
      var trozo = ids.slice(i, i + LOTE);
      var r = await sb.from('pos_wa_contactos').delete().in('id', trozo);
      if (r.error) throw r.error;
      borrados += trozo.length;
    }
    var fuera = {};
    ids.forEach(function(id){ fuera[id] = true; });
    WC.items = WC.items.filter(function(x){ return !fuera[x.id]; });
    WC.sel = {};
    setMsg('✓ ' + borrados + ' contacto' + (borrados===1?'':'s') + ' eliminado' + (borrados===1?'':'s') + '.', true);
    wcStats(); wcRender(); wcRenderListas();
  } catch(e){ setMsg('No se pudieron eliminar: ' + (e.message||e), false); }
}
async function wcNoAtender(id, valor){
  try {
    await sb.from('pos_wa_contactos').update({ no_atender: valor }).eq('id', id);
    var it = WC.items.find(function(x){ return x.id === id; });
    if (it) it.no_atender = valor;
    wcStats(); wcRender();
  } catch(e){ alert('No se pudo actualizar: ' + (e.message||e)); }
}
// ── Listas ────────────────────────────────────────────────────────────
function wcFiltrosActuales(){
  return {
    filtro: WC.filtro,
    buscar: ((document.getElementById('wcBuscar')||{}).value || '').trim(),
    solo_enviables: !!(document.getElementById('wcSoloEnviables')||{}).checked,
  };
}
var WC_FILTRO_LBL = {
  todos:'Todos', no_escribio:'Nunca han escrito a Cobra', escribio:'Ya escribieron',
  guardado:'Guardados en el celular', pedidos:'Con pedidos', sin_nombre:'Sin nombre real',
  registrado:'Registrados en la app', puntos:'Con puntos', saldo:'Con saldo',
  una_vez:'Compraron una sola vez', perdidos:'Hace mas de 60 dias que no piden',
  sin_pedidos:'Nunca han pedido',
};
// Cuántos contactos tiene HOY una lista guardada (se recalcula al vuelo).
function wcContarLista(f){
  var prev = { filtro: WC.filtro, buscar: (document.getElementById('wcBuscar')||{}).value, solo: (document.getElementById('wcSoloEnviables')||{}).checked };
  WC.filtro = f.filtro || 'todos';
  if (document.getElementById('wcBuscar')) document.getElementById('wcBuscar').value = f.buscar || '';
  if (document.getElementById('wcSoloEnviables')) document.getElementById('wcSoloEnviables').checked = f.solo_enviables !== false;
  var n = wcFiltrados().length;
  WC.filtro = prev.filtro;
  if (document.getElementById('wcBuscar')) document.getElementById('wcBuscar').value = prev.buscar;
  if (document.getElementById('wcSoloEnviables')) document.getElementById('wcSoloEnviables').checked = prev.solo;
  return n;
}
function wcRenderListas(){
  var c = document.getElementById('wcListas'); if (!c) return;
  if (!WC.listas.length){
    c.innerHTML = '<div style="font-size:12px;color:#94A3B8;padding:8px 0">Todavía no tienes listas guardadas.</div>';
    return;
  }
  c.innerHTML = WC.listas.map(function(l){
    var f = l.filtros || {};
    var n = wcContarLista(f);
    var desc = [WC_FILTRO_LBL[f.filtro] || 'Todos'];
    if (f.buscar) desc.push('busca “'+wcEsc(f.buscar)+'”');
    if (f.solo_enviables !== false) desc.push('sin lista negra');
    return '<div style="display:flex;align-items:center;gap:10px;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;margin-bottom:8px">'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:12.5px;font-weight:700;color:#0F172A">'+wcEsc(l.nombre)+'</div>'
      +   '<div style="font-size:11px;color:#94A3B8">'+desc.join(' · ')+'</div>'
      + '</div>'
      + '<span style="font-size:13px;font-weight:800;color:#5B6BFF;font-variant-numeric:tabular-nums">'+n+'</span>'
      + '<button type="button" class="cfg-qr-btn ghost" style="padding:4px 9px;font-size:11px" onclick="wcAplicarLista(\''+l.id+'\')">Ver</button>'
      + '<button type="button" class="cfg-qr-btn ghost" style="padding:4px 9px;font-size:11px" onclick="wcBorrarLista(\''+l.id+'\')">Eliminar</button>'
    + '</div>';
  }).join('');
}
function wcAplicarLista(id){
  var l = WC.listas.find(function(x){ return x.id === id; }); if (!l) return;
  var f = l.filtros || {};
  if (document.getElementById('wcBuscar')) document.getElementById('wcBuscar').value = f.buscar || '';
  if (document.getElementById('wcSoloEnviables')) document.getElementById('wcSoloEnviables').checked = f.solo_enviables !== false;
  wcFiltro(f.filtro || 'todos');
}
async function wcGuardarLista(){
  var nEl = document.getElementById('wcListaNombre');
  var msg = document.getElementById('wcMsg');
  var setMsg = function(t, ok){ if (msg){ msg.style.color = ok ? '#16A34A' : '#DC2626'; msg.textContent = t; } };
  var nombre = (nEl.value||'').trim();
  if (!nombre){ setMsg('Ponle un nombre a la lista.', false); nEl.focus(); return; }
  var bid = await wcBranch(); if (!bid){ setMsg('No se pudo identificar la sede.', false); return; }
  var tid = await wcTenant();
  if (!tid){ setMsg('No se pudo identificar el restaurante. Cierra sesión y vuelve a entrar.', false); return; }
  var filtros = wcFiltrosActuales();
  try {
    var r = await sb.from('pos_wa_listas')
      .insert([{ tenant_id: tid, branch_id: bid, nombre: nombre, filtros: filtros }]).select();
    if (r.error) throw r.error;
    WC.listas.unshift((r.data||[])[0] || { id:'', nombre:nombre, filtros:filtros });
    nEl.value = '';
    setMsg('Lista guardada con ' + wcFiltrados().length + ' contactos.', true);
    wcRenderListas();
  } catch(e){ setMsg('No se pudo guardar: ' + (e.message||e), false); }
}
async function wcBorrarLista(id){
  if (!confirm('¿Eliminar esta lista? Los contactos no se borran, solo la lista.')) return;
  try {
    await sb.from('pos_wa_listas').delete().eq('id', id);
    WC.listas = WC.listas.filter(function(x){ return x.id !== id; });
    wcRenderListas();
  } catch(e){ alert('No se pudo eliminar: ' + (e.message||e)); }
}
(function(){
  function hook(){
    if (window.ciaAlAbrir) ciaAlAbrir('difusion', 'd-contactos', function(){
      if (!WC.items.length) wcCargar();
    });
  }
  if (document.readyState !== 'loading') hook();
  else document.addEventListener('DOMContentLoaded', hook);
})();


/* ══════════════════════════════════════════════════════════════════════════
   PLANTILLAS DE WHATSAPP (Meta)
   Pasadas 24 h desde el último mensaje del cliente, WhatsApp solo permite
   escribirle con una plantilla aprobada por Meta. Aquí se crean y se consulta
   su estado. Todo pasa por la función 'wa-plantillas' del servidor porque el
   token de la cuenta de WhatsApp no puede quedar expuesto en el navegador.
   ══════════════════════════════════════════════════════════════════════════ */
var WTP_FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wa-plantillas';
var WTP = { items: [], branchId: '', botones: [], slugWeb: '' };

/* ── LOS BOTONES DE LA PLANTILLA (20-ago-2026) ──────────────────────────
   Sergio: "necesito que se pueda crear plantilla con botones, para que ese
   boton los mande a la app de clientes". Antes la plantilla era solo texto: el
   cliente leia la promocion y tenia que ir a buscar la pagina por su cuenta.

   Los botones viven en `WTP.botones`, no en el DOM: el formulario se repinta al
   agregar y al quitar, y si se leyeran de los campos se perderia lo escrito. */
function wtpDireccionApp(){
  /* La direccion de SU pagina, sacada del restaurante y no escrita a mano: si
     manana cambia el nombre, el boton sigue llevando al sitio correcto. */
  return 'https://cobrapos.app/' + String(WTP.slugWeb || '').trim();
}
function wtpAgregarBoton(tipo, texto, url){
  if (WTP.botones.length >= 3) return;   // el tope es de Meta, no nuestro
  WTP.botones.push({ tipo: tipo || 'enlace', texto: texto || '', url: url || '' });
  wtpPintarBotones(); wtpPreview();
}
function wtpAgregarBotonApp(){ wtpAgregarBoton('enlace', 'Ver en la app', wtpDireccionApp()); }
function wtpQuitarBoton(i){ WTP.botones.splice(i, 1); wtpPintarBotones(); wtpPreview(); }
function wtpSetBotonTexto(i, v){ if (WTP.botones[i]) WTP.botones[i].texto = v; wtpPreview(); }
function wtpSetBotonUrl(i, v){ if (WTP.botones[i]) WTP.botones[i].url = v; }
function wtpPintarBotones(){
  var caja = document.getElementById('wtpBotones');
  if (!caja) return;
  caja.innerHTML = WTP.botones.map(function(b, i){
    var esEnlace = b.tipo === 'enlace';
    return '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;' +
        'background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px">' +
      '<div style="flex:1;min-width:150px">' +
        '<span style="font-size:11px;color:#94A3B8;font-weight:700">' +
          (esEnlace ? 'ENLACE' : 'RESPUESTA RAPIDA') + '</span>' +
        '<input class="inp" maxlength="25" placeholder="Texto del boton" value="' + wtpEsc(b.texto) + '" ' +
          'oninput="wtpSetBotonTexto(' + i + ',this.value)" style="margin-top:4px">' +
      '</div>' +
      (esEnlace
        ? '<div style="flex:2;min-width:200px"><span style="font-size:11px;color:#94A3B8;font-weight:700">A DONDE LLEVA</span>' +
          '<input class="inp" placeholder="https://..." value="' + wtpEsc(b.url) + '" ' +
            'oninput="wtpSetBotonUrl(' + i + ',this.value)" style="margin-top:4px"></div>'
        : '') +
      '<button type="button" class="cfg-qr-btn" onclick="wtpQuitarBoton(' + i + ')">Quitar</button>' +
    '</div>';
  }).join('');
  /* Con tres ya no se puede agregar: mejor apagar el boton que dejar que Meta
     rechace la plantilla despues de mandarla. */
  var padre = caja.parentNode;
  var mas = padre ? padre.querySelectorAll('.cfg-qr-btn') : [];
  for (var k = 0; k < mas.length; k++){
    var t = mas[k].textContent || '';
    if (t.charAt(0) === '+'){
      mas[k].disabled = WTP.botones.length >= 3;
      mas[k].style.opacity = WTP.botones.length >= 3 ? '.45' : '';
    }
  }
}

async function wtpBranch(){
  if (WTP.branchId) return WTP.branchId;
  WTP.branchId = await cfgQrGetBranch();
  return WTP.branchId;
}
/* La direccion de la pagina de clientes sale del restaurante, no escrita a
   mano: si manana cambia el nombre, los botones nuevos siguen bien. Si no se
   puede leer, el atajo deja la direccion base y el dueno la completa. */
async function wtpCargarSlug(){
  if (WTP.slugWeb) return;
  try {
    var u = await sb.auth.getUser();
    var tid = u && u.data && u.data.user && u.data.user.user_metadata
      ? u.data.user.user_metadata.tenant_id : null;
    if (!tid) return;
    var r = await sb.from('tenants').select('slug').eq('id', tid).maybeSingle();
    WTP.slugWeb = (r.data && r.data.slug) || '';
  } catch(e){}
}
async function wtpCall(payload){
  var bid = await wtpBranch();
  if (!bid) return { error: 'No se pudo identificar la sede.' };
  try {
    var r = await fetch(WTP_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ branch_id: bid }, payload)),
    });
    return await r.json();
  } catch(e){ return { error: 'Sin conexión con el servidor.' }; }
}
function wtpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// Nombre como lo exige Meta: minúsculas, números y guion bajo.
function wtpSlug(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);
}
function wtpVars(txt){
  var m = String(txt||'').match(/\{\{\s*\d+\s*\}\}/g) || [];
  var s = {}; m.forEach(function(x){ s[x.replace(/\D/g,'')] = 1; });
  return Object.keys(s).sort(function(a,b){ return a-b; });
}
var WTP_ESTADOS = {
  APPROVED: { t:'Aprobada',   c:'#16A34A', bg:'#DCFCE7' },
  PENDING:  { t:'En revisión', c:'#B45309', bg:'#FEF3C7' },
  REJECTED: { t:'Rechazada',  c:'#DC2626', bg:'#FEE2E2' },
  PAUSED:   { t:'Pausada',    c:'#B45309', bg:'#FEF3C7' },
  DISABLED: { t:'Desactivada', c:'#DC2626', bg:'#FEE2E2' },
};

/* ── Qué dato del sistema alimenta cada espacio de una plantilla ──────────
   El texto lo congela Meta al aprobar; lo ÚNICO editable es qué variable va
   en cada hueco. Eso se edita AQUÍ, en la tarjeta de la plantilla (no en
   Estados de pedido, que solo escoge cuál plantilla usar). El mapeo vive en
   ia_config.plantillas_vars = { nombre_plantilla: [dato_del_hueco_1, ...] }
   y se guarda solo, al cambiar cada lista.
   Regla de la casa: al dueño JAMÁS se le muestran llaves {{n}}. */
var WTP_DATOS = [
  { k: '',                  n: '— Elegir dato —' },
  { k: 'puntos_ganados',    n: 'Puntos ganados' },
  { k: 'puntos_total',      n: 'Puntos acumulados' },
  { k: 'negocio',           n: 'Nombre del negocio' },
  { k: 'direccion_negocio', n: 'Dirección del negocio' },
  { k: 'horario_hoy',       n: 'Horario de hoy' },
  { k: 'tiempo_entrega',    n: 'Tiempo de entrega' },
  { k: 'nombre_cliente',    n: 'Nombre del cliente' },
  { k: 'libre',             n: 'Se llena al enviar' },
];
WTP.vars = {};
async function wtpVarsCargar(){
  try {
    var bid = await wtpBranch(); if (!bid) return;
    var r = await sb.from('ia_config').select('plantillas_vars').eq('branch_id', bid).maybeSingle();
    WTP.vars = (r.data && r.data.plantillas_vars) || {};
  } catch(e){ WTP.vars = {}; }
}
async function wtpVarGuardar(nombre, idx, valor){
  var lista = (WTP.vars[nombre] || []).slice();
  lista[idx] = valor;
  WTP.vars[nombre] = lista;
  var ok = false;
  try {
    var bid = await wtpBranch();
    // Leer-mezclar-escribir: se relee lo guardado para no pisar el mapeo de
    // OTRA plantilla (la pantalla la usa una persona a la vez).
    var cur = await sb.from('ia_config').select('plantillas_vars').eq('branch_id', bid).maybeSingle();
    var todo = (cur.data && cur.data.plantillas_vars) || {};
    todo[nombre] = lista;
    var w = await sb.from('ia_config').update({ plantillas_vars: todo }).eq('branch_id', bid);
    ok = !w.error;
  } catch(e){}
  var chip = document.getElementById('wtpVarOk-' + wtpSlug(nombre));
  if (chip){ chip.textContent = ok ? '✓ Guardado' : 'No se pudo guardar'; chip.style.color = ok ? '#16A34A' : '#DC2626';
    setTimeout(function(){ chip.textContent = ''; }, 1800); }
}
// El cuerpo de la tarjeta: cada {{n}} se pinta como lista desplegable (si la
// plantilla está aprobada) o como una ficha neutra "dato n" (si aún no).
function wtpCuerpoHtml(t){
  var aprobada = String(t.estado||'').toUpperCase() === 'APPROVED';
  var guardado = WTP.vars[t.nombre] || [];
  return wtpEsc(t.cuerpo).replace(/\{\{\s*(\d+)\s*\}\}/g, function(_m, n){
    var idx = parseInt(n,10) - 1;
    if (!aprobada) return '<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#F1F5F9;color:#64748B;font-size:11px;font-weight:700">dato '+n+'</span>';
    var cur = guardado[idx] || '';
    return '<select onchange="wtpVarGuardar(\''+wtpEsc(t.nombre)+'\','+idx+',this.value)" '
      + 'style="padding:2px 7px;border:1.5px solid '+(cur?'#6D5DFC':'#DC2626')+';border-radius:7px;font-family:inherit;font-size:12px;font-weight:700;color:'+(cur?'#6D5DFC':'#DC2626')+';background:#fff;max-width:180px">'
      + WTP_DATOS.map(function(v){ return '<option value="'+v.k+'"'+(v.k===cur?' selected':'')+'>'+v.n+'</option>'; }).join('')
      + '</select>';
  });
}
async function wtpCargar(){
  var cont = document.getElementById('wtpList');
  var cnt  = document.getElementById('wtpCount');
  if (cnt) cnt.textContent = 'Cargando plantillas…';
  var d = await wtpCall({ action:'list' });
  if (d.error){
    if (cnt) cnt.textContent = '';
    if (cont) cont.innerHTML = '<div style="font-size:12.5px;color:#DC2626;padding:10px 0">'+wtpEsc(d.error)+'</div>';
    return;
  }
  WTP.items = d.items || [];
  await wtpVarsCargar();
  if (cnt) cnt.textContent = WTP.items.length
    ? WTP.items.length + (WTP.items.length===1 ? ' plantilla' : ' plantillas')
    : 'Todavía no tienes plantillas';
  if (!cont) return;
  if (!WTP.items.length){
    cont.innerHTML = '<div style="font-size:12.5px;color:#94A3B8;padding:14px 0;line-height:1.5">Crea tu primera plantilla abajo. Meta la revisa y, apenas quede <b>aprobada</b>, aparecerá en el chat para escribirle a clientes con los que se pasaron las 24 horas.</div>';
    return;
  }
  cont.innerHTML = WTP.items.map(function(t){
    var e = WTP_ESTADOS[String(t.estado||'').toUpperCase()] || { t:t.estado, c:'#64748B', bg:'#F1F5F9' };
    return '<div style="border:1px solid #E2E8F0;border-radius:10px;padding:11px 12px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      +   '<span style="font-size:13px;font-weight:700;color:#0F172A;flex:1;min-width:0">'+wtpEsc(t.nombre)+'</span>'
      +   '<span style="font-size:10.5px;font-weight:700;color:'+e.c+';background:'+e.bg+';padding:3px 8px;border-radius:999px">'+e.t+'</span>'
      +   '<button type="button" class="cfg-qr-btn ghost" style="padding:4px 9px;font-size:11px" onclick="wtpBorrar(\''+wtpEsc(t.nombre)+'\')">Eliminar</button>'
      + '</div>'
      + '<div style="font-size:12.5px;color:#475569;white-space:pre-wrap;line-height:1.9">'+wtpCuerpoHtml(t)+'</div>'
      + (t.pie ? '<div style="font-size:11px;color:#94A3B8;margin-top:4px">'+wtpEsc(t.pie)+'</div>' : '')
      + '<div style="font-size:11px;color:#94A3B8;margin-top:6px">'
      +   (t.categoria==='MARKETING'?'Marketing':'Utilidad') + ' · ' + wtpEsc(t.idioma)
      +   (t.variables ? ' · '+t.variables+' dato(s)' : '')
      +   ' <span id="wtpVarOk-'+wtpSlug(t.nombre)+'" style="font-size:11px;font-weight:700"></span>'
      + '</div>'
      + (t.motivo_rechazo ? '<div style="font-size:11.5px;color:#DC2626;margin-top:6px">Meta la rechazó: '+wtpEsc(t.motivo_rechazo)+'</div>' : '')
    + '</div>';
  }).join('');
}
/* ── El creador de plantillas, como se planeó ────────────────────────────
   El dueño escribe el texto y mete los DATOS con botones: fichas de color
   con su nombre en español. Jamás ve llaves {{n}}. Cada dato lleva su
   ejemplo POR DENTRO, y ese ejemplo cumple los tres papeles a la vez:
   1) lo que se ve en la vista previa, 2) el ejemplo que Meta exige para
   revisar, 3) el numero {{n}} que la radicación necesita (sale del orden
   de aparición). Al radicar, el mapeo hueco→dato queda guardado SOLO en
   plantillas_vars: cuando Meta apruebe, la plantilla ya nace conectada. */
var WTP_CHIPS = {
  nombre_cliente:    { n: '👤 Nombre del cliente',     ej: 'David' },
  negocio:           { n: '🏪 Nombre del negocio',     ej: 'El Parche Food' },
  direccion_negocio: { n: '📍 Dirección del negocio',  ej: 'Calle 5 # 10-23' },
  horario_hoy:       { n: '🕒 Horario de hoy',         ej: '6:30 pm a 10:30 pm' },
  tiempo_entrega:    { n: '⏱️ Tiempo de entrega',      ej: '30-40 minutos' },
  puntos_ganados:    { n: '🎉 Puntos ganados',         ej: '42' },
  puntos_total:      { n: '⭐ Puntos acumulados',      ej: '131' },
};
/* El insertador es UN desplegable con grupos (Cliente / Negocio / Puntos /
   Libre), no una fila de botones: con el catálogo creciendo, los botones no
   caben — lo pidió Sergio el 14-ago. Tras insertar, vuelve a "Insertar dato…" */
function wtpChipDesdeSel(sel){
  var k = sel.value;
  sel.value = '';
  if (k) wtpChip(k);
}
/* El cursor se pierde al tocar el desplegable (el editor pierde el foco), así
   que se recuerda la última posición para insertar el dato donde el dueño
   estaba escribiendo, no al final. */
var _wtpRango = null;
(function(){
  function seguirCursor(){
    var cue = document.getElementById('wtpCuerpo');
    if (!cue || cue._cursorOk) return;
    cue._cursorOk = true;
    ['keyup','mouseup','focusout'].forEach(function(ev){
      cue.addEventListener(ev, function(){
        var s = window.getSelection();
        if (s && s.rangeCount && cue.contains(s.anchorNode)) _wtpRango = s.getRangeAt(0).cloneRange();
      });
    });
  }
  if (document.readyState !== 'loading') seguirCursor();
  else document.addEventListener('DOMContentLoaded', seguirCursor);
})();
function wtpChip(k){
  var cue = document.getElementById('wtpCuerpo');
  if (!cue) return;
  var def = WTP_CHIPS[k], ej = def ? def.ej : '', nom = def ? def.n : '';
  if (k === 'libre'){
    ej = prompt('Escribe un EJEMPLO de ese dato (Meta lo exige para revisar la plantilla).\nPor ejemplo: "Salchipapa 2x1"');
    if (!ej || !ej.trim()) return;
    ej = ej.trim(); nom = '✏️ ' + (ej.length > 22 ? ej.slice(0, 22) + '…' : ej);
  }
  var chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.var = k; chip.dataset.ej = ej;
  chip.textContent = nom;
  chip.style.cssText = 'display:inline-block;padding:1px 9px;margin:0 2px;border-radius:999px;background:#EEF2FF;color:#6D5DFC;font-size:12px;font-weight:700;user-select:none;white-space:nowrap';
  cue.focus();
  var sel = window.getSelection();
  var rg = null;
  if (sel && sel.rangeCount && cue.contains(sel.anchorNode)) rg = sel.getRangeAt(0);
  else if (_wtpRango && cue.contains(_wtpRango.startContainer)) rg = _wtpRango;
  if (rg){
    rg.deleteContents(); rg.insertNode(chip);
    rg.setStartAfter(chip); rg.collapse(true);
    if (sel){ sel.removeAllRanges(); sel.addRange(rg); }
    _wtpRango = rg.cloneRange();
  } else {
    cue.appendChild(chip);
  }
  wtpPreview();
}
/* Lee el editor y devuelve las tres cosas a la vez: el cuerpo con {{n}} por
   orden de aparición, la lista de datos y la lista de ejemplos. */
function wtpLeerCuerpo(){
  var cue = document.getElementById('wtpCuerpo');
  var out = { txt: '', chips: [] };
  (function leer(node){
    for (var i = 0; i < node.childNodes.length; i++){
      var ch = node.childNodes[i];
      if (ch.nodeType === 3){ out.txt += ch.nodeValue; continue; }
      if (ch.nodeType !== 1) continue;
      if (ch.dataset && ch.dataset.var){
        out.chips.push(ch);
        out.txt += '{{' + out.chips.length + '}}';
        continue;
      }
      if (ch.tagName === 'BR'){ out.txt += '\n'; continue; }
      var esBloque = /^(DIV|P)$/.test(ch.tagName);
      if (esBloque && out.txt && out.txt.slice(-1) !== '\n') out.txt += '\n';
      leer(ch);
    }
  })(cue || document.createElement('div'));
  return {
    cuerpo: out.txt.replace(/ /g, ' ').trim(),
    vars: out.chips.map(function(c){ return c.dataset.var; }),
    ejemplos: out.chips.map(function(c){ return c.dataset.ej || ''; }),
  };
}
function wtpPreview(){
  var nom = document.getElementById('wtpNombre');
  var pie = document.getElementById('wtpPie');
  var slugEl = document.getElementById('wtpSlug');
  if (slugEl) slugEl.textContent = nom && nom.value ? 'Meta la guardará como: ' + wtpSlug(nom.value) : '';
  // La vista previa: el mismo cuerpo con cada ficha vuelta su ejemplo.
  var d = wtpLeerCuerpo();
  var txt = d.cuerpo.replace(/\{\{(\d+)\}\}/g, function(_m, n){ return d.ejemplos[parseInt(n,10)-1] || ''; });
  var prev = document.getElementById('wtpPrev');
  if (prev){
    var p = (pie && pie.value) ? '\n\n' + pie.value : '';
    prev.textContent = (txt.trim() ? txt : 'Escribe el mensaje…') + p;
    /* Los botones se dibujan DEBAJO de la burbuja, como los pinta WhatsApp: en
       gris y separados, no dentro del texto verde. */
    var cajaB = document.getElementById('wtpPrevBotones');
    if (cajaB){
      cajaB.innerHTML = (WTP.botones || []).filter(function(b){ return b.texto.trim(); })
        .map(function(b){
          return '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;' +
            'padding:8px;text-align:center;font-size:13px;color:#1E88E5;font-weight:600;' +
            'margin-top:4px;max-width:300px">' + wtpEsc(b.texto) + '</div>';
        }).join('');
    }
  }
}
// El pegado entra como texto plano: pegar HTML dentro del editor rompería
// las fichas y metería formato invisible que Meta rechaza.
(function(){
  function engancharPegado(){
    var cue = document.getElementById('wtpCuerpo');
    if (!cue || cue._pegadoOk) return;
    cue._pegadoOk = true;
    cue.addEventListener('paste', function(e){
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
  }
  if (document.readyState !== 'loading') engancharPegado();
  else document.addEventListener('DOMContentLoaded', engancharPegado);
})();
/* El creador vive cerrado: la lista limpia y el boton. Al abrirlo, la lista
   espera abajo atenuada y sin recibir clics; al radicar o cancelar, vuelve. */
function wtpAbrirCreador(){
  var w = document.getElementById('wtpCrearWrap'), hn = document.getElementById('wtpHeadNormal'),
      hc = document.getElementById('wtpHeadCrear'), l = document.getElementById('wtpList');
  if (!w) return;
  w.style.display = ''; if (hn) hn.style.display = 'none'; if (hc) hc.style.display = 'flex';
  if (l){ l.style.opacity = '.45'; l.style.pointerEvents = 'none'; }
  WTP.botones = []; wtpPintarBotones(); wtpCargarSlug();
  var nom = document.getElementById('wtpNombre'); if (nom) nom.focus();
}
function wtpCerrarCreador(){
  var w = document.getElementById('wtpCrearWrap'), hn = document.getElementById('wtpHeadNormal'),
      hc = document.getElementById('wtpHeadCrear'), l = document.getElementById('wtpList');
  if (!w) return;
  w.style.display = 'none'; if (hn) hn.style.display = 'flex'; if (hc) hc.style.display = 'none';
  if (l){ l.style.opacity = ''; l.style.pointerEvents = ''; }
}
async function wtpCrear(){
  var nom = document.getElementById('wtpNombre');
  var cue = document.getElementById('wtpCuerpo');
  var pie = document.getElementById('wtpPie');
  var cat = document.getElementById('wtpCat');
  var btn = document.getElementById('wtpSaveBtn');
  var msg = document.getElementById('wtpMsg');
  var setMsg = function(t, ok){ if (msg){ msg.style.color = ok ? '#16A34A' : '#DC2626'; msg.textContent = t; } };

  if (!nom.value.trim()){ setMsg('Ponle un nombre a la plantilla.', false); nom.focus(); return; }
  var d0 = wtpLeerCuerpo();
  if (!d0.cuerpo){ setMsg('Escribe el mensaje.', false); if (cue) cue.focus(); return; }
  // Meta rechaza dos datos pegados sin texto entre ellos.
  if (/\}\}\s*\{\{/.test(d0.cuerpo)){ setMsg('Entre dos datos tiene que haber texto: Meta rechaza dos datos pegados.', false); return; }

  btn.disabled = true; btn.textContent = 'Enviando a Meta…'; setMsg('', true);
  var d = await wtpCall({
    action:'create', nombre: nom.value, categoria: cat.value, idioma: 'es',
    cuerpo: d0.cuerpo, pie: pie.value.trim(), ejemplos: d0.ejemplos,
    /* Solo los que estan completos: un boton sin texto, o un enlace sin
       direccion, hace que Meta rechace la plantilla entera. */
    botones: WTP.botones.filter(function(b){
      return b.texto.trim() && (b.tipo === 'respuesta' || b.url.trim());
    }),
  });
  btn.disabled = false; btn.textContent = 'Enviar a aprobación';
  if (d.error){ setMsg(d.error, false); return; }

  /* El mapeo hueco→dato se guarda YA, con la radicación: cuando Meta
     apruebe, la plantilla aparece conectada sin un paso más. Las fichas
     libres quedan como 'libre' (ese dato se llenará al enviar campañas). */
  if (d0.vars.length){
    try {
      var bid = await wtpBranch();
      var cur = await sb.from('ia_config').select('plantillas_vars').eq('branch_id', bid).maybeSingle();
      var todo = (cur.data && cur.data.plantillas_vars) || {};
      todo[wtpSlug(nom.value)] = d0.vars;
      await sb.from('ia_config').update({ plantillas_vars: todo }).eq('branch_id', bid);
      WTP.vars = todo;
    } catch(e){}
  }

  setMsg('Plantilla enviada a Meta. Queda "En revisión" — puede tardar de unos minutos a 24 horas.', true);
  nom.value = ''; pie.value = '';
  WTP.botones = []; wtpPintarBotones();
  if (cue) cue.innerHTML = '';
  wtpPreview(); wtpCerrarCreador(); wtpCargar();
}
async function wtpBorrar(nombre){
  if (!confirm('¿Eliminar la plantilla "'+nombre+'"? Si estaba aprobada, dejarás de poder enviarla.')) return;
  var d = await wtpCall({ action:'delete', nombre: nombre });
  if (d.error){ alert(d.error); return; }
  wtpCargar();
}
(function(){
  function hook(){
    if (window.ciaAlAbrir) ciaAlAbrir('difusion', 'd-plantillas', function(){
      wtpCargar(); wtpPreview();
    });
  }
  if (document.readyState !== 'loading') hook();
  else document.addEventListener('DOMContentLoaded', hook);
})();


/* ══════════════════════════════════════════════════════════════════════════
   MÉTODOS DE PAGO — editor (fuente de verdad: ia_config.pagos)
   El bot sigue leyendo ia_config.pagos IGUAL: preservamos metodos, titular,
   llave, qr_imagen_url, qr_texto, esperar_comprobante, nota, bancos_correo.
   ══════════════════════════════════════════════════════════════════════════ */
var MP = { pagos:{}, metodos:[], branchId:'', qrUrl:'', dirty:false, sel:null };
var MP_TIPOS = [
  ['efectivo','Efectivo'],['tarjeta','Tarjeta / datáfono'],['transferencia','Transferencia'],
  ['billetera','Billetera digital (Nequi, Daviplata…)'],['banco','Banco específico'],['otro','Otro']
];
var MP_CANALES = [['mesa','Mesa'],['rapida','Rápida'],['domicilio','Domicilio']];

/* ── Puntos y Saldo: metodos que NO traen plata de afuera ────────────────
   El cliente paga con algo que ya tenia. Viven en la MISMA lista que los
   demas metodos —esa es la regla: una sola fuente para todas las pantallas—
   pero no se pueden renombrar ni borrar, porque no son un metodo que el
   restaurante inventa: son un modulo del sistema que enciende o apaga.

   El saldo solo existe donde hay pagina de clientes. Un restaurante sin
   pagina no tiene donde recargar, asi que ni siquiera ve la tarjeta. */
var MP_FIJOS = [
  { id:'__puntos', tipo:'puntos', nombre:'Puntos',
    sub:'El cliente paga con los puntos que acumuló. Se descuentan de su bolsa.',
    requierePagina:false },
  { id:'__saldo', tipo:'saldo', nombre:'Billetera',
    sub:'El cliente paga con el saldo que recargó en tu página. Se le descuenta al cobrar.',
    requierePagina:true }
];
function _mpEsFijo(m){ return !!(m && MP_FIJOS.some(function(f){ return f.id === m.id; })); }
function _mpDefFijo(id){ for(var i=0;i<MP_FIJOS.length;i++){ if(MP_FIJOS[i].id===id) return MP_FIJOS[i]; } return null; }
function _mpUid(){ return 'pm_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-3); }
function _mpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _mpV(id){ var e=document.getElementById(id); return e?e.value.trim():''; }
function _mpC(id){ var e=document.getElementById(id); return e?e.checked:false; }
function _mpFind(id){ for(var i=0;i<MP.metodos.length;i++){ if(MP.metodos[i].id===id) return MP.metodos[i]; } return null; }
function _mpGuessTipo(nombre,digital){
  var n=(nombre||'').toLowerCase();
  if(n.indexOf('efectivo')>=0) return 'efectivo';
  if(n.indexOf('tarjeta')>=0||n.indexOf('datafono')>=0||n.indexOf('datáfono')>=0) return 'tarjeta';
  if(n.indexOf('nequi')>=0||n.indexOf('daviplata')>=0||n.indexOf('billetera')>=0) return 'billetera';
  if(n.indexOf('transfer')>=0) return 'transferencia';
  if(n.indexOf('bancolombia')>=0||n.indexOf('banco')>=0) return 'banco';
  return digital?'transferencia':'otro';
}
function _mpNormalize(p){
  var arr = Array.isArray(p.metodos)?p.metodos.slice():[];
  if(!arr.length){
    if(p.efectivo) arr.push({nombre:'Efectivo',digital:false});
    if(p.nequi) arr.push({nombre:'Nequi',digital:true});
    if(p.daviplata) arr.push({nombre:'Daviplata',digital:true});
    if(p.tarjeta) arr.push({nombre:'Tarjeta',digital:false});
  }
  return arr.map(function(m,i){
    return {
      id:m.id||_mpUid(), nombre:m.nombre||'', digital:!!m.digital,
      tipo:m.tipo||_mpGuessTipo(m.nombre,m.digital),
      activo:m.activo!==false, orden:(m.orden!=null)?m.orden:i, porDefecto:!!m.porDefecto,
      cuenta:m.cuenta||'', banco:m.banco||'', instrucciones:m.instrucciones||'',
      canales:Array.isArray(m.canales)?m.canales:['mesa','rapida','domicilio'], comision:Number(m.comision)||0
    };
  }).sort(function(a,b){ return (a.orden||0)-(b.orden||0); });
}

/* Los fijos se anaden si todavia no estan guardados, APAGADOS por defecto:
   nadie quiere que un modulo nuevo aparezca cobrando sin haberlo pedido.
   El del saldo lleva el nombre del negocio ("Saldo El Parche") porque asi lo
   lee el cajero y asi sale en el cuadre de caja. */
function _mpConFijos(lista, negocio, tienePagina){
  var out = lista.slice();
  MP_FIJOS.forEach(function(f){
    if (f.requierePagina && !tienePagina) return;
    var nombre = (f.id === '__saldo' && negocio) ? ('Billetera ' + negocio) : f.nombre;
    var ya = null;
    for (var i = 0; i < out.length; i++) { if (out[i].id === f.id) { ya = out[i]; break; } }
    if (ya) {
      ya.tipo = f.tipo;
      var act = String(ya.nombre||'').trim();
      if (!act || /^Saldo\b/i.test(act)) ya.nombre = nombre;
      return;
    }
    out.push({ id:f.id, nombre:nombre, digital:false, tipo:f.tipo, activo:false,
               orden:out.length, porDefecto:false, cuenta:'', banco:'', instrucciones:'',
               canales:['mesa','rapida','domicilio'], comision:0 });
  });
  return out;
}

window.metodosPagoInit = async function(){
  var root=document.getElementById('mp-root'); if(!root) return;
  root.innerHTML='<div style="padding:48px;text-align:center;color:#94A3B8;font-size:13px">Cargando métodos de pago…</div>';
  try{
    var res=await sb.auth.getSession(); var session=res && res.data ? res.data.session : null;
    MP.branchId=(session&&session.user&&session.user.user_metadata&&session.user.user_metadata.branch_id)||'';
    var q=await sb.from('ia_config').select('pagos').eq('branch_id',MP.branchId).maybeSingle();
    MP.pagos=(q&&q.data&&q.data.pagos)?q.data.pagos:{};
    window._loadedPagos=MP.pagos;
    /* El saldo solo tiene sentido donde hay pagina de clientes. Se pregunta
       una vez, aqui, y no en cada tarjeta. */
    var meta=(session&&session.user&&session.user.user_metadata)||{};
    MP.negocio=meta.negocio||'';
    MP.tienePagina=false;
    try{
      if(meta.tenant_id){
        var t=await sb.from('tenants').select('web_activa').eq('id',meta.tenant_id).maybeSingle();
        MP.tienePagina=!!(t&&t.data&&t.data.web_activa);
      }
    }catch(e){ console.warn('[mp] no se pudo saber si hay pagina:',e); }
    MP.metodos=_mpConFijos(_mpNormalize(MP.pagos), MP.negocio, MP.tienePagina);
    MP.qrUrl=(MP.pagos.qr_imagen_url!=null)?MP.pagos.qr_imagen_url:'';
    MP.dirty=false;
    _mpRender();
  }catch(e){ root.innerHTML='<div style="padding:48px;text-align:center;color:#DC2626">Error al cargar: '+_mpEsc(e&&e.message||e)+'</div>'; }
};

function _mpField(id,label,val,ph){
  return '<div><label style="font-size:12px;font-weight:700;color:#475569">'+label+'</label>'
    +'<input id="'+id+'" value="'+_mpEsc(val)+'" placeholder="'+_mpEsc(ph||'')+'" oninput="mpDirty()" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #E2E8F0;border-radius:10px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box"></div>';
}
function _mpTextarea(id,label,val,ph){
  return '<label style="font-size:12px;font-weight:700;color:#475569">'+label+'</label>'
    +'<textarea id="'+id+'" rows="3" placeholder="'+_mpEsc(ph||'')+'" oninput="mpDirty()" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #E2E8F0;border-radius:10px;font-family:inherit;font-size:13px;outline:none;resize:vertical;box-sizing:border-box">'+_mpEsc(val)+'</textarea>';
}
function _mpFieldInline(label,handler,val,ph){
  return '<div><label style="font-size:10.5px;font-weight:700;color:#94A3B8;text-transform:uppercase">'+label+'</label>'
    +'<input value="'+_mpEsc(val)+'" oninput="'+handler+'" placeholder="'+_mpEsc(ph||'')+'" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #E2E8F0;border-radius:8px;font-family:inherit;font-size:12.5px;outline:none;box-sizing:border-box"></div>';
}
/* Los fijos no se renombran, no se borran y no tienen comision ni QR: lo
   unico que se decide de ellos es si se pueden usar o no, y en que canales. */
/* Un icono por tipo: en una tarjeta pequena el icono se reconoce antes que
   la palabra, y es lo que permite barrer la fila de un vistazo. */
var MP_ICO = {
  efectivo:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  tarjeta:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  transferencia:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  banco:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg>',
  billetera:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  puntos:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6 12 2"/></svg>',
  saldo:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><rect x="5" y="9.5" width="4.5" height="3.5" rx="1"/><path d="M15.5 10a3.2 3.2 0 0 1 0 4"/><path d="M18 8.4a6 6 0 0 1 0 7.2"/></svg>',
  otro:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/></svg>'
};
function _mpIco(t){ return MP_ICO[t] || MP_ICO.otro; }
var MP_TIPO_NOM = {};
MP_TIPOS.forEach(function(t){ MP_TIPO_NOM[t[0]] = t[1]; });

/* La tarjeta: lo justo para reconocer el metodo sin abrirlo. El detalle vive
   en el rail. La estrella dice "es el de por defecto" y el QR "pide
   comprobante" — dos cosas que antes solo se sabian leyendo tres casillas. */
function _mpTileHtml(m){
  var sub = m.banco || MP_TIPO_NOM[m.tipo] || 'Otro';
  if (m.banco && m.cuenta) sub = m.banco + ' \u00b7 ' + m.cuenta;
  var canales = (m.canales||[]).map(function(c){
    for (var i=0;i<MP_CANALES.length;i++) if (MP_CANALES[i][0]===c) return MP_CANALES[i][1];
    return c;
  }).join(' · ') || 'En ningún canal';
  return '<button type="button" class="mp-tile'+(MP.sel===m.id?' on':'')+(m.activo?'':' off')+'" onclick="mpSelect(\''+m.id+'\')">'
    +'<div class="mp-tile-top"><span class="mp-tile-ico">'+_mpIco(m.tipo)+'</span>'
      +'<span class="mp-tile-marks">'
        +(m.porDefecto?'<span class="mp-mark" title="Es el de por defecto"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6 12 2"/></svg></span>':'')
        +(m.digital?'<span class="mp-mark" title="Pide comprobante"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></span>':'')
      +'</span></div>'
    +'<div class="mp-tile-n">'+(_mpEsc(m.nombre)||'<i>Sin nombre</i>')+'</div>'
    +'<div class="mp-tile-s">'+_mpEsc(sub)+'</div>'
    +'<div class="mp-tile-foot">'+(m.activo?_mpEsc(canales):'No se puede usar')+'</div>'
  +'</button>';
}

/* Puntos y Saldo NO van al rail a proposito: si estuvieran ahi, desapareceran
   apenas selecciones un metodo. Su unico control es prendido/apagado, asi que
   el interruptor va en la tarjeta y siempre esta a la vista. */
function _mpFijoHtml(m){
  var f = _mpDefFijo(m.id) || {};
  return '<div class="mp-fijo'+(m.activo?' on':'')+'">'
    +'<span class="mp-fijo-ico">'+_mpIco(m.tipo)+'</span>'
    +'<span class="mp-fijo-txt"><span class="mp-fijo-n">'+_mpEsc(m.nombre)+'</span>'
      +'<span class="mp-fijo-s">'+(m.activo?_mpEsc(f.sub||''):'Apagado · no aparece al cobrar')+'</span></span>'
    +'<label class="mp-sw" title="Se puede usar"><input type="checkbox"'+(m.activo?' checked':'')
      +' onchange="mpToggle(\''+m.id+'\',\'activo\',this.checked)"><span></span></label>'
  +'</div>';
}

/* El editor del metodo seleccionado. Es el mismo formulario de antes, pero de
   uno en uno y en su sitio, no cuatro abiertos peleandose el centro. */
function _mpInspectorHtml(m){
  var tipoOpts=MP_TIPOS.map(function(t){ return '<option value="'+t[0]+'"'+(m.tipo===t[0]?' selected':'')+'>'+t[1]+'</option>'; }).join('');
  var canalChips=MP_CANALES.map(function(c){
    var on=(m.canales||[]).indexOf(c[0])>=0;
    return '<button type="button" class="mp-chip'+(on?' on':'')+'" onclick="mpToggleCanal(\''+m.id+'\',\''+c[0]+'\')">'+c[1]+'</button>';
  }).join('');
  /* El QR va PEGADO a su cuenta. Antes habia uno solo para todo el
     restaurante: con dos cuentas, el cliente recibia el QR de una y el numero
     de la otra. Aqui no existe forma de emparejarlos mal. */
  var qrDeEsta = m.qr_url || '';
  var qrGlobal = MP.qrUrl || '';
  var qrBloque =
     '<div class="cf-gen-sep"><div class="cf-rail-sublabel">QR de esta cuenta</div>'
    +'<div class="mp-qr">'
      +(qrDeEsta
        ? '<img class="mp-qr-img" src="'+_mpEsc(qrDeEsta)+'" alt="QR" onclick="cfgVerImagen(\''+_mpEsc(qrDeEsta)+'\')">'
        : (qrGlobal
           ? '<img class="mp-qr-img heredado" src="'+_mpEsc(qrGlobal)+'" alt="QR" onclick="cfgVerImagen(\''+_mpEsc(qrGlobal)+'\')">'
           : '<div class="mp-qr-vacio">Sin QR</div>'))
      +'<div class="mp-qr-lado">'
        +'<label class="lm-btn-ghost sm mp-qr-btn">'+(qrDeEsta?'Cambiar':'Subir QR')
          +'<input type="file" accept="image/*" hidden onchange="mpQrSubir(\''+m.id+'\',this)"></label>'
        +(qrDeEsta ? '<button class="mp-del sm" onclick="mpQrQuitar(\''+m.id+'\')">Quitar</button>' : '')
        +'<div class="mp-qr-nota">'
          +(qrDeEsta ? 'El bot manda este QR cuando el cliente escoge esta cuenta.'
            : (qrGlobal ? 'Está usando el QR general del restaurante. Sube uno aquí si esta cuenta tiene el suyo.'
                        : 'Sin QR, el bot manda solo el número de la cuenta.'))
        +'</div>'
      +'</div>'
    +'</div></div>';

  var digRow = m.digital ? (
     '<div class="cf-gen-sep"><div class="cf-rail-sublabel">Datos de la cuenta</div>'
    +_mpFieldInline('Cuenta / llave','mpField(\''+m.id+'\',\'cuenta\',this.value)',m.cuenta,'Número o llave')
    +'<div style="height:9px"></div>'
    +_mpFieldInline('Banco','mpField(\''+m.id+'\',\'banco\',this.value)',m.banco,'Ej. Bancolombia')
    +'</div>'
    + qrBloque) : '';
  return '<div class="cf-rail-head"><div><div class="cf-eyebrow">Método</div>'
      +'<div class="cf-rail-title">'+(_mpEsc(m.nombre)||'Sin nombre')+'</div></div>'
      +'<button class="cf-mini-del" title="Cerrar" onclick="mpSelect(null)">&times;</button></div>'
    +'<div class="cf-rail-body">'
      +'<div class="cf-form-field"><label class="cf-form-label">Nombre</label>'
        +'<input class="cf-form-input" value="'+_mpEsc(m.nombre)+'" oninput="mpField(\''+m.id+'\',\'nombre\',this.value);mpRefrescarTiles()" placeholder="Ej. Nequi, Efectivo…"></div>'
      +'<div class="cf-form-field" style="margin-top:12px"><label class="cf-form-label">Tipo</label>'
        +'<select class="cf-form-input" onchange="mpField(\''+m.id+'\',\'tipo\',this.value);_mpRender()">'+tipoOpts+'</select></div>'
      +'<div class="cf-gen-sep"><label class="mp-check"><input type="checkbox"'+(m.activo?' checked':'')+' onchange="mpToggle(\''+m.id+'\',\'activo\',this.checked)"> Se puede usar</label>'
        +'<label class="mp-check"><input type="checkbox"'+(m.digital?' checked':'')+' onchange="mpToggle(\''+m.id+'\',\'digital\',this.checked)"> Digital (QR + comprobante)</label>'
        +'<label class="mp-check"><input type="radio" name="mp-default"'+(m.porDefecto?' checked':'')+' onchange="mpSetDefault(\''+m.id+'\')"> Es el de por defecto</label></div>'
      +'<div class="cf-gen-sep"><div class="cf-rail-sublabel">Disponible en</div>'
        +'<div class="mp-chips">'+canalChips+'</div></div>'
      + digRow
      +'<div class="cf-gen-sep"><div class="cf-rail-sublabel">Comisión</div>'
        +'<div class="mp-comision"><input type="number" min="0" step="0.1" class="cf-form-input" value="'+(m.comision||'')+'" oninput="mpField(\''+m.id+'\',\'comision\',this.value)" placeholder="0"><span>%</span></div></div>'
    +'</div>'
    +'<div class="cf-rail-foot">'
      +'<button class="lm-btn-ghost sm" onclick="mpMove(\''+m.id+'\',-1)">&uarr; Subir</button>'
      +'<button class="lm-btn-ghost sm" onclick="mpMove(\''+m.id+'\',1)">&darr; Bajar</button>'
      +'<button class="mp-del" onclick="mpDelete(\''+m.id+'\')">Eliminar</button>'
    +'</div>';
}

/* Sin nada seleccionado el rail no se queda vacio: resume el estado y dice
   como llenarlo, igual que el panel de zonas en Mesas. */
function _mpResumenHtml(){
  var normales = MP.metodos.filter(function(m){ return !_mpEsFijo(m); });
  var act = normales.filter(function(m){ return m.activo!==false; }).length;
  var def = normales.find(function(m){ return m.porDefecto; });
  return '<div class="cf-rail-head"><div><div class="cf-eyebrow">Resumen</div>'
      +'<div class="cf-rail-title">Cobras así</div></div></div>'
    +'<div class="cf-rail-body">'
      +'<div class="cf-stat-row">'
        +'<div class="cf-stat-box"><div class="cf-stat-big">'+act+'</div><div class="cf-stat-lbl">se pueden usar</div></div>'
        +'<div class="cf-stat-box"><div class="cf-stat-big">'+normales.length+'</div><div class="cf-stat-lbl">métodos en total</div></div>'
      +'</div>'
      +'<div class="cf-rail-sublabel">Por defecto</div>'
      +'<div class="mp-defbox">'+(def?_mpEsc(def.nombre):'Ninguno marcado')+'</div>'
      +'<div class="cf-gen-sep cf-rail-hint">Selecciona un método para editarlo.</div>'
    +'</div>';
}

function _mpRender(){
  var root=document.getElementById('mp-root'); if(!root) return;
  var normales=MP.metodos.filter(function(m){ return !_mpEsFijo(m); });
  var fijos=MP.metodos.filter(_mpEsFijo);

  var tiles = normales.map(_mpTileHtml).join('')
    + '<button type="button" class="mp-add" onclick="mpAddMetodo()">'
      + '<span class="mp-add-ico"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>'
      + '<span class="mp-add-l">Nuevo método</span></button>';

  /* Los fijos van abajo del panel, no en el rail: si estuvieran en el rail
     desapareceran apenas selecciones un metodo, y son justo lo que uno viene
     a prender. */
  var bloqueFijos = fijos.length ? (
    '<div class="mp-fijos"><div class="cf-rail-sublabel" style="margin:0 0 9px">Lo que el cliente ya tiene</div>'
    + '<div class="mp-fijos-grid">' + fijos.map(_mpFijoHtml).join('') + '</div></div>') : '';

  var sel = MP.sel ? _mpFind(MP.sel) : null;

  root.innerHTML =
    '<section class="cf-pagehead">'
      +'<div><div class="cf-eyebrow">Ventas</div>'
      +'<h2 class="cf-pagehead-title">Métodos de pago</h2>'
      +'<p class="cf-pagehead-sub">Lo único que leen la pantalla de cobro, el cuadre de caja y el asistente de WhatsApp.</p></div>'
      +'<button class="lm-btn-primary" id="mp-save" onclick="mpSave()" disabled style="opacity:.5">Guardar cambios</button>'
    +'</section>'
    +'<section class="cf-body cf-body-mp">'
      +'<div class="cf-gridpanel mp-panel">'
        +'<div class="mp-grid">'+tiles+'</div>'
        + bloqueFijos
      +'</div>'
      +'<aside class="cf-rail">' + (sel ? _mpInspectorHtml(sel) : _mpResumenHtml()) + '</aside>'
    +'</section>';
  _mpUpdateSaveBtn();
}

/* Al cambiar el nombre se repinta SOLO la grilla, no el rail: repintar el rail
   le quitaria el foco al campo en el que estas escribiendo y perderias el
   cursor a mitad de palabra. */
window.mpRefrescarTiles=function(){
  var g=document.querySelector('.mp-grid'); if(!g) return;
  var normales=MP.metodos.filter(function(m){ return !_mpEsFijo(m); });
  var add=g.querySelector('.mp-add');
  g.innerHTML = normales.map(_mpTileHtml).join('') + (add?add.outerHTML:'');
};

window.mpSelect=function(id){ MP.sel = id || null; _mpRender(); };

/* Visor de imagen a pantalla completa. Uno solo para todas las miniaturas:
   se crea la primera vez y se reutiliza. Se cierra tocando el fondo, la X o
   la tecla Escape — los tres caminos que la gente intenta. */
window.cfgVerImagen = function (src) {
  var ov = document.getElementById('cfg-visor');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cfg-visor';
    ov.className = 'cfg-visor';
    ov.innerHTML = '<button class="cfg-visor-x" type="button" aria-label="Cerrar">'
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button><img alt="">';
    document.body.appendChild(ov);
    var cerrar = function () { ov.classList.remove('on'); };
    ov.addEventListener('click', function (e) {
      /* Solo el fondo cierra: un clic sobre la foto no debe cerrarla. */
      if (e.target === ov || e.target.closest('.cfg-visor-x')) cerrar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cerrar();
    });
  }
  ov.querySelector('img').src = src;
  ov.classList.add('on');
};


/* Sube el QR de UNA cuenta. Mismo bucket que el QR general (chat-media): el
   bot ya sabe leer de ahi y no hay que tocar permisos. */
window.mpQrSubir = async function (id, input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var m = _mpFind(id); if (!m) return;
  var ext  = (file.name.split('.').pop() || 'png').toLowerCase();
  var path = 'qr/' + MP.branchId + '/' + id + '.' + ext;
  try {
    var up = await sb.storage.from('chat-media').upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) { console.error('QR de cuenta, error al subir:', up.error); alert('No se pudo subir el QR.'); return; }
    var pub = sb.storage.from('chat-media').getPublicUrl(path);
    /* Se le pega la hora para que el navegador no muestre el QR viejo cuando
       se reemplaza: mismo nombre de archivo, misma URL, imagen distinta. */
    m.qr_url = pub.data.publicUrl + '?t=' + Date.now();
    MP.dirty = true; _mpRender();
  } catch (e) { console.error('QR de cuenta:', e); alert('No se pudo subir el QR.'); }
};

window.mpQrQuitar = function (id) {
  var m = _mpFind(id); if (!m) return;
  m.qr_url = '';
  MP.dirty = true; _mpRender();
};

window.mpDirty=function(){ MP.dirty=true; _mpUpdateSaveBtn(); };
window.mpField=function(id,key,val){ var m=_mpFind(id); if(!m)return; m[key]=(key==='comision')?(Number(val)||0):val; MP.dirty=true; _mpUpdateSaveBtn(); };
window.mpToggle=function(id,key,val){ var m=_mpFind(id); if(!m)return; m[key]=!!val; MP.dirty=true; _mpUpdateSaveBtn(); _mpRender(); };
window.mpToggleCanal=function(id,canal){ var m=_mpFind(id); if(!m)return; var i=(m.canales||[]).indexOf(canal); if(i>=0) m.canales.splice(i,1); else m.canales.push(canal); MP.dirty=true; _mpRender(); };
window.mpSetDefault=function(id){ MP.metodos.forEach(function(m){ m.porDefecto=(m.id===id); }); MP.dirty=true; _mpRender(); };
window.mpMove=function(id,dir){ var i=-1,k; for(k=0;k<MP.metodos.length;k++){ if(MP.metodos[k].id===id){ i=k; break; } } if(i<0)return; var j=i+dir; if(j<0||j>=MP.metodos.length)return; var t=MP.metodos[i]; MP.metodos[i]=MP.metodos[j]; MP.metodos[j]=t; MP.dirty=true; _mpRender(); };
window.mpAddMetodo=function(){
  /* Se crea Y se selecciona: un metodo recien creado no tiene nombre, asi que
     lo primero que hace falta es el editor abierto. */
  var nuevo={id:_mpUid(),nombre:'',digital:false,tipo:'efectivo',activo:true,orden:MP.metodos.length,porDefecto:false,cuenta:'',banco:'',instrucciones:'',canales:['mesa','rapida','domicilio'],comision:0};
  MP.metodos.push(nuevo); MP.sel=nuevo.id; MP.dirty=true; _mpRender();
};
window.mpDelete=function(id){ var m=_mpFind(id);
  /* Puntos y Saldo no se borran: no son un metodo que el restaurante creo,
     son un modulo. Para dejar de usarlos se apagan. */
  if(_mpEsFijo(m)){ alert('"'+m.nombre+'" no se elimina. Si no quieres usarlo, apágalo con "Se puede usar".'); return; }
  if(m&&m.nombre&&!confirm('¿Eliminar "'+m.nombre+'"? Las ventas antiguas conservan su método; solo deja de aparecer para cobrar.')) return; MP.metodos=MP.metodos.filter(function(x){return x.id!==id;}); if(MP.sel===id) MP.sel=null; MP.dirty=true; _mpRender(); };
window.mpQrUpload=async function(input){
  var file=input&&input.files&&input.files[0]; if(!file) return;
  try{
    var ext=((file.name||'qr.png').split('.').pop()||'png').toLowerCase();
    var path='pagos-qr/'+(MP.branchId||'b')+'_'+Date.now()+'.'+ext;
    var up=await sb.storage.from('chat-media').upload(path,file,{upsert:true,contentType:file.type||'image/png'});
    if(up.error) throw up.error;
    var pub=sb.storage.from('chat-media').getPublicUrl(path);
    MP.qrUrl=(pub&&pub.data&&pub.data.publicUrl)||'';
    MP.dirty=true; _mpRender();
  }catch(e){ alert('No se pudo subir el QR: '+(e&&e.message||e)); }
};
window.mpQrClear=function(){ MP.qrUrl=''; MP.dirty=true; _mpRender(); };
window.mpSave=async function(){
  var btn=document.getElementById('mp-save'); if(btn){ btn.disabled=true; btn.textContent='Guardando…'; }
  try{
    var metodos=MP.metodos.map(function(m,i){ return {
      id:m.id, nombre:(m.nombre||'').trim(), digital:!!m.digital, tipo:m.tipo||'otro',
      activo:m.activo!==false, orden:i, porDefecto:!!m.porDefecto,
      cuenta:(m.cuenta||'').trim(), banco:(m.banco||'').trim(),
      canales:Array.isArray(m.canales)?m.canales:['mesa','rapida','domicilio'], comision:Number(m.comision)||0
    }; }).filter(function(m){ return m.nombre; });
    var old=MP.pagos||{};
    // Solo administramos la LISTA de métodos. Los datos del bot (titular, llave,
    // QR, mensaje, comprobante, correos de banco, nota) se conservan tal cual
    // desde `old` — se editan en Asistente IA → Pagos. Cero riesgo para el bot.
    var pagos=Object.assign({},old,{
      metodos:metodos,
      /* Estas banderas le dicen al bot que puede ofrecer. Los fijos son
         digital:false, asi que sin excluirlos el bot creeria que hay efectivo
         donde no lo hay. */
      efectivo:metodos.some(function(m){return !_mpEsFijo(m)&&(m.tipo==='efectivo'||!m.digital);}),
      nequi:metodos.some(function(m){return (m.nombre||'').toLowerCase().indexOf('nequi')>=0;}),
      daviplata:metodos.some(function(m){return (m.nombre||'').toLowerCase().indexOf('daviplata')>=0;}),
      tarjeta:metodos.some(function(m){return m.tipo==='tarjeta';})
    });
    var r=await sb.from('ia_config').update({pagos:pagos}).eq('branch_id',MP.branchId);
    if(r.error) throw r.error;
    MP.pagos=pagos; window._loadedPagos=pagos; MP.dirty=false;
    /* Lo guardado en el equipo queda viejo en este mismo instante. Se borra
       para que la proxima pantalla traiga la lista nueva y no el nombre
       anterior de un metodo que se acaba de cambiar. */
    try { if (window.posCache) posCache.borrar('metodos'); } catch(e){}
    if(btn){ btn.textContent='Guardado ✓'; }
    _mpToast('Métodos de pago guardados ✓');
    setTimeout(function(){ var b=document.getElementById('mp-save'); if(b){ b.textContent='Guardar cambios'; } _mpUpdateSaveBtn(); },1200);
  }catch(e){ alert('Error al guardar: '+(e&&e.message||e)); var b=document.getElementById('mp-save'); if(b){ b.disabled=false; b.textContent='Guardar cambios'; } }
};
function _mpUpdateSaveBtn(){ var b=document.getElementById('mp-save'); if(!b)return; b.disabled=!MP.dirty; b.style.opacity=MP.dirty?'1':'.5'; }
function _mpToast(msg){
  var t=document.createElement('div'); t.textContent=msg;
  t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0F172A;color:#fff;padding:11px 20px;border-radius:12px;font-family:inherit;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.2)';
  document.body.appendChild(t); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); },2200);
}

/* ── Asistente IA → Pagos: SOLO LECTURA + redirección ─────────────────────── */
window._mpMakeAsistenteReadonly=function(){
  // SOLO la LISTA de métodos (nombres + toggles Digital + eliminar) y el botón
  // "Agregar método" se administran en Métodos de pago. Todo lo demás del
  // asistente (cuenta/llave, titular, QR, esperar comprobante, Gmail, remitentes)
  // sigue editable AQUÍ tal como estaba.
  var list=document.getElementById('metodosList');
  if(list && !list.querySelector('.mp-ro-overlay')){
    list.style.position='relative';
    var ov=document.createElement('div');
    ov.className='mp-ro-overlay';
    ov.title='Los métodos se administran en Métodos de pago';
    ov.style.cssText='position:absolute;inset:0;z-index:20;cursor:pointer;background:transparent';
    ov.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(window.setSection) setSection('pagos'); });
    list.appendChild(ov);
  }
  // "Agregar método": clonar (quita el listener original) y redirigir.
  var addBtn=document.getElementById('metodoAdd');
  if(addBtn && !addBtn.dataset.mpRo){
    var clone=addBtn.cloneNode(true);
    clone.dataset.mpRo='1';
    clone.addEventListener('click',function(e){ e.preventDefault(); if(window.setSection) setSection('pagos'); });
    if(addBtn.parentNode) addBtn.parentNode.replaceChild(clone,addBtn);
  }
  // Banner informativo al inicio de la tarjeta de métodos.
  if(list && !document.getElementById('mp-ro-banner')){
    var b=document.createElement('div');
    b.id='mp-ro-banner';
    b.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:12px;padding:11px 13px;margin-bottom:12px';
    b.innerHTML='<span style="font-size:12px;color:#3730A3;font-weight:600">Los métodos se crean y editan en <strong>Métodos de pago</strong>.</span>'
      +'<button onclick="setSection(\'pagos\')" style="background:#5B6BFF;color:#fff;border:none;border-radius:9px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Ir a Métodos de pago →</button>';
    if(list.parentNode) list.parentNode.insertBefore(b, list);
  }
};



/* ══════════════════════════════════════════════════════════════
   NOTIFICACIONES — tono y volumen del aviso de mensaje nuevo del chat
   Vive dentro de la config de Operación (`notif`) porque se sincroniza a la
   base y así la tablet y el computador suenan igual sin configurarlos aparte.
   ══════════════════════════════════════════════════════════════ */
function opNotifCfg() {
  if (!_opDraft.notif) _opDraft.notif = { activo: true, tono: 'clasico', vol: 60 };
  return _opDraft.notif;
}

function opPintarNotif() {
  var n = opNotifCfg();
  opSetToggle('op-sw-notif', n.activo !== false);
  document.querySelectorAll('[data-notif-tono]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.notifTono === (n.tono || 'clasico'));
  });
  var sl = document.getElementById('op-notif-vol');
  var vl = document.getElementById('op-notif-vol-val');
  if (sl) sl.value = (typeof n.vol === 'number') ? n.vol : 60;
  // En cero se dice "Silencio": un "0%" se lee como si algo estuviera fallando.
  var vv = (typeof n.vol === 'number') ? n.vol : 60;
  if (vl) vl.textContent = vv > 0 ? vv + '%' : 'Silencio';

  // Apagado: el rótulo lo dice y el tono y el volumen se atenúan, como en las
  // demás secciones que se encienden con interruptor.
  var activo = n.activo !== false;
  var st = document.getElementById('op-notif-state');
  if (st) { st.textContent = activo ? 'Activado' : 'Desactivado'; st.className = 'op-state' + (activo ? '' : ' off'); }
  var body = document.getElementById('op-notif-body');
  if (body) { body.style.opacity = activo ? '' : '.45'; body.style.pointerEvents = activo ? '' : 'none'; }
}

/* Probar el tono. Antes esto no sonaba NUNCA: `posNotifProbar` la define
   pos-notify.js, y ese archivo no estaba cargado en esta pantalla. Ahora sí lo
   está; el aviso de abajo queda por si algún día se vuelve a caer, para que el
   botón diga algo en vez de no hacer nada. */
function opProbarTono() {
  var n = opNotifCfg();
  if (typeof window.posNotifProbar !== 'function') {
    if (typeof showToast === 'function') showToast('No se pudo reproducir el sonido — recarga la pantalla', 'red');
    return;
  }
  posNotifProbar(n.tono || 'clasico', (typeof n.vol === 'number') ? n.vol : 60);
}

document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-notif-tono]');
  if (!b || !_opDraft) return;
  opNotifCfg().tono = b.dataset.notifTono;
  opPintarNotif();
  opProbarTono();              // se oye al elegirlo, que es como se escoge un tono
  opCheckDirty();
});

document.addEventListener('input', function (e) {
  if (!e.target || e.target.id !== 'op-notif-vol' || !_opDraft) return;
  opNotifCfg().vol = Number(e.target.value) || 0;
  var vl = document.getElementById('op-notif-vol-val');
  if (vl) vl.textContent = opNotifCfg().vol > 0 ? opNotifCfg().vol + '%' : 'Silencio';
  opCheckDirty();
});

document.addEventListener('click', function (e) {
  if (!e.target || !e.target.closest || !e.target.closest('#op-sw-notif') || !_opDraft) return;
  var n = opNotifCfg();
  n.activo = !(n.activo !== false);
  opPintarNotif();
  if (n.activo) opProbarTono();
  opCheckDirty();
});

/* ══════════════════════════════════════════════════════════════
   FOTO DEL RESTAURANTE (General)
   Se guarda en el almacenamiento, bajo una carpeta con el id del restaurante —
   las reglas de la base solo dejan escribir en la carpeta propia, así que un
   restaurante no puede pisarle la foto a otro ni por error ni a propósito.
   La dirección queda en `brands.logo_url`, que es lo que leen todas las
   pantallas para pintarla en el círculo de arriba a la derecha.
   ══════════════════════════════════════════════════════════════ */
var _logoBrandId = null;

async function genCargarLogo() {
  var caja = document.getElementById('gen-logo-box');
  if (!caja) return;
  try {
    var u = { data: { user: await cfgUsuario() } };
    var tid = u.data && u.data.user && u.data.user.user_metadata && u.data.user.user_metadata.tenant_id;
    if (!tid) return;
    var r = await sb.from('brands').select('id,name,logo_url').eq('tenant_id', tid)
      .order('created_at').limit(1).maybeSingle();
    if (!r.data) return;
    _logoBrandId = r.data.id;
    genPintarLogo(r.data.logo_url, r.data.name);
  } catch (e) { console.warn('logo:', e); }
}

function genIniciales(nombre) {
  return (nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(function (w) { return w[0]; }).join('').toUpperCase();
}

function genPintarLogo(url, nombre) {
  var caja = document.getElementById('gen-logo-box');
  var quitar = document.getElementById('gen-logo-quitar');
  if (!caja) return;
  if (url) {
    caja.innerHTML = '<img src="' + url + '" alt="">';
    if (quitar) quitar.style.display = '';
  } else {
    caja.innerHTML = '<span>' + genIniciales(nombre) + '</span>';
    if (quitar) quitar.style.display = 'none';
  }
  _genLogoUrl = url || '';
  genPintarPreview();
}

/* La vista previa del rail: lo que de verdad sale arriba a la derecha en todas
   las cuentas del restaurante. Antes esto era un parrafo describiendolo; se
   entiende mucho mejor viendolo, y ademas se actualiza mientras escribes. */
var _genLogoUrl = '';
function genPintarPreview() {
  var ava = document.getElementById('gen-prev-ava');
  if (!ava) return;
  var marca  = (document.getElementById('gen-brand-name') || {}).value || '';
  var gerente = (document.getElementById('gen-nombre') || {}).value || '';
  ava.innerHTML = _genLogoUrl
    ? '<img src="' + _genLogoUrl + '" alt="">'
    : '<span>' + genIniciales(marca) + '</span>';
  var n = document.getElementById('gen-prev-nombre');
  var r = document.getElementById('gen-prev-rol');
  if (n) n.textContent = marca.trim() || 'Tu restaurante';
  if (r) r.textContent = (gerente.trim() ? gerente.trim() + ' · ' : '') + 'Gerente';
}

/* Se engancha una sola vez, cuando el HTML ya esta puesto. */
document.addEventListener('DOMContentLoaded', function () {
  ['gen-brand-name', 'gen-nombre'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', genPintarPreview);
  });
  genPintarPreview();
});

function genLogoNota(txt, mal) {
  var n = document.getElementById('gen-logo-nota');
  if (!n) return;
  n.textContent = txt;
  n.className = 'gen-logo-nota' + (mal ? ' mal' : '');
}

/* La foto se ve en un círculo de 36 píxeles, pero la que escoge el dueño sale
   de su celular y puede pesar varios MB. Antes se subía tal cual: la de El
   Parche pesaba 566 KB y había que bajarla en CADA pantalla. Aquí se reduce a
   256 (el doble de lo que se ve en pantallas retina) antes de subirla; queda
   en unos 20-30 KB. */
function genLogoReducir(file) {
  return new Promise(function (listo) {
    var img = new Image();
    img.onload = function () {
      try {
        var LADO = 256;
        var lienzo = document.createElement('canvas');
        lienzo.width = lienzo.height = LADO;
        var g = lienzo.getContext('2d');
        // Recorte cuadrado desde el centro: es lo que se ve dentro del círculo.
        var lado = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
        lienzo.toBlob(function (b) { listo(b || file); }, 'image/png');
      } catch (e) { listo(file); }   // si algo falla, se sube la original
    };
    img.onerror = function () { listo(file); };
    img.src = URL.createObjectURL(file);
  });
}

async function genSubirLogo(input) {
  var f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { genLogoNota('Esa imagen pesa más de 3 MB. Escoge una más liviana.', true); return; }
  if (!_logoBrandId) { genLogoNota('No se pudo identificar tu restaurante. Recarga la pantalla.', true); return; }

  genLogoNota('Subiendo…');
  try {
    var u = { data: { user: await cfgUsuario() } };
    var tid = u.data.user.user_metadata.tenant_id;
    /* El nombre lleva la hora: si se reemplaza la foto, el navegador y el .exe
       tienen que bajar una dirección distinta. Con el mismo nombre se quedarían
       mostrando la vieja — es lo que nos pasó con el logo de Cobra. */
    var ruta = tid + '/logo-' + Date.now() + '.png';
    var chica = await genLogoReducir(f);

    /* cacheControl: sin esto Supabase manda "no-cache" y el programa vuelve a
       bajar la foto entera en cada pantalla. Un año es seguro justamente porque
       cada foto nueva estrena dirección. */
    var up = await sb.storage.from('marca').upload(ruta, chica, {
      contentType: 'image/png', upsert: true, cacheControl: '31536000'
    });
    if (up.error) { genLogoNota('No se pudo subir: ' + (up.error.message || ''), true); return; }

    var pub = sb.storage.from('marca').getPublicUrl(ruta);
    var url = pub.data && pub.data.publicUrl;
    if (!url) { genLogoNota('No se pudo obtener la dirección de la imagen.', true); return; }

    var g = await sb.from('brands').update({ logo_url: url }).eq('id', _logoBrandId).select('id');
    if (g.error || !g.data || !g.data.length) {
      genLogoNota('Se subió, pero no se pudo guardar: ' + ((g.error && g.error.message) || 'sin permisos'), true);
      return;
    }
    genPintarLogo(url, '');
    if (typeof window.posBrandLogo === 'function') window.posBrandLogo(url);   // se ve al instante, sin recargar
    genLogoNota('Listo. Ya la ven todas tus cuentas.');
  } catch (e) {
    genLogoNota('No se pudo subir: ' + (e.message || e), true);
  }
}

async function genQuitarLogo() {
  if (!_logoBrandId) return;
  var g = await sb.from('brands').update({ logo_url: null }).eq('id', _logoBrandId).select('id,name');
  if (g.error) { genLogoNota('No se pudo quitar: ' + g.error.message, true); return; }
  genPintarLogo('', (g.data && g.data[0] && g.data[0].name) || '');
  if (typeof window.posBrandLogo === 'function') window.posBrandLogo('');
  genLogoNota('Se quitó. Vuelven las iniciales.');
}

(function () {
  function enganchar() {
    var s = document.getElementById('gen-logo-subir');
    var q = document.getElementById('gen-logo-quitar');
    var f = document.getElementById('gen-logo-file');
    if (!s || !f) { setTimeout(enganchar, 500); return; }
    s.addEventListener('click', function () { f.click(); });
    f.addEventListener('change', function () { genSubirLogo(f); });
    if (q) q.addEventListener('click', genQuitarLogo);
    genCargarLogo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar);
  else enganchar();
})();

/* ══════════════════════════════════════════════════════════════════
   CONFIGURACION → DOMICILIOS

   Las empresas de domicilio externo de CADA restaurante.

   Hasta hoy el nombre de la empresa estaba escrito dentro del codigo:
   decia "(Rapid)", que es la que usa El Parche, y se le mostraba a
   todos los restaurantes del sistema —incluido uno que trabaje con otra
   empresa, o con ninguna.

   Es SOLO informativo: sirve para saber con quien salio cada domicilio.
   No toca precios, ni ventas, ni ningun calculo.
   ══════════════════════════════════════════════════════════════════ */
var DM = { empresas: [], porBorrar: null };

/* Nada de lo que escribe el usuario entra al HTML sin escapar: un
   nombre de empresa con un < o una comilla romperia la fila entera. */
function dmEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function dmTenant() {
  var t = window._pos && window._pos.state ? window._pos.state.tenantId : null;
  if (t) return t;
  var user = await cfgUsuario();
  return (user && user.user_metadata && user.user_metadata.tenant_id) || null;
}

async function dmInit() {
  var add = $('dm-agregar');
  if (add) add.onclick = dmAgregar;
  var inp = $('dm-nueva');
  if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); dmAgregar(); } };
  await dmCargar();
  await mpInit();
}

async function dmCargar() {
  var ten = await dmTenant();
  if (!ten) return;
  /* SIEMPRE filtrado por el restaurante. Una tabla de configuracion
     leida sin este filtro devuelve la fila de OTRO negocio. */
  var r = await sb.from('pos_domi_empresas')
    .select('id,nombre,telefono,activa')
    .eq('tenant_id', ten)
    .eq('activa', true)
    .order('nombre');
  if (r.error) { console.error('[domicilios]', r.error.message); return; }
  DM.empresas = r.data || [];
  dmPintar();
}

function dmPintar() {
  var cont = $('dm-lista'), vacio = $('dm-vacio');
  if (!cont) return;
  if (vacio) vacio.style.display = DM.empresas.length ? 'none' : '';
  cont.innerHTML = DM.empresas.map(function (e) {
    var esta = DM.porBorrar === e.id;
    return '<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid #ECEEF2;border-radius:10px;background:#fff">'
      + '<span style="width:8px;height:8px;border-radius:999px;background:#0EA5E9;flex-shrink:0"></span>'
      + '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:#0F172A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + dmEsc(e.nombre) + '</span>'
      + (e.telefono ? '<span style="font-size:12px;color:#64748B;white-space:nowrap">' + dmEsc(e.telefono) + '</span>' : '')
      + (esta
          ? '<span style="font-size:12px;color:#64748B;white-space:nowrap">&iquest;Quitar?</span>'
            + '<button class="lm-btn-ghost sm" data-dmno="1">No</button>'
            + '<button class="cf-btn-danger" data-dmsi="' + e.id + '" style="padding:6px 12px;font-size:11.5px">S&iacute;, quitar</button>'
          : '<button class="lm-btn-ghost sm" data-dmdel="' + e.id + '">Quitar</button>')
      + '</div>';
  }).join('');

  /* La confirmacion va en la misma fila, no en un cuadro del navegador:
     esos salen grises, con el dominio arriba, y no parecen del producto. */
  cont.querySelectorAll('[data-dmdel]').forEach(function (b) {
    b.onclick = function () { DM.porBorrar = b.dataset.dmdel; dmPintar(); };
  });
  cont.querySelectorAll('[data-dmno]').forEach(function (b) {
    b.onclick = function () { DM.porBorrar = null; dmPintar(); };
  });
  cont.querySelectorAll('[data-dmsi]').forEach(function (b) {
    b.onclick = function () { dmQuitar(b.dataset.dmsi); };
  });
}

async function dmAgregar() {
  var inp = $('dm-nueva'), tel = $('dm-nueva-tel');
  var nombre = (inp && inp.value || '').trim();
  if (!nombre) { if (inp) inp.focus(); return; }

  /* Que no entre dos veces la misma empresa con otra mayuscula. */
  var yaEsta = DM.empresas.some(function (e) {
    return (e.nombre || '').toLowerCase().trim() === nombre.toLowerCase();
  });
  if (yaEsta) { showToast('"' + nombre + '" ya está en la lista'); if (inp) inp.select(); return; }

  var ten = await dmTenant();
  if (!ten) { showToast('No se pudo identificar el restaurante'); return; }
  var r = await sb.from('pos_domi_empresas')
    .insert({ tenant_id: ten, nombre: nombre, telefono: (tel && tel.value || '').trim() || null })
    .select().single();
  if (r.error) { showToast('No se pudo guardar: ' + r.error.message); return; }
  if (inp) inp.value = '';
  if (tel) tel.value = '';
  DM.empresas.push(r.data);
  DM.empresas.sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
  dmPintar();
  showToast(nombre + ' agregada');
}

async function dmQuitar(id) {
  /* NO se borra la fila: se marca inactiva. Los pedidos viejos apuntan a
     ella, y borrarla dejaria el historial diciendo con quien NO se sabe
     que salio el domicilio. Deja de aparecer para escoger, y ya. */
  var r = await sb.from('pos_domi_empresas').update({ activa: false }).eq('id', id);
  if (r.error) { showToast('No se pudo quitar: ' + r.error.message); return; }
  DM.porBorrar = null;
  DM.empresas = DM.empresas.filter(function (e) { return e.id !== id; });
  dmPintar();
  showToast('Empresa quitada');
}

/* Para las demas pantallas: la lista de empresas activas del restaurante. */
window.posDomiEmpresas = async function () {
  var ten = await dmTenant();
  if (!ten) return [];
  var r = await sb.from('pos_domi_empresas')
    .select('id,nombre').eq('tenant_id', ten).eq('activa', true).order('nombre');
  return (r && r.data) || [];
};

/* ══════════════════════════════════════════════════════════════════
   MAPAS — la cuenta de Google de cada restaurante  (21-ago-2026)

   La llave NO se guarda desde aqui ni se lee desde aqui: todo pasa por
   la funcion `mapa` del servidor, que la cifra y nunca la devuelve. Lo
   unico que ve esta pantalla son los ultimos 4 caracteres, para que el
   dueno reconozca cual puso.

   Por que tanto cuidado: la llave es de SU cuenta y de SU tarjeta. Si
   baja al navegador, cualquiera que abra esta pantalla puede sacarla y
   gastarle el cupo, y el cobro le llega a el.
   ══════════════════════════════════════════════════════════════════ */
var MP = { estado: null };

async function mpLlamar(cuerpo) {
  var ses = await sb.auth.getSession();
  var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
  if (!tok) throw new Error('Tu sesión se venció. Vuelve a entrar.');
  var r = await fetch(SB_URL + '/functions/v1/mapa', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  return await r.json();
}

async function mpInit() {
  var ver = $('mp-ver-pasos');
  if (ver) ver.onclick = function () {
    var c = $('mp-pasos');
    if (!c) return;
    var abierto = c.style.display !== 'none';
    c.style.display = abierto ? 'none' : '';
    ver.lastChild.nodeValue = abierto
      ? ' Ver el paso a paso para conectarla'
      : ' Ocultar el paso a paso';
  };

  var btn = $('mp-conectar');
  if (btn) btn.onclick = mpConectar;
  var inp = $('mp-clave');
  if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); mpConectar(); } };

  var mia = $('mp-usar-mia');
  if (mia) mia.onclick = function () {
    var caja = $('mp-incluido'), sin = $('mp-sin');
    if (caja) caja.style.display = 'none';
    if (sin) sin.style.display = '';
  };

  var des = $('mp-desconectar');
  if (des) des.onclick = mpDesconectar;

  var tope = $('mp-tope');
  if (tope) tope.onchange = mpGuardarTope;

  await mpCargar();
}

async function mpCargar() {
  try {
    var e = await mpLlamar({ accion: 'estado' });
    MP.estado = e;
    mpPintar(e);
  } catch (err) { console.warn('[mapas]', err.message); }
}

function mpPintar(e) {
  var sin = $('mp-sin'), con = $('mp-con'), chip = $('mp-estado');
  var propia = !!(e && e.activo);        // conecto SU cuenta
  var incluido = !!(e && e.incluido);    // el mapa viene con el plan

  /* SI EL MAPA YA LE FUNCIONA, NO SE LE PIDE NADA.
     Decirle 'sin conectar' a alguien que ya tiene mapas es mandarlo a
     hacer un tramite de 20 minutos que no necesita. Solo el que quiera
     pasar el gasto a su propia cuenta abre el paso a paso. */
  if (sin) sin.style.display = (propia || incluido) ? 'none' : '';
  if (con) con.style.display = propia ? '' : 'none';

  var extra = $('mp-incluido');
  if (extra) extra.style.display = (incluido && !propia) ? '' : 'none';

  if (chip) {
    chip.textContent = propia ? 'Tu cuenta' : (incluido ? 'Incluido en tu plan' : 'Sin conectar');
    chip.className = 'op-state ' + ((propia || incluido) ? 'on' : 'off');
  }
  if (!propia) return;

  if ($('mp-pista')) $('mp-pista').textContent = e.pista || '';
  if ($('mp-tope')) $('mp-tope').value = e.tope || 9000;

  var usado = (e.geocoding || 0) + (e.estatico || 0);
  var tope = e.tope || 9000;
  var pct = Math.min(100, Math.round(usado * 100 / Math.max(1, tope)));

  if ($('mp-uso-txt')) $('mp-uso-txt').textContent = usado + ' de ' + tope;
  var barra = $('mp-barra');
  if (barra) {
    barra.style.width = pct + '%';
    /* Verde tranquilo, amarillo al 75%, rojo al 90%: el dueno tiene que
       poder ver de un vistazo si se va a quedar sin mapa a mitad de mes. */
    barra.style.background = pct >= 90 ? '#DC2626' : (pct >= 75 ? '#F59E0B' : '#16A34A');
  }
  if ($('mp-uso-detalle')) {
    $('mp-uso-detalle').innerHTML = 'Direcciones consultadas: <b>' + (e.geocoding || 0)
      + '</b> &middot; Mapas dibujados: <b>' + (e.estatico || 0) + '</b>'
      + '<br>Google te regala ' + (e.gratis_google || 10000).toLocaleString('es-CO')
      + ' de cada uno al mes.';
  }

  var aviso = $('mp-aviso-tope');
  if (aviso) {
    if (pct >= 90) {
      aviso.style.display = '';
      aviso.innerHTML = pct >= 100
        ? '<b>Llegaste al tope.</b> El mapa deja de cargar hasta el mes entrante. Si necesitas más, sube el número de abajo — pero revisa primero cuánto te está cobrando Google.'
        : '<b>Ya vas en el ' + pct + '% del tope.</b> Cuando llegue al 100%, el mapa deja de cargar hasta el mes entrante.';
    } else { aviso.style.display = 'none'; }
  }

  if (e.error && $('mp-error')) {
    $('mp-error').style.display = '';
    $('mp-error').textContent = 'Último aviso de Google: ' + e.error;
  }
}

async function mpConectar() {
  var inp = $('mp-clave'), btn = $('mp-conectar'), err = $('mp-error');
  var clave = (inp && inp.value || '').trim();
  if (err) err.style.display = 'none';
  if (!clave) { if (inp) inp.focus(); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Probando…'; }
  try {
    var r = await mpLlamar({ accion: 'guardar', clave: clave });
    if (r && r.error) {
      if (err) { err.style.display = ''; err.textContent = r.error; }
      return;
    }
    if (inp) inp.value = '';
    showToast('Tu cuenta de Google quedó conectada');
    await mpCargar();
  } catch (e) {
    if (err) { err.style.display = ''; err.textContent = e.message; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Conectar'; }
  }
}

async function mpDesconectar() {
  var btn = $('mp-desconectar');
  /* Dos toques, no un cuadro de dialogo del navegador. */
  if (btn && btn.dataset.seguro !== '1') {
    btn.dataset.seguro = '1';
    btn.textContent = '¿Seguro? Toca otra vez para desconectar';
    setTimeout(function () {
      if (btn.dataset.seguro === '1') {
        btn.dataset.seguro = '';
        btn.textContent = 'Desconectar mi cuenta de Google';
      }
    }, 4000);
    return;
  }
  if (btn) { btn.dataset.seguro = ''; btn.textContent = 'Desconectando…'; }
  try {
    await mpLlamar({ accion: 'desconectar' });
    showToast('Cuenta de Google desconectada');
    await mpCargar();
  } catch (e) { showToast('No se pudo desconectar'); }
  finally { if (btn) btn.textContent = 'Desconectar mi cuenta de Google'; }
}

async function mpGuardarTope() {
  var inp = $('mp-tope');
  var v = Math.max(100, Math.min(10000, Number(inp && inp.value) || 9000));
  if (inp) inp.value = v;
  var ten = await dmTenant();
  if (!ten) return;
  /* El tope SI se puede escribir desde aqui: es un numero del dueno, no
     un secreto. La llave no: esa solo la toca el servidor. */
  var r = await sb.rpc('fn_mapas_tope', { p_tenant: ten, p_tope: v });
  if (r && r.error) { showToast('No se pudo guardar el tope'); return; }
  showToast('Se frenará al llegar a ' + v.toLocaleString('es-CO'));
  await mpCargar();
}
