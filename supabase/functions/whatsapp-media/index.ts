import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    if (!accessToken) throw new Error("WhatsApp access token is not configured");

    const body = await req.json();
    const mediaId = String(body?.media_id || "").trim();
    if (!mediaId || !/^[A-Za-z0-9_-]+$/.test(mediaId)) return json({ error: "A valid WhatsApp media ID is required" }, 400);

    const infoResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = await infoResponse.json();
    if (!infoResponse.ok || !info?.url) {
      console.error("WhatsApp media metadata error", info);
      return json({ error: info?.error?.message || "WhatsApp media is no longer available" }, infoResponse.status || 502);
    }

    const mediaResponse = await fetch(String(info.url), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaResponse.ok) {
      const detail = await mediaResponse.text().catch(() => "");
      console.error("WhatsApp media download error", mediaResponse.status, detail);
      return json({ error: "Unable to download this WhatsApp media. It may have expired." }, mediaResponse.status);
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", mediaResponse.headers.get("content-type") || info?.mime_type || "application/octet-stream");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", "inline");
    return new Response(mediaResponse.body, { status: 200, headers });
  } catch (error) {
    console.error("WhatsApp media proxy error", error);
    return json({ error: error instanceof Error ? error.message : "Unable to retrieve WhatsApp media" }, 500);
  }
});
