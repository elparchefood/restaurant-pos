// register.js — Flujo de registro Cobra POS

// ── Estado global ──────────────────────────────────────────────────────
var PLAN     = 'pro';
var BRANCHES = 1;
var SELECTED_FILE = null;
var SUBMITTING    = false;

var PRICES   = { starter: 99000, pro: 249000 };
var TIERS    = [
  {min: 10, off: 0.30},
  {min: 4,  off: 0.20},
  {min: 2,  off: 0.10},
  {min: 1,  off: 0},
];

function tierFor(n) {
  return TIERS.find(function(t) { return n >= t.min; }) || TIERS[TIERS.length - 1];
}

function calcTotal(planId, branches) {
  var base = PRICES[planId];
  var off  = tierFor(branches).off;
  return Math.round(base * (1 - off) * branches);
}

function calcUnit(planId, branches) {
  var base = PRICES[planId];
  var off  = tierFor(branches).off;
  return Math.round(base * (1 - off));
}

function cop(n) {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  updatePlanUI();
  setupDragDrop();
});

// ── Navegación entre pasos ─────────────────────────────────────────────
function goStep(n) {
  hideError();
  document.querySelectorAll('.reg-step').forEach(function(el) { el.classList.remove('active'); });
  var step = document.getElementById('step-' + n);
  if (step) step.classList.add('active');

  var items = document.querySelectorAll('.step-item');
  items.forEach(function(el, i) {
    el.classList.remove('active', 'done');
    var num = i + 1;
    if (num < n) el.classList.add('done');
    if (num === n) el.classList.add('active');
  });

  // Scroll top
  var modal = document.getElementById('reg-modal');
  if (modal) modal.scrollTop = 0;
}

// ── PASO 1: Plan ──────────────────────────────────────────────────────
function selectPlan(planId) {
  PLAN = planId;
  var cards = ['starter', 'pro'];
  cards.forEach(function(id) {
    var card  = document.getElementById('card-' + id);
    var radio = document.getElementById('radio-' + id);
    if (!card || !radio) return;
    if (id === planId) {
      card.classList.add('on');
      radio.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    } else {
      card.classList.remove('on');
      radio.innerHTML = '';
    }
  });
  updatePlanUI();
}

function setBranches(n) {
  BRANCHES = Math.max(1, Math.min(99, n));
  // Update chips
  document.querySelectorAll('.pm-chip').forEach(function(btn) {
    btn.classList.toggle('on', parseInt(btn.getAttribute('data-n')) === BRANCHES);
  });
  var countEl = document.getElementById('branch-count');
  if (countEl) countEl.textContent = BRANCHES;
  updatePlanUI();
}

function updatePlanUI() {
  var tier = tierFor(BRANCHES);
  var off  = tier.off;

  // Update both cards
  ['starter', 'pro'].forEach(function(id) {
    var base  = PRICES[id];
    var unit  = calcUnit(id, BRANCHES);
    var total = calcTotal(id, BRANCHES);
    var suf   = BRANCHES === 1 ? '1 sucursal' : BRANCHES + ' sucursales';

    var priceEl  = document.getElementById('price-' + id);
    var strikeEl = document.getElementById('strike-' + id);
    var totalEl  = document.getElementById('total-' + id);

    if (priceEl)  priceEl.textContent = cop(unit);
    if (strikeEl) {
      if (off > 0) {
        strikeEl.textContent = cop(base);
        strikeEl.style.display = '';
      } else {
        strikeEl.style.display = 'none';
      }
    }
    if (totalEl) totalEl.innerHTML = suf + ' · <strong>' + cop(total) + '</strong> / mes';
  });

  // Discount badge
  var badge = document.getElementById('discount-badge');
  if (badge) {
    if (off > 0) {
      badge.textContent = '−' + (off * 100) + '% aplicado';
      badge.className = 'pm-discount live';
    } else {
      badge.textContent = 'Precio base';
      badge.className = 'pm-discount flat';
    }
  }

  // Footer
  var selTotal = calcTotal(PLAN, BRANCHES);
  var txtEl = document.getElementById('foot-plan');
  if (txtEl) txtEl.textContent = PLAN === 'pro' ? 'Pro' : 'Starter';
  var branchTxt = document.getElementById('foot-branches');
  if (branchTxt) branchTxt.textContent = BRANCHES === 1 ? '1 sucursal' : BRANCHES + ' sucursales';
  var footOff = document.getElementById('foot-off');
  var footOffTxt = document.getElementById('foot-off-txt');
  if (footOff) {
    footOff.style.display = off > 0 ? 'inline-flex' : 'none';
    if (footOffTxt) footOffTxt.textContent = '−' + (off * 100) + '%';
  }
  var footTotal = document.getElementById('foot-total');
  if (footTotal) footTotal.textContent = cop(selTotal);

  // Paso 3 monto
  var payAmount = document.getElementById('pay-amount');
  if (payAmount) payAmount.textContent = cop(selTotal);
  var payPlan = document.getElementById('pay-plan-name');
  if (payPlan) payPlan.textContent = PLAN === 'pro' ? 'Pro' : 'Starter';
  var payBranches = document.getElementById('pay-branches-txt');
  if (payBranches) payBranches.textContent = BRANCHES === 1 ? '1 sucursal' : BRANCHES + ' sucursales';
}

