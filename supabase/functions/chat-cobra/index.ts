// chat-cobra/index.ts — EL CHAT DE COBRA (11-sep-2026)
/* ══════════════════════════════════════════════════════════════════════
   Punto 4 de PLAN-7-SEP-PENDIENTES.md: los interesados le escriben al
   WhatsApp, Instagram y Facebook DE COBRA (no a los de El Parche) y los
   atiende un asistente que VENDE EL SISTEMA — no es Paco, que toma pedidos
   de comida. Sergio lo ve todo en su consola y entra cuando quiere.

   Dos puertas:
     · { convId }  con la llave de servicio → el asistente contesta. Lo
                   despierta `meta-webhook` (queueAiReply) cuando el mensaje
                   llega a una cuenta cuyo `ia_config.perfil.cerebro` es
                   'cobra'. La cola y la espera son las mismas de Paco.
     · { accion }  con la sesion del admin de plataforma → la consola:
                   estado · enviar · tomar · leido · guardar_asistente

   Decidido con Sergio (11-sep): contesta SIEMPRE (el se mete cuando quiere
   y ahi el asistente se calla), resuelve dudas con los datos reales, manda
   el registro, agenda la demo en el calendario de Videollamadas y le pasa
   la conversacion cuando hace falta. Siempre dice que es un asistente
   virtual, igual que Paco. Tiene nombre propio (lo pone Sergio).

   Lo que NO se vende nunca (regla de Sergio, reclamada 4 veces): tarjetas
   NFC, billetera/recargas de saldo, la app de clientes y el plan Premium.
   ══════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || "";
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY") || "";
const DE           = Deno.env.get("CORREO_REMITENTE") || "Cobra POS <ingreso@cobrapos.app>";
const MODELO       = "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Fila = Record<string, any>;
const ok = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const SRV = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { ...SRV, "content-type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { /* no era JSON */ }
  return { ok: r.ok, status: r.status, data: d };
}
const esc = (t: unknown) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ── El restaurante interno de Cobra ─────────────────────────────────── */
let PLAT: { tenant: string; branch: string } | null = null;
async function plataforma() {
  if (PLAT) return PLAT;
  /*  11-sep: una consulta que tropezo UNA vez dejo la consola sin negocio
      ("Falta el restaurante interno") y la siguiente si lo encontro. Se
      reintenta, y solo se guarda cuando llegaron el restaurante Y la sede. */
  for (let i = 0; i < 3 && !PLAT; i++) {
    if (i) await sleep(400);
    const t = await db("tenants?es_plataforma=is.true&select=id&limit=1");
    const tenant = String(t.data?.[0]?.id || "");
    if (!tenant) continue;
    const b = await db(`branches?tenant_id=eq.${tenant}&select=id&order=created_at.asc&limit=1`);
    const branch = String(b.data?.[0]?.id || "");
    if (branch) PLAT = { tenant, branch };
  }
  return PLAT;
}

/* ── Quien llama ─────────────────────────────────────────────────────── */
async function quien(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (token === SERVICE_KEY) return { servicio: true, admin: true, sub: "" };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const a = await fetch(`${SUPABASE_URL}/rest/v1/rpc/es_admin_plataforma`, {
    method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}",
  });
  const admin = a.ok ? (await a.json().catch(() => false)) === true : false;
  return { servicio: false, admin, sub: String(u.id || "") };
}

function cuando(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
}
function cop(n: unknown) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO"); }

/* ── Enviar: lo usan el asistente y Sergio ───────────────────────────── */
async function enviar(conv: Fila, texto: string, origen: "bot" | "humano") {
  const ins = await db("chat_messages", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: conv.id, tenant_id: conv.tenant_id, direction: "out",
      body: texto, origen, delivery_status: "sent",
    }),
  });
  const mid = ins.data?.[0]?.id;
  let error: string | null = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-send`, {
      method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conv.id, text: texto, message_id: mid }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) error = String(d.error || ("HTTP " + r.status)).slice(0, 200);
  } catch (e) { error = String(e).slice(0, 200); }
  //  Si no salio, que se vea en la bandeja (y no quede diciendo "enviado").
  if (error && mid) await db(`chat_messages?id=eq.${mid}`, { method: "PATCH", body: JSON.stringify({ delivery_status: "failed" }) });
  await db(`chat_conversations?id=eq.${conv.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_message: texto.slice(0, 200), last_message_at: new Date().toISOString(),
      last_sender: "agent", ai_typing: false,
    }),
  });
  return { id: mid, error };
}

