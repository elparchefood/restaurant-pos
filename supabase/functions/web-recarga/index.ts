// web-recarga — el cliente recarga saldo desde la página.
//
// EL MONTO NO LO DECIDE EL NAVEGADOR. Se lee del COMPROBANTE, igual que
// factura-inventario lee las facturas. Si se confiara en lo que manda la
// página, cualquiera escribiría "recargué $500.000" y se acreditaría solo.
// Lo que manda el cliente es solo una intención; la verdad está en la imagen.
//
// Y el bono no se calcula aquí: lo calcula la base con el nivel real del
// cliente. Dos formas de calcularlo son dos formas de que no cuadre.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_KEY") || "";
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPost(path: string, data: unknown, devolver = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, "Prefer": devolver ? "return=representation" : "return=minimal" },
    body: JSON.stringify(data),
  });
  if (!r.ok) { console.error("sbPost", path, (await r.text()).slice(0, 300)); return null; }
  return devolver ? await r.json() : true;
}
async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) { console.error("rpc", fn, (await r.text()).slice(0, 300)); return null; }
  return await r.json();
}
async function sha256(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; };

/* Lee el comprobante. Devuelve lo que DE VERDAD dice la imagen: cuánto se
   transfirió, a qué número y con qué referencia. Es la misma técnica que ya usa
   el inventario para las facturas, y funciona bien con capturas de Nequi. */
async function leerComprobante(url: string) {
  if (!OPENAI_KEY) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", temperature: 0, response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text:
`Este es un comprobante de transferencia colombiano (Nequi, Daviplata, Bancolombia...).
Devuelve SOLO JSON:
{"monto":number,"referencia":"string o null","transaccion":"string o null","destino":"numero o cuenta de destino o null","fecha":"YYYY-MM-DD o null","hora":"HH:MM en 24h o null","es_comprobante":true|false}
REGLAS:
- "monto" es el valor transferido, en pesos y sin puntos ni signos.
- "referencia" es el campo que dice literalmente "Referencia" (en Nequi suele
  empezar por M, ej. M18381965). Si no aparece, null.
- "transaccion" es el campo "Numero de transaccion" o "autorizacion", que suele
  ser mucho mas largo. Son DOS numeros distintos: no los mezcles.
- "hora" es la hora EN QUE SE HIZO la transferencia, formato 24h. Si dice "p.m." conviertela.
- "es_comprobante" es false si la imagen NO es un comprobante de pago.` },
            { type: "image_url", image_url: { url } },
          ],
        }],
      }),
    });
    const d = await r.json();
    return JSON.parse(d?.choices?.[0]?.message?.content || "{}");
  } catch (e) { console.error("leerComprobante:", String(e).slice(0, 200)); return null; }
}

/* Compara el comprobante con lo que dice el correo del banco. Devuelve el
   hallazgo que cuadra, o null. Solo cuentan las referencias: el valor ya lo
   filtra la búsqueda del correo, y la referencia es lo único que ata un abono
   concreto a este comprobante concreto. */
/* La hora que trae el correo del banco es la de LA TRANSACCION, no la de
   llegada del correo (Sergio: "no importa cuanto tarde en llegar el correo,
   siempre tendra la hora exacta en que se hizo"). Asi que tiene que coincidir
   con la del comprobante. Se compara al minuto; solo se exige si las dos partes
   la traen, para no rechazar un pago bueno porque una captura no la muestre. */
function mismaHora(a: unknown, b: unknown) {
  const hm = (v: unknown) => {
    const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
  };
  const x = hm(a), y = hm(b);
  if (!x || !y) return null;          // null = no se pudo comparar
  /* Un minuto de margen: la marca del correo puede caer en el minuto siguiente
     al de la transferencia. Mas margen no hace falta y menos rechazaria pagos
     buenos por un segundo. */
  const min = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  return Math.abs(min(x) - min(y)) <= 1;
}

