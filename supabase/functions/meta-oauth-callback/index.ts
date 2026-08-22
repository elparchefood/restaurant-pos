const APP_ID     = "1732760657903466";
const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const REDIRECT   = "https://elparchefood.github.io/restaurant-pos/";
const GRAPH      = "https://graph.facebook.com/v22.0";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { code, channel, branch_id, tenant_id } = body;
    const paso = String(body.paso || "");

    /* ══ PASO 2: la pagina ya se eligio ══════════════════════════════════
       Llega la sesion del paso 1 y cual pagina quiere. El token quedo
       guardado en la base, no en el navegador. */
    if (paso === "guardar") {
      const pendId = String(body.sesion || "");
      const pageId = String(body.page_id || "");
      if (!pendId || !pageId) return json({ error: "Falta la sesion o la pagina" }, 400);

      const pendRows = await sbGet(`/rest/v1/meta_oauth_pendiente?id=eq.${pendId}&limit=1`);
      const pend = pendRows?.[0];
      if (!pend) return json({ error: "La conexion expiro. Vuelve a empezar." }, 400);

      const page = (pend.paginas as Array<Record<string, unknown>>).find(
        (p) => String(p.id) === pageId);
      if (!page) return json({ error: "Esa pagina ya no esta en la lista" }, 400);

      const guardado = await guardarCanal(
        String(pend.channel), page, String(pend.token),
        String(pend.tenant_id), String(pend.branch_id));

      // Se usa una sola vez: el token no se queda dando vueltas.
      await sbDel(`/rest/v1/meta_oauth_pendiente?id=eq.${pendId}`);
      return guardado;
    }

    if (!code || !channel || !branch_id || !tenant_id)
      return json({ error: "Faltan parametros" }, 400);

    /* 1. Intercambiar code por user token.
       Facebook exige que la direccion de retorno del CANJE sea IDENTICA a la
       del login, y aqui hay dos caminos que la tienen distinta:
         · FB.login() del SDK -> el canje va SIN direccion (cadena vacia), que
           es lo que Meta indica para los codigos del SDK;
         · el ejecutable, que intercepta un redirect completo -> ahi si lleva
           la direccion de la pagina.
       Antes se mandaba siempre una fija (github.io) y por eso se rompio al
       mudar el sistema a cobrapos.app. Se prueban en orden. */
    const candidatas: string[] = [];
    if (typeof body.redirect_uri === "string" && body.redirect_uri) candidatas.push(body.redirect_uri);
    candidatas.push("");          // el camino del SDK
    candidatas.push(REDIRECT);    // la de siempre, para el ejecutable

    let userToken = "";
    let usada = "";
    let ultimoError = "";
    for (const cand of candidatas) {
      const r = await fetch(
        `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}` +
        `&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(cand)}`
      );
      const d = await r.json();
      if (d.access_token) { userToken = d.access_token; usada = cand || "(vacia)"; break; }
      ultimoError = d.error?.message || "sin detalle";
    }
    if (!userToken) return json({ error: ultimoError }, 400);

    /* Cual sirvio queda anotado: la proxima vez que esto se rompa no hay que
       adivinar de nuevo. */
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/pos_diag`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          donde: "meta-oauth/canje",
          mensaje: `canal=${channel} redirect_uri=${usada}`,
        }),
      });
    } catch { /* el diagnostico no puede tumbar la conexion */ }

    // 2. Token de larga duracion
    const longRes  = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(userToken)}`
    );
    const longData = await longRes.json();
    const longToken = longData.access_token || userToken;

    /* ══ PASO 1: mostrar las paginas para que elija ══════════════════════
       Se piden CON su cuenta de Instagram, para poder avisar cual sirve para
       Instagram y cual no ANTES de que elija — y no despues, con un error. */
    if (paso === "listar") {
      const pr = await fetch(
        `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longToken}`
      );
      const pd = await pr.json();
      if (pd.error) return json({ error: pd.error.message }, 400);

      const paginas = (pd.data as Array<Record<string, unknown>> || []);
      if (!paginas.length)
        return json({ error: "Tu cuenta de Facebook no administra ninguna pagina." }, 400);

      const ins = await fetch(`${SUPABASE_URL}/rest/v1/meta_oauth_pendiente`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({ tenant_id, branch_id, channel, token: longToken, paginas }),
      });
      if (!ins.ok) return json({ error: await ins.text() }, 500);
      const pendiente = (await ins.json())[0];

      /* Al navegador solo va lo que hay que MOSTRAR. Ni el token de la pagina
         ni el del usuario salen de aqui. */
      return json({
        ok: true,
        sesion: pendiente.id,
        paginas: paginas.map((p) => ({
          id: p.id,
          nombre: p.name,
          instagram: (p.instagram_business_account as Record<string, unknown> | undefined)?.username || null,
        })),
      });
    }

    // 3. Construir datos segun canal
    const upsertData: Record<string, unknown> = {
      tenant_id, branch_id, channel,
      connected: true,
      meta: { access_token: longToken, connected_at: new Date().toISOString() },
    };

    if (channel === "facebook" || channel === "instagram") {
      /* Camino VIEJO (sin `paso`): toma la primera pagina. Se deja porque el
         ejecutable de Sergio puede tener la pantalla anterior y no puede
         quedarse sin poder conectar de un dia para otro. */
      const pagesRes  = await fetch(
        `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longToken}`);
      const pagesData = await pagesRes.json();
      const page = pagesData.data?.[0];
      if (!page) return json({ error: "No se encontro ninguna pagina de Facebook" }, 400);

      if (channel === "facebook") {
        upsertData.handle       = page.name;
        upsertData.display_name = page.name;
        (upsertData.meta as Record<string,unknown>).page_id    = page.id;
        (upsertData.meta as Record<string,unknown>).page_token = page.access_token;
      } else {
        const igRes  = await fetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        const igData = await igRes.json();
        if (!igData.instagram_business_account?.id)
          return json({ error: "No hay cuenta Instagram Business vinculada a la pagina" }, 400);

        const igId = igData.instagram_business_account.id;
        const igProfileRes = await fetch(
          `${GRAPH}/${igId}?fields=id,name,username&access_token=${longToken}`
        );
        const igProfile = await igProfileRes.json();
        upsertData.handle       = "@" + (igProfile.username || igId);
        upsertData.display_name = igProfile.name || igProfile.username;
        (upsertData.meta as Record<string,unknown>).ig_id      = igId;
        (upsertData.meta as Record<string,unknown>).username   = igProfile.username;
        (upsertData.meta as Record<string,unknown>).page_id    = page.id;
        (upsertData.meta as Record<string,unknown>).page_token = page.access_token;

        // Suscribir pagina al webhook
        try {
          await fetch(`${GRAPH}/${page.id}/subscribed_apps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks",
              access_token: page.access_token,
            }),
          });
        } catch { /* non-fatal */ }
      }

    } else if (channel === "whatsapp") {
      // waba_id y phone_number_id vienen del evento WA_EMBEDDED_SIGNUP del SDK
      let wabaId   = body.waba_id;
      let phoneId  = body.phone_number_id;

      // Fallback oficial de Meta: usar debug_token para obtener granular_scopes.
      // OJO: el scope whatsapp_business_messaging devuelve el WABA id (no el phone id),
      // por eso mas abajo el phone_id REAL siempre se re-deriva de /{waba}/phone_numbers.
      if (!wabaId || !phoneId) {
        const debugRes  = await fetch(
          `${GRAPH}/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${APP_ID}|${APP_SECRET}`
        );
        const debugData = await debugRes.json();
        const granularScopes: Array<{scope: string; target_ids?: string[]}> =
          debugData?.data?.granular_scopes || [];

        for (const gs of granularScopes) {
          if (gs.scope === "whatsapp_business_management" && gs.target_ids?.[0]) {
            wabaId = gs.target_ids[0];
          }
          if (gs.scope === "whatsapp_business_messaging" && gs.target_ids?.[0]) {
            phoneId = gs.target_ids[0];
          }
        }
      }

      // Segundo fallback: iterar negocios del usuario buscando WABAs propias y de cliente
      if (!wabaId || !phoneId) {
        const bizRes  = await fetch(`${GRAPH}/me/businesses?access_token=${longToken}`);
        const bizData = await bizRes.json();
        const businesses: Array<{id: string}> = bizData.data || [];

        for (const biz of businesses) {
          const ownedRes  = await fetch(`${GRAPH}/${biz.id}/owned_whatsapp_business_accounts?access_token=${longToken}`);
          const ownedData = await ownedRes.json();
          const ownedWaba = ownedData.data?.[0];
          if (ownedWaba) {
            wabaId = ownedWaba.id;
            const phonesRes  = await fetch(`${GRAPH}/${ownedWaba.id}/phone_numbers?access_token=${longToken}`);
            const phonesData = await phonesRes.json();
            phoneId = phonesData.data?.[0]?.id;
            if (wabaId && phoneId) break;
          }
          if (!wabaId || !phoneId) {
            const clientRes  = await fetch(`${GRAPH}/${biz.id}/client_whatsapp_business_accounts?access_token=${longToken}`);
            const clientData = await clientRes.json();
            const clientWaba = clientData.data?.[0];
            if (clientWaba) {
              wabaId = clientWaba.id;
              const phonesRes  = await fetch(`${GRAPH}/${clientWaba.id}/phone_numbers?access_token=${longToken}`);
              const phonesData = await phonesRes.json();
              phoneId = phonesData.data?.[0]?.id;
              if (wabaId && phoneId) break;
            }
          }
        }
      }

      if (!wabaId)
        return json({ error: "No se pudo encontrar la cuenta de WhatsApp Business. Asegurate de completar todos los pasos del flujo de conexion." }, 400);

      // Obtener datos del numero via WABA (mas confiable que /{phoneId} directamente)
      let displayPhone = "";
      let verifiedName = "";
      const phonesListRes  = await fetch(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${longToken}`);
      const phonesListData = await phonesListRes.json();
      const matchedPhone   = (phonesListData.data || []).find((p: {id: string}) => p.id === phoneId)
                             || phonesListData.data?.[0];

      // El phone_number_id REAL SIEMPRE se toma de la lista de numeros del WABA.
      // (El scope whatsapp_business_messaging del debug_token devuelve el WABA id, no el
      //  phone id → sin esto quedaba guardado phone_id = waba_id y no se podia enviar.)
      if (matchedPhone?.id) phoneId = matchedPhone.id;
      if (matchedPhone) {
        displayPhone = matchedPhone.display_phone_number || "";
        verifiedName = matchedPhone.verified_name || "";
      }
      // Fallback: llamada directa al phoneId
      if (!displayPhone && phoneId) {
        const phoneRes  = await fetch(`${GRAPH}/${phoneId}?fields=display_phone_number,verified_name&access_token=${longToken}`);
        const phoneData = await phoneRes.json();
        displayPhone = phoneData.display_phone_number || "";
        verifiedName = phoneData.verified_name || verifiedName;
      }

      if (!phoneId)
        return json({ error: "No se pudo encontrar el numero de WhatsApp. Asegurate de completar todos los pasos del flujo de conexion." }, 400);

      // Registrar el numero en la Cloud API => queda ACTIVO al instante.
      // Sin esto el numero aparece "como si no tuviera WhatsApp" (no recibe ni envia).
      // Se genera un PIN de verificacion en dos pasos y se guarda para futuras re-registraciones.
      const waPin = String(Math.floor(100000 + Math.random() * 900000));
      try {
        const regRes  = await fetch(`${GRAPH}/${phoneId}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${longToken}` },
          body: JSON.stringify({ messaging_product: "whatsapp", pin: waPin }),
        });
        const regData = await regRes.json();
        (upsertData.meta as Record<string,unknown>).pin        = waPin;
        (upsertData.meta as Record<string,unknown>).registered = !!regData.success;
      } catch { /* no fatal: se puede registrar despues */ }

      upsertData.handle       = displayPhone || phoneId;
      upsertData.display_name = verifiedName || displayPhone || phoneId;
      (upsertData.meta as Record<string,unknown>).waba_id  = wabaId;
      (upsertData.meta as Record<string,unknown>).phone_id = phoneId;

      // Suscribir WABA al webhook de la app
      try {
        await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: longToken }),
        });
      } catch { /* non-fatal */ }
    }

    // 4. Guardar en chat_channels
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_channels?on_conflict=branch_id,channel`, {
      method: "POST",
      headers: {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        ...upsertData,
        meta: upsertData.meta,   // objeto, NO texto: la columna es jsonb
      }),
    });
    if (!sbRes.ok) {
      const err = await sbRes.text();
      return json({ error: err }, 500);
    }

    return json({ ok: true, handle: upsertData.handle });

  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});


/* Leer de la base con la llave de servicio. */
async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!r.ok) return null;
  return await r.json();
}
async function sbDel(path: string) {
  await fetch(`${SUPABASE_URL}${path}`, {
    method: "DELETE",
    headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
}

/* Guarda la pagina ELEGIDA como canal. Es lo mismo que hacia el flujo de
   siempre, pero con una pagina que llega por parametro en vez de la primera. */
async function guardarCanal(
  channel: string,
  page: Record<string, unknown>,
  longToken: string,
  tenantId: string,
  branchId: string,
): Promise<Response> {
  const pageId    = String(page.id);
  const pageToken = String(page.access_token);
  const meta: Record<string, unknown> = {
    access_token: longToken,
    connected_at: new Date().toISOString(),
    page_id: pageId,
    page_token: pageToken,
  };
  let handle = String(page.name || "");
  let display = handle;

  if (channel === "instagram") {
    const ig = page.instagram_business_account as Record<string, unknown> | undefined;
    if (!ig?.id) {
      return json({ error: `La pagina "${page.name}" no tiene una cuenta de Instagram Business vinculada. Vincualas en Facebook y vuelve a intentar.` }, 400);
    }
    meta.ig_id = ig.id;
    meta.username = ig.username;
    handle = "@" + (ig.username || ig.id);
    display = String(ig.username || ig.id);
  }

  /* ══ LA FOTO DEL CANAL (22-ago-2026) ══════════════════════════════════
     Para que en "Canales conectados" cada red se vea con su cara, igual que
     WhatsApp. Cada una se pide por SU camino —comprobado contra Meta—:
       Instagram  /{ig_id}?fields=profile_picture_url
       Facebook   /{page_id}/picture?redirect=false
       (con `fields=picture{url}` Meta responde error de sintaxis)

     Y NO se guarda el enlace de Meta: viene firmado y CADUCA. A la foto de
     WhatsApp ya le paso —quedo rota una semana en el panel—, y por eso desde
     entonces se guarda en nuestro propio almacenamiento. Aqui igual.

     Si algo de esto falla, el canal se conecta lo mismo: quedarse sin foto
     es un detalle, no poder conectar es un problema. */
  try {
    const idFoto = channel === "instagram"
      ? String((page.instagram_business_account as Record<string, unknown> | undefined)?.id || "")
      : pageId;
    const urlFoto = channel === "instagram"
      ? `${GRAPH}/${idFoto}?fields=profile_picture_url&access_token=${encodeURIComponent(pageToken)}`
      : `${GRAPH}/${pageId}/picture?redirect=false&width=400&height=400&access_token=${encodeURIComponent(pageToken)}`;
    const rf = await fetch(urlFoto);
    const df = await rf.json().catch(() => ({})) as Record<string, unknown>;
    const remota = String(df.profile_picture_url || ((df.data as Record<string, unknown>) || {}).url || "");
    if (remota) {
      const img = await fetch(remota);
      if (img.ok) {
        const bytes = new Uint8Array(await img.arrayBuffer());
        const ruta = `perfiles/${channel}-${pageId}.jpg`;
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/chat-media/${ruta}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
          },
          body: bytes,
        });
        if (up.ok) {
          meta.profile_picture_url = `${SUPABASE_URL}/storage/v1/object/public/chat-media/${ruta}`;
        } else {
          console.error("[foto canal] no se pudo guardar:", (await up.text()).slice(0, 200));
        }
      }
    } else if (df.error) {
      console.error("[foto canal]", JSON.stringify(df.error).slice(0, 200));
    }
  } catch (e) { console.error("[foto canal]", String(e).slice(0, 200)); }

  /* Suscribir la pagina a los avisos: es para lo que sirve
     `pages_manage_metadata`. Sin esto no llega ni un mensaje. */
  try {
    await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: "messages,messaging_postbacks",
        access_token: pageToken,
      }),
    });
  } catch { /* no es fatal: se puede reintentar conectando otra vez */ }

  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_channels?on_conflict=branch_id,channel`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      tenant_id: tenantId, branch_id: branchId, channel,
      connected: true, handle, display_name: display,
      meta: meta,   // objeto, NO texto: la columna es jsonb
    }),
  });
  if (!sbRes.ok) return json({ error: await sbRes.text() }, 500);
  return json({ ok: true, handle });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