/* ── Lo que sabe el asistente ────────────────────────────────────────── */
/*  Los PRECIOS salen de la base (`pos_planes`): si Sergio los cambia en la
    consola, el asistente ya los dice nuevos. Lo demas sale de lo que la
    pagina de venta y el sistema ya le dicen al dueno (landing y pos-plan.js),
    para que el asistente no prometa nada que la pagina no promete.       */
function conocimiento(planes: Fila[]) {
  const p = (id: string) => planes.find((x) => x.plan === id) || {};
  const st = p("starter"), pro = p("pro");
  return `QUE ES COBRA POS
Un sistema para restaurantes, hecho en Colombia: punto de venta + asistente con inteligencia artificial. Funciona en el computador, tablet o celular que el restaurante ya tiene (Android, impresoras termicas, pantalla de cocina). Esta pensado para locales con mal internet: la carta, los precios y las mesas viven en el equipo. Se monta en una tarde: el dueno manda la foto de su carta y la IA la digitaliza; el sistema lo lleva paso a paso.

PLANES (precio POR SUCURSAL, al mes)
• Starter — ${cop(st.precio)}/mes. "Punto de venta completo, perfecto para abrir y operar tu restaurante": salon, para llevar y domicilio en un solo flujo; pantalla de cocina; caja y cierre de turno (arqueo con diferencias); comandas e impresoras por estacion; mesas y zonas en tiempo real; clientes y reservas; precios, tamanos y adiciones; usuarios, roles y PIN; carta con IA (sube la foto y la digitaliza); informes de ventas. Limites: sucursales ilimitadas, 1 marca, hasta 5 usuarios, IA solo para leer la carta, sin facturacion DIAN.
• Pro — ${cop(pro.precio)}/mes. "Punto de venta + asistente IA, perfecto para crecer y atender sin parar": todo lo de Starter y ademas: asistente 24/7 que contesta el WhatsApp y toma el pedido solo (tambien fuera de horario); aviso al cliente cuando su pedido va en camino; bandeja de WhatsApp, Facebook e Instagram en una sola pantalla; insumos, recetas y costo real por plato; inventario por WhatsApp ("compre 2 pacas de gaseosa" y se actualiza); puntos y premios para fidelizar; app del domiciliario (Android); informes de rentabilidad (horas pico, meseros, utilidad por producto); comprobantes de pago verificados contra el banco (se acaban los comprobantes falsos); facturacion electronica DIAN; la voz de la cocina (una voz lee cada pedido nuevo). Limites: sucursales y marcas ilimitadas, hasta 15 usuarios, ${Number(pro.mensajes_ia || 5000).toLocaleString("es-CO")} mensajes del asistente al mes, 1.000 documentos DIAN al mes.

DESCUENTOS
• Por pagar varios meses: trimestral −10%; anual −20% y ademas incluye mapas (el mapa y la ruta del domiciliario).
• Por volumen de sucursales: 2 a 3 sucursales −10%, 4 a 7 −20%, 8 o mas −30% (se aplica primero el de volumen y encima el del periodo).

COMO SE PAGA Y CONDICIONES
• Sin contrato ni permanencia. La instalacion la hacemos con el cliente, sin costo. Puede cambiar de plan cuando quiera.
• Se paga en linea al registrarse (Nequi, tarjeta o cuenta Bancolombia, por Wompi). Mensual y trimestral quedan con cobro automatico (se avisa una semana antes de cada cobro y se puede cancelar cuando quiera); el anual es un solo pago.

ENLACES
• Crear la cuenta: https://cobrapos.app/login.html?registro=1  (con el plan ya marcado: https://cobrapos.app/login.html?plan=pro o ?plan=starter)
• La pagina: https://cobrapos.app

LO QUE NO EXISTE O NO SE VENDE — NUNCA lo ofrezcas ni lo confirmes
• Tarjetas NFC, billetera o recargas de saldo, app para los clientes del restaurante, y el plan "Premium". Si preguntan por algo asi, di que hoy no hace parte de lo que ofrece Cobra.
• Cualquier funcion, integracion, precio o fecha que no este escrita aqui: no la inventes. Di que lo confirmas con Sergio y ofrece pasarle la conversacion.`;
}

