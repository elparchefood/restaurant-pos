// register.js — Flujo de registro Cobra POS

/* ═══════════════════════════════════════════════════════════════════════════
   PASO 1 — ELEGIR EL PLAN
   ---------------------------------------------------------------------------
   Diseño entregado por Sergio el 28-ago-2026. Lo que hay que saber de esta
   parte, que es la que decide cuánto se le cobra a cada restaurante:

   1. LOS PRECIOS SALEN DE LA BASE (`pos_planes`), no del código. Antes estaban
      escritos aquí, y por eso esta pantalla estuvo mostrando Starter a $99.000
      cuando vale $149.000: alguien cambió el precio en la consola y aquí nadie
      se enteró. Ahora se leen al abrir; los números de abajo son sólo el
      salvavidas por si la consulta falla, y son los de verdad.

   2. LOS DOS DESCUENTOS SE APLICAN EN ORDEN, y el orden lo decidió Sergio:
      *"primero se calcula el precio con descuento por sucursales, y al total ya
      descontado se le hace el descuento si paga trimestral o anual"*. Está así
      en los términos y condiciones, y así se cobra también en la pantalla de
      cuenta suspendida. Los tres sitios tienen que dar el mismo número.

   3. SE REDONDEA AL PINTAR, NUNCA ANTES. Redondear un paso intermedio hace que
      el total de la tarjeta y el del pie se diferencien en pesos sueltos, y no
      hay forma de explicarle eso a un cliente que está a punto de pagar.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Estado global ──────────────────────────────────────────────────────
var PLAN     = 'pro';
var BRANCHES = 1;
var BILLING  = 'mensual';
var SELECTED_FILE = null;
var SUBMITTING    = false;

/* Salvavidas: sólo se usan si `pos_planes` no responde. */
var PRICES = { starter: 149000, pro: 249000 };

var TIERS = [
  {min: 8, off: 0.30},
  {min: 4, off: 0.20},
  {min: 2, off: 0.10},
  {min: 1, off: 0},
];

var PERIODOS = {
  mensual:    { meses: 1,  off: 0,    ciclo: '/ mes',       largo: 'mensual'    },
  trimestral: { meses: 3,  off: 0.10, ciclo: '/ trimestre', largo: 'trimestral' },
  anual:      { meses: 12, off: 0.20, ciclo: '/ año',       largo: 'anual'      },
};

function tierFor(n) {
  return TIERS.find(function (t) { return n >= t.min; }) || TIERS[TIERS.length - 1];
}

/* Lo que cuesta UNA sucursal al mes con los dos descuentos ya puestos. Es la
   cifra grande de la tarjeta: la gente compara planes por sucursal, no por el
   total de la factura. */
function unitMensual(planId, branches, billing) {
  var base = PRICES[planId] || 0;
  var per  = PERIODOS[billing] || PERIODOS.mensual;
  return base * (1 - tierFor(branches).off) * (1 - per.off);
}

/* Lo que transfiere HOY: el mes, el trimestre o el año completo. */
function montoAhora(planId, branches, billing) {
  var per = PERIODOS[billing] || PERIODOS.mensual;
  return unitMensual(planId, branches, billing) * per.meses * branches;
}

/* Y lo que le sale el mes, para poder comparar contra el precio mensual. */
function mensualEfectivo(planId, branches, billing) {
  return unitMensual(planId, branches, billing) * branches;
}

function cop(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CO');
}

/* Se mantiene por compatibilidad: los pasos 3 y 4 preguntan por el total. */
function calcTotal(planId, branches) {
  return Math.round(montoAhora(planId, branches, BILLING));
}

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  engancharPlan();
  pintarPlan();
  cargarPrecios();       // y cuando lleguen, se vuelve a pintar
  setupDragDrop();
  cargarCuentaCobro();   // la cuenta sale de la consola, no del codigo
});

/* Los precios de verdad. Si la consulta falla no se rompe nada: quedan los de
   arriba, que hoy son los correctos. Lo que NO puede pasar es quedarse con una
   pantalla en blanco o en $0 mientras carga. */
async function cargarPrecios() {
  try {
    var r = await sb.from('pos_planes').select('plan,precio').eq('a_la_venta', true);
    if (r.error || !r.data || !r.data.length) return;
    r.data.forEach(function (p) {
      if (p.precio != null) PRICES[p.plan] = Number(p.precio);
    });
    pintarPlan();
  } catch (e) {
    console.warn('[registro] no se pudieron leer los precios:', e && e.message);
  }
}

