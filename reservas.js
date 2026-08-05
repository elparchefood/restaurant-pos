/* ═══════════════════════════════════════════════════════════════════════════
   RESERVAS — Cobra POS
   ───────────────────────────────────────────────────────────────────────────
   Reglas de negocio, todas de Sergio (4 de agosto de 2026):

   · INTERRUPTOR. Si el restaurante no acepta reservas, la pantalla se ve pero
     apagada, y el estado "Reservada" ni siquiera existe para el.
   · NADA AUTOMATICO. Todo pasa porque alguien aprieta un boton. Ni siquiera el
     no-show: el sistema avisa y pregunta, nunca libera una mesa solo.
   · "RESERVADA" no es lo mismo que "apartada". Reservada = ya se sentaron con
     su reserva pero todavia no han pedido. Una mesa libre con reserva a las
     20:00 sigue LIBRE: solo lleva una marca para que nadie siente ahi a otros.
   · AL SENTAR CON PEDIDO PREVIO, el pedido se pasa a la mesa con su estado de
     pago. Si no esta pagado manda `branches.cobro_adelantado`:
        encendido  -> la mesa queda PENDIENTE DE PAGO
        apagado    -> el pedido entra directo a preparacion
   · Las mesas son las REALES del restaurante. Si mañana agrega una en
     Configuracion, aparece sola aqui.
   ═══════════════════════════════════════════════════════════════════════════ */

/* OJO: `sb` y `$` los declara pos-core.js, que se carga ANTES que este
   archivo. Si se vuelven a declarar aqui, el navegador tira el archivo entero
   por "identificador ya declarado" y la pantalla se queda en blanco sin decir
   por que. Paso exactamente eso en la primera version. Se usan los de alli. */

const S = {
  tenantId: null, branchId: null, sucursal: '',
  aceptaReservas: false, cobroAdelantado: false,
  dia: new Date(),
  vista: 'agenda',
  filtro: 'todas',
  buscar: '',
  mesas: [], reservas: [], proximas: [], espera: [], historial: [],
  usuario: '',
};

/* ── Formatos ────────────────────────────────────────────────────────────── */
const money = n => '$ ' + (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const hhmm  = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const horaDec = d => d.getHours() + d.getMinutes() / 60;
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const fechaLarga = d => DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const mismoDia = (a, b) => ymd(a) === ymd(b);

const ESTADOS = {
  pendiente:  { txt: 'Por confirmar', cls: 'warn' },
  confirmada: { txt: 'Confirmada',    cls: 'brand' },
  sentada:    { txt: 'Sentada',       cls: 'success' },
  llego:      { txt: 'Sentada',       cls: 'success' },
  cumplida:   { txt: 'Cumplida',      cls: 'success' },
  no_show:    { txt: 'No-show',       cls: 'danger' },
  cancelada:  { txt: 'Cancelada',     cls: 'neutral' },
};
const badge = e => { const x = ESTADOS[e] || ESTADOS.pendiente; return '<span class="cc-badge ' + x.cls + '">' + x.txt + '</span>'; };
const ORIGENES = {
  whatsapp: { txt: 'WhatsApp', color: '#16A34A' },
  telefono: { txt: 'Teléfono', color: '#5B6BFF' },
  web:      { txt: 'Web',      color: '#8B5CF6' },
  mesero:   { txt: 'Personal', color: '#64748B' },
};

function toast(msg) {
  const t = $('rs-toast'); if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 3200);
}

const mesaDe = id => S.mesas.find(m => String(m.id) === String(id)) || null;
const mesaTxt = id => { const m = mesaDe(id); return m ? esc(m.name) + ' <em>· ' + esc(m.zone_name || '') + '</em>' : '<em>Sin asignar</em>'; };

/* ═══ ARRANQUE ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  const u = session.user;
  S.tenantId = u.user_metadata && u.user_metadata.tenant_id || null;
  S.branchId = u.user_metadata && u.user_metadata.branch_id || null;
  S.usuario  = (u.user_metadata && (u.user_metadata.nombre || u.user_metadata.full_name)) || u.email || '';
  const nom = $('rs-user-nom'), rol = $('rs-user-rol');
  if (nom) nom.textContent = S.usuario || 'Mi cuenta';
  if (rol) { const r = (u.user_metadata && u.user_metadata.role) || ''; rol.textContent = r ? r[0].toUpperCase() + r.slice(1) : 'Usuario'; }

  enganchar();
  pintarFecha();
  await cargarConfig();
  await cargarTodo();
});

async function cargarConfig() {
  try {
    const r = await sb.from('branches').select('name, acepta_reservas, cobro_adelantado').eq('id', S.branchId).maybeSingle();
    if (r.data) {
      S.aceptaReservas  = !!r.data.acepta_reservas;
      S.cobroAdelantado = !!r.data.cobro_adelantado;
      S.sucursal = r.data.name || '';
      const sede = $('rs-sede'); if (sede) sede.innerHTML = 'Sede <strong>' + esc(S.sucursal) + '</strong>';
    }
  } catch (e) { console.warn('[reservas] config:', e); }
  aplicarInterruptor();
}

/* Apagado: se ve todo pero no se puede tocar, y se explica donde encenderlo. */
function aplicarInterruptor() {
  document.body.classList.toggle('rs-off', !S.aceptaReservas);
  const av = $('rs-aviso-off'); if (av) av.hidden = S.aceptaReservas;
}

