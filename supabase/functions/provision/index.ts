// provision — operaciones privilegiadas de alta de negocios (SEGURA, server-side)
// Reemplaza el uso de la service_role key en el navegador (onboarding.js / admin-reg.js).
//   action: "onboarding" → el usuario AUTENTICADO crea SU tenant/brand/branch (una sola vez)
//   action: "approve"    → SOLO un admin de plataforma (user_profiles.role = admin)
//                          aprueba una solicitud de pos_registrations y provisiona la cuenta
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function sbAdmin(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: unknown; text: string }> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", "Prefer": "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, data, text };
}

/* Una clave temporal legible por telefono: sin caracteres que se confundan al
   dictarla (ni O ni 0, ni I ni l), pero con mayusculas, numeros y un signo. */
function nuevaClave(): string {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";      // sin I ni O
  const nums = "23456789";                        // sin 0 ni 1
  let x = "Cobra";
  for (let i = 0; i < 4; i++) x += letras[Math.floor(Math.random() * letras.length)];
  x += "!";
  for (let i = 0; i < 3; i++) x += nums[Math.floor(Math.random() * nums.length)];
  return x;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "body inválido" }); }
  const action = String(body.action || "");

  /* REGISTRARSE ES LA UNICA ACCION SIN SESION, y tiene que serlo: quien se
     registra todavia no tiene cuenta. Por eso se atiende AQUI, antes de exigir
     token. Todo lo de abajo —aprobar, crear negocio, clave nueva— sigue
     comprobando quien llama contra el servidor, nunca contra el body. */
  if (action === "registrar") {
    try {
    /* ── REGISTRARSE ──────────────────────────────────────────────────────
         Sergio, 24-ago-2026: *"yo nunca generare una contrasena para el usuario.
         El usuario la coloca desde que se registra"*.

         Y tiene razon de sobra: una clave que el sistema inventa hay que
         mandarsela por WhatsApp o por correo, y ahi se queda escrita para
         siempre en una conversacion que cualquiera puede abrir.

         ── POR QUE LA CUENTA SE CREA AQUI Y NO AL APROBAR ──────────────────
         Entre que alguien se registra y que Sergio aprueba pueden pasar horas.
         Si la clave se guardara para usarla despues, habria una contrasena en
         texto plano esperando en la base — exactamente lo que se acaba de
         corregir con el PIN. Creando la cuenta ya, la clave se la queda el
         sistema de acceso cifrada y nosotros no la vemos nunca.

         El restaurante NO se crea todavia: eso sigue pasando al aprobar. Hasta
         entonces la cuenta existe pero no tiene restaurante, y la pantalla de
         entrar le dice que su solicitud esta en revision.

         NO PIDE SESION a proposito: quien se registra todavia no tiene. */

        const email    = String(body.email || "").trim().toLowerCase();
        const clave    = String(body.clave || "");
        const nombre   = String(body.nombre || "").trim();
        const negocio  = String(body.negocio || "").trim();

        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "correo invalido" });
        if (clave.length < 8) return json(400, { error: "la contrasena debe tener al menos 8 caracteres" });
        if (!nombre || !negocio) return json(400, { error: "faltan datos" });

        /* Si ya hay una solicitud sin resolver con ese correo, no se crea otra:
           Sergio se encontraria dos filas del mismo negocio sin saber cual
           aprobar. */
        const yaPide = await sbAdmin("GET", `/rest/v1/pos_registrations?email=eq.${encodeURIComponent(email)}&status=eq.pending&select=id&limit=1`);
        if (Array.isArray(yaPide.data) && yaPide.data.length) {
          return json(409, { error: "Ya tienes una solicitud en revision con ese correo. Te avisamos apenas quede lista." });
        }

        /* Y si ya tiene cuenta, tampoco: o ya es cliente, o pidio antes. Se le
           dice que entre, en vez de dejarlo intentando registrarse otra vez. */
        const uEx = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
        });
        const uList = await uEx.json().catch(() => ({})) as Record<string, unknown>;
        const yaHay = (uList.users as Array<Record<string, unknown>> | undefined)?.find(
          (x) => String(x.email || "").toLowerCase() === email);
        if (yaHay) {
          return json(409, { error: "Ese correo ya tiene una cuenta. Entra con tu contrasena, o usa 'olvide mi contrasena'." });
        }

        const auRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            email, password: clave, email_confirm: true,
            user_metadata: { nombre, negocio, estado: "pendiente" },
          }),
        });
        const auData = await auRes.json() as Record<string, unknown>;
        if (!auRes.ok) return json(500, { error: "no se pudo crear la cuenta: " + JSON.stringify(auData).slice(0, 200) });

        const reg = await sbAdmin("POST", "/rest/v1/pos_registrations", {
          nombre, negocio, email,
          plan: String(body.plan || "pro"),
          sucursales: Number(body.sucursales || 1),
          monto_total: Number(body.monto_total || 0),
          comprobante_url: String(body.comprobante_url || "") || null,
          status: "pending",
        });
        if (!reg.ok) {
          /* La solicitud es lo que Sergio ve. Sin ella, la cuenta quedaria
             creada y nadie sabria que hay alguien esperando: se deshace. */
          const uid = String((auData.id as string) || ((auData.user as Record<string, unknown>)?.id as string) || "");
          if (uid) await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
            method: "DELETE", headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } });
          return json(500, { error: "no se pudo guardar la solicitud" });
        }

        return json(200, { ok: true });

    } catch (e) { return json(500, { error: String(e).slice(0, 200) }); }
  }

  // 1. Resolver el usuario que llama a partir de SU token (jamás confiar en el body)
  const authHeader = req.headers.get("Authorization") || "";
  const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": authHeader, "apikey": ANON_KEY },
  });
  if (!uRes.ok) return json(401, { error: "no autenticado" });
  const user = await uRes.json() as { id: string; email?: string; user_metadata?: Record<string, unknown> };

  try {
    /*  ══ PONERSE AL DIA CUANDO LA CUENTA ESTA SUSPENDIDA ══════════════

        Sergio, 28-ago-2026: *"cuando inicia sesion le aparece un modal que no
        lo deja hacer absolutamente nada hasta que no pague... el modal lo lleva
        al pago y el pagar ya vuelve a recuperar todo su acceso. La cuenta no
        puede dejar de existir ni desaparecer."*

        Dos acciones, y las dos EXIGEN SESION: el restaurante suspendido sigue
        pudiendo entrar (su cuenta existe), simplemente no puede operar. Que
        pueda entrar es justo lo que permite cobrarle sin que llame a nadie.

        POR QUE EL MONTO SE CALCULA AQUI Y NO EN LA PANTALLA. Si el navegador
        mandara cuanto va a pagar, cualquiera se pondria al dia por $1.000 y la
        fila quedaria diciendo que pago completo. El precio sale del plan que la
        cuenta TIENE hoy, de cuantas sucursales tiene abiertas y del periodo que
        elija — las mismas tres cosas que decide la consola.                 */
    if (action === "cuenta_estado" || action === "renovar") {
      const tid = String((user.user_metadata || {}).tenant_id || "");
      if (!tid) return json(400, { error: "esta cuenta todavia no tiene un negocio" });

      const tRes = await sbAdmin("GET", `/rest/v1/tenants?id=eq.${tid}&select=id,name,plan,status&limit=1`);
      const ten = Array.isArray(tRes.data) ? (tRes.data as Array<Record<string, unknown>>)[0] : null;
      if (!ten) return json(404, { error: "cuenta no encontrada" });

      const plan = String(ten.plan || "starter");
      const bRes = await sbAdmin("GET", `/rest/v1/branches?tenant_id=eq.${tid}&select=id`);
      const sucursales = Math.max(1, Array.isArray(bRes.data) ? (bRes.data as unknown[]).length : 1);

      const pRes = await sbAdmin("GET", `/rest/v1/pos_planes?plan=eq.${plan}&select=plan,nombre,precio&limit=1`);
      const pl = Array.isArray(pRes.data) ? (pRes.data as Array<Record<string, unknown>>)[0] : null;
      const base = pl && pl.precio != null ? Number(pl.precio) : null;

      /*  El descuento por volumen PRIMERO y el del periodo sobre ese total ya
          descontado — en ese orden lo decidio Sergio, y asi esta escrito en los
          terminos. Invertirlo da el mismo numero solo por casualidad
          matematica; el dia que un descuento deje de ser porcentual, no. */
      const tierOff = sucursales >= 8 ? 0.30 : sucursales >= 4 ? 0.20 : sucursales >= 2 ? 0.10 : 0;
      const PERIODOS: Record<string, { meses: number; off: number }> = {
        mensual:    { meses: 1,  off: 0    },
        trimestral: { meses: 3,  off: 0.10 },
        anual:      { meses: 12, off: 0.20 },
      };
      const cobro = (per: string) => {
        const d = PERIODOS[per];
        if (!d || base == null) return null;
        return Math.round(base * (1 - tierOff) * sucursales * d.meses * (1 - d.off));
      };

      /*  Un pago que ya esta en revision no se vuelve a pedir. Sin esto, alguien
          que refresca la pantalla manda tres comprobantes del mismo pago y en la
          consola aparecen tres deudas pagadas. */
      const yaRes = await sbAdmin("GET",
        `/rest/v1/pos_pagos_suscripcion?tenant_id=eq.${tid}&status=eq.pending&select=id,monto,periodo,created_at&order=created_at.desc&limit=1`);
      const pendiente = Array.isArray(yaRes.data) ? (yaRes.data as Array<Record<string, unknown>>)[0] || null : null;

      if (action === "cuenta_estado") {
        /*  La cuenta de cobro se manda desde aqui y no se lee en la pantalla:
            `plataforma_cobro` es de la plataforma, no del restaurante, y no
            tiene por que ser legible para un cliente cualquiera. */
        const cRes = await sbAdmin("GET", "/rest/v1/plataforma_cobro?id=eq.1&limit=1");
        const cta = Array.isArray(cRes.data) ? (cRes.data as Array<Record<string, unknown>>)[0] || null : null;
        return json(200, {
          ok: true,
          status: ten.status || "active",
          negocio: ten.name || "",
          plan, plan_nombre: (pl && pl.nombre) || plan, sucursales,
          precios: { mensual: cobro("mensual"), trimestral: cobro("trimestral"), anual: cobro("anual") },
          pendiente,
          cuenta: cta ? { banco: cta.banco, tipo: cta.tipo, titular: cta.titular, numero: cta.numero, nota: cta.nota, qr_url: cta.qr_url } : null,
        });
      }

      // ── renovar: queda un pago EN REVISION, no se reactiva solo ────────────
      if (pendiente) return json(409, { error: "Ya tenemos tu comprobante y lo estamos revisando.", pendiente });

      const periodo = String(body.periodo || "mensual");
      if (!PERIODOS[periodo]) return json(400, { error: "periodo invalido" });
      const comp = String(body.comprobante_url || "").trim();
      if (!comp) return json(400, { error: "falta el comprobante" });

      const ins = await sbAdmin("POST", "/rest/v1/pos_pagos_suscripcion", {
        tenant_id: tid, plan, sucursales, periodo, monto: cobro(periodo),
        comprobante_url: comp, status: "pending", creado_por: user.id,
      });
      if (!ins.ok) return json(500, { error: "no se pudo registrar el pago: " + ins.text });
      return json(200, { ok: true, monto: cobro(periodo), periodo });
    }

    // ── ONBOARDING: el usuario crea SU propio negocio (una sola vez) ──────────
    if (action === "onboarding") {
      const meta = user.user_metadata || {};
      if (meta.tenant_id) return json(409, { error: "esta cuenta ya tiene un negocio configurado" });

      const nombre    = String(body.nombre || "").trim();
      const branchNom = String(body.branch_nombre || nombre).trim();
      if (!nombre) return json(400, { error: "falta el nombre del negocio" });

      /* QUIEN CREA EL NEGOCIO ES SU DUENO (23-ago-2026).
         `owner_user_id` no se llenaba en ninguno de los dos caminos, asi que
         `es_dueno()` —que es como el sistema reconoce al dueno sin depender de
         la metadata, que el propio usuario puede reescribir— devolvia false
         para todo restaurante nuevo. Hoy no encierra a nadie porque el rol
         "gerente" ya abre todo, pero deja al dueno sin su unica marca fiable:
         cualquier candado que se apoye en ella lo dejaria fuera de SU casa. */
      const t = await sbAdmin("POST", "/rest/v1/tenants", {
        name: nombre, email: user.email || null, plan: "starter", status: "active",
        owner_user_id: user.id,
      });
      if (!t.ok) return json(500, { error: "tenant: " + t.text });
      const tenant = (t.data as Array<Record<string, unknown>>)[0];

      const b = await sbAdmin("POST", "/rest/v1/brands", { tenant_id: tenant.id, name: nombre });
      if (!b.ok) return json(500, { error: "brand: " + b.text });
      const brand = (b.data as Array<Record<string, unknown>>)[0];

      const branchData: Record<string, unknown> = {
        brand_id: brand.id, tenant_id: tenant.id, name: branchNom,
        address: String(body.direccion || "") || null,
        city: String(body.ciudad || "") || null,
        phone: String(body.telefono || "") || null,
        is_active: true, is_open: false,
      };
      const goal = Number(body.daily_goal);
      if (goal > 0) branchData.daily_goal = goal;
      const br = await sbAdmin("POST", "/rest/v1/branches", branchData);
      if (!br.ok) return json(500, { error: "branch: " + br.text });
      const branch = (br.data as Array<Record<string, unknown>>)[0];

      // pos_users del gerente (best-effort, no bloquea)
      /* `auth_user_id` ADEMAS de `id`. Las pantallas buscan la ficha por
         `auth_user_id`; guardando solo el `id` no la encontraban y el
         escritorio saludaba al dueno por su correo en vez de por su nombre.
         Le paso a los tres restaurantes nacidos del registro (24-ago-2026). */
      await sbAdmin("POST", "/rest/v1/pos_users", {
        id: user.id, auth_user_id: user.id,
        branch_id: branch.id, tenant_id: tenant.id,
        name: String(body.nombre_gerente || nombre),
        role: "gerente", phone: String(body.telefono || "") || null,
        email: user.email || null,
        is_authorized_admin: true,
      });

      return json(200, { ok: true, tenant_id: tenant.id, brand_id: brand.id, branch_id: branch.id });
    }



    /* ── CLAVE NUEVA para un cliente que ya existe ────────────────────────
       Hacia falta porque la clave temporal no se guarda: si Sergio cierra la
       ventana sin copiarla, o el cliente la pierde, no habia forma de volver a
       entrar. Sin esto, el unico camino era crear el restaurante otra vez.
       Solo el administrador de la plataforma, y solo sobre el DUENO. */
    if (action === "clave_nueva") {
      const adminChk2 = await sbAdmin("GET", `/rest/v1/user_profiles?id=eq.${user.id}&select=role&limit=1`);
      const esAdmin2 = Array.isArray(adminChk2.data) && (adminChk2.data as Array<Record<string, unknown>>)[0]?.role === "admin";
      if (!esAdmin2) return json(403, { error: "Solo un administrador de la plataforma puede hacer esto" });

      const tId = String(body.tenant_id || "");
      if (!tId) return json(400, { error: "falta tenant_id" });

      const tRes = await sbAdmin("GET", `/rest/v1/tenants?id=eq.${tId}&select=id,name,owner_user_id,email&limit=1`);
      const t = Array.isArray(tRes.data) ? (tRes.data as Array<Record<string, unknown>>)[0] : null;
      if (!t) return json(404, { error: "restaurante no encontrado" });

      /* El dueno sale de `owner_user_id`. Si no esta puesto —restaurantes de
         antes de que se marcara— se cae a la ficha de gerente. */
      let destino = String(t.owner_user_id || "");
      if (!destino) {
        const pu = await sbAdmin("GET", `/rest/v1/pos_users?tenant_id=eq.${tId}&role=eq.gerente&select=auth_user_id,id&limit=1`);
        const fila = Array.isArray(pu.data) ? (pu.data as Array<Record<string, unknown>>)[0] : null;
        destino = String(fila?.auth_user_id || fila?.id || "");
      }
      if (!destino) return json(404, { error: "ese restaurante no tiene dueno con cuenta de acceso" });

      const clv = nuevaClave();
      const up = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${destino}`, {
        method: "PUT",
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: clv }),
      });
      if (!up.ok) return json(500, { error: "no se pudo cambiar la clave: " + await up.text() });

      const quien = await sbAdmin("GET", `/auth/v1/admin/users/${destino}`);
      return json(200, {
        ok: true, clave_temporal: clv,
        email: (quien.data as Record<string, unknown>)?.email || t.email || null,
        negocio: t.name || null,
      });
    }

    // ── APPROVE: solo admin de plataforma ─────────────────────────────────────
    if (action === "approve") {
      /* ADMINISTRADOR DE LA PLATAFORMA, no de un restaurante.
         Antes esto miraba `pos_users.is_authorized_admin`, que significa otra
         cosa: "es el administrador de SU restaurante" — el que tiene el PIN para
         autorizar descuentos y anulaciones. Y la propia funcion se lo pone en
         true a CADA restaurante que aprueba.
         O sea que todo cliente aprobado quedaba pudiendo aprobar a otros y
         crear cuentas en la plataforma. Se cambia por la unica definicion real
         de administrador de plataforma, la misma que usan la consola y las
         politicas de la base. */
      const adminChk = await sbAdmin("GET", `/rest/v1/user_profiles?id=eq.${user.id}&select=role&limit=1`);
      const isAdmin = Array.isArray(adminChk.data) && (adminChk.data as Array<Record<string, unknown>>)[0]?.role === "admin";
      if (!isAdmin) return json(403, { error: "Solo un administrador de la plataforma puede aprobar solicitudes" });

      const regId = String(body.registration_id || "");
      if (!regId) return json(400, { error: "falta registration_id" });
      const rRes = await sbAdmin("GET", `/rest/v1/pos_registrations?id=eq.${regId}&limit=1`);
      const reg = Array.isArray(rRes.data) ? (rRes.data as Array<Record<string, unknown>>)[0] : null;
      if (!reg) return json(404, { error: "solicitud no encontrada" });

      /* CADA PASO COMPRUEBA SI YA ESTA HECHO.
         Antes, si algo fallaba a mitad del camino, volver a darle a Aprobar
         chocaba con "el correo ya existe" y no habia forma de salir sin meter
         mano en la base. Ahora reintentar retoma donde quedo. */
      const tEx = await sbAdmin("GET", `/rest/v1/tenants?email=eq.${encodeURIComponent(String(reg.email))}&limit=1`);
      let tenant = Array.isArray(tEx.data) ? (tEx.data as Array<Record<string, unknown>>)[0] : null;
      if (!tenant) {
        const t = await sbAdmin("POST", "/rest/v1/tenants", {
          name: reg.negocio, email: reg.email, plan: reg.plan || "starter", status: "active",
        });
        if (!t.ok) return json(500, { error: "cuenta: " + t.text });
        tenant = (t.data as Array<Record<string, unknown>>)[0];
      }

      const bEx = await sbAdmin("GET", `/rest/v1/brands?tenant_id=eq.${tenant.id}&limit=1`);
      let brand = Array.isArray(bEx.data) ? (bEx.data as Array<Record<string, unknown>>)[0] : null;
      if (!brand) {
        const b = await sbAdmin("POST", "/rest/v1/brands", { tenant_id: tenant.id, name: reg.negocio });
        if (!b.ok) return json(500, { error: "marca: " + b.text });
        brand = (b.data as Array<Record<string, unknown>>)[0];
      }

      /* La columna se llama `sucursales`, no `branches`. Con el nombre
         equivocado siempre salia 1, aunque el restaurante hubiera pagado dos. */
      const branchCount = Number(reg.sucursales) || 1;
      const branchRows = [];
      for (let i = 0; i < branchCount; i++) {
        branchRows.push({
          brand_id: brand.id, tenant_id: tenant.id,
          name: branchCount === 1 ? reg.negocio : `${reg.negocio} — Sucursal ${i + 1}`,
          is_active: true, is_open: false,
        });
      }
      const sEx = await sbAdmin("GET", `/rest/v1/branches?tenant_id=eq.${tenant.id}&order=created_at.asc`);
      let sucursales = Array.isArray(sEx.data) ? (sEx.data as Array<Record<string, unknown>>) : [];
      if (sucursales.length < branchCount) {
        const faltan = branchRows.slice(sucursales.length);
        const br = await sbAdmin("POST", "/rest/v1/branches", faltan);
        if (!br.ok) return json(500, { error: "sucursales: " + br.text });
        sucursales = sucursales.concat(br.data as Array<Record<string, unknown>>);
      }
      const firstBranch = sucursales[0];

      /* La cuenta de acceso. Se genera una clave temporal y se DEVUELVE, para
         que Sergio se la pase al cliente.

         NO SE GUARDA EN NINGUNA PARTE, a proposito: una clave escrita en la
         base es una clave que cualquiera con acceso a la base puede leer —
         justo lo que se acaba de corregir con el PIN. Por eso la consola la
         muestra UNA vez, para copiar y mandar. Si se pierde no se recupera: se
         genera otra con la accion `clave_nueva`. */
      const claveTemporal = nuevaClave();

      const uEx = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(String(reg.email))}`, {
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
      });
      const uList = await uEx.json().catch(() => ({})) as Record<string, unknown>;
      const yaExiste = (uList.users as Array<Record<string, unknown>> | undefined)?.find(
        (x) => String(x.email || "").toLowerCase() === String(reg.email).toLowerCase());

      let userId = "";
      let clave: string | null = null;
      if (yaExiste) {
        userId = String(yaExiste.id);
      } else {
        const auRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            email: reg.email, password: claveTemporal, email_confirm: true,
            user_metadata: {
              nombre: reg.nombre, negocio: reg.negocio,
              tenant_id: tenant.id, branch_id: firstBranch.id, role: "gerente",
            },
          }),
        });
        const auData = await auRes.json() as Record<string, unknown>;
        if (!auRes.ok) return json(500, { error: "cuenta de acceso: " + JSON.stringify(auData) });
        userId = String((auData.id as string) || ((auData.user as Record<string, unknown>)?.id as string) || "");
        clave = claveTemporal;
      }

      await sbAdmin("POST", "/rest/v1/pos_users", {
        id: userId, auth_user_id: userId,      // ver la nota de arriba
        branch_id: firstBranch.id, tenant_id: tenant.id,
        name: reg.nombre, role: "gerente",
        email: reg.email || null,
        is_authorized_admin: true,
      });

      /* El dueno se marca AQUI y no arriba porque su cuenta de acceso nace
         despues que el restaurante. Solo si esta vacio: si se vuelve a darle a
         Aprobar, no se le cambia el dueno a un restaurante que ya trabaja. */
      if (!tenant.owner_user_id && userId) {
        await sbAdmin("PATCH", `/rest/v1/tenants?id=eq.${tenant.id}&owner_user_id=is.null`,
          { owner_user_id: userId });
      }

      /* El cierre: marcar la solicitud como aprobada. Aqui estaban DOS de los
         cuatro errores — el estado iba en espanol ("aprobado") y la tabla solo
         acepta pending/approved/rejected, y `password_tmp` no existe. Las dos
         cosas hacian fallar esta actualizacion, y como nadie miraba el
         resultado, todo el trabajo se hacia y la solicitud seguia pendiente. */
      /* EL CORREO DE BIENVENIDA. Va aqui, cuando el restaurante ya quedo
         creado y hay clave que mandar.

         NO SE ESPERA Y NO PUEDE FALLAR HACIA AFUERA: si el correo no sale, el
         restaurante ya existe y su dueno necesita entrar igual. Sergio ve la
         clave en la consola de todas formas, asi que el correo es un extra,
         no el unico camino. Al reves —aprobar solo si el correo salio— seria
         dejar un restaurante pagado a medio crear por un problema de un
         servicio de terceros. */
      if (clave) {
        try {
          const cr = await fetch(`${SUPABASE_URL}/functions/v1/enviar-correo`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: "bienvenida", para: reg.email,
              nombre: reg.nombre, negocio: reg.negocio, clave,
            }),
          });
          const cd = await cr.json().catch(() => ({}));
          console.log(`[aprobar] correo a ${reg.email}: ${cd?.enviado ? "enviado" : "NO enviado (" + (cd?.razon || "?") + ")"}`);
        } catch (e) {
          console.error("[aprobar] el correo no salio:", String(e).slice(0, 200));
        }
      }

      const fin = await sbAdmin("PATCH", `/rest/v1/pos_registrations?id=eq.${regId}`, {
        status: "approved", reviewed_at: new Date().toISOString(),
        tenant_id: tenant.id, user_id: userId,
      });
      if (!fin.ok) {
        return json(500, {
          error: "La cuenta quedo creada pero no se pudo cerrar la solicitud: " + fin.text +
                 ". Vuelve a darle a Aprobar: retoma donde quedo.",
        });
      }

      return json(200, {
        ok: true, tenant_id: tenant.id, user_id: userId, branches: sucursales.length,
        clave_temporal: clave,
      });
    }

    return json(400, { error: "action desconocida" });
  } catch (err) {
    console.error("provision error:", err);
    return json(500, { error: String(err) });
  }
});
