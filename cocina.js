/* ══════════════════════════════════════════════════════════════════════════
   COBRA POS · PANTALLA DE COCINA
   Las comandas en vivo, en una tablet colgada en la pared.

   ── DE DÓNDE SALEN LAS COMANDAS ─────────────────────────────────────────
   REGLA DE SERGIO (26-ago-2026), y es la que manda sobre todo lo demás:
   *"no importa de cuándo sean; siempre y cuando en la pantalla de ventas
   esté y se pueda visualizar, también se debe poder visualizar en cocina.
   Tendría que copiar los mismos estados de la pantalla de ventas."*

   Así que esta pantalla NO tiene criterio propio. Usa, literalmente, las dos
   señales de `ventas-salon.js`:

     · EL SALÓN sale de `pos_tables` — la mesa ocupada del plano, con su
       `status` (`pendiente_pago` / `esperando` / `comiendo`). Es lo mismo que
       pinta el plano de mesas, así que lo que se ve allá se ve aquí.
     · EL RESTO (venta rápida, domicilios, chat) sale de `visible_cocina`
       dentro del TURNO DE CAJA, con el mismo `getCajaSessionStart()` que usan
       las listas de ventas: desde que se cerró la caja anterior. Ni ventana de
       horas ni inventos.

   Lo que había antes y por qué estaba mal: se filtraba SOLO por
   `visible_cocina`, que no significa "está en cocina" sino "se puede
   imprimir". `tomar-pedido.js` lo pone en `!cobro_adelantado`, así que en una
   sucursal que cobra por adelantado nace en `false` y solo lo enciende el
   botón «Cobrar mesa»; cobrar en caja no lo toca. Medido en la base: de los
   125 pedidos de salón de El Parche en 30 días, **cero** llegaron a tenerlo
   en `true`. El salón no iba a aparecer nunca.

   ── EL ESTADO "LISTO" ───────────────────────────────────────────────────
   Se escribe en `pos_orders.estado`, el mismo campo que ya usan los
   domicilios. Decisión de Sergio: *"funcionaría igual que funcionan los
   estados de los domicilios en la pantalla de ventas"*.
   Para una mesa ese campo estaba sin usar y el plano del salón no lo lee
   (usa `pos_tables.status`), así que marcar listo desde cocina no mueve
   ninguna mesa.

   ── CUÁNDO SE VE "PENDIENTE DE PAGO" ────────────────────────────────────
   No siempre, y esto lo corrigió Sergio:
     · Domicilio → NUNCA. Se paga al recibir; la cocina no necesita saberlo.
     · Salón     → solo si la sucursal tiene `cobro_adelantado` encendido.
                   Con el cobro al final, TODAS las mesas saldrían rojas
                   todo el tiempo y el color dejaría de significar algo.
     · Venta rápida → sí, se paga en el mostrador.

   ── POR QUÉ HAY UN REFRESCO CADA 20 SEGUNDOS ────────────────────────────
   Además de tiempo real. Una pantalla de cocina que deja de actualizarse en
   silencio es PEOR que no tener pantalla: la gente le cree y se queda
   esperando comandas que ya entraron. El refresco es la red por si se cae un
   evento; el aviso rojo es la red por si se cae todo.
   ══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';

/* storageKey obligatorio en TODO createClient: sin él, el ejecutable y el
   navegador no comparten la sesión y la pantalla pide login otra vez. */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false,
          storageKey:'cobra-pos-session' }
});

const TARDE_MIN   = 15;    // minutos para el marco rojo
const REFRESCO_MS = 20000; // la red por si se cae un evento en vivo

const S = {
  branchId:null, tenantId:null, negocio:'', cobroAdelantado:false, avisarCliente:false,
  /* estado de la mesa por id de pedido: la señal del plano de ventas */
  mesaEstado:new Map(),
  /* ÁREAS DE PREPARACIÓN (26-ago-2026). Sin áreas definidas todo es cocina y
     la pantalla se comporta EXACTAMENTE como antes: es la regla que hace que
     ningún restaurante que ya opera note un cambio que no pidió. */
  areas:[], areaCat:{}, areaProd:{}, tamCat:{}, area:null, areasVisibles:[],
  sonTono:'caja', sonVol:80,
  /* Donde esta parado el control remoto, guardado por NOMBRE para que
     sobreviva a que la pantalla se redibuje cada segundo. */
  cursor:null, ultimaTk:null,
  orders:new Map(), items:new Map(), mesas:new Map(), fotos:new Map(),
  /* A que hora paro el reloj de cada comanda terminada. Solo hace falta para
     las que venian de antes de que se guardara la hora del cambio de estado. */
  paro:new Map(),
  /* categoria de cada producto: es por donde se resuelve su area */
  catDe:new Map(),
  vistas:new Set(),          // comandas que ya sonaron
  online:true, arrancando:true,
};

/* Abierta desde el menu del escritorio (`?volver=1`) o colgada en la pared. */
const VOLVER = new URLSearchParams(location.search).get('volver') === '1';

const $ = id => document.getElementById(id);
const esc = t => String(t == null ? '' : t)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* Una pantalla de cocina NUNCA se puede quedar girando en silencio: el
   cocinero se queda mirando un circulito y nadie sabe por que. Cualquier
   fallo del arranque se muestra en pantalla, con el motivo. */
function morir(motivo, detalle) {
  const c = document.getElementById('cargando');
  if (!c) return;
  c.innerHTML =
    '<p style="font-size:1.6cqw;color:#B91C1C">' + motivo + '</p>' +
    (detalle ? '<p style="font-size:1.1cqw;color:#94A3B8;max-width:60ch;text-align:center">'
      + String(detalle).slice(0,300) + '</p>' : '') +
    '<button onclick="location.reload()" style="margin-top:1cqw;border:none;border-radius:.6cqw;'
    + 'background:#5B6BFF;color:#fff;padding:1cqw 2.5cqw;font-size:1.3cqw;font-weight:800;'
    + 'font-family:inherit;cursor:pointer">Reintentar</button>';
}
/* QUE PASO SE ESTA HACIENDO. Se muestra debajo del circulito: si algo se
   traba, en la pantalla se ve EN QUE, sin tener que abrir la consola.
   Hizo falta porque la pantalla se quedaba girando en el equipo de Sergio y
   funcionaba en el de prueba: sin esto no habia forma de saber donde. */
let PASO = 'arrancando';
function paso(t) {
  PASO = t;
  const p = document.querySelector('#cargando p');
  if (p) p.textContent = t;
}

/* VIGILANTE: ninguna espera puede durar para siempre. Un `try/catch` NO atrapa
   una consulta que sencillamente nunca contesta — y eso es exactamente lo que
   deja el circulito girando. */
function conTope(promesa, seg, queEs) {
  return Promise.race([
    promesa,
    new Promise((_, no) => setTimeout(
      () => no(new Error('No contestó en ' + seg + ' s: ' + queEs)), seg * 1000)),
  ]);
}

/* El conmutador solo existe cuando la persona tiene más de un área. */
/* ── EL CONTROL REMOTO ─────────────────────────────────────────────────────
   Sergio probó con el control del Fire Stick y la marca «se devolvía»: bajaba
   al botón Listo y al rato saltaba a otro lado.

   La causa no era el control. Esta pantalla SE REDIBUJA ENTERA CADA SEGUNDO
   para mover los relojes de las comandas: el botón donde estaba parada la
   marca deja de existir —se crea uno nuevo, idéntico pero distinto— y el
   navegador la pierde. La siguiente flecha arrancaba desde cero y saltaba a
   donde él calculara.

   Dos arreglos, y hacen falta los dos:
     1. La marca se recuerda POR COMANDA, no por elemento, y se vuelve a poner
        después de cada redibujado. Como se recuerda por el pedido, si una
        comanda desaparece la marca pasa a la siguiente en vez de perderse.
     2. Las flechas las manejamos NOSOTROS. El navegador las adivina por
        geometría, y con tres columnas de tarjetas adivina mal. Aquí abajo y
        arriba se mueven dentro de la zona, e izquierda y derecha saltan de
        Mesas a Para llevar a Domicilios. Siempre lo mismo, siempre predecible.

   Y la marca se ve: un aro azul grueso. Sin eso el cocinero aprieta a ciegas. */
/* ── EL CONTROL REMOTO: CURSOR PROPIO ──────────────────────────────────────
   Antes la marca era el FOCO del navegador. En un televisor eso es terreno
   movedizo: el WebView mueve el foco por su cuenta con la cruceta,
   `preventDefault()` no siempre se lo impide, y encima esta pantalla se
   redibuja entera cada segundo para los relojes. Tres cosas peleandose por lo
   mismo, y el resultado era una marca que se iba sola.

   Ahora la pantalla lleva su propio cursor: se acuerda de QUE cosa esta
   marcada —por su nombre, no por el elemento— y la pinta con una clase. El
   navegador ya no opina.

   El recorrido tiene tres pisos y se lee de arriba abajo:
     ARRIBA   el altavoz, y las areas si hay mas de una
     EN MEDIO las comandas, en tres columnas
     ABAJO    Salir                                                        */