async function cargarTodo() {
  await Promise.all([cargarMesas(), cargarDia(), cargarProximas(), cargarEspera(), cargarHistorial()]);
  pintarTodo();
  if (S.aceptaReservas) revisarNoShows();
}

async function cargarMesas() {
  try {
    const r = await sb.from('pos_tables')
      .select('id,name,capacity,zone_name,status,current_order_id')
      .eq('branch_id', S.branchId).order('sort_order', { ascending: true });
    S.mesas = r.data || [];
  } catch (e) { S.mesas = []; }
}

function rangoDia(d) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(23, 59, 59, 999);
  return [a.toISOString(), b.toISOString()];
}

async function cargarDia() {
  const r0 = rangoDia(S.dia);
  try {
    const r = await sb.from('pos_reservations').select('*')
      .eq('branch_id', S.branchId).gte('reserved_at', r0[0]).lte('reserved_at', r0[1])
      .order('reserved_at', { ascending: true });
    S.reservas = r.data || [];
  } catch (e) { S.reservas = []; }
}

async function cargarProximas() {
  const hoyFin = new Date(); hoyFin.setHours(23, 59, 59, 999);
  try {
    const r = await sb.from('pos_reservations').select('*')
      .eq('branch_id', S.branchId).gt('reserved_at', hoyFin.toISOString())
      .in('status', ['pendiente', 'confirmada'])
      .order('reserved_at', { ascending: true }).limit(100);
    S.proximas = r.data || [];
  } catch (e) { S.proximas = []; }
}

async function cargarEspera() {
  try {
    const r = await sb.from('pos_reservation_waitlist').select('*')
      .eq('branch_id', S.branchId).eq('estado', 'esperando')
      .order('desde', { ascending: true });
    S.espera = r.data || [];
  } catch (e) { S.espera = []; }
}

async function cargarHistorial() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  try {
    const r = await sb.from('pos_reservations').select('*')
      .eq('branch_id', S.branchId).lt('reserved_at', hoy.toISOString())
      .order('reserved_at', { ascending: false }).limit(60);
    S.historial = r.data || [];
  } catch (e) { S.historial = []; }
}

/* ═══ PINTADO ════════════════════════════════════════════════════════════ */
function pintarTodo() {
  pintarFecha(); pintarChips(); pintarStats();
  pintarAgenda(); pintarTimeline(); pintarFranjas();
  pintarProximas(); pintarEspera(); pintarMapa(); pintarHistorial();
  const n1 = $('n-hoy'), n2 = $('n-proximas'), n3 = $('n-espera');
  if (n1) n1.textContent = S.reservas.filter(r => r.status !== 'cancelada').length;
  if (n2) n2.textContent = S.proximas.length;
  if (n3) n3.textContent = S.espera.length;
}

function pintarFecha() { const f = $('rs-fecha'); if (f) f.textContent = fechaLarga(S.dia); }

function visibles() {
  let l = S.reservas.filter(r => r.status !== 'cancelada');
  if (S.filtro === 'pendiente')  l = l.filter(r => r.status === 'pendiente');
  if (S.filtro === 'confirmada') l = l.filter(r => r.status === 'confirmada');
  if (S.filtro === 'sentada')    l = l.filter(r => r.status === 'sentada' || r.status === 'llego');
  if (S.filtro === 'sinmesa')    l = l.filter(r => !r.table_id);
  if (S.buscar) {
    const q = S.buscar.toLowerCase();
    l = l.filter(r => (r.customer_name || '').toLowerCase().indexOf(q) >= 0 || (r.customer_phone || '').indexOf(q) >= 0);
  }
  return l;
}

function pintarChips() {
  const c = $('rs-chips'); if (!c) return;
  const t = S.reservas.filter(r => r.status !== 'cancelada');
  const defs = [
    ['todas', 'Todas', t.length],
    ['pendiente', 'Por confirmar', t.filter(r => r.status === 'pendiente').length],
    ['confirmada', 'Confirmadas', t.filter(r => r.status === 'confirmada').length],
    ['sentada', 'Sentadas', t.filter(r => r.status === 'sentada' || r.status === 'llego').length],
    ['sinmesa', 'Sin mesa', t.filter(r => !r.table_id).length],
  ];
  c.innerHTML = defs.map(d =>
    '<button class="cc-fchip' + (S.filtro === d[0] ? ' on' : '') + '" data-chip="' + d[0] + '">' + d[1] + ' <span>' + d[2] + '</span></button>').join('');
}

