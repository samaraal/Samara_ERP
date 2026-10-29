// Self-contained for Supabase Dashboard deployment. Edge Function: mis-daily-summary-dispatch (ERP 2.19.11, SQL 317 + 318).
// Each morning WhatsApps every active Admin / Director (with a mobile number) ONE summary of the previous day's MIS audit:
// high / medium findings and the top findings in Clinical, Financial and Operational. Called by pg_cron at 7:31, 8:01,
// 8:31 and 9:01 AM IST (x-cron-secret); a recipient already sent today is skipped, a failed one is retried.
// Secrets: MIS_WHATSAPP_ENABLED=true (after Meta approves template samara_mis_daily_summary); uses the existing
// WhatsApp + CRON secrets. Optional: WHATSAPP_MIS_TEMPLATE_NAME, WHATSAPP_MIS_TEMPLATE_LANGUAGE.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}
// WhatsApp template values: one line, no tabs / 4+ spaces, max length
function oneLine(value: unknown, max = 300) {
  const clean = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim() || "—";
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const url = required("SUPABASE_URL");
    const service = required("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

    // Called by pg_cron (x-cron-secret) or manually by a signed-in Admin / Director (e.g. to test).
    const cronSecret = String(Deno.env.get("CRON_SECRET") || "").trim();
    const fromCron = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;
    if (!fromCron) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader) return json({ success: false, error: "Authentication required." }, 401);
      const caller = createClient(url, required("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authError } = await caller.auth.getUser();
      if (authError || !authData.user) return json({ success: false, error: "Invalid ERP session." }, 401);
      const { data: callerProfile } = await admin.from("duty_profiles").select("id,role,is_active").or(`auth_user_id.eq.${authData.user.id},id.eq.${authData.user.id}`).maybeSingle();
      if (!callerProfile || callerProfile.is_active === false || !["admin", "administrator", "director"].includes(String(callerProfile.role || "").trim().toLowerCase()))
        return json({ success: false, error: "Only Admin / Director may run this." }, 403);
    }

    // Silent until the Meta template "samara_mis_daily_summary" is approved and MIS_WHATSAPP_ENABLED=true.
    if (String(Deno.env.get("MIS_WHATSAPP_ENABLED") || "").trim().toLowerCase() !== "true") {
      return json({ success: true, disabled: true, message: "MIS WhatsApp summary is disabled (set MIS_WHATSAPP_ENABLED=true after template approval)." });
    }

    const accessToken = required("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const templateName = Deno.env.get("WHATSAPP_MIS_TEMPLATE_NAME") || "samara_mis_daily_summary";
    const languageCode = Deno.env.get("WHATSAPP_MIS_TEMPLATE_LANGUAGE") || "en";

    const isAdminTier = (role: string) => { const r = role.trim().toLowerCase(); return r === "admin" || r === "administrator" || r === "director" || r.includes("administrator") || r.includes("director"); };
    const { data: profiles, error: profileError } = await admin.from("duty_profiles").select("id,full_name,login_id,role,mobile,is_active").eq("is_active", true);
    if (profileError) throw profileError;
    const seen = new Set<string>();
    const recipients = (profiles || [])
      .map((r: any) => ({ ...r, role: String(r.role || ""), phone: normalizePhone(r.mobile) }))
      .filter((r: any) => r.phone && isAdminTier(r.role) && !seen.has(r.phone) && seen.add(r.phone));
    if (!recipients.length) return json({ success: true, sent: 0, message: "No active Admin / Director with a mobile number." });

    const { data: summary, error: summaryError } = await admin.rpc("mis_daily_summary");
    if (summaryError) throw summaryError;
    const day = String(summary?.day || "");

    let sent = 0, failed = 0, skipped = 0;
    for (const recipient of recipients as any[]) {
      // once a day per number: skip if already Sent / Sending today; a Failed one is tried again (max 4 tries)
      const { data: today } = await admin.from("mis_whatsapp_summaries").select("id,status")
        .eq("summary_day", day).eq("recipient_number", recipient.phone);
      if ((today || []).some((r: any) => r.status !== "Failed") || (today || []).length >= 4) { skipped += 1; continue; }

      const { data: logRow, error: logError } = await admin.from("mis_whatsapp_summaries").insert({
        summary_day: day, recipient_profile_id: recipient.id, recipient_name: recipient.full_name || recipient.login_id,
        recipient_number: recipient.phone, high_count: summary?.high ?? null, medium_count: summary?.medium ?? null, status: "Sending",
      }).select("id").single();
      if (logError) { skipped += 1; continue; }

      const payload = {
        messaging_product: "whatsapp",
        to: recipient.phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [{ type: "body", parameters: [
            { type: "text", text: oneLine(summary?.day_label, 20) },
            { type: "text", text: String(summary?.high ?? 0) },
            { type: "text", text: String(summary?.medium ?? 0) },
            { type: "text", text: oneLine(summary?.clinical) },
            { type: "text", text: oneLine(summary?.financial) },
            { type: "text", text: oneLine(summary?.operational) },
          ] }],
        },
      };
      try {
        const metaResponse = await samaraInboxFetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await metaResponse.json();
        if (!metaResponse.ok) throw new Error(JSON.stringify(result));
        await admin.from("mis_whatsapp_summaries").update({ status: "Sent", meta_message_id: result?.messages?.[0]?.id || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", logRow.id);
        sent += 1;
      } catch (error) {
        await admin.from("mis_whatsapp_summaries").update({ status: "Failed", error_text: (error instanceof Error ? error.message : String(error)).slice(0, 1800), updated_at: new Date().toISOString() }).eq("id", logRow.id);
        failed += 1;
      }
    }
    return json({ success: true, day, sent, failed, skipped, recipients: recipients.length });
  } catch (error) {
    console.error("MIS WhatsApp summary error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

// Embed this helper in each Edge Function and use samaraInboxFetch instead of fetch.
// Non-message requests pass through unchanged. Never store authentication codes.
async function samaraInboxFetch(input: any, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const isMeta = /^https:\/\/graph\.facebook\.com\/[^/]+\/[^/]+\/messages(?:\?|$)/.test(url);
  const isTwilio = /^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(url);
  if ((!isMeta && !isTwilio) || String(init?.method || "GET").toUpperCase() !== "POST") return globalThis.fetch(input, init);
  const form = isTwilio ? new URLSearchParams(String(init?.body || "")) : null;
  if (form && !String(form.get("To")).startsWith("whatsapp:")) return globalThis.fetch(input,init);
  const payload = form ? {to:form.get("To"),type:"text",text:{body:form.get("Body")}} : JSON.parse(String(init?.body || "{}"));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {auth:{persistSession:false}});
  const template = payload.template?.name || null;
  const privateTemplate = /otp|auth|portal_access|password|pin/i.test(template || "") || /\b(OTP|verification code|password|PIN)\b/i.test(payload.text?.body || "");
  const params = privateTemplate ? [] : (payload.template?.components || []).filter((c:any)=>c.type === "body").flatMap((c:any)=>c.parameters || []).map((p:any)=>String(p.text ?? ""));
  const content = privateTemplate ? "Authentication / portal access message. Secret values are hidden."
    : payload.text?.body || payload.image?.caption || payload.document?.caption
    || (template ? `Template: ${template}${params.length ? "\n" + params.join("\n") : ""}` : `[${payload.type || "WhatsApp"} message]`);
  const source = /food/i.test(template || "") ? "Food Vendor" : /employee|interview|career/i.test(template || "") ? "HR" : /patient|family|discharge|bill|package|clinical/i.test(template || "") ? "Patient / Family" : "WhatsApp";
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const row = {id, recipient_number:String(payload.to || "").replace(/\D/g,""),
    template_name:template, communication_type:template ? `WhatsApp · ${template}` : "WhatsApp Reply",
    direction:"outbound", message_type:payload.type || "template", status:"Sending",
    message_content:content, message_payload:{inbox_transport:true,body_params:params,secret_values_hidden:privateTemplate},
    source_type:source, created_at:now,updated_at:now};
  const reserved = await db.from("hr_whatsapp_communications").insert(row);
  if (reserved.error) throw new Error("WhatsApp was not sent because Inbox recording is unavailable. " + reserved.error.message);
  let response: Response;
  try { response = await globalThis.fetch(input,init); }
  catch (error) {
    await db.from("hr_whatsapp_communications").update({status:"Unknown",error_message:"Network interrupted. Acceptance is unknown; check before resending.",updated_at:new Date().toISOString()}).eq("id",id);
    throw error;
  }
  let result:any = {};
  try { result = await response.clone().json(); } catch { /* Keep the provider response unchanged. */ }
  const providerId = result?.messages?.[0]?.id || (isTwilio ? result?.sid : null) || null;
  const when = new Date().toISOString();
  const status = response.ok ? (providerId ? "Accepted" : "Unknown") : "Failed";
  const saved = await db.from("hr_whatsapp_communications").update({
    provider_message_id:providerId, status, sent_at:status === "Accepted" ? when : null,
    failed_at:status === "Failed" ? when : null,
    error_message:status === "Failed" ? String(result?.error?.message || result?.message || `Provider rejected the message (${response.status})`) : status === "Unknown" ? "Provider did not return a message ID. Check before resending." : null,
    updated_at:when
  }).eq("id",id);
  // A failed status write must never turn an accepted send into a retryable error.
  if (saved.error) console.error("WhatsApp Inbox outcome update failed",id,saved.error.message);
  return response;
}
