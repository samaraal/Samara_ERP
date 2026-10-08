// Self-contained for Supabase Dashboard deployment. Edge Function: staff-return-alert-dispatch (ERP 2.15.90, SQL 206).
// Phone notification to Admin / Director when (a) a staff member's leave has ended and no Manager has marked her
// back on duty 2 hours after her rostered shift started (10 AM if no roster), or (b) a Manager marks her back on duty.
// One notification per leave per event; who gets it is decided in staff_return_claim_push (SQL 206).
// Uses the existing secrets only: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Called every minute by pg_cron (job samara-staff-return-alert-dispatch). Keep legacy JWT verification ON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (name: string) => String(Deno.env.get(name) || "").trim();
const key = (name: string) => env(name).replace(new RegExp("^" + name + "="), "").replace(/^['"]|['"]$/g, "").replace(/\s+/g, "").replace(/=+$/g, "");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const timeIN = (v: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(v)).toUpperCase();
const dateIN = (v: string) => { const [y, m, d] = String(v || "").slice(0, 10).split("-"); return d ? `${d}-${m}-${y}` : String(v || ""); };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  try {
    if (!key("VAPID_PUBLIC_KEY") || !key("VAPID_PRIVATE_KEY")) throw Error("Mobile push is not configured");
    webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@samaraassistedliving.com", key("VAPID_PUBLIC_KEY"), key("VAPID_PRIVATE_KEY"));
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: rows, error: re } = await db.rpc("staff_return_push_rows", { p_now: new Date().toISOString() });
    if (re) throw re;
    const due = rows || [];
    if (!due.length) return json({ ok: true, events: 0, sent: 0, failed: 0 });

    const { data: subs, error: se } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("is_active", true);
    if (se) throw se;

    let sent = 0, failed = 0;
    for (const r of due as any[]) {
      const alertKey = String(r.alert_key);
      const name = r.employee_name || "Staff";
      const text = r.alert === "Not back"
        ? { title: "SAMARA · Staff not back on duty", body: `${name} was due back on ${dateIN(r.due_date)}${r.due_shift ? " (" + r.due_shift + ")" : ""} after leave, but is not marked back on duty. Please check with the Manager.` }
        : { title: "SAMARA · Staff back on duty", body: `${name} is back on duty${r.returned_at ? " from " + timeIN(r.returned_at) + " on " + new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(r.returned_at)).replace(/\//g, "-") : ""}${Number(r.late_days) > 0 ? " — " + r.late_days + " day(s) late" : ""}${r.recorded_by_name ? ". Marked by " + r.recorded_by_name : ""}.` };
      const payload = JSON.stringify({
        ...text,
        tag: "samara-staff-return-" + alertKey,
        event_kind: "staff_return",
        url: "./?push_page=Notifications",
        renotify: true, requireInteraction: r.alert === "Not back",
        icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
      });
      for (const sub of subs || []) {
        const { data: claimed, error: ce } = await db.rpc("staff_return_claim_push", { p_alert_key: alertKey, p_subscription: sub.id, p_recorded_by: r.alert === "Not back" ? null : r.recorded_by });
        if (ce) { console.error("Staff return push claim failed:", ce.message); continue; }
        if (!claimed) continue;
        let accepted = false;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload, { TTL: 600, urgency: "high" });
          accepted = true; sent++;
          await db.from("staff_return_push_receipts").update({ state: "sent", sent_at: new Date().toISOString(), detail: null }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
        } catch (error: any) {
          failed++;
          const status = Number(error?.statusCode) || 0;
          // Never replay an accepted or ambiguous delivery. Retry explicit transient rejections only.
          const retry = !accepted && (status === 429 || status >= 500);
          await db.from("staff_return_push_receipts").update({
            state: retry ? "retry" : "failed",
            retry_after: retry ? new Date(Date.now() + 300000).toISOString() : null,
            detail: accepted ? "Push accepted; receipt update failed" : status ? "Push provider HTTP " + status : "Delivery uncertain; automatic retry suppressed",
          }).eq("alert_key", alertKey).eq("subscription_id", sub.id);
          if (status === 404 || status === 410) await db.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    return json({ ok: true, events: due.length, sent, failed });
  } catch (error: any) {
    console.error("Staff return alert dispatch failed:", error?.message || "Unknown error");
    return json({ error: "Staff return alert dispatch failed" }, 500);
  }
});
