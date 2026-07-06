/* ============================================================
   LUMEN POS · TABLET MESERO — Lógica de turno
   Flujo:
     1. Verifica sesión activa en Supabase
     2. Carga perfil del mesero desde pos_users
     3. Busca turno activo en pos_shifts
     4. Si tiene turno → muestra info + botón "Ir a mesas" + "Cerrar turno"
     5. Si no tiene → muestra botón "Iniciar turno"
   ============================================================ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window._posSB = sb; // para posSync cuando no hay pos-core.js

// ── Refs DOM ─────────────────────────────────────────────
const avatarEl       = document.getElementById('turno-avatar');
const nombreEl       = document.getElementById('turno-nombre');
const rolEl          = document.getElementById('turno-rol');
const activoInfo     = document.getElementById('turno-activo-info');
const activoHora     = document.getElementById('turno-activo-hora');
const activoDuracion = document.getElementById('turno-activo-duracion');
const btnPrimary     = document.getElementById('turno-btn-primary');
const btnPrimaryText = document.getElementById('turno-btn-primary-text');
const btnPrimarySpinner = document.getElementById('turno-btn-primary-spinner');
const btnCerrar      = document.getElementById('turno-btn-cerrar');
const btnLogout      = document.getElementById('turno-logout');
const timeEl         = document.getElementById('turno-time');
const toast          = document.getElementById('turno-toast');

// ── Estado ───────────────────────────────────────────────
let perfil       = null;
let turnoActivo  = null;
let tickInterval = null;

// ── Reloj en tiempo real ─────────────────────────────────
function tickReloj() {
  const now = new Date();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  if (timeEl) timeEl.textContent = `${h}:${m}`;
}
tickReloj();
setInterval(tickReloj, 10000);

// ── Formatear hora de inicio ─────────────────────────────
function formatHora(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDuracion(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (diff < 60) return `Llevas ${diff} minuto${diff !== 1 ? 's' : ''} en turno`;
  const horas = Math.floor(diff / 60);
  const mins  = diff % 60;
  return `Llevas ${horas}h ${mins}min en turno`;
}

// ── Inicialización ────────────────────────────────────────
async function init() {
  // 1. Verificar sesión
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'mesero-login.html';
    return;
  }

  const userId = session.user.id;

  // 2. Cargar perfil
  const { data: profile, error: profileErr } = await sb
    .from('pos_users')
    .select('id, name, role, branch_id, tenant_id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (profileErr || !profile) {
    showToast('No se encontró tu perfil. Contacta al admin.');
    return;
  }

  perfil = profile;

  // Renderizar nombre y avatar
  const nombre = profile.name || 'Mesero';
  const inicial = nombre.trim().charAt(0).toUpperCase();
  avatarEl.textContent = inicial;
  nombreEl.textContent = nombre;
  rolEl.textContent    = capitalizar(profile.role || 'mesero');

  // 3. Buscar turno activo
  const { data: turno } = await sb
    .from('pos_shifts')
    .select('id, started_at')
    .eq('waiter_id', profile.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (turno) {
    turnoActivo = turno;
    mostrarTurnoActivo(turno);
  } else {
    mostrarSinTurno();
  }
}

// ── UI: tiene turno activo ────────────────────────────────
function mostrarTurnoActivo(turno) {
  activoInfo.classList.add('show');
  activoHora.textContent = `Turno iniciado a las ${formatHora(turno.started_at)}`;
  activoDuracion.textContent = formatDuracion(turno.started_at);

  // Actualizar duración cada minuto
  tickInterval = setInterval(() => {
    activoDuracion.textContent = formatDuracion(turno.started_at);
  }, 60000);

  btnPrimaryText.textContent = 'Ir a las mesas';
  btnPrimary.onclick = () => { window.location.href = 'ventas.html'; };

  btnCerrar.classList.add('show');
  btnCerrar.onclick = cerrarTurno;
}

// ── UI: sin turno ─────────────────────────────────────────
function mostrarSinTurno() {
  activoInfo.classList.remove('show');
  btnCerrar.classList.remove('show');
  btnPrimaryText.textContent = 'Iniciar turno';
  btnPrimary.onclick = iniciarTurno;
}

// ── Acción: iniciar turno ─────────────────────────────────
async function iniciarTurno() {
  setLoadingPrimary(true);
  try {
    const shiftData = {
      waiter_id:  perfil.id,
      branch_id:  perfil.branch_id,
      tenant_id:  perfil.tenant_id,
      status:     'active',
      started_at: new Date().toISOString(),
    };

    const syncResult = window.posSync
      ? await posSync.write('pos_shifts', 'insert', shiftData)
      : await (async () => {
          const r = await sb.from('pos_shifts').insert(shiftData).select('id, started_at').single();
          return { ok: !r.error, data: r.data };
        })();

    if (!syncResult.ok) { showToast('Error al iniciar turno'); setLoadingPrimary(false); return; }

    if (syncResult.offline) {
      // Offline: crear turno provisional para la UI
      turnoActivo = { id: posSync.makeTempId(), started_at: shiftData.started_at };
    } else {
      turnoActivo = Array.isArray(syncResult.data) ? syncResult.data[0] : syncResult.data;
    }
    mostrarTurnoActivo(turnoActivo);
    showToast(syncResult.offline ? '¡Turno iniciado! (se sincronizará al reconectar)' : '¡Turno iniciado!');
  } catch (e) {
    console.error('[turno] Error al iniciar:', e);
    showToast('No se pudo iniciar el turno. Intenta de nuevo.');
  } finally {
    setLoadingPrimary(false);
  }
}

// ── Acción: cerrar turno ──────────────────────────────────
async function cerrarTurno() {
  if (!turnoActivo) return;

  const confirma = confirm('¿Seguro que quieres cerrar tu turno?');
  if (!confirma) return;

  btnCerrar.disabled = true;
  try {
    const syncResult = window.posSync
      ? await posSync.write('pos_shifts', 'update', { status: 'closed', ended_at: new Date().toISOString() }, { id: turnoActivo.id })
      : await (async () => {
          const r = await sb.from('pos_shifts').update({ status: 'closed', ended_at: new Date().toISOString() }).eq('id', turnoActivo.id);
          return { ok: !r.error };
        })();

    if (!syncResult.ok) throw new Error('sync failed');

    clearInterval(tickInterval);
    turnoActivo = null;
    mostrarSinTurno();
    showToast('Turno cerrado. ¡Hasta luego!');
  } catch (e) {
    console.error('[turno] Error al cerrar:', e);
    showToast('No se pudo cerrar el turno. Intenta de nuevo.');
    btnCerrar.disabled = false;
  }
}

// ── Logout ────────────────────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = 'mesero-login.html';
});

// ── Helpers ───────────────────────────────────────────────
function setLoadingPrimary(on) {
  btnPrimary.disabled = on;
  btnPrimarySpinner.classList.toggle('show', on);
  if (on) btnPrimaryText.textContent = 'Un momento…';
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Arrancar ──────────────────────────────────────────────
init();
