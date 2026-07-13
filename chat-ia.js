/* ═══════════════════════════════════════════════════════════
   Chat IA — Cobra POS
   Bandeja omnicanal: WhatsApp · Instagram · Facebook · TikTok
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://tblujfduscslxjmrjbdr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibHVqZmR1c2NzbHhqbXJqYmRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU3NTcsImV4cCI6MjA5NjY4MTc1N30.0zudypPzlrOQ6dDa1Vp2XFFDL4Ea8dep1r3KMuEZGn0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: 'cobra-pos-session' }
});
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
  activeFilter: 'all', activeView: 'all', humanCount: 0,
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
  if (S.activeView === 'human')   q = q.eq('human_takeover', true).eq('status','open');
  if (['all','mine','pending'].includes(S.activeView)) { q = q.eq('status','open').eq('human_takeover', false); }
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
      if (msg.conversation_id === S.activeConvId && !S.messages.find(m => m.id === msg.id)) { S.messages.push(msg); renderThread(); }
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
    // Si cambia ai_typing en la conversación activa, re-render el thread
    if (payload.new.id === S.activeConvId && payload.new.ai_typing !== undefined) renderThread();
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
  const avatarUrl = c.contact_avatar_url || null;
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
        ${avatarUrl
          ? `<img src="${escHtml(avatarUrl)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;" alt="">`
          : `<span class="ci-av" style="background:${tint[0]};color:${tint[1]}">${initials}</span>`}
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

  if (!S.messages.length) html += `<div style="text-align:center;color:rgba(255,255,255,.35);font-size:13px;padding:24px">Sin mensajes todavía</div>`;

  // Indicador de escritura del asistente IA
  if (conv.ai_typing) {
    html += `<div class="ci-row in ci-typing-row">
      <div class="ci-bubble in ci-typing-bubble">
        <span class="ci-dot"></span><span class="ci-dot"></span><span class="ci-dot"></span>
      </div>
    </div>`;
  }

  $('thread').innerHTML = html;
  $('thread').scrollTop = $('thread').scrollHeight;
}

const QUICK_EMOJIS = ['👍','❤️','😂','😮','😢','🙏'];
let _activeMsgId = null;

function msgTriggerHTML(m) {
  return `<button class="ci-msg-trigger" data-msg-id="${escHtml(m.id)}" title="Opciones" onclick="openMsgPopup(event, '${escHtml(m.id)}')">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
  </button>`;
}

function openMsgPopup(e, msgId) {
  e.stopPropagation();
  const m = S.messages.find(x => x.id === msgId);
  if (!m) return;

  const popup = document.getElementById('msgMenuPopup');

  // Toggle off if same message clicked again
  if (_activeMsgId === msgId && popup.style.display !== 'none') {
    closeMsgPopup(); return;
  }
  _activeMsgId = msgId;

  // Build emoji row (only for incoming messages that have a Meta external_id)
  const emojisEl = document.getElementById('popupEmojis');
  const divider  = document.querySelector('.ci-popup-divider');
  if (m.direction === 'in' && m.external_id) {
    emojisEl.style.display = '';
    if (divider) divider.style.display = '';
    emojisEl.innerHTML = QUICK_EMOJIS.map(em =>
      `<button class="ci-pop-emoji" onclick="reactMsg('${escHtml(msgId)}','${em}')">${em}</button>`
    ).join('');
  } else {
    emojisEl.style.display = 'none';
    if (divider) divider.style.display = 'none';
    emojisEl.innerHTML = '';
  }

  // Build action items
  const itemsEl = document.getElementById('popupItems');
  let html = `<button class="ci-pop-item" onclick="replyMsg('${escHtml(msgId)}')">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>Responder</button>`;
  if (m.body && m.media_type !== 'sticker') {
    html += `<button class="ci-pop-item" onclick="copyMsg('${escHtml(msgId)}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copiar</button>`;
  }
  if (m.media_type === 'sticker' && m.media_url) {
    html += `<button class="ci-pop-item" onclick="saveStickerMsg('${escHtml(msgId)}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Guardar sticker</button>`;
  }
  itemsEl.innerHTML = html;

  // Position popup near the trigger button
  const trigger = e.currentTarget;
  const rect = trigger.getBoundingClientRect();
  const chatRect = document.querySelector('.ci-chat').getBoundingClientRect();

  popup.style.display = 'block';
  const popW = popup.offsetWidth || 280;
  const dir  = trigger.closest('.ci-row')?.classList.contains('out') ? 'out' : 'in';

  let left = dir === 'in' ? rect.left - chatRect.left : rect.right - chatRect.left - popW;
  // Keep within bounds
  left = Math.max(8, Math.min(left, chatRect.width - popW - 8));
  popup.style.left = left + 'px';
  popup.style.top  = (rect.bottom - chatRect.top + 6) + 'px';
}

function closeMsgPopup() {
  document.getElementById('msgMenuPopup').style.display = 'none';
  _activeMsgId = null;
}

function messageHTML(m) {
  const dir   = m.direction === 'in' ? 'in' : 'out';
  const time  = formatTime(m.sent_at);
  const check = dir === 'out'
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${m.delivery_status==='read'?'#fff':'rgba(255,255,255,.5)'}" stroke-width="2.4"><polyline points="18 7 9 17 5 13"/><polyline points="22 7 13 17 12.5 16.5"/></svg>`
    : '';
  const menu  = msgTriggerHTML(m);


  if (m.media_type === 'location') {
    let loc = {};
    try { loc = JSON.parse(m.body || '{}'); } catch {}
    const lat     = typeof loc.lat === 'number' ? loc.lat : 0;
    const lng     = typeof loc.lng === 'number' ? loc.lng : 0;
    const locName = escHtml(loc.name || '');
    const locAddr = escHtml(loc.addr || '');
    const coords  = lat.toFixed(5) + ', ' + lng.toFixed(5);
    const mapsUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng;
    const label   = locName || locAddr || coords;
    const subline = (locName && locAddr) ? '<div class="ci-loc-addr">' + locAddr + '</div>' : '';
    const locQuote = m._replyTo ? `<div class="ci-reply-quote"><div class="ci-reply-quote-bar"></div><div class="ci-reply-quote-body"><div class="ci-reply-quote-who">${escHtml(m._replyTo.who||'')}</div><div class="ci-reply-quote-text">📍 Ubicación</div></div></div>` : '';
    const locCard = `<a href="${mapsUrl}" target="_blank" rel="noopener" class="ci-location-card">
      <div class="ci-loc-map">
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#5B6BFF"/>
          <circle cx="14" cy="14" r="5" fill="white"/>
        </svg>
      </div>
      <div class="ci-loc-body">
        <div class="ci-loc-label">${label}</div>
        ${subline}
        <div class="ci-loc-coords">${coords}</div>
        <div class="ci-loc-link">Ver en Google Maps ↗</div>
      </div>
    </a>`;
    return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
      <div class="ci-bubble ${dir}">${menu}${locQuote}${locCard}<div class="ci-meta">${time}${check}</div></div>
    </div>`;
  }

  if (m.media_type === 'sticker' && m.media_url) {
    const stickerQuote = m._replyTo
      ? `<div class="ci-reply-quote"><div class="ci-reply-quote-bar"></div><div class="ci-reply-quote-body"><div class="ci-reply-quote-who">${escHtml(m._replyTo.who||'')}</div><div class="ci-reply-quote-text">${escHtml(m._replyTo.media_type==='sticker'?'[Sticker]':m._replyTo.media_type==='image'?'[Imagen]':(m._replyTo.body||'[Medio]'))}</div></div></div>`
      : '';
    return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
      <div class="ci-bubble-sticker">
        ${menu}${stickerQuote}
        <img src="${escHtml(m.media_url)}" class="ci-sticker-img" alt="sticker" loading="lazy">
        <div class="ci-meta ci-meta-sticker">${time}${check}</div>
      </div>
    </div>`;
  }

  let mediaHtml = '';
  if (m.media_url) {
    if (m.media_type === 'image') {
      mediaHtml = `<a href="${escHtml(m.media_url)}" target="_blank" rel="noopener"><img src="${escHtml(m.media_url)}" class="ci-img-thumb" alt="imagen" loading="lazy"></a>`;
    } else if (m.media_type === 'video') {
      mediaHtml = `<video src="${escHtml(m.media_url)}" class="ci-video-thumb" controls preload="metadata"></video>`;
    } else if (m.media_type === 'audio') {
      mediaHtml = `<audio src="${escHtml(m.media_url)}" controls style="width:220px;display:block"></audio>`;
    } else if (m.media_type === 'document') {
      mediaHtml = `<a href="${escHtml(m.media_url)}" target="_blank" rel="noopener" class="ci-doc-link">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${escHtml(m.body || 'Documento')}
      </a>`;
    }
  }

  const textHtml = m.body && m.media_type !== 'document' ? `<div>${escHtml(m.body)}</div>` : '';

  // Build quote bubble — outgoing replies use _replyTo (session snapshot),
  // incoming replies from WhatsApp use reply_to_body / reply_to_external_id (from DB)
  let quoteHtml = '';
  if (m._replyTo) {
    const qText = m._replyTo.media_type === 'sticker' ? '[Sticker]' : m._replyTo.media_type === 'image' ? '[Imagen]' : (m._replyTo.body || '[Medio]');
    quoteHtml = `<div class="ci-reply-quote"><div class="ci-reply-quote-bar"></div><div class="ci-reply-quote-body"><div class="ci-reply-quote-who">${escHtml(m._replyTo.who||'')}</div><div class="ci-reply-quote-text">${escHtml(qText)}</div></div></div>`;
  } else if (m.reply_to_body || m.reply_to_external_id) {
    const quoted = m.reply_to_external_id ? S.messages.find(x => x.external_id === m.reply_to_external_id) : null;
    const conv   = S.conversations.find(c => c.id === S.activeConvId);
    const who    = quoted ? (quoted.direction === 'out' ? 'Tú' : (conv?.contact_name || 'Contacto')) : '';
    const qText  = m.reply_to_body || '[Mensaje]';
    quoteHtml = `<div class="ci-reply-quote"><div class="ci-reply-quote-bar"></div><div class="ci-reply-quote-body"><div class="ci-reply-quote-who">${escHtml(who)}</div><div class="ci-reply-quote-text">${escHtml(qText)}</div></div></div>`;
  }

  const body = quoteHtml + mediaHtml + textHtml;

  return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
    <div class="ci-bubble ${dir}">${menu}${body}<div class="ci-meta">${time}${check}</div></div>
  </div>`;
}

function renderBadges() {
  const totalUnread = S.conversations.reduce((s,c) => s + (c.unread_count||0), 0);
  const pending     = S.conversations.filter(c => c.last_sender==='contact' && c.unread_count>0).length;
  $('badge-all').textContent     = totalUnread || '';
  $('badge-pending').textContent = pending     || '';
  updateHumanBadge();
  $('totalUnread').textContent   = totalUnread ? `${totalUnread} sin leer` : `${S.conversations.length} conversaciones`;
  renderChannelsSidebar();
  renderFilters();
}

function renderChatHeader(conv) {
  updateHumanToggleBtn(!!conv.human_takeover);
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
    // NO async — FB.login() necesita contexto sincrónico de gesto de usuario
    // Si el handler es async, Chrome bloquea el popup y redirige a página completa
    metaBtn.addEventListener('click', () => {
      const status = document.getElementById('metaConnectStatus');
      metaBtn.disabled = true;
      metaBtn.textContent = 'Conectando…';
      if (status) status.textContent = '';
      handleMetaConnect(channel)
        .then(result => {
          closeModal();
          loadChannels();
          showToast(`✅ ${meta.label} conectado: ${result.handle || ''}`, 'success');
        })
        .catch(err => {
          metaBtn.disabled = false;
          metaBtn.textContent = 'Conectar con Meta';
          if (status) status.textContent = '❌ ' + err.message;
        });
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
  const replySnapshot = S.replyTo ? { ...S.replyTo } : null;
  S.messages = S.messages.map(m => m.id === tmpId ? { ...data, _replyTo: replySnapshot } : m);
  renderThread();

  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (conv) {
    conv.last_message = text; conv.last_message_at = data.sent_at; conv.last_sender = 'agent';
    S.conversations.sort((a,b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvList();
  }

  // Enviar vía Meta API (solo canales conectados: ig, fb, wa)
  if (conv && ['instagram','facebook','whatsapp'].includes(conv.channel)) {
    try {
      const payload = { conversation_id: S.activeConvId, text, message_id: data.id };
      if (S.replyTo?.external_id) payload.reply_to_external_id = S.replyTo.external_id;
      const sendRes = await fetch(META_SEND_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const sendData = await sendRes.json();
      if (sendData.error) {
        showToast('No se pudo enviar el mensaje: ' + sendData.error, 'error');
        S.messages = S.messages.map(m => m.id === data.id ? { ...m, delivery_status: 'error' } : m);
        renderThread();
      }
    } catch (e) {
      showToast('Error al enviar: ' + e.message, 'error');
    }
  }
  clearReply();
}

/* ══════════════════════════════════════════════
   ACCIONES DE MENSAJE (hover menu)
══════════════════════════════════════════════ */
async function reactMsg(msgId, emoji) {
  const m = S.messages.find(x => x.id === msgId);
  if (!m || !m.external_id || !S.activeConvId) return;
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv || !['whatsapp','instagram','facebook'].includes(conv.channel)) return;
  try {
    const res = await fetch(META_SEND_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: S.activeConvId, reaction_emoji: emoji, react_to_external_id: m.external_id }),
    });
    const data = await res.json();
    if (data.error) showToast('No se pudo reaccionar: ' + data.error, 'error');
    else { closeMsgPopup(); showToast('Reacción enviada', 'success'); }
  } catch (e) { showToast('Error al reaccionar: ' + e.message, 'error'); }
}

