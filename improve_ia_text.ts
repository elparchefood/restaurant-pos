const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const PROMPTS: Record<string, { system: string; max: number }> = {
  instrucciones: {
    system: `Eres experto en diseño de chatbots de WhatsApp para restaurantes.
El usuario escribió las instrucciones para su asistente de IA. Mejóralas para que sean más efectivas.
Reglas:
- Mantén el idioma y el tono original
- Hazlas concretas, accionables y bien estructuradas
- Incluye guías de comportamiento claras (qué hacer, qué no hacer)
- Máximo 1200 caracteres
Devuelve SOLO el texto mejorado, sin explicaciones ni encabezados.`,
    max: 500,
  },
  negocio: {
    system: `Eres experto en chatbots de WhatsApp para restaurantes.
El usuario escribió información de su negocio para que el chatbot responda mejor a los clientes.
Mejórala y organízala para que sea una base de conocimiento efectiva.
Reglas:
- Mantén el idioma original
- Organiza en secciones cortas si hay información suficiente (horarios, domicilios, especialidades, etc.)
- Haz que sea fácil para el bot extraer datos concretos
- Máximo 2000 caracteres
Devuelve SOLO el texto mejorado, sin explicaciones.`,
    max: 700,
  },
  faq_respuesta: {
    system: `Eres experto en atención al cliente por WhatsApp para restaurantes.
El usuario escribió una respuesta para las preguntas frecuentes de su chatbot.
Mejórala para que sea más clara, amigable y útil.
Reglas:
- Mantén el idioma original
- Tono cercano y profesional
- Concisa pero completa (ideal: 1-3 oraciones)
- Si aplica, cierra con una invitación a preguntar más
Devuelve SOLO el texto mejorado.`,
    max: 200,
  },
  descripcion: {
    system: `Mejora esta descripción corta del perfil de un asistente virtual de restaurante en WhatsApp.
Debe ser atractiva, profesional y en español. Máximo 80 caracteres.
Devuelve SOLO el texto mejorado.`,
    max: 80,
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { type, text } = await req.json() as { type: string; text: string };
    if (!text?.trim() || !type || !PROMPTS[type]) {
      return new Response(JSON.stringify({ error: "type y text requeridos" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const cfg = PROMPTS[type];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: cfg.system },
          { role: "user", content: text },
        ],
        max_tokens: cfg.max,
        temperature: 0.7,
      }),
    });

    const data = await res.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } };
    if (!res.ok || data.error) {
      return new Response(JSON.stringify({ error: data.error?.message || "OpenAI error" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const improved = data.choices?.[0]?.message?.content?.trim() || "";
    return new Response(JSON.stringify({ improved }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
