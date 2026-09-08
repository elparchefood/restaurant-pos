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

/*  Cómo se llama cada medio cuando hay que decírselo a una persona. Wompi
    devuelve `brand` solo en las tarjetas ("VISA"); en los demás no viene
    nada, y "BANCOLOMBIA_TRANSFER" no es algo que se le enseñe a nadie.   */
/*  EL DIA DE COLOMBIA, NO EL DEL SERVIDOR. El servidor vive en UTC y Colombia
    va cinco horas atras: desde las 7 de la noche, para el servidor ya es
    manana. Un cobro que se adelanta un dia el cliente lo nota.            */
function hoyEnColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

const NOMBRE_MEDIO: Record<string, string> = {
  CARD: "Tarjeta", NEQUI: "Nequi", DAVIPLATA: "DaviPlata",
  BANCOLOMBIA_TRANSFER: "Cuenta Bancolombia", BANCOLOMBIA: "Cuenta Bancolombia",
};

/*  ⚠️ SIN ESTO, DESDE UN NAVEGADOR NO ENTRA NADA. Antes de un POST con
    cabeceras, el navegador pregunta primero con un OPTIONS; si la funcion no
    contesta a esa pregunta, el navegador ni siquiera manda la peticion y
    quien esta al otro lado ve un "Failed to fetch" que no dice nada.

    Lo vio Sergio probando el registro: el numero de Nequi escrito, el boton
    tocado, y un error que no era ni de Nequi ni de su numero. Las demas
    funciones que hablan con el navegador ya lo tenian; esta nacio sin ello
    porque la probe entera desde un script, y un script no pregunta antes. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { "Content-Type": "application/json", ...CORS } });

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

/*  ══ EL COBRO ═══════════════════════════════════════════════════════════════
    Vive aqui, fuera de las acciones, porque lo usan DOS: el `cobrar` que
    dispara el reloj, y el `inscribir` que cobra el primer periodo en cuanto
    el restaurante autoriza. Copiarlo habria copiado tambien la barrera
    anti-doble, y entonces habria dos barreras que se pueden desincronizar. */
