/* verificar-pago-plataforma — comprueba el pago de quien COMPRA Cobra POS.
 *
 * Sergio, 29-ago-2026: *"una vez la persona haga la transferencia subirá ahí su
 * comprobante y el sistema de verificación de pagos que ya tenemos se va a
 * encargar de verificar ese pago... y como última instancia, si el sistema no
 * pudo verificarlo, le aparecerá un modal al cliente diciendo que una vez se
 * haya verificado el pago se le otorgará el acceso"*.
 *
 * ── POR QUÉ UNA FUNCIÓN NUEVA Y NO REUSAR LA QUE HAY ─────────────────────
 * El motor de verificación ya existe y funciona bien, pero las tres funciones
 * que lo usan (`verify-transfer`, `verificar-transferencia`,
 * `verificar-pago-manual`) sacan el buzón de `ia_config` **por `branch_id`**:
 * son del correo de UN RESTAURANTE. El pago de una suscripción llega al correo
 * de COBRA, que vive en `plataforma_correo` y no tiene sucursal.
 *
 * No es un detalle de plomería: son dos negocios distintos. El día que Sergio
 * cambie el correo de su restaurante, el de la plataforma no se debe mover.
 *
 * ── LAS DOS COMPROBACIONES ───────────────────────────────────────────────
 * 1. Se LEE el comprobante que subió la persona (imagen → monto, fecha, hora,
 *    y a qué llave le pagó).
 * 2. Se BUSCA en el correo de Cobra el aviso del banco por ese monto.
 *
 * Con la primera sola, cualquiera monta una imagen. Con la segunda sola, un
 * abono de otra persona por la misma cifra daría acceso a quien no pagó. Las
 * dos juntas es lo que hace que valga.
 *
 * ── ES PÚBLICA, ASÍ QUE TIENE TOPE ───────────────────────────────────────
 * La llama la pantalla de registro, donde nadie tiene sesión todavía. Por eso
 * solo actúa sobre solicitudes en estado `pending` que YA tienen comprobante, y
 * lleva la cuenta de los intentos: al tercero deja de leer imágenes. Sin tope,
 * cualquiera podría llamarla en bucle y gastar el saldo del lector.
 *
 * Y lo importante: **esta función no puede regalar acceso**. Solo aprueba si
 * encuentra el dinero de verdad en el correo del banco de Sergio.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const GMAIL_CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;

/*  Seis intentos, uno cada cinco minutos = media hora larga de margen. Antes
    eran 3, que con el aviso del banco tardando uno o dos minutos se agotaban
    enseguida. Se puede subir porque ahora el comprobante se lee UNA vez: los
    reintentos solo vuelven a mirar el correo, que no cuesta.                */
const TOPE_INTENTOS = 6;
const VENTANA_HORAS = 48;   //  alguien puede transferir y subir el comprobante al rato

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: CORS });
}

const H = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path: string): Promise<Array<Record<string, unknown>>> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    if (!r.ok) return [];
    return await r.json() as Array<Record<string, unknown>>;
  } catch { return []; }
}

