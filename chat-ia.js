/* ═══════════════════════════════════════════════════════════
   Chat IA — Cobra POS
   Bandeja omnicanal: WhatsApp · Instagram · Facebook · TikTok
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

const TIKTOK_CLIENT_KEY = '7650415130718502929';
const OAUTH_CALLBACK    = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/tiktok-oauth-callback';

/* Paleta de tintes para avatares */
const TINTS = [
  ['#EEF2FF','#5B6BFF'], ['#FFF1F2','#F43F5E'], ['#ECFDF5','#10B981'],
  ['#FFF7ED','#F97316'], ['#F5F3FF','#8B5CF6'], ['#F0F9FF','#0EA5E9'],
  ['#FEF3C7','#D97706'],
];

/* Metadatos de todos los canales (siempre los 4) */
const ALL_CHANNELS = ['whatsapp', 'instagram', 'facebook', 'tiktok'];
const CHANNELS = {
  whatsapp:  { key:'wa', label:'WhatsApp',  solid:'#25D366', dotColor:'#25D366' },
  instagram: { key:'ig', label:'Instagram', solid:'#E1306C', dotColor:'#E1306C' },
  facebook:  { key:'fb', label:'Facebook',  solid:'#0866FF', dotColor:'#0866FF' },
  tiktok:    { key:'tk', label:'TikTok',    solid:'#111418', dotColor:'#111418' },
};

const GLYPH = {
  wa: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 0 1 12 3.8zm-2.8 4c-.2 0-.5.1-.6.3-.2.3-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.6 4 3.5 2 .8 2.4.7 2.8.6.4 0 1.3-.5 1.5-1 .2-.5.2-.9.1-1l-.6-.3s-1.3-.6-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.1-.2.1-.4 0-.2 0-.9-.3-1.7-1-.6-.6-1-1.2-1.2-1.4-.1-.2 0-.3.1-.4l.3-.4.2-.4v-.3l-.7-1.7c-.1-.4-.3-.3-.4-.3h-.4z"/></svg>`,
  ig: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="1" fill="#fff" stroke="none"/></svg>`,
  fb: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M13.5 21v-7h2.3l.4-2.9h-2.7V9.3c0-.8.3-1.4 1.5-1.4h1.4V5.3c-.7-.1-1.4-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2.1H8.3V14h2.4v7h2.8z"/></svg>`,
  tk: `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M16.2 3c.3 1.9 1.4 3.3 3.3 3.6v2.8c-1.2 0-2.3-.4-3.3-1.1v5.9a5 5 0 1 1-5-5c.2 0 .4 0 .6.05v2.9a2.1 2.1 0 1 0 1.5 2V3h2.9z"/></svg>`,
};

/* ── Estado global ── */
const S = {
  tenantId: null, branchId: null, user: null,
  conversations: [], channels: [],
  activeConvId: null, messages: [],
  activeFilter: 'all', activeView: 'all',
  query: '', realtimeSub: null,
};

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
async function boot() {
  // Detectar callback OAuth exitoso
  const params = new URLSearchParams(window.location.search);
  const connectedChannel = params.get('channel');
  const connectedOk      = params.get('connected');
  const connectedErr     = params.get('error');
  if (connectedChannel) {
    window.history.replaceState({}, '', window.location.pathname);
    if (connectedOk === '1') showToast(`✅ ${CHANNELS[connectedChannel]?.label || connectedChannel} conectado correctamente`, 'success');
    if (connectedErr)       showToast(`❌ Error al conectar: ${connectedErr}`, 'error');
  }

  try {
    const { data: tenant } = await sb.from('tenants').select('id,name').limit(1).single();
    if (!tenant) { showFatalError('No hay tenant configurado'); return; }
    S.tenantId = tenant.id;

    const { data: branch } = await sb.from('branches').select('id,name').eq('tenant_id', S.tenantId).limit(1).single();
    if (!branch) { showFatalError('No hay sucursal configurada'); return; }
    S.branchId = branch.id;

    const { data: user } = await sb.from('pos_users').select('id,full_name,role').eq('tenant_id', S.tenantId).limit(1).single();
    S.user = user;

    $('branchLabel').textContent = branch.name;
    if (user) {
      const initials = user.full_name ? user.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '??';
      $('userAv').textContent   = initials;
      $('userName').textContent = user.full_name || '—';
      $('userRole').textContent = user.role      || 'Usuario';
    }

    await Promise.all([loadChannels(), loadConversations()]);
    subscribeRealtime();
    wireEvents();
  } catch (err) {
    console.error('Boot error:', err);
  }
}

