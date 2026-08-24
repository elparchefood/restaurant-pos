const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── GPT helper (con imágenes) — con REINTENTOS y errores REALES ───────────
// Antes: si OpenAI fallaba (rate limit, error transitorio), esto devolvía {}
// en silencio y la UI mostraba "No se detectaron categorías" sin razón real.
async function callGPT(
  apiKey: string,
  prompt: string,
  images: Array<{ data: string; mimeType: string }>,
  maxTokens = 8192,
): Promise<unknown> {
  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.data}`, detail: "high" },
    });
  }
  let lastErr = "";
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        lastErr = (json as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
        console.error(`callGPT intento ${intento}/3 falló:`, lastErr);
        if (intento < 3) await new Promise(r => setTimeout(r, 2500 * intento));
        continue;
      }
      const text = (json as { choices?: Array<{ message?: { content?: string } }> })
        .choices?.[0]?.message?.content;
      if (!text) { lastErr = "respuesta vacía de OpenAI"; continue; }
      return JSON.parse(text);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.error(`callGPT intento ${intento}/3 excepción:`, lastErr);
      if (intento < 3) await new Promise(r => setTimeout(r, 2500 * intento));
    }
  }
  throw new Error(`La IA no pudo analizar la imagen (${lastErr}). Vuelve a intentar en unos segundos.`);
}

// ── GPT helper (solo texto) — mismos reintentos ───────────────────────────
async function callGPTText(apiKey: string, prompt: string): Promise<unknown> {
  let lastErr = "";
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 4096,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        lastErr = (json as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
        if (intento < 3) await new Promise(r => setTimeout(r, 2500 * intento));
        continue;
      }
      const text = (json as { choices?: Array<{ message?: { content?: string } }> })
        .choices?.[0]?.message?.content;
      if (!text) { lastErr = "respuesta vacía"; continue; }
      return JSON.parse(text);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (intento < 3) await new Promise(r => setTimeout(r, 2500 * intento));
    }
  }
  throw new Error(`La IA no respondió (${lastErr}). Vuelve a intentar.`);
}

// ── MODO: recipe — Generar receta desde descripción del plato ─────────────
async function runRecipe(
  apiKey: string,
  body: {
    productName: string;
    description: string;
    baseIngredients: string[];
    existingInsumos: string[];
  },
): Promise<unknown> {
  const { productName, description, baseIngredients, existingInsumos } = body;

  const baseList = baseIngredients.map((b, i) => `${i + 1}. ${b}`).join("\n");
  const existingList = existingInsumos.length
    ? existingInsumos.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "(ninguno aún)";

  const prompt = `Eres un experto en cocina colombiana y gestión de inventario de restaurantes.

PRODUCTO: "${productName}"
DESCRIPCIÓN DEL PLATO: "${description || "(sin descripción)"}"

INGREDIENTES DE "LA BASE" (grupo de ingredientes compartidos):
${baseList}

INSUMOS YA REGISTRADOS EN EL INVENTARIO:
${existingList}

TU TAREA:
Genera la lista completa de ingredientes para cocinar este plato.

REGLAS:
1. Si la descripción dice "Base", incluye TODOS los ingredientes de la Base listados arriba.
   Márcalos con "isBase": true.
2. Agrega los ingredientes adicionales mencionados en la descripción.
   Márcalos con "isBase": false.
3. Para cada ingrediente sugiere:
   - qty: cantidad numérica típica para UNA porción (sé realista para restaurante colombiano)
   - unit: unidad de medida (g, kg, ml, l, unidad, porciones, cucharada, taza, etc.)
   - category: categoría de insumo (Materia prima, Lácteos y quesos, Salsas y abarrotes, Bebidas envasadas, etc.)
4. Si un ingrediente ya existe en la lista de insumos registrados (comparación por nombre similar),
   agrega "existingName": "nombre exacto como aparece en la lista de insumos".
5. Usa nombres en español, normalizados (ej: "Carne desmechada", "Salsa de tomate").
6. NO inventes ingredientes que no estén en la descripción o en la Base.
7. Si la descripción tiene opciones (ej: "eliges entre pollo o carne"), incluye AMBAS
   como ingredientes separados y anota en "nota" que es opcional.

Responde SOLO con JSON válido:
{
  "ingredients": [
    {
      "name": "Papa",
      "qty": 200,
      "unit": "g",
      "category": "Materia prima",
      "isBase": true,
      "existingName": null,
      "nota": null
    }
  ]
}`;

  return callGPTText(apiKey, prompt);
}

// ── PASO 1 — Inventario ───────────────────────────────────────────────────
async function runInventory(apiKey: string, images: Array<{ data: string; mimeType: string }>): Promise<unknown> {
  const prompt = `Analiza esta carta de restaurante colombiano.

TU UNICA TAREA EN ESTE PASO:
Identificar TODAS las categorias (secciones) y TODOS los productos de cada una.

