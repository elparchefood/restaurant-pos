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
// Canales "próximamente" (Meta aún no aprobó permisos). Solo WhatsApp activo.
const SOON_CHANNELS = ['instagram', 'facebook', 'tiktok'];
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
  activeFilter: 'all', activeView: 'all', humanCount: 0, pagoCount: 0,
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

    await Promise.all([loadChannels(), loadConversations(), loadIaMaster(), loadQuickReplies(), loadEtiquetas()]);
    document.querySelectorAll('#iaModes .ia-modo-btn').forEach(function(b){
      b.addEventListener('click', function(){ setIaModo(b.dataset.iamodo); });
    });
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
  if (S.activeView === 'pagos')   q = q.eq('pago_pendiente', true).eq('status','open');
  if (S.activeView && S.activeView.slice(0,6) === 'label:') q = q.filter('labels', 'cs', JSON.stringify([S.activeView.slice(6)]));
  if (['all','mine','pending'].includes(S.activeView)) { q = q.eq('status','open').eq('human_takeover', false); }
  const { data } = await q;
  S.conversations = data || [];
  if (S.activeView === 'all') S.conversations = S.conversations.filter(function(c){ return !(Array.isArray(c.labels) && c.labels.length>0); });  // etiquetados: solo en su pestaña
  renderConvList();
  renderBadges();
  updateLabelBadges();
}

// Badge de "mensajes nuevos" por etiqueta (consulta aparte de la vista actual)
async function updateLabelBadges(){
  try{
    if(!(S.etiquetas||[]).length) return;
    var res=await sb.from('chat_conversations').select('labels,unread_count').eq('branch_id',S.branchId).gt('unread_count',0);
    var rows=res.data||[]; var counts={};
    rows.forEach(function(c){ if(Array.isArray(c.labels)) c.labels.forEach(function(id){ counts[id]=(counts[id]||0)+(Number(c.unread_count)||0); }); });
    (S.etiquetas||[]).forEach(function(e){
      var el=document.getElementById('lbbadge-'+e.id);
      if(el){ var n=counts[e.id]||0; el.textContent=n||''; el.style.display=n?'':'none'; }
    });
  }catch(e){}
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
      if (msg.direction === 'in') { chatBeep(); setTimeout(updateLabelBadges, 400); }   // sonido + refrescar badge de etiquetas
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
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'pos_orders' }, payload => {
      // Sincronía en vivo de la pastilla de estado: si cambian el estado del pedido
      // activo desde Ventas (o el auto-entregado), se refleja al instante en el chat.
      // (Sin filtro por branch — el filtro dejaba caer los eventos.)
      const o = payload.new;
      if (S.estadoOrder && o && o.id === S.estadoOrder.id && o.estado) {
        S.estadoOrder.estado = o.estado;
        renderEstadoPill();
      }
    })
    .subscribe();
}

// Sonido corto de notificación (mismo tono que el aviso global pos-notify.js).
function chatBeep(){
  try{
    var Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
    var ctx=new Ctx(); var o=ctx.createOscillator(); var g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type='sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(660, ctx.currentTime+0.1);
    g.gain.setValueAtTime(0.09, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.25);
    o.start(); setTimeout(function(){ try{o.stop();ctx.close();}catch(e){} },280);
  }catch(e){}
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
    const isSoon = SOON_CHANNELS.indexOf(ch) >= 0;
    const right = connected
      ? (pic
          ? `<img src="${pic}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="">`
          : `<span class="n">${count || ''}</span>`)
      : (isSoon
          ? `<span class="ci-connect-tag" style="background:#F1F5F9;color:#94A3B8">Próximamente</span>`
          : `<span class="ci-connect-tag">Conectar</span>`);

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
    btn.addEventListener('click', () => {
      var ch = btn.dataset.channel;
      if (SOON_CHANNELS.indexOf(ch) >= 0) {
        showToast('🔜 ' + (CHANNELS[ch]?.label || ch) + ' estará disponible próximamente', 'info');
        return;
      }
      openChannelModal(ch);
    });
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
  updatePagoBadge();
  const _tu = $('totalUnread'); if (_tu) _tu.textContent = totalUnread ? `${totalUnread} sin leer` : `${S.conversations.length} conversaciones`;
  renderChannelsSidebar();
  renderFilters();
}

function renderChatHeader(conv) {
  updateHumanToggleBtn(!!conv.human_takeover);
  updatePagoConfirmBtn(!!conv.pago_pendiente);
  updateDomiConfirmBtn(!!conv.domi_precio_pendiente);
  updateSinNomBtn(!!conv.sin_nomenclatura);
  const vpb=$('verifyPagoBtn'); if(vpb) vpb.style.display='';   // verificar transferencia: siempre disponible con un chat abierto
  loadEstadoPill(conv);
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
  loadDraftBar(id);   // mostrar la tarjeta del pre-pedido si esta conversación tiene un borrador
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
  $('msgInput').addEventListener('input', onQuickInput);
  $('msgInput').addEventListener('keydown', e => {
    if (onQuickKeydown(e)) return;          // el "/" (respuestas rápidas) manejó la tecla
    if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('quickBtn')?.addEventListener('click', function(e){ e.preventDefault(); toggleQuickFromBtn(); });
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
    const qdd = $('quickDropdown');
    if (qdd && qdd.style.display !== 'none' && !qdd.contains(e.target) && e.target.id !== 'msgInput' && !e.target.closest('#quickBtn')) {
      closeQuickDropdown();
    }
    const qmg = $('quickManage');
    if (qmg && qmg.style.display !== 'none' && !qmg.contains(e.target) && !e.target.closest('#quickBtn') && !e.target.closest('.ci-qr-manage')) {
      qmg.style.display = 'none';
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
  $('createOrderBtn')?.addEventListener('click', () => openCrearPedido());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

/* ══════════════════════════════════════════════
   RESPUESTAS RÁPIDAS  ( "/" + palabra clave )
   Igual que WhatsApp: escribes "/" y aparece la lista; sigues escribiendo
   la palabra clave y se filtra; Enter o clic la pega lista para enviar.
══════════════════════════════════════════════ */
// Semilla inicial (las de El Parche). Solo se usa si la base está vacía.
const DEFAULT_QUICK_REPLIES = [
  { k:'gracias',  t:'¡Muchas gracias por preferirnos! Esperamos poder servirte nuevamente.' },
  { k:'gracias2', t:'Muchas gracias ☺️' },
  { k:'buenas',   t:'Buenas noches, cuéntame ¿En qué te podemos ayudar? ☺️🍟' },
  { k:'servicio', t:'Claro que si 🍟¿Qué deseas? ☺️' },
  { k:'carta',    t:'Buenas noches, ¿cómo estás?; con gusto ya te envío nuestra carta 😊' },
  { k:'menu',     t:'¿Qué se te antoja? 🍟☺️', img:'@menu' },
  { k:'adicion',  t:'Perfecto, deseas adicionar alguna bebida, salchicha ranchera, súper queso o alguna de nuestras salsas especiales (maíz o chedar)? 🤩' },
  { k:'pollo',    t:'La deseas con pollo, carne o mixta? 😋' },
  { k:'pollo2',   t:'¿La deseas con pollo o carne? 🍟☺️' },
  { k:'chorizo',  t:'¿La deseas con chorizo o tocineta? 😋' },
  { k:'Nombre',   t:'A nombre de quien se recibe el pedido?🍟' },
  { k:'Movil',    t:'Me podrías confirmar el móvil porfa 🙏🏽' },
  { k:'pedirdomi2', t:'Buenas noches, me envias un movil por favor, graciaaaas☺️' },
  { k:'ubicacioncliente', t:'Me podrías enviar la ubicación porfavor para que el domi pueda llegar más fácil ☺️🙏🏽' },
  { k:'direccion', t:'Estamos ubicados en el barrio Bella Vista 📍 Cra 9B # 63 n58' },
  { k:'ubicacion', t:'📍 Nuestra ubicación', loc:{ latitude:2.4821491, longitude:-76.5742024, name:'El Parche Comidas Rapidas', address:'Carrera 9 B # 63 N 58, Bellavista' } },
  { k:'cuanto',   t:'Me confirmas por favor con cuanto pagas porfavor, para enviarte regreso 😀' },
  { k:'efectivotransferencia', t:'Con gusto, me confirmas si el pago es transferencia o efectivo? para pasar tu pedido a cocina🍟☺️' },
  { k:'QR2',      t:'Te comparto el código QR para que puedas realizar tu pago ☺️\n\nO si deseas, mediante llaves con el siguiente número: 0092726260\n\nRecuerda enviarnos tu comprobante de pago😁', img:'@qr' },
  { k:'comprobante', t:'Quedo pendiente del comprobante para poderte preparar ☺️' },
  { k:'total',    t:'Con gusto, serian $0 de tu pedido y $0 del domicilio, total $0 😊\nEn un momento enviamos tu pedido 🍟', dyn:'total' },
  { k:'puntos',   t:'Acabas de ganar X puntos con tu compra 🎉', dyn:'puntos' },
  { k:'30',       t:'Tu pedido tarda 30 minutos aproximadamente 🍟' },
  { k:'40',       t:'Tu pedido tarda 40 minutos aproximadamente 🍟' },
  { k:'saturaso', t:'Hola! 😎 En este momento nos encontramos saturados, por lo que no estamos brindando servicio temporalmente.\nEstamos trabajando para poder tomar tu pedido lo antes posible!\nGracias por tu paciencia. 😊' },
  { k:'Listo',    t:'Ya puedes pasar por tu pedido 🍟😊' },
  { k:'llevar',   t:'Con mucho gusto, apenas esté lista te aviso para que pases ☺️🍟' },
  { k:'PEDIDOMESA', t:'Si deseas consumir tu pedido en el establecimiento, este se realiza directamente en el punto; Por medio de WhatsApp solo recibimos para domicilio y para recoger. Te esperamos☺️🍟' },
  { k:'Noches',   t:'Buenas noches 🍟😊' },
  { k:'Close',    t:'Buenas noches, por el día de hoy ya terminamos nuestra jornada.\nGracias por tu mensaje, esperamos atenderte en una próxima oportunidad.☺️🍟🫶🏼' },
  { k:'Descanso', t:'Buenas noches, el día de ayer no teníamos servicio pero cuéntame ¿En qué te podemos ayudar? ☺️🍟' },
  { k:'Gusto',    t:'Con muchisimo gusto, estamos para servirte 🫶🏼☺️' },
  { k:'gusto',    t:'Con muchísimo gusto, estamos para servirte 🍟☺️' },
];

function qrEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function loadQuickReplies() {
  try {
    const { data } = await sb.from('ia_config').select('respuestas_rapidas').eq('branch_id', S.branchId).maybeSingle();
    let list = (data && Array.isArray(data.respuestas_rapidas)) ? data.respuestas_rapidas : [];
    if (!list.length) { list = DEFAULT_QUICK_REPLIES.slice(); await saveQuickReplies(list); }
    S.quickReplies = list;
  } catch (e) { console.warn('loadQuickReplies:', e); S.quickReplies = DEFAULT_QUICK_REPLIES.slice(); }
}
async function saveQuickReplies(list) {
  const arr = list || S.quickReplies || [];
  try { await sb.from('ia_config').update({ respuestas_rapidas: arr }).eq('branch_id', S.branchId); }
  catch (e) { console.error('saveQuickReplies:', e); }
}

// Filtro: primero las que EMPIEZAN por la palabra, luego las que la CONTIENEN
function qrFilter(q) {
  const list = S.quickReplies || [];
  q = (q||'').toLowerCase().trim();
  if (!q) return list.slice();
  const starts = list.filter(r => (r.k||'').toLowerCase().startsWith(q));
  const has    = list.filter(r => !(r.k||'').toLowerCase().startsWith(q) && (r.k||'').toLowerCase().includes(q));
  return starts.concat(has);
}

function onQuickInput(e) {
  const v = e.target.value;
  if (v.startsWith('/')) openQuickDropdown(v.slice(1));
  else if (S.qrOpen) closeQuickDropdown();
}
function toggleQuickFromBtn() {
  if (S.qrOpen) { closeQuickDropdown(); return; }
  openQuickDropdown('');            // abre con toda la lista, sin necesidad de "/"
  const inp = document.getElementById('msgInput'); if (inp) inp.focus();
}
function openQuickDropdown(q) { S.qrOpen = true; S.qrIndex = 0; renderQuickDropdown(q); }
function closeQuickDropdown() {
  S.qrOpen = false; S.qrIndex = -1; S._qrList = [];
  const dd = document.getElementById('quickDropdown'); if (dd) dd.style.display = 'none';
}
function renderQuickDropdown(q) {
  const dd = document.getElementById('quickDropdown'); if (!dd) return;
  const list = qrFilter(q);
  S._qrList = list;
  if (!list.length) { dd.style.display = 'none'; return; }
  if (S.qrIndex >= list.length) S.qrIndex = list.length - 1;
  if (S.qrIndex < 0) S.qrIndex = 0;
  const head = '<div class="ci-qr-head"><span>⚡ Respuestas rápidas</span>'
    + '<button class="ci-qr-manage" onmousedown="event.preventDefault();openQuickManage()">Administrar</button></div>';
  const rows = list.map((r,i) =>
    '<div class="ci-qr-item'+(i===S.qrIndex?' active':'')+'" data-i="'+i+'" onmousedown="qrPick(event,'+i+')" onmouseenter="qrHover('+i+')">'
    + '<span class="ci-qr-k">'+(r.img?'📷 ':'')+(r.loc?'📍 ':'')+'/'+qrEsc(r.k)+'</span>'
    + '<span class="ci-qr-t">'+qrEsc(r.t).replace(/\n/g,' ')+'</span></div>'
  ).join('');
  dd.innerHTML = head + '<div class="ci-qr-scroll">' + rows + '</div>';
  dd.style.display = 'block';
  const act = dd.querySelector('.ci-qr-item.active');
  if (act) act.scrollIntoView({ block:'nearest' });
}
function qrHover(i) {
  S.qrIndex = i;
  document.querySelectorAll('#quickDropdown .ci-qr-item').forEach(el => el.classList.toggle('active', +el.dataset.i === i));
}
function qrPick(ev, i) {
  if (ev) ev.preventDefault();
  const r = (S._qrList||[])[i]; if (!r) return;
  closeQuickDropdown();
  if (r.loc) { sendQuickLocation(r); return; }  // respuestas de ubicación → tarjeta de mapa
  if (r.img === '@menu') { sendQuickMenu(r); return; }  // la carta = varias imágenes del menú
  if (r.img) { sendQuickMedia(r); return; }     // respuestas con imagen se envían directo (imagen + texto)
  if (r.dyn) { resolveDynReply(r).then(function(t){ if(t!=null){ var el=document.getElementById('msgInput'); if(el){ el.value=t; el.focus(); } } }); return; }  // /total, /puntos → valores reales del pedido
  const inp = document.getElementById('msgInput');
  if (inp) { inp.value = r.t; inp.focus(); }
}

// Envía una respuesta rápida de UBICACIÓN como tarjeta de mapa nativa de WhatsApp.
async function sendQuickLocation(r) {
  if (!S.activeConvId || !r.loc) return;
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv || conv.channel !== 'whatsapp') { showToast('La ubicación solo se puede enviar por WhatsApp', 'info'); return; }
  const label = r.loc.name || 'Ubicación';
  // El visor de Cobra lee las coordenadas de un JSON en body: {lat,lng,name,addr}
  const bodyJson = JSON.stringify({ lat: r.loc.latitude, lng: r.loc.longitude, name: r.loc.name || '', addr: r.loc.address || '' });
  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId, direction:'out', body: bodyJson, media_type:'location', delivery_status:'sending', sent_at: new Date().toISOString() });
  renderThread();
  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId, direction:'out',
    body: bodyJson, media_type:'location', delivery_status:'sent', agent_id: S.user?.id || null,
  }]).select().single();
  if (error) { S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); showToast('No se pudo enviar', 'error'); return; }
  S.messages = S.messages.map(m => m.id === tmpId ? data : m);
  renderThread();
  if (conv) {
    conv.last_message = '📍 ' + label; conv.last_message_at = data.sent_at; conv.last_sender = 'agent';
    S.conversations.sort((a,b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvList();
  }
  try {
    const res = await fetch(META_SEND_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: S.activeConvId, location: r.loc, message_id: data.id }),
    });
    const rd = await res.json();
    if (rd.error) { showToast('No se pudo enviar la ubicación: ' + rd.error, 'error'); }
  } catch (e) { showToast('Error al enviar: ' + e.message, 'error'); }
}

