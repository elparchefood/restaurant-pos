/* ═══════════════════════════════════════════════════════════════════════════
   extraer-reserva — leer un mensaje de WhatsApp y sacar la reserva

   El botón "Crear con IA" de la pantalla de Reservas existía desde hace meses:
   abría una ventana bonita donde pegar el mensaje del cliente, y al tocar
   "Analizar mensaje" no pasaba absolutamente nada. Este es el motor que le
   faltaba.

   REGLA DE ORO (la misma del bot de pedidos): no se inventa nada. Lo que el
   mensaje no diga sale en `null` y se avisa en `falta`. Una reserva inventada
   —un nombre, una hora, un número de personas— cuesta una mesa vacía o una
   mesa de menos; un hueco a la vista solo cuesta preguntar.

   Devuelve SIEMPRE lo que entendió, aunque falten datos: el cajero completa lo
   que falte en el formulario, que es más rápido que escribirlo todo.
   ═══════════════════════════════════════════════════════════════════════════ */

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* La fecha de HOY la manda la pantalla, no el servidor: el servidor vive en UTC
   y en Colombia son 5 horas menos. A las 8 de la noche de un sábado, el
   servidor ya cree que es domingo — y "mañana" saldría corrido un día. */
function describirHoy(ymd: string): string {
  const p = String(ymd || "").split("-").map(Number);
  if (p.length !== 3 || !p[0]) return "";
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return `${DIAS[d.getUTCDay()]} ${p[2]} de ${MESES[p[1] - 1]} de ${p[0]} (${ymd})`;
}

/* Un teléfono colombiano son 10 dígitos que empiezan por 3. Se saca del texto
   aparte del modelo: para esto una regla es más confiable que un modelo, y así
   nunca se "corrige" un dígito. */
