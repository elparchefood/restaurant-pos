// aviso-puntos — Le avisa al cliente por WhatsApp los puntos que acaba de ganar.
//
// CÓMO FUNCIONA: los puntos los abona un trigger de la base cuando el pedido
// pasa a pagado (award_loyalty_points), y cada abono deja una fila en
// pos_puntos_movimientos con tipo 'acumulacion'. Esta función barre las filas
// sin avisar, y a cada una le manda la PLANTILLA aprobada por Meta.
//
// POR QUÉ PLANTILLA Y NO TEXTO: el cliente de mesa o venta rápida casi nunca
// tiene una conversación de WhatsApp abierta en las últimas 24 horas, y fuera
// de esa ventana Meta solo permite plantillas aprobadas. La plantilla sirve
// para TODOS los canales (mesa, domicilio, venta rápida), que es la regla.
//
// EL TELÉFONO: el dueño lo escribe SIN indicativo (así lo guarda el trigger:
// 10 dígitos). Meta lo exige internacional, así que aquí se le antepone 57.
//
// LA MARCA, NO LA SUCURSAL: el {{2}} de la plantilla es el nombre que ve el
// cliente. Se lee de brands.name; branches.name es interno ("Principal") y ya
// salió una vez en un aviso — no se repite.
//
// CONFIGURACIÓN (por restaurante, en ia_config.estados_config.puntos):
//   { "activo": true, "plantilla": "puntos_ganados", "idioma": "es" }
// Sin eso, la fila se marca 'apagado' y no se envía nada: cada restaurante
// decide si avisa. Al encenderlo después, solo avisan los abonos NUEVOS —
// avisar puntos de hace una semana confunde más de lo que suma.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
}
async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPatch(path: string, body: unknown, representar = false) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: representar ? { ...H, "Prefer": "return=representation" } : H,
    body: JSON.stringify(body),
  });
  return representar && r.ok ? await r.json() : null;
}
async function sbPost(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// La copia legible para el chat del Front se arma con el cuerpo REAL de la
// plantilla (leído de Meta, que lo congela al aprobar): así el Front muestra
// exactamente lo que el cliente recibió, sea cual sea la plantilla elegida.
function textoLegible(cuerpo: string | undefined, params: string[]): string {
  if (!cuerpo) return `[Aviso de puntos] ${params.join(" · ")}`;
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[parseInt(n, 10) - 1] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // ── Reclamar las filas pendientes (últimas 48 h) ──────────────────────
    // Se marcan 'enviando' ANTES de enviar: si dos barridos coinciden, solo
    // uno se lleva cada fila. Las de más de 48 h ya no se avisan (un aviso
    // viejo confunde); se cierran como 'vencido' para que no se reintenten.
    const hace48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    await sbPatch(
      `/rest/v1/pos_puntos_movimientos?tipo=eq.acumulacion&aviso=is.null&created_at=lt.${hace48h}`,
      { aviso: "vencido" },
    );
    const cola = (await sbPatch(
      `/rest/v1/pos_puntos_movimientos?tipo=eq.acumulacion&aviso=is.null&created_at=gte.${hace48h}`,
      { aviso: "enviando" },
      true,
    )) as Array<Record<string, unknown>> | null;

    if (!cola || !cola.length) return json({ ok: true, enviados: 0, mensaje: "Nada pendiente." });

    // ── Datos por sucursal, una sola vez aunque haya varias filas ─────────
    const porBranch: Record<string, {
      activo: boolean; plantilla: string; idioma: string; vars: string[];
      token?: string; phoneId?: string; marca?: string; cuerpo?: string;
    }> = {};
    async function datosDe(branchId: string) {
      if (porBranch[branchId]) return porBranch[branchId];
      const d: typeof porBranch[string] = {
        activo: false, plantilla: "puntos_ganados", idioma: "es",
        // El orden por defecto es el de la plantilla original: {{1}} puntos
        // ganados, {{2}} marca, {{3}} saldo. El dueño lo cambia desde
        // Configuración → Estados de pedido y avisos → Gana puntos.
        vars: ["puntos_ganados", "negocio", "puntos_total"],
      };
      const cfgR = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&select=estados_config&limit=1`) as Array<Record<string, unknown>> | null;
      const pc = ((cfgR?.[0]?.estados_config as Record<string, unknown>) || {}).puntos as Record<string, unknown> | undefined;
      if (pc && pc.activo === true) {
        d.activo = true;
        if (pc.plantilla) d.plantilla = String(pc.plantilla);
        if (pc.idioma) d.idioma = String(pc.idioma);
        if (Array.isArray(pc.vars) && pc.vars.length) d.vars = (pc.vars as unknown[]).map(String);
      }
      const chR = await sbGet(`/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&select=meta&limit=1`) as Array<Record<string, unknown>> | null;
      const meta = (chR?.[0]?.meta || {}) as Record<string, string>;
      d.token = meta.access_token; d.phoneId = meta.phone_id;
      const brR = await sbGet(`/rest/v1/branches?id=eq.${branchId}&select=name,brands(name)`) as Array<Record<string, unknown>> | null;
      const b = brR?.[0] || {};
      const mk = b.brands as { name?: string } | Array<{ name?: string }> | null;
      d.marca = (Array.isArray(mk) ? mk[0]?.name : mk?.name) || String(b.name || "el restaurante");
      // El cuerpo aprobado de la plantilla, para la copia del Front.
      try {
        if (d.activo && d.token && meta.waba_id) {
          const tr = await fetch(`https://graph.facebook.com/v22.0/${meta.waba_id}/message_templates?name=${encodeURIComponent(d.plantilla)}&fields=name,components&access_token=${d.token}`);
          const tj = await tr.json() as { data?: Array<{ name: string; components?: Array<{ type: string; text?: string }> }> };
          const tpl = (tj.data || []).find(t => t.name === d.plantilla);
          d.cuerpo = tpl?.components?.find(c => c.type === "BODY")?.text;
        }
      } catch { /* sin cuerpo, la copia sale generica */ }
      porBranch[branchId] = d;
      return d;
    }

    // Resuelve cada variable del mapeo a su valor real para ESTE movimiento.
    async function valorDe(key: string, m: Record<string, unknown>, d: typeof porBranch[string], tel10: string): Promise<string> {
      if (key === "puntos_ganados") return String(m.puntos ?? "");
      if (key === "puntos_total") return String(m.saldo_despues ?? "");
      if (key === "negocio") return d.marca || "";
      if (key === "nombre_cliente") {
        try {
          const cR = await sbGet(
            `/rest/v1/pos_clientes?tenant_id=eq.${m.tenant_id}&or=(telefono.like.*${tel10},telefono2.like.*${tel10})&select=nombre&limit=1`,
          ) as Array<{ nombre?: string }> | null;
          const nom = String(cR?.[0]?.nombre || "").trim().split(/\s+/)[0];
          if (nom) return nom;
        } catch { /* cae al generico */ }
        return "cliente";   // Meta rechaza parametros vacios: siempre algo neutro
      }
      return "-";
    }

    let enviados = 0, fallidos = 0, apagados = 0;
    for (const m of cola) {
      const id = m.id;
      const marcar = (campos: Record<string, unknown>) =>
        sbPatch(`/rest/v1/pos_puntos_movimientos?id=eq.${id}`, campos);
      try {
        const d = await datosDe(String(m.branch_id));
        if (!d.activo) { await marcar({ aviso: "apagado" }); apagados++; continue; }
        if (!d.token || !d.phoneId) { await marcar({ aviso: "fallido", aviso_error: "WhatsApp no conectado" }); fallidos++; continue; }

        // 10 dígitos guardados sin indicativo → se antepone 57 para Meta.
        let tel = String(m.telefono || "").replace(/\D/g, "");
        if (tel.length === 10) tel = "57" + tel;
        if (tel.length < 11) { await marcar({ aviso: "fallido", aviso_error: "teléfono inválido: " + tel }); fallidos++; continue; }

        // Los parametros salen del mapeo configurado: la posicion i del
        // arreglo alimenta el hueco {{i+1}} de la plantilla.
        const params: string[] = [];
        for (const key of d.vars) params.push(await valorDe(key, m, d, tel.slice(-10)));
        const res = await fetch(`https://graph.facebook.com/v22.0/${d.phoneId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${d.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: tel, type: "template",
            template: {
              name: d.plantilla, language: { code: d.idioma },
              components: [{
                type: "body",
                parameters: params.map(p => ({ type: "text", text: p || "-" })),
              }],
            },
          }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (res.ok) {
          const waId = ((data.messages as Array<Record<string, string>>)?.[0]?.id) || null;
          await marcar({ aviso: "enviado", aviso_at: new Date().toISOString(), aviso_error: null });
          enviados++;

          // Copia en el chat del Front, si ese cliente tiene conversación.
          // origen 'sistema': lo mandó el sistema, no Paco ni una persona.
          try {
            const tel10 = tel.slice(-10);
            const convR = await sbGet(
              `/rest/v1/chat_conversations?branch_id=eq.${m.branch_id}&channel=eq.whatsapp` +
              `&contact_handle=like.*${tel10}&select=id,tenant_id&limit=1`,
            ) as Array<Record<string, unknown>> | null;
            if (convR && convR[0]) {
              await sbPost(`/rest/v1/chat_messages`, {
                conversation_id: convR[0].id, tenant_id: convR[0].tenant_id,
                direction: "out", origen: "sistema", external_id: waId,
                body: textoLegible(d.cuerpo, params),
                sent_at: new Date().toISOString(), delivery_status: "sent",
              });
            }
          } catch { /* la copia es cortesía: si falla, el envío ya salió */ }
        } else {
          // El error de Meta se guarda TAL CUAL (misma regla que wa-enviar-lista).
          const msg = JSON.stringify((data.error as Record<string, unknown>) || data).slice(0, 400);
          await marcar({ aviso: "fallido", aviso_error: msg });
          fallidos++;
        }
      } catch (e) {
        await marcar({ aviso: "fallido", aviso_error: String(e).slice(0, 300) });
        fallidos++;
      }
      await sleep(300);
    }

    return json({ ok: true, enviados, fallidos, apagados, total: cola.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
