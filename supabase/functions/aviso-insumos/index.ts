// aviso-insumos — al cerrar la caja, le avisa por WhatsApp al gerente qué hay
// que comprar.
//
// Vive en el servidor y no en el navegador por una razón concreta: para mandar
// el mensaje hace falta el token de Meta de ese restaurante, y ese token NUNCA
// puede llegar al front.
//
// Se puede apagar desde Configuración (ia_config.avisar_insumos = false). El
// aviso es útil para Sergio, pero a otro dueño puede molestarle recibir un
// WhatsApp cada noche.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_API_BASE = "https://graph.facebook.com/v22.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const H = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}

/* Plural de la unidad de uso: "1 unidad" / "21 unidades", "1 porción" /
   "40 porciones" (las palabras en -ón pierden la tilde al pluralizar). */
function plural(n: number, u: string): string {
  u = String(u || "").trim();
  if (!u || Math.abs(n) === 1) return u;
  if (/ón$/i.test(u)) return u.replace(/ón$/i, "ones");
  return /[aeiouáéíóú]$/i.test(u) ? u + "s" : u + "es";
}
/* Cuánto es el stock en unidades de uso. "0.084 Paquete" no le dice nada a
   nadie; "1 unidad" sí. Se redondea a entero cuando pasa de 1 (nadie dice
   "39,65 porciones") y a un decimal cuando es menos, para no mostrar un "0"
   que parecería que ya no queda nada. */
function equivalencia(stock: number, conversion: number, useUnit: string): string {
  const n = stock * conversion;
  if (!n || !useUnit) return "";
  const v = n >= 1 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v} ${plural(v, useUnit)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const branchId = String(body.branch_id || "");
    if (!branchId) return json({ error: "Falta branch_id" }, 400);

    // ── ¿Está encendido y hay a quién avisarle? ──────────────────────
    const cfgRows = await sbGet(
      `/rest/v1/ia_config?branch_id=eq.${branchId}&select=numeros_gerentes,avisar_insumos&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const cfg = cfgRows?.[0];
    // Sin configuración, ENCENDIDO: el que puso números de gerente es porque
    // quiere que le escriban.
    if (cfg?.avisar_insumos === false) return json({ ok: true, enviado: false, razon: "apagado" });

    const numeros = Array.isArray(cfg?.numeros_gerentes)
      ? (cfg!.numeros_gerentes as unknown[]).map(n => String(n).replace(/\D/g, "")).filter(Boolean)
      : [];
    if (!numeros.length) return json({ ok: true, enviado: false, razon: "sin_gerentes" });

    // ── Qué está bajo ────────────────────────────────────────────────
    const insumos = await sbGet(
      `/rest/v1/iv_insumos?branch_id=eq.${branchId}&activo=eq.true` +
      `&select=nombre,stock,min_stock,buy_unit,use_unit,conversion,control_manual,agotado_manual`
    ) as Array<Record<string, unknown>> | null;

    const bajos = (insumos || []).filter(i => {
      if (i.control_manual && i.agotado_manual) return true;
      const min = Number(i.min_stock) || 0;
      if (min <= 0) return false;                 // sin mínimo no se vigila
      return (Number(i.stock) || 0) <= min;
    }).map(i => ({
      nombre: String(i.nombre || ""),
      stock: Number(i.stock) || 0,
      min: Number(i.min_stock) || 0,
      unidad: String(i.buy_unit || ""),
      agotado: !!(i.control_manual && i.agotado_manual) || (Number(i.stock) || 0) <= 0,
      equiv: equivalencia(Number(i.stock) || 0, Number(i.conversion) || 0, String(i.use_unit || "")),
    })).sort((a, b) => (a.agotado !== b.agotado ? (a.agotado ? -1 : 1) : a.nombre.localeCompare(b.nombre, "es")));

    // Nada bajo: no se manda nada. Un "todo bien" cada noche se vuelve ruido y
    // en dos semanas nadie lo lee.
    if (!bajos.length) return json({ ok: true, enviado: false, razon: "nada_bajo" });

    const lineas = bajos.map(i => i.agotado
      ? `• ${i.nombre} — se acabó`
      : `• ${i.nombre} — quedan ${i.stock}${i.unidad ? " " + i.unidad : ""}${i.equiv ? " (" + i.equiv + ")" : ""}`);
    const texto = `🛒 *Por comprar* — cierre de caja\n\n${lineas.join("\n")}\n\n${bajos.length} insumo${bajos.length === 1 ? "" : "s"}.`;

    // ── Con qué número se manda ──────────────────────────────────────
    const canales = await sbGet(
      `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&select=meta&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const meta = (canales?.[0]?.meta || {}) as Record<string, string>;
    if (!meta.phone_id || !meta.access_token) {
      return json({ ok: true, enviado: false, razon: "sin_whatsapp" });
    }

    // ── Mandarlo ─────────────────────────────────────────────────────
    const resultados: Array<Record<string, unknown>> = [];
    for (const numero of numeros) {
      try {
        const r = await fetch(`${META_API_BASE}/${meta.phone_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${meta.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: numero,
            type: "text", text: { body: texto },
          }),
        });
        const d = await r.json().catch(() => ({}));
        /* OJO: Meta rechaza los mensajes libres si el gerente no le ha escrito
           al negocio en las últimas 24 horas. No es un error del sistema — es
           una regla de WhatsApp. Se reporta tal cual para poder distinguirlo. */
        resultados.push({ numero, ok: r.ok, error: r.ok ? null : (d?.error?.message || "rechazado") });
      } catch (e) {
        resultados.push({ numero, ok: false, error: String(e).slice(0, 120) });
      }
    }

    return json({ ok: true, enviado: resultados.some(r => r.ok), cuantos: bajos.length, resultados });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
