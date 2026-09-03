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
const FACTUS_URL    = Deno.env.get("FACTUS_URL") ?? "https://api-sandbox.factus.com.co";
const FACTUS_ID     = Deno.env.get("FACTUS_CLIENT_ID")!;
const FACTUS_SECRET = Deno.env.get("FACTUS_CLIENT_SECRET")!;
const FACTUS_USER   = Deno.env.get("FACTUS_USERNAME")!;
const FACTUS_PASS   = Deno.env.get("FACTUS_PASSWORD")!;

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
let _token: { valor: string; vence: number } | null = null;

async function tokenFactus(): Promise<string> {
  if (_token && Date.now() < _token.vence) return _token.valor;

  const cuerpo = new FormData();
  cuerpo.append("grant_type", "password");
  cuerpo.append("client_id", FACTUS_ID);
  cuerpo.append("client_secret", FACTUS_SECRET);
  cuerpo.append("username", FACTUS_USER);
  cuerpo.append("password", FACTUS_PASS);

  const r = await fetch(`${FACTUS_URL}/oauth/token`, {
    method: "POST", headers: { Accept: "application/json" }, body: cuerpo,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.access_token) {
    console.error("Factus no dio token:", r.status, JSON.stringify(d).slice(0, 300));
    throw new Error("No se pudo entrar al proveedor de facturacion");
  }
  _token = { valor: d.access_token, vence: Date.now() + (d.expires_in - 300) * 1000 };
  return _token.valor;
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

const FACTUS = {
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
    const tok = await tokenFactus();
    const r = await fetch(`${FACTUS_URL}/v2/bills/validate`, {
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
    const tok = await tokenFactus();
    const r = await fetch(`${FACTUS_URL}/v2/bills/${encodeURIComponent(referencia)}`, {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    return r.ok;
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

// ══════════════════════════════════════════════════════════════════════
//  LA FUNCION
// ══════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "Falta el pedido" }, 400);

    /*  ── QUIEN LLAMA TIENE QUE PODER VER ESE PEDIDO ─────────────────
        Abajo se usa la llave de servicio, que se salta las politicas de la
        base. Se comprueba preguntandole a la base CON EL TOKEN DE QUIEN
        LLAMA: si sus politicas le devuelven el pedido, es suyo. Asi las
        reglas de permisos viven en un solo sitio.                      */
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sin sesion" }, 401);

    const suyo = await fetch(
      `${SUPABASE_URL}/rest/v1/pos_orders?id=eq.${order_id}&select=id`,
      { headers: { apikey: ANON_KEY, Authorization: auth } },
    );
    if (!suyo.ok) return json({ error: "No se pudo comprobar la sesion" }, 401);
    if (!((await suyo.json())?.length)) return json({ error: "Ese pedido no es tuyo" }, 403);

    // ── el pedido y sus renglones ────────────────────────────────────
    const pedidos = await db(
      `pos_orders?id=eq.${order_id}&select=id,tenant_id,branch_id,total,total_final,status`);
    const pedido = pedidos?.[0];
    if (!pedido) return json({ error: "El pedido no existe" }, 404);
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
      await FACTUS.borrarPendiente(String(pedido.id));
      res = await FACTUS.emitir(cuerpo);
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
