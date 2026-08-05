/* reservas.js — Módulo de reservas · Cobra POS */
/* REGLA: todo dato viene de Supabase. Nada hardcodeado. */
/* TABLA REQUERIDA: pos_reservations (ver schema al final del archivo) */

// ── Estado ────────────────────────────────────────────────────────────────
let RV = {
  tenantId: null,
  branchId: null,
  selectedDate: new Date().toISOString().split('T')[0],
  reservations: [],
  tables: [],
  realtimeSub: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tom = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  if (iso === todayStr) return 'Hoy · ' + d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
  if (iso === tom)      return 'Mañana · ' + d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
  return d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function fmtTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':');
  const hh = parseInt(h);
  return hh < 12 ? `${hh === 0 ? 12 : hh}:${m} am` :
         hh === 12 ? `12:${m} pm` :
         `${hh - 12}:${m} pm`;
}

const STATUS_META = {
  pendiente:  { label: 'Pendiente',  cls: 'pendiente',  badgeCls: 'badge--pendiente' },
  confirmada: { label: 'Confirmada', cls: 'confirmada', badgeCls: 'badge--confirmada' },
  llego:      { label: 'Llegó',      cls: 'llego',      badgeCls: 'badge--llego' },
  cancelada:  { label: 'Cancelada',  cls: 'cancelada',  badgeCls: 'badge--cancelada' },
  no_show:    { label: 'No show',    cls: 'no_show',    badgeCls: 'badge--no_show' },
};

// ── Boot ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const user = session.user;
  RV.tenantId = user.user_metadata?.tenant_id || null;
  RV.branchId = user.user_metadata?.branch_id  || null;

  // Branch name
  if (RV.branchId) {
    const { data: br } = await sb.from('branches').select('name').eq('id', RV.branchId).maybeSingle();
    if (br) document.getElementById('sb-brand').textContent = br.name;
  }

  document.getElementById('sb-status').textContent = 'en línea';
  document.getElementById('sb-status').style.color = '#16A34A';
  document.getElementById('sb-user').textContent = user.email || '—';

  // Load mesas for selector
  await loadTables();

  // Render date
  updateDateLabel();
  await loadReservations();
  subscribeRealtime();

  let authInitialized = false;
  sb.auth.onAuthStateChange((event) => {
    if (!authInitialized) { authInitialized = true; return; }
    if (event === 'SIGNED_OUT') window.location.href = 'login.html';
  });
});

// ── Date navigation ───────────────────────────────────────────────────────
function updateDateLabel() {
  document.getElementById('rv-date-label').textContent = fmtDate(RV.selectedDate);
}

window.changeDate = (delta) => {
  const d = new Date(RV.selectedDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  RV.selectedDate = d.toISOString().split('T')[0];
  updateDateLabel();
  loadReservations();
};

// ── Fetch tables ──────────────────────────────────────────────────────────
async function loadTables() {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;
  let q = sb.from('pos_tables').select('id, name').order('sort_order');
  if (RV.branchId) q = q.eq('branch_id', RV.branchId);
  const { data } = await q;
  RV.tables = data || [];

  // Populate modal select
  const sel = document.getElementById('f-table');
  if (sel) {
    RV.tables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = 'Mesa ' + t.name;
      sel.appendChild(opt);
    });
  }
}

// ── Fetch reservations ────────────────────────────────────────────────────
async function loadReservations() {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;

  const dateFrom = RV.selectedDate + 'T00:00:00';
  const dateTo   = RV.selectedDate + 'T23:59:59';

  let q = sb
    .from('pos_reservations')
    .select('*')
    .gte('reserved_at', dateFrom)
    .lte('reserved_at', dateTo)
    .order('reserved_at', { ascending: true });

  if (RV.branchId) q = q.eq('branch_id', RV.branchId);
  if (RV.tenantId) q = q.eq('tenant_id', RV.tenantId);

  const { data, error } = await q;

  if (error) {
    if (error.code === '42P01') {
      // Table doesn't exist yet — show setup message
      renderSetupNeeded();
    } else {
      console.error('[Reservas] fetch error', error);
    }
    return;
  }

  RV.reservations = data || [];
  renderList();
}

// ── Render: list ─────────────────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('rv-list');
  if (!container) return;

  updateCounters();

  const list = RV.reservations;
  if (list.length === 0) {
    container.innerHTML = `
      <div class="rv-empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <div class="rv-empty-title">Sin reservas para este día</div>
        <div class="rv-empty-sub">Agrega la primera reserva del día usando el botón "Nueva reserva"</div>
        <button class="rv-empty-btn" onclick="openNewModal()">+ Nueva reserva</button>
      </div>`;
    return;
  }

  // Group by time slots
  const grouped = {};
  list.forEach(r => {
    const h = r.reserved_at ? new Date(r.reserved_at).getHours() : 0;
    const slot = h < 12 ? 'Mañana' : h < 16 ? 'Mediodía' : h < 20 ? 'Tarde' : 'Noche';
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot].push(r);
  });

  container.innerHTML = Object.entries(grouped).map(([slot, items]) => `
    <div class="rv-section-label">${slot}</div>
    ${items.map(r => renderCard(r)).join('')}
  `).join('');
}

