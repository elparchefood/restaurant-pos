/* domicilios.js — Módulo Domicilios · Cobra POS
   Stack: HTML/CSS/JS vanilla + Supabase
   Credenciales: definidas en pos-core.js (sb ya disponible)
   Fuente: convertido desde JSX (domicilios-src-2552bc74, 35f24634, 9f4f6970)
   Reglas: nada hardcodeado de negocio, productos de Supabase,
           clientes semilla local, sin sesión → login.html
*/

// ── Datos estáticos (extraídos del JSX fuente) ─────────────────────────

const CHANNELS = [
  { id: 'whatsapp',  name: 'WhatsApp',   mono: 'WA',  color: '#25D366', tint: '#E7F8EE' },
  { id: 'instagram', name: 'Instagram',  mono: 'IG',  color: '#E1306C', tint: '#FCE7F0' },
  { id: 'facebook',  name: 'Facebook',   mono: 'FB',  color: '#1877F2', tint: '#E7F0FE' },
  { id: 'tiktok',    name: 'TikTok',     mono: 'TT',  color: '#111827', tint: '#EEF0F3' },
  { id: 'llamada',   name: 'Llamada',    mono: 'Tel', color: '#5B6BFF', tint: '#EEF2FF' },
  { id: 'web',       name: 'Página web', mono: 'Web', color: '#0EA5E9', tint: '#F0F9FF' },
];
const CHAN_OF = id => CHANNELS.find(c => c.id === id) || CHANNELS[0];

const MODALITIES = [
  { id: 'express',    name: 'Domicilio express',    icon: 'scooter'  },
  { id: 'programado', name: 'Domicilio programado', icon: 'calendar' },
  { id: 'recogo',     name: 'Recogo en tienda',     icon: 'store'    },
];

const ESTADOS = [
  { id: 'recibido',    name: 'Recibido',       color: '#64748B', tint: '#F1F5F9' },
  { id: 'preparacion', name: 'En preparación', color: '#F59E0B', tint: '#FFFBEB' },
  { id: 'listo',       name: 'Listo',          color: '#8B5CF6', tint: '#F5F3FF' },
  { id: 'camino',      name: 'En camino',      color: '#5B6BFF', tint: '#EEF2FF' },
  { id: 'entregado',   name: 'Entregado',      color: '#16A34A', tint: '#DCFCE7' },
];
const ESTADO_OF   = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
const ESTADO_NEXT = id => { const i = ESTADOS.findIndex(e => e.id === id); return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1].id : null; };
const KAN_BTN     = { recibido: 'En preparación', preparacion: 'Listo', listo: 'En camino', camino: 'Entregado', entregado: null };





// ── Estado global S ────────────────────────────────────────────────────
const S = {
  tenantId:  null,
  branchId:    null,
  userId:     null,
  waiterName: null,
  // Contexto del domicilio
  canal:     'whatsapp',
  modalidad: 'express',
  fee:       0,
  // Carrito
  cart:      [],
  // Cliente
  cliente:   null,
  // Courier
  courier:   'interno',
  cobramos:  false,
  asignado:  null,
  // Pago
  pago:      { when: 'contraentrega', status: 'pendiente', metodo: 'efectivo' },
  // UI
  kpRaw:     '',
  editCliId: null,
  // Datos
  cats:      [],
  products:  [],
  favorites: [],
  modGroups: [],
  domiciliarios: [],
  clientes:  (function() {
    // Migración clave compartida pos.clientes
    const _shared = localStorage.getItem('pos.clientes');
    if (_shared) return JSON.parse(_shared);
    const _old = localStorage.getItem('pos.domi.clientes');
    if (_old) { const d = JSON.parse(_old); localStorage.setItem('pos.clientes', _old); return d; }
    return [];
  })(),
  deliveries: [],
};

// ── Helpers ────────────────────────────────────────────────────────────
function fmt(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CO');
}

