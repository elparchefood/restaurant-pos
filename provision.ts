// provision — operaciones privilegiadas de alta de negocios (SEGURA, server-side)
// Reemplaza el uso de la service_role key en el navegador (onboarding.js / admin-reg.js).
//   action: "onboarding" → el usuario AUTENTICADO crea SU tenant/brand/branch (una sola vez)
//   action: "approve"    → SOLO un admin de plataforma (pos_users.is_authorized_admin)
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

      const t = await sbAdmin("POST", "/rest/v1/tenants", {
        name: nombre, email: user.email || null, plan: "starter", status: "active",
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
      await sbAdmin("POST", "/rest/v1/pos_users", {
        id: user.id, branch_id: branch.id, tenant_id: tenant.id,
        name: String(body.nombre_gerente || nombre),
        role: "gerente", phone: String(body.telefono || "") || null,
        is_authorized_admin: true,
      });

      return json(200, { ok: true, tenant_id: tenant.id, brand_id: brand.id, branch_id: branch.id });
    }

    // ── APPROVE: solo admin de plataforma ─────────────────────────────────────
    if (action === "approve") {
      const adminChk = await sbAdmin("GET", `/rest/v1/pos_users?id=eq.${user.id}&select=is_authorized_admin&limit=1`);
      const isAdmin = Array.isArray(adminChk.data) && (adminChk.data as Array<Record<string, unknown>>)[0]?.is_authorized_admin === true;
      if (!isAdmin) return json(403, { error: "no autorizado" });

      const regId = String(body.registration_id || "");
      if (!regId) return json(400, { error: "falta registration_id" });
      const rRes = await sbAdmin("GET", `/rest/v1/pos_registrations?id=eq.${regId}&limit=1`);
      const reg = Array.isArray(rRes.data) ? (rRes.data as Array<Record<string, unknown>>)[0] : null;
      if (!reg) return json(404, { error: "solicitud no encontrada" });

      const t = await sbAdmin("POST", "/rest/v1/tenants", {
        name: reg.negocio, email: reg.email, plan: reg.plan || "starter", status: "active",
      });
      if (!t.ok) return json(500, { error: "tenant: " + t.text });
      const tenant = (t.data as Array<Record<string, unknown>>)[0];

      const b = await sbAdmin("POST", "/rest/v1/brands", { tenant_id: tenant.id, name: reg.negocio });
      if (!b.ok) return json(500, { error: "brand: " + b.text });
      const brand = (b.data as Array<Record<string, unknown>>)[0];

      const branchCount = Number(reg.branches) || 1;
      const branchRows = [];
      for (let i = 0; i < branchCount; i++) {
        branchRows.push({
          brand_id: brand.id, tenant_id: tenant.id,
          name: branchCount === 1 ? reg.negocio : `${reg.negocio} — Sucursal ${i + 1}`,
          is_active: true, is_open: false,
        });
      }
      const br = await sbAdmin("POST", "/rest/v1/branches", branchRows);
      if (!br.ok) return json(500, { error: "branches: " + br.text });
      const firstBranch = (br.data as Array<Record<string, unknown>>)[0];

      // Crear el usuario auth con la contraseña temporal del registro
      const auRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: reg.email, password: reg.password_tmp, email_confirm: true,
          user_metadata: {
            nombre: reg.nombre, negocio: reg.negocio,
            tenant_id: tenant.id, branch_id: firstBranch.id, role: "gerente",
          },
        }),
      });
      const auData = await auRes.json() as Record<string, unknown>;
      if (!auRes.ok) return json(500, { error: "auth user: " + JSON.stringify(auData) });
      const userId = String((auData.id as string) || ((auData.user as Record<string, unknown>)?.id as string) || "");

      await sbAdmin("POST", "/rest/v1/pos_users", {
        id: userId, branch_id: firstBranch.id, tenant_id: tenant.id,
        name: reg.nombre, role: "gerente", is_authorized_admin: true,
      });

      await sbAdmin("PATCH", `/rest/v1/pos_registrations?id=eq.${regId}`, {
        status: "aprobado", reviewed_at: new Date().toISOString(),
        tenant_id: tenant.id, user_id: userId, password_tmp: null,
      });

      return json(200, { ok: true, tenant_id: tenant.id, user_id: userId, branches: branchCount });
    }

    return json(400, { error: "action desconocida" });
  } catch (err) {
    console.error("provision error:", err);
    return json(500, { error: String(err) });
  }
});