function sistema(nombre: string, conv: Fila, planes: Fila[], extra: string, cita: Fila | null) {
  const quien = nombre ? `Te llamas ${nombre} y eres el asistente virtual de Cobra POS` : "Eres el asistente virtual de Cobra POS";
  const canal = ({ whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook Messenger" } as Fila)[conv.channel] || conv.channel;
  return `${quien}. Siempre dejas claro que eres un asistente virtual (nunca finjas ser una persona). Detras esta Sergio, el fundador de Cobra.

A quien le hablas: duenos y administradores de restaurantes que escriben por ${canal} interesados en Cobra POS${conv.contact_name ? ` (esta persona aparece como "${conv.contact_name}")` : ""}.
Tu trabajo: entender su negocio, resolver sus dudas con la informacion de abajo y llevarlo a dar el siguiente paso: crear su cuenta, o una videollamada de demostracion con Sergio.

COMO ESCRIBES
• Espanol de Colombia, calido y directo. Mensajes cortos, como de chat (2 a 5 lineas). Una sola pregunta a la vez. Maximo 1 o 2 emojis.
• Los precios al estilo colombiano: punto de miles y sin decimales, "$268.200" — NUNCA "$268,200".
• Es un chat (WhatsApp, Instagram o Messenger), no una pagina: NADA de formato markdown. Nada de [texto](enlace) ni de **: los enlaces se escriben tal cual, solos. Si quieres resaltar algo, *un asterisco a cada lado*.
• Si te saludan, saludas, te presentas (asistente virtual de Cobra) y preguntas que tipo de negocio tienen o en que les ayudas.
• Cuando preguntan precio, pregunta cuantas sucursales tienen si no lo sabes, y da la cuenta con los descuentos que apliquen.
• Cuando la persona este lista para empezar, mandale el enlace para crear la cuenta. Si duda o quiere verlo funcionando, ofrecele la demostracion.
• Si mandan una foto, un audio o un archivo, di con amabilidad que por ahora solo lees texto y pide que lo escriban.

LA DEMOSTRACION (videollamada de 30 minutos por Google Meet con Sergio)
• Antes de proponer horas usa ver_horarios_demo y ofrece 2 o 3 opciones concretas (dia y hora de Colombia), REPARTIDAS: en dias distintos o una en la manana y otra en la tarde — nunca tres seguidas del mismo rato.
• Cuando escoja una, pide su nombre y el nombre de su negocio (y si quiere, un correo para mandarle el enlace), y usa agendar_demo con el valor 'inicio' EXACTO que devolvio ver_horarios_demo.
• Confirmale el dia y la hora. Si agendar_demo falla, dile por que y ofrece otra hora.
${cita ? `• ESTA PERSONA YA TIENE UNA DEMO: ${cuando(cita.inicio)}. No agendes otra; si quiere cambiarla, pasale la conversacion a Sergio.\n` : ""}
PASARLE LA CONVERSACION A SERGIO (usa pasar_a_sergio)
• Si pide hablar con una persona, quiere negociar precios o descuentos especiales, tiene un problema con una cuenta que ya existe, pregunta algo que no esta en tu informacion, o se molesta.
• Despues dile que Sergio le escribe por aqui mismo muy pronto. No sigas vendiendo.

REGLAS
• Nunca pidas datos de tarjetas ni contrasenas. Nunca inventes. Nunca hables mal de otros sistemas.

${conocimiento(planes)}
${extra ? `\nINDICACIONES DE SERGIO (mandan sobre lo anterior si chocan)\n${extra}` : ""}

Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })} (hora de Colombia).`;
}

const HERRAMIENTAS = [
  { type: "function", function: {
    name: "ver_horarios_demo",
    description: "Consulta las horas libres para la videollamada de demostracion con Sergio (30 minutos por Google Meet). Usala antes de proponer horas.",
    parameters: { type: "object", properties: {}, required: [] },
  } },
  { type: "function", function: {
    name: "agendar_demo",
    description: "Agenda la demostracion en una hora que devolvio ver_horarios_demo y que la persona escogio. Pide antes su nombre y el de su negocio.",
    parameters: { type: "object", properties: {
      inicio:  { type: "string", description: "El valor 'inicio' EXACTO que devolvio ver_horarios_demo para la hora escogida. Si ya no lo tienes a la mano (fue en un mensaje anterior), llama otra vez ver_horarios_demo antes de agendar." },
      nombre:  { type: "string", description: "Nombre de la persona" },
      negocio: { type: "string", description: "Nombre del restaurante o negocio" },
      correo:  { type: "string", description: "Opcional: correo para mandarle el enlace de la videollamada" },
    }, required: ["inicio", "nombre", "negocio"] },
  } },
  { type: "function", function: {
    name: "pasar_a_sergio",
    description: "Le pasa la conversacion a Sergio (una persona) y el asistente deja de contestar en ella.",
    parameters: { type: "object", properties: {
      motivo: { type: "string", description: "En pocas palabras, por que (ej: 'quiere negociar el precio para 5 sedes')" },
    }, required: ["motivo"] },
  } },
];

async function soporte(cuerpo: Fila) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/soporte-llamadas`, {
    method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return await r.json().catch(() => ({ ok: false, error: "sin respuesta del calendario" }));
}

async function avisarASergio(conv: Fila, motivo: string) {
  const ag = await db("plataforma_agenda?id=eq.1&select=correo_aviso");
  const para = String(ag.data?.[0]?.correo_aviso || "sergio@cobrapos.app");
  if (!RESEND_KEY) return;
  const canal = ({ whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook" } as Fila)[conv.channel] || conv.channel;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F5F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">
  <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5B6BFF;margin-bottom:14px">Cobra POS · Chat de Cobra</div>
  <h1 style="font-size:20px;font-weight:800;color:#0F172A;margin:0 0 14px">Un interesado te necesita</h1>
  <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 6px"><b>${esc(conv.contact_name || conv.contact_handle || "Sin nombre")}</b> · ${esc(canal)}</p>
  <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 18px">${esc(motivo)}</p>
  <a href="https://cobrapos.app/admin-reg.html" style="display:block;background:#5B6BFF;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:11px;font-size:15px;font-weight:700">Abrir el Chat de Cobra</a>
  <p style="font-size:13px;color:#64748B;line-height:1.6;margin:16px 0 0">El asistente ya no le contesta a esta persona: la conversacion es tuya.</p>
</div></body></html>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: DE, to: [para], subject: `Chat de Cobra: ${conv.contact_name || "un interesado"} te necesita`,
        html, text: `Un interesado te necesita: ${conv.contact_name || conv.contact_handle} (${canal}). ${motivo}. https://cobrapos.app/admin-reg.html` }),
    });
  } catch (e) { console.error("[chat-cobra] aviso a Sergio:", String(e).slice(0, 150)); }
}

