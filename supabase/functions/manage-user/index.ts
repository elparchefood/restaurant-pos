// ═══════════════════════════════════════════════════════════════════════════
//  manage-user — crear / editar / borrar las cuentas de acceso de UN restaurante
// ───────────────────────────────────────────────────────────────────────────
//  COMO ESTABA HASTA EL 23-AGO-2026 (agujero critico, hallado en la auditoria
//  de multimarca que pidio Sergio):
//
//    Deno.serve(async (req) => {
//      const { action, userId, email, password, metadata } = await req.json();
//      ...llama a /auth/v1/admin/users con la clave de servicio...
//    });
//
//  No miraba QUIEN llamaba. Ni una linea. Y estaba publicada con
//  verify_jwt = false, o sea abierta a internet sin token. Cualquiera que
//  supiera la direccion podia, desde una terminal:
//    · crear una cuenta con {tenant_id: <el de El Parche>, role: "gerente"}
//      y entrar a la caja, las ventas y los clientes de cualquier restaurante;
//    · CAMBIARLE LA CONTRASENA a cualquier cuenta —la del dueno incluida— y
//      quedarse con ella;
//    · BORRAR usuarios.
//  La pantalla ya mandaba el token de la sesion (configuracion.js/manageUser);
//  era el servidor el que lo tiraba a la basura. Por eso el arreglo es entero
//  de este lado y no toca ni una linea del front.
//
//  COMO QUEDA. Tres candados, en orden:
//    1. QUIEN LLAMA: token valido o no se pasa de aqui.
//    2. QUE PUEDE: tiene que ser el dueno del restaurante, su administrador,
//       o un administrador de la plataforma. Un mesero con sesion abierta no
//       crea cuentas.
//    3. SOBRE QUIEN: el restaurante sale del SERVIDOR (pos_users / tenants),
//       nunca del cuerpo del mensaje ni de la metadata —que el propio usuario
//       puede reescribir con sb.auth.updateUser, comprobado el 12-ago—. Al
//       crear se le PISA el tenant_id al que sea del que llama, y al editar o
//       borrar el objetivo tiene que ser de su mismo restaurante.
//
//  Y el dueno no se puede borrar ni desde su propio restaurante: dejaria la
//  cuenta sin nadie que entre a todo.
// ═══════════════════════════════════════════════════════════════════════════
const SB_URL   = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ADMIN_H = {
  "apikey": SVC_KEY,
  "Authorization": "Bearer " + SVC_KEY,
  "Content-Type": "application/json",
};