function renderCard(r) {
  const meta = STATUS_META[r.status] || STATUS_META.pendiente;
  const time = r.reserved_at ? fmtTime(new Date(r.reserved_at).toTimeString().slice(0,5)) : '—';
  const table = RV.tables.find(t => t.id === r.table_id);

  const actions = actionsFor(r);

  return `
    <div class="rv-card rv-card--${meta.cls}" data-id="${r.id}">
      <div class="rv-card-time">
        <div class="rv-time-val">${time.split(' ')[0]}</div>
        <div class="rv-time-lbl">${time.split(' ')[1] || ''}</div>
      </div>
      <div class="rv-card-body">
        <div class="rv-card-name">${r.customer_name || '—'}</div>
        <div class="rv-card-meta">
          <span class="rv-meta-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
            ${r.party_size || 1} persona${(r.party_size || 1) !== 1 ? 's' : ''}
          </span>
          ${r.customer_phone ? `<span class="rv-meta-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.35 2 2 0 0 1 3.57 2H6.5a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91A16 16 0 0 0 14.09 16l.38-.38a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17.92l.92-1z"/></svg>
            ${r.customer_phone}
          </span>` : ''}
          ${table ? `<span class="rv-meta-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            Mesa ${table.name}
          </span>` : ''}
          ${r.created_by ? `<span class="rv-meta-item" style="color:#94A3B8">por ${r.created_by}</span>` : ''}
        </div>
        ${r.notes ? `<div class="rv-card-note">${r.notes}</div>` : ''}
      </div>
      <div class="rv-card-actions">
        <span class="rv-status-badge ${meta.badgeCls}">${meta.label}</span>
        <div class="rv-action-row">
          ${actions}
          <button class="rv-action-btn" onclick="editReservation('${r.id}')">Editar</button>
        </div>
      </div>
    </div>`;
}

function actionsFor(r) {
  const s = r.status;
  const id = r.id;
  let btns = '';
  if (s === 'pendiente') {
    btns += `<button class="rv-action-btn rv-action-btn--confirm" onclick="changeStatus('${id}','confirmada')">Confirmar</button>`;
  }
  if (s === 'pendiente' || s === 'confirmada') {
    btns += `<button class="rv-action-btn rv-action-btn--arrive" onclick="changeStatus('${id}','llego')">Llegó</button>`;
    btns += `<button class="rv-action-btn rv-action-btn--cancel" onclick="changeStatus('${id}','cancelada')">Cancelar</button>`;
  }
  if (s === 'confirmada') {
    btns += `<button class="rv-action-btn rv-action-btn--cancel" onclick="changeStatus('${id}','no_show')">No show</button>`;
  }
  return btns;
}

function updateCounters() {
  const by = {};
  RV.reservations.forEach(r => { by[r.status] = (by[r.status] || 0) + 1; });
  ['pendiente','confirmada','llego','cancelada','noshow'].forEach(k => {
    const el = document.getElementById('cnt-' + k);
    if (el) el.textContent = by[k === 'noshow' ? 'no_show' : k] || 0;
  });
}

// ── Cambio de estado ──────────────────────────────────────────────────────
window.changeStatus = async (id, newStatus) => {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;
  const { error } = await sb
    .from('pos_reservations')
    .update({ status: newStatus })
    .eq('id', id);
  if (error) { alert('Error al actualizar: ' + error.message); return; }
  await loadReservations();
};