/* ══════════════════════════════════════════════
   DATOS
══════════════════════════════════════════════ */
async function loadChannels() {
  const { data } = await sb.from('chat_channels')
    .select('*').eq('branch_id', S.branchId);
  S.channels = data || [];
  renderChannelsSidebar();
  renderFilters();
}

async function loadConversations() {
  $('convList').innerHTML = `<div class="ci-loading"><div class="ci-spinner"></div>Cargando…</div>`;
  let q = sb.from('chat_conversations').select('*').eq('branch_id', S.branchId)
    .order('last_message_at', { ascending: false });
  if (S.activeView === 'pending')  q = q.eq('last_sender','contact').gt('unread_count',0);
  if (S.activeView === 'resolved') q = q.eq('status','resolved');
  if (S.activeView === 'archived') q = q.eq('status','archived');
  if (['all','mine'].includes(S.activeView)) q = q.eq('status','open');
  const { data } = await q;
  S.conversations = data || [];
  renderConvList();
  renderBadges();
}

async function loadMessages(convId) {
  const { data } = await sb.from('chat_messages').select('*')
    .eq('conversation_id', convId).order('sent_at', { ascending: true });
  S.messages = data || [];
  renderThread();
}

/* ══════════════════════════════════════════════
   REALTIME
══════════════════════════════════════════════ */
function subscribeRealtime() {
  if (S.realtimeSub) sb.removeChannel(S.realtimeSub);
  S.realtimeSub = sb.channel('chat-ia-' + S.branchId)
    .on('postgres_changes', { event:'*', schema:'public', table:'chat_conversations', filter:`branch_id=eq.${S.branchId}` }, handleConvChange)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages' }, payload => {
      const msg = payload.new;
      if (msg.conversation_id === S.activeConvId) { S.messages.push(msg); renderThread(); }
      const idx = S.conversations.findIndex(c => c.id === msg.conversation_id);
      if (idx !== -1) {
        S.conversations[idx].last_message    = msg.body || '[Imagen]';
        S.conversations[idx].last_message_at = msg.sent_at;
        S.conversations[idx].last_sender     = msg.direction === 'in' ? 'contact' : 'agent';
        if (msg.direction === 'in') S.conversations[idx].unread_count++;
        S.conversations.sort((a,b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        renderConvList(); renderBadges();
      }
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'chat_channels', filter:`branch_id=eq.${S.branchId}` }, () => {
      loadChannels(); // refrescar canales si cambia alguno
    })
    .subscribe();
}

function handleConvChange(payload) {
  if (payload.eventType === 'INSERT') S.conversations.unshift(payload.new);
  else if (payload.eventType === 'UPDATE') {
    const idx = S.conversations.findIndex(c => c.id === payload.new.id);
    if (idx !== -1) S.conversations[idx] = { ...S.conversations[idx], ...payload.new };
    else S.conversations.unshift(payload.new);
  } else if (payload.eventType === 'DELETE') {
    S.conversations = S.conversations.filter(c => c.id !== payload.old.id);
  }
  renderConvList(); renderBadges();
}

/* ══════════════════════════════════════════════
   RENDERS
══════════════════════════════════════════════ */