/* El cursor se guarda como texto para que sobreviva al redibujado:
   'son' | 'area:barra' | 'tk:<id del pedido>' | 'salir'  */

function mandosArriba() {
  return [...document.querySelectorAll('#son, .k-area')].filter(x => x.offsetParent !== null);
}
function mandosAbajo() {
  return [...document.querySelectorAll('#salir')].filter(x => x.offsetParent !== null);
}
function tarjetas() { return [...document.querySelectorAll('.tk[data-tk]')]; }

function nombreDe(el) {
  if (!el) return null;
  if (el.id === 'son') return 'son';
  if (el.id === 'salir') return 'salir';
  if (el.classList.contains('k-area')) return 'area:' + el.dataset.area;
  if (el.classList.contains('tk')) return 'tk:' + el.dataset.tk;
  return null;
}
function elementoDe(nombre) {
  if (!nombre) return null;
  if (nombre === 'son') return $('son');
  if (nombre === 'salir') return $('salir');
  if (nombre.indexOf('area:') === 0)
    return document.querySelector('.k-area[data-area="' + CSS.escape(nombre.slice(5)) + '"]');
  if (nombre.indexOf('tk:') === 0)
    return document.querySelector('.tk[data-tk="' + CSS.escape(nombre.slice(3)) + '"]');
  return null;
}

/* Pinta el cursor. Se llama despues de CADA redibujado: como el cursor es un
   nombre y no un elemento, sobrevive a que la tarjeta se vuelva a crear. */
function pintarCursor() {
  document.querySelectorAll('.cur').forEach(x => x.classList.remove('cur'));
  if (!S.cursor) return;
  let el = elementoDe(S.cursor);
  if (!el) {
    /* Lo que estaba marcado ya no existe —la comanda se marco lista— asi que
       el cursor pasa a la primera que quede, en vez de desaparecer. */
    const t = tarjetas();
    S.cursor = t.length ? nombreDe(t[0]) : (mandosArriba()[0] ? 'son' : null);
    el = elementoDe(S.cursor);
    if (!el) return;
  }
  el.classList.add('cur');
  /* Que se vea aunque este mas abajo de lo que cabe en la columna. */
  if (typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
  }
}

function irA(nombre) {
  if (!nombre) return;
  S.cursor = nombre;
  pintarCursor();
}

const ZONAS = ['salon', 'rapido', 'domicilio'];

function mover(k) {
  const arriba = mandosArriba(), abajo = mandosAbajo(), tk = tarjetas();

  /* Sin cursor todavia: la primera flecha lo pone en la primera comanda. */
  if (!S.cursor) { irA(tk.length ? nombreDe(tk[0]) : 'son'); return; }

  /* ── Piso de arriba ── */
  if (S.cursor === 'son' || S.cursor.indexOf('area:') === 0) {
    const i = arriba.findIndex(x => nombreDe(x) === S.cursor);
    if (k === 'ArrowLeft'  && i > 0)                 return irA(nombreDe(arriba[i - 1]));
    if (k === 'ArrowRight' && i < arriba.length - 1) return irA(nombreDe(arriba[i + 1]));
    if (k === 'ArrowDown') return irA(tk.length ? (S.ultimaTk || nombreDe(tk[0])) : (abajo[0] ? 'salir' : null));
    return;
  }

  /* ── Piso de abajo ── */
  if (S.cursor === 'salir') {
    if (k === 'ArrowUp') return irA(tk.length ? (S.ultimaTk || nombreDe(tk[tk.length - 1])) : 'son');
    return;
  }

  /* ── Las comandas ── */
  const el = elementoDe(S.cursor);
  if (!el) { irA(tk.length ? nombreDe(tk[0]) : 'son'); return; }
  const lista = el.closest('.zona-lista');
  const dentro = [...lista.querySelectorAll('.tk[data-tk]')];
  const i = dentro.indexOf(el);

  if (k === 'ArrowDown') {
    if (i < dentro.length - 1) return irA(nombreDe(dentro[i + 1]));
    return abajo[0] ? irA('salir') : null;
  }
  if (k === 'ArrowUp') {
    if (i > 0) return irA(nombreDe(dentro[i - 1]));
    return arriba[0] ? irA(nombreDe(arriba[0])) : null;
  }

  /* Izquierda y derecha: a la zona de al lado, a la misma altura, saltandose
     las vacias — si no, la flecha no haria nada y pareceria trabada. */
  const zonaActual = lista.id.replace('z-', '');
  let n = ZONAS.indexOf(zonaActual);
  const paso = (k === 'ArrowRight') ? 1 : -1;
  for (let v = 0; v < ZONAS.length; v++) {
    n += paso;
    if (n < 0 || n >= ZONAS.length) return;
    const otra = $('z-' + ZONAS[n]);
    const suyas = otra ? [...otra.querySelectorAll('.tk[data-tk]')] : [];
    if (suyas.length) return irA(nombreDe(suyas[Math.min(i, suyas.length - 1)]));
  }
}

function activarCursor() {
  const el = elementoDe(S.cursor);
  if (!el) return;
  if (el.classList.contains('tk')) {
    /* El OK hace lo que toque: marcar listo, o deshacer si ya estaba lista. */
    const b = el.querySelector('[data-listo],[data-desh]');
    if (b) b.click();
    return;
  }
  el.click();          // el altavoz, un area, o Salir
}

/* Se atiende en fase de CAPTURA y sobre `document`: asi llega antes que
   cualquier cosa que el WebView del televisor quiera hacer con la cruceta. */
document.addEventListener('keydown', function (ev) {
  const k = ev.key;
  const flecha = (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowRight');
  const ok = (k === 'Enter' || k === ' ' || k === 'Spacebar');
  if (!flecha && !ok) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (ok) activarCursor(); else mover(k);
  if (S.cursor && S.cursor.indexOf('tk:') === 0) S.ultimaTk = S.cursor;
}, true);

/* UN AVISO EN LA PROPIA PANTALLA.
   Hizo falta porque el sonido fallaba y desde aqui no hay forma de oir la
   cocina: en vez de seguir adivinando, la pantalla dice en voz alta lo que
   hizo y lo que le paso. */
let _avisoT = null;
function aviso(texto, mal) {
  let el = $('aviso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso';
    document.body.appendChild(el);
  }
  el.className = 'k-aviso' + (mal ? ' mal' : '');
  el.textContent = texto;
  clearTimeout(_avisoT);
  _avisoT = setTimeout(() => { el.remove(); }, 6000);
}

/* El interruptor del sonido. Al encenderlo suena una vez Y DICE si pudo: si
   el aparato no deja sonar, se ve en la pantalla en vez de quedar en el aire. */
addEventListener('click', function (ev) {
  const s = ev.target && ev.target.closest && ev.target.closest('#son');
  if (!s) return;
  const nuevo = !sonidoEncendido();
  try { localStorage.setItem(SONIDO_KEY, nuevo ? '1' : '0'); } catch (e) {}
  pintarSonido();
  if (!nuevo) { aviso('Sonido apagado en este aparato'); return; }
  aviso('Sonido encendido · probando…');
  probarSonido();
});

/* Toca el tono y cuenta que paso, paso por paso. */
async function probarSonido() {
  if (typeof window.posTocarTono !== 'function') {
    aviso('No cargó el archivo de sonidos (pos-notify)', true); return;
  }
  let estado = '?';
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) { aviso('Este aparato no tiene audio en el navegador', true); return; }
    _audio = _audio || new C();
    if (_audio.state === 'suspended') { try { await _audio.resume(); } catch (e) {} }
    estado = _audio.state;
  } catch (e) { aviso('No se pudo abrir el audio: ' + (e.message || e), true); return; }

  try {
    const r = await fetch('assets/son/' + S.sonTono + '.mp3', { method: 'HEAD' });
    if (!r.ok) { aviso('No se pudo bajar el sonido (' + r.status + ')', true); return; }
  } catch (e) { aviso('No se pudo bajar el sonido: ' + (e.message || e), true); return; }

  try { window.posTocarTono(S.sonTono, S.sonVol); } catch (e) {
    aviso('Falló al tocarlo: ' + (e.message || e), true); return;
  }
  if (estado !== 'running') {
    aviso('El audio sigue bloqueado (' + estado + '). Aprieta cualquier botón del control y vuelve a probar', true);
  } else {
    aviso('Sonó: ' + S.sonTono + ' al ' + S.sonVol + '%');
  }
}

addEventListener('click', function (ev) {
  const b = ev.target && ev.target.closest && ev.target.closest('[data-area]');
  if (!b) return;
  const id = b.dataset.area;
  if (!id || id === S.area) return;
  if (!S.areasVisibles.some(a => a.id === id)) return;
  S.area = id;
  const u = new URL(location.href);
  u.searchParams.set('area', id);
  history.replaceState(null, '', u);
  pintarAreas();
  pintar();
});

addEventListener('error',  e => morir('La pantalla no pudo abrir.', e.message));
addEventListener('unhandledrejection', e => morir('La pantalla no pudo abrir.', e.reason && e.reason.message));

