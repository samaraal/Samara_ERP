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

  const response = await fetch(endpoint, {
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
