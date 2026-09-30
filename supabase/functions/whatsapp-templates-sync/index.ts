// Self-contained for Supabase Dashboard deployment. Edge Function: whatsapp-templates-sync (ERP 2.15.24).
// Copies Samara's approved WhatsApp templates (text, header, footer, buttons) from Meta into
// public.whatsapp_templates so the ERP Inbox shows each message exactly as the recipient saw it.
// Needs secrets: WHATSAPP_ACCESS_TOKEN (already set) and WHATSAPP_BUSINESS_ACCOUNT_ID (new).
// Admin / Manager only. Read-only towards Meta.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: "An active ERP session is required." }, 403);
  const { data: profile } = await db.from("duty_profiles").select("id,role,is_active,active")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
  if (!profile || !(profile.is_active ?? profile.active ?? false) || !["Admin", "Manager"].includes(String(profile.role)))
    return json({ error: "Only Admin or Manager can refresh WhatsApp templates." }, 403);

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  const waba = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "";
  const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
  if (!accessToken) return json({ error: "WHATSAPP_ACCESS_TOKEN is not set." }, 500);
  if (!waba) return json({ error: "WHATSAPP_BUSINESS_ACCOUNT_ID is not set. Add it in Supabase > Edge Functions > Secrets.", setup_required: true }, 400);

  try {
    const rows: Array<Record<string, unknown>> = [];
    let url: string | null = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(waba)}/message_templates?fields=name,language,status,category,components&limit=100`;
    for (let page = 0; url && page < 20; page++) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) return json({ error: data?.error?.message || `Meta returned ${res.status}` }, res.status);
      for (const t of data?.data || []) {
        rows.push({ name: t.name, language: t.language || "en", status: t.status || null, category: t.category || null,
          components: Array.isArray(t.components) ? t.components : [], synced_at: new Date().toISOString() });
      }
      url = data?.paging?.next || null;
    }
    if (rows.length) {
      const { error } = await db.from("whatsapp_templates").upsert(rows, { onConflict: "name,language" });
      if (error) return json({ error: `Could not save templates: ${error.message}. Run supabase/sql/174_whatsapp_inbox_real.sql first.` }, 500);
    }
    return json({ success: true, count: rows.length, approved: rows.filter((r) => r.status === "APPROVED").length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Template sync failed" }, 500);
  }
});
