/* =====================================================
   login.js — Auth + Registro multi-paso Cobra POS
   pos-core.js ya define: sb, $, COPF, COP
   ===================================================== */

/*  ── Estado de registro ─────────────────────────────────────────────────

    `REG` NO es un objeto nuevo: es el MISMO que lleva planes.js. Los campos
    del plan (plan, branches, billing, totalMes, totalCiclo) los mantiene
    aquel; aqui solo se le cuelgan encima el nombre, el negocio y la clave.

    Se hace asi para que no existan dos verdades: si esta pantalla se copiara
    los valores del plan, bastaria con que alguien tocara un descuento para
    que la pantalla dijera un precio y el registro guardara otro. Es
    exactamente el error que se acaba de corregir entre esta pantalla y la
    pagina de venta.                                                       */
const REG = Object.assign(window.CobraPlan.ESTADO, {
  nombre: '', negocio: '', email: '', pass: '', refCode: ''
});
const PERIODOS = window.CobraPlan.PERIODOS;

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
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    const role = data?.user?.user_metadata?.role || '';
    const esMesero = role === 'mesero' || role === 'cajero' || role === 'cajera';
    window.location.href = esMesero ? 'ventas.html' : 'dashboard.html';
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
  /*  Dos campos, un solo dato hacia adentro. La base guarda `nombre` completo
      y así no hay que tocar el registro, los correos ni la consola: lo que
      cambia es lo que se le PIDE a la persona, no lo que se guarda.        */
  const pila    = $('reg-nombre').value.trim();
  const apellido = ($('reg-apellido') ? $('reg-apellido').value : '').trim();
  const nombre  = (pila + ' ' + apellido).trim();
  const negocio = $('reg-negocio').value.trim();
  const email   = $('reg-email').value.trim();
  const pass    = $('reg-pass').value;
  const pass2   = ($('reg-pass2') ? $('reg-pass2').value : pass);
  const ref     = $('reg-ref').value.trim();
  const terms   = $('chk-terms').classList.contains('on');

  if (!pila || !apellido)
    return showError('datos-error','datos-error-msg','Escribe tu nombre y tu apellido');
  if (!negocio || !email || !pass)
    return showError('datos-error','datos-error-msg','Completa todos los campos obligatorios');
  if (pass.length < 8)
    return showError('datos-error','datos-error-msg','La contraseña debe tener al menos 8 caracteres');
  /*  Se compara ANTES de los términos: si alguien se equivocó al repetirla,
      lo que tiene que arreglar es eso, no marcar una casilla.              */
  if (pass !== pass2)
    return showError('datos-error','datos-error-msg','Las dos contraseñas no son iguales');
  if (!terms)
    return showError('datos-error','datos-error-msg','Debes aceptar los términos de servicio');

  REG.nombre = nombre; REG.negocio = negocio;
  REG.email = email;   REG.pass = pass;
  REG.refCode = ref;

  goStep('plan');
  calcPrices();
}

/* ═══════════════════════════════════════════════════════════════════════════
   PASO 2 — EL PLAN
   ---------------------------------------------------------------------------
   Se mudo entero a `planes.js` el 30-ago-2026, porque la pagina de venta de
   cobrapos.app enseña esta misma pantalla y tenia SUS PROPIAS cuentas: cotizaba
   trimestral −7%% y anual −15%% cuando aqui se cobra −10%% y −20%%, y no aplicaba
   el descuento por sucursales. El cliente veia un precio y pagaba otro.

   Aqui solo queda lo que es del registro: que hacer al continuar.
   ═══════════════════════════════════════════════════════════════════════════ */

//  Los nombres viejos siguen funcionando: los llaman `handleDatos`, el
//  arranque y `abrirSegunEnlace`.
function engancharPlan() {
  window.CobraPlan.enganchar({
    alVolver: function () { goStep('datos'); },
    alContinuar: handlePlanContinue,
    sb: sb
  });
}
function pintarPlan()      { window.CobraPlan.pintar(); }
function calcPrices()      { window.CobraPlan.pintar(); }
function selectPlan(plan)  { window.CobraPlan.seleccionar(plan); }
function cargarPrecios()   { return window.CobraPlan.cargarPrecios(sb); }

