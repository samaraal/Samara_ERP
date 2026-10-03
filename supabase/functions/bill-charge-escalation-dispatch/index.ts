// Self-contained for Supabase Dashboard deployment. Edge Function: bill-charge-escalation-dispatch (ERP 2.15.54, SQL 188 + 189).
// WhatsApps Admin / Director ONE summary (count + since when, no Guest details) when Bills & Charges requests are still Pending with Accounts 30 minutes after being raised, repeated every 30 minutes until attended.
// Secrets: BILLING_WHATSAPP_ENABLED=true (after Meta approves template samara_billing_escalation); uses the existing WhatsApp + CRON secrets.
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

    // ERP 2.15.53 (SQL 188): called every minute by pg_cron (x-cron-secret) or manually by a signed-in Admin.
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

    // Silent until the Meta template "samara_billing_escalation" is approved and BILLING_WHATSAPP_ENABLED=true.
    if (String(Deno.env.get("BILLING_WHATSAPP_ENABLED") || "").trim().toLowerCase() !== "true") {
      return json({ success: true, disabled: true, message: "Billing WhatsApp escalations are disabled (set BILLING_WHATSAPP_ENABLED=true after template approval)." });
    }

    const accessToken = required("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const templateName = Deno.env.get("WHATSAPP_BILLING_TEMPLATE_NAME") || "samara_billing_escalation";
    const languageCode = Deno.env.get("WHATSAPP_BILLING_TEMPLATE_LANGUAGE") || "en";

    const { data: rows, error: rowError } = await admin.rpc("bill_charge_overdue_rows");
    if (rowError) throw rowError;
    const due = (rows || []).filter((r: any) => r.whatsapp_due);
    if (!due.length) return json({ success: true, processed: 0, sent: 0, failed: 0, skipped: 0 });

    const isAdminTier = (role: string) => { const r = role.trim().toLowerCase(); return r === "admin" || r === "administrator" || r === "director" || r.includes("administrator") || r.includes("director"); };
    const { data: profiles, error: profileError } = await admin.from("duty_profiles").select("id,full_name,login_id,role,mobile,is_active").eq("is_active", true);
    if (profileError) throw profileError;
    const recipients = (profiles || [])
      .map((r: any) => ({ ...r, role: String(r.role || ""), phone: normalizePhone(r.mobile) }))
      .filter((r: any) => r.phone && isAdminTier(r.role));
    if (!recipients.length) return json({ success: true, processed: 0, sent: 0, failed: 0, skipped: due.length, message: "No active Admin / Director with a mobile number." });

    // 2.15.54 (SQL 189): one summary per Admin, repeated every repeat_minutes (30) while anything stays unattended.
    const { data: settings } = await admin.from("bill_charge_alert_settings").select("repeat_minutes").eq("id", 1).maybeSingle();
    const repeatMs = Math.max(10, Number(settings?.repeat_minutes || 30)) * 60 * 1000;
    const total = due.length;
    const oldest = due.slice().sort((a: any, b: any) => new Date(a.raised_at).getTime() - new Date(b.raised_at).getTime())[0];
    const since = `${formatTimeIN(oldest.raised_at).toUpperCase()} on ${formatDateIN(oldest.raised_at)}`;

    let sent = 0, failed = 0, skipped = 0, processed = 0;
    for (const recipient of recipients as any[]) {
      const { data: last } = await admin.from("bill_charge_whatsapp_summaries")
        .select("id,status,created_at").eq("recipient_number", recipient.phone)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last) {
        const age = Date.now() - new Date(last.created_at).getTime();
        // Sent / Sending: wait the full 30 minutes. Failed: retry after 5 minutes.
        if (last.status === "Failed" ? age < 5 * 60 * 1000 : age < repeatMs - 30 * 1000) { skipped += 1; continue; }
      }
      processed += 1;
      const { data: logRow, error: logError } = await admin.from("bill_charge_whatsapp_summaries").insert({
        recipient_profile_id: recipient.id, recipient_name: recipient.full_name || recipient.login_id,
        recipient_number: recipient.phone, pending_count: total, pending_since: oldest.raised_at, status: "Sending",
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
            { type: "text", text: String(total) },
            { type: "text", text: since },
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
        await admin.from("bill_charge_whatsapp_summaries").update({ status: "Sent", meta_message_id: result?.messages?.[0]?.id || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", logRow.id);
        sent += 1;
      } catch (error) {
        await admin.from("bill_charge_whatsapp_summaries").update({ status: "Failed", error_text: (error instanceof Error ? error.message : String(error)).slice(0, 1800), updated_at: new Date().toISOString() }).eq("id", logRow.id);
        failed += 1;
      }
    }
    return json({ success: true, processed, sent, failed, skipped, recipients: recipients.length });
  } catch (error) {
    console.error("Billing WhatsApp escalation error:", error);
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
