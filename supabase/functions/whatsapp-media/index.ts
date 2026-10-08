// Self-contained for Supabase Dashboard deployment. Edge Function: whatsapp-media (ERP 2.15.24: also serves Samara's stored copies; 2.15.94: Food Management in-charge can open vendor files).
import { createClient } from "jsr:@supabase/supabase-js@2";

async function requireWhatsAppUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) throw new Error("Authentication required");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new Error("Invalid ERP session");
  const { data: profile, error: profileError } = await db.from("duty_profiles").select("id,role,is_active,active").or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
  // ERP 2.15.94: any active account; wa_food_guard (below) decides which files each person may open
  // (Admin / Manager as before; the Food Management in-charge, e.g. STD, only food-vendor files).
  if (profileError || !profile || !(profile.is_active ?? profile.active ?? false)) throw new Error("WhatsApp access requires an active ERP account");
  return { db, user, profile };
}
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

  let caller;
  try { caller = await requireWhatsAppUser(req); }
  catch (_) { return new Response(JSON.stringify({ error: "An active ERP session is required." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
  try {
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    if (!accessToken) throw new Error("WhatsApp access token is not configured");

    const body = await req.json();
    const mediaId = String(body?.media_id || "").trim();

    // 2.15.24: Samara's own stored copy (photos / PDFs sent from the Inbox, archived incoming files,
    // Daily Report PDFs). Served only when an Inbox message actually refers to that exact file.
    const storedPath = String(body?.stored_path || "").trim();
    const storedBucket = String(body?.stored_bucket || "whatsapp-media").trim();
    if (storedPath) {
      if (!["whatsapp-media", "patient-reports"].includes(storedBucket) || storedPath.includes("..")) return json({ error: "This file location is not allowed." }, 400);
      const byMedia = await caller.db.from("hr_whatsapp_communications").select("id,recipient_number").eq("message_payload->_samara_media->>path", storedPath).limit(1);
      const byReport = byMedia.data?.length ? { data: [] as any[] } : await caller.db.from("hr_whatsapp_communications").select("id,recipient_number").eq("message_payload->>report_storage_path", storedPath).limit(1);
      const row = byMedia.data?.[0] || byReport.data?.[0];
      if (row) {
        const { data: scoped, error: scopeError } = await caller.db.rpc("wa_food_guard", { p_user: caller.user.id, p_phone: String(row.recipient_number || "").replace(/\D/g, ""), p_template: null });
        if (scopeError || !scoped) return json({ error: "Your role cannot open this WhatsApp attachment." }, 403);
        const file = await caller.db.storage.from(storedBucket).download(storedPath);
        if (!file.error && file.data) {
          const headers = new Headers(corsHeaders);
          headers.set("Content-Type", file.data.type || "application/octet-stream");
          headers.set("Cache-Control", "private, no-store");
          headers.set("Content-Disposition", "inline");
          return new Response(file.data, { status: 200, headers });
        }
      }
      if (!mediaId) return json({ error: "This attachment is no longer stored in Samara ERP." }, 410);
    }
    if (!mediaId || !/^[A-Za-z0-9_-]+$/.test(mediaId)) return json({ error: "A valid WhatsApp media ID is required" }, 400);

    const { data: scoped, error: scopeError } = await caller.db.rpc("wa_food_guard", { p_user: caller.user.id, p_media: mediaId });
    if (scopeError || !scoped) return new Response(JSON.stringify({ error: "WhatsApp access is limited to authorised food-vendor conversations." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