/* ── Arranque ───────────────────────────────────────────────────────────── */
(async function iniciar() {
  try {
  paso('Comprobando la sesión…');
  const { data:{ session } } = await conTope(sb.auth.getSession(), 10, 'la sesión');
  if (!session) { location.href = 'mesero-login.html'; return; }

  paso('Buscando tu sucursal…');
  const { data:perfil, error:errPerfil } = await conTope(sb.from('pos_users')
    .select('branch_id, tenant_id, name')
    .or(`auth_user_id.eq.${session.user.id},id.eq.${session.user.id}`)
    .maybeSingle(), 12, 'tu usuario');
  if (errPerfil) throw new Error('Leyendo tu usuario: ' + errPerfil.message);
  if (!perfil || !perfil.branch_id) {
    $('cargando').innerHTML = '<p>Esta cuenta no tiene una sucursal asignada.</p>';
    return;
  }
  S.branchId = perfil.branch_id;
  S.tenantId = perfil.tenant_id;

  paso('Comprobando tus permisos…');
  if (!(await puedeVerCocina())) {
    $('cargando').innerHTML =
      '<p style="font-size:1.6cqw;font-weight:800;color:#0F172A">Esta cuenta no tiene permiso para ver la cocina</p>'
    + '<p style="font-size:1.1cqw;color:#64748B;max-width:60ch;text-align:center">'
    + 'Pídele al administrador que active <b>«Ver la pantalla de cocina»</b> en el rol de esta cuenta, '
    + 'en Configuración → Usuarios y roles.</p>'
    + '<button id="salir2" style="margin-top:1cqw;border:1px solid #ECEEF2;border-radius:.6cqw;'
    + 'background:#fff;color:#64748B;padding:.9cqw 2.2cqw;font-size:1.2cqw;font-weight:700;'
    + 'font-family:inherit;cursor:pointer">Salir</button>';
    const b = $('salir2');
    if (b) b.onclick = async () => { await sb.auth.signOut(); location.href = 'mesero-login.html'; };
    return;
  }

  paso('Cargando la carta y las mesas…');
  await cargarBase();
  paso('Trayendo las comandas…');
  pintarDesdeElEquipo();      //  se ve YA; el servidor confirma abajo
  await cargarComandas();

  S.arrancando = false;      // a partir de aquí, lo nuevo suena
  pintar();
  $('cargando').hidden = true;

  if (VOLVER) $('salir').textContent = 'Volver al escritorio';

  suscribir();
  setInterval(cargarComandas, REFRESCO_MS);
  setInterval(pintar, 1000);         // los relojes de cada comanda
  reloj(); setInterval(reloj, 10000);
  vigilarRed();
  mantenerDespierta();
  } catch (e) {
    console.error('[cocina] no arrancó en el paso "' + PASO + '":', e);
    morir('Se trabó en: ' + PASO, e && e.message);
  }
})();

/* Datos que no cambian durante el turno */
async function cargarBase() {
  /* allSettled y no all: si una de las tres falla, la pantalla abre igual con
     lo que sí llegó. Sin fotos o sin nombres de mesa se trabaja; sin pantalla
     no. Y cada una con su tope: una que no conteste no puede colgar el resto. */
  const [suc, mesas, prods] = await Promise.allSettled([
    conTope(sb.from('branches').select('name, cobro_adelantado, operacion_config, brands(name, logo_url)').eq('id', S.branchId).maybeSingle(), 12, 'la sucursal'),
    conTope(sb.from('pos_tables').select('id, name').eq('branch_id', S.branchId), 12, 'las mesas'),
    conTope(sb.from('pos_products').select('id, photo_url, category_id').eq('branch_id', S.branchId), 15, 'la carta'),
  ]).then(rs => rs.map(r => {
    if (r.status === 'rejected') { console.error('[cocina]', r.reason); return { data:null }; }
    return r.value || { data:null };
  }));
  const b = suc.data || {};
  const marca = b.brands && (Array.isArray(b.brands) ? b.brands[0] : b.brands);
  S.negocio = (marca && marca.name) || b.name || 'Cocina';
  S.cobroAdelantado = !!b.cobro_adelantado;
  /*  Y la leyenda tampoco menciona lo que no puede pasar: si el restaurante
      cobra al final, "Pendiente de pago" es un color que nunca va a salir, y
      explicar un color que no existe solo hace la leyenda mas larga. El id
      `lg-pago` estaba puesto desde hace tiempo esperando justo esto. */
  var lgp = $('lg-pago');
  if (lgp) lgp.hidden = !S.cobroAdelantado;
  /* El nombre del restaurante NO va: el cocinero no lo necesita en su turno.
     Queda la sede, que es lo unico que hace falta cuando hay varias. */
  $('sede').textContent = 'Cocina' + (b.name ? ' · ' + b.name : '');

  /* El logo REAL del restaurante. Si no tiene, no se pinta nada: un cuadro
     con una letra inventada es un logo que no es de nadie.
     Se arma con createElement y no con innerHTML: la direccion del logo
     viene de la base y meterla en una cadena de HTML es pedir problemas. */
  const logo = marca && marca.logo_url;
  const cajaLogo = $('marca');
  cajaLogo.textContent = '';
  if (logo) {
    const img = document.createElement('img');
    img.alt = '';
    img.onerror = () => { cajaLogo.textContent = ''; };
    img.src = logo;
    cajaLogo.appendChild(img);
  }
  /* La leyenda del pago se esconde si en esta sucursal no puede ocurrir:
     sin cobro adelantado solo la venta rápida puede quedar sin pagar. */
  (mesas.data || []).forEach(m => S.mesas.set(m.id, m.name));
  (prods.data || []).forEach(p => {
    if (p.photo_url) S.fotos.set(p.id, p.photo_url);
    if (p.category_id) S.catDe.set(p.id, p.category_id);
  });

  /* La configuración de áreas vive en el mismo sitio que los empaques: el
     bloque `operacion_config` de la sucursal. Ni tabla nueva ni columna
     nueva — el molde que Cobra ya usa para lo que se configura por categoría
     y por producto. */
  const op = b.operacion_config || {};
  S.areas    = Array.isArray(op.areas) ? op.areas.filter(a => a && a.id) : [];
  S.areaCat  = op.areaCatCfg  || {};
  S.areaProd = op.areaProdCfg || {};
  /* El tamaño NO depende del área: un restaurante con un solo sitio de
     preparación puede querer las bebidas pequeñas igual. Son dos preguntas
     distintas y se leen por separado. */
  S.tamCat   = op.tamCatCfg   || {};
  /* Qué tono suena al entrar una comanda. El TONO lo elige el dueño una vez
     para todo el restaurante; ENCENDERLO O NO es de cada aparato. */
  /*  EL COLOR DE CADA ESTADO. Lo elige el dueno en Operacion; aqui solo se
      vuelca a las variables que usa la hoja de estilos. Un color mal escrito
      NO se pinta: se ignora y queda el de fabrica, porque una comanda sin
      color de estado es peor que una con el color de siempre. */
  const col = op.cocinaColores || {};
  const esColor = v => /^#[0-9a-f]{6}$/i.test(String(v || '').trim());
  [['prep', col.prep], ['pago', col.pago], ['listo', col.listo]].forEach(([k, v]) => {
    if (esColor(v)) document.documentElement.style.setProperty('--c-' + k, String(v).trim());
  });

  const cn = op.cocinaNotif || {};
  S.sonTono = cn.tono || 'caja';
  S.sonVol  = (typeof cn.vol === 'number') ? cn.vol : 80;
  pintarSonido();
  /* En la tablet se intenta abrir el audio de una, sin esperar a que alguien
     toque nada: es una pantalla de pared y puede pasar la noche entera sin que
     nadie la roce. Si el aparato no lo permite, el primer toque o la primera
     tecla del control lo abren igual. */
  if (sonidoEncendido()) { try { abrirAudio(); } catch (e) {} }
  await resolverArea();
}

/* ── ¿PUEDE ESTA CUENTA VER LA COCINA? ─────────────────────────────────────
   `cocina.ver` es el permiso de ABRIR esta pantalla, distinto de
   `pedidos.cocina`, que es MANDAR la comanda (el botón del mesero).

   Se pregunta con las mismas dos llamadas que usa el resto del sistema, para
   no inventar un segundo criterio que después se desincronice.

   Y si NO SE PUEDE AVERIGUAR —se cayó la red, la consulta no contestó— se
   deja entrar. Es a propósito: esto es una pantalla de pared en una cocina en
   plena hora pico, y dejar al cocinero sin comandas por un problema de red
   sería mucho peor que dejar entrar a alguien de más. El freno de verdad
   contra el fraude es RLS, no esta comprobación. */
