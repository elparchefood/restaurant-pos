/* =====================================================
   login.js — Auth + Registro multi-paso Cobra POS
   pos-core.js ya define: sb, $, COPF, COP
   ===================================================== */

// ── Estado de registro ──────────────────────────────
const REG = {
  nombre: '', negocio: '', email: '', pass: '',
  refCode: '', plan: 'pro', branches: 1,
  billing: 'annual', totalMes: 0, totalCiclo: 0
};

// Precios base (COP/mes/sucursal)
const PRECIOS_BASE = { starter: 149000, pro: 249000 };

// Descuento por volumen
function volDiscount(n) {
  if (n >= 10) return .30;
  if (n >= 4)  return .20;
  if (n >= 2)  return .10;
  return 0;
}

// ── Navegación entre vistas ─────────────────────────
function goStep(step) {
  $('auth-root').hidden  = (step === 'plan');
  $('plan-root').hidden  = (step !== 'plan');
  $('view-login').hidden     = (step !== 'login');
  $('view-datos').hidden     = (step !== 'datos');
  $('view-pago').hidden      = (step !== 'pago');
  $('view-confirmado').hidden = (step !== 'confirmado');
  window.scrollTo(0, 0);
}

// ── Helpers UI ──────────────────────────────────────
function togglePwd(id, btn) {
  const inp = document.getElementById(id);
  const isText = inp.type === 'text';
  inp.type = isText ? 'password' : 'text';
  btn.querySelector('svg').style.opacity = isText ? '1' : '.4';
}

function toggleCheck(el) {
  el.classList.toggle('on');
}

function showError(wrapperId, msgId, msg) {
  const el = $(wrapperId); if (!el) return;
  el.classList.add('show');
  const m = $(msgId); if (m) m.textContent = msg;
  setTimeout(() => el.classList.remove('show'), 5000);
}

function showToast(msg) {
  const t = $('auth-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function copyText(txt) {
  navigator.clipboard.writeText(txt).catch(() => {});
  showToast('Copiado al portapapeles');
}

// ── LOGIN ────────────────────────────────────────────
async function handleLogin() {
  const email = $('login-email').value.trim();
  const pass  = $('login-pass').value;
  if (!email || !pass) { showError('login-error','login-error-msg','Completa todos los campos'); return; }
  const btn = $('btn-login'); const txt = $('btn-login-text');
  btn.disabled = true;
  txt.innerHTML = '<span class="au-spin"></span>';
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    window.location.href = 'dashboard.html';
  } catch(e) {
    btn.disabled = false; txt.textContent = 'Iniciar sesión';
    showError('login-error','login-error-msg', e.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : (e.message || 'Error al iniciar sesión'));
  }
}

async function handleGoogleLogin() {
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard.html' }
    });
    if (error) throw error;
  } catch(e) { showToast('Error con Google: ' + e.message); }
}

