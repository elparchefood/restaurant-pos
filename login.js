// ── Estado ─────────────────────────────────────────────────────────────
var MODE        = 'login';
var REMEMBER    = true;
var AGREE       = false;
var PASS_SHOW   = false;
var SUBMITTING  = false;

// ── Boot ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  initMockCard();
  checkExistingSession();
  bindForm();
  bindEmail();
});

// ── Sesión activa ─────────────────────────────────────────────────────────
async function checkExistingSession() {
  try {
    var res = await sb.auth.getSession();
    if (res.data && res.data.session) {
      window.location.href = 'dashboard.html';
    }
  } catch (e) {}
}

// ── Enlazar formulario ────────────────────────────────────────────────────
function bindForm() {
  var form = document.getElementById('auth-form');
  if (form) form.addEventListener('submit', handleSubmit);
  var btnGoogle = document.getElementById('btn-google');
  if (btnGoogle) btnGoogle.addEventListener('click', handleGoogle);
}

// ── Email: validación en tiempo real ─────────────────────────────────────
function bindEmail() {
  var inp = document.getElementById('inp-email');
  if (!inp) return;
  inp.addEventListener('input', function () {
    var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value.trim());
    var icon = document.getElementById('email-valid');
    if (icon) icon.style.display = valid ? 'flex' : 'none';
  });
}

// ── Toggle login / registro ───────────────────────────────────────────────
function toggleMode() {
  MODE = MODE === 'login' ? 'register' : 'login';
  hideError();
  var isReg = MODE === 'register';

  setTxt('form-title',      isReg ? 'Crea tu cuenta' : 'Inicia sesión');
  setTxt('form-sub',        isReg ? 'Completa el formulario para comenzar.' : 'Ingresa para administrar tu punto de venta.');
  setTxt('btn-submit-txt',  isReg ? 'Crear cuenta' : 'Iniciar sesión');
  setTxt('toggle-txt',      isReg ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?');
  setTxt('toggle-btn-txt',  isReg ? 'Inicia sesión' : 'Crear una cuenta');
  setTxt('btn-google-txt',  isReg ? 'Registrarse con Google' : 'Continuar con Google');

  document.querySelectorAll('.register-only').forEach(function (el) {
    el.style.display = isReg ? 'block' : 'none';
  });
  document.querySelectorAll('.login-only').forEach(function (el) {
    el.style.display = isReg ? 'none' : 'flex';
  });

  var passInp = document.getElementById('inp-pass');
  if (passInp) passInp.placeholder = isReg ? 'Mínimo 8 caracteres' : 'Tu contraseña';

  var btnForgot = document.getElementById('btn-forgot');
  if (btnForgot) btnForgot.style.display = isReg ? 'none' : 'block';
}

// ── Mostrar / ocultar contraseña ──────────────────────────────────────────
function togglePass() {
  PASS_SHOW = !PASS_SHOW;
  var inp  = document.getElementById('inp-pass');
  var inpC = document.getElementById('inp-confirm');
  if (inp)  inp.type  = PASS_SHOW ? 'text' : 'password';
  if (inpC) inpC.type = PASS_SHOW ? 'text' : 'password';
  var icon = document.getElementById('eye-icon');
  if (!icon) return;
  if (PASS_SHOW) {
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    icon.innerHTML = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
  }
}

// ── Checkboxes ────────────────────────────────────────────────────────────
function toggleRemember() {
  REMEMBER = !REMEMBER;
  var el = document.getElementById('chk-remember');
  if (!el) return;
  if (REMEMBER) {
    el.classList.add('on');
    el.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  } else {
    el.classList.remove('on');
    el.innerHTML = '';
  }
}

function toggleAgree() {
  AGREE = !AGREE;
  var el = document.getElementById('chk-agree');
  if (!el) return;
  if (AGREE) {
    el.classList.add('on');
    el.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  } else {
    el.classList.remove('on');
    el.innerHTML = '';
  }
}

// ── Submit ────────────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (SUBMITTING) return;
  hideError();
  var email = (document.getElementById('inp-email') || {}).value || '';
  var pass  = (document.getElementById('inp-pass')  || {}).value || '';
  email = email.trim();
  if (!email || !pass) { showError('Completa todos los campos.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('Correo inválido.'); return; }
  if (MODE === 'register') {
    await submitRegister(email, pass);
  } else {
    await submitLogin(email, pass);
  }
}

async function submitLogin(email, pass) {
  setLoading(true);
  try {
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { showError(friendlyError(res.error.message)); return; }
    showToast('Bienvenido de vuelta. Entrando...');
    setTimeout(function () { window.location.href = 'dashboard.html'; }, 900);
  } catch (e) {
    showError('Error de conexión. Intenta de nuevo.');
  } finally {
    setLoading(false);
  }
}

async function submitRegister(email, pass) {
  var nombre  = ((document.getElementById('inp-nombre')  || {}).value || '').trim();
  var negocio = ((document.getElementById('inp-negocio') || {}).value || '').trim();
  var confirm = (document.getElementById('inp-confirm') || {}).value || '';
  if (!nombre)  { showError('Ingresa tu nombre completo.'); return; }
  if (!negocio) { showError('Ingresa el nombre del negocio.'); return; }
  if (pass.length < 8) { showError('La contraseña debe tener mínimo 8 caracteres.'); return; }
  if (pass !== confirm) {
    var hint = document.getElementById('confirm-hint');
    if (hint) hint.style.display = 'block';
    showError('Las contraseñas no coinciden.');
    return;
  }
  if (!AGREE) { showError('Debes aceptar los términos y condiciones.'); return; }

  setLoading(true);
  try {
    var res = await sb.auth.signUp({
      email: email,
      password: pass,
      options: { data: { full_name: nombre, business_name: negocio } }
    });
    if (res.error) { showError(friendlyError(res.error.message)); return; }
    showToast('Cuenta creada. Revisa tu correo para verificarla.');
    setTimeout(function () {
      setTxt('form-title', 'Revisa tu correo');
      setTxt('form-sub', 'Enviamos un enlace a ' + email + '. Confírmalo para ingresar.');
      var form = document.getElementById('auth-form');
      if (form) form.style.display = 'none';
      var toggle = document.querySelector('.toggle-row');
      if (toggle) toggle.style.display = 'none';
      var google = document.getElementById('btn-google');
      if (google) google.style.display = 'none';
      var divider = document.querySelector('.divider');
      if (divider) divider.style.display = 'none';
    }, 1300);
  } catch (e) {
    showError('Error de conexión. Intenta de nuevo.');
  } finally {
    setLoading(false);
  }
}

// ── Google OAuth ──────────────────────────────────────────────────────────
async function handleGoogle() {
  try {
    var res = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard.html' }
    });
    if (res.error) showError(friendlyError(res.error.message));
  } catch (e) {
    showError('No se pudo conectar con Google.');
  }
}

