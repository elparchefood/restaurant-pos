// delay_reply.ts — Paco v96 — Arquitectura Conversacional
// Determinista: pasos, extractores de slots, condiciones del pedido, resumen.
// Conversacional: TODAS las respuestas del bot pasan por GPT.
// Las frases en ia_config son un banco de estilo (fija = texto exacto, conversacional = guía).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlotItem {
  producto:  string;
  tamano:    string | null;
  tipo:      string | null;
  cantidad:  number;
  adiciones: string | null;
}

interface PacoState {
  producto:           string | null;
  tamano:             string | null;
  tipo:               string | null;
  cantidad:           number;
  adiciones:          string | null;  // null=no preguntado, ""=rechazado, "texto"=pidió
  direccion:          string | null;
  pago:               string | null;
  nombre:             string | null;
  items:              SlotItem[];
  resumen_enviado:            boolean;
  direccion_heredada:         boolean;
  complemento_dir_pendiente:  string | null;  // pregunta pendiente para completar la dirección
  last_activity:              string;
  _v?:                        number;
}

// Datos del producto cargados dinámicamente desde pos_products
interface ProductData {
  id:            string;
  name:          string;
  price_mode:    string;
  presentations: Array<{ id: string; name: string; price: number; prices?: number[] }>;
  variables:     Array<{ id: string; name: string; isPricing?: boolean; options: Array<{ id: string; name: string; price: number; prices?: number[] }> }>;
}

// Paso configurable desde canvas. modo: "fija"=usa texto exacto, "conversacional"=guía para GPT
interface PasoDefinicion {
  id:         string;
  campo:      string;
  modo?:      "fija" | "conversacional";
  texto?:     string;   // frase exacta (modo fija)
  guia?:      string;   // descripción para GPT (modo conversacional)
  pregunta?:  string;   // compat con canvas viejo (se trata como fija)
  condicion?: string;
  keywords?:  Record<string, string>;
  // Sub-preguntas del paso dirección (configurables desde el nodo del canvas)
  preg_incompleta?: string;  // qué preguntar si la dirección está incompleta
  preg_barrio?:     string;  // qué preguntar si falta el barrio
}

type TipoDireccion = "residencial" | "publico" | "rechazado" | "incompleta" | "para_llevar";

function newPacoState(): PacoState {
  return {
    producto: null, tamano: null, tipo: null, cantidad: 1,
    adiciones: null, direccion: null, pago: null, nombre: null,
    items: [], resumen_enviado: false, direccion_heredada: false, complemento_dir_pendiente: null,
    last_activity: new Date(Date.now() - 30 * 60_000).toISOString(), // 30min atrás → sesionExpirada=true
    _v: 119,
  };
}

// ── Constantes ────────────────────────────────────────────────────────────────

// NOTA: el saludo/bienvenida NO va hardcoded. Sale del canvas (ia_config.flujo_saludo),
// del banco configurable (frases.bienvenidas) o de frases.apertura. El único fallback de
// código es una plantilla neutra construida con el nombre del bot y del restaurante (config).

const CONFIRM_WORDS = [
  "sí","si","dale","correcto","perfecto","claro","de acuerdo",
  "afirmativo","está bien","confirmo","exacto","así es","listo",
  "va","bueno","eso","ok","okay","positivo","afirmo",
];

const RECHAZO_UPSELL_WORDS = [
  "no quiero","no gracias","así está","nada más","solo eso",
  "sin adicional","sin adicion","no, gracias","no quiero nada",
  "está bien así","no, así está","no quiero nada más",
  "no adicional","sin nada más","solo con eso","así va bien",
];

// Palabras GENÉRICAS de adición (mecánica general, sirven a cualquier restaurante).
// Los nombres de productos concretos se cargan del CATÁLOGO de cada restaurante:
// las categorías cuyo nombre suene a adición/bebida/extra alimentan DYN_ADICION_KEYWORDS
// y TODOS los productos/categorías alimentan DYN_PROD_NAMES (detección de intención).
const ADICION_BASE = [
  "adicion","adicional","agregar","añadir","con","extra",
  "bebida","gaseosa","jugo","agua",
];
// Palabras genéricas que por sí solas NO bastan para dar por hecha una adición
const ADICION_GENERICAS = ["con","adicion","adicional","agregar","añadir","extra","bebida"];
let DYN_ADICION_KEYWORDS: string[] = [];   // nombres de productos de categorías de adiciones/bebidas
let DYN_PROD_NAMES: string[] = [];         // nombres (normalizados) de productos y categorías del catálogo
function getAdicionKeywords(): string[] { return [...ADICION_BASE, ...DYN_ADICION_KEYWORDS]; }
// ¿El texto menciona algún producto o categoría del catálogo del restaurante?
function mencionaProductoCatalogo(texto: string): boolean {
  const t = " " + normalizarTexto(texto) + " ";
  return DYN_PROD_NAMES.some(n => t.includes(" " + n + " ") || t.includes(" " + n));
}

// ── Zona horaria y moneda por restaurante (config; defaults Colombia) ─────────
let TZ_OFFSET_H = -5;                       // ia_config.zona_horaria (horas vs UTC)
let MONEDA = { simbolo: "$", miles: ".", decimales: 0, sufijo: false };
function setRegion(cfg: Record<string, unknown> | undefined) {
  const tz = cfg?.zona_horaria;
  if (tz !== undefined && tz !== null && String(tz).trim() !== "") {
    const parsed = parseFloat(String(tz).replace(":30", ".5").replace(":00", ""));
    if (!isNaN(parsed) && parsed >= -12 && parsed <= 14) TZ_OFFSET_H = parsed;
  } else TZ_OFFSET_H = -5;
  const m = cfg?.moneda as Record<string, unknown> | null | undefined;
  MONEDA = {
    simbolo: String(m?.simbolo || "$"),
    miles: String(m?.miles || "."),
    decimales: Number(m?.decimales ?? 0) || 0,
    sufijo: !!(m?.sufijo),
  };
}
function fmtMoney(n: number): string {
  const dec = MONEDA.decimales;
  const decSep = MONEDA.miles === "." ? "," : ".";
  const s = dec > 0 ? n.toFixed(dec) : String(Math.round(n));
  const parts = s.split(".");
  const ent = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, MONEDA.miles);
  const num = parts[1] ? ent + decSep + parts[1] : ent;
  return MONEDA.sufijo ? `${num} ${MONEDA.simbolo}` : `${MONEDA.simbolo}${num}`;
}

// Saludo: detecta "hola", "holaa", "hey", "buenas", y combinaciones ("hola buenas", "buenas, hola").
const _SAL = "(buen[oa]s?\\s+d[íi]as?|buen[oa]s?\\s+tardes?|buen[oa]s?\\s+noches?|buen\\s+d[íi]a|qu[eé]\\s+tal|qu[eé]\\s+m[aá]s|qu[eé]\\s+hubo|qu[eé]\\s+hay|hol+a+|hol[ai]s|holi+|hey+|saludos?|buen[oa]s?)";
const SALUDO_REGEX = new RegExp(`^\\s*${_SAL}([\\s,.]+${_SAL})*[\\s,.!?¡¿]*$`, "i");

// ── PAGO MIXTO (parte digital + parte efectivo) — mecánica general ────────────
// "te paso 30 mil por nequi y el resto en efectivo" / "mitad y mitad" /
// "pago 20 en efectivo y lo demás por transferencia"
function parseMontoTexto(s: string): number | null {
  const m = s.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(mil|k\b)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/[.,]/g, ""));
  if (m[2]) n = n * 1000;
  return n > 0 ? n : null;
}
// Atajo coloquial: "30" con un total de $61.000 significa $30.000
function normalizarMontoVsTotal(n: number, total: number): number {
  if (total > 0 && n > 0 && n < total && n * 1000 <= total * 1.2 && n < total / 50) return n * 1000;
  return n;
}
type PagoMixtoDet = { metodo: string; montoDigital: number | null; montoEfectivo: number | null; mitad: boolean };
function detectarPagoMixto(text: string, pagosCfg: Record<string, unknown> | null | undefined): PagoMixtoDet | null {
  const t = normalizarTexto(text).toLowerCase();
  const metodos = getMetodosPago(pagosCfg);
  let nombreDig: string | null = null;
  let idxDig = -1;
  for (const m of metodos) {
    if (!m.digital) continue;
    const mn = normalizarTexto(m.nombre).toLowerCase();
    const i = t.indexOf(mn);
    if (i >= 0) { nombreDig = m.nombre.toLowerCase(); idxDig = i; break; }
  }
  if (!nombreDig) {
    // Sinónimos coloquiales de pago digital (mismo patrón compat que extractPago):
    // si el cliente nombra una billetera que no está en la lista, se mapea al
    // primer método digital configurado del restaurante.
    const lm = t.match(/transferencia|transfiero|transfer|nequi|daviplata|bancolombia|davivienda|billetera|consignar|consignacion|\bqr\b/);
    if (lm) {
      const dig = metodos.find(m => m.digital);
      nombreDig = dig ? dig.nombre.toLowerCase() : "transferencia";
      idxDig = lm.index ?? -1;
    }
  }
  if (!nombreDig) return null;
  const efeM = t.match(/\befectivo\b|\bcash\b/);
  const idxEfe = efeM ? (efeM.index ?? -1) : -1;
  const haySplit = /\b(resto|restante|lo\s+demas|sobrante|otra\s+parte|una\s+parte|parte\s+en|faltante|lo\s+que\s+falta|mitad)\b/.test(t);
  if (idxEfe < 0 && !haySplit) return null;         // solo un método → no es mixto
  if (idxEfe < 0 && !/mitad/.test(t)) return null;  // split sin "efectivo" solo aplica con "mitad"
  const mitad = /mitad/.test(t);
  // Montos con posición → se asignan al método más cercano en el texto
  let montoDigital: number | null = null, montoEfectivo: number | null = null;
  const numRe = /\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(mil|k\b)?/gi;
  let nm: RegExpExecArray | null;
  while ((nm = numRe.exec(t)) !== null) {
    let n = parseFloat(nm[1].replace(/[.,]/g, ""));
    if (nm[2]) n = n * 1000;
    if (!(n > 0)) continue;
    const pos = nm.index;
    const dDig = idxDig >= 0 ? Math.abs(pos - idxDig) : 9999;
    const dEfe = idxEfe >= 0 ? Math.abs(pos - idxEfe) : 9999;
    if (dDig <= dEfe && montoDigital === null) montoDigital = n;
    else if (montoEfectivo === null) montoEfectivo = n;
  }
  return { metodo: nombreDig, montoDigital, montoEfectivo, mitad };
}

// Patrones de dirección
const CALLE_REGEX = /\b(calle|carrera|cra|cl\b|diagonal|transversal|tv\b|dg\b|avenida|av\b|bloque|manzana|mz\b|torre)\b/i;
const LLEVAR_REGEX = /\b(para\s+llevar|para\s+recoger|lo\s+recojo|lo\s+busco|voy\s+a\s+recoger|pa\s+llevar|a\s+recoger|yo\s+paso|yo\s+lo\s+recojo|paso\s+a\s+recoger(?:lo)?|paso\s+por\s+(?:el\s+pedido|[ée]l)|paso\s+al\s+local)\b/i;

// Nuevo producto adicional — expandido para capturar más patrones naturales
const NUEVO_PROD_REGEX = /\b(y\s+(un[ao]?\s+|[0-9]+\s+|otr[ao]?\s+|de\s+paso\s+|tambi[eé]n\s+)\w{3,}|tambi[eé]n\s+(quiero?|quisiera|dame|poneme|una?|un)\s+\w|de\s+paso\s+(quiero?|dame|una?|un|p[oó]n[gm]e)\s+\w|adem[aá]s\s+(quiero?|quisiera|dame)\s+\w|y\s+tambi[eé]n\s+\w{3,}|y\s+me\s+das?\s+\w{3,}|p[oó]n[gm]e\s+(tambi[eé]n|adem[aá]s)\s+\w)/i;

// ── Server ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response("OK", { status: 200 }); }

  const convId = body.convId as string;
  if (!convId) return new Response("missing convId", { status: 400 });

  try {
    await processConversation(convId);
  } catch (err) {
    console.error("delay-reply error:", err);
    try { await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: false }); } catch {}
  }

  return new Response("OK", { status: 200 });
});

// ── Main ──────────────────────────────────────────────────────────────────────

