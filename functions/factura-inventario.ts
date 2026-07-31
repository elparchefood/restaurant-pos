// factura-inventario — Repone inventario desde la FOTO de una factura del proveedor.
//
// El gerente manda la foto por WhatsApp. GPT-4o Vision lee las líneas y esta
// función las cruza con los insumos. Lo difícil no es leer: es que el proveedor
// usa OTROS nombres ("MANGUERA SEVILLA ROLLO" = nuestra Salchicha) y OTRAS
// unidades ("CAJAx10pqt" = 10 kg). Por eso:
//   · lo que reconoce lo propone listo (✅)
//   · lo que no, lo PREGUNTA (❓) y la respuesta queda como SINÓNIMO del insumo
//     (iv_insumo_alias), así la próxima factura de ese proveedor ya lo sabe.
// Nunca aplica nada sin que el gerente confirme.
//
//   POST { branch_id, phone, media_url }  → lee la factura y propone
//   POST { branch_id, phone, message }    → confirma ("sí") o corrige/enseña
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
async function sbPost(path: string, body: unknown, rep = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, Prefer: rep ? "return=representation" : "return=minimal" },
    body: JSON.stringify(body),
  });
  return rep ? await r.json().catch(() => null) : null;
}
async function sbPatch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
}
function num(v: unknown) { const n = Number(v); return isFinite(n) ? n : 0; }
function norm(s: unknown) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function fmtNum(n: number) {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}
function fmtCOP(n: number) { return "$" + Math.round(n).toLocaleString("es-CO"); }
const NL = String.fromCharCode(10);

type Insumo = { id: string; nombre: string; buy_unit: string; use_unit: string; conversion: number; stock: number; precio: number };
type Linea = {
  desc: string; cantidad: number; valor_total: number;
  insumo_id?: string | null; insumo?: string; factor?: number;
  buy_unit?: string; cant_final?: number; precio_unit?: number; precio_viejo?: number;
  ok?: boolean;                 // reconocido → se puede aplicar
  precio_raro?: boolean;        // el precio no cuadra con ese insumo
};

async function cargarInsumos(branch_id: string): Promise<Insumo[]> {
  const rows = await sbGet(`/iv_insumos?branch_id=eq.${branch_id}&activo=eq.true&select=id,nombre,buy_unit,use_unit,conversion,stock,precio`) as Array<Record<string, unknown>> | null;
  return (rows || []).map((i) => ({
    id: String(i.id), nombre: String(i.nombre), buy_unit: String(i.buy_unit || "unidad"),
    use_unit: String(i.use_unit || "unidad"), conversion: num(i.conversion) || 1,
    stock: num(i.stock), precio: num(i.precio),
  }));
}

// Familias de unidad: si la factura dice "GAL" y el insumo se compra por
// "galón", es la misma cosa. Si dice "GAL" y el insumo se compra por "unidad",
// NO puede ser ese (un tomate no se vende por galones).
const FAMILIAS: Record<string, string[]> = {
  galon:   ["gal", "galon", "galones", "gl"],
  kg:      ["kg", "kilo", "kilos", "klg"],
  gramo:   ["g", "gr", "gramo", "gramos"],
  litro:   ["l", "lt", "litro", "litros", "ml"],
  unidad:  ["und", "unidad", "unidades", "un", "u"],
  paquete: ["paq", "pqt", "paquete", "paquetes", "pack"],
  caja:    ["caja", "cja", "cajas"],
  bolsa:   ["bol", "bolsa", "bolsas"],
  rollo:   ["rollo", "rollos"],
  bulto:   ["bulto", "bultos"],
  frasco:  ["frasco", "frascos"],
  libra:   ["lb", "libra", "libras"],
};
function familiaDe(txt: string): string | null {
  const t = norm(txt);
  const tokens = t.split(/[\s]+/).concat(t.replace(/([a-z]+)/g, " $1 ").split(/\s+/));
  for (const [fam, palabras] of Object.entries(FAMILIAS)) {
    if (palabras.some((w) => tokens.includes(w))) return fam;
  }
  return null;
}
// Unidades que NO pueden ser la misma cosa (un galón no es una unidad suelta).
function chocan(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  const equivalentes = [["kg", "gramo", "libra", "bulto"], ["galon", "litro", "bolsa"], ["unidad", "paquete", "caja"]];
  return !equivalentes.some((g) => g.includes(a) && g.includes(b));
}

