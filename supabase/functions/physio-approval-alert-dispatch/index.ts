// Self-contained for Supabase Dashboard deployment. Edge Function: physio-approval-alert-dispatch (ERP 2.18.126, SQL 294).
// Phone notification to the Nursing Manager and Admin when a physiotherapy reschedule / correction request is waiting
// for approval. The requester never gets it (Nursing Manager's own request → Admin only). Tapping the notification
// opens the ERP on that one request (Approve / Reject). Who gets it and "only once per phone" are decided in
// physio_approval_claim_push (SQL 294).
// Uses the existing secrets only: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Called every minute by pg_cron (job samara-physio-approval-alert-dispatch). Keep legacy JWT verification ON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (name: string) => String(Deno.env.get(name) || "").trim();
const key = (name: string) => env(name).replace(new RegExp("^" + name + "="), "").replace(/^['"]|['"]$/g, "").replace(/\s+/g, "").replace(/=+$/g, "");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const dateIN = (v: string) => v ? v.slice(8, 10) + "-" + v.slice(5, 7) + "-" + v.slice(0, 4) : "";
const timeIN = (v: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(v)).toUpperCase();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  try {
    if (!key("VAPID_PUBLIC_KEY") || !key("VAPID_PRIVATE_KEY")) throw Error("Mobile push is not configured");
    webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@samaraassistedliving.com", key("VAPID_PUBLIC_KEY"), key("VAPID_PRIVATE_KEY"));
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: rows, error: re } = await db.rpc("physio_approval_push_rows");
    if (re) throw re;
    if (!rows?.length) return json({ ok: true, pending: 0, sent: 0, failed: 0 });

    const { data: subs, error: se } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("is_active", true);
    if (se) throw se;

    let sent = 0, failed = 0;
    for (const r of rows as any[]) {
      const alertKey = "physio-request:" + r.request_id;
      const who = [r.patient_name || "Guest", r.room_label ? "Room " + r.room_label : ""].filter(Boolean).join(", ");
      const label = [r.patient_name, r.action, dateIN(r.session_date)].filter(Boolean).join(" · ");
      const url = "./?push_page=Physiotherapy&push_focus_kind=physio_request&push_focus_id=" + encodeURIComponent(r.request_id) + "&push_focus_label=" + encodeURIComponent(label);
      const payload = JSON.stringify({
        title: "SAMARA · Physio " + String(r.action || "change").toLowerCase() + " needs approval",
        body: `${who} · session ${dateIN(r.session_date)}. ${r.requested_by_name || "Care team"} asked at ${timeIN(r.requested_at)}: "${String(r.reason || "").slice(0, 120)}". Tap to approve or reject.`,
        tag: "samara-physio-request-" + r.request_id,
        event_kind: "physio_approval",
        url,
        renotify: true, requireInteraction: true,
        icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
      });
      for (const sub of subs || []) {
        const { data: claimed, error: ce } = await db.rpc("physio_approval_claim_push", { p_alert_key: alertKey, p_subscription: sub.id, p_requested_by: r.requested_by });
        if (ce) { console.error("Physio approval push claim failed:", ce.message); continue; }
        if (!claimed) continue;
        let accepted = false;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload, { TTL: 3600, urgency: "high" });
          accepted = true; sent++;
          await db.from("physio_approval_push_receipts").update({ state: "sent", sent_at: new Date().toISOString(), detail: null }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
        } catch (error: any) {
          failed++;
          const status = Number(error?.statusCode) || 0;
          // Never replay an accepted or ambiguous delivery. Retry explicit transient rejections only.
          const retry = !accepted && (status === 429 || status >= 500);
          await db.from("physio_approval_push_receipts").update({
            state: retry ? "retry" : "failed",
            retry_after: retry ? new Date(Date.now() + 300000).toISOString() : null,
            detail: accepted ? "Push accepted; receipt update failed" : status ? "Push provider HTTP " + status : "Delivery uncertain; automatic retry suppressed",
          }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
          if (status === 404 || status === 410) await db.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    return json({ ok: true, pending: rows.length, sent, failed });
  } catch (error: any) {
    console.error("Physio approval alert dispatch failed:", error?.message || "Unknown error");
    return json({ error: "Physio approval alert dispatch failed" }, 500);
  }
});