async function herramienta(nombre: string, args: Fila, conv: Fila, prueba: boolean) {
  if (nombre === "ver_horarios_demo") {
    const d = await soporte({ accion: "huecos" });
    const opciones: Array<{ inicio: string; texto: string }> = [];
    for (const dia of (d.dias || []).slice(0, 4)) {
      for (const iso of (dia.slots || []).slice(0, 5)) opciones.push({ inicio: iso, texto: cuando(iso) });
    }
    return { duracion_min: d.duracion || 30, opciones };
  }
  if (nombre === "agendar_demo") {
    const d = await soporte({
      accion: "agendar_interesado", inicio: normalizarHora(args.inicio), contacto: args.nombre, restaurante: args.negocio,
      correo: args.correo || "", conversation_id: conv.id, silencio: prueba,
      telefono: conv.channel === "whatsapp" ? String(conv.contact_handle || "") : "",
    });
    return d.ok ? { ok: true, cuando: d.llamada?.cuando, duracion_min: d.llamada?.duracion, sala_meet: d.llamada?.meet_url || "" }
                : { ok: false, error: d.error || "no se pudo agendar" };
  }
  if (nombre === "pasar_a_sergio") {
    const motivo = String(args.motivo || "pidio hablar con una persona").slice(0, 200);
    await db(`chat_conversations?id=eq.${conv.id}`, {
      method: "PATCH",
      body: JSON.stringify({ human_takeover: true, handoff_motivo: motivo, handoff_at: new Date().toISOString() }),
    });
    if (!prueba) await avisarASergio(conv, motivo);
    return { ok: true };
  }
  return { ok: false, error: "herramienta desconocida" };
}