// Continuar desde plan → pago
function handlePlanContinue() {
  const per = PERIODOS[REG.billing] || PERIODOS.mensual;
  $('pago-sub').textContent =
    'Plan ' + (REG.plan === 'pro' ? 'Pro' : 'Starter') +
    ' · ' + REG.branches + ' sucursal' + (REG.branches > 1 ? 'es' : '') +
    ' · pago ' + per.largo;
  $('pago-monto').textContent = COPF(REG.totalCiclo);
  goStep('pago');
}

// ── PAGO (paso 3) ────────────────────────────────────
let uploadedFile = null;

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
    /*  ══ EL ENVIO VA POR EL SERVIDOR, NO DESDE AQUI ═════════════════

        Lo que habia aqui insertaba la solicitud directo en `pos_registrations`
        y guardaba la contraseña en texto plano (`password_tmp`), esperando a
        que alguien la aprobara. Tres problemas, y el tercero era mortal:

        · Una contraseña en texto plano en la base es una contraseña regalada.
        · El comprobante se guardaba con `getPublicUrl`, y ese balde dejo de ser
          publico el 24-ago justamente porque lleva datos bancarios.
        · Y escribia en columnas que NO EXISTEN (`password_tmp`, `branches`,
          `total_mes`, `ref_code`). O sea que **nadie podia registrarse**: la
          insercion fallaba siempre. No se habia notado porque todavia no hay
          clientes nuevos, y se habria notado el primer dia de la publicidad.

        Ahora es `provision` → `registrar` quien crea la cuenta con la clave que
        la persona escogio (el sistema de acceso la guarda cifrada y nosotros no
        la vemos nunca) y deja la solicitud esperando aprobacion.             */
    const ext = String(uploadedFile.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    /*  El nombre del archivo NO lleva el correo: esa cadena viajaba dentro de
        la direccion guardada en la base. Al azar, y quien lo tiene que abrir lo
        encuentra por la solicitud. */
    const nom = ((crypto && crypto.randomUUID) ? crypto.randomUUID()
                 : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9)) + '.' + ext;
    const { error: upErr } = await sb.storage.from('comprobantes')
      .upload(nom, uploadedFile, { contentType: uploadedFile.type, upsert: false });
    if (upErr) throw upErr;

    const r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({
        action: 'registrar',
        nombre: REG.nombre, negocio: REG.negocio, email: REG.email, clave: REG.pass,
        plan: REG.plan, sucursales: REG.branches,
        /*  `monto_total` es lo que transfiere HOY (el mes, el trimestre o el
            año); `total_ciclo` es a cuanto le sale el mes. Se guardan los dos
            porque responden preguntas distintas: contra el primero se compara
            el comprobante, el segundo es lo comparable entre clientes. */
        monto_total: Math.round(REG.totalCiclo),
        total_ciclo: Math.round(REG.totalMes),
        billing: REG.billing,
        comprobante_url: nom,
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo completar el registro.');

    /*  ══ VERIFICAR EL PAGO AQUI MISMO ═══════════════════════════

        Sergio, 29-ago-2026: el sistema de verificacion que ya usamos para los
        pagos de los clientes se encarga; y si no puede, sale un aviso de que
        el acceso llega en cuanto se confirme.

        Se espera con un tope: leer el comprobante y buscar en el correo puede
        tomar unos segundos, pero nadie se queda mirando una rueda sin final.
        Si tarda, se sigue igual — la verificacion termina de su lado y el
        correo de bienvenida sale cuando termine.                            */
    txt.innerHTML = '<span class="au-spin"></span> Verificando tu pago…';
    REG.verificado = false;
    try {
      const vr = await Promise.race([
        fetch(SUPABASE_URL + '/functions/v1/verificar-pago-plataforma', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({ registration_id: d.registration_id }),
        }).then(function (x) { return x.json(); }),
        new Promise(function (res) { setTimeout(function () { res({ lento: true }); }, 45000); }),
      ]);
      REG.verificado = !!(vr && vr.verificado && vr.creado);
    } catch (e) {
      /*  Que la verificacion falle NO puede tumbar el registro: la solicitud ya
          esta guardada y Sergio la ve en la consola. Se sigue al aviso.     */
      console.warn('[registro] verificacion:', e && e.message);
    }

    fillConfirm();
    goStep('confirmado');
  } catch(e) {
    btn.disabled = false; txt.textContent = 'Enviar comprobante';
    showError('pago-error','pago-error-msg', e.message || 'Error al enviar');
  }
}