async function sbPatch(path: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "PATCH", headers: { ...H, "Prefer": "return=minimal" },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

interface Comprobante {
  monto: string; fecha: string; hora: string; banco: string;
  referencia: string; llave: string; destinatario: string;
  parece_valido: boolean;
}
function vacio(): Comprobante {
  return { monto: "", fecha: "", hora: "", banco: "", referencia: "",
           llave: "", destinatario: "", parece_valido: false };
}

/*  El comprobante vive en un balde PRIVADO desde el 24-ago (lleva datos
    bancarios). Para que el lector lo vea hay que firmarle una dirección
    temporal — no se puede hacer público "un momentito".  */
async function urlFirmada(ruta: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/comprobantes/${encodeURIComponent(ruta)}`,
      { method: "POST", headers: H, body: JSON.stringify({ expiresIn: 600 }) });
    if (!r.ok) { console.error("firmar:", await r.text()); return null; }
    const d = await r.json() as Record<string, string>;
    return d.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null;
  } catch (e) { console.error("firmar:", e); return null; }
}

async function leerComprobante(url: string): Promise<Comprobante> {
  const prompt = `Eres un experto en comprobantes de pago bancarios colombianos (Nequi, Bancolombia, Daviplata, etc.).

Analiza esta imagen y extrae en JSON:
{
  "monto": "SOLO dígitos del monto transferido, sin puntos ni comas ni $. Ej: si dice $149.000 entonces '149000'.",
  "fecha": "YYYY-MM-DD si se ve la fecha de la transacción. Vacío si no.",
  "hora": "HH:MM en 24 horas si se ve la hora (ej: '7:31 p.m.' -> '19:31'). Vacío si no.",
  "banco": "nombre del banco o app (Nequi, Bancolombia, Daviplata, etc.)",
  "referencia": "número de referencia o transacción si aparece",
  "llave": "El número (cuenta, celular, NIT o código) de QUIEN RECIBIÓ la plata. NO te guíes por la etiqueta: cada banco la nombra distinto —'Llave', 'Código de negocio', 'Cuenta destino', 'Para'—. Guíate por el SIGNIFICADO: es el número del que RECIBE. NUNCA el de quien envía ('Desde', 'Cuenta origen', '¿De dónde salió?').",
  "destinatario": "nombre de la persona o negocio que RECIBE el pago. Vacío si no se ve.",
  "parece_valido": true si la imagen muestra una pantalla de pago real con monto visible. false solo si está borrosa, es una foto cualquiera, o fue editada.
}

NOTA: Nequi y otros a veces muestran 'pendiente' o 'en proceso' aunque el dinero ya salió. NO marques parece_valido=false solo por eso.
Responde SOLO el JSON.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url, detail: "high" } },
        ] }],
      }),
    });
    if (!res.ok) { console.error("lector:", await res.text()); return vacio(); }
    const d = await res.json() as Record<string, unknown>;
    const raw = (((d.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown>)?.content as string || "").trim();
    return JSON.parse(raw.replace(/```json|```/g, "").trim()) as Comprobante;
  } catch (e) { console.error("lector:", e); return vacio(); }
}

async function tokenGmail(refresh: string): Promise<string | null> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: refresh, grant_type: "refresh_token",
      }),
    });
    if (!r.ok) { console.error("token:", await r.text()); return null; }
    const d = await r.json() as Record<string, string>;
    return d.access_token || null;
  } catch (e) { console.error("token:", e); return null; }
}

function cuerpoCorreo(msg: Record<string, unknown>): string {
  const partes: string[] = [];
  const rec = (p: Record<string, unknown>) => {
    const body = p.body as Record<string, unknown> | undefined;
    if (body?.data) {
      try {
        partes.push(atob(String(body.data).replace(/-/g, "+").replace(/_/g, "/")));
      } catch { /* una parte ilegible no invalida el resto */ }
    }
    for (const s of (p.parts as Array<Record<string, unknown>> | undefined) || []) rec(s);
  };
  rec((msg.payload as Record<string, unknown>) || {});
  return partes.join(" ");
}

const BANCOS = /bancolombia|nequi|daviplat|davivienda|bbva|occidente|bogota|popular|itau|nu[.]com[.]co|nubank|scotiabank|av villas/i;

/*  Busca en el correo de Cobra un aviso del banco por ese monto.
    Devuelve por qué sí o por qué no: ese texto es lo que Sergio lee luego en
    la consola, así que tiene que decir algo que se entienda.  */