async function processConversation(convId: string): Promise<void> {

  // 1. Leer la entrada de la cola
  const queueRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
  const entry = queueRes?.[0] as Record<string, unknown> | undefined;
  if (!entry) return;

  const fireAt = new Date(entry.fire_at as string).getTime();

  // 2. Esperar hasta fire_at
  let attempts = 0;
  while (attempts < 10) {
    const remaining = fireAt - Date.now();
    if (remaining > 0) await sleep(Math.min(remaining + 200, 30_000));
    const freshRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
    const fresh = freshRes?.[0] as Record<string, unknown> | undefined;
    if (!fresh) return;
    if (new Date(fresh.fire_at as string).getTime() <= Date.now()) break;
    attempts++;
  }

  // 3. Marcar como procesado
  await sbPatch(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false`, { processed: true });

  // 4. Leer datos del batch
  const batchStart  = entry.batch_start as string;
  const branchId    = entry.branch_id as string;
  const tenantId    = entry.tenant_id as string;
  const fromPhone   = entry.from_phone as string;
  const phoneId     = entry.phone_id as string;
  const accessToken = entry.access_token as string;

  const msgsRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
    `&sent_at=gte.${encodeURIComponent(batchStart)}&order=sent_at.asc&select=id,body,external_id`
  );
  let batchMsgs = (msgsRes || []) as Array<{ id: string; body: string; external_id: string }>;

  if (!batchMsgs.length) {
    const batchStartEarly = new Date(new Date(batchStart).getTime() - 5000).toISOString();
    const retryRes = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
      `&sent_at=gte.${encodeURIComponent(batchStartEarly)}&order=sent_at.asc&select=id,body,external_id`
    );
    batchMsgs = (retryRes || []) as Array<{ id: string; body: string; external_id: string }>;
    if (!batchMsgs.length) { await setTyping(convId, false); return; }
  }

  const soloMediaNoTexto = batchMsgs.every(m => {
    const b = (m.body || "").trim();
    return b.startsWith("[audio]") || b.startsWith("[imagen]") || b.startsWith("[image]") ||
           b.startsWith("[sticker]") || b.startsWith("[video]") || b === "";
  });

  // 5. Cargar config IA
  const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&limit=1`);
  const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
  if (!cfg || !cfg.activo) { await setTyping(convId, false); return; }

  // 5b. Hora local del restaurante (ia_config.zona_horaria; default Colombia UTC-5)
  setRegion(cfg as Record<string, unknown>);
  const nowUtc    = new Date();
  const colombiaMs = nowUtc.getTime() + (TZ_OFFSET_H * 60 * 60 * 1000);
  const colDate    = new Date(colombiaMs);
  const colHourNum = colDate.getUTCHours();
  const colMinNum  = colDate.getUTCMinutes();
  const colMin     = String(colMinNum).padStart(2, "0");
  const colAmPm    = colHourNum >= 12 ? "pm" : "am";
  const colH12     = colHourNum % 12 || 12;
  const colTimeStr = `${colH12}:${colMin}${colAmPm}`;
  const colDays    = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const colDayStr  = colDays[colDate.getUTCDay()];
  const colDayKey  = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][colDate.getUTCDay()];

  const horariosCfg = cfg.horarios as Record<string, Record<string,unknown>> | null | undefined;
  const fmtHora     = (cfg.formato_hora as string) || "12h";
  let isOpen = false, isBeforeOpen = false, horaAperturaHoy = "", horaCierreHoy = "";
  if (horariosCfg) {
    const hoy = horariosCfg[colDayKey];
    if (hoy && hoy.activo) {
      const abre = (hoy.abre as string) || "00:00";
      const cierra = (hoy.cierra as string) || "23:59";
      const nowMin = colHourNum * 60 + colMinNum;
      isOpen       = nowMin >= parseHHMM(abre) && nowMin < parseHHMM(cierra);
      isBeforeOpen = nowMin < parseHHMM(abre);
      horaAperturaHoy = formatHora(abre, fmtHora);
      horaCierreHoy   = formatHora(cierra, fmtHora);
    }
  } else {
    const totalMinutes = colHourNum * 60 + colMinNum;
    isBeforeOpen = totalMinutes < (18 * 60 + 30);
    isOpen = !isBeforeOpen && totalMinutes < (22 * 60 + 30);
    horaAperturaHoy = fmtHora === "24h" ? "18:30" : "6:30pm";
    horaCierreHoy   = fmtHora === "24h" ? "22:30" : "10:30pm";
  }

  const pedidosProg       = !!(cfg.pedidos_programados);
  const puedeTomarPedidos = isOpen || pedidosProg;
  const frasesCfg         = (cfg.frases as Record<string, unknown>) || {};
  const domiciliosCfg     = cfg.domicilios as Record<string, unknown> | null | undefined;
  const pagosCfg          = cfg.pagos as Record<string, unknown> | null | undefined;
  const proxDia           = getProximoDiaActivo(horariosCfg, colDate.getUTCDay());

  // ── Estado fuera de servicio (DETERMINÍSTICO, frases configurables) ──────────
  // Tres casos distintos (regla de Sergio):
  //  · "antes"   → el día está ACTIVO pero aún no abre  → frases.antes_horario ({{hora_apertura}})
  //  · "despues" → el día está ACTIVO y ya cerró        → frases.fuera_horario ({{proximo_dia}})
  //  · "cerrado" → el día está DESACTIVADO en horarios  → frases.dia_cerrado ({{proximo_dia}} =
  //                próximo día realmente activo, saltando días cerrados consecutivos)
  let cerradoInfo: { tipo: string; frase: string } | null = null;
  if (!puedeTomarPedidos) {
    const reemplazar = (t: string) => t
      .replace(/\{\{?\s*hora_apertura\s*\}?\}/g, horaAperturaHoy || "")
      .replace(/\{\{?\s*hora_cierre\s*\}?\}/g, horaCierreHoy || "")
      .replace(/\{\{?\s*proximo_dia\s*\}?\}/g, proxDia || "pronto");
    if (horaAperturaHoy && isBeforeOpen) {
      const f = getFraseTexto(frasesCfg.antes_horario)
        || "Aún no abrimos 😊 Nuestro servicio hoy es a partir de las {{hora_apertura}}.";
      cerradoInfo = { tipo: "antes", frase: reemplazar(f) };
    } else if (horaAperturaHoy) {
      const f = getFraseTexto(frasesCfg.fuera_horario)
        || "Por hoy ya terminamos nuestra jornada 🍟 Volvemos {{proximo_dia}}. ¡Gracias por escribirnos!";
      cerradoInfo = { tipo: "despues", frase: reemplazar(f) };
    } else {
      const f = getFraseTexto(frasesCfg.dia_cerrado)
        || "Hoy no tenemos servicio 😊 Volvemos {{proximo_dia}}. ¡Te esperamos!";
      cerradoInfo = { tipo: "cerrado", frase: reemplazar(f) };
    }
  }
  (cfg as Record<string, unknown>)._cerradoInfo = cerradoInfo;

  // 6. Detectar solicitud de carta → enviar imágenes
  const menuImagenes = (cfg.menu_imagenes as string[]) || [];
  if (menuImagenes.length > 0) {
    const combinedLower = batchMsgs.map(m => m.body.toLowerCase().trim()).join(" ");
    const menuKw = ["la carta","el menú","el menu","dame la carta","ver la carta","su carta","ver el menú","ver el menu","muestrame la carta","que tienen de menu","que tienen","que hay","qué hay","que tienes","qué tienes","que tiene","qué tiene","que tienen","qué tienen","tienen de"];
    const isExact  = ["carta","menú","menu","el menú","el menu"].includes(combinedLower);
    const wantsMenu = isExact || menuKw.some(kw => combinedLower.includes(kw));
    if (wantsMenu) {
      for (const imgUrl of menuImagenes) {
        await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: { link: imgUrl } }),
        });
        await sleep(600);
      }
      // Frase que acompaña la carta: nodo "Evento: Pide la carta" del canvas
      // (flujo_extras.carta) > menu_frase config > apertura > default
      const extrasCarta = (cfg.flujo_extras as Record<string, { texto?: string }>) || {};
      const menuFraseCfg = (cfg.menu_frase as Record<string,string>) || {};
      const followUp = (extrasCarta.carta && extrasCarta.carta.texto)
        ? extrasCarta.carta.texto
        : menuFraseCfg.tipo === "variable"
          ? (getFraseTexto(frasesCfg.apertura) || "¿Qué deseas ordenar? 😋")
          : (menuFraseCfg.texto || "¿Qué deseas ordenar? 😋");
      const waText = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: followUp } }),
      });
      const waSentData = await waText.json() as Record<string, unknown>;
      const sentId = ((waSentData.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
      await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", body: followUp, delivery_status: "sent", external_id: sentId || null, sent_at: new Date().toISOString() });
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: followUp, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  // 7. Cargar menú
  const menuText = await buildMenuText(branchId);

  // 8. Cargar fila de conversación
  const convRes = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=contact_name,human_takeover,pago_pendiente,sin_nomenclatura,pending_order_data&limit=1`);
  const convRow = convRes?.[0] as Record<string, unknown> | undefined;
  const senderName = (convRow?.contact_name as string) || fromPhone;
  const nombreWa = detectarNombreWa(senderName);       // null si nombre raro/emojis/números

  // Lookup de cliente recurrente — nombre verificado de pedidos anteriores
  const telefonoCleanWa = fromPhone.replace(/\D/g, "");
  let nombreKnown: string | null = null;
  try {
    const clienteHist = await sbGet(
      `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoCleanWa)}&tenant_id=eq.${tenantId}&select=nombre&order=id.desc&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (clienteHist && clienteHist.length > 0 && clienteHist[0].nombre) {
      nombreKnown = String(clienteHist[0].nombre);
    }
  } catch (_) { /* no bloquear si falla */ }

  const nombreConfirmar = nombreKnown || nombreWa;     // DB verificado > WhatsApp > null
  const nombreParaBot   = nombreConfirmar || "";        // solo decirle a GPT si hay nombre válido
  const sinNomenclaturaCliente2 = !!(convRow?.sin_nomenclatura);

  if (convRow?.human_takeover) {
    await setTyping(convId, false);
    return;
  }

  // ── Datos disponibles para las variables {{...}} del canvas (se cargan una vez) ──
  // Alimenta resolverDato(): el usuario crea variables que apuntan a estas fuentes.
  let branchInfo: Record<string, unknown> | null = null;
  try {
    const brRes = await sbGet(`/rest/v1/branches?id=eq.${branchId}&select=name,address,city,phone&limit=1`);
    branchInfo = (brRes?.[0] as Record<string, unknown>) || null;
  } catch (_) { /* no bloquear si falla */ }

  const fechaStr   = `${String(colDate.getUTCDate()).padStart(2,"0")}/${String(colDate.getUTCMonth()+1).padStart(2,"0")}/${colDate.getUTCFullYear()}`;
  const saludoHora = colHourNum < 12 ? "Buenos días" : colHourNum < 19 ? "Buenas tardes" : "Buenas noches";
  // {{metodos_pago}} sale de la lista editable de métodos (pagos.metodos), en vivo
  const metodosArr: string[] = getMetodosPago(pagosCfg).map(m => m.nombre);
  const categoriasStr = (menuText.match(/\[([^\]]+)\]/g) || []).map(c => c.replace(/[\[\]]/g, "").toLowerCase()).join(", ");
  const perfilCfg = (cfg.perfil as Record<string, string>) || {};
  const botCfgV   = (cfg.bot as Record<string, string>) || {};

  const varDataObj: Record<string, unknown> = {
    hora: colTimeStr,
    dia: colDayStr,
    fecha: fechaStr,
    saludo_hora: saludoHora,
    restaurante: perfilCfg.nombre || botCfgV.nombre || String(pagosCfg?.titular || "") || String(branchInfo?.name || ""),
    direccion_local: String(branchInfo?.address || ""),
    ciudad: String(branchInfo?.city || ""),
    telefono_local: String(branchInfo?.phone || ""),
    horario_hoy: (horaAperturaHoy && horaCierreHoy) ? `${horaAperturaHoy} a ${horaCierreHoy}` : "",
    tiempo_domicilio: String(domiciliosCfg?.tiempo_estimado || ""),
    nequi: String(pagosCfg?.llave || ""),
    titular: String(pagosCfg?.titular || ""),
    metodos_pago: listaNatural(metodosArr),
    menu: menuText,
    categorias: categoriasStr,
    cliente: nombreConfirmar || (senderName && senderName !== fromPhone ? senderName : ""),
  };

  // Variables automáticas del catálogo: por cada producto, sus presentaciones y variantes.
  // {{presentaciones_coca_cola}} → "personal o 1.5 litros" · {{variantes_premium}} → "mixta, carne o pollo"
  // Los selectores {{presentaciones_producto}}/{{variantes_producto}} usan estas mismas claves
  // según el producto del pedido en curso (resolverDato).
  try {
    const prodRows = await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=name,presentations,variables,category_id(name)`
    ) as Array<Record<string, unknown>> | null;
    // Palabras dinámicas del catálogo (mecánica general, contenido por restaurante):
    //  · DYN_PROD_NAMES → nombres de productos y categorías (detección de intención de pedido)
    //  · DYN_ADICION_KEYWORDS → productos de categorías tipo adición/bebida (detección de upsell)
    const _dynProd = new Set<string>();
    const _dynAdi  = new Set<string>();
    const _addProdWords = (nombre: string) => {
      const norm = normalizarTexto(nombre).toLowerCase().trim();
      if (!norm) return;
      if (norm.length >= 4) _dynProd.add(norm);
      for (const w of norm.split(/\s+/)) {
        const stem = w.replace(/s$/, "");            // singular/plural ("salchipapas"→"salchipapa")
        if (stem.length >= 5) _dynProd.add(stem);
      }
    };
    // OJO: con límites de palabra — "Salchipapas TRADICIONALES" contiene "adicion"
    // adentro y sin \b se trataba como categoría de adiciones (bug real de Sergio:
    // "Mixta porfa" capturado como adición porque Mixta es producto de esa categoría)
    const CAT_ADICION_RE = /\b(adicion(?:es|al)?|adición|adiciónes|extras?|bebidas?|salsas?|toppings?|acompañamientos?|acompanamientos?|postres?|complementos?)\b/i;
    for (const p of (prodRows || [])) {
      const nombreProd = String(p.name || "").trim();
      if (!nombreProd) continue;
      _addProdWords(nombreProd);
      const catName = String((p.category_id as Record<string, unknown> | null)?.name || "");
      if (catName) _addProdWords(catName);
      if (CAT_ADICION_RE.test(catName)) {
        const normA = normalizarTexto(nombreProd).toLowerCase().trim();
        if (normA.length >= 4) {
          _dynAdi.add(normA);
          const dosPalabras = normA.split(/\s+/).slice(0, 2).join(" ");
          if (dosPalabras !== normA && dosPalabras.length >= 4) _dynAdi.add(dosPalabras);
        }
      }
      const slug = slugVariable(nombreProd);
      if (!slug) continue;
      const presArr = ((p.presentations as Array<{ name?: string }>) || [])
        .map(x => String(x?.name || "").trim())
        .filter(n => n && n.toLowerCase() !== "unico" && n.toLowerCase() !== "único");
      if (presArr.length > 0) varDataObj["presentaciones_" + slug] = listaNatural(presArr).toLowerCase();
      const varGroups = (p.variables as Array<{ options?: Array<{ name?: string }> }>) || [];
      const optArr = ((varGroups[0]?.options) || [])
        .map(o => String(o?.name || "").trim())
        .filter(Boolean);
      if (optArr.length > 0) varDataObj["variantes_" + slug] = listaNatural(optArr).toLowerCase();
    }
    DYN_PROD_NAMES = [..._dynProd];
    DYN_ADICION_KEYWORDS = [..._dynAdi];
  } catch (err) { console.error("variables de catálogo fallaron (no bloquea):", err); }

  // Palabras de adiciones configuradas por el restaurante (ia_config.adiciones_palabras)
  // — complementan las derivadas del catálogo (categorías de adiciones/bebidas).
  const adiCfgList = cfg.adiciones_palabras;
  if (Array.isArray(adiCfgList)) {
    for (const w of adiCfgList) {
      const n = normalizarTexto(String(w)).toLowerCase().trim();
      if (n.length >= 3 && !DYN_ADICION_KEYWORDS.includes(n)) DYN_ADICION_KEYWORDS.push(n);
    }
  }

  (cfg as Record<string, unknown>)._varData = varDataObj;

  const hasImagenBatch = batchMsgs.some(m => (m.body||"").startsWith("[imagen]") || (m.body||"").startsWith("[image]"));
  if (soloMediaNoTexto) {
    if (convRow?.pago_pendiente && hasImagenBatch) {
      // imagen con pago pendiente → fluye a verify-transfer abajo
    } else {
      const mediaMsg = "Por el momento solo puedo atenderte por texto. ¿En qué te puedo ayudar? 😊";
      await sendWaAndSave(convId, tenantId, mediaMsg, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: mediaMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  const clienteTexto = batchMsgs
    .map(m => m.body)
    .filter(b => !b.startsWith("[imagen]") && !b.startsWith("[image]"))
    .join("\n")
    .trim();

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Estado del pedido (PacoState)
  // ═══════════════════════════════════════════════════════════════════════════

  // Pago pendiente + texto del cliente: NO borrar el pedido a la ligera. El cliente puede
  // demorar 1-2 horas (o más) en enviar el comprobante y escribir cosas mientras tanto
  // ("ya pagué", "listo", "hola"...). El pago pendiente SOLO se descarta si:
  //   (a) el texto claramente arranca un pedido NUEVO, o (b) pasaron más de 24 horas.
  // Cualquier otro texto: recordarle el comprobante y seguir esperando.
  let pagoPendienteViejo = false;
  if (convRow?.pago_pendiente && !soloMediaNoTexto) {
    // "otra/otro <producto del catálogo>" también cuenta como pedido nuevo (dinámico por restaurante)
    const NUEVA_ORDEN_RE = /(quier[oe]|quisiera|me\s+das|dame|me\s+haces|deseo|se\s+me\s+antoja|ped(ir|ido)|ordenar|otro\s+pedido|nuevo\s+pedido)/i;
    const esOtroProducto = /\b(otr[oa]s?|nuev[oa])\b/i.test(clienteTexto) && mencionaProductoCatalogo(clienteTexto);
    const pendStatePrev = convRow?.pending_order_data as Record<string, unknown> | null;
    const horasPendiente = pendStatePrev && pendStatePrev.last_activity
      ? (Date.now() - new Date(String(pendStatePrev.last_activity)).getTime()) / 3600000
      : 999;
    if (NUEVA_ORDEN_RE.test(clienteTexto) || esOtroProducto || horasPendiente > 24) {
      pagoPendienteViejo = true;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pago_pendiente: false, pending_order_data: null });
    } else {
      const msgRecordatorio = getFraseTexto(frasesCfg.esperar_comprobante)
        || "Quedó pendiente del comprobante para poderte preparar ☺️ Envíamelo como imagen 🧾";
      await sendWaAndSave(convId, tenantId, msgRecordatorio, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgRecordatorio, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  const timeoutMin = (cfg.pedido_timeout_minutos as number) || 45;
  const rawStateRaw = pagoPendienteViejo ? null : (convRow?.pending_order_data as Record<string, unknown> | null | undefined);

  let state: PacoState;
  if (!rawStateRaw || (rawStateRaw._v as number || 0) < 119) {
    state = newPacoState();
    if (rawStateRaw?.direccion && rawStateRaw?.resumen_enviado) {
      state.direccion = rawStateRaw.direccion as string;
      state.direccion_heredada = true;
    }
  } else {
    const rawState = rawStateRaw as PacoState;
    const isTimedOut = rawState.last_activity &&
      (Date.now() - new Date(rawState.last_activity).getTime()) > timeoutMin * 60_000;
    if (isTimedOut) {
      const savedDir = rawState.resumen_enviado ? rawState.direccion : null;
      state = newPacoState();
      if (savedDir) { state.direccion = savedDir; state.direccion_heredada = true; }
    } else {
      state = rawState;
    }
  }

  // Cargar datos del producto actual y construir pasos
  let currentProductData: ProductData | null = null;
  if (state.producto) {
    currentProductData = await loadProductData(state.producto, branchId);
  }
  let pasos = buildAllPasos(currentProductData, cfg, frasesCfg, nombreConfirmar, !!nombreKnown);

  // Cargar historial una sola vez (usado en todas las respuestas GPT)
  const histRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&sent_at=lt.${encodeURIComponent(batchStart)}&order=sent_at.desc&limit=15&select=direction,body`
  );
  const histCtx = ((histRes || []) as Array<{ direction: string; body: string }>).reverse();

  // Construir textos de contexto del restaurante (una sola vez)
  const horariosText   = buildHorariosText(horariosCfg, fmtHora);
  const pagosText      = buildPagosText(pagosCfg);
  const domiciliosText = buildDomiciliosText(domiciliosCfg);


  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Saludo → bienvenida Paco
  // ═══════════════════════════════════════════════════════════════════════════

  const esGaludo = SALUDO_REGEX.test(clienteTexto.trim());
  const minutosInactivo = state.last_activity
    ? (Date.now() - new Date(state.last_activity).getTime()) / 60000
    : 999;
  // Sesión expirada: sin pedido en curso, timeout, o pedido ya confirmado
  const sesionExpirada = !state.producto || minutosInactivo > 15 || state.resumen_enviado;

  if (esGaludo && sesionExpirada) {
    const prevDir = (!state.resumen_enviado && state.direccion) ? state.direccion : null;
    state = newPacoState();
    if (prevDir) { state.direccion = prevDir; state.direccion_heredada = true; }
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state, pago_pendiente: false });

    if (puedeTomarPedidos) {
      // Bienvenida — SIEMPRE desde canvas/configuración, nunca hardcoded:
      // (1) nodo Saludo del canvas (flujo_saludo: fija=texto exacto con variables,
      //     conversacional=GPT con la guía del canvas + personalidad del asistente)
      // (2) banco configurable frases.bienvenidas / cfg.bienvenidas (aleatoria)
      // (3) frases.apertura_conocido (cliente recurrente) o frases.apertura
      // (4) plantilla neutra construida con el nombre del bot y del restaurante (config)
      let bienvenida = "";
      const flujoSaludo = cfg.flujo_saludo as { modo?: string; texto?: string; guia?: string } | null | undefined;
      if (flujoSaludo && flujoSaludo.modo === "fija" && flujoSaludo.texto) {
        bienvenida = rellenarVariables(flujoSaludo.texto, state, cfg).texto;
      } else if (flujoSaludo && flujoSaludo.modo === "conversacional" && flujoSaludo.guia) {
        try {
          bienvenida = await buildConversationResponse(
            clienteTexto, histCtx, state,
            { id: "saludo", campo: "saludo", modo: "conversacional", guia: flujoSaludo.guia },
            cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, null,
            true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
          );
        } catch (_) { /* cae a los siguientes niveles */ }
      }
      if (!bienvenida) {
        const banco = (cfg.bienvenidas as string[]) ||
          (Array.isArray(frasesCfg.bienvenidas) ? frasesCfg.bienvenidas as string[] : null);
        if (banco && banco.length) bienvenida = banco[Math.floor(Math.random() * banco.length)];
      }
      if (!bienvenida) {
        bienvenida = getFraseTexto(nombreKnown ? frasesCfg.apertura_conocido : frasesCfg.apertura)
          || getFraseTexto(frasesCfg.apertura);
      }
      if (!bienvenida) {
        const vd = ((cfg as Record<string, unknown>)._varData as Record<string, unknown>) || {};
        const botCfgS  = (cfg.bot as Record<string, string>) || {};
        const perfilS  = (cfg.perfil as Record<string, string>) || {};
        const botNm    = botCfgS.nombre || perfilS.nombre || "tu asistente virtual";
        const restNm   = String(vd.restaurante || "");
        bienvenida = `¡Hola! Soy ${botNm}${restNm ? `, el asistente virtual de ${restNm}` : ""} 🤖 ¿Qué deseas pedir? 🍟`;
      }
      await sendWaAndSave(convId, tenantId, bienvenida, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: bienvenida, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }

    // FUERA DE SERVICIO: el saludo aclara el estado DESDE EL PRINCIPIO (determinístico,
    // con la frase configurada) y ofrece resolver dudas mientras tanto.
    if (cerradoInfo) {
      const saludoCerrado = `${cerradoInfo.frase}\n\nMientras tanto te puedo compartir la carta o responder cualquier duda ☺️`;
      await sendWaAndSave(convId, tenantId, saludoCerrado, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: saludoCerrado, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Restaurante cerrado → respuesta conversacional
  // ═══════════════════════════════════════════════════════════════════════════

  if (!puedeTomarPedidos) {
    const reply = await buildConversationResponse(
      clienteTexto, histCtx, state, null, cfg, frasesCfg,
      menuText, horariosText, pagosText, domiciliosText, currentProductData,
      false, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
    );
    await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Verify-transfer (imagen con pago_pendiente)
  // ═══════════════════════════════════════════════════════════════════════════

  if (convRow?.pago_pendiente && hasImagenBatch) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/verify-transfer`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId }),
      });
    } catch (err) {
      console.error("verify-transfer error:", err);
      const msg = "Recibimos tu comprobante, en un momento lo verificamos 🙏";
      await sendWaAndSave(convId, tenantId, msg, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    }
    return;
  }

  if (!clienteTexto) { await setTyping(convId, false); return; }

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Resumen enviado → confirmar o corregir
  // ═══════════════════════════════════════════════════════════════════════════

  if (state.resumen_enviado) {
    const textoLow = clienteTexto.toLowerCase().trim();
    const isConfirmacion = textoLow.length <= 80 && CONFIRM_WORDS.some(w =>
      textoLow === w || textoLow.startsWith(w + " ") || textoLow.endsWith(" " + w) ||
      textoLow.includes(" " + w + " ")
    );

    if (isConfirmacion) {
      // Si el método de pago quedó liberado (caso "para llevar + efectivo"), capturarlo
      // de este mismo mensaje: "bueno entonces por nequi" confirma Y trae el método.
      if (!state.pago) {
        const pagoNuevo = extractPago(clienteTexto, pagosCfg);
        if (pagoNuevo) {
          state.pago = pagoNuevo;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        }
      }
      // Rama digital (QR + comprobante) decidida por el flag "digital" del método
      // configurado en Pagos — ya no por nombres fijos en código.
      const esTransferencia = esMetodoDigital(state.pago, pagosCfg);

      if (esTransferencia) {
        // Prioridad: nodo del canvas conectado a la salida "transferencia" del Resumen
        // (flujo_extras.comprobante) > frase config > default
        const extrasCfg = (cfg.flujo_extras as Record<string, { texto?: string }>) || {};
        const compFrase = getFraseCfg(frasesCfg.esperar_comprobante);
        let compMsg: string;
        if (extrasCfg.comprobante && extrasCfg.comprobante.texto) {
          compMsg = rellenarVariables(extrasCfg.comprobante.texto, state, cfg).texto;
        } else if (compFrase.modo === "fija" && compFrase.texto) {
          compMsg = compFrase.texto;
        } else {
          compMsg = "Quedó pendiente del comprobante para poderte preparar ☺️";
        }
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pago_pendiente: true });
        await sendWaAndSave(convId, tenantId, compMsg, fromPhone, phoneId, accessToken);
        const qrUrl = (pagosCfg?.qr_imagen_url as string) || "";
        const qrTxt = (pagosCfg?.qr_texto as string) || "";
        if (qrUrl) {
          await sleep(600);
          const qrRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: { link: qrUrl, caption: qrTxt || undefined } }),
          });
          if (qrRes.ok) {
            const qrSent = await qrRes.json() as Record<string, unknown>;
            const qrMsgId = ((qrSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
            await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", body: `[imagen] ${qrUrl}`, delivery_status: "sent", external_id: qrMsgId || null, sent_at: new Date().toISOString() });
          }
        }
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: compMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;

      } else {
        // PARA LLEVAR + pago no digital: el pedido NO se prepara hasta recibir el pago.
        // (Regla configurable: domicilios.llevar_prepago, default activada. La frase es
        // frases.llevar_efectivo — personalizable por restaurante en Mensajes.)
        const esLlevarConf = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) || clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2).tipo === "para_llevar" : false;
        const exigePrepago = domiciliosCfg?.llevar_prepago !== false;
        if (esLlevarConf && exigePrepago) {
          const msgLlevar = getFraseTexto(frasesCfg.llevar_efectivo) ||
            "Qué pena contigo 🙏 Si deseas que tu pedido esté listo cuando pases por él, el pago debe hacerse por transferencia primero. Si decides pagar en efectivo, con mucho gusto te puedes acercar al establecimiento y tu pedido se prepara una vez esté pago 🍟";
          // Se libera el método de pago: si el cliente responde con un método digital,
          // el flujo re-envía el resumen y sigue por la rama del QR/comprobante.
          state.pago = null;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, msgLlevar, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgLlevar, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }

        const clasif = clasificarDireccion(state.direccion || "", domiciliosCfg, sinNomenclaturaCliente2);
        if (clasif.tipo === "rechazado") {
          const msg = getFraseTexto(frasesCfg.lugar_rechazado) || "Lo sentimos, no podemos hacer domicilios a ese lugar 😊 Si querés podés pasar a recoger (para llevar).";
          state.direccion = null; state.resumen_enviado = false;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, msg, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
        const esParaLlevar = clasif.tipo === "para_llevar";
        const domiPrecio = esParaLlevar ? 0 : lookupDomiPrice(state.direccion || "", domiciliosCfg);
        try {
          const orderArgs = buildOrderArgs(state, domiPrecio ?? 0);
          await createWhatsappOrder(orderArgs, branchId, tenantId, fromPhone);
        } catch (err) { console.error("Error creando pedido:", err); }

        // Prioridad: nodo del canvas conectado a la salida "efectivo" del Resumen
        // (flujo_extras.cierre) > frase config > default
        const extrasCierre = (cfg.flujo_extras as Record<string, { texto?: string }>) || {};
        const cierreFrase = getFraseCfg(frasesCfg.cierre_pedido);
        let closeMsg: string;
        if (extrasCierre.cierre && extrasCierre.cierre.texto) {
          closeMsg = rellenarVariables(extrasCierre.cierre.texto, state, cfg).texto;
        } else if (cierreFrase.modo === "fija" && cierreFrase.texto) {
          closeMsg = cierreFrase.texto;
        } else {
          closeMsg = "En un momento enviamos tu pedido 🍟 ¡Con muchísimo gusto!";
        }
        await sendWaAndSave(convId, tenantId, closeMsg, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
          pending_order_data: null, pago_pendiente: false,
          last_message: closeMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false,
        });
        return;
      }
    }

    // Corrección o mensaje no claro → extractores + respuesta conversacional
    const correctedSlots = runExtractors(clienteTexto, state, null, pagosCfg, currentProductData, nombreConfirmar);
    if (Object.keys(correctedSlots).length > 0) {
      state = mergeSlots(state, { ...correctedSlots, resumen_enviado: false });
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      const nextAfterCorr = findNextStep(state, pasos);
      if (!nextAfterCorr) {
        try {
          const sumMsg = await buildSummaryFromState(state, cfg, branchId, domiciliosCfg);
          state.resumen_enviado = true;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        } catch (err) { console.error("buildSummaryFromState error (corrección):", err); }
        return;
      }
    }

    // Respuesta conversacional (incluye correcciones con contexto y mensajes sin slot)
    const replyWait = await buildConversationResponse(
      clienteTexto, histCtx, state, Object.keys(correctedSlots).length > 0 ? findNextStep(state, pasos) : null,
      cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
      true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
    );
    await sendWaAndSave(convId, tenantId, replyWait, fromPhone, phoneId, accessToken);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: replyWait, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. SLOT-FILLING — Corazón de Paco
  // ═══════════════════════════════════════════════════════════════════════════

  // 14a. Extraer producto (GPT) si no está definido, o si hay nuevo producto
  const needsProducto = !state.producto || NUEVO_PROD_REGEX.test(clienteTexto);
  let productoDetectado: string | null = null;
  let cantidadDetectada = 1;

  if (needsProducto) {
    const result = await extractProducto(clienteTexto, menuText);
    productoDetectado = result.producto;
    cantidadDetectada = result.cantidad;
  }

  // 14b. Manejar producto detectado
  if (productoDetectado) {
    const normNuevo = normalizarTexto(productoDetectado);
    const normActual = state.producto ? normalizarTexto(state.producto) : "";

    if (state.producto && normNuevo !== normActual) {
      const archived: SlotItem = {
        producto: state.producto, tamano: state.tamano, tipo: state.tipo,
        cantidad: state.cantidad, adiciones: state.adiciones,
      };
      const prevDir  = state.direccion;
      const prevPago = state.pago;
      const prevNom  = state.nombre;
      const prevItems = state.items;
      state = newPacoState();
      state.producto  = productoDetectado;
      state.cantidad  = cantidadDetectada;
      state.direccion = prevDir;
      state.pago      = prevPago;
      state.nombre    = prevNom;
      state.items     = [...prevItems, archived];
    } else if (!state.producto) {
      state.producto = productoDetectado;
      state.cantidad = cantidadDetectada;
    }

    // Cargar datos del producto y reconstruir pasos dinámicos
    currentProductData = await loadProductData(state.producto!, branchId);
    pasos = buildAllPasos(currentProductData, cfg, frasesCfg, nombreConfirmar, !!nombreKnown);
  }

  // 14c. Paso actual (para contexto en extractores)
  const currentStep = state.producto ? findNextStep(state, pasos) : null;
  const currentStepId = currentStep?.id || null;

  // 14d. Correr extractores de slots
  const extracted = runExtractors(clienteTexto, state, currentStepId, pagosCfg, currentProductData, nombreConfirmar);

  // 14e. Merge
  // Capturar ANTES del merge: si ya había una pregunta de dirección pendiente → es el segundo intento
  const yaHabiaPreguntadoDireccion = !!state.complemento_dir_pendiente;
  if (Object.keys(extracted).length > 0) {
    state = mergeSlots(state, extracted);
  }
  // Si llegó una dirección nueva, reiniciar cualquier complemento pendiente de pasos anteriores
  // para que 14e-bis la re-evalúe limpiamente desde cero
  if (extracted.direccion && state.complemento_dir_pendiente) {
    state.complemento_dir_pendiente = null;
  }
  // Arquitectura independiente de pasos: si ya hay un producto activo, la dirección
  // (sea heredada o recién dada) pertenece a ESTE pedido. Limpiar la bandera heredada
  // evita que "confirmar_dir" bloquee el flujo cuando el cliente ya está en medio de un pedido.
  if (state.producto && state.direccion && state.direccion_heredada) {
    state.direccion_heredada = false;
  }

  state.last_activity = new Date().toISOString();
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });

  // 14e-bis. Dirección recién capturada → validar barrio/complemento inmediatamente
  // (así la pregunta de barrio aparece justo después de la dirección, no al final del flujo)
  if (extracted.direccion && state.direccion && state.producto && !state.complemento_dir_pendiente) {
    const clasifBis = clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2);
    if (clasifBis.tipo === "rechazado") {
      state.direccion = null;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      const reply = await buildConversationResponse(
        clienteTexto, histCtx, state, findNextStep(state, pasos),
        cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
        true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
      );
      await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
    if (clasifBis.tipo === "incompleta") {
      const numCount = (state.direccion.match(/\d+/g) || []).length;
      const pregDetallada = numCount >= 2
        ? "¡Casi! 😊 Le falta el número de tu casa. La dirección debe verse así: *Carrera 9 # 63-25* ¿Cómo es la completa?"
        : "Necesito la dirección completa para llegar 📍 Algo así: *Carrera 9 # 63-25* ¿Cómo es la tuya?";
      // Prioridad: sub-pregunta del nodo Dirección del canvas > frase config > default
      const pasoDirBis = pasos.find(p => p.campo === "direccion");
      const pregIncompleta = (pasoDirBis && pasoDirBis.preg_incompleta)
        || getFraseTexto(frasesCfg.preguntar_complemento_dir)
        || (yaHabiaPreguntadoDireccion ? pregDetallada : "La dirección está incompleta, ¿podrías dármela completa? 📍");
      state.complemento_dir_pendiente = pregIncompleta;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      await sendWaAndSave(convId, tenantId, pregIncompleta, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregIncompleta, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
    if (clasifBis.tipo !== "para_llevar") {
      const domiPrecioBis = lookupDomiPrice(state.direccion, domiciliosCfg);
      const tieneCalle = /\b(calle|carrera|cra|cl|diagonal|transversal|tv|dg|avenida|av)\s*\d+/i.test(state.direccion);
      const tieneNumeroBis = /#\s*\d|no\.\s*\d|nro\.\s*\d|número\s*\d|numero\s*\d/.test(state.direccion);
      if (!tieneCalle && !tieneNumeroBis && domiPrecioBis !== null) {
        // Solo dio el barrio sin calle ni número — pedir la dirección completa
        const pregCalle = getFraseTexto(frasesCfg.preguntar_calle_numero)
          || "Anotado el barrio 📍 ¿Y cuál es la dirección exacta? (calle o carrera y número)";
        state.complemento_dir_pendiente = pregCalle;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        await sendWaAndSave(convId, tenantId, pregCalle, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregCalle, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (domiPrecioBis === null) {
        const pasoDirBarrio = pasos.find(p => p.campo === "direccion");
        const pregBarrio = (pasoDirBarrio && pasoDirBarrio.preg_barrio)
          || getFraseTexto(frasesCfg.preguntar_barrio)
          || "¿Y en qué barrio queda esa dirección? 📍";
        state.complemento_dir_pendiente = pregBarrio;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        await sendWaAndSave(convId, tenantId, pregBarrio, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregBarrio, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
    }
  }

  // 14e-ter. ELIMINADO (contaminación entre pedidos): el antiguo safety net escaneaba los
  // últimos 15 mensajes del historial buscando el pago — y rescataba el "efectivo" del
  // PEDIDO ANTERIOR del mismo cliente, saltándose el paso PAGO del canvas en el pedido nuevo.
  // El extractor de pago del mensaje actual (runExtractors, corre siempre que !state.pago)
  // ya cubre el caso "todo en un solo mensaje". Cada pedido debe preguntar su pago.

  // 14e-cuarto. NOTA: el nombre NO se auto-rellena. El paso "nombre" debe CONFIRMARLO
  // explícitamente ("¿va a nombre de X?") — 3 casos manejados en getFlowPasos:
  //   (a) nombre WA válido → confirmar; (b) nombre raro/emojis → preguntar; (c) recurrente → confirmar.
  // La confirmación la captura runExtractors (paso nombre + CONFIRM_WORDS → state.nombre = nombreConfirmar).
  // El resumen falso que esto causaba antes ya está cubierto por las reglas estrictas de GPT (v124)
  // y porque el pago es ahora el último paso (findNextStep no llega a null con nombre pendiente).

  // 14e-quinto. PARA LLEVAR con prepago: pago especial (regla de Sergio)
  // Sería contradictorio preguntar "¿efectivo o transferencia?" y luego negar el efectivo.
  // → Se SALTA la pregunta del pago: se asigna el método digital configurado y el flujo
  //   sigue directo al resumen → confirmación → QR + comprobante, sin explicar nada.
  // → SOLO si el cliente menciona un pago NO digital por su cuenta, se le explica la
  //   regla con la frase configurable (frases.llevar_efectivo).
  {
    const llevarState = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
    const exigePrepagoFlujo = domiciliosCfg?.llevar_prepago !== false;
    if (llevarState && exigePrepagoFlujo && state.producto) {
      const metodoDigital = getMetodosPago(pagosCfg).find(m => m.digital);
      const pagoMencionado = extractPago(clienteTexto, pagosCfg);
      const mencionaNoDigital = pagoMencionado && !esMetodoDigital(pagoMencionado, pagosCfg);
      // También cubre el caso: eligió "efectivo" en el paso de pago y DESPUÉS dijo "yo paso"
      const pagoNoDigitalPrevio = state.pago && !esMetodoDigital(state.pago, pagosCfg);
      if (mencionaNoDigital || pagoNoDigitalPrevio) {
        // El cliente quiere efectivo en un pedido para llevar → explicar la regla
        const msgLlevarEf = getFraseTexto(frasesCfg.llevar_efectivo) ||
          "Qué pena contigo 🙏 Si deseas que tu pedido esté listo cuando pases por él, el pago debe hacerse por transferencia primero. Si decides pagar en efectivo, con mucho gusto te puedes acercar al establecimiento y tu pedido se prepara una vez esté pago 🍟";
        state.pago = metodoDigital ? metodoDigital.nombre.toLowerCase() : null;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        await sendWaAndSave(convId, tenantId, msgLlevarEf, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgLlevarEf, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (metodoDigital && (!state.pago || !esMetodoDigital(state.pago, pagosCfg))) {
        // Saltar la pregunta del pago: directo al método digital
        state.pago = metodoDigital.nombre.toLowerCase();
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      }
    }
  }

  // 14e-sexto. "¿CUÁNTO ES?" en el paso de PAGO (caso especial de Sergio):
  // si en vez de responder el método el cliente pregunta el precio, se le responde
  // SOLO el desglose de precios (sin el resumen) con la plantilla configurable
  // frases.solo_precio, seguida de la pregunta de pago del canvas. Cuando dé el
  // método, el flujo normal envía el resumen completo.
  {
    const CUANTO_RE = /(cu[aá]nto\s+(es|sale|vale|cuesta|queda|ser[ií]a|cobran?)|qu[eé]\s+precio|precio\s+total|el\s+total|cuanto\s+te\s+debo)/i;
    if (state.producto && !state.pago && !state.resumen_enviado &&
        CUANTO_RE.test(clienteTexto) && !extractPago(clienteTexto, pagosCfg)) {
      const stepAhora = findNextStep(state, pasos);
      if (stepAhora && stepAhora.campo === "pago") {
        const precios = await calcularPreciosPedido(state, branchId, domiciliosCfg);
        const pedidoStr = precios.pedido > 0 ? fmtCOP(precios.pedido) : "a confirmar";
        const domiStr = precios.esLlevar ? "Para llevar"
          : precios.domi === null ? "a confirmar"
          : precios.domi === 0 ? "Gratis" : fmtCOP(precios.domi);
        const totalStr = precios.pedido > 0
          ? (precios.esLlevar || precios.domi !== null
              ? fmtCOP(precios.pedido + (precios.esLlevar ? 0 : (precios.domi || 0)))
              : fmtCOP(precios.pedido) + " (+ domicilio a confirmar)")
          : "a confirmar";
        const plantillaPrecio = getFraseTexto(frasesCfg.solo_precio) ||
          "💵 Pedido: {{precio_pedido}}\n🏍️ Domicilio: {{precio_domi}}\n💰 *Total: {{precio_total}}*";
        let msgPrecio = plantillaPrecio
          .replace(/\{\{?\s*precio_pedido\s*\}?\}/g, pedidoStr)
          .replace(/\{\{?\s*precio_domi\s*\}?\}/g, domiStr)
          .replace(/\{\{?\s*precio_total\s*\}?\}/g, totalStr);
        // Re-preguntar el pago con la frase del CANVAS (fiel al paso configurado)
        if (stepAhora.texto) {
          msgPrecio += "\n\n" + rellenarVariables(stepAhora.texto, state, cfg).texto;
        }
        await sendWaAndSave(convId, tenantId, msgPrecio, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgPrecio, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
    }
  }

  // 14e-séptimo. PAGO MIXTO: "una parte por transferencia y el resto en efectivo".
  // El bot entiende la división, confirma los montos (frases configurables), y el
  // comprobante se verificará contra la PARTE digital. El resto queda en efectivo
  // al recibir. Si no dijo cuánto, se le pregunta (frases.pago_mixto_monto).
  {
    const st = state as unknown as Record<string, unknown>;
    const esperandoMonto = st.pago_mixto_esperando as string | undefined;
    if (state.producto && !state.resumen_enviado && !st.pago_mixto) {
      let mix = detectarPagoMixto(clienteTexto, pagosCfg);
      if (!mix && esperandoMonto) {
        const n = parseMontoTexto(clienteTexto);
        if (n) mix = { metodo: esperandoMonto, montoDigital: n, montoEfectivo: null, mitad: false };
      }
      if (mix) {
        const precios = await calcularPreciosPedido(state, branchId, domiciliosCfg);
        const total = precios.pedido > 0
          ? precios.pedido + (precios.esLlevar ? 0 : (precios.domi || 0))
          : 0;
        let montoDig = mix.montoDigital;
        if (mix.mitad && montoDig === null && total > 0) montoDig = Math.round(total / 2);
        if (montoDig === null && mix.montoEfectivo !== null && total > 0) {
          montoDig = total - normalizarMontoVsTotal(mix.montoEfectivo, total);
        }
        if (montoDig !== null && total > 0) montoDig = normalizarMontoVsTotal(montoDig, total);
        if (total > 0 && montoDig !== null && montoDig > 0 && montoDig < total) {
          // División válida → guardar y confirmar (el flujo sigue: resumen → QR → comprobante)
          st.pago_mixto = { metodo: mix.metodo, monto_digital: montoDig, monto_efectivo: total - montoDig };
          delete st.pago_mixto_esperando;
          state.pago = mix.metodo;   // método digital → rama comprobante/QR de siempre
          const fraseMix = (getFraseTexto(frasesCfg.pago_mixto) ||
            "Perfecto 🙌 {{monto_digital}} por {{metodo_digital}} y {{monto_efectivo}} en efectivo al recibir. El comprobante debe ser por {{monto_digital}} 🧾")
            .replace(/\{\{?\s*monto_digital\s*\}?\}/g, fmtCOP(montoDig))
            .replace(/\{\{?\s*monto_efectivo\s*\}?\}/g, fmtCOP(total - montoDig))
            .replace(/\{\{?\s*metodo_digital\s*\}?\}/g, capFirst(mix.metodo));
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, fraseMix, fromPhone, phoneId, accessToken);
          // sin return: el flujo continúa (normalmente al resumen) en este mismo turno
        } else if (total > 0 && montoDig !== null && montoDig >= total) {
          // El monto cubre todo → pago digital normal, sin división
          state.pago = mix.metodo;
          delete st.pago_mixto_esperando;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        } else if (total > 0) {
          // Quiere mixto pero no dijo cuánto → preguntar (frase configurable)
          st.pago_mixto_esperando = mix.metodo;
          state.pago = null;
          const pregMix = (getFraseTexto(frasesCfg.pago_mixto_monto) ||
            "¡Claro! ¿Cuánto deseas pagar por {{metodo_digital}}? El resto queda en efectivo al recibir 😊")
            .replace(/\{\{?\s*metodo_digital\s*\}?\}/g, capFirst(mix.metodo));
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, pregMix, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregMix, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
      }
    }
  }

  // 14f. Sin producto
  if (!state.producto) {
    // Si el cliente EXPRESA intención de pedir (pero sin producto específico) y hay
    // imágenes de la carta + mostrar_menu activo en el nodo Producto del canvas:
    // enviar la CARTA (imágenes) + la frase del canvas — determinístico, sin GPT.
    // (Sergio: "en lugar de volcar los productos en texto, envía el menú y pregunta cuál desea")
    const pasoProdMenu = Array.isArray(cfg.flujo_pasos)
      ? (cfg.flujo_pasos as Array<Record<string, unknown>>).find(p => p && p.campo === "producto" && p.activo !== false)
      : null;
    const mostrarMenuImg = pasoProdMenu ? pasoProdMenu.mostrar_menu !== false : true;
    const INTENCION_PEDIDO_RE = /(quier[oe]|quisiera|me\s+das|me\s+regalas|me\s+haces|dame|deseo|se\s+me\s+antoja|antojo|ped(ir|ido)|ordenar|env[ií]ame|hazme|para\s+comer|d[ée]jame)/i;
    // También cuenta como intención: "una/un <producto o categoría del catálogo>" (dinámico por restaurante)
    const intencionPorCatalogo = /\b(una?|unos?|alg[uú]n[ao]?)\s/i.test(clienteTexto) && mencionaProductoCatalogo(clienteTexto);
    if (mostrarMenuImg && menuImagenes.length > 0 && (INTENCION_PEDIDO_RE.test(clienteTexto) || intencionPorCatalogo)) {
      const menuFraseCfg14f = (cfg.menu_frase as Record<string, string>) || {};
      const fraseProdRaw = (pasoProdMenu && (pasoProdMenu.texto || pasoProdMenu.frase))
        ? String(pasoProdMenu.texto || pasoProdMenu.frase)
        : (menuFraseCfg14f.texto || getFraseTexto(frasesCfg.apertura) || "¡Claro que sí! 😊 ¿Qué deseas?");
      const fraseProd = rellenarVariables(fraseProdRaw, state, cfg).texto;
      for (const imgUrl of menuImagenes) {
        await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: { link: imgUrl } }),
        });
        await sleep(600);
      }
      await sendWaAndSave(convId, tenantId, fraseProd, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: fraseProd, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }

    // Saludo/charla u otra cosa sin intención clara → respuesta conversacional (GPT)
    const reply = await buildConversationResponse(
      clienteTexto, histCtx, state, null, cfg, frasesCfg,
      menuText, horariosText, pagosText, domiciliosText, currentProductData,
      true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
    );
    await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    return;
  }

  // 14g. Siguiente paso
  const nextStep = findNextStep(state, pasos);

  // 14h. Todos los slots completos → validar y mostrar resumen
  if (!nextStep) {
    if (state.direccion) {
      const clasifDir = clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2);
      if (clasifDir.tipo === "rechazado") {
        state.direccion = null;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        const reply = await buildConversationResponse(
          clienteTexto, histCtx, state,
          findNextStep(state, pasos),
          cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
          true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
        );
        await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (clasifDir.tipo === "incompleta") {
        // Dirección sin número/nomenclatura — preguntar solo lo que falta, sin borrar lo capturado
        const numCount = (state.direccion.match(/\d+/g) || []).length;
        const pregDetallada = numCount >= 2
          ? "¡Casi! 😊 Le falta el número de tu casa. La dirección debe verse así: *Carrera 9 # 63-25* ¿Cómo es la completa?"
          : "Necesito la dirección completa para llegar 📍 Algo así: *Carrera 9 # 63-25* ¿Cómo es la tuya?";
        const pasoDirH = pasos.find(p => p.campo === "direccion");
        const pregIncompleta = (pasoDirH && pasoDirH.preg_incompleta)
          || getFraseTexto(frasesCfg.preguntar_complemento_dir)
          || (yaHabiaPreguntadoDireccion ? pregDetallada : "La dirección está incompleta, ¿podrías dármela completa? 📍");
        state.complemento_dir_pendiente = pregIncompleta;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        await sendWaAndSave(convId, tenantId, pregIncompleta, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregIncompleta, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (clasifDir.tipo !== "para_llevar") {
        const domiPrecioH = lookupDomiPrice(state.direccion, domiciliosCfg);
        const tieneCalleH = /\b(calle|carrera|cra|cl|diagonal|transversal|tv|dg|avenida|av)\s*\d+/i.test(state.direccion);
        const tieneNumH   = /#\s*\d|no\.\s*\d|nro\.\s*\d|número\s*\d|numero\s*\d/.test(state.direccion);
        if (!tieneCalleH && !tieneNumH && domiPrecioH !== null) {
          const pregCalle = getFraseTexto(frasesCfg.preguntar_calle_numero)
            || "Anotado el barrio 📍 ¿Y cuál es la dirección exacta? (calle o carrera y número)";
          state.complemento_dir_pendiente = pregCalle;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, pregCalle, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregCalle, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
        if (domiPrecioH === null) {
          const pasoDirHB = pasos.find(p => p.campo === "direccion");
          const pregBarrio = (pasoDirHB && pasoDirHB.preg_barrio)
            || getFraseTexto(frasesCfg.preguntar_barrio)
            || "¿Y en qué barrio queda esa dirección? 📍";
          state.complemento_dir_pendiente = pregBarrio;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, pregBarrio, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregBarrio, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
      }
      if (clasifDir.tipo === "publico" && clasifDir.requierePagoAdelantado) {
        const esEfectivo = !esMetodoDigital(state.pago || "", pagosCfg);
        if (esEfectivo) {
          state.pago = null;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          const reply = await buildConversationResponse(
            clienteTexto, histCtx, state,
            findNextStep(state, pasos),
            cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
            true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
          );
          await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
      }
    }

    try {
      const sumMsg = await buildSummaryFromState(state, cfg, branchId, domiciliosCfg);
      state.resumen_enviado = true;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    } catch (err) {
      console.error("buildSummaryFromState error:", err);
      const errMsg = "Disculpa, tuvimos un problema técnico. ¿Me repites los datos? 🙏";
      await sendWaAndSave(convId, tenantId, errMsg, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: errMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    }
    return;
  }

  // 14i. Respuesta conversacional — siempre GPT, maneja todo: normal, frustración, off-script
  const reply = await buildConversationResponse(
    clienteTexto, histCtx, state, nextStep, cfg, frasesCfg,
    menuText, horariosText, pagosText, domiciliosText, currentProductData,
    true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
  );
  await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
}

// ── getFraseCfg / getFraseTexto — lectura de frases con compat hacia atrás ───

function getFraseCfg(value: unknown): { modo: "fija" | "conversacional"; texto?: string; guia?: string } {
  if (!value) return { modo: "fija" };
  if (typeof value === "string") return { modo: "fija", texto: value };
  const obj = value as Record<string, string>;
  return { modo: (obj.modo as "fija" | "conversacional") || "fija", texto: obj.texto, guia: obj.guia };
}

function getFraseTexto(value: unknown): string {
  const f = getFraseCfg(value);
  return f.texto || "";
}

// ── Extractores de slots ──────────────────────────────────────────────────────

function extractPresentacion(text: string, presentations: ProductData["presentations"]): string | null {
  if (!presentations || presentations.length === 0) return null;
  const t = normalizarTexto(text);
  for (const p of presentations) {
    const pNorm = normalizarTexto(p.name);
    if (pNorm.length > 2 && t.includes(pNorm)) return p.name;
  }
  return null;
}

function extractVariable(text: string, options: Array<{ name: string }>): string | null {
  if (!options || options.length === 0) return null;
  const t = normalizarTexto(text);
  for (const opt of options) {
    const oNorm = normalizarTexto(opt.name);
    if (oNorm.length > 2 && t.includes(oNorm)) return opt.name;
  }
  return null;
}

function isProductAttribute(text: string, productData: ProductData | null): boolean {
  if (!productData) return false;
  if (extractPresentacion(text, productData.presentations)) return true;
  for (const vg of productData.variables) {
    if (extractVariable(text, vg.options)) return true;
  }
  return false;
}

// ── Métodos de pago CONFIGURABLES ────────────────────────────────────────────────
// La lista vive en ia_config.pagos.metodos = [{nombre, digital}] — editable desde la
// pantalla Pagos. "digital" = el bot envía QR y espera comprobante. Si no hay lista,
// se derivan de los booleanos viejos (efectivo/nequi/daviplata/tarjeta) por compat.
function getMetodosPago(pagosCfg: Record<string, unknown> | null | undefined): Array<{ nombre: string; digital: boolean }> {
  const lista = pagosCfg?.metodos as Array<{ nombre?: string; digital?: boolean }> | undefined;
  if (Array.isArray(lista) && lista.length > 0) {
    return lista
      .map(m => ({ nombre: String(m?.nombre || "").trim(), digital: !!m?.digital }))
      .filter(m => m.nombre);
  }
  const out: Array<{ nombre: string; digital: boolean }> = [];
  if (pagosCfg?.efectivo)  out.push({ nombre: "Efectivo",  digital: false });
  if (pagosCfg?.nequi)     out.push({ nombre: "Nequi",     digital: true });
  if (pagosCfg?.daviplata) out.push({ nombre: "Daviplata", digital: true });
  if (pagosCfg?.tarjeta)   out.push({ nombre: "Tarjeta",   digital: false });
  return out;
}

// ¿El método elegido es digital (QR + comprobante)? Decide la rama del resumen.
function esMetodoDigital(pago: string | null | undefined, pagosCfg: Record<string, unknown> | null | undefined): boolean {
  const p = normalizarTexto(String(pago || ""));
  if (!p) return false;
  for (const m of getMetodosPago(pagosCfg)) {
    const mn = normalizarTexto(m.nombre);
    if (mn && (mn === p || mn.includes(p) || p.includes(mn))) return m.digital;
  }
  // Fallback si el método guardado no está en la lista actual
  return p.includes("nequi") || p.includes("daviplata") || p.includes("transfer");
}

function extractPago(text: string, pagosCfg: Record<string, unknown> | null | undefined): string | null {
  const t = normalizarTexto(text);
  const metodos = getMetodosPago(pagosCfg);
  // 1) Nombres configurados por el restaurante (frase completa o palabras de 4+ letras)
  for (const m of metodos) {
    const mn = normalizarTexto(m.nombre);
    if (!mn) continue;
    if (t.includes(mn)) return m.nombre.toLowerCase();
    const palabras = mn.split(" ").filter(w => w.length >= 4);
    if (palabras.some(w => new RegExp(`\\b${w}\\b`).test(t))) return m.nombre.toLowerCase();
  }
  // 2) Sinónimos generales → se mapean al método configurado equivalente
  if (/\b(transfer(encia)?|transfe)\b/.test(t)) {
    const dig = metodos.find(m => m.digital);
    return dig ? dig.nombre.toLowerCase() : "transferencia";
  }
  if (/\bcash\b/.test(t) || /\bbilletes?\b/.test(t) || /\bfisico\b/.test(t)) {
    const efe = metodos.find(m => !m.digital);
    return efe ? efe.nombre.toLowerCase() : "efectivo";
  }
  // 3) Legacy directo (por si la lista no los incluye pero el cliente los nombra)
  if (/\bnequi\b/.test(t)) return "nequi";
  if (/\bdaviplata\b/.test(t)) return "daviplata";
  if (/\befectivo\b/.test(t)) return "efectivo";
  const llave = pagosCfg?.llave as string | undefined;
  if (llave && text.toLowerCase().includes(llave.toLowerCase())) {
    const dig = metodos.find(m => m.digital);
    return dig ? dig.nombre.toLowerCase() : "nequi";
  }
  return null;
}

function extractAdiciones(text: string, isCurrentStep: boolean): string | null {
  const t = text.toLowerCase().trim();
  if (t === "no" || t === "no." || t === "noo" || t === "no," || t === "n" || t === "na") {
    return isCurrentStep ? "" : null;
  }
  if (isCurrentStep && RECHAZO_UPSELL_WORDS.some(w => t.includes(w))) return "";
  const tNorm = normalizarTexto(text).toLowerCase();
  const found = getAdicionKeywords().filter(kw => tNorm.includes(kw));
  if (found.length > 0 && found.some(k => !ADICION_GENERICAS.includes(k))) {
    return text.trim().slice(0, 80);
  }
  if (isCurrentStep) {
    const afirma = /^(s[íi]|claro|dale|quiero|si\s+por\s+favor|s[íi]\s+quiero)/.test(t);
    if (afirma) return null;
  }
  return null;
}

function extractDireccion(text: string, isCurrentStep: boolean, productData: ProductData | null = null): string | null {
  const t = text.toLowerCase().trim();
  if (LLEVAR_REGEX.test(t)) return text.trim();
  // Cuando no es el paso de dirección, solo capturar si el texto es corto (<= 65 chars)
  // Evita que mensajes largos con "Carrera"/"Calle" (ej. mensaje inicial con todo el pedido) se almacenen como dirección completa
  if (CALLE_REGEX.test(text) && (isCurrentStep || text.trim().length <= 65)) return text.trim();
  // Mensaje multi-línea (todo-en-uno): capturar SOLO la línea que es una dirección.
  // Caso real: "una personal premium mixta\ncarrera 9 b 63 n 58 bellavista\nSergio Abadia"
  if (!isCurrentStep && text.includes("\n")) {
    const lineaDir = text.split("\n").map(l => l.trim())
      .find(l => l && l.length <= 65 && CALLE_REGEX.test(l) && /\d/.test(l));
    if (lineaDir) return lineaDir;
  }
  if (isCurrentStep && text.trim().length > 8) {
    if (!isProductAttribute(text, productData) && !extractPago(text, null) && !extractNombrePuro(text, productData)) {
      return text.trim();
    }
  }
  return null;
}

function extractNombrePuro(text: string, productData: ProductData | null = null): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 40 || !/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]+$/.test(t)) return false;
  if (extractPago(t, null)) return false;
  if (isProductAttribute(t, productData)) return false;
  return true;
}

// ── Detección de nombre real desde contacto de WhatsApp ───────────────────────

function limpiarNombreWa(raw: string): string {
  return raw
    .replace(/^~+/, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/‍/g, '')
    .trim();
}

function detectarNombreWa(raw: string): string | null {
  const clean = limpiarNombreWa(raw);
  if (clean.length < 2 || clean.length > 50) return null;
  if (!/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛçÇ\s'\-]+$/.test(clean)) return null;
  return clean;
}

// Frases que JAMÁS son un nombre (reclamos, referencias a mensajes anteriores)
const NO_ES_NOMBRE_RE = /\b(ya\s+te\s+lo\s+dije|ya\s+lo\s+dije|ya\s+te\s+dije|ya\s+dije|te\s+lo\s+acabo|acabo\s+de\s+(decir|escribir)|ya\s+lo\s+escrib[ií]|ya\s+lo\s+mencion[eé]|lee\s+arriba|mira\s+arriba|revisa\s+arriba|m[aá]s\s+arriba|otra\s+vez|de\s+nuevo|no\s+s[eé]|el\s+mismo|la\s+misma|lo\s+mismo|llevar|recoger|domicilio|entrega|cocina)\b/i;

// Marcadores EXPLÍCITOS de nombre — permiten capturarlo desde cualquier mensaje
// (no solo en el paso "nombre"), p.ej. cuando el cliente da todo en un solo mensaje.
const NOMBRE_MARCADOR_RE = /(?:me\s+llamo|mi\s+nombre\s+es|a\s+nombre\s+de|el\s+nombre\s+es|cambia\s+el\s+nombre\s+a|el\s+pedido\s+es\s+para)\s+([a-záéíóúüñÁÉÍÓÚÜÑ]+(?:\s+[a-záéíóúüñÁÉÍÓÚÜÑ]+){0,2})/i;

function extractNombre(text: string, isCurrentStep: boolean, productData: ProductData | null = null): string | null {
  if (!isCurrentStep) {
    // Fuera del paso nombre, dos vías seguras:
    // (a) marcador explícito ("me llamo X", "a nombre de X")
    // (b) mensaje multi-línea donde una línea suelta tiene FORMA de nombre
    //     (solo letras, 1-3 palabras) y NO es ningún otro dato del pedido.
    //     Caso real: "una personal premium mixta\ncarrera 9 b 63 n 58\nSergio Abadia"
    const m = text.match(NOMBRE_MARCADOR_RE);
    if (m) {
      text = m[1];
    } else {
      const lineas = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lineas.length < 2) return null;  // con una sola línea es demasiado ambiguo
      let candidato: string | null = null;
      for (const ln of lineas) {
        if (!/^[a-záéíóúüñÁÉÍÓÚÜÑ' -]+$/i.test(ln)) continue;   // solo letras (sin dígitos)
        const words = ln.split(/\s+/);
        if (words.length > 3 || ln.length < 3 || ln.length > 40) continue;
        if (/^(una?|unos?|dos|tres|el|la|los|las|quiero|dame|me|sin|con)\b/i.test(ln)) continue;
        if (SALUDO_REGEX.test(ln)) continue;
        if (NO_ES_NOMBRE_RE.test(ln)) continue;
        if (CONFIRM_WORDS.includes(ln.toLowerCase())) continue;
        const lnLow = ln.toLowerCase();
        if (RECHAZO_UPSELL_WORDS.some(w => lnLow.includes(w))) continue;
        const lnNorm = normalizarTexto(ln);
        if (getAdicionKeywords().some(k => k.length >= 4 && new RegExp(`\\b${k}\\b`).test(lnNorm))) continue;
        if (extractPago(ln, null)) continue;
        if (isProductAttribute(ln, productData)) continue;
        if (CALLE_REGEX.test(ln) || LLEVAR_REGEX.test(ln)) continue;
        candidato = ln;  // la última línea con forma de nombre gana (suele ir al final)
      }
      if (!candidato) return null;
      text = candidato;
    }
  }
  let t = text.trim();
  // Aislar el nombre de frases de corrección/introducción, p.ej.:
  //   "no, va a nombre de Andrea" → "Andrea" · "es para Carlos" → "Carlos" · "me llamo Sergio" → "Sergio"
  t = t.replace(/^(no|s[íi])[,.\s]+/i, "").trim();
  t = t.replace(/^(el\s+nombre\s+(es|va)\s*:?\s*|va\s+a\s+nombre\s+de\s+|a\s+nombre\s+de\s+|es\s+para\s+|me\s+llamo\s+|mi\s+nombre\s+es\s+|el\s+pedido\s+es\s+para\s+|soy\s+|es\s+)/i, "").trim();
  t = t.replace(/\s+(porfa|porfis|por\s+favor|gracias)[.!]*$/i, "").trim();
  t = t.replace(/[.,;]+$/, "").trim();
  if (t.length < 2 || t.length > 60) return null;
  if (NO_ES_NOMBRE_RE.test(t)) return null;                              // reclamos/meta ("ya te lo dije")
  if (CONFIRM_WORDS.includes(t.toLowerCase())) return null;              // "si", "dale", "ok"…
  if (t.includes("?") || t.includes("¿")) return null;                   // preguntas no son nombres
  if (extractPago(t, null)) return null;
  if (isProductAttribute(t, productData)) return null;
  if (CALLE_REGEX.test(t) || LLEVAR_REGEX.test(t)) return null;
  if (/^\d+$/.test(t)) return null;
  return t;
}

// ── loadProductData ───────────────────────────────────────────────────────────

async function loadProductData(productName: string, branchId: string): Promise<ProductData | null> {
  const rows = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=id,name,price_mode,presentations,variables`
  ) as Array<Record<string, unknown>> | null;
  if (!rows || !rows.length) return null;
  const norm = normalizarTexto(productName);
  const matched = rows.find(p => {
    const pname = normalizarTexto(String(p.name || ""));
    if (pname === norm || pname.includes(norm) || norm.includes(pname)) return true;
    if (pname.length >= 4 && norm.length >= 4) {
      const maxDist = Math.floor(Math.min(pname.length, norm.length) / 4);
      if (levenshtein(pname, norm) <= maxDist) return true;
    }
    return false;
  });
  if (!matched) return null;
  return {
    id:            String(matched.id || ""),
    name:          String(matched.name || ""),
    price_mode:    String(matched.price_mode || "simple"),
    presentations: (matched.presentations as ProductData["presentations"]) || [],
    variables:     (matched.variables as ProductData["variables"]) || [],
  };
}

// ── buildProductPasos — pasos dinámicos desde datos del producto ──────────────

function buildProductPasos(productData: ProductData, frasesCfg: Record<string, unknown>): PasoDefinicion[] {
  const pasos: PasoDefinicion[] = [];
  if (productData.presentations.length > 1) {
    const opciones = productData.presentations.map(p => p.name).join(" o ");
    const frase = getFraseCfg(frasesCfg.preguntar_presentacion);
    const texto = (frase.texto || "¿La quieres {opciones}? 😋").replace(/\{opciones\}/g, opciones);
    const guia  = frase.guia
      ? frase.guia.replace(/\{opciones\}/g, opciones)
      : `Pregunta cuál presentación prefiere. SOLO estas opciones exactas: ${opciones}. No ofrezcas ninguna otra opción.`;
    pasos.push({ id: "presentacion", campo: "tamano", modo: frase.modo, texto, guia });
  }
  for (const vg of productData.variables) {
    if (!vg.options || vg.options.length === 0) continue;
    const opciones = vg.options.map(o => o.name).join(", ");
    const frase = getFraseCfg(frasesCfg.preguntar_variable);
    const texto = (frase.texto || "¿{label}? ({opciones}) 🍟")
      .replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones);
    const guia  = frase.guia
      ? frase.guia.replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones)
      : `Pregunta por "${vg.name}". SOLO estas opciones exactas: ${opciones}. Jamás menciones ni ofrezcas ninguna otra.`;
    pasos.push({ id: `variable_${vg.id}`, campo: "tipo", modo: frase.modo, texto, guia });
  }
  return pasos;
}