async function puedeVerCocina() {
  try {
    const dueno = await conTope(sb.rpc('es_dueno'), 10, 'si eres el dueño');
    if (dueno && dueno.data === true) return true;
  } catch (e) { /* sigue abajo */ }
  let permisos = null;
  try {
    const r = await conTope(sb.rpc('permisos_en_sucursal', { p_branch: S.branchId }), 10, 'tus permisos');
    if (r && !r.error && Array.isArray(r.data)) permisos = r.data;
  } catch (e) { /* no se pudo saber */ }
  if (permisos === null) return true;                    // no se pudo saber: se entra
  if (permisos.indexOf('cocina.ver') >= 0) return true;
  /* Con varias áreas, tener una de ellas ya implica poder abrir la pantalla:
     marcar «Ver la pantalla de Barra» y que no lo dejen entrar sería absurdo. */
  return permisos.some(x => String(x).indexOf('prep.') === 0);
}

/* ── ÁREAS: cuál es esta pantalla y cuáles puede ver esta persona ──────────
   Decisión de Sergio (26-ago-2026): *"desde la pantalla no se puede escoger el
   área, eso va desde los roles"*. El gerente arma el rol y ahí marca qué
   pantallas ve esa persona. Si solo tiene una, no hay nada que elegir y no se
   pinta ningún selector; si tiene dos, aparece el conmutador.

   REGLA DE COMPATIBILIDAD, y es la importante: un rol que NO tenga marcada
   ninguna casilla `prep.*` ve TODAS las áreas. Sin eso, el día que el dueño
   crea la segunda área, todos los roles que ya existen se quedarían fuera de
   la cocina sin que nadie hubiera tocado nada. */
function permisoDeArea(id) { return 'prep.' + id; }

async function resolverArea() {
  const lista = S.areas;
  if (lista.length < 2) {            // una sola área (o ninguna): todo es de aquí
    S.areasVisibles = lista.slice();
    S.area = lista.length ? lista[0].id : null;
    pintarAreas();
    return;
  }
  let permisos = null;
  try {
    const duenoR = await conTope(sb.rpc('es_dueno'), 10, 'si eres el dueño');
    if (duenoR && duenoR.data === true) permisos = '*';
  } catch (e) { /* abajo se intenta por rol */ }
  if (permisos !== '*') {
    try {
      const r = await conTope(sb.rpc('permisos_en_sucursal', { p_branch: S.branchId }), 10, 'tus permisos');
      if (r && !r.error && Array.isArray(r.data)) permisos = r.data;
    } catch (e) { /* se queda en null = puerta abierta */ }
  }
  let puede;
  if (permisos === '*' || permisos === null) {
    puede = lista.slice();                       // dueño, o no se pudo saber
  } else {
    const marcadas = lista.filter(a => permisos.indexOf(permisoDeArea(a.id)) >= 0);
    puede = marcadas.length ? marcadas : lista.slice();   // ninguna marcada = todas
  }
  S.areasVisibles = puede;

  /* La dirección manda (así entra la APK de la barra), pero solo si esa área
     está permitida: escribirla a mano no puede saltarse el rol. */
  const pedida = new URLSearchParams(location.search).get('area');
  const valida = pedida && puede.some(a => a.id === pedida) ? pedida : null;
  S.area = valida || (puede[0] && puede[0].id) || null;
  pintarAreas();
}

