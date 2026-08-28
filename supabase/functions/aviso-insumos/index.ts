// aviso-insumos — al cerrar la caja, le avisa por WhatsApp al gerente qué hay
// que comprar.
//
// Vive en el servidor y no en el navegador por una razón concreta: para mandar
// el mensaje hace falta el token de Meta de ese restaurante, y ese token NUNCA
// puede llegar al front.
//
// Se puede apagar desde Configuración (ia_config.avisar_insumos = false). El
// aviso es útil para Sergio, pero a otro dueño puede molestarle recibir un
// WhatsApp cada noche.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_API_BASE = "https://graph.facebook.com/v22.0";

/*  ══ POR QUE ESTO VA POR PLANTILLA Y NO POR TEXTO SUELTO ═════════════

    Sergio, 27-ago-2026: «hace varios dias que al cerrar la caja no envia
    nada». Y tenia razon en el diagnostico.

    WhatsApp solo deja mandar un mensaje escrito a mano si esa persona le
    escribio al negocio en las ultimas 24 horas. Un gerente no le escribe al
    WhatsApp de su propio restaurante — no tiene por que—, asi que esa ventana
    esta cerrada CASI SIEMPRE. El aviso funcionaba los primeros dias, cuando el
    numero acababa de escribir probando, y despues dejo de salir sin que nada
    fallara: Meta lo rechazaba y el rechazo se quedaba en el registro.

    Fuera de la ventana solo pasan las PLANTILLAS aprobadas. Por eso ahora se
    intenta primero la plantilla, y el texto suelto queda de respaldo: sirve
    mientras Meta aprueba la plantilla, y para el restaurante que todavia no la
    tenga creada en su cuenta.

    ⚠️ LA PLANTILLA ES DE CADA RESTAURANTE, no de Cobra: vive en la cuenta de
    WhatsApp de cada uno. Un cliente nuevo tiene que tenerla creada con este
    mismo nombre, o se queda con el respaldo (que solo sale dentro de las 24
    horas). Mismo caso que `pedido_confirmado`.

    Los parametros de una plantilla NO PUEDEN llevar salto de linea, tabulador
    ni mas de cuatro espacios seguidos — Meta la rechaza sin explicar cual fue.
    Por eso la lista viaja en UNA linea separada por puntos medios, y los
    saltos de verdad estan en el cuerpo aprobado.                            */
const PLANTILLA = "por_comprar_cierre_caja";
const PLANTILLA_IDIOMA = "es";

/*  Un parametro seguro: sin saltos, sin tabuladores, sin espacios de sobra, y
    cortado antes del limite de Meta. Vacio nunca — tambien lo rechaza. */
function param(v: string, max = 700): string {
  const t = String(v || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!t) return "-";
  return t.length > max ? t.slice(0, max - 1) + "\u2026" : t;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const H = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}

/* Plural de la unidad de uso: "1 unidad" / "21 unidades", "1 porción" /
   "40 porciones" (las palabras en -ón pierden la tilde al pluralizar). */
function plural(n: number, u: string): string {
  u = String(u || "").trim();
  if (!u || Math.abs(n) === 1) return u;
  if (/ón$/i.test(u)) return u.replace(/ón$/i, "ones");
  return /[aeiouáéíóú]$/i.test(u) ? u + "s" : u + "es";
}
/* Cuánto es el stock en unidades de uso. "0.084 Paquete" no le dice nada a
   nadie; "1 unidad" sí. Se redondea a entero cuando pasa de 1 (nadie dice
   "39,65 porciones") y a un decimal cuando es menos, para no mostrar un "0"
   que parecería que ya no queda nada. */