// ── Extractor de producto (GPT) ───────────────────────────────────────────────

async function extractProducto(
  text: string,
  menuText: string,
): Promise<{ producto: string | null; cantidad: number }> {
  if (!text.trim()) return { producto: null, cantidad: 1 };
  const prompt = `Dado este menú:\n${menuText}\n\nMensaje del cliente: "${text}"\n\n¿Qué producto está pidiendo? Devuelve SOLO JSON con el nombre BASE del producto (solo el nombre, SIN precios ni variantes, tal como aparece antes de ':' o de los precios en el menú), o null si no pide ningún producto:\n{"producto": "nombre base del producto o null","cantidad": 1}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1200);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 100, temperature: 0, response_format: { type: "json_object" } }),
      });
      if (!res.ok) { console.error("extractProducto error:", res.status); continue; }
      const data = await res.json() as Record<string, unknown>;
      const content = String(((data.choices as Array<Record<string,unknown>>)?.[0]?.message as Record<string,unknown>)?.content || "{}");
      const parsed = JSON.parse(content) as { producto?: string | null; cantidad?: number };
      return {
        producto: typeof parsed.producto === "string" && parsed.producto.length > 0 ? parsed.producto : null,
        cantidad: typeof parsed.cantidad === "number" ? Math.max(1, parsed.cantidad) : 1,
      };
    } catch (err) { console.error("extractProducto attempt error:", err); }
  }
  return { producto: null, cantidad: 1 };
}

// ── runExtractors ─────────────────────────────────────────────────────────────

function runExtractors(
  text: string,
  state: PacoState,
  currentStepId: string | null,
  pagosCfg: Record<string, unknown> | null | undefined,
  productData: ProductData | null,
  nombreWa: string | null = null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Complemento de dirección pendiente (barrio, número, referencia)
  // El cliente está respondiendo la pregunta específica — tomamos su texto y lo concatenamos
  if (state.complemento_dir_pendiente && state.direccion) {
    const t = text.trim();
    const esPreg = t.includes("?") || t.includes("¿");
    const esCorto = t.length <= 60;  // barrio/número no debería ser un párrafo
    const esNuevaDireccion = CALLE_REGEX.test(text) || LLEVAR_REGEX.test(text.toLowerCase());
    if (!esPreg && esCorto && t.length > 1 && !extractPago(t, pagosCfg) && !isProductAttribute(t, productData)) {
      if (esNuevaDireccion) {
        // Cliente dio una dirección completa — extraer y reemplazar en vez de concatenar
        const newDir = extractDireccion(text, true, productData);
        result.direccion = newDir || text;
      } else {
        result.direccion = state.direccion.trimEnd().replace(/,\s*$/, "") + ", " + t;
      }
      result.complemento_dir_pendiente = null;
      return result;
    }
  }

  if (!state.tamano && productData && productData.presentations.length > 1) {
    const p = extractPresentacion(text, productData.presentations);
    if (p) result.tamano = p;
  }
  if (!state.tipo && productData && productData.variables.length > 0) {
    const firstVg = productData.variables[0];
    const v = extractVariable(text, firstVg.options);
    if (v) result.tipo = v;
  }
  if (!state.pago) {
    const p = extractPago(text, pagosCfg);
    if (p) result.pago = p;
  }
  if (state.adiciones === null) {
    const isUpsellStep = currentStepId === "upsell";
    // Si este mismo mensaje corto acaba de responder tamaño o variante, ES la
    // respuesta al paso — no una adición ("Mixta porfa" responde a la pregunta
    // de variante, no pide una adición)
    const esRespuestaVariante = !isUpsellStep && text.trim().length <= 25 &&
      (("tipo" in result) || ("tamano" in result));
    if (!esRespuestaVariante) {
      const a = extractAdiciones(text, isUpsellStep);
      if (a !== null) result.adiciones = a;
    }
  }
  if (currentStepId === "confirmar_dir" && state.direccion && state.direccion_heredada) {
    const textoLow = text.toLowerCase().trim();
    const confirmaDir = CONFIRM_WORDS.some(w => textoLow === w || textoLow.includes(w));
    const rechazaDir = textoLow === "no" || textoLow === "no." || textoLow.startsWith("no,") || textoLow.includes("cambia") || textoLow.includes("otra");
    const nuevaDir = extractDireccion(text, true, productData);
    if (rechazaDir) { result.direccion = null; result.direccion_heredada = false; }
    else if (nuevaDir && !confirmaDir) { result.direccion = nuevaDir; result.direccion_heredada = false; }
    else if (confirmaDir) { result.direccion_heredada = false; }
    // No early return: los demás extractores corren siempre para capturar pago, nombre, etc.
    // del mismo mensaje. Cada paso es independiente del resto.
  }
  if (!state.direccion) {
    const isDirStep = currentStepId === "direccion";
    const d = extractDireccion(text, isDirStep, productData);
    if (d) result.direccion = d;
  }
  if (!state.nombre) {
    const isNombreStep = currentStepId === "nombre";
    if (isNombreStep && nombreWa) {
      const tLow = text.toLowerCase().trim();
      const confirma = CONFIRM_WORDS.some(w => tLow === w || tLow.startsWith(w + " ") || tLow.endsWith(" " + w));
      if (confirma) {
        result.nombre = nombreWa;
      } else {
        const n = extractNombre(text, true, productData);
        if (n) result.nombre = n;
      }
    } else {
      const n = extractNombre(text, isNombreStep, productData);
      if (n) result.nombre = n;
    }
  }
  return result;
}

// ── mergeSlots ────────────────────────────────────────────────────────────────

function mergeSlots(state: PacoState, updates: Record<string, unknown>): PacoState {
  const next = { ...state };
  for (const key of Object.keys(updates)) {
    (next as Record<string, unknown>)[key] = updates[key];
  }
  return next;
}

// ── findNextStep ──────────────────────────────────────────────────────────────

function findNextStep(state: PacoState, pasos: PasoDefinicion[]): PasoDefinicion | null {
  // Si hay un complemento de dirección pendiente (barrio, número, referencia)
  // el slot "direccion" no se considera completo hasta que se resuelva
  if (state.complemento_dir_pendiente) {
    return { id: "complemento_dir", campo: "direccion", modo: "fija", texto: state.complemento_dir_pendiente };
  }
  for (const paso of pasos) {
    if (paso.id === "presentacion") {
      if (!state.tamano) return paso;
    } else if (paso.id.startsWith("variable_")) {
      if (!state.tipo) return paso;
    } else if (paso.id === "upsell") {
      if (state.adiciones === null) return paso;
    } else if (paso.id === "confirmar_dir") {
      if (state.direccion && state.direccion_heredada) return paso;
    } else if (paso.id === "direccion") {
      if (!state.direccion) return paso;
    } else if (paso.id === "pago") {
      if (!state.pago) return paso;
    } else if (paso.id === "nombre") {
      if (!state.nombre) return paso;
    }
  }
  return null;
}

// ── getFlowPasos + buildAllPasos ──────────────────────────────────────────────

function getFlowPasos(cfg: Record<string, unknown>, frasesCfg: Record<string, unknown>, nombreConfirmar: string | null = null, esRecurrente = false): PasoDefinicion[] {
  const customPasos = cfg.flujo_pasos as PasoDefinicion[] | null | undefined;
  if (customPasos && Array.isArray(customPasos) && customPasos.length > 0) return customPasos;

  const upsell  = getFraseCfg(frasesCfg.upsell);
  const destino = getFraseCfg(frasesCfg.preguntar_destino);
  const pago    = getFraseCfg(frasesCfg.confirmar_pago);
  const nombre  = getFraseCfg(frasesCfg.nombre_recibir);

  const nombreGuia = nombreConfirmar
    ? esRecurrente
      ? `Cliente recurrente — ya ha pedido antes y su nombre guardado es "${nombreConfirmar}". Salúdalo con familiaridad (ej: "¡Hola de nuevo, ${nombreConfirmar}!") y luego confirma que el pedido va a ese nombre: "¿Va a nombre de ${nombreConfirmar}?" — si confirma, úsalo; si da otro, usa el que indique.`
      : `El contacto de WhatsApp se llama "${nombreConfirmar}". Confirma si el pedido va a ese nombre, preguntando algo como "¿Va a nombre de ${nombreConfirmar}?" — si confirma, úsalo; si da otro, usa el que indique.`
    : nombre.guia;

  // Orden por defecto: upsell → dirección → nombre → PAGO (el pago es lo último antes del resumen).
  // Configurable desde el canvas vía cfg.flujo_pasos (ver getFlowPasos/buildAllPasos).
  return [
    { id: "upsell",        campo: "adiciones", modo: upsell.modo,  texto: upsell.texto  || "¿Deseas agregar algo más a tu pedido? 🤩", guia: upsell.guia },
    { id: "confirmar_dir", campo: "direccion", modo: "conversacional", guia: "Pregunta de forma amigable si el pedido va a la misma dirección que el pedido anterior" },
    { id: "direccion",     campo: "direccion", modo: destino.modo, texto: destino.texto || "Con gusto, ¿para dónde va tu pedido? ☺️", guia: destino.guia },
    { id: "nombre",        campo: "nombre",    modo: "conversacional", texto: nombreConfirmar ? undefined : (nombre.texto || "¿A nombre de quién se recibe el pedido? 🍟"), guia: nombreGuia },
    { id: "pago",          campo: "pago",      modo: pago.modo,    texto: pago.texto    || "¿Cómo nos vas a pagar? ({{metodos_pago}}) ☺️", guia: pago.guia },
  ];
}

function buildAllPasos(productData: ProductData | null, cfg: Record<string, unknown>, frasesCfg: Record<string, unknown>, nombreConfirmar: string | null = null, esRecurrente = false): PasoDefinicion[] {
  // Flujo configurado desde el canvas (ia_config.flujo_pasos) — respeta orden/modo/frase de cada paso,
  // pero inyecta las opciones dinámicas del producto (tamaño/tipo vienen del catálogo, no del canvas).
  const customRaw = cfg.flujo_pasos;
  if (Array.isArray(customRaw) && customRaw.length > 0) {
    try {
      const procesados = procesarFlujoCanvas(customRaw as Array<Record<string, unknown>>, productData, nombreConfirmar, esRecurrente);
      if (procesados.length > 0) return procesados;
    } catch (err) {
      console.error("procesarFlujoCanvas falló, usando flujo por defecto:", err);
    }
  }
  // Flujo por defecto (hardcoded) — usado cuando no hay flujo del canvas o si éste falla
  const productPasos = productData ? buildProductPasos(productData, frasesCfg) : [];
  return [...productPasos, ...getFlowPasos(cfg, frasesCfg, nombreConfirmar, esRecurrente)];
}

// Convierte el flujo exportado del canvas (array ordenado de pasos) al formato PasoDefinicion
// que entiende findNextStep. Inyecta opciones dinámicas para tamaño/tipo y omite pasos que
// no aplican al producto (ej. tamaño si el producto no tiene presentaciones).
function procesarFlujoCanvas(
  canvasPasos: Array<Record<string, unknown>>,
  productData: ProductData | null,
  nombreConfirmar: string | null,
  esRecurrente: boolean,
): PasoDefinicion[] {
  const out: PasoDefinicion[] = [];
  for (const p of canvasPasos) {
    if (!p || typeof p !== "object") continue;
    if (p.activo === false) continue;
    const campo = String(p.campo || "");
    // modo: acepta 'modo' (fija/conversacional) o 'tipo' del canvas (fija/ia)
    const modo: "fija" | "conversacional" =
      (p.modo === "conversacional" || p.tipo === "ia") ? "conversacional" : "fija";
    let texto = String(p.texto || p.frase || "");
    let guia  = String(p.guia || p.instrucciones || "");

    if (campo === "tamano") {
      if (!productData || productData.presentations.length <= 1) continue;
      const opciones = productData.presentations.map(x => x.name).join(" o ");
      texto = (texto || "¿La quieres {opciones}? 😋").replace(/\{opciones\}/g, opciones);
      guia  = (guia || `Pregunta cuál presentación prefiere. SOLO estas opciones exactas: ${opciones}. No ofrezcas ninguna otra.`).replace(/\{opciones\}/g, opciones);
      out.push({ id: "presentacion", campo: "tamano", modo, texto, guia });
    } else if (campo === "tipo") {
      if (!productData || productData.variables.length === 0) continue;
      const vg = productData.variables[0];
      if (!vg.options || vg.options.length === 0) continue;
      const opciones = vg.options.map(o => o.name).join(", ");
      texto = (texto || "¿{label}? ({opciones}) 🍟").replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones);
      guia  = (guia || `Pregunta por "${vg.name}". SOLO estas opciones exactas: ${opciones}. Jamás menciones otra.`).replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones);
      out.push({ id: `variable_${vg.id}`, campo: "tipo", modo, texto, guia });
    } else if (campo === "producto") {
      // El paso "producto" no entra al slot-filling (findNextStep): lo consume el caso
      // sin-producto de buildConversationResponse leyendo cfg.flujo_pasos directamente.
      continue;
    } else if (campo === "adiciones") {
      out.push({ id: "upsell", campo: "adiciones", modo, texto: texto || undefined, guia: guia || undefined });
    } else if (campo === "direccion") {
      out.push({
        id: "direccion", campo: "direccion", modo,
        texto: texto || "Con gusto, ¿para dónde va tu pedido? ☺️", guia,
        preg_incompleta: p.preg_incompleta ? String(p.preg_incompleta) : undefined,
        preg_barrio:     p.preg_barrio ? String(p.preg_barrio) : undefined,
      });
    } else if (campo === "pago") {
      out.push({ id: "pago", campo: "pago", modo, texto: texto || "¿Cómo nos vas a pagar? ({{metodos_pago}}) ☺️", guia });
    } else if (campo === "nombre") {
      // El canvas MANDA: si el usuario configuró una frase fija para el nombre, se usa esa
      // (puede incluir {{cliente}} para el nombre del contacto). La confirmación automática
      // del nombre de WhatsApp queda solo como comportamiento por defecto (sin frase configurada).
      if (modo === "fija" && texto) {
        out.push({ id: "nombre", campo: "nombre", modo: "fija", texto, guia });
      } else {
        const nombreGuia = nombreConfirmar
          ? (esRecurrente
              ? `Cliente recurrente — su nombre guardado es "${nombreConfirmar}". Salúdalo con familiaridad y confirma: "¿Va a nombre de ${nombreConfirmar}?" — si confirma úsalo; si da otro, usa ese.`
              : `El contacto de WhatsApp se llama "${nombreConfirmar}". Confirma si el pedido va a ese nombre: "¿Va a nombre de ${nombreConfirmar}?" — si confirma úsalo; si da otro, usa ese.`)
          : (guia || "Pregunta a nombre de quién se recibe el pedido.");
        out.push({
          id: "nombre", campo: "nombre",
          modo: nombreConfirmar ? "conversacional" : modo,
          texto: nombreConfirmar ? undefined : (texto || "¿A nombre de quién se recibe el pedido? 🍟"),
          guia: nombreGuia,
        });
      }
    }
    // Nodos sin campo de slot (saludo, resumen, inicio, timer) no son pasos de slot-filling → ignorados aquí.
  }
  return out;
}

// ── Variables automáticas del catálogo ───────────────────────────────────────────
// Cada producto genera sus variables por nombre: {{presentaciones_<slug>}} y
// {{variantes_<slug>}} (ej: presentaciones_coca_cola → "personal o 1.5 litros").
// Además, los SELECTORES {{presentaciones_producto}} / {{variantes_producto}}
// resuelven las del producto que el cliente está pidiendo (state.producto).
function slugVariable(nombre: string): string {
  return nombre.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function listaNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " o " + items[items.length - 1];
}

// ── Catálogo de FUENTES de datos disponibles para las variables ──────────────────
// El usuario crea variables (en el canvas) que apuntan a una de estas fuentes.
// Este es el mismo catálogo que la UI ofrece en "Crear variable → Dato".
// id de fuente → cómo se resuelve. Si no hay dato, devuelve "".
function resolverDato(
  fuente: string,
  state: PacoState,
  varData: Record<string, unknown>,
  domiciliosCfg: Record<string, unknown> | null | undefined,
): string {
  switch (fuente) {
    // Del pedido en curso
    case "producto":  return state.producto || "";
    case "tamano":    return state.tamano || "";
    case "tipo":      return state.tipo || "";
    case "cantidad":  return String(state.cantidad || 1);
    case "adiciones": return (state.adiciones && state.adiciones.length > 0) ? state.adiciones : "";
    case "direccion": return state.direccion || "";
    case "pago":      return state.pago || "";
    case "nombre":    return state.nombre || "";
    case "precio_domi":
    case "total_domi": {
      const esLlevar = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
      const dp = (!esLlevar && state.direccion) ? lookupDomiPrice(state.direccion, domiciliosCfg) : null;
      return esLlevar ? "para llevar" : dp === null ? "a confirmar" : dp === 0 ? "Gratis" : fmtCOP(dp);
    }
    // Precio de producto/total requieren catálogo → capa siguiente
    case "precio":
    case "precio_total":
    case "gran_total": return "a confirmar";
    // SELECTORES: presentaciones/variantes del producto que el cliente está pidiendo
    case "presentaciones_producto":
    case "variantes_producto": {
      if (!state.producto) return "";
      const pref = fuente === "presentaciones_producto" ? "presentaciones_" : "variantes_";
      const slug = slugVariable(state.producto);
      if ((pref + slug) in varData) return String(varData[pref + slug] ?? "");
      // Coincidencia flexible (el nombre extraído puede diferir levemente del catálogo)
      for (const k of Object.keys(varData)) {
        if (!k.startsWith(pref)) continue;
        const ks = k.slice(pref.length);
        if (ks.includes(slug) || slug.includes(ks)) return String(varData[k] ?? "");
      }
      return "";
    }
    // Datos precargados en cfg._varData (tiempo, restaurante, pagos, catálogo, cliente,
    // y las variables automáticas por producto: presentaciones_<slug> / variantes_<slug>)
    default:
      return (fuente in varData) ? String(varData[fuente] ?? "") : "";
  }
}

// ── rellenarVariables — resuelve {{...}} en cualquier frase ──────────────────────
// Orden de resolución de cada {{X}}:
//   1. Variable creada por el usuario (ia_config.variables): tipo "frase" (texto, resuelto en
//      cascada) o tipo "dato" (apunta a una fuente del catálogo de arriba).
//   2. Fuente nativa directa (compatibilidad: {{producto}}, {{precio_domi}}, etc.).
//   3. Si no existe / sin dato → "" (queda vacío).
// Dependencia de barrio: si se usa precio de domicilio/total y aún no hay barrio válido,
// retorna faltaBarrio=true para que el motor pida el barrio en vez de dar un precio falso.
function rellenarVariables(
  texto: string,
  state: PacoState,
  cfg: Record<string, unknown> | null | undefined,
  depth = 0,
): { texto: string; faltaBarrio: boolean } {
  if (!texto || !texto.includes("{{")) return { texto: texto || "", faltaBarrio: false };

  const domiciliosCfg = (cfg?.domicilios as Record<string, unknown>) || null;
  const varData       = (cfg?._varData as Record<string, unknown>) || {};
  const varsUsuario   = (cfg?.variables as Record<string, { tipo?: string; fuente?: string; texto?: string }>) || {};

  const esLlevar   = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
  const domiPrecio = (!esLlevar && state.direccion) ? lookupDomiPrice(state.direccion, domiciliosCfg) : null;
  const barrioFaltante = (fuente: string) =>
    (fuente === "precio_domi" || fuente === "total_domi" || fuente === "precio_total" || fuente === "gran_total")
    && !esLlevar && domiPrecio === null;
  let faltaBarrio = false;

  const out = texto.replace(/\{\{\s*([A-Za-z0-9_:áéíóúñÁÉÍÓÚÑ]+)\s*\}\}/g, (_m, nombreRaw) => {
    const key = String(nombreRaw).trim();
    const uv = varsUsuario[key];
    if (uv) {
      if (uv.tipo === "frase") {
        if (depth >= 6) return "";                       // corta cascadas/bucles
        const r = rellenarVariables(uv.texto || "", state, cfg, depth + 1);
        if (r.faltaBarrio) faltaBarrio = true;
        return r.texto;
      }
      if (uv.tipo === "dato" && uv.fuente) {
        if (barrioFaltante(uv.fuente)) faltaBarrio = true;
        return resolverDato(uv.fuente, state, varData, domiciliosCfg);
      }
      return "";
    }
    // Fuente nativa directa (compatibilidad con las variables ya usadas)
    if (barrioFaltante(key)) faltaBarrio = true;
    return resolverDato(key, state, varData, domiciliosCfg);
  });

  return { texto: out, faltaBarrio };
}

// ── buildConversationResponse — GPT para TODAS las respuestas del bot ─────────

async function buildConversationResponse(
  clienteTexto: string,
  history: Array<{ direction: string; body: string }>,
  state: PacoState,
  nextStep: PasoDefinicion | null,
  cfg: Record<string, unknown>,
  frasesCfg: Record<string, unknown>,
  menuText: string,
  horariosText: string,
  pagosText: string,
  domiciliosText: string,
  productData: ProductData | null,
  restauranteAbierto: boolean,
  senderName: string,
  colTimeStr: string,
  colDayStr: string,
  horaAperturaHoy: string,
  horaCierreHoy: string,
  proxDia: string,
  esRecurrente = false,
): Promise<string> {
  const botCfg      = (cfg.bot as Record<string, string>) || {};
  const perfil      = (cfg.perfil as Record<string, string>) || {};
  const botName     = botCfg.nombre || perfil.nombre || "Paco";
  const tono        = botCfg.tono || (cfg.tono as string) || "cercano";
  // Personalidad: el campo Instrucciones (limpio de flujo — solo identidad/estilo/conocimiento)
  const personalidad = botCfg.personalidad || (cfg.personalidad as string) || (cfg.instrucciones as string) || "";
  const tonoStr     = tono === "formal" ? "formal y profesional, sin emojis" : "amigable y cercano, con emojis con moderación";

  // Resumen del estado del pedido
  const allItems = [...(state.items || [])];
  if (state.producto) allItems.push({ producto: state.producto, tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones });

  const stateLines: string[] = ["PEDIDO EN CURSO:"];
  if (allItems.length === 0) {
    stateLines.push("- Sin producto todavía");
  } else {
    for (const item of allItems) {
      const desc = [item.producto, item.tipo, item.tamano ? `(${item.tamano})` : null].filter(Boolean).join(" ");
      stateLines.push(`✅ ${item.cantidad}x ${desc}${item.adiciones && item.adiciones.length > 0 ? " + " + item.adiciones : item.adiciones === "" ? " (sin adición)" : ""}`);
    }
  }
  if (state.direccion) stateLines.push(`✅ Dirección: ${state.direccion}${state.direccion_heredada ? " (heredada, pendiente confirmar)" : ""}`);
  else stateLines.push("⏳ Dirección: pendiente");
  if (state.pago)      stateLines.push(`✅ Pago: ${state.pago}`);
  else                 stateLines.push("⏳ Pago: pendiente");
  if (state.nombre)    stateLines.push(`✅ Nombre: ${state.nombre}`);
  else                 stateLines.push("⏳ Nombre: pendiente");
  if (state.resumen_enviado) stateLines.push("ℹ️ El resumen del pedido ya fue enviado al cliente.");

  // Instrucción del siguiente paso
  let nextStepLine = "";
  if (!restauranteAbierto) {
    const ci = (cfg as Record<string, unknown>)._cerradoInfo as { tipo: string; frase: string } | null;
    const estadoFrase = ci?.frase || `Estamos cerrados ahora (hoy: ${horaAperturaHoy || "sin servicio"} – ${horaCierreHoy || ""}; volvemos ${proxDia}).`;
    nextStepLine =
      `ESTADO DEL RESTAURANTE — FUERA DE SERVICIO. Frase oficial del estado:\n"${estadoFrase}"\n` +
      `REGLA ESTRICTA: NO tomes pedidos ni avances NINGÚN paso del flujo — nada de preguntar tamaños, tipos, direcciones, pagos ni nombres, sin importar cuánto insista el cliente.\n` +
      `• Si el cliente pregunta INFORMACIÓN (precios, la carta, ubicación, horarios, dudas del CONTEXTO DEL NEGOCIO): RESPONDE la pregunta con normalidad y de forma completa — esa es tu prioridad. No repitas la frase del estado en cada mensaje.\n` +
      `• SOLO si el cliente intenta hacer o continuar un PEDIDO: empieza con la frase oficial del estado (tal cual) y dile cuándo puede pedir.\n` +
      `Hora actual: ${colTimeStr}, ${colDayStr}.`;
  } else if (state.resumen_enviado) {
    nextStepLine = "El resumen ya fue enviado. Responde naturalmente al cliente. Si confirma el pedido, exprésalo positivamente. Si quiere corregir algo, confirma el cambio.";
  } else if (nextStep) {
    const modo = nextStep.modo || "fija";
    // Pregunta de desbloqueo del barrio (cuando una variable de precio lo necesita)
    const pregBarrioDesbloqueo = getFraseTexto(frasesCfg.preguntar_barrio)
      || getFraseTexto(frasesCfg.preguntar_destino)
      || "¿Para dónde va tu pedido? Así te confirmo el domicilio 📍";
    if (modo === "fija" && (nextStep.texto || nextStep.pregunta)) {
      const textoOrig = nextStep.texto || nextStep.pregunta || "";
      const { texto: textoFijo, faltaBarrio } = rellenarVariables(textoOrig, state, cfg);
      if (faltaBarrio) {
        // La frase necesita el precio del domicilio pero aún no hay barrio → pedirlo primero
        nextStepLine =
          `El cliente necesita saber el precio del domicilio, pero aún no sabemos su barrio.\n` +
          `MODO FIJA — REGLA ESTRICTA: Tu respuesta debe ser esta frase EXACTA, sin cambiarla:\n"${pregBarrioDesbloqueo}"\n` +
          `NO des ningún precio de domicilio todavía. Primero necesitamos el barrio.`;
      } else {
        nextStepLine =
          `PRÓXIMO PASO — obtener: ${nextStep.campo}.\n` +
          `MODO FIJA — REGLA ESTRICTA: Tu respuesta debe ser esta frase EXACTA, palabra por palabra:\n"${textoFijo}"\n` +
          `PROHIBIDO agregar preguntas, datos, cantidades o comentarios propios antes o después de la frase. ` +
          `Jamás inventes preguntas que no estén en la frase (ej: denominación del billete, con cuánto pagas, etc.).\n` +
          `Únicas variaciones permitidas: (a) si el cliente acaba de darte un dato, puedes anteponer SOLO una confirmación de 2-3 palabras ("¡Perfecto! 🙌") y nada más; ` +
          `(b) si el cliente preguntó algo distinto o hay confusión, respóndele en UNA frase breve y luego envía la frase EXACTA.`;
      }
    } else if (modo === "conversacional" && nextStep.guia) {
      const { texto: guiaVars, faltaBarrio } = rellenarVariables(nextStep.guia, state, cfg);
      if (faltaBarrio) {
        nextStepLine =
          `El cliente necesita el precio del domicilio pero aún no sabemos su barrio. ` +
          `Tu único objetivo ahora es preguntarle el barrio o la dirección de forma natural para poder calcular el domicilio. ` +
          `NO des ningún precio de domicilio todavía.`;
      } else {
        nextStepLine = `PRÓXIMO PASO — obtener: ${nextStep.campo}.\nMODO CONVERSACIONAL: responde al cliente de forma natural. Tu único objetivo en este paso es obtener: ${guiaVars}. No pidas ningún otro dato, no inventes preguntas fuera de ese objetivo.`;
      }
    } else {
      const textoOrig = nextStep.texto || nextStep.pregunta || nextStep.guia || "";
      const { texto } = rellenarVariables(textoOrig, state, cfg);
      nextStepLine = `PRÓXIMO PASO — obtener: ${nextStep.campo}. Pregunta: "${texto}"`;
    }
  } else if (state.producto) {
    nextStepLine = "Todos los datos del pedido están completos. Informa al cliente que en un momento le envías el resumen para confirmar.";
  } else {
    // Cliente aún sin producto. La frase y el comportamiento salen del NODO PRODUCTO del
    // canvas (paso con campo="producto" en flujo_pasos); fallback: menu_frase / apertura.
    const pasoProd = Array.isArray(cfg.flujo_pasos)
      ? (cfg.flujo_pasos as Array<Record<string, unknown>>).find(p => p && p.campo === "producto" && p.activo !== false)
      : null;
    const menuFraseCfg = (cfg.menu_frase as Record<string, string>) || {};
    const prodModo = pasoProd && (pasoProd.modo === "conversacional") ? "conversacional" : "fija";
    const mostrarMenu = pasoProd ? pasoProd.mostrar_menu !== false : true;

    if (pasoProd && prodModo === "conversacional" && pasoProd.guia) {
      const { texto: guiaProd } = rellenarVariables(String(pasoProd.guia), state, cfg);
      nextStepLine =
        `El cliente todavía no especificó cuál producto exacto quiere. Tu objetivo: lograr que elija un producto.\n` +
        `MODO CONVERSACIONAL — sigue esta guía del restaurante: ${guiaProd}\n` +
        (mostrarMenu
          ? `Si el cliente expresa que quiere pedir (no solo saludar), muestra el menú de la sección MENÚ de abajo en lista con precios (cópialo tal cual).\n`
          : `NO muestres el menú completo salvo que el cliente lo pida.\n`) +
        `PROHIBIDO enumerar tipos o variantes de producto en el texto.`;
    } else {
      const fraseGenericaRaw = (pasoProd && (pasoProd.texto || pasoProd.frase))
        ? String(pasoProd.texto || pasoProd.frase)
        : (menuFraseCfg.texto || getFraseTexto(frasesCfg.apertura) || "¿Qué deseas ordenar? 😋");
      const { texto: fraseGenerica } = rellenarVariables(fraseGenericaRaw, state, cfg);
      nextStepLine =
        `El cliente todavía no especificó cuál producto exacto quiere.\n` +
        `• Si SOLO está saludando, agradeciendo o haciendo charla (hola, buenas, gracias, ¿cómo estás?): responde breve y amable en 1 oración y termina con esta frase EXACTA: "${fraseGenerica}". NUNCA muestres la carta en este caso.\n` +
        (mostrarMenu
          ? `• Si el cliente EXPRESA que quiere pedir pero sin decir cuál (ej: "quiero algo de comer", "qué tienen", "quiero pedir"): responde con la frase EXACTA "${fraseGenerica}" y a continuación muestra el menú de la sección MENÚ de abajo, en lista con precios (cópialo tal cual).\n`
          : `• Si el cliente EXPRESA que quiere pedir pero sin decir cuál: responde con la frase EXACTA "${fraseGenerica}". NO muestres el menú completo salvo que lo pida.\n`) +
        `PROHIBIDO enumerar tipos o variantes de producto en el texto, o inventar preguntas. Máximo 2 oraciones aparte del menú.`;
    }
  }

  const sysLines = [
    `Eres ${botName}, el asistente virtual de este restaurante. Atiendes pedidos por WhatsApp.`,
    personalidad || `Tono: ${tonoStr}.`,
    "Nunca menciones que eres IA o un bot. No uses diminutivos.",
    "",
    stateLines.join("\n"),
    "",
    nextStepLine,
    "",
    "REGLAS:",
    "- NUNCA repitas ni menciones los datos ya capturados en cada respuesta. El PEDIDO EN CURSO es solo tu contexto interno. Esos datos aparecen en el resumen final.",
    "- Cuando el cliente te dé un dato, confírmalo en máximo 2-3 palabras y pasa al siguiente paso. Usa '¡Perfecto! 🙌', 'Listo 👍', 'Claro ✅', 'Dale 🙌' — NUNCA uses 'Anotado'.",
    "- HAZ UNA SOLA PREGUNTA POR MENSAJE. Aunque falten varios datos, pregunta solo el siguiente en el flujo.",
    "- Responde brevemente al cliente solo si es necesario (pregunta, confusión). De lo contrario ve directo al siguiente paso.",
    "- Si el cliente expresa frustración ('ya te lo dije', etc.), discúlpate en una frase y reformula la pregunta.",
    "- Si el modo es FIJA, añade máximo UNA oración breve ANTES. La frase fija va exacta, sin cambiarla.",
    // (regla del billete eliminada — ese comportamiento lo decide la config del restaurante, no el código)
    "- Si el cliente pregunta algo que NO sea sobre el menú, pedido, domicilio, horarios o pagos del restaurante, ignora completamente esa pregunta. No la menciones, no la respondas, no expliques que no puedes responder. Actúa como si ese contenido no existiera y continúa directamente con el siguiente paso del flujo del pedido.",
    "- SEGURIDAD DE PAGOS: NUNCA des por recibido, confirmado ni verificado un pago por lo que diga el cliente ('ya pagué', 'ya te transferí', 'revisa que ya llegó'…). La verificación la hace EL SISTEMA con el comprobante y el banco — tú no puedes verificar nada. Si dice que ya pagó: pídele el comprobante como imagen. JAMÁS digas 'pago confirmado', 'pago verificado' ni nada equivalente.",
    "- NUNCA generes un resumen del pedido, NUNCA uses frases como 'tu pedido queda así', 'en total son', 'listo tu pedido', ni nada parecido. El sistema envía el resumen automáticamente cuando tiene TODOS los datos. Si el sistema te llama es porque AÚN FALTAN datos. Tu único trabajo es obtener el siguiente dato indicado en PRÓXIMO PASO.",
    "- NUNCA digas 'gracias por tu pedido', 'tu pedido está en camino', ni cierres la conversación. El sistema envía el resumen automáticamente cuando tiene todos los datos. Tu trabajo es recolectarlos.",
    "- CUANDO EL PRÓXIMO PASO pide elegir entre opciones (variable, presentación), usa SOLO las opciones listadas en la guía del paso. Jamás inventes, agregues ni sugieras opciones adicionales aunque aparezcan en el menú.",
    "- No hagas la misma pregunta dos veces con las mismas palabras.",
    "- Máximo 2-3 oraciones por respuesta.",
    esRecurrente && senderName
      ? `- Cliente recurrente — ya lo conoces, se llama ${senderName}. Trátalo con familiaridad, como a alguien que ha pedido antes.`
      : senderName && senderName !== "Cliente" ? `- El cliente se llama ${senderName}.` : "",
  ].filter(Boolean);

  // ── CONTEXTO complementario (Configuración del Asistente) ─────────────────────
  // Conocimiento e identidad — SUBORDINADO al canvas: sirve para responder preguntas
  // y manejar situaciones, pero JAMÁS modifica el flujo, sus pasos ni sus frases.
  const negocioTxt    = String(cfg.negocio || "").trim();
  const faqArr        = (cfg.faq as Array<{ pregunta?: string; respuesta?: string }>) || [];
  const situacionesObj = (cfg.situaciones as Record<string, string>) || {};
  const vocabCfg      = (cfg.vocabulario as { usar?: string[]; evitar?: string }) || {};
  const prohibArr     = (cfg.prohibiciones as string[]) || [];
  const hayContexto = negocioTxt || faqArr.length > 0 || Object.keys(situacionesObj).length > 0 ||
    (vocabCfg.usar && vocabCfg.usar.length > 0) || prohibArr.length > 0;
  if (hayContexto) {
    sysLines.push("", "CONTEXTO DEL NEGOCIO — úsalo SOLO para responder preguntas del cliente o manejar situaciones. El flujo del pedido, sus pasos y sus frases los dicta PRÓXIMO PASO — NADA de esta sección los modifica:");
    if (negocioTxt) sysLines.push(`INFO: ${negocioTxt}`);
    const faqLines = faqArr
      .filter(f => f && f.pregunta && f.respuesta)
      .map(f => `- ${f.pregunta} → ${String(f.respuesta)
        .replace(/\{hora_apertura\}/g, horaAperturaHoy || "")
        .replace(/\{hora_cierre\}/g, horaCierreHoy || "")}`);
    if (faqLines.length) sysLines.push("PREGUNTAS FRECUENTES (responde con estas respuestas):", ...faqLines);
    const sitLines = Object.entries(situacionesObj)
      .filter(([, v]) => v)
      .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`);
    if (sitLines.length) sysLines.push("SITUACIONES ESPECIALES (cómo actuar):", ...sitLines);
    if (vocabCfg.usar && vocabCfg.usar.length) {
      sysLines.push(`EXPRESIONES: usa "${vocabCfg.usar.join('", "')}".${vocabCfg.evitar ? ` Evita: ${vocabCfg.evitar}.` : ""}`);
    }
    if (prohibArr.length) sysLines.push(`PROHIBIDO: ${prohibArr.join(" · ")}`);
  }

  if (menuText)       sysLines.push("", "MENÚ:", menuText);
  if (horariosText)   sysLines.push("", horariosText);
  if (pagosText)      sysLines.push("", pagosText);
  if (domiciliosText) sysLines.push("", domiciliosText);

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: sysLines.join("\n") },
    ...history.map(h => ({ role: h.direction === "in" ? "user" : "assistant", content: h.body })),
    { role: "user", content: clienteTexto },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1200);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: 400, temperature: 0.3 }),
      });
      if (!res.ok) { console.error("buildConversationResponse error:", res.status); continue; }
      const data = await res.json() as Record<string, unknown>;
      const reply = String(((data.choices as Array<Record<string,unknown>>)?.[0]?.message as Record<string,unknown>)?.content || "").trim();
      if (reply) return reply;
    } catch (err) { console.error("buildConversationResponse attempt error:", err); }
  }

  // Fallback si GPT falla
  if (nextStep?.texto) return nextStep.texto;
  if (nextStep?.pregunta) return nextStep.pregunta;
  return "Disculpa, tuvimos un problema técnico. ¿Me repites? 🙏";
}

