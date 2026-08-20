// wa-plantillas — Plantillas de mensajes de WhatsApp (Meta Cloud API).
// Fuera de la ventana de 24 h WhatsApp solo permite enviar plantillas
// aprobadas por Meta. Esta función es el puente: listar, crear, borrar y
// enviar. El token de la WABA vive en chat_channels.meta y NUNCA sale al
// navegador — por eso todo pasa por aquí.
//   POST { branch_id, action: 'list' }
//   POST { branch_id, action: 'create', nombre, categoria, idioma, cuerpo, pie, ejemplos[] }
//   POST { branch_id, action: 'delete', nombre }
//   POST { branch_id, action: 'send', conversation_id, nombre, idioma, params[] }
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v20.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: CORS }); }

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return r.ok ? await r.json() : null;
}
async function sbPost(path: string, data: unknown, rep = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: rep ? "return=representation" : "return=minimal",
    },
    body: JSON.stringify(data),
  });
  return rep ? await r.json().catch(() => null) : null;
}
async function sbPatch(path: string, data: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Credenciales de WhatsApp de la sede.
async function creds(branchId: string) {
  const rows = await sbGet(`/chat_channels?channel=eq.whatsapp&branch_id=eq.${branchId}&select=meta,tenant_id&limit=1`) as Array<Record<string, unknown>> | null;
  let m = rows?.[0]?.meta as Record<string, string> | string | undefined;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = {}; } }
  const meta = (m || {}) as Record<string, string>;
  return {
    waba: meta.waba_id || "", token: meta.access_token || "",
    phoneId: meta.phone_number_id || "", tenant: rows?.[0]?.tenant_id as string | undefined,
  };
}