/*  WhatsApp, Instagram y Messenger NO pintan markdown. Se le pide al modelo
    que no lo use, pero a veces se le escapa ("**Starter**", "[Meet](url)") y
    el cliente ve los asteriscos y los corchetes. Se limpia aqui, en codigo,
    que es lo unico que no falla (visto en la prueba del 11-sep).        */
function limpiarFormato(t: string) {
  return t
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m: string, txt: string, url: string) =>
      txt.trim() === url ? url : `${txt}: ${url}`)
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/*  La hora que manda el modelo. Si viene SIN zona ("2026-09-14T08:00:00") es
    hora de COLOMBIA, no de Londres: pasa cuando la reescribe de un mensaje
    anterior, porque el resultado de ver_horarios_demo no queda en el
    historial. Sin esto, la demo "ya no estaba disponible" (prueba 11-sep). */
function normalizarHora(s: string) {
  const t = String(s || "").trim();
  if (!t || /[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) return t;
  return t + "-05:00";
}

/* ── El asistente contesta ───────────────────────────────────────────── */
async function responder(convId: string) {
  // 1. La cola: la misma que usa Paco (la llena meta-webhook)
  const q0 = await db(`chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
  const entry = q0.data?.[0];
  if (!entry) return "sin cola";
  for (let i = 0; i < 10; i++) {
    const falta = new Date(entry.fire_at).getTime() - Date.now();
    if (falta > 0) await sleep(Math.min(falta + 200, 30000));
    const q1 = await db(`chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
    const f = q1.data?.[0];
    if (!f) return "otro hilo";
    entry.fire_at = f.fire_at; entry.id = f.id;
    if (new Date(f.fire_at).getTime() <= Date.now()) break;
  }
  //  Se toma POR SU FILA: si dos copias arrancaron, solo sigue la que gano
  //  (misma leccion de Paco del 23-ago: contestar dos veces se contradice).
  const tom = await db(`chat_ai_queue?id=eq.${entry.id}&processed=eq.false`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ processed: true }),
  });
  if (tom.ok && Array.isArray(tom.data) && tom.data.length === 0) return "otro hilo";

  const P = await plataforma();
  const c = await db(`chat_conversations?id=eq.${convId}&select=id,tenant_id,branch_id,channel,contact_name,contact_handle,human_takeover&limit=1`);
  const conv = c.data?.[0];
  if (!conv || !P || conv.tenant_id !== P.tenant) return "no es de Cobra";
  const apagar = () => db(`chat_conversations?id=eq.${convId}`, { method: "PATCH", body: JSON.stringify({ ai_typing: false }) });

  const cf = await db(`ia_config?branch_id=eq.${conv.branch_id}&select=activo,modo_asistente,perfil,instrucciones&limit=1`);
  const cfg = cf.data?.[0] || {};
  //  `modo_asistente` lo cambian los botones Apagado/Encendido de la pantalla
  //  de conversaciones (la misma de Chat IA). "Auto" es de restaurantes con
  //  horario: Cobra no tiene, asi que cuenta como encendido.
  if (!cfg.activo || cfg.modo_asistente === "off" || conv.human_takeover) { await apagar(); return "callado"; }

  //  Las conversaciones de prueba (contacto "prueba-...") no le escriben a
  //  nadie: ni correo a Sergio ni a quien agenda.
  const prueba = /^prueba/i.test(String(conv.contact_handle || ""));

  const [ms, pl, ci] = await Promise.all([
    db(`chat_messages?conversation_id=eq.${convId}&order=sent_at.desc&limit=30&select=direction,body,media_type,origen,sent_at`),
    db("pos_planes?plan=in.(starter,pro)&select=plan,nombre,precio,mensajes_ia"),
    db(`plataforma_llamadas?conversation_id=eq.${convId}&estado=eq.agendada&fin=gt.${new Date().toISOString()}&select=inicio&limit=1`),
  ]);
  const historial = (ms.data || []).reverse().map((m: Fila) => {
    const txt = String(m.body || "").trim() || (m.media_type ? `[${m.media_type}]` : "[mensaje sin texto]");
    if (m.direction === "in") return { role: "user", content: txt };
    return { role: "assistant", content: m.origen === "humano" ? `[Esto lo escribio Sergio] ${txt}` : txt };
  });
  const nombre = String((cfg.perfil || {}).nombre || "").trim();
  const mensajes: Fila[] = [
    { role: "system", content: sistema(nombre, conv, pl.data || [], String(cfg.instrucciones || "").trim(), ci.data?.[0] || null) },
    ...historial,
  ];

  let texto = "";
  let fallo = !OPENAI_KEY;
  for (let i = 0; i < 5 && !fallo; i++) {
    let d: Fila;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELO, temperature: 0.4, max_tokens: 500, messages: mensajes, tools: HERRAMIENTAS }),
      });
      if (!r.ok) { console.error("[chat-cobra] openai:", r.status, (await r.text()).slice(0, 200)); fallo = true; break; }
      d = await r.json();
    } catch (e) { console.error("[chat-cobra] openai:", String(e).slice(0, 200)); fallo = true; break; }
    const m = d.choices?.[0]?.message;
    if (!m) { fallo = true; break; }
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
      mensajes.push(m);
      for (const tc of m.tool_calls) {
        let args: Fila = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* sin argumentos */ }
        const res = await herramienta(String(tc.function?.name || ""), args, conv, prueba);
        console.log(`[chat-cobra] ${convId} usa ${tc.function?.name}:`, JSON.stringify(res).slice(0, 200));
        mensajes.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(res) });
      }
      continue;
    }
    texto = String(m.content || "").trim();
    break;
  }

  /*  Si la IA no contesto, el interesado NO se queda hablando solo: se le
      dice que Sergio le escribe y la conversacion pasa a el, con aviso.
      Un cliente potencial ignorado es el peor error de un chat de ventas. */
  if (!texto) {
    texto = "¡Hola! Ya le aviso a Sergio para que te responda por aquí en un momento 🙌";
    await herramienta("pasar_a_sergio", { motivo: "el asistente no pudo contestar (revisa la conversacion)" }, conv, prueba);
  }
  const env = await enviar(conv, limpiarFormato(texto), "bot");
  if (env.error) console.error("[chat-cobra] no salio:", env.error);
  return "respondio";
}