function pintarAreas() {
  const caja = $('areas');
  if (!caja) return;
  if (!S.area || S.areasVisibles.length < 2) { caja.innerHTML = ''; caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = S.areasVisibles.map(a =>
    '<button class="k-area' + (a.id === S.area ? ' on' : '') + '" data-area="' + esc(a.id) + '">'
    + esc(a.nombre || a.id) + '</button>').join('');
}

/* Dónde se prepara un producto: lo suyo manda sobre lo de su categoría, y si
   no dice nada, la primera área (la cocina de toda la vida). */
function areaDeItem(i) {
  const pid = i.product_id;
  if (pid && S.areaProd[pid]) return S.areaProd[pid];
  const cid = pid ? S.catDe.get(pid) : null;
  if (cid && S.areaCat[cid]) return S.areaCat[cid];
  return S.areas.length ? S.areas[0].id : null;
}

/* Qué muestra esta pantalla de una comanda. Dos filtros independientes:
     · EL ÁREA decide si el producto es de esta pantalla. Con un solo sitio de
       preparación no filtra nada.
     · EL TAMAÑO decide cómo se lee: normal, pequeño o no mostrarlo. Funciona
       tengas barra o no — no hace falta crear un área para esconder algo.
   Un solo sitio donde se decide, para que la tarjeta y el conteo no puedan
   decir cosas distintas. */
/* 'normal' | 'mini' | 'oculto' — cómo sale esta categoría en ESTA pantalla. */
function tamañoDe(i) {
  const pid = i.product_id;
  const cid = pid ? S.catDe.get(pid) : null;
  const t = cid ? S.tamCat[cid] : null;
  if (t !== 'mini' && t !== 'oculto') return 'normal';
  /* En la pantalla de SU PROPIA area sale normal: ahi ese producto es el
     trabajo, no un anadido. Salio probando — con Bebidas marcadas pequenas y
     mandadas a Barra, la pantalla de la barra mostraba su propio trabajo
     diminuto. Y con "no mostrar" seria peor: la barra no veria nada. */
  if (S.areas.length >= 2 && areaDeItem(i) === S.area) return 'normal';
  return t;
}

function repartoDe(its) {
  const mios = [], minis = [];
  (its || []).forEach(i => {
    const deAqui = S.areas.length < 2 || !S.area || areaDeItem(i) === S.area;
    if (!deAqui) return;
    const t = tamañoDe(i);
    if (t === 'oculto') return;
    if (t === 'mini') minis.push(i); else mios.push(i);
  });
  return { mios, ajenos: minis };
}

/* ── El turno de caja, calcado de `getCajaSessionStart()` de ventas-salon ──
   No es "las últimas N horas": es el turno. Y arranca donde CERRÓ el turno
   anterior, no donde abrió el actual — decisión de Sergio del 19-ago, porque
   con el hueco entre el cierre de anoche y la apertura de hoy se le perdieron
   $246.000 de las pantallas y del arqueo. Si no hay caja anterior, desde su
   propia apertura; si no hay caja ninguna, desde medianoche. */
let _cajaDesde = null, _cajaAl = 0;
async function inicioCaja() {
  if (_cajaDesde && (Date.now() - _cajaAl) < 60000) return _cajaDesde;
  let inicio = null;
  try {
    const r = await conTope(sb.from('pos_sessions')
      .select('opened_at').eq('branch_id', S.branchId).eq('status', 'open')
      .order('opened_at', { ascending: false }).limit(1), 12, 'el turno de caja');
    if (r.data && r.data.length && r.data[0].opened_at) {
      inicio = r.data[0].opened_at;
      try {
        const ant = await conTope(sb.from('pos_sessions')
          .select('closed_at').eq('branch_id', S.branchId)
          .not('closed_at', 'is', null).lte('closed_at', inicio)
          .order('closed_at', { ascending: false }).limit(1), 12, 'el turno anterior');
        if (ant.data && ant.data.length && ant.data[0].closed_at) inicio = ant.data[0].closed_at;
      } catch (e) { /* se queda con la apertura */ }
    }
  } catch (e) { /* abajo cae a medianoche */ }
  if (!inicio) { const t = new Date(); t.setHours(0,0,0,0); inicio = t.toISOString(); }
  _cajaDesde = inicio; _cajaAl = Date.now();
  return inicio;
}

/* ── Las comandas ───────────────────────────────────────────────────────── */
/*  ══ COCINA ABRE CON LAS COMANDAS PUESTAS ═══════════════════════════════

    Hasta hoy esta pantalla abria EN BLANCO y esperaba a que volvieran cuatro
    consultas. Medido: dos segundos y pico mirando una pantalla vacia, cada vez
    que alguien la abre o la recarga. En medio de un servicio eso es una
    eternidad, y encima da la impresion de que no hay nada que cocinar.

    Ahora se pinta con lo que quedo guardado en ESTE equipo la ultima vez —que
    en cocina son segundos antes, porque la pantalla vive abierta— y el
    servidor confirma por detras. Si algo cambio, se repinta y ya.

    Lo guardado NO se muestra si es viejo: mas de 10 minutos y se prefiere la
    pantalla vacia a una comanda que ya no existe. En cocina un dato viejo no
    es un detalle: es alguien preparando un plato que ya salio.              */
var CACHE_COMANDAS = 'cocina.comandas';

function guardarEnElEquipo() {
  try {
    if (!window.posCache) return;
    posCache.guardar(CACHE_COMANDAS, {
      orders: Array.from(S.orders.entries()),
      items:  Array.from(S.items.entries()),
    });
  } catch (e) {}
}

function pintarDesdeElEquipo() {
  try {
    if (!window.posCache) return false;
    var g = posCache.leer(CACHE_COMANDAS, 600);        // 10 minutos
    if (!g || !g.datos || g.viejo) return false;
    var o = g.datos.orders || [], i = g.datos.items || [];
    if (!o.length) return false;
    S.orders = new Map(o);
    S.items  = new Map(i);
    pintar();
    console.log('[cocina] pintada desde el equipo (' + o.length + ' comandas, ' + Math.round(g.edadSeg) + 's)');
    return true;
  } catch (e) { return false; }
}

async function cargarComandas() {
  try {
    const CAMPOS = 'id, channel, status, estado, estado_at, table_id, turno, customer_name, notes, total, total_final, paid_amount, created_at, delivered_at, closed_at, visible_cocina';
    /* `completed` es un pedido TERMINADO (verificado en la base: los completed
       ya estan cobrados y entregados). `paid` NO se excluye: una venta rapida
       se paga ANTES de cocinarse y tiene que seguir en pantalla. */
    const FUERA = '("cancelled","abandoned","completed")';

    /* (A) LAS MESAS OCUPADAS DEL PLANO. La misma tabla que pinta el salon en
       ventas, sin filtro de tiempo: si la mesa esta ocupada alla, su comanda
       esta aqui. Cuando el mesero libera la mesa, desaparece sola de las dos
       pantallas — por eso no hace falta ningun tope de horas. */
    const { data:mesas } = await conTope(sb.from('pos_tables')
      .select('id, name, status, current_order_id')
      .eq('branch_id', S.branchId)
      .neq('status', 'libre')
      .not('current_order_id', 'is', null), 12, 'las mesas ocupadas');
    S.mesaEstado = new Map();
    const idsMesa = [];
    (mesas || []).forEach(m => {
      S.mesas.set(m.id, m.name);
      S.mesaEstado.set(String(m.current_order_id), m.status);
      idsMesa.push(String(m.current_order_id));
    });

    /* (B) EL RESTO, dentro del turno de caja — el mismo corte de las listas de
       ventas rapida y domicilios. */
    const desde = await inicioCaja();
    const consultas = [
      /*  SIN `delivered_at is null` (Sergio, 28-ago-2026).

          Esa linea borraba de la pantalla todo lo ya entregado, y con ella la
          cocina perdia de vista su propio trabajo: a media noche la pantalla
          decia "1 comanda" cuando llevaban veinte. Lo que acota esto no es el
          estado sino EL TURNO DE CAJA: entra lo de este turno y se va solo al
          cerrar. */
      conTope(sb.from('pos_orders').select(CAMPOS)
        .eq('branch_id', S.branchId)
        .eq('visible_cocina', true)
        .gte('created_at', desde)
        .not('status', 'in', FUERA)
        .order('created_at', { ascending: true }), 15, 'las comandas')
    ];
    if (idsMesa.length) {
      consultas.push(conTope(sb.from('pos_orders').select(CAMPOS)
        .in('id', idsMesa)
        .not('status', 'in', FUERA), 15, 'las comandas de las mesas'));
    }

    /*  (C) LAS MESAS QUE YA SE LIBERARON, del turno.

        Faltaba esta y por eso las de mesa seguian desapareciendo despues de
        arreglar las de domicilio: una comanda de salon NO lleva
        `visible_cocina`, asi que no entra por la consulta general, y la de
        arriba solo trae las mesas que el plano tiene ocupadas AHORA. Cuando el
        mesero libera la mesa, esa comanda deja de existir para esta pantalla —
        no es que se filtrara despues: es que ni se pedia.

        La cocina la preparo; tiene derecho a verla en su turno.          */
    consultas.push(conTope(sb.from('pos_orders').select(CAMPOS)
      .eq('branch_id', S.branchId)
      .eq('channel', 'salon')
      .gte('created_at', desde)
      .not('status', 'in', FUERA)
      .order('created_at', { ascending: true }), 15, 'las mesas del turno'));
    const partes = await Promise.all(consultas);
    const porId = new Map();
    partes.forEach(r => {
      if (r.error) throw r.error;
      (r.data || []).forEach(x => porId.set(x.id, x));
    });
    const ords = [...porId.values()].sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));

    const vivos = (ords || []).filter(o => {
      /*  LO YA TERMINADO SE QUEDA, EN MORADO Y ABAJO (Sergio, 28-ago-2026).

          Aqui habia dos filtros que lo borraban: uno sacaba del salon la mesa
          que ya se libero y otro sacaba lo que estaba en camino o entregado.
          Los dos por la misma idea equivocada — que la cocina solo quiere ver
          lo que le falta.

          Y lo que la cocina quiere ver es SU TRABAJO: lo que va saliendo,
          cuanto lleva hecho, y poder mirar atras cuando alguien pregunta por
          un pedido de hace media hora. Lo pendiente manda arriba; lo terminado
          se hunde y se apaga, pero no desaparece.

          Se sigue botando la mesa liberada SI todavia estaba pendiente: eso no
          es trabajo hecho sino una comanda que alguien abandono, y dejarla
          arriba pidiendo cocina seria peor.                               */
      /*  Una mesa que ya se libero esta TERMINADA aunque su comanda nunca
          llegara a marcarse lista: los clientes se fueron, se cobro y la mesa
          quedo libre. Antes se botaba por "abandonada"; pero de ahi salian las
          cinco comandas de mesa de hoy que Sergio no veia por ningun lado. */
      /*  UNA COMANDA LISTA YA NO SE VA SOLA (Sergio, 28-ago-2026).

          Antes desaparecia a los 30 segundos. El cocinero que se daba la
          vuelta a sacar algo volvia y ya no estaba: no habia como comprobar
          que la habia marcado ni como deshacerlo, y la unica salida era
          preguntarle a la caja.

          Se queda hasta que el pedido salga de cocina de verdad —en camino o
          entregado, que es lo que filtra la linea de arriba—. Y se va al final
          de su zona, apagada, para que no le quite sitio a lo que falta. */
      return true;
    });

    S.orders = new Map(vivos.map(o => [o.id, o]));

    if (vivos.length) {
      const ids = vivos.map(o => o.id);
      const { data:its } = await conTope(sb.from('pos_order_items')
        .select('id, order_id, product_id, product_name, name, quantity, notes, selections, kitchen_printed_at')
        .in('order_id', ids), 15, 'los productos de las comandas');
      /* `kitchen_printed_at` marca lo que YA se mandó a cocina: un ítem
         recién agregado y todavía sin enviar no debe aparecer, porque el
         cocinero lo empezaría antes de tiempo.
         PERO esa marca la pone la impresora de cocina, y hay restaurantes
         que no tienen impresora — esta pantalla es justamente lo que la
         reemplaza. Si en un pedido NINGÚN ítem está marcado, la marca no
         significa "no se ha enviado", significa "aquí nadie imprime": se
         muestran todos. Sin esto la comanda salía vacía, con la mesa y el
         reloj pero sin un solo producto. */
      const porOrden = new Map();
      const crudos = new Map();
      (its || []).forEach(i => {
        if (!crudos.has(i.order_id)) crudos.set(i.order_id, []);
        crudos.get(i.order_id).push(i);
      });
      crudos.forEach((lista, oid) => {
        const enviados = lista.filter(i => i.kitchen_printed_at);
        porOrden.set(oid, enviados.length ? enviados : lista);
      });
      S.items = porOrden;

      /* Una comanda sin un solo producto no es una comanda: es ruido que le
         quita sitio a las que sí hay que cocinar. */
      S.orders.forEach((ord, oid) => {
        if (!(porOrden.get(oid) || []).length) S.orders.delete(oid);
      });
    } else {
      S.items = new Map();
    }
    marcarRed(true);
    pintar();
    guardarEnElEquipo();
  } catch (e) {
    console.error('[cocina] no se pudieron traer las comandas:', e);
    marcarRed(false);
  }
}

/* ── Qué estado le toca a cada comanda ──────────────────────────────────── */
function estadoDe(o) {
  /*  Entregado y en camino se pintan como LISTO: para la cocina son lo mismo
      —ya salio de sus manos— y tener tres moradas distintas solo obligaria al
      cocinero a aprenderse una diferencia que no le sirve de nada. */
  if (['listo','en_camino','entregado'].indexOf(o.estado) >= 0) return 'listo';
  /*  Y la de una mesa que el plano ya libero: se fueron, se cobro, se acabo. */
  if (String(o.channel || '').toLowerCase() === 'salon' && !S.mesaEstado.has(o.id)) return 'listo';
  if (debePagar(o)) return 'pago';
  return 'prep';
}

function debePagar(o) {
  /*  SIN COBRO ADELANTADO NO HAY NADA ROJO. NUNCA (Sergio, 28-ago-2026).

      El rojo dice "esto no se puede preparar todavia porque no han pagado". En
      un restaurante que cobra al final, eso es FALSO para todos los pedidos: se
      prepara primero y se cobra despues. Un rojo permanente en pantalla no
      avisa de nada — se vuelve el color normal, y el dia que aparezca uno de
      verdad nadie lo va a mirar.

      Estaba puesto solo para el salon. La venta rapida caia mas abajo, al
      calculo de lo pagado, y salia roja igual en un negocio que cobra al final.

      El interruptor sigue existiendo y se puede prender: lo que cambia es que
      apagado no se ve en cocina, que es lo que Sergio pidio.             */
  if (!S.cobroAdelantado) return false;

  const canal = String(o.channel || '').toLowerCase();
  // El domicilio se paga al recibir: en cocina no va ningún dato de pago.
  if (canal === 'domicilio' || canal === 'whatsapp') return false;
  /* En salón manda el estado DE LA MESA, el mismo que pinta el plano de
     ventas: `pendiente_pago` es rojo allá y rojo aquí. No se recalcula a
     partir de lo pagado, porque entonces las dos pantallas podrían decir
     cosas distintas de la misma mesa. */
  if (canal === 'salon') {
    const est = S.mesaEstado.get(o.id);
    if (est) return est === 'pendiente_pago';
  }
  const total = parseFloat(o.total_final != null ? o.total_final : o.total) || 0;
  if (total <= 0) return false;
  return (parseFloat(o.paid_amount) || 0) < total - 1;
}

