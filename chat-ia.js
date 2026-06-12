/* ═══════════════════════════════════════════════════════════
   Chat IA — Lumen POS
   Conectado a Supabase. Sin datos hardcodeados de negocio.
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

/* ── Paleta de tintes para avatares ── */
const TINTS = [
  ['#EEF2FF','#5B6BFF'], ['#FFF1F2','#F43F5E'], ['#ECFDF5','#10B981'],
  ['#FFF7ED','#F97316'], ['#F5F3FF','#8B5CF6'], ['#F0F9FF','#0EA5E9'],
  ['#FEF3C7','#D97706'],
];

/* ── Metadatos de canales ── */
const CHANNELS = {
  whatsapp:  { key:'wa',  label:'WhatsApp',  solid:'#25D366', dotColor:'#25D366' },
  instagram: { key:'ig',  label:'Instagram', solid:'#E1306C', dotColor:'#E1306C' },
  facebook:  { key:'fb',  label:'Facebook',  solid:'#0866FF', dotColor:'#0866FF' },
  tiktok:    { key:'tk',  label:'TikTok',    solid:'#111418', dotColor:'#111418' },
};

/* SVGs de canales */
const GLYPH = {
  wa: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 0 1 12 3.8zm-2.8 4c-.2 0-.5.1-.6.3-.2.3-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.6 4 3.5 2 .8 2.4.7 2.8.6.4 0 1.3-.5 1.5-1 .2-.5.2-.9.1-1l-.6-.3s-1.3-.6-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.1-.2.1-.4 0-.2 0-.9-.3-1.7-1-.6-.6-1-1.2-1.2-1.4-.1-.2 0-.3.1-.4l.3-.4.2-.4v-.3l-.7-1.7c-.1-.4-.3-.3-.4-.3h-.4z"/></svg>`,
  ig: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="1" fill="#fff" stroke="none"/></svg>`,
  fb: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M13.5 21v-7h2.3l.4-2.9h-2.7V9.3c0-.8.3-1.4 1.5-1.4h1.4V5.3c-.7-.1-1.4-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2.1H8.3V14h2.4v7h2.8z"/></svg>`,
  tk: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M16.2 3c.3 1.9 1.4 3.3 3.3 3.6v2.8c-1.2 0-2.3-.4-3.3-1.1v5.9a5 5 0 1 1-5-5c.2 0 .4 0 .6.05v2.9a2.1 2.1 0 1 0 1.5 2V3h2.9z"/></svg>`,
};

/* ══════════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════════ */
const S = {
  tenantId: null, branchId: null,
  user: null,
  conversations: [],
  channels: [],
  activeConvId: null,
  messages: [],
  activeFilter: 'all',  // all | whatsapp | instagram | facebook | tiktok
  activeView: 'all',    // all | pending | mine | resolved | archived
  query: '',
  realtimeSub: null,
};

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
async function boot() {
  try {
    // Cargar tenant y branch
    const { data: tenant } = await sb.from('tenants').select('id, name').limit(1).single();
    if (!tenant) { showFatalError('No hay tenant configurado'); return; }
    S.tenantId = tenant.id;

    const { data: branch } = await sb.from('branches')
      .select('id, name').eq('tenant_id', S.tenantId).limit(1).single();
    if (!branch) { showFatalError('No hay sucursal configurada'); return; }
    S.branchId = branch.id;

    // Cargar usuario
    const { data: user } = await sb.from('pos_users')
      .select('id, full_name, role').eq('tenant_id', S.tenantId).limit(1).single();
    S.user = user;

    // Renderizar cabecera sidebar
    $('branchLabel').textContent = branch.name;
    if (user) {
      const initials = user.full_name
        ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : '??';
      $('userAv').textContent   = initials;
      $('userName').textContent = user.full_name || '—';
      $('userRole').textContent = user.role      || 'Usuario';
    }

    // Cargar datos
    await Promise.all([loadChannels(), loadConversations()]);

    // Realtime: nuevas conversaciones y actualizaciones
    subscribeRealtime();

    // Eventos UI
    wireEvents();

  } catch (err) {
    console.error('Boot error:', err);
  }
}

