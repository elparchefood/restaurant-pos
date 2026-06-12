/* ============================================================
   LUMEN POS · TABLET MESERO — Lógica de login
   - Autentica con Supabase Auth (email + password)
   - Lee perfil del usuario → detecta rol
   - Redirige según rol:
       mesero   → ventas.html
       cajera   → (futuro) cajera.html
       admin    → (futuro) dashboard.html
       cocina   → (futuro) cocina.html
   ============================================================ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

// Rutas por rol — ajustar cuando existan las demás páginas
const ROLE_ROUTES = {
  mesero:  'ventas.html',
  cajera:  'ventas.html',   // temporal hasta que exista cajera.html
  admin:   'ventas.html',   // temporal hasta que exista dashboard.html
  cocina:  'ventas.html',   // temporal hasta que exista cocina.html
};

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Refs DOM ──────────────────────────────────────────────
const emailInput  = document.getElementById('login-email');
const passInput   = document.getElementById('login-pass');
const eyeBtn      = document.getElementById('login-eye');
const loginBtn    = document.getElementById('login-btn');
const btnText     = document.getElementById('btn-text');
const btnSpinner  = document.getElementById('btn-spinner');
const errorBanner = document.getElementById('login-error');

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
        .select('role, branch_id, tenant_id, full_name')
        .eq('auth_id', userId)
        .maybeSingle();

    if (profileError || !profile) {
      showError('No se encontró un perfil activo para este usuario. Contacta al administrador.');
      await sb.auth.signOut();
      return;
    }

    const role = (profile.role || '').toLowerCase();
    const route = ROLE_ROUTES[role];

    if (!route) {
      showError(`El rol "${profile.role}" no tiene una pantalla asignada en esta app.`);
      await sb.auth.signOut();
      return;
    }

    // 3. Guardar contexto mínimo para las demás páginas
    try {
      sessionStorage.setItem('lumen_role',      role);
      sessionStorage.setItem('lumen_branch_id', profile.branch_id  || '');
      sessionStorage.setItem('lumen_tenant_id', profile.tenant_id  || '');
      sessionStorage.setItem('lumen_name',      profile.full_name  || email);
    } catch (_) { /* sessionStorage bloqueado — no crítico */ }

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
