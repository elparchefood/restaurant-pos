/* tarjeta — comprueba que un toque de tarjeta es de verdad.
 *
 * ── QUE LLEGA AQUI ───────────────────────────────────────────────────────
 * Cuando alguien acerca su tarjeta al celular, el chip abre una direccion y
 * le mete tres cosas que el mismo calcula:
 *
 *     .../elparchefood/?u=<numero>&c=<contador>&m=<firma>
 *
 * Esta funcion dice si ese toque es autentico y de quien es la tarjeta.
 *
 * ── POR QUE NO BASTA CON MIRAR EL NUMERO ─────────────────────────────────
 * El numero de la tarjeta se puede copiar: va a la vista en la direccion.
 * Lo que no se puede falsificar es la FIRMA, que la tarjeta calcula con una
 * clave AES que nunca sale del chip y que cambia en cada toque.
 *
 * ── Y POR QUE TAMPOCO BASTA CON LA FIRMA ─────────────────────────────────
 * Una direccion completa que alguien vio antes —una foto, un historial, un
 * mensaje reenviado— lleva una firma que ES valida. Se podria repetir.
 *
 * Lo que lo impide es el CONTADOR: la tarjeta lo sube sola en cada toque y
 * nunca lo baja. Aqui se exige que sea MAYOR que el ultimo visto. Un codigo
 * repetido llega con un contador viejo y se rechaza.
 *
 * Sin esa comprobacion, verificar la firma da una falsa sensacion de
 * seguridad — que es peor que no verificar nada.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    console.error("base:", ruta.split("?")[0], r.status, t.slice(0, 200));
    throw new Error(`La base rechazo ${ruta.split("?")[0]} (${r.status})`);
  }
  const texto = await r.text();
  return texto.trim() ? JSON.parse(texto) : null;
}

// ── AES y CMAC ────────────────────────────────────────────────────────────
//  Deno trae AES pero no CMAC, asi que se arma con un cifrado de un bloque.
async function aesBloque(clave: Uint8Array, bloque: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", clave, { name: "AES-CBC" }, false, ["encrypt"]);
  const iv = new Uint8Array(16);
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, k, bloque));
  return out.slice(0, bloque.length);   // se quita el relleno que anade CBC
}
function correr1(b: Uint8Array): Uint8Array {
  const o = new Uint8Array(b.length);
  let acarreo = 0;
  for (let i = b.length - 1; i >= 0; i--) { o[i] = ((b[i] << 1) & 0xFF) | acarreo; acarreo = (b[i] >> 7) & 1; }
  return o;
}
async function cmac(clave: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const cero = new Uint8Array(16);
  const L = await aesBloque(clave, cero);
  const K1 = correr1(L); if (L[0] & 0x80) K1[15] ^= 0x87;
  const K2 = correr1(K1); if (K1[0] & 0x80) K2[15] ^= 0x87;

  const completo = msg.length > 0 && msg.length % 16 === 0;
  const n = Math.max(1, Math.ceil(msg.length / 16));
  const b = new Uint8Array(n * 16);
  b.set(msg);
  if (!completo) b[msg.length] = 0x80;
  const k = completo ? K1 : K2;
  for (let i = 0; i < 16; i++) b[(n - 1) * 16 + i] ^= k[i];
  return await aesBloque(clave, b).then((x) => x.slice(x.length - 16));
}
const deHex = (s: string) =>
  new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const aHex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { uid, ctr, cmac: firma, slug } = await req.json();
    if (!uid || !ctr || !firma || !slug) {
      return json({ ok: false, error: "Falta algun dato del toque" }, 400);
    }

    /*  La pagina del cliente se identifica por su `slug` — es lo unico que
        conoce de si misma. El tenant se resuelve aqui: pedirselo a ella
        seria pedirle un dato que no tiene.                              */
    const negocios = await db(
      `tenants?slug=eq.${encodeURIComponent(String(slug))}&select=id&limit=1`,
    ) as Array<{ id: string }> | null;
    const tenant_id = negocios?.[0]?.id;
    if (!tenant_id) return json({ ok: false, error: "No existe ese restaurante" }, 404);
    /*  Formato antes que nada: si no cuadra ni la forma, no vale la pena
        salir a la base ni ponerse a cifrar.                             */
    if (!/^[0-9A-Fa-f]{14}$/.test(uid) || !/^[0-9A-Fa-f]{6}$/.test(ctr)
        || !/^[0-9A-Fa-f]{16}$/.test(firma)) {
      return json({ ok: false, error: "El toque no tiene la forma que debe" }, 400);
    }

    /*  La clave del restaurante vive en el Vault. Nunca sale de aqui: se usa
        para calcular y se descarta.                                      */
    const sec = await db("rpc/fn_nfc_clave", {
      method: "POST", body: JSON.stringify({ p_tenant: tenant_id }),
    }) as string | null;
    if (!sec) {
      console.error("[tarjeta] el tenant", tenant_id, "no tiene clave guardada");
      return json({ ok: false, error: "Este restaurante no tiene tarjetas configuradas" }, 409);
    }
    const clave = deHex(sec);

    // ── la firma ──────────────────────────────────────────────────────────
    //  La tarjeta firma con una clave de un solo uso que ella deriva de la
    //  suya mezclando el numero y el contador. Por eso cambia cada vez.
    const c = deHex(ctr);
    const sv = new Uint8Array([
      0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80,
      ...deHex(uid),
      c[2], c[1], c[0],            // el contador va con los bytes al reves
    ]);
    const claveDelToque = await cmac(clave, sv);
    const firmado = new TextEncoder().encode(`${uid.toUpperCase()}&c=${ctr.toUpperCase()}&m=`);
    const completo = await cmac(claveDelToque, firmado);
    //  De los 16 bytes que salen, la tarjeta manda solo los impares.
    const esperada = aHex(new Uint8Array([...Array(8)].map((_, i) => completo[i * 2 + 1])));

    if (esperada !== firma.toUpperCase()) {
      console.warn("[tarjeta] firma que no cuadra para", uid);
      return json({ ok: false, error: "Esta tarjeta no es autentica" }, 200);
    }

    // ── el contador ───────────────────────────────────────────────────────
    const nCtr = parseInt(ctr, 16);
    const filas = await db(
      `pos_tarjetas?tenant_id=eq.${tenant_id}&uid=eq.${uid.toUpperCase()}`
      + `&select=id,uid,telefono,activa,ultimo_ctr&limit=1`,
    ) as Array<Record<string, unknown>> | null;
    const t = filas?.[0];

    if (t && Number(t.ultimo_ctr) >= nCtr) {
      /*  Un contador que ya se vio: alguien esta repitiendo una direccion
          vieja. La firma era valida, y aun asi NO se deja pasar.        */
      console.warn("[tarjeta] contador repetido", uid, nCtr, "<=", t.ultimo_ctr);
      return json({ ok: false, repetido: true,
                    error: "Ese codigo ya se uso. Vuelve a acercar la tarjeta." }, 200);
    }

    if (t) {
      if (t.activa === false) {
        return json({ ok: false, bloqueada: true, error: "Esta tarjeta esta bloqueada" }, 200);
      }
      await db(`pos_tarjetas?id=eq.${t.id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ultimo_ctr: nCtr, ultimo_uso: new Date().toISOString() }),
      });
    } else {
      /*  PRIMER TOQUE DE UNA TARJETA QUE NO ES DE NADIE. Se le crea la ficha
          YA, sin dueno.

          No es un detalle: el contador vive en la ficha, asi que sin ficha
          no hay con que comparar y un toque repetido pasaba como bueno.
          Comprobado — el mismo toque, mandado dos veces, entraba las dos.
          Desde aqui queda vigilada aunque nadie la haya reclamado.       */
      await db("pos_tarjetas", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          tenant_id, uid: uid.toUpperCase(), telefono: null,
          ultimo_ctr: nCtr, ultimo_uso: new Date().toISOString(),
        }),
      });
    }

    /*  Una tarjeta AUTENTICA que todavia no es de nadie es lo normal: son
        las que se entregan sin asignar, y el cliente se la queda al
        registrarse. No es un error.                                     */
    return json({
      ok: true,
      uid: uid.toUpperCase(),
      ctr: nCtr,
      asignada: !!(t && t.telefono),
      telefono: (t?.telefono as string) ?? null,
    });
  } catch (e) {
    console.error("tarjeta:", String(e));
    return json({ ok: false, error: String(e).replace("Error: ", "") }, 500);
  }
});