function pintarStats() {
  const c = $('rs-stats'); if (!c) return;
  const vivas = S.reservas.filter(r => r.status !== 'cancelada' && r.status !== 'no_show');
  const pend  = S.reservas.filter(r => r.status === 'pendiente').length;
  const pax   = vivas.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
  const conMesa = {};
  S.reservas.forEach(r => { if (r.table_id && r.status !== 'cancelada') conMesa[String(r.table_id)] = 1; });
  const nMesas = Object.keys(conMesa).length;
  const ocup = S.mesas.length ? Math.round(nMesas / S.mesas.length * 100) : 0;

  const ahora = new Date();
  const prox = S.reservas
    .filter(r => r.status === 'confirmada' && new Date(r.reserved_at) > ahora)
    .sort((a, b) => new Date(a.reserved_at) - new Date(b.reserved_at))[0];
  const ns = S.reservas.filter(r => r.status === 'no_show');

  c.innerHTML =
    '<div class="rs-stat"><div class="rs-stat-lbl">Reservas hoy</div><div class="rs-stat-val">' + S.reservas.filter(r => r.status !== 'cancelada').length + '</div><div class="rs-stat-sub">' + pend + ' por confirmar</div></div>' +
    '<div class="rs-stat"><div class="rs-stat-lbl">Comensales esperados</div><div class="rs-stat-val">' + pax + '</div><div class="rs-stat-sub">' + vivas.length + ' reserva' + (vivas.length === 1 ? '' : 's') + '</div></div>' +
    '<div class="rs-stat"><div class="rs-stat-lbl">Ocupación</div><div class="rs-stat-val">' + ocup + '%</div><div class="rs-stat-sub">' + nMesas + ' de ' + S.mesas.length + ' mesas con reserva</div></div>' +
    '<div class="rs-stat"><div class="rs-stat-lbl">Próxima llegada</div><div class="rs-stat-val">' + (prox ? hhmm(new Date(prox.reserved_at)) : '—') + '</div><div class="rs-stat-sub" style="color:var(--brand)">' + (prox ? esc(prox.customer_name) + ' · ' + prox.party_size + ' pax' : 'Sin próximas') + '</div></div>' +
    '<div class="rs-stat"><div class="rs-stat-lbl">No-shows</div><div class="rs-stat-val">' + ns.length + '</div><div class="rs-stat-sub" style="color:var(--danger)">' + (ns.length ? esc(ns[0].customer_name) + ' · ' + hhmm(new Date(ns[0].reserved_at)) : 'Ninguno') + '</div></div>';
}

function acciones(r) {
  const b = [];
  if (r.status === 'pendiente') b.push('<button class="lm-btn-ghost sm js-confirm" data-id="' + r.id + '">Confirmar</button>');
  if (r.status === 'confirmada' || r.status === 'pendiente') {
    b.push('<button class="lm-btn-primary sm js-seat" data-id="' + r.id + '">Sentar</button>');
    b.push('<button class="lm-btn-ghost sm js-mover" data-id="' + r.id + '">Pasar a otra mesa</button>');
    b.push('<button class="lm-btn-ghost sm js-noshow" data-id="' + r.id + '">No-show</button>');
  }
  if (r.status === 'sentada' || r.status === 'llego') {
    b.push('<button class="lm-btn-ghost sm js-abrir" data-id="' + r.id + '">Ver mesa</button>');
  }
  return '<div class="rs-actions">' + b.join('') + '</div>';
}

function filaHTML(r) {
  const d = new Date(r.reserved_at);
  const o = ORIGENES[r.origen] || ORIGENES.telefono;
  const pills = [];
  if (Number(r.abono) > 0) pills.push('<span class="cc-badge brand">Abono ' + money(r.abono) + '</span>');
  if (r.notes) pills.push('<span class="rs-note">' + esc(r.notes) + '</span>');
  if (r.order_id) pills.push('<span class="cc-badge success">Con pedido</span>');
  return '<article class="rs-row" data-id="' + r.id + '">' +
    '<div class="rs-time">' + hhmm(d) + '</div>' +
    '<div><div class="rs-name">' + esc(r.customer_name) + ' ' + pills.join(' ') + '</div>' +
    '<div class="rs-sub">' + esc(r.customer_phone || 'sin teléfono') + ' · ' + (r.duracion_min || 90) + ' min</div></div>' +
    '<div class="rs-pax">' + r.party_size + ' pax</div>' +
    '<div class="rs-mesa">' + mesaTxt(r.table_id) + '</div>' +
    '<div class="rs-origin"><i style="background:' + o.color + '"></i>' + o.txt + '</div>' +
    '<div>' + badge(r.status) + '</div>' + acciones(r) + '</article>';
}

function pintarAgenda() {
  const c = $('view-agenda'); if (!c) return;
  const l = visibles();
  if (!l.length) { c.innerHTML = '<div class="rs-empty">Sin reservas para este día</div>'; return; }
  const grupos = {};
  l.forEach(r => { const h = new Date(r.reserved_at).getHours(); (grupos[h] = grupos[h] || []).push(r); });
  c.innerHTML = Object.keys(grupos).sort((a, b) => a - b).map(h => {
    const g = grupos[h];
    const pax = g.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
    return '<section><div class="rs-hourhead"><span class="rs-hourlbl">' + String(h).padStart(2, '0') + ':00</span>' +
      '<span class="rs-hourline"></span><span class="rs-hourn">' + g.length + ' reserva' + (g.length === 1 ? '' : 's') + ' · ' + pax + ' personas</span></div>' +
      '<div class="rs-rows">' + g.map(filaHTML).join('') + '</div></section>';
  }).join('');
}