// ── Navegación entre pasos ─────────────────────────────────────────────
function goStep(n) {
  hideError();

  /* El paso 1 vive FUERA del modal oscuro: es una pantalla clara completa.
     Por eso no basta con alternar `.reg-step`, hay que tapar o destapar el
     modal entero. */
  var plan  = document.getElementById('plan-root');
  var scrim = document.querySelector('.reg-scrim');
  if (plan)  plan.hidden  = (n !== 1);
  if (scrim) scrim.style.display = (n === 1) ? 'none' : '';

  document.querySelectorAll('.reg-step').forEach(function (el) { el.classList.remove('active'); });
  var step = document.getElementById('step-' + n);
  if (step) step.classList.add('active');

  var items = document.querySelectorAll('.step-item');
  items.forEach(function (el, i) {
    el.classList.remove('active', 'done');
    var num = i + 1;
    if (num < n) el.classList.add('done');
    if (num === n) el.classList.add('active');
  });

  var modal = document.getElementById('reg-modal');
  if (modal) modal.scrollTop = 0;
  var raiz = document.getElementById('plan-root');
  if (raiz) raiz.scrollTop = 0;
}

// ── PASO 1: los controles ─────────────────────────────────────────────
function engancharPlan() {
  var raiz = document.getElementById('plan-root');
  if (!raiz) return;

  raiz.querySelectorAll('[data-branches]').forEach(function (b) {
    b.addEventListener('click', function () { setBranches(parseInt(b.dataset.branches, 10)); });
  });
  var menos = document.getElementById('branch-minus');
  var mas   = document.getElementById('branch-plus');
  if (menos) menos.addEventListener('click', function () { setBranches(BRANCHES - 1); });
  if (mas)   mas.addEventListener('click',   function () { setBranches(BRANCHES + 1); });

  raiz.querySelectorAll('[data-billing]').forEach(function (b) {
    b.addEventListener('click', function () { setBilling(b.dataset.billing); });
  });

  /* La tarjeta entera selecciona, pero el botón de dentro NO puede propagar:
     si lo hiciera, un clic contaría dos veces y la selección parpadearía. */
  raiz.querySelectorAll('.p2-card').forEach(function (card) {
    card.addEventListener('click', function () { selectPlan(card.dataset.plan); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPlan(card.dataset.plan); }
    });
  });
  ['starter', 'pro'].forEach(function (id) {
    var b = document.getElementById('choose-' + id);
    if (b) b.addEventListener('click', function (e) { e.stopPropagation(); selectPlan(id); });
  });

  var verPro = document.getElementById('ver-pro');
  if (verPro) verPro.addEventListener('click', function (e) {
    e.stopPropagation();
    var pro = document.getElementById('card-pro');
    if (pro) pro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    selectPlan('pro');
  });

  var atras = document.getElementById('btn-back');
  if (atras) atras.addEventListener('click', function () { window.location.href = 'login.html'; });
  var seguir = document.getElementById('btn-continue');
  if (seguir) seguir.addEventListener('click', function () { goStep(2); });
}

function selectPlan(planId) {
  if (planId !== 'starter' && planId !== 'pro') return;
  PLAN = planId;
  pintarPlan();
}

function setBranches(n) {
  BRANCHES = Math.max(1, Math.min(99, parseInt(n, 10) || 1));
  pintarPlan();
}

function setBilling(b) {
  if (!PERIODOS[b]) return;
  BILLING = b;
  pintarPlan();
}

/* ── La animación de las cifras ────────────────────────────────────────
   260 ms contando desde el valor anterior hasta el nuevo. Es lo que hace que
   se ENTIENDA que el precio bajó al añadir sucursales o al pasar a anual: un
   número que cambia de golpe se lee como si siempre hubiera dicho eso. */
