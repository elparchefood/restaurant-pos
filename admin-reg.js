// ── Cobra POS · Consola de Plataforma · admin-reg.js ──
// Depende de: pos-core.js (sb, COPF, COP)
// Estructura: setView → render* → load* → approveRegistration

/* Provisión SEGURA: la aprobación la ejecuta la Edge Function "provision"
   en el servidor (verifica que quien llama sea admin autorizado).
   Aquí NUNCA debe haber claves secretas. */
var PROVISION_URL = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/provision';

// ── Estado global ──
var S = {
  registrations: [], tenants: [], solFilter: 'pendiente', cliFilter: 'todos',
  solSearch: '', cliSearch: '', currentUser: null,
  planes: [],        // catálogo real, leído de pos_planes
  cambioPlan: null   // el cambio de plan que se está armando en el modal
};

// ── Pricing (fiel al diseño) ──
var PLANS_DATA = [
  {
    id: 'starter', name: 'Starter', price: 149000, popular: false,
    tagline: 'Lo esencial para operar tu restaurante desde el primer día.',
    features: [
      'Toma de pedidos (tablet + escritorio)', 'Caja registradora', 'Gestión de mesas',
      'KDS / impresora de cocina', 'Configuración de menú',
      'Modos de servicio: mesa, para llevar y domicilio',
      'Permisos por rol + PIN para acciones sensibles', 'Informes básicos'
    ]
  },
  {
    id: 'pro', name: 'Pro', price: 249000, popular: true,
    tagline: 'Todo Starter, más IA conversacional y analítica completa.',
    inheritsLabel: 'Todo lo del plan Starter, y además:',
    features: [
      'Chat IA con bandeja unificada (WhatsApp, Facebook, Instagram)',
      'Auto-creación de pedidos desde el chat',
      'Todos los informes: ventas, concurrencia, productos, canal y satisfacción',
      '2.000 mensajes de IA incluidos al mes'
    ]
  }
];

/*  EL ESCALON GRANDE ARRANCA EN 8, NO EN 10 (Sergio, 24-ago, aplicado el 28).

    Con el corte en 10 habia un cruce: una cadena de NUEVE locales pagaba
    $1.072.800 y una de DIEZ pagaba $1.043.000 — casi $30.000 menos por tener
    un local mas. Le convenia declarar una sucursal que no tiene, y a nadie le
    gusta descubrir que el precio castiga por no crecer.

    Pasa porque el descuento salta de golpe: el 30% sobre 10 pesa mas que el
    20% sobre 9. De las tres salidas que se plantearon, Sergio eligio bajar el
    escalon a 8: es la unica que arregla el cruce SIN mover ningun precio ya
    publicado. Con 8 el salto queda plano ($834.400 con 7 y con 8) y a partir
    de ahi siempre sube.                                                    */
var TIERS = [
  {min: 8, off: 0.30, label: '8+ sucursales'},
  {min: 4,  off: 0.20, label: '4–7 sucursales'},
  {min: 2,  off: 0.10, label: '2–3 sucursales'},
  {min: 1,  off: 0,    label: '1 sucursal'}
];

var ROLE_TONE = {'Dueño': 'indigo', 'Admin': 'violet', 'Soporte': 'sky', 'Finanzas': 'green'};

var AV_COLORS = [
  ['#5B6BFF','#8B5CF6'],['#0EA5E9','#6366F1'],['#10B981','#14B8A6'],
  ['#F59E0B','#EF4444'],['#EC4899','#8B5CF6'],['#8B5CF6','#5B6BFF']
];

/* El catálogo de planes REAL vive en la tabla `pos_planes`: nombre, precio y la
   lista de funciones que incluye. PLANS_DATA (arriba) es solo el texto de venta
   de la pantalla de Planes. Antes el precio estaba escrito a mano en el código,
   así que cambiar un precio obligaba a volver a desplegar la consola — y no
   existía Premium por ninguna parte aunque en la base sí. */
var PLAN_TONE = {starter: 'violet', pro: 'indigo', premium: 'amber'};

/* Qué es cada función, dicha como la diría un dueño de restaurante. Se usa para
   mostrarle a Sergio qué gana o qué pierde el cliente ANTES de confirmar. */
var FUNCION_ETIQUETA = {
  inventario:         'Control de inventario',
  chat_ia:            'Chat con IA en WhatsApp',
  comprobantes_ia:    'Lectura de comprobantes de pago',
  avisos_estado:      'Avisos automáticos al cliente',
  puntos:             'Puntos y fidelización',
  multimarca:         'Varias marcas y sucursales',
  informes_avanzados: 'Todos los informes',
  dian:               'Facturación electrónica (DIAN)',
  admin_whatsapp:     'Administrar el negocio por WhatsApp',
  nfc:                'Tarjetas y llaveros NFC',
  consolidado:        'Consolidado de todas las sucursales',
  kardex:             'Kardex de inventario',
  marketing:          'Campañas de marketing'
};

function planDe(planId) {
  return (S.planes || []).find(function(p) { return p.plan === planId; }) || null;
}
function planNombre(planId) {
  var p = planDe(planId);
  return (p && p.nombre) || (planId ? planId[0].toUpperCase()+planId.slice(1) : '—');
}
/* Devuelve null —no 0— cuando el plan todavía no tiene precio decidido. Un 0
   pasaría por "gratis" en toda la pantalla, incluido el total que factura la
   plataforma. Premium está así hoy. */
function planPrecio(planId) {
  var p = planDe(planId);
  if (p && p.precio != null) return Number(p.precio);
  var v = PLANS_DATA.find(function(x) { return x.id === planId; });
  return v ? v.price : null;
}
function planFunciones(planId) {
  var p = planDe(planId);
  return (p && p.funciones) || [];
}

function tierFor(n) {
  return TIERS.find(function(t) { return n >= t.min; }) || TIERS[TIERS.length-1];
}
function planTotal(planId, branches) {
  var precio = planPrecio(planId);
  if (precio == null) return null;
  return precio * (1 - tierFor(branches).off) * branches;
}
function cop(n) { return '$' + Math.round(n||0).toLocaleString('es-CO'); }
/* Para plata que puede no estar definida todavía. `cop(null)` diría "$0", que
   en una columna de facturación se lee como "no paga nada". */
function copPlan(n) { return n == null ? 'Por definir' : cop(n); }
function initials(name) {
  return (name||'??').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();
}
function avatarHtml(name, size, seed) {
  var c = AV_COLORS[(seed||0) % AV_COLORS.length];
  var r = Math.round(size*0.3);
  return '<div style="width:'+size+'px;height:'+size+'px;border-radius:'+r+'px;background:linear-gradient(135deg,'+c[0]+','+c[1]+');color:#fff;font-size:'+Math.round(size*0.36)+'px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+initials(name)+'</div>';
}
function badgeHtml(tone, label, dot) {
  return '<span class="a-badge a-badge--'+tone+'">'+
    (dot ? '<span class="a-badge-dot"></span>' : '')+
    label+'</span>';
}
function statusBadge(estado) {
  /* Las claves son las que guarda la BASE, no las que uno esperaría en español.
     Antes el mapa usaba 'pendiente'/'aprobado' y la base guarda
     'pending'/'approved', así que ninguna coincidía y la pantalla mostraba la
     palabra cruda en inglés. */
  var map = {
    pending:   {tone:'amber', label:'Esperando aprobación', dot:true},
    approved:  {tone:'green', label:'Activo',               dot:true},
    rejected:  {tone:'red',   label:'Rechazado',            dot:true},
    suspended: {tone:'gray',  label:'Suspendido',           dot:true},
    active:    {tone:'green', label:'Activo',               dot:true},
    cancelled: {tone:'gray',  label:'Cancelado',            dot:true}
  };
  var m = map[estado] || {tone:'gray', label:estado || '—', dot:false};
  return badgeHtml(m.tone, m.label, m.dot);
}
function greetWord() {
  var h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
}

// ── PAGE META ──
var PAGE_META = {
  resumen:     {kicker:'Inicio',          crumb:'Resumen general'},
  solicitudes: {kicker:'Plataforma',      crumb:'Solicitudes de registro'},
  clientes:    {kicker:'Plataforma',      crumb:'Clientes activos'},
  equipo:      {kicker:'Administración',  crumb:'Gestión de equipo'},
  planes:      {kicker:'Administración',  crumb:'Configuración de planes'},
  tutoriales:  {kicker:'Administración',  crumb:'Tutoriales'},
  cobro:       {kicker:'Administración',  crumb:'Cuenta de cobro'}
};

// ── VIEW SWITCHING ──
var toastTimer = null;
function setView(id) {
  document.querySelectorAll('.a-view').forEach(function(v) { v.classList.remove('on'); });
  var el = document.getElementById('view-'+id);
  if (el) el.classList.add('on');
  document.querySelectorAll('.sh-nav').forEach(function(b) {
    b.classList.toggle('on', b.dataset.view === id);
  });
  var meta = PAGE_META[id] || {kicker:'Inicio',crumb:id};
  document.getElementById('crumb-kicker').textContent = meta.kicker;
  document.getElementById('crumb-title').textContent  = meta.crumb;
}