// ── buildSummaryFromState ─────────────────────────────────────────────────────

async function buildSummaryFromState(
  state: PacoState,
  cfg: Record<string, unknown>,
  branchId: string,
  domiciliosCfg: Record<string, unknown> | null | undefined,
): Promise<string> {
  const frases       = (cfg.frases as Record<string, unknown>) || {};
  const confirmFrase = getFraseTexto(frases.resumen_confirmacion)      || "¿Lo confirmamos o hay algo que cambiar?";
  const totalDesc    = getFraseTexto(frases.resumen_total_desconocido) || "ya te confirmamos el total ☺️🍟";

  // Modo del resumen: "fija" (plantilla exacta con variables) o "conversacional" (GPT libre)
  const resumenCfg  = getFraseCfg(frases.resumen);
  const resumenModo = resumenCfg.modo || "fija";

  let precioProducto = 0;
  const productoLines: string[] = [];

  try {
    const products = await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=name,price,price_mode,presentations,variables`
    ) as Array<Record<string, unknown>> | null;

    const getPrecioItem = (prod: string|null, tam: string|null, tip: string|null, cant: number): number => {
      if (!products || !prod) return 0;
      const norm    = normalizarTexto(prod);
      const matched = products.find(p => {
        const pname = normalizarTexto(String(p.name || ""));
        if (pname === norm || pname.includes(norm) || norm.includes(pname)) return true;
        if (pname.length >= 4 && norm.length >= 4) {
          const maxDist = Math.floor(Math.min(pname.length, norm.length) / 4);
          if (levenshtein(pname, norm) <= maxDist) return true;
        }
        return false;
      });
      if (!matched) return 0;
      const pres      = (matched.presentations as Array<{name:string;price:number}>) || [];
      const vars      = (matched.variables as Array<{id:string;name:string;options:Array<{id:string;name:string;prices?:number[]}>}>) || [];
      const priceMode = String(matched.price_mode || "simple");
      let precio = 0;
      if (priceMode === "matrix" && vars.length > 0 && tip) {
        const varGroup = vars[0];
        const varOpt   = varGroup.options.find(o => o.name.toLowerCase() === (tip || "").toLowerCase());
        if (varOpt && Array.isArray(varOpt.prices)) {
          const presIdx = pres.findIndex(p => p.name.toLowerCase() === (tam || "").toLowerCase());
          precio = varOpt.prices[presIdx >= 0 ? presIdx : 0] || 0;
        }
      } else {
        const presMatch = pres.find(p => p.name.toLowerCase() === (tam || "").toLowerCase());
        precio = presMatch?.price || Number(matched.price) || 0;
      }
      return precio * cant;
    };

    const allItems: SlotItem[] = [
      ...(state.items || []),
      { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones },
    ];

    for (const item of allItems) {
      if (!item.producto) continue;
      // Usar nombre canónico del producto desde la DB para evitar que GPT devuelva
      // líneas completas del menú con precios como nombre del producto
      const normItem = normalizarTexto(item.producto);
      const matchedProd = products?.find(p => {
        const pn = normalizarTexto(String(p.name || ""));
        if (pn === normItem || pn.includes(normItem) || normItem.includes(pn)) return true;
        if (pn.length >= 4 && normItem.length >= 4) {
          return levenshtein(pn, normItem) <= Math.floor(Math.min(pn.length, normItem.length) / 4);
        }
        return false;
      });
      const nombreDisplay = matchedProd ? String(matchedProd.name) : item.producto;
      const display = [nombreDisplay, item.tipo].filter(Boolean).join(" ");
      const adStr   = item.adiciones && item.adiciones.length > 0 ? ` + ${item.adiciones}` : "";
      const tamStr  = item.tamano ? ` ${item.tamano}` : "";
      productoLines.push(`🍟 ${item.cantidad}x ${display}${tamStr}${adStr}`);
      precioProducto += getPrecioItem(item.producto, item.tamano, item.tipo, item.cantidad);
    }
  } catch (err) { console.error("buildSummaryFromState lookup error:", err); }

  const esParaLlevar = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
  const domiPrecio   = (!esParaLlevar && state.direccion) ? lookupDomiPrice(state.direccion, domiciliosCfg) : null;

  // Línea de domicilio
  let lineaDomi = "";
  if (esParaLlevar) {
    lineaDomi = "🏍️ Para llevar";
  } else if (domiPrecio !== null && domiPrecio > 0) {
    lineaDomi = `🏍️ Domicilio: ${fmtCOP(domiPrecio)}`;
  } else if (domiPrecio === 0) {
    lineaDomi = "🏍️ Domicilio: Gratis";
  } else {
    // Barrio no encontrado en las zonas configuradas — mostrar "a confirmar"
    lineaDomi = "🏍️ Domicilio: a confirmar";
  }

  // Línea de total
  let lineaTotal: string;
  if (precioProducto > 0) {
    if (esParaLlevar || domiPrecio === 0) {
      lineaTotal = `💰 Total: ${fmtCOP(precioProducto)}`;
    } else if (domiPrecio !== null && domiPrecio > 0) {
      lineaTotal = `💰 Total: ${fmtCOP(precioProducto + domiPrecio)}`;
    } else {
      lineaTotal = `💰 Subtotal: ${fmtCOP(precioProducto)} (+ domicilio a confirmar)`;
    }
  } else {
    lineaTotal = totalDesc;
  }

  const nombreLinea = state.nombre ? `👤 ${state.nombre}\n` : "";

  // Variables de precio individual — para plantillas con desglose (pedido / domi / total)
  const precioPedidoStr = precioProducto > 0 ? fmtCOP(precioProducto) : totalDesc;
  const precioDomiStr   = esParaLlevar
    ? "para llevar"
    : domiPrecio === null ? "a confirmar"
    : domiPrecio === 0   ? "Gratis"
    : fmtCOP(domiPrecio);
  const precioTotalNum  = precioProducto + (!esParaLlevar && domiPrecio !== null ? domiPrecio : 0);
  const precioTotalStr  = precioProducto > 0
    ? (domiPrecio !== null || esParaLlevar ? fmtCOP(precioTotalNum) : fmtCOP(precioProducto) + " (+ domi a confirmar)")
    : totalDesc;

  // Modo CONVERSACIONAL — GPT redacta el resumen libremente (debe incluir confirmación)
  if (resumenModo === "conversacional") {
    const guiaResumen = resumenCfg.guia
      || "Redacta un resumen amigable del pedido con todos los datos y pide confirmación al cliente.";
    const datosStr = [
      productoLines.join("\n"),
      state.direccion ? `Dirección: ${state.direccion}` : "",
      state.pago      ? `Pago: ${state.pago}` : "",
      state.nombre    ? `Nombre: ${state.nombre}` : "",
      lineaDomi, lineaTotal,
    ].filter(Boolean).join("\n");
    const sysMsg = `${guiaResumen}\n\nDatos del pedido:\n${datosStr}\n\nTermina SIEMPRE con la pregunta: "${confirmFrase}"`;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: sysMsg }], max_tokens: 300, temperature: 0.5 }),
      });
      if (res.ok) {
        const d = await res.json() as Record<string, unknown>;
        const txt = String(((d.choices as Array<Record<string,unknown>>)?.[0]?.message as Record<string,unknown>)?.content || "").trim();
        if (txt) return txt;
      }
    } catch (_) { /* fallback a fija si GPT falla */ }
  }

  // Modo FIJA (default) — plantilla exacta con variables reemplazadas
  // Canvas: frases.resumen.texto · Fallback: cfg.resumen_plantilla · Hardcoded: plantilla por defecto
  // Variables multi-ítem: {{productos}}
  // Variables por ítem (estilo canvas): línea que contiene {{producto}} se repite por cada ítem
  //   {{cantidad}}, {{producto}}, {{tamano}} (tipo+tamano), {{tipo}}, {{adiciones}}
  // Variables globales: {{direccion}}, {{pago}}, {{nombre}}, {{nombre_linea}},
  //   {{domicilio_linea}}, {{total_linea}} / {{linea_total}}, {{confirmacion}}
  const plantillaRaw = resumenCfg.texto
    || (cfg.resumen_plantilla as string)
    || "¡Listo! Tu pedido quedaría así:\n{{productos}}\n📍 {{direccion}}\n💳 {{pago}}\n{{nombre_linea}}💵 Pedido: {{precio_pedido}}\n🏍️ Domicilio: {{precio_domi}}\n💰 *Total: {{precio_total}}*\n\n{{confirmacion}}";

  // Si la plantilla usa variables de ítem individual, expandir la línea-plantilla por cada ítem
  const PER_ITEM_PAT = /\{\{(cantidad|producto|tamano|tipo|adiciones)\}\}/;
  let plantillaExpanded = plantillaRaw;
  if (PER_ITEM_PAT.test(plantillaRaw)) {
    const lineas = plantillaRaw.split("\n");
    const idxItem = lineas.findIndex(l => PER_ITEM_PAT.test(l));
    if (idxItem >= 0) {
      const lineaItem = lineas[idxItem];
      const allItemsForTemplate: SlotItem[] = [
        ...(state.items || []),
        { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones },
      ];
      const itemsRendered = allItemsForTemplate.filter(i => i.producto).map(item => {
        const tamStr = [item.tipo, item.tamano].filter(Boolean).join(" ");
        const addStr = item.adiciones && item.adiciones.length > 0 ? ` + ${item.adiciones}` : "";
        return lineaItem
          .replace(/\{\{cantidad\}\}/g, String(item.cantidad || 1))
          .replace(/\{\{producto\}\}/g, item.producto || "")
          .replace(/\{\{tamano\}\}/g,   tamStr)
          .replace(/\{\{tipo\}\}/g,     item.tipo || "")
          .replace(/\{\{adiciones\}\}/g, addStr);
      });
      lineas[idxItem] = itemsRendered.join("\n");
      plantillaExpanded = lineas.join("\n");
    }
  }

  // Pago mixto → el resumen muestra la división ("nequi $30.000 + efectivo $31.000")
  const _mixto = (state as unknown as Record<string, unknown>).pago_mixto as Record<string, unknown> | null | undefined;
  const pagoResumen = _mixto && Number(_mixto.monto_digital) > 0
    ? `${_mixto.metodo || state.pago} ${fmtCOP(Number(_mixto.monto_digital))} + efectivo ${fmtCOP(Number(_mixto.monto_efectivo) || 0)}`
    : (state.pago || "");
  let resumenFinal = plantillaExpanded
    .replace(/\{\{productos\}\}/g,       productoLines.join("\n"))
    .replace(/\{\{direccion\}\}/g,       state.direccion || "")
    .replace(/\{\{pago\}\}/g,            pagoResumen)
    .replace(/\{\{nombre\}\}/g,          state.nombre || "")
    .replace(/\{\{nombre_linea\}\}/g,    nombreLinea)
    .replace(/\{\{domicilio_linea\}\}/g, lineaDomi)
    .replace(/\{\{linea_domicilio\}\}/g, lineaDomi)
    .replace(/\{\{total_linea\}\}/g,     lineaTotal)
    .replace(/\{\{linea_total\}\}/g,     lineaTotal)
    .replace(/\{\{precio_pedido\}\}/g,   precioPedidoStr)
    .replace(/\{\{precio_domi\}\}/g,     precioDomiStr)
    .replace(/\{\{total_domi\}\}/g,      precioDomiStr)
    .replace(/\{\{precio_total\}\}/g,    precioTotalStr)
    .replace(/\{\{gran_total\}\}/g,      precioTotalStr)
    .replace(/\{\{confirmacion\}\}/g,    confirmFrase);

  // Safety net: si la plantilla no incluía {{confirmacion}}, se agrega siempre al final
  if (confirmFrase && !resumenFinal.includes(confirmFrase)) {
    resumenFinal += `\n\n${confirmFrase}`;
  }

  return resumenFinal;
}

// ── buildOrderArgs ────────────────────────────────────────────────────────────

// ── calcularPreciosPedido — desglose de precios del pedido en curso ──────────────
// Misma lógica de precios que el resumen/creación de pedidos (presentaciones + matriz
// de variantes + domicilio por zona). Usada por el caso "¿cuánto es?" del paso de pago.
async function calcularPreciosPedido(
  state: PacoState,
  branchId: string,
  domiciliosCfg: Record<string, unknown> | null | undefined,
): Promise<{ pedido: number; domi: number | null; esLlevar: boolean }> {
  let pedido = 0;
  try {
    const allProducts = await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=id,name,price,price_mode,presentations,variables`
    ) as Array<Record<string, unknown>> | null;
    const allItems: SlotItem[] = [
      ...(state.items || []),
      { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones },
    ];
    for (const item of allItems) {
      if (!item.producto || !allProducts) continue;
      const nombreLow = item.producto.toLowerCase();
      const matched = allProducts.find(p => {
        const pname = String(p.name || "").toLowerCase();
        return pname === nombreLow || pname.includes(nombreLow) || nombreLow.includes(pname.replace(/\s.*/,""));
      });
      if (!matched) continue;
      const presentations = (matched.presentations as Array<{id:string;name:string;price:number}>) || [];
      const variables     = (matched.variables as Array<{id:string;name:string;isPricing?:boolean;options:Array<{id:string;name:string;price:number;prices?:number[]}>}>) || [];
      const tamLow        = String(item.tamano || "").toLowerCase();
      const presMatch     = presentations.find(p => p.name.toLowerCase() === tamLow) || presentations[0];
      const presIdx       = presMatch ? presentations.indexOf(presMatch) : 0;
      let price           = Number(presMatch?.price) || Number(matched.price) || 0;
      if (String(matched.price_mode || "") === "matrix" && item.tipo && variables.length > 0) {
        const varOpt = variables[0].options.find(o => o.name.toLowerCase() === String(item.tipo).toLowerCase());
        if (varOpt) {
          if (Array.isArray(varOpt.prices) && presIdx < varOpt.prices.length) price = varOpt.prices[presIdx];
          else if (varOpt.price > 0) price = varOpt.price;
        }
      }
      pedido += price * Math.max(1, Number(item.cantidad) || 1);
    }
  } catch (err) { console.error("calcularPreciosPedido error:", err); }
  const esLlevar = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
  const domi = esLlevar ? 0 : (state.direccion ? lookupDomiPrice(state.direccion, domiciliosCfg) : null);
  return { pedido, domi, esLlevar };
}

