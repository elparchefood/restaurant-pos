/* ══════════════════════════════════════════════════════════════════════════
   RECORDAR COMPROBANTE — el vigilante de los pedidos que se quedaron colgados

   El bot solo se despierta cuando el cliente escribe. Si el cliente pide,
   escoge transferencia, recibe el QR y desaparece, la conversación se queda
   esperando PARA SIEMPRE: el pedido no existe, no sale en ventas, no sale en
   cocina, y nadie —ni el dueño ni el bot— se entera de que se perdió la venta.

   Esta función es lo único del sistema que corre sin que nadie escriba. La
   despierta pg_cron cada 5 minutos y hace dos cosas, en este orden:

     1. Pasados los minutos configurados: le escribe UNA vez al cliente.
     2. Pasados otros tantos sin respuesta: le marca la conversación al dueño
        (human_takeover) y no vuelve a tocarla.

   Lo que NO hace, a propósito: no borra el pedido en espera. El cliente puede
   aparecer a los 40 minutos con el comprobante en la mano, y borrárselo sin
   que una persona lo mire es un problema que llega por teléfono.

   Todo lo configurable vive en la caja de Pago del canvas (ia_config
   .flujo_pasos, campo "pago"): los minutos, y si el recordatorio es una frase
   exacta o el bot lo dice con sus palabras.
   ══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) { console.error("sbGet", path, await r.text()); return null; }
  return await r.json() as Array<Record<string, unknown>>;
}

async function sbPatch(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error("sbPatch", path, await r.text());
}

async function sbPost(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error("sbPost", path, await r.text());
}

/* La caja de Pago del canvas. Sin caja, los valores de siempre. */
function cfgEspera(cfg: Record<string, unknown> | undefined) {
  const p = cfg && Array.isArray(cfg.flujo_pasos)
    ? (cfg.flujo_pasos as Array<Record<string, unknown>>).find(x => x && x.campo === "pago" && x.activo !== false)
    : null;
  return {
    minutos: p && p.espera_comprobante_min != null ? Number(p.espera_comprobante_min) || 0 : 30,
    modo:    p && p.espera_modo === "ia" ? "ia" : "fija",
    texto:   p ? String(p.espera_texto || "") : "",
    guia:    p ? String(p.espera_guia  || "") : "",
  };
}

/* El recordatorio con las palabras del restaurante. Si el modelo falla se
   devuelve la frase de siempre: quedarse callado seria peor que repetirse. */
async function redactarRecordatorio(
  guia: string, botName: string, tono: string, historial: string,
): Promise<string> {
  const sys =
    `Eres ${botName}, el asistente de un restaurante por WhatsApp. Tono ${tono}.\n` +
    `El cliente ya confirmó su pedido y eligió pagar por transferencia, pero NO ha enviado el comprobante.\n` +
    `Escríbele UN mensaje corto (máximo 2 frases) recordándoselo.\n` +
    (guia ? `Instrucción del restaurante: ${guia}\n` : "") +
    `PROHIBIDO: repetir el pedido completo, dar de nuevo el número de cuenta, presionar o reclamar.\n` +
    `Últimos mensajes de la conversación:\n${historial}`;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: sys }],
        max_tokens: 120, temperature: 0.8,
      }),
    });
    if (r.ok) {
      const d = await r.json() as Record<string, unknown>;
      const txt = ((d.choices as Array<Record<string, unknown>>)?.[0]
        ?.message as Record<string, string> | undefined)?.content;
      if (txt && txt.trim()) return txt.trim();
    } else {
      console.error("recordatorio, OpenAI:", await r.text());
    }
  } catch (e) { console.error("recordatorio:", e); }
  return "";
}

