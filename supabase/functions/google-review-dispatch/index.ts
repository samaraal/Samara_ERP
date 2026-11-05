// Self-contained for Supabase Dashboard deployment. Edge Function: google-review-dispatch (ERP 2.19.67, SQL 343).
// Sends ONE WhatsApp to the family asking for a Google rating, a set number of days after the Guest's departure
// (google_review_settings.delay_days, default 2), between 10 AM and 7 PM India time.
// Template samara_google_review (Marketing, English) with a "Rate us on Google" URL button (link fixed in the template).
// Who is due is decided in google_review_due_rows (SQL 343): not Trial Guests, not "Death / Expiry",
// not "Transfer to Hospital", only after Admin ticks "template approved". Every other family gets the same request.
// Called hourly by pg_cron (x-cron-secret) or by a signed-in Admin / Director ("Send due requests now").
// Uses the existing secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, CRON_SECRET.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const required = (name: string) => { const v = Deno.env.get(name); if (!v) throw new Error(`${name} is not configured.`); return v; };
const phone = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); if (d.length === 10) return `91${d}`; if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`; return d.length === 12 && d.startsWith("91") ? d : ""; };
const compact = (v: unknown, max = 60, fb = "—") => { const c = String(v ?? "").replace(/\s+/g, " ").trim(); if (!c) return fb; return c.length <= max ? c : `${c.slice(0, max - 1).trim()}…`; };
const hourIN = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  try {
    const url = required("SUPABASE_URL");
    const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const cronSecret = String(Deno.env.get("CRON_SECRET") || "").trim();
    const fromCron = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;
    if (!fromCron) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader) return json({ success: false, error: "Authentication required." }, 401);
      const caller = createClient(url, required("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authError } = await caller.auth.getUser();
      if (authError || !authData.user) return json({ success: false, error: "Invalid ERP session." }, 401);
      const { data: p } = await admin.from("duty_profiles").select("id,role,is_active").or(`auth_user_id.eq.${authData.user.id},id.eq.${authData.user.id}`).maybeSingle();
      if (!p || p.is_active === false || !["admin", "administrator", "director"].includes(String(p.role || "").trim().toLowerCase()))
        return json({ success: false, error: "Only Admin / Director may run this." }, 403);
    }
    const h = hourIN();
    if (h < 10 || h >= 19) return json({ success: true, skipped: "Outside 10 AM – 7 PM India time." });

    const { data: settings } = await admin.from("google_review_settings").select("*").eq("id", 1).maybeSingle();
    if (!settings?.enabled) return json({ success: true, disabled: true });
    if (!settings?.template_approved) return json({ success: true, waiting: "Template not marked approved yet." });

    const token = required("WHATSAPP_ACCESS_TOKEN"), phoneId = required("WHATSAPP_PHONE_NUMBER_ID");
    const graph = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
    const { data: rows, error } = await admin.rpc("google_review_due_rows");
    if (error) throw error;
    let sent = 0, failed = 0, skipped = 0;
    for (const r of (rows || []) as any[]) {
      const to = phone(r.family_phone);
      const { data: prev } = await admin.from("google_review_requests").select("tries").eq("discharge_id", r.discharge_id).maybeSingle();
      const tries = Number(prev?.tries || 0) + 1;
      if (!to) {
        await admin.from("google_review_requests").upsert({ discharge_id: r.discharge_id, patient_id: r.patient_id, status: "Failed", error: "No valid family WhatsApp number", tries: 3, updated_at: new Date().toISOString() });
        skipped += 1; continue;
      }
      // Mark first, so a crash can never send the same family twice.
      await admin.from("google_review_requests").upsert({ discharge_id: r.discharge_id, patient_id: r.patient_id, recipient_number: to, recipient_name: r.family_name, status: "Sending", error: null, tries, updated_at: new Date().toISOString() });
      try {
        const res = await samaraInboxFetch(`https://graph.facebook.com/${graph}/${phoneId}/messages`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: settings.template_name || "samara_google_review", language: { code: "en" },
            components: [{ type: "body", parameters: [{ type: "text", text: compact(r.family_name, 40, "Family Member") }, { type: "text", text: compact(r.guest_name, 50, "your family member") }] }] } }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result?.error?.message || JSON.stringify(result));
        await admin.from("google_review_requests").update({ status: "Sent", provider_message_id: result?.messages?.[0]?.id || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("discharge_id", r.discharge_id);
        await admin.from("discharge_workflow_events").insert({ discharge_id: r.discharge_id, event_type: "Google rating request sent (WhatsApp)", details: { to, meta_message_id: result?.messages?.[0]?.id || null } }).then(() => {}, () => {});
        sent += 1;
      } catch (e) {
        await admin.from("google_review_requests").update({ status: "Failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 900), updated_at: new Date().toISOString() }).eq("discharge_id", r.discharge_id);
        failed += 1;
      }
    }
    return json({ success: true, due: (rows || []).length, sent, failed, skipped });
  } catch (error) {
    console.error("Google review dispatch error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function samaraInboxFetch(input: any, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const isMeta = /^https:\/\/graph\.facebook\.com\/[^/]+\/[^/]+\/messages(?:\?|$)/.test(url);
  if (!isMeta || String(init?.method || "GET").toUpperCase() !== "POST") return globalThis.fetch(input, init);
  const payload = JSON.parse(String(init?.body || "{}"));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const template = payload.template?.name || null;
  const params = (payload.template?.components || []).filter((c: any) => c.type === "body").flatMap((c: any) => c.parameters || []).map((p: any) => String(p.text ?? ""));
  const content = payload.document?.caption || (template ? `Template: ${template}${params.length ? "\n" + params.join("\n") : ""}` : `[${payload.type || "WhatsApp"} message]`);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const reserved = await db.from("hr_whatsapp_communications").insert({ id, recipient_number: String(payload.to || "").replace(/\D/g, ""), template_name: template,
    communication_type: template ? `WhatsApp · ${template}` : "WhatsApp Document", direction: "outbound", message_type: payload.type || "template", status: "Sending",
    message_content: content, message_payload: { inbox_transport: true, body_params: params }, source_type: "Patient / Family", created_at: now, updated_at: now });
  if (reserved.error) throw new Error("WhatsApp was not sent because Inbox recording is unavailable. " + reserved.error.message);
  let response: Response;
  try { response = await globalThis.fetch(input, init); }
  catch (error) { await db.from("hr_whatsapp_communications").update({ status: "Unknown", error_message: "Network interrupted. Acceptance is unknown; check before resending.", updated_at: new Date().toISOString() }).eq("id", id); throw error; }
  let result: any = {}; try { result = await response.clone().json(); } catch { /* keep provider response */ }
  const providerId = result?.messages?.[0]?.id || null, when = new Date().toISOString();
  const status = response.ok ? (providerId ? "Accepted" : "Unknown") : "Failed";
  const saved = await db.from("hr_whatsapp_communications").update({ provider_message_id: providerId, status, sent_at: status === "Accepted" ? when : null, failed_at: status === "Failed" ? when : null,
    error_message: status === "Failed" ? String(result?.error?.message || `Provider rejected the message (${response.status})`) : status === "Unknown" ? "Provider did not return a message ID. Check before resending." : null, updated_at: when }).eq("id", id);
  if (saved.error) console.error("WhatsApp Inbox outcome update failed", id, saved.error.message);
  const headers = new Headers(response.headers); headers.set("x-samara-inbox-id", id);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