function fillConfirm() {
  const per = PERIODOS[REG.billing] || PERIODOS.mensual;

  /*  Dos finales distintos, y la diferencia importa: uno invita a entrar, el
      otro pide esperar. Ensenar "lo estamos revisando" cuando el pago YA se
      confirmo hace que la gente escriba a preguntar por algo que ya funciona. */
  const t = $('cf-titulo'), sub = $('cf-sub');
  if (REG.verificado) {
    if (t)   t.textContent = '¡Listo! Tu cuenta ya está activa';
    if (sub) sub.textContent = 'Confirmamos tu pago y te mandamos un correo con tus datos de entrada. Ya puedes iniciar sesión.';
  } else {
    /*  El registro SI quedo hecho: lo unico que falta es confirmar el pago.
        Decirle "estamos verificando" a secas deja la duda de si su registro
        se guardo. Sergio, 30-ago: *"igual le dices que el registro es exitoso
        y que espere mientras los asesores aprueban su ingreso"*.

        El sistema reintenta solo cada pocos minutos; si aun asi no cuadra, un
        humano lo revisa desde la consola y con eso le llega el acceso igual. */
    if (t)   t.textContent = '¡Registro exitoso!';
    if (sub) sub.textContent = 'Tu cuenta quedó creada. Estamos confirmando tu pago: apenas quede verificado te llega un correo con tu acceso. Si se demora, uno de nuestros asesores lo revisa y te lo aprueba.';
  }
  $('cf-plan').textContent     = REG.plan === 'pro' ? 'Pro' : 'Starter';
  $('cf-branches').textContent = REG.branches + ' sucursal' + (REG.branches > 1 ? 'es' : '');
  $('cf-ciclo').textContent    = per.largo.charAt(0).toUpperCase() + per.largo.slice(1);
  $('cf-monto').textContent    = COPF(REG.totalCiclo) + ' ' + per.ciclo;
  $('cf-email').textContent    = REG.email;
}


/* ══ LA CUENTA A LA QUE SE TRANSFIERE ═══════════════════════════

   Sale de `plataforma_cobro`, la tabla que Sergio edita en Consola → Cobro.
   Antes estaba escrita a mano en el HTML, con un titular que ni siquiera era
   el suyo: cambiarla en la consola no cambiaba nada aquí.

   Si la consulta falla NO se deja la caja vacía: sin la cuenta a la vista, la
   persona no tiene a dónde transferir y el registro se muere ahí. Se avisa y
   se le pide que escriba.                                                   */
var CUENTA = null;

/*  Agrupar de a tres deja un digito solo al final en las llaves de 10
    ("009 257 122 5"), que se lee como si sobrara un numero. Cuando el ultimo
    grupo queda de uno, se pega al anterior: "009 257 1225".  */
function _agrupar(n) {
  var s = String(n || '').replace(/\D/g, '');
  if (!s) return String(n || '');
  var g = s.replace(/(\d{3})(?=\d)/g, '$1 ').split(' ');
  if (g.length > 1 && g[g.length - 1].length === 1) {
    g[g.length - 2] += g.pop();
  }
  return g.join(' ');
}

function _fmtNumeroCuenta(n) { return _agrupar(n); }

