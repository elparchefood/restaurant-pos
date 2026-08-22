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
/* Canales "próximamente". Instagram y Facebook salieron de aquí: la conexión
   está construida y hace falta poder grabarla para la solicitud a Meta —los
   permisos se piden mostrando la función andando, no al revés. Mientras Meta
   no apruebe, solo conecta quien tenga rol en la app (modo desarrollo), que es
   justo lo que se necesita para grabar. TikTok sí sigue sin construir. */
const SOON_CHANNELS = ['tiktok'];
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
    /* EL RESTAURANTE DE ESTA CUENTA, no "el primero que se pueda ver".
       Antes esto pedia `tenants` con `limit(1)` y confiaba en que el aislamiento
       devolviera uno solo. Para un dueño de restaurante es cierto; para el
       ADMINISTRADOR DE PLATAFORMA no: el ve todos los restaurantes, y `limit(1)`
       sin orden devuelve el que la base tenga de primero — que cambia cuando la
       tabla se reescribe. El 3 de agosto, al agregarle columnas a `tenants`, el
       orden cambio y a Sergio le empezo a salir "No hay sucursal configurada" en
       pleno turno: le estaba tocando un restaurante de prueba, sin sucursales.
       El tenant sale de la sesion, que es el unico dato que dice cual es SUYO. */
    let tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    if (!tenantId) {
      try {
        const u = await sb.auth.getUser();
        tenantId = (u.data && u.data.user && u.data.user.user_metadata && u.data.user.user_metadata.tenant_id) || null;
      } catch (e) {}
    }
    /* Si la sesion no dice de que restaurante es, NO se adivina. Antes se cogia
       "el primero que se pueda ver", y para el administrador de plataforma eso
       podia ser el restaurante de otro. Comprobado: las 4 cuentas que existen
       llevan su restaurante en la sesion, asi que este camino no deja a nadie
       por fuera — y si algun dia falta, es mejor un aviso claro que abrir la
       pantalla de otro negocio. */
    if (!tenantId) { showFatalError('Tu cuenta no tiene un restaurante asignado. Vuelve a iniciar sesión.'); return; }
    const rT = await sb.from('tenants').select('id,name').eq('id', tenantId).maybeSingle();
    const tenant = rT.data;
    if (!tenant) { showFatalError('Tu cuenta no tiene un restaurante configurado. Escríbenos para activarla.'); return; }
    S.tenantId = tenant.id;

    /* La sucursal, igual: la de la sesion. Y con orden fijo si toca escoger, para
       que no dependa de como esten guardadas las filas. */
    let branchId = (window._pos && window._pos.state && window._pos.state.branchId) || null;
    let branch = null;
    if (branchId) {
      const r = await sb.from('branches').select('id,name').eq('id', branchId).maybeSingle();
      branch = r.data;
    }
    if (!branch) {
      const r = await sb.from('branches').select('id,name').eq('tenant_id', S.tenantId)
        .order('created_at').limit(1).maybeSingle();
      branch = r.data;
    }
    if (!branch) { showFatalError('No hay sucursal configurada'); return; }
    S.branchId = branch.id;

    $('branchLabel').textContent = branch.name;

    // Pie del sidebar = la CUENTA que tiene la sesión abierta (auth), no el
    // primer usuario del tenant. Nombre + rol reales, y el avatar queda listo
    // para mostrar la foto del negocio cuando se suba.
    await pintarUsuarioActual();

    // (se mantiene S.user con el primer pos_users para lógica interna existente)
    try {
      const { data: user } = await sb.from('pos_users').select('id,full_name,role').eq('tenant_id', S.tenantId).limit(1).maybeSingle();
      S.user = user || null;
    } catch (e) { S.user = null; }

    await Promise.all([loadChannels(), loadConversations(), loadIaMaster(), loadQuickReplies(), loadEtiquetas(), loadClientes()]);
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
  /* 'preview' es la conversación de práctica del simulador de Paco: nunca es
     un chat de cliente. Se excluye AQUÍ, para todas las vistas — antes la
     vista por etiqueta no filtraba estado y se habría colado. */
  let q = sb.from('chat_conversations').select('*').eq('branch_id', S.branchId)
    .neq('status', 'preview')
    .order('last_message_at', { ascending: false });
  if (S.activeView === 'pending')  q = q.eq('last_sender','contact').gt('unread_count',0);
  if (S.activeView === 'resolved') q = q.eq('status','resolved');
  if (S.activeView === 'archived') q = q.eq('status','archived');
  if (S.activeView === 'human')   q = q.eq('human_takeover', true).eq('status','open');
  if (S.activeView === 'pagos')   q = q.eq('pago_pendiente', true).eq('status','open');
  if (S.activeView && S.activeView.slice(0,6) === 'label:') q = q.filter('labels', 'cs', JSON.stringify([S.activeView.slice(6)]));
  /* 'mine' sigue en la lista por si un .exe viejo guardó esa vista: se
     comporta como la bandeja, que es lo que ya hacía. La pestaña se quitó de
     la barra el 11-ago (era un duplicado literal de "Bandeja"). */
  if (['all','mine','pending'].includes(S.activeView)) { q = q.eq('status','open').eq('human_takeover', false); }
  const { data } = await q;
  S.conversations = data || [];
  /* Los etiquetados se ven en SU pestaña, no en la bandeja. Pero solo cuentan
     las etiquetas que TODAVIA EXISTEN: si una etiqueta se borro o se renombro,
     su id queda pegado en la conversacion y esta desaparecia de la bandeja Y de
     toda pestaña, quedando invisible en el sistema. Le paso al chat de Vilma
     Ortiz (etiqueta `ems1311u0`, ya inexistente) en pleno servicio. */
  if (S.activeView === 'all') {
    var _idsVivos = {};
    (S.etiquetas || []).forEach(function (e) { if (e && e.id) _idsVivos[e.id] = true; });
    S.conversations = S.conversations.filter(function (c) {
      if (!Array.isArray(c.labels) || !c.labels.length) return true;
      // Si NINGUNA de sus etiquetas existe ya, la conversacion vuelve a la bandeja.
      return !c.labels.some(function (id) { return _idsVivos[id]; });
    });
  }
  renderConvList();
  renderBadges();
  updateLabelBadges();
}