async function buscarEnCorreo(
  token: string, montoDigitos: string, llaveCobra: string,
): Promise<{ hallado: boolean; detalle: string }> {
  if (!montoDigitos) return { hallado: false, detalle: "el comprobante no tenía un monto legible" };

  const conPuntos = montoDigitos.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
  const conComas  = montoDigitos.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
  const formatos  = [...new Set([montoDigitos, conPuntos, conPuntos + ",00", conComas, conComas + ".00"])];

  for (const fmt of formatos) {
    const q = `newer_than:3d "${fmt}"`;
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`,
      { headers: { "Authorization": `Bearer ${token}` } });
    if (!r.ok) { console.error("gmail:", await r.text()); continue; }
    const lista = (await r.json() as Record<string, unknown>).messages as Array<{ id: string }> | undefined;
    if (!lista?.length) continue;

    for (const m of lista) {
      const mr = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { "Authorization": `Bearer ${token}` } });
      if (!mr.ok) continue;
      const msg = await mr.json() as Record<string, unknown>;
      const cab = ((msg.payload as Record<string, unknown>)?.headers as Array<{ name: string; value: string }>) || [];
      const de  = cab.find(h => h.name === "From")?.value || "";
      const asu = cab.find(h => h.name === "Subject")?.value || "";
      const txt = (String(msg.snippet || "") + " " + cuerpoCorreo(msg) + " " + asu).toLowerCase();

      if (!BANCOS.test(de + " " + asu)) continue;

      //  Que sea de estos días: un abono de la semana pasada por la misma
      //  cifra no es este pago.
      const cuando = Number(msg.internalDate || 0);
      if (cuando && (Date.now() - cuando) > VENTANA_HORAS * 3600000) continue;

      //  Y que sea a NUESTRA llave, si el aviso la menciona.
      let llaveOk = true;
      if (llaveCobra && llaveCobra.length >= 4) {
        const suf = llaveCobra.slice(-4);
        llaveOk = txt.includes(llaveCobra.replace(/\s/g, "")) || txt.includes(suf);
      }

      return llaveOk
        ? { hallado: true, detalle: `Abono de $${conPuntos} confirmado en el correo del banco (${de})` }
        : { hallado: true, detalle: `Abono de $${conPuntos} confirmado (${de}) — el aviso no menciona la llave` };
    }
  }
  return { hallado: false, detalle: `No llegó ningún aviso del banco por $${conPuntos} en los últimos ${VENTANA_HORAS / 24} días` };
}

/*  ══ EL PAGO DE UN RESTAURANTE QUE YA EXISTE (el extintor, 11-sep-2026) ════

    Hasta hoy esto solo revisaba REGISTROS. La renovacion por transferencia
    (cuenta suspendida o cliente al dia, con el permiso que enciende Sergio)
    quedaba "en revision" hasta que el entrara a aprobarla a mano. Ahora pasa
    por las mismas dos comprobaciones —el comprobante y el aviso del banco— y
    si cuadran se aprueba sola: el disparador `trg_sellar_periodo` corre el
    vencimiento y `trg_pago_apaga_transferencia` apaga el permiso.

    El monto esperado es el de la fila, que calculo `provision` en el servidor
    al recibir el comprobante: nunca uno que mande la pantalla.            */
async function verificarPago(pagoId: string) {
  const pagos = await sbGet(`pos_pagos_suscripcion?id=eq.${pagoId}&limit=1`);
  const pago = pagos[0];
  if (!pago) return json({ error: "pago no encontrado" }, 404);
  if (pago.status === "approved") return json({ ok: true, verificado: true, ya: true, detalle: "ese pago ya estaba aprobado" });
  if (pago.status !== "pending") return json({ ok: true, verificado: false, detalle: "el pago no está pendiente" });

  const intentos = Number(pago.verif_intentos || 0);
  if (intentos >= TOPE_INTENTOS) {
    return json({ ok: true, verificado: false, tope: true,
      detalle: "Ya lo intentamos varias veces. Un humano lo va a revisar." });
  }
  const ruta = String(pago.comprobante_url || "");
  if (!ruta) return json({ ok: true, verificado: false, detalle: "todavía no hay comprobante" });

  //  El intento se cuenta ANTES de gastar nada (misma razon que en registros).
  await sbPatch(`pos_pagos_suscripcion?id=eq.${pagoId}`, {
    verif_intentos: intentos + 1, verif_at: new Date().toISOString(),
  });
  const fallar = async (detalle: string, extraido: unknown = null) => {
    await sbPatch(`pos_pagos_suscripcion?id=eq.${pagoId}`,
      { verif_detalle: detalle, ...(extraido ? { verif_extraido: extraido } : {}) });
    return json({ ok: true, verificado: false, detalle });
  };

  const correo = (await sbGet("plataforma_correo?id=eq.1&limit=1"))[0];
  const refresh = String(correo?.gmail_refresh_token || "");
  if (!refresh) return await fallar("El correo de verificación de Cobra no está conectado en la consola");

  let c: Record<string, unknown>;
  const guardado = pago.verif_extraido as Record<string, unknown> | null;
  if (guardado && guardado.parece_valido && guardado.monto) {
    c = guardado;
  } else {
    const firmada = await urlFirmada(ruta);
    if (!firmada) return await fallar("No se pudo abrir el comprobante");
    c = await leerComprobante(firmada) as unknown as Record<string, unknown>;
    if (!c.parece_valido || !c.monto) return await fallar("La imagen no parece un comprobante de pago legible", c);
    await sbPatch(`pos_pagos_suscripcion?id=eq.${pagoId}`, { verif_extraido: c });
  }

  const esperado = Math.round(Number(pago.monto || 0));
  const pagado   = Number(String(c.monto).replace(/\D/g, "")) || 0;
  if (esperado > 0 && pagado !== esperado) {
    return await fallar(
      `El comprobante dice $${pagado.toLocaleString("es-CO")} y el pago es de $${esperado.toLocaleString("es-CO")}`, c);
  }

  const token = await tokenGmail(refresh);
  if (!token) return await fallar("No se pudo entrar al correo de verificación (vuelve a conectarlo en la consola)", c);
  const cuenta = (await sbGet("plataforma_cobro?id=eq.1&limit=1"))[0];
  const llave  = String(cuenta?.numero || "").replace(/\s/g, "");
  const hallazgo = await buscarEnCorreo(token, String(pagado), llave);
  if (!hallazgo.hallado) return await fallar(hallazgo.detalle, c);

  //  Llego la plata: se aprueba. `status=eq.pending` en el filtro para que
  //  dos barridos a la vez no lo aprueben dos veces (el vencimiento correria
  //  dos meses por un pago).
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pos_pagos_suscripcion?id=eq.${pagoId}&status=eq.pending`, {
    method: "PATCH", headers: { ...H, "Prefer": "return=representation" },
    body: JSON.stringify({
      status: "approved", revisado_en: new Date().toISOString(),
      verif_detalle: hallazgo.detalle, verif_extraido: c, nota: "Aprobado solo por el lector de comprobantes",
    }),
  });
  const filas = r.ok ? await r.json().catch(() => []) as Array<Record<string, unknown>> : [];
  if (!filas.length) {
    return json({ ok: true, verificado: true, creado: false,
      detalle: "Pago confirmado, pero no se pudo marcar: apruébalo en la consola" });
  }
  await sbPatch(`tenants?id=eq.${pago.tenant_id}`, { status: "active" });

  //  El papel que la gente guarda. Si no sale, el pago igual quedo.
  try {
    const t = (await sbGet(`tenants?id=eq.${pago.tenant_id}&select=name,email,plan&limit=1`))[0];
    if (t?.email) {
      await fetch(`${SUPABASE_URL}/functions/v1/enviar-correo`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pago_recibido", para: t.email, nombre: "", negocio: t.name || "",
          monto: esperado, plan: t.plan || pago.plan || "", sucursales: pago.sucursales || 1,
          periodo: pago.periodo || "mensual" }),
      });
    }
  } catch (e) { console.error("[pago] correo:", String(e).slice(0, 120)); }

  return json({ ok: true, verificado: true, creado: true, detalle: hallazgo.detalle });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío -> falta el id */ }
  const regId = String(body.registration_id || "");
  const pagoId = String(body.pago_id || "");
  if (pagoId) return await verificarPago(pagoId);

  /*  ══ MODO BARRIDO: SIN ID, SE REVISAN LAS QUE ESTAN ESPERANDO ═════════

      Por que hace falta (30-ago-2026): la pantalla de registro llama a esta
      funcion UNA vez y espera 45 segundos. El correo del banco no llega al
      instante — suele tardar uno o dos minutos — asi que si tarda, la persona
      veia "estamos verificando" y NADIE volvia a revisar nunca. Se quedaba
      esperando a que Sergio entrara a la consola y aprobara a mano.

      Las columnas para reintentar (`verif_intentos`, `verif_at`) ya existian
      y no las usaba nadie.

      Ahora una tarea la llama cada pocos minutos sin id, y se revisan todas
      las que esperan. Cada una se procesa como una llamada aparte a proposito:
      asi un comprobante ilegible no puede tumbar el barrido de los demas, y la
      logica de verificacion —que ya estaba probada— no se toca.

      El tope de intentos sigue mandando: pasado ese punto la solicitud se deja
      para que la mire una persona.                                          */
  if (!regId) {
    const pend = await sbGet(
      `pos_registrations?status=eq.pending&comprobante_url=not.is.null` +
      `&verif_intentos=lt.${TOPE_INTENTOS}&select=id&order=created_at.asc&limit=20`
    );
    //  Y los pagos de restaurantes que ya existen (el extintor, 11-sep-2026).
    //  Mismo tope de intentos, mismo motivo.
    const pendP = await sbGet(
      `pos_pagos_suscripcion?status=eq.pending&comprobante_url=not.is.null` +
      `&verif_intentos=lt.${TOPE_INTENTOS}&select=id&order=created_at.asc&limit=20`
    );
    if (!pend.length && !pendP.length) return json({ ok: true, barrido: true, revisadas: 0 });

    let aprobadas = 0;
    for (const p of pendP) {
      try {
        const dd = await (await verificarPago(String(p.id))).json().catch(() => ({}));
        if (dd && dd.verificado && dd.creado) aprobadas++;
      } catch (e) {
        console.error("[barrido] pago", p.id, String((e as Error).message || e).slice(0, 120));
      }
    }
    for (const r of pend) {
      try {
        const rr = await fetch(`${SUPABASE_URL}/functions/v1/verificar-pago-plataforma`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SERVICE_KEY,
                     "Authorization": `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ registration_id: r.id }),
        });
        const dd = await rr.json().catch(() => ({}));
        if (dd && dd.verificado && dd.creado) aprobadas++;
      } catch (e) {
        console.error("[barrido] solicitud", r.id, String((e as Error).message || e).slice(0, 120));
      }
    }
    return json({ ok: true, barrido: true, revisadas: pend.length, aprobadas });
  }

  // 1. La solicitud
  const regs = await sbGet(`pos_registrations?id=eq.${regId}&limit=1`);
  const reg = regs[0];
  if (!reg) return json({ error: "solicitud no encontrada" }, 404);

  if (reg.status === "approved") {
    return json({ ok: true, verificado: true, ya: true, detalle: "esta solicitud ya estaba aprobada" });
  }
  if (reg.status !== "pending") {
    return json({ ok: true, verificado: false, detalle: "la solicitud no está pendiente" });
  }
  const intentos = Number(reg.verif_intentos || 0);
  if (intentos >= TOPE_INTENTOS) {
    return json({ ok: true, verificado: false, tope: true,
      detalle: "Ya lo intentamos varias veces. Un humano lo va a revisar." });
  }
  const ruta = String(reg.comprobante_url || "");
  if (!ruta) return json({ ok: true, verificado: false, detalle: "todavía no hay comprobante" });

  //  Se cuenta el intento ANTES de gastar nada. Si se contara al final, un
  //  fallo a mitad dejaría el contador quieto y el tope no serviría de nada.
  await sbPatch(`pos_registrations?id=eq.${regId}`, {
    verif_intentos: intentos + 1, verif_at: new Date().toISOString(),
  });

  const fallar = async (detalle: string, extraido: unknown = null) => {
    await sbPatch(`pos_registrations?id=eq.${regId}`,
      { verif_detalle: detalle, ...(extraido ? { verif_extraido: extraido } : {}) });
    return json({ ok: true, verificado: false, detalle });
  };

  // 2. ¿Hay buzón de plataforma conectado?
  const correo = (await sbGet("plataforma_correo?id=eq.1&limit=1"))[0];
  const refresh = String(correo?.gmail_refresh_token || "");
  if (!refresh) {
    return await fallar("El correo de verificación de Cobra no está conectado en la consola");
  }

  // 3. Leer el comprobante
  /*  EL COMPROBANTE SE LEE UNA SOLA VEZ (30-ago-2026).

      La imagen no cambia entre un intento y otro, pero antes se volvia a leer
      en cada uno — y leerla cuesta plata y segundos. Lo que de verdad hay que
      repetir es la busqueda en el correo del banco, que es lo que todavia no
      habia llegado.

      Si ya hay una lectura buena guardada, se usa. Esto es lo que hace que
      reintentar salga barato y, por eso, que se pueda reintentar mas veces. */
  let c: Record<string, unknown>;
  const guardado = reg.verif_extraido as Record<string, unknown> | null;
  if (guardado && guardado.parece_valido && guardado.monto) {
    c = guardado;
  } else {
    const firmada = await urlFirmada(ruta);
    if (!firmada) return await fallar("No se pudo abrir el comprobante");
    c = await leerComprobante(firmada) as unknown as Record<string, unknown>;
    if (!c.parece_valido || !c.monto) {
      return await fallar("La imagen no parece un comprobante de pago legible", c);
    }
    //  Se guarda YA, para que el proximo intento no la vuelva a leer.
    await sbPatch(`pos_registrations?id=eq.${regId}`, { verif_extraido: c });
  }

  // 4. ¿Coincide con lo que tenía que pagar?
  /*  El precio sale de la BASE (`fn_precio_registro`), no de `monto_total`,
      que lo mando el navegador al registrarse. El correo del extintor
      (11-sep-2026) le dice al cliente la cifra de la base, y el comprobante
      tiene que cuadrar con ESA. Si la base no contesta, queda la de la
      solicitud, como antes.                                              */
  let esperado = Math.round(Number(reg.monto_total || 0));
  try {
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_precio_registro`, {
      method: "POST", headers: H, body: JSON.stringify({ p_registro: regId }),
    });
    if (pr.ok) { const v = Number(await pr.json()); if (v > 0) esperado = Math.round(v); }
  } catch { /* se queda la de la solicitud */ }
  const pagado   = Number(String(c.monto).replace(/\D/g, "")) || 0;
  if (esperado > 0 && pagado !== esperado) {
    return await fallar(
      `El comprobante dice $${pagado.toLocaleString("es-CO")} y el plan cuesta $${esperado.toLocaleString("es-CO")}`, c);
  }

  // 5. ¿Está el dinero en el correo del banco?
  const token = await tokenGmail(refresh);
  if (!token) return await fallar("No se pudo entrar al correo de verificación (vuelve a conectarlo en la consola)", c);

  const cuenta = (await sbGet("plataforma_cobro?id=eq.1&limit=1"))[0];
  const llave  = String(cuenta?.numero || "").replace(/\s/g, "");

  const hallazgo = await buscarEnCorreo(token, String(pagado), llave);
  if (!hallazgo.hallado) return await fallar(hallazgo.detalle, c);

  // 6. Sí llegó: se aprueba de verdad.
  await sbPatch(`pos_registrations?id=eq.${regId}`,
    { verif_detalle: hallazgo.detalle, verif_extraido: c });

  const ap = await fetch(`${SUPABASE_URL}/functions/v1/provision`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", registration_id: regId, interno: true }),
  });
  const ad = await ap.json().catch(() => ({})) as Record<string, unknown>;
  if (!ap.ok || !ad.ok) {
    /*  El dinero SÍ llegó. Que la creación falle no puede leerse como "no
        pagó": se deja dicho y Sergio lo remata a mano con un botón.  */
    const d = "Pago confirmado, pero la cuenta no se pudo crear sola: " + String(ad.error || "").slice(0, 160);
    await sbPatch(`pos_registrations?id=eq.${regId}`, { verif_detalle: d });
    return json({ ok: true, verificado: true, creado: false, detalle: d });
  }

  return json({ ok: true, verificado: true, creado: true, detalle: hallazgo.detalle });
});