function buildOrderArgs(state: PacoState, domiPrecio: number): Record<string, unknown> {
  const allItems: SlotItem[] = [
    ...(state.items || []),
    { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones },
  ];
  return {
    cliente:     state.nombre    || "Cliente WhatsApp",
    direccion:   state.direccion || "",
    pago:        state.pago      || "efectivo",
    mensaje:     "¡Pedido confirmado!",
    domi_precio: domiPrecio,
    productos:   allItems.filter(i => i.producto).map(i => ({
      nombre:   i.producto,
      tamano:   capFirst(i.tamano || ""),
      tipo:     capFirst(i.tipo   || ""),
      cantidad: i.cantidad,
    })),
  };
}

// ── Crear pedido WhatsApp en Cobra POS ───────────────────────────────────────

async function createWhatsappOrder(
  data: Record<string, unknown>,
  branchId: string,
  tenantId: string,
  fromPhone: string,
): Promise<string | null> {
  const cliente   = String(data.cliente   || "Cliente WhatsApp");
  const productos = (data.productos as Array<Record<string, unknown>>) || [];
  const direccion = String(data.direccion || "");
  const pago      = String(data.pago      || "");

  const allProducts = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=id,name,price,price_mode,presentations,variables`
  ) as Array<Record<string, unknown>> | null;

  if (!allProducts) { console.error("No se pudo cargar pos_products"); return null; }

  type PosOrderItem = {
    order_id?: string;
    product_id: string | null;
    name: string;           // la UI de ventas/domicilios pinta ESTE campo
    product_name: string;
    product_price: number;
    unit_price: number;
    total: number;
    quantity: number;
    selections: Record<string, unknown>;
    branch_id: string;
    tenant_id: string | null;
    notes: string | null;
  };

  const items: PosOrderItem[] = [];
  let orderTotal = 0;

  for (const prod of productos) {
    const nombreGPT = String(prod.nombre  || "").trim();
    const tamanoGPT = String(prod.tamano  || "").trim();
    const tipoGPT   = String(prod.tipo    || "").trim();
    const cantidad  = Math.max(1, Number(prod.cantidad) || 1);
    const nombreLow = nombreGPT.toLowerCase();

    const matched = allProducts.find(p => {
      const pname = String(p.name || "").toLowerCase();
      return pname === nombreLow || pname.includes(nombreLow) || nombreLow.includes(pname.replace(/\s.*/,""));
    });

    if (!matched) {
      const fallbackName = [nombreGPT, tamanoGPT, tipoGPT].filter(Boolean).join(" · ");
      items.push({ product_id: null, name: fallbackName || "Producto WhatsApp", product_name: fallbackName || "Producto WhatsApp", product_price: 0, unit_price: 0, total: 0, quantity: cantidad, selections: { mods: {}, pres: tamanoGPT, vars: {} }, branch_id: branchId, tenant_id: tenantId || null, notes: null });
      continue;
    }

    const presentations = (matched.presentations as Array<{ id: string; name: string; price: number }>) || [];
    const variables     = (matched.variables as Array<{ id: string; name: string; isPricing?: boolean; options: Array<{ id: string; name: string; price: number; prices?: number[] }> }>) || [];
    const priceMode     = String(matched.price_mode || "simple");
    const tamLow        = tamanoGPT.toLowerCase();
    let presMatch       = presentations.find(p => p.name.toLowerCase() === tamLow);
    if (!presMatch && presentations.length > 0) presMatch = presentations[0];
    const presName = presMatch?.name || tamanoGPT;
    const presIdx  = presMatch ? presentations.indexOf(presMatch) : 0;

    let price = Number(presMatch?.price) || Number(matched.price) || 0;
    const varsMap: Record<string, { id: string; name: string; price: number }> = {};

    if (priceMode === "matrix" && tipoGPT && variables.length > 0) {
      const varGroup = variables[0];
      const tipoLow  = tipoGPT.toLowerCase();
      const varOpt   = varGroup.options.find(o => o.name.toLowerCase() === tipoLow);
      if (varOpt) {
        if (Array.isArray(varOpt.prices) && presIdx >= 0 && presIdx < varOpt.prices.length) {
          price = varOpt.prices[presIdx];
        } else if (varOpt.price > 0) {
          price = varOpt.price;
        }
        varsMap[varGroup.id] = { id: varOpt.id, name: varOpt.name, price };
      }
    }

    const itemTotal   = price * cantidad;
    const displayName = [String(matched.name), presName, tipoGPT].filter(Boolean).join(" · ");
    items.push({ product_id: String(matched.id), name: displayName, product_name: displayName, product_price: price, unit_price: price, total: itemTotal, quantity: cantidad, selections: { mods: {}, pres: presName, vars: varsMap }, branch_id: branchId, tenant_id: tenantId || null, notes: null });
    orderTotal += itemTotal;
  }

  let clienteId: string | null = null;
  try {
    const telefonoClean = fromPhone.replace(/\D/g, "");
    const dirQuery = direccion
      ? `&direccion=eq.${encodeURIComponent(direccion)}`
      : `&direccion=is.null`;
    const existing = await sbGet(
      `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoClean)}&nombre=eq.${encodeURIComponent(cliente)}&tenant_id=eq.${tenantId}${dirQuery}&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (existing && existing.length > 0) {
      clienteId = String(existing[0].id);
    } else {
      const newCliente = await fetch(`${SUPABASE_URL}/rest/v1/pos_clientes`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ tenant_id: tenantId || null, branch_id: branchId, nombre: cliente, telefono: telefonoClean, direccion: direccion || null }),
      });
      if (newCliente.ok) {
        const newRow = await newCliente.json() as Array<Record<string, unknown>>;
        clienteId = String(newRow?.[0]?.id || "");
      }
    }
  } catch (err) { console.error("Error en lookup/creación de cliente:", err); }

  // PARA LLEVAR → sección "rápidas" (channel='rapido', igual que venta-rapida.html);
  // domicilio normal → channel='domicilio' (pantalla de domicilios).
  const esLlevarOrden = LLEVAR_REGEX.test(direccion.toLowerCase());
  const orderRecord: Record<string, unknown> = {
    branch_id: branchId, tenant_id: tenantId || null,
    channel: esLlevarOrden ? "rapido" : "domicilio", customer_name: cliente,
    notes: direccion || null, payment_method: pago || null,
    status: "open", total: orderTotal, subtotal: orderTotal, total_final: orderTotal,
    waiter_name: "Asistente IA", visible_cocina: true, opened_at: new Date().toISOString(),
  };
  if (clienteId) orderRecord.cliente_id = clienteId;

  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/pos_orders`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(orderRecord),
  });

  if (!createRes.ok) { console.error("Error creando pos_orders:", await createRes.text()); return null; }
  const created = await createRes.json() as Array<Record<string, unknown>>;
  const orderId = created?.[0]?.id as string | undefined;
  if (!orderId) { console.error("No se recibió id del pedido creado"); return null; }

  for (const item of items) {
    await sbPost(`/rest/v1/pos_order_items`, { ...item, order_id: orderId });
  }

  return orderId;
}

// ── Enviar mensaje WA + guardar en chat_messages ───────────────────────────────

async function sendWaAndSave(
  convId: string, tenantId: string, msg: string,
  fromPhone: string, phoneId: string, accessToken: string,
): Promise<void> {
  const waRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: msg } }),
  });
  if (waRes.ok) {
    const waSent = await waRes.json() as Record<string, unknown>;
    const sentId = ((waSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
    await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", body: msg, delivery_status: "sent", external_id: sentId || null, sent_at: new Date().toISOString() });
  } else {
    console.error("sendWaAndSave error:", await waRes.text());
  }
}

// ── Dirección: clasificación y lookup ────────────────────────────────────────

const LUGARES_RECHAZADOS = [
  "parque","andén","anden","semáforo","semaforo","esquina",
  "glorieta","rotonda","vía pública","via publica","zona verde",
  "cancha","estadio","kiosco","kiosko","andenes","la calle",
  "en el parque","en la esquina","en la glorieta",
];

const LUGARES_PUBLICOS = [
  "hospital","clínica","clinica","centro comercial","aeropuerto",
  "universidad","colegio","banco","supermercado","hotel",
  "oficina","empresa","negocio","consultorio","farmacia",
  "droguería","drogueria","éxito","exito","alkosto","jumbo",
  "d1 ","ara ","edificio","torre empresarial","local comercial",
  "bodega","fábrica","fabrica","instituto","corporación","corporacion",
];

function checkBarrioSinNomenclatura(
  direccion: string,
  domicilios: Record<string, unknown> | null | undefined,
): boolean {
  if (!domicilios) return false;
  const zonas = (domicilios.zonas as Array<{ barrios?: string[]; nombre?: string; sin_nomenclatura?: boolean }>) || [];
  const dir = direccion.toLowerCase();
  for (const z of zonas) {
    if (!z.sin_nomenclatura) continue;
    const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []);
    for (const b of barrios) { if (dir.includes(b.toLowerCase())) return true; }
  }
  return false;
}

function clasificarDireccion(
  direccion: string,
  domicilios: Record<string, unknown> | null | undefined,
  sinNomenclaturaCliente: boolean,
): { tipo: TipoDireccion; requierePagoAdelantado: boolean } {
  const dir = direccion.toLowerCase().trim();
  if (LLEVAR_REGEX.test(dir) || dir.includes("llevar") || dir.includes("recoger")) return { tipo: "para_llevar", requierePagoAdelantado: false };
  if (domicilios?.rechazar_lugares_publicos !== false) {
    if (LUGARES_RECHAZADOS.some(kw => dir.includes(kw))) return { tipo: "rechazado", requierePagoAdelantado: false };
  }
  if (LUGARES_PUBLICOS.some(kw => dir.includes(kw))) {
    const requiere = domicilios?.pago_adelantado_lugares_publicos !== false;
    return { tipo: "publico", requierePagoAdelantado: requiere };
  }
  if (!sinNomenclaturaCliente && !checkBarrioSinNomenclatura(dir, domicilios)) {
    const tieneVia    = /\b(calle|carrera|cra|cl|diagonal|transversal|tv|dg|avenida|av)\s*\d+/i.test(dir);
    // Predio completo: mínimo 3 números en la dirección (vía + cruce + complemento)
    // Acepta cualquier separador: "63-25", "63 n 58", "63 58", con o sin "#"
    const tienePredio = (dir.match(/\d+/g) || []).length >= 3;
    if (tieneVia && !tienePredio) return { tipo: "incompleta", requierePagoAdelantado: false };
  }
  return { tipo: "residencial", requierePagoAdelantado: false };
}

function lookupDomiPrice(direccion: string, domicilios: Record<string, unknown> | null | undefined): number | null {
  if (!domicilios) return null;
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; precio: number }>) || [];
  for (const z of zonas) {
    const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []);
    for (const b of barrios) { if (fuzzyBarrioMatch(direccion, b)) return z.precio; }
  }
  return null;
}

// ── buildMenuText ─────────────────────────────────────────────────────────────

async function buildMenuText(branchId: string): Promise<string> {
  const rows = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=name,price,description,price_mode,presentations,variables,category_id(name)&order=sort_order`
  ) as Array<Record<string, unknown>> | null;
  if (!rows || !rows.length) return "";
  const byCategory: Record<string, Array<Record<string, unknown>>> = {};
  for (const p of rows) {
    const cat = ((p.category_id as Record<string,string>)?.name) || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }
  const lines: string[] = ["CARTA DEL RESTAURANTE (productos disponibles):"];
  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`\n[${cat.toUpperCase()}]`);
    for (const item of items) {
      const pres = (item.presentations as Array<{name:string;price:number}>) || [];
      const vars = (item.variables as Array<{id:string;name:string;isPricing?:boolean;options:Array<{id:string;name:string;prices?:number[]}>}>) || [];
      const priceMode = String(item.price_mode || "simple");
      let priceStr: string;
      if (priceMode === "matrix" && vars.length > 0) {
        const varGroup = vars[0];
        const varLines: string[] = [];
        for (const opt of varGroup.options) {
          if (Array.isArray(opt.prices) && pres.length > 0) {
            const optPrices = pres.map((p2, i) => `${p2.name} ${fmtPrice(opt.prices![i] ?? 0)}`).join(" / ");
            varLines.push(`  ${opt.name}: ${optPrices}`);
          }
        }
        priceStr = "\n" + varLines.join("\n");
      } else {
        const validPres = pres.filter(p => p.price > 0);
        if (validPres.length > 1) priceStr = validPres.map(p => `${p.name} ${fmtPrice(p.price)}`).join(" / ");
        else if (validPres.length === 1) priceStr = fmtPrice(validPres[0].price);
        else priceStr = fmtPrice(Number(item.price) || 0);
      }
      let line = `- ${item.name}: ${priceStr}`;
      if (item.description) line += ` — ${item.description}`;
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function buildHorariosText(horarios: Record<string, unknown> | null | undefined, fmtHora = "12h"): string {
  if (!horarios) return "";
  const DAYS: Array<[string, string]> = [
    ["lunes","Lunes"],["martes","Martes"],["miercoles","Miércoles"],
    ["jueves","Jueves"],["viernes","Viernes"],["sabado","Sábado"],["domingo","Domingo"],
  ];
  const nowCol    = new Date(Date.now() + TZ_OFFSET_H * 60 * 60 * 1000);
  const todayIdx  = nowCol.getUTCDay();
  const colDayKey = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][todayIdx];
  const nowMin    = nowCol.getUTCHours() * 60 + nowCol.getUTCMinutes();
  const lines: string[] = ["HORARIOS DE ATENCIÓN:"];
  let abierto = false;
  for (const [key, label] of DAYS) {
    const d = horarios[key] as Record<string,unknown> | undefined;
    if (!d || !d.activo) { lines.push(`- ${label}: Cerrado`); }
    else {
      const abre   = (d.abre   as string) || "00:00";
      const cierra = (d.cierra as string) || "23:59";
      lines.push(`- ${label}: ${formatHora(abre, fmtHora)} – ${formatHora(cierra, fmtHora)}`);
      if (key === colDayKey && nowMin >= parseHHMM(abre) && nowMin < parseHHMM(cierra)) abierto = true;
    }
  }
  lines.push("");
  if (abierto) {
    lines.push("ESTADO ACTUAL: Abierto.");
  } else {
    const d = horarios[colDayKey] as Record<string,unknown> | undefined;
    if (!d || !d.activo) lines.push(`ESTADO ACTUAL: Cerrado hoy.`);
    else if (nowMin < parseHHMM(d.abre as string)) lines.push(`ESTADO ACTUAL: Aún no ha abierto. Abre a las ${formatHora(d.abre as string, fmtHora)}.`);
    else lines.push(`ESTADO ACTUAL: Ya cerró por hoy. Cerró a las ${formatHora(d.cierra as string, fmtHora)}.`);
  }
  return lines.join("\n");
}