/* Sidebar: siempre los 4 canales, gris si no conectado */
function renderChannelsSidebar() {
  const connectedMap = {};
  S.channels.forEach(c => { if (c.connected) connectedMap[c.channel] = c; });

  const counts = {};
  S.conversations.forEach(c => {
    counts[c.channel] = (counts[c.channel] || 0) + (c.unread_count > 0 ? c.unread_count : 0);
  });

  $('channelsList').innerHTML = ALL_CHANNELS.map(ch => {
    const meta        = CHANNELS[ch];
    const connected   = !!connectedMap[ch];
    const count       = counts[ch] || 0;

    const pic = connected && connectedMap[ch].meta?.profile_picture_url;
    const right = connected
      ? (pic
          ? `<img src="${pic}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="">`
          : `<span class="n">${count || ''}</span>`)
      : `<span class="ci-connect-tag">Conectar</span>`;

    return `
      <button class="ci-chan-row${connected ? '' : ' ci-chan-disconnected'}" data-channel="${ch}" title="${connected ? meta.label + ' conectado' : 'Conectar ' + meta.label}">
        <span class="l">
          <span class="ci-chan-glyph chan-${meta.key}${connected ? '' : ' ci-glyph-gray'}" style="width:20px;height:20px">${GLYPH[meta.key]}</span>
          <span>${meta.label}</span>
        </span>
        ${right}
      </button>`;
  }).join('');

  $('channelsList').querySelectorAll('.ci-chan-row').forEach(btn => {
    btn.addEventListener('click', () => openChannelModal(btn.dataset.channel));
  });
}

/* Filtros por canal */
function renderFilters() {
  const counts = {};
  S.conversations.forEach(c => { counts[c.channel] = (counts[c.channel]||0)+1; });
  const total = S.conversations.length;

  const btns = [
    { f:'all', label:`Todos <span class="sc">${total}</span>`, glyph:'' },
    ...ALL_CHANNELS.map(ch => ({
      f: ch,
      label: `<span class="sc">${counts[ch]||0}</span>`,
      glyph: `<span class="ci-chan-glyph chan-${CHANNELS[ch].key}" style="width:18px;height:18px">${GLYPH[CHANNELS[ch].key]}</span>`,
    }))
  ];

  $('channelFilters').innerHTML = btns.map(b => `
    <button class="ci-seg-btn${S.activeFilter===b.f?' on':''}" data-f="${b.f}">
      ${b.glyph}${b.label}
    </button>`).join('');

  $('channelFilters').querySelectorAll('.ci-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => { S.activeFilter = btn.dataset.f; renderFilters(); renderConvList(); });
  });
}

/* Lista de conversaciones */
function renderConvList() {
  let list = S.conversations;
  if (S.activeFilter !== 'all') list = list.filter(c => c.channel === S.activeFilter);
  if (S.query.trim()) {
    const q = S.query.toLowerCase();
    list = list.filter(c =>
      (c.contact_name||'').toLowerCase().includes(q) ||
      (c.contact_handle||'').toLowerCase().includes(q) ||
      (c.last_message||'').toLowerCase().includes(q)
    );
  }
  if (!list.length) {
    $('convList').innerHTML = `<div class="ci-list-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>${S.query ? 'Sin resultados para "'+escHtml(S.query)+'"' : 'Sin conversaciones'}</p></div>`;
    return;
  }
  $('convList').innerHTML = list.map(convRowHTML).join('');
  $('convList').querySelectorAll('.ci-conv').forEach(el => {
    el.addEventListener('click', () => openConversation(el.dataset.id));
  });
  if (S.activeConvId) {
    const el = $('convList').querySelector(`[data-id="${S.activeConvId}"]`);
    if (el) el.classList.add('active');
  }
}

