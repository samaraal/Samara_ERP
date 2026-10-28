// ERP 2.18.185 — Razorpay safety net for Family Portal payments (28-10-2026).
//
// Why: a Family Portal payment is posted to the ledger ONLY when the family's phone comes back to the portal
// and calls razorpay-verify-payment. If the page is closed / reloaded while the UPI app is open, the session has
// expired, or the outstanding changed meanwhile, Razorpay keeps the money (Captured) but the ERP never records it —
// no ledger credit, no WhatsApp receipt. (MOG-2026-10-0013, ₹8,083, 26-10-2026.)
//
// What: every 5 minutes (cron, SQL 313) this asks Razorpay for its captured payments of the last few days.
// Any payment of a Family Portal order (order notes samara_patient_id + samara_payment_type, set by
// razorpay-create-order) that is NOT yet in billing_transactions is posted exactly as razorpay-verify-payment
// posts it, dated at the real payment time, and its WhatsApp receipt is queued (sent by the existing 2-minute
// staff-payment-request background check). Payments younger than 10 minutes are left to the portal itself.
// Staff payment links / QRs and Outside Nursing are not touched (their own background checks cover them).
//
// Call: POST with header x-cron-secret = CRON_SECRET. Optional query: ?days=N (1–90, default 3) &dry_run=1.
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) || "";

const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const rzAuth = "Basic " + btoa(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`);

async function rz(path: string) {
  const r = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { Authorization: rzAuth } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Razorpay ${path.split("?")[0]}: ${d?.error?.description || r.status}`);
  return d;
}
async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Database ${path.split("?")[0]}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json().catch(() => null);
}

async function run(days: number, dryRun: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400, settled = now - 10 * 60; // leave the last 10 minutes to the portal itself
  const payments: any[] = [];
  for (let skip = 0; skip < 2000; skip += 100) {
    const page = await rz(`payments?from=${from}&to=${settled}&count=100&skip=${skip}`);
    payments.push(...(page.items || []));
    if ((page.items || []).length < 100) break;
  }
  const orders = new Map<string, any>();
  const result = { checked: payments.length, family_portal: 0, already_recorded: 0, recovered: [] as any[], skipped: [] as any[], dry_run: dryRun, days };

  for (const p of payments) {
    if (p.status !== "captured" || !p.order_id || String(p.currency) !== "INR") continue;
    let order = orders.get(p.order_id);
    if (!order) { order = await rz(`orders/${encodeURIComponent(p.order_id)}`); orders.set(p.order_id, order); }
    const patientId = String(order?.notes?.samara_patient_id || "");
    const type = String(order?.notes?.samara_payment_type || "").toLowerCase();
    if (!patientId || !["outstanding", "advance"].includes(type)) continue; // not a Family Portal order
    result.family_portal++;

    const found = await db(`billing_transactions?select=id&description=ilike.*${encodeURIComponent(p.id)}*&limit=1`);
    if ((found || []).length) { result.already_recorded++; continue; }

    const info = { payment_id: p.id, order_id: p.order_id, amount: Number(p.amount) / 100, paid_at: new Date(p.created_at * 1000).toISOString(), type };
    if (Number(order.amount) !== Number(p.amount)) { result.skipped.push({ ...info, reason: "amount differs from order" }); continue; }
    const patient = (await db(`patients?select=id,patient_id,full_name&id=eq.${encodeURIComponent(patientId)}&limit=1`))?.[0];
    if (!patient) { result.skipped.push({ ...info, reason: "Guest not found" }); continue; }
    const row = { ...info, patient_code: patient.patient_id, guest: patient.full_name };
    if (dryRun) { result.recovered.push(row); continue; }

    // Re-check just before posting (the portal may have posted it meanwhile).
    if (((await db(`billing_transactions?select=id&description=ilike.*${encodeURIComponent(p.id)}*&limit=1`)) || []).length) { result.already_recorded++; continue; }
    const description = [
      type === "advance" ? "Family Portal online advance" : "Family Portal online payment",
      `Razorpay Payment ID: ${p.id}`,
      `Razorpay Order ID: ${p.order_id}`,
      "Recorded by background check (portal did not confirm)",
    ].join(" · ");
    const inserted = await db("billing_transactions?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        patient_id: patient.id,
        transaction_type: type === "advance" ? "Advance" : "Payment",
        category: type === "advance" ? "Online Advance" : "Online Payment",
        amount: info.amount,
        description,
        payment_mode: "Razorpay Online",
        transaction_date: info.paid_at,
      }),
    });
    const txId = inserted?.[0]?.id;
    if (txId) {
      // Queue the automatic WhatsApp receipt (sent by the staff-payment-request 2-minute check, any age).
      await db("ledger_payment_receipts?on_conflict=billing_transaction_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ billing_transaction_id: txId, source: "Family Portal", receipt_status: "Queued", receipt_tries: 0 }),
      });
    }
    result.recovered.push({ ...row, billing_transaction_id: txId });
    console.log("Recovered Family Portal payment", JSON.stringify(row));
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
    if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ success: false, error: "Not allowed" }, 401);
    if (!serviceKey || !env("RAZORPAY_KEY_ID") || !env("RAZORPAY_KEY_SECRET")) throw new Error("Server configuration is incomplete");
    const q = new URL(req.url).searchParams;
    const days = Math.min(90, Math.max(1, Number(q.get("days") || 3)));
    return json({ success: true, ...(await run(days, q.get("dry_run") === "1")) });
  } catch (e) {
    console.error("razorpay-reconcile", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