// El nombre de la plantilla en Meta: minúsculas, números y guion bajo.
function slug(s: string) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "plantilla";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const b = await req.json();
    const branchId = String(b.branch_id || "");
    const action = String(b.action || "list");
    if (!branchId) return json({ error: "branch_id requerido" }, 400);

    const { waba, token, phoneId, tenant } = await creds(branchId);
    if (!waba || !token) return json({ error: "Esta sede no tiene WhatsApp conectado." }, 400);
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // ── LISTAR ────────────────────────────────────────────────────────
    if (action === "list") {
      const r = await fetch(`${GRAPH}/${waba}/message_templates?limit=100&fields=name,status,category,language,components,rejected_reason,quality_score`, { headers: H });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.message || "No se pudieron leer las plantillas" }, 400);
      const items = (d.data || []).map((t: Record<string, unknown>) => {
        const comps = (t.components || []) as Array<Record<string, unknown>>;
        const body = comps.find((c) => String(c.type).toUpperCase() === "BODY");
        const foot = comps.find((c) => String(c.type).toUpperCase() === "FOOTER");
        const texto = String(body?.text || "");
        // Cuántas variables {{n}} tiene el cuerpo (para pedirlas al enviar).
        const vars = new Set((texto.match(/\{\{\s*\d+\s*\}\}/g) || []).map((x) => x.replace(/\D/g, "")));
        return {
          nombre: t.name, estado: t.status, categoria: t.category, idioma: t.language,
          cuerpo: texto, pie: String(foot?.text || ""), variables: vars.size,
          motivo_rechazo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
        };
      });
      return json({ ok: true, items });
    }

    // ── CREAR ─────────────────────────────────────────────────────────
    if (action === "create") {
      const nombre = slug(b.nombre);
      const cuerpo = String(b.cuerpo || "").trim();
      const pie = String(b.pie || "").trim();
      const categoria = String(b.categoria || "UTILITY").toUpperCase();
      const idioma = String(b.idioma || "es");
      if (!cuerpo && categoria !== "AUTHENTICATION") {
        return json({ error: "Escribe el mensaje de la plantilla." }, 400);
      }
      if (cuerpo.length > 1024) return json({ error: "El mensaje es muy largo (máx. 1024 caracteres)." }, 400);

      // Meta exige un ejemplo por cada variable {{n}} del cuerpo.
      const nVars = new Set((cuerpo.match(/\{\{\s*\d+\s*\}\}/g) || []).map((x) => x.replace(/\D/g, ""))).size;
      const ejemplos = (Array.isArray(b.ejemplos) ? b.ejemplos : []).map((x: unknown) => String(x || "").trim());
      if (nVars > 0 && ejemplos.filter(Boolean).length < nVars) {
        return json({ error: `Faltan ejemplos: la plantilla tiene ${nVars} variable(s) y Meta exige un ejemplo para cada una.` }, 400);
      }

      /* ── PLANTILLAS DE CODIGO (AUTENTICACION) ──────────────────────────
         Son OTRA cosa, no una plantilla normal con otro nombre: Meta escribe el
         texto y no deja cambiarlo — es su politica para los codigos. Lo unico
         que se elige es si lleva la advertencia de no compartirlo, el aviso de
         vencimiento y el boton de copiar.

         Por eso no pasa por la validacion de arriba (cuerpo y ejemplos): aqui
         no hay cuerpo que escribir. Meterle un texto propio a un codigo usando
         otra categoria seria peor que no tener plantilla: Meta las rechaza y,
         si insiste, sanciona el numero. */
      if (categoria === "AUTHENTICATION") {
        const minutos = Math.max(1, Math.min(90, Number(b.vence_minutos) || 10));
        const rAuth = await fetch(`${GRAPH}/${waba}/message_templates`, {
          method: "POST", headers: H,
          body: JSON.stringify({
            name: nombre, language: idioma, category: "AUTHENTICATION",
            /* Si el codigo vence en 10 minutos, entregarlo despues no sirve de
               nada: que Meta ni lo intente en vez de mandarlo tarde. */
            message_send_ttl_seconds: minutos * 60,
            components: [
              { type: "BODY", add_security_recommendation: true },
              { type: "FOOTER", code_expiration_minutes: minutos },
              { type: "BUTTONS", buttons: [
                { type: "OTP", otp_type: "COPY_CODE", text: String(b.texto_boton || "Copiar código") },
              ] },
            ],
          }),
        });
        const dAuth = await rAuth.json();
        if (!rAuth.ok) {
          return json({ error: dAuth?.error?.error_user_msg || dAuth?.error?.message || "Meta rechazó la plantilla" }, 400);
        }
        return json({ ok: true, nombre, estado: dAuth.status || "PENDING", id: dAuth.id });
      }

      const components: Array<Record<string, unknown>> = [];
      const bodyComp: Record<string, unknown> = { type: "BODY", text: cuerpo };
      if (nVars > 0) bodyComp.example = { body_text: [ejemplos.slice(0, nVars)] };
      components.push(bodyComp);
      if (pie) components.push({ type: "FOOTER", text: pie.slice(0, 60) });

      /* ── BOTONES (20-ago-2026) ────────────────────────────────────────────
         Sergio: "necesito que se pueda crear plantilla con botones, para que
         ese boton los mande a la app de clientes". Antes solo se mandaba cuerpo
         y pie, asi que una campana terminaba en un mensaje que el cliente tenia
         que leer y actuar por su cuenta.

         Se aceptan los dos que sirven aqui y nada mas:
           · enlace    → abre una direccion (la app de clientes)
           · respuesta → mete una respuesta rapida que el cliente toca

         NO se acepta el de llamar: el numero tendria que salir de la ficha del
         restaurante y no de lo que mande el navegador, y hoy nadie lo pide.

         Los limites son de Meta, no nuestros: 3 botones como maximo, 25
         caracteres el texto, y en una plantilla de MARKETING o UTILITY los de
         enlace y respuesta no se pueden mezclar con los de OTP. */
      const botones = (Array.isArray(b.botones) ? b.botones : [])
        .slice(0, 3)
        .map((x: Record<string, unknown>) => {
          const texto = String(x?.texto || "").trim().slice(0, 25);
          const tipo  = String(x?.tipo || "enlace");
          if (!texto) return null;
          if (tipo === "respuesta") return { type: "QUICK_REPLY", text: texto };
          let url = String(x?.url || "").trim();
          if (!url) return null;
          if (!/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^\/+/, "");
          return { type: "URL", text: texto, url: url.slice(0, 2000) };
        })
        .filter(Boolean);

      if (botones.length) components.push({ type: "BUTTONS", buttons: botones });

      const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: "POST", headers: H,
        body: JSON.stringify({ name: nombre, language: idioma, category: categoria, components }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.error_user_msg || d?.error?.message || "Meta rechazó la plantilla" }, 400);
      return json({ ok: true, nombre, estado: d.status || "PENDING", id: d.id });
    }

    // ── BORRAR ────────────────────────────────────────────────────────
    if (action === "delete") {
      const nombre = String(b.nombre || "");
      if (!nombre) return json({ error: "nombre requerido" }, 400);
      const r = await fetch(`${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(nombre)}`, { method: "DELETE", headers: H });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: d?.error?.message || "No se pudo eliminar" }, 400);
      return json({ ok: true });
    }

    // ── ENVIAR ────────────────────────────────────────────────────────
    // Envía la plantilla al contacto de una conversación y la deja escrita en
    // el hilo, para que en el chat se vea igual que cualquier otro mensaje.
    if (action === "send") {
      const convId = String(b.conversation_id || "");
      const nombre = String(b.nombre || "");
      const idioma = String(b.idioma || "es");
      const params = (Array.isArray(b.params) ? b.params : []).map((x: unknown) => String(x || ""));
      if (!convId || !nombre) return json({ error: "conversation_id y nombre requeridos" }, 400);
      if (!phoneId) return json({ error: "La sede no tiene número de WhatsApp configurado." }, 400);

      const convs = await sbGet(`/chat_conversations?id=eq.${convId}&select=id,contact_handle,tenant_id`) as Array<Record<string, unknown>> | null;
      const conv = convs?.[0];
      if (!conv) return json({ error: "Conversación no encontrada" }, 404);

      const comps = params.length
        ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }]
        : [];
      const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          messaging_product: "whatsapp", to: String(conv.contact_handle), type: "template",
          template: { name: nombre, language: { code: idioma }, ...(comps.length ? { components: comps } : {}) },
        }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.error_user_msg || d?.error?.message || "WhatsApp no aceptó el envío" }, 400);

      // Texto final (con las variables ya reemplazadas) para mostrarlo en el hilo.
      const tpl = await fetch(`${GRAPH}/${waba}/message_templates?limit=100&fields=name,components,language`, { headers: H });
      const td = await tpl.json().catch(() => ({}));
      const found = (td.data || []).find((t: Record<string, unknown>) => t.name === nombre);
      const bodyComp = ((found?.components || []) as Array<Record<string, unknown>>).find((c) => String(c.type).toUpperCase() === "BODY");
      let texto = String(bodyComp?.text || nombre);
      params.forEach((p, i) => { texto = texto.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, "g"), p); });

      const extId = d?.messages?.[0]?.id || null;
      await sbPost(`/chat_messages`, {
        conversation_id: convId, tenant_id: conv.tenant_id || tenant || null,
        direction: "out", body: texto, delivery_status: "sent", external_id: extId,
      });
      await sbPatch(`/chat_conversations?id=eq.${convId}`, {
        last_message: texto, last_message_at: new Date().toISOString(), last_sender: "agent",
      });
      return json({ ok: true, texto });
    }

    return json({ error: "acción no reconocida" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
