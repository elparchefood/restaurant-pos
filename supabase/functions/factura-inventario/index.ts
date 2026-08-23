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
  /* Se sabe QUE insumo es pero no CUANTAS unidades trae el empaque. */
  duda_cantidad?: boolean;
  buy_unit?: string; cant_final?: number; precio_unit?: number; precio_viejo?: number;
  ok?: boolean;                 // reconocido → se puede aplicar
  precio_raro?: boolean;        // el precio no cuadra con ese insumo
};

/* EN QUE FILA DE EXISTENCIAS se descuenta: la bolsa comun de la marca (modo
   global) o la de esta sede. Vive aparte porque lo necesitan los dos momentos:
   al leer la factura y al aplicarla. Tenerlo dentro de `cargarInsumos` costo un
   "sedeF is not defined" que dejaba la confirmacion muerta. */
async function sedeExistencia(branch_id: string): Promise<string | null> {
  const br = await sbGet(`/branches?id=eq.${branch_id}&select=brand_id&limit=1`) as Array<Record<string, unknown>> | null;
  const brand = br?.[0]?.brand_id as string | undefined;
  if (!brand) return null;
  const marca = await sbGet(`/brands?id=eq.${brand}&select=inventario_modo&limit=1`) as Array<Record<string, unknown>> | null;
  return String(marca?.[0]?.inventario_modo || "global") === "sucursal" ? branch_id : null;
}

