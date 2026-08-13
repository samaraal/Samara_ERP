import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!accessToken || !phoneNumberId) throw new Error("WhatsApp configuration is missing");

    const body = await req.json();
    const to = String(body.to || "").replace(/\D/g, "");
    const messageType = String(body.message_type || (body.text ? "text" : "template")).trim().toLowerCase();
    if (!to) throw new Error("Recipient phone number is required");

    let payload: Record<string, unknown>;
    if (messageType === "text") {
      const text = String(body.text || "").trim();
      if (!text) throw new Error("Reply text is required");
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      };
    } else {
      const templateName = String(body.template_name || "").trim();
      const languageCode = String(body.language_code || "en").trim();
      const bodyParams = Array.isArray(body.body_params) ? body.body_params : [];
      const headerImage = String(body.header_image || "").trim();
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

    const metaResponse = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await metaResponse.json();
    if (!metaResponse.ok) {
      console.error("Meta WhatsApp API error:", result);
      return new Response(JSON.stringify({ success: false, error: result }), { status: metaResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
