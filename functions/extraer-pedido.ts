const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function norm(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

type ModOpt = { id: string; name: string; price: number };

// Adiciones disponibles para un producto en una presentación concreta (según mod_group_pres)
function adicOptions(
  matched: Record<string, unknown>,
  presId: string,
  allMods: Array<Record<string, unknown>>,
): ModOpt[] {
  const groupIds = (matched.mod_group_ids as string[]) || [];
  const pres = matched.mod_group_pres as Record<string, string[]> | undefined;
  const out: ModOpt[] = [];
  const seen = new Set<string>();
  for (const gid of groupIds) {
    if (pres && Array.isArray(pres[gid]) && presId && !pres[gid].includes(presId)) continue;
    const g = allMods.find(m => String(m.id) === gid);
    const opts = (g?.options as ModOpt[]) || [];
    for (const o of opts) {
      const k = norm(o.name);
      if (!seen.has(k)) { seen.add(k); out.push({ id: o.id, name: o.name, price: Number(o.price) || 0 }); }
    }
  }
  return out;
}

function matchProducto(
  prod: Record<string, unknown>,
  allProducts: Array<Record<string, unknown>>,
  allMods: Array<Record<string, unknown>>,
  allCats: Array<Record<string, unknown>>,
  clienteTexto = "",
): Record<string, unknown> {
  const nombreGPT = String(prod.nombre || "").trim();
  const tamanoGPT = String(prod.tamano || "").trim();
  const tipoGPT   = String(prod.tipo   || "").trim();
  const catGPT    = String(prod.categoria || "").trim();
  const cantidad  = Math.max(1, Number(prod.cantidad) || 1);
  const notas     = prod.notas == null ? "" : String(prod.notas);
  const adicTexto = prod.adiciones == null ? "" : (Array.isArray(prod.adiciones) ? (prod.adiciones as unknown[]).join(", ") : String(prod.adiciones));

  const nl   = norm(nombreGPT);
  // Texto combinado de TODO lo que el cliente especificó (categoría + nombre + tamaño +
  // tipo + notas + adiciones). Se incluyen las adiciones porque un ingrediente puede ser
  // VARIANTE de un producto (ej. Tocineta = 2º ingrediente de la Súper Queso) aunque
  // GPT lo clasifique como adición; así el match de variantes lo captura igual.
  const blob = norm([catGPT, nombreGPT, tamanoGPT, tipoGPT, notas, adicTexto].filter(Boolean).join(" "));
  // nameBlob = SOLO lo que identifica el NOMBRE del plato (sin "tipo"/variante ni adiciones):
  // así una palabra que es VARIANTE (pollo/carne/mixta de una especial) no le da puntaje de
  // nombre a un producto tradicional que se llame igual. Ej: "premium mixta" no infla "Mixta".
  const nameBlob = norm([catGPT, nombreGPT, tamanoGPT, notas].filter(Boolean).join(" "));

  // ══════════════════════════════════════════════════════════════════
  // RECONOCIMIENTO POR CAPAS
  // Antes se buscaba en TODO el catálogo compitiendo nombre contra nombre,
  // y por eso una hamburguesa le podía ganar a una salchipapa. Ahora se
  // resuelve como toma un pedido una persona: primero QUÉ TIPO de cosa es,
  // y solo dentro de ese grupo se busca el producto.
  //
  //   CAPA 1  categoría   (dicha o deducida; si es ambigua se marca)
  //   CAPA 2  producto    (SOLO dentro de la categoría resuelta)
  //   CAPA 3  presentación
  //   CAPA 4  variante
  //   CAPA 5  adiciones
  //   CAPA 6  precio      (sale de lo anterior, nunca se inventa)
  // ══════════════════════════════════════════════════════════════════

  // Lo que ESCRIBIÓ el cliente. Es la verdad: si GPT agrega palabras por su
  // cuenta (ej. "Especial" porque la categoría se llama "Salchipapas
  // Especiales"), el texto real manda.
  const cliBlob = norm(clienteTexto) || blob;

  const catsById = new Map((allCats || []).map(c => [String(c.id), c]));
  const esCatAdicion = (c: Record<string, unknown> | undefined) => {
    if (!c) return false;
    const t = norm(String(c.name || "") + " " + String((c as {comanda_alias?: string}).comanda_alias || ""));
    return t.includes("adicion");
  };
  const esAdicion = (p: Record<string, unknown>) => esCatAdicion(catsById.get(String(p.category_id)));
  const pideAdicion = /adicion|\bextra\b|\bagrega/.test(cliBlob);

  // Palabras con las que un cliente nombra una categoría (nombre + alias, con y
  // sin plural): "salchipapas"→salchipapa, "HAMBURGUESAS"→hamburguesa…
  const catPalabras = (c: Record<string, unknown>) => {
    const out: string[] = [];
    for (const t of [String(c.name || ""), String((c as {comanda_alias?: string}).comanda_alias || "")]) {
      for (const w of norm(t).split(/\s+/)) {
        if (w.length >= 4) { out.push(w); out.push(w.replace(/s$/, "")); }
      }
    }
    return out;
  };

  // ── CAPA 1: CATEGORÍA ───────────────────────────────────────────────
  // 1a) ¿La nombró? Se busca en lo que escribió el cliente y en lo que
  //     entendió GPT (el campo "categoria").
  const textoCat = cliBlob + " " + blob;
  let catsCand = (allCats || []).filter(c => catPalabras(c).some(w => w.length >= 4 && textoCat.includes(w)));
  // Si no pidió una adición, las categorías de adiciones no compiten como plato.
  if (!pideAdicion) catsCand = catsCand.filter(c => !esCatAdicion(c));

  let categoriaConfirmar = false;
  let categoriaOpciones: string[] = [];

  // 1b) No la nombró → DEDUCIRLA: ¿en qué categorías existe un producto que se
  //     llame así? Si aparece en una sola, esa es. Si aparece en varias
  //     (maicitos: adición, hamburguesa y salchipapa) NO se adivina: se marca
  //     para preguntar y se sigue con la más probable.
  const nombreCoincide = (p: Record<string, unknown>) => {
    const pn = norm(String(p.name || ""));
    if (!pn) return false;
    if (nl && (pn === nl || pn.includes(nl) || nl.includes(pn))) return true;
    return pn.length >= 4 && (nameBlob.includes(pn) || cliBlob.includes(pn));
  };
  if (!catsCand.length) {
    const conEseNombre = (allProducts || []).filter(nombreCoincide);
    const ids = new Set(conEseNombre.map(p => String(p.category_id)));
    let cats2 = [...ids].map(id => catsById.get(id)).filter(Boolean) as Array<Record<string, unknown>>;
    if (!pideAdicion) cats2 = cats2.filter(c => !esCatAdicion(c));
    if (cats2.length === 1) {
      catsCand = cats2;
    } else if (cats2.length > 1) {
      // Antes de darla por ambigua: la PRESENTACIÓN desempata. Si el cliente dijo
      // "personal", solo la salchipapa tiene ese tamaño — la hamburguesa no tiene
      // tamaños configurados. Así "una personal de maicitos" se resuelve sola y
      // solo se pregunta cuando de verdad no hay cómo saberlo ("una maicitos").
      const conPres = conEseNombre.filter(p =>
        ((p.presentations as Array<{ name: string }>) || []).some(pr => {
          const prn = norm(pr.name);
          return prn.length >= 3 && cliBlob.includes(prn);
        })
      );
      let cats3 = [...new Set(conPres.map(p => String(p.category_id)))]
        .map(id => catsById.get(id)).filter(Boolean) as Array<Record<string, unknown>>;
      if (!pideAdicion) cats3 = cats3.filter(c => !esCatAdicion(c));

      if (cats3.length === 1) {
        catsCand = cats3;                              // la presentación lo resolvió
      } else {
        catsCand = cats3.length ? cats3 : cats2;
        if (catsCand.length > 1) {
          categoriaConfirmar = true;                   // ambigua de verdad → preguntar
          categoriaOpciones = catsCand.map(c => String(c.name || ""));
        }
      }
    }
  }

  // ── CAPA 2: PRODUCTO, solo dentro de la(s) categoría(s) de la capa 1 ──
  const universo = catsCand.length
    ? (allProducts || []).filter(p => catsCand.some(c => String(c.id) === String(p.category_id)))
    : (allProducts || []).filter(p => pideAdicion || !esAdicion(p));

  let matched: Record<string, unknown> | null = null;
  let bestScore = 0;
  for (const p of universo) {
    const pn = norm(String(p.name || ""));
    if (!pn) continue;
    let score = 0;
    if (nl && pn === nl) score += 12;
    else if (nl && (pn.includes(nl) || nl.includes(pn))) score += 7;
    else if (pn.length >= 4 && nameBlob.includes(pn)) score += 8;
    else {
      const pWords = pn.split(/\s+/).filter(w => w.length >= 4);
      const nWords = nl.split(/\s+/).filter(w => w.length >= 4);
      if (pWords.some(w => nl.includes(w)) || nWords.some(w => pn.includes(w))) score += 4;
    }
    if (score === 0) continue;
    // La presentación dicha por el cliente confirma el producto.
    const preses0 = (p.presentations as Array<{ name: string }>) || [];
    if (preses0.some(pr => { const prn = norm(pr.name); return prn && prn.length >= 3 && blob.includes(prn); })) score += 12;
    const vars0 = (p.variables as Array<{ options: Array<{ name: string }> }>) || [];
    if (vars0.some(v => (v.options || []).some(o => { const on = norm(o.name); return on && on.length >= 3 && blob.includes(on); }))) score += 3;
    // Palabras de MÁS en el nombre del producto que el cliente nunca dijo
    // ("Maicitos Especial" cuando solo dijo "maicitos") → es otro producto.
    const sobran = pn.split(/\s+/).filter(w => w.length >= 4 && !cliBlob.includes(w)).length;
    if (sobran) score -= sobran * 7;
    if (score > bestScore) { bestScore = score; matched = p; }
  }

  if (!matched || bestScore < 4) {
    return {
      product_id: null, cat: "",
      product_name: [nombreGPT, tamanoGPT, tipoGPT].filter(Boolean).join(" · ") || "Producto",
      unit_price: 0, cantidad, tamano: tamanoGPT, pres_id: "", tipo: tipoGPT,
      adiciones: [], adic_options: [], notas, matched: false,
    };
  }

  const presentations = (matched.presentations as Array<{ id: string; name: string; price: number }>) || [];
  const variables = (matched.variables as Array<{ id: string; name: string; options: Array<{ id: string; name: string; price: number; prices?: number[] }> }>) || [];
  const priceMode = String(matched.price_mode || "simple");

  // Presentación (tamaño): buscar el nombre de la presentación en TODO el texto del
  // pedido, no solo en el campo "tamano". Así "familiar"/"personal" se detecta aunque
  // GPT lo ponga en otro campo → nunca más el default silencioso a la primera (Personal).
  const tl = norm(tamanoGPT);
  let presMatch = presentations.find(pr => {
    const prn = norm(pr.name);
    return !!prn && (tl === prn || (tl.length >= 3 && (tl.includes(prn) || prn.includes(tl))) || (prn.length >= 3 && blob.includes(prn)));
  });
  let tamanoConfirmar = false;
  if (!presMatch) {
    if (presentations.length === 1) presMatch = presentations[0];   // solo hay una presentación → esa
    else if (presentations.length > 1) tamanoConfirmar = true;       // varias y ninguna clara → NO adivinar el tamaño
  }
  const presName = presMatch?.name || tamanoGPT;
  const presId   = presMatch?.id || "";
  const presIdx  = presMatch ? presentations.indexOf(presMatch) : -1;

  let price = Number(presMatch?.price) || 0;
  if (!price && priceMode !== "matrix") price = Number(matched.price) || 0;
  // Variantes: recorrer TODOS los grupos, buscando la opción en el texto completo del
  // pedido (ej. Súper Queso: "Primer Ingrediente" + "Segundo Ingrediente"). En modo
  // MATRIZ el precio sale de prices[presIdx] de la opción del grupo de precio.
  const variantesObj: Record<string, unknown> = {};
  const varParts: string[] = [];
  const pricingG = priceMode === "matrix" ? (variables.find(v => (v as {isPricing?: boolean}).isPricing) || variables[0]) : null;
  for (const vg of variables) {
    const vo = (vg.options || []).find(o => { const on = norm(o.name); return !!on && on.length >= 2 && blob.includes(on); });
    if (!vo) continue;
    variantesObj[vg.id] = { id: vo.id, name: vo.name, price: Number(vo.price) || 0, group: vg.name };
    varParts.push(vo.name);
    if (pricingG && vg.id === (pricingG as {id: string}).id) {
      if (Array.isArray(vo.prices) && presIdx >= 0 && presIdx < vo.prices.length) price = Number(vo.prices[presIdx]) || price;
      else if (Number(vo.price) > 0) price = Number(vo.price);
    } else if (Number(vo.price) > 0) { price += Number(vo.price); }
  }

  // NUNCA dejar un producto en $0. Pasa cuando el precio vive en la variante
  // (modo matriz) y el cliente no dijo cuál: "una maicitos personal" sin decir
  // mixta/pollo/carne. Antes quedaba en cero y llegaba así al modal.
  // Se busca el precio en este orden: opción del grupo de precio para esa
  // presentación → precio de la opción → precio base del producto.
  let precioConfirmar = false;
  if (!price) {
    if (pricingG) {
      const opts = ((pricingG as { options?: Array<{ price?: number; prices?: number[] }> }).options) || [];
      for (const o of opts) {
        const cand = (Array.isArray(o.prices) && presIdx >= 0 && presIdx < o.prices.length)
          ? Number(o.prices[presIdx]) : Number(o.price);
        if (cand > 0) { price = cand; precioConfirmar = true; break; }
      }
    }
    if (!price) { price = Number(matched.price) || 0; precioConfirmar = price > 0; }
  }

  // Adiciones disponibles para este producto+tamaño, y cruce de las que pidió el cliente.
  // Se excluyen las que ya son VARIANTE de este producto (ej. Tocineta en la Súper
  // Queso ya se contó como 2º ingrediente → no se duplica como adición).
  const options = adicOptions(matched, presId, allMods);
  const varNames = new Set(varParts.map(v => norm(v)));
  const adiciones: ModOpt[] = [];
  if (adicTexto) {
    for (const raw of adicTexto.split(/[,;]+|\by\b/)) {
      const a = norm(raw);
      if (!a) continue;
      const opt = options.find(o => norm(o.name) === a || a.includes(norm(o.name)) || norm(o.name).includes(a));
      if (opt && !varNames.has(norm(opt.name)) && !adiciones.some(x => x.id === opt.id)) adiciones.push(opt);
    }
  }

  // Nombre para mostrar — MISMA regla que la comanda (tomar-pedido.js): la
  // PRESENTACIÓN va primero; si el producto no tiene nombre de presentación, se usa
  // el alias de la categoría (comanda_alias) o su nombre. Luego el producto y las
  // variantes. Ej: "Personal · Ranchera", "Hamburguesa · Súper Queso".
  const catObj   = (allCats || []).find(c => String(c.id) === String(matched.category_id));
  const catLabel = catObj ? String((catObj.comanda_alias as string) || (catObj.name as string) || "") : "";
  const presLabel = (presMatch && presMatch.name ? String(presMatch.name) : "") || catLabel;
  const displayName = [presLabel, String(matched.name)].concat(varParts).filter(Boolean).join(" · ");
  return {
    product_id: String(matched.id),
    cat: matched.category_id ? String(matched.category_id) : "",
    product_name: displayName,
    unit_price: price, cantidad, tamano: presName, pres_id: presId,
    variantes: variantesObj, tipo: varParts.join(", "),
    adiciones, adic_options: options, notas, matched: true,
    // Banderas de "esto no se pudo resolver solo" → el modal las muestra para
    // que el operador confirme en vez de guardar algo inventado.
    tamano_confirmar: tamanoConfirmar,
    categoria_confirmar: categoriaConfirmar,
    categoria_opciones: categoriaOpciones,
    precio_confirmar: precioConfirmar,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const { conversation_id } = await req.json();
    if (!conversation_id) return json({ error: "conversation_id requerido" }, 400);

    const convRows = await sbGet(`/rest/v1/chat_conversations?id=eq.${conversation_id}&select=*&limit=1`);
    const conv = convRows?.[0];
    if (!conv) return json({ error: "Conversacion no encontrada" }, 404);
    const branchId = String(conv.branch_id || "");
    const tenantId = String(conv.tenant_id || "");

    // Mensajes — SOLO la sesión del pedido ACTUAL (corte por hueco de 4h)
    const GAP_MS = 4 * 60 * 60 * 1000;
    const msgsDesc = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${conversation_id}&order=sent_at.desc&limit=50&select=direction,body,media_type,sent_at`
    ) as Array<Record<string, unknown>> | null || [];
    const sesion: Array<Record<string, unknown>> = [];
    for (let i = 0; i < msgsDesc.length; i++) {
      sesion.push(msgsDesc[i]);
      const cur = new Date(String(msgsDesc[i].sent_at)).getTime();
      const older = (i + 1 < msgsDesc.length) ? new Date(String(msgsDesc[i + 1].sent_at)).getTime() : null;
      if (older !== null && (cur - older) > GAP_MS) break;
    }
    const msgs = sesion.reverse();
    const convText = msgs
      .filter(m => m.media_type == null || m.media_type === "text")
      .map(m => (m.direction === "in" ? "Cliente: " : "Nosotros: ") + String(m.body || "").replace(/\n/g, " "))
      .join("\n");
    if (!convText.trim()) return json({ error: "La conversacion no tiene mensajes de texto" }, 400);

    // Catálogo + grupos de modificadores (adiciones)
    const allProducts = await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=id,name,category_id,price,price_mode,presentations,variables,mod_group_ids,mod_group_pres`
    ) as Array<Record<string, unknown>> | null || [];
    const allMods = await sbGet(
      `/rest/v1/pos_modifier_groups?branch_id=eq.${branchId}&select=id,name,options`
    ) as Array<Record<string, unknown>> | null || [];
    const allCats = await sbGet(
      `/rest/v1/pos_categories?branch_id=eq.${branchId}&select=id,name,comanda_alias,sort_order&order=sort_order.asc`
    ) as Array<Record<string, unknown>> | null || [];

    const catNameById: Record<string, string> = {};
    for (const c of allCats) catNameById[String(c.id)] = String(c.name || "");
    const menuLines = allProducts.map(p => {
      const pres = ((p.presentations as Array<{name:string}>) || []).map(x => x.name).filter(Boolean);
      const vars = ((p.variables as Array<{options:Array<{name:string}>}>) || []).flatMap(v => (v.options||[]).map(o => o.name)).filter(Boolean);
      const cat = catNameById[String(p.category_id)] || "";
      let line = "- " + (cat ? `[${cat}] ` : "") + String(p.name);
      if (pres.length) line += " | tamaños: " + pres.join(", ");
      if (vars.length) line += " | tipos: " + [...new Set(vars)].join(", ");
      return line;
    }).join("\n");

    // Lista de ADICIONES disponibles (para que GPT distinga un ingrediente extra de
    // un tipo/producto, aunque el cliente no diga la palabra "adición").
    const adicList = [...new Set(
      (allMods || []).flatMap(m => ((m.options as Array<{ name: string }>) || []).map(o => o.name)).filter(Boolean)
    )].join(", ");

    const sysMsg =
`Eres un asistente que extrae el PEDIDO de una conversación de WhatsApp de un restaurante colombiano.
Analiza la conversación y devuelve SOLO un JSON con esta forma exacta:
{
  "cliente": string|null,
  "telefono": string|null,
  "direccion": string|null,   // dirección (calle/carrera/número), SIN el barrio
  "barrio": string|null,      // el barrio o sector, aparte (ej. "Bellavista")
  "tipo": "domicilio"|"recoger"|"mesa"|null,
  "pago": string|null,
  "notas": string|null,
  "productos": [
    { "categoria": string|null, "nombre": string, "tamano": string|null, "tipo": string|null, "cantidad": number, "adiciones": string|null, "notas": string|null }
  ]
}

REGLAS IMPORTANTES:
- "categoria": pon la categoría SOLO si el cliente la dice EXPLÍCITAMENTE con la palabra (hamburguesa, perro/perro caliente, sándwich). NO la adivines. Un mismo nombre existe en varias categorías con precios distintos (ej. "Súper Queso" hay de HAMBURGUESA, de SALCHIPAPA y de PERRO), por eso importa. REGLA: si el cliente dice el tamaño "personal" o "familiar" (o no dice categoría), es una SALCHIPAPA → pon "Salchipapa". Si dice "hamburguesa X" → "Hamburguesa". Si dice "perro X" → "Perro". Si dice "sandwich X" → "Sandwich". Si de verdad no hay ninguna pista, pon null.
- Incluye SOLO los productos que el CLIENTE pidió EXPLÍCITAMENTE en ESTA conversación. NO inventes ni agregues productos que no pidió.
- Si el cliente no pidió nada concreto, devuelve "productos": [].
- COLISIÓN DE NOMBRES (MUY IMPORTANTE): algunas palabras como "pollo", "carne" y "mixta" pueden ser el NOMBRE de un plato tradicional O el TIPO/variante de un plato ESPECIAL. Si el cliente menciona un plato especial (por su nombre propio en el menú, ej. "Premium", "Maicitos Especial", "Súper Queso"), ESE nombre especial va en "nombre" y "pollo"/"carne"/"mixta" va en "tipo" (NUNCA como un producto aparte). Ej: "una premium mixta" → nombre: "Premium", tipo: "mixta"; "maicitos especial de pollo" → nombre: "Maicitos Especial", tipo: "pollo". Usa "pollo"/"carne"/"mixta" como NOMBRE solo si NO se menciona ninguna especial (ej. "una salchipapa mixta" → nombre: "Mixta").
- "tipo": incluye TODOS los tipos/ingredientes/variantes que el cliente mencione para ese producto, separados por coma. OJO: algunos productos tienen DOS grupos de variante (ej. una Súper Queso lleva un primer ingrediente Y un segundo, así que "de pollo y tocineta" → tipo: "pollo, tocineta"). No omitas ninguno.
- "adiciones": ingredientes EXTRA que el cliente pide sobre el producto. El cliente NO siempre dice la palabra "adición": puede decir "con", "y", "más", "extra", "le agregas", o solo el nombre (ej. "una premium mixta CON ranchera" o "una ranchera CON tocineta" → adiciones: "tocineta"). Usa la lista ADICIONES DISPONIBLES de abajo para reconocerlas; si un ingrediente aparece ahí, es una adición.
- Distingue el PRODUCTO (nombre del menú) de sus ADICIONES: el producto es lo principal que pide; lo que agrega "con/más/extra" son adiciones.
- Separa el BARRIO en su propio campo "barrio" (no lo mezcles dentro de "direccion").
- Usa EXACTAMENTE los nombres, tamaños y tipos del MENÚ cuando coincidan. Si un dato no aparece, ponlo null.
Responde solo el JSON.

MENÚ DISPONIBLE:
${menuLines || "(sin menú cargado)"}

ADICIONES DISPONIBLES (ingredientes extra que el cliente puede agregar con "con", "más", "extra" o solo el nombre): ${adicList || "(ninguna)"}`;

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sysMsg },
          { role: "user", content: "CONVERSACIÓN:\n" + convText },
        ],
        max_tokens: 900, temperature: 0, response_format: { type: "json_object" },
      }),
    });
    if (!gptRes.ok) return json({ error: "Error de OpenAI: " + (await gptRes.text()) }, 500);
    const gptData = await gptRes.json();
    let extracted: Record<string, unknown> = {};
    try { extracted = JSON.parse(gptData.choices?.[0]?.message?.content || "{}"); } catch { extracted = {}; }

    const productosRaw = (extracted.productos as Array<Record<string, unknown>>) || [];
    // Solo lo que escribió el CLIENTE (sin nuestras respuestas): es la verdad
    // contra la que se valida lo que interpretó GPT.
    const clienteTexto = msgs
      .filter(m => m.direction === "in" && (m.media_type == null || m.media_type === "text"))
      .map(m => String(m.body || "")).join(" ");
    const productos = productosRaw.map(p => matchProducto(p, allProducts, allMods, allCats, clienteTexto));
    const subtotal = productos.reduce((s, p) => {
      const adic = ((p.adiciones as ModOpt[]) || []).reduce((a, x) => a + (Number(x.price) || 0), 0);
      return s + ((Number(p.unit_price) || 0) + adic) * (Number(p.cantidad) || 1);
    }, 0);

    // Catálogo compacto para "agregar producto" en el modal
    const catalogo = allProducts.map(p => ({
      id: String(p.id), name: String(p.name), category_id: p.category_id ? String(p.category_id) : "",
      price: Number(p.price) || 0, price_mode: String(p.price_mode || "simple"),
      presentations: p.presentations || [], variables: p.variables || [],
      mod_group_ids: p.mod_group_ids || [], mod_group_pres: p.mod_group_pres || {},
    }));
    const categorias = allCats.map(c => ({ id: String(c.id), name: String(c.name), comanda_alias: c.comanda_alias ? String(c.comanda_alias) : null }));

    // Teléfono SIN indicativo (57 de Colombia): 573XXXXXXXXX -> 3XXXXXXXXX
    let tel = extracted.telefono ? String(extracted.telefono) : String(conv.contact_handle || "");
    tel = tel.replace(/\D/g, "");
    if (tel.length === 12 && tel.startsWith("57")) tel = tel.slice(2);
    const telefono = tel;
    const cliente  = extracted.cliente ? String(extracted.cliente) : (conv.contact_name ? String(conv.contact_name) : "");

    let direccionTxt = extracted.direccion ? String(extracted.direccion) : "";
    const barrioTxt    = extracted.barrio ? String(extracted.barrio) : "";

    // ── ¿YA ES CLIENTE? ────────────────────────────────────────────────
    // El TELÉFONO es la llave maestra: ahí viven sus datos y sus puntos. Si ya
    // pidió antes, el modal debe llegar con su nombre puesto y sus direcciones
    // guardadas, para no volver a escribirlo todo ni crear un cliente repetido.
    let clienteConocido: Record<string, unknown> | null = null;
    try {
      if (tel) {
        const cl = await sbGet(`/rest/v1/pos_clientes?tenant_id=eq.${tenantId}&telefono=like.*${encodeURIComponent(tel.slice(-10))}&select=id,nombre,direccion,direcciones`) as Array<Record<string, unknown>> | null;
        if (cl && cl.length) {
          const c = cl[0];
          const dirs = Array.isArray(c.direcciones) ? (c.direcciones as string[]) : [];
          if (c.direccion && !dirs.includes(String(c.direccion))) dirs.unshift(String(c.direccion));
          clienteConocido = { id: c.id, nombre: c.nombre, direcciones: dirs };
          // Si el cliente no dijo dirección en este pedido, se usa la última suya.
          if (!direccionTxt && dirs.length) direccionTxt = dirs[dirs.length - 1];
        }
      }
    } catch (_e) { /* si falla, el modal sigue funcionando vacío */ }

    // ── PRECIO DEL DOMICILIO desde la tabla de zonas ────────────────────
    // Las zonas viven en ia_config.domicilios.zonas: {precio, barrios:[...]}.
    // Se busca el barrio en el campo "barrio", en la dirección y en lo que
    // escribió el cliente (a veces lo mete dentro de la dirección:
    // "cr 16 #57-03 barrio La Gran Bretaña"). Gana la coincidencia MÁS LARGA
    // para que "Claros del Bosque" no la robe "El Bosque".
    let domiPrecio = 0;
    let domiBarrio = "";
    let domiConfirmar = false;
    try {
      const cfgRow = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&select=domicilios&limit=1`) as Array<Record<string, unknown>> | null;
      const zonas = (((cfgRow?.[0]?.domicilios || {}) as Record<string, unknown>).zonas || []) as Array<{ precio?: number; barrios?: string[] }>;
      const donde = norm([barrioTxt, direccionTxt, clienteTexto].filter(Boolean).join(" | "));
      // También se compara SIN espacios: la gente escribe "BELLAVISTA" y en la
      // tabla está "Bella Vista"; sin esto no se reconocía y quedaba sin precio.
      const dondeSinEsp = donde.replace(/\s+/g, "");
      let mejor = 0;
      for (const z of zonas) {
        for (const b of (z.barrios || [])) {
          const bn = norm(String(b || ""));
          if (bn.length < 4) continue;
          const bnSinEsp = bn.replace(/\s+/g, "");
          const hay = donde.includes(bn) || (bnSinEsp.length >= 6 && dondeSinEsp.includes(bnSinEsp));
          if (hay && bn.length > mejor) {
            mejor = bn.length; domiPrecio = Number(z.precio) || 0; domiBarrio = String(b);
          }
        }
      }
      // Domicilio sin barrio reconocido: se deja en 0 y se avisa, en vez de
      // inventar una tarifa. El operador lo escribe y el sistema aprende cuál era.
      if (String(extracted.tipo || "domicilio") === "domicilio" && !domiPrecio) domiConfirmar = true;
    } catch (_e) { domiConfirmar = true; }

    return json({
      ok: true,
      order: {
        cliente: (clienteConocido && String(clienteConocido.nombre || "")) || cliente,
        telefono,
        cliente_conocido: clienteConocido ? true : false,
        cliente_id: clienteConocido ? clienteConocido.id : null,
        direcciones_guardadas: clienteConocido ? clienteConocido.direcciones : [],
        direccion: direccionTxt,
        barrio: domiBarrio || barrioTxt,
        tipo: extracted.tipo ? String(extracted.tipo) : "domicilio",
        pago: extracted.pago ? String(extracted.pago) : "",
        notas: extracted.notas ? String(extracted.notas) : "",
        domi_precio: domiPrecio,
        domi_barrio: domiBarrio,
        domi_confirmar: domiConfirmar,
        productos, subtotal, branch_id: branchId, tenant_id: tenantId,
      },
      catalogo, categorias, mods: allMods,
    });

  } catch (e) {
    console.error("extraer-pedido error:", e);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
