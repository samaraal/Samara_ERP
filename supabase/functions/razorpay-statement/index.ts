// ERP 2.19.61 — Razorpay Statement (Admin / Directors only) · 03-11-2026.
//
// What: reads Razorpay directly (payments, settlements, settlement recon) for a chosen period and returns
//   1. money received into Razorpay (captured payments, with Razorpay fee + GST on each),
//   2. money paid out by Razorpay to Samara's bank (settlements, with UTR and the payments each one covered),
//   3. money still with Razorpay (captured but not yet settled),
//   4. checks: captured payments missing from the ERP, amount differences, payments unsettled for too long.
// Each payment is matched to the ERP record it was posted to (Guest ledger via billing_transactions, or
// Outside Samara Nursing via outside_nursing_payments) by its Razorpay payment id.
//
// Read only: nothing is written to Razorpay or to the ERP.
// Call (ERP sign-in, Admin role): POST {from:"YYYY-MM-DD", to:"YYYY-MM-DD"}  (India dates, max 92 days, from 27-08-2026)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) || "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const rzAuth = "Basic " + btoa(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`);
const FIRST_DAY = "2026-08-27"; // Samara inaugurated
const IST = 19800; // seconds
const PAY_ID = /pay_[A-Za-z0-9]{14}/g;

async function rz(path: string) {
  const r = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { Authorization: rzAuth } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Razorpay ${path.split("?")[0]}: ${d?.error?.description || r.status}`);
  return d;
}
async function rzAll(path: string, count = 100, max = 5000) {
  const out: any[] = [];
  for (let skip = 0; skip < max; skip += count) {
    const page = await rz(`${path}${path.includes("?") ? "&" : "?"}count=${count}&skip=${skip}`);
    const items = page.items || [];
    out.push(...items);
    if (items.length < count) break;
  }
  return out;
}
async function requireAdmin(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw Object.assign(new Error("ERP sign-in required."), { status: 401 });
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw Object.assign(new Error("ERP session is invalid. Please sign in again."), { status: 401 });
  const { data: p } = await admin.from("profiles").select("id,role,is_active").or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`).limit(1).maybeSingle();
  if (!p || p.is_active === false || p.role !== "Admin") throw Object.assign(new Error("The Razorpay Statement is for Admin / Directors only."), { status: 403 });
  return p;
}

const day = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const epochIST = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / 1000) - IST; // 00:00 India time
const istDate = (epoch: number) => new Date((epoch + IST) * 1000).toISOString().slice(0, 10);
const rupees = (paise: unknown) => Math.round(Number(paise || 0)) / 100;

function methodLabel(p: any) {
  if (p.method === "card") {
    const t = String(p.card?.type || "").toLowerCase();
    return t === "credit" ? "Credit Card" : t === "debit" ? "Debit Card" : t === "prepaid" ? "Prepaid Card" : "Card";
  }
  return ({ upi: "UPI", netbanking: "Net Banking", wallet: "Wallet", emi: "EMI", cardless_emi: "Cardless EMI", paylater: "Pay Later", bank_transfer: "Bank Transfer" } as Record<string, string>)[p.method] || String(p.method || "—");
}

// Which ERP record each Razorpay payment id was posted to.
async function erpMatches(ids: string[]) {
  const found = new Map<string, any[]>();
  const add = (id: string, row: any) => { const a = found.get(id) || []; a.push(row); found.set(id, a); };
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const ors = [`payment_reference.in.(${chunk.join(",")})`, ...chunk.map((id) => `description.ilike.*${id}*`)].join(",");
    const { data, error } = await admin.from("billing_transactions")
      .select("id,patient_id,transaction_type,category,amount,transaction_date,description,payment_reference,payment_mode")
      .or(ors).limit(500);
    if (error) throw new Error("ERP ledger: " + error.message);
    for (const t of data || []) {
      const hits = new Set([...(String(t.description || "").match(PAY_ID) || []), ...(String(t.payment_reference || "").match(PAY_ID) || [])]);
      for (const id of hits) if (chunk.includes(id)) add(id, { kind: "guest", ...t });
    }
    // Outside Samara Nursing online payments (SQL 233). Ignore if that table/column is not present.
    const on = await admin.from("outside_nursing_payments").select("id,visit_id,amount,payment_date,gateway_payment_id").in("gateway_payment_id", chunk);
    if (!on.error) for (const r of on.data || []) add(r.gateway_payment_id, { kind: "outside", ...r });
  }
  // Names
  const patientIds = [...new Set([...found.values()].flat().filter((r) => r.kind === "guest" && r.patient_id).map((r) => r.patient_id))];
  const patients = new Map<string, any>();
  for (let i = 0; i < patientIds.length; i += 100) {
    const { data } = await admin.from("patients").select("id,patient_id,title,full_name,is_trial").in("id", patientIds.slice(i, i + 100));
    for (const p of data || []) patients.set(p.id, p);
  }
  const visitIds = [...new Set([...found.values()].flat().filter((r) => r.kind === "outside" && r.visit_id).map((r) => r.visit_id))];
  const visits = new Map<string, any>();
  if (visitIds.length) {
    const v = await admin.from("outside_nursing_visits").select("id,invoice_number,procedure_name,patient_id").in("id", visitIds);
    if (!v.error) {
      const op = new Map<string, any>();
      const pids = [...new Set((v.data || []).map((x: any) => x.patient_id).filter(Boolean))];
      if (pids.length) { const q = await admin.from("outside_nursing_patients").select("id,full_name").in("id", pids); for (const x of q.data || []) op.set(x.id, x); }
      for (const x of v.data || []) visits.set(x.id, { ...x, name: op.get(x.patient_id)?.full_name || "" });
    }
  }
  const out = new Map<string, any>();
  for (const [id, rows] of found) {
    out.set(id, rows.map((r) => {
      if (r.kind === "outside") {
        const v = visits.get(r.visit_id);
        return { source: "Outside Samara Nursing", name: v?.name || "Outside Nursing patient", code: v?.invoice_number || "", detail: v?.procedure_name || "", amount: Number(r.amount || 0), date: r.payment_date, record_id: r.id };
      }
      const p = patients.get(r.patient_id);
      const name = [p?.title, p?.full_name].filter(Boolean).join(" ").replace(/^(\S+)\s+\1/, "$1");
      return { source: "Guest ledger", name: name || "Guest", code: p?.patient_id || "", detail: [r.transaction_type, r.category].filter(Boolean).join(" · "), amount: Number(r.amount || 0), date: r.transaction_date, record_id: r.id, trial: Boolean(p?.is_trial) };
    }));
  }
  return out;
}

