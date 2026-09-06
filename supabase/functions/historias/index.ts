/* historias — vigila las menciones en historias y acredita los puntos.
 *
 * ── LA REGLA, QUE ES DE SERGIO ───────────────────────────────────────────
 * 5 puntos por mencionarnos en una historia, sin tope de cuantas. Pero se
 * acreditan cuando la historia CUMPLE SUS 24 HORAS: si la borra antes, no hay
 * puntos. "Tiene que dejar que se venza".
 *
 * ── COMO SE SABE SI LA BORRO ─────────────────────────────────────────────
 * Meta no avisa. Lo unico que hay es el enlace de la mencion, y se midio con
 * una historia de verdad: viva contesta 200, borrada contesta 404 en menos de
 * un minuto. Asi que basta con preguntarle al enlace.
 *
 * ── POR QUE TRES VECES Y NO UNA ──────────────────────────────────────────
 * Con una sola consulta a las 23 h, un 404 puede ser dos cosas muy distintas:
 * que la persona la borro, o que Meta le caduco el enlace sola. Y castigar a
 * alguien por lo segundo seria un error que nunca veriamos.
 *
 * Con tres consultas (1 h, 12 h, 23 h) queda el rastro. Si algun dia TODAS
 * las historias mueren a la misma edad, no es la gente: es el enlace. Es la
 * diferencia entre "no le dimos los puntos" y "no le dimos los puntos y no
 * sabemos por que".
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRETO = Deno.env.get("HISTORIAS_SECRETO") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

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
  /*  PostgREST contesta 201 con el cuerpo VACIO cuando se le pide
      `return=minimal`. Parsearlo como JSON revienta DESPUES de que la
      escritura ya paso — y entonces se reporta un fallo que no existio. */
  const texto = await r.text();
  return texto.trim() ? JSON.parse(texto) : null;
}

/*  ¿Sigue viva? Solo se pregunta el ESTADO: no se descarga la historia de
    nadie. Un error de red NO cuenta como borrada — se devuelve null y se
    vuelve a preguntar en la siguiente pasada. Confundir "no pude preguntar"
    con "no esta" es como se le quitan los puntos a quien no debe.        */
