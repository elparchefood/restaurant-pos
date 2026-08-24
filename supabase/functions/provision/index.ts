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

  // 1. Resolver el usuario que llama a partir de SU token (jamás confiar en el body)
  const authHeader = req.headers.get("Authorization") || "";
  const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": authHeader, "apikey": ANON_KEY },
  });
  if (!uRes.ok) return json(401, { error: "no autenticado" });
  const user = await uRes.json() as { id: string; email?: string; user_metadata?: Record<string, unknown> };

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "body inválido" }); }
  const action = String(body.action || "");

  try {
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
