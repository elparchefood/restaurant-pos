// gerente-inventario — Inventario por WhatsApp para números de gerente.
// Recibe un mensaje en lenguaje natural ("hay 3 kilos de carne", "compré 2 pacas
// de gaseosa a 30 mil") y actualiza iv_insumos: 'set' (dejar el total en X) o
// 'add' (reponer/comprar, suma stock y actualiza precio). También responde
// consultas ("¿cómo está el pollo?", "¿qué falta?").
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_KEY") || "";
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
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

async function sbPost(path: string, body: unknown) {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}
function num(v: unknown) { return Number(v) || 0; }
function fmtNum(n: number) {
  // hasta 3 decimales, sin ceros sobrantes
  return (Math.round(n * 1000) / 1000).toString();
}

interface Insumo {
  id: string; nombre: string; buy_unit: string; use_unit: string;
  conversion: number; stock: number; precio: number; manual: boolean;
  sub: boolean; servicio: number; min: number; agotadoManual: boolean;
}
interface Op {
  insumo_id: string; accion: "set" | "add" | "agotado" | "disponible" | "surtir";
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
    return { i, pts };
  }).filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  // Sin ningun parecido no se adivina: se manda todo y que el modelo decida.
  if (!puntuado.length) return insumos;
  return puntuado.slice(0, 15).map((x) => x.i);
}

type Parseo = { ops: Op[]; consulta: boolean; texto: string; consulta_ids: string[]; consulta_todo: boolean; fallo: boolean; sinEntender?: string[] };

async function parseConGPT(mensaje: string, insumos: Insumo[]): Promise<Parseo> {
  const trozos = trocear(mensaje);
  if (trozos.length === 1) return await parseUnTrozo(mensaje, insumos);

  // Linea a linea se usa gpt-4o-mini: la tarea ya es minima (UNA linea y
  // como mucho 15 insumos candidatos) y el cupo por minuto de gpt-4o (30.000
  // tokens) no aguanta 15 llamadas seguidas — rebotaban y las lineas se
  // perdian. Los mensajes normales, de una sola frase, siguen con gpt-4o.
  // En tandas, para no disparar 20 llamadas de golpe contra OpenAI.
  const partes: Parseo[] = [];
  const POR_TANDA = 8;
  for (let i = 0; i < trozos.length; i += POR_TANDA) {
    const tanda = await Promise.all(trozos.slice(i, i + POR_TANDA).map((t) => parseUnTrozo(t, candidatos(t, insumos), 0, "gpt-4o-mini")));
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
    `- id:${i.id} | "${i.nombre}" | compra en: ${i.buy_unit} | 1 ${i.buy_unit} = ${fmtNum(i.conversion)} ${i.use_unit} | stock actual: ${fmtNum(i.stock)} ${i.buy_unit} | precio: ${fmtNum(i.precio)} por ${i.buy_unit}${i.manual ? " | CONTROL MANUAL (se marca disponible/agotado a mano, no por cantidad)" : ""}${i.sub ? ` | SUB-INVENTARIO (bodega:${fmtNum(i.stock)} / en servicio-nevera:${fmtNum(i.servicio)}). Se puede SURTIR (pasar de bodega a servicio/nevera)` : ""}`
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const branch_id = body.branch_id;
    const mensaje = String(body.message || body.mensaje || "").trim();
    const telGerente = String(body.phone || "");
    if (!branch_id || !mensaje) return json({ error: "branch_id y message requeridos" }, 400);

    const rows = await sbGet(`/iv_insumos?branch_id=eq.${branch_id}&activo=eq.true&select=id,nombre,buy_unit,use_unit,conversion,stock,precio,control_manual,sub_inventario,stock_servicio,min_stock,agotado_manual`) as Array<Record<string, unknown>> | null;
    const insumos: Insumo[] = (rows || []).map((i) => ({
      id: i.id as string, nombre: i.nombre as string, buy_unit: (i.buy_unit as string) || "unidad", use_unit: (i.use_unit as string) || "unidad",
      conversion: num(i.conversion) || 1, stock: num(i.stock), precio: num(i.precio), manual: !!i.control_manual,
      sub: !!i.sub_inventario, servicio: num(i.stock_servicio),
      min: num(i.min_stock), agotadoManual: !!i.agotado_manual,
    }));
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
      let reply = "📦 *Inventario*\n";
      if (agotados.length) reply += `\n⛔ *Agotados:* ${agotados.map((i) => i.nombre).join(", ")}`;
      if (bajos.length) reply += `\n⚠️ *Por acabarse:* ${bajos.map((i) => `${i.nombre} (${decir(i.sub ? i.stock + i.servicio : i.stock, i)})`).join(", ")}`;
      if (!agotados.length && !bajos.length) reply += "\nTodo con stock. 👍";
      reply += `\n\nPregúntame por algo concreto (“¿cuántas Coca Cola 1.5 hay?”) o dime “hay 3 kilos de carne”.`;
      return json({ reply, consulta: true });
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
        await sbPatch(`/iv_insumos?id=eq.${ins.id}`, { stock: nuevaBodega, stock_servicio: nuevoServicio, updated_at: new Date().toISOString() });
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

      // ── DISPONIBILIDAD (control manual): marca disponible/agotado SIN tocar la cantidad ──
      if (op.accion === "agotado" || op.accion === "disponible") {
        if (!ins.manual) {
          // No es de control manual: no aplica marcar disponible/agotado.
          hechos.push(`• *${ins.nombre}* no es de control manual — su disponibilidad va por cantidad. (No cambié nada)`);
          compacto.push({ n: ins.nombre, t: "no es de control manual" });
          continue;
        }
        const agotado = op.accion === "agotado";
        await sbPatch(`/iv_insumos?id=eq.${ins.id}`, { agotado_manual: agotado, updated_at: new Date().toISOString() });
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

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (aServicio) patch.stock_servicio = nuevo; else patch.stock = nuevo;
      if (op.accion === "add" && op.precio_buy_unit && num(op.precio_buy_unit) > 0) patch.precio = num(op.precio_buy_unit);
      await sbPatch(`/iv_insumos?id=eq.${ins.id}`, patch);
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
