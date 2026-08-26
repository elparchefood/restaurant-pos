/* ══════════════════════════════════════════════════════════════════════════
   COBRA POS · PANTALLA DE COCINA
   Las comandas en vivo, en una tablet colgada en la pared.

   ── DE DÓNDE SALEN LAS COMANDAS ─────────────────────────────────────────
   De `pos_orders.visible_cocina`, que ya existía y ya se pone en `true` al
   enviar la comanda — lo hacen el salón (ventas-salon.js), el bot y el chat.
   No se inventó una señal nueva: esta es la que el sistema ya usa para
   decidir qué se imprime en cocina.

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
  orders:new Map(), items:new Map(), mesas:new Map(), fotos:new Map(),
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
    conTope(sb.from('branches').select('name, cobro_adelantado, brands(name, logo_url)').eq('id', S.branchId).maybeSingle(), 12, 'la sucursal'),
    conTope(sb.from('pos_tables').select('id, name').eq('branch_id', S.branchId), 12, 'las mesas'),
    conTope(sb.from('pos_products').select('id, photo_url').eq('branch_id', S.branchId), 15, 'la carta'),
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
  (prods.data || []).forEach(p => { if (p.photo_url) S.fotos.set(p.id, p.photo_url); });
}

/* ── Las comandas ───────────────────────────────────────────────────────── */
async function cargarComandas() {
  try {
    /* VENTANA DE 8 HORAS, no de 12. Un turno dura cuatro; ocho es holgado.
       Y hace falta un tope: hay pedidos con `delivered_at` en nulo desde hace
       cincuenta dias — nadie los marco entregado y sin tope saldrian en
       cocina para siempre. */
    const desde = new Date(Date.now() - 8 * 3600 * 1000).toISOString();
    const { data:ords, error } = await conTope(sb.from('pos_orders')
      .select('id, channel, status, estado, table_id, turno, customer_name, notes, total, total_final, paid_amount, created_at, delivered_at, visible_cocina')
      .eq('branch_id', S.branchId)
      .eq('visible_cocina', true)
      .gte('created_at', desde)
      .is('delivered_at', null)
      /* `completed` es un pedido TERMINADO (verificado en la base: los
         completed ya estan cobrados y entregados). `paid` NO se excluye: una
         venta rapida se paga ANTES de cocinarse y tiene que seguir en pantalla. */
      .not('status', 'in', '("cancelled","abandoned","completed")')
      .order('created_at', { ascending: true }), 15, 'las comandas');
    if (error) throw error;

    const vivos = (ords || []).filter(o => {
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
      const porOrden = new Map();
      (its || []).forEach(i => {
        /* Solo lo que YA se mandó a cocina. Un ítem agregado y todavía no
           enviado no debe aparecer: el cocinero lo empezaría antes de tiempo. */
        if (!i.kitchen_printed_at) return;
        if (!porOrden.has(i.order_id)) porOrden.set(i.order_id, []);
        porOrden.get(i.order_id).push(i);
      });
      S.items = porOrden;
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
  // En salón solo aplica si la sucursal cobra por adelantado.
  if (canal === 'salon' && !S.cobroAdelantado) return false;
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
  S.orders.forEach(o => porZona[zonaDe(o)].push(o));

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

  $('cuenta').textContent = S.orders.size;
  if (sonar) sonarUnaVez();
}

function tarjeta(o) {
  const est  = estadoDe(o);
  const mins = minutosDe(o);
  const tarde = est !== 'listo' && mins >= TARDE_MIN;
  const nueva = est === 'prep' && mins < 1;
  const its  = S.items.get(o.id) || [];

  const cuerpo = its.map(i => {
    const nombre = i.product_name || i.name || 'Producto';
    const foto   = S.fotos.get(i.product_id);
    const img = foto
      ? '<img class="it-foto" src="' + esc(foto) + '" alt="" loading="lazy">'
      : '<span class="it-nofoto">sin<br>foto</span>';
    const adic = adiciones(i);
    return '<div class="it">' + img
      + '<span class="it-n">' + (parseInt(i.quantity,10) || 1) + '</span>'
      + '<span class="it-tx">' + esc(nombre)
      + (adic ? '<em>+ ' + esc(adic) + '</em>' : '')
      + (i.notes ? '<i>' + esc(i.notes) + '</i>' : '')
      + '</span></div>';
  }).join('') || '<div class="zona-vacia" style="padding:1cqw 0">Sin productos enviados</div>';

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
function sonarUnaVez() {
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
