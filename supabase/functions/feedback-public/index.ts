import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function normaliseIndianMobile(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  throw new Error("Please enter a valid 10-digit Indian WhatsApp number.");
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function sixDigitCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String((bytes[0] % 900000) + 100000);
}

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function sendWhatsAppOtp(mobile: string, code: string) {
  const token = required("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const graphVersion = required("WHATSAPP_GRAPH_API_VERSION");
  const templateName = required("WHATSAPP_OTP_TEMPLATE_NAME");
  const languageCode = Deno.env.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE") || "en_US";

  // This payload is intended for an approved AUTHENTICATION template with
  // a copy-code OTP button. If your approved template uses a different
  // button structure, keep the same secrets and adjust only components.
  const payload = {
    messaging_product: "whatsapp",
    to: mobile,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }]
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }]
        }
      ]
    }
  };

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();
  if (!response.ok) {
    console.error("WhatsApp OTP send failed", result);
    throw new Error(result?.error?.message || "WhatsApp verification code could not be sent.");
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = required("SUPABASE_URL");
    const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const pepper = required("FEEDBACK_OTP_PEPPER");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "send_otp") {
      const mobile = normaliseIndianMobile(body.mobile);

      // Rate limit: max 3 OTP requests in 15 minutes for the same mobile.
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("feedback_otp_challenges")
        .select("id", { count: "exact", head: true })
        .eq("mobile", mobile)
        .gte("created_at", since);

      if ((count || 0) >= 3) {
        return json({ error: "Too many verification requests. Please try again after 15 minutes." }, 429);
      }

      const code = sixDigitCode();
      const otpHash = await sha256(`${mobile}:${code}:${pepper}`);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { data: challenge, error: insertError } = await admin
        .from("feedback_otp_challenges")
        .insert({ mobile, otp_hash: otpHash, expires_at: expiresAt })
        .select("id")
        .single();

      if (insertError) throw insertError;

      await sendWhatsAppOtp(mobile, code);

      return json({
        ok: true,
        challenge_id: challenge.id,
        expires_in_seconds: 600
      });
    }

    if (action === "verify_otp") {
      const mobile = normaliseIndianMobile(body.mobile);
      const challengeId = String(body.challenge_id || "");
      const code = String(body.code || "").trim();

      if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit verification code." }, 400);

      const { data: challenge, error } = await admin
        .from("feedback_otp_challenges")
        .select("*")
        .eq("id", challengeId)
        .eq("mobile", mobile)
        .single();

      if (error || !challenge) return json({ error: "Verification request was not found." }, 400);
      if (challenge.verified_at) return json({ error: "This verification code has already been used." }, 400);
      if (new Date(challenge.expires_at).getTime() < Date.now()) return json({ error: "Verification code has expired." }, 400);
      if ((challenge.attempts || 0) >= 5) return json({ error: "Too many incorrect attempts. Request a new code." }, 429);

      const submittedHash = await sha256(`${mobile}:${code}:${pepper}`);
      if (submittedHash !== challenge.otp_hash) {
        await admin
          .from("feedback_otp_challenges")
          .update({ attempts: (challenge.attempts || 0) + 1 })
          .eq("id", challenge.id);
        return json({ error: "Verification code is incorrect." }, 400);
      }

      const token = crypto.randomUUID();
      const verifiedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("feedback_otp_challenges")
        .update({ verified_at: verifiedAt, verification_token: token })
        .eq("id", challenge.id);
      if (updateError) throw updateError;

      return json({ ok: true, verification_token: token, mobile_verified: true });
    }

    if (action === "submit_feedback") {
      const respondentName = String(body.respondent_name || "").trim();
      const respondentType = String(body.respondent_type || "Visitor").trim();
      const category = String(body.category || "General").trim();
      const message = String(body.message || "").trim();
      const subject = String(body.subject || "").trim();
      const email = String(body.email || "").trim();
      const patientCode = String(body.patient_code || "").trim();
      const replyRequested = !!body.reply_requested;
      const rating = body.rating ? Number(body.rating) : null;

      if (!respondentName) return json({ error: "Please enter your name." }, 400);
      if (message.length < 3 || message.length > 4000) return json({ error: "Please enter your feedback." }, 400);
      if (rating !== null && (rating < 1 || rating > 5)) return json({ error: "Rating must be between 1 and 5." }, 400);

      let mobile: string | null = null;
      let verified = false;
      let verifiedAt: string | null = null;

      if (replyRequested) {
        mobile = normaliseIndianMobile(body.mobile);
        const verificationToken = String(body.verification_token || "");
        if (!verificationToken) return json({ error: "Please verify your WhatsApp number before submitting." }, 400);

        const { data: challenge, error } = await admin
          .from("feedback_otp_challenges")
          .select("*")
          .eq("mobile", mobile)
          .eq("verification_token", verificationToken)
          .not("verified_at", "is", null)
          .single();

        if (error || !challenge) return json({ error: "WhatsApp verification is invalid. Please verify again." }, 400);
        if (Date.now() - new Date(challenge.verified_at).getTime() > 30 * 60 * 1000) {
          return json({ error: "WhatsApp verification has expired. Please verify again." }, 400);
        }

        verified = true;
        verifiedAt = challenge.verified_at;
      } else if (body.mobile) {
        try { mobile = normaliseIndianMobile(body.mobile); } catch (_) { mobile = String(body.mobile).trim() || null; }
      }

      const { data, error } = await admin
        .from("feedback")
        .insert({
          source: "Website",
          respondent_type: respondentType || "Visitor",
          respondent_name: respondentName,
          mobile,
          email: email || null,
          patient_code: patientCode || null,
          category,
          rating,
          subject: subject || null,
          message,
          consent_to_contact: replyRequested,
          reply_requested: replyRequested,
          reply_channel: replyRequested ? "WhatsApp" : null,
          mobile_verified: verified,
          mobile_verified_at: verifiedAt
        })
        .select("id, feedback_reference")
        .single();

      if (error) throw error;

      return json({ ok: true, id: data.id, feedback_reference: data.feedback_reference });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || "Unexpected server error." }, 500);
  }
});
