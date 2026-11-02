import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
function cleanSecret(value: string, name: string) {
  let v = String(value || "").trim();
  // Tolerate secrets accidentally pasted with NAME= prefix, quotes, spaces/newlines or base64 padding.
  const prefix = `${name}=`;
  if (v.startsWith(prefix)) v = v.slice(prefix.length).trim();
  v = v.replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  if (name === "VAPID_PUBLIC_KEY" || name === "VAPID_PRIVATE_KEY") v = v.replace(/=+$/g, "");
  return v;
}

const VAPID_PUBLIC_KEY = cleanSecret(Deno.env.get("VAPID_PUBLIC_KEY") || "", "VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = cleanSecret(Deno.env.get("VAPID_PRIVATE_KEY") || "", "VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = String(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@samaraassistedliving.com").trim();
const CRON_SECRET = String(Deno.env.get("CRON_SECRET") || "").trim();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok:false, error:"POST required" }, 405);
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ ok:false, error:"Unauthorized" }, 401);
    }
    if (!SUPABASE_URL || !SERVICE_ROLE || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ ok:false, error:"Missing server secrets" }, 500);
    }

    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    } catch (e) {
      console.error("VAPID configuration error:", e);
      return json({
        ok:false,
        error:"Invalid VAPID configuration",
        detail:e instanceof Error ? e.message : String(e),
        public_key_length:VAPID_PUBLIC_KEY.length,
        private_key_length:VAPID_PRIVATE_KEY.length
      }, 500);
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth:{ persistSession:false, autoRefreshToken:false } });

    // Make sure overdue items have first been promoted into the formal escalation register.
    const { error: processError } = await db.rpc("process_clinical_alert_escalations");
    if (processError) throw processError;

    const { data: escalations, error: escError } = await db.rpc("get_mobile_push_candidates");
    if (escError) throw escError;
    if (!escalations?.length) return json({ ok:true, escalations:0, pushes:0, results:[] });

    const patientIds = [...new Set(escalations.map((e:any)=>e.patient_id).filter(Boolean))];
    const { data: patients } = patientIds.length ? await db.from("patients").select("id,full_name,room_no,bed_no").in("id",patientIds) : { data:[] as any[] };
    const patientMap = new Map((patients||[]).map((p:any)=>[p.id,p]));

    // Load active devices first, then resolve each device through BOTH user_id and profile_id.
    // Older Samara registrations may be linked through either column.
    const { data: activeSubs, error: subError } = await db
      .from("push_subscriptions")
      .select("id,user_id,profile_id,endpoint,p256dh,auth_key,is_active,last_seen_at")
      .eq("is_active", true);
    if (subError) throw subError;
    if (!activeSubs?.length) {
      return json({ ok:true, escalations:escalations.length, subscriptions:0, pushes:0, warning:"No active push subscriptions" });
    }

    const linkedProfileIds = [...new Set(
      (activeSubs as any[])
        .flatMap((s:any)=>[s.user_id, s.profile_id])
        .filter(Boolean)
    )];

    const { data: linkedProfiles, error: profError } = linkedProfileIds.length
      ? await db.from("duty_profiles").select("id,full_name,role").in("id", linkedProfileIds)
      : { data:[] as any[], error:null };
    if (profError) throw profError;

    const roleByProfileId = new Map((linkedProfiles||[]).map((p:any)=>[p.id, String(p.role||"").trim()]));
    const isAdminTierRole = (role:string) => {
      const r = String(role||"").trim().toLowerCase();
      return r === "admin" || r === "administrator" || r === "director" || r.includes("administrator") || r.includes("director");
    };
    const isManagerTierRole = (role:string) => {
      const r = String(role||"").trim().toLowerCase();
      return r === "manager" || r.endsWith(" manager") || r.startsWith("manager ");
    };
    const isEscalationRecipientRole = (role:string) => isAdminTierRole(role) || isManagerTierRole(role);
    // v2.14.32 escalation levels: Vital Signs go to Managers at 60 min ("Manager"),
    // then to Admin/Directors at 90 min ("Admin"). Everything else goes to both ("Manager+Admin").
    const audienceAllows = (e:any, role:string) => {
      const level = String(e?.escalated_to_role || "").trim();
      const vital = String(e?.alert_type || "").trim().toLowerCase() === "vital signs";
      if (vital && level === "Manager") return isManagerTierRole(role);
      if (vital && level === "Admin") return isAdminTierRole(role) || isManagerTierRole(role);
      return isEscalationRecipientRole(role);
    };

    const subs = (activeSubs as any[]).map((s:any) => {
      const userRole = s.user_id ? roleByProfileId.get(s.user_id) || "" : "";
      const profileRole = s.profile_id ? roleByProfileId.get(s.profile_id) || "" : "";
      const role = isEscalationRecipientRole(userRole) ? userRole : profileRole;
      return { ...s, role };
    }).filter((s:any) => isEscalationRecipientRole(s.role));

    if (!subs.length) {
      return json({
        ok:true, escalations:escalations.length, active_subscriptions:activeSubs.length,
        subscriptions:0, pushes:0,
        warning:"Active devices found, but none are linked to an Admin/Administrator/Director/Manager profile",
        linked_roles:[...new Set((linkedProfiles||[]).map((p:any)=>String(p.role||"").trim()).filter(Boolean))]
      });
    }

    let pushes = 0;
    const results:any[] = [];

    for (const e of escalations as any[]) {
      const p:any = patientMap.get(e.patient_id) || {};
      const room = [p.room_no, p.bed_no].filter(Boolean).join("-");
      const levelLabel = String(e.alert_type||"").toLowerCase() === "vital signs"
        ? (String(e.escalated_to_role||"") === "Admin" ? " · ADMIN (90 MIN)" : " · MANAGER (60 MIN)") : "";
      const title = `${String(e.priority||"URGENT").toUpperCase()} · SAMARA CLINICAL ESCALATION${levelLabel}`;
      const body = [
        e.alert_type || "Clinical alert",
        p.full_name || "Resident",
        room ? `Room ${room}` : "",
        e.escalation_reason || "More than 30 minutes overdue"
      ].filter(Boolean).join(" · ");
      const payload = JSON.stringify({
        title, body,
        icon:"./icons/icon-192.png", badge:"./icons/icon-192.png",
        tag:`samara-escalation-${e.id}`,
        renotify:false, requireInteraction:true,
        event_kind:"escalation", alert_key:e.alert_key || "",
        url:"./?push_page=Clinical%20Alerts"
      });

      for (const s of (subs as any[]).filter((x:any) => audienceAllows(e, x.role))) {
        // The database rechecks activation/current state and atomically claims
        // this escalation/device pair. Successful deliveries are never replayed.
        const { data: claimed, error: claimError } = await db.rpc("claim_mobile_escalation_push", {
          p_escalation_id:e.id, p_subscription_id:s.id
        });
        if (claimError) throw claimError;
        if (!claimed) continue;

        try {
          const response:any = await webpush.sendNotification({
            endpoint:s.endpoint,
            keys:{ p256dh:s.p256dh, auth:s.auth_key }
          }, payload, { TTL:60, urgency:"high" as any });

          // Record success separately from the legacy audit log. An audit log
          // failure must not turn an accepted push into a resend next minute.
          const { error: receiptError } = await db.rpc("complete_mobile_escalation_push", {
            p_escalation_id:e.id, p_subscription_id:s.id
          });
          if (receiptError) throw new Error(`Push accepted but receipt failed: ${receiptError.message}`);
          const deliveredAt = new Date().toISOString();
          const { error: sentLogError } = await db.from("clinical_push_delivery_log").insert({
            escalation_id:e.id, alert_key:e.alert_key, subscription_id:s.id,
            user_id:s.user_id || s.profile_id || null, event_kind:"escalation", status:"sent",
            http_status:response?.statusCode || 201,
            delivered_at:deliveredAt, created_at:deliveredAt,
            provider_detail:JSON.stringify(response?.headers || {})
          });
          if (sentLogError) console.error("Push accepted; audit log failed:", sentLogError.message);
          pushes++;
          results.push({ escalation_id:e.id, subscription_id:s.id, status:"sent" });
        } catch (err:any) {
          const status = Number(err?.statusCode || 0) || null;
          const message = String(err?.body || err?.message || err);
          // Retry only explicit transient provider rejections. A timeout may
          // already have delivered: retain its claim for operator review.
          if (status === 429 || (status !== null && status >= 500)) {
            const { error: retryError } = await db.rpc("retry_mobile_escalation_push", {
              p_escalation_id:e.id, p_subscription_id:s.id
            });
            if (retryError) console.error("Unable to schedule push retry:", retryError.message);
          }
          const failedAt = new Date().toISOString();
          const { error: failedLogError } = await db.from("clinical_push_delivery_log").insert({
            escalation_id:e.id, alert_key:e.alert_key, subscription_id:s.id,
            user_id:s.user_id || s.profile_id || null, event_kind:"escalation", status:"failed",
            http_status:status, delivered_at:failedAt, created_at:failedAt,
            error_message:message.slice(0,2000)
          });
          if (failedLogError) {
            console.error("Failed to write push failure log:", failedLogError.message);
            results.push({ escalation_id:e.id, subscription_id:s.id, status:"log_failed", error:failedLogError.message });
          }
          // 404/410 means the browser push endpoint is permanently invalid.
          if (status === 404 || status === 410) {
            await db.from("push_subscriptions").update({ is_active:false, updated_at:new Date().toISOString() }).eq("id",s.id);
          }
          results.push({ escalation_id:e.id, subscription_id:s.id, status:"failed", http_status:status, error:message.slice(0,300) });
        }
      }
    }

    return json({ ok:true, escalations:escalations.length, subscriptions:subs.length, pushes, results });
  } catch (err:any) {
    console.error(err);
    return json({ ok:false, error:String(err?.message || err) }, 500);
  }
});