function equivalencia(stock: number, conversion: number, useUnit: string): string {
  const n = stock * conversion;
  if (!n || !useUnit) return "";
  const v = n >= 1 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v} ${plural(v, useUnit)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const branchId = String(body.branch_id || "");
    if (!branchId) return json({ error: "Falta branch_id" }, 400);

    // ── ¿Está encendido y hay a quién avisarle? ──────────────────────
    const cfgRows = await sbGet(
      `/rest/v1/ia_config?branch_id=eq.${branchId}&select=numeros_gerentes,avisar_insumos&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const cfg = cfgRows?.[0];
    // Sin configuración, ENCENDIDO: el que puso números de gerente es porque
    // quiere que le escriban.
    if (cfg?.avisar_insumos === false) return json({ ok: true, enviado: false, razon: "apagado" });

    const numeros = Array.isArray(cfg?.numeros_gerentes)
      ? (cfg!.numeros_gerentes as unknown[]).map(n => String(n).replace(/\D/g, "")).filter(Boolean)
      : [];
    if (!numeros.length) return json({ ok: true, enviado: false, razon: "sin_gerentes" });

    // ── Qué está bajo ────────────────────────────────────────────────
    /*  ⚠️ CUANTO HAY NO ESTA EN `iv_insumos`. Se mudo a `iv_existencias` el
        24-ago-2026: el insumo es de la MARCA (siempre es el mismo pollo), y
        cuanto hay es de la SEDE.

        Esta consulta se quedo pidiendo `stock` y `agotado_manual` en la tabla
        vieja. PostgREST responde error por columna inexistente, `sbGet`
        devuelve null al no ser `ok`, la lista queda vacia y la funcion sale
        por "nada_bajo" — con exito y sin quejarse.

        Ese es el motivo REAL de que Sergio llevara dias sin recibir el aviso
        al cerrar caja. La ventana de 24 horas de WhatsApp tambien lo habria
        frenado, pero nunca se llegaba a intentar: la lista salia vacia antes.

        Se trae junto con el insumo y se escoge la fila de la bolsa que
        corresponde: en modo `global` es la que tiene la sede VACIA — una sola
        bolsa para toda la marca.                                           */
    let sedeEx: string | null = null;
    try {
      const brR = await sbGet(`/rest/v1/branches?id=eq.${branchId}&select=brand_id,brands(inventario_modo)`) as
        Array<Record<string, unknown>> | null;
      const bb = brR?.[0] || {};
      const mk = bb.brands as { inventario_modo?: string } | Array<{ inventario_modo?: string }> | null;
      const modo = (Array.isArray(mk) ? mk[0]?.inventario_modo : mk?.inventario_modo) || "global";
      if (modo === "sucursal") sedeEx = branchId;
    } catch { /* con la duda, la bolsa comun */ }

    const crudos = await sbGet(
      `/rest/v1/iv_insumos?branch_id=eq.${branchId}&activo=eq.true` +
      `&select=nombre,min_stock,buy_unit,use_unit,conversion,control_manual,` +
      `iv_existencias(branch_id,stock,agotado_manual)`
    ) as Array<Record<string, unknown>> | null;

    //  Y si la consulta falla, se DICE. Un aviso que no sale por un error de
    //  la base no puede reportarse como "no habia nada bajo": eso es
    //  exactamente lo que escondio este fallo durante dias.
    if (!crudos) return json({ ok: false, enviado: false, razon: "no_se_pudo_leer_inventario" }, 500);

    const insumos = crudos.map(i => {
      const filas = (i.iv_existencias || []) as Array<Record<string, unknown>>;
      const e = filas.find(f => (f.branch_id || null) === sedeEx) || {};
      return { ...i, stock: e.stock, agotado_manual: e.agotado_manual };
    });

    const bajos = insumos.filter(i => {
      if (i.control_manual && i.agotado_manual) return true;
      /*  LO QUE ESTA EN CERO SE AVISA SIEMPRE, tenga minimo o no.

          Antes, sin minimo no se vigilaba — y de los 41 insumos de El Parche,
          23 no tienen minimo puesto. Entre ellos la Coca Cola 1.5, que el
          27-ago estaba en negativo y no habria salido en ningun aviso.

          El minimo sirve para avisar ANTES de que se acabe ("quedan 2 kilos,
          compra"). Que se haya acabado no necesita minimo: es un hecho.   */
      const stock = Number(i.stock) || 0;
      if (stock <= 0) return true;
      const min = Number(i.min_stock) || 0;
      if (min <= 0) return false;                 // sin mínimo no se vigila ANTES de acabarse
      return stock <= min;
    }).map(i => ({
      nombre: String(i.nombre || ""),
      stock: Number(i.stock) || 0,
      min: Number(i.min_stock) || 0,
      unidad: String(i.buy_unit || ""),
      agotado: !!(i.control_manual && i.agotado_manual) || (Number(i.stock) || 0) <= 0,
      equiv: equivalencia(Number(i.stock) || 0, Number(i.conversion) || 0, String(i.use_unit || "")),
    })).sort((a, b) => (a.agotado !== b.agotado ? (a.agotado ? -1 : 1) : a.nombre.localeCompare(b.nombre, "es")));

    // Nada bajo: no se manda nada. Un "todo bien" cada noche se vuelve ruido y
    // en dos semanas nadie lo lee.
    if (!bajos.length) return json({ ok: true, enviado: false, razon: "nada_bajo" });

    /*  ══ COMO SE LEE ESTO (Sergio, 27-ago-2026) ═══════════════════

        El primer intento era una lista sola donde todo se veia igual:
        «el texto se ve muy plano y se confunde». Tres cambios, y los tres
        salen de como se lee un mensaje en la calle, a las once de la noche:

        1. LO AGOTADO VA APARTE DE LO QUE QUEDA POCO. Son dos cosas
           distintas: una es «compra ya o manana no vendes», la otra es
           «tenlo en cuenta». Juntas, la urgente se pierde entre las otras.

        2. A LO AGOTADO NO SE LE PONE CANTIDAD. Decia «quedan -0.077
           paq. x12». Un negativo en decimales de paquete no le dice nada a
           nadie: se acabo, punto.

        3. A LO QUE QUEDA POCO SE LE PONE EN LA UNIDAD QUE SE CUENTA. No
           «0.249 galon» sino «21 porciones». Es como uno mira la nevera.

        Y un insumo por renglon, que fue lo que pidio al ver la propuesta.  */
    const agotados = bajos.filter(i => i.agotado);
    const pocos = bajos.filter(i => !i.agotado);

    const cuantosAgot = agotados.length + " insumo" + (agotados.length === 1 ? "" : "s");
    const cuantosPoco = pocos.length + " m\u00e1s";

    const conCantidad = (i: typeof bajos[number]) =>
      i.equiv || (i.stock + (i.unidad ? " " + i.unidad : ""));

    const bloques: string[] = [];
    if (agotados.length) {
      bloques.push("\u274c *SE ACAB\u00d3 (" + agotados.length + ")*\n"
        + agotados.map(i => "\u2022 " + i.nombre).join("\n"));
    }
    if (pocos.length) {
      bloques.push("\u26a0\ufe0f *QUEDA POCO (" + pocos.length + ")*\n"
        + pocos.map(i => "\u2022 " + i.nombre + " \u2014 " + conCantidad(i)).join("\n"));
    }

    //  Como se llama el negocio, para que el gerente sepa de cual sede le
    //  hablan: quien maneja dos sedes recibe dos mensajes iguales.
    let negocio = "tu restaurante";
    try {
      const brR = await sbGet(`/rest/v1/branches?id=eq.${branchId}&select=name,brands(name)`) as
        Array<Record<string, unknown>> | null;
      const b = brR?.[0] || {};
      const mk = b.brands as { name?: string } | Array<{ name?: string }> | null;
      negocio = String((Array.isArray(mk) ? mk[0]?.name : mk?.name) || b.name || negocio);
    } catch { /* sin nombre, el aviso sale igual */ }

    const texto = "\U0001f6d2 *POR COMPRAR*\n" + negocio + " \u00b7 cierre de caja\n\n"
      + bloques.join("\n\n")
      + "\n\n\u00c1brelo en Cobra para reponer.";

    // ── Con qué número se manda ──────────────────────────────────────
    const canales = await sbGet(
      `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&select=meta&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const meta = (canales?.[0]?.meta || {}) as Record<string, string>;
    if (!meta.phone_id || !meta.access_token) {
      return json({ ok: true, enviado: false, razon: "sin_whatsapp" });
    }

    // ── Mandarlo ─────────────────────────────────────────────────────
    const enviar = (cuerpo: Record<string, unknown>) =>
      fetch(`${META_API_BASE}/${meta.phone_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${meta.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
      });

    const resultados: Array<Record<string, unknown>> = [];
    for (const numero of numeros) {
      try {
        //  1) La plantilla. Es la unica que pasa fuera de las 24 horas, o sea
        //     casi siempre.
        let r = await enviar({
          to: numero, type: "template",
          template: {
            name: PLANTILLA, language: { code: PLANTILLA_IDIOMA },
            /*  Los tres datos de la plantilla son CORTOS a proposito: el
                nombre del negocio y dos conteos. La lista completa no cabe
                aqui — Meta no admite saltos de linea en un parametro, y una
                lista corrida es justo lo que Sergio no queria.

                Por eso la plantilla lleva el boton «¿Que falta?»: tocarlo
                cuenta como que el gerente escribio, eso abre la ventana de 24
                horas, y la respuesta —esa si libre, con un insumo por
                renglon— la da `gerente-inventario`, que ya contestaba esa
                misma pregunta desde antes.                                */
            components: [{ type: "body", parameters: [
              { type: "text", text: param(negocio, 60) },
              { type: "text", text: param(cuantosAgot, 40) },
              { type: "text", text: param(cuantosPoco, 40) },
            ] }],
          },
        });
        let d = await r.json().catch(() => ({}));
        let via = "plantilla";

        /*  2) Y si la plantilla no existe o no esta aprobada todavia, se
            intenta el texto suelto. No sustituye a la plantilla —solo sale
            dentro de las 24 horas— pero es mejor que nada mientras Meta
            revisa, y es lo unico que tiene un restaurante que aun no la creo
            en su cuenta.

            Si tambien falla el texto, casi siempre es la ventana cerrada. NO
            es un fallo de Cobra, y decirlo asi es lo que evita que alguien se
            ponga a buscar un error que no existe.                          */
        if (!r.ok) {
          console.error("[aviso-insumos] plantilla", numero, String(d?.error?.message || ""));
          r = await enviar({ to: numero, type: "text", text: { body: texto } });
          d = await r.json().catch(() => ({}));
          via = "texto";
        }

        resultados.push({ numero, ok: r.ok, via, error: r.ok ? null : (d?.error?.message || "rechazado") });
      } catch (e) {
        resultados.push({ numero, ok: false, error: String(e).slice(0, 120) });
      }
    }

    return json({ ok: true, enviado: resultados.some(r => r.ok), cuantos: bajos.length, resultados });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
