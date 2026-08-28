// gerente-inventario — Inventario por WhatsApp para números de gerente.
// Recibe un mensaje en lenguaje natural ("hay 3 kilos de carne", "compré 2 pacas
// de gaseosa a 30 mil") y actualiza iv_insumos: 'set' (dejar el total en X) o
// 'add' (reponer/comprar, suma stock y actualiza precio). También responde
// consultas ("¿cómo está el pollo?", "¿qué falta?").
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_KEY") || "";
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
/* ⚠️ `iv_existencias` nacio SIN permisos para service_role: el SELECT devolvia
   403 y esta funcion contestaba "no encuentro insumos" para siempre. Es la
   misma trampa de las recargas: una tabla creada por la API de gestion no le
   da permiso a nadie sola. Si algun dia se crea otra tabla que el servidor
   deba leer, hay que hacerle GRANT y `notify pgrst, 'reload schema'`. */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };

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

/* `devolver` pide la fila creada de vuelta: al abrir un turno hace falta su id
   para colgarle las lineas. */
async function sbPost(path: string, body: unknown, devolver = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, Prefer: devolver ? "return=representation" : "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!devolver) return r;
  try { return await r.json(); } catch { return null; }
}
function num(v: unknown) { return Number(v) || 0; }

/* Guardar existencias va por la MISMA puerta que usa la pantalla
   (`fn_iv_fijar_existencia`) y no por un update directo: la fila de la sede
   puede no existir todavia, y la RPC la crea. Lo que va en null no se toca. */
async function fijarExistencia(
  insumoId: string, sede: string | null,
  campos: { stock?: number; servicio?: number; agotado?: boolean },
): Promise<void> {
  await sbPost(`/rpc/fn_iv_fijar_existencia`, {
    p_insumo:   insumoId,
    p_branch:   sede,
    p_stock:    campos.stock    === undefined ? null : campos.stock,
    p_servicio: campos.servicio === undefined ? null : campos.servicio,
    p_agotado:  campos.agotado  === undefined ? null : campos.agotado,
  });
}
/*  DE QUE BOLSA SALE EL STOCK: la comun de la marca (modo `global`, con la
    sede en blanco) o la de esta sucursal. Ya se calculaba mas abajo, pero los
    botones contestan ANTES de llegar ahi — y con la sede equivocada
    escribirian en una bolsa que nadie mira.                                */
async function sedeDeExistencia(branchId: string): Promise<string | null> {
  try {
    const br = (await sbGet(`/branches?id=eq.${branchId}&select=brand_id,brands(inventario_modo)`) as Array<Record<string, unknown>> | null) || [];
    const mk = br[0]?.brands as { inventario_modo?: string } | Array<{ inventario_modo?: string }> | null;
    const modo = (Array.isArray(mk) ? mk[0]?.inventario_modo : mk?.inventario_modo) || "global";
    return modo === "sucursal" ? branchId : null;
  } catch { return null; }
}

function fmtNum(n: number) {
  // hasta 3 decimales, sin ceros sobrantes
  return (Math.round(n * 1000) / 1000).toString();
}

interface Insumo {
  id: string; nombre: string; buy_unit: string; use_unit: string;
  conversion: number; stock: number; precio: number; manual: boolean;
  sub: boolean; servicio: number; min: number; agotadoManual: boolean;
  /* Como le dice la gente ademas de su nombre. Salen de `iv_insumo_alias`, que
     ya se alimenta con las facturas del proveedor: "MANGUERA SEVILLA ROLLO" es
     la Salchicha y "MAIZ CONGELADO KILO" son los Maicitos. Sin esto el gerente
     escribe "maiz" o "salchicha manguera" y la linea se pierde en silencio. */
  alias: string[];
}
interface Op {
  insumo_id: string; accion: "set" | "add" | "agotado" | "disponible" | "surtir" | "precio";
  cantidad_buy_unit: number; precio_buy_unit?: number | null; texto: string;
  // A cuál de los dos niveles se refiere. Antes no existía y "hay 5 en servicio"
  // terminaba cambiando la BODEGA, que es justo lo contrario de lo que se pidió.
  destino?: "bodega" | "servicio" | null;
  // La unidad y el número TAL COMO los dijo el gerente. Sin esto había que
  // responder en unidad de compra y salían cosas como "0.833 paq".
  unidad_dicha?: string | null;
  cantidad_dicha?: number | null;
}

/* Cuando un insumo viene en paquetes (1 paq = 12 unidades), la gente cuenta
   UNIDADES, no fracciones de paquete. "0.417 paq" no se entiende; "5 unidades"
   sí. Estas funciones existen para que el bot hable como habla el gerente. */
function plural(n: number, u: string): string {
  const s = (u || "").trim();
  if (Math.abs(n) === 1) return s;
  if (/unidad$/i.test(s)) return s.replace(/unidad$/i, "unidades");
  if (/paquete$/i.test(s)) return s.replace(/paquete$/i, "paquetes");
  return s;   // kg, g, ml, paq… no se pluralizan
}
/* Redondea para que no salga "5.004 unidades" por el redondeo del stock. */
function fmtUso(n: number): string {
  const r = Math.round(n);
  if (Math.abs(n - r) < 0.08) return String(r);
  return (Math.round(n * 10) / 10).toString();
}
/* Lo que hay, en la unidad natural: si viene en paquetes se dicen primero las
   unidades y el paquete queda entre paréntesis. */
function decir(cantBuy: number, ins: Insumo): string {
  if (ins.conversion > 1) {
    const u = cantBuy * ins.conversion;
    return `${fmtUso(u)} ${plural(u, ins.use_unit)} (${fmtNum(Math.round(cantBuy * 100) / 100)} ${ins.buy_unit})`;
  }
  return `${fmtNum(cantBuy)} ${plural(cantBuy, ins.buy_unit)}`;
}

/* Una cantidad, dicha en la unidad que usó el gerente. */
function fmtCant(cantBuy: number, ins: Insumo, unidadDicha?: string | null, _cantDicha?: number | null): string {
  const u = (unidadDicha || "").toLowerCase().trim();
  // Si habló en la unidad de COMPRA (paquetes, bultos, pacas), se le responde así.
  if (u && (u === ins.buy_unit.toLowerCase() || u.startsWith("paq") || u.startsWith("bulto") || u.startsWith("paca") || u.startsWith("caja"))) {
    return `${fmtNum(Math.round(cantBuy * 100) / 100)} ${plural(cantBuy, ins.buy_unit)}`;
  }
  // En cualquier otro caso, la unidad natural.
  return decir(cantBuy, ins);
}

/* Lo que hay de un insumo, dicho de forma entendible. */
function fmtExistencia(ins: Insumo): string {
  const total = ins.sub ? ins.stock + ins.servicio : ins.stock;
  if (ins.sub) {
    return `*${decir(total, ins)}*\n   🧊 en servicio: ${decir(ins.servicio, ins)}\n   📦 en bodega: ${decir(ins.stock, ins)}`;
  }
  return `*${decir(total, ins)}*`;
}

// Parte los mensajes largos en pedazos. Cuando el gerente manda la lista
// completa de bebidas ("6 Quatro en bodega, 3 en servicio" x14) eso son 28
// operaciones: al modelo se le acababa el cupo de respuesta a la mitad, el
// JSON quedaba partido y el bot contestaba "No te entendi" sin haber hecho
// nada. Ahora cada pedazo se interpreta por separado y se suman los cambios.
function trocear(mensaje: string): string[] {
  const lineas = mensaje.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lineas.length <= 3) return [mensaje];
  // UNA linea por pedazo. Con varias lineas juntas el modelo mezclaba los
  // numeros entre productos de nombre parecido ("Hit Litro Naranja Pina ...
  // 4 en servicio" quedo en 5, que era el numero del "Hit Litro Lulo" de la
  // linea siguiente). Separadas no hay con que confundirse.
  return lineas;
}

// Los insumos que se parecen a lo que dice esta linea. Mandarle al modelo
// el inventario entero en cada linea reventaba el cupo por minuto de OpenAI
// y las llamadas rebotaban sin que nadie se enterara.
function candidatos(linea: string, insumos: Insumo[]): Insumo[] {
  const limpio = (s: string) => s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/ +/g, " ").trim();
  const palabras = limpio(linea).split(" ").filter((w) => w.length >= 3 && !/^[0-9]+$/.test(w));
  if (!palabras.length) return insumos;
  const puntuado = insumos.map((i) => {
    const nom = limpio(i.nombre);
    const suyas = nom.split(" ");
    let pts = 0;
    for (const w of palabras) {
      if (suyas.indexOf(w) >= 0) pts += 2;
      else if (nom.indexOf(w) >= 0) pts += 1;
    }
    /* Los alias puntuan igual que el nombre: es como lo llama el gerente. */
    for (const a of (i.alias || [])) {
      const al = limpio(a);
      const alp = al.split(" ");
      for (const w of palabras) {
        if (alp.indexOf(w) >= 0) pts += 2;
        else if (al.indexOf(w) >= 0) pts += 1;
      }
    }
    return { i, pts };
  }).filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  // Sin ningun parecido no se adivina: se manda todo y que el modelo decida.
  if (!puntuado.length) return insumos;
  return puntuado.slice(0, 15).map((x) => x.i);
}