function replyMsg(msgId) {
  const m = S.messages.find(x => x.id === msgId);
  if (!m) return;
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  S.replyTo = { id: m.id, external_id: m.external_id, body: m.body, media_type: m.media_type, who: m.direction === 'in' ? (conv?.contact_name || 'Contacto') : 'Tú' };
  const preview = m.media_type === 'sticker' ? '[Sticker]' : m.media_type === 'image' ? '[Imagen]' : (m.body || '[Medio]');
  $('replyWho').textContent  = S.replyTo.who;
  $('replyText').textContent = preview;
  $('replyPreview').style.display = 'flex';
  $('msgInput').focus();
}

function copyMsg(msgId) {
  const m = S.messages.find(x => x.id === msgId);
  if (!m?.body) return;
  navigator.clipboard.writeText(m.body).then(() => showToast('Copiado'));
}

function saveStickerMsg(msgId) {
  // Stickers are already auto-saved; open the panel to confirm
  showToast('Sticker disponible en el panel ✓');
  openPickerPanel('sticker');
}

function clearReply() {
  S.replyTo = null;
  $('replyPreview').style.display = 'none';
}

/* ══════════════════════════════════════════════
   EMOJI + STICKER PICKER
══════════════════════════════════════════════ */
const EMOJI_DATA = [
  { id:'smileys', icon:'\u{1F600}', name:'Caritas',
    emojis:['\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F923}','\u{1F602}','\u{1F642}','\u{1F643}','\u{1FAE0}','\u{1F609}','\u{1F60A}','\u{1F607}','\u{1F970}','\u{1F60D}','\u{1F929}','\u{1F618}','\u{1F617}','\u{1F61A}','\u{1F619}','\u{1F972}','\u{1F60B}','\u{1F61B}','\u{1F61C}','\u{1F92A}','\u{1F61D}','\u{1F911}','\u{1F917}','\u{1FAE1}','\u{1F92D}','\u{1FAE2}','\u{1FAE3}','\u{1F92B}','\u{1F914}','\u{1FAE4}','\u{1F610}','\u{1F611}','\u{1F636}','\u{1FAE5}','\u{1F60F}','\u{1F612}','\u{1F644}','\u{1F62C}','\u{1F925}','\u{1FAE8}','\u{1F60C}','\u{1F614}','\u{1F62A}','\u{1F924}','\u{1F634}','\u{1F637}','\u{1F912}','\u{1F915}','\u{1F922}','\u{1F92E}','\u{1F927}','\u{1F975}','\u{1F976}','\u{1F974}','\u{1F635}','\u{1F92F}','\u{1F920}','\u{1F973}','\u{1F978}','\u{1F60E}','\u{1F913}','\u{1F9D0}','\u{1F615}','\u{1FAE4}','\u{1F61F}','\u{1F641}','☹️','\u{1F62E}','\u{1F62F}','\u{1F632}','\u{1F633}','\u{1F97A}','\u{1F979}','\u{1F626}','\u{1F627}','\u{1F628}','\u{1F630}','\u{1F625}','\u{1F622}','\u{1F62D}','\u{1F631}','\u{1F616}','\u{1F623}','\u{1F61E}','\u{1F613}','\u{1F629}','\u{1F62B}','\u{1F971}','\u{1F624}','\u{1F621}','\u{1F620}','\u{1F92C}','\u{1F608}','\u{1F47F}','\u{1F480}','☠️','\u{1F4A9}','\u{1F921}','\u{1F479}','\u{1F47A}','\u{1F47B}','\u{1F47D}','\u{1F47E}','\u{1F916}','\u{1F63A}','\u{1F638}','\u{1F639}','\u{1F63B}','\u{1F63C}','\u{1F63D}','\u{1F640}','\u{1F63F}','\u{1F63E}'] },
  { id:'people', icon:'\u{1F44B}', name:'Gestos',
    emojis:['\u{1F44B}','\u{1F91A}','\u{1F590}️','✋','\u{1F596}','\u{1FAF1}','\u{1FAF2}','\u{1FAF3}','\u{1FAF4}','\u{1FAF7}','\u{1FAF8}','\u{1F44C}','\u{1F90C}','\u{1F90F}','✌️','\u{1F91E}','\u{1FAF0}','\u{1F91F}','\u{1F918}','\u{1F919}','\u{1F448}','\u{1F449}','\u{1F446}','\u{1F595}','\u{1F447}','☝️','\u{1FAF5}','\u{1F44D}','\u{1F44E}','✊','\u{1F44A}','\u{1F91B}','\u{1F91C}','\u{1F44F}','\u{1F64C}','\u{1FAF6}','\u{1F450}','\u{1F932}','\u{1F91D}','\u{1F64F}','✍️','\u{1F485}','\u{1F933}','\u{1F4AA}','\u{1F9BE}','\u{1F9BF}','\u{1F9B5}','\u{1F9B6}','\u{1F442}','\u{1F9BB}','\u{1F443}','\u{1FAC0}','\u{1FAC1}','\u{1F9E0}','\u{1F9B7}','\u{1F9B4}','\u{1F440}','\u{1F441}️','\u{1F445}','\u{1F444}','\u{1FAC6}','\u{1F476}','\u{1F466}','\u{1F467}','\u{1F9D2}','\u{1F9D1}','\u{1F471}','\u{1F468}','\u{1F9D4}','\u{1F469}','\u{1F9D3}','\u{1F474}','\u{1F475}','\u{1F64D}','\u{1F64E}','\u{1F645}','\u{1F646}','\u{1F481}','\u{1F64B}','\u{1F9CF}','\u{1F647}','\u{1F926}','\u{1F937}','\u{1F46B}','\u{1F46C}','\u{1F46D}','\u{1F491}','\u{1F48F}','\u{1F46A}'] },
  { id:'animals', icon:'\u{1F436}', name:'Animales',
    emojis:['\u{1F436}','\u{1F431}','\u{1F42D}','\u{1F439}','\u{1F430}','\u{1F98A}','\u{1F43B}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F981}','\u{1F42E}','\u{1F437}','\u{1F438}','\u{1F435}','\u{1F648}','\u{1F649}','\u{1F64A}','\u{1F414}','\u{1F427}','\u{1F426}','\u{1F424}','\u{1F986}','\u{1F985}','\u{1F989}','\u{1F987}','\u{1F43A}','\u{1F417}','\u{1F434}','\u{1F984}','\u{1F41D}','\u{1F41B}','\u{1F98B}','\u{1F40C}','\u{1F41E}','\u{1F41C}','\u{1FAB2}','\u{1F99F}','\u{1F997}','\u{1FAB3}','\u{1F577}️','\u{1F982}','\u{1F422}','\u{1F40D}','\u{1F98E}','\u{1F996}','\u{1F995}','\u{1F419}','\u{1F991}','\u{1F990}','\u{1F99E}','\u{1F980}','\u{1F421}','\u{1F420}','\u{1F41F}','\u{1F42C}','\u{1F433}','\u{1F40B}','\u{1F988}','\u{1F9AD}','\u{1F40A}','\u{1F405}','\u{1F406}','\u{1F993}','\u{1F98D}','\u{1F9A7}','\u{1F418}','\u{1F99B}','\u{1F98F}','\u{1F42A}','\u{1F42B}','\u{1F992}','\u{1F998}','\u{1F9AC}','\u{1F403}','\u{1F402}','\u{1F404}','\u{1F40E}','\u{1F416}','\u{1F40F}','\u{1F411}','\u{1F999}','\u{1F410}','\u{1F98C}','\u{1F415}','\u{1F429}','\u{1F9AE}','\u{1F408}','\u{1FA76}','\u{1F413}','\u{1F983}','\u{1F9A4}','\u{1F99A}','\u{1F99C}','\u{1F9A2}','\u{1F54A}️','\u{1F335}','\u{1F332}','\u{1F333}','\u{1F334}','\u{1FAB5}','\u{1F331}','\u{1F33F}','☘️','\u{1F340}','\u{1F38D}','\u{1F38B}','\u{1F343}','\u{1F342}','\u{1F341}','\u{1F344}','\u{1F33E}','\u{1F490}','\u{1F337}','\u{1F339}','\u{1F940}','\u{1F33A}','\u{1F338}','\u{1F33C}','\u{1F33B}','\u{1F31E}'] },
  { id:'food', icon:'\u{1F355}', name:'Comida',
    emojis:['\u{1F34F}','\u{1F34E}','\u{1F350}','\u{1F34A}','\u{1F34B}','\u{1F34C}','\u{1F349}','\u{1F347}','\u{1F353}','\u{1FAD0}','\u{1F348}','\u{1F352}','\u{1F351}','\u{1F96D}','\u{1F34D}','\u{1F965}','\u{1F95D}','\u{1F345}','\u{1F346}','\u{1F951}','\u{1FAD5}','\u{1F966}','\u{1F96C}','\u{1F952}','\u{1F33D}','\u{1FAD1}','\u{1F9C4}','\u{1F9C5}','\u{1F954}','\u{1F360}','\u{1FAD9}','\u{1F950}','\u{1F96F}','\u{1F35E}','\u{1F956}','\u{1F968}','\u{1F9C0}','\u{1F95A}','\u{1F373}','\u{1F9C8}','\u{1F95E}','\u{1F9C7}','\u{1F953}','\u{1F969}','\u{1F357}','\u{1F356}','\u{1F9B4}','\u{1F32E}','\u{1F32F}','\u{1FAD4}','\u{1F959}','\u{1F9C6}','\u{1F95A}','\u{1F371}','\u{1F358}','\u{1F359}','\u{1F35A}','\u{1F35B}','\u{1F35C}','\u{1F35D}','\u{1F360}','\u{1F362}','\u{1F363}','\u{1F364}','\u{1F365}','\u{1F96E}','\u{1F366}','\u{1F367}','\u{1F368}','\u{1F369}','\u{1F36A}','\u{1F382}','\u{1F370}','\u{1F36E}','\u{1F36D}','\u{1F36C}','\u{1F36B}','\u{1F37F}','\u{1F369}','\u{1F36A}','\u{1F330}','\u{1F95C}','\u{1F36F}','\u{1F9C3}','\u{1F964}','\u{1F9CB}','\u{1F375}','☕','\u{1F37A}','\u{1F37B}','\u{1F942}','\u{1F377}','\u{1F943}','\u{1F378}','\u{1F379}','\u{1F9C9}','\u{1F37E}','\u{1F376}'] },
  { id:'travel', icon:'✈️', name:'Viajes',
    emojis:['\u{1F697}','\u{1F695}','\u{1F699}','\u{1F3CE}️','\u{1F693}','\u{1F691}','\u{1F692}','\u{1F690}','\u{1F6FB}','\u{1F69A}','\u{1F69B}','\u{1F69C}','\u{1F3CD}️','\u{1F6F5}','\u{1F6FA}','\u{1F6B2}','\u{1F6F4}','\u{1F6F9}','\u{1F6FC}','\u{1F6F7}','\u{1F68F}','\u{1F6E3}️','\u{1F6E4}️','⛽','\u{1F6A8}','\u{1F6A5}','\u{1F6A6}','\u{1F6A7}','⚓','\u{1F9DF}','⛵','\u{1F6A4}','\u{1F6A5}','\u{1F6F3}️','⚴','\u{1F6A2}','✈️','\u{1F6E9}️','\u{1F6EB}','\u{1F6EC}','\u{1FA82}','\u{1F4BA}','\u{1F681}','\u{1F680}','\u{1F6F8}','\u{1F3D6}️','\u{1F3DD}️','\u{1F3DC}️','\u{1F3D5}️','\u{1F3D4}️','⛰️','\u{1F30B}','\u{1F3D7}️','\u{1F3E0}','\u{1F3E1}','\u{1F3E2}','\u{1F3E3}','\u{1F3E5}','\u{1F3E6}','\u{1F3E8}','\u{1F3E9}','\u{1F3EA}','\u{1F3EB}','\u{1F3EC}','\u{1F3ED}','\u{1F3EF}','\u{1F3F0}','\u{1F492}','\u{1F5FC}','\u{1F5FD}','⛪','\u{1F54C}','\u{1F6D5}','\u{1F54D}','⛩️','\u{1F5BE}️','\u{1F307}','\u{1F306}','\u{1F3D9}️','\u{1F303}','\u{1F304}','\u{1F305}','\u{1F320}','\u{1F386}','\u{1F387}','\u{1F30C}','\u{1F309}','\u{1F30A}'] },
  { id:'activities', icon:'⚽', name:'Actividades',
    emojis:['⚽','\u{1F3C0}','\u{1F3C8}','⚾','\u{1F94E}','\u{1F3BE}','\u{1F3D0}','\u{1F3C9}','\u{1F94F}','\u{1F3B1}','\u{1FA80}','\u{1F3D3}','\u{1F3F8}','\u{1F3D2}','\u{1F94A}','\u{1F94B}','⛳','\u{1FA81}','\u{1F3A3}','\u{1F93F}','\u{1F3BD}','\u{1F3BF}','\u{1F6F7}','\u{1F94C}','\u{1F3AF}','\u{1FA83}','\u{1F3F9}','\u{1F3AE}','\u{1F579}️','\u{1F3B2}','♟️','\u{1F3AD}','\u{1F3A8}','\u{1F3B0}','\u{1F6B5}','\u{1F9D7}','\u{1F938}','⛹️','\u{1F93A}','\u{1F93C}','\u{1F3CB}️','\u{1F93E}','\u{1F3CC}️','\u{1F3C7}','\u{1F9D8}','\u{1F3C4}','\u{1F3CA}','\u{1F6A3}','\u{1F9DC}','\u{1F3C6}','\u{1F947}','\u{1F948}','\u{1F949}','\u{1F3C5}','\u{1F396}️','\u{1F397}️','\u{1F3AA}','\u{1F939}','\u{1F3AC}','\u{1F3A4}','\u{1F3A7}','\u{1F3BC}','\u{1F3B5}','\u{1F3B6}','\u{1F3B8}','\u{1F3B9}','\u{1F941}','\u{1FA98}','\u{1F3BA}','\u{1F3B7}','\u{1FA97}','\u{1F3BB}','\u{1FA95}','\u{1F3B9}','\u{1F399}️','\u{1F39A}️','\u{1F39B}️','\u{1F4FB}','\u{1F39E}️','\u{1F4FD}️','\u{1F3A5}','\u{1F4FA}','\u{1F4F7}','\u{1F4F8}','\u{1F4F9}','\u{1F4FC}'] },
  { id:'objects', icon:'\u{1F4A1}', name:'Objetos',
    emojis:['\u{1F4A1}','\u{1F526}','\u{1F56F}️','\u{1F4B0}','\u{1F4B4}','\u{1F4B5}','\u{1F4B6}','\u{1F4B7}','\u{1F4B8}','\u{1F4B3}','\u{1FA99}','\u{1F4B9}','\u{1F4C8}','\u{1F4C9}','\u{1F4CA}','✉️','\u{1F4E7}','\u{1F4E8}','\u{1F4E9}','\u{1F4EA}','\u{1F4EB}','\u{1F4EC}','\u{1F4ED}','\u{1F4EE}','\u{1F5F3}️','✏️','✒️','\u{1F58A}️','\u{1F58B}️','\u{1F4DD}','\u{1F4BC}','\u{1F4C1}','\u{1F4C2}','\u{1F5C2}️','\u{1F4C5}','\u{1F4C6}','\u{1F5D2}️','\u{1F5D3}️','\u{1F4C7}','\u{1F4CB}','\u{1F4CC}','\u{1F4CD}','\u{1F4CE}','\u{1F587}️','✂️','\u{1F5C3}️','\u{1F5C4}️','\u{1F5D1}️','\u{1F512}','\u{1F513}','\u{1F50F}','\u{1F510}','\u{1F511}','\u{1F5DD}️','\u{1F528}','\u{1FA93}','⛏️','\u{1F527}','\u{1FA9B}','\u{1F529}','⚙️','\u{1F5DC}️','\u{1F517}','⛓️','\u{1F9F0}','\u{1FA9F}','\u{1F9F2}','\u{1F52C}','\u{1F52D}','\u{1F4A8}','\u{1F9EA}','\u{1F9EB}','\u{1F9EC}','\u{1F50B}','\u{1FAAB}','\u{1F50C}','\u{1F4BB}','\u{1F5A5}️','\u{1F5A8}️','⌨️','\u{1F5B1}️','\u{1F4F1}','\u{1F4F2}','☎️','\u{1F4DE}','\u{1F4DF}','\u{1F4E0}','\u{1F4E1}','\u{1F9AD}','⌚','⏰','⌛','⏳','\u{1F4E6}'] },
  { id:'symbols', icon:'❤️', name:'S\xEDmbolos',
    emojis:['❤️','\u{1F9E1}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F5A4}','\u{1F90D}','\u{1F90E}','\u{1F494}','❤️‍\u{1F525}','❤️‍\u{1FA79}','\u{1F495}','\u{1F49E}','\u{1F493}','\u{1F497}','\u{1F496}','\u{1F498}','\u{1F49D}','\u{1F49F}','☮️','➕','➖','✖️','✔️','❌','⭕','\u{1F6D1}','⛔','\u{1F4DB}','\u{1F6AB}','\u{1F6B3}','\u{1F6AD}','\u{1F6AF}','\u{1F6B1}','\u{1F6B7}','\u{1F4F5}','\u{1F51E}','\u{1F4A2}','♿','\u{1F199}','\u{1F19A}','\u{1F197}','\u{1F198}','\u{1F195}','\u{1F196}','\u{1F191}','\u{1F18E}','\u{1F171}️','\u{1F170}️','\u{1F17E}️','\u{1F1AE}','\u{1F17F}️','\u{1F193}','\u{1F194}','\u{1F192}','⬆️','⬇️','➡️','⬅️','\u{1F501}','\u{1F502}','▶️','⏩','⏭️','⏯️','◀️','⏪','⏮️','\u{1F503}','\u{1F3B5}','\u{1F514}','\u{1F515}','\u{1F507}','\u{1F508}','\u{1F509}','\u{1F50A}','\u{1F4E2}','\u{1F4E3}','\u{1F514}','\u{1F515}','\u{1F3B6}','\u{1F4AC}','\u{1F4AD}','\u{1F4AC}','\u{1F4A4}','\u{1F310}','\u{1F194}','☑️','\u{1F4AF}','\u{1F51A}'] },
  { id:'flags', icon:'\u{1F6A9}', name:'Banderas',
    emojis:['\u{1F3F3}️','\u{1F3F4}','\u{1F3C1}','\u{1F6A9}','\u{1F3F3}️‍\u{1F308}','\u{1F3F3}️‍⚧️','\u{1F3F4}‍☠️','\u{1F1E6}\u{1F1EB}','\u{1F1E6}\u{1F1F1}','\u{1F1E9}\u{1F1FF}','\u{1F1E6}\u{1F1E9}','\u{1F1E6}\u{1F1F4}','\u{1F1E6}\u{1F1F7}','\u{1F1E6}\u{1F1F2}','\u{1F1E6}\u{1F1FA}','\u{1F1E6}\u{1F1F9}','\u{1F1E6}\u{1F1FF}','\u{1F1E7}\u{1F1ED}','\u{1F1E7}\u{1F1E9}','\u{1F1E7}\u{1F1EA}','\u{1F1E7}\u{1F1FF}','\u{1F1E7}\u{1F1EF}','\u{1F1E7}\u{1F1F4}','\u{1F1E7}\u{1F1E6}','\u{1F1E7}\u{1F1F7}','\u{1F1E7}\u{1F1F3}','\u{1F1E7}\u{1F1EC}','\u{1F1E7}\u{1F1EE}','\u{1F1E7}\u{1F1F4}','\u{1F1E7}\u{1F1F8}','\u{1F1E7}\u{1F1FC}','\u{1F1E7}\u{1F1FE}','\u{1F1E7}\u{1F1F7}','\u{1F1E7}\u{1F1F3}','\u{1F1E7}\u{1F1EC}','\u{1F1E7}\u{1F1EB}','\u{1F1E7}\u{1F1EE}','\u{1F1E8}\u{1F1FB}','\u{1F1F0}\u{1F1ED}','\u{1F1E8}\u{1F1F2}','\u{1F1E8}\u{1F1E6}','\u{1F1E8}\u{1F1EB}','\u{1F1F9}\u{1F1E9}','\u{1F1E8}\u{1F1ED}','\u{1F1E8}\u{1F1F1}','\u{1F1E8}\u{1F1F3}','\u{1F1E8}\u{1F1F4}','\u{1F1E8}\u{1F1F7}','\u{1F1F3}\u{1F1EC}','\u{1F1E8}\u{1F1FA}','\u{1F1E8}\u{1F1FE}','\u{1F1E8}\u{1F1FF}','\u{1F1E8}\u{1F1E9}','\u{1F1E9}\u{1F1F0}','\u{1F1E9}\u{1F1EF}','\u{1F1E9}\u{1F1F4}','\u{1F1E8}\u{1F1F4}','\u{1F1E9}\u{1F1F2}','\u{1F1EA}\u{1F1E8}','\u{1F1F8}\u{1F1FB}','\u{1F1EA}\u{1F1EC}','\u{1F1EA}\u{1F1F7}','\u{1F1EA}\u{1F1EA}','\u{1F1EA}\u{1F1F9}','\u{1F1EA}\u{1F1FA}','\u{1F1EB}\u{1F1EF}','\u{1F1EB}\u{1F1EE}','\u{1F1EB}\u{1F1F7}','\u{1F1EC}\u{1F1E6}','\u{1F1EC}\u{1F1F2}','\u{1F1EC}\u{1F1EA}','\u{1F1E9}\u{1F1EA}','\u{1F1EC}\u{1F1ED}','\u{1F1EC}\u{1F1F7}','\u{1F1EC}\u{1F1F3}','\u{1F1EC}\u{1F1FC}','\u{1F1EC}\u{1F1F9}','\u{1F1EC}\u{1F1FA}','\u{1F1EC}\u{1F1F3}','\u{1F1EC}\u{1F1FE}','\u{1F1ED}\u{1F1F9}','\u{1F1ED}\u{1F1F3}','\u{1F1ED}\u{1F1FA}','\u{1F1EE}\u{1F1F8}','\u{1F1EE}\u{1F1F3}','\u{1F1EE}\u{1F1E9}','\u{1F1EE}\u{1F1F7}','\u{1F1EE}\u{1F1F6}','\u{1F1EE}\u{1F1EA}','\u{1F1EE}\u{1F1F1}','\u{1F1EF}\u{1F1F2}','\u{1F1EF}\u{1F1F5}','\u{1F1EF}\u{1F1F4}','\u{1F1EF}\u{1F1EA}','\u{1F1F0}\u{1F1FF}','\u{1F1F0}\u{1F1EA}','\u{1F1F0}\u{1F1F7}','\u{1F1F0}\u{1F1FC}','\u{1F1F1}\u{1F1E6}','\u{1F1F1}\u{1F1FB}','\u{1F1F1}\u{1F1E7}','\u{1F1F1}\u{1F1F8}','\u{1F1F1}\u{1F1F7}','\u{1F1F1}\u{1F1EE}','\u{1F1F1}\u{1F1F9}','\u{1F1F1}\u{1F1FA}','\u{1F1F1}\u{1F1FE}','\u{1F1F2}\u{1F1EC}','\u{1F1F2}\u{1F1FC}','\u{1F1F2}\u{1F1FE}','\u{1F1F2}\u{1F1FB}','\u{1F1F2}\u{1F1F1}','\u{1F1F2}\u{1F1F9}','\u{1F1F2}\u{1F1F7}','\u{1F1F2}\u{1F1FA}','\u{1F1F2}\u{1F1FD}','\u{1F1F2}\u{1F1E9}','\u{1F1F2}\u{1F1F3}','\u{1F1F2}\u{1F1E8}','\u{1F1F2}\u{1F1F0}','\u{1F1F2}\u{1F1F7}','\u{1F1F2}\u{1F1FA}','\u{1F1F2}\u{1F1FF}','\u{1F1F3}\u{1F1E6}','\u{1F1F3}\u{1F1F5}','\u{1F1F3}\u{1F1F1}','\u{1F1F3}\u{1F1EE}','\u{1F1F3}\u{1F1EC}','\u{1F1F3}\u{1F1F4}','\u{1F1F3}\u{1F1F7}','\u{1F1F3}\u{1F1FA}','\u{1F1F4}\u{1F1F2}','\u{1F1F5}\u{1F1F0}','\u{1F1F5}\u{1F1FC}','\u{1F1F5}\u{1F1E6}','\u{1F1F5}\u{1F1EC}','\u{1F1F5}\u{1F1FE}','\u{1F1F5}\u{1F1EA}','\u{1F1F5}\u{1F1ED}','\u{1F1F5}\u{1F1F1}','\u{1F1F5}\u{1F1F3}','\u{1F1F5}\u{1F1F7}','\u{1F1F6}\u{1F1E6}','\u{1F1F7}\u{1F1F4}','\u{1F1F7}\u{1F1FA}','\u{1F1F7}\u{1F1FC}','\u{1F1F8}\u{1F1FC}','\u{1F1F8}\u{1F1F2}','\u{1F1F8}\u{1F1E6}','\u{1F1F8}\u{1F1F3}','\u{1F1F8}\u{1F1F8}','\u{1F1F8}\u{1F1EA}','\u{1F1F8}\u{1F1F1}','\u{1F1F8}\u{1F1EC}','\u{1F1F8}\u{1F1F0}','\u{1F1F8}\u{1F1EE}','\u{1F1F8}\u{1F1F4}','\u{1F1F8}\u{1F1F8}','\u{1F1F8}\u{1F1F7}','\u{1F1F8}\u{1F1FF}','\u{1F1F8}\u{1F1EA}','\u{1F1F8}\u{1F1E9}','\u{1F1F9}\u{1F1FC}','\u{1F1F9}\u{1F1EF}','\u{1F1F9}\u{1F1FF}','\u{1F1F9}\u{1F1ED}','\u{1F1F9}\u{1F1F1}','\u{1F1F9}\u{1F1EC}','\u{1F1F9}\u{1F1F4}','\u{1F1F9}\u{1F1F9}','\u{1F1F9}\u{1F1F3}','\u{1F1F9}\u{1F1F7}','\u{1F1F9}\u{1F1F2}','\u{1F1FA}\u{1F1EC}','\u{1F1FA}\u{1F1E6}','\u{1F1FA}\u{1F1FF}','\u{1F1FB}\u{1F1EA}','\u{1F1FB}\u{1F1F3}','\u{1F1FB}\u{1F1FA}','\u{1F1FC}\u{1F1F8}','\u{1F1FE}\u{1F1EA}','\u{1F1FE}\u{1F1F9}','\u{1F1FF}\u{1F1F2}','\u{1F1FF}\u{1F1FC}','\u{1F1FA}\u{1F1F8}','\u{1F1EC}\u{1F1E7}','\u{1F1E8}\u{1F1F4}'] }
];