/* ══════════════════════════════════════════════
   CARGA DE DATOS
══════════════════════════════════════════════ */
async function loadChannels() {
  const { data } = await sb.from('chat_channels')
    .select('*')
    .eq('branch_id', S.branchId)
    .eq('connected', true)
    .order('channel');

  S.channels = data || [];
  renderChannelsSidebar();
  renderFilters();
}

async function loadConversations() {
  $('convList').innerHTML = `<div class="ci-loading"><div class="ci-spinner"></div>Cargando conversaciones…</div>`;

  let query = sb.from('chat_conversations')
    .select('*')
    .eq('branch_id', S.branchId)
    .order('last_message_at', { ascending: false });

  // Filtro por vista (bandeja / sin responder / resueltos / archivados)
  if (S.activeView === 'pending')  query = query.eq('last_sender', 'contact').gt('unread_count', 0);
  if (S.activeView === 'resolved') query = query.eq('status', 'resolved');
  if (S.activeView === 'archived') query = query.eq('status', 'archived');
  if (S.activeView === 'all' || S.activeView === 'mine') query = query.eq('status', 'open');

  const { data, error } = await query;
  if (error) { console.error('loadConversations:', error); return; }

  S.conversations = data || [];
  renderConvList();
  renderBadges();
}

async function loadMessages(convId) {
  const { data, error } = await sb.from('chat_messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('sent_at', { ascending: true });

  if (error) { console.error('loadMessages:', error); return; }
  S.messages = data || [];
  renderThread();
}

/* ══════════════════════════════════════════════
   REALTIME
══════════════════════════════════════════════ */
function subscribeRealtime() {
  if (S.realtimeSub) sb.removeChannel(S.realtimeSub);

  S.realtimeSub = sb.channel('chat-ia-' + S.branchId)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'chat_conversations',
      filter: `branch_id=eq.${S.branchId}`
    }, payload => {
      handleConvChange(payload);
    })
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages',
    }, payload => {
      const msg = payload.new;
      if (msg.conversation_id === S.activeConvId) {
        S.messages.push(msg);
        renderThread();
      }
      // Actualizar last_message en la lista
      const idx = S.conversations.findIndex(c => c.id === msg.conversation_id);
      if (idx !== -1) {
        S.conversations[idx].last_message = msg.body || '[Imagen]';
        S.conversations[idx].last_message_at = msg.sent_at;
        S.conversations[idx].last_sender = msg.direction === 'in' ? 'contact' : 'agent';
        if (msg.direction === 'in') S.conversations[idx].unread_count++;
        // Re-sort
        S.conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        renderConvList();
        renderBadges();
      }
    })
    .subscribe();
}

function handleConvChange(payload) {
  if (payload.eventType === 'INSERT') {
    S.conversations.unshift(payload.new);
  } else if (payload.eventType === 'UPDATE') {
    const idx = S.conversations.findIndex(c => c.id === payload.new.id);
    if (idx !== -1) S.conversations[idx] = { ...S.conversations[idx], ...payload.new };
    else S.conversations.unshift(payload.new);
  } else if (payload.eventType === 'DELETE') {
    S.conversations = S.conversations.filter(c => c.id !== payload.old.id);
  }
  renderConvList();
  renderBadges();
}

/* ══════════════════════════════════════════════
   RENDERS
══════════════════════════════════════════════ */

