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
  cargarCuentaCobro();   // la cuenta sale de la consola, no del codigo
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

  /* La contrasena se comprueba AQUI y no al enviar: si el error saliera en el
     paso 3, la persona ya subio su comprobante y tendria que volver atras sin
     entender por que. */
  var clave  = ((document.getElementById('inp-clave')  || {}).value || '');
  var clave2 = ((document.getElementById('inp-clave2') || {}).value || '');
  if (clave.length < 8) { showError('La contraseña debe tener al menos 8 caracteres.'); return; }
  if (clave !== clave2) { showError('Las dos contraseñas no son iguales.'); return; }
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

/* ── LA CUENTA DE COBRO DE COBRA POS ────────────────────────────────────
   Sale de `plataforma_cobro`, y NO de los metodos de pago de ningun
   restaurante. Sergio: *"una cosa es la cuenta donde pagan los clientes del
   restaurante y otra muy distinta donde pagan los clientes de Cobra... no
   deben tener ninguna vinculacion"*. Hoy comparten numero por coincidencia;
   el dia que cambie una, la otra no se puede mover sola.

   Se muestra tal cual llega. Si la consulta falla, la caja queda con guiones
   y el aviso de abajo: es preferible que alguien pregunte a que transfiera a
   un numero viejo que quedo escrito en el codigo. */
async function cargarCuentaCobro() {
  var caja = document.querySelector('.bank-card') || document;
  try {
    var r = await sb.from('plataforma_cobro').select('*').eq('id', 1).maybeSingle();
    var c = r && r.data;
    if (!c || !String(c.numero || '').trim()) throw new Error('sin cuenta configurada');
    var pon = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
    pon('bank-nombre',  c.banco || 'Transferencia');
    pon('bank-tipo',    c.tipo || '—');
    pon('bank-titular', c.titular || '—');
    /* Se muestra en grupos de tres, que es como la gente lee un numero largo,
       pero al copiar va limpio: un espacio de mas en la app del banco es un
       "cuenta no encontrada" que nadie sabe explicar. */
    pon('bank-llave', String(c.numero).replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1 ').trim());
    var lbl = document.getElementById('bank-numero-lbl');
    if (lbl) lbl.textContent = /llave/i.test(c.tipo || '') ? 'Llave' : 'Cuenta';
    if (String(c.nota || '').trim()) {
      pon('bank-nota', c.nota);
      var fila = document.getElementById('bank-nota-row');
      if (fila) fila.style.display = '';
    }
    CUENTA_COBRO = String(c.numero).replace(/\D/g, '');

    /* El boton del QR solo si de verdad hay imagen. */
    if (String(c.qr_url || '').trim()) {
      QR_COBRO = c.qr_url;
      var b = document.getElementById('bank-qr-btn');
      if (b) b.style.display = '';
      var t = document.getElementById('qr-titular-txt');
      if (t) t.textContent = (c.banco || '') + (c.titular ? ' · ' + c.titular : '');
    }
  } catch (e) {
    console.warn('[registro] no se pudo leer la cuenta de cobro:', e && e.message);
    var av = document.getElementById('bank-tipo');
    if (av) av.textContent = 'No disponible ahora mismo';
  }
}
var CUENTA_COBRO = '';
var QR_COBRO = '';

function verQr() {
  if (!QR_COBRO) return;
  var img = document.getElementById('qr-img');
  var ov  = document.getElementById('qr-overlay');
  if (img) img.src = QR_COBRO;
  if (ov) ov.style.display = 'flex';
}
function cerrarQr() {
  var ov = document.getElementById('qr-overlay');
  if (ov) ov.style.display = 'none';
}

function copyLlave() {
  var el = document.getElementById('bank-llave');
  var val = CUENTA_COBRO || (el ? el.textContent.replace(/\s/g, '') : '');
  if (!val) { showToast('La cuenta no esta disponible. Escribenos y te la pasamos.'); return; }
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

    /* 2. La solicitud Y la cuenta, en una sola llamada al servidor.
       Antes esta pantalla insertaba la solicitud directamente y la cuenta se
       creaba al aprobar, con una clave que el sistema inventaba. Ahora la
       clave la escoge el dueno aqui mismo, asi que la cuenta se crea YA:
       guardarla para usarla en unas horas seria dejar una contrasena en texto
       plano esperando en la base.

       Va por el servidor y no desde aqui porque crear cuentas necesita
       permisos que ninguna pantalla puede tener. */
    var total = calcTotal(PLAN, BRANCHES);
    var clave = ((document.getElementById('inp-clave') || {}).value || '');
    var reg = await fetch(SUPABASE_URL + '/functions/v1/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({
        action: 'registrar', nombre: nombre, negocio: negocio, email: email,
        clave: clave, plan: PLAN, sucursales: BRANCHES,
        monto_total: total, comprobante_url: compUrl,
      })
    });
    var rd = await reg.json().catch(function () { return {}; });
    if (!reg.ok || !rd.ok) throw new Error(rd.error || 'No se pudo completar el registro.');

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
