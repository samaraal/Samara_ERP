// Self-contained for Supabase Dashboard deployment. Edge Function: attendance-daily-dispatch (ERP 2.20.42, SQL 378).
// Each morning WhatsApps every active Admin / Director (with a mobile number) the biometric attendance of YESTERDAY's
// Day shift (7 AM–7 PM) and Night shift (7 PM–7 AM): who came late and by how much, who did overtime (stayed more than
// 15 min after the shift end) and who had no punch without approved leave. Data: attendance_daily_summary(day).
// Called by pg_cron at 9:31, 10:01, 10:31 and 11:01 AM IST (x-cron-secret). Before 11 AM it waits until the machine has
// sent data after 7:30 AM (so the Night shift Out punches are in); at 11:01 it sends anyway. Once per person per day.
// Admin / Director (signed in) or cron may also call: { mode:"preview", day } · { mode:"send", day } ·
// { mode:"submit_template" } (creates template samara_staff_attendance_daily on Meta) · { mode:"template_status" }.
// Verify JWT: OFF (the function checks the cron secret or the ERP session itself).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TEMPLATE = "samara_staff_attendance_daily";
const TEMPLATE_BODY =
  "*Samara – Staff Attendance (Biometric)*\nDate: {{1}} · Day shift 7 AM–7 PM and Night shift 7 PM–7 AM\n\n" +
  "*Came late – {{2}} staff:*\n{{3}}\n\n*Overtime – {{4}} staff:*\n{{5}}\n\n*No punch and no approved leave:*\n{{6}}\n\n" +
  "Full details are in Samara Care ERP under Biometric Attendance.";

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
function oneLine(value: unknown, max = 900) {
  const clean = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim() || "—";
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}
function istNow() { return new Date(Date.now() + 5.5 * 3600 * 1000); }
function istToday() { return istNow().toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  try {
    const url = required("SUPABASE_URL");
    const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const cronSecret = String(Deno.env.get("CRON_SECRET") || "").trim();
    const fromCron = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;
    if (!fromCron) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader) return json({ success: false, error: "Authentication required." }, 401);
      const caller = createClient(url, required("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authError } = await caller.auth.getUser();
      if (authError || !authData.user) return json({ success: false, error: "Invalid ERP session." }, 401);
      const { data: p } = await admin.from("duty_profiles").select("id,role,is_active").or(`auth_user_id.eq.${authData.user.id},id.eq.${authData.user.id}`).maybeSingle();
      if (!p || p.is_active === false || !["admin", "administrator", "director"].includes(String(p.role || "").trim().toLowerCase()))
        return json({ success: false, error: "Only Admin / Director may run this." }, 403);
    }
    const accessToken = required("WHATSAPP_ACCESS_TOKEN");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const mode = String(body?.mode || "cron");

    if (mode === "submit_template" || mode === "template_status") {
      const waba = required("WHATSAPP_BUSINESS_ACCOUNT_ID");
      if (mode === "submit_template") {
        const res = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(waba)}/message_templates`, {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: TEMPLATE, language: "en", category: "UTILITY",
            components: [{ type: "BODY", text: TEMPLATE_BODY, example: { body_text: [[
              "11-11-2026 (Wednesday)", "2",
              "1. Priya (Day, in 07:40) – 40 min late · 2. Kavitha (Night, in 20:05) – 1 hr 5 min late",
              "1", "1. Sobana (Day, out 20:10) – 1 hr 10 min extra", "Meena (Night)"]] } }],
          }),
        });
        const data = await res.json();
        return json({ success: res.ok, meta: data }, res.ok ? 200 : 400);
      }
      const res = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(waba)}/message_templates?name=${TEMPLATE}&fields=name,status,rejected_reason`, { headers: { Authorization: `Bearer ${accessToken}` } });
      return json({ success: res.ok, meta: await res.json() });
    }

    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.day || "")) ? String(body.day) : addDays(istToday(), -1);
    const { data: summary, error: sumErr } = await admin.rpc("attendance_daily_summary", { p_day: day });
    if (sumErr) throw sumErr;
    const params = [
      oneLine(summary?.day_label, 40), String(summary?.late_count ?? 0), oneLine(summary?.late_text),
      String(summary?.overtime_count ?? 0), oneLine(summary?.overtime_text), oneLine(summary?.no_punch_text, 500),
    ];
    if (mode === "preview") {
      let text = TEMPLATE_BODY; params.forEach((v, i) => { text = text.replace(`{{${i + 1}}}`, v); });
      return json({ success: true, day, summary, message: text });
    }

    const { data: st } = await admin.from("attendance_push_settings").select("last_push_at,daily_whatsapp_enabled").eq("id", 1).maybeSingle();
    if (st && st.daily_whatsapp_enabled === false) return json({ success: true, disabled: true });
    if (mode === "cron") {
      // wait for the Night shift Out punches: machine data after 7:30 AM today, or it is 11 AM already
      const fresh = st?.last_push_at && new Date(st.last_push_at).getTime() >= new Date(`${istToday()}T07:30:00+05:30`).getTime();
      if (!fresh && istNow().getUTCHours() < 11) return json({ success: true, waiting: true, message: "Waiting for machine data after 7:30 AM." });
    }

    const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
    const isAdminTier = (role: string) => { const r = role.trim().toLowerCase(); return r === "admin" || r === "administrator" || r === "director" || r.includes("administrator") || r.includes("director"); };
    const { data: profiles, error: pErr } = await admin.from("duty_profiles").select("id,full_name,login_id,role,mobile,is_active").eq("is_active", true);
    if (pErr) throw pErr;
    const seen = new Set<string>();
    const recipients = (profiles || []).map((r: any) => ({ ...r, role: String(r.role || ""), phone: normalizePhone(r.mobile) }))
      .filter((r: any) => r.phone && isAdminTier(r.role) && !seen.has(r.phone) && seen.add(r.phone));
    if (!recipients.length) return json({ success: true, sent: 0, message: "No active Admin / Director with a mobile number." });

    let sent = 0, failed = 0, skipped = 0;
    for (const rc of recipients as any[]) {
      const { data: prev } = await admin.from("attendance_whatsapp_daily").select("id,status").eq("summary_day", day).eq("recipient_number", rc.phone);
      if ((prev || []).some((r: any) => r.status !== "Failed") || (prev || []).length >= 4) { skipped++; continue; }
      const { data: logRow, error: logErr } = await admin.from("attendance_whatsapp_daily").insert({
        summary_day: day, recipient_profile_id: rc.id, recipient_name: rc.full_name || rc.login_id, recipient_number: rc.phone, status: "Sending",
      }).select("id").single();
      if (logErr) { skipped++; continue; }
      try {
        const res = await samaraInboxFetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: rc.phone, type: "template",
            template: { name: TEMPLATE, language: { code: "en" }, components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }] } }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(result));
        await admin.from("attendance_whatsapp_daily").update({ status: "Sent", meta_message_id: result?.messages?.[0]?.id || null, sent_at: new Date().toISOString() }).eq("id", logRow.id);
        sent++;
      } catch (e) {
        await admin.from("attendance_whatsapp_daily").update({ status: "Failed", error_text: (e instanceof Error ? e.message : String(e)).slice(0, 1800) }).eq("id", logRow.id);
        failed++;
      }
    }
    return json({ success: true, day, sent, failed, skipped, recipients: recipients.length });
  } catch (error) {
    console.error("attendance-daily-dispatch error:", error);
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
