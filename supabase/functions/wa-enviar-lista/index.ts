// wa-enviar-lista — Envía una plantilla de WhatsApp a los contactos pendientes
// de una lista, respetando el límite diario de Meta.
//
// POR QUÉ EXISTE: Meta limita las conversaciones iniciadas por el negocio
// (TIER_250 = 250 cada 24 h). Con 1.381 contactos son ~6 días, así que el envío
// NO puede ser "mandar todo de una": tiene que ir por tandas, saber a quién ya
// se le escribió, y poder retomar mañana sin repetir ni saltarse a nadie.
// Por eso se envía desde la COLA (pos_wa_envios), no desde una lista suelta.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
}
// Las rutas que se le pasan YA incluyen /rest/v1 (por eso el helper no lo
// vuelve a poner: duplicarlo hacia que toda consulta devolviera null y el
// envio fallara con un "WhatsApp no esta conectado" que no era cierto).
async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPatch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
}
// Contar filas SIN traerlas. Es obligatorio: la API devuelve como maximo 1.000
// filas por consulta y `limit=2000` NO levanta ese tope, asi que contar por
// `.length` daba 1.000 aunque hubiera 1.381 contactos en la cola.
async function sbCount(path: string): Promise<number> {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${SUPABASE_URL}${path}${sep}select=id`, {
    method: "HEAD",
    headers: { ...H, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0" },
  });
  const cr = r.headers.get("content-range") || "";      // formato: "0-0/1381"
  const n = parseInt(cr.split("/")[1] || "0", 10);
  return isNaN(n) ? 0 : n;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const listaId = String(b.lista_id || "");
    const branchId = String(b.branch_id || "");
    const pedido = Math.max(1, Math.min(250, Number(b.cantidad) || 250));
    const soloContar = !!b.solo_contar;
    if (!listaId || !branchId) return json({ error: "Falta lista_id o branch_id" }, 400);

    // ── Cuánto se puede enviar todavía hoy ──────────────────────────────
    // Meta cuenta por ventana de 24 h, no por día calendario.
    const enviados24h = await sbCount(
      `/rest/v1/pos_wa_envios?branch_id=eq.${branchId}&estado=neq.pendiente&estado=neq.omitido` +
      `&enviado_at=gte.${new Date(Date.now() - 24 * 3600 * 1000).toISOString()}`
    );
    const LIMITE = Number(b.limite_diario) || 250;
    const disponible = Math.max(0, LIMITE - enviados24h);

    const pendientes = await sbCount(`/rest/v1/pos_wa_envios?lista_id=eq.${listaId}&estado=eq.pendiente`);

    if (soloContar) {
      return json({ ok: true, enviados24h, disponible, pendientes, limite: LIMITE });
    }
    if (disponible <= 0) {
      return json({ ok: false, razon: "limite", enviados24h, disponible: 0, pendientes,
        mensaje: `Ya enviaste ${enviados24h} en las últimas 24 horas. Meta no deja más por ahora.` });
    }

    // ── Credenciales de WhatsApp ────────────────────────────────────────
    const chRows = await sbGet(`/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&select=meta&limit=1`) as Array<Record<string, unknown>> | null;
    const meta = (chRows?.[0]?.meta || {}) as Record<string, string>;
    if (!meta.access_token || !meta.phone_id) return json({ error: "WhatsApp no está conectado en esta sucursal" }, 400);

    // ── La tanda ────────────────────────────────────────────────────────
    const cuantos = Math.min(pedido, disponible);
    const cola = await sbGet(
      `/rest/v1/pos_wa_envios?lista_id=eq.${listaId}&estado=eq.pendiente` +
      `&order=orden.asc,created_at.asc&limit=${cuantos}` +
      `&select=id,telefono,etiqueta,plantilla,idioma,params`
    ) as Array<Record<string, unknown>> | null;

    if (!cola || !cola.length) {
      return json({ ok: true, enviados: 0, fallidos: 0, pendientes: 0, mensaje: "No quedan contactos pendientes en esta lista." });
    }

    /* ── QUE NO SE QUEMEN 95 INTENTOS POR UN DATO QUE FALTA ──────────────

       Paso de verdad el 21-ago: la plantilla `puntos_app` dice "Tienes {{1}}
       Puntos" y se mandaba sin ese dato. Meta rechazo las 95, una por una,
       y solo se supo mirando el error guardado.

       Ahora se comprueba ANTES de mandar la primera: se le pregunta a Meta
       cuantas variables tiene la plantilla y se compara con las que se
       tienen. Si no cuadran, no se manda NADA y se dice exactamente que
       falta. Mejor parar entero que gastar el cupo del dia —y la reputacion
       del numero— en mensajes que Meta va a rechazar igual. */
    if (meta.waba_id) {
      try {
        const rt = await fetch(
          `https://graph.facebook.com/v22.0/${meta.waba_id}/message_templates` +
          `?name=${encodeURIComponent(String(cola[0].plantilla || ""))}&fields=name,components&limit=5`,
          { headers: { "Authorization": `Bearer ${meta.access_token}` } },
        );
        const tj = await rt.json() as Record<string, unknown>;
        const def = ((tj.data as Array<Record<string, unknown>>) || [])[0];
        if (def) {
          const body = ((def.components as Array<Record<string, unknown>>) || [])
            .find((x) => String(x.type).toUpperCase() === "BODY");
          const texto = String(body?.text || "");
          //  Cuantos {{n}} distintos tiene el texto de la plantilla.
          const esperados = new Set(
            (texto.match(/\{\{\s*\d+\s*\}\}/g) || []).map((m) => m.replace(/\D/g, "")),
          ).size;
          const tengo = Array.isArray(cola[0].params) ? (cola[0].params as unknown[]).length : 0;
          if (esperados !== tengo) {
            return json({
              ok: false, razon: "variables",
              enviados: 0, fallidos: 0,
              mensaje: esperados > tengo
                ? `La plantilla "${cola[0].plantilla}" necesita ${esperados} dato(s) `
                  + `y esta lista no los tiene. No se envió nada. `
                  + `Vuelve a armar la lista, o revisa que el filtro sea el que llena ese dato.`
                : `La plantilla "${cola[0].plantilla}" no lleva variables, pero la lista `
                  + `está mandando ${tengo}. No se envió nada.`,
            });
          }
        }
      } catch (e) {
        //  Si Meta no responde, no se bloquea el envio: se sigue como antes.
        console.warn("[wa-enviar-lista] no se pudo verificar la plantilla:", e);
      }
    }

    /* La funcion no puede correr indefinidamente: el servidor la corta. Con 250
       mensajes se moria a mitad (la primera vez, en el 126) y el navegador solo
       veia "Failed to fetch". No se perdia nada porque la cola guarda el estado
       de cada uno, pero la pantalla quedaba sin saber que habia pasado.
       Ahora la propia funcion se detiene ANTES del corte y avisa que quedo a
       medias, para que la pantalla la vuelva a llamar y siga donde iba. */
    const T0 = Date.now();
    const LIMITE_MS = 50_000;
    let ok = 0, fallidos = 0, corto_por_tiempo = false;
    for (const c of cola) {
      if (Date.now() - T0 > LIMITE_MS) { corto_por_tiempo = true; break; }
      // El teléfono va sin '+' ni espacios, como lo exige Meta.
      const tel = String(c.telefono || "").replace(/\D/g, "");
      if (tel.length < 10) {
        await sbPatch(`/rest/v1/pos_wa_envios?id=eq.${c.id}`, { estado: "omitido", error: "teléfono inválido" });
        continue;
      }
      /* LAS VARIABLES DE LA PLANTILLA, RELLENAS DE VERDAD.

         Aqui estaba el error que hizo fallar las 95: se mandaba la plantilla
         pelada, sin `components`, y Meta respondia siempre lo mismo:

           (#132000) number of localizable_params (0)
                     does not match the expected number of params (1)

         La plantilla `puntos_app` dice "Tienes {{1}} Puntos en total". Ese
         {{1}} son los puntos de ESA persona, y salen de `params`, que se
         llena al armar la lista (fn_wa_armar_lista).

         Van en el mismo orden en que estan en la plantilla: el primero es
         {{1}}, el segundo {{2}}. Si la lista no tiene variables, no se manda
         `components` y todo queda como antes. */
      const vals = Array.isArray(c.params) ? (c.params as unknown[]) : [];
      const tpl: Record<string, unknown> = {
        name: c.plantilla, language: { code: String(c.idioma || "es") },
      };
      if (vals.length) {
        tpl.components = [{
          type: "body",
          parameters: vals.map((v) => ({ type: "text", text: String(v ?? "") })),
        }];
      }

      try {
        const res = await fetch(`https://graph.facebook.com/v22.0/${meta.phone_id}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${meta.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: tel, type: "template", template: tpl,
          }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (res.ok) {
          const id = ((data.messages as Array<Record<string, string>>)?.[0]?.id) || null;
          await sbPatch(`/rest/v1/pos_wa_envios?id=eq.${c.id}`, {
            estado: "enviado", wa_message_id: id, enviado_at: new Date().toISOString(), error: null,
          });
          ok++;
        } else {
          // El error de Meta se guarda TAL CUAL: si algo falla en masa, se
          // necesita saber exactamente qué dijo (número inválido, plantilla
          // pausada, límite alcanzado…).
          const msg = JSON.stringify((data.error as Record<string, unknown>) || data).slice(0, 400);
          await sbPatch(`/rest/v1/pos_wa_envios?id=eq.${c.id}`, {
            estado: "fallido", error: msg, enviado_at: new Date().toISOString(),
          });
          fallidos++;
          // Si Meta dice que se acabó el cupo, parar: seguir solo generaría
          // más errores y ensuciaría la reputación del número.
          if (msg.includes("limit") || msg.includes("131056") || msg.includes("130497")) break;
        }
      } catch (e) {
        await sbPatch(`/rest/v1/pos_wa_envios?id=eq.${c.id}`, { estado: "fallido", error: String(e).slice(0, 300) });
        fallidos++;
      }
      // Un respiro entre mensajes: mandar 250 de golpe se ve como spam.
      await sleep(350);
    }

    return json({
      ok: true, enviados: ok, fallidos, corto_por_tiempo,
      pendientes: await sbCount(`/rest/v1/pos_wa_envios?lista_id=eq.${listaId}&estado=eq.pendiente`),
      disponible_hoy: Math.max(0, disponible - ok - fallidos),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
