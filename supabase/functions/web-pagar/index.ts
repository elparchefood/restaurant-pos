// web-pagar — el cliente paga su pedido desde la página: con su saldo o con
// una transferencia.
//
// EL PEDIDO NO SE MARCA PAGADO PORQUE LO DIGA EL NAVEGADOR. Con saldo, la base
// descuenta con bloqueo de fila y no deja saldo negativo. Con transferencia, se
// lee el comprobante y se cruza con el correo del banco — el mismo camino que
// las recargas, para no tener dos formas distintas de dar un pago por bueno.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_KEY") || "";
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPatch(path: string, data: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method: "PATCH", headers: H, body: JSON.stringify(data) });
  if (!r.ok) console.error("sbPatch", path, (await r.text()).slice(0, 200));
  return r.ok;
}
async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) { console.error("rpc", fn, (await r.text()).slice(0, 300)); return null; }
  return await r.json();
}
async function sha256(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; };

/* Igual que en las recargas: la verdad del pago está en la imagen y en el
   correo del banco, no en lo que manda la página. */
async function leerComprobante(url: string) {
  if (!OPENAI_KEY) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text:
`Comprobante de transferencia colombiano. Devuelve SOLO JSON:
{"monto":number,"referencia":"string o null","fecha":"YYYY-MM-DD o null","hora":"HH:MM en 24h o null","es_comprobante":true|false}
- "hora" es la hora EN QUE SE HIZO la transferencia, en 24h.
- "es_comprobante" false si la imagen no es un comprobante.` },
          { type: "image_url", image_url: { url } },
        ] }],
      }),
    });
    const d = await r.json();
    return JSON.parse(d?.choices?.[0]?.message?.content || "{}");
  } catch (e) { console.error("leerComprobante:", String(e).slice(0, 200)); return null; }
}

function mismaHora(a: unknown, b: unknown) {
  const hm = (v: unknown) => {
    const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
    return m ? String(Number(m[1])).padStart(2, "0") + ":" + m[2] : null;
  };
  const x = hm(a), y = hm(b);
  if (!x || !y) return null;
  const min = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  return Math.abs(min(x) - min(y)) <= 1;   // un minuto de margen
}

/* PAGADO ES PEDIDO EN COCINA (16-ago). Los pedidos web nacen invisibles para la
   cocina —primero paga, despues se prepara— pero al pagar nadie los volvia
   visibles: quedaban en "paid" y NINGUNA pantalla los mostraba. El cliente leia
   "ya estamos preparando tu pedido" y en el restaurante no habia aparecido
   nunca. Se descubrio en el primer ensayo de punta a punta (16-ago).
   El estado se pone con `cambiar-estado`, la misma puerta que usan el POS y
   Paco, para que ademas quede el delivery_status de la pantalla de domicilios. */
/* UN CANJE NO DEJA DE SER UN CANJE PORQUE PAGUE EL DOMICILIO (19-ago).
   El pedido nace con `payment_method = "puntos"`, y al cobrar el domicilio
   —o la parte en dinero de un premio mixto— esto lo pisaba con
   "Transferencia": en Cobra desaparecia que el plato se habia canjeado, que
   es justo lo que Sergio queria ver. Ahora se guardan los dos.
   Los campos `puntos_redimidos` y `puntos_valor` siguen intactos: de ahi
   salen los informes. Esto es solo lo que se LEE en pantalla. */
function conPuntos(o: Record<string, unknown>, metodo: string): string {
  return (Number(o.puntos_redimidos) || 0) > 0 ? "Puntos + " + metodo : metodo;
}

/* ══ LA CONFIRMACION DEL PEDIDO (22-ago-2026, pedido de Sergio) ═══════
   Una clienta pidio por la pagina, pago, y escribio desconfiada al WhatsApp
   a ver si el pedido habia llegado: nadie le habia dicho nada. Lo unico que
   recibia era el mensaje de los puntos, minutos despues.

   Va por PLANTILLA porque el cliente puede no haber escrito nunca al
   WhatsApp: fuera de las 24 horas Meta solo deja plantillas aprobadas.
   Plantilla "pedido_confirmado" (UTILITY), aprobada con Sergio el 22-ago.

   Es CORTESIA: si algo falla —la plantilla aun sin aprobar, sin token, sin
   telefono— se anota y ya. El pago NUNCA se cae por esto.

   Y se deja copia en el chat, como el aviso de puntos, para que Sergio vea
   con sus ojos que salio. */
