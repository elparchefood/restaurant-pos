/* ============================================================
   LUMEN POS · TABLET MESERO — Lógica de login
   - Autentica con Supabase Auth (email + password)
   - Lee perfil del usuario → detecta rol
   - Redirige según la CLAVE INTERNA del rol (no su nombre, que el dueño
     del restaurante puede cambiar cuando quiera)
   ============================================================ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

/* RUTAS POR LA CLAVE INTERNA DEL ROL, NO POR SU NOMBRE (21-ago-2026).

   Esta tabla estaba escrita con los nombres 'mesero', 'cajera', 'admin' y
   'cocina'. Pero los roles que Cobra le siembra a cada restaurante se
   llaman Cajero, Cocinero y Domiciliario: ninguno de esos tres coincidia,
   asi que a esas personas la app les respondia "tu rol no tiene una
   pantalla asignada" y las sacaba. Nunca pudieron entrar.

   Ahora se enruta por la clave interna, que no cambia aunque el dueNo
   renombre el rol. */
const ROLE_ROUTES = {
  mesero: 'mesero-turno.html',
  cajero: 'mesero-turno.html',   // hasta que exista su propia pantalla
  admin:  'mesero-turno.html',
  cocina: 'mesero-turno.html',
};

/* Nombre viejo guardado en la cuenta → clave interna. Las cuentas que ya
   existen tienen escrito el nombre en minusculas ('gerente', 'cajera'). */
const ALIAS_ROL = {
  admin:'admin', administrador:'admin', gerente:'admin', propietario:'admin',
  cajero:'cajero', cajera:'cajero', caja:'cajero',
  mesero:'mesero', mesera:'mesero',
  cocina:'cocina', cocinero:'cocina', cocinera:'cocina', chef:'cocina',
  domiciliario:'domiciliario', domiciliaria:'domiciliario',
  repartidor:'domiciliario', repartidora:'domiciliario'
};

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
    storageKey: 'cobra-pos-session'
  }
});

// ── Refs DOM ──────────────────────────────────────────────
const emailInput  = document.getElementById('login-email');
const passInput   = document.getElementById('login-pass');
const eyeBtn      = document.getElementById('login-eye');
const loginBtn    = document.getElementById('login-btn');
const btnText     = document.getElementById('btn-text');
const btnSpinner  = document.getElementById('btn-spinner');
const errorBanner = document.getElementById('login-error');


// ── Guard: si ya hay sesión activa, saltar el login ──────
(async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) window.location.href = 'mesero-turno.html';
})();

// ── Toggle ver/ocultar contraseña ─────────────────────────
eyeBtn.addEventListener('click', () => {
  const isPass = passInput.type === 'password';
  passInput.type = isPass ? 'text' : 'password';
  eyeBtn.innerHTML = isPass ? SVG_EYE_OFF : SVG_EYE;
});

// ── Permitir Enter para enviar ─────────────────────────────
[emailInput, passInput].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
});

// ── Login principal ────────────────────────────────────────
loginBtn.addEventListener('click', handleLogin);

async function handleLogin() {
  clearError();

  const email    = emailInput.value.trim();
  const password = passInput.value;

  if (!email || !password) {
    showError('Completa el correo y la contraseña.');
    if (!email) emailInput.classList.add('err');
    if (!password) passInput.classList.add('err');
    return;
  }

  setLoading(true);

  try {
    // 1. Autenticar
    const { data: authData, error: authError } =
      await sb.auth.signInWithPassword({ email, password });

    if (authError) {
      showError(friendlyError(authError.message));
      return;
    }

    const userId = authData.user.id;

    // 2. Leer perfil para obtener rol
    const { data: profile, error: profileError } =
      await sb.from('pos_users')
        .select('role, branch_id, tenant_id, name, role_id, pos_roles(clave,name)')
        .eq('auth_user_id', userId)
        .maybeSingle();

    if (profileError || !profile) {
      showError('No se encontró un perfil activo para este usuario. Contacta al administrador.');
      await sb.auth.signOut();
      return;
    }

    /* La clave sale del rol ASIGNADO (pos_roles.clave). Si esa cuenta
       todavia no tiene rol asignado, se traduce el texto viejo. */
    const rolAsignado = profile.pos_roles || null;
    const nombreRol   = (rolAsignado && rolAsignado.name) || profile.role || '';
    const clave = (rolAsignado && rolAsignado.clave) ||
                  ALIAS_ROL[(profile.role || '').toLowerCase().trim()] || '';
    const route = ROLE_ROUTES[clave];

    if (!route) {
      /* El domiciliario tiene SU PROPIA app: no se le deja entrar aqui por
         error, se le dice cual abrir. */
      showError(clave === 'domiciliario'
        ? 'Esta app es para el personal del salon. Como domiciliario, entra por la app de domicilios con estas mismas credenciales.'
        : `El rol "${nombreRol}" todavia no tiene una pantalla en esta app.`);
      await sb.auth.signOut();
      return;
    }

    // 3. Escribir branch_id y tenant_id en user_metadata para que pos-core.js los encuentre
    await sb.auth.updateUser({
      data: {
        tenant_id: profile.tenant_id || null,
        branch_id: profile.branch_id || null,
        role:      clave,          // la clave: no cambia si renombran el rol
        role_nombre: nombreRol,    // el nombre visible, solo para mostrar
        name:      profile.name || email,
      }
    });

    // 4. Redirigir
    window.location.href = route;

  } catch (err) {
    showError('Error inesperado. Intenta de nuevo.');
    console.error('[login]', err);
  } finally {
    setLoading(false);
  }
}

// ── Helpers UI ────────────────────────────────────────────
function setLoading(on) {
  loginBtn.disabled  = on;
  btnText.textContent = on ? 'Ingresando…' : 'Ingresar';
  btnSpinner.classList.toggle('show', on);
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
}

function clearError() {
  errorBanner.classList.remove('show');
  errorBanner.textContent = '';
  emailInput.classList.remove('err');
  passInput.classList.remove('err');
}

function friendlyError(msg) {
  if (!msg) return 'Error desconocido.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed'))
    return 'El correo no ha sido confirmado. Contacta al administrador.';
  if (m.includes('too many requests'))
    return 'Demasiados intentos. Espera unos minutos.';
  return 'No se pudo iniciar sesión. Verifica tus datos.';
}

// ── SVGs ──────────────────────────────────────────────────
const SVG_EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

const SVG_EYE_OFF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
    a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4
    c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07
    a3 3 0 1 1-4.24-4.24"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

// Insertar SVG inicial del ojo
eyeBtn.innerHTML = SVG_EYE;
