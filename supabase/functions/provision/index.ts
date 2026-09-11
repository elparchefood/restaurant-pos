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

/*  EL DIA DE COLOMBIA, NO EL DEL SERVIDOR. El servidor vive en UTC y Colombia
    va cinco horas atras: desde las 7 de la noche, para el servidor ya es
    manana. Un periodo que empieza un dia antes se cobra un dia antes.     */
function hoyEnColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

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

        /*  ══ ¿YA SE IDENTIFICO CON GOOGLE O CON FACEBOOK? ═══════════════

            Registrarse con Google no es entrar con Google: la cuenta de
            Google solo dice QUIEN es. El restaurante, el plan, las sedes y el
            pago siguen haciendo falta igual. Lo que se ahorra es la
            contrasena — y el correo llega verificado por el proveedor.

            Lo importante: esa persona YA TIENE cuenta de acceso, creada por
            el proveedor al volver. Aqui no se crea ninguna. Sin esto la
            funcion contestaba 409 "ese correo ya tiene una cuenta, entra con
            tu contrasena" — y esa persona no tiene contrasena con la que
            entrar. Registrarse con Google era imposible por definicion.

            ⚠️ EL CORREO SALE DEL TOKEN, NO DEL CUERPO. Si se creyera lo que
            manda la pantalla, cualquiera con su sesion podria dejar una
            solicitud a nombre del correo de otro.                        */
        let porRed: { id: string; email: string } | null = null;
        {
          const cab = req.headers.get("Authorization") || "";
          if (cab.startsWith("Bearer ") && cab !== `Bearer ${ANON_KEY}` && cab !== `Bearer ${SERVICE_KEY}`) {
            const uR = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: { "Authorization": cab, "apikey": ANON_KEY },
            });
            if (uR.ok) {
              const u = await uR.json() as Record<string, unknown>;
              const c = String(u.email || "").trim().toLowerCase();
              if (u.id && c) porRed = { id: String(u.id), email: c };
            }
          }
        }

        const email    = porRed ? porRed.email : String(body.email || "").trim().toLowerCase();
        const clave    = String(body.clave || "");
        const nombre   = String(body.nombre || "").trim();
        const negocio  = String(body.negocio || "").trim();

        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "correo invalido" });
        if (!porRed && clave.length < 8) return json(400, { error: "la contrasena debe tener al menos 8 caracteres" });
        if (!nombre || !negocio) return json(400, { error: "faltan datos" });

        /* ¿Ya hay algo con este correo? Puede ser una solicitud a medias, una
           cuenta de acceso, o las dos. */
        const yaPide = await sbAdmin("GET", `/rest/v1/pos_registrations?email=eq.${encodeURIComponent(email)}&status=eq.pending&select=id&limit=1`);
        const solicitudPrevia = (Array.isArray(yaPide.data) && (yaPide.data as Array<Record<string, unknown>>)[0]) || null;

        const uEx = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
        });
        const uList = await uEx.json().catch(() => ({})) as Record<string, unknown>;
        const yaHay = (uList.users as Array<Record<string, unknown>> | undefined)?.find(
          (x) => String(x.email || "").toLowerCase() === email);

        /*  ══ VOLVER A INTENTARLO CON EL MISMO CORREO ════════════════════════

            Antes esto era un 409 seco: "ese correo ya tiene una cuenta". Y
            como la cuenta se crea ANTES de cobrar, cualquier tropiezo —una
            tarjeta sin cupo, un Nequi sin saldo, cerrar la pestaña— dejaba a
            esa persona con su correo quemado y sin forma de volver. Un dueño
            de restaurante tiene UN correo, no cinco.

            Lo vio Sergio: *"eso sería un gran problema para un cliente que
            realmente tenga un solo correo y haya fallado el pago"*.

            Se reanuda, pero solo si es la MISMA persona. La prueba es su
            contraseña, que ya está escribiendo. Y el servidor de acceso
            distingue los dos casos (medido el 7-sep):

                contraseña correcta pero sin confirmar -> email_not_confirmed
                contraseña equivocada                  -> invalid_credentials

            Así que `email_not_confirmed` es la prueba de que acertó. Quien
            escriba el correo de otro se queda fuera igual que antes.       */
        /*  ══ VOLVER A INTENTARLO CON GOOGLE O FACEBOOK ═════════════════════

            Con contraseña, reanudar exige comprobar que es la misma persona.
            Con Google no hace falta comprobar nada: el proveedor YA la
            identifico, y su token es mejor prueba que una contraseña.

            Sin esto, quien se registrara con Google y no lograra pagar
            —justo lo que le paso a Sergio el 8-sep con "Pizzeria El Flaco"—
            creaba una solicitud NUEVA en cada intento, y en la consola
            aparecian dos filas del mismo negocio sin saber cual aprobar. Que
            es exactamente lo que el guardia original queria evitar y este
            camino se saltaba.                                              */
        if (porRed) {
          const suPlan = String(((yaHay?.user_metadata as Record<string, unknown>) || {}).tenant_id || "");
          if (suPlan) {
            return json(409, { error: "Ese correo ya tiene un restaurante activo. Entra con " + "tu cuenta." });
          }
          if (solicitudPrevia) {
            const regPrev = String((solicitudPrevia as Record<string, unknown>).id || "");
            await sbAdmin("PATCH", `/rest/v1/pos_registrations?id=eq.${regPrev}`, {
              nombre, negocio, plan: String(body.plan || "pro"),
              sucursales: Number(body.sucursales || 1),
              monto_total: Number(body.monto_total || 0),
              billing: ["mensual", "trimestral", "anual"].includes(String(body.billing || ""))
                         ? String(body.billing) : "mensual",
              total_ciclo: Number(body.total_ciclo || 0),
            });
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${porRed.id}`, {
              method: "PUT",
              headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ user_metadata: { nombre, negocio, estado: "pendiente" } }),
            });
            console.log("[registrar] se retoma la solicitud de", porRed.email, "(por red)");
            //  No hace falta token para entrar: ya tiene sesion del proveedor.
            return json(200, { ok: true, reanudado: true, registration_id: regPrev });
          }
        }

        let reanudado = false;
        if ((yaHay || solicitudPrevia) && !porRed) {
          const tienePlan = String(((yaHay?.user_metadata as Record<string, unknown>) || {}).tenant_id || "");
          if (tienePlan) {
            return json(409, { error: "Ese correo ya tiene un restaurante activo. Entra con tu contrasena." });
          }

          const pr = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { "apikey": ANON_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: clave }),
          });
          const prd = await pr.json().catch(() => ({})) as Record<string, unknown>;
          const esLaMismaPersona = pr.ok
            || String(prd.error_code || "") === "email_not_confirmed";

          if (!esLaMismaPersona) {
            return json(409, {
              error: "Ese correo ya esta registrado. Si es tuyo, entra con tu contrasena o usa 'olvide mi contrasena'.",
            });
          }

          /*  Es él. Se retoma su solicitud con lo que acaba de escoger —pudo
              cambiar de plan o de sucursales entre un intento y otro— y se le
              devuelve para que pague. No se crea nada nuevo: dos filas del
              mismo negocio dejarían a Sergio sin saber cuál aprobar.       */
          let regId = String(solicitudPrevia?.id || "");
          if (regId) {
            await sbAdmin("PATCH", `/rest/v1/pos_registrations?id=eq.${regId}`, {
              nombre, negocio, plan: String(body.plan || "pro"),
              sucursales: Number(body.sucursales || 1),
              monto_total: Number(body.monto_total || 0),
              billing: ["mensual", "trimestral", "anual"].includes(String(body.billing || ""))
                         ? String(body.billing) : "mensual",
              total_ciclo: Number(body.total_ciclo || 0),
            });
          }
          reanudado = true;
          if (!regId) {
            const reg2 = await sbAdmin("POST", "/rest/v1/pos_registrations", {
              nombre, negocio, email,
              plan: String(body.plan || "pro"),
              sucursales: Number(body.sucursales || 1),
              monto_total: Number(body.monto_total || 0),
              billing: ["mensual", "trimestral", "anual"].includes(String(body.billing || ""))
                         ? String(body.billing) : "mensual",
              total_ciclo: Number(body.total_ciclo || 0),
              status: "pending",
            });
            const f2 = Array.isArray(reg2.data) ? (reg2.data as Array<Record<string, unknown>>)[0] : null;
            regId = String(f2?.id || "");
          }

          /*  Un token nuevo para que entre. Es seguro darlo AQUI y no antes:
              ya se comprobó que sabe la contraseña.                       */
          const lnk = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: "POST",
            headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "signup", email, password: clave }),
          });
          const lnkd = await lnk.json().catch(() => ({})) as Record<string, unknown>;
          const props2 = (lnkd.properties as Record<string, unknown>) || {};
          console.log("[registrar] se reanuda una solicitud a medias:", email);
          return json(200, {
            ok: true, reanudado: true, registration_id: regId,
            token_entrar: String(props2.hashed_token || lnkd.hashed_token || "") || null,
          });
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
        /*  CON GOOGLE/FACEBOOK NO SE CREA CUENTA NI SE MANDA VERIFICACION:
            la cuenta existe y el correo ya lo verifico el proveedor. Solo se
            le guardan el nombre y el negocio, que es lo que la consola
            necesita para saber quien pide.                                */
        if (porRed) {
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${porRed.id}`, {
            method: "PUT",
            headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ user_metadata: { nombre, negocio, estado: "pendiente" } }),
          });
        }

        const auRes = porRed ? null : await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
          method: "POST",
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "signup", email, password: clave,
            data: { nombre, negocio, estado: "pendiente" },
          }),
        });
        const auData = auRes ? await auRes.json() as Record<string, unknown> : {};
        if (auRes && !auRes.ok) return json(500, { error: "no se pudo crear la cuenta: " + JSON.stringify(auData).slice(0, 200) });

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
          /*  Se deshace SOLO lo que se hizo aqui. Si la cuenta venia de
              Google, borrarla seria borrarle a la persona su forma de entrar
              por un fallo nuestro al guardar una fila.                    */
          const uid = porRed ? "" : String((auData.id as string) || ((auData.user as Record<string, unknown>)?.id as string) || "");
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

        /*  ══ EL TOKEN PARA ENTRAR DE UNA ═══════════════════════════════════

            La cuenta nace SIN CONFIRMAR a proposito, y por eso no se puede
            entrar con ella recien creada — Sergio lo vio probando el registro:
            "la cuenta se creo pero no se pudo entrar: Email not confirmed".

            Hace falta entrar YA, porque el paso siguiente es autorizar el
            cobro y el servidor tiene que saber de quien es la solicitud.

            `generate_link` devuelve, junto al enlace del correo, el mismo
            `hashed_token` que ese enlace lleva dentro. Se entrega aqui y la
            pantalla lo canjea: confirma el correo y abre la sesion.

            NO se salta la verificacion — se hace en el momento en vez de
            esperar un clic que esa persona iba a dar medio minuto despues. Y
            encaja con lo ya decidido: `approve` tambien confirma el correo al
            aprobar el pago, porque pagar es mejor prueba que un clic.

            Quien llega por Google o Facebook no lo necesita: ya tiene sesion.
        */
        const props = (auData.properties as Record<string, unknown>) || {};
        const tokenEntrar = String(props.hashed_token || auData.hashed_token || "");

        return json(200, {
          ok: true,
          registration_id: filaReg ? filaReg.id : null,
          token_entrar: tokenEntrar || null,
        });

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
    /*  ══ EL EXTINTOR: "COBRAR POR TRANSFERENCIA ESTA VEZ" (11-sep-2026) ════

        Todo se cobra por Wompi y la transferencia NO se ofrece (Sergio: "si
        les das a escoger, la mayoria va a escoger transferencia, luego se
        olvidan y se salen"). Pero hay emergencias: una tarjeta que no pasa,
        alguien sin Nequi. Para eso, este boton de SU panel enciende la
        transferencia para UN cliente — uno que ya existe (`tenant_id`) o una
        solicitud nueva (`registration_id`) — y le manda los datos por correo.
        Se apaga sola al aprobarse el pago (trigger en la base).

        Solo un administrador de la plataforma. Misma comprobacion que aprobar
        solicitudes: el rol sale de la base, nunca del cuerpo.              */
    if (action === "transferencia") {
      const adm = await sbAdmin("GET", `/rest/v1/user_profiles?id=eq.${user.id}&select=role&limit=1`);
      const esAdm = Array.isArray(adm.data) && (adm.data as Array<Record<string, unknown>>)[0]?.role === "admin";
      if (!esAdm) return json(403, { error: "Solo un administrador de la plataforma puede hacer esto" });

      const tidT = String(body.tenant_id || "");
      const regT = String(body.registration_id || "");
      if (!tidT && !regT) return json(400, { error: "falta a quien" });
      const activa = body.activa !== false;
      const tabla = tidT ? "tenants" : "pos_registrations";
      const up = await sbAdmin("PATCH", `/rest/v1/${tabla}?id=eq.${tidT || regT}`, activa
        ? { transferencia_ok_at: new Date().toISOString(), transferencia_ok_por: user.id }
        : { transferencia_ok_at: null, transferencia_ok_por: null });
      if (!up.ok) return json(500, { error: "no se pudo guardar: " + String(up.text || "").slice(0, 200) });
      if (!activa) return json(200, { ok: true, activa: false });

      //  El correo: a quien, cuanto y a donde. El monto sale de la base, igual
      //  que en el cobro: nunca de la pantalla.
      let para = "", nombre = "", negocio = "", monto = 0, periodo = "mensual";
      if (tidT) {
        const t = await sbAdmin("GET", `/rest/v1/tenants?id=eq.${tidT}&select=name,email,owner_user_id,saldo_favor&limit=1`);
        const tt = Array.isArray(t.data) ? (t.data as Array<Record<string, unknown>>)[0] : null;
        para = String(tt?.email || ""); negocio = String(tt?.name || "");
        if (tt?.owner_user_id) {
          const ou = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${tt.owner_user_id}`, {
            headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
          });
          if (ou.ok) {
            const uo = await ou.json().catch(() => ({})) as Record<string, unknown>;
            const m = (uo.user_metadata || {}) as Record<string, unknown>;
            nombre = String(m.nombre || m.full_name || "").split(" ")[0] || "";
            if (!para) para = String(uo.email || "");
          }
        }
        const pr = await sbAdmin("POST", "/rest/v1/rpc/fn_precio_suscripcion", { p_tenant: tidT, p_periodo: "mensual" });
        monto = Number(pr.data) || 0;
        /*  MENOS EL SALDO A FAVOR, igual que la pantalla (`cuenta_estado`) y
            que el cobro de Wompi. Sin esto el correo decia $249.000 y la
            pantalla $219.000: quien transfiriera lo del correo no cuadraba
            con el lector (lo vi en la prueba del 11-sep).                  */
        const saldoT = Math.max(0, Number(tt?.saldo_favor || 0));
        monto = Math.max(0, monto - Math.min(saldoT, monto));
      } else {
        const r = await sbAdmin("GET", `/rest/v1/pos_registrations?id=eq.${regT}&select=email,nombre,negocio,billing&limit=1`);
        const rg = Array.isArray(r.data) ? (r.data as Array<Record<string, unknown>>)[0] : null;
        para = String(rg?.email || ""); negocio = String(rg?.negocio || "");
        nombre = String(rg?.nombre || "").split(" ")[0] || "";
        periodo = String(rg?.billing || "mensual");
        const pr = await sbAdmin("POST", "/rest/v1/rpc/fn_precio_registro", { p_registro: regT });
        monto = Number(pr.data) || 0;
      }
      const cR = await sbAdmin("GET", "/rest/v1/plataforma_cobro?id=eq.1&limit=1");
      const ct = Array.isArray(cR.data) ? (cR.data as Array<Record<string, unknown>>)[0] || {} : {};
      let enviado = false, razon: unknown = null;
      if (para) {
        try {
          const ce = await fetch(`${SUPABASE_URL}/functions/v1/enviar-correo`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: "pago_transferencia", para, nombre, negocio, monto, periodo, nuevo: !tidT,
              cuenta: { banco: ct.banco || "", tipo: ct.tipo || "", titular: ct.titular || "",
                        numero: ct.numero || "", nota: ct.nota || "" },
            }),
          });
          const cd = await ce.json().catch(() => ({})) as Record<string, unknown>;
          enviado = cd.enviado === true; razon = cd.razon || null;
        } catch (e) { razon = String(e).slice(0, 120); }
      } else razon = "sin correo";
      return json(200, { ok: true, activa: true, para, monto, correo: enviado, razon });
    }

    /*  ══ EL CLIENTE NUEVO QUE VUELVE A PAGAR POR TRANSFERENCIA ═════════════
        Quien se registro y no pudo pagar con Wompi todavia NO tiene
        restaurante: tiene una SOLICITUD pendiente, atada a su correo. Con el
        permiso encendido, al volver a entrar ve la transferencia y sube el
        comprobante. El correo sale del TOKEN, no del cuerpo (misma regla que
        `wompi/inscribir`).                                                 */
    if (action === "registro_estado" || action === "comprobante_registro") {
      const correoR = String(user.email || "").trim().toLowerCase();
      if (!correoR) return json(400, { error: "sin correo" });
      const rr = await sbAdmin("GET", `/rest/v1/pos_registrations?email=eq.${encodeURIComponent(correoR)}` +
        `&status=eq.pending&select=id,negocio,plan,sucursales,billing,comprobante_url,transferencia_ok_at` +
        `&order=created_at.desc&limit=1`);
      const reg = Array.isArray(rr.data) ? (rr.data as Array<Record<string, unknown>>)[0] : null;
      if (!reg) return json(200, { ok: true, pendiente: false });
      const permitido = !!reg.transferencia_ok_at;

      if (action === "registro_estado") {
        const pr = await sbAdmin("POST", "/rest/v1/rpc/fn_precio_registro", { p_registro: reg.id });
        let cuenta = null;
        if (permitido) {
          const cR = await sbAdmin("GET", "/rest/v1/plataforma_cobro?id=eq.1&limit=1");
          const ct = Array.isArray(cR.data) ? (cR.data as Array<Record<string, unknown>>)[0] : null;
          if (ct) cuenta = { banco: ct.banco, tipo: ct.tipo, titular: ct.titular, numero: ct.numero, nota: ct.nota, qr_url: ct.qr_url };
        }
        return json(200, {
          ok: true, pendiente: true, registration_id: reg.id, negocio: reg.negocio,
          plan: reg.plan, sucursales: reg.sucursales, billing: reg.billing || "mensual",
          monto: Number(pr.data) || null, transferencia: permitido, cuenta,
          comprobante: !!reg.comprobante_url,
        });
      }

      if (!permitido) return json(403, { error: "El pago por transferencia no está habilitado para tu solicitud." });
      const compR = String(body.comprobante_url || "").trim();
      if (!compR) return json(400, { error: "falta el comprobante" });
      //  Comprobante nuevo = el lector empieza de cero con el.
      const upR = await sbAdmin("PATCH", `/rest/v1/pos_registrations?id=eq.${reg.id}`, {
        comprobante_url: compR, verif_intentos: 0, verif_at: null, verif_detalle: null, verif_extraido: null,
      });
      if (!upR.ok) return json(500, { error: "no se pudo guardar el comprobante" });
      return json(200, { ok: true, registration_id: reg.id });
    }

    if (action === "cuenta_estado" || action === "renovar") {
      const tid = String((user.user_metadata || {}).tenant_id || "");
      if (!tid) return json(400, { error: "esta cuenta todavia no tiene un negocio" });

      /*  Las fechas y el saldo van en este select a proposito: sin ellos no se
          puede decir cuando vence ni descontar lo que se debe a favor — y un
          select sin la columna NO da error, devuelve la fila sin el dato.  */
      const tRes = await sbAdmin("GET", `/rest/v1/tenants?id=eq.${tid}&select=id,name,plan,status,periodo_inicio,periodo_fin,saldo_favor,transferencia_ok_at&limit=1`);
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

      /*  ¿Sergio le encendio el pago por transferencia? (el extintor,
          11-sep-2026). Sin permiso, la cuenta suspendida paga por Wompi y la
          transferencia no existe para este cliente.                        */
      const transferencia = !!ten.transferencia_ok_at;

      if (action === "cuenta_estado") {
        /*  La cuenta de cobro se manda desde aqui y no se lee en la pantalla:
            `plataforma_cobro` es de la plataforma, no del restaurante, y no
            tiene por que ser legible para un cliente cualquiera. Y SOLO viaja
            si la transferencia esta encendida: sin ella no hay a donde
            transferir.                                                     */
        let cta: Record<string, unknown> | null = null;
        if (transferencia) {
          const cRes = await sbAdmin("GET", "/rest/v1/plataforma_cobro?id=eq.1&limit=1");
          cta = Array.isArray(cRes.data) ? (cRes.data as Array<Record<string, unknown>>)[0] || null : null;
        }
        return json(200, {
          ok: true,
          transferencia,
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

      /*  SIN EL PERMISO DE COBRA NO HAY TRANSFERENCIA (11-sep-2026). Antes
          cualquier cuenta podia subir un comprobante: la pantalla de suspendida
          le ofrecia transferencia a todo el mundo. Ahora se paga por Wompi, y
          la transferencia es el extintor que enciende Sergio.               */
      if (!transferencia) {
        return json(403, { error: "El pago por transferencia no está habilitado para tu cuenta. Paga con Nequi, tarjeta o tu cuenta Bancolombia." });
      }

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
      //  El id del pago, para que la pantalla le pida al lector que lo revise
      //  de una (si no, lo repasa la tarea de cada 5 minutos).
      const nuevo = await sbAdmin("GET", `/rest/v1/pos_pagos_suscripcion?tenant_id=eq.${tid}&status=eq.pending&select=id&order=created_at.desc&limit=1`);
      const pagoId = Array.isArray(nuevo.data) ? String((nuevo.data as Array<Record<string, unknown>>)[0]?.id || "") : "";
      return json(200, { ok: true, pago_id: pagoId || null, monto: cobro(periodo), periodo, saldo_aplicado: aplicado(periodo) });
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

      /*  ══ AQUI EMPIEZA A CORRER EL RELOJ DEL COBRO ══════════════════════

          El restaurante nacia SIN fecha de periodo, y la vista que alimenta el
          reloj solo mira a quien tiene periodo (`where periodo_fin is not
          null`). O sea que el cliente pagaba, se le creaba la cuenta... y no
          se le volvia a cobrar NUNCA. Cobra habria cobrado una sola vez a cada
          restaurante, para siempre, sin que ningun error saltara: todo
          funcionaba, simplemente no volvia a pasar nada.

          Se puso al construir el reloj, mirando a quien le tocaria manana.

          El primer pago ya se cobro al registrarse, asi que cubre desde hoy
          hasta dentro de un mes (o tres, o doce, segun lo que escogio). De ahi
          en adelante el webhook va corriendo `periodo_fin` desde el anterior
          —no desde hoy—, para que la fecha no se desplace un poquito cada mes.

          Se comprueba `periodo_fin` en vez de hacerlo solo al crear: si la
          aprobacion fallo a mitad y se reintenta, el restaurante ya existe
          pero puede seguir sin periodo. Y si ya lo tiene, no se toca.       */
      if (!tenant.periodo_fin) {
        const meses = String(reg.billing) === "anual" ? 12
                    : String(reg.billing) === "trimestral" ? 3 : 1;
        const desde = hoyEnColombia();
        const hasta = new Date(desde + "T00:00:00Z");
        hasta.setUTCMonth(hasta.getUTCMonth() + meses);
        const pFin = hasta.toISOString().slice(0, 10);
        const up = await sbAdmin("PATCH", `/rest/v1/tenants?id=eq.${tenant.id}`,
          { periodo_inicio: desde, periodo_fin: pFin });
        if (up.ok) {
          tenant.periodo_inicio = desde; tenant.periodo_fin = pFin;
          console.log(`[approve] periodo de ${tenant.id}: ${desde} -> ${pFin} (${meses} mes(es))`);
        } else {
          //  Sin periodo no se le vuelve a cobrar, asi que esto no puede pasar callado.
          console.error("[approve] LA CUENTA QUEDO SIN PERIODO:", tenant.id, up.text.slice(0, 150));
        }
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