async function cargarInsumos(branch_id: string): Promise<Insumo[]> {
  /* EL STOCK VIVE EN `iv_existencias` (18-ago). Esta funcion pedia las columnas
     viejas de `iv_insumos` y el SELECT devolvia 400: contestaba "No encuentro
     insumos" a TODO, y el webhook convertia esa respuesta en un "solo entiendo
     texto" que no tenia nada que ver. Mismo arreglo que gerente-inventario. */
  const brRows = await sbGet(`/branches?id=eq.${branch_id}&select=tenant_id,brand_id&limit=1`) as Array<Record<string, unknown>> | null;
  const brandF = brRows?.[0]?.brand_id as string | undefined;
  const marcaF = brandF ? await sbGet(`/brands?id=eq.${brandF}&select=inventario_modo&limit=1`) as Array<Record<string, unknown>> | null : null;
  const sedeF: string | null = String(marcaF?.[0]?.inventario_modo || "global") === "sucursal" ? branch_id : null;
  const filtroF = brandF ? `brand_id=eq.${brandF}` : `branch_id=eq.${branch_id}`;
  const rows = await sbGet(`/iv_insumos?${filtroF}&activo=eq.true&select=id,nombre,buy_unit,use_unit,conversion,precio,iv_existencias(branch_id,stock)`) as Array<Record<string, unknown>> | null;
  return (rows || []).map((i) => ({
    id: String(i.id), nombre: String(i.nombre), buy_unit: String(i.buy_unit || "unidad"),
    use_unit: String(i.use_unit || "unidad"), conversion: num(i.conversion) || 1,
    stock: num((((i.iv_existencias as Array<Record<string, unknown>>) || [])
      .find((e) => ((e.branch_id as string | null) || null) === sedeF) || {}).stock),
    precio: num(i.precio),
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
/* CUANTAS UNIDADES NUESTRAS TRAE UN EMPAQUE DE LA FACTURA. El proveedor lo
   escribe en la descripcion: "CAJAx10pqt" son 10, no 1. (21-ago-2026: por no
   leerlo, 10 kilos de maiz entraron como 1 kilo Y el precio del kilo paso de
   $7.900 a $79.000 — el mismo error dañaba las dos cosas.) */
function multiploDelEmpaque(desc: string): number {
  const m = String(desc || "").match(new RegExp("x\\s*(\\d{1,4})", "i"));
  const n = m ? Number(m[1]) : 0;
  return (n > 1 && n <= 500) ? n : 1;
}
/* EL PRECIO NO MIENTE: si el kilo nos vale $7.900 y esta linea lo deja en
   $79.000, el empaque NO es el que creemos. Se usa para aceptar o dudar. */
function razonPrecio(valorTotal: number, cantFinal: number, precioConocido: number): number {
  if (!(cantFinal > 0) || !(precioConocido > 0)) return 1;
  return (valorTotal / cantFinal) / precioConocido;
}
const precioCuadra = (r: number) => r <= 2.5 && r >= 0.4;

function resolver(l: Linea, insumos: Insumo[], alias: Array<Record<string, unknown>>): Linea {
  const d = norm(l.desc);
  const a = alias.find((x) => {
    const an = String(x.alias_norm);
    return an === d || d.includes(an) || an.includes(d);
  });
  if (a) {
    const ins = insumos.find((i) => i.id === String(a.insumo_id));
    if (ins) {
      /* EL SINONIMO DICE QUE INSUMO ES, PERO NO CUANTO TRAE ESTE EMPAQUE.
         Un alias corto ("maiz") se traga cualquier descripcion que lo
         contenga, y su factor viejo se aplicaba a ciegas — saltandose el
         control de precio que si hace la busqueda por nombre. Ahora el precio
         manda tambien aqui: si con el factor del alias la cuenta no cuadra,
         se prueba con lo que dice el empaque, y si tampoco, se PREGUNTA. */
      const facAlias = num(a.factor) || 1;
      const facEmpaque = multiploDelEmpaque(l.desc);
      const rAlias = razonPrecio(l.valor_total, l.cantidad * facAlias, ins.precio);
      const rEmpaque = razonPrecio(l.valor_total, l.cantidad * facEmpaque, ins.precio);
      const factor = precioCuadra(rAlias) ? facAlias
                   : precioCuadra(rEmpaque) ? facEmpaque
                   : 0;   // 0 = ninguna cuenta cuadra: no se adivina
      if (factor > 0) {
        const cantFinal = l.cantidad * factor;
        return { ...l, insumo_id: ins.id, insumo: ins.nombre, factor, buy_unit: ins.buy_unit,
          cant_final: cantFinal, precio_viejo: ins.precio,
          precio_unit: cantFinal > 0 ? l.valor_total / cantFinal : 0, ok: true };
      }
      /* Se sabe QUE es, pero no CUANTO trae: se pregunta en vez de meter una
         cantidad inventada y un precio diez veces mayor. Es una duda DISTINTA
         de "no se que insumo es", y se pregunta distinto. */
      return { ...l, insumo_id: null, insumo: ins.nombre, factor: 1, buy_unit: ins.buy_unit,
        cant_final: l.cantidad, precio_viejo: ins.precio,
        precio_unit: l.cantidad > 0 ? l.valor_total / l.cantidad : 0,
        precio_raro: true, duda_cantidad: true, ok: false };
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
  /* Si el precio no cuadra de a uno, puede ser un empaque multiple: se prueba
     con lo que dice la descripcion ("CAJAx10pqt") antes de dudar. */
  const facE = multiploDelEmpaque(l.desc);
  const rE = razonPrecio(l.valor_total, l.cantidad * facE, mejor.precio);
  const usaEmpaque = facE > 1 && !precioCuadra(razon) && precioCuadra(rE);
  // Seguro solo si: gana claro Y el precio es coherente. El precio delata
  // empaques distintos (una caja de 10 cuesta 10 veces más que la unidad).
  const claro = pts >= 8 && (pts - rival) >= 3 && (precioCuadra(razon) || usaEmpaque);

  if (claro) {
    const fac = usaEmpaque ? facE : 1;
    const cf = l.cantidad * fac;
    return { ...l, insumo_id: mejor.id, insumo: mejor.nombre, factor: fac, buy_unit: mejor.buy_unit,
      cant_final: cf, precio_viejo: mejor.precio,
      precio_unit: cf > 0 ? l.valor_total / cf : 0, ok: true };
  }
  return { ...l, insumo_id: null, insumo: puntajes.slice(0, 2).map((x) => x.i.nombre).join(" o "),
    precio_unit: pu, precio_viejo: mejor.precio,
    precio_raro: pts >= 8 && (razon > 2.5 || razon < 0.4), ok: false };
}

// Por debajo de esta raya el cambio de precio es redondeo del proveedor y se
// aplica solo; por encima, es una subida de verdad y la decide el gerente.
function cambioFuerte(l: Linea): boolean {
  const viejo = num(l.precio_viejo), nuevo = num(l.precio_unit);
  return viejo > 0 && nuevo > 0 && Math.abs(nuevo - viejo) / viejo > 0.03;
}

function armarMensaje(prov: string, total: number, lineas: Linea[]): string {
  const listos = lineas.filter((l) => l.ok);
  const dudas  = lineas.filter((l) => !l.ok);
  let t = `📄 *Factura ${prov ? "de " + prov : ""}* · ${fmtCOP(total)}\n`;
  if (listos.length) {
    t += `\n*Listo para aplicar:*\n`;
    for (const l of listos) {
      const sube = cambioFuerte(l);
      t += `✅ ${l.insumo} +${fmtNum(l.cant_final || 0)} ${l.buy_unit}`;
      /* SI EL EMPAQUE TRAE VARIAS, SE DICE. Es la cuenta que mas facil se
         equivoca (la caja de 10 que entro como 1), asi que se muestra para
         que el gerente la pueda desmentir de un vistazo. */
      if (num(l.factor) > 1) {
        t += `\n    (${fmtNum(l.cantidad)} × ${fmtNum(num(l.factor))} por empaque)`;
      }
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
      if (l.duda_cantidad) {
        /* Se sabe que es; lo que no cuadra es CUANTO trae el empaque. */
        t += ` — sé que es *${l.insumo}*, pero no me cuadra cuánto trae: a ese precio ` +
             `saldría a ${fmtCOP(l.precio_unit || 0)} y lo tienes a ${fmtCOP(l.precio_viejo || 0)}. ` +
             `¿Cuántos ${l.buy_unit} trae ese empaque?\n`;
      } else if (l.precio_raro) {
        t += ` — ¿es *${l.insumo}*? El precio no cuadra: la factura da ${fmtCOP(l.precio_unit || 0)} y lo tienes a ${fmtCOP(l.precio_viejo || 0)}.\n`;
      } else {
        t += l.insumo ? ` — ¿es *${l.insumo}*?\n` : ` — ¿a qué insumo corresponde?\n`;
      }
    }
    const hayCant = dudas.some((l) => l.duda_cantidad);
    t += hayCant
      ? `\nDime por ejemplo: _"la caja trae 10 kilos"_, o _"la manguera es salchicha"_ si es otro insumo.\n`
      : `\nDime por ejemplo: _"la manguera es salchicha"_ y lo guardo para siempre.\n`;
  }
  // Si hay subidas de verdad, se explica ahi mismo como aceptarlas. Un aviso
  // que no dice que hacer con el solo sirve para preocupar.
  const conSubida = listos.filter((l) => cambioFuerte(l));
  if (conSubida.length) {
    t += `\n_Los precios con ⚠️ NO los cambio solo._ Si alguno ya es el precio ` +
      `de siempre, dime por ejemplo: *SÍ, actualiza el precio de ${conSubida[0].insumo}*.\n`;
  }
  /* SE LE DICE QUE PUEDE DEJAR ALGO POR FUERA (21-ago-2026). Antes solo se
     ofrecia SI o NO, y "aplica todo menos el maiz" —que es como habla
     cualquiera— caia en el "si" y se aplicaba todo. */
  t += listos.length
    ? `\nResponde *SÍ* para aplicar${dudas.length ? " lo que está listo" : ""}` +
      (listos.length > 1 ? `, o *aplica todo menos ${listos[0].insumo}* si quieres dejar alguno por fuera.` : `.`)
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
      // Palabras de empaque y medida: las comparten casi todas las lineas de
      // una factura, asi que emparejar por ellas es emparejar al azar. Fue
      // lo que paso con "el galon de salsa bbq", que engancho con
      // "ROSADA DIF-GALON BOLSA" solo por la palabra "galon".
      const GENERICAS = new Set(["galon","galones","bolsa","bolsas","caja","cajas","paca","pacas",
        "paquete","paquetes","kilo","kilos","gramo","gramos","litro","litros","unidad","unidades",
        "libra","libras","docena","botella","botellas","frasco","frascos","lata","latas","tarro",
        "tarros","balde","baldes","bulto","bultos","pote","potes","sobre","sobres","rollo","rollos",
        "este","esta","eso","esa","para","como","cada","todo","toda","del","las","los"]);

      // UN RENGLON = UNA ENSEÑANZA. La gente manda los tres juntos, que es lo
      // natural; leer el mensaje entero como una sola frase hacia que el primer
      // "es" se tragara todo lo demas y solo se aprendiera uno.
      const frases = mensaje.split(new RegExp("[" + NL + ";]+"))
        .map((x) => norm(x)).filter((x) => x.length > 2);

      const aprendidos: string[] = [];   // los que si engancharon
      const dudosos: string[] = [];      // se entendio el insumo, no la linea
      const perdidos: string[] = [];     // ni lo uno ni lo otro

      for (const frase of frases) {
        // La frase tiene forma "LO DE LA FACTURA es LO NUESTRO". Partirla por
        // ahi es lo unico que separa bien las dos mitades: sin partir, palabras
        // como "rosada" o "bbq" estan en las DOS y no se sabe de quien son.
        const corte = frase.match(new RegExp("\\s(?:es|son|seria|significa|equivale a|igual a|=)\\s"));
        let ladoLinea = frase, ladoIns = frase;
        if (corte && corte.index !== undefined) {
          ladoLinea = frase.slice(0, corte.index).trim();
          ladoIns   = frase.slice(corte.index + corte[0].length).trim();
        }

        // Del lado derecho gana el insumo de nombre MAS LARGO: "salsa bbq" es
        // "Salsa bbq" y no "Salsa" a secas.
        let insDicho: Insumo | null = null;
        for (const it of insumos) {
          const n = norm(it.nombre);
          if (n.length >= 3 && ladoIns.includes(n) &&
              (!insDicho || n.length > norm(insDicho.nombre).length)) insDicho = it;
        }

        // Del lado izquierdo gana la linea con el emparejamiento mas fuerte, no
        // la primera que comparta cualquier palabra. Palabra COMPLETA, no
        // pedazo: "gal" no puede casar dentro de "galon".
        const dichas = new Set(ladoLinea.split(" "));
        let linDicha: Linea | null = null, mejor = 0;
        for (const l of lineas) {
          let puntos = 0;
          for (const w of norm(l.desc).split(" ")) {
            if (w.length >= 3 && !GENERICAS.has(w) && dichas.has(w)) puntos += w.length;
          }
          if (puntos > mejor) { mejor = puntos; linDicha = l; }
        }

        // Sin una palabra propia de la linea NO se adivina: aprender mal un
        // sinonimo envenena todas las facturas siguientes de ese proveedor.
        if (!insDicho || !linDicha) {
          if (insDicho) dudosos.push(insDicho.nombre); else perdidos.push(frase);
          continue;
        }

        // ¿CUANTAS unidades nuestras trae 1 de la factura? '1 CAJAx10pqt' de
        // maiz son 10 kg, no 1. Se busca: (1) que el gerente lo diga
        // ('...trae 10 kilos'); (2) que el empaque lo diga ('CAJAx10pqt').
        let factor = 0;
        const mDicho = frase.match(new RegExp("(?:trae|tiene|son|de)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:kilo|kg|unidad|paquete|paq|litro|gramo)"));
        if (mDicho) factor = Number(String(mDicho[1]).replace(",", ".")) || 0;
        if (!factor) {
          const mx = String(linDicha.desc).match(new RegExp("x\\s*(\\d{1,4})", "i"));
          if (mx) factor = Number(mx[1]) || 0;
        }
        if (!factor || factor > 500) factor = 1;

        /* EL PRECIO MANDA, TAMBIEN CUANDO LO DICE EL GERENTE (22-ago-2026).

           Sergio contesto "un paquete de Coca-Cola que TRAE 12 UNIDADES" y ese
           12 se tomo como multiplicador: entraron 12 PAQUETES = 144 botellas,
           cuando era UN paquete. El insumo ya se compra en "paq. x12": ese doce
           ya estaba contado, y el gerente solo estaba describiendo su propio
           paquete.

           No se puede resolver mirando solo la palabra —"trae 12" puede ser una
           CAJA de 12 paquetes, y ahi el 12 SI multiplica—, pero el precio no
           miente: una caja de doce cuesta doce veces lo que un paquete. Se
           prueban las dos cuentas contra el precio que ya conocemos y gana la
           que cuadra. Es el mismo control que ya hace la busqueda por nombre;
           aqui se confiaba en el numero a ciegas. */
        if (factor > 1 && insDicho.precio > 0 && linDicha.valor_total > 0 && linDicha.cantidad > 0) {
          const rUno  = razonPrecio(linDicha.valor_total, linDicha.cantidad, insDicho.precio);
          const rMult = razonPrecio(linDicha.valor_total, linDicha.cantidad * factor, insDicho.precio);
          if (!precioCuadra(rMult) && precioCuadra(rUno)) {
            console.log(`[factura] "${linDicha.desc}": el gerente dijo x${factor}, pero el precio dice x1 — se deja en 1`);
            factor = 1;
          }
        }

        const ins = insDicho, lin = linDicha, fac = factor;
        await sbPost(`/iv_insumo_alias`, {
          branch_id, insumo_id: ins.id, alias: lin.desc,
          alias_norm: norm(lin.desc), factor: fac, proveedor: f.proveedor || null,
        });
        lineas = lineas.map((l) => l.desc === lin.desc
          ? { ...l, insumo_id: ins.id, insumo: ins.nombre, factor: fac, buy_unit: ins.buy_unit,
              cant_final: l.cantidad * fac, precio_viejo: ins.precio,
              precio_unit: (l.cantidad * fac) > 0 ? l.valor_total / (l.cantidad * fac) : 0, ok: true }
          : l);
        aprendidos.push(`*"${lin.desc}"* = *${ins.nombre}*`);
      }

      if (aprendidos.length) {
        await sbPatch(`/iv_facturas_pendientes?id=eq.${f.id}`, { lineas });
        let txt = "\ud83d\udc4d Aprendido:" + NL + aprendidos.map((a) => "\u2022 " + a).join(NL);
        // Lo que NO engancho se dice aparte, para que no se pierda entre lo
        // que si: el error de hoy fue justamente creer que se habia aprendido
        // todo cuando solo se habia aprendido uno.
        if (dudosos.length) txt += NL + NL + "No supe a cu\u00e1l l\u00ednea va: " + dudosos.join(", ") +
          ". C\u00f3piame la descripci\u00f3n como sale en la factura.";
        return json({ reply: txt + NL + NL + armarMensaje(String(f.proveedor || ""), num(f.total), lineas) });
      }

      if (dudosos.length) {
        const faltan = lineas.filter((l) => !l.ok).map((l) => "\u2022 " + l.desc).join(NL);
        return json({ reply: "Te entend\u00ed " + dudosos.join(", ") + ", pero no s\u00e9 a cu\u00e1l l\u00ednea va \ud83e\udd14." + NL + NL +
          "C\u00f3piame la descripci\u00f3n como sale en la factura:" + NL + faltan });
      }
      return json({ reply: "No te entendí 🤔. Dime por ejemplo: _\"la manguera es salchicha\"_, o responde *SÍ* para aplicar lo que está listo." });
    }

    // ── Confirmó: aplicar lo reconocido ────────────────────────────────
    let aplicar = lineas.filter((l) => l.ok && l.insumo_id);
    if (!aplicar.length) return json({ reply: "Todavía no hay nada que pueda aplicar. Dime a qué insumo corresponde cada línea." });
    // Lo que dijo DESPUES del "sí" es donde pide los precios.
    const resto = m.replace(new RegExp("^(si|dale|aplica|confirmo|ok|correcto)\\b"), "").trim();

    /* "APLICA TODO MENOS EL MAIZ" — Y SE OBEDECE (21-ago-2026, lo vio Sergio).
       "aplica" hacia juego con el "sí" y se metia TODO, incluido justo lo que
       pidio dejar por fuera: decirle que si y hacer lo contrario es peor que
       no entenderle. Lo que va despues de menos/excepto/sin son los que NO
       entran. */
    const mExcl = resto.match(new RegExp("(?:menos|excepto|salvo|sin)\\s+(.+)$"));
    const excluidos: string[] = [];
    if (mExcl) {
      const pedidas = new Set(String(mExcl[1]).split(new RegExp("[^a-z0-9]+")).filter((w) => w.length >= 3));
      const fuera = aplicar.filter((l) => {
        const nom = norm(l.insumo || "") + " " + norm(l.desc || "");
        return nom.split(new RegExp("[^a-z0-9]+")).some((w) => w.length >= 3 && pedidas.has(w));
      });
      if (fuera.length) {
        for (const l of fuera) excluidos.push(String(l.insumo || l.desc));
        const ids = new Set(fuera.map((l) => l.desc));
        aplicar = aplicar.filter((l) => !ids.has(l.desc));
        /* Lo excluido NO se aplica y TAMPOCO se aprende como sinonimo: si el
           gerente lo saco es porque algo no cuadraba. */
        lineas = lineas.map((l) => ids.has(l.desc) ? { ...l, ok: false } : l);
      } else {
        /* Pidio excluir algo que no esta en la factura: se dice, no se
           aplica todo callado. */
        return json({ reply: `No encontré *${String(mExcl[1])}* en esta factura 🤔. Dime el nombre como aparece en la lista y lo dejo por fuera, o responde *SÍ* para aplicar todo.` });
      }
      if (!aplicar.length) {
        await sbPatch(`/iv_facturas_pendientes?id=eq.${f.id}`, { estado: "descartada" });
        return json({ reply: "Entonces no quedó nada por aplicar. No toqué el inventario 👍" });
      }
    }
    const todosLosPrecios = /\btodos?\b[^.]{0,20}\bprecios?\b/.test(resto) && !/(no|ning)/.test(resto);

    // Una palabra solo sirve para señalar a un insumo si no la comparte con
    // otro de la misma factura: "salsa" no distingue nada entre tres salsas.
    const conteo = new Map<string, number>();
    for (const l of aplicar) {
      for (const w of new Set(norm(l.insumo || "").split(" "))) {
        if (w.length >= 4) conteo.set(w, (conteo.get(w) || 0) + 1);
      }
    }
    const pedido = new Set(resto.split(" "));
    const loNombro = (nombre: string) => norm(nombre).split(" ")
      .some((w) => w.length >= 4 && conteo.get(w) === 1 && pedido.has(w));

    const hechos: string[] = [], sinTocar: string[] = [];
    for (const l of aplicar) {
      const ins = insumos.find((i) => i.id === l.insumo_id);
      if (!ins) continue;
      const antes = ins.stock;
      const suma = num(l.cant_final);
      const despues = antes + suma;
      const patch: Record<string, unknown> = { stock: despues, updated_at: new Date().toISOString() };
      const nuevoPrecio = num(l.precio_unit);
      let tocaPrecio = nuevoPrecio > 0;
      if (tocaPrecio && cambioFuerte(l) && !todosLosPrecios && !loNombro(ins.nombre)) {
        tocaPrecio = false;
        sinTocar.push(`• *${ins.nombre}*: sigue en ${fmtCOP(ins.precio)} (la factura daba ${fmtCOP(nuevoPrecio)})`);
      }
      if (tocaPrecio) patch.precio = Math.round(nuevoPrecio);
      const pAny = patch as Record<string, unknown>;
      if (pAny.stock !== undefined) {
        await sbPost(`/rpc/fn_iv_fijar_existencia`, { p_insumo: ins.id, p_branch: await sedeExistencia(branch_id), p_stock: pAny.stock, p_servicio: null, p_agotado: null });
        delete pAny.stock;
      }
      if (Object.keys(pAny).length) await sbPatch(`/iv_insumos?id=eq.${ins.id}`, patch);
      const avisoPrecio = (tocaPrecio && cambioFuerte(l))
        ? `\n   precio: ${fmtCOP(ins.precio)} → *${fmtCOP(nuevoPrecio)}*` : "";
      hechos.push(`• *${ins.nombre}*\n   tenías ${fmtNum(antes)} ${ins.buy_unit} + sumé ${fmtNum(suma)} ${ins.buy_unit}\n   = *${fmtNum(despues)} ${ins.buy_unit}*` + avisoPrecio);
      ins.stock = despues;
      if (tocaPrecio) ins.precio = Math.round(nuevoPrecio);
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
    /* Lo EXCLUIDO no cuenta como "no supe a que insumo va": si se marca ok
       false para no aplicarlo, el cierre decia las dos cosas del mismo
       renglon y se contradecia solo. */
    const excl = new Set(excluidos.map((x) => norm(x)));
    const quedan = lineas.filter((l) => !l.ok && !excl.has(norm(l.insumo || ""))).length;
    return json({
      reply: `✅ *Inventario actualizado*\n${hechos.join("\n")}` +
        (excluidos.length ? `\n\n🚫 *No toqué* (me dijiste que lo dejara por fuera): ${excluidos.join(", ")}` : "") +
        (sinTocar.length ? `\n\n*Precios que dejé como estaban:*\n${sinTocar.join("\n")}` +
          `\n\nSi alguno ya es el precio de siempre, dímelo y lo cambio.` : "") +
        (quedan ? `\n\nQuedaron ${quedan} sin aplicar porque no supe a qué insumo van. Mándame la foto otra vez cuando quieras enseñármelos.` : ""),
      aplicado: hechos.length,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