function zonaDe(o) {
  const canal = String(o.channel || '').toLowerCase();
  if (canal === 'domicilio' || canal === 'whatsapp') return 'domicilio';
  if (canal === 'rapido') return 'rapido';
  return 'salon';
}

function tituloDe(o) {
  const z = zonaDe(o);
  if (z === 'salon')  return S.mesas.get(o.table_id) || 'Mesa';
  /*  EL NOMBRE MANDA SOBRE EL TURNO (Sergio, 28-ago-2026).

      Un pedido que llega del salon trae el nombre del cliente — «Juan
      Quintana»— y aparecia como «Turno #004». Desde la cocina, un numero que
      nadie dijo nunca en voz alta no sirve para llamar a nadie: el mesero
      grita el nombre.

      El turno se queda para las ventas rapidas de mostrador, que es donde
      nadie pregunta el nombre y el numero SI es como se llama al cliente. Es
      la misma regla que ya usa la tarjeta de venta rapida en el salon. */
  if (z === 'rapido') {
    const nom = String(o.customer_name || '').trim();
    if (nom) return nom;
    return 'Turno ' + (o.turno ? '#' + String(o.turno).padStart(3,'0') : '');
  }
  /* En domicilio va el BARRIO, no el nombre ni la dirección: es una pantalla
     colgada en la pared que ve todo el que pasa. El barrio sí sirve — dice si
     hay que empacar para viaje. */
  /*  Y SI ES UN CONJUNTO, MANDA EL CONJUNTO (Sergio, 28-ago-2026).

      Un barrio agrupa cientos de casas; un conjunto es UN sitio con portería.
      Cuando el pedido va a uno, el nombre del conjunto le dice a la cocina
      mucho más que el barrio — y en un barrio grande como Variante Norte,
      cuatro comandas seguidas se llamaban todas igual y no había forma de
      distinguirlas de un vistazo.

      El barrio se queda para las direcciones de calle, que es donde sí es lo
      único que ubica. No se ponen los dos: el título se lee desde dos metros
      y lo que no cabe se corta — y lo que se cortaría es el final, justo
      donde estaría el conjunto. */
  const mc = /\[conjunto:([^\]]+)\]/i.exec(o.notes || '');
  if (mc && mc[1].trim()) return mc[1].trim();
  const m = /\[barrio:([^\]]+)\]/i.exec(o.notes || '');
  return m ? m[1].trim() : 'Domicilio';
}

function minutosDe(o) {
  const its = S.items.get(o.id) || [];
  let desde = null;
  its.forEach(i => {
    const t = new Date(i.kitchen_printed_at).getTime();
    if (!desde || t < desde) desde = t;
  });
  if (!desde) desde = new Date(o.created_at).getTime();

  /*  EL RELOJ SE PARA CUANDO LA COMANDA SALE (Sergio, 28-ago-2026).

      Antes seguia corriendo para siempre, y con las terminadas ya a la vista
      eso llenaba la pantalla de numeros enormes —136 minutos— que no querian
      decir nada: no es que llevara dos horas de retraso, es que entro hace dos
      horas y salio hace rato.

      Parado, el numero pasa a decir algo util: CUANTO TARDO en hacerse. Es lo
      que le sirve a la cocina para mirarse a si misma.

      `hasta` sale del primer dato que exista: cuando se entrego, cuando cambio
      de estado, o —si es una comanda vieja sin ninguno de los dos— la hora en
      que esta pantalla la vio terminada por primera vez. Nunca se queda
      corriendo.                                                           */
  const hasta = paroEn(o);
  return Math.max(0, ((hasta || Date.now()) - desde) / 60000);
}

/*  A que hora dejo de ser trabajo. `S.paro` es la red de seguridad para las
    comandas que ya estaban terminadas antes de que existiera `estado_at`: se
    apunta la primera vez que se ven y de ahi no se mueve. */
function paroEn(o) {
  if (estadoDe(o) !== 'listo') { S.paro.delete(o.id); return null; }

  /*  DE DONDE SALE LA HORA DE SALIDA, en orden de lo mas exacto a lo menos.

      Hacia falta `closed_at` y por eso el orden de las mesas salia revuelto:
      una comanda de salon que nadie marco lista no tiene `estado_at` ni
      `delivered_at`, asi que TODAS caian al respaldo —la hora en que la
      pantalla las vio— y ese respaldo las sella a la vez, en el mismo
      instante, al recargar. Empate general y orden al azar.

      `closed_at` es cuando se cobro la mesa, que para el salon es cuando los
      clientes se fueron: no es la hora exacta en que salio el plato, pero
      ordena bien, que es para lo que se usa.                             */
  const t = o.delivered_at || o.estado_at || o.closed_at;
  if (t) {
    const ms = new Date(t).getTime();
    if (isFinite(ms)) return ms;
  }
  if (!S.paro.has(o.id)) S.paro.set(o.id, Date.now());
  return S.paro.get(o.id);
}

/* ── Pintar ─────────────────────────────────────────────────────────────── */
const RELOJ_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const ETIQUETA  = { prep:'En preparación', pago:'Pendiente de pago', listo:'Listo' };

function pintar() {
  const porZona = { salon:[], rapido:[], domicilio:[] };
  /* Con el área en «esconder», una comanda de solo bebidas no tiene NADA que
     hacer en la cocina: pintarla vacía sería peor que no pintarla, porque le
     quita un sitio a una comanda de verdad y el cocinero la mira dos veces
     antes de entender que no es suya. */
  let aLaVista = 0;
  S.orders.forEach(o => {
    const r = repartoDe(S.items.get(o.id));
    if (!r.mios.length && !r.ajenos.length) return;
    aLaVista++;
    porZona[zonaDe(o)].push(o);
  });

  let sonar = false;
  Object.keys(porZona).forEach(z => {
    /*  DOS ORDENES DISTINTOS, PORQUE SIRVEN PARA COSAS DISTINTAS.

        Lo que FALTA por hacer va por hora de llegada, del mas viejo al mas
        nuevo: es una cola, y en una cola atiende primero el que lleva mas
        esperando.

        Lo que YA SALIO va al reves — el ultimo que salio, de primero. Ahi no
        hay cola que respetar: cuando alguien pregunta por un pedido, pregunta
        por el de hace un rato, no por el de hace tres horas. Tenerlo por hora
        de llegada obligaba a recorrer toda la lista para llegar a lo reciente.

        Y se ordena por la hora de SALIDA, no por la de entrada: un pedido que
        entro temprano y se demoro sale despues que uno que entro tarde y fue
        rapido. Es el mismo dato que para el reloj de la tarjeta.          */
    const lista = porZona[z].sort((a,b) => {
      const la = estadoDe(a) === 'listo' ? 1 : 0;
      const lb = estadoDe(b) === 'listo' ? 1 : 0;
      if (la !== lb) return la - lb;
      if (la === 1) return (paroEn(b) || 0) - (paroEn(a) || 0);
      return new Date(a.created_at) - new Date(b.created_at);
    });
    $('n-' + z).textContent = lista.length;
    const cont = $('z-' + z);
    if (!lista.length) {
      cont.innerHTML = '<div class="zona-vacia">Sin comandas</div>';
      return;
    }
    cont.innerHTML = lista.map(o => {
      if (!S.vistas.has(o.id)) { S.vistas.add(o.id); if (!S.arrancando) sonar = true; }
      return tarjeta(o);
    }).join('');
  });

  $('cuenta').textContent = aLaVista;
  if (sonar) sonarUnaVez();
  pintarCursor();
}