INSTRUCCIONES CRITICAS:
1. Escanea de ARRIBA A ABAJO en CADA columna por separado. No pares hasta llegar al ultimo producto.
2. Lista los productos con su nombre EXACTO tal como aparece en la carta.
   - Si un producto aparece como "Premium Mixta", escribe "Premium Mixta" (NO lo agrupes aun).
   - Si aparece "Premium Carne", escribe "Premium Carne". Son productos separados por ahora.
3. Incluye la descripcion (ingredientes, texto bajo el nombre) si la hay.
4. NO incluyas precios en este paso.
5. NO agrupes productos con variantes. Llevalos tal cual.
6. IGNORA como productos: nombre del restaurante, frases decorativas ("todo lo bueno toma tiempo"),
   secciones de adiciones/extras con precio propio, numeros de telefono, redes sociales, logos.
7. Si hay adiciones como "Adicion Super Queso $12K", NO las incluyas como productos de categoria.
8. CRITICO — BEBIDAS: Si ves una seccion de bebidas (jugos, gaseosas, agua, limonada,
   malteada, refrescos, etc.) DEBES incluirla como una categoria mas con todos sus productos.
   No la omitas aunque este en una esquina o al final de la carta.
9. NOMBRES GENERICOS: si el nombre de un producto por SI SOLO es ambiguo fuera de su
   seccion (ej. "Especial", "Pollo", "Carne", "Mixta", "Sencilla", "Super Queso") y la
   carta tiene VARIAS secciones de tipos de comida distintos (hamburguesas, perros,
   sandwich, etc.), antepon el tipo en singular: "Hamburguesa Especial", "Perro Especial",
   "Sandwich Pollo". Asi el asistente y los recibos nunca confunden productos de
   categorias distintas. Si la carta solo tiene UN tipo de comida, deja el nombre tal cual.
10. BASES COMPARTIDAS: si la carta tiene secciones tipo "NUESTRA BASE" / "TODAS nuestras X llevan"
   con una lista de ingredientes comunes, extrae CADA una en "bases":
   - name: nombre descriptivo (ej. "Base Salchipapas", "Base Hamburguesas")
   - ingredients: la lista EXACTA de ingredientes de esa base
   - applies_to: palabra clave de la seccion/categoria a la que aplica (ej. "SALCHIPAPAS", "HAMBURGUESAS")
   Las descripciones de productos que digan "Base + ..." se dejan TAL CUAL (no expandas la base).
   Si no hay secciones de base, responde "bases": [].

Responde SOLO con JSON valido (sin texto adicional):
{
  "categories": [
    {
      "name": "Nombre exacto de la categoria",
      "products": [
        {
          "name": "Nombre exacto del producto",
          "description": "descripcion o null"
        }
      ]
    }
  ],
  "bases": [
    {
      "name": "Base Salchipapas",
      "ingredients": ["Papas a la francesa", "Salchicha", "Queso mozarella"],
      "applies_to": "SALCHIPAPAS"
    }
  ]
}`;
  return callGPT(apiKey, prompt, images);
}

// ── PASO 2 — Precios y presentaciones ────────────────────────────────────
async function runPrices(apiKey: string, images: Array<{ data: string; mimeType: string }>, context: unknown): Promise<unknown> {
  const ctx = context as { categories?: Array<{ name: string; products: Array<{ name: string; description?: string }> }> };
  const productList = (ctx.categories || [])
    .map((c) => `CATEGORIA: ${c.name}\n` + c.products.map((p) => `  - ${p.name}${p.description ? ` (descripcion: ${p.description})` : ""}`).join("\n"))
    .join("\n\n");

  const prompt = `Tienes la siguiente lista de productos extraidos de la carta:

${productList}

TU TAREA: Para CADA producto de la lista, busca en la carta sus presentaciones y precios.

INSTRUCCIONES:
1. Presentaciones son tamanos o versiones del mismo producto (Personal, Familiar, Grande, etc.)
2. Si el producto tiene UN solo precio sin tamano especificado -> presentacion "Unico" con ese precio.
3. Precios en COP como numero entero: $35K = 35000, $4.5K = 4500, $13.5K = 13500, $70.000 = 70000.
4. Si NO encuentras el precio de un producto, pon price: 0. NUNCA inventes precios.
5. Mantén exactamente los mismos nombres de categorias y productos que en la lista.
6. Incluye la descripcion del paso anterior para cada producto.

