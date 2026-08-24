const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_KEY      = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const CLIENT_SECRET   = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
const REDIRECT_URI    = "https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/tiktok-oauth-callback";
const CHAT_IA_URL     = "https://elparchefood.github.io/restaurant-pos/chat-ia.html";

async function supabaseGet(table: string, filter: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&limit=1`, {
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
  });
  return res.json();
}

async function supabaseUpsert(table: string, data: Record<string, unknown>, onConflict: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(data),
  });
  return res;
}

Deno.serve(async (req: Request) => {
  const url      = new URL(req.url);
  const code     = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
  const state    = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  if (errParam) return Response.redirect(`${CHAT_IA_URL}?channel=tiktok&error=${encodeURIComponent(errParam)}`);
  if (!code || !state) return Response.redirect(`${CHAT_IA_URL}?channel=tiktok&error=missing_params`);

  // 1. Exchange code → token (Open Platform v2)
  const tokenRes  = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: CLIENT_KEY, client_secret: CLIENT_SECRET,
      code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI,
    }),
  });
  const tokenData = await tokenRes.json();
  console.log("token:", JSON.stringify(tokenData));

  let { access_token, refresh_token, open_id, scope, expires_in } = tokenData;

  // Fallback: Business API token endpoint
  if (!access_token) {
    const bizRes  = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: CLIENT_KEY, secret: CLIENT_SECRET, auth_code: code, grant_type: "authorization_code" }),
    });
    const bizData = await bizRes.json();
    console.log("biz token:", JSON.stringify(bizData));
    access_token  = bizData?.data?.access_token;
    refresh_token = bizData?.data?.refresh_token;
    open_id       = bizData?.data?.open_id ?? bizData?.data?.advertiser_id;
    scope         = bizData?.data?.scope;
    expires_in    = bizData?.data?.expires_in ?? 86400;
  }

  if (!access_token) return Response.redirect(`${CHAT_IA_URL}?channel=tiktok&error=token_failed`);

  // 2. Get user info
  let displayName = "TikTok"; let handle = open_id ?? "unknown";
  try {
    const ud = await (await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username",
      { headers: { Authorization: `Bearer ${access_token}` } })).json();
    displayName = ud?.data?.user?.display_name ?? displayName;
    handle      = ud?.data?.user?.username ?? handle;
  } catch (_) { /* non-critical */ }

  // 3. Get tenant_id from branches
  const branches = await supabaseGet("branches", `id=eq.${state}&select=tenant_id`);
  if (!branches?.length) return Response.redirect(`${CHAT_IA_URL}?channel=tiktok&error=branch_not_found`);
  const tenant_id = branches[0].tenant_id;

  // 4. Upsert chat_channels
  const expiresAt = new Date(Date.now() + (expires_in ?? 86400) * 1000).toISOString();
  await supabaseUpsert("chat_channels", {
    tenant_id, branch_id: state, channel: "tiktok",
    display_name: displayName,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    connected: true,
    meta: { access_token, refresh_token, open_id, scope, expires_at: expiresAt },
  }, "branch_id,channel");

  return Response.redirect(`${CHAT_IA_URL}?channel=tiktok&connected=1`);
});
