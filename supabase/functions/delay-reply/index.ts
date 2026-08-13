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
  // Cómo lo quiere preparado ESE producto. Va aquí y no en el pedido porque un
  // cliente pide "dos salchipapas, una sin salsa y otra normal": si la
  // preferencia fuera del pedido, las dos saldrían iguales.
  preferencias?: string | null;
  categoria?: string | null;  // categoría del producto (desambiguación de nombres repetidos)
}

interface PacoState {
  producto:           string | null;
  producto_categoria: string | null;  // categoría del producto activo (nombres repetidos entre categorías)
  tamano:             string | null;
  /* Texto junto de todas las variantes ("Carne, Tocineta"). Es lo que ven el
     resumen y el pedido. */
  tipo:               string | null;
  /* Una por GRUPO. Un producto puede tener varios (dos ingredientes, salsa +
     punto de cocción…) y antes se daban todos por respondidos en cuanto
     llegaba el primero. */
  tipos?:             Record<string, string>;
  cantidad:           number;
  adiciones:          string | null;  // null=no preguntado, ""=rechazado, "texto"=pidió
  /* Lo que TU le ofreces, no lo que el pide. Va aparte de `adiciones` porque
     son dos preguntas distintas y compartir casilla hacia que solo se hiciera
     una de las dos. null=no ofrecido, ""=dijo que no, "texto"=acepto. */
  upsell:             string | null;
  // Cómo lo quiere preparado: "sin ajo", "solo bbq", "poca salsa"... Es lo que
  // más reclama un cliente si se pierde, y no tenía dónde vivir.
  preferencias:       string | null;
  direccion:          string | null;
  /* El barrio, aparte de la direccion: es lo que decide el precio del
     domicilio. Se comprueba contra las zonas configuradas, no se adivina. */
  barrio:             string | null;
  pago:               string | null;
  nombre:             string | null;
  /* Datos de facturacion. null = no se ha preguntado; {} = dijo que no quiere. */
  factura:            Record<string, string> | null;
  /* Para cuando lo quiere. "" = lo antes posible. null = sin preguntar.
     NO es un paso propio: es un dato que capturan los pasos que lo necesitan
     (pedido programado, reserva, para llevar). */
  programado:         string | null;
  /* Datos de la reserva. null = no se ha preguntado. Una reserva NO es un
     pedido: se guarda en pos_reservations, no en pos_orders. */
  reserva:            Record<string, string> | null;
  /* true = esta conversacion va por reserva, no por pedido. */
  es_reserva?:        boolean;
  /* Id de la reserva ya creada. Es el seguro contra crearla dos veces si el
     cliente vuelve a escribir. */
  reserva_id?:        string | null;
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
  /* Si el pedido NO se puede cerrar sin esto. Una caja no obligatoria que el
     cliente no responde se salta y el pedido sigue. */
  obligatoria?: boolean;
  /* Que debe tener en cuenta el paso de preferencias (canvas). */
  pref_opciones?: Record<string, unknown> | null;
  /* Cuándo aplica la caja: "domicilio", "recoger", "nuevo". Sin valor, siempre.
     Es lo que evita preguntarle la dirección a quien va a recoger. */
  cuando?: string;
  /* Qué hacer si el cliente no la responde: "insistir" (por defecto),
     "seguir" o "humano". */
  si_falla?: string;
  /* La caja se pregunta DESPUÉS de mostrar el resumen. Nace del pago: "si el
     cliente no sabe cuánto es, no sabe con qué pagar" (Sergio). Cada
     restaurante lo decide: es una casilla de la caja en el canvas. */
  despues_resumen?: boolean;
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
    producto: null, producto_categoria: null, tamano: null, tipo: null, cantidad: 1,
    adiciones: null, upsell: null, preferencias: null, direccion: null, barrio: null, pago: null, nombre: null, tipos: {},
    factura: null, programado: null, reserva: null,
    items: [], resumen_enviado: false, direccion_heredada: false, complemento_dir_pendiente: null,
    last_activity: new Date(Date.now() - 30 * 60_000).toISOString(), // 30min atrás → sesionExpirada=true
    _v: 120,
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
let DYN_PRODUCT_FULL: string[] = [];       // nombres COMPLETOS de productos (validación de extractProducto)
let DYN_CATEGORY_NAMES: string[] = [];     // nombres de categorías (una categoría NO es un producto)
// Mapa producto→categoría(s): motor de DESAMBIGUACIÓN cuando el mismo nombre
// existe en varias categorías (Especial de hamburguesa/perro/sandwich...)
let DYN_PROD_MAP: Array<{ key: string; name: string; cat: string }> = [];

// Sinónimos coloquiales de tipos de comida (mecánica general)
const CAT_SINONIMOS: Record<string, string[]> = {
  hamburguesa: ["hamburguesa", "amburguesa", "hamburgesa", "burguer", "burger", "burgers"],
  perro:       ["perro", "perrito", "hot dog", "hotdog", "perro caliente"],
  sandwich:    ["sandwich", "sanduche", "sanguche", "sandwiche", "sandwich"],
  salchipapa:  ["salchipapa", "salchi", "salchipapas"],
  bebida:      ["bebida", "gaseosa", "jugo", "refresco"],
  pizza:       ["pizza", "pisa"],
  taco:        ["taco", "tacos"],
};
function palabrasCategoria(cat: string): string[] {
  const words = normalizarTexto(cat).split(/\s+/).map(w => w.replace(/s$/, "")).filter(w => w.length >= 4);
  const out = new Set<string>(words);
  for (const w of words) {
    for (const [base, sins] of Object.entries(CAT_SINONIMOS)) {
      if (w.startsWith(base) || base.startsWith(w)) sins.forEach(s => out.add(normalizarTexto(s)));
    }
  }
  return [...out];
}
// ¿El texto menciona alguna de estas categorías (o un sinónimo)?
function categoriaMencionada(texto: string, cats: string[]): string | null {
  const t = " " + normalizarTexto(texto) + " ";
  for (const cat of cats) {
    for (const w of palabrasCategoria(cat)) {
      if (t.includes(" " + w)) return cat;
    }
  }
  return null;
}
// Matching DETERMINÍSTICO de productos en el texto del cliente (no depende de GPT)
function matchProductosEnTexto(texto: string): Array<{ name: string; cat: string; pos: number }> {
  const t = " " + normalizarTexto(texto) + " ";
  const found: Array<{ name: string; cat: string; pos: number }> = [];
  for (const e of DYN_PROD_MAP) {
    const idx = t.indexOf(" " + e.key + " ");
    if (idx >= 0) found.push({ name: e.name, cat: e.cat, pos: idx });
  }
  // preferir coincidencias más largas cuando se traslapan ("doble carne" gana a "carne")
  found.sort((a, b) => a.pos - b.pos || b.name.length - a.name.length);
  const out: Array<{ name: string; cat: string; pos: number }> = [];
  for (const f of found) {
    const cubierto = out.some(o => normalizarTexto(o.name).includes(normalizarTexto(f.name)) && Math.abs(o.pos - f.pos) <= o.name.length);
    if (!cubierto) out.push(f);
  }
  return out;
}
// Nombre para MOSTRAR con el tipo de comida adelante ("Salchipapa Premium",
// "Hamburguesa Especial") — así el resumen y la comanda nunca son ambiguos.
// Se omite para bebidas/adiciones y cuando el nombre ya lo incluye.
const CAT_SIN_PREFIJO = /bebida|adicion|adición|extra|salsa|postre|combo/i;
function nombreConCategoria(prodName: string, catName: string | null | undefined): string {
  if (!prodName || !catName || CAT_SIN_PREFIJO.test(catName)) return prodName;
  const primera = normalizarTexto(catName).split(/\s+/)[0].replace(/s$/, "");
  if (!primera || primera.length < 4) return prodName;
  if (normalizarTexto(prodName).includes(primera)) return prodName;
  return capFirst(primera) + " " + capFirst(prodName.toLowerCase());
}

// Elegir la fila correcta del catálogo por nombre + (opcional) categoría.
// Con nombres repetidos entre categorías, la categoría define el precio correcto.
function matchCatalogo(
  rows: Array<Record<string, unknown>> | null | undefined,
  nombre: string | null | undefined,
  categoria?: string | null,
): Record<string, unknown> | undefined {
  if (!rows || !nombre) return undefined;
  const norm = normalizarTexto(nombre);
  const candidatas = rows.filter(p => {
    const pname = normalizarTexto(String(p.name || ""));
    if (pname === norm || pname.includes(norm) || norm.includes(pname)) return true;
    if (pname.length >= 4 && norm.length >= 4) {
      const maxDist = Math.floor(Math.min(pname.length, norm.length) / 4);
      if (levenshtein(pname, norm) <= maxDist) return true;
    }
    return false;
  });
  if (!candidatas.length) return undefined;
  if (categoria && candidatas.length > 1) {
    const catNorm = normalizarTexto(categoria);
    const porCat = candidatas.find(p => {
      const cn = normalizarTexto(String(((p.category_id as Record<string, unknown> | null)?.name as string) || (p.cat as string) || ""));
      return cn === catNorm;
    });
    if (porCat) return porCat;
  }
  const exacta = candidatas.find(p => normalizarTexto(String(p.name || "")) === norm);
  return exacta || candidatas[0];
}
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
  let n = parseFloat(m[1].replace(/[̀-ͯ]/g, ""));
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
// Cubre masculino/femenino/plural: "lo recojo", "la recojo", "los recojo", "paso por
// ella", "voy por él", "paso a buscarla", "la busco", "recojo en el local"...
/* RECOGER EN EL LOCAL. Solo contemplaba la primera persona del singular
   ("paso", "voy", "recojo") y un cliente real escribio "Nosotros pasamos
   por ella": el bot no lo entendio y le pidio la direccion CUATRO veces
   seguidas hasta que el pedido se cayo. La gente habla en plural cuando
   viene acompanada, que es justo cuando recoge en el local. */
const LLEVAR_REGEX = /\b(para\s+llevar|para\s+recoger|l[oa]s?\s+recoj(?:o|emos)|l[oa]s?\s+busc(?:o|amos)|(?:voy|vamos)\s+a\s+recoger(?:l[oa]s?)?|(?:voy|vamos)\s+por\s+(?:el\s+pedido|[ée]l|ella|ellas|ellos|eso|la\s+comida)|pa\s+llevar|a\s+recoger|(?:yo|nosotros)\s+pas(?:o|amos)|pas(?:o|amos)\s+a\s+(?:recoger|buscar)(?:l[oa]s?)?|pas(?:o|amos)\s+por\s+(?:el\s+pedido|[ée]l|ella|ellas|ellos|eso|la\s+comida|all[aá]|all[ií])|pas(?:o|amos)\s+al\s+local|recog(?:o|emos)\s+en\s+el\s+local|lo\s+recogemos|nos\s+lo\s+llevamos)\b/i;

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

