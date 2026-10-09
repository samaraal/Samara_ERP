// Self-contained for Supabase Dashboard deployment. Edge Function: withheld-dose-alert-dispatch (ERP 2.16.10, SQL 210).
// Phone notification to Nurses, Nursing Manager, Managers and Admin / Directors as soon as a nurse WITHHOLDS a
// medicine dose, repeated every 30 minutes until the doctor's instruction is recorded in Medicines.
// Who gets it is decided in withheld_dose_claim_push (SQL 210), which also makes sure each phone gets each
// reminder only once. Uses the existing secrets only: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Called every minute by pg_cron (job samara-withheld-dose-alert-dispatch). Keep legacy JWT verification ON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (name: string) => String(Deno.env.get(name) || "").trim();
const key = (name: string) => env(name).replace(new RegExp("^" + name + "="), "").replace(/^['"]|['"]$/g, "").replace(/\s+/g, "").replace(/=+$/g, "");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const timeIN = (v: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(v)).toUpperCase();
const doseTime = (hhmm: string) => { const [h, m] = String(hhmm || "").split(":").map(Number); if (!Number.isFinite(h)) return hhmm || ""; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const waited = (min: number) => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  try {
    if (!key("VAPID_PUBLIC_KEY") || !key("VAPID_PRIVATE_KEY")) throw Error("Mobile push is not configured");
    webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@samaraassistedliving.com", key("VAPID_PUBLIC_KEY"), key("VAPID_PRIVATE_KEY"));
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: rows, error: re } = await db.rpc("withheld_dose_open_rows", { p_now: new Date().toISOString() });
    if (re) throw re;
    const due = (rows || []).filter((r: any) => r.push_due);
    if (!due.length) return json({ ok: true, open: rows?.length || 0, sent: 0, failed: 0 });

    const { data: subs, error: se } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("is_active", true);
    if (se) throw se;

    let sent = 0, failed = 0;
    for (const r of due as any[]) {
      const alertKey = `${r.dose_id}:${r.round_no}`;
      const who = [r.guest_name || "Guest", r.room_label].filter(Boolean).join(", ");
      const why = [r.withhold_reason, r.withhold_reading].filter(Boolean).join(", ");
      const payload = JSON.stringify({
        title: r.round_no > 0 ? "SAMARA · Withheld dose — doctor's instruction still pending" : "SAMARA · Medicine dose withheld",
        body: `${who}: ${r.medicine || "medicine"} (${doseTime(r.scheduled_time)}) withheld at ${timeIN(r.withheld_at)}${why ? ` — ${why}` : ""}. Doctor informed: ${r.doctor_name || "—"}.${r.round_no > 0 ? ` Waiting ${waited(r.minutes)}.` : ""} Record the doctor's instruction in Medicines.`,
        tag: "samara-withheld-" + r.dose_id,
        event_kind: "medicine_withheld",
        url: "./?push_page=Medicines",
        renotify: true, requireInteraction: true,
        icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
      });
      for (const sub of subs || []) {
        const { data: claimed, error: ce } = await db.rpc("withheld_dose_claim_push", { p_alert_key: alertKey, p_subscription: sub.id });
        if (ce) { console.error("Withheld dose push claim failed:", ce.message); continue; }
        if (!claimed) continue;
        let accepted = false;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload, { TTL: 600, urgency: "high" });
          accepted = true; sent++;
          await db.from("withheld_dose_push_receipts").update({ state: "sent", sent_at: new Date().toISOString(), detail: null }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
        } catch (error: any) {
          failed++;
          const status = Number(error?.statusCode) || 0;
          // Never replay an accepted or ambiguous delivery. Retry explicit transient rejections only.
          const retry = !accepted && (status === 429 || status >= 500);
          await db.from("withheld_dose_push_receipts").update({
            state: retry ? "retry" : "failed",
            retry_after: retry ? new Date(Date.now() + 300000).toISOString() : null,
            detail: accepted ? "Push accepted; receipt update failed" : status ? "Push provider HTTP " + status : "Delivery uncertain; automatic retry suppressed",
          }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
          if (status === 404 || status === 410) await db.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    return json({ ok: true, open: rows?.length || 0, due: due.length, sent, failed });
  } catch (error: any) {
    console.error("Withheld dose alert dispatch failed:", error?.message || "Unknown error");
    return json({ error: "Withheld dose alert dispatch failed" }, 500);
  }
});
