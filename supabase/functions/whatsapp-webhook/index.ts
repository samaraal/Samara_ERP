import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const last10 = (value: unknown) => digits(value).slice(-10);
const isoFromUnix = (value: unknown) => {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
};

function incomingContent(message: any): string {
  const type = String(message?.type || "unknown");
  if (type === "text") return String(message?.text?.body || "");
  if (type === "button") return String(message?.button?.text || message?.button?.payload || "Button response");
  if (type === "interactive") {
    const i = message?.interactive || {};
    return String(i?.button_reply?.title || i?.list_reply?.title || i?.button_reply?.id || i?.list_reply?.id || "Interactive response");
  }
  if (type === "image") return message?.image?.caption ? `[Image] ${message.image.caption}` : "[Image received]";
  if (type === "document") return `[Document received${message?.document?.filename ? `: ${message.document.filename}` : ""}${message?.document?.caption ? ` — ${message.document.caption}` : ""}]`;
  if (type === "audio") return "[Audio / voice message received]";
  if (type === "video") return message?.video?.caption ? `[Video] ${message.video.caption}` : "[Video received]";
  if (type === "sticker") return "[Sticker received]";
  if (type === "location") {
    const loc = message?.location || {};
    return `[Location received${loc.name ? `: ${loc.name}` : ""}${loc.latitude && loc.longitude ? ` — ${loc.latitude}, ${loc.longitude}` : ""}]`;
  }
  if (type === "contacts") return "[Contact received]";
  if (type === "reaction") return `[Reaction: ${message?.reaction?.emoji || ""}]`;
  return `[${type} message received]`;
}

async function findApplicant(phone: string) {
  const target = last10(phone);
  if (!target) return null;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("career_applications")
      .select("id,application_id,applicant_name,mobile,whatsapp,created_at").order("id").range(page * 500, page * 500 + 499);
    if (error) throw error;
    const match = (data || []).find((row: any) => [row.whatsapp, row.mobile].some(phone => last10(phone) === target));
    if (match) return match;
    if ((data || []).length < 500) return null;
  }
}

async function updateStatus(status: any) {
  const id = String(status?.id || "").trim();
  if (!id) return;
  const name = String(status?.status || "").trim();
  const when = isoFromUnix(status?.timestamp);
  const patch: Record<string, unknown> = { status: name ? name[0].toUpperCase() + name.slice(1) : "Updated", updated_at: new Date().toISOString() };
  if (name === "sent") patch.sent_at = when;
  if (name === "delivered") patch.delivered_at = when;
  if (name === "read") patch.read_at = when;
  if (name === "failed") {
    patch.failed_at = when;
    patch.error_message = status?.errors?.[0]?.error_data?.details || status?.errors?.[0]?.message || status?.errors?.[0]?.title || "Meta reported delivery failure";
  }
  const { error } = await supabase.from("hr_whatsapp_communications").update(patch).eq("provider_message_id", id);
  const { error: foodError } = await supabase.rpc("fv_apply_provider_status", {p_id:id,p_status:patch.status,p_detail:patch.error_message||null,p_at:when});
  if (foodError) console.error("Food delivery status update failed", foodError.message);
  if (error) throw error;
}

async function publicEnquiryAutoReply(from: string, contactName: string, message: any) {
  // Quick-reply selections and reactions are recorded but do not restart the greeting.
  if (["button", "interactive", "reaction"].includes(message.type)) return;
  if (/^(admission details|request a call|our location)$/i.test(String(message.text?.body || "").trim())) return;
  // Do not reply to delayed historical deliveries after a deployment.
  const when = Number(message.timestamp) * 1000;
  if (!Number.isFinite(when) || when < Date.now() - 24 * 60 * 60 * 1000) return;
  const template = Deno.env.get("WHATSAPP_GENERAL_FOLLOWUP_TEMPLATE") || "samara_general_followup";
  const language = Deno.env.get("WHATSAPP_GENERAL_FOLLOWUP_LANGUAGE") || "en";
  const image = Deno.env.get("WHATSAPP_HEADER_IMAGE_URL") || "https://samaraassistedliving.com/assets/samara-whatsapp-logo.png";
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const numberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !numberId) throw new Error("Auto reply requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID");
  const { data: recent, error: recentError } = await supabase.from("hr_whatsapp_communications").select("id")
    .eq("recipient_number", from).eq("communication_type", "Website Enquiry Auto Reply")
    .in("status", ["Pending", "Sent", "Delivered", "Read"])
    .gte("created_at", new Date(Date.now() - 86400000).toISOString()).limit(1);
  if (recentError) throw recentError;
  if (recent?.length) return;
  const { data: allowed, error: limitError } = await supabase.rpc("samara_take_action_slot", { p_key: `website-auto-reply:${from}`, p_limit: 1, p_seconds: 86400 });
  if (limitError) throw new Error(`Auto-reply limiter unavailable: ${limitError.message}. Run the included SQL first.`);
  if (!allowed) return;
  const name = String(contactName || "Customer").replace(/[\r\n\t]+/g, " ").trim().slice(0, 100) || "Customer";
  const payload = { messaging_product: "whatsapp", to: from, type: "template", template: {
    name: template, language: { code: language }, components: [
      { type: "header", parameters: [{ type: "image", image: { link: image } }] },
      { type: "body", parameters: [{ type: "text", text: name }, { type: "text", text: "your assisted living enquiry" }] }
    ]
  } };
  const content = `Dear ${name},\nGreetings from Samara Assisted Living.\nWe received your message regarding your assisted living enquiry.\nPlease reply to this message and our team will be happy to assist you.\n\nThank you,\nSamara Assisted Living`;
  await sendLoggedReply(from, name, message, payload, content, "Website Enquiry Auto Reply", template);
}