const POR_DEFECTO = "Quedó pendiente del comprobante para poderte preparar ☺️ Envíamelo como imagen 🧾";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const revisadas: string[] = [];
  const recordadas: string[] = [];
  const escaladas: string[] = [];

  try {
    /* Solo las que están esperando comprobante. Son pocas por definición: una
       conversación sale de aquí en cuanto el cliente manda la foto. */
    const convs = await sbGet(
      `/rest/v1/chat_conversations?pago_pendiente=eq.true&human_takeover=eq.false` +
      `&select=id,tenant_id,branch_id,contact_handle,last_message_at,pending_order_data&limit=200`
    );
    if (!convs || !convs.length) {
      return new Response(JSON.stringify({ ok: true, revisadas: 0 }), { headers: CORS });
    }

    /* La configuración y las credenciales se leen UNA vez por sede, no una vez
       por conversación: diez clientes esperando de la misma sede son diez
       consultas idénticas que no hacen falta. */
    const porSede = new Map<string, { cfg?: Record<string, unknown>; canal?: Record<string, string> }>();

    for (const c of convs) {
      const convId   = String(c.id);
      const branchId = String(c.branch_id || "");
      if (!branchId) continue;
      revisadas.push(convId);

      if (!porSede.has(branchId)) {
        const cfgRes = await sbGet(
          `/rest/v1/ia_config?branch_id=eq.${branchId}&select=flujo_pasos,bot,perfil,tono&limit=1`);
        const chRes = await sbGet(
          `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&select=meta&limit=1`);
        let meta: Record<string, string> = {};
        const raw = chRes?.[0]?.meta;
        if (typeof raw === "string") { try { meta = JSON.parse(raw); } catch { /* sin credenciales */ } }
        else if (raw && typeof raw === "object") meta = raw as Record<string, string>;
        porSede.set(branchId, { cfg: cfgRes?.[0], canal: meta });
      }
      const { cfg, canal } = porSede.get(branchId)!;
      const esp = cfgEspera(cfg);

      /* En 0 el restaurante pidió expresamente esperar sin límite. */
      if (esp.minutos <= 0) continue;

      const pend = (c.pending_order_data || {}) as Record<string, unknown>;
      const desde = c.last_message_at ? new Date(String(c.last_message_at)).getTime() : 0;
      if (!desde) continue;
      const minutos = (Date.now() - desde) / 60000;

      /* ── Segunda vuelta: ya se le recordó y sigue sin llegar ────────── */
      if (pend._recordatorio_en) {
        const desdeRec = new Date(String(pend._recordatorio_en)).getTime();
        if ((Date.now() - desdeRec) / 60000 < esp.minutos) continue;
        /* No se le escribe otra vez al cliente: se le pasa al dueño. Insistir
           dos veces por un comprobante es acoso, no servicio. */
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
          human_takeover: true,
          pending_order_data: { ...pend, _escalado_en: new Date().toISOString() },
        });
        escaladas.push(convId);
        continue;
      }

      /* ── Primera vuelta: el recordatorio ────────────────────────────── */
      if (minutos < esp.minutos) continue;

      const phoneId     = canal?.phone_id || "";
      const accessToken = canal?.access_token || "";
      const to          = String(c.contact_handle || "");
      if (!phoneId || !accessToken || !to) {
        console.error("sin credenciales de WhatsApp para la sede", branchId);
        continue;
      }

      let msg = "";
      if (esp.modo === "ia") {
        const hist = await sbGet(
          `/rest/v1/chat_messages?conversation_id=eq.${convId}&select=direction,body&order=sent_at.desc&limit=6`);
        const lineas = (hist || []).reverse()
          .map(m => `${m.direction === "in" ? "Cliente" : "Tú"}: ${String(m.body || "").slice(0, 160)}`)
          .join("\n");
        const botCfg = (cfg?.bot as Record<string, string>) || {};
        const perfil = (cfg?.perfil as Record<string, string>) || {};
        msg = await redactarRecordatorio(
          esp.guia, botCfg.nombre || perfil.nombre || "el asistente",
          botCfg.tono || String(cfg?.tono || "cercano"), lineas);
      }
      if (!msg) msg = esp.texto || POR_DEFECTO;

      const waRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", to, recipient_type: "individual",
          type: "text", text: { body: msg },
        }),
      });
      const enviado = waRes.ok;
      if (!enviado) console.error("recordatorio, WhatsApp:", await waRes.text());

      /* El mensaje se guarda aunque el envío falle: el dueño tiene que poder
         ver en el chat qué intentó decir el bot. */
      await sbPost(`/rest/v1/chat_messages`, {
        conversation_id: convId, tenant_id: c.tenant_id, direction: "out", origen: "bot",
        body: msg, delivery_status: enviado ? "sent" : "failed",
        sent_at: new Date().toISOString(),
      });

      /* La marca se pone SIEMPRE, haya salido o no: si se pusiera solo cuando
         sale bien, una sede con el token vencido recibiría un intento cada
         cinco minutos para siempre. */
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
        pending_order_data: { ...pend, _recordatorio_en: new Date().toISOString() },
        last_message: msg, last_message_at: new Date().toISOString(),
        last_sender: "agent", last_read: false,
      });
      recordadas.push(convId);
    }

    console.log(`revisadas ${revisadas.length}, recordadas ${recordadas.length}, escaladas ${escaladas.length}`);
    return new Response(JSON.stringify({
      ok: true, revisadas: revisadas.length,
      recordadas: recordadas.length, escaladas: escaladas.length,
    }), { headers: CORS });

  } catch (e) {
    console.error("recordar-comprobante:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
});