// Badge de "mensajes nuevos" por etiqueta (consulta aparte de la vista actual)
async function updateLabelBadges(){
  try{
    if(!(S.etiquetas||[]).length) return;
    var res=await sb.from('chat_conversations').select('labels,unread_count').eq('branch_id',S.branchId).eq('last_sender','contact').gt('unread_count',0);
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
  updateWaWindow();
}

/* ══════════════════════════════════════════════
   REALTIME
══════════════════════════════════════════════ */
function subscribeRealtime() {
  if (S.realtimeSub) sb.removeChannel(S.realtimeSub);
  S.realtimeSub = sb.channel('chat-ia-' + S.branchId)
    .on('postgres_changes', { event:'*', schema:'public', table:'chat_conversations', filter:`branch_id=eq.${S.branchId}` }, handleConvChange)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:S.tenantId?`tenant_id=eq.${S.tenantId}`:undefined }, payload => {
      const msg = payload.new;
      const esActivo = msg.conversation_id === S.activeConvId;   // ¿estás viendo este chat ahora mismo?
      if (msg.direction === 'in') { chatBeep(); setTimeout(updateLabelBadges, 400); }   // sonido + refrescar badge de etiquetas
      // Anti-duplicado: no re-agregar si ya está por id, NI si es un mensaje SALIENTE que
      // aún tiene su copia optimista temporal (tmp_) en pantalla (carrera del realtime vs
      // el envío) — el propio envío reemplazará el temporal por el real. Evita QR/carta doble.
      const yaOptimista = msg.direction === 'out' && S.messages.some(m => String(m.id).indexOf('tmp_') === 0 && (m.media_url||'') === (msg.media_url||'') && (m.body||'') === (msg.body||''));
      if (esActivo && !S.messages.find(m => m.id === msg.id) && !yaOptimista) { S.messages.push(msg); renderThread(); updateWaWindow(); }
      const idx = S.conversations.findIndex(c => c.id === msg.conversation_id);
      /* Si la conversación no está en la lista (p. ej. la de práctica del
         simulador), este evento no le incumbe a la bandeja. */
      if (idx !== -1) {
        S.conversations[idx].last_message    = msg.body || '[Imagen]';
        S.conversations[idx].last_message_at = msg.sent_at;
        S.conversations[idx].last_sender     = msg.direction === 'in' ? 'contact' : 'agent';
        // "Sin leer" SOLO sube con mensajes ENTRANTES de un chat que NO estás viendo.
        // Si el chat está abierto (o el mensaje es tuyo), no genera notificación.
        if (msg.direction === 'in' && !esActivo) {
          S.conversations[idx].unread_count = (Number(S.conversations[idx].unread_count) || 0) + 1;
        } else if (esActivo && (Number(S.conversations[idx].unread_count) || 0) > 0) {
          S.conversations[idx].unread_count = 0;                                                    // lo estás viendo → leído
          sb.from('chat_conversations').update({ unread_count: 0 }).eq('id', msg.conversation_id);  // y también en la BD
        }
        S.conversations.sort((a,b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        // Si el cliente quedó "Entregado" y vuelve a escribir, es un pedido NUEVO:
        // se le quitan las etiquetas de estado para que vuelva limpio a la bandeja.
        if (msg.direction === 'in') limpiarEstadoSiVuelveAEscribir(S.conversations[idx]);
        renderConvList(); renderBadges();
      }
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'chat_messages', filter:S.tenantId?`tenant_id=eq.${S.tenantId}`:undefined }, payload => {
      // Las REACCIONES llegan como UPDATE del mensaje al que reaccionaron (no
      // como mensaje nuevo): se repinta la burbuja para que aparezca el emoji
      // al instante. También cubre cambios de estado de entrega (visto/leído).
      const msg = payload.new; if (!msg) return;
      if (msg.conversation_id !== S.activeConvId) return;
      const i = S.messages.findIndex(m => m.id === msg.id);
      if (i === -1) return;
      const cambioReaccion = (S.messages[i].reaction || '') !== (msg.reaction || '');
      S.messages[i] = { ...S.messages[i], ...msg };
      if (cambioReaccion) renderThread();
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'chat_channels', filter:`branch_id=eq.${S.branchId}` }, () => {
      loadChannels(); // refrescar canales si cambia alguno
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'pos_orders', filter:S.branchId?`branch_id=eq.${S.branchId}`:undefined }, payload => {
      // Sincronía en vivo de la pastilla de estado: si cambian el estado del pedido
      // activo desde Ventas (o el auto-entregado), se refleja al instante en el chat.
      // (Sin filtro por branch — el filtro dejaba caer los eventos.)
      const o = payload.new;
      if (S.estadoOrder && o && o.id === S.estadoOrder.id && o.estado) {
        S.estadoOrder.estado = o.estado;
        renderEstadoPill();
        /* La TARJETA muestra el mismo estado que la pastilla. Antes solo se
           repintaba la pastilla, así que si el estado cambiaba desde Ventas la
           tarjeta se quedaba vieja: la de arriba decía "En camino" y la de
           abajo "En preparación". Al repintarla también se refrescan el total y
           los productos, y si quedó entregada desaparece sola. */
        if (S.activeConvId) loadDraftBar(S.activeConvId);
      }
    })
    .subscribe();
}

/* El sonido de mensaje nuevo. Lo toca pos-notify.js, que es donde viven el tono
   y el volumen que el dueño escogió en Configuración → Operación.
   Antes aquí había un pitido propio, fijo: subir el volumen no cambiaba nada
   mientras se estaba en esta pantalla. El respaldo de abajo solo entra si por
   lo que sea pos-notify.js no cargó, para no quedarse sin aviso. */
function chatBeep(){
  if (typeof window.posNotifSonar === 'function') { window.posNotifSonar(); return; }
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

/* La conversación de PRÁCTICA del simulador (status 'preview') no es un chat
   de un cliente: no va nunca en la bandeja. La consulta ya la excluía, pero el
   tiempo real la metía igual — por eso aparecía al escribirle a Paco desde la
   vista previa. */
function esPractica(c) { return !!c && c.status === 'preview'; }

function handleConvChange(payload) {
  if (esPractica(payload.new) || esPractica(payload.old)) return;
  if (payload.eventType === 'INSERT') S.conversations.unshift(payload.new);
  else if (payload.eventType === 'UPDATE') {
    const idx = S.conversations.findIndex(c => c.id === payload.new.id);
    if (idx !== -1) {
      const merged = { ...S.conversations[idx], ...payload.new };
      // El chat que estás viendo nunca muestra "sin leer" (evita que un evento viejo lo resucite).
      if (payload.new.id === S.activeConvId) merged.unread_count = 0;
      S.conversations[idx] = merged;
    }
    else S.conversations.unshift(payload.new);
    // Si cambia ai_typing en la conversación activa, re-render el thread
    if (payload.new.id === S.activeConvId && payload.new.ai_typing !== undefined) renderThread();
    /* La BARRA del domicilio llega en TIEMPO REAL (error 3 de Sergio, 15-ago:
       tocaba recargar para verla). El evento trae la bandera; se repinta al
       instante con el estado recién llegado. */
    if (payload.new.id === S.activeConvId && payload.new.domi_precio_pendiente !== undefined) {
      updateDomiConfirmBtn(!!payload.new.domi_precio_pendiente);
    }
  } else if (payload.eventType === 'DELETE') {
    S.conversations = S.conversations.filter(c => c.id !== payload.old.id);
  }
  renderConvList(); renderBadges();
}

/* ══════════════════════════════════════════════
   RENDERS
══════════════════════════════════════════════ */

/* Sidebar: siempre los 4 canales, gris si no conectado */
// Un chat solo cuenta como "sin leer" si tiene mensajes pendientes Y el último
// mensaje lo mandó el cliente. Si el último lo mandaste tú (agente/bot), ya está
// leído aunque haya quedado un unread_count viejo en la BD. Evita números fantasma.
function isRealUnread(c) {
  return (Number(c.unread_count) || 0) > 0 && c.last_sender === 'contact';
}
function renderChannelsSidebar() {
  const connectedMap = {};
  S.channels.forEach(c => { if (c.connected) connectedMap[c.channel] = c; });

  const counts = {};
  S.conversations.forEach(c => {
    counts[c.channel] = (counts[c.channel] || 0) + (isRealUnread(c) ? c.unread_count : 0);
  });

  $('channelsList').innerHTML = ALL_CHANNELS.map(ch => {
    const meta        = CHANNELS[ch];
    const connected   = !!connectedMap[ch];
    const count       = counts[ch] || 0;

    const pic = connected && connectedMap[ch].meta?.profile_picture_url;
    const isSoon = SOON_CHANNELS.indexOf(ch) >= 0;
    const right = connected
      ? (pic
          /* Si la foto no carga se muestra el numero, no un icono roto. Las
             fotos de perfil de WhatsApp llevan firma y VENCEN a los pocos dias;
             la de este canal se quedo rota una semana. Ahora la imagen se guarda
             en nuestro propio almacenamiento, pero el respaldo se queda por si
             algun dia falla otra vez. */
          ? `<img src="${pic}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="" onerror="this.outerHTML='<span class='n'>${count || ''}</span>'">`
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
    /* Se busca TAMBIÉN por el nombre con el que está guardado el cliente y su
       barrio. La lista muestra ese nombre (no el del perfil de WhatsApp), así
       que buscar solo por `contact_name` hacía que un chat visible como
       "Vilma Ortiz" desapareciera al escribir "Vilma", porque en WhatsApp se
       llama "Sammy". Se buscaba por un nombre que en pantalla no existe. */
    list = list.filter(c => {
      const cli = clienteDe(c) || {};
      return (c.contact_name||'').toLowerCase().includes(q) ||
             (c.contact_handle||'').toLowerCase().includes(q) ||
             (c.last_message||'').toLowerCase().includes(q) ||
             (cli.nombre||'').toLowerCase().includes(q) ||
             (cli.barrio||'').toLowerCase().includes(q);
    });
  }
  if (!list.length) {
    $('convList').innerHTML = `<div class="ci-list-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>${S.query ? 'Sin resultados para "'+escHtml(S.query)+'"' : 'Sin conversaciones'}</p></div>`;
    return;
  }
  S._listaVisible = list.map(c => c.id);
  $('convList').innerHTML = list.map(convRowHTML).join('');
  $('convList').querySelectorAll('.ci-conv').forEach(el => {
    /* En modo selección el clic marca/desmarca en vez de abrir el chat. */
    el.addEventListener('click', () => {
      if (S.selMode) toggleSelConv(el.dataset.id);
      else openConversation(el.dataset.id);
    });
  });
  renderSelBar();
  if (S.activeConvId) {
    const el = $('convList').querySelector(`[data-id="${S.activeConvId}"]`);
    if (el) el.classList.add('active');
  }
}

/* CLIENTES GUARDADOS — el teléfono es la llave.
   Si quien escribe ya es cliente, en el chat se muestra el NOMBRE CON EL QUE
   quedó guardado (no el del perfil de WhatsApp, que suele ser un apodo) y una
   etiqueta discreta con su barrio, para saber de dónde nos escriben. */
S.clientesPorTel = S.clientesPorTel || {};
async function loadClientes() {
  try {
    /* Se trae TAMBIEN el id y las redes: en Instagram y Messenger no hay
       telefono con que buscar, y la ficha se encuentra por `cliente_id`. */
    const { data } = await sb.from('pos_clientes')
      .select('id,nombre,telefono,barrio,instagram_usuario,facebook_nombre')
      .eq('tenant_id', S.tenantId).limit(5000);
    const mapa = {};
    const porId = {};
    (data || []).forEach(function (c) {
      const ficha = { nombre: c.nombre, barrio: c.barrio, telefono: c.telefono,
                      instagram: c.instagram_usuario, facebook: c.facebook_nombre };
      const t = String(c.telefono || '').replace(/\D/g, '').slice(-10);
      if (t.length === 10) mapa[t] = ficha;
      if (c.id) porId[c.id] = ficha;
    });
    S.clientesPorTel = mapa;
    S.clientesPorId  = porId;
  } catch (e) { console.warn('loadClientes:', e && e.message); }
}
function clienteDe(conv) {
  if (!conv) return null;
  /* SI LA CONVERSACION YA SABE DE QUE CLIENTE ES, esa es la respuesta. En
     Instagram y Messenger el `contact_handle` es un id de Meta y buscar por
     telefono no encuentra nada — quedaban como "sin guardar" estando
     guardados. */
  if (conv.cliente_id && S.clientesPorId && S.clientesPorId[conv.cliente_id]) {
    return S.clientesPorId[conv.cliente_id];
  }
  const t = String(conv.contact_handle || '').replace(/\D/g, '').slice(-10);
  const hit = (t && S.clientesPorTel[t]) || null;
  /* CLIENTE CREADO DESPUES DE ABRIR LA PANTALLA (15-ago): el mapa se carga al
     entrar, y los clientes que Paco crea con sus pedidos no aparecian hasta
     recargar — Sergio los veia "no guardados" estando guardados. Si el
     telefono no esta en el mapa, se consulta UNA vez esa ficha y se repinta.
     `_noEs` evita preguntar en bucle por numeros que de verdad no son clientes. */
  if (!hit && t.length === 10 && !S._clienteBuscado) S._clienteBuscado = {};
  if (!hit && t.length === 10 && !S._clienteBuscado[t]) {
    S._clienteBuscado[t] = true;
    sb.from('pos_clientes').select('nombre,telefono,barrio')
      .eq('tenant_id', S.tenantId).like('telefono', '%' + t).limit(1)
      .then(function (r) {
        const c = r && r.data && r.data[0];
        if (!c) return;
        S.clientesPorTel[t] = { nombre: c.nombre, barrio: c.barrio };
        try { renderConvList(); } catch (_e) {}
        try { const _a = getActiveConv(); if (_a) renderChatHeader(_a); } catch (_e) {}
      });
  }
  return hit;
}

/* ══════════════ FICHA DEL CLIENTE (drawer derecho) ══════════════
   Se abre desde "Información del contacto" del menú ⋮. Reúne en un solo lugar
   lo que hoy está regado: quién es, dónde vive, cuánto ha pedido, cómo paga y
   qué suele pedir — para atenderlo sin volver a preguntarle lo de siempre. */
function ciMoneda(n){ return '$' + Math.round(Number(n)||0).toLocaleString('es-CO'); }
function ciHace(fecha){
  if(!fecha) return '';
  // Se comparan DIAS DE CALENDARIO, no horas transcurridas: un pedido de ayer
  // a las 7pm son menos de 24h y decia "hoy" aunque fuera de otro dia.
  const f = new Date(fecha), h = new Date();
  const dia = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  const hoy = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  const d = Math.round((hoy - dia) / 86400000);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 30) return 'hace ' + d + ' días';
  const m = Math.floor(d/30);
  return 'hace ' + m + (m === 1 ? ' mes' : ' meses');
}
async function abrirFichaCliente(){
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if(!conv){ showToast('Abre un chat primero','info'); return; }
  const menu = document.getElementById('moreMenu'); if(menu) menu.style.display='none';
  const ov = document.getElementById('fichaOv');
  document.getElementById('fichaBody').innerHTML = '<div class="ci-dw-load">Cargando…</div>';
  ov.classList.add('on');
  try { await pintarFichaCliente(conv); }
  catch(e){ document.getElementById('fichaBody').innerHTML = '<div class="ci-dw-load">No se pudo cargar: '+escHtml(e.message||e)+'</div>'; }
}
function cerrarFichaCliente(){ const o=document.getElementById('fichaOv'); if(o) o.classList.remove('on'); }

// Los barrios que ya se han usado, para no volver a escribirlos a mano al
// corregir una direccion. Se cargan una sola vez por sesion.
let _ciBarrios = null;
async function ciCargarBarrios(){
  const dl = document.getElementById('ciBarriosList');
  if (!dl) return;
  if (!_ciBarrios) {
    _ciBarrios = [];
    try {
      const r = await sb.from('pos_clientes').select('barrio')
        .eq('tenant_id', S.tenantId).not('barrio','is',null).limit(5000);
      const set = {};
      (r.data||[]).forEach(function(x){ const b = ciTitulo(x.barrio); if (b) set[b] = 1; });
      _ciBarrios = Object.keys(set).sort();
    } catch(e){}
  }
  dl.innerHTML = _ciBarrios.map(function(b){ return '<option value="'+escHtml(b)+'">'; }).join('');
}

async function pintarFichaCliente(conv){
  /* Los pagos guardan el ID del metodo: para MOSTRAR hay que traducir. */
  try { if (window.posMetodos) await posMetodos.cargar(sb, S.branchId); } catch(e) {}
  ciCargarBarrios();
  const tel10 = String(conv.contact_handle||'').replace(/\D/g,'').slice(-10);
  // 1) Ficha guardada (el teléfono es la llave)
  let cli = null;
  try {
    const r = await sb.from('pos_clientes').select('*').eq('tenant_id', S.tenantId).ilike('telefono','%'+tel10).maybeSingle();
    cli = r.data || null;
    // Si no hay ficha con ese numero, puede que sea su SEGUNDO telefono (le
    // paso a Vilma: escribio desde otro celular y aparecia como desconocida).
    // Se busca tambien por ahi, pero la ficha que manda sigue siendo la misma.
    if (!cli) {
      const r2 = await sb.from('pos_clientes').select('*').eq('tenant_id', S.tenantId).ilike('telefono2','%'+tel10).limit(1);
      cli = (r2.data && r2.data[0]) || null;
    }
  } catch(e){}
  // 2) Sus pedidos
  let pedidos = [];
  if (cli) {
    try {
      const r = await sb.from('pos_orders')
        .select('id,total_final,total,created_at,payment_method,status,channel,notes')
        .eq('cliente_id', cli.id).order('created_at',{ascending:false}).limit(40);
      pedidos = r.data || [];
    } catch(e){}
  }
  // 3) Puntos de lealtad (van por teléfono, igual que la ficha)
  let puntos = 0;
  try {
    // Los puntos viven en el telefono PRINCIPAL del cliente. Si escribio desde
    // el segundo, hay que mirar el principal o saldrian en cero.
    const telPuntos = cli ? String(cli.telefono||'').replace(/[^0-9]/g,'').slice(-10) : tel10;
    const r = await sb.from('pos_puntos').select('puntos').ilike('telefono','%'+telPuntos).maybeSingle();
    puntos = Number(r.data && r.data.puntos)||0;
    /* La base responde bien (verificado por fuera). Si aqui llega vacio o con
       error, que quede ESCRITO: es la unica forma de dejar de adivinar. */
    if (r.error || (!r.data && telPuntos && telPuntos.length === 10)) {
      try { await sb.from('pos_diag').insert({ donde:'chat/puntos',
        mensaje: r.error ? String(r.error.message||r.error.code) : 'sin fila para el telefono',
        extra: { tel: telPuntos, con_ficha: !!cli } }); } catch(e2) {}
    }
  } catch(e){
    try { await sb.from('pos_diag').insert({ donde:'chat/puntos', mensaje:String(e && e.message || e), extra:{} }); } catch(e2) {}
  }
  // 4) Qué es lo que más pide
  let favorito = null;
  if (pedidos.length) {
    try {
      const ids = pedidos.map(function(p){ return p.id; });
      const r = await sb.from('pos_order_items').select('name,quantity').in('order_id', ids);
      const cuenta = {};
      (r.data||[]).forEach(function(i){ const n=(i.name||'').trim(); if(n) cuenta[n]=(cuenta[n]||0)+(Number(i.quantity)||1); });
      const top = Object.entries(cuenta).sort(function(a,b){ return b[1]-a[1]; })[0];
      if (top) favorito = { nombre: top[0], veces: top[1] };
    } catch(e){}
  }
  // 5) Nivel del cliente. El cálculo vive en la BASE (fn_nivel_cliente) para
  //    que la futura pantalla del cliente lea exactamente el mismo número.
  let niv = null;
  try {
    const telNivel = cli ? String(cli.telefono||'').replace(/[^0-9]/g,'').slice(-10) : tel10;
    const r = await sb.rpc('fn_nivel_cliente', { p_tenant: S.tenantId, p_tel: telNivel });
    if (r.data && r.data.length) niv = r.data[0];
  } catch(e){}

  // 6) ¿Está en lista negra? (debe saltar antes de despachar)
  let negra = null;
  try {
    const r = await sb.rpc('lista_negra_match', { p_tenant:S.tenantId, p_tel:tel10, p_dir_norm:null });
    if (r.data && r.data.length) negra = r.data[0];
  } catch(e){}

  const nPed    = pedidos.length;
  const gastado = pedidos.reduce(function(a,p){ return a+(Number(p.total_final)||Number(p.total)||0); },0);
  const prom    = nPed ? gastado/nPed : 0;
  const ultimo  = nPed ? pedidos[0].created_at : null;
  const sinPagar= pedidos.filter(function(p){ return p.status!=='paid' && p.status!=='completed' && p.status!=='cancelled'; }).length;
  const pagos = {};
  pedidos.forEach(function(p){
    let m=(p.payment_method||'').toLowerCase(); if(!m || m==='multiple') return;
    /* Se agrupa por el NOMBRE configurado: 'transferencia', 'Transferencia' y
       el id pm_... del mismo metodo cuentan como uno solo. */
    try { if (window.posMetodos) { const r=posMetodos.resolver(m); if (r) m=r.nombre; } } catch(e) {}
    if (/^pm_[a-z0-9]+$/i.test(m) || /^__/.test(m)) m='Otro';
    pagos[m]=(pagos[m]||0)+1;
  });
  const pagoTop = Object.entries(pagos).sort(function(a,b){ return b[1]-a[1]; })[0];

  // Cada direccion lleva SU barrio: {dir, barrio}. Las viejas eran texto
  // suelto, asi que se aceptan los dos formatos.
  const dirs = (cli
      ? ((Array.isArray(cli.direcciones)&&cli.direcciones.length) ? cli.direcciones : (cli.direccion?[cli.direccion]:[]))
      : []
    ).map(function(d){
      if (d && typeof d === 'object') return { id: d.id||'', dir: d.dir||'', barrio: d.barrio||'' };
      return { id: '', dir: String(d||''), barrio: '' };
    }).filter(function(d){ return d.dir.trim(); });
  // El barrio que se muestra junto al nombre es de DONDE MAS HA PEDIDO, no el
  // ultimo: si pide casi siempre a la casa y una vez a la oficina, la etiqueta
  // debe seguir diciendo el barrio de la casa.
  const barrioTop = ciBarrioMasPedido(pedidos) || (cli && cli.barrio) || '';
  const nombre = (cli && cli.nombre) || conv.contact_name || conv.contact_handle || 'Sin nombre';

  let h = '';
  if (negra) h += '<div class="ci-dw-alert danger">Cliente en <b>lista negra</b>'+(negra.razon?'<span>'+escHtml(negra.razon)+'</span>':'')+'</div>';
  if (sinPagar) h += '<div class="ci-dw-alert warn">Tiene <b>'+sinPagar+' pedido'+(sinPagar>1?'s':'')+' sin pagar</b></div>';

  /* El nombre se puede EDITAR aquí mismo. Antes solo se cambiaba desde
     Domicilios o Clientes: si en el chat aparecía el apodo de WhatsApp, había
     que salirse de la conversación para corregirlo. Al guardar se actualiza la
     ficha del cliente (si existe) Y el nombre de la conversación, y la lista de
     la izquierda se repinta sola: es el mismo nombre en las dos pantallas. */
  h += '<div class="ci-dw-id">'
    +  '<div class="ci-dw-av">'+escHtml(avatarInitials(nombre))+'</div>'
    +  '<div class="ci-dw-idtx"><div class="ci-dw-nm" style="display:flex;align-items:center;gap:6px">'
    +      '<span id="ciNmTxt">'+escHtml(nombre)+'</span>'
    +      '<button title="Editar nombre" onclick="ciEditarNombre('+(cli?("'"+cli.id+"'"):'null')+')" style="border:none;background:none;cursor:pointer;padding:2px;line-height:0;color:#94A3B8">'
    +        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
    +      '</button></div>'
    +    '<div class="ci-dw-sub">'+escHtml(conv.contact_handle||'')
    +      (barrioTop ? ' · '+escHtml(barrioTop) : '')+'</div></div>'
    + '</div>';

  // Si escribe desde su segundo numero conviene decirlo: si no, parece que la
  // ficha no corresponde con el numero que se ve arriba.
  if (cli) {
    const principal10 = String(cli.telefono||'').replace(/[^0-9]/g,'').slice(-10);
    if (principal10 && principal10 !== tel10) {
      h += '<div class="ci-dw-alert warn">Escribe desde su <b>segundo número</b>. '
        +  'Su número principal es ' + escHtml(cli.telefono || '') + ', y ahí van sus puntos.</div>';
    }
  }

  if (!cli) {
    h += '<div class="ci-dw-empty">Todavía no es un cliente guardado.<br>Se crea solo cuando le tomes su primer pedido.</div>';
  } else {
    h += '<div class="ci-dw-stats">'
      + '<div class="ci-dw-st"><b>'+nPed+'</b><span>pedido'+(nPed===1?'':'s')+'</span></div>'
      + '<div class="ci-dw-st"><b>'+ciMoneda(gastado)+'</b><span>gastado</span></div>'
      + '<div class="ci-dw-st"><b>'+ciMoneda(prom)+'</b><span>promedio</span></div>'
      + '</div>';
    // Nivel + barra de avance hacia el siguiente
    if (niv && niv.nivel) {
      // La barra muestra EXPERIENCIA, nunca el dinero: el cliente ve XP subir,
      // no cuánto lleva gastado (eso solo lo ve el negocio, arriba).
      const uni = niv.criterio === 'pedidos' ? ' pedidos' : ' XP';
      const val = Math.round(Number(niv.valor)||0).toLocaleString('es-CO');
      const fal = Math.round(Number(niv.falta)||0).toLocaleString('es-CO');
      h += '<div class="ci-dw-niv">'
        + '<div class="ci-dw-nivtop">'
        +   '<span class="ci-dw-nivnm" style="color:'+escHtml(niv.color||'#7C5CFF')+'">'+escHtml(niv.nivel)+'</span>'
        +   '<span class="ci-dw-nivxp">'+val+uni+'</span>'
        + '</div>'
        + '<div class="ci-dw-nivbar"><i style="width:'+(niv.progreso||0)+'%;background:'+escHtml(niv.color||'#7C5CFF')+'"></i></div>'
        + '<div class="ci-dw-nivpc">'
        +   (niv.siguiente ? 'Faltan '+fal+uni+' para <b>'+escHtml(niv.siguiente)+'</b>' : 'Nivel máximo alcanzado')
        + '</div>'
        // El nivel CADUCA si deja de pedir. Se avisa siempre, y se resalta
        // cuando ya está cerca, para poder recuperarlo con una promo a tiempo.
        + (function(){
            const dd = niv.dias_para_caducar;
            if (dd === null || dd === undefined) return '';
            const meses = niv.caduca_meses || 6;
            if (dd <= 0) return '<div class="ci-dw-nivcad urge">Su nivel caducó por '+meses+' meses sin pedir</div>';
            if (dd <= 45) return '<div class="ci-dw-nivcad urge">Pierde su nivel en '+dd+' día'+(dd===1?'':'s')+' si no vuelve a pedir</div>';
            const m = Math.round(dd/30);
            return '<div class="ci-dw-nivcad">Conserva su nivel '+(m<=1?'menos de un mes':m+' meses')+' más</div>';
          })()
        + '</div>';
    }
    h += '<div class="ci-dw-rows">';
    if (ultimo)  h += '<div class="ci-dw-row"><span>Último pedido</span><b>'+ciHace(ultimo)+'</b></div>';
    if (puntos)  h += '<div class="ci-dw-row"><span>Puntos</span><b>'+puntos+'</b></div>';
    if (pagoTop) h += '<div class="ci-dw-row"><span>Suele pagar</span><b>'+escHtml(pagoTop[0].charAt(0).toUpperCase()+pagoTop[0].slice(1))+'</b></div>';
    if (favorito)h += '<div class="ci-dw-row"><span>Su plato</span><b>'+escHtml(favorito.nombre)+'</b></div>';
    // Desde su PRIMER PEDIDO, no desde que se creo la ficha (los clientes
    // reconstruidos se crearon todos anoche y decian "cliente desde hoy").
    const desde = nPed ? pedidos[pedidos.length-1].created_at : cli.created_at;
    if (desde) h += '<div class="ci-dw-row"><span>Cliente desde</span><b>'+new Date(desde).toLocaleDateString('es-CO',{day:'numeric',month:'short'})+'</b></div>';
    h += '</div>';

    h += '<div class="ci-dw-sec">Direcciones</div><div class="ci-dw-dirs" id="fichaDirs">'
      + dirs.map(function(d,i){
          return ciDirRowHTML(cli.id, d.dir, d.barrio, i, i===dirs.length-1, d.id);
        }).join('')
      + '</div>'
      + '<button class="ci-dw-addir" onclick="agregarDirCliente(&quot;'+cli.id+'&quot;)">+ Agregar dirección</button>';
    h += '<div class="ci-dw-sec">Notas</div>'
      + '<textarea class="ci-dw-notas" id="fichaNotas" rows="3" placeholder="Ej. no timbrar, casa del portón verde, alérgico a la cebolla…" '
      + 'onblur="guardarNotasCliente(&quot;'+cli.id+'&quot;,this.value)">'+escHtml(cli.notas||'')+'</textarea>';

    if (nPed) {
      h += '<div class="ci-dw-sec">Historial</div><div class="ci-dw-hist">'
        + pedidos.slice(0,12).map(function(p){
            const f = new Date(p.created_at).toLocaleDateString('es-CO',{day:'numeric',month:'short'});
            const pagado = p.status==='paid'||p.status==='completed';
            return '<div class="ci-dw-h"><span class="f">'+f+'</span>'
              + '<span class="c">'+escHtml(p.channel||'')+'</span>'
              + '<span class="v">'+ciMoneda(p.total_final||p.total)+'</span>'
              + '<span class="e '+(pagado?'ok':'')+'">'+(pagado?'pagado':'pendiente')+'</span></div>';
          }).join('')
        + '</div>';
    }
  }
  h += '<div class="ci-dw-acts">'
    + '<button class="ci-dw-btn primary" onclick="cerrarFichaCliente();document.getElementById(&quot;createOrderBtn&quot;).click()">Crear pedido</button>'
    + (cli ? '<button class="ci-dw-btn" onclick="noEnviarleCliente(&quot;'+tel10+'&quot;)">No enviarle</button>' : '')
    + '</div>';
  document.getElementById('fichaBody').innerHTML = h;
}
// El barrio de donde MAS ha pedido. Sale de la etiqueta [barrio:X] que cada
// pedido guarda en sus notas, que es el dato que de verdad se cobro.
function ciBarrioMasPedido(pedidos){
  const cuenta = {};
  (pedidos||[]).forEach(function(p){
    const m = /\[barrio:([^\]]+)\]/i.exec(p.notes||'');
    if (!m) return;
    const b = ciTitulo(m[1]);
    if (b) cuenta[b] = (cuenta[b]||0) + 1;
  });
  const top = Object.entries(cuenta).sort(function(a,b){ return b[1]-a[1]; })[0];
  return top ? top[0] : '';
}
// Los barrios vienen en MAYUSCULA desde la comanda; se muestran normales.
function ciTitulo(s){
  return String(s||'').trim().toLowerCase().replace(/(^|\s)\S/g, function(t){ return t.toUpperCase(); });
}
// Una direccion sin su barrio no sirve para cobrar el domicilio, asi que las
// dos cosas se editan juntas en la misma tarjeta.
function ciDirRowHTML(cliId, dir, barrio, i, esPrincipal, dId){
  const g = 'guardarDirsCliente(&quot;'+cliId+'&quot;)';
  return '<div class="ci-dw-dir" data-did="'+escHtml(dId||'')+'">'
    + '<div class="ci-dw-dirtop">'
    +   '<input class="ci-dw-dirin" value="'+escHtml(dir||'')+'" data-i="'+i+'" '
    +     'onblur="'+g+'" placeholder="Dirección">'
    +   (esPrincipal ? '<span class="ci-dw-tag">principal</span>' : '')
    +   '<button class="ci-dw-dirx" title="Quitar" onclick="quitarDirCliente(&quot;'+cliId+'&quot;,'+i+')">✕</button>'
    + '</div>'
    + '<div class="ci-dw-dirbar">'
    +   '<span class="ci-dw-pin">◍</span>'
    +   '<input class="ci-dw-dirb" value="'+escHtml(barrio||'')+'" list="ciBarriosList" '
    +     'onblur="'+g+'" placeholder="Barrio">'
    + '</div>'
  + '</div>';
}
// Las direcciones se editan en la misma ficha. La ULTIMA de la lista es la
// principal (la que se usa por defecto al crear un pedido).
function _leerDirs(){
  const out = [];
  document.querySelectorAll('#fichaDirs .ci-dw-dir').forEach(function(row){
    const a = row.querySelector('.ci-dw-dirin');
    const b = row.querySelector('.ci-dw-dirb');
    const v = ((a&&a.value)||'').trim();
    if (!v) return;
    const id = row.getAttribute('data-did') || ('d'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36));
    row.setAttribute('data-did', id);
    out.push({ id: id, dir: v, barrio: ciTitulo((b&&b.value)||'') });
  });
  return out;
}
/* Editar el nombre del contacto desde el chat.
   Se escribe en los DOS sitios a propósito:
   - `pos_clientes.nombre` → es lo que ven Clientes y Domicilios
   - `chat_conversations.contact_name` → es el respaldo cuando todavía no hay
     ficha de cliente (aún no ha hecho su primer pedido)
   Así el cambio se ve igual se mire desde donde se mire. */
async function ciEditarNombre(cliId){
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if(!conv){ showToast('Abre un chat primero','info'); return; }
  const el = document.getElementById('ciNmTxt');
  const actual = el ? el.textContent : (conv.contact_name || '');
  const nuevo = prompt('Nombre del contacto:', actual);
  if(nuevo === null) return;                       // canceló
  const nom = String(nuevo).trim();
  if(!nom){ showToast('El nombre no puede quedar vacío','error'); return; }
  if(nom === actual) return;

  let algo = false;
  if(cliId){
    const r = await sb.from('pos_clientes')
      .update({ nombre: nom, updated_at: new Date().toISOString() })
      .eq('id', cliId).select('id');
    /* 0 filas sin error = no se guardó nada. No decir "listo" en ese caso. */
    if(r.error || !r.data || !r.data.length){
      showToast('No se pudo guardar en el cliente: ' + ((r.error && r.error.message) || 'sin permisos'), 'error');
    } else {
      algo = true;
      /* El mapa por teléfono es lo que lee la lista de la izquierda. */
      const t10 = String(conv.contact_handle||'').replace(/\D/g,'').slice(-10);
      if(t10.length === 10 && S.clientesPorTel[t10]) S.clientesPorTel[t10].nombre = nom;
      else if(t10.length === 10) S.clientesPorTel[t10] = { nombre: nom, barrio: '' };
    }
  }
  const rc = await sb.from('chat_conversations')
    .update({ contact_name: nom }).eq('id', conv.id).select('id');
  if(!(rc.error) && rc.data && rc.data.length){ conv.contact_name = nom; algo = true; }

  if(!algo){ showToast('No se pudo guardar el nombre','error'); return; }
  if(el) el.textContent = nom;
  renderConvList();
  renderChatHeader(conv);
  showToast('Nombre actualizado','success');
}

async function guardarDirsCliente(id){
  const dirs = _leerDirs();
  try {
    await sb.from('pos_clientes').update({
      direcciones: dirs,
      // 'direccion' se queda como TEXTO plano: lo leen otras pantallas (crear
      // pedido, domicilios) que no entienden el formato con barrio.
      direccion: dirs.length ? dirs[dirs.length-1].dir : null,
      barrio: dirs.length && dirs[dirs.length-1].barrio ? dirs[dirs.length-1].barrio : undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    showToast('Direcciones guardadas','success');
  } catch(e){ showToast('No se pudieron guardar','error'); }
}
async function quitarDirCliente(id, idx){
  const dirs = _leerDirs().filter(function(_,i){ return i!==idx; });
  try {
    await sb.from('pos_clientes').update({
      direcciones: dirs,
      direccion: dirs.length ? dirs[dirs.length-1].dir : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    const conv = S.conversations.find(function(c){ return c.id===S.activeConvId; });
    if (conv) await pintarFichaCliente(conv);
    showToast('Dirección quitada','success');
  } catch(e){ showToast('No se pudo quitar','error'); }
}
function agregarDirCliente(id){
  const cont = document.getElementById('fichaDirs'); if(!cont) return;
  const n = cont.querySelectorAll('.ci-dw-dirin').length;
  const div = document.createElement('div');
  div.innerHTML = ciDirRowHTML(id, '', '', n, false);
  const row = div.firstElementChild;
  // Todavia no esta guardada, asi que la ✕ solo quita la fila de pantalla.
  row.querySelector('.ci-dw-dirx').setAttribute('onclick', 'this.closest(".ci-dw-dir").remove()');
  cont.appendChild(row);
  row.querySelector('.ci-dw-dirin').focus();
}

async function guardarNotasCliente(id, txt){
  try {
    await sb.from('pos_clientes').update({ notas: txt, updated_at: new Date().toISOString() }).eq('id', id);
    showToast('Nota guardada','success');
  } catch(e){ showToast('No se pudo guardar la nota','error'); }
}
async function noEnviarleCliente(tel10){
  try {
    const r = await sb.from('pos_wa_contactos').select('id').eq('branch_id', S.branchId).ilike('telefono','%'+tel10).maybeSingle();
    if (r.data && r.data.id) {
      await sb.from('pos_wa_contactos').update({ no_atender: true }).eq('id', r.data.id);
      showToast('Marcado: no recibirá envíos','success');
    } else showToast('Ese número no está en la lista de contactos','info');
  } catch(e){ showToast('No se pudo marcar','error'); }
}

function convRowHTML(c) {
  const meta     = CHANNELS[c.channel] || {};
  const tint     = TINTS[(c.contact_avatar_tint||0) % TINTS.length];
  const cli      = clienteDe(c);
  const label    = (cli && cli.nombre) || c.contact_name || c.contact_handle || '?';
  const initials = avatarInitials(label);
  /* Misma regla en la lista: el chat de WhatsApp de alguien que ya escribio
     por Instagram lleva su cara, no unas iniciales. */
  const avatarUrl = fotoDe(c);
  const isUnread = isRealUnread(c);
  const isActive = c.id === S.activeConvId;
  const time     = formatTime(c.last_message_at);

  const rightBadge = isUnread
    ? `<span class="ci-unread">${c.unread_count}</span>`
    : `<span class="ci-chan-tag"><span class="dot" style="background:${meta.dotColor||'#ccc'}"></span>${meta.label||''}</span>`;

  /* ETIQUETAS A LA VISTA.
     Antes había que abrir la conversación para saber si estaba "En preparación"
     o "Pago": la etiqueta es justo lo que dice qué hacer con el pedido, así que
     no verla obliga a entrar a cada chat. Se pintan como pastillas del color de
     la etiqueta, hasta 2, y "+N" si tiene más. La línea solo aparece si hay
     etiquetas, para no crecer las filas de los chats sin ninguna. */
  const etqs = (Array.isArray(c.labels) ? c.labels : [])
    .map(id => (S.etiquetas || []).find(e => e && e.id === id))
    .filter(Boolean);
  const etqPill = (bg, fg, dot, txt) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;line-height:1.5;background:${bg};color:${fg}">`
    + (dot ? `<span style="width:5px;height:5px;border-radius:50%;background:${dot};flex-shrink:0"></span>` : '')
    + escHtml(txt) + '</span>';
  const etqHTML = etqs.length
    ? '<span style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">'
      + etqs.slice(0, 2).map(e => etqPill(e.color + '1A', e.color, e.color, e.name)).join('')
      + (etqs.length > 2 ? etqPill('#F1F5F9', '#64748B', '', '+' + (etqs.length - 2)) : '')
      + '</span>'
    : '';

  /* EL MOTIVO, A LA VISTA.
     En la pestaña de Pagos lo único que hace falta saber de un vistazo es POR
     QUÉ no se pudo confirmar. Sin eso hay que abrir cada chat, mirar el
     comprobante y adivinar qué falló. */
  const motivoHTML = (S.activeView === 'pagos' && c.handoff_motivo)
    ? '<span style="display:flex;margin-top:3px;min-width:0">'
      + '<span title="' + escHtml(c.handoff_motivo) + '" style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;line-height:1.5;background:#FEF3C7;color:#B45309;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⚠️ '
      + escHtml(c.handoff_motivo) + '</span></span>'
    : '';

  let prevPrefix = '';
  if (!isUnread && c.last_sender === 'agent') {
    const checkColor = c.last_read ? '#5B6BFF' : '#94A3B8';
    prevPrefix = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${checkColor}" stroke-width="2.4" style="flex-shrink:0"><polyline points="18 7 9 17 5 13"/><polyline points="22 7 13 17 12.5 16.5"/></svg><span style="color:#94A3B8;font-weight:500">Tú:&nbsp;</span>`;
  }

  /* Casilla del modo selección. Va delante del avatar y no reemplaza nada:
     al salir del modo, la fila vuelve a ser exactamente la de siempre. */
  const selecc = S.selMode && (S.selIds || []).indexOf(c.id) >= 0;
  const selBox = S.selMode
    ? `<span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex-shrink:0;margin-right:8px;border-radius:5px;border:2px solid ${selecc ? '#5B6BFF' : '#CBD5E1'};background:${selecc ? '#5B6BFF' : 'transparent'};color:#fff;font-size:11px;font-weight:900;line-height:1">${selecc ? '✓' : ''}</span>`
    : '';

  return `
    <button class="ci-conv${isActive?' active':''}${isUnread?' unread':''}${selecc?' sel':''}" data-id="${c.id}"${selecc?' style="background:#EEF2FF"':''}>
      ${selBox}
      <span class="ci-av-wrap">
        ${avatarUrl
          ? `<img src="${escHtml(avatarUrl)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;" alt="">`
          : `<span class="ci-av" style="background:${tint[0]};color:${tint[1]}">${initials}</span>`}
        <span class="ci-av-badge chan-${meta.key}">${GLYPH[meta.key]||''}</span>
      </span>
      <span class="ci-conv-main">
        <span class="ci-conv-top">
          <span class="ci-conv-name">${escHtml(label)}</span>
          ${cli && cli.barrio ? `<span class="ci-barrio">${escHtml(cli.barrio)}</span>` : ''}
          <span class="ci-conv-time">${time}</span>
        </span>
        <span class="ci-conv-bot">
          <span class="ci-conv-prev">${prevPrefix}${prettyPreview(c.last_message)}</span>
          ${rightBadge}
        </span>
        ${etqHTML}
        ${motivoHTML}
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
  pintarMapasDelHilo();
}

/* EL MAPA DE VERDAD EN LAS BURBUJAS DE UBICACION.
   Se pide UNA sola imagen por coordenada aunque la ubicacion aparezca en
   varias burbujas: cada mapa es una llamada que el restaurante paga, y la
   del local es siempre la misma. El servidor ademas la deja guardada un dia
   en el navegador, asi que en la practica es una llamada diaria. */
const _MAPAS_PINTADOS = new Set();
function pintarMapasDelHilo() {
  if (!window.posMapa) return;
  const cajas = document.querySelectorAll('#thread .ci-loc-map[data-mapa-lat]');
  cajas.forEach(function (caja) {
    const lat = parseFloat(caja.dataset.mapaLat), lng = parseFloat(caja.dataset.mapaLng);
    if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) return;
    if (caja.dataset.mapaListo === "1") return;
    caja.dataset.mapaListo = "1";
    const clave = lat.toFixed(5) + "," + lng.toFixed(5);
    _MAPAS_PINTADOS.add(clave);
    /* Se pinta en una capa aparte y solo se deja ver SI salio una imagen.
       posMapa escribe avisos de texto dentro del recuadro cuando algo falla
       ("tu sesion se vencio", "no hay llave conectada"), y eso dentro de una
       burbuja de chat se veria como un mensaje que nadie mando. Si no hay
       mapa, se queda el dibujo de respaldo y ya. */
    const capa = document.createElement('div');
    capa.style.cssText = 'position:absolute;inset:0;opacity:0;z-index:3';
    capa.style.width = (caja.clientWidth || 340) + 'px';
    caja.appendChild(capa);
    Promise.resolve(posMapa.pintar(capa, { puntos: [{ lat: lat, lng: lng, tipo: 'negocio' }], alto: 150, zoom: 16 }))
      .catch(function () { /* sin mapa: el dibujo de respaldo se queda */ })
      .then(function () {
        if (capa.querySelector('img')) capa.style.opacity = '1';
        else capa.remove();
      });
  });
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

/* ── Ubicación: copiar dirección ── */
function copiarDireccion(btn){
  const t = btn.dataset.copy || '';
  try{ navigator.clipboard.writeText(t); }catch(_e){}
  const prev = btn.textContent; btn.textContent = 'Copiado ✓';
  setTimeout(()=>{ btn.textContent = prev; }, 1400);
}

/* ── Nota de voz: helpers ── */
function fmtDur(s){ s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function voiceBars(seed, n){
  let h=2166136261>>>0;
  for(let i=0;i<seed.length;i++){ h^=seed.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  const out=[]; for(let i=0;i<n;i++){ h=(Math.imul(h,1103515245)+12345)>>>0; out.push(6+(h%25)); }
  return out;
}
function _vSetIco(btn, playing){ const ic=btn.querySelector('.ci-vico'); if(ic) ic.innerHTML = playing ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M7 4l13 8-13 8z"/>'; }
function voiceToggle(btn){
  const voice = btn.parentElement;
  const bubble = btn.closest('.ci-voice-bubble');
  const bars = voice ? Array.from(voice.querySelectorAll('.ci-wave i')) : [];
  const timeEl = bubble ? bubble.querySelector('.ci-vtime') : null;
  const spdEl  = bubble ? bubble.querySelector('.ci-vspd') : null;
  // si este ya suena → pausar
  if(window._voiceBtn===btn && btn._audio && !btn._audio.paused){ btn._audio.pause(); _vSetIco(btn,false); return; }
  // detener el que estuviera sonando
  if(window._voiceBtn && window._voiceBtn!==btn){ try{ window._voiceBtn._audio && window._voiceBtn._audio.pause(); }catch(_e){} _vSetIco(window._voiceBtn,false); }
  let a = btn._audio;
  if(!a){
    a = new Audio(btn.dataset.audio); btn._audio=a;
    a.ontimeupdate=()=>{ const p=a.duration?a.currentTime/a.duration:0; const idx=Math.round(p*bars.length); bars.forEach((b,i)=>b.classList.toggle('p', i<idx)); if(timeEl) timeEl.textContent=fmtDur(a.currentTime)+' / '+fmtDur(a.duration||0); };
    a.onended=()=>{ _vSetIco(btn,false); bars.forEach(b=>b.classList.remove('p')); };
    a.onerror=()=>{ if(timeEl) timeEl.textContent='error'; };
  }
  a.playbackRate = parseFloat((spdEl?spdEl.textContent:'1').replace('×',''))||1;
  window._voiceBtn=btn;
  a.play().then(()=>_vSetIco(btn,true)).catch(()=>{});
}
function voiceSpeed(el){
  const cur=parseFloat((el.textContent||'1').replace('×',''))||1;
  const next = cur===1?1.5:(cur===1.5?2:1);
  el.textContent=next+'×';
  const btn = el.closest('.ci-voice-bubble').querySelector('.ci-vplay');
  if(btn && btn._audio) btn._audio.playbackRate=next;
}

/* LOS ENLACES SE PUEDEN ABRIR (22-ago-2026).
   En WhatsApp y en Instagram un enlace llega subrayado y tocable. Aqui se
   escapaba el texto entero y quedaba muerto, asi que un mensaje con enlace
   se veia distinto a como lo recibio la persona. Se escapa PRIMERO (que es
   lo que evita que alguien nos meta HTML por un mensaje) y solo despues se
   marcan los enlaces sobre el texto ya seguro. */
function enlazarTexto(txt) {
  var seguro = escHtml(String(txt == null ? "" : txt));
  return seguro.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
    /* Un punto o una coma finales casi nunca son del enlace: son del texto. */
    var cola = "";
    while (/[.,;:!?)]$/.test(u)) { cola = u.slice(-1) + cola; u = u.slice(0, -1); }
    return '<a href="' + u + '" target="_blank" rel="noopener" class="ci-link">' + u + '</a>' + cola;
  });
}

/* LO QUE EL CLIENTE RECIBIO DE VERDAD.
   El motor lo guarda en chat_messages.payload, YA traducido al canal: en
   Instagram un boton no es un boton, es texto con el enlace, y aqui se dibuja
   como texto a proposito. La bandeja tiene que mostrar la verdad. */
function payloadDe(m) {
  var p = m && m.payload;
  if (!p) return null;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { return null; } }
  return (p && typeof p === "object") ? p : null;
}

// Una reacción no es un mensaje: es un emoji que va PEGADO a la burbuja del
// mensaje al que reaccionaron (como en WhatsApp). messageHTML envuelve el
// dibujo normal de la burbuja y le engancha el emoji si lo tiene.
function messageHTML(m) {
  let html = messageBubbleHTML(m);
  const rx = (m.reaction || '').trim();
  if (!rx) return html;
  html = html.replace('class="ci-row ', 'class="ci-row has-rx ');
  const i = html.lastIndexOf('</div>');          // cierre de .ci-row
  if (i < 0) return html;
  return html.slice(0, i) + `<span class="ci-reaction">${escHtml(rx)}</span>` + html.slice(i);
}

function messageBubbleHTML(m) {
  const dir   = m.direction === 'in' ? 'in' : 'out';
  const time  = formatTime(m.sent_at);
  const check = dir === 'out'
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${m.delivery_status==='read'?'#fff':'rgba(255,255,255,.5)'}" stroke-width="2.4"><polyline points="18 7 9 17 5 13"/><polyline points="22 7 13 17 12.5 16.5"/></svg>`
    : '';
  const menu  = msgTriggerHTML(m);

  // ── NOTA DE VOZ (audio) → play + onda + transcripción (diseño handoff) ──
  if (m.media_type === 'audio' && m.media_url) {
    const trsRaw = (m.body || '').trim();
    const isTrs  = trsRaw.indexOf('🎙') === 0;
    const trsText = isTrs ? trsRaw.replace(/^🎙️?\s*/, '') : (trsRaw && trsRaw !== '[audio]' ? trsRaw : '');
    const bars = voiceBars(String(m.id), 40).map(h => `<i style="height:${h}px"></i>`).join('');
    const trsHtml = trsText
      ? `<div class="ci-trs"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B85FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10M9 6l3-3 3 3M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg><div><b>Transcripción automática</b>“${escHtml(trsText)}”</div></div>`
      : '';
    const aQuote = m._replyTo ? `<div class="ci-reply-quote"><div class="ci-reply-quote-bar"></div><div class="ci-reply-quote-body"><div class="ci-reply-quote-who">${escHtml(m._replyTo.who||'')}</div><div class="ci-reply-quote-text">🎤 Nota de voz</div></div></div>` : '';
    return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
      <div class="ci-bubble ${dir} ci-voice-bubble">${menu}${aQuote}
        <div class="ci-voice">
          <button class="ci-vplay" onclick="voiceToggle(this)" data-audio="${escHtml(m.media_url)}"><svg class="ci-vico" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg></button>
          <div class="ci-wave">${bars}</div>
        </div>
        <div class="ci-vmeta"><span class="ci-vtime mono">0:00</span><span class="ci-vspd" onclick="voiceSpeed(this)">1×</span></div>
        ${trsHtml}
        <div class="ci-meta">${time}${check}</div>
      </div>
    </div>`;
  }

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
    const addrLine = (locName && locAddr) ? locAddr : '';
    const copyTxt  = (loc.name ? loc.name + ' ' : '') + (loc.addr || coords);
    const locCard = `<div class="ci-loc-card">
      <!-- El recuadro nace con el dibujo de siempre (pin sobre un fondo) y
           pintarMapasDelHilo() le mete encima el mapa real de Google en cuanto
           el hilo esta en pantalla. Si no hay llave de mapas conectada o se
           cae la llamada, se queda el dibujo: nunca un hueco vacio. -->
      <div class="ci-loc-map${dir==='in'?' live':''}" data-mapa-lat="${lat}" data-mapa-lng="${lng}">
        <div class="ci-loc-pin">${dir==='in'?'<span class="ci-loc-ring"></span>':''}<span class="ci-loc-dot"></span></div>
        <span class="ci-loc-tag">mapa · ${lat.toFixed(3)} / ${lng.toFixed(3)}</span>
      </div>
      <div class="ci-loc-body">
        <div class="ci-loc-t">${label}</div>
        ${addrLine?`<div class="ci-loc-s">${addrLine}</div>`:`<div class="ci-loc-s mono" style="font-size:11.5px">${coords}</div>`}
        <div class="ci-loc-act">
          <a class="ci-loc-mini ac" href="${mapsUrl}" target="_blank" rel="noopener">Abrir en Maps</a>
          <button class="ci-loc-mini" data-copy="${escHtml(copyTxt)}" onclick="copiarDireccion(this)">Copiar dirección</button>
        </div>
      </div>
    </div>`;
    return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
      <div class="ci-bubble ${dir} ci-card-bubble">${menu}${locQuote}${locCard}<div class="ci-meta ci-meta-card">${time}${check}</div></div>
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

  /* BOTONES Y ATAJOS TOCABLES (22-ago-2026, pedido de Sergio).
     Antes esto llegaba a la base aplanado a texto —"[Ver la carta] https://…"—
     y en la bandeja se veia un enlace pelado mientras el cliente veia un
     boton. Ahora el motor guarda la forma y aqui se dibuja igual. */
  const _pay = payloadDe(m);
  if (_pay && (_pay.tipo === "botones" || _pay.tipo === "respuestas_rapidas")) {
    const txt = enlazarTexto(_pay.texto || m.body || "");
    let extra = "";
    if (_pay.tipo === "botones") {
      extra = (_pay.botones || []).map(function (b) {
        return '<a class="ci-wa-btn" href="' + escHtml(b.url || "#") + '" target="_blank" rel="noopener">'
          + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
          + escHtml(b.titulo || "Abrir") + '</a>';
      }).join("");
    } else {
      /* Los atajos de Instagram/Messenger van FUERA de la burbuja, como los
         ve la persona en su telefono. */
      extra = '<div class="ci-qr-row">' + (_pay.opciones || []).map(function (o) {
        return '<span class="ci-qr-chip">' + escHtml(o) + '</span>';
      }).join("") + '</div>';
    }
    const cuerpoBtn = '<div>' + txt + '</div>'
      + (_pay.tipo === "botones" ? '<div class="ci-wa-btns">' + extra + '</div>' : "");
    return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
      <div class="ci-bubble ${dir}">${menu}${cuerpoBtn}<div class="ci-meta">${time}${check}</div></div>
      ${_pay.tipo === "respuestas_rapidas" ? extra : ""}
    </div>`;
  }

  let mediaHtml = '';
  if (m.media_url) {
    if (m.media_type === 'image') {
      mediaHtml = `<a href="${escHtml(m.media_url)}" target="_blank" rel="noopener"><img src="${escHtml(m.media_url)}" class="ci-img-thumb" alt="imagen" loading="lazy"></a>`;
      // Imagen entrante = posible comprobante → acciones de pago inline (mockup)
      if (m.direction === 'in') {
        mediaHtml += `<div class="ci-img-pay"><button class="ci-img-pay-btn ac" onclick="verificarPagoModal()">Verificar pago</button><button class="ci-img-pay-btn" onclick="marcarPagadoModal()">Marcar pagado</button></div>`;
      }
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

  const _isPlaceholder = m.body && /^\s*\[\s*(image|imagen|foto|photo|audio|voice|voz|nota de voz|video|v[ií]deo|sticker|documento?|document|file|archivo|ubicaci[oó]n|location|gif)\s*\]\s*$/i.test(m.body);
  const textHtml = (m.body && m.media_type !== 'document' && !_isPlaceholder) ? `<div>${enlazarTexto(m.body)}</div>` : '';

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

  /* Quién mandó el mensaje. Sin esto no se puede saber si un fallo fue del bot
     o si alguien lo resolvió a mano: pasó con la carta del 31/07, que se creyó
     que la había mandado el bot cuando la mandó Sergio. */
  const _org = m.direction === 'out' ? (m.origen || '') : '';
  const orgTag = _org === 'bot'     ? '<span class="ci-org ci-org-bot">Pako</span>'
               : _org === 'humano'  ? '<span class="ci-org ci-org-hum">Tú</span>'
               : _org === 'sistema' ? '<span class="ci-org ci-org-sys">Sistema</span>' : '';
  return `<div class="ci-row ${dir}" data-msg-id="${m.id}">
    <div class="ci-bubble ${dir}">${menu}${body}<div class="ci-meta">${orgTag}${time}${check}</div></div>
  </div>`;
}

function renderBadges() {
  const totalUnread = S.conversations.reduce((s,c) => s + (isRealUnread(c) ? c.unread_count : 0), 0);
  const pending     = S.conversations.filter(c => isRealUnread(c)).length;
  $('badge-all').textContent     = totalUnread || '';
  $('badge-pending').textContent = pending     || '';
  updateHumanBadge();
  updatePagoBadge();
  const _tu = $('totalUnread'); if (_tu) _tu.textContent = totalUnread ? `${totalUnread} sin leer` : `${S.conversations.length} conversaciones`;
  renderChannelsSidebar();
  renderFilters();
}

/* ══ EL MISMO CLIENTE, SUS TRES CANALES (22-ago-2026, pedido de Sergio) ══
   "Si un cliente escribe desde Facebook o Instagram y el mismo cliente
   escribe desde WhatsApp, no van a ser dos chats independientes: va a ser la
   misma ventana, y en la barra de arriba una pestañita para alternar."

   Lo que las hermana es `cliente_id`: lo escribe fn_cliente_vincular_red
   cuando el cliente da su numero por una red, y ya quedaron enlazadas las
   conversaciones de WhatsApp que tenian su telefono.

   Se usa el cliente y NO el telefono del contacto porque en Instagram el
   `contact_handle` es un id de Meta, no un numero: emparejar por texto ahi
   no encuentra nada.                                                      */
function hermanasDe(conv) {
  if (!conv || !conv.cliente_id) return [];
  return S.conversations.filter(function (c) {
    return c.cliente_id === conv.cliente_id;
  }).sort(function (a, b) {
    /* Orden fijo, no por actividad: si se movieran de sitio en cada mensaje,
       el operador tocaria el canal equivocado sin darse cuenta.
       OJO con el `||`: WhatsApp vale 0, y en JavaScript `0 || 9` da 9 — con
       `||` WhatsApp se iba al FINAL. Lo cazo el banco de pruebas. */
    var orden = { whatsapp: 0, instagram: 1, facebook: 2, tiktok: 3 };
    var oa = orden[a.channel]; if (oa === undefined) oa = 9;
    var ob = orden[b.channel]; if (ob === undefined) ob = 9;
    return oa - ob;
  });
}

/* ¿Se le puede escribir libremente por ese canal? Meta solo lo permite
   dentro de las 24 h siguientes al ultimo mensaje del cliente. Se calcula
   con `last_message_at` + `last_sender`, que es lo que hay en la lista sin
   tener que cargar los mensajes de cada canal. */
function canalAbierto(c) {
  if (!c || !c.last_message_at) return false;
  if (c.last_sender !== "contact") {
    /* Si el ultimo fue nuestro, no se sabe cuando escribio el cliente: se
       tira por lo conservador solo si ya paso mucho tiempo. */
    return (Date.now() - new Date(c.last_message_at).getTime()) < 24 * 3600000;
  }
  return (Date.now() - new Date(c.last_message_at).getTime()) < 24 * 3600000;
}

/* ══ QUE FOTO LLEVA CADA CHAT (22-ago-2026, regla de Sergio) ═════════════
   "Si la persona escribio por WhatsApp y por Instagram, el chat SIEMPRE
   tendra la foto de Instagram. Si escribio por las tres, cuando toquemos
   Facebook sale la de Facebook, cuando toquemos Instagram la de Instagram, y
   cuando toquemos WhatsApp sale la de la PRIMERA red de la que escribio, sin
   contar WhatsApp — para que nunca quede sin foto."

   Asi las iniciales quedan SOLO para quien nunca ha escrito por una red, que
   es el unico caso en que de verdad no hay ninguna foto: WhatsApp no entrega
   la del cliente y nunca lo hara.

   "La primera red de la que escribio" es la conversacion mas ANTIGUA que no
   sea WhatsApp: la fecha en que se creo ES la primera vez que escribio por
   ahi. Se prefiere la mas vieja y no la mas reciente para que la cara del
   cliente no cambie cada vez que estrena una red. */
function fotoDe(conv) {
  if (!conv) return null;
  /* Cada canal manda sobre lo suyo: si esta conversacion tiene su propia
     foto, esa es. Solo se hereda cuando no hay ninguna. */
  if (conv.contact_avatar_url) return conv.contact_avatar_url;
  var prestadas = hermanasDe(conv).filter(function (c) {
    return c.channel !== "whatsapp" && c.contact_avatar_url;
  }).sort(function (a, b) {
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
  return prestadas.length ? prestadas[0].contact_avatar_url : null;
}

function renderCanalSwitch(conv) {
  var cont = $("chatCanales");
  if (!cont) return;
  var hs = hermanasDe(conv);
  /* Con un solo canal no hay nada que alternar: la pestaNa sobra y solo
     quitaria sitio al nombre del cliente. */
  if (hs.length < 2) { cont.style.display = "none"; cont.innerHTML = ""; return; }
  cont.style.display = "flex";
  cont.innerHTML = hs.map(function (c) {
    var m = CHANNELS[c.channel] || {};
    var activa = c.id === conv.id;
    var abierto = canalAbierto(c);
    var sinLeer = (c.unread_count || 0) > 0;
    return "<button type=\"button\" class=\"ci-canal-tab" + (activa ? " on" : "") + (abierto ? "" : " cerrado") + "\"" +
      " data-conv=\"" + escHtml(c.id) + "\"" +
      " title=\"" + escHtml((m.label || c.channel) + (abierto ? "" : " · pasaron mas de 24 h, solo con plantilla")) + "\">" +
      (GLYPH[m.key] || "") +
      "<span>" + escHtml(m.label || c.channel) + "</span>" +
      (sinLeer ? "<i class=\"ci-canal-n\">" + c.unread_count + "</i>" : "") +
      (abierto ? "" : "<i class=\"ci-canal-lock\">·</i>") +
    "</button>";
  }).join("");
  cont.querySelectorAll("[data-conv]").forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.conv;
      if (id && id !== S.activeConvId) openConversation(id);
    });
  });
}

function renderChatHeader(conv) {
  updateHumanToggleBtn(!!conv.human_takeover);
  updatePagoConfirmBtn(!!conv.pago_pendiente);
  updateDomiConfirmBtn(!!conv.domi_precio_pendiente);
  updateSinNomBtn(!!conv.sin_nomenclatura);
  const vpb=$('verifyPagoBtn'); if(vpb) vpb.style.display='';   // verificar transferencia: siempre disponible con un chat abierto
  loadEstadoPill(conv);
  checkBlacklist(conv);   // ⚠️ avisar si el contacto está en lista negra
  const meta     = CHANNELS[conv.channel] || {};
  const tint     = TINTS[(conv.contact_avatar_tint||0) % TINTS.length];
  const _cli     = clienteDe(conv);
  const label    = (_cli && _cli.nombre) || conv.contact_name || conv.contact_handle || '?';
  const initials = avatarInitials(label);

  /* LA FOTO DE PERFIL (22-ago). Instagram y Messenger SI la entregan; WhatsApp
     no la da nunca. La lista de chats ya la pintaba, el encabezado no.
     Si el enlace falla —caducan— se cae a las iniciales de siempre en vez de
     dejar un cuadro roto. */
  const foto = fotoDe(conv) || '';
  $('chatAv').innerHTML = `
    ${foto
      ? `<img src="${escHtml(foto)}" alt="" style="width:100%;height:100%;border-radius:13px;object-fit:cover;display:block"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <span style="display:none;width:100%;height:100%;border-radius:13px;background:${tint[0]};color:${tint[1]};align-items:center;justify-content:center;font-size:13px;font-weight:700;position:absolute;inset:0">${initials}</span>`
      : `<span style="width:100%;height:100%;border-radius:13px;background:${tint[0]};color:${tint[1]};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${initials}</span>`}
    <span class="ci-av-badge chan-${meta.key}" style="position:absolute;right:-4px;bottom:-4px">${GLYPH[meta.key]||''}</span>`;

  $('chatName').innerHTML = escHtml(label)
    + (_cli && _cli.barrio ? ' <span class="ci-barrio">' + escHtml(_cli.barrio) + '</span>' : '');
  $('chatMeta').innerHTML   = `
    <span class="ci-chan-chip chip-${meta.key}">${GLYPH[meta.key]||''}${meta.label||''}</span>
    <span class="ci-presence">${conv.is_online ? '<span class="ci-dot-live"></span> en línea' : 'visto recientemente'} · ${escHtml(conv.contact_handle||'')}</span>`;
  renderCanalSwitch(conv);
}

/* ══════════════ LISTA NEGRA — aviso en el chat ══════════════
   Revisa el teléfono (y dirección del borrador si existe) contra la lista negra.
   Si coincide, muestra un banner rojo para que CUALQUIER cajero lo vea. */
async function checkBlacklist(conv){
  const bar=$('blBanner'); if(!bar) return;
  bar.style.display='none'; bar.innerHTML='';
  try{
    const tel = conv.contact_handle || conv.from_phone || '';
    let dirNorm = null;
    try{ const { data:cd }=await sb.from('chat_conversations').select('pedido_borrador').eq('id', conv.id).maybeSingle();
      const dir = cd && cd.pedido_borrador && cd.pedido_borrador.direccion;
      if(dir) dirNorm = normDir(dir);
    }catch(_e){}
    const { data } = await sb.rpc('lista_negra_match', { p_tenant:S.tenantId, p_tel:tel||null, p_dir_norm:dirNorm });
    const hit = Array.isArray(data) ? data[0] : data;
    if(conv.id!==S.activeConvId) return;   // cambió de chat mientras consultaba
    if(hit){
      bar.innerHTML='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>'
        +'<div><b>Cliente en LISTA NEGRA'+(hit.nombre?' · '+escHtml(hit.nombre):'')+'</b>'+(hit.razon?'<div class="ci-bl-razon">'+escHtml(hit.razon)+'</div>':'')+'</div>';
      bar.style.display='flex';
    }
  }catch(e){ /* si falla, no molestar */ }
}
// Normaliza dirección igual que en la BB: minúsculas, sin acentos, espacios colapsados
function normDir(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

/* Modal: agregar el contacto del chat a la lista negra (pre-llena teléfono/dirección). */
async function openBlacklistModal(){
  closeMoreMenu && closeMoreMenu();
  const conv = getActiveConv();
  if(!conv){ showToast('Abre un chat primero','info'); return; }
  let dir='';
  try{ const { data:cd }=await sb.from('chat_conversations').select('pedido_borrador').eq('id', conv.id).maybeSingle();
    dir = (cd && cd.pedido_borrador && cd.pedido_borrador.direccion) || '';
  }catch(_e){}
  const nombre = conv.contact_name || '';
  const tel = conv.contact_handle || '';
  const ov=document.createElement('div'); ov.className='bl-ov';
  ov.innerHTML='<div class="bl-box">'
    +'<div class="bl-title"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg> Agregar a lista negra</div>'
    +'<div class="bl-sub">Se bloqueará por <b>teléfono</b> y por <b>dirección exacta</b>. El nombre es solo referencia.</div>'
    +'<label class="bl-lbl">Nombre (referencia)</label><input class="bl-inp" id="blNombre" placeholder="Ej. Mariana">'
    +'<label class="bl-lbl">Teléfono</label><input class="bl-inp" id="blTel" placeholder="Número">'
    +'<label class="bl-lbl">Dirección exacta (casa/apto)</label><input class="bl-inp" id="blDir" placeholder="Ej. Reserva del Bosque bloque 5 casa 12">'
    +'<label class="bl-lbl">Razón</label><textarea class="bl-inp bl-txa" id="blRazon" rows="2" placeholder="Ej. Pide, hace preparar y cancela"></textarea>'
    +'<div class="bl-btns"><button class="bl-cancel" type="button">Cancelar</button><button class="bl-save" type="button">🚫 Bloquear</button></div>'
    +'</div>';
  document.body.appendChild(ov);
  ov.querySelector('#blNombre').value=nombre;
  ov.querySelector('#blTel').value=tel;
  ov.querySelector('#blDir').value=dir;
  const close=function(){ ov.remove(); };
  ov.querySelector('.bl-cancel').onclick=close;
  ov.onclick=function(e){ if(e.target===ov) close(); };
  ov.querySelector('.bl-save').onclick=async function(){
    const btn=this; btn.disabled=true; btn.textContent='Guardando…';
    const pNombre=ov.querySelector('#blNombre').value.trim();
    const pTel=ov.querySelector('#blTel').value.trim();
    const pDir=ov.querySelector('#blDir').value.trim();
    const pRazon=ov.querySelector('#blRazon').value.trim();
    if(!pTel && !pDir){ showToast('Pon al menos el teléfono o la dirección','error'); btn.disabled=false; btn.textContent='🚫 Bloquear'; return; }
    try{
      const { error }=await sb.rpc('lista_negra_agregar', { p_tenant:S.tenantId, p_nombre:pNombre||null, p_razon:pRazon||null, p_tel:pTel||null, p_dir:pDir||null, p_dir_norm:pDir?normDir(pDir):null, p_auto:false });
      if(error) throw error;
      showToast('🚫 Agregado a lista negra','success');
      close();
      checkBlacklist(conv);   // refresca el banner
    }catch(e){ showToast('No se pudo agregar: '+(e&&e.message||e),'error'); btn.disabled=false; btn.textContent='🚫 Bloquear'; }
  };
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
          /* Facebook e Instagram devuelven la LISTA de páginas para elegir;
             WhatsApp no, ese conecta derecho. */
          if (result && result.paginas) return elegirPagina(result, channel, meta);
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

// ── Ventana de 24h (WhatsApp / Instagram / Facebook) ──────────────
// Estas plataformas NO permiten enviar mensajes libres si pasaron más de 24h
// desde el ÚLTIMO mensaje del cliente. Fuera de esa ventana hay que usar una
// plantilla aprobada. Calculamos el estado con el último mensaje ENTRANTE.
function waWindowInfo() {
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv || !['whatsapp','instagram','facebook'].includes(conv.channel)) return { applies:false, open:true, conv };
  let lastIn = null;
  for (let i = S.messages.length - 1; i >= 0; i--) {
    if (S.messages[i] && S.messages[i].direction === 'in') { lastIn = S.messages[i].sent_at || S.messages[i].created_at; break; }
  }
  if (!lastIn) return { applies:true, open:false, lastIn:null, conv };
  const hrs = (Date.now() - new Date(lastIn).getTime()) / 3600000;
  return { applies:true, open: hrs < 24, lastIn, hrs, conv };
}
function updateWaWindow() {
  const banner = $('waWindowBanner'); if (!banner) return;
  const composer = $('composer');
  const w = waWindowInfo();
  if (w.applies && !w.open) {
    const canal24 = (w.conv && w.conv.channel) || 'whatsapp';
    const chLbl = (CHANNELS[canal24] || {}).label || 'WhatsApp';
    const reloj = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    /* LAS PLANTILLAS SON DE WHATSAPP, NO DE META (22-ago-2026). El boton
       'Enviar plantilla' llama a wa-plantillas, que manda
       `messaging_product: whatsapp`: en Instagram y Messenger no puede
       funcionar. Prometia algo que no podia cumplir.

       En esas dos redes lo unico que hoy se puede es que una PERSONA le
       escriba desde su propia cuenta —Meta solo deja pasada la ventana con la
       etiqueta de agente humano, y solo para mensajes de humanos, no de un
       bot—. Asi que se dice eso, que es la verdad y ademas es accionable. */
    if (canal24 === 'instagram' || canal24 === 'facebook') {
      banner.innerHTML = reloj
        + '<div style="flex:1"><b>Pasaron más de 24 horas</b> desde el último mensaje del cliente. '
        + escHtml(chLbl) + ' ya no deja responder por aquí.<br>'
        + 'Escríbele tú desde ' + escHtml(chLbl) + ', o espera a que él vuelva a escribir.</div>';
    } else {
      banner.innerHTML = reloj
        + '<div style="flex:1"><b>Pasaron más de 24 horas</b> desde el último mensaje del cliente. ' + escHtml(chLbl) + ' no permite enviar mensajes libres fuera de esa ventana — se necesita una <b>plantilla aprobada</b>.</div>'
        + '<button class="ci-wa-tplbtn" onclick="abrirEnviarPlantilla()">Enviar plantilla</button>';
    }
    banner.style.display = 'flex';
    if (composer) composer.classList.add('ci-composer--locked');
  } else {
    banner.style.display = 'none';
    if (composer) composer.classList.remove('ci-composer--locked');
  }
}

/* ══ Chat nuevo desde cero (el boton + de arriba) ═════════════════
   Para escribirle a alguien que nunca ha escrito: se crea el contacto y su
   chat, y como esa persona no ha mandado nada, la ventana de 24 h nace
   cerrada — el propio chat ofrece "Enviar plantilla", que es la unica forma
   que WhatsApp permite de dar el primer paso. */
function abrirNuevoChat() {
  const ov = document.createElement('div');
  ov.id = 'nc-ov';
  ov.className = 'ci-tpl-ov';
  ov.innerHTML = '<div class="ci-tpl-box">'
    + '<div class="ci-tpl-head">Nuevo chat</div>'
    + '<div class="ci-tpl-sub">Crea el contacto y ábrele un chat. Como aún no te ha escrito, WhatsApp solo deja empezar con una plantilla aprobada — el chat te la ofrece apenas se abra.</div>'
    + '<div class="ci-tpl-campos">'
    +   '<input class="ci-tpl-inp" id="nc-nombre" placeholder="Nombre" maxlength="60">'
    +   '<input class="ci-tpl-inp" id="nc-tel" placeholder="Celular (10 dígitos)" inputmode="numeric" maxlength="10" oninput="this.value=this.value.replace(/[^0-9]/g,&quot;&quot;)">'
    +   '<input class="ci-tpl-inp" id="nc-dir" placeholder="Dirección (opcional)" maxlength="120">'
    + '</div>'
    + '<div class="ci-tpl-err" id="nc-err" style="display:none"></div>'
    + '<div class="ci-tpl-foot">'
    +   '<button class="ci-tpl-btn ghost" onclick="document.getElementById(&quot;nc-ov&quot;).remove()">Cancelar</button>'
    +   '<button class="ci-tpl-btn primary" id="nc-crear" onclick="crearNuevoChat()">Crear y abrir chat</button>'
    + '</div></div>';
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  document.getElementById('nc-nombre').focus();
}
function _ncError(msg) {
  const e = document.getElementById('nc-err');
  if (e) { e.textContent = msg; e.style.display = 'block'; }
  const b = document.getElementById('nc-crear');
  if (b) { b.disabled = false; b.textContent = 'Crear y abrir chat'; }
}
async function crearNuevoChat() {
  const nombre = (document.getElementById('nc-nombre').value || '').trim();
  const tel = (document.getElementById('nc-tel').value || '').replace(/[^0-9]/g, '');
  const dir = (document.getElementById('nc-dir').value || '').trim();
  if (!nombre) return _ncError('Escribe el nombre.');
  if (tel.length !== 10) return _ncError('El celular va a 10 dígitos, como 3001234567.');
  const btn = document.getElementById('nc-crear');
  btn.disabled = true; btn.textContent = 'Creando…';
  const handle = '57' + tel;
  try {
    /* ¿Ya existe un chat con ese número? Un número = una conversación, en
       cualquier estado y en cualquier bandeja — por eso se pregunta a la base
       y no a la lista de pantalla, que solo trae la vista activa. */
    const ya = await sb.from('chat_conversations').select('id,contact_name,status')
      .eq('branch_id', S.branchId).eq('channel', 'whatsapp')
      .eq('contact_handle', handle).neq('status', 'preview').limit(1);
    let convId = null;
    if (ya.data && ya.data.length) {
      convId = ya.data[0].id;
      /* Si el chat existia sin nombre, este si se aprovecha. El que ya tiene
         no se pisa: puede venir del propio cliente. */
      if (!ya.data[0].contact_name) {
        await sb.from('chat_conversations').update({ contact_name: nombre }).eq('id', convId);
      }
      showToast('Ese número ya tenía un chat: te lo abrí', 'info');
    } else {
      const wa = S.channels.find(c => c.channel === 'whatsapp') || {};
      const ins = await sb.from('chat_conversations').insert({
        tenant_id: S.tenantId, branch_id: S.branchId,
        channel: 'whatsapp', channel_id: wa.id || null,
        contact_name: nombre, contact_handle: handle,
        status: 'open', unread_count: 0,
        /* Un chat que TU abres es tuyo: va a la pestaña "Tú" y Paco no se
           mete aunque el cliente conteste de noche. */
        human_takeover: true,
        last_sender: 'agent', last_message: 'Chat nuevo',
        last_message_at: new Date().toISOString(),
      }).select('id');
      if (ins.error || !ins.data || !ins.data.length) {
        return _ncError('No se pudo crear el chat: ' + ((ins.error && ins.error.message) || 'sin permisos'));
      }
      convId = ins.data[0].id;
    }
    /* La ficha de cliente: si el número ya la tiene, no se duplica (un número
       = una ficha); solo se le completa lo que este vacío. */
    const cli = await sb.from('pos_clientes').select('id,nombre,direccion,direcciones')
      .eq('tenant_id', S.tenantId).like('telefono', '%' + tel).limit(1);
    const fila = cli.data && cli.data[0];
    if (!fila) {
      const dirId = 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      await sb.from('pos_clientes').insert({
        tenant_id: S.tenantId, branch_id: S.branchId,
        nombre: nombre, telefono: tel,
        direccion: dir || null,
        direcciones: dir ? [{ id: dirId, dir: dir, barrio: '' }] : [],
      });
      S.clientesPorTel[tel] = { nombre: nombre, barrio: '' };
    } else if (dir && !fila.direccion) {
      const dirId = 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      const lista = Array.isArray(fila.direcciones) ? fila.direcciones : [];
      lista.push({ id: dirId, dir: dir, barrio: '' });
      await sb.from('pos_clientes').update({
        direccion: dir, direcciones: lista, updated_at: new Date().toISOString(),
      }).eq('id', fila.id);
    }
    document.getElementById('nc-ov')?.remove();
    /* El chat vive en la pestaña "Tú": se cambia la vista para que al volver
       a la lista siga a la vista, no desaparecido en otra bandeja. */
    const bTu = document.querySelector('.ci-nav-btn[data-view="human"]');
    if (bTu) { document.querySelectorAll('.ci-nav-btn').forEach(b => b.classList.remove('active')); bTu.classList.add('active'); }
    S.activeView = 'human';
    await loadConversations();
    if (!S.conversations.find(c => c.id === convId)) {
      const uno = await sb.from('chat_conversations').select('*').eq('id', convId).limit(1);
      if (uno.data && uno.data.length) S.conversations.unshift(uno.data[0]);
    }
    renderConvList();
    await selectConversation(convId);
  } catch (e) {
    _ncError('No se pudo crear el chat: ' + (e && e.message || e));
  }
}

/* ══ Enviar plantilla (fuera de la ventana de 24 h) ══
   Solo se pueden enviar las que Meta ya APROBÓ. Se crean en
   Configuración → Chat IA → Plantillas. */
const WA_TPL_FN = 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wa-plantillas';
let _tplSel = null;

async function abrirEnviarPlantilla() {
  if (!S.activeConvId) return;
  const ov = document.createElement('div');
  ov.id = 'tpl-ov';
  ov.className = 'ci-tpl-ov';
  ov.innerHTML = '<div class="ci-tpl-box" id="tpl-box"><div class="ci-tpl-load">Cargando plantillas…</div></div>';
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);

  let d = {};
  try {
    const r = await fetch(WA_TPL_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: S.branchId, action: 'list' }),
    });
    d = await r.json();
  } catch (e) { d = { error: 'Sin conexión con el servidor.' }; }

  const box = document.getElementById('tpl-box'); if (!box) return;
  if (d.error) { box.innerHTML = '<div class="ci-tpl-head">Enviar plantilla</div><div class="ci-tpl-err">' + escHtml(d.error) + '</div>' + _tplCerrar(); return; }

  const aprobadas = (d.items || []).filter(t => String(t.estado).toUpperCase() === 'APPROVED');
  if (!aprobadas.length) {
    box.innerHTML = '<div class="ci-tpl-head">Enviar plantilla</div>'
      + '<div class="ci-tpl-empty">No tienes plantillas aprobadas todavía.<br><br>Créalas en <b>Configuración → Chat IA → Plantillas</b>. Meta las revisa y, apenas queden aprobadas, aparecerán aquí.</div>'
      + _tplCerrar();
    return;
  }
  box.innerHTML = '<div class="ci-tpl-head">Enviar plantilla</div>'
    + '<div class="ci-tpl-sub">El cliente lleva más de 24 h sin escribir, así que WhatsApp solo permite estos mensajes aprobados.</div>'
    + '<div class="ci-tpl-list">' + aprobadas.map((t, i) =>
        '<button class="ci-tpl-item" onclick="_tplElegir(' + i + ')">'
        + '<div class="ci-tpl-nm">' + escHtml(t.nombre) + '</div>'
        + '<div class="ci-tpl-tx">' + escHtml(t.cuerpo) + '</div>'
        + '</button>').join('')
    + '</div>' + _tplCerrar();
  window._tplAprobadas = aprobadas;
}
function _tplCerrar() {
  return '<div class="ci-tpl-foot"><button class="ci-tpl-btn ghost" onclick="document.getElementById(\'tpl-ov\').remove()">Cerrar</button></div>';
}
function _tplElegir(i) {
  const t = (window._tplAprobadas || [])[i]; if (!t) return;
  _tplSel = t;
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  const nombreCliente = (conv && conv.contact_name) || '';
  const box = document.getElementById('tpl-box'); if (!box) return;
  const campos = [];
  for (let v = 1; v <= (t.variables || 0); v++) {
    campos.push('<input class="ci-tpl-inp" data-tv="' + v + '" placeholder="Dato {{' + v + '}}"'
      + (v === 1 && nombreCliente ? ' value="' + escHtml(nombreCliente) + '"' : '')
      + ' oninput="_tplPrev()">');
  }
  box.innerHTML = '<div class="ci-tpl-head">' + escHtml(t.nombre) + '</div>'
    + (campos.length ? '<div class="ci-tpl-sub">Completa los datos que cambian en este mensaje.</div><div class="ci-tpl-campos">' + campos.join('') + '</div>' : '')
    + '<div class="ci-tpl-prevlbl">Así le llega</div><div class="ci-tpl-prev" id="tpl-prev"></div>'
    + '<div class="ci-tpl-foot">'
    +   '<button class="ci-tpl-btn ghost" onclick="abrirEnviarPlantilla()">Volver</button>'
    +   '<button class="ci-tpl-btn primary" id="tpl-send" onclick="_tplEnviar()">Enviar</button>'
    + '</div>';
  _tplPrev();
}
function _tplPrev() {
  const t = _tplSel; if (!t) return;
  let txt = t.cuerpo || '';
  document.querySelectorAll('#tpl-box input[data-tv]').forEach(function (i) {
    if (i.value) txt = txt.replace(new RegExp('\\{\\{\\s*' + i.dataset.tv + '\\s*\\}\\}', 'g'), i.value);
  });
  const p = document.getElementById('tpl-prev');
  if (p) p.textContent = txt + (t.pie ? '\n\n' + t.pie : '');
}
async function _tplEnviar() {
  const t = _tplSel; if (!t || !S.activeConvId) return;
  const params = [];
  let faltan = false;
  document.querySelectorAll('#tpl-box input[data-tv]').forEach(function (i) {
    if (!i.value.trim()) faltan = true;
    params.push(i.value.trim());
  });
  if (faltan) { showToast('Completa todos los datos de la plantilla', 'info'); return; }
  const btn = document.getElementById('tpl-send');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const r = await fetch(WA_TPL_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: S.branchId, action: 'send', conversation_id: S.activeConvId,
        nombre: t.nombre, idioma: t.idioma || 'es', params,
      }),
    });
    const d = await r.json();
    if (d.error) { showToast(d.error, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; } return; }
    document.getElementById('tpl-ov')?.remove();
    showToast('✓ Plantilla enviada', 'success');
    await loadMessages(S.activeConvId);
  } catch (e) {
    showToast('No se pudo enviar la plantilla', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  }
}

async function sendMessage() {
  const input = $('msgInput');
  const text  = input.value.trim();
  if (!text || !S.activeConvId) return;
  // Ventana de 24h cerrada → no dejar enviar un mensaje libre (Meta lo rechazaría).
  const _w = waWindowInfo();
  if (_w.applies && !_w.open) {
    showToast('⏰ Pasaron más de 24 h desde el último mensaje del cliente. No se puede enviar un mensaje libre — se necesita una plantilla aprobada de Meta.', 'error');
    updateWaWindow();
    return;
  }
  input.value = '';

  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId, direction:'out', body: text, delivery_status:'sending', sent_at: new Date().toISOString() });
  renderThread();

  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId,
    direction:'out', body: text, delivery_status:'sent', agent_id: S.user?.id || null, origen: 'humano',
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
    delivery_status: 'sent', agent_id: S.user?.id || null, origen: 'humano',
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
    delivery_status: 'sent', agent_id: S.user?.id || null, origen: 'humano',
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
  // El + de arriba: chat nuevo desde cero (muerto hasta el 20-ago-2026).
  const ncBtn = document.getElementById('newConvBtn');
  if (ncBtn) ncBtn.addEventListener('click', abrirNuevoChat);
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
// Semilla inicial para un restaurante NUEVO (base vacia). SOLO frases
// genericas: nada de direcciones, coordenadas, cuentas bancarias, platos ni
// emojis de una cocina en particular — eso es de cada negocio.
//
// Aqui estuvo sembrada la direccion, la ubicacion y la cuenta de El Parche,
// y despues (hasta el 21-ago-2026) su CARTA y su emoji: un restaurante nuevo
// abria el chat y encontraba "¿la deseas con pollo o carne?", "super queso",
// "salsas de maiz o chedar" y papas fritas en cada frase. Tambien decia
// "buenas noches" en todo, que asume que el negocio solo abre de noche.
//
// A El Parche esto NO le cambia nada: sus 41 frases ya estan guardadas en su
// base; la semilla solo corre cuando un restaurante no tiene ninguna.
const DEFAULT_QUICK_REPLIES = [
  /* SALUDOS Y CORTESIA */
  { k:'saludo',    t:'¡Hola! ¿Cómo estás? Cuéntame, ¿en qué te podemos ayudar? ☺️' },
  { k:'gracias',   t:'¡Muchas gracias por preferirnos! Esperamos poder servirte nuevamente.' },
  { k:'gusto',     t:'Con muchísimo gusto, estamos para servirte ☺️' },

  /* LA CARTA */
  { k:'carta',     t:'¡Con gusto! Ya te envío nuestra carta 😊' },
  { k:'menu',      t:'¿Qué se te antoja? ☺️', img:'@menu' },

  /* TOMAR EL PEDIDO
     Estas dependen de lo que venda cada negocio: se dejan como ejemplo para
     que el dueNo las reescriba con SUS opciones. */
  { k:'adicion',   t:'Perfecto, ¿deseas agregarle algo más a tu pedido? 🤩' },
  { k:'variante',  t:'¿Cómo la prefieres? 😋' },
  { k:'nombre',    t:'¿A nombre de quién se recibe el pedido?' },

  /* DOMICILIO */
  { k:'direccion', t:'¿Me confirmas la dirección de entrega, por favor? 🙏' },
  { k:'ubicacion', t:'¿Me podrías enviar tu ubicación, por favor? Así el domiciliario llega más fácil ☺️🙏' },
  { k:'movil',     t:'¿Me confirmas el número de celular, por favor? 🙏' },

  /* PAGO */
  { k:'comopagas', t:'Con gusto. ¿El pago es en efectivo o por transferencia? ☺️' },
  { k:'concuanto', t:'¿Con cuánto vas a pagar? Así te llevamos el cambio 😀' },
  { k:'qr',        t:'Te comparto el código QR para que puedas realizar tu pago ☺️\n\nRecuerda enviarnos el comprobante 😁', img:'@qr' },
  { k:'comprobante', t:'Quedo pendiente del comprobante para poder prepararte el pedido ☺️' },

  /* TIEMPOS Y ESTADO
     Los minutos son un ejemplo: cada restaurante pone los suyos. */
  { k:'tiempo',    t:'Tu pedido tarda 30 minutos aproximadamente ☺️' },
  { k:'listo',     t:'¡Tu pedido ya está listo! Puedes pasar por él 😊' },
  { k:'llevar',    t:'Con mucho gusto. Apenas esté listo te aviso para que pases ☺️' },
  { k:'encamino',  t:'¡Tu pedido va en camino! 🛵' },

  /* SITUACIONES */
  { k:'saturado',  t:'¡Hola! 😎 En este momento estamos saturados y no podemos tomar más pedidos por ahora.\nEstamos trabajando para atenderte lo antes posible. ¡Gracias por tu paciencia! 😊' },
  { k:'cerrado',   t:'Por hoy ya terminamos nuestra jornada. Gracias por escribirnos, esperamos atenderte en una próxima oportunidad ☺️' },
  { k:'solomesa',  t:'Para consumir en el establecimiento, el pedido se toma directamente en el punto. Por WhatsApp recibimos solo domicilios y para recoger. ¡Te esperamos! ☺️' },

  /* CON DATOS DEL PEDIDO
     Lo que va entre llaves lo reemplaza el sistema con los datos reales.
     Antes estas dos eran "dinamicas" y su texto ni se leia: devolvian una
     frase escrita en el codigo. Ahora son plantillas normales, editables. */
  { k:'total',     t:'Con gusto, serían {total_productos} de tu pedido y {domicilio} del domicilio, total {total} 😊\nEn un momento lo enviamos.' },
  { k:'puntos',    t:'¡Acabas de ganar {puntos_ganados} puntos con tu compra! 🎉\nCuando vuelvas a pedir, recuerda dar tu número de celular para seguir acumulando y redimirlos en productos de {negocio}.' },
];

function qrEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function loadQuickReplies() {
  try {
    const { data } = await sb.from('ia_config').select('respuestas_rapidas').eq('branch_id', S.branchId).maybeSingle();
    let list = (data && Array.isArray(data.respuestas_rapidas)) ? data.respuestas_rapidas : [];
    if (!list.length) { list = DEFAULT_QUICK_REPLIES.slice(); await saveQuickReplies(list); }
    /* Las guardadas de antes traen dyn:'total' y un texto con $0 escrito a
       mano, porque ese texto nunca se usaba. Se cambian por la plantilla real
       una sola vez; si no, el dueño abre /total y ve ceros sin entender por que. */
    const viejas = list.filter(r => r && r.dyn);
    if (viejas.length) {
      list = list.map(r => {
        if (!r || !r.dyn) return r;
        const def = DEFAULT_QUICK_REPLIES.find(x => x.k === r.dyn);
        const n = Object.assign({}, r, { t: def ? def.t : r.t });
        delete n.dyn;
        return n;
      });
      await saveQuickReplies(list);
    }
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
    + '<span class="ci-qr-k">'+(r.img?'📷 ':'')+(r.loc?'📍 ':'')+(r.btn?'▭ ':'')+'/'+qrEsc(r.k)+'</span>'
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
  // Cualquier respuesta con variables se resuelve antes de pegarla. Ya no hay
  // lista de respuestas "especiales": lo que manda es lo que dice la plantilla.
  if (window.posVars && posVars.usadas(r.t).length) {
    resolverRR(r).then(function(t){ if(t!=null){ var el=document.getElementById('msgInput'); if(el){ el.value=t; el.focus(); } } });
    return;
  }
  if (r.btn) { sendQuickBotones(r); return; }   // respuestas con botones → se envían directo
  const inp = document.getElementById('msgInput');
  if (inp) { inp.value = r.t; inp.focus(); }
}

// Envía una respuesta rápida CON BOTONES (mensaje interactivo de WhatsApp).
// Se manda directo (no se pega en el compositor) porque los botones no son texto.
// En el hilo queda el texto con los botones listados, para que el operador vea
// exactamente lo que recibió el cliente.
async function sendQuickBotones(r) {
  if (!S.activeConvId || !r.btn) return;
  const conv = S.conversations.find(c => c.id === S.activeConvId);
  if (!conv || conv.channel !== 'whatsapp') {
    showToast('Los botones solo funcionan en WhatsApp', 'info');
    const inp = document.getElementById('msgInput');
    if (inp) { inp.value = r.t; inp.focus(); }     // se deja el texto para enviarlo a mano
    return;
  }
  // Fuera de la ventana de 24 h Meta no acepta mensajes libres (ni con botones).
  const w = waWindowInfo();
  if (w.applies && !w.open) { showToast('Pasaron 24 h: usa una plantilla', 'info'); return; }

  const etiquetas = (r.btn.tipo === 'url')
    ? [r.btn.texto_boton || 'Abrir']
    : (r.btn.opciones || []).map(o => o.titulo || o.texto).filter(Boolean);
  const cuerpo = r.t + (etiquetas.length ? '\n\n' + etiquetas.map(t => '▸ ' + t).join('\n') : '');

  const tmpId = 'tmp_' + Date.now();
  S.messages.push({ id: tmpId, conversation_id: S.activeConvId, tenant_id: S.tenantId,
    direction: 'out', body: cuerpo, delivery_status: 'sending', sent_at: new Date().toISOString() });
  renderThread();

  const { data, error } = await sb.from('chat_messages').insert([{
    conversation_id: S.activeConvId, tenant_id: S.tenantId, direction: 'out',
    body: cuerpo, delivery_status: 'sent', agent_id: S.user?.id || null, origen: 'humano',
  }]).select().single();
  if (error) { S.messages = S.messages.filter(m => m.id !== tmpId); renderThread(); showToast('No se pudo enviar', 'error'); return; }
  S.messages = S.messages.map(m => m.id === tmpId ? data : m);
  renderThread();
  if (conv) {
    conv.last_message = r.t; conv.last_message_at = data.sent_at; conv.last_sender = 'agent';
    S.conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvList();
  }
  try {
    const res = await fetch(META_SEND_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: S.activeConvId, text: r.t, botones: r.btn, message_id: data.id }),
    });
    const rd = await res.json();
    if (rd.error) showToast('WhatsApp no aceptó los botones: ' + rd.error, 'error');
  } catch (e) { showToast('Error al enviar: ' + e.message, 'error'); }
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
    body: bodyJson, media_type:'location', delivery_status:'sent', agent_id: S.user?.id || null, origen: 'humano',
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
  const { data, error }=await sb.from('chat_messages').insert([{ conversation_id:S.activeConvId, tenant_id:S.tenantId, direction:'out', body:caption, media_url:url, media_type:'image', delivery_status:'sent', agent_id:S.user?.id||null, origen:'humano' }]).select().single();
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
    /* Si el analisis no encontro productos, NO se corta: se abre el modal
       normal con la lista vacia para que el operador los agregue a mano.
       (Antes se mostraba un panel de diagnostico, y luego un mensaje de error
       que tampoco dejaba trabajar: en pleno servicio hay que poder seguir.)
       Solo se detiene si de verdad no vino nada de la funcion. */
    if(!draftOverride && !data.order){
      console.warn('[crear-pedido] sin order', { http: res.status, conv: S.activeConvId, raw: String(_raw).slice(0, 600) });
      cpSetBody('<div class="cp-error">No se pudo analizar la conversación. Intenta de nuevo.</div>');
      cpFooter(false); return;
    }
    if(!draftOverride && !((data.order.productos||[]).length)){
      console.warn('[crear-pedido] sin productos', { conv: S.activeConvId, raw: String(_raw).slice(0, 600) });
    }
    S.cpOrder = draftOverride || data.order;   // al EDITAR se usa el borrador guardado; el catálogo viene igual del análisis
    // Se guarda el precio que puso el SISTEMA para poder comparar después: si el
    // operador lo cambia, es que la tarifa de ese barrio ya no es esa.
    if (S.cpOrder && S.cpOrder.domi_precio_auto === undefined) {
      S.cpOrder.domi_precio_auto = Number(S.cpOrder.domi_precio) || 0;
    }
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

/* ETIQUETAS DEL PEDIDO (Espera / Avisar / Programado / A carro).
   Vienen de Configuración → Operación → Sección 4b, las mismas que usa venta
   rápida. Antes solo existían allá: creando el pedido desde el chat no había
   dónde escogerlas, justo en los pedidos para recoger, que es donde más sirven.
   No se muestran para pedidos de mesa (por WhatsApp no se toma mesa). */
function cpEtiquetas(){
  try{
    const cfg=JSON.parse(localStorage.getItem('pos.config.operacion.v1')||'{}');
    if(!cfg.etiquetasVRActivo) return [];
    return Array.isArray(cfg.etiquetasVR) ? cfg.etiquetasVR.filter(e=>e&&e.nombre) : [];
  }catch(e){ return []; }
}
/* ¿Hay que exigirla? 'no' nunca; 'recoger' solo cuando es para recoger;
   'siempre' también en domicilio. Si no hay etiquetas creadas no se exige
   nada: dejaría el pedido trancado sin forma de resolverlo. */
function cpExigeEtiqueta(tipo){
  if(tipo==='mesa') return false;
  if(!cpEtiquetas().length) return false;
  let ex='no';
  try{ ex=(JSON.parse(localStorage.getItem('pos.config.operacion.v1')||'{}').etiquetasVRExigir)||'no'; }catch(e){}
  if(ex==='siempre') return true;
  if(ex==='recoger') return tipo==='recoger';
  return false;
}
function cpEtiquetasHtml(o){
  const list=cpEtiquetas();
  if(!list.length || o.tipo==='mesa') return '';
  const req=cpExigeEtiqueta(o.tipo);
  const chips=list.map(e=>{
    const on=o.etiqueta===e.nombre;
    return '<button type="button" class="cp-etq'+(on?' on':'')+'" data-cpetq="'+cpEsc(e.nombre)+'" onclick="cpSetEtiqueta(this.dataset.cpetq)">'+cpEsc(e.nombre)+'</button>';
  }).join('');
  return '<div class="cp-f" id="cpEtqRow"><label>Etiqueta'
    +(req?' <span class="cp-etq-req">· obligatoria</span>':' <span class="cp-etq-opt">· opcional</span>')
    +'</label><div class="cp-etq-row">'+chips+'</div></div>';
}
function cpSetEtiqueta(v){
  if(!S.cpOrder) return;
  /* Se sincroniza lo escrito ANTES de repintar: sin esto, tocar una etiqueta
     borraba el nombre, la dirección y las notas que se acabaran de teclear. */
  cpSyncTop(); cpSyncProdInputs();
  S.cpOrder.etiqueta = (S.cpOrder.etiqueta===v) ? null : v;   // tocarla otra vez la quita
  cpRenderForm(S.cpOrder);
}

/* El supervisor relee el pedido armado contra lo que escribio el cliente. No
   cambia nada: avisa. Si no tiene nada que decir, no ocupa espacio. */
function cpRevisionHtml(o){
  const pr=((o.revision&&o.revision.problemas)||[]).filter(Boolean);
  if(!pr.length) return '';
  return '<div class="cp-revision"><b>Revisa este pedido antes de guardarlo</b>'
    +pr.map(t=>'<span>'+cpEsc(t)+'</span>').join('')+'</div>';
}
function cpRenderForm(o){
  const tipos=['domicilio','recoger','mesa'];
  const prods=(o.productos||[]).map((p,i)=>cpProdRow(p,i)).join('');
  const addProd=(S.cpCatalogo&&S.cpCatalogo.length)
    ? '<button type="button" class="cp-addprod-btn" onclick="cpOpenPicker()">＋ Agregar producto</button>' : '';
  const html=
    '<div class="cp-grid">'
    // Si el teléfono ya está en la base, el nombre llega puesto y se avisa que
    // es un cliente conocido (el teléfono es la llave: ahí viven sus datos).
    +'<div class="cp-f"><label>Nombre del cliente'
      +(o.cliente_conocido?' <span class="cp-cli-ok">✓ cliente registrado</span>':'')
      +'</label><input id="cpNombre" value="'+cpEsc(o.cliente||'')+'"></div>'
    +'<div class="cp-f"><label>Teléfono</label><input id="cpTelefono" value="'+cpEsc(o.telefono||'')+'"></div>'
    +'<div class="cp-f"><label>Tipo</label><select id="cpTipo" onchange="cpRerender()">'+tipos.map(t=>'<option value="'+t+'"'+(o.tipo===t?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'
    +'<div class="cp-f"><label>Método de pago</label><input id="cpPago" value="'+cpEsc(o.pago||'')+'"></div>'
    +'</div>'
    +(o.tipo!=='mesa'?'<div class="cp-grid"><div class="cp-f"><label>Dirección</label><input id="cpDireccion" value="'+cpEsc(o.direccion||'')+'"></div><div class="cp-f"><label>Barrio</label><input id="cpBarrio" value="'+cpEsc(o.barrio||'')+'"></div></div>':'')
    // Direcciones que este cliente ya ha usado (casa, oficina...). Un toque las pone.
    +cpDirsSelect(o)
    // Lo que vio el AGENTE SUPERVISOR. Va aqui, arriba del pedido y una sola
    // vez, no repetido en cada linea: es una opinion sobre el pedido entero.
    +cpRevisionHtml(o)
    +'<div class="cp-prods-hd">Productos</div>'
    +'<div id="cpProds">'+(prods||'<div class="cp-empty">Sin productos. Agrégalos abajo.</div>')+'</div>'
    +(addProd?'<div class="cp-addrow">'+addProd+'</div>':'')
    +'<div class="cp-f"><label>Notas generales</label><textarea id="cpNotas" rows="2">'+cpEsc(o.notas||'')+'</textarea></div>'
    +cpEtiquetasHtml(o)
    // El valor del domicilio se llena solo desde la tabla de zonas (Configuración →
    // Chat IA → Domicilios). Si el barrio no está en la tabla, se deja en 0 y se
    // avisa, en vez de inventar una tarifa.
    +(o.tipo==='domicilio'
      ? '<div class="cp-f cp-domi"><label>💵 Valor del domicilio</label>'
        +'<input id="cpDomi" type="number" min="0" value="'+(Number(o.domi_precio)||0)+'" oninput="cpUpdTotal()">'
        +(!cpBarrioCuadra(o)
            ? '<div class="cp-domi-warn">⚠ Esta tarifa es de <b>'+cpEsc(o.domi_barrio)+'</b>, no de <b>'+cpEsc(o.barrio)+'</b>. Revisa el valor.</div>'
          : o.domi_barrio
            ? '<div class="cp-domi-ok">✓ '+cpEsc(o.domi_barrio)+' — tarifa de tu tabla de zonas</div>'
            : (o.domi_confirmar ? '<div class="cp-domi-warn">⚠ No reconocí el barrio en tu tabla de zonas. Escribe el valor.</div>' : ''))
        +'</div>'
      : '')
    +(cpEmpaque()>0?'<div class="cp-emp">Empaque <b>'+cpCOP(cpEmpaque())+'</b></div>':'')
    +'<div class="cp-total">Total del pedido: <b id="cpTotal">'+cpCOP(cpOrderTotal())+'</b></div>';
  cpSetBody(html);
}
/* Guarda el barrio que se cobró A MANO porque no estaba en la tabla de zonas.
   No agrega nada a la tabla por su cuenta: lo deja pendiente para que en
   Configuración → Chat IA → Domicilios se apruebe con un clic. Si el mismo
   barrio se repite, sube el contador y se queda con el último precio cobrado. */
async function aprenderBarrio(o){
  try{
    if(!o || o.tipo!=='domicilio') return;
    const precio = Number(o.domi_precio)||0;
    if(precio<=0) return;
    const auto = Number(o.domi_precio_auto)||0;
    let barrio, tipo, precioTabla = null;
    if(o.domi_barrio){
      // El barrio SÍ estaba en la tabla. Solo interesa si se cobró distinto:
      // eso significa que la tarifa de esa zona cambió.
      if(precio === auto) return;
      barrio = String(o.domi_barrio); tipo = 'cambio'; precioTabla = auto;
    } else {
      // Barrio que la tabla no conoce.
      barrio = String(o.barrio||'').trim(); tipo = 'nuevo';
      if(!barrio || barrio.length<3) return;
    }
    const prev = await sb.from('pos_domi_aprendidos').select('id,veces')
      .eq('branch_id', o.branch_id).ilike('barrio', barrio).maybeSingle();
    if(prev.data && prev.data.id){
      await sb.from('pos_domi_aprendidos')
        .update({ precio, tipo, precio_tabla:precioTabla, veces:(Number(prev.data.veces)||1)+1, updated_at:new Date().toISOString() })
        .eq('id', prev.data.id);
    } else {
      await sb.from('pos_domi_aprendidos').insert([{
        tenant_id:o.tenant_id||null, branch_id:o.branch_id,
        barrio, precio, tipo, precio_tabla:precioTabla,
        direccion:String(o.direccion||'').slice(0,200),
      }]);
    }
  }catch(e){ console.warn('aprenderBarrio:', e && e.message); }
}

// Las direcciones guardadas del cliente, en formato parejo {dir, barrio}.
// (Antes eran texto suelto; hoy cada una carga su barrio.)
function cpDirsNorm(o){
  return ((o && o.direcciones_guardadas) || []).map(function(d){
    if (d && typeof d === 'object') return { dir: String(d.dir||''), barrio: String(d.barrio||'') };
    return { dir: String(d||''), barrio: '' };
  }).filter(function(d){ return d.dir.trim(); });
}
// Desplegable de sus direcciones. La direccion y el barrio van SIEMPRE juntos:
// usar una direccion con el barrio de otra cobraria mal el domicilio.
function cpDirsSelect(o){
  if (o.tipo === 'mesa') return '';
  const dirs = cpDirsNorm(o);
  if (!dirs.length) return '';
  const act = String(o.direccion||'').trim().toLowerCase();
  return '<div class="cp-f cp-dirsel"><label>Sus direcciones guardadas</label>'
    + '<select id="cpDirSel" onchange="cpUsarDir(this)">'
    +   dirs.map(function(d,i){
          const sel = d.dir.trim().toLowerCase() === act ? ' selected' : '';
          const txt = d.dir + (d.barrio ? '  ·  ' + d.barrio : '  ·  sin barrio');
          return '<option value="'+i+'"'+sel+'>'+cpEsc(txt)+'</option>';
        }).join('')
    +   '<option value="nueva"'+(dirs.some(function(d){ return d.dir.trim().toLowerCase()===act; })?'':' selected')+'>✎ Otra dirección…</option>'
    + '</select></div>';
}
// Pone la direccion elegida Y su barrio. Nunca uno sin el otro.
function cpUsarDir(sel){
  if (!sel || !S.cpOrder) return;
  const dirEl = document.getElementById('cpDireccion');
  const barEl = document.getElementById('cpBarrio');
  if (sel.value === 'nueva'){
    if (dirEl){ dirEl.value=''; dirEl.focus(); }
    if (barEl) barEl.value='';
    cpSyncTop();
    return;
  }
  const d = cpDirsNorm(S.cpOrder)[+sel.value];
  if (!d) return;
  if (dirEl) dirEl.value = d.dir;
  if (barEl) barEl.value = d.barrio;
  cpSyncTop();
  // El domicilio se tarifo con el barrio del pedido. Si se cambia a una
  // direccion de OTRO barrio, la tarifa ya no corresponde: hay que avisar en
  // vez de cobrar callados un valor que no es.
  cpRerender();
}
// ¿La tarifa que trae el pedido corresponde al barrio que esta puesto ahora?
function cpBarrioCuadra(o){
  const a = String(o.domi_barrio||'').trim().toLowerCase();
  const b = String(o.barrio||'').trim().toLowerCase();
  return !a || !b || a === b;
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
    // Avisos de lo que el sistema NO pudo resolver solo. Se muestran para que
    // el operador confirme, en vez de guardar algo adivinado.
    +(function(){
      const av=[];
      if(p.categoria_confirmar) av.push('Puede ser '+cpEsc((p.categoria_opciones||[]).join(' o '))+' — confirma cuál');
      if(p.tamano_confirmar)    av.push('Falta el tamaño — confirma cuál pidió');
      if(p.precio_confirmar)    av.push('Revisa el precio: el cliente no dijo la variedad');
      (cpVarsFaltan(p)||[]).forEach(vg=>av.push('Falta '+cpEsc(vg.name)+' — elígelo abajo'));
      if(!av.length) return '';
      return '<div class="cp-check">'+av.map(t=>'<span>⚠ '+t+'</span>').join('')+'</div>';
    })()
    // Selector para las variantes que faltan. Se resuelve aquí mismo: antes
    // tocaba borrar el producto y volver a agregarlo desde el catálogo.
    +(function(){
      const faltan=cpVarsFaltan(p);
      if(!faltan.length) return '';
      return '<div class="cp-prod-actions">'+faltan.map(vg=>
        '<select class="cp-addadic" onchange="cpSetVar('+i+',\''+vg.id+'\',this.value)">'
        +'<option value="">'+cpEsc(vg.name)+'…</option>'
        +(vg.options||[]).map(o=>'<option value="'+o.id+'">'+cpEsc(o.name)+(Number(o.price)?' (+'+cpCOP(o.price)+')':'')+'</option>').join('')
        +'</select>').join('')+'</div>';
    })()
    +(chips?'<div class="cp-chips">'+chips+'</div>':'')
    +(picker?'<div class="cp-prod-actions">'+picker+'</div>':'')
    +'<input class="cp-pnota" placeholder="Nota (ej. sin cebolla)" value="'+cpEsc(p.notas||'')+'" oninput="cpNoteInput('+i+',this.value)">'
  +'</div>';
}
function cpAdicOptions(c,presId){ const out=[],seen={}; const gids=c.mod_group_ids||[]; const pres=c.mod_group_pres||{};
  gids.forEach(gid=>{ if(pres[gid]&&presId&&pres[gid].indexOf(presId)<0) return; const g=(S.cpMods||[]).find(m=>String(m.id)===String(gid)); ((g&&g.options)||[]).forEach(o=>{ const k=cpNorm(o.name); if(!seen[k]){ seen[k]=1; out.push({id:o.id,name:o.name,price:Number(o.price)||0}); } }); }); return out; }
function cpAddAdic(i,optId){ if(!optId||!S.cpOrder) return; const p=S.cpOrder.productos[i]; if(!p) return; const opt=(p.adic_options||[]).find(o=>o.id===optId); if(opt&&!(p.adiciones||[]).some(a=>a.id===optId)){ p.adiciones=p.adiciones||[]; p.adiciones.push({id:opt.id,name:opt.name,price:opt.price}); } cpRerender(); }
function cpDelAdic(i,optId){ const p=S.cpOrder&&S.cpOrder.productos[i]; if(!p) return; p.adiciones=(p.adiciones||[]).filter(a=>a.id!==optId); cpRerender(); }
/* Grupos de variantes que le FALTAN a un producto.
   En el catálogo un grupo de variantes no tiene marca de "opcional": existe
   porque hay que elegir algo (Sabor, Primer Ingrediente…). Así que todos los
   grupos deben quedar resueltos.
   Sin esto se podía crear "1× HIT" sin sabor: el pedido salía y el inventario
   no sabía qué unidad descontar. */
function cpVarsFaltan(p){
  if(!p) return [];
  const c=(S.cpCatalogo||[]).find(x=>String(x.id)===String(p.product_id));
  if(!c) return [];
  const sel=p.variantes||{};
  return (c.variables||[]).filter(vg=>(vg.options||[]).length && !sel[vg.id]);
}
/* Elegir una variante desde el modal, sin tener que borrar y volver a agregar. */
function cpSetVar(i,gid,optId){
  if(!optId||!S.cpOrder) return;
  const p=S.cpOrder.productos[i]; if(!p) return;
  const c=(S.cpCatalogo||[]).find(x=>String(x.id)===String(p.product_id)); if(!c) return;
  const vg=(c.variables||[]).find(g=>String(g.id)===String(gid)); if(!vg) return;
  const o=(vg.options||[]).find(x=>String(x.id)===String(optId)); if(!o) return;
  cpSyncTop(); cpSyncProdInputs();
  p.variantes=p.variantes||{};
  p.variantes[gid]={ id:o.id, name:o.name, price:Number(o.price)||0, group:vg.name };
  /* El precio se recalcula con TODAS las variantes elegidas: en modo matriz el
     precio vive en la opción, no en el producto. */
  const sel={}; Object.keys(p.variantes).forEach(k=>{ sel[k]=p.variantes[k].id; });
  const np=cpProdPrice(c,p.pres_id,sel);
  if(np>0){ p.unit_price=np; p.precio_confirmar=false; }
  const nm=String(p.product_name||'');
  if(nm.indexOf(o.name)<0) p.product_name=nm+' · '+o.name;
  cpRerender();
}
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
// Ícono de fueguito (mismo que usa la pantalla de Ventas) para "Enviar a cocina".
const CP_FUEGO_SVG='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
function renderDraftBar(borrador){
  const bar=document.getElementById('cpDraftBar'); if(!bar) return;
  if(!borrador || !(borrador.productos||[]).length){ bar.style.display='none'; bar.innerHTML=''; return; }
  const prods=borrador.productos||[];
  const subtotal=prods.reduce((a,p)=>a+(Number(p.unit_price)||0)*(Number(p.cantidad)||1),0);
  const empaque=Number(borrador.empaque)||0;
  const domi=(borrador.tipo==='domicilio')?(Number(borrador.domi_precio)||0):0;
  const total=Number(borrador.total)||(subtotal+empaque+domi);
  const tipoLbl=borrador.tipo==='domicilio'?'Domicilio':((borrador.tipo==='recoger'||borrador.tipo==='rapido')?'Para llevar':'Pedido');
  let lis=prods.map(p=>{ const q=Number(p.cantidad)||1, pr=(Number(p.unit_price)||0)*q;
    return '<div class="cp-oli"><span class="cp-q">'+q+'×</span><span class="cp-oname">'+cpEsc(p.product_name||'Producto')+'</span><span class="cp-op">'+cpCOP(pr)+'</span></div>'; }).join('');
  if(empaque>0) lis+='<div class="cp-oli"><span class="cp-q"></span><span class="cp-oname">Empaque</span><span class="cp-op">'+cpCOP(empaque)+'</span></div>';
  if(domi>0)    lis+='<div class="cp-oli"><span class="cp-q"></span><span class="cp-oname">Domicilio</span><span class="cp-op">'+cpCOP(domi)+'</span></div>';
  const col = S._draftCollapsed ? ' collapsed' : '';
  bar.innerHTML='<div class="cp-ocard'+col+'">'
    +'<div class="cp-ohd"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9B85FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg><b>Pedido sin enviar · '+cpEsc(tipoLbl)+'</b>'
      +'<div class="cp-ohd-right"><span class="cp-ohd-tot">'+cpCOP(total)+'</span><span class="cp-ost">Borrador</span>'
      +'<button class="cp-ocol" onclick="toggleDraftCollapse()" title="Contraer / expandir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button></div></div>'
    +'<div class="cp-obody">'+lis+'<div class="cp-otot">Total <span class="cp-op">'+cpCOP(total)+'</span></div></div>'
    +'<div class="cp-draft-btns"><button class="cp-draft-discard" onclick="cpDescartarBorrador()" title="Descartar este pedido (el cliente se arrepintió)">🗑️ Descartar</button><button class="cp-draft-edit" onclick="cpEditarBorrador()">✏️ Editar</button><button class="cp-draft-send" id="cpDraftSend" onclick="cpEnviarCocina()">'+CP_FUEGO_SVG+'Enviar a cocina</button></div>'
    +'</div>';
  bar.style.display='block';
}
function toggleDraftCollapse(){
  S._draftCollapsed = !S._draftCollapsed;
  const card = document.querySelector('#cpDraftBar .cp-ocard');
  if(card) card.classList.toggle('collapsed', S._draftCollapsed);
}
// Descartar el borrador (el cliente se arrepintió). Solo aplica al borrador —
// NO toca pedidos ya creados (esos se anulan desde Ventas). Pide confirmación.
function cpDescartarBorrador(){
  const row=document.querySelector('#cpDraftBar .cp-draft-btns'); if(!row) return;
  row.innerHTML='<span class="cp-draft-confirm">¿Descartar el pedido?</span>'
    +'<button class="cp-draft-edit" onclick="loadDraftBar(S.activeConvId)">No</button>'
    +'<button class="cp-draft-discard-yes" onclick="cpDescartarConfirmar()">Sí, descartar</button>';
}
async function cpDescartarConfirmar(){
  const convId=S.activeConvId;
  try{
    const { error }=await sb.from('chat_conversations').update({ pedido_borrador: null }).eq('id', convId);
    if(error){ showToast('No se pudo descartar: '+error.message,'error'); return; }
    renderDraftBar(null);
    showToast('Pedido descartado','success');
  }catch(e){ showToast('No se pudo descartar el pedido','error'); }
}
/* La tarjeta NO desaparece al enviar a cocina.
   Sergio: "en el chat quiero que la tarjeta del pedido no desaparezca hasta que
   el pedido se haya entregado". Antes, al enviarlo, se borraba el borrador y la
   tarjeta se iba: el operador perdia de vista el pedido dentro del chat.
   Ahora hay dos caras de la misma tarjeta:
     · hay borrador            -> Descartar / Editar / Enviar a cocina (como siempre)
     · ya se envio, sin entregar -> estado, total, tiempo y el siguiente paso
     · entregado o anulado     -> ahi si desaparece  */
async function loadDraftBar(convId){
  try{
    const { data }=await sb.from('chat_conversations')
      .select('pedido_borrador,order_id').eq('id', convId).maybeSingle();
    if(data && data.pedido_borrador && (data.pedido_borrador.productos||[]).length){
      renderDraftBar(data.pedido_borrador); return;
    }
    if(data && data.order_id){ await renderPedidoEnviado(data.order_id, convId); return; }
    renderDraftBar(null);
  }catch(e){ renderDraftBar(null); }
}

const CP_Q = String.fromCharCode(39);   // comilla simple, para el onclick
// Siguiente paso segun el canal (mismo recorrido que la pastilla de estado).
function cpSiguienteEstado(canal, actual){
  const flow=CI_ESTADO_FLOW[canal]||CI_ESTADO_FLOW.rapido;
  const i=flow.indexOf(actual);
  return (i>=0 && i<flow.length-1) ? flow[i+1] : null;
}
function cpFmtDesde(iso){
  if(!iso) return '';
  const m=Math.max(0, Math.round((Date.now()-new Date(iso).getTime())/60000));
  return m<60 ? (m+'m aqui') : (Math.floor(m/60)+'h '+(m%60)+'m aqui');
}

async function renderPedidoEnviado(orderId, convId){
  const bar=document.getElementById('cpDraftBar'); if(!bar) return;
  let o=null, items=[];
  try{
    const r=await sb.from('pos_orders')
      .select('id,total,channel,estado,estado_at,status,delivery_fee,packaging_fee,subtotal')
      .eq('id', orderId).maybeSingle();
    o=r.data;
    if(o){
      const ri=await sb.from('pos_order_items')
        .select('product_name,quantity,unit_price').eq('order_id', orderId);
      items=ri.data||[];
    }
  }catch(e){ /* si no se puede leer, no se inventa una tarjeta */ }

  // Entregado o anulado -> la tarjeta desaparece, que es justo lo pedido.
  if(!o || o.status==='cancelled' || o.estado==='entregado'){
    bar.style.display='none'; bar.innerHTML=''; return;
  }

  const canal=(String(o.channel||'').toLowerCase()==='domicilio')?'domicilio':'rapido';
  const meta=CI_ESTADOS[o.estado]||CI_ESTADOS.en_preparacion;
  const total=Number(o.total)||0;
  const sig=cpSiguienteEstado(canal, o.estado||'en_preparacion');
  const sigMeta=sig?CI_ESTADOS[sig]:null;
  const tiempo=cpFmtDesde(o.estado_at);

  let lis=items.map(function(p){
    const q=Number(p.quantity)||1, pr=(Number(p.unit_price)||0)*q;
    return '<div class="cp-oli"><span class="cp-q">'+q+'×</span><span class="cp-oname">'
      +cpEsc(p.product_name||'Producto')+'</span><span class="cp-op">'+cpCOP(pr)+'</span></div>';
  }).join('');
  const emp=Number(o.packaging_fee)||0, dom=Number(o.delivery_fee)||0;
  if(emp>0) lis+='<div class="cp-oli"><span class="cp-q"></span><span class="cp-oname">Empaque</span><span class="cp-op">'+cpCOP(emp)+'</span></div>';
  if(dom>0) lis+='<div class="cp-oli"><span class="cp-q"></span><span class="cp-oname">Domicilio</span><span class="cp-op">'+cpCOP(dom)+'</span></div>';

  const col=S._draftCollapsed?' collapsed':'';
  bar.innerHTML='<div class="cp-ocard'+col+'">'
    +'<div class="cp-ohd"><span style="color:'+meta.color+';display:inline-flex">'+meta.ico+'</span>'
      +'<b>Pedido enviado · '+(canal==='domicilio'?'Domicilio':'Para llevar')+'</b>'
      +'<div class="cp-ohd-right"><span class="cp-ohd-tot">'+cpCOP(total)+'</span>'
      +'<span class="cp-ost" style="color:'+meta.color+';background:'+meta.bg+'">'+meta.label+'</span>'
      +'<button class="cp-ocol" onclick="toggleDraftCollapse()" title="Contraer / expandir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button></div></div>'
    +'<div class="cp-obody">'+lis
      +'<div class="cp-otot">Total <span class="cp-op">'+cpCOP(total)+'</span></div>'
      +(tiempo?'<div style="color:#94A3B8;font-size:11.5px;margin-top:4px">'+tiempo+'</div>':'')
    +'</div>'
    +'<div class="cp-draft-btns">'
      +(sigMeta
        ? '<button class="cp-draft-send" onclick="cpAvanzarPedido(' + CP_Q + sig + CP_Q + ')">'+sigMeta.ico+' '+sigMeta.label+'</button>'
        : '')
    +'</div>'
    +'</div>';
  bar.style.display='block';
  S._pedidoEnviadoId=orderId;
}

// Avanza el estado desde la tarjeta. Reutiliza `cambiarEstado`, que es el unico
// camino que escribe estado + delivery_status y avisa al cliente: asi la
// tarjeta, la pastilla de arriba y la pantalla de Ventas dicen lo mismo.
async function cpAvanzarPedido(nuevo){
  if(!S.estadoOrder && S._pedidoEnviadoId){
    try{ const c=getActiveConv(); if(c) await loadEstadoPill(c); }catch(e){}
  }
  await cambiarEstado(nuevo);
  try{ if(S.activeConvId) await loadDraftBar(S.activeConvId); }catch(e){}
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
  /* La etiqueta es lo que le dice a la cocina qué hacer con el pedido. Si el
     dueño la puso como obligatoria, no se envía sin ella. Se comprueba aquí y
     no solo en el formulario porque el borrador se puede enviar desde la
     tarjeta del chat sin volver a abrir el modal. */
  if(cpExigeEtiqueta(o.tipo) && !o.etiqueta){
    showToast('Falta la etiqueta: ábrelo en Editar y escoge una','error');
    return;
  }
  /* Un pedido NO sale sin sus variantes completas. Si el cliente escribió "un
     HIT personal" sin decir el sabor, el producto salía sin variante y el
     inventario no sabía qué unidad descontar. Se comprueba aquí y no solo en el
     formulario porque el borrador se puede enviar desde la tarjeta del chat sin
     volver a abrir el modal. */
  {
    const _falta=(o.productos||[]).map(p=>({ p:p, f:cpVarsFaltan(p) })).filter(x=>x.f.length)[0];
    if(_falta){
      showToast('Falta '+_falta.f[0].name+' en "'+(_falta.p.product_name||'un producto')+'": ábrelo en Editar','error');
      return;
    }
  }
  // ── LISTA NEGRA: si el cliente del pedido está bloqueado (teléfono o dirección), avisar y confirmar ──
  try{
    const _tel=o.telefono||'', _dir=o.direccion||'';
    if(_tel || _dir){
      const { data:casc }=await sb.rpc('lista_negra_cascada', { p_tenant:S.tenantId, p_tel:_tel||null, p_dir:_dir||null, p_dir_norm:_dir?normDir(_dir):null });
      if(casc && casc.bloqueado){
        const quien = casc.nombre ? ' <b>'+escHtml(casc.nombre)+'</b>' : '';
        const razon = casc.razon ? '<div style="font-size:12.5px;color:#64748B;margin-top:6px">'+escHtml(casc.razon)+'</div>' : '';
        const ok = await ciConfirm('🚫 Este cliente está en <b>lista negra</b>'+quien+'.'+razon+'<div style="margin-top:8px">¿Enviar el pedido a cocina de todas formas?</div>');
        if(!ok) return;
        if(casc.motivo==='direccion' && casc.sugerir_agregar_telefono){
          const add = await ciConfirm('Esta dirección ya estaba bloqueada. ¿Agregar también el número <b>'+escHtml(casc.telefono_sugerido||_tel)+'</b> a'+quien+'? (mismo cliente evadiendo con otro número)');
          if(add){ try{ await sb.rpc('lista_negra_agregar', { p_tenant:S.tenantId, p_nombre:null, p_razon:null, p_tel:_tel, p_dir:null, p_dir_norm:null, p_auto:true }); showToast('Número agregado a lista negra','success'); }catch(_e){} }
        }
      }
    }
  }catch(_e){}
  const payload={ conversation_id:convId, branch_id:o.branch_id, tenant_id:o.tenant_id, cliente:o.cliente, telefono:o.telefono, direccion:o.direccion||'', barrio:o.barrio||'', tipo:o.tipo, pago:o.pago, notas:o.notas, etiqueta:o.etiqueta||'', domi_precio:(o.tipo==='domicilio'?(Number(o.domi_precio)||0):0), empaque:Number(o.empaque)||0,
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
    // APRENDER: si el barrio no estaba en la tabla de zonas y se cobró el
    // domicilio a mano, se guarda para poder agregarlo después con un clic
    // (Configuración → Chat IA → Domicilios). Así el sistema mejora solo.
    aprenderBarrio(o);
    /* El nombre del cliente sale del cruce por teléfono con pos_clientes, y ese
       mapa solo se carga al abrir la pantalla. Si el pedido acaba de crear al
       cliente, la conversación seguía diciendo el número pelado hasta recargar.
       Se vuelve a bajar el mapa y se repinta: la lista y la cabecera del chat.
       (NO se toca chat_conversations.contact_name: ese es el nombre del perfil
       de WhatsApp y lo maneja Meta.) */
    try {
      await loadClientes();
      renderConvList();
      var _c = getActiveConv();
      if (_c) renderChatHeader(_c);
    } catch (_e) { /* si falla, solo se ve el número hasta recargar */ }
    // La tarjeta no se va: pasa a mostrar el pedido ya enviado y su estado.
    try{ if(data.orderId) await renderPedidoEnviado(data.orderId, convId); else renderDraftBar(null); }
    catch(_e){ renderDraftBar(null); }
    // El pedido ya existe (data.orderId) → mostrar la pastilla de estado "En preparación"
    // de inmediato, sin esperar a reabrir el chat.
    try{ const _c=getActiveConv(); if(_c && convId===S.activeConvId){ _c.order_id=data.orderId; loadEstadoPill(_c); } }catch(_e){}
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
    var b2=document.getElementById('cpDraftSend'); if(b2){ b2.disabled=false; b2.innerHTML=CP_FUEGO_SVG+'Enviar a cocina'; }
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
  var cont=document.getElementById('etqAssignList');
  if(!cont) return;

  /* MODO LOTE: no hay un "tiene / no tiene" único porque son varios chats, así
     que en vez de una casilla se ofrecen las dos acciones explícitas. Al lado
     de cada etiqueta se dice en cuántos de los seleccionados ya está. */
  if(S._etqBulk){
    var ids=S.selIds||[];
    cont.innerHTML=(S.etiquetas||[]).map(function(e){
      var n=0;
      ids.forEach(function(cid){
        var c=S.conversations.find(function(x){ return x.id===cid; });
        if(c && Array.isArray(c.labels) && c.labels.indexOf(e.id)>=0) n++;
      });
      return '<div class="etq-assign-item" style="cursor:default">'
        +'<span class="ci-lbl-dot" style="background:'+e.color+'"></span>'
        +'<span style="flex:1;text-align:left">'+qrEsc(e.name)
        +(n?'<span style="opacity:.6;font-size:11.5px;font-weight:600"> · en '+n+'</span>':'')+'</span>'
        +'<button class="cp-btn" style="padding:3px 10px;font-size:11.5px;font-weight:700;margin-right:6px" onclick="etiquetaLote(\''+e.id+'\',false)">Poner</button>'
        +'<button class="cp-btn ghost" style="padding:3px 10px;font-size:11.5px;font-weight:700" onclick="etiquetaLote(\''+e.id+'\',true)">Quitar</button>'
        +'</div>';
    }).join('');
    return;
  }

  var has=Array.isArray(S._etqLabels)?S._etqLabels:[];
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
function closeEtqAssign(){
  document.getElementById('etqAssignModal').style.display='none';
  S._etqBulk=false;
  var t=document.getElementById('etqAssignTitle'); if(t) t.textContent='🏷️ Etiquetar chat';
}

/* ══════════════ ETIQUETAR VARIOS CHATS A LA VEZ ══════════════
   Antes tocaba abrir chat por chat y etiquetarlo uno por uno. En un servicio
   con 20 pedidos eso son 20 aperturas. Aquí se marcan varios y se pone o se
   quita la etiqueta a todos de una. */
S.selMode = false;
S.selIds  = [];

function entrarSelMode(){
  if(!(S.etiquetas||[]).length){ showToast('Primero crea una etiqueta','info'); openCrearEtiqueta(); return; }
  S.selMode = true; S.selIds = [];
  renderConvList();
}
function salirSelMode(){
  S.selMode = false; S.selIds = [];
  renderConvList();
}
function toggleSelConv(id){
  if(!id) return;
  S.selIds = S.selIds || [];
  const i = S.selIds.indexOf(id);
  if(i>=0) S.selIds.splice(i,1); else S.selIds.push(id);
  renderConvList();
}
function selTodos(){
  const vis = S._listaVisible || [];
  /* El botón hace las dos cosas: si ya están todos marcados, los desmarca. */
  S.selIds = (S.selIds && S.selIds.length === vis.length) ? [] : vis.slice();
  renderConvList();
}
function renderSelBar(){
  const bar = document.getElementById('selBar');
  const btn = document.getElementById('selModeBtn');
  if(!bar) return;
  bar.style.display = S.selMode ? 'flex' : 'none';
  if(btn) btn.classList.toggle('active', !!S.selMode);
  const n = (S.selIds||[]).length;
  const cnt = document.getElementById('selCount');
  if(cnt) cnt.textContent = n === 1 ? '1 seleccionado' : n + ' seleccionados';
  const todos = document.getElementById('selAllBtn');
  if(todos) todos.textContent = (n && n === (S._listaVisible||[]).length) ? 'Ninguno' : 'Todos';
}
function openEtiquetarLote(){
  if(!(S.selIds||[]).length){ showToast('No has seleccionado ningún chat','info'); return; }
  if(!(S.etiquetas||[]).length){ showToast('Primero crea una etiqueta','info'); openCrearEtiqueta(); return; }
  S._etqBulk = true;
  const t=document.getElementById('etqAssignTitle');
  if(t) t.textContent = '🏷️ Etiquetar ' + S.selIds.length + ' chat' + (S.selIds.length===1?'':'s');
  renderEtqAssign();
  document.getElementById('etqAssignModal').style.display='flex';
}
/* Pone o quita UNA etiqueta en todos los seleccionados.
   Se hace chat por chat porque cada uno tiene sus otras etiquetas y no se
   pueden pisar: se lee su lista, se cambia solo esta y se guarda. */
async function etiquetaLote(labelId, quitar){
  const ids = (S.selIds||[]).slice();
  if(!ids.length) return;
  let ok = 0, fallo = 0;
  for(const cid of ids){
    let actuales = [];
    const conv = S.conversations.find(c => c.id === cid);
    if(conv && Array.isArray(conv.labels)) actuales = conv.labels.slice();
    else {
      try{ const r = await sb.from('chat_conversations').select('labels').eq('id',cid).maybeSingle();
           actuales = (r.data && Array.isArray(r.data.labels)) ? r.data.labels : []; }catch(e){ actuales = []; }
    }
    const tiene = actuales.indexOf(labelId) >= 0;
    if(quitar && !tiene){ ok++; continue; }
    if(!quitar && tiene){ ok++; continue; }
    const nuevas = quitar ? actuales.filter(x => x !== labelId) : actuales.concat([labelId]);
    const upd = await sb.from('chat_conversations').update({ labels: nuevas }).eq('id', cid).select('id');
    /* Igual que en el etiquetado de a uno: 0 filas es un fallo silencioso. */
    if(upd.error || !upd.data || !upd.data.length){ fallo++; continue; }
    if(conv) conv.labels = nuevas;
    ok++;
  }
  const etq = (S.etiquetas||[]).find(e => e.id === labelId);
  const nom = etq ? etq.name : 'la etiqueta';
  if(fallo) showToast('Se aplicó a ' + ok + ', fallaron ' + fallo, 'error');
  else showToast((quitar ? 'Quitada "' : 'Puesta "') + nom + '" en ' + ok + ' chat' + (ok===1?'':'s'), 'success');
  renderEtqAssign();
  renderConvList();
  if(S.activeView && S.activeView.slice(0,6)==='label:') loadConversations();
}

/* ══ Respuestas con VARIABLES ═══════════════════════════════════════════════
   Antes esto eran dos frases escritas aqui adentro: /total y /puntos. El texto
   que el dueño guardaba se IGNORABA, y por eso solo podian existir esas dos.
   Ahora la plantilla manda: se leen las variables que usa, se buscan sus
   valores de verdad y se arma el mensaje. El dueño puede escribir las que
   quiera sin que nadie toque el codigo.

   Los valores del pedido salen del BORRADOR sin enviar (lo que el cliente
   todavia va a confirmar); si ya se envio a cocina, del pedido creado. ══ */
async function datosPlantilla(claves) {
  const d = {}, cid = S.activeConvId;
  const necesita = (k) => claves.indexOf(k) >= 0;

  // ── Negocio: solo se consulta si la plantilla lo pide ──
  if (necesita('negocio') || necesita('direccion') || necesita('tiempo_entrega')) {
    try {
      const { data:b } = await sb.from('branches').select('name,address,operacion_config,brands(name)')
        .eq('id', S.branchId).maybeSingle();
      if (b) {
        /* El nombre que ve el CLIENTE es el de la marca, no el de la sucursal.
           Aqui se leia b.name, que es "Principal": el aviso de puntos salia
           diciendo "redimirlos en productos de Principal". La sucursal es un
           nombre interno. Mismo criterio que pos-print.js (brand_name || name),
           y si un negocio no tiene marca se cae al nombre de la sucursal. */
        const mk = b.brands;
        d.negocio = (Array.isArray(mk) ? (mk[0] || {}).name : (mk || {}).name) || b.name || '';
        d.direccion = b.address || '';
        const oc = b.operacion_config || {};
        if (oc.tiempo_entrega) d.tiempo_entrega = oc.tiempo_entrega;
      }
    } catch (e) {}
  }
  if (necesita('horario_hoy')) {
    try {
      const { data:ic } = await sb.from('ia_config').select('horarios').eq('branch_id', S.branchId).maybeSingle();
      const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
      const h = (ic && ic.horarios || {})[dias[new Date().getDay()]];
      /* Si hoy no se atiende se dice, en vez de dejar el hueco vacio: un
         mensaje que dice "Hoy atendemos de  a " es peor que no mandarlo. */
      d.horario_hoy = (h && h.activo) ? (h.abre + ' a ' + h.cierra) : 'hoy no hay servicio';
    } catch (e) {}
  }

  // ── Cliente ──
  const conv = (S.conversations||[]).find(c => c.id === cid);
  if (necesita('nombre')) d.nombre = (conv && (conv.customer_name || conv.contact_name || conv.contact_handle)) || '';
  if (necesita('puntos')) {
    const tel = String((conv && (conv.contact_handle || conv.telefono)) || '').replace(/[^0-9]/g,'').slice(-10);
    if (tel) {
      try {
        const { data:pt } = await sb.from('pos_puntos').select('puntos').ilike('telefono','%'+tel).maybeSingle();
        d.puntos = Number(pt && pt.puntos) || 0;
      } catch (e) {}
    }
  }

  // ── Pedido ──
  const dePedido = ['total','total_productos','domicilio','puntos_ganados'];
  if (cid && dePedido.some(necesita)) {
    try {
      const { data:cc } = await sb.from('chat_conversations').select('pedido_borrador,order_id').eq('id', cid).maybeSingle();
      let prod = null, domi = 0, total = 0;
      if (cc && cc.pedido_borrador && Array.isArray(cc.pedido_borrador.productos) && cc.pedido_borrador.productos.length) {
        const b = cc.pedido_borrador;
        domi  = (String(b.tipo) === 'domicilio') ? (Number(b.domi_precio)||0) : 0;
        total = Number(b.total)||0;
        prod  = total - domi;             // productos + adiciones + empaque, SIN domicilio
      } else if (cc && cc.order_id) {
        const { data:o } = await sb.from('pos_orders').select('subtotal,packaging_fee,delivery_fee,total')
          .eq('id', cc.order_id).maybeSingle();
        if (o) {
          prod  = (Number(o.subtotal)||0) + (Number(o.packaging_fee)||0);
          domi  = Number(o.delivery_fee)||0;
          total = Number(o.total) || (prod + domi);
        }
      }
      if (prod !== null) {
        d.total = total; d.total_productos = prod; d.domicilio = domi;
        /* 1 punto por cada $1.000 de productos y empaque. El domicilio NO da
           puntos: es la regla de oro, el domi nunca cuenta como venta. */
        d.puntos_ganados = window.posPuntosDe ? posPuntosDe(prod) : Math.floor(prod / 1000);
      }
    } catch (e) {}
  }
  return d;
}

/* Devuelve el texto listo para el compositor, o null si falta algo. */
async function resolverRR(r) {
  const claves = window.posVars ? posVars.usadas(r.t) : [];
  if (!claves.length) return r.t;                 // sin variables: tal cual

  const datos = await datosPlantilla(claves);
  const dePedido = ['total','total_productos','domicilio','puntos_ganados'];
  /* Si la plantilla pide plata del pedido y todavia no hay pedido, NO se manda
     "serian $0": se avisa y no se pega nada. Un cero enviado al cliente es un
     error que cuesta plata; un aviso solo cuesta un segundo. */
  if (claves.some(k => dePedido.indexOf(k) >= 0) && datos.total === undefined) {
    showToast('Primero guarda o crea el pedido para calcular los valores', 'info');
    return null;
  }
  const out = posVars.resolver(r.t, datos);
  const sinDato = out.faltantes.filter(f => String(f).indexOf('cálculo:') !== 0);
  if (sinDato.length) {
    const nom = sinDato.map(k => (posVars.POR_CLAVE[k] || {}).nombre || k);
    showToast('Sin dato para: ' + nom.join(', ') + ' — revisa antes de enviar', 'info');
  }
  return out.texto;
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
    body: caption, media_url: url, media_type:'image', delivery_status:'sent', agent_id: S.user?.id || null, origen: 'humano',
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
/* Se administran en Configuracion, no aqui: cuando habia un editor en cada
   pantalla los dos escribian la misma tabla y se fueron separando. */
function openQuickManage() {
  closeQuickDropdown();
  location.href = 'configuracion.html?s=chatia&tab=mensajes&acc=m-rapidas';
}
function closeQuickManage() { const p = document.getElementById('quickManage'); if (p) p.style.display = 'none'; }
function qmRenderList() {
  const cont = document.getElementById('quickMngList'); if (!cont) return;
  const list = S.quickReplies || [];
  if (!list.length) { cont.innerHTML = '<div style="padding:14px;color:var(--text-4);font-size:12.5px;text-align:center">Sin respuestas rápidas aún</div>'; return; }
  cont.innerHTML = list.map((r,i) =>
    '<div class="ci-qm-row">'
    /* Debajo del nombre va un pedazo del mensaje: con 30 respuestas, una lista
       de puros nombres no dice cual es cual. Las variables salen con su nombre
       en español entre comillas angulares, nunca como {puntos}. */
    + '<div class="ci-qm-info"><div class="ci-qm-k">/'+qrEsc(r.k)+'</div><div class="ci-qm-t">'
      + qrEsc(window.posVarsUI ? posVarsUI.resumen(r.t) : String(r.t||'')) + '</div></div>'
    + '<button class="ci-qm-ed" title="Editar" onclick="qmEdit('+i+')">✎</button>'
    + '<button class="ci-qm-del" title="Eliminar" onclick="qmDelete('+i+')">✕</button>'
    + '</div>'
  ).join('');
}
/* El editor se abre al crear o al editar, y se cierra al guardar. Cerrado solo
   se ve la lista: si estuviera siempre abierto, con la vista previa debajo, la
   lista de respuestas no cabria en el panel. */
function qmAbrirEditor(abierto) {
  const f = document.getElementById('qmForm'), n = document.getElementById('qmNuevoWrap');
  if (f) f.style.display = abierto ? '' : 'none';
  if (n) n.style.display = abierto ? 'none' : '';
  if (abierto && window.posVarsUI) {
    /* Contexto 'pedido': estas respuestas se mandan dentro de una conversacion,
       asi que hay cliente y casi siempre hay pedido. Las que no aplican no se
       esconden — salen atenuadas y con el motivo. */
    posVarsUI.montar({ editor:'qmEditor', barra:'qmBarra', previa:'qmPrevia', contexto:'pedido' });
  }
}
function qmNueva() { qmClearForm(); qmAbrirEditor(true); const k = document.getElementById('qmKey'); if (k) k.focus(); }
function qmClearForm() {
  S.qmEditIdx = -1;
  const k = document.getElementById('qmKey'), s = document.getElementById('qmSaveBtn');
  if (k) k.value = '';
  if (window.posVarsUI) posVarsUI.poner('');
  if (s) s.textContent = 'Agregar respuesta';
  qmAbrirEditor(false);
}
function qmEdit(i) {
  const r = (S.quickReplies||[])[i]; if (!r) return;
  S.qmEditIdx = i;
  qmAbrirEditor(true);
  const k = document.getElementById('qmKey'), s = document.getElementById('qmSaveBtn');
  if (k) k.value = r.k;
  if (window.posVarsUI) posVarsUI.poner(r.t || '');
  if (s) s.textContent = 'Guardar cambios';
  if (k) k.focus();
}
async function qmSave() {
  const k = (document.getElementById('qmKey').value||'').trim();
  const t = (window.posVarsUI ? posVarsUI.leer() : '').trim();
  if (!k || !t) { showToast('Escribe la palabra clave y el mensaje', 'error'); return; }
  const key = k.replace(/^[/]+/, '');   // sin la barra
  S.quickReplies = S.quickReplies || [];
  if (S.qmEditIdx >= 0) {
    /* Se conserva lo que el editor no maneja (imagen, ubicacion, botones): si se
       reemplazara la fila entera, editarle el texto a /QR2 le borraria el QR. */
    const ant = S.quickReplies[S.qmEditIdx] || {};
    const nuevo = Object.assign({}, ant, { k:key, t:t });
    delete nuevo.dyn;                   // ya no hace falta: ahora el texto manda
    S.quickReplies[S.qmEditIdx] = nuevo;
  } else S.quickReplies.unshift({ k:key, t:t });
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
  off:  { txt: 'Pausado · contestas tú',                      col: '#F2555A', bg: 'rgba(242,85,90,.16)', bd: '#FECACA', toast: '⏸️ Asistente pausado · contestas tú' },
  on:   { txt: 'Encendido · responde siempre',                col: '#2FCB6F', bg: 'rgba(47,203,111,.16)', bd: '#BBF7D0', toast: '✅ Asistente encendido · responde siempre' },
  auto: { txt: 'Automático · responde solo fuera del horario', col: '#7C5CFF', bg: 'rgba(124,92,255,.16)', bd: '#BFDBFE', toast: '🕐 Automático · el bot contesta solo fuera del horario' },
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

/* LA FRANJA DEL DOMICILIO SIN PRECIO.

   Paco no supo cuánto cobrar hasta donde vive el cliente, se calló y dejó la
   conversación esperando. Aquí el dueño pone el precio, dice si es barrio o
   conjunto, y Paco retoma solo.

   Va de ancho completo bajo la cabecera y no como un botón entre otros tres:
   no enterarse de esto significa un cliente esperando en silencio. El precio
   confirma con Enter — en hora pico nadie mueve el mouse. */
S.domiTipo = 'barrio';
function updateDomiConfirmBtn(isPendiente) {
  const viejo = $('domiConfirmBtn');
  if (viejo) viejo.style.display = 'none';      // reemplazado por la franja
  const bar = $('domiBar');
  if (!bar) return;
  if (!isPendiente) { bar.style.display = 'none'; bar.innerHTML = ''; return; }

  const conv = getActiveConv() || {};
  const ped  = conv.pending_order_data || {};
  /* El NOMBRE LIMPIO del lugar (lo puso el motor: "Villa Ernesto"), no el
     mensaje entero del cliente — Sergio lo pidió así el 15-ago: la barra debe
     decir el sitio, no el fragmento completo del pedido. */
  const sitio = String(ped.domi_lugar || ped.barrio || '').trim();
  S.domiTipo  = 'barrio';

  /* Ámbar OSCURO, nativo del tema (opción 1 aprobada por Sergio el 15-ago):
     la barra vive en una app oscura — el crema claro se veía como un parche.
     Fondo oscuro con tinte ámbar y acentos ámbar: integrada pero sigue
     siendo una alarma. */
  const opcion = (val, titulo, consecuencia) =>
    '<button type="button" onclick="setDomiTipo(\'' + val + '\')" data-domitipo="' + val + '"'
    + ' style="flex:1;text-align:left;padding:7px 10px;border-radius:9px;border:1.5px solid #4A3A1E;background:#1C1917;cursor:pointer;line-height:1.25">'
    + '<span style="display:block;font-size:12.5px;font-weight:700;color:#F4F4F5">' + titulo + '</span>'
    + '<span style="display:block;font-size:10.5px;color:#A1A1AA;margin-top:1px">' + consecuencia + '</span>'
    + '</button>';

  bar.innerHTML =
    '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:11px 20px;'
    + 'background:#231A0D;border-bottom:1px solid #78350F;border-top:2px solid #F59E0B">'
    +   '<div style="flex:1;min-width:190px">'
    +     '<div style="font-size:12.5px;font-weight:700;color:#FCD34D">'
    +       '⚠️ No sé cuánto cobrar el domicilio' + (sitio ? ' a <b>' + escHtml(sitio) + '</b>' : '')
    +     '</div>'
    +     '<div style="font-size:11px;color:#D4A24C;margin-top:2px">Paco está esperando este dato para seguir.</div>'
    +   '</div>'
    +   '<div style="display:flex;gap:6px;min-width:250px">'
    +     opcion('barrio',   'Barrio',   'le pide la dirección completa')
    +     opcion('conjunto', 'Conjunto', 'le pide solo torre y apto')
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:7px">'
    +     '<span style="font-size:15px;font-weight:700;color:#FCD34D">$</span>'
    +     '<input id="domiPrecioInput" type="number" min="0" step="500" placeholder="7000" '
    +       'onkeydown="if(event.key===\'Enter\')confirmarDomi()" '
    +       'style="width:100px;padding:8px 10px;border:1.5px solid #78350F;border-radius:9px;font-size:14px;font-weight:600;outline:none;background:#1C1917;color:#F4F4F5">'
    +     '<button id="domiBarBtn" onclick="confirmarDomi()" '
    +       'style="padding:9px 15px;border:none;background:#D97706;color:#1C1002;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:700">'
    +       'Confirmar y seguir</button>'
    +   '</div>'
    + '</div>';
  bar.style.display = '';
  // Si el motor olió que es un conjunto ("Torre 3 Apto 108"), la opción llega
  // preseleccionada — al dueño le queda solo el precio y confirmar.
  setDomiTipo(ped.domi_tipo_sugerido === 'conjunto' ? 'conjunto' : 'barrio');
  setTimeout(function(){ const i = $('domiPrecioInput'); if (i) i.focus(); }, 60);
}

/* Cuál de los dos quedó escogido. Se ve, porque la consecuencia es distinta:
   a un conjunto no se le pide la dirección completa. */
function setDomiTipo(val) {
  S.domiTipo = val;
  document.querySelectorAll('[data-domitipo]').forEach(function (b) {
    const on = b.dataset.domitipo === val;
    // Seleccionado en ámbar oscuro (tema oscuro de la barra, opción 1)
    b.style.borderColor = on ? '#F59E0B' : '#4A3A1E';
    b.style.background  = on ? '#3B2A10' : '#1C1917';
  });
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
    // La tarjeta de abajo muestra lo mismo: no puede haber dos versiones del
    // estado en la misma pantalla diciendo cosas distintas.
    try{ if(S.activeConvId) await loadDraftBar(S.activeConvId); }catch(_e){}
  }catch(e){ o.estado=prev; renderEstadoPill(); showToast('No se pudo cambiar el estado','error'); }
}
/* Config de estados (etiqueta + mensaje por tipo/estado + minutos auto-entregado) */
async function getEstadosConfig(){
  if(S._estadosConfig) return S._estadosConfig;
  try{ const { data }=await sb.from('ia_config').select('estados_config').eq('branch_id', S.branchId).maybeSingle();
    S._estadosConfig=(data && data.estados_config) || {}; }catch(e){ S._estadosConfig={}; }
  return S._estadosConfig;
}
// Conjuntos de etiquetas de estado según la config (llevar + domicilio).
function _stateLabelSets(cfg){
  const todas = new Set(), entregado = new Set();
  ['llevar','domicilio'].forEach(function(t){
    ['en_preparacion','listo','en_camino','entregado'].forEach(function(k){
      var et = cfg && cfg[t] && cfg[t][k] && cfg[t][k].etiqueta;
      if(et){ todas.add(et); if(k==='entregado') entregado.add(et); }
    });
  });
  return { todas: todas, entregado: entregado };
}
// Si la conversación quedó "Entregado" (pedido completado) y el cliente vuelve a
// escribir, se le quitan TODAS las etiquetas de estado para que reaparezca en la
// bandeja como una consulta nueva, lista para el próximo pedido.
async function limpiarEstadoSiVuelveAEscribir(conv){
  if(!conv) return;
  const cfg = await getEstadosConfig();
  const sets = _stateLabelSets(cfg);
  const labels = Array.isArray(conv.labels) ? conv.labels : [];
  if(!labels.some(function(l){ return sets.entregado.has(l); })) return;   // solo si está "Entregado"
  const next = labels.filter(function(l){ return !sets.todas.has(l); });
  try{
    await sb.from('chat_conversations').update({ labels: next }).eq('id', conv.id);
    conv.labels = next;
    if(typeof updateLabelBadges==='function') updateLabelBadges();
    renderConvList();
  }catch(e){ console.error('limpiarEstado:', e); }
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
  // Sale solo, sin que nadie lo escriba: no es 'humano'.
  try{
    const { data, error }=await sb.from('chat_messages').insert([{ conversation_id:convId, tenant_id:S.tenantId, direction:'out', body:text, delivery_status:'sent', agent_id:S.user?.id||null, origen:'sistema' }]).select().single();
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
    +'<button class="vp-pay" type="button">💳 Registrar el pago…</button>'
    +'<button class="vp-close" type="button">Entendido</button></div>';
  document.body.appendChild(ov);
  const done=function(){ ov.remove(); };
  const btnPay=ov.querySelector('.vp-pay');
  if(btnPay) btnPay.onclick=function(){ const amt=(d.datos&&Number(d.datos.monto_comprobante))||0; done(); marcarPagadoModal(amt>0?{amount:amt}:undefined); };
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

/* ══════════════ MARCAR PEDIDO COMO PAGADO (desde el chat) ══════════════
   Registra un pago sobre el pedido (método de la config del restaurante + monto),
   para no tener que ir a Ventas/Pagos. Soporta total, solo comida y abono parcial. */
async function marcarPagadoModal(prefill){
  if(typeof closeMoreMenu==='function') closeMoreMenu();
  const conv = getActiveConv();
  if(!conv){ showToast('Abre un chat primero','info'); return; }
  let ord=null;
  try{
    const { data:cd }=await sb.from('chat_conversations').select('order_id').eq('id',conv.id).maybeSingle();
    if(cd && cd.order_id){ const r=await sb.from('pos_orders').select('id,total,total_final,delivery_fee,packaging_fee,paid_amount,branch_id,tenant_id,channel,status,cliente_id').eq('id',cd.order_id).maybeSingle(); ord=r.data; }
  }catch(e){}
  if(!ord){ showToast('Este chat no tiene un pedido enviado a cocina. Envíalo primero (🍳 Enviar a cocina).','info'); return; }
  let metodos=[];
  try{ const { data:ic }=await sb.from('ia_config').select('pagos').eq('branch_id',S.branchId).maybeSingle();
    metodos=((ic&&ic.pagos&&ic.pagos.metodos)||[]).filter(m=>m&&m.activo!==false&&m.nombre);
  }catch(e){}
  if(!metodos.length) metodos=[{nombre:'Transferencia',tipo:'transferencia',digital:true},{nombre:'Efectivo',tipo:'efectivo'}];
  const total=Number(ord.total)||0, comida=Number(ord.total_final)||total, domi=Number(ord.delivery_fee)||0, pagado=Number(ord.paid_amount)||0;
  const pend=Math.max(0, total-pagado);
  const fmt=n=>'$'+Math.round(Number(n)||0).toLocaleString('es-CO');
  let monto = (prefill&&Number(prefill.amount)>0) ? Number(prefill.amount) : (pend||total);
  let metodoSel = (prefill&&prefill.metodo) || (metodos.find(m=>m.digital)||metodos[0]).nombre;
  /* El nombre es lo que ve el cajero; el id es lo que se guarda. Traducir aqui
     evita que cada sitio invente su propia forma de nombrar el mismo metodo. */
  const metodoIdDe = n => { const m = metodos.find(x => x.nombre === n); return m && m.id ? m.id : null; };
  const metodoPorNom = n => metodos.find(x => x.nombre === n) || null;

  /* El saldo del cliente de ESTE pedido. Se pregunta una vez, al abrir, para
     poder escribirlo en el chip: decidir a ciegas si alcanza no es decidir. */
  let saldoDisp = 0;
  const metSaldo = metodos.find(m => m.tipo === 'saldo');
  if (metSaldo && ord.cliente_id && window.posSaldo) {
    try {
      posSaldo.setCtx(ord.tenant_id, ord.branch_id);
      saldoDisp = await posSaldo.disponibles(ord.cliente_id);
    } catch (e) { console.warn('[chat] saldo:', e); }
  }
  /* Sin cliente identificado no hay a quien cobrarle: el chip sobra. */
  if (metSaldo && !ord.cliente_id) metodos = metodos.filter(m => m.tipo !== 'saldo');
  const ov=document.createElement('div'); ov.className='mp-ov';
  const preset = m => (m===total?'total':(domi&&m===comida?'comida':'otro'));
  function draw(){
    let sel=preset(monto);
    ov.innerHTML='<div class="mp-box">'
      +'<div class="mp-title">💳 Confirma el pago</div>'
      +'<div class="mp-sub">Falta este paso: el pedido todavía <b>no</b> está marcado como pagado.</div>'
      +'<div class="mp-info">Total <b>'+fmt(total)+'</b>'+(domi?' · Comida '+fmt(comida)+' · Domi '+fmt(domi):'')+(pagado?' · Ya pagado '+fmt(pagado):'')+'</div>'
      +'<div class="mp-lbl">Monto que pagó</div>'
      +'<div class="mp-chips">'
        +'<button type="button" class="mp-chip'+(sel==='total'?' on':'')+'" data-amt="'+total+'">Total '+fmt(total)+'</button>'
        +(domi?'<button type="button" class="mp-chip'+(sel==='comida'?' on':'')+'" data-amt="'+comida+'">Solo pedido '+fmt(comida)+'</button>':'')
        +'<button type="button" class="mp-chip mp-otro'+(sel==='otro'?' on':'')+'">Otro</button>'
      +'</div>'
      +'<input class="mp-inp" id="mpMonto" type="number" inputmode="numeric" value="'+monto+'"'+(sel==='otro'?'':' style="display:none"')+'>'
      +'<div class="mp-lbl">¿Dónde pagó?</div>'
      +'<div class="mp-chips">'+metodos.map(m=>'<button type="button" class="mp-chip mp-met'+(m.nombre===metodoSel?' on':'')+'" data-met="'+escHtml(m.nombre)+'">'+escHtml(m.nombre)+(m.tipo==='saldo'?' · '+fmt(saldoDisp):'')+'</button>').join('')+'</div>'
      +(monto>0 && monto+pagado<total
          ? '<div class="mp-falta">⚠ Con este monto quedan <b>'+fmt(total-pagado-monto)+'</b> sin pagar, así que el pedido <b>seguirá apareciendo sin pagar</b> en Ventas.</div>'
          : '')
      +'<div class="mp-btns"><button class="mp-cancel" type="button">Cancelar</button><button class="mp-save" type="button">'+(monto+pagado>=total?'Marcar pagado':'Guardar abono')+'</button></div>'
      +'</div>';
    ov.querySelectorAll('.mp-chip[data-amt]').forEach(b=>b.onclick=()=>{ monto=Number(b.dataset.amt); draw(); });
    const otroBtn=ov.querySelector('.mp-otro'); if(otroBtn) otroBtn.onclick=()=>{ monto = (preset(monto)==='otro'?monto:0); draw(); const i=ov.querySelector('#mpMonto'); if(i){ i.style.display=''; i.focus(); } };
    const inp=ov.querySelector('#mpMonto');
    if(inp){ inp.oninput=()=>{ monto=Number(inp.value)||0; }; inp.onblur=()=>{ draw(); const i=ov.querySelector('#mpMonto'); if(i) i.focus(); }; }
    ov.querySelectorAll('.mp-met').forEach(b=>b.onclick=()=>{ metodoSel=b.dataset.met; ov.querySelectorAll('.mp-met').forEach(x=>x.classList.remove('on')); b.classList.add('on'); });
    ov.querySelector('.mp-cancel').onclick=close;
    ov.querySelector('.mp-save').onclick=guardar;
  }
  function close(){ ov.remove(); }
  ov.onclick=e=>{ if(e.target===ov) close(); };
  async function guardar(){
    const inp=ov.querySelector('#mpMonto'); if(inp) monto=Number(inp.value)||monto;
    if(!(monto>0)){ showToast('Pon un monto válido','error'); return; }
    const btn=ov.querySelector('.mp-save'); btn.disabled=true; btn.textContent='Guardando…';
    try{
      /* SALDO: se descuenta ANTES de guardar el pago. Si la base lo rechaza
         —no le alcanza—, el pedido no queda marcado como pagado con un saldo
         que no existia. La referencia lleva el id del pedido y el monto para
         que dos abonos distintos no se pisen entre si. */
      const _def = metodoPorNom(metodoSel);
      if (_def && _def.tipo === 'saldo') {
        if (!window.posSaldo) throw new Error('el módulo de saldo no está cargado');
        posSaldo.setCtx(ord.tenant_id, ord.branch_id);
        try {
          await posSaldo.consumir(ord.cliente_id, monto, ord.id,
            'pedido:' + ord.id + ':chat:' + (pagado + monto),
            'Pago desde el chat');
        } catch (err) {
          btn.disabled = false; btn.textContent = 'Marcar pagado';
          showToast(err && err.codigo === 'SALDO_INSUFICIENTE'
            ? ('Al cliente le quedan ' + fmt(err.disponible) + ' de saldo')
            : ('No se pudo descontar el saldo: ' + (err && err.message || err)), 'error');
          return;
        }
      }
      const { data:pagoIns, error:e1 }=await sb.from('pos_payments')
        /* En pos_payments va el ID del metodo configurado, igual que en la
           pantalla de cobro. Aqui se guardaba el NOMBRE, y por eso la caja
           veia dos convenciones distintas y mandaba a "Otros" todo lo que
           llegaba con id. El id ademas aguanta que se renombre el metodo. */
        .insert([{ order_id:ord.id, branch_id:ord.branch_id, tenant_id:ord.tenant_id, method:(metodoIdDe(metodoSel)||metodoSel), amount:monto, received:monto, vuelto:0 }])
        .select('id');
      if(e1) throw e1;
      // Un insert que no devuelve fila = lo bloqueó un permiso. Antes esto
      // pasaba callado y el pedido quedaba sin pagar sin avisar a nadie.
      if(!pagoIns || !pagoIns.length) throw new Error('el pago no quedó guardado (permisos)');

      const nuevo=pagado+monto;
      const upd={ paid_amount:nuevo };
      if(nuevo>=total){
        // Cerrar el pedido EXACTAMENTE como lo hace la pantalla de pagos. Antes
        // solo se ponía status y paid_amount: sin closed_at el pedido quedaba a
        // medio cerrar y Ventas/caja no lo veían igual que uno cobrado ahí.
        upd.status='paid';
        /* El id, no el nombre: es lo mismo que se guarda en pos_payments y lo
           que la caja sabe traducir. Con el nombre, un metodo renombrado
           dejaba de reconocerse. */
        upd.payment_method=metodoIdDe(metodoSel)||metodoSel;
        upd.closed_at=new Date().toISOString();
        // "Las ventas son las ventas": total_final es SOLO comida+empaque, el
        // domicilio va aparte en delivery_fee y nunca suma a la venta.
        upd.total_final=Math.max(0, total-domi);
        // NO se toca `delivery_status`. Pagar NO es entregar: un domicilio se
        // puede pagar por transferencia mientras todavía está en preparación.
        // (Se había puesto 'entregado' aquí por error el 2026-07-31 y los
        // pedidos aparecían como entregados apenas se marcaban pagados.)
      }
      const { data:updRows, error:e2 }=await sb.from('pos_orders').update(upd).eq('id',ord.id).select('id,status,paid_amount');
      if(e2) throw e2;
      // Un update filtrado por RLS NO da error: simplemente no cambia nada. Hay
      // que comprobar que de verdad quedó escrito, o se repite lo de siempre:
      // el chat dice "pagado" y Ventas lo sigue mostrando sin pagar.
      if(!updRows || !updRows.length) throw new Error('el pedido no se actualizó (permisos)');

      showToast(nuevo>=total ? ('✅ Pedido marcado como pagado ('+escHtml(metodoSel)+')') : ('💳 Abono de '+fmt(monto)+' · faltan '+fmt(total-nuevo)+' — el pedido sigue SIN pagar en Ventas'),'success');
      close();
    }catch(e){ btn.disabled=false; btn.textContent='Marcar pagado'; showToast('No se pudo registrar: '+(e&&e.message||e),'error'); }
  }
  document.body.appendChild(ov); draw();
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
  const btn = $('domiBarBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirmando…'; }
  /* El nombre del sitio sale de lo que Paco entendió como barrio. Se manda
     junto con el precio para que quede aprendido en las zonas y no vuelva a
     preguntarse por el mismo lugar. */
  const ped = conv.pending_order_data || {};
  /* El nombre que se aprende es el LIMPIO que dejó el motor (domi_lugar).
     Antes se mandaba ped.barrio, que con un conjunto venía VACÍO: confirm-domi
     no aprendía nada y Paco retomaba sin conocer el lugar — las dos
     confirmaciones de Sergio del 15-ago se fueron al vacío por esto. */
  const nombreLugar = String(ped.domi_lugar || ped.barrio || '').trim();
  if (!nombreLugar) {
    showToast('No reconocí el nombre del lugar. Agrégalo en Configuración → Domicilios y vuelve a confirmar.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar y seguir'; }
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-domi`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conv.id,
        domi_precio: precio,
        tipo: S.domiTipo || 'barrio',
        nombre: nombreLugar,
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const out = await res.json().catch(function(){ return {}; });
    conv.domi_precio_pendiente = false;
    conv.human_takeover = false;
    updateDomiConfirmBtn(false);
    updateHumanToggleBtn(false);
    await loadMessages(conv.id);
    showToast(out.aprendido
      ? '"' + out.aprendido + '" queda guardado a $' + precio.toLocaleString('es-CO') + ' — Paco sigue ✅'
      : 'Domicilio confirmado — Paco retoma la conversación ✅');
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar y seguir'; }
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
// Convierte el último mensaje en un resumen legible para la lista de conversaciones.
// Si es un placeholder de medio ([image], [audio], etc.) muestra un ícono + etiqueta.
function prettyPreview(s) {
  if (!s) return '';
  const raw = String(s).trim();
  const m = raw.match(/^\[\s*(image|imagen|foto|photo|audio|voice|voz|nota de voz|video|v[ií]deo|sticker|documento?|document|file|archivo|ubicaci[oó]n|location|gif|medio)\s*\]$/i);
  if (m) {
    const k = m[1].toLowerCase();
    if (/^(image|imagen|foto|photo|gif|medio)$/.test(k)) return '📷 Imagen';
    if (/^(audio|voice|voz|nota de voz)$/.test(k))       return '🎤 Nota de voz';
    if (/^(video|v[ií]deo)$/.test(k))                    return '🎬 Video';
    if (/^sticker$/.test(k))                             return '🩷 Sticker';
    if (/^(documento?|document|file|archivo)$/.test(k))  return '📄 Documento';
    if (/^(ubicaci[oó]n|location)$/.test(k))             return '📍 Ubicación';
  }
  return escHtml(raw);
}
// Pinta el nombre, rol y avatar de la cuenta con sesión abierta en el pie del sidebar.
async function pintarUsuarioActual() {
  let nombre = '', rol = '', avatarUrl = '';
  try {
    const { data: au } = await sb.auth.getUser();
    const u = au && au.user;
    const meta = (u && u.user_metadata) || {};
    nombre    = meta.full_name || meta.name || meta.nombre || meta.restaurant_name || (u && u.email) || '';
    rol       = meta.role || meta.rol || '';
    avatarUrl = meta.avatar_url || meta.foto_negocio || meta.business_photo_url || meta.logo_url || '';
  } catch (e) { /* sin sesión legible */ }

  // Complemento desde pos_users si faltara nombre o rol
  if (!nombre || !rol) {
    try {
      const { data: pu } = await sb.from('pos_users').select('full_name,role').eq('tenant_id', S.tenantId).limit(1).maybeSingle();
      if (pu) { nombre = nombre || pu.full_name || ''; rol = rol || pu.role || ''; }
    } catch (e) {}
  }

  const nombreFinal = nombre || 'Mi cuenta';
  const rolFinal = rol ? (rol.charAt(0).toUpperCase() + rol.slice(1)) : 'Usuario';
  const nEl = $('userName'); if (nEl) nEl.textContent = nombreFinal;
  const rEl = $('userRole'); if (rEl) rEl.textContent = rolFinal;

  const avEl = $('userAv');
  if (avEl) {
    if (avatarUrl) {
      // Foto del negocio (cuando se suba): llena el recuadro completo.
      avEl.innerHTML = `<img src="${escHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`;
      avEl.style.background = 'transparent';
    } else {
      const initials = nombreFinal.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase() || '??';
      avEl.textContent = initials;
    }
  }
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


/* ══ ELEGIR LA PÁGINA ══════════════════════════════════════════════════
   El dueño puede administrar varias páginas de Facebook. Antes el servidor
   agarraba la primera sin preguntar: si tenía dos, Cobra conectaba la que no
   era. Y para Meta esto es `pages_show_list` — el permiso de ver la lista y
   escoger—, así que tiene que verse de verdad.

   Las que no tienen Instagram vinculado se muestran igual pero apagadas y con
   el motivo: esconderlas haría creer que la página no existe. */
function elegirPagina(res, channel, meta) {
  return new Promise(function (resolve) {
    var esIG = channel === 'instagram';
    var ov = document.createElement('div');
    ov.className = 'ci-modal-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';

    function fila(p) {
      var sirve = !esIG || !!p.instagram;
      return '<button type="button" class="ci-pagina" data-id="' + escHtml(String(p.id)) + '"'
        + (sirve ? '' : ' disabled') + '>'
        + '<span class="ci-pagina-l">'
        +   '<b>' + escHtml(p.nombre || 'Sin nombre') + '</b>'
        +   '<span>' + (p.instagram ? '@' + escHtml(p.instagram)
              : (esIG ? 'Sin cuenta de Instagram vinculada' : 'Página de Facebook')) + '</span>'
        + '</span>'
        + (sirve ? '<span class="ci-pagina-r">Conectar</span>' : '') + '</button>';
    }

    /* Ninguna pagina trae Instagram: casi siempre es porque en el dialogo de
       Meta el paso de Instagram se ve OPCIONAL y se salto. Antes esto era un
       callejon sin salida —todo apagado y un boton de Cancelar—; ahora se
       dice que paso y como se arregla. */
    var ningunaConIG = esIG && !res.paginas.some(function (p) { return p.instagram; });

    ov.innerHTML =
      '<div class="ci-pagina-box">'
      + '<div class="ci-pagina-tt">'
      +   (ningunaConIG ? 'Falta vincular tu Instagram'
          : (esIG ? '¿Cuál cuenta de Instagram?' : '¿Cuál página?')) + '</div>'
      + '<div class="ci-pagina-sub">'
      +   (ningunaConIG
            ? 'Ninguna de tus páginas de Facebook tiene una cuenta de Instagram '
              + 'vinculada. En el paso de Meta, Instagram aparece como opcional y '
              + 'es fácil pasarlo por alto.<br><br>'
              + '<b>Vuelve a intentar</b> y marca tu cuenta de Instagram cuando te la '
              + 'pida. Si no aparece, primero vincúlala a tu página desde Facebook '
              + '(Configuración de la página → Instagram).'
            : (res.paginas.length === 1
                ? 'Administras esta página con tu cuenta de Facebook.'
                : 'Administras ' + res.paginas.length + ' páginas. Elige la de tu restaurante.'))
      + '</div>'
      + (ningunaConIG ? '' : '<div class="ci-pagina-lista">' + res.paginas.map(fila).join('') + '</div>')
      + '<div class="ci-pagina-err" hidden></div>'
      + '<button type="button" class="ci-pagina-cancel">'
      +   (ningunaConIG ? 'Entendido' : 'Cancelar') + '</button>'
      + '</div>';
    document.body.appendChild(ov);

    var err = ov.querySelector('.ci-pagina-err');
    function cerrar() { ov.remove(); resolve(); }
    ov.querySelector('.ci-pagina-cancel').addEventListener('click', cerrar);
    ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });

    ov.querySelectorAll('.ci-pagina').forEach(function (b) {
      b.addEventListener('click', async function () {
        ov.querySelectorAll('.ci-pagina').forEach(function (x) { x.disabled = true; });
        b.querySelector('.ci-pagina-r').textContent = 'Conectando…';
        err.hidden = true;
        try {
          var r = await fetch(META_OAUTH_FN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paso: 'guardar', sesion: res.sesion, page_id: b.dataset.id }),
          });
          var d = await r.json();
          if (d.error) throw new Error(d.error);
          ov.remove();
          closeModal();
          loadChannels();
          showToast('✅ ' + meta.label + ' conectado: ' + (d.handle || ''), 'success');
          resolve();
        } catch (e) {
          err.textContent = e.message || e;
          err.hidden = false;
          ov.querySelectorAll('.ci-pagina').forEach(function (x) { x.disabled = false; });
          b.querySelector('.ci-pagina-r').textContent = 'Conectar';
        }
      });
    });
  });
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
          body: JSON.stringify({ paso: 'listar', code: evt.detail.code, channel, branch_id: S.branchId, tenant_id: S.tenantId, redirect_uri: location.origin + location.pathname }),
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
            body: JSON.stringify({ paso: 'listar', code: response.authResponse.code, channel, branch_id: S.branchId, tenant_id: S.tenantId }),
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
  /* El botón de archivar dice lo contrario según dónde estés: en la bandeja
     "Archivar chat", y dentro de Archivados "Devolver a la bandeja". */
  if (!open) {
    var _lbl = document.getElementById('archivarLabel');
    if (_lbl) _lbl.textContent = (S.activeView === 'archived') ? 'Devolver a la bandeja' : 'Archivar chat';
  }
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

/* ARCHIVAR / DESARCHIVAR.
   La pestaña "Archivados" ya filtraba por status='archived', pero NADA en el
   sistema ponía ese estado: la pestaña estaba condenada a salir siempre vacía.
   Esto es lo que le faltaba. Archivar no borra nada — el historial queda
   intacto y el chat se puede devolver a la bandeja desde el mismo menú. */
async function archivarChat() {
  closeMoreMenu();
  const convId = S.activeConvId;
  if (!convId) { showToast('Abre primero una conversación', 'error'); return; }
  const volver = (S.activeView === 'archived');
  const nuevo  = volver ? 'open' : 'archived';
  const upd = await sb.from('chat_conversations')
    .update({ status: nuevo }).eq('id', convId).select('id');
  /* Se comprueba el resultado: un UPDATE sobre una fila que no existe devuelve
     0 filas SIN error, y el aviso diría "listo" sin haber cambiado nada. */
  if (upd.error || !upd.data || !upd.data.length) {
    showToast('No se pudo archivar: ' + ((upd.error && upd.error.message) || 'sin permisos'), 'error');
    return;
  }
  const conv = S.conversations.find(c => c.id === convId);
  if (conv) conv.status = nuevo;
  S.conversations = S.conversations.filter(c => c.id !== convId);
  S.activeConvId = null;
  renderConvList();
  renderBadges();
  showToast(volver ? 'Chat devuelto a la bandeja' : 'Chat archivado', 'success');
  loadConversations();
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

