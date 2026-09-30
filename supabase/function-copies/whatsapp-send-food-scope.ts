// Self-contained for Supabase Dashboard deployment. Edge Function: whatsapp-send (SQL 169 update, 30-09-2026).
import { createClient } from "jsr:@supabase/supabase-js@2";

async function requireWhatsAppUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) throw new Error("Authentication required");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new Error("Invalid ERP session");
  const { data: profile, error: profileError } = await db.from("duty_profiles").select("id,role,is_active,active").or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
  if (profileError || !profile || !(profile.is_active ?? profile.active ?? false)) throw new Error("WhatsApp access requires an active ERP account");
  return { db, user, profile };
}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Save API outcomes in the shared Inbox; provider IDs make accepted writes idempotent.
async function recordCommunication(caller: any, body: any, to: string, result: any, accepted: boolean, transportId?: string | null) {
  const log = body.communication_log && typeof body.communication_log === "object" ? body.communication_log : {};
  const secret = false; // v2.14.07: do not replace the sent payload with invented/redacted text in the Admin audit Inbox.
  const params = secret ? [] : (Array.isArray(body.body_params) ? body.body_params : []);
  const content = secret ? "Authentication / portal access message. Secret values are hidden." : log.message_content || body.text || `Template: ${body.template_name || "WhatsApp"}\n${params.join("\n")}`;
  const providerId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();
  const row = {
    recipient_number: to, template_name: body.template_name || null,
    communication_type: log.communication_type || "WhatsApp Message",
    direction: "outbound", message_type: body.message_type || (body.text ? "text" : "template"),
    status: accepted ? "Accepted" : "Failed", provider_message_id: providerId,
    message_content: content, message_payload: {...(secret ? {patient_id:log.message_payload?.patient_id,patient_code:log.message_payload?.patient_code} : log.message_payload || {body_params:params}),inbox_transport:true,secret_values_hidden:secret},
    contact_name: log.contact_name || null, source_type: log.source_type || "WhatsApp",
    sent_by: caller.profile.id, sent_by_name: log.sent_by_name || null,
    sent_at: accepted ? now : null, failed_at: accepted ? null : now,
    error_message: accepted ? null : String(result?.error?.message || "Meta rejected this message"),
    created_at: now, updated_at: now,
  };
  const query = caller.db.from("hr_whatsapp_communications");
  if (transportId) {
    const {error} = await query.update({communication_type:row.communication_type,
      message_content:row.message_content,message_payload:row.message_payload,
      contact_name:row.contact_name,source_type:row.source_type,
      sent_by:row.sent_by,sent_by_name:row.sent_by_name,message_type:row.message_type}).eq("id",transportId);
    return {history_logged:!error,...(error ? {history_error:error.message} : {})};
  }
  const { error } = providerId
    ? await query.upsert(row, { onConflict: "provider_message_id", ignoreDuplicates: true })
    : await query.insert(row);
  if (error) console.error("WhatsApp Inbox recording failed", error.message);
  return { history_logged: !error, ...(error ? { history_error: error.message } : {}) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let caller;
  try { caller = await requireWhatsAppUser(req); }
  catch (_) { return new Response(JSON.stringify({ error: "An active ERP session is required." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
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

    // Discharge confirmation is a clinical workflow, not a Food & Diet conversation.
    // Permit this one approved template only after verifying the completed discharge,
    // patient and registered family/patient number supplied by the ERP. All other
    // WhatsApp traffic continues through the existing wa_food_guard unchanged.
    let verifiedDischarge = false;
    let verifiedPaymentReceipt = false;
    const templateNameForScope = messageType === "text" ? "" : String(body.template_name || "").trim();
    if (messageType === "template" && templateNameForScope === "samara_discharge_confirmation") {
      const logPayload = body.communication_log?.message_payload || {};
      const dischargeId = String(logPayload.discharge_id || "").trim();
      const patientId = String(logPayload.patient_id || "").trim();
      if (dischargeId && patientId) {
        const { data: discharge } = await caller.db.from("patient_discharges")
          .select("id,patient_id,status,actual_departure_at,relative_contact")
          .eq("id", dischargeId).eq("patient_id", patientId).eq("status", "Completed").not("actual_departure_at", "is", null).maybeSingle();
        const { data: patient } = discharge ? await caller.db.from("patients")
          .select("id,attendant_phone,mobile").eq("id", patientId).maybeSingle() : { data: null };
        const phoneKey = (value: unknown) => { const digits=String(value || "").replace(/\D/g, ""); return digits.length > 10 ? digits.slice(-10) : digits; };
        const target = phoneKey(to);
        const registered = [patient?.attendant_phone, discharge?.relative_contact, patient?.mobile].map(phoneKey).filter(Boolean);
        verifiedDischarge = Boolean(discharge && patient && target && registered.includes(target));
      }
      if (!verifiedDischarge) return new Response(JSON.stringify({ error: "Discharge WhatsApp was blocked because the completed discharge or registered family number could not be verified." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Payment receipts are an Accounts workflow, not a Food & Diet conversation.
    // Allow only the approved payment template after verifying a recent, genuine
    // Payment/Advance transaction and the patient's registered family number.
    if (messageType === "template" && templateNameForScope === "samara_payment_receipt") {
      const logPayload = body.communication_log?.message_payload || {};
      const patientId = String(logPayload.patient_id || "").trim();
      const amount = Number(logPayload.amount);
      const paymentMode = String(logPayload.payment_mode || "").trim();
      const reference = String(logPayload.reference || "").trim();
      const role = String(caller.profile.role || "");
      if (patientId && Number.isFinite(amount) && amount > 0 && ["Admin", "Manager", "Accounts"].includes(role)) {
        const { data: patient } = await caller.db.from("patients")
          .select("id,attendant_phone,mobile").eq("id", patientId).maybeSingle();
        const { data: familyRows, error: familyError } = await caller.db.from("family_portal_access")
          .select("mobile,is_active").eq("patient_id", patientId).eq("is_active", true);
        const phoneKey = (value: unknown) => { const digits=String(value || "").replace(/\D/g, ""); return digits.length > 10 ? digits.slice(-10) : digits; };
        const target = phoneKey(to);
        const registered = [
          patient?.attendant_phone,
          patient?.mobile,
          ...((familyRows || []).map((row: any) => row?.mobile)),
        ].map(phoneKey).filter(Boolean);

        // Resend is intentionally allowed for historical Payment/Advance rows. Do not
        // impose a 15-minute cutoff: that made valid old receipts impossible to resend.
        // Instead verify the persisted ledger row itself (amount + mode + reference/id).
        let txQuery = caller.db.from("billing_transactions")
          .select("id,patient_id,transaction_type,amount,payment_mode,payment_reference,transaction_date")
          .eq("patient_id", patientId)
          .in("transaction_type", ["Payment", "Advance"])
          .eq("amount", amount)
          .order("transaction_date", { ascending: false })
          .limit(200);
        if (paymentMode && paymentMode !== "—") txQuery = txQuery.eq("payment_mode", paymentMode);
        const { data: transactions, error: txError } = await txQuery;
        const referenceMatches = (row: any) => {
          if (!reference || reference === "—") return false;
          const wanted = String(reference).trim();
          return String(row?.payment_reference || "").trim() === wanted || String(row?.id || "").trim() === wanted;
        };
        verifiedPaymentReceipt = Boolean(
          !txError && !familyError && patient && target && registered.includes(target) &&
          (transactions || []).some(referenceMatches)
        );
      }
      if (!verifiedPaymentReceipt) return new Response(JSON.stringify({ error: "Payment Receipt WhatsApp was blocked because the recent payment/advance or registered family number could not be verified." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!verifiedDischarge && !verifiedPaymentReceipt) {
      // SQL 169: wa_food_guard decides by role (Admin/Manager all; Nursing Manager food vendors + admission/portal/discharge;
      // Jaya/Saranya admission + portal access; Nurse discharge + review reminder; Accounts receipt + bill reminder),
      // and patient/family templates only to a number registered for a patient.
      const { data: scoped, error: scopeError } = await caller.db.rpc("wa_food_guard", { p_user: caller.user.id, p_phone: to, p_template: messageType === "text" ? null : templateNameForScope });
      if (scopeError || !scoped) return new Response(JSON.stringify({ error: scopeError ? "WhatsApp permission check failed. Please ask the administrator to run SQL 169." : "Your role cannot send this WhatsApp message to this number. Check the family / patient mobile in the Patient File, or ask a Manager." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    const metaResponse = await samaraInboxFetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await metaResponse.json();
    if (!metaResponse.ok) {
      console.error("Meta WhatsApp API error:", result);
      const history = await recordCommunication(caller, body, to, result, false, metaResponse.headers.get("x-samara-inbox-id"));
      return new Response(JSON.stringify({ success: false, error: result, ...history }), { status: metaResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const providerMessageId = result?.messages?.[0]?.id || null;
    if (!providerMessageId) throw new Error("Meta did not confirm a message ID; acceptance is unknown. Check delivery logs before retrying.");
    const history = await recordCommunication(caller, body, to, result, true, metaResponse.headers.get("x-samara-inbox-id"));
    const { error: auditError } = await caller.db.from("audit_log").insert({ user_id: caller.user.id, action: "WhatsApp Sent", entity: "WhatsApp", details: { recipient: to, provider_message_id: providerMessageId, template_name: body.template_name || null, history_logged: history.history_logged } });
    if (auditError) console.error("WhatsApp audit failed", auditError.message);
    return new Response(JSON.stringify({ success: true, result, provider_message_id: providerMessageId, ...history }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  const privateTemplate = false; // v2.14.07 audit rule: Inbox must retain the exact outbound API payload; access remains role-restricted.
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
  const headers = new Headers(response.headers);
  headers.set("x-samara-inbox-id",id);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
