// ═══════════════════════════════════════════════════════════════════════════
//  wompi — el cobro de las suscripciones de Cobra
//
//  Tres puertas, y cada una se abre con una llave distinta:
//
//    inscribir  · con la SESION del restaurante — guarda su medio de pago
//    cobrar     · con la LLAVE DE SERVICIO      — le cobra, sin que este
//    eventos    · sin llave, pero FIRMADO por Wompi — nos cuenta como fue
//
//  El diseño (por qué débito automático, por qué la transferencia no se
//  ofrece, y el calendario de avisos) está en PLAN-COBRO-SUSCRIPCIONES.md.
//
//  ⚠️ LA LLAVE PRIVADA NUNCA BAJA AL NAVEGADOR. Vive en los secretos del
//  proyecto y solo se usa aquí. Lo que el navegador manda es un `token` que
//  Wompi le dio con la llave PUBLICA — un papelito de un solo uso que no
//  sirve para cobrar nada por sí mismo.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

/*  MODO: mientras `WOMPI_MODO` no diga "produccion", se usa el cajón de
    arena. Está al revés a propósito — para pasar a cobrar de verdad hay que
    cambiar algo A MANO, y no se llega ahí por descuido.                    */
const MODO   = (Deno.env.get("WOMPI_MODO") || "pruebas").toLowerCase();
const VIVO   = MODO === "produccion";
const API    = VIVO ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
const K_PUB  = Deno.env.get(VIVO ? "WOMPI_PUB_PROD"       : "WOMPI_PUB_TEST")       || "";
const K_PRV  = Deno.env.get(VIVO ? "WOMPI_PRV_PROD"       : "WOMPI_PRV_TEST")       || "";
const K_EVT  = Deno.env.get(VIVO ? "WOMPI_EVENTS_PROD"    : "WOMPI_EVENTS_TEST")    || "";
const K_INT  = Deno.env.get(VIVO ? "WOMPI_INTEGRITY_PROD" : "WOMPI_INTEGRITY_TEST") || "";

const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { "Content-Type": "application/json" } });

// ── La base ────────────────────────────────────────────────────────────────
async function db(ruta: string, opts: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  return { ok: r.ok, status: r.status, text: t, data: t ? JSON.parse(t) : null };
}

// ── Wompi ──────────────────────────────────────────────────────────────────
async function wompi(metodo: string, ruta: string, llave: string, cuerpo?: unknown) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const t = await r.text();
  let d: Record<string, unknown> = {};
  try { d = t ? JSON.parse(t) : {}; } catch { /* respuesta que no es JSON */ }
  return { ok: r.ok, status: r.status, data: d, texto: t };
}

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/*  Los dos permisos que Wompi exige para guardar un medio de pago: el
    reglamento y la autorización de datos personales. Caducan, así que se
    piden en el momento y no se guardan.                                    */