function convRowHTML(c) {
  const meta     = CHANNELS[c.channel] || {};
  const tint     = TINTS[(c.contact_avatar_tint||0) % TINTS.length];
  const label    = c.contact_name || c.contact_handle || '?';
  const initials = avatarInitials(label);
  const isUnread = c.unread_count > 0;
  const isActive = c.id === S.activeConvId;
  const time     = formatTime(c.last_message_at);

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

function renderThread() {
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv) return;
  const meta   = CHANNELS[conv.channel] || {};
  const handle = conv.contact_handle || '';

  let html = `<div class="ci-ctxbar"><span class="ci-chan-glyph chan-${meta.key}" style="width:18px;height:18px">${GLYPH[meta.key]||''}</span>Conversación por ${meta.label||''} · ${escHtml(handle)}</div>`;

  let lastDate = '';
  S.messages.forEach(m => {
    const dateStr = formatDate(m.sent_at);
    if (dateStr !== lastDate) { html += `<div class="ci-datechip"><span>${dateStr}</span></div>`; lastDate = dateStr; }
    html += messageHTML(m);
  });

  if (!S.messages.length) html += `<div style="text-align:center;color:var(--text-4);font-size:13px;padding:24px">Sin mensajes todavía</div>`;

  $('thread').innerHTML = html;
  $('thread').scrollTop = $('thread').scrollHeight;
}

function messageHTML(m) {
  const dir  = m.direction === 'in' ? 'in' : 'out';
  const time = formatTime(m.sent_at);
  let body   = m.media_url ? `<div class="ci-img-ph">[imagen]</div>` : '';
  body += m.body ? `<div>${escHtml(m.body)}</div>` : '';
  const check = dir === 'out'
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${m.delivery_status==='read'?'#fff':'rgba(255,255,255,.5)'}" stroke-width="2.4"><polyline points="18 7 9 17 5 13"/><polyline points="22 7 13 17 12.5 16.5"/></svg>`
    : '';
  return `<div class="ci-row ${dir}"><div class="ci-bubble ${dir}">${body}<div class="ci-meta">${time}${check}</div></div></div>`;
}

function renderBadges() {
  const totalUnread = S.conversations.reduce((s,c) => s + (c.unread_count||0), 0);
  const pending     = S.conversations.filter(c => c.last_sender==='contact' && c.unread_count>0).length;
  $('badge-all').textContent     = totalUnread || '';
  $('badge-pending').textContent = pending     || '';
  $('totalUnread').textContent   = totalUnread ? `${totalUnread} sin leer` : `${S.conversations.length} conversaciones`;
  renderChannelsSidebar();
  renderFilters();
}

function renderChatHeader(conv) {
  const meta     = CHANNELS[conv.channel] || {};
  const tint     = TINTS[(conv.contact_avatar_tint||0) % TINTS.length];
  const label    = conv.contact_name || conv.contact_handle || '?';
  const initials = avatarInitials(label);

  $('chatAv').innerHTML = `
    <span style="width:100%;height:100%;border-radius:13px;background:${tint[0]};color:${tint[1]};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${initials}</span>
    <span class="ci-av-badge chan-${meta.key}" style="position:absolute;right:-4px;bottom:-4px">${GLYPH[meta.key]||''}</span>`;

  $('chatName').textContent = label;
  $('chatMeta').innerHTML   = `
    <span class="ci-chan-chip chip-${meta.key}">${GLYPH[meta.key]||''}${meta.label||''}</span>
    <span class="ci-presence">${conv.is_online ? '<span class="ci-dot-live"></span> en línea' : 'visto recientemente'} · ${escHtml(conv.contact_handle||'')}</span>`;
}

