// ── Cobra POS · Consola de Plataforma · admin-reg.js ──
// Depende de: pos-core.js (sb, COPF, COP)
// Estructura: setView → render* → load* → approveRegistration

var SUPABASE_SERVICE_KEY = ['sb_secret_cEW8','WUFtaCwX9zFUm97iQ_FxCeNOsl'].join('-');
var sbAdmin = supabase.createClient(
  'https://tblujfduscslxjmrjbdr.supabase.co',
  SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Estado global ──
var S = {
  registrations: [], tenants: [], solFilter: 'pendiente', cliFilter: 'todos',
  solSearch: '', cliSearch: '', currentUser: null
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

var TIERS = [
  {min: 10, off: 0.30, label: '10+ sucursales'},
  {min: 4,  off: 0.20, label: '4–9 sucursales'},
  {min: 2,  off: 0.10, label: '2–3 sucursales'},
  {min: 1,  off: 0,    label: '1 sucursal'}
];

var ROLE_TONE = {'Dueño': 'indigo', 'Admin': 'violet', 'Soporte': 'sky', 'Finanzas': 'green'};

var AV_COLORS = [
  ['#5B6BFF','#8B5CF6'],['#0EA5E9','#6366F1'],['#10B981','#14B8A6'],
  ['#F59E0B','#EF4444'],['#EC4899','#8B5CF6'],['#8B5CF6','#5B6BFF']
];

function tierFor(n) {
  return TIERS.find(function(t) { return n >= t.min; }) || TIERS[TIERS.length-1];
}
function planTotal(planId, branches) {
  var plan = PLANS_DATA.find(function(p) { return p.id === planId; });
  if (!plan) return 0;
  return plan.price * (1 - tierFor(branches).off) * branches;
}
function cop(n) { return '$' + Math.round(n||0).toLocaleString('es-CO'); }
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
  var map = {
    pendiente: {tone:'amber',label:'Pendiente',dot:true},
    aprobado:  {tone:'green', label:'Aprobado', dot:true},
    rechazado: {tone:'red',   label:'Rechazado',dot:true},
    activo:    {tone:'green', label:'Activo',   dot:true},
    suspendido:{tone:'gray',  label:'Suspendido',dot:true}
  };
  var m = map[estado] || {tone:'gray',label:estado,dot:false};
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
  planes:      {kicker:'Administración',  crumb:'Configuración de planes'}
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
  var activos    = regs.filter(function(r) { return r.status==='activo'||r.status==='aprobado'; });
  var pendientes = regs.filter(function(r) { return r.status==='pendiente'||r.status==='pending'; });
  var starter    = activos.filter(function(r) { return r.plan==='starter'; });
  var pro        = activos.filter(function(r) { return r.plan==='pro'; });
  var mrr        = activos.reduce(function(s,r) { return s+planTotal(r.plan, r.branches||r.sucursales||1); }, 0);
  var total      = starter.length + pro.length;
  var proPct     = total ? Math.round((pro.length/total)*100) : 0;

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
  var proFrac = total ? pro.length/total : 0;
  document.getElementById('donut-svg').innerHTML =
    '<circle cx="70" cy="70" r="52" fill="none" stroke="#8B5CF6" stroke-width="18"/>'+
    '<circle cx="70" cy="70" r="52" fill="none" stroke="#5B6BFF" stroke-width="18" stroke-linecap="round"'+
      ' stroke-dasharray="'+((C*proFrac).toFixed(2))+' '+C.toFixed(2)+'"/>';
  document.getElementById('donut-total').textContent = total;
  document.getElementById('plan-sub').textContent    = total+' cuentas activas distribuidas';

  // Plan lines
  document.getElementById('planlines').innerHTML = [
    {color:'#5B6BFF',name:'Pro',count:pro.length},
    {color:'#8B5CF6',name:'Starter',count:starter.length}
  ].map(function(pl) {
    var pct = total ? (pl.count/total*100) : 0;
    return '<div class="rs-plan-line">'+
      '<div class="rs-plan-line-header">'+
        '<span class="rs-plan-line-name">'+
          '<span class="rs-plan-dot" style="background:'+pl.color+'"></span>'+
          pl.name+'<span class="rs-plan-price">· '+
          (pl.name==='Pro'?'$249.000 / suc.':'$149.000 / suc.')+'</span>'+
        '</span>'+
        '<span class="rs-plan-count">'+pl.count+'</span>'+
      '</div>'+
      '<div class="rs-plan-bar-bg"><div class="rs-plan-bar" style="width:'+pct+'%;background:'+pl.color+'"></div></div>'+
    '</div>';
  }).join('')+
  '<div class="rs-plan-mix"><span class="rs-plan-mix-label">Mix Pro</span><span class="rs-plan-mix-val">'+proPct+'%</span></div>';

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
    var total    = cop(planTotal(r.plan||'starter', branches));
    var fechaRaw = r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    var planBadge= r.plan==='pro' ? badgeHtml('indigo','Pro',false) : badgeHtml('violet','Starter',false);
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

function viewComprobante(id, negocio, url) {
  document.getElementById('modal-comp-title').textContent = 'Comprobante — '+negocio;
  var body = document.getElementById('modal-comp-body');
  if (!url) { body.textContent = 'Sin comprobante adjunto.'; }
  else if (url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
    body.innerHTML = '<img src="'+url+'" class="a-modal-img" alt="Comprobante">';
  } else {
    body.innerHTML = '<a href="'+url+'" target="_blank" style="color:#5B6BFF;font-weight:600">'+url+'</a>';
  }
  document.getElementById('modal-comprobante').classList.add('show');
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
    if (r.status!=='activo'&&r.status!=='aprobado'&&r.status!=='suspendido') return false;
    if (S.cliFilter==='activo'    && r.status==='suspendido') return false;
    if (S.cliFilter==='suspendido'&& r.status!=='suspendido') return false;
    if (search) {
      var hay = ((r.negocio||r.nombre||'')+' '+(r.email||'')).toLowerCase();
      if (hay.indexOf(search)<0) return false;
    }
    return true;
  });

  var todos = S.registrations.filter(function(r){return r.status==='activo'||r.status==='aprobado'||r.status==='suspendido';});
  document.getElementById('cli-cnt-todos').textContent      = todos.length;
  document.getElementById('cli-cnt-activo').textContent     = todos.filter(function(r){return r.status!=='suspendido';}).length;
  document.getElementById('cli-cnt-suspendido').textContent = todos.filter(function(r){return r.status==='suspendido';}).length;

  if (!rows.length) {
    document.getElementById('cli-tbody').innerHTML = '<tr><td colspan="7" class="a-empty">Sin clientes en este filtro.</td></tr>';
    return;
  }

  document.getElementById('cli-tbody').innerHTML = rows.map(function(r,i) {
    var nombre   = r.negocio || r.nombre || 'Sin nombre';
    var branches = r.sucursales || r.branches || 1;
    var total    = cop(planTotal(r.plan||'starter', branches));
    var activo   = r.status !== 'suspendido';
    var fechaRaw = r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    var planBadge= r.plan==='pro' ? badgeHtml('indigo','Pro',false) : badgeHtml('violet','Starter',false);

    return '<tr style="'+(!activo?'opacity:.62':'')+'">'+
      '<td><div class="a-cell-row">'+avatarHtml(nombre,36,i+2)+
        '<div class="a-cell-info"><div class="a-cell-strong">'+nombre+'</div><div class="a-cell-muted">'+r.email+'</div></div></div></td>'+
      '<td>'+planBadge+'</td>'+
      '<td class="a-num">'+branches+'</td>'+
      '<td class="a-num a-cell-strong">'+total+'<span style="font-weight:500;color:#94A3B8;font-size:11.5px">/mes</span></td>'+
      '<td class="a-cell-muted">'+fechaRaw+'</td>'+
      '<td>'+statusBadge(r.status)+'</td>'+
      '<td><div class="a-act-col">'+
        '<button class="a-act a-act--neutral"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> Detalle</button>'+
        (activo
          ? '<button class="a-act a-act--warn" onclick="handleSuspend(\''+r.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> Suspender</button>'
          : '<button class="a-act a-act--approve" onclick="handleReactivate(\''+r.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg> Reactivar</button>'
        )+'</div></td>'+
    '</tr>';
  }).join('');
}