// Resuelve una línea de la factura contra los insumos: primero por SINÓNIMO ya
// aprendido; si no, por nombre + UNIDAD del empaque. Si no queda 100% claro,
// se pregunta: meter el insumo equivocado daña el inventario en silencio.
function resolver(l: Linea, insumos: Insumo[], alias: Array<Record<string, unknown>>): Linea {
  const d = norm(l.desc);
  const a = alias.find((x) => {
    const an = String(x.alias_norm);
    return an === d || d.includes(an) || an.includes(d);
  });
  if (a) {
    const ins = insumos.find((i) => i.id === String(a.insumo_id));
    if (ins) {
      const factor = num(a.factor) || 1;
      const cantFinal = l.cantidad * factor;
      return { ...l, insumo_id: ins.id, insumo: ins.nombre, factor, buy_unit: ins.buy_unit,
        cant_final: cantFinal, precio_viejo: ins.precio,
        precio_unit: cantFinal > 0 ? l.valor_total / cantFinal : 0, ok: true };
    }
  }

  const famFactura = familiaDe(l.desc);
  const puntajes = insumos.map((i) => {
    const n = norm(i.nombre);
    const palabras = n.split(" ").filter((w) => w.length >= 4);
    let p = 0;
    if (n && d.includes(n)) p = 10;
    else if (palabras.length && palabras.every((w) => d.includes(w))) p = 8;
    else if (palabras.some((w) => d.includes(w))) p = 5;
    if (p > 0 && famFactura) {
      const famIns = familiaDe(i.buy_unit);
      if (famIns && famFactura === famIns) p += 6;          // la unidad confirma
      else if (chocan(famFactura, famIns)) p -= 8;          // la unidad lo descarta
    }
    return { i, p };
  }).filter((x) => x.p > 0).sort((x, y) => y.p - x.p);

  if (!puntajes.length) return { ...l, insumo_id: null, ok: false };
  const mejor = puntajes[0].i, pts = puntajes[0].p;
  const rival = puntajes.length > 1 ? puntajes[1].p : 0;
  const pu = l.cantidad > 0 ? l.valor_total / l.cantidad : 0;
  const razon = mejor.precio > 0 && pu > 0 ? pu / mejor.precio : 1;
  // Seguro solo si: gana claro Y el precio es coherente. El precio delata
  // empaques distintos (una caja de 10 cuesta 10 veces más que la unidad).
  const claro = pts >= 8 && (pts - rival) >= 3 && razon <= 2.5 && razon >= 0.4;

  if (claro) {
    return { ...l, insumo_id: mejor.id, insumo: mejor.nombre, factor: 1, buy_unit: mejor.buy_unit,
      cant_final: l.cantidad, precio_viejo: mejor.precio, precio_unit: pu, ok: true };
  }
  return { ...l, insumo_id: null, insumo: puntajes.slice(0, 2).map((x) => x.i.nombre).join(" o "),
    precio_unit: pu, precio_viejo: mejor.precio,
    precio_raro: pts >= 8 && (razon > 2.5 || razon < 0.4), ok: false };
}