// Envía la CARTA (menú): todas las imágenes de ia_config.menu_imagenes, una por una.
async function sendQuickMenu(r){
  if(!S.activeConvId) return;
  const conv=S.conversations.find(c=>c.id===S.activeConvId);
  let imgs=[], caption=r.t||'';
  try{
    const { data }=await sb.from('ia_config').select('menu_imagenes,menu_frase').eq('branch_id',S.branchId).maybeSingle();
    imgs=(data&&Array.isArray(data.menu_imagenes))?data.menu_imagenes:[];
    if(data&&data.menu_frase&&data.menu_frase.texto) caption=data.menu_frase.texto;
  }catch(e){}
  if(!imgs.length){ showToast('No hay imágenes de la carta configuradas','error'); return; }
  for(let i=0;i<imgs.length;i++){ await sendOneImage(imgs[i], i===0?caption:'', conv); }
}
// Envía UNA imagen (con caption opcional) por chat + WhatsApp. Reutilizable.
async function sendOneImage(url, caption, conv){
  conv=conv||S.conversations.find(c=>c.id===S.activeConvId);
  caption=caption||'';
  const tmpId='tmp_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  S.messages.push({ id:tmpId, conversation_id:S.activeConvId, tenant_id:S.tenantId, direction:'out', media_url:url, media_type:'image', body:caption, delivery_status:'sending', sent_at:new Date().toISOString() });
  renderThread();
  const { data, error }=await sb.from('chat_messages').insert([{ conversation_id:S.activeConvId, tenant_id:S.tenantId, direction:'out', body:caption, media_url:url, media_type:'image', delivery_status:'sent', agent_id:S.user?.id||null }]).select().single();
  if(error){ S.messages=S.messages.filter(m=>m.id!==tmpId); renderThread(); showToast('No se pudo enviar','error'); return; }
  S.messages=S.messages.map(m=>m.id===tmpId?data:m); renderThread();
  if(conv){ conv.last_message='📷 '+(caption||'Imagen'); conv.last_message_at=data.sent_at; conv.last_sender='agent'; S.conversations.sort((a,b)=>new Date(b.last_message_at)-new Date(a.last_message_at)); renderConvList(); }
  if(conv && ['whatsapp','instagram','facebook'].includes(conv.channel)){
    try{ const res=await fetch(META_SEND_FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ conversation_id:S.activeConvId, media_url:url, media_type:'image', text:caption, message_id:data.id })}); const rd=await res.json(); if(rd.error) showToast('No se pudo enviar la imagen: '+rd.error,'error'); }catch(e){ showToast('Error al enviar: '+e.message,'error'); }
  }
}

/* ══════════════════════════════════════════════
   CREAR PEDIDO DESDE EL CHAT  (analiza la conversación → modal editable → crea)
══════════════════════════════════════════════ */
const EXTRAER_PEDIDO_FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/extraer-pedido';
const CREAR_PEDIDO_FN   = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/crear-pedido-chat';

function cpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cpCOP(n){ return '$' + Math.round(Number(n)||0).toLocaleString('es-CO'); }
function cpShow(v){ const m=document.getElementById('cpModal'); if(m) m.style.display = v?'flex':'none'; }
function cpClose(){ cpShow(false); S.cpOrder=null; }
function cpSetBody(html){ const b=document.getElementById('cpBody'); if(b) b.innerHTML=html; }
function cpFooter(show){ const f=document.getElementById('cpFooter'); if(f) f.style.display = show?'flex':'none'; }

async function openCrearPedido(draftOverride){
  // Defensa: si llega algo que NO es un borrador válido (p.ej. el objeto Event del
  // click del botón), lo ignoramos y analizamos la conversación normalmente.
  if(draftOverride && !Array.isArray(draftOverride.productos)) draftOverride = null;
  if(!S.activeConvId){ showToast('Abre una conversación primero','info'); return; }
  cpShow(true); cpFooter(false);
  cpSetBody('<div class="cp-loading"><div class="cp-spin"></div>'+(draftOverride?'Cargando el pedido…':'Analizando la conversación con IA…')+'</div>');
  try{
    const res=await fetch(EXTRAER_PEDIDO_FN,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversation_id:S.activeConvId})});
    const _raw=await res.text(); let data={}; try{ data=JSON.parse(_raw); }catch(_e){}
    if(data.error && !draftOverride){ cpSetBody('<div class="cp-error">⚠️ '+cpEsc(data.error)+'</div>'); return; }
    if(!draftOverride && (!data.order || !((data.order.productos||[]).length) )){
      cpSetBody('<div class="cp-error" style="text-align:left;font-size:11px;line-height:1.5">🔎 DIAGNÓSTICO (temporal)<br>HTTP: '+res.status+'<br>conv: '+cpEsc(String(S.activeConvId))+'<br>keys: '+cpEsc(Object.keys(data||{}).join(', ')||'(ninguna)')+'<br>productos: '+((data.order&&data.order.productos)?data.order.productos.length:'(sin order)')+'<br>respuesta: '+cpEsc(String(_raw).slice(0,400))+'</div>');
      cpFooter(false); return;
    }
    S.cpOrder = draftOverride || data.order;   // al EDITAR se usa el borrador guardado; el catálogo viene igual del análisis
    S.cpCatalogo=data.catalogo||[];
    S.cpCategorias=data.categorias||[];
    S.cpMods=data.mods||[];
    cpRenderForm(S.cpOrder);
    cpFooter(true);
    var _cb=document.getElementById('cpConfirmBtn'); if(_cb){ _cb.disabled=false; _cb.textContent='Guardar pedido'; }  // reset por si quedó pegado
  }catch(e){ cpSetBody('<div class="cp-error">⚠️ No se pudo analizar: '+cpEsc(e.message)+'</div>'); }
}

function cpNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim(); }
function cpItemTotal(p){ const a=(p.adiciones||[]).reduce((s,x)=>s+(Number(x.price)||0),0); return ((Number(p.unit_price)||0)+a)*(Number(p.cantidad)||1); }
// Empaque — MISMA lógica que pos-core.js posEmpaqueCalc (modo específico por
// producto/categoría/presentación, o unificado plano/%). Cada producto puede tener
// su propio empaque (o ninguno) según tu configuración.
function cpEmpaque(){
  if(!S.cpOrder) return 0;
  try{
    var cfg=JSON.parse(localStorage.getItem('pos.config.operacion.v1')||'{}');
    if(!cfg.empaquesActivo) return 0;
    var items=S.cpOrder.productos||[];
    var prod=0, units=0;
    items.forEach(function(p){ var q=Number(p.cantidad)||0; units+=q; prod+=cpItemTotal(p); });
    if(prod<=0) return 0;
    if(cfg.empaqueModo==='especifico'){
      var packs=cfg.empaquePacks||[]; var general=Number(cfg.empaqueMonto)||0;
      var packMonto=function(id){ for(var k=0;k<packs.length;k++) if(packs[k].id===id) return Number(packs[k].monto)||0; return 0; };
      var total=0;
      items.forEach(function(p){
        var fee=general;
        var cc=(cfg.empaqueCatCfg||{})[p.cat];
        if(cc){ if(cc.on===false) fee=0; else if(cc.packId) fee=packMonto(cc.packId); }
        var pc=(cfg.empaqueProdCfg||{})[p.product_id];
        if(pc!==undefined&&pc!==null&&pc!==''){ if(pc==='none') fee=0; else if(pc==='general') fee=general; else fee=packMonto(pc); }
        var sc=p.pres_id?(cfg.empaquePresCfg||{})[(p.product_id||'')+'::'+p.pres_id]:undefined;
        if(sc!==undefined&&sc!==null&&sc!==''){ if(sc==='none') fee=0; else if(sc==='general') fee=general; else fee=packMonto(sc); }
        total+=fee*(Number(p.cantidad)||0);
      });
      return total;
    }
    var usaDomi=(cfg.empaqueCanal==='distinto')&&((S.cpOrder.tipo||'')==='domicilio');
    var esPct=cfg.empaqueTipo==='porcentaje';
    var rate=esPct?(usaDomi?(cfg.empaquePctDomicilio||0):(cfg.empaquePct||0)):(usaDomi?(cfg.empaqueMontoDomicilio||0):(cfg.empaqueMonto||0));
    if(cfg.empaqueBase==='pedido') return esPct?Math.round(prod*rate/100):rate;
    return esPct?Math.round(prod*rate/100):rate*units;
  }catch(e){ return 0; }
}
function cpOrderTotal(){ if(!S.cpOrder) return 0; let s=(S.cpOrder.productos||[]).reduce((a,p)=>a+cpItemTotal(p),0); s+=cpEmpaque(); if((S.cpOrder.tipo||'')==='domicilio') s+=Number(S.cpOrder.domi_precio)||0; return s; }
function cpSyncTop(){ if(!S.cpOrder) return; const g=id=>document.getElementById(id); const o=S.cpOrder;
  if(g('cpNombre')) o.cliente=g('cpNombre').value; if(g('cpTelefono')) o.telefono=g('cpTelefono').value;
  if(g('cpTipo')) o.tipo=g('cpTipo').value; if(g('cpPago')) o.pago=g('cpPago').value;
  if(g('cpDireccion')) o.direccion=g('cpDireccion').value; if(g('cpBarrio')) o.barrio=g('cpBarrio').value; if(g('cpNotas')) o.notas=g('cpNotas').value;
  if(g('cpDomi')) o.domi_precio=+g('cpDomi').value||0; }
function cpSyncProdInputs(){ if(!S.cpOrder) return; document.querySelectorAll('#cpProds .cp-prod').forEach(row=>{ const i=+row.dataset.i; const p=S.cpOrder.productos[i]; if(!p) return; const q=row.querySelector('.cp-qty'); if(q) p.cantidad=+q.value||1; const n=row.querySelector('.cp-pnota'); if(n) p.notas=n.value; }); }
function cpRerender(){ cpSyncTop(); cpSyncProdInputs(); cpRenderForm(S.cpOrder); }
function cpUpdTotal(){ cpSyncTop(); cpSyncProdInputs(); const t=document.getElementById('cpTotal'); if(t) t.textContent=cpCOP(cpOrderTotal()); }
function cpNoteInput(i,v){ if(S.cpOrder&&S.cpOrder.productos[i]) S.cpOrder.productos[i].notas=v; }