/* Sidebar: lista de canales conectados */
function renderChannelsSidebar() {
  const counts = {};
  S.conversations.forEach(c => {
    counts[c.channel] = (counts[c.channel] || 0) + (c.unread_count > 0 ? c.unread_count : 0);
  });

  if (!S.channels.length) {
    $('channelsList').innerHTML = `<div style="padding:4px 10px;font-size:11.5px;color:var(--text-4)">Sin canales conectados</div>`;
    return;
  }

  $('channelsList').innerHTML = S.channels.map(ch => {
    const meta = CHANNELS[ch.channel] || {};
    const n = counts[ch.channel] || 0;
    return `
      <div class="ci-chan-row">
        <span class="l">
          <span class="ci-chan-glyph chan-${meta.key}" style="width:20px;height:20px">${GLYPH[meta.key]||''}</span>
          ${meta.label}
        </span>
        <span class="n">${n || ''}</span>
      </div>`;
  }).join('');
}

/* Filtros de canal (segmentos) */
function renderFilters() {
  const counts = {};
  S.conversations.forEach(c => { counts[c.channel] = (counts[c.channel]||0)+1; });
  const total = S.conversations.length;

  const btns = [
    { f:'all', label:`Todos <span class="sc">${total}</span>`, glyph:'' },
    ...Object.entries(CHANNELS).map(([ch, meta]) => ({
      f: ch,
      label: `<span class="sc">${counts[ch]||0}</span>`,
      glyph: `<span class="ci-chan-glyph chan-${meta.key}" style="width:18px;height:18px">${GLYPH[meta.key]||''}</span>`,
    }))
  ];

  $('channelFilters').innerHTML = btns.map(b => `
    <button class="ci-seg-btn${S.activeFilter===b.f?' on':''}" data-f="${b.f}" title="${b.f==='all'?'Todos':CHANNELS[b.f]?.label||''}">
      ${b.glyph}${b.label}
    </button>`).join('');

  $('channelFilters').querySelectorAll('.ci-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.activeFilter = btn.dataset.f;
      renderFilters();
      renderConvList();
    });
  });
}

/* Lista de conversaciones */
function renderConvList() {
  let list = S.conversations;

  // Filtro por canal
  if (S.activeFilter !== 'all') list = list.filter(c => c.channel === S.activeFilter);

  // Filtro por búsqueda
  if (S.query.trim()) {
    const q = S.query.toLowerCase();
    list = list.filter(c =>
      (c.contact_name||'').toLowerCase().includes(q) ||
      (c.contact_handle||'').toLowerCase().includes(q) ||
      (c.last_message||'').toLowerCase().includes(q)
    );
  }

  if (!list.length) {
    $('convList').innerHTML = `
      <div class="ci-list-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p>${S.query ? 'Sin resultados para "'+escHtml(S.query)+'"' : 'Sin conversaciones'}</p>
      </div>`;
    return;
  }

  $('convList').innerHTML = list.map(c => convRowHTML(c)).join('');

  // Eventos click en cada fila
  $('convList').querySelectorAll('.ci-conv').forEach(el => {
    el.addEventListener('click', () => openConversation(el.dataset.id));
  });

  // Resaltar activa
  if (S.activeConvId) {
    const el = $('convList').querySelector(`[data-id="${S.activeConvId}"]`);
    if (el) el.classList.add('active');
  }
}

function convRowHTML(c) {
  const meta    = CHANNELS[c.channel] || {};
  const tint    = TINTS[(c.contact_avatar_tint || 0) % TINTS.length];
  const label   = c.contact_name || c.contact_handle || '?';
  const initials = avatarInitials(label);
  const isUnread = c.unread_count > 0;
  const isActive = c.id === S.activeConvId;
  const time    = formatTime(c.last_message_at);

  const rightBadge = isUnread
    ? `<span class="ci-unread">${c.unread_count}</span>`
    : `<span class="ci-chan-tag"><span class="dot" style="background:${meta.dotColor||'#ccc'}"></span>${meta.label||''}</span>`;

  let prevPrefix = '';
  if (!isUnread && c.last_sender === 'agent') {
    const checkColor = c.last_read ? '#5B6BFF' : '#94A3B8';
    prevPrefix = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${checkColor}" stroke-width="2.4" style="flex-shrink:0"><polyline points="18 7 9 17 5 13"/><polyline points="22 7 13 17 12.5 16.5"/></svg><span style="color:#94A3B8;font-weight:500">Tú:&nbsp;</span>`;
  }

  return `
    <button class="ci-conv${isActive?' active':''}${isUnread?' unread':''}" data-id="${c.id}">
      <span class="ci-av-wrap">
        <span class="ci-av" style="background:${tint[0]};color:${tint[1]}">${initials}</span>
        <span class="ci-av-badge chan-${meta.key}">${GLYPH[meta.key]||''}</span>
      </span>
      <span class="ci-conv-main">
        <span class="ci-conv-top">
          <span class="ci-conv-name">${escHtml(label)}</span>
          <span class="ci-conv-time">${time}</span>
        </span>
        <span class="ci-conv-bot">
          <span class="ci-conv-prev">${prevPrefix}${escHtml(c.last_message||'')}</span>
          ${rightBadge}
        </span>
      </span>
    </button>`;
}