// ── PASO 2: Validar datos ─────────────────────────────────────────────
function validateStep2() {
  hideError();
  var nombre  = (document.getElementById('inp-nombre') || {}).value.trim();
  var negocio = (document.getElementById('inp-negocio') || {}).value.trim();
  var email   = (document.getElementById('inp-email')  || {}).value.trim();
  if (!nombre)  { showError('Ingresa tu nombre completo.'); return; }
  if (!negocio) { showError('Ingresa el nombre de tu negocio.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('Ingresa un correo válido.'); return; }
  goStep(3);
}

// ── PASO 3: Archivo ────────────────────────────────────────────────────
function handleFile(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showError('El archivo supera 5 MB. Usa una imagen más pequeña.'); return; }
  SELECTED_FILE = file;
  var zone = document.getElementById('upload-zone');
  var fn   = document.getElementById('upload-filename');
  var cont = document.getElementById('upload-content');
  if (zone) zone.classList.add('has-file');
  if (fn)   { fn.textContent = '✓ ' + file.name; fn.style.display = 'block'; }
  if (cont) cont.style.display = 'none';
}

function setupDragDrop() {
  var zone = document.getElementById('upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.classList.remove('dragover');
    var file = e.dataTransfer.files[0];
    if (file) {
      var fi = document.getElementById('file-input');
      if (fi) {
        var dt = new DataTransfer();
        dt.items.add(file);
        fi.files = dt.files;
        handleFile(fi);
      }
    }
  });
}

function copyLlave() {
  var el = document.getElementById('bank-llave');
  var val = el ? el.textContent.replace(/\s/g, '') : '0092571225';
  navigator.clipboard.writeText(val).then(function() {
    showToast('Llave copiada al portapapeles.');
  }).catch(function() {
    showToast('Llave: ' + val);
  });
}

// ── Enviar solicitud a Supabase ────────────────────────────────────────
async function enviarSolicitud() {
  if (SUBMITTING) return;
  hideError();

  var nombre  = ((document.getElementById('inp-nombre')  || {}).value || '').trim();
  var negocio = ((document.getElementById('inp-negocio') || {}).value || '').trim();
  var email   = ((document.getElementById('inp-email')   || {}).value || '').trim();

  if (!SELECTED_FILE) { showError('Debes subir el comprobante de pago para continuar.'); return; }

  setLoading(true);
  try {
    // 1. Subir comprobante a Storage
    /* EL NOMBRE DEL ARCHIVO NO LLEVA EL CORREO. Antes era
       `<fecha>-<correo>.<ext>`, y esa cadena viajaba dentro de la direccion
       guardada en la base: el correo de cada restaurante que se registra
       quedaba escrito en una URL. Ahora es al azar, sin nada que identifique a
       nadie. Quien lo tiene que abrir es el administrador, y lo encuentra por
       la solicitud, no por el nombre del archivo. */
    var ext = String(SELECTED_FILE.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    var azar = (crypto && crypto.randomUUID) ? crypto.randomUUID()
             : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9);
    var filename = azar + '.' + ext;
    var uploadRes = await sb.storage.from('comprobantes').upload(filename, SELECTED_FILE, {
      contentType: SELECTED_FILE.type,
      upsert: false
    });
    if (uploadRes.error) throw uploadRes.error;

    /* Se guarda la RUTA, no una direccion publica. El bucket dejo de ser
       publico (24-ago): un comprobante lleva datos bancarios y no puede quedar
       abierto a quien acierte la direccion. La consola de solicitudes pide una
       direccion firmada, que caduca. */
    var compUrl = filename;

    // 2. Insertar solicitud en pos_registrations
    var total = calcTotal(PLAN, BRANCHES);
    var insertRes = await sb.from('pos_registrations').insert({
      nombre:          nombre,
      negocio:         negocio,
      email:           email,
      plan:            PLAN,
      sucursales:      BRANCHES,
      monto_total:     total,
      comprobante_url: compUrl,
      status:          'pending'
    });
    if (insertRes.error) throw insertRes.error;

    // 3. Mostrar confirmación
    setConfirmData(negocio, email, total);
    goStep(4);
    showToast('Solicitud enviada correctamente.');

  } catch(e) {
    console.error('enviarSolicitud:', e);
    showError('Error al enviar la solicitud: ' + (e.message || 'Intenta de nuevo.'));
  } finally {
    setLoading(false);
  }
}

function setConfirmData(negocio, email, total) {
  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  set('conf-negocio',   negocio);
  set('conf-plan',      PLAN === 'pro' ? 'Pro' : 'Starter');
  set('conf-sucursales', BRANCHES === 1 ? '1 sucursal' : BRANCHES + ' sucursales');
  set('conf-total',     cop(total) + ' / mes');
  set('conf-email',     email);
}

// ── UI helpers ─────────────────────────────────────────────────────────
function setLoading(on) {
  SUBMITTING = on;
  var btn  = document.getElementById('btn-enviar');
  var txt  = document.getElementById('btn-enviar-txt');
  var spin = document.getElementById('btn-spin');
  var arr  = document.getElementById('btn-enviar-arrow');
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
  var modal = document.getElementById('reg-modal');
  if (modal) modal.scrollTop = 0;
}

function hideError() {
  var banner = document.getElementById('error-banner');
  if (banner) banner.style.display = 'none';
}

var _toastTimer = null;
function showToast(msg) {
  var toast = document.getElementById('toast');
  var msgEl = document.getElementById('toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.style.display = 'flex';
  requestAnimationFrame(function() { toast.classList.add('visible'); });
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() {
    toast.classList.remove('visible');
    setTimeout(function() { toast.style.display = 'none'; }, 350);
  }, 3200);
}
