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
  sub: boolean; servicio: number;
}
interface Op {
  insumo_id: string; accion: "set" | "add" | "agotado" | "disponible" | "surtir";
  cantidad_buy_unit: number; precio_buy_unit?: number | null; texto: string;
}

async function parseConGPT(mensaje: string, insumos: Insumo[]): Promise<{ ops: Op[]; consulta: boolean; texto: string }> {
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
4. Convierte SIEMPRE la cantidad a la unidad de COMPRA del insumo (buy_unit). Ej.: compra en "kg" y dicen "500 gramos" → 0.5. Compra en "unidad" que equivale a 2500 g y dicen "5000 g" → 2.
5. El precio, si lo dan, va por unidad de COMPRA (precio_buy_unit). "a 30 mil" = 30000.
6. Empareja el insumo por nombre de forma flexible. Si NO existe un insumo parecido, NO inventes id: omítelo.
7. Si el mensaje es una PREGUNTA/CONSULTA (¿cómo está el pollo?, ¿qué falta?), pon "consulta":true y describe en "texto" (no cambies nada).
8. Si no entiendes nada de inventario, devuelve ops vacío y consulta false.

Formato EXACTO:
{
  "ops": [ { "insumo_id": "...", "accion": "set"|"add"|"agotado"|"disponible"|"surtir", "cantidad_buy_unit": number, "precio_buy_unit": number|null, "texto": "resumen humano, ej. 'Papa: dejar en 2 bultos', 'Carne: marcar agotada', 'Coca Cola: surtir 6 a nevera'" } ],
  "consulta": false,
  "texto": ""
}

Mensaje del gerente: """${mensaje}"""
Responde SOLO el JSON.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", temperature: 0, max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) { console.error("GPT error:", await res.text()); return { ops: [], consulta: false, texto: "" }; }
    const data = await res.json() as Record<string, unknown>;
    const raw = (((data.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown>)?.content as string || "{}");
    const parsed = JSON.parse(raw);
    return { ops: Array.isArray(parsed.ops) ? parsed.ops : [], consulta: !!parsed.consulta, texto: String(parsed.texto || "") };
  } catch (e) {
    console.error("parseConGPT:", e);
    return { ops: [], consulta: false, texto: "" };
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

    const rows = await sbGet(`/iv_insumos?branch_id=eq.${branch_id}&activo=eq.true&select=id,nombre,buy_unit,use_unit,conversion,stock,precio,control_manual,sub_inventario,stock_servicio`) as Array<Record<string, unknown>> | null;
    const insumos: Insumo[] = (rows || []).map((i) => ({
      id: i.id as string, nombre: i.nombre as string, buy_unit: (i.buy_unit as string) || "unidad", use_unit: (i.use_unit as string) || "unidad",
      conversion: num(i.conversion) || 1, stock: num(i.stock), precio: num(i.precio), manual: !!i.control_manual,
      sub: !!i.sub_inventario, servicio: num(i.stock_servicio),
    }));
    if (!insumos.length) return json({ reply: "No encuentro insumos en el inventario de esta sucursal." });

    const { ops, consulta, texto } = await parseConGPT(mensaje, insumos);

    // ── CONSULTA (no cambia nada) ──
    if (consulta && !ops.length) {
      const bajos = insumos.filter((i) => i.stock <= 0).map((i) => i.nombre);
      let reply = "📦 *Inventario*\n";
      if (bajos.length) reply += `\n⚠️ Agotados: ${bajos.join(", ")}`;
      else reply += "\nTodo con stock. 👍";
      reply += `\n\n(Puedes decirme cosas como “hay 3 kilos de carne” o “compré 2 pacas de gaseosa a 30 mil”.)`;
      return json({ reply, consulta: true });
    }

    if (!ops.length) {
      return json({ reply: "No entendí qué insumo actualizar 🤔. Prueba: “hay 3 kilos de carne”, “compré 10 unidades de pollo a 21 mil”, o pregúntame “¿qué falta?”." });
    }

    const byId: Record<string, Insumo> = {};
    insumos.forEach((i) => { byId[i.id] = i; });
    const hechos: string[] = [];
    for (const op of ops) {
      const ins = byId[op.insumo_id];
      if (!ins) continue;

      // ── SURTIR (sub-inventario): mover de bodega (stock) a servicio (stock_servicio) ──
      if (op.accion === "surtir") {
        if (!ins.sub) {
          hechos.push(`• *${ins.nombre}* no usa sub-inventario (bodega/nevera). (No moví nada)`);
          continue;
        }
        const pedido = num(op.cantidad_buy_unit);
        const mover = Math.min(pedido, ins.stock);   // no se puede surtir más de lo que hay en bodega
        if (mover <= 0) { hechos.push(`• *${ins.nombre}*: no hay en bodega para surtir.`); continue; }
        const nuevaBodega = ins.stock - mover;
        const nuevoServicio = ins.servicio + mover;
        await sbPatch(`/iv_insumos?id=eq.${ins.id}`, { stock: nuevaBodega, stock_servicio: nuevoServicio, updated_at: new Date().toISOString() });
        ins.stock = nuevaBodega; ins.servicio = nuevoServicio;
        const parcial = mover < pedido ? " (bodega no alcanzaba para más)" : "";
        hechos.push(`• 🧊 *${ins.nombre}* → surtido a nevera. En servicio: ${fmtNum(nuevoServicio)} ${ins.buy_unit} (bodega: ${fmtNum(nuevaBodega)})${parcial}`);
        continue;
      }

      // ── DISPONIBILIDAD (control manual): marca disponible/agotado SIN tocar la cantidad ──
      if (op.accion === "agotado" || op.accion === "disponible") {
        if (!ins.manual) {
          // No es de control manual: no aplica marcar disponible/agotado.
          hechos.push(`• *${ins.nombre}* no es de control manual — su disponibilidad va por cantidad. (No cambié nada)`);
          continue;
        }
        const agotado = op.accion === "agotado";
        await sbPatch(`/iv_insumos?id=eq.${ins.id}`, { agotado_manual: agotado, updated_at: new Date().toISOString() });
        hechos.push(agotado ? `• ⛔ *${ins.nombre}* marcado como AGOTADO` : `• ✅ *${ins.nombre}* habilitado (disponible)`);
        await auditar(branch_id, telGerente, mensaje, ins, op.accion, null, ins.stock, ins.stock);
        continue;
      }

      // ── CANTIDAD (set / add) ──
      const cant = num(op.cantidad_buy_unit);
      const antes = ins.stock;
      let nuevoStock = ins.stock;
      if (op.accion === "add") nuevoStock = ins.stock + cant;
      else nuevoStock = cant; // set
      if (nuevoStock < 0) nuevoStock = 0;
      const patch: Record<string, unknown> = { stock: nuevoStock, updated_at: new Date().toISOString() };
      if (op.accion === "add" && op.precio_buy_unit && num(op.precio_buy_unit) > 0) patch.precio = num(op.precio_buy_unit);
      await sbPatch(`/iv_insumos?id=eq.${ins.id}`, patch);
      ins.stock = nuevoStock; // por si se repite el mismo insumo
      const precioTxt = (op.accion === "add" && patch.precio) ? ` (precio ${fmtNum(num(patch.precio))}/${ins.buy_unit})` : "";
      // El mensaje muestra la CUENTA COMPLETA (tenías + sumé = total) para poder
      // cachar al vuelo si el bot entendió mal la cantidad o de dónde partió.
      const u = ins.buy_unit;
      if (op.accion === "add") {
        hechos.push(`• *${ins.nombre}*
   tenías ${fmtNum(antes)} ${u} + sumé ${fmtNum(cant)} ${u}
   = *${fmtNum(nuevoStock)} ${u}*${precioTxt}`);
      } else {
        hechos.push(`• *${ins.nombre}*
   tenías ${fmtNum(antes)} ${u} → lo dejé en *${fmtNum(nuevoStock)} ${u}*${precioTxt}`);
      }
      await auditar(branch_id, telGerente, mensaje, ins, op.accion, cant, antes, nuevoStock);
    }

    if (!hechos.length) return json({ reply: "No pude emparejar los insumos 🤔. Dime el nombre tal como está en el inventario." });

    const reply = `✅ Inventario actualizado:\n${hechos.join("\n")}\n\nSi algo quedó mal, escríbeme de nuevo con el valor correcto.`;
    return json({ reply, aplicado: hechos.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