/* Thread de mensajes */
function renderThread() {
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv) return;
  const meta = CHANNELS[conv.channel] || {};
  const handle = conv.contact_handle || '';

  let html = `
    <div class="ci-ctxbar">
      <span class="ci-chan-glyph chan-${meta.key}" style="width:18px;height:18px">${GLYPH[meta.key]||''}</span>
      Conversación por ${meta.label||''} · ${escHtml(handle)}
    </div>`;

  // Agrupar por fecha
  let lastDate = '';
  S.messages.forEach(m => {
    const dateStr = formatDate(m.sent_at);
    if (dateStr !== lastDate) {
      html += `<div class="ci-datechip"><span>${dateStr}</span></div>`;
      lastDate = dateStr;
    }
    html += messageHTML(m);
  });

  if (!S.messages.length) {
    html += `<div style="text-align:center;color:var(--text-4);font-size:13px;padding:24px">Sin mensajes todavía</div>`;
  }

  $('thread').innerHTML = html;
  $('thread').scrollTop = $('thread').scrollHeight;
}

function messageHTML(m) {
  const dir  = m.direction === 'in' ? 'in' : 'out';
  const time = formatTime(m.sent_at);

  let body = '';
  if (m.media_url) {
    body = `<div class="ci-img-ph">[imagen]</div>`;
  }
  body += m.body ? `<div>${escHtml(m.body)}</div>` : '';

  let check = '';
  if (dir === 'out') {
    const color = m.delivery_status === 'read' ? '#fff' : 'rgba(255,255,255,.5)';
    check = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4"><polyline points="18 7 9 17 5 13"/><polyline points="22 7 13 17 12.5 16.5"/></svg>`;
  }

  return `
    <div class="ci-row ${dir}">
      <div class="ci-bubble ${dir}">
        ${body}
        <div class="ci-meta">${time}${check}</div>
      </div>
    </div>`;
}

/* Badges contadores en sidebar */
function renderBadges() {
  const totalUnread = S.conversations.reduce((s, c) => s + (c.unread_count||0), 0);
  const pending = S.conversations.filter(c => c.last_sender==='contact' && c.unread_count>0).length;

  $('badge-all').textContent     = totalUnread || '';
  $('badge-pending').textContent = pending || '';

  // Total sin leer en título
  $('totalUnread').textContent = totalUnread
    ? `${totalUnread} sin leer`
    : `${S.conversations.length} conversaciones`;

  renderChannelsSidebar();
  renderFilters();
}

/* Header del chat abierto */
function renderChatHeader(conv) {
  const meta  = CHANNELS[conv.channel] || {};
  const tint  = TINTS[(conv.contact_avatar_tint||0) % TINTS.length];
  const label = conv.contact_name || conv.contact_handle || '?';
  const initials = avatarInitials(label);

  $('chatAv').innerHTML = `
    <span style="width:100%;height:100%;border-radius:13px;background:${tint[0]};color:${tint[1]};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${initials}</span>
    <span class="ci-av-badge chan-${meta.key}" style="position:absolute;right:-4px;bottom:-4px">${GLYPH[meta.key]||''}</span>`;

  $('chatName').textContent = label;

  const onlineHTML = conv.is_online
    ? `<span class="ci-dot-live"></span> en línea`
    : 'visto recientemente';

  $('chatMeta').innerHTML = `
    <span class="ci-chan-chip chip-${meta.key}">${GLYPH[meta.key]||''}${meta.label||''}</span>
    <span class="ci-presence">${onlineHTML} · ${escHtml(conv.contact_handle||'')}</span>`;
}