// ── Recuperar contraseña ──────────────────────────────────────────────────
async function forgotPassword() {
  var email = ((document.getElementById('inp-email') || {}).value || '').trim();
  if (!email) { showError('Escribe tu correo para recuperar la contraseña.'); return; }
  try {
    var res = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (res.error) { showError(friendlyError(res.error.message)); return; }
    showToast('Enviamos un correo para restablecer tu contraseña.');
  } catch (e) {
    showError('Error al enviar el correo. Intenta de nuevo.');
  }
}

// ── Helpers de UI ─────────────────────────────────────────────────────────
function setLoading(on) {
  SUBMITTING = on;
  var btn  = document.getElementById('btn-submit');
  var txt  = document.getElementById('btn-submit-txt');
  var spin = document.getElementById('btn-spin');
  var arr  = document.getElementById('btn-arrow');
  if (!btn) return;
  btn.disabled = on;
  if (txt)  txt.style.opacity  = on ? '0' : '1';
  if (spin) spin.style.display = on ? 'block' : 'none';
  if (arr)  arr.style.display  = on ? 'none' : 'block';
}

function showError(msg) {
  var banner = document.getElementById('error-banner');
  var txt    = document.getElementById('error-msg');
  if (!banner || !txt) return;
  txt.textContent = msg;
  banner.style.display = 'flex';
  var card = document.getElementById('form-card');
  if (card) {
    card.classList.add('shake');
    setTimeout(function () { card.classList.remove('shake'); }, 400);
  }
}

function hideError() {
  var banner = document.getElementById('error-banner');
  if (banner) banner.style.display = 'none';
  var hint = document.getElementById('confirm-hint');
  if (hint) hint.style.display = 'none';
}

var _toastTimer = null;
function showToast(msg) {
  var toast = document.getElementById('toast');
  var msgEl = document.getElementById('toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.style.display = 'flex';
  requestAnimationFrame(function () { toast.classList.add('visible'); });
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    toast.classList.remove('visible');
    setTimeout(function () { toast.style.display = 'none'; }, 350);
  }, 3200);
}

function setTxt(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function friendlyError(msg) {
  if (!msg) return 'Error desconocido.';
  var m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed'))     return 'Verifica tu correo antes de ingresar.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con este correo.';
  if (m.includes('password'))                return 'La contraseña debe tener mínimo 8 caracteres.';
  if (m.includes('rate limit'))              return 'Demasiados intentos. Espera unos minutos.';
  return msg;
}

// ── Mock card animada del panel brand ─────────────────────────────────────
function initMockCard() {
  var container = document.getElementById('card-bars');
  if (!container) return;
  var heights = [28, 52, 38, 68, 48, 82, 58, 42, 76, 62, 88, 52];
  var bars = '';
  heights.forEach(function (h, i) {
    var delay = (i * 0.06).toFixed(2);
    bars += '<div style="flex:1;background:rgba(255,255,255,.18);border-radius:3px 3px 0 0;height:' + h + '%;align-self:flex-end;transition:height .7s ease ' + delay + 's"></div>';
  });
  container.innerHTML = bars;
  // Animar counter
  animateSalesNumber();
  // Notificación
  setTimeout(function () {
    var notif = document.getElementById('card-notif');
    if (notif) {
      var span = notif.querySelectorAll('span');
      if (span[1]) span[1].textContent = 'Mesa 04 · Pagada';
    }
  }, 700);
}

function animateSalesNumber() {
  var el = document.getElementById('card-sales');
  if (!el) return;
  var target = 847300;
  var dur    = 1100;
  var begin  = null;
  function step(ts) {
    if (!begin) begin = ts;
    var p    = Math.min((ts - begin) / dur, 1);
    var ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(ease * target).toLocaleString('es-CO');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