function initials(s) {
  const parts = (s || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function toast(msg, duration) {
  const el = $('toast');
  if (!el) return;
  el.innerHTML = svgInline('check', 15) + ' ' + msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, duration || 2200);
}

// ── SVG helpers (inline, no dependencia externa) ───────────────────────
function svgInline(name, size, sw) {
  size = size || 16;
  sw   = sw || 2;
  const p = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case 'back':     return `<svg ${p}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
    case 'back2':    return `<svg ${p}><polyline points="15 18 9 12 15 6"/></svg>`;
    case 'chevron-r':return `<svg ${p}><polyline points="9 18 15 12 9 6"/></svg>`;
    case 'scooter':  return `<svg ${p}><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 18H15"/><path d="M4 7h4l3 8"/><path d="M14 9h3l3 6"/><path d="M14 9V6h2"/></svg>`;
    case 'list':     return `<svg ${p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
    case 'cart':     return `<svg ${p}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
    case 'plus':     return `<svg ${p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case 'minus':    return `<svg ${p}><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case 'trash':    return `<svg ${p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    case 'chevron':  return `<svg ${p}><polyline points="9 18 15 12 9 6"/></svg>`;
    case 'search':   return `<svg ${p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    case 'star':     return `<svg ${p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    case 'fire':     return `<svg ${p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
    case 'note':     return `<svg ${p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    case 'user':     return `<svg ${p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    case 'userplus': return `<svg ${p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;
    case 'edit':     return `<svg ${p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`;
    case 'x':        return `<svg ${p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    case 'check':    return `<svg ${p}><polyline points="20 6 9 17 4 12"/></svg>`;
    case 'phone':    return `<svg ${p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
    case 'mappin':   return `<svg ${p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
    case 'clock':    return `<svg ${p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'calendar': return `<svg ${p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    case 'store':    return `<svg ${p}><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></svg>`;
    case 'cash':     return `<svg ${p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/></svg>`;
    case 'transfer': return `<svg ${p}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    case 'card':     return `<svg ${p}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
    case 'truck':    return `<svg ${p}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
    case 'save':     return `<svg ${p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
    case 'alert':    return `<svg ${p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'info':     return `<svg ${p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    case 'bag':      return `<svg ${p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
    case 'arrowr':   return `<svg ${p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
    case 'sliders':  return `<svg ${p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;
    default: return '';
  }
}

function colorTint(hex) { return hex + '18'; }
function colorRing(hex)  { return hex + '66'; }

// ── Boot ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // ── Gate: mostrar modal de registro ANTES de cargar nada ─────────────
  document.body.classList.add('d-gate');
  openModal('modal-registro');

  // ── Eventos: síncrono, sin await, siempre se ejecuta primero ──────────
  attachEvents();

  // ── Auth + datos: async por separado ─────────────────────────────────
  (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { window.location.href = 'login.html'; return; }
      const { data: { user } } = await sb.auth.getUser();
      if (!user)    { window.location.href = 'login.html'; return; }
      S.tenantId = (user.user_metadata && user.user_metadata.tenant_id) || user.id;
      S.branchId    = (user.user_metadata && user.user_metadata.branch_id) || null;
      S.userId      = user.id || null;
      S.waiterName  = (user.user_metadata && (user.user_metadata.nombre || user.user_metadata.full_name)) || user.email || null;
      const name = (user.user_metadata && (user.user_metadata.nombre || user.user_metadata.full_name)) || user.email || 'Usuario';
      const role = (user.user_metadata && user.user_metadata.role)      || 'Operador';
      if ($('topbar-name'))   $('topbar-name').textContent   = name;
      if ($('topbar-role'))   $('topbar-role').textContent   = role;
      if ($('topbar-role2'))  $('topbar-role2').textContent  = role;
      if ($('topbar-avatar')) $('topbar-avatar').textContent = initials(name);
    } catch(e) {
      console.error('domicilios auth:', e);
      window.location.href = 'login.html';
      return;
    }

    if (window.cajaGuard) {
      const cajaOpen = await window.cajaGuard(S.branchId);
      if (!cajaOpen) return;
    }

    try { await loadData(); } catch(e) { console.error('loadData:', e); }
    try { await loadActiveOrders(); } catch(e) { console.error('loadActiveOrders:', e); }
    try { subscribeNewOrders(); } catch(e) { console.error('subscribeNewOrders:', e); }

    try { renderCatGrid();       } catch(e) { console.error('renderCatGrid:', e); }
    try { renderMenuPane();      } catch(e) { console.error('renderMenuPane:', e); }
    try { renderFavPane();       } catch(e) { console.error('renderFavPane:', e); }
    try { renderCart();          } catch(e) { console.error('renderCart:', e); }
    try { renderDetBtn();        } catch(e) { console.error('renderDetBtn:', e); }
    try { renderAsigList();      } catch(e) { console.error('renderAsigList:', e); }
    try { renderContextHeader(); } catch(e) { console.error('renderContextHeader:', e); }
    try { renderMonitor();       } catch(e) { console.error('renderMonitor:', e); }
    try { updateMonitorBadge();  } catch(e) { console.error('updateMonitorBadge:', e); }

  })();
});


// ── Carga pedidos activos de domicilio/WhatsApp al abrir la página ────────
async function loadActiveOrders() {
  if (!S.branchId) return;
  try {
    const { data: orders, error } = await sb
      .from('pos_orders')
      .select('id, customer_name, channel, notes, payment_method, total, paid_amount, opened_at, delivery_status, delivery_fee, delivered_at')
      .eq('branch_id', S.branchId)
      .in('channel', ['domicilio', 'whatsapp'])
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    if (error || !orders || !orders.length) return;
    for (const o of orders) {
      if (S.deliveries.find(d => d.supabaseId === o.id)) continue;
      S.deliveries.push(_orderRowToDelivery(o));
    }
    S.deliveries.sort((a, b) => b.createdAt - a.createdAt);
    renderMonitor();
    updateMonitorBadge();
  } catch(e) { console.error('[domicilios] loadActiveOrders:', e); }
}

// ── Escucha pedidos nuevos creados externamente (ej: bot WhatsApp) ─────────
function subscribeNewOrders() {
  if (!sb || !sb.channel || !S.branchId) return;
  sb.channel('domi_external_orders')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'pos_orders',
    }, payload => {
      const o = payload.new;
      if (!o || o.branch_id !== S.branchId) return;
      if (!['domicilio', 'whatsapp'].includes(o.channel)) return;
      if (o.status !== 'open') return;
      if (S.deliveries.find(d => d.supabaseId === o.id)) return;
      S.deliveries.unshift(_orderRowToDelivery(o));
      renderMonitor();
      updateMonitorBadge();
      // Notificación visual breve
      const cliente = o.customer_name || 'Cliente';
      toast('🍟 Nuevo pedido WhatsApp — ' + cliente);
    })
    .subscribe();
}

// ── Convierte una fila de pos_orders al formato de S.deliveries ───────────
function _orderRowToDelivery(o) {
  const shortId = String(o.id || '').slice(-6).toUpperCase();
  const metodo  = o.payment_method || 'efectivo';
  // Estado de pago real: lo abonado (paid_amount) contra el total del pedido.
  // Las transferencias verificadas por el bot llegan ya con paid_amount lleno.
  const total   = Number(o.total) || 0;
  const pagado  = Number(o.paid_amount) || 0;
  const fee     = Number(o.delivery_fee) || 0;
  const payStatus = total > 0 && pagado >= total ? 'pagado'
                  : pagado > 0                   ? 'parcial'
                  :                                'pendiente';
  // Estado de entrega PERSISTIDO (antes todo volvía a 'recibido' al recargar)
  const estado = o.delivery_status || (o.delivered_at ? 'entregado' : 'recibido');
  return {
    id:           shortId,
    supabaseId:   o.id,
    cliente:      o.customer_name || '—',
    canal:        o.channel === 'whatsapp' ? 'whatsapp' : 'whatsapp',
    items:        '?',
    productos:    Math.max(0, total - fee),   // el total ya incluye el fee
    fee:          fee,
    estado:       estado,
    payStatus:    payStatus,
    paidAmount:   pagado,
    payWhen:      payStatus === 'pagado' ? 'adelantado' : 'contraentrega',
    metodo:       metodo,
    courier:      'interno',
    cobramos:     false,
    domiciliario: '—',
    min:          0,
    createdAt:    o.opened_at ? new Date(o.opened_at).getTime() : Date.now(),
    notas:        o.notes || '',
    fromWhatsApp: true,
  };
}

// ── Cargar datos desde Supabase ────────────────────────────────────────
// Catálogo: stale-while-revalidate con la misma clave que tomar-pedido.
// Si el usuario ya usó mesas antes, los datos están disponibles al instante.
async function loadData() {
  if (!S.tenantId) return;
  await loadCatalog();
  // Domiciliarios: carga en paralelo sin bloquear la UI
  _fetchDomiciliarios();
}

async function loadCatalog() {
  const _ck = 'pos.catalog.v1.' + S.tenantId;
  try {
    const _raw = localStorage.getItem(_ck);
    if (_raw) {
      const _cd = JSON.parse(_raw);
      // Solo confiar en caché CON productos (una caché vacía es basura de una
      // eliminación/importación a medias → traer fresco)
      if (_cd && _cd.cats && Array.isArray(_cd.products) && _cd.products.length > 0) {
        S.cats      = _cd.cats;
        S.products  = _cd.products;
        S.modGroups = _cd.modGroups || [];
        // Pintar inmediatamente desde caché, refrescar en segundo plano
        setTimeout(function() { _catalogFetch(_ck, true); }, 0);
        return;
      }
    }
  } catch(e) {}
  // Primera vez (o caché vacía): esperar datos frescos
  await _catalogFetch(_ck, false);
}

async function _catalogFetch(cacheKey, isBackground) {
  for (let intento = 1; intento <= 3; intento++) {
  try {
    const [catsRes, prodsRes, modsRes] = await Promise.all([
      sb.from('pos_categories')
        .select('id,name,color,color_tint,color_ring')
        .eq('tenant_id', S.tenantId).order('name'),
      sb.from('pos_products')
        .select('id,name,price,price_mode,category_id,photo_url,available,presentations,variables,mod_group_ids')
        .eq('tenant_id', S.tenantId).eq('available', true).order('name'),
      sb.from('pos_modifier_groups')
        .select('id,name,rule,multi,options')
        .eq('tenant_id', S.tenantId),
    ]);
    if (catsRes.error) throw catsRes.error;
    if (prodsRes.error) throw prodsRes.error;
    const cats = catsRes.data, prods = prodsRes.data, mods = modsRes.data;
    S.cats = (cats || []).map((c, i) => ({
      ...c,
      color: c.color || ['#5B6BFF','#8B5CF6','#EC4899','#F59E0B','#10B981','#0EA5E9','#EF4444','#14B8A6'][i % 8],
      tint:  c.color_tint || '#F8FAFF',
    }));
    S.products = (prods || []).map(p => ({
      id: p.id, name: p.name, price: p.price, price_mode: p.price_mode || 'fixed',
      category_id: p.category_id, photo_url: p.photo_url || null,
      presentations: Array.isArray(p.presentations) ? p.presentations : [],
      variables:     Array.isArray(p.variables)     ? p.variables     : [],
      mod_group_ids: Array.isArray(p.mod_group_ids) ? p.mod_group_ids : [],
    }));
    S.modGroups = (mods || []).map(g => ({
      id: g.id, name: g.name, rule: g.rule || 'opcional', multi: !!g.multi,
      options: Array.isArray(g.options) ? g.options : [],
    }));
    try {
      if (S.products.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify({
          cats: S.cats, products: S.products, modGroups: S.modGroups, ts: Date.now()
        }));
      }
    } catch(e) {}
    renderCatGrid(); renderMenuPane(); renderFavPane();
    return;
  } catch(e) {
    console.error('[domicilios] _catalogFetch intento ' + intento + ':', e);
    if (intento < 3) await new Promise(function(r){ setTimeout(r, 1200 * intento); });
  }
  }
  renderCatGrid(); renderMenuPane(); renderFavPane();
}

function _fetchDomiciliarios() {
  sb.from('pos_users')
    .select('id,name,phone,role')
    .eq('tenant_id', S.tenantId)
    .eq('role', 'domiciliario')
    .eq('active', true)
    .then(({ data }) => {
      S.domiciliarios = (data || []).map(u => ({
        id: u.id, nombre: u.name, tel: u.phone || '', estado: 'Disponible',
      }));
    });
}

// ── Navegación y vistas ────────────────────────────────────────────────
function setView(v) {
  document.querySelectorAll('.d-navitem[data-nav]').forEach(b => {
    b.classList.toggle('on', b.dataset.nav === v);
    // Monitor badge invierte colores cuando está activo
    const badge = b.querySelector('#monitor-badge');
    if (badge) {
      badge.style.background = v === 'monitor' ? '#fff' : '#5B6BFF';
      badge.style.color      = v === 'monitor' ? '#5B6BFF' : '#fff';
    }
  });
  const pedidoEl  = $('view-pedido');
  const monitorEl = $('view-monitor');
  if (pedidoEl)  { pedidoEl.hidden  = (v !== 'pedido');  pedidoEl.classList.toggle('on', v === 'pedido'); }
  if (monitorEl) { monitorEl.hidden = (v !== 'monitor'); monitorEl.classList.toggle('on', v === 'monitor'); }
  if (v === 'monitor') { renderMonitor(); updateMonitorBadge(); }
}

function setBrowserTab(tab) {
  document.querySelectorAll('.lm-bigtab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if ($('cat-grid'))          $('cat-grid').hidden          = (tab !== 'categoria');
  if ($('subview-products'))  $('subview-products').hidden  = true;
  if ($('pane-menu'))         $('pane-menu').hidden         = (tab !== 'menu');
  if ($('pane-busqueda'))     $('pane-busqueda').hidden     = (tab !== 'busqueda');
  if ($('pane-favoritos'))    $('pane-favoritos').hidden    = (tab !== 'favoritos');
  if (tab === 'menu')      renderMenuPane();
  if (tab === 'favoritos') renderFavPane();
}

function flipToDetalles() {
  const pd = document.querySelector('[data-face="pedido"]');
  const dd = document.querySelector('[data-face="detalles"]');
  if (pd) pd.classList.remove('on');
  if (dd) dd.classList.add('on');
  renderClienteCard();
}

function flipToPedido() {
  const pd = document.querySelector('[data-face="pedido"]');
  const dd = document.querySelector('[data-face="detalles"]');
  if (dd) dd.classList.remove('on');
  if (pd) pd.classList.add('on');
  renderDetBtn();
  renderTotals();
}

// ── Modal helpers ──────────────────────────────────────────────────────
function openModal(id)  { const el = $(id); if (el) el.hidden = false; }
function closeModal(id) { const el = $(id); if (el) el.hidden = true;  }
function closeAllModals() {
  document.querySelectorAll('.d-overlay').forEach(el => { el.hidden = true; });
}

// ── Contexto header ────────────────────────────────────────────────────
function renderContextHeader() {
  const ch = CHAN_OF(S.canal);
  const el_badge = $('chan-badge');
  const el_mono  = $('chan-mono');
  const el_name  = $('chan-name');
  const el_mod   = $('modalidad-title');
  const el_fee   = $('fee-display');
  if (el_badge) { el_badge.style.color = ch.color; el_badge.style.background = ch.tint; }
  if (el_mono)  { el_mono.textContent = ch.mono; el_mono.style.background = ch.color; }
  if (el_name)  el_name.textContent  = ch.name;
  const mod = MODALITIES.find(m => m.id === S.modalidad) || MODALITIES[0];
  if (el_mod) el_mod.textContent = mod.name;
  if (el_fee) el_fee.textContent = fmt(S.fee);
  renderTotals();
}

// ── Keypad ─────────────────────────────────────────────────────────────
function kpPress(k) {
  if (k === 'C' || k === 'clear') {
    S.kpRaw = '0';
  } else if (k === 'bksp') {
    S.kpRaw = S.kpRaw.length <= 1 ? '0' : S.kpRaw.slice(0, -1);
  } else {
    const next = (S.kpRaw === '0' ? '' : S.kpRaw) + k;
    S.kpRaw = next.slice(0, 9) || '0';
  }
  const num = parseInt(S.kpRaw, 10) || 0;
  if ($('kp-display'))  $('kp-display').textContent  = fmt(num);
  if ($('fee-preview')) $('fee-preview').textContent = num.toLocaleString('es-CO');
}

function kpOk() {
  const num = parseInt(S.kpRaw, 10) || 0;
  S.fee    = num;
  S.kpRaw  = '0';
  closeModal('modal-keypad');
  renderContextHeader();
}

function openKeypad() {
  S.kpRaw = S.fee ? String(S.fee) : '0';
  if ($('kp-display'))  $('kp-display').textContent  = fmt(S.fee);
  if ($('fee-preview')) $('fee-preview').textContent = S.fee.toLocaleString('es-CO');
  openModal('modal-keypad');
}

// ── Browser – catálogo ─────────────────────────────────────────────────
function renderCatGrid() {
  const el = $('cat-grid');
  if (!el) return;
  if (!S.cats.length) {
    el.innerHTML = `<div class="d-empty" style="grid-column:1/-1"><div class="d-empty-ic">${svgInline('bag', 28, 1.5)}</div><div style="font-size:13px;font-weight:600;color:var(--ink-2)">Sin categorías</div></div>`;
    return;
  }
  el.innerHTML = S.cats.map(c => {
    const color = c.color || '#5B6BFF';
    const count = S.products.filter(p => p.category_id === c.id).length;
    const thumb = `<span class="d-thumb-lbl">${c.name}</span>`;
    return `<button class="lm-cat" data-open-cat="${c.id}" style="border-color:${colorRing(color)}">
      <div class="d-thumb" style="height:108px">${thumb}</div>
      <div class="d-cat-foot">
        <div><div class="d-cat-name">${c.name}</div><div class="d-cat-count">${count} productos</div></div>
        <span class="d-cat-badge" style="color:${color};background:${colorTint(color)}">${svgInline('chevron', 14)}</span>
      </div></button>`;
  }).join('');
}

function openCat(catId) {
  const cat   = S.cats.find(c => c.id === catId);
  const prods = S.products.filter(p => p.category_id === catId);
  const color = (cat && cat.color) || '#5B6BFF';
  if ($('prod-catdot'))   $('prod-catdot').style.background = color;
  if ($('prod-catname'))  $('prod-catname').textContent     = cat ? cat.name : '—';
  if ($('prod-catcount')) $('prod-catcount').textContent    = prods.length;
  renderProdGrid($('prod-grid'), prods);
  if ($('cat-grid'))         $('cat-grid').hidden         = true;
  if ($('subview-products')) $('subview-products').hidden = false;
}

function renderProdGrid(el, prods) {
  if (!el) return;
  if (!prods.length) {
    el.innerHTML = `<div class="d-softempty" style="grid-column:1/-1"><div class="d-softempty-ic">${svgInline('bag', 24, 1.5)}</div><div style="font-size:13px;font-weight:600;color:var(--ink-2)">Sin productos</div></div>`;
    return;
  }
  el.innerHTML = prods.map(p => {
    const inCart = S.cart.find(i => i.id === p.id);
    const qty    = inCart ? inCart.qty : 0;
    const thumb  = p.photo_url
      ? `<img src="${p.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:9px">`
      : `<span class="d-thumb-lbl">${p.name}</span>`;
    return `<button class="lm-prod" data-add="${p.id}">
      <div style="position:relative">
        <div class="d-thumb" style="height:84px">${thumb}</div>

        ${qty > 0 ? `<span class="d-qty">${qty}</span>` : ''}
      </div>
      <div class="d-prod-foot">
        <div class="d-prod-name">${p.name}</div>
        <div class="d-prod-row"><span class="d-prod-price">${fmt(p.price)}</span><span class="d-add">${svgInline('plus', 14, 2.5)}</span></div>
      </div></button>`;
  }).join('');
}

function renderMenuPane() {
  const el = $('menu-scroll');
  if (!el) return;
  if (!S.cats.length) { el.innerHTML = `<div class="d-softempty" style="padding:24px;text-align:center;color:var(--muted)">Sin categorías</div>`; return; }
  el.innerHTML = S.cats.map(cat => {
    const prods = S.products.filter(p => p.category_id === cat.id);
    if (!prods.length) return '';
    const color = cat.color || '#5B6BFF';
    const rows = prods.map(p => {
      const inCart = S.cart.find(i => i.id === p.id);
      const qty    = inCart ? inCart.qty : 0;
      return `<button class="lm-menurow" data-add="${p.id}">
        <span class="d-menuqty" style="${qty > 0 ? '' : 'visibility:hidden'}">${qty}</span>
        <span style="flex:1;font-size:12.5px;font-weight:600;color:var(--ink)">${p.name}</span>

        <span style="font-size:13px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;margin-right:4px">${fmt(p.price)}</span>
        <span class="d-add-sm">${svgInline('plus', 13, 2.5)}</span>
        </button>`;
    }).join('');
    return `<div class="d-menugroup">
      <div class="d-menughead"><span class="d-catdot" style="background:${color}"></span><span class="d-menugname">${cat.name}</span><span class="d-menugrule"></span></div>
      <div class="d-menurows">${rows}</div></div>`;
  }).join('');
}

function renderFavPane() {
  const el    = $('fav-grid');
  const empty = $('fav-empty');
  if (!el) return;
  const favs = S.favorites;
  if (empty) empty.hidden = favs.length > 0;
  if (favs.length) {
    renderProdGrid(el, favs);
  } else {
    el.innerHTML = '';
  }
}

function renderBusqResults(q) {
  const grid  = $('busq-grid');
  const empty = $('busq-empty');
  if (!q.trim()) {
    if (grid)  grid.innerHTML = '';
    if (empty) empty.hidden   = true;
    return;
  }
  const results = S.products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  if (empty) empty.hidden = results.length > 0;
  if (results.length) renderProdGrid(grid, results);
  else if (grid) grid.innerHTML = '';
}

// ── Carrito ────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
// ── Modal flujo de producto — sistema pm-* (igual que tomar-pedido) ──
// ══════════════════════════════════════════════════════════════════════

const PM_SVG = {
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  back:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  cart:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  chev:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  plus:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  srch:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  food:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M5 2v20M17 2v20M21 7c0-3-2-5-4-5v9c2 0 4-1 4-4z"/></svg>',
  note:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
};
function pmFmt(n){ return '$'+Number(Math.round(n||0)).toLocaleString('es-CO'); }
function pmEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pmAttr(s){ return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

let WIP = { prod:null, step:1, pres:null, vars:{}, mods:{}, qty:1, note:'' };

function openProductModal(prodId) {
  const p = S.products.find(x=>x.id===prodId);
  if(!p) return;
  WIP = { prod:p, step:1, pres:null, vars:{}, mods:{}, qty:1, note:'' };
  const hasPres=(p.presentations||[]).length>1, hasVars=(p.variables||[]).length>0;
  if(!hasPres){
    const pArr=p.presentations||[];
    WIP.pres = pArr.length===1?pArr[0]:{id:'_base',name:'',price:parseFloat(p.price)||0};
    WIP.step = hasVars?2:3;
  }
  const el=document.getElementById('tp-modal-producto');
  if(el){ el.style.display='flex'; }
  tpRenderMP();
}

function mpComputePrice(){
  const p=WIP.prod, isMatrix=p&&p.price_mode==='matrix';
  let base;
  if(isMatrix){
    const presIdx=(p.presentations||[]).findIndex(pr=>pr.id===WIP.pres?.id);
    base=Object.values(WIP.vars).reduce((s,v)=>{
      let price=v.price||0;
      if(presIdx>=0){
        for(const vg of p.variables||[]){
          const o=(vg.options||[]).find(o=>o.id===v.id);
          if(o&&Array.isArray(o.prices)&&o.prices.length){price=o.prices[presIdx]||0;break;}
        }
      }
      return s+price;
    },0);
  } else {
    const baseP = p ? parseFloat(p.price)||0 : 0;
    base = WIP.pres ? (WIP.pres.price || baseP) : baseP;
    base += Object.values(WIP.vars).reduce((s,v)=>s+(v.price||0),0);
  }
  const modX=Object.values(WIP.mods).reduce((s,m)=>s+((m.price||0)*(m.qty||1)),0);
  return (base+modX)*WIP.qty;
}

function tpRenderMP(){
  const p=WIP.prod; if(!p) return;
  const inner=document.getElementById('pm-modal-inner'); if(!inner) return;
  const hasPres=(p.presentations||[]).length>1, hasVars=(p.variables||[]).length>0;
  const steps=[];
  if(hasPres) steps.push({id:'pres',label:p.presLabel||'Presentacion'});
  if(hasVars) steps.push({id:'var',label:p.varLabel||(p.variables[0]&&p.variables[0].name)||'Variante'});
  steps.push({id:'custom',label:'Personalizar'});
  const curId=WIP.step===1&&hasPres?'pres':WIP.step===2&&hasVars?'var':'custom';
  const curIdx=steps.findIndex(s=>s.id===curId);
  const stepperHTML=steps.length>1?'<div class="pm-steps">'+steps.map((s,i)=>{
    const done=i<curIdx,on=i===curIdx;
    return '<button class="pm-step'+(done?' done':on?' on':'')+'" data-step-id="'+s.id+'">'
      +'<span class="pm-step-dot">'+(done?PM_SVG.check:String(i+1))+'</span>'
      +'<span class="pm-step-lbl">'+s.label+'</span></button>'
      +(i<steps.length-1?'<span class="pm-step-line'+(done?' done':'')+'"></span>':'');
  }).join('')+'</div>':'';
  const presLabel=WIP.pres&&WIP.pres.name?WIP.pres.name:'';
  const varLabels=Object.values(WIP.vars).map(v=>v.name).join(' \xb7 ');
  const selParts=[presLabel,varLabels].filter(Boolean).join(' \xb7 ');
  let paneHTML='';
  if(curId==='pres') paneHTML=pmBuildPresPane(p);
  else if(curId==='var') paneHTML=pmBuildVarPane(p);
  else paneHTML=pmBuildCustomPane(p);
  const canNext=curId==='pres'?!!WIP.pres:curId==='var'?(p.variables||[]).every(v=>WIP.vars[v.id]):true;
  const isFirst=curIdx===0;
  const footLeft=isFirst
    ?'<button class="pm-btn-ghost" onclick="tpCloseMP()">Cancelar</button>'
    :'<button class="pm-btn-ghost" onclick="tpMPBack()">'+PM_SVG.back+' Atras</button>';
  const isLast=curId==='custom';
  const footRight=isLast
    ?'<button class="pm-btn-primary" onclick="tpMPAddToCart()">'+PM_SVG.cart+' Agregar al pedido \xb7 <span id="pm-foot-price">'+pmFmt(mpComputePrice())+'</span></button>'
    :'<button class="pm-btn-primary" id="tp-mp-next"'+(canNext?'':' disabled')+' onclick="tpMPAdvance()">Continuar '+PM_SVG.chev+'</button>';
  const subTxt=selParts?pmEsc(p.category||'')+' \xb7 <strong style="color:#0F172A">'+pmEsc(selParts)+'</strong>':pmEsc(p.category||'');
  inner.innerHTML=
    '<div class="pm-head">'
    +'<div style="display:flex;align-items:center;gap:12px;min-width:0">'
    +'<div class="pm-head-ic">'+PM_SVG.food+'</div>'
    +'<div style="min-width:0"><div class="pm-title">'+pmEsc(p.name)+'</div>'
    +'<div class="pm-sub">'+subTxt+'</div></div></div>'
    +'<button class="pm-close" onclick="tpCloseMP()">'+PM_SVG.x+'</button>'
    +'</div>'
    +stepperHTML
    +'<div class="pm-body">'+paneHTML+'</div>'
    +'<div class="pm-foot">'+footLeft+footRight+'</div>';
  pmAttachHandlers(inner,p,curId);
}

function pmBuildPresPane(p){
  const pres=p.presentations||[];
  const hasVars=(p.variables||[]).length>0;
  return '<div class="pm-choice-grid">'+pres.map(pr=>{
    const on=WIP.pres&&WIP.pres.id===pr.id;
    const priceLabel=hasVars?'Incluido':(pr.price?pmFmt(pr.price):'Incluido');
    const thumb=pr.photo_url
      ?'<div class="pm-choice-thumb pm-thumb-img"><img src="'+pmAttr(pr.photo_url)+'" alt="'+pmAttr(pr.name)+'" style="width:100%;height:100%;object-fit:cover;display:block"><div class="pm-thumb-overlay"><div class="pm-thumb-name">'+pmEsc(pr.name)+'</div><div class="pm-thumb-price">'+priceLabel+'</div></div></div>'
      :'<div class="pm-choice-thumb pm-thumb-ph"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
    return '<button class="pm-choice'+(on?' on':'')+'" data-pres-id="'+pmAttr(pr.id)+'" data-pres-name="'+pmAttr(pr.name)+'" data-pres-price="'+(pr.price||0)+'">'
      +thumb
      +(pr.photo_url?''  :'<div class="pm-choice-body"><div class="pm-choice-name">'+pmEsc(pr.name)+'</div>')
      +(pr.photo_url?''  :'<div class="pm-choice-price">'+priceLabel+'</div></div>')
      +'<span class="pm-radio">'+(on?PM_SVG.check:'')+'</span>'
      +'</button>';
  }).join('')+'</div>';
}

function pmBuildVarPane(p){
  const vars=p.variables||[];
  const isMatrix=p.price_mode==='matrix';
  const presIdx=(p.presentations||[]).findIndex(pr=>pr.id===WIP.pres?.id);
  return '<div style="display:flex;flex-direction:column;gap:20px">'+vars.map(v=>{
    return '<div><div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">'+pmEsc(v.name)+'</div>'
      +'<div class="pm-choice-grid">'+(v.options||[]).map(o=>{
        const sel=WIP.vars[v.id]&&WIP.vars[v.id].id===o.id;
        const optPrice=isMatrix&&Array.isArray(o.prices)&&presIdx>=0?(o.prices[presIdx]||0):o.price||0;
        const priceLabel=optPrice?(isMatrix?pmFmt(optPrice):'+'+pmFmt(optPrice)):'Incluido';
        return '<button class="pm-choice compact'+(sel?' on':'')+'" data-var-id="'+pmAttr(v.id)+'" data-opt-id="'+pmAttr(o.id)+'" data-opt-name="'+pmAttr(o.name)+'" data-opt-price="'+optPrice+'">'
          +'<div class="pm-choice-body"><div class="pm-choice-name">'+pmEsc(o.name)+'</div>'
          +'<div class="pm-choice-price">'+priceLabel+'</div></div>'
          +'<span class="pm-radio">'+(sel?PM_SVG.check:'')+'</span>'
          +'</button>';
      }).join('')+'</div></div>';
  }).join('')+'</div>';
}

function pmBuildCustomPane(p){
  const modGroups=(p.mod_group_ids||[]).map(gid=>(S.modGroups||[]).find(g=>g.id===gid)).filter(Boolean);
  const presLabel=WIP.pres&&WIP.pres.name?WIP.pres.name:'';
  const varLabels=Object.values(WIP.vars).map(v=>v.name).join(' \xb7 ');
  const selParts=[presLabel,varLabels].filter(Boolean);
  const photoHTML=p.photo_url
    ?'<div class="pm-photo"><img src="'+pmAttr(p.photo_url)+'" style="width:100%;height:100%;object-fit:cover"></div>'
    :'<div class="pm-photo pm-photo-ph"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
  const selSummary=selParts.length
    ?pmEsc(p.name)+' \xb7 <span class="sel">'+pmEsc(selParts.join(' \xb7 '))+'</span>'
    :pmEsc(p.name);
  const modSumTxt=Object.values(WIP.mods).filter(m=>m.qty>0).map(m=>m.qty>1?m.qty+'x '+m.name:m.name).join(', ')||'Sin adiciones seleccionadas';
  const groupsHTML=modGroups.length
    ?modGroups.map(g=>{
        const maxHint=g.multi?'Max. '+(g.options||[]).length:'Elige una';
        const optRows=(g.options||[]).map(o=>{
          const modEntry=WIP.mods[o.id]; const modQty=modEntry?(modEntry.qty||0):0;
          const grpOpts=(g.options||[]).map(opt=>opt.id);
          const totalGroupQty=grpOpts.reduce((s,oid)=>s+((WIP.mods[oid]&&WIP.mods[oid].qty)||0),0);
          const groupMax=g.multi?(g.max_total||(g.options||[]).length):1;
          const canInc=totalGroupQty<groupMax;
          return '<div class="pm-mod'+(modQty>0?' on':'')+'" data-mod-id="'+pmAttr(o.id)+'">'
            +'<div style="min-width:0;text-align:left;flex:1"><div class="pm-mod-name">'+pmEsc(o.name)+'</div>'
            +'<div class="pm-mod-price">'+(o.price?'+ '+pmFmt(o.price):'Gratis')+'</div></div>'
            +'<div class="pm-mod-qty-ctrl">'
            +'<button class="pm-mod-dec"'+(modQty<=0?' disabled="disabled"':'')+' data-mod-dec="'+pmAttr(o.id)+'">&#8722;</button>'
            +'<span class="pm-mod-qty-num">'+modQty+'</span>'
            +'<button class="pm-mod-inc"'+(!canInc?' disabled="disabled"':'')+' data-mod-inc="'+pmAttr(o.id)+'" data-mod-name="'+pmAttr(o.name)+'" data-mod-price="'+(o.price||0)+'">+</button>'
            +'</div></div>';
        }).join('');
        return '<div style="margin-top:14px">'
          +'<div class="pm-group-head"><span>'+pmEsc(g.name)+'</span><span class="pm-group-hint">'+maxHint+'</span></div>'
          +'<div class="pm-mods-grid">'+optRows+'</div></div>';
      }).join('')
    :'<div class="pm-nomods"><p>Sin adiciones disponibles para este producto.</p></div>';
  return '<div class="pm-custom">'
    +'<div class="pm-left">'
    +photoHTML
    +'<div class="pm-prodname">'+selSummary+'</div>'
    +'<div class="pm-modsum" id="pm-mod-sum">'+pmEsc(modSumTxt)+'</div>'
    +'<div class="pm-field-lbl">'+PM_SVG.note+' Nota para cocina</div>'
    +'<textarea class="pm-note" placeholder="Ej. caliente, con aji, sin salsa..." id="pm-note-input">'+pmEsc(WIP.note)+'</textarea>'
    +'</div>'
    +'<div class="pm-right">'
    +'<div class="pm-qty-row">'
    +'<div style="display:flex;align-items:center;gap:12px">'
    +'<span style="font-size:13px;font-weight:600;color:#475569">Cantidad</span>'
    +'<div class="pm-stepper"><button id="pm-qty-dec">'+PM_SVG.minus+'</button>'
    +'<span id="pm-qty-val">'+WIP.qty+'</span>'
    +'<button id="pm-qty-inc">'+PM_SVG.plus+'</button></div></div>'
    +'<div style="text-align:right"><div class="pm-pf-lbl">Precio del producto</div>'
    +'<div class="pm-pf-val" id="pm-price-val">'+pmFmt(mpComputePrice())+'</div></div></div>'
    +'<div class="pm-search">'+PM_SVG.srch+'<input placeholder="Buscar adiciones..." id="pm-search-inp"></div>'
    +groupsHTML
    +'</div></div>';
}

function pmAttachHandlers(inner,p,curId){
  inner.querySelectorAll('.pm-step.done').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const sid=btn.dataset.stepId;
      WIP.step=sid==='pres'?1:sid==='var'?2:3;
      tpRenderMP();
    });
  });
  if(curId==='pres'){
    inner.querySelectorAll('.pm-choice[data-pres-id]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const id=btn.dataset.presId,name=btn.dataset.presName,price=+btn.dataset.presPrice;
        WIP.pres={id,name,price};
        inner.querySelectorAll('.pm-choice[data-pres-id]').forEach(b=>{
          const on=b.dataset.presId===id;
          b.classList.toggle('on',on);
          b.querySelector('.pm-radio').innerHTML=on?PM_SVG.check:'';
        });
        const nb=document.getElementById('tp-mp-next'); if(nb) nb.disabled=false;
      });
    });
  }
  if(curId==='var'){
    inner.querySelectorAll('.pm-choice[data-var-id]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const vid=btn.dataset.varId,oid=btn.dataset.optId,oname=btn.dataset.optName,oprice=+btn.dataset.optPrice;
        WIP.vars[vid]={id:oid,name:oname,price:oprice};
        inner.querySelectorAll('.pm-choice[data-var-id="'+vid+'"]').forEach(b=>{
          const on=b.dataset.optId===oid;
          b.classList.toggle('on',on);
          b.querySelector('.pm-radio').innerHTML=on?PM_SVG.check:'';
        });
        const allDone=(p.variables||[]).every(v=>WIP.vars[v.id]);
        const nb=document.getElementById('tp-mp-next'); if(nb) nb.disabled=!allDone;
      });
    });
  }
  if(curId==='custom'){
    const qdec=document.getElementById('pm-qty-dec'),qinc=document.getElementById('pm-qty-inc');
    if(qdec) qdec.addEventListener('click',()=>{ WIP.qty=Math.max(1,WIP.qty-1); pmUpdatePrices(); });
    if(qinc) qinc.addEventListener('click',()=>{ WIP.qty++; pmUpdatePrices(); });
    const noteEl=document.getElementById('pm-note-input');
    if(noteEl){ noteEl.value=WIP.note; noteEl.addEventListener('input',function(){ WIP.note=this.value; }); }
    inner.querySelectorAll("[data-mod-inc]").forEach(function(incBtn){
      incBtn.addEventListener("click",function(e){
        e.stopPropagation();
        var id=incBtn.dataset.modInc, mname=incBtn.dataset.modName, price=parseFloat(incBtn.dataset.modPrice)||0;
        var g=(p.mod_group_ids||[]).map(function(gid){return (S.modGroups||[]).find(function(g){return g.id===gid;});}).filter(Boolean)
                 .find(function(g){return (g.options||[]).some(function(o){return o.id===id;});});
        var groupMax=g?(g.max_total||(g.options||[]).length):999;
        var grpOpts=g?(g.options||[]).map(function(o){return o.id;})  :[];
        var totalGroupQty=grpOpts.reduce(function(s,oid){return s+((WIP.mods[oid]&&WIP.mods[oid].qty)||0);},0);
        if(totalGroupQty>=groupMax) return;
        if(!WIP.mods[id]) WIP.mods[id]={name:mname,price:price,qty:0};
        WIP.mods[id].qty=(WIP.mods[id].qty||0)+1;
        pmSyncModUI(inner,p);
        pmUpdatePrices();
        var ms=document.getElementById("pm-mod-sum");
        if(ms) ms.textContent=Object.values(WIP.mods).filter(function(m){return m.qty>0;}).map(function(m){return m.qty>1?m.qty+"x "+m.name:m.name;}).join(", ")||"Sin adiciones seleccionadas";
      });
    });
    inner.querySelectorAll("[data-mod-dec]").forEach(function(decBtn){
      decBtn.addEventListener("click",function(e){
        e.stopPropagation();
        var id=decBtn.dataset.modDec;
        if(!WIP.mods[id]||WIP.mods[id].qty<=0) return;
        WIP.mods[id].qty--;
        if(WIP.mods[id].qty<=0) delete WIP.mods[id];
        pmSyncModUI(inner,p);
        pmUpdatePrices();
        var ms=document.getElementById("pm-mod-sum");
        if(ms) ms.textContent=Object.values(WIP.mods).filter(function(m){return m.qty>0;}).map(function(m){return m.qty>1?m.qty+"x "+m.name:m.name;}).join(", ")||"Sin adiciones seleccionadas";
      });
    });
    const sinp=document.getElementById('pm-search-inp');
    if(sinp) sinp.addEventListener('input',function(){
      const q=this.value.toLowerCase().trim();
      inner.querySelectorAll('.pm-mod').forEach(b=>{
        const nm=b.querySelector('.pm-mod-name')?b.querySelector('.pm-mod-name').textContent.toLowerCase():'';
        b.style.display=q&&!nm.includes(q)?'none':'';
      });
    });
  }
}

function pmSyncModUI(inner,p){
  inner.querySelectorAll('[data-mod-id]').forEach(function(div){
    var id=div.dataset.modId;
    var entry=WIP.mods[id];
    var qty=entry?(entry.qty||0):0;
    div.classList.toggle('on',qty>0);
    var numEl=div.querySelector('.pm-mod-qty-num');
    if(numEl) numEl.textContent=qty;
    var decBtn=div.querySelector('[data-mod-dec]');
    if(decBtn) decBtn.disabled=qty<=0;
    var incBtn=div.querySelector('[data-mod-inc]');
    if(incBtn){
      var g=(p.mod_group_ids||[]).map(function(gid){return (S.modGroups||[]).find(function(g){return g.id===gid;});}).filter(Boolean)
                .find(function(g){return (g.options||[]).some(function(o){return o.id===id;});});
      var groupMax=g?(g.max_total||(g.options||[]).length):999;
      var grpOpts=g?(g.options||[]).map(function(o){return o.id;})  :[];
      var totalGroupQty=grpOpts.reduce(function(s,oid){return s+((WIP.mods[oid]&&WIP.mods[oid].qty)||0);},0);
      incBtn.disabled=totalGroupQty>=groupMax;
    }
  });
}

function pmUpdatePrices(){
  const p=document.getElementById('pm-price-val'); if(p) p.textContent=pmFmt(mpComputePrice());
  const f=document.getElementById('pm-foot-price'); if(f) f.textContent=pmFmt(mpComputePrice());
  const q=document.getElementById('pm-qty-val'); if(q) q.textContent=WIP.qty;
}

function tpCheckOverlayClose(e){ if(e.target===e.currentTarget) tpCloseMP(); }

function tpMPAdvance(){
  const p=WIP.prod, hasVars=(p.variables||[]).length>0;
  if(WIP.step===1){WIP.step=hasVars?2:3;}else if(WIP.step===2){WIP.step=3;}
  tpRenderMP();
}

function tpMPBack(){
  const p=WIP.prod, hasPres=(p.presentations||[]).length>1, hasVars=(p.variables||[]).length>0;
  if(WIP.step===3){WIP.step=hasVars?2:(hasPres?1:3);}else if(WIP.step===2){WIP.step=hasPres?1:2;}
  tpRenderMP();
}

function tpCloseMP(){
  const el=document.getElementById('tp-modal-producto'); if(el) el.style.display='none';
}

function tpMPAddToCart(){
  const p=WIP.prod;
  const cat=S.cats.find(c=>c.id===p.category_id);
  const unitPrice=mpComputePrice()/WIP.qty;
  const presLabel=WIP.pres&&WIP.pres.name?WIP.pres.name:'';
  const varLabels=Object.values(WIP.vars).map(v=>v.name).join(' \xb7 ');
  const displayName=[p.name,presLabel,varLabels].filter(Boolean).join(' \xb7 ');
  const modSummary=Object.values(WIP.mods).filter(m=>m.qty>0).map(m=>(m.qty>1?m.qty+'x ':'')+m.name).join(', ');
  const lineId='li_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  S.cart.push({
    lineId, id:p.id, name:displayName, price:unitPrice, qty:WIP.qty,
    catName:cat?cat.name:'', catColor:(cat&&cat.color)||'#94A3B8',
    note:WIP.note||'', modSummary,
    pres:WIP.pres, vars:{...WIP.vars}, mods:{...WIP.mods},
  });
  tpCloseMP();
  renderCart(); renderDetBtn(); refreshBrowserQtys();
  toast('Agregado: '+p.name);
}

function addToCart(id) {
  openProductModal(id);
}

function updateQty(id, delta) {
  const idx = S.cart.findIndex(i => (i.lineId||i.id) === id);
  if (idx === -1) return;
  S.cart[idx].qty += delta;
  if (S.cart[idx].qty <= 0) S.cart.splice(idx, 1);
  renderCart();
  renderDetBtn();
  refreshBrowserQtys();
}

function clearCart() {
  S.cart = [];
  renderCart();
  renderDetBtn();
  refreshBrowserQtys();
}

function refreshBrowserQtys() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    const id   = btn.dataset.add;
    const item = S.cart.find(i => i.id === id);
    const qty  = item ? item.qty : 0;

    // card badge
    let qtyEl = btn.querySelector('.d-qty');
    if (qty > 0) {
      if (!qtyEl) {
        const rel = btn.querySelector('[style*="position:relative"]');
        if (rel) {
          qtyEl = document.createElement('span');
          qtyEl.className = 'd-qty';
          rel.appendChild(qtyEl);
        }
      }
      if (qtyEl) qtyEl.textContent = qty;
    } else {
      if (qtyEl) qtyEl.remove();
    }

    // menu row badge
    const mqty = btn.querySelector('.d-menuqty');
    if (mqty) {
      mqty.textContent = qty;
      mqty.style.visibility = qty > 0 ? 'visible' : 'hidden';
    }
  });
}

function renderCart() {
  const lines = $('cart-lines');
  const lbl   = $('cart-count-lbl');
  if (!lines) return;

  const prod  = computeProductsTotal();

  if (!S.cart.length) {
    lines.innerHTML = `<div class="d-empty" id="cart-empty">
      <div class="d-empty-ic">${svgInline('bag', 28, 1.5)}</div>
      <div style="font-size:13px;font-weight:600;color:var(--ink-2)">Sin productos aún</div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:4px">Selecciona del catálogo</div></div>`;
    if (lbl) lbl.textContent = 'Pedido · 0 ítems';
    renderTotals();
    return;
  }

  const totalItems = S.cart.reduce((a, i) => a + i.qty, 0);
  if (lbl) lbl.textContent = `Pedido · ${totalItems} ítem${totalItems !== 1 ? 's' : ''}`;

  lines.innerHTML = S.cart.map(item => {
    const lineTotal   = item.price * item.qty;
    const iconDec = item.qty === 1 ? svgInline('trash', 12) : svgInline('minus', 12);
    return `<div class="d-cartline" data-line="${item.lineId||item.id}">
      <div style="flex:1;min-width:0">
        <div class="d-cl-name">${item.name}</div>
        <div class="d-cl-meta"><span class="dot" style="background:${item.catColor}"></span><span class="txt">${item.catName} · ${fmt(item.price)}</span></div>
        ${item.modSummary ? `<div class="d-cl-mods">${item.modSummary}</div>` : ''}
        ${item.note ? `<div class="d-cl-note">📝 ${item.note}</div>` : ''}
      </div>
      <div class="d-line-step">
        <button class="lm-step sm" data-dec="${item.lineId||item.id}">${iconDec}</button>
        <span class="num">${item.qty}</span>
        <button class="lm-step sm" data-inc="${item.lineId||item.id}">${svgInline('plus', 12)}</button>
      </div>
      <div class="d-cl-total">${fmt(lineTotal)}</div></div>`;
  }).join('');

  if ($('total-productos')) $('total-productos').textContent = fmt(prod);
  renderTotals();
}

// ── Dinero ─────────────────────────────────────────────────────────────
function computeProductsTotal() {
  return S.cart.reduce((a, i) => a + i.price * i.qty, 0);
}

// Costo de empaque para DOMICILIO (config de Operación en pos.config.operacion.v1).
// Se cobra automáticamente en pedidos a domicilio (antes solo se aplicaba en mesas).
// Respeta: canal (mismo/distinto → tarifa de domicilio), tipo (fijo/porcentaje),
// base (unidad/pedido).
function computeEmpaque() {
  try {
    const cfg = JSON.parse(localStorage.getItem('pos.config.operacion.v1') || '{}');
    if (!cfg.empaquesActivo) return 0;
    const prod = computeProductsTotal();
    if (prod <= 0) return 0;
    const usaDomi = cfg.empaqueCanal === 'distinto';
    const esPct   = cfg.empaqueTipo === 'porcentaje';
    const rate = esPct
      ? (usaDomi ? (cfg.empaquePctDomicilio || 0)   : (cfg.empaquePct   || 0))
      : (usaDomi ? (cfg.empaqueMontoDomicilio || 0) : (cfg.empaqueMonto || 0));
    if (cfg.empaqueBase === 'pedido') {
      return esPct ? Math.round(prod * rate / 100) : rate;
    }
    const units = S.cart.reduce((a, i) => a + i.qty, 0);
    return esPct ? Math.round(prod * rate / 100) : rate * units;
  } catch(e) { return 0; }
}

// Retorna { cobrar, ingreso, feeLabel, feeShown, feeMuted, gasto, mode }
// mode: 'interno' | 'ext-cobra' | 'ext-directo'
function computeMoney() {
  const prod    = computeProductsTotal();
  const emp     = computeEmpaque();
  const fee     = S.fee;
  const courier = S.courier;
  const cobra   = S.cobramos;

  if (courier === 'interno') {
    return { cobrar: prod + emp + fee, ingreso: prod + emp + fee, empaque: emp, feeLabel: 'Domicilio', feeShown: fee, feeMuted: false, gasto: 0, mode: 'interno' };
  }
  if (cobra) {
    return { cobrar: prod + emp + fee, ingreso: prod + emp, empaque: emp, feeLabel: 'Domicilio (externo)', feeShown: fee, feeMuted: false, gasto: fee, mode: 'ext-cobra' };
  }
  return { cobrar: prod + emp, ingreso: prod + emp, empaque: emp, feeLabel: 'Domicilio (lo paga el cliente)', feeShown: fee, feeMuted: true, gasto: 0, mode: 'ext-directo' };
}

function renderTotals() {
  const M = computeMoney();
  if ($('total-productos')) $('total-productos').textContent = fmt(M.ingreso > 0 ? computeProductsTotal() : 0);
  const _empRow = $('trow-empaque'), _empSpan = $('total-empaque');
  if (_empRow && _empSpan) {
    if (M.empaque > 0) { _empRow.hidden = false; _empSpan.textContent = fmt(M.empaque); }
    else _empRow.hidden = true;
  }
  if ($('total-domicilio')) {
    const trow = $('trow-domicilio');
    const span = $('total-domicilio');
    const lbl  = trow && trow.querySelector('span');
    if (lbl) lbl.textContent = M.feeLabel;
    if (span) {
      span.textContent = M.feeMuted ? `(${fmt(M.feeShown)})` : fmt(M.feeShown);
      span.style.textDecoration = M.feeMuted ? 'line-through' : '';
      span.style.color          = M.feeMuted ? 'var(--muted)'  : '';
    }
  }
  if ($('total-grand')) $('total-grand').textContent = fmt(M.cobrar);
  const _cliRow  = $('trow-total-cliente');
  const _cliSpan = $('total-cliente');
  if (_cliRow && _cliSpan) {
    if (M.mode === 'ext-directo' && M.feeShown > 0) {
      _cliSpan.textContent = fmt(computeProductsTotal() + M.feeShown);
      _cliRow.hidden = false;
    } else {
      _cliRow.hidden = true;
    }
  }

  // Nota de dinero — toggleable, arranca oculta
  const noteArea  = $('money-note-area');
  const infoBtn   = $('btn-money-info');
  if (!noteArea) return;

  if (M.mode === 'ext-directo') {
    noteArea.dataset.note = `<div class="d-moneynote warn"><span class="ic">${svgInline('alert', 14)}</span><span>El domicilio <b>${fmt(M.feeShown)}</b> lo paga el cliente directamente al repartidor externo. <b>No entra como ingreso nuestro.</b></span></div>`;
    if (infoBtn) { infoBtn.hidden = false; infoBtn.classList.add('warn'); infoBtn.classList.remove('info'); }
  } else if (M.mode === 'ext-cobra') {
    noteArea.dataset.note = `<div class="d-moneynote info"><span class="ic">${svgInline('transfer', 14)}</span><span>Cobramos <b>${fmt(M.cobrar)}</b> (incluye domicilio). El domicilio <b>${fmt(M.feeShown)}</b> se le paga al repartidor en efectivo → venta neta <b>${fmt(M.ingreso)}</b>.</span></div>`;
    if (infoBtn) { infoBtn.hidden = false; infoBtn.classList.add('info'); infoBtn.classList.remove('warn'); }
  } else {
    noteArea.dataset.note = '';
    noteArea.innerHTML = '';
    if (infoBtn) { infoBtn.hidden = true; infoBtn.classList.remove('warn','info'); }
    noteArea.dataset.open = 'false';
  }
}

// ── Botón resumen "Detalles del domicilio" ─────────────────────────────
function renderDetBtn() {
  const btn      = $('detbtn');
  const statusEl = $('detbtn-status');
  const chipsEl  = $('detbtn-chips');
  if (!btn) return;

  const recogo     = S.modalidad === 'recogo';
  const externo    = S.courier   === 'externo';
  const extDirecto = externo && !S.cobramos;
  const hasCliente = !!S.cliente;
  const hasDir     = recogo || !S.cliente || !!S.cliente.dir; // recogo no necesita dir
  const courierOk  = recogo || externo || !!S.asignado;
  const incompleto = !hasCliente || !courierOk || !hasDir;

  btn.className = 'd-detbtn' + (incompleto ? ' warn' : '');

  // Badge compacto
  statusEl.innerHTML = incompleto
    ? `<span class="d-detbtn-alert">${svgInline('alert', 10)} Incompleto</span>${svgInline('chevron', 12)}`
    : `<span class="d-detbtn-ok">${svgInline('check', 10)} Listo</span>${svgInline('chevron', 12)}`;

  // Chips compactos
  const dm = S.domiciliarios.find(x => S.asignado && x.id === S.asignado);
  const chips = [];

  // Cliente
  chips.push(`<span class="d-detbtn-chip${hasCliente ? '' : ' miss'}">${svgInline('user', 10)}${S.cliente ? S.cliente.nombre : 'Sin cliente'}</span>`);

  // Dirección faltante (naranja urgente)
  if (S.cliente && !S.cliente.dir && !recogo) {
    chips.push(`<span class="d-detbtn-chip miss">${svgInline('mappin', 10)} Sin dirección</span>`);
  }

  // Courier
  const courierTxt = recogo ? 'Recogo en tienda'
    : externo ? (S.cobramos ? 'Ext · cobramos' : 'Ext · cliente paga')
    : (dm ? dm.nombre : 'Sin domiciliario');
  chips.push(`<span class="d-detbtn-chip${courierOk ? '' : ' miss'}">${svgInline(externo ? 'truck' : recogo ? 'store' : 'scooter', 10)}${courierTxt}</span>`);

  // Pago (solo si no es externo directo, ya se entiende)
  if (!extDirecto) {
    const pagoTxt = S.pago.status === 'pagado'
      ? `Pagado · ${S.pago.metodo}`
      : `Por pagar · ${S.pago.metodo}`;
    chips.push(`<span class="d-detbtn-chip">${svgInline(S.pago.status === 'pagado' ? 'check' : 'clock', 10)}${pagoTxt}</span>`);
  }

  chipsEl.innerHTML = chips.join('');

  // Enviar button
  const btnEnviar = $('btn-enviar');
  if (btnEnviar) {
    const count    = S.cart.reduce((a, x) => a + x.qty, 0);
    const needAsig = !recogo && !externo;
    const canSend  = count > 0 && hasCliente && hasDir && (!needAsig || !!S.asignado);
    btnEnviar.disabled = !canSend;
  }
}

// ── Cliente card ───────────────────────────────────────────────────────
function renderClienteCard() {
  const el = $('cliente-card');
  if (!el) return;
  if (!S.cliente) {
    el.innerHTML = `<button class="d-cliente" data-open-cliente>
      <span class="d-cli-avatar">${svgInline('user', 18)}</span>
      <span class="d-cli-empty">Seleccionar cliente</span>
      ${svgInline('chevron', 15)}</button>`;
    return;
  }
  const c   = S.cliente;
  const ini = initials(c.nombre);
  el.innerHTML = `<div class="d-cliente has">
    <span class="d-cli-avatar">${ini}</span>
    <div style="flex:1;min-width:0">
      <div class="d-cli-name">${c.nombre}</div>
      <div class="d-cli-meta"><span class="ic">${svgInline('phone', 12)}</span>${c.tel || 'Sin teléfono'}</div>
      <div class="d-cli-addr"><span style="color:var(--faint);flex-shrink:0;margin-top:1px">${svgInline('mappin', 12)}</span>${c.dir || 'Sin dirección'}</div>
    </div>
    <button class="lm-icon-sm" data-edit-cliente>${svgInline('edit', 14)}</button>
    </div>`;
}

// ── Asig list ──────────────────────────────────────────────────────────
function renderAsigList() {
  const el = $('asig-list');
  if (!el) return;
  if (!S.domiciliarios.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px 16px;color:#94A3B8;font-size:13px">
      ${svgInline('scooter', 28)}<br>
      <span style="display:block;margin-top:8px;font-weight:600;color:#CBD5E1">Sin domiciliarios configurados</span>
      <span style="display:block;margin-top:4px">Ve a Configuración > Usuarios y roles<br>y crea un usuario con rol <b>Domiciliario</b>.</span>
    </div>`;
    return;
  }
  el.innerHTML = S.domiciliarios.map(dm => {
    const isOn    = S.asignado === dm.id;
    const statusOk = dm.estado === 'Disponible';
    return `<button class="d-asig${isOn ? ' on' : ''}" data-asignar="${dm.id}">
      <span class="d-asig-av">${initials(dm.nombre)}</span>
      <span style="flex:1;min-width:0;text-align:left">
        <span class="d-asig-name">${dm.nombre}</span>
        <span class="d-asig-sub">${svgInline('phone', 10)} ${dm.tel}<span class="d-asig-est${statusOk ? ' ok' : ''}">${dm.estado}</span></span>
      </span>
      <span class="d-radio"></span></button>`;
  }).join('');
}

// ── Courier toggle ─────────────────────────────────────────────────────
function toggleCourier() {
  S.courier = S.courier === 'interno' ? 'externo' : 'interno';
  const sw  = $('courier-switch');
  const row = $('courier-row');
  const lbl = $('courier-label');
  const sub = $('courier-sub');
  const ext = S.courier === 'externo';
  if (sw)  { sw.classList.toggle('on', ext); sw.setAttribute('aria-pressed', ext); }
  if (row) row.classList.toggle('on', ext);
  if (lbl) lbl.textContent = ext ? 'Domiciliario externo' : 'Domiciliario interno';
  if (sub) sub.textContent = ext ? 'Reparte una empresa externa' : 'Reparte un domiciliario de El Parche';

  const panesInt = document.querySelector('[data-courier-pane="interno"]');
  const panesExt = document.querySelector('[data-courier-pane="externo"]');
  if (panesInt) panesInt.hidden = ext;
  if (panesExt) panesExt.hidden = !ext;

  if (!ext) S.cobramos = false;
  const pagoBlock = $('pago-block');
  if (pagoBlock) pagoBlock.hidden = ext;
  renderDetBtn();
  renderTotals();
}

// ── Clientes – lista ───────────────────────────────────────────────────
function renderCliList(q) {
  const el = $('cli-list');
  if (!el) return;
  const lq   = (q || '').trim().toLowerCase();
  const list = lq
    ? S.clientes.filter(c => (c.nombre + ' ' + (c.tel || '') + ' ' + (c.dir || '')).toLowerCase().includes(lq))
    : S.clientes;

  if (!list.length) {
    el.innerHTML = `<div class="d-softempty"><div class="d-softempty-ic">${svgInline('user', 20)}</div><div style="font-size:13px;font-weight:700">Sin coincidencias</div></div>`;
    return;
  }
  el.innerHTML = list.map(c => {
    const ini = initials(c.nombre);
    return `<button class="d-clirow" data-cliente="${c.id}">
      <span class="d-cli-avatar">${ini}</span>
      <span class="d-clirow-main">
        <span class="d-clirow-name">${c.nombre}</span>
        <span class="d-clirow-sub">${svgInline('phone', 11)} ${c.tel || '—'} <span class="d-cl-meta" style="margin:0">·</span> ${svgInline('mappin', 11)} ${c.dir || 'Sin dirección'}</span>
      </span>
      <span class="d-clirow-edit" data-edit="${c.id}">${svgInline('edit', 13)} Editar</span></button>`;
  }).join('');
}

// ── Nuevo / Editar cliente ─────────────────────────────────────────────
function openNuevoCli(editId) {
  S.editCliId = editId || null;
  const title = $('nuevocli-title');
  if (title) title.textContent = editId ? 'Editar cliente' : 'Nuevo cliente';

  if (editId) {
    // Descomponer nombre en partes para los campos separados del HTML
    const c = S.clientes.find(x => x.id === editId);
    if (c) {
      const parts    = (c.nombre || '').trim().split(/\s+/);
      const nombres  = parts.slice(0, 1).join(' ');
      const apellidos= parts.slice(1).join(' ');
      if ($('cli-nombres'))   $('cli-nombres').value   = nombres;
      if ($('cli-apellidos')) $('cli-apellidos').value = apellidos;
      if ($('cli-telefono'))  $('cli-telefono').value  = c.tel    || '';
      if ($('cli-barrio'))    $('cli-barrio').value    = c.barrio || '';
      if ($('cli-direccion')) $('cli-direccion').value = c.dir    || '';
      if ($('cli-tipdoc'))    $('cli-tipdoc').value    = c.tipdoc || 'CC';
      if ($('cli-numdoc'))    $('cli-numdoc').value    = c.numdoc || '';
      if ($('cli-email'))     $('cli-email').value     = c.email  || '';
      if ($('cli-notas'))     $('cli-notas').value     = c.notas  || '';
    }
  } else {
    ['cli-nombres','cli-apellidos','cli-telefono','cli-barrio','cli-direccion','cli-numdoc','cli-email','cli-notas'].forEach(id => {
      if ($(id)) $(id).value = '';
    });
    if ($('cli-tipdoc')) $('cli-tipdoc').value = 'CC';
  }

  // Reset a tab básico
  document.querySelectorAll('[data-clitab]').forEach(b => b.classList.toggle('on', b.dataset.clitab === 'basico'));
  document.querySelectorAll('[data-clipane]').forEach(p => { p.hidden = (p.dataset.clipane !== 'basico'); });

  closeModal('modal-cliente');
  openModal('modal-nuevocli');
}

function guardarCliente() {
  const nombres   = ($('cli-nombres')   && $('cli-nombres').value   || '').trim();
  const apellidos = ($('cli-apellidos') && $('cli-apellidos').value || '').trim();
  const telefono  = ($('cli-telefono')  && $('cli-telefono').value  || '').trim();
  const barrio    = ($('cli-barrio')    && $('cli-barrio').value    || '').trim();
  const direccion = ($('cli-direccion') && $('cli-direccion').value || '').trim();

  if (!nombres) { alert('El nombre es obligatorio.'); return; }

  const nombre = (nombres + (apellidos ? ' ' + apellidos : '')).trim();

  if (S.editCliId) {
    const idx = S.clientes.findIndex(c => c.id === S.editCliId);
    if (idx !== -1) {
      Object.assign(S.clientes[idx], {
        nombre,
        tel:    telefono,
        barrio,
        dir:    direccion,
        tipdoc: ($('cli-tipdoc') && $('cli-tipdoc').value || '').trim(),
        numdoc: ($('cli-numdoc') && $('cli-numdoc').value || '').trim(),
        email:  ($('cli-email')  && $('cli-email').value  || '').trim(),
        notas:  ($('cli-notas')  && $('cli-notas').value  || '').trim(),
      });
      // Actualizar el cliente seleccionado si es el mismo
      if (S.cliente && S.cliente.id === S.editCliId) S.cliente = S.clientes[idx];
    }
  } else {
    const newCli = {
      id:     'c' + Date.now(),
      nombre,
      tel:    telefono,
      barrio,
      dir:    direccion,
      tipdoc: ($('cli-tipdoc') && $('cli-tipdoc').value || '').trim(),
      numdoc: ($('cli-numdoc') && $('cli-numdoc').value || '').trim(),
      email:  ($('cli-email')  && $('cli-email').value  || '').trim(),
      notas:  ($('cli-notas')  && $('cli-notas').value  || '').trim(),
    };
    S.clientes.unshift(newCli);
    S.cliente = newCli;
  }

  localStorage.setItem('pos.clientes', JSON.stringify(S.clientes));
  closeModal('modal-nuevocli');
  renderCliList('');
  renderClienteCard();
  renderDetBtn();
  toast('Cliente guardado');
}

// ── Enviar a cocina ────────────────────────────────────────────────────
function canEnviar() {
  const count    = S.cart.reduce((a, x) => a + x.qty, 0);
  const recogo   = S.modalidad === 'recogo';
  const externo  = S.courier === 'externo';
  const needAsig = !recogo && !externo;
  return count > 0 && !!S.cliente && (!needAsig || !!S.asignado);
}

async function enviarACocina() {
  if (!canEnviar()) {
    const count = S.cart.reduce((a, x) => a + x.qty, 0);
    if (count === 0)    { toast('Agrega productos al pedido'); return; }
    if (!S.cliente)     { toast('Selecciona un cliente');      return; }
    toast('Asigna un domiciliario');
    return;
  }

  const prod      = computeProductsTotal();
  const count     = S.cart.reduce((a, x) => a + x.qty, 0);
  const id        = 'D-' + Date.now().toString().slice(-5);
  const externo   = S.courier === 'externo';
  const extCobra  = externo && S.cobramos;
  const extDirect = externo && !S.cobramos;

  // Coherencia pago según modo (igual que la lógica JSX)
  const payWhen  = extCobra ? 'adelantado'    : S.pago.when;
  const metodo   = extCobra ? 'transferencia' : S.pago.metodo;
  const payStatus = extDirect ? 'externo'     : S.pago.status;

  const dm = S.domiciliarios.find(x => x.id === S.asignado);

  const nuevo = {
    id,
    cliente:      S.cliente.nombre,
    canal:        S.canal,
    items:        count,
    productos:    prod,
    fee:          S.fee,
    estado:       'recibido',
    payStatus,
    payWhen,
    metodo,
    courier:      S.courier,
    cobramos:     S.cobramos,
    domiciliario: externo ? 'Externo' : (dm ? dm.nombre : '—'),
    min:          0,
    createdAt:    Date.now(),
  };

  // Capturar datos para insert ANTES del reset de estado
  const _cartSnapshot = S.cart.map(function(it){ return Object.assign({}, it); });
  const _barrio  = S.cliente && S.cliente.barrio ? S.cliente.barrio.trim() : '';
  const _dir     = S.cliente && S.cliente.dir ? S.cliente.dir.trim() : '';
  const _tel     = S.cliente && S.cliente.tel ? S.cliente.tel.trim() : '';
  const _empaque = computeEmpaque();

  S.deliveries.unshift(nuevo);

  // Reset pedido
  S.cart     = [];
  S.cliente  = null;
  S.asignado = null;
  S.courier  = 'interno';
  S.cobramos = false;
  S.pago     = { when: 'contraentrega', status: 'pendiente', metodo: 'efectivo' };

  renderCart();
  renderClienteCard();
  renderDetBtn();
  renderContextHeader();
  renderAsigList();
  refreshBrowserQtys();
  renderMonitor();
  updateMonitorBadge();

  // Resetear courier UI
  const sw  = $('courier-switch');
  const row = $('courier-row');
  const lbl = $('courier-label');
  const sub = $('courier-sub');
  if (sw)  { sw.classList.remove('on'); sw.setAttribute('aria-pressed', 'false'); }
  if (row) row.classList.remove('on');
  if (lbl) lbl.textContent = 'Domiciliario interno';
  if (sub) sub.textContent = 'Reparte un domiciliario de El Parche';
  const panesInt = document.querySelector('[data-courier-pane="interno"]');
  const panesExt = document.querySelector('[data-courier-pane="externo"]');
  if (panesInt) panesInt.hidden = false;
  if (panesExt) panesExt.hidden = true;

  // Resetear cobro opts
  document.querySelectorAll('[data-cobro]').forEach(b => b.classList.toggle('on', b.dataset.cobro === 'cliente'));

  // Resetear pago segs
  document.querySelectorAll('[data-when]').forEach(b => b.classList.toggle('on', b.dataset.when === 'contraentrega'));
  document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('on', b.dataset.status === 'pendiente'));
  document.querySelectorAll('[data-metodo]').forEach(b => b.classList.toggle('on', b.dataset.metodo === 'efectivo'));

  flipToPedido();

  // Guardar en Supabase — mismo patrón que tomar-pedido.js saveOrder()
  try {
    const _orderData = {
      tenant_id:      S.tenantId,
      branch_id:      S.branchId,
      waiter_id:      S.userId,
      waiter_name:    S.waiterName || null,
      channel:        'domicilio',
      status:         'open',
      customer_name:  nuevo.cliente || null,
      // notas = dirección + [barrio:X] (la comanda lo lee) + [tel:Y] (para el recibo)
      notes:          ((_dir ? _dir + ' ' : '') + (_barrio ? '[barrio:' + _barrio.toUpperCase() + ']' : '') + (_tel ? ' [tel:' + _tel + ']' : '')).trim() || null,
      // El total INCLUYE productos + empaque + domicilio
      subtotal:       prod,
      packaging_fee:  _empaque,
      total:          prod + _empaque + (S.fee || 0),
      delivery_fee:   S.fee || 0,
      delivery_status:'recibido',
      payment_method: metodo,
      opened_at:      new Date().toISOString(),
    };
    const { data: _saved, error: _err } = await sb.from('pos_orders').insert(_orderData).select().single();
    if (_err) throw _err;
    const _oid = _saved.id;
    const _itemsData = _cartSnapshot.map(function(it) { return {
      tenant_id:     S.tenantId,
      branch_id:     S.branchId,
      order_id:      _oid,
      product_id:    it.id,
      name:          it.name,
      product_name:  it.name,
      unit_price:    it.price,
      product_price: it.price,
      quantity:      it.qty,
      total:         it.price * it.qty,
      notes:         it.note || null,
      status:        'pending',
      selections:    { mods: it.mods || {} },
    }; });
    if (_itemsData.length) await sb.from('pos_order_items').insert(_itemsData);
    // Guardar ID de Supabase en el objeto de delivery (para poder cancelar después)
    nuevo.supabaseId = _oid;
    // Auto-print comanda de cocina en Electron
    if (typeof posAutoprint === 'function' && window.electronPOS) {
      await Promise.race([posAutoprint(_oid), new Promise(res => setTimeout(res, 4000))]);
    }
  } catch(_e) { console.error('[domicilios] enviarACocina:', _e); }

  toast(`${id} enviado a cocina`);
  setTimeout(() => { window.location.href = 'ventas.html?floor=__domicilios__'; }, window.electronPOS ? 600 : 0);
}

// ── Monitor kanban ─────────────────────────────────────────────────────
function renderMonitor() {
  let activos = 0, enCamino = 0, porPagar = 0;

  ESTADOS.forEach(e => {
    const col    = e.id;
    const items  = S.deliveries.filter(d => d.estado === col);
    const bodyEl = $('kan-' + col);
    const nEl    = $('kan-n-' + col);
    if (nEl) nEl.textContent = items.length;
    if (bodyEl) {
      bodyEl.innerHTML = items.length === 0
        ? '<div class="d-kan-empty">Sin domicilios</div>'
        : items.map(d => renderKanCard(d)).join('');
    }
    if (col !== 'entregado') activos += items.length;
    if (col === 'camino')    enCamino += items.length;
    porPagar += items.filter(d => d.payStatus === 'pendiente' || d.payStatus === 'parcial').length;
  });

  if ($('mon-activos'))  $('mon-activos').textContent  = activos;
  if ($('mon-camino'))   $('mon-camino').textContent   = enCamino;
  if ($('mon-porpagar')) $('mon-porpagar').textContent = porPagar;
}

function renderKanCard(d) {
  const ch   = CHAN_OF(d.canal);
  const mins = Math.max(0, Math.round((Date.now() - (d.createdAt || Date.now())) / 60000));
  const timeLabel = mins < 1 ? 'ahora' : `hace ${mins}m`;
  const next = ESTADO_NEXT(d.estado);
  const M    = computeMoneyForCard(d);

  // pago row
  let pagoRow = '';
  if (d.payStatus === 'externo') {
    pagoRow = `<span class="d-tag" style="color:#92660C;background:#FEF3C7">${svgInline('truck', 11)} Lo cobra el repartidor</span>`;
  } else {
    const esParcial = d.payStatus === 'parcial';
    const faltante  = esParcial ? Math.max(0, (d.productos || 0) + (d.fee || 0) - (d.paidAmount || 0)) : 0;
    const pagoColor = d.payStatus === 'pagado' ? '#16A34A' : esParcial ? '#C2410C' : '#B45309';
    const pagoBg    = d.payStatus === 'pagado' ? '#DCFCE7' : esParcial ? '#FFEDD5' : '#FEF3C7';
    const pagoLabel = d.payStatus === 'pagado' ? 'Pagado'
                    : esParcial ? ('Parcial · faltan ' + fmt(faltante))
                    : 'Por pagar';
    const pagoIc    = svgInline(d.payStatus === 'pagado' ? 'check' : 'clock', 11);
    const whenLabel = d.payWhen === 'adelantado' ? 'Adelantado' : 'Contra entrega';
    const metodIc   = svgInline(d.metodo === 'efectivo' ? 'cash' : d.metodo === 'transferencia' ? 'transfer' : 'card', 11);
    pagoRow = `<span class="d-tag" style="color:${pagoColor};background:${pagoBg}">${pagoIc} ${pagoLabel}</span>
               <span class="d-tag" style="color:#64748B;background:#F1F5F9">${whenLabel}</span>
               <span class="d-tag" style="color:#64748B;background:#F1F5F9">${metodIc} ${d.metodo}</span>`;
  }

  // courier badge
  let courierBadge = '';
  if (d.domiciliario && d.domiciliario !== '—') {
    if (d.courier === 'externo') {
      courierBadge = `<span class="d-extbadge">${svgInline('truck', 11)} ${d.domiciliario}</span>`;
    } else {
      courierBadge = `<span class="d-extbadge" style="color:#5B6BFF;background:#EEF2FF">${svgInline('scooter', 11)} ${d.domiciliario}</span>`;
    }
  }

  const totalSub = (d.courier === 'externo' && !d.cobramos) ? ' <span class="sub">· dom. aparte</span>' : '';
  const advBtn   = next
    ? `<button class="d-adv" data-advance="${d.id}">${KAN_BTN[d.estado] || ''} ${svgInline('arrowr', 12)}</button>`
    : `<span class="d-tag" style="color:#16A34A;background:#DCFCE7">${svgInline('check', 11)} Listo</span>`;

  return `<div class="d-domi" data-domi="${d.id}">
    <div class="d-domi-top">
      <span class="d-domi-id">${d.id}</span>
      <span class="d-domi-time">${svgInline('clock', 11)} ${timeLabel}</span>
      <div class="d-domi-menu-wrap" style="position:relative;margin-left:auto">
        <button class="lm-icon-sm" data-openmenu="${d.id}" title="Opciones" style="color:#64748B">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </button>
        <div id="dmenu-${d.id}" hidden style="position:absolute;right:0;top:100%;background:#fff;border:1.5px solid #ECEEF2;border-radius:10px;box-shadow:0 4px 16px rgba(15,23,42,.12);z-index:999;min-width:160px;padding:4px">
          <button data-canceldelivery="${d.id}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#DC2626;border-radius:7px;text-align:left" onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='none'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancelar pedido
          </button>
        </div>
      </div>
    </div>
    <div class="d-domi-cli">${d.cliente}</div>
    <div class="d-domi-cli">${d.cliente}</div>
    <div class="d-domi-row">
      <span class="d-chanchip" style="color:${ch.color};background:${ch.tint}"><span class="mn" style="background:${ch.color}">${ch.mono}</span>${ch.name}</span>
      <span class="d-tag" style="color:#475569;background:#F1F5F9">${svgInline('bag', 11)} ${d.items}</span>
      ${courierBadge}
    </div>
    <div class="d-domi-row">${pagoRow}</div>
    <div class="d-domi-tot">
      <div class="d-domi-money">${fmt(M.cobrar)}${totalSub}</div>
      ${advBtn}
    </div></div>`;
}

// computeMoney para tarjetas del monitor (usa datos del delivery, no S)
function computeMoneyForCard(d) {
  const prod   = d.productos || 0;
  const fee    = d.fee || 0;
  const cobra  = d.cobramos;
  const ext    = d.courier === 'externo';
  if (!ext) return { cobrar: prod + fee };
  if (cobra) return { cobrar: prod + fee };
  return { cobrar: prod };
}

function advanceDelivery(id) {
  const d = S.deliveries.find(x => x.id === id);
  if (!d) return;
  const next = ESTADO_NEXT(d.estado);
  if (!next) return;
  d.estado = next;
  // PERSISTIR el avance (antes solo cambiaba en memoria y se perdía al recargar)
  if (d.supabaseId) {
    const upd = { delivery_status: next };
    if (next === 'entregado') upd.delivered_at = new Date().toISOString();
    sb.from('pos_orders').update(upd).eq('id', d.supabaseId)
      .then(r => { if (r.error) console.error('[domicilios] advance persist:', r.error); });
  }
  renderMonitor();
  updateMonitorBadge();
  toast(`${id} → ${ESTADO_OF(next).name}`);
}

async function cancelDelivery(id) {
  if (!confirm('¿Cancelar el pedido ' + id + '? Esta acción no se puede deshacer.')) return;
  const d = S.deliveries.find(x => x.id === id);
  if (!d) return;
  // Cancelar en Supabase si tenemos el ID real
  if (d.supabaseId) {
    try {
      await sb.from('pos_orders').update({ status: 'cancelled' }).eq('id', d.supabaseId);
    } catch(e) { console.warn('[domicilios] cancelDelivery supabase:', e); }
  }
  S.deliveries = S.deliveries.filter(x => x.id !== id);
  renderMonitor();
  updateMonitorBadge();
  toast(`Pedido ${id} cancelado`, 'warn');
}

function updateMonitorBadge() {
  const active = S.deliveries.filter(d => d.estado !== 'entregado').length;
  const badge  = $('monitor-badge');
  if (badge) {
    badge.textContent = active;
    badge.style.display = active > 0 ? 'flex' : 'none';
  }
}

// ── Reset pedido ───────────────────────────────────────────────────────
function resetPedido() {
  S.cart      = [];
  S.cliente   = null;
  S.asignado  = null;
  S.canal     = 'whatsapp';
  S.modalidad = 'express';
  S.fee       = 0;
  S.courier   = 'interno';
  S.cobramos  = false;
  S.pago      = { when: 'contraentrega', status: 'pendiente', metodo: 'efectivo' };

  renderCart();
  renderClienteCard();
  renderDetBtn();
  renderContextHeader();
  renderAsigList();
  refreshBrowserQtys();
  flipToPedido();

  // Resetear UI modal registro
  document.querySelectorAll('[data-chan]').forEach(b => b.classList.toggle('on', b.dataset.chan === 'whatsapp'));
  document.querySelectorAll('[data-modalidad]').forEach(b => b.classList.toggle('on', b.dataset.modalidad === 'express'));
  if ($('fee-preview')) $('fee-preview').textContent = '0';
}

// ── handleAction ───────────────────────────────────────────────────────
function handleAction(action) {
  if      (action === 'regresar')        { window.location.href = 'ventas.html'; }
  else if (action === 'nuevo')           { resetPedido(); openModal('modal-registro'); }
  else if (action === 'editar-ctx')      { openModal('modal-registro'); }
  else if (action === 'vaciar')          { clearCart(); }
  else if (action === 'guardar')         { toast('Pedido guardado (borrador)'); }
  else if (action === 'enviar')          { enviarACocina(); }
  else if (action === 'registro-next')   { document.body.classList.remove('d-gate'); closeModal('modal-registro'); renderContextHeader(); }
  else if (action === 'keypad-ok')       { kpOk(); }
  else if (action === 'toggle-money-note') {
    const noteArea = $('money-note-area');
    const infoBtn  = $('btn-money-info');
    if (!noteArea) return;
    const open = noteArea.dataset.open === 'true';
    if (open) {
      noteArea.innerHTML = '';
      noteArea.dataset.open = 'false';
      if (infoBtn) infoBtn.classList.remove('active');
    } else {
      noteArea.innerHTML = noteArea.dataset.note || '';
      noteArea.dataset.open = 'true';
      if (infoBtn) infoBtn.classList.add('active');
    }
  }
  else if (action === 'guardar-cliente') { guardarCliente(); }
}

// ── attachEvents ───────────────────────────────────────────────────────
function attachEvents() {
  // Teclado físico para el keypad numérico
  document.addEventListener('keydown', function(e) {
    const kp = $('modal-keypad');
    if (!kp || kp.hidden) return;           // solo cuando el keypad está abierto
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '0' && e.key <= '9')       { kpPress(e.key); e.preventDefault(); return; }
    if (e.key === 'Backspace')              { kpPress('bksp'); e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Escape') { kpPress('C'); e.preventDefault(); return; }
    if (e.key === 'Enter')                  { kpOk(); e.preventDefault(); return; }
  });


  // Delegated click en body
  document.body.addEventListener('click', e => {
    // Cerrar menús de tarjeta si click fuera
    if (!e.target.closest('[data-openmenu]') && !e.target.closest('[id^="dmenu-"]')) {
      document.querySelectorAll('[id^="dmenu-"]').forEach(m => { m.hidden = true; });
    }

    // [data-action]
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) { handleAction(actionEl.dataset.action); return; }

    // Nav rail
    const navEl = e.target.closest('[data-nav]');
    if (navEl) { setView(navEl.dataset.nav); return; }

    // Browser tabs
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl) { setBrowserTab(tabEl.dataset.tab); return; }

    // Flip comanda
    if (e.target.closest('[data-open-detalles]'))  { flipToDetalles(); return; }
    if (e.target.closest('[data-close-detalles]')) { flipToPedido();   return; }

    // Agregar al carrito
    const addEl = e.target.closest('[data-add]');
    if (addEl) { addToCart(addEl.dataset.add); return; }

    // +/- carrito
    const incEl = e.target.closest('[data-inc]');
    if (incEl) { updateQty(incEl.dataset.inc,  1); return; }
    const decEl = e.target.closest('[data-dec]');
    if (decEl) { updateQty(decEl.dataset.dec, -1); return; }

    // Abrir categoría
    const catEl = e.target.closest('[data-open-cat]');
    if (catEl) { openCat(catEl.dataset.openCat); return; }

    // Volver desde sub-categoría
    if (e.target.closest('[data-sub-back]')) {
      if ($('subview-products')) $('subview-products').hidden = true;
      if ($('cat-grid'))         $('cat-grid').hidden         = false;
      return;
    }

    // Keypad keys
    const keyEl = e.target.closest('[data-key]');
    if (keyEl) { kpPress(keyEl.dataset.key); return; }

    // Abrir keypad
    if (e.target.closest('[data-open-keypad]')) { openKeypad(); return; }

    // Cerrar modal (overlay backdrop o botón data-close)
    const closeEl = e.target.closest('[data-close]');
    if (closeEl) {
      const overlay = closeEl.closest('.d-overlay');
      if (overlay) overlay.hidden = true;
      return;
    }
    // Backdrop click en overlay (modal-registro no se cierra si gate está activo)
    if (e.target.classList.contains('d-overlay')) {
      if (e.target.id === 'modal-registro' && document.body.classList.contains('d-gate')) return;
      e.target.hidden = true; return;
    }

    // Abrir modal cliente
    if (e.target.closest('[data-open-cliente]')) {
      if ($('cli-search-input')) $('cli-search-input').value = '';
      renderCliList('');
      openModal('modal-cliente');
      return;
    }

    // Abrir nuevo cliente
    if (e.target.closest('[data-open-nuevocli]')) { openNuevoCli(null); return; }

    // Back a lista desde nuevo cliente
    if (e.target.closest('[data-back-cliente]')) { closeModal('modal-nuevocli'); openModal('modal-cliente'); return; }

    // Seleccionar cliente (no clicar en botón editar)
    const cliBtn = e.target.closest('[data-cliente]');
    if (cliBtn && !e.target.closest('[data-edit]')) {
      const cid = cliBtn.dataset.cliente;
      S.cliente = S.clientes.find(c => c.id === cid) || null;
      closeModal('modal-cliente');
      renderClienteCard();
      renderDetBtn();
      return;
    }

    // Editar cliente desde lista
    const editEl = e.target.closest('[data-edit]');
    if (editEl && editEl.closest('#modal-cliente')) { openNuevoCli(editEl.dataset.edit); return; }

    // Editar cliente desde card
    if (e.target.closest('[data-edit-cliente]') && S.cliente) { openNuevoCli(S.cliente.id); return; }

    // Toggle courier
    if (e.target.closest('[data-toggle-courier]')) { toggleCourier(); return; }

    // Asignar domiciliario
    const asigEl = e.target.closest('[data-asignar]');
    if (asigEl) {
      S.asignado = asigEl.dataset.asignar;
      renderAsigList();
      renderDetBtn();
      return;
    }

    // Cobro externo
    const cobroEl = e.target.closest('[data-cobro]');
    if (cobroEl) {
      S.cobramos = (cobroEl.dataset.cobro === 'nosotros');
      document.querySelectorAll('[data-cobro]').forEach(b => b.classList.toggle('on', b.dataset.cobro === cobroEl.dataset.cobro));
      renderDetBtn();
      renderTotals();
      return;
    }

    // Pago — cuando
    const whenEl = e.target.closest('[data-when]');
    if (whenEl) {
      S.pago.when = whenEl.dataset.when;
      document.querySelectorAll('[data-when]').forEach(b => b.classList.toggle('on', b.dataset.when === S.pago.when));
      return;
    }

    // Pago — estado
    const statusEl = e.target.closest('[data-status]');
    if (statusEl) {
      S.pago.status = statusEl.dataset.status;
      document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('on', b.dataset.status === S.pago.status));
      renderDetBtn();
      return;
    }

    // Pago — método
    const metEl = e.target.closest('[data-metodo]');
    if (metEl) {
      S.pago.metodo = metEl.dataset.metodo;
      document.querySelectorAll('[data-metodo]').forEach(b => b.classList.toggle('on', b.dataset.metodo === S.pago.metodo));
      return;
    }

    // Canal en modal-registro
    const chanEl = e.target.closest('[data-chan]');
    if (chanEl) {
      S.canal = chanEl.dataset.chan;
      document.querySelectorAll('[data-chan]').forEach(b => b.classList.toggle('on', b.dataset.chan === S.canal));
      return;
    }

    // Modalidad
    const modEl = e.target.closest('[data-modalidad]');
    if (modEl) {
      S.modalidad = modEl.dataset.modalidad;
      document.querySelectorAll('[data-modalidad]').forEach(b => b.classList.toggle('on', b.dataset.modalidad === S.modalidad));
      return;
    }

    // Tabs de nuevo-cliente (básico / avanzado)
    const cliTab = e.target.closest('[data-clitab]');
    if (cliTab) {
      const pane = cliTab.dataset.clitab;
      document.querySelectorAll('[data-clitab]').forEach(b => b.classList.toggle('on', b.dataset.clitab === pane));
      document.querySelectorAll('[data-clipane]').forEach(p => { p.hidden = (p.dataset.clipane !== pane); });
      return;
    }

    // Menú 3 puntos — abrir/cerrar
    const menuBtn = e.target.closest('[data-openmenu]');
    if (menuBtn) {
      e.stopPropagation();
      const did = menuBtn.dataset.openmenu;
      const drop = document.getElementById('dmenu-' + did);
      if (drop) {
        // Cerrar otros menús abiertos
        document.querySelectorAll('[id^="dmenu-"]').forEach(m => { if (m !== drop) m.hidden = true; });
        drop.hidden = !drop.hidden;
      }
      return;
    }

    // Cancelar pedido desde menú
    const cancelEl = e.target.closest('[data-canceldelivery]');
    if (cancelEl) { cancelDelivery(cancelEl.dataset.canceldelivery); return; }

    // Avanzar kanban
    const advEl = e.target.closest('[data-advance]');
    if (advEl) { advanceDelivery(advEl.dataset.advance); return; }
  });

  // Input búsqueda de productos
  const busqInput = $('busq-input');
  if (busqInput) busqInput.addEventListener('input', function () { renderBusqResults(this.value); });

  // Input búsqueda de clientes
  const cliSearchInput = $('cli-search-input');
  if (cliSearchInput) cliSearchInput.addEventListener('input', function () { renderCliList(this.value); });
}