const TL_INI = 12, TL_FIN = 23, TL_N = TL_FIN - TL_INI;
function pintarTimeline() {
  const c = $('view-timeline'); if (!c) return;
  if (!S.mesas.length) { c.innerHTML = '<div class="rs-empty">Este restaurante todavía no tiene mesas configuradas</div>'; return; }
  const l = visibles();
  const ahora = new Date();
  const nowPct = mismoDia(ahora, S.dia) ? Math.max(0, Math.min(100, (horaDec(ahora) - TL_INI) / TL_N * 100)) : null;
  const horas = [];
  for (let h = TL_INI; h <= TL_FIN; h++) horas.push('<div class="rs-tl-hour">' + String(h).padStart(2, '0') + ':00</div>');
  let celdas = ''; for (let i = 0; i < TL_N; i++) celdas += '<div class="rs-tl-cell"></div>';

  const COLORES = {
    confirmada: ['#EEF2FF', '#5B6BFF', '#C7D2FE'], pendiente: ['#FFFBEB', '#B45309', '#FDE68A'],
    sentada: ['#DCFCE7', '#15803D', '#BBF7D0'], llego: ['#DCFCE7', '#15803D', '#BBF7D0'],
    no_show: ['#FEF2F2', '#DC2626', '#FECACA'],
  };

  const filas = S.mesas.map((m, i) => {
    const suyas = l.filter(r => String(r.table_id) === String(m.id));
    const bloques = suyas.map(r => {
      const d = new Date(r.reserved_at);
      const left = (horaDec(d) - TL_INI) / TL_N * 100;
      const w = ((r.duracion_min || 90) / 60) / TL_N * 100;
      const col = COLORES[r.status] || ['#F1F5F9', '#64748B', '#E2E8F0'];
      return '<div class="rs-tl-block" data-id="' + r.id + '" style="left:' + left + '%;width:calc(' + w + '% - 4px);background:' + col[0] + ';color:' + col[1] + ';border-color:' + col[2] + '">' +
        '<span class="rs-tl-b-name">' + esc(r.customer_name) + '</span><span class="rs-tl-b-meta">' + hhmm(d) + ' · ' + r.party_size + ' pax</span></div>';
    }).join('');
    const now = nowPct === null ? '' : '<div class="rs-tl-now' + (i === 0 ? ' head' : '') + '" style="left:' + nowPct + '%"></div>';
    return '<div class="rs-tl-row"><div class="rs-tl-mesa">' + esc(m.name) +
      '<span class="rs-tl-cap">' + (m.capacity || 4) + ' pax · ' + esc(m.zone_name || '') + '</span></div>' +
      '<div class="rs-tl-track"><div class="rs-tl-grid" style="grid-template-columns:repeat(' + TL_N + ',1fr)">' + celdas + '</div>' + bloques + now + '</div></div>';
  }).join('');

  c.innerHTML = '<div class="rs-tl"><div class="rs-tl-head"><div class="rs-tl-corner">Mesa</div>' +
    '<div class="rs-tl-hours" style="grid-template-columns:repeat(' + horas.length + ',1fr)">' + horas.join('') + '</div></div>' + filas + '</div>';
}

function pintarFranjas() {
  const c = $('view-bands'); if (!c) return;
  const l = visibles();
  const defs = [['Almuerzo', '12:00 – 16:00', 12, 16], ['Tarde', '16:00 – 19:00', 16, 19], ['Noche', '19:00 – 23:00', 19, 23]];
  c.innerHTML = '<div class="rs-bands">' + defs.map(d => {
    const g = l.filter(r => { const h = new Date(r.reserved_at).getHours(); return h >= d[2] && h < d[3]; });
    const pax = g.reduce((s, r) => s + (Number(r.party_size) || 0), 0);
    const cards = g.length ? g.map(r => {
      const f = new Date(r.reserved_at);
      const o = ORIGENES[r.origen] || ORIGENES.telefono;
      const m = mesaDe(r.table_id);
      return '<div class="rs-mini" data-id="' + r.id + '"><div class="rs-mini-top"><span class="rs-mini-time">' + hhmm(f) + '</span>' + badge(r.status) + '</div>' +
        '<div class="rs-mini-name">' + esc(r.customer_name) + '</div>' +
        '<div class="rs-mini-meta">' + r.party_size + ' pax · ' + (m ? esc(m.name) : 'sin mesa') + ' · ' + o.txt + '</div></div>';
    }).join('') : '<div class="rs-empty">Sin reservas en esta franja</div>';
    return '<section class="rs-band"><div class="rs-band-head"><div><div class="rs-band-title">' + d[0] + '</div><div class="rs-band-sub">' + d[1] + '</div></div>' +
      '<div style="text-align:right"><div class="rs-band-title">' + g.length + '</div><div class="rs-band-sub">' + pax + ' pax</div></div></div>' + cards + '</section>';
  }).join('') + '</div>';
}

function pintarProximas() {
  const c = $('rs-proximas'); if (!c) return;
  if (!S.proximas.length) { c.innerHTML = '<div class="rs-empty">No hay reservas para los próximos días</div>'; return; }
  const porDia = {};
  S.proximas.forEach(r => { const k = ymd(new Date(r.reserved_at)); (porDia[k] = porDia[k] || []).push(r); });
  c.innerHTML = '<div class="rs-agenda">' + Object.keys(porDia).sort().map(k => {
    const d = new Date(porDia[k][0].reserved_at);
    const pax = porDia[k].reduce((s, r) => s + (Number(r.party_size) || 0), 0);
    return '<section><div class="rs-hourhead"><span class="rs-hourlbl">' + fechaLarga(d) + '</span><span class="rs-hourline"></span>' +
      '<span class="rs-hourn">' + porDia[k].length + ' reserva' + (porDia[k].length === 1 ? '' : 's') + ' · ' + pax + ' personas</span></div>' +
      '<div class="rs-rows">' + porDia[k].map(filaHTML).join('') + '</div></section>';
  }).join('') + '</div>';
}

