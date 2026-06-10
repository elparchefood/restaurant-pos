/* ═══════════════════════════════════════
   login.js — Lumen POS Auth + Registro
   ═══════════════════════════════════════ */

/* ── Estado global ── */
var STEP = 'login';
var PLAN = 'pro';
var BRANCHES = 1;
var UPLOAD_FILE = null;
var REF_CODE = '';
var FORM = {};

var PLANS = {
  starter: {
    name: 'Starter',
    base: 99000,
    tag: 'Para negocios que comienzan',
    feats: ['1 punto de venta','Menú digital ilimitado','Reportes básicos','Soporte por chat','App mesero','Gestión de mesas']
  },
  pro: {
    name: 'Pro',
    base: 249000,
    tag: 'Para negocios en crecimiento',
    feats: ['Todo lo de Starter','Múltiples puntos de venta','Reportes avanzados','Dashboard en tiempo real','Chat IA integrado','Soporte prioritario']
  }
};

/* ── Descuentos por volumen ── */
function getDiscount(branches) {
  if (branches >= 10) return 0.30;
  if (branches >= 4)  return 0.20;
  if (branches >= 2)  return 0.10;
  return 0;
}

function calcTotal(planId, branches) {
  var base = PLANS[planId].base;
  var disc = getDiscount(branches);
  return Math.round(base * branches * (1 - disc));
}

function COPF(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CO');
}

/* ── Navegación entre pasos ── */
function goStep(step) {
  var views = ['login','plan','datos','pago','confirmado'];
  views.forEach(function(v) {
    var el = document.getElementById('view-' + v);
    if (el) el.style.display = 'none';
  });

  var panel = document.getElementById('form-panel');
  var el = document.getElementById('view-' + step);
  if (el) el.style.display = '';
  STEP = step;

  // Dark mode en pasos de registro
  if (step === 'login') {
    panel.classList.remove('dark-mode');
  } else {
    panel.classList.add('dark-mode');
  }

  // Al entrar a plan, renderizar tarjetas
  if (step === 'plan') {
    renderPlanCards();
    updateBranchUI();
  }

  // Al entrar a pago, actualizar monto
  if (step === 'pago') {
    updatePagoUI();
  }

  // Al entrar a confirmado, llenar resumen
  if (step === 'confirmado') {
    fillConfirm();
  }

  // Scroll top
  var fp = document.getElementById('form-panel');
  if (fp) fp.scrollTop = 0;
}

/* ══════════════════════════════════════
   PLAN STEP
   ══════════════════════════════════════ */
function renderPlanCards() {
  var grid = document.getElementById('pm-grid');
  if (!grid) return;
  var disc = getDiscount(BRANCHES);
  var html = '';

  ['starter','pro'].forEach(function(id) {
    var p = PLANS[id];
    var total = calcTotal(id, BRANCHES);
    var orig  = p.base * BRANCHES;
    var isOn  = PLAN === id;
    var isPro = id === 'pro';

    var priceHtml = disc > 0
      ? '<span class="pm-strike">' + COPF(orig) + '</span><span class="pm-price">' + COPF(total) + '</span>'
      : '<span class="pm-price">' + COPF(total) + '</span>';

    html += '<button class="pm-card ' + (isPro ? 'pro ' : '') + (isOn ? 'selected' : '') + '" onclick="selectPlan(\'' + id + '\')">';
    if (isPro) html += '<div class="pm-popular-tag">⭐ Más popular</div>';
    html += '<div class="pm-card-head">';
    html += '<div class="pm-radio">' + (isOn ? '<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>' : '') + '</div>';
    html += '<div><div class="pm-plan-name">' + p.name + '</div><div class="pm-plan-tag">' + p.tag + '</div></div>';
    html += '</div>';
    html += '<div class="pm-price-block"><div class="pm-price-row">' + priceHtml + '<span class="pm-per">/mes</span></div>';
    if (BRANCHES > 1) {
      html += '<div class="pm-card-total">Total: <strong>' + COPF(total) + '</strong> · ' + BRANCHES + ' suc.</div>';
    }
    html += '</div>';
    if (isPro) {
      html += '<div class="pm-inherit"><svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Incluye todo Starter, más:</div>';
    }
    html += '<ul class="pm-feats">';
    p.feats.forEach(function(f) {
      html += '<li><span class="pm-tick"><svg width="8" height="7" fill="none" viewBox="0 0 8 7"><path d="M1 3.5l2 2L7 1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' + f + '</li>';
    });
    html += '</ul></button>';
  });

  grid.innerHTML = html;
  updateFooter();
}