function tarjeta(o) {
  const est  = estadoDe(o);
  const mins = minutosDe(o);
  const tarde = est !== 'listo' && mins >= TARDE_MIN;
  const nueva = est === 'prep' && mins < 1;
  const its  = S.items.get(o.id) || [];

  /* Lo que se prepara aquí, y de eso, lo que va en pequeño. Las dos cosas se
     marcan en Configuración: el área dice de qué pantalla es, el tamaño dice
     qué tan grande se lee. */
  const rep_   = repartoDe(its);
  const mios   = rep_.mios;
  const ajenos = rep_.ajenos;   // los marcados como pequeños

  function renglon(i, mini) {
    const nombre = i.product_name || i.name || 'Producto';
    const foto   = S.fotos.get(i.product_id);
    /* LA CANTIDAD, AL LADO DE LA FOTO. Un rato estuvo ENCIMA para ganarle
       31 px al nombre, pero tapaba el plato — y la foto está ahí justamente
       para reconocerlo sin leer. La salida no fue elegir entre las tres cosas
       sino bajar un punto el tamaño de todas: así caben la foto entera, el
       número y el nombre completo. Sergio, 26-ago-2026. */
    const cant = '<span class="it-n">' + (parseInt(i.quantity,10) || 1) + '</span>';
    const img = mini ? cant
      : (foto ? '<img class="it-foto" src="' + esc(foto) + '" alt="" loading="lazy">'
              : '<span class="it-nofoto">sin<br>foto</span>') + cant;
    const adic = adiciones(i);
    return '<div class="it' + (mini ? ' mini' : '') + '">' + img
      + '<span class="it-tx">' + esc(nombre)
      + (adic ? '<em>+ ' + esc(adic) + '</em>' : '')
      + (i.notes ? '<i>' + esc(i.notes) + '</i>' : '')
      + '</span></div>';
  }

  /* Lo pequeño va JUNTO Y AL FINAL, no intercalado: si la gaseosa se mete
     entre dos platos, el cocinero la lee igual y no se ahorró nada. */
  const cuerpo = (mios.map(i => renglon(i, false)).join('')
    + (ajenos.length ? '<div class="it-otros">' + ajenos.map(i => renglon(i, true)).join('') + '</div>' : ''))
    || '<div class="zona-vacia" style="padding:1cqw 0">Sin productos enviados</div>';

  /*  "Deshacer" solo cuando hay algo que deshacer: cuando fue la cocina la
      que la marco lista. En una mesa que el plano ya libero no hay vuelta
      atras —los clientes se fueron y se cobro— y ofrecerla seria devolver la
      comanda a la cola como si faltara preparar algo.                     */
  const sePuedeDeshacer = o.estado === 'listo';
  const accion = est === 'listo'
    ? '<div class="tk-listo"><b>Listo</b>'
      + (sePuedeDeshacer
          ? '<button class="tk-desh" tabindex="-1" data-desh="' + o.id + '">Deshacer</button>'
          : '')
      + '</div>'
    : '<div class="tk-pie"><button class="tk-btn" tabindex="-1" data-listo="' + o.id + '">Listo</button></div>';

  return '<article class="tk ' + est + (tarde ? ' tarde' : '') + (nueva ? ' nueva' : '')
    + '" data-tk="' + o.id + '">'
    + '<div class="tk-cab"><div class="tk-quien">'
    +   '<div class="tk-estado"><i></i>' + ETIQUETA[est] + '</div>'
    +   '<div class="tk-de">' + esc(tituloDe(o)) + '</div>'
    + '</div>'
    + '<div class="tk-min">' + RELOJ_SVG + reloj_mmss(mins) + '</div></div>'
    + '<div class="tk-items">' + cuerpo + '</div>'
    + accion + '</article>';
}

/* NO SE TOCA EL TAMAÑO DEL PLATO (Personal / Familiar / 1.5 Litros).
   El 26-ago-2026 lo saqué del nombre y lo puse en un renglón chiquito para
   ahorrar una línea. Doble error, y Sergio lo paró en seco: el tamaño es de
   lo MÁS importante que lee un cocinero —preparar una familiar creyendo que
   es personal es un plato perdido— así que en pequeño no puede ir. Y encima
   no se ahorraba nada: el renglón chico seguía siendo un renglón.
   Medido, para que no se vuelva a intentar: a 27 px en una tarjeta de 298 px
   el texto tiene 186 px de ancho, y «Familiar ·» solo ya se lleva 140. Que
   «Familiar · Premium · Mixta» ocupe tres renglones NO es un defecto que se
   pueda arreglar moviendo cosas: para que entrara en dos habría que quitar la
   foto o achicar la letra, y las dos están decididas. */

/*  LAS ADICIONES ESTAN EN `selections.mods`, Y AHI NO SE MIRABA.

    Esta funcion recorria `selections` entera buscando algo con `opciones`,
    `options` o `items`. Pero la forma real que guarda la pantalla de tomar
    pedido es otra:

        { "pres": "Personal",
          "vars": { "vg_x": { "name": "Mixta" } },     ← la variante
          "mods": { "op_y": { "name": "Super Queso", "qty": 1 } } }  ← la adicion

    O sea que buscaba en el sitio equivocado y siempre devolvia vacio: al
    cocinero le llegaba la salchipapa sin el Super Queso que el cliente pago.
    Un error caro y silencioso — nadie reclama lo que no sabe que pidio.

    `vars` NO se pone aqui: la variante ya viene dentro del nombre del producto
    ("Personal · Premium · Mixta") y repetirla seria ruido.

    Se deja el recorrido antiguo como respaldo por si algun restaurante tiene
    pedidos guardados con otra forma, pero `mods` es la buena.            */
function adiciones(i) {
  try {
    const s = typeof i.selections === 'string' ? JSON.parse(i.selections) : i.selections;
    if (!s) return '';
    const nombres = [];

    const mods = s.mods;
    if (mods && typeof mods === 'object') {
      Object.keys(mods).forEach(k => {
        const m = mods[k];
        const n = m && (m.name || m.nombre || m.label);
        if (!n) return;
        const q = parseInt(m.qty || m.cantidad, 10) || 1;
        nombres.push(q > 1 ? q + '× ' + n : n);
      });
    }

    if (!nombres.length) {
      (Array.isArray(s) ? s : Object.values(s)).forEach(g => {
        const ops = (g && (g.opciones || g.options || g.items)) || (Array.isArray(g) ? g : null);
        (ops || []).forEach(op => {
          const n = op && (op.nombre || op.name || op.label);
          if (n) nombres.push(n);
        });
      });
    }
    return nombres.join(', ');
  } catch (_) { return ''; }
}

function reloj_mmss(mins) {
  const t = Math.floor(mins * 60);
  return Math.floor(t/60) + ':' + String(t % 60).padStart(2,'0');
}

/* ── Marcar listo ───────────────────────────────────────────────────────── */
document.addEventListener('click', async ev => {
  const bl = ev.target.closest('[data-listo]');
  const bd = ev.target.closest('[data-desh]');
  if (bl) return marcarListo(bl.getAttribute('data-listo'), bl);
  if (bd) return deshacer(bd.getAttribute('data-desh'));
  if (ev.target.closest('#salir')) {
    /* DOS SALIDAS DISTINTAS, y confundirlas cierra la sesion del dueno.
       Con `?volver=1` la pantalla se abrio desde el menu del escritorio: se
       vuelve, no se cierra sesion. Sin el parametro es la tablet de la pared,
       y ahi salir SI es cerrar sesion. */
    if (VOLVER) { location.href = 'dashboard.html'; return; }
    await sb.auth.signOut();
    location.href = 'mesero-login.html';
  }
});

async function marcarListo(id, btn) {
  const o = S.orders.get(id);
  if (!o) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    /*  Se guarda TAMBIEN la hora: es lo que para el reloj de la tarjeta y lo
        que deja saber despues cuanto tardo en hacerse. */
    const ahoraIso = new Date().toISOString();
    const { error } = await sb.from('pos_orders').update({ estado:'listo', estado_at: ahoraIso }).eq('id', id);
    if (error) throw error;
    o.estado = 'listo'; o.estado_at = ahoraIso;
    await mesaAComiendo(o, true);
    pintar();
  } catch (e) {
    console.error('[cocina] no se pudo marcar listo:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Listo'; }
    marcarRed(false);
  }
}

/*  LISTO EN COCINA = COMIENDO EN EL SALON (Sergio, 28-ago-2026).

    Son la misma cosa contada desde dos sitios: cuando la cocina saca el plato,
    la mesa pasa a estar comiendo. Tenerlos separados obligaba a marcarlo dos
    veces —una el cocinero y otra el mesero— y bastaba con que a uno se le
    olvidara para que las dos pantallas dijeran cosas distintas de la misma
    mesa.

    Solo aplica al salon: un domicilio no tiene mesa que cambiar.

    Y NO se escribe si ya esta en ese estado. Cada pantalla escucha los cambios
    de la otra; escribir lo mismo otra vez es un ida y vuelta infinito entre
    las dos esperando a ocurrir.                                            */
async function mesaAComiendo(o, listo) {
  try {
    if (String(o.channel || '').toLowerCase() !== 'salon' || !o.table_id) return;
    const destino = listo ? 'comiendo' : 'esperando';
    const ahora = S.mesaEstado.get(String(o.id));
    if (ahora === destino) return;
    /*  Al deshacer solo se devuelve si la mesa esta en `comiendo` — que es a
        donde la puso este mismo boton. Si el mesero ya la movio a otra cosa,
        mandarla para atras seria pisarle lo suyo. */
    if (!listo && ahora !== 'comiendo') return;
    const patch = { status: destino };
    patch[listo ? 'comiendo_at' : 'esperando_at'] = new Date().toISOString();
    await sb.from('pos_tables').update(patch).eq('id', o.table_id);
    S.mesaEstado.set(String(o.id), destino);
  } catch (e) { console.error('[cocina] la mesa no cambio de estado:', e); }
}