function armarMensaje(prov: string, total: number, lineas: Linea[]): string {
  const listos = lineas.filter((l) => l.ok);
  const dudas  = lineas.filter((l) => !l.ok);
  let t = `📄 *Factura ${prov ? "de " + prov : ""}* · ${fmtCOP(total)}\n`;
  if (listos.length) {
    t += `\n*Listo para aplicar:*\n`;
    for (const l of listos) {
      const sube = (l.precio_viejo || 0) > 0 && l.precio_unit && Math.abs(l.precio_unit - (l.precio_viejo || 0)) / (l.precio_viejo || 1) > 0.03;
      t += `✅ ${l.insumo} +${fmtNum(l.cant_final || 0)} ${l.buy_unit}`;
      if (sube) {
        const arriba = (l.precio_unit || 0) > (l.precio_viejo || 0);
        t += `\n    ${arriba ? "⚠️ subió" : "↓ bajó"} de ${fmtCOP(l.precio_viejo || 0)} a ${fmtCOP(l.precio_unit || 0)}`;
      }
      t += `\n`;
    }
  }
  if (dudas.length) {
    t += `\n*No estoy seguro:*\n`;
    for (const l of dudas) {
      t += `❓ "${l.desc}" (${fmtNum(l.cantidad)})`;
      if (l.precio_raro) {
        t += ` — ¿es *${l.insumo}*? El precio no cuadra: la factura da ${fmtCOP(l.precio_unit || 0)} y lo tienes a ${fmtCOP(l.precio_viejo || 0)}.\n`;
      } else {
        t += l.insumo ? ` — ¿es *${l.insumo}*?\n` : ` — ¿a qué insumo corresponde?\n`;
      }
    }
    t += `\nDime por ejemplo: _"la manguera es salchicha"_ y lo guardo para siempre.\n`;
  }
  t += listos.length
    ? `\nResponde *SÍ* para aplicar${dudas.length ? " lo que está listo" : ""}.`
    : `\nDime a qué insumo corresponde cada uno y los aplico.`;
  return t;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json();
    const branch_id = String(b.branch_id || "");
    const phone     = String(b.phone || "");
    const mediaUrl  = b.media_url ? String(b.media_url) : "";
    const mensaje   = String(b.message || "").trim();
    if (!branch_id) return json({ error: "branch_id requerido" }, 400);

    const insumos = await cargarInsumos(branch_id);
    if (!insumos.length) return json({ reply: "No encuentro insumos en el inventario de esta sede." });
    const alias = (await sbGet(`/iv_insumo_alias?branch_id=eq.${branch_id}&select=*`) as Array<Record<string, unknown>> | null) || [];

    // ── A) LLEGÓ UNA FOTO: leer la factura y proponer ──────────────────
    if (mediaUrl) {
      if (!OPENAI_KEY) return json({ reply: "No tengo configurada la lectura de facturas." });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o", temperature: 0, response_format: { type: "json_object" },
          messages: [{
            role: "user",
            content: [
              { type: "text", text:
`Lee esta factura de compra de un restaurante y devuelve JSON EXACTO:
{"proveedor":"nombre del negocio que vende","total":number,"lineas":[{"desc":"descripción del producto TAL CUAL aparece","cantidad":number,"valor_total":number}]}
REGLAS:
- "cantidad" es la columna de cantidad de la factura (cuántas unidades de ESE empaque se compraron).
- "valor_total" es el valor total de esa línea (no el unitario).
- "desc" copiado literal, con su empaque ("MAIZ CONGELAD CAJAx10pqt").
- Solo productos. Ignora subtotales, IVA, totales, formas de pago.
- Si no logras leer la factura, devuelve {"lineas":[]}.` },
              { type: "image_url", image_url: { url: mediaUrl } },
            ],
          }],
        }),
      });
      const d = await r.json();
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }
      const crudas = (parsed.lineas as Array<Record<string, unknown>>) || [];
      if (!crudas.length) return json({ reply: "No pude leer la factura 🤔. Mándame una foto más nítida, de frente y con buena luz." });

      const lineas: Linea[] = crudas.map((l) => resolver({
        desc: String(l.desc || ""), cantidad: num(l.cantidad) || 1, valor_total: num(l.valor_total),
      }, insumos, alias));

      const prov = String(parsed.proveedor || "");
      const total = num(parsed.total);
      // Una sola factura pendiente a la vez: las anteriores se descartan.
      await sbPatch(`/iv_facturas_pendientes?branch_id=eq.${branch_id}&estado=eq.pendiente`, { estado: "descartada" });
      await sbPost(`/iv_facturas_pendientes`, {
        branch_id, telefono: phone, proveedor: prov, total, lineas, media_url: mediaUrl,
      });
      return json({ reply: armarMensaje(prov, total, lineas), factura: true });
    }

    // ── B) LLEGÓ TEXTO: confirmar o enseñar un sinónimo ────────────────
    const pend = (await sbGet(`/iv_facturas_pendientes?branch_id=eq.${branch_id}&estado=eq.pendiente&order=created_at.desc&limit=1`) as Array<Record<string, unknown>> | null) || [];
    if (!pend.length) return json({ sin_factura: true });
    const f = pend[0];
    let lineas = (f.lineas as Linea[]) || [];
    const m = norm(mensaje);

    if (/^(no|cancela|descarta|dejalo|olvidalo)\b/.test(m)) {
      await sbPatch(`/iv_facturas_pendientes?id=eq.${f.id}`, { estado: "descartada" });
      return json({ reply: "Listo, descarté la factura. No toqué el inventario." });
    }

    // ¿Está enseñando un sinónimo? "la manguera es salchicha"
    if (!/^(si|sí|dale|aplica|confirmo|ok|correcto)\b/.test(m)) {
      const insDicho = insumos.find((i) => {
        const n = norm(i.nombre);
        return n.length >= 4 && m.includes(n);
      });
      const linDicha = lineas.find((l) => {
        const d = norm(l.desc);
        return d.split(" ").some((w) => w.length >= 4 && m.includes(w));
      });
      if (insDicho && linDicha) {
        // ¿CUÁNTAS unidades nuestras trae 1 de la factura? '1 CAJAx10pqt' de
        // maíz son 10 kg, no 1. Se busca: (1) que el gerente lo diga
        // ('...trae 10 kilos'); (2) que el empaque lo diga ('CAJAx10pqt').
        let factor = 0;
        const mDicho = m.match(new RegExp('(?:trae|tiene|son|de)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:kilo|kg|unidad|paquete|paq|litro|gramo)'));
        if (mDicho) factor = Number(String(mDicho[1]).replace(',', '.')) || 0;
        if (!factor) {
          const mx = String(linDicha.desc).match(new RegExp('x\\s*(\\d{1,4})', 'i'));
          if (mx) factor = Number(mx[1]) || 0;
        }
        if (!factor || factor > 500) factor = 1;
        await sbPost(`/iv_insumo_alias`, {
          branch_id, insumo_id: insDicho.id, alias: linDicha.desc,
          alias_norm: norm(linDicha.desc), factor, proveedor: f.proveedor || null,
        });
        lineas = lineas.map((l) => l.desc === linDicha.desc
          ? { ...l, insumo_id: insDicho.id, insumo: insDicho.nombre, factor, buy_unit: insDicho.buy_unit,
              cant_final: l.cantidad * factor, precio_viejo: insDicho.precio,
              precio_unit: (l.cantidad * factor) > 0 ? l.valor_total / (l.cantidad * factor) : 0, ok: true }
          : l);
        await sbPatch(`/iv_facturas_pendientes?id=eq.${f.id}`, { lineas });
        return json({ reply: `👍 Aprendido: *"${linDicha.desc}"* = *${insDicho.nombre}*.\n\n` + armarMensaje(String(f.proveedor || ""), num(f.total), lineas) });
      }
      return json({ reply: "No te entendí 🤔. Dime por ejemplo: _\"la manguera es salchicha\"_, o responde *SÍ* para aplicar lo que está listo." });
    }

    // ── Confirmó: aplicar lo reconocido ────────────────────────────────
    const aplicar = lineas.filter((l) => l.ok && l.insumo_id);
    if (!aplicar.length) return json({ reply: "Todavía no hay nada que pueda aplicar. Dime a qué insumo corresponde cada línea." });
    const hechos: string[] = [];
    for (const l of aplicar) {
      const ins = insumos.find((i) => i.id === l.insumo_id);
      if (!ins) continue;
      const antes = ins.stock;
      const suma = num(l.cant_final);
      const despues = antes + suma;
      const patch: Record<string, unknown> = { stock: despues, updated_at: new Date().toISOString() };
      if (l.precio_unit && l.precio_unit > 0) patch.precio = Math.round(l.precio_unit);
      await sbPatch(`/iv_insumos?id=eq.${ins.id}`, patch);
      ins.stock = despues;
      hechos.push(`• *${ins.nombre}*\n   tenías ${fmtNum(antes)} ${ins.buy_unit} + sumé ${fmtNum(suma)} ${ins.buy_unit}\n   = *${fmtNum(despues)} ${ins.buy_unit}*`);
      // Rastro, igual que los cambios por texto.
      await sbPost(`/pos_gerente_ops`, {
        branch_id, telefono: phone, mensaje: `[factura] ${l.desc}`,
        insumo_id: ins.id, insumo: ins.nombre, accion: "factura",
        cantidad: suma, stock_antes: antes, stock_despues: despues, unidad: ins.buy_unit,
      });
      // Si vino de una duda ya resuelta, se guarda el sinónimo para la próxima.
      if (!alias.some((a) => String(a.alias_norm) === norm(l.desc))) {
        await sbPost(`/iv_insumo_alias`, {
          branch_id, insumo_id: ins.id, alias: l.desc, alias_norm: norm(l.desc),
          factor: num(l.factor) || 1, proveedor: f.proveedor || null,
        });
      }
    }
    await sbPatch(`/iv_facturas_pendientes?id=eq.${f.id}`, { estado: "aplicada" });
    const quedan = lineas.filter((l) => !l.ok).length;
    return json({
      reply: `✅ *Inventario actualizado*\n${hechos.join("\n")}` +
        (quedan ? `\n\nQuedaron ${quedan} sin aplicar porque no supe a qué insumo van. Mándame la foto otra vez cuando quieras enseñármelos.` : ""),
      aplicado: hechos.length,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