function fin(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

/* Consulta con la clave de servicio: se salta RLS a proposito, porque esto ES
   el guardia. Lo que devuelve se usa para DECIDIR, no para mostrar. */
async function verTabla(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: ADMIN_H });
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── 1. QUIEN LLAMA ─────────────────────────────────────────────────────
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return fin(401, { error: "Tu sesión se venció. Vuelve a entrar." });

    const uRes = await fetch(SB_URL + "/auth/v1/user", {
      headers: { "Authorization": auth, "apikey": ANON_KEY },
    });
    if (!uRes.ok) return fin(401, { error: "Tu sesión se venció. Vuelve a entrar." });
    const quien = await uRes.json() as { id: string };
    const quienId = String(quien.id || "");
    if (!quienId) return fin(401, { error: "Tu sesión se venció. Vuelve a entrar." });

    // ── 2. QUE PUEDE ───────────────────────────────────────────────────────
    /* Administrador de LA PLATAFORMA (la consola de Sergio), que es otra cosa
       que el administrador de un restaurante. */
    const perfil = await verTabla("user_profiles?id=eq." + quienId + "&select=role&limit=1");
    const esAdminPlataforma = String(perfil[0]?.role || "") === "admin";

    /* De que restaurante es. Se le pregunta a la BASE, no a la metadata. */
    const propios = await verTabla("tenants?owner_user_id=eq." + quienId + "&select=id&limit=1");
    const filaPos = await verTabla(
      "pos_users?id=eq." + quienId + "&select=tenant_id,role,is_authorized_admin&limit=1");

    const tenantDueno = propios[0]?.id ? String(propios[0].id) : null;
    const tenantPos   = filaPos[0]?.tenant_id ? String(filaPos[0].tenant_id) : null;
    const miTenant    = tenantDueno || tenantPos;

    /* Manda si es el dueno, o si su restaurante lo marco como administrador
       (`is_authorized_admin`, el mismo que guarda el PIN), o si su rol tiene
       la clave interna `admin` —la clave, no el nombre, que el dueno renombra
       cuando quiera—. */
    let mandaAqui = !!tenantDueno || filaPos[0]?.is_authorized_admin === true;
    if (!mandaAqui && miTenant) {
      const rolTxt = String(filaPos[0]?.role || "").toLowerCase().trim();
      if (rolTxt) {
        const roles = await verTabla("pos_roles?tenant_id=eq." + miTenant + "&select=clave,name");
        const suyo = roles.find((r) =>
          String(r.name || "").toLowerCase().trim() === rolTxt ||
          String(r.clave || "") === rolTxt);
        if (String(suyo?.clave || "") === "admin") mandaAqui = true;
      }
    }

    if (!esAdminPlataforma && !(mandaAqui && miTenant)) {
      return fin(403, {
        error: "Solo el dueño o un administrador del restaurante puede gestionar las cuentas.",
      });
    }

    // ── 3. SOBRE QUIEN ─────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action   = String(body.action || "");
    const userId   = body.userId ? String(body.userId) : "";
    const email    = body.email ? String(body.email) : "";
    const password = body.password ? String(body.password) : "";
    const metaIn   = (body.metadata || {}) as Record<string, unknown>;

    const adminBase = SB_URL + "/auth/v1/admin/users";

    /* Que la cuenta que se toca sea del MISMO restaurante. Un admin de la
       plataforma se lo salta; nadie mas. */
    async function esDeMiCasa(id: string): Promise<boolean> {
      if (esAdminPlataforma) return true;
      const f = await verTabla("pos_users?id=eq." + id + "&select=tenant_id&limit=1");
      return !!f[0] && String(f[0].tenant_id) === miTenant;
    }
    /* El dueno no se toca desde el restaurante. */
    async function esDuenoDeAlgo(id: string): Promise<boolean> {
      const f = await verTabla("tenants?owner_user_id=eq." + id + "&select=id&limit=1");
      return f.length > 0;
    }

    let res: Response;

    if (action === "create") {
      if (!email) return fin(400, { error: "Falta el correo de la cuenta." });
      /* SE LE PISA EL RESTAURANTE. Venia en el cuerpo del mensaje, o sea que
         lo elegia quien llamaba: con eso se creaba un gerente dentro de
         cualquier otro restaurante. */
      const meta: Record<string, unknown> = { ...metaIn };
      if (!esAdminPlataforma) {
        meta.tenant_id = miTenant;
        /* Y la sucursal tiene que ser de este restaurante. */
        if (meta.branch_id) {
          const suc = await verTabla(
            "branches?id=eq." + String(meta.branch_id) + "&select=tenant_id&limit=1");
          if (!suc[0] || String(suc[0].tenant_id) !== miTenant) delete meta.branch_id;
        }
      }
      res = await fetch(adminBase, {
        method: "POST",
        headers: ADMIN_H,
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
      });

    } else if (action === "update") {
      if (!userId) return fin(400, { error: "Falta la cuenta a editar." });
      if (!await esDeMiCasa(userId)) {
        return fin(403, { error: "Esa cuenta no es de tu restaurante." });
      }
      if (!esAdminPlataforma && userId !== quienId && await esDuenoDeAlgo(userId)) {
        return fin(403, { error: "La cuenta del dueño solo la puede cambiar él mismo." });
      }
      const upd: Record<string, unknown> = {};
      if (email) upd.email = email;
      if (password) upd.password = password;
      if (body.metadata) {
        const meta: Record<string, unknown> = { ...metaIn };
        if (!esAdminPlataforma) meta.tenant_id = miTenant;   // no se muda de restaurante
        upd.user_metadata = meta;
      }
      res = await fetch(adminBase + "/" + userId, {
        method: "PUT", headers: ADMIN_H, body: JSON.stringify(upd),
      });

    } else if (action === "delete") {
      if (!userId) return fin(400, { error: "Falta la cuenta a eliminar." });
      if (!await esDeMiCasa(userId)) {
        return fin(403, { error: "Esa cuenta no es de tu restaurante." });
      }
      if (await esDuenoDeAlgo(userId)) {
        return fin(403, {
          error: "No se puede eliminar la cuenta del dueño: el restaurante se quedaría sin nadie con acceso total.",
        });
      }
      await fetch(adminBase + "/" + userId, { method: "DELETE", headers: ADMIN_H });
      return fin(200, { deleted: true });

    } else {
      return fin(400, { error: "Acción no válida" });
    }

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (data.error || data.msg) {
      return fin(400, { error: String(data.error || data.msg) });
    }
    return fin(200, data);

  } catch (e) {
    return fin(400, { error: (e as Error).message });
  }
});