function buildPagosText(pagos: Record<string, unknown> | null | undefined): string {
  if (!pagos) return "";
  const lista = getMetodosPago(pagos);
  if (!lista.length) return "";
  const metodos = lista.map(m => m.nombre);
  const hayDigital = lista.some(m => m.digital);
  const lines: string[] = ["MÉTODOS DE PAGO:", `- Aceptamos: ${metodos.join(", ")}`];
  if (hayDigital && pagos.llave) {
    lines.push(`- Llave/número de pago digital: ${pagos.llave}`);
    if (pagos.titular) lines.push(`- Titular: ${pagos.titular}`);
  }
  if (pagos.esperar_comprobante && hayDigital) lines.push("- Para pagos digitales, pedimos el comprobante de transferencia.");
  if (pagos.nota) lines.push(`- ${pagos.nota}`);
  return lines.join("\n");
}

function buildDomiciliosText(domicilios: Record<string, unknown> | null | undefined): string {
  if (!domicilios) return "";
  const lines: string[] = [];
  const activo = domicilios.activo !== false;
  if (!activo) {
    lines.push("DOMICILIOS: Por el momento no manejamos servicio a domicilio.");
    if (domicilios.para_llevar !== false) lines.push("Sin embargo, puedes pasar a recoger tu pedido (para llevar).");
    return lines.join("\n");
  }
  lines.push("DOMICILIOS Y COBERTURA:");
  if (domicilios.tiempo_estimado) lines.push(`- Tiempo estimado de entrega: ${domicilios.tiempo_estimado}`);
  if (domicilios.para_llevar !== false) lines.push("- También manejamos pedidos para recoger (para llevar).");
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; precio: number }>) || [];
  if (zonas.length) {
    lines.push("- Precios de domicilio por barrio:");
    for (const z of zonas) {
      const precio = z.precio ? fmtCOP(z.precio) : "Gratis";
      const lista  = z.barrios ? z.barrios.join(", ") : (z.nombre || "");
      lines.push(`  • ${precio}: ${lista}`);
    }
  }
  return lines.join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizarTexto(s: string): string {
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prev[j], prev[j - 1], prevDiag);
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