async function deshacer(id) {
  const o = S.orders.get(id);
  if (!o) return;
  try {
    const iso = new Date().toISOString();
    await sb.from('pos_orders').update({ estado:'en_preparacion', estado_at: iso }).eq('id', id);
    o.estado = 'en_preparacion'; o.estado_at = iso;
    await mesaAComiendo(o, false);
    pintar();
  } catch (e) { console.error('[cocina] no se pudo deshacer:', e); }
}

/* ── En vivo ────────────────────────────────────────────────────────────── */
function suscribir() {
  /*  ══ UN FRENO DE 300 ms ANTES DE REDIBUJAR ═════════════════════════════

      Cada aviso de tiempo real llamaba a `cargarComandas`, y `cargarComandas`
      son CUATRO consultas. Una comanda de 6 productos escribe 1 fila de pedido
      y 6 de items: **siete avisos seguidos, veinticuatro consultas**, todas
      para pintar el mismo resultado. Medido: unos 3,6 segundos por comanda.

      El freno no retrasa nada que se note —300 ms— y convierte la rafaga en
      una sola recarga. Si los avisos siguen llegando, el reloj se reinicia:
      mientras el mesero sigue mandando, la pantalla espera a que termine.

      El `_frenoUltimo` es el candado del caso raro: si entran avisos sin parar
      durante mucho rato, se redibuja igual cada 2 segundos en vez de no
      redibujar nunca.                                                        */
  var _frenoT = null, _frenoDesde = 0;
  function cargarComandasFrenado() {
    var ahora = Date.now();
    if (!_frenoDesde) _frenoDesde = ahora;
    if (ahora - _frenoDesde > 2000) {          // lleva 2 s esperando: se pinta ya
      if (_frenoT) { clearTimeout(_frenoT); _frenoT = null; }
      _frenoDesde = 0;
      cargarComandas();
      return;
    }
    if (_frenoT) clearTimeout(_frenoT);
    _frenoT = setTimeout(function () {
      _frenoT = null; _frenoDesde = 0;
      cargarComandas();
    }, 300);
  }

  sb.channel('cocina')
    .on('postgres_changes', { event:'*', schema:'public', table:'pos_orders',
        filter:`branch_id=eq.${S.branchId}` }, cargarComandasFrenado)
    .on('postgres_changes', { event:'*', schema:'public', table:'pos_order_items',
        filter:`branch_id=eq.${S.branchId}` }, cargarComandasFrenado)
    .subscribe(estado => {
      /* SUBSCRIBED es lo único que confirma que los cambios están llegando.
         CHANNEL_ERROR y TIMED_OUT son caída aunque el wifi diga que hay. */
      if (estado === 'SUBSCRIBED') marcarRed(true);
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') marcarRed(false);
    });
}

function marcarRed(ok) {
  if (S.online === ok) return;
  S.online = ok;
  $('caida').hidden = ok;
  $('app').classList.toggle('sinRed', !ok);
}

function vigilarRed() {
  addEventListener('online',  () => { marcarRed(true); cargarComandas(); });
  addEventListener('offline', () => marcarRed(false));
}

/* ── Detalles de pantalla de pared ──────────────────────────────────────── */
function reloj() {
  const d = new Date();
  let h = d.getHours(); const ampm = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  $('reloj').textContent = h + ':' + String(d.getMinutes()).padStart(2,'0') + ' ' + ampm;
}

/* Un pitido corto, generado aquí: no hay archivo que cargar ni que se pueda
   perder. Suena UNA vez por comanda — en una cocina, un aviso que insiste se
   termina apagando. */
let _audio = null;
/* ── EL SONIDO DE COMANDA NUEVA ────────────────────────────────────────────
   Decisión de Sergio (26-ago-2026): que suene en la tablet de la cocina y NO
   en su computador. La pantalla es la misma en los dos, así que en vez de
   adivinar con qué se abrió, el interruptor es DE CADA APARATO: se enciende
   en la tablet y se deja apagado en el escritorio. Mañana pone una segunda
   tablet, o quiere oírlo un día en el computador, y no depende de nada.

   Nace APAGADO a propósito. Y eso resuelve de paso un problema que no se ve:
   los navegadores no dejan sonar nada hasta que alguien toca la pantalla.
   Como encenderlo ES un toque, el mismo gesto que lo activa desbloquea el
   audio. Si naciera encendido, no sonaría y nadie sabría por qué. */
const SONIDO_KEY = 'cobra.cocina.sonido';

/* ¿ESTE APARATO ES LA TABLET DE LA COCINA O EL COMPUTADOR DEL DUEÑO?
   Sergio pidió que en la APK naciera encendido sin tener que ir a buscarlo, y
   que su computador siguiera callado. Son la MISMA pantalla, así que hace
   falta distinguirlos, y hay dos señales fiables:

     · La APK abre `mesero-login.html?app=cocina`, y eso deja una marca en el
       aparato. Solo la tienen las tablets que entraron por la app.
     · El escritorio la abre con `?volver=1` desde el menú lateral. Ese
       parámetro significa literalmente «hay un escritorio al que volver», o
       sea: esto no es una pantalla de pared.

   Y por encima de todo manda lo que la persona haya elegido: si alguna vez
   tocó el altavoz, se respeta y esto no vuelve a opinar. */
function esLaTablet() {
  try {
    if (new URLSearchParams(location.search).get('volver')) return false;
    if (new URLSearchParams(location.search).get('area')) return true;
    return localStorage.getItem('cobra.app.destino') === 'cocina';
  } catch (e) { return false; }
}

function sonidoEncendido() {
  try {
    const v = localStorage.getItem(SONIDO_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return esLaTablet();      // nunca lo han tocado: la tablet suena, el PC no
  } catch (e) { return false; }
}

function pintarSonido() {
  const b = $('son');
  if (!b) return;
  const on = sonidoEncendido();
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.title = on ? 'Sonido encendido en este aparato' : 'Sonido apagado en este aparato';
  b.innerHTML = on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
}

/* EL NAVEGADOR NO DEJA SONAR NADA HASTA QUE ALGUIEN TOCA LA PANTALLA.
   Encender el altavoz ya es un toque y sirve, pero si el cocinero toca antes
   un «Listo» o mueve el control, ese gesto tambien deberia servir — y si no,
   la primera comanda de la noche entra en silencio y nadie entiende por que.
   Con el primer toque, sea el que sea, se abre el audio y se deja abierto. */
/* `var` y no `let` a proposito: esta bandera se declara en la linea 1054 pero
   se usa desde el arranque, en la 452. Hoy funciona porque el arranque se
   detiene en su primer `await` y da tiempo a que el archivo termine de
   leerse — pero con `let`, el dia que alguien mueva una linea antes de ese
   `await`, revienta con un error que no dice nada. */
var _audioAbierto = false;
function abrirAudio() {
  if (_audioAbierto) return;
  _audioAbierto = true;
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    _audio = _audio || new C();
    if (_audio.state === 'suspended') _audio.resume();
    /* Un sonido de cero volumen: no se oye, pero deja el audio despierto. */
    const o = _audio.createOscillator(), g = _audio.createGain();
    g.gain.value = 0;
    o.connect(g); g.connect(_audio.destination);
    o.start(); o.stop(_audio.currentTime + 0.01);
  } catch (_) {}
  /* Y el reproductor de las grabaciones, que tiene el suyo propio. */
  try { if (typeof window.posTocarTono === 'function') window.posTocarTono(S.sonTono, 0); } catch (_) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
  addEventListener(ev, abrirAudio, { once: false, passive: true });
});

function sonarUnaVez() {
  if (!sonidoEncendido()) return;
  try {
    if (typeof window.posTocarTono === 'function') { window.posTocarTono(S.sonTono, S.sonVol); return; }
  } catch (_) { /* abajo, el pitido de respaldo */ }
  /* Respaldo por si el archivo de tonos no cargó: mejor un pitido feo que
     una cocina que no se entera de que entró una comanda. */
  try {
    _audio = _audio || new (window.AudioContext || window.webkitAudioContext)();
    if (_audio.state === 'suspended') _audio.resume();
    const o = _audio.createOscillator(), g = _audio.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(.0001, _audio.currentTime);
    g.gain.exponentialRampToValueAtTime(.28, _audio.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.0001, _audio.currentTime + .45);
    o.connect(g); g.connect(_audio.destination);
    o.start(); o.stop(_audio.currentTime + .5);
  } catch (_) { /* sin sonido la pantalla sirve igual */ }
}

/* La tablet no se puede apagar sola: es una pantalla de pared. */
async function mantenerDespierta() {
  try {
    if (!('wakeLock' in navigator)) return;
    let lock = await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        try { lock = await navigator.wakeLock.request('screen'); } catch (_) {}
        cargarComandas();
      }
    });
  } catch (_) { /* si el aparato no lo permite, se configura a mano */ }
}