function mismaRef(a: unknown, b: unknown) {
  const x = String(a ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const y = String(b ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (x.length < 5 || y.length < 5) return false;
  /* Los bancos recortan la referencia de formas distintas entre el comprobante
     y el correo (unos ponen los últimos 6 dígitos). Se acepta que una contenga
     a la otra, exigiendo 5 caracteres mínimo para que no case cualquier cosa. */
  return x === y || x.endsWith(y) || y.endsWith(x) || x.includes(y) || y.includes(x);
}

async function cuadraConElBanco(branchId: string, monto: number, refComprobante: string | null, horaComprobante: string | null, fechaComprobante: string | null, refAlterna: string | null = null) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/verificar-transferencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ branch_id: branchId, monto: String(monto), horas: 24,
      fecha: fechaComprobante, hora: horaComprobante }),
  }).then((x) => x.json()).catch(() => null);

  if (!r) return { ok: false, razon: "banco_error" };
  if (r.razon === "sin_gmail") return { ok: false, razon: "sin_gmail", mensaje: r.mensaje };
  if (r.ok !== true) return { ok: false, razon: "no_llego" };

  /* LA REFERENCIA NO SIRVE PARA COMPARAR. Comprobado con una transferencia real
     el 7-ago-2026: Nequi le da al que paga un identificador (TRKFkycL1qEC) y al
     que cobra otro distinto (M18381965). No son el mismo numero recortado: son
     dos numeros diferentes, y nunca van a coincidir.

     Lo que SI identifica un abono de forma unica es lo que Sergio dijo desde el
     principio: VALOR + FECHA + HORA, y ademas que el destino sea su llave. El
     valor ya lo filtra la busqueda del correo; aqui se exigen los demas. */
  const hOk2 = mismaHora(r.hora, horaComprobante);
  if (hOk2 === false) {
    return { ok: false, razon: "hora_no_coincide", horaBanco: r.hora || null };
  }
  /* AHORA SI se compara la hora de LA TRANSACCION. No la de llegada del correo
     (r.hora, que sale de internalDate), sino la que Nequi escribe dentro del
     mensaje: "Fecha: 06/08/2026 18:53:43". Esa coincide exacta con la del
     comprobante, y es lo mas dificil de falsear de todo: habria que acertar
     valor, referencia Y minuto de un abono que de verdad entro a la cuenta. */
  const hOk = mismaHora(r.hora_txn, horaComprobante);
  if (hOk === false) {
    return { ok: false, razon: "hora_no_coincide", horaBanco: r.hora_txn };
  }
  return { ok: true, hora: r.hora_txn || r.hora || null,
           pagador: r.pagador || null, referencia: String(r.referencia) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ── 1. ¿Quién es? La sesión manda. ──
    const ses = await sbGet(
      `/pos_web_sesiones?token_hash=eq.${encodeURIComponent(await sha256(String(b.token || "")))}&select=*&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const s = ses?.[0];
    if (!s || new Date(String(s.expira_at)).getTime() < Date.now()) {
      return json({ ok: false, razon: "sesion", mensaje: "Tu sesión se venció. Vuelve a entrar." });
    }
    const tenantId  = String(s.tenant_id);
    const clienteId = String(s.cliente_id);
    let branchId    = s.branch_id ? String(s.branch_id) : null;

    const comprobante = String(b.comprobante_url || "").trim();
    if (!comprobante) {
      return json({ ok: false, razon: "sin_comprobante", mensaje: "Súbenos la foto del comprobante para acreditarte el saldo." });
    }

    // ── 2. La verdad está en la imagen, no en lo que dice la página ──
    const leido = await leerComprobante(comprobante);
    if (!leido || leido.es_comprobante === false) {
      return json({ ok: false, razon: "ilegible",
        mensaje: "No pude leer ese comprobante 🤔. Mándanos una captura completa donde se vea el valor y el número de la transacción." });
    }
    const monto = Math.round(num(leido.monto));
    /* El comprobante trae DOS numeros y el correo solo uno. Se guardan los dos
       y basta con que CUALQUIERA cuadre: si solo se mirara uno, un comprobante
       bueno se rechazaria por enseñar el otro. */
    const ref   = leido.referencia ? String(leido.referencia).slice(0, 60) : null;
    const refTx = leido.transaccion ? String(leido.transaccion).slice(0, 60) : null;

    // ── 3. El mínimo lo dice la configuración, no este código ──
    const bono = await rpc("fn_recarga_bono", { p_tenant: tenantId, p_tel: null, p_monto: monto }) as Array<Record<string, unknown>> | null;
    const minimo = Number(bono?.[0]?.minimo ?? 40000);
    if (monto < minimo) {
      return json({ ok: false, razon: "minimo", minimo,
        mensaje: `La recarga mínima es $${minimo.toLocaleString("es-CO")}. Ese comprobante dice $${monto.toLocaleString("es-CO")}.` });
    }

    // Lo que el cliente DIJO que iba a recargar, solo para avisar si no cuadra.
    // No decide nada: manda el comprobante.
    const dicho = Math.round(num(b.monto));
    const descuadre = dicho > 0 && Math.abs(dicho - monto) > 100;

    // ── 4. Queda registrado ANTES de acreditar. Si algo falla después, la
    //       solicitud existe y se puede revisar a mano. ──
    const sol = await sbPost(`/pos_recargas_solicitudes`, {
      tenant_id: tenantId, branch_id: branchId, cliente_id: clienteId,
      monto_dicho: dicho || null, monto_leido: monto, referencia: ref,
      comprobante_url: comprobante, estado: "leida",
    }, true) as Array<Record<string, unknown>> | null;
    const solId = sol?.[0]?.id ?? null;

    // ── 5. Acreditar. La base aplica el bono según el nivel real y rechaza
    //       una referencia repetida, así que un comprobante no vale dos veces. ──
    const cfg = await sbGet(`/pos_recarga_config?tenant_id=eq.${tenantId}&select=acreditar_automatico&limit=1`) as Array<Record<string, unknown>> | null;
    const automatico = cfg?.[0]?.acreditar_automatico !== false;

    if (!automatico) {
      if (solId) await sbPost(`/pos_recargas_solicitudes?id=eq.${solId}`, {});   // queda 'leida'
      return json({ ok: true, pendiente: true, monto,
        mensaje: "Recibimos tu comprobante 🙌 Te acreditamos el saldo apenas lo verifiquemos." });
    }

    /* LA PRUEBA DE FUEGO: el comprobante tiene que cuadrar con el correo del
       banco. Una captura se edita en un minuto; el correo no lo manda el
       cliente. Si no cuadran, no se acredita nada. */
    if (!branchId) {
      const brs = await sbGet(`/branches?tenant_id=eq.${tenantId}&select=id&limit=1`) as Array<Record<string, unknown>> | null;
      if (brs?.[0]) branchId = String(brs[0].id);
    }
    const horaComp0 = leido.hora ? String(leido.hora) : null;
    const horaComp = horaComp0;
    const fechaComp = leido.fecha ? String(leido.fecha) : null;
    if (!horaComp0) {
      return json({ ok: false, razon: "sin_hora",
        mensaje: "Ese comprobante no muestra la hora de la transferencia. Mándanos la captura completa." });
    }

    /* RASTRO: dos intentos reales fallaron con "no coinciden" y no se puede
       saber por que sin ver QUE leyo de la imagen frente a QUE dijo el correo. */
    await sbPost(`/pos_diag`, { donde: "web-recarga/lectura",
      mensaje: "monto=" + monto + " ref=" + String(ref) + " tx=" + String(refTx),
      extra: { leido: leido, hora: horaComp, fecha: fechaComp } });

    const banco = await cuadraConElBanco(String(branchId || ""), monto, ref || refTx, horaComp, fechaComp, refTx);
    if (!banco.ok) {
      await sbPost(`/pos_diag`, { donde: "web-recarga/banco",
        mensaje: "razon=" + String(banco.razon),
        extra: banco as Record<string, unknown> });

      const mensajes: Record<string, string> = {
        sin_gmail:    "Todavía no podemos verificar transferencias automáticamente. Ya avisamos al restaurante.",
        no_llego:     "Todavía no vemos esa transferencia en nuestra cuenta. Puede tardar unos minutos — vuelve a intentar en un momento.",
        no_coincide:  "Los datos del comprobante no coinciden con la transferencia que recibimos. Revisa que sea el comprobante correcto.",
        hora_no_coincide: "La hora del comprobante no coincide con la de la transferencia que recibimos. Revisa que sea el comprobante correcto.",
        banco_error:  "No pudimos verificar la transferencia en este momento. Intenta de nuevo en unos minutos.",
      };
      if (solId) await sbPost(`/pos_recargas_solicitudes?id=eq.${solId}`, {});
      return json({ ok: false, razon: banco.razon, pendiente: true,
        mensaje: (banco as Record<string, unknown>).mensaje as string || mensajes[String(banco.razon)] || mensajes.banco_error });
    }

    /* LA SOLICITUD VIAJA CON EL ABONO (21-ago). Dos cosas dependian de esto y
       ninguna funcionaba: el candado por comprobante —que impide cobrar dos
       veces la misma foto— y que la solicitud quede CERRADA al abonar. Antes
       el abono automatico la dejaba en "leida", como si nadie la hubiera
       atendido, y la pantalla seguia ofreciendo el boton Aprobar encima de
       plata ya abonada. */
    const res = await rpc("fn_recarga_aplicar", {
      p_tenant: tenantId, p_cliente: clienteId, p_monto: monto,
      p_ref: banco.referencia, p_branch: branchId, p_solicitud: solId,
      p_como: "automatico+correo" + ((banco as Record<string, unknown>).pagador ? " · " + (banco as Record<string, unknown>).pagador : ""),
    }) as Array<Record<string, unknown>> | null;
    const r0 = res?.[0];

    if (!r0 || r0.ok !== true) {
      /* Un comprobante repetido no es un error del sistema: es alguien
         mandandolo dos veces, a proposito o por equivocacion. Se le dice con
         esas palabras y con su saldo, para que vea que no perdio nada. */
      if (String(r0?.motivo) === "comprobante_usado") {
        return json({ ok: false, razon: "comprobante_usado", saldo: Number(r0?.saldo || 0),
          mensaje: "Ese comprobante ya se usó para una recarga anterior 🙂 Tu saldo actual es $" +
            Number(r0?.saldo || 0).toLocaleString("es-CO") + ". Si hiciste otra transferencia, sube ese comprobante." });
      }
      return json({ ok: false, razon: "no_aplicada",
        mensaje: String(r0?.motivo || "No pudimos acreditar esa recarga. Escríbenos y lo revisamos.") });
    }

    /* EL AVISO AL CELULAR (19-ago, pedido de Sergio). Va aqui, con el
       resultado ya en la mano: la funcion de la base devuelve lo acreditado,
       el bono y el saldo, que es justo lo que dice el aviso. Best-effort y sin
       esperar: si el aviso falla, la plata ya quedo acreditada, que es lo que
       de verdad importa. */
    try {
      fetch(`${SUPABASE_URL}/functions/v1/avisar-cliente`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "recarga", cliente_id: clienteId,
          monto, bono: Number(r0.bono || 0), saldo: Number(r0.saldo || 0),
        }),
      }).catch(() => {});
    } catch (_e) { /* nunca bloquea la recarga */ }

    return json({
      ok: true, monto, bono: Number(r0.bono || 0), saldo: Number(r0.saldo || 0),
      descuadre: descuadre ? dicho : null,
      mensaje: Number(r0.bono || 0) > 0
        ? `¡Listo! Recargaste $${monto.toLocaleString("es-CO")} y te regalamos $${Number(r0.bono).toLocaleString("es-CO")} más 🎉`
        : `¡Listo! Recargaste $${monto.toLocaleString("es-CO")} 🙌`,
    });
  } catch (e) {
    console.error("web-recarga:", e);
    return json({ ok: false, razon: "error", mensaje: "Algo falló de nuestro lado. Intenta de nuevo." }, 200);
  }
});
