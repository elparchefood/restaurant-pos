/* pos-paco-preview.js — hablar con Paco de verdad, sin riesgo.
 *
 * La vista previa del rail era un dibujo: tres burbujas escritas a mano que
 * nunca cambiaban. Ahora es un chat REAL contra `delay-reply-banco`, el banco
 * de pruebas: el MISMO motor de Paco, con la carta, la personalidad y las
 * frases que el dueño acaba de guardar, pero blindado —no puede crear pedidos
 * ni escribirle a ningún cliente—.
 *
 * Por qué así y no simulando la respuesta: probar contra una imitación no
 * prueba nada. Si el dueño cambia la personalidad y quiere saber cómo suena,
 * tiene que oír a Paco, no a un eco.
 *
 * La conversación de práctica nace con status 'preview', que ninguna vista de
 * la bandeja consulta (todas piden 'open', 'resolved' o 'archived'). Así el
 * ensayo no se mezcla NUNCA con los chats de clientes reales — el susto que
 * ya pasó una vez y no se repite.
 */
(function (w) {
  'use strict';

  var CONV = null;          // id de la conversación de práctica
  var ocupado = false;
  var TEL = '000000000000'; // teléfono imposible: no existe ni existirá

  function sb() { return w._pos && w._pos.sb; }
  function st() { return (w._pos && w._pos.state) || {}; }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function hilo() { return document.getElementById('pvThread'); }

  function burbuja(texto, mia) {
    var t = hilo(); if (!t) return null;
    var d = document.createElement('div');
    d.className = 'pv-bubble ' + (mia ? 'in' : 'out');
    d.innerHTML = esc(texto).replace(/\n/g, '<br>');
    t.appendChild(d);
    t.scrollTop = t.scrollHeight;
    return d;
  }
  function escribiendo(on) {
    var e = document.getElementById('pvTyping');
    if (e) e.style.display = on ? '' : 'none';
    var t = hilo(); if (t) t.scrollTop = t.scrollHeight;
  }

  /* La conversación de práctica: una sola por restaurante, reutilizada. */
  async function conversacion() {
    if (CONV) return CONV;
    var s = sb(); if (!s) throw new Error('sin conexión');
    var y = await s.from('chat_conversations').select('id')
      .eq('branch_id', st().branchId).eq('contact_handle', TEL).limit(1);
    if (y.data && y.data.length) { CONV = y.data[0].id; return CONV; }
    var n = await s.from('chat_conversations').insert({
      tenant_id: st().tenantId, branch_id: st().branchId,
      channel: 'whatsapp', contact_handle: TEL,
      contact_name: 'Prueba del asistente',
      /* 'preview' no lo pide ninguna vista de la bandeja: invisible a propósito. */
      status: 'preview', human_takeover: false, unread_count: 0,
    }).select('id').maybeSingle();
    if (n.error) throw n.error;
    CONV = n.data.id;
    return CONV;
  }

  async function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    var s = sb(); if (!s) return;
    ocupado = true;
    var caja = document.getElementById('pvInput');
    if (caja) { caja.value = ''; caja.disabled = true; }
    burbuja(texto, true);
    escribiendo(true);

    try {
      var conv = await conversacion();

      /* La MISMA marca de tiempo para el mensaje y para la cola. El motor lee
         los mensajes "desde batch_start": si la cola se marca despues, el
         mensaje queda fuera de la ventana y Paco no contesta nunca. */
      var marca = new Date().toISOString();
      await s.from('chat_messages').insert({
        conversation_id: conv, tenant_id: st().tenantId,
        direction: 'in', body: texto, sent_at: marca,
      });
      await s.from('chat_conversations').update({
        last_message: texto, last_message_at: marca, last_sender: 'contact',
      }).eq('id', conv);

      /* La cola es lo que despierta al motor. fire_at ya vencido: en la
         práctica no se espera los segundos de agrupación. */
      await s.from('chat_ai_queue').delete().eq('conversation_id', conv).eq('processed', false);
      await s.from('chat_ai_queue').insert({
        conversation_id: conv, tenant_id: st().tenantId, branch_id: st().branchId,
        from_phone: TEL,
        /* Centinelas, NO credenciales: sin token real el motor no puede
           entregarle el mensaje a nadie aunque lo intente. Es el segundo
           candado, ademas de que el banco no crea pedidos. */
        phone_id: 'PREVIEW-SIN-CREDENCIALES', access_token: 'PREVIEW-SIN-CREDENCIALES',
        batch_start: marca, fire_at: marca, processed: false,
      });

      /* Se llama al BANCO, nunca a la función de producción. */
      var url = (w.SUPABASE_URL || 'https://tblujfduscslxjmrjbdr.supabase.co')
              + '/functions/v1/delay-reply-banco';
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ convId: conv }) }).catch(function () {});

      /* Se espera la respuesta mirando el hilo. Hasta 45 s: el motor piensa
         dos veces por mensaje y con la carta grande se toma lo suyo. */
      var desde = marca, hallado = false;
      for (var i = 0; i < 45 && !hallado; i++) {
        await new Promise(function (r) { setTimeout(r, 1000); });
        var r = await s.from('chat_messages').select('body, sent_at')
          .eq('conversation_id', conv).eq('direction', 'out')
          .gt('sent_at', desde).order('sent_at').limit(5);
        (r.data || []).forEach(function (m) { hallado = true; burbuja(m.body, false); });
      }
      if (!hallado) {
        burbuja('(Paco no alcanzó a responder. Puede que el mensaje no necesitara respuesta, '
              + 'o que el motor esté tardando. Intenta de nuevo.)', false);
      }
    } catch (e) {
      console.error('[preview]', e);
      burbuja('(No se pudo probar: ' + (e.message || e) + ')', false);
    } finally {
      escribiendo(false);
      ocupado = false;
      if (caja) { caja.disabled = false; caja.focus(); }
    }
  }

  /* Borrar el ensayo: la conversación se queda, los mensajes no. */
  async function limpiar() {
    var t = hilo(); if (t) t.innerHTML = '';
    try {
      var s = sb();
      if (s && CONV) await s.from('chat_messages').delete().eq('conversation_id', CONV);
    } catch (e) {}
    burbuja('Escríbele a Paco como si fueras un cliente. Responde con tu carta y '
          + 'tu personalidad de verdad, pero no puede crear pedidos ni escribirle a nadie.', false);
  }

  function init() {
    var caja = document.getElementById('pvInput');
    var btn = document.getElementById('pvSend');
    var lim = document.getElementById('pvClear');
    if (!caja || !btn) return;
    btn.addEventListener('click', function () { enviar(caja.value); });
    caja.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(caja.value); }
    });
    if (lim) lim.addEventListener('click', limpiar);
    limpiar();
  }

  if (w._pos) w._pos.on('core:ready', init);
  w.posPacoPreview = { enviar: enviar, limpiar: limpiar };
})(window);
