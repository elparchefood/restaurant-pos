/* facturar — emite la factura electronica de un pedido ante la DIAN.
 *
 * ══ POR QUE ESTO VIVE EN EL SERVIDOR ══════════════════════════════════
 * Aqui estan las credenciales del proveedor. Si bajaran al navegador,
 * cualquiera que abra las herramientas de desarrollo podria emitir facturas
 * a nombre del restaurante. No bajan nunca.
 *
 * ══ EL PROVEEDOR ES INTERCAMBIABLE, Y ESO NO ES PURISMO ═══════════════
 * Sergio, 3-sep-2026: hoy Factus (contestan siempre los correos), y cuando
 * haya volumen, Alanube (mejor precio a escala, pero piden un minimo). El
 * cambio ya esta decidido; solo falta la fecha.
 *
 * Por eso todo lo que depende de Factus vive en UN objeto, `FACTUS`, con
 * tres metodos. Cambiar de proveedor es escribir otro objeto igual, no
 * repasar el archivo entero.
 *
 * ══ LAS REGLAS QUE NO SE NEGOCIAN ════════════════════════════════════
 * 2 · REINTENTAR NO PUEDE DUPLICAR. Se manda el id del pedido como
 *     `reference_code`: si ya se proceso, Factus devuelve LA MISMA factura
 *     en vez de crear otra. La idempotencia viene de fabrica.
 * 4 · LOS IMPUESTOS SE LEEN CONGELADOS. Cada renglon ya trae `tax_pct`,
 *     `tax_base` y `tax_amount` guardados al vender. NUNCA se recalculan:
 *     una factura emitida no puede cambiar porque manana suba el impuesto.
 * 7 · UN RECHAZO SIEMPRE SE VE. Nada falla en silencio: lo que conteste el
 *     proveedor se guarda tal cual en `pos_facturas.respuesta`.
 *
 * ══ EL CONSECUTIVO LO LLEVA EL PROVEEDOR ═════════════════════════════
 * Comprobado contra su sandbox: Factus mantiene sus propios rangos
 * (SETP 990000000-995000000) y su propio contador. Por eso aqui NO se llama
 * a `fn_factura_numero`: dos contadores acabarian separandose, que es peor
 * que no tener ninguno. Se guarda el numero que Factus devuelve.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

/*  La URL tambien es un secreto y no una constante: el dia que se pase a
    produccion se cambia el secreto, sin tocar ni desplegar codigo.      */
/*  ══ LAS LLAVES SON DE CADA RESTAURANTE, NO DE COBRA (4-sep-2026) ══
    Una factura sale a nombre del NIT del restaurante. Si todos facturaran
    con la misma cuenta, todas saldrian a nombre de uno solo.

    Las llaves de cada uno viven CIFRADAS en el Vault de Supabase y se
    sacan con `fn_facturacion_llaves`, que solo puede ejecutar el rol de
    servicio. Aqui no se guarda ninguna.                                 */
type CuentaFactus = {
  url:    string;
  id:     string;
  secret: string;
  user:   string;
  pass:   string;
};

/*  Lo unico que queda del entorno es la direccion por defecto, y solo
    como respaldo: cada cuenta guarda la suya, porque un restaurante puede
    estar probando en el sandbox mientras otro ya factura de verdad.

    Las llaves NO estan aqui. Estan en el Vault, una por restaurante.   */
const URL_POR_DEFECTO = Deno.env.get("FACTUS_URL") ?? "https://api-sandbox.factus.com.co";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/*  Consultas a nuestra base con la llave de servicio. `fetch` no lanza con un
    403, asi que se mira `ok` a mano o los fallos pasan por "no hay datos".  */
async function db(ruta: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("base:", ruta, r.status, t.slice(0, 300));
    throw new Error("No se pudo hablar con la base");
  }
  return r.status === 204 ? null : await r.json();
}

// ══════════════════════════════════════════════════════════════════════
//  EL ADAPTADOR DE FACTUS
// ══════════════════════════════════════════════════════════════════════

/*  El token dura 1 hora (comprobado: `expires_in: 3600`). Se guarda mientras
    el proceso viva: pedir uno en cada factura es un viaje de mas justo en el
    momento en que el cajero esta esperando el tiquete.

    Se renueva 5 minutos ANTES de vencer. Apurarlo hasta el ultimo segundo
    hace que una factura caiga justo en el cambio y falle por nada.        */
/*  ⚠️ UN TOKEN POR CUENTA, Y ESTE ES EL PUNTO DELICADO.

    Antes esto era UNA variable: `let _token`. Con una sola cuenta estaba
    bien; con varias es un fallo serio. La funcion sigue viva entre
    llamadas, asi que el token del restaurante A se reutilizaria para la
    factura del restaurante B — y saldria a nombre del NIT equivocado ante
    la DIAN. Una factura emitida no se deshace.

    La llave del mapa lleva la URL ademas del usuario: la misma cuenta en
    sandbox y en produccion son dos cosas distintas.                     */
const _tokens = new Map<string, { valor: string; vence: number }>();

