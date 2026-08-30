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

        /*  ══ SE CREA SIN CONFIRMAR, PARA PODER MANDAR LA VERIFICACION ═════

            Antes se creaba con `email_confirm: true` — ya confirmada — y por
            eso el correo de verificacion NO EXISTIA: no habia nada que
            confirmar. Alguien que escribiera mal su correo se quedaba sin
            bienvenida, sin recuperar contrasena y sin forma de avisarnos.

            `generate_link` hace las dos cosas de una: crea la cuenta y
            devuelve el enlace de confirmacion. Se usa en vez de
            `admin/users` porque el alta de administrador **no manda ningun
            correo**; el enlace lo mandamos nosotros, con nuestro diseno y
            desde nuestro dominio, que es justo lo que Sergio pidio.

            ⚠️ Y NADIE QUEDA ENCERRADO: al aprobar el pago, si todavia no
            confirmo, se le confirma la cuenta (ver `approve`). Pagar es mejor
            prueba de que el correo es suyo que un clic. El enlace sirve para
            enterarnos ANTES de que el correo estaba mal.                    */
        const auRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
          method: "POST",
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "signup", email, password: clave,
            data: { nombre, negocio, estado: "pendiente" },
          }),
        });
        const auData = await auRes.json() as Record<string, unknown>;
        if (!auRes.ok) return json(500, { error: "no se pudo crear la cuenta: " + JSON.stringify(auData).slice(0, 200) });

        /*  El correo de verificacion. No se espera y no puede tumbar el
            registro: la solicitud ya esta guardada y el pago sigue su camino.
            Si no sale, lo peor que pasa es que no verificamos el correo.   */
        const enlace = String(
          (auData.action_link as string) ||
          ((auData.properties as Record<string, unknown>)?.action_link as string) || "");
        if (enlace) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/enviar-correo`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ tipo: "verificacion", para: email, nombre, enlace }),
            });
          } catch (e) { console.error("[registrar] verificacion no salio:", String(e).slice(0, 160)); }
        }

        const reg = await sbAdmin("POST", "/rest/v1/pos_registrations", {
          nombre, negocio, email,
          plan: String(body.plan || "pro"),
          sucursales: Number(body.sucursales || 1),
          monto_total: Number(body.monto_total || 0),
          /*  Con que periodo se registro. Sin esto, una solicitud de $2.390.400
              se ve igual de rara mire quien la mire: nadie sabe si pago un ano
              o si se equivoco de cifra. */
          billing: ["mensual", "trimestral", "anual"].includes(String(body.billing || ""))
                     ? String(body.billing) : "mensual",
          total_ciclo: Number(body.total_ciclo || 0),
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

        /*  Se devuelve el id de la solicitud: la pantalla lo necesita para
            pedir enseguida la verificacion del pago. Antes solo se devolvia
            `ok`, y sin id no habia forma de preguntar "¿ya llego mi plata?"
            sin volver a buscar por correo, que es una consulta abierta desde
            un navegador sin sesion.                                        */
        const filaReg = Array.isArray(reg.data) ? (reg.data as Array<Record<string, unknown>>)[0] : null;
        return json(200, { ok: true, registration_id: filaReg ? filaReg.id : null });

    } catch (e) { return json(500, { error: String(e).slice(0, 200) }); }
  }

  // 1. Resolver el usuario que llama a partir de SU token (jamás confiar en el body)
  const authHeader = req.headers.get("Authorization") || "";

  /*  ══ UNA SEGUNDA PUERTA, SOLO PARA APROBAR ═══════════════════════

      Desde el 29-ago la aprobación puede venir de dos sitios: de Sergio, con
      su sesión, o de `verificar-pago-plataforma`, que acaba de encontrar el
      dinero en el correo del banco. La segunda no tiene sesión de nadie — es
      un servidor hablando con otro.

      La puerta es la llave de servicio, que **nunca baja al navegador**: vive
      solo en los secretos del proyecto. Quien la presenta ya podría escribir
      en la base directamente, así que esto no abre nada nuevo; solo evita
      duplicar en otro archivo las 120 líneas que crean un restaurante.

      Y se limita a `approve` a propósito: ninguna otra acción entra por aquí.
      Cuantas menos puertas, menos que vigilar.                            */
  const esInterno = action === "approve" && authHeader === `Bearer ${SERVICE_KEY}`;

  let user = { id: "", email: "", user_metadata: {} as Record<string, unknown> };
  if (!esInterno) {
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "Authorization": authHeader, "apikey": ANON_KEY },
    });
    if (!uRes.ok) return json(401, { error: "no autenticado" });
    user = await uRes.json() as { id: string; email?: string; user_metadata?: Record<string, unknown> };
  }

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

      /*  Las fechas y el saldo van en este select a proposito: sin ellos no se
          puede decir cuando vence ni descontar lo que se debe a favor — y un
          select sin la columna NO da error, devuelve la fila sin el dato.  */
      const tRes = await sbAdmin("GET", `/rest/v1/tenants?id=eq.${tid}&select=id,name,plan,status,periodo_inicio,periodo_fin,saldo_favor&limit=1`);
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
      const bruto = (per: string) => {
        const d = PERIODOS[per];
        if (!d || base == null) return null;
        return Math.round(base * (1 - tierOff) * sucursales * d.meses * (1 - d.off));
      };

      /*  EL SALDO A FAVOR SE DESCUENTA DE LA FACTURA.

          Sale de bajarse de plan: son los dias que ya habia pagado del plan
          caro y va a usar en el barato. La regla de Sergio es que se le
          descuenten del proximo pago, y este es el proximo pago.

          Nunca deja la factura en negativo: si el saldo es mayor, lo que sobra
          se queda para la siguiente. Por eso se guarda CUANTO se aplico
          (`saldo_aplicado`) y no se da por consumido entero.               */
      const saldo = Math.max(0, Number(ten.saldo_favor || 0));
      const aplicado = (per: string) => {
        const b = bruto(per);
        return b == null ? 0 : Math.min(saldo, b);
      };
      const cobro = (per: string) => {
        const b = bruto(per);
        return b == null ? null : Math.max(0, b - aplicado(per));
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
          //  Para que la pantalla pueda decir "te vence en X dias" sin
          //  calcularlo por su cuenta ni pedir la tabla de restaurantes.
          periodo_inicio: ten.periodo_inicio || null,
          periodo_fin: ten.periodo_fin || null,
          saldo_favor: saldo,
          precios: { mensual: cobro("mensual"), trimestral: cobro("trimestral"), anual: cobro("anual") },
          precios_sin_saldo: { mensual: bruto("mensual"), trimestral: bruto("trimestral"), anual: bruto("anual") },
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
        //  Cuanto saldo cubrio esta factura. El disparador de la base lo resta
        //  al aprobar; sin este dato, el saldo se perderia entero aunque la
        //  factura fuera menor.
        saldo_aplicado: aplicado(periodo),
        comprobante_url: comp, status: "pending", creado_por: user.id,
      });
      if (!ins.ok) return json(500, { error: "no se pudo registrar el pago: " + ins.text });
      return json(200, { ok: true, monto: cobro(periodo), periodo, saldo_aplicado: aplicado(periodo) });
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
      /*  El camino interno ya se identificó con la llave de servicio; pedirle
          además un perfil de administrador sería pedirle papeles a la casa. */
      if (!esInterno) {
        const adminChk = await sbAdmin("GET", `/rest/v1/user_profiles?id=eq.${user.id}&select=role&limit=1`);
        const isAdmin = Array.isArray(adminChk.data) && (adminChk.data as Array<Record<string, unknown>>)[0]?.role === "admin";
        if (!isAdmin) return json(403, { error: "Solo un administrador de la plataforma puede aprobar solicitudes" });
      }

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
        /*  Pago' y no toco el enlace de verificacion. No se le puede dejar la
            puerta cerrada por eso: haber pagado prueba mejor que un clic que
            ese correo es suyo. Se le confirma la cuenta y entra.           */
        if (!yaExiste.email_confirmed_at && !yaExiste.confirmed_at) {
          try {
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
              method: "PUT",
              headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ email_confirm: true }),
            });
          } catch (e) { console.error("[aprobar] no se pudo confirmar el correo:", String(e).slice(0, 160)); }
        }
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
      /*  SIN `if (clave)` (29-ago-2026). Ese guardia hacia que el correo NO
          saliera nunca por el registro web: ahi la cuenta ya existe con la
          contrasena que la persona escogio, asi que `clave` es null. El unico
          correo que confirma el acceso se caia en silencio.
          Ahora sale siempre; la caja de la clave temporal solo aparece cuando
          de verdad hay una (alta a mano desde la consola).                  */
      {
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

      /*  ══ EL PAGO QUEDA REGISTRADO ═════════════════════════════

          Sergio, 29-ago-2026: *"a mí en consola plataforma me llega la
          información de la persona que se registró, lo que pagó, a la hora que
          pagó"*.

          Hasta hoy `pos_pagos_suscripcion` existía y estaba VACÍA: nadie la
          escribía. La solicitud guardaba cuánto tenía que pagar, que no es lo
          mismo que cuánto pagó ni cuándo.

          Va aquí, en la aprobación, porque es el momento en que el pago se da
          por bueno — lo confirme el verificador o lo confirme Sergio a mano.

          Y NO tumba la aprobación si falla: el restaurante ya está creado y su
          dueño tiene que poder entrar. Un renglón contable que no se escribió
          se arregla después; una cuenta a medio crear, no.                  */
      try {
        const yaHay = await sbAdmin("GET",
          `/rest/v1/pos_pagos_suscripcion?tenant_id=eq.${tenant.id}&nota=eq.reg:${regId}&limit=1`);
        const repetido = Array.isArray(yaHay.data) && (yaHay.data as unknown[]).length > 0;
        if (!repetido) {
          await sbAdmin("POST", "/rest/v1/pos_pagos_suscripcion", {
            tenant_id: tenant.id,
            plan: reg.plan || "starter",
            sucursales: Number(reg.sucursales) || 1,
            periodo: reg.billing || "mensual",
            monto: Number(reg.monto_total) || 0,
            comprobante_url: reg.comprobante_url || null,
            status: "aprobado",
            /*  `reg:<id>` es la marca que evita el renglón repetido si se
                vuelve a darle a Aprobar. Sin ella, reintentar cobraría dos
                veces en el informe.  */
            nota: `reg:${regId}`,
            revisado_en: new Date().toISOString(),
            revisado_por: esInterno ? null : user.id,
          });
        }
      } catch (e) {
        console.error("[aprobar] el pago no quedo registrado:", String(e).slice(0, 200));
      }

      /*  Y el recibo. También a prueba de fallos: si el correo no sale, el
          restaurante ya existe y ya recibió el de bienvenida con su acceso. */
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/enviar-correo`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "pago_recibido", para: reg.email, nombre: reg.nombre,
            negocio: reg.negocio, plan: reg.plan, sucursales: reg.sucursales,
            periodo: reg.billing, monto: Number(reg.monto_total) || 0,
          }),
        });
      } catch (e) {
        console.error("[aprobar] el recibo no salio:", String(e).slice(0, 200));
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