Responde SOLO con JSON valido:
{
  "categories": [
    {
      "name": "Nombre exacto de la categoria",
      "products": [
        {
          "name": "Nombre exacto del producto",
          "description": "descripcion o null",
          "presentations": [
            {"name": "Personal", "price": 35000},
            {"name": "Familiar", "price": 70000}
          ]
        }
      ]
    }
  ]
}`;
  return callGPT(apiKey, prompt, images);
}

// ── PASO 3 — Variables / agrupacion ──────────────────────────────────────
async function runVariables(apiKey: string, images: Array<{ data: string; mimeType: string }>, context: unknown): Promise<unknown> {
  const ctx = context as { categories?: Array<{ name: string; products: Array<{ name: string; description?: string; presentations?: Array<{ name: string; price: number }> }> }> };
  const productList = (ctx.categories || [])
    .map((c) => `CATEGORIA: ${c.name}\n` + c.products.map((p) => {
      const pres = (p.presentations || []).map((pr) => `${pr.name}: $${pr.price}`).join(", ");
      return `  - ${p.name} [${pres || "sin precio"}]${p.description ? ` (descripcion: ${p.description})` : ""}`;
    }).join("\n"))
    .join("\n\n");

  const prompt = `Tienes esta lista de productos con precios de un restaurante:

${productList}

TU TAREA: Detectar si hay productos que son el mismo producto base pero con variantes.

SENAL DE AGRUPACION: Varios productos EMPIEZAN con las mismas palabras y solo difiere el FINAL.
Ejemplo: "Premium Mixta", "Premium Carne", "Premium Pollo"
-> Son el mismo producto "Premium" con variable "Tipo" = [Mixta, Carne, Pollo]

Ejemplo: "Maicitos Especial Mixta", "Maicitos Especial Carne"
-> Producto "Maicitos Especial" con variable "Tipo" = [Mixta, Carne]

REGLAS IMPORTANTES:
- SOLO agrupa si los nombres COMIENZAN IGUAL y la diferencia esta al FINAL.
- NUNCA agrupes por similitud al final.
- El nombre base del grupo es el PREFIJO COMUN (sin la variante).
- Productos sin variantes se mantienen igual, con variables: [].
- Si las variantes tienen precios DISTINTOS por presentacion -> priceMode: "matrix":
    - presentations sin precio (price: 0)
    - variable con isPricing: true
    - cada opcion tiene "prices": [precioPresent1, precioPresent2, ...] mismo orden que presentations
- Si las variantes tienen los MISMOS precios -> priceMode: "simple":
    - presentations con su precio, variable con isPricing: false, opciones sin prices (prices: null)
- Los productos sin variantes -> priceMode: "simple", presentations con precio, variables: []

Responde SOLO con JSON valido:
{
  "categories": [
    {
      "name": "Nombre categoria",
      "products": [
        {
          "name": "Premium",
          "description": "descripcion o null",
          "priceMode": "matrix",
          "featured": false,
          "presentations": [{"name": "Personal", "price": 0}, {"name": "Familiar", "price": 0}],
          "variables": [{"name": "Tipo", "isPricing": true, "options": [{"name": "Mixta", "prices": [35000, 70000]}, {"name": "Carne", "prices": [30000, 63000]}]}]
        }
      ]
    }
  ]
}`;
  return callGPT(apiKey, prompt, images);
}

// ── PASO 4 — Modificadores ────────────────────────────────────────────────
async function runModifiers(apiKey: string, images: Array<{ data: string; mimeType: string }>): Promise<unknown> {
  const prompt = `Busca en esta carta de restaurante colombiano los GRUPOS DE MODIFICADORES.

Los modificadores son ADICIONES u OPCIONALES que el cliente puede agregar a su pedido, con precio propio.
Senales: secciones llamadas "Adiciones", "Extras", "Adicionales", "Agrega a tu pedido", etc.

REGLAS:
1. Crea un grupo separado por cada seccion de adiciones que veas.
2. Cada opcion tiene nombre y precio en COP entero: $12K = 12000, $5.5K = 5500.
3. Si no ves ninguna seccion de adiciones/extras, responde con modifier_groups: [].
4. NO incluyas los productos normales del menu como modificadores.

Responde SOLO con JSON valido:
{
  "modifier_groups": [
    {
      "name": "Adiciones Personales",
      "rule": "opcional",
      "multi": true,
      "options": [
        {"name": "Carne desmechada", "price": 10000},
        {"name": "Pollo desmechado", "price": 9000}
      ]
    }
  ]
}`;
  return callGPT(apiKey, prompt, images);
}

// ── Handler principal ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body as { mode: string };

    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY no configurada.");

    let result: unknown;

    // ── Modo recipe: no necesita imágenes ──
    if (mode === "recipe") {
      result = await runRecipe(OPENAI_KEY, body as {
        productName: string;
        description: string;
        baseIngredients: string[];
        existingInsumos: string[];
      });
    } else {
      // Modos con imagen
      const { images, context } = body as {
        images: Array<{ data: string; mimeType: string }>;
        context?: unknown;
      };
      if (!images || !images.length) throw new Error("No se recibieron imagenes.");

      switch (mode) {
        case "inventory": result = await runInventory(OPENAI_KEY, images); break;
        case "prices":    result = await runPrices(OPENAI_KEY, images, context || {}); break;
        case "variables": result = await runVariables(OPENAI_KEY, images, context || {}); break;
        case "modifiers": result = await runModifiers(OPENAI_KEY, images); break;
        default: throw new Error(`Modo desconocido: ${mode}`);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