  // ── LISTA NEGRA: si el remitente está bloqueado, Paco NO responde (silencio total) ──
  try {
    const telBL = String(fromPhone || "").replace(/\D/g, "");
    if (telBL) {
      const blRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lista_negra_match`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_tenant: tenantId, p_tel: telBL, p_dir_norm: null }),
      });
      if (blRes.ok) {
        const blData = await blRes.json();
        if (Array.isArray(blData) && blData.length > 0) {
          console.log(`LISTA NEGRA: ${telBL} (${blData[0]?.nombre || ""}) — Paco no responde`);
          return;
        }
      }
    }
  } catch (e) { console.error("blacklist check:", e); }


  const SEL_BATCH = `select=id,body,external_id,media_url,media_type`;
  const msgsRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
    `&sent_at=gte.${encodeURIComponent(batchStart)}&order=sent_at.asc&${SEL_BATCH}`
  );
  type BatchMsg = { id: string; body: string; external_id: string; media_url?: string | null; media_type?: string | null };
  let batchMsgs = (msgsRes || []) as Array<BatchMsg>;

  if (!batchMsgs.length) {
    const batchStartEarly = new Date(new Date(batchStart).getTime() - 5000).toISOString();
    const retryRes = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
      `&sent_at=gte.${encodeURIComponent(batchStartEarly)}&order=sent_at.asc&${SEL_BATCH}`
    );
    batchMsgs = (retryRes || []) as Array<BatchMsg>;
    if (!batchMsgs.length) { await setTyping(convId, false); return; }
  }

  // 4b. AUDIOS → texto (Whisper): Paco "escucha" las notas de voz. Se transcribe
  // el audio y entra al flujo como texto normal. La transcripción se guarda en el
  // chat (🎙️) para que el operador vea qué entendió el bot; el audio sigue ahí.
  // Si la transcripción falla, el mensaje queda como [audio] → respuesta solo-texto.
  for (const m of batchMsgs) {
    const b = (m.body || "").trim();
    if (!(m.media_type === "audio" || b.startsWith("[audio]"))) continue;
    if (!m.media_url) continue;
    try {
      const audioRes = await fetch(m.media_url);
      if (!audioRes.ok) { console.error("audio fetch:", audioRes.status); continue; }
      const buf = await audioRes.arrayBuffer();
      if (buf.byteLength < 100 || buf.byteLength > 20 * 1024 * 1024) continue;
      const ext = (m.media_url.split("?")[0].split(".").pop() || "ogg").toLowerCase();
      const fd = new FormData();
      fd.append("file", new Blob([buf]), `audio.${ext}`);
      fd.append("model", "whisper-1");
      fd.append("language", "es");
      const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
        body: fd,
      });
      if (!tr.ok) { console.error("whisper error:", await tr.text()); continue; }
      const trJson = await tr.json() as { text?: string };
      const texto = String(trJson.text || "").trim();
      if (!texto) continue;
      m.body = texto;
      await sbPatch(`/rest/v1/chat_messages?id=eq.${m.id}`, { body: `🎙️ ${texto}` });
      console.log("audio transcrito:", texto.slice(0, 80));
    } catch (err) { console.error("transcripción de audio falló:", err); }
  }

  const soloMediaNoTexto = batchMsgs.every(m => {
    const b = (m.body || "").trim();
    return b.startsWith("[audio]") || b.startsWith("[imagen]") || b.startsWith("[image]") ||
           b.startsWith("[sticker]") || b.startsWith("[video]") || b === "";
  });

  // 5. Cargar config IA
  const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&limit=1`);
  const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
  // Modo del asistente: "off" (nunca contesta), "on" (contesta siempre),
  // "auto" (contesta SOLO fuera del horario de atención). Retrocompatible con
  // el booleano `activo`: si no hay modo, se deriva de activo.
  const modoAsistente = cfg ? (((cfg.modo_asistente as string) || (cfg.activo ? "on" : "off"))) : "off";
  if (!cfg || modoAsistente === "off") { await setTyping(convId, false); return; }

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

  // ── Modo AUTOMÁTICO: el bot SOLO contesta fuera del horario de atención ──────
  // Dentro del horario (isOpen) se queda callado para que conteste el humano.
  // Fuera del horario responde con normalidad (info/carta/ubicación) pero SIN
  // tomar pedidos (lo garantiza puedeTomarPedidos + la regla estricta del prompt).
  if (modoAsistente === "auto" && isOpen) { await setTyping(convId, false); return; }

  /* ══════════════════════════════════════════════════════════════════
     QUE QUIERE EL CLIENTE (intencion, no texto exacto)
     Regla de Sergio: "absolutamente todos los mensajes el bot debe detectar
     intenciones, no texto exacto. Las personas escriben con errores, con
     espacios o cosas diferentes; siempre se debe identificar la intencion".
     Tenia razon: la carta no se envio porque el cliente escribio
     "Para ver la  carta" con DOS espacios y ninguna frase de la lista
     coincidio. Comparar texto nunca va a cubrir como escribe la gente.

     Ahora lo decide el modelo, que entiende "mandame el menucito", "q tienen
     pa comer", "dnd kedan" o cualquier forma con errores. Las listas de
     palabras se conservan como RESPALDO: si el modelo falla o se demora, el
     bot se comporta como antes y nunca peor.
     ══════════════════════════════════════════════════════════════════ */
  const textoDelCliente = batchMsgs.map(m => m.body).join(" ").slice(0, 900);
  let intenciones: Record<string, boolean> = {};
  try {
    const rInt = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 120,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
`Eres el clasificador de intenciones de un restaurante colombiano por WhatsApp.
Lee lo que escribio el CLIENTE y responde SOLO este JSON:
{"carta":bool,"precio":bool,"ubicacion":bool,"domicilio":bool,"horario":bool,"pedir":bool,
 "pago":"efectivo"|"transferencia"|null,"entrega":"domicilio"|"recoger"|null,
 "rechaza_direccion":bool}

- "carta": quiere ver la carta o el menu COMPLETO, o los precios EN GENERAL.
  Ejemplos que SI son carta: "la carta", "q tienen", "menucito", "que venden",
  "tienen algo pa comer", "precios", "cuanto valen las cosas".
  OJO: si pregunta el precio de algo CONCRETO -> carta:false y precio:true.
- "precio": true si pregunta cuanto vale UN producto o cual es el mas barato o
  el mas caro. Ejemplos: "la salchipapa mas economica de k precio es",
  "cuanto vale la premium", "que precio tiene la mixta familiar", "cual es la
  mas barata", "de a como la sencilla". Se responde con el PRECIO, no con la
  carta: mandarle el menu entero a quien pregunto por un plato es no
  responderle.
- "ubicacion": pregunta DONDE QUEDA EL RESTAURANTE o pide el mapa.
  OJO: si el cliente esta DANDO su propia direccion para que le lleven el
  pedido, eso NO es "ubicacion" -> false.
- "domicilio": pregunta si hacen domicilios o cuanto cuesta el envio.
- "horario": pregunta a que hora abren o cierran, o si estan abiertos.
- "pedir": quiere ordenar algo concreto ya.
- "pago": como va a pagar. "efectivo" si dice efectivo, plata, en la mano, contra
  entrega. "transferencia" si dice nequi, daviplata, transferencia, bancolombia,
  QR, "te consigno", "te mando el comprobante". Escrito como sea: "nequii",
  "davi plata", "transfe", "x nequi". Si no dice nada de pago -> null.
- "entrega": "domicilio" si quiere que se lo lleven, "recoger" si el pasa por el
  pedido ("yo paso", "lo recojo", "pa llevar", "voy por el"). Si no dice -> null.
- "rechaza_direccion": true SOLO si esta diciendo que NO quiere la direccion que
  se le propuso y quiere otra ("no", "no, otra", "cambiala", "es en otro lado").
Puede haber varias en true. Si no estas seguro, pon false.
La gente escribe con errores, sin tildes y con espacios de mas: interpreta la
INTENCION, no las palabras exactas.` },
          { role: "user", content: textoDelCliente },
        ],
      }),
    });
    if (rInt.ok) {
      const dInt = await rInt.json();
      intenciones = JSON.parse(dInt.choices?.[0]?.message?.content || "{}");
    } else {
      console.error("[intencion] OpenAI respondio", rInt.status);
    }
  } catch (e) {
    console.error("[intencion] fallo, se usan las palabras clave:", String(e).slice(0, 200));
  }

  /* Traduce la intencion de pago al metodo configurado. Respaldo de
     extractPago, que solo reconoce el texto tal cual. */
  const pagoPorIntencion = (): string | null => {
    if (!intenciones.pago) return null;
    const ms = getMetodosPago(pagosCfg);
    if (intenciones.pago === "transferencia") {
      const d = ms.find(m => m.digital); return d ? d.nombre.toLowerCase() : "transferencia";
    }
    const e = ms.find(m => !m.digital); return e ? e.nombre.toLowerCase() : "efectivo";
  };

  // 6. Detectar solicitud de carta / PRECIOS → enviar imágenes de la carta (traen los precios)
  let extraRespondido = false;
  const menuImagenes = (cfg.menu_imagenes as string[]) || [];
  if (menuImagenes.length > 0) {
    /* Se normaliza ANTES de comparar: minusculas, sin tildes y con los espacios
       colapsados. Un cliente escribio "Para ver la  carta" con DOS espacios y
       por eso "la carta" no coincidio: el bot nunca supo que le pedian la carta
       y contesto GPT inventando que ya la habia mandado. */
    const limpiar = (s: string) => (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const combinedLower = batchMsgs.map(m => limpiar(m.body)).join(" ");
    const menuKw = ["la carta","el menú","el menu","dame la carta","ver la carta","su carta","ver el menú","ver el menu","muestrame la carta","que tienen de menu","que tienen","que hay","qué hay","que tienes","qué tienes","que tiene","qué tiene","que tienen","qué tienen","tienen de","precio","precios","los precios","lista de precios","que precios","qué precios","cuanto cuesta","cuánto cuesta","cuanto vale","cuánto vale","cuanto valen","cuánto valen","cuanto sale","cuánto sale"];
    const isExact  = ["carta","menu","el menu","precios","precio"].includes(combinedLower);
    /* La lista de frases nunca va a cubrir todas las formas de pedir la carta
       ("me mandas carta?", "tienes carta", "la carta porfa"). Basta con que
       aparezca la PALABRA suelta: en un restaurante "carta", "menu" y "precio"
       no significan otra cosa. Se exige que no venga pegada a otras letras,
       para no confundirla con "cartagena". */
    const palabraSuelta = /(^|[^a-z])(cartas|carta|menus|menu|precios|precio)([^a-z]|$)/.test(combinedLower);
    /* Preguntar POR UN PRECIO CONCRETO no es pedir la carta, aunque la palabra
       "precio" aparezca: un cliente escribio "la salchipapa mas economica de k
       precio es" y se llevo el menu entero en vez de la respuesta. */
    /* Tampoco es pedir la carta preguntar cuanto cuesta el ENVIO: un cliente
       pregunto "cuanto cuesta el envio a Villa del Viento" y se llevo el menu
       entero en vez del precio del domicilio. */
    const wantsMenu = intenciones.precio !== true && intenciones.domicilio !== true
      && (intenciones.carta === true || isExact || palabraSuelta || menuKw.some(kw => {
      const k = kw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
      return combinedLower.includes(k);
    }));
    if (wantsMenu) {
      /* LA CARTA SE SUBE A META UNA VEZ Y SE REUTILIZA EL ID.

         Antes se mandaba `image: { link: url }` con la direccion de GitHub.
         Meta contesta 200 al instante y descarga la imagen DESPUES, por su
         cuenta. Esas dos fotos pesan 1,5 MB y 1,1 MB, y GitHub tarda entre 2 y
         4 segundos en entregarlas: cuando se demora mas de la cuenta o GitHub
         limita el trafico, Meta desiste y el cliente no recibe nada — pero aqui
         ya habiamos contado el envio como bueno y le mandabamos igual la frase
         "¿Que se te antoja?". Eso es exactamente lo que veia Sergio: la frase
         sola, sin las fotos, y sin ninguna señal de que algo hubiera fallado.

         Con el id ya subido no hay descarga en el momento del envio: la imagen
         vive en los servidores de Meta. Se renueva a los 25 dias porque Meta
         las guarda 30. */
      const cacheMedia = (cfg.menu_media as Record<string, { id?: string; at?: string }>) || {};
      let cacheCambio = false;

      const idDeMeta = async (url: string): Promise<string> => {
        const g = cacheMedia[url] || {};
        const dias = g.at ? (Date.now() - Date.parse(g.at)) / 86400000 : 999;
        if (g.id && dias < 25) return g.id;
        try {
          const bin = await fetch(url);
          if (!bin.ok) { console.error("[carta] no se pudo bajar la imagen", url, bin.status); return ""; }
          const blob = await bin.blob();
          const fd = new FormData();
          fd.append("messaging_product", "whatsapp");
          fd.append("type", blob.type || "image/png");
          fd.append("file", blob, (url.split("?")[0].split("/").pop() || "carta.png"));
          const up = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/media`, {
            method: "POST", headers: { "Authorization": `Bearer ${accessToken}` }, body: fd,
          });
          const uj = await up.json().catch(() => ({})) as Record<string, unknown>;
          const id = String(uj.id || "");
          if (id) { cacheMedia[url] = { id, at: new Date().toISOString() }; cacheCambio = true; }
          else console.error("[carta] Meta no acepto la subida", url, JSON.stringify(uj).slice(0, 300));
          return id;
        } catch (e) {
          console.error("[carta] fallo subiendo la carta", url, String(e).slice(0, 200));
          return "";
        }
      };

      let imgsOk = 0;
      for (const imgUrl of menuImagenes) {
        try {
          const mediaId = await idDeMeta(imgUrl);
          // Si la subida fallo se intenta por link, como antes: peor, pero es
          // mejor que no mandar nada.
          const foto = mediaId ? { id: mediaId } : { link: imgUrl };
          const rImg = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: foto }),
          });
          const rj = await rImg.json().catch(() => ({})) as Record<string, unknown>;
          if (rImg.ok) {
            imgsOk++;
            /* Queda anotada en el hilo. Antes NO se anotaba ninguna: en el panel
               Paco parecia haber mandado solo la frase, y no habia forma de
               saber si el cliente habia recibido la carta. Con el id del mensaje
               guardado, si Meta avisa despues que fallo, el estado se actualiza
               solo y se ve. */
            const imgId = ((rj.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || "";
            await sbPost(`/rest/v1/chat_messages`, {
              conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot",
              body: "Carta", media_url: imgUrl, media_type: "image",
              delivery_status: "sent", external_id: imgId || null, sent_at: new Date().toISOString(),
            });
          } else {
            console.error("[carta] Meta rechazo la imagen", imgUrl, JSON.stringify(rj).slice(0, 300));
          }
        } catch (e) {
          console.error("[carta] no se pudo enviar la imagen", imgUrl, String(e).slice(0, 200));
        }
        await sleep(600);
      }
      if (cacheCambio) await sbPatch(`/rest/v1/ia_config?branch_id=eq.${branchId}`, { menu_media: cacheMedia });
      if (imgsOk === 0) console.error("[carta] NO se envio ninguna imagen de la carta a", fromPhone);
      // Frase que acompaña la carta: nodo "Evento: Pide la carta" del canvas
      // (flujo_extras.carta) > menu_frase config > apertura > default
      const extrasCarta = (cfg.flujo_extras as Record<string, { texto?: string }>) || {};
      const menuFraseCfg = (cfg.menu_frase as Record<string,string>) || {};
      const followUp = imgsOk === 0
        ? "Ahora mismo no puedo enviarte la carta 😔 Dime qué se te antoja y te digo precios."
        : (extrasCarta.carta && extrasCarta.carta.texto)
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
      await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: followUp, delivery_status: "sent", external_id: sentId || null, sent_at: new Date().toISOString() });
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: followUp, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      extraRespondido = true;   // NO salir: puede que también pida ubicación en el mismo mensaje
    }
  }

  // 6b. Detectar solicitud de UBICACIÓN → enviar dirección escrita + tarjeta de mapa.
  // Reutiliza las respuestas rápidas: k="ubicacion" (con .loc) y k="direccion" (texto),
  // así queda sincronizado con lo que Sergio edita en la config. Palabras clave
  // ESPECÍFICAS de "¿dónde están USTEDES?" — se evita "dirección" a secas porque
  // el cliente la usa al DAR su propia dirección de entrega en un pedido.
  try {
    const rrArr = (cfg.respuestas_rapidas as Array<Record<string, unknown>>) || [];
    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const ubiRR = rrArr.find(r => r && (r as Record<string, unknown>).loc && norm(String((r as Record<string, unknown>).k || "")).includes("ubicacion"));
    const dirRR = rrArr.find(r => r && norm(String((r as Record<string, unknown>).k || "")) === "direccion");
    const ubiLoc = ubiRR ? (ubiRR as Record<string, unknown>).loc as Record<string, unknown> : null;
    if (ubiLoc && ubiLoc.latitude && ubiLoc.longitude) {
      const cL = norm(batchMsgs.map(m => m.body).join(" "));
      const ubiKw = [
        "ubicacion","donde estan ubicados","donde estan","donde queda el local","donde queda ubicado",
        "donde quedan","donde quedan ustedes","como llego","google maps","mandame la ubicacion",
        "me mandas la ubicacion","enviame la ubicacion","me envias la ubicacion","comparteme la ubicacion",
        "pasame la ubicacion","donde los encuentro","donde es el local","por donde quedan","en que parte quedan",
        "donde estas ubicado","su ubicacion","la ubicacion del local"
      ];
      // "dirección" a secas es ambigua (el cliente la usa al DAR su dirección de entrega),
      // así que SOLO cuenta como "¿cuál es SU dirección?" si un mensaje COMPLETO del cliente
      // es exactamente una de estas frases (no si aparece dentro de una dirección de entrega).
      const dirExacta = ["direccion","la direccion","cual es la direccion","cual es su direccion","me das la direccion","me da la direccion","dame la direccion","me regalas la direccion","cual direccion","que direccion","direccion del local","direccion porfavor","direccion por favor","cual es la direccion del local","direcion","la direcion"];
      const pideDir = batchMsgs.some(m => { const mm = norm(m.body).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(); return dirExacta.includes(mm); });
      /* SI ESTAMOS ESPERANDO EL BARRIO, UN BARRIO ES LA RESPUESTA.
         El bot preguntaba "en que barrio queda esa direccion", el cliente
         contestaba "Bella Vista" —el barrio del propio restaurante— y el bot
         le respondia con la direccion DEL LOCAL, dejandolo sin pedido.
         "estan en bella vista?" SIGUE siendo una pregunta: por eso se exige
         que no traiga ninguna de las frases de ubicacion. */
      let contestaBarrio = false;
      /* SI ESTAMOS A MITAD DE UN PEDIDO PREGUNTANDO A DONDE VA, lo que llega
         es SU direccion, no una pregunta por donde quedamos.
         No basta con reconocer el barrio de la lista: "Por la Maria
         occidente" no esta configurado y aun asi es evidente que el cliente
         esta diciendo para donde va su pedido. Si de verdad pregunta donde
         quedamos usa alguna frase de ubicacion, y entonces esto no aplica. */
      if (!ubiKw.some(kw => cL.includes(kw)) && !pideDir) {
        try {
          const pend = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=pending_order_data&limit=1`) as Array<Record<string, unknown>> | null;
          const stPrev = pend?.[0]?.pending_order_data as Record<string, unknown> | null;
          /* Asi EMPIEZA quien esta DANDO un lugar, no preguntando por el
             nuestro: "por la Maria occidente", "para el centro", "vivo en...".
             Un cliente escribio "Por la Maria occidente" y el bot le contesto
             con la direccion del restaurante. */
          const suenaADarLugar = /^\s*(por|para|en|es en|queda en|vivo en|estoy en|hacia|hasta)\b/i.test(cL);
          contestaBarrio = !!(stPrev && stPrev.producto && (!stPrev.direccion || !stPrev.barrio))
            || suenaADarLugar;
        } catch (_) { /* si falla, se comporta como antes */ }
      }

      if (!contestaBarrio && (intenciones.ubicacion === true || ubiKw.some(kw => cL.includes(kw)) || pideDir)) {
        let dirTxt = dirRR ? String((dirRR as Record<string, unknown>).t || "").trim()
                           : `Estamos ubicados en ${String(ubiLoc.address || "").trim()}`.trim();
        // Si está CERRADO, damos la dirección IGUAL pero avisando el horario (pedido de Sergio).
        const cerr = (cfg as Record<string, unknown>)._cerradoInfo as { frase?: string } | null;
        if (cerr && cerr.frase && dirTxt) dirTxt = dirTxt + "\n\n" + cerr.frase;
        if (dirTxt) {
          await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: dirTxt } }),
          });
          await sleep(500);
        }
        await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "location", location: { latitude: ubiLoc.latitude, longitude: ubiLoc.longitude, name: String(ubiLoc.name || ""), address: String(ubiLoc.address || "") } }),
        });
        const savedMsg = dirTxt ? (dirTxt + " 📍") : "📍 Ubicación enviada";
        await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: savedMsg, delivery_status: "sent", sent_at: new Date().toISOString() });
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: "📍 Ubicación", last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        extraRespondido = true;
      }
    }
  } catch (e) { console.error("bloque ubicacion:", e); }

  // Si ya se atendió carta/precios y/o ubicación (una o ambas), no seguir al flujo de GPT.
  if (extraRespondido) { try { await setTyping(convId, false); } catch (_e) { /* noop */ } return; }

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
    const _prodFull = new Set<string>();   // nombres COMPLETOS de productos (validar extractProducto)
    const _prodMap: Array<{ key: string; name: string; cat: string }> = [];
    const _catNames = new Set<string>();   // nombres de categorías (una categoría NO es un producto)
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
      const normFull = normalizarTexto(nombreProd).toLowerCase().trim();
      if (normFull) _prodFull.add(normFull);
      const catNombre = String((p.category_id as Record<string, unknown> | null)?.name || "");
      if (normFull) _prodMap.push({ key: normFull, name: nombreProd, cat: catNombre });
      const catName = String((p.category_id as Record<string, unknown> | null)?.name || "");
      if (catName) {
        _addProdWords(catName);
        const normCat = normalizarTexto(catName).toLowerCase().trim();
        if (normCat) _catNames.add(normCat);
      }
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
    DYN_PRODUCT_FULL = [..._prodFull];
    DYN_CATEGORY_NAMES = [..._catNames];
    DYN_PROD_MAP = _prodMap;
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
    .filter(b => !b.startsWith("[imagen]") && !b.startsWith("[image]") &&
                 !b.startsWith("[audio]") && !b.startsWith("[sticker]") && !b.startsWith("[video]"))
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

    // SALIDA del "esperando comprobante": el cliente cambia de opinión y quiere pagar
    // en EFECTIVO. Antes quedaba en bucle repitiendo el recordatorio. Ahora se reabre
    // el pedido en efectivo y se re-muestra el resumen para confirmar.
    const stPend = (pendStatePrev && (pendStatePrev._v as number)) ? (pendStatePrev as unknown as PacoState) : null;
    const pagoNuevoPend = (extractPago(clienteTexto, pagosCfg) || pagoPorIntencion());
    const cambiaEfectivoPend = !!(pagoNuevoPend && !esMetodoDigital(pagoNuevoPend, pagosCfg));
    const esLlevarPend = stPend?.direccion ? LLEVAR_REGEX.test(stPend.direccion.toLowerCase()) : false;
    const prepagoPend  = domiciliosCfg?.llevar_prepago !== false;
    if (cambiaEfectivoPend && stPend && !(esLlevarPend && prepagoPend)) {
      stPend.pago = pagoNuevoPend as string;
      stPend.resumen_enviado = true;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pago_pendiente: false, pending_order_data: stPend });
      try {
        const sumMsg = await buildSummaryFromState(stPend, cfg, branchId, domiciliosCfg);
        await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      } catch (err) { console.error("reabrir pendiente como efectivo:", err); }
      return;
    }
    // Para-llevar con prepago: no se puede pagar en efectivo → recordar la regla
    if (cambiaEfectivoPend && stPend && esLlevarPend && prepagoPend) {
      const msgLl = getFraseTexto(frasesCfg.llevar_efectivo)
        || "Qué pena contigo 🙏 Para recoger tu pedido el pago debe hacerse por transferencia primero. Si prefieres efectivo, te lo preparamos cuando te acerques al local 🍟";
      await sendWaAndSave(convId, tenantId, msgLl, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgLl, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }

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
    currentProductData = await loadProductData(state.producto, branchId, state.producto_categoria);
  }
  let pasos = buildAllPasos(currentProductData, cfg, frasesCfg, nombreConfirmar, !!nombreKnown);

  // Cargar historial una sola vez (usado en todas las respuestas GPT)
  const histRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&sent_at=lt.${encodeURIComponent(batchStart)}&order=sent_at.desc&limit=15&select=direction,body,origen`
  );
  const histCtx = ((histRes || []) as Array<{ direction: string; body: string; origen?: string }>).reverse();

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
    // TODO va por GPT: entiende la INTENCIÓN del cliente (pedir / preguntar info /
    // saludar / despedirse / agradecer) y responde acorde — las instrucciones por
    // intención están en el prompt de "cerrado". Solo le pasamos los mensajes
    // ENTRANTES (no las salidas propias) para que no copie textual su frase anterior;
    // con temp alta varía naturalmente.
    const histCerrado = (histCtx || []).filter(h => h.direction === "in").slice(-6);
    const reply = await buildConversationResponse(
      clienteTexto, histCerrado, state, null, cfg, frasesCfg,
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

    // CORRECCIÓN del método de pago tras el resumen (regla de Sergio):
    // "mejor pago en efectivo" NO es confirmar — cambia el pago y RE-MUESTRA el
    // resumen. Sin esto, decir "efectivo" con "transferencia" ya puesto se ignoraba
    // (el extractor tiene candado !state.pago) y el bot mandaba el QR igual.
    {
      // Solo es CORRECCIÓN si ya había un pago distinto. Si el pago aún no se dio
      // (state.pago vacío), lo maneja la confirmación normal ("bueno, por nequi").
      const pagoNuevoRes = (extractPago(clienteTexto, pagosCfg) || pagoPorIntencion());
      const cambiaPago = !!(pagoNuevoRes && state.pago && normalizarTexto(pagoNuevoRes) !== normalizarTexto(state.pago));
      const esLlevarRes = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
      const prepagoRes  = domiciliosCfg?.llevar_prepago !== false;
      const bloqueoLlevarRes = esLlevarRes && prepagoRes && pagoNuevoRes && !esMetodoDigital(pagoNuevoRes, pagosCfg);
      if (cambiaPago && bloqueoLlevarRes) {
        // Para-llevar + prepago: no se puede efectivo → explicar y mantener el resumen
        const msgLl = getFraseTexto(frasesCfg.llevar_efectivo)
          || "Qué pena contigo 🙏 Para recoger tu pedido el pago debe hacerse por transferencia primero. Si prefieres efectivo, te lo preparamos cuando te acerques al local 🍟";
        await sendWaAndSave(convId, tenantId, msgLl, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgLl, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (cambiaPago) {
        state.pago = pagoNuevoRes as string;
        try {
          const sumMsg = await buildSummaryFromState(state, cfg, branchId, domiciliosCfg);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        } catch (err) { console.error("re-resumen por cambio de pago:", err); }
        return;
      }
    }

    const isConfirmacion = textoLow.length <= 80 && CONFIRM_WORDS.some(w =>
      textoLow === w || textoLow.startsWith(w + " ") || textoLow.endsWith(" " + w) ||
      textoLow.includes(" " + w + " ")
    );

    if (isConfirmacion) {
      // Si el método de pago quedó liberado (caso "para llevar + efectivo"), capturarlo
      // de este mismo mensaje: "bueno entonces por nequi" confirma Y trae el método.
      if (!state.pago) {
        const pagoNuevo = (extractPago(clienteTexto, pagosCfg) || pagoPorIntencion());
        if (pagoNuevo) {
          state.pago = pagoNuevo;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        }
      }

      /* Si quedan cajas marcadas "después del resumen" sin responder, se
         preguntan AHORA y el pedido no se crea todavía. El cliente confirmó lo
         que va a comer; falta el dato que no podía dar antes de ver el total. */
      {
        const faltaPost = findNextStep(state, pasos, true, domiciliosCfg);
        if (faltaPost && faltaPost.despues_resumen) {
          const pregunta = await buildConversationResponse(
            clienteTexto, histCtx, state, faltaPost,
            cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
            true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
          );
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, pregunta, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregunta, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
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
            await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: `[imagen] ${qrUrl}`, delivery_status: "sent", external_id: qrMsgId || null, sent_at: new Date().toISOString() });
          } else {
            console.error("QR send error:", await qrRes.text());
            // Guardar igual (fallido) para que el operador vea que el QR no salió
            await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: `[imagen] ${qrUrl}`, delivery_status: "failed", external_id: null, sent_at: new Date().toISOString() });
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
        const domiPrecio = esParaLlevar ? 0 : lookupDomiPrice(ubicacionPedido(state), domiciliosCfg);
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
    const correctedSlots = runExtractors(clienteTexto, state, null, pagosCfg, currentProductData, nombreConfirmar, intenciones);
    if (Object.keys(correctedSlots).length > 0) {
      state = mergeSlots(state, { ...correctedSlots, resumen_enviado: false });
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      const nextAfterCorr = findNextStep(state, pasos, false, domiciliosCfg);
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
      clienteTexto, histCtx, state, Object.keys(correctedSlots).length > 0 ? findNextStep(state, pasos, false, domiciliosCfg) : null,
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

  // 14a. Detección de producto — DETERMINÍSTICA contra el catálogo primero,
  // GPT solo como respaldo para escritura difusa. Además: DESAMBIGUACIÓN por
  // categoría cuando el mismo nombre existe en varias ("Especial" de
  // hamburguesa/perro/sandwich): 1º contexto del texto, 2º contexto del pedido
  // en curso, 3º se le pregunta al cliente (frase configurable).
  const needsProducto = !state.producto || NUEVO_PROD_REGEX.test(clienteTexto);
  let productoDetectado: string | null = null;
  let productoCategoriaDet: string | null = null;
  let cantidadDetectada = 1;

  // Resuelve un nombre (posiblemente repetido entre categorías) a UNA fila del catálogo.
  // Devuelve "ambiguo" cuando hay varias categorías y ningún contexto decide.
  const resolverCategoria = (nombre: string): { name: string; cat: string } | "ambiguo" | null => {
    const normN = normalizarTexto(nombre).toLowerCase().trim();
    let mismos = DYN_PROD_MAP.filter(e => e.key === normN);
    if (!mismos.length) mismos = DYN_PROD_MAP.filter(e => e.key.includes(normN) || normN.includes(e.key));
    if (!mismos.length) return null;
    const nombresDist = new Set(mismos.map(m => m.key));
    if (nombresDist.size > 1) {
      // matches de productos distintos (fuzzy) — tomar el de nombre más parecido
      mismos = mismos.filter(m => m.key === [...nombresDist].sort((a, b) =>
        Math.abs(a.length - normN.length) - Math.abs(b.length - normN.length))[0]);
    }
    if (mismos.length === 1) return { name: mismos[0].name, cat: mismos[0].cat };
    // Mismo nombre en VARIAS categorías → desambiguar
    const catTexto = categoriaMencionada(clienteTexto, mismos.map(m => m.cat));
    if (catTexto) { const m = mismos.find(x => x.cat === catTexto)!; return { name: m.name, cat: m.cat }; }
    const catCtx = state.producto_categoria ||
      (state.items.length ? (state.items[state.items.length - 1].categoria || null) : null);
    if (catCtx) {
      const exacto = mismos.find(x => normalizarTexto(x.cat) === normalizarTexto(catCtx));
      if (exacto) return { name: exacto.name, cat: exacto.cat };
      // Mismo TIPO de comida aunque la categoría difiera ("Salchipapas Especiales"
      // en curso → "una de carne" = la de "Salchipapas Tradicionales")
      const stemCat = (s: string) => normalizarTexto(s).split(/\s+/)[0].replace(/s$/, "");
      const porTipo = mismos.find(x => stemCat(x.cat) === stemCat(catCtx));
      if (porTipo) return { name: porTipo.name, cat: porTipo.cat };
    }
    return "ambiguo";
  };

  // ¿Quedó una desambiguación PENDIENTE del turno anterior? ("¿de cuál lo deseas?")
  {
    const stAmb = state as unknown as Record<string, unknown>;
    const amb = stAmb.producto_ambiguo as { nombre: string; cats: string[]; intentos?: number } | undefined;
    if (amb) {
      // Si el cliente CAMBIÓ a otro producto ("salchi premium carne perdón"), eso
      // manda: el flujo normal decide y la pregunta de categoría queda atrás.
      const matchesTxt = matchProductosEnTexto(clienteTexto);
      const otroProducto = matchesTxt.some(m => normalizarTexto(m.name) !== normalizarTexto(amb.nombre));
      const catElegida = otroProducto ? null : categoriaMencionada(clienteTexto, amb.cats);
      if (otroProducto) {
        delete stAmb.producto_ambiguo;   // pidió otra cosa — flujo normal decide
      } else if (catElegida) {
        const fila = DYN_PROD_MAP.find(e => e.key === normalizarTexto(amb.nombre) && e.cat === catElegida);
        if (fila) { productoDetectado = fila.name; productoCategoriaDet = fila.cat; }
        delete stAmb.producto_ambiguo;
      } else {
        amb.intentos = (amb.intentos || 0) + 1;
        if (amb.intentos >= 2) delete stAmb.producto_ambiguo;   // no insistir en bucle
      }
    }
  }

  if (needsProducto && !productoDetectado) {
    // 1) Matching determinístico del texto contra el catálogo
    const matches = matchProductosEnTexto(clienteTexto);
    if (matches.length > 0) {
      const primero = matches[0];
      const res = resolverCategoria(primero.name);
      if (res === "ambiguo") {
        // preguntar la categoría (frase configurable) y esperar la respuesta
        const mismos = DYN_PROD_MAP.filter(e => e.key === normalizarTexto(primero.name));
        const cats = [...new Set(mismos.map(m => m.cat))];
        (state as unknown as Record<string, unknown>).producto_ambiguo = { nombre: primero.name, cats, intentos: 0 };
        const singular = (s: string) => s.split(/\s+/).map(w => w.length > 3 ? w.replace(/s$/i, "") : w).join(" ");
        const opciones = cats.map(cq => capFirst(singular(cq).toLowerCase())).join(", ").replace(/, ([^,]+)$/, " o $1");
        const fraseAmb = (getFraseTexto(frasesCfg.elegir_categoria) ||
          "Tenemos {{producto}} en varias categorías 😋 ¿De cuál lo deseas? {{opciones_categoria}}")
          .replace(/\{\{?\s*producto\s*\}?\}/g, capFirst(primero.name.toLowerCase()))
          .replace(/\{\{?\s*opciones_categoria\s*\}?\}/g, opciones);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        await sendWaAndSave(convId, tenantId, fraseAmb, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: fraseAmb, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (res) { productoDetectado = res.name; productoCategoriaDet = res.cat; }
    }
    // 2) Respaldo GPT (typos, formas raras) + validación contra el catálogo
    if (!productoDetectado) {
      const result = await extractProducto(clienteTexto, menuText);
      cantidadDetectada = result.cantidad;
      if (result.producto) {
        const res = resolverCategoria(result.producto);
        if (res && res !== "ambiguo") { productoDetectado = res.name; productoCategoriaDet = res.cat; }
        else if (res === "ambiguo") {
          const res2 = resolverCategoria(result.producto);   // sin contexto quedó ambiguo → no forzar
          void res2;
          console.log(`producto GPT ambiguo ("${result.producto}") — se pedirá aclaración en el próximo match`);
        } else {
          console.log(`producto GPT inválido ("${result.producto}") — descartado (no está en el catálogo)`);
        }
      }
    }
  }

  // 14b. Manejar producto detectado
  if (productoDetectado) {
    const normNuevo = normalizarTexto(productoDetectado);
    const normActual = state.producto ? normalizarTexto(state.producto) : "";

    if (state.producto && normNuevo !== normActual) {
      const archived: SlotItem = {
        producto: state.producto, tamano: state.tamano, tipo: state.tipo,
        cantidad: state.cantidad, adiciones: state.adiciones,
        preferencias: state.preferencias,
        categoria: state.producto_categoria,
      };
      const prevDir  = state.direccion;
      const prevPago = state.pago;
      const prevNom  = state.nombre;
      const prevUpsell = state.upsell;
      const prevItems = state.items;
      state = newPacoState();
      state.producto  = productoDetectado;
      state.producto_categoria = productoCategoriaDet;
      state.cantidad  = cantidadDetectada;
      state.direccion = prevDir;
      state.pago      = prevPago;
      state.nombre    = prevNom;
      state.items     = [...prevItems, archived];
      // UPSELL una sola vez por PEDIDO (regla de Sergio): si el cliente ya
      // respondió a las adiciones (sí o no), no se le vuelve a preguntar por
      // cada producto nuevo que agregue. El extractor sigue capturando
      // adiciones si él las menciona por su cuenta.
      if (archived.adiciones !== null) state.adiciones = "";
      // El upsell es del PEDIDO, no del producto: si ya se ofreció, no se repite.
      if (prevUpsell !== null) state.upsell = prevUpsell;
      // La preferencia se queda con el producto que la recibió. El siguiente
      // arranca limpio: "una sin salsa y otra normal" son dos cosas distintas.
      state.preferencias = null;
      state.tipos = {};   // las variantes son de cada producto
    } else if (!state.producto) {
      state.producto = productoDetectado;
      state.producto_categoria = productoCategoriaDet;
      state.cantidad = cantidadDetectada;
    }

    // Cargar datos del producto y reconstruir pasos dinámicos
    currentProductData = await loadProductData(state.producto!, branchId, state.producto_categoria);
    pasos = buildAllPasos(currentProductData, cfg, frasesCfg, nombreConfirmar, !!nombreKnown);
  }

  // 14c. Paso actual (para contexto en extractores)
  /* OJO: si el producto se acaba de detectar EN ESTE MENSAJE, el paso
     siguiente no es el paso "actual" — el cliente todavia no lo ha visto.
     Darlo por actual hacia que el extractor de direccion forzara la captura
     y se tragara el mensaje entero: "La salchipapa mas economica de k precio
     es" quedaba guardado como la direccion del cliente, y el bot contestaba
     "en que barrio queda esa direccion" a una pregunta de precio. */
  const productoRecienDetectado = !!productoDetectado;
  const currentStep = (state.producto && !productoRecienDetectado)
    ? findNextStep(state, pasos, false, domiciliosCfg)
    : null;
  const currentStepId = currentStep?.id || null;

  // 14d. Correr extractores de slots
  const extracted = runExtractors(clienteTexto, state, currentStepId, pagosCfg, currentProductData, nombreConfirmar, intenciones, cfg);

  // 14e. Merge
  // Capturar ANTES del merge: si ya había una pregunta de dirección pendiente → es el segundo intento
  const yaHabiaPreguntadoDireccion = !!state.complemento_dir_pendiente;
  if (Object.keys(extracted).length > 0) {
    state = mergeSlots(state, extracted);
    /* La reserva se crea en cuanto estan sus datos, no al final del flujo: una
       reserva no tiene resumen ni cobro que esperar. El `reserva_id` evita
       crearla dos veces si el cliente sigue escribiendo. */
    if (state.reserva && !state.reserva_id) {
      const pasoRes = (Array.isArray(cfg.flujo_pasos) ? cfg.flujo_pasos as Array<Record<string, unknown>> : [])
        .find(p => p && p.campo === "reserva");
      const pendiente = !pasoRes || pasoRes.reserva_pendiente !== false;
      const nuevoId = await crearReserva(tenantId, branchId, fromPhone,
                                         state.nombre || nombreConfirmar, state.reserva, pendiente);
      if (nuevoId) {
        state.reserva_id = nuevoId;
        state.es_reserva = true;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      }
    }
  }
  // Si llegó una dirección nueva, reiniciar cualquier complemento pendiente de pasos anteriores
  // para que 14e-bis la re-evalúe limpiamente desde cero
  if (extracted.direccion && state.complemento_dir_pendiente) {
    state.complemento_dir_pendiente = null;
  }
  // Dirección HEREDADA (regla de Sergio): aunque el cliente haya pedido antes a esa
  // dirección, SIEMPRE se le confirma ("¿a la misma dirección? 📍 X") antes de usarla.
  // La bandera solo la limpia el paso confirmar_dir (sí/nueva dirección) — jamás se
  // asume en silencio. (El wipe automático anterior causó que Paco usara la dirección
  // vieja sin preguntar.)

  state.last_activity = new Date().toISOString();
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });

  /* 14e-PRE. "NOSOTROS PASAMOS POR ELLA" MANDA SOBRE LO YA GUARDADO.
     Caso real (caso 3 de las simulaciones): el cliente habia dado un pedazo de
     direccion ("F9"), y cuando despues dijo que la recogia, el clasificador
     seguia mirando ESE pedazo —incompleto— y le pedia la direccion completa
     cuatro veces seguidas hasta que el pedido se cayo.

     El clasificador siempre estuvo bien: reconoce "recoger" y de primero. El
     problema era QUE le llegaba, no como decidia. Una direccion a medias no
     puede tapar al cliente diciendo que no necesita domicilio. */
  if (LLEVAR_REGEX.test(clienteTexto.toLowerCase())) {
    const clasifYa = state.direccion
      ? clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2)
      : null;
    if (!clasifYa || clasifYa.tipo !== "para_llevar") {
      state.direccion = clienteTexto.trim();
      state.direccion_heredada = false;
      state.complemento_dir_pendiente = null;   // ya no hay nada que completar
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
    }
  }

  // 14e-bis. Dirección recién capturada → validar barrio/complemento inmediatamente
  // (así la pregunta de barrio aparece justo después de la dirección, no al final del flujo)
  if (extracted.direccion && state.direccion && state.producto && !state.complemento_dir_pendiente) {
    /* CONJUNTO QUE NO CONOCEMOS: se decide AQUI, en cuanto da la direccion.
       Si se dejara para el final, el bot se quedaria pidiendo un barrio que
       nunca va a poder resolver — que es justo el bucle que se corrigio.
       Se propone para que el dueño lo apruebe y la conversacion pasa a una
       persona, que es quien puede verificar si ese conjunto existe. */
    if (sueneAConjunto(state.direccion)
        && !esConjunto(state.direccion, domiciliosCfg)
        && !LLEVAR_REGEX.test(state.direccion.toLowerCase())
        && lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) === null) {
      const nombreConj = state.direccion
        .replace(/^\s*(seria|sería|es|para|en|el|la)\s+/i, "")
        .split(/\b(torre|bloque|bl|interior|int|apto|apartamento|apart|casa|piso)\b/i)[0]
        .replace(/[,.\-\s]+$/, "")
        .trim();
      if (nombreConj.length >= 3) {
        await proponerConjunto(tenantId, branchId, nombreConj, state.direccion);
        await pasarAHumano(
          convId, tenantId,
          `CONJUNTO NUEVO por aprobar: "${nombreConj}" — verificar que exista y asignarle zona. Dirección dada: ${state.direccion}`,
          cfg, fromPhone, phoneId, accessToken,
        );
        return;
      }
    }

    const clasifBis = clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2);
    if (clasifBis.tipo === "rechazado") {
      state.direccion = null;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      const reply = await buildConversationResponse(
        clienteTexto, histCtx, state, findNextStep(state, pasos, false, domiciliosCfg),
        cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
        true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
      );
      await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
    if (clasifBis.tipo === "incompleta") {
      /* A un CONJUNTO no se le pide una calle que no tiene: se le pide la
         unidad. Pedirle "Carrera 9 # 63-25" a quien vive en un conjunto es lo
         que dejaba al cliente dando vueltas sin poder pedir. */
      const conjNom = esConjunto(state.direccion, domiciliosCfg);
      const numCount = (state.direccion.match(/\d+/g) || []).length;
      const pregDetallada = conjNom
        ? `¡Listo, ${conjNom}! 😊 ¿En qué torre y apartamento (o casa) te lo dejamos?`
        : (numCount >= 2
          ? "¡Casi! 😊 Le falta el número de tu casa. La dirección debe verse así: *Carrera 9 # 63-25* ¿Cómo es la completa?"
          : "Necesito la dirección completa para llegar 📍 Algo así: *Carrera 9 # 63-25* ¿Cómo es la tuya?");
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
      const domiPrecioBis = lookupDomiPrice(ubicacionPedido(state), domiciliosCfg);
      const tieneCalle = analizarDireccion(state.direccion).tieneVia;
      const tieneNumeroBis = /#\s*\d|no\.\s*\d|nro\.\s*\d|número\s*\d|numero\s*\d/.test(state.direccion);
      /* A UN CONJUNTO NO SE LE PIDE CALLE NI NUMERO. Este control tambien
         exigia "calle o carrera y numero" y era el que dejaba a "torres del
         bosque torre 3 apto 603" dando vueltas: la direccion esta completa,
         solo que un conjunto no tiene calle. */
      if (!tieneCalle && !tieneNumeroBis && domiPrecioBis !== null && !esConjunto(state.direccion, domiciliosCfg)) {
        // Solo dio el barrio sin calle ni número — pedir la dirección completa
        const pregCalle = getFraseTexto(frasesCfg.preguntar_calle_numero)
          || "Anotado el barrio 📍 ¿Y cuál es la dirección exacta? (calle o carrera y número)";
        state.complemento_dir_pendiente = pregCalle;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        await sendWaAndSave(convId, tenantId, pregCalle, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregCalle, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      /* El barrio ya NO se pregunta aqui cortando la conversacion: es una
         casilla del flujo (paso "barrio") y espera su turno como las demas.
         Cortar aqui era lo que producia el bucle: se mandaba la misma frase
         antes de leer lo que el cliente habia dicho. */
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
      const pagoMencionado = (extractPago(clienteTexto, pagosCfg) || pagoPorIntencion());
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
    // Aplica SIEMPRE que el cliente pregunte el precio antes del resumen —
    // incluso si el método de pago ya quedó definido (bug real: con pago dado,
    // la IA respondía "no puedo darte el total hasta que pagues"). El total
    // SIEMPRE se informa antes de pagar.
    const CUANTO_RE = /(cu[aá]nto\s+(es|sale|vale|cuesta|queda|ser[ií]a|cobran?)|qu[eé]\s+precio|precio\s+total|el\s+total|cuanto\s+te\s+debo|la\s+cuenta\s+para\s+pagar|dame\s+la\s+cuenta)/i;
    if (state.producto && !state.resumen_enviado &&
        CUANTO_RE.test(clienteTexto) && !(extractPago(clienteTexto, pagosCfg) || pagoPorIntencion())) {
      const stepAhora = findNextStep(state, pasos, false, domiciliosCfg);
      if (stepAhora) {
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
        // Re-preguntar el paso pendiente con su frase del CANVAS (fiel al flujo)
        if (stepAhora.texto) {
          msgPrecio += "\n\n" + rellenarVariables(stepAhora.texto, state, cfg).texto;
          await sendWaAndSave(convId, tenantId, msgPrecio, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgPrecio, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
        // Paso conversacional sin frase fija (ej. upsell): enviar los precios y
        // dejar que el flujo normal haga la pregunta del paso a continuación
        await sendWaAndSave(convId, tenantId, msgPrecio, fromPhone, phoneId, accessToken);
      }
      // Si no hay paso pendiente, el flujo sigue y el resumen (con precios) sale ya mismo
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
      // ¿Pidió un producto ESPECÍFICO que NO existe? ("una chorizada") → decírselo
      // claramente antes de la carta (frase configurable frases.producto_no_existe).
      // Si solo nombró la categoría ("una salchipapa") → frase normal de siempre.
      const STOP_14F = new Set(["quiero","quisiera","dame","hazme","deseo","pedir","pedido","ordenar","enviame","dejame","regalas","haces","porfa","porfis","favor","gracias","hola","buenas","buenos","dias","tardes","noches","para","comer","antoja","antojo","tambien","ahora","luego","grande","pequena","personal","familiar","unico","unica","litro","litros","media","medio","doble"]);
      let productoInexistente: string | null = null;
      for (const w of normalizarTexto(clienteTexto).split(/\s+/)) {
        const stem = w.replace(/s$/, "");
        if (w.length < 4 || STOP_14F.has(w) || STOP_14F.has(stem)) continue;
        if (DYN_PROD_NAMES.includes(w) || DYN_PROD_NAMES.includes(stem)) continue;
        if (getAdicionKeywords().some(k => k === w || k === stem)) continue;
        productoInexistente = w; break;
      }
      const fraseNoExisteRaw = productoInexistente
        ? (getFraseTexto(frasesCfg.producto_no_existe) ||
           "No manejamos un producto con ese nombre 🙈 Esta es nuestra carta ☺️ ¿Cuál se te antoja?")
        : null;
      const fraseProd = rellenarVariables(fraseNoExisteRaw || fraseProdRaw, state, cfg).texto;
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
  const nextStep = findNextStep(state, pasos, false, domiciliosCfg);

  // 14h. Todos los slots completos → validar y mostrar resumen
  if (!nextStep) {
    if (state.direccion) {
      const clasifDir = clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2);
      if (clasifDir.tipo === "rechazado") {
        state.direccion = null;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        const reply = await buildConversationResponse(
          clienteTexto, histCtx, state,
          findNextStep(state, pasos, false, domiciliosCfg),
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
        const domiPrecioH = lookupDomiPrice(ubicacionPedido(state), domiciliosCfg);
        const tieneCalleH = analizarDireccion(state.direccion).tieneVia;
        const tieneNumH   = /#\s*\d|no\.\s*\d|nro\.\s*\d|número\s*\d|numero\s*\d/.test(state.direccion);
        if (!tieneCalleH && !tieneNumH && domiPrecioH !== null && !esConjunto(state.direccion, domiciliosCfg)) {
          const pregCalle = getFraseTexto(frasesCfg.preguntar_calle_numero)
            || "Anotado el barrio 📍 ¿Y cuál es la dirección exacta? (calle o carrera y número)";
          state.complemento_dir_pendiente = pregCalle;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, pregCalle, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: pregCalle, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
        /* El barrio lo pide el paso "barrio" del flujo, no este atajo:
           cortar aqui era lo que producia el bucle. */
      }
      if (clasifDir.tipo === "publico" && clasifDir.requierePagoAdelantado) {
        const esEfectivo = !esMetodoDigital(state.pago || "", pagosCfg);
        if (esEfectivo) {
          state.pago = null;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          const reply = await buildConversationResponse(
            clienteTexto, histCtx, state,
            findNextStep(state, pasos, false, domiciliosCfg),
            cfg, frasesCfg, menuText, horariosText, pagosText, domiciliosText, currentProductData,
            true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
          );
          await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          return;
        }
      }
    }

    // ¿Sabemos cuanto cobrar el domicilio? Si el barrio no esta en las zonas
    // configuradas, Paco NO cierra el pedido: no puede totalizar algo que no
    // sabe cuanto vale. Se lo pasa al humano.
    {
      const esLlevarFin = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
      if (!esLlevarFin && state.direccion && lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) === null) {
        /* CONJUNTO QUE NO ESTA EN LA LISTA (regla de Sergio):
           se PROPONE para que el dueño lo apruebe desde Configuracion ->
           Domicilios, y la conversacion pasa a una persona para que verifique
           si ese conjunto existe de verdad en la ciudad.
           El bot no lo acepta solo porque un conjunto sin zona no tiene precio
           de domicilio: aceptarlo a ciegas seria cobrar mal o no cobrar. */
        let motivo = `No hay precio de domicilio configurado para: ${state.direccion}`;
        if (sueneAConjunto(state.direccion)) {
          /* El nombre del conjunto es lo que va ANTES de la unidad: de
             "torres del bosque torre 3 apto 603" se propone "torres del
             bosque", no la direccion entera con el apartamento de un cliente. */
          const nombreConj = state.direccion
            .replace(/^\s*(seria|sería|es|para|en|el|la)\s+/i, "")
            .split(/\b(torre|bloque|bl|interior|int|apto|apartamento|apart|casa|piso)\b/i)[0]
            .replace(/[,.\-\s]+$/, "")
            .trim();
          if (nombreConj.length >= 3) {
            await proponerConjunto(tenantId, branchId, nombreConj, state.direccion);
            motivo = `CONJUNTO NUEVO por aprobar: "${nombreConj}" — verificar que exista y asignarle zona. Dirección dada: ${state.direccion}`;
          }
        }
        await pasarAHumano(convId, tenantId, motivo, cfg, fromPhone, phoneId, accessToken);
        return;
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

// ── Cuando Paco no sabe: se calla y llama al humano ─────────────────────────────
// Deja la conversacion en la pestana de HUMANO y se apaga para ese chat. No
// contesta nada por defecto: inventar o decir "a confirmar" es peor que el
// silencio de 30 segundos que tarda una persona en responder.
//
// El restaurante puede configurar una frase de espera desde el canvas
// (ia_config.handoff.frase). Si no la pone, silencio.
async function pasarAHumano(
  convId: string,
  tenantId: string,
  motivo: string,
  cfg: Record<string, unknown>,
  fromPhone: string,
  phoneId: string,
  accessToken: string,
): Promise<void> {
  const handoff = (cfg.handoff as Record<string, unknown>) || {};
  const frase = String(handoff.frase || "").trim();
  try {
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
      human_takeover: true,
      // Queda escrito POR QUE se paso, para que el humano lo vea al abrirla y
      // sepa que le falta configurar.
      handoff_motivo: motivo,
      handoff_at: new Date().toISOString(),
      ai_typing: false,
    });
  } catch (err) {
    console.error("pasarAHumano:", err);
  }
  if (frase) {
    try {
      await sendWaAndSave(convId, tenantId, frase, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
        last_message: frase, last_message_at: new Date().toISOString(),
        last_sender: "agent", last_read: false, ai_typing: false,
      });
    } catch (err) { console.error("pasarAHumano frase:", err); }
  }
  await setTyping(convId, false);
}

// ── Preferencias de preparación ─────────────────────────────────────────────────
// "sin ajo", "solo bbq", "poca salsa", "sin queso", "extra tocineta"...
//
// Los disparadores son del ESPAÑOL, no de ningún restaurante: cualquier negocio
// dice "sin", "solo", "poca". El restaurante puede sumar los suyos desde el
// canvas (ia_config.preferencias_palabras), igual que las adiciones.
//
// Sin barras invertidas de letra (\b, \s): se corrompen al desplegar.
function extractPreferencias(text: string, cfg: Record<string, unknown>): string | null {
  const t = String(text || "").trim();
  if (!t || t.length > 300) return null;

  const extra = Array.isArray(cfg.preferencias_palabras)
    ? (cfg.preferencias_palabras as unknown[]).map(x => String(x || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const base = ["sin", "solo", "solamente", "unicamente", "únicamente",
                "poca", "poco", "mucha", "mucho", "extra", "aparte", "nada de"];
  const disparadores = base.concat(extra);

  const bajo = normalizarTexto(t);
  const frases: string[] = [];

  for (const d of disparadores) {
    const dn = normalizarTexto(d);
    // El disparador debe ir suelto, no dentro de otra palabra: "sin" sí,
    // pero no el "sin" de "sinceramente".
    const re = new RegExp("(^|[^a-z0-9])" + dn + "([^a-z0-9])", "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(bajo)) !== null) {
      const desde = m.index + m[1].length;
      // Se toma lo que sigue hasta el final de esa idea (coma, "y", punto).
      const resto = t.slice(desde);
      // NO se corta en " y ": "solo ajo y bbq" es UNA preferencia con dos
      // salsas, y cortando ahi se perdia el bbq.
      // El " y " corta SOLO cuando empieza otra idea ("y una adicion",
      // "y me regalas"). En "solo ajo y bbq" el " y " enumera salsas y
      // cortar ahi perdia el bbq.
      const corte = resto.search(/[,.;]| pero | y (un|una|uno|dos|tres|el |la |los |las |me |para |tambien|ademas)/i);
      let frase = (corte > 0 ? resto.slice(0, corte) : resto).trim();
      // Las cortesias del final no son parte de la preferencia: "poca salsa
      // por favor" tiene que llegar a la cocina como "poca salsa".
      frase = frase.replace(/[ ]+(por[ ]+favor|porfavor|porfa|porfis|gracias)[ .!]*$/i, "").trim();
      if (frase.length >= 4 && frase.length <= 60) frases.push(frase);
      if (frases.length >= 4) break;
    }
    if (frases.length >= 4) break;
  }
  if (!frases.length) return null;
  // Sin repetidas y en el orden en que las dijo.
  const vistas: Record<string, boolean> = {};
  const limpias = frases.filter(f => {
    const k = normalizarTexto(f);
    if (vistas[k]) return false;
    vistas[k] = true;
    return true;
  });
  return limpias.join(", ");
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

// Quita muletillas al inicio de una dirección dictada: "No, mándala a la Calle 5..."
// → "Calle 5...". Si al limpiar no queda nada, devuelve el original.
function limpiarPrefijoDireccion(s: string): string {
  let t2 = s.trim();
  t2 = t2.replace(/^no[,.\s]+/i, "");
  t2 = t2.replace(/^(mejor|s[ií])[,.\s]+/i, "");
  t2 = t2.replace(/^(m[aá]ndal[ao]|env[ií]al[ao]|ll[eé]val[ao]|c[aá]mbial[ao]|es|ser[ií]a|ahora)\s+(a\s+)?(la\s+|el\s+)?/i, "");
  return t2 || s;
}

function extractDireccion(text: string, isCurrentStep: boolean, productData: ProductData | null = null): string | null {
  const t = text.toLowerCase().trim();
  if (LLEVAR_REGEX.test(t)) return text.trim();
  // Mensaje multi-línea: capturar SOLO la línea que es una dirección — SIEMPRE,
  // también en el paso de dirección. (Bug real: "Carrera 9...\nY dame también una
  // tropical porfa" quedó COMPLETO como dirección, con el producto adentro.)
  if (text.includes("\n")) {
    const lineaDir = text.split("\n").map(l => l.trim())
      .find(l => l && l.length <= 65 && CALLE_REGEX.test(l) && /\d/.test(l));
    if (lineaDir) return lineaDir;
  }
  // Cuando no es el paso de dirección, solo capturar si el texto es corto (<= 65 chars)
  // Evita que mensajes largos con "Carrera"/"Calle" (ej. mensaje inicial con todo el pedido) se almacenen como dirección completa
  if (CALLE_REGEX.test(text) && (isCurrentStep || text.trim().length <= 65)) return text.trim();
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

async function loadProductData(productName: string, branchId: string, categoria?: string | null): Promise<ProductData | null> {
  const rows = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=id,name,price_mode,presentations,variables,category_id(name)`
  ) as Array<Record<string, unknown>> | null;
  if (!rows || !rows.length) return null;
  /* Aqui ya viene la carta ENTERA, no solo el producto buscado: se aprovecha
     para saber que palabras son opciones en este restaurante y cuales son
     conversacion. Sin esto no hay como distinguir "mixta" (una opcion que este
     producto no tiene) de "prefieres" (una palabra cualquiera). */
  cargarVocabularioOpciones(rows);
  const matched = matchCatalogo(rows, productName, categoria);
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
  // Lo que ENTENDIO el clasificador. Se usa solo como respaldo cuando la
  // lectura por texto no encuentra nada: la gente escribe "nequii", "davi
  // plata" o "transfe" y ninguna lista los cubre.
  intenciones: Record<string, unknown> = {},
  cfgGlobal: Record<string, unknown> = {},
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

  // Las preferencias pueden llegar en CUALQUIER momento ("ah, y sin ajo"), no
  // solo al pedir. Por eso se lee siempre y se sSUMA a lo que ya había, en vez
  // de reemplazarlo: el cliente puede agregar condiciones de a poco.
  {
    const pref = extractPreferencias(text, cfgGlobal);
    if (pref) {
      const previas = state.preferencias ? state.preferencias + ", " : "";
      const juntas = (previas + pref).split(", ");
      const vistas: Record<string, boolean> = {};
      const unicas = juntas.filter(x => {
        const k = normalizarTexto(x);
        if (!k || vistas[k]) return false;
        vistas[k] = true;
        return true;
      });
      result.preferencias = unicas.join(", ");
    }
  }

  if (!state.tamano && productData && productData.presentations.length > 1) {
    const p = extractPresentacion(text, productData.presentations);
    if (p) result.tamano = p;
  }
  if (productData && productData.variables.length > 0) {
    /* Se recorren TODOS los grupos, no solo el primero: "de pollo y tocineta"
       responde dos grupos en un solo mensaje. */
    const yaTipos: Record<string, string> = { ...(state.tipos || {}) };
    let cambio = false;
    for (const vg of productData.variables) {
      if (!vg.options || vg.options.length === 0) continue;
      if (yaTipos[vg.id]) continue;                 // ese grupo ya está resuelto
      const v = extractVariable(text, vg.options);
      if (v) { yaTipos[vg.id] = v; cambio = true; }
    }
    if (cambio) {
      result.tipos = yaTipos;
      // `tipo` sigue siendo el texto junto, en el orden de los grupos, que es
      // lo que espera el resumen y lo que se manda al crear el pedido.
      result.tipo = productData.variables
        .map(vg => yaTipos[vg.id])
        .filter(Boolean)
        .join(", ");
    }
  }
  if (!state.pago) {
    let p = extractPago(text, pagosCfg);
    if (!p && intenciones.pago) {
      // El texto no lo reconocio, pero la intencion si. Se traduce al metodo
      // que el restaurante tenga configurado.
      const metodos = getMetodosPago(pagosCfg);
      if (intenciones.pago === "transferencia") {
        const dig = metodos.find(m => m.digital);
        p = dig ? dig.nombre.toLowerCase() : "transferencia";
      } else if (intenciones.pago === "efectivo") {
        const efe = metodos.find(m => !m.digital);
        p = efe ? efe.nombre.toLowerCase() : "efectivo";
      }
    }
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
  /* La respuesta al upsell. Si acepta, el producto lo recoge el extractor de
     productos como cualquier otro; aqui solo se anota que YA se le ofrecio,
     para no volver a ofrecerle. */
  if (state.upsell === null && currentStepId === "sugerencia") {
    const tU = text.toLowerCase().trim();
    const rechaza = tU === "no" || tU === "no." || tU === "n" || tU === "na" ||
      RECHAZO_UPSELL_WORDS.some(w => tU.includes(w));
    result.upsell = rechaza ? "" : text.trim().slice(0, 80);
  }

  if (currentStepId === "confirmar_dir" && state.direccion && state.direccion_heredada) {
    const textoLow = text.toLowerCase().trim();
    const confirmaDir = CONFIRM_WORDS.some(w => textoLow === w || textoLow.includes(w));
    const rechazaDir = intenciones.rechaza_direccion === true
      || textoLow === "no" || textoLow === "no." || textoLow.startsWith("no,")
      || textoLow.includes("cambia") || textoLow.includes("otra");
    const nuevaDir = extractDireccion(text, true, productData);
    // PRIORIDAD: si el mensaje TRAE la nueva dirección ("No, mándala a la Calle 5..."),
    // se usa esa — el "no" del inicio no puede borrarla
    if (nuevaDir && !confirmaDir) { result.direccion = limpiarPrefijoDireccion(nuevaDir); result.direccion_heredada = false; }
    else if (rechazaDir) { result.direccion = null; result.direccion_heredada = false; }
    else if (confirmaDir) { result.direccion_heredada = false; }
    // No early return: los demás extractores corren siempre para capturar pago, nombre, etc.
    // del mismo mensaje. Cada paso es independiente del resto.
  }
  if (!state.direccion || state.direccion_heredada) {
    // Una dirección heredada puede ser REEMPLAZADA si el cliente escribe una nueva
    // en cualquier momento (queda confirmada de una — él mismo la dio)
    const isDirStep = currentStepId === "direccion" || currentStepId === "confirmar_dir";

    /* LA CAUSA COMUN DE DOS FALLOS DE LAS SIMULACIONES.
       El extractor aceptaba como direccion casi cualquier texto, y de ahi
       salian los dos sintomas:
         - "Carlos primero" (un barrio suelto) se tomo como direccion y el
           bot salto a pedir el pago SIN PREGUNTAR QUE QUERIA COMER.
         - "La salchipapa mas economica de k precio es" tambien, y el bot
           contesto "en que barrio queda esa direccion" a una pregunta.

       Dos candados, con excepcion para el caso que SI funciona (el cliente
       que manda producto + direccion en un solo mensaje):
         1. Una PREGUNTA no es una direccion. Nadie da su casa preguntando.
         2. Sin producto todavia, solo se acepta si trae senales de
            direccion de verdad. El flujo pide la direccion DESPUES del
            producto: capturarla antes es adivinar. */
    const tLowDir = text.toLowerCase();
    const esPreguntaDir = text.includes("?")
      || /^\s*(cuanto|cuánto|que|qué|cual|cuál|como|cómo|donde|dónde|hay|tienen|tienes|a\s+como|de\s+a?\s*(k|que|qué))\b/.test(tLowDir);
    const senalDireccion = /\b(calle|carrera|cra|cll|kra|avenida|av|diagonal|transversal|manzana|barrio|conjunto|torre|apto|apartamento|casa|vereda)\b/.test(tLowDir)
      || text.includes("#")
      || LLEVAR_REGEX.test(tLowDir);
    /* Se exigen SENALES de direccion siempre que no estemos en el paso de la
       direccion. Con "tener producto" bastaba, y no alcanza: "la salchipapa mas
       economica de k precio es" pone el producto y el resto de la frase se
       colaba como direccion. Una direccion de verdad trae calle, carrera, # o
       barrio; una pregunta no. */
    const puedeSerDireccion = !esPreguntaDir && (isDirStep || senalDireccion);

    /* Se extrae a la fuerza tambien cuando el mensaje trae señales claras
       (calle, carrera, #, barrio): el cliente que manda todo junto —"una
       premium para la calle 25 N #1-84 barrio sotara"— da la direccion sin que
       nadie se la haya preguntado, y hay que sacarla de en medio del texto. */
    const d = puedeSerDireccion
      ? extractDireccion(text, (isDirStep && !state.direccion) || senalDireccion, productData)
      : null;
    if (d) { result.direccion = limpiarPrefijoDireccion(d); result.direccion_heredada = false; }
  }
  /* El barrio puede llegar en cualquier momento: en la direccion completa, o
     solo, o mucho despues. Se lee siempre. */
  if (!state.barrio) {
    const b = extraerBarrio(text, (cfgGlobal.domicilios as Record<string, unknown> | null | undefined));
    if (b) result.barrio = b;
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

/* Las cajas marcadas "después del resumen" no cuentan para decidir si el
   pedido está completo: si contaran, el resumen nunca saldría. Se preguntan
   aparte, cuando el cliente ya vio cuánto es. */
function findNextStep(state: PacoState, pasos: PasoDefinicion[], incluirPostResumen = false,
                      domiciliosPaso: Record<string, unknown> | null | undefined = null): PasoDefinicion | null {
  // Si hay un complemento de dirección pendiente (barrio, número, referencia)
  // el slot "direccion" no se considera completo hasta que se resuelva

  /* Para poder decidir si una caja aplica: si el cliente va a recoger, la de
     dirección no tiene sentido; si ya es cliente conocido, la de "cliente
     nuevo" tampoco. */
  const esRecoger = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
  const aplica = (paso: PasoDefinicion): boolean => {
    if (!paso.cuando) return true;
    if (paso.cuando === "recoger")   return esRecoger;
    if (paso.cuando === "domicilio") return !esRecoger;
    return true;   // "nuevo" se evalúa donde se conoce al cliente
  };

  for (const paso of pasos) {
    if (paso.despues_resumen && !incluirPostResumen) continue;
    if (!aplica(paso)) continue;
    // Una caja no obligatoria nunca DETIENE el pedido: si el cliente lo dice
    // se captura igual, pero no se le pregunta ni se le espera.
    if (paso.obligatoria === false) continue;
    if (paso.id === "presentacion") {
      if (!state.tamano) return paso;
    } else if (paso.id.startsWith("variable_")) {
      // Un paso por grupo: se mira SU grupo, no el texto junto. Antes bastaba
      // con que hubiera cualquier variante para dar por hechos todos.
      const grupoId = paso.id.slice("variable_".length);
      if (!(state.tipos || {})[grupoId]) return paso;
    } else if (paso.id === "upsell") {
      if (state.adiciones === null) return paso;
    } else if (paso.id === "sugerencia") {
      /* Se ofrece UNA sola vez por pedido (regla de Sergio): en cuanto
         responde algo —lo que sea— la casilla queda resuelta. */
      if (state.upsell === null) return paso;
    } else if (paso.id === "confirmar_dir") {
      if (state.direccion && state.direccion_heredada) return paso;
    } else if (paso.id === "direccion") {
      if (!state.direccion) return paso;
      /* EL BARRIO ES SU PROPIA CASILLA y va justo despues de la direccion:
         sin el no se sabe cuanto cobrar el domicilio.
         Solo se pide si hace falta — si la direccion ya cayo en una zona, el
         precio esta resuelto y preguntar seria hacerle perder el tiempo. */
      if (!state.barrio && !esRecoger && lookupDomiPrice(ubicacionPedido(state), domiciliosPaso) === null) {
        const modoBarrio = paso.modo === "fija" ? "fija" : "conversacional";
        const fraseBarrio = paso.preg_barrio || "¿Y en qué barrio queda esa dirección? 📍";
        return modoBarrio === "fija"
          ? { id: "barrio", campo: "direccion", modo: "fija", texto: fraseBarrio }
          : { id: "barrio", campo: "direccion", modo: "conversacional", texto: fraseBarrio,
              guia: "PRIMERO responde a lo que el cliente acaba de decir. DESPUES, "
                + "de forma natural, preguntale en que barrio queda — lo necesitas "
                + "para saber cuanto cuesta el domicilio. Si ya se lo preguntaste, "
                + "NO repitas la misma frase: dilo con otras palabras." };
      }
    } else if (paso.id === "preferencias") {
      if (!state.preferencias) return paso;
    } else if (paso.id === "pago") {
      if (!state.pago) return paso;
    } else if (paso.id === "nombre") {
      if (!state.nombre) return paso;
    } else if (paso.id === "reserva") {
      if (state.reserva === null) return paso;
    } else if (paso.id === "programado") {
      /* "" es valido: dijo "cuando este listo". Solo null es "sin preguntar". */
      if (state.programado === null) return paso;
    } else if (paso.id === "factura") {
      if (state.factura === null) return paso;
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

/* Copia a cada paso las opciones que tiene CUALQUIER caja del canvas. Se hace
   en un solo sitio para que agregar una opción nueva no obligue a tocar los
   nueve tipos de caja. */
function comunes(paso: PasoDefinicion, p: Record<string, unknown>): void {
  paso.obligatoria = p.obligatoria !== false;
  if (p.cuando && p.cuando !== "siempre") paso.cuando = String(p.cuando);
  if (p.si_falla && p.si_falla !== "insistir") paso.si_falla = String(p.si_falla);
}

function buildAllPasos(productData: ProductData | null, cfg: Record<string, unknown>, frasesCfg: Record<string, unknown>, nombreConfirmar: string | null = null, esRecurrente = false): PasoDefinicion[] {
  // Flujo configurado desde el canvas (ia_config.flujo_pasos) — respeta orden/modo/frase de cada paso,
  // pero inyecta las opciones dinámicas del producto (tamaño/tipo vienen del catálogo, no del canvas).
  const customRaw = cfg.flujo_pasos;
  if (Array.isArray(customRaw) && customRaw.length > 0) {
    try {
      const procesados = procesarFlujoCanvas(customRaw as Array<Record<string, unknown>>, productData, nombreConfirmar, esRecurrente, frasesCfg);
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
/* ¿La frase escrita a mano cita mal las opciones de ESTE producto?
   Mal es de las dos formas: que le falte una que si existe, o que nombre una
   que no. La segunda es la que se colaba, porque nadie la estaba mirando. */
/* normalizarTexto ya dejó solo minúsculas sin tildes y espacios. */
const PALABRAS_OPCION = /[a-z0-9]+/g;
function presentacionesMalCitadas(texto: string, nombres: string[]): boolean {
  if (!texto) return false;
  const t = normalizarTexto(texto);
  // ¿Le falta alguna real?
  if (nombres.some(n => !t.includes(normalizarTexto(n)))) return true;
  /* ¿Nombra alguna que no es? Se comparan solo las palabras que aparecen como
     opción en ALGÚN producto del restaurante: así "prefieres", "quieres" o
     "😋" no cuentan como opciones inventadas. */
  const validas = new Set(nombres.flatMap(n => normalizarTexto(n).match(PALABRAS_OPCION) || []));
  const sospechosas = (t.match(PALABRAS_OPCION) || []).filter(w => VOCABULARIO_OPCIONES.has(w));
  return sospechosas.some(w => !validas.has(w));
}
/* Se llena con las opciones de toda la carta antes de procesar el flujo. */
const VOCABULARIO_OPCIONES = new Set<string>();
function cargarVocabularioOpciones(productos: Array<Record<string, unknown>>) {
  VOCABULARIO_OPCIONES.clear();
  for (const p of productos || []) {
    for (const g of (p.variables as Array<Record<string, unknown>>) || []) {
      for (const o of (g.options as Array<Record<string, unknown>>) || []) {
        for (const w of normalizarTexto(String(o.name || "")).match(PALABRAS_OPCION) || []) {
          VOCABULARIO_OPCIONES.add(w);
        }
      }
    }
    for (const pr of (p.presentations as Array<Record<string, unknown>>) || []) {
      for (const w of normalizarTexto(String(pr.name || "")).match(PALABRAS_OPCION) || []) {
        VOCABULARIO_OPCIONES.add(w);
      }
    }
  }
}

function procesarFlujoCanvas(
  canvasPasos: Array<Record<string, unknown>>,
  productData: ProductData | null,
  nombreConfirmar: string | null,
  esRecurrente: boolean,
  frasesCfg: Record<string, unknown> = {},
): PasoDefinicion[] {
  const out: PasoDefinicion[] = [];
  for (const p of canvasPasos) {
    const antes = out.length;
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
      // Si la frase del canvas trae las opciones ESCRITAS A MANO ("¿personal o
      // familiar?") y este producto tiene OTRAS presentaciones (Coca Cola:
      // Personal / 1.5 Litros), la frase mentiría → usar las opciones reales.
      // Sirve en los dos sentidos: que le falte una presentacion real, o que
      // NOMBRE UNA QUE ESTE PRODUCTO NO TIENE. Lo segundo es lo que se
      // escapaba: la frase "¿personal o familiar?" pasaba el filtro para un
      // producto que solo viene familiar, y le ofrecia una personal que no
      // existe.
      const malaPres = presentacionesMalCitadas(texto, productData.presentations.map(x => x.name));
      if (malaPres) texto = `¿Cómo la prefieres? (${opciones}) 😋`;
      guia  = (guia || `Pregunta cuál presentación prefiere. SOLO estas opciones exactas: ${opciones}. No ofrezcas ninguna otra.`).replace(/\{opciones\}/g, opciones);
      out.push({ id: "presentacion", campo: "tamano", modo, texto, guia });
    } else if (campo === "tipo") {
      if (!productData || productData.variables.length === 0) continue;
      /* UN PASO POR GRUPO, no solo el primero. Por aqui se colaba el agujero
         mas grande: la SUPER QUESO tiene "Primer Ingrediente" y "Segundo
         Ingrediente", y el segundo NUNCA se preguntaba — el bot cerraba el
         pedido sin saber si era chorizo o tocineta. El motor por defecto
         (buildProductPasos) si recorre todos; solo este camino, el del canvas,
         se quedaba en variables[0]. Y el canvas es el que usa el restaurante. */
      for (const vg of productData.variables) {
        if (!vg.options || vg.options.length === 0) continue;
        const opciones = vg.options.map(o => o.name).join(", ");
        let vTexto = (texto || "¿{label}? ({opciones}) 🍟").replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones);
        /* Sirve en los dos sentidos: que a la frase le falte una opcion real,
           o que NOMBRE UNA QUE ESTE PRODUCTO NO TIENE. Lo segundo es lo que se
           escapaba: "¿La prefieres mixta, de carne o de pollo?" pasaba el
           filtro para la SUPER QUESO —que si tiene carne y pollo— y le ofrecia
           una "mixta" que no existe. */
        if (presentacionesMalCitadas(vTexto, vg.options.map(o => o.name))) {
          vTexto = `¿${vg.name}? (${opciones}) 🍟`;
        }
        const vGuia = (guia || `Pregunta por "${vg.name}". SOLO estas opciones exactas: ${opciones}. Jamás menciones otra.`)
          .replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones);
        out.push({ id: `variable_${vg.id}`, campo: "tipo", modo, texto: vTexto, guia: vGuia });
      }
    } else if (campo === "producto") {
      // El paso "producto" no entra al slot-filling (findNextStep): lo consume el caso
      // sin-producto de buildConversationResponse leyendo cfg.flujo_pasos directamente.
      continue;
    } else if (campo === "adiciones") {
      out.push({ id: "upsell", campo: "adiciones", modo, texto: texto || undefined, guia: guia || undefined });
    } else if (campo === "direccion") {
      // Dirección HEREDADA (cliente recurrente): SIEMPRE se confirma antes de usarla.
      // El bot muestra la dirección guardada y el cliente confirma o da otra.
      // Frase configurable: frases.confirmar_direccion ({{direccion}}).
      out.push({
        id: "confirmar_dir", campo: "direccion", modo: "fija",
        texto: getFraseTexto(frasesCfg.confirmar_direccion) ||
          "¿Te lo enviamos a la misma dirección de la vez pasada? 📍\n{{direccion}}\nConfírmame o escríbeme la nueva dirección 😊",
      });
      out.push({
        id: "direccion", campo: "direccion", modo,
        texto: texto || "Con gusto, ¿para dónde va tu pedido? ☺️", guia,
        preg_incompleta: p.preg_incompleta ? String(p.preg_incompleta) : undefined,
        preg_barrio:     p.preg_barrio ? String(p.preg_barrio) : undefined,
      });
    } else if (campo === "upsell") {
      /* Ofrecer algo más. Es su propia caja y no las adiciones: una adición va
         SOBRE el plato ("con tocineta"), el upsell es otro producto ("¿te
         provoca una gaseosa?"). El dueño elige qué ofrecer; si no elige nada,
         el asistente propone de la carta. */
      const cuales = Array.isArray(p.upsell_productos) ? (p.upsell_productos as unknown[]).map(String).filter(Boolean) : [];
      const lista = cuales.length ? cuales.join(", ") : "";
      out.push({
        id: "sugerencia", campo: "upsell", modo,
        texto: texto || undefined,
        guia: guia || (lista
          ? `Ofrece de forma natural y breve: ${lista}. Una sola vez. Si el cliente no quiere, sigue sin insistir.`
          : "Ofrece algo más de forma natural y breve, una sola vez. Si el cliente no quiere, sigue sin insistir."),
      });
    } else if (campo === "preferencias") {
      // Solo existe si el restaurante lo agrega a su flujo. El Parche no lo
      // necesita —sus clientes lo dicen solos— pero otro puede querer
      // preguntarlo siempre ("¿alguna preferencia? ¿algo que le quitemos?").
      /* TODO en UNA sola pregunta, nunca en varias: son observaciones sueltas
         del mismo pedido y preguntarlas por separado alarga la conversacion
         sin ganar nada. Los interruptores del canvas solo dicen QUE tener en
         cuenta. Sin `pref_opciones` (canvas viejo) se comporta como siempre:
         solo la preparacion del plato. */
      const po = (p.pref_opciones || null) as Record<string, unknown> | null;
      const quiere = {
        plato:     po ? po.plato !== false : true,
        domicilio: po ? po.domicilio === true : false,
        cubiertos: po ? po.cubiertos === true : false,
      };
      const partes: string[] = [];
      if (quiere.plato)     partes.push("algo especial en la preparación (sin algún ingrediente, término, picante, alergias)");
      if (quiere.domicilio) partes.push("indicaciones para la entrega (torre, apartamento, portería, si el timbre no sirve)");
      if (quiere.cubiertos) partes.push("si necesita cubiertos");
      const textoDefecto = quiere.cubiertos && partes.length === 1
        ? "¿Necesitas cubiertos? ☺️"
        : "¿Alguna preferencia o indicación para tu pedido? ☺️";
      out.push({
        id: "preferencias", campo: "preferencias", modo,
        texto: texto || textoDefecto,
        guia: guia || (partes.length
          ? `En UNA sola pregunta, corta y natural, averigua: ${partes.join("; ")}. NO lo preguntes por separado ni insistas: si dice que no o no menciona algo, sigue.`
          : "Pregunta si quiere algo especial en la preparación. Si dice que no, sigue sin insistir."),
      });
    } else if (campo === "programado") {
      const minPrep = p.hora_min_prep == null ? 60 : Number(p.hora_min_prep) || 0;
      const diasMax = p.hora_dias_max == null ? 7  : Number(p.hora_dias_max) || 0;
      const reglas: string[] = [];
      if (p.hora_valida_horario !== false) reglas.push("SOLO acepta horas dentro del horario de atención; si piden una hora cerrada, dilo y vuelve a preguntar");
      if (minPrep > 0) reglas.push(`no aceptes una hora antes de ${minPrep} minutos desde ahora`);
      reglas.push(diasMax > 0 ? `se puede pedir hasta ${diasMax} día(s) adelante` : "solo para hoy");
      reglas.push(p.hora_permite_ya !== false
        ? 'si dice "cuando esté listo" o "lo antes posible", acéptalo sin hora fija'
        : "necesitas día y hora concretos");
      out.push({
        id: "programado", campo: "programado", modo,
        texto: texto || "¿Para cuándo lo quieres? Dime el día y la hora ⏰",
        guia: guia || `Averigua para qué día y hora quiere el pedido, en UNA sola pregunta. ${reglas.join("; ")}.`,
      });
    } else if (campo === "reserva") {
      const pide = (p.reserva_pide || {}) as Record<string, unknown>;
      const quiere: string[] = [];
      if (pide.personas !== false) quiere.push("cuántas personas");
      if (pide.fecha    !== false) quiere.push("qué día");
      if (pide.hora     !== false) quiere.push("a qué hora");
      if (pide.zona     === true)  quiere.push("si prefiere alguna zona");
      if (pide.notas    === true)  quiere.push("si es por alguna ocasión especial");
      const maxPer  = p.reserva_max_personas == null ? 12 : Number(p.reserva_max_personas) || 1;
      const minPrep = p.hora_min_prep == null ? 60 : Number(p.hora_min_prep) || 0;
      const diasMax = p.hora_dias_max == null ? 7  : Number(p.hora_dias_max) || 0;
      const reglas: string[] = [];
      if (p.hora_valida_horario !== false) reglas.push("SOLO horas dentro del horario de atención");
      if (minPrep > 0) reglas.push(`con al menos ${minPrep} minutos de anticipación`);
      reglas.push(diasMax > 0 ? `hasta ${diasMax} día(s) adelante` : "solo para hoy");
      reglas.push(`si piden para más de ${maxPer} personas, NO confirmes: di que el restaurante lo revisa y confirma`);
      reglas.push(p.reserva_pendiente !== false
        ? "al final avisa que la reserva queda PENDIENTE de confirmación del restaurante"
        : "al final confirma la reserva");
      out.push({
        id: "reserva", campo: "reserva", modo,
        texto: texto || "¡Con gusto! ¿Para cuántas personas, qué día y a qué hora? 📅",
        guia: guia || `Estás tomando una RESERVA DE MESA, no un pedido de comida. En UNA sola pregunta averigua: ${quiere.join(", ")}. ${reglas.join("; ")}.`,
      });
    } else if (campo === "factura") {
      const pide = (p.factura_pide || {}) as Record<string, unknown>;
      const quiere: string[] = [];
      if (pide.documento !== false) quiere.push("cédula o NIT");
      if (pide.razon     !== false) quiere.push("nombre o razón social");
      if (pide.correo    !== false) quiere.push("correo electrónico");
      if (pide.direccion === true)  quiere.push("dirección fiscal");
      const soloSiPide = p.factura_solo_si_pide !== false;
      out.push({
        id: "factura", campo: "factura", modo,
        texto: texto || (soloSiPide ? "¿Necesitas factura electrónica? 🧾" : "Para tu factura necesito unos datos 🧾"),
        guia: guia || (soloSiPide
          ? `Pregunta si necesita factura electrónica. Si dice que NO, sigue sin insistir. Si dice que sí, pide en UN solo mensaje: ${quiere.join(", ")}.`
          : `Pide en UN solo mensaje: ${quiere.join(", ")}.`),
      });
    } else if (campo === "pago") {
      out.push({ id: "pago", campo: "pago", modo, texto: texto || "¿Cómo nos vas a pagar? ({{metodos_pago}}) ☺️", guia,
                 despues_resumen: p.despues_resumen === true });
    } else if (campo === "nombre") {
      // El canvas MANDA: si el usuario configuró una frase fija para el nombre, se usa esa
      // (puede incluir {{cliente}} para el nombre del contacto). La confirmación automática
      // del nombre de WhatsApp queda solo como comportamiento por defecto (sin frase configurada).
      if (modo === "fija" && texto) {
        out.push({ id: "nombre", campo: "nombre", modo: "fija", texto, guia });
      } else {
        /* El nombre del perfil de WhatsApp no siempre es el nombre de la
           persona: hay perfiles que son un apodo, una empresa o solo emojis.
           El dueño decide si sirve para confirmar o si prefiere preguntar
           siempre. Los clientes ya guardados (recurrentes) no se ven
           afectados: ese nombre lo verificó el restaurante. */
        const usarWa = p.usar_nombre_wa !== false;
        const nombreConfirmarUsable = (usarWa || esRecurrente) ? nombreConfirmar : null;
        const nombreGuia = nombreConfirmarUsable
          ? (esRecurrente
              ? `Cliente recurrente — su nombre guardado es "${nombreConfirmar}". Salúdalo con familiaridad y confirma: "¿Va a nombre de ${nombreConfirmar}?" — si confirma úsalo; si da otro, usa ese.`
              : `El contacto de WhatsApp se llama "${nombreConfirmarUsable}". Confirma si el pedido va a ese nombre: "¿Va a nombre de ${nombreConfirmarUsable}?" — si confirma úsalo; si da otro, usa ese.`)
          : (guia || "Pregunta a nombre de quién se recibe el pedido.");
        out.push({
          id: "nombre", campo: "nombre",
          modo: nombreConfirmarUsable ? "conversacional" : modo,
          texto: nombreConfirmarUsable ? undefined : (texto || "¿A nombre de quién se recibe el pedido? 🍟"),
          guia: nombreGuia,
        });
      }
    }
    // Nodos sin campo de slot (saludo, resumen, inicio, timer) no son pasos de slot-filling → ignorados aquí.

    /* Las opciones comunes se aplican a CUALQUIER caja que se haya agregado en
       esta vuelta, no solo a algunas: si mañana se agrega un tipo de caja
       nuevo, hereda obligatoria/cuando/si_falla sin tocar nada más. */
    for (let k = antes; k < out.length; k++) comunes(out[k], p);
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
    case "preferencias": return state.preferencias || "";
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
      const dp = (!esLlevar && state.direccion) ? lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) : null;
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
  const domiPrecio = (!esLlevar && state.direccion) ? lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) : null;
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
  if (state.producto) allItems.push({ producto: state.producto, tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones, preferencias: state.preferencias });

  const stateLines: string[] = ["PEDIDO EN CURSO:"];
  if (allItems.length === 0) {
    stateLines.push("- Sin producto todavía");
  } else {
    for (const item of allItems) {
      const desc = [item.producto, item.tipo, item.tamano ? `(${item.tamano})` : null].filter(Boolean).join(" ");
      stateLines.push(`✅ ${item.cantidad}x ${desc}${item.adiciones && item.adiciones.length > 0 ? " + " + item.adiciones : item.adiciones === "" ? " (sin adición)" : ""}`);
    }
  }
  /* "Confirmar la cantidad cuando sea más de una" — el interruptor llevaba
     meses en el canvas SIN HACER NADA: el editor lo guardaba y el motor no lo
     leía en ninguna parte. Se enciende y el bot confirma antes de seguir,
     porque un "2" mal entendido cuesta un pedido entero.

     Se le dice "si todavía no lo confirmaste": el modelo ve el historial y no
     lo repite. Un contador aparte volvería a preguntar cada mensaje. */
  const pasoCant = Array.isArray(cfg.flujo_pasos)
    ? (cfg.flujo_pasos as Array<Record<string, unknown>>).find(p => p && p.campo === "producto" && p.activo !== false)
    : null;
  if (pasoCant && pasoCant.confirmar_cantidad === true && !state.resumen_enviado) {
    const varios = allItems.filter(i => Number(i.cantidad) >= 2);
    if (varios.length > 0) {
      const cuales = varios.map(i => `${i.cantidad} ${i.producto}`).join(", ");
      stateLines.push(`⚠️ Entendiste MÁS DE UNA unidad (${cuales}). Si todavía no se lo has confirmado en esta conversación, confírmaselo con naturalidad antes de seguir (ej: "¿son ${varios[0].cantidad} entonces?"). Si ya lo confirmó, sigue normal y NO vuelvas a preguntarlo.`);
    }
  }

  /* UN BARRIO NO ES UNA DIRECCION COMPLETA, y hay que decirselo asi al modelo.
     Cuando el cliente daba "La Paz" y despues "calle 8 # 3-45", el bot leia
     "Direccion: La Paz" y contestaba "ya me diste la direccion" — cuando lo
     que acababa de recibir era justo lo que le faltaba. */
  if (state.direccion) {
    const dirCompleta = analizarDireccion(state.direccion).tieneVia;
    stateLines.push(dirCompleta
      ? `✅ Dirección: ${state.direccion}${state.direccion_heredada ? " (heredada, pendiente confirmar)" : ""}`
      : `⏳ Dirección INCOMPLETA — solo tenemos "${state.direccion}": FALTA la calle o carrera con su número. Si el cliente te la da ahora, agradécela y NUNCA digas que ya te la había dado.`);
  }
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
    // Personalizable por restaurante (multi-tenant): cerrado_conversacional
    // (default true) → respuestas humanas y variadas fuera de horario. Si el
    // restaurante lo pone en false → comportamiento clásico (frase fija tal cual).
    const cerradoConv = (cfg as Record<string, unknown>).cerrado_conversacional !== false;
    if (cerradoConv) {
      // Prompt guiado por INTENCIÓN: GPT decide cómo responder según lo que el
      // cliente QUIERE (preguntar / pedir / saludar / despedirse), no por palabras
      // sueltas. Con temp alta varía naturalmente.
      nextStepLine =
        `ESTADO DEL RESTAURANTE — FUERA DE SERVICIO. Ahora están CERRADOS; hoy abren a las ${horaAperturaHoy}.\n` +
        `REGLA ESTRICTA: NUNCA tomes un pedido ni avances pasos del flujo (nada de tamaños, tipos, direcciones, pagos ni nombres), por más que insista el cliente.\n` +
        `Entiende la INTENCIÓN del cliente y respóndele acorde — SIEMPRE cálido, humano y BREVE (1-2 oraciones), con TUS PROPIAS PALABRAS y variando (nunca repitas una frase que ya enviaste):\n` +
        `• Si PREGUNTA información (precios, carta, ubicación, horarios, si abren cierto día): RESPÓNDELA con exactitud usando el CONTEXTO y los HORARIOS de abajo. Para preguntas de un DÍA específico usa las listas DÍAS CON SERVICIO / DÍAS CERRADOS y responde exacto para ESE día (si ese día está cerrado, dilo claro; NO respondas con el horario de hoy).\n` +
        `• Si quiere HACER UN PEDIDO o que le sirvan ya: dile cálido que ahorita están cerrados y que abren a las ${horaAperturaHoy}, e invítalo a pedir en ese momento.\n` +
        `• Si SALUDA, AGRADECE o se DESPIDE (ej: "gracias, más tarde escribo"): respóndele natural y amable (ej: "¡Con gusto, aquí te esperamos! 😊"), SIN forzar el horario si no viene al caso.\n` +
        `Frase de marca (SOLO referencia de estilo, NO la copies literal): "${estadoFrase}"\n` +
        `Hora actual: ${colTimeStr}, ${colDayStr}.`;
    } else {
      nextStepLine =
        `ESTADO DEL RESTAURANTE — FUERA DE SERVICIO. Frase oficial del estado:\n"${estadoFrase}"\n` +
        `REGLA ESTRICTA: NO tomes pedidos ni avances NINGÚN paso del flujo — nada de preguntar tamaños, tipos, direcciones, pagos ni nombres, sin importar cuánto insista el cliente.\n` +
        `• Si el cliente pregunta INFORMACIÓN (precios, la carta, ubicación, horarios, dudas del CONTEXTO DEL NEGOCIO): RESPONDE la pregunta con normalidad y de forma completa — esa es tu prioridad. No repitas la frase del estado en cada mensaje.\n` +
        `• SOLO si el cliente intenta hacer o continuar un PEDIDO: empieza con la frase oficial del estado (tal cual) y dile cuándo puede pedir.\n` +
        `Hora actual: ${colTimeStr}, ${colDayStr}.`;
    }
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
        // PEDIDO MULTI-PRODUCTO: la pregunta de tamaño/variante debe dejar claro
        // sobre CUÁL producto se pregunta (regla de Sergio: "¿la ranchera la
        // quieres personal o familiar?" — no una pregunta suelta)
        const conProducto = (nextStep.campo === "tamano" || nextStep.campo === "tipo") &&
          state.items.length > 0 && state.producto
          ? `Sobre la *${capFirst(state.producto)}* 👇\n${textoFijo}`
          : textoFijo;
        nextStepLine =
          `PRÓXIMO PASO — obtener: ${nextStep.campo}.\n` +
          `MODO FIJA — REGLA ESTRICTA: Tu respuesta debe ser esta frase EXACTA, palabra por palabra:\n"${conProducto}"\n` +
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
        const notaMulti = (nextStep.campo === "tamano" || nextStep.campo === "tipo") &&
          state.items.length > 0 && state.producto
          ? ` IMPORTANTE: el cliente pidió VARIOS productos — deja claro en tu pregunta que te refieres a "${state.producto}".`
          : "";
        nextStepLine = `PRÓXIMO PASO — obtener: ${nextStep.campo}.\nMODO CONVERSACIONAL: responde al cliente de forma natural. Tu único objetivo en este paso es obtener: ${guiaVars}. No pidas ningún otro dato, no inventes preguntas fuera de ese objetivo.${notaMulti}`;
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

  const sysLines = (!restauranteAbierto ? [
    // FUERA DE HORARIO: prompt LIMPIO, sin las reglas de flujo de pedido (que
    // hacían que el bot respondiera seco "Con mucho gusto"). Solo identidad,
    // tono del restaurante y la tarea de cerrado (definida en nextStepLine).
    `Eres ${botName}, el asistente virtual de este restaurante. Atiendes por WhatsApp.`,
    personalidad || `Tono: ${tonoStr}.`,
    "Nunca menciones que eres IA o un bot. No uses diminutivos.",
    "",
    nextStepLine,
    "",
    "REGLAS:",
    "- Máximo 2 oraciones. Sé cálido, natural y humano, JAMÁS robótico.",
    "- Si preguntan si abren un DÍA específico (¿abren el martes?, ¿el lunes sí atienden?), NO respondas con el horario de HOY. Revisa las listas 'DÍAS CON SERVICIO' y 'DÍAS CERRADOS' del contexto y responde EXACTO para ESE día: si ese día está en DÍAS CERRADOS, dile CLARO que ese día NO hay servicio (jamás digas que sí abren ni 'nos vemos ese día'). Si está abierto, dile el horario de ese día.",
    "- NO repitas una frase que ya hayas enviado antes en esta conversación (mira el historial): varía SIEMPRE el mensaje.",
    "- SEGURIDAD DE PAGOS: NUNCA des por recibido ni confirmado un pago por lo que diga el cliente.",
    senderName && senderName !== "Cliente" ? `- El cliente se llama ${senderName}.` : "",
  ].filter(Boolean) : [
    `Eres ${botName}, el asistente virtual de este restaurante. Atiendes pedidos por WhatsApp.`,
    personalidad || `Tono: ${tonoStr}.`,
    "Nunca menciones que eres IA o un bot. No uses diminutivos.",
    "",
    stateLines.join("\n"),
    "",
    nextStepLine,
    "",
    "REGLAS:",
    /* Caso real: el cliente escribio "una hamburguesa", el bot le mando la
       lista de las cuatro, el cliente volvio a escribir "una hamburguesa" y el
       bot mando LA MISMA LISTA. Repetir lo mismo no es responder: si no
       entendio, hay que preguntar distinto. */
    "- Si ya enviaste una LISTA de opciones y el cliente repite lo mismo sin elegir, NO vuelvas a mandar la lista. Preguntale de otra forma, mas corta y concreta (ej: '¿la quieres sencilla o de carne?'), o sugierele la mas pedida.",
    "- Si el cliente parece confundido o molesto, NO insistas con la misma pregunta: reconocelo en una frase y hazle UNA sola pregunta, la mas simple posible.",
    /* El PEDIDO EN CURSO se arma ANTES de redactar, asi que incluye lo que el
       cliente acaba de escribir. El bot leia "Direccion: calle 8 # 3-45",
       veia que el cliente habia mandado justo eso, y le contestaba "que pena,
       ya me diste la direccion" — cuando se la estaba dando por primera vez. */
    "- Los datos del PEDIDO EN CURSO pueden venir del mensaje que ACABAS de recibir. JAMAS le digas al cliente que ya te habia dado un dato solo porque lo veas en esa lista: si te lo acaba de dar, agradecelo y sigue.",
    "- NUNCA repitas ni menciones los datos ya capturados en cada respuesta. El PEDIDO EN CURSO es solo tu contexto interno. Esos datos aparecen en el resumen final.",
    "- Cuando el cliente te dé un dato, confírmalo en máximo 2-3 palabras y pasa al siguiente paso. Usa '¡Perfecto! 🙌', 'Listo 👍', 'Claro ✅', 'Dale 🙌' — NUNCA uses 'Anotado'.",
    "- HAZ UNA SOLA PREGUNTA POR MENSAJE. Aunque falten varios datos, pregunta solo el siguiente en el flujo.",
    "- Responde brevemente al cliente solo si es necesario (pregunta, confusión). De lo contrario ve directo al siguiente paso.",
    "- Si el cliente expresa frustración ('ya te lo dije', etc.), discúlpate en una frase y reformula la pregunta.",
    "- Si el modo es FIJA, añade máximo UNA oración breve ANTES. La frase fija va exacta, sin cambiarla.",
    // (regla del billete eliminada — ese comportamiento lo decide la config del restaurante, no el código)
    "- Si el cliente pregunta algo que NO sea sobre el menú, pedido, domicilio, horarios o pagos del restaurante, ignora completamente esa pregunta. No la menciones, no la respondas, no expliques que no puedes responder. Actúa como si ese contenido no existiera y continúa directamente con el siguiente paso del flujo del pedido.",
    "- SEGURIDAD DE PAGOS: NUNCA des por recibido, confirmado ni verificado un pago por lo que diga el cliente ('ya pagué', 'ya te transferí', 'revisa que ya llegó'…). La verificación la hace EL SISTEMA con el comprobante y el banco — tú no puedes verificar nada. Si dice que ya pagó: pídele el comprobante como imagen. JAMÁS digas 'pago confirmado', 'pago verificado' ni nada equivalente.",
    "- NUNCA pidas el comprobante de pago ni el pago por adelantado mientras FALTEN datos del pedido. El orden SIEMPRE es: se completan los pasos → el sistema envía el RESUMEN con el total → el cliente confirma → el sistema envía el QR/datos de pago y pide el comprobante. Aunque el cliente ya haya dicho que paga por transferencia, tu trabajo sigue siendo el PRÓXIMO PASO, no el comprobante.",
    "- Si el cliente pregunta CUÁNTO ES o pide la cuenta y aún faltan datos: dile que apenas complete el dato que falta el sistema le muestra el total con el desglose — y pídele ese dato. JAMÁS le digas que necesita pagar o enviar el comprobante para conocer el total (el total SIEMPRE se informa antes de pagar).",
    "- NUNCA generes un resumen del pedido, NUNCA uses frases como 'tu pedido queda así', 'en total son', 'listo tu pedido', ni nada parecido. El sistema envía el resumen automáticamente cuando tiene TODOS los datos. Si el sistema te llama es porque AÚN FALTAN datos. Tu único trabajo es obtener el siguiente dato indicado en PRÓXIMO PASO.",
    "- NUNCA digas 'gracias por tu pedido', 'tu pedido está en camino', ni cierres la conversación. El sistema envía el resumen automáticamente cuando tiene todos los datos. Tu trabajo es recolectarlos.",
    "- CUANDO EL PRÓXIMO PASO pide elegir entre opciones (variable, presentación), usa SOLO las opciones listadas en la guía del paso. Jamás inventes, agregues ni sugieras opciones adicionales aunque aparezcan en el menú.",
    "- No hagas la misma pregunta dos veces con las mismas palabras.",
    "- Máximo 2-3 oraciones por respuesta.",
    esRecurrente && senderName
      ? `- Cliente recurrente — ya lo conoces, se llama ${senderName}. Trátalo con familiaridad, como a alguien que ha pedido antes.`
      : senderName && senderName !== "Cliente" ? `- El cliente se llama ${senderName}.` : "",
  ].filter(Boolean)).filter(Boolean);

  // ── CONTEXTO complementario (Configuración del Asistente) ─────────────────────
  // Conocimiento e identidad — SUBORDINADO al canvas: sirve para responder preguntas
  // y manejar situaciones, pero JAMÁS modifica el flujo, sus pasos ni sus frases.
  const negocioTxt    = String(cfg.negocio || "").trim();
  const faqArr        = (cfg.faq as Array<{ pregunta?: string; respuesta?: string }>) || [];
  const situacionesObj = (cfg.situaciones as Record<string, string>) || {};
  const vocabCfg      = (cfg.vocabulario as { usar?: string[]; evitar?: string }) || {};
  const prohibArr     = (cfg.prohibiciones as string[]) || [];
  /* CONEXIONES — qué información de las otras pestañas ve el asistente.
     Cada fuente se puede desconectar sin borrarla: el dato sigue ahí para el
     resto del sistema, pero el asistente deja de verlo. Sin configuración,
     todo conectado (así se comporta desde siempre). */
  const conex = (cfg.conexiones as Record<string, unknown>) || {};
  const conectado = (k: string): boolean => conex[k] !== false;

  const usarNegocio     = conectado("negocio")      && !!negocioTxt;
  const usarFaq         = conectado("faq")          && faqArr.length > 0;
  const usarSituaciones = conectado("situaciones")  && Object.keys(situacionesObj).length > 0;
  const usarVocabulario = conectado("vocabulario")  && !!(vocabCfg.usar && vocabCfg.usar.length > 0);
  const usarProhibido   = conectado("prohibiciones") && prohibArr.length > 0;

  const hayContexto = usarNegocio || usarFaq || usarSituaciones || usarVocabulario || usarProhibido;
  if (hayContexto) {
    sysLines.push("", "CONTEXTO DEL NEGOCIO — úsalo SOLO para responder preguntas del cliente o manejar situaciones. El flujo del pedido, sus pasos y sus frases los dicta PRÓXIMO PASO — NADA de esta sección los modifica:");
    if (usarNegocio) sysLines.push(`INFO: ${negocioTxt}`);
    const faqLines = faqArr
      .filter(f => f && f.pregunta && f.respuesta)
      .map(f => `- ${f.pregunta} → ${String(f.respuesta)
        .replace(/\{hora_apertura\}/g, horaAperturaHoy || "")
        .replace(/\{hora_cierre\}/g, horaCierreHoy || "")}`);
    if (usarFaq && faqLines.length) sysLines.push("PREGUNTAS FRECUENTES (responde con estas respuestas):", ...faqLines);
    const sitLines = Object.entries(situacionesObj)
      .filter(([, v]) => v)
      .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`);
    if (usarSituaciones && sitLines.length) sysLines.push("SITUACIONES ESPECIALES (cómo actuar):", ...sitLines);
    if (vocabCfg.usar && vocabCfg.usar.length) {
      if (usarVocabulario) sysLines.push(`EXPRESIONES: usa "${vocabCfg.usar.join('", "')}".${vocabCfg.evitar ? ` Evita: ${vocabCfg.evitar}.` : ""}`);
    }
    if (usarProhibido) sysLines.push(`PROHIBIDO: ${prohibArr.join(" · ")}`);
  }

  /* La carta, los horarios, los métodos de pago y las zonas de domicilio salen
     de otras pantallas del sistema. También se pueden desconectar: un
     restaurante puede preferir que el asistente NO hable de precios de
     domicilio, por ejemplo, y lo diga siempre una persona. */
  if (conectado("menu")       && menuText)       sysLines.push("", "MENÚ:", menuText);
  if (conectado("horarios")   && horariosText)   sysLines.push("", horariosText);
  if (conectado("pagos")      && pagosText)      sysLines.push("", pagosText);
  if (conectado("domicilios") && domiciliosText) sysLines.push("", domiciliosText);

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: sysLines.join("\n") },
    // Lo que respondio un HUMANO va marcado. Antes Paco lo leia como suyo y
    // podia contradecir lo que la persona ya le habia prometido al cliente
    // (un precio, una promesa de tiempo). Ahora sabe que eso lo dijo el
    // restaurante y que manda sobre lo suyo.
    ...history.map(h => ({
      role: h.direction === "in" ? "user" : "assistant",
      content: (h.direction !== "in" && h.origen && h.origen !== "bot")
        ? "[Respondido por el restaurante, no por ti — esto manda]: " + h.body
        : h.body,
    })),
    { role: "user", content: clienteTexto },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1200);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: 400, temperature: restauranteAbierto ? 0.3 : 0.9 }),
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
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=name,price,price_mode,presentations,variables,category_id(name)`
    ) as Array<Record<string, unknown>> | null;

    const getPrecioItem = (prod: string|null, tam: string|null, tip: string|null, cant: number, cat?: string|null): number => {
      if (!products || !prod) return 0;
      const matched = matchCatalogo(products, prod, cat);
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
      { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones, preferencias: state.preferencias, categoria: state.producto_categoria },
    ];

    for (const item of allItems) {
      if (!item.producto) continue;
      // Usar nombre canónico del producto desde la DB para evitar que GPT devuelva
      // líneas completas del menú con precios como nombre del producto
      const matchedProd = matchCatalogo(products, item.producto, item.categoria);
      const catMatched = matchedProd
        ? String(((matchedProd.category_id as Record<string, unknown> | null)?.name as string) || item.categoria || "")
        : (item.categoria || "");
      const nombreDisplay = nombreConCategoria(matchedProd ? String(matchedProd.name) : item.producto, catMatched);
      const display = [nombreDisplay, item.tipo].filter(Boolean).join(" ");
      const adStr   = item.adiciones && item.adiciones.length > 0 ? ` + ${item.adiciones}` : "";
      const tamStr  = item.tamano ? ` ${item.tamano}` : "";
      productoLines.push(`🍟 ${item.cantidad}x ${display}${tamStr}${adStr}`);
      // La preferencia va DEBAJO del producto y en el resumen, para que el
      // cliente la vea y la corrija antes de que se prepare mal.
      const prefItem = (item as { preferencias?: string | null }).preferencias;
      if (prefItem) productoLines.push(`   ↳ ${prefItem}`);
      precioProducto += getPrecioItem(item.producto, item.tamano, item.tipo, item.cantidad, item.categoria);
    }
  } catch (err) { console.error("buildSummaryFromState lookup error:", err); }

  const esParaLlevar = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
  const domiPrecio   = (!esParaLlevar && state.direccion) ? lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) : null;

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
        { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones, preferencias: state.preferencias },
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
  // PARA LLEVAR → etiqueta clara en vez de repetir la frase del cliente
  // ("yo paso por ella" NO es una dirección). Configurable: frases.llevar_etiqueta
  const dirResumen = esParaLlevar
    ? (getFraseTexto(frases.llevar_etiqueta) || "Para recoger en el local 🏃")
    : (state.direccion || "");
  let resumenFinal = plantillaExpanded
    .replace(/\{\{productos\}\}/g,       productoLines.join("\n"))
    .replace(/\{\{direccion\}\}/g,       dirResumen)
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

  /* Una variable vacia deja su linea coja: con el pago despues del resumen,
     la plantilla mostraba el icono solo, sin nada al lado. Se borran las
     lineas que quedaron con adorno pero sin texto. Vale para cualquier
     variable, no solo el pago. */
  resumenFinal = resumenFinal.split("\n").filter((l) => {
    const sinAdorno = l
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/[\u2600-\u27BF\uFE0F]/g, "")
      .replace(/[*_~`:-]/g, "")
      .trim();
    // Una linea en blanco a proposito se conserva; solo cae la que trae
    // adorno y ningun texto real.
    return sinAdorno.length > 0 || l.trim().length === 0;
  }).join("\n");

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
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=id,name,price,price_mode,presentations,variables,category_id(name)`
    ) as Array<Record<string, unknown>> | null;
    const allItems: SlotItem[] = [
      ...(state.items || []),
      { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones, preferencias: state.preferencias, categoria: state.producto_categoria },
    ];
    for (const item of allItems) {
      if (!item.producto || !allProducts) continue;
      const matched = matchCatalogo(allProducts, item.producto, item.categoria);
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
  const domi = esLlevar ? 0 : (state.direccion ? lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) : null);
  return { pedido, domi, esLlevar };
}

function buildOrderArgs(state: PacoState, domiPrecio: number): Record<string, unknown> {
  const allItems: SlotItem[] = [
    ...(state.items || []),
    { producto: state.producto || "", tamano: state.tamano, tipo: state.tipo, cantidad: state.cantidad, adiciones: state.adiciones, preferencias: state.preferencias, categoria: state.producto_categoria },
  ];
  return {
    cliente:     state.nombre    || "Cliente WhatsApp",
    direccion:   state.direccion || "",
    pago:        state.pago      || "efectivo",
    mensaje:     "¡Pedido confirmado!",
    domi_precio: domiPrecio,
    productos:   allItems.filter(i => i.producto).map(i => ({
      nombre:    i.producto,
      tamano:    capFirst(i.tamano || ""),
      tipo:      capFirst(i.tipo   || ""),
      cantidad:  i.cantidad,
      categoria: i.categoria || null,
      // Cómo lo quiere preparado. Va como nota del PRODUCTO (no del pedido)
      // para que la comanda de cocina lo muestre pegado a su plato: si va
      // suelta al final, el cocinero no sabe a cuál de los dos aplica.
      notas:     i.preferencias || null,
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
    `&select=id,name,price,price_mode,presentations,variables,category_id(name)`
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
    const matched = matchCatalogo(allProducts, nombreGPT, String(prod.categoria || "") || null);

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
    const displayName = [nombreConCategoria(String(matched.name), String(((matched.category_id as Record<string, unknown> | null)?.name as string) || "")), presName, tipoGPT].filter(Boolean).join(" · ");
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
    await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: msg, delivery_status: "sent", external_id: sentId || null, sent_at: new Date().toISOString() });
  } else {
    console.error("sendWaAndSave error:", await waRes.text());
    // Guardar IGUAL el mensaje (marcado como fallido) — si el envío a WhatsApp
    // falla, el operador debe poder ver en Cobra qué intentó decir el bot
    await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: msg, delivery_status: "failed", external_id: null, sent_at: new Date().toISOString() });
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


/* ══════════════════════════════════════════════════════════════════════
   EL MOTOR DE DIRECCIONES — uno solo, y todos preguntan aqui.

   Antes habia TRES sitios contando numeros con reglas distintas, y una
   direccion buena podia pasar uno y caerse en otro. Probado: "Kra 9 b 63 n 58"
   pasaba el clasificador y el flujo le volvia a pedir la direccion, porque
   "kra" no estaba en la lista de vias.

   Una direccion colombiana completa tiene TRES partes:
     1. la VIA PRINCIPAL  -> "carrera 9 b"   (tipo + numero + letra opcional)
     2. el CRUCE          -> "63"            (la via que cruza)
     3. la PLACA          -> "58"            (el numero de la casa)

   Se acepta escrita como sea: con #, con "no."/"nro."/"numero", con guion,
   con la "n" de "n 58", con puntos, con saltos de linea o sin nada.
   ══════════════════════════════════════════════════════════════════════ */
const VIA_TIPOS = "calle|cll|cl|carrera|cra|cr|kra|kr|k|avenida|avda|av|diagonal|diag|dg|transversal|trasversal|trans|tv|tr|circunvalar|circular|autopista|auto|manzana|mz|via";
const VIA_RE = new RegExp("\\b(" + VIA_TIPOS + ")\\b\\.?\\s*(\\d+)\\s*([a-z]{0,2})\\b", "i");

interface DireccionPartes {
  tieneVia: boolean;    // "carrera 9"
  viaTexto: string;     // lo que se reconocio como via
  cruce: string | null; // "63"
  placa: string | null; // "58"
  completa: boolean;    // las tres partes
}

function analizarDireccion(direccion: string): DireccionPartes {
  const dir = (direccion || "").toLowerCase().replace(/\s+/g, " ").trim();
  const m = dir.match(VIA_RE);
  if (!m) return { tieneVia: false, viaTexto: "", cruce: null, placa: null, completa: false };

  /* Los numeros que vienen DESPUES de la via son el cruce y la placa. Se
     cuentan por posicion, no por el separador: la gente escribe "# 63-25",
     "63 n 58", "63-25" o "63 58" y todas significan lo mismo. */
  const resto = dir.slice((m.index || 0) + m[0].length);
  const nums = resto.match(/\d+/g) || [];

  return {
    tieneVia: true,
    viaTexto: m[0],
    cruce: nums[0] || null,
    placa: nums[1] || null,
    completa: nums.length >= 2,
  };
}

/* Que le falta, para poder decirselo al cliente en vez de repetir
   "necesito la direccion completa". */
function faltaDeDireccion(direccion: string): "via" | "cruce" | "placa" | null {
  const p = analizarDireccion(direccion);
  if (!p.tieneVia) return "via";
  if (!p.cruce) return "cruce";
  if (!p.placa) return "placa";
  return null;
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
    /* CONJUNTO CERRADO: no se le exige calle ni numero. Solo hace falta la
       UNIDAD (torre, apto, casa, bloque): el nombre solo deja al domiciliario
       en la porteria sin saber a donde subir. */
    if (esConjunto(dir, domicilios)) {
      const daUnidad = /\b(torre|bloque|bl|interior|int|apto|apartamento|apart|casa|piso)\b\s*\.?\s*[a-z0-9]/i.test(dir);
      return daUnidad
        ? { tipo: "residencial", requierePagoAdelantado: false }
        : { tipo: "incompleta",  requierePagoAdelantado: false };
    }

    const partes = analizarDireccion(dir);
    if (partes.tieneVia && !partes.completa) return { tipo: "incompleta", requierePagoAdelantado: false };
  }
  return { tipo: "residencial", requierePagoAdelantado: false };
}

/* DONDE VA EL PEDIDO, completo: el barrio y la direccion juntos.
   El barrio vive en su propia casilla desde que dejo de ser un parche, y el
   precio del domicilio se seguia buscando SOLO en la direccion: en cuanto el
   cliente daba la calle, el barrio quedaba fuera y el precio se perdia. */
function ubicacionPedido(state: PacoState): string {
  return [state.barrio, state.direccion].filter(Boolean).join(" ").trim();
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
  // Listas EXPLÍCITAS para que la IA no invente resúmenes tipo "de X a Y"
  // (bug real: martes y miércoles cerrados → la IA dijo "abrimos de miércoles a domingo")
  const diasAbiertos = DAYS.filter(([k]) => {
    const d = horarios[k] as Record<string,unknown> | undefined;
    return d && d.activo;
  }).map(([,l]) => l);
  const diasCerrados = DAYS.filter(([k]) => {
    const d = horarios[k] as Record<string,unknown> | undefined;
    return !d || !d.activo;
  }).map(([,l]) => l);
  lines.push("");
  lines.push(`DÍAS CON SERVICIO: ${diasAbiertos.join(", ") || "ninguno"}.`);
  lines.push(`DÍAS CERRADOS: ${diasCerrados.join(", ") || "ninguno"}.`);
  lines.push(`REGLA ESTRICTA: al responder sobre días u horarios, usa EXACTAMENTE las dos listas de arriba, nombrando los días uno por uno. PROHIBIDO resumir con rangos tipo "de miércoles a domingo" — puede haber días cerrados en medio.`);
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

/* Saca el barrio de un texto, PERO solo si es uno de los configurados.
   Esa es toda la diferencia: antes cualquier texto corto pasaba como barrio y
   por eso "A nombre de Sergio" terminaba pegado a la direccion. */
function extraerBarrio(
  text: string,
  domicilios: Record<string, unknown> | null | undefined,
): string | null {
  if (!domicilios || !text) return null;
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; conjuntos?: string[] }>) || [];
  let mejor: string | null = null;
  for (const z of zonas) {
    /* Los conjuntos entran por la misma puerta: para el precio del domicilio
       son un barrio mas de su zona. Lo que cambia es que despues NO se les
       pide calle ni numero. */
    const barrios = (z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []))
      .concat(z.conjuntos || []);
    for (const b of barrios) {
      if (!b) continue;
      /* Se queda con el nombre MAS LARGO que case: "Bella Vista" antes que
         "Bella", para no cobrar la zona equivocada. */
      if (fuzzyBarrioMatch(text, b) && (!mejor || b.length > mejor.length)) mejor = b;
    }
  }
  return mejor;
}

/* Es un conjunto cerrado de los que el restaurante tiene registrados?
   A un conjunto no se le pide calle ni numero: con el nombre y la unidad
   (torre, apto, casa) el domiciliario llega. */
/* Suena a conjunto cerrado, aunque no este en la lista?
   Estas palabras NO sirven para decidir un precio —por eso no se usan para
   aceptar la direccion— pero si para saber que hay que preguntarle a un
   humano en vez de exigirle una calle que no existe. */
const CONJUNTO_PALABRAS = /\b(conjunto|urbanizacion|urbanización|condominio|torres?|edificio|multifamiliar|agrupacion|agrupación|ciudadela|bloque|apto|apartamento)\b/i;

/* Deja el conjunto propuesto para que el dueño lo apruebe desde
   Configuracion -> Domicilios. Reusa `pos_domi_aprendidos`, que ya es el sitio
   donde caen los lugares que el sistema no conocia. */
async function proponerConjunto(
  tenantId: string, branchId: string, nombre: string, direccion: string,
): Promise<void> {
  try {
    const yaVa = await sbGet(
      `/rest/v1/pos_domi_aprendidos?tenant_id=eq.${tenantId}&barrio=eq.${encodeURIComponent(nombre)}&select=id,veces&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (yaVa && yaVa.length) {
      /* Ya estaba propuesto: se cuenta otra vez. Cuantas mas veces lo pidan,
         mas claro esta que hay que agregarlo. */
      await sbPatch(`/rest/v1/pos_domi_aprendidos?id=eq.${yaVa[0].id}`, {
        veces: (Number(yaVa[0].veces) || 1) + 1,
        direccion: direccion,
        updated_at: new Date().toISOString(),
      });
      return;
    }
    await sbPost(`/rest/v1/pos_domi_aprendidos`, {
      tenant_id: tenantId, branch_id: branchId,
      barrio: nombre, direccion: direccion, veces: 1, tipo: "conjunto",
      /* precio 0 = todavia no tiene. Es obligatorio en la tabla, y ponerlo en
         cero deja claro que falta que el dueño le asigne su zona. */
      precio: 0,
    });
  } catch (err) {
    console.error("proponerConjunto:", err);
  }
}

function sueneAConjunto(text: string): boolean {
  return CONJUNTO_PALABRAS.test(text || "");
}

function esConjunto(
  text: string,
  domicilios: Record<string, unknown> | null | undefined,
): string | null {
  if (!domicilios || !text) return null;
  const zonas = (domicilios.zonas as Array<{ conjuntos?: string[] }>) || [];
  for (const z of zonas) {
    for (const c of (z.conjuntos || [])) {
      if (c && fuzzyBarrioMatch(text, c)) return c;
    }
  }
  return null;
}

function fuzzyBarrioMatch(direccion: string, barrio: string): boolean {
  const dirNorm = normalizarTexto(direccion);
  const barNorm = normalizarTexto(barrio);
  if (!dirNorm || !barNorm) return false;

  // 1) El nombre aparece tal cual. Este camino nunca fallo y se conserva.
  if (dirNorm.includes(barNorm)) return true;
  const dirSinEsp = dirNorm.replace(/[ ]/g, "");
  const barSinEsp = barNorm.replace(/[ ]/g, "");
  if (dirSinEsp.includes(barSinEsp)) return true;

  // 2) Palabras de relleno de una direccion: aparecen en casi todas y no
  //    pueden ser las que hagan coincidir un barrio. Sin esto, "Catay"
  //    coincidia con el "casa" de "Monteluna casa 45".
  const RELLENO: Record<string, boolean> = {
    calle: true, carrera: true, cra: true, kra: true, cr: true, kr: true,
    avenida: true, av: true, transversal: true, diagonal: true, via: true,
    casa: true, apto: true, apartamento: true, torre: true, bloque: true,
    manzana: true, mz: true, lote: true, piso: true, interior: true,
    barrio: true, conjunto: true, edificio: true, urbanizacion: true,
    norte: true, sur: true, este: true, oeste: true, numero: true, no: true,
  };

  const dirWords = dirNorm.split(" ").filter(w => w && !RELLENO[w] && !/^[0-9#-]+$/.test(w));
  const barWords = barNorm.split(" ").filter(Boolean);
  if (!dirWords.length || !barWords.length) return false;

  // 3) Un barrio de UNA palabra corta exige coincidencia exacta: con "Catay"
  //    o "Toez" cualquier tolerancia produce falsos.
  if (barWords.length === 1 && barSinEsp.length <= 6) {
    return dirWords.includes(barNorm);
  }

  // 4) Tolerancia estricta: 1 letra en palabras cortas, 2 solo en largas.
  //    Antes una palabra de 5 letras admitia 2 cambios (40% de la palabra) y
  //    por eso "calle" pasaba por "bella".
  const cerca = (a: string, b: string): boolean => {
    if (a === b) return true;
    const maxDist = b.length >= 8 ? 2 : 1;
    return levenshtein(a, b) <= maxDist;
  };

  // Cada palabra del barrio debe encontrar SU propia palabra en la direccion:
  // dos palabras del barrio no pueden apoyarse en la misma.
  const usadas: Record<number, boolean> = {};
  const todasCoinciden = barWords.every(bw => {
    if (bw.length <= 2) {
      const i = dirWords.findIndex((dw, k) => !usadas[k] && dw === bw);
      if (i < 0) return false;
      usadas[i] = true;
      return true;
    }
    const i = dirWords.findIndex((dw, k) => !usadas[k] && cerca(dw, bw));
    if (i < 0) return false;
    usadas[i] = true;
    return true;
  });
  if (todasCoinciden) return true;

  // 5) Nombre largo escrito de corrido o con erratas ("bellohorizonte").
  //    Se mantiene, pero mas estricto: 1 error cada 10 letras.
  if (barSinEsp.length >= 10) {
    const L = barSinEsp.length;
    const maxDist = Math.floor(L / 10);
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

/* CREAR LA RESERVA.
   El motor NO crea pedidos —los junta y alguien los crea desde la bandeja—
   pero la reserva SI la crea el, porque el sitio donde se trabaja una reserva
   es la pantalla de Reservas y ahi tiene que aparecer.

   Nace en 'pendiente' a proposito: hacerla efectiva, sentarla, aplazarla o
   cancelarla son SIEMPRE botones manuales. El bot nunca ocupa una mesa solo.

   Devuelve el id, o null si no se pudo (y entonces no se le miente al cliente
   diciendo que quedo hecha). */
async function crearReserva(
  tenantId: string, branchId: string, telefono: string,
  nombre: string | null, datos: Record<string, string>, pendiente: boolean,
): Promise<string | null> {
  try {
    const cuando = datos.cuando_iso || null;
    const personas = parseInt(String(datos.personas || "0"), 10);
    const notas: string[] = [];
    if (datos.zona)  notas.push(`Zona: ${datos.zona}`);
    if (datos.notas) notas.push(datos.notas);
    if (!cuando) notas.push(`Para: ${datos.cuando || "(sin fecha entendida)"}`);
    const fila: Record<string, unknown> = {
      tenant_id: tenantId,
      branch_id: branchId,
      customer_name: nombre || "Cliente WhatsApp",
      customer_phone: telefono,
      party_size: personas > 0 ? personas : null,
      reserved_at: cuando,
      notes: notas.length ? notas.join(" · ") : null,
      status: pendiente ? "pendiente" : "confirmada",
      origen: "whatsapp",
      created_by: "asistente",
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pos_reservations`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
                 "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify(fila),
    });
    if (!r.ok) { console.error("[reserva] no se pudo crear:", await r.text()); return null; }
    const out = await r.json() as Array<Record<string, unknown>>;
    return out && out[0] ? String(out[0].id) : null;
  } catch (e) {
    console.error("[reserva] error creando:", e);
    return null;
  }
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
