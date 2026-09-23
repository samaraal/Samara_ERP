import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const normalizePhone = (value: unknown) => {
  const d = digits(value);
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
};
const indiaDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
}).format(d);
const displayDate = (iso: string) => {
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
};
const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function kindOf(pkg: any) {
  const unit = String(pkg?.duration_unit || "").toLowerCase();
  const value = Number(pkg?.duration_value || 0);
  const days = unit.startsWith("week") ? value * 7 : unit.startsWith("month") ? value * 30 : value;
  if ((unit.startsWith("week") && value === 1) || days === 7) return "Weekly";
  if ((unit.startsWith("week") && value === 2) || days === 14 || days === 15) return "Fortnightly";
  if ((unit.startsWith("month") && value === 1) || days === 30 || days === 31) return "Monthly";
  return "";
}
function packageFee(pkg: any, roomClass: string) {
  const cls = String(roomClass || "").toLowerCase();
  if (cls.includes("private")) return Number(pkg?.private_fee || 0);
  if (cls.includes("general")) return Number(pkg?.general_fee || 0);
  return Number(pkg?.twin_fee || 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const templateName = Deno.env.get("WHATSAPP_PACKAGE_EXPIRY_TEMPLATE_NAME") || "samara_package_expiry_options";
    const languageCode = Deno.env.get("WHATSAPP_PACKAGE_EXPIRY_TEMPLATE_LANGUAGE") || "en";

    if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is missing.");
    if (!accessToken || !phoneNumberId) throw new Error("WhatsApp configuration is missing.");

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const patientId = body?.patient_id || null;
    const force = body?.force === true;
    const today = indiaDate();
    const lower = new Date(`${today}T00:00:00+05:30`);
    lower.setDate(lower.getDate() - 3);
    const minDate = indiaDate(lower);

    let q = admin.from("patients")
      .select("id,patient_id,title,full_name,mobile,attendant_name,attendant_phone,room_no,bed_no,package_id,package_end_date,package_room_class,is_active")
      .eq("is_active", true)
      .not("package_id", "is", null)
      .not("package_end_date", "is", null);

    if (patientId) q = q.eq("id", patientId);
    else q = q.gte("package_end_date", minDate).lte("package_end_date", today);

    const { data: patients, error: patientError } = await q;
    if (patientError) throw patientError;

    const { data: packages, error: packageError } = await admin.from("care_packages").select("*").eq("is_active", true);
    if (packageError) throw packageError;

    const details: any[] = [];
    for (const p of patients || []) {
      const recipient = normalizePhone(p.attendant_phone || p.mobile);
      if (!recipient) {
        details.push({ patient_id: p.id, status: "Skipped", reason: "No WhatsApp number" });
        continue;
      }

      if (!force) {
        const { data: prior } = await admin.from("package_renewal_notifications")
          .select("id,status").eq("patient_id", p.id).eq("package_end_date", p.package_end_date).maybeSingle();
        if (prior?.id && prior.status === "Sent") {
          details.push({ patient_id: p.id, status: "Skipped", reason: "Already sent" });
          continue;
        }
      }

      let roomClass = p.package_room_class || "Twin";
      let dailyFare = 2800;
      const { data: bed } = await admin.from("room_beds").select("*")
        .or(`patient_id.eq.${p.id},and(room_no.eq.${p.room_no},bed_no.eq.${p.bed_no})`).limit(1).maybeSingle();
      if (bed) {
        const type = String(bed.room_type || "").toLowerCase();
        if (/(private|single|separate|deluxe|isolation)/.test(type)) roomClass = "Private";
        else if (/(general|ward|dorm)/.test(type)) roomClass = "General";
        else roomClass = "Twin";
        const room = Number(bed.room_daily_rate || bed.daily_rate || (roomClass === "Private" ? 3000 : roomClass === "General" ? 1800 : 2000));
        const nursing = Number(bed.nursing_daily_rate || (roomClass === "Private" ? 1000 : roomClass === "General" ? 750 : 800));
        dailyFare = room + nursing;
      }

      const option = (kind: string) => {
        const pkg = (packages || []).find((x: any) => kindOf(x) === kind);
        if (!pkg) return `${kind}: Not configured`;
        return `${kind}: ${pkg.package_name} - ${money(packageFee(pkg, roomClass))}`;
      };

      const params = [
        p.attendant_name || "Family Member",
        [p.title, p.full_name].filter(Boolean).join(" ") || "Resident",
        displayDate(String(p.package_end_date).slice(0,10)),
        option("Weekly"),
        option("Fortnightly"),
        option("Monthly"),
        `${money(dailyFare)} per day`
      ];

      const endDate = String(p.package_end_date).slice(0,10);
      const payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: "body",
              parameters: params.map(text => ({ type: "text", text: String(text).slice(0, 1024) }))
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "0",
              parameters: [{ type: "payload", payload: `PKG|${p.id}|WEEKLY|${endDate}` }]
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "1",
              parameters: [{ type: "payload", payload: `PKG|${p.id}|FORTNIGHTLY|${endDate}` }]
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "2",
              parameters: [{ type: "payload", payload: `PKG|${p.id}|MONTHLY|${endDate}` }]
            }
          ]
        }
      };

      const metaResponse = await samaraInboxFetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const meta = await metaResponse.json().catch(() => ({}));
      const providerId = meta?.messages?.[0]?.id || null;
      const status = metaResponse.ok && providerId ? "Sent" : "Failed";
      const errorMessage = status === "Failed" ? (meta?.error?.message || "Meta did not accept the message.") : null;

      await admin.from("package_renewal_notifications").upsert({
        patient_id: p.id,
        package_end_date: p.package_end_date,
        recipient_number: recipient,
        template_name: templateName,
        provider_message_id: providerId,
        status,
        error_message: errorMessage,
        sent_at: status === "Sent" ? new Date().toISOString() : null
      }, { onConflict: "patient_id,package_end_date" });

      details.push({
        patient_id: p.id,
        patient: p.full_name,
        recipient,
        status,
        provider_message_id: providerId,
        error: errorMessage,
        options: { weekly: params[3], fortnightly: params[4], monthly: params[5], daily_fare: params[6] }
      });
    }

    return json({
      success: details.every(x => x.status !== "Failed"),
      date: today,
      sent: details.filter(x => x.status === "Sent").length,
      skipped: details.filter(x => x.status === "Skipped").length,
      failed: details.filter(x => x.status === "Failed").length,
      details
    });
  } catch (error) {
    console.error(error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
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