function fuzzyBarrioMatch(direccion: string, barrio: string): boolean {
  const dirNorm = normalizarTexto(direccion);
  const barNorm = normalizarTexto(barrio);
  if (dirNorm.includes(barNorm)) return true;
  const dirSinEsp = dirNorm.replace(/\s/g, "");
  const barSinEsp = barNorm.replace(/\s/g, "");
  if (dirSinEsp.includes(barSinEsp)) return true;
  const dirWords = dirNorm.split(" ");
  const barWords = barNorm.split(" ");
  const todasCoinciden = barWords.every(bw => {
    if (bw.length <= 2) return dirWords.includes(bw);
    const maxDist = Math.floor(bw.length / 5) + 1;
    return dirWords.some(dw => levenshtein(dw, bw) <= maxDist);
  });
  if (todasCoinciden) return true;
  if (barSinEsp.length >= 8) {
    const L = barSinEsp.length;
    const maxDist = Math.floor(L / 8);
    for (let i = 0; i <= dirSinEsp.length - L; i++) {
      if (levenshtein(dirSinEsp.slice(i, i + L), barSinEsp) <= maxDist) return true;
    }
  }
  return false;
}

function parseHHMM(s: string): number {
  const parts = (s || "00:00").split(":");
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function formatHora(hhmm: string, formato: string): string {
  if (!hhmm) return hhmm;
  const parts = hhmm.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  if (formato === "24h") return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  const ampm = h >= 12 ? "pm" : "am";
  const h12  = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,"0")}${ampm}`;
}

function getProximoDiaActivo(
  horariosCfg: Record<string, Record<string,unknown>> | null | undefined,
  todayUTCDay: number,
): string {
  const keys    = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const display = ["el domingo","el lunes","el martes","el miércoles","el jueves","el viernes","el sábado"];
  if (!horariosCfg) return "pronto";
  for (let i = 1; i <= 7; i++) {
    const idx = (todayUTCDay + i) % 7;
    const d   = horariosCfg[keys[idx]] as Record<string,unknown> | undefined;
    if (d && d.activo) return display[idx];
  }
  return "pronto";
}

function fmtPrice(n: number): string {
  return fmtMoney(n);
}

function fmtCOP(n: number): string {
  return fmtMoney(n);
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function setTyping(convId: string, typing: boolean): Promise<void> {
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: typing });
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function sbPost(path: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify(data),
  });
}

async function sbPatch(path: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify(data),
  });
}