function selectPlan(id) {
  PLAN = id;
  renderPlanCards();
}

function setPreset(n) {
  BRANCHES = n;
  updateBranchUI();
  renderPlanCards();
}

function stepBranch(delta) {
  BRANCHES = Math.max(1, Math.min(99, BRANCHES + delta));
  updateBranchUI();
  renderPlanCards();
}

function updateBranchUI() {
  var count = document.getElementById('pm-count');
  if (count) count.textContent = BRANCHES;

  // Presets highlight
  var presets = document.querySelectorAll('.pm-chip');
  presets.forEach(function(btn) {
    var v = parseInt(btn.textContent);
    btn.classList.toggle('on', v === BRANCHES && BRANCHES <= 3);
  });

  // Discount badge
  var disc = getDiscount(BRANCHES);
  var badge = document.getElementById('pm-discount-badge');
  if (badge) {
    if (disc > 0) {
      badge.className = 'pm-discount live';
      badge.textContent = (disc * 100) + '% descuento';
    } else {
      badge.className = 'pm-discount flat';
      badge.textContent = 'Sin descuento';
    }
  }
}

function updateFooter() {
  var disc   = getDiscount(BRANCHES);
  var total  = calcTotal(PLAN, BRANCHES);
  var planEl = document.getElementById('pm-plan-name');
  var totEl  = document.getElementById('pm-total-amount');
  var offB   = document.getElementById('pm-off-badge');
  var offT   = document.getElementById('pm-off-text');
  if (planEl) planEl.textContent = PLANS[PLAN].name;
  if (totEl)  totEl.textContent  = COPF(total);
  if (offB) {
    offB.style.display = disc > 0 ? 'inline-flex' : 'none';
    if (offT) offT.textContent = (disc * 100) + '% OFF';
  }
}

/* ══════════════════════════════════════
   DATOS STEP
   ══════════════════════════════════════ */
function handleDatos() {
  var nombre   = document.getElementById('reg-nombre').value.trim();
  var negocio  = document.getElementById('reg-negocio').value.trim();
  var email    = document.getElementById('reg-email').value.trim();
  var pass     = document.getElementById('reg-pass').value;
  var confirm  = document.getElementById('reg-confirm').value;
  var termsChk = document.getElementById('chk-terms');
  var errEl    = document.getElementById('datos-error');
  var errTxt   = document.getElementById('datos-error-text');

  // Validar
  var hintConf = document.getElementById('hint-confirm');
  if (pass !== confirm) {
    hintConf.style.display = '';
    return;
  }
  hintConf.style.display = 'none';

  if (!nombre || !negocio || !email || !pass) {
    errTxt.textContent = 'Completa todos los campos.';
    errEl.classList.add('show');
    return;
  }
  if (pass.length < 8) {
    errTxt.textContent = 'La contraseña debe tener al menos 8 caracteres.';
    errEl.classList.add('show');
    return;
  }
  if (!termsChk.classList.contains('on')) {
    errTxt.textContent = 'Acepta los términos para continuar.';
    errEl.classList.add('show');
    return;
  }

  errEl.classList.remove('show');

  FORM = { nombre: nombre, negocio: negocio, email: email, pass: pass };
  // Generar referencia
  REF_CODE = 'LUMEN-' + Math.random().toString(36).substr(2,6).toUpperCase();
  goStep('pago');
}

/* ══════════════════════════════════════
   PAGO STEP
   ══════════════════════════════════════ */
function updatePagoUI() {
  var total = calcTotal(PLAN, BRANCHES);
  var montoEl = document.getElementById('pago-monto');
  var refEl   = document.getElementById('pago-ref');
  if (montoEl) montoEl.textContent = COPF(total);
  if (refEl)   refEl.textContent   = REF_CODE;
}

function handleFileSelect(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('El archivo supera 5MB');
    return;
  }
  UPLOAD_FILE = file;
  var zone     = document.getElementById('upload-zone');
  var textEl   = document.getElementById('upload-text');
  if (zone) zone.classList.add('has-file');
  if (textEl) {
    textEl.innerHTML = '<div class="uploaded-file"><svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M4 13V8a2 2 0 012-2h4a2 2 0 012 2v5M2 13h12" stroke="#A9B2FF" stroke-width="1.3" stroke-linecap="round"/></svg>' + file.name + '</div>';
  }
}

function onDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('dragover');
}
function onDragLeave(e) {
  document.getElementById('upload-zone').classList.remove('dragover');
}
function onDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  var file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
}