var _cifras = {};
function animarCifra(el, hasta, colaHtml) {
  if (!el) return;
  var id = el.id || (el.id = 'c' + Math.random().toString(36).slice(2));
  var desde = _cifras[id];
  _cifras[id] = hasta;
  var pinta = function (v) { el.innerHTML = cop(v) + (colaHtml || ''); };
  if (desde == null || desde === hasta || !window.requestAnimationFrame ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    pinta(hasta);
    return;
  }
  var t0 = null, DUR = 260;
  var paso = function (t) {
    if (t0 === null) t0 = t;
    var p = Math.min(1, (t - t0) / DUR);
    var e = 1 - Math.pow(1 - p, 3);          // easeOutCubic
    pinta(desde + (hasta - desde) * e);
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function _ver(id, mostrar) {
  var el = document.getElementById(id);
  if (el) el.hidden = !mostrar;
}
function _txt(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── PASO 1: pintar ────────────────────────────────────────────────────
function pintarPlan() {
  if (!document.getElementById('plan-root')) return;
  var off = tierFor(BRANCHES).off;
  var per = PERIODOS[BILLING];

  // Sucursales
  document.querySelectorAll('[data-branches]').forEach(function (b) {
    b.classList.toggle('on', parseInt(b.dataset.branches, 10) === BRANCHES);
  });
  _txt('branch-count', BRANCHES);

  // Período
  document.querySelectorAll('[data-billing]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.billing === BILLING);
  });

  // Descuento por volumen
  _ver('volume-off', off > 0);
  _txt('volume-off-pct', '−' + Math.round(off * 100) + '%');

  // Las dos tarjetas
  ['starter', 'pro'].forEach(function (id) {
    var base = PRICES[id] || 0;
    var unit = unitMensual(id, BRANCHES, BILLING);
    var card = document.getElementById('card-' + id);
    if (card) card.classList.toggle('on', id === PLAN);

    animarCifra(document.getElementById('price-' + id), unit, '<span class="p2-per">/ mes</span>');
    _txt('perday-' + id, cop(unit / 30));

    var conDescuento = unit < base - 0.5;
    _ver('strike-' + id, conDescuento);
    _txt('strike-' + id, cop(base));

    var pct = Math.round((1 - unit / (base || 1)) * 100);
    _ver('savepill-' + id, pct > 0);
    _txt('savepill-' + id, 'Ahorra ' + pct + '%');

    /* El botón de la tarjeta elegida dice "Seleccionado" con su check; el de la
       otra vuelve a invitar. Sin esto las dos tarjetas se ven iguales y no hay
       manera de saber cuál se está comprando. */
    var btn = document.getElementById('choose-' + id);
    if (btn) {
      btn.innerHTML = (id === PLAN)
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Seleccionado'
        : 'Elegir ' + (id === 'pro' ? 'Pro' : 'Starter');
    }
  });

  // El pie
  var nombrePlan = PLAN === 'pro' ? 'Pro' : 'Starter';
  _txt('foot-plan', nombrePlan);
  _txt('foot-branches', BRANCHES === 1 ? '1 sucursal' : BRANCHES + ' sucursales');
  _txt('foot-billing', per.largo);
  _ver('foot-off', off > 0);
  _txt('foot-off', '−' + Math.round(off * 100) + '%');
  animarCifra(document.getElementById('foot-amount'), montoAhora(PLAN, BRANCHES, BILLING), '');
  _txt('foot-cycle', per.ciclo);
  _ver('foot-eq', BILLING !== 'mensual');
  _txt('foot-eq', '≈ ' + cop(mensualEfectivo(PLAN, BRANCHES, BILLING)) + '/mes');
  _txt('btn-continue-label', 'Continuar con ' + nombrePlan);

  // Y lo que se arrastra a los pasos 3 y 4
  _txt('pay-amount', cop(montoAhora(PLAN, BRANCHES, BILLING)));
  _txt('pay-cycle', per.ciclo);
  _txt('pay-label', BILLING === 'mensual' ? 'Valor a consignar (primer mes)'
                  : BILLING === 'trimestral' ? 'Valor a consignar (primer trimestre)'
                  : 'Valor a consignar (primer año)');
  _txt('pay-plan-name', nombrePlan);
  _txt('pay-branches-txt', (BRANCHES === 1 ? '1 sucursal' : BRANCHES + ' sucursales') + ' · pago ' + per.largo);
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
        /*  `monto_total` es lo que transfiere HOY (el mes, el trimestre o el
            año); `total_ciclo` es a cuánto le sale el mes. Se guardan los dos
            porque responden preguntas distintas: el primero es contra lo que
            se compara el comprobante, el segundo es lo que se compara entre
            clientes. */
        monto_total: total, total_ciclo: Math.round(mensualEfectivo(PLAN, BRANCHES, BILLING)),
        billing: BILLING, comprobante_url: compUrl,
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
  set('conf-total',     cop(total) + ' ' + (PERIODOS[BILLING] || PERIODOS.mensual).ciclo);
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
