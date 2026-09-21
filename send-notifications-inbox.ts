import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function e164(value: string): string {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "91" + digits.slice(1);
  if (digits.length === 10) digits = "91" + digits;
  return "+" + digits;
}

async function twilioSend(params: {
  sid: string;
  token: string;
  from: string;
  to: string;
  body: string;
}) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${params.sid}/Messages.json`;
  const form = new URLSearchParams({
    From: params.from,
    To: params.to,
    Body: params.body,
  });

  const response = await samaraInboxFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${params.sid}:${params.token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || JSON.stringify(result));
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorised" }, 401);

    const { data: profile } = await caller
      .from("duty_profiles")
      .select("role,active")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.active || !["Admin", "Manager", "Accounts"].includes(profile.role)) {
      return json({ error: "Administrator, Manager or Accounts permission required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    const db = createClient(supabaseUrl, serviceKey);
    let query = db
      .from("notification_queue")
      .select("*")
      .in("status", ["Pending", "Failed"])
      .lte("scheduled_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(25);

    if (ids.length) query = query.in("id", ids);

    const { data: items, error } = await query;
    if (error) throw error;

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const whatsappFromRaw = Deno.env.get("TWILIO_WHATSAPP_FROM") || "";
    const smsFromRaw = Deno.env.get("TWILIO_SMS_FROM") || "";

    if (!sid || !token) throw new Error("Twilio Account SID/Auth Token secrets are not configured");

    const processed = [];

    for (const item of items || []) {
      try {
        await db
          .from("notification_queue")
          .update({
            status: "Processing",
            attempts: Number(item.attempts || 0) + 1,
            error_message: null,
          })
          .eq("id", item.id);

        let result;
        if (item.channel === "WhatsApp") {
          if (!whatsappFromRaw) throw new Error("TWILIO_WHATSAPP_FROM is not configured");
          result = await twilioSend({
            sid,
            token,
            from: whatsappFromRaw.startsWith("whatsapp:")
              ? whatsappFromRaw
              : `whatsapp:${e164(whatsappFromRaw)}`,
            to: `whatsapp:${e164(item.recipient)}`,
            body: item.message,
          });
        } else if (item.channel === "SMS") {
          if (!smsFromRaw) throw new Error("TWILIO_SMS_FROM is not configured");
          result = await twilioSend({
            sid,
            token,
            from: e164(smsFromRaw),
            to: e164(item.recipient),
            body: item.message,
          });
        } else {
          throw new Error(`Unsupported channel: ${item.channel}`);
        }

        await db
          .from("notification_queue")
          .update({
            status: "Sent",
            sent_at: new Date().toISOString(),
            provider_message_id: result.sid,
            error_message: null,
          })
          .eq("id", item.id);

        processed.push({ id: item.id, status: "Sent", provider_message_id: result.sid });
      } catch (itemError) {
        const message = itemError instanceof Error ? itemError.message : String(itemError);
        await db
          .from("notification_queue")
          .update({ status: "Failed", error_message: message })
          .eq("id", item.id);
        processed.push({ id: item.id, status: "Failed", error: message });
      }
    }

    return json({ processed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
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
