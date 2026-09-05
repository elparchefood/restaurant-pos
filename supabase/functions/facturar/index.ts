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

/*  El secreto con el que el reloj pide procesar la cola. No es la llave
    de servicio a proposito: aquella abre toda la base de todos los
    restaurantes, y el cron vive DENTRO de la base — quedaria escrita en
    una tabla. Esta solo sirve para decir "procesa lo vencido".        */
const COLA_SECRETO = Deno.env.get("COLA_SECRETO") ?? "";

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
    /*  El mensaje DICE QUE FALLO. "No se pudo hablar con la base" es
        verdad y no sirve para nada: hoy me costo tres intentos averiguar
        que una nota de credito no cabia por un indice unico. Va la tabla y
        el codigo; la parte de la consulta con datos no, que acaba en la
        pantalla de alguien.                                            */
    const tabla = String(ruta).split("?")[0];
    /*  Y el motivo que da la base, que es lo unico que sirve para
        arreglarlo: su `code` y su `message` — ahi va el nombre del indice
        o de la regla que rechazo. `details` NO, que ahi vienen los datos
        de la fila y esto acaba en la pantalla de alguien.              */
    let porque = "";
    try {
      const e = JSON.parse(t);
      porque = [e?.code, e?.message].filter(Boolean).join(" ").slice(0, 160);
    } catch (_e) { /* no era json */ }
    throw new Error(`La base rechazo ${tabla} (${r.status})${porque ? ": " + porque : ""}`);
  }
  /*  Una respuesta SIN CUERPO no es un error: PostgREST contesta 201 y
      cuerpo vacio cuando se le pide `return=minimal`, y 204 al borrar.
      Leerla como JSON revienta DESPUES de que el cambio ya se hizo, asi
      que quien llamaba veia una excepcion de algo que si funciono — me
      acaba de pasar con el barrido: creaba las filas y decia que no habia
      recogido ninguna.                                                 */
  const texto = await r.text();
  if (!texto.trim()) return null;
  return JSON.parse(texto);
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
/*  ══ EL COMPRADOR ═══════════════════════════════════════════════════
    Si el cliente dio sus datos, la factura sale a su nombre; si no, a
    consumidor final. Una factura a consumidor final no le sirve a nadie
    para descontar, asi que cuando la piden hay que ponerle sus datos.

    LOS CODIGOS son los de la DIAN, de la tabla de Factus (4-sep-2026):
      identification_document_code  13 = cedula · 31 = NIT
      legal_organization_code        1 = juridica · 2 = natural
      tribute_code                  ZZ = no aplica

    ⚠️ Yo los habia puesto a ojo (3, 6, 21) y estaban mal los tres. Un
    comentario que documenta codigos equivocados es peor que no tenerlo:
    el siguiente que lo lea se fia.

    ⚠️ Un NIT lleva persona JURIDICA; una cedula, natural. Mandar un NIT
    como persona natural es un documento mal formado, y la DIAN lo nota. */
function comprador(datos: Record<string, unknown> | null | undefined) {
  /*  El NIT va SIN digito de verificacion ni guion: el dv tiene su propio
      campo y si no se manda, el proveedor lo calcula. Como la gente lo
      escribe "900123456-7", se parte por el guion antes de limpiar.   */
  const crudo = String(datos?.documento ?? "").trim();
  const doc = crudo.split("-")[0].replace(/[^0-9]/g, "");
  const nombre = String(datos?.nombre ?? "").trim();
  if (!doc || !nombre) return CONSUMIDOR_FINAL;

  const esNit = String(datos?.tipo ?? "cc").toLowerCase() === "nit";
  const correo = String(datos?.correo ?? "").trim();
  const out: Record<string, unknown> = {
    identification: doc,
    identification_document_code: esNit ? "31" : "13",
    legal_organization_code: esNit ? "1" : "2",
    tribute_code: "ZZ",
  };
  /*  El nombre va en un campo u otro segun quien sea, y NO es opcional:
      `company` es obligatorio para persona juridica y `names` para
      natural. Mandarlo en el que no toca es un documento incompleto.  */
  if (esNit) out.company = nombre; else out.names = nombre;
  /*  El correo solo si lo hay: un campo vacio aqui hace que el proveedor
      intente mandar la factura a ninguna parte.                       */
  if (correo) out.email = correo;
  return out;
}

/*  ⚠️ LOS NOMBRES DE LOS CAMPOS Y LOS CODIGOS, sacados de la
    documentacion de Factus el 4-sep y NO adivinados. Los que habia estaban
    mal en los dos sitios:

      · va `identification_document_code`, no `..._id`
      · va `legal_organization_code`,      no `..._id`
      · va `tribute_code`,                 no `tribute_id`

    Y los codigos son los de la DIAN, no numeros correlativos:
      13 = cedula de ciudadania · 31 = NIT
       1 = persona juridica     ·  2 = persona natural
      ZZ = tributo no aplica

    Con consumidor final colaba porque el proveedor rellena lo que falta;
    en cuanto se manda un cliente de verdad, lo rechaza:
      "El campo codigo de documento de identidad es obligatorio cuando
       customer esta presente".                                        */
