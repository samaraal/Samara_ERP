// Self-contained for Supabase Dashboard deployment.
import { createClient } from "jsr:@supabase/supabase-js@2";

async function requireWhatsAppUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) throw new Error("Authentication required");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new Error("Invalid ERP session");
  const { data: profile, error: profileError } = await db.from("duty_profiles").select("id,role,is_active,active").or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
  if (profileError || !profile || !(profile.is_active ?? profile.active ?? false) || !["Admin", "Manager"].includes(profile.role)) throw new Error("WhatsApp access requires an active Admin or Manager account");
  return { db, user, profile };
}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let caller;
  try { caller = await requireWhatsAppUser(req); }
  catch (_) { return new Response(JSON.stringify({ error: "An active Admin or Manager session is required." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
  try {
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!accessToken || !phoneNumberId) throw new Error("WhatsApp configuration is missing");

    const { data: allowed, error: rateError } = await caller.db.rpc("samara_take_action_slot", { p_key: `whatsapp:${caller.user.id}`, p_limit: 30, p_seconds: 60 });
    if (rateError || !allowed) return new Response(JSON.stringify({ error: rateError ? "WhatsApp safety setup is incomplete. Contact an administrator." : "Too many messages. Please wait a minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json();
    const to = String(body.to || "").replace(/\D/g, "");
    const messageType = String(body.message_type || (body.text ? "text" : "template")).trim().toLowerCase();
    if (!to) throw new Error("Recipient phone number is required");

    const { data: scoped, error: scopeError } = await caller.db.rpc("wa_food_guard", { p_user: caller.user.id, p_phone: to, p_template: messageType === "text" ? null : String(body.template_name || "") });
    if (scopeError || !scoped) return new Response(JSON.stringify({ error: "WhatsApp access is limited to authorised food-vendor conversations." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let payload: Record<string, unknown>;
    if (messageType === "text") {
      const text = String(body.text || "").trim();
      if (!text) throw new Error("Reply text is required");
      if ([...text].length > 1024) return new Response(JSON.stringify({ error: "Replies with the mandatory logo support up to 1024 characters. Please shorten this reply or send it as separate shorter replies." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "image",
        image: { link: Deno.env.get("WHATSAPP_HEADER_IMAGE_URL") || "https://samaraassistedliving.com/assets/samara-whatsapp-logo.png", caption: text },
      };
    } else {
      const templateName = String(body.template_name || "").trim();
      const languageCode = String(body.language_code || "en").trim();
      const bodyParams = Array.isArray(body.body_params) ? body.body_params : [];
      const headerImage = String(Deno.env.get("WHATSAPP_HEADER_IMAGE_URL") || body.header_image || "https://samaraassistedliving.com/assets/samara-whatsapp-logo.png").trim();
      if (!templateName) throw new Error("Template name is required");
      const components: Array<Record<string, unknown>> = [];
      if (headerImage) components.push({ type: "header", parameters: [{ type: "image", image: { link: headerImage } }] });
      if (bodyParams.length) components.push({ type: "body", parameters: bodyParams.map((value: unknown) => ({ type: "text", text: String(value ?? "") })) });
      payload = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: templateName, language: { code: languageCode }, ...(components.length ? { components } : {}) },
      };
    }

    const metaResponse = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await metaResponse.json();
    if (!metaResponse.ok) {
      console.error("Meta WhatsApp API error:", result);
      return new Response(JSON.stringify({ success: false, error: result }), { status: metaResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { error: auditError } = await caller.db.from("audit_log").insert({ user_id: caller.user.id, action: "WhatsApp Sent", entity: "WhatsApp", details: { recipient: to, provider_message_id: result?.messages?.[0]?.id || null } });
    if (auditError) console.error("WhatsApp audit failed", auditError.message);
    return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
