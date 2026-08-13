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
  const { data, error } = await supabase
    .from("career_applications")
    .select("id,application_id,applicant_name,mobile,whatsapp,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).find((row: any) => last10(row.whatsapp || row.mobile) === target) || null;
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
  if (error) console.error("WhatsApp status update failed", id, error);
}

async function saveIncoming(value: any, message: any) {
  const from = digits(message?.from);
  const providerId = String(message?.id || "").trim();
  if (!from || !providerId) return;
  const applicant = await findApplicant(from);
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
  const { error } = await supabase.from("hr_whatsapp_communications").upsert(row, { onConflict: "provider_message_id", ignoreDuplicates: true });
  if (error) console.error("Incoming WhatsApp save failed", providerId, error);
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
    const payload = await req.json();
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== "messages") continue;
        const value = change?.value || {};
        for (const status of value?.statuses || []) await updateStatus(status);
        for (const message of value?.messages || []) await saveIncoming(value, message);
      }
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("WhatsApp webhook error", error);
    // Return 200 to avoid webhook retry storms after logging the processing error.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
});