const CONSUMIDOR_FINAL = {
  identification: "222222222222",
  names: "Consumidor final",
  identification_document_code: "13",   // cedula de ciudadania
  legal_organization_code: "2",         // persona natural
  tribute_code: "ZZ",                   // no aplica
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

    /*  ══ LO QUE SE COBRA Y NO ES UN PRODUCTO ═══════════════════════════
        El empaque lo paga el cliente: si no va en la factura, la factura
        dice menos de lo que se cobró. Y el domicilio va solo si se le
        cobró — `delivery_fee` es lo que VALE, no lo que se cobró: hay
        pedidos donde lo asume el restaurante.

        Lo cobrado por domicilio se saca de la diferencia entre lo que
        pagó y el total de la venta, que es como se guarda: `total_final`
        son las ventas sin domicilio y `paid_amount` es todo lo que puso
        el cliente.                                                     */
    const linea = (code: string, nombre: string, valor: number) => ({
      code_reference: code,
      name: nombre,
      quantity: 1,
      price: Number(valor.toFixed(2)),
      unit_measure_code: "94",
      standard_code: "1",
      /*  Sin impuesto: ni el empaque ni el domicilio lo llevan en un
          restaurante no responsable, que es el caso normal.          */
      taxes: [{ code: "01", rate: "0.00", is_excluded: true }],
      withholding_taxes: [] as unknown[],
    });

    const empaque = Math.round(Number(pedido?.packaging_fee) || 0);
    if (empaque > 0) items.push(linea("EMPAQUE", "Empaque", empaque));

    const pagado = Math.round(Number(pedido?.paid_amount) || 0);
    const venta  = Math.round(Number(pedido?.total_final ?? pedido?.total) || 0);
    const domiCobrado = Math.max(0, pagado - venta);
    if (domiCobrado > 0) items.push(linea("DOMICILIO", "Domicilio", domiCobrado));

    /*  ══ EL DESCUENTO SE REPARTE EN LOS PRECIOS ══════════════════════
        Su tabla de codigos dice que los descuentos globales estan
        "disponibles proximamente" — solo funciona el recargo (03). Asi
        que un descuento no se puede mandar como descuento.

        Se reparte proporcional en las lineas: si el cliente pago menos,
        las lineas dicen lo que de verdad pago por cada cosa. Es menos
        explicito que un campo aparte, pero la factura queda por el valor
        CORRECTO — y una factura por un valor equivocado si es un
        problema, mientras que no detallar el descuento no lo es.

        El sobrante se ajusta en la ultima linea: repartir 1.000 entre
        tres platos deja 0,33 por lado, y un peso de diferencia basta
        para que la rechacen.                                          */
    const descuento = Math.round(Number(pedido?.discount_amount) || 0);
    if (descuento > 0 && items.length) {
      const bruto = items.reduce((a, it) => a + it.price * it.quantity, 0);
      if (bruto > descuento) {
        let repartido = 0;
        items.forEach((it, i) => {
          const suyo = i === items.length - 1
            ? descuento - repartido                       // el resto, exacto
            : Math.round((it.price * it.quantity / bruto) * descuento);
          repartido += suyo;
          it.price = Number(Math.max(0, it.price - suyo / it.quantity).toFixed(2));
        });
      }
    }

    /*  ══ LA PROPINA ES UN RECARGO, NO UNA LINEA ═══════════════════════
        Una propina no es un producto vendido. Factus la quiere como
        `allowance_charges` con concepto 03 (recargo condicionado), que es
        el unico de esa tabla que esta disponible hoy.                 */
    const propina = Math.round(Number(pedido?.tip_amount) || 0);
    const baseProductos = items.reduce((a, it) => a + it.price * it.quantity, 0);
    const recargos = propina > 0 ? [{
      concept_type: "03",
      is_surcharge: true,
      reason: "propina",
      base_amount: String(baseProductos.toFixed(2)),
      amount: propina,
    }] : [];

    /*  ⚠️ EL MONTO SALE DE SUMAR LAS LINEAS Y LOS RECARGOS, no de una
        columna. Asi no puede volver a descuadrar ni aunque manana
        aparezca otro concepto. Tomarlo de `total_final` fue justo el
        fallo del empaque.                                             */
    const totalFacturado = baseProductos + propina;

    /*  Y LA COMPROBACION QUE LO CIERRA: lo facturado tiene que ser igual
        a lo que pago el cliente. Si no cuadra, es que aparecio un
        concepto que nadie metio en la factura — que es exactamente lo
        que paso con el empaque. No se tumba la factura por esto: se
        anota, porque emitir por el valor correcto es lo que importa y
        aqui ya se calculo a partir de las lineas.                     */
    const loQuePago = Math.round(Number(pedido?.paid_amount) || 0);
    if (loQuePago > 0 && Math.abs(loQuePago - totalFacturado) > 1) {
      console.error(`[factura] DESCUADRE: se facturan ${totalFacturado} y el cliente pago ${loQuePago}`
        + ` | pedido ${pedido?.id} | empaque ${pedido?.packaging_fee} propina ${propina} descuento ${descuento}`);
    }

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
        amount: Number(totalFacturado.toFixed(2)),
      }],
      customer: comprador(pedido?.factura_cliente),
      /*  Que el proveedor se la mande al cliente. Solo si dio correo:
          decirle que envie sin destinatario no envia nada y ensucia la
          respuesta.                                                    */
      send_email: !!(pedido?.factura_cliente?.correo),
      items,
      /*  Va solo si hay: su nota dice que un array opcional, en cuanto
          lleva datos, se vuelve obligatorio — mandarlo vacio molesta.  */
      ...(recargos.length ? { allowance_charges: recargos } : {}),
    };
  },

  /*  ══ EL RANGO DE LAS NOTAS DE CRÉDITO ═══════════════════════════════
      Una nota de crédito NO sale del consecutivo de las facturas: tiene su
      propia numeración, y la API la exige por id (`numbering_range_id`).

      OJO CON ELEGIRLO: la cuenta de prueba tiene DOS rangos de Nota
      Crédito, los dos activos y sin vencer (`NC` y `CRTE`). No hay forma
      de saber por la forma cuál es el bueno — y hoy mismo ya me pasó con
      los rangos de factura, donde acerté por suerte porque coincidían.

      Así que: se filtra por documento activo y sin vencer, y si queda MÁS
      DE UNO se toma el primero pero se deja dicho en el log cuáles había.
      El id usado queda guardado en la respuesta de la nota, así que el día
      que salga por el consecutivo equivocado se puede ver por qué.       */
  async rangoNota() {
    const tok = await tokenFactus(c);
    const r = await fetch(`${c.url}/v2/numbering-ranges`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) {
      console.error("[nota] no se pudo pedir los rangos:", r.status);
      return null;
    }
    const d = await r.json().catch(() => null);
    const bruto = (d?.data?.data ?? d?.data ?? []) as Array<Record<string, unknown>>;
    const sirven = bruto.filter((x) =>
      String(x.document ?? "").toLowerCase().includes("cr")
      && x.is_active !== false && x.is_expired !== true && !x.deleted_at);
    if (!sirven.length) {
      console.error("[nota] esta cuenta no tiene rango de nota credito");
      return null;
    }
    if (sirven.length > 1) {
      console.warn("[nota] hay %d rangos de nota credito; se usa el primero:",
        sirven.length, sirven.map((x) => `${x.id}:${x.prefix}`).join(", "));
    }
    return { id: sirven[0].id, prefijo: String(sirven[0].prefix ?? "") };
  },

  /*  El cuerpo es EL MISMO de la factura —los mismos productos, el mismo
      cliente, el mismo valor— más las cuatro cosas que la convierten en
      nota: qué factura corrige, por qué, y con qué numeración.

      `correction_concept_code` 2 = «Anulación de factura electrónica».
      Los códigos válidos son del 1 al 6 (comprobado probándolos uno a uno
      contra la API; el 7 lo rechaza). Aquí solo se usa el 2: anular el
      pedido entero. Una devolución parcial es otra cosa y no se pide.   */
  async notaCredito(cuerpoFactura: Record<string, unknown>, numeroFactura: string,
                    rangoId: unknown, motivo: string) {
    const tok = await tokenFactus(c);
    const cuerpo = {
      ...cuerpoFactura,
      /*  Referencia PROPIA: si llevara la del pedido, Factus devolvería la
          factura ya emitida en vez de crear la nota.                    */
      reference_code: `${cuerpoFactura.reference_code}-NC`,
      bill_number: numeroFactura,
      correction_concept_code: "2",
      numbering_range_id: rangoId,
      observation: String(motivo || "").slice(0, 200),
    };
    delete (cuerpo as Record<string, unknown>).send_email;
    const r = await fetch(`${c.url}/v2/credit-notes/validate`, {
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

  /*  Le manda la factura al cliente y DICE si salio. La bandera
      `send_email` del cuerpo no sirve: se mando en true en cuatro
      facturas y las cuatro volvieron con false. Esto contesta.       */
  async enviarCorreo(numero: string, correo: string) {
    const tok = await tokenFactus(c);
    const r = await fetch(
      `${c.url}/v2/bills/${encodeURIComponent(numero)}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json",
                 Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ email: correo }),
    });
    /*  `fetch` no lanza con un 422: sin mirar `ok`, un correo que nunca
        salio quedaria anotado como enviado.                          */
    if (!r.ok) {
      const t = await r.text();
      console.error("[correo] no salio:", r.status, t.slice(0, 200));
      /*  El motivo se DEVUELVE, no solo se registra. Un "no se pudo
          enviar" sin motivo obliga a mirar los registros del servidor
          para algo que el gerente tiene que poder leer en su pantalla.
          Regla 7 del adaptador: un rechazo siempre se ve.            */
      let motivo = `HTTP ${r.status}`;
      try {
        const d = JSON.parse(t);
        const e = d?.data?.errors ?? d?.errors;
        const primero = e && Object.values(e)[0];
        motivo = (Array.isArray(primero) ? primero[0] : primero) || d?.message || motivo;
      } catch (_e) { /* si no es JSON, queda el codigo */ }
      return { ok: false, motivo: String(motivo) };
    }
    return { ok: true, motivo: null };
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
    /*  ⚠️ UNA NOTA TRAE TAMBIEN LA FACTURA QUE CORRIGE, bajo `bill`.
        Mirar `bill` primero — que es lo que hice — guarda la nota con el
        NUMERO DE LA FACTURA. No se ve: la nota queda emitida y bien en el
        proveedor, y en nuestra tabla con el numero equivocado.

        Lo caza `ux_factura_numero`, que rechaza el duplicado. Si ese
        indice no existiera, el dato se habria guardado mal y en silencio.

        Una nota se reconoce por su `cude` (el CUFE de las notas). Se mira
        eso, no la forma.                                                */
    const raiz = d?.data ?? {};
    const b = raiz.credit_note ?? (raiz.cude ? raiz : (raiz.bill ?? raiz));
    return {
      numero: b.number ?? null,
      /*  El codigo unico de una nota se llama CUDE, no CUFE — es el mismo
          concepto con otro nombre. Se guarda en la misma columna: la base
          exige que una fila `aceptada` lo tenga, y sin esto el INSERT de la
          nota reventaba con «No se pudo hablar con la base», que no dice
          nada. Comprobado emitiendo una de verdad.                      */
      cufe:   b.cufe ?? b.cude ?? null,
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

/*  ══ CERRAR LO QUE NO SE ARREGLA ESPERANDO ════════════════════
    El pedido no existe, lo anularon, no tiene productos, la sede se quedo
    sin cuenta: reintentar eso mil veces no lo arregla.

    Esto lo hacia SOLO la cola, y por eso una persona que le daba a
    "Intentar ahora" en el historial veia un aviso que decia "el pedido no
    tiene productos" mientras la tarjeta seguia diciendo "se reintenta
    sola" con otro motivo de hace rato. Dos verdades distintas en la misma
    pantalla, que es justo lo que pasa cuando la misma decision se escribe
    en dos sitios. Ahora se decide aqui, y sirve para los dos caminos.

    NO cierra si el restaurante APAGO la facturacion: eso no es un error,
    es una decision suya, y cuando la vuelva a encender la factura tiene
    que seguir esperando.                                               */
async function cerrarPendiente(order_id: string, motivo: string) {
  try {
    await db(
      `pos_facturas?order_id=eq.${order_id}&tipo=eq.factura&estado=eq.pendiente`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ estado: "rechazada", error: motivo, proximo_intento: null }),
      },
    );
  } catch (e) {
    //  Si esto falla NO se tumba la respuesta: lo peor que pasa es que la
    //  cola la recoja una vez mas y la cierre ella.
    console.error("[emitir] no se pudo cerrar la pendiente:", String(e).slice(0, 150));
  }
}

/*  ══ EMITIR — UNA sola vez, para la caja y para la cola ══════════
    La cola reintenta EXACTAMENTE lo mismo que hace la caja: los mismos
    candados, el mismo cuerpo, la misma idempotencia, el mismo correo.
    Escribirlo dos veces seria repetir el error de hoy — dos copias de la
    misma decision que se separan sin que nadie lo note.

    Lo unico que NO esta aqui es el permiso, porque es lo unico distinto:
      · la caja: el token de quien cobra, y la base decide si el pedido es
        suyo;
      · la cola: no hay nadie, y la fila salio de nuestra propia tabla.
    Y el REENVIO tampoco: es del manejador, no de emitir.              */
type ResultadoEmitir = {
  ok: boolean;
  factura?: unknown;
  numero?: unknown;
  error?: string;
  detalle?: unknown;
  ya_estaba?: boolean;
  sin_cuenta?: boolean;
  apagada?: boolean;
  no_existe?: boolean;
  anulado?: boolean;
};

/*  `desdeCola` distingue quien lo pide. Solo cambia una cosa — los
    intentos — pero es una cosa que importa: ver mas abajo.        */
async function emitirPedido(order_id: string, desdeCola = false): Promise<ResultadoEmitir> {
    // ── el pedido y sus renglones ────────────────────────────────────
    const pedidos = await db(
      `pos_orders?id=eq.${order_id}`
      + `&select=id,tenant_id,branch_id,total,total_final,paid_amount,packaging_fee,`
      + `tip_amount,discount_amount,`
      + `status,factura_cliente`);
    const pedido = pedidos?.[0];
    if (!pedido) {
      await cerrarPendiente(order_id, "El pedido no existe");
      return { ok: false, no_existe: true, error: "El pedido no existe" };
    }

    /*  ══ EL INTERRUPTOR DEL RESTAURANTE ══════════════════════════════
        Sergio: *"al desactivarla simplemente se corta cualquier flujo de
        datos"*. El corte va AQUI, en el servidor, no en la pantalla: un
        botón escondido en el navegador no corta nada — basta con llamar a
        la función desde otro sitio. Aquí no hay vuelta.

        Se lee de la tabla y no de las llaves, porque apagar no borra la
        conexión: se puede estar conectado y en pausa.                  */
    const cuentaSede = await db(
      `pos_facturacion_cuentas?branch_id=eq.${pedido.branch_id}&proveedor=eq.factus`
      + `&select=activo,emitiendo&limit=1`,
    ) as Array<{ activo?: boolean; emitiendo?: boolean }> | null;
    if (cuentaSede?.[0] && cuentaSede[0].emitiendo === false) {
      console.log("[cuenta] la sede", pedido.branch_id, "tiene la facturacion APAGADA");
      return { ok: false, apagada: true,
               error: "Este restaurante tiene apagada la facturación electrónica" };
    }

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
      await cerrarPendiente(order_id, "El restaurante no tiene conectada su cuenta de facturacion");
      return { ok: false, sin_cuenta: true,
               error: "Este restaurante todav\u00eda no tiene conectada su cuenta de facturaci\u00f3n electr\u00f3nica" };
    }

    const FACTUS = crearFactus({
      url:    llaves.url || URL_POR_DEFECTO,
      id:     llaves.client_id,
      secret: llaves.client_secret,
      user:   llaves.username,
      pass:   llaves.password,
    });

    if (pedido.status === "cancelled") {
      await cerrarPendiente(order_id, "Un pedido anulado no se factura");
      return { ok: false, anulado: true, error: "Un pedido anulado no se factura" };
    }

    /*  ── YA FACTURADO: SE DEVUELVE LA QUE HAY ──────────────────────
        Primera barrera de la idempotencia, antes de salir a internet. La
        segunda es el `reference_code` del proveedor.                  */
    const previas = await db(
      `pos_facturas?order_id=eq.${order_id}&tipo=eq.factura&estado=neq.anulada`
      + `&select=id,estado,numero,cufe,prefijo`);
    const previa = previas?.[0];
    if (previa && previa.estado === "aceptada") {
      return { ok: true, ya_estaba: true, factura: previa };
    }

    const renglones = await db(
      `pos_order_items?order_id=eq.${order_id}`
      + `&select=id,product_id,name,product_name,quantity,unit_price,product_price,`
      + `total,tax_pct,tax_base,tax_amount`);
    if (!renglones?.length) {
      await cerrarPendiente(order_id, "El pedido no tiene productos");
      return { ok: false, anulado: true, error: "El pedido no tiene productos" };
    }

    // ── se emite ─────────────────────────────────────────────────────
    const cuerpo = FACTUS.cuerpo(pedido, renglones, null);

    /*  ══ SIN INTERNET NO SE PIERDE LA FACTURA ════════════════════
        Sergio, sobre la cola: *"la factura queda en cola y se reintenta
        sola cuando regrese el Internet"*. Pues ese caso era justo el que
        NO llegaba a la cola.

        Si el proveedor no contesta, `fetch` revienta — y pedir el token
        revienta a proposito con un `throw`. Eso subia hasta el manejador,
        devolvia 500 y NO GUARDABA NADA: ni factura, ni fila, ni cita. La
        venta se quedaba sin factura y sin nadie que la volviera a
        intentar. La cola entera no servia para el unico caso para el que
        se hizo.

        Aqui el reventon se convierte en un rechazo normal y sigue por el
        camino de siempre: se guarda `pendiente` y se agenda. Lo que no se
        pudo preguntar y lo que contestaron que no son cosas distintas, y
        por eso el error guardado dice cual de las dos fue.            */
    const emitirSeguro = async () => {
      try {
        return await FACTUS.emitir(cuerpo);
      } catch (e) {
        console.error("[emitir] no se pudo hablar con el proveedor:", String(e).slice(0, 200));
        return {
          ok: false, status: 0,
          cuerpo: { message: `No se pudo hablar con el proveedor de facturacion: ${String(e).replace("Error: ", "").slice(0, 180)}` },
        } as Awaited<ReturnType<typeof FACTUS.emitir>>;
      }
    };

    let res = await emitirSeguro();

    /*  409 = quedo una a medio enviar. Se borra y se reintenta UNA vez: si
        vuelve a fallar, es otra cosa y repetir no la arregla.          */
    if (res.status === 409) {
      /*  Primero la nuestra: si esto es un reintento del MISMO pedido, la
          atascada es la suya y se quita sin salir a preguntar nada.     */
      try { await FACTUS.borrarPendiente(String(pedido.id)); } catch (e) {
        console.error("[emitir] no se pudo quitar la atascada:", String(e).slice(0, 150));
      }
      res = await emitirSeguro();

      /*  Sigue en 409 = la atascada es de OTRO pedido. Ahora si se le
          pregunta a Factus cual es. Este es el caso que dejaba al
          restaurante sin facturar.                                     */
      if (res.status === 409) {
        let quitadas = 0;
        try { quitadas = await destrabar(FACTUS, pedido.tenant_id); } catch (e) {
          console.error("[emitir] no se pudo destrabar:", String(e).slice(0, 150));
        }
        if (quitadas > 0) res = await emitirSeguro();
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
      /*  Si salio bien, se borra la cita de la cola. La cola no la iba a
          recoger igual (busca solo `pendiente`), pero dejar una fecha de
          reintento en una factura ya emitida es basura que confunde al
          que abra la tabla.                                            */
      ...(res.ok ? { proximo_intento: null } : {}),
      /*  Y si la esta reintentando UNA PERSONA desde el historial, la
          cuenta de intentos vuelve a cero. Una factura que ya se rindio a
          los 8 se quedaria rindiendose para siempre: el boton diria
          "intentar de nuevo" y no intentaria nada. Si alguien le da, es
          porque cambio algo — volvio el internet, corrigio los datos — y
          merece los 8 intentos otra vez. El reloj NO reinicia nada: para
          eso existe el rendirse.                                       */
      ...(previa && !desdeCola ? { intentos: 0 } : {}),
    };

    const guardada = await db(
      previa ? `pos_facturas?id=eq.${previa.id}` : "pos_facturas",
      {
        method: previa ? "PATCH" : "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(fila),
      },
    );

    /*  ══ Y SE LE MANDA AL CLIENTE ═══════════════════════════════════
        Solo si salio bien y solo si dio correo. Si el envio falla NO se
        tumba la factura: ya esta emitida y es valida. Se anota y se
        puede reenviar.                                               */
    const correoCliente = String(
      (pedido?.factura_cliente as Record<string, unknown>)?.correo ?? "").trim();
    if (res.ok && leido.numero && correoCliente) {
      try {
        const env = await FACTUS.enviarCorreo(String(leido.numero), correoCliente);
        if (env.ok) {
          await db(`pos_facturas?id=eq.${guardada?.[0]?.id}`, {
            method: "PATCH",
            body: JSON.stringify({ correo_enviado_at: new Date().toISOString() }),
          });
          console.log("[correo] enviada a", correoCliente);
        } else {
          /*  Se guarda POR QUE no salio, para que se lea en la pantalla
              y no haya que entrar a los registros.                    */
          await db(`pos_facturas?id=eq.${guardada?.[0]?.id}`, {
            method: "PATCH",
            body: JSON.stringify({ correo_error: env.motivo }),
          });
        }
      } catch (e) { console.error("[correo] fallo:", String(e).slice(0, 150)); }
    }

    if (!res.ok) {
      console.error("Factus rechazo:", res.status, JSON.stringify(res.cuerpo).slice(0, 600));

      /*  ══ Y QUEDA AGENDADA ═══════════════════════════════════════════
          `fn_factura_reintentar` sube los intentos, guarda el error y
          pone `proximo_intento` con espera que se dobla (1, 2, 4, 8…
          hasta 60 min), y a los 8 intentos se rinde y la marca
          `rechazada` para que alguien la mire.

          Existia desde el 3-sep y NADIE LA LLAMABA: la factura quedaba
          `pendiente` con `proximo_intento` en blanco, o sea que ni con
          un cron se habria recogido nunca. La cola estaba construida y
          desconectada.

          Si esto falla NO se tumba la respuesta: el rechazo ya quedo
          guardado, que es lo que no se puede perder.              */
      const idFactura = guardada?.[0]?.id;
      if (idFactura) {
        try {
          await db("rpc/fn_factura_reintentar", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ p_factura: idFactura, p_error: String(fila.error ?? "").slice(0, 400) }),
          });
        } catch (e) {
          console.error("[cola] no se pudo agendar el reintento:", String(e).slice(0, 150));
        }
      }

      return { ok: false, error: fila.error, detalle: res.cuerpo, factura: guardada?.[0], numero: null };
    }
    return { ok: true, factura: guardada?.[0], numero: leido.numero };
}

/*  ══ ANULAR UNA FACTURA — CON NOTA DE CRÉDITO ═══════════════════════════
    Una factura electrónica emitida NO SE BORRA. Ya está en la DIAN y a
    nombre de un NIT: la única forma legal de dejarla sin efecto es emitir
    una nota de crédito que la corrija. Por eso anular un pedido facturado
    no puede ser simplemente marcarlo `cancelled`, que es lo que hacía.

    La nota lleva lo MISMO que la factura —los mismos productos, el mismo
    cliente, el mismo valor— más qué factura corrige y por qué. Se reusa el
    cuerpo que arma `FACTUS.cuerpo`: si mañana cambia cómo se factura (un
    impuesto, el empaque), la nota cambia con él sola. Escribirlo aparte
    sería garantizar que en tres meses digan cosas distintas.

    ── LO QUE NO HACE ──────────────────────────────────────────────────
    No anula el pedido ni devuelve la plata: eso es de la caja y ya existe.
    Aquí solo se deja sin efecto el documento ante la DIAN.              */
type ResultadoNota = {
  ok: boolean;
  nota?: unknown;
  numero?: unknown;
  error?: string;
  detalle?: unknown;
  ya_estaba?: boolean;
  sin_factura?: boolean;
  sin_cuenta?: boolean;
  sin_rango?: boolean;
};

async function anularFactura(order_id: string, motivo: string): Promise<ResultadoNota> {
  const pedidos = await db(
    `pos_orders?id=eq.${order_id}`
    + `&select=id,tenant_id,branch_id,total,total_final,paid_amount,packaging_fee,`
    + `tip_amount,discount_amount,status,factura_cliente`);
  const pedido = pedidos?.[0];
  if (!pedido) return { ok: false, sin_factura: true, error: "El pedido no existe" };

  /*  ¿YA SE ANULÓ? Esto se pregunta PRIMERO, antes de buscar la factura.
      Al anular, la factura queda en `anulada`; si se buscara la factura
      antes, el segundo intento no encontraría ninguna aceptada y diría
      «este pedido no tiene factura que anular» — que es falso y además
      asusta: la tiene, y ya está anulada.

      Y lo importante: dos notas de crédito por la misma factura es un
      problema con la DIAN. Se contesta la que hay.                     */
  const notas = await db(
    `pos_facturas?order_id=eq.${order_id}&tipo=eq.nota_credito&estado=eq.aceptada`
    + `&select=id,numero,cufe,estado&limit=1`);
  if (notas?.[0]) return { ok: true, ya_estaba: true, nota: notas[0] };

  /*  La factura que se va a anular tiene que estar ACEPTADA. Una que no
      salió no hay que anularla: hay que dejar de reintentarla, que es
      otra cosa y ya la hace la cola.                                   */
  const previas = await db(
    `pos_facturas?order_id=eq.${order_id}&tipo=eq.factura`
    + `&select=id,estado,numero,cufe,prefijo,total&order=created_at.desc`);
  const factura = previas?.find((f: Record<string, unknown>) => f.estado === "aceptada");
  if (!factura) {
    return { ok: false, sin_factura: true,
             error: "Este pedido no tiene una factura emitida que anular" };
  }

  const llaves = await db("rpc/fn_facturacion_llaves", {
    method: "POST", body: JSON.stringify({ p_branch: pedido.branch_id }),
  }) as Record<string, string> | null;
  if (!llaves?.client_id) {
    return { ok: false, sin_cuenta: true,
             error: "Este restaurante no tiene conectada su cuenta de facturacion" };
  }
  const FACTUS = crearFactus({
    url: llaves.url || URL_POR_DEFECTO, id: llaves.client_id,
    secret: llaves.client_secret, user: llaves.username, pass: llaves.password,
  });

  const renglones = await db(
    `pos_order_items?order_id=eq.${order_id}`
    + `&select=id,product_id,name,product_name,quantity,unit_price,product_price,`
    + `total,tax_pct,tax_base,tax_amount`);
  if (!renglones?.length) {
    return { ok: false, error: "El pedido no tiene productos: la nota quedaria vacia" };
  }

  let rango: { id: unknown; prefijo: string } | null = null;
  try {
    rango = await FACTUS.rangoNota();
  } catch (e) {
    console.error("[nota] no se pudo pedir el rango:", String(e).slice(0, 150));
  }
  if (!rango) {
    return { ok: false, sin_rango: true,
             error: "El proveedor no tiene numeracion de notas credito para este restaurante" };
  }

  const cuerpo = FACTUS.cuerpo(pedido, renglones, null);
  let res;
  try {
    res = await FACTUS.notaCredito(cuerpo, String(factura.numero), rango.id, motivo);
  } catch (e) {
    /*  Igual que al emitir: que el proveedor no conteste no puede perder
        la anulacion. Se guarda como pendiente y queda el rastro.       */
    console.error("[nota] no se pudo hablar con el proveedor:", String(e).slice(0, 200));
    res = { ok: false, status: 0,
            cuerpo: { message: `No se pudo hablar con el proveedor: ${String(e).replace("Error: ", "").slice(0, 160)}` } };
  }

  const leido = FACTUS.leer(res.cuerpo);
  const fila = {
    tenant_id: pedido.tenant_id, branch_id: pedido.branch_id, order_id: pedido.id,
    tipo: "nota_credito",
    nota_de: factura.id,
    motivo: String(motivo || "").slice(0, 300),
    proveedor: FACTUS.nombre, proveedor_id: leido.id,
    numero: leido.numero, cufe: leido.cufe,
    total: Math.round(Number(factura.total) || 0),
    estado: res.ok && leido.validada ? "aceptada" : (res.ok ? "enviada" : "pendiente"),
    respuesta: res.cuerpo,
    error: res.ok ? null : (res.cuerpo?.message ?? `HTTP ${res.status}`),
    emitida_at: res.ok ? new Date().toISOString() : null,
  };
  const guardada = await db("pos_facturas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(fila),
  }) as Array<Record<string, unknown>> | null;

  if (!res.ok) {
    console.error("[nota] Factus rechazo:", res.status,
      JSON.stringify(res.cuerpo).slice(0, 600));
    return { ok: false, error: String(fila.error), detalle: res.cuerpo, nota: guardada?.[0] };
  }

  /*  Y la factura queda marcada como anulada. Se hace DESPUES de que la
      nota salio: marcarla antes dejaria una factura "anulada" sin nada que
      la anule si el proveedor rechaza.                                  */
  await db(`pos_facturas?id=eq.${factura.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado: "anulada" }),
  });

  console.log(`[nota] ${order_id}: ${factura.numero} anulada con ${leido.numero}`);
  return { ok: true, nota: guardada?.[0], numero: leido.numero };
}

/*  ══ LAS QUE NUNCA LLEGARON A PEDIRSE ═════════════════════════
    La cola sabe reintentar lo que fallo. Pero hay un caso que ni siquiera
    llegaba a fallar: la caja cobra, va a pedir la factura y ESA llamada se
    cae — se fue el internet un segundo, el navegador se cerro, la tablet
    se durmio. No hay fila, no hay error, no hay nada. Nadie sabe que ese
    pedido tenia que facturarse, y la cola no puede reintentar algo que no
    existe.

    Aqui se recogen: pedidos COBRADOS en los que el cliente PIDIO factura
    (`factura_cliente`) y que no tienen ninguna. Se les crea la fila y la
    cola los toma como a cualquier otro.

    Tres candados, y ninguno sobra:
      · solo donde el cliente la pidio — Sergio: se factura a quien la
        pide, no todo lo que se vende;
      · solo de las ultimas 24 horas — si un restaurante enciende la
        facturacion hoy, no se le van a emitir de golpe las ventas de
        meses pasados;
      · solo en sedes encendidas — el interruptor manda tambien aqui.  */
const HORAS_ATRAS_HUERFANOS = 24;

async function recogerHuerfanos(): Promise<number> {
  const sedes = await db(
    `pos_facturacion_cuentas?select=branch_id,tenant_id&proveedor=eq.factus`
    + `&activo=eq.true&emitiendo=eq.true`,
  ) as Array<{ branch_id: string; tenant_id: string }> | null;
  if (!sedes?.length) return 0;

  const desde = new Date(Date.now() - HORAS_ATRAS_HUERFANOS * 3600 * 1000).toISOString();
  const pedidos = await db(
    `pos_orders?select=id,tenant_id,branch_id`
    + `&branch_id=in.(${sedes.map((s) => s.branch_id).join(",")})`
    + `&status=in.(paid,completed)&factura_cliente=not.is.null`
    + `&created_at=gte.${desde}&limit=50`,
  ) as Array<{ id: string; tenant_id: string; branch_id: string }> | null;
  if (!pedidos?.length) return 0;

  /*  Se pregunta por TODAS las filas del pedido, sin filtrar por estado:
      una rechazada tambien cuenta como "ya se intento". Recogerla otra vez
      seria saltarse el rendirse a los 8 intentos por la puerta de atras. */
  const yaHay = await db(
    `pos_facturas?select=order_id&tipo=eq.factura`
    + `&order_id=in.(${pedidos.map((p) => p.id).join(",")})`,
  ) as Array<{ order_id: string }> | null;
  const tiene = new Set((yaHay ?? []).map((f) => String(f.order_id)));

  const faltan = pedidos.filter((p) => !tiene.has(String(p.id)));
  if (!faltan.length) return 0;

  await db("pos_facturas", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(faltan.map((p) => ({
      tenant_id: p.tenant_id, branch_id: p.branch_id, order_id: p.id,
      tipo: "factura", proveedor: "factus", estado: "pendiente", intentos: 0,
      proximo_intento: new Date().toISOString(),
      error: "La caja no alcanzo a pedir la factura; la recogio el barrido",
    }))),
  });
  console.log(`[cola] recogidas ${faltan.length} que nunca llegaron a pedirse`);
  return faltan.length;
}