async function sendLoggedReply(from: string, name: string, message: any, payload: any, content: string, communicationType: string, templateName: string | null) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const numberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !numberId) throw new Error("WhatsApp sending secrets are missing");
  // Save a visible attempt BEFORE contacting Meta. An uncertain send is never automatically repeated.
  const { data: attempt, error: attemptError } = await supabase.from("hr_whatsapp_communications").insert({
    recipient_number: from, applicant_name: name, contact_name: name,
    communication_type: communicationType, template_name: templateName,
    direction: "outbound", message_type: payload.type, message_content: content,
    message_payload: payload, source_type: "Website / Public", status: "Pending",
    sent_by_name: "Samara Auto Reply", reply_to_provider_message_id: message.id,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }).select("id").single();
  if (attemptError || !attempt) throw attemptError || new Error("Unable to record auto reply");
  let providerId = "";
  const sendStarted = Date.now();
  try {
    const version = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const response = await fetch(`https://graph.facebook.com/${version}/${numberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
    });
    console.info("WhatsApp Meta request completed", { inbound_message_id: message.id, elapsed_ms: Date.now() - sendStarted, http_status: response.status });
    const result = await response.json();
    providerId = String(result?.messages?.[0]?.id || "");
    if (!response.ok || !providerId) throw new Error(result?.error?.message || "Meta did not confirm acceptance of the auto reply");
    const { error } = await supabase.from("hr_whatsapp_communications").update({ status: "Sent", provider_message_id: providerId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null }).eq("id", attempt.id);
    if (error) throw error;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const { error: logError } = await supabase.from("hr_whatsapp_communications").update({
      status: providerId ? "Sent" : "Failed", ...(providerId ? { provider_message_id: providerId } : {}),
      error_message: providerId ? `Meta accepted this message. Local logging needs review: ${detail}` : `Auto reply failed or delivery is uncertain; check Meta before manually retrying. ${detail}`,
      updated_at: new Date().toISOString()
    }).eq("id", attempt.id);
    console.error("Website auto reply needs review", { inbound_message_id: message.id, detail, log_error: logError?.message });
  }
}

function foodVendorButtonStatus(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("acknow")) return "Acknowledged";
  if (t.includes("return")) return "Returned";
  if (t.includes("modif") || t.includes("chang")) return "Modification Requested";
  return null;
}

// A vendor tapping a quick-reply button on a Food Vendor confirmation request. Matched
// strictly by Meta's own message id (message.context.id -> fv_messages.provider_id),
// and only for an actual button tap, never a freeform typed reply. Returns true when
// handled, so the caller skips logging it into the general HR/applicant inbox and skips
// the public-enquiry menu/auto-reply path below, since this is a vendor, not a visitor.
async function tryFoodVendorButtonReply(message: any): Promise<boolean> {
  const type = String(message?.type || "");
  if (type !== "button" && type !== "interactive") return false;
  const contextId = String(message?.context?.id || "").trim();
  if (!contextId) return false;
  const i = message?.interactive || {};
  const buttonText = String(message?.button?.text || i?.button_reply?.title || i?.list_reply?.title || i?.button_reply?.id || i?.list_reply?.id || "").trim();
  const status = buttonText ? foodVendorButtonStatus(buttonText) : null;
  if (!status) return false;
  const { data, error } = await supabase.rpc("fv_apply_vendor_button_reply", {
    p_provider_message_id: contextId,
    p_status: status,
    p_button_text: buttonText,
    p_at: isoFromUnix(message?.timestamp),
  });
  if (error) {
    console.error("Food Vendor button reply failed", contextId, error);
    return false;
  }
  return data === true;
}

function menuChoice(message: any): string {
  const candidates = [message.button?.text, message.button?.payload,
    message.interactive?.button_reply?.title, message.interactive?.button_reply?.id,
    message.interactive?.list_reply?.title, message.interactive?.list_reply?.id, message.text?.body];
  for (const value of candidates) {
    const text = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    if (["admission details", "request a call", "our location"].includes(text)) return text;
  }
  return "";
}

async function replyToMenu(from: string, contactName: string, message: any, choice: string) {
  const when = Number(message.timestamp) * 1000;
  if (!Number.isFinite(when) || when < Date.now() - 86400000) return;
  const name = String(contactName || "Customer").replace(/[\r\n\t]+/g, " ").trim().slice(0,100) || "Customer";
  const address = "RBK VILLA, No. 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037";
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Samara Assisted Living, " + address);
  const responses: Record<string, string> = {
    "admission details": `Dear ${name},\nThank you for your interest in admission at Samara Assisted Living.\n\nPlease share the prospective resident's name, age, care/support required and preferred admission date. Our team can discuss suitability, availability, charges and the admission process with you.\n\nFor assistance, call +91 99767 35577 or +91 73959 61616.\n\nSamara Assisted Living`,
    "request a call": `Dear ${name},\nYour callback request has been recorded in this conversation. Please reply with a convenient time to call and your preferred contact number.\n\nFor immediate enquiries, call +91 99767 35577 or +91 73959 61616.\n\nSamara Assisted Living`,
    "our location": `Dear ${name},\nSamara Assisted Living\n${address}.\n\nOpen in Google Maps:\n${maps}\n\nPlease call +91 99767 35577 or +91 73959 61616 to arrange a visit.`
  };
  const content = responses[choice];
  if (!content) return;
  if ([...content].length > 1024) throw new Error("Branded menu caption exceeds 1024 characters");
  // These are replies to a new customer message, independent of the greeting cooldown.
  await sendLoggedReply(from, name, message,
    { messaging_product: "whatsapp", to: from, type: "image", image: { link: Deno.env.get("WHATSAPP_HEADER_IMAGE_URL") || "https://samaraassistedliving.com/assets/samara-whatsapp-logo.png", caption: content } },
    content, `Website Enquiry Menu Reply: ${choice}`, null);
}

