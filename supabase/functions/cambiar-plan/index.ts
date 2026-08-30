// cambiar-plan — bajar de plan, con la cuenta hecha EN EL SERVIDOR.
//
// POR QUE EXISTE: el primer intento cambiaba el plan desde el navegador con un
// update directo a `tenants`. No funciono, y menos mal: esa tabla solo deja
// LEER. Si dejara escribir, cualquiera se pondria en el plan mas alto gratis
// llamando a la API desde la consola del navegador.
//
// Y por lo mismo el MONTO no se recibe: se calcula aqui. Un saldo a favor que
// llega desde el navegador es un saldo que el navegador escoge.
//
// SOLO BAJADAS. Subir de plan exige pagar la diferencia y el plan nuevo se
// activa cuando el pago se verifica -- decision expresa de Sergio: si se
// activara antes, cualquiera sube y no paga.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function get(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}

//  Dias ENTEROS de hoy al vencimiento. Por fecha, no por reloj: en una factura
//  un dia de mas es plata.
function diasQueSobran(fin: string | null): number | null {
  if (!fin) return null;
  const f = String(fin).slice(0, 10).split("-").map(Number);
  const finMs = Date.UTC(f[0], f[1] - 1, f[2]);
  const h = new Date();
  const hoy = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate());
  const d = Math.round((finMs - hoy) / 86400000);
  return d > 0 ? d : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sin sesión" }, 401);

    // 1. Quien llama
    const ru = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: auth },
    });
    if (!ru.ok) return json({ error: "Sesión no válida" }, 401);
    const user = await ru.json();

    /*  2. Que sea el DUEÑO. Se pregunta con la sesion de quien llama, no con
        la llave de servicio: `es_dueno()` mira el contexto del usuario, y
        llamarla como servicio responderia por otro.                        */
    const rd = await fetch(`${SUPABASE_URL}/rest/v1/rpc/es_dueno`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    const esDueno = rd.ok ? await rd.json() : false;
    if (esDueno !== true) return json({ error: "Solo el dueño puede cambiar el plan" }, 403);

    // 3. Su restaurante
    const fila = await get(
      `pos_users?select=tenant_id&or=(auth_user_id.eq.${user.id},id.eq.${user.id})&limit=1`,
    ) as Array<{ tenant_id: string }> | null;
    const tenantId = fila && fila[0] && fila[0].tenant_id;
    if (!tenantId) return json({ error: "No encontramos tu restaurante" }, 404);

    const body = await req.json().catch(() => ({}));
    const destinoClave = String(body.plan || "");
    if (!destinoClave) return json({ error: "Falta el plan" }, 400);

    const [tt, planes] = await Promise.all([
      get(`tenants?select=plan,periodo_fin,saldo_favor,pagado_periodo&id=eq.${tenantId}`),
      get(`pos_planes?select=plan,nombre,precio,a_la_venta`),
    ]) as [Array<Record<string, unknown>> | null, Array<Record<string, unknown>> | null];

    const t = tt && tt[0];
    if (!t) return json({ error: "No encontramos tu restaurante" }, 404);

    const actual = (planes || []).find((x) => x.plan === t.plan);
    const destino = (planes || []).find((x) => x.plan === destinoClave);
    if (!destino) return json({ error: "Ese plan no existe" }, 400);

    //  El plan interno no se le ofrece a nadie: tampoco por esta puerta.
    if (destino.a_la_venta !== true) return json({ error: "Ese plan no está a la venta" }, 403);
    if (destinoClave === t.plan) return json({ error: "Ya tienes ese plan" }, 400);

    const pAct = Number((actual && actual.precio) || 0);
    const pNue = Number(destino.precio || 0);
    if (pNue >= pAct) {
      return json({ error: "Para subir de plan hay que pagar la diferencia", subir: true }, 400);
    }

    /*  4. EL SALDO A FAVOR ES LA DIFERENCIA, NUNCA EL PRECIO COMPLETO.
        Regla de Sergio, y es la que cierra el hueco: si fuera el precio
        completo, alguien podria subir a Pro pagando solo la diferencia por
        unos dias, bajarse al dia siguiente y recibir mas saldo del que pago --
        repitiendo el ciclo, el sistema le sale gratis.                      */
    const dias = diasQueSobran(t.periodo_fin as string | null);
    let credito = dias == null ? 0 : (pAct - pNue) * Math.min(dias, 30) / 30;
    //  Y nunca mas de lo que de verdad entro por este periodo: sin este tope,
    //  un mes de promocion se volveria saldo real.
    const pagado = t.pagado_periodo == null ? null : Number(t.pagado_periodo);
    if (pagado != null) credito = Math.min(credito, pagado);
    credito = Math.max(0, Math.round(credito));

    //  El vencimiento NO se toca: si se moviera, se podria estirar la fecha a
    //  base de cambios de plan.
    const up = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({
        plan: destinoClave,
        saldo_favor: Number(t.saldo_favor || 0) + credito,
      }),
    });
    if (!up.ok) return json({ error: "No se pudo guardar: " + (await up.text()).slice(0, 200) }, 500);

    //  Queda el renglon de lo que paso, para que se pueda mirar despues.
    await fetch(`${SUPABASE_URL}/rest/v1/pos_pagos_suscripcion`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        tenant_id: tenantId, plan: destinoClave, periodo: "cambio",
        monto: -credito, status: "saldo_a_favor",
        nota: `Bajó de ${(actual && actual.nombre) || t.plan} a ${destino.nombre}` +
              (dias == null ? " (sin fecha de período: sin saldo)" : ` con ${dias} días sin usar`),
      }),
    }).catch(() => {});

    return json({ ok: true, plan: destinoClave, credito, dias });
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