let _emojiActiveCat = 'smileys';
let _pickerActiveTab = 'emoji';

function openPickerPanel(tab) {
  tab = tab || 'emoji';
  const panel = $('pickerPanel');
  if (panel.style.display !== 'none' && _pickerActiveTab === tab) {
    panel.style.display = 'none'; return;
  }
  panel.style.display = 'flex';
  switchPickerTab(tab);
}

function switchPickerTab(tab) {
  _pickerActiveTab = tab;
  $('tabEmoji').classList.toggle('active', tab === 'emoji');
  $('tabSticker').classList.toggle('active', tab === 'sticker');
  $('emojiPane').style.display   = tab === 'emoji'   ? 'flex' : 'none';
  $('stickerPane').style.display = tab === 'sticker' ? 'flex' : 'none';
  if (tab === 'emoji')   { renderEmojiCats(); renderEmojiGrid(_emojiActiveCat); }
  if (tab === 'sticker') loadStickerPanel();
}

function renderEmojiCats() {
  $('emojiCats').innerHTML = EMOJI_DATA.map(c =>
    `<button class="ci-emoji-cat-btn${c.id===_emojiActiveCat?' active':''}" title="${c.name}" onclick="selectEmojiCat('${c.id}')">${c.icon}</button>`
  ).join('');
}

