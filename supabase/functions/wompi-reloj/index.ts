// ═══════════════════════════════════════════════════════════════════════════
//  wompi-reloj — el calendario del cobro
//
//  Corre solo, una vez al día. Hace cuatro cosas, en este orden:
//
//    1. AVISA ANTES        7, 3 y 1 día antes del cobro
//    2. COBRA              el día que toca
//    3. REINTENTA          1, 3 y 7 días después si falló, avisando cada vez
//    4. PAUSA              pasada esa semana, la cuenta se bloquea
//
//  El calendario lo fijó Sergio, y su regla de fondo va antes que el código:
//  *"siempre con avisos amables, para que el cliente no se quede sin sistema"*.
//  Avisar a tiempo evita el fallo, y evitarlo sale mucho más barato que
//  perseguirlo.
//
//  ⚠️ TODO LO QUE HACE ES IDEMPOTENTE. Puede correr diez veces al día y no
//  manda un aviso repetido ni cobra dos veces: los avisos chocan contra la
//  llave primaria de `pos_wompi_avisos` y los cobros contra la referencia
//  única de `pos_wompi_cobros`. Un reloj nervioso no puede convertir un
//  recordatorio amable en acoso.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RELOJ_SECRETO = Deno.env.get("WOMPI_RELOJ_SECRETO") || "";

const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { "Content-Type": "application/json" } });

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

async function funcion(nombre: string, cuerpo: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const t = await r.text();
  let d: Record<string, unknown> = {};
  try { d = t ? JSON.parse(t) : {}; } catch { /* no era JSON */ }
  return { ok: r.ok, status: r.status, data: d };
}

/*  EL DIA DE COLOMBIA, NO EL DEL SERVIDOR. El servidor vive en UTC y Colombia
    va cinco horas atras: desde las 7 de la noche, para el servidor ya es
    manana. Un cobro que se adelanta un dia el cliente lo nota.            */
function hoyEnColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/*  EL NOMBRE DEL DUENO NO ESTA EN `tenants`. Vive en su cuenta de acceso, en
    `user_metadata.nombre`. Un `select` de una columna que no existe no da
    error: devuelve la fila sin el dato — y el correo saldria diciendo "Hola" a
    secas. Ya me paso en cinco sitios el mismo dia, por eso se busca aqui.  */
async function nombreDelDueno(userId: string) {
  if (!userId) return "";
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return "";
  const u = await r.json().catch(() => ({})) as Record<string, unknown>;
  const meta = (u.user_metadata as Record<string, unknown>) || {};
  return String(meta.nombre || meta.full_name || "").split(" ")[0] || "";
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
               "agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(iso: string) {
  const p = String(iso || "").slice(0, 10).split("-");
  if (p.length < 3) return "";
  return `${Number(p[2])} de ${MESES[Number(p[1]) - 1]}`;
}

/*  Manda el aviso UNA vez. La llave primaria de `pos_wompi_avisos` es
    (restaurante, periodo, clase): si ya se mandó, la inserción choca y aquí
    no pasa nada. Se anota ANTES de mandarlo — un aviso que se manda dos veces
    molesta; uno que no se manda se vuelve a intentar mañana.              */
async function avisar(t: Record<string, unknown>, clase: string, monto: number, medio: string) {
  const tenant = String(t.id);
  const periodoFin = String(t.periodo_fin || "").slice(0, 10);
  const marca = await db("pos_wompi_avisos", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ tenant_id: tenant, periodo_fin: periodoFin, clase, canal: "correo" }),
  });
  if (!marca.ok) {
    if (marca.status === 409) return false;   // ya se mando: no es un error
    console.error("[reloj] no se pudo anotar el aviso:", marca.text.slice(0, 150));
    return false;
  }
  const r = await funcion("enviar-correo", {
    tipo: "aviso_cobro", para: t.email, nombre: t.owner_nombre || "", negocio: t.name || "",
    clase, monto, cuando: fechaLarga(periodoFin), medio,
  });
  if (!r.ok) console.error("[reloj] el correo no salio:", clase, tenant, r.status);
  return true;
}

