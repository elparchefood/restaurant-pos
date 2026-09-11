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
  $('view-transferencia').hidden = (step !== 'transferencia');
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
    //  Sin restaurante todavia: puede ser un cliente nuevo al que Cobra le
    //  habilito pagar por transferencia (el extintor, 11-sep-2026).
    if (!((data && data.user && data.user.user_metadata) || {}).tenant_id && await transferenciaSiToca(data.user)) {
      btn.disabled = false; txt.textContent = 'Iniciar sesión';
      return;
    }
    const role = data?.user?.user_metadata?.role || '';
    const esMesero = role === 'mesero' || role === 'cajero' || role === 'cajera';
    window.location.href = esMesero ? 'ventas.html' : 'dashboard.html';
  } catch(e) {
    btn.disabled = false; txt.textContent = 'Iniciar sesión';
    showError('login-error','login-error-msg', e.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : (e.message || 'Error al iniciar sesión'));
  }
}

/*  ══ ENTRAR CON GOOGLE O CON FACEBOOK ═══════════════════════════════════

    Los dos botones hacen lo mismo con distinto proveedor: una sola funcion y
    dos nombres, que son los que llama el HTML.

    LA VUELTA ES AQUI, no a `dashboard.html`. Hace falta un sitio donde mirar
    quien volvio: el boton lo puede tocar cualquiera que tenga cuenta de
    Google, y quien no tenga restaurante en Cobra no puede quedarse dentro de
    la aplicacion. Antes mandaba a todo el mundo al tablero.               */
const RED_NOMBRE = { google: 'Google', facebook: 'Facebook' };

/*  ¿EL BOTON QUE TOCARON ERA EL DE REGISTRARSE? Los dos paneles llaman a la
    misma funcion, asi que se mira cual esta a la vista. Y se apunta antes de
    salir del sitio: se vuelve a esta misma pestana, asi que `sessionStorage`
    lo conserva sin ensuciar la direccion con parametros.                  */
const RED_MARCA = 'cobra-registro-con-red';

async function entrarConRed(proveedor) {
  try {
    const enRegistro = !!($('view-datos') && !$('view-datos').hidden);
    try { sessionStorage.setItem(RED_MARCA, enRegistro ? '1' : ''); } catch (e) {}
    const { error } = await sb.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  } catch (e) {
    /*  Cuando el proveedor no esta encendido, el mensaje que llega es
        "Unsupported provider: provider is not enabled" — que no le dice nada
        a nadie. Se traduce a algo que se pueda leer y que ademas diga que
        hacer mientras tanto.                                             */
    const crudo = String((e && e.message) || e);
    showToast(/not enabled|Unsupported provider/i.test(crudo)
      ? 'Entrar con ' + (RED_NOMBRE[proveedor] || proveedor) +
        ' todavía no está disponible. Entra con tu correo y contraseña.'
      : 'No se pudo entrar con ' + (RED_NOMBRE[proveedor] || proveedor) + ': ' + crudo);
  }
}

async function handleGoogleLogin()   { return entrarConRed('google'); }
async function handleFacebookLogin() { return entrarConRed('facebook'); }

/*  ══ LA VUELTA DE GOOGLE / FACEBOOK ═════════════════════════════════════

    ⚠️ LA SESION HAY QUE RECOGERLA A MANO. `pos-nucleo.js` crea el cliente con
    `detectSessionInUrl: false` —a proposito, para que ninguna otra pantalla
    se ponga a leer direcciones— asi que la libreria NO toma sola el token que
    el proveedor devuelve. Sin esto, la persona volvia con el token a la vista
    en la barra del navegador y sin sesion: el boton "funcionaba" y no entraba
    nadie. Es el tipo de fallo que no se ve hasta que hay credenciales, por eso
    queda escrito aqui.

    La libreria de este proyecto (supabase-js 2.112, flujo `implicit`) devuelve
    `#access_token=...&refresh_token=...`. Con esos dos se arma la sesion.

    Devuelve true si esto ERA una vuelta, para que el arranque normal de la
    pantalla no se meta encima.                                            */