function pintarCuenta() {
  var caja = $('pay-datos');
  if (!caja) return;
  if (!CUENTA) {
    caja.innerHTML = '<div class="bank-row"><span class="bank-key">No pudimos cargar los datos de pago.'
      + ' Escríbenos y te los pasamos.</span></div>';
    return;
  }
  var esLlave = /llave/i.test(CUENTA.tipo || '');
  var num = _fmtNumeroCuenta(CUENTA.numero);
  var esc = function (t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var fila = function (k, v) {
    return '<div class="bank-row"><span class="bank-key">' + esc(k) + '</span>'
         + '<span class="bank-val">' + esc(v) + '</span></div>';
  };

  var h = '';
  if (CUENTA.banco)  h += fila('Banco', CUENTA.banco);
  h += '<div class="bank-row"><span class="bank-key">' + esc(esLlave ? 'Llave' : 'Cuenta') + '</span>'
     + '<span class="bank-val" style="display:flex;align-items:center;gap:8px">' + esc(num)
     + '<button type="button" class="bank-copy-btn" id="pay-copiar">'
     + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
     + 'Copiar</button></span></div>';
  if (CUENTA.titular) h += fila('Titular', CUENTA.titular);
  if (CUENTA.nota)    h += fila('Nota', CUENTA.nota);
  caja.innerHTML = h;

  /*  El botón copia el número LIMPIO, sin los espacios que le pusimos para
      que se lea: pegar «009 257 1225» en la app del banco no sirve.  */
  var bc = $('pay-copiar');
  if (bc) bc.addEventListener('click', function () {
    copyText(String(CUENTA.numero || '').replace(/\s/g, ''));
  });
}

function _verPago(cual) {
  var datos = $('pay-datos'), qr = $('pay-qr');
  if (datos) datos.hidden = (cual === 'qr');
  if (qr) qr.hidden = (cual !== 'qr');
  /*  Para los navegadores que todavía no entienden `:has()`. El CSS hace lo
      mismo por su cuenta donde sí lo entiende.  */
  var caja = $('bank-card');
  if (caja) caja.classList.toggle('con-qr', cual === 'qr');
  document.querySelectorAll('.pay-tab').forEach(function (b) {
    b.classList.toggle('on', b.dataset.pay === cual);
  });
}

async function cargarCuentaCobro() {
  try {
    var r = await sb.from('plataforma_cobro')
      .select('banco,tipo,numero,titular,nota,qr_url').eq('id', 1).maybeSingle();
    if (!r.error && r.data) CUENTA = r.data;
  } catch (e) { console.warn('[pago] cuenta:', e && e.message); }

  pintarCuenta();

  /*  Las pestañas solo si hay QR. Con un solo medio de pago, una pestaña sola
      es un botón que no decide nada.  */
  var hayQr = !!(CUENTA && CUENTA.qr_url);
  var tabs = $('pay-tabs');
  if (tabs) tabs.hidden = !hayQr;
  if (hayQr) {
    var img = $('pay-qr-img');
    if (img) img.src = CUENTA.qr_url;
    tabs.querySelectorAll('.pay-tab').forEach(function (b) {
      b.addEventListener('click', function () { _verPago(b.dataset.pay); });
    });
  }
  _verPago('llave');
}


/* ══ LA PORTADA QUE ROTA ═════════════════════════════════

   Ocho escenas: el asistente contestando el WhatsApp, tomar el pedido, el
   cierre de caja, la carta armandose sola, la ruta del domiciliario, la
   cocina en vivo, los puntos y las transferencias confirmandose.

   ⚠️ Ojo con los ejemplos: los platos y las direcciones son INVENTADOS a
   proposito. Aqui no va la carta de El Parche — esta portada la ve un
   heladero o una cafeteria. Y el asistente no se llama Paco: Paco es el
   nombre que Sergio le puso al SUYO, cada restaurante le pone el que quiera.

   Tres cuidados, y los tres son por la misma razon —esta pantalla la abre un
   cliente cada manana y no puede pesar:

   1. Se APAGA cuando la pestana no se ve. Un temporizador corriendo en una
      pestana de fondo gasta bateria por nada.
   2. Se apaga tambien si la persona pidio menos movimiento en su sistema.
   3. Si el panel no esta (en el celular se esconde), no arranca nada.        */
(function () {
  /*  Con siete escenas, 7 s cada una son 49 s de vuelta completa: casi nadie
      esta tanto rato en la pantalla de entrar. A 6 s se alcanzan a ver mas
      cosas sin que ninguna se sienta apurada.  */
  var VELOCIDAD = 6000;
  var esc = document.querySelectorAll('.bp-esc');
  if (esc.length < 2) return;

  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*  ¿Este navegador esta dibujando cuadros?

      `requestAnimationFrame` no corre en todas partes. Si no corre, las
      animaciones se congelan a MEDIAS: la ruta del domiciliario queda
      dibujada hasta la mitad, la barra de puntos a medio llenar. Eso no se lee
      como «sin animacion», se lee como «pagina rota».

      Se comprueba una sola vez, al arrancar, con un margen generoso: si en
      400 ms no hubo dos cuadros, aqui no se anima nada. Es preferible una
      portada quieta y correcta a una a medio dibujar.                       */
  (function () {
    var cuadros = 0;
    function tic() { cuadros++; if (cuadros < 2) requestAnimationFrame(tic); }
    requestAnimationFrame(tic);
    setTimeout(function () {
      if (cuadros < 2) {
        var panel = document.querySelector('.brand-panel');
        if (panel) panel.classList.add('sin-animacion');
      }
    }, 400);
  })();
  var puntos = document.querySelectorAll('.bp-punto');
  var actual = 0, reloj = null;

  function pintar(n) {
    if (n === actual) return;
    var antes = esc[actual];
    antes.classList.add('saliendo');
    antes.classList.remove('on');
    setTimeout(function () { antes.classList.remove('saliendo'); }, 520);
    actual = n;
    esc[actual].classList.add('on');
    for (var i = 0; i < puntos.length; i++) puntos[i].classList.toggle('on', i === actual);
    contar(esc[actual]);
    rescatarItems(esc[actual]);
  }

  /*  ⚠️ LA MISMA RED QUE LAS CIFRAS, POR LA MISMA RAZÓN.

      Los platos de la escena de la carta entran de a uno con una animación
      que empieza en invisible (`both`, para que no parpadeen antes de su
      turno). Si el navegador no corre animaciones —pestaña de fondo, vista
      incrustada— se quedan en invisible: la tarjeta se ve VACÍA, que es peor
      que verla sin animación.

      A los 1,6 s se comprueba si de verdad se ven. Si no, se le quita la
      animación al elemento y cae a su estilo normal, que es visible.       */
  function rescatarItems(seccion) {
    /*  `.anima` marca todo lo que entra con una animacion que empieza
        escondida: los platos de la carta, las comandas de la cocina, la ruta
        del mapa y la barra de puntos. Si el navegador no las corre, todas
        esas se quedarian invisibles.  */
    var items = seccion.querySelectorAll('.rp-item, .anima');
    if (!items.length) return;
    setTimeout(function () {
      var congelado = false;
      for (var i = 0; i < items.length; i++) {
        if (getComputedStyle(items[i]).opacity === '0') {
          items[i].style.animation = 'none';
          congelado = true;
        }
      }
      /*  Si una se quedo pegada, TODAS las de esta escena estan pegadas: es el
          navegador, no un elemento. Hay que apagar tambien las que se van
          (`.anima-fuera`) — si no, el sello de «Verificando…» se
          quedaria encima del de «Confirmado», los dos a la vez.  */
      if (congelado) {
        var fuera = seccion.querySelectorAll('.anima-fuera');
        for (var j = 0; j < fuera.length; j++) fuera[j].style.animation = 'none';
      }
    }, 1600);
  }

  /*  Las cifras del cierre de caja SUMANDO, que es lo que pidio Sergio: el
      numero sube hasta el total en vez de aparecer puesto. Se anima cada vez
      que la escena vuelve, no una sola vez.                                */
  function contar(seccion) {
    var cifras = seccion.querySelectorAll('.cifra');
    for (var i = 0; i < cifras.length; i++) (function (el) {
      var hasta = Number(el.dataset.a) || 0, ini = null, DUR = 1100, listo = false;
      /*  El signo se puede quitar: los puntos de un cliente no son pesos. Con
          `data-pre=""` la cifra sale pelada.  */
      var pre = (el.dataset.pre !== undefined) ? el.dataset.pre : '$';
      var final = pre + hasta.toLocaleString('es-CO');

      function poner(v) { el.textContent = pre + Math.round(v).toLocaleString('es-CO'); }

      function paso(t) {
        if (listo) return;
        if (ini === null) ini = t;
        var k = Math.min(1, (t - ini) / DUR);
        /*  Frena al final en vez de ir a ritmo parejo: un numero que se
            detiene de golpe se ve como un error de dibujo.  */
        poner(hasta * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(paso); else listo = true;
      }

      /*  ⚠️ RED DE SEGURIDAD (comprobado el 29-ago-2026).

          `requestAnimationFrame` NO corre en todas partes: una pestana de
          fondo, una vista incrustada o el .exe en cierto estado lo frenan. Sin
          esta red, la cifra se quedaba en el $0 con el que arranca la cuenta
          — y una pantalla de ventas que dice CERO no se lee como
          "todavia no cargo", se lee como "no vendiste nada".

          Asi que a los 1,6 s, si la cuenta no termino, se pone el numero de
          verdad. Se pierde la animacion, nunca el dato.                     */
      poner(0);
      requestAnimationFrame(paso);
      setTimeout(function () { if (!listo) { listo = true; el.textContent = final; } }, 1600);
    })(cifras[i]);
  }

  function arrancar() {
    if (reloj || quieto) return;
    reloj = setInterval(function () { pintar((actual + 1) % esc.length); }, VELOCIDAD);
  }
  function parar() { if (reloj) { clearInterval(reloj); reloj = null; } }

  for (var i = 0; i < puntos.length; i++) (function (b) {
    b.addEventListener('click', function () {
      parar(); pintar(Number(b.dataset.ir) || 0); arrancar();
    });
  })(puntos[i]);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) parar(); else arrancar();
  });

  contar(esc[0]);
  rescatarItems(esc[0]);
  arrancar();
})();