async function permisos() {
  const m = await wompi("GET", `/merchants/${K_PUB}`, K_PUB);
  const d = (m.data.data || {}) as Record<string, Record<string, string>>;
  return {
    acceptance: d.presigned_acceptance?.acceptance_token || "",
    personal:   d.presigned_personal_data_auth?.acceptance_token || "",
    permalink:  d.presigned_acceptance?.permalink || "",
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "solo POST" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "cuerpo invalido" }); }
  const action = String(body.action || "");
  const cab = req.headers.get("Authorization") || "";

  if (!K_PUB || !K_PRV) {
    console.error("[wompi] faltan las llaves del modo", MODO);
    return json(500, { error: "el cobro no esta configurado" });
  }

  try {
    // ═════════════════════════════════════════════════════════════════════
    //  1. LO QUE EL NAVEGADOR NECESITA PARA PEDIR LA AUTORIZACION
    //     Es todo público: la llave pública y los dos permisos. Se sirve
    //     desde aquí para que la pantalla no tenga que saber en qué modo
    //     estamos ni dónde vive Wompi.
    // ═════════════════════════════════════════════════════════════════════
    if (action === "arranque") {
      const p = await permisos();
      if (!p.acceptance) return json(502, { error: "Wompi no respondio" });
      return json(200, {
        ok: true, llave_publica: K_PUB, api: API, modo: MODO,
        acceptance_token: p.acceptance, personal_auth: p.personal,
        reglamento: p.permalink,
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    //  2. INSCRIBIR EL MEDIO DE PAGO
    //     El restaurante autoriza UNA vez. De aquí en adelante se le puede
    //     cobrar sin que esté delante — que es de lo que se trata.
    // ═════════════════════════════════════════════════════════════════════
    if (action === "inscribir") {
      /*  EL TENANT SALE DE LA SESION, NUNCA DEL CUERPO. Si se creyera lo que
          manda la pantalla, cualquiera con una sesión podría colgarle su
          tarjeta a otro restaurante — o peor, colgarse la de otro.        */
      const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: cab, apikey: ANON_KEY },
      });
      if (!uRes.ok) return json(401, { error: "no autenticado" });
      const u = await uRes.json() as { id: string; email?: string; user_metadata?: Record<string, unknown> };
      const tenant = String((u.user_metadata || {}).tenant_id || "");
      if (!tenant) return json(400, { error: "esta cuenta todavia no tiene un restaurante" });

      const token = String(body.token || "");
      const tipo  = String(body.tipo  || "CARD").toUpperCase();
      if (!token) return json(400, { error: "falta el token del medio de pago" });

      const p = await permisos();
      const correo = String(u.email || "");
      const r = await wompi("POST", "/payment_sources", K_PRV, {
        type: tipo, token, customer_email: correo,
        acceptance_token: p.acceptance, accept_personal_auth: p.personal,
      });
      if (!r.ok) {
        console.error("[wompi] inscribir:", r.status, r.texto.slice(0, 300));
        return json(400, { error: "No se pudo guardar el medio de pago", detalle: r.data });
      }
      const f = (r.data.data || {}) as Record<string, unknown>;
      const pub = (f.public_data || {}) as Record<string, string>;

      /*  La anterior se APAGA, no se borra: el día que un cobro viejo haya
          salido de ella, hay que poder decir de dónde salió.              */
      await db(`pos_wompi_fuentes?tenant_id=eq.${tenant}&activa=is.true`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ activa: false, anulada_at: new Date().toISOString(), anulada_por: "reemplazo" }),
      });

      const ins = await db("pos_wompi_fuentes", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          tenant_id: tenant, fuente_id: f.id, tipo,
          /*  Los últimos 4 y la marca se guardan AHORA porque después no hay
              de dónde sacarlos, y son los que dicen el aviso: "el 18 se
              cobrará tu plan, ten saldo en tu tarjeta ***4242".          */
          ultimos4: pub.last_four || null,
          marca: pub.brand || (tipo === "NEQUI" ? "Nequi" : null),
          correo, estado: String(f.status || "AVAILABLE"), activa: true,
        }),
      });
      if (!ins.ok) {
        console.error("[wompi] no se guardo la fuente:", ins.text.slice(0, 200));
        return json(500, { error: "se autorizo el pago pero no se pudo guardar" });
      }
      return json(200, {
        ok: true, tipo, ultimos4: pub.last_four || null,
        marca: pub.brand || (tipo === "NEQUI" ? "Nequi" : null),
      });
    }

    // ═════════════════════════════════════════════════════════════════════
    //  3. COBRAR
    //     Solo con la llave de servicio: la llama el reloj, o Sergio desde
    //     su consola. NUNCA el navegador de un restaurante.
    // ═════════════════════════════════════════════════════════════════════
    if (action === "cobrar") {
      if (cab !== `Bearer ${SERVICE_KEY}`) return json(403, { error: "no autorizado" });

      const tenant  = String(body.tenant_id || "");
      const intento = Math.max(1, Number(body.intento || 1));
      if (!tenant) return json(400, { error: "falta tenant_id" });

      const tRes = await db(`tenants?id=eq.${tenant}&select=id,name,plan,status,periodo_fin,saldo_favor&limit=1`);
      const ten = (tRes.data as Array<Record<string, unknown>>)?.[0];
      if (!ten) return json(404, { error: "restaurante no encontrado" });

      const periodo    = String(body.periodo || "mensual");
      const periodoFin = String(ten.periodo_fin || "").slice(0, 10);
      if (!periodoFin) return json(400, { error: "ese restaurante no tiene periodo" });

      /*  EL MONTO SALE DE LA BASE, NO DEL CUERPO. `fn_precio_suscripcion` es
          el único sitio donde vive el precio — la misma cuenta que cotiza
          `provision` (comprobado, 90 de 90). Si el monto viniera de fuera,
          cualquiera podría pagarse el año por mil pesos.                  */
      const pRes = await db(`rpc/fn_precio_suscripcion`, {
        method: "POST",
        body: JSON.stringify({ p_tenant: tenant, p_periodo: periodo }),
      });
      const bruto = Number(pRes.data);
      if (!bruto || bruto <= 0) return json(400, { error: "no se pudo calcular el precio" });

      //  El saldo a favor descuenta, pero nunca deja la factura en cero.
      const saldo    = Math.max(0, Number(ten.saldo_favor || 0));
      const aplicado = Math.min(saldo, bruto);
      const monto    = bruto - aplicado;
      if (monto <= 0) return json(200, { ok: true, sin_cobro: true, motivo: "el saldo a favor lo cubre" });

      const fRes = await db(`pos_wompi_fuentes?tenant_id=eq.${tenant}&activa=is.true&select=fuente_id,tipo,ultimos4,correo&limit=1`);
      const fuente = (fRes.data as Array<Record<string, unknown>>)?.[0];
      if (!fuente) return json(409, { error: "ese restaurante no tiene medio de pago inscrito", sin_fuente: true });

      /*  ══ LA BARRERA CONTRA EL COBRO DOBLE ═══════════════════════════════
          La referencia se arma sola y siempre igual, y la fila se guarda
          ANTES de salir a internet. Si el reloj se dispara dos veces, la
          segunda choca contra el índice único y no llega a cobrar.

          Guardar primero y cobrar después es a propósito: al revés, un
          cobro que sale y una fila que no se guarda deja plata cobrada sin
          rastro — y eso no se arregla mirando la base.                    */
      const referencia = `cobra-${tenant.slice(0, 8)}-${periodoFin}-${intento}`;
      const cRes = await db("pos_wompi_cobros", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          tenant_id: tenant, referencia, periodo_fin: periodoFin, intento,
          monto, plan: ten.plan, periodo, fuente_id: fuente.fuente_id, estado: "PENDIENTE",
        }),
      });
      if (!cRes.ok) {
        if (cRes.status === 409) {
          console.log("[wompi] ya existia ese cobro, no se repite:", referencia);
          return json(200, { ok: true, repetido: true, referencia });
        }
        console.error("[wompi] no se pudo anotar el cobro:", cRes.text.slice(0, 200));
        return json(500, { error: "no se pudo anotar el cobro" });
      }
      const fila = (cRes.data as Array<Record<string, unknown>>)[0];

      const centavos = monto * 100;
      const firma = await sha256(`${referencia}${centavos}COP${K_INT}`);
      const tx = await wompi("POST", "/transactions", K_PRV, {
        amount_in_cents: centavos, currency: "COP",
        customer_email: String(fuente.correo || ""),
        payment_source_id: fuente.fuente_id,
        reference: referencia, recurrent: true, signature: firma,
        //  Las tarjetas exigen el número de cuotas. Una: esto es una
        //  suscripción, no una compra a plazos.
        payment_method: { installments: 1 },
      });

      if (!tx.ok) {
        const motivo = JSON.stringify(tx.data).slice(0, 300);
        console.error("[wompi] el cobro no salio:", tx.status, motivo);
        await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ estado: "ERROR", motivo, resuelto_at: new Date().toISOString() }),
        });
        return json(502, { error: "el cobro no se pudo enviar", detalle: tx.data });
      }

      const d = (tx.data.data || {}) as Record<string, unknown>;
      await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ transaccion_id: String(d.id || ""), estado: String(d.status || "PENDIENTE") }),
      });
      /*  Aquí NO se da por pagado aunque diga APPROVED. Quien cierra el
          periodo es el aviso firmado de Wompi (`eventos`), que es el único
          que no se puede fabricar desde fuera.                            */
      return json(200, { ok: true, referencia, transaccion_id: d.id, estado: d.status, monto });
    }

    // ═════════════════════════════════════════════════════════════════════
    //  4. EL AVISO DE WOMPI
    //     Llega sin sesión —lo manda su servidor— así que lo único que lo
    //     hace creíble es la FIRMA. Sin comprobarla, cualquiera podría
    //     mandarnos "pagado" y darse un mes gratis.
    // ═════════════════════════════════════════════════════════════════════
    if (action === "" && body.event) {
      const evento = String(body.event || "");
      const firma  = (body.signature || {}) as { properties?: string[]; checksum?: string };
      const datos  = (body.data || {}) as Record<string, Record<string, unknown>>;

      const valor = (camino: string): string => {
        let v: unknown = datos;
        for (const parte of camino.split(".")) v = (v as Record<string, unknown>)?.[parte];
        return v === undefined || v === null ? "" : String(v);
      };
      const cadena = (firma.properties || []).map(valor).join("") + String(body.timestamp || "") + K_EVT;
      const calculada = await sha256(cadena);
      if (!firma.checksum || calculada !== String(firma.checksum).toLowerCase()) {
        console.warn("[wompi] aviso con firma que no cuadra — se ignora");
        return json(401, { error: "firma invalida" });
      }

      const t = (datos.transaction || {}) as Record<string, unknown>;
      const referencia = String(t.reference || "");
      const estado = String(t.status || "");
      console.log(`[wompi] aviso ${evento} · ${referencia} · ${estado}`);
      if (!referencia) return json(200, { ok: true, ignorado: true });

      const upd = await db(`pos_wompi_cobros?referencia=eq.${encodeURIComponent(referencia)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          estado, transaccion_id: String(t.id || ""),
          motivo: String(t.status_message || "") || null,
          resuelto_at: new Date().toISOString(),
        }),
      });
      const cobro = (upd.data as Array<Record<string, unknown>>)?.[0];
      if (!cobro) {
        //  Un aviso de un cobro que no es nuestro: se anota y ya.
        console.warn("[wompi] aviso de una referencia desconocida:", referencia);
        return json(200, { ok: true, desconocido: true });
      }

      /*  APROBADO: se corre el periodo. Es el ÚNICO sitio donde eso pasa —
          ni el navegador ni la respuesta del cobro pueden hacerlo, porque
          las dos se pueden falsificar y esta no.                          */
      if (estado === "APPROVED") {
        const meses = cobro.periodo === "anual" ? 12 : cobro.periodo === "trimestral" ? 3 : 1;
        const t2 = await db(`tenants?id=eq.${cobro.tenant_id}&select=periodo_fin,saldo_favor&limit=1`);
        const ten = (t2.data as Array<Record<string, unknown>>)?.[0];
        if (ten) {
          const fin = new Date(String(ten.periodo_fin || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
          fin.setUTCMonth(fin.getUTCMonth() + meses);
          await db(`tenants?id=eq.${cobro.tenant_id}`, {
            method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "active",
              periodo_inicio: String(ten.periodo_fin || "").slice(0, 10),
              periodo_fin: fin.toISOString().slice(0, 10),
              pagado_periodo: cobro.monto,
            }),
          });
          console.log(`[wompi] periodo corrido hasta ${fin.toISOString().slice(0, 10)} para ${cobro.tenant_id}`);
        }
      }
      return json(200, { ok: true });
    }

    return json(400, { error: "accion desconocida" });
  } catch (e) {
    console.error("[wompi]", String(e).slice(0, 300));
    return json(500, { error: String(e).slice(0, 200) });
  }
});