function selectEmojiCat(id) {
  _emojiActiveCat = id;
  document.querySelectorAll('.ci-emoji-cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.ci-emoji-cat-btn[onclick*="' + id + '"]')?.classList.add('active');
  renderEmojiGrid(id);
  $('emojiSearch').value = '';
}

function renderEmojiGrid(catId) {
  const cat = EMOJI_DATA.find(c => c.id === catId);
  if (!cat) return;
  $('emojiGrid').innerHTML = cat.emojis.map(e =>
    `<button class="ci-emoji-btn" onclick="insertEmoji(this.textContent)">${e}</button>`
  ).join('');
}

function filterEmojis(query) {
  const q = query.trim();
  if (!q) { renderEmojiGrid(_emojiActiveCat); return; }
  const all = EMOJI_DATA.flatMap(c => c.emojis);
  $('emojiGrid').innerHTML = all.map(e =>
    `<button class="ci-emoji-btn" onclick="insertEmoji(this.textContent)">${e}</button>`
  ).join('');
}

function insertEmoji(emoji) {
  const input = $('msgInput');
  const start = input.selectionStart;
  const end   = input.selectionEnd;
  const val   = input.value;
  input.value = val.slice(0, start) + emoji + val.slice(end);
  input.setSelectionRange(start + emoji.length, start + emoji.length);
  input.focus();
}