/* ══════════════════════════════════════════════
   ACCIONES
══════════════════════════════════════════════ */
async function openConversation(id) {
  S.activeConvId = id;
  const conv = S.conversations.find(c => c.id === id);
  if (!conv) return;

  // Marcar como leída localmente
  if (conv.unread_count > 0) {
    conv.unread_count = 0;
    await sb.from('chat_conversations').update({ unread_count: 0 }).eq('id', id);
  }

  renderConvList();
  renderBadges();

  // Mostrar panel de chat
  $('chatEmpty').style.display   = 'none';
  $('chatHead').style.display    = 'flex';
  $('thread').style.display      = 'block';
  $('composer').style.display    = 'flex';

  renderChatHeader(conv);
  await loadMessages(id);
}

async function sendMessage() {
  const input = $('msgInput');
  const text  = input.value.trim();
  if (!text || !S.activeConvId) return;

  input.value = '';

  const msg = {
    conversation_id: S.activeConvId,
    tenant_id:       S.tenantId,
    direction:       'out',
    body:            text,
    delivery_status: 'sending',
    sent_at:         new Date().toISOString(),
    agent_id:        S.user?.id || null,
  };

  // Optimistic update
  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ ...msg, id: tmpId });
  renderThread();

  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId,
    tenant_id:       S.tenantId,
    direction:       'out',
    body:            text,
    delivery_status: 'sent',
    agent_id:        S.user?.id || null,
  }]).select().single();

  if (error) {
    console.error('sendMessage error:', error);
    // Quitar mensaje temporal
    S.messages = S.messages.filter(m => m.id !== tmpId);
    renderThread();
    return;
  }

  // Reemplazar tmp con el real
  S.messages = S.messages.map(m => m.id === tmpId ? data : m);
  renderThread();

  // Actualizar last_message local
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (conv) {
    conv.last_message    = text;
    conv.last_message_at = data.sent_at;
    conv.last_sender     = 'agent';
    S.conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvList();
  }
}

/* ══════════════════════════════════════════════
   EVENTOS UI
══════════════════════════════════════════════ */
function wireEvents() {
  // Filtro toggle
  $('filterToggle').addEventListener('click', () => {
    $('filterToggle').classList.toggle('active');
    $('filterWrap').classList.toggle('hidden');
  });

  // Búsqueda
  $('searchInput').addEventListener('input', e => {
    S.query = e.target.value;
    renderConvList();
  });

  // Enviar mensaje
  $('sendBtn').addEventListener('click', sendMessage);
  $('msgInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Nav sidebar
  document.querySelectorAll('.ci-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ci-nav-btn[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.activeView = btn.dataset.view;
      loadConversations();
    });
  });

  // Crear pedido
  $('createOrderBtn')?.addEventListener('click', () => {
    // TODO: vincular con módulo de ventas
    alert('Función "Crear pedido" próximamente disponible en este módulo.');
  });
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function avatarInitials(name) {
  if (!name) return '?';
  // Es teléfono?
  const clean = name.replace(/\D/g, '');
  if (clean.length >= 8) return clean.slice(-2);
  // Es @handle?
  if (name.startsWith('@')) return name.slice(1, 3).toUpperCase();
  // Nombre normal
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }
  if (diff < 172800000) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showFatalError(msg) {
  document.body.innerHTML = `<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:sans-serif;color:#F43F5E;font-size:14px;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${escHtml(msg)}</div>`;
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', boot);