/* ── El puerto ───────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const q = await quien(req);
  if (!q) return ok({ ok: false, error: "Tu sesión venció. Vuelve a entrar." }, 401);
  const b = await req.json().catch(() => ({})) as Fila;

  // ── El asistente (lo despierta meta-webhook) ──
  if (b.convId) {
    if (!q.servicio) return ok({ ok: false, error: "no autorizado" }, 403);
    try {
      return ok({ ok: true, resultado: await responder(String(b.convId)) });
    } catch (e) {
      console.error("[chat-cobra]", String(e).slice(0, 300));
      await db(`chat_conversations?id=eq.${b.convId}`, { method: "PATCH", body: JSON.stringify({ ai_typing: false }) });
      return ok({ ok: false, error: String(e).slice(0, 200) }, 500);
    }
  }

  // ── La consola de Sergio ──
  if (!q.admin) return ok({ ok: false, error: "Solo la plataforma." }, 403);
  const P = await plataforma();
  if (!P) return ok({ ok: false, error: "Falta el restaurante interno de Cobra." });
  const accion = String(b.accion || "");

  const suConv = async (id: string) => {
    const r = await db(`chat_conversations?id=eq.${encodeURIComponent(id)}&select=id,tenant_id,channel,contact_handle&limit=1`);
    const cv = r.data?.[0];
    return cv && cv.tenant_id === P.tenant ? cv : null;
  };

  if (accion === "estado") {
    const [ch, cf] = await Promise.all([
      //  Sin `meta`: ahi van los tokens, y no bajan al navegador.
      db(`chat_channels?tenant_id=eq.${P.tenant}&select=channel,display_name,handle,connected,created_at`),
      db(`ia_config?branch_id=eq.${P.branch}&select=activo,modo_asistente,perfil,instrucciones&limit=1`),
    ]);
    const cfg = cf.data?.[0] || {};
    return ok({
      ok: true, tenant_id: P.tenant, branch_id: P.branch, canales: ch.data || [],
      asistente: { nombre: String((cfg.perfil || {}).nombre || ""), activo: !!cfg.activo && cfg.modo_asistente !== "off", instrucciones: String(cfg.instrucciones || "") },
    });
  }

  if (accion === "enviar") {
    const cv = await suConv(String(b.conversation_id || ""));
    if (!cv) return ok({ ok: false, error: "Esa conversación no es del Chat de Cobra." });
    const texto = String(b.texto || "").trim().slice(0, 4000);
    if (!texto) return ok({ ok: false, error: "Escribe algo." });
    //  Sergio escribio: la conversacion es suya y el asistente se calla en ella.
    await db(`chat_conversations?id=eq.${cv.id}`, { method: "PATCH", body: JSON.stringify({ human_takeover: true, unread_count: 0 }) });
    const r = await enviar(cv, texto, "humano");
    return ok({ ok: !r.error, id: r.id, error: r.error });
  }

  if (accion === "tomar") {
    const cv = await suConv(String(b.conversation_id || ""));
    if (!cv) return ok({ ok: false, error: "Esa conversación no es del Chat de Cobra." });
    const tomar = b.tomar !== false;
    await db(`chat_conversations?id=eq.${cv.id}`, {
      method: "PATCH",
      body: JSON.stringify(tomar ? { human_takeover: true }
                                 : { human_takeover: false, handoff_motivo: null, handoff_at: null }),
    });
    return ok({ ok: true, tomada: tomar });
  }

  if (accion === "leido") {
    const cv = await suConv(String(b.conversation_id || ""));
    if (cv) await db(`chat_conversations?id=eq.${cv.id}`, { method: "PATCH", body: JSON.stringify({ unread_count: 0 }) });
    return ok({ ok: true });
  }

  if (accion === "guardar_asistente") {
    const cf = await db(`ia_config?branch_id=eq.${P.branch}&select=perfil&limit=1`);
    const perfil = { ...(cf.data?.[0]?.perfil || {}), cerebro: "cobra", nombre: String(b.nombre || "").trim().slice(0, 40) };
    const r = await db(`ia_config?branch_id=eq.${P.branch}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      //  El interruptor y los botones de la pantalla de conversaciones mandan
      //  sobre lo mismo: se guardan juntos para que nunca se contradigan.
      body: JSON.stringify({ perfil, activo: b.activo !== false, modo_asistente: b.activo !== false ? "on" : "off",
                             instrucciones: String(b.instrucciones || "").slice(0, 6000) }),
    });
    return ok(r.ok ? { ok: true } : { ok: false, error: "No se pudo guardar." });
  }

  return ok({ ok: false, error: "Acción desconocida." });
});
