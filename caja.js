/* ============================================================
   caja.js  —  Cobra POS · Módulo de Caja
   ============================================================ */

const S = {
  session: null, orders: [], items: [], sessions: [],
  branchId: null, tenantId: null, user: null, arqueoContado: null,
  histSessionId: 'current',   // turno mostrado en Historial de ventas
  histSessions: [],           // turnos listados en el selector (recientes o de una fecha)
  histCajero: '',             // filtro por cajero en el selector
  histOrdersAll: [], histItemsAll: [],   // set completo del turno mostrado
  histFilters: { estado:'todas', canal:'todos', pago:'todos', producto:'', fecha:'', orden:'hora_desc' },
  payMethods: []   // métodos configurados (para el desglose por medio de pago)
};


// SVGs de medios de pago (coinciden con el diseño)
const MEDIO_SVG = {
  efectivo:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  tarjeta:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  transferencia: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>',
  nequi:         '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
  daviplata:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
};

// (Se eliminó la lista fija de métodos de pago: la fuente de verdad es
//  "Métodos de pago" → ia_config.pagos, cargada en S.payMethods.)

// Rellena con los métodos CONFIGURADOS: el filtro del historial y los botones
// de medio en ingresos/egresos. Antes estaban escritos a mano en el HTML y
// mostraban Tarjeta/Nequi/Daviplata aunque el negocio no los usara.
function renderMetodosDinamicos() {
  const methods = S.payMethods || [];
  if (!methods.length) return;

  const sel = document.getElementById('hf-pago');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = '<option value="todos">Todos</option>'
      + methods.map(m => '<option value="' + cjEsc(m.key) + '">' + cjEsc(m.nombre) + '</option>').join('');
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }

  const cont = document.querySelector('#panel-movimiento .mov-medio-btn')?.parentElement;
  if (cont) {
    cont.innerHTML = methods.map((m, i) => {
      const on = i === 0 ? ' style="background:#DCFCE7;border-color:#16A34A;color:#16A34A"' : '';
      return '<button class="cj-btn-ghost sm mov-medio-btn" data-medio="' + cjEsc(m.nombre) + '"' + on
        + ' onclick="selectMedio(this)">' + cjEsc(m.nombre) + '</button>';
    }).join('');
  }
}

const CANALES = [
  { key:'salon',     label:'Salón',     color:'#5B6BFF', bg:'#EEF2FF' },
  { key:'mostrador', label:'Mostrador', color:'#06B6D4', bg:'#CFFAFE' },
  { key:'domicilio', label:'Domicilio', color:'#10B981', bg:'#D1FAE5' },
];

// ── Boot ───────────────────────────────────────────────────────
window._pos.on('core:ready', async function({ user }) {
  S.user     = user;
  S.branchId = window._pos.state.branchId;
  S.tenantId = window._pos.state.tenantId;

  const meta = user.user_metadata || {};
  const initials = (meta.nombre || user.email || '??').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const el = id => document.getElementById(id);
  el('user-avatar').textContent = initials;
  el('user-name').textContent   = meta.nombre || user.email;
  el('user-role').textContent   = meta.role   || 'Cajero';

  renderCajaState();
  renderDesglosePago([]);
  renderCanalVentas([], []);
  renderTopVentas([]);
  renderMovimientos([]);
  renderMovimientosSummary([]);
  renderCierres([]);
  renderHistorial([]);

  await refreshAll();
});

