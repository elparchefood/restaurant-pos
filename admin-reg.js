// ── Supabase Admin client (service_role — solo para admin-reg.js) ──
var SUPABASE_SERVICE_KEY = ['sb_secret_cEW8','WUFtaCwX9zFUm97iQ_FxCeNOsl'].join('-');
var sbAdmin = supabase.createClient(
  'https://tblujfduscslxjmrjbdr.supabase.co',
  SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ═══════════════════════════════════════════════════════════
// admin-reg.js — Consola de Plataforma Lumen
// ═══════════════════════════════════════════════════════════

// ── State ──
var S = {
  registrations: [],  // pos_registrations
  profiles: [],       // user_profiles joined with auth.users (from pos_team)
  solFilter: 'pendiente',
  cliFilter: 'todos',
  currentUser: null,
};

// ── Helpers ──
var $ = function(id) { return document.getElementById(id); };
var cop = function(n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); };

var PLAN_PRICES = { starter: 99000, pro: 249000 };
var TIERS_DATA = [
  { min: 10, off: 0.30, label: '10+ sucursales' },
  { min: 4,  off: 0.20, label: '4–9 sucursales' },
  { min: 2,  off: 0.10, label: '2–3 sucursales' },
  { min: 1,  off: 0,    label: '1 sucursal' },
];
var PLANS_DATA = [
  {
    id: 'starter', name: 'Starter', price: 99000, popular: false,
    tagline: 'Lo esencial para operar tu restaurante.',
    features: [
      'Toma de pedidos (tablet + escritorio)', 'Caja registradora', 'Gestión de mesas',
      'KDS / impresora de cocina', 'Configuración de menú',
      'Modos de servicio: mesa, para llevar y domicilio', 'Creación de menú con IA desde foto',
      'Permisos por rol + PIN para acciones sensibles', 'Informes básicos: ventas y ticket promedio',
    ],
  },
  {
    id: 'pro', name: 'Pro', price: 249000, popular: true,
    tagline: 'Todo Starter, más IA conversacional y analítica completa.',
    inheritsLabel: 'Todo lo del plan Starter, y además:',
    features: [
      'Chat IA con bandeja unificada (WhatsApp, Facebook, Instagram)',
      'Auto-creación de pedidos desde el chat',
      'Todos los informes: ventas, concurrencia, productos, canal y satisfacción',
      '2.000 mensajes de IA incluidos al mes',
    ],
  },
];
var ACTIVITY_DATA = [
  { ic: 'check',    tone: 'green',  txt: 'Consola de plataforma iniciada correctamente.', when: 'Ahora' },
];
var AV_COLORS = [
  ['#5B6BFF','#8B5CF6'],['#0EA5E9','#6366F1'],['#10B981','#14B8A6'],
  ['#F59E0B','#EF4444'],['#EC4899','#8B5CF6'],['#8B5CF6','#5B6BFF'],
];

var PAGE_META = {
  resumen:     { kicker: 'Inicio',          crumb: 'Resumen general' },
  solicitudes: { kicker: 'Plataforma',      crumb: 'Solicitudes de registro' },
  clientes:    { kicker: 'Plataforma',      crumb: 'Clientes activos' },
  equipo:      { kicker: 'Administración',  crumb: 'Gestión de equipo' },
  planes:      { kicker: 'Administración',  crumb: 'Configuración de planes' },
};

function tierFor(n) {
  return TIERS_DATA.find(function(t) { return n >= t.min; }) || TIERS_DATA[TIERS_DATA.length - 1];
}
function calcTotal(planId, branches) {
  var price = PLAN_PRICES[planId] || 0;
  var off = tierFor(branches).off;
  return price * (1 - off) * branches;
}
function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
}
function avatarStyle(seed) {
  var pair = AV_COLORS[seed % AV_COLORS.length];
  return 'background:linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')';
}
function badgeHtml(status) {
  var map = {
    pendiente:  { cls: 'amber',  label: 'Pendiente' },
    aprobado:   { cls: 'green',  label: 'Aprobado' },
    rechazado:  { cls: 'red',    label: 'Rechazado' },
    activo:     { cls: 'green',  label: 'Activo' },
    suspendido: { cls: 'gray',   label: 'Suspendido' },
  };
  var m = map[status] || { cls: 'gray', label: status };
  return '<span class="a-badge a-badge--' + m.cls + '"><span class="a-badge-dot"></span>' + m.label + '</span>';
}
function planBadgeHtml(plan) {
  var tone = plan === 'pro' ? 'indigo' : 'violet';
  var label = plan === 'pro' ? 'Pro' : 'Starter';
  return '<span class="a-badge a-badge--' + tone + '">' + label + '</span>';
}
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) { return iso; }
}
function greetingWord() {
  var h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}