async function sigueViva(url: string): Promise<number | null> {
  try {
    const c = new AbortController();
    const reloj = setTimeout(() => c.abort(), 15000);
    const r = await fetch(url, { method: "HEAD", signal: c.signal,
                                 headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(reloj);
    return r.status;
  } catch (_e) {
    return null;
  }
}

type Fila = Record<string, unknown>;

const HORAS_VENCE = 24;
const REVISION_FINAL = 23;          // se decide una hora antes de que se venza
const HITOS = [1, 12, REVISION_FINAL];

const edadHoras = (f: Fila) =>
  (Date.now() - new Date(String(f.creado)).getTime()) / 3600000;

/*  ¿Que hito le toca? El mayor que ya paso y que todavia no se le hizo. Si no
    le toca ninguno, se deja quieta: preguntar de mas es gastar por gusto.  */
function hitoPendiente(f: Fila): number | null {
  const hechas = (Array.isArray(f.revisiones) ? f.revisiones : []) as Array<Record<string, unknown>>;
  const yaHechos = new Set(hechas.map((r) => Number(r.hito)));
  const edad = edadHoras(f);
  let toca: number | null = null;
  for (const h of HITOS) if (edad >= h && !yaHechos.has(h)) toca = h;
  return toca;
}

async function acreditar(f: Fila): Promise<string> {
  /*  Los puntos van al TELEFONO, no a la cuenta de Instagram. Si todavia no
      dio su numero, la historia NO se pierde: queda esperando, y el dia que
      lo de se le acreditan. Descartarla aqui seria castigarlo por no haber
      contestado a tiempo.                                                 */
  if (!f.cliente_id && !f.telefono) {
    await db(`pos_historias?id=eq.${f.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        estado: "sin_cliente",
        nota: "La historia cumplio sus 24 h, pero todavia no sabemos su celular",
      }),
    });
    return "sin_cliente";
  }

  let tel = String(f.telefono || "");
  if (!tel && f.cliente_id) {
    const c = await db(`pos_clientes?id=eq.${f.cliente_id}&select=telefono&limit=1`) as Fila[] | null;
    tel = String(c?.[0]?.telefono || "");
  }
  if (!tel) {
    await db(`pos_historias?id=eq.${f.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "sin_cliente", nota: "La ficha del cliente no tiene celular" }),
    });
    return "sin_cliente";
  }

  await db("rpc/fn_puntos_regalar", {
    method: "POST",
    body: JSON.stringify({
      p_tenant: f.tenant_id, p_branch: f.branch_id || null,
      p_telefono: tel, p_puntos: Number(f.puntos) || 5,
      p_detalle: "Mencion en historia de " + String(f.red || "Instagram"),
      p_quien: "sistema",
    }),
  });
  await db(`pos_historias?id=eq.${f.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado: "acreditada", telefono: tel, acreditada_at: new Date().toISOString() }),
  });
  return "acreditada";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    /*  La puerta. El reloj de la base manda el secreto; sin el, cualquiera
        podria disparar la acreditacion desde fuera.                       */
    const cuerpo = await req.json().catch(() => ({}));
    if (SECRETO && String(cuerpo.secreto || "") !== SECRETO) {
      return json({ error: "no autorizado" }, 401);
    }

    const filas = await db(
      "pos_historias?estado=eq.vigilando&select=*&order=creado.asc&limit=100",
    ) as Fila[] | null;
    if (!filas) return json({ ok: false, error: "no se pudo leer pos_historias" }, 500);

    const hecho = { revisadas: 0, acreditadas: 0, borradas: 0, sin_cliente: 0, esperando: 0 };

    for (const f of filas) {
      const hito = hitoPendiente(f);
      const edad = edadHoras(f);

      /*  Sin enlace no se puede comprobar nada. Antes que castigar por algo
          nuestro, se acredita al cumplir las 24 h.                        */
      if (!f.media_url) {
        if (edad >= HORAS_VENCE) {
          const r = await acreditar({ ...f, nota: "sin enlace que revisar" });
          if (r === "acreditada") hecho.acreditadas++; else hecho.sin_cliente++;
        } else hecho.esperando++;
        continue;
      }

      if (hito === null) { hecho.esperando++; continue; }

      const codigo = await sigueViva(String(f.media_url));
      hecho.revisadas++;

      /*  Ni internet ni Meta caidos cuentan como "la borro". Se reintenta en
          la siguiente pasada, sin anotar el hito.                          */
      if (codigo === null) { hecho.esperando++; continue; }

      const revisiones = (Array.isArray(f.revisiones) ? f.revisiones : []) as unknown[];
      revisiones.push({ hito, cuando: new Date().toISOString(),
                        edad_h: Math.round(edad * 10) / 10, codigo });

      if (codigo === 200) {
        if (hito >= REVISION_FINAL) {
          await db(`pos_historias?id=eq.${f.id}`, {
            method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ revisiones }),
          });
          const r = await acreditar(f);
          if (r === "acreditada") hecho.acreditadas++; else hecho.sin_cliente++;
        } else {
          await db(`pos_historias?id=eq.${f.id}`, {
            method: "PATCH", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ revisiones }),
          });
          hecho.esperando++;
        }
        continue;
      }

      /*  Muerta. Aqui es donde el RELOJ decide, que fue la idea de Sergio:
          si murio antes de cumplir las 24 h, la borro y no hay puntos. Si
          ya las habia cumplido, se vencio sola y se los gano.             */
      const laBorro = edad < HORAS_VENCE;
      await db(`pos_historias?id=eq.${f.id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          revisiones,
          ...(laBorro ? {
            estado: "borrada",
            nota: "El enlace murio a las " + (Math.round(edad * 10) / 10) + " h, antes de las 24",
          } : {}),
        }),
      });
      if (laBorro) { hecho.borradas++; continue; }
      const r = await acreditar(f);
      if (r === "acreditada") hecho.acreditadas++; else hecho.sin_cliente++;
    }

    return json({ ok: true, ...hecho, miradas: filas.length });
  } catch (e) {
    console.error("historias:", String(e));
    return json({ ok: false, error: String(e).replace("Error: ", "") }, 500);
  }
});
