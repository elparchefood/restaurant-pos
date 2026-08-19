// avisar-cliente — los avisos al celular del cliente.
//
// UN SOLO SITIO PARA TODOS LOS AVISOS. Empezo siendo `avisar-pedido` y a las
// horas ya hacia falta el de las recargas; con dos funciones, el dia que se
// cambie el formato del envio o se agregue una regla (horarios, apagar avisos)
// habria que acordarse de tocar las dos. Aqui vive el texto de cada aviso y la
// mecanica de mandarlo; quien lo dispara solo dice QUE paso.
//
// Tipos que maneja hoy:
//   pedido  — cambio de estado (en preparacion · en camino/listo · entregado)
//   recarga — saldo acreditado, con su bono
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC")  || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@cobrapos.app";

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
async function sbDel(path: string) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method: "DELETE", headers: H });
}

/* La plata, como la lee cualquiera: $55.000, no 55000. */
function cop(n: number) {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
}

/* EL TEXTO DE CADA AVISO, escrito desde el lado del cliente y no del sistema:
   nadie quiere recibir "estado: en_preparacion". El de recoger dice algo
   distinto al de domicilio, que es la diferencia que le importa a quien
   espera. */
function textoPedido(estado: string, esDomicilio: boolean, negocio: string) {
  if (estado === "en_preparacion") {
    return { titulo: "Manos a la obra 👨‍🍳", cuerpo: `En ${negocio} ya están preparando tu pedido.` };
  }
  if (estado === "listo") {
    return esDomicilio
      ? { titulo: "Tu pedido está listo", cuerpo: "Sale para tu casa en un momento." }
      : { titulo: "¡Listo para recoger! 🛍️", cuerpo: `Te esperamos en ${negocio}.` };
  }
  if (estado === "en_camino") {
    return { titulo: "Tu pedido va en camino 🛵", cuerpo: "Ya salió para tu dirección." };
  }
  if (estado === "entregado") {
    return { titulo: "¡Buen provecho! 🍟", cuerpo: "Tu pedido fue entregado. Gracias por pedirnos." };
  }
  return null;
}

/* LA RECARGA. Sergio pidio tres cosas: que diga que fue exitosa, cuanto quedo,
   y una frase que invite a pedir. El bono va SIEMPRE que exista — es lo que
   hace que la proxima recarga sea mas grande, y en la notificacion es donde
   mas se ve. Sin bono no se menciona: un "+$0 de regalo" es peor que nada. */
function textoRecarga(monto: number, bono: number, saldo: number) {
  const cuerpo = bono > 0
    ? `Recargaste ${cop(monto)} y te regalamos ${cop(bono)}. Tienes ${cop(saldo)} listos: pide sin sacar la tarjeta 🍟`
    : `Recargaste ${cop(monto)}. Tienes ${cop(saldo)} listos: pide sin sacar la tarjeta 🍟`;
  return { titulo: "¡Recarga lista! 🎉", cuerpo };
}

/* Manda el aviso a TODOS los celulares de ese cliente. Devuelve cuantos
   salieron y cuantos se dieron de baja. */
async function enviar(clienteId: string, titulo: string, cuerpo: string, etiqueta: string) {
  const subs = await sbGet(
    `/pos_web_push?cliente_id=eq.${clienteId}&select=id,endpoint,p256dh,auth`
  ) as Array<Record<string, unknown>> | null;
  if (!subs || !subs.length) return { enviados: 0, muertos: 0, razon: "sin_celulares" };

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  /* La ETIQUETA hace que un aviso nuevo REEMPLACE al anterior del mismo asunto.
     Sin esto, un pedido con tres cambios de estado deja tres avisos amontonados
     y el cliente no sabe cual vale. */
  const payload = JSON.stringify({ titulo, cuerpo, tag: etiqueta });

  let enviados = 0, muertos = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({
        endpoint: String(s.endpoint),
        keys: { p256dh: String(s.p256dh), auth: String(s.auth) },
      }, payload);
      enviados++;
      await sbPatch(`/pos_web_push?id=eq.${s.id}`, { ultimo_envio: new Date().toISOString() });
    } catch (e) {
      /* 404 o 410 = ese celular desinstalo la app o revoco el permiso. Se
         borra: guardarlo es acumular basura y reintentar cada vez contra una
         puerta que ya no existe. */
      const cod = Number((e as { statusCode?: number })?.statusCode || 0);
      if (cod === 404 || cod === 410) {
        await sbDel(`/pos_web_push?id=eq.${s.id}`);
        muertos++;
      } else {
        console.error("push fallo:", cod, String(e).slice(0, 200));
      }
    }
  }
  return { enviados, muertos };
}

/* El nombre que ve el cliente es el de la MARCA, igual que en su pagina: la
   cuenta suele estar registrada con el correo del dueño. */
async function nombreNegocio(tenantId: string) {
  try {
    const m = await sbGet(`/brands?tenant_id=eq.${tenantId}&select=name&order=created_at&limit=1`) as Array<Record<string, unknown>> | null;
    if (m?.[0]?.name) return String(m[0].name);
  } catch (_e) { /* con el generico basta */ }
  return "el restaurante";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok: false, razon: "sin_llaves" });
    const b = await req.json();
    const tipo = String(b.tipo || "pedido");
    /* VISTA PREVIA: devuelve el texto tal como le llegaria al cliente, sin
       mandar nada. Sirve para revisar la redaccion sin tener que provocar una
       recarga o un cambio de estado de verdad. */
    const soloVer = b.previsualizar === true;

    // ── RECARGA ACREDITADA ──────────────────────────────────────────────
    if (tipo === "recarga") {
      const clienteId = String(b.cliente_id || "");
      if (!clienteId) return json({ error: "cliente_id requerido" }, 400);
      const t = textoRecarga(Number(b.monto || 0), Number(b.bono || 0), Number(b.saldo || 0));
      if (soloVer) return json({ ok: true, previsualizacion: t });
      /* Etiqueta fija: si recarga dos veces seguidas, el segundo aviso pisa al
         primero — y el que vale es el ultimo, que trae el saldo bueno. */
      const r = await enviar(clienteId, t.titulo, t.cuerpo, "recarga");
      return json({ ok: true, ...r });
    }

    // ── CAMBIO DE ESTADO DE UN PEDIDO ───────────────────────────────────
    const orderId = String(b.order_id || "");
    const estado  = String(b.estado || "");
    if (!orderId || !estado) return json({ error: "order_id y estado requeridos" }, 400);
    if (!textoPedido(estado, true, "x")) return json({ ok: true, razon: "estado_sin_aviso" });
    if (soloVer) {
      return json({ ok: true, previsualizacion: {
        domicilio: textoPedido(estado, true, String(b.negocio || "El Parche Food")),
        recoger:   textoPedido(estado, false, String(b.negocio || "El Parche Food")),
      } });
    }

    const ord = await sbGet(
      `/pos_orders?id=eq.${orderId}&select=id,cliente_id,tenant_id,channel&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const o = ord?.[0];
    /* Sin cliente no hay a quien avisarle: los pedidos de mostrador no tienen
       dueño. No es un error, simplemente no aplica. */
    if (!o || !o.cliente_id) return json({ ok: true, razon: "sin_cliente" });

    const negocio = await nombreNegocio(String(o.tenant_id));
    const t = textoPedido(estado, String(o.channel || "") === "domicilio", negocio)!;
    const r = await enviar(String(o.cliente_id), t.titulo, t.cuerpo, "pedido-" + orderId);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error("avisar-cliente:", e);
    return json({ error: String(e) }, 500);
  }
});