function cpRenderForm(o){
  const tipos=['domicilio','recoger','mesa'];
  const prods=(o.productos||[]).map((p,i)=>cpProdRow(p,i)).join('');
  const addProd=(S.cpCatalogo&&S.cpCatalogo.length)
    ? '<button type="button" class="cp-addprod-btn" onclick="cpOpenPicker()">＋ Agregar producto</button>' : '';
  const html=
    '<div class="cp-grid">'
    +'<div class="cp-f"><label>Nombre del cliente</label><input id="cpNombre" value="'+cpEsc(o.cliente||'')+'"></div>'
    +'<div class="cp-f"><label>Teléfono</label><input id="cpTelefono" value="'+cpEsc(o.telefono||'')+'"></div>'
    +'<div class="cp-f"><label>Tipo</label><select id="cpTipo" onchange="cpRerender()">'+tipos.map(t=>'<option value="'+t+'"'+(o.tipo===t?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'
    +'<div class="cp-f"><label>Método de pago</label><input id="cpPago" value="'+cpEsc(o.pago||'')+'"></div>'
    +'</div>'
    +(o.tipo!=='mesa'?'<div class="cp-grid"><div class="cp-f"><label>Dirección</label><input id="cpDireccion" value="'+cpEsc(o.direccion||'')+'"></div><div class="cp-f"><label>Barrio</label><input id="cpBarrio" value="'+cpEsc(o.barrio||'')+'"></div></div>':'')
    +'<div class="cp-prods-hd">Productos</div>'
    +'<div id="cpProds">'+(prods||'<div class="cp-empty">Sin productos. Agrégalos abajo.</div>')+'</div>'
    +(addProd?'<div class="cp-addrow">'+addProd+'</div>':'')
    +'<div class="cp-f"><label>Notas generales</label><textarea id="cpNotas" rows="2">'+cpEsc(o.notas||'')+'</textarea></div>'
    +(o.tipo==='domicilio'?'<div class="cp-f cp-domi"><label>💵 Valor del domicilio</label><input id="cpDomi" type="number" min="0" value="'+(Number(o.domi_precio)||0)+'" oninput="cpUpdTotal()"></div>':'')
    +(cpEmpaque()>0?'<div class="cp-emp">Empaque <b>'+cpCOP(cpEmpaque())+'</b></div>':'')
    +'<div class="cp-total">Total del pedido: <b id="cpTotal">'+cpCOP(cpOrderTotal())+'</b></div>';
  cpSetBody(html);
}
function cpProdRow(p,i){
  const chips=(p.adiciones||[]).map(a=>'<span class="cp-chip">'+cpEsc(a.name)+' +'+cpCOP(a.price)+'<button title="Quitar" onclick="cpDelAdic('+i+',\''+a.id+'\')">✕</button></span>').join('');
  const used={}; (p.adiciones||[]).forEach(a=>used[a.id]=1);
  const opts=(p.adic_options||[]).filter(o=>!used[o.id]);
  const picker=opts.length?'<select class="cp-addadic" onchange="cpAddAdic('+i+',this.value);this.selectedIndex=0"><option value="">+ Adición…</option>'+opts.map(o=>'<option value="'+o.id+'">'+cpEsc(o.name)+' (+'+cpCOP(o.price)+')</option>').join('')+'</select>':'';
  return '<div class="cp-prod" data-i="'+i+'">'
    +'<div class="cp-prod-top">'
      +'<input class="cp-qty" type="number" min="1" value="'+(p.cantidad||1)+'" oninput="cpUpdTotal()">'
      +'<div class="cp-pname">'+cpEsc(p.product_name||p.nombre||'Producto')+(p.matched===false?' <span class="cp-warn">sin precio</span>':'')+'</div>'
      +'<div class="cp-price">'+cpCOP(p.unit_price||0)+'</div>'
      +'<button class="cp-del" title="Quitar" onclick="cpDelProd('+i+')">✕</button>'
    +'</div>'
    +(chips?'<div class="cp-chips">'+chips+'</div>':'')
    +(picker?'<div class="cp-prod-actions">'+picker+'</div>':'')
    +'<input class="cp-pnota" placeholder="Nota (ej. sin cebolla)" value="'+cpEsc(p.notas||'')+'" oninput="cpNoteInput('+i+',this.value)">'
  +'</div>';
}
function cpAdicOptions(c,presId){ const out=[],seen={}; const gids=c.mod_group_ids||[]; const pres=c.mod_group_pres||{};
  gids.forEach(gid=>{ if(pres[gid]&&presId&&pres[gid].indexOf(presId)<0) return; const g=(S.cpMods||[]).find(m=>String(m.id)===String(gid)); ((g&&g.options)||[]).forEach(o=>{ const k=cpNorm(o.name); if(!seen[k]){ seen[k]=1; out.push({id:o.id,name:o.name,price:Number(o.price)||0}); } }); }); return out; }
function cpAddAdic(i,optId){ if(!optId||!S.cpOrder) return; const p=S.cpOrder.productos[i]; if(!p) return; const opt=(p.adic_options||[]).find(o=>o.id===optId); if(opt&&!(p.adiciones||[]).some(a=>a.id===optId)){ p.adiciones=p.adiciones||[]; p.adiciones.push({id:opt.id,name:opt.name,price:opt.price}); } cpRerender(); }
function cpDelAdic(i,optId){ const p=S.cpOrder&&S.cpOrder.productos[i]; if(!p) return; p.adiciones=(p.adiciones||[]).filter(a=>a.id!==optId); cpRerender(); }
function cpDelProd(i){ cpSyncTop(); cpSyncProdInputs(); S.cpOrder.productos.splice(i,1); cpRenderForm(S.cpOrder); }
/* Selector de productos con acordeón por categoría → producto → tamaño/tipo */
// Precio considerando TODOS los grupos de variantes del producto.
// varsSel = { group_id: option_id }
function cpProdPrice(c, presId, varsSel){
  varsSel=varsSel||{};
  const preList=c.presentations||[];
  const pres=preList.find(p=>p.id===presId)||{};
  const presIdx=preList.findIndex(p=>p.id===presId);
  let price=Number(pres.price)||Number(c.price)||0;
  const vgs=c.variables||[];
  const pricingG = c.price_mode==='matrix' ? (vgs.find(v=>v.isPricing)||vgs[0]) : null;
  vgs.forEach(vg=>{
    const o=(vg.options||[]).find(x=>x.id===varsSel[vg.id]); if(!o) return;
    if(pricingG && vg.id===pricingG.id){
      if(Array.isArray(o.prices)&&presIdx>=0&&presIdx<o.prices.length) price=o.prices[presIdx];
      else if(Number(o.price)>0) price=Number(o.price);
    } else if(Number(o.price)>0){ price+=Number(o.price); }
  });
  return price;
}
function cpOpenPicker(){ if(!S.cpOrder) return; cpSyncTop(); cpSyncProdInputs(); S.cpPk={cat:'',prod:null,pres:'',vars:{}}; cpRenderPicker(); }
function cpBackToForm(){ cpRenderForm(S.cpOrder); }
function cpRenderPicker(){
  const cats=(S.cpCategorias||[]).slice();
  const prods=S.cpCatalogo||[];
  const byCat={}; prods.forEach(p=>{ (byCat[p.category_id]=byCat[p.category_id]||[]).push(p); });
  if(!cats.length){ cats.push({id:'',name:'Productos'}); }
  // categoría "otros" si hay productos sin categoría reconocida
  Object.keys(byCat).forEach(cid=>{ if(cid && !cats.some(c=>c.id===cid)) cats.push({id:cid,name:'Otros'}); });
  let html='<div class="cp-pk-head"><button class="cp-pk-back" onclick="cpBackToForm()">← Volver</button><b>Agregar producto</b></div><div class="cp-pk-acc">';
  cats.forEach(c=>{
    const list=byCat[c.id]||[]; if(!list.length) return;
    const open=S.cpPk.cat===c.id;
    html+='<div class="cp-pk-cat">'
      +'<button class="cp-pk-cathd'+(open?' open':'')+'" onclick="cpPkCat(\''+c.id+'\')"><span>'+cpEsc(c.name)+'</span><span class="cp-pk-n">'+list.length+' '+(open?'▾':'▸')+'</span></button>'
      +(open?'<div class="cp-pk-prods">'+list.map(p=>'<button class="cp-pk-prod" onclick="cpPkProd(\''+p.id+'\')">'+cpEsc(p.name)+'</button>').join('')+'</div>':'')
      +'</div>';
  });
  html+='</div>';
  cpSetBody(html);
}
function cpPkCat(id){ S.cpPk.cat=(S.cpPk.cat===id?'':id); cpRenderPicker(); }
function cpPkProd(id){
  const c=(S.cpCatalogo||[]).find(x=>x.id===id); if(!c) return;
  const pres=c.presentations||[];
  const vgs=(c.variables||[]).filter(v=>((v.options)||[]).length);
  if(pres.length<=1 && !vgs.length){ cpDoAddProduct(c, pres[0]?pres[0].id:'', {}); return; }
  S.cpPk.prod=c; S.cpPk.pres=pres[0]?pres[0].id:''; S.cpPk.vars={};
  vgs.forEach(vg=>{ S.cpPk.vars[vg.id]=(vg.options[0]||{}).id||''; });   // por defecto la 1ª opción de cada grupo
  cpRenderProdConfig();
}
function cpRenderProdConfig(){
  const c=S.cpPk.prod; if(!c) return;
  const pres=c.presentations||[];
  const vgs=(c.variables||[]).filter(v=>((v.options)||[]).length);
  let html='<div class="cp-pk-head"><button class="cp-pk-back" onclick="cpRenderPicker()">← Volver</button><b>'+cpEsc(c.name)+'</b></div>';
  if(pres.length){ html+='<div class="cp-pk-lbl">Tamaño</div><div class="cp-pk-opts">'+pres.map(p=>'<button class="cp-pk-opt'+(S.cpPk.pres===p.id?' sel':'')+'" onclick="cpPkPres(\''+p.id+'\')">'+cpEsc(p.name)+'</button>').join('')+'</div>'; }
  vgs.forEach(vg=>{
    html+='<div class="cp-pk-lbl">'+cpEsc(vg.name||'Variante')+'</div><div class="cp-pk-opts">'+(vg.options||[]).map(o=>'<button class="cp-pk-opt'+(S.cpPk.vars[vg.id]===o.id?' sel':'')+'" onclick="cpPkVar(\''+vg.id+'\',\''+o.id+'\')">'+cpEsc(o.name)+(Number(o.price)>0?' (+'+cpCOP(o.price)+')':'')+'</button>').join('')+'</div>';
  });
  html+='<div class="cp-pk-add"><span class="cp-pk-price">'+cpCOP(cpProdPrice(c,S.cpPk.pres,S.cpPk.vars))+'</span><button class="cp-btn primary" onclick="cpConfirmAddProduct()">Agregar</button></div>';
  cpSetBody(html);
}
function cpPkPres(id){ S.cpPk.pres=id; cpRenderProdConfig(); }
function cpPkVar(gid,oid){ S.cpPk.vars[gid]=oid; cpRenderProdConfig(); }
function cpConfirmAddProduct(){ const c=S.cpPk.prod; if(!c) return; cpDoAddProduct(c,S.cpPk.pres,S.cpPk.vars); }
function cpDoAddProduct(c,presId,varsSel){
  varsSel=varsSel||{};
  const pres=(c.presentations||[]).find(p=>p.id===presId)||{};
  const price=cpProdPrice(c,presId,varsSel);
  const varParts=[]; const varsObj={};
  (c.variables||[]).forEach(vg=>{ const o=(vg.options||[]).find(x=>x.id===varsSel[vg.id]); if(o){ varParts.push(o.name); varsObj[vg.id]={id:o.id,name:o.name,price:Number(o.price)||0,group:vg.name}; } });
  // Nombre igual que la comanda: presentación primero; si no tiene, el alias de la
  // categoría (comanda_alias) o su nombre. Luego el producto y las variantes.
  const _cat=(S.cpCategorias||[]).find(x=>String(x.id)===String(c.category_id));
  const _presLabel=(pres.name||'')||(_cat?(_cat.comanda_alias||_cat.name):'')||'';
  S.cpOrder.productos.push({ product_id:c.id, cat:c.category_id, product_name:[_presLabel,c.name].concat(varParts).filter(Boolean).join(' · '), unit_price:price, cantidad:1, tamano:pres.name||'', pres_id:presId, variantes:varsObj, adiciones:[], adic_options:cpAdicOptions(c,presId), notas:'', matched:true });
  cpRenderForm(S.cpOrder);
}
// GUARDAR el pedido como BORRADOR en la conversación (no lo crea en el sistema ni
// imprime). Sergio lo puede editar cuantas veces quiera; solo se envía a cocina
// (crea + imprime) cuando toca "Enviar a cocina" en la tarjeta del chat.
async function cpConfirm(){ if(!S.cpOrder) return; cpSyncTop(); cpSyncProdInputs(); const o=S.cpOrder;
  if(!(o.productos||[]).length){ showToast('El pedido no tiene productos','error'); return; }
  const convId=S.activeConvId;
  const borrador=Object.assign({}, o, { empaque:cpEmpaque(), total:cpOrderTotal() });
  const btn=document.getElementById('cpConfirmBtn'); if(btn){ btn.disabled=true; btn.textContent='Guardando…'; }
  try{
    const { error }=await sb.from('chat_conversations').update({ pedido_borrador: borrador }).eq('id', convId);
    if(error) throw error;
    cpSaveClienteLocal(o);                                            // que aparezca en el selector de domicilios
    showToast('📝 Pedido guardado en el chat','success');
    cpClose();
    renderDraftBar(borrador);
  }catch(e){ showToast('Error al guardar: '+(e&&e.message||e),'error'); }
  finally{ var b2=document.getElementById('cpConfirmBtn'); if(b2){ b2.disabled=false; b2.textContent='Guardar pedido'; } }
}

// Tarjeta del pre-pedido en el chat (encima del compositor).
function renderDraftBar(borrador){
  const bar=document.getElementById('cpDraftBar'); if(!bar) return;
  if(!borrador || !(borrador.productos||[]).length){ bar.style.display='none'; bar.innerHTML=''; return; }
  const total=Number(borrador.total)|| (borrador.productos||[]).reduce((a,p)=>a+(Number(p.unit_price)||0)*(Number(p.cantidad)||1),0);
  const lineas=(borrador.productos||[]).map(p=>cpEsc((Number(p.cantidad)||1)+'× '+(p.product_name||'Producto'))).join('  ·  ');
  bar.innerHTML='<div class="cp-draft-info"><div class="cp-draft-title">📝 Pedido sin enviar · <b>'+cpCOP(total)+'</b></div><div class="cp-draft-items">'+lineas+'</div></div>'
    +'<div class="cp-draft-btns"><button class="cp-draft-edit" onclick="cpEditarBorrador()">✏️ Editar</button><button class="cp-draft-send" id="cpDraftSend" onclick="cpEnviarCocina()">🍳 Enviar a cocina</button></div>';
  bar.style.display='flex';
}
async function loadDraftBar(convId){
  try{ const { data }=await sb.from('chat_conversations').select('pedido_borrador').eq('id', convId).maybeSingle();
    renderDraftBar(data && data.pedido_borrador);
  }catch(e){ renderDraftBar(null); }
}
// Reabrir el modal con el borrador guardado (para modificarlo).
async function cpEditarBorrador(){
  const convId=S.activeConvId;
  try{ const { data }=await sb.from('chat_conversations').select('pedido_borrador').eq('id', convId).maybeSingle();
    if(!data || !data.pedido_borrador){ showToast('No hay pedido para editar','info'); return; }
    openCrearPedido(data.pedido_borrador);
  }catch(e){ showToast('No se pudo abrir el pedido','error'); }
}

// ENVIAR A COCINA: crea el pedido en el sistema E imprime la comanda (lo que antes
// hacía "Crear e imprimir"), luego limpia el borrador.
async function cpEnviarCocina(){
  const convId=S.activeConvId;
  let o=null;
  try{ const { data }=await sb.from('chat_conversations').select('pedido_borrador').eq('id', convId).maybeSingle(); o=data&&data.pedido_borrador; }catch(e){}
  if(!o || !(o.productos||[]).length){ showToast('No hay pedido para enviar','error'); return; }
  const payload={ conversation_id:convId, branch_id:o.branch_id, tenant_id:o.tenant_id, cliente:o.cliente, telefono:o.telefono, direccion:o.direccion||'', barrio:o.barrio||'', tipo:o.tipo, pago:o.pago, notas:o.notas, domi_precio:(o.tipo==='domicilio'?(Number(o.domi_precio)||0):0), empaque:Number(o.empaque)||0,
    productos:(o.productos||[]).map(p=>({ product_id:p.product_id, product_name:p.product_name, unit_price:p.unit_price, cantidad:p.cantidad, tamano:p.tamano, variantes:p.variantes||{}, adiciones:p.adiciones||[], notas:p.notas })) };
  const btn=document.getElementById('cpDraftSend'); if(btn){ btn.disabled=true; btn.textContent='Enviando…'; }
  var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
  var to=setTimeout(function(){ if(ctrl) ctrl.abort(); },20000);
  try{
    const res=await fetch(CREAR_PEDIDO_FN,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload), signal: ctrl?ctrl.signal:undefined});
    const data=await res.json();
    if(data.error){ showToast('Error: '+data.error,'error'); return; }
    showToast('🍳 Enviado a cocina · '+cpCOP(data.total),'success');
    try{ await sb.from('chat_conversations').update({ pedido_borrador: null }).eq('id', convId); }catch(_e){}
    renderDraftBar(null);
    if(window.posAutoprint && window.electronPOS){ try{
      window._pos = window._pos || {}; window._pos.sb = window._pos.sb || sb;
      window._pos.state = window._pos.state || {}; window._pos.state.branchId = S.branchId;
      try{ localStorage.setItem('pos.branchId', S.branchId); }catch(_e){}
      window.posAutoprint(data.orderId);
    }catch(e){} }   // imprimir comanda
  }catch(e){
    showToast((e && e.name==='AbortError') ? 'Tardó demasiado, intenta de nuevo' : ('Error: '+(e&&e.message||e)), 'error');
  }finally{
    clearTimeout(to);
    var b2=document.getElementById('cpDraftSend'); if(b2){ b2.disabled=false; b2.textContent='🍳 Enviar a cocina'; }
  }
}
// Guarda el cliente en localStorage 'pos.clientes' (donde domicilios/venta rápida leen la lista),
// para que el cliente creado desde el chat aparezca como un contacto más. Formato igual a domicilios.js.
function cpSaveClienteLocal(o){
  try{
    const tel=String(o.telefono||'').replace(/\D/g,'');
    if(!tel && !o.cliente) return;
    const nn=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
    const list=JSON.parse(localStorage.getItem('pos.clientes')||'[]');
    if(list.some(c=>nn(c.tel)===nn(tel)&&nn(c.nombre)===nn(o.cliente)&&nn(c.dir)===nn(o.direccion))) return;
    list.unshift({ id:'c'+Date.now(), nombre:o.cliente||'Cliente', tel:tel, barrio:o.barrio||'', dir:o.direccion||'', tipdoc:'', numdoc:'', email:'', notas:'' });
    localStorage.setItem('pos.clientes', JSON.stringify(list));
  }catch(e){ console.warn('cpSaveClienteLocal:', e); }
}