async function toggleStickerPanel() {
  openPickerPanel('emoji');
}

async function loadStickerPanel() {
  const grid = $('stickerGrid');
  grid.innerHTML = `<div style="color:var(--text-4);font-size:13px;padding:12px;text-align:center">Cargando…</div>`;

  const { data } = await sb.from('chat_messages')
    .select('media_url')
    .eq('media_type', 'sticker')
    .eq('tenant_id', S.tenantId)
    .not('media_url', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(80);

  if (!data?.length) {
    grid.innerHTML = `<div style="color:var(--text-4);font-size:13px;padding:16px;text-align:center">Aquí aparecerán los stickers que recibas</div>`;
    return;
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = data.filter(r => { if (seen.has(r.media_url)) return false; seen.add(r.media_url); return true; });

  grid.innerHTML = unique.map(r =>
    `<button class="ci-sticker-pick" onclick="sendSticker('${escHtml(r.media_url)}')" title="Enviar sticker">
      <img src="${escHtml(r.media_url)}" loading="lazy" alt="sticker">
    </button>`
  ).join('');
}

async function sendSticker(mediaUrl) {
  $('pickerPanel').style.display = 'none';
  if (!S.activeConvId) return;

  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId, direction: 'out', media_url: mediaUrl, media_type: 'sticker', delivery_status: 'sending', sent_at: new Date().toISOString() });
  renderThread();

  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId,
    direction: 'out', body: '[sticker]', media_url: mediaUrl, media_type: 'sticker',
    delivery_status: 'sent', agent_id: S.user?.id || null,
  }]).select().single();

  if (error) { S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); return; }
  S.messages = S.messages.map(m => m.id === tmpId ? data : m);
  renderThread();

  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (conv && ['instagram', 'facebook', 'whatsapp'].includes(conv.channel)) {
    try {
      const res = await fetch(META_SEND_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: S.activeConvId, media_url: mediaUrl, media_type: 'sticker', message_id: data.id }),
      });
      const resData = await res.json();
      if (resData.error) showToast('No se pudo enviar el sticker: ' + resData.error, 'error');
    } catch (e) { showToast('Error al enviar sticker: ' + e.message, 'error'); }
  }
}

