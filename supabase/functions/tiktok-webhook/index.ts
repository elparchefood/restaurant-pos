import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts'

const SECRET     = Deno.env.get('TIKTOK_CLIENT_SECRET')!
const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // GET: verificación del webhook por TikTok
  if (req.method === 'GET') {
    const url       = new URL(req.url)
    const challenge = url.searchParams.get('challenge')
    if (challenge) {
      return new Response(challenge, {
        headers: { 'Content-Type': 'text/plain' }
      })
    }
    return new Response('TikTok Webhook — El Parche POS', { status: 200 })
  }

  // POST: mensaje entrante
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Verificar firma HMAC-SHA256
  const signature = req.headers.get('x-tiktok-signature') || ''
  const rawBody   = await req.text()

  const expectedSig = await hmac('sha256', SECRET, rawBody, 'utf8', 'hex')
  if (signature !== `sha256=${expectedSig}`) {
    console.warn('Firma inválida:', signature)
    // En desarrollo aceptar igual — en producción descomentar:
    // return new Response('Unauthorized', { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const sb = createClient(SB_URL, SB_SERVICE)

  // Manejar diferentes tipos de eventos TikTok
  const eventType = payload.type || payload.event_type

  if (eventType === 'message' || payload.data?.message) {
    await handleIncomingMessage(sb, payload)
  } else if (eventType === 'comment') {
    await handleComment(sb, payload)
  }

  return new Response('OK', { status: 200 })
})

async function handleIncomingMessage(sb: any, payload: any) {
  const data    = payload.data || payload
  const msg     = data.message || data
  const senderId   = data.sender_id || msg.sender_id || 'unknown'
  const receiverId = data.receiver_id || msg.receiver_id
  const text       = msg.text || msg.content || ''
  const messageId  = msg.message_id || msg.id || crypto.randomUUID()
  const timestamp  = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString()

  // Buscar canal TikTok con este open_id como receiver
  const { data: channels } = await sb
    .from('chat_channels')
    .select('id, branch_id, tenant_id, meta')
    .eq('channel', 'tiktok')
    .eq('connected', true)

  if (!channels?.length) {
    console.warn('No hay canal TikTok conectado para este mensaje')
    return
  }

  // Buscar el canal correcto por open_id en meta
  const channel = channels.find((c: any) =>
    c.meta?.open_id === receiverId
  ) || channels[0]

  const branchId = channel.branch_id
  const tenantId = channel.tenant_id

  // Buscar o crear conversación
  let { data: conv } = await sb
    .from('chat_conversations')
    .select('id, unread_count')
    .eq('branch_id', branchId)
    .eq('channel', 'tiktok')
    .eq('contact_handle', senderId)
    .single()

  if (!conv) {
    const { data: newConv } = await sb
      .from('chat_conversations')
      .insert({
        tenant_id:       tenantId,
        branch_id:       branchId,
        channel:         'tiktok',
        channel_id:      channel.id,
        contact_name:    null,
        contact_handle:  senderId,
        status:          'open',
        unread_count:    0,
        is_online:       true,
        last_message:    text,
        last_message_at: timestamp,
        last_sender:     'contact',
      })
      .select()
      .single()
    conv = newConv
  }

  if (!conv) return

  // Insertar mensaje
  await sb.from('chat_messages').insert({
    conversation_id: conv.id,
    tenant_id:       tenantId,
    direction:       'in',
    body:            text,
    external_id:     messageId,
    sent_at:         timestamp,
  })
}

async function handleComment(sb: any, payload: any) {
  // Comentarios en posts de TikTok — tratar como mensajes entrantes
  const data    = payload.data || payload
  const userId  = data.user_id || data.commenter_id || 'unknown'
  const text    = data.comment_text || data.text || ''

  console.log(`Comentario de ${userId}: ${text}`)
  // Por ahora solo log — puede expandirse para manejar comentarios en el inbox
}
