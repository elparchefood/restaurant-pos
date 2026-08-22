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
  /* EL TELEFONO, SOLO EN INSTAGRAM Y MESSENGER (22-ago-2026). En WhatsApp el
     numero ES la conversacion y nunca hace falta pedirlo; en las redes lo
     unico que llega es un id de Meta, y sin telefono no hay cliente al que
     pegarle el pedido, los puntos ni el saldo. null = sin preguntar. */
  telefono:           string | null;
  /* La adicion que hay que cobrar aparte, mientras se procesa. Se limpia en
     cuanto entra a la cola: es un recado, no un dato del pedido. */
  adicion_suelta?: { nombre: string; tamano: string; cat: string } | null;
  /* Por donde llego esta conversacion. Lo pone el motor al arrancar; sirve
     para que los pasos sepan si estan en WhatsApp o en una red. */
  canal?:             string;
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
  /* LA COLA (18-ago): los demas platos de un MISMO mensaje. "salchipapa,
     coca cola y salsa" traia tres y el estado solo guardaba uno — los otros
     dos desaparecian (Mariam, $28.000 en vez de $33.000; el pedido fantasma
     de Shirley). El primero sigue el camino de siempre; estos esperan aqui y
     se promueven cuando el de en curso termina sus preguntas. `texto` guarda
     el mensaje original para resolverles tamano y variante. */
  cola?:              Array<{ nombre: string; cat: string; texto: string }>;
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
    adiciones: null, upsell: null, preferencias: null, direccion: null, barrio: null, pago: null, nombre: null, telefono: null, tipos: {},
    factura: null, programado: null, reserva: null,
    items: [], cola: [], resumen_enviado: false, direccion_heredada: false, complemento_dir_pendiente: null,
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

/* ¿El cliente esta confirmando? Se compara SIN TILDES: la lista dice
   "está bien" y en WhatsApp nadie escribe la tilde. Un "esta bien" no
   reconocido dejaba el pedido colgado justo en el ultimo paso. */
const CONFIRM_NORM = CONFIRM_WORDS.map(w => normalizarTexto(w));
/* MANDA EL SIGNIFICADO. La lista nunca va a cubrir como habla la gente:
   "listo pues", "de una", "hagale", "sisas", "eso mismo", "tal cual" — todas
   confirman y ninguna estaba. Quitarle las tildes tapaba UNA forma de fallar,
   no las demas. La lista queda de respaldo para cuando el modelo falle. */
function esConfirmacion(texto: string, intenciones: Record<string, unknown> = {}): boolean {
  if (intenciones.confirma === true) return true;
  const t = normalizarTexto(texto);
  if (!t || t.length > 80) return false;
  return CONFIRM_NORM.some(w =>
    t === w || t.startsWith(w + " ") || t.endsWith(" " + w) || t.includes(" " + w + " "));
}
/* Para los sitios que solo quieren saber si el mensaje ES la palabra suelta. */
function esSoloConfirmacion(texto: string): boolean {
  return CONFIRM_NORM.includes(normalizarTexto(texto));
}

const RECHAZO_UPSELL_WORDS = [
  "no quiero","no gracias","así está","nada más","solo eso",
  "sin adicional","sin adicion","no, gracias","no quiero nada",
  "está bien así","no, así está","no quiero nada más",
  "no adicional","sin nada más","solo con eso","así va bien",
  /* Caso real (Kevin, 17-ago): escribio "AHI esta bien" — con ahi, no asi. Es
     error de dedo comunisimo y la lista no lo conocia: el upsell quedo sin
     cerrar, el turno cayo al modelo y el modelo PROMETIO un resumen que nunca
     llego. Estas formas genericas son seguras porque esta lista solo se
     consulta CUANDO el paso actual es el upsell (isCurrentStep): ahi, "esta
     bien" solo puede significar "no quiero nada mas". */
  "ahi esta bien","ahi esta","esta bien","está bien","todo bien",
  "asi esta bien","ya esta","ya con eso","con eso esta bien","dejalo asi",
];

// Palabras GENÉRICAS de adición (mecánica general, sirven a cualquier restaurante).
// Los nombres de productos concretos se cargan del CATÁLOGO de cada restaurante:
// las categorías cuyo nombre suene a adición/bebida/extra alimentan DYN_ADICION_KEYWORDS
// y TODOS los productos/categorías alimentan DYN_PROD_NAMES (detección de intención).
/* "No quiero nada mas". Igual que confirmar: manda el significado y la lista
   respalda. La lista traia "así está", "nada más", "está bien así" CON TILDE
   y se comparaba contra el texto crudo — o sea que en WhatsApp no acertaba
   casi nunca. */
const RECHAZO_NORM = RECHAZO_UPSELL_WORDS.map(w => normalizarTexto(w));
function esRechazoDeMas(texto: string, intenciones: Record<string, unknown> = {}): boolean {
  if (intenciones.rechaza_mas === true) return true;
  const t = normalizarTexto(texto);
  if (!t) return false;
  return RECHAZO_NORM.some(w => t.includes(w));
}

const ADICION_BASE = [
  "adicion","adicional","agregar","añadir","con","extra",
  "bebida","gaseosa","jugo","agua",
];
// Palabras genéricas que por sí solas NO bastan para dar por hecha una adición
const ADICION_GENERICAS = ["con","adicion","adicional","agregar","añadir","extra","bebida"];
let DYN_ADICION_KEYWORDS: string[] = [];   // nombres de productos de categorías de adiciones/bebidas
/* Los nombres de TODAS las adiciones de los grupos de modificadores del
   restaurante. Es donde viven de verdad, con su precio y separadas por
   tamaño. Sin esto, "con ranchera" abria la salchipapa Ranchera. */
let DYN_MOD_NAMES: string[] = [];
let DYN_PROD_NAMES: string[] = [];         // nombres (normalizados) de productos y categorías del catálogo
let DYN_PRODUCT_FULL: string[] = [];       // nombres COMPLETOS de productos (validación de extractProducto)
let DYN_CATEGORY_NAMES: string[] = [];     // nombres de categorías (una categoría NO es un producto)
// Mapa producto→categoría(s): motor de DESAMBIGUACIÓN cuando el mismo nombre
// existe en varias categorías (Especial de hamburguesa/perro/sandwich...)
/* Cada fila lleva TAMBIEN sus presentaciones y variantes: son lo que permite
   distinguir dos productos que se llaman igual en categorias distintas. */
let DYN_PROD_MAP: Array<{ key: string; name: string; cat: string; opciones: string[] }> = [];

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
  /* EN PLURAL TAMBIEN (19-ago, hallado en las pruebas). "dos salchipapas
     MIXTAS familiares y una hit personal" salia con la HIT sola: las dos
     salchipapas de $49.000 **desaparecian del pedido**.

     El motivo: "mixtas" no casa con "mixta", asi que el buscador exacto no vio
     la salchipapa — pero SI vio la "hit". Y como algo encontro, el respaldo
     que si entiende plurales (el modelo) ya no corria. Pedirlo solo funcionaba
     justamente porque no encontraba nada y entraba el respaldo.

     El arreglo de una letra que hay abajo tampoco alcanzaba: pide nombres de
     6 letras o mas y "mixta" tiene 5. Aqui va la forma plural completa, que es
     exacta y no adivina nada. */
  for (const e of DYN_PROD_MAP) {
    let idx = t.indexOf(" " + e.key + " ");
    if (idx < 0) idx = t.indexOf(" " + e.key + "s ");
    if (idx < 0) idx = t.indexOf(" " + e.key + "es ");
    if (idx >= 0) found.push({ name: e.name, cat: e.cat, pos: idx });
  }
  /* UNA LETRA DE ERROR NO CAMBIA EL PLATO (18-ago). Shirley escribio "premiun
     mixta personal": "premiun" no casaba con nada y "mixta" si — asi que Paco
     entendio salchipapa Mixta ($26.000) en vez de Premium mixta ($34.000), y
     de ahi salio todo el enredo de correcciones de esa conversacion.
     Se tolera UNA letra (cambiada, sobrante o faltante), con cautelas:
       · solo nombres de 6+ letras — con menos, una letra es media palabra
         ("polo"/"pollo" queda fuera a proposito);
       · nunca sobre una palabra que YA es otro producto exacto ("mixta" jamas
         se convierte en otra cosa);
       · el hallazgo exacto manda: esto solo AGREGA lo que el exacto no vio. */
  {
    const palabras = t.trim().split(" ").filter(Boolean);
    for (const e of DYN_PROD_MAP) {
      if (found.some(f => f.name === e.name)) continue;
      const kWords = e.key.split(" ");
      if (kWords.length > 2) continue;
      const kJoin = e.key.replace(/ /g, "");
      if (kJoin.length < 6) continue;
      for (let i = 0; i + kWords.length <= palabras.length; i++) {
        const winArr = palabras.slice(i, i + kWords.length);
        const win = winArr.join("");
        if (Math.abs(win.length - kJoin.length) > 1) continue;
        if (win === kJoin) break;                       // el exacto ya lo vio
        if (winArr.some(w => DYN_PROD_MAP.some(o => o.key === w))) continue;
        if (levenshtein(win, kJoin) === 1) {
          const pos = t.indexOf(" " + winArr[0]);
          found.push({ name: e.name, cat: e.cat, pos: pos >= 0 ? pos : 0 });
          break;
        }
      }
    }
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

/* EL NOMBRE QUE SE IMPRIME EN LA COMANDA — y tiene que ser IDENTICO al que arma
   la caja cuando el pedido se toma a mano.

   NO es el mismo que se le manda al cliente por WhatsApp. Ahi conviene decir
   "Salchipapa Premium", porque el cliente no se sabe el menu de memoria. En la
   comanda estorba: la cocina lee de un vistazo y lo que necesita primero es el
   TAMAÑO. La caja siempre imprimio "Familiar · Premium · Mixta" y los pedidos
   de Paco salian "Salchipapa Premium · Familiar · Mixta" — dos formatos en la
   misma pila de comandas, que es justo lo que hace equivocarse a las 8 pm.

   La formula es la de `domicilios.js` y `chat-ia.js`, copiada a proposito:
   presentacion primero; si el producto no tiene presentacion con nombre, el
   alias de comanda de la categoria (o su nombre); despues el producto y las
   variantes. */
function nombreComanda(
  prodName: string,
  presName: string | null | undefined,
  varName: string | null | undefined,
  cat: Record<string, unknown> | null | undefined,
): string {
  const alias = cat ? String(cat.comanda_alias || cat.name || "") : "";
  const etiqueta = String(presName || "") || alias;
  return [etiqueta, prodName, varName || ""].filter(Boolean).join(" · ");
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
  const catDe = (p: Record<string, unknown>): string =>
    String(((p.category_id as Record<string, unknown> | null)?.name as string) || (p.cat as string) || "");
  let pool = candidatas;
  /* (a) La categoria entendida manda — TOLERANTE. Era igualdad exacta:
     "salchipapa" nunca casaba con "Salchipapas Tradicionales", el desempate
     caia al primero de la lista y el "Pollo" de ADICIONES ($9.000) le gano a
     la salchipapa de pollo ($17.000) en un pedido real (Emily, 15-ago). */
  if (categoria && pool.length > 1) {
    const catNorm = normalizarTexto(categoria);
    const porCat = pool.filter(p => {
      const cn = catDe(p);
      return normalizarTexto(cn) === catNorm
        || !!categoriaMencionada(catNorm, [cn])
        || !!categoriaMencionada(cn, [catNorm]);
    });
    if (porCat.length) pool = porCat;
  }
  /* (b) El tipo de comida dicho DENTRO del nombre tambien decide:
     "salchipapa de pollo" es de la categoria de salchipapas. */
  if (pool.length > 1) {
    const porNombre = pool.filter(p => !!categoriaMencionada(norm, [catDe(p)]));
    if (porNombre.length) pool = porNombre;
  }
  /* (c) Un producto de la categoria de adiciones NUNCA le gana al plato,
     salvo que el cliente haya dicho "adicion". */
  if (pool.length > 1 && !/adici/.test(norm)) {
    const noAdic = pool.filter(p => !/adicion|extra|salsa/i.test(normalizarTexto(catDe(p))));
    if (noAdic.length) pool = noAdic;
  }
  const exacta = pool.find(p => normalizarTexto(String(p.name || "")) === norm);
  return exacta || pool[0];
}
function getAdicionKeywords(): string[] { return [...ADICION_BASE, ...DYN_ADICION_KEYWORDS]; }

/* Lo que devuelve el respaldo GPT tiene que estar EN LO QUE EL CLIENTE ESCRIBIO.

   "me das porfavor una salchipapa" -> el modelo contestaba "Papas", porque una
   salchipapa lleva papas. Y "Papas" existe de verdad en la categoria Adiciones,
   asi que el filtro del catalogo lo dejaba pasar: el pedido arrancaba con unas
   papas de $8.000, y como ya habia producto, el bloque que manda la carta
   (14f) ni siquiera se evaluaba. El cliente terminaba recibiendo una lista de
   platos improvisada, distinta cada vez.

   Se compara palabra por palabra y se tolera el error de dedo —esa es la razon
   de ser del respaldo: "qeso" sigue llegando a "Queso"— pero no se acepta una
   palabra que el cliente no escribio. */
function nombreEstaEnElTexto(nombre: string, texto: string): boolean {
  const dichas = normalizarTexto(texto).split(/\s+/).filter(Boolean);
  const suyas  = normalizarTexto(nombre).split(/\s+/).filter(w => w.length >= 3);
  if (!suyas.length || !dichas.length) return false;
  return suyas.some(w => dichas.some(d => {
    if (d === w) return true;
    /* Singular/plural y nombres pegados ("cocacola" trae "coca"). */
    if (w.length >= 4 && (d.startsWith(w) || w.startsWith(d))) return true;
    if (w.length >= 4 && d.length >= 4) {
      const maxDist = Math.floor(Math.min(d.length, w.length) / 4);
      return maxDist > 0 && levenshtein(d, w) <= maxDist;
    }
    return false;
  }));
}
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
/* Las piezas van en una LISTA y no en una linea de 900 caracteres, que es como
   estaba. Con una sola linea nadie ve que falta: el 16-ago dos clientes dijeron
   que recogian y Paco les siguio pidiendo la direccion, porque solo se habian
   contemplado los verbos CONJUGADOS ("paso", "recojo") y la gente usa el
   INFINITIVO ("¿puedo PASAR por ella?", "para PASAR A RECOGERLO").

   Cada renglon lleva el ejemplo real que lo justifica. Antes de agregar uno
   nuevo, correr el banco de casos: lo peligroso aqui NO es que falte una
   forma —eso se ve y se corrige— sino que sobre y convierta en "recoger" un
   pedido que era a domicilio, que se descubre cuando el cliente reclama que
   nunca le llego. */
const LLEVAR_PARTES = [
  // Lo dicho de frente.
  "para\\s+(?:llevar|recoger|recojer)",            // "para llevar"
  "pa\\s+llevar",
  "sin\\s+domicilio",                              // "Sin domicilio"
  "no\\s+(?:es|va|seria|será|sera)\\s+(?:a\\s+|para\\s+|con\\s+)?domicilio",
  "no\\s+(?:necesito|necesitamos|quiero|queremos)\\s+domicilio",

  // El verbo CONJUGADO, primera persona del singular y del plural.
  "l[oa]s?\\s+recoj(?:o|emos)",                    // "la recojo"
  "l[oa]s?\\s+busc(?:o|amos)",
  "recog(?:o|emos)\\s+en\\s+el\\s+local",
  "lo\\s+recogemos",
  "nos\\s+l[oa]\\s+llevamos",
  "(?:yo|nosotros)\\s+pas(?:o|amos)",              // "nosotros pasamos"
  "(?:voy|vamos)\\s+a\\s+(?:recoger|recojer|reclamar|buscar)(?:l[oa]s?)?",
  "pas(?:o|amos)\\s+a\\s+(?:recoger|recojer|reclamar|buscar)(?:l[oa]s?)?",
  "pas(?:o|amos)\\s+al\\s+local",
  "(?:voy|vamos|pas(?:o|amos))\\s+por\\s+(?:el\\s+pedido|mi\\s+pedido|[ée]l|ella|ellas|ellos|eso|la\\s+comida|all[aá]|all[ií])",

  /* EL INFINITIVO — lo que faltaba. Casi siempre viene detras de un "puedo",
     un "quiero" o un "para". */
  "(?:pasar|ir)\\s+a\\s+(?:recoger|recojer|reclamar|buscar)(?:l[oa]s?)?",
  "(?:pasar|ir)\\s+por\\s+(?:el\\s+pedido|mi\\s+pedido|[ée]l|ella|ellas|ellos|eso|la\\s+comida|all[aá]|all[ií])",
  "pasar\\s+al\\s+local",
  "a\\s+(?:recoger|recojer)(?:l[oa]s?)?",          // "voy a recogerlo", "a recoger"
  /* "puedo recogerlo", "quiero pasar".

     OJO CON `reclamar`: en este negocio tambien es de los PUNTOS ("quiero
     reclamar mi premio", "¿que puedo reclamar con mis puntos?"). Lo probe
     suelto y marcaba esas frases como recoger — o sea que a un cliente que
     pedia A DOMICILIO se le habria caido el domicilio por preguntar por sus
     premios, y se queda esperando una comida que nadie va a llevar.

     Por eso `reclamar` solo cuenta pegado a un verbo de MOVERSE ("paso a
     reclamarlo") o nombrando el pedido ("reclamar mi pedido"), nunca solo.
     Se pierde "¿a que horas lo puedo reclamar?", que es ambiguo de verdad —
     preferible perder ese a convertir un domicilio en recoger. */
  "(?:puedo|podemos|puede|podria|podría|quiero|queremos|quisiera)\\s+(?:pasar|ir|recoger|recojer|buscar)",
  "l[oa]s?\\s+(?:puedo|podemos|puede)\\s+(?:recoger|recojer|buscar)",
  "(?:recoger|recojer|buscar)(?:l[oa]s?)\\b",      // "recogerlo", "buscarla"
  "reclamar\\s+(?:el|mi)\\s+pedido",

  /* EL GERUNDIO — lo que faltaba esta vez (18-ago). Sandra escribio "Pra pasar
     recogiendo" y Paco le siguio pidiendo la direccion. Ninguna de las formas
     de arriba lo cubria: no es "para recoger" (dice "pasar"), no es "pasar A
     recoger" (le falta el "a"), y el verbo va en gerundio.
     Se ata a un verbo de MOVERSE, igual que se hizo con "reclamar": asi
     "recogiendo" suelto —que tambien aparece en frases de puntos— no le tumba
     el domicilio a nadie.
     El typo de "para" ("pra", "pa") queda cubierto solo, porque el patron
     empieza en el verbo y no en la preposicion. */
  "(?:pasar|paso|pasamos|pasa|voy|vamos|ir|iremos)\\s+recogiend[oa]",
  "recogiend[oa]\\s+(?:el|mi|la)\\s+(?:pedido|comida|orden)",
].join("|");

// Cubre masculino/femenino/plural y conjugado/infinitivo.
/* CORRECCION (18-ago, tarea 0c). El respaldo determinista para cuando el
   clasificador no alcance: marcadores inequivocos de "me corrijo". "Es la X"
   solo cuenta si NO es pregunta — "¿es la que lleva queso?" pregunta, no
   corrige. La decision final es modelo-primero: intenciones.corrige. */
const CORRIGE_RE = /(corrijo|correccion|me equivoque|me equivoqu[eé]|quise decir|mejor solo|solo seria|solo ser[ií]a|asi no era|as[ií] no era|no era es[ea])/i;
const CORRIGE_ES_LA_RE = /^\s*(no[,.]?\s*)?(es|era)\s+(la|el|una|un)\s+/i;

const LLEVAR_REGEX = new RegExp("\\b(?:" + LLEVAR_PARTES + ")\\b", "i");

// Nuevo producto adicional — expandido para capturar más patrones naturales
/* ¿Este mensaje nombra un producto de la carta que NO es el que ya está en
   curso? Se mira el catálogo en vez de adivinar por la forma de la frase.

   La lista de frases escritas a mano se quedaba corta a cada rato: "y me das
   una super queso" la detectaba y "y tambien me das una super queso" no. Cada
   forma nueva de decirlo era una línea más en una expresión que ya nadie podía
   leer. Preguntarle al catálogo no se queda corto nunca.

   Lo delicado es al revés: hay opciones que TAMBIÉN son productos. "Mixta" es
   una variante de la Premium y a la vez una salchipapa de la carta. Si el
   cliente está contestando "¿mixta, de carne o de pollo?", esa palabra es la
   respuesta a la pregunta, no un pedido nuevo — así que se descartan las que
   coincidan con una opción del producto en curso. */
function productosNuevosEnTexto(
  texto: string,
  state: PacoState,
  productData: ProductData | null,
  intenciones: Record<string, unknown> = {},
): Array<{ name: string; cat: string; pos: number }> {
  /* Solo lo que el clasificador llamó PLATO. Un "con super queso" nombra un
     producto de la carta pero no lo está pidiendo: lo está agregando. */
  const matches = mencionesClasificadas(texto, false, intenciones).filter(m => m.clase === "plato");
  if (!matches.length) return [];

  const actual = state.producto ? normalizarTexto(state.producto) : "";
  const yaPedidos = new Set((state.items || []).map(i => normalizarTexto(i.producto || "")));

  /* Las opciones del producto en curso: presentaciones y variantes. */
  const opciones = new Set<string>();
  if (productData) {
    for (const p of productData.presentations || []) opciones.add(normalizarTexto(p.name));
    for (const g of productData.variables || []) {
      for (const o of g.options || []) opciones.add(normalizarTexto(o.name));
    }
  }

  return matches.filter(m => {
    const n = normalizarTexto(m.name);
    if (n === actual) return false;        // el que ya está en curso
    if (yaPedidos.has(n)) return false;    // uno que ya se agregó
    if (opciones.has(n)) return false;     // es la respuesta a la pregunta pendiente
    return true;
  });
}

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
    /* SEÑAL INTERNA: no la manda un cliente, la manda el reloj cuando se le
       vencio la espera del comprobante. No entra al flujo normal porque no
       hay ningun mensaje que responder — hay un silencio que romper. */
    if (body.senal === "recordar_comprobante") {
      await recordarComprobante(convId);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    await processConversation(convId, body.relectura === true);
  } catch (err) {
    console.error("delay-reply error:", err);
    try { await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: false }); } catch {}
  }

  return new Response("OK", { status: 200 });
});

// ── Main ──────────────────────────────────────────────────────────────────────


/* ══════════════════════════════════════════════════════════════════════
   SE LE VENCIO LA ESPERA DEL COMPROBANTE

   Dos vueltas, y solo dos:
     1a — se le recuerda UNA vez, con la frase o la intencion que configuro
          el dueño en la caja de Pago.
     2a — no se le vuelve a escribir: se le marca la conversacion al dueño.
          Insistir dos veces por un comprobante es acoso, no servicio.

   NO se borra el pedido en espera: el cliente puede aparecer a los 40
   minutos con el comprobante en la mano.
   ══════════════════════════════════════════════════════════════════════ */
/* ── NO REPETIR LA MISMA FRASE FIJA TRES VECES (Ivan, 17-ago) ──────────────
   A quien pregunto "¿y no se puede en efectivo?" se le contesto la MISMA frase
   de prepago tres veces seguidas, palabra por palabra. Una frase fija que no
   responde y se repite es lo que hace que el cliente se vaya. A la SEGUNDA vez
   se le pasa a una persona: si la explicacion no basto a la primera, no va a
   bastar a la tercera.
   Devuelve true si ya se escalo (y entonces no hay que mandar nada mas). */
async function frenarBucle(convId: string, clave: string): Promise<boolean> {
  try {
    /* LA CUENTA VIVE EN SU PROPIA COLUMNA (`chat_conversations.bucles`), NO
       dentro de pending_order_data: ese campo se reescribe entero varias veces
       por mensaje con el estado del pedido, y se llevaba la cuenta por delante
       — la frase se repetia igual aunque el contador estuviera puesto. Una
       cuenta que no es del pedido no puede vivir dentro del pedido. */
    const fila = await sbGet(
      `/rest/v1/chat_conversations?id=eq.${convId}&select=bucles&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const cuenta = ((fila?.[0]?.bucles || {}) as Record<string, number>);
    const n = (Number(cuenta[clave]) || 0) + 1;
    cuenta[clave] = n;
    if (n >= 2) {
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
        human_takeover: true, ai_typing: false, bucles: cuenta,
      });
      console.log("bucle frenado, va a una persona:", clave, convId);
      return true;
    }
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { bucles: cuenta });
    return false;
  } catch (err) {
    console.error("frenarBucle:", err);
    return false;   // ante la duda, que conteste: quedarse callado es peor
  }
}

async function recordarComprobante(convId: string): Promise<void> {
  const convRes = await sbGet(
    `/rest/v1/chat_conversations?id=eq.${convId}` +
    `&select=id,tenant_id,branch_id,contact_handle,pago_pendiente,human_takeover,pending_order_data&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const conv = convRes?.[0];
  /* Entre que sono la alarma y que llego aqui el cliente pudo mandar el
     comprobante. Se comprueba, no se asume. */
  if (!conv || conv.pago_pendiente !== true || conv.human_takeover === true) {
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { recordar_at: null });
    return;
  }

  const branchId = String(conv.branch_id || "");
  const cfgRes = await sbGet(
    `/rest/v1/ia_config?branch_id=eq.${branchId}&select=flujo_pasos,bot,perfil,tono,frases&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const cfg = cfgRes?.[0] || {};
  const pasoPago = Array.isArray(cfg.flujo_pasos)
    ? (cfg.flujo_pasos as Array<Record<string, unknown>>).find(x => x && x.campo === "pago" && x.activo !== false)
    : null;
  const minutos = pasoPago && pasoPago.espera_comprobante_min != null
    ? Number(pasoPago.espera_comprobante_min) || 0 : 30;
  const pend = (conv.pending_order_data || {}) as Record<string, unknown>;

  /* ── Segunda vuelta: ya se le recordo ─────────────────────────────── */
  if (pend._recordatorio_en) {
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
      human_takeover: true, recordar_at: null,
      pending_order_data: { ...pend, _escalado_en: new Date().toISOString() },
    });
    console.log("comprobante sin llegar, se le pasa al dueño:", convId);
    return;
  }

  /* ── Primera vuelta: el recordatorio ──────────────────────────────── */
  const chRes = await sbGet(
    `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&select=meta&limit=1`
  ) as Array<Record<string, unknown>> | null;
  let meta: Record<string, string> = {};
  const raw = chRes?.[0]?.meta;
  if (typeof raw === "string") { try { meta = JSON.parse(raw); } catch { /* sin credenciales */ } }
  else if (raw && typeof raw === "object") meta = raw as Record<string, string>;
  const phoneId = meta.phone_id || "";
  const token   = meta.access_token || "";
  const to      = String(conv.contact_handle || "");
  if (!phoneId || !token || !to) {
    console.error("recordatorio sin credenciales de WhatsApp, sede", branchId);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { recordar_at: null });
    return;
  }

  const POR_DEFECTO = "Quedó pendiente del comprobante para poderte preparar ☺️ Envíamelo como imagen 🧾";
  let msg = "";

  /* Con sus palabras: se le dice QUE decir y el lo escribe. Mismo par de
     opciones que tienen todas las cajas del canvas. */
  if (pasoPago && pasoPago.espera_modo === "ia") {
    const hist = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}&select=direction,body&order=sent_at.desc&limit=6`
    ) as Array<Record<string, unknown>> | null;
    const lineas = (hist || []).reverse()
      .map(m => `${m.direction === "in" ? "Cliente" : "Tú"}: ${String(m.body || "").slice(0, 160)}`).join("\n");
    const botCfg = (cfg.bot as Record<string, string>) || {};
    const perfil = (cfg.perfil as Record<string, string>) || {};
    const guia   = String(pasoPago.espera_guia || "");
    const sys =
      `Eres ${botCfg.nombre || perfil.nombre || "el asistente"}, de un restaurante por WhatsApp. ` +
      `Tono ${botCfg.tono || String(cfg.tono || "cercano")}.\n` +
      `El cliente confirmó su pedido y eligió pagar por transferencia, pero NO ha enviado el comprobante.\n` +
      `Escríbele UN mensaje corto (máximo 2 frases) recordándoselo.\n` +
      (guia ? `Instrucción del restaurante: ${guia}\n` : "") +
      `PROHIBIDO: repetir el pedido completo, volver a dar el número de cuenta, presionar o reclamar.\n` +
      `Últimos mensajes:\n${lineas}`;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: sys }], max_tokens: 120, temperature: 0.8 }),
      });
      if (r.ok) {
        const d = await r.json() as Record<string, unknown>;
        const t = ((d.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, string> | undefined)?.content;
        if (t && t.trim()) msg = t.trim();
      } else { console.error("recordatorio, OpenAI:", await r.text()); }
    } catch (e) { console.error("recordatorio:", e); }
  }
  /* Si el modelo no contesto se usa la frase: quedarse callado es peor. */
  if (!msg) msg = String(pasoPago?.espera_texto || "") || POR_DEFECTO;

  /* El recordatorio del comprobante lo dispara el reloj, no Paco: sin
     etiqueta, como quedo acordado. */
  await sendWaAndSave(convId, String(conv.tenant_id), msg, to, phoneId, token, true);

  /* La marca se pone SIEMPRE, haya salido o no el mensaje. Si se pusiera solo
     cuando sale bien, una sede con el token vencido reintentaria para
     siempre. La proxima alarma es la que se lo pasa al dueño. */
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
    pending_order_data: { ...pend, _recordatorio_en: new Date().toISOString() },
    recordar_at: minutos > 0 ? new Date(Date.now() + minutos * 60_000).toISOString() : null,
    last_message: msg, last_message_at: new Date().toISOString(),
    last_sender: "agent", last_read: false,
  });
  console.log("recordatorio del comprobante enviado:", convId);
}

/* El numero como lo guarda la pantalla de clientes: sin indicativo.

   WhatsApp entrega 573244756271 y la pantalla guarda 3244756271. Comparando
   uno contra otro no coincidia NUNCA, asi que el bot jamas reconocio a un
   cliente conocido —ni para saludarlo, ni para confirmarle el nombre, ni para
   proponerle su direccion de siempre—. Los 111 clientes de El Parche estan
   guardados con diez digitos.

   Se toman los ultimos diez, que es lo que identifica a la persona: el
   indicativo lo pone el canal, no el cliente. */
function telLocal(tel: string | null | undefined): string {
  const d = String(tel || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

/* `relectura` = no es un mensaje nuevo del cliente, es el MISMO mensaje que ya
   estaba, releido porque entre medias se resolvio lo que faltaba (hoy: el
   precio del domicilio de un barrio que Paco no conocia).

   Importa la diferencia: al releerlo, los detectores de "me manda la carta" y
   "donde quedan ustedes" volvian a evaluarlo desde cero y contestaban otra
   cosa. En la prueba, "Los Naranjos de Prueba" se leyo como si el cliente
   preguntara la ubicacion del local, y Paco contesto "estamos ubicados en
   Bella Vista". En una relectura esos atajos no corren: el pedido ya venia en
   marcha y lo unico que hay que hacer es seguirlo. */
async function processConversation(convId: string, relectura = false): Promise<void> {

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
    /* SOLO EN WHATSAPP. En Instagram y Messenger `fromPhone` no es un
       telefono: es el id de la persona en esa red, y es un numero largo.
       Pasarlo por la lista negra de telefonos podia dejar mudo a un cliente
       inocente porque su id se parecia a un numero bloqueado. */
    const canalBL = await canalDe(convId);
    const telBL = canalBL === "whatsapp" ? String(fromPhone || "").replace(/\D/g, "") : "";
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
  /* El empaque NO vive en ia_config sino en la configuracion de operacion de
     la sede, que es la misma que lee la pantalla de ventas. Se carga aqui una
     vez y se cuelga de cfg —como _varData y _cerradoInfo— para no pasar un
     parametro mas por las veinte funciones que ya reciben cfg. */
  /* Los grupos de modificadores, temprano: de ellos sale el vocabulario que
     necesita el clasificador para distinguir "una ranchera" de "con ranchera". */
  try { await cargarModificadores(branchId); } catch (e) { console.error("modificadores:", e); }
  try {
    const opRes = await sbGet(`/rest/v1/branches?id=eq.${branchId}&select=operacion_config&limit=1`);
    if (cfg) (cfg as Record<string, unknown>)._operacion = opRes?.[0]?.operacion_config ?? null;
  } catch (e) { console.error("operacion_config:", e); }
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
    /* SIN HORARIO CONFIGURADO NO SE INVENTA UNO (21-ago-2026). Aqui estaban
       escritos a fuego los horarios de El Parche (18:30-22:30): un restaurante
       nuevo que no llenara la pantalla de Horarios heredaba los de otro
       negocio, y su bot abria o cerraba a la hora equivocada sin que nadie se
       enterara. Ahora se atiende con normalidad (no se le frena el negocio a
       nadie) pero NO se le dice al cliente una hora que no sabemos: con los
       dos textos vacios, ni el prompt ni las frases de cerrado hablan de
       horas. */
    isOpen = true;
    isBeforeOpen = false;
    horaAperturaHoy = "";
    horaCierreHoy   = "";
  }

  const pedidosProg       = !!(cfg.pedidos_programados);
  const puedeTomarPedidos = isOpen || pedidosProg;
  const frasesCfg         = (cfg.frases as Record<string, unknown>) || {};
  /* La etiqueta es de cada restaurante: pone la suya, o la deja vacia para que
     no salga ninguna. */
  {
    const et = (frasesCfg as Record<string, unknown>).etiqueta_ia;
    if (et !== undefined && et !== null) ETIQUETA_IA = String(getFraseTexto(et) || "").trim();
  }
  /* EL EMOJI TAMBIEN ES DEL RESTAURANTE (21-ago-2026). Las papas fritas de El
     Parche estaban escritas a fuego en 23 mensajes del motor: una pizzeria que
     comprara Cobra saludaba a sus clientes con papas fritas. Ahora sale de
     `frases.emoji`; si el restaurante no pone ninguno, los mensajes salen
     limpios — mejor sin emoji que con el de otro negocio. */
  {
    const em = (frasesCfg as Record<string, unknown>).emoji;
    EMOJI_NEG = em == null ? "" : String(getFraseTexto(em) || "").trim();
  }
  const domiciliosCfg     = cfg.domicilios as Record<string, unknown> | null | undefined;
  /* LAS CUENTAS QUE ESCOGIO EL DUEÑO en la caja de Pago del canvas. Se filtra
     aqui, en el origen, y no en los nueve sitios que preguntan por los metodos:
     si se filtrara alla, el dia que aparezca un sitio nuevo se le olvidaria a
     alguien y el bot daria una cuenta que ya no se usa.

     Solo se filtran las cuentas de TRANSFERENCIA. El efectivo no es una cuenta
     y nunca se toca: nadie se puede quedar sin poder pagar por una casilla
     desmarcada. */
  const pagosCfg          = filtrarCuentas(cfg.pagos as Record<string, unknown> | null | undefined, cfgPago(cfg).metodos_permitidos);
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
        || `Por hoy ya terminamos nuestra jornada${emo()} Volvemos {{proximo_dia}}. ¡Gracias por escribirnos!`;
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
  /* MEMORIA CORTA para clasificar (15-ago, FASE A del plan). "Las gracias" a
     secas no se puede clasificar sin saber que venia antes: despues de "esta
     caro" es una despedida; despues de "te llevo el pedido gratis" es otra
     cosa. Cuatro mensajes bastan y no engordan el prompt. */
  let contextoCorto = "";
  try {
    const prevRes = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}` +
      `&sent_at=lt.${encodeURIComponent(batchStart)}&order=sent_at.desc&limit=4&select=direction,body`,
    ) as Array<{ direction: string; body: string }> | null;
    if (prevRes && prevRes.length) {
      contextoCorto = prevRes.reverse()
        .map(m => `${m.direction === "in" ? "CLIENTE" : "RESTAURANTE"}: ${String(m.body || "").slice(0, 160)}`)
        .join("\n");
    }
  } catch { /* sin contexto se clasifica igual que antes */ }
  let intenciones: Record<string, unknown> = {};
  try {
    const rInt = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 170,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
`Eres el clasificador de intenciones de un restaurante colombiano por WhatsApp.
Lee lo que escribio el CLIENTE y responde SOLO este JSON:
{"carta":bool,"precio":bool,"ubicacion":bool,"domicilio":bool,"horario":bool,"pedir":bool,
 "pago":"efectivo"|"transferencia"|null,"entrega":"domicilio"|"recoger"|null,
 "rechaza_direccion":bool,"agregados":[string],
 "confirma":bool,"rechaza_mas":bool,"corrige":bool,
 "pregunta":bool,"despedida":bool,"queja":bool,"quiere_humano":bool,"fuera_tema":bool,
 "categoria":string|null}

- "pregunta": true si el mensaje contiene una pregunta que espera respuesta
  (con o sin signo de interrogacion: "cuanto vale", "hasta que hora", "sera
  que me alcanza a llegar").
- "despedida": true si el cliente esta CERRANDO la conversacion: se despide
  ("chao", "hasta luego"), agradece para terminar ("gracias", "muchas
  gracias" sin pedir nada mas), o rechaza con cortesia ("esta caro, gracias",
  "no gracias", "otro dia sera", "lo pienso y te escribo"). OJO: "gracias"
  seguido de mas pedido NO es despedida. Y AL REVES: si en el contexto el
  cliente venia diciendo que esta caro, que no va a pedir o que lo piensa,
  un "gracias" o un "bueno" solo, ES despedida — no lo trates como cortesia
  para seguir vendiendo. PERO un SALUDO ("hola", "buenas", "buenas noches")
  JAMAS es despedida: el cliente esta LLEGANDO, aunque la conversacion
  anterior haya quedado cerrada hace dias.
- "queja": true SOLO si esta molesto por un problema del SERVICIO o del
  pedido YA OCURRIDO: demora, algo llego mal o frio, le cobraron mal, mala
  atencion. NO es queja opinar del precio ("esta caro") ni dudar de pedir.
  Y OJO: la frustracion con ESTA conversacion ("ya te dije", "ya te lo
  dijeeee", "otra vez?", repetir un dato con rabia) NO es queja — el cliente
  esta cooperando, solo esta impaciente. Eso lo maneja el flujo, no tu.
- "quiere_humano": true SOLO si lo PIDE explicitamente ("me comunicas con
  alguien", "no quiero hablar con un robot", "llamame", "el dueño esta?").
  Insistir, repetir un dato o escribir con rabia NO es pedir una persona.
- "fuera_tema": true si habla de algo que NO tiene que ver con el restaurante
  ni con un pedido (politica, futbol, "que opinas de...", cadenas).
- "categoria": si pregunta QUE HAY dentro de UNA categoria concreta, devuelve
  esa categoria con tus palabras. Ejemplos: "que tienes de tomar" ->
  "bebidas" · "que gaseosas hay" -> "bebidas" · "que hamburguesas manejan" ->
  "hamburguesas" · "que perros tienen" -> "perros calientes".
  NO es categoria: pedir el menu COMPLETO ("que tienen", "la carta") -> null
  y carta:true. Tampoco preguntar por UN producto concreto ("que sabores de
  postobon", "cuanto vale la coca cola") -> null. Si no pregunta que hay en
  una categoria -> null.

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
  entrega, o que paga con un BILLETE ("pago con un billete de 100", "con 50", "necesito cambio de 100"): quien paga con billete paga en efectivo. "transferencia" si dice nequi, daviplata, transferencia, bancolombia,
  QR, "te consigno", "te mando el comprobante". Escrito como sea: "nequii",
  "davi plata", "transfe", "x nequi". Si no dice nada de pago -> null.
- "entrega": "domicilio" si quiere que se lo lleven, "recoger" si el pasa por el
  pedido ("yo paso", "lo recojo", "pa llevar", "voy por el"). Si no dice -> null.
- "rechaza_direccion": true SOLO si esta diciendo que NO quiere la direccion que
  se le propuso y quiere otra ("no", "no, otra", "cambiala", "es en otro lado").
- "agregados": lo que el cliente quiere QUE LE PONGAN ENCIMA a otro plato, no
  como plato aparte. Devuelve los nombres tal como el los escribio, en una
  lista. Si no esta agregando nada -> [].
  Es agregado: "una ranchera CON super queso", "ponle tocineta", "con extra de
  queso", "me das una adicion de chorizo", "la premium me la das con maicitos".
  NO es agregado, es un plato mas: "y tambien me das una super queso", "quiero
  dos tocinetas", "una salchipapa de chorizo". Fijate en si va PEGADO a otro
  plato ("con", "ponle", "adicion de") o si lo esta pidiendo aparte ("una",
  "dos", "tambien me das").
  OJO con "tambien" (o "tambn", "tmb", "y de paso"): eso es UN PLATO MAS, no un
  agregado. "una premium familiar mixta, tambn super queso" son DOS platos ->
  agregados: []. Solo es agregado si dice que va SOBRE el otro plato.
  OJO con "agregar/añadir/sumar": la palabra sola NO lo vuelve agregado.
  "puedo agregar UNA salchi super queso", "agregame UN perro", "añade UNA
  ranchera personal" -> articulo + nombre de plato = PLATO APARTE, agregados: [].
  "agregaLE super queso", "le añades tocineta", "con extra queso" -> eso si va
  SOBRE el plato = agregado. La señal es "le/ponle/con", no el verbo agregar.
  Si dudas entre las dos, elige plato aparte: cobrarle un plato de menos se
  arregla preguntando, mandarle un plato que no pidio no.
  Un mismo nombre puede ser lo uno o lo otro segun como lo diga: lo que decide
  es si va sobre otro plato o va solo.
- "confirma": true si esta diciendo que SI, que esta de acuerdo, que siga
  adelante. Escrito como sea: "si", "sisas", "dale", "listo", "listo pues",
  "de una", "hagale", "eso mismo", "tal cual", "correcto", "asi es", "esta
  bien", "perfecto", "ok", "va", "bueno", "obvio", "claro que si", "de once",
  "exactamente", "efectivamente", "ese mismo", "asi mismo".
  NO es confirmar: contestar una pregunta con un dato ("familiar", "carne",
  "efectivo"), ni pedir algo, ni saludar.
- "rechaza_mas": true si esta diciendo que NO quiere agregar nada mas al
  pedido. "no", "no gracias", "asi esta bien", "nada mas", "ya con eso", "no
  mas", "solo eso", "asi va bien", "listo asi", "ya esta". OJO con los errores
  de dedo: "AHI esta bien" casi siempre quiere decir "ASI esta bien" — caso
  real que costo un pedido. "esta bien" o "todo bien" despues de ofrecerle
  algo tambien es rechaza_mas. Es distinto de
  "confirma": aqui esta cerrando la lista de cosas, no aprobando el pedido.
  Puede haber mensajes que sean las dos ("no, asi esta bien, confirmo").
- "corrige": true si esta CORRIGIENDO algo que ya dijo o que tu entendiste
  mal — no agregando algo nuevo. "corrijo...", "es la premium, no la mixta",
  "quise decir...", "me equivoque", "mejor solo la X", "asi no era", "era
  familiar no personal". Mira el contexto: si acabas de resumir una cosa y el
  cliente nombra OTRA parecida sin decir "tambien" ni "y", esta corrigiendo.
  NO es corrige: "y tambien una super queso" (agrega), "no gracias" (cierra),
  contestar lo que se le pregunto.
Puede haber varias en true. Si no estas seguro, pon false.
La gente escribe con errores, sin tildes y con espacios de mas: interpreta la
INTENCION, no las palabras exactas.` },
          { role: "user", content: contextoCorto
            ? `Contexto (mensajes anteriores):\n${contextoCorto}\n\nMENSAJE ACTUAL DEL CLIENTE:\n${textoDelCliente}`
            : textoDelCliente },
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

  /* 5-pre. CON HUMANO AL MANDO, PACO CALLADO — DESDE AQUI (15-ago). La
     compuerta de human_takeover vivia mas abajo (donde se carga convRow), y
     todas las ramas que responden antes de llegar alla —despedida, queja,
     categoria en texto, carta— se la saltaban: Sergio apago a Paco en una
     conversacion, la clienta dijo "gracias" y Paco contesto igual. La
     compuerta de abajo se queda como respaldo. */
  try {
    const tkRes = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=human_takeover&limit=1`);
    if (tkRes?.[0]?.human_takeover === true) {
      await setTyping(convId, false);
      return;
    }
  } catch { /* si no se puede leer el flag, mejor atender que dejar mudo el negocio */ }

  /* 5-bis. ENTENDER ANTES QUE TODO (FASE A, 15-ago). Va AQUI, arriba de la
     rama de la carta, porque "no quiero hablar con un robot" contiene
     "quiero" y la rama de la carta se lo llevaba: el cliente pedia una
     persona y recibia el menu. Lo humano se atiende antes que lo comercial. */
  const clasifico = Object.keys(intenciones).length > 0;
  const handoffFraseCfg = String(((cfg.handoff as Record<string, unknown>) || {}).frase || "").trim();
  /* UN SALUDO NO ES UNA DESPEDIDA (caso real, 15-ago): un cliente volvio a los
     12 dias con "Buenas noches" + sticker. El clasificador, leyendo la
     historia vieja —que termino en "gracias"—, lo marco como despedida y Paco
     lo "despidio" al llegar ("estamos para servirte"). Si lo dicho es SOLO un
     saludo (quitando stickers), el cliente esta LLEGANDO, no yendose. */
  const soloSaludoLote = SALUDO_REGEX.test(
    batchMsgs.map(m => String(m.body || "")).join(" ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim());

  // (a) Pide una persona, o esta molesto → humano, con el motivo visible.
  if (intenciones.quiere_humano === true || intenciones.queja === true) {
    const motivo = intenciones.quiere_humano === true
      ? "El cliente pidió hablar con una persona"
      : "Cliente molesto o con reclamo — lo detectó Paco";
    if (!handoffFraseCfg) {
      const aviso = getFraseTexto(frasesCfg.pasar_humano)
        || "Claro que sí 🙏 Ya le aviso a una persona del equipo para que te atienda directamente.";
      await sendWaAndSave(convId, tenantId, aviso, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: aviso, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    }
    await pasarAHumano(convId, tenantId, motivo, cfg, fromPhone, phoneId, accessToken);
    return;
  }

  /* (b) Se esta despidiendo → despedirse y YA. Un humano jamas contesta un
     "gracias, esta caro" con la pregunta de venta (paso la noche del 14-ago,
     dos veces seguidas). Guardas: si en el MISMO mensaje tambien pide o
     confirma algo, no es despedida; y con un PEDIDO EN CURSO el "no gracias"
     esta cerrando el upsell o un paso, no la conversacion — el flujo sigue
     (la regresion del banco lo probo: cortaba el pedido a mitad). */
  if (intenciones.despedida === true && !soloSaludoLote && intenciones.pedir !== true
      && intenciones.confirma !== true && intenciones.carta !== true
      && !(Array.isArray(intenciones.agregados) && (intenciones.agregados as unknown[]).length > 0)) {
    /* El estado del pedido aun no esta cargado a esta altura (se carga mas
       abajo), asi que se consulta SOLO cuando la intencion ya es despedida:
       una consulta extra en el caso raro, cero en el resto. */
    let pedidoEnCurso = false;
    try {
      const pRes = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=pending_order_data&limit=1`);
      const p0 = (pRes?.[0]?.pending_order_data || {}) as Record<string, unknown>;
      pedidoEnCurso = !!(p0.producto || (Array.isArray(p0.items) && (p0.items as unknown[]).length > 0))
        && p0.resumen_enviado !== true;
    } catch { /* sin estado legible, se asume conversacion sin pedido */ }
    if (!pedidoEnCurso) {
      const chao = getFraseTexto(frasesCfg.despedida)
        || getFraseTexto(frasesCfg.cierre)
        || `¡Con mucho gusto! 😊 Aquí estamos cuando se te antoje algo${emo()}`;
      await sendWaAndSave(convId, tenantId, chao, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: chao, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  /* 5-ter. CATEGORÍA EN TEXTO (pedido de Sergio, 15-ago). "¿Qué tienes de
     tomar?" no es pedir la carta completa: es preguntar por UNA categoría.
     Si el restaurante marcó esa categoría para responderse en texto
     (ia_config.categorias_texto), la respuesta sale DEL CATÁLOGO — solo
     nombres, nunca precios (el precio se responde si lo preguntan, con su
     casilla de siempre) — y la carta no se manda. Por defecto la lista está
     vacía: todo restaurante sigue mandando la carta salvo que lo configure.
     Esto NO es volcar la carta en texto (regla de oro intacta): es una
     categoría, en nombres. */
  // 6. Detectar solicitud de carta / PRECIOS → enviar imágenes de la carta (traen los precios)
  let extraRespondido = false;
  let cartaSuprimida = false;   // la categoría en texto ya respondió lo que la carta iba a responder
  /* CARTA + PEDIDO EN EL MISMO LOTE (caso real, 15-ago): "me regalas la carta /
     regalame un perro pollo / y una salchi maicitos" — el bot mando la carta,
     retorno, y el PEDIDO completo quedo ignorado. Si el clasificador dice que
     el lote tambien PIDE, la carta se manda pero el turno NO termina ahi: el
     flujo sigue y captura el pedido (mismo espiritu que la categoria en texto). */
  const traePedidoEnLote = intenciones.pedir === true;
  const menuImagenes = (cfg.menu_imagenes as string[]) || [];

  /* 6-pre. CATEGORÍA EN TEXTO (pedido de Sergio, 15-ago). "¿Qué tienes de
     tomar?" no es pedir la carta completa: es preguntar por UNA categoría.
     Si el restaurante la marcó para responderse en texto
     (ia_config.categorias_texto), la lista sale DEL CATÁLOGO — solo nombres —
     y REEMPLAZA a la carta. No es una rama que retorna: el resto del mensaje
     sigue procesándose ("Super queso porfa, ¿y qué tienes de tomar?" captura
     el super queso Y responde las bebidas — la trampa mixta de Sergio).
     La consulta del catálogo es fresca y de ESTA sucursal: los mapas DYN se
     reconstruyen más abajo y en frío podrían arrastrar otro restaurante. */
  if (!relectura) {
    try {
      const catsTexto = ((cfg.categorias_texto as string[]) || []).map(c => normalizarTexto(String(c)));
      const catPreg = typeof intenciones.categoria === "string" ? normalizarTexto(intenciones.categoria) : "";
      if (catsTexto.length && catPreg) {
        const prodsCat = await sbGet(
          `/rest/v1/pos_products?branch_id=eq.${branchId}&select=name,presentations,variables,category_id(name)&limit=200`,
        ) as Array<{ name?: string; presentations?: Array<{ name?: string }>; variables?: Array<{ options?: Array<{ name?: string }> }>; category_id?: { name?: string } | null }> | null;
        const cats = [...new Set((prodsCat || [])
          .map(p => normalizarTexto(String(p.category_id?.name || ""))).filter(Boolean))];
        let catReal = cats.find(c => c === catPreg)
          || cats.find(c => c.includes(catPreg) || catPreg.includes(c))
          || null;
        // "de tomar / de beber" → la categoría de bebidas, se llame como se llame
        if (!catReal && /(tomar|beber|bebida|gaseosa|refresco|jugo)/.test(catPreg)) {
          catReal = cats.find(c => /bebida|gaseosa|refresco/.test(c)) || null;
        }
        if (catReal && catsTexto.includes(catReal)) {
          const delaCat = (prodsCat || []).filter(p =>
            normalizarTexto(String(p.category_id?.name || "")) === catReal && String(p.name || "").trim());
          if (delaCat.length) {
            /* AQUÍ NO SE ENVÍA NADA. La rama CALLA la carta y le deja al
               modelo la FICHA COMPLETA de la categoría, armada del catálogo:
               nombres, presentaciones y sabores/variantes. El modelo solo la
               presenta bonita — sin la ficha omitía productos (se comió
               Premio y Quatro) y hasta negaba sabores por culpa de una FAQ
               mal emparejada ("ese producto no lo manejamos"). La ficha es
               la autoridad; el modelo, el locutor. */
            const catDisplay = String(delaCat[0].category_id?.name || catReal).toLowerCase();
            const fichas = delaCat.map(p => {
              const pres = ((p.presentations || []) as Array<{ name?: string }>)
                .map(x => String(x?.name || "").trim())
                .filter(n => n && n.toLowerCase() !== "unico" && n.toLowerCase() !== "único");
              const sabores = (((p.variables || []) as Array<{ options?: Array<{ name?: string }> }>)[0]?.options || [])
                .map(o => String(o?.name || "").trim()).filter(Boolean);
              let linea = "- " + capFirst(String(p.name).toLowerCase().trim());
              if (pres.length) linea += ` (${pres.map(x => x.toLowerCase()).join(" y ")})`;
              if (sabores.length) linea += ` — sabores: ${sabores.map(x => x.toLowerCase()).join(", ")}`;
              return linea;
            });
            cartaSuprimida = true;
            (cfg as Record<string, unknown>)._catTexto = catDisplay;
            (cfg as Record<string, unknown>)._catFicha = fichas.join("\n");
          }
        }
      }
    } catch { /* si el catálogo no responde, cae a la carta como siempre */ }
  }
  if (menuImagenes.length > 0 && !relectura) {
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
    const menuKw = ["la carta","el menú","el menu","dame la carta","ver la carta","su carta","ver el menú","ver el menu","muestrame la carta","que tienen de menu","precio","precios","los precios","lista de precios","que precios","qué precios","cuanto cuesta","cuánto cuesta","cuanto vale","cuánto vale","cuanto valen","cuánto valen","cuanto sale","cuánto sale"];
    /* "que hay", "que tienen" y parecidos NO van como subcadena: "porfa que
       hay ninos en la casa" mandaba la carta entera y se tragaba la nota de
       cocina (banco, 21-ago). Y "tienen de" casaba hasta con "tienen
       descuento". Solo cuentan como PREGUNTA: al inicio del mensaje (tras un
       saludo si lo hay) o con signo de interrogacion. Cualquier otra forma
       de pedir la carta la entiende el clasificador (intenciones.carta). */
    const PREG_CARTA_RE = /^(hola |buenas( noches| tardes)? |buenos dias |y )*(que|q) (hay|tienen|tienes|tiene|venden|manejan)([^a-z]|$)/;
    const pideCartaPregunta = batchMsgs.some(m => {
      const t = limpiar(m.body);
      return PREG_CARTA_RE.test(t)
        || (/(\?|¿)/.test(m.body || "") && /(^|[^a-z])(que|q) (hay|tienen|tienes|tiene)([^a-z]|$)/.test(t));
    });
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
    const wantsMenu = !extraRespondido && !cartaSuprimida   // la categoría en texto ya respondió: la carta sobra
      && intenciones.precio !== true && intenciones.domicilio !== true
      && (intenciones.carta === true || isExact || palabraSuelta || pideCartaPregunta || menuKw.some(kw => {
      const k = kw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
      return combinedLower.includes(k);
    }));
    await cargarCombos(branchId);
  /* ══ PIDIO UN COMBO ══════════════════════════════════════════════════════
     Paco sabe que existen y cuanto valen (van en la carta que lee), pero no
     sabe armarlos: un combo son varios platos en una linea, con su precio
     propio y su propio descuento del inventario. Antes de esto contestaba
     "no manejamos combos" — negando algo que el restaurante SI vende por la
     pagina y por el POS, y perdiendo la venta.
     Se le dice que si hay y lo cierra una persona. */
  if (COMBOS_NOMBRES.length) {
    /* Aqui todavia NO existe `clienteTexto` (se declara mas abajo): usarlo
       tiraba la funcion entera y Paco se quedaba mudo, sin siquiera pasar la
       conversacion a una persona. `combinedLower` es lo que hay a esta altura
       y es el mismo texto del cliente, ya en minusculas. */
    const tCombo = normalizarTexto(combinedLower);
    const pedido = COMBOS_NOMBRES.find(n2 => {
      const palabras = normalizarTexto(n2).split(" ").filter(w => w.length >= 4);
      return palabras.length > 0 && palabras.every(w => tCombo.includes(w));
    });
    /* Y la pregunta suelta —"¿tienen combos?"— tambien: si no se nombra
       ninguno en particular, se dicen los que hay. Antes contestaba que no
       manejaba combos, que es exactamente lo contrario de la verdad. */
    const preguntaPorCombos = !pedido && /(^|[^a-z])combos?([^a-z]|$)/i.test(tCombo);
    if (pedido || preguntaPorCombos) {
      const avisoCombo = pedido
        ? `¡Claro que tenemos!${emo()} El *${pedido}* si lo manejamos. `
          + "Dame un momento que te atiende alguien del local para armartelo 🙏"
        : `¡Claro que sí!${emo()} Tenemos: `
          + COMBOS_NOMBRES.map(n2 => "*" + n2 + "*").join(" y ")
          + ". Dame un momento que te atiende alguien del local para armartelo 🙏";
      await sendWaAndSave(convId, tenantId, avisoCombo, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
        human_takeover: true, handoff_motivo: "pidio un combo (" + (pedido || "pregunto cuales hay") + ")",
        handoff_at: new Date().toISOString(),
        last_message: avisoCombo, last_message_at: new Date().toISOString(),
        last_sender: "agent", last_read: false, ai_typing: false,
      });
      console.log("[combo] " + (pedido || "pregunta general") + " -> a una persona");
      return;
    }
    }

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
          /* EL ID SUBIDO SOLO VALE EN WHATSAPP (22-ago). Esos ids viven en el
             almacen de WhatsApp; Instagram y Messenger no los conocen. Con la
             carta ya subida y guardada en cache, Paco intentaba mandarla por
             Instagram con un id de WhatsApp y contestaba "ahora mismo no puedo
             enviarte la carta" — probado por Sergio con su Instagram real.
             Alla se manda el ENLACE PUBLICO de la imagen, que es lo que esa
             API entiende. */
          const canalCarta = await canalDe(convId);
          const usaId = canalCarta !== "instagram" && canalCarta !== "facebook";
          const mediaId = usaId ? await idDeMeta(imgUrl) : "";
          // Si la subida fallo se intenta por link, como antes: peor, pero es
          // mejor que no mandar nada.
          const foto = mediaId ? { id: mediaId } : { link: imgUrl };
          const rImg = await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: foto });
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
      /* Con pedido en el lote, la frase "¿Que deseas ordenar?" sobra: el flujo
         sigue y la siguiente pregunta sale del pedido mismo. */
      if (!traePedidoEnLote) {
      const waText = await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: followUp } });
      const waSentData = await waText.json().catch(() => ({})) as Record<string, unknown>;
      const sentId = ((waSentData.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
      /* SE DICE LA VERDAD DE SI SALIO. Antes esto ponia "sent" siempre, hubiera
         salido o no: en el panel Sergio veia un mensaje entregado que el
         cliente nunca recibio, y no habia forma de notarlo. */
      if (!waText.ok) console.error("[carta] la frase no salio:", JSON.stringify(waSentData).slice(0, 300));
      await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: followUp, delivery_status: waText.ok ? "sent" : "failed", external_id: sentId || null, sent_at: new Date().toISOString() });
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: followUp, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      }
      extraRespondido = true;   // NO salir: puede que también pida ubicación en el mismo mensaje
    }
  }

  // 6b. Detectar solicitud de UBICACIÓN → enviar dirección escrita + tarjeta de mapa.
  // Reutiliza las respuestas rápidas: k="ubicacion" (con .loc) y k="direccion" (texto),
  // así queda sincronizado con lo que Sergio edita en la config. Palabras clave
  // ESPECÍFICAS de "¿dónde están USTEDES?" — se evita "dirección" a secas porque
  // el cliente la usa al DAR su propia dirección de entrega en un pedido.
  /* En una relectura este atajo no corre: ver la nota de processConversation. */
  if (!relectura) try {
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
          await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: dirTxt } });
          await sleep(500);
        }
        await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "location", location: { latitude: ubiLoc.latitude, longitude: ubiLoc.longitude, name: String(ubiLoc.name || ""), address: String(ubiLoc.address || "") } });
        const savedMsg = dirTxt ? (dirTxt + " 📍") : "📍 Ubicación enviada";
        await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: savedMsg, delivery_status: "sent", sent_at: new Date().toISOString() });
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: "📍 Ubicación", last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        extraRespondido = true;
      }
    }
  } catch (e) { console.error("bloque ubicacion:", e); }

  // Si ya se atendió carta/precios y/o ubicación (una o ambas), no seguir al flujo de GPT
  // — SALVO que el mismo lote traiga un pedido: ese sigue derecho a capturarse.
  if (extraRespondido && !traePedidoEnLote) { try { await setTyping(convId, false); } catch (_e) { /* noop */ } return; }
  if (extraRespondido && traePedidoEnLote) console.log("[carta] lote con pedido: la carta salio y el flujo sigue");

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
      /* Se busca por el numero local Y por el completo: hay bases con los dos
         formatos y no se puede dar por hecho cual usa cada restaurante. */
      `/rest/v1/pos_clientes?telefono=in.(${encodeURIComponent(telLocal(telefonoCleanWa))},${encodeURIComponent(telefonoCleanWa)})&tenant_id=eq.${tenantId}&select=nombre&order=id.desc&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (!clienteHist || clienteHist.length === 0) {
      console.log(`[cliente] NO reconocido — tel ${telefonoCleanWa} (local ${telLocal(telefonoCleanWa)}), tenant ${tenantId}`);
    }
    if (clienteHist && clienteHist.length > 0 && clienteHist[0].nombre) {
      nombreKnown = String(clienteHist[0].nombre);
      console.log(`[cliente] reconocido: "${nombreKnown}" (tel ${telefonoCleanWa} -> ${telLocal(telefonoCleanWa)})`);
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
    const _prodMap: Array<{ key: string; name: string; cat: string; opciones: string[] }> = [];
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
      if (normFull) {
        /* Lo que SOLO tiene esta fila: sus presentaciones y sus variantes. */
        const opcs: string[] = [];
        for (const pr of ((p.presentations as Array<{ name?: string }>) || [])) {
          const n = normalizarTexto(String(pr?.name || "")).trim();
          if (n && n !== "unico") opcs.push(n);
        }
        for (const g of ((p.variables as Array<{ options?: Array<{ name?: string }> }>) || [])) {
          for (const o of (g?.options || [])) {
            const n = normalizarTexto(String(o?.name || "")).trim();
            if (n) opcs.push(n);
          }
        }
        _prodMap.push({ key: normFull, name: nombreProd, cat: catNombre, opciones: opcs });
      }
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
    /* ALIAS POR PALABRA PROPIA (20-ago-2026, pedido real de Cristian). El
       mapa solo indexaba el nombre COMPLETO: "1 agua personal" no casaba con
       "AGUA BOTELLA" y el agua se perdio del pedido — Paco dio el total sin
       ella y a Sergio le toco intervenir. Si una palabra de un nombre
       compuesto es UNICA de ese producto (no la usa otro producto, ni una
       categoria, ni una presentacion o variante de nadie), decirla es nombrar
       ese producto: "agua" ES el Agua Botella en esta carta. Corta (<4) o
       compartida, no vale — nada de adivinar. */
    {
      const cuenta: Record<string, number> = {};
      for (const e of _prodMap) for (const w of e.key.split(" ")) if (w.length >= 4) cuenta[w] = (cuenta[w] || 0) + 1;
      /* Palabras que en la CONVERSACION significan otra cosa: "mi premio" es
         el canje de puntos, no la gaseosa PREMIO. Una de estas jamas es alias. */
      const RESERVADAS = ["premio", "premios", "pedido", "pedidos", "carta", "menu",
        "cuenta", "factura", "domicilio", "combo", "combos", "promo", "puntos"];
      const vetadas = new Set<string>([..._catNames, ...RESERVADAS]);
      for (const e of _prodMap) for (const o of e.opciones) for (const w of o.split(" ")) if (w) vetadas.add(w);
      const alias: typeof _prodMap = [];
      for (const e of _prodMap) {
        const ws = e.key.split(" ");
        if (ws.length < 2) continue;
        for (const w of ws) {
          if (w.length < 4 || cuenta[w] !== 1 || vetadas.has(w)) continue;
          if (_prodMap.some(x => x.key === w)) continue;
          alias.push({ key: w, name: e.name, cat: e.cat, opciones: e.opciones });
        }
      }
      _prodMap.push(...alias);
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

  /* La imagen se reconoce por su TIPO, no por el texto del cuerpo. Antes solo
     se miraba si el body empezaba por "[imagen]", asi que una foto CON pie de
     foto ("me regalas una de estas personal") no contaba como imagen y se
     trataba como un mensaje de texto cualquiera. */
  const hasImagenBatch = batchMsgs.some(m =>
    m.media_type === "image" || (m.body||"").startsWith("[imagen]") || (m.body||"").startsWith("[image]"));

  /* ── UNA FOTO QUE NO ES COMPROBANTE VA A UN HUMANO (17-ago) ─────────────
     Paco no ve imagenes. Una clienta mando la foto de la carta seNalando la
     salchipapa que queria: eso es exactamente el caso "se sale del flujo" que
     Sergio definio — pasar a humano NO es un error, es la valvula; el error
     seria inventar cual pidio.

     Y NO se contesta "solo puedo atenderte por texto": ella ya dijo lo que
     queria, y mandarla a repetirlo la deja peor que si nadie contestara. Se
     pasa a una persona, que ve la foto y la atiende. */
  if (hasImagenBatch && !convRow?.pago_pendiente) {
    /* `pasarAHumano` manda la frase de traspaso SI esta configurada. Hoy no lo
       esta (`cfg.handoff` no existe en ia_config), asi que sin esto la clienta
       se quedaria igual de callada que antes — solo que ahora Sergio si lo
       veria en su lista. El silencio es el error que estamos arreglando. */
    const fraseCfg = String(((cfg.handoff as Record<string, unknown>) || {}).frase || "").trim();
    if (!fraseCfg) {
      /* Se dice lo que PASO, no lo que va a pasar: "ya le paso tu mensaje" es
         verdad en el momento de escribirlo. Prometer "en un momento te
         atienden" seria prometer algo que depende de si hay alguien despierto
         — y prometer acciones ya nos costo un caso (entrada 176).
         La frase se puede cambiar desde Configuracion cuando Sergio quiera:
         si algun dia llena `handoff.frase`, manda la suya y no esta. */
      const aviso = `Uy, no alcanzo a ver las fotos 😅 Ya le paso tu mensaje a una persona del equipo${emo()}`;
      await sendWaAndSave(convId, tenantId, aviso, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
        last_message: aviso, last_message_at: new Date().toISOString(),
        last_sender: "agent", last_read: false, ai_typing: false,
      });
    }
    await pasarAHumano(
      convId, tenantId,
      "Mandó una foto (Paco no ve imágenes)",
      cfg as Record<string, unknown>, fromPhone, phoneId, accessToken,
    );
    return;
  }

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
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pago_pendiente: false, pending_order_data: stPend, recordar_at: null });
      try {
        const sumMsg = await buildSummaryFromState(stPend, cfg, branchId, domiciliosCfg);
        await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      } catch (err) { console.error("reabrir pendiente como efectivo:", err); }
      return;
    }
    // Para-llevar con prepago: no se puede pagar en efectivo → recordar la regla
    if (cambiaEfectivoPend && stPend && esLlevarPend && prepagoPend) {
      if (await frenarBucle(convId, "llevar_efectivo")) return;
      const msgLl = getFraseTexto(frasesCfg.llevar_efectivo)
        || `Qué pena contigo 🙏 Para recoger tu pedido el pago debe hacerse por transferencia primero. Si prefieres efectivo, te lo preparamos cuando te acerques al local${emo()}`;
      await sendWaAndSave(convId, tenantId, msgLl, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgLl, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }

    if (NUEVA_ORDEN_RE.test(clienteTexto) || esOtroProducto || horasPendiente > 24) {
      pagoPendienteViejo = true;
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pago_pendiente: false, pending_order_data: null, recordar_at: null });
    } else {
      /* MIENTRAS SE ESPERA EL COMPROBANTE, NO TODO ES "MANDA EL COMPROBANTE".

         Caso real (21-ago): la clienta escribio "Ok", despues "Lo mas rapido
         que puedas gracias" y despues "Las salsas aparte por favor, porque
         tenemos niNos" — y a LAS TRES les llego la misma respuesta: "Quedo
         pendiente del comprobante". La nota de las salsas se perdio y la
         clienta tuvo que reenviarla despues, con el pedido ya en cocina.

         Tres casos distintos, tres respuestas distintas:
         1. Una instruccion de cocina -> SE ANOTA en el pedido pendiente (el
            pedido se crea desde ahi cuando el pago se verifique, asi que la
            nota sale en la comanda) y se le confirma a la clienta.
         2. Una cortesia ("Ok", "gracias") -> silencio. Ya sabe que debe
            mandar el comprobante; repetirselo es ruido.
         3. Otra cosa que no se entiende -> el recordatorio UNA vez; a la
            segunda, mejor una persona (frenarBucle ya hace esa cuenta). */
      const instrPend = quitarReenvio(clienteTexto);
      if (stPend && esInstruccionCocina(instrPend.texto)) {
        const notaPend = extractPreferencias(instrPend.texto, cfg) || instrPend.texto.slice(0, 120);
        const previasPend = stPend.preferencias ? stPend.preferencias + ", " : "";
        if (!previasPend.toLowerCase().includes(notaPend.toLowerCase())) {
          stPend.preferencias = previasPend + notaPend;
        }
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: stPend });
        const msgNota = `¡Anotado! 📝 ${notaPend}. Sigo pendiente del comprobante para prepararte el pedido 🧾`;
        await sendWaAndSave(convId, tenantId, msgNota, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgNota, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      if (SOLO_CORTESIA_RE.test(clienteTexto)) {
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: false });
        return;
      }
      if (await frenarBucle(convId, "esperar_comprobante")) return;
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

  /* POR DONDE LLEGO ESTA CONVERSACION. Se pone en el estado para que los
     pasos puedan decidir: el del telefono solo existe en Instagram y
     Messenger, porque en WhatsApp el numero ES la conversacion. */
  state.canal = await canalDe(convId);
  /* Tambien en cfg: por ahi lo leen las funciones que arman los pasos, que
     ya reciben cfg y no un parametro mas (misma maNa que _operacion). */
  if (cfg) (cfg as Record<string, unknown>)._canal = state.canal;

  /* Foto de los datos ANTES de procesar este mensaje. El contador anti-bucle
     la compara al final: si algo de esto cambió, el cliente ESTÁ cooperando y
     no se le cuenta un "intento" — la trampa de Sergio del 15-ago: dio la
     dirección (progreso real) y el contador le pegó el "perdón si no me hice
     entender" a la PRIMERA pregunta del barrio. Contar sin mirar el progreso
     castiga al que colabora. */
  /* ── ¿HAY UN PEDIDO EN CURSO Y ESTO ES UNA NOTA SOBRE EL? (21-ago) ────

     Caso real: con su pedido ya pagado y en cocina, la clienta reenvio "Las
     salsas aparte por favor". Paco no tenia memoria de ese pedido: leyo
     "salsas", lo caso con el producto Salsa del catalogo y arranco un pedido
     NUEVO — pregunto el sabor, ofrecio adiciones, volvio a pedir direccion y
     nombre. La clienta solo queria avisarle algo a la cocina.

     La regla de Sergio: Paco debe ser consciente del pedido que esta en
     curso. Si hay un pedido creado hace poco y todavia sin entregar, y el
     mensaje es una instruccion de cocina o un reenvio, NO es un pedido
     nuevo: es sobre ESE. Y como la comanda ya esta impresa, quien decide si
     la nota alcanza a entrar es una persona, no el bot — igual que ya pasa
     con los cambios de plato y de direccion. */
  {
    const reenv = quitarReenvio(clienteTexto);
    const esNotaCocina = esInstruccionCocina(reenv_texto(reenv));
    if ((esNotaCocina || reenv.esReenvio) && !state.producto && (state.items || []).length === 0
        && !PIDE_NUEVO_RE.test(reenv_texto(reenv))) {
      const convPed = await sbGet(
        `/rest/v1/chat_conversations?id=eq.${convId}&select=order_id&limit=1`
      ) as Array<Record<string, unknown>> | null;
      const oid = convPed?.[0]?.order_id;
      if (oid) {
        const ped = await sbGet(
          `/rest/v1/pos_orders?id=eq.${oid}&select=status,delivery_status,opened_at&limit=1`
        ) as Array<Record<string, unknown>> | null;
        const p0 = ped?.[0];
        const horas = p0?.opened_at ? (Date.now() - new Date(String(p0.opened_at)).getTime()) / 3600000 : 999;
        const activo = !!p0 && p0.status !== "cancelled"
          && p0.delivery_status !== "entregado" && horas < 6;
        if (activo && esNotaCocina) {
          const avisoNota = "¡Listo! Le paso tu nota a la cocina para tu pedido que ya está en preparación 🍳🙏";
          await sendWaAndSave(convId, tenantId, avisoNota, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
            human_takeover: true,
            handoff_motivo: "nota de cocina con el pedido ya en preparación: \"" + reenv_texto(reenv).slice(0, 140) + "\"",
            handoff_at: new Date().toISOString(),
            last_message: avisoNota, last_message_at: new Date().toISOString(),
            last_sender: "agent", last_read: false, ai_typing: false,
          });
          console.log("[pedido en curso] nota de cocina -> a una persona");
          return;
        }
        if (activo && reenv.esReenvio) {
          /* Un reenvio con el pedido en cocina casi siempre es "no me leyeron
             esto". Sea lo que sea, no se arranca un pedido nuevo con el: lo
             mira una persona. */
          const avisoReenv = "Ya te leo 🙏 Le paso tu mensaje a la persona encargada de tu pedido.";
          await sendWaAndSave(convId, tenantId, avisoReenv, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
            human_takeover: true,
            handoff_motivo: "mensaje reenviado con el pedido en preparación: \"" + reenv_texto(reenv).slice(0, 140) + "\"",
            handoff_at: new Date().toISOString(),
            last_message: avisoReenv, last_message_at: new Date().toISOString(),
            last_sender: "agent", last_read: false, ai_typing: false,
          });
          console.log("[pedido en curso] reenvio -> a una persona");
          return;
        }
      }
    }
  }

  const slotsAntes14 = JSON.stringify([state.producto, state.tamano, state.tipo,
    state.direccion, state.nombre, state.pago, state.adiciones, state.upsell,
    (state.items || []).length]);

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

  /* ── ESPERANDO EL CODIGO DE LA BILLETERA (20-ago-2026) ────────────────
     El pago quedo a un codigo de distancia: lo unico que puede pasar aqui es
     que llegue el codigo, que pida reenvio, o que cambie de metodo. */
  {
    const spDR = (state as unknown as Record<string, unknown>).saldo_pago as { total?: number; cliente?: string } | undefined;
    if (spDR && Number(spDR.total) > 0 && spDR.cliente) {
      const tel10DR = String(fromPhone || "").replace(/\D/g, "").slice(-10);
      const tNorm = normalizarTexto(clienteTexto);
      const codTxt = (clienteTexto.match(/\b\d{6}\b/) || [])[0] || "";
      const decir = async (m: string) => {
        await sendWaAndSave(convId, tenantId, m, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: m, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      };
      if (codTxt) {
        const filas = await sbGet(`/rest/v1/pos_web_codigos?tenant_id=eq.${tenantId}&telefono=eq.${tel10DR}&usado=eq.false&motivo=eq.pago&order=created_at.desc&select=*&limit=1`);
        const c = filas?.[0];
        if (!c) { await decir("Ese código ya no está vigente 🙏 Escríbeme *reenviar* y te mando uno nuevo."); return; }
        if (new Date(String(c.expira_at)).getTime() < Date.now()) { await decir("Ese código ya venció 🙏 Escríbeme *reenviar* y te mando uno nuevo."); return; }
        if (Number(c.intentos) >= 3) { await decir("Ese código se bloqueó por intentos 🙏 Escríbeme *reenviar* y te mando uno nuevo."); return; }
        if ((await sha256DR(codTxt + "|" + tel10DR)) !== String(c.codigo_hash)) {
          await sbPatch(`/rest/v1/pos_web_codigos?id=eq.${c.id}`, { intentos: Number(c.intentos) + 1 });
          await decir(`Ese código no es 🤔 Te quedan ${3 - Number(c.intentos) - 1} intentos.`);
          return;
        }
        await sbPatch(`/rest/v1/pos_web_codigos?id=eq.${c.id}`, { usado: true });
        /* PRIMERO LA PLATA, DESPUES LA COCINA: si el descuento falla, no debe
           existir un pedido en preparacion sin pagar. */
        const totalDR = Math.round(Number(spDR.total));
        const refDR = "wa:" + convId + ":" + Date.now();
        const mov = await sbRpcDR("fn_saldo_mover", {
          p_tenant: tenantId, p_cliente: spDR.cliente, p_motivo: "consumo",
          p_monto: -totalDR, p_branch: branchId, p_order: null,
          p_ref: refDR, p_detalle: "Pago con billetera por WhatsApp",
        });
        if (mov === null) {
          delete (state as unknown as Record<string, unknown>).saldo_pago;
          state.pago = null;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await decir("No pudimos descontar tu saldo 🙏 ¿Pagas en efectivo o por transferencia?");
          return;
        }
        delete (state as unknown as Record<string, unknown>).saldo_pago;
        const dirDR = state.direccion || "";
        const domiDR = LLEVAR_REGEX.test(dirDR.toLowerCase()) ? 0 : (lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) ?? 0);
        let orderIdDR: string | null = null;
        try {
          orderIdDR = await createWhatsappOrder(buildOrderArgs(state, domiDR), branchId, tenantId, fromPhone, cfg._operacion as Record<string, unknown> | null, convId);
        } catch (err) { console.error("[billetera] creando pedido:", err); }
        if (!orderIdDR) {
          /* La plata vuelve: el pedido no se pudo crear. */
          await sbRpcDR("fn_saldo_mover", {
            p_tenant: tenantId, p_cliente: spDR.cliente, p_motivo: "anulacion",
            p_monto: totalDR, p_branch: branchId, p_order: null,
            p_ref: refDR + ":anul", p_detalle: "Devolución: el pedido no se pudo crear",
          });
          await decir("Algo falló creando tu pedido y tu saldo quedó intacto 🙏 Intenta de nuevo en un momento.");
          return;
        }
        /* El pedido nace PAGADO, con el mismo sello que usa la app. */
        await sbPatch(`/rest/v1/pos_orders?id=eq.${orderIdDR}`, {
          status: "paid", payment_method: "__saldo", paid_amount: totalDR,
          closed_at: new Date().toISOString(),
        });
        await sbPatch(`/rest/v1/pos_saldo_mov?referencia=eq.${encodeURIComponent(refDR)}`, { order_id: orderIdDR });
        const sal2 = await sbRpcDR("fn_saldo_cliente", { p_tenant: tenantId, p_cliente: spDR.cliente });
        const resta = Math.round(Number(Array.isArray(sal2) ? (sal2[0] as Record<string, unknown>)?.saldo : sal2) || 0);
        const okMsg = `¡Pago confirmado! 🎉 Pagaste ${fmtCOP(totalDR)} con tu Billetera y te quedan ${fmtCOP(resta)}. Tu pedido ya está en preparación${emo()}`;
        await sendWaAndSave(convId, tenantId, okMsg, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
          pending_order_data: null, pago_pendiente: false,
          last_message: okMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false,
        });
        return;
      }
      if (/reenv|no me (ha )?llegado|no llego|otro codigo/.test(tNorm)) {
        const marcaDR = await marcaDeDR(branchId);
        const ok = await enviarCodigoPagoDR(tenantId, tel10DR, Number(spDR.total), marcaDR);
        await decir(ok ? "Listo, te enviamos un código nuevo por SMS 😊 Escríbemelo aquí."
                       : "Ya te enviamos varios códigos hace poco 🙏 Espera unos minutos, o paga en efectivo o por transferencia.");
        if (!ok) { delete (state as unknown as Record<string, unknown>).saldo_pago; state.pago = null; await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state }); }
        return;
      }
      const otroPago = extractPago(clienteTexto, pagosCfg);
      const metS = getMetodosPago(pagosCfg).find(m => m.id === "__saldo");
      if (otroPago && (!metS || normalizarTexto(otroPago) !== normalizarTexto(metS.nombre))) {
        /* Cambio de opinion: se suelta la billetera y el flujo normal sigue
           con el metodo nuevo — sin return. */
        delete (state as unknown as Record<string, unknown>).saldo_pago;
        state.pago = otroPago;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
      } else {
        await decir("Estoy esperando el código de 6 dígitos que te llegó por SMS 😊 Si no te llegó, escríbeme *reenviar*.");
        return;
      }
    }
  }

  /* ── PREGUNTAS DE PUNTOS (20-ago-2026, version simplificada por Sergio) ──
     "¿cuantos puntos tengo?" -> el saldo, directo. "¿como redimo / que
     premios hay?" -> a la APP con un boton: alli se registra, ve sus puntos,
     el catalogo y redime. Si el mensaje ADEMAS pide comida, se responde lo de
     puntos y el flujo sigue (leccion de la carta: nada de returns a ciegas). */
  {
    const tNormP = normalizarTexto(clienteTexto);
    const pideSaldoPts = /\b(cuantos?|cuanto)\b[^.]*\bpuntos\b|\bmis puntos\b|\bpuntos tengo\b|\bcomo van mis puntos\b/.test(tNormP);
    const pideRedimir = /\b(redimir|redimo|canjear|canjeo|reclamar|reclamo)\b|\bpremios?\b|\bcatalogo\b/.test(tNormP)
      && !/\bpremio\s*1\b/.test(tNormP);
    if ((pideSaldoPts || pideRedimir) && !(state as unknown as Record<string, unknown>).saldo_pago) {
      const tel10P = String(fromPhone || "").replace(/\D/g, "").slice(-10);
      const urlAppP = await urlAppDR(tenantId);
      let respondido = false;
      /* El verbo de REDIMIR manda: "como redimo mis puntos" es la pregunta de
         redimir aunque nombre sus puntos. */
      if (pideRedimir) {
        const msgR = "¡Los premios se redimen desde nuestra app! 🎁 Regístrate con este mismo número y ahí ves tus puntos, el catálogo completo de premios y los rediemes tú mismo, facilito.";
        if (urlAppP) await sendWaBotonApp(convId, tenantId, msgR, `Abrir la app${emo()}`, urlAppP, fromPhone, phoneId, accessToken);
        else await sendWaAndSave(convId, tenantId, msgR, fromPhone, phoneId, accessToken);
        respondido = true;
      } else if (pideSaldoPts) {
        const f = await sbGet(`/rest/v1/pos_puntos?tenant_id=eq.${tenantId}&telefono=eq.${tel10P}&select=puntos&limit=1`);
        const pts = Math.round(Number(f?.[0]?.puntos) || 0);
        const msgP = pts > 0
          ? `Tienes ${pts.toLocaleString("es-CO")} puntos 🎉 En nuestra app los ves al día, sigues tu progreso y los rediemes por premios.`
          : "Aún no tienes puntos registrados 😊 En cada compra ganas 1 punto por cada $1.000 — da tu número al pedir y empiezas a acumular. En nuestra app los ves y los rediemes.";
        if (urlAppP) await sendWaBotonApp(convId, tenantId, msgP, `Abrir la app${emo()}`, urlAppP, fromPhone, phoneId, accessToken);
        else await sendWaAndSave(convId, tenantId, msgP, fromPhone, phoneId, accessToken);
        respondido = true;
      }
      if (respondido) {
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: "(puntos)", last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        /* Si el mensaje era SOLO la pregunta, aqui se acaba; si ademas trae
           pedido, el flujo sigue y lo captura. OJO: "premio" tambien es la
           gaseosa PREMIO del catalogo — las palabras de ESTA conversacion se
           quitan antes de mirar si el mensaje ademas pide comida, o el flujo
           seguia y soltaba un "¿que se te antoja?" de mas. */
        const sinPalabrasPuntos = clienteTexto.replace(/\b(premios?|puntos?|catalogo|redimir|redimo|canjear|canjeo|reclamar|reclamo)\b/gi, " ");
        if (!mencionaProductoCatalogo(sinPalabrasPuntos)) return;
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Saludo → bienvenida Paco
  // ═══════════════════════════════════════════════════════════════════════════

  const esGaludo = SALUDO_REGEX.test(clienteTexto.trim());
  const minutosInactivo = state.last_activity
    ? (Date.now() - new Date(state.last_activity).getTime()) / 60000
    : 999;
  // Sesión expirada: sin pedido en curso, timeout, o pedido ya confirmado
  const sesionExpirada = !state.producto || minutosInactivo > 15 || state.resumen_enviado;

  /* FASE C1 (15-ago): la presentacion tambien sale cuando el PRIMER mensaje
     trae ganas de pedir pero sin producto concreto ("hola buenas para un
     servicio de domicilio" — el caso real de la primera noche, que se quedo
     sin presentacion porque la regex solo acepta saludos PUROS). Solo en el
     primer contacto (el bot no ha hablado nunca en esta conversacion), y
     nunca por encima de una pregunta, la carta o un producto ya nombrado. */
  const botYaHablo = histCtx.some(h => h.direction === "out");
  const saludoImplicito = !botYaHablo && clasifico
    && (intenciones.pedir === true || intenciones.domicilio === true
        || intenciones.entrega === "domicilio")
    && intenciones.pregunta !== true && intenciones.carta !== true
    && intenciones.precio !== true && intenciones.horario !== true
    && intenciones.ubicacion !== true
    && !mencionaProductoCatalogo(clienteTexto);

  if ((esGaludo || saludoImplicito) && sesionExpirada) {
    const prevDir = (!state.resumen_enviado && state.direccion) ? state.direccion : null;
    state = newPacoState();
    if (prevDir) { state.direccion = prevDir; state.direccion_heredada = true; }
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state, pago_pendiente: false, recordar_at: null });

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
        bienvenida = `¡Hola! Soy ${botNm}${restNm ? `, el asistente virtual de ${restNm}` : ""} 🤖 ¿Qué deseas pedir?${emo()}`;
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
    /* ¿LO REVISA EL SISTEMA O UNA PERSONA? Apagada la verificacion automatica,
       el comprobante queda en el chat y el pedido se crea cuando el dueño da
       "Confirmar pago". Ese camino ya existia; lo que no habia era como
       escogerlo. */
    if (!cfgPago(cfg).verificacion_auto) {
      const msgManual = getFraseTexto(frasesCfg.comprobante_recibido)
        || "¡Recibimos tu comprobante! 🧾 Lo revisamos y te confirmamos en un momento 🙏";
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { human_takeover: true });
      await sendWaAndSave(convId, tenantId, msgManual, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgManual, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
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

  resumen: if (state.resumen_enviado) {

    /* LO PRIMERO: ¿está pidiendo QUITAR algo?

       Aquí también lee el lector. Era el único sitio del motor donde no
       corría, y es justo donde el cliente habla más libre: ya vio el resumen y
       está corrigiendo.

       Y va ANTES que la confirmación a propósito. "mejor el sin la adición
       entonces porfa" trae un "mejor" y un "porfa" y se colaba como un SÍ: el
       bot mandaba el pedido a cocina CON la adición que le acababan de pedir
       quitar. Pedir un cambio nunca es confirmar. */
    const leidoCorr = await leerPedido(
      clienteTexto, state, currentProductData, null,
      pagosCfg, MODS_CACHE?.grupos || [],
      histCtx.slice(-4).map(h => `${h.direction === "in" ? "Cliente" : "Tú"}: ${String(h.body || "").slice(0, 120)}`).join("\n"),
    );
    /* ══ EL PEDIDO YA ESTA EN COCINA: LOS CAMBIOS LOS HACE UNA PERSONA ══════
       (19-ago). Para el cambio de DIRECCION esto ya existia; para los PLATOS
       no. Un cliente que agrega una gaseosa despues de que su pedido salio a
       cocina hacia que Paco rearmara el resumen y volviera a preguntar el
       pago, como si el pedido no existiera — con la comanda ya impresa y el
       plato en la plancha.

       Quien tiene que decidir si todavia se alcanza a meter la gaseosa es la
       cocina, no el bot. Se le avisa al cliente y pasa a una persona. */
    const pideCambiarPlatos =
      (Array.isArray(leidoCorr.quitar) && leidoCorr.quitar.length > 0)
      || (Array.isArray(leidoCorr.agregados) && leidoCorr.agregados.length > 0)
      /* Un producto IGUAL al que ya tiene no es un cambio: el lector repite lo
         que hay cuando el cliente dice "si, la premium mixta". Solo cuenta si
         es OTRO plato. */
      || (!!leidoCorr.producto
          && normalizarTexto(String(leidoCorr.producto)) !== normalizarTexto(state.producto || ""));
    if (pideCambiarPlatos) {
      const yaEnCocina = await sbGet(
        `/rest/v1/chat_conversations?id=eq.${convId}&select=order_id&limit=1`
      ) as Array<Record<string, unknown>> | null;
      if (yaEnCocina?.[0]?.order_id) {
        const avisoPlato = "Tu pedido ya está en cocina 🍳 Le paso el cambio a la persona "
          + "encargada para ver si alcanza a entrar 🙏 Un momento por favor.";
        await sendWaAndSave(convId, tenantId, avisoPlato, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
          human_takeover: true, handoff_motivo: "cambio de platos con el pedido ya enviado",
          handoff_at: new Date().toISOString(),
          last_message: avisoPlato, last_message_at: new Date().toISOString(),
          last_sender: "agent", last_read: false, ai_typing: false,
        });
        console.log("[correccion] platos cambiados con pedido ya creado -> a una persona");
        return;
      }
    }

    if (Array.isArray(leidoCorr.quitar) && leidoCorr.quitar.length) {
      const { quitados, quitarActual } = quitarDelPedido(state, leidoCorr.quitar);
      /* El plato en curso solo se puede sacar si queda otro en el pedido. */
      if (quitarActual && (state.items || []).length > 0) {
        const ultimo = state.items[state.items.length - 1];
        state.items = state.items.slice(0, -1);
        state.producto = ultimo.producto;
        state.producto_categoria = ultimo.categoria ?? null;
        state.tamano = ultimo.tamano ?? null;
        state.tipo = ultimo.tipo ?? null;
        state.cantidad = ultimo.cantidad || 1;
        state.adiciones = ultimo.adiciones ?? "";
        state.preferencias = ultimo.preferencias ?? null;
        /* Las variantes se guardan por grupo. Sin reconstruirlas, el flujo
           volvería a preguntar "¿mixta, carne o pollo?" por algo que el
           cliente ya contestó hace rato. */
        state.tipos = {};
        currentProductData = await loadProductData(state.producto!, branchId, state.producto_categoria);
        if (currentProductData?.variables && state.tipo) {
          for (const t of String(state.tipo).split(",").map(x => x.trim()).filter(Boolean)) {
            for (const g of currentProductData.variables) {
              if (state.tipos[g.id]) continue;
              const ok = extractVariable(t, g.options || []);
              if (ok) { state.tipos[g.id] = ok; break; }
            }
          }
        }
        quitados.push(quitarActual);
      }
      if (quitados.length) {
        console.log("[quitar] se sacaron del pedido:", JSON.stringify(quitados));
        try {
          const sumMsg = await buildSummaryFromState(state, cfg, branchId, domiciliosCfg);
          state.resumen_enviado = true;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        } catch (err) { console.error("re-resumen tras quitar:", err); }
        return;
      }
    }

    /* ── ¿ESTA CAMBIANDO LA DIRECCION? (18-ago) ────────────────────────
       "mejor mandalo a la calle 15, barrio Bella Vista" despues del resumen:
       Paco CONTESTABA QUE SI y el pedido conservaba la direccion vieja, el
       barrio viejo y el domicilio viejo. El domiciliario salia para la otra
       punta y el cobro quedaba mal — y como el bot dijo que si, nadie se
       entera hasta que llama el cliente.

       Cambiar la direccion invalida lo que DEPENDE de ella: el barrio y el
       precio del domicilio se borran para que se vuelvan a calcular. Es la
       regla que Sergio enuncio: al cambiar, se limpia lo que colgaba. */
    {
      /* SI EL PEDIDO YA SALIO A COCINA, ESTO NO LO ARREGLA UN BOT. Cambiar el
         estado del chat no cambia la comanda que ya se imprimio ni el pedido
         que ya esta en la pantalla de domicilios: el domiciliario saldria para
         la direccion vieja igual, y encima el cliente se quedaria tranquilo
         porque el bot le dijo que si. Con un pedido ya creado, la correccion
         va a una persona. */
      const dirNueva = String(leidoCorr.direccion || "").trim();
      const barNuevo = String(leidoCorr.barrio || "").trim();
      const esLlevarYa = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
      const dirDistinta = !!dirNueva && normalizarTexto(dirNueva) !== normalizarTexto(state.direccion || "");
      const barDistinto = !!barNuevo && normalizarTexto(barNuevo) !== normalizarTexto(state.barrio || "");
      if (!esLlevarYa && (dirDistinta || barDistinto) && (state.direccion || state.barrio)) {
        const yaCreado = await sbGet(
          `/rest/v1/chat_conversations?id=eq.${convId}&select=order_id&limit=1`
        ) as Array<Record<string, unknown>> | null;
        if (yaCreado?.[0]?.order_id) {
          const avisoDir = "Claro, yo le paso el cambio de dirección a la persona encargada "
            + "para que lo ajuste antes de que salga 🙏 Un momento por favor.";
          await sendWaAndSave(convId, tenantId, avisoDir, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
            human_takeover: true, handoff_motivo: "cambio de direccion con el pedido ya enviado",
            handoff_at: new Date().toISOString(),
            last_message: avisoDir, last_message_at: new Date().toISOString(),
            last_sender: "agent", last_read: false, ai_typing: false,
          });
          console.log("[correccion] direccion cambiada con pedido ya creado -> a una persona");
          return;
        }
        if (dirDistinta) state.direccion = dirNueva;
        /* El barrio y el domicilio cuelgan de la direccion: se recalculan. */
        state.barrio = barNuevo || null;
        /* `domi_mostrado` no es un campo del estado sino algo que escribe el
           resumen; se limpia por el mismo camino por el que se escribe. */
        (state as unknown as Record<string, unknown>).domi_mostrado = null;
        (state as unknown as Record<string, unknown>).total_mostrado = null;
        state.complemento_dir_pendiente = null;
        state.direccion_heredada = false;
        console.log("[correccion] direccion nueva:", state.direccion, "| barrio:", state.barrio);
        try {
          const sumMsg = await buildSummaryFromState(state, cfg, branchId, domiciliosCfg);
          state.resumen_enviado = true;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          await sendWaAndSave(convId, tenantId, sumMsg, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: sumMsg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        } catch (err) { console.error("re-resumen tras cambiar direccion:", err); }
        return;
      }
    }

    /* ¿ESTÁ AGREGANDO OTRO PLATO? (trampa de Sergio, 15-ago: "puedo agregar
       porfavor una salchi super queso" después del resumen se ignoraba y el
       bot repetía el mismo resumen — dos veces). Hasta hoy, tras el resumen
       solo existían quitar, cambiar el pago y confirmar; agregar no tenía
       rama. La solución NO es construir otra maquinaria aquí: si el lector
       vio un producto y el mensaje habla de agregar, el mensaje SIGUE DERECHO
       al flujo normal — allí el 14b archiva el plato en curso, arranca el
       nuevo con sus propias preguntas (tamaño, variante), conserva dirección,
       pago, nombre y upsell ya respondidos, y el resumen se rearma al final
       con todo. Reusar el camino maduro, no duplicarlo. */
    const AGREGA_RE = /\b(agrega(r|me|s)?|a[nñ][aá]de(me)?|s[uú]ma(le|me)?|tambi[eé]n|otra|otro|adem[aá]s|me\s+das|dame|quiero|quisiera)\b/i;
    /* Y LA CORRECCION TAMBIEN PASA (18-ago, tarea 0c). "Es la premium mixta"
       tras un resumen equivocado no decia "agregar" ni "pedir", asi que caia
       aqui a reenviar el MISMO resumen — o peor, a sumar un segundo plato. Si
       esta corrigiendo y nombra un producto, sigue derecho al flujo normal,
       donde el 14b ahora REEMPLAZA en vez de archivar. */
    const esCorrPost = intenciones.corrige === true
      || CORRIGE_RE.test(clienteTexto)
      || (CORRIGE_ES_LA_RE.test(clienteTexto.trim()) && !clienteTexto.includes("?") && !clienteTexto.includes("¿"));
    const corrNombraProducto = esCorrPost && (
      !!leidoCorr.producto ||
      productosNuevosEnTexto(clienteTexto, state, currentProductData, intenciones).length > 0
    );
    if (corrNombraProducto) console.log("[resumen] corrige el plato — sigue al flujo normal");
    /* LA PUERTA SE ABRIA SOLO SI EL LECTOR DEVOLVIA `producto`, y despues del
       resumen a menudo no lo devuelve: ya hay un plato en curso y el modelo
       entiende el mensaje como un aNadido. Resultado: "agregame una coca cola
       personal" caia al camino conversacional, donde el modelo REDACTABA un
       resumen con la gaseosa incluida... que no estaba en el pedido. El total
       decia $31.000 y la comanda llevaba solo la salchipapa.
       Ahora tambien abre cuando el CATALOGO reconoce un plato nuevo en el
       mensaje — la misma comprobacion determinista que usa la correccion. */
    const platosNuevosPost = productosNuevosEnTexto(clienteTexto, state, currentProductData, intenciones);
    const nombraPlatoNuevo = !!leidoCorr.producto || platosNuevosPost.length > 0;
    if ((nombraPlatoNuevo && (AGREGA_RE.test(clienteTexto) || intenciones.pedir === true)) || corrNombraProducto) {
      console.log("[resumen] agrega otro plato:",
        JSON.stringify(leidoCorr.producto || platosNuevosPost.map(p => p.name)), "— sigue al flujo normal");
      state.resumen_enviado = false;
      /* "una salchi super queso" nombra el plato UNA vez → es el plato, no
         una adición (regla v255). Pero el lector y el clasificador, al ver el
         verbo "agregar", marcaban "super queso" como topping y el flujo se lo
         pegaba al plato ANTERIOR (+$12.000 fantasma — lo cazó Sergio). Aquí
         el cliente está agregando un PLATO: se apagan las señales de topping
         de este mensaje y deciden las reglas deterministas del 14a, que ya
         saben distinguir "una super queso" de "con super queso". */
      intenciones.agregados = [];
      break resumen;
    }

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
        if (await frenarBucle(convId, "llevar_efectivo")) return;
        // Para-llevar + prepago: no se puede efectivo → explicar y mantener el resumen
        const msgLl = getFraseTexto(frasesCfg.llevar_efectivo)
          || `Qué pena contigo 🙏 Para recoger tu pedido el pago debe hacerse por transferencia primero. Si prefieres efectivo, te lo preparamos cuando te acerques al local${emo()}`;
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

    /* CONTESTAR EL MÉTODO DE PAGO ES CONFIRMAR.

       El resumen ahora cierra con la pregunta del pago, así que "transferencia"
       es la respuesta a todo el mensaje: ya vio qué pidió, cuánto es, y está
       diciendo cómo paga. Antes esto caía en "corrección" y le volvía a mandar
       el mismo resumen con el 💳 puesto, para preguntarle otra vez si confirma.
       Dos resúmenes idénticos para un solo pedido. */
    const pagoEraLoQueFaltaba = !state.pago
      && findNextStep(state, pasos, true, domiciliosCfg)?.id === "pago";
    const pagoDelMensaje = pagoEraLoQueFaltaba
      ? (extractPago(clienteTexto, pagosCfg) || pagoPorIntencion())
      : null;
    if (pagoDelMensaje) {
      state.pago = pagoDelMensaje;
      console.log(`[resumen] el pago llegó en la respuesta al resumen: ${pagoDelMensaje} — vale como confirmación`);
    }

    const isConfirmacion = !!pagoDelMensaje || esConfirmacion(clienteTexto, intenciones);

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

      /* ── PAGO CON LA BILLETERA (20-ago-2026, pedido de Sergio) ─────────
         Tres escenarios, y Paco reconoce los tres:
           1. sin cuenta en la app  -> instalar/registrarse/recargar (boton)
           2. con cuenta, sin saldo -> recargar en la app (boton)
           3. con saldo             -> codigo por SMS, y al recibirlo se
              descuenta y el pedido queda PAGADO — mismo camino que la caja. */
      const metSaldoDR = getMetodosPago(pagosCfg).find(m => m.id === "__saldo");
      const esPagoSaldoDR = !!metSaldoDR && (() => {
        const pg = normalizarTexto(String(state.pago || ""));
        if (!pg) return false;
        const nm = normalizarTexto(metSaldoDR.nombre);
        return pg === nm || nm.includes(pg) || pg.includes(nm) || /\b(saldo|monedero)\b/.test(pg);
      })();
      if (esPagoSaldoDR) {
        const tel10DR = String(fromPhone || "").replace(/\D/g, "").slice(-10);
        const urlApp = await urlAppDR(tenantId);
        const decirYSoltarPago = async (msg: string, boton: boolean) => {
          state.pago = null;   // que pueda escoger otro metodo sin trabarse
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          if (boton && urlApp) await sendWaBotonApp(convId, tenantId, msg, `Abrir la app${emo()}`, urlApp, fromPhone, phoneId, accessToken);
          else await sendWaAndSave(convId, tenantId, msg + (urlApp ? "\n\n👉 " + urlApp : ""), fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msg, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        };
        const totalDR = Math.round(Number((state as unknown as Record<string, unknown>).total_mostrado) || 0);
        if (totalDR <= 0) {
          await decirYSoltarPago("Para pagar con tu Billetera necesito el total cerrado del pedido y aún me falta un dato 🙏 ¿Prefieres pagar en efectivo o por transferencia?", false);
          return;
        }
        const cliDR = await clienteBilleteraDR(tenantId, tel10DR);
        if (!cliDR || !cliDR.registrado) {
          // Escenario 1: sin cuenta en la app.
          await decirYSoltarPago("Para pagar con la Billetera necesitas tu cuenta en nuestra app 😊 Instálala, regístrate con este mismo número y recarga tu saldo — ahí mismo ves tus puntos y premios. Mientras tanto, ¿pagas en efectivo o por transferencia?", true);
          return;
        }
        const salDR0 = await sbRpcDR("fn_saldo_cliente", { p_tenant: tenantId, p_cliente: cliDR.id });
        const saldoDR = Math.round(Number(Array.isArray(salDR0) ? (salDR0[0] as Record<string, unknown>)?.saldo : salDR0) || 0);
        if (saldoDR < totalDR) {
          // Escenario 2: cuenta si, saldo no alcanza.
          const falta = totalDR - saldoDR;
          await decirYSoltarPago(`Tu Billetera tiene ${fmtCOP(saldoDR)} y el pedido es ${fmtCOP(totalDR)} — te faltan ${fmtCOP(falta)} 🙏 Puedes recargar en la app y me avisas, o pagas en efectivo o por transferencia.`, true);
          return;
        }
        // Escenario 3: hay saldo — el codigo viaja por SMS, como en la caja.
        const marcaDR = await marcaDeDR(branchId);
        const enviado = await enviarCodigoPagoDR(tenantId, tel10DR, totalDR, marcaDR);
        if (!enviado) {
          await decirYSoltarPago("No pudimos enviarte el código de confirmación a tu celular 🙏 ¿Pagas en efectivo o por transferencia?", false);
          return;
        }
        (state as unknown as Record<string, unknown>).saldo_pago = { total: totalDR, cliente: cliDR.id };
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
        const msgCod = `Tu Billetera tiene ${fmtCOP(saldoDR)} 🎉 Te acabamos de enviar un código de 6 dígitos por mensaje de texto (SMS): escríbemelo aquí y confirmo tu pago de ${fmtCOP(totalDR)}.`;
        await sendWaAndSave(convId, tenantId, msgCod, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgCod, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }

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
        const cPago = cfgPago(cfg);
        /* EL PAGO NO SIEMPRE VA ANTES DEL PEDIDO. Encendido (lo de siempre) el
           pedido no entra a la cocina hasta que llegue el comprobante. Apagado,
           el pedido se crea de una vez y el pago queda pendiente: hay
           restaurantes que ya conocen a sus clientes y no quieren hacerlos
           esperar. Antes esto no se podia cambiar desde ninguna pantalla. */
        if (!cPago.pago_previo) {
          const clasifPP = clasificarDireccion(state.direccion || "", domiciliosCfg, sinNomenclaturaCliente2);
          const domiPP = clasifPP.tipo === "para_llevar" ? 0 : lookupDomiPrice(ubicacionPedido(state), domiciliosCfg);
          try {
          await createWhatsappOrder(buildOrderArgs(state, domiPP ?? 0), branchId, tenantId, fromPhone, cfg._operacion as Record<string, unknown> | null, convId);
          } catch (err) { console.error("Error creando pedido (pago no previo):", err); }
        }
        /* LA ALARMA VIVE EN LA CONVERSACION, no en un vigilante que revisa a
           todo el mundo cada rato. En 0 el restaurante pidio esperar sin
           limite, y entonces no se pone ninguna. */
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
          pago_pendiente: true,
          recordar_at: cPago.espera_min > 0
            ? new Date(Date.now() + cPago.espera_min * 60_000).toISOString()
            : null,
        });
        await sendWaAndSave(convId, tenantId, compMsg, fromPhone, phoneId, accessToken);
        /* EL QR ES EL DE LA CUENTA QUE ESCOGIO EL CLIENTE. Antes habia uno
           global: con dos cuentas configuradas, el cliente recibia el QR de una
           y el numero de la otra. El general queda de respaldo para quien solo
           tenga uno. */
        const cuentaElegida = (getMetodosPagoRaw(pagosCfg) || []).find(m =>
          m && m.digital === true && normalizarTexto(String(m.nombre || "")) === normalizarTexto(String(state.pago || "")));
        const qrUrl = cPago.enviar_qr
          ? (String(cuentaElegida?.qr_url || "") || (pagosCfg?.qr_imagen_url as string) || "")
          : "";
        const qrTxt = (pagosCfg?.qr_texto as string) || "";
        if (qrUrl) {
          await sleep(600);
          const qrRes = await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: { link: qrUrl, caption: qrTxt || undefined } });
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
          if (await frenarBucle(convId, "llevar_efectivo")) return;
          const msgLlevar = getFraseTexto(frasesCfg.llevar_efectivo) ||
            `Qué pena contigo 🙏 Si deseas que tu pedido esté listo cuando pases por él, el pago debe hacerse por transferencia primero. Si decides pagar en efectivo, con mucho gusto te puedes acercar al establecimiento y tu pedido se prepara una vez esté pago${emo()}`;
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
          await createWhatsappOrder(orderArgs, branchId, tenantId, fromPhone, cfg._operacion as Record<string, unknown> | null, convId);
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
          closeMsg = `En un momento enviamos tu pedido${emo()} ¡Con muchísimo gusto!`;
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
    const correctedSlots = runExtractors(clienteTexto, state, null, pagosCfg, currentProductData, nombreConfirmar, intenciones, cfg, false, null, leidoCorr);
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
  /* Se le pregunta al CATALOGO, y la lista de frases queda solo de respaldo
     para lo que el catálogo no alcance a ver (un producto escrito con typo). */
  /* Lo que se le estaba preguntando ANTES de mirar si trae producto nuevo.
     La deteccion reinicia el paso pendiente, y despues ya no hay como saberlo. */
  const pasoAntesId = state.producto
    ? (findNextStep(state, pasos, false, domiciliosCfg)?.id || null)
    : null;

  const nuevosEnTexto = productosNuevosEnTexto(clienteTexto, state, currentProductData, intenciones);
  /* PREGUNTAR EL PRECIO NO CAMBIA EL PEDIDO (18-ago). "¿es la premium mas
     cara?" en mitad de un pedido respondia el precio — bien — pero ADEMAS
     archivaba lo que iba y arrancaba una Premium. Si la intencion es PRECIO y
     no PEDIR, y es una pregunta, los nombres del mensaje son tema de
     conversacion, no un plato nuevo. (Solo con pedido en curso: el
     clasificador decide, y "¿me regalas una premium?" es pedir, no precio.) */
  const soloPreguntaPrecio = !!state.producto
    && intenciones.precio === true
    && intenciones.pedir !== true
    && (clienteTexto.includes("?") || clienteTexto.includes("¿") || intenciones.pregunta === true);
  const needsProducto = !soloPreguntaPrecio && (!state.producto
    || nuevosEnTexto.length > 0
    || NUEVO_PROD_REGEX.test(clienteTexto));
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
    /* LO QUE PIDIO MANDA SOBRE UNA PALABRA SUELTA DEL MENSAJE.

       "una PERSONAL super queso y un PERRO especial": son DOS platos. La
       palabra "perro" es del segundo, pero se usaba como contexto del primero
       y la Super Queso salia de PERROS CALIENTES — que no tiene variantes, y
       por eso Paco no pregunto ninguna.

       "Personal" solo existe en la Super Queso de Salchipapas. Si el cliente
       nombro una presentacion o una variante que SOLO tiene una de las
       candidatas, esa es: lo dice el catalogo, no una coincidencia de texto. */
    {
      const tNorm = " " + normalizarTexto(clienteTexto) + " ";
      const porOpcion = mismos.filter(m =>
        (m.opciones || []).some(o => o.length >= 4 && tNorm.includes(" " + o + " ")));
      if (porOpcion.length === 1) {
        console.log(`[categoria] "${porOpcion[0].name}" resuelto por su opción, no por el texto: ${porOpcion[0].cat}`);
        return { name: porOpcion[0].name, cat: porOpcion[0].cat };
      }
    }

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

  /* EN UNA RELECTURA NO SE VUELVE A EXTRAER NADA.

     El estado ya tiene todo lo que el cliente dijo; lo unico que cambio fue
     que el dato que faltaba (el precio del domicilio) ya esta resuelto. Si se
     re-extrae, el MISMO texto se interpreta contra un paso distinto: en la
     prueba, "Los Naranjos de Prueba" se leyo como el NOMBRE del cliente y el
     resumen salio con "👤 Los Naranjos de Prueba". Aqui solo hay que seguir. */
  if (needsProducto && !productoDetectado && !relectura) {
    /* 1) Matching determinístico del texto contra el catálogo.

       Con un pedido ya en curso se usan los productos FILTRADOS, no todos los
       que aparezcan: en "Mixta porfavor, y tambien me das una super queso" el
       primer nombre del texto es "Mixta" —que es la respuesta a la pregunta de
       la variante y además una salchipapa de la carta— y quedarse con ese
       perdía la Super Queso igual que antes. */
    const matches = state.producto ? nuevosEnTexto : matchProductosEnTexto(clienteTexto);
    if (matches.length > 0) {
      const primero = matches[0];
      const res = resolverCategoria(primero.name);
      if (res === "ambiguo") {
        // preguntar la categoría (frase configurable) y esperar la respuesta
        const mismos = DYN_PROD_MAP.filter(e => e.key === normalizarTexto(primero.name));
        const cats = [...new Set(mismos.map(m => m.cat))];
        (state as unknown as Record<string, unknown>).producto_ambiguo = { nombre: primero.name, cats, intentos: 0 };
        /* EN SINGULAR, PERO EN ESPAÑOL (19-ago). Quitarle la "s" a todo dejaba
           "Adicione" y "Salchipapa tradicionale" en un mensaje que lee el
           cliente. La regla del idioma: si antes de la "es" hay consonante se
           va la "es" (adicionES -> adicion, tradicionalES -> tradicional); si
           hay vocal, solo la "s" (calientES -> caliente, bebidAS -> bebida). */
        const singular = (s: string) => s.split(/\s+/).map(w => {
          if (w.length <= 3) return w;
          const b = w.toLowerCase();
          if (!b.endsWith("s")) return w;
          const sinS  = w.slice(0, -1);                    // calientes -> caliente
          const sinES = b.endsWith("es") ? w.slice(0, -2) : null;  // adiciones -> adicion
          /* Cual de las dos es: en espaNol una palabra puede terminar en n, l,
             r, d, z, j o s, pero no en t ni en b. "adicion" vale, "calient"
             no — asi sale "Adicion" y "Perro caliente" en vez de "Adicione" y
             "Perro calient", que es lo que estaba leyendo el cliente. */
          if (sinES && /[nlrdzjs]$/i.test(sinES)) return sinES;
          return sinS;
        }).join(" ");
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

      /* LOS DEMAS PLATOS DEL MISMO MENSAJE VAN A LA COLA (18-ago). Antes se
         tomaba matches[0] y el resto se PERDIA sin dejar rastro. Solo entran
         los clasificados como PLATO (una adicion pedida "sobre" un plato no es
         un plato aparte), resueltos contra el catalogo; lo ambiguo no se
         adivina — mejor que el flujo lo pregunte despues. */
      if (productoDetectado && matches.length > 1) {
        const platosMsg = state.producto
          ? matches            // nuevosEnTexto ya viene filtrado a platos
          : mencionesClasificadas(clienteTexto, false, intenciones).filter(m => m.clase === "plato");
        const vistos = new Set<string>([normalizarTexto(productoDetectado)]);
        for (const it of state.items || []) if (it.producto) vistos.add(normalizarTexto(it.producto));
        /* LA VARIANTE DEL PRIMERO NO ES OTRO PLATO. "premium de carne y un
           hit": "carne" es el sabor de la Premium — y tambien existe como
           salchipapa. Sin este filtro se encolaba un "1x Carne" fantasma.
           Las opciones del producto recien detectado se excluyen, SALVO que
           la mencion traiga su propia palabra de categoria pegada adelante
           ("...y una SALCHIPAPA carne"): ahi si es un plato aparte. */
        const filaPrimero = DYN_PROD_MAP.find(e =>
          e.key === normalizarTexto(productoDetectado!) && (!productoCategoriaDet || e.cat === productoCategoriaDet))
          || DYN_PROD_MAP.find(e => e.key === normalizarTexto(productoDetectado!));
        const opcionesPrimero = new Set((filaPrimero?.opciones || []).map(o => normalizarTexto(o)));
        const tNormCola = normalizarTexto(clienteTexto);
        const CAT_PEGADA_RE = /(salchipapas?|salchi|hamburguesas?|perros?|sandwich|sanduche|bebidas?|jugos?|gaseosas?)\s+(?:de\s+)?$/;
        /* EL PLATO LEIDO A MEDIAS NO ES OTRO PLATO (19-ago, hallado en las
           pruebas). "salchipapa MAICITOS ESPECIAL mixta personal" encolaba
           ademas la MAICITOS a secas —las dos existen en la carta— y el pedido
           salia con una salchipapa fantasma de $13.000 que nadie pidio.
           Si el nombre de uno esta contenido en el del otro, son el mismo
           plato leido con distinto alcance; gana el largo. Solo son dos platos
           de verdad si el cliente lo nombro dos veces. */
        const vecesEnTexto = (n2: string): number => {
          const aguja = " " + n2 + " ";
          let i = 0, c = 0;
          for (;;) {
            const p = tNormCola.indexOf(aguja, i);
            if (p < 0) break;
            c++; i = p + 1;
          }
          return c;
        };
        const nActivo = normalizarTexto(productoDetectado!);
        for (const m of platosMsg) {
          const n = normalizarTexto(m.name);
          if (vistos.has(n)) continue;
          if (n !== nActivo && (nActivo.includes(n) || n.includes(nActivo)) && vecesEnTexto(n) < 2) {
            console.log("[cola] descartado por ser el mismo plato: " + m.name + " vs " + productoDetectado);
            continue;
          }
          if (opcionesPrimero.has(n)) {
            const antes = tNormCola.slice(0, Math.max(0, tNormCola.indexOf(n)));
            /* Pero un ARTICULO delante lo vuelve plato propio: en "premium de
               carne y UNA MIXTA personal" la mixta es otra salchipapa, no el
               sabor de la primera — se perdia una linea entera del pedido. La
               diferencia con "premium DE carne" es justo esa palabra. */
            const ARTICULO_RE = /\b(un|una|otro|otra|dos|tres|cuatro|cinco|[0-9]+)\s+$/;
            if (!CAT_PEGADA_RE.test(antes) && !ARTICULO_RE.test(antes)) continue;   // es la variante del primero
          }
          const r2 = resolverCategoria(m.name);
          if (!r2 || r2 === "ambiguo") continue;
          vistos.add(n);
          (state.cola = state.cola || []).push({ nombre: r2.name, cat: r2.cat, texto: clienteTexto.slice(0, 300) });
        }
        if ((state.cola || []).length) {
          console.log("[cola] en espera:", (state.cola || []).map(x => x.nombre).join(", "));
        }
      }
    }
    // 2) Respaldo GPT (typos, formas raras) + validación contra el catálogo
    if (!productoDetectado) {
      const result = await extractProducto(clienteTexto, menuText);
      cantidadDetectada = result.cantidad;
      /* El candado: si el nombre no esta en lo que escribio el cliente, no
         entra — aunque exista en la carta. Sin producto, el flujo cae al
         bloque 14f y le manda la CARTA, que es justo lo que hay que hacer
         cuando solo nombro la categoria. */
      /* UNA CATEGORIA NO ES UN PRODUCTO — y el que solo nombra la categoria
         necesita ver la CARTA, no que le adivinen el plato.

         A "me das porfavor una salchipapa" el respaldo contestaba
         "SALCHIPAPAS TRADICIONALES", que es la categoria. Y al buscarla en el
         catalogo se quedaba con "Papas", porque "salchiPAPAS tradicionales"
         contiene esa palabra: el pedido arrancaba con unas papas de $8.000.
         Con producto ya puesto, el bloque que manda la carta (14f) ni se
         evaluaba, y el modelo improvisaba una lista de platos — distinta cada
         vez, incompleta y mezclando categorias con productos.

         Sin producto, el flujo cae solo en 14f y manda la carta. */
      const esNombreDeCategoria = (s: string): boolean => {
        const n = normalizarTexto(s);
        return DYN_CATEGORY_NAMES.some(c => c === n);
      };
      if (result.producto && esNombreDeCategoria(result.producto)) {
        console.log(`producto GPT es una CATEGORÍA ("${result.producto}") — se manda la carta`);
      } else if (result.producto && !nombreEstaEnElTexto(result.producto, clienteTexto)) {
        console.log(`producto GPT inventado ("${result.producto}") — no está en lo que escribió el cliente, descartado`);
      } else if (result.producto) {
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

    /* ¿ESTA CORRIGIENDO O AGREGANDO? (18-ago). "Es la premium mixta" despues
       de un resumen equivocado SUMABA un segundo plato — el enredo de Shirley
       termino en un pedido fantasma de $66.000. Corregir REEMPLAZA el producto
       en curso; y "solo la X" ademas vacia lo archivado: el pedido queda en
       solo eso. Modelo primero, marcadores de respaldo. */
    const txtCorr = clienteTexto.trim();
    const esCorreccion = intenciones.corrige === true
      || CORRIGE_RE.test(txtCorr)
      || (CORRIGE_ES_LA_RE.test(txtCorr) && !txtCorr.includes("?") && !txtCorr.includes("¿"));
    const esSoloEste = /\b(solo|solamente|unicamente|[uú]nicamente|nada mas|nada m[aá]s)\b/i.test(txtCorr);

    if (state.producto && normNuevo !== normActual) {
      /* LO QUE ESTE MENSAJE LE CONTESTO AL PRODUCTO QUE SE VA.
         El mismo mensaje puede cerrar un producto y abrir otro. Los extractores
         corren después de este punto, y para entonces el producto en curso ya
         es el nuevo: la respuesta se perdía. La Premium se guardaba sin su
         "Mixta" y el cliente recibía lo que no pidió. */
      const cierre = runExtractors(clienteTexto, state, null, pagosCfg, currentProductData, nombreConfirmar, intenciones, cfg);

      /* LA ADICION NOMBRADA ANTES DEL PRODUCTO NUEVO ES DEL QUE SE VA.

         "adicion de tocineta y una coca cola": la tocineta es de la
         salchipapa, no de la gaseosa. Las adiciones se extraian DESPUES de
         cambiar de producto, asi que caian siempre en el nuevo — el resumen le
         mostro a Sergio "1x COCA COLA 1.5 Litros + Tocineta".

         Manda el ORDEN en que lo dijo, que es como habla la gente: si la
         nombra despues ("una hamburguesa con tocineta") si es del nuevo. */
      let adicionesDelQueSeVa: string | null = null;
      const posNuevo = nuevosEnTexto.find(m => normalizarTexto(m.name) === normNuevo)?.pos;
      if (typeof posNuevo === "number") {
        const antes = mencionesClasificadas(clienteTexto, false, intenciones)
          .filter(m => m.clase === "adicion" && m.pos < posNuevo)
          .map(m => resolverAdicionCatalogo(m.name))
          .filter((x): x is string => !!x);
        if (antes.length) adicionesDelQueSeVa = [...new Set(antes)].join(", ");
      }

      const archived: SlotItem = {
        producto: state.producto,
        tamano: state.tamano ?? (cierre.tamano as string | undefined) ?? null,
        tipo:   state.tipo   ?? (cierre.tipo   as string | undefined) ?? null,
        cantidad: state.cantidad, adiciones: state.adiciones ?? adicionesDelQueSeVa,
        preferencias: state.preferencias,
        categoria: state.producto_categoria,
      };
      const prevDir  = state.direccion;
      const prevPago = state.pago;
      const prevNom  = state.nombre;
      const prevUpsell = state.upsell;
      const prevItems = state.items;
      const prevCola  = state.cola || [];
      state = newPacoState();
      state.producto  = productoDetectado;
      state.producto_categoria = productoCategoriaDet;
      state.cantidad  = cantidadDetectada;
      state.direccion = prevDir;
      state.pago      = prevPago;
      state.nombre    = prevNom;
      /* Corrigiendo: el que estaba en curso NO se archiva (era el error). Y
         con "solo" el pedido queda unicamente en lo nuevo. */
      state.items     = esCorreccion ? (esSoloEste ? [] : prevItems) : [...prevItems, archived];
      state.cola      = (esCorreccion && esSoloEste) ? [] : prevCola;
      if (esCorreccion) console.log(`[corrige] "${state.producto}" reemplaza al anterior${esSoloEste ? " y limpia el pedido" : ""}`);
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
  /* EL LECTOR, con todo el contexto puesto: que se pregunto, que hay en el
     pedido y cuales son las opciones reales de este producto. Entiende lo que
     el cliente quiso decir; los comparadores de texto quedan de respaldo para
     lo que no alcance a llenar. */
  const histLector = histCtx.slice(-4)
    .map(h => `${h.direction === "in" ? "Cliente" : "Tú"}: ${String(h.body || "").slice(0, 120)}`)
    .join("\n");
  const leidoPedido = relectura ? {} : await leerPedido(
    clienteTexto, state, currentProductData, currentStepId || pasoAntesId,
    pagosCfg, MODS_CACHE?.grupos || [], histLector,
  );

  /* ── QUITAR VALE EN CUALQUIER MOMENTO (18-ago) ────────────────────────
     "quitame la tocineta" solo se atendia DESPUES del resumen. Dicho antes
     —que es cuando mas se dice, mientras se arma el pedido— no pasaba nada: la
     adicion seguia puesta y se cobraba. Aqui se atiende con el mismo motor,
     antes de que los extractores puedan volver a meter lo que se acaba de
     sacar. */
  if (!relectura && Array.isArray((leidoPedido as PedidoLeido).quitar)
      && ((leidoPedido as PedidoLeido).quitar || []).length) {
    const { quitados, quitarActual } = quitarDelPedido(state, (leidoPedido as PedidoLeido).quitar || []);
    /* El plato EN CURSO solo se puede sacar si queda otro: si no, el cliente
       se estaria quedando sin pedido y eso se pregunta, no se adivina. */
    if (quitarActual && (state.items || []).length > 0) {
      const ultimo = state.items[state.items.length - 1];
      state.items = state.items.slice(0, -1);
      state.producto = ultimo.producto;
      state.producto_categoria = ultimo.categoria ?? null;
      state.tamano = ultimo.tamano ?? null;
      state.tipo = ultimo.tipo ?? null;
      state.cantidad = ultimo.cantidad || 1;
      state.adiciones = ultimo.adiciones ?? "";
      state.preferencias = ultimo.preferencias ?? null;
      state.tipos = {};
      currentProductData = await loadProductData(state.producto!, branchId, state.producto_categoria);
      if (currentProductData?.variables && state.tipo) {
        for (const t of String(state.tipo).split(",").map(x => x.trim()).filter(Boolean)) {
          for (const g of currentProductData.variables) {
            if (state.tipos[g.id]) continue;
            const ok = extractVariable(t, g.options || []);
            if (ok) { state.tipos[g.id] = ok; break; }
          }
        }
      }
      quitados.push(quitarActual);
    }
    /* Y de la COLA (los platos que esperan turno): si pidio quitar uno que
       todavia no ha entrado, tampoco tiene que entrar. */
    if ((state.cola || []).length) {
      const fuera = ((leidoPedido as PedidoLeido).quitar || []).map(x => normalizarTexto(String(x)));
      const quedan = (state.cola || []).filter(x => !fuera.includes(normalizarTexto(x.nombre)));
      if (quedan.length !== (state.cola || []).length) {
        quitados.push(...(state.cola || []).filter(x => !quedan.includes(x)).map(x => x.nombre));
        state.cola = quedan;
      }
    }
    if (quitados.length) {
      console.log("[quitar] fuera del pedido:", JSON.stringify(quitados));
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
    }
  }

  const extracted = relectura ? {} : runExtractors(clienteTexto, state, currentStepId, pagosCfg, currentProductData, nombreConfirmar, intenciones, cfg, productoRecienDetectado, pasoAntesId, leidoPedido);

  // 14e. Merge
  // Capturar ANTES del merge: si ya había una pregunta de dirección pendiente → es el segundo intento
  const yaHabiaPreguntadoDireccion = !!state.complemento_dir_pendiente;
  if (Object.keys(extracted).length > 0) {
    state = mergeSlots(state, extracted);

    /* ══ EL NUMERO ACABA DE LLEGAR POR UNA RED ══════════════════════════
       Aqui es donde Instagram deja de ser un id suelto y se vuelve un
       cliente de verdad: se busca su ficha por TELEFONO —o se crea— y se le
       pega la cuenta. La funcion de la base hace las dos cosas juntas y de
       paso hermana todas sus conversaciones (WhatsApp incluida), que es lo
       que permite alternar entre canales sin salir del chat.

       Best-effort a proposito: si esto falla, el pedido NO se cae — el
       numero ya quedo en el estado y el pedido puede seguir. Se anota el
       error para poder rastrearlo. */
    /* ══ LA ADICION DE OTRO TAMAÑO SE COBRA APARTE ══════════════════════
       Caso real de Yubeli (21-ago): pidio una Maicitos Especial FAMILIAR
       "con adicion de ranchera PERSONAL". Dentro de un plato familiar solo
       caben adiciones familiares, asi que Paco le cobro la familiar de
       $28.000 — $14.000 de mas — y la aclaracion de la clienta se ignoro.
       Sergio lo arreglo a mano facturando la adicion suelta, que existe en
       la carta como producto propio. Esto hace eso mismo, solo.

       Entra por la COLA, que es el camino que ya usa Paco para varios platos
       en un mensaje: asi hereda el precio por presentacion, el empaque y el
       resumen sin inventar nada nuevo. */
    if (extracted.adicion_suelta) {
      const ad = extracted.adicion_suelta as { nombre: string; tamano: string; cat: string };
      const yaEnCola = (state.cola || []).some(c =>
        normalizarTexto(c.nombre || "") === normalizarTexto(ad.nombre));
      const yaEsItem = (state.items || []).some(i =>
        normalizarTexto(i.producto || "") === normalizarTexto(ad.nombre));
      if (!yaEnCola && !yaEsItem) {
        (state.cola = state.cola || []).push({
          nombre: ad.nombre, cat: ad.cat,
          /* El texto lleva el tamaño porque de ahi lo lee el flujo cuando le
             toque el turno a este producto. Sin el, volveria a preguntarlo. */
          texto: `1 ${ad.nombre} ${ad.tamano}`,
        });
        console.log(`[adicion aparte] "${ad.nombre} ${ad.tamano}" se cobra como producto suelto`);
      }
      /* Y SE QUITA de las adiciones del plato: si se queda, se cobraria dos
         veces —una como adicion del tamaño equivocado y otra como producto—. */
      const quitarN = normalizarTexto(ad.nombre);
      const limpiar = (txt: string | null) => {
        const quedan = String(txt || "").split(",").map(x => x.trim()).filter(Boolean)
          .filter(x => { const nx = normalizarTexto(x); return !(nx === quitarN || nx.includes(quitarN) || quitarN.includes(nx)); });
        return quedan.join(", ");
      };
      state.adiciones = limpiar(state.adiciones);
      (state.items || []).forEach(i => { i.adiciones = limpiar(i.adiciones ?? null); });
      state.adicion_suelta = null;
    }

    if (extracted.telefono && (state.canal === "instagram" || state.canal === "facebook")) {
      try {
        /* `fromPhone` en estos canales ES el id de la persona en la red (asi
           lo encola el webhook), y `convRow.contact_name` es su nombre de
           perfil. No existe aqui ninguna variable `conv`. */
        const usuarioRed = String(convRow?.contact_name || "");
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_cliente_vincular_red`, {
          method: "POST",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_tenant: tenantId, p_telefono: String(state.telefono || ""),
            p_red: state.canal, p_red_id: String(fromPhone || ""),
            p_usuario: usuarioRed, p_nombre: state.nombre || usuarioRed,
            p_branch: branchId,
          }),
        });
        if (r.ok) console.log(`[${state.canal}] ${fromPhone} vinculado al telefono ${state.telefono}`);
        else console.error(`[${state.canal}] no se pudo vincular:`, (await r.text()).slice(0, 300));
      } catch (e) { console.error(`[${state.canal}] no se pudo vincular:`, String(e).slice(0, 200)); }
    }
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
  /* LA INTENCION DECIDE LA ENTREGA (18-ago, regla de Sergio: intenciones, no
     texto exacto). Este reconocedor de lista cayo TRES veces (entradas 135,
     171, 196), siempre por una forma de decir "recoger" que nadie habia
     previsto — y el clasificador de intenciones, que corre en cada mensaje y
     SI la entiende, no se consultaba aqui. Ahora el modelo decide primero y la
     lista queda de respaldo para cuando el modelo devuelva null.
     Cautela: si el mensaje trae una CALLE de verdad, la intencion no manda —
     una direccion escrita pesa mas que la lectura del modelo. */
  const dijoRecogerLista = LLEVAR_REGEX.test(clienteTexto.toLowerCase());
  const dijoRecogerIntencion = intenciones.entrega === "recoger" && !CALLE_REGEX.test(clienteTexto);
  if (dijoRecogerLista || dijoRecogerIntencion) {
    const clasifYa = state.direccion
      ? clasificarDireccion(state.direccion, domiciliosCfg, sinNomenclaturaCliente2)
      : null;
    if (!clasifYa || clasifYa.tipo !== "para_llevar") {
      /* Si vino por la lista se guarda el texto del cliente (siempre fue asi y
         los 23 controles de rio abajo lo re-reconocen). Si vino SOLO por la
         intencion, el texto puede ser cualquier cosa ("yo caigo por el") que
         la lista no reconoce despues: se guarda la marca canonica. */
      state.direccion = dijoRecogerLista ? clienteTexto.trim() : "Para recoger";
      state.direccion_heredada = false;
      state.complemento_dir_pendiente = null;   // ya no hay nada que completar
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
    }
  }

  // 14e-bis. Dirección recién capturada → validar barrio/complemento inmediatamente
  // (así la pregunta de barrio aparece justo después de la dirección, no al final del flujo)
  /* Tambien cuando el conjunto llega como BARRIO (18-ago). "Para el: conjunto
     portal de pomona" se guarda en `barrio`, no en `direccion`, asi que esta
     compuerta —que es la que le avisa al dueNo del conjunto nuevo— no llegaba
     ni a mirarlo. */
  if ((extracted.direccion || extracted.barrio) && (state.direccion || state.barrio)
      && state.producto && !state.complemento_dir_pendiente) {
    /* CONJUNTO QUE NO CONOCEMOS: se decide AQUI, en cuanto da la direccion.
       Si se dejara para el final, el bot se quedaria pidiendo un barrio que
       nunca va a poder resolver — que es justo el bucle que se corrigio.
       Se propone para que el dueño lo apruebe y la conversacion pasa a una
       persona, que es quien puede verificar si ese conjunto existe. */
    /* Se mira la ubicacion COMPLETA (barrio + direccion), no solo la
       direccion: el nombre del conjunto puede venir en cualquiera de las dos. */
    const ubic = ubicacionPedido(state);
    if (sueneAConjunto(ubic)
        && !esConjunto(ubic, domiciliosCfg)
        && !LLEVAR_REGEX.test(ubic.toLowerCase())
        && lookupDomiPrice(ubic, domiciliosCfg) === null) {
      const nombreConj = (sueneAConjunto(state.direccion || "") ? state.direccion : ubic)
        /* Si el pedido y la direccion vinieron en el MISMO mensaje ("me das
           una premium... para Villa Ernesto Torre 3"), el nombre es lo que
           va despues del ultimo "para": sin este corte se proponia el
           mensaje entero como nombre del conjunto (paso el 15-ago). */
        .replace(/^[\s\S]*\bpara\s+/i, "")
        .replace(/^\s*(seria|sería|es|en|el|la)\s+/i, "")
        .split(/\b(torre|bloque|bl|interior|int|apto|apartamento|apart|casa|piso)\b/i)[0]
        .replace(/[,.\-\s]+$/, "")
        .trim();
      if (nombreConj.length >= 3) {
        await proponerConjunto(tenantId, branchId, nombreConj, state.direccion);
        /* LA BARRA: el Front la pinta cuando ve domi_precio_pendiente. Esta
           rama pasaba a humano SIN encenderla y el dueño quedaba sin donde
           poner el precio (la trampa de Sergio del 15-ago). confirm-domi la
           apaga al confirmar y Paco retoma.
           Y el NOMBRE LIMPIO va en domi_lugar: es lo que confirm-domi aprende.
           Solo la otra rama lo guardaba y el Confirmar respondia "no reconocí
           el nombre del lugar" (segunda trampa de Sergio del mismo dia). */
        (state as unknown as Record<string, unknown>).domi_lugar = nombreConj;
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { domi_precio_pendiente: true, pending_order_data: state });
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
      const conjNom = esConjunto(ubicacionPedido(state), domiciliosCfg);
      /* ⚠️ NO BASTA CON LA LISTA (18-ago). `esConjunto` solo dice que si cuando
         el conjunto YA esta registrado. Un cliente escribio "conjunto portal de
         pomona ... Casa 13" —la palabra "conjunto" en el mensaje— y como ese no
         estaba en la lista, Paco le pidio "calle o carrera y numero": una calle
         que no existe. El cliente ya habia dicho todo lo que hacia falta.
         Si el mensaje DICE conjunto (o torre, edificio, apto...), se trata como
         conjunto aunque no este registrado. La lista sirve para saber el
         NOMBRE bonito; la palabra basta para saber que no tiene calle. */
      const pareceConj = !!conjNom || sueneAConjunto(ubicacionPedido(state));
      const numCount = (state.direccion.match(/\d+/g) || []).length;
      /* NO SE PREGUNTA POR TORRE: se pregunta ABIERTO.

         Regla de Sergio: "sería muy incorrecto preguntarle torre y apartamento
         a quien vive en Asturias, que es un conjunto de casas, y la casa solo
         tiene un número". Y el sistema no tiene cómo saber cuáles conjuntos
         son de casas y cuáles de torres — ni falta: preguntando abierto sirve
         para los dos, y también para los mixtos, que no caben en ninguna
         clasificación. */
      const pregDetallada = pareceConj
        ? (conjNom
            ? `¡Listo, ${conjNom}! 😊 ¿En qué casa o apartamento te lo dejamos?`
            : "¡Listo! 😊 ¿En qué casa o apartamento te lo dejamos?")
        : (numCount >= 2
          ? "¡Casi! 😊 Le falta el número de tu casa. La dirección debe verse así: *Carrera 9 # 63-25* ¿Cómo es la completa?"
          : "Necesito la dirección completa para llegar 📍 Algo así: *Carrera 9 # 63-25* ¿Cómo es la tuya?");
      /* SI ES UN CONJUNTO, MANDA SU PREGUNTA. Antes iba la última de la fila y
         solo salía si el dueño no había configurado nada: bastaba con que
         escribiera su frase de "dirección incompleta" en el canvas para que
         los clientes de los 48 conjuntos recibieran "dame la dirección
         completa" para siempre, aunque el sistema supiera que viven en uno.
         Y por eso también salía un mensaje de más antes de reconocerlo.
         La frase del dueño es sobre calles; un conjunto no tiene calle. */
      const pasoDirBis = pasos.find(p => p.campo === "direccion");
      const pregIncompleta = pareceConj ? pregDetallada
        : ((pasoDirBis && pasoDirBis.preg_incompleta)
        || getFraseTexto(frasesCfg.preguntar_complemento_dir)
        || (yaHabiaPreguntadoDireccion ? pregDetallada : "La dirección está incompleta, ¿podrías dármela completa? 📍"));
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
      /* Y la MISMA regla aqui: esta era la rama que de verdad le pidio la calle
         a quien vive en un conjunto. Tenia el control puesto contra la LISTA
         (`esConjunto`) y no contra lo que el cliente dijo. */
      if (!tieneCalle && !tieneNumeroBis && domiPrecioBis !== null
          && !esConjunto(ubicacionPedido(state), domiciliosCfg)
          && !sueneAConjunto(ubicacionPedido(state))) {
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
          `Qué pena contigo 🙏 Si deseas que tu pedido esté listo cuando pases por él, el pago debe hacerse por transferencia primero. Si decides pagar en efectivo, con mucho gusto te puedes acercar al establecimiento y tu pedido se prepara una vez esté pago${emo()}`;
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

  /* 14e-quinto-bis. PRECIO PUNTUAL antes que la cuenta: "¿cuánto cuesta la
     coca cola 1.5?" nombra UN producto — la respuesta es SU precio, no el
     total del pedido (le pasó a Sergio: preguntó por la gaseosa y recibió la
     cuenta). Si el texto no nombra nada del catálogo, precioPuntual devuelve
     null y "¿cuánto es?" sigue siendo la cuenta, como siempre. */
  {
    const pidePrecio = intenciones.precio === true
      || /(cuanto|cuánto)\s+(vale|cuesta|sale)|qu[eé]\s+precio|de\s+a\s+c[oó]mo/i.test(clienteTexto);
    if (pidePrecio && !relectura && !state.resumen_enviado) {
      const puntual = await precioPuntual(clienteTexto, branchId);
      if (puntual) {
        let msgP = puntual;
        const stepPrecio = state.producto ? findNextStep(state, pasos, false, domiciliosCfg) : null;
        if (stepPrecio && stepPrecio.texto) {
          msgP += "\n\n" + rellenarVariables(String(stepPrecio.texto), state, cfg).texto;
        }
        await sendWaAndSave(convId, tenantId, msgP, fromPhone, phoneId, accessToken);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgP, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
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
      /* Si el cliente nombro algo que la carta SI conoce —una categoria, por
         ejemplo "una salchipapa"— no se le puede decir que no lo manejamos.
         Pasaba: la frase de "no existe" se disparaba por la palabra
         "porfavor" escrita junta, que no esta en la carta y ninguna lista de
         palabras a ignorar iba a cubrir. Se mira lo que el cliente SI nombro,
         no lo que no. */
      let productoInexistente: string | null = null;
      const nombroAlgoDeLaCarta = mencionaProductoCatalogo(clienteTexto);
      /* FASE A5 (15-ago): "no manejamos un producto con ese nombre" SOLO se
         puede decir si el clasificador vio intencion de PEDIR. Antes, la
         palabra desconocida bastaba: "Quiero mas informacion.cuanto vale"
         disparaba la frase por "informacion". Si una persona pregunta,
         agradece o charla, no se le contesta con la rama de producto.
         Si el clasificador fallo (objeto vacio), se comporta como antes. */
      const clasificoAlgo = Object.keys(intenciones).length > 0;
      const buscarInexistente = !nombroAlgoDeLaCarta
        && (!clasificoAlgo || (intenciones.pedir === true && intenciones.pregunta !== true));
      for (const w of (buscarInexistente ? normalizarTexto(clienteTexto).split(/\s+/) : [])) {
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
        await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: { link: imgUrl } });
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

  /* 14f-bis. EN CUANTO NO SABE CUÁNTO COBRAR ALLÁ, PACO SE CALLA.

     Va aquí y no al final a propósito: si esperara a tener todo, seguiría
     preguntando nombre y pago con un precio que no conoce, y el cliente
     recibiría un total inventado. Diseño de Sergio: "cuando Paco no sepa un
     barrio automáticamente se desactiva y la conversación pasa al humano". */
  if (state.barrio && state.direccion
      && !LLEVAR_REGEX.test(state.direccion.toLowerCase())
      && lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) === null) {
    const aviso = getFraseTexto(frasesCfg.consultando_domi)
      || "Déjame confirmarte el valor del domicilio hasta allá, es un momento 🙏";
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
      pending_order_data:    state,
      domi_precio_pendiente: true,
      human_takeover:        true,
      handoff_at:            new Date().toISOString(),
      handoff_motivo:        `No sé cuánto cobrar el domicilio a "${state.barrio}"`,
      ai_typing:             false,
    });
    await sendWaAndSave(convId, tenantId, aviso, fromPhone, phoneId, accessToken);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: aviso, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
    console.log(`[domi] barrio sin zona ("${state.barrio}") — Paco se calla y espera el precio`);
    return;
  }

  /* ── PROMOCION DE LA COLA (18-ago) ─────────────────────────────────────
     Cuando el producto en curso ya tiene resuelto lo SUYO (tamano y
     variantes), el siguiente de la cola toma su lugar: el actual se archiva
     en items y el nuevo intenta resolverse desde el TEXTO ORIGINAL donde el
     cliente lo pidio ("coca cola personal" trae su tamano escrito). Lo que no
     se resuelva, lo pregunta el flujo como siempre — por eso la promocion
     para en cuanto el promovido necesita algo.
     El upsell no frena la promocion: es UNA pregunta por pedido (regla de
     Sergio), no una por producto. */
  if (!relectura && (state.cola || []).length > 0) {
    const listoElActual = (): boolean => {
      if (!state.producto) return true;
      if (!currentProductData) return false;
      if ((currentProductData.presentations || []).length > 1 && !state.tamano) return false;
      for (const g of (currentProductData.variables || [])) {
        if ((g.options || []).length && !(state.tipos || {})[g.id]) return false;
      }
      return true;
    };
    let promovidos = 0, guardia = 0;
    while ((state.cola || []).length > 0 && listoElActual() && guardia++ < 6) {
      const sig = (state.cola as Array<{ nombre: string; cat: string; texto: string }>).shift()!;
      if (state.producto) {
        state.items = [...state.items, {
          producto: state.producto, tamano: state.tamano, tipo: state.tipo,
          cantidad: state.cantidad, adiciones: state.adiciones,
          preferencias: state.preferencias, categoria: state.producto_categoria,
        }];
      }
      state.producto = sig.nombre;
      state.producto_categoria = sig.cat;
      state.tamano = null; state.tipo = null; state.tipos = {}; state.preferencias = null;
      state.cantidad = 1;
      try {
        /* "2 coca colas": el numero pegado al nombre, en el texto original. */
        const kn = normalizarTexto(sig.nombre).split(" ")[0];
        /* Las barras van DOBLES: dentro de una cadena "\d" no es un digito,
           es la letra d — la expresion decia (d+)s+ y no casaba nunca, asi que
           "2 coca colas" entraba siempre como 1. */
        const mC = normalizarTexto(sig.texto).match(new RegExp("(\\d+)\\s+(?:[a-z]+\\s+){0,2}" + kn));
        if (mC) state.cantidad = Math.max(1, Math.min(20, parseInt(mC[1], 10)));
      } catch (_) { /* queda en 1 */ }
      if (state.adiciones !== null) state.adiciones = "";   // el upsell es del pedido
      currentProductData = await loadProductData(state.producto, branchId, state.producto_categoria);
      pasos = buildAllPasos(currentProductData, cfg, frasesCfg, nombreConfirmar, !!nombreKnown);
      if (currentProductData) {
        const tNorm = " " + normalizarTexto(sig.texto) + " ";
        /* Tambien en plural: "3 coca colas PERSONALES". */
        const enTexto = (nom: string) => {
          const b = normalizarTexto(nom);
          return tNorm.includes(" " + b + " ")
              || tNorm.includes(" " + b + "s ")
              || tNorm.includes(" " + b + "es ");
        };
        const presTxt = (currentProductData.presentations || [])
          .filter(p => p.name && enTexto(p.name));
        if (presTxt.length === 1) state.tamano = presTxt[0].name;
        /* MANDA EL QUE ESTA PEGADO AL PRODUCTO (19-ago). "una salchipapa
           PERSONAL premium de carne y un jugo hit de LITRO" trae los dos
           tamanos de la HIT en el mismo mensaje —"personal" es de la
           salchipapa— asi que quedaban dos candidatos, no se elegia ninguno y
           Paco preguntaba un tamano que el cliente acababa de dar.
           El que esta al lado del nombre del producto es el suyo: se mide la
           distancia y solo gana si uno esta claramente mas cerca. */
        else if (presTxt.length > 1) {
          const posEnTexto = (nom: string) => {
            const b = normalizarTexto(nom);
            for (const f of [" " + b + " ", " " + b + "s ", " " + b + "es "]) {
              const i = tNorm.indexOf(f);
              if (i >= 0) return i;
            }
            return -1;
          };
          const iProd = posEnTexto(currentProductData.name);
          if (iProd >= 0) {
            const conDist = presTxt
              .map(p => ({ p, d: Math.abs(posEnTexto(p.name) - iProd) }))
              .sort((a, b) => a.d - b.d);
            if (conDist[0].d + 8 < conDist[1].d) state.tamano = conDist[0].p.name;
          }
        }
        else if ((currentProductData.presentations || []).length === 1 && currentProductData.presentations[0].name) {
          state.tamano = currentProductData.presentations[0].name;
        }
        for (const g of (currentProductData.variables || [])) {
          const op = (g.options || []).find(o => o.name && enTexto(o.name));
          if (op) {
            state.tipos[g.id] = op.name;
            state.tipo = state.tipo ? state.tipo + ", " + op.name : op.name;
          }
        }
      }
      promovidos++;
      console.log("[cola] promovido: " + state.producto + " (quedan " + (state.cola || []).length + ")");
    }
    if (promovidos) {
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
    }
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
        /* El mismo caso del conjunto, que aquí no estaba contemplado: este
           camino le pedía "Carrera 9 # 63-25" a alguien que vive en uno. */
        const conjNomH = esConjunto(ubicacionPedido(state), domiciliosCfg);
        /* Mismo arreglo que en la rama de arriba (18-ago): si el mensaje DICE
           conjunto/torre/edificio, se trata como conjunto aunque no este en la
           lista del restaurante. Esta es la rama que de verdad contesto en el
           caso de Sneider. */
        const pareceConjH = !!conjNomH || sueneAConjunto(ubicacionPedido(state));
        const pregDetallada = pareceConjH
          ? (conjNomH
              ? `¡Listo, ${conjNomH}! 😊 ¿En qué casa o apartamento te lo dejamos?`
              : "¡Listo! 😊 ¿En qué casa o apartamento te lo dejamos?")
          : (numCount >= 2
            ? "¡Casi! 😊 Le falta el número de tu casa. La dirección debe verse así: *Carrera 9 # 63-25* ¿Cómo es la completa?"
            : "Necesito la dirección completa para llegar 📍 Algo así: *Carrera 9 # 63-25* ¿Cómo es la tuya?");
        const pasoDirH = pasos.find(p => p.campo === "direccion");
        const pregIncompleta = pareceConjH ? pregDetallada
          : ((pasoDirH && pasoDirH.preg_incompleta)
          || getFraseTexto(frasesCfg.preguntar_complemento_dir)
          || (yaHabiaPreguntadoDireccion ? pregDetallada : "La dirección está incompleta, ¿podrías dármela completa? 📍"));
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
        /* A un conjunto NO se le pide calle. Contra la lista no bastaba:
           "conjunto portal de pomona" no estaba registrado y por eso Paco le
           pidio una carrera que no existe. */
        if (!tieneCalleH && !tieneNumH && domiPrecioH !== null
            && !esConjunto(ubicacionPedido(state), domiciliosCfg)
            && !sueneAConjunto(ubicacionPedido(state))) {
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

        /* BARRIO QUE NO ESTA EN NINGUNA ZONA: Paco se calla y pregunta adentro.

           Diseño de Sergio: "cuando Paco no sepa un barrio automaticamente se
           desactiva y la conversacion pasa al humano; luego me sale algo donde
           yo pueda confirmar el costo, toco un boton y Paco retoma".

           Hasta hoy no pasaba nada: el resumen decia "Domicilio: a confirmar",
           el cliente confirmaba y EL PEDIDO SE CREABA CON EL DOMICILIO EN $0,
           sin que nadie se enterara. Esa plata se estaba yendo.

           La bandera domi_precio_pendiente existia desde hace tiempo y solo se
           ponia en false, en tres sitios. Nadie la levantaba nunca. Aqui se
           levanta. */
        if (domiPrecioH === null) {
          const dondeVive = ubicacionPedido(state) || state.direccion || "";
          const aviso = getFraseTexto(frasesCfg.consultando_domi)
            || "Déjame confirmarte el valor del domicilio hasta allá, es un momento 🙏";
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
            pending_order_data:    state,
            domi_precio_pendiente: true,
            human_takeover:        true,
            handoff_at:            new Date().toISOString(),
            handoff_motivo:        `No sé cuánto cobrar el domicilio a "${(state.barrio || dondeVive).trim()}"`,
            ai_typing:             false,
          });
          /* SI se le avisa al cliente, al reves que con los pagos: aqui no hay
             nada que sospechar, solo un dato que nos falta. Si Paco se quedara
             mudo, el cliente escribiria tres veces creyendo que se cayo. */
          await sendWaAndSave(convId, tenantId, aviso, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: aviso, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
          console.log(`[domi] barrio sin zona ("${dondeVive}") — Paco se calla y espera el precio`);
          return;
        }
      }
      if (clasifDir.tipo === "publico" && clasifDir.requierePagoAdelantado) {
        const esEfectivo = !esMetodoDigital(state.pago || "", pagosCfg);
        if (esEfectivo) {
          /* FRASE FIJA, no el modelo (caso real de Kevin, 17-ago). La entrega
             era a un LOCAL comercial ("local Crazy Ice"): lugar publico ->
             prepago -> el efectivo se anula. Todo eso estaba bien... pero el
             mensaje que lo explica se le pedia al MODELO, y el modelo, en vez
             de explicarlo, prometio "en un momento te envio el resumen" — un
             resumen que el sistema jamas iba a mandar. El cliente quedo
             esperando y Sergio tuvo que atender a mano.

             Es la misma leccion del 14i-bis y de "para llevar + efectivo"
             (frases.llevar_efectivo): un mensaje critico del flujo no se le
             encarga a una moneda al aire. Frase configurable en Mensajes
             (frases.publico_efectivo); esta es la de fabrica. */
          state.pago = null;
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state });
          /* Y NO SE REPITE (19-ago). El freno de bucle existia desde el
             17-ago pero solo estaba conectado a su hermana, la de "para
             llevar + efectivo". A Ivan se le mando esta MISMA frase tres
             veces seguidas, palabra por palabra, mientras preguntaba "¿no se
             puede en efectivo?". Si la explicacion no basto a la primera,
             tampoco va a bastar a la tercera: a la segunda va a una persona. */
          if (await frenarBucle(convId, "publico_efectivo")) return;
          const msgPub = getFraseTexto(frasesCfg.publico_efectivo)
            || "Para entregas en un lugar público o local, el pago se hace por transferencia antes del envío 🙏 ¿Te queda bien pagar por transferencia?";
          await sendWaAndSave(convId, tenantId, msgPub, fromPhone, phoneId, accessToken);
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: msgPub, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
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
             bosque", no la direccion entera con el apartamento de un cliente.
             Y si pedido y direccion vinieron juntos, lo que va despues del
             ultimo "para". */
          const nombreConj = state.direccion
            .replace(/^[\s\S]*\bpara\s+/i, "")
            .replace(/^\s*(seria|sería|es|en|el|la)\s+/i, "")
            .split(/\b(torre|bloque|bl|interior|int|apto|apartamento|apart|casa|piso)\b/i)[0]
            .replace(/[,.\-\s]+$/, "")
            .trim();
          if (nombreConj.length >= 3) {
            await proponerConjunto(tenantId, branchId, nombreConj, state.direccion);
            motivo = `CONJUNTO NUEVO por aprobar: "${nombreConj}" — verificar que exista y asignarle zona. Dirección dada: ${state.direccion}`;
            // El nombre LIMPIO para la barra del Front y para aprenderlo al confirmar.
            (state as unknown as Record<string, unknown>).domi_lugar = nombreConj;
            (state as unknown as Record<string, unknown>).domi_tipo_sugerido = "conjunto";
          }
        }
        // La BARRA del precio: sin esta bandera el Front no la pinta y el
        // dueño no tiene donde confirmar (misma correccion que en 14e-bis).
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { domi_precio_pendiente: true, pending_order_data: state });
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

  /* 14i-bis. UNA FRASE FIJA SE MANDA TAL CUAL, SIN PASARLA POR EL MODELO.

     Queja de Sergio, con su captura: antes de cada pregunta el bot repetía el
     pedido entero — "¡Listo! 👍 Entonces, queda: 1x Premium Mixta, 1x Coca-Cola
     personal y 1x adición de ranchera. ¿Me puedes dar la dirección completa?".
     El resumen del pedido va en el RESUMEN, no en cada mensaje intermedio.

     En el prompt ya había DOS reglas prohibiéndolo ("NUNCA generes un resumen",
     "NUNCA repitas los datos ya capturados") y aun así lo hacía. Es lo mismo
     que paso hoy con la confirmación del nombre y con la frase de la
     dirección: lo que depende de que el modelo obedezca es una moneda al aire.
     Ademas ni siquiera uso la frase configurada por Sergio.

     Si el dueño escribió una frase fija, esa frase sale. Punto.

     EXCEPCION: si el cliente pregunto algo, sigue redactando el modelo — hay
     que contestarle antes de seguir con el pedido, y eso no se puede hacer con
     una frase fija. */
  /* 14i-cnt. NUNCA LA MISMA PREGUNTA EN BUCLE (FASE B, 15-ago).
     (El entender — despedida, queja, quiere humano — corre ARRIBA, en 5-bis,
     antes de la rama de la carta. Aqui llega solo la conversacion viva.)

     Ya paso: "le pidio la direccion CUATRO veces seguidas hasta que el pedido
     se cayo". La pieza existia solo para el producto ambiguo; aqui se
     generaliza: cada paso cuenta sus intentos en el estado. El 2.o y el 3.o
     cambian de tono (frases configurables reintento_2 / reintento_3 en
     Mensajes); al 4.o se pasa a un humano con el motivo escrito. */
  let intentoPaso = 0;
  if (nextStep && nextStep.campo) {
    const st14 = state as unknown as { intentos?: Record<string, number> };
    st14.intentos = st14.intentos || {};
    // Si este mensaje AVANZÓ el pedido (llenó algo), no es un intento fallido:
    // el contador de ese campo arranca de cero. Solo cuenta el estancamiento.
    const slotsAhora14 = JSON.stringify([state.producto, state.tamano, state.tipo,
      state.direccion, state.nombre, state.pago, state.adiciones, state.upsell,
      (state.items || []).length]);
    /* PERO EL CAMPO QUE SIGUE VACIO NO PERDONA (19-ago, hallado en las
       pruebas). "2 premium mixtas personales y 3 coca colas personales" dejo a
       Paco preguntando el tamaNo de la Coca-Cola SIN PARAR: cada mensaje del
       cliente llenaba otra cosa (la direccion, el nombre), el estado cambiaba
       y el contador se reiniciaba entero — asi nunca llegaba a los 4 intentos
       que lo pasan a una persona. El cliente contesto cuatro veces y ninguna
       era lo que le preguntaban.
       Los demas campos si se perdonan: lo que no se perdona es seguir sin lo
       que se esta pidiendo. */
    const cuentaDelCampo = st14.intentos[nextStep.campo] || 0;
    if (slotsAhora14 !== slotsAntes14) {
      st14.intentos = {};
      if (cuentaDelCampo) st14.intentos[nextStep.campo] = cuentaDelCampo;
    }
    intentoPaso = (st14.intentos[nextStep.campo] || 0) + 1;
    st14.intentos[nextStep.campo] = intentoPaso;
    if (intentoPaso >= 4) {
      if (!handoffFraseCfg) {
        const aviso = getFraseTexto(frasesCfg.pasar_humano)
          || "Perdón, no logro entenderte 🙏 Ya le aviso a alguien del equipo para que te atienda personalmente.";
        await sendWaAndSave(convId, tenantId, aviso, fromPhone, phoneId, accessToken);
      }
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state, ai_typing: false });
      await pasarAHumano(convId, tenantId,
        `Paco no logró obtener "${nextStep.campo}" tras ${intentoPaso} intentos — necesita una persona`,
        cfg, fromPhone, phoneId, accessToken);
      return;
    }
  }

  /* 14i-bis (v270). La frase fija sale tal cual — pero la EXCEPCION ("el
     cliente pregunto algo") ahora la decide el CLASIFICADOR, no una lista de
     palabras. La regex queda solo de respaldo para cuando el clasificador
     falle: si el modelo no contesto, el bot se comporta como antes y nunca
     peor. UN solo detector de intencion en el motor (FASE A4). */
  const PREGUNTA_DEL_CLIENTE = /(\?|¿|cuanto|cuánto|precio|vale|cuesta|tienen|tienes|hay\b|puedo|podr[ií]a|demora|tarda|cuando|cuándo|donde|dónde|como|cómo|por que|por qué|porque)/i;
  /* En RELECTURA no hay pregunta que contestar: el mensaje ya se atendió una
     vez y la relectura existe para CONTINUAR el flujo con lo aprendido
     (confirm-domi). Dejarla pasar como pregunta soltaba el timón al modelo,
     que se inventó su propio resumen ("¡Listo! 👍 Entonces, tu pedido es...")
     en vez de dejar correr el fijo — trampa de Sergio, 15-ago. */
  const preguntoAlgo = !relectura && (clasifico
    ? (intenciones.pregunta === true || intenciones.fuera_tema === true)
    : PREGUNTA_DEL_CLIENTE.test(clienteTexto));
  /* En RELECTURA hasta el paso conversacional sale con su frase tal cual (si
     el dueño escribio una): no hay cliente nuevo que atender, solo retomar.
     Darselo al modelo en ese turno producia recaps del pedido y hasta
     rechazos inventados ("no manejamos la adicion de ranchera" — si la
     maneja). El texto del upsell ya viene con su lista resuelta. */
  if (nextStep && ((nextStep.modo || "fija") === "fija" || relectura) && (nextStep.texto || nextStep.pregunta)
      && !preguntoAlgo) {
    const { texto: fijoBase } = rellenarVariables(String(nextStep.texto || nextStep.pregunta), state, cfg);
    /* FASE B: repetir no es insistir con las mismas palabras. La frase fija
       es correcta la PRIMERA vez; del segundo intento en adelante se antepone
       un recordatorio distinto, tan fijo y configurable como ella. */
    let fijo = fijoBase;
    if (intentoPaso === 2) {
      fijo = (getFraseTexto(frasesCfg.reintento_2) || "Solo me falta este dato para poder seguir 😊") + "\n" + fijoBase;
    } else if (intentoPaso === 3) {
      fijo = (getFraseTexto(frasesCfg.reintento_3) || "Perdón si no me hice entender 🙏 ¿Me lo escribes una vez más? Si prefieres, te comunico con alguien del local.") + "\n" + fijoBase;
    }
    /* Con varios platos, la pregunta de tamaño o variante tiene que decir de
       CUAL habla — misma regla que ya existía para el modelo. */
    const conProd = (nextStep.campo === "tamano" || nextStep.campo === "tipo")
      && (state.items || []).length > 0 && state.producto
      ? `Sobre la *${capFirst(state.producto)}* 👇\n${fijo}`
      : fijo;
    if (conProd.trim()) {
      /* EL ATAJO DEL NUMERO. Solo en el paso del telefono y solo en redes:
         la pregunta ya va escrita y se entiende sola, asi que si el boton no
         aparece —porque esa persona no tiene numero en su perfil— no se
         pierde nada. Si el envio con boton falla por cualquier motivo, se
         manda como texto normal: nunca quedarse sin preguntar. */
      if (nextStep.campo === "telefono"
          && (state.canal === "instagram" || state.canal === "facebook")
          && await enviarPidiendoTelefono(convId, tenantId, conProd, fromPhone, phoneId, accessToken)) {
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state, last_message: conProd, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
        return;
      }
      await sendWaAndSave(convId, tenantId, conProd, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state, last_message: conProd, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  // 14i. Respuesta conversacional — GPT con la conversación completa: preguntas,
  // frustración, fuera de guion. El pedido en sí sigue mandando el flujo.
  /* En RELECTURA el "mensaje del cliente" es uno VIEJO que ya fue atendido:
     sin esta marca, el modelo lo leia como recien llegado y lo recapitulaba
     ("¡Perfecto! Entonces tienes un pedido de...") antes de su pregunta —
     error 1 de Sergio: los productos SOLO se informan en el resumen. */
  const textoParaModelo = relectura
    ? `(SISTEMA: estás RETOMANDO la conversación tras una pausa. El mensaje de abajo YA FUE ATENDIDO — no lo resumas, no lo confirmes, no repitas sus productos. Ve DIRECTO a tu siguiente pregunta.)\n${clienteTexto}`
    : clienteTexto;
  const reply = await buildConversationResponse(
    textoParaModelo, histCtx, state, nextStep, cfg, frasesCfg,
    menuText, horariosText, pagosText, domiciliosText, currentProductData,
    true, nombreParaBot, colTimeStr, colDayStr, horaAperturaHoy, horaCierreHoy, proxDia, !!nombreKnown,
  );
  await sendWaAndSave(convId, tenantId, reply, fromPhone, phoneId, accessToken);
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: state, last_message: reply, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
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

/* Encuentra cual de las opciones nombro el cliente.

   Mira en LOS DOS SENTIDOS. El obvio: el nombre completo aparece en lo que
   escribio ("quiero la personal"). Y el que faltaba: lo que escribio esta
   dentro del nombre de UNA sola opcion ("1.5" dentro de "1.5 Litros").

   Sin el segundo, contestar "1.5" a "¿1.5 litros o personal?" no guardaba
   nada y el bot volvia a preguntar lo mismo — le paso a Sergio y dio vueltas
   hasta que escribio "ya te dije".

   La condicion de UNA SOLA es lo que lo hace seguro: si el pedazo encaja en
   dos opciones no se adivina, se vuelve a preguntar. */
function _cualOpcion(text: string, nombres: string[]): string | null {
  const t = normalizarTexto(text);
  if (!t) return null;

  /* 1. El nombre completo, dentro de lo que dijo. */
  for (const n of nombres) {
    const nn = normalizarTexto(n);
    if (nn.length > 2 && t.includes(nn)) return n;
  }

  /* 2. Lo que dijo, dentro del nombre — y solo si no cabe en dos. */
  /* Se quitan TODAS las muletillas del principio, no una: "la de 1.5" lleva
     dos seguidas y con una sola pasada quedaba "de 1.5", que no encaja. */
  const trozo = t.replace(/^((la|el|los|las|de|del|una?|unos?|quiero|dame|deme|porfa|por favor|seria|es)\s+)+/, "").trim();
  if (trozo.length >= 2) {
    const encajan = nombres.filter(n => normalizarTexto(n).includes(trozo));
    if (encajan.length === 1) return encajan[0];
  }

  /* 3. Palabra por palabra, para "litros" o "dulce" sueltos.

     EN SINGULAR Y EN PLURAL (19-ago). "2 premium mixtas PERSONALES" no casaba
     con la presentacion "Personal" —sobraba la "es"— y Paco preguntaba un
     tamaNo que el cliente acababa de escribir. Quien pide dos cosas las
     nombra en plural; es lo normal, no un caso raro. */
  const raiz = (w: string) => w.replace(/es$/, "").replace(/s$/, "");
  const palabras = t.split(" ").filter(w => w.length >= 3);
  for (const w of palabras) {
    const encajan = nombres.filter(n => normalizarTexto(n).split(" ").some(p =>
      p === w || raiz(p) === raiz(w)));
    if (encajan.length === 1) return encajan[0];
  }
  return null;
}

function extractPresentacion(text: string, presentations: ProductData["presentations"]): string | null {
  if (!presentations || presentations.length === 0) return null;
  return _cualOpcion(text, presentations.map(p => p.name));
}

function extractVariable(text: string, options: Array<{ name: string }>): string | null {
  if (!options || options.length === 0) return null;
  return _cualOpcion(text, options.map(o => o.name));
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
/* ¿EL MENSAJE ES UN REENVIO? (21-ago, caso real). La clienta reenvio sus
   propios mensajes y llegaron con el formato con que WhatsApp los copia:

       [21/8, 6:55 p.m.] Sofi: Las salsas aparte por favor

   Paco leyo eso como texto normal, encontro la palabra "salsas" —que es un
   producto del catalogo— y ARRANCO UN PEDIDO NUEVO de salsas: pregunto el
   sabor, ofrecio adiciones y volvio a pedir la direccion, con el pedido real
   ya pagado y en cocina. Aqui se reconoce el formato y se saca el contenido
   limpio, sin las fechas ni los nombres. */
const REENVIO_LINEA_RE = /^\s*\[\d{1,2}\/\d{1,2}(?:\/\d{2,4})?,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s*m\.?)?\]\s*[^:\n]{1,60}:\s*/i;

function reenv_texto(r: { texto: string; esReenvio: boolean }): string { return r.texto; }

function quitarReenvio(text: string): { texto: string; esReenvio: boolean } {
  const lineas = String(text || "").split("\n");
  let hubo = false;
  const limpias = lineas.map((ln) => {
    if (REENVIO_LINEA_RE.test(ln)) { hubo = true; return ln.replace(REENVIO_LINEA_RE, "").trim(); }
    return ln;
  });
  return { texto: limpias.join("\n").trim(), esReenvio: hubo };
}

/* ¿ES UNA INSTRUCCION DE COCINA? "Las salsas aparte", "sin cebolla", "que no
   le pongan picante", "poquito de ajo". No es un plato nuevo ni un dato del
   pedido: es COMO preparar lo que ya se pidio. */
/* Pero si el mensaje PIDE algo nuevo ("quiero otra salchipapa sin cebolla"),
   no es una nota sobre el pedido en cocina: es un pedido mas, y el flujo
   normal debe atenderlo. El verbo de pedir es lo que separa las dos cosas. */
const PIDE_NUEVO_RE = /\b(quier[oe]|quisiera|me\s+das|dame|me\s+haces|me\s+manda[sn]?|env[ií]ame|deseo|antoja|pedir|ordenar|otr[oa]\s+(pedido|salchipapa|hamburguesa|premium|mixta|sandwich|s[aá]ndwich))\b/i;

function esInstruccionCocina(text: string): boolean {
  const t = normalizarTexto(String(text || ""));
  if (!t || t.length > 300) return false;
  if (/\bsin\s+embargo\b/.test(t)) return false;
  return /\b(aparte|separad[oa]s?|sin\s+[a-z]{3,}|no\s+le\s+(pongan?|echen?|agreguen?)|que\s+no\s+(tenga|lleve|traiga)|poquit[oa]|bien\s+(asad|cocid|dorad|hech)[oa]s?|al\s+clima|sin\s+hielo)\b/.test(t);
}

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

/* PEDIR MENOS NO ES PEDIR MAS (pedido real, 17-ago): "una mixta CON POCAS
   SALSAS" salia con una adicion "Salsa" de $2.000 — le cobraron al cliente por
   justo lo que pedia que le pusieran MENOS. Si delante del nombre hay una
   palabra que resta, eso es una preferencia de cocina, no una adicion. */
function pideMenosDe(texto: string, nombre: string): boolean {
  const bn = normalizarTexto(String(texto || ""));
  const palabras = normalizarTexto(String(nombre || "")).split(/\s+/).filter(w => w.length >= 3);
  for (const w of palabras) {
    const i = bn.indexOf(w);
    if (i < 0) continue;
    const antes = bn.slice(Math.max(0, i - 30), i);
    if (/(sin|poca|pocas|poco|pocos|poquita|poquito|nada de|menos|casi nada de)\s+(de\s+)?$/.test(antes)) return true;
  }
  return false;
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
    /* Con la terminacion suelta: "con POCAS salsas" no lo cogia porque exigia
       "poca" seguido de algo que no fuera letra, y la "s" del plural lo tapaba.
       Es la nota que se perdio en el pedido real del 17-ago. */
    const re = new RegExp("(^|[^a-z0-9])" + dn + "[sa]?([^a-z0-9])", "g");
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
      /* "pocas salsas PARA RECOGER" llegaba entera a la comanda: el corte no
         contemplaba que despues de la preferencia venga como se entrega. */
      const corte = resto.search(/[,.;]| pero | para (recoger|recojer|llevar|domicilio)| a domicilio| y (un|una|uno|dos|tres|el |la |los |las |me |para |tambien|ademas)/i);
      let frase = (corte > 0 ? resto.slice(0, corte) : resto).trim();
      // Las cortesias del final no son parte de la preferencia: "poca salsa
      // por favor" tiene que llegar a la cocina como "poca salsa".
      frase = frase.replace(/[ ]+(por[ ]+favor|porfavor|porfa|porfis|gracias)[ .!]*$/i, "").trim();
      /* "solo eso", "solamente esto": es un CIERRE ("no quiero nada mas"),
         no una preferencia de cocina. Pedido real de Miguel (21-ago): su
         respuesta al upsell "No solo eso, pago por transferencia" llego a la
         comanda como nota "solo eso". El disparador "solo" sigue vivo para
         lo que si es preferencia ("solo bbq", "solo ajo"). */
      if (/^(?:solo|solamente|unicamente)s?[ ]+(?:eso|esto|aquello|asi|ya)([^a-z0-9]|$)/.test(normalizarTexto(frase))) continue;
      if (frase.length >= 4 && frase.length <= 60) frases.push(frase);
      if (frases.length >= 4) break;
    }
    if (frases.length >= 4) break;
  }
  /* EL CAMBIO DEL DOMICILIARIO. "con un billete de 100", "tengo 50 mil",
     "no tengo sencillo": el domiciliario tiene que salir con el cambio en la
     mano. El 17-ago esto no llegaba a la comanda y produjo la unica queja real
     de la noche. Es una nota del pedido, no una preferencia de cocina, pero va
     por el mismo canal (notas de la comanda). */
  const mBillete = bajo.match(/billetes? de ([0-9]{2,3})/);
  if (mBillete) frases.push("cambio para billete de " + mBillete[1]);
  else if (/no tengo sencillo|sin sencillo|no traigo sencillo/.test(bajo)) frases.push("el cliente no tiene sencillo");

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
/* Lo que el dueño configuro en la caja de Pago del canvas. En un solo sitio
   para que el dia que se agregue un interruptor nuevo no haya que buscarlo en
   cinco lados. Sin caja configurada se comporta como siempre. */
/* Deja solo las cuentas de transferencia que el dueño marco en el canvas. */
/* getMetodosPago devuelve solo nombre y digital. Para el QR hace falta la fila
   entera, asi que se lee aparte en vez de ensanchar el tipo de la otra y
   obligar a tocar sus nueve sitios. */
function getMetodosPagoRaw(pagos: Record<string, unknown> | null | undefined): Array<Record<string, unknown>> {
  const l = pagos?.metodos;
  return Array.isArray(l) ? l as Array<Record<string, unknown>> : [];
}

function filtrarCuentas(
  pagos: Record<string, unknown> | null | undefined,
  permitidos: string[] | null,
): Record<string, unknown> | null | undefined {
  if (!pagos || !permitidos || !permitidos.length) return pagos;
  const lista = pagos.metodos as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(lista)) return pagos;
  const filtrada = lista.filter(m => m && permitidos.includes(String(m.id || "")));
  /* CANDADO: si el filtro deja la lista vacia, o deja sin ninguna cuenta de
     transferencia habiendo alguna configurada, se ignora entero. Quedarse sin
     forma de cobrar rompe el pedido, y eso no puede pasar porque alguien
     desmarco una casilla sin darse cuenta. */
  if (filtrada.length === 0) return pagos;
  if (!filtrada.some(m => m.digital === true) && lista.some(m => m && m.digital === true)) return pagos;
  return { ...pagos, metodos: filtrada };
}

function cfgPago(cfg: Record<string, unknown>): {
  metodos_permitidos: string[] | null;
  enviar_qr: boolean;
  pago_previo: boolean;
  verificacion_auto: boolean;
  espera_min: number;
} {
  const p = Array.isArray(cfg.flujo_pasos)
    ? (cfg.flujo_pasos as Array<Record<string, unknown>>).find(x => x && x.campo === "pago" && x.activo !== false)
    : null;
  return {
    metodos_permitidos: p && Array.isArray(p.metodos_permitidos) ? (p.metodos_permitidos as unknown[]).map(String) : null,
    enviar_qr:          p ? p.enviar_qr          !== false : true,
    pago_previo:        p ? p.pago_previo        !== false : true,
    verificacion_auto:  p ? p.verificacion_auto  !== false : true,
    espera_min:         p && p.espera_comprobante_min != null ? Number(p.espera_comprobante_min) || 0 : 30,
  };
}

function getMetodosPago(pagosCfg: Record<string, unknown> | null | undefined): Array<{ nombre: string; digital: boolean; id: string }> {
  const lista = pagosCfg?.metodos as Array<{ nombre?: string; digital?: boolean; id?: string }> | undefined;
  if (Array.isArray(lista) && lista.length > 0) {
    return lista
      .map(m => ({ nombre: String(m?.nombre || "").trim(), digital: !!m?.digital, id: String(m?.id || "") }))
      .filter(m => m.nombre);
  }
  const out: Array<{ nombre: string; digital: boolean; id: string }> = [];
  if (pagosCfg?.efectivo)  out.push({ nombre: "Efectivo",  digital: false, id: "" });
  if (pagosCfg?.nequi)     out.push({ nombre: "Nequi",     digital: true,  id: "" });
  if (pagosCfg?.daviplata) out.push({ nombre: "Daviplata", digital: true,  id: "" });
  if (pagosCfg?.tarjeta)   out.push({ nombre: "Tarjeta",   digital: false, id: "" });
  return out;
}

/* Los dos metodos INTERNOS del sistema (la billetera del cliente y sus puntos)
   llevan el nombre del negocio: "Billetera El Parche Food". Eso los hacia ganar
   por UNA palabra suelta — "pago por nequi" salia como "billetera el parche
   food" (caso real de Juan Sebastian, 17-ago), y ese pago ni siquiera existe
   como transferencia. Se reconocen por su nombre completo o por las palabras
   que de verdad los nombran, nunca por un pedazo de la marca. */
function esMetodoInterno(id: string): boolean {
  return id === "__saldo" || id === "__puntos";
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
  /* 0) Los INTERNOS solo por las palabras que de verdad los nombran. Va antes
     de todo para que "con mi saldo" o "con puntos" —que no aparecen en el
     nombre de marca— se resuelvan bien. */
  const interno = (id: string) => metodos.find(m => m.id === id);
  /* "billetera" NO cuenta aqui: en Colombia una billetera es Nequi o Daviplata,
     o sea una TRANSFERENCIA. El lector traducia "por nequi" a "billetera" y
     con eso el pago caia en el saldo del cliente. La billetera del sistema se
     nombra con "saldo" o "monedero". */
  if (/\b(saldo|monedero)\b/.test(t) && !/\b(nequi|daviplata|bancolombia|davivienda|transfer\w*)\b/.test(t)) {
    const s = interno("__saldo");
    if (s) return s.nombre.toLowerCase();
  }
  /* "billetera EL PARCHE" (con la marca) SI es el saldo del sistema — lo que
     no vale es "billetera" a secas, que en Colombia es Nequi. Se reconoce por
     "billetera" + una palabra propia del nombre del metodo (20-ago-2026,
     pedido de Sergio: que Paco entienda que es la Billetera El Parche). */
  {
    const s2 = interno("__saldo");
    if (s2 && /\bbilletera\b/.test(t)) {
      const propias = normalizarTexto(s2.nombre).split(" ").filter(w => w.length >= 4 && w !== "billetera");
      if (propias.some(w => t.includes(w))) return s2.nombre.toLowerCase();
    }
  }
  if (/\bpuntos?\b/.test(t)) {
    const p = interno("__puntos");
    if (p) return p.nombre.toLowerCase();
  }
  // 1) Nombres configurados por el restaurante (frase completa o palabras de 4+ letras)
  for (const m of metodos) {
    const mn = normalizarTexto(m.nombre);
    if (!mn) continue;
    if (t.includes(mn)) return m.nombre.toLowerCase();
    /* Un metodo interno NUNCA gana por una palabra suelta de la marca. */
    if (esMetodoInterno(m.id)) continue;
    const palabras = mn.split(" ").filter(w => w.length >= 4);
    if (palabras.some(w => new RegExp(`\\b${w}\\b`).test(t))) return m.nombre.toLowerCase();
  }
  /* 2) Sinonimos generales -> el metodo digital configurado. Cualquier
     billetera que nombre el cliente (nequi, daviplata, el banco, "por llave",
     el QR) es UNA TRANSFERENCIA a la cuenta del restaurante. */
  if (/\b(nequi|daviplata|bancolombia|davivienda|consignar|consignacion|llave|billetera|qr)\b/.test(t)) {
    const dig = metodos.find(m => m.digital);
    if (dig) return dig.nombre.toLowerCase();
  }
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

/* ¿Esta categoria de la carta es de adiciones? Lo decide la CATEGORIA, no una
   lista de palabras: DYN_ADICION_KEYWORDS mezcla los productos de esas
   categorias con las palabras que escribio el dueño, y Sergio tiene
   "super queso" configurada como palabra de adicion — que ademas es una
   salchipapa. Preguntandole a la lista, esa salchipapa se volvia una adicion
   de otro plato y nunca se pedia. La categoria no se puede confundir. */
/* OJO: aqui NO va `bebida`. Una gaseosa se reconoce como respuesta a "¿algo
   mas?" (de eso se encarga CAT_ADICION_RE), pero se GUARDA como plato aparte:
   tiene su precio, su presentacion —personal o 1.5 litros— y su linea en la
   comanda. Metida aqui, la Coca Cola quedaba como texto pegado a la
   salchipapa, sin preguntarle el tamaño y sin cobrarse. */
/* OJO CON EL PEDAZO (18-ago): "Salchipapas TrADICIONales" contiene
   "adicion". Esta regex decide si una categoria de la carta es de
   adiciones, asi que sin exigir que la palabra EMPIECE, TODA la categoria
   mas vendida del restaurante quedaba clasificada como adiciones. */
const CAT_ES_ADICION = /(^|[^a-záéíóúñ])(adicion|adici[oó]n|extra|salsa|acompan|acompañ)/i;
function esCategoriaAdicion(cat: string | null | undefined): boolean {
  return !!cat && CAT_ES_ADICION.test(cat);
}

/* ══════════════════════════════════════════════════════════════════════
   ¿PLATO O ADICION?

   Lo que decide no es el nombre, es lo que va justo antes. "una ranchera CON
   super queso" y "y tambien me das UNA super queso" nombran lo mismo y son
   cosas distintas: en la primera el super queso va sobre la ranchera, en la
   segunda es otro plato.

   Es gramatica, no catalogo, asi que vale para cualquier restaurante.
   ══════════════════════════════════════════════════════════════════════ */

/* Lo que convierte el nombre en algo que se le AGREGA a otro plato. */
const CONECTOR_ADICION = /\b(con|c\/|mas|extra|adicion|adicional|adicionar|agregale|agregar|agrega|ponle|poner|añade|anade|añadir|anadir|acompanado|acompañado)\s+(de\s+|un[ao]?\s+|el\s+|la\s+)*$/i;

/* Lo que lo convierte en un plato propio: un articulo o un verbo de pedir. */
const CONECTOR_PLATO = /\b(un|una|unos|unas|otro|otra|dos|tres|cuatro|cinco|[0-9]+|dame|das|deme|quiero|quisiera|regalame|regalas|traeme|traes|pon[gm]ame|llevo|llevar|pedir|pido)\s+(un[ao]?\s+|el\s+|la\s+|los\s+|las\s+)*$/i;

/* ¿El catalogo tiene este nombre como plato, como adicion, o como los dos? */
function dondeVive(nombre: string): { plato: boolean; adicion: boolean } {
  const n = normalizarTexto(nombre);
  let plato = false, adicion = false;
  for (const e of DYN_PROD_MAP) {
    if (normalizarTexto(e.name) !== n) continue;
    if (esCategoriaAdicion(e.cat)) adicion = true; else plato = true;
  }
  /* Las palabras que el dueño escribio a mano cuentan SIEMPRE, aunque el
     nombre ya exista como plato. Ese es justo el caso de "super queso": en la
     carta solo vive como salchipapa, y que ademas sea adicion viene de esta
     lista. Mirandola solo cuando el nombre NO era un plato, nunca llegaba a
     ser "las dos cosas" y el conector no alcanzaba a decidir. */
  if (DYN_ADICION_KEYWORDS.includes(n)) adicion = true;
  /* Y sobre todo: las adiciones de VERDAD, las de los grupos de modificadores.
     Ahi estan con su precio y separadas por tamaño. */
  if (DYN_MOD_NAMES.includes(n)) adicion = true;
  return { plato, adicion };
}

/* Clasifica UN nombre encontrado en el texto. `pos` es donde empieza dentro
   del texto ya normalizado — de ahi se mira lo que viene justo antes. */
/* "y tambien me das una...", "ademas dos...", "y de paso un..." — el cliente
   esta pidiendo OTRO PLATO, no agregando algo al que ya pidio. Es la regla que
   Sergio enuncio expresamente, asi que manda sobre lo que adivine el modelo.
   Cada pedazo es opcional porque la gente lo dice de todas las formas:
   "y tambien una", "tambn", "ademas me das dos", "y de paso". */
const PIDE_OTRO_PLATO =
  /\b(tambien|tambn|tmb|tb|ademas|adems|de\s+paso|aparte)\b[\s,]*((me|te|le)\s+)?((das?|dame|deme|regalas?|regalame|quiero|quisiera|pon[gm]e|llevo|traeme)\s+)?((un|una|unos|unas|otr[ao]|dos|tres|cuatro|[0-9]+)\s+)?$/i;

function clasificarMencion(
  textoNorm: string,
  m: { name: string; pos: number },
  esPasoAdiciones: boolean,
  agregados: string[] = [],
): "plato" | "adicion" {
  const vive = dondeVive(m.name);
  /* Si solo puede ser una cosa, no hay nada que decidir. EL CATALOGO MANDA
     sobre lo que diga el modelo: si en la carta solo existe como plato, no hay
     forma de que sea una adicion. */
  if (vive.plato && !vive.adicion) return "plato";
  if (vive.adicion && !vive.plato) return "adicion";

  const antesTodo = textoNorm.slice(0, m.pos + 1);

  /* Vive en los dos lados. Antes que nada, LO QUE DIJO EL DUEÑO EXPRESAMENTE.
     Sergio lo dejo dicho sin ambiguedad: "y tambien me das una super queso"
     es un plato aparte; si fuera adicion el cliente diria "me la das CON super
     queso". El modelo se equivoca en este caso (probado: lee "tambn super
     queso" como agregado), y una regla que el dueño enuncio explicitamente
     manda sobre lo que adivine el modelo. El modelo decide donde el dueño no
     hablo, no donde ya hablo. */
  if (PIDE_OTRO_PLATO.test(antesTodo)) return "plato";

  /* PERO "AGREGAME UNA COCA COLA" NO ES UN TOPPING. Los verbos de agregar
     estan en los dos mundos: "agregale queso" le pone algo al plato, y
     "agregame UNA coca cola" pide otro producto. Lo que los separa es el
     ARTICULO: si detras del verbo viene "una / otra / dos", el cliente esta
     nombrando una cosa aparte, no algo que va encima. Sin esto, "agregame una
     coca cola personal" despues del resumen entraba como adicion — se cobraban
     los $5.000 pero la gaseosa salia impresa como topping de la salchipapa, no
     como su propia linea. */
  const AGREGAR_CON_ARTICULO = new RegExp("(?:^|[^a-z])(?:agrega(?:me|r|s)?|anade(?:me)?|a" + "ñ" + "ade(?:me)?|anadir|suma(?:me)?|sumar)\\s+(?:un|una|unos|unas|otr[ao]s?|dos|tres|cuatro|[0-9]+)\\s+(?:de\\s+)?$", "i");
  if (AGREGAR_CON_ARTICULO.test(antesTodo)) return "plato";

  /* Despues, LO QUE ENTENDIO EL MODELO: le lee la intencion al cliente escriba
     como escriba ("cn", "kon", "c/", o una vuelta rara que ninguna lista
     prevee). */
  const nom = normalizarTexto(m.name);
  if (agregados.some(a => {
    const an = normalizarTexto(a);
    return an === nom || an.includes(nom) || nom.includes(an);
  })) return "adicion";

  /* Respaldo: lo que va justo antes. Vale cuando el modelo falla, se demora o
     no lo vio. Nunca peor que antes. */
  const antes = antesTodo;
  if (CONECTOR_ADICION.test(antes)) return "adicion";
  if (CONECTOR_PLATO.test(antes))   return "plato";

  /* Sin conector: si la pregunta pendiente es justo la de las adiciones, el
     cliente esta contestando eso. Si no, es un plato — la regla de Sergio: si
     quisiera la adicion lo habria dicho ("me la das CON super queso"). */
  return esPasoAdiciones ? "adicion" : "plato";
}

/* Los nombres del texto, ya clasificados. Un solo recorrido para los dos
   lados: antes eran dos códigos compitiendo y ganaba el que corriera primero. */
function mencionesClasificadas(
  texto: string,
  esPasoAdiciones = false,
  intenciones: Record<string, unknown> = {},
): Array<{ name: string; cat: string; pos: number; clase: "plato" | "adicion" }> {
  const textoNorm = " " + normalizarTexto(texto) + " ";
  const agregados = Array.isArray(intenciones.agregados)
    ? (intenciones.agregados as unknown[]).map(String).filter(Boolean) : [];

  const hallados = matchProductosEnTexto(texto);

  /* Y las adiciones que viven SOLO en los grupos de modificadores. Las de El
     Parche existen tambien como productos, asi que el buscador de arriba las
     encuentra; en otro restaurante puede haber una que no ("Doble queso",
     "Punto de la carne") y sin esto no se veria nunca. */
  const yaVistos = new Set(hallados.map(h => normalizarTexto(h.name)));
  for (const n of DYN_MOD_NAMES) {
    if (yaVistos.has(n)) continue;
    const i = textoNorm.indexOf(" " + n + " ");
    if (i < 0) continue;
    /* El nombre tal como lo escribio el restaurante, no normalizado. */
    let real = n;
    for (const g of (MODS_CACHE?.grupos || [])) {
      const o = g.options.find(x => normalizarTexto(x.name) === n);
      if (o) { real = o.name; break; }
    }
    hallados.push({ name: real, cat: "Adiciones", pos: i });
    yaVistos.add(n);
  }
  hallados.sort((a, b) => a.pos - b.pos);

  return hallados.map(m => ({
    ...m,
    clase: clasificarMencion(textoNorm, m, esPasoAdiciones, agregados),
  }));
}

/* Un nombre escrito como sea, llevado al nombre real de la carta. Tolera
   errores igual que el respaldo de productos ("qeso" -> "Queso"), pero solo
   acepta lo que de verdad existe: el modelo dice el papel, la carta dice el
   nombre. */
function resolverAdicionCatalogo(nombre: string): string | null {
  const n = normalizarTexto(nombre);
  if (n.length < 3) return null;
  /* Exacto primero. */
  const exacto = DYN_PROD_MAP.find(e => normalizarTexto(e.name) === n);
  if (exacto) return exacto.name;
  /* Por parecido: uno contiene al otro, o comparten todas las palabras largas.
     "super qeso" y "super queso" comparten "super" y difieren en una letra. */
  const palabras = n.split(" ").filter(w => w.length >= 3);
  let mejor: { name: string; puntos: number } | null = null;
  for (const e of DYN_PROD_MAP) {
    const en = normalizarTexto(e.name);
    let puntos = 0;
    if (en.includes(n) || n.includes(en)) puntos = 3;
    else {
      const suyas = en.split(" ").filter(w => w.length >= 3);
      const comunes = palabras.filter(w => suyas.some(x => x === w || parecidas(x, w)));
      if (comunes.length > 0 && comunes.length >= Math.min(palabras.length, suyas.length)) puntos = 2;
    }
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { name: e.name, puntos };
  }
  return mejor ? mejor.name : null;
}

/* Dos palabras que difieren en una sola letra (una letra de mas, de menos o
   cambiada). Cubre "qeso"/"queso", "gaseosa"/"gasesosa". */
function parecidas(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 4 || b.length < 4) return false;
  let i = 0, j = 0, fallos = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++fallos > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return fallos + (a.length - i) + (b.length - j) <= 1;
}

function extractAdiciones(
  text: string,
  isCurrentStep: boolean,
  intenciones: Record<string, unknown> = {},
  /* Lo que ya se esta pidiendo: nada de eso puede ser su propia adicion. */
  pedidoActual: string | null = null,
  pedidoPrevio: string[] = [],
): string | null {
  const t = text.toLowerCase().trim();
  if (t === "no" || t === "no." || t === "noo" || t === "no," || t === "n" || t === "na") {
    return isCurrentStep ? "" : null;
  }
  if (isCurrentStep && esRechazoDeMas(text, intenciones)) return "";
  const tNorm = " " + normalizarTexto(text).toLowerCase() + " ";
  /* Por PALABRA COMPLETA, no por pedazo. Con `includes` suelto, "queso" caía
     dentro de "super queso" y "coca" dentro de cualquier palabra que la
     tuviera: media frase se volvía una adición por accidente. */
  const contiene = (kw: string) => tNorm.includes(" " + normalizarTexto(kw).toLowerCase() + " ");

  /* El clasificador decide cuál nombre es plato y cuál es adición, mirando lo
     que va justo antes. Aquí solo se toman las adiciones. */
  const menciones = mencionesClasificadas(text, isCurrentStep, intenciones);
  const platosNombrados = new Set(
    menciones.filter(m => m.clase === "plato").map(m => normalizarTexto(m.name))
  );
  const adicionesReales = menciones.filter(m => m.clase === "adicion").map(m => m.name);

  /* LO QUE EL MODELO ENTENDIO, RESUELTO CONTRA LA CARTA. El cliente escribe
     "cn super qeso" y el modelo entiende perfectamente que va encima de la
     ranchera — pero ese nombre mal escrito no coincide con nada del catálogo,
     así que se perdía. El modelo dice el papel; la carta dice el nombre real.
     Si no se puede resolver contra la carta, no entra: preferimos perder una
     adición a inventar un producto que no existe. */
  for (const a of (Array.isArray(intenciones.agregados) ? intenciones.agregados as unknown[] : [])) {
    const real = resolverAdicionCatalogo(String(a));
    if (!real) continue;
    const rn = normalizarTexto(real);
    /* EL PUENTE NO SE SALTA AL CLASIFICADOR. Solo entra donde el clasificador
       no llegó: nombres tan mal escritos que el catálogo no los reconoció de
       frente. Si ese mismo nombre ya se clasificó como PLATO en este mensaje,
       manda la clasificación — si no, este atajo volvería adición justo lo que
       la regla acaba de decidir que es un plato aparte, y la regla quedaría
       escrita pero sin cumplirse. */
    if (platosNombrados.has(rn)) continue;
    if (adicionesReales.some(x => normalizarTexto(x) === rn)) continue;
    adicionesReales.push(real);
  }

  /* Palabras que el restaurante configuró y que NO son platos de la carta
     ("queso extra", "salsa de ajo"). Se guardan esas palabras, jamás la frase
     entera del cliente. */
  const sueltas = getAdicionKeywords()
    .filter(kw => !ADICION_GENERICAS.includes(kw) && contiene(kw))
    .filter(kw => !platosNombrados.has(normalizarTexto(kw)))
    /* Y tampoco si la palabra está DENTRO del nombre de un plato que se acaba
       de nombrar: en "una super queso", "super queso" es la salchipapa. */
    .filter(kw => ![...platosNombrados].some(p => p.includes(normalizarTexto(kw))));

  /* ── UNA SOLA SALIDA ──────────────────────────────────────────────────
     Los dos caminos —lo que dijo el clasificador y las palabras del dueño—
     se juntan aquí y se filtran juntos. Estaban separados, cada uno con su
     `return`, y el candado se aplicó a uno solo: "super queso" volvió a
     colarse por el otro. Dos caminos que hacen lo mismo con una regla puesta
     en uno es como se cuela todo.

     EL CANDADO: un plato no puede ser adición de sí mismo. El modelo leyó
     "una salchipapa super queso" como "una salchipapa CON super queso" —
     entendible, porque el nombre del plato lleva adentro el de la adición— y
     dejaba "1x Súper queso + súper queso". Ninguna regla de conectores ni de
     catálogo atrapa eso: hace falta saber qué se está pidiendo. */
  const yaEsPlato = new Set(
    [pedidoActual, ...(pedidoPrevio || [])]
      .filter(Boolean).map(p => normalizarTexto(String(p)))
  );
  const candidatas = [...adicionesReales, ...sueltas].filter(a => {
    const an = normalizarTexto(a);
    /* "con pocas salsas" pide MENOS, no una adicion mas (ver pideMenosDe). */
    if (pideMenosDe(text, a)) return false;
    if (yaEsPlato.has(an)) return false;
    /* Y tampoco un pedazo del nombre del plato que se está pidiendo: en "una
       salchipapa super queso", "queso" no es una adición. */
    return ![...yaEsPlato].some(p => p.includes(an));
  });
  /* Sin repetir: el mismo nombre puede venir del catálogo y de la lista de
     palabras del dueño, y comparados letra por letra parecen distintos
     ("Tocineta" y "tocineta"). Se comparan normalizados y gana el del
     CATÁLOGO, que es el que el cliente reconoce y el que va a la cocina. */
  const unicas = new Map<string, string>();
  for (const a of candidatas) {
    const k = normalizarTexto(a);
    const delCatalogo = DYN_PROD_MAP.some(e => normalizarTexto(e.name) === k && e.name === a);
    if (!unicas.has(k) || delCatalogo) unicas.set(k, a);
  }
  if (unicas.size > 0) {
    return [...unicas.values()].join(", ").slice(0, 80);
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


/* LA DIRECCION NO SE TRAGA EL MENSAJE ENTERO (19-ago, pedido real de Sneider
   del 18). Escribio, en tres renglones:

       Para el : conjunto portal de pomona
       Nombre : sneider Sanchez
       Casa 13

   Como ningun renglon tiene calle ni numero de via —es un conjunto, no los
   necesita— la captura caia al ultimo recurso y guardaba EL TEXTO COMPLETO.
   La comanda salia con "Nombre : sneider Sanchez" metido dentro de la
   direccion, y eso es lo que lee el domiciliario.

   Aqui se botan los renglones que son OTRO dato (nombre, telefono, pago) y se
   le quita a los que quedan su etiqueta de adelante. Lo que sobra es el sitio.
   Solo se usa cuando no hubo un renglon con calle: ese camino ya funcionaba. */
const RENGLON_OTRO_DATO_RE = /^\s*(?:nombre|telefono|tel[\u00e9]fono|celular|cel|numero|n[\u00fa]mero|pago|m[\u00e9]todo|metodo|correo|email|cliente|pedido|orden|detalles?|nota|observaci[\u00f3]n)\s*[:.-]/i;
const RENGLON_PREFIJO_RE = /^\s*(?:para\s+(?:el|la|los|las)?|direcci[\u00f3]n|direccion|dir|barrio|hacia|a)\s*[:.-]\s*/i;

function direccionDeVariosRenglones(text: string): string | null {
  const lineas = text.split(String.fromCharCode(10)).map(l => l.trim()).filter(Boolean);
  if (lineas.length < 2) return null;
  const utiles = lineas
    .filter(l => !RENGLON_OTRO_DATO_RE.test(l))
    .map(l => l.replace(RENGLON_PREFIJO_RE, "").trim())
    .filter(Boolean);
  if (!utiles.length) return null;
  const junto = utiles.join(", ");
  /* Si al limpiar no se quito nada, no hay nada que ganar: que siga el camino
     de siempre y no se cambie el comportamiento que ya servia. */
  if (junto.length >= text.trim().length) return null;
  return junto;
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
      // Antes de guardar el mensaje entero, quitarle lo que es otro dato.
      return direccionDeVariosRenglones(text) || text.trim();
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

/* UNA ETIQUETA DE PLANTILLA NO ES UN NOMBRE (caso real, Kevin 17-ago). Hay
   clientes que mandan el pedido con formato de formulario:

       PEDIDO +detalles
       1 premium mixta de 35
       Direccion
       Carrera 9 ...
       Telefono
       3114015448

   Cada renglon-etiqueta ("Telefono", "Direccion", "Pedido") es una linea
   suelta con forma de nombre, y el extractor guardo nombre="Telefono": Paco
   nunca pregunto el nombre y el pedido habria salido a nombre de Telefono.
   Son palabras que NADIE tiene de nombre; se descartan completas. */
/* UNA PREGUNTA NO ES UN NOMBRE (18-ago). Francisco pregunto "Cuanto se
   demora" justo cuando el flujo esperaba el nombre, y el pedido quedo a nombre
   de "Cuanto se demora". Nadie se llama asi: si el texto trae palabras de
   pregunta —cuanto, cuando, donde, demora, tarda, llega, vale, cuesta— o un
   signo de interrogacion, es una pregunta que el flujo debe RESPONDER, no un
   nombre que capturar. */
const PREGUNTA_NO_NOMBRE_RE = /(\?|¿|\b(cuant[oa]s?|cu[aá]nt[oa]s?|cuando|cu[aá]ndo|donde|d[oó]nde|demoran?|tardan?|llegan?|cuestan?|valen?|q(?:ue)?\s+horas?|hasta\s+q)\b)/i;

/* UNA FRASE DE TIEMPO NO ES UN NOMBRE (21-ago, caso real). La clienta
   contesto "Apenas este lista" —hablando de CUANDO pasaba a recoger su
   salchipapa— y el pedido quedo a nombre de "Apenas este lista". Paco hasta
   pregunto despues "¿el pedido va a nombre de Apenas este lista?".
   Una frase que empieza con una palabra de tiempo (apenas, cuando, ahorita,
   tan pronto...) o que habla de que algo este listo/salga/llegue es una
   condicion, no una persona. */
/* UNA FORMA DE PAGO NO ES UN NOMBRE — NI MAL ESCRITA (21-ago, caso real).
   La clienta mando todo en un mensaje y remato con "Pago tranferencia" (sin
   la primera ese). El filtro de pagos no reconocio la palabra por el error
   de dedo, la linea tenia forma de nombre, y el pedido salio a nombre de
   "Pago tranferencia" — con la clienta GUARDADA como Monica Ramirez.
   La gente escribe rapido en el chat: el filtro tiene que aguantar las
   formas comunes de equivocarse, no solo la palabra perfecta. */
const PAGO_NO_NOMBRE_RE = /\b(pag[oa]s?|pagar[ae]?|pague|transferencias?|tranferencias?|trasferencias?|transferensias?|transfiero|transferir|consignar|consignacion|consigno|efectivo|nequi|daviplata|bancolombia|billetera|comprobante|qr)\b/i;

const FRASE_TEMPORAL_RE = /^\s*(apenas|cuando|cu[aá]ndo|ahorita|ahora|ya\s+casi|tan\s+pronto|ni\s+bien|luego|despu[eé]s|mientras|en\s+cuanto|a\s+penas)\b|\b(est[eé]n?\s+list[oa]s?|este\s+list[oa]|salga|llegue|termine)\b/i;

const ETIQUETA_PLANTILLA_RE = /^\s*(tel[eé]fono|direcci[oó]n|pedido|pago|nombre|detalles?|cliente|barrio|celular|numero|n[uú]mero|datos|observaci[oó]n(es)?|nota s?)\s*[:.]?\s*$/i;

/* UNA CORTESIA NO ES UN NOMBRE. Sergio mando la direccion en dos mensajes y
   remato con "porfa": el pedido quedo a nombre de "porfa". La lista de arriba
   tenia las excusas ("ya te lo dije", "lee arriba") pero no lo que la gente
   escribe suelto todo el tiempo. Va aparte porque son mensajes COMPLETOS que
   no dicen nada, no frases dentro de un mensaje. */
const SOLO_CORTESIA_RE = /^\s*(por\s*fa(s|vor|vorcito)?|porfis|porfi|pls|plis|please|gracias|muchas\s+gracias|mil\s+gracias|graciass*|ok(is)?|oki|listo|dale|bueno|va|dele|hagale|de\s+una|ahi\s+te\s+va|ahi\s+va|eso|eso\s+es|ya|si|s[ií]|no|nada|nada\s+m[aá]s|perfecto|excelente|genial|buenas|buenas\s+tardes|buenos\s+d[ií]as|buenas\s+noches|hola|chao|adios|bye)\s*[.!]*\s*$/i;

// Marcadores EXPLÍCITOS de nombre — permiten capturarlo desde cualquier mensaje
// (no solo en el paso "nombre"), p.ej. cuando el cliente da todo en un solo mensaje.
const NOMBRE_MARCADOR_RE = /(?:me\s+llamo|mi\s+nombre\s+es|a\s+nombre\s+de|el\s+nombre\s+es|cambia\s+el\s+nombre\s+a|el\s+pedido\s+es\s+para)\s+([a-záéíóúüñÁÉÍÓÚÜÑ]+(?:\s+[a-záéíóúüñÁÉÍÓÚÜÑ]+){0,2})/i;

function extractNombre(text: string, isCurrentStep: boolean, productData: ProductData | null = null, domCfg: Record<string, unknown> | null = null): string | null {
  /* Un mensaje que es SOLO una cortesia no trae nombre, este o no en el paso
     del nombre. "porfa" a secas es lo que sigue a otra cosa, no una respuesta. */
  if (SOLO_CORTESIA_RE.test(text)) return null;
  /* "Catalana*" — una palabra sola rematada en asterisco es como la gente se
     corrige en el chat. Sea lo que sea que este corrigiendo, no es su nombre:
     el pedido de Paula quedo a nombre de "Catalana*". */
  if (/^\s*[a-záéíóúüñ]+\s*[*]+\s*$/i.test(text)) return null;
  /* NADIE SE LLAMA "EXACTAMENTE". A "¿el pedido va a nombre de Sergio?" el
     cliente contesto "exactamente" y quedo guardado como su nombre: asi salio
     en el resumen y asi habria salido en la comanda.
     Es una regla del español y no una lista: una palabra terminada en -mente
     es un adverbio, nunca un nombre propio. Cubre sola "efectivamente",
     "obviamente", "correctamente", "seguramente", "claramente". */
  if (/^\s*[a-záéíóúüñ]+mente\s*[.!]*\s*$/i.test(text)) return null;
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
        if (SOLO_CORTESIA_RE.test(ln)) continue;
        if (esSoloConfirmacion(ln)) continue;
        if (esRechazoDeMas(ln)) continue;
        if (ETIQUETA_PLANTILLA_RE.test(ln)) continue;   // "Telefono", "Direccion"...
        if (PREGUNTA_NO_NOMBRE_RE.test(ln)) continue;   // "Cuanto se demora" no es un nombre
        if (FRASE_TEMPORAL_RE.test(ln)) continue;      // "Apenas este lista" tampoco
        if (PAGO_NO_NOMBRE_RE.test(ln)) continue;      // "Pago tranferencia" menos
        const lnNorm = normalizarTexto(ln);
        if (getAdicionKeywords().some(k => k.length >= 4 && new RegExp(`\\b${k}\\b`).test(lnNorm))) continue;
        if (extractPago(ln, null)) continue;
        if (isProductAttribute(ln, productData)) continue;
        if (CALLE_REGEX.test(ln) || LLEVAR_REGEX.test(ln)) continue;
        /* UN LUGAR NO ES UN NOMBRE (caso real, 15-ago): el cliente mando
           "Carrera 9# 21-N 46" y "Ciudad jardín" — la linea del barrio tiene
           forma de nombre (solo letras, dos palabras) y la factura salio a
           nombre de "Ciudad jardín". Si la linea es una zona con precio de
           domicilio o un conjunto conocido, es un lugar, no una persona. */
        if (domCfg && (esConjunto(ln, domCfg) || lookupDomiPrice(ln, domCfg) !== null)) continue;
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
  /* "Catalana*" — el asterisco es como la gente corrige en el chat. Se quita
     ANTES de mirar si es un barrio: con el asterisco pegado no casaba con
     ninguna zona y el pedido quedo a nombre de "Catalana*". */
  t = t.replace(/[.,;*_~!?]+$/, "").trim();
  if (t.length < 2 || t.length > 60) return null;
  if (NO_ES_NOMBRE_RE.test(t)) return null;                              // reclamos/meta ("ya te lo dije")
  if (ETIQUETA_PLANTILLA_RE.test(t)) return null;                        // "Telefono", "Direccion"...
  if (PREGUNTA_NO_NOMBRE_RE.test(t)) return null;                        // una pregunta no es un nombre
  if (FRASE_TEMPORAL_RE.test(t)) return null;                            // "Apenas este lista" no es un nombre
  if (PAGO_NO_NOMBRE_RE.test(t)) return null;                            // una forma de pago tampoco, ni mal escrita
  if (esSoloConfirmacion(t)) return null;                                // "si", "dale", "ok"…
  if (t.includes("?") || t.includes("¿")) return null;                   // preguntas no son nombres
  if (extractPago(t, null)) return null;
  if (isProductAttribute(t, productData)) return null;
  /* UNA ADICION NO ES UN NOMBRE (19-ago, hallado en las pruebas). Justo cuando
     Paco preguntaba el nombre, el cliente escribio "Con adicion de tocineta" y
     el pedido quedo a nombre de eso — asi habria salido la comanda. La rama
     de varios renglones ya miraba las adiciones; esta, la del mensaje de una
     sola linea, no. Cuatro caminos capturan nombres y cada regla hay que
     ponerla en todos. */
  {
    const tn = normalizarTexto(t);
    if (getAdicionKeywords().some(k => k.length >= 4 &&
        (tn === k || tn.includes(" " + k) || tn.startsWith(k + " ")))) return null;
  }
  if (CALLE_REGEX.test(t) || LLEVAR_REGEX.test(t)) return null;
  if (/^\d+$/.test(t)) return null;
  /* NI AUNQUE VENGA CON PALABRAS. "Mi numero es 3155551234" quedo como el
     NOMBRE de un cliente en la prueba del banco: el cliente contestaba con su
     celular a la pregunta del nombre. Si la frase es basicamente un telefono,
     no es un nombre. */
  if (celularValido(t) && t.replace(/[^0-9]/g, "").length >= 10 && t.length <= 40) return null;
  // Un lugar tampoco pasa por la via del marcador ("es para Ciudad Jardín").
  if (domCfg && (esConjunto(t, domCfg) || lookupDomiPrice(t, domCfg) !== null)) return null;
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
    /* LA PANTALLA LLAMA A ESTO "Preguntar tamaNo" y el motor buscaba solo
       `preguntar_presentacion`: lo que Sergio escribio en esa casilla se
       tiraba a la basura y el bot usaba el texto de fabrica (21-ago-2026).
       Se aceptan las dos llaves. */
    const frase = getFraseCfg(frasesCfg.preguntar_presentacion || frasesCfg.preguntar_tamano);
    const texto = (frase.texto || "¿La quieres {opciones}? 😋").replace(/\{opciones\}/g, opciones);
    const guia  = frase.guia
      ? frase.guia.replace(/\{opciones\}/g, opciones)
      : `Pregunta cuál presentación prefiere. SOLO estas opciones exactas: ${opciones}. No ofrezcas ninguna otra opción.`;
    pasos.push({ id: "presentacion", campo: "tamano", modo: frase.modo, texto, guia });
  }
  for (const vg of productData.variables) {
    if (!vg.options || vg.options.length === 0) continue;
    const opciones = listaNatural(vg.options.map(o => o.name.toLowerCase()));
    const frase = getFraseCfg(frasesCfg.preguntar_variable);
    const texto = (frase.texto || `¿La deseas con {opciones}?${emo()}`)
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

/* ══════════════════════════════════════════════════════════════════════
   EL LECTOR DEL PEDIDO — entiende, no compara texto

   Le pasa al modelo TODO el contexto: que se acaba de preguntar, que hay ya
   en el pedido, y las opciones REALES del producto sacadas del catalogo. El
   modelo dice que entendio; el catalogo dice si eso existe.

   Vale la llamada: es la diferencia entre entender "1.5", "litro y medio" y
   "la de litro y medio" o pedirle al cliente que escriba el nombre exacto.
   ══════════════════════════════════════════════════════════════════════ */
type PedidoLeido = {
  producto?: string; cantidad?: number; tamano?: string;
  variantes?: string[]; adiciones?: string[];
  direccion?: string; barrio?: string; nombre?: string; pago?: string;
  /* Lo que el cliente pide QUITAR de lo que ya tiene. Antes no existía: a
     "mejor sin la adición" el bot no tenía forma de entender que había que
     sacar algo, y lo guardaba como una preferencia del plato. */
  quitar?: string[];
  /* Lo que va ENCIMA de otro plato (no un plato aparte). El lector ya lo
     devolvia; faltaba declararlo aqui. */
  agregados?: string[];
  /* La nota de cocina ENTENDIDA, no cazada por palabras (21-ago, pedido de
     Sergio: "siempre debe entender intenciones"). El dia que un cliente
     diga las cosas de manera totalmente diferente, esto es lo que lo
     entiende; el capturador de palabras queda solo de respaldo. */
  nota?: string;
  /* UNA ADICION EN OTRO TAMAÑO (22-ago-2026, caso real de Yubeli).
     Dentro de una salchipapa familiar solo caben adiciones familiares: asi
     esta armada la carta. Cuando el cliente pide una adicion de OTRO tamaño,
     no es una adicion de ese plato — es un producto suelto de la categoria
     Adiciones, que existe justo para eso. */
  adicion_otro_tamano?: { nombre?: string; tamano?: string } | null;
};

async function leerPedido(
  texto: string,
  state: PacoState,
  productData: ProductData | null,
  pasoPendiente: string | null,
  pagosCfg: Record<string, unknown> | null | undefined,
  gruposMod: GrupoMod[],
  historial: string,
): Promise<PedidoLeido> {
  if (!texto || !texto.trim()) return {};

  /* Las opciones REALES de este producto. Sin esto el modelo adivinaria, que
     es justo lo que se quiere evitar. */
  const pres = productData?.presentations?.map(p => p.name) || [];
  const vars = (productData?.variables || []).map(g => ({
    grupo: g.name, opciones: (g.options || []).map(o => o.name),
  }));
  const adis = new Set<string>();
  for (const g of gruposMod) for (const o of g.options) adis.add(o.name);
  /* Los nombres solos engañan al lector: "Billetera El Parche Food" es el SALDO
     PREPAGADO del cliente, pero por llamarse billetera se llevaba cualquier
     "pago por nequi" (caso real de Juan Sebastian, 17-ago) — y ese pago
     terminaba cobrado de un saldo que el cliente no tiene. Cada metodo va con
     lo que de verdad es. */
  const metodos = getMetodosPago(pagosCfg).map(m => {
    if (m.id === "__saldo")  return `${m.nombre} (SALDO PREPAGADO que el cliente ya tiene cargado aqui)`;
    if (m.id === "__puntos") return `${m.nombre} (pagar con sus PUNTOS de fidelidad)`;
    if (m.digital) return `${m.nombre} (cualquier billetera digital: Nequi, Daviplata, llave, QR, consignacion)`;
    return m.nombre;
  });

  const yaHay = [
    state.producto ? `producto: ${state.producto}` : null,
    state.tamano   ? `tamaño: ${state.tamano}`     : null,
    state.tipo     ? `variante: ${state.tipo}`     : null,
    /* Las adiciones que YA lleva: sin esto el lector no tiene contra qué
       entender un "quítame la adición". */
    state.adiciones? `adiciones: ${state.adiciones}` : null,
    state.direccion? `dirección: ${state.direccion}` : null,
    state.barrio   ? `barrio: ${state.barrio}`     : null,
    state.nombre   ? `nombre: ${state.nombre}`     : null,
    state.pago     ? `pago: ${state.pago}`         : null,
  ].filter(Boolean).join(", ") || "nada todavía";

  const QUE_SE_PREGUNTO: Record<string, string> = {
    presentacion: "el TAMAÑO o presentación del producto",
    upsell:       "si quiere agregar algo más",
    sugerencia:   "si quiere agregar algo más",
    direccion:    "la DIRECCIÓN de entrega",
    confirmar_dir:"si usa la misma dirección de antes",
    nombre:       "el NOMBRE a quien se recibe",
    pago:         "CÓMO va a pagar",
  };
  const preguntado = pasoPendiente
    ? (QUE_SE_PREGUNTO[pasoPendiente] || (pasoPendiente.startsWith("variable_") ? "una VARIANTE del producto" : pasoPendiente))
    : "nada en particular";

  const sys =
`Eres el lector de pedidos de un restaurante por WhatsApp. Tu trabajo es ENTENDER lo que
quiso decir el cliente, no buscar palabras exactas. La gente escribe con errores, sin
tildes, en pedazos y de mil formas distintas.

LO QUE YA ESTÁ EN EL PEDIDO: ${yaHay}
LO QUE SE LE ACABA DE PREGUNTAR: ${preguntado}

OPCIONES REALES de este producto (usa EXACTAMENTE estos nombres, no inventes):
- tamaños: ${pres.length ? pres.join(" | ") : "(no tiene)"}
- variantes: ${vars.length ? vars.map(v => `${v.grupo}: ${v.opciones.join(" / ")}`).join(" ; ") : "(no tiene)"}
- adiciones: ${adis.size ? [...adis].join(" | ") : "(no tiene)"}
- formas de pago: ${metodos.join(" | ")}

Devuelve SOLO este JSON con lo que ESTE mensaje aporta (omite lo que no diga):
{"producto":string|null,"cantidad":number|null,"tamano":string|null,
 "variantes":[string],"adiciones":[string],"direccion":string|null,
 "barrio":string|null,"nombre":string|null,"pago":string|null,"quitar":[string],
 "adicion_otro_tamano":{"nombre":string,"tamano":string}|null,
 "nota":string|null}

REGLAS:
- "1.5", "litro y medio", "la de litro y medio" -> el tamaño "1.5 Litros" si esa es
  una de las opciones. Contestar con un pedazo TAMBIÉN es contestar.
- Si no estás seguro de cuál opción es, deja null. Es mejor volver a preguntar que
  adivinar mal.
- Un saludo o una cortesía sueltos ("porfa", "gracias", "listo", "ok") NO son un
  nombre ni nada: devuelve todo null.
- "nombre" SOLO si de verdad está diciendo a nombre de quién va el pedido.
- "direccion" es calle/carrera con números. Un barrio SOLO ("Bellavista") va en
  "barrio", NO en "direccion".
- Si el mensaje trae dirección Y barrio juntos, sepáralos en sus dos campos.
- "adiciones": lo que quiere que le PONGAN al plato. Un plato aparte va en "producto".
  SOLO es adición si el cliente la nombró como palabra propia. JAMÁS saques una
  adición de un pedazo del nombre de un plato: de "salchipapa" NO sale la adición
  "papas" ni "salchicha" — "salchipapa mixta" es UN plato y CERO adiciones.
  Tampoco saques adiciones de una INSTRUCCIÓN de preparación: en "las papas bien
  doraditas" o "la salsa aparte", "papas" y "salsa" son parte de la nota, NO
  adiciones. Adición es solo lo que el cliente pide AGREGAR y pagar.
- "quitar": lo que quiere SACAR de lo que YA tiene, con el nombre exacto de arriba.
  "mejor sin la adición", "quítame el chorizo", "ya no quiero la tocineta", "sin la
  gaseosa", "mejor el solo" -> quitar. Si dice "sin X" pero X NO está todavía en el
  pedido, no es quitar: es una instrucción de cómo lo quiere, y va en "nota".
  Si dice "sin la adición" y solo lleva una, pon ESA en "quitar".
- "adicion_otro_tamano": si el cliente pide una adición diciendo un TAMAÑO
  DISTINTO al del plato. Ej: el plato es FAMILIAR y pide "la adición de
  ranchera PERSONAL" -> {"nombre":"Ranchera","tamano":"Personal"}. Eso NO va
  en "adiciones": se cobra aparte porque dentro de un plato familiar solo
  caben adiciones familiares. Si el tamaño que dice es el MISMO del plato, o
  no dice ninguno, va en "adiciones" como siempre y esto queda null.
- "nota": instrucciones REALES de preparación o entrega, dichas con CUALQUIER
  palabra: "sin salsas", "las salsas aparte porque hay niños" -> "salsas aparte",
  "las papas bien doraditas" -> "papas bien doradas", "que no pique nada",
  "córtala en dos". Escríbela CORTA, lista para la comanda de cocina.
  NO es nota: cerrar el pedido ("no solo eso", "eso es todo", "así está bien",
  "nada más"), cortesías, confirmaciones ni preguntas -> null. Tampoco es nota
  lo que ya va en otro campo (una adición, un tamaño, una forma de pago).
- "pago": Nequi, Daviplata, "por llave", el QR, "te consigno", "te transfiero" son TODOS
  el método de TRANSFERENCIA. El saldo prepagado y los puntos SOLO si el cliente los
  nombra ("con mi saldo", "con los puntos"). Devuelve el nombre del método SIN el
  paréntesis explicativo.
- Usa los nombres EXACTOS de las listas de arriba. Si algo no está en las listas,
  déjalo fuera.

Últimos mensajes:
${historial}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", max_tokens: 260, temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: texto }],
      }),
    });
    if (!r.ok) { console.error("[lector] OpenAI", r.status); return {}; }
    const d = await r.json() as Record<string, unknown>;
    const raw = ((d.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, string> | undefined)?.content;
    const leido = JSON.parse(raw || "{}") as PedidoLeido;
    console.log("[lector]", JSON.stringify(leido));
    return leido;
  } catch (e) {
    console.error("[lector] fallo, se usan los comparadores:", e);
    return {};
  }
}

/* QUITAR ALGO DEL PEDIDO YA ARMADO.

   "mejor el sin la adición entonces porfa" — despues del resumen, esa frase
   no tenia a donde ir: los extractores solo saben AGREGAR, asi que la
   guardaban como una preferencia del plato ("↳ sin la adición entonces") y la
   iban acumulando en cada intento.

   Se quita de las adiciones de cualquiera de los platos, y tambien un plato
   entero si el cliente lo nombra. Si lo que pide sacar es el producto EN
   CURSO, se avisa con `quitarActual` para que quien llama decida: si hay otro
   plato en el pedido lo asciende, y si era el unico no se saca nada — un
   pedido vacio no es un pedido. */
function quitarDelPedido(
  state: PacoState, nombres: string[],
): { quitados: string[]; quitarActual: string | null } {
  const quitados: string[] = [];
  let quitarActual: string | null = null;
  const trozos = (s: string | null | undefined) =>
    String(s || "").split(",").map(x => x.trim()).filter(Boolean);

  for (const bruto of nombres) {
    const n = normalizarTexto(String(bruto || ""));
    if (!n) continue;
    let seFue = false;

    /* 1. De las adiciones del producto en curso. */
    const suyas = trozos(state.adiciones);
    const quedan = suyas.filter(a => normalizarTexto(a) !== n);
    if (quedan.length !== suyas.length) {
      state.adiciones = quedan.join(", ");   // "" y no null: ya se pregunto
      seFue = true;
    }

    /* 2. De las adiciones de los platos ya cerrados. */
    for (const it of state.items || []) {
      const sus = trozos(it.adiciones);
      const q = sus.filter(a => normalizarTexto(a) !== n);
      if (q.length !== sus.length) { it.adiciones = q.join(", "); seFue = true; }
    }

    /* 3. Un plato entero de los ya cerrados. */
    const antes = (state.items || []).length;
    state.items = (state.items || []).filter(it => normalizarTexto(it.producto || "") !== n);
    if (state.items.length !== antes) seFue = true;

    /* 4. ¿Es el plato en curso? Se avisa; no se toca aqui. */
    if (!seFue && state.producto && normalizarTexto(state.producto) === n) {
      quitarActual = state.producto;
    }

    if (seFue) quitados.push(String(bruto));
  }
  return { quitados, quitarActual };
}

/* Lo que el lector entendio, pasado por el filtro del catalogo. Devuelve solo
   los valores que de verdad existen — el modelo aporta el entendimiento, la
   carta pone el limite. */
/* PALABRAS CON LAS QUE LA GENTE CORRIGE. Las usan dos sitios —el sabor y el
   barrio— y una sola lista evita que se separen con el tiempo. */
const PIDE_CAMBIO_RE_GLOBAL = /\b(?:cambia(?:me|la|lo|r|selo)?|c[\u00e1]mbia(?:la|lo|me)?|mejor|en\s+vez\s+de|en\s+lugar\s+de|prefiero|que\s+sea|h[\u00e1a]z(?:la|lo)|p[\u00f3o]n(?:la|lo|gale|me)|no,?\s+(?:mejor|que)|corrige|corr[\u00ed]geme|equivoqu[\u00e9e])\b/i;

function validarLeido(
  leido: PedidoLeido,
  state: PacoState,
  productData: ProductData | null,
  pagosCfg: Record<string, unknown> | null | undefined,
  cfgGlobal: Record<string, unknown>,
  /* Lo que escribió el cliente, tal cual. NO para entender —de eso se encarga
     el lector— sino para desempatar cuando el mismo nombre puede ser el plato
     y la adición a la vez. */
  texto = "",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!leido) return out;

  /* TAMAÑO: tiene que ser una presentacion real del producto. */
  if (leido.tamano && productData?.presentations?.length) {
    const ok = extractPresentacion(String(leido.tamano), productData.presentations);
    /* Igual que las variantes: un tamano que no dejo rastro en el texto es
       invento del lector, y el tamano tambien decide el precio. */
    const toksTam = normalizarTexto(texto).split(/\s+/).filter(Boolean);
    const tamConRastro = (nombre: string): boolean =>
      normalizarTexto(nombre).split(/\s+/).filter(w => w.length >= 3)
        .some(w => toksTam.some(t =>
          t === w || t.startsWith(w) || w.startsWith(t) || (t.length > w.length && t.endsWith(w))));
    if (ok && (tamConRastro(String(leido.tamano)) || tamConRastro(ok))) out.tamano = ok;
    else if (ok) console.log("[lector] tamano sin rastro descartado: " + ok);
  }

  /* VARIANTES: cada una tiene que ser opcion de alguno de sus grupos. */
  if (Array.isArray(leido.variantes) && leido.variantes.length && productData?.variables?.length) {
    /* COMPUERTA DE EVIDENCIA (hermana del volcado de adiciones): el lector a
       veces se inventa la variante que el cliente nunca dijo — "salchipapa
       premium personal" volvia "Premium MIXTA" y la variante decide el PRECIO.
       Una variante solo entra si dejo rastro en el texto: o la palabra que el
       lector dice que uso el cliente, o el nombre de la opcion resuelta. Se
       tolera el pedazo (empieza-por / termina-en) para typos y plurales. */
    const toksVar = normalizarTexto(texto).split(/\s+/).filter(Boolean);
    const dejoRastro = (nombre: string): boolean =>
      normalizarTexto(nombre).split(/\s+/).filter(w => w.length >= 3)
        .some(w => toksVar.some(t =>
          t === w || t.startsWith(w) || w.startsWith(t) || (t.length > w.length && t.endsWith(w))));
    /* EL SABOR SE PUEDE CAMBIAR (19-ago). El tamaNo si se dejaba cambiar y el
       sabor no: a "una premium mixta personal ... CAMBIALA A CARNE MEJOR" el
       resumen seguia diciendo Mixta y le cobraba $5.000 de mas por un plato
       que ya no queria. El grupo resuelto se saltaba y punto.

       No se abre del todo, porque abrirlo rompe el caso contrario: en "una
       premium mixta y una ADICION DE CARNE", carne dejaria rastro y se comeria
       el sabor elegido. Solo se reemplaza cuando el mensaje DICE que es un
       cambio — cambiala, mejor, en vez de, prefiero, que sea. Sin esas
       palabras, un grupo ya resuelto se sigue respetando. */
    const pidioCambio = PIDE_CAMBIO_RE_GLOBAL.test(texto);
    const yaTipos: Record<string, string> = { ...(state.tipos || {}) };
    let cambio = false;
    for (const v of leido.variantes) {
      for (const g of productData.variables) {
        if (yaTipos[g.id] && !pidioCambio) continue;
        const ok = extractVariable(String(v), g.options || []);
        if (ok) {
          if (!dejoRastro(String(v)) && !dejoRastro(ok)) {
            console.log("[lector] variante sin rastro descartada: " + ok);
            continue;
          }
          if (yaTipos[g.id] && yaTipos[g.id] !== ok) {
            console.log("[lector] sabor cambiado: " + yaTipos[g.id] + " -> " + ok);
          }
          yaTipos[g.id] = ok; cambio = true; break;
        }
      }
    }
    if (cambio) {
      out.tipos = yaTipos;
      out.tipo = productData.variables.map(g => yaTipos[g.id]).filter(Boolean).join(", ");
    }
  }

  /* ADICIONES: tienen que existir en los grupos de modificadores. */
  if (Array.isArray(leido.adiciones) && leido.adiciones.length && state.adiciones === null) {
    const reales: string[] = [];
    for (const a of leido.adiciones) {
      const real = resolverAdicionCatalogo(String(a));
      if (real && !reales.includes(real)) reales.push(real);
    }
    /* Un plato no es adicion de si mismo — SALVO que el cliente lo diga dos
       veces: "una familiar ranchera CON ADICION DE RANCHERA".

       En El Parche la Ranchera es un plato Y ademas un modificador de verdad
       (vale $14.000 en personal y $28.000 en familiar), asi que ese pedido
       existe. El lector lo entendia perfecto —devolvia producto RANCHERA y
       adiciones ["Ranchera"], separados— y este filtro lo borraba despues.

       Lo que decide es cuantas veces lo NOMBRO el cliente: una vez es el
       plato; dos, la segunda es la adicion. El texto solo desempata — quien
       entiende sigue siendo el lector, y el verificador comprueba despues que
       ese modificador de verdad exista para ese plato. */
    const vecesQueLoDijo = (nombre: string): number => {
      const n = normalizarTexto(nombre);
      if (!n) return 0;
      const escapado = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return (normalizarTexto(texto).match(new RegExp("\\b" + escapado, "g")) || []).length;
    };
    const suyo = normalizarTexto(state.producto || "");
    /* PAPAS FANTASMA (pedido real, 15-ago): el lector a veces descompone una
       palabra compuesta e inventa una adicion — de "salchipapa mixta" saco la
       adicion "Papas" y un cliente real pago $8.000 de mas. Compuerta
       determinista: si ninguna palabra de la adicion aparece SUELTA en el texto
       pero SI aparece pegada al final de una palabra mas larga ("salchipapa"
       termina en "papa"), la adicion nacio de ese pedazo y se bota. Si no hay
       rastro de ninguna de las dos formas se respeta al lector, que pudo
       traducir un sinonimo ("papitas" -> "Papas"). */
    const nacioDeCompuesta = (nombre: string): boolean => {
      const toks = normalizarTexto(texto).split(/\s+/).filter(Boolean);
      const palabras = normalizarTexto(nombre).split(/\s+/).filter(w => w.length >= 3);
      if (!palabras.length) return false;
      let pegada = false;
      for (const w of palabras) {
        const formas = [w, w.replace(/es$/, ""), w.replace(/s$/, "")].filter(f => f.length >= 3);
        for (const t of toks) {
          if (formas.includes(t) || formas.includes(t.replace(/es$/, "")) || formas.includes(t.replace(/s$/, ""))) return false; // la dijo suelta
          if (formas.some(f => t.length > f.length && t.endsWith(f))) pegada = true;
        }
      }
      return pegada;
    };
    /* EL VOLCADO DEL LECTOR (18-ago, hallado en las pruebas de la cola): ante
       un mensaje sin contenido ("Camila") el lector a veces devolvia LA LISTA
       ENTERA de adiciones que se le mostro como opciones — y como todas
       existen, pasaban la validacion y el pedido salia con diez adiciones que
       nadie pidio (paso 1 de cada 3 corridas). Nadie pide 3+ adiciones sin
       nombrar NINGUNA: con tres o mas, solo entran las que dejaron rastro en
       el texto. Con 1-2 se conserva la tolerancia de sinonimos
       ("papitas" -> Papas). Sin regex a proposito. */
    const toksTexto = normalizarTexto(texto).split(" ").filter(Boolean);
    /* Rastro = el cliente escribio algo parecido. Se admite el pedazo
       (empieza-por / termina-en) y hasta dos letras de diferencia en palabras
       largas, que es lo que hace falta para los sinonimos y los errores de
       dedo ("papitas" -> Papas, "tocinta" -> Tocineta). */
    const conRastro = (nombre: string): boolean =>
      normalizarTexto(nombre).split(" ").filter(w => w.length >= 3)
        .some(w => toksTexto.some(t =>
          t === w || t.startsWith(w) || w.startsWith(t) || (t.length > w.length && t.endsWith(w))
          || (w.length >= 5 && t.length >= 5 && levenshtein(t, w) <= 2)));

    /* LA VARIANTE NO SE COBRA DOS VECES (pedido real 17-ago de Monica R., y
       otra vez en las pruebas del 18: "mixta personal" salio con adiciones
       Carne y Pollo, $19.000 de mas). El lector EXPLICA lo que significa la
       variante —una mixta es carne y pollo— y esa explicacion entraba como
       adiciones cobradas. Si el nombre es una opcion de variante del producto y
       el cliente NO la nombro, no es una adicion. */
    let candidatas = reales;
    const opcionesVar = new Set<string>();
    for (const g of (productData?.variables || [])) {
      for (const o of (g.options || [])) opcionesVar.add(normalizarTexto(o.name));
    }
    /* LA VARIANTE QUE EL CLIENTE SI NOMBRO TAMPOCO SE COBRA DOS VECES
       (19-ago, pedido real de Monica R. del 18: "salchi personal Maicitos
       especial POLLO" se cobro $36.000 en vez de $27.000).

       El filtro de abajo solo botaba la variante cuando el cliente NO la habia
       nombrado — el caso de la mixta, donde el lector explica que una mixta es
       carne y pollo. Pero aqui el cliente SI escribio "pollo": una sola vez, y
       era el sabor. Se cobro como sabor Y como adicion.

       La regla que ya existe para el plato ("un plato no es adicion de si
       mismo salvo que lo diga dos veces") vale igual para el sabor: si esa
       palabra ya quedo elegida como variante de ESTE pedido, nombrarla una vez
       fue para elegirla. Solo si la dijo dos veces —"mixta con adicion de
       pollo"— la segunda es de verdad una adicion.

       Se mira la variante ELEGIDA, no la lista de opciones: "una mixta con
       adicion de pollo" tiene a Pollo como opcion del grupo pero la elegida es
       Mixta, asi que esa adicion es legitima y entra. */
    const variantesElegidas = new Set(
      Object.values(((out.tipos as Record<string, string>) || state.tipos || {}))
        .map(v2 => normalizarTexto(String(v2))).filter(Boolean));
    if (opcionesVar.size || variantesElegidas.size) {
      const sinVariantes = candidatas.filter(r => {
        const rn = normalizarTexto(r);
        // Ya es el sabor elegido: nombrarlo una vez fue para elegirlo.
        if (variantesElegidas.has(rn) && vecesQueLoDijo(r) < 2) return false;
        // Es una opcion del grupo que el cliente nunca escribio: es la
        // explicacion del lector, no un pedido.
        if (opcionesVar.has(rn) && !conRastro(r)) return false;
        return true;
      });
      if (sinVariantes.length !== candidatas.length) {
        console.log("[lector] adiciones que eran la variante descartadas: "
          + candidatas.filter(r => !sinVariantes.includes(r)).join(", "));
      }
      candidatas = sinVariantes;
    }

    /* SIN RASTRO NO HAY ADICION (18-ago, tercera vez que aparece). El filtro
       solo miraba cuando venian 3 o mas, y el caso caro venia de a dos: un
       pedido de "salchipapa mixta personal" salio con adiciones Carne y Pollo
       —lo que SIGNIFICA una mixta, explicado por el lector— y $19.000 de mas.
       Ahora toda adicion tiene que haber dejado rastro en lo que escribio el
       cliente. Los sinonimos siguen entrando por la tolerancia de dos letras;
       lo que ya no entra es lo que nadie nombro. */
    {
      const filtradas = candidatas.filter(conRastro);
      if (filtradas.length !== candidatas.length) {
        console.log("[lector] adiciones sin rastro descartadas: "
          + candidatas.filter(x => !filtradas.includes(x)).join(", "));
      }
      candidatas = filtradas;
    }
    /* PEDIR MENOS NO ES PEDIR MAS (pedido real, 17-ago): "una mixta CON POCAS
       SALSAS" salio con una adicion "Salsa" de $2.000 — al cliente le cobraron
       por algo que estaba pidiendo que le pusieran MENOS. Si justo antes del
       nombre hay una palabra que resta ("sin", "poca", "nada de", "menos"), eso
       es una preferencia de cocina, no una adicion. */
    const limpias = candidatas.filter(r => {
      if (pideMenosDe(texto, r)) {
        console.log("[lector] adicion descartada por ser un 'menos': " + r);
        return false;
      }
      if (nacioDeCompuesta(r)) return false;
      const rn = normalizarTexto(r);
      const esElPlatoMismo = rn === suyo || suyo.includes(rn);
      return !esElPlatoMismo || vecesQueLoDijo(r) >= 2;
    });
    if (limpias.length) out.adiciones = limpias.join(", ");
  }

  /* PAGO: tiene que ser un metodo configurado. */
  if (leido.pago && !state.pago) {
    let ok = extractPago(String(leido.pago), pagosCfg);
    /* CANDADO: el lector puede equivocarse de METODO y ese error cobra de un
       saldo que el cliente no tiene. Si lo que escribio el cliente nombra una
       billetera digital, es una transferencia, diga lo que diga el lector. */
    if (ok) {
      const met = getMetodosPago(pagosCfg);
      const elegido = met.find(m => normalizarTexto(m.nombre) === normalizarTexto(ok || ""));
      const textoDigital = /\b(nequi|daviplata|bancolombia|davivienda|llave|qr|transfer\w*|consign\w*)\b/
        .test(normalizarTexto(texto));
      if (elegido && esMetodoInterno(elegido.id) && textoDigital) {
        const dig = met.find(m => m.digital);
        if (dig) {
          console.log("[lector] pago corregido: " + ok + " -> " + dig.nombre);
          ok = dig.nombre.toLowerCase();
        }
      }
    }
    if (ok) out.pago = ok;
  }

  /* BARRIO: tiene que estar entre los configurados.

     Y SE PUEDE CORREGIR (19-ago, caso real de Paula del 18). Escribio "catala
     unidad residencial apto 701" y al renglon siguiente "Catalana*" — el
     asterisco es como la gente se corrige en el chat. El barrio ya estaba
     puesto, asi que la correccion se ignoro y el domicilio se cobro por el
     barrio equivocado.
     Se reemplaza solo si el mensaje DICE que es una correccion (el asterisco
     o una palabra de cambio) y el barrio nuevo existe en las zonas: asi una
     mencion de paso no mueve un dato que ya estaba bien. */
  if (leido.barrio) {
    const dom = cfgGlobal.domicilios as Record<string, unknown> | null | undefined;
    const ok = extraerBarrio(String(leido.barrio), dom);
    const seCorrige = /[*]\s*$/.test(texto.trim()) || PIDE_CAMBIO_RE_GLOBAL.test(texto);
    if (ok && (!state.barrio || (seCorrige && normalizarTexto(ok) !== normalizarTexto(state.barrio)))) {
      if (state.barrio && state.barrio !== ok) {
        console.log("[lector] barrio corregido: " + state.barrio + " -> " + ok);
        /* El precio del domicilio cuelga del barrio: si cambia el barrio hay
           que volver a mostrarlo, no dejar el que ya se dijo. */
        out.domi_mostrado = null;
        out.total_mostrado = null;
      }
      out.barrio = ok;
    }
  }

  /* DIRECCION: tiene que traer via y numero. Un barrio suelto no es una
     direccion — es lo que fallo con "Bellavista".
     EXCEPCION (15-ago, trampa de Sergio): un CONJUNTO no tiene calle.
     "asturias casa 3b" es una direccion completa y esta puerta la botaba —
     el bot preguntaba "¿para donde va?" a quien ya habia dicho todo. Entra
     si es un conjunto conocido, o si suena a conjunto y trae su unidad. */
  if (leido.direccion && !state.direccion) {
    const d = String(leido.direccion).trim();
    const domIns = (cfgGlobal.domicilios as Record<string, unknown>) || null;
    if (analizarDireccion(d).tieneVia) out.direccion = d;
    else if (esConjunto(d, domIns) || (sueneAConjunto(d) && /\d/.test(d))) out.direccion = d;
    else {
      /* El lector a veces SEPARA: barrio="Asturias", direccion="casa 3b".
         Si el barrio es un conjunto conocido y esto es su unidad, la
         direccion completa es la union de los dos — botarla dejaba al bot
         preguntando "¿en que casa?" a quien ya la habia dicho (trampa de
         Sergio, 15-ago, y en bucle). */
      /* Y si ese barrio YA tiene precio propio como barrio, ES un barrio:
         no se le busca conjunto parecido ni se le reescribe la direccion. */
      const conjDelBarrio = (leido.barrio && lookupDomiPrice(String(leido.barrio), domIns) === null)
        ? esConjunto(String(leido.barrio), domIns) : null;
      if (conjDelBarrio && /\d/.test(d)
          && /(torre|bloque|interior|apto|apartamento|apart|casa|piso|int\b|bl\b)/i.test(d)) {
        out.direccion = `${conjDelBarrio} ${d}`;
      }
    }
  }

  /* NOMBRE: ni cortesia, ni palabra del pedido — NI UN LUGAR (caso real,
     15-ago): el cliente mando "Carrera 9# 21-N 46" y "Ciudad jardín" en el
     mismo lote, el lector puso el barrio en "nombre" y la factura salio a
     nombre de "Ciudad jardín". Si lo dicho es una zona o conjunto con precio
     de domicilio, o es el mismo barrio recien capturado, no es un nombre. */
  if (leido.nombre && !state.nombre) {
    const n = String(leido.nombre).trim();
    const domNom = (cfgGlobal.domicilios as Record<string, unknown>) || null;
    const nNorm = normalizarTexto(n);
    const esLugar = !!esConjunto(n, domNom)
      || lookupDomiPrice(n, domNom) !== null
      || (leido.barrio && normalizarTexto(String(leido.barrio)) === nNorm)
      || (out.barrio && normalizarTexto(String(out.barrio)) === nNorm)
      || (state.barrio && normalizarTexto(state.barrio) === nNorm);
    /* La MISMA compuerta de preguntas que extractNombre: este es el CUARTO
       camino que captura nombres (el lector GPT llena la casilla), y fue por
       donde "Cuanto se demora" quedo como nombre de Francisco aunque los otros
       tres ya la tenian. Cuatro caminos, una sola regla. */
    /* Y TAMPOCO UN TELEFONO. Este es el CUARTO camino que captura nombres (el
       lector con IA), y la regla hay que ponerla en todos: en el banco, a la
       pregunta del nombre el cliente contesto "Mi numero es 3155551234" y eso
       quedo como su nombre. Misma leccion que las adiciones y las notas. */
    if (n.length >= 2 && !SOLO_CORTESIA_RE.test(n) && !NO_ES_NOMBRE_RE.test(n)
        && !PREGUNTA_NO_NOMBRE_RE.test(n) && !ETIQUETA_PLANTILLA_RE.test(n)
        && !mencionaProductoCatalogo(n) && !esLugar
        && !celularValido(n)) {
      out.nombre = n;
    }
  }

  /* ══ LA ADICION QUE VA APARTE ═══════════════════════════════════════════
     Se comprueba contra el catalogo: tiene que existir un producto con ese
     nombre EN LA CATEGORIA DE ADICIONES. Buscarlo en toda la carta seria un
     error caro: "Ranchera" tambien es una SALCHIPAPA de $28.000, y se
     cobraria un plato entero en vez de una adicion de $14.000. */
  {
    const ao = leido.adicion_otro_tamano;
    const nomAo = String(ao?.nombre || "").trim();
    const tamAo = String(ao?.tamano || "").trim();
    if (nomAo && tamAo) {
      const n = normalizarTexto(nomAo);
      const enAdiciones = DYN_PROD_MAP.filter(e => /adicion/.test(normalizarTexto(e.cat)));
      /* Primero la coincidencia exacta; si no, la que lo contenga ("ranchera"
         encuentra "adicion ranchera"). */
      const hit = enAdiciones.find(e => e.key === n)
              || enAdiciones.find(e => e.key.includes(n) || n.includes(e.key));
      if (hit) {
        out.adicion_suelta = { nombre: hit.name, tamano: tamAo, cat: hit.cat };
      } else {
        console.log(`[adicion aparte] "${nomAo}" no existe como producto en Adiciones — se deja como adicion normal`);
      }
    }
  }

  /* EL NUMERO ES DEL PLATO QUE TIENE AL LADO (19-ago, hallado en las pruebas).
     "una premium mixta personal y 2 COCA COLAS personales" salia con DOS
     salchipapas: el lector devuelve UNA cantidad para todo el mensaje, y el 2
     de las gaseosas se lo quedaba el plato activo. Son $34.000 de mas en un
     pedido de $45.000.

     Antes de hacerle caso se mira que producto de la carta aparece PRIMERO
     despues del numero. Si es otro, ese 2 no es del plato activo y se ignora
     — el de la gaseosa lo lee la cola con su propio texto. */
  if (typeof leido.cantidad === "number" && leido.cantidad >= 1 && leido.cantidad <= 50) {
    let esMio = true;
    if (leido.cantidad > 1 && texto && state.producto) {
      const tn = normalizarTexto(texto);
      const mNum = tn.match(new RegExp("(?:^|[^0-9])" + String(Math.round(leido.cantidad)) + "(?![0-9])"));
      if (mNum && typeof mNum.index === "number") {
        const desde = mNum.index + mNum[0].length;
        const despues = tn.slice(desde, desde + 45);
        const mio = normalizarTexto(state.producto).split(" ")[0];
        let primero: string | null = null, mejor = 999;
        for (const e of DYN_PROD_MAP) {
          const k = String(e.key || "").split(" ")[0];
          if (k.length < 3) continue;
          const p = despues.indexOf(k);
          if (p >= 0 && p < mejor) { mejor = p; primero = k; }
        }
        if (primero && primero !== mio) {
          console.log("[lector] cantidad " + leido.cantidad + " es de \"" + primero + "\", no de \"" + mio + "\"");
          esMio = false;
        }
      }
    }
    if (esMio) out.cantidad = Math.round(leido.cantidad);
  }
  return out;
}

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
  /* ¿Este mismo mensaje abrio un producto nuevo? */
  productoNuevo = false,
  /* Que se le estaba preguntando antes de que llegara ese producto. */
  pasoAntesId: string | null = null,
  /* Lo que ENTENDIO el lector del pedido. Manda sobre los comparadores de
     texto, pero cada valor se valida contra el catalogo antes de entrar. */
  leido: PedidoLeido = {},
): Record<string, unknown> {
  /* LO ENTENDIDO VA PRIMERO. Los comparadores de texto de mas abajo solo
     llenan lo que quede vacio: son el respaldo para cuando el modelo falle o
     se demore, no la primera opcion. */
  const result: Record<string, unknown> = validarLeido(leido, state, productData, pagosCfg, cfgGlobal, text);

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
    /* LO ENTENDIDO VA PRIMERO, igual que en todos los demas campos: la nota
       la pone el lector (entiende cualquier forma de decirlo); el capturador
       de palabras solo actua si el lector no dio nada — es el respaldo para
       cuando el modelo falle o se caiga, no la primera opcion. */
    const notaLeida = String((leido as PedidoLeido).nota || "").trim().slice(0, 120);
    const pref = notaLeida || extractPreferencias(text, cfgGlobal);
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

  /* EL NUMERO, en redes. Llega de dos formas y las dos entran por aqui: el
     boton lo manda como texto, y quien lo escribe tambien. Solo se toma si
     de verdad parece un celular — si no, el paso sigue pendiente y Paco lo
     vuelve a pedir en vez de guardar un numero inventado. */
  if (!state.telefono && (state.canal === "instagram" || state.canal === "facebook")) {
    const tel = celularValido(text);
    if (tel) result.telefono = tel;
  }

  if (!state.tamano && !result.tamano && productData && productData.presentations.length > 1) {
    const p = extractPresentacion(text, productData.presentations);
    if (p) result.tamano = p;
  }
  if (productData && productData.variables.length > 0 && !result.tipo) {
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
  if (!state.pago && !result.pago) {
    /* PREGUNTAR POR UN METODO NO ES ELEGIRLO. Salio del banco de frases
       reales: "¿Que es billetera el parche food?" dejaba el pedido cobrado a
       la billetera del cliente. Si el mensaje es una pregunta y el
       clasificador no vio intencion de pago, los nombres que aparecen son
       tema de conversacion. "¿te transfiero?" sigue funcionando: ahi el
       clasificador SI ve la intencion. Es el mismo candado que el de
       preguntar un precio. */
    const soloPreguntaPago = intenciones.pregunta === true && !intenciones.pago
      && (text.includes("?") || text.includes("¿"));
    let p = soloPreguntaPago ? null : extractPago(text, pagosCfg);
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
  if (state.adiciones === null && result.adiciones === undefined) {
    const isUpsellStep = currentStepId === "upsell";
    // Si este mismo mensaje corto acaba de responder tamaño o variante, ES la
    // respuesta al paso — no una adición ("Mixta porfa" responde a la pregunta
    // de variante, no pide una adición)
    const esRespuestaVariante = !isUpsellStep && text.trim().length <= 25 &&
      (("tipo" in result) || ("tamano" in result));
    if (!esRespuestaVariante) {
      const a = extractAdiciones(text, isUpsellStep, intenciones,
        state.producto, (state.items || []).map(i => i.producto || ""));
      if (a !== null) {
        /* UNA PALABRA QUE VIVE DENTRO DE LA NOTA NO ES UNA ADICION (banco,
           21-ago): "la salsa en un vasito aparte" agregaba una Salsa cobrada,
           y "las papas bien doraditas" una porcion de Papas. Si la palabra
           esta en la nota capturada de ESTE mensaje, la nota manda. Y si el
           filtro vacia la lista, no se marca nada: dejar "" diria que el
           cliente ya respondio al ofrecimiento, y no lo hizo. */
        const notaMsg = normalizarTexto(String((leido as PedidoLeido).nota || "") || (extractPreferencias(text, cfgGlobal) || ""));
        let a2 = a;
        if (a && notaMsg) {
          const partes = a.split(", ").filter(x =>
            !normalizarTexto(x).split(" ").some(w => w.length >= 4 && notaMsg.includes(w)));
          if (partes.length < a.split(", ").length) {
            console.log(`[adicion] fuera por vivir en la nota: "${a}" -> "${partes.join(", ")}"`);
          }
          a2 = partes.join(", ");
        }
        if (a2 !== "" || a === "") result.adiciones = a2;
      }
    }
  }
  /* CONTESTAR CON UN PRODUCTO TAMBIEN ES CONTESTAR. Si a "¿quieres agregarle
     algo mas?" el cliente responde "una coca cola", eso abre un producto nuevo
     —no una adicion— y la pregunta ya quedo respondida. Sin esto se le volveria
     a preguntar lo mismo despues de haberle entendido. */
  if (state.adiciones === null && productoNuevo && pasoAntesId === "upsell") {
    result.adiciones = "";
  }

  /* La respuesta al upsell. Si acepta, el producto lo recoge el extractor de
     productos como cualquier otro; aqui solo se anota que YA se le ofrecio,
     para no volver a ofrecerle. */
  /* Y tambien vale si el mensaje trajo un producto nuevo. Cuando el cliente
     contesta "una coca cola", el producto se detecta EN ESTE MENSAJE y por eso
     currentStepId queda en null a proposito (14c) — asi que esta regla no
     entraba y el upsell se quedaba sin contestar para siempre: el paso volvia a
     tocar turno, el modelo improvisaba otra pregunta, y "efectivo" terminaba
     guardado como la respuesta al upsell. El pedido nunca se creaba.
     pasoAntesId es justo lo que se preguntó ANTES de detectar el producto. */
  if (state.upsell === null && (currentStepId === "sugerencia" || pasoAntesId === "sugerencia")) {
    const tU = text.toLowerCase().trim();
    const rechaza = tU === "no" || tU === "no." || tU === "n" || tU === "na" ||
      esRechazoDeMas(text, intenciones);
    result.upsell = rechaza ? "" : text.trim().slice(0, 80);
  }

  if (currentStepId === "confirmar_dir" && state.direccion && state.direccion_heredada) {
    const textoLow = text.toLowerCase().trim();
    const confirmaDir = esConfirmacion(text, intenciones);
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
  if ((!state.direccion || state.direccion_heredada) && !result.direccion) {
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
    /* "casa", "torre" y "apto" SOLO cuentan con numero al lado ("casa 4",
       "torre 3"). Sueltas son conversacion: "que hay ninos en la casa" era
       senal de direccion y el extractor forzado se tragaba el mensaje ENTERO
       como direccion (banco, 21-ago) — la nota de cocina se perdia y la
       conversacion quedaba dando vueltas pidiendo la direccion exacta. */
    const senalDireccion = /\b(calle|carrera|cra|cll|kra|avenida|av|diagonal|transversal|manzana|barrio|conjunto|vereda)\b/.test(tLowDir)
      || /\b(casa|torre|apto|apartamento|bloque|mz)\s*\.?\s*(n\.?o?\.?\s*)?#?\d/.test(tLowDir)
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

    /* LA UNIDAD DE UN CONJUNTO ES SU DIRECCION. "casa 12" o "torre 3 apto 502"
       no traen calle ni carrera, asi que el extractor de siempre —que busca
       una direccion de verdad— las descartaba, y el cliente del conjunto se
       quedaba dando vueltas: se le preguntaba, contestaba bien, y su respuesta
       se tiraba a la basura. Con el conjunto ya sabido, la unidad es lo unico
       que falta y es suficiente. */
    if (!result.direccion && isDirStep && !state.direccion
        && esConjunto(ubicacionPedido(state), (cfgGlobal.domicilios as Record<string, unknown> | null | undefined))) {
      const unidad = text.trim()
        .replace(/^(en\s+la\s+|en\s+el\s+|es\s+la\s+|es\s+el\s+|la\s+|el\s+|en\s+)+/i, "")
        .replace(/[.,;!?]+$/, "").trim();
      if (/\b(torre|bloque|bl|interior|int|apto|apartamento|apart|casa|piso|lote|mz|manzana)\b\s*\.?\s*[a-z0-9]/i.test(unidad)
          || /^[a-z]?\s*-?\s*\d{1,4}\s*[a-z]?$/i.test(unidad)) {
        result.direccion = unidad.slice(0, 80);
        result.direccion_heredada = false;
      }
    }
  }
  /* El barrio puede llegar en cualquier momento: en la direccion completa, o
     solo, o mucho despues. Se lee siempre. */
  if (!state.barrio) {
    const b = extraerBarrio(text, (cfgGlobal.domicilios as Record<string, unknown> | null | undefined));
    if (b) result.barrio = b;
    /* UN BARRIO QUE NO ESTÁ EN LAS ZONAS TAMBIÉN ES UN BARRIO.

       `extraerBarrio` solo reconoce los que ya están configurados, así que un
       barrio nuevo NUNCA se guardaba: el cliente contestaba "Los Naranjos" a
       la pregunta "¿en qué barrio queda?" y el dato se perdía. Y como se
       perdía, el mecanismo de "no sé cuánto cobrar allá" no podía dispararse
       jamás — por eso llevaba meses construido sin ejecutarse nunca.

       Aquí la pregunta es cerrada: se le acaba de preguntar el barrio, así que
       lo que conteste ES el barrio, esté o no en la lista. Lo mismo que con la
       confirmación del nombre. Lo que el lector entendió manda; esto solo
       recoge lo que él dejó pasar. */
    if (!result.barrio && currentStepId === "barrio") {
      const dicho = String(text || "").trim()
        .replace(/^(el\s+|en\s+el\s+|en\s+|barrio\s+|el\s+barrio\s+|es\s+|queda\s+en\s+)+/i, "")
        .replace(/[.,;!?]+$/, "")
        .trim();
      /* Ni una cortesía, ni un texto larguísimo que en realidad es otra cosa. */
      if (dicho.length >= 3 && dicho.length <= 60 && !SOLO_CORTESIA_RE.test(dicho)
          && /[a-záéíóúüñ]/i.test(dicho)) {
        result.barrio = dicho;
        console.log(`[barrio] no está en las zonas, pero es lo que contestó: "${dicho}"`);
      }
    }
  }

  if (!state.nombre && !result.nombre) {
    const isNombreStep = currentStepId === "nombre";
    if (isNombreStep && nombreWa) {
      /* AQUI LA PREGUNTA ES BINARIA: "¿el pedido va a nombre de Sergio?".
         Solo hay dos respuestas: sí, o el nombre de otra persona. Antes el
         camino por defecto era "es un nombre", y por eso "exactamente" quedo
         guardado como el nombre del cliente.
         Ahora manda si el mensaje trae O NO un nombre nuevo — ninguna lista de
         palabras iba a cubrir "exactamente", "tal cual", "ese mismo",
         "efectivamente". Lo unico que se respeta aparte es un "no" seco: ahi
         no se confirma nada y se le vuelve a preguntar. */
      const n = esConfirmacion(text, intenciones) ? null : extractNombre(text, true, productData, (cfgGlobal.domicilios as Record<string, unknown> | null) || null);
      if (n) result.nombre = n;
      else if (!/^no\b/.test(normalizarTexto(text))) result.nombre = nombreWa;
    } else {
      const n = extractNombre(text, isNombreStep, productData, (cfgGlobal.domicilios as Record<string, unknown> | null) || null);
      /* CON UN CLIENTE YA GUARDADO, EL NOMBRE SE CONFIRMA — NO SE COSECHA
         DEL TEXTO LIBRE (regla de Sergio, 21-ago).

         Monica Ramirez estaba guardada con su nombre desde un pedido
         anterior. Mando todo en un mensaje, una linea suelta se colo como
         nombre, y el flujo NUNCA llego a preguntar "¿va a nombre de Monica
         Ramirez?" porque el campo ya estaba lleno con basura.

         Si el cliente es conocido, un nombre pescado del texto libre solo
         vale cuando lo dijo EXPLICITAMENTE ("a nombre de Carlos", "me
         llamo..."): puede estar pidiendo para otra persona y eso se
         respeta. Todo lo demas se ignora, para que el flujo llegue al paso
         del nombre y confirme el guardado, que es el dato de verdad. */
      if (n && (isNombreStep || !nombreWa || NOMBRE_MARCADOR_RE.test(text))) result.nombre = n;
    }
  }
  return result;
}

// ── mergeSlots ────────────────────────────────────────────────────────────────

/* Si la "direccion" capturada arrastra el PEDIDO ("me das una premium mixta
   con adicion de ranchera... para Villas de X Torre 3"), la direccion real es
   lo que va despues del ultimo "para". Sin esto, el resumen y la comanda
   mostraban la frase entera como direccion (error 2 de Sergio, 15-ago).
   Solo se recorta si hay verbos de pedido — "carrera 9 para arriba" no se toca. */
function limpiarDireccionCapturada(d: unknown): string {
  const t = String(d ?? "").trim();
  /* LO QUE QUEDA DESPUES DE RECORTAR TIENE QUE SEGUIR SIENDO ENTENDIBLE. Con
     "una premium con adicion de pollo PARA RECOGER" el recorte dejaba la
     palabra suelta "recoger", que ya no coincide con ninguna frase de recoger
     ("para recoger" si, "recoger" solo no) — y Paco le pedia la calle a quien
     iba a pasar por el pedido. Cualquier forma de decir que recoge se guarda
     con el mismo texto canonico. */
  const esRecogerSuelto = (s: string) =>
    /^(para\s+)?(recoger|recojer|llevar|recogerlo|recogerla|recogerlos|llevarlo|llevarla)[.!]?$/i.test(s.trim());
  if (esRecogerSuelto(t)) return "Para recoger";
  if (/\b(me das|dame|quiero|quisiera|deseo|me haces|regalas|pedir|adici[oó]n)\b/i.test(t)
      && /\bpara\s+\S/i.test(t)) {
    const cola = t.replace(/^[\s\S]*\bpara\s+/i, "").trim();
    if (esRecogerSuelto(cola)) return "Para recoger";
    if (cola.length >= 4) return cola;
  }
  return t;
}

function mergeSlots(state: PacoState, updates: Record<string, unknown>): PacoState {
  const next = { ...state };
  for (const key of Object.keys(updates)) {
    (next as Record<string, unknown>)[key] =
      key === "direccion" ? limpiarDireccionCapturada(updates[key]) : updates[key];
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
    /* "redes" = Instagram y Messenger. En WhatsApp el numero ya se sabe: es
       la conversacion misma, y volver a pedirlo seria absurdo. */
    if (paso.cuando === "redes")     return state.canal === "instagram" || state.canal === "facebook";
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
      /* SI LO QUE DIJO ES UN CONJUNTO, NO SE LE PIDE UNA CALLE QUE NO TIENE.

         Regla de Sergio: "si ve que lo que acaba de decir el cliente es un
         conjunto, porque está en la lista de conjuntos que él tiene, no le va
         a exigir una dirección completa: con el nombre del conjunto nos basta,
         lo único que necesita es el número del apartamento o la casa".

         El nombre del conjunto cae en la casilla del BARRIO, no en la de
         dirección, así que la decisión que ya existe en clasificarDireccion
         nunca llegaba a ejecutarse: se le pedía "Carrera 9 # 63-25" a quien
         vive en Asturias. Aquí se pregunta la unidad, y punto. */
      const conjBarrio = !esRecoger ? esConjunto(ubicacionPedido(state), domiciliosPaso) : null;
      if (conjBarrio && !state.direccion) {
        const modoConj = paso.modo === "fija" ? "fija" : "conversacional";
        const fraseConj = paso.preg_unidad
          || `¡Listo, ${conjBarrio}! 😊 ¿En qué casa o apartamento te lo dejamos?`;
        return modoConj === "fija"
          ? { id: "direccion", campo: "direccion", modo: "fija", texto: fraseConj }
          : { id: "direccion", campo: "direccion", modo: "conversacional", texto: fraseConj,
              guia: `El cliente vive en el conjunto ${conjBarrio}. NO le pidas calle ni carrera: `
                + "con el nombre del conjunto basta. Pregúntale SOLO la casa o el apartamento." };
      }
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
    } else if (paso.campo === "telefono") {
      if (!state.telefono) return paso;
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
    /* EL TELEFONO va aqui: despues de la direccion, cuando el cliente ya
       esta enganchado. Pedir un dato personal apenas saluda espanta. Solo
       aparece en Instagram y Messenger (ver `aplica`, mas abajo). */
    { id: "telefono",      campo: "telefono",  modo: "fija", cuando: "redes",
      texto: "¿Me confirmas tu número de celular para el pedido? 📱", guia: PEDIR_TEL_GUIA },
    { id: "nombre",        campo: "nombre",    modo: "conversacional", texto: nombreConfirmar ? undefined : (nombre.texto || `¿A nombre de quién se recibe el pedido?${emo()}`), guia: nombreGuia },
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

/* EL PASO DEL TELEFONO SE INYECTA, NO SE CONFIGURA (22-ago-2026).

   El flujo de El Parche sale del canvas, y el canvas NO tiene una caja de
   telefono —ni tiene por que tenerla: es un dato que solo hace falta en
   Instagram y Messenger, y el dueNo no deberia saber eso—. Probado en el
   banco: sin inyectarlo, Paco nunca lo pedia, preguntaba el NOMBRE primero,
   y el cliente contestaba con su numero... que quedaba guardado como nombre.

   Va ANTES del nombre a proposito: el numero identifica al cliente, y con el
   en la mano Paco puede confirmar el nombre que ya tiene guardado en vez de
   preguntarlo de cero. */
function inyectarPasoTelefono(pasos: PasoDefinicion[], cfg: Record<string, unknown>): PasoDefinicion[] {
  const canal = String((cfg as Record<string, unknown>)._canal || "whatsapp");
  if (canal !== "instagram" && canal !== "facebook") return pasos;
  if (pasos.some(p => p.campo === "telefono")) return pasos;
  const paso: PasoDefinicion = {
    id: "telefono", campo: "telefono", modo: "fija", cuando: "redes",
    texto: "¿Me confirmas tu número de celular para el pedido? 📱",
    guia: PEDIR_TEL_GUIA,
  };
  /* Antes del nombre; si no hay paso de nombre, antes del pago; y si tampoco,
     al final. Nunca se pierde. */
  let i = pasos.findIndex(p => p.campo === "nombre");
  if (i < 0) i = pasos.findIndex(p => p.campo === "pago");
  if (i < 0) i = pasos.length;
  return [...pasos.slice(0, i), paso, ...pasos.slice(i)];
}

function buildAllPasos(productData: ProductData | null, cfg: Record<string, unknown>, frasesCfg: Record<string, unknown>, nombreConfirmar: string | null = null, esRecurrente = false): PasoDefinicion[] {
  // Flujo configurado desde el canvas (ia_config.flujo_pasos) — respeta orden/modo/frase de cada paso,
  // pero inyecta las opciones dinámicas del producto (tamaño/tipo vienen del catálogo, no del canvas).
  const customRaw = cfg.flujo_pasos;
  if (Array.isArray(customRaw) && customRaw.length > 0) {
    try {
      const procesados = procesarFlujoCanvas(customRaw as Array<Record<string, unknown>>, productData, nombreConfirmar, esRecurrente, frasesCfg);
      if (procesados.length > 0) return inyectarPasoTelefono(procesados, cfg);
    } catch (err) {
      console.error("procesarFlujoCanvas falló, usando flujo por defecto:", err);
    }
  }
  // Flujo por defecto (hardcoded) — usado cuando no hay flujo del canvas o si éste falla
  const productPasos = productData ? buildProductPasos(productData, frasesCfg) : [];
  return inyectarPasoTelefono([...productPasos, ...getFlowPasos(cfg, frasesCfg, nombreConfirmar, esRecurrente)], cfg);
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
      const opciones = listaNatural(productData.presentations.map(x => x.name.toLowerCase()));
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
        /* Como habla la gente: "carne o pollo", "mixta, carne o pollo". La
           lista con comas ("carne, pollo") suena a formulario. */
        const opciones = listaNatural(vg.options.map(o => o.name.toLowerCase()));
        let vTexto = (texto || `¿La deseas con {opciones}?${emo()}`).replace(/\{label\}/g, vg.name).replace(/\{opciones\}/g, opciones);
        /* Sirve en los dos sentidos: que a la frase le falte una opcion real,
           o que NOMBRE UNA QUE ESTE PRODUCTO NO TIENE. Lo segundo es lo que se
           escapaba: "¿La prefieres mixta, de carne o de pollo?" pasaba el
           filtro para la SUPER QUESO —que si tiene carne y pollo— y le ofrecia
           una "mixta" que no existe. */
        if (presentacionesMalCitadas(vTexto, vg.options.map(o => o.name))) {
          /* La de reemplazo tampoco puede usar el nombre del grupo: "¿Primer
             Ingrediente?" es un nombre de sistema y el cliente no lo entiende
             —lo dijo Sergio viendo la conversación real—. */
          vTexto = `¿La deseas con ${opciones}?${emo()}`;
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
      /* Ofrecer algo más. Es su propia caja y NO la de adiciones: aquí ofrece
         el restaurante, allá pide el cliente. El dueño escoge del catálogo lo
         que quiere ofrecer y el bot dice exactamente eso. */
      const items = Array.isArray(p.upsell_items) ? p.upsell_items as Array<Record<string, unknown>> : [];
      const nombres = items.map(x => String(x.nombre || "").trim()).filter(Boolean);
      /* Compatibilidad con lo viejo: antes era una lista de nombres sueltos. */
      const viejos = Array.isArray(p.upsell_productos) ? (p.upsell_productos as unknown[]).map(String).filter(Boolean) : [];
      const ofrecidos = nombres.length ? nombres : viejos;

      /* La lista, uno por línea. Una categoría entera va con su nombre
         ("Bebidas"), sin desplegar sus seis productos: es lo que el dueño
         escribió y es lo que se lee mejor en WhatsApp. */
      const listaLineas = ofrecidos.map(n => `• ${n}`).join("\n");
      const listaCorta  = listaNatural(ofrecidos);

      let upTexto = texto || "";
      if (upTexto) {
        upTexto = upTexto.replace(/\{lista\}/g, listaLineas).replace(/\{opciones\}/g, listaCorta);
      } else if (ofrecidos.length) {
        upTexto = `¿Deseas agregar algo a tu pedido?\n${listaLineas}`;
      }

      out.push({
        id: "sugerencia", campo: "upsell", modo,
        texto: upTexto || undefined,
        /* LO QUE EL DUEÑO ESCOGIO MANDA, ESCRIBA LO QUE ESCRIBA ARRIBA.

           Antes, si la caja tenia instrucciones propias, la lista escogida NO
           se le pasaba al modelo: solo entraba cuando NO habia instrucciones.
           Sergio escogio Ranchera, Super Queso y Bebidas —quedaron guardados—
           y el bot seguia diciendo "¿quieres agregarle algo? tenemos papas,
           gaseosa, jugos...", que es el ejemplo escrito en las instrucciones.
           Escoger del catalogo no servia de nada.

           Ahora la lista se ANEXA siempre que haya algo escogido. Si el dueño
           puso {lista} en su texto, ahi va; si no, se agrega al final. */
        guia: (() => {
          const manda = ofrecidos.length
            /* SOLO eso. Antes decía "si no elige nada, propone de la carta": el
               bot improvisaba y ofrecía cosas que el restaurante no queria
               empujar. */
            ? `Ofrece SOLO esto, tal cual, sin agregar nada de la carta: ${listaCorta}. Una sola vez. Si el cliente no quiere, sigue sin insistir.`
            : "Ofrece algo más de forma natural y breve, una sola vez. Si el cliente no quiere, sigue sin insistir.";
          /* LA FRASE DEL DUEÑO MANDA EN LOS DOS MODOS. Como lo dijo Sergio:
             "en frase fija utilizaría esa frase, y en modo conversacional se
             guiaría de esa frase y lo diría a su modo".
             Antes, en modo IA, ni la frase ni los productos escogidos llegaban
             al bot: mandaban unas instrucciones aparte, y por eso seguía
             diciendo "tenemos papas, gaseosa, jugos" —el ejemplo escrito en
             ellas— por mucho que el dueño escogiera del catálogo. */
          if (upTexto) return `Dile esto con tus palabras, sin cambiar lo que ofrece:\n"${upTexto}"\n${manda}`;
          const propia = guia
            ? guia.replace(/\{lista\}/g, listaCorta).replace(/\{opciones\}/g, listaCorta)
            : "";
          return propia ? `${propia}\n${manda}` : manda;
        })(),
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
    } else if (campo === "telefono") {
      out.push({ id: "telefono", campo: "telefono", modo: "fija", cuando: "redes",
                 texto: texto || "¿Me confirmas tu número de celular para el pedido? 📱",
                 guia: guia || PEDIR_TEL_GUIA });
    } else if (campo === "pago") {
      out.push({ id: "pago", campo: "pago", modo, texto: texto || "¿Cómo nos vas a pagar? ({{metodos_pago}}) ☺️", guia,
                 despues_resumen: p.despues_resumen === true });
    } else if (campo === "nombre") {
      /* El canvas manda en la FRASE, pero no puede mandar en preguntarle el
         nombre a alguien que ya lo dio. A Sergio, guardado como cliente desde
         hace meses, le preguntaba "¿a nombre de quién se recibe el pedido?"
         como si no lo conociera — porque la frase fija ganaba siempre.

         Con un cliente ya guardado se confirma ("¿va a nombre de Sergio?").
         La frase fija sigue mandando para todos los demás. */
      if (modo === "fija" && texto && !(esRecurrente && nombreConfirmar)) {
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
        /* CONFIRMAR NO PUEDE DEPENDER DE QUE EL MODELO OBEDEZCA. Antes, con un
           cliente conocido este paso se volvia conversacional Y SIN TEXTO: la
           pregunta quedaba enteramente en manos del modelo. El 14-ago el modelo
           se la salto y pregunto el pago; el nombre nunca se lleno, el flujo
           nunca se completo y por eso no salio el resumen. En el banco, con lo
           mismo, si la hizo — es una moneda al aire, y por eso costo verlo.
           Ahora se respeta el modo que escogio el dueño: si puso frase fija,
           sale una frase fija (la de confirmar, no la de preguntar). */
        const preguntaNombre = texto || `¿A nombre de quién se recibe el pedido?${emo()}`;
        const esFija = modo === "fija";
        out.push({
          id: "nombre", campo: "nombre",
          modo: nombreConfirmarUsable && !esFija ? "conversacional" : modo,
          texto: nombreConfirmarUsable
            ? (esFija ? `¿El pedido va a nombre de ${nombreConfirmarUsable}? 😊` : undefined)
            : preguntaNombre,
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
/* ══════════════════════════════════════════════════════════════════════
   LOS GRUPOS DE MODIFICADORES — de donde sale el precio de una adición

   El bot no los conocía. Toda adición entraba como texto y se cobraba cero.

   La misma adición cuesta distinto según el tamaño (Ranchera: $14.000
   personal, $28.000 familiar) porque vive en dos grupos, y `mod_group_pres`
   dice qué presentación usa cuál. Por eso el precio se resuelve cuando ya se
   sabe el producto Y su presentación — antes sería adivinar.
   ══════════════════════════════════════════════════════════════════════ */
type GrupoMod = { id: string; name: string; options: Array<{ id: string; name: string; price: number }> };
let MODS_CACHE: { branch: string; grupos: GrupoMod[] } | null = null;

async function cargarModificadores(branchId: string): Promise<GrupoMod[]> {
  if (MODS_CACHE && MODS_CACHE.branch === branchId) return MODS_CACHE.grupos;
  const rows = await sbGet(
    `/rest/v1/pos_modifier_groups?branch_id=eq.${branchId}&select=id,name,options`
  ) as Array<Record<string, unknown>> | null;
  const grupos = (rows || []).map(r => ({
    id: String(r.id || ""),
    name: String(r.name || ""),
    options: ((r.options as Array<Record<string, unknown>>) || []).map(o => ({
      id: String(o.id || ""), name: String(o.name || ""), price: Number(o.price) || 0,
    })),
  }));
  MODS_CACHE = { branch: branchId, grupos };
  /* El vocabulario, para que el clasificador sepa que estos nombres PUEDEN ser
     una adición. Cual de las dos cosas es lo decide el conector ("una
     ranchera" vs "con ranchera"), igual que con cualquier nombre que viva en
     los dos lados. */
  const nombres = new Set<string>();
  for (const g of grupos) for (const o of g.options) {
    const n = normalizarTexto(o.name);
    if (n.length >= 3) nombres.add(n);
  }
  DYN_MOD_NAMES = [...nombres];
  return grupos;
}

/* Los grupos que aplican a ESTE producto en ESTA presentación. Si el producto
   no dice qué presentación usa qué grupo, el grupo aplica a todas. */
function gruposDelProducto(
  prod: Record<string, unknown>,
  presId: string | null,
  grupos: GrupoMod[],
): GrupoMod[] {
  const ids = (prod.mod_group_ids as string[]) || [];
  if (!ids.length) return [];
  const porPres = (prod.mod_group_pres as Record<string, string[]>) || {};
  return grupos.filter(g => {
    if (!ids.includes(g.id)) return false;
    const lista = porPres[g.id];
    if (!Array.isArray(lista) || lista.length === 0) return true;
    return !presId || lista.includes(presId);
  });
}

/* El texto de adiciones que se le entendió al cliente ("Ranchera, Tocineta"),
   resuelto contra los grupos que le aplican a su plato. Lo que no se encuentre
   se devuelve con precio 0 y marcado, para que se vea que no se pudo cobrar en
   vez de desaparecer sin dejar rastro. */
function resolverAdiciones(
  texto: string | null | undefined,
  prod: Record<string, unknown> | undefined,
  presId: string | null,
  grupos: GrupoMod[],
): Array<{ nombre: string; precio: number; grupo: string; op: string; sinPrecio: boolean }> {
  if (!texto || !texto.trim() || !prod) return [];
  const aplican = gruposDelProducto(prod, presId, grupos);
  const out: Array<{ nombre: string; precio: number; grupo: string; op: string; sinPrecio: boolean }> = [];
  for (const trozo of texto.split(",").map(x => x.trim()).filter(Boolean)) {
    const n = normalizarTexto(trozo);
    let hallado: { g: GrupoMod; o: { id: string; name: string; price: number } } | null = null;
    for (const g of aplican) {
      const o = g.options.find(x => normalizarTexto(x.name) === n);
      if (o) { hallado = { g, o }; break; }
    }
    if (hallado) {
      out.push({ nombre: hallado.o.name, precio: hallado.o.price, grupo: hallado.g.id, op: hallado.o.id, sinPrecio: false });
    } else {
      out.push({ nombre: trozo, precio: 0, grupo: "", op: "", sinPrecio: true });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   EL VERIFICADOR — el pedido no puede llevar lo que la carta no permite.

   Regla de Sergio, con sus palabras: "si yo en la tablet voy a añadirle una
   tocineta a una Coca Cola es imposible, porque dentro de la pantalla de Coca
   Cola no estan los modificadores para agregarla. Asi mismo deberia pasar
   internamente con el bot."

   La validacion ya existia, pero corria AL FINAL y EN SILENCIO: el resumen le
   mostraba al cliente "1x COCA COLA 1.5 Litros + Tocineta" mientras el pedido
   se creaba sin la tocineta y sin cobrarla. El texto y la comanda decian cosas
   distintas y nadie se enteraba — ni el cliente, ni la cocina, ni la caja.

   Ahora corre ANTES del resumen y otra vez ANTES de crear el pedido, contra la
   misma estructura que usa la toma de pedidos manual: los grupos de
   modificadores de ESE producto en ESA presentacion.

   Lo que no cabe no se borra a escondidas:
     · se le pasa al plato del mismo pedido que SI lo admite (la tocineta era
       de la salchipapa, no de la gaseosa),
     · y si ningun plato lo admite, se devuelve para decirselo al cliente.
   ══════════════════════════════════════════════════════════════════════ */
type LineaPedido = {
  producto: string | null;
  tamano: string | null;
  categoria: string | null;
  adiciones: string | null;
};

function verificarAdiciones(
  lineas: LineaPedido[],
  products: Array<Record<string, unknown>> | null,
  grupos: GrupoMod[],
): { adiciones: Array<string | null>; movidas: Array<{ adicion: string; a: string }>; imposibles: string[] } {
  const salida: Array<string | null> = lineas.map(l => l.adiciones);
  const movidas: Array<{ adicion: string; a: string }> = [];
  const imposibles: string[] = [];
  if (!products || !lineas.length) return { adiciones: salida, movidas, imposibles };

  const admite = (l: LineaPedido, adicion: string): boolean => {
    if (!l.producto) return false;
    const prod = matchCatalogo(products, l.producto, l.categoria);
    if (!prod) return false;
    const presId = l.tamano
      ? String((((prod.presentations as Array<Record<string, unknown>>) || [])
          .find(p => normalizarTexto(String(p.name || "")) === normalizarTexto(l.tamano || "")) || {}).id || "")
      : null;
    const n = normalizarTexto(adicion);
    return gruposDelProducto(prod, presId, grupos)
      .some(g => (g.options || []).some(o => normalizarTexto(o.name) === n));
  };

  const trozos = (s: string | null) => String(s || "").split(",").map(x => x.trim()).filter(Boolean);

  /* LA PALABRA DE CATEGORIA DE UNA BEBIDA NO ES UNA ADICION (18-ago).
     "un JUGO hit de litro": el HIT entra como producto y la palabra "jugo"
     sobraba, caia aqui como adicion, no la admitia nadie y el resumen salia
     con "⚠️ Sobre jugo: ... no esta incluido en el total" — confundiendo,
     porque el HIT SI estaba cobrado. Son palabras de categoria, no
     ingredientes: se descartan en silencio. */
  const PALABRA_CATEGORIA = new Set(["jugo", "jugos", "gaseosa", "gaseosas", "bebida", "bebidas", "refresco", "soda", "botella"]);

  for (let i = 0; i < lineas.length; i++) {
    const pedidas = trozos(lineas[i].adiciones).filter(a => !PALABRA_CATEGORIA.has(normalizarTexto(a)));
    if (!pedidas.length) continue;
    const suyas: string[] = [];
    for (const a of pedidas) {
      if (admite(lineas[i], a)) { suyas.push(a); continue; }
      const j = lineas.findIndex((o, k) => k !== i && admite(o, a));
      if (j >= 0) {
        const ya = trozos(salida[j]);
        if (!ya.some(x => normalizarTexto(x) === normalizarTexto(a))) ya.push(a);
        salida[j] = ya.join(", ");
        lineas[j].adiciones = salida[j];
        movidas.push({ adicion: a, a: lineas[j].producto || "" });
      } else {
        imposibles.push(a);
      }
    }
    /* "" y no null: la pregunta de adiciones YA se contesto. Con null se le
       volveria a preguntar por algo que el cliente ya dijo. */
    salida[i] = suyas.join(", ");
    lineas[i].adiciones = salida[i];
  }
  return { adiciones: salida, movidas, imposibles };
}

/* ══════════════════════════════════════════════════════════════════════
   EL EMPAQUE

   Misma configuracion y mismas reglas que la pantalla de ventas
   (branches.operacion_config). No se copia el calculo "parecido": se copia
   igual, porque un empaque que el chat cobra distinto al mostrador es un
   descuadre de caja que nadie sabe de donde salio.

   Dos modos:
     - unificado: un monto (o un %) para todo el pedido, o por unidad
     - especifico: un monto por producto/presentacion/categoria, con exentas
   ══════════════════════════════════════════════════════════════════════ */
type ItemEmpaque = {
  cantidad: number;
  precio: number;
  producto_id?: string | null;
  categoria_id?: string | null;
  presentacion_id?: string | null;
};

function calcularEmpaque(
  cfg: Record<string, unknown> | null | undefined,
  items: ItemEmpaque[],
  esDomicilio: boolean,
): number {
  if (!cfg || cfg.empaquesActivo !== true) return 0;
  let prod = 0, units = 0;
  for (const it of items) {
    const q = Number(it.cantidad) || 0;
    units += q;
    prod  += (Number(it.precio) || 0);
  }
  if (prod <= 0) return 0;

  const num = (v: unknown) => Number(v) || 0;

  if (cfg.empaqueModo === "especifico") {
    const packs   = (cfg.empaquePacks as Array<Record<string, unknown>>) || [];
    const general = num(cfg.empaqueMonto);
    const packMonto = (id: string) => {
      const p = packs.find(x => String(x.id) === id);
      return p ? num(p.monto) : 0;
    };
    const catCfg  = (cfg.empaqueCatCfg  as Record<string, { on?: boolean; packId?: string }>) || {};
    const prodCfg = (cfg.empaqueProdCfg as Record<string, string>) || {};
    const presCfg = (cfg.empaquePresCfg as Record<string, string>) || {};
    let total = 0;
    for (const it of items) {
      let fee = general;
      /* Categoria: puede estar exenta o tener su propio pack. */
      const cc = it.categoria_id ? catCfg[it.categoria_id] : undefined;
      if (cc) {
        if (cc.on === false) fee = 0;
        else if (cc.packId) fee = packMonto(cc.packId);
      }
      /* Producto: pisa a la categoria. */
      const pc = it.producto_id ? prodCfg[it.producto_id] : undefined;
      if (pc !== undefined && pc !== null && pc !== "") {
        fee = pc === "none" ? 0 : pc === "general" ? general : packMonto(pc);
      }
      /* Presentacion: pisa a las dos. Una familiar puede llevar caja grande
         y la personal no llevar nada. */
      const sc = (it.producto_id && it.presentacion_id)
        ? presCfg[String(it.producto_id) + "::" + String(it.presentacion_id)] : undefined;
      if (sc !== undefined && sc !== null && sc !== "") {
        fee = sc === "none" ? 0 : sc === "general" ? general : packMonto(sc);
      }
      total += fee * (Number(it.cantidad) || 0);
    }
    return total;
  }

  /* Unificado. El canal "distinto" permite cobrar otro empaque a domicilio. */
  const usaDomi = cfg.empaqueCanal === "distinto" && esDomicilio;
  const esPct   = cfg.empaqueTipo === "porcentaje";
  const rate    = esPct
    ? (usaDomi ? num(cfg.empaquePctDomicilio)   : num(cfg.empaquePct))
    : (usaDomi ? num(cfg.empaqueMontoDomicilio) : num(cfg.empaqueMonto));
  if (cfg.empaqueBase === "pedido") return esPct ? Math.round(prod * rate / 100) : rate;
  return esPct ? Math.round(prod * rate / 100) : rate * units;
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
    /* EL NOMBRE DEL CATALOGO MANDA (20-ago-2026, regla de Sergio). El cliente
       dijo "agua personal", Paco identifico bien el AGUA BOTELLA... y al
       contestar la llamo "Agua Personal" — un producto que no existe.
       Entender flexible, nombrar exacto: al hablar del pedido se usan los
       nombres tal como estan aqui, nunca como los dijo el cliente. */
    stateLines.push("⚠️ Al mencionar productos del pedido usa EXACTAMENTE los nombres de esta lista (son los del catálogo). JAMÁS los renombres con las palabras del cliente ni inventes variantes: si aquí dice AGUA BOTELLA, se llama agua botella, aunque el cliente haya dicho otra cosa.");
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
    /* UN CONJUNTO NO TIENE CALLE. Las ramas deterministas ya lo sabian, pero
       esta linea del prompt no: marcaba INCOMPLETA toda direccion sin via y
       el modelo pedia "calle o carrera" a quien vive en Villa Ernesto Torre 3
       (trampa de Sergio, 15-ago). Con conjunto reconocido: si trae numeros
       (torre/casa/apto) esta COMPLETA; si no, falta la unidad — nunca la
       calle. */
    /* PARA LLEVAR EN EL PROMPT (caso real de JP, 15-ago): el cliente dijo
       "Para llevar / Yo la recojo" y eso queda guardado como su "dirección".
       Las ramas deterministas lo entienden (LLEVAR_REGEX por todas partes),
       pero esta linea no: como no tiene via ni es conjunto, marcaba
       "Dirección INCOMPLETA — FALTA la calle" y el modelo, obediente, le
       pidio la direccion a quien venia a recoger al local. */
    if (LLEVAR_REGEX.test(state.direccion.toLowerCase())) {
      stateLines.push("✅ PARA LLEVAR: el cliente recoge su pedido en el local. NO hay domicilio. JAMÁS pidas dirección, calle, carrera ni barrio.");
    } else {
    const conjDir5 = esConjunto(ubicacionPedido(state), (cfg?.domicilios as Record<string, unknown>) || null);
    const dirCompleta = analizarDireccion(state.direccion).tieneVia
      || (!!conjDir5 && /\d/.test(state.direccion));
    stateLines.push(dirCompleta
      ? `✅ Dirección: ${state.direccion}${state.direccion_heredada ? " (heredada, pendiente confirmar)" : ""}`
      : conjDir5
        ? `⏳ Dirección: es el conjunto ${conjDir5} pero FALTA la casa o el apartamento. Pídelo ABIERTO ("¿en qué casa o apartamento te lo dejamos?"). NUNCA pidas calle o carrera: un conjunto no tiene.`
        : `⏳ Dirección INCOMPLETA — solo tenemos "${state.direccion}": FALTA la calle o carrera con su número. Si el cliente te la da ahora, agradécela y NUNCA digas que ya te la había dado.`);
    }
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
  } else if (state.resumen_enviado && !(nextStep && nextStep.despues_resumen)) {
    /* OJO CON EL ORDEN. Una caja marcada "después del resumen" —el pago, en el
       canvas de El Parche— llega justo cuando resumen_enviado ya es true. Como
       esta rama iba primero, el paso pendiente se ignoraba y al modelo solo se
       le decía "responde naturalmente": se inventó "¿me envías el comprobante
       de pago?" sin haberle preguntado nunca al cliente CÓMO iba a pagar.
       La caja existía, estaba bien configurada, y su pregunta no salía. */
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
    /* MISIÓN (FASE C2, 15-ago). Antes Paco no tenia mision: tenia un paso
       activo. Un mesero sabe para que esta, y por eso sabe que hacer cuando
       pasa algo que el guion no previo. */
    "TU MISIÓN: que el cliente pida fácil y quede contento. Entiende SIEMPRE qué está pasando en la conversación — si pregunta, respóndele; si duda, ayúdalo; si algo no lo puedes resolver, ofrécele hablar con una persona del local. El flujo del pedido continúa DESPUÉS de atender lo que la persona dijo, nunca por encima.",
    /* Categoría configurada en texto (6-pre): el modelo redacta la lista —
       con presentaciones, el formato que Sergio prefirió — y la carta ya
       quedó callada. La instrucción cubre también la pregunta por un
       producto concreto (sabores/tamaños), que es de la misma familia. */
    (cfg as Record<string, unknown>)._catTexto
      ? `EL CLIENTE PREGUNTA POR ${String((cfg as Record<string, unknown>)._catTexto).toUpperCase()}. Esta es la lista COMPLETA y OFICIAL de esa categoría — tu única fuente para esto:\n${String((cfg as Record<string, unknown>)._catFicha || "")}\nSi pregunta qué hay: preséntala TODA en viñetas, sin omitir NINGÚN producto, con sus presentaciones. Si pregunta por UN producto (sus sabores o tamaños): responde SOLO ese producto con lo que dice su línea. TODO lo de esta lista SÍ lo manejamos — JAMÁS digas que no; ignora cualquier respuesta frecuente que diga lo contrario. SIN precios salvo que los pida. Termina preguntando cuál se le antoja.`
      : "",
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
    /* Caso real (Kevin, 17-ago): el modelo contesto "en un momento te envio el
       resumen de tu pedido" y ese resumen NUNCA salio — el resumen lo manda el
       SISTEMA cuando el flujo llega alla, no el modelo. El cliente quedo
       esperando y Sergio tuvo que entrar a mano. Prometer una accion que uno
       no ejecuta es mentirle al cliente. */
    "- Si el pago es en EFECTIVO, JAMAS pidas comprobante de pago ni hables de comprobantes: el comprobante existe solo para transferencias. Pedirselo a quien paga en efectivo lo confunde (paso el 18-ago: 'pago con un billete de 100' y se le pidio comprobante).",
    "- JAMAS prometas acciones: no digas 'en un momento te envio el resumen', 'ya te mando el total', 'enseguida creo tu pedido' ni nada parecido. El resumen y el pedido los manda el sistema solo. Tu unico trabajo en cada turno es responder la duda del cliente y/o hacer LA pregunta del paso.",
    "- Cuando el cliente te dé un dato, confírmalo en máximo 2-3 palabras y pasa al siguiente paso. Usa '¡Perfecto! 🙌', 'Listo 👍', 'Claro ✅', 'Dale 🙌' — NUNCA uses 'Anotado'.",
    "- HAZ UNA SOLA PREGUNTA POR MENSAJE. Aunque falten varios datos, pregunta solo el siguiente en el flujo.",
    "- Responde brevemente al cliente solo si es necesario (pregunta, confusión). De lo contrario ve directo al siguiente paso.",
    "- Si el cliente expresa frustración ('ya te lo dije', etc.), discúlpate en una frase y reformula la pregunta.",
    "- Si el modo es FIJA, añade máximo UNA oración breve ANTES. La frase fija va exacta, sin cambiarla.",
    // (regla del billete eliminada — ese comportamiento lo decide la config del restaurante, no el código)
    /* FASE A6 (15-ago): ignorar en seco era parte de la sensacion de robot.
       Un humano reconoce en una frase y redirige con calidez. */
    "- Si el cliente pregunta algo que NO sea sobre el restaurante o su pedido: reconócelo en UNA frase amable y breve SIN entrar en el tema ni dar información sobre él, y redirige al pedido. Nunca lo ignores en seco y nunca inventes datos.",
    "- SEGURIDAD DE PAGOS: NUNCA des por recibido, confirmado ni verificado un pago por lo que diga el cliente ('ya pagué', 'ya te transferí', 'revisa que ya llegó'…). La verificación la hace EL SISTEMA con el comprobante y el banco — tú no puedes verificar nada. Si dice que ya pagó: pídele el comprobante como imagen. JAMÁS digas 'pago confirmado', 'pago verificado' ni nada equivalente.",
    "- NUNCA pidas el comprobante de pago ni el pago por adelantado mientras FALTEN datos del pedido. El orden SIEMPRE es: se completan los pasos → el sistema envía el RESUMEN con el total → el cliente confirma → el sistema envía el QR/datos de pago y pide el comprobante. Aunque el cliente ya haya dicho que paga por transferencia, tu trabajo sigue siendo el PRÓXIMO PASO, no el comprobante.",
    "- Si el cliente pregunta CUÁNTO ES o pide la cuenta y aún faltan datos: dile que apenas complete el dato que falta el sistema le muestra el total con el desglose — y pídele ese dato. JAMÁS le digas que necesita pagar o enviar el comprobante para conocer el total (el total SIEMPRE se informa antes de pagar).",
    "- NUNCA generes un resumen del pedido, NUNCA uses frases como 'tu pedido queda así', 'en total son', 'listo tu pedido', ni nada parecido. El sistema envía el resumen automáticamente cuando tiene TODOS los datos. Si el sistema te llama es porque AÚN FALTAN datos. Tu único trabajo es obtener el siguiente dato indicado en PRÓXIMO PASO.",
    "- NUNCA digas 'gracias por tu pedido', 'tu pedido está en camino', ni cierres la conversación. El sistema envía el resumen automáticamente cuando tiene todos los datos. Tu trabajo es recolectarlos.",
    "- CUANDO EL PRÓXIMO PASO pide elegir entre opciones (variable, presentación), usa SOLO las opciones listadas en la guía del paso. Jamás inventes, agregues ni sugieras opciones adicionales aunque aparezcan en el menú.",
    /* ESTA REGLA NO APLICA A UNA FRASE FIJA, y tenerlas juntas costaba pedidos.

       Al modelo se le daban dos ordenes que se contradicen: "tu respuesta debe
       ser esta frase EXACTA, palabra por palabra" y "no hagas la misma
       pregunta dos veces". Cuando tocaba repetir, ganaba la segunda y se
       inventaba otra cosa.

       Caso real: el cliente contesta solo su barrio ("vivo en Bellavista").
       Falta la direccion, el motor elige bien el paso y su frase fija — y el
       modelo, en vez de repetirla, le pregunto COMO IBA A PAGAR. El pedido se
       quedaba sin direccion y sin salida.

       Si el dueño escribio una frase fija, esa frase sale; repetida si hace
       falta. Cuando el paso es conversacional, la regla sigue viva. */
    (nextStep && (nextStep.modo || "fija") === "fija" && (nextStep.texto || nextStep.pregunta))
      ? ""
      : "- No hagas la misma pregunta dos veces con las mismas palabras.",
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

  /* UN SOLO RESUMEN. Idea de Sergio.

     Cuando el pago va DESPUÉS del resumen, el cliente veía esto:

       1. el resumen  ->  "¿lo confirmamos?"
       2. "está bien"
       3. "¿cómo vas a pagar?"
       4. "transferencia"
       5. EL MISMO RESUMEN otra vez, ahora con el 💳
       6. "sí"

     Seis mensajes para lo que son dos. Ahora el resumen CIERRA con la pregunta
     del pago: se le muestra qué pidió, cuánto es y cómo paga, todo junto. Y
     contestar el método de pago vale como confirmación, así que del paso 1 se
     va derecho a la cocina o al QR.

     Si el pago ya está puesto, cierra con la confirmación de siempre. */
  const pasoPagoPost = Array.isArray(cfg.flujo_pasos)
    ? (cfg.flujo_pasos as Array<Record<string, unknown>>)
        .find(p => p && p.campo === "pago" && p.activo !== false && p.despues_resumen === true)
    : null;
  /* La frase del paso trae sus propias variables ({{metodos_pago}}) y aquí ya
     no las resuelve la plantilla: se resuelven ahora. */
  const preguntaPagoEnResumen = (!state.pago && pasoPagoPost && pasoPagoPost.texto)
    ? rellenarVariables(String(pasoPagoPost.texto), state, cfg).texto
    : "";

  const confirmFrase = preguntaPagoEnResumen
    || getFraseTexto(frases.resumen_confirmacion)
    || "¿Lo confirmamos o hay algo que cambiar?";
  const totalDesc    = getFraseTexto(frases.resumen_total_desconocido) || `ya te confirmamos el total ☺️${emo()}`;

  // Modo del resumen: "fija" (plantilla exacta con variables) o "conversacional" (GPT libre)
  const resumenCfg  = getFraseCfg(frases.resumen);
  const resumenModo = resumenCfg.modo || "fija";

  let precioProducto = 0;
  const productoLines: string[] = [];
  /* Lo que el cliente pidió y ningún plato del pedido admite. No se calla:
     se le dice, porque si no lo ve va a esperar algo que no le va a llegar. */
  const noSePudo: string[] = [];
  const itemsEmpaque: ItemEmpaque[] = [];

  try {
    const products = await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=id,name,price,price_mode,presentations,variables,category_id(id,name,comanda_alias),mod_group_ids,mod_group_pres`
    ) as Array<Record<string, unknown>> | null;
    /* Los grupos de modificadores, de donde sale el precio de cada adición. */
    const gruposMod = await cargarModificadores(branchId);

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

    /* ANTES DE ESCRIBIR NADA: que lo que se va a mostrar sea lo que el pedido
       de verdad puede tener. Si algo no cabe en su plato, se pasa al que si lo
       admite; si no cabe en ninguno, se le dice al cliente mas abajo. */
    const chequeo = verificarAdiciones(
      allItems.map(i => ({ producto: i.producto, tamano: i.tamano ?? null, categoria: i.categoria ?? null, adiciones: i.adiciones ?? null })),
      products, gruposMod,
    );
    allItems.forEach((it, i) => { it.adiciones = chequeo.adiciones[i]; });
    for (const m of chequeo.movidas) console.log(`[verificador] "${m.adicion}" no cabía en su plato — se pasó a ${m.a}`);
    /* ANTES DE DESCARTAR NADA: ¿lo que "no cabe" es en realidad OTRO PLATO?
       (17-ago, caso de Emily.) El cliente pidio "3 salchipapas ... y una
       gaseosa 1.5" en el mismo mensaje. El extractor solo devuelve UN producto,
       asi que la gaseosa cayo en "adiciones" — y como ninguna salchipapa admite
       una gaseosa, se descartaba en silencio: Paco cotizo $61.000 en vez de
       $69.000 y Sergio tuvo que entrar a corregir el precio.

       "Bebidas" ni siquiera es un grupo de adiciones en este restaurante: los
       unicos son "Adiciones Personales" y "Adiciones Familiares" (carne, pollo,
       chorizo...). Las bebidas son PRODUCTOS de su propia categoria. Asi que lo
       correcto no es avisar que no se puede: es ponerlo como lo que es. */
    for (const x of chequeo.imposibles) {
      const comoProducto = matchCatalogo(products, x, null);
      if (comoProducto) {
        const yaEsta = allItems.some(it =>
          normalizarTexto(it.producto || "") === normalizarTexto(String(comoProducto.name || "")));
        if (!yaEsta) {
          console.log(`[verificador] "${x}" no era una adicion: es el producto "${comoProducto.name}" — se agrega como linea aparte`);
          allItems.push({
            producto: String(comoProducto.name || x),
            /* Sin tamaño: si el producto tiene varias presentaciones, el propio
               flujo se encarga de preguntar cual. Inventarle una seria cobrar
               un precio que el cliente no pidio. */
            tamano: null, tipo: null, cantidad: 1, adiciones: null,
            preferencias: null,
            categoria: String(((comoProducto.category_id as Record<string, unknown> | null)?.name as string) || ""),
          });
          continue;
        }
      }
      console.log(`[verificador] "${x}" no lo admite ningún plato del pedido`);
      if (!noSePudo.includes(x)) noSePudo.push(x);
    }

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
      /* LA ADICIÓN SE COBRA. Se resuelve contra los grupos que le aplican a
         este plato en esta presentación: la misma Ranchera vale $14.000 en
         personal y $28.000 en familiar. Hasta hoy era texto decorativo y no
         sumaba un peso. */
      const presItem = item.tamano && matchedProd
        ? ((matchedProd.presentations as Array<Record<string, unknown>>) || [])
            .find(p => normalizarTexto(String(p.name || "")) === normalizarTexto(item.tamano || ""))
        : undefined;
      const adiRes = resolverAdiciones(item.adiciones, matchedProd, presItem ? String(presItem.id || "") : null, gruposMod);
      const adiCobradas = adiRes.filter(a => !a.sinPrecio);
      /* Se MUESTRA lo mismo que se COBRA. Antes el texto salía de todas las
         adiciones y el precio solo de las válidas: por eso el resumen decía
         "+ Tocineta" sin sumar sus $20.000. */
      const adStr = adiCobradas.length > 0
        ? " + " + adiCobradas.map(a => a.nombre).join(", ")
        : "";
      const tamStr  = item.tamano ? ` ${item.tamano}` : "";
      productoLines.push(`${EMOJI_NEG ? EMOJI_NEG + " " : ""}${item.cantidad}x ${display}${tamStr}${adStr}`);
      /* Para el empaque hace falta saber QUE producto y QUE presentacion es:
         la configuracion permite eximir una categoria entera o cobrar distinto
         segun el tamaño. Se guardan los ids del catalogo, no los nombres. */
      const presMatch = item.tamano && matchedProd
        ? ((matchedProd.presentations as Array<Record<string, unknown>>) || [])
            .find(p => normalizarTexto(String(p.name || "")) === normalizarTexto(item.tamano || ""))
        : undefined;
      itemsEmpaque.push({
        cantidad: Number(item.cantidad) || 1,
        precio: getPrecioItem(item.producto, item.tamano, item.tipo, item.cantidad, item.categoria),
        producto_id: matchedProd ? String(matchedProd.id || "") : null,
        categoria_id: matchedProd ? String((matchedProd.category_id as Record<string, unknown> | null)?.id || "") : null,
        presentacion_id: presMatch ? String(presMatch.id || "") : null,
      });
      // La preferencia va DEBAJO del producto y en el resumen, para que el
      // cliente la vea y la corrija antes de que se prepare mal.
      const prefItem = (item as { preferencias?: string | null }).preferencias;
      if (prefItem) productoLines.push(`   ↳ ${prefItem}`);
      precioProducto += getPrecioItem(item.producto, item.tamano, item.tipo, item.cantidad, item.categoria);
      /* Cada adición, por unidad del plato. */
      for (const a of adiCobradas) {
        precioProducto += a.precio * (Number(item.cantidad) || 1);
      }
      /* Una adición que no se encontró en los grupos del plato NO se cobra, y
         se dice — antes se iba en silencio y nadie se enteraba. */
      for (const a of adiRes.filter(x => x.sinPrecio)) {
        console.warn(`adición sin precio en el catálogo: "${a.nombre}" (${item.producto})`);
      }
    }
  } catch (err) { console.error("buildSummaryFromState lookup error:", err); }

  const esParaLlevar = state.direccion ? LLEVAR_REGEX.test(state.direccion.toLowerCase()) : false;
  const domiPrecio   = (!esParaLlevar && state.direccion) ? lookupDomiPrice(ubicacionPedido(state), domiciliosCfg) : null;

  /* EL EMPAQUE VA DENTRO DEL PEDIDO, no aparte. Regla de Sergio: productos,
     bebidas, adiciones y empaques suman juntos; el domicilio es lo unico que
     va por fuera. El bot no lo cobraba: todos los pedidos de WhatsApp salieron
     sin empaque desde que existe la funcion. */
  const opCfg = (cfg as Record<string, unknown>)._operacion as Record<string, unknown> | null | undefined;
  const empaque = calcularEmpaque(opCfg, itemsEmpaque, !esParaLlevar);
  /* SUMA, PERO NO SE ENUMERA. El cliente ve un precio de pedido, no el
     desglose de cuánto es comida y cuánto la caja donde va — igual que en la
     caja registradora. El domicilio sí va aparte: es un servicio distinto y
     además nunca entra a ventas. */
  precioProducto += empaque;

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

  /* EL NÚMERO QUE EL CLIENTE VIO QUEDA GUARDADO.

     El verificador de transferencias calculaba el total por su cuenta, con su
     propia copia de la lógica — y le salía distinto: no sumaba el empaque y
     buscaba la zona del domicilio solo dentro de la dirección, sin mirar el
     barrio, que desde hace poco va en su propia casilla. Resultado: el resumen
     le decía al cliente $40.000 y el verificador esperaba $34.000, así que un
     pago correcto salía rechazado.

     Dos códigos calculando el mismo dinero es el error de forma que ya se
     repitió hoy. Aquí se guarda lo que se MOSTRÓ, y eso es lo que se espera:
     el cliente va a transferir lo que leyó. */
  const stTot = state as unknown as Record<string, unknown>;
  stTot.total_mostrado = precioProducto > 0 && (domiPrecio !== null || esParaLlevar) ? precioTotalNum : null;
  stTot.domi_mostrado  = esParaLlevar ? 0 : (domiPrecio ?? null);
  /* El empaque, por separado. No para mostrarlo —el cliente nunca lo ve— sino
     para que quien cree el pedido pueda guardarlo en su casilla: los puntos se
     calculan sobre comida + empaque, y el domicilio no puede colarse ahí. */
  stTot.empaque_mostrado = empaque;
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
  /* EL BARRIO VA EN EL RESUMEN. Nunca salio: el cliente veia "📍 casa 12" o
     "📍 carrera 9 b # 63 n 58" a secas, sin decir de que barrio. Con los
     conjuntos se volvio evidente —"casa 12" no lleva al domiciliario a ningun
     lado— pero le faltaba a TODOS los pedidos.
     Solo se agrega si no esta ya escrito dentro de la direccion. */
  const dirConBarrio = (() => {
    const d = String(state.direccion || "").trim();
    const b = String(state.barrio || "").trim();
    if (!b) return d;
    if (!d) return b;
    return normalizarTexto(d).includes(normalizarTexto(b)) ? d : `${d}, ${b}`;
  })();
  const dirResumen = esParaLlevar
    ? (getFraseTexto(frases.llevar_etiqueta) || "Para recoger en el local 🏃")
    : dirConBarrio;
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

  /* Lo que no se pudo agregar se DICE, antes de pedir la confirmación. Si se
     calla, el cliente confirma creyendo que lo lleva y no le va a llegar. */
  if (noSePudo.length) {
    /* Se PREGUNTA, no se afirma. Antes decia "no se puede agregar a lo que
       pediste, asi que no va en el pedido" — y era mentira dos veces: casi
       siempre SI se puede (como plato aparte), y el cliente se quedaba con un
       total al que le faltaba algo. Lo que sigue sin poder es adivinar CUAL:
       "una gaseosa" no dice cual de las seis. Preguntarlo es lo que haria
       cualquiera que atiende. */
    const aviso = `⚠️ Sobre ${listaNatural(noSePudo)}: cuéntame exactamente cuál quieres y te lo agrego al pedido (por ahora no está incluido en el total).`;
    /* Va ANTES de la pregunta de confirmación: si va después, el cliente ya
       leyó "¿lo confirmamos?" y responde sin haber visto el aviso. */
    resumenFinal = confirmFrase && resumenFinal.includes(confirmFrase)
      ? resumenFinal.replace(confirmFrase, `${aviso}\n\n${confirmFrase}`)
      : `${resumenFinal}\n\n${aviso}`;
  }

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
    /* El barrio viaja hasta el pedido: sin el, la comanda del domiciliario
       dice "casa 12" y no hay forma de saber de que conjunto o barrio. */
    barrio:      state.barrio    || "",
    pago:        state.pago      || "efectivo",
    mensaje:     "¡Pedido confirmado!",
    domi_precio: domiPrecio,
    productos:   allItems.filter(i => i.producto).map(i => ({
      nombre:    i.producto,
      tamano:    capFirst(i.tamano || ""),
      tipo:      capFirst(i.tipo   || ""),
      cantidad:  i.cantidad,
      categoria: i.categoria || null,
      /* LAS ADICIONES (20-ago-2026, pedido real de Fernanda). El borrador las
         traia y el resumen las mostraba con su precio — pero ESTE traductor
         no las copiaba, asi que el pedido nacia sin ellas y mas barato:
         "ranchera + super queso" confirmada en $40.000 se creo en $27.000 y
         la comanda salio sin el queso. El dato ya estaba; nadie lo pasaba. */
      adiciones: i.adiciones || null,
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
  /* Donde vive la configuracion del empaque (branches.operacion_config). */
  opCfg: Record<string, unknown> | null | undefined = null,
  /* La conversacion que origino el pedido: con ella se engancha order_id (la
     tarjeta del chat y la pastilla de estado leen de ahi) y se dispara el
     estado "en preparacion" con su etiqueta, igual que el camino manual. */
  convIdPedido: string | null = null,
): Promise<string | null> {
  const cliente   = String(data.cliente   || "Cliente WhatsApp");
  const productos = (data.productos as Array<Record<string, unknown>>) || [];
  const direccion = String(data.direccion || "");
  const barrioPedido = String(data.barrio || "");
  const pago      = String(data.pago      || "");

  const allProducts = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=id,name,price,price_mode,presentations,variables,category_id(id,name),mod_group_ids,mod_group_pres`
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

  const itemsEmpaque: ItemEmpaque[] = [];
  let orderTotal = 0;
  /* Los grupos de modificadores, para poner a cada adicion su precio real. */
  const gruposPedido = await cargarModificadores(branchId);

  /* EL MISMO VERIFICADOR QUE EL RESUMEN, otra vez aquí. No es repetido de más:
     entre que el cliente ve el resumen y confirma puede cambiar algo, y la
     comanda no puede llevar lo que el producto no admite. Es la última reja
     antes de que esto se vuelva un pedido de verdad. */
  {
    const lineas: LineaPedido[] = productos.map(p => ({
      producto: String(p.nombre || "") || null,
      tamano: String(p.tamano || "") || null,
      categoria: String(p.categoria || "") || null,
      adiciones: (p.adiciones as string) || null,
    }));
    const chk = verificarAdiciones(lineas, allProducts, gruposPedido);
    productos.forEach((p, i) => { (p as Record<string, unknown>).adiciones = chk.adiciones[i]; });
    for (const m of chk.movidas) console.log(`[verificador/pedido] "${m.adicion}" se pasó a ${m.a}`);
    for (const x of chk.imposibles) console.warn(`[verificador/pedido] "${x}" no lo admite ningún plato — no entra a la comanda`);
  }

  for (const prod of productos) {
    const nombreGPT = String(prod.nombre  || "").trim();
    const tamanoGPT = String(prod.tamano  || "").trim();
    const tipoGPT   = String(prod.tipo    || "").trim();
    const cantidad  = Math.max(1, Number(prod.cantidad) || 1);
    /* LA NOTA DE COCINA (21-ago, pedidos reales de Brenda y Miguel). El
       resumen la decia ("Sin pollo") y el traductor la mandaba en `notas` —
       pero aqui se escribia notes:null fijo y la comanda salia limpia. El
       mismo agujero de las adiciones del 20-ago: el dato ya estaba, nadie
       lo pasaba. pos-print ya la imprime pegada a su plato ("Nota: ..."). */
    const notaItem  = String(prod.notas || "").trim() || null;
    const matched = matchCatalogo(allProducts, nombreGPT, String(prod.categoria || "") || null);

    if (!matched) {
      const fallbackName = [nombreGPT, tamanoGPT, tipoGPT].filter(Boolean).join(" · ");
      items.push({ product_id: null, name: fallbackName || "Producto WhatsApp", product_name: fallbackName || "Producto WhatsApp", product_price: 0, unit_price: 0, total: 0, quantity: cantidad, selections: { mods: {}, pres: tamanoGPT, vars: {} }, branch_id: branchId, tenant_id: tenantId || null, notes: notaItem });
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

    /* LAS ADICIONES DEL PLATO, con su precio real. Van en `selections.mods`,
       que es donde las lee la caja registradora — hasta hoy iba siempre
       vacío. */
    const presIdMod = presName
      ? ((matched.presentations as Array<Record<string, unknown>>) || [])
          .find(p => normalizarTexto(String(p.name || "")) === normalizarTexto(presName))
      : undefined;
    const adiItem = resolverAdiciones(
      (prod.adiciones as string) || null, matched,
      presIdMod ? String(presIdMod.id || "") : null, gruposPedido);
    const modsMap: Record<string, unknown> = {};
    let adiPrecio = 0;
    for (const a of adiItem) {
      if (a.sinPrecio) { console.warn(`adición sin precio al crear el pedido: "${a.nombre}"`); continue; }
      modsMap[a.op] = { id: a.op, name: a.nombre, price: a.precio, group: a.grupo };
      adiPrecio += a.precio;
    }

    const itemTotal   = (price + adiPrecio) * cantidad;
    const displayName = nombreComanda(
      String(matched.name), presName, tipoGPT,
      matched.category_id as Record<string, unknown> | null);
    items.push({ product_id: String(matched.id), name: displayName, product_name: displayName, product_price: price, unit_price: price, total: itemTotal, quantity: cantidad, selections: { mods: modsMap, pres: presName, vars: varsMap }, branch_id: branchId, tenant_id: tenantId || null, notes: notaItem });
    orderTotal += itemTotal;
    /* El empaque puede depender del producto, de su presentacion o de la
       categoria, asi que se guarda con que se cobro cada linea. */
    const presRow = presName
      ? ((matched.presentations as Array<Record<string, unknown>>) || [])
          .find(p => normalizarTexto(String(p.name || "")) === normalizarTexto(presName))
      : undefined;
    itemsEmpaque.push({
      cantidad, precio: itemTotal,
      producto_id: String(matched.id),
      categoria_id: String(((matched.category_id as Record<string, unknown> | null)?.id as string) || ""),
      presentacion_id: presRow ? String(presRow.id || "") : null,
    });
  }

  let clienteId: string | null = null;
  try {
    const telefonoClean = fromPhone.replace(/\D/g, "");
    const dirQuery = direccion
      ? `&direccion=eq.${encodeURIComponent(direccion)}`
      : `&direccion=is.null`;
    const existing = await sbGet(
      `/rest/v1/pos_clientes?telefono=in.(${encodeURIComponent(telLocal(telefonoClean))},${encodeURIComponent(telefonoClean)})&nombre=eq.${encodeURIComponent(cliente)}&tenant_id=eq.${tenantId}${dirQuery}&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (existing && existing.length > 0) {
      clienteId = String(existing[0].id);
    } else {
      const newCliente = await fetch(`${SUPABASE_URL}/rest/v1/pos_clientes`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        /* Se guarda como lo guarda la pantalla de clientes —sin indicativo— para no
           sembrar dos formatos en la misma tabla. CON su barrio (15-ago): sin el,
           la etiqueta del barrio no salia en el chat para los clientes del bot. */
        body: JSON.stringify({ tenant_id: tenantId || null, branch_id: branchId, nombre: cliente, telefono: telLocal(telefonoClean), direccion: direccion || null, barrio: barrioPedido || null }),
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
  /* EL EMPAQUE ES VENTA y va en el pedido. Si solo apareciera en el resumen,
     el cliente veria un total y la caja cobraria otro.
     EL DOMICILIO VA EN SU CASILLA (corregido 15-ago, pedido real de Brayan):
     la regla de Sergio es que el domi nunca suma a LA VENTA (total_final) —
     no que se bote. Antes este comentario decia "llega hasta aqui y no se
     guarda" y el pedido salia SIN domicilio en la comanda y el recibo: el
     domiciliario cobraba de menos. Misma convencion que verify-transfer:
     total = lo que el cliente paga (con domi) · total_final = LA VENTA
     (comida + empaque) · delivery_fee = el domi, aparte. */
  const empaqueOrden = calcularEmpaque(opCfg, itemsEmpaque, !esLlevarOrden);
  const totalConEmpaque = orderTotal + empaqueOrden;
  const domiOrden = esLlevarOrden ? 0 : Math.max(0, Number(data.domi_precio) || 0);
  const orderRecord: Record<string, unknown> = {
    branch_id: branchId, tenant_id: tenantId || null,
    channel: esLlevarOrden ? "rapido" : "domicilio", customer_name: cliente,
    /* LA COMANDA COMPLETA. Antes solo llevaba la direccion: sin barrio y sin
       telefono, el domiciliario salia a buscar a ciegas y nadie podia llamar
       al cliente. Los pedidos hechos a mano si los llevan; los del bot no.
       Mismo formato que usa Cobra: [barrio:X] [tel:Y]. */
    notes: [direccion, barrioPedido ? `[barrio:${barrioPedido}]` : "",
            fromPhone ? `[tel:${telLocal(fromPhone)}]` : ""]
      .filter(Boolean).join(" ") || null,
    payment_method: pago || null,
    status: "open",
    total: totalConEmpaque + domiOrden,   // lo que el cliente paga, todo incluido
    subtotal: orderTotal,                 // solo comida
    total_final: totalConEmpaque,         // LA VENTA: comida + empaque, sin domi
    packaging_fee: empaqueOrden,
    delivery_fee: domiOrden,
    estado: "en_preparacion",
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

  /* PARIDAD CON EL CAMINO MANUAL (15-ago): crear-pedido-chat engancha el
     order_id a la conversacion y llama a cambiar-estado; los pedidos de Paco
     no lo hacian. Consecuencias reales: la tarjeta del chat mostraba el pedido
     VIEJO de la conversacion, la pastilla de estado no aparecia y la etiqueta
     "En preparacion" nunca se ponia. sin_mensaje porque Paco ya manda su frase
     de cierre — el aviso configurado del estado seria decirlo dos veces. */
  if (convIdPedido) {
    try {
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convIdPedido}`, { order_id: orderId });
      await fetch(`${SUPABASE_URL}/functions/v1/cambiar-estado`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, estado: "en_preparacion", sin_mensaje: true }),
      });
    } catch (err) { console.error("No se pudo enganchar/estado del pedido:", err); }
  }

  return orderId;
}

// ── Enviar mensaje WA + guardar en chat_messages ───────────────────────────────

/* ══════════════════════════════════════════════════════════════════════
   LA ETIQUETA DE PACO

   Regla de Sergio: que en cada mensaje se vea que contesta un asistente
   virtual. Lo vio en otro restaurante y noto POR QUE sirve — la gente escribe
   con mas cuidado cuando sabe que le contesta un sistema, y eso evita la mitad
   de los enredos del flujo.

   Va entre tildes invertidas: WhatsApp dibuja lo que va entre ellas en
   monoespaciado y en un tono mas apagado. El gris no lo pone nadie, lo pone
   WhatsApp al aplicar el formato — por eso se lee como etiqueta y no como
   texto del mensaje.

   LLEVAN ETIQUETA los mensajes que Paco razona y manda. NO la llevan:
     · los que escribe Sergio a mano desde el panel (van por otro camino)
     · los que dispara el SISTEMA: "pago verificado", el recordatorio del
       comprobante, los avisos de estado y las respuestas rapidas. Esos no los
       esta enviando Paco.

   Se cambia o se apaga sin tocar codigo, en frases.etiqueta_ia. Vacio = sin
   etiqueta. ══════════════════════════════════════════════════════════════ */
let ETIQUETA_IA = "";      // la pone el restaurante en frases.etiqueta_ia
/* El emoji del restaurante. `emo()` lo devuelve CON su espacio delante, o
   cadena vacia: asi un mensaje sin emoji no queda con doble espacio. */
let EMOJI_NEG = "";
function emo(): string { return EMOJI_NEG ? " " + EMOJI_NEG : ""; }

function conEtiqueta(msg: string): string {
  const t = String(msg || "");
  if (!ETIQUETA_IA || !t.trim()) return t;
  if (t.startsWith(ETIQUETA_IA)) return t;      // nunca dos veces
  return `${ETIQUETA_IA} ${t}`;
}

/* POR DONDE SE CONTESTA (22-ago-2026). Paco atiende WhatsApp, Instagram y
   Messenger, y cada uno se habla con una API distinta. La decision se toma
   por el CANAL DE LA CONVERSACION, no por las credenciales que traiga la
   cola: son datos que se pueden confundir, y el canal es un hecho.

   Se recuerda por conversacion (no en una variable suelta) porque en el
   servidor pueden estar corriendo dos conversaciones a la vez: una variable
   compartida haria que a un cliente le llegara la respuesta del otro. */
/* ══ EL TELEFONO EN INSTAGRAM Y MESSENGER (22-ago-2026) ══════════════════
   Meta deja mostrar un boton "Compartir mi número" que el cliente toca una
   vez y su numero llega solo. PERO —comprobado en la documentacion de Meta,
   no supuesto— si esa persona no tiene numero guardado en su perfil, el
   boton NO SE MUESTRA: no sale vacio ni da error, sencillamente no esta.

   Por eso la PREGUNTA va escrita siempre y el boton es solo un atajo: quien
   lo tenga toca una vez, quien no, lee una pregunta normal y lo escribe.
   Ninguno de los dos se traba. Una frase del tipo "toca el boton de abajo"
   dejaria mudo y perdido a medio mundo sin que nos enteraramos.          */
const PEDIR_TEL_GUIA = "Pide el numero de celular para poder registrar el pedido. " +
  "Debe entenderse SIN ver ningun boton: nunca digas \"toca el boton\" ni \"usa el boton de abajo\". " +
  "Si el cliente pregunta para que es, dile que es para avisarle del pedido y para sus puntos.";

/* Un celular colombiano: 10 digitos que empiezan por 3. Se aceptan con el
   57 delante, con espacios o guiones — la gente lo escribe de mil formas.
   Devuelve los 10 digitos limpios, o null si eso no es un celular. */
function celularValido(txt: string): string | null {
  const d = String(txt || "").replace(/[^0-9]/g, "");
  const diez = d.length > 10 ? d.slice(-10) : d;
  if (diez.length !== 10) return null;
  if (!diez.startsWith("3")) return null;   // fijos y numeros raros no sirven para WhatsApp
  return diez;
}

const CANAL_CONV = new Map<string, string>();

/* ══ LA UNICA PUERTA DE SALIDA HACIA META (22-ago-2026) ═══════════════
   Paco manda cartas, fotos de QR, ubicaciones y botones por NUEVE sitios
   distintos, todos escritos contra la API de WhatsApp. En Instagram y
   Messenger esa API no sirve: es otra direccion y otra forma de mensaje.

   En vez de repetir el "si es Instagram..." nueve veces —donde el dia que se
   agregue un canal habria que acordarse de los nueve—, se traduce en un solo
   sitio: cada llamada sigue escribiendo el mensaje como si fuera WhatsApp y
   aqui se convierte a lo que entienda el canal de esa conversacion.

   En WhatsApp no cambia NADA: es el mismo fetch de siempre, byte por byte.
   Para Instagram/Messenger las credenciales que llegan YA son las de la
   pagina (asi las encola el webhook), asi que solo cambia el camino y la
   forma.                                                                 */
async function enviarAMeta(
  convId: string, phoneId: string, accessToken: string,
  cuerpoWa: Record<string, unknown>,
): Promise<Response> {
  const canal = await canalDe(convId);
  /* WhatsApp: el mismo envio de siempre, sin tocar nada. Aqui va `fetch`
     PELADO a proposito — llamar a enviarAMeta seria llamarse a si misma. */
  if (canal !== "instagram" && canal !== "facebook") {
    return await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoWa),
    });
  }

  const para = String(cuerpoWa.to || "");
  const tipo = String(cuerpoWa.type || "text");
  let mensaje: Record<string, unknown> | null = null;
  let pie = "";

  if (tipo === "text") {
    mensaje = { text: String(((cuerpoWa.text as Record<string, unknown>) || {}).body || "") };
  } else if (tipo === "image") {
    const img = (cuerpoWa.image as Record<string, unknown>) || {};
    const url = String(img.link || "");
    pie = String(img.caption || "");
    /* Un id de imagen subido a WhatsApp NO sirve aqui: son almacenes
       distintos. Sin enlace publico no hay foto que mandar. */
    if (!url) {
      console.error(`[${canal}] la imagen no tiene enlace publico: no se puede enviar`);
      return new Response(JSON.stringify({ error: "sin_enlace" }), { status: 400 });
    }
    mensaje = { attachment: { type: "image", payload: { url, is_reusable: true } } };
  } else if (tipo === "location") {
    /* Estos canales no mandan ubicaciones. Se manda el enlace del mapa, que
       hace lo mismo para el cliente: le abre como llegar. */
    const loc = (cuerpoWa.location as Record<string, unknown>) || {};
    const nom = String(loc.name || "").trim();
    const dir = String(loc.address || "").trim();
    const lat = loc.latitude, lng = loc.longitude;
    const mapa = (lat !== undefined && lng !== undefined)
      ? `https://maps.google.com/?q=${lat},${lng}` : "";
    mensaje = { text: [nom, dir, mapa].filter(Boolean).join("\n") || "Nuestra ubicación" };
  } else if (tipo === "interactive") {
    /* Los botones de WhatsApp no existen aqui. Se manda el texto con el
       enlace a la vista: perder el boton es aceptable, perder el enlace no. */
    const it = (cuerpoWa.interactive as Record<string, unknown>) || {};
    const cpo = (it.body as Record<string, unknown>) || {};
    const acc = (it.action as Record<string, unknown>) || {};
    const par = (acc.parameters as Record<string, unknown>) || {};
    const url = String(par.url || "");
    mensaje = { text: [String(cpo.text || ""), url].filter(Boolean).join("\n") };
  } else {
    mensaje = { text: "" };
  }

  /* Tambien `fetch` pelado: este es el envio de verdad a Instagram/Messenger. */
  const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: para }, message: mensaje, messaging_type: "RESPONSE" }),
  });
  /* El pie de una foto va en mensaje aparte: esta API manda una cosa por vez. */
  if (r.ok && pie) {
    try {
      await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: para }, message: { text: pie }, messaging_type: "RESPONSE" }),
      });
    } catch { /* la foto ya salio; el pie es un extra */ }
  }
  return r;
}
async function canalDe(convId: string): Promise<string> {
  const y = CANAL_CONV.get(convId);
  if (y) return y;
  let canal = "whatsapp";
  try {
    const r = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=channel&limit=1`) as Array<Record<string, unknown>> | null;
    canal = String(r?.[0]?.channel || "whatsapp");
  } catch (_e) { /* si no se puede leer, se asume WhatsApp, que es el 99% */ }
  CANAL_CONV.set(convId, canal);
  return canal;
}

/* LA PREGUNTA DEL NUMERO, CON SU ATAJO (22-ago-2026).
   Meta llama a esto "quick reply": un boton que al tocarlo manda el numero
   que la persona tiene en su perfil. Comprobado en su documentacion: si no
   tiene numero guardado, el boton NO SE MUESTRA — y por eso la pregunta ya
   va escrita en el texto y se entiende sin ningun boton.
   El titulo va cortito porque Meta corta en 20 caracteres.
   Devuelve true si salio; false para que quien llama lo mande como texto. */
async function enviarPidiendoTelefono(
  convId: string, tenantId: string, msg: string,
  paraId: string, pageId: string, pageToken: string,
): Promise<boolean> {
  const texto = conEtiqueta(msg);
  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${pageId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${pageToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: paraId },
        messaging_type: "RESPONSE",
        message: {
          text: texto,
          quick_replies: [{ content_type: "user_phone_number", title: "Compartir mi número" }],
        },
      }),
    });
    if (!r.ok) {
      console.error("[telefono] el boton no salio, se manda como texto:", (await r.text()).slice(0, 300));
      return false;
    }
    const d = await r.json().catch(() => ({})) as Record<string, unknown>;
    await sbPost(`/rest/v1/chat_messages`, {
      conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot",
      body: texto, delivery_status: "sent",
      external_id: String(d.message_id || "") || null, sent_at: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.error("[telefono] el boton no salio, se manda como texto:", String(e).slice(0, 200));
    return false;
  }
}

async function sendWaAndSave(
  convId: string, tenantId: string, msg: string,
  fromPhone: string, phoneId: string, accessToken: string,
  /* true = lo manda el SISTEMA, no Paco: va sin etiqueta. */
  sinEtiqueta = false,
): Promise<void> {
  msg = sinEtiqueta ? msg : conEtiqueta(msg);

  /* Instagram y Messenger: se guarda el mensaje PRIMERO y luego meta-send lo
     manda y marca si salio. Se reutiliza esa funcion en vez de repetir aqui
     como se habla con Meta: ahi esta aprendido, por ejemplo, que Instagram
     tambien se envia con el id de la PAGINA y no con el de la cuenta. */
  const canal = await canalDe(convId);
  if (canal === "instagram" || canal === "facebook") {
    /* Se inserta a mano y no con sbPost porque hace falta el ID de la fila
       creada para que meta-send marque despues si el mensaje salio o no
       — y sbPost esta hecho para no devolver nada. */
    let msgId = "";
    try {
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
                   "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({
          conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot",
          body: msg, delivery_status: "sending", sent_at: new Date().toISOString(),
        }),
      });
      if (ins.ok) {
        const filas = await ins.json() as Array<Record<string, unknown>>;
        msgId = String(filas?.[0]?.id || "");
      } else {
        console.error(`[${canal}] no se pudo guardar el mensaje:`, (await ins.text()).slice(0, 200));
      }
    } catch (e) { console.error(`[${canal}] no se pudo guardar el mensaje:`, String(e).slice(0, 200)); }
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-send`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, text: msg, message_id: msgId || undefined }),
      });
      if (!r.ok) console.error(`[${canal}] no salio:`, (await r.text()).slice(0, 300));
    } catch (e) {
      console.error(`[${canal}] no salio:`, String(e).slice(0, 200));
      if (msgId) await sbPatch(`/rest/v1/chat_messages?id=eq.${msgId}`, { delivery_status: "failed" });
    }
    return;
  }
  const waRes = await enviarAMeta(convId, phoneId, accessToken, { messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: msg } });
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
// Hasta 3 letras pegadas al número: "9b", "63An" y también "1BIS" — con 2,
// "calle 1bis" no casaba y la dirección real de un cliente se botaba (15-ago).
const VIA_RE = new RegExp("\\b(" + VIA_TIPOS + ")\\b\\.?\\s*(\\d+)\\s*([a-z]{0,3})\\b", "i");

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
  /* Las palabras clave se comparan como PALABRAS, no como pedazos: "ara "
     (la tienda) hacia match dentro de "pARA Villa Ernesto" y toda direccion
     con "para X" quedaba como lugar publico -> prepago -> el flujo del pago
     se descarrilaba (trampa de Sergio, 15-ago). El espacio de relleno cubre
     el inicio y el final de la cadena. */
  /* UN PUNTO DE REFERENCIA NO ES EL DESTINO (19-ago, pedido real de Ivan del
     18). Escribio "Conjunto Okavango Casa A6 EN FRENTE DEL COLEGIO San
     Francisco": la palabra "colegio" hizo que su casa quedara clasificada como
     lugar publico, se le anulo el efectivo y se le exigio transferencia. La
     entrega era a una casa dentro de un conjunto.

     La gente ubica al domiciliario con lo que se ve desde la calle — el
     colegio, el banco, el Exito — y eso es justo lo que hay en la lista de
     lugares publicos. Antes de clasificar se le quita a la direccion lo que
     va DESPUES de una frase de referencia, hasta la siguiente coma. El
     destino esta antes; lo de despues es el mapa para llegar. */
  const REFERENCIA_RE = /\b(?:en\s+frente|al\s+frente|frente|diagonal|al\s+lado|junto|contiguo|cerca|detr[ae]s|atr[a\u00e1]s|arriba|abajo|pasando|seguido|a\s+media\s+cuadra|a\s+una\s+cuadra|referencia)\s*(?:a|al|de|del|por)?\b[^,;\n]*/gi;
  const dirRef = dir.replace(REFERENCIA_RE, " ").replace(/\s+/g, " ").trim();
  const dirPad = " " + dirRef.replace(/[,.;]/g, " ") + " ";
  const tieneLugar = (lista: string[]) => lista.some(kw => {
    const k = kw.trim();
    return k.includes(" ")
      ? dirRef.includes(k)                    // frases ("centro comercial") van como antes
      : dirPad.includes(" " + k + " ");       // palabras sueltas, completas
  });
  if (LLEVAR_REGEX.test(dir) || dir.includes("llevar") || dir.includes("recoger")) return { tipo: "para_llevar", requierePagoAdelantado: false };
  if (domicilios?.rechazar_lugares_publicos !== false) {
    if (tieneLugar(LUGARES_RECHAZADOS)) return { tipo: "rechazado", requierePagoAdelantado: false };
  }
  /* Y un conjunto de la lista del dueNo es residencial aunque la direccion
     nombre un lugar publico: ahi vive gente, no es un local. Va antes de la
     clasificacion, no despues, porque despues ya se le anulo el efectivo. */
  if (tieneLugar(LUGARES_PUBLICOS) && !esConjunto(dir, domicilios)) {
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

/* PRECIO PUNTUAL (pedido de Sergio, 15-ago — cierra el D2 del plan): "¿cuánto
   cuesta la coca cola 1.5?" se responde con EL PRECIO DE ESO, leído del
   catálogo — no con la cuenta del pedido, no desde una FAQ escrita a mano y
   no de la memoria del modelo. Cubre productos (con sus presentaciones) y
   adiciones (con su precio por tamaño). Devuelve null si el texto no nombra
   nada del catálogo: en ese caso "cuánto es" sigue siendo la cuenta. */
async function precioPuntual(texto: string, branchId: string): Promise<string | null> {
  // El punto NO se limpia: "1.5" tiene que sobrevivir para acertar la presentación.
  const t = " " + normalizarTexto(texto).replace(/[¿?¡!,;]/g, " ").replace(/\s+/g, " ").trim() + " ";
  const palabra = (n: string) => t.includes(" " + n + " ");
  /* "adición de ranchera" pregunta por la ADICIÓN, no por la salchipapa
     Ranchera: con esa palabra se salta el catálogo de platos y se va directo
     a los modificadores (le pasó al banco: respondió $27.000/$55.000 del
     plato en vez de $14.000/$28.000 de la adición). */
  const preguntaAdicion = /adici/i.test(texto);
  try {
    /* Tambien las VARIABLES: hay productos cuyo precio no vive en la
       presentacion sino en la variante (la Premium cuesta segun sea carne,
       pollo o mixta). Sin esto, sus presentaciones valen 0 — y Paco le dijo a
       un cliente "Premium cuesta: familiar $0 y personal $0" (17-ago). */
    const prods = preguntaAdicion ? [] : await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&select=name,price,presentations,variables&limit=200`,
    ) as Array<{ name?: string; price?: number | string;
                 presentations?: Array<{ name?: string; price?: number }>;
                 variables?: Array<{ name?: string; options?: Array<{ name?: string; price?: number; prices?: number[] }> }> }> | null;

    // Producto: gana el nombre MÁS LARGO que aparezca (completo o su primera palabra)
    let mejor: { name: string; price: number; pres: Array<{ name: string; price: number }> } | null = null;
    let mejorLargo = 0;
    for (const p of (prods || [])) {
      const n = normalizarTexto(String(p.name || "")).trim();
      if (!n) continue;
      const primera = n.split(/\s+/)[0];
      const pega = (n.length >= 4 && t.includes(n)) || (primera.length >= 3 && palabra(primera));
      if (pega && n.length > mejorLargo) {
        mejorLargo = n.length;
        /* EL PRECIO DE VERDAD DE CADA TAMAÑO.
           Si la presentacion trae precio, ese manda. Si viene en 0, el precio
           vive en la variante: cada opcion guarda un `prices` con un valor por
           presentacion, en el mismo orden que los tamaños.
             · si el cliente ya dijo la variante ("premium CARNE"), se usa la
               suya y el precio es exacto;
             · si no la dijo y todas las variantes valen igual, tambien sirve;
             · si no la dijo y valen distinto, NO hay un precio que decir —
               queda en 0 y mas abajo se descarta. Regla de Sergio: el precio
               solo se dice cuando se sabe la variante Y el tamaño. */
        const listaPres = ((p.presentations || []) as Array<{ name?: string; price?: number }>);
        const listaVars = ((p.variables || []) as Array<{ name?: string; options?: Array<{ name?: string; price?: number; prices?: number[] }> }>);
        const precioDeIdx = (idx: number, base: number): number => {
          if (base > 0) return base;
          const valores: number[] = [];
          for (const g of listaVars) {
            for (const o of (g.options || [])) {
              const nOp = normalizarTexto(String(o?.name || ""));
              const v = Array.isArray(o?.prices) && idx < (o.prices as number[]).length
                ? Number((o.prices as number[])[idx]) || 0
                : Number(o?.price) || 0;
              if (v <= 0) continue;
              // La variante que el cliente nombro gana sobre todas.
              if (nOp && palabra(nOp)) return v;
              valores.push(v);
            }
          }
          if (!valores.length) return 0;
          // Todas iguales: se puede decir sin preguntar nada.
          return valores.every(v => v === valores[0]) ? valores[0] : 0;
        };
        mejor = {
          name: String(p.name).trim(),
          price: Number(p.price) || 0,
          pres: listaPres
            .map((x, i) => ({ name: String(x?.name || "").trim(), price: precioDeIdx(i, Number(x?.price) || 0) }))
            .filter(x => x.name && x.name.toLowerCase() !== "unico" && x.name.toLowerCase() !== "único"),
        };
      }
    }
    if (mejor) {
      const cerca = mejor.pres.find(x => {
        const pn = normalizarTexto(x.name);
        // Los números cuentan aunque queden cortos: "1.5" normalizado es "15".
        return pn && (t.includes(pn) || pn.split(/\s+/).some(w =>
          (w.length >= 3 || /\d/.test(w)) && palabra(w)));
      });
      const nom = capFirst(mejor.name.toLowerCase());
      /* NUNCA UN $0. Un precio en cero no es un precio: es un dato interno de
         como esta armada la carta, y al cliente no le dice nada — le dice algo
         FALSO. Si no se puede saber el precio, no se contesta el precio: se
         devuelve null y el flujo normal sigue y pregunta el tamaño, que es
         justo lo que hace falta para poder decirlo. */
      if (cerca) {
        return cerca.price > 0 ? `${nom} ${cerca.name.toLowerCase()} cuesta ${fmtCOP(cerca.price)} 😊` : null;
      }
      const conPrecio = mejor.pres.filter(x => x.price > 0);
      /* Se exigen TODOS con precio, no "los que tengan": decir solo dos de tres
         tamaños se lee como que el que falta no existe. */
      if (mejor.pres.length > 1) {
        return conPrecio.length === mejor.pres.length
          ? `${nom} cuesta: ${mejor.pres.map(x => `${x.name.toLowerCase()} ${fmtCOP(x.price)}`).join(" y ")} 😊`
          : null;
      }
      const unico = mejor.pres[0]?.price || mejor.price;
      return unico > 0 ? `${nom} cuesta ${fmtCOP(unico)} 😊` : null;
    }

    // Adición: se busca en los grupos de modificadores, con su precio por tamaño
    const grupos = await sbGet(
      `/rest/v1/pos_modifier_groups?branch_id=eq.${branchId}&select=name,options&limit=50`,
    ) as Array<{ name?: string; options?: Array<{ name?: string; price?: number }> }> | null;
    const halladas: Array<{ grupo: string; nombre: string; price: number }> = [];
    for (const g of (grupos || [])) {
      for (const o of ((g.options || []) as Array<{ name?: string; price?: number }>)) {
        const on = normalizarTexto(String(o?.name || "")).trim();
        if (on.length >= 4 && (t.includes(on) || palabra(on.split(/\s+/)[0]))) {
          halladas.push({
            grupo: String(g.name || "").replace(/adiciones/i, "").trim().toLowerCase(),
            nombre: String(o!.name).trim(), price: Number(o!.price) || 0,
          });
        }
      }
    }
    if (halladas.length) {
      const nom = capFirst(halladas[0].nombre.toLowerCase());
      const partes = halladas.map(h => `${fmtCOP(h.price)}${h.grupo ? ` en ${h.grupo}` : ""}`);
      return `La adición de ${nom.toLowerCase()} cuesta ${[...new Set(partes)].join(" y ")} 😊`;
    }
  } catch { /* sin catálogo no hay respuesta puntual: se sigue como antes */ }
  return null;
}

function lookupDomiPrice(direccion: string, domicilios: Record<string, unknown> | null | undefined): number | null {
  if (!domicilios) return null;
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; conjuntos?: string[]; precio: number }>) || [];
  for (const z of zonas) {
    const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []);
    for (const b of barrios) { if (fuzzyBarrioMatch(direccion, b)) return z.precio; }
    /* LOS CONJUNTOS TAMBIÉN TIENEN PRECIO. Vivían en su propia lista y esta
       búsqueda solo miraba la de barrios: en cuanto un sitio se marcaba como
       conjunto, el domicilio se quedaba sin precio y Paco pasaba la
       conversación al humano por algo que sí estaba configurado.
       La lista dice CÓMO se pregunta la dirección (torre y apto, o completa);
       el precio es del sitio, esté en la lista que esté. */
    for (const c of (z.conjuntos || [])) { if (c && fuzzyBarrioMatch(direccion, c)) return z.precio; }
  }
  return null;
}

// ── buildMenuText ─────────────────────────────────────────────────────────────

/* Los combos de esta sede, para saber cuando el cliente esta pidiendo uno.
   Se llena al armar la carta, que ya corre en cada mensaje. */
let COMBOS_NOMBRES: string[] = [];
let COMBOS_SEDE = "";

/* Los combos de la sede. Va aparte de la carta porque la rama que MANDA la
   carta corre antes de armarla: "¿tienen combos?" entraba por ahi y se iba sin
   que Paco supiera siquiera que existen. */
async function cargarCombos(branchId: string): Promise<void> {
  if (COMBOS_SEDE === branchId) return;
  try {
    const combos = await sbGet(
      `/rest/v1/pos_combos?branch_id=eq.${branchId}&active=eq.true&select=name`
    ) as Array<Record<string, unknown>> | null;
    COMBOS_NOMBRES = (combos || []).map(c => String(c.name || "")).filter(Boolean);
    COMBOS_SEDE = branchId;
  } catch (err) {
    console.error("[combo] no se pudieron cargar:", err);
  }
}

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

  /* ══ LOS COMBOS EXISTEN (19-ago, hallado en las pruebas) ══════════════════
     A "¿tienen combos?" Paco contestaba **"no manejamos combos"** — y el
     restaurante tiene dos activos, que se venden por la pagina de clientes y
     por el POS. Negar un producto que si existe es peor que no saberlo: el
     cliente se va convencido de que no lo hay.

     Paco todavia NO sabe armar un combo (son varios platos en una linea, con
     su propio precio y su propio descuento del inventario), asi que aqui solo
     se le dice que existen y cuanto valen. Cuando alguien pida uno, el bloque
     de pedir combo lo pasa a una persona: se vende, pero lo cierra alguien que
     sepa. Armarlo entero queda pendiente. */
  try {
    const combos = await sbGet(
      `/rest/v1/pos_combos?branch_id=eq.${branchId}&active=eq.true&select=name,price,description,items`
    ) as Array<Record<string, unknown>> | null;
    if (combos && combos.length) {
      lines.push(String.fromCharCode(10) + "[COMBOS]");
      for (const c of combos) {
        const dentro = (Array.isArray(c.items) ? c.items as Array<Record<string, unknown>> : [])
          .map(x => {
            const n2 = Number(x.cantidad) || 1;
            return (n2 > 1 ? n2 + "x " : "") + String(x.nombre || "");
          }).filter(Boolean).join(" + ");
        let l = `- ${String(c.name)}: ${fmtPrice(Number(c.price) || 0)}`;
        const desc = String(c.description || "") || dentro;
        if (desc) l += ` — ${desc}`;
        lines.push(l);
      }
      lines.push("(Los combos SI existen. Si el cliente pide uno, pasalo a una persona.)");
      COMBOS_NOMBRES = combos.map(c => String(c.name || "")).filter(Boolean);
    }
  } catch (err) {
    console.error("[carta] combos:", err);
  }
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
      `/rest/v1/pos_domi_aprendidos?tenant_id=eq.${tenantId}&barrio=eq.${encodeURIComponent(nombre)}&select=id,veces,descartado&limit=1`
    ) as Array<Record<string, unknown>> | null;
    /* LO QUE EL DUEÑO YA DIJO QUE NO ES UN BARRIO NO VUELVE A PROPONERSE.
       En la lista se colaban frases enteras ("Me das una personal premium
       mixta, con adicion...") porque el cliente escribio el pedido donde iba
       la direccion. Borrarlas no servia: al siguiente cliente que escribiera
       algo parecido volvian. Ahora quedan marcadas y esta puerta las ignora,
       sin contarlas siquiera. */
    if (yaVa && yaVa.length && yaVa[0].descartado === true) return;
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
      /* Lo aprendio el asistente atendiendo. Entra a la lista para que el dueño
         le ponga precio cuando quiera, pero NO le suena la campana: con eso se
         llenaba de avisos de cada pedido. */
      origen: "chat",
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
    if (levenshtein(a, b) > maxDist) return false;
    /* PARA NOMBRES DE UNA SOLA PALABRA la errata ademas tiene que EMPEZAR
       igual (20-ago-2026, pedido real de Fernanda): "viento" —de "Villa del
       viento", un barrio de verdad— quedaba a 1 letra del conjunto "Vivento"
       y el pedido salio con una direccion que la clienta nunca dijo. Un
       error de dedo real ("balmorral" por "Balmoral") conserva el arranque;
       dos palabras distintas casi nunca. */
    if (barWords.length === 1) return a.slice(0, 3) === b.slice(0, 3);
    return true;
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

/* ══ BILLETERA Y PUNTOS EN EL CHAT (20-ago-2026, pedido de Sergio) ══════
   Paco cobra con la Billetera (mismo camino que la caja: codigo por SMS,
   descuento con fn_saldo_mover) y responde por los puntos mandando a la app
   con un BOTON. Los ayudantes viven aqui juntos. */
async function sha256DR(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sbRpcDR(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) { console.error(`[rpc ${fn}]`, (await r.text()).slice(0, 200)); return null; }
  return await r.json().catch(() => null);
}
async function marcaDeDR(branchId: string): Promise<string> {
  const b = await sbGet(`/rest/v1/branches?id=eq.${branchId}&select=name,brands(name)`);
  const mk = b?.[0]?.brands as { name?: string } | Array<{ name?: string }> | null;
  return String((Array.isArray(mk) ? mk[0]?.name : mk?.name) || b?.[0]?.name || "el restaurante");
}
async function urlAppDR(tenantId: string): Promise<string | null> {
  const t = await sbGet(`/rest/v1/tenants?id=eq.${tenantId}&select=slug,web_activa`);
  const slug = String(t?.[0]?.slug || "").trim();
  if (!slug || t?.[0]?.web_activa === false) return null;
  return `https://cobrapos.app/${slug}/`;
}
/* La ficha del cliente por su telefono (ultimos 10), y si tiene cuenta en la
   app (pos_web_credenciales). La identidad es el numero que escribe. */
async function clienteBilleteraDR(tenantId: string, tel10: string): Promise<{ id: string; registrado: boolean } | null> {
  const filas = await sbGet(`/rest/v1/pos_clientes?tenant_id=eq.${tenantId}&telefono=like.*${tel10}&select=id,telefono&limit=5`);
  const c = (filas || []).find((x) => String(x.telefono || "").replace(/\D/g, "").slice(-10) === tel10);
  if (!c) return null;
  const cred = await sbGet(`/rest/v1/pos_web_credenciales?cliente_id=eq.${c.id}&select=cliente_id&limit=1`);
  return { id: String(c.id), registrado: !!(cred && cred.length) };
}
/* El codigo de pago por SMS — mismo canal y misma tabla que la caja
   (pos_web_codigos, motivo 'pago'): un solo libro de codigos, mismos topes. */
async function enviarCodigoPagoDR(tenantId: string, tel10: string, monto: number, marca: string): Promise<boolean> {
  const desdeHora = new Date(Date.now() - 3600000).toISOString();
  const ult = await sbGet(`/rest/v1/pos_web_codigos?tenant_id=eq.${tenantId}&telefono=eq.${tel10}&created_at=gte.${desdeHora}&select=id`);
  if ((ult?.length || 0) >= 3) return false;
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const fila = await fetch(`${SUPABASE_URL}/rest/v1/pos_web_codigos`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify({
      tenant_id: tenantId, telefono: tel10,
      codigo_hash: await sha256DR(codigo + "|" + tel10),
      motivo: "pago", expira_at: new Date(Date.now() + 10 * 60000).toISOString(),
    }),
  });
  if (!fila.ok) return false;
  const sid = Deno.env.get("TWILIO_SID") || "", tok = Deno.env.get("TWILIO_TOKEN") || "", desde = Deno.env.get("TWILIO_FROM") || "";
  if (!sid || !tok || !desde) return false;
  // Sin tildes: un SMS con acentos se parte y se cobra doble.
  const texto = codigo + " es tu codigo para pagar $ " + Math.round(monto).toLocaleString("es-CO") + " en " + marca
    + ". Vence en 10 minutos. No se lo compartas a nadie.";
  const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
    method: "POST",
    headers: { "Authorization": "Basic " + btoa(sid + ":" + tok), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: "+57" + tel10, From: desde, Body: texto }).toString(),
  });
  if (!r.ok) { console.error("[billetera] SMS:", (await r.text()).slice(0, 200)); return false; }
  return true;
}
/* Mensaje con BOTON que abre la app (pedido de Sergio: boton, no enlace
   pelado). Si Meta rechaza el interactivo, cae a texto con el enlace. */
async function sendWaBotonApp(
  convId: string, tenantId: string, texto: string, botonTexto: string, url: string,
  fromPhone: string, phoneId: string, accessToken: string,
): Promise<void> {
  const cuerpo = conEtiqueta(texto);
  const r = await enviarAMeta(convId, phoneId, accessToken, {
      messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: cuerpo },
        action: { name: "cta_url", parameters: { display_text: botonTexto.slice(0, 20), url } },
      },
    });
  if (r.ok) {
    const d = await r.json() as Record<string, unknown>;
    const sentId = ((d.messages as Array<Record<string, unknown>>)?.[0]?.id as string) || "";
    await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", origen: "bot", body: cuerpo + "\n\n[" + botonTexto + "] " + url, delivery_status: "sent", external_id: sentId || null, sent_at: new Date().toISOString() });
  } else {
    console.error("[boton app] Meta:", (await r.text()).slice(0, 200));
    await sendWaAndSave(convId, tenantId, texto + "\n\n👉 " + url, fromPhone, phoneId, accessToken);
  }
}

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