/* ══════════════ ETIQUETAS — agrupar chats por etiqueta ══════════════ */
const ETQ_COLORS = ['#8B5CF6','#EF4444','#F59E0B','#10B981','#0EA5E9','#EC4899','#6366F1','#84CC16'];
S.etiquetas = S.etiquetas || [];
S.etqColor = ETQ_COLORS[0];

async function loadEtiquetas(){
  try{ const { data } = await sb.from('ia_config').select('etiquetas').eq('branch_id', S.branchId).maybeSingle();
    S.etiquetas = (data && Array.isArray(data.etiquetas)) ? data.etiquetas : []; }
  catch(e){ S.etiquetas=[]; }
  renderSidebarLabels();
}
async function saveEtiquetasDB(){ try{ await sb.from('ia_config').update({ etiquetas: S.etiquetas }).eq('branch_id', S.branchId); }catch(e){ console.error('saveEtiquetas:', e); } }
function renderSidebarLabels(){
  const cont=document.getElementById('navLabels'), cap=document.getElementById('labelsCap');
  if(!cont) return;
  const list=S.etiquetas||[];
  if(cap) cap.style.display = list.length ? '' : 'none';
  cont.innerHTML = list.map(e=>
    '<button class="ci-nav-btn ci-nav-label" data-view="label:'+e.id+'" onclick="selectNavView(this)">'
    +'<span class="ci-nav-l"><span class="ci-lbl-dot" style="background:'+e.color+'"></span><span>'+qrEsc(e.name)+'</span></span>'
    +'<span class="ci-nav-badge" id="lbbadge-'+e.id+'" style="display:none"></span>'
    +'<span class="ci-lbl-del" title="Borrar" onclick="event.stopPropagation();deleteEtiqueta(\''+e.id+'\')">✕</span>'
    +'</button>').join('');
  updateLabelBadges();
}
function selectNavView(btn){ document.querySelectorAll('.ci-nav-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); S.activeView=btn.dataset.view; loadConversations(); }
function openChatWindow(){
  var mm=document.getElementById('moreMenu'); if(mm) mm.style.display='none';
  try{
    var w=window.open('chat-ia.html','cobra-chat-'+Date.now(),'width=1180,height=820,resizable=yes,menubar=no,toolbar=no,location=no,status=no');
    if(!w){ showToast('El sistema bloqueó la ventana. Permite ventanas emergentes.','error'); return; }
    // Intento adicional: si el .exe expone control de menú, ocultarlo en la ventana nueva
    try{ if(window.electronPOS && typeof window.electronPOS.hideMenuBar==='function') window.electronPOS.hideMenuBar(); }catch(e){}
  }catch(e){ showToast('No se pudo abrir la ventana: '+e.message,'error'); }
}
function openCrearEtiqueta(){
  var mm=document.getElementById('moreMenu'); if(mm) mm.style.display='none';
  S.etqColor=ETQ_COLORS[0];
  var cont=document.getElementById('etqColors');
  if(cont) cont.innerHTML=ETQ_COLORS.map(function(c,i){ return '<button class="etq-color'+(i===0?' sel':'')+'" style="background:'+c+'" onclick="pickEtqColor(this,\''+c+'\')"></button>'; }).join('');
  var inp=document.getElementById('etqName'); if(inp) inp.value='';
  document.getElementById('etqModal').style.display='flex'; if(inp) inp.focus();
}
function pickEtqColor(btn,c){ S.etqColor=c; document.querySelectorAll('#etqColors .etq-color').forEach(function(b){ b.classList.remove('sel'); }); btn.classList.add('sel'); }
function closeEtqModal(){ document.getElementById('etqModal').style.display='none'; }
async function saveEtiqueta(){
  var inp=document.getElementById('etqName'); var name=(inp.value||'').trim(); if(!name){ inp.focus(); return; }
  S.etiquetas=S.etiquetas||[]; S.etiquetas.push({ id:'e'+Date.now().toString(36), name:name, color:S.etqColor });
  await saveEtiquetasDB(); renderSidebarLabels(); closeEtqModal(); showToast('Etiqueta creada ✓','success');
}
function deleteEtiqueta(id){
  var e=(S.etiquetas||[]).find(function(x){ return x.id===id; }); if(!e) return;
  S._etqDelId=id;
  var msg=document.getElementById('etqDelMsg'); if(msg) msg.innerHTML='¿Seguro que quieres eliminar la etiqueta <b style="color:#fff">"'+qrEsc(e.name)+'"</b>? Los chats que la tengan la perderán.';
  document.getElementById('etqDelModal').style.display='flex';
}
function closeEtqDel(){ var m=document.getElementById('etqDelModal'); if(m) m.style.display='none'; S._etqDelId=null; }
async function confirmDeleteEtiqueta(){
  var id=S._etqDelId; if(!id){ closeEtqDel(); return; }
  S.etiquetas=(S.etiquetas||[]).filter(function(e){ return e.id!==id; });
  await saveEtiquetasDB(); renderSidebarLabels();
  if(S.activeView==='label:'+id){ var b=document.querySelector('.ci-nav-btn[data-view="all"]'); if(b) selectNavView(b); }
  closeEtqDel(); showToast('Etiqueta eliminada','info');
}
async function openEtiquetarChat(){
  var mm=document.getElementById('moreMenu'); if(mm) mm.style.display='none';
  if(!S.activeConvId){ showToast('Abre una conversación primero','info'); return; }
  if(!(S.etiquetas||[]).length){ showToast('Primero crea una etiqueta','info'); openCrearEtiqueta(); return; }
  var conv=S.conversations.find(function(c){ return c.id===S.activeConvId; });
  if(conv && Array.isArray(conv.labels)){ S._etqLabels=conv.labels.slice(); }
  else{ try{ var res=await sb.from('chat_conversations').select('labels').eq('id',S.activeConvId).maybeSingle(); S._etqLabels=(res.data&&Array.isArray(res.data.labels))?res.data.labels:[]; }catch(e){ S._etqLabels=[]; } }
  renderEtqAssign(); document.getElementById('etqAssignModal').style.display='flex';
}
function renderEtqAssign(){
  var has=Array.isArray(S._etqLabels)?S._etqLabels:[];
  var cont=document.getElementById('etqAssignList');
  cont.innerHTML=(S.etiquetas||[]).map(function(e){
    return '<button class="etq-assign-item'+(has.indexOf(e.id)>=0?' on':'')+'" onclick="toggleConvLabel(\''+e.id+'\')">'
      +'<span class="ci-lbl-dot" style="background:'+e.color+'"></span><span style="flex:1;text-align:left">'+qrEsc(e.name)+'</span>'
      +'<span class="etq-check">'+(has.indexOf(e.id)>=0?'✓':'')+'</span></button>';
  }).join('');
}
async function toggleConvLabel(id){
  var cid=S.activeConvId; if(!cid) return;
  var labels=Array.isArray(S._etqLabels)?S._etqLabels.slice():[];
  var i=labels.indexOf(id); if(i>=0) labels.splice(i,1); else labels.push(id);
  var upd=await sb.from('chat_conversations').update({ labels:labels }).eq('id', cid).select('id');
  if(upd.error){ showToast('No se pudo etiquetar: '+upd.error.message,'error'); return; }
  if(!upd.data || !upd.data.length){ showToast('No se pudo etiquetar (sin permiso o no encontrada)','error'); return; }
  S._etqLabels=labels;
  var conv=S.conversations.find(function(c){ return c.id===cid; }); if(conv) conv.labels=labels;
  renderEtqAssign();
  if(S.activeView && S.activeView.slice(0,6)==='label:') loadConversations();
}
function closeEtqAssign(){ document.getElementById('etqAssignModal').style.display='none'; }

/* ══ Respuestas dinámicas: /total y /puntos ══
   Con el flujo de BORRADOR, el precio a cotizar sale del pedido sin enviar
   (chat_conversations.pedido_borrador). Si ya no hay borrador (ya se envió a
   cocina), se usa el pedido creado (conv.order_id → pos_orders). ══ */
async function resolveDynReply(r){
  var cid=S.activeConvId; if(!cid){ showToast('Abre una conversación primero','info'); return null; }
  var prod=0, domi=0, total=0, got=false;
  try{
    var dres=await sb.from('chat_conversations').select('pedido_borrador,order_id').eq('id',cid).maybeSingle();
    var d=dres&&dres.data;
    // 1) Preferir el BORRADOR sin enviar (lo que el cliente aún va a confirmar)
    if(d && d.pedido_borrador && Array.isArray(d.pedido_borrador.productos) && d.pedido_borrador.productos.length){
      var b=d.pedido_borrador;
      domi=(String(b.tipo)==='domicilio')?(Number(b.domi_precio)||0):0;
      total=Number(b.total)||0;
      prod=total-domi;            // productos + adiciones + empaque, SIN domicilio
      got=true;
    }
    // 2) Si no hay borrador, usar el pedido YA creado
    else if(d && d.order_id){
      var res=await sb.from('pos_orders').select('subtotal,packaging_fee,delivery_fee,total').eq('id',d.order_id).maybeSingle();
      var order=res&&res.data;
      if(order){ prod=(Number(order.subtotal)||0)+(Number(order.packaging_fee)||0); domi=Number(order.delivery_fee)||0; total=Number(order.total)||(prod+domi); got=true; }
    }
  }catch(e){}
  if(!got){ showToast('Primero guarda o crea el pedido para calcular los valores','info'); return null; }
  var puntos=Math.floor(prod/1000);
  if(r.dyn==='total') return 'Con gusto, serían '+cpCOP(prod)+' de tu pedido'+(domi>0?' y '+cpCOP(domi)+' del domicilio':'')+', total '+cpCOP(total)+' 😊\nEn un momento enviamos tu pedido 🍟';
  if(r.dyn==='puntos') return 'Acabas de ganar '+puntos+' punto'+(puntos===1?'':'s')+' con tu compra 🎉 Cuando nos visites en el establecimiento o vuelvas a pedir, recuerda dar tu número de celular para seguir acumulando puntos y redimirlos en productos de El Parche 🍟';
  return r.t;
}

// Envía una respuesta rápida que lleva IMAGEN (ej. el QR de pago) + su texto como caption.
// "@qr" se resuelve al QR de pago del negocio guardado en Storage (chat-media/qr-pago/{branch}).
async function sendQuickMedia(r) {
  if (!S.activeConvId) return;
  let url = r.img;
  if (url === '@qr') {
    try {
      const { data } = await sb.storage.from('chat-media').list('qr-pago/' + S.branchId);
      const f = (data||[]).find(x => /^qr\./i.test(x.name)) || (data||[])[0];
      if (!f) { showToast('Aún no has subido el QR de pago en Configuración', 'error'); return; }
      url = sb.storage.from('chat-media').getPublicUrl('qr-pago/' + S.branchId + '/' + f.name).data.publicUrl;
    } catch (e) { showToast('No se pudo cargar el QR de pago', 'error'); return; }
  }
  const caption = r.t || '';
  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId, direction:'out', media_url: url, media_type:'image', body: caption, delivery_status:'sending', sent_at: new Date().toISOString() });
  renderThread();
  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId, direction:'out',
    body: caption, media_url: url, media_type:'image', delivery_status:'sent', agent_id: S.user?.id || null,
  }]).select().single();
  if (error) { S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); showToast('No se pudo enviar', 'error'); return; }
  S.messages = S.messages.map(m => m.id === tmpId ? data : m);
  renderThread();
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (conv) {
    conv.last_message = '📷 ' + (caption || 'Imagen'); conv.last_message_at = data.sent_at; conv.last_sender = 'agent';
    S.conversations.sort((a,b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvList();
  }
  if (conv && ['whatsapp','instagram','facebook'].includes(conv.channel)) {
    try {
      const res = await fetch(META_SEND_FN, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: S.activeConvId, media_url: url, media_type:'image', text: caption, message_id: data.id }),
      });
      const rd = await res.json();
      if (rd.error) { showToast('No se pudo enviar la imagen: ' + rd.error, 'error'); }
    } catch (e) { showToast('Error al enviar: ' + e.message, 'error'); }
  }
}
// Devuelve true si consumió la tecla (dropdown abierto)
function onQuickKeydown(e) {
  if (!S.qrOpen) return false;
  const list = S._qrList || [];
  if (e.key === 'ArrowDown') { e.preventDefault(); S.qrIndex = Math.min(list.length-1, S.qrIndex+1); renderQuickDropdown((document.getElementById('msgInput').value||'').replace(/^\//,'')); return true; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); S.qrIndex = Math.max(0, S.qrIndex-1); renderQuickDropdown((document.getElementById('msgInput').value||'').replace(/^\//,'')); return true; }
  if (e.key === 'Enter')     { e.preventDefault(); qrPick(null, S.qrIndex); return true; }
  if (e.key === 'Escape')    { e.preventDefault(); closeQuickDropdown(); return true; }
  return false;
}

/* == Administrar respuestas rápidas (agregar / editar / borrar) == */
function openQuickManage() {
  closeQuickDropdown();
  const p = document.getElementById('quickManage'); if (!p) return;
  S.qmEditIdx = -1;
  qmRenderList(); qmClearForm();
  p.style.display = 'block';
}
function closeQuickManage() { const p = document.getElementById('quickManage'); if (p) p.style.display = 'none'; }
function qmRenderList() {
  const cont = document.getElementById('quickMngList'); if (!cont) return;
  const list = S.quickReplies || [];
  if (!list.length) { cont.innerHTML = '<div style="padding:14px;color:var(--text-4);font-size:12.5px;text-align:center">Sin respuestas rápidas aún</div>'; return; }
  cont.innerHTML = list.map((r,i) =>
    '<div class="ci-qm-row">'
    + '<div class="ci-qm-info"><div class="ci-qm-k">/'+qrEsc(r.k)+'</div><div class="ci-qm-t">'+qrEsc(r.t).replace(/\n/g,' ')+'</div></div>'
    + '<button class="ci-qm-ed" title="Editar" onclick="qmEdit('+i+')">✎</button>'
    + '<button class="ci-qm-del" title="Eliminar" onclick="qmDelete('+i+')">✕</button>'
    + '</div>'
  ).join('');
}
function qmClearForm() {
  S.qmEditIdx = -1;
  const k = document.getElementById('qmKey'), t = document.getElementById('qmText'), c = document.getElementById('qmCancelEdit'), s = document.getElementById('qmSaveBtn');
  if (k) k.value = ''; if (t) t.value = ''; if (c) c.style.display = 'none'; if (s) s.textContent = 'Agregar respuesta';
}
function qmEdit(i) {
  const r = (S.quickReplies||[])[i]; if (!r) return;
  S.qmEditIdx = i;
  const k = document.getElementById('qmKey'), t = document.getElementById('qmText'), c = document.getElementById('qmCancelEdit'), s = document.getElementById('qmSaveBtn');
  if (k) k.value = r.k; if (t) t.value = r.t; if (c) c.style.display = 'inline-flex'; if (s) s.textContent = 'Guardar cambios';
  if (k) k.focus();
}
async function qmSave() {
  const k = (document.getElementById('qmKey').value||'').trim();
  const t = (document.getElementById('qmText').value||'').trim();
  if (!k || !t) { showToast('Escribe la palabra clave y el mensaje', 'error'); return; }
  const key = k.replace(/^\/+/, '');   // sin la barra
  S.quickReplies = S.quickReplies || [];
  if (S.qmEditIdx >= 0) S.quickReplies[S.qmEditIdx] = { k:key, t };
  else S.quickReplies.unshift({ k:key, t });
  await saveQuickReplies();
  qmRenderList(); qmClearForm();
  showToast('Respuesta guardada ✓', 'success');
}
async function qmDelete(i) {
  S.quickReplies.splice(i, 1);
  await saveQuickReplies();
  qmRenderList();
  showToast('Respuesta eliminada', 'info');
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
/* == MODO GLOBAL DEL ASISTENTE (ia_config.modo_asistente) ==
   3 modos para TODAS las conversaciones:
     off  → el bot no contesta (tú contestas todo)
     on   → el bot contesta siempre
     auto → el bot contesta SOLO fuera del horario de atención; en horario
            se queda callado para que contestes tú. El backend (delay-reply)
            usa los mismos horarios de ia_config para saber abierto/cerrado.
   Se mantiene `activo` sincronizado (off→false, on/auto→true) por compat. */
const IA_MODOS = {
  off:  { txt: 'Pausado · contestas tú',                      col: '#DC2626', bg: '#FEF2F2', bd: '#FECACA', toast: '⏸️ Asistente pausado · contestas tú' },
  on:   { txt: 'Encendido · responde siempre',                col: '#16A34A', bg: '#F0FDF4', bd: '#BBF7D0', toast: '✅ Asistente encendido · responde siempre' },
  auto: { txt: 'Automático · responde solo fuera del horario', col: '#2563EB', bg: '#EFF6FF', bd: '#BFDBFE', toast: '🕐 Automático · el bot contesta solo fuera del horario' },
};
async function loadIaMaster() {
  if (!S.branchId) return;
  try {
    const { data } = await sb.from('ia_config').select('modo_asistente, activo').eq('branch_id', S.branchId).maybeSingle();
    const modo = data ? (data.modo_asistente || (data.activo ? 'on' : 'off')) : 'off';
    renderIaMaster(modo);
  } catch (e) { console.warn('loadIaMaster:', e); }
}
function renderIaMaster(modo) {
  S.iaModo = modo;
  const wrap = document.getElementById('iaMaster');
  if (!wrap) return;
  const m = IA_MODOS[modo] || IA_MODOS.off;
  const dot = document.getElementById('iaMasterDot');
  if (dot) { dot.style.background = m.col; dot.style.boxShadow = '0 0 0 3px ' + m.bg; }
  wrap.title = m.txt;   // el detalle del estado queda en el tooltip
  document.querySelectorAll('#iaModes .ia-modo-btn').forEach(b => b.classList.toggle('on', b.dataset.iamodo === modo));
}
async function setIaModo(modo) {
  if (!S.branchId || !IA_MODOS[modo] || modo === S.iaModo) return;
  const prev = S.iaModo;
  renderIaMaster(modo);   // feedback inmediato
  try {
    const { error } = await sb.from('ia_config').update({ modo_asistente: modo, activo: modo !== 'off' }).eq('branch_id', S.branchId);
    if (error) throw error;
    showToast(IA_MODOS[modo].toast, modo === 'off' ? 'info' : 'success');
  } catch (e) { console.error('setIaModo:', e); showToast('Error al cambiar el asistente', 'error'); renderIaMaster(prev); }
}

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
  const item = $('botToggleItem');
  const sw   = $('botSwitch');
  const sub  = $('botToggleSub');
  if (item) item.classList.toggle('is-human', isHuman);
  if (sw)   sw.classList.toggle('off', isHuman);   // isHuman = bot pausado = interruptor apagado
  if (sub)  sub.textContent = isHuman ? 'Pausado · tú respondes' : 'Activo en este chat';
}

async function toggleHumanTakeover() {
  closeMoreMenu();
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
// ── Pagos por confirmar ───────────────────────────────────────────────────────


// Conversación activa REAL (el bug clásico: S.activeConv nunca existió — el
// estado guarda S.activeConvId; esto dejaba muertos varios botones del panel)
function getActiveConv() {
  if (!S.activeConvId) return null;
  return (S.conversations || []).find(function(cv){ return cv.id === S.activeConvId; }) || { id: S.activeConvId };
}

async function updatePagoBadge() {
  try {
    const { count } = await sb.from('chat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', S.branchId)
      .eq('pago_pendiente', true)
      .eq('status', 'open');
    S.pagoCount = count || 0;
    const el = $('badge-pagos');
    if (el) el.textContent = S.pagoCount || '';
  } catch(e) { console.error('updatePagoBadge:', e); }
}

function updatePagoConfirmBtn(isPendiente) {
  const btn = $('pagoConfirmBtn');
  if (!btn) return;
  btn.style.display = isPendiente ? '' : 'none';
}

function updateDomiConfirmBtn(isPendiente) {
  const btn = $('domiConfirmBtn');
  if (!btn) return;
  btn.style.display = isPendiente ? '' : 'none';
}

function updateSinNomBtn(isActive) {
  const item = $('nomItem');
  const hint = $('nomHint');
  if (item) item.classList.toggle('is-active', isActive);
  if (hint) hint.textContent = isActive ? 'Sin nomenclatura' : 'Sin asignar';
}

async function toggleSinNomenclatura() {
  closeMoreMenu();
  const conv = getActiveConv();
  if (!conv) return;
  const newVal = !conv.sin_nomenclatura;
  try {
    await sb.from('chat_conversations').update({ sin_nomenclatura: newVal }).eq('id', conv.id);
    conv.sin_nomenclatura = newVal;
    updateSinNomBtn(newVal);
    showToast(newVal ? 'Cliente marcado como sin nomenclatura' : 'Nomenclatura requerida restaurada', 'success');
  } catch(e) {
    console.error('toggleSinNomenclatura:', e);
    showToast('Error al actualizar', 'error');
  }
}

/* ══ Estados de pedido (pastilla del encabezado) ══
   Fuente única: pos_orders.estado. Sincroniza con la pantalla de Ventas.
   rápida: en preparación → listo → entregado
   domicilio: en preparación → listo → en camino → entregado */
const CI_ESTADOS = {
  en_preparacion: { label:'En preparación', color:'#f97316', bg:'rgba(249,115,22,.15)', ico:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1-1-2-1-3 2 1 4 3 4 7a6 6 0 0 1-12 0c0-4 3-5 4-7z"/></svg>' },
  listo:          { label:'Listo',          color:'#3b82f6', bg:'rgba(59,130,246,.15)', ico:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
  en_camino:      { label:'En camino',      color:'#8b5cf6', bg:'rgba(139,92,246,.15)', ico:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' },
  entregado:      { label:'Entregado',      color:'#22c55e', bg:'rgba(34,197,94,.15)', ico:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 10.5 11 14 16.5 8.5"/></svg>' },
};
const CI_ESTADO_FLOW = {
  rapido:    ['en_preparacion','listo','entregado'],
  domicilio: ['en_preparacion','listo','en_camino','entregado'],
};
async function loadEstadoPill(conv){
  const wrap=$('estadoWrap'); if(!wrap) return;
  if(!conv || !conv.order_id){ wrap.style.display='none'; S.estadoOrder=null; return; }
  try{
    const { data }=await sb.from('pos_orders').select('id,channel,estado').eq('id',conv.order_id).maybeSingle();
    if(!data){ wrap.style.display='none'; S.estadoOrder=null; return; }
    S.estadoOrder={ id:data.id, channel:(String(data.channel||'').toLowerCase()==='domicilio'?'domicilio':'rapido'), estado:data.estado||'en_preparacion' };
    renderEstadoPill();
    wrap.style.display='';
  }catch(e){ wrap.style.display='none'; S.estadoOrder=null; }
}
function renderEstadoPill(){
  const o=S.estadoOrder; if(!o) return;
  const meta=CI_ESTADOS[o.estado]||CI_ESTADOS.en_preparacion;
  const pill=$('estadoPill'), ico=$('estadoIco'), lbl=$('estadoLabel'), menu=$('estadoMenu');
  if(pill){ pill.style.background=meta.bg; pill.style.color=meta.color; pill.style.borderColor=meta.color; }
  if(ico) ico.innerHTML=meta.ico;
  if(lbl) lbl.textContent=meta.label;
  if(menu){
    const flow=CI_ESTADO_FLOW[o.channel]||CI_ESTADO_FLOW.rapido;
    menu.innerHTML=flow.map(function(k){ const m=CI_ESTADOS[k]; const on=(k===o.estado);
      return '<button class="ci-estado-opt'+(on?' on':'')+'" onclick="cambiarEstado(\''+k+'\')"><span class="ci-estado-ico" style="color:'+m.color+'">'+m.ico+'</span><span style="flex:1">'+m.label+'</span>'+(on?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':'')+'</button>';
    }).join('');
  }
}
function toggleEstadoMenu(e){
  e.stopPropagation();
  const menu=$('estadoMenu'); if(!menu) return;
  const open=menu.style.display!=='none';
  menu.style.display=open?'none':'block';
  if(!open) setTimeout(function(){ document.addEventListener('click',closeEstadoMenu,{once:true}); },0);
}
function closeEstadoMenu(){ const m=$('estadoMenu'); if(m) m.style.display='none'; }
const CAMBIAR_ESTADO_FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/cambiar-estado';
async function cambiarEstado(nuevo){
  closeEstadoMenu();
  const o=S.estadoOrder; if(!o || nuevo===o.estado) return;
  const meta=CI_ESTADOS[nuevo]; if(!meta) return;
  const ok=await ciConfirm('¿El pedido pasa a <b style="color:'+meta.color+'">'+meta.label+'</b>?');
  if(!ok) return;
  const prev=o.estado; o.estado=nuevo; renderEstadoPill();   // optimista
  try{
    // Función central: escribe estado + delivery_status (sincroniza con Ventas),
    // marca delivered_at si entregado, y dispara etiqueta + mensaje al cliente.
    const res=await fetch(CAMBIAR_ESTADO_FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ order_id:o.id, estado:nuevo })});
    const d=await res.json().catch(function(){return {};});
    if(d.error){ o.estado=prev; renderEstadoPill(); showToast('No se pudo cambiar el estado: '+d.error,'error'); return; }
    showToast('Estado: '+meta.label, 'success');
  }catch(e){ o.estado=prev; renderEstadoPill(); showToast('No se pudo cambiar el estado','error'); }
}
/* Config de estados (etiqueta + mensaje por tipo/estado + minutos auto-entregado) */
async function getEstadosConfig(){
  if(S._estadosConfig) return S._estadosConfig;
  try{ const { data }=await sb.from('ia_config').select('estados_config').eq('branch_id', S.branchId).maybeSingle();
    S._estadosConfig=(data && data.estados_config) || {}; }catch(e){ S._estadosConfig={}; }
  return S._estadosConfig;
}
/* Al cambiar un estado: pone la etiqueta configurada (quitando otras de estado) y
   envía el mensaje configurado al cliente. Sirve para llevar y domicilio. */
async function aplicarEfectosEstado(conv, orderChannel, estado){
  const cfg=await getEstadosConfig();
  const tipo = (orderChannel==='domicilio') ? 'domicilio' : 'llevar';
  const e = (cfg[tipo] && cfg[tipo][estado]) || {};
  // 1) Etiqueta: quitar las etiquetas asociadas a OTROS estados y poner la de este
  if(e.etiqueta){
    try{
      let labels = Array.isArray(conv.labels) ? conv.labels.slice() : [];
      const estadoEtqs = new Set();
      ['en_preparacion','listo','en_camino','entregado'].forEach(function(k){
        var et = cfg[tipo] && cfg[tipo][k] && cfg[tipo][k].etiqueta; if(et) estadoEtqs.add(et);
      });
      labels = labels.filter(function(l){ return !estadoEtqs.has(l); });
      if(labels.indexOf(e.etiqueta)<0) labels.push(e.etiqueta);
      await sb.from('chat_conversations').update({ labels: labels }).eq('id', conv.id);
      conv.labels = labels;
      if(typeof updateLabelBadges==='function') updateLabelBadges();
    }catch(err){ console.error('etiqueta estado:', err); }
  }
  // 2) Mensaje automático al cliente
  if(e.mensaje && String(e.mensaje).trim()){
    await enviarMensajeAuto(conv.id, String(e.mensaje).trim(), conv.channel);
  }
}
async function enviarMensajeAuto(convId, text, channel){
  try{
    const { data, error }=await sb.from('chat_messages').insert([{ conversation_id:convId, tenant_id:S.tenantId, direction:'out', body:text, delivery_status:'sent', agent_id:S.user?.id||null }]).select().single();
    if(error){ console.error('msg auto insert:', error); return; }
    if(convId===S.activeConvId){ S.messages.push(data); renderThread(); }
    if(['instagram','facebook','whatsapp'].indexOf(channel)>=0){
      const res=await fetch(META_SEND_FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ conversation_id:convId, text:text, message_id:data.id })});
      const rd=await res.json().catch(function(){return {};});
      if(rd.error) showToast('Mensaje de estado no se envió: '+rd.error,'error');
    }
  }catch(e){ console.error('enviarMensajeAuto:', e); }
}
/* Confirmación reutilizable */
function ciConfirm(msgHtml){
  return new Promise(function(res){
    const ov=document.createElement('div'); ov.className='ci-confirm-ov';
    ov.innerHTML='<div class="ci-confirm-box"><div class="ci-confirm-msg">'+msgHtml+'</div><div class="ci-confirm-btns"><button class="ci-confirm-no" type="button">Cancelar</button><button class="ci-confirm-yes" type="button">Sí, confirmar</button></div></div>';
    document.body.appendChild(ov);
    const done=function(v){ ov.remove(); res(v); };
    ov.querySelector('.ci-confirm-no').onclick=function(){ done(false); };
    ov.querySelector('.ci-confirm-yes').onclick=function(){ done(true); };
    ov.onclick=function(e){ if(e.target===ov) done(false); };
  });
}

/* ══════════════ VERIFICAR PAGO POR TRANSFERENCIA (solo vista operador) ══════════════
   Botón $ del header. Reusa el motor de verify-transfer pero SOLO-lectura: lee el
   comprobante (Vision), compara cuenta/monto/correo del banco, y me MUESTRA el veredicto
   a mí (no le responde al cliente). Si verifica bien, aplica la etiqueta "Pago". */
const VERIFICAR_PAGO_FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/verificar-pago-manual';
async function verificarPagoModal(){
  const conv = getActiveConv();
  if(!conv){ showToast('Abre un chat primero','info'); return; }
  // Monto a verificar: el del borrador (pre-pedido) o, si ya se envió, el del pedido creado.
  let monto = 0;
  try{
    const { data } = await sb.from('chat_conversations').select('pedido_borrador,order_id').eq('id',conv.id).maybeSingle();
    if(data && data.pedido_borrador && Number(data.pedido_borrador.total)>0){ monto = Number(data.pedido_borrador.total); }
    else if(data && data.order_id){
      const r = await sb.from('pos_orders').select('total,total_final').eq('id',data.order_id).maybeSingle();
      if(r.data){ monto = Number(r.data.total)||Number(r.data.total_final)||0; }
    }
  }catch(e){}
  const ov = vpProgress();
  try{
    const res = await fetch(VERIFICAR_PAGO_FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ conversation_id:conv.id, monto })});
    const d = await res.json().catch(function(){ return { verified:false, razon:'error', mensaje:'Respuesta inválida del servidor.' }; });
    ov.remove();
    vpResult(conv, d);
  }catch(e){ ov.remove(); vpResult(conv, { verified:false, razon:'error', mensaje:'No se pudo conectar con el verificador. Revisa tu internet e intenta de nuevo.' }); }
}
function vpProgress(){
  const ov=document.createElement('div'); ov.className='vp-ov';
  ov.innerHTML='<div class="vp-box"><div class="vp-spin"></div><div class="vp-msg">Verificando pago…</div><div class="vp-sub">Leyendo el comprobante y buscando el correo del banco. Puede tardar unos segundos.</div></div>';
  document.body.appendChild(ov); return ov;
}
function vpChkRow(ok,label){
  const ico = ok
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  return '<div class="vp-chk"><span>'+ico+'</span><span>'+label+'</span></div>';
}
async function vpResult(conv, d){
  const ok = !!d.verified;
  const dt = d.datos || {};
  const chk = dt.checks || {};
  let etqMsg='';
  if(ok){ try{ etqMsg = await vpAplicarEtiquetaPago(conv); }catch(e){} }

  let checksHtml='';
  if(dt.checks){
    checksHtml = '<div class="vp-checks">'
      + vpChkRow(chk.monto,  'Monto'  + (dt.monto_comprobante_fmt ? ': '+dt.monto_comprobante_fmt+(dt.monto_esperado_fmt?' (pedido '+dt.monto_esperado_fmt+')':'') : ''))
      + vpChkRow(chk.cuenta, 'Cuenta' + (dt.cuenta_comprobante ? ': '+dt.cuenta_comprobante : ''))
      + vpChkRow(chk.correo, 'Correo del banco')
      + '</div>';
  }
  let extra='';
  const meta=[];
  if(dt.banco) meta.push(dt.banco);
  if(dt.fecha) meta.push(dt.fecha+(dt.hora?(' '+dt.hora):''));
  if(dt.referencia) meta.push('Ref: '+dt.referencia);
  if(meta.length) extra='<div class="vp-meta">'+meta.map(qrEsc).join(' · ')+'</div>';

  const head = ok
    ? '<div class="vp-ico vp-ok"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="vp-title vp-okt">Pago verificado con éxito</div>'
    : '<div class="vp-ico vp-no"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/><circle cx="12" cy="12" r="10"/></svg></div><div class="vp-title vp-not">Pago NO verificado</div>';

  const ov=document.createElement('div'); ov.className='vp-ov';
  ov.innerHTML='<div class="vp-box vp-res">'+head
    +'<div class="vp-txt">'+qrEsc(d.mensaje||'')+'</div>'
    +checksHtml+extra
    +(etqMsg?'<div class="vp-etq">🏷️ '+qrEsc(etqMsg)+'</div>':'')
    +'<button class="vp-close" type="button">Entendido</button></div>';
  document.body.appendChild(ov);
  const done=function(){ ov.remove(); };
  ov.querySelector('.vp-close').onclick=done;
  ov.onclick=function(e){ if(e.target===ov) done(); };
}
async function vpAplicarEtiquetaPago(conv){
  const cfg = await getEstadosConfig();
  const etq = (cfg && cfg.etiqueta_pago) || 'ems2h5zc7';
  if(!etq) return '';
  const et=(S.etiquetas||[]).find(function(x){ return x.id===etq; });
  const nombre = et ? et.name : 'Pago';
  let labels = Array.isArray(conv.labels) ? conv.labels.slice() : [];
  if(labels.indexOf(etq)>=0) return 'Etiqueta "'+nombre+'" ya estaba puesta';
  labels.push(etq);
  const { error } = await sb.from('chat_conversations').update({ labels: labels }).eq('id', conv.id);
  if(error) return '';
  conv.labels = labels;
  if(typeof updateLabelBadges==='function') updateLabelBadges();
  return 'Etiqueta "'+nombre+'" aplicada';
}