function pintarEspera() {
  const c = $('rs-espera'); if (!c) return;
  if (!S.espera.length) { c.innerHTML = '<div class="rs-empty">No hay nadie esperando mesa</div>'; return; }
  const ahora = Date.now();
  c.innerHTML = '<div class="rs-wait">' + S.espera.map(w => {
    const min = Math.max(0, Math.round((ahora - new Date(w.desde).getTime()) / 60000));
    const urg = min > 30;
    return '<div class="rs-waitcard' + (urg ? ' urgent' : '') + '">' +
      '<div class="rs-mini-top"><div class="rs-name">' + esc(w.nombre) + '</div><span class="cc-badge ' + (urg ? 'danger' : 'warn') + '">' + min + ' min</span></div>' +
      '<div class="rs-sub">' + esc(w.telefono || 'sin teléfono') + ' · ' + w.personas + ' pax' + (w.zona ? ' · ' + esc(w.zona) : '') + '</div>' +
      '<div class="rs-actions"><button class="lm-btn-primary sm js-espera-sentar" data-id="' + w.id + '">Asignar mesa</button></div></div>';
  }).join('') + '</div>';
}

/* Mapa: mesas reales. Una mesa LIBRE con reserva mas tarde SIGUE LIBRE, solo
   lleva la marca "Reservada HH:MM" para que nadie siente ahi por error. */
function pintarMapa() {
  const c = $('rs-mapa'); if (!c) return;
  if (!S.mesas.length) { c.innerHTML = '<div class="rs-empty">Este restaurante todavía no tiene mesas configuradas</div>'; return; }
  const zonas = {};
  S.mesas.forEach(m => { const z = m.zone_name || 'Sin zona'; (zonas[z] = zonas[z] || []).push(m); });
  const ahora = new Date();
  c.innerHTML = Object.keys(zonas).sort().map(z => {
    const cards = zonas[z].map(m => {
      const prox = S.reservas.filter(r => String(r.table_id) === String(m.id) &&
          (r.status === 'pendiente' || r.status === 'confirmada') && new Date(r.reserved_at) >= ahora)
        .sort((a, b) => new Date(a.reserved_at) - new Date(b.reserved_at))[0];
      const ocupada = m.status && m.status !== 'libre';
      const dot = m.status === 'reservada' ? 'reservada' : (ocupada ? 'ocupada' : (prox ? 'reservada' : 'libre'));
      const estado = m.status === 'reservada' ? 'Reservada · falta el pedido' : (ocupada ? 'Ocupada' : 'Libre');
      return '<div class="rs-table-card' + (!ocupada && prox ? ' apartada' : '') + '" data-mesa="' + m.id + '">' +
        '<div class="rs-table-top"><span class="rs-table-id">' + esc(m.name) + '</span><span class="rs-dot ' + dot + '"></span></div>' +
        '<div class="rs-table-cap">' + (m.capacity || 4) + ' pax</div>' +
        '<div class="rs-table-res">' + estado + '</div>' +
        (!ocupada && prox ? '<span class="rs-apartada-tag">Reservada ' + hhmm(new Date(prox.reserved_at)) + ' · ' + esc(prox.customer_name) + '</span>' : '') +
        '</div>';
    }).join('');
    return '<section class="rs-zone"><div class="rs-zone-head"><div class="rs-zone-title">' + esc(z) + '</div></div><div class="rs-map">' + cards + '</div></section>';
  }).join('');
}

function pintarHistorial() {
  const c = $('rs-historial'); if (!c) return;
  if (!S.historial.length) { c.innerHTML = '<div class="rs-empty">Todavía no hay historial</div>'; return; }
  c.innerHTML = '<div class="rs-table"><div class="rs-th"><div>Fecha</div><div>Cliente</div><div>Pax</div><div>Mesa</div><div>Origen</div><div>Estado</div></div>' +
    S.historial.map(r => {
      const d = new Date(r.reserved_at);
      const o = ORIGENES[r.origen] || ORIGENES.telefono;
      const m = mesaDe(r.table_id);
      return '<div class="rs-td"><div>' + ymd(d) + ' ' + hhmm(d) + '</div><div>' + esc(r.customer_name) + '</div><div>' + r.party_size + '</div>' +
        '<div>' + (m ? esc(m.name) : '—') + '</div><div>' + o.txt + '</div><div>' + badge(r.status) + '</div></div>';
    }).join('') + '</div>';
}

/* ═══ AVISO DE NO-SHOW — pregunta, nunca decide ══════════════════════════ */
async function revisarNoShows() {
  try {
    const r = await sb.rpc('fn_reservas_sin_llegar', { p_branch: S.branchId, p_minutos: 20 });
    const l = (r.data || []).filter(x => mismoDia(new Date(x.reserved_at), S.dia));
    const av = $('rs-aviso-noshow'); if (!av) return;
    if (!l.length) { av.hidden = true; return; }
    av.hidden = false;
    $('rs-noshow-tit').textContent = l.length === 1 ? 'Una reserva no se ha presentado' : l.length + ' reservas no se han presentado';
    $('rs-noshow-sub').innerHTML = l.map(x =>
      '<strong>' + esc(x.customer_name) + '</strong> · ' + hhmm(new Date(x.reserved_at)) + ' · ' + x.minutos_tarde + ' min de retraso').join(' &nbsp;·&nbsp; ');
    $('rs-noshow-btns').innerHTML = l.map(x =>
      '<button class="lm-btn-ghost sm js-noshow" data-id="' + x.id + '">Marcar no-show y liberar</button>').join('');
  } catch (e) { console.warn('[reservas] aviso no-show:', e); }
}