async function cobrarTenant(tenant: string, periodo: string, intento: number) {
  const tRes = await db(`tenants?id=eq.${tenant}&select=id,name,plan,status,periodo_fin,saldo_favor&limit=1`);
  const ten = (tRes.data as Array<Record<string, unknown>>)?.[0];
  if (!ten) return { estado: 404, cuerpo: { error: "restaurante no encontrado" } };

  const periodoFin = String(ten.periodo_fin || "").slice(0, 10);
  if (!periodoFin) return { estado: 400, cuerpo: { error: "ese restaurante no tiene periodo" } };

  /*  EL MONTO SALE DE LA BASE, NO DEL CUERPO. `fn_precio_suscripcion` es el
      unico sitio donde vive el precio — la misma cuenta que cotiza
      `provision` (comprobado, 90 de 90). Si el monto viniera de fuera,
      cualquiera podria pagarse el ano por mil pesos.                     */
  const pRes = await db(`rpc/fn_precio_suscripcion`, {
    method: "POST", body: JSON.stringify({ p_tenant: tenant, p_periodo: periodo }),
  });
  const bruto = Number(pRes.data);
  if (!bruto || bruto <= 0) return { estado: 400, cuerpo: { error: "no se pudo calcular el precio" } };

  //  El saldo a favor descuenta, pero nunca deja la factura en negativo.
  const saldo    = Math.max(0, Number(ten.saldo_favor || 0));
  const aplicado = Math.min(saldo, bruto);
  const monto    = bruto - aplicado;
  if (monto <= 0) return { estado: 200, cuerpo: { ok: true, sin_cobro: true, motivo: "el saldo a favor lo cubre" } };

  const fRes = await db(`pos_wompi_fuentes?tenant_id=eq.${tenant}&activa=is.true&select=fuente_id,tipo,ultimos4,correo&limit=1`);
  const fuente = (fRes.data as Array<Record<string, unknown>>)?.[0];
  if (!fuente) return { estado: 409, cuerpo: { error: "ese restaurante no tiene medio de pago inscrito", sin_fuente: true } };

  /*  ══ LA BARRERA CONTRA EL COBRO DOBLE ═══════════════════════════════════
      La referencia se arma sola y siempre igual, y la fila se guarda ANTES de
      salir a internet. Si el reloj se dispara dos veces, la segunda choca
      contra el indice unico y no llega a cobrar.

      Guardar primero y cobrar despues es a proposito: al reves, un cobro que
      sale y una fila que no se guarda deja plata cobrada sin rastro — y eso
      no se arregla mirando la base.                                       */
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
      return { estado: 200, cuerpo: { ok: true, repetido: true, referencia } };
    }
    console.error("[wompi] no se pudo anotar el cobro:", cRes.text.slice(0, 200));
    return { estado: 500, cuerpo: { error: "no se pudo anotar el cobro" } };
  }
  const fila = (cRes.data as Array<Record<string, unknown>>)[0];

  const centavos = monto * 100;
  const firma = await sha256(`${referencia}${centavos}COP${K_INT}`);
  const tx = await wompi("POST", "/transactions", K_PRV, {
    amount_in_cents: centavos, currency: "COP",
    customer_email: String(fuente.correo || ""),
    payment_source_id: fuente.fuente_id,
    reference: referencia, recurrent: true, signature: firma,
    //  Las tarjetas exigen el numero de cuotas. Una: esto es una
    //  suscripcion, no una compra a plazos.
    payment_method: { installments: 1 },
  });

  if (!tx.ok) {
    const motivo = JSON.stringify(tx.data).slice(0, 300);

    /*  ══ "ESA REFERENCIA YA SE USO" NO ES UN FALLO: ES UN AVISO ══════════
        Wompi recuerda las referencias para siempre, y la nuestra se arma
        sola. Si contesta esto, el cobro YA EXISTE alla — normalmente porque
        se mando, se creo, y la respuesta se perdio por el camino.

        Marcarlo como ERROR seria lo peor que se puede hacer aqui: el cliente
        pagado y nosotros apuntandolo como fallido, con el reloj listo para
        reintentar. Asi que se le pregunta a Wompi por esa referencia y se
        adopta el estado que tenga de verdad.                             */
    if (/ya ha sido usada|already been used/i.test(motivo)) {
      console.warn("[wompi] referencia ya usada, se consulta:", referencia);
      const q = await wompi("GET", `/transactions?reference=${encodeURIComponent(referencia)}`, K_PRV);
      const lista = (q.data.data || []) as Array<Record<string, unknown>>;
      const vieja = lista[0];
      if (vieja) {
        await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            transaccion_id: String(vieja.id || ""), estado: String(vieja.status || "PENDIENTE"),
            motivo: "recuperado: la referencia ya existia en la pasarela",
          }),
        });
        return { estado: 200, cuerpo: { ok: true, recuperado: true, referencia,
                 transaccion_id: vieja.id, estado_cobro: vieja.status, monto } };
      }
    }

    console.error("[wompi] el cobro no salio:", tx.status, motivo);
    await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "ERROR", motivo, resuelto_at: new Date().toISOString() }),
    });
    return { estado: 502, cuerpo: { error: "el cobro no se pudo enviar", detalle: tx.data } };
  }

  const d = (tx.data.data || {}) as Record<string, unknown>;
  await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ transaccion_id: String(d.id || ""), estado: String(d.status || "PENDIENTE") }),
  });
  /*  Aqui NO se da por pagado aunque diga APPROVED. Quien cierra el periodo
      es el aviso firmado de Wompi (`eventos`), que es el unico que no se
      puede fabricar desde fuera.                                          */
  return { estado: 200, cuerpo: { ok: true, referencia, transaccion_id: d.id, estado_cobro: d.status, monto } };
}

/*  ══ EL COBRO DE UNA SOLICITUD ══════════════════════════════════════════════
    Igual que el de un restaurante, pero el dueno es la solicitud — todavia no
    hay restaurante al que cobrarle.

    ⚠️ EL PRECIO SALE DE `fn_precio_registro`, NO de `pos_registrations.
    monto_total`. Ese campo lo manda el NAVEGADOR: hoy no es grave porque una
    persona mira la solicitud antes de aprobarla, pero el pago en linea aprueba
    solo. En cuanto sea automatico, ese numero deja de ser un dato y pasa a ser
    una puerta — quien lo cambie se lleva el plan que quiera por lo que quiera.
                                                                             */
