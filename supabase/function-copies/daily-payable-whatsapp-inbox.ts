import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const SAMARA_LOGO_URL = "https://samaraassistedliving.com/assets/samara-logo.png";

function phone(value: unknown) {
  let n = String(value ?? "").replace(/\D/g, "");
  if (n.length === 10) n = "91" + n;
  return n;
}

function money(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function patientName(p: Record<string, unknown>) {
  return String(p.full_name || "Patient").trim();
}

async function sendTemplate(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  templateName: string,
  params: string[],
  headerImage: string = SAMARA_LOGO_URL,
) {
  const components: Array<Record<string, unknown>> = [];
  if (headerImage) {
    components.push({
      type: "header",
      parameters: [{
        type: "image",
        image: { link: headerImage },
      }],
    });
  }
  components.push({
    type: "body",
    parameters: params.map((text) => ({ type: "text", text })),
  });

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components,
    },
  };

  const response = await samaraInboxFetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}

Deno.serve(async (req) => {
  try {
    if (!["POST", "GET"].includes(req.method)) {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!url || !serviceKey || !accessToken || !phoneNumberId) {
      throw new Error("Required Supabase / WhatsApp secrets are missing");
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // IMPORTANT: post today's recurring room / nursing / special-nurse charges first.
    // Previously this happened only when a staff member opened the ERP, so an early
    // scheduled WhatsApp run could read yesterday's ledger and repeat yesterday's balance.
    const { data: billingRun, error: billingError } = await supabase.rpc(
      "run_daily_billing_automation",
      { p_charge_date: today, p_force: false },
    );
    if (billingError) {
      throw new Error(`Daily billing refresh failed; payable WhatsApp was NOT sent: ${billingError.message}`);
    }

    // v2.10.07: do not send a payable reminder merely because the RPC returned HTTP success.
    // The billing function now independently verifies that every expected Room/Nursing
    // source_key is actually present in billing_transactions. Any persisted-ledger gap
    // blocks WhatsApp so a stale balance can never be sent.
    const refresh = (billingRun || {}) as Record<string, unknown>;
    const refreshOk = refresh.success === true
      && Number(refresh.error_count || 0) === 0
      && Number(refresh.missing_room_after_run || 0) === 0
      && Number(refresh.missing_nursing_after_run || 0) === 0;
    if (!refreshOk) {
      throw new Error(`Daily billing did not fully persist; payable WhatsApp was NOT sent: ${JSON.stringify(refresh)}`);
    }

    const { data: patients, error: pError } = await supabase
      .from("patients")
      .select("*")
      .eq("is_active", true);
    if (pError) throw pError;

    const patientIds = (patients || []).map((p: any) => p.id);
    if (!patientIds.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No active patients" }), { headers });
    }

    const { data: txns, error: tError } = await supabase
      .from("billing_transactions")
      .select("patient_id,transaction_type,amount")
      .in("patient_id", patientIds);
    if (tError) throw tError;

    const totals = new Map<string, { Charge:number; Payment:number; Advance:number; Discount:number; Refund:number }>();
    for (const id of patientIds) {
      totals.set(id, { Charge:0, Payment:0, Advance:0, Discount:0, Refund:0 });
    }
    for (const row of txns || []) {
      const bucket = totals.get(row.patient_id);
      if (!bucket) continue;
      const type = String(row.transaction_type || "");
      if (type in bucket) (bucket as any)[type] += Number(row.amount || 0);
    }

    let sent = 0, skipped = 0, failed = 0;
    const details: unknown[] = [];

    for (const p of patients || []) {
      const b = totals.get(p.id) || { Charge:0, Payment:0, Advance:0, Discount:0, Refund:0 };
      const outstanding = Math.max(0, b.Charge - b.Payment - b.Advance - b.Discount + b.Refund);
      if (outstanding <= 0.009) { skipped++; continue; }

      const { data: existing } = await supabase
        .from("whatsapp_daily_payable_log")
        .select("id,status,amount")
        .eq("patient_id", p.id)
        .eq("statement_date", today)
        .maybeSingle();

      // Skip only when today's successfully sent amount is still the current live balance.
      // If today's ledger changed after an earlier send (new daily charge/payment/etc.),
      // a rerun sends the corrected current amount instead of preserving a stale figure.
      if (existing?.status === "Sent" && Math.abs(Number(existing.amount || 0) - outstanding) <= 0.009) {
        skipped++;
        continue;
      }

      const to = phone(p.attendant_phone || p.mobile || "");
      if (!to) {
        failed++;
        await supabase.from("whatsapp_daily_payable_log").upsert({
          patient_id: p.id,
          statement_date: today,
          amount: outstanding,
          recipient_phone: null,
          status: "Failed",
          error_message: "No patient / attendant mobile number",
          attempted_at: new Date().toISOString(),
        }, { onConflict: "patient_id,statement_date" });
        continue;
      }

      const recipient = String(p.attendant_name || p.full_name || "Family Member").trim();
      try {
        const displayDate = today.split("-").reverse().join("-");
        const patientDisplayName = patientName(p);
        const amountText = money(outstanding);
        const result = await sendTemplate(
          accessToken,
          phoneNumberId,
          to,
          "samara_bill_reminder",
          [recipient, patientDisplayName, amountText, displayDate],
        );

        const providerMessageId = result?.messages?.[0]?.id || null;
        const renderedMessage = `Dear ${recipient},

This is a gentle reminder regarding the outstanding amount for ${patientDisplayName}.

Amount Due: ₹${amountText}
Due Date: ${displayDate}

Please arrange payment at your convenience.

You may access the Samara Family Portal using the button below to view the account details.

If payment has already been made, kindly disregard this message.

Thank you.`;

        const now = new Date().toISOString();
        const { error: chatError } = await supabase.from("hr_whatsapp_communications").insert({
          career_application_id: null,
          application_id: null,
          applicant_name: recipient,
          recipient_number: to,
          communication_type: "Daily Payable Reminder · Automated",
          template_name: "samara_bill_reminder",
          status: "Accepted",
          provider_message_id: providerMessageId,
          error_message: null,
          sent_by: null,
          sent_by_name: "Samara System · Automated",
          direction: "outbound",
          message_type: "template",
          message_content: renderedMessage,
          message_payload: {
            patient_id: p.id,
            patient_name: patientDisplayName,
            amount: outstanding,
            statement_date: today,
            meta_result: result,
          },
          contact_name: recipient,
          source_type: "Patient / Family · Accounts",
          sent_at: now,
          created_at: now,
          updated_at: now,
        });
        if (chatError) console.error("Daily payable WhatsApp Inbox logging failed", p.id, chatError);

        await supabase.from("whatsapp_daily_payable_log").upsert({
          patient_id: p.id,
          statement_date: today,
          amount: outstanding,
          recipient_phone: to,
          status: "Sent",
          meta_message_id: providerMessageId,
          error_message: null,
          attempted_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        }, { onConflict: "patient_id,statement_date" });
        sent++;
        details.push({ patient_id: p.id, amount: outstanding, status: "Sent" });
      } catch (error) {
        failed++;
        const errorText = error instanceof Error ? error.message : String(error);
        await supabase.from("whatsapp_daily_payable_log").upsert({
          patient_id: p.id,
          statement_date: today,
          amount: outstanding,
          recipient_phone: to,
          status: "Failed",
          error_message: errorText.slice(0, 2000),
          attempted_at: new Date().toISOString(),
        }, { onConflict: "patient_id,statement_date" });
        details.push({ patient_id: p.id, amount: outstanding, status: "Failed", error: errorText });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      date: today,
      billing_refresh: billingRun,
      sent,
      skipped,
      failed,
      details,
    }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers });
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
  const headers = new Headers(response.headers);
  headers.set("x-samara-inbox-id",id);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