async function tokenFactus(c: CuentaFactus): Promise<string> {
  const llave = c.url + "|" + c.id + "|" + c.user;
  const guardado = _tokens.get(llave);
  if (guardado && Date.now() < guardado.vence) return guardado.valor;

  const cuerpo = new FormData();
  cuerpo.append("grant_type", "password");
  cuerpo.append("client_id", c.id);
  cuerpo.append("client_secret", c.secret);
  cuerpo.append("username", c.user);
  cuerpo.append("password", c.pass);

  const r = await fetch(`${c.url}/oauth/token`, {
    method: "POST", headers: { Accept: "application/json" }, body: cuerpo,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.access_token) {
    console.error("Factus no dio token:", r.status, JSON.stringify(d).slice(0, 300));
    throw new Error("No se pudo entrar al proveedor de facturacion");
  }
  const nuevo = { valor: d.access_token as string,
                  vence: Date.now() + (d.expires_in - 300) * 1000 };
  _tokens.set(llave, nuevo);
  return nuevo.valor;
}

/*  Codigos de impuesto de la DIAN. El restaurante pequeno colombiano suele ser
    "no responsable" y no cobra nada —es el caso de El Parche—, asi que el
    camino normal es SIN impuesto.                                          */
const COD_IMPUESTO: Record<string, string> = { iva: "01", inc: "04", otro: "01" };

/*  Consumidor final: el adquiriente generico que la DIAN acepta cuando no se
    identifica al comprador. Es el caso de casi todas las ventas de un
    restaurante.                                                            */
const CONSUMIDOR_FINAL = {
  identification: "222222222222",
  names: "Consumidor final",
  legal_organization_id: "2",     // persona natural
  tribute_id: "21",               // no aplica
  identification_document_id: "3", // cedula de ciudadania
};

/*  Fabrica y no objeto suelto: el adaptador nace sabiendo con que llaves
    habla, asi que ningun sitio tiene que acordarse de pasarlas.        */
function crearFactus(c: CuentaFactus) {
 return {
  nombre: "factus",

  /*  Arma el cuerpo que espera Factus a partir de NUESTRO pedido.
      `price` va SIN impuesto ("valor neto", dice su documentacion) y
      nosotros guardamos el precio CON impuesto incluido, que es lo normal en
      Colombia. Por eso se usa `tax_base`, que es justo la parte sin
      impuesto y ya quedo congelada al vender.                            */
  cuerpo(pedido: any, renglones: any[], cfg: any) {
    const items = renglones.map((it) => {
      const cant = Number(it.quantity) || 1;
      const base = Number(it.tax_base);
      /*  Sin impuestos configurados no hay `tax_base`: entonces el precio ya
          ES el valor neto.                                               */
      const neto = Number.isFinite(base) && base > 0
        ? base / cant
        : Number(it.unit_price ?? it.product_price) || 0;
      const pct = Number(it.tax_pct) || 0;

      return {
        code_reference: String(it.product_id ?? it.id).slice(0, 20),
        name: String(it.name ?? it.product_name ?? "Producto").slice(0, 200),
        quantity: cant,
        price: Number(neto.toFixed(2)),
        /*  94 = unidad. NO es 70, que es lo que sugiere la documentacion: su
            propia API lo rechaza. Comprobado probando.                   */
        unit_measure_code: "94",
        standard_code: "1",         // estandar de adopcion del contribuyente
        /*  `taxes` es OBLIGATORIO aunque el producto este excluido. Para el
            restaurante "no responsable" —el caso normal en Colombia, y el de
            El Parche— va con `is_excluded`.                              */
        taxes: [{
          code: COD_IMPUESTO[cfg?.tipo as string] ?? "01",
          rate: String(pct.toFixed(2)),
          is_excluded: pct <= 0,
        }],
        withholding_taxes: [] as unknown[],
      };
    });

    return {
      /*  LA IDEMPOTENCIA. El id del pedido: si dos cajas tocan "facturar" a
          la vez, Factus devuelve la misma factura en vez de crear dos.   */
      reference_code: String(pedido.id),
      observation: "",
      /*  Obligatorio, y va como LISTA. El campo se llama `payment_form`, no
          `payment_form_code`: la API lo rechaza.                        */
      payment_details: [{
        payment_form: "1",          // de contado
        payment_method_code: "10",  // efectivo
        amount: Math.round(Number(pedido.total_final ?? pedido.total) || 0),
      }],
      customer: CONSUMIDOR_FINAL,
      items,
    };
  },

  async emitir(cuerpo: unknown) {
    const tok = await tokenFactus(c);
    const r = await fetch(`${c.url}/v2/bills/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", Accept: "application/json",
        Authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, cuerpo: d };
  },

  /*  Si quedo una factura a medio enviar, Factus responde 409 y hay que
      borrarla por su referencia antes de reintentar. Sin esto, el pedido se
      queda atascado para siempre repitiendo el mismo 409.               */
  async borrarPendiente(referencia: string) {
    const tok = await tokenFactus(c);
    const r = await fetch(`${c.url}/v2/bills/${encodeURIComponent(referencia)}`, {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    return r.ok;
  },

  /*  ══ DESTRABAR LA CUENTA (4-sep-2026) ═══════════════════
      Factus se niega a crear facturas mientras tenga una a medio enviar, y
      contesta 409. `borrarPendiente` solo alcanza la del pedido en curso,
      pero la atascada es OTRA: la de antes. Sin esto, un envio cortado deja
      al restaurante SIN FACTURAR hasta que alguien entre a mirar.

      Aqui se le PREGUNTA cuales tiene sin enviar en vez de suponerlo.

      ⚠️ Esto BORRA en la cuenta del restaurante, asi que los candados no
      son adorno: solo lo NO validado, solo si nuestra propia tabla esta de
      acuerdo, tope de 5, y todo queda anotado. Ver `destrabar()` abajo.  */
  async sinEnviar(): Promise<{
    pude: boolean;
    status: number;
    lista: Array<{ referencia: string; numero: string | null }>;
  }> {
    const tok = await tokenFactus(c);
    /*  v2 Y NO v1, COMPROBADO CONTRA SU API (4-sep-2026):
          /v1/bills -> 403 "Version de API no disponible para esta empresa"
          /v2/bills -> 200 con paginacion
        La version anterior usaba v1 —sacada de una busqueda, no probada— y
        contestaba 403 siempre. Los docs de Factus tampoco se dejan leer
        desde fuera, asi que la unica fuente fiable es la propia API.

        `filter[status]=0` son las NO validadas, o sea las atascadas.
        Comprobado por contraste: con `=1` salen las validadas.        */
    const r = await fetch(`${c.url}/v2/bills?filter[status]=0`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    const d = await r.json().catch(() => null);
    console.log("[destrabar] listado:", r.status, JSON.stringify(d).slice(0, 900));
    /*  ⚠️ NO se devuelve lista vacia cuando falla. «No hay atascadas» y
        «no pude preguntar» son cosas distintas, y confundirlas deja al
        restaurante sin facturar mientras el registro dice que todo bien. */
    if (!r.ok) {
      console.error("[destrabar] NO se pudo preguntar el listado:", r.status);
      return { pude: false, status: r.status, lista: [] };
    }
    /*  Se busca el array donde este, sin casarse con una sola forma: unas
        APIs devuelven `data`, otras `data.data` con la paginacion.      */
    const cand = (Array.isArray(d?.data) ? d.data
      : Array.isArray(d?.data?.data) ? d.data.data
      : Array.isArray(d) ? d : []) as Array<Record<string, unknown>>;
    const lista = cand
      /*  CANDADO 1: solo lo que Factus marca como NO validado. Si el campo
          no viene, NO se asume que se puede borrar.                     */
      .filter(b => b.is_validated === false || b.is_validated === 0
                || b.is_validated === "0" || String(b.status) === "0")
      .map(b => ({
        referencia: String(b.reference_code ?? ""),
        numero: b.number != null ? String(b.number) : null,
      }))
      .filter(b => b.referencia.length > 0);
    return { pude: true, status: r.status, lista };
  },

  /*  LA RESOLUCION, LEIDA DEL PROVEEDOR (4-sep-2026).

      Sergio, mirando la pantalla: *"ningun dueno de restaurante sabe que
      es resolucion ni prefijo ni nada de eso"*. Tiene razon, y la salida
      no es explicarlo mejor: es NO PREGUNTARLO.

      Factus ya tiene la resolucion cargada —se la meten al habilitar al
      facturador— y la devuelve entera: prefijo, desde, hasta, numero de
      resolucion, vencimiento y por cual va. Todo lo que el formulario le
      estaba pidiendo al dueno que transcribiera de un PDF de la DIAN.

      Transcribir eso a mano no solo es incomodo: un digito mal copiado en
      el rango deja facturas emitidas fuera de la resolucion.            */
  async rangos() {
    const tok = await tokenFactus(c);
    /*  Se piden TODOS los activos y se escoge aqui. Probado: el filtro
        `filter[document]=01` devuelve cero — ese parametro no toma el
        codigo de la DIAN—, y adivinar valores de uno en uno sale caro. */
    const r = await fetch(`${c.url}/v2/numbering-ranges?filter[is_active]=1`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    const d = await r.json().catch(() => null);
    /*  Igual que con el listado: «no hay» y «no pude preguntar» son cosas
        distintas, y confundirlas hace que la pantalla mienta.          */
    if (!r.ok) {
      console.error("[rangos] el proveedor contesto", r.status);
      return { pude: false, status: r.status, lista: [] };
    }
    const arr = (Array.isArray(d?.data) ? d.data
      : Array.isArray(d?.data?.data) ? d.data.data
      : Array.isArray(d) ? d : []) as Array<Record<string, unknown>>;
    return {
      pude: true, status: r.status,
      lista: arr.map(x => ({
        id:        x.id ?? null,
        documento: x.document ?? null,
        prefijo:   x.prefix ?? "",
        desde:     x.from ?? null,
        hasta:     x.to ?? null,
        actual:    x.current ?? null,
        resolucion: x.resolution_number ?? null,
        desde_fecha: x.start_date ?? null,
        vence:     x.end_date ?? null,
        vencido:   x.is_expired === 1 || x.is_expired === true,
      })),
    };
  },

  /*  Los datos de la empresa segun el proveedor: NIT y razon social. Se
      leen al conectar para que el restaurante no los escriba dos veces —
      y sobre todo para que no los escriba MAL, que en una factura
      electronica el NIT equivocado es un documento invalido.

      Comprobado que existe: GET /v2/companies devuelve la empresa del
      usuario del token. Es «la empresa», en singular: cada cuenta es un
      facturador. Eso es justo lo que obliga a tener una cuenta por
      restaurante.                                                       */
  async empresa() {
    const tok = await tokenFactus(c);
    const r = await fetch(`${c.url}/v2/companies`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const e = d?.data ?? d ?? {};
    /*  ⚠️ `??` NO sirve aqui, y eso costo un rato: Factus manda cadenas
        VACIAS, no nulos. `e.company ?? otra` se queda con "" y el nombre
        nunca llegaba. Se necesita "vacio tambien cuenta como que no hay". */
    const algo = (...xs: unknown[]) =>
      xs.map(x => String(x ?? "").trim()).find(x => x.length > 0) || null;

    /*  Comprobado contra /v2/companies (4-sep): una EMPRESA trae `company`;
        una PERSONA NATURAL lo trae vacio y el nombre vive en
        `graphic_representation_name`, o en `names` + `surnames`.       */
    return {
      nit: algo(e.identification, e.nit),
      /*  El digito de verificacion va con el NIT: sin el, el numero esta
          incompleto en una factura.                                    */
      dv:  algo(e.dv),
      nombre: algo(
        e.company, e.trade_name, e.graphic_representation_name,
        [e.names, e.surnames].filter(Boolean).join(" "),
      ),
    };
  },

  /*  Lo que nos interesa guardar de su respuesta, con nombres nuestros: asi
      la tabla no cambia cuando cambie el proveedor.                      */
  leer(d: any) {
    const b = d?.data?.bill ?? d?.data ?? {};
    return {
      numero: b.number ?? null,
      cufe:   b.cufe ?? null,
      /*  Factus no devuelve un id propio: la referencia ES la llave con la
          que se le consulta despues (`/v2/bills/show/<referencia>`).    */
      id:     b.reference_code ?? null,
      validada: b.is_validated === true || b.is_validated === 1,
      /*  El QR va impreso en el tiquete: es lo que deja al cliente
          comprobar la factura en la pagina de la DIAN.                  */
      qr:     b.links?.qr ?? null,
      pdf:    b.links?.public_url ?? null,
    };
  },
 };
}
type Factus = ReturnType<typeof crearFactus>;

/*  ══ QUITAR LO ATASCADO, CON CANDADOS ══════════════════════
    Borrar en la cuenta del restaurante no se deshace. Los cuatro candados:

      1. Solo lo que Factus marca como NO validado (lo filtra `sinEnviar`).
      2. Y ademas, que NUESTRA tabla no la tenga por `aceptada`. Dos fuentes
         tienen que coincidir; una sola no basta para borrar.
      3. Tope de 5 por vez. Mas que eso ya no es un envio cortado, es otra
         cosa — y esa la mira una persona, no un reintento automatico.
      4. Cada borrado queda anotado con su referencia y su numero.

    Devuelve cuantas se quitaron: si son cero, no tiene sentido reintentar
    y el 409 se guarda tal cual para que se vea.                          */
/*  ══ GUARDAR LA RESOLUCION QUE DICE EL PROVEEDOR ══════════════
    El dueno ya no transcribe la resolucion de un PDF de la DIAN: el
    proveedor la tiene cargada y la devuelve entera. Aqui se copia a
    nuestra tabla para que la pantalla no tenga que salir a internet cada
    vez que alguien abre Configuracion.

    ⚠️ CUAL DE TODOS ES EL DE FACTURAS: no se busca por el nombre. La
    cuenta trae seis rangos y el nombre es texto del proveedor, que puede
    cambiar. Se escoge por la FORMA: el unico con numero de resolucion Y
    con desde y hasta es el de facturas; las notas los traen vacios. Es un
    hecho de la estructura, no una coincidencia de palabras.            */
type RangoLeido = {
  prefijo?: unknown; desde?: unknown; hasta?: unknown; actual?: unknown;
  resolucion?: unknown; vence?: unknown; vencido?: boolean;
};

async function guardarRango(
  tenantId: string, branchId: string, lista: unknown[],
): Promise<void> {
  const rs = (lista || []) as RangoLeido[];
  /*  ⚠️ LA ELECCION, Y POR QUE NO BASTA UNA SOLA SENAL.

      Primero use solo la FORMA —"el que tenga resolucion con desde y
      hasta"— por no fiarme de un nombre que manda el proveedor. Al
      mirarlo con datos, la cuenta trae DOS asi: la factura (SETP) y el
      documento soporte (SEDS). Acerto de suerte, porque la factura venia
      primero en la lista.

      Asi que se piden las dos cosas: la forma Y que el nombre hable de
      factura sin ser documento soporte ni nota. Y se ANOTA cual se
      escogio, para que si algun dia elige mal, se vea.                 */
  const norm = (x: unknown) => String(x ?? "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const tieneForma = (x: RangoLeido) =>
    String(x.resolucion ?? "").trim().length > 0
    && x.desde != null && x.hasta != null;

  const esDeFacturas = (x: RangoLeido) => {
    if (!tieneForma(x)) return false;
    const n = norm((x as Record<string, unknown>).documento);
    return n.includes("factura") && !n.includes("soporte") && !n.includes("nota");
  };

  const f = rs.find(esDeFacturas);
  if (f) {
    console.log(`[rangos] elegido: ${norm((f as Record<string, unknown>).documento)} | de ${rs.filter(tieneForma).length} con forma de resolucion`);
  }
  if (!f) { console.log("[rangos] el proveedor no tiene ningun rango de facturas"); return; }

  const fila = {
    tenant_id: tenantId, branch_id: branchId,
    resolucion: String(f.resolucion),
    prefijo: String(f.prefijo ?? ""),
    desde: Number(f.desde), hasta: Number(f.hasta),
    /*  `current` es el SIGUIENTE numero libre; nuestra columna guarda el
        ULTIMO emitido. Copiarlo tal cual mostraria una factura de mas.  */
    actual: Math.max(Number(f.desde) - 1, Number(f.actual ?? 0) - 1),
    vence_at: f.vence ? String(f.vence).slice(0, 10) : null,
    activo: !f.vencido,
  };

  const previas = await db(
    `pos_facturacion_rangos?branch_id=eq.${branchId}&select=id&limit=1`,
  ) as Array<{ id?: string }> | null;

  if (previas?.[0]?.id) {
    await db(`pos_facturacion_rangos?id=eq.${previas[0].id}`,
      { method: "PATCH", body: JSON.stringify(fila) });
  } else {
    await db("pos_facturacion_rangos",
      { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(fila) });
  }
  console.log(`[rangos] guardada la resolucion ${fila.resolucion} (${fila.prefijo}${fila.desde}-${fila.hasta}), va por ${fila.actual}`);
}

const TOPE_DESTRABAR = 5;

async function destrabar(FACTUS: Factus, tenantId: string): Promise<number> {
  let atascadas: Array<{ referencia: string; numero: string | null }>;
  try {
    const r = await FACTUS.sinEnviar();
    /*  Si no se pudo preguntar, NO se sigue como si no hubiera nada: se
        dice. Callarlo aqui es dejar al restaurante sin facturar sin que
        nadie se entere.                                                */
    if (!r.pude) {
      console.error(`[destrabar] el proveedor dice 409 pero el listado contesto ${r.status}: NO se sabe que hay atascado`);
      return 0;
    }
    atascadas = r.lista;
  } catch (e) {
    console.error("[destrabar] no se pudo preguntar:", String(e).slice(0, 200));
    return 0;
  }
  if (!atascadas.length) {
    console.log("[destrabar] Factus dice 409 pero no lista ninguna sin enviar");
    return 0;
  }
  if (atascadas.length > TOPE_DESTRABAR) {
    console.error(`[destrabar] hay ${atascadas.length} atascadas (tope ${TOPE_DESTRABAR}). NO se toca ninguna: esto lo mira una persona`);
    return 0;
  }

  /*  CANDADO 2: lo que nosotros tengamos por aceptada no se toca, diga lo
      que diga el listado. Una factura aceptada esta ante la DIAN.       */
  const refs = atascadas.map(a => a.referencia);
  let aceptadas = new Set<string>();
  try {
    const filas = await db(
      `pos_facturas?tenant_id=eq.${tenantId}&estado=eq.aceptada&select=order_id`,
    ) as Array<{ order_id?: string }> | null;
    aceptadas = new Set((filas || []).map(f => String(f.order_id)));
  } catch (e) {
    /*  Si no se puede comprobar, NO se borra nada. El candado que no se
        puede verificar se comporta como si estuviera cerrado.           */
    console.error("[destrabar] no se pudo comprobar contra la tabla, no se toca nada:", String(e).slice(0, 150));
    return 0;
  }

  let quitadas = 0;
  for (const a of atascadas) {
    if (aceptadas.has(a.referencia)) {
      console.error(`[destrabar] ${a.referencia} figura ACEPTADA en nuestra tabla: NO se toca`);
      continue;
    }
    const ok = await FACTUS.borrarPendiente(a.referencia);
    console.log(`[destrabar] ${ok ? "quitada" : "NO se pudo quitar"} ${a.referencia}${a.numero ? " (" + a.numero + ")" : ""}`);
    if (ok) quitadas++;
  }
  console.log(`[destrabar] quedaron quitadas ${quitadas} de ${atascadas.length}`);
  return quitadas;
}

// ══════════════════════════════════════════════════════════════════════
//  LA FUNCION
// ══════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { order_id, revisar, conectar } = await req.json();
    /*  Para conectar la cuenta NO hace falta un pedido: la sede sale de
        la sesion. Para todo lo demas si, porque es lo que demuestra que
        el pedido es de quien pregunta.                                 */
    if (!order_id && !conectar && revisar !== true) return json({ error: "Falta el pedido" }, 400);

    /*  ── QUIEN LLAMA TIENE QUE PODER VER ESE PEDIDO ─────────────────
        Abajo se usa la llave de servicio, que se salta las politicas de la
        base. Se comprueba preguntandole a la base CON EL TOKEN DE QUIEN
        LLAMA: si sus politicas le devuelven el pedido, es suyo. Asi las
        reglas de permisos viven en un solo sitio.                      */
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sin sesion" }, 401);

    /*  Al conectar no hay pedido que comprobar: manda el rol de la
        sesion, que se mira dentro del bloque de arriba.                */
    if (!conectar && revisar !== true) {
    const suyo = await fetch(
      `${SUPABASE_URL}/rest/v1/pos_orders?id=eq.${order_id}&select=id`,
      { headers: { apikey: ANON_KEY, Authorization: auth } },
    );
    if (!suyo.ok) return json({ error: "No se pudo comprobar la sesion" }, 401);
    if (!((await suyo.json())?.length)) return json({ error: "Ese pedido no es tuyo" }, 403);
    }

    /*  ══ MIRAR SIN TOCAR — que tiene el proveedor de MI restaurante ══
        La sede sale de la SESION y no de un pedido: la pantalla de
        Configuracion no tiene ninguno a mano, y un restaurante recien
        instalado no tiene ninguno en absoluto. Mismo fallo que ya se
        corrigio en `conectar`, y se me colo otra vez aqui.

        No borra nada: lee lo que hay sin enviar y la resolucion cargada,
        y guarda esa resolucion para que la pantalla no salga a internet
        cada vez que alguien abre Configuracion.                        */
    if (revisar === true) {
      const q = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY, Authorization: auth },
      });
      if (!q.ok) return json({ error: "No se pudo comprobar la sesi\u00f3n" }, 401);
      const m = (await q.json())?.user_metadata || {};
      const miTenant = String(m.tenant_id || ""), miBranch = String(m.branch_id || "");
      if (!miTenant || !miBranch) return json({ error: "Tu usuario no tiene sede asignada" }, 400);

      const kk = await db("rpc/fn_facturacion_llaves", {
        method: "POST", body: JSON.stringify({ p_branch: miBranch }),
      }) as Record<string, string> | null;
      if (!kk || !kk.client_id) {
        return json({ sin_cuenta: true, pude_preguntar: false, rangos: null }, 200);
      }
      const FACTUS = crearFactus({
        url: kk.url || URL_POR_DEFECTO, id: kk.client_id, secret: kk.client_secret,
        user: kk.username, pass: kk.password,
      });


      /*  De paso se refresca A NOMBRE DE QUIEN esta conectada. Si en el
          proveedor cambian la razon social, la pantalla del restaurante
          no se queda diciendo el nombre viejo.                         */
      try {
        const emp = await FACTUS.empresa();
        if (emp && (emp.nit || emp.nombre)) {
          await db(`pos_facturacion_cuentas?branch_id=eq.${miBranch}&proveedor=eq.factus`, {
            method: "PATCH",
            body: JSON.stringify({
              emp_nit: emp.dv ? (emp.nit + "-" + emp.dv) : emp.nit,
              emp_nombre: emp.nombre,
            }),
          });
        }
      } catch (_e) { /* mirar no puede tumbar nada */ }

      /*  Y la resolucion que ya tiene cargada, para no pedirsela al
          dueno. Ver el comentario de `rangos()`.                       */
      let rg: { pude: boolean; lista: unknown[] } = { pude: false, lista: [] };
      try { rg = await FACTUS.rangos(); }
      catch (e) { console.error("[rangos] fallo:", String(e).slice(0, 120)); }

      /*  Y se guarda el de FACTURAS en nuestra tabla, para que la
          pantalla del restaurante pinte al instante sin salir a
          internet. Ver `guardarRango`.                                 */
      if (rg.pude) {
        try { await guardarRango(miTenant, miBranch, rg.lista); }
        catch (e) { console.error("[rangos] no se pudo guardar:", String(e).slice(0, 120)); }
      }

      const r = await FACTUS.sinEnviar();
      /*  `pude` es lo primero que hay que mirar: sin el, una respuesta
          vacia se lee como «esta todo limpio» cuando puede ser «no
          conteste».                                                    */
      return json({
        proveedor: FACTUS.nombre,
        rangos: rg.pude ? rg.lista : null,
        pude_leer_rangos: rg.pude,
        pude_preguntar: r.pude,
        respuesta_del_proveedor: r.status,
        sin_enviar: r.lista,
      });
    }

    /*  ══ CONECTAR LA CUENTA DE ESTE RESTAURANTE ════════════════
        Las llaves que Factus le dio a ESTE restaurante. Suben una vez y
        no vuelven a bajar nunca.                                       */
    if (conectar) {
      const k = conectar as Record<string, string>;
      if (!k.client_id || !k.client_secret || !k.username || !k.password) {
        return json({ error: "Faltan datos de la cuenta de facturaci\u00f3n" }, 400);
      }

      /*  QUIEN CONECTA. Que el pedido sea suyo demuestra que es de este
          restaurante, no que mande en el. Conectar la cuenta de
          facturacion no es tarea de un cajero.                         */
      const quien = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY, Authorization: auth },
      });
      if (!quien.ok) return json({ error: "No se pudo comprobar la sesi\u00f3n" }, 401);
      const usuario = await quien.json();
      const meta = usuario?.user_metadata || {};
      const rol = String(meta.role || "").toLowerCase();

      /*  ══ QUIEN CONECTA, Y POR QUE HAY DOS CAMINOS ══════════════
          Las llaves las manda Factus a COBRA, no al restaurante: el dueno
          sube papeles y nunca ve una llave. Asi que quien las pega es el
          administrador de la plataforma, y su sesion es de otro tenant.

          Por eso, cuando viene `branch_id` es el camino del administrador
          —y solo suyo—. Sin `branch_id`, manda la sesion: la sede sale de
          ahi y no de un pedido, porque un restaurante recien instalado no
          tiene ni un pedido y esto es de lo primero que hara.          */
      let sesionTenant = String(meta.tenant_id || "");
      let sesionBranch = String(meta.branch_id || "");

      const sedePedida = String((conectar as Record<string, string>).branch_id || "");
      if (sedePedida) {
        const perfil = await db(
          `user_profiles?id=eq.${usuario.id}&select=role&limit=1`,
        ) as Array<{ role?: string }> | null;
        if (perfil?.[0]?.role !== "admin") {
          return json({ error: "Solo el administrador de la plataforma puede conectar la cuenta de otro restaurante" }, 403);
        }
        /*  El tenant NO se cree lo que venga en la peticion: se lee de la
            sede. Creerselo dejaria escribir llaves en la cuenta de
            cualquier restaurante mandando otro id.                     */
        const sede = await db(
          `branches?id=eq.${sedePedida}&select=id,tenant_id&limit=1`,
        ) as Array<{ id?: string; tenant_id?: string }> | null;
        if (!sede?.[0]?.tenant_id) return json({ error: "Esa sede no existe" }, 404);
        sesionBranch = String(sede[0].id);
        sesionTenant = String(sede[0].tenant_id);
      }
      if (!sedePedida
          && rol !== "gerente" && rol !== "admin" && rol !== "dueno" && rol !== "owner") {
        return json({ error: "Solo el due\u00f1o o el gerente puede conectar la facturaci\u00f3n" }, 403);
      }

      if (!sesionTenant || !sesionBranch) {
        return json({ error: "Tu usuario no tiene sede asignada" }, 400);
      }

      const ambiente = k.ambiente === "produccion" ? "produccion" : "sandbox";
      const cuenta = {
        url: k.url || (ambiente === "produccion"
          ? "https://api.factus.com.co" : "https://api-sandbox.factus.com.co"),
        id: k.client_id, secret: k.client_secret,
        user: k.username, pass: k.password,
      };

      /*  ⚠️ SE COMPRUEBAN ANTES DE GUARDARLAS. Guardar unas llaves sin
          probarlas es dejar al restaurante creyendo que factura. Hoy
          mismo se vio: todo escrito en pantalla y cero facturas.      */
      const prueba = crearFactus(cuenta);
      let empresa: { nit: string | null; nombre: string | null } | null = null;
      try {
        empresa = await prueba.empresa();
      } catch (e) {
        console.error("[cuenta] las llaves no sirven:", String(e).slice(0, 150));
        empresa = null;
      }
      if (!empresa) {
        return json({
          error: "Esas llaves no sirven: el proveedor no las acept\u00f3. Rev\u00edsalas y vuelve a intentarlo.",
          conectada: false,
        }, 400);
      }

      await db("rpc/fn_facturacion_guardar_llaves", {
        method: "POST",
        body: JSON.stringify({
          p_tenant: sesionTenant, p_branch: sesionBranch,
          p_llaves: {
            url: cuenta.url, client_id: cuenta.id, client_secret: cuenta.secret,
            username: cuenta.user, password: cuenta.pass,
          },
          p_ambiente: ambiente,
        }),
      });

      /*  El NIT y la razon social se guardan para que la pantalla del
          restaurante pueda decir A NOMBRE DE QUIEN salen sus facturas.
          Verlo escrito es lo que deja notar que se conecto la cuenta
          equivocada — y eso solo se nota mirandolo.                    */
      await db(`pos_facturacion_cuentas?branch_id=eq.${sesionBranch}&proveedor=eq.factus`, {
        method: "PATCH",
        body: JSON.stringify({
          emp_nit: empresa.dv ? (empresa.nit + "-" + empresa.dv) : empresa.nit,
          emp_nombre: empresa.nombre,
        }),
      });

      /*  Vuelve el nombre de la empresa, NUNCA las llaves. */
      console.log("[cuenta] conectada la sede", sesionBranch, "ambiente", ambiente);
      return json({ conectada: true, ambiente, empresa });
    }

    // ── el pedido y sus renglones ────────────────────────────────────
    const pedidos = await db(
      `pos_orders?id=eq.${order_id}&select=id,tenant_id,branch_id,total,total_final,status`);
    const pedido = pedidos?.[0];
    if (!pedido) return json({ error: "El pedido no existe" }, 404);

    /*  Las llaves salen del Vault y solo las puede pedir el rol de
        servicio. Aqui no se guardan ni se registran jamas.             */
    const llaves = await db("rpc/fn_facturacion_llaves", {
      method: "POST",
      body: JSON.stringify({ p_branch: pedido.branch_id }),
    }) as Record<string, string> | null;

    /*  ⚠️ SIN CUENTA NO SE EMITE, y NO se cae de vuelta a las llaves de
        Cobra. El respaldo seria comodo y seria un desastre: la factura
        saldria a nombre del NIT de otro restaurante ante la DIAN, y una
        factura emitida no se deshace.                                  */
    if (!llaves || !llaves.client_id) {
      console.error("[cuenta] la sede", pedido.branch_id, "no tiene cuenta de facturacion");
      return json({
        error: "Este restaurante todav\u00eda no tiene conectada su cuenta de facturaci\u00f3n electr\u00f3nica",
        sin_cuenta: true,
      }, 409);
    }

    const FACTUS = crearFactus({
      url:    llaves.url || URL_POR_DEFECTO,
      id:     llaves.client_id,
      secret: llaves.client_secret,
      user:   llaves.username,
      pass:   llaves.password,
    });

    if (pedido.status === "cancelled") {
      return json({ error: "Un pedido anulado no se factura" }, 400);
    }

    /*  ── YA FACTURADO: SE DEVUELVE LA QUE HAY ──────────────────────
        Primera barrera de la idempotencia, antes de salir a internet. La
        segunda es el `reference_code` del proveedor.                  */
    const previas = await db(
      `pos_facturas?order_id=eq.${order_id}&tipo=eq.factura&estado=neq.anulada`
      + `&select=id,estado,numero,cufe,prefijo`);
    const previa = previas?.[0];
    if (previa && previa.estado === "aceptada") {
      return json({ ya_estaba: true, factura: previa });
    }

    const renglones = await db(
      `pos_order_items?order_id=eq.${order_id}`
      + `&select=id,product_id,name,product_name,quantity,unit_price,product_price,`
      + `total,tax_pct,tax_base,tax_amount`);
    if (!renglones?.length) return json({ error: "El pedido no tiene productos" }, 400);

    // ── se emite ─────────────────────────────────────────────────────
    const cuerpo = FACTUS.cuerpo(pedido, renglones, null);
    let res = await FACTUS.emitir(cuerpo);

    /*  409 = quedo una a medio enviar. Se borra y se reintenta UNA vez: si
        vuelve a fallar, es otra cosa y repetir no la arregla.          */
    if (res.status === 409) {
      /*  Primero la nuestra: si esto es un reintento del MISMO pedido, la
          atascada es la suya y se quita sin salir a preguntar nada.     */
      await FACTUS.borrarPendiente(String(pedido.id));
      res = await FACTUS.emitir(cuerpo);

      /*  Sigue en 409 = la atascada es de OTRO pedido. Ahora si se le
          pregunta a Factus cual es. Este es el caso que dejaba al
          restaurante sin facturar.                                     */
      if (res.status === 409) {
        const quitadas = await destrabar(FACTUS, pedido.tenant_id);
        if (quitadas > 0) res = await FACTUS.emitir(cuerpo);
      }
    }

    const leido = FACTUS.leer(res.cuerpo);
    const fila = {
      tenant_id: pedido.tenant_id, branch_id: pedido.branch_id, order_id: pedido.id,
      tipo: "factura", proveedor: FACTUS.nombre, proveedor_id: leido.id,
      numero: leido.numero, cufe: leido.cufe,
      total: Math.round(Number(pedido.total_final ?? pedido.total) || 0),
      estado: res.ok && leido.validada ? "aceptada" : (res.ok ? "enviada" : "pendiente"),
      /*  Lo que contesto, TAL CUAL. Un rechazo siempre se puede leer entero
          despues: resumirlo aqui es perder justo lo que hace falta.     */
      respuesta: res.cuerpo,
      error: res.ok ? null : (res.cuerpo?.message ?? `HTTP ${res.status}`),
      emitida_at: res.ok ? new Date().toISOString() : null,
    };

    const guardada = await db(
      previa ? `pos_facturas?id=eq.${previa.id}` : "pos_facturas",
      {
        method: previa ? "PATCH" : "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(fila),
      },
    );

    if (!res.ok) {
      console.error("Factus rechazo:", res.status, JSON.stringify(res.cuerpo).slice(0, 600));
      return json({ error: fila.error, detalle: res.cuerpo, factura: guardada?.[0] }, 200);
    }
    return json({ factura: guardada?.[0] });
  } catch (e) {
    console.error("facturar:", String(e));
    return json({ error: String(e).replace("Error: ", "") }, 500);
  }
});