function abrirConfirmarDomi() {
  const conv = getActiveConv();
  if (!conv) return;
  const modal = document.createElement('div');
  modal.id = 'domiModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:14px;padding:24px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.18)">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Confirmar precio de domicilio</div>
      <div style="font-size:12px;color:var(--text-muted,#888);margin-bottom:16px">El barrio del cliente no está en la tabla de precios. Ingresa el costo del domicilio.</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px">
        <span style="font-size:15px;font-weight:600;color:var(--text-muted,#888)">$</span>
        <input id="domiPrecioInput" type="number" min="0" step="500" placeholder="Ej: 7000"
          style="flex:1;padding:10px 12px;border:1.5px solid var(--border,#ddd);border-radius:8px;font-size:15px;outline:none;background:var(--input-bg,#f8f8f8)">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('domiModal').remove()"
          style="padding:8px 16px;border:none;background:var(--hover-bg,#f0f0f0);border-radius:8px;cursor:pointer;font-size:13px">Cancelar</button>
        <button onclick="confirmarDomi()"
          style="padding:8px 16px;border:none;background:var(--accent,#e63946);color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => $('domiPrecioInput')?.focus(), 50);
}

async function confirmarDomi() {
  const conv = getActiveConv();
  if (!conv) return;
  const input = $('domiPrecioInput');
  const precio = parseInt(input?.value || '0', 10);
  if (!precio || precio < 0) { showToast('Ingresa un precio válido', 'error'); return; }
  $('domiModal')?.remove();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-domi`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conv.id, domi_precio: precio })
    });
    if (!res.ok) throw new Error(await res.text());
    conv.domi_precio_pendiente = false;
    conv.human_takeover = false;
    updateDomiConfirmBtn(false);
    updateHumanToggleBtn(false);
    await loadMessages(conv.id);
    showToast('Domicilio confirmado — pedido enviado a cocina ✅');
  } catch(e) {
    console.error('confirmarDomi:', e);
    showToast('Error al confirmar domicilio', 'error');
  }
}

async function confirmarPago() {
  const conv = getActiveConv();
  if (!conv) return;
  // CONFIRMACIÓN HUMANA: el operador revisó el comprobante con sus ojos y asume la
  // decisión — el sistema NO vuelve a correr los chequeos automáticos (que ya
  // rechazaron este pago por ventana, referencia repetida, monto, etc.).
  if (!confirm('¿Confirmas que revisaste este comprobante y el pago es válido?\n\nSe creará el pedido y se le avisará al cliente.')) return;
  const btn = $('pagoConfirmBtn');
  const txt = $('pagoConfirmTxt');
  if (btn) btn.disabled = true;
  if (txt) txt.textContent = 'Confirmando…';
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-transfer`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conv.id, manual: true })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));

    await loadMessages(conv.id);
    await loadConversations();
    if (data && data.order_id) {
      showToast('Pago confirmado — pedido creado y enviado a cocina ✅');
    } else {
      showToast('Pago confirmado. No había pedido pendiente — créalo manualmente en el POS', 'error');
    }
  } catch(e) {
    console.error('confirmarPago:', e);
    showToast('Error al confirmar: ' + (e.message || e), 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = 'Confirmar pago';
  }
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

// ── More menu (3 dots) ────────────────────────────────────────────────────────
function toggleMoreMenu(e) {
  e.stopPropagation();
  var menu = document.getElementById('moreMenu');
  if (!menu) return;
  var open = menu.style.display !== 'none';
  menu.style.display = open ? 'none' : 'block';
  if (!open) {
    // Close on next outside click
    setTimeout(function() {
      document.addEventListener('click', closeMoreMenu, { once: true });
    }, 0);
  }
}
function closeMoreMenu() {
  var menu = document.getElementById('moreMenu');
  if (menu) menu.style.display = 'none';
}

async function borrarHistorialChat() {
  closeMoreMenu();
  var convId = S.activeConvId;
  if (!convId) return;
  if (!confirm('¿Borrar todo el historial de mensajes de esta conversación? El bot empezará desde cero.')) return;

  // 1. Eliminar todos los mensajes del hilo
  await sb.from('chat_messages').delete().eq('conversation_id', convId);

  // 2. Resetear estado de la conversación
  await sb.from('chat_conversations').update({
    last_message: null,
    last_message_at: null,
    last_sender: null,
    pending_order_data: null,
    domi_precio_pendiente: false,
    human_takeover: false,
    pago_pendiente: false,
    ai_typing: false,
  }).eq('id', convId);

  // 3. Limpiar el hilo en UI
  S.messages = [];
  renderThread();
  showToast('Historial borrado — el bot empieza desde cero', 'success');
}