function telefonoDelTexto(t: string): string {
  const limpio = String(t || "").replace(/[^\d]/g, " ");
  for (const trozo of limpio.split(/\s+/)) {
    if (/^3\d{9}$/.test(trozo)) return trozo;
    if (/^573\d{9}$/.test(trozo)) return trozo.slice(2);
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const texto = String(body.texto || "").trim();
    const hoy = String(body.hoy || "").trim();          // "2026-08-09", hora local
    const abre = Number(body.abre) || 8;                 // primera hora de la agenda
    const cierra = Number(body.cierra) || 23;            // última

    if (!texto) return json({ error: "Pega el mensaje del cliente." }, 400);
    if (texto.length > 4000) return json({ error: "El mensaje es demasiado largo." }, 400);
    if (!OPENAI_KEY) return json({ error: "Falta configurar la clave de OpenAI." }, 500);

    const hoyTxt = describirHoy(hoy) || "(no se sabe qué día es hoy)";

    const sys = `Eres el que lee mensajes de WhatsApp de un restaurante en Colombia y saca los datos de una RESERVA de mesa.

HOY es ${hoyTxt}.
El restaurante atiende de ${abre}:00 a ${cierra}:00.

Devuelve SOLO un JSON con esta forma exacta:
{
  "es_reserva": true|false,
  "nombre": string|null,
  "personas": number|null,
  "fecha": "AAAA-MM-DD"|null,
  "hora": "HH:MM"|null,
  "notas": string|null,
  "entendido": string
}

REGLAS, en orden de importancia:

1. NO INVENTES NADA. Si el mensaje no lo dice, va null. Es preferible un null a
   un dato adivinado: el que atiende lo completa en dos segundos, pero un dato
   equivocado se descubre cuando el cliente ya está en la puerta.
2. "nombre" es el nombre de la persona de la reserva. Si el mensaje no lo dice
   ("quiero reservar para 4"), va null. NO uses el nombre del restaurante ni
   inventes uno.
3. "personas": solo el número de comensales. "para 6" = 6. "para las 6" es una
   HORA, no personas — fíjate en el "las". "una mesa para mi esposa y yo" = 2.
4. "fecha": resuélvela contra HOY.
   - "hoy" = la fecha de hoy. "mañana" = el día siguiente. "pasado mañana" = dos días.
   - Un día de la semana ("el sábado") es el PRÓXIMO que venga. Si hoy es ese
     mismo día, es hoy.
   - "el 15" es el día 15 del mes en curso, o del siguiente si el 15 ya pasó.
   - Si no dice ninguna fecha, va null. NO asumas que es hoy.
5. "hora" en formato de 24 horas. "8 de la noche" = "20:00". "8" a secas en un
   restaurante que cierra a las ${cierra} es "20:00" si las 8 de la mañana están
   cerradas. "8 y media" = "20:30". "mediodía" = "12:00".
6. "notas": lo que el que atiende necesita saber y no cabe en los otros campos —
   cumpleaños, silla para bebé, alergias, mesa junto a la ventana, que llegan
   tarde. Sin adornos. Si no hay nada, null.
7. NO pongas el teléfono: ese se saca aparte.
8. "es_reserva": false si el mensaje no está pidiendo una mesa (es un pedido a
   domicilio, una pregunta por la carta, un saludo). En ese caso el resto va null.
9. "entendido": UNA frase corta, en español de Colombia, resumiendo lo que
   entendiste, como se lo dirías a un compañero. Ejemplo: "Reserva para el
   sábado 15 a las 8 de la noche, 6 personas, a nombre de Andrea".

Responde solo el JSON.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: "MENSAJE DEL CLIENTE:\n" + texto },
        ],
        max_tokens: 400, temperature: 0, response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return json({ error: "No se pudo consultar la IA: " + (await res.text()) }, 502);

    const data = await res.json();
    let out: Record<string, unknown> = {};
    try { out = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch { out = {}; }

    /* Todo lo que devuelve el modelo se revisa aquí. Un modelo puede devolver
       "31 de febrero" o una hora de la madrugada; el formulario no. */
    const nombre = typeof out.nombre === "string" && out.nombre.trim() ? out.nombre.trim() : null;
    let personas: number | null = null;
    const p = Number(out.personas);
    if (Number.isFinite(p) && p >= 1 && p <= 60) personas = Math.round(p);

    let fecha: string | null = null;
    if (typeof out.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.fecha)) {
      const [a, m, d] = out.fecha.split("-").map(Number);
      const prueba = new Date(Date.UTC(a, m - 1, d));
      /* Que la fecha exista de verdad: `new Date(2026,1,31)` no falla, se pasa
         al 3 de marzo sin avisar. */
      if (prueba.getUTCMonth() === m - 1 && prueba.getUTCDate() === d) fecha = out.fecha;
    }

    let hora: string | null = null;
    if (typeof out.hora === "string") {
      const mm = out.hora.match(/^(\d{1,2}):(\d{2})$/);
      if (mm) {
        const h = Number(mm[1]), mi = Number(mm[2]);
        /* Los huecos de la agenda van de media en media hora: una reserva a las
           20:17 no se puede seleccionar, así que se baja a la media en punto. */
        if (h >= 0 && h < 24 && mi >= 0 && mi < 60) {
          hora = String(h).padStart(2, "0") + ":" + (mi < 30 ? "00" : "30");
        }
      }
    }

    const notas = typeof out.notas === "string" && out.notas.trim() ? out.notas.trim() : null;
    const telefono = telefonoDelTexto(texto);
    const esReserva = out.es_reserva !== false;

    /* Lo que falta se dice por su nombre, no como "campos incompletos". */
    const falta: string[] = [];
    if (!nombre) falta.push("el nombre");
    if (!telefono) falta.push("el teléfono");
    if (!personas) falta.push("cuántas personas");
    if (!fecha) falta.push("el día");
    if (!hora) falta.push("la hora");

    /* Una hora fuera del horario NO se corrige sola: se avisa. Puede ser que
       ese día abran distinto, y eso lo sabe el dueño, no el sistema. */
    const avisos: string[] = [];
    if (hora) {
      const h = Number(hora.slice(0, 2));
      if (h < abre || h >= cierra) {
        avisos.push(`La hora (${hora}) queda fuera del horario de la agenda (${abre}:00 a ${cierra}:00).`);
      }
    }
    if (fecha && hoy && fecha < hoy) avisos.push("Esa fecha ya pasó.");

    return json({
      ok: true,
      es_reserva: esReserva,
      nombre, telefono, personas, fecha, hora, notas,
      falta, avisos,
      entendido: typeof out.entendido === "string" ? out.entendido : "",
    });
  } catch (e) {
    return json({ error: "Error inesperado: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