// ── Modal: nueva / editar ─────────────────────────────────────────────────
window.openNewModal = () => {
  document.getElementById('edit-id').value = '';
  document.getElementById('modal-title').textContent = 'Nueva reserva';
  document.getElementById('btn-save-lbl').textContent = 'Guardar reserva';
  document.getElementById('f-name').value = '';
  document.getElementById('f-phone').value = '';
  document.getElementById('f-date').value = RV.selectedDate;
  document.getElementById('f-time').value = '19:00';
  document.getElementById('f-guests').value = '2';
  document.getElementById('f-table').value = '';
  document.getElementById('f-notes').value = '';
  document.getElementById('rv-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('f-name').focus(), 100);
};

window.editReservation = (id) => {
  const r = RV.reservations.find(x => x.id === id);
  if (!r) return;
  document.getElementById('edit-id').value = r.id;
  document.getElementById('modal-title').textContent = 'Editar reserva';
  document.getElementById('btn-save-lbl').textContent = 'Guardar cambios';
  document.getElementById('f-name').value = r.customer_name || '';
  document.getElementById('f-phone').value = r.customer_phone || '';
  document.getElementById('f-date').value = r.reserved_at ? r.reserved_at.split('T')[0] : RV.selectedDate;
  document.getElementById('f-time').value = r.reserved_at ? new Date(r.reserved_at).toTimeString().slice(0,5) : '19:00';
  document.getElementById('f-guests').value = r.party_size || 2;
  document.getElementById('f-table').value = r.table_id || '';
  document.getElementById('f-notes').value = r.notes || '';
  document.getElementById('rv-overlay').style.display = 'flex';
};

window.closeModal = (e) => {
  if (e && e.target !== document.getElementById('rv-overlay')) return;
  document.getElementById('rv-overlay').style.display = 'none';
};

window.saveReservation = async () => {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;

  const name   = document.getElementById('f-name').value.trim();
  const date   = document.getElementById('f-date').value;
  const time   = document.getElementById('f-time').value;
  const guests = parseInt(document.getElementById('f-guests').value) || 1;

  if (!name) { document.getElementById('f-name').focus(); return; }
  if (!date || !time) { alert('Por favor completa fecha y hora.'); return; }

  const btn = document.querySelector('.rv-btn-save');
  btn.disabled = true;

  const reservedAt = new Date(date + 'T' + time + ':00').toISOString();
  const editId = document.getElementById('edit-id').value;

  const payload = {
    customer_name:  name,
    customer_phone: document.getElementById('f-phone').value.trim() || null,
    reserved_at:    reservedAt,
    party_size:     guests,
    table_id:       document.getElementById('f-table').value || null,
    notes:          document.getElementById('f-notes').value.trim() || null,
    tenant_id:      RV.tenantId,
    branch_id:      RV.branchId,
  };

  let error;
  if (editId) {
    ({ error } = await sb.from('pos_reservations').update(payload).eq('id', editId));
  } else {
    payload.status = 'pendiente';
    ({ error } = await sb.from('pos_reservations').insert(payload));
  }

  btn.disabled = false;
  if (error) { alert('Error al guardar: ' + error.message); return; }

  document.getElementById('rv-overlay').style.display = 'none';

  // If date changed, navigate to it
  const newDate = date;
  if (newDate !== RV.selectedDate) {
    RV.selectedDate = newDate;
    updateDateLabel();
  }
  await loadReservations();
};

// ── Realtime ──────────────────────────────────────────────────────────────
function subscribeRealtime() {
  const sb = window._pos && window._pos.sb;
  if (!sb) return;
  if (RV.realtimeSub) { try { sb.removeChannel(RV.realtimeSub); } catch(e) {} }

  RV.realtimeSub = sb.channel('reservas-rt')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'pos_reservations',
      filter: RV.branchId ? `branch_id=eq.${RV.branchId}` : undefined,
    }, () => loadReservations())
    .subscribe();
}

// ── Setup needed message ───────────────────────────────────────────────────
function renderSetupNeeded() {
  const container = document.getElementById('rv-list');
  if (!container) return;
  container.innerHTML = `
    <div class="rv-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <div class="rv-empty-title">Módulo de reservas listo</div>
      <div class="rv-empty-sub" style="max-width:380px">
        Para activar las reservas se necesita crear la tabla <code>pos_reservations</code> en Supabase.
        Avisa a soporte o al administrador del sistema para configurarla.
      </div>
    </div>`;
}

/*
 * ── SCHEMA SQL requerido en Supabase ─────────────────────────────────────
 *
 * CREATE TABLE pos_reservations (
 *   id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   tenant_id      uuid,
 *   branch_id      uuid,
 *   customer_name  text NOT NULL,
 *   customer_phone text,
 *   party_size     int NOT NULL DEFAULT 2,
 *   reserved_at    timestamptz NOT NULL,
 *   table_id       uuid REFERENCES pos_tables(id) ON DELETE SET NULL,
 *   notes          text,
 *   status         text NOT NULL DEFAULT 'pendiente'
 *                  CHECK (status IN ('pendiente','confirmada','llego','cancelada','no_show')),
 *   created_by     text,
 *   created_at     timestamptz DEFAULT now()
 * );
 *
 * CREATE INDEX ON pos_reservations (branch_id, reserved_at);
 * ALTER TABLE pos_reservations ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "branch_access" ON pos_reservations
 *   USING (branch_id = (auth.jwt()->'user_metadata'->>'branch_id')::uuid);
 */