/* ══════════════════════════════════════════════
   MODAL DE CONEXIÓN DE CANALES
══════════════════════════════════════════════ */
function openChannelModal(channel) {
  const meta      = CHANNELS[channel];
  const connected = S.channels.find(c => c.channel === channel && c.connected);

  const content = connected ? connectedModalHTML(channel, meta, connected) : connectModalHTML(channel, meta);

  const overlay = document.createElement('div');
  overlay.className = 'ci-modal-overlay';
  overlay.innerHTML = `
    <div class="ci-modal" role="dialog" aria-modal="true">
      <button class="ci-modal-close" id="modalClose" title="Cerrar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${content}
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  $('modalClose').addEventListener('click', closeModal);

  // Botón OAuth TikTok
  const tikBtn = document.getElementById('tikTokConnectBtn');
  if (tikBtn) {
    tikBtn.addEventListener('click', () => {
      const redirectUri = encodeURIComponent(OAUTH_CALLBACK);
      const state       = encodeURIComponent(S.branchId);
      const scopes      = 'user.info.basic,user.info.username,user.info.profile,user.account.type,video.list,biz.spark.auth';
      const oauthUrl    = `https://www.tiktok.com/v2/auth/authorize?client_key=${TIKTOK_CLIENT_KEY}&scope=${scopes}&response_type=code&redirect_uri=${redirectUri}&state=${state}`;
      window.location.href = oauthUrl;
    });
  }

  // Botón Meta connect (WhatsApp / Instagram / Facebook)
  const metaBtn = document.getElementById('metaConnectBtn');
  if (metaBtn) {
    metaBtn.addEventListener('click', async () => {
      const status = document.getElementById('metaConnectStatus');
      metaBtn.disabled = true;
      metaBtn.textContent = 'Conectando…';
      if (status) status.textContent = '';
      try {
        const result = await handleMetaConnect(channel);
        closeModal();
        await loadChannels();
        showToast(`✅ ${meta.label} conectado: ${result.handle || ''}`, 'success');
      } catch (err) {
        metaBtn.disabled = false;
        metaBtn.textContent = 'Conectar con Meta';
        if (status) status.textContent = '❌ ' + err.message;
      }
    });
  }

  // Botón desconectar
  const disconnBtn = document.getElementById('disconnectBtn');
  if (disconnBtn) {
    disconnBtn.addEventListener('click', async () => {
      await sb.from('chat_channels').update({ connected: false }).eq('branch_id', S.branchId).eq('channel', channel);
      closeModal();
      await loadChannels();
      showToast(`${meta.label} desconectado`, 'info');
    });
  }
}

function connectModalHTML(channel, meta) {
  const isTikTok = channel === 'tiktok';

  const channelIcon = `
    <div class="ci-modal-icon ci-modal-icon--${meta.key}">
      <span class="ci-chan-glyph chan-${meta.key}" style="width:32px;height:32px">${GLYPH[meta.key]}</span>
    </div>`;

  if (isTikTok) {
    return `
      ${channelIcon}
      <h2 class="ci-modal-title">Conectar TikTok</h2>
      <p class="ci-modal-desc">Vincula tu cuenta de TikTok for Business para recibir y responder mensajes directamente desde el Chat IA.</p>
      <div class="ci-modal-steps">
        <div class="ci-modal-step"><span class="ci-step-n">1</span><span>Haz clic en "Conectar con TikTok"</span></div>
        <div class="ci-modal-step"><span class="ci-step-n">2</span><span>Inicia sesión con tu cuenta TikTok Business</span></div>
        <div class="ci-modal-step"><span class="ci-step-n">3</span><span>Autoriza los permisos de mensajería</span></div>
      </div>
      <button class="ci-modal-btn ci-modal-btn--tk" id="tikTokConnectBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M16.2 3c.3 1.9 1.4 3.3 3.3 3.6v2.8c-1.2 0-2.3-.4-3.3-1.1v5.9a5 5 0 1 1-5-5c.2 0 .4 0 .6.05v2.9a2.1 2.1 0 1 0 1.5 2V3h2.9z"/></svg>
        Conectar con TikTok
      </button>`;
  }

  // WhatsApp / Instagram / Facebook — Embedded Signup
  const metaLabels = { whatsapp: 'WhatsApp Business', instagram: 'Instagram', facebook: 'Facebook' };
  const metaLabel  = metaLabels[channel] || meta.label;
  const btnColors  = { whatsapp: '#25D366', instagram: '#E1306C', facebook: '#0866FF' };
  const btnColor   = btnColors[channel] || '#5B6BFF';
  return `
    ${channelIcon}
    <h2 class="ci-modal-title">Conectar ${metaLabel}</h2>
    <p class="ci-modal-desc">Vincula tu cuenta de ${metaLabel} para recibir y responder mensajes directamente desde el Chat IA.</p>
    <div class="ci-modal-steps">
      <div class="ci-modal-step"><span class="ci-step-n">1</span><span>Haz clic en "Conectar con Meta"</span></div>
      <div class="ci-modal-step"><span class="ci-step-n">2</span><span>Inicia sesión con tu cuenta de Meta Business</span></div>
      <div class="ci-modal-step"><span class="ci-step-n">3</span><span>Autoriza los permisos y listo</span></div>
    </div>
    <button class="ci-modal-btn" id="metaConnectBtn" style="background:${btnColor}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
      Conectar con Meta
    </button>
    <p class="ci-modal-hint" id="metaConnectStatus"></p>`;
}