/*  ══ RECORRER LA COLA ═════════════════════════════════
    Las facturas vencidas se reintentan por el MISMO camino de emitir, con
    las llaves del restaurante que corresponda. Aqui no se decide nada
    nuevo: solo se vuelve a intentar lo que ya se sabe que hay que hacer.

    EL TOPE POR CORRIDA no es prudencia: sin el, con el proveedor caido se
    intentarian cada 5 minutos TODAS las facturas atrasadas de TODOS los
    restaurantes a la vez. Con el tope, la cola avanza y no se atropella.

    NO SE TOCAN las que ya se rindieron (`rechazada` a los 8 intentos):
    esas esperan a que una persona las mire, que es justo lo que quiere
    decir rendirse.                                                     */
const COLA_POR_CORRIDA = 25;

async function correrCola(): Promise<Response> {
  /*  Primero se recogen las que nunca llegaron a pedirse, para que entren
      en ESTA corrida y no esperen cinco minutos mas.                   */
  let recogidas = 0;
  try {
    recogidas = await recogerHuerfanos();
  } catch (e) {
    console.error("[cola] no se pudo hacer el barrido:", String(e).slice(0, 160));
  }

  const ahora = new Date().toISOString();
  const pend = await db(
    `pos_facturas?estado=eq.pendiente&proximo_intento=lte.${ahora}`
    + `&select=id,order_id,branch_id,intentos&order=proximo_intento.asc&limit=${COLA_POR_CORRIDA}`,
  ) as Array<{ id: string; order_id: string; branch_id: string; intentos: number }> | null;

  if (!pend?.length) return json({ revisadas: 0, emitidas: 0, recogidas });

  let emitidas = 0, fallaron = 0, cerradas = 0;
  for (const f of pend) {
    try {
      /*  El interruptor del restaurante manda tambien aqui: si lo apago,
          la cola no puede seguir emitiendo por detras.                */
      const cuenta = await db(
        `pos_facturacion_cuentas?branch_id=eq.${f.branch_id}&proveedor=eq.factus&select=activo,emitiendo&limit=1`,
      ) as Array<{ activo?: boolean; emitiendo?: boolean }> | null;
      if (!cuenta?.[0] || cuenta[0].activo === false || cuenta[0].emitiendo === false) {
        console.log(`[cola] ${f.id}: la sede no esta emitiendo, se salta`);
        continue;
      }
      const r = await emitirPedido(f.order_id, true);
      if (r.ok) { emitidas++; console.log(`[cola] ${f.order_id} emitida: ${r.numero}`); }

      /*  ══ LO QUE NO SE ARREGLA ESPERANDO SE CIERRA AQUI ══════════════
          Emitir tiene salidas que no son "fallo de red": el pedido no
          existe, lo anularon, o el restaurante se quedo sin cuenta. Esas
          salen ANTES de guardar nada, asi que nadie las reagenda — y la
          fila se quedaria `pendiente` con la cita vencida PARA SIEMPRE.

          No es teoria: una factura falla, queda en cola, y despues anulan
          el pedido. Esa fila se recogeria en cada corrida, y como el tope
          es de 25, 25 fantasmas asi dejan sin sitio a las facturas de
          verdad. La cola entera se queda parada sin que nadie lo note.

          Se marcan `rechazada`, que es lo que ya significa "esto lo tiene
          que mirar una persona", y se les quita la cita.              */
      else if (r.no_existe || r.anulado || r.sin_cuenta) {
        /*  Ya la cerro `emitirPedido`, que es donde vive esa decision
            ahora. Aqui solo se cuenta para el resumen de la corrida.  */
        cerradas++;
        console.log(`[cola] ${f.order_id} cerrada sin reintentar: ${r.error}`);
      }
      else {
        fallaron++;
        console.log(`[cola] ${f.order_id} sigue fallando (intento ${(f.intentos || 0) + 1}): ${r.error}`);
      }
    } catch (e) {
      /*  Un reventon que no viene de emitir (la base, un dato raro) no
          reagenda nada por si mismo: la cita seguiria vencida y esta fila
          se recogeria en CADA corrida, sin doblar la espera nunca. Se
          agenda aqui a mano para que se comporte como cualquier fallo. */
      fallaron++;
      console.error(`[cola] ${f.order_id} reventó:`, String(e).slice(0, 160));
      try {
        await db("rpc/fn_factura_reintentar", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ p_factura: f.id, p_error: String(e).slice(0, 400) }),
        });
      } catch (e2) {
        console.error("[cola] tampoco se pudo agendar:", String(e2).slice(0, 120));
      }
    }
  }
  console.log(`[cola] corrida: ${pend.length} revisadas, ${emitidas} emitidas, ${fallaron} siguen pendientes, ${cerradas} cerradas`);
  return json({ revisadas: pend.length, emitidas, fallaron, cerradas, recogidas });
}