async function statement(from: string, to: string) {
  const now = Math.floor(Date.now() / 1000);
  const pFrom = epochIST(from), pTo = Math.min(epochIST(to) + 86400 - 1, now);
  // Fetch payments for the period AND the last 15 days, so "still with Razorpay" is correct today.
  const wFrom = Math.min(pFrom, now - 15 * 86400), wTo = Math.max(pTo, now);
  let payments: any[];
  try { payments = await rzAll(`payments?from=${wFrom}&to=${wTo}&expand[]=card`); }
  catch { payments = await rzAll(`payments?from=${wFrom}&to=${wTo}`); }
  const settlements = await rzAll(`settlements?from=${pFrom}&to=${pTo}`);

  // Settlement recon: which payment went in which settlement. Month by month from the earliest payment month.
  const recon: any[] = [];
  const start = new Date((wFrom + IST) * 1000), end = new Date((now + IST) * 1000);
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth() + 1; y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth() + 1);) {
    try { recon.push(...await rzAll(`settlements/recon/combined?year=${y}&month=${m}`, 1000, 20000)); } catch (e) { console.warn("recon", y, m, e); }
    m++; if (m > 12) { m = 1; y++; }
  }
  const reconByEntity = new Map<string, any>();
  const reconBySettlement = new Map<string, any[]>();
  for (const r of recon) {
    if (r.entity_id && r.type === "payment") reconByEntity.set(r.entity_id, r);
    if (r.settlement_id) { const a = reconBySettlement.get(r.settlement_id) || []; a.push(r); reconBySettlement.set(r.settlement_id, a); }
  }
  const settlementInfo = new Map<string, any>();
  for (const s of settlements) settlementInfo.set(s.id, s);

  const captured = payments.filter((p) => ["captured", "refunded"].includes(p.status) && String(p.currency) === "INR");
  const erp = await erpMatches([...new Set(captured.map((p) => p.id))]);

  const toRow = (p: any) => {
    const rc = reconByEntity.get(p.id);
    const matches = erp.get(p.id) || [];
    const amount = rupees(p.amount), fee = rupees(p.fee), tax = rupees(p.tax), refunded = rupees(p.amount_refunded);
    const erpAmount = matches.reduce((t: number, m: any) => t + Number(m.amount || 0), 0);
    return {
      id: p.id,
      at: new Date(p.created_at * 1000).toISOString(),
      date: istDate(p.created_at),
      method: methodLabel(p),
      card_network: p.card?.network || "",
      status: p.status,
      amount, fee: Math.round((fee - tax) * 100) / 100, gst: tax, fee_total: fee, refunded,
      net: Math.round((amount - fee - refunded) * 100) / 100,
      contact: p.contact || "", email: p.email && p.email !== "void@razorpay.com" ? p.email : "",
      order_id: p.order_id || "", description: p.description || "",
      rrn: p.acquirer_data?.rrn || p.acquirer_data?.upi_transaction_id || "",
      settled: Boolean(rc?.settled || rc?.settlement_id),
      settlement_id: rc?.settlement_id || "", settlement_utr: rc?.settlement_utr || "",
      settled_on: rc?.settled_at ? istDate(Number(rc.settled_at)) : "",
      erp: matches,
      erp_amount: Math.round(erpAmount * 100) / 100,
    };
  };
  const rows = captured.map(toRow);
  const inPeriod = rows.filter((r) => r.at >= new Date(pFrom * 1000).toISOString() && r.at <= new Date(pTo * 1000).toISOString())
    .sort((a, b) => a.at.localeCompare(b.at));
  const unsettled = rows.filter((r) => r.status === "captured" && !r.settled && r.net > 0).sort((a, b) => a.at.localeCompare(b.at));

  const settlementRows = settlements.map((s: any) => {
    const items = (reconBySettlement.get(s.id) || []);
    const pays = items.filter((x) => x.type === "payment").map((x) => ({ id: x.entity_id, amount: rupees(x.amount), fee: rupees(x.fee), gst: rupees(x.tax), credit: rupees(x.credit) }));
    const other = items.filter((x) => x.type !== "payment").map((x) => ({ id: x.entity_id, type: x.type, debit: rupees(x.debit), credit: rupees(x.credit) }));
    return {
      id: s.id, date: istDate(s.created_at), at: new Date(s.created_at * 1000).toISOString(), utr: s.utr || "", status: s.status,
      amount: rupees(s.amount), fee: Math.round((rupees(s.fees) - rupees(s.tax)) * 100) / 100, gst: rupees(s.tax),
      payments: pays, adjustments: other,
    };
  }).sort((a: any, b: any) => a.at.localeCompare(b.at));

  // Checks
  const checks: any[] = [];
  for (const r of inPeriod) {
    if (!r.erp.length) checks.push({ type: "not_in_erp", severity: r.amount <= 10 ? "info" : "high", payment_id: r.id, date: r.date, amount: r.amount, text: r.amount <= 10 ? `Small test payment ₹${r.amount} — not in the ERP (expected for gateway tests)` : `₹${r.amount.toLocaleString("en-IN")} received in Razorpay but not recorded in the ERP` });
    else if (Math.abs(r.erp_amount - (r.amount - r.refunded)) > 0.5) checks.push({ type: "amount_differs", severity: "high", payment_id: r.id, date: r.date, amount: r.amount, text: `Razorpay ₹${r.amount.toLocaleString("en-IN")}${r.refunded ? ` (refunded ₹${r.refunded})` : ""} but ERP shows ₹${r.erp_amount.toLocaleString("en-IN")}` });
    if (r.erp.length > 1) checks.push({ type: "posted_twice", severity: "high", payment_id: r.id, date: r.date, amount: r.amount, text: `The same Razorpay payment is recorded ${r.erp.length} times in the ERP` });
    if (r.refunded) checks.push({ type: "refund", severity: "info", payment_id: r.id, date: r.date, amount: r.refunded, text: `₹${r.refunded.toLocaleString("en-IN")} refunded from Razorpay on this payment` });
  }
  for (const r of unsettled) if (now - Date.parse(r.at) / 1000 > 5 * 86400) checks.push({ type: "slow_settlement", severity: "high", payment_id: r.id, date: r.date, amount: r.amount, text: `Captured on ${r.date.split("-").reverse().join("-")} but not yet paid to the bank (more than 5 days)` });

  const sum = (a: any[], k: string) => Math.round(a.reduce((t, x) => t + Number(x[k] || 0), 0) * 100) / 100;
  const failed = payments.filter((p) => p.status === "failed" && p.created_at >= pFrom && p.created_at <= pTo).length;
  return {
    from, to, generated_at: new Date().toISOString(),
    received: inPeriod,
    settlements: settlementRows,
    unsettled,
    checks,
    totals: {
      received: sum(inPeriod, "amount"), received_count: inPeriod.length,
      upi: sum(inPeriod.filter((r) => r.method === "UPI"), "amount"),
      card: sum(inPeriod.filter((r) => /Card/.test(r.method)), "amount"),
      other: sum(inPeriod.filter((r) => r.method !== "UPI" && !/Card/.test(r.method)), "amount"),
      fee: sum(inPeriod, "fee"), gst: sum(inPeriod, "gst"), fee_total: sum(inPeriod, "fee_total"),
      refunded: sum(inPeriod, "refunded"),
      settled: sum(settlementRows, "amount"), settled_count: settlementRows.length,
      unsettled: sum(unsettled, "net"), unsettled_gross: sum(unsettled, "amount"), unsettled_count: unsettled.length,
      failed_attempts: failed,
      checks_high: checks.filter((c) => c.severity === "high").length,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!env("RAZORPAY_KEY_ID") || !env("RAZORPAY_KEY_SECRET")) throw new Error("Razorpay keys are not set on the server.");
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const from = String(body.from || ""), to = String(body.to || "");
    if (!day(from) || !day(to)) return json({ error: "Choose a valid From and To date." }, 400);
    if (from > to) return json({ error: "From date is after To date." }, 400);
    if (from < FIRST_DAY) return json({ error: "Samara records start on 27-08-2026." }, 400);
    if ((epochIST(to) - epochIST(from)) / 86400 > 92) return json({ error: "Please choose a period of up to 3 months." }, 400);
    return json({ success: true, ...(await statement(from, to)) });
  } catch (e: any) {
    console.error("razorpay-statement", e);
    return json({ error: e?.message || String(e) }, e?.status || 500);
  }
});