async function handleForgot() {
  const email = $('login-email').value.trim();
  if (!email) { showError('login-error','login-error-msg','Ingresa tu correo primero'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login.html' });
  if (error) showError('login-error','login-error-msg', error.message);
  else showToast('Revisa tu correo para restablecer tu contraseña');
}

// ── DATOS (paso 1) ───────────────────────────────────
function handleDatos() {
  const nombre  = $('reg-nombre').value.trim();
  const negocio = $('reg-negocio').value.trim();
  const email   = $('reg-email').value.trim();
  const pass    = $('reg-pass').value;
  const ref     = $('reg-ref').value.trim();
  const terms   = $('chk-terms').classList.contains('on');

  if (!nombre || !negocio || !email || !pass)
    return showError('datos-error','datos-error-msg','Completa todos los campos obligatorios');
  if (pass.length < 8)
    return showError('datos-error','datos-error-msg','La contraseña debe tener al menos 8 caracteres');
  if (!terms)
    return showError('datos-error','datos-error-msg','Debes aceptar los términos de servicio');

  REG.nombre = nombre; REG.negocio = negocio;
  REG.email = email;   REG.pass = pass;
  REG.refCode = ref;

  goStep('plan');
  calcPrices();
}

// ── PLAN ─────────────────────────────────────────────

// Seleccionar plan
function selectPlan(plan) {
  REG.plan = plan;
  $('card-starter').classList.toggle('on', plan === 'starter');
  $('card-pro').classList.toggle('on', plan === 'pro');
  $('radio-starter').classList.toggle('on', plan === 'starter');
  $('radio-pro').classList.toggle('on', plan === 'pro');
  $('radio-starter').innerHTML = plan === 'starter'
    ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : '';
  $('radio-pro').innerHTML = plan === 'pro'
    ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : '';
  calcPrices();
}

// Chips de sucursales
function setChip(n) {
  REG.branches = n;
  $('branch-count').textContent = n;
  [1,2,5,10].forEach(v => {
    const c = $('chip-' + v);
    if (c) c.classList.toggle('on', v === n);
  });
  updateDiscountNote();
  calcPrices();
}

// Stepper ±1
function stepBranch(delta) {
  const n = Math.max(1, Math.min(50, REG.branches + delta));
  REG.branches = n;
  $('branch-count').textContent = n;
  // sincronizar chips
  [1,2,5,10].forEach(v => {
    const c = $('chip-' + v);
    if (c) c.classList.toggle('on', v === n);
  });
  updateDiscountNote();
  calcPrices();
}

// Billing toggle
function setBilling(mode) {
  REG.billing = mode;
  $('bill-monthly').classList.toggle('on', mode === 'monthly');
  $('bill-annual').classList.toggle('on', mode === 'annual');
  calcPrices();
}

// Discount note
function updateDiscountNote() {
  const note = $('discount-note');
  const pct  = Math.round(volDiscount(REG.branches) * 100);
  if (pct > 0) {
    note.hidden = false;
    $('discount-note-text').innerHTML = 'Estás ahorrando <strong>' + pct + '%</strong> por volumen';
  } else {
    note.hidden = true;
  }
}

// Compare toggle
function toggleCompare() {
  const body = $('compare-body');
  const chev = $('compare-chev');
  const isOpen = body.classList.toggle('open');
  chev.classList.toggle('up', isOpen);
}

// Cálculo de precios
function calcPrices() {
  const b = REG.branches;
  const annual = REG.billing === 'annual';
  const disc = volDiscount(b);

  ['starter', 'pro'].forEach(plan => {
    const base = PRECIOS_BASE[plan];
    const conVol = base * (1 - disc);
    const unitMes = annual ? conVol * (10 / 12) : conVol;
    const totalCiclo = annual ? unitMes * 12 * b : unitMes * b;
    const ahorroMes = (base * b) - (unitMes * b);
    const porDia = unitMes / 30;

    const strikeEl  = $(plan + '-strike');
    const priceEl   = $(plan + '-price');
    const perdayEl  = $(plan + '-perday');
    const saveEl    = $(plan + '-save');
    const saveAmtEl = $(plan + '-save-amount');
    const totalEl   = $(plan + '-total');
    const totalCEl  = $(plan + '-total-cycle');
    const totalBEl  = $(plan + '-total-branches');

    // precio tachado: solo si hay descuento (volumen O anual)
    const hasDisc = disc > 0 || annual;
    if (strikeEl) {
      strikeEl.hidden = !hasDisc;
      strikeEl.textContent = hasDisc ? COPF(base) : '';
    }

    if (priceEl) priceEl.textContent = COPF(unitMes);
    if (perdayEl) perdayEl.textContent = 'Equiv. ' + COPF(porDia) + '/día';

    // ahorro badge
    if (saveEl) {
      saveEl.hidden = ahorroMes <= 0;
      if (saveAmtEl) saveAmtEl.textContent = COPF(ahorroMes);
    }

    // total
    if (totalEl) totalEl.textContent = COPF(totalCiclo);
    if (totalCEl) totalCEl.textContent = annual ? '/año' : '/mes';
    if (totalBEl) totalBEl.textContent = b + (b === 1 ? ' sucursal' : ' sucursales');
  });

  // guardar para el plan seleccionado
  const selBase = PRECIOS_BASE[REG.plan];
  const selDisc = volDiscount(b);
  const selVol  = selBase * (1 - selDisc);
  const selUnit = annual ? selVol * (10 / 12) : selVol;
  const selTotal = annual ? selUnit * 12 * b : selUnit * b;
  REG.totalMes  = selUnit;
  REG.totalCiclo = selTotal;

  updateFooter();
}

function updateFooter() {
  const annual = REG.billing === 'annual';
  const disc = volDiscount(REG.branches);
  const pct  = Math.round((disc + (annual ? (2/12) : 0)) * 100);

  $('foot-plan').textContent     = REG.plan === 'pro' ? 'Pro' : 'Starter';
  $('foot-branches').textContent = REG.branches + (REG.branches === 1 ? ' sucursal' : ' sucursales');
  $('foot-billing').textContent  = annual ? 'Anual' : 'Mensual';
  $('foot-amount').textContent   = COPF(REG.totalMes);
  $('foot-cycle').textContent    = '/mes';

  const eqEl = $('foot-eq');
  if (annual) {
    eqEl.textContent = '· Total ' + COPF(REG.totalCiclo) + '/año';
  } else {
    eqEl.textContent = '';
  }

  const offEl = $('foot-off');
  const offPctEl = $('foot-off-pct');
  if (pct > 0) {
    offEl.hidden = false;
    offPctEl.textContent = pct + '%';
  } else {
    offEl.hidden = true;
  }
}

// Continuar desde plan → pago
function handlePlanContinue() {
  const btn = $('btn-continue');
  const txt = $('btn-continue-text');
  btn.classList.add('loading');
  btn.disabled = true;
  txt.innerHTML = '<span class="ps-spin"></span> Un momento…';

  setTimeout(() => {
    btn.classList.remove('loading');
    btn.disabled = false;
    txt.textContent = 'Continuar con este plan';

    // Actualizar vista de pago
    const annual = REG.billing === 'annual';
    $('pago-sub').textContent =
      'Plan ' + (REG.plan === 'pro' ? 'Pro' : 'Starter') +
      ' · ' + REG.branches + ' sucursal' + (REG.branches > 1 ? 'es' : '') +
      ' · ' + (annual ? 'Anual' : 'Mensual');
    $('pago-monto').textContent = COPF(REG.totalCiclo);

    goStep('pago');
  }, 800);
}

// ── PAGO (paso 3) ────────────────────────────────────
let uploadedFile = null;
let uploadedUrl  = '';

function handleFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024)
    return showToast('Archivo demasiado grande (máx 5 MB)');

  uploadedFile = file;
  const zone = $('upload-zone');
  zone.classList.add('has-file');
  $('upload-text').innerHTML =
    '<div class="upload-name">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    file.name + '</div>';
}