// ── Refresh ────────────────────────────────────────────────────
async function refreshAll() {
  /* ── Estas consultas iban una detrás de otra sin necesidad ──────────────
     Se revisó qué necesita de verdad a qué:
       · el turno abierto, la lista de turnos y los métodos de pago no dependen
         de nada → salen los tres a la vez;
       · los pedidos y sus ítems necesitan la hora de apertura del turno, pero
         no se necesitan entre ellos → salen los dos a la vez;
       · los pagos por método sí necesitan los pedidos ya cargados;
       · los movimientos de caja necesitan el id del turno.
     De siete esperas en fila se pasa a tres tandas. */
  if (window.posMetodos) await posMetodos.cargar(sb, S.branchId);
  const [_ses, _sess, _met] = await Promise.all([
    loadActiveSession(S.branchId),
    loadAllSessions(S.branchId),
    loadPayMethodsConfig()
  ]);
  S.session    = _ses;
  S.sessions   = _sess;
  S.payMethods = _met;

  if (S.session) {
    const desde = await inicioDelTurno(S.branchId, S.session);
    const [_ords, _its] = await Promise.all([
      loadOrders(S.branchId, desde),
      loadOrderItems(S.branchId, desde)
    ]);
    S.orders = _ords;
    S.items  = _its;
    S.pagosMetodo = await loadPagosPorMetodo(S.branchId, desde, S.orders);
    // Recuperar arqueo guardado en la sesión (sobrevive recargas de página)
    if (S.session.arqueo_contado != null) S.arqueoContado = parseFloat(S.session.arqueo_contado);
    if (S.session.arqueo_denoms) S.arqueoDenoms = S.session.arqueo_denoms;
  } else { S.orders = []; S.items = []; S.pagosMetodo = {}; }
  renderMetodosDinamicos();
  const moves = await getMoves();
  renderCajaState();
  renderHero(S.orders, moves);
  renderKPIs(S.orders);
  renderDesglosePago(S.orders);
  renderCanalVentas(S.orders, moves);
  renderTopVentas(S.items);
  // "Por comprar" se calcula aparte (consulta el inventario) y se pinta cuando
  // llega, sin hacer esperar al resto de la pantalla.
  cjInsumosBajos().then(function (b) { S.insumosBajos = b; cjPintarBajos(b); });
  renderMovimientos(moves);
  renderMovimientosSummary(moves);
  renderCierres(S.sessions);
  // El selector de historial parte de los turnos recientes; una fecha elegida lo acota.
  if(!document.getElementById('hist-date') || !document.getElementById('hist-date').value){
    S.histSessions = S.sessions || [];
  }
  renderHistSessionPicker();
  await applyHistSelection();
  updateStatusBar();

  /* LLEGO DESDE EL PANEL A ABRIR CAJA. El boton del panel manda aqui con
     `?abrir=1` en vez de tener su propio modal — asi hay UNO solo.
     Se comprueba que de verdad no haya caja abierta: si alguien deja el enlace
     guardado y vuelve mañana con la caja ya abierta, no tiene sentido
     mostrarle el modal de abrir. */
  try {
    if (new URLSearchParams(location.search).get('abrir') === '1' && !S.session) {
      openPanel('panel-abrir');
      /* Se limpia de la barra de direcciones: si recarga, no vuelve a saltar. */
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) { console.warn('[caja] abrir automatico:', e); }
}

// ── Historial de ventas por turno de caja ──────────────────────
function cjEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── "Las ventas son las ventas": el domicilio NUNCA cuenta como venta ──
// Normaliza cada pedido para que total_final = SOLO comida (total − domicilio),
// sin importar cómo se haya guardado. Robusto ante el bug histórico donde el domi
// quedó metido dentro de total_final (ej. Valeria del 24/07). total (incluye domi)
// se conserva; toda vista de ventas usa total_final ya normalizado.
function cjNormalizeVenta(o){
  if(!o) return o;
  const dom = parseFloat(o.delivery_fee)||0;
  const tot = parseFloat(o.total);
  if(!isNaN(tot)){
    if(dom>0) o.total_final = tot - dom;          // domicilio: comida = total − domi
    else if(o.total_final==null) o.total_final = tot;
  }
  return o;
}

// ── Domicilios EXTERNOS = CANJE (no es venta ni egreso) ──────────────────────
// El valor del domicilio de un pedido EXTERNO entra por el pago del cliente y SALE
// cuando se le paga al domiciliario (por defecto, en EFECTIVO). Ese efectivo que sale
// de la caja se descuenta del EFECTIVO ESPERADO para que el arqueo cuadre, SIN mostrarse
// en ningún lado (regla: el domicilio externo no queda registrado visiblemente; no es
// venta ni egreso, es solo un canje que pasa por la caja).
// Los domicilios INTERNOS NO entran aquí: esa plata sí es del negocio y se informa aparte.
// Solo aplica cuando el domi ENTRÓ por un medio distinto al efectivo (p.ej. transferencia):
// si entró en efectivo ya quedó neteado (los cobros en efectivo se registran sin el domi).
// Por defecto TODO domicilio se trata como externo pagado en efectivo (o.domi_courier /
// o.domi_pago, con default 'externo'/'efectivo'); cuando exista el chip por pedido, se leen.
/* Pedidos del turno que todavía no están cobrados. Se compara contra lo
   COBRABLE (total menos el domicilio), que es la misma regla que usa el resto
   del sistema: el domicilio del externo no es plata del negocio. */
// Ultimo "esperado" calculado, para que el aviso pueda decir cuanto deberia
// haber si se cobrara lo pendiente.
let _cjEsperadoActual = 0;

function cjPedidosSinCobrar(orders){
  const list = orders || (typeof S !== 'undefined' ? S.orders : null) || [];
  const pagado = window.posEstaPagado || function(){ return true; };
  const cobrable = window.posCobrable || function(o){ return parseFloat(o && o.total) || 0; };
  return list.filter(function(o){
    return o && o.status !== 'cancelled' && !pagado(o);
  }).map(function(o){
    const falta = cobrable(o) - (parseFloat(o.paid_amount) || 0);
    return { nombre: o.customer_name || o.table_name || 'Sin nombre', canal: o.channel || '', falta: Math.max(0, falta) };
  }).filter(function(x){ return x.falta > 0; });
}

/* ══════════════════════════════════════════════════════════════════
   EFECTIVO EN PODER DE LOS DOMICILIARIOS  (21-ago-2026)

   Solo aplica cuando el rol de domiciliario esta puesto en "trae el
   dinero al terminar el turno" (Configuracion > Usuarios y roles). Con
   la otra opcion, el domiciliario entrega la plata de cada pedido al
   volver y esa plata ya esta en el cajon: no hay nada que avisar.

   La cuenta la hace la base (fn_domi_efectivo_pendiente) y no la
   pantalla, para que el arqueo y los informes den lo mismo.
   ══════════════════════════════════════════════════════════════════ */
async function cjPintarDomisEfectivo(){
  var box = document.getElementById('arqueo-domis');
  if (!box) return;
  box.classList.add('is-hidden');
  try {
    if (!S.branchId) return;
    /* EL MISMO CORTE QUE EL ARQUEO, con la misma funcion que ya usa la
       pantalla. Con otro corte, el bloque diria un numero y el arqueo
       otro, y el cajero no sabria a cual creerle. */
    var desde = await inicioDelTurno(S.branchId, S.session);
    var r = await sb.rpc('fn_domi_efectivo_pendiente', { p_branch: S.branchId, p_desde: desde });
    if (r && r.error) { console.warn('[caja] efectivo domis:', r.error.message); return; }
    var filas = (r && r.data) || [];
    if (!filas.length) return;

    var total = filas.reduce(function(a, f){ return a + (Number(f.efectivo) || 0); }, 0);
    var tt = document.getElementById('arqueo-domis-tt');
    var ds = document.getElementById('arqueo-domis-ds');
    if (tt) tt.textContent = filas.length === 1
      ? 'Un domiciliario lleva ' + COPF(total) + ' encima'
      : filas.length + ' domiciliarios llevan ' + COPF(total) + ' encima';
    if (ds) ds.innerHTML = filas.map(function(f){
      var n = Number(f.pedidos) || 0;
      return '<div>· <strong>' + cjEscDomi(f.nombre) + '</strong> — ' + COPF(Number(f.efectivo) || 0)
           + ' <span style="opacity:.75">(' + n + (n === 1 ? ' pedido' : ' pedidos') + ')</span></div>';
    }).join('');
    box.classList.remove('is-hidden');
  } catch (e) { console.warn('[caja] efectivo domis:', e); }
}

function cjEscDomi(v){
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* El aviso va ANTES de que el cajero vea la diferencia: si sale después, ya se
   asustó buscando un error que no existe. */
function cjPintarPendientes(){
  const box = document.getElementById('arqueo-pendientes');
  if (!box) return;
  const pend = cjPedidosSinCobrar();
  if (!pend.length) { box.classList.add('is-hidden'); return; }
  const total = pend.reduce(function(s,x){ return s + x.falta; }, 0);
  const tt = document.getElementById('arqueo-pend-tt');
  const ds = document.getElementById('arqueo-pend-ds');
  if (tt) tt.textContent = pend.length === 1
    ? 'Hay 1 pedido sin cobrar por ' + COPF(total)
    : 'Hay ' + pend.length + ' pedidos sin cobrar por ' + COPF(total);
  if (ds) ds.innerHTML = pend.map(function(x){
    return '<div>· <strong>' + (x.nombre || '') + '</strong>' + (x.canal ? ' (' + x.canal + ')' : '') + ' — ' + COPF(x.falta) + '</div>';
  }).join('');
  /* Cuanto DEBERIA haber en el cajon si esos cobros ya estuvieran registrados.
     Sin esta linea el cajero ve el aviso pero igual no sabe contra que numero
     comparar lo que conto: es la mitad que faltaba. */
  const sum = document.getElementById('arqueo-pend-sum');
  if (sum) {
    const esp = Number(_cjEsperadoActual) || 0;
    sum.innerHTML = esp
      ? 'Ahora el sistema espera <strong>' + COPF(esp) + '</strong>. Con estos cobros deber&iacute;an ser <strong>' + COPF(esp + total) + '</strong>.'
      : '';
  }
  box.classList.remove('is-hidden');
}

/* Domicilios INTERNOS: la plata del domicilio SI es del negocio, pero NO es
   venta (regla de oro de Sergio: el domi nunca se suma a ventas). Va como una
   linea informada aparte, para que se pueda ver cuanto entro por domicilios
   propios sin ensuciar el numero de ventas. */
function cjDomiInternos(orders){
  const list = orders || (typeof S !== 'undefined' ? S.orders : null) || [];
  return list.reduce(function(s,o){
    if(!o || o.status==='cancelled') return s;
    const ch = String(o.channel||'').toLowerCase();
    if(ch!=='domicilio' && ch!=='delivery') return s;
    if((o.domi_courier||'externo')!=='interno') return s;
    if(!(parseFloat(o.paid_amount)||0)) return s;      // sin cobrar no entro nada
    return s + (parseFloat(o.delivery_fee)||0);
  }, 0);
}

function cjDomiCanjeEfectivo(orders){
  const list = orders || (typeof S !== 'undefined' ? S.orders : null) || [];
  return list.reduce(function(s,o){
    if(!o || o.status==='cancelled') return s;
    const ch = String(o.channel||'').toLowerCase();
    if(ch!=='domicilio' && ch!=='delivery') return s;
    if((o.domi_courier||'externo')!=='externo') return s;          // interno: esa plata SÍ es del negocio
    if((o.domi_pago||'efectivo')!=='efectivo') return s;           // se le pagó al domiciliario en efectivo
    /* Pedido SIN COBRAR: no hay nada que netear. Nadie pagó, así que no entró
       plata al banco ni salió del cajón. Antes se colaba porque la comprobación
       de abajo mira payment_method, y un pedido abierto no tiene ninguno: al no
       decir "efectivo" se daba por transferencia y se restaba el domicilio de
       la nada. Un pedido abierto al cerrar caja inflaba el sobrante. */
    if(!(parseFloat(o.paid_amount)||0)) return s;
    if(String(o.payment_method||'').toLowerCase()==='efectivo') return s; // domi entró en efectivo → ya neteado
    return s + (parseFloat(o.delivery_fee)||0);
  }, 0);
}

function renderHistSessionPicker(){
  const sel = document.getElementById('hist-session');
  if(!sel) return;
  const cq=(S.histCajero||'').toLowerCase().trim();
  let list=(S.histSessions||[]).filter(function(s){ return s.id!==(S.session&&S.session.id); }); // el abierto va como "Sesión actual"
  if(cq) list=list.filter(function(s){ return String(s.cashier_name||'').toLowerCase().includes(cq); });
  let opts = '<option value="current">Sesión actual'+(S.session?'':' (caja cerrada)')+'</option>';
  list.forEach(function(s){
    const cajero=s.cashier_name?(' · '+s.cashier_name):'';
    opts+='<option value="'+s.id+'">'+_turnoSpanLabel(s)+cajero+'</option>';
  });
  sel.innerHTML=opts;
  // Mantener seleccionado el turno actual si sigue en la lista; si no, volver a "actual"
  const exists=(S.histSessionId==='current')||list.some(function(s){return s.id===S.histSessionId;});
  sel.value=exists?(S.histSessionId||'current'):'current';
  if(!sel.dataset.bound){ sel.dataset.bound='1'; sel.addEventListener('change',function(){ selectHistSession(sel.value); }); }
}

// Cargar los turnos (cierres) que TOCARON un día — por SOLAPAMIENTO, no solo por
// apertura. Así un turno que abrió el 21 6pm y cerró el 22 1am aparece tanto si
// buscas el 21 como el 22 (cruzó la medianoche pero es un solo turno).
async function loadSessionsForDate(branchId, dateStr){
  try {
    const start=new Date(dateStr+'T00:00:00');
    const end=new Date(dateStr+'T23:59:59.999');
    const q=sb.from('pos_sessions').select('*').eq('status','closed')
      .lte('opened_at', end.toISOString())    // abrió en o antes del fin del día
      .gte('closed_at', start.toISOString())  // cerró en o después del inicio del día
      .order('opened_at',{ascending:false});
    if(branchId) q.eq('branch_id', branchId);
    const { data } = await q;
    return data || [];
  } catch(e){ console.error('loadSessionsForDate:',e); return []; }
}

// Etiqueta legible del turno; si cruza la medianoche muestra ambas fechas.
function _turnoSpanLabel(s){
  const dA=new Date(s.opened_at), dC=s.closed_at?new Date(s.closed_at):null;
  const opt2={day:'2-digit',month:'2-digit',year:'2-digit'};
  const optH={hour:'2-digit',minute:'2-digit'};
  const fA=dA.toLocaleDateString('es-CO',opt2), hA=dA.toLocaleTimeString('es-CO',optH);
  if(!dC) return fA+' · '+hA+'–(abierta)';
  const hC=dC.toLocaleTimeString('es-CO',optH);
  if(dA.toDateString()===dC.toDateString()) return fA+' · '+hA+'–'+hC;
  return fA+' '+hA+' → '+dC.toLocaleDateString('es-CO',opt2)+' '+hC; // cruzó medianoche
}

async function onHistDateChange(dateStr){
  const sel=document.getElementById('hist-session');
  if(!dateStr){
    // Sin fecha → volver a los turnos recientes
    S.histSessions = S.sessions || [];
    renderHistSessionPicker();
    return;
  }
  const list = await loadSessionsForDate(S.branchId, dateStr);
  S.histSessions = list;
  renderHistSessionPicker();
  if(list.length){
    // Auto-seleccionar el primer (más reciente) turno del día
    if(sel) sel.value=list[0].id;
    await selectHistSession(list[0].id);
  } else {
    const cont=document.getElementById('hist-lista');
    const f=new Date(dateStr+'T00:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    if(cont) cont.innerHTML='<div class="cj-empty-row">No hubo turnos de caja el '+f+'</div>';
    const hc=document.getElementById('hist-count'), ht=document.getElementById('hist-total');
    if(hc) hc.textContent='0 ventas'; if(ht) ht.textContent='$0';
  }
}

function setHistCajero(v){ S.histCajero=v||''; renderHistSessionPicker(); }

async function selectHistSession(id){
  S.histSessionId = id || 'current';
  const banner=document.getElementById('hist-banner-txt');
  if(banner){
    if(S.histSessionId==='current'){
      banner.innerHTML='Este historial es solo de la <strong style="font-weight:700;margin:0 3px">sesión actual</strong>. Al cerrar la caja se reinicia; los totales quedan guardados en el cierre.';
    } else {
      const s=(S.histSessions||[]).find(function(x){return x.id===id;});
      const span=s?_turnoSpanLabel(s):'';
      const cruza=s&&s.closed_at&&(new Date(s.opened_at).toDateString()!==new Date(s.closed_at).toDateString());
      banner.innerHTML='Historial completo del <strong style="font-weight:700;margin:0 3px">turno '+span+'</strong> — todos los pedidos de ese turno, pedido por pedido'+(cruza?' (incluye las ventas después de medianoche).':'.');
    }
  }
  await applyHistSelection();
}

async function applyHistSelection(){
  const id=S.histSessionId||'current';
  if(id==='current'){ S.histOrdersAll=S.orders||[]; S.histItemsAll=S.items||[]; renderHistFiltered(); return; }
  const sess=(S.histSessions||[]).find(function(x){return x.id===id;});
  if(!sess){ S.histOrdersAll=S.orders||[]; S.histItemsAll=S.items||[]; renderHistFiltered(); return; }
  const cont=document.getElementById('hist-lista');
  if(cont) cont.innerHTML='<div class="cj-empty-row">Cargando pedidos del turno…</div>';
  const until=sess.closed_at||new Date().toISOString();
  /* El historial usa la MISMA regla que el turno en curso: si contara distinto,
     un turno viejo mostraria unos pedidos y su cierre otros. */
  const desdeH = await inicioDelTurno(S.branchId, sess);
  const [ords,its]=await Promise.all([
    loadOrders(S.branchId, desdeH, until),
    loadOrderItems(S.branchId, desdeH, until),
  ]);
  S.histOrdersAll=ords||[]; S.histItemsAll=its||[];
  renderHistFiltered();
}

// ── Filtros del historial (client-side sobre el turno cargado) ──
function histFiltered(){
  const f=S.histFilters||{};
  let list=(S.histOrdersAll||[]).slice();
  if(f.estado==='realizadas') list=list.filter(function(o){return o.status!=='cancelled';});
  else if(f.estado==='anuladas') list=list.filter(function(o){return o.status==='cancelled';});
  if(f.canal && f.canal!=='todos') list=list.filter(function(o){return (o.channel||'salon').toLowerCase()===f.canal;});
  if(f.pago && f.pago!=='todos') list=list.filter(function(o){return (o.payment_method||'efectivo').toLowerCase()===f.pago;});
  if(f.fecha) list=list.filter(function(o){
    const d=new Date(o.created_at);
    const ymd=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return ymd===f.fecha;
  });
  if(f.producto){
    const q=f.producto.toLowerCase().trim();
    const byOrder={};
    (S.histItemsAll||[]).forEach(function(it){ (byOrder[it.order_id]=byOrder[it.order_id]||[]).push(it); });
    if(q) list=list.filter(function(o){
      return (byOrder[o.id]||[]).some(function(it){ return String(it.product_name||it.name||'').toLowerCase().includes(q); });
    });
  }
  const orden=f.orden||'hora_desc';
  const tot=function(o){ return parseFloat(o.total_final!=null?o.total_final:o.total)||0; };
  list.sort(function(a,b){
    if(orden==='hora_asc')   return new Date(a.created_at)-new Date(b.created_at);
    if(orden==='monto_desc') return tot(b)-tot(a);
    if(orden==='monto_asc')  return tot(a)-tot(b);
    return new Date(b.created_at)-new Date(a.created_at); // hora_desc (por defecto)
  });
  return list;
}

// Exportar el historial FILTRADO a CSV (se abre en Excel)
function exportHistorial(){
  const orders=histFiltered();
  if(!orders.length){ alert('No hay pedidos para exportar con los filtros actuales.'); return; }
  const byOrder={};
  (S.histItemsAll||[]).forEach(function(it){ (byOrder[it.order_id]=byOrder[it.order_id]||[]).push(it); });
  const CANAL={salon:'Salón',rapido:'Rápida',mostrador:'Mostrador',domicilio:'Domicilio'};
  const rows=[['#Venta','Fecha','Hora','Canal','Método','Estado','Atendió','Cliente','Productos','Total']];
  orders.forEach(function(o){
    const d=new Date(o.created_at);
    const fecha=d.toLocaleDateString('es-CO');
    const hora=d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const prods=(byOrder[o.id]||[]).map(function(it){ return (it.quantity||1)+'x '+(it.product_name||it.name||'Producto'); }).join(' | ');
    const tot=parseFloat(o.total_final!=null?o.total_final:o.total)||0;
    rows.push(['#'+String(o.id||'').slice(-4).toUpperCase(), fecha, hora,
      CANAL[(o.channel||'salon').toLowerCase()]||o.channel||'', o.payment_method||'efectivo',
      o.status==='cancelled'?'Anulada':'Realizada', o.waiter_name||'', o.customer_name||'', prods, tot]);
  });
  const csv=rows.map(function(r){ return r.map(function(c){
    const s=String(c==null?'':c);
    return /[",\n;]/.test(s)?('"'+s.replace(/"/g,'""')+'"'):s;
  }).join(','); }).join('\r\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const sess=(S.sessions||[]).find(function(x){return x.id===S.histSessionId;});
  const tag=(S.histSessionId==='current')?'actual':(sess?new Date(sess.opened_at).toLocaleDateString('es-CO').replace(/\//g,'-'):'turno');
  const a=document.createElement('a');
  a.href=url; a.download='historial-ventas-'+tag+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}
function renderHistFiltered(){ renderHistorial(histFiltered(), S.histItemsAll||[]); }
function setHistFilter(key,val){ S.histFilters[key]=val; renderHistFiltered(); }
function toggleHistFilters(){
  const panel=document.getElementById('hist-filtros-panel');
  const btn=document.getElementById('hist-filtros-btn');
  if(!panel) return;
  const open=panel.hasAttribute('hidden');
  if(open){ panel.removeAttribute('hidden'); if(btn) btn.classList.add('on'); }
  else { panel.setAttribute('hidden',''); if(btn) btn.classList.remove('on'); }
}
function clearHistFilters(){
  S.histFilters={ estado:'todas', canal:'todos', pago:'todos', producto:'', fecha:'', orden:'hora_desc' };
  const ids={ 'hf-estado':'todas','hf-canal':'todos','hf-pago':'todos','hf-producto':'','hf-orden':'hora_desc' };
  Object.keys(ids).forEach(function(id){ const el=document.getElementById(id); if(el) el.value=ids[id]; });
  renderHistFiltered();
}

// ── Loaders ────────────────────────────────────────────────────
async function loadActiveSession(branchId) {
  try {
    const q = sb.from('pos_sessions').select('*').eq('status','open');
    /* SIN SEDE NO SE MUESTRA PLATA. Antes, si no se sabia la sucursal, se
       traia el restaurante ENTERO: con dos marcas eso son totales revueltos
       que se ven perfectamente normales. Mejor no dar un numero que darlo mal. */
    if (!branchId) { console.warn('[caja] sin sucursal: loadActiveSession'); return null; }
    q.eq('branch_id', branchId);
    q.order('opened_at',{ascending:false}).limit(1);
    const { data } = await q;
    return (data && data[0]) || null;
  } catch(e) { console.error('loadActiveSession:',e); return null; }
}

/* ══ DESDE DONDE CUENTA UN TURNO ══════════════════════════════════════════
   (19-ago, decision de Sergio.) NO desde que se abrio la caja, sino desde que
   se cerro la ANTERIOR. Entre el cierre de anoche y la apertura de hoy queda
   un hueco, y lo que caiga ahi —un domicilio de la pagina a las 4 de la tarde,
   un pedido que tomo Paco antes de abrir— no lo contaba ningun cierre.

   Ya habia pasado 4 veces por $246.000, y $205.000 de eso en efectivo: plata
   que entro al cajon y no aparecia en el arqueo, asi que la caja daba sobrante
   sin explicacion.

   Si es la primera caja de todas no hay de donde arrancar: se queda con su
   propia apertura. */
async function inicioDelTurno(branchId, sess) {
  if (!sess || !sess.opened_at) return null;
  try {
    const { data } = await sb.from('pos_sessions')
      .select('closed_at')
      .eq('branch_id', branchId)
      .not('closed_at', 'is', null)
      .lte('closed_at', sess.opened_at)
      .order('closed_at', { ascending: false })
      .limit(1);
    if (data && data.length && data[0].closed_at) return data[0].closed_at;
  } catch (e) { console.warn('[caja] inicio del turno:', e); }
  return sess.opened_at;
}

async function loadOrders(branchId, sinceISO, untilISO) {
  try {
    const q = sb.from('pos_orders').select('*').gte('created_at', sinceISO);
    if (untilISO) q.lte('created_at', untilISO);
    /* SIN SEDE NO SE MUESTRA PLATA. Antes, si no se sabia la sucursal, se
       traia el restaurante ENTERO: con dos marcas eso son totales revueltos
       que se ven perfectamente normales. Mejor no dar un numero que darlo mal. */
    if (!branchId) { console.warn('[caja] sin sucursal: loadOrders'); return []; }
    q.eq('branch_id', branchId);
    q.order('created_at',{ascending:false});
    const { data } = await q;
    return (data || []).map(cjNormalizeVenta);
  } catch(e) { console.error('loadOrders:',e); return []; }
}

async function loadOrderItems(branchId, sinceISO, untilISO) {
  try {
    const q = sb.from('pos_order_items').select('*').gte('created_at', sinceISO);
    if (untilISO) q.lte('created_at', untilISO);
    /* SIN SEDE NO SE MUESTRA PLATA. Antes, si no se sabia la sucursal, se
       traia el restaurante ENTERO: con dos marcas eso son totales revueltos
       que se ven perfectamente normales. Mejor no dar un numero que darlo mal. */
    if (!branchId) { console.warn('[caja] sin sucursal: loadOrderItems'); return []; }
    q.eq('branch_id', branchId);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadOrderItems:',e); return []; }
}

async function loadAllSessions(branchId) {
  try {
    const q = sb.from('pos_sessions').select('*').eq('status','closed');
    /* SIN SEDE NO SE MUESTRA PLATA. Antes, si no se sabia la sucursal, se
       traia el restaurante ENTERO: con dos marcas eso son totales revueltos
       que se ven perfectamente normales. Mejor no dar un numero que darlo mal. */
    if (!branchId) { console.warn('[caja] sin sucursal: loadAllSessions'); return []; }
    q.eq('branch_id', branchId);
    q.order('closed_at',{ascending:false}).limit(30);
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('loadAllSessions:',e); return []; }
}

// ── Pagos REALES por método (pos_payments) ─────────────────────
// El desglose de un cobro (incluidos pagos MIXTOS 'multiple') vive en
// pos_payments — sumar por pos_orders.payment_method deja los mixtos por
// fuera y descuadra el arqueo. Fallback: pedidos pagados sin desglose
// (históricos) usan su payment_method.
/* Traduce lo que sea que venga guardado —id, nombre con mayusculas, con tildes—
   a la clave del metodo CONFIGURADO al que pertenece. Si no reconoce nada,
   devuelve null y ese pago se ve en "Otros", que a partir de ahora deberia
   quedar siempre vacio: son los metodos de Sergio o no es nada. */
function resolverMetodo(valor) {
  var v = String(valor || '').trim();
  if (!v) return null;
  var norm = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // El traductor compartido manda; el bucle de abajo queda como respaldo si
  // esta pantalla se abriera sin pos-metodos.js cargado.
  if (window.posMetodos) {
    var comun = posMetodos.resolver(v);
    if (comun) return String(comun.nombre || '').toLowerCase();
  }
  var mets = S.payMethods || [];
  for (var i = 0; i < mets.length; i++) {
    var m = mets[i];
    if (m.id && m.id === v) return m.key;                       // pm_x719c1pqb
    if (m.key === norm) return m.key;                           // "Transferencia"
    if (m.tipoKey && m.tipoKey === norm) return m.key;          // "efectivo"
  }
  return null;
}

/*  `hastaISO` es opcional y solo lo manda quien reimprime un turno YA
    CERRADO. Sin el, se cuenta hasta ahora — que es lo correcto mientras el
    turno sigue abierto.

    ⚠️ SIN ESE TOPE, reimprimir un cierre viejo sumaba todo lo vendido desde
    entonces hasta hoy. Medido el 2-sep-2026 con los turnos reales: el del
    29-ago imprimia $3.077.500 donde debia decir $757.000. Y ese papel es el
    que se archiva para cuadrar la caja.                                    */
async function loadPagosPorMetodo(branchId, sinceISO, orders, hastaISO) {
  const map = {};
  const conDesglose = new Set();
  try {
    const q = sb.from('pos_payments').select('order_id, method, amount, created_at').gte('created_at', sinceISO);
    if (hastaISO) q.lte('created_at', hastaISO);
    /* SIN SEDE NO SE MUESTRA PLATA. Antes, si no se sabia la sucursal, se
       traia el restaurante ENTERO: con dos marcas eso son totales revueltos
       que se ven perfectamente normales. Mejor no dar un numero que darlo mal. */
    if (!branchId) { console.warn('[caja] sin sucursal: loadPagosPorMetodo'); return []; }
    q.eq('branch_id', branchId);
    const { data } = await q;
    (data || []).forEach(p => {
      const k = resolverMetodo(p.method) || String(p.method || '').toLowerCase();
      map[k] = (map[k] || 0) + (parseFloat(p.amount) || 0);
      conDesglose.add(p.order_id);
    });
  } catch(e) { console.error('loadPagosPorMetodo:', e); }
  (orders || []).forEach(o => {
    if (o.status === 'cancelled' || conDesglose.has(o.id)) return;
    const pagado = parseFloat(o.paid_amount) || 0;
    if (pagado <= 0) return;
    const crudo = String(o.payment_method || '').toLowerCase();
    if (crudo === 'multiple') return;
    const k = resolverMetodo(o.payment_method) || crudo || 'efectivo';
    map[k] = (map[k] || 0) + pagado;
  });
  return map;
}

// ── pos_cash_moves (Supabase) ──────────────────────────────────
async function getMoves() {
  try {
    if (!S.session) return [];
    const { data } = await sb.from('pos_cash_moves')
      .select('*')
      .eq('session_id', S.session.id)
      .order('created_at', { ascending: true });
    return (data || []).map(m => ({
      id:      m.id,
      type:    m.type,
      amount:  parseFloat(m.amount) || 0,
      concept: m.concept || '',
      medio:   m.medio  || 'Efectivo',
      ts:      m.created_at,
    }));
  } catch(e) { console.error('getMoves:', e); return []; }
}
async function addMove(type, amount, concept, medio) {
  if (!S.session) return null;
  const { data, error } = await sb.from('pos_cash_moves').insert({
    tenant_id:  S.tenantId,
    branch_id:  S.branchId,
    session_id: S.session.id,
    type, amount, concept,
    medio:      medio || 'Efectivo',
    created_by: S.user?.id || null,
  }).select().single();
  if (error) throw error;
  return data;
}
async function deleteMove(id) {
  const { error } = await sb.from('pos_cash_moves').delete().eq('id', id);
  if (error) throw error;
}

// ── Estado caja abierta/cerrada ────────────────────────────────
function renderCajaState() {
  const openV   = document.getElementById('caja-open-view');
  const closedV = document.getElementById('caja-closed-view');
  if (S.session) {
    openV.style.display = '';
    closedV.classList.add('is-hidden');
  } else {
    openV.style.display = 'none';
    closedV.classList.remove('is-hidden');
  }
}

// ── Hero ───────────────────────────────────────────────────────
function renderHero(orders, moves) {
  const active   = orders.filter(o => o.status !== 'cancelled');
  // Efectivo REAL recibido (pos_payments — incluye la parte en efectivo de pagos mixtos)
  const ventasEf = (S.pagosMetodo && S.pagosMetodo['efectivo']) || 0;
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session ? (S.session.opening_cash||0) : 0;
  const total    = base + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo(orders);
  const el       = id => document.getElementById(id);
  el('hero-efectivo').textContent      = COPF(total);
  el('hero-apertura').textContent      = COPF(base);
  el('compose-base').textContent       = COPF(base);
  el('compose-ventas-ef').textContent  = COPF(ventasEf);
  el('compose-ingresos').textContent   = COPF(ingresos);
  el('compose-egresos').textContent    = COPF(egresos);
  el('compose-total').textContent      = COPF(total);
  /* Los domicilios internos NO entran en el total de caja (no son venta ni
     efectivo del turno): la linea solo informa. Si no hay ninguno, ni aparece. */
  const domiInt = cjDomiInternos(orders);
  const filaDI = el('compose-domi-int-row');
  if (filaDI) filaDI.style.display = domiInt > 0 ? '' : 'none';
  if (el('compose-domi-int')) el('compose-domi-int').textContent = COPF(domiInt);
  if (S.session) {
    const d = new Date(S.session.opened_at);
    const fecha = d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hora  = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    el('hero-fecha').textContent  = fecha + ' · ' + hora;
    el('hero-cajero').textContent = S.session.cashier_name || (S.user?.user_metadata?.nombre) || '—';
    el('hero-turno').innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Turno ${S.session.shift_type||'—'}`;
  }
}

// ── KPIs ───────────────────────────────────────────────────────
function renderKPIs(orders) {
  const active    = orders.filter(o=>o.status!=='cancelled');
  const cancelled = orders.filter(o=>o.status==='cancelled');
  const total     = active.reduce((s,o)=>s+(parseFloat(o.total_final ?? o.total)||0),0);
  const ticket    = active.length ? total/active.length : 0;
  const el        = id => document.getElementById(id);
  el('kpi-ventas').textContent     = COPF(total);
  el('kpi-ventas-sub').textContent = active.length + ' ventas en el turno';
  el('kpi-ticket').textContent     = COPF(ticket);
  el('kpi-trans').textContent      = orders.length;
  el('kpi-trans-sub').textContent  = cancelled.length + ' anuladas';

  /* Puntos redimidos en el turno. Va APARTE de las ventas a proposito:
     regla de Sergio, "300 puntos no es igual a 8.000 pesos... en las ventas no
     se suma lo que no entro". Aqui se ve cuanto se entrego en producto sin que
     eso ensucie el total de ventas ni el arqueo. */
  const pts  = active.reduce((s,o)=>s+(parseInt(o.puntos_redimidos,10)||0),0);
  const vale = active.reduce((s,o)=>s+(parseFloat(o.puntos_valor)||0),0);
  const nCanjes = active.filter(o=>(parseInt(o.puntos_redimidos,10)||0)>0).length;
  const elPts = el('kpi-puntos'), elPtsSub = el('kpi-puntos-sub');
  if (elPts) elPts.textContent = pts.toLocaleString('es-CO');
  if (elPtsSub) elPtsSub.textContent = nCanjes
    ? (nCanjes + (nCanjes===1?' canje · ':' canjes · ') + COPF(vale) + ' en producto')
    : 'sin canjes en el turno';
}

// ── Desglose por medio de pago ─────────────────────────────────
// ── Pedidos SIN TERMINAR del turno ─────────────────────────────
// Un pedido "vive" mientras no esté pagado, anulado o abandonado. Si se cierra
// el turno con alguno vivo, queda huérfano: sin caja que lo contenga.
// OJO: 'completed' y 'paid' son pedidos TERMINADOS (verificado en BD: los
// 'completed' ya están cobrados). Solo estos estados siguen "vivos":
const ESTADO_ABIERTO = ['open', 'in_progress', 'pendiente_pago', 'esperando', 'comiendo'];
const ESTADO_LBL = {
  open: 'Abierto', in_progress: 'En preparación', pendiente_pago: 'Pendiente de cobro',
  esperando: 'Esperando', comiendo: 'Comiendo', completed: 'Entregado · falta cobro',
};
// Estado de FULFILLMENT (venta rápida / domicilio) — bloquea el cierre si no está entregado.
const ESTADO_FULFILL_LBL = {
  en_preparacion: 'En preparación', listo: 'Listo · sin entregar', en_camino: 'En camino · sin entregar',
};
async function getPedidosAbiertos() {
  try {
    if (!S.session) return [];
    const q = sb.from('pos_orders')
      .select('id, status, estado, delivered_at, table_id, channel, total, total_final, paid_amount, customer_name, created_at, puntos_redimidos, puntos_valor')
      .not('status', 'in', '("cancelled","abandoned")')
      .gte('created_at', S.session.opened_at)
      .order('created_at', { ascending: true });
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    q.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data } = await q;
    // Vivo = en un estado de trabajo, o con saldo pendiente, o (venta rápida/domicilio)
    // que aún NO esté ENTREGADO. No se puede cerrar la caja con algo sin entregar.
    return (data || []).filter(o => {
      /* CINTURON (21-ago): entregado Y pagado completo NO es un pedido vivo,
         diga lo que diga su `status`. Tres veces la caja se nego a cerrar por
         pedidos de Paco ya entregados y pagados cuyo status quedo 'open'. El
         cierre de verdad lo hace fn_cerrar_si_pagado al entregarse; esto
         cubre los viejos y cualquier camino que se lo salte. Solo aplica a
         rapido/domicilio: una mesa se cierra cobrandola, no entregandola. */
      if (!o.table_id && o.delivered_at && o.estado === 'entregado'
          && (parseFloat(o.total) || 0) > 0
          && (parseFloat(o.paid_amount) || 0) >= (parseFloat(o.total) || 0) - 1) return false;
      if (ESTADO_ABIERTO.indexOf(o.status) >= 0) return true;
      const tot = parseFloat(o.total_final ?? o.total) || 0;
      if (tot > 0 && (parseFloat(o.paid_amount) || 0) < tot - 1) return true;
      const ch = String(o.channel || '').toLowerCase();
      if ((ch === 'rapido' || ch === 'domicilio') &&
          ['en_preparacion', 'listo', 'en_camino'].indexOf(o.estado) >= 0 &&
          !o.delivered_at) return true;
      return false;
    });
  } catch (e) { console.error('getPedidosAbiertos:', e); return []; }
}

// Métodos de pago configurados (fuente: Métodos de pago = ia_config.pagos)
async function loadPayMethodsConfig(){
  try {
    if (!S.branchId) return [];
    const { data } = await sb.from('ia_config').select('pagos').eq('branch_id', S.branchId).maybeSingle();
    const p = (data && data.pagos) || {};
    const arr = Array.isArray(p.metodos) ? p.metodos : [];
    return arr.filter(function(m){ return m && String(m.nombre||'').trim(); })
      .sort(function(a,b){ return (a.orden||0)-(b.orden||0); })
      .map(function(m){ return {
        nombre: m.nombre, tipo: m.tipo || 'otro',
        key: String(m.nombre).toLowerCase(),
        /* Se guardan tambien el id y el tipo: el cobro unas veces manda el id
           (pm_xxxx) y otras el nombre, y sin esto los del id no cuadran con
           ningun metodo y se van a "Otros". */
        id: String(m.id || ''), tipoKey: String(m.tipo || '').toLowerCase()
      }; });
  } catch(e){ return []; }
}
const _DP_COLOR = { saldo:'#8B5CF6', puntos:'#F0A83C', efectivo:'#16A34A', tarjeta:'#5B6BFF', transferencia:'#0EA5E9', banco:'#0EA5E9', billetera:'#8B5CF6', otro:'#94A3B8' };
const _DP_TINT  = { saldo:'#F5F3FF', puntos:'#FEF3C7', efectivo:'#DCFCE7', tarjeta:'#EEF2FF', transferencia:'#F0F9FF', banco:'#F0F9FF', billetera:'#F5F3FF', otro:'#F1F5F9' };
const _DP_ICON  = {
  saldo:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2.5"/><path d="M16 12.5h3"/></svg>',
  puntos:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/></svg>',
  efectivo:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  tarjeta:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  transferencia:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>',
  billetera:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
  otro:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>'
};
function renderDesglosePago(orders) {
  const cont = document.getElementById('desglose-pago');
  if (!cont) return;
  const pagos   = S.pagosMetodo || {};       // { metodo_en_minuscula : monto }
  const methods = S.payMethods || [];
  const used = {};
  const rows = methods.map(function(m){
    used[m.key] = true;
    /* PUNTOS: una sola fila, y en puntos.
       Salia DOS VECES —el metodo configurado, en $0, y mas abajo la fila real
       en pts—. No era un descuido de la fila de abajo: es que un metodo
       llamado "Puntos" no puede llevar plata NUNCA (la parte en dinero de un
       canje mixto viaja en su metodo real), asi que su $0 no informaba nada.
       Se marca aqui y mas abajo se le mete la cantidad. */
    if (String(m.tipo || '').toLowerCase() === 'puntos') {
      return { nombre: m.nombre, tipo: 'puntos', amt: 0, pts: 0, esPuntos: true };
    }
    return { nombre:m.nombre, tipo:m.tipo, amt: pagos[m.key]||0 };
  });
  // "Otros": pagos cuyo método no coincide con ninguno configurado (históricos, etc.)
  let otros = 0;
  Object.keys(pagos).forEach(function(k){ if(!used[k]) otros += pagos[k]||0; });
  if (otros > 0) rows.push({ nombre:'Otros', tipo:'otro', amt:otros });
  /* Los PUNTOS no son plata: no entran en el total ni en la barra de nadie. Se
     muestran aparte, en puntos, y solo si alguien redimio ese dia. La parte en
     dinero de un canje mixto ya viaja en su metodo real (efectivo o
     transferencia), asi que no se cuenta dos veces. */
  /* PAGOS CON SALDO: SI son venta, y del dia en que se consumen.
     Criterio de Sergio, y es el correcto: la recarga es plata recibida por
     adelantado, no una venta — la venta ocurre cuando el cliente reclama su
     comida. Por eso las recargas no entran aqui (tienen su propia pantalla) y
     el consumo del saldo si, como un metodo de pago mas. */
  /* OJO — doble conteo: desde que "Saldo" es un metodo configurado, un pedido
     pagado con saldo YA entra por el camino normal (pos_payments, o el
     payment_method del pedido). Aqui solo se recogen los que ese camino deja
     por fuera: los pedidos viejos de la pagina, que quedaron sin paid_amount y
     por eso el camino normal los descarta. Sin esta condicion, la plata de la
     pagina se contaria dos veces. */
  const saldoUsado = (orders || [])
    .filter(function(o){ return o.status !== 'cancelled' &&
      String(o.payment_method || '').toLowerCase() === 'saldo' &&
      (parseFloat(o.paid_amount) || 0) <= 0; })
    .reduce(function(s,o){ return s + (parseFloat(o.total_final ?? o.total) || 0) + (parseFloat(o.delivery_fee) || 0); }, 0);

  const puntos = (orders || [])
    .filter(function(o){ return o.status !== 'cancelled'; })
    .reduce(function(s,o){ return s + (parseInt(o.puntos_redimidos, 10) || 0); }, 0);

  const total = rows.reduce(function(s,r){ return s+r.amt; }, 0);
  if (saldoUsado > 0) {
    /* Lleva el nombre del negocio —"Saldo El Parche"— para que nadie lo
       confunda con el saldo de la caja ni con el de un banco: es plata que el
       cliente ya dejo aqui y que hoy se convierte en venta. */
    var _u = (window._pos && window._pos.state && window._pos.state.user) || null;
    var _neg = (_u && _u.user_metadata && _u.user_metadata.negocio) || '';
    rows.push({ nombre: _neg ? ('Saldo ' + _neg) : 'Saldo del cliente', tipo:'saldo', amt:saldoUsado });
  }
  /* Si el restaurante tiene "Puntos" entre sus metodos, la cantidad va en ESA
     fila. Si no lo tiene configurado pero alguien redimio, se agrega: el dato
     no se puede perder solo porque el metodo no este en la lista. */
  var filaPts = null;
  for (var _i = 0; _i < rows.length; _i++) { if (rows[_i].esPuntos) { filaPts = rows[_i]; break; } }
  if (filaPts) filaPts.pts = puntos;
  else if (puntos > 0) rows.push({ nombre:'Puntos', tipo:'puntos', amt:0, pts:puntos });
  if (!rows.length) { cont.innerHTML = '<div class="cj-empty-row" style="padding:16px 0">Configura tus métodos en <strong>Métodos de pago</strong></div>'; return; }
  cont.innerHTML = rows.map(function(r){
    const color = _DP_COLOR[r.tipo] || _DP_COLOR.otro;
    const tint  = _DP_TINT[r.tipo]  || _DP_TINT.otro;
    const icon  = _DP_ICON[r.tipo]  || _DP_ICON.otro;
    /* La barra de los puntos va llena: no compite con los pesos, solo dice
       cuantos se redimieron. Vacia si nadie redimio — una barra llena con
       "0 pts" al lado se lee como un error. */
    const esPts = r.pts != null;
    const esAparte = r.aparte != null;
    const pct   = esPts ? (Number(r.pts) > 0 ? 100 : 0)
                : esAparte ? 100
                : (total>0 ? (r.amt/total*100) : 0);
    const valor = esPts ? (Number(r.pts).toLocaleString('es-CO') + ' pts')
                : esAparte ? COPF(r.aparte) : COPF(r.amt);
    return '<div class="cj-method-row">'
      +'<div class="cj-method-ic" style="background:'+tint+';color:'+color+'">'+icon+'</div>'
      +'<div style="flex:1;min-width:0"><div class="cj-method-top"><span class="cj-method-name">'+cjEsc(r.nombre)+'</span><span class="cj-method-val">'+valor+'</span></div>'
      +'<div class="cj-track"><i style="width:'+pct.toFixed(1)+'%;background:'+color+'"></i></div></div>'
    +'</div>';
  }).join('');
}

// ── Canales de venta ───────────────────────────────────────────
function renderCanalVentas(orders, moves) {
  const active = orders.filter(o=>o.status!=='cancelled');
  CANALES.forEach(c => {
    const amt = active.filter(o=>(o.channel||'').toLowerCase()===c.key).reduce((s,o)=>s+(parseFloat(o.total_final ?? o.total)||0),0);
    const el = document.getElementById('canal-'+c.key);
    if (el) el.textContent = COPF(amt);
  });
  const ingresos = (moves||[]).filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = (moves||[]).filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const eli = document.getElementById('ie-ingresos');
  const ele = document.getElementById('ie-egresos');
  if (eli) eli.textContent = COPF(ingresos);
  if (ele) ele.textContent = COPF(egresos);
}


// ── Top ventas ─────────────────────────────────────────────────
function renderTopVentas(items) {
  const cont = document.getElementById('top-ventas');
  if (!cont) return;
  if (!items.length) {
    cont.innerHTML = '<div class="cj-empty-row">Sin ítems este turno</div>';
    return;
  }
  const map = {};
  items.forEach(it => {
    const k = it.product_name || 'Sin nombre';
    if (!map[k]) map[k] = { name:k, qty:0, total:0 };
    map[k].qty   += (it.quantity||1);
    map[k].total += (it.product_price||0)*(it.quantity||1);
  });
  const top5 = Object.values(map).sort((a,b)=>b.total-a.total).slice(0,5);
  const RANK_CLASS = ['first','','','',''];
  cont.innerHTML = top5.map((p,i) => `
    <div class="cj-top-item">
      <div class="cj-top-rank ${RANK_CLASS[i]}">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div class="cj-top-name">${p.name}</div>
        <div class="cj-top-sub">${p.qty} und · ${COPF(p.total)}</div>
      </div>
    </div>`).join('');
}


/* ═══ EL EFECTIVO QUE TODAVIA ESTA EN LA CALLE ══════════════════════════════

   Cuando un domiciliario cobra en efectivo, esa plata queda en su bolsillo.
   Hasta hoy no habia forma de decir que la entrego: el numero de "Efectivo en
   mano" de su app nunca bajaba, y si mañana faltaban $40.000 no habia donde
   mirar. Medido en El Parche antes de hacerlo: 69 domicilios en efectivo en 60
   dias, ~$120.000 por noche pasando de mano en mano sin dejar rastro.

   LA REGLA, que es de Sergio y ordena todo lo demas:

     El domiciliario NO puede poner su propia cuenta en ceros. Solo mira lo que
     debe. Quien confirma es quien de verdad recibe la plata: la cajera.

   Se guarda POR PEDIDO y no como un monto suelto: asi la entrega parcial sale
   sola —se reciben los pedidos que trajo y los demas siguen pendientes— y
   siempre se sabe CUAL plata llego y cual no.

   ⚠️ ESTO NO ES UN INGRESO, ES UN CAMBIO DE MANOS. La venta ya se registro
   cuando el domiciliario cobro; el efectivo esperado del cierre YA la cuenta.
   Si esta entrega se registrara como ingreso, el arqueo quedaria al doble y
   nadie se daria cuenta hasta el cierre. Por eso aqui no se toca `pos_cash_moves`
   ni el calculo del esperado: solo se marca de quien es la custodia.        */

/*  ⚠️ SOLO EL DOMICILIARIO INTERNO. CON EXTERNOS NO SE MUESTRA NADA.

    Regla de Sergio, del 24-jul-2026 y reclamada el 30-ago: **con domiciliarios
    externos el dinero del domicilio no queda registrado en ningun lado**. No es
    plata del restaurante ni la custodia nadie del restaurante: es de la empresa
    que reparte.

    La primera version de esto agrupaba tambien a los externos por su movil
    ("Movil 31 tiene $53.000"). Sergio: *"como trabajo con domiciliarios
    externos, para mi no debio haber cambiado nada"*. Y tiene razon: eso es
    justo la division que la regla prohibe, y le habria aparecido una pantalla
    nueva pidiendole cobrar una plata que no le corresponde — el mismo error
    que ya cometi el 29-ago dejando todos los domicilios en "pendiente de
    cobrar".

    El criterio de "interno" es el MISMO que ya usa `cjDomiCanjeEfectivo` unas
    lineas mas abajo: sin decir nada, es externo.                            */
function cjDomiEsInterno(o) {
  return String((o && o.domi_courier) || 'externo').toLowerCase() === 'interno';
}

//  Un pedido cuya plata sigue en la calle, en manos de un empleado del negocio.
function cjDomiEsPendiente(o) {
  if (!o || o.status === 'cancelled') return false;
  var ch = String(o.channel || '').toLowerCase();
  if (ch !== 'domicilio' && ch !== 'delivery') return false;
  if (!cjDomiEsInterno(o)) return false;                 // externo: no se registra nada
  if (String(o.payment_method || '').toLowerCase() !== 'efectivo') return false;
  if (!(parseFloat(o.paid_amount) || 0)) return false;   // nadie ha pagado: no hay plata
  return !o.domi_entrega_id;                             // null = todavia no llego al cajon
}

/*  QUIEN TIENE LA PLATA. Aqui ya solo llegan pedidos de domiciliario INTERNO
    (lo filtra `cjDomiEsPendiente`), asi que siempre es un empleado del negocio.
    Si el restaurante marco el domicilio como interno pero no anoto a quien se
    lo dio, se agrupan todos juntos: la plata existe igual y hay que recibirla,
    y esconderla por un dato que falta seria peor.                          */
function cjDomiCustodio(o) {
  if (o.domiciliario_id) {
    return { clave: 'int:' + o.domiciliario_id, tipo: 'interno',
             nombre: o.domiciliario || 'Domiciliario',
             domiciliario_id: o.domiciliario_id, movil: null };
  }
  /*  Sin id de usuario pero CON nombre escrito: se agrupa por el nombre. Le
      pasa a quien anota "se lo llevo Andres" sin que Andres tenga usuario en
      Cobra — y decirle "Domiciliario sin anotar" cuando el SI lo anoto seria
      darle la razon al revés.                                             */
  var nom = String((o && o.domiciliario) || '').trim();
  if (nom) {
    return { clave: 'int:nom:' + nom.toLowerCase(), tipo: 'interno', nombre: nom,
             domiciliario_id: null, movil: null };
  }
  return { clave: 'int:sin', tipo: 'interno', nombre: 'Domiciliario sin anotar',
           domiciliario_id: null, movil: null };
}

function cjDomiGrupos(orders) {
  var list = (orders || S.orders || []).filter(cjDomiEsPendiente);
  var mapa = {};
  list.forEach(function (o) {
    var c = cjDomiCustodio(o);
    if (!mapa[c.clave]) mapa[c.clave] = { info: c, pedidos: [], total: 0 };
    mapa[c.clave].pedidos.push(o);
    mapa[c.clave].total += parseFloat(o.paid_amount) || 0;
  });
  return Object.keys(mapa).map(function (k) { return mapa[k]; })
    .sort(function (a, b) { return b.total - a.total; });
}

function renderDomiEfectivo() {
  var card = document.getElementById('cj-domi-card');
  var cont = document.getElementById('cj-domi-lista');
  if (!card || !cont) return;
  var grupos = cjDomiGrupos(S.orders);
  var total = grupos.reduce(function (a, g) { return a + g.total; }, 0);

  //  Sin nada pendiente la tarjeta no se muestra: una tarjeta vacia todos los
  //  dias es ruido, y lo que es ruido deja de mirarse.
  if (!grupos.length) { card.classList.add('is-hidden'); return; }
  card.classList.remove('is-hidden');
  document.getElementById('cj-domi-n').textContent = grupos.length;
  document.getElementById('cj-domi-total').textContent = COPF(total);

  cont.innerHTML = grupos.map(function (g) {
    return '<div class="cj-mv-row" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid #F1F5F9">'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:13.5px;font-weight:700;color:#0F172A">' + cjEsc(g.info.nombre) + '</div>'
      +   '<div style="font-size:11.5px;color:#64748B;margin-top:2px">' + g.pedidos.length + (g.pedidos.length === 1 ? ' pedido' : ' pedidos') + ' por entregar</div>'
      + '</div>'
      + '<div class="tnum" style="font-weight:800;color:#B45309">' + COPF(g.total) + '</div>'
      + '<button class="cj-btn-primary" data-domi-clave="' + cjEsc(g.info.clave) + '">Recibir</button>'
      + '</div>';
  }).join('');

  cont.querySelectorAll('[data-domi-clave]').forEach(function (b) {
    b.addEventListener('click', function () { cjDomiAbrir(b.dataset.domiClave); });
  });
}

//  El texto del cliente nunca se pega crudo en la pantalla.
function cjEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

var CJ_DOMI = { grupo: null };

function cjDomiAbrir(clave) {
  var g = cjDomiGrupos(S.orders).filter(function (x) { return x.info.clave === clave; })[0];
  if (!g) { showToast('Ese domiciliario ya no tiene nada pendiente'); return; }
  CJ_DOMI.grupo = g;
  document.getElementById('dr-quien').textContent = g.info.nombre;
  document.getElementById('dr-nota').value = '';

  /*  Vienen TODOS marcados y se desmarca lo que no trajo: lo normal es que
      entregue todo, y hacerle marcar cinco casillas para el caso comun es
      trabajo de mas en pleno turno.                                        */
  document.getElementById('dr-pedidos').innerHTML = g.pedidos.map(function (o) {
    var hora = o.created_at ? new Date(o.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
    var quien = o.customer_name || 'Sin cliente';
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid #F1F5F9;cursor:pointer">'
      + '<input type="checkbox" class="dr-chk" checked data-id="' + cjEsc(o.id) + '" data-monto="' + (parseFloat(o.paid_amount) || 0) + '" style="width:17px;height:17px;accent-color:#5B6BFF">'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:13px;font-weight:600;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + cjEsc(quien) + '</div>'
      +   '<div style="font-size:11px;color:#94A3B8">' + hora + '</div>'
      + '</div>'
      + '<div class="tnum" style="font-size:13px;font-weight:700">' + COPF(parseFloat(o.paid_amount) || 0) + '</div>'
      + '</label>';
  }).join('');

  document.getElementById('dr-pedidos').querySelectorAll('.dr-chk').forEach(function (c) {
    c.addEventListener('change', cjDomiRecalcular);
  });
  cjDomiRecalcular();
  openPanel('panel-domi-recibir');
}
window.cjDomiAbrir = cjDomiAbrir;

function cjDomiRecalcular() {
  var t = 0;
  document.querySelectorAll('#dr-pedidos .dr-chk').forEach(function (c) {
    if (c.checked) t += parseFloat(c.dataset.monto) || 0;
  });
  var el = document.getElementById('dr-total');
  if (el) el.textContent = COPF(t);
  var btn = document.getElementById('btn-dr-confirmar');
  if (btn) btn.disabled = (t <= 0);
}

async function cjDomiRecibir() {
  var g = CJ_DOMI.grupo;
  if (!g) return;
  var ids = [], monto = 0;
  document.querySelectorAll('#dr-pedidos .dr-chk').forEach(function (c) {
    if (c.checked) { ids.push(c.dataset.id); monto += parseFloat(c.dataset.monto) || 0; }
  });
  if (!ids.length) { showToast('No marcaste ningún pedido'); return; }

  var btn = document.getElementById('btn-dr-confirmar');
  if (btn) btn.disabled = true;
  try {
    var nota = (document.getElementById('dr-nota').value || '').trim();
    var quienRecibe = S.session && S.session.cashier_name
      ? S.session.cashier_name
      : ((S.user && S.user.user_metadata && S.user.user_metadata.nombre) || 'Caja');

    var ins = await sb.from('pos_domi_entregas').insert({
      tenant_id:       S.tenantId,
      branch_id:       S.branchId,
      session_id:      (S.session && S.session.id) || null,
      custodio_tipo:   g.info.tipo,
      domiciliario_id: g.info.domiciliario_id,
      movil:           g.info.movil,
      custodio_nombre: g.info.nombre,
      recibido_por:    (S.user && S.user.id) || null,
      recibido_nombre: quienRecibe,
      monto:           monto,
      nota:            nota || null,
    }).select('id').single();

    if (ins.error || !ins.data) throw (ins.error || new Error('no se pudo guardar la entrega'));
    var entregaId = ins.data.id;

    /*  Recien ahora se marcan los pedidos. Si esto fallara a medias, la entrega
        quedaria diciendo mas plata de la que de verdad cambio de manos — asi
        que se lee cuantos quedaron marcados DE VERDAD y, si son menos, se
        corrige el monto de la entrega y se deja dicho por que. Vale mas un
        renglon que se explica que un numero que miente.                     */
    var up = await sb.from('pos_orders')
      .update({ domi_entrega_id: entregaId, domi_entregado_caja: true })
      .in('id', ids).select('id, paid_amount');

    var quedaron = (up.data || []).length;
    if (up.error || quedaron !== ids.length) {
      var real = (up.data || []).reduce(function (a, o) { return a + (parseFloat(o.paid_amount) || 0); }, 0);
      console.error('[caja] la entrega marco', quedaron, 'de', ids.length, up.error);
      await sb.from('pos_domi_entregas').update({
        monto: real,
        nota: ((nota ? nota + ' · ' : '') + 'Solo se pudieron marcar ' + quedaron + ' de ' + ids.length + ' pedidos').slice(0, 300),
      }).eq('id', entregaId);
      showToast('Se recibieron ' + quedaron + ' de ' + ids.length + ' pedidos — revisa la lista');
    } else {
      showToast('Recibido ' + COPF(monto) + ' de ' + g.info.nombre);
    }

    //  La pantalla sigue al dato, no al reves: se relee y se repinta.
    (up.data || []).forEach(function (r) {
      var o = (S.orders || []).find(function (x) { return x.id === r.id; });
      if (o) { o.domi_entrega_id = entregaId; o.domi_entregado_caja = true; }
    });
    closePanel('panel-domi-recibir');
    renderDomiEfectivo();
  } catch (e) {
    console.error('[caja] recibir efectivo del domiciliario:', e);
    showToast('No se pudo registrar: ' + ((e && e.message) || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.cjDomiRecibir = cjDomiRecibir;

// ── Movimientos ────────────────────────────────────────────────
function renderMovimientos(moves) {
  //  La plata de la calle vive en esta misma pantalla: es dinero del turno que
  //  no es una venta nueva. Se repinta con ella para no tener dos caminos.
  try { renderDomiEfectivo(); } catch (e) { console.error('[caja] efectivo domiciliarios:', e); }
  const cont  = document.getElementById('mv-lista');
  const badge = document.getElementById('mv-count');
  if (!cont) return;
  if (badge) badge.textContent = moves.length;

  if (!moves.length) {
    cont.innerHTML = '<div class="cj-empty-row">No hay movimientos en este turno</div>';
    return;
  }

  const arrowUp   = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  const arrowDown = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
  const xIcon     = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  cont.innerHTML = [...moves].reverse().map(m => {
    const isIn = m.type === 'ingreso';
    const d    = new Date(m.ts);
    const hora = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const sign = isIn ? '+' : '−';
    const col  = isIn ? '#16A34A' : '#DC2626';
    return `
      <div class="cj-mv-row">
        <div class="cj-mv-ic ${isIn?'in':'out'}">${isIn?arrowUp:arrowDown}</div>
        <div style="flex:1;min-width:0">
          <div class="cj-mv-concept">${m.concept||'—'}</div>
          <div class="cj-mv-meta">${hora} · ${m.medio||'Efectivo'}</div>
        </div>
        <div class="cj-mv-amount" style="color:${col}">${sign}${COPF(m.amount)}</div>
        <button class="cj-row-btn danger" onclick="deleteMov('${m.id}')">${xIcon}</button>
      </div>`;
  }).join('');
}

function renderMovimientosSummary(moves) {
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const neto     = ingresos - egresos;
  const el = id => document.getElementById(id);
  if(el('mv-total-in'))   el('mv-total-in').textContent   = COPF(ingresos);
  if(el('mv-total-out'))  el('mv-total-out').textContent  = COPF(egresos);
  if(el('mv-total-neto')) {
    el('mv-total-neto').textContent  = (neto>=0?'':'-') + COPF(Math.abs(neto));
    el('mv-total-neto').style.color  = neto >= 0 ? '#166534' : '#991B1B';
  }
}

// ── Cierres ────────────────────────────────────────────────────
/*  ⚠️ AQUI HABIA UN `renderCierres` QUE NUNCA SE EJECUTABA. Mas abajo (busca
    "cards clicables") hay otro con el mismo nombre que lo pisaba al cargar el
    archivo, asi que esta version —con su boton de "Reimprimir cierre"— jamas
    se dibujo en pantalla. Se borro el 2-sep-2026 despues de arreglar por error
    su boton en vez del de verdad.

    El que manda es el de abajo, y ese es el unico. No vuelvas a declarar dos
    funciones con el mismo nombre en este archivo.                          */
// ── Historial de ventas ────────────────────────────────────────
function renderHistorial(orders, items) {
  const cont = document.getElementById('hist-lista');
  if (!cont) return;
  orders = orders || [];
  const itemsByOrder = {};
  (items||[]).forEach(function(it){ (itemsByOrder[it.order_id]=itemsByOrder[it.order_id]||[]).push(it); });
  const active    = orders.filter(o=>o.status!=='cancelled');
  const cancelled = orders.filter(o=>o.status==='cancelled');
  const total     = active.reduce((s,o)=>s+(parseFloat(o.total_final ?? o.total)||0),0);
  const hc = document.getElementById('hist-count');
  const ht = document.getElementById('hist-total');
  if (hc) hc.textContent = `${active.length} ventas · ${cancelled.length} anuladas`;
  if (ht) ht.textContent = COPF(total);

  if (!orders.length) {
    const _f=S.histFilters||{};
    const _activos=(_f.estado&&_f.estado!=='todas')||(_f.canal&&_f.canal!=='todos')||(_f.pago&&_f.pago!=='todos')||_f.producto||_f.fecha;
    cont.innerHTML = '<div class="cj-empty-row">'+(_activos?'No hay pedidos que coincidan con los filtros':'No hay ventas en este turno')+'</div>';
    return;
  }

  const PAGO_INFO = {
    efectivo:      { color:'#16A34A', bg:'#DCFCE7', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>' },
    tarjeta:       { color:'#5B6BFF', bg:'#EEF2FF', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
    transferencia: { color:'#0EA5E9', bg:'#F0F9FF', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>' },
    nequi:         { color:'#8B5CF6', bg:'#F5F3FF', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/></svg>' },
    daviplata:     { color:'#E11D48', bg:'#FFF1F2', svg:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/></svg>' },
  };
  const CANAL_INFO = {
    salon:     { color:'#5B6BFF', bg:'#EEF2FF', label:'Salón' },
    mostrador: { color:'#06B6D4', bg:'#CFFAFE', label:'Mostrador' },
    rapido:    { color:'#F59E0B', bg:'#FEF3C7', label:'Rápida' },
    domicilio: { color:'#10B981', bg:'#D1FAE5', label:'Domicilio' },
  };
  const xIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  cont.innerHTML = orders.map(o => {
    const anulada = o.status === 'cancelled';
    const d       = new Date(o.created_at);
    const hora    = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const shortId = '#' + (o.id||'').slice(-4).toUpperCase();
    const pm      = (o.payment_method||'efectivo').toLowerCase();
    const pi      = PAGO_INFO[pm] || PAGO_INFO.efectivo;
    const ch      = (o.channel||'salon').toLowerCase();
    const ci      = CANAL_INFO[ch]  || CANAL_INFO.salon;
    const _pmRaw = String(o.payment_method || 'efectivo');
    const pmLabel = _pmRaw.charAt(0).toUpperCase() + _pmRaw.slice(1);
    const deleteBtn = (anulada || (S.histSessionId && S.histSessionId!=='current')) ? '' : `<button class="cj-row-btn danger" onclick="anularVenta('${o.id}')">${xIcon}</button>`;
    const anulBadge = anulada ? `<span class="cj-badge" style="color:#DC2626;background:#FEE2E2">Anulada</span>` : '';
    const cliente   = o.customer_name ? `<span style="font-size:11.5px;color:#94A3B8">· ${cjEsc(o.customer_name)}</span>` : '';
    const its       = itemsByOrder[o.id] || [];
    const itemsHtml = its.length ? '<div style="margin-top:7px;display:flex;flex-direction:column;gap:3px;border-top:1px dashed #E2E8F0;padding-top:7px">'
      + its.map(function(it){
          const q=it.quantity||1;
          const nm=it.product_name||it.name||'Producto';
          const pr=parseFloat(it.total!=null?it.total:(parseFloat(it.unit_price||it.product_price||0)*q))||0;
          return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#475569"><span><span style="font-weight:700;color:#0F172A">'+q+'×</span> '+cjEsc(nm)+'</span><span style="font-variant-numeric:tabular-nums;color:#64748B">'+COPF(pr)+'</span></div>';
        }).join('')
      + '</div>' : '';
    return `
      <div class="cj-sale-row${anulada?' anulada':''}" style="align-items:flex-start">
        <div style="width:52px;flex-shrink:0">
          <div class="cj-sale-id">${shortId}</div>
          <div class="cj-sale-time">${hora}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span class="cj-badge" style="color:${ci.color};background:${ci.bg}">${ci.label}</span>
            <span class="cj-badge method" style="color:${pi.color};background:${pi.bg}">${pi.svg} ${pmLabel}</span>
            ${anulBadge}
          </div>
          <div class="cj-sale-who">${cjEsc(o.waiter_name||'Sin nombre')} ${cliente}</div>
          ${itemsHtml}
        </div>
        <div class="cj-sale-total">${COPF(parseFloat(o.total_final ?? o.total)||0)}</div>
        ${deleteBtn}
      </div>`;
  }).join('');

  // buscador
  const inp = document.getElementById('hist-search');
  if (inp && !inp.dataset.bound) {
    inp.dataset.bound = '1';
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      document.querySelectorAll('.cj-sale-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

// ── Status bar sidebar ─────────────────────────────────────────
function updateStatusBar() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const sub   = document.getElementById('status-sub');
  const ind   = document.getElementById('cj-status-indicator');
  if (!dot) return;
  if (S.session) {
    dot.style.background = '#16A34A';
    label.textContent    = 'Caja abierta';
    if (ind) { ind.classList.remove('closed'); }
    const d = new Date(S.session.opened_at);
    const h = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    sub.textContent = `Turno ${S.session.shift_type||'—'} · desde ${h}`;
  } else {
    dot.style.background = '#94A3B8';
    label.textContent    = 'Caja cerrada';
    if (ind) { ind.classList.add('closed'); }
    sub.textContent      = '—';
  }
}

// ── Navegación ─────────────────────────────────────────────────
const CRUMB_LABELS = { caja:'Apertura y cierre', movimientos:'Ingresos y egresos', cierres:'Cierres de caja', historial:'Historial de ventas' };
document.querySelectorAll('.cj-nav-item[data-screen]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.cj-nav-item[data-screen]').forEach(function(b){ b.classList.remove('on'); });
    document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('on'); });
    this.classList.add('on');
    var sc = document.getElementById('screen-'+this.dataset.screen);
    if (sc) sc.classList.add('on');
    var crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = CRUMB_LABELS[this.dataset.screen]||this.dataset.screen;
  });
});

// ── Paneles ────────────────────────────────────────────────────
function openPanel(id) {
  document.getElementById(id)?.classList.remove('is-hidden');
  if (id === 'panel-abrir') { try { apPreparar(); } catch(e) { console.error('apertura:', e); } }
  // Al abrir el arqueo se recalcula el aviso de pedidos sin cobrar: el cajero
  // pudo haber cobrado alguno desde que cargó la pantalla.
  if (id === 'panel-arqueo') {
    try { cjPintarPendientes(); } catch(e) { console.warn('pendientes:', e); }
    try { cjPintarDomisEfectivo(); } catch(e) { console.warn('efectivo domis:', e); }
  }
}
function closePanel(id){ document.getElementById(id)?.classList.add('is-hidden'); }
window.openPanel  = openPanel;
window.closePanel = closePanel;

document.querySelectorAll('.cj-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target===ov) closePanel(ov.id); });
});

// ── Segmentos ──────────────────────────────────────────────────
function segSelect(btn, groupId) {
  document.querySelectorAll('#'+groupId+' button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}
window.segSelect = segSelect;

// ── Medio pago en movimiento ───────────────────────────────────
function selectMedio(btn) {
  document.querySelectorAll('.mov-medio-btn').forEach(b=>{
    b.style.background=''; b.style.borderColor=''; b.style.color='';
  });
  btn.style.background='#DCFCE7'; btn.style.borderColor='#16A34A'; btn.style.color='#16A34A';
}
window.selectMedio = selectMedio;

/* ══ APERTURA DE CAJA ══════════════════════════════════════════
   La base puede venir de TRES sitios y se SUMAN, no se excluyen: lo que el
   cajero pone a mano, lo que cuenta billete por billete, y lo que quedo en el
   cajon del cierre anterior (marcando que denominaciones deja y cuales saca).

   Caso real: dejo $100.000 de mi bolsillo y me quedo con las monedas de ayer
   pero saco todos los billetes. Base = 100.000 + las monedas.

   Por eso el total va SIEMPRE a la vista: con tres fuentes nadie las suma de
   cabeza, y abrir con la base equivocada descuadra el cierre de todo el dia. */
const AP_DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];
const AP_RAPIDOS = [50000, 100000, 200000, 300000];
const AP = { libre: 0, arqueo: {}, dejar: {}, ultimo: null, tab: 0 };

function apCOP(n) { return COPF(n); }

/* El ultimo cierre CON arqueo: es el unico que sabe que habia en el cajon.
   Un cierre sin contar no sirve — no guarda denominaciones. */
async function apUltimoCierre() {
  try {
    const q = sb.from('pos_sessions')
      .select('closed_at, arqueo_denoms, arqueo_contado')
      .eq('status', 'closed').not('arqueo_denoms', 'is', null)
      .order('closed_at', { ascending: false }).limit(1);
    q.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data } = await q;
    const r = data && data[0];
    if (!r || !r.arqueo_denoms || !Array.isArray(r.arqueo_denoms.lineas) || !r.arqueo_denoms.lineas.length) return null;
    return { fecha: r.closed_at, denoms: r.arqueo_denoms, total: Number(r.arqueo_denoms.total) || 0 };
  } catch(e) { console.error('apUltimoCierre:', e); return null; }
}

async function apPreparar() {
  AP.libre = 0; AP.arqueo = {}; AP.dejar = {}; AP.tab = 0;
  document.getElementById('abrir-monto').value = 0;

  AP.ultimo = await apUltimoCierre();
  /* Todo marcado de entrada: lo normal es dejar la base como estaba y quitar
     lo que uno saco. Al reves obligaria a marcar diez casillas cada mañana. */
  if (AP.ultimo) AP.ultimo.denoms.lineas.forEach(l => { AP.dejar[l.denom] = true; });

  apPintarRapidos();
  apPintarArqueo();
  apPintarViejo();
  apTab(AP.ultimo ? 2 : 0);
  apSumar();
}

function apPintarRapidos() {
  document.getElementById('ap-rap').innerHTML = AP_RAPIDOS
    .map(v => `<button class="cj-btn-ghost sm" data-aprap="${v}">${apCOP(v)}</button>`).join('');
  document.querySelectorAll('[data-aprap]').forEach(b => {
    b.onclick = () => { document.getElementById('abrir-monto').value = b.dataset.aprap; apSumar(); };
  });
}

function apPintarArqueo() {
  document.getElementById('ap-arqueo').innerHTML = AP_DENOMS.map(d => `
    <div class="cj-denom-row">
      <span class="cj-denom-name">${apCOP(d)}</span>
      <span style="width:74px;display:flex;justify-content:center">
        <input class="cj-num" type="number" min="0" placeholder="0" data-aparq="${d}"></span>
      <span class="cj-denom-total" data-aptot="${d}">$0</span>
    </div>`).join('');
  document.querySelectorAll('[data-aparq]').forEach(inp => {
    inp.oninput = function () {
      const d = Number(this.dataset.aparq);
      AP.arqueo[d] = Math.max(0, parseInt(this.value || '0', 10) || 0);
      document.querySelector(`[data-aptot="${d}"]`).textContent = apCOP(d * AP.arqueo[d]);
      apSumar();
    };
  });
}

function apPintarViejo() {
  const caja = document.getElementById('ap-viejo-caja');
  const cab  = document.getElementById('ap-viejo-cab');
  if (!AP.ultimo) {
    cab.innerHTML = '';
    caja.style.display = 'none';
    document.getElementById('ap-viejo').innerHTML = '';
    document.getElementById('ap-saca').innerHTML =
      '<span>El último cierre no se contó, así que no hay desglose para dejar.</span>';
    return;
  }
  caja.style.display = '';
  const f = new Date(AP.ultimo.fecha);
  cab.innerHTML = `<span>Cierre del ${f.getDate()} de ${MESES[f.getMonth()]} · quedaron <b>${apCOP(AP.ultimo.total)}</b></span>` +
    `<button class="cj-link" id="ap-todos"></button>`;

  const grupos = [['Billetes', 'billete'], ['Monedas', 'moneda']];
  let html = '';
  grupos.forEach(([titulo, g]) => {
    const lineas = AP.ultimo.denoms.lineas
      .filter(l => l.grupo === g).sort((a, b) => b.denom - a.denom);
    if (!lineas.length) return;
    html += `<div class="cj-apgrupo">${titulo}</div>`;
    lineas.forEach(l => {
      const on = AP.dejar[l.denom] !== false;
      html += `<label class="cj-apfila${on ? '' : ' off'}">
        <input type="checkbox" data-apdej="${l.denom}"${on ? ' checked' : ''}>
        <span class="d">${apCOP(l.denom)}</span>
        <span class="q">×${l.qty}</span>
        <span class="t">${apCOP(l.total)}</span></label>`;
    });
  });
  document.getElementById('ap-viejo').innerHTML = html;
  document.querySelectorAll('[data-apdej]').forEach(c => {
    c.onchange = function () {
      AP.dejar[Number(this.dataset.apdej)] = this.checked;
      this.closest('.cj-apfila').classList.toggle('off', !this.checked);
      apSumar();
    };
  });
  apTodosBoton();
}

function apTodosBoton() {
  const b = document.getElementById('ap-todos');
  if (!b || !AP.ultimo) return;
  const alguno = AP.ultimo.denoms.lineas.some(l => AP.dejar[l.denom] !== false);
  b.textContent = alguno ? 'Quitar todos' : 'Marcar todos';
  b.onclick = () => {
    AP.ultimo.denoms.lineas.forEach(l => { AP.dejar[l.denom] = !alguno; });
    apPintarViejo();
    apSumar();
  };
}

function apLibre()  { return Math.max(0, parseFloat(document.getElementById('abrir-monto').value) || 0); }
function apArqueo() { return AP_DENOMS.reduce((s, d) => s + d * (AP.arqueo[d] || 0), 0); }
function apViejo()  {
  if (!AP.ultimo) return 0;
  return AP.ultimo.denoms.lineas.reduce((s, l) => s + (AP.dejar[l.denom] !== false ? l.total : 0), 0);
}

function apSumar() {
  const a = apLibre(), b = apArqueo(), c = apViejo(), t = a + b + c;
  const tabs = document.querySelectorAll('#ap-tabs button');
  [a, b, c].forEach((v, i) => {
    const m = tabs[i].querySelector('.m');
    m.textContent = v > 0 ? '+ ' + apCOP(v) : '—';
    m.classList.toggle('hay', v > 0);
  });

  document.getElementById('ap-total').textContent = apCOP(t);
  const partes = [];
  if (a > 0) partes.push(['Pusiste', a]);
  if (b > 0) partes.push(['Contaste', b]);
  if (c > 0) partes.push(['Ya estaba', c]);
  document.getElementById('ap-chips').innerHTML = partes.length > 1
    ? partes.map(p => `<span class="cj-apchip">${p[0]} ${apCOP(p[1])}</span>`).join('')
    : '<span class="cj-apnota">Puedes combinar las tres pestañas: se suman.</span>';

  if (AP.ultimo) {
    const fuera = AP.ultimo.total - c;
    document.getElementById('ap-saca').innerHTML = fuera > 0
      ? `<span>Lo que no marcaste sale del cajón</span><b>${apCOP(fuera)}</b>`
      : '<span>Dejas todo lo que había</span><span></span>';
  }
  /* Abrir con base en cero es raro pero legitimo (un negocio que arranca sin
     sencillo), asi que no se bloquea el boton: solo se avisa con el total. */
  apTodosBoton();
}

function apTab(i) {
  AP.tab = i;
  document.querySelectorAll('#ap-tabs button').forEach((b, n) => b.classList.toggle('on', n === i));
  [0, 1, 2].forEach(n => document.getElementById('ap-p' + n).classList.toggle('on', n === i));
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

document.querySelectorAll('#ap-tabs button').forEach(b => {
  b.onclick = () => apTab(Number(b.dataset.ap));
});
document.getElementById('abrir-monto').addEventListener('input', apSumar);

// ── Acciones principales ───────────────────────────────────────
document.getElementById('btn-confirmar-abrir').addEventListener('click', async function() {
  const monto    = apLibre() + apArqueo() + apViejo();
  const turnoBtn = document.querySelector('#seg-turno button.on');
  const turno    = turnoBtn ? turnoBtn.textContent.trim() : 'Noche';
  /* De donde salio cada peso. Sin esto, al ver "$121.700" mañana nadie sabria
     si el cajero puso plata suya o si eso venia del cajon. */
  const detalle = {
    puesto: apLibre(), contado: apArqueo(), heredado: apViejo(),
    arqueo: AP_DENOMS.filter(d => AP.arqueo[d]).map(d => ({ denom: d, qty: AP.arqueo[d] })),
    dejadas: AP.ultimo ? AP.ultimo.denoms.lineas.filter(l => AP.dejar[l.denom] !== false)
                                 .map(l => ({ denom: l.denom, qty: l.qty })) : [],
  };
  if (await handleOpenSession(monto, turno, detalle)) closePanel('panel-abrir');
});

// ── Verificar turnos abiertos de meseros ───────────────────────
async function checkOpenShifts() {
  try {
    const q = sb.from('pos_shifts').select('id, waiter_id, started_at, pos_users!waiter_id(name, role)')
      .eq('status', 'active');
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    q.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data } = await q;
    return data || [];
  } catch(e) { console.error('checkOpenShifts:', e); return []; }
}

async function closeShift(shiftId, rowEl) {
  try {
    const { error } = await sb.from('pos_shifts')
      .update({ status: 'closed', ended_at: new Date().toISOString() })
      .eq('id', shiftId);
    if (error) throw error;
    rowEl.style.opacity = '0.4';
    rowEl.querySelector('.cj-shift-close-btn').disabled = true;
    rowEl.querySelector('.cj-shift-close-btn').textContent = 'Cerrado';
    // Re-check si quedan turnos abiertos
    const remaining = document.querySelectorAll('.cj-shift-row:not([data-closed])');
    rowEl.dataset.closed = '1';
    const open = document.querySelectorAll('.cj-shift-row:not([data-closed="1"])');
    if (!open.length) {
      document.getElementById('shifts-warn').style.display = 'none';
      document.getElementById('btn-confirmar-cerrar').disabled = false;
    }
  } catch(e) { showToast('Error al cerrar turno'); }
}
window.closeShift = closeShift;

document.getElementById('btn-cerrar').addEventListener('click', async function() {
  if (!S.session) return;
  const moves    = await getMoves();
  const active   = S.orders.filter(o=>o.status!=='cancelled');
  // Pagos REALES por método (pos_payments — reparte bien los pagos mixtos)
  const pagos    = S.pagosMetodo || {};
  const ventasEf = pagos['efectivo'] || 0;
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session.opening_cash||0;
  const totalV   = active.reduce((s,o)=>s+(parseFloat(o.total_final ?? o.total)||0),0);
  const efectivo = base + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo(active);
  const cajero   = S.session.cashier_name || (S.user?.user_metadata?.nombre)||'—';
  const turno    = S.session.shift_type||'—';

  document.getElementById('cerrar-sub').textContent      = `Caja 01 · Turno ${turno}`;
  document.getElementById('cerrar-esperado').textContent = COPF(efectivo);

  /*  ⚠️ LO QUE TODAVIA ESTA EN LA CALLE, DICHO EN VOZ ALTA.

      El esperado de arriba incluye los domicilios cobrados en efectivo, porque
      la venta se registra cuando el domiciliario cobra. Si esa plata aun no ha
      llegado al cajon, el arqueo sale corto por ese valor exacto y no hay
      forma de saber por que.

      Es un AVISO y no una resta: el numero de arriba se calcula igual que
      siempre. Cambiar la cuenta seria cambiar un numero que Sergio ya conoce,
      y eso se decide con el delante, no de madrugada.                      */
  try {
    var _pend = cjDomiGrupos(active);
    var _pendTotal = _pend.reduce(function (a, g) { return a + g.total; }, 0);
    var _avisoDomi = document.getElementById('cerrar-domi-aviso');
    if (_avisoDomi) {
      if (_pendTotal > 0) {
        _avisoDomi.classList.remove('is-hidden');
        _avisoDomi.innerHTML = 'De ese total, <b>' + COPF(_pendTotal) + '</b> todavía lo tienen '
          + (_pend.length === 1 ? 'el domiciliario' : 'los domiciliarios') + ': '
          + _pend.map(function (g) { return cjEsc(g.info.nombre) + ' (' + COPF(g.total) + ')'; }).join(' · ')
          + '. Si no lo recibes en «Ingresos y egresos», el conteo va a salir corto por ese valor.';
      } else {
        _avisoDomi.classList.add('is-hidden');
      }
    }
  } catch (e) { console.error('[caja] aviso de efectivo en la calle:', e); }

  // Métodos CONFIGURADOS en "Métodos de pago" (antes esta lista estaba fija en
  // el código y mostraba Tarjeta/Nequi/Daviplata aunque no existieran).
  const methods = S.payMethods || [];
  const usados  = {};
  const filasPago = methods.map(m => {
    usados[m.key] = true;
    return [m.nombre, COPF(pagos[m.key] || 0), ' mut'];
  });
  // "Otros": cobros históricos con un método que ya no está configurado
  let otrosPago = 0;
  Object.keys(pagos).forEach(k => { if (!usados[k]) otrosPago += pagos[k] || 0; });
  if (otrosPago > 0) filasPago.push(['Otros', COPF(otrosPago), ' mut']);

  // Filas kv del resumen
  const kvs = [
    ['Base de apertura',  COPF(base),     ''],
    ['Total de ventas',   COPF(totalV),   ' strong'],
    null, // divider
    ...filasPago,
    null,
    ['Ingresos',          `<span style="color:#16A34A">+${COPF(ingresos)}</span>`, ''],
    ['Egresos',           `<span style="color:#DC2626">−${COPF(egresos)}</span>`, ''],
  ];
  document.getElementById('cerrar-resumen').innerHTML = kvs.map(r => {
    if (!r) return `<div style="height:1px;background:#F1F5F9;margin:6px 0"></div>`;
    const [k, v, cls] = r;
    return `<div class="cj-kv"><span class="k${cls||''}">${k}</span><span class="v${cls||''}">${v}</span></div>`;
  }).join('');

  // ── Pedidos SIN TERMINAR: no se puede cerrar el turno dejándolos vivos
  // (quedarían "volando" fuera de todo cuadre). Todo debe estar cobrado o anulado.
  const abiertos = await getPedidosAbiertos();
  const ordersWarn = document.getElementById('orders-warn');
  const ordersList = document.getElementById('orders-warn-list');
  if (ordersWarn && ordersList) {
    if (abiertos.length) {
      ordersList.innerHTML = abiertos.map(o => {
        const donde = o.table_id ? ('Mesa ' + cjEsc(String(o.table_id).replace(/^t/i, ''))) :
          (o.channel === 'domicilio' ? 'Domicilio' : o.channel === 'rapido' ? 'Venta rápida' : 'Pedido');
        const est = ESTADO_FULFILL_LBL[o.estado] || ESTADO_LBL[o.status] || o.status;
        const cli = o.customer_name ? ' · ' + cjEsc(o.customer_name) : '';
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1px solid #FECACA;border-radius:8px;padding:7px 10px">'
          + '<div style="min-width:0"><div style="font-size:12.5px;font-weight:700;color:#0F172A">' + donde + cli + '</div>'
          + '<div style="font-size:11px;color:#B91C1C">' + est + '</div></div>'
          + '<span style="font-size:12.5px;font-weight:800;color:#0F172A;white-space:nowrap">' + COPF(parseFloat(o.total_final ?? o.total) || 0) + '</span></div>';
      }).join('');
      ordersWarn.style.display = 'block';
    } else {
      ordersWarn.style.display = 'none';
    }
  }

  // Verificar turnos de meseros abiertos
  const openShifts = await checkOpenShifts();
  const shiftsWarn = document.getElementById('shifts-warn');
  const shiftsList = document.getElementById('shifts-list');
  const confirmBtn = document.getElementById('btn-confirmar-cerrar');
  if (openShifts.length > 0) {
    shiftsList.innerHTML = openShifts.map(sh => {
      const nombre = sh.pos_users?.name || 'Mesero';
      const rol    = sh.pos_users?.role || 'mesero';
      const desde  = sh.started_at ? new Date(sh.started_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '—';
      return `<div class="cj-shift-row" data-shift-id="${sh.id}">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <div style="width:30px;height:30px;border-radius:8px;background:#FEF3C7;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#92400E">${nombre[0].toUpperCase()}</div>
          <div><div style="font-size:13px;font-weight:600;color:#0F172A">${nombre}</div><div style="font-size:11px;color:#64748B">${rol} · desde ${desde}</div></div>
        </div>
        <button class="cj-shift-close-btn cj-btn-ghost sm" onclick="closeShift('${sh.id}', this.closest('.cj-shift-row'))">Cerrar turno</button>
      </div>`;
    }).join('');
    shiftsWarn.style.display = 'block';
  } else {
    shiftsWarn.style.display = 'none';
  }
  // Se bloquea el cierre por CUALQUIERA de las dos causas
  confirmBtn.disabled = (openShifts.length > 0) || (abiertos.length > 0);
  // Cerrar caja: permiso caja.cerrar; sin permiso pide PIN.
  if (window.posGuard) window.posGuard('caja.cerrar', function(){ openPanel('panel-cerrar'); }, 'Cerrar la caja requiere permiso de administrador.');
  else openPanel('panel-cerrar');
});

document.getElementById('btn-confirmar-cerrar').addEventListener('click', async function() {
  if (!S.session) { showToast('No hay sesión activa'); return; }
  const moves    = await getMoves();
  const active   = S.orders.filter(o=>o.status!=='cancelled');
  // Efectivo REAL recibido (pos_payments incluye la parte en efectivo de mixtos)
  const ventasEf = (S.pagosMetodo && S.pagosMetodo['efectivo']) || 0;
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session.opening_cash||0;
  const totalV   = active.reduce((s,o)=>s+(parseFloat(o.total_final ?? o.total)||0),0);
  const esperado = base + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo(active);
  // Si se hizo arqueo, el cierre guarda el CONTADO real y su diferencia;
  // sin arqueo, guarda el esperado (comportamiento anterior).
  const contado  = (typeof S.arqueoContado === 'number') ? S.arqueoContado : null;
  await handleCloseSession(contado !== null ? contado : esperado, totalV,
                           contado !== null ? (contado - esperado) : null, contado);
  closePanel('panel-cerrar');
});

document.getElementById('btn-dr-confirmar')?.addEventListener('click', cjDomiRecibir);

document.getElementById('btn-mov').addEventListener('click', function() {
  if (!S.session) { showToast('Abre la caja primero'); return; }
  // Ingresos y egresos: permiso caja.movimientos; sin permiso pide PIN.
  if (window.posGuard) window.posGuard('caja.movimientos', function(){ openPanel('panel-movimiento'); }, 'Registrar movimientos de caja requiere permiso de administrador.');
  else openPanel('panel-movimiento');
});

document.getElementById('btn-confirmar-mov').addEventListener('click', function() {
  if (!S.session) { showToast('Abre la caja primero'); return; }
  const monto   = parseFloat(document.getElementById('mov-monto').value)||0;
  if (!monto)   { showToast('Ingresa un monto válido'); return; }
  const concept = document.getElementById('mov-concepto').value.trim()||'—';
  const tipoBtn = document.querySelector('#seg-tipo-mov button.on');
  const tipo    = tipoBtn && tipoBtn.textContent.includes('Ingreso') ? 'ingreso' : 'egreso';
  const medioBtn= document.querySelector('.mov-medio-btn[style*="background"]');
  const medio   = medioBtn ? medioBtn.dataset.medio : 'Efectivo';
  handleAddMovimiento(tipo, monto, concept, medio);
  document.getElementById('mov-monto').value = '';
  document.getElementById('mov-concepto').value = '';
  closePanel('panel-movimiento');
});

/* LOS BLOQUES DEL ARQUEO SE PIDEN POR SU ETIQUETA, NO POR EL ORDEN.
   El 16-ago el modal de APERTURA estreno sus propios bloques .cj-denom, y
   como estan antes en la pagina, el bloque 0 dejo de ser el de billetes del
   arqueo: los billetes se contaban como monedas y el recibo del cierre
   imprimia el SENCILLO y los BILLETES DE 50/100 en cero (la pantalla seguia
   bien porque el total no depende del grupo). Ahora cada bloque dice lo que
   es con data-grupo y se busca dentro del panel del arqueo. */
function cjBloquesArqueo() {
  const panel = document.getElementById('panel-arqueo');
  const marcados = (panel || document).querySelectorAll('.cj-denom[data-grupo]');
  if (marcados.length) return marcados;
  return (panel || document).querySelectorAll('.cj-denom');   // respaldo
}
function cjGrupoDe(grp, gi) {
  return grp.dataset.grupo || (gi === 0 ? 'billete' : 'moneda');
}
function cjInputsArqueo() {
  const panel = document.getElementById('panel-arqueo');
  return (panel || document).querySelectorAll('.denom-input');
}

// Rellena los inputs de denominaciones desde un arqueo guardado (arqueo_denoms).
// Empareja por denominación Y grupo (billete/moneda) porque el $1.000 existe en
// ambas columnas. Así, al reabrir el arqueo en el mismo turno, aparece prellenado
// con lo que ya contaste y no toca volver a contar.
function fillArqueoDenoms(denoms) {
  const lineas = (denoms && denoms.lineas) ? denoms.lineas : [];
  cjBloquesArqueo().forEach((grp, gi) => {
    const grupo = cjGrupoDe(grp, gi);
    grp.querySelectorAll('.denom-input').forEach(inp => {
      const denom = parseInt(inp.dataset.val, 10) || 0;
      const l = lineas.find(x => x.denom === denom && x.grupo === grupo);
      inp.value = (l && l.qty) ? l.qty : '';
    });
  });
}

document.getElementById('btn-arqueo').addEventListener('click', function() {
  const guardado = S.arqueoDenoms;
  if (guardado && guardado.lineas && guardado.lineas.length && (guardado.total || 0) > 0) {
    // Reabrir el arqueo del turno ya prellenado con lo que se contó antes.
    fillArqueoDenoms(guardado);
    updateArqueoTotals();   // recalcula columnas TOTAL, subtotales, contado, esperado y diferencia
  } else {
    // Primera vez en el turno: arqueo en blanco.
    S.arqueoContado = null;
    cjInputsArqueo().forEach(inp=>{ inp.value=''; });
    document.querySelectorAll('.cj-denom-total').forEach(td=>{ td.textContent='0'; });
    document.getElementById('subtotal-billetes').textContent = '$0';
    document.getElementById('subtotal-monedas').textContent  = '$0';
    document.getElementById('arqueo-contado').textContent    = '$0';
    document.getElementById('arqueo-pie').textContent        = '$0';
    document.getElementById('arqueo-diff').textContent       = '$0';
    updateArqueoEsperado();
  }
  openPanel('panel-arqueo');
});

document.getElementById('btn-guardar-arqueo').addEventListener('click', async function() {
  S.arqueoContado = getArqueoContado();
  // Persistir el arqueo YA en la sesión abierta (antes solo quedaba en memoria
  // y se perdía al recargar la página)
  try {
    if (S.session) {
      const moves    = await getMoves();
      const ventasEf = (S.pagosMetodo && S.pagosMetodo['efectivo']) || 0;
      const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
      const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
      const esperado = (S.session.opening_cash||0) + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo();
      S.arqueoDenoms = getArqueoDenoms();
      await sb.from('pos_sessions').update({
        arqueo_contado: S.arqueoContado,
        arqueo_diff:    S.arqueoContado - esperado,
        arqueo_denoms:  S.arqueoDenoms,
      }).eq('id', S.session.id);
    }
  } catch(e) { console.error('guardar arqueo:', e); }
  showToast('Arqueo guardado: ' + COPF(S.arqueoContado));
  closePanel('panel-arqueo');
});

cjInputsArqueo().forEach(inp => {
  inp.addEventListener('input', updateArqueoTotals);
});

function updateArqueoTotals() {
  const groups = cjBloquesArqueo();
  let billetes = 0, monedas = 0;
  groups.forEach((grp, gi) => {
    let sub = 0;
    grp.querySelectorAll('.denom-input').forEach(inp => {
      const qty   = parseInt(inp.value||'0',10)||0;
      const denom = parseInt(inp.dataset.val,10);
      const tot   = qty * denom;
      sub += tot;
      const td = inp.closest('.cj-denom-row')?.querySelector('.cj-denom-total');
      if (td) td.textContent = COPF(tot);
    });
    if (cjGrupoDe(grp, gi) === 'billete') billetes+=sub; else monedas+=sub;
  });
  const total = billetes + monedas;
  document.getElementById('subtotal-billetes').textContent = COPF(billetes);
  document.getElementById('subtotal-monedas').textContent  = COPF(monedas);
  document.getElementById('arqueo-contado').textContent    = COPF(total);
  document.getElementById('arqueo-pie').textContent        = COPF(total);
  updateArqueoEsperado();
}

function getArqueoContado() {
  let t = 0;
  cjInputsArqueo().forEach(inp=>{
    t += (parseInt(inp.value||'0',10)||0) * parseInt(inp.dataset.val,10);
  });
  return t;
}

// Detalle del paloteo (conteo por denominación) para guardarlo e imprimirlo.
// Antes solo se persistía el total contado → la separación billetes/sencillo/
// monedas se perdía al cerrar. Devuelve { lineas:[{denom,qty,total,grupo}], ... }
// ── Datos consolidados del turno para los tickets de caja ──────────
/* Plural de la unidad de uso: "1 unidad" / "21 unidades", "1 porción" /
   "40 porciones" (las palabras en -ón pierden la tilde al pluralizar). */
function cjPlural(n, u) {
  u = String(u || '').trim();
  if (!u || Math.abs(n) === 1) return u;
  if (/ón$/i.test(u)) return u.replace(/ón$/i, 'ones');
  return /[aeiouáéíóú]$/i.test(u) ? u + 's' : u + 'es';
}
/* Cuánto es el stock en unidades de uso. Se redondea a entero cuando pasa de 1
   (nadie dice "39,65 porciones") y a un decimal cuando es menos, para no
   mostrar un "0" que parecería que no queda nada. */
function cjEquivalencia(stock, conversion, useUnit) {
  var n = (Number(stock) || 0) * (Number(conversion) || 0);
  if (!n || !useUnit) return '';
  var v = n >= 1 ? Math.round(n) : Math.round(n * 10) / 10;
  return v + ' ' + cjPlural(v, useUnit);
}

/* Insumos por comprar. Se piden al cerrar porque es cuando Sergio puede anotar
   lo del día siguiente. Si el restaurante no lleva inventario o la consulta
   falla, devuelve lista vacía y el cierre sale igual que siempre. */
async function cjInsumosBajos() {
  try {
    /* La vista ya resuelve de que bolsa sale el "cuanto hay" segun el modo de
       la marca: aqui solo se pide "lo de esta sede". */
    const { data } = await sb.from('v_iv_insumos_sede')
      .select('nombre, stock, min_stock, buy_unit, use_unit, conversion, control_manual, agotado_manual, sub_inventario, stock_servicio')
      .eq('branch_id', S.branchId).eq('activo', true);
    return (data || []).filter(function (i) {
      // Marcado a mano como agotado ("se acabó") — no depende de la cantidad.
      if (i.control_manual && i.agotado_manual) return true;
      // Sin mínimo definido no se vigila: no se inventa un umbral.
      const min = Number(i.min_stock) || 0;
      if (min <= 0) return false;
      return (Number(i.stock) || 0) <= min;
    }).map(function (i) {
      return {
        nombre:  i.nombre,
        stock:   Number(i.stock) || 0,
        min:     Number(i.min_stock) || 0,
        unidad:  i.buy_unit || '',
        // Equivalencia en unidades de uso: "0.084 Paquete" no dice nada,
        // "1 unidad" sí.
        equiv:   cjEquivalencia(i.stock, i.conversion, i.use_unit),
        agotado: !!(i.control_manual && i.agotado_manual) || (Number(i.stock) || 0) <= 0,
      };
    }).sort(function (a, b) {
      // Primero lo agotado, después lo que está por acabarse.
      if (a.agotado !== b.agotado) return a.agotado ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  } catch (e) { console.warn('[caja] insumos bajos:', e); return []; }
}

/* Pinta "Por comprar". Si no hay nada bajo la tarjeta se esconde: en una noche
   normal no debe ocupar espacio ni parecer una alerta. */
function cjPintarBajos(bajos) {
  const card = document.getElementById('cj-card-bajos');
  const lista = document.getElementById('cj-bajos-lista');
  const n = document.getElementById('cj-bajos-n');
  if (!card || !lista) return;
  bajos = bajos || [];
  if (!bajos.length) { card.classList.add('is-hidden'); return; }
  card.classList.remove('is-hidden');
  if (n) n.textContent = '· ' + bajos.length;
  lista.innerHTML = bajos.map(function (i) {
    const der = i.agotado
      ? '<span style="font-size:12.5px;font-weight:800;color:#DC2626">Se acabó</span>'
      : '<span style="font-size:12.5px;font-weight:700;color:#B45309">' + i.stock + (i.unidad ? ' ' + i.unidad : '')
        + (i.equiv ? ' <span style="color:#94A3B8;font-weight:600">(' + i.equiv + ')</span>' : '') + '</span>';
    return '<div class="cj-channel-row"><span style="display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:#0F172A">'
         + '<span style="width:9px;height:9px;border-radius:999px;background:' + (i.agotado ? '#DC2626' : '#F59E0B') + '"></span>'
         + (i.nombre || '') + '</span>' + der + '</div>';
  }).join('');
}

/* Imprimir SOLO la lista de compras, sin el cierre entero: sirve para llevarla
   al mercado. El cierre completo la trae igual al final. */
async function imprimirPorComprar() {
  const bajos = (S.insumosBajos && S.insumosBajos.length) ? S.insumosBajos : await cjInsumosBajos();
  if (!bajos.length) { showToast('No hay insumos bajos'); return; }
  if (typeof window.posPrintTicket !== 'function') { showToast('Impresión no disponible en esta pantalla'); return; }
  const filas = bajos.map(function (i) {
    const der = i.agotado ? 'SE ACABO' : (i.stock + (i.unidad ? ' ' + i.unidad : '') + (i.equiv ? ' (' + i.equiv + ')' : ''));
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:12.5px">'
         + '<span>' + i.nombre + '</span><span>' + der + '</span></div>';
  }).join('');
  const fecha = new Date().toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:Arial,Helvetica,sans-serif;width:72mm;max-width:72mm;padding:8px 6px;color:#000;line-height:1.35}</style></head><body>'
    + '<div style="text-align:center;font-size:15px;font-weight:900">POR COMPRAR</div>'
    + '<div style="text-align:center;font-size:10.5px;color:#333;margin-bottom:6px">' + (S.negocioNombre || '') + ' · ' + fecha + '</div>'
    + '<div style="border-top:1px dashed #000;margin:6px 0"></div>' + filas
    + '<div style="border-top:1px dashed #000;margin:6px 0"></div>'
    + '<div style="font-size:11px;text-align:center">' + bajos.length + ' insumo' + (bajos.length === 1 ? '' : 's') + '</div>'
    + '</body></html>';
  const ok = await window.posPrintTicket(html, 'recibo');
  if (ok) showToast('Lista enviada a la impresora');
}
window.imprimirPorComprar = imprimirPorComprar;

/*  Como se llama el negocio en el encabezado del ticket. Se cachea porque
    no cambia, y la marca manda sobre el nombre de la sede.                */
async function cjNombreNegocio() {
  if (S.negocioNombre) return S.negocioNombre;
  try {
    const { data: br } = await sb.from('branches').select('name, brand_id').eq('id', S.branchId).maybeSingle();
    let nom = (br && br.name) || '';
    if (br && br.brand_id) {
      const { data: bd } = await sb.from('brands').select('name').eq('id', br.brand_id).maybeSingle();
      if (bd && bd.name) nom = bd.name;
    }
    S.negocioNombre = nom || 'CAJA';
  } catch (e) { S.negocioNombre = 'CAJA'; }
  return S.negocioNombre;
}

async function buildCierreData() {
  const moves    = await getMoves();
  const ventasEf = (S.pagosMetodo && S.pagosMetodo['efectivo']) || 0;
  const ingresos = moves.filter(m => m.type === 'ingreso').reduce((s, m) => s + (m.amount || 0), 0);
  const egresos  = moves.filter(m => m.type === 'egreso').reduce((s, m) => s + (m.amount || 0), 0);
  const base     = S.session ? (S.session.opening_cash || 0) : 0;
  const esperado = base + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo();
  const activos  = (S.orders || []).filter(o => o.status !== 'cancelled');
  const ventas   = activos.reduce((s, o) => s + (parseFloat(o.total_final ?? o.total) || 0), 0);
  // Unificar métodos por nombre legible (efectivo/Efectivo cuentan igual)
  const metodos = {};
  Object.keys(S.pagosMetodo || {}).forEach(k => {
    const key = k.toLowerCase();
    metodos[key] = (metodos[key] || 0) + (S.pagosMetodo[k] || 0);
  });
  await cjNombreNegocio();     // encabezado del ticket
  const bajos = await cjInsumosBajos();
  S.insumosBajos = bajos;   // la pantalla lo usa sin volver a consultar
  cjPintarBajos(bajos);
  return {
    negocio:  S.negocioNombre,
    session:  S.session,
    base, ventas, nPedidos: activos.length,
    metodos, ingresos, egresos, esperado,
    // Los insumos por comprar NO van en el ticket de cierre: es una lista
    // aparte, que se imprime sola desde su propia tarjeta.
  };
}

// Imprimir PALOTEO (planilla de conteo por denominación)
async function imprimirPaloteo() {
  if (typeof window.posBuildPaloteo !== 'function' || typeof window.posPrintTicket !== 'function') {
    showToast('Impresión no disponible en esta pantalla'); return;
  }
  const d = getArqueoDenoms();
  const abierto = document.getElementById('panel-arqueo') &&
                  !document.getElementById('panel-arqueo').classList.contains('is-hidden');
  const denoms = (d.total > 0 || abierto) ? d : (S.arqueoDenoms || d);
  if (!denoms || !denoms.total) { showToast('Primero cuenta el efectivo en el arqueo'); return; }
  const info = await buildCierreData();
  const ok = await window.posPrintTicket(
    window.posBuildPaloteo(denoms, { negocio: info.negocio, session: S.session, esperado: info.esperado }), 'recibo');
  if (ok) showToast('Paloteo enviado a la impresora');
}

// Imprimir CIERRE DE CAJA (Z)
async function imprimirCierre(sesionCerrada) {
  if (typeof window.posBuildCierre !== 'function' || typeof window.posPrintTicket !== 'function') {
    showToast('Impresión no disponible en esta pantalla'); return;
  }
  const c = await buildCierreData();
  if (sesionCerrada) c.session = sesionCerrada;
  const d = getArqueoDenoms();
  c.denoms  = (d && d.total) ? d : (S.arqueoDenoms || null);
  c.contado = (S.arqueoContado != null) ? S.arqueoContado : (c.denoms ? c.denoms.total : null);
  if (c.contado != null) c.diff = c.contado - c.esperado;
  const ok = await window.posPrintTicket(window.posBuildCierre(c), 'recibo');
  if (ok) showToast('Cierre enviado a la impresora');
}
// Reimprimir el cierre de un turno YA CERRADO (desde el historial de cierres).
// Recalcula ventas/métodos/movimientos de ese turno con su propia ventana de tiempo.
async function reimprimirCierre(sessionId) {
  try {
    const { data: ses } = await sb.from('pos_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (!ses) { showToast('No se encontró ese cierre'); return; }
    const until = ses.closed_at || new Date().toISOString();
    const orders = await loadOrders(S.branchId, ses.opened_at, until);
    //  Hasta que se cerro ESE turno, no hasta hoy.
    const pagos  = await loadPagosPorMetodo(S.branchId, ses.opened_at, orders, until);
    const { data: mvs } = await sb.from('pos_cash_moves').select('*').eq('session_id', ses.id);
    const moves    = mvs || [];
    const ingresos = moves.filter(m => m.type === 'ingreso').reduce((s, m) => s + (m.amount || 0), 0);
    const egresos  = moves.filter(m => m.type === 'egreso').reduce((s, m) => s + (m.amount || 0), 0);
    const metodos  = {};
    Object.keys(pagos || {}).forEach(k => {
      const key = k.toLowerCase();
      metodos[key] = (metodos[key] || 0) + (pagos[k] || 0);
    });
    const ventasEf = metodos['efectivo'] || 0;
    const base     = ses.opening_cash || 0;
    const activos  = (orders || []).filter(o => o.status !== 'cancelled');
    const c = {
      negocio:  await cjNombreNegocio(),
      session:  ses,
      base:     base,
      ventas:   activos.reduce((s, o) => s + (parseFloat(o.total_final ?? o.total) || 0), 0),
      nPedidos: activos.length,
      metodos, ingresos, egresos,
      esperado: base + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo(orders),
      denoms:   ses.arqueo_denoms || null,
      contado:  ses.arqueo_contado != null ? parseFloat(ses.arqueo_contado) : (ses.closing_cash || null),
    };
    if (c.contado != null) c.diff = c.contado - c.esperado;
    const ok = await window.posPrintTicket(window.posBuildCierre(c), 'recibo');
    if (ok) showToast('Cierre reenviado a la impresora');
  } catch (e) { console.error('reimprimirCierre:', e); showToast('Error al reimprimir el cierre'); }
}

window.imprimirPaloteo  = imprimirPaloteo;
window.imprimirCierre   = imprimirCierre;
// Reimprimir un cierre: permiso pedidos.reabrir; sin permiso pide PIN.
window.reimprimirCierre = function (sessionId) {
  //  El mensaje hablaba de "reabrir una cuenta", que aqui no pasa: lo unico
  //  que hace este boton es volver a sacar el papel de un cierre pasado.
  if (window.posGuard) window.posGuard('pedidos.reabrir', function(){ reimprimirCierre(sessionId); }, 'Volver a imprimir un cierre de caja requiere permiso de administrador.');
  else reimprimirCierre(sessionId);
};

function getArqueoDenoms() {
  const lineas = [];
  let billetes = 0, monedas = 0;
  cjBloquesArqueo().forEach((grp, gi) => {
    const grupo = cjGrupoDe(grp, gi);
    grp.querySelectorAll('.denom-input').forEach(inp => {
      const qty   = parseInt(inp.value || '0', 10) || 0;
      const denom = parseInt(inp.dataset.val, 10) || 0;
      if (!qty) return;
      const total = qty * denom;
      lineas.push({ denom: denom, qty: qty, total: total, grupo: grupo });
      if (grupo === 'billete') billetes += total; else monedas += total;
    });
  });
  // Grandes = billetes de $50.000 y $100.000 (los que se consignan/guardan).
  // Sencillo = el resto de billetes (queda como base del día siguiente).
  const grandes  = lineas.filter(l => l.grupo === 'billete' && l.denom >= 50000).reduce((s, l) => s + l.total, 0);
  const sencillo = billetes - grandes;
  return { lineas: lineas, billetes: billetes, monedas: monedas, grandes: grandes, sencillo: sencillo, total: billetes + monedas };
}

async function updateArqueoEsperado() {
  const moves    = await getMoves();
  // Efectivo REAL (pos_payments — incluye la parte en efectivo de pagos mixtos)
  const ventasEf = (S.pagosMetodo && S.pagosMetodo['efectivo']) || 0;
  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((s,m)=>s+(m.amount||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((s,m)=>s+(m.amount||0),0);
  const base     = S.session ? (S.session.opening_cash||0) : 0;
  const esperado = base + ventasEf + ingresos - egresos - cjDomiCanjeEfectivo();
  const contado  = getArqueoContado();
  const diff     = contado - esperado;
  _cjEsperadoActual = esperado;
  document.getElementById('arqueo-esperado').textContent = COPF(esperado);
  try { cjPintarPendientes(); } catch(e) {}
  const diffEl  = document.getElementById('arqueo-diff');
  const diffLbl = document.getElementById('arqueo-diff-lbl');
  const diffCard= document.getElementById('arqueo-diff-card');
  if (diffEl) {
    diffEl.textContent = (diff>=0?'+':'') + COPF(diff);
    diffEl.style.color = diff===0?'#0F172A':diff>0?'#16A34A':'#DC2626';
  }
  if (diffLbl) diffLbl.textContent = diff>0?'Sobrante':diff<0?'Faltante':'Diferencia';
  if (diffCard) {
    diffCard.className = 'cj-arqueo-card' + (diff===0?'':diff>0?' sobra':' falta');
  }
}

// ── Acciones Supabase ──────────────────────────────────────────
async function handleOpenSession(openingCash, shiftType, detalle) {
  /* EL UNICO CANDADO DE TODA LA PUESTA EN MARCHA (24-ago-2026).

     Decision de Sergio: no se tapa ninguna pantalla; se frena SOLO la apertura
     de caja. "Si no puede abrir caja tampoco va a poder vender". Y taparle
     pantallas seria peor: las que necesita para resolverlo son justo las que
     se le taparian.

     Va AQUI DENTRO y no en el boton que llama: por esta funcion pasa toda
     apertura de turno, y colgarlo del boton seria el error de forma de
     siempre — manana alguien abre turno desde otro sitio y el candado se
     queda atras.

     Si `posArranque` no esta cargado (una pantalla suelta, un fallo de red)
     se deja pasar: frenarle la caja a alguien por eso es mucho peor que dejar
     abrir la caja de un restaurante a medio configurar. */
  if (window.posArranque) {
    try {
      if (!(await posArranque.exigirParaCaja())) return false;
    } catch (e) { console.warn('[arranque] no se pudo revisar:', e); }
  }
  try {
    const payload = {
      status: 'open', opening_cash: openingCash, shift_type: shiftType,
      apertura_detalle: detalle || null,
      opened_at:    new Date().toISOString(),
      cashier_name: S.user?.user_metadata?.nombre || S.user?.email || 'Cajero',
    };
    if (S.branchId) payload.branch_id = S.branchId;
    if (S.tenantId) payload.tenant_id = S.tenantId;
    const { error } = await sb.from('pos_sessions').insert(payload);
    //  Abrir o cerrar caja cambia lo que el guardian tiene guardado.
    try { localStorage.removeItem('pos.caja.abierta.v1'); } catch (e) {}
    if (error) { showToast('Error: ' + error.message); return false; }
    showToast('Caja abierta correctamente');
    await refreshAll();
    return true;
  } catch(e) { console.error(e); showToast('Error al abrir caja'); return false; }
}

/* Deja TODAS las mesas de la sede en libre, sin estado ni cronómetro.

   El filtro por sede no es opcional: sin él esto le limpiaría el salón a
   todos los restaurantes del sistema, incluidos los que están abiertos
   atendiendo en ese momento. */
async function liberarMesasAlCerrar(branchId) {
  if (!branchId) { console.warn('liberar mesas: sin sede, no se toca nada'); return; }
  const r = await sb.from('pos_tables').update({
    status: 'libre',
    current_order_id: null,
    //  Los cronómetros también: si quedan, mañana la mesa aparece libre
    //  pero contando horas desde anoche.
    comiendo_at: null,
    esperando_at: null,
    pendiente_pago_at: null,
    sesion_at: null,
    /*  Se tocan TODAS, no solo las que se ven ocupadas. Hay mesas que
        figuran libres pero conservan el cronómetro de días atrás: El Parche
        tenía siete así, una desde el 2 de agosto. Mientras están libres no
        molestan, pero es basura esperando a reaparecer. */
  }).eq('branch_id', branchId).select('id');

  if (r.error) { console.warn('liberar mesas:', r.error.message); return; }
  const n = (r.data || []).length;
  if (n) console.log('[caja] mesas liberadas al cerrar:', n);
}

async function handleCloseSession(closingCash, totalSales, arqueoDiff, arqueoContado) {
  try {
    // Cerrar la sesion activa con datos de cierre (incluye arqueo si se hizo)
    const upd = {
      status: 'closed', closing_cash: closingCash,
      total_sales: totalSales||0, closed_at: new Date().toISOString(),
    };
    if (arqueoDiff !== null && arqueoDiff !== undefined) upd.arqueo_diff = arqueoDiff;
    if (arqueoContado !== null && arqueoContado !== undefined) upd.arqueo_contado = arqueoContado;
    const { error } = await sb.from('pos_sessions').update(upd).eq('id', S.session.id);
    //  Abrir o cerrar caja cambia lo que el guardian tiene guardado.
    try { localStorage.removeItem('pos.caja.abierta.v1'); } catch (e) {}
    if (error) { showToast('Error: ' + error.message); return; }

    // Cerrar tambien cualquier otra sesion abierta del mismo branch (sesiones huerfanas)
    const qOrfanas = sb.from('pos_sessions').update({
      status: 'closed', closed_at: new Date().toISOString(),
    }).eq('status', 'open').neq('id', S.session.id);
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qOrfanas.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    await qOrfanas;

    // Al cerrar caja, el día terminó: se limpian las etiquetas de estado de los
    // chats (En preparación / Listo / En camino / Entregado) para que mañana el
    // tablero arranque limpio y los clientes que vuelvan a escribir aparezcan
    // como consulta nueva. Los pedidos quedan intactos en Ventas/Informes.
    try { await limpiarEtiquetasEstadoChat(S.branchId); } catch(e) { console.warn('limpiar etiquetas estado:', e); }

    /* Y las mesas quedan libres, sin ningún estado colgando.

       Pasó de verdad: una mesa amaneció en "Comiendo" con el cronómetro en
       18 horas, con la caja cerrada y el restaurante vacío. Su pedido ya
       estaba pagado desde la noche anterior — lo que no se limpió fue la mesa.

       El agujero está en el cobro adelantado: al cobrar, la mesa pasa a
       "esperando" (todavía no le han servido), después a "comiendo"... y ahí
       ya nada la libera sola. Alguien tiene que acordarse de hacerlo a mano,
       y a las once de la noche cerrando caja nadie se acuerda.

       Cerrar la caja es el momento exacto para esto: el día terminó, no queda
       nadie sentado. Igual que con las etiquetas del chat, mañana el salón
       arranca limpio. */
    try { await liberarMesasAlCerrar(S.branchId); } catch(e) { console.warn('liberar mesas:', e); }

    // Imprimir el cierre ANTES de refrescar (refreshAll limpia S.session/arqueo)
    try {
      const cerrada = Object.assign({}, S.session, upd);
      await imprimirCierre(cerrada);
    } catch(e) { console.warn('imprimir cierre:', e); }

    /* Avisarle por WhatsApp al gerente qué hay que comprar. Va del lado del
       servidor porque hace falta el token de Meta y ese no puede llegar al
       navegador. Si falla, el cierre NO se interrumpe: ya está guardado. */
    /*  ⚠️ EL SILENCIO ERA EL PROBLEMA (5-sep-2026).

        Sergio: «llevo 2 dias que no se envia». Y no habia forma de saberlo:
        si el aviso NO salia, esta pantalla no decia absolutamente nada. Solo
        hablaba cuando todo iba bien.

        Esa noche se comprobo que el envio funcionaba —token vigente, numero
        conectado, plantilla aprobada, y Meta acepto los dos mensajes al
        llamar la funcion a mano—. Asi que lo que faltaba no era arreglar el
        envio: era que el cierre CONTARA lo que paso.

        «No habia nada por comprar» y «WhatsApp lo rechazo» se veian igual:
        callados. Es el mismo error de siempre — confundir "no hay" con "no
        pude preguntar". Mientras se vean igual, la proxima vez tampoco se va
        a poder averiguar.                                                  */
    try {
      const rAv = await fetch('https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/aviso-insumos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: S.branchId }),
      });
      const dAv = await rAv.json().catch(function(){ return {}; });
      if (dAv && dAv.enviado) {
        showToast('Aviso de compras enviado al gerente');
      } else {
        const PORQUE = {
          nada_bajo:    'no hay nada por comprar',
          apagado:      'está apagado en Configuración',
          sin_gerentes: 'no hay números de gerente configurados',
          sin_whatsapp: 'esta sede no tiene WhatsApp conectado',
          no_se_pudo_leer_inventario: 'no se pudo leer el inventario',
        };
        /*  Si Meta lo rechazo, la funcion trae el motivo numero por numero.
            Se enseNa TAL CUAL: el texto de Meta es feo, pero es lo unico que
            permite arreglarlo. Traducirlo a "hubo un problema" es volver al
            silencio con otras palabras.                                   */
        const falla = ((dAv && dAv.resultados) || []).filter(function(x){ return !x.ok; })[0];
        showToast('Aviso de compras: ' + (falla
          ? ('WhatsApp lo rechazó — ' + (falla.error || 'sin motivo'))
          : (PORQUE[dAv && dAv.razon] || ('no salió (' + ((dAv && dAv.razon) || 'sin motivo') + ')'))));
        console.warn('[aviso-insumos] no se envió:', dAv);
      }
    } catch(e) {
      console.warn('aviso insumos:', e);
      showToast('Aviso de compras: no se pudo hablar con el servidor');
    }

    showToast('Caja cerrada correctamente');
    await refreshAll();
  } catch(e) { console.error(e); showToast('Error al cerrar caja'); }
}

// Quita las etiquetas de estado de pedido (En preparación/Listo/En camino/
// Entregado, para llevar y domicilio) de TODAS las conversaciones del branch.
// Se llama al cerrar caja para reiniciar el tablero del chat cada día.
async function limpiarEtiquetasEstadoChat(branchId) {
  if (!branchId) return;
  const { data: cfgRow } = await sb.from('ia_config').select('estados_config').eq('branch_id', branchId).maybeSingle();
  const cfg = (cfgRow && cfgRow.estados_config) || {};
  const stateIds = new Set();
  ['llevar', 'domicilio'].forEach(function(t){
    ['en_preparacion', 'listo', 'en_camino', 'entregado'].forEach(function(k){
      var et = cfg[t] && cfg[t][k] && cfg[t][k].etiqueta;
      if (et) stateIds.add(et);
    });
  });
  if (!stateIds.size) return;
  const { data: convs } = await sb.from('chat_conversations').select('id,labels').eq('branch_id', branchId);
  for (const c of (convs || [])) {
    if (!Array.isArray(c.labels) || !c.labels.length) continue;
    const next = c.labels.filter(function(l){ return !stateIds.has(l); });
    if (next.length !== c.labels.length) {
      await sb.from('chat_conversations').update({ labels: next }).eq('id', c.id);
    }
  }
}

async function handleAddMovimiento(type, amount, concept, medio) {
  try {
    await addMove(type, amount, concept, medio);
    const current = await getMoves();
    renderHero(S.orders, current);
    renderCanalVentas(S.orders, current);
    renderMovimientos(current);
    renderMovimientosSummary(current);
    showToast((type==='ingreso'?'Ingreso':'Egreso') + ' registrado: ' + COPF(amount));
  } catch(e) { console.error(e); showToast('Error al registrar movimiento'); }
}

async function deleteMov(id) {
  try {
    await deleteMove(id);
    const current = await getMoves();
    renderHero(S.orders, current);
    renderCanalVentas(S.orders, current);
    renderMovimientos(current);
    renderMovimientosSummary(current);
    showToast('Movimiento eliminado');
  } catch(e) { console.error(e); showToast('Error al eliminar movimiento'); }
}
window.deleteMov = deleteMov;

async function anularVenta(orderId) {
  /* Si se pagó con saldo, la ventana lo avisa y el saldo vuelve al cliente.
     Se devuelve DESPUÉS de anular: si el guardado falla, no le regalamos nada
     por un pedido que sigue vivo. */
  const permiso = window.posSaldo
    ? await posSaldo.pedirAnular(orderId, '¿Anular esta venta?')
    : (confirm('¿Anular esta venta?') ? { devolver: async function(){} } : null);
  if (!permiso) return;
  const { error } = await sb.from('pos_orders').update({ status:'cancelled' }).eq('id', orderId);
  if (error) { showToast('Error al anular: ' + error.message); return; }
  const vuelto = await permiso.devolver();
  showToast(vuelto ? 'Venta anulada · saldo devuelto al cliente' : 'Venta anulada');
  await refreshAll();
}
// Anular una venta/pago registrado: permiso pagos.anular; sin permiso pide PIN.
window.anularVenta = function (orderId) {
  if (window.posGuard) window.posGuard('pagos.anular', function(){ anularVenta(orderId); }, 'Anular un pago requiere permiso de administrador.');
  else anularVenta(orderId);
};

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('cj-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cj-toast';
    t.className = 'cj-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.style.opacity='0'; }, 3000);
}

// ── Render inicial (estructura visible sin esperar core:ready) ──
// Corre inmediatamente al cargar el script. Cuando core:ready dispare,
// refreshAll() reemplazará con datos reales.
renderDesglosePago([]);
renderCanalVentas([], []);
renderTopVentas([]);
renderMovimientos([]);
renderMovimientosSummary([]);
renderCierres([]);
renderHistorial([]);



// ══════════════════════════════════════════════════════════════════════════
// RESUMEN DEL CIERRE — vista detallada al hacer clic en un cierre
// ══════════════════════════════════════════════════════════════════════════

let _rSession = null;
let _rPid     = 'turno';

function rsvg(name, sz) {
  sz = sz||16;
  const p = `width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch(name) {
    case 'cash':     return `<svg ${p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>`;
    case 'card':     return `<svg ${p}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
    case 'transfer': return `<svg ${p}><path d="M4 9h16l-3-3"/><path d="M20 15H4l3 3"/></svg>`;
    case 'phone':    return `<svg ${p}><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>`;
    case 'bag':      return `<svg ${p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
    case 'register': return `<svg ${p}><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/><line x1="7" y1="14" x2="9" y2="14"/><line x1="12" y1="14" x2="17" y2="14"/></svg>`;
    case 'swap':     return `<svg ${p}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    case 'scale':    return `<svg ${p}><path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6Z"/><path d="m19 7-3 6h6Z"/><path d="M8 21h8"/></svg>`;
    case 'star':     return `<svg ${p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    case 'alert':    return `<svg ${p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'user':     return `<svg ${p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    case 'open':     return `<svg ${p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    case 'closebox': return `<svg ${p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M9 14l6 0"/></svg>`;
    case 'moon':     return `<svg ${p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    case 'bike':     return `<svg ${p}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17 10 7h3l3 10"/><path d="M13 7h3l1 3"/></svg>`;
    case 'clock':    return `<svg ${p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'history':  return `<svg ${p}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>`;
    case 'arrowup':  return `<svg ${p}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
    case 'arrowdown':return `<svg ${p}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
    case 'info':     return `<svg ${p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    case 'checkc':   return `<svg ${p}><circle cx="12" cy="12" r="10"/><polyline points="16 9 11 14 8.5 11.5"/></svg>`;
    default: return '';
  }
}

/*  ⚠️ AQUI HABIA DOS LISTAS ESCRITAS A MANO — efectivo/tarjeta/transferencia/
    nequi/daviplata, y salon/mostrador/domicilio— y por eso este resumen
    mostraba metodos que el negocio no tiene, todos en $0, mientras la plata de
    verdad no aparecia por ningun lado (2-sep-2026).

    Cada restaurante configura sus propios metodos, y el cobro guarda el ID del
    metodo (`pm_x719c1pqb`), no su nombre. Lo que no estuviera en la lista se
    descartaba en silencio: en El Parche, 296 cobros y $13,7 millones.

    La fuente de verdad son los metodos CONFIGURADOS y `loadPagosPorMetodo`,
    que ya traduce el id y ya cubre los cobros viejos. Nada fijo.           */
const RS_COLOR = { efectivo:'#16A34A', tarjeta:'#5B6BFF', transferencia:'#0EA5E9',
  banco:'#0EA5E9', saldo:'#8B5CF6', billetera:'#8B5CF6', puntos:'#F0A83C', otro:'#94A3B8' };
const RS_TINT  = { efectivo:'#DCFCE7', tarjeta:'#EEF2FF', transferencia:'#F0F9FF',
  banco:'#F0F9FF', saldo:'#F5F3FF', billetera:'#F5F3FF', puntos:'#FEF3C7', otro:'#F1F5F9' };
const RS_ICON  = { efectivo:'cash', tarjeta:'card', transferencia:'transfer',
  banco:'transfer', saldo:'phone', billetera:'phone', puntos:'star', otro:'cash' };

/*  Las filas del desglose: una por metodo configurado, mas "Otros" con lo que
    no se reconozca. Un peso que no se sabe de donde vino tiene que verse.

    Los PUNTOS no llevan plata nunca —la parte en dinero de un canje viaja en
    su metodo real—, asi que su $0 no informa nada y no se pinta.           */
/*  Cuanto entro en efectivo, sea cual sea el nombre que le haya puesto el
    restaurante a ese metodo. Se busca por TIPO, que es lo que no cambia.  */
function rsEfectivo(byMethod) {
  const ef = (S.payMethods || []).filter(m => String(m.tipo || '').toLowerCase() === 'efectivo');
  if (ef.length) return ef.reduce((a, m) => a + (byMethod[m.key] || 0), 0);
  return byMethod.efectivo || 0;
}

function rsFilasMetodo(byMethod) {
  const usados = {};
  const filas = (S.payMethods || [])
    .filter(m => String(m.tipo || '').toLowerCase() !== 'puntos')
    .map(m => {
      usados[m.key] = true;
      const t = String(m.tipo || 'otro').toLowerCase();
      return { name: m.nombre, amt: byMethod[m.key] || 0,
               color: RS_COLOR[t] || RS_COLOR.otro, icon: RS_ICON[t] || RS_ICON.otro };
    });
  (S.payMethods || []).forEach(m => { usados[m.key] = true; });   // puntos tampoco es "Otros"
  let otros = 0;
  Object.keys(byMethod || {}).forEach(k => { if (!usados[k]) otros += byMethod[k] || 0; });
  if (otros > 0) filas.push({ name:'Otros', amt:otros, color:RS_COLOR.otro, icon:RS_ICON.otro });
  return filas;
}

/*  Los cuatro canales del sistema. `rapido` es la venta de mostrador de este
    POS y faltaba: sus 103 pedidos no entraban en ninguna barra.            */
const RS_CHANNELS = {
  salon:     {name:'Salón',        color:'#5B6BFF', tint:'#EEF2FF'},
  rapido:    {name:'Venta rápida', color:'#F59E0B', tint:'#FEF3C7'},
  mostrador: {name:'Mostrador',    color:'#06B6D4', tint:'#CFFAFE'},
  domicilio: {name:'Domicilio',    color:'#10B981', tint:'#D1FAE5'},
};

async function openResumen(sessionId) {
  const session = S.sessions.find(s => s.id === sessionId);
  if (!session) { showToast('Sesión no encontrada'); return; }
  _rSession = session;
  _rPid = 'turno';
  document.querySelectorAll('.cj-nav-item[data-screen]').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  document.getElementById('screen-resumen').classList.add('on');
  document.getElementById('crumb').textContent = 'Resumen del cierre';
  document.querySelectorAll('#resumen-periodos button').forEach(b => b.classList.toggle('on', b.dataset.pid === 'turno'));
  await renderResumen();
}
window.openResumen = openResumen;

/*  El boton "Imprimir" del resumen. Antes era `window.print()`: el dialogo
    del navegador con la pagina web entera en hojas carta. Ahora saca el MISMO
    tiquete que se imprime al cerrar la caja, por la termica y sin preguntar.

    Siempre el del turno que se abrio, aunque en pantalla se este mirando la
    semana o el mes: un cierre de caja de una semana no existe. El boton lo
    dice, para que nadie se lleve una sorpresa al recoger el papel.        */
function imprimirCierreDelResumen() {
  if (!_rSession) { showToast('Abre un cierre primero'); return; }
  window.reimprimirCierre(_rSession.id);
}
window.imprimirCierreDelResumen = imprimirCierreDelResumen;

function backToCierres() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  document.getElementById('screen-cierres').classList.add('on');
  document.querySelectorAll('.cj-nav-item[data-screen]').forEach(b => {
    b.classList.toggle('on', b.dataset.screen === 'cierres');
  });
  document.getElementById('crumb').textContent = CRUMB_LABELS.cierres;
}
window.backToCierres = backToCierres;

async function onResumenPid(btn, pid) {
  document.querySelectorAll('#resumen-periodos button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  _rPid = pid;
  await renderResumen();
}
window.onResumenPid = onResumenPid;

async function loadResumenData(pid) {
  const s = _rSession;
  let startISO, endISO, scope, cuadreKind;

  if (pid === 'turno') {
    startISO = s.opened_at;
    endISO   = s.closed_at || new Date().toISOString();
    const d  = new Date(s.opened_at);
    const f  = d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const h  = d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    scope = `Turno ${s.shift_type||'—'} · ${f} ${h}`;
    cuadreKind = 'session';
  } else if (pid === 'dia') {
    const d = new Date(s.opened_at); d.setHours(0,0,0,0);
    startISO = d.toISOString(); d.setHours(23,59,59,999); endISO = d.toISOString();
    scope = new Date(startISO).toLocaleDateString('es-CO',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    cuadreKind = 'acum';
  } else if (pid === 'semana') {
    const d = new Date(s.opened_at);
    const day = d.getDay(); const diff = d.getDate() - day + (day===0?-6:1);
    d.setDate(diff); d.setHours(0,0,0,0); startISO = d.toISOString();
    const end = new Date(d); end.setDate(end.getDate()+6); end.setHours(23,59,59,999); endISO = end.toISOString();
    scope = 'Semana en curso · 7 días';
    cuadreKind = 'acum';
  } else {
    const d = new Date(s.opened_at); d.setDate(1); d.setHours(0,0,0,0); startISO = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999); endISO = end.toISOString();
    scope = `Mes en curso · ${new Date(startISO).toLocaleDateString('es-CO',{month:'long',year:'numeric'})}`;
    cuadreKind = 'acum';
  }

  let orders = [], items = [], moves = [], periodSessions = [];

  try {
    const qOrd = sb.from('pos_orders').select('*').gte('created_at', startISO).lte('created_at', endISO);
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qOrd.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data: od } = await qOrd;
    orders = od || [];
  } catch(e) { console.warn('rsOrders:', e); }

  try {
    const qIt = sb.from('pos_order_items').select('*').gte('created_at', startISO).lte('created_at', endISO);
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qIt.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data: it } = await qIt;
    items = it || [];
  } catch(e) { console.warn('rsItems:', e); }

  try {
    if (pid === 'turno') {
      const { data: mv } = await sb.from('pos_cash_moves').select('*').eq('session_id', s.id);
      moves = mv || [];
    } else {
      const qMv = sb.from('pos_cash_moves').select('*').gte('created_at', startISO).lte('created_at', endISO);
      /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qMv.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
      const { data: mv } = await qMv;
      moves = mv || [];
    }
  } catch(e) { console.warn('rsMoves:', e); }

  try {
    const qSess = sb.from('pos_sessions').select('*').eq('status','closed')
      .gte('closed_at', startISO).lte('closed_at', endISO);
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qSess.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data: sd } = await qSess;
    periodSessions = sd || [];
  } catch(e) { console.warn('rsSessions:', e); }

  const active = orders.filter(o => o.status !== 'cancelled');
  const totalV = active.reduce((a,o) => a+(parseFloat(o.total_final ?? o.total)||0), 0);
  const txns   = active.length;
  const ticket = txns ? Math.round(totalV/txns) : 0;

  /*  La MISMA suma que el cierre del dia y el ticket: `loadPagosPorMetodo`
      reparte los pagos mixtos, traduce el id del metodo a su nombre y cubre
      con `payment_method` los pedidos viejos que no dejaron desglose.

      Antes esto tenia su propia consulta y su propia suma, y descartaba todo
      metodo que no estuviera en una lista fija — que era casi todo.        */
  const payStart = pid === 'turno' ? s.opened_at : startISO;
  const payEnd   = pid === 'turno' ? (s.closed_at || new Date().toISOString()) : endISO;
  const byMethod = await loadPagosPorMetodo(S.branchId, payStart, active, payEnd);

  const byChannel = {salon:0,rapido:0,mostrador:0,domicilio:0};
  active.forEach(o => {
    const k = (o.channel||'salon').toLowerCase();
    /*  La MISMA cifra que el total de ventas: `total_final`. Con `total` a
        secas, las barras sumaban mas que el total de arriba —en el turno del
        1-sep, $535.500 contra $516.500— y no habia forma de que cuadraran. */
    if (byChannel[k] !== undefined) byChannel[k] += (parseFloat(o.total_final ?? o.total)||0);
  });

  const ingresos = moves.filter(m=>m.type==='ingreso').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);
  const egresos  = moves.filter(m=>m.type==='egreso').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);

  let cuadre;
  if (cuadreKind === 'session') {
    const base     = parseFloat(s.opening_cash)||0;
    /*  La clave del efectivo es el NOMBRE que le puso el restaurante, no la
        palabra "efectivo": puede llamarse "Caja" o "Contado".              */
    const efV      = rsEfectivo(byMethod);
    const efIn     = moves.filter(m=>m.type==='ingreso'&&(m.medio||'').toLowerCase()==='efectivo').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);
    const efOut    = moves.filter(m=>m.type==='egreso' &&(m.medio||'').toLowerCase()==='efectivo').reduce((a,m)=>a+(parseFloat(m.amount)||0),0);
    const contado  = parseFloat(s.arqueo_contado ?? s.closing_cash)||0;
    const diff     = parseFloat(s.arqueo_diff)||0;
    // Esperado consistente con lo GUARDADO (arqueo_diff ya incluye el canje de
    // domicilios externos); derivarlo de contado−diff evita recalcularlo distinto.
    const esperado = contado - diff;
    cuadre = { kind:'session', base, esperado, contado, diff };
  } else {
    const cierres   = periodSessions.length;
    const cuadrados = periodSessions.filter(x => !x.arqueo_diff || x.arqueo_diff===0).length;
    const neto      = periodSessions.reduce((a,x)=>a+(parseFloat(x.arqueo_diff)||0),0);
    cuadre = { kind:'acum', cierres, cuadrados, neto };
  }

  const pMap = {};
  items.forEach(it => {
    const k = it.product_name || 'Sin nombre';
    if (!pMap[k]) pMap[k] = {name:k, cat:it.product_category||'', qty:0, total:0};
    pMap[k].qty   += (it.quantity||1);
    pMap[k].total += (it.product_price||0)*(it.quantity||1);
  });
  const top = Object.values(pMap).sort((a,b)=>b.total-a.total).slice(0,5);

  const mMap = {};
  active.forEach(o => {
    const k = o.waiter_name || 'Sin nombre';
    if (!mMap[k]) mMap[k] = {name:k, ini:k.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(), count:0, total:0};
    mMap[k].count++;
    mMap[k].total += (o.total||0);
  });
  const meseros = Object.values(mMap).sort((a,b)=>b.total-a.total);

  const hourMap = {salon:{},rapido:{},mostrador:{},domicilio:{}};
  active.forEach(o => {
    const ch = (o.channel||'salon').toLowerCase();
    if (hourMap[ch]) {
      const h = new Date(o.created_at).getHours();
      hourMap[ch][h] = (hourMap[ch][h]||0)+1;
    }
  });
  const horaPunta = Object.entries(hourMap).map(([ch, hM]) => {
    const best = Object.entries(hM).sort((a,b)=>b[1]-a[1])[0];
    const fr   = best ? `${String(best[0]).padStart(2,'0')}:00 – ${String(parseInt(best[0])+1).padStart(2,'0')}:00` : '—';
    return {ch, franja:fr};
  });

  let comp = {prev:0, prevLabel:'Turno anterior', this:totalV};
  try {
    const qPrev = sb.from('pos_sessions').select('total_sales,closed_at').eq('status','closed')
      .lt('closed_at', s.opened_at).order('closed_at',{ascending:false}).limit(1);
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qPrev.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data: pd } = await qPrev;
    if (pd && pd[0]) comp.prev = parseFloat(pd[0].total_sales)||0;
  } catch(e) {}

  let spark = [];
  try {
    const qSp = sb.from('pos_sessions').select('total_sales').eq('status','closed')
      .lte('closed_at', endISO).order('closed_at',{ascending:false}).limit(6);
    /* Sin sede, este filtro no casa con nada: cero filas en vez de las
       ventas de todas las marcas juntas. */
    qSp.eq('branch_id', S.branchId || '00000000-0000-0000-0000-000000000000');
    const { data: spd } = await qSp;
    if (spd) spark = spd.reverse().map(x=>parseFloat(x.total_sales)||0);
  } catch(e) {}
  if (!spark.length) spark = [totalV];

  return {scope, byMethod, byChannel, totalVentas:totalV, txns, ticket, ingresos, egresos,
          cuadre, top, meseros, horaPunta, comp, spark,
          sessionUser: s.cashier_name||'—',
          openedAt: s.opened_at, closedAt: s.closed_at, shiftType: s.shift_type||'—'};
}

function rsSectionHead(icon, tone, kicker, title, desc) {
  return `<div style="display:flex;align-items:center;gap:12px;margin:26px 0 14px">
    <div style="width:38px;height:38px;border-radius:11px;background:${tone}22;color:${tone};display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg(icon,19)}</div>
    <div><div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.09em;font-weight:700">${kicker}</div>
    <div style="font-size:16px;font-weight:800;color:#0F172A;letter-spacing:-.02em;margin-top:1px">${title}</div></div>
    ${desc?`<div style="margin-left:auto;font-size:11.5px;color:#94A3B8;max-width:280px;text-align:right;line-height:1.4">${desc}</div>`:''}
  </div>`;
}

function rsBarRow(label, value, pct, color, sub, iconName) {
  return `<div style="display:flex;align-items:center;gap:12px">
    ${iconName?`<div style="width:30px;height:30px;border-radius:8px;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg(iconName,15)}</div>`:''}
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;gap:10px">
        <span style="font-size:12.5px;font-weight:600;color:#475569">${label}${sub?` <span style="color:#CBD5E1;font-weight:500">· ${sub}</span>`:''}</span>
        <span style="font-size:13px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(value)}</span>
      </div>
      <div style="height:6px;background:#F1F5F9;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(2,pct).toFixed(1)}%;background:${color};border-radius:999px"></div></div>
    </div>
  </div>`;
}

function rsRowKV(label, value, strong) {
  return `<div style="display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:12.5px;color:${strong?'#0F172A':'#64748B'};font-weight:${strong?700:500}">${label}</span>
    <span style="font-size:13.5px;font-weight:${strong?800:700};color:#0F172A;font-variant-numeric:tabular-nums">${value}</span>
  </div>`;
}

async function renderResumen() {
  const body = document.getElementById('resumen-body');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#94A3B8;font-size:13px">Cargando resumen…</div>';
  let R;
  const _btnTxt = document.getElementById('rs-imprimir-txt');
  if (_btnTxt) _btnTxt.textContent = (_rPid === 'turno') ? 'Imprimir cierre' : 'Imprimir cierre del turno';
  try { R = await loadResumenData(_rPid); }
  catch(e) {
    body.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626">Error al cargar datos: ${e.message}</div>`;
    return;
  }

  document.getElementById('resumen-scope-text').textContent = R.scope;

  const maxMethod = Math.max(1, ...Object.values(R.byMethod));
  const totalChan = Math.max(1, Object.values(R.byChannel).reduce((a,b)=>a+b,0));
  /*  Solo los canales por los que este negocio vende. Listarlos todos dejaba
      dos barras en $0 que parecian un error del sistema.                   */
  const canalesConVenta = Object.entries(RS_CHANNELS).filter(([k]) => (R.byChannel[k]||0) > 0);
  const maxSpark  = Math.max(...R.spark, 1);
  const growthPct = R.comp.prev ? ((R.comp.this - R.comp.prev) / R.comp.prev * 100) : 0;
  const growthUp  = growthPct >= 0;

  const fmtDT = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' · ' +
           d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  };

  // cuadre
  let cuadreHTML = '';
  if (R.cuadre.kind === 'session') {
    const d = R.cuadre.diff, ok = d===0, over = d>0;
    const bg = ok?'#F0FDF4':over?'#F0F9FF':'#FEF2F2';
    const bd = ok?'#BBF7D0':over?'#BAE6FD':'#FECACA';
    const cl = ok?'#166534':over?'#0369A1':'#991B1B';
    cuadreHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:15px;flex:1">
      ${rsRowKV('Base de apertura', COPF(R.cuadre.base), false)}
      ${rsRowKV('Efectivo esperado', COPF(R.cuadre.esperado), true)}
      ${rsRowKV('Efectivo contado (real)', COPF(R.cuadre.contado), false)}
      <div style="height:1px;background:#ECEEF2;margin:2px 0"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${bg};border:1px solid ${bd};border-radius:12px">
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:${cl}">${rsvg(ok?'checkc':'alert',16)} ${ok?'Caja cuadrada':over?'Sobrante':'Faltante'}</span>
        <span style="font-size:18px;font-weight:800;color:${cl};font-variant-numeric:tabular-nums">${d===0?COPF(0):(over?'+':'−')+COPF(Math.abs(d)).slice(1)}</span>
      </div>
    </div>`;
  } else {
    const d = R.cuadre.neto, ok = d===0, over = d>0;
    const bg = ok?'#F0FDF4':over?'#F0F9FF':'#FEF2F2';
    const bd = ok?'#BBF7D0':over?'#BAE6FD':'#FECACA';
    const cl = ok?'#166534':over?'#0369A1':'#991B1B';
    cuadreHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:15px;flex:1">
      <div style="display:flex;gap:10px">
        <div style="flex:1;text-align:center;padding:14px 8px;background:#FAFAFB;border:1px solid #F1F5F9;border-radius:11px">
          <div style="font-size:24px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${R.cuadre.cierres}</div>
          <div style="font-size:11px;color:#94A3B8;font-weight:600;margin-top:2px">Cierres</div>
        </div>
        <div style="flex:1;text-align:center;padding:14px 8px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:11px">
          <div style="font-size:24px;font-weight:800;color:#166534;font-variant-numeric:tabular-nums">${R.cuadre.cuadrados}</div>
          <div style="font-size:11px;color:#16A34A;font-weight:600;margin-top:2px">Cuadrados</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${bg};border:1px solid ${bd};border-radius:12px">
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:${cl}">${rsvg(ok?'checkc':'alert',16)} Diferencia neta</span>
        <span style="font-size:18px;font-weight:800;color:${cl};font-variant-numeric:tabular-nums">${d===0?COPF(0):(over?'+':'−')+COPF(Math.abs(d)).slice(1)}</span>
      </div>
    </div>`;
  }

  const topHTML = R.top.length ? R.top.map((t,i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i<R.top.length-1?'border-bottom:1px solid #F5F6F8':''}">
      <div style="width:26px;height:26px;border-radius:7px;background:${i===0?'#FEF3C7':'#F1F5F9'};color:${i===0?'#B45309':'#94A3B8'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div>
        <div style="font-size:11px;color:#94A3B8">${t.cat||'Producto'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(t.total)}</div>
        <div style="font-size:11px;color:#94A3B8;font-variant-numeric:tabular-nums">${t.qty} und</div>
      </div>
    </div>`).join('') : '<div style="padding:20px 0;text-align:center;color:#94A3B8;font-size:12px">Sin datos de productos</div>';

  const meserosHTML = R.meseros.length ? R.meseros.map((m,i) => `
    <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;align-items:center;padding:12px 20px;${i<R.meseros.length-1?'border-bottom:1px solid #F5F6F8':''}">
      <span style="display:inline-flex;align-items:center;gap:10px;min-width:0">
        <span style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#5B6BFF,#8B5CF6);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${m.ini}</span>
        <span style="font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</span>
      </span>
      <span style="text-align:center;font-size:13px;font-weight:700;color:#475569;font-variant-numeric:tabular-nums">${m.count}</span>
      <span style="text-align:right">
        <div style="font-size:13px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(m.total)}</div>
        <div style="font-size:11px;color:#94A3B8;font-variant-numeric:tabular-nums">~${COPF(Math.round(m.total/Math.max(1,m.count)))} / venta</div>
      </span>
    </div>`).join('') : '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:12px">Sin datos de personal</div>';

  const horaPuntaHTML = R.horaPunta.filter(h=>h.franja!=='—').map(h => {
    const c = RS_CHANNELS[h.ch]||{name:h.ch,color:'#94A3B8',tint:'#F1F5F9'};
    return `<div style="display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid #ECEEF2;border-radius:12px">
      <div style="width:38px;height:38px;border-radius:10px;background:${c.tint};color:${c.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('clock',18)}</div>
      <div><div style="font-size:11px;color:#94A3B8;font-weight:600">${c.name}</div><div style="font-size:15px;font-weight:800;color:#0F172A">${h.franja}</div></div>
    </div>`;
  }).join('') || '<div style="color:#94A3B8;font-size:12px;padding:12px 0">Sin datos de hora punta</div>';

  const sparkBars = R.spark.map((v,i) => {
    const last = i === R.spark.length-1;
    const h = Math.max(4, Math.round((v/maxSpark)*100));
    const lbl = v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'k' : String(Math.round(v));
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end">
      <span style="font-size:10px;font-weight:700;color:${last?'#5B6BFF':'#94A3B8'};font-variant-numeric:tabular-nums">${lbl}</span>
      <div style="width:100%;max-width:46px;height:${h}%;background:${last?'linear-gradient(180deg,#5B6BFF,#8B5CF6)':'#E2E8F0'};border-radius:7px 7px 3px 3px"></div>
    </div>`;
  }).join('');

  const sparkLabels = R.spark.map((_,i)=>{
    const offset = R.spark.length-1-i;
    const last   = i===R.spark.length-1;
    return `<span style="${last?'color:#5B6BFF':''}">${last?'Actual':'-'+offset}</span>`;
  }).join('');

  body.innerHTML = `
    ${rsSectionHead('cash','#5B6BFF','Lo más importante','Financiero','Cuánto entró, cómo pagaron y si la caja cuadró.')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px">
      <div class="cj-card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#5B6BFF;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${rsvg('bag',13)} Ventas totales</div>
        <div style="font-size:30px;font-weight:800;color:#0F172A;margin-top:6px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${COPF(R.totalVentas)}</div>
        <div style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;margin-top:6px;color:${growthUp?'#16A34A':'#DC2626'}">${rsvg(growthUp?'arrowup':'arrowdown',12)} ${growthUp?'+':'−'}${Math.abs(growthPct).toFixed(1)}% vs ${R.comp.prevLabel.toLowerCase()}</div>
      </div>
      <div class="cj-card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#0EA5E9;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${rsvg('register',13)} Ticket promedio</div>
        <div style="font-size:30px;font-weight:800;color:#0F172A;margin-top:6px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${COPF(R.ticket)}</div>
        <div style="font-size:11.5px;color:#94A3B8;font-weight:500;margin-top:6px">por venta</div>
      </div>
      <div class="cj-card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#16A34A;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${rsvg('swap',13)} Transacciones</div>
        <div style="font-size:30px;font-weight:800;color:#0F172A;margin-top:6px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${R.txns}</div>
        <div style="font-size:11.5px;color:#94A3B8;font-weight:500;margin-top:6px">ventas realizadas</div>
      </div>
      <div class="cj-card" style="padding:16px 18px;display:flex;flex-direction:column;justify-content:center;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:34px;height:34px;border-radius:9px;background:#DCFCE7;color:#16A34A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('arrowup',16)}</div>
          <div><div style="font-size:15px;font-weight:800;color:#166534;font-variant-numeric:tabular-nums">${COPF(R.ingresos)}</div><div style="font-size:11px;color:#94A3B8;font-weight:600">Ingresos de caja</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:34px;height:34px;border-radius:9px;background:#FEE2E2;color:#DC2626;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('arrowdown',16)}</div>
          <div><div style="font-size:15px;font-weight:800;color:#991B1B;font-variant-numeric:tabular-nums">${COPF(R.egresos)}</div><div style="font-size:11px;color:#94A3B8;font-weight:600">Egresos (gastos)</div></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('cash',15)} Desglose por método de pago</div>
        <div style="display:flex;flex-direction:column;gap:13px;margin-top:15px">
          ${rsFilasMetodo(R.byMethod).map(m => rsBarRow(m.name, m.amt, (m.amt/maxMethod)*100, m.color, R.totalVentas?Math.round((m.amt/R.totalVentas)*100)+'%':'0%', m.icon)).join('') || '<div style="color:#94A3B8;font-size:12px">No se cobró nada en este periodo.</div>'}
        </div>
      </div>
      <div class="cj-card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div class="cj-card-title">${rsvg('scale',15)} Cuadre de efectivo</div>
        ${cuadreHTML}
      </div>
    </div>

    ${rsSectionHead('bag','#8B5CF6','Qué se vendió','Productos','Los más pedidos del periodo.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('star',15)} Más vendidos</div>
        <div style="display:flex;flex-direction:column;gap:2px;margin-top:12px">${topHTML}</div>
      </div>
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('register',15)} Ventas por producto</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:15px">
          ${R.top.length ? R.top.map(t => rsBarRow(t.name, t.total, (t.total/Math.max(1,...R.top.map(x=>x.total)))*100, '#8B5CF6', t.qty+' und', null)).join('') : '<div style="color:#94A3B8;font-size:12px;padding:12px 0">Sin datos</div>'}
        </div>
      </div>
    </div>

    ${rsSectionHead('user','#0EA5E9','Quién atendió','Personal','Ventas y ticket promedio por mesero.')}
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#0F172A;padding:15px 20px;border-bottom:1px solid #ECEEF2">${rsvg('user',15)} Ventas por mesero</div>
        <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;padding:9px 20px;background:#FAFAFB;border-bottom:1px solid #F1F5F9;font-size:10.5px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.04em">
          <span>Mesero</span><span style="text-align:center">Txns</span><span style="text-align:right">Total · Prom.</span>
        </div>
        ${meserosHTML}
      </div>
      <div class="cj-card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div class="cj-card-title">${rsvg('register',15)} Turno de caja</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:15px">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #ECEEF2;border-radius:12px">
            <div style="width:36px;height:36px;border-radius:10px;background:#DCFCE7;color:#16A34A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('open',17)}</div>
            <div><div style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Abrió</div>
            <div style="font-size:13px;font-weight:700;color:#0F172A">${R.sessionUser}</div>
            <div style="font-size:11.5px;color:#94A3B8">${fmtDT(R.openedAt)}</div></div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #ECEEF2;border-radius:12px">
            <div style="width:36px;height:36px;border-radius:10px;background:#EEF2FF;color:#5B6BFF;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rsvg('closebox',17)}</div>
            <div><div style="font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Cerró</div>
            <div style="font-size:13px;font-weight:700;color:#0F172A">${R.sessionUser}</div>
            <div style="font-size:11.5px;color:#94A3B8">${fmtDT(R.closedAt)}</div></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:auto;padding:9px 12px;font-size:11.5px;color:#7C3AED;background:#F5F3FF;border:1px solid #E9D5FF;border-radius:10px">
          ${rsvg('moon',13)} Turno ${R.shiftType}
        </div>
      </div>
    </div>

    ${rsSectionHead('bike','#10B981','Por dónde vendiste','Canales','Por cuál canal entró cada venta.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px">
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('bag',15)} De dónde salió cada venta</div>
        <div style="display:flex;height:12px;border-radius:999px;overflow:hidden;margin-top:16px;gap:2px;background:#F1F5F9">
          ${canalesConVenta.map(([k,c])=>`<div style="width:${Math.max(0,((R.byChannel[k]||0)/totalChan)*100).toFixed(1)}%;background:${c.color}"></div>`).join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:11px;margin-top:16px">
          ${canalesConVenta.map(([k,c])=>{
            const v=R.byChannel[k]||0; const pct=totalChan>0?Math.round((v/totalChan)*100):0;
            return `<div style="display:flex;align-items:center;justify-content:space-between">
              <span style="display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:#0F172A">
                <span style="width:10px;height:10px;border-radius:3px;background:${c.color}"></span>${c.name}<span style="font-size:11.5px;color:#94A3B8;font-weight:600">${pct}%</span>
              </span>
              <span style="font-size:13.5px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${COPF(v)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('clock',15)} Hora punta por canal</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:15px">${horaPuntaHTML}</div>
      </div>
    </div>

    ${rsSectionHead('history','#E11D48','Cómo vamos','Comparativos','Contra el periodo anterior y la tendencia de ventas.')}
    <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:14px;margin-bottom:30px">
      <div class="cj-card" style="padding:18px 20px;display:flex;flex-direction:column">
        <div class="cj-card-title">${rsvg('swap',15)} Este turno vs anterior</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:16px">
          <div style="font-size:30px;font-weight:800;color:#0F172A;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${COPF(R.comp.this)}</div>
          <div style="display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:800;color:${growthUp?'#16A34A':'#DC2626'};background:${growthUp?'#DCFCE7':'#FEE2E2'};padding:3px 9px;border-radius:999px">${rsvg(growthUp?'arrowup':'arrowdown',13)} ${growthUp?'+':'−'}${Math.abs(growthPct).toFixed(1)}%</div>
        </div>
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:11px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px"><span style="color:#0F172A;font-weight:700">Este turno</span><span style="font-weight:800;font-variant-numeric:tabular-nums">${COPF(R.comp.this)}</span></div>
            <div style="height:8px;background:#F1F5F9;border-radius:999px;overflow:hidden"><div style="height:100%;width:100%;background:#5B6BFF;border-radius:999px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px"><span style="color:#64748B;font-weight:600">${R.comp.prevLabel}</span><span style="font-weight:700;color:#64748B;font-variant-numeric:tabular-nums">${COPF(R.comp.prev)}</span></div>
            <div style="height:8px;background:#F1F5F9;border-radius:999px;overflow:hidden"><div style="height:100%;width:${R.comp.this?Math.min(100,(R.comp.prev/R.comp.this)*100).toFixed(1):0}%;background:#CBD5E1;border-radius:999px"></div></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:auto;padding-top:16px;font-size:11.5px;color:#64748B">${rsvg('info',13)} Diferencia de ${COPF(Math.abs(R.comp.this-R.comp.prev))} frente al periodo anterior.</div>
      </div>
      <div class="cj-card" style="padding:18px 20px">
        <div class="cj-card-title">${rsvg('arrowup',15)} Crecimiento en ventas</div>
        <p style="font-size:11.5px;color:#94A3B8;margin:5px 0 0">Últimos ${R.spark.length} periodos.</p>
        <div style="display:flex;align-items:flex-end;gap:12px;height:160px;margin-top:18px;padding:0 4px">${sparkBars}</div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding:0 4px;font-size:10.5px;color:#CBD5E1;font-weight:600">${sparkLabels}</div>
      </div>
    </div>
  `;
}

// ── Cierres de caja: una tarjeta por turno, clicable para ver el resumen ──
function renderCierres(sessions) {
  const cont = document.getElementById('cierres-grid');
  if (!cont) return;
  let html = '';

  if (S.session) {
    const dAp = new Date(S.session.opened_at);
    const fAp = dAp.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hAp = dAp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const cajero = S.session.cashier_name || (S.user?.user_metadata?.nombre) || '—';
    const initials = cajero.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    html += `<div class="cj-card cj-cierre">
      <div class="cj-cierre-head">
        <div class="cj-cierre-user"><div class="cj-cierre-av">${initials}</div><div>
          <div class="cj-cierre-name">${cajero}</div>
          <div class="cj-cierre-caja"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/></svg> Caja 01 · Turno ${S.session.shift_type||'—'}</div>
        </div></div>
        <span class="cj-tag live"><span style="width:6px;height:6px;border-radius:999px;background:#16A34A"></span> En curso</span>
      </div>
      <div class="cj-cierre-rows">
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#16A34A"></span> Apertura <span class="when">${fAp} · ${hAp}</span></span><span class="cj-amt-open">${COPF(S.session.opening_cash||0)}</span></div>
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#CBD5E1"></span> Cierre <span class="when">—</span></span><span class="cj-amt-na">—</span></div>
      </div>
    </div>`;
  }

  if (!sessions.length && !S.session) {
    cont.innerHTML = '<div class="cj-empty"><div class="cj-empty-inner"><div class="cj-empty-ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg></div><div style="font-size:14px;font-weight:700;color:#0F172A">Sin cierres aún</div><div style="font-size:12px;color:#94A3B8;margin-top:4px">Cuando cierres la caja aparecerá aquí.</div></div></div>';
    return;
  }

  html += sessions.map(s => {
    const dAp = new Date(s.opened_at), dCi = new Date(s.closed_at);
    const fAp = dAp.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hAp = dAp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const fCi = dCi.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hCi = dCi.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    const cajero   = s.cashier_name||'—';
    const initials = cajero.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const diff = s.arqueo_diff||0;
    let tagHtml = '<span class="cj-tag ok">Cuadrado</span>';
    if (diff>0) tagHtml = `<span class="cj-tag sobra">Sobrante ${COPF(diff)}</span>`;
    if (diff<0) tagHtml = `<span class="cj-tag falta">Faltante ${COPF(Math.abs(diff))}</span>`;
    return `<div class="cj-card cj-cierre cj-cierre-click" onclick="openResumen('${s.id}')">
      <div class="cj-cierre-head">
        <div class="cj-cierre-user"><div class="cj-cierre-av">${initials}</div><div>
          <div class="cj-cierre-name">${cajero}</div>
          <div class="cj-cierre-caja"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2-5h14l2 5"/></svg> Caja 01 · Turno ${s.shift_type||'—'}</div>
        </div></div>
        <div style="display:flex;align-items:center;gap:8px">${tagHtml}<div class="cj-cierre-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div></div>
      </div>
      <div class="cj-cierre-rows">
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#16A34A"></span> Apertura <span class="when">${fAp} · ${hAp}</span></span><span class="cj-amt-open">${COPF(s.opening_cash||0)}</span></div>
        <div class="cj-cierre-line"><span class="lbl"><span class="cj-dot" style="background:#5B6BFF"></span> Cierre <span class="when">${fCi} · ${hCi}</span></span><span class="cj-amt-close">${COPF(s.closing_cash||0)}</span></div>
      </div>
      <div class="cj-cierre-hint">Ver resumen completo →</div>
    </div>`;
  }).join('');

  cont.innerHTML = html;
}

// ══════════════ CRÉDITOS EN CAJA ══════════════
// Aquí se ve quién debe y se registran los abonos. Va en Caja y no en
// Configuración porque **el abono es plata que entra al turno abierto**: si se
// registrara en otro lado, el arqueo no cuadraría.
// Asignar cupos NO se hace aquí: eso es del administrador, en Configuración.
var _cjCred = [];

async function abrirCreditosCaja() {
  var st = (window._pos && window._pos.state) || {};
  if (!window.posCreditos) { alert('El módulo de créditos no está disponible.'); return; }
  posCreditos.setCtx(st.tenantId, S.branchId || st.branchId);

  var ov = document.createElement('div');
  ov.id = 'cj-cred-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:20px 22px;width:560px;max-width:96vw;font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35);max-height:88vh;display:flex;flex-direction:column">'
    + '<div style="display:flex;align-items:flex-start;gap:12px">'
    +   '<div style="flex:1"><div style="font-size:16px;font-weight:800;color:#0F172A">Créditos</div>'
    +   '<div style="font-size:12.5px;color:#64748B;margin-top:4px;line-height:1.5">Quién debe y cuánto. Los abonos entran a la caja de este turno.</div></div>'
    +   '<button id="cj-cred-x" style="background:none;border:none;font-size:20px;color:#94A3B8;cursor:pointer;line-height:1">×</button>'
    + '</div>'
    + '<div id="cj-cred-kpis" style="display:flex;gap:8px;margin:14px 0"></div>'
    + '<input id="cj-cred-q" class="iv-input" placeholder="Buscar…" style="width:100%;margin-bottom:10px">'
    + '<div id="cj-cred-list" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px">'
    +   '<div style="padding:24px;text-align:center;color:#94A3B8;font-size:12.5px">Cargando…</div></div>'
    + '<div style="font-size:11.5px;color:#94A3B8;margin-top:12px;line-height:1.5">Para cambiar el cupo de alguien: <b>Configuración → Créditos</b>.</div>'
    + '</div>';
  ov.querySelector('#cj-cred-x').onclick = function () { ov.remove(); };
  ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);

  try { _cjCred = await posCreditos.listar(); }
  catch (e) {
    document.getElementById('cj-cred-list').innerHTML =
      '<div style="padding:24px;text-align:center;color:#DC2626;font-size:12.5px">No se pudo cargar: ' + posCreditos.esc(e.message || e) + '</div>';
    return;
  }
  document.getElementById('cj-cred-q').oninput = function () { cjCredRender(this.value.toLowerCase().trim()); };
  cjCredRender('');
}

function cjCredRender(q) {
  var conDeuda = _cjCred.filter(function (c) { return Number(c.saldo) > 0; });
  var total = conDeuda.reduce(function (a, c) { return a + Number(c.saldo); }, 0);
  var kpis = document.getElementById('cj-cred-kpis');
  if (kpis) {
    kpis.innerHTML =
        '<div class="cj-cred-kpi"><b>' + posCreditos.money(total) + '</b><span>te deben en total</span></div>'
      + '<div class="cj-cred-kpi"><b>' + conDeuda.length + '</b><span>' + (conDeuda.length === 1 ? 'persona debe' : 'personas deben') + '</span></div>';
  }

  // Primero los que deben: es lo que se viene a mirar.
  var lista = _cjCred.slice().sort(function (a, b) { return Number(b.saldo) - Number(a.saldo); });
  if (q) lista = lista.filter(function (c) { return (c.nombre || '').toLowerCase().indexOf(q) >= 0; });

  var host = document.getElementById('cj-cred-list'); if (!host) return;
  if (!lista.length) {
    host.innerHTML = '<div style="padding:24px;text-align:center;color:#94A3B8;font-size:12.5px">'
      + (q ? 'Nadie coincide' : 'Nadie tiene crédito todavía') + '</div>';
    return;
  }
  host.innerHTML = lista.map(function (c) {
    var saldo = Number(c.saldo) || 0;
    return '<div class="cj-cred-row">'
      + '<div style="flex:1;min-width:0"><div class="cj-cred-nom">' + posCreditos.esc(c.nombre) + '</div>'
      +   '<div class="cj-cred-sub">' + (c.tipo === 'empleado' ? 'Empleado' : 'Cliente')
      +   ' · cupo ' + posCreditos.money(c.cupo) + '</div></div>'
      + '<div class="cj-cred-saldo ' + (saldo > 0 ? 'debe' : 'ok') + '">' + posCreditos.money(saldo)
      +   '<span>' + (saldo > 0 ? 'debe' : 'al día') + '</span></div>'
      + (saldo > 0 ? '<button class="cj-btn-primary sm" onclick="cjAbonar(\'' + c.id + '\')">Abonar</button>' : '')
      + '</div>';
  }).join('');
}

function cjAbonar(id) {
  var c = _cjCred.filter(function (x) { return x.id === id; })[0]; if (!c) return;
  var saldo = Number(c.saldo) || 0;
  var ov = document.createElement('div');
  ov.id = 'cj-abono-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:20px 22px;width:380px;max-width:94vw;font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">'
    + '<div style="font-size:15px;font-weight:800;color:#0F172A">Abono · ' + posCreditos.esc(c.nombre) + '</div>'
    + '<div style="font-size:12.5px;color:#64748B;margin:5px 0 14px">Debe <b>' + posCreditos.money(saldo) + '</b>. El abono entra a la caja de este turno.</div>'
    + '<div class="iv-field-label">¿Cuánto abona?</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:8px">'
    +   '<button type="button" class="iv-chip on" id="cj-ab-todo" onclick="cjAbonoTodo(' + saldo + ')">Todo (' + posCreditos.money(saldo) + ')</button>'
    +   '<button type="button" class="iv-chip" onclick="cjAbonoOtro()">Otro</button>'
    + '</div>'
    + '<input id="cj-ab-monto" class="iv-input" type="number" min="0" step="any" style="width:100%" value="' + saldo + '" oninput="cjAbonoPrev(' + saldo + ')">'
    + '<div id="cj-ab-prev" style="font-size:12px;color:#64748B;margin-top:6px;min-height:17px"></div>'
    + '<div class="iv-field-label" style="margin-top:10px">¿Con qué pagó?</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px" id="cj-ab-metodos">'
    +   '<button type="button" class="iv-chip on" data-m="efectivo" onclick="cjAbonoMetodo(this)">Efectivo</button>'
    +   '<button type="button" class="iv-chip" data-m="transferencia" onclick="cjAbonoMetodo(this)">Transferencia</button>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:16px">'
    +   '<button style="flex:1;padding:11px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer" onclick="document.getElementById(\'cj-abono-ov\').remove()">Cancelar</button>'
    +   '<button style="flex:1;padding:11px;border-radius:10px;border:none;background:#16A34A;color:#fff;font-weight:700;font-size:13px;cursor:pointer" onclick="cjAbonoGuardar(\'' + id + '\')">Registrar abono</button>'
    + '</div></div>';
  ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  ov._metodo = 'efectivo';
  cjAbonoPrev(saldo);
}
function cjAbonoTodo(saldo) {
  var i = document.getElementById('cj-ab-monto'); if (i) { i.value = saldo; cjAbonoPrev(saldo); }
  document.getElementById('cj-ab-todo').classList.add('on');
}
function cjAbonoOtro() {
  document.getElementById('cj-ab-todo').classList.remove('on');
  var i = document.getElementById('cj-ab-monto'); if (i) { i.value = ''; i.focus(); }
}
function cjAbonoMetodo(b) {
  document.querySelectorAll('#cj-ab-metodos .iv-chip').forEach(function (x) { x.classList.remove('on'); });
  b.classList.add('on');
  var ov = document.getElementById('cj-abono-ov'); if (ov) ov._metodo = b.dataset.m;
}
function cjAbonoPrev(saldo) {
  var prev = document.getElementById('cj-ab-prev'); if (!prev) return;
  var v = parseFloat((document.getElementById('cj-ab-monto') || {}).value) || 0;
  if (v <= 0) { prev.textContent = ''; return; }
  if (v > saldo) {
    // No se deja saldo a favor: lo que sobra se le devuelve.
    prev.innerHTML = 'Solo se aplican ' + posCreditos.money(saldo) + '. Los ' + posCreditos.money(v - saldo)
      + ' restantes hay que <b>devolvérselos</b>.';
  } else {
    prev.textContent = 'Le quedaría debiendo ' + posCreditos.money(saldo - v);
  }
}
async function cjAbonoGuardar(id) {
  var ov = document.getElementById('cj-abono-ov'); if (!ov) return;
  var monto = parseFloat((document.getElementById('cj-ab-monto') || {}).value) || 0;
  if (monto <= 0) { alert('Escribe un monto'); return; }
  var st = (window._pos && window._pos.state) || {};
  var quien = (st.user && (st.user.user_metadata && st.user.user_metadata.nombre || st.user.email)) || null;
  try {
    var r = await posCreditos.abonar(id, monto, ov._metodo || 'efectivo',
      (S.session && S.session.id) || null, quien, null);
    ov.remove();
    _cjCred = await posCreditos.listar();
    cjCredRender((document.getElementById('cj-cred-q') || {}).value || '');
    var msg = 'Abono registrado';
    if (Number(r.sobrante) > 0) msg += ' · devuélvele ' + posCreditos.money(r.sobrante);
    if (typeof toast === 'function') toast(msg); else alert(msg);
    if (typeof loadAll === 'function') loadAll();   // refrescar el turno
  } catch (e) { alert('No se pudo registrar: ' + (e.message || e)); }
}