function connectedModalHTML(channel, meta, channelData) {
  const connectedAt = channelData.meta?.connected_at
    ? new Date(channelData.meta.connected_at).toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' })
    : 'recientemente';
  const pic = channelData.meta?.profile_picture_url;

  const iconHtml = pic
    ? `<div class="ci-modal-icon ci-modal-icon--avatar">
        <img src="${escHtml(pic)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;" alt="${escHtml(channelData.handle||'')}">
        <span class="ci-chan-glyph chan-${meta.key}" style="position:absolute;bottom:-4px;right:-4px;width:22px;height:22px;border-radius:50%;background:${meta.solid};display:flex;align-items:center;justify-content:center;border:2px solid #fff">${GLYPH[meta.key]}</span>
      </div>`
    : `<div class="ci-modal-icon ci-modal-icon--${meta.key}">
        <span class="ci-chan-glyph chan-${meta.key}" style="width:32px;height:32px">${GLYPH[meta.key]}</span>
      </div>`;

  return `
    ${iconHtml}
    <h2 class="ci-modal-title">${meta.label} conectado</h2>
    <div class="ci-modal-connected-info">
      <div class="ci-modal-info-row">
        <span>Cuenta</span><strong>${escHtml(channelData.handle || '—')}</strong>
      </div>
      <div class="ci-modal-info-row">
        <span>Conectado el</span><strong>${connectedAt}</strong>
      </div>
      <div class="ci-modal-info-row">
        <span>Estado</span><strong class="ci-status-ok">● Activo</strong>
      </div>
    </div>
    <button class="ci-modal-btn ci-modal-btn--danger" id="disconnectBtn">Desconectar</button>`;
}

function closeModal() {
  document.querySelector('.ci-modal-overlay')?.remove();
}

/* ══════════════════════════════════════════════
   ACCIONES
══════════════════════════════════════════════ */
async function openConversation(id) {
  S.activeConvId = id;
  const conv = S.conversations.find(c => c.id === id);
  if (!conv) return;
  if (conv.unread_count > 0) {
    conv.unread_count = 0;
    await sb.from('chat_conversations').update({ unread_count: 0 }).eq('id', id);
  }
  renderConvList(); renderBadges();
  $('chatEmpty').style.display  = 'none';
  $('chatHead').style.display   = 'flex';
  $('thread').style.display     = 'block';
  $('composer').style.display   = 'flex';
  renderChatHeader(conv);
  await loadMessages(id);
}

