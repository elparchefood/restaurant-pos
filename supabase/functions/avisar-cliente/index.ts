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

/* ── LOS TEXTOS ────────────────────────────────────────────────────────────
   Escritos desde el lado del cliente y no del sistema: nadie quiere recibir
   "estado: en_preparacion". El de recoger dice algo distinto al de domicilio,
   que es la diferencia que le importa a quien espera.

   Estos son los DE FABRICA. Cada restaurante puede cambiarlos desde "Mi página
   web" y quedan en `tenants.web_avisos`; lo que no cambie usa el de aqui, asi
   que quien no toque nada sigue funcionando igual.

   Las variables van entre llaves y las rellena `rellenar()`. Se escriben como
   las diria un dueño de restaurante, no como las nombraria un programador. */
const DE_FABRICA: Record<string, { titulo: string; cuerpo: string }> = {
  preparacion:      { titulo: "Manos a la obra 👨‍🍳", cuerpo: "En {negocio} ya están preparando tu pedido." },
  listo_domicilio:  { titulo: "Tu pedido está listo",  cuerpo: "Sale para tu casa en un momento." },
  listo_recoger:    { titulo: "¡Listo para recoger! 🛍️", cuerpo: "Te esperamos en {negocio}." },
  en_camino:        { titulo: "Tu pedido va en camino 🛵", cuerpo: "Ya salió para tu dirección." },
  entregado:        { titulo: "¡Buen provecho! 🍟", cuerpo: "Tu pedido fue entregado. Gracias por pedirnos." },
  recarga_con_bono: { titulo: "¡Recarga lista! 🎉", cuerpo: "Recargaste {monto} y te regalamos {bono}. Tienes {saldo} — ahora sí, a pedir 🍟" },
  recarga_sin_bono: { titulo: "¡Recarga lista! 🎉", cuerpo: "Recargaste {monto}. Tienes {saldo} — ahora sí, a pedir 🍟" },
  /* PUNTOS (20-ago). El cuerpo dice los que gano Y el total: el numero suelto
     no motiva, lo que motiva es ver el acumulado crecer. */
  puntos_ganados:   { titulo: "+{puntos} puntos 🎁", cuerpo: "Ya tienes {total} puntos en {negocio}. Mira por qué los puedes cambiar." },
  puntos_regalo:    { titulo: "Te regalamos {puntos} puntos 🎁", cuerpo: "Ya tienes {total} puntos en {negocio}. Un detalle de parte nuestra." },
  /* SALDO REGALADO (20-ago, Sergio: que el regalo de saldo avise igual que el
     de puntos). Distinto de la recarga: esto no lo pago el cliente. */
  saldo_regalo:     { titulo: "Te regalamos {monto} 🎁", cuerpo: "Ya tienes {saldo} en tu billetera de {negocio}. Un detalle de parte nuestra." },
  /* BONO POR INSTALAR LA APP (21-ago). Dice POR QUE llego la plata: un
     regalo sin motivo confunde; un "gracias por instalar" refuerza justo lo
     que se quiere que la gente haga. */
  bono_instalacion: { titulo: "¡Gracias por instalar nuestra app! 🎁", cuerpo: "Te regalamos {monto} de bienvenida. Ya tienes {saldo} en tu billetera de {negocio} para tu próximo pedido." },
};

function rellenar(txt: string, datos: Record<string, string>) {
  let t = String(txt || "");
  for (const k of Object.keys(datos)) t = t.split("{" + k + "}").join(datos[k]);
  /* Una variable que el dueño escribio mal (o que no existe en ese aviso) se
     borra en vez de salir en crudo: es mejor una frase corta que una que diga
     "{saldito}" en el celular del cliente. */
  return t.replace(/\{[a-z_]{1,20}\}/gi, "").replace(/\s{2,}/g, " ").trim();
}

/* El texto que toca: el del restaurante si lo cambio, el de fabrica si no. */
function textoDe(clave: string, propios: Record<string, unknown> | null, datos: Record<string, string>) {
  const base = DE_FABRICA[clave];
  if (!base) return null;
  const mio = (propios && typeof propios === "object" ? propios[clave] : null) as Record<string, unknown> | null;
  const titulo = (mio && String(mio.titulo || "").trim()) || base.titulo;
  const cuerpo = (mio && String(mio.cuerpo || "").trim()) || base.cuerpo;
  return { titulo: rellenar(titulo, datos), cuerpo: rellenar(cuerpo, datos) };
}