async function saveIncoming(value: any, message: any) {
  const from = digits(message?.from);
  const providerId = String(message?.id || "").trim();
  if (!from || !providerId) return;
  // Menu clicks do not need a full applicant-directory scan before replying.
  const applicant = menuChoice(message) ? null : await findApplicant(from);
  const contactName = String(value?.contacts?.find((c: any) => digits(c?.wa_id) === from)?.profile?.name || value?.contacts?.[0]?.profile?.name || applicant?.applicant_name || "Applicant");
  const content = incomingContent(message);
  const row = {
    career_application_id: applicant?.id || null,
    application_id: applicant?.application_id || null,
    applicant_name: applicant?.applicant_name || contactName,
    recipient_number: from,
    communication_type: "Applicant Reply",
    template_name: null,
    status: "Received",
    provider_message_id: providerId,
    error_message: null,
    sent_by: null,
    sent_by_name: "Applicant",
    direction: "inbound",
    message_type: String(message?.type || "unknown"),
    message_content: content,
    message_payload: message,
    contact_name: contactName,
    reply_to_provider_message_id: message?.context?.id ? String(message.context.id) : null,
    received_at: isoFromUnix(message?.timestamp),
    created_at: isoFromUnix(message?.timestamp),
    source_type: applicant ? "HR Applicant" : "Website / Public",
    erp_read_at: null,
    updated_at: new Date().toISOString(),
  };
  const { data: inserted, error } = await supabase.from("hr_whatsapp_communications").upsert(row, { onConflict: "provider_message_id", ignoreDuplicates: true }).select("id");
  if (error) throw error;
  if (inserted?.length) {
    try {
      const name = contactName === "Applicant" ? "Customer" : contactName;
      const choice = menuChoice(message);
      if (choice) await replyToMenu(from, name, message, choice);
      else await publicEnquiryAutoReply(from, name, message);
    }
    catch (replyError) { console.error("Website auto reply setup / lookup failed", { inbound_message_id: providerId, error: replyError instanceof Error ? replyError.message : String(replyError) }); }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const secret = Deno.env.get("WHATSAPP_APP_SECRET");
    if (!secret) return new Response("Webhook signature verification is not configured", { status: 503 });
    const raw = await req.text();
    const supplied = req.headers.get("x-hub-signature-256") || "";
    if (!/^sha256=[a-f0-9]{64}$/i.test(supplied)) return new Response("Forbidden", { status: 403 });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signature = new Uint8Array(supplied.slice(7).match(/../g)!.map(x => parseInt(x, 16)));
    if (!await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(raw))) return new Response("Forbidden", { status: 403 });
    const payload = JSON.parse(raw);
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== "messages") continue;
        const value = change?.value || {};
        // Status writes need not delay customer replies; keep messages in each batch ordered.
        await Promise.all([
          (async () => { for (const status of value?.statuses || []) await updateStatus(status); })(),
          (async () => { for (const message of value?.messages || []) { if (await tryFoodVendorButtonReply(message)) continue; await saveIncoming(value, message); } })()
        ]);
      }
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("WhatsApp webhook error", error);
    // Request a provider retry; incoming message IDs make repeated deliveries idempotent.
    return new Response("Processing failed; retry later", { status: 503 });
  }
});