async function volverDeRed() {
  const hash = window.location.hash || '';
  const bus  = window.location.search || '';
  const hayError = /[?&#]error(_description)?=/.test(hash + bus);
  const trae = new URLSearchParams(hash.replace(/^#/, ''));
  const at = trae.get('access_token'), rt = trae.get('refresh_token');
  if (!hayError && !at) return false;

  /*  La direccion se limpia SIEMPRE y lo primero: un token a la vista en la
      barra queda tambien en el historial del navegador.                  */
  window.history.replaceState({}, '', window.location.origin + window.location.pathname);
  goStep('login');

  if (hayError) {
    const p = new URLSearchParams((bus.replace(/^\?/, '') + '&' + hash.replace(/^#/, '')));
    const d = (p.get('error_description') || p.get('error') || '').replace(/\+/g, ' ');
    /*  "Cancelé" viene en el CODIGO (`error=access_denied`,
        `error_reason=user_denied`), no en el texto — que en Facebook llega
        como "Permissions error" y se leia como una averia nuestra.      */
    const codigo = (p.get('error') || '') + ' ' + (p.get('error_reason') || '');
    showToast(/denied/i.test(codigo + ' ' + d) ? 'Cancelaste la entrada.'
                                : 'No se pudo entrar: ' + (d || 'el proveedor no aceptó'));
    return true;
  }

  try {
    const { error } = await sb.auth.setSession({ access_token: at, refresh_token: rt || '' });
    if (error) throw error;
    const { data } = await sb.auth.getUser();
    const u = data && data.user;
    if (!u) throw new Error('no llegó la cuenta');
    const meta = u.user_metadata || {};
    const red = RED_NOMBRE[(u.app_metadata || {}).provider] || 'esa cuenta';

    /*  SIN RESTAURANTE NO SE ENTRA. Con correo y contraseña esto casi no
        pasa —la cuenta solo existe si alguien se registro—, pero con Google
        lo puede intentar cualquier persona del mundo. Se cierra la sesion en
        vez de dejarla a medias dentro de la aplicacion.                   */
    if (!meta.tenant_id) {
      /*  VENIA A REGISTRARSE. Entonces NO se cierra la sesion: se sigue el
          registro de siempre con lo que el proveedor ya sabe —su nombre y su
          correo— y sin pedirle contrasena. Antes acababa aqui con la sesion
          cerrada y un mensaje diciendole que se registrara: el boton de
          registrarse le decia que se registrara.                         */
      let queria = '';
      try { queria = sessionStorage.getItem(RED_MARCA) || ''; sessionStorage.removeItem(RED_MARCA); } catch (e) {}
      if (queria === '1') { arrancarRegistroConRed(u, red); return true; }
      //  O vuelve a pagar por transferencia lo que no pudo pagar con Wompi.
      if (await transferenciaSiToca(u)) return true;

      /*  Y si venia a ENTRAR, no se queda dentro. Con correo y contrasena
          este caso casi no existe —la cuenta solo existe si alguien se
          registro—; con Google lo puede intentar el mundo entero.        */
      await sb.auth.signOut();
      showError('login-error', 'login-error-msg',
        'Entraste con ' + red + ', pero ese correo todavía no tiene un restaurante en Cobra. ' +
        'Regístrate y te lo activamos.');
      return true;
    }
    try { sessionStorage.removeItem(RED_MARCA); } catch (e) {}
    const role = meta.role || '';
    const esMesero = role === 'mesero' || role === 'cajero' || role === 'cajera';
    window.location.href = esMesero ? 'ventas.html' : 'dashboard.html';
  } catch (e) {
    showError('login-error', 'login-error-msg',
      'No se pudo completar la entrada: ' + ((e && e.message) || e));
  }
  return true;
}

/*  ══ SEGUIR EL REGISTRO CON LO QUE YA SABE EL PROVEEDOR ══════════════════

    Se llena el nombre y el correo, se esconde la contrasena y se deja el
    correo en solo lectura: el servidor va a usar el del token y no el que
    diga la pantalla, asi que dejarlo editable seria enseñar una mentira.

    Lo demas del registro no cambia NADA: el negocio, el plan, las sedes y el
    pago se piden igual. Identificarse no es pagar.                        */
function arrancarRegistroConRed(u, red) {
  const meta = u.user_metadata || {};
  const completo = String(meta.full_name || meta.name || '').trim();
  const partes = completo ? completo.split(/\s+/) : [];

  REG.porRed = true;
  REG.red    = red;          // para poder nombrarlo si algo sale mal despues
  REG.email  = String(u.email || '').trim().toLowerCase();

  if ($('reg-nombre')   && partes.length) $('reg-nombre').value   = partes[0];
  if ($('reg-apellido') && partes.length > 1) $('reg-apellido').value = partes.slice(1).join(' ');
  /*  ══ EL CORREO DE GOOGLE NO SE TOCA ════════════════════════════════════

      Sergio, 8-sep: *"una persona se puede autenticar con un correo de Google,
      luego ahi lo edita y pone otro, y luego no va a saber con que ingresar,
      porque al autenticarse con Google no va a crear una contraseña... al
      cambiar de correo queda como en el aire"*.

      Exacto: quien entra por Google NO TIENE CONTRASEÑA. Su unica llave es
      esa cuenta de Google. Si el correo de la pantalla fuera otro, quedaria
      con un correo que no puede abrir y sin clave con que entrar.

      El servidor ya se protegia solo —usa el correo del TOKEN, nunca el del
      cuerpo—, asi que el riesgo no era de seguridad: era que la pantalla
      enseñara una cosa y pasara otra. Y esa es justo la regla de la casa: lo
      que se ve tiene que ser lo que sale.

      `readOnly` ya estaba, pero un campo en solo lectura SE VE IGUAL que uno
      normal — se puede hacer clic, sale el cursor, parece que se puede
      escribir. Por eso ahora ademas se ve apagado y lo dice debajo.        */
  if ($('reg-email')) {
    var ce = $('reg-email');
    ce.value = REG.email;
    ce.readOnly = true;
    ce.tabIndex = -1;
    ce.style.background = '#F1F5F9';
    ce.style.color = '#64748B';
    ce.style.cursor = 'not-allowed';
    ce.title = 'Es el correo de tu cuenta de ' + red;
    if (!$('reg-email-nota') && ce.parentNode) {
      var nota = document.createElement('div');
      nota.id = 'reg-email-nota';
      nota.style.cssText = 'display:flex;align-items:flex-start;gap:6px;margin-top:6px;'
        + 'font-size:12px;color:#64748B;line-height:1.45';
      nota.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-top:1px">'
        + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        + '<span>Con este correo vas a entrar a Cobra. Lo pone ' + red + ', por eso no se cambia.</span>';
      ce.parentNode.insertBefore(nota, ce.nextSibling);
    }
  }
  if ($('reg-fila-clave')) $('reg-fila-clave').hidden = true;
  if ($('reg-por-red'))    $('reg-por-red').hidden = false;
  if ($('reg-red-nombre')) $('reg-red-nombre').textContent = red;

  goStep('datos');
  showToast('Listo, ' + red + ' ya te identificó. Solo faltan los datos de tu restaurante.');
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
  /*  Con Google o Facebook manda el correo del proveedor, no el del campo:
      el campo esta bloqueado, pero si algun dia se desbloqueara por error, la
      cuenta se crearia con un correo que esa persona no puede abrir — y sin
      contraseña con que entrar. El servidor usa el del token de todos modos;
      esto hace que la pantalla diga lo mismo.                             */
  const email   = REG.porRed && REG.email ? REG.email : $('reg-email').value.trim();
  const pass    = $('reg-pass').value;
  const pass2   = ($('reg-pass2') ? $('reg-pass2').value : pass);
  const ref     = $('reg-ref').value.trim();
  const terms   = $('chk-terms').classList.contains('on');

  if (!pila || !apellido)
    return showError('datos-error','datos-error-msg','Escribe tu nombre y tu apellido');
  if (!negocio || !email || (!pass && !REG.porRed))
    return showError('datos-error','datos-error-msg','Completa todos los campos obligatorios');
  /*  Quien llega por Google o Facebook no tiene contrasena que revisar: su
      proveedor ya lo identifico y el campo ni siquiera esta a la vista.  */
  if (!REG.porRed) {
    if (pass.length < 8)
      return showError('datos-error','datos-error-msg','La contraseña debe tener al menos 8 caracteres');
    /*  Se compara ANTES de los términos: si alguien se equivocó al repetirla,
        lo que tiene que arreglar es eso, no marcar una casilla.            */
    if (pass !== pass2)
      return showError('datos-error','datos-error-msg','Las dos contraseñas no son iguales');
  }
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
  /*  El resumen del cobro automatico. Se dice lo que se cobra HOY y lo que se
      cobrara despues, con el periodo por delante: quien va a autorizar un
      cobro que se repite tiene derecho a saber cada cuanto.               */
  if ($('cobro-plan')) {
    $('cobro-plan').textContent = (REG.plan === 'pro' ? 'Pro' : 'Starter')
      + ' · ' + REG.branches + ' sucursal' + (REG.branches > 1 ? 'es' : '');
    $('cobro-monto').textContent = COPF(REG.totalCiclo);
    var cada = REG.billing === 'anual' ? 'cada año'
             : REG.billing === 'trimestral' ? 'cada 3 meses' : 'cada mes';
    $('cobro-luego').textContent = COPF(REG.totalCiclo) + ' ' + cada;
  }
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

/*  ══ ACTIVAR EL COBRO AUTOMATICO ════════════════════════════════════════════

    El orden importa y no es el de antes. La solicitud se crea PRIMERO, sin
    comprobante, porque el medio de pago se le cuelga a ella — al registrarse
    todavia no hay restaurante al que colgarselo.

      1. se crea la solicitud
      2. se entra con la cuenta que acaba de nacer (o ya se entro, si vino
         por Google o Facebook)
      3. se autoriza el medio y se cobra el primer periodo
      4. el aviso firmado de Wompi crea el restaurante — no esta pantalla

    El paso 4 pasa en el servidor y puede tardar unos segundos, asi que aqui
    se espera mirando la cuenta, no adivinando.                             */
async function handleCobroAuto() {
  const btn = $('btn-cobro'), txt = $('btn-cobro-text');
  btn.disabled = true; txt.innerHTML = '<span class="au-spin"></span> Preparando…';
  try {
    //  1. la solicitud, si no se creo ya (se puede volver a intentar sin
    //     duplicarla: `registrar` rechaza una segunda con el mismo correo)
    if (!REG.registrationId) {
      let cabecera = {};
      if (REG.porRed) {
        const { data: ses } = await sb.auth.getSession();
        const tk = ses && ses.session && ses.session.access_token;
        if (!tk) throw new Error('Se cerró la sesión. Vuelve a tocar el botón de ' + (REG.red || 'tu cuenta') + '.');
        cabecera = { 'Authorization': 'Bearer ' + tk };
      }
      const r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY }, cabecera),
        body: JSON.stringify({
          action: 'registrar',
          nombre: REG.nombre, negocio: REG.negocio, email: REG.email, clave: REG.pass,
          plan: REG.plan, sucursales: REG.branches,
          monto_total: Math.round(REG.totalCiclo), total_ciclo: Math.round(REG.totalMes),
          billing: REG.billing,
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo completar el registro.');
      REG.registrationId = d.registration_id;
      REG.tokenEntrar = d.token_entrar || '';
    }

    /*  2. ENTRAR CON LA CUENTA RECIEN CREADA, para que el servidor sepa de
        quien es la solicitud. Quien vino por Google o Facebook ya tiene
        sesion y no pasa por aqui.

        Se canjea el token que devolvio el registro: eso confirma el correo y
        abre la sesion de una. Con contraseña NO se puede — la cuenta nace sin
        confirmar a proposito, y el sistema de acceso responde "Email not
        confirmed". Sergio lo vio probando el registro de verdad.

        Si el token no llegara, se intenta con la contraseña igual: para una
        cuenta ya confirmada (alguien que reintenta) eso sí funciona.       */
    if (!REG.porRed) {
      let entro = false;
      if (REG.tokenEntrar) {
        const { error } = await sb.auth.verifyOtp({ token_hash: REG.tokenEntrar, type: 'signup' });
        entro = !error;
        if (error) console.warn('[registro] el token no sirvió:', error.message);
      }
      if (!entro) {
        const { error } = await sb.auth.signInWithPassword({ email: REG.email, password: REG.pass });
        if (error) throw new Error('La cuenta se creó pero no se pudo entrar: ' + error.message);
      }
    }

    btn.disabled = false; txt.textContent = 'Pagar';

    //  Si Cobra le habilito la transferencia (el extintor), va por ahi.
    if (await transferenciaSiToca()) return;

    //  3. autorizar y cobrar
    posSuscripcion.abrir({
      monto: Math.round(REG.totalCiclo),
      cobrarYa: true,
      periodo: REG.billing,
      alTerminar: function (r) { esperarLaCuenta(r); }
    });
  } catch (e) {
    btn.disabled = false; txt.textContent = 'Pagar';
    showError('pago-error', 'pago-error-msg', e.message || String(e));
  }
}

/*  El cobro sale aprobado en segundos, pero quien crea el restaurante es el
    aviso firmado de Wompi, que llega por su cuenta. Asi que se mira la cuenta
    hasta que aparezca — con un tope, porque nadie se queda viendo una rueda
    sin final. Si tarda, no se pierde nada: la cuenta se crea igual y el correo
    de bienvenida sale cuando termine.                                      */
async function esperarLaCuenta(res) {
  const btn = $('btn-cobro'), txt = $('btn-cobro-text');
  btn.disabled = true;
  const cobro = (res && res.cobro) || {};
  if (cobro.error) {
    btn.disabled = false;
    showError('pago-error', 'pago-error-msg',
      'Tu medio de pago quedó guardado, pero el cobro no pasó: ' + cobro.error +
      ' Puedes intentarlo otra vez sin volver a escribir nada.');
    return;
  }
  const caja = $('cobro-listo');
  if (caja) {
    caja.hidden = false;
    $('cobro-listo-txt').innerHTML = 'Pago recibido. Estamos activando tu cuenta…';
  }
  txt.innerHTML = '<span class="au-spin"></span> Activando tu cuenta…';

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const { data } = await sb.auth.refreshSession();
      const meta = (data && data.user && data.user.user_metadata) || {};
      if (meta.tenant_id) { window.location.href = 'dashboard.html'; return; }
    } catch (e) { /* un tropiezo de red no cancela la espera */ }
  }
  //  Si no aparecio en un minuto, NO se dice que fallo: se dice la verdad.
  btn.disabled = true;
  txt.textContent = 'Tu pago quedó registrado';
  if (caja) $('cobro-listo-txt').innerHTML =
    'Tu pago quedó registrado. La cuenta se está activando y te avisamos por correo ' +
    'en cuanto esté lista — normalmente es cuestión de minutos.';
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

    /*  SI SE REGISTRO CON GOOGLE O FACEBOOK, VA SU SESION. El servidor la usa
        para dos cosas: saber que la cuenta de acceso YA existe (y no intentar
        crear otra, que era un 409 seguro) y quedarse con el correo del token
        en vez del que diga la pantalla.                                    */
    let cabecera = {};
    if (REG.porRed) {
      const { data: ses } = await sb.auth.getSession();
      const tk = ses && ses.session && ses.session.access_token;
      if (!tk) throw new Error('Se cerró la sesión de ' + (REG.red || 'tu cuenta') + '. Vuelve a tocar el botón.');
      cabecera = { 'Authorization': 'Bearer ' + tk };
    }
    const r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY }, cabecera),
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

/* ══ EL CLIENTE NUEVO QUE PAGA POR TRANSFERENCIA (el extintor, 11-sep-2026) ══

   Quien se registro y no pudo pagar con Wompi le pide ayuda a Sergio; el le
   enciende la transferencia desde su panel y a esta persona le llega un
   correo. Al volver a entrar —con su correo o con Google— todavia no hay
   restaurante: hay una solicitud pendiente. Con el permiso, ve la cuenta,
   sube el comprobante y el lector de siempre lo verifica solo.

   Lo decide el servidor (`provision` → `registro_estado`): esta pantalla no
   sabe de permisos, solo pinta lo que le dicen.                           */
let TR = null;

function _escTr(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function transferenciaSiToca(usuario) {
  try {
    const { data: ses } = await sb.auth.getSession();
    const tk = ses && ses.session && ses.session.access_token;
    if (!tk) return false;
    const r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + tk },
      body: JSON.stringify({ action: 'registro_estado' })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.pendiente || !d.transferencia) return false;
    TR = d;
    TR.email = (usuario && usuario.email) || (ses.session.user && ses.session.user.email) || REG.email || '';
    mostrarTransferencia(d);
    return true;
  } catch (e) {
    console.warn('[registro] transferencia:', e && e.message);
    return false;
  }
}

function mostrarTransferencia(d) {
  const c = d.cuenta || {};
  const fila = (k, v) => v
    ? '<div class="bank-row"><span class="bank-key">' + _escTr(k) + '</span><span class="bank-val">' + _escTr(v) + '</span></div>'
    : '';
  $('tr-sub').textContent = 'Cobra habilitó el pago por transferencia para ' + (d.negocio || 'tu registro') +
    '. Transfiere el valor exacto y sube el comprobante: lo verificamos solos.';
  $('tr-card').innerHTML =
    fila(c.banco || 'Cuenta', c.tipo) + fila('Titular', c.titular) +
    fila('Número', c.numero ? _agrupar(c.numero) : '') +
    (c.nota ? '<div class="bank-row"><span class="bank-key">' + _escTr(c.nota) + '</span></div>' : '') +
    '<div class="bank-row"><span class="bank-key">Monto a pagar</span><span class="bank-monto">' + COPF(d.monto || 0) + '</span></div>';
  goStep('transferencia');
}

function trArchivo(file) {
  if (!file || !TR) return;
  if (file.size > 5 * 1024 * 1024) return showToast('Archivo demasiado grande (máx 5 MB)');
  TR.archivo = file;
  $('tr-zone').classList.add('has-file');
  $('tr-zone-text').textContent = file.name;
  $('btn-tr').disabled = false;
}

async function handleTransferencia() {
  if (!TR || !TR.archivo) return;
  const btn = $('btn-tr'), txt = $('btn-tr-text');
  btn.disabled = true; txt.innerHTML = '<span class="au-spin"></span> Subiendo…';
  try {
    const f = TR.archivo;
    //  Nombre al azar: un comprobante lleva datos bancarios (misma regla que
    //  el registro y la cuenta suspendida).
    const ext = String(f.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const nom = ((crypto && crypto.randomUUID) ? crypto.randomUUID()
                 : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9)) + '.' + ext;
    const { error: upErr } = await sb.storage.from('comprobantes').upload(nom, f, { contentType: f.type, upsert: false });
    if (upErr) throw upErr;

    const { data: ses } = await sb.auth.getSession();
    const tk = ses && ses.session && ses.session.access_token;
    if (!tk) throw new Error('Se cerró tu sesión. Vuelve a entrar.');
    const r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + tk },
      body: JSON.stringify({ action: 'comprobante_registro', comprobante_url: nom })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo enviar el comprobante.');

    txt.innerHTML = '<span class="au-spin"></span> Verificando tu pago…';
    REG.verificado = false;
    try {
      const vr = await Promise.race([
        fetch(SUPABASE_URL + '/functions/v1/verificar-pago-plataforma', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({ registration_id: d.registration_id }),
        }).then(x => x.json()),
        new Promise(res => setTimeout(() => res({ lento: true }), 45000)),
      ]);
      REG.verificado = !!(vr && vr.verificado && vr.creado);
    } catch (e) { console.warn('[registro] verificacion:', e && e.message); }

    //  El final de siempre, con los datos de SU solicitud.
    REG.plan = TR.plan || REG.plan;
    REG.branches = TR.sucursales || REG.branches || 1;
    REG.billing = TR.billing || REG.billing;
    REG.totalCiclo = TR.monto || REG.totalCiclo;
    REG.email = TR.email || REG.email;
    fillConfirm();
    goStep('confirmado');
  } catch (e) {
    btn.disabled = false; txt.textContent = 'Enviar comprobante';
    showError('tr-error', 'tr-error-msg', (e && e.message) || 'No se pudo enviar');
  }
}

async function salirTransferencia() {
  try { await sb.auth.signOut(); } catch (e) {}
  TR = null;
  goStep('login');
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

  /*  Al final: primero queda todo enganchado y pintado, y solo entonces se
      mueve la pantalla a donde pide la direccion.

      Y antes de eso, la vuelta de Google o Facebook: si esto es una vuelta,
      manda ella y `abrirSegunEnlace` no corre — leeria una direccion que
      acabamos de limpiar.                                                */
  volverDeRed().then(function (eraVuelta) {
    if (!eraVuelta) abrirSegunEnlace();
  });
});