function claveDePedido(estado: string, esDomicilio: boolean) {
  if (estado === "en_preparacion") return "preparacion";
  if (estado === "listo")          return esDomicilio ? "listo_domicilio" : "listo_recoger";
  if (estado === "en_camino")      return "en_camino";
  if (estado === "entregado")      return "entregado";
  return null;
}

/* Los avisos que ese restaurante haya escrito a su manera. */
async function avisosDe(tenantId: string): Promise<Record<string, unknown> | null> {
  try {
    const t = await sbGet(`/tenants?id=eq.${tenantId}&select=web_avisos&limit=1`) as Array<Record<string, unknown>> | null;
    const a = t?.[0]?.web_avisos;
    return (a && typeof a === "object") ? a as Record<string, unknown> : null;
  } catch (_e) { return null; }
}

/* LA RECARGA. Hay DOS textos, con bono y sin bono, en vez de uno solo con una
   frase que aparece y desaparece: asi el dueño ve exactamente lo que le va a
   llegar al cliente en cada caso, sin tener que imaginarselo. Un "+$0 de
   regalo" seria peor que no decir nada. */
function textoRecarga(monto: number, bono: number, saldo: number, propios: Record<string, unknown> | null) {
  return textoDe(bono > 0 ? "recarga_con_bono" : "recarga_sin_bono", propios, {
    monto: cop(monto), bono: cop(bono), saldo: cop(saldo),
  })!;
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
      if (!clienteId && !soloVer) return json({ error: "cliente_id requerido" }, 400);
      /* De que restaurante son los textos. Quien llama suele mandarlo; si no,
         se saca del propio cliente. */
      let tenantR = String(b.tenant_id || "");
      if (!tenantR && clienteId) {
        const c = await sbGet(`/pos_clientes?id=eq.${clienteId}&select=tenant_id&limit=1`) as Array<Record<string, unknown>> | null;
        tenantR = String(c?.[0]?.tenant_id || "");
      }
      const propiosR = tenantR ? await avisosDe(tenantR) : null;
      const t = textoRecarga(Number(b.monto || 0), Number(b.bono || 0), Number(b.saldo || 0), propiosR);
      if (soloVer) return json({ ok: true, previsualizacion: t });
      /* Etiqueta fija: si recarga dos veces seguidas, el segundo aviso pisa al
         primero — y el que vale es el ultimo, que trae el saldo bueno. */
      const r = await enviar(clienteId, t.titulo, t.cuerpo, "recarga");
      return json({ ok: true, ...r });
    }

    // ── SALDO REGALADO ──────────────────────────────────────────────────
    if (tipo === "saldo_regalo") {
      const clienteS = String(b.cliente_id || "");
      if (!clienteS && !soloVer) return json({ error: "cliente_id requerido" }, 400);
      let tenantS = String(b.tenant_id || "");
      if (!tenantS && clienteS) {
        const c = await sbGet(`/pos_clientes?id=eq.${clienteS}&select=tenant_id&limit=1`) as Array<Record<string, unknown>> | null;
        tenantS = String(c?.[0]?.tenant_id || "");
      }
      const propiosS = tenantS ? await avisosDe(tenantS) : null;
      const t = textoDe("saldo_regalo", propiosS, {
        monto: cop(Number(b.monto || 0)),
        saldo: cop(Number(b.saldo || 0)),
        negocio: tenantS ? await nombreNegocio(tenantS) : "tu restaurante",
      })!;
      if (soloVer) return json({ ok: true, previsualizacion: t });
      /* Misma etiqueta que la recarga: en la billetera manda el ultimo saldo. */
      const r = await enviar(clienteS, t.titulo, t.cuerpo, "recarga");
      return json({ ok: true, ...r });
    }

    // ── BONO POR INSTALAR LA APP ────────────────────────────────────────
    if (tipo === "bono_instalacion") {
      const clienteB = String(b.cliente_id || "");
      if (!clienteB && !soloVer) return json({ error: "cliente_id requerido" }, 400);
      let tenantB = String(b.tenant_id || "");
      if (!tenantB && clienteB) {
        const c = await sbGet(`/pos_clientes?id=eq.${clienteB}&select=tenant_id&limit=1`) as Array<Record<string, unknown>> | null;
        tenantB = String(c?.[0]?.tenant_id || "");
      }
      const propiosB = tenantB ? await avisosDe(tenantB) : null;
      const t = textoDe("bono_instalacion", propiosB, {
        monto: cop(Number(b.monto || 0)),
        saldo: cop(Number(b.saldo || 0)),
        negocio: tenantB ? await nombreNegocio(tenantB) : "tu restaurante",
      })!;
      if (soloVer) return json({ ok: true, previsualizacion: t });
      /* Misma etiqueta que la recarga: en la billetera manda el ultimo saldo. */
      const r = await enviar(clienteB, t.titulo, t.cuerpo, "recarga");
      return json({ ok: true, ...r });
    }

    // ── PUNTOS GANADOS ──────────────────────────────────────────────────
    /* Sergio (20-ago): "cualquier punto que ingrese quiero que le llegue la
       notificacion". Da igual como entraron — comprando o porque el dueno se
       los regalo—; lo unico que cambia es el texto, para que un regalo no se
       lea como una compra. */
    if (tipo === "puntos") {
      const ganados = Math.round(Number(b.puntos || 0));
      /* Solo cuando SUMAN. Un canje tambien deja movimiento, y avisar "usaste
         200 puntos" con la misma alegria seria burlarse del cliente. */
      if (ganados <= 0 && !soloVer) return json({ ok: true, razon: "no_suma" });

      let clienteP = String(b.cliente_id || "");
      let tenantP  = String(b.tenant_id || "");
      /* Los puntos viven por TELEFONO, no por cliente: quien llama casi siempre
         tiene el telefono a mano y no el id. Se resuelve aqui para que no lo
         tenga que hacer cada quien. */
      if (!clienteP && b.telefono && tenantP) {
        const tel = String(b.telefono).replace(/[^0-9]/g, "").slice(-10);
        const c = await sbGet(
          `/pos_clientes?tenant_id=eq.${tenantP}&telefono=like.*${tel}&select=id&limit=1`
        ) as Array<Record<string, unknown>> | null;
        clienteP = String(c?.[0]?.id || "");
      }
      if (!clienteP && !soloVer) return json({ ok: true, razon: "sin_cliente" });
      if (!tenantP && clienteP) {
        const c = await sbGet(`/pos_clientes?id=eq.${clienteP}&select=tenant_id&limit=1`) as Array<Record<string, unknown>> | null;
        tenantP = String(c?.[0]?.tenant_id || "");
      }

      const propiosP = tenantP ? await avisosDe(tenantP) : null;
      const clave = String(b.motivo || "") === "regalo" ? "puntos_regalo" : "puntos_ganados";
      const t = textoDe(clave, propiosP, {
        puntos: String(ganados),
        total: String(Math.round(Number(b.total || 0))),
        negocio: String(b.negocio || "tu restaurante"),
      });
      if (soloVer) return json({ ok: true, previsualizacion: t });
      /* Etiqueta fija: si gana puntos dos veces seguidas, el segundo aviso pisa
         al primero — y el bueno es el ultimo, que trae el total al dia. */
      const r = await enviar(clienteP, t.titulo, t.cuerpo, "puntos");
      return json({ ok: true, ...r });
    }

    // ── CAMBIO DE ESTADO DE UN PEDIDO ───────────────────────────────────
    const orderId = String(b.order_id || "");
    const estado  = String(b.estado || "");
    if (!orderId || !estado) return json({ error: "order_id y estado requeridos" }, 400);
    if (!claveDePedido(estado, true)) return json({ ok: true, razon: "estado_sin_aviso" });
    if (soloVer) {
      const propiosV = b.tenant_id ? await avisosDe(String(b.tenant_id)) : null;
      const datosV = { negocio: String(b.negocio || "tu restaurante") };
      return json({ ok: true, previsualizacion: {
        domicilio: textoDe(claveDePedido(estado, true)!,  propiosV, datosV),
        recoger:   textoDe(claveDePedido(estado, false)!, propiosV, datosV),
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
    const propios = await avisosDe(String(o.tenant_id));
    const clave = claveDePedido(estado, String(o.channel || "") === "domicilio")!;
    const t = textoDe(clave, propios, { negocio })!;
    const r = await enviar(String(o.cliente_id), t.titulo, t.cuerpo, "pedido-" + orderId);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error("avisar-cliente:", e);
    return json({ error: String(e) }, 500);
  }
});