/* ═══ ACCIONES ═══════════════════════════════════════════════════════════ */
const resDe = id => S.reservas.filter(r => r.id === id)[0] || S.proximas.filter(r => r.id === id)[0] || null;

async function confirmar(id) {
  const r = await sb.from('pos_reservations').update({ status: 'confirmada' }).eq('id', id);
  if (r.error) return toast('No se pudo confirmar: ' + r.error.message);
  toast('Reserva confirmada');
  await cargarTodo();
}

async function marcarNoShow(id) {
  const r = resDe(id);
  const upd = await sb.from('pos_reservations').update({ status: 'no_show' }).eq('id', id);
  if (upd.error) return toast('No se pudo marcar: ' + upd.error.message);
  /* Solo se libera la mesa si estaba RESERVADA por esta reserva: si alguien ya
     esta comiendo ahi, no se toca nada. */
  if (r && r.table_id) {
    const m = mesaDe(r.table_id);
    if (m && m.status === 'reservada') {
      await sb.from('pos_tables').update({ status: 'libre', current_order_id: null }).eq('id', r.table_id);
    }
  }
  toast('Marcada como no-show. La mesa queda libre.');
  await cargarTodo();
}

/* SENTAR — el corazon de la pantalla.
   Sin pedido previo  -> la mesa queda "reservada" (sentados, sin pedir).
   Con pedido previo  -> el pedido se pasa a la mesa con su estado de pago. */
async function sentar(id, mesaId) {
  const r = resDe(id); if (!r) return;
  const mesa = mesaDe(mesaId || r.table_id);
  if (!mesa) return toast('Elige una mesa primero');
  if (mesa.status && mesa.status !== 'libre') return toast('Esa mesa está ocupada. Pásala a otra.');

  let estadoMesa = 'reservada', aviso = 'Mesa reservada · falta tomar el pedido';

  if (r.order_id) {
    const o = await sb.from('pos_orders').select('id,status,total,paid_amount').eq('id', r.order_id).maybeSingle();
    const ped = o.data;
    if (ped) {
      const pagado = ped.status === 'paid' || (Number(ped.paid_amount) || 0) >= (Number(ped.total) || 0);
      if (pagado)                 { estadoMesa = 'comiendo';       aviso = 'Mesa abierta · el pedido ya venía pagado'; }
      else if (S.cobroAdelantado) { estadoMesa = 'pendiente_pago'; aviso = 'Mesa abierta · pendiente de pago'; }
      else                        { estadoMesa = 'esperando';      aviso = 'Mesa abierta · el pedido pasa a preparación'; }
      await sb.from('pos_orders').update({ table_id: mesa.id, channel: 'salon' }).eq('id', ped.id);
    }
  }

  const up = await sb.from('pos_tables')
    .update({ status: estadoMesa, current_order_id: r.order_id || null, sesion_at: new Date().toISOString() })
    .eq('id', mesa.id);
  if (up.error) return toast('No se pudo abrir la mesa: ' + up.error.message);

  await sb.from('pos_reservations').update({
    status: 'sentada', seated_at: new Date().toISOString(), table_id: mesa.id
  }).eq('id', id);

  cerrar('modal-seat');
  toast(aviso);
  await cargarTodo();
}

/* MOVER a otra mesa, con rastro de quien y cuando. */
async function mover(id, nuevaId) {
  const r = resDe(id); if (!r) return;
  const up = await sb.from('pos_reservations').update({
    table_id: nuevaId,
    mesa_anterior: r.table_id || null,
    movida_por: S.usuario || null,
    movida_at: new Date().toISOString(),
  }).eq('id', id);
  if (up.error) return toast('No se pudo mover: ' + up.error.message);
  cerrar('modal-mover');
  const m = mesaDe(nuevaId);
  toast('Reserva pasada a ' + (m ? m.name : 'otra mesa'));
  await cargarTodo();
}

/* ═══ MODALES ════════════════════════════════════════════════════════════ */
function ovDe(id) { return $('ov-' + id.replace('modal-', '').replace('drawer-', '')); }
function abrir(id) { const e = $(id); if (e) e.hidden = false; const o = ovDe(id); if (o) o.hidden = false; }
function cerrar(id) { const e = $(id); if (e) e.hidden = true; const o = ovDe(id); if (o) o.hidden = true; }