async function cobrarRegistro(regId: string, intento: number) {
  const rRes = await db(`pos_registrations?id=eq.${regId}&select=id,email,plan,sucursales,billing,status&limit=1`);
  const reg = (rRes.data as Array<Record<string, unknown>>)?.[0];
  if (!reg) return { estado: 404, cuerpo: { error: "solicitud no encontrada" } };

  const pRes = await db(`rpc/fn_precio_registro`, {
    method: "POST", body: JSON.stringify({ p_registro: regId }),
  });
  const monto = Number(pRes.data);
  if (!monto || monto <= 0) return { estado: 400, cuerpo: { error: "no se pudo calcular el precio" } };

  const fRes = await db(`pos_wompi_fuentes?registration_id=eq.${regId}&activa=is.true&select=fuente_id,correo&limit=1`);
  const fuente = (fRes.data as Array<Record<string, unknown>>)?.[0];
  if (!fuente) return { estado: 409, cuerpo: { error: "esa solicitud no tiene medio de pago", sin_fuente: true } };

  const referencia = `cobra-reg-${regId.slice(0, 8)}-${intento}`;
  const cRes = await db("pos_wompi_cobros", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      registration_id: regId, referencia, periodo_fin: hoyEnColombia(),
      intento, monto, plan: reg.plan, periodo: String(reg.billing || "mensual"),
      fuente_id: fuente.fuente_id, estado: "PENDIENTE",
    }),
  });
  if (!cRes.ok) {
    if (cRes.status === 409) return { estado: 200, cuerpo: { ok: true, repetido: true, referencia } };
    return { estado: 500, cuerpo: { error: "no se pudo anotar el cobro" } };
  }
  const fila = (cRes.data as Array<Record<string, unknown>>)[0];

  const centavos = monto * 100;
  const firma = await sha256(`${referencia}${centavos}COP${K_INT}`);
  const tx = await wompi("POST", "/transactions", K_PRV, {
    amount_in_cents: centavos, currency: "COP",
    customer_email: String(fuente.correo || reg.email || ""),
    payment_source_id: fuente.fuente_id, reference: referencia,
    recurrent: true, signature: firma, payment_method: { installments: 1 },
  });
  if (!tx.ok) {
    const motivo = JSON.stringify(tx.data).slice(0, 300);
    console.error("[wompi] el cobro del registro no salio:", tx.status, motivo);
    await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "ERROR", motivo, resuelto_at: new Date().toISOString() }),
    });
    return { estado: 502, cuerpo: { error: "el cobro no se pudo enviar", detalle: tx.data } };
  }
  const d = (tx.data.data || {}) as Record<string, unknown>;
  await db(`pos_wompi_cobros?id=eq.${fila.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ transaccion_id: String(d.id || ""), estado: String(d.status || "PENDIENTE") }),
  });
  return { estado: 200, cuerpo: { ok: true, referencia, transaccion_id: d.id, estado_cobro: d.status, monto } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
      /*  QUIEN SE ESTA REGISTRANDO TODAVIA NO TIENE RESTAURANTE: `tenants`
          se crea al aprobar, y el pago ocurre ANTES — es lo que dispara la
          aprobacion. Asi que el medio de pago se le cuelga a su SOLICITUD y
          se muda al restaurante cuando se cree.                          */
      const tenant = String((u.user_metadata || {}).tenant_id || "");
      let regId = "";
      if (!tenant) {
        /*  Se busca por CORREO, no por `user_id`: `provision/registrar` crea
            la solicitud sin llenar esa columna —existe y nadie la usa— asi
            que buscar por ahi no encontraba nunca nada. El correo viene del
            token, o sea del servidor de acceso, asi que es igual de fiable
            que el id. (Anotado: `registrar` deberia llenar `user_id`.)   */
        const suCorreo = String(u.email || "").trim().toLowerCase();
        const rr = await db(`pos_registrations?email=eq.${encodeURIComponent(suCorreo)}` +
                            `&status=eq.pending&select=id&order=created_at.desc&limit=1`);
        regId = String((rr.data as Array<Record<string, unknown>>)?.[0]?.id || "");
        if (!regId) return json(400, { error: "esta cuenta todavia no tiene un restaurante" });
      }

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

      /*  SE CALCULAN UNA VEZ. La primera versión los sacaba dos veces —una
          para guardar y otra para contestarle a la pantalla— y arreglé solo
          una: la base decía "Nequi ***1111" y la pantalla decía "null".  */
      const ultimos4 = pub.last_four
        || (pub.phone_number ? String(pub.phone_number).slice(-4) : null)
        || (pub.phone ? String(pub.phone).slice(-4) : null);
      const marca = pub.brand || NOMBRE_MEDIO[tipo] || tipo;

      /*  La anterior se APAGA, no se borra: el día que un cobro viejo haya
          salido de ella, hay que poder decir de dónde salió.              */
      const suyo = tenant ? `tenant_id=eq.${tenant}` : `registration_id=eq.${regId}`;
      await db(`pos_wompi_fuentes?${suyo}&activa=is.true`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ activa: false, anulada_at: new Date().toISOString(), anulada_por: "reemplazo" }),
      });

      const ins = await db("pos_wompi_fuentes", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          tenant_id: tenant || null, registration_id: regId || null,
          fuente_id: f.id, tipo,
          /*  Los últimos 4 y la marca se guardan AHORA porque después no hay
              de dónde sacarlos, y son los que dicen el aviso: "el 18 se
              cobrará tu plan, ten saldo en tu tarjeta ***4242".

              ⚠️ CADA MEDIO LOS DEVUELVE EN UN SITIO DISTINTO, y esto lo
              descubrí probando, no leyendo: la tarjeta trae `last_four`,
              pero **Nequi trae el teléfono** y ningún `last_four`. Con la
              primera versión, a quien pagara con Nequi el aviso le habría
              dicho "ten saldo en tu Nequi ***" — con el hueco vacío.    */
          ultimos4, marca,
          correo, estado: String(f.status || "AVAILABLE"), activa: true,
        }),
      });
      if (!ins.ok) {
        console.error("[wompi] no se guardo la fuente:", ins.text.slice(0, 200));
        return json(500, { error: "se autorizo el pago pero no se pudo guardar" });
      }
      /*  ══ Y SE COBRA EL PRIMER PERIODO DE UNA ═══════════════════════════
          Sergio, 7-sep: *"si, se le cobra de una"*. Si solo autorizara y el
          primer cobro saliera el mes siguiente, se llevaria Cobra un mes
          gratis — y su registro de hoy ya exige el pago por adelantado.

          Se cobra AQUI y no desde el navegador: el monto lo pone la base y
          la referencia unica impide que dos toques al boton cobren dos
          veces. Si el cobro falla, la autorizacion NO se deshace: quedo
          guardada y se puede reintentar sin volver a pedirle nada.       */
      let cobro = null;
      if (body.cobrar_ya === true) {
        const r2 = tenant
          ? await cobrarTenant(tenant, String(body.periodo || "mensual"), 1)
          : await cobrarRegistro(regId, 1);
        cobro = r2.cuerpo;
      }
      return json(200, { ok: true, tipo, ultimos4, marca, cobro });
    }

    // ═════════════════════════════════════════════════════════════════════
    //  3. COBRAR
    //     Solo con la llave de servicio: la llama el reloj, o Sergio desde
    //     su consola. NUNCA el navegador de un restaurante.
    // ═════════════════════════════════════════════════════════════════════
    if (action === "cobrar") {
      if (cab !== `Bearer ${SERVICE_KEY}`) return json(403, { error: "no autorizado" });
      const tenant = String(body.tenant_id || "");
      if (!tenant) return json(400, { error: "falta tenant_id" });
      const r = await cobrarTenant(tenant, String(body.periodo || "mensual"),
                                   Math.max(1, Number(body.intento || 1)));
      return json(r.estado, r.cuerpo);
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
      const cobro = (upd.data as Array<Record<string, unknown>>)?.[0] as Record<string, string>;
      if (!cobro) {
        //  Un aviso de un cobro que no es nuestro: se anota y ya.
        console.warn("[wompi] aviso de una referencia desconocida:", referencia);
        return json(200, { ok: true, desconocido: true });
      }

      /*  APROBADO: se corre el periodo. Es el ÚNICO sitio donde eso pasa —
          ni el navegador ni la respuesta del cobro pueden hacerlo, porque
          las dos se pueden falsificar y esta no.                          */
      /*  ══ UNA SOLICITUD PAGADA SE CONVIERTE EN CUENTA, SOLA ══════════════
          Sergio: *"la cuenta se crea automaticamente con el pago en linea,
          siempre lo decidi asi"*. Su aprobacion a mano no desaparece — sigue
          ahi para cuando alguien le pague por fuera— pero deja de ser el
          camino normal.

          Se aprueba por la MISMA puerta que ya usa el lector de comprobantes
          (`provision approve`, con la llave de servicio): un solo sitio crea
          restaurantes, y sigue siendo el de siempre.                      */
      if (estado === "APPROVED" && cobro.registration_id) {
        try {
          const ap = await fetch(`${SUPABASE_URL}/functions/v1/provision`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve", registration_id: cobro.registration_id, interno: true }),
          });
          console.log("[wompi] cuenta creada por pago en linea:", ap.status);
          /*  Y el medio de pago se muda al restaurante recien creado: si se
              quedara colgando de la solicitud, el mes siguiente no habria de
              donde cobrar.                                                */
          const rr = await db(`pos_registrations?id=eq.${cobro.registration_id}&select=tenant_id&limit=1`);
          const nuevoTenant = String((rr.data as Array<Record<string, unknown>>)?.[0]?.tenant_id || "");
          if (nuevoTenant) {
            await db(`pos_wompi_fuentes?registration_id=eq.${cobro.registration_id}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ tenant_id: nuevoTenant }),
            });
            await db(`pos_wompi_cobros?id=eq.${cobro.id}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ tenant_id: nuevoTenant }),
            });
          }
        } catch (e) {
          console.error("[wompi] pago aprobado pero la cuenta no se creo:", String(e).slice(0, 200));
        }
        return json(200, { ok: true, cuenta_creada: true });
      }

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
