/* tiktok-videos — trae los videos publicados de la cuenta de TikTok del local.
 *
 * POR QUÉ ESTO VIVE EN EL SERVIDOR
 * El permiso `video.list` YA lo tenemos concedido (se pide en el OAuth, en
 * chat-ia.js). Lo que no se puede es llamar a TikTok desde el navegador: el
 * token de acceso está en `chat_channels.meta` y bajarlo al navegador sería
 * regalárselo a cualquiera que abra las herramientas de desarrollo. Por eso la
 * pantalla llama aquí, y aquí se usa el token sin que salga nunca.
 *
 * QUÉ DEVUELVE
 *   { videos: [{ id, titulo, fecha, duracion, vistas, likes, comentarios,
 *                compartidos, cover, enlace }] }
 * o { error: "..." } con un texto que se le pueda enseñar al dueño.
 *
 * LO QUE ESTA FUNCIÓN NO HACE, Y POR QUÉ
 *   · No publica ni programa: eso es `video.publish` / `video.upload`, que no
 *     tenemos. Pedirlos exige auditoría de TikTok.
 *   · No trae seguidores ni totales de la cuenta: eso es `user.info.stats`,
 *     que tampoco tenemos.
 *   · No toca comentarios: TikTok no ofrece responderlos por API para cuentas
 *     normales.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/*  La anonima es para comprobar al que llama: con ella y su token, las
    politicas de la base deciden si esa sede es suya.                  */
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
/*  Para renovar la llave hace falta identificarse como la app.        */
const TK_KEY       = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const TK_SECRET    = Deno.env.get("TIKTOK_CLIENT_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* Los campos que pide la API de TikTok. `view_count` y compañía solo vienen si
   la cuenta y el permiso los permiten; si falta alguno, TikTok lo devuelve en
   cero en vez de fallar, así que no hace falta pedirlos por separado. */
const CAMPOS = [
  "id", "title", "video_description", "duration", "cover_image_url",
  "share_url", "create_time", "view_count", "like_count",
  "comment_count", "share_count",
].join(",");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* "hace 3 días", "24 ago" — lo que se lee de un vistazo. TikTok manda el
   momento en segundos, no en milisegundos: multiplicarlo se olvida fácil y
   deja todas las fechas en 1970. */
function fecha(segundos: number): string {
  if (!segundos) return "";
  const d = new Date(segundos * 1000);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
       + " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function duracion(seg: number): string {
  if (!seg) return "";
  const m = Math.floor(seg / 60), s = seg % 60;
  return m + ":" + String(s).padStart(2, "0");
}

/*  Deno.serve y no un `serve` importado de deno.land: ese import no lo
    carga el entorno de Supabase y la funcion no arranca (BOOT_ERROR).
    Las otras 20 funciones del proyecto usan todas Deno.serve.       */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { branch_id } = await req.json();
    if (!branch_id) return json({ error: "Falta la sede" }, 400);

    /*  ── QUIEN LLAMA TIENE QUE TENER ESA SEDE ───────────────────────
        Abajo se usa la llave de servicio, que se salta las politicas de la
        base. Sin esta comprobacion, cualquiera que adivinara un branch_id
        recibiria los datos de ese restaurante.

        Se comprueba preguntandole a la base CON EL TOKEN DE QUIEN LLAMA: si
        sus politicas le devuelven esa sede, tiene acceso. Asi las reglas de
        permisos viven en un solo sitio —la base— y no hay que repetirlas
        aqui ni mantenerlas sincronizadas.                              */
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sin sesion" }, 401);

    const suyo = await fetch(
      `${SUPABASE_URL}/rest/v1/branches?id=eq.${branch_id}&select=id`,
      { headers: { apikey: ANON_KEY, Authorization: auth } },
    );
    /*  `fetch` no lanza con un 401 ni con un 403: hay que mirar `ok`.   */
    if (!suyo.ok) {
      console.error("no se pudo comprobar la sede:", suyo.status, await suyo.text());
      return json({ error: "No se pudo comprobar la sesion" }, 401);
    }
    if (!((await suyo.json())?.length)) return json({ error: "Esa sede no es tuya" }, 403);

    // ── el canal de TikTok de esta sede ──────────────────────────────
    const chRes = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_channels?branch_id=eq.${branch_id}` +
      `&channel=eq.tiktok&select=meta,connected&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    /*  `fetch` NO lanza excepción con un 403: hay que mirar `res.ok` a mano o
        el fallo pasa por "no hay cuenta conectada".                       */
    if (!chRes.ok) {
      console.error("no se pudo leer chat_channels:", chRes.status, await chRes.text());
      return json({ error: "No se pudo leer la cuenta de TikTok" }, 500);
    }
    const filas = await chRes.json();
    const canal = filas?.[0];
    if (!canal || !canal.connected) return json({ error: "TikTok no está conectado" });

    const token = canal.meta?.access_token;
    if (!token) return json({ error: "La conexión de TikTok no tiene token" });

    // ── los videos ───────────────────────────────────────────────────
    async function pedirVideos(t: string) {
      const res = await fetch(
        `https://open.tiktokapis.com/v2/video/list/?fields=${CAMPOS}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({ max_count: 20 }),
        },
      );
      return { res, cuerpo: await res.json().catch(() => null) };
    }

    /*  ── LA LLAVE DE TIKTOK DURA 24 HORAS ────────────────────────────
        Sin renovarla, esto funcionaría el día que se conecta la cuenta y al
        siguiente volvería a cero pidiendo reconectar a mano. Todos los días.

        TikTok entrega un `refresh_token` que dura mucho más y sirve para
        pedir una llave nueva sin que nadie toque nada. Ya lo guardábamos
        desde el principio; no lo usaba nadie.                          */
    async function renovar(): Promise<string | null> {
      const refresh = canal.meta?.refresh_token;
      if (!refresh) return null;

      const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: TK_KEY, client_secret: TK_SECRET,
          grant_type: "refresh_token", refresh_token: refresh,
        }),
      });
      /*  `fetch` no lanza con un 400: hay que mirar `ok` a mano.        */
      if (!r.ok) {
        console.error("no se pudo renovar:", r.status, (await r.text()).slice(0, 300));
        return null;
      }
      const d = await r.json().catch(() => null);
      if (!d?.access_token) return null;

      /*  Se guarda YA, o la siguiente consulta volvería a renovar y gastaría
          una llamada de más cada vez.                                   */
      const meta = {
        ...canal.meta,
        access_token:  d.access_token,
        refresh_token: d.refresh_token ?? refresh,
        expires_at: new Date(Date.now() + (d.expires_in ?? 86400) * 1000).toISOString(),
      };
      const g = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_channels?branch_id=eq.${branch_id}&channel=eq.tiktok`,
        {
          method: "PATCH",
          headers: {
            apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json", Prefer: "return=minimal",
          },
          body: JSON.stringify({ meta }),
        },
      );
      if (!g.ok) console.error("llave renovada pero no guardada:", g.status, await g.text());
      return d.access_token;
    }

    let { res: tk, cuerpo: d } = await pedirVideos(token);
    let codigo = d?.error?.code && d.error.code !== "ok" ? d.error.code : (tk.ok ? null : tk.status);

    /*  Un solo reintento. Si el refresh tambien caduco, repetir no arregla
        nada y deja la pantalla colgada; ahi si toca reconectar a mano.  */
    if (codigo === "access_token_invalid" || tk.status === 401) {
      const nueva = await renovar();
      if (nueva) {
        ({ res: tk, cuerpo: d } = await pedirVideos(nueva));
        codigo = d?.error?.code && d.error.code !== "ok" ? d.error.code : (tk.ok ? null : tk.status);
      }
    }

    if (codigo) {
      console.error("TikTok respondió mal:", codigo, JSON.stringify(d).slice(0, 400));
      if (codigo === "access_token_invalid" || tk.status === 401) {
        return json({ error: "La conexión con TikTok venció: vuelve a conectarla" });
      }
      return json({ error: "TikTok no respondió bien (" + codigo + ")" });
    }

    const videos = (d?.data?.videos || []).map((v: Record<string, unknown>) => ({
      id:          v.id,
      titulo:      (v.title as string) || (v.video_description as string) || "",
      fecha:       fecha(Number(v.create_time)),
      /*  El momento en crudo, ademas del texto: la pantalla agrupa por
          mes y filtra por rango, y para eso una fecha ya formateada no
          sirve.                                                      */
      ts:          Number(v.create_time) || 0,
      duracion:    duracion(Number(v.duration)),
      vistas:      Number(v.view_count)    || 0,
      likes:       Number(v.like_count)    || 0,
      comentarios: Number(v.comment_count) || 0,
      compartidos: Number(v.share_count)   || 0,
      cover:       v.cover_image_url || "",
      enlace:      v.share_url || "",
    }));

    return json({ videos });
  } catch (e) {
    console.error("tiktok-videos:", String(e));
    return json({ error: "No se pudo consultar TikTok" }, 500);
  }
});