// ══════════════════════════════════════════════════════════════════════
//  LA FUNCION
// ══════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { order_id, revisar, conectar, reenviar, correo, cola, anular, motivo } = await req.json();
    /*  ══ LA COLA — la corre el reloj, no una persona ═══════════════════
        Va ANTES de exigir sesion porque el reloj no tiene ninguna. Se
        identifica con su propio secreto y no con la llave de servicio:
        aquella abre toda la base de todos los restaurantes.

        Se compara con `!==` sobre el secreto entero. Un secreto vacio no
        vale como llave: si el entorno no lo tiene, esta puerta queda
        cerrada en vez de abierta para todos.                          */
    if (cola === true) {
      const dado = req.headers.get("x-cola-secreto") || "";
      /*  Las dos causas se cuentan APARTE. Juntas dicen "no autorizado" y
          ya: no se distingue "el reloj mando mal el secreto" de "la
          funcion no tiene secreto ninguno", que son problemas distintos y
          se arreglan en sitios distintos. Es la misma leccion del 403 que
          me tuvo el dia entero: un fallo que no sabe decir cual es.    */
      if (!COLA_SECRETO) {
        console.error("[cola] esta funcion NO tiene COLA_SECRETO en el entorno");
        return json({ error: "No autorizado" }, 401);
      }
      if (dado !== COLA_SECRETO) {
        console.error(`[cola] secreto que no cuadra (llegaron ${dado.length} caracteres)`);
        return json({ error: "No autorizado" }, 401);
      }
      return await correrCola();
    }

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

    /*  ANULAR es su propio camino: no emite una factura, emite una NOTA
        que deja sin efecto la que ya salio.                           */
    if (anular === true) {
      const r = await anularFactura(String(order_id), String(motivo ?? ""));
      if (r.sin_factura) return json({ error: r.error, sin_factura: true }, 404);
      if (r.sin_cuenta)  return json({ error: r.error, sin_cuenta: true }, 409);
      if (r.sin_rango)   return json({ error: r.error, sin_rango: true }, 409);
      if (r.ya_estaba)   return json({ ya_estaba: true, nota: r.nota });
      if (!r.ok)         return json({ error: r.error, detalle: r.detalle, nota: r.nota }, 200);
      return json({ nota: r.nota, numero: r.numero });
    }

    /*  EL REENVIO es del manejador y no de emitir: no emite nada, solo
        vuelve a mandar por correo una factura que ya salio.           */
    if (reenviar === true) {
      const prev = await db(
        `pos_facturas?order_id=eq.${order_id}&tipo=eq.factura&estado=eq.aceptada`
        + `&select=id,numero,estado,cufe,prefijo&limit=1`,
      ) as Array<Record<string, unknown>> | null;
      const ped = await db(
        `pos_orders?id=eq.${order_id}&select=factura_cliente,branch_id&limit=1`,
      ) as Array<Record<string, unknown>> | null;
      const pv = prev?.[0];
      if (!pv?.numero) return json({ error: "Ese pedido no tiene factura emitida" }, 404);
      const dest = String(correo ?? "").trim()
        || String((ped?.[0]?.factura_cliente as Record<string, unknown>)?.correo ?? "").trim();
      if (!dest) return json({ error: "No hay a que correo mandarla" }, 400);
      const llavesR = await db("rpc/fn_facturacion_llaves", {
        method: "POST", body: JSON.stringify({ p_branch: ped?.[0]?.branch_id }),
      }) as Record<string, string> | null;
      if (!llavesR?.client_id) return json({ error: "Este restaurante no tiene cuenta conectada" }, 409);
      const F = crearFactus({
        url: llavesR.url || URL_POR_DEFECTO, id: llavesR.client_id,
        secret: llavesR.client_secret, user: llavesR.username, pass: llavesR.password,
      });
      const env = await F.enviarCorreo(String(pv.numero), dest);
      await db(`pos_facturas?id=eq.${pv.id}`, {
        method: "PATCH",
        body: JSON.stringify(env.ok
          ? { correo_enviado_at: new Date().toISOString(), correo_error: null }
          : { correo_error: env.motivo }),
      });
      return json({ ya_estaba: true, factura: pv, correo_enviado: env.ok, motivo: env.motivo, a: dest });
    }

    /*  Emitir es lo MISMO para la caja y para la cola, asi que vive en
        una sola funcion. Lo unico distinto es de donde sale el permiso, y
        eso ya se resolvio arriba.                                      */
    const r = await emitirPedido(String(order_id));
    if (r.sin_cuenta) return json({ error: r.error, sin_cuenta: true }, 409);
    if (r.apagada)    return json({ error: r.error, apagada: true }, 409);
    if (r.no_existe)  return json({ error: r.error }, 404);
    if (r.anulado)    return json({ error: r.error }, 400);
    if (r.ya_estaba)  return json({ ya_estaba: true, factura: r.factura });
    if (!r.ok)        return json({ error: r.error, detalle: r.detalle, factura: r.factura }, 200);
    return json({ factura: r.factura });
  } catch (e) {
    console.error("facturar:", String(e));
    return json({ error: String(e).replace("Error: ", "") }, 500);
  }
});