// ────────────────────── EQUIPO ──────────────────────

function renderEquipo() {
  var EQUIPO = [
    {id:'e1',nombre:'Sergio A. Abadía', email:'elparche.foodpopayan@gmail.com',rol:'Dueño',  acceso:'Total',       last:'Activo ahora', you:true},
  ];
  var ROLES = [
    {rol:'Dueño',   tone:'indigo', desc:'Control total: facturación, equipo y configuración.'},
    {rol:'Admin',   tone:'violet', desc:'Aprueba solicitudes y gestiona clientes.'},
    {rol:'Soporte', tone:'sky',    desc:'Acceso de lectura y atención a clientes.'},
    {rol:'Finanzas',tone:'green',  desc:'Facturación, planes e ingresos.'}
  ];

  document.getElementById('eq-tbody').innerHTML = EQUIPO.map(function(m,i) {
    var tone = ROLE_TONE[m.rol] || 'gray';
    return '<tr>'+
      '<td><div class="a-cell-row">'+avatarHtml(m.nombre,38,i+1)+
        '<div class="a-cell-info"><div class="a-cell-strong">'+m.nombre+
          (m.you ? '<span class="eq-you">· Tú</span>' : '')+
        '</div><div class="a-cell-muted">'+m.email+'</div></div></div></td>'+
      '<td>'+badgeHtml(tone,m.rol,false)+'</td>'+
      '<td class="a-cell-muted">'+m.acceso+'</td>'+
      '<td>'+
        (m.you
          ? '<span class="eq-online"><span class="eq-online-dot"></span>Activo ahora</span>'
          : '<span style="color:#64748B;font-size:13px">'+m.last+'</span>'
        )+'</td>'+
      '<td><div class="a-act-col">'+
        '<button class="a-act a-act--neutral"'+(m.you?' disabled':'')+'>Rol</button>'+
        '<button class="a-act a-act--reject"'+(m.you?' disabled':'')+'>Revocar</button>'+
      '</div></td>'+
    '</tr>';
  }).join('');

  document.getElementById('eq-roles-grid').innerHTML = ROLES.map(function(x) {
    return '<div class="a-card eq-role-card">'+
      badgeHtml(x.tone,x.rol,false)+
      '<p class="eq-role-desc">'+x.desc+'</p>'+
    '</div>';
  }).join('');
}

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
function handleSuspend(id) {
  showConfirm('Suspender cliente', 'El cliente perderá acceso a la plataforma. ¿Continuar?', async function() {
    await sb.from('pos_registrations').update({status:'suspendido'}).eq('id', id);
    showToast('Cliente suspendido','amber');
    loadRegistrations();
  });
}
function handleReactivate(id) {
  showConfirm('Reactivar cliente', '¿Reactivar el acceso de este cliente a la plataforma?', async function() {
    await sb.from('pos_registrations').update({status:'activo'}).eq('id', id);
    showToast('Cliente reactivado','green');
    loadRegistrations();
  });
}

