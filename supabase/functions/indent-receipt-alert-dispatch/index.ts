// Self-contained for Supabase Dashboard deployment. Edge Function: indent-receipt-alert-dispatch (ERP 2.15.89, SQL 205).
// Phone notification to the nurse who raised the indent and to the Nursing Manager when an indent is still
// "Handed Over" (nurse has not pressed Received) 20 minutes after the store handed it over; repeated every
// 20 minutes while still not received. Who gets it is decided in indent_claim_receipt_push (SQL 205), which
// also makes sure each phone gets each reminder only once.
// Uses the existing secrets only: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Called every minute by pg_cron (job samara-indent-receipt-alert-dispatch). Keep legacy JWT verification ON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (name: string) => String(Deno.env.get(name) || "").trim();
const key = (name: string) => env(name).replace(new RegExp("^" + name + "="), "").replace(/^['"]|['"]$/g, "").replace(/\s+/g, "").replace(/=+$/g, "");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const timeIN = (v: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(v)).toUpperCase();
const firstName = (v: unknown) => String(v || "").replace(/\s+/g, " ").trim() || "the nurse";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  try {
    if (!key("VAPID_PUBLIC_KEY") || !key("VAPID_PRIVATE_KEY")) throw Error("Mobile push is not configured");
    webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@samaraassistedliving.com", key("VAPID_PUBLIC_KEY"), key("VAPID_PRIVATE_KEY"));
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: rows, error: re } = await db.rpc("indent_receipt_overdue_rows", { p_now: new Date().toISOString() });
    if (re) throw re;
    const due = (rows || []).filter((r: any) => r.push_due);
    if (!due.length) return json({ ok: true, overdue: rows?.length || 0, sent: 0, failed: 0 });

    const { data: subs, error: se } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("is_active", true);
    if (se) throw se;

    let sent = 0, failed = 0;
    for (const r of due as any[]) {
      const alertKey = `${r.indent_id}:${r.round_no}`;
      const who = [r.guest_name || "Guest", r.room_label].filter(Boolean).join(", ");
      const payload = JSON.stringify({
        title: "SAMARA · Indent not received yet",
        body: `${r.indent_ref}: ${r.item_name} × ${r.quantity} ${r.unit || ""} for ${who} was handed over at ${timeIN(r.handed_over_at)} (${r.minutes} min ago). ${firstName(r.nurse_name)} has not pressed Received in the ERP.`,
        tag: "samara-indent-receipt-" + r.indent_id,
        event_kind: "indent_receipt",
        url: "./?push_page=Notifications",
        renotify: true, requireInteraction: true,
        icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
      });
      for (const sub of subs || []) {
        const { data: claimed, error: ce } = await db.rpc("indent_claim_receipt_push", { p_alert_key: alertKey, p_subscription: sub.id, p_nurse_id: r.nurse_id });
        if (ce) { console.error("Indent receipt push claim failed:", ce.message); continue; }
        if (!claimed) continue;
        let accepted = false;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload, { TTL: 600, urgency: "high" });
          accepted = true; sent++;
          await db.from("indent_receipt_push_receipts").update({ state: "sent", sent_at: new Date().toISOString(), detail: null }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
        } catch (error: any) {
          failed++;
          const status = Number(error?.statusCode) || 0;
          // Never replay an accepted or ambiguous delivery. Retry explicit transient rejections only.
          const retry = !accepted && (status === 429 || status >= 500);
          await db.from("indent_receipt_push_receipts").update({
            state: retry ? "retry" : "failed",
            retry_after: retry ? new Date(Date.now() + 300000).toISOString() : null,
            detail: accepted ? "Push accepted; receipt update failed" : status ? "Push provider HTTP " + status : "Delivery uncertain; automatic retry suppressed",
          }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
          if (status === 404 || status === 410) await db.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    return json({ ok: true, overdue: rows?.length || 0, due: due.length, sent, failed });
  } catch (error: any) {
    console.error("Indent receipt alert dispatch failed:", error?.message || "Unknown error");
    return json({ error: "Indent receipt alert dispatch failed" }, 500);
  }
});