function handleDrop(e) {
  e.preventDefault();
  $('upload-zone').classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
}

async function handlePago() {
  if (!uploadedFile)
    return showError('pago-error','pago-error-msg','Adjunta el comprobante de pago');

  const btn = $('btn-pago'); const txt = $('btn-pago-text');
  btn.disabled = true; txt.innerHTML = '<span class="au-spin"></span> Subiendo…';

  try {
    // 1. Subir comprobante a storage
    const ext = uploadedFile.name.split('.').pop();
    const path = `${Date.now()}_${REG.email.replace('@','_')}.${ext}`;
    const { error: upErr } = await sb.storage.from('comprobantes').upload(path, uploadedFile, { upsert: false });
    if (upErr) throw upErr;
    const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(path);
    uploadedUrl = urlData.publicUrl;

    // 2. Insertar en pos_registrations
    const { error: dbErr } = await sb.from('pos_registrations').insert({
      nombre: REG.nombre,
      negocio: REG.negocio,
      email: REG.email,
      password_tmp: REG.pass,
      plan: REG.plan,
      branches: REG.branches,
      total_mes: Math.round(REG.totalMes),
      total_ciclo: Math.round(REG.totalCiclo),
      billing: REG.billing,
      ref_code: REG.refCode || null,
      comprobante_url: uploadedUrl,
      status: 'pending'
    });
    if (dbErr) throw dbErr;

    fillConfirm();
    goStep('confirmado');
  } catch(e) {
    btn.disabled = false; txt.textContent = 'Enviar comprobante';
    showError('pago-error','pago-error-msg', e.message || 'Error al enviar');
  }
}

function fillConfirm() {
  const annual = REG.billing === 'annual';
  $('cf-plan').textContent     = REG.plan === 'pro' ? 'Pro' : 'Starter';
  $('cf-branches').textContent = REG.branches + ' sucursal' + (REG.branches > 1 ? 'es' : '');
  $('cf-ciclo').textContent    = annual ? 'Anual' : 'Mensual';
  $('cf-monto').textContent    = COPF(REG.totalCiclo) + (annual ? '/año' : '/mes');
  $('cf-email').textContent    = REG.email;
}

// ── Enter key ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  // estado inicial
  calcPrices();
});