Deno.serve(async (req) => {
  /*  ══ LA PUERTA ═══════════════════════════════════════════════════════
      Esto dispara cobros de verdad, asi que se entra por una de dos, y
      NUNCA sin ninguna:

        · el reloj de la base manda `secreto` — una llave propia y estrecha
          que vive en la boveda, para que el cron no tenga que llevar
          encima la llave maestra del proyecto;
        · una persona con la llave de servicio, para poder dispararlo a
          mano desde la consola.

      La otra funcion del proyecto que hace esto la deja abierta si el
      secreto no esta configurado (`if (SECRETO && ...)`). Aqui no: si falta
      la llave, no entra nadie. Un reloj de cobros que se abre solo cuando
      se le olvida una variable de entorno es una puerta, no un descuido. */
  const cuerpo = await req.json().catch(() => ({})) as Record<string, unknown>;
  const conLlaveMaestra = (req.headers.get("Authorization") || "") === `Bearer ${SERVICE_KEY}`;
  const conSecreto = !!RELOJ_SECRETO && String(cuerpo.secreto || "") === RELOJ_SECRETO;
  if (!conLlaveMaestra && !conSecreto) return json(403, { error: "no autorizado" });

  const hoy = hoyEnColombia();
  const resumen = { avisados: 0, cobrados: 0, reintentados: 0, pausados: 0, sin_medio: 0, por_transferencia: 0 };

  try {
    /*  Los que tienen restaurante activo y medio de pago inscrito. Se pide la
        vista que ya existía —trae los días que faltan calculados— y se cruza
        con las fuentes activas.                                            */
    const vRes = await db("v_suscripciones_por_vencer?select=*");
    /*  ⚠️ UN 403 NO EXPLOTA SOLO. La primera vez que corrio, la vista no tenia
        permiso para el servidor y PostgREST devolvio un objeto de error; el
        codigo lo trato como si fuera la lista y reviento con "susc is not
        iterable" — un mensaje que no dice nada de lo que pasaba de verdad.

        Es el mismo tropiezo que en este proyecto ya dejo la traza del gerente
        muda durante semanas. Se mira `ok`, y si algo falla se dice cual era el
        problema.                                                          */
    if (!vRes.ok) {
      console.error("[reloj] no se pudo leer las suscripciones:", vRes.status, vRes.text.slice(0, 200));
      return json(502, { error: "no se pudo leer las suscripciones", detalle: vRes.text.slice(0, 200) });
    }
    const susc = Array.isArray(vRes.data) ? vRes.data as Array<Record<string, unknown>> : [];

    for (const s of susc) {
      const tenant = String(s.tenant_id);
      const dias = Number(s.dias_para_vencer);
      const estado = String(s.status || "");

      /*  ══ VA A PAGAR POR TRANSFERENCIA (el extintor, 11-sep-2026) ════════
          Sergio encendio la transferencia para este cliente, esta vez. Nada
          de Wompi: ni los avisos de "se cobra en tu tarjeta", ni el cobro, ni
          los reintentos — cobrarle por los dos lados seria cobrarle dos
          veces. Lo unico que sigue igual es la pausa: una semana despues del
          vencimiento sin pago, como a todos. El permiso se apaga solo en
          cuanto se aprueba el pago.                                        */
      if (s.transferencia_ok_at) {
        resumen.por_transferencia++;
        if (estado === "active" && dias <= -8) {
          await db(`tenants?id=eq.${tenant}`, {
            method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "suspended" }),
          });
          resumen.pausados++;
          console.log("[reloj] en pausa: iba a pagar por transferencia y no llego el pago:", tenant);
        }
        continue;
      }

      const fRes = await db(`pos_wompi_fuentes?tenant_id=eq.${tenant}&activa=is.true&select=marca,ultimos4&limit=1`);
      const fuente = (fRes.data as Array<Record<string, unknown>>)?.[0];

      /*  Sin medio de pago no hay nada que avisar ni que cobrar. Es el caso
          de quien todavía paga por transferencia, y no se le molesta con
          correos de un cobro que no existe.                               */
      if (!fuente) { resumen.sin_medio++; continue; }
      const medio = `${fuente.marca || "tu medio de pago"} ····${fuente.ultimos4 || ""}`;

      //  El tenant completo, para el nombre y el correo
      const tRes = await db(`tenants?id=eq.${tenant}&select=id,name,email,plan,status,periodo_fin,owner_user_id&limit=1`);
      const t = (tRes.data as Array<Record<string, unknown>>)?.[0];
      if (!t) continue;
      t.owner_nombre = await nombreDelDueno(String(t.owner_user_id || ""));

      const pRes = await db("rpc/fn_precio_suscripcion", {
        method: "POST", body: JSON.stringify({ p_tenant: tenant, p_periodo: "mensual" }),
      });
      const monto = Number(pRes.data) || 0;

      // ── 1. LOS AVISOS DE ANTES ─────────────────────────────────────────
      if (estado === "active" && (dias === 7 || dias === 3 || dias === 1)) {
        if (await avisar(t, `antes_${dias}`, monto, medio)) resumen.avisados++;
      }

      // ── 2. EL COBRO DEL DIA ────────────────────────────────────────────
      if (estado === "active" && dias <= 0) {
        /*  ¿Ya hay un cobro de este periodo? Se mira antes de lanzar otro.
            La referencia única lo impediría igual, pero preguntar es más
            barato que salir a internet para que te digan que no.         */
        const cRes = await db(`pos_wompi_cobros?tenant_id=eq.${tenant}` +
          `&periodo_fin=eq.${String(t.periodo_fin).slice(0, 10)}&select=id,intento,estado,created_at&order=intento.desc`);
        const cobros = (cRes.data as Array<Record<string, unknown>>) || [];

        if (!cobros.length) {
          const r = await funcion("wompi", { action: "cobrar", tenant_id: tenant, periodo: "mensual", intento: 1 });
          if (r.ok) resumen.cobrados++;
          else console.error("[reloj] no se pudo cobrar", tenant, r.status);
          continue;
        }

        // ── 3. LOS REINTENTOS ────────────────────────────────────────────
        const ultimo = cobros[0];
        const est = String(ultimo.estado || "");
        if (est === "APPROVED" || est === "PENDIENTE" || est === "PENDING") continue;

        const primero = cobros[cobros.length - 1];
        const diasDesde = Math.floor(
          (Date.now() - new Date(String(primero.created_at)).getTime()) / 86400000);
        const intento = Number(ultimo.intento) || 1;

        /*  1, 3 y 7 días después del primer intento — el calendario de
            Sergio. Cada reintento avisa, porque un cobro que falla en
            silencio es un cliente que se entera cuando ya no puede entrar. */
        const toca = (intento === 1 && diasDesde >= 1) ? 2
                   : (intento === 2 && diasDesde >= 3) ? 3
                   : (intento === 3 && diasDesde >= 7) ? 4 : 0;

        if (toca) {
          const r = await funcion("wompi", { action: "cobrar", tenant_id: tenant, periodo: "mensual", intento: toca });
          if (r.ok) resumen.reintentados++;
          await avisar(t, `fallo_${toca === 2 ? 1 : toca === 3 ? 3 : 7}`, monto, medio);
          continue;
        }

        // ── 4. LA PAUSA ──────────────────────────────────────────────────
        /*  Solo después del último intento y de su semana. La cuenta NO
            desaparece: se pausa, y el modal que ya existe la lleva al pago.
            Sergio: "la cuenta no puede dejar de existir ni desaparecer".  */
        if (intento >= 4 && diasDesde >= 8) {
          await db(`tenants?id=eq.${tenant}`, {
            method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "suspended" }),
          });
          if (await avisar(t, "bloqueo", monto, medio)) resumen.pausados++;
          console.log("[reloj] cuenta en pausa por falta de pago:", tenant);
        }
      }
    }

    console.log("[reloj]", hoy, JSON.stringify(resumen));
    return json(200, { ok: true, hoy, ...resumen });
  } catch (e) {
    console.error("[reloj]", String(e).slice(0, 300));
    return json(500, { error: String(e).slice(0, 200) });
  }
});
