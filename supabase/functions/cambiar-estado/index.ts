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
    if (estado === "entregado") patch.delivered_at = new Date().toISOString();
    await sbPatch(`/pos_orders?id=eq.${order_id}`, patch);

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
    const conv = convs?.[0];
    if (conv) {
      // Etiquetas de estado EXCLUSIVAS: en CUALQUIER cambio de estado se quitan las
      // etiquetas de los OTROS estados y se pone la del estado actual (si tiene). Así
      // "En preparacion" desaparece al pasar a "En camino" y no quedan dobles. Las
      // etiquetas MANUALES del operador no se tocan (solo se filtran las de estado).
      const cur: string[] = Array.isArray(conv.labels) ? (conv.labels as string[]).slice() : [];
      const estadoEtqs = new Set<string>();
      ESTADOS.forEach((k) => { const et = cfg[tipo]?.[k]?.etiqueta; if (et) estadoEtqs.add(et); });
      const next = cur.filter((l) => !estadoEtqs.has(l));
      if (e.etiqueta && !next.includes(e.etiqueta)) next.push(e.etiqueta);
      const changed = JSON.stringify([...cur].sort()) !== JSON.stringify([...next].sort());
      if (changed) await sbPatch(`/chat_conversations?id=eq.${conv.id}`, { labels: next });
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