async function sendMessage() {
  const input = $('msgInput');
  const text  = input.value.trim();
  if (!text || !S.activeConvId) return;
  input.value = '';

  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId, direction:'out', body: text, delivery_status:'sending', sent_at: new Date().toISOString() });
  renderThread();

  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId,
    direction:'out', body: text, delivery_status:'sent', agent_id: S.user?.id || null,
  }]).select().single();

  if (error) { S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); return; }
  S.messages = S.messages.map(m => m.id === tmpId ? data : m);
  renderThread();

  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (conv) {
    conv.last_message = text; conv.last_message_at = data.sent_at; conv.last_sender = 'agent';
    S.conversations.sort((a,b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvList();
  }
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `ci-toast ci-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('ci-toast--show'));
  setTimeout(() => { t.classList.remove('ci-toast--show'); setTimeout(() => t.remove(), 400); }, 3500);
}

/* ══════════════════════════════════════════════
   EVENTOS
══════════════════════════════════════════════ */
function wireEvents() {
  $('filterToggle').addEventListener('click', () => {
    $('filterToggle').classList.toggle('active');
    $('filterWrap').classList.toggle('hidden');
  });
  $('searchInput').addEventListener('input', e => { S.query = e.target.value; renderConvList(); });
  $('sendBtn').addEventListener('click', sendMessage);
  $('msgInput').addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMessage(); } });
  document.querySelectorAll('.ci-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ci-nav-btn[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.activeView = btn.dataset.view;
      loadConversations();
    });
  });
  $('createOrderBtn')?.addEventListener('click', () => {
    showToast('Función "Crear pedido" — próximamente', 'info');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function avatarInitials(name) {
  if (!name) return '?';
  const clean = name.replace(/\D/g,'');
  if (clean.length >= 8) return clean.slice(-2);
  if (name.startsWith('@')) return name.slice(1,3).toUpperCase();
  return name.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (now - d < 86400000 && d.getDate()===now.getDate()) return d.toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit'});
  if (now - d < 172800000) return 'Ayer';
  return d.toLocaleDateString('es-CO',{day:'numeric',month:'short'});
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString()===now.toDateString()) return 'Hoy';
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (d.toDateString()===y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
}
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showFatalError(msg) {
  document.body.innerHTML = `<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:sans-serif;color:#F43F5E;font-size:14px;gap:8px">${escHtml(msg)}</div>`;
}

document.addEventListener('DOMContentLoaded', () => { loadFBSDK(); boot(); });

/* ══════════════════════════════════════════════
   META EMBEDDED SIGNUP
══════════════════════════════════════════════ */
const META_APP_ID    = '1732760657903466';
const META_CONFIG_ID = '1280428637212702';
const META_OAUTH_FN  = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/meta-oauth-callback';

function loadFBSDK() {
  if (document.getElementById('fb-sdk')) return;
  window.fbAsyncInit = function () {
    FB.init({ appId: META_APP_ID, cookie: true, xfbml: false, version: 'v22.0' });
  };
  const s = document.createElement('script');
  s.id = 'fb-sdk';
  s.src = 'https://connect.facebook.net/en_US/sdk.js';
  s.async = true; s.defer = true;
  document.head.appendChild(s);
}

function handleMetaConnect(channel) {
  return new Promise((resolve, reject) => {
    if (channel === 'whatsapp') {
      // WhatsApp Embedded Signup — flujo diferente al de Facebook/Instagram
      let wabaId = null, phoneId = null;

      function onWAMsg(event) {
        if (event.origin !== 'https://www.facebook.com') return;
        try {
          const d = JSON.parse(event.data);
          if (d.type === 'WA_EMBEDDED_SIGNUP' && d.event === 'FINISH') {
            wabaId = d.data.waba_id;
            phoneId = d.data.phone_number_id;
          }
        } catch {}
      }
      window.addEventListener('message', onWAMsg);

      FB.login(function(response) {
        window.removeEventListener('message', onWAMsg);
        if (!response.authResponse) { reject(new Error('Conexión cancelada')); return; }
  