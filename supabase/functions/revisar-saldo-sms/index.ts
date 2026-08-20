// revisar-saldo-sms.ts — vigila el saldo de Twilio y avisa en la campanita
//
// POR QUE EXISTE (19-ago-2026, pedido de Sergio):
// Los codigos de acceso salen por SMS mientras Meta no habilite la plantilla
// de autenticacion. Si el saldo de Twilio llega a cero, esos codigos dejan de
// salir **sin avisar** y ningun cliente nuevo se puede registrar. Es el mismo
// agujero que acabamos de tapar, entrando por otra puerta.
//
// Corre por cron una vez al dia. No manda nada al cliente: solo pone (o quita)
// un aviso en `pos_avisos_sistema`, que es lo que lee la campanita del panel.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID   = Deno.env.get("TWILIO_SID")   || "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_TOKEN") || "";

/* CUANDO AVISAR. El numero cuesta US$1,15 al mes y cada codigo unos US$0,05.
   Con 5 dolares hay para el arriendo de un mes y ~75 codigos: alcanza de
   sobra para recargar con calma. Con 2, ya es urgente.
   Son los valores de arranque; se cambian aqui. */
const AVISAR_BAJO   = 5;
const AVISAR_URGENTE = 2;
const PRECIO_SMS    = 0.05;   // aproximado, para traducirlo a "codigos"

const H = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}

/* Se cuentan las filas afectadas: un UPDATE de cero filas no falla, y esa
   mentira ya costo un rato el 19-ago con el inventario. */
async function sbEnviar(metodo: string, path: string, cuerpo?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: metodo,
    headers: { ...H, "Prefer": "return=representation,resolution=merge-duplicates" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  if (!r.ok) { console.error(`[saldo] ${metodo} ${path}:`, t.slice(0, 300)); return null; }
  try { return JSON.parse(t); } catch { return []; }
}

Deno.serve(async () => {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.log("[saldo] sin credenciales de Twilio, no hay nada que vigilar");
    return new Response("sin twilio", { status: 200 });
  }

  // 1. El saldo, de la fuente
  let saldo = 0, moneda = "USD";
  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Balance.json`,
      { headers: { "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`) } },
    );
    if (!r.ok) { console.error("[saldo] Twilio:", (await r.text()).slice(0, 200)); return new Response("twilio mal", { status: 200 }); }
    const d = await r.json();
    saldo = Number(d.balance) || 0;
    moneda = String(d.currency || "USD");
  } catch (e) {
    console.error("[saldo] Twilio:", String(e).slice(0, 200));
    return new Response("error", { status: 200 });
  }
  console.log(`[saldo] Twilio: ${saldo} ${moneda}`);

  /* 2. A quien avisarle. La cuenta de Twilio es UNA para todo Cobra, asi que
        el aviso va a los restaurantes que de verdad usan el SMS: los que
        tienen la pagina de clientes encendida. A quien no la usa, este aviso
        no le dice nada. */
  const tenants = await sbGet(`/tenants?web_activa=eq.true&status=eq.active&select=id`) as Array<Record<string, unknown>> | null;
  if (!tenants || !tenants.length) return new Response("sin tenants", { status: 200 });

  const bajo = saldo <= AVISAR_BAJO;
  const codigos = Math.floor(Math.max(0, saldo) / PRECIO_SMS);

  for (const t of tenants) {
    const tid = String(t.id);
    if (!bajo) {
      // Se repuso: el aviso se va solo, sin que nadie lo tenga que cerrar.
      await fetch(`${SUPABASE_URL}/rest/v1/pos_avisos_sistema?tenant_id=eq.${tid}&clave=eq.saldo_sms`,
        { method: "DELETE", headers: H });
      continue;
    }
    const urgente = saldo <= AVISAR_URGENTE;
    await sbEnviar("POST", `/pos_avisos_sistema?on_conflict=tenant_id,clave`, [{
      tenant_id: tid,
      clave: "saldo_sms",
      titulo: urgente
        ? `Se está acabando el saldo para los códigos por SMS`
        : `Saldo bajo para los códigos por SMS`,
      /* Se le dice en CODIGOS, no en dolares: "quedan 40 codigos" se entiende
         de una; "quedan 2 dolares" hay que traducirlo mentalmente. */
      sub: `Quedan unos ${codigos} códigos (US$${saldo.toFixed(2)}). `
         + `Si llega a cero, tus clientes nuevos no van a poder registrarse.`,
      urgente,
      ir: "https://console.twilio.com/us1/billing/manage-billing/billing-overview",
      datos: { saldo, moneda, codigos },
      updated_at: new Date().toISOString(),
    }]);
  }

  return new Response(JSON.stringify({ ok: true, saldo, moneda, codigos, bajo }), {
    headers: { "Content-Type": "application/json" },
  });
});