function abrirSentar(id) {
  const r = resDe(id); if (!r) return;
  const libres = S.mesas.filter(m => !m.status || m.status === 'libre');
  const suya = mesaDe(r.table_id);
  const puedeSuya = suya && (!suya.status || suya.status === 'libre');
  const opciones =
    (puedeSuya ? '<option value="' + suya.id + '">' + esc(suya.name) + ' · ' + esc(suya.zone_name || '') + ' (la de su reserva)</option>' : '') +
    libres.filter(m => !puedeSuya || String(m.id) !== String(suya.id))
      .map(m => '<option value="' + m.id + '">' + esc(m.name) + ' · ' + esc(m.zone_name || '') + ' · ' + (m.capacity || 4) + ' pax</option>').join('');

  const explica = r.order_id
    ? '<div class="rs-aviso" style="margin:14px 0 0"><div class="rs-aviso-ic">✓</div><div>' +
      '<div class="rs-aviso-tit">Este cliente ya hizo su pedido</div><div class="rs-aviso-sub">Al sentarlo, el pedido se pasa a la mesa. ' +
      (S.cobroAdelantado
        ? 'Como el cobro adelantado está encendido, si no está pagado la mesa quedará <strong>pendiente de pago</strong>.'
        : 'Como el cobro adelantado está apagado, el pedido entra directo a <strong>preparación</strong>.') +
      '</div></div></div>'
    : '<div class="rs-aviso" style="margin:14px 0 0"><div class="rs-aviso-ic">i</div><div>' +
      '<div class="rs-aviso-tit">Sin pedido previo</div><div class="rs-aviso-sub">La mesa quedará en estado <strong>Reservada</strong>: sentados, pendientes de que el mesero les tome el pedido.</div></div></div>';

  $('seat-body').innerHTML =
    '<div class="rs-summary" style="grid-template-columns:1fr"><div class="rs-name">' + esc(r.customer_name) + '</div>' +
    '<div class="rs-sub">' + r.party_size + ' personas · ' + hhmm(new Date(r.reserved_at)) + '</div></div>' + explica +
    '<div class="cc-field" style="margin-top:14px"><label class="cc-label">Mesa</label>' +
    '<select class="cc-input" id="seat-mesa-sel">' + opciones + '</select>' +
    (libres.length ? '' : '<div class="rs-aviso-sub" style="margin-top:8px">No hay mesas libres en este momento.</div>') + '</div>';
  const ok = $('btn-seat-ok');
  ok.dataset.id = id;
  ok.disabled = !libres.length;
  abrir('modal-seat');
}

function abrirMover(id) {
  const r = resDe(id); if (!r) return;
  const libres = S.mesas.filter(m => (!m.status || m.status === 'libre') && String(m.id) !== String(r.table_id));
  const actual = mesaDe(r.table_id);
  $('mover-body').innerHTML =
    '<div class="rs-summary" style="grid-template-columns:1fr"><div class="rs-name">' + esc(r.customer_name) + '</div>' +
    '<div class="rs-sub">' + r.party_size + ' personas · ' + hhmm(new Date(r.reserved_at)) + ' · ahora en ' + (actual ? esc(actual.name) : 'sin mesa') + '</div></div>' +
    '<div style="margin-top:14px">' + (libres.length
      ? libres.map(m => '<button class="lm-btn-ghost js-mover-a" data-id="' + r.id + '" data-mesa="' + m.id + '" style="width:100%;justify-content:space-between;margin-bottom:8px">' +
          '<span>' + esc(m.name) + ' · ' + esc(m.zone_name || '') + '</span><span>' + (m.capacity || 4) + ' pax</span></button>').join('')
      : '<div class="rs-empty">No hay mesas libres ahora mismo</div>') + '</div>';
  abrir('modal-mover');
}

/* ═══ CAJON · NUEVA RESERVA ══════════════════════════════════════════════ */
let PAX = 2;
function abrirDrawer() {
  PAX = 2; $('pax-val').textContent = PAX;
  $('f-nombre').value = ''; $('f-tel').value = ''; $('f-abono').value = ''; $('f-notas').value = '';
  $('f-fecha').value = ymd(S.dia);
  const zonas = [];
  S.mesas.forEach(m => { const z = m.zone_name || 'Sin zona'; if (zonas.indexOf(z) < 0) zonas.push(z); });
  $('f-zona').innerHTML = '<option value="">Cualquiera</option>' + zonas.map(z => '<option>' + esc(z) + '</option>').join('');
  pintarSlots(); pintarMesasDrawer();
  abrir('drawer-nueva');
}

function pintarSlots() {
  const c = $('f-slots'); if (!c) return;
  const out = [];
  for (let h = TL_INI; h < TL_FIN; h++) {
    [0, 30].forEach(m => {
      const t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      out.push('<button type="button" class="rs-slot" data-h="' + t + '">' + t + '</button>');
    });
  }
  c.innerHTML = out.join('');
}

function pintarMesasDrawer() {
  const z = $('f-zona').value;
  const caben = S.mesas.filter(m => (!z || (m.zone_name || 'Sin zona') === z) && (m.capacity || 4) >= PAX);
  /* La sugerida es la mesa mas pequeña donde quepan: no se desperdicia una
     mesa de 8 para dos personas. */
  const orden = caben.slice().sort((a, b) => (a.capacity || 4) - (b.capacity || 4));
  $('f-mesa').innerHTML = '<option value="">Sin asignar</option>' +
    orden.map((m, i) => '<option value="' + m.id + '"' + (i === 0 ? ' selected' : '') + '>' +
      esc(m.name) + ' · ' + esc(m.zone_name || '') + ' · ' + (m.capacity || 4) + ' pax' + (i === 0 ? ' (sugerida)' : '') + '</option>').join('');
}