/* ══════════════════════════════════════════════
   ADJUNTOS
══════════════════════════════════════════════ */
async function handleAttachment(file) {
  if (!file || !S.activeConvId) return;

  const maxMb = 16;
  if (file.size > maxMb * 1024 * 1024) { showToast(`El archivo supera ${maxMb} MB`, 'error'); return; }

  const ext       = file.name.split('.').pop().toLowerCase();
  const mediaType = file.type.startsWith('image/') ? 'image'
    : file.type.startsWith('video/') ? 'video'
    : file.type.startsWith('audio/') ? 'audio'
    : 'document';

  const path    = `${mediaType}/${S.tenantId}_${Date.now()}.${ext}`;
  const tmpId   = 'tmp_' + Date.now();
  const tmpUrl  = URL.createObjectURL(file);

  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId, direction: 'out', media_url: tmpUrl, media_type: mediaType, body: file.name, delivery_status: 'sending', sent_at: new Date().toISOString() });
  renderThread();

  // Upload to Supabase Storage
  const { error: upErr } = await sb.storage.from('chat-media').upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) { showToast('Error al subir archivo: ' + upErr.message, 'error'); S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); return; }

  const { data: { publicUrl } } = sb.storage.from('chat-media').getPublicUrl(path);

  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId,
    direction: 'out', body: file.name, media_url: publicUrl, media_type: mediaType,
    delivery_status: 'sent', agent_id: S.user?.id || null,
  }]).select().single();

  if (error) { S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); return; }
  S.messages = S.messages.map(m => m.id === tmpId ? { ...data, media_url: publicUrl } : m);
  renderThread();

  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (conv && ['instagram', 'facebook', 'whatsapp'].includes(conv.channel)) {
    try {
      const res = await fetch(META_SEND_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: S.activeConvId, media_url: publicUrl, media_type: mediaType, filename: file.name, message_id: data.id }),
      });
      const resData = await res.json();
      if (resData.error) showToast('No se pudo enviar el archivo: ' + resData.error, 'error');
    } catch (e) { showToast('Error al enviar archivo: ' + e.message, 'error'); }
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
  $('replyCancel').addEventListener('click', clearReply);
  $('stickerBtn').addEventListener('click', toggleStickerPanel);
  $('pickerClose').addEventListener('click', () => { $('pickerPanel').style.display = 'none'; });
  $('attachBtn').addEventListener('click', () => $('attachInput').click());
  $('attachInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) handleAttachment(f); });
  document.addEventListener('click', e => {
    const popup = $('msgMenuPopup');
    if (popup && popup.style.display !== 'none' && !popup.contains(e.target) && !e.target.closest('.ci-msg-trigger')) {
      closeMsgPopup();
    }
    const picker = $('pickerPanel');
    if (picker && picker.style.display !== 'none' && !picker.contains(e.target) && !e.target.closest('#stickerBtn')) {
      picker.style.display = 'none';
    }
  });
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
/* == HUMAN TAKEOVER == */
async function updateHumanBadge() {
  try {
    const { count } = await sb.from('chat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', S.branchId)
      .eq('human_takeover', true)
      .eq('status', 'open');
    S.humanCount = count || 0;
    const el = $('badge-human');
    if (el) el.textContent = S.humanCount || '';
  } catch(e) { console.error('updateHumanBadge:', e); }
}

function updateHumanToggleBtn(isHuman) {
  const btn = $('humanToggleBtn');
  const txt = $('humanToggleTxt');
  if (!btn) return;
  if (isHuman) {
    btn.classList.add('is-human');
    if (txt) txt.textContent = 'En humano';
  } else {
    btn.classList.remove('is-human');
    if (txt) txt.textContent = 'Bot activo';
  }
}

async function toggleHumanTakeover() {
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv) return;
  const newVal = !conv.human_takeover;
  try {
    await sb.from('chat_conversations').update({ human_takeover: newVal }).eq('id', conv.id);
    conv.human_takeover = newVal;
    updateHumanToggleBtn(newVal);
    await updateHumanBadge();
    showToast(newVal ? 'Chat pasado al humano' : 'Bot reactivado', 'success');
    if ((newVal && S.activeView !== 'human') || (!newVal && S.activeView === 'human')) {
      S.conversations = S.conversations.filter(c => c.id !== S.activeConvId);
      S.activeConvId = null;
      renderConvList();
      renderBadges();
      $('chatHead').style.display = 'none';
      $('thread').style.display = 'none';
      $('chatEmpty').style.display = '';
    }
  } catch(e) { console.error('toggleHumanTakeover:', e); showToast('Error al cambiar modo', 'error'); }
}

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
const META_CONFIG_ID    = '1280428637212702';  // Facebook + Instagram
const META_WA_CONFIG_ID = '926832250416998';   // WhatsApp (sistema, nunca expira)
const META_OAUTH_FN  = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/meta-oauth-callback';
const META_SEND_FN   = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/meta-send';

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
      let wabaId = null, phoneId = null;
      let settled = false;
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

      // Electron: main.js intercepta el redirect ?code= y lo inyecta como CustomEvent
      function onElectronCode(evt) {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        window.removeEventListener('message', onWAMsg);
        window.removeEventListener('meta-oauth-code', onElectronCode);
        fetch(META_OAUTH_FN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: evt.detail.code, channel,
            branch_id: S.branchId, tenant_id: S.tenantId,
            waba_id: wabaId, phone_number_id: phoneId,
          }),
        })
          .then(function(res) { return res.json(); })
          .then(function(data) { if (data.error) reject(new Error(data.error)); else resolve(data); })
          .catch(reject);
      }
      window.addEventListener('meta-oauth-code', onElectronCode);

      // Popup manual — window.open() en handler sincrónico NO lo bloquea Chrome.
      // FB.login() hacía fallback a window.location cuando Chrome bloqueaba el popup.
      const W = 600, H = 700;
      const L = Math.max(0, (window.screen.width  - W) / 2);
      const T = Math.max(0, (window.screen.height - H) / 2);
      const qp = new URLSearchParams({
        client_id: META_APP_ID,
        config_id:  META_WA_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: 'true',
        redirect_uri: 'https://elparchefood.github.io/restaurant-pos/',
      });
      const popup = window.open(
        'https://www.facebook.com/v22.0/dialog/oauth?' + qp.toString(),
        'WA_Signup',
        'popup,width=' + W + ',height=' + H + ',left=' + L + ',top=' + T
      );

      if (!popup || popup.closed) {
        window.removeEventListener('message', onWAMsg);
        reject(new Error('El navegador bloqueó la ventana emergente. Haz clic en el ícono bloqueado de la barra de dirección y permite ventanas emergentes para este sitio.'));
        return;
      }

      // Polling: cuando Meta redirige con ?code= ya podemos leer popup.location
      let poll; poll = setInterval(function() {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener('message', onWAMsg);
          window.removeEventListener('meta-oauth-code', onElectronCode);
          if (!settled) reject(new Error('Conexión cancelada'));
          return;
        }
        try {
          const href = popup.location.href; // lanza cross-origin mientras esté en facebook.com
          const u    = new URL(href);
          const code = u.searchParams.get('code');
          if (code && !settled) {
            settled = true;
            clearInterval(poll);
            window.removeEventListener('message', onWAMsg);
            window.removeEventListener('meta-oauth-code', onElectronCode);
            popup.close();
            fetch(META_OAUTH_FN, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code, channel,
                branch_id: S.branchId, tenant_id: S.tenantId,
                waba_id: wabaId, phone_number_id: phoneId,
              }),
            })
              .then(function(res) { return res.json(); })
              .then(function(data) { if (data.error) reject(new Error(data.error)); else resolve(data); })
              .catch(reject);
          }
        } catch { /* popup en dominio de Facebook todavía — normal */ }
      }, 300);
    } else {
      let fbSettled = false;
      // Electron: main.js intercepta el redirect ?code= y lo inyecta como CustomEvent
      function onElectronCodeFB(evt) {
        if (fbSettled) return;
        fbSettled = true;
        window.removeEventListener('meta-oauth-code', onElectronCodeFB);
        fetch(META_OAUTH_FN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: evt.detail.code, channel, branch_id: S.branchId, tenant_id: S.tenantId }),
        })
          .then(function(res) { return res.json(); })
          .then(function(data) { if (data.error) reject(new Error(data.error)); else resolve(data); })
          .catch(reject);
      }
      window.addEventListener('meta-oauth-code', onElectronCodeFB);

      FB.login(function(response) {
        window.removeEventListener('meta-oauth-code', onElectronCodeFB);
        if (!response.authResponse) { if (!fbSettled) reject(new Error('Conexión cancelada')); return; }
        if (!fbSettled) {
          fbSettled = true;
          fetch(META_OAUTH_FN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: response.authResponse.code, channel, branch_id: S.branchId, tenant_id: S.tenantId }),
          })
            .then(function(res) { return res.json(); })
            .then(function(data) { if (data.error) reject(new Error(data.error)); else resolve(data); })
            .catch(reject);
        }
      }, {
        config_id: META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
      });
    }
  });
}
