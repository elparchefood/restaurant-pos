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
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { branch_id } = await req.json();
    if (!branch_id) return json({ error: "Falta la sede" }, 400);

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
    const tk = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${CAMPOS}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 20 }),
      },
    );
    const d = await tk.json().catch(() => null);

    if (!tk.ok || d?.error?.code && d.error.code !== "ok") {
      const codigo = d?.error?.code || tk.status;
      console.error("TikTok respondió mal:", codigo, JSON.stringify(d).slice(0, 400));
      /*  El token de TikTok vence a las 24 h y se renueva con el refresh. Si
          está vencido conviene decirlo con esas palabras, que es accionable:
          el dueño vuelve a conectar y ya.                                 */
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
