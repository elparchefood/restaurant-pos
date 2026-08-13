/* ══════════════════════════════════════════════════════════════════════════
   EL DESPERTADOR

   Esto NO es un vigilante. No revisa conversaciones, no lee configuraciones y
   no le habla a nadie: hace UNA pregunta —"¿alguna alarma ya sonó?"— y para
   cada respuesta manda una señal al bot.

   La diferencia importa. Antes recorría TODAS las conversaciones cada cinco
   minutos para descartarlas una por una: con 193 no se notaba, con 40.000 sí.
   Ahora cada conversación carga su propia hora de vencimiento (recordar_at) y
   un índice parcial guarda solo las que tienen alarma puesta. La consulta
   devuelve cero filas hasta que de verdad hay algo vencido, y cuesta lo mismo
   con 200 conversaciones que con 200.000.

   Quien decide qué decirle al cliente es delay-reply, que es el único que le
   habla. Aquí no hay ni una frase: una segunda copia de esa lógica se
   quedaría vieja sin que nadie lo note.
   ══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    /* La única consulta. Con el índice parcial no recorre nada: si no hay
       alarmas vencidas, devuelve vacío sin tocar la tabla. */
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_conversations` +
      `?recordar_at=not.is.null&recordar_at=lte.${new Date().toISOString()}` +
      `&pago_pendiente=eq.true&select=id&limit=100`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!r.ok) {
      console.error("despertador, consulta:", await r.text());
      return new Response(JSON.stringify({ ok: false }), { status: 500, headers: CORS });
    }
    const vencidas = await r.json() as Array<{ id: string }>;
    if (!vencidas.length) {
      return new Response(JSON.stringify({ ok: true, sonaron: 0 }), { headers: CORS });
    }

    /* Se esperan todas antes de contestar: si esto devolviera enseguida, el
       runtime podría matar la función con las señales a medio salir y esas
       conversaciones se quedarían con la alarma sonando para siempre. */
    await Promise.all(vencidas.map(c =>
      fetch(`${SUPABASE_URL}/functions/v1/delay-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ convId: c.id, senal: "recordar_comprobante" }),
      }).catch(e => console.error("señal a delay-reply:", c.id, e))
    ));

    console.log(`alarmas vencidas: ${vencidas.length}`);
    return new Response(JSON.stringify({ ok: true, sonaron: vencidas.length }), { headers: CORS });

  } catch (e) {
    console.error("despertador:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
});