// ── Enter key ────────────────────────────────────────
/*  ══ LLEGAR DIRECTO AL REGISTRO ═══════════════════════════════════════

    La portada de cobrapos.app tiene dos botones que dicen "Empezar con
    Starter" y "Empezar con Pro". Alguien que aprieta uno de esos YA decidio
    cual quiere: hacerlo aterrizar en la pantalla de iniciar sesion, buscar
    "Crear una cuenta" y volver a escoger el mismo plan es perder gente en el
    unico paso que de verdad importa.

    Por eso esta pantalla entiende dos cosas que le llegan por la direccion:
      login.html?plan=pro       -> abre el registro con Pro ya marcado
      login.html?registro=1     -> abre el registro

    Sin nada, abre en iniciar sesion, que es como entra todos los dias quien
    ya es cliente.                                                          */
function abrirSegunEnlace() {
  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }

  //  Sucursales y periodo tambien viajan: si alguien ya movio los controles
  //  en la pagina de precios, llegar aqui y encontrarlos en 1 y mensual es
  //  hacerle repetir el trabajo.
  var sedes = parseInt(q.get('sedes'), 10);
  if (sedes >= 1) REG.branches = Math.min(99, sedes);
  var periodo = (q.get('billing') || '').toLowerCase();
  if (PERIODOS[periodo]) REG.billing = periodo;

  var plan = (q.get('plan') || '').toLowerCase();
  if (plan === 'starter' || plan === 'pro') {
    selectPlan(plan);          // pinta de paso, con lo de arriba ya puesto
    goStep('datos');
    return;
  }
  if (q.has('registro') || sedes >= 1 || PERIODOS[periodo]) {
    pintarPlan();
    goStep('datos');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  // estado inicial
  engancharPlan();
  pintarPlan();
  cargarPrecios();   // y cuando lleguen los de la base, se vuelve a pintar
  cargarCuentaCobro();  // la cuenta a la que se transfiere, desde la consola

  //  Al final: primero queda todo enganchado y pintado, y solo entonces se
  //  mueve la pantalla a donde pide la direccion.
  abrirSegunEnlace();
});
