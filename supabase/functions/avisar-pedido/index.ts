// avisar-pedido — el aviso al celular del cliente cuando su pedido avanza.
//
// Es el PRIMER uso de las notificaciones: la infraestructura (permiso, service
// worker, llaves VAPID, tabla `pos_web_push`) estaba construida desde el 16-ago
// y sin estrenar, esperando a que Sergio dijera que se notifica. Decidio esto:
// en preparacion, en camino / listo, y entregado.
//
// La llama `cambiar-estado`, que es por donde pasan TODOS los cambios (el POS,
// el chat y el cron). Colgarlo ahi y no en cada pantalla evita el error de
// forma de siempre: tres sitios mandando avisos y uno quedandose atras.
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

/* EL TEXTO DE CADA AVISO. Se escribe desde el lado del cliente, no del sistema:
   nadie quiere recibir "estado: en_preparacion". Y el de recoger dice algo
   distinto al de domicilio — es la diferencia que le importa a quien espera. */
function mensaje(estado: string, esDomicilio: boolean, negocio: string) {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok: false, razon: "sin_llaves" });
    const b = await req.json();
    const orderId = String(b.order_id || "");
    const estado  = String(b.estado || "");
    if (!orderId || !estado) return json({ error: "order_id y estado requeridos" }, 400);

    const txtBase = mensaje(estado, true, "el restaurante");
    if (!txtBase) return json({ ok: true, razon: "estado_sin_aviso" });

    const ord = await sbGet(
      `/pos_orders?id=eq.${orderId}&select=id,cliente_id,tenant_id,channel&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const o = ord?.[0];
    /* Sin cliente no hay a quien avisarle: los pedidos de mostrador no tienen
       dueño. No es un error, simplemente no aplica. */
    if (!o || !o.cliente_id) return json({ ok: true, razon: "sin_cliente" });

    const subs = await sbGet(
      `/pos_web_push?cliente_id=eq.${o.cliente_id}&select=id,endpoint,p256dh,auth`
    ) as Array<Record<string, unknown>> | null;
    if (!subs || !subs.length) return json({ ok: true, razon: "sin_celulares" });

    /* El nombre que ve el cliente es el de la MARCA, igual que en su pagina. */
    let negocio = "el restaurante";
    try {
      const marca = await sbGet(`/brands?tenant_id=eq.${o.tenant_id}&select=name&order=created_at&limit=1`) as Array<Record<string, unknown>> | null;
      if (marca?.[0]?.name) negocio = String(marca[0].name);
    } catch (_e) { /* con el generico basta */ }

    const esDomicilio = String(o.channel || "") === "domicilio";
    const txt = mensaje(estado, esDomicilio, negocio)!;

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const payload = JSON.stringify({
      titulo: txt.titulo, cuerpo: txt.cuerpo,
      /* La ETIQUETA hace que el aviso nuevo REEMPLACE al anterior del mismo
         pedido. Sin esto, un pedido con tres cambios de estado deja tres
         avisos amontonados y el cliente no sabe cual vale. */
      tag: "pedido-" + orderId,
      /* NO se manda a donde ir: el service worker de cada restaurante ya sabe
         cual es su carpeta, y mandarle una ruta desde aqui la pisaria con una
         que solo sirve para uno. Al tocar el aviso cae en el Inicio, donde el
         boton del pedido esta a la vista. */
    });

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
           borra: guardarlo para siempre es acumular basura y reintentar cada
           vez contra una puerta que ya no existe. */
        const cod = Number((e as { statusCode?: number })?.statusCode || 0);
        if (cod === 404 || cod === 410) {
          await sbDel(`/pos_web_push?id=eq.${s.id}`);
          muertos++;
        } else {
          console.error("push fallo:", cod, String(e).slice(0, 200));
        }
      }
    }
    return json({ ok: true, enviados, muertos });
  } catch (e) {
    console.error("avisar-pedido:", e);
    return json({ error: String(e) }, 500);
  }
});