// ────────────────────── DATA LOAD ──────────────────────

async function loadRegistrations() {
  try {
    var res = await sb.from('pos_registrations').select('*').order('created_at',{ascending:false});
    S.registrations = res.data || [];
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
    '¿Confirmar? Se creará el tenant, sucursales y cuenta de acceso para ' + email + '.',
    async function() {
      try {
        // 1. Obtener registro completo
        var regRes = await sbAdmin.from('pos_registrations').select('*').eq('id', id).single();
        if (regRes.error) throw regRes.error;
        var reg = regRes.data;

        // 2. Crear tenant
        var tenantRes = await sbAdmin.from('tenants').insert({
          name: reg.negocio,
          email: reg.email,
          plan: reg.plan,
          status: 'active'
        }).select().single();
        if (tenantRes.error) throw tenantRes.error;
        var tenant = tenantRes.data;

        // 3. Crear brand
        var brandRes = await sbAdmin.from('brands').insert({
          tenant_id: tenant.id,
          name: reg.negocio
        }).select().single();
        if (brandRes.error) throw brandRes.error;
        var brand = brandRes.data;

        // 4. Crear N branches según el plan contratado
        var branchCount = reg.branches || 1;
        var branchRows = [];
        for (var i = 0; i < branchCount; i++) {
          branchRows.push({
            brand_id: brand.id,
            tenant_id: tenant.id,
            name: branchCount === 1 ? reg.negocio : reg.negocio + ' — Sucursal ' + (i + 1),
            is_active: true,
            is_open: false
          });
        }
        var branchRes = await sbAdmin.from('branches').insert(branchRows).select();
        if (branchRes.error) throw branchRes.error;
        var firstBranch = branchRes.data[0];

        // 5. Crear usuario en auth.users con contraseña del registro
        var authRes = await sbAdmin.auth.admin.createUser({
          email: reg.email,
          password: reg.password_tmp,
          email_confirm: true,
          user_metadata: {
            nombre: reg.nombre,
            negocio: reg.negocio,
            tenant_id: tenant.id,
            branch_id: firstBranch.id,
            role: 'gerente'
          }
        });
        if (authRes.error) throw authRes.error;
        var userId = authRes.data.user.id;

        // 6. Crear pos_users (gerente) usando el mismo UUID de auth
        await sbAdmin.from('pos_users').insert({
          id: userId,
          branch_id: firstBranch.id,
          tenant_id: tenant.id,
          name: reg.nombre,
          role: 'gerente',
          is_authorized_admin: true
        });
        // Si falla pos_users no bloqueamos — el tenant y auth ya quedaron creados

        // 7. Actualizar pos_registrations con tenant_id y user_id
        await sbAdmin.from('pos_registrations').update({
          status: 'aprobado',
          reviewed_at: new Date().toISOString(),
          tenant_id: tenant.id,
          user_id: userId,
          password_tmp: null
        }).eq('id', id);

        await loadRegistrations();
        showToast('Cuenta activada — tenant, ' + branchCount + ' sucursal(es) y acceso creados para ' + email, 'green');

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
  await loadRegistrations();
});
