// Self-contained for Supabase Dashboard deployment. Edge Function: discharge-dues-reminder-dispatch (ERP 2.17.9, SQL 248).
// Guests discharged with dues pending (emergency departure allowed by Admin / Director): the family gets the
// existing approved "samara_bill_reminder" WhatsApp every 3 days (10 AM–6 PM IST) until the dues are paid.
// Called hourly by pg_cron (x-cron-secret) or manually by a signed-in Admin / Director.
// Uses the existing secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, CRON_SECRET. Optional: DUES_WHATSAPP_ENABLED=false to pause all.
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
function formatTimeIN(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}
function formatDateIN(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${g("day")}-${g("month")}-${g("year")}`;
}
function compact(value: unknown, max = 70, fallback = "—") {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(1, max - 1)).trim()}…`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const url = required("SUPABASE_URL");
    const service = required("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

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

    if (String(Deno.env.get("DUES_WHATSAPP_ENABLED") || "true").trim().toLowerCase() === "false") {
      return json({ success: true, disabled: true, message: "Dues reminders are paused (DUES_WHATSAPP_ENABLED=false)." });
    }

    const accessToken = required("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const templateName = Deno.env.get("WHATSAPP_DUES_TEMPLATE_NAME") || "samara_bill_reminder";
    const languageCode = Deno.env.get("WHATSAPP_DUES_TEMPLATE_LANGUAGE") || "en";

    const { data: rows, error: rowError } = await admin.rpc("discharge_dues_reminder_rows");
    if (rowError) throw rowError;
    let sent = 0, failed = 0;
    const today = formatDateIN(new Date().toISOString());
    for (const r of (rows || []) as any[]) {
      const to = normalizePhone(r.family_phone);
      if (!to) { failed += 1; continue; }
      const amount = Number(r.balance || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      const payload = {
        messaging_product: "whatsapp", to, type: "template",
        template: { name: templateName, language: { code: languageCode },
          components: [{ type: "body", parameters: [
            { type: "text", text: compact(r.family_name, 60, "Family Member") },
            { type: "text", text: compact(r.guest_name, 60, "Guest") },
            { type: "text", text: amount },
            { type: "text", text: today },
          ] }] },
      };
      // Mark first, so a crash can never send the same family several reminders in one hour.
      const { data: before } = await admin.from("patient_discharges").select("dues_reminder_count").eq("id", r.discharge_id).maybeSingle();
      await admin.from("patient_discharges").update({ dues_last_reminder_at: new Date().toISOString(), dues_reminder_count: Number(before?.dues_reminder_count || 0) + 1 }).eq("id", r.discharge_id);
      try {
        const metaResponse = await samaraInboxFetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await metaResponse.json();
        if (!metaResponse.ok) throw new Error(JSON.stringify(result));
        await admin.from("discharge_workflow_events").insert({ discharge_id: r.discharge_id, event_type: "Dues reminder sent (WhatsApp)", details: { amount: Number(r.balance || 0), to, meta_message_id: result?.messages?.[0]?.id || null } });
        sent += 1;
      } catch (error) {
        // Retry in about an hour instead of waiting 3 days.
        await admin.from("patient_discharges").update({ dues_last_reminder_at: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 3600 * 1000).toISOString(), dues_reminder_count: Number(before?.dues_reminder_count || 0) }).eq("id", r.discharge_id);
        await admin.from("discharge_workflow_events").insert({ discharge_id: r.discharge_id, event_type: "Dues reminder failed (WhatsApp)", details: { to, error: (error instanceof Error ? error.message : String(error)).slice(0, 900) } });
        failed += 1;
      }
    }
    return json({ success: true, processed: (rows || []).length, sent, failed });
  } catch (error) {
    console.error("Discharge dues reminder error:", error);
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