async function guardarReserva() {
  const nombre = $('f-nombre').value.trim();
  const tel = $('f-tel').value.trim();
  const slot = document.querySelector('#f-slots .rs-slot.on');
  if (!nombre) return toast('Falta el nombre del cliente');
  if (!tel)    return toast('Falta el teléfono');
  if (!slot)   return toast('Elige una hora');

  const partes = slot.dataset.h.split(':');
  const f = $('f-fecha').value ? new Date($('f-fecha').value + 'T00:00:00') : new Date(S.dia);
  f.setHours(Number(partes[0]), Number(partes[1]), 0, 0);

  const mesaId = $('f-mesa').value || null;
  const dur = Number($('f-dur').value) || 90;

  /* Aviso de choque. AVISA, no bloquea: a veces el dueño sabe algo que el
     sistema no (van a juntar mesas, el cliente sale antes...). */
  if (mesaId) {
    const ini = f.getTime(), fin = ini + dur * 60000;
    const choca = S.reservas.some(r => {
      if (String(r.table_id) !== String(mesaId)) return false;
      if (['pendiente', 'confirmada', 'sentada'].indexOf(r.status) < 0) return false;
      const a = new Date(r.reserved_at).getTime();
      return ini < a + (r.duracion_min || 90) * 60000 && a < fin;
    });
    if (choca && !confirm('Esa mesa ya tiene una reserva a esa hora. ¿La apartas igual?')) return;
  }

  const origen = $('f-origen').value;
  const ins = await sb.from('pos_reservations').insert([{
    tenant_id: S.tenantId, branch_id: S.branchId,
    customer_name: nombre, customer_phone: tel,
    party_size: PAX, reserved_at: f.toISOString(),
    table_id: mesaId, duracion_min: dur, origen: origen,
    abono: Number(String($('f-abono').value).replace(/[^0-9]/g, '')) || 0,
    notes: $('f-notas').value.trim() || null,
    /* Si la creo el personal ya esta confirmada; si entro por la web, no. */
    status: origen === 'web' ? 'pendiente' : 'confirmada',
    created_by: S.usuario || null,
  }]);
  if (ins.error) return toast('No se pudo guardar: ' + ins.error.message);
  cerrar('drawer-nueva');
  toast('Reserva creada para el ' + fechaLarga(f).toLowerCase());
  S.dia = new Date(f);
  await cargarTodo();
}

/* ═══ ENGANCHES ══════════════════════════════════════════════════════════ */
function enganchar() {
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, .rs-mesacard, .rs-tl-block, .rs-mini');
    if (!t) return;

    if (t.classList.contains('cc-tab')) {
      document.querySelectorAll('.cc-tab').forEach(b => b.classList.remove('on'));
      t.classList.add('on');
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
      const s = $('screen-' + t.dataset.screen); if (s) s.classList.add('on');
      $('crumb').textContent = t.dataset.crumb || 'Reservas';
      return;
    }
    if (t.dataset.chip) { S.filtro = t.dataset.chip; pintarChips(); pintarAgenda(); pintarTimeline(); pintarFranjas(); return; }
    if (t.dataset.view) {
      S.vista = t.dataset.view;
      document.querySelectorAll('#rs-seg button').forEach(b => b.classList.toggle('on', b === t));
      ['agenda', 'timeline', 'bands'].forEach(v => { const e = $('view-' + v); if (e) e.hidden = (v !== S.vista); });
      return;
    }
    if (t.id === 'day-prev')  { S.dia.setDate(S.dia.getDate() - 1); await cargarDia(); pintarTodo(); return; }
    if (t.id === 'day-next')  { S.dia.setDate(S.dia.getDate() + 1); await cargarDia(); pintarTodo(); return; }
    if (t.id === 'day-today') { S.dia = new Date(); await cargarDia(); pintarTodo(); return; }

    if (t.classList.contains('js-open-drawer')) { abrirDrawer(); return; }
    if (t.classList.contains('js-open-ai'))     { abrir('modal-ai'); return; }
    if (t.classList.contains('js-close'))       { cerrar(t.dataset.close); return; }

    if (t.classList.contains('js-confirm')) { await confirmar(t.dataset.id); return; }
    if (t.classList.contains('js-seat'))    { abrirSentar(t.dataset.id); return; }
    if (t.classList.contains('js-mover'))   { abrirMover(t.dataset.id); return; }
    if (t.classList.contains('js-mover-a')) { await mover(t.dataset.id, t.dataset.mesa); return; }
    if (t.classList.contains('js-noshow'))  { await marcarNoShow(t.dataset.id); return; }
    if (t.id === 'btn-seat-ok')             { const sel = $('seat-mesa-sel'); await sentar(t.dataset.id, sel && sel.value); return; }
    if (t.classList.contains('js-abrir'))   { const r = resDe(t.dataset.id); if (r && r.table_id) window.location.href = 'tomar-pedido.html?table=' + r.table_id; return; }

    if (t.id === 'pax-minus') { PAX = Math.max(1, PAX - 1); $('pax-val').textContent = PAX; pintarMesasDrawer(); return; }
    if (t.id === 'pax-plus')  { PAX = PAX + 1; $('pax-val').textContent = PAX; pintarMesasDrawer(); return; }
    if (t.classList.contains('rs-slot')) {
      document.querySelectorAll('#f-slots .rs-slot').forEach(b => b.classList.remove('on'));
      t.classList.add('on'); return;
    }
    if (t.id === 'btn-save') { await guardarReserva(); return; }
  });

  document.querySelectorAll('.cc-overlay').forEach(o => o.addEventListener('click', () => {
    ['drawer-nueva', 'modal-seat', 'modal-mover', 'modal-ai'].forEach(cerrar);
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ['drawer-nueva', 'modal-seat', 'modal-mover', 'modal-ai'].forEach(cerrar);
  });

  const zona = $('f-zona'); if (zona) zona.addEventListener('change', pintarMesasDrawer);
  const buscar = $('rs-buscar');
  if (buscar) buscar.addEventListener('input', () => { S.buscar = buscar.value.trim(); pintarAgenda(); pintarTimeline(); pintarFranjas(); });

  /* El contador de minutos de la lista de espera corre solo. */
  setInterval(() => { if (S.espera.length) pintarEspera(); }, 60000);
}
