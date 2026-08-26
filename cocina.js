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
const IRSE_SEG    = 30;    // lo que dura en pantalla una comanda ya lista
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
  orders:new Map(), items:new Map(), mesas:new Map(), fotos:new Map(),
  /* categoria de cada producto: es por donde se resuelve su area */
  catDe:new Map(),
  vistas:new Set(),          // comandas que ya sonaron
  listas:new Map(),          // id -> hora en que se marcó lista (para el deshacer)
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
/* El interruptor del sonido. Al encenderlo suena una vez: así se comprueba
   en el momento, sin esperar a que entre una comanda de verdad. */
addEventListener('click', function (ev) {
  const s = ev.target && ev.target.closest && ev.target.closest('#son');
  if (!s) return;
  const nuevo = !sonidoEncendido();
  try { localStorage.setItem(SONIDO_KEY, nuevo ? '1' : '0'); } catch (e) {}
  pintarSonido();
  if (nuevo) { try { window.posTocarTono(S.sonTono, S.sonVol); } catch (e) {} }
});

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
  const cn = op.cocinaNotif || {};
  S.sonTono = cn.tono || 'caja';
  S.sonVol  = (typeof cn.vol === 'number') ? cn.vol : 80;
  pintarSonido();
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
async function cargarComandas() {
  try {
    const CAMPOS = 'id, channel, status, estado, table_id, turno, customer_name, notes, total, total_final, paid_amount, created_at, delivered_at, visible_cocina';
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
      conTope(sb.from('pos_orders').select(CAMPOS)
        .eq('branch_id', S.branchId)
        .eq('visible_cocina', true)
        .gte('created_at', desde)
        .is('delivered_at', null)
        .not('status', 'in', FUERA)
        .order('created_at', { ascending: true }), 15, 'las comandas')
    ];
    if (idsMesa.length) {
      consultas.push(conTope(sb.from('pos_orders').select(CAMPOS)
        .in('id', idsMesa)
        .is('delivered_at', null)
        .not('status', 'in', FUERA), 15, 'las comandas de las mesas'));
    }
    const partes = await Promise.all(consultas);
    const porId = new Map();
    partes.forEach(r => {
      if (r.error) throw r.error;
      (r.data || []).forEach(x => porId.set(x.id, x));
    });
    const ords = [...porId.values()].sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));

    const vivos = (ords || []).filter(o => {
      /* Del salón solo entra la mesa que el plano tiene ocupada. Si el mesero
         la liberó, la comanda se va de las dos pantallas a la vez. */
      if (zonaDe(o) === 'salon' && !S.mesaEstado.has(o.id)) return false;
      /* Los estados que ya pasaron por cocina no vuelven a entrar. */
      if (['en_camino','entregado'].indexOf(o.estado) >= 0) return false;
      /* Una comanda lista se queda 30 segundos y se va sola, con deshacer. */
      if (o.estado === 'listo') {
        const t = S.listas.get(o.id);
        if (!t) { S.listas.set(o.id, Date.now()); return true; }
        return (Date.now() - t) < IRSE_SEG * 1000;
      }
      S.listas.delete(o.id);
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
  } catch (e) {
    console.error('[cocina] no se pudieron traer las comandas:', e);
    marcarRed(false);
  }
}

/* ── Qué estado le toca a cada comanda ──────────────────────────────────── */
function estadoDe(o) {
  if (o.estado === 'listo') return 'listo';
  if (debePagar(o)) return 'pago';
  return 'prep';
}

function debePagar(o) {
  const canal = String(o.channel || '').toLowerCase();
  // El domicilio se paga al recibir: en cocina no va ningún dato de pago.
  if (canal === 'domicilio' || canal === 'whatsapp') return false;
  /* En salón manda el estado DE LA MESA, el mismo que pinta el plano de
     ventas: `pendiente_pago` es rojo allá y rojo aquí. No se recalcula a
     partir de lo pagado, porque entonces las dos pantallas podrían decir
     cosas distintas de la misma mesa. */
  if (canal === 'salon') {
    if (!S.cobroAdelantado) return false;
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
  if (z === 'rapido') return 'Turno ' + (o.turno ? '#' + String(o.turno).padStart(3,'0') : '');
  /* En domicilio va el BARRIO, no el nombre ni la dirección: es una pantalla
     colgada en la pared que ve todo el que pasa. El barrio sí sirve — dice si
     hay que empacar para viaje. */
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
  return Math.max(0, (Date.now() - desde) / 60000);
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
    const lista = porZona[z].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
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

  const accion = est === 'listo'
    ? '<div class="tk-listo"><b>Listo</b><button class="tk-desh" data-desh="' + o.id + '">Deshacer</button></div>'
    : '<div class="tk-pie"><button class="tk-btn" data-listo="' + o.id + '">Listo</button></div>';

  return '<article class="tk ' + est + (tarde ? ' tarde' : '') + (nueva ? ' nueva' : '') + '">'
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

/* Las adiciones vienen dentro de `selections`, que es el mismo formato que
   arma la pantalla de tomar pedido. */
function adiciones(i) {
  try {
    const s = typeof i.selections === 'string' ? JSON.parse(i.selections) : i.selections;
    if (!s) return '';
    const nombres = [];
    (Array.isArray(s) ? s : Object.values(s)).forEach(g => {
      const ops = (g && (g.opciones || g.options || g.items)) || (Array.isArray(g) ? g : null);
      (ops || []).forEach(op => {
        const n = op && (op.nombre || op.name || op.label);
        if (n) nombres.push(n);
      });
    });
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
    const { error } = await sb.from('pos_orders').update({ estado:'listo' }).eq('id', id);
    if (error) throw error;
    o.estado = 'listo';
    S.listas.set(id, Date.now());
    pintar();
  } catch (e) {
    console.error('[cocina] no se pudo marcar listo:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Listo'; }
    marcarRed(false);
  }
}

async function deshacer(id) {
  const o = S.orders.get(id);
  if (!o) return;
  try {
    await sb.from('pos_orders').update({ estado:'en_preparacion' }).eq('id', id);
    o.estado = 'en_preparacion';
    S.listas.delete(id);
    pintar();
  } catch (e) { console.error('[cocina] no se pudo deshacer:', e); }
}

/* ── En vivo ────────────────────────────────────────────────────────────── */
function suscribir() {
  sb.channel('cocina')
    .on('postgres_changes', { event:'*', schema:'public', table:'pos_orders',
        filter:`branch_id=eq.${S.branchId}` }, cargarComandas)
    .on('postgres_changes', { event:'*', schema:'public', table:'pos_order_items',
        filter:`branch_id=eq.${S.branchId}` }, cargarComandas)
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

function sonidoEncendido() {
  try { return localStorage.getItem(SONIDO_KEY) === '1'; } catch (e) { return false; }
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