async function confirmarPorWhatsApp(orderId: string) {
  try {
    const oR = await sbGet(`/pos_orders?id=eq.${orderId}&select=*&limit=1`) as Array<Record<string, unknown>> | null;
    const o = oR?.[0];
    if (!o) return;

    /*  SOLO PARA LOS PEDIDOS DE LA PAGINA (28-ago-2026, visto en servicio).

        Este mensaje existe porque quien pide por la pagina no habla con nadie:
        paga y se queda sin saber si llego. Al que pide por WhatsApp lo esta
        atendiendo una persona —o Paco— y ya le dijo el total y que va en
        preparacion. Mandarle ademas la confirmacion de la pagina es hablarle
        dos veces de lo mismo, y encima con un formato que no es el de su
        conversacion.

        Le salio a un cliente que estaba escribiendo por WhatsApp: el pedido no
        tenia `origen` de web y aun asi se le mando. Se comprueba aqui, en el
        momento de mandarlo, y no en quien llama: si mañana otra pantalla cobra
        por esta misma via, el mensaje sigue saliendo solo para la pagina.   */
    if (String(o.origen || "") !== "web") {
      console.log(`[web-pagar] ${orderId}: no viene de la pagina (origen=${o.origen ?? "null"}) — sin confirmacion`);
      return;
    }

    const cR = await sbGet(`/pos_clientes?id=eq.${o.cliente_id}&select=nombre,telefono&limit=1`) as Array<Record<string, unknown>> | null;
    const tel10 = String(cR?.[0]?.telefono || "").replace(/\D/g, "").slice(-10);
    if (tel10.length !== 10) return;
    /* Solo el PRIMER nombre: "Hola Katherin" suena a persona; el nombre
       completo suena a factura. */
    const nombre = String(cR?.[0]?.nombre || "").trim().split(/\s+/)[0] || "¡Hola!";

    const its = await sbGet(`/pos_order_items?order_id=eq.${orderId}&select=quantity,name,product_name&limit=20`) as Array<Record<string, unknown>> | null;
    /* EN UNA SOLA LINEA a proposito: Meta NO acepta saltos de linea dentro
       de una variable de plantilla — el envio entero se rechaza. */
    const resumen = (its || [])
      .map(i => `${i.quantity}x ${String(i.name || i.product_name || "").trim()}`)
      .filter(x => x.length > 3).join(", ").slice(0, 300) || "Tu pedido";

    const totalTxt = "$" + Math.round(Number(o.total) || 0).toLocaleString("es-CO");

    /* La direccion vive en las notas del pedido (asi la guarda web-pedido);
       si es para recoger, se dice claro en vez de dejar el hueco vacio. */
    const notas = String(o.notes || "");
    let destino = notas.split("[")[0].trim().replace(/\s+/g, " ").slice(0, 120);
    if (!destino || String(o.channel) !== "domicilio") destino = "Recoger en el local";

    const chR = await sbGet(`/chat_channels?branch_id=eq.${o.branch_id}&channel=eq.whatsapp&select=meta&limit=1`) as Array<Record<string, unknown>> | null;
    const meta = (chR?.[0]?.meta || {}) as Record<string, string>;
    if (!meta.access_token || !meta.phone_id) return;

    /* El nombre de la plantilla es configurable, como el aviso de puntos:
       otro restaurante puede tener la suya con otro nombre. */
    let plantilla = "pedido_confirmado", idioma = "es";
    try {
      const cfgR = await sbGet(`/ia_config?branch_id=eq.${o.branch_id}&select=estados_config&limit=1`) as Array<Record<string, unknown>> | null;
      const pc = ((cfgR?.[0]?.estados_config as Record<string, unknown>) || {}).pedido_web as Record<string, unknown> | undefined;
      if (pc && pc.activo === false) return;   // el dueño lo apago
      if (pc?.plantilla) plantilla = String(pc.plantilla);
      if (pc?.idioma) idioma = String(pc.idioma);
    } catch { /* con los valores por defecto basta */ }

    const params = [nombre, resumen, totalTxt, destino];
    const res = await fetch(`https://graph.facebook.com/v22.0/${meta.phone_id}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${meta.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: "57" + tel10, type: "template",
        template: { name: plantilla, language: { code: idioma },
          components: [{ type: "body", parameters: params.map(p => ({ type: "text", text: p || "-" })) }] },
      }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      console.error("[web-pagar] confirmacion no salio:", JSON.stringify(data).slice(0, 300));
      return;
    }
    const waId = ((data.messages as Array<Record<string, string>>)?.[0]?.id) || null;

    /* La copia en el chat, igual que el aviso de puntos: si el cliente no
       tiene conversacion se crea, para poder abrirla y ver que salio. */
    const texto = `¡Hola ${nombre}! 🍟 Recibimos tu pedido y ya está en preparación 👨‍🍳\n\n`
      + `📋 Pedido: ${resumen}\n💰 Total: ${totalTxt}\n📍 Va para: ${destino}\n\n`
      + "Te avisamos apenas salga en camino ☺️";
    const convR = await sbGet(`/chat_conversations?branch_id=eq.${o.branch_id}&channel=eq.whatsapp&contact_handle=like.*${tel10}&select=id,tenant_id&limit=1`) as Array<Record<string, unknown>> | null;
    let conv = convR?.[0];
    if (!conv) {
      const creada = await fetch(`${SUPABASE_URL}/rest/v1/chat_conversations`, {
        method: "POST", headers: { ...H, "Prefer": "return=representation" },
        body: JSON.stringify({ tenant_id: o.tenant_id, branch_id: o.branch_id, channel: "whatsapp",
          contact_handle: "57" + tel10, contact_name: nombre, status: "open" }),
      });
      if (creada.ok) conv = ((await creada.json()) as Array<Record<string, unknown>>)?.[0];
    }
    if (conv) {
      await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, { method: "POST", headers: H,
        body: JSON.stringify({ conversation_id: conv.id, tenant_id: conv.tenant_id ?? o.tenant_id,
          direction: "out", origen: "sistema", external_id: waId, body: texto,
          sent_at: new Date().toISOString(), delivery_status: "sent" }) });
      await sbPatch(`/chat_conversations?id=eq.${conv.id}`, { last_message: texto,
        last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false });
    }
  } catch (e) {
    console.error("[web-pagar] confirmacion:", String(e).slice(0, 200));
  }
}

/* ══ EL DESGLOSE DEL PAGO (23-ago-2026) ═══════════════════════════════
   La caja saca el reparto por metodo de `pos_payments` (caja.js →
   loadPagosPorMetodo). La caja y el chat siempre escribian ahi; la PAGINA
   no, y sus pedidos caian al camino de respaldo.

   Con transferencia sola el respaldo acierta. Donde se rompe es en un pago
   MIXTO: `conPuntos()` guarda "Puntos + Transferencia", que no es ningun
   metodo configurado, y todo el monto —incluida la parte de puntos— se
   sumaria a la casilla equivocada.

   Los ids salen de la configuracion del PROPIO restaurante, nunca escritos
   aqui: cada negocio nombra sus metodos como quiere.

   Es best-effort: si falla, el respaldo de la caja sigue dando el total
   correcto. Nunca tumbar un pago por el desglose. */
async function idMetodo(branchId: string, buscar: string): Promise<string> {
  try {
    const r = await sbGet(`/ia_config?branch_id=eq.${branchId}&select=pagos&limit=1`) as Array<Record<string, unknown>> | null;
    const ms = (((r?.[0]?.pagos as Record<string, unknown>) || {}).metodos as Array<Record<string, unknown>>) || [];
    const norm = (x: unknown) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const q = norm(buscar);
    /* Por id exacto primero (asi llegan "__saldo" y "__puntos"), luego por
       nombre, y por ultimo por si es digital (transferencia). */
    const porId = ms.find(m => String(m.id || "") === buscar);
    if (porId) return String(porId.id);
    const porNom = ms.find(m => norm(m.nombre) === q);
    if (porNom) return String(porNom.id);
    if (q.includes("transfer")) {
      const dig = ms.find(m => m.digital === true && String(m.id || "").indexOf("__") !== 0);
      if (dig) return String(dig.id);
    }
  } catch (_e) { /* sin config, se guarda el texto tal cual */ }
  return buscar;
}

async function desglosarPago(o: Record<string, unknown>, metodo: string, total: number) {
  try {
    const bid = String(o.branch_id || "");
    const puntos = Math.round(Number(o.puntos_valor) || 0);
    const filas: Array<Record<string, unknown>> = [];
    /* Lo pagado con puntos va en SU propia fila: si se sumara al otro metodo,
       el arqueo diria que entro plata que nunca entro. */
    if (puntos > 0 && puntos <= total) {
      filas.push({ method: await idMetodo(bid, "__puntos"), amount: puntos });
    }
    const resto = total - (puntos > 0 && puntos <= total ? puntos : 0);
    if (resto > 0) filas.push({ method: await idMetodo(bid, metodo), amount: resto });
    for (const f of filas) {
      await fetch(`${SUPABASE_URL}/rest/v1/pos_payments`, {
        method: "POST", headers: H,
        body: JSON.stringify({ order_id: o.id, branch_id: bid, tenant_id: o.tenant_id,
          method: f.method, amount: f.amount }),
      });
    }
  } catch (e) {
    console.error("[web-pagar] desglose:", String(e).slice(0, 200));
  }
}

async function aCocina(orderId: string) {
  try {
    await sbPatch(`/pos_orders?id=eq.${orderId}`, { visible_cocina: true });
    await fetch(`${SUPABASE_URL}/functions/v1/cambiar-estado`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, estado: "en_preparacion", sin_mensaje: true }),
    });
  } catch (e) { console.error("[web-pagar] a cocina:", String(e).slice(0, 200)); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;

    const ses = await sbGet(
      `/pos_web_sesiones?token_hash=eq.${encodeURIComponent(await sha256(String(b.token || "")))}&select=*&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const s = ses?.[0];
    if (!s || new Date(String(s.expira_at)).getTime() < Date.now()) {
      return json({ ok: false, razon: "sesion", mensaje: "Tu sesión se venció. Vuelve a entrar." });
    }
    const tenantId  = String(s.tenant_id);
    const clienteId = String(s.cliente_id);

    /* El pedido tiene que ser SUYO y estar sin pagar. Sin esta comprobación,
       cualquiera podría pagar —o marcar como pagado— el pedido de otro. */
    const ords = await sbGet(
      `/pos_orders?id=eq.${String(b.order_id || "")}&select=id,tenant_id,total,total_final,delivery_fee,status,cliente_id,branch_id,channel,puntos_redimidos,puntos_valor&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const o = ords?.[0];
    if (!o || String(o.cliente_id) !== clienteId) {
      return json({ ok: false, razon: "pedido", mensaje: "No encontramos ese pedido." });
    }
    if (String(o.status) === "paid") {
      return json({ ok: true, yaPagado: true, mensaje: "Ese pedido ya está pagado 🙂" });
    }
    /* Lo que se cobra es la comida MAS el domicilio. En pos_orders el `total`
       no lleva el domicilio —viaja aparte en delivery_fee— asi que sumarlo aqui
       no es un extra: es el precio real del pedido. Sin esto se cobraria de
       menos justo el valor del domi. */
    const total    = Math.round(num(o.total_final ?? o.total)) + Math.round(num(o.delivery_fee));
    const branchId = o.branch_id ? String(o.branch_id) : null;
    const metodo   = String(b.metodo || "saldo");

    // ── A) CON SALDO ────────────────────────────────────────────────────
    if (metodo === "saldo") {
      const sal = await rpc("fn_saldo_cliente", { p_tenant: tenantId, p_cliente: clienteId }) as unknown;
      const saldo = Math.round(num(Array.isArray(sal) ? (sal[0] as Record<string, unknown>)?.saldo : sal));
      if (saldo < total) {
        return json({ ok: false, razon: "sin_saldo", saldo,
          mensaje: `Te faltan $${(total - saldo).toLocaleString("es-CO")} de saldo. Recarga y vuelve a intentar.` });
      }
      /* El descuento lo hace la base con bloqueo de fila y sin permitir
         negativos: dos toques seguidos no pueden cobrar dos veces. */
      const mov = await rpc("fn_saldo_mover", {
        p_tenant: tenantId, p_cliente: clienteId, p_motivo: "consumo",
        p_monto: -total, p_branch: branchId, p_order: o.id,
        p_ref: "pedido:" + String(o.id), p_detalle: "Pago del pedido desde la página",
      });
      if (mov === null) {
        return json({ ok: false, razon: "saldo_error",
          mensaje: "No pudimos descontar tu saldo. Intenta de nuevo." });
      }
      /* `paid_amount` es lo que de verdad entro por este pedido. Sin el, el
         cuadre de caja lo descarta y hay que recogerlo con una regla aparte
         —que es justo como se cuenta la misma plata dos veces—.
         El metodo se guarda con el id de la configuracion (`__saldo`) para que
         todas las pantallas lo reconozcan igual que a los demas. */
      await sbPatch(`/pos_orders?id=eq.${o.id}`, {
        status: "paid", payment_method: conPuntos(o, "__saldo"), paid_amount: total,
        closed_at: new Date().toISOString(),
      });
      await desglosarPago(o, "__saldo", total);
      await aCocina(String(o.id));
      await confirmarPorWhatsApp(String(o.id));
      const sal2 = await rpc("fn_saldo_cliente", { p_tenant: tenantId, p_cliente: clienteId }) as unknown;
      return json({ ok: true, metodo: "saldo",
        saldo: Math.round(num(Array.isArray(sal2) ? (sal2[0] as Record<string, unknown>)?.saldo : sal2)),
        mensaje: "¡Listo! Pagaste con tu saldo 🎉 Ya estamos preparando tu pedido." });
    }

    // ── B) CON TRANSFERENCIA ────────────────────────────────────────────
    const comprobante = String(b.comprobante_url || "").trim();
    if (!comprobante) {
      return json({ ok: false, razon: "sin_comprobante",
        mensaje: "Súbenos la foto del comprobante para confirmar tu pago." });
    }
    const leido = await leerComprobante(comprobante);
    if (!leido || leido.es_comprobante === false) {
      return json({ ok: false, razon: "ilegible",
        mensaje: "No pude leer ese comprobante 🤔. Mándanos una captura completa donde se vea el valor y la hora." });
    }
    const monto = Math.round(num(leido.monto));
    /* Se acepta pagar de más (una propina, un redondeo), nunca de menos. */
    if (monto < total) {
      return json({ ok: false, razon: "monto",
        mensaje: `Ese comprobante es por $${monto.toLocaleString("es-CO")} y tu pedido son $${total.toLocaleString("es-CO")}.` });
    }

    const ver = await fetch(`${SUPABASE_URL}/functions/v1/verificar-transferencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ branch_id: branchId, monto: String(monto), horas: 24,
        fecha: leido.fecha || null, hora: leido.hora || null, order_id: o.id }),
    }).then((x) => x.json()).catch(() => null);

    if (!ver || ver.ok !== true) {
      return json({ ok: false, razon: "no_llego", pendiente: true,
        mensaje: "Todavía no vemos esa transferencia en nuestra cuenta. Puede tardar unos minutos — vuelve a intentar en un momento." });
    }
    if (mismaHora(ver.hora_txn, leido.hora) === false) {
      return json({ ok: false, razon: "hora",
        mensaje: "La hora del comprobante no coincide con la transferencia que recibimos. Revisa que sea el correcto." });
    }

    await sbPatch(`/pos_orders?id=eq.${o.id}`, {
      status: "paid", payment_method: conPuntos(o, "Transferencia"), paid_amount: total,
      closed_at: new Date().toISOString(),
    });
    await desglosarPago(o, "Transferencia", total);
    await aCocina(String(o.id));
    await confirmarPorWhatsApp(String(o.id));
    return json({ ok: true, metodo: "transferencia", referencia: ver.referencia || null,
      mensaje: "¡Listo! Confirmamos tu pago 🎉 Ya estamos preparando tu pedido." });
  } catch (e) {
    console.error("web-pagar:", e);
    return json({ ok: false, razon: "error", mensaje: "Algo falló de nuestro lado. Intenta de nuevo." });
  }
});
