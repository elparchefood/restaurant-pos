const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ESTADOS = ["en_preparacion", "listo", "en_camino", "entregado"];
// Normaliza al vocabulario canónico (el chat usa en_preparacion/en_camino; Ventas
// domicilio usa preparacion/camino/recibido en delivery_status). Unificamos aquí.
const NORM: Record<string, string> = {
  recibido: "en_preparacion", preparacion: "en_preparacion", en_preparacion: "en_preparacion",
  listo: "listo", camino: "en_camino", en_camino: "en_camino", entregado: "entregado",
};
// Mapa inverso hacia delivery_status (para que la pantalla de Ventas de domicilios lo lea)
const TO_DELIV: Record<string, string> = {
  en_preparacion: "preparacion", listo: "listo", en_camino: "camino", entregado: "entregado",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
}
async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPatch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
}
async function sbPost(path: string, body: unknown, ret = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, ...(ret ? { Prefer: "return=representation" } : {}) },
    body: JSON.stringify(body),
  });
  return ret ? await r.json() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const order_id = body.order_id;
    const estado = NORM[String(body.estado || "")] || body.estado;
    if (!order_id || !estado) return json({ error: "order_id y estado requeridos" }, 400);
    if (!ESTADOS.includes(estado)) return json({ error: "estado invalido" }, 400);

    const ord = await sbGet(`/pos_orders?id=eq.${order_id}&select=id,branch_id,tenant_id,channel,estado,estado_at,created_at`) as Array<Record<string, unknown>> | null;
    const order = ord?.[0];
    if (!order) return json({ error: "pedido no encontrado" }, 404);

    // Escribe AMBOS campos para que chat (estado) y Ventas de domicilios (delivery_status)
    // queden sincronizados. Marca delivered_at cuando queda entregado.
    const patch: Record<string, unknown> = {
      estado, estado_at: new Date().toISOString(),
      delivery_status: TO_DELIV[estado] || estado,
    };
    if (estado === "entregado") {
      patch.delivered_at = new Date().toISOString();
      /* ENTREGADO + PAGADO COMPLETO = VENTA CERRADA (15-ago): los pedidos del
         bot nacen open (la pantalla de domicilios solo muestra open) y nadie
         los cerraba — la caja no dejaba cerrar el dia con pedidos entregados
         y pagados "abiertos" (caso real: Isabella y Andres). Si la plata ya
         esta completa, al entregarlo se cierra solo. Si falta plata (efectivo
         contraentrega sin registrar), queda open para cobrarlo en caja. */
      /* ANTES esto era leer-y-decidir con un try/catch que tragaba cualquier
         error sin dejar rastro: el 21-ago tres pedidos entregados y pagados
         quedaron "open" y la caja no dejaba cerrar el turno (tercera vez que
         le pasaba a Sergio). Ahora la condicion y el cierre viajan JUNTOS en
         un UPDATE de la base (fn_cerrar_si_pagado): no hay lectura intermedia
         que pueda fallar por su lado. Y CADA entrega queda anotada en
         pos_diag con su resultado — si vuelve a quedar uno abierto, el
         rastro dice por que. */
      let cerro = -1;   // -1 = la llamada misma fallo
      try {
        const rc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_cerrar_si_pagado`, {
          method: "POST", headers: { ...H, "Content-Type": "application/json" },
          body: JSON.stringify({ p_order: order_id }),
        });
        if (rc.ok) cerro = Number(await rc.json());
        else console.error("[cerrar-si-pagado]", rc.status, (await rc.text()).slice(0, 200));
      } catch (e) { console.error("[cerrar-si-pagado]", String(e).slice(0, 200)); }
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/pos_diag`, {
          method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ donde: "cambiar-estado/entregado",
            mensaje: `pedido ${order_id} cierre=${cerro}`,
            extra: { order_id, cerro } }),
        });
      } catch (_e) { /* el rastro nunca frena la entrega */ }
    }
    await sbPatch(`/pos_orders?id=eq.${order_id}`, patch);

    /* EL AVISO AL CELULAR DEL CLIENTE (19-ago). Va AQUI y no en cada pantalla
       porque por esta funcion pasan TODOS los cambios de estado: el POS, el
       chat y el cron. Colgarlo en las pantallas seria el error de forma de
       siempre — tres sitios avisando y uno quedandose atras.
       Es best-effort y no se espera: si el aviso falla, el cambio de estado ya
       quedo guardado, que es lo que de verdad importa. */
    /* AHORA SE ESPERA LA RESPUESTA, y antes no. El motivo esta abajo, en el
       respaldo por WhatsApp: para decidir si hace falta escribirle hay que
       saber primero si el aviso al celular llego. El cambio de estado YA quedo
       guardado unas lineas arriba, asi que esperar aqui no arriesga el dato;
       solo demora la respuesta a la pantalla.

       Con tope de 4 segundos: si el servicio de avisos se queda colgado, se
       sigue adelante dando por hecho que NO llego. Equivocarse hacia ese lado
       manda un WhatsApp de mas; equivocarse hacia el otro deja al cliente sin
       enterarse de nada. */
    let pushLlego = false;
    try {
      const ctrl = new AbortController();
      const reloj = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${SUPABASE_URL}/functions/v1/avisar-cliente`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pedido", order_id, estado }),
      });
      clearTimeout(reloj);
      const d = r.ok ? await r.json() : null;
      pushLlego = Number(d?.enviados || 0) > 0;
      console.log(`[estado] ${order_id} -> ${estado} | avisos al celular: ${Number(d?.enviados || 0)}`);
    } catch (_e) { /* nunca bloquea el cambio de estado; se asume que no llego */ }

    /* Cuanto duro en el estado ANTERIOR. El reloj de la tarjeta se reinicia en
       cada cambio (cuenta desde `estado_at`), y aqui queda el tramo cerrado
       para poder ver el desglose: cuanto tardo en prepararse y cuanto en el
       camino. Antes un solo reloj corria desde que se creo el pedido, y por eso
       un domicilio ya entregado se veia "1 hora en camino".
       Es best-effort: si falla, el cambio de estado ya quedo guardado. */
    try {
      const antes  = String(order.estado || "");
      const desde  = String(order.estado_at || order.created_at || "");
      if (antes && antes !== estado && desde) {
        const seg = Math.round((Date.now() - new Date(desde).getTime()) / 1000);
        if (seg > 0 && seg < 60 * 60 * 24 * 7) {   // descarta fechas absurdas
          await sbPost(`/pos_domi_tiempos`, {
            tenant_id: order.tenant_id || null, branch_id: order.branch_id || null,
            order_id, estado: antes, desde,
            hasta: new Date().toISOString(), segundos: seg,
          });
        }
      }
    } catch (e) {
      console.error("[cambiar-estado] no se registro el tiempo:", String(e).slice(0, 200));
    }

    const cfgRow = await sbGet(`/ia_config?branch_id=eq.${order.branch_id}&select=estados_config,flujo_envio`) as Array<Record<string, unknown>> | null;
    const cfg = (cfgRow?.[0]?.estados_config || {}) as Record<string, Record<string, { etiqueta?: string; mensaje?: string }>>;
    const tipo = String(order.channel).toLowerCase() === "domicilio" ? "domicilio" : "llevar";
    const e = { ...((cfg[tipo] && cfg[tipo][estado]) || {}) };

    /* La CAJA DE ENVÍO del canvas gobierna este aviso. No lo reemplaza: lo
       gobierna. Sin caja configurada, todo se comporta como siempre.
         · apagada          -> no se avisa nada en ese estado
         · conectada        -> sale el mensaje de la pantalla de Estados
         · con frase propia -> sale la de la caja
       Sin esto, el aviso se disparaba SIEMPRE y el dueño no tenía cómo
       desconectarlo (planteado por Sergio). */
    const envio = (cfgRow?.[0]?.flujo_envio || null) as
      { activo?: boolean; estado?: string; usar_estados?: boolean; frase?: string } | null;
    if (envio && String(envio.estado || "en_camino") === estado) {
      if (envio.activo === false) {
        e.mensaje = "";                       // el estado cambia igual, pero no se avisa
      } else if (envio.usar_estados === false && String(envio.frase || "").trim()) {
        e.mensaje = String(envio.frase).trim();
      }
    }
    /* sin_mensaje: el que llama ya le hablo al cliente (Paco manda su frase de
       cierre al crear el pedido). El estado y la etiqueta cambian igual; solo
       se calla el aviso para no decirle lo mismo dos veces. */
    if (body.sin_mensaje === true) e.mensaje = "";

    const convs = await sbGet(`/chat_conversations?order_id=eq.${order_id}&select=id,channel,labels,tenant_id`) as Array<Record<string, unknown>> | null;
    let conv = convs?.[0];
    /* `soloMensaje`: la conversacion encontrada NO es la de este pedido, sino
       el chat general del cliente. Se le escribe, pero no se le ponen las
       etiquetas de estado: esas son del pedido, y ahi confundirian si tiene
       otro pedido abierto. */
    let soloMensaje = false;

    /* ── EL RESPALDO POR WHATSAPP (24-ago-2026) ──────────────────────────
       Pedido de Sergio: *"no hay necesidad de enviarle el Estado por WhatsApp
       a las personas que tenemos asegurado que le llega la notificacion. Pero
       si una persona tiene instalada la APP pero no tiene activadas las
       notificaciones si necesito que le lleguen las confirmaciones"*.

       Por que hacia falta: un pedido hecho por la APP no tiene conversacion
       enlazada, asi que este bloque no encontraba `conv` y no avisaba NADA.
       Comprobado sobre los tres pedidos por app que existen: los tres con cero
       conversacion enlazada y cero celulares con avisos. O sea, ninguno de los
       tres clientes se entero de nada. Uno de ellos es el caso que reporto
       Sergio.

       Se busca la conversacion del CLIENTE (no la del pedido) solo cuando el
       aviso al celular no llego. Si llego, no se hace nada: seria decirle lo
       mismo dos veces. */
    if (!conv && !pushLlego) {
      try {
        const oc = await sbGet(`/pos_orders?id=eq.${order_id}&select=cliente_id`) as Array<Record<string, unknown>> | null;
        const cid = oc?.[0]?.cliente_id;
        if (cid) {
          const cc = await sbGet(
            `/chat_conversations?cliente_id=eq.${cid}&channel=eq.whatsapp` +
            `&select=id,channel,labels,tenant_id,last_message_at&order=last_message_at.desc&limit=1`
          ) as Array<Record<string, unknown>> | null;
          if (cc?.[0]) {
            /* LA VENTANA DE 24 HORAS DE META. A alguien que no ha escrito en
               las ultimas 24 h no se le puede mandar texto libre: Meta lo
               rechaza. Si no se comprobara, el mensaje quedaria guardado en el
               chat como enviado y nunca llegaria — una mentira en pantalla,
               que es peor que no avisar. Se mira el ultimo mensaje ENTRANTE, no
               `last_message_at`, que se mueve tambien con lo que escribe el
               restaurante y daria una ventana abierta que no existe. */
            const ent = await sbGet(
              `/chat_messages?conversation_id=eq.${cc[0].id}&direction=eq.in` +
              `&select=sent_at&order=sent_at.desc&limit=1`
            ) as Array<Record<string, unknown>> | null;
            const ult = ent?.[0]?.sent_at ? new Date(String(ent[0].sent_at)).getTime() : 0;
            const horas = ult ? (Date.now() - ult) / 3600000 : 999;
            if (horas < 24) {
              conv = cc[0];
              soloMensaje = true;   // su chat general: no se le tocan las etiquetas
              console.log(`[estado] ${order_id}: sin aviso al celular, se responde por su chat de WhatsApp`);
            } else {
              console.log(`[estado] ${order_id}: su chat de WhatsApp lleva ${Math.round(horas)} h sin actividad suya — Meta no deja escribirle`);
            }
          } else {
            /* Sin chat de WhatsApp no hay por donde. Meta NO deja escribirle a
               alguien que nunca ha escrito: haria falta una plantilla aprobada,
               y hoy la de pedidos (`pedido_confirmado`) sigue en revision. Se
               deja anotado en vez de fallar en silencio, para que se vea el dia
               que se apruebe y se conecte aqui. */
            console.log(`[estado] ${order_id}: el cliente no tiene avisos ni chat de WhatsApp — no se le pudo avisar`);
          }
        }
      } catch (_e) { /* el respaldo nunca frena el cambio de estado */ }
    }
    if (conv) {
      // Etiquetas de estado EXCLUSIVAS: en CUALQUIER cambio de estado se quitan las
      // etiquetas de los OTROS estados y se pone la del estado actual (si tiene). Así
      // "En preparacion" desaparece al pasar a "En camino" y no quedan dobles. Las
      // etiquetas MANUALES del operador no se tocan (solo se filtran las de estado).
      const cur: string[] = (!soloMensaje && Array.isArray(conv.labels)) ? (conv.labels as string[]).slice() : [];
      const estadoEtqs = new Set<string>();
      ESTADOS.forEach((k) => { const et = cfg[tipo]?.[k]?.etiqueta; if (et) estadoEtqs.add(et); });
      const next = cur.filter((l) => !estadoEtqs.has(l));
      if (e.etiqueta && !next.includes(e.etiqueta)) next.push(e.etiqueta);
      const changed = JSON.stringify([...cur].sort()) !== JSON.stringify([...next].sort());
      if (changed && !soloMensaje) await sbPatch(`/chat_conversations?id=eq.${conv.id}`, { labels: next });
      /* Si el aviso al celular llego, no se le escribe: es el mismo aviso dos
         veces. Regla de Sergio, y la razon por la que arriba se espera la
         respuesta del servicio de avisos. */
      if (pushLlego && e.mensaje) {
        console.log(`[estado] ${order_id}: ya le llego al celular, no se le escribe por WhatsApp`);
        e.mensaje = "";
      }
      if (e.mensaje && String(e.mensaje).trim()) {
        const text = String(e.mensaje).trim();
        const msg = await sbPost(`/chat_messages`, {
          conversation_id: conv.id, tenant_id: conv.tenant_id || null,
          direction: "out", origen: "sistema", body: text, delivery_status: "sent",
        }, true) as Array<Record<string, unknown>>;
        const messageId = msg?.[0]?.id;
        if (["instagram", "facebook", "whatsapp"].includes(String(conv.channel))) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/meta-send`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
              body: JSON.stringify({ conversation_id: conv.id, text, message_id: messageId }),
            });
          } catch (_e) { /* si Meta falla, el mensaje queda guardado igual */ }
        }
      }
    }
    return json({ ok: true, estado });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
