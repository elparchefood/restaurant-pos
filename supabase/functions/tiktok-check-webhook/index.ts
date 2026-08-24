Deno.serve(async () => {
  const appId   = Deno.env.get("TIKTOK_CLIENT_KEY")!;
  const secret  = Deno.env.get("TIKTOK_CLIENT_SECRET")!;

  const res = await fetch(`https://business-api.tiktok.com/open_api/v1.3/business/webhook/?app_id=${appId}&secret=${encodeURIComponent(secret)}`, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
});