/* EL INSUMO ELEGIDO TIENE QUE CUADRAR CON LO QUE DIJO (22-ago-2026).

   Sergio escribio "Compre 0.5 paquete hit litro mango" y el modelo devolvio
   el id de "Hit Litro Mora": medio paquete entro al sabor equivocado. Con
   quince nombres que solo se diferencian en la ultima palabra —Mango, Mora,
   Lulo, Naranja Piña— y un id largo que hay que copiar exacto, ese error era
   cuestion de tiempo.

   Aqui NO se adivina: solo se corrige cuando la linea nombra COMPLETO a un
   solo insumo. "hit litro mango" nombra entero a "Hit Litro Mango" y a
   ningun otro (a "Hit Litro Mora" le falta "mora" en el texto), asi que el
   elegido se corrige. En cambio "compre 2 paquetes de coca cola" no nombra
   entero a ninguno —falta "personal" o "1.5 litros"— y ahi se respeta lo que
   dijo el modelo, que para eso entiende.

   El modelo entiende la intencion; el codigo comprueba que el nombre cuadre. */
function corregirInsumoPorNombre(linea: string, ops: Op[], insumos: Insumo[]): void {
  const limpio = (s: string) => s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/ +/g, " ").trim();
  const dichas = new Set(limpio(linea).split(" ").filter(Boolean));
  if (!dichas.size) return;

  /* Nombrado COMPLETO = todas las palabras de su nombre (de 3 letras o mas)
     estan en la linea. Los alias cuentan igual: es como lo llama el gerente. */
  const nombradoCompleto = (i: Insumo): boolean => {
    const juegos = [i.nombre, ...(i.alias || [])];
    return juegos.some((n) => {
      const ws = limpio(n).split(" ").filter((w) => w.length >= 3);
      return ws.length > 0 && ws.every((w) => dichas.has(w));
    });
  };
  const completos = insumos.filter(nombradoCompleto);
  if (completos.length !== 1) return;   // ninguno o varios: no se toca

  const bueno = completos[0];
  for (const op of ops) {
    if (!op.insumo_id || op.insumo_id === bueno.id) continue;
    const eligio = insumos.find((i) => i.id === op.insumo_id);
    /* Si lo que eligio TAMBIEN esta nombrado completo, no hay nada que
       corregir (no deberia pasar: completos.length seria 2). */
    if (eligio && nombradoCompleto(eligio)) continue;
    console.log(`[gerente] la linea dice "${linea.trim()}" — se corrige ${eligio ? eligio.nombre : op.insumo_id} -> ${bueno.nombre}`);
    op.insumo_id = bueno.id;
  }
}

type Parseo = { ops: Op[]; consulta: boolean; texto: string; consulta_ids: string[]; consulta_todo: boolean; fallo: boolean; sinEntender?: string[] };

async function parseConGPT(mensaje: string, insumos: Insumo[]): Promise<Parseo> {
  const trozos = trocear(mensaje);
  if (trozos.length === 1) {
    const uno = await parseUnTrozo(mensaje, insumos);
    corregirInsumoPorNombre(mensaje, uno.ops, insumos);
    return uno;
  }

  // Linea a linea se usa gpt-4o-mini: la tarea ya es minima (UNA linea y
  // como mucho 15 insumos candidatos) y el cupo por minuto de gpt-4o (30.000
  // tokens) no aguanta 15 llamadas seguidas — rebotaban y las lineas se
  // perdian. Los mensajes normales, de una sola frase, siguen con gpt-4o.
  // En tandas, para no disparar 20 llamadas de golpe contra OpenAI.
  const partes: Parseo[] = [];
  const POR_TANDA = 8;
  for (let i = 0; i < trozos.length; i += POR_TANDA) {
    const tanda = await Promise.all(trozos.slice(i, i + POR_TANDA).map(async (t) => {
      const pr = await parseUnTrozo(t, candidatos(t, insumos), 0, "gpt-4o-mini");
      /* Se revisa contra la carta ENTERA, no solo contra los candidatos: el
         bueno podria haber quedado fuera de los quince. */
      corregirInsumoPorNombre(t, pr.ops, insumos);
      return pr;
    }));
    partes.push(...tanda);
  }
  const ops: Op[] = [];
  const consulta_ids: string[] = [];
  const textos: string[] = [];
  const sinEntender: string[] = [];
  let consulta = false, consulta_todo = false, fallo = false;
  // Solo se avisa de lineas que de verdad parecen de inventario (llevan un
  // numero). El "Actualiza asi:" del encabezado no es una linea fallida.
  partes.forEach((pr, idx) => {
    if (pr.ops.length || pr.consulta) return;
    if (!/[0-9]/.test(trozos[idx])) return;
    sinEntender.push(trozos[idx]);
  });
  for (const pr of partes) {
    ops.push(...pr.ops);
    consulta_ids.push(...pr.consulta_ids);
    if (pr.consulta) consulta = true;
    if (pr.consulta_todo) consulta_todo = true;
    if (pr.fallo) fallo = true;
    if (pr.texto) textos.push(pr.texto);
  }
  // Si algun pedazo trajo cambios, el mensaje era una actualizacion completa:
  // no se responde como consulta aunque un pedazo suelto lo pareciera.
  if (ops.length) { consulta = false; consulta_todo = false; }
  return { ops, consulta, texto: textos.join(" "), consulta_ids, consulta_todo, fallo, sinEntender };
}