async function handlePago() {
  var hintUp = document.getElementById('hint-upload');
  if (!UPLOAD_FILE) {
    hintUp.style.display = '';
    return;
  }
  hintUp.style.display = 'none';

  var btn = document.getElementById('btn-pago');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spin"></span>Enviando...';

  try {
    // 1. Subir comprobante a Storage
    var ext      = UPLOAD_FILE.name.split('.').pop();
    var fileName = REF_CODE + '.' + ext;
    var { error: upErr } = await sb.storage
      .from('comprobantes')
      .upload(fileName, UPLOAD_FILE, { upsert: true });
    if (upErr) throw upErr;

    var { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(fileName);
    var compUrl = urlData.publicUrl;

    // 2. Insertar en pos_registrations
    var total = calcTotal(PLAN, BRANCHES);
    var { error: dbErr } = await sb
      .from('pos_registrations')
      .insert({
        nombre:       FORM.nombre,
        negocio:      FORM.negocio,
        email:        FORM.email,
        password_tmp: FORM.pass,
        plan:         PLAN,
        branches:     BRANCHES,
        total_mes:    total,
        ref_code:     REF_CODE,
        comprobante_url: compUrl,
        status:       'pendiente'
      });
    if (dbErr) throw dbErr;

    goStep('confirmado');
  } catch (e) {
    console.error('handlePago:', e);
    showToast('Error al enviar: ' + (e.message || 'Intenta de nuevo'));
    btn.disabled = false;
    btn.textContent = 'Enviar solicitud';
  }
}

/* ══════════════════════════════════════
   CONFIRMACIÓN
   ══════════════════════════════════════ */
function fillConfirm() {
  var total = calcTotal(PLAN, BRANCHES);
  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  set('cv-negocio', FORM.negocio || '—');
  set('cv-plan',    PLANS[PLAN] ? PLANS[PLAN].name : '—');
  set('cv-suc',     BRANCHES + (BRANCHES === 1 ? ' sucursal' : ' sucursales'));
  set('cv-total',   COPF(total) + '/mes');
  set('cv-email',   FORM.email || '—');
}

/* ══════════════════════════════════════
   LOGIN
   ══════════════════════════════════════ */
async function handleLogin() {
  var email = (document.getElementById('login-email').value || '').trim();
  var pass  = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  var errTxt = document.getElementById('login-error-text');
  var btn   = document.getElementById('btn-login');

  if (!email || !pass) {
    errTxt.textContent = 'Ingresa tu correo y contraseña.';
    errEl.classList.add('show');
    return;
  }

  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spin"></span>Ingresando...';

  try {
    var { data, error } = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (error) throw error;

    // Verificar rol
    var { data: profile } = await sb.from('user_profiles').select('role').eq('id', data.user.id).single();
    if (profile && profile.role === 'admin') {
      window.location.href = 'admin-reg.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (e) {
    errTxt.textContent = e.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.'
      : (e.message || 'Error al iniciar sesión.');
    errEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
  }
}

function showForgot() {
  showToast('Función en desarrollo · Contacta a soporte');
}

/* ══════════════════════════════════════
   HELPERS UI
   ══════════════════════════════════════ */
function togglePwd(inputId, btn) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function toggleChk(el) {
  el.classList.toggle('on');
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(function() {
    showToast('Copiado: ' + text);
  }).catch(function() {
    showToast(text);
  });
}

function copyRef() {
  copyText(REF_CODE);
}

function showToast(msg) {
  var t = document.getElementById('auth-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2800);
}

/* ══════════════════════════════════════
   ODOMETER ANIMATION
   ══════════════════════════════════════ */
(function() {
  var digits = [
    { id: 'odo-m', dur: 6.2 },
    { id: 'odo-c', dur: 4.8 },
    { id: 'odo-u', dur: 3.4 }
  ];
  digits.forEach(function(d) {
    var el = document.getElementById(d.id);
    if (!el) return;
    el.style.animation = 'paRoll ' + d.dur + 's linear infinite';
  });
})();

/* ══════════════════════════════════════
   BOOT
   ══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  // Si ya hay sesión activa, redirigir
  sb.auth.getSession().then(function(res) {
    if (res.data.session) {
      sb.from('user_profiles').select('role').eq('id', res.data.session.user.id).single().then(function(r) {
        if (r.data && r.data.role === 'admin') {
          window.location.href = 'admin-reg.html';
        } else if (res.data.session) {
          window.location.href = 'dashboard.html';
        }
      });
    }
  });

  // Enter key en login
  document.getElementById('login-pass').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-email').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('login-pass').focus();
  });
});