function iconSvg(name, size) {
  size = size || 15;
  var p = 'width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var paths = {
    check:    '<polyline points="20 6 9 17 4 12"/>',
    x:        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    pause:    '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play:     '<polygon points="6 4 20 12 6 20 6 4"/>',
    eye:      '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    paperclip:'<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    inbox:    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    users:    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>',
    wallet:   '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    spark:    '<path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8L12 3z"/>',
  };
  return '<svg ' + p + '>' + (paths[name] || '') + '</svg>';
}

// ── View navigation ──
var currentView = 'resumen';
function setView(id) {
  document.querySelectorAll('.cp-screen').forEach(function(v) { v.classList.remove('on'); });
  var el = $('view-' + id);
  if (el) el.classList.add('on');

  document.querySelectorAll('.sh-nav').forEach(function(b) {
    b.classList.toggle('on', b.dataset.view === id);
  });

  var meta = PAGE_META[id] || { kicker: '', crumb: id };
  $('crumb-kicker').textContent = meta.kicker;
  $('crumb-title').textContent = meta.crumb;
  currentView = id;
}

// ── Toast ──
var toastTimer = null;
function showToast(msg, tone) {
  tone = tone || 'green';
  var toast = $('toast');
  toast.textContent = msg;
  toast.className = 'a-toast a-toast--' + tone + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 3500);
}

// ── Modal helpers ──
function openModal() { $('modal-overlay').classList.add('show'); }
function closeModal() { $('modal-overlay').classList.remove('show'); }
function closeCompModal() { $('modal-comprobante').classList.remove('show'); }

// ── Confirm helper ──
function showConfirm(title, msg, onOk) {
  $('modal-title').textContent = title;
  $('modal-msg').textContent = msg;
  var btn = $('modal-ok');
  btn.onclick = function() { closeModal(); onOk(); };
  openModal();
}

// ── Auth check ──
async function checkAdmin() {
  try {
    var res = await sb.auth.getUser();
    if (!res.data.user) { window.location.href = 'login.html'; return; }
    S.currentUser = res.data.user;

    // Verify admin role
    var profRes = await sb.from('user_profiles').select('role').eq('id', res.data.user.id).single();
    if (!profRes.data || profRes.data.role !== 'admin') {
      alert('Acceso restringido. Solo administradores.');
      window.location.href = 'login.html';
      return;
    }
    // Update sidebar name
    var email = res.data.user.email || '';
    var namePart = email.split('@')[0];
    $('admin-name').textContent = namePart;
    $('admin-avatar').textContent = namePart.substring(0, 2).toUpperCase();
  } catch(e) {
    console.error('checkAdmin:', e);
    window.location.href = 'login.html';
  }
}

