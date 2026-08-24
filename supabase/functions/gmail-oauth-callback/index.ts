/* gmail-oauth-callback — la vuelta desde Google al conectar un correo.
 *
 * ⚠️ ESTE ARCHIVO NO ESTABA EN EL REPOSITORIO. Vivía solo en el servidor. Se
 * recuperó con el endpoint `/body` de la API, que TRUNCA los primeros
 * caracteres de la línea 1 (llegó "t SUPABASE_URL" en vez de "const
 * SUPABASE_URL"): se reconstruyó a mano antes de volver a subirlo. Es la misma
 * trampa documentada en la memoria del proyecto — si alguien vuelve a bajar una
 * función con `/body`, que revise la primera línea antes de desplegar.
 *
 * ── DOS DESTINOS, UNO SOLO DE CÓDIGO ─────────────────────────────────────
 * `state` dice a quién se le está conectando el correo:
 *   · un id de sucursal  → es el Gmail de UN RESTAURANTE, va a `ia_config`
 *   · "plataforma"       → es el Gmail de COBRA POS, va a `plataforma_correo`
 *
 * Sergio, 24-ago-2026: *"una cosa es la cuenta donde pagan los clientes del
 * restaurante y otra muy distinta donde pagan los clientes de Cobra... si yo
 * quiero conecto el mismo, pero si yo quiero conecto otro"*. Hoy pueden ser el
 * mismo correo; eso no los vuelve el mismo dato.
 */
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const REDIRECT_URI  = "https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/gmail-oauth-callback";
const BASE          = "https://elparchefood.github.io/restaurant-pos";
const FRONTEND_URL  = `${BASE}/configuracion.html`;
const CONSOLA_URL   = `${BASE}/admin-reg.html`;

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");   // branch_id  |  "plataforma"
  const error = url.searchParams.get("error");

  const esPlataforma = state === "plataforma";
  /* A dónde se devuelve a la persona. Mandarla siempre a Configuración dejaría
     a Sergio saliendo de la consola sin entender por qué. */
  const volver = esPlataforma ? CONSOLA_URL : FRONTEND_URL;

  if (error || !code || !state) {
    return Response.redirect(
      `${volver}?gmail=error&msg=${encodeURIComponent(error || "missing_params")}`, 302);
  }

  // 1. Cambiar el código por los permisos
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    "authorization_code",
    }),
  });

  const tokens = await tokenRes.json() as Record<string, string>;
  if (!tokens.refresh_token) {
    /* Google NO manda `refresh_token` si la cuenta ya autorizó antes y no se
       pide `prompt=consent`. Sin él no se puede volver a entrar mañana, así
       que se trata como un fallo en vez de guardar una conexión que dura una
       hora y luego se cae sin explicación. */
    console.error("sin refresh_token:", JSON.stringify(tokens));
    return Response.redirect(`${volver}?gmail=error&msg=no_refresh_token`, 302);
  }

  // 2. De qué cuenta se trata
  let gmailEmail = "";
  try {
    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { "Authorization": `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as Record<string, string>;
    gmailEmail = profile.emailAddress || "";
  } catch (_) { /* el correo es para mostrarlo; sin el, la conexion sirve igual */ }

  const H = {
    "apikey":        SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
  };

  // 3. Guardarlo donde corresponda
  if (esPlataforma) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/plataforma_correo?id=eq.1`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({
        gmail_refresh_token: tokens.refresh_token,
        gmail_email:         gmailEmail,
        connected_at:        new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      console.error("no se guardo el correo de plataforma:", await r.text());
      return Response.redirect(`${volver}?gmail=error&msg=no_guardado`, 302);
    }
  } else {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ia_config?branch_id=eq.${state}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({
        gmail_refresh_token: tokens.refresh_token,
        gmail_email:         gmailEmail,
        gmail_connected_at:  new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      console.error("no se guardo el correo del restaurante:", await r.text());
      return Response.redirect(`${volver}?gmail=error&msg=no_guardado`, 302);
    }
  }

  return Response.redirect(
    `${volver}?gmail=ok&email=${encodeURIComponent(gmailEmail)}`, 302);
});