// ── TOAST ──
function showToast(msg, tone) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'a-toast a-toast--'+(tone||'green')+' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3500);
}

// ── MODAL ──
function openModal() { document.getElementById('modal-overlay').classList.add('show'); }
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }
function showConfirm(title, msg, onOk) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent = msg;
  var btn = document.getElementById('modal-ok');
  btn.onclick = function() { closeModal(); onOk(); };
  openModal();
}

// ── AUTH ──
async function checkAdmin() {
  try {
    var res = await sb.auth.getUser();
    if (!res.data.user) { window.location.href = 'login.html'; return; }

    /* Que haya sesion NO basta: esta es la consola del DUEÑO DE LA PLATAFORMA.
       Sin esto, cualquier restaurante con su cuenta abierta podia entrar y ver
       "Consola de Plataforma" — vacia, porque la base le bloquea los datos,
       pero enterandose de que existe una consola de administracion.

       El candado de verdad lo pone la base (las politicas exigen rol admin para
       leer solicitudes y clientes). Esto es para que ni siquiera vea la puerta. */
    /* Se pregunta por la funcion es_admin_plataforma() y NO leyendo la tabla:
       user_profiles no le da permiso de lectura a nadie (a proposito), asi que
       una consulta directa fallaba y dejaba a Sergio fuera de su propia consola.
       La funcion corre con permisos de su dueño y es la MISMA que usan las
       politicas de la base: una sola fuente de verdad. */
    var esAdmin = await sb.rpc('es_admin_plataforma');
    if (esAdmin.error || esAdmin.data !== true) {
      window.location.href = 'dashboard.html';
      return;
    }

    S.currentUser = res.data.user;
    var email = res.data.user.email || '';
    var meta  = res.data.user.user_metadata || {};
    var name  = meta.nombre || email.split('@')[0];
    var ini   = initials(name);
    document.getElementById('admin-name').textContent   = name;
    document.getElementById('admin-avatar').textContent = ini;
  } catch(e) {
    console.error('checkAdmin:', e);
  }
}
function signOut() {
  showConfirm('Cerrar sesión', '¿Seguro que quieres cerrar tu sesión de la consola?', async function() {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}

// ────────────────────── RESUMEN ──────────────────────

function renderResumen(regs) {
  var activos    = regs.filter(function(r) { return r.status === 'approved' && r.tenant_status !== 'suspended'; });
  var pendientes = regs.filter(function(r) { return r.status==='pendiente'||r.status==='pending'; });
  var starter    = activos.filter(function(r) { return (r.plan_actual||r.plan)==='starter'; });
  var dePago     = activos.filter(function(r) { return (r.plan_actual||r.plan)!=='starter'; });
  /* Se suma el plan que el cliente TIENE hoy (`plan_actual`, de tenants), no el
     que pidió al registrarse. Después de un cambio de plan son cosas distintas,
     y lo que se factura es lo que tiene. Un plan sin precio no suma en vez de
     ensuciar el total con NaN. */
  var mrr        = activos.reduce(function(s,r) {
    return s + (planTotal(r.plan_actual||r.plan, r.branches||r.sucursales||1) || 0);
  }, 0);
  var total      = activos.length;
  var proPct     = total ? Math.round((dePago.length/total)*100) : 0;

  // greeting + lead
  var name = (document.getElementById('admin-name').textContent||'Sergio').split(' ')[0];
  document.getElementById('pg-greeting').textContent = greetWord()+', '+name+'.';
  document.getElementById('pg-lead').innerHTML =
    'Tienes <b style="color:#5B6BFF">'+pendientes.length+' solicitud'+(pendientes.length===1?'':' es')+
    '</b> esperando aprobación y la plataforma factura '+cop(mrr)+' este mes.';

  // KPIs
  document.getElementById('kpi-activos').textContent      = activos.length;
  document.getElementById('kpi-pendientes').textContent   = pendientes.length;
  document.getElementById('kpi-mrr').textContent          = cop(mrr);
  document.getElementById('kpi-nuevos').textContent       = activos.length;
  document.getElementById('kpi-activos-delta').textContent= activos.length+' activos';
  document.getElementById('kpi-pend-delta').textContent   = pendientes.length ? 'Requiere acción' : 'Al día';
  document.getElementById('kpi-pend-delta').className     = 'a-stat-delta a-stat-delta--'+(pendientes.length ? 'amber' : 'green');
  document.getElementById('kpi-activos-sub').textContent  = regs.length+' cuentas en total';
  document.getElementById('kpi-nuevos-sub').textContent   = new Date().toLocaleString('es-CO',{month:'long',year:'numeric'});

  // Donut
  var C = 2*Math.PI*52;
  var proFrac = total ? dePago.length/total : 0;
  document.getElementById('donut-svg').innerHTML =
    '<circle cx="70" cy="70" r="52" fill="none" stroke="#8B5CF6" stroke-width="18"/>'+
    '<circle cx="70" cy="70" r="52" fill="none" stroke="#5B6BFF" stroke-width="18" stroke-linecap="round"'+
      ' stroke-dasharray="'+((C*proFrac).toFixed(2))+' '+C.toFixed(2)+'"/>';
  document.getElementById('donut-total').textContent = total;
  document.getElementById('plan-sub').textContent    = total+' cuentas activas distribuidas';

  /* Las líneas de planes salen del catálogo de la base, no de una lista escrita
     a mano con dos planes y sus precios repetidos. Antes Premium existía en la
     base y aquí no aparecía por ningún lado. */
  var COLOR_PLAN = {starter:'#8B5CF6', pro:'#5B6BFF', premium:'#F59E0B'};
  var lineas = (S.planes || []).slice().sort(function(a,b){ return (b.orden||0)-(a.orden||0); });

  document.getElementById('planlines').innerHTML = lineas.map(function(pl) {
    var count  = activos.filter(function(r){ return (r.plan_actual||r.plan) === pl.plan; }).length;
    var pct    = total ? (count/total*100) : 0;
    var color  = COLOR_PLAN[pl.plan] || '#94A3B8';
    var precio = planPrecio(pl.plan);
    return '<div class="rs-plan-line">'+
      '<div class="rs-plan-line-header">'+
        '<span class="rs-plan-line-name">'+
          '<span class="rs-plan-dot" style="background:'+color+'"></span>'+
          escapeHtml(pl.nombre||pl.plan)+'<span class="rs-plan-price">· '+
          (precio == null ? 'precio por definir' : cop(precio)+' / suc.')+'</span>'+
        '</span>'+
        '<span class="rs-plan-count">'+count+'</span>'+
      '</div>'+
      '<div class="rs-plan-bar-bg"><div class="rs-plan-bar" style="width:'+pct+'%;background:'+color+'"></div></div>'+
    '</div>';
  }).join('')+
  '<div class="rs-plan-mix"><span class="rs-plan-mix-label">Mix de pago</span><span class="rs-plan-mix-val">'+proPct+'%</span></div>';

  // MRR chart
  var mrrData   = [3.2, 3.9, 4.6, 5.4, 6.5, 7.4];
  var mrrLabels = ['Ene','Feb','Mar','Abr','May','Jun'];
  document.getElementById('mrr-chart').innerHTML = mrrData.map(function(v,i) {
    var isLast = i===mrrData.length-1;
    var pct = (v/8)*100;
    return '<div class="rs-mrr-col">'+
      '<div class="rs-mrr-val" style="color:'+(isLast?'#5B6BFF':'#94A3B8')+'">$'+v.toFixed(1)+'M</div>'+
      '<div class="rs-mrr-bar" style="height:'+pct+'%;'+(isLast?'background:linear-gradient(180deg,#5B6BFF,#818CF8);box-shadow:0 6px 16px -8px rgba(91,107,255,.5)':'background:#C7D2FE')+'"></div>'+
      '<div class="rs-mrr-lbl">'+mrrLabels[i]+'</div>'+
    '</div>';
  }).join('');

  // Activity feed
  var ACTIVITY = [
    {ic:'check',tone:'green', txt:'Aprobaste el registro de <b>Wok &amp; Roll</b> (Pro · 2 sucursales).',  when:'Hace 2 h'},
    {ic:'inbox',tone:'indigo',txt:'Nueva solicitud de <b>Antojos Paisa</b> esperando aprobación.',         when:'Hace 5 h'},
    {ic:'pause',tone:'amber', txt:'Suspendiste la cuenta de <b>Parrilla 67</b> por mora.',                 when:'Ayer'},
    {ic:'users',tone:'violet',txt:'<b>Daniela Mejía</b> fue invitada como Soporte.',                       when:'Ayer'},
    {ic:'store',tone:'sky',   txt:'<b>Crepes del Centro</b> activó su cuenta (Pro · 3 sucursales).',       when:'Hace 2 d'}
  ];
  if (pendientes.length > 0) {
    ACTIVITY.unshift({ic:'inbox',tone:'amber',
      txt:'<b>'+pendientes.length+' solicitud'+(pendientes.length>1?'es pendientes':' pendiente')+'</b> esperando aprobación.',
      when:'Ahora'});
  }
  document.getElementById('activity-feed').innerHTML = ACTIVITY.map(function(a) {
    var icons = {
      check:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      inbox:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
      pause:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
      users:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      store:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/></svg>'
    };
    return '<div class="rs-act-row">'+
      '<span class="rs-act-ic rs-act-ic--'+a.tone+'">'+( icons[a.ic]||'')+'</span>'+
      '<div><div class="rs-act-txt">'+a.txt+'</div><div class="rs-act-when">'+a.when+'</div></div>'+
    '</div>';
  }).join('');

  // Badge
  var badge = document.getElementById('pending-badge');
  if (pendientes.length > 0) { badge.textContent = pendientes.length; badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}

// ────────────────────── SOLICITUDES ──────────────────────

function updateSolCounts() {
  var r = S.registrations;
  document.getElementById('cnt-pendiente').textContent = r.filter(function(x){return x.status==='pendiente'||x.status==='pending';}).length;
  document.getElementById('cnt-aprobado').textContent  = r.filter(function(x){return x.status==='aprobado'||x.status==='approved';}).length;
  document.getElementById('cnt-rechazado').textContent = r.filter(function(x){return x.status==='rechazado'||x.status==='rejected';}).length;
  document.getElementById('cnt-todas').textContent     = r.length;
}

function setSolFilter(f) {
  S.solFilter = f;
  document.querySelectorAll('#sol-seg button').forEach(function(b,i) {
    b.classList.toggle('on', ['pendiente','aprobado','rechazado','todos'][i]===f);
  });
  renderSolicitudes();
}

function renderSolicitudes() {
  var search = (S.solSearch||'').toLowerCase();
  var rows = S.registrations.filter(function(r) {
    if (S.solFilter !== 'todos') {
      var st = r.status||'';
      var match = (S.solFilter==='pendiente'&&(st==='pendiente'||st==='pending'))||
                  (S.solFilter==='aprobado' &&(st==='aprobado' ||st==='approved'))||
                  (S.solFilter==='rechazado'&&(st==='rechazado'||st==='rejected'));
      if (!match) return false;
    }
    if (search) {
      var hay = ((r.negocio||r.nombre||'')+' '+(r.email||'')).toLowerCase();
      if (hay.indexOf(search)<0) return false;
    }
    return true;
  });

  if (!rows.length) {
    document.getElementById('sol-tbody').innerHTML = '<tr><td colspan="8" class="a-empty">No hay solicitudes en este estado.</td></tr>';
    return;
  }

  document.getElementById('sol-tbody').innerHTML = rows.map(function(r, i) {
    var nombre   = r.negocio || r.nombre || 'Sin nombre';
    var branches = r.sucursales || r.branches || 1;
    var off      = tierFor(branches).off;
    var total    = copPlan(planTotal(r.plan||'starter', branches));
    var fechaRaw = r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    // Aquí sí es el plan que PIDIÓ: la solicitud todavía no tiene cuenta creada.
    var planBadge= badgeHtml(PLAN_TONE[r.plan] || 'violet', planNombre(r.plan||'starter'), false);
    var isPend   = r.status==='pendiente'||r.status==='pending';

    return '<tr>'+
      '<td><div class="a-cell-row">'+avatarHtml(nombre,36,i)+
        '<div class="a-cell-info"><div class="a-cell-strong">'+nombre+'</div><div class="a-cell-muted">'+r.email+'</div></div></div></td>'+
      '<td>'+planBadge+'</td>'+
      '<td class="a-num">'+branches+(off>0?'<span style="color:#16A34A;font-size:11.5px;font-weight:700;margin-left:6px">−'+(off*100)+'%</span>':'')+'</td>'+
      '<td class="a-num a-cell-strong">'+total+'<span style="font-weight:500;color:#94A3B8;font-size:11.5px">/mes</span></td>'+
      '<td class="a-cell-muted">'+fechaRaw+'</td>'+
      '<td>'+statusBadge(r.status)+'</td>'+
      '<td>'+
        (r.comprobante_url
          ? '<button class="a-receipt" onclick="viewComprobante(\''+r.id+'\',\''+nombre+'\',\''+r.comprobante_url+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> Ver</button>'
          : '<span style="color:#CBD5E1;font-size:12px">—</span>')+
      '</td>'+
      '<td><div class="a-act-col">'+
        (isPend
          ? '<button class="a-act a-act--reject" onclick="handleReject(\''+r.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Rechazar</button>'+
             '<button class="a-act a-act--approve" onclick="handleApprove(\''+r.id+'\',\''+r.email+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aprobar</button>'
          : '<button class="a-act a-act--neutral" onclick="handleReopen(\''+r.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Reabrir</button>'
        )+'</div></td>'+
    '</tr>';
  }).join('');
}

/* EL COMPROBANTE YA NO SE ABRE POR UNA DIRECCION PUBLICA (24-ago-2026).
   El bucket se cerro: lleva datos bancarios de quien se registra y estaba
   abierto a cualquiera que acertara la direccion — que ademas se armaba con su
   correo. Ahora se pide una direccion FIRMADA, que caduca a los 5 minutos y
   solo la consigue quien es administrador de la plataforma (lo comprueba la
   politica de Storage con `es_admin_plataforma`).

   Las solicitudes viejas guardaron una direccion completa en vez de la ruta;
   esas se abren como antes. Se distingue por si empieza por `http`. */
async function viewComprobante(id, negocio, url) {
  document.getElementById('modal-comp-title').textContent = 'Comprobante — '+negocio;
  var body = document.getElementById('modal-comp-body');
  document.getElementById('modal-comprobante').classList.add('show');

  if (!url) { body.textContent = 'Sin comprobante adjunto.'; return; }

  var abrir = url;
  if (url.indexOf('http') !== 0) {
    body.textContent = 'Abriendo el comprobante…';
    try {
      var f = await sb.storage.from('comprobantes').createSignedUrl(url, 300);
      if (f.error || !f.data || !f.data.signedUrl) {
        body.textContent = 'No se pudo abrir el comprobante: ' + ((f.error && f.error.message) || 'sin permiso');
        return;
      }
      abrir = f.data.signedUrl;
    } catch (e) {
      body.textContent = 'No se pudo abrir el comprobante: ' + (e.message || e);
      return;
    }
  }

  if (/\.(jpg|jpeg|png|gif|webp)/i.test(url)) {
    body.innerHTML = '<img src="'+abrir+'" class="a-modal-img" alt="Comprobante">';
  } else {
    body.innerHTML = '<a href="'+abrir+'" target="_blank" style="color:#5B6BFF;font-weight:600">Abrir el comprobante</a>';
  }
}

// ────────────────────── CLIENTES ──────────────────────

function setCliFilter(f) {
  S.cliFilter = f;
  document.querySelectorAll('#cli-seg button').forEach(function(b,i) {
    b.classList.toggle('on', ['todos','activo','suspendido'][i]===f);
  });
  renderClientes();
}

function renderClientes() {
  var search = (S.cliSearch||'').toLowerCase();
  var rows = S.registrations.filter(function(r) {
    /* La base guarda 'approved', no 'aprobado'. Con las palabras en español la
       lista de clientes salia SIEMPRE vacia aunque hubiera cuentas activas.
       Quien esta suspendido se sabe por tenants.status, no por la solicitud. */
    if (r.status !== 'approved') return false;
    var susp = r.tenant_status === 'suspended';
    if (S.cliFilter==='activo'     && susp) return false;
    if (S.cliFilter==='suspendido' && !susp) return false;
    if (search) {
      var hay = ((r.negocio||r.nombre||'')+' '+(r.email||'')).toLowerCase();
      if (hay.indexOf(search)<0) return false;
    }
    return true;
  });

  var todos = S.registrations.filter(function(r){ return r.status === 'approved'; });
  document.getElementById('cli-cnt-todos').textContent      = todos.length;
  document.getElementById('cli-cnt-activo').textContent     = todos.filter(function(r){return r.tenant_status!=='suspended';}).length;
  document.getElementById('cli-cnt-suspendido').textContent = todos.filter(function(r){return r.tenant_status==='suspended';}).length;

  if (!rows.length) {
    document.getElementById('cli-tbody').innerHTML = '<tr><td colspan="7" class="a-empty">Sin clientes en este filtro.</td></tr>';
    return;
  }

  document.getElementById('cli-tbody').innerHTML = rows.map(function(r,i) {
    var nombre   = r.negocio || r.nombre || 'Sin nombre';
    var branches = r.sucursales || r.branches || 1;
    /* El plan que se muestra y se factura es el que la cuenta TIENE hoy
       (`plan_actual`, de tenants), no el que pidió al registrarse. Después de un
       cambio de plan son cosas distintas. */
    var planHoy  = r.plan_actual || r.plan || 'starter';
    var total    = copPlan(planTotal(planHoy, branches));
    var activo   = r.tenant_status !== 'suspended';
    var fechaRaw = r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    var planBadge= badgeHtml(PLAN_TONE[planHoy] || 'gray', planNombre(planHoy), false);

    return '<tr style="'+(!activo?'opacity:.62':'')+'">'+
      '<td><div class="a-cell-row">'+avatarHtml(nombre,36,i+2)+
        '<div class="a-cell-info"><div class="a-cell-strong">'+nombre+'</div><div class="a-cell-muted">'+r.email+'</div></div></div></td>'+
      '<td>'+planBadge+'</td>'+
      '<td class="a-num">'+branches+'</td>'+
      '<td class="a-num a-cell-strong">'+total+'<span style="font-weight:500;color:#94A3B8;font-size:11.5px">/mes</span></td>'+
      '<td class="a-cell-muted">'+fechaRaw+'</td>'+
      '<td>'+statusBadge(r.tenant_status || r.status)+'</td>'+
      '<td><div class="a-act-col">'+
        '<button class="a-act a-act--neutral"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> Detalle</button>'+
        /* Dar acceso a la consola desde AQUI: los dueños de restaurante son
           clientes, no equipo de Cobra. Solo aparece si la cuenta ya existe
           (una solicitud sin aprobar todavia no tiene usuario). */
        /* Cambiar de plan. Solo si la cuenta ya existe: una solicitud aprobada a
           medias no tiene `tenant_id` y no habría a quién cambiarle nada. */
        (r.tenant_id
          ? '<button class="a-act a-act--neutral" data-plan-tenant="'+r.tenant_id+'" data-plan-reg="'+r.id+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13l-3-3"/><path d="M21 17H8l3 3"/></svg> Cambiar plan</button>'
          : '')+
        (r.user_id
          ? '<button class="a-act a-act--neutral" data-uid="'+r.user_id+'" data-admin="1" title="Podra ver la consola de plataforma">Dar acceso a la consola</button>'
          : '')+
        (activo
          ? '<button class="a-act a-act--warn" onclick="handleSuspend(\''+r.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> Suspender</button>'
          : '<button class="a-act a-act--approve" onclick="handleReactivate(\''+r.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg> Reactivar</button>'
        )+'</div></td>'+
    '</tr>';
  }).join('');

  // Los botones de acceso a la consola se enganchan por evento (ver EQUIPO).
  var cont = document.getElementById('cli-tbody');
  if (cont && typeof engancharBotonesAcceso === 'function') engancharBotonesAcceso(cont);
  if (cont) cont.querySelectorAll('button[data-plan-tenant]').forEach(function (b) {
    b.addEventListener('click', function () {
      abrirCambioPlan(b.dataset.planReg, b.dataset.planTenant);
    });
  });
}

// ────────────────────── CAMBIAR DE PLAN ──────────────────────
/* El plan de un restaurante es lo que decide qué puede usar (lo lee pos-plan.js
   de `tenants.plan`) y lo que se le cobra. Por eso el cambio:
     · lo hace una función de la base que comprueba que quien llama sea
       administrador de la plataforma — no un UPDATE suelto desde el navegador;
     · queda anotado en `pos_plan_historial` con quién, cuándo y por qué;
     · avisa ANTES de confirmar qué gana y qué pierde el cliente, porque bajar de
       plan le apaga funciones que está usando ahora mismo. */

async function cargarPlanes() {
  var r = await sb.from('pos_planes').select('plan,nombre,precio,funciones,orden,mensajes_ia').order('orden');
  if (r.error) { console.error('cargarPlanes:', r.error); return; }
  S.planes = r.data || [];
}

function abrirCambioPlan(regId, tenantId) {
  var r = (S.registrations || []).filter(function(x){ return x.id === regId; })[0];
  if (!r) return;

  var actual   = r.plan_actual || r.plan || 'starter';
  var branches = r.sucursales || r.branches || 1;
  S.cambioPlan = {tenant: tenantId, reg: regId, actual: actual, elegido: null, branches: branches};

  document.getElementById('plan-ch-who').innerHTML =
    '<div class="pl-ch-neg">' + escapeHtml(r.negocio || r.nombre || 'Sin nombre') + '</div>' +
    '<div class="pl-ch-mail">' + escapeHtml(r.email || '') + ' · ' + branches +
      ' sucursal' + (branches === 1 ? '' : 'es') + '</div>';

  pintarOpcionesPlan();
  document.getElementById('plan-ch-motivo').value = '';
  document.getElementById('plan-ch-nota').innerHTML = '';
  var ok = document.getElementById('plan-ch-ok');
  ok.disabled = true;
  ok.textContent = 'Cambiar el plan';
  document.getElementById('modal-plan').classList.add('show');
}

function cerrarCambioPlan() {
  document.getElementById('modal-plan').classList.remove('show');
  S.cambioPlan = null;
}

function pintarOpcionesPlan() {
  var c = S.cambioPlan;
  var cont = document.getElementById('plan-ch-opts');

  cont.innerHTML = (S.planes || []).map(function(p) {
    var esActual = p.plan === c.actual;
    var elegido  = p.plan === c.elegido;
    var precio   = planPrecio(p.plan);
    var mes      = planTotal(p.plan, c.branches);
    var off      = tierFor(c.branches).off;

    return '<button class="pl-ch-opt' + (elegido ? ' pl-ch-opt--sel' : '') +
             (esActual ? ' pl-ch-opt--now' : '') + '" data-plan="' + p.plan + '"' +
             (esActual ? ' disabled' : '') + '>' +
      '<div class="pl-ch-opt-head">' +
        '<span class="pl-ch-opt-name">' + escapeHtml(p.nombre || p.plan) + '</span>' +
        (esActual ? '<span class="pl-ch-now">Plan actual</span>' : '') +
      '</div>' +
      '<div class="pl-ch-opt-price">' +
        (precio == null
          ? '<span class="pl-ch-sin">Precio por definir</span>'
          : cop(precio) + '<span class="pl-ch-per"> / mes · sucursal</span>') +
      '</div>' +
      (precio == null ? '' :
        '<div class="pl-ch-opt-tot">' + copPlan(mes) + ' al mes' +
        (c.branches > 1 ? ' · ' + c.branches + ' sucursales' + (off ? ' (−' + Math.round(off*100) + '%)' : '') : '') +
        '</div>') +
    '</button>';
  }).join('');

  cont.querySelectorAll('button[data-plan]').forEach(function(b) {
    b.addEventListener('click', function() { elegirPlanNuevo(b.dataset.plan); });
  });
}

function elegirPlanNuevo(plan) {
  var c = S.cambioPlan;
  if (!c || plan === c.actual) return;
  c.elegido = plan;
  pintarOpcionesPlan();

  var tiene = planFunciones(c.actual);
  var va    = planFunciones(plan);
  var gana  = va.filter(function(f){ return tiene.indexOf(f) < 0; });
  var pierde= tiene.filter(function(f){ return va.indexOf(f) < 0; });

  function lista(arr) {
    return '<ul class="pl-ch-lista">' + arr.map(function(f) {
      return '<li>' + escapeHtml(FUNCION_ETIQUETA[f] || f) + '</li>';
    }).join('') + '</ul>';
  }

  var antes = planTotal(c.actual, c.branches);
  var desp  = planTotal(plan, c.branches);
  var html  = '<div class="pl-ch-plata">' +
    'Pasa de <b>' + copPlan(antes) + '</b> a <b>' + copPlan(desp) + '</b> al mes.' +
    (desp == null ? ' <span class="pl-ch-sin">Ese plan todavía no tiene precio; ponlo antes de facturarlo.</span>' : '') +
  '</div>';

  if (gana.length)   html += '<div class="pl-ch-gana"><b>Se le habilita:</b>' + lista(gana) + '</div>';
  /* Bajar de plan apaga cosas que el restaurante puede estar usando en este
     momento. Se dice antes de confirmar, no después. */
  if (pierde.length) html += '<div class="pl-ch-pierde"><b>Deja de tener, apenas confirmes:</b>' + lista(pierde) + '</div>';

  document.getElementById('plan-ch-nota').innerHTML = html;

  var ok = document.getElementById('plan-ch-ok');
  ok.disabled = false;
  ok.textContent = 'Cambiar a ' + planNombre(plan);
}

async function confirmarCambioPlan() {
  var c = S.cambioPlan;
  if (!c || !c.elegido) return;

  var btn = document.getElementById('plan-ch-ok');
  btn.disabled = true;
  btn.textContent = 'Cambiando…';

  var motivo = (document.getElementById('plan-ch-motivo').value || '').trim();
  var r = await sb.rpc('admin_cambiar_plan', {
    p_tenant: c.tenant, p_plan: c.elegido, p_motivo: motivo || null
  });

  if (r.error) {
    btn.disabled = false;
    btn.textContent = 'Cambiar a ' + planNombre(c.elegido);
    showToast('No se pudo cambiar: ' + (r.error.message || ''), 'red');
    return;
  }

  var nombre = planNombre(c.elegido);
  cerrarCambioPlan();
  await loadRegistrations();
  showToast('Listo — ahora está en el plan ' + nombre + '. Le aplica apenas recargue.', 'green');
}

// ────────────────────── EQUIPO ──────────────────────

/* Neutraliza el texto que escribio otra persona antes de pintarlo.
   Los nombres y correos de esta lista los escribio el que se registro, y van a
   parar a la consola del DUEÑO de la plataforma: si alguien se registra con un
   nombre que lleve etiquetas, sin esto se ejecutarian en la pantalla de Sergio.
   Es el peor sitio posible para dejar ese hueco. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderEquipo() {
  /* EQUIPO = las personas que ayudan a Sergio a manejar COBRA. No los dueños de
     restaurante (esos son clientes, y su acceso se da desde Clientes), ni los
     meseros o cajeros de un restaurante (esos viven en la configuración de cada
     restaurante). Son tres cosas distintas y antes estaban revueltas. */
  var ROLES = [
    {rol:'Dueño',   tone:'indigo', desc:'Control total: facturación, clientes y configuración de la plataforma.'},
    {rol:'Soporte', tone:'sky',    desc:'Atiende a los clientes y consulta sus cuentas. Sin tocar facturación.'},
    {rol:'Finanzas',tone:'green',  desc:'Ingresos, planes y cobros.'}
  ];
  var grid = document.getElementById('eq-roles-grid');
  if (grid) grid.innerHTML = ROLES.map(function (x) {
    var pend = x.rol !== 'Dueño'
      ? '<span style="font-size:11px;color:#B45309;background:#FFFBEB;border:1px solid #FCD34D;' +
        'border-radius:6px;padding:1px 7px;margin-left:7px">por construir</span>' : '';
    return '<div class="a-card eq-role-card">' + badgeHtml(x.tone, x.rol, false) + pend +
      '<p class="eq-role-desc">' + x.desc + '</p></div>';
  }).join('');
  cargarEquipo();
}

/* Solo las cuentas CON acceso a esta consola. Antes aquí salían todos los
   dueños de restaurante, que no son equipo de Cobra: son los clientes. */
async function cargarEquipo() {
  var tb = document.getElementById('eq-tbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="4" class="a-cell-muted" style="padding:22px;text-align:center">Cargando…</td></tr>';

  var r = await sb.rpc('admin_listar_usuarios');
  if (r.error) {
    tb.innerHTML = '<tr><td colspan="4" class="a-cell-muted" style="padding:22px;text-align:center">' +
      'No se pudo cargar: ' + escapeHtml(r.error.message || '') + '</td></tr>';
    return;
  }

  S.usuarios = r.data || [];
  var yo = await miId();
  var equipo = S.usuarios.filter(function (u) { return u.rol === 'admin'; });

  tb.innerHTML = equipo.map(function (u, i) {
    var eresTu = u.id === yo;
    var visto  = u.ultimo_acceso
      ? new Date(u.ultimo_acceso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
      : 'nunca';
    return '<tr>' +
      '<td><div class="a-cell-row">' + avatarHtml(u.nombre, 38, i + 1) +
        '<div class="a-cell-info"><div class="a-cell-strong">' + escapeHtml(u.nombre || '') +
          (eresTu ? '<span class="eq-you">· Tú</span>' : '') +
        '</div><div class="a-cell-muted">' + escapeHtml(u.email || '') + '</div></div></div></td>' +
      '<td>' + badgeHtml('indigo', 'Dueño', false) + '</td>' +
      '<td class="a-cell-muted">Toda la plataforma' +
        '<div style="font-size:11px;opacity:.7">últ. acceso ' + visto + '</div></td>' +
      '<td>' + (eresTu
        ? '<span class="eq-online"><span class="eq-online-dot"></span>Eres tú</span>'
        : '<button class="a-act a-act--warn" data-uid="' + u.id + '" data-admin="0">Quitar acceso</button>') +
      '</td></tr>';
  }).join('');

  if (!equipo.length) {
    tb.innerHTML = '<tr><td colspan="4" class="a-cell-muted" style="padding:22px;text-align:center">' +
      'Nadie más tiene acceso a esta consola.</td></tr>';
  }

  engancharBotonesAcceso(tb);
}

/* Mi propio id de usuario. Se pide a la sesión y no solo a S.currentUser porque
   esta lista puede pintarse ANTES de que checkAdmin lo guarde — y entonces
   nadie coincidía y a Sergio le salía "Quitar acceso" sobre su propia fila. */
async function miId() {
  if (S.currentUser && S.currentUser.id) return S.currentUser.id;
  try {
    var res = await sb.auth.getUser();
    if (res.data && res.data.user) { S.currentUser = res.data.user; return res.data.user.id; }
  } catch (e) {}
  return null;
}

/* Los botones se enganchan por evento y no con onclick en el HTML: así el
   nombre del usuario nunca se mete dentro de una cadena de código. */
function engancharBotonesAcceso(cont) {
  cont.querySelectorAll('button[data-uid]').forEach(function (b) {
    b.addEventListener('click', function () {
      var u = (S.usuarios || []).filter(function (x) { return x.id === b.dataset.uid; })[0];
      cambiarAdmin(b.dataset.uid, b.dataset.admin === '1', (u && u.nombre) || 'Este usuario');
    });
  });
}

/* Dar o quitar acceso a la consola. Los candados de verdad están en la base
   (solo un admin puede dar acceso, nadie puede quitarse a sí mismo, y no se
   puede quitar al último). Esto es la puerta de adelante. */
function cambiarAdmin(uid, dar, nombre) {
  var titulo = dar ? 'Dar acceso a la consola' : 'Quitar acceso a la consola';
  var texto  = dar
    ? '<b>' + escapeHtml(nombre) + '</b> va a poder ver esta consola: todos los restaurantes ' +
      'clientes, sus ventas y su facturación. ¿Seguro?'
    : '<b>' + escapeHtml(nombre) + '</b> dejará de ver esta consola. Si tiene un restaurante, ' +
      'ese sigue funcionando exactamente igual.';

  showConfirm(titulo, texto, async function () {
    var r = await sb.rpc('admin_definir_rol', { p_usuario: uid, p_admin: dar });
    if (r.error) { showToast(r.error.message || 'No se pudo cambiar', 'red'); return; }
    showToast(dar ? nombre + ' ya tiene acceso a la consola' : nombre + ' ya no tiene acceso', 'green');
    renderEquipo();
    if (typeof loadRegistrations === 'function') loadRegistrations();
  });
}
window.cambiarAdmin = cambiarAdmin;


// ────────────────────── PLANES ──────────────────────

function renderPlanes() {
  document.getElementById('pl-cards').innerHTML = PLANS_DATA.map(function(plan) {
    var featHtml = plan.features.map(function(f) {
      return '<li class="pl-feat"><span class="pl-tick"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'+f+'</li>';
    }).join('');

    return '<div class="a-card pl-card'+(plan.popular?' pl-card--pop':'')+'">'+
      (plan.popular ? '<span class="pl-popular">★ Más popular</span>' : '')+
      '<div class="pl-top"><div class="pl-name">'+plan.name+'</div>'+badgeHtml(plan.popular?'indigo':'violet',plan.popular?'Avanzado':'Básico',false)+'</div>'+
      '<p class="pl-tagline">'+plan.tagline+'</p>'+
      '<div class="pl-price-section">'+
        '<div><span class="pl-price">'+cop(plan.price)+'</span><span class="pl-price-per">/ mes · sucursal</span></div>'+
        '<div class="pl-price-note">Precio base · antes de descuento por volumen</div>'+
      '</div>'+
      (plan.inheritsLabel
        ? '<div class="pl-inherits"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'+plan.inheritsLabel+'</div>'
        : '')+
      '<ul class="pl-feats">'+featHtml+'</ul>'+
    '</div>';
  }).join('');

  document.getElementById('pl-tiers').innerHTML = TIERS.map(function(t,i) {
    return '<div class="pl-tier">'+
      '<div class="pl-tier-pct '+( t.off ? 'pl-tier-pct--off' : 'pl-tier-pct--zero')+'">'+
        (t.off ? '−'+(t.off*100)+'%' : '0%')+
      '</div>'+
      '<div class="pl-tier-label">'+t.label+'</div>'+
    '</div>';
  }).join('');
}

// ────────────────────── ACTIONS ──────────────────────

function handleApprove(id, email) {
  var reg = S.registrations.find(function(r){return r.id===id;});
  var nombre = reg ? (reg.negocio||reg.nombre||email) : email;
  showConfirm('Aprobar registro', '¿Confirmar la aprobación de "'+nombre+'"? Se crearán las cuentas y se enviará acceso al cliente.',
    function() { approveRegistration(id, email); });
}
function handleReject(id) {
  var reg = S.registrations.find(function(r){return r.id===id;});
  var nombre = reg ? (reg.negocio||reg.nombre||'este registro') : 'este registro';
  showConfirm('Rechazar solicitud', '¿Rechazar la solicitud de "'+nombre+'"?',
    function() { rejectRegistration(id); });
}
function handleReopen(id) {
  showConfirm('Reabrir solicitud', '¿Cambiar el estado de esta solicitud a Pendiente?', async function() {
    await sb.from('pos_registrations').update({status:'pendiente'}).eq('id', id);
    showToast('Solicitud reabierta','green');
    loadRegistrations();
  });
}

/* Suspender y reactivar un cliente.
 *
 * Antes esto escribía 'suspendido' / 'activo' en `pos_registrations.status`,
 * que solo acepta pending/approved/rejected. La base rechazaba el cambio y
 * NADIE miraba el error: el aviso decía "cliente suspendido" y el cliente
 * seguía trabajando igual. Peor que no tener el botón.
 *
 * El corte de acceso vive en `tenants.status` (active/suspended/cancelled), que
 * es lo que de verdad manda sobre si la cuenta puede entrar. La solicitud queda
 * como 'approved', porque aprobada sí fue: suspender no deshace eso.
 */
async function cambiarEstadoCliente(id, suspender) {
  var reg = (S.registrations || []).filter(function (r) { return r.id === id; })[0];
  if (!reg || !reg.tenant_id) {
    showToast('Esa solicitud todavía no tiene una cuenta creada', 'red');
    return;
  }
  var r = await sb.from('tenants')
    .update({ status: suspender ? 'suspended' : 'active' })
    .eq('id', reg.tenant_id)
    .select('id');

  // Se comprueba el resultado: sin esto un rechazo de la base pasaba por bueno.
  if (r.error || !r.data || !r.data.length) {
    showToast('No se pudo cambiar: ' + ((r.error && r.error.message) || 'sin permisos'), 'red');
    return;
  }
  showToast(suspender ? 'Cliente suspendido' : 'Cliente reactivado', 'green');
  loadRegistrations();
}

function handleSuspend(id) {
  showConfirm('Suspender cliente',
    'El restaurante dejará de poder entrar al sistema. Sus datos y sus ventas se conservan, ' +
    'y vuelve a funcionar apenas lo reactives. ¿Continuar?',
    function () { cambiarEstadoCliente(id, true); });
}

function handleReactivate(id) {
  showConfirm('Reactivar cliente',
    'El restaurante vuelve a entrar al sistema con todo como lo dejó. ¿Continuar?',
    function () { cambiarEstadoCliente(id, false); });
}

// ────────────────────── DATA LOAD ──────────────────────

async function loadRegistrations() {
  try {
    var res = await sb.from('pos_registrations').select('*').order('created_at',{ascending:false});
    S.registrations = res.data || [];

    /* Si el restaurante esta suspendido NO se sabe por la solicitud (esa queda
       'approved' para siempre: aprobada si fue). Se sabe por el estado de su
       cuenta. Se trae aparte y se pega a cada fila. */
    var ten = await sb.from('tenants').select('id,status,plan');
    var porId = {};
    (ten.data || []).forEach(function (t) { porId[t.id] = t; });
    S.registrations.forEach(function (r) {
      var t = r.tenant_id ? porId[r.tenant_id] : null;
      r.tenant_status = t ? t.status : null;
      r.plan_actual   = t ? t.plan : r.plan;
    });
  } catch(e) {
    console.error('loadRegistrations:', e);
    S.registrations = [];
  }
  updateSolCounts();
  renderSolicitudes();
  renderClientes();
  renderResumen(S.registrations);
}

// ────────────────────── APPROVE / REJECT ──────────────────────

async function approveRegistration(id, email) {
  showConfirm(
    'Aprobar solicitud',
    'Se va a crear la cuenta del restaurante con sus sucursales, y se le enviará el acceso a ' + email + '. ¿Confirmas?',
    async function() {
      try {
        // Todo el aprovisionamiento (tenant, brand, branches, usuario auth,
        // pos_users, actualización del registro) lo ejecuta la Edge Function
        // "provision" en el servidor, verificando que quien llama sea admin.
        var sessRes = await sb.auth.getSession();
        var session = sessRes.data.session;
        if (!session) throw new Error('Sesión expirada — vuelve a iniciar sesión');

        var provRes = await fetch(PROVISION_URL, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + session.access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'approve', registration_id: id })
        });
        var prov = await provRes.json();
        if (!provRes.ok || !prov.ok) throw new Error(prov.error || 'No se pudo aprobar');

        await loadRegistrations();
        /* LA CLAVE SE MUESTRA, NO SE TIRA. Antes esta linea decia "ya puede
           entrar con <correo>" y la clave que devuelve el servidor se perdia
           aqui mismo: el restaurante quedaba creado y sin poder entrar, porque
           NADIE sabia la clave — ni el cliente ni Sergio. No se guarda en la
           base a proposito (una clave guardada es una clave que se puede leer),
           asi que este modal es la unica oportunidad de copiarla. Si se pierde,
           el boton "Generar clave nueva" de la lista de clientes hace otra. */
        mostrarClave(prov.clave_temporal, email, prov.negocio || nombre, true);

      } catch(e) {
        console.error('approveRegistration:', e);
        showToast('Error al aprobar: ' + (e.message || e), 'red');
      }
    }
  );
}

async function rejectRegistration(id) {
  showConfirm(
    'Rechazar solicitud',
    '¿Seguro que quieres rechazar esta solicitud? El negocio no podrá activar su cuenta.',
    async function() {
      try {
        await sb.from('pos_registrations').update({
          status: 'rechazado',
          reviewed_at: new Date().toISOString(),
        }).eq('id', id);
        await loadRegistrations();
        showToast('Solicitud rechazada.', 'amber');
      } catch(e) {
        console.error('rejectRegistration:', e);
        showToast('Error al rechazar: ' + (e.message || 'Error desconocido'), 'red');
      }
    }
  );
}

// ────────────────────── BOOT ──────────────────────

document.addEventListener('DOMContentLoaded', async function() {
  // Render static content immediately
  renderResumen([]);
  renderEquipo();
  renderPlanes();
  updateSolCounts();
  renderSolicitudes();
  renderClientes();

  // Auth + data
  await checkAdmin();
  /* El catálogo de planes va PRIMERO: los nombres, los precios y las funciones
     de las tablas salen de ahí. Sin él, la lista de clientes se pintaría con el
     precio en blanco. */
  await cargarPlanes();
  await cargarCuentaCobro();   // y la marca roja si nadie la ha confirmado
  await cargarCorreoPlataforma();
  await loadRegistrations();
});


/* ═══════════════════════════════════════════════════════════════════════
   LA CUENTA DONDE COBRA COBRA
   ───────────────────────────────────────────────────────────────────────
   Sergio, 24-ago-2026: *"una cosa es la cuenta donde pagan los clientes del
   restaurante y otra cosa muy distinta es donde pagan los clientes de Cobra.
   Por ahora es la misma cuenta, pero no deben tener ninguna vinculación ni
   ninguna relación"*.

   Por eso vive en su propia tabla (`plataforma_cobro`) y no se lee de los
   métodos de pago de ningún restaurante. Leerla de ahí habría sido un atajo
   con trampa: el día que cambie la de Cobra, cambiaría la de El Parche y sus
   clientes empezarían a transferirle a otro lado sin que nadie lo pidiera.
   ═══════════════════════════════════════════════════════════════════════ */
var _cobro = null;

async function cargarCuentaCobro() {
  try {
    var r = await sb.from('plataforma_cobro').select('*').eq('id', 1).maybeSingle();
    if (r.error || !r.data) return;
    _cobro = r.data;
    var pon = function (id, v) { var e = document.getElementById(id); if (e) e.value = v || ''; };
    pon('cb-banco',   _cobro.banco);
    pon('cb-tipo',    _cobro.tipo);
    pon('cb-numero',  _cobro.numero);
    pon('cb-titular', _cobro.titular);
    pon('cb-nota',    _cobro.nota);

    /* El aviso rojo y la marca en el menú solo mientras nadie la haya
       confirmado. Guardar una vez la da por verificada: si Sergio la miró y le
       dio a guardar, ya la revisó. */
    var aviso = document.getElementById('cobro-aviso');
    var marca = document.getElementById('cobro-badge');
    if (aviso) aviso.style.display = _cobro.verificada ? 'none' : '';
    if (marca) marca.style.display = _cobro.verificada ? 'none' : '';

    var est = document.getElementById('cb-estado');
    if (est) est.textContent = _cobro.verificada
      ? 'Verificada' + (_cobro.updated_at ? ' · ' + new Date(_cobro.updated_at).toLocaleDateString('es-CO') : '')
      : 'Sin verificar';
    pintarVistaCobro();
    pintarQrCobro();
  } catch (e) { console.warn('[cobro]', e); }
}

/* La misma caja que ve quien se registra. Verla aquí evita el error clásico de
   guardar un dato y no enterarse de cómo queda del otro lado. */
function pintarVistaCobro() {
  var v = document.getElementById('cb-vista');
  if (!v) return;
  var g = function (id) { var e = document.getElementById(id); return (e && e.value.trim()) || ''; };
  var num = g('cb-numero').replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  var esc = function (t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var fila = function (k, val) {
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #ECEEF2">'
      + '<span style="font-size:12px;color:#64748B">' + k + '</span>'
      + '<span style="font-size:12.5px;font-weight:700;color:#0F172A;text-align:right">' + esc(val || '—') + '</span></div>';
  };
  v.innerHTML = '<div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:8px">'
      + esc(g('cb-banco') || 'Transferencia') + '</div>'
    + fila('Tipo de pago', g('cb-tipo'))
    + fila(/llave/i.test(g('cb-tipo')) ? 'Llave' : 'Cuenta', num)
    + fila('Titular', g('cb-titular'))
    + (g('cb-nota') ? fila('Nota', g('cb-nota')) : '');
}

async function guardarCuentaCobro() {
  var btn = document.getElementById('cb-guardar');
  var g = function (id) { var e = document.getElementById(id); return (e && e.value.trim()) || ''; };
  var numero = g('cb-numero').replace(/\s/g, '');

  /* Se comprueba lo que de verdad importa: sin número no hay a dónde pagar, y
     sin titular quien transfiere no puede confirmar que le está pagando a la
     persona correcta. Lo demás es texto. */
  if (!numero) { showToast('Falta el número o la llave de la cuenta', 'red'); return; }
  if (!g('cb-titular')) { showToast('Falta el titular: quien paga necesita saber a nombre de quién va', 'red'); return; }

  btn.disabled = true;
  try {
    var r = await sb.from('plataforma_cobro').update({
      banco: g('cb-banco'), tipo: g('cb-tipo'), numero: numero,
      titular: g('cb-titular'), nota: g('cb-nota'),
      verificada: true, updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (r.error) { showToast('No se pudo guardar: ' + r.error.message, 'red'); return; }
    showToast('Cuenta de cobro guardada');
    await cargarCuentaCobro();
  } finally { btn.disabled = false; }
}

/* Se repinta la vista previa mientras escribe: ver el resultado al momento es
   lo que hace que se note un dígito de menos antes de guardarlo. */
document.addEventListener('input', function (e) {
  if (e.target && /^cb-(banco|tipo|numero|titular|nota)$/.test(e.target.id)) pintarVistaCobro();
});


/* ── EL QR ──────────────────────────────────────────────────────────────
   La imagen vive en el deposito `plataforma`, que solo el administrador puede
   escribir y cualquiera puede leer — tiene que verla quien todavia no tiene
   cuenta. */
function pintarQrCobro() {
  var caja = document.getElementById('cb-qr-caja');
  var quitar = document.getElementById('cb-qr-quitar');
  var btn = document.getElementById('cb-qr-btn');
  if (!caja) return;
  var url = _cobro && _cobro.qr_url;
  if (url) {
    caja.innerHTML = '<img src="' + url + '" alt="QR de pago" style="width:100%;height:100%;object-fit:contain">';
    caja.style.border = '1px solid #ECEEF2';
    if (quitar) quitar.style.display = '';
    if (btn) btn.textContent = 'Cambiar la imagen';
  } else {
    caja.innerHTML = '<span style="font-size:11.5px;color:#94A3B8;text-align:center;padding:12px">Todavía no has subido ninguno</span>';
    caja.style.border = '1.5px dashed #DCE0E8';
    if (quitar) quitar.style.display = 'none';
    if (btn) btn.textContent = 'Subir imagen del QR';
  }
}

async function subirQrCobro(input) {
  var f = input && input.files && input.files[0];
  if (!f) return;
  var est = document.getElementById('cb-qr-estado');
  /* Se comprueba aqui ADEMAS de en el deposito: el aviso del servidor llega
     como un error tecnico que no dice nada, y el archivo ya viajo entero. */
  if (f.size > 2 * 1024 * 1024) {
    showToast('La imagen pesa mas de 2 MB. Toma una captura mas pequena.', 'red');
    input.value = ''; return;
  }
  if (est) est.textContent = 'Subiendo…';
  try {
    /* Nombre AL AZAR y no fijo: con un nombre fijo, el navegador de quien mire
       la pantalla de registro se quedaria con la imagen vieja guardada y
       seguiria viendo el QR anterior sin saberlo. */
    var ext = String(f.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    var nombre = 'qr-' + ((crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now()) + '.' + ext;
    var up = await sb.storage.from('plataforma').upload(nombre, f, { contentType: f.type, upsert: false });
    if (up.error) throw up.error;
    var url = sb.storage.from('plataforma').getPublicUrl(nombre).data.publicUrl;

    var anterior = _cobro && _cobro.qr_url;
    var r = await sb.from('plataforma_cobro').update({ qr_url: url, updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) throw r.error;

    /* El anterior se borra DESPUES de que el nuevo quedo guardado. Al reves,
       un fallo al guardar dejaria la pantalla de registro sin QR. */
    if (anterior) { try { await borrarQrViejo(anterior); } catch (e) {} }

    if (est) est.textContent = 'Listo';
    await cargarCuentaCobro();
    showToast('QR actualizado');
  } catch (e) {
    if (est) est.textContent = '';
    showToast('No se pudo subir: ' + (e.message || e), 'red');
  } finally { input.value = ''; }
}

function borrarQrViejo(url) {
  var m = String(url).split('/plataforma/');
  if (m.length < 2) return Promise.resolve();
  return sb.storage.from('plataforma').remove([decodeURIComponent(m[1].split('?')[0])]);
}

function quitarQrCobro() {
  showConfirm('Quitar el QR', 'La pantalla de registro dejara de mostrar el boton para pagar escaneando. El numero de cuenta sigue igual.', async function () {
    var anterior = _cobro && _cobro.qr_url;
    var r = await sb.from('plataforma_cobro').update({ qr_url: null, updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) { showToast('No se pudo quitar: ' + r.error.message, 'red'); return; }
    if (anterior) { try { await borrarQrViejo(anterior); } catch (e) {} }
    await cargarCuentaCobro();
    showToast('QR quitado');
  });
}


/* ═══════════════════════════════════════════════════════════════════════
   LA CLAVE TEMPORAL — se muestra UNA vez
   ───────────────────────────────────────────────────────────────────────
   No hay servicio de correo conectado, asi que el camino real es: Sergio la
   copia y se la manda al cliente por WhatsApp, que es como habla con todo el
   mundo. Por eso el modal trae el mensaje ya redactado: copiar y pegar, sin
   tener que escribir nada ni acordarse de que hay que decirle.
   ═══════════════════════════════════════════════════════════════════════ */
function mostrarClave(clave, email, negocio, esNueva) {
  var prev = document.getElementById('modal-clave');
  if (prev) prev.remove();

  if (!clave) {
    showToast('La cuenta quedo creada, pero no llego la clave. Usa "Generar clave nueva".', 'red');
    return;
  }

  var mensaje = '¡Hola! Tu cuenta de Cobra POS ya esta lista.\n\n'
    + 'Entra en cobrapos.app\n'
    + 'Correo: ' + email + '\n'
    + 'Clave temporal: ' + clave + '\n\n'
    + 'Cambiala apenas entres, en Configuracion.';

  var esc = function (t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var fila = function (k, val) {
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #ECEEF2">'
      + '<span style="font-size:12px;color:#64748B">' + k + '</span>'
      + '<span style="font-size:12.5px;font-weight:700;color:#0F172A;text-align:right">' + esc(val || '—') + '</span></div>';
  };
  v.innerHTML = '<div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:8px">'
      + esc(g('cb-banco') || 'Transferencia') + '</div>'
    + fila('Tipo de pago', g('cb-tipo'))
    + fila(/llave/i.test(g('cb-tipo')) ? 'Llave' : 'Cuenta', num)
    + fila('Titular', g('cb-titular'))
    + (g('cb-nota') ? fila('Nota', g('cb-nota')) : '');
}

async function guardarCuentaCobro() {
  var btn = document.getElementById('cb-guardar');
  var g = function (id) { var e = document.getElementById(id); return (e && e.value.trim()) || ''; };
  var numero = g('cb-numero').replace(/\s/g, '');

  /* Se comprueba lo que de verdad importa: sin número no hay a dónde pagar, y
     sin titular quien transfiere no puede confirmar que le está pagando a la
     persona correcta. Lo demás es texto. */
  if (!numero) { showToast('Falta el número o la llave de la cuenta', 'red'); return; }
  if (!g('cb-titular')) { showToast('Falta el titular: quien paga necesita saber a nombre de quién va', 'red'); return; }

  btn.disabled = true;
  try {
    var r = await sb.from('plataforma_cobro').update({
      banco: g('cb-banco'), tipo: g('cb-tipo'), numero: numero,
      titular: g('cb-titular'), nota: g('cb-nota'),
      verificada: true, updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (r.error) { showToast('No se pudo guardar: ' + r.error.message, 'red'); return; }
    showToast('Cuenta de cobro guardada');
    await cargarCuentaCobro();
  } finally { btn.disabled = false; }
}

/* Se repinta la vista previa mientras escribe: ver el resultado al momento es
   lo que hace que se note un dígito de menos antes de guardarlo. */
document.addEventListener('input', function (e) {
  if (e.target && /^cb-(banco|tipo|numero|titular|nota)$/.test(e.target.id)) pintarVistaCobro();
});


/* ── EL QR ──────────────────────────────────────────────────────────────
   La imagen vive en el deposito `plataforma`, que solo el administrador puede
   escribir y cualquiera puede leer — tiene que verla quien todavia no tiene
   cuenta. */
function pintarQrCobro() {
  var caja = document.getElementById('cb-qr-caja');
  var quitar = document.getElementById('cb-qr-quitar');
  var btn = document.getElementById('cb-qr-btn');
  if (!caja) return;
  var url = _cobro && _cobro.qr_url;
  if (url) {
    caja.innerHTML = '<img src="' + url + '" alt="QR de pago" style="width:100%;height:100%;object-fit:contain">';
    caja.style.border = '1px solid #ECEEF2';
    if (quitar) quitar.style.display = '';
    if (btn) btn.textContent = 'Cambiar la imagen';
  } else {
    caja.innerHTML = '<span style="font-size:11.5px;color:#94A3B8;text-align:center;padding:12px">Todavía no has subido ninguno</span>';
    caja.style.border = '1.5px dashed #DCE0E8';
    if (quitar) quitar.style.display = 'none';
    if (btn) btn.textContent = 'Subir imagen del QR';
  }
}

async function subirQrCobro(input) {
  var f = input && input.files && input.files[0];
  if (!f) return;
  var est = document.getElementById('cb-qr-estado');
  /* Se comprueba aqui ADEMAS de en el deposito: el aviso del servidor llega
     como un error tecnico que no dice nada, y el archivo ya viajo entero. */
  if (f.size > 2 * 1024 * 1024) {
    showToast('La imagen pesa mas de 2 MB. Toma una captura mas pequena.', 'red');
    input.value = ''; return;
  }
  if (est) est.textContent = 'Subiendo…';
  try {
    /* Nombre AL AZAR y no fijo: con un nombre fijo, el navegador de quien mire
       la pantalla de registro se quedaria con la imagen vieja guardada y
       seguiria viendo el QR anterior sin saberlo. */
    var ext = String(f.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    var nombre = 'qr-' + ((crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now()) + '.' + ext;
    var up = await sb.storage.from('plataforma').upload(nombre, f, { contentType: f.type, upsert: false });
    if (up.error) throw up.error;
    var url = sb.storage.from('plataforma').getPublicUrl(nombre).data.publicUrl;

    var anterior = _cobro && _cobro.qr_url;
    var r = await sb.from('plataforma_cobro').update({ qr_url: url, updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) throw r.error;

    /* El anterior se borra DESPUES de que el nuevo quedo guardado. Al reves,
       un fallo al guardar dejaria la pantalla de registro sin QR. */
    if (anterior) { try { await borrarQrViejo(anterior); } catch (e) {} }

    if (est) est.textContent = 'Listo';
    await cargarCuentaCobro();
    showToast('QR actualizado');
  } catch (e) {
    if (est) est.textContent = '';
    showToast('No se pudo subir: ' + (e.message || e), 'red');
  } finally { input.value = ''; }
}

function borrarQrViejo(url) {
  var m = String(url).split('/plataforma/');
  if (m.length < 2) return Promise.resolve();
  return sb.storage.from('plataforma').remove([decodeURIComponent(m[1].split('?')[0])]);
}

function quitarQrCobro() {
  showConfirm('Quitar el QR', 'La pantalla de registro dejara de mostrar el boton para pagar escaneando. El numero de cuenta sigue igual.', async function () {
    var anterior = _cobro && _cobro.qr_url;
    var r = await sb.from('plataforma_cobro').update({ qr_url: null, updated_at: new Date().toISOString() }).eq('id', 1);
    if (r.error) { showToast('No se pudo quitar: ' + r.error.message, 'red'); return; }
    if (anterior) { try { await borrarQrViejo(anterior); } catch (e) {} }
    await cargarCuentaCobro();
    showToast('QR quitado');
  });
}


function generarClaveNueva(tenantId, negocio) {
  showConfirm('Generar clave nueva',
    'Se le va a cambiar la clave a ' + (negocio || 'este restaurante') + '. La que tenga ahora deja de funcionar.',
    async function () {
      try {
        var ses = await sb.auth.getSession();
        var tok = ses.data.session.access_token;
        var r = await fetch(SUPABASE_URL + '/functions/v1/provision', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clave_nueva', tenant_id: tenantId })
        });
        var d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'no se pudo');
        mostrarClave(d.clave_temporal, d.email, d.negocio || negocio, false);
      } catch (e) {
        showToast('No se pudo generar: ' + (e.message || e), 'red');
      }
    });
}


/* ═══════════════════════════════════════════════════════════════════════
   EL CORREO DE COBRA POS
   ───────────────────────────────────────────────────────────────────────
   Sergio: *"si yo quiero conecto el mismo, pero si yo quiero conecto otro"*.
   Por eso vive en `plataforma_correo` y no en el `ia_config` del restaurante:
   hoy pueden ser el mismo correo, y eso no los vuelve el mismo dato.

   EL PERMISO DE GOOGLE NO BAJA NUNCA A ESTA PANTALLA. Se pregunta QUE correo
   esta conectado —con `fn_correo_plataforma`, que devuelve el correo y la
   fecha y nada mas— y quien lo usa es el servidor. Misma idea que el PIN.
   ═══════════════════════════════════════════════════════════════════════ */
async function cargarCorreoPlataforma() {
  var est = document.getElementById('pc-estado');
  var bC = document.getElementById('pc-conectar');
  var bD = document.getElementById('pc-desconectar');
  if (!est) return;
  try {
    var r = await sb.rpc('fn_correo_plataforma');
    var d = (r && r.data) || {};
    if (d.conectado) {
      est.innerHTML = '<b style="color:#16A34A">Conectado</b> · ' + (d.email || 'cuenta de Google')
        + (d.desde ? ' <span style="color:#94A3B8">· desde el '
            + new Date(d.desde).toLocaleDateString('es-CO') + '</span>' : '');
      if (bC) bC.textContent = 'Conectar otro';
      if (bD) bD.style.display = '';
    } else {
      est.innerHTML = '<b style="color:#B45309">Sin conectar</b> · todavía no se pueden comprobar los pagos solos';
      if (bC) bC.textContent = 'Conectar Gmail';
      if (bD) bD.style.display = 'none';
    }
  } catch (e) { est.textContent = 'No se pudo comprobar'; }
}

function conectarCorreoPlataforma() {
  var clientId = '673589658608-e3p5i9pt9gsjjivocu9unpsd2r8e2k34.apps.googleusercontent.com';
  var redirectUri = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/gmail-oauth-callback';
  /* SOLO LEER. Llegue a pedir tambien permiso de enviar, para mandar la
     bienvenida desde este mismo correo. Sergio lo corrigio y tenia razon: ese
     correo es el suyo personal —es donde le llegan los comprobantes del
     banco— y mandarle desde ahi un correo a un cliente se ve mal. Las
     confirmaciones salen de `ingreso@cobrapos.app`, por otro camino.

     Asi que aqui se pide UN permiso y no dos. Pedir uno que no se usa no es
     inofensivo: hace que la pantalla de Google diga "Cobra POS quiere enviar
     correos en tu nombre", que da mas susto y es mentira. */
  var scope = 'https://www.googleapis.com/auth/gmail.readonly';
  var url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&response_type=code'
    + '&scope=' + encodeURIComponent(scope)
    + '&access_type=offline'
    /* `consent` obliga a Google a devolver el permiso de largo plazo. Sin el,
       una cuenta que ya autorizo antes vuelve sin ese permiso y la conexion se
       cae a la hora, sin que nadie entienda por que.
       `select_account` para poder elegir OTRO Gmail, que es justo el caso. */
    + '&prompt=' + encodeURIComponent('select_account consent')
    + '&state=plataforma';
  window.open(url, '_blank');
  showToast('Autoriza en la ventana de Google y vuelve aquí');

  /* Se mira cada 3 segundos si ya quedo. Hasta 2 minutos: mas que eso es que
     la persona abandono, y seguir preguntando no la ayuda. */
  var vueltas = 0;
  var reloj = setInterval(async function () {
    vueltas++;
    await cargarCorreoPlataforma();
    var est = document.getElementById('pc-estado');
    if ((est && est.textContent.indexOf('Conectado') === 0) || vueltas > 40) clearInterval(reloj);
  }, 3000);
}

function desconectarCorreoPlataforma() {
  showConfirm('Desconectar el correo',
    'Cobra POS dejará de poder comprobar los pagos contra tu banco y de mandar la bienvenida. Puedes volver a conectarlo cuando quieras.',
    async function () {
      var r = await sb.rpc('fn_correo_plataforma_desconectar');
      if (r.error || r.data !== true) { showToast('No se pudo desconectar', 'red'); return; }
      await cargarCorreoPlataforma();
      showToast('Correo desconectado');
    });
}

/* Al volver de Google se avisa aqui mismo, en vez de dejar a Sergio
   preguntandose si funciono. */
(function () {
  var p = new URLSearchParams(location.search);
  if (p.get('gmail') === 'ok') {
    setTimeout(function () { showToast('Correo conectado: ' + (p.get('email') || '')); }, 600);
    history.replaceState({}, '', location.pathname);
  } else if (p.get('gmail') === 'error') {
    setTimeout(function () { showToast('No se pudo conectar el correo: ' + (p.get('msg') || ''), 'red'); }, 600);
    history.replaceState({}, '', location.pathname);
  }
})();