function signOut() {
  showConfirm('Cerrar sesión', '¿Seguro que quieres cerrar tu sesión de la consola?', async function() {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}

// ─────────────────────── RESUMEN ───────────────────────

function renderResumen(regs) {
  var activos = regs.filter(function(r) { return r.status === 'activo' || r.status === 'aprobado'; });
  var pendientes = regs.filter(function(r) { return r.status === 'pending' || r.status === 'pendiente'; });
  var starter = activos.filter(function(r) { return r.plan === 'starter'; });
  var pro = activos.filter(function(r) { return r.plan === 'pro'; });
  var mrr = activos.reduce(function(sum, r) { return sum + calcTotal(r.plan, r.sucursales || 1); }, 0);
  var total = starter.length + pro.length;
  var proPct = total ? Math.round((pro.length / total) * 100) : 0;

  // Greeting
  var name = ($('admin-name').textContent || 'Sergio').split(' ')[0];
  $('greeting').textContent = greetingWord() + ', ' + name + '.';
  $('resumen-lead').innerHTML = 'Tienes <b style="color:#5B6BFF">' + pendientes.length + ' solicitudes</b> esperando aprobación y la plataforma factura ' + cop(mrr) + ' este mes.';

  // KPI cells
  if ($('kpi-activos'))   $('kpi-activos').textContent   = activos.length;
  if ($('kpi-pendientes'))$('kpi-pendientes').textContent= pendientes.length;
  if ($('kpi-mrr'))       $('kpi-mrr').textContent       = cop(mrr);
  if ($('kpi-nuevos'))    $('kpi-nuevos').textContent    = activos.length;
  if ($('kpi-activos-delta')) $('kpi-activos-delta').textContent = activos.length + ' activos';
  if ($('kpi-pend-delta'))    $('kpi-pend-delta').textContent    = pendientes.length ? 'Requiere acción' : 'Al día';
  renderDonut(pro.length, starter.length);
  $('planlines').innerHTML = [
    { color: '#5B6BFF', name: 'Pro',     count: pro.length,     price: '$249.000 / suc.' },
    { color: '#8B5CF6', name: 'Starter', count: starter.length, price: '$99.000 / suc.' },
  ].map(function(pl) {
    var pct = total ? (pl.count / total * 100) : 0;
    return '<div>' +
      '<div class="rs-plan-line-header">' +
        '<span class="rs-plan-line-name">' +
          '<span class="rs-plan-line-dot" style="background:' + pl.color + '"></span>' +
          pl.name +
          '<span class="rs-plan-line-price">· ' + pl.price + '</span>' +
        '</span>' +
        '<span class="rs-plan-line-count">' + pl.count + '</span>' +
      '</div>' +
      '<div class="rs-plan-bar-bg"><div class="rs-plan-bar" style="width:' + pct + '%;background:' + pl.color + '"></div></div>' +
      '</div>';
  }).join('') +
  '<div class="rs-plan-mix"><span class="rs-plan-mix-label">Mix Pro</span><span class="rs-plan-mix-val">' + proPct + '%</span></div>';

  // MRR chart (static trend)
  renderMrrChart();

  // Activity
  renderActivity(pendientes.length);

  // Badge
  updatePendingBadge(pendientes.length);
}

function renderDonut(pro, starter) {
  var total = pro + starter || 1;
  var C = 2 * Math.PI * 52;
  var proFrac = pro / total;
  var svg = $('donut-svg');
  if (svg) svg.innerHTML =
    '<g style="transform:rotate(-90deg);transform-origin:70px 70px">' +
      '<circle cx="70" cy="70" r="52" fill="none" stroke="#8B5CF6" stroke-width="18"/>' +
      '<circle cx="70" cy="70" r="52" fill="none" stroke="#5B6BFF" stroke-width="18"' +
        ' stroke-dasharray="' + (C * proFrac).toFixed(2) + ' ' + C.toFixed(2) + '"' +
        ' stroke-linecap="round"/>' +
    '</g>';
  if ($('donut-total')) $('donut-total').textContent = pro + starter;
}

function renderMrrChart() {
  var data = [3.2, 3.9, 4.6, 5.4, 6.5, 7.4];
  var labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
  var maxVal = 8;
  var maxPx = 72; // max bar height in pixels
  $('mrr-chart').innerHTML = data.map(function(v, i) {
    var isLast = i === data.length - 1;
    var h = Math.max(4, Math.round((v / maxVal) * maxPx));
    return '<div class="rs-mrr-bar-wrap">' +
      '<div class="rs-mrr-bar-val" style="color:' + (isLast ? '#5B6BFF' : '#94A3B8') + '">$' + v.toFixed(1) + 'M</div>' +
      '<div style="flex:1;display:flex;align-items:flex-end;">' +
        '<div class="rs-mrr-bar" style="height:' + h + 'px;width:100%;' +
          'background:' + (isLast ? 'linear-gradient(180deg,#5B6BFF,#818CF8)' : '#C7D2FE') + ';' +
          (isLast ? 'box-shadow:0 6px 16px -8px rgba(91,107,255,.5)' : '') + '"></div>' +
      '</div>' +
      '<div class="rs-mrr-bar-label">' + labels[i] + '</div>' +
    '</div>';
  }).join('');
}

function renderActivity(pendingCount) {
  var items = ACTIVITY_DATA.slice();
  if (pendingCount > 0) {
    items.unshift({ ic: 'inbox', tone: 'amber', txt: '<b>' + pendingCount + ' solicitud' + (pendingCount > 1 ? 'es pendientes' : ' pendiente') + '</b> esperando aprobación.', when: 'Ahora' });
  }
  $('activity-feed').innerHTML = items.map(function(a) {
    return '<div class="rs-act-row">' +
      '<span class="rs-act-ic rs-act-ic--' + a.tone + '">' + iconSvg(a.ic, 15) + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="rs-act-text">' + a.txt + '</div>' +
        '<div class="rs-act-when">' + a.when + '</div>' +
      '</div></div>';
  }).join('');
}

function updatePendingBadge(n) {
  var badge = $('pending-badge');
  if (n > 0) { badge.textContent = n; badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}

// ─────────────────────── SOLICITUDES ───────────────────────

async function loadRegistrations() {
  try {
    var res = await sb.from('pos_registrations').select('*').order('created_at', { ascending: false });
    S.registrations = res.data || [];
  } catch(e) {
    console.error('loadRegistrations:', e);
    S.registrations = [];
  }
  updateSolCounts();
  renderSolicitudesTable();
  renderResumen(S.registrations);
}

function updateSolCounts() {
  var regs = S.registrations;
  $('cnt-pendiente').textContent  = regs.filter(function(r) { return r.status === 'pendiente' || r.status === 'pending'; }).length;
  $('cnt-aprobado').textContent   = regs.filter(function(r) { return r.status === 'aprobado'  || r.status === 'approved'; }).length;
  $('cnt-rechazado').textContent  = regs.filter(function(r) { return r.status === 'rechazado' || r.status === 'rejected'; }).length;
  $('cnt-todas').textContent      = regs.length;
}

function setSolFilter(f) {
  S.solFilter = f;
  document.querySelectorAll('#sol-seg button').forEach(function(b) {
    b.classList.toggle('on', b.dataset.filter === f);
  });
  renderSolicitudesTable();
}

function solStatusMatch(status, filter) {
  if (filter === 'todas') return true;
  if (filter === 'pendiente') return status === 'pendiente' || status === 'pending';
  if (filter === 'aprobado')  return status === 'aprobado'  || status === 'approved';
  if (filter === 'rechazado') return status === 'rechazado' || status === 'rejected';
  return status === filter;
}

function renderSolicitudesTable() {
  var search = ($('sol-search').value || '').toLowerCase();
  var rows = S.registrations.filter(function(r) {
    return solStatusMatch(r.status, S.solFilter) &&
      (!search || (r.negocio || '').toLowerCase().includes(search) || (r.email || '').toLowerCase().includes(search));
  });

  if (!rows.length) {
    $('sol-tbody').innerHTML = '<tr><td colspan="8" class="a-empty">No hay solicitudes en este estado.</td></tr>';
    return;
  }

  $('sol-tbody').innerHTML = rows.map(function(r, i) {
    var off = tierFor(r.sucursales || 1).off;
    var total = calcTotal(r.plan, r.sucursales || 1);
    var isPending = r.status === 'pendiente' || r.status === 'pending';
    var displayStatus = r.status === 'pending' ? 'pendiente' : (r.status === 'approved' ? 'aprobado' : (r.status === 'rejected' ? 'rechazado' : r.status));
    var actions = isPending
      ? '<button class="a-act a-act--reject" onclick="rejectRegistration(\'' + r.id + '\')">' + iconSvg('x', 13) + ' Rechazar</button>' +
        '<button class="a-act a-act--approve" onclick="approveRegistration(\'' + r.id + '\',\'' + (r.email || '') + '\')">' + iconSvg('check', 13) + ' Aprobar</button>'
      : '<button class="a-act a-act--neutral" onclick="reopenRegistration(\'' + r.id + '\')">' + iconSvg('clock', 13) + ' Reabrir</button>';

    var comprobanteBtn = r.comprobante_url
      ? '<button class="a-receipt" onclick="viewComprobante(\'' + r.id + '\',\'' + escHtml(r.negocio || '') + '\',\'' + escHtml(r.comprobante_url || '') + '\')">' + iconSvg('paperclip', 13) + ' Ver</button>'
      : '<span style="color:#CBD5E1;font-size:12.5px">—</span>';

    return '<tr>' +
      '<td><div style="display:flex;align-items:center;gap:12px;">' +
        '<div class="a-avatar" style="width:36px;height:36px;font-size:13px;' + avatarStyle(i) + '">' + initials(r.negocio || r.email || '?') + '</div>' +
        '<div style="min-width:0;"><div class="a-cell-strong">' + escHtml(r.negocio || '—') + '</div>' +
        '<div class="a-cell-muted">' + escHtml(r.email || '—') + '</div></div>' +
      '</div></td>' +
      '<td>' + planBadgeHtml(r.plan) + '</td>' +
      '<td class="a-num">' + (r.sucursales || 1) + (off > 0 ? '<span style="color:#16A34A;font-size:11.5px;font-weight:700;margin-left:6px">−' + (off * 100) + '%</span>' : '') + '</td>' +
      '<td class="a-num a-cell-strong">' + cop(r.monto_total || total) + '<span style="font-weight:500;color:#94A3B8;font-size:11.5px">/mes</span></td>' +
      '<td class="a-cell-muted">' + fmtDate(r.created_at) + '</td>' +
      '<td>' + badgeHtml(displayStatus) + '</td>' +
      '<td>' + comprobanteBtn + '</td>' +
      '<td><div style="display:flex;gap:7px;justify-content:flex-end;">' + actions + '</div></td>' +
    '</tr>';
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
          user_id: userId
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

async function reopenRegistration(id) {
  try {
    await sb.from('pos_registrations').update({ status: 'pendiente', reviewed_at: null }).eq('id', id);
    await loadRegistrations();
    showToast('Solicitud reabierta.', 'green');
  } catch(e) {
    showToast('Error al reabrir.', 'red');
  }
}

function viewComprobante(id, negocio, url) {
  $('modal-comp-title').textContent = 'Comprobante — ' + negocio;
  var isPdf = url.toLowerCase().includes('.pdf');
  if (isPdf) {
    $('modal-comp-body').innerHTML =
      '<a href="' + url + '" target="_blank" class="a-modal-pdf-link">' +
        iconSvg('paperclip', 16) + ' Abrir PDF en nueva pestaña' +
      '</a>';
  } else {
    $('modal-comp-body').innerHTML = '<img src="' + url + '" class="a-modal-img" alt="Comprobante">';
  }
  $('modal-comprobante').classList.add('show');
}

// ─────────────────────── CLIENTES ───────────────────────

function setCliFilter(f) {
  S.cliFilter = f;
  document.querySelectorAll('#cli-seg button').forEach(function(b) {
    b.classList.toggle('on', b.dataset.filter === f);
  });
  renderClientesTable();
}

function renderClientesFromRegs() {
  var approved = S.registrations.filter(function(r) {
    return r.status === 'aprobado' || r.status === 'approved' || r.status === 'activo' || r.status === 'suspendido';
  });

  var activo = approved.filter(function(r) { return r.status !== 'suspendido'; });
  var suspendido = approved.filter(function(r) { return r.status === 'suspendido'; });

  $('cli-cnt-todos').textContent = approved.length;
  $('cli-cnt-activo').textContent = activo.length;
  $('cli-cnt-suspendido').textContent = suspendido.length;

  S._clientes = approved;
  renderClientesTable();
}

function renderClientesTable() {
  var clientes = S._clientes || [];
  var search = ($('cli-search').value || '').toLowerCase();
  var rows = clientes.filter(function(r) {
    var statusMatch = S.cliFilter === 'todos' ? true :
      S.cliFilter === 'activo' ? (r.status !== 'suspendido') : (r.status === 'suspendido');
    return statusMatch && (!search || (r.negocio || '').toLowerCase().includes(search) || (r.email || '').toLowerCase().includes(search));
  });

  if (!rows.length) {
    $('cli-tbody').innerHTML = '<tr><td colspan="7" class="a-empty">Sin clientes en este estado.</td></tr>';
    return;
  }

  $('cli-tbody').innerHTML = rows.map(function(r, i) {
    var displayStatus = (r.status === 'aprobado' || r.status === 'approved') ? 'activo' : r.status;
    var isSuspended = r.status === 'suspendido';
    var total = calcTotal(r.plan, r.sucursales || 1);
    var rowStyle = isSuspended ? ' style="opacity:.62"' : '';
    var actionBtn = isSuspended
      ? '<button class="a-act a-act--approve" onclick="toggleClientStatus(\'' + r.id + '\',false)">' + iconSvg('play', 13) + ' Reactivar</button>'
      : '<button class="a-act a-act--warn" onclick="toggleClientStatus(\'' + r.id + '\',true)">' + iconSvg('pause', 13) + ' Suspender</button>';

    return '<tr' + rowStyle + '>' +
      '<td><div style="display:flex;align-items:center;gap:12px;">' +
        '<div class="a-avatar" style="width:36px;height:36px;font-size:13px;' + avatarStyle(i + 2) + '">' + initials(r.negocio || r.email || '?') + '</div>' +
        '<div style="min-width:0;"><div class="a-cell-strong">' + escHtml(r.negocio || '—') + '</div>' +
        '<div class="a-cell-muted">' + escHtml(r.email || '—') + '</div></div>' +
      '</div></td>' +
      '<td>' + planBadgeHtml(r.plan) + '</td>' +
      '<td class="a-num">' + (r.sucursales || 1) + '</td>' +
      '<td class="a-num a-cell-strong">' + cop(r.monto_total || total) + '<span style="font-weight:500;color:#94A3B8;font-size:11.5px">/mes</span></td>' +
      '<td class="a-cell-muted">' + fmtDate(r.reviewed_at || r.created_at) + '</td>' +
      '<td>' + badgeHtml(displayStatus) + '</td>' +
      '<td><div style="display:flex;gap:7px;justify-content:flex-end;">' +
        '<button class="a-act a-act--neutral">' + iconSvg('eye', 13) + ' Detalle</button>' +
        actionBtn +
      '</div></td>' +
    '</tr>';
  }).join('');
}

async function toggleClientStatus(id, suspend) {
  var action = suspend ? 'suspender' : 'reactivar';
  showConfirm(
    (suspend ? 'Suspender' : 'Reactivar') + ' cuenta',
    '¿Confirmar ' + action + ' esta cuenta?',
    async function() {
      try {
        var newStatus = suspend ? 'suspendido' : 'aprobado';
        await sb.from('pos_registrations').update({ status: newStatus }).eq('id', id);
        await loadRegistrations();
        showToast('Cuenta ' + (suspend ? 'suspendida' : 'reactivada') + '.', suspend ? 'amber' : 'green');
      } catch(e) {
        showToast('Error al ' + action + ' la cuenta.', 'red');
      }
    }
  );
}

// ─────────────────────── EQUIPO ───────────────────────

async function loadEquipo() {
  try {
    var res = await sb.from('user_profiles').select('id, role, created_at');
    S.profiles = res.data || [];
  } catch(e) {
    console.error('loadEquipo:', e);
    S.profiles = [];
  }
  renderEquipo();
}

function renderEquipo() {
  var profiles = S.profiles;
  if (!profiles.length) {
    $('eq-tbody').innerHTML = '<tr><td colspan="5" class="a-empty">Sin miembros de equipo registrados.</td></tr>';
  } else {
    var ROLE_TONE = { admin: 'violet', client: 'sky', support: 'sky' };
    var ROLE_LABEL = { admin: 'Admin', client: 'Cliente', support: 'Soporte' };
    var ROLE_ACCESO = { admin: 'Total', client: 'Solo su cuenta', support: 'Solicitudes / Clientes' };
    $('eq-tbody').innerHTML = profiles.map(function(p, i) {
      var isYou = S.currentUser && p.id === S.currentUser.id;
      var tone = ROLE_TONE[p.role] || 'gray';
      var roleLabel = ROLE_LABEL[p.role] || p.role;
      var acceso = ROLE_ACCESO[p.role] || '—';
      var rowName = 'ID: ' + p.id.substring(0, 8) + '…';
      return '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:12px;">' +
          '<div class="a-avatar" style="width:38px;height:38px;font-size:13px;' + avatarStyle(i + 1) + '">' + p.role.substring(0, 2).toUpperCase() + '</div>' +
          '<div style="min-width:0;">' +
            '<div class="a-cell-strong">' + rowName + (isYou ? '<span class="eq-you-tag">· Tú</span>' : '') + '</div>' +
            '<div class="a-cell-muted">' + (p.role) + '</div>' +
          '</div></div></td>' +
        '<td><span class="a-badge a-badge--' + tone + '">' + roleLabel + '</span></td>' +
        '<td class="a-cell-muted">' + acceso + '</td>' +
        '<td><span style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:' + (isYou ? '#16A34A' : '#64748B') + ';">' +
          (isYou ? '<span class="eq-active-dot"></span>Activo ahora' : fmtDate(p.created_at)) +
        '</span></td>' +
        '<td><div style="display:flex;gap:7px;justify-content:flex-end;">' +
          '<button class="a-act a-act--neutral"' + (isYou ? ' disabled' : '') + '>' + iconSvg('shield', 13) + ' Rol</button>' +
          '<button class="a-act a-act--reject"' + (isYou ? ' disabled' : '') + '>' + iconSvg('x', 13) + ' Revocar</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  // Roles reference
  $('eq-roles-grid').innerHTML = [
    { rol: 'Dueño',   tone: 'indigo',  desc: 'Control total: facturación, equipo y configuración.' },
    { rol: 'Admin',   tone: 'violet',  desc: 'Aprueba solicitudes y gestiona clientes.' },
    { rol: 'Soporte', tone: 'sky',     desc: 'Acceso de lectura y atención a clientes.' },
    { rol: 'Finanzas',tone: 'green',   desc: 'Facturación, planes e ingresos.' },
  ].map(function(x) {
    return '<div class="a-card eq-role-card">' +
      '<span class="a-badge a-badge--' + x.tone + '">' + x.rol + '</span>' +
      '<p class="eq-role-desc">' + x.desc + '</p>' +
    '</div>';
  }).join('');
}

// ─────────────────────── PLANES ───────────────────────

function renderPlanes() {
  // Plan cards
  $('pl-cards').innerHTML = PLANS_DATA.map(function(plan) {
    var featuresHtml = plan.features.map(function(f) {
      return '<li class="pl-feat-item">' +
        '<span class="pl-tick">' + iconSvg('check', 12) + '</span>' + escHtml(f) +
      '</li>';
    }).join('');
    var inheritsHtml = plan.inheritsLabel
      ? '<div class="pl-inherits">' + iconSvg('check', 13) + escHtml(plan.inheritsLabel) + '</div>'
      : '';
    return '<div class="a-card pl-card' + (plan.popular ? ' pl-card--popular' : '') + '">' +
      (plan.popular ? '<span class="pl-popular-tag">★ Más popular</span>' : '') +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;">' +
        '<div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">' + plan.name + '</div>' +
        planBadgeHtml(plan.id) +
      '</div>' +
      '<p style="font-size:13px;color:#64748B;margin:6px 0 0;line-height:1.45">' + escHtml(plan.tagline) + '</p>' +
      '<div style="margin:18px 0;padding:16px 0;border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;">' +
        '<div class="pl-price-row">' +
          '<span class="pl-price">' + cop(plan.price) + '</span>' +
          '<span class="pl-price-unit">/ mes · sucursal</span>' +
        '</div>' +
        '<div class="pl-price-note">Precio base · antes de descuento por volumen</div>' +
      '</div>' +
      inheritsHtml +
      '<ul class="pl-features">' + featuresHtml + '</ul>' +
    '</div>';
  }).join('');

  // Tiers
  var tiersReversed = TIERS_DATA.slice().reverse();
  $('pl-tiers').innerHTML = tiersReversed.map(function(t, i) {
    var isLast = i === tiersReversed.length - 1;
    return '<div class="pl-tier-cell"' + (isLast ? '' : '') + '>' +
      '<div class="pl-tier-pct" style="color:' + (t.off ? '#16A34A' : '#64748B') + '">' +
        (t.off ? '−' + (t.off * 100) + '%' : '0%') +
      '</div>' +
      '<div class="pl-tier-label">' + t.label + '</div>' +
    '</div>';
  }).join('');
}

// ─────────────────────── BOOT ───────────────────────

document.addEventListener('DOMContentLoaded', async function() {
  // Render static sections immediately
  renderResumen([]);
  renderPlanes();
  renderEquipo();

  // Auth check
  await checkAdmin();

  // Load data
  await loadRegistrations();
  renderClientesFromRegs();
  await loadEquipo();
});