async function parseUnTrozo(mensaje: string, insumos: Insumo[], intento = 0, modelo = "gpt-4o"): Promise<Parseo> {
  const lista = insumos.map((i) =>
    `- id:${i.id} | "${i.nombre}"${i.alias?.length ? ` (tambien se le dice: ${i.alias.join(", ")})` : ""} | compra en: ${i.buy_unit} | 1 ${i.buy_unit} = ${fmtNum(i.conversion)} ${i.use_unit} | stock actual: ${fmtNum(i.stock)} ${i.buy_unit} | precio: ${fmtNum(i.precio)} por ${i.buy_unit}${i.manual ? " | CONTROL MANUAL (se marca disponible/agotado a mano, no por cantidad)" : ""}${i.sub ? ` | SUB-INVENTARIO (bodega:${fmtNum(i.stock)} / en servicio-nevera:${fmtNum(i.servicio)}). Se puede SURTIR (pasar de bodega a servicio/nevera)` : ""}`
  ).join("\n");

  const prompt = `Eres el asistente de inventario de un restaurante. El GERENTE te escribe por WhatsApp para actualizar o consultar el inventario. Debes devolver SOLO un JSON.

INSUMOS DISPONIBLES (usa el id EXACTO):
${lista}

REGLAS:
1. "hay / tengo / quedan / hay total de X [cantidad+unidad]" = accion "set" (DEJAR el stock en esa cantidad). SIEMPRE lleva una cantidad.
2. "compré / repuse / llegaron / metí X [cantidad]" = accion "add" (SUMAR al stock; compra/reposición). Si menciona precio, inclúyelo.
   ⚠️ CRÍTICO en "add": en cantidad_buy_unit va SOLO LO QUE COMPRÓ, NUNCA el total resultante. El sistema ya suma solo.
   Ej.: tiene 3 kg y dice "compré 10 kilos" → cantidad_buy_unit = 10 (NO 13). Si pones 13 el stock quedaría en 16 y estaría MAL.
   Si el mensaje da el TOTAL que quedó ("ahora tengo 13 en total", "quedaron 13"), eso NO es "add": es "set" con 13.
3. DISPONIBILIDAD (SOLO para insumos marcados "CONTROL MANUAL", y SOLO cuando NO se menciona una cantidad):
   - "se acabó / no hay / se terminó / ya no hay [insumo]" = accion "agotado" (marcar como agotado). NO cambia la cantidad.
   - "ya hay / volvió / llegó [insumo] / hay [insumo] de nuevo / ya está" (SIN cantidad) = accion "disponible" (habilitar). NO cambia la cantidad.
   - Para "agotado"/"disponible" NO pongas cantidad_buy_unit (pon 0) ni precio.
   - Si el insumo NO es de control manual, NO uses agotado/disponible (usa set/add según la cantidad).
   - CLAVE: si hay un número/cantidad ("hay 3 kilos de carne", "compré 5 pollos") es SIEMPRE set/add, NUNCA disponibilidad. Solo es disponibilidad cuando el mensaje es puramente "se acabó/ya hay" SIN número.
3b. SURTIR (SOLO para insumos marcados "SUB-INVENTARIO"): "pasa / pon / mete / surte / saca / lleva [cantidad] de [insumo] a la nevera / a servicio / al frío / a la vitrina / a mostrador" = accion "surtir" (MOVER esa cantidad de bodega a servicio). Convierte la cantidad a la unidad de compra igual que en set/add. NO es una compra (no suma stock total, solo mueve). Si el insumo NO es de sub-inventario, NO uses surtir.
4b. SIN UNIDAD DICHA: si el gerente da un numero pelado ("6 Quatro 1.5 litros en bodega", "1 Hit Litro Mango"), son UNIDADES SUELTAS del producto (botellas, bolsas, porciones), NUNCA paquetes/pacas/cajas, salvo que el diga expresamente "paquete", "paca", "caja", "bulto" o "canasta". Ej.: se compra en paq de 12 y dice "1 Hit Litro Mango en bodega" -> es 1 botella -> cantidad_buy_unit = 0.0833 (NO 1). Poner 1 dejaria 12 botellas y estaria MAL.
   Excepcion: si el insumo se compra por peso o volumen (kg, g, libra, litro, ml), el numero pelado va en esa misma unidad de compra.
4. Convierte SIEMPRE la cantidad a la unidad de COMPRA del insumo (buy_unit). Ej.: compra en "kg" y dicen "500 gramos" → 0.5. Compra en "unidad" que equivale a 2500 g y dicen "5000 g" → 2.
5. El precio, si lo dan, va por unidad de COMPRA (precio_buy_unit). "a 30 mil" = 30000.
6. Empareja el insumo por nombre de forma flexible. Si NO existe un insumo parecido, NO inventes id: omítelo.
7. CONSULTAS (¿cuántas Coca Cola hay?, ¿cómo está el pollo?, ¿qué falta?): pon "consulta":true, NO pongas ops, y lista en "consulta_ids" los id de los insumos por los que pregunta.
   - Si pregunta por insumos concretos → "consulta_ids": ["id1","id2"].
   - Si pregunta en general (¿qué falta?, ¿cómo está el inventario?) → "consulta_ids": [] y "consulta_todo": true.
   - NUNCA cambies nada en una consulta.
8. DESTINO (SOLO insumos con SUB-INVENTARIO): si el mensaje dice "en servicio / en la nevera / en el frío / en la vitrina / en mostrador" → "destino":"servicio". Si dice "en bodega / en la bodega / atrás / en el depósito" → "destino":"bodega". Si no lo dice, "destino":null.
   ⚠️ CRÍTICO: "hay 5 Coca Cola en servicio" NO debe tocar la bodega. Es set con destino "servicio".
   UNA LINEA PUEDE LLEVAR LOS DOS DESTINOS: "6 Quatro 1.5 litros en bodega, 3 en servicio" son DOS operaciones del MISMO insumo: set 6 destino "bodega" Y set 3 destino "servicio". Devuelve las dos. El 0 tambien cuenta ("0 coca cola en bodega, 4 en servicio" = set 0 bodega + set 4 servicio).
   Si el gerente manda una LISTA (varias lineas o vinetas), procesa TODAS las lineas, no solo las primeras.
9. UNIDAD HABLADA: además de cantidad_buy_unit, devuelve SIEMPRE:
   - "unidad_dicha": la unidad tal como la dijo el gerente ("unidad", "unidades", "paquete", "kg", "gramos"…). Si no dijo unidad, null.
   - "cantidad_dicha": el número tal como lo dijo, en ESA unidad (sin convertir).
   Ej.: "hay 10 unidades de Coca Cola" con compra en paq de 12 → cantidad_buy_unit: 0.833, unidad_dicha: "unidad", cantidad_dicha: 10.
   Esto es solo para RESPONDER en el mismo idioma del gerente; la actualización sigue usando cantidad_buy_unit.
11. SUMAS EN LA MISMA LINEA — "2 paquetes + 11 unidades", "1 paquete (10 salchichas) + 1 unidad", "2 bultos y medio": eso es UN SOLO TOTAL del MISMO insumo, no dos operaciones. Suma las dos partes convirtiendo cada una y devuelve UNA sola op "set" con el total. Si devuelves dos, la segunda PISA a la primera y el inventario queda con lo poquito.
12. NUNCA devuelvas una cantidad negativa. Si te da negativo, es que entendiste mal: vuelve a leer la linea.
13. LINEAS CON VARIOS PRODUCTOS: "Pan (perro 10 unidades, sandwich 6, hamburguesa 3)" son TRES insumos distintos, cada uno con SU cantidad. No mezcles la cantidad de uno con otro.
14. ERRORES DE DEDO EN LAS UNIDADES: "50kh"/"50 kg"/"50 kilos" es lo mismo (kg); "gr"/"grs"/"gramos" es g; "lb"/"libras" es libra. Si el numero viene pegado a la unidad ("50kg", "1kg"), separalo.
15. "no hay" / "cero" / "se acabo" SIN cantidad = agotado. Pero "cero bodega (1 nevera)" NO es agotado: es set 0 en bodega y set 1 en servicio.
16. SOLO EL PRECIO: "actualiza el precio del galon de salsa rosada en 45000", "el maiz ahora cuesta 8900 el kilo", "subio la papa a 380 mil el bulto", "cambia el precio de la tocineta a 32000" = accion "precio". NO toca la cantidad: cantidad_buy_unit va en 0 y el valor va en precio_buy_unit. En "unidad_dicha" pon la unidad a la que se refiere el precio ("galon", "kilo", "bulto", "paquete"); si no la dijo, null. "a 45 mil" = 45000, "a 380 mil" = 380000.
10. Si no entiendes nada de inventario, devuelve ops vacío y consulta false.

Formato EXACTO:
{
  "ops": [ { "insumo_id": "...", "accion": "set"|"add"|"agotado"|"disponible"|"surtir", "cantidad_buy_unit": number, "precio_buy_unit": number|null, "destino": "bodega"|"servicio"|null, "unidad_dicha": string|null, "cantidad_dicha": number|null, "texto": "resumen humano" } ],
  "consulta": false,
  "consulta_ids": [],
  "consulta_todo": false,
  "texto": ""
}

Mensaje del gerente: """${mensaje}"""
Responde SOLO el JSON.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // 900 no alcanzaba ni para 12 operaciones: la lista de bebidas
        // salia cortada a la mitad y el JSON no se podia leer.
        model: modelo, temperature: 0, max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (res.status === 429) {
      // Cupo por minuto agotado. Se espera lo que pide OpenAI y se reintenta
      // una vez: perder la linea en silencio es peor que tardar 8 segundos.
      if (intento === 0) {
        console.error("GPT 429, reintentando en 8s");
        await new Promise((r) => setTimeout(r, 8000));
        return await parseUnTrozo(mensaje, insumos, 1, modelo);
      }
      console.error("GPT 429 tambien en el reintento");
      return { ops: [], consulta: false, texto: "", consulta_ids: [], consulta_todo: false, fallo: true };
    }
    if (!res.ok) { console.error("GPT error:", await res.text()); return { ops: [], consulta: false, texto: "", consulta_ids: [], consulta_todo: false, fallo: true }; }
    const data = await res.json() as Record<string, unknown>;
    const choice = ((data.choices as Array<Record<string, unknown>>) || [])[0] || {};
    const raw = ((choice.message as Record<string, unknown>)?.content as string || "{}");
    // "length" = al modelo se le acabo el cupo y el JSON viene partido. Se
    // marca como fallo para poder pedirle al gerente que reenvie por partes,
    // en vez del enganoso "no te entendi".
    const cortado = String(choice.finish_reason || "") === "length";
    if (cortado) console.error("parseUnTrozo: respuesta cortada por max_tokens");
    const parsed = JSON.parse(raw);
    return {
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
      consulta: !!parsed.consulta,
      texto: String(parsed.texto || ""),
      consulta_ids: Array.isArray(parsed.consulta_ids) ? parsed.consulta_ids : [],
      consulta_todo: !!parsed.consulta_todo,
      fallo: cortado,
    };
  } catch (e) {
    console.error("parseUnTrozo:", e);
    return { ops: [], consulta: false, texto: "", consulta_ids: [], consulta_todo: false, fallo: true };
  }
}

// Deja rastro de cada cambio hecho por WhatsApp: qué se escribió, qué entendió
// el bot, de cuánto partió y en cuánto quedó. Sin esto, cuando un número sale
// mal no hay forma de saber si falló la interpretación o la cuenta.
// Nunca interrumpe la operación: si falla el registro, el inventario igual se
// actualiza.
async function auditar(
  branch_id: string, telefono: string, mensaje: string,
  ins: { id: string; nombre: string; buy_unit: string },
  accion: string, cantidad: number | null, antes: number, despues: number,
) {
  try {
    await sbPost(`/pos_gerente_ops`, {
      branch_id, telefono, mensaje,
      insumo_id: ins.id, insumo: ins.nombre, accion,
      cantidad, stock_antes: antes, stock_despues: despues, unidad: ins.buy_unit,
    });
  } catch (_e) { /* el registro nunca bloquea */ }
}


/* ── LA CUENTA LA HACE EL CODIGO, NO EL MODELO ───────────────────────────────
   El modelo entiende de maravilla QUE dijo el gerente ("50 kg de papa", "13
   unidades de jamon") pero se equivoca CONVIRTIENDO: la papa se compra por
   bulto de 43.000 g y saco 0,12 bultos en vez de 1,16; el jamon viene en
   paquete de 90 y saco 1,43 paquetes en vez de 0,14. Son errores de aritmetica
   con numeros raros, y esos no se arreglan con mas instrucciones.

   Por eso el prompt ya pide "unidad_dicha" y "cantidad_dicha": lo que el
   gerente dijo, TAL CUAL, sin convertir. Con eso la conversion se hace aqui,
   que siempre da lo mismo. Si la unidad no se reconoce, se respeta lo que
   calculo el modelo — nunca se queda peor que antes. */
function limpiarUnidad(u: string): string {
  return String(u || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/ +/g, " ").trim()
    .replace(/s$/, "");
}
/* Solo las unidades de medida universales. "libra", "arroba" o "paca" no
   entran: cada negocio les da su propio peso y adivinarlo cobraria mal. */
const A_GRAMOS: Record<string, number> = { kilo: 1000, kilogramo: 1000, kg: 1000, gramo: 1, gr: 1, g: 1 };
const A_MILILITROS: Record<string, number> = { litro: 1000, lt: 1000, l: 1000, mililitro: 1, ml: 1, cc: 1 };

function convertirDicho(
  cantidadDicha: number, unidadDicha: string, ins: Insumo,
): number | null {
  const u = limpiarUnidad(unidadDicha);
  if (!u || !isFinite(cantidadDicha)) return null;
  const buy = limpiarUnidad(ins.buy_unit);
  const use = limpiarUnidad(ins.use_unit);
  const conv = ins.conversion > 0 ? ins.conversion : 1;

  /* 1. Lo dijo en la unidad de COMPRA: se usa tal cual. */
  if (u === buy) return cantidadDicha;
  /* 2. Lo dijo en la unidad de USO: se divide por lo que trae cada compra. */
  if (u === use) return cantidadDicha / conv;
  /* 3. Peso o volumen: se pasa a la unidad de uso y despues a la de compra. */
  const gDicho = A_GRAMOS[u], gUso = A_GRAMOS[use], gCompra = A_GRAMOS[buy];
  if (gDicho && gUso) return (cantidadDicha * gDicho) / gUso / conv;
  if (gDicho && gCompra) return (cantidadDicha * gDicho) / gCompra;
  const mDicho = A_MILILITROS[u], mUso = A_MILILITROS[use], mCompra = A_MILILITROS[buy];
  if (mDicho && mUso) return (cantidadDicha * mDicho) / mUso / conv;
  if (mDicho && mCompra) return (cantidadDicha * mDicho) / mCompra;
  /* 4. "unidad" cuando el insumo se usa por unidad aunque se llame distinto. */
  if ((u === "unidad" || u === "und" || u === "u") && use === "unidad") return cantidadDicha / conv;
  return null;
}

/* Rehace la cuenta de cada operacion antes de aplicarla. */
function recalcular(ops: Op[], byId: Record<string, Insumo>): void {
  for (const op of ops) {
    const ins = byId[op.insumo_id];
    if (!ins) continue;
    if (op.accion === "agotado" || op.accion === "disponible" || op.accion === "precio") continue;
    const dicha = Number(op.cantidad_dicha);
    if (!op.unidad_dicha || !isFinite(dicha)) continue;
    const bien = convertirDicho(dicha, String(op.unidad_dicha), ins);
    if (bien === null || !isFinite(bien) || bien < 0) continue;
    const antes = Number(op.cantidad_buy_unit);
    /* Solo se avisa cuando de verdad cambia algo (mas de un 2%). */
    if (Math.abs(antes - bien) > Math.max(0.0001, Math.abs(bien) * 0.02)) {
      console.log(`[cuenta] ${ins.nombre}: el modelo dijo ${antes} ${ins.buy_unit}, la cuenta da ${bien} (dijo ${dicha} ${op.unidad_dicha})`);
    }
    op.cantidad_buy_unit = bien;
  }
}


/* ── TURNO DE CONSUMO ────────────────────────────────────────────────────────
   Idea de Sergio (18-ago): hay insumos que la receta no controla porque manda
   la mano de quien sirve — el maiz, el ripio, las salsas. Se abre turno
   diciendo con cuanto se empieza y se cierra diciendo con cuanto se termina;
   con eso el sistema despeja lo que DE VERDAD se gasto y recomienda la porcion
   real de cada producto y cada presentacion (una familiar no es una personal).

   Se aprovecha el mismo lector del inventario: entiende igual "maiz 3.5 kg" en
   un turno que en una actualizacion, y la conversion la sigue haciendo el
   codigo. Lo unico que cambia es DONDE se guarda el numero. */
const TURNO_ABRIR = new RegExp("(abro|abrir|abre|iniciar|inicio de|empiezo|empezamos|arranco)" + String.fromCharCode(92) + "s+(el" + String.fromCharCode(92) + "s+)?turno", "i");
const TURNO_CERRAR = new RegExp("(cierro|cerrar|cierra|terminar|termino|terminamos|finalizo|acabo)" + String.fromCharCode(92) + "s+(el" + String.fromCharCode(92) + "s+)?turno", "i");
const TURNO_APLICAR = new RegExp("^" + String.fromCharCode(92) + "s*(aplica|aplicar|aplique|cambia|actualiza)" + String.fromCharCode(92) + "b", "i");
const TURNO_NO = new RegExp("^\\s*(no|nada|dejalo|dejala|dejalas|asi esta bien|asi\\s+esta\\s+bien|no\\s+apliques|ninguna)\\s*[.!]*\\s*$", "i");

function fmtPorcion(n: number): string {
  const r = Math.round(n * 10) / 10;
  return String(r % 1 === 0 ? Math.round(r) : r);
}

/* El texto que recibe el gerente al cerrar. Es la pieza que de verdad usa: si
   no se entiende de una leida, el turno no sirve para nada. */
function textoAnalisis(an: Record<string, unknown>): string {
  const NL = String.fromCharCode(10);
  const insumos = (an.insumos as Array<Record<string, unknown>>) || [];
  if (!insumos.length) return "Cerre el turno, pero no habia insumos con conteo de inicio y fin.";
  const partes: string[] = ["📋 *Turno cerrado*"];
  let hayReco = false;
  for (const i of insumos) {
    const factor = i.factor === null || i.factor === undefined ? null : Number(i.factor);
    const realU = Number(i.real_uso), teoU = Number(i.teorico_uso);
    const uso = String(i.unidad_uso || "");
    partes.push("");
    partes.push(`*${i.insumo}* — gastaste ${fmtPorcion(realU)} ${uso}, las recetas decian ${fmtPorcion(teoU)} ${uso}`);
    if (factor === null) {
      partes.push("   (no se vendio nada que lo lleve, no puedo comparar)");
      continue;
    }
    const pct = Math.round(Math.abs(factor - 1) * 100);
    if (!i.confiable) {
      const razon = Number(i.platos) < 10
        ? `solo ${i.platos} platos, muy poquito para opinar`
        : `la diferencia es de ${pct}%, muy chica para distinguirla de la bascula`;
      partes.push(`   Diferencia del ${pct}% (${razon}). No cambio nada.`);
      continue;
    }
    hayReco = true;
    const verbo = factor > 1 ? "de mas" : "de menos";
    partes.push(`   Se sirvio *${factor.toFixed(2)}x* la receta (${pct}% ${verbo}), en ${i.platos} platos.`);
    partes.push("   Te recomiendo:");
    for (const r of ((i.recetas as Array<Record<string, unknown>>) || [])) {
      if (r.porcion_reco === null || r.porcion_reco === undefined) continue;
      const nom = String(r.producto) + (r.presentacion === "unica" ? "" : ` ${r.presentacion}`);
      partes.push(`   • ${nom}: ${fmtPorcion(Number(r.porcion_hoy))} → *${fmtPorcion(Number(r.porcion_reco))} ${uso}*  (${r.unidades} vendidas)`);
    }
  }
  if (hayReco) {
    partes.push("");
    partes.push("⚠️ Esto reparte la diferencia pareja entre todos. Con mas turnos te puedo decir CUAL se va y cual no.");
    partes.push("Responde *aplica* para cambiar todas las porciones, *aplica <palabra>* para solo las que la lleven (ej. “aplica familiar”), o *no* para dejarlas como estan.");
  }
  return partes.join(NL);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const branch_id = body.branch_id;
    const mensaje = String(body.message || body.mensaje || "").trim();
    const telGerente = String(body.phone || "");
    /* MODO SIMULACION: entiende el mensaje y dice que HARIA, sin tocar nada.
       Sirve para probar una lista larga antes de aplicarla de verdad — que es
       justo lo que hace falta cuando el gerente cuenta todo el inventario. */
    const simular = body.simular === true || body.dry === true;
    /*  El boton que se toco. No lo escribe una persona, asi que no hay que
        interpretarlo — que es donde se equivoca todo lo demas.           */
    const accion = String(body.accion || "").trim();
    if (!branch_id || (!mensaje && !accion)) return json({ error: "branch_id y message requeridos" }, 400);

    /*  ══ ARREGLAR UN INSUMO A TOQUES ═══════════════════════════

        Sergio, 28-ago-2026. La respuesta de «¿que falta?» era una lista para
        leer: para arreglar algo habia que volver a escribirlo entero, con el
        nombre exacto. Ahora la lista se toca.

        Va arriba del todo y sin pasar por el modelo: un boton ya dice
        exactamente que se quiere. Preguntarle a la IA que significa «Se
        acabo» cuando el boton se llama `inv_cero_<id>` seria pagar por
        adivinar algo que ya sabemos.                                       */
    if (accion.startsWith("inv_")) {
      const sede = await sedeDeExistencia(branch_id);
      const insId = accion.replace(/^inv_(ins|cero|cant)_/, "");
      const iR = (await sbGet(`/iv_insumos?id=eq.${insId}&select=id,nombre,buy_unit,use_unit,conversion,control_manual,sub_inventario,iv_existencias(branch_id,stock,stock_servicio,agotado_manual)`) as Array<Record<string, unknown>> | null) || [];
      const ins = iR[0];
      if (!ins) return json({ reply: "Ese insumo ya no está en el inventario 🤔." });
      const filas = (ins.iv_existencias as Array<Record<string, unknown>>) || [];
      const ex = filas.find((e) => ((e.branch_id as string | null) || null) === sede) || {};
      const nombre = String(ins.nombre);
      const unidad = String(ins.buy_unit || "");

      if (accion.startsWith("inv_ins_")) {
        const hay = num(ex.stock) + (ins.sub_inventario ? num(ex.stock_servicio) : 0);
        return json({
          reply: `*${nombre}* — ahora hay ${fmtNum(hay)} ${unidad}.

¿Qué hago?`,
          botones: { tipo: "botones", opciones: [
            { id: `inv_cero_${insId}`, titulo: "Se acabó" },
            { id: `inv_cant_${insId}`, titulo: "Poner cantidad" },
          ] },
        });
      }

      if (accion.startsWith("inv_cero_")) {
        /*  «Se acabo» quiere decir cosas distintas segun el insumo: el que se
            lleva a mano solo se MARCA agotado (su cantidad nunca fue de fiar),
            y el que se cuenta se pone en cero de verdad. Tratarlos igual
            dejaria el pollo en cero cuando lo unico cierto es que se acabo. */
        if (ins.control_manual) await fijarExistencia(insId, sede, { agotado: true });
        else await fijarExistencia(insId, sede, { stock: 0, ...(ins.sub_inventario ? { servicio: 0 } : {}) });
        await sbPost(`/pos_gerente_ops`, {
          branch_id, telefono: telGerente, mensaje: "[botón] se acabó",
          insumo_id: insId, insumo: nombre, accion: "set",
          cantidad: 0, stock_antes: num(ex.stock), stock_despues: 0, unidad,
        });
        return json({ reply: `✓ *${nombre}* queda como agotado. Cuando llegue, dime _“hay 3 ${unidad} de ${nombre.toLowerCase()}”_.` });
      }

      if (accion.startsWith("inv_cant_")) {
        /*  Pisa la espera anterior en vez de fallar por clave repetida. Sin
            `merge-duplicates` el insert choca con la fila que ya existe y no
            escribe nada — en silencio, con 201 y todo: el numero que llegue
            despues no encontraria a que corresponde. */
        await fetch(`${SUPABASE_URL}/rest/v1/pos_gerente_espera?on_conflict=branch_id,telefono`, {
          method: "POST",
          headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ branch_id, telefono: telGerente, dato: `cant:${insId}`, creado_at: new Date().toISOString() }),
        });
        return json({ reply: `¿Cuántos ${unidad} de *${nombre}* hay? Escríbeme solo el número.` });
      }
    }

    /*  Y el numero suelto que viene despues de haberlo preguntado. Se mira
        antes que el modelo: un «2» a secas no es una frase de inventario, y
        mandarselo a la IA solo puede terminar mal.

        La espera caduca a los 10 minutos: un dato de hace una hora haciendo
        creer que se pregunto algo es peor que no tener nada.               */
    if (/^[\d.,]+$/.test(mensaje)) {
      const eR = (await sbGet(`/pos_gerente_espera?branch_id=eq.${branch_id}&telefono=eq.${encodeURIComponent(telGerente)}&select=dato,creado_at&limit=1`) as Array<Record<string, unknown>> | null) || [];
      const esp = eR[0];
      const fresca = esp && (Date.now() - new Date(String(esp.creado_at)).getTime()) < 10 * 60 * 1000;
      if (fresca && String(esp!.dato).startsWith("cant:")) {
        const insId = String(esp!.dato).slice(5);
        const cant = num(mensaje.replace(",", "."));
        const sede = await sedeDeExistencia(branch_id);
        const iR = (await sbGet(`/iv_insumos?id=eq.${insId}&select=id,nombre,buy_unit,control_manual,sub_inventario,iv_existencias(branch_id,stock)`) as Array<Record<string, unknown>> | null) || [];
        const ins = iR[0];
        await sbPatch(`/pos_gerente_espera?branch_id=eq.${branch_id}&telefono=eq.${encodeURIComponent(telGerente)}`, { dato: "" });
        if (ins && cant >= 0) {
          const filas = (ins.iv_existencias as Array<Record<string, unknown>>) || [];
          const antes = num((filas.find((e) => ((e.branch_id as string | null) || null) === sede) || {}).stock);
          await fijarExistencia(insId, sede, { stock: cant, ...(ins.control_manual ? { agotado: false } : {}) });
          await sbPost(`/pos_gerente_ops`, {
            branch_id, telefono: telGerente, mensaje: `[botón] ${mensaje}`,
            insumo_id: insId, insumo: String(ins.nombre), accion: "set",
            cantidad: cant, stock_antes: antes, stock_despues: cant, unidad: String(ins.buy_unit || ""),
          });
          return json({ reply: `✓ *${ins.nombre}*: ${fmtNum(cant)} ${ins.buy_unit || ""}` });
        }
      }
    }

    const modoAbrir  = TURNO_ABRIR.test(mensaje);
    const modoCerrar = TURNO_CERRAR.test(mensaje);

    /* RESPUESTA A LAS RECOMENDACIONES DEL ULTIMO TURNO. Va antes de todo: no
       hace falta el modelo para leer un "aplica" o un "no". */
    /* SOLO ES UNA RESPUESTA AL TURNO si parece una: corta, sin cifras y sin
       hablar de precios ni de inventario. Sin esto, "actualiza el precio del
       galon de salsa rosada en 45000" empieza por "actualiza" y se lo tragaba
       el turno — paso en la primera prueba. */
    const pareceRespuestaTurno = !modoAbrir && !modoCerrar
      && (TURNO_APLICAR.test(mensaje) || TURNO_NO.test(mensaje))
      && mensaje.trim().length <= 40
      && !/[0-9]/.test(mensaje)
      && !/precio|inventario|stock|hay|compre|compr[eé]/i.test(mensaje);
    if (pareceRespuestaTurno) {
      const ult = await sbGet(`/iv_turnos?branch_id=eq.${branch_id}&estado=eq.cerrado&order=cerrado_en.desc&limit=1&select=id,analisis,cerrado_en`) as Array<Record<string, unknown>> | null;
      const turno = ult?.[0];
      const an = turno?.analisis as Record<string, unknown> | null;
      /* Sin nada pendiente esto no era una respuesta al turno: era otra cosa
         que empezaba parecido. Se deja seguir por el camino normal. */
      if (turno && an) {
      if (TURNO_NO.test(mensaje)) {
        await sbPatch(`/iv_turnos?id=eq.${turno.id}`, { analisis: null });
        return json({ reply: "Listo, dejo las porciones como estan 👍" });
      }
      /* "aplica familiar" solo cambia las que lleven esa palabra, y
         "aplica todo menos la personal" cambia todas MENOS esas (21-ago-2026:
         asi habla el gerente, y antes esa frase no cambiaba nada y respondia
         "no encontre recomendaciones que digan menos la personal"). */
      const dicho = mensaje.replace(TURNO_APLICAR, "").trim().toLowerCase();
      const mMenos = dicho.match(new RegExp("(?:menos|excepto|salvo|sin)\\s+(.+)$"));
      const excluir = mMenos
        ? String(mMenos[1]).replace(new RegExp("^\\s*(las|los|la|el)\\s*"), "").trim()
        : "";
      const filtro = excluir
        ? ""
        : dicho.replace(new RegExp("^\\s*(las|los|la|el|todo|todas|todos)\\s*", "i"), "").trim();
      const ajustes: Array<Record<string, unknown>> = [];
      const nombres: string[] = [];
      const dejados: string[] = [];
      for (const i of ((an.insumos as Array<Record<string, unknown>>) || [])) {
        if (!i.confiable) continue;
        for (const r of ((i.recetas as Array<Record<string, unknown>>) || [])) {
          if (r.porcion_reco === null || r.porcion_reco === undefined) continue;
          const etiqueta = `${r.producto} ${r.presentacion}`.toLowerCase();
          if (excluir && (etiqueta.includes(excluir) || String(i.insumo).toLowerCase().includes(excluir))) {
            dejados.push(`${r.producto}${r.presentacion === "unica" ? "" : " " + r.presentacion}`);
            continue;
          }
          if (filtro && !etiqueta.includes(filtro) && !String(i.insumo).toLowerCase().includes(filtro)) continue;
          ajustes.push({ receta_id: r.receta_id, pres_key: r.pres_key, porcion: r.porcion_reco });
          nombres.push(`${r.producto}${r.presentacion === "unica" ? "" : " " + r.presentacion}: ${r.porcion_reco} ${i.unidad_uso}`);
        }
      }
      if (!ajustes.length) {
        if (excluir) {
          return json({ reply: dejados.length
            ? "Entonces no queda nada por cambiar. Dejo las porciones como estan 👍"
            : `No encontre nada que se llame “${excluir}” para dejarlo por fuera. Dime el nombre como aparece en la lista.` });
        }
        return json({ reply: filtro ? `No encontre recomendaciones que digan “${filtro}”.` : "No hay recomendaciones que aplicar." });
      }
      if (excluir && !dejados.length) {
        /* Pidio dejar algo por fuera que no existe: se le dice, no se aplica
           todo callado — ese fue el error de la factura del maiz. */
        return json({ reply: `No encontre nada que se llame “${excluir}” en las recomendaciones 🤔. Dime el nombre como aparece en la lista y lo dejo por fuera, o responde *aplica* para cambiarlas todas.` });
      }
      const res = await sbPost(`/rpc/fn_turno_aplicar`, { p_turno: turno.id, p_ajustes: ajustes, p_por: telGerente });
      if (!res.ok) return json({ reply: "No pude cambiar las porciones. Intenta otra vez en un momento." });
      await sbPatch(`/iv_turnos?id=eq.${turno.id}`, { analisis: null });
      const NL = String.fromCharCode(10);
      return json({ reply: `✅ *Porciones actualizadas* (${ajustes.length})${NL}${NL}• ${nombres.join(NL + "• ")}${NL}${NL}No toque nada mas: ni precios, ni unidades, ni el resto de la receta.` });
      }
    }


    /* EL STOCK YA NO VIVE EN `iv_insumos` (18-ago). Cuando el inventario paso a
       tener existencias por sede, las columnas `stock`, `stock_servicio` y
       `agotado_manual` se renombraron a `*_migrado_no_usar` y el dato real se
       mudo a `iv_existencias`. Esta funcion se quedo pidiendo las columnas
       viejas: el SELECT devolvia **HTTP 400** y el gerente recibia siempre un
       "no entendi" — no era que no entendiera el mensaje, es que nunca llego a
       ver el inventario. Y los PATCH tampoco escribian nada.

       Ahora se lee igual que la pantalla de Inventario: los insumos son de la
       MARCA y las existencias de la SEDE. En modo global (el de El Parche) la
       existencia es la fila con `branch_id` nulo. */
    const brRows = await sbGet(`/branches?id=eq.${branch_id}&select=tenant_id,brand_id&limit=1`) as Array<Record<string, unknown>> | null;
    const tenantG = brRows?.[0]?.tenant_id as string | undefined;
    const brandG  = brRows?.[0]?.brand_id as string | undefined;
    const marcaRows = brandG
      ? await sbGet(`/brands?id=eq.${brandG}&select=inventario_modo&limit=1`) as Array<Record<string, unknown>> | null
      : null;
    const modoSede = String(marcaRows?.[0]?.inventario_modo || "global") === "sucursal";
    const sedeExist: string | null = modoSede ? branch_id : null;

    const filtroInsumo = brandG ? `brand_id=eq.${brandG}` : `branch_id=eq.${branch_id}`;
    const rows = await sbGet(`/iv_insumos?${filtroInsumo}&activo=eq.true&select=id,nombre,buy_unit,use_unit,conversion,precio,control_manual,sub_inventario,min_stock,iv_existencias(branch_id,stock,stock_servicio,agotado_manual)`) as Array<Record<string, unknown>> | null;
    const existenciaDe = (i: Record<string, unknown>): Record<string, unknown> => {
      const arr = (i.iv_existencias as Array<Record<string, unknown>>) || [];
      return arr.find((e) => ((e.branch_id as string | null) || null) === sedeExist) || {};
    };
    /* Los alias de todos los insumos, en un solo viaje. */
    const aliasRows = await sbGet(`/iv_insumo_alias?tenant_id=eq.${tenantG}&select=insumo_id,alias`) as Array<Record<string, unknown>> | null;
    const aliasPorInsumo: Record<string, string[]> = {};
    for (const a of (aliasRows || [])) {
      const k = a.insumo_id as string;
      (aliasPorInsumo[k] ||= []).push(String(a.alias || ""));
    }

    const insumos: Insumo[] = (rows || []).map((i) => {
      const ex = existenciaDe(i);
      return {
        id: i.id as string, nombre: i.nombre as string, buy_unit: (i.buy_unit as string) || "unidad", use_unit: (i.use_unit as string) || "unidad",
        conversion: num(i.conversion) || 1, stock: num(ex.stock), precio: num(i.precio), manual: !!i.control_manual,
        sub: !!i.sub_inventario, servicio: num(ex.stock_servicio),
        min: num(i.min_stock), agotadoManual: !!ex.agotado_manual,
        alias: aliasPorInsumo[i.id as string] || [],
      };
    });
    if (!insumos.length) return json({ reply: "No encuentro insumos en el inventario de esta sucursal." });

    const { ops, consulta, texto, consulta_ids, consulta_todo, fallo, sinEntender } = await parseConGPT(mensaje, insumos);

    // ── CONSULTA (no cambia nada) ──
    // Antes esto respondía siempre lo mismo: "todo con stock 👍", aunque le
    // preguntaras por un insumo concreto. Ahora contesta lo que se preguntó.
    if (consulta && !ops.length) {
      const ids = Array.isArray(consulta_ids) ? consulta_ids : [];
      const pedidos = ids.map((id) => insumos.find((i) => i.id === id)).filter(Boolean) as Insumo[];

      if (pedidos.length) {
        const lineas = pedidos.map((i) => {
          const total = i.sub ? i.stock + i.servicio : i.stock;
          const alerta = total <= 0 ? "  ⚠️ *AGOTADO*"
                       : (i.manual && i.agotadoManual) ? "  ⚠️ *marcado como agotado*" : "";
          return `• *${i.nombre}*: ${fmtExistencia(i)}${alerta}`;
        });
        return json({
          reply: `📦 *Esto es lo que hay:*\n\n${lineas.join("\n\n")}\n\nSi algo no cuadra, dime el valor correcto y lo actualizo.`,
          consulta: true,
        });
      }

      // Consulta general: qué está agotado y qué anda bajo.
      const agotados = insumos.filter((i) => (i.sub ? i.stock + i.servicio : i.stock) <= 0);
      const bajos = insumos.filter((i) => {
        const t = i.sub ? i.stock + i.servicio : i.stock;
        return t > 0 && i.min > 0 && t <= i.min;
      });
      /*  UN INSUMO POR RENGLON (Sergio, 27-ago-2026).

          Iba todo seguido con comas y, con doce agotados, era una parrafada
          que habia que leer entera para encontrar uno solo: «el texto se ve
          muy plano y se confunde».

          Es el mismo formato del aviso de cierre de caja, y no por gusto:
          esta respuesta es la que llega al tocar el boton «¿Que falta?» de
          esa plantilla, asi que las dos son la misma conversacion. Si se
          vieran distintas, pareceria que contestan cosas distintas.       */
      let reply = "📦 *POR COMPRAR*\n";
      if (agotados.length) {
        reply += `\n❌ *SE ACABÓ (${agotados.length})*\n`
          + agotados.map((i) => `• ${i.nombre}`).join("\n") + "\n";
      }
      if (bajos.length) {
        reply += `\n⚠️ *QUEDA POCO (${bajos.length})*\n`
          + bajos.map((i) => `• ${i.nombre} — ${decir(i.sub ? i.stock + i.servicio : i.stock, i)}`).join("\n") + "\n";
      }
      if (!agotados.length && !bajos.length) reply += "\nTodo con stock. 👍\n";
      reply += `\nDime “hay 3 galones de salsa bbq”, o toca uno de la lista.`;
      /*  La lista trae primero lo agotado, que es lo que se va a querer
          arreglar. Diez es el maximo de WhatsApp; si hay mas, los demas se
          siguen viendo escritos arriba — no se pierde nada, solo no se
          pueden tocar. */
      const tocables = agotados.concat(bajos).slice(0, 10);
      return json({ reply, consulta: true,
        botones: tocables.length ? {
          tipo: "lista", texto_boton: "Arreglar uno", titulo_seccion: "Por comprar",
          opciones: tocables.map((i) => ({
            id: `inv_ins_${i.id}`,
            titulo: i.nombre,
            desc: (i.sub ? i.stock + i.servicio : i.stock) <= 0
              ? "se acabó"
              : `quedan ${decir(i.sub ? i.stock + i.servicio : i.stock, i)}`,
          })),
        } : null });
    }

    if (!ops.length && fallo) {
      // Se entendio que era inventario, pero el procesamiento se atasco.
      // Decir "no te entendi" aqui es enganoso: parece culpa del gerente.
      return json({ reply: "Se me enredo procesando ese mensaje. Mandamelo en dos partes (la mitad y luego la otra mitad) y lo actualizo enseguida." });
    }

    if (!ops.length) {
      return json({ reply: "No te entendí 🤔.\n\n*Para consultar:* “¿cuántas Coca Cola 1.5 hay?”, “¿cómo está el pollo?”, “¿qué falta?”\n*Para actualizar:* “hay 3 kilos de carne”, “compré 10 unidades de pollo a 21 mil”, “hay 5 Coca Cola en servicio”" });
    }

    const byId: Record<string, Insumo> = {};
    insumos.forEach((i) => { byId[i.id] = i; });
    const hechos: string[] = [];
    // Version corta de cada cambio. Con 28 cambios la respuesta detallada
    // pasaba de los 4096 caracteres que admite WhatsApp y no llegaba nunca.
    const compacto: Array<{ n: string; t: string }> = [];
    recalcular(ops, byId);

    /* ── ABRIR / CERRAR TURNO ─────────────────────────────────────────────
       Las cantidades ya vienen entendidas y convertidas por el mismo camino
       del inventario; aqui solo cambia DONDE se guardan. */
    if (modoAbrir || modoCerrar) {
      const NL = String.fromCharCode(10);
      const abiertos = await sbGet(`/iv_turnos?branch_id=eq.${branch_id}&estado=eq.abierto&order=abierto_en.desc&limit=1&select=id,abierto_en`) as Array<Record<string, unknown>> | null;
      const abierto = abiertos?.[0];

      if (modoAbrir) {
        if (abierto) {
          await sbPatch(`/iv_turnos?id=eq.${abierto.id}`, { estado: "descartado" });
        }
        const nuevo = await sbPost(`/iv_turnos`, {
          tenant_id: tenantG, branch_id, estado: "abierto", abierto_por: telGerente,
        }, true);
        const filaT = Array.isArray(nuevo) ? (nuevo[0] as Record<string, unknown>) : null;
        const turnoId = filaT?.id as string | undefined;
        if (!turnoId) return json({ reply: "No pude abrir el turno. Intenta otra vez." });
        const lineas = ops.filter((o) => byId[o.insumo_id])
          .map((o) => ({ turno_id: turnoId, insumo_id: o.insumo_id, inicio: num(o.cantidad_buy_unit), repuesto: 0 }));
        if (lineas.length) await sbPost(`/iv_turno_lineas`, lineas);
        const dichos = lineas.map((l) => {
          const ins = byId[l.insumo_id];
          return `• ${ins.nombre}: ${decir(l.inicio, ins)}`;
        });
        const aviso = abierto ? NL + NL + "(habia un turno sin cerrar; lo descarte)" : "";
        return json({ reply: `▶️ *Turno abierto* con:${NL}${dichos.join(NL)}${NL}${NL}Cuando termines dime *cierro turno con...* y te digo cuanto se gasto de verdad en cada plato.${aviso}` });
      }

      // CERRAR
      if (!abierto) {
        return json({ reply: "No hay ningun turno abierto. Empieza con “abro turno con maiz 3.5 kg, ripio 2 kg”." });
      }
      const turnoId = abierto.id as string;
      /* Lo que entro DURANTE el turno (compras que el mismo gerente reporto).
         Sin esto, reponer a mitad de jornada haria ver un gasto negativo. */
      const compras = await sbGet(`/pos_gerente_ops?branch_id=eq.${branch_id}&accion=eq.add&created_at=gte.${encodeURIComponent(String(abierto.abierto_en))}&select=insumo_id,cantidad`) as Array<Record<string, unknown>> | null;
      const repuestoPor: Record<string, number> = {};
      for (const c of (compras || [])) {
        const k = String(c.insumo_id || "");
        if (!k) continue;
        repuestoPor[k] = (repuestoPor[k] || 0) + num(c.cantidad);
      }
      for (const o of ops) {
        if (!byId[o.insumo_id]) continue;
        const yaHay = await sbGet(`/iv_turno_lineas?turno_id=eq.${turnoId}&insumo_id=eq.${o.insumo_id}&select=id`) as Array<Record<string, unknown>> | null;
        const campos = { fin: num(o.cantidad_buy_unit), repuesto: repuestoPor[o.insumo_id] || 0 };
        if (yaHay?.length) await sbPatch(`/iv_turno_lineas?id=eq.${yaHay[0].id}`, campos);
        else await sbPost(`/iv_turno_lineas`, { turno_id: turnoId, insumo_id: o.insumo_id, ...campos });
      }
      await sbPatch(`/iv_turnos?id=eq.${turnoId}`, {
        estado: "cerrado", cerrado_en: new Date().toISOString(), cerrado_por: telGerente,
      });
      const anRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_turno_analisis`, {
        method: "POST", headers: H, body: JSON.stringify({ p_turno: turnoId }),
      });
      const an = await anRes.json() as Record<string, unknown>;
      await sbPatch(`/iv_turnos?id=eq.${turnoId}`, { analisis: an });

      /* EL CIERRE TAMBIEN DEJA EL INVENTARIO AL DIA: es un conteo, y hacerlo
         escribir dos veces seria pedirle lo mismo dos veces. */
      for (const o of ops) {
        if (!byId[o.insumo_id]) continue;
        await fijarExistencia(o.insumo_id, sedeExist, { stock: num(o.cantidad_buy_unit) });
      }
      return json({ reply: textoAnalisis(an), turno: turnoId });
    }

    if (simular) {
      const prev = ops.map((op) => {
        const ins = byId[op.insumo_id];
        if (!ins) return `• (no encontre el insumo: ${op.insumo_id})`;
        const dest = op.destino === "servicio" ? " → nevera/servicio" : (op.destino === "bodega" ? " → bodega" : "");
        return `• ${ins.nombre}: ${op.accion.toUpperCase()} ${fmtCant(num(op.cantidad_buy_unit), ins, op.unidad_dicha, op.cantidad_dicha ?? null)}${dest}`;
      });
      return json({ simulacion: true, ops, reply: prev.join(String.fromCharCode(10)) || "(no entendi ninguna operacion)" });
    }

    for (const op of ops) {
      const ins = byId[op.insumo_id];
      if (!ins) continue;

      // ── SURTIR (sub-inventario): mover de bodega (stock) a servicio (stock_servicio) ──
      if (op.accion === "surtir") {
        if (!ins.sub) {
          hechos.push(`• *${ins.nombre}* no usa sub-inventario (bodega/nevera). (No moví nada)`);
          compacto.push({ n: ins.nombre, t: "sin sub-inventario, no movi nada" });
          continue;
        }
        const pedido = num(op.cantidad_buy_unit);
        const mover = Math.min(pedido, ins.stock);   // no se puede surtir más de lo que hay en bodega
        if (mover <= 0) {
          hechos.push(`• *${ins.nombre}*: no hay en bodega para surtir.`);
          compacto.push({ n: ins.nombre, t: "sin bodega para surtir" });
          continue;
        }
        const nuevaBodega = ins.stock - mover;
        const nuevoServicio = ins.servicio + mover;
        await fijarExistencia(ins.id, sedeExist, { stock: nuevaBodega, servicio: nuevoServicio });
        ins.stock = nuevaBodega; ins.servicio = nuevoServicio;
        const parcial = mover < pedido ? " (bodega no alcanzaba para más)" : "";
        // Igual que set/add: primero lo entendible (unidades) y el paquete
        // entre paréntesis. Antes decía "surtido a nevera 0.25 paq", que no
        // le dice nada a nadie.
        hechos.push(`• *${ins.nombre}* — 🧊 SURTIDO A SERVICIO
   moví ${fmtCant(mover, ins, op.unidad_dicha, op.cantidad_dicha ?? null)}
   🧊 en servicio: *${decir(nuevoServicio, ins)}*
   📦 en bodega queda: ${decir(nuevaBodega, ins)}${parcial}`);
        compacto.push({ n: ins.nombre, t: `🧊 servicio: ${decir(nuevoServicio, ins)} · 📦 bodega: ${decir(nuevaBodega, ins)}` });
        continue;
      }

      /* ── SOLO EL PRECIO ────────────────────────────────────────────────
         "actualiza el precio del galon de salsa rosada en 45000". No toca la
         cantidad ni nada mas: el precio es del insumo (de la marca), no de la
         existencia de la sede. */
      if (op.accion === "precio") {
        const dado = num(op.precio_buy_unit);
        if (dado <= 0) {
          hechos.push(`• *${ins.nombre}*: no entendi el precio. Dimelo asi: “el precio del ${ins.buy_unit} de ${ins.nombre} es 45000”.`);
          compacto.push({ n: ins.nombre, t: "precio no entendido" });
          continue;
        }
        /* SI LO DIJO EN OTRA UNIDAD, se pasa a la de compra. "el kilo de papa a
           8.900" con la papa en bultos de 43 kg son $382.700 el bulto: cobrar
           8.900 por bulto dejaria el costo de los platos por el piso. */
        let precioFinal = dado;
        let nota = "";
        const uDicha = op.unidad_dicha ? String(op.unidad_dicha) : "";
        if (uDicha && limpiarUnidad(uDicha) !== limpiarUnidad(ins.buy_unit)) {
          const porUnidad = convertirDicho(1, uDicha, ins);
          if (porUnidad !== null && porUnidad > 0) {
            precioFinal = dado / porUnidad;
            nota = ` (dijiste ${fmtNum(dado)} por ${uDicha})`;
          }
        }
        precioFinal = Math.round(precioFinal);
        const antesP = ins.precio;
        await sbPatch(`/iv_insumos?id=eq.${ins.id}`, { precio: precioFinal, updated_at: new Date().toISOString() });
        ins.precio = precioFinal;
        await auditar(branch_id, telGerente, mensaje, ins, "precio", precioFinal, antesP, precioFinal);
        hechos.push(`• *${ins.nombre}* — 💲 PRECIO
   de ${fmtNum(antesP)} a *${fmtNum(precioFinal)}* por ${ins.buy_unit}${nota}
   (no toque la cantidad: sigue en ${decir(ins.stock, ins)})`);
        compacto.push({ n: ins.nombre, t: `💲 ${fmtNum(precioFinal)}/${ins.buy_unit}` });
        continue;
      }

      // ── DISPONIBILIDAD (control manual): marca disponible/agotado SIN tocar la cantidad ──
      if (op.accion === "agotado" || op.accion === "disponible") {
        if (!ins.manual) {
          // No es de control manual: no aplica marcar disponible/agotado.
          hechos.push(`• *${ins.nombre}* no es de control manual — su disponibilidad va por cantidad. (No cambié nada)`);
          compacto.push({ n: ins.nombre, t: "no es de control manual" });
          continue;
        }
        const agotado = op.accion === "agotado";
        await fijarExistencia(ins.id, sedeExist, { agotado });
        hechos.push(agotado ? `• ⛔ *${ins.nombre}* marcado como AGOTADO` : `• ✅ *${ins.nombre}* habilitado (disponible)`);
        compacto.push({ n: ins.nombre, t: agotado ? "⛔ agotado" : "✅ disponible" });
        await auditar(branch_id, telGerente, mensaje, ins, op.accion, null, ins.stock, ins.stock);
        continue;
      }

      // ── CANTIDAD (set / add) ──
      const cant = num(op.cantidad_buy_unit);
      // ¿Bodega o servicio? Antes esto no existía: decir "hay 5 en servicio"
      // terminaba cambiando la BODEGA, justo lo contrario de lo pedido.
      const aServicio = ins.sub && op.destino === "servicio";
      const antes = aServicio ? ins.servicio : ins.stock;
      let nuevo = antes;
      if (op.accion === "add") nuevo = antes + cant;
      else nuevo = cant; // set
      if (nuevo < 0) nuevo = 0;

      const patch: Record<string, unknown> = {};
      await fijarExistencia(ins.id, sedeExist, aServicio ? { servicio: nuevo } : { stock: nuevo });
      /* El PRECIO si sigue viviendo en el insumo: es de la marca, no de la sede. */
      if (op.accion === "add" && op.precio_buy_unit && num(op.precio_buy_unit) > 0) {
        patch.precio = num(op.precio_buy_unit);
        await sbPatch(`/iv_insumos?id=eq.${ins.id}`, { precio: patch.precio, updated_at: new Date().toISOString() });
      }
      if (aServicio) ins.servicio = nuevo; else ins.stock = nuevo;

      const precioTxt = (op.accion === "add" && patch.precio) ? ` (precio ${fmtNum(num(patch.precio))}/${ins.buy_unit})` : "";
      // Se responde en la MISMA unidad en que habló el gerente. Antes todo salía
      // en unidad de compra y aparecían cosas como "0.833 paq".
      const dicho = (c: number) => fmtCant(c, ins, op.unidad_dicha, null);
      const dichoCant = fmtCant(cant, ins, op.unidad_dicha, op.cantidad_dicha ?? null);
      // Y se dice EXPLÍCITAMENTE dónde quedó, para que no haya dudas.
      const donde = ins.sub ? (aServicio ? "🧊 EN SERVICIO" : "📦 EN BODEGA") : "";
      const otroNivel = ins.sub
        ? `\n   (${aServicio ? `en bodega sigue: ${decir(ins.stock, ins)}` : `en servicio sigue: ${decir(ins.servicio, ins)}`})`
        : "";

      if (op.accion === "add") {
        hechos.push(`• *${ins.nombre}*${donde ? ` — ${donde}` : ""}
   tenías ${dicho(antes)} + sumé ${dichoCant}
   = *${dicho(nuevo)}*${precioTxt}${otroNivel}`);
      } else {
        hechos.push(`• *${ins.nombre}*${donde ? ` — ${donde}` : ""}
   tenías ${dicho(antes)} → lo dejé en *${dicho(nuevo)}*${precioTxt}${otroNivel}`);
      }
      compacto.push({ n: ins.nombre, t: `${ins.sub ? (aServicio ? "🧊 servicio" : "📦 bodega") + ": " : ""}${dicho(nuevo)}` });
      await auditar(branch_id, telGerente, mensaje, ins, op.accion, cant, antes, nuevo);
    }

    if (!hechos.length) return json({ reply: "No pude emparejar los insumos 🤔. Dime el nombre tal como está en el inventario." });

    // Con pocos cambios se responde con el detalle de siempre (de cuanto
    // partia y en cuanto quedo). Con una lista larga eso no cabe en WhatsApp,
    // asi que se agrupa por insumo y se da una sola linea por insumo.
    let reply: string;
    if (hechos.length > 6) {
      const orden: string[] = [];
      const mapa: Record<string, string[]> = {};
      compacto.forEach((x) => { if (!mapa[x.n]) { mapa[x.n] = []; orden.push(x.n); } mapa[x.n].push(x.t); });
      const lineas = orden.map((nom) => "• *" + nom + "* — " + mapa[nom].join(" · "));
      reply = "✅ Inventario actualizado (" + hechos.length + " cambios):\n\n" + lineas.join("\n") + "\n\nSi algo quedo mal, escribeme solo esa linea con el valor correcto.";
    } else {
      reply = `✅ Inventario actualizado:\n${hechos.join("\n")}\n\nSi algo quedó mal, escríbeme de nuevo con el valor correcto.`;
    }
    // Las lineas que no se pudieron interpretar se dicen una por una. Antes
    // se perdian en silencio y el gerente creia que habia quedado todo.
    if (sinEntender && sinEntender.length) {
      const cuales = sinEntender.slice(0, 8).map((l) => "  - " + l).join("\n");
      reply += "\n\n\u26a0\ufe0f Estas no las entendi (no las toque):\n" + cuales
             + (sinEntender.length > 8 ? "\n  - \u2026 y " + (sinEntender.length - 8) + " mas" : "");
    }
    // WhatsApp corta en 4096 caracteres: mejor avisar que perder el mensaje.
    if (reply.length > 3900) reply = reply.slice(0, 3800) + "\n\n... (y mas). Revisa el inventario en Cobra para verlo completo.";
    return json({ reply, aplicado: hechos.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
