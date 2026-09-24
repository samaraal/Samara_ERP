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

    // v2.14.32: called every minute by pg_cron (x-cron-secret) or manually by a signed-in Admin/Manager.
    const cronSecret = String(Deno.env.get("CRON_SECRET") || "").trim();
    const fromCron = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;
    if (!fromCron) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader) return json({ success: false, error: "Authentication required." }, 401);
      const caller = createClient(url, required("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authError } = await caller.auth.getUser();
      if (authError || !authData.user) return json({ success: false, error: "Invalid ERP session." }, 401);
      const { data: callerProfile } = await admin.from("duty_profiles").select("id,role,is_active").or(`auth_user_id.eq.${authData.user.id},id.eq.${authData.user.id}`).maybeSingle();
      if (!callerProfile || callerProfile.is_active === false) return json({ success: false, error: "ERP profile is not active." }, 403);
      if (!["Admin", "Manager", "Nurse", "Caregiver"].includes(String(callerProfile.role))) return json({ success: false, error: "Clinical escalation access denied." }, 403);
    }

    // Stays silent until the Meta template "samara_clinical_escalation" is approved and
    // the secret CLINICAL_WHATSAPP_ENABLED=true is set.
    if (String(Deno.env.get("CLINICAL_WHATSAPP_ENABLED") || "").trim().toLowerCase() !== "true") {
      return json({ success: true, disabled: true, message: "Clinical WhatsApp escalations are disabled (set CLINICAL_WHATSAPP_ENABLED=true after template approval)." });
    }

    const accessToken = required("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const templateName = Deno.env.get("WHATSAPP_CLINICAL_TEMPLATE_NAME") || "samara_clinical_escalation";
    const languageCode = Deno.env.get("WHATSAPP_CLINICAL_TEMPLATE_LANGUAGE") || "en";
    const headerImage = Deno.env.get("WHATSAPP_CLINICAL_HEADER_IMAGE") || "https://samaraassistedliving.com/assets/samara-logo.png";

    // Keep database escalation records current before sending WhatsApp.
    await admin.rpc("process_clinical_alert_escalations");
    const { data: alerts, error: alertError } = await admin.rpc("get_current_clinical_alerts");
    if (alertError) throw alertError;

    // Stages per alert type:
    //   Vital Signs:  60 min -> Managers ("Escalated"),  90 min -> Admin/Directors ("Critical pending")
    //   Others:       30 min -> Managers + Admins,       60 min -> Managers + Admins ("Critical pending")
    type Stage = { key: string; label: string; audience: "manager" | "admin" | "both" };
    const stagesFor = (a: any): Stage[] => {
      const overdue = Number(a.overdue_minutes || 0);
      const vital = String(a.alert_type || "").toLowerCase() === "vital signs";
      const out: Stage[] = [];
      if (String(a.alert_type || "").toLowerCase() === "regularisation") return out;
      if (vital) {
        if (overdue >= 60) out.push({ key: "VITALS_60_MANAGER", label: "Escalated", audience: "manager" });
        if (overdue >= 90) out.push({ key: "VITALS_90_ADMIN", label: "Critical pending", audience: "admin" });
      } else {
        if (overdue >= 30) out.push({ key: "30_MIN", label: "Escalated", audience: "both" });
        if (overdue >= 60) out.push({ key: "60_MIN", label: "Critical pending", audience: "both" });
      }
      return out;
    };
    const dueAlerts = (alerts || []).filter((a: any) => stagesFor(a).length);
    if (!dueAlerts.length) return json({ success: true, processed: 0, sent: 0, failed: 0, skipped: 0 });

    const isAdminTier = (role: string) => { const r = role.trim().toLowerCase(); return r === "admin" || r === "administrator" || r === "director" || r.includes("administrator") || r.includes("director"); };
    const isManagerTier = (role: string) => { const r = role.trim().toLowerCase(); return r === "manager" || r.endsWith(" manager") || r.startsWith("manager "); };
    const { data: recipients, error: recipientError } = await admin
      .from("duty_profiles")
      .select("id,full_name,login_id,role,mobile,is_active")
      .eq("is_active", true);
    if (recipientError) throw recipientError;
    const targetRecipients = (recipients || [])
      .map((r: any) => ({ ...r, role: String(r.role || ""), phone: normalizePhone(r.mobile) }))
      .filter((r: any) => r.phone && (isAdminTier(r.role) || isManagerTier(r.role)));
    const audienceOf = (stage: Stage) => targetRecipients.filter((r: any) =>
      stage.audience === "manager" ? isManagerTier(r.role) : stage.audience === "admin" ? isAdminTier(r.role) : true);

    let sent = 0, failed = 0, skipped = 0, processed = 0;
    for (const alert of dueAlerts as any[]) {
      const overdue = Number(alert.overdue_minutes || 0);
      const alertKey = `${alert.alert_type}:${alert.source_id}:${alert.due_at}`;
      for (const st of stagesFor(alert)) {
      const stage = st.key;
      const stageLabel = st.label;
      for (const recipient of audienceOf(st) as any[]) {
        processed += 1;
        const baseRow = {
          alert_key: alertKey,
          stage,
          recipient_profile_id: recipient.id,
          recipient_name: recipient.full_name || recipient.login_id,
          recipient_role: recipient.role,
          recipient_number: recipient.phone,
          alert_type: alert.alert_type,
          patient_id: alert.patient_id,
          patient_name: alert.patient_name,
          room_label: alert.room_label,
          alert_title: alert.title,
          due_at: alert.due_at,
          overdue_minutes: overdue,
          template_name: templateName,
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await admin.from("clinical_whatsapp_escalations")
          .select("id,status,attempted_at")
          .eq("alert_key", alertKey).eq("stage", stage).eq("recipient_number", recipient.phone).maybeSingle();
        if (existing?.status === "Sent" || existing?.status === "Sending") { skipped += 1; continue; }
        if (existing?.status === "Failed" && existing.attempted_at && Date.now() - new Date(existing.attempted_at).getTime() < 5 * 60 * 1000) { skipped += 1; continue; }

        let logId = existing?.id;
        if (logId) {
          await admin.from("clinical_whatsapp_escalations").update({ ...baseRow, status: "Sending", error_text: null, attempted_at: new Date().toISOString() }).eq("id", logId);
        } else {
          const { data: inserted, error: insertError } = await admin.from("clinical_whatsapp_escalations")
            .insert({ ...baseRow, status: "Sending", attempted_at: new Date().toISOString() }).select("id").single();
          if (insertError) { skipped += 1; continue; }
          logId = inserted.id;
        }

        const payload = {
          messaging_product: "whatsapp",
          to: recipient.phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              { type: "header", parameters: [{ type: "image", image: { link: headerImage } }] },
              { type: "body", parameters: [
                { type: "text", text: compact(alert.alert_type, 35, "Clinical task") },
                { type: "text", text: compact(alert.patient_name, 50, "Patient") },
                { type: "text", text: compact(alert.room_label, 30, "Room —") },
                { type: "text", text: compact(alert.title, 70, "Clinical task due") },
                { type: "text", text: formatTimeIN(alert.due_at) },
                { type: "text", text: String(overdue) },
                { type: "text", text: stageLabel },
              ] },
            ],
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
          const metaId = result?.messages?.[0]?.id || null;
          await admin.from("clinical_whatsapp_escalations").update({ status: "Sent", meta_message_id: metaId, sent_at: new Date().toISOString(), error_text: null, updated_at: new Date().toISOString() }).eq("id", logId);
          sent += 1;
        } catch (error) {
          await admin.from("clinical_whatsapp_escalations").update({ status: "Failed", error_text: error instanceof Error ? error.message.slice(0, 1800) : String(error).slice(0, 1800), updated_at: new Date().toISOString() }).eq("id", logId);
          failed += 1;
        }
      }
      }
    }
    return json({ success: true, processed, sent, failed, skipped, recipients: targetRecipients.length });
  } catch (error) {
    console.error("Clinical WhatsApp escalation error:", error);
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
