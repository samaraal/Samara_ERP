// Self-contained for Supabase Dashboard deployment. Edge Function: discharge-summary (ERP 2.15.83).
// Builds the Guest's Discharge Summary PDF from ALL ERP records of the stay (admission -> departure),
// stores it in the private "patient-reports" bucket and, when asked, sends it to the registered family
// WhatsApp number as a PDF attachment (Meta template samara_discharge_summary with a DOCUMENT header).
//
// Modes (POST JSON, signed-in ERP user):
//   { mode:"generate_only", discharge_id | patient_id }                    -> { report_url, file_name, storage_path }
//   { mode:"send", discharge_id, recipient_mobile, recipient_name, automatic } -> also sends the WhatsApp PDF
// Rules: discharge must be Completed. Open PDF: Admin / Manager / Nurse. Send: Admin / Manager any time; Nurse only
// within 12 hours of the departure (the automatic send that runs when the nurse completes the final discharge). The recipient must be one of
// the Guest's registered numbers. Medicine doses WITHHELD by nurses are internal and are not printed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const TEMPLATE = "samara_discharge_summary";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const text = (v: unknown) => String(v ?? "").trim();
const digits = (v: unknown) => text(v).replace(/\D/g, "");
const last10 = (v: unknown) => digits(v).slice(-10);
// Standard PDF fonts are WinAnsi: keep the few typographic marks it has, drop everything else.
const pdfText = (v: unknown) => text(v)
  .replace(/[  \t]/g, " ").replace(/\r?\n+/g, " ")
  .replace(/[‐‑‒−]/g, "-").replace(/₹/g, "Rs. ").replace(/…/g, "...")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\x20-\x7e•°–—‘’“”×]/g, "");

// ---------- India date helpers (DD-MM-YYYY everywhere) ----------
const TZ = "Asia/Kolkata";
const isoDay = (v: unknown) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(String(v))); } catch { return ""; } };
const dmy = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return y && m && d ? `${d}-${m}-${y}` : "-"; };
const dm = (iso: string) => dmy(iso).slice(0, 5);
const time12 = (v: unknown) => { try { return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(String(v))).toUpperCase(); } catch { return "-"; } };
const dmyTime = (v: unknown) => v ? `${dmy(isoDay(v))}, ${time12(v)}` : "-";
const hhmm12 = (t: unknown) => { const m = text(t).match(/^(\d{1,2}):(\d{2})/); if (!m) return text(t); const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`; };
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x !== 0 ? x : null; };
const lc = (v: unknown) => text(v).toLowerCase();
const guestName = (p: any) => [text(p.title), text(p.full_name)].filter(Boolean).join(" ") || "Guest";
const listLines = (v: unknown) => text(v).split(/\r?\n|;/).map(x => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);

async function rows(sb: any, table: string, patientId: string) { const r = await sb.from(table).select("*").eq("patient_id", patientId); return r.error ? [] : (r.data || []); }

// =====================================================================================
// DATA: everything recorded for the stay
// =====================================================================================
async function collect(sb: any, patient: any, discharge: any) {
  const pid = patient.id;
  const [vitals, careLogs, careOrders, orders, mar, meals, beverages, physio, incidents, handovers, reviews, familyAccess] = await Promise.all([
    rows(sb, "vital_signs", pid), rows(sb, "care_logs", pid), rows(sb, "care_orders", pid), rows(sb, "medication_orders", pid),
    rows(sb, "medication_administrations", pid), rows(sb, "meal_records", pid), rows(sb, "beverage_records", pid),
    rows(sb, "physiotherapy_sessions", pid), rows(sb, "incidents", pid), rows(sb, "shift_handovers", pid),
    rows(sb, "medication_reviews", pid), sb.from("family_portal_access").select("relative_name,relationship,mobile,primary_contact,is_active").eq("patient_id", pid).then((r: any) => r.data || [], () => []),
  ]);
  const reviewIds = reviews.map((r: any) => r.id);
  const items = reviewIds.length ? ((await sb.from("medication_review_items").select("*").in("review_id", reviewIds)).data || []) : [];
  const departure = discharge.actual_departure_at || discharge.final_departure_at || discharge.completed_at || new Date().toISOString();
  const startDay = text(patient.admission_date).slice(0, 10) || isoDay(patient.created_at);
  const endDay = isoDay(departure);
  const inStay = (v: unknown) => { const d = v ? (String(v).length === 10 ? String(v) : isoDay(v)) : ""; return Boolean(d) && d >= startDay && d <= endDay; };
  const by = (k: string[]) => (x: any) => { for (const key of k) if (x[key]) return x[key]; return null; };
  const when = (x: any, keys: string[]) => by(keys)(x);
  const sortBy = (a: any[], keys: string[]) => [...a].sort((x, y) => +new Date(when(x, keys)) - +new Date(when(y, keys)));
  return {
    departure, startDay, endDay, familyAccess,
    vitals: sortBy(vitals.filter((x: any) => inStay(x.recorded_at || x.created_at)), ["recorded_at", "created_at"]),
    careLogs: careLogs.filter((x: any) => inStay(x.completed_at || x.created_at || x.care_date)), careOrders,
    orders, mar: mar.filter((x: any) => inStay(x.scheduled_date || x.administered_at || x.created_at)),
    meals: meals.filter((x: any) => inStay(x.meal_date || x.served_at || x.created_at)),
    beverages: beverages.filter((x: any) => inStay(x.given_at || x.created_at)),
    physio: physio.filter((x: any) => inStay(x.session_at || x.session_date || x.created_at)),
    incidents: sortBy(incidents.filter((x: any) => inStay(x.incident_at || x.created_at)), ["incident_at", "created_at"]),
    handovers: sortBy(handovers.filter((x: any) => inStay(x.created_at || x.handover_date)), ["created_at"]),
    reviews: sortBy(reviews.filter((x: any) => inStay(x.reviewed_at || x.created_at)), ["reviewed_at", "created_at"]), items,
  };
}

const VITAL_CRITICAL = (x: any) => (num(x.spo2) !== null && num(x.spo2)! < 90) || (num(x.systolic) !== null && (num(x.systolic)! >= 180 || num(x.systolic)! < 80)) || (num(x.pulse) !== null && (num(x.pulse)! > 130 || num(x.pulse)! < 40));
const VITAL_REVIEW = (x: any) => (num(x.spo2) !== null && num(x.spo2)! < 94) || (num(x.systolic) !== null && (num(x.systolic)! >= 160 || num(x.systolic)! < 90)) || (num(x.pulse) !== null && (num(x.pulse)! > 110 || num(x.pulse)! < 50));
const range = (a: number[]) => a.length ? (Math.min(...a) === Math.max(...a) ? `${Math.min(...a)}` : `${Math.min(...a)}-${Math.max(...a)}`) : "-";
const avg = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null;
const sugarOf = (x: any) => num(x.blood_sugar) !== null ? `${text(x.blood_sugar_type) && !/not taken/i.test(text(x.blood_sugar_type)) ? text(x.blood_sugar_type) : "RBS"} ${num(x.blood_sugar)}` : "";
const medLabel = (o: any) => text(o.medicine_name) || "Medicine";
const freqLabel = (f: unknown) => { const v = text(f); if (/^HS$/i.test(v)) return "At bedtime"; if (/\(OD\)/.test(v)) return "Once daily"; if (/\(BD\)/.test(v)) return "Twice daily"; if (/\(TDS\)/.test(v)) return "Three times daily"; if (/\(QID\)/.test(v)) return "Four times daily"; return v || "-"; };
const timesLabel = (t: unknown) => (Array.isArray(t) ? t : text(t).split(",")).map(hhmm12).filter(Boolean).join(", ") || "-";

function analyse(patient: any, discharge: any, d: any) {
  const name = guestName(patient);
  const female = lc(patient.gender) === "female", male = lc(patient.gender) === "male";
  const pronoun = female ? "She" : male ? "He" : "The Guest";
  const possessive = female ? "her" : male ? "his" : "the Guest's";
  let age = Number(patient.age) || null;
  if (!age && patient.date_of_birth) { const b = new Date(patient.date_of_birth); age = Math.floor((+new Date(d.departure) - +b) / 31557600000); }
  const dx = listLines(patient.diagnosis);
  const allergies = listLines(patient.allergies);
  const admitAt = patient.admission_time ? `${dmy(d.startDay)}, ${hhmm12(patient.admission_time)}` : dmy(d.startDay);
  const stayDays = Math.max(1, Math.round((+new Date(`${d.endDay}T00:00:00Z`) - +new Date(`${d.startDay}T00:00:00Z`)) / 86400000) + 1);
  const nights = Math.max(0, stayDays - 1);

  // Vitals
  const V = d.vitals;
  const sys = V.map((x: any) => num(x.systolic)).filter((x: any) => x !== null) as number[];
  const dia = V.map((x: any) => num(x.diastolic)).filter((x: any) => x !== null) as number[];
  const pul = V.map((x: any) => num(x.pulse)).filter((x: any) => x !== null) as number[];
  const spo = V.map((x: any) => num(x.spo2)).filter((x: any) => x !== null) as number[];
  const tmp = V.map((x: any) => num(x.temperature)).filter((x: any) => x !== null) as number[];
  const sugars = V.filter((x: any) => sugarOf(x)).map((x: any) => `${sugarOf(x)} mg/dL (${dmy(isoDay(x.recorded_at || x.created_at))})`);
  const critical = V.filter(VITAL_CRITICAL).length, review = V.filter((x: any) => !VITAL_CRITICAL(x) && VITAL_REVIEW(x)).length;
  const first = V[0], lastV = V[V.length - 1];
  const vitalLine = (x: any) => x ? [num(x.systolic) !== null ? `BP ${num(x.systolic)}/${num(x.diastolic) ?? "-"} mmHg` : "", num(x.pulse) !== null ? `pulse ${num(x.pulse)}/min` : "", num(x.spo2) !== null ? `SpO2 ${num(x.spo2)}%` : "", num(x.temperature) !== null ? `temperature ${num(x.temperature)}°F` : "", sugarOf(x) ? `${sugarOf(x)} mg/dL` : ""].filter(Boolean).join(", ") : "";

  // Medicines (withheld doses are internal and are not printed)
  const orderMap: Record<string, any> = Object.fromEntries(d.orders.map((o: any) => [o.id, o]));
  const marName = (x: any) => text(x.medicine_name) || medLabel(orderMap[x.order_id || x.medication_order_id] || {});
  const marRows = d.mar.filter((x: any) => lc(x.status) !== "withheld" && lc(x.status) !== "rescheduled");
  const given = marRows.filter((x: any) => lc(x.status) === "given");
  const notGiven = marRows.filter((x: any) => ["missed", "omitted", "refused", "not given", "delayed"].includes(lc(x.status)));
  const perMed: Record<string, { given: number; missed: number }> = {};
  for (const x of marRows) { const k = marName(x); perMed[k] = perMed[k] || { given: 0, missed: 0 }; if (lc(x.status) === "given") perMed[k].given++; else if (notGiven.includes(x)) perMed[k].missed++; }
  let dischargeMeds = d.orders.filter((o: any) => o.discharge_id === discharge.id);
  if (!dischargeMeds.length) dischargeMeds = d.orders.filter((o: any) => o.is_active !== false && !o.stopped_at && lc(o.status) !== "stopped");
  dischargeMeds = [...dischargeMeds].sort((a: any, b: any) => medLabel(a).localeCompare(medLabel(b)));

  // Doctor reviews: describe only what changed
  const reviewNotes = d.reviews.map((r: any) => {
    const its = d.items.filter((i: any) => i.review_id === r.id);
    const kept = its.filter((i: any) => lc(i.action) === "continue").length;
    const changes = its.filter((i: any) => lc(i.action) !== "continue").map((i: any) => {
      const o = i.old_snapshot || {}, n = i.new_snapshot || {}, a = lc(i.action), m = text(i.medicine_name) || text(n.medicine_name) || "Medicine";
      if (a === "stop") return `${m} stopped`;
      if (a === "add" || a === "new") return `${m} ${text(n.strength || n.dose)} started (${freqLabel(n.frequency)}${n.scheduled_times ? `, ${timesLabel(n.scheduled_times)}` : ""})`;
      const diff: string[] = [];
      if (text(o.strength || o.dose) !== text(n.strength || n.dose)) diff.push(`dose ${text(o.strength || o.dose) || "-"} to ${text(n.strength || n.dose) || "-"}`);
      if (text(o.frequency) !== text(n.frequency)) diff.push(`frequency ${freqLabel(o.frequency)} to ${freqLabel(n.frequency)}`);
      if (timesLabel(o.scheduled_times) !== timesLabel(n.scheduled_times)) diff.push(`time ${timesLabel(o.scheduled_times)} to ${timesLabel(n.scheduled_times)}`);
      if (text(o.food_instruction) !== text(n.food_instruction) && n.food_instruction) diff.push(`${lc(n.food_instruction)}`);
      return `${m}: ${diff.length ? diff.join(", ") : "modified"}`;
    });
    return { title: `${dmyTime(r.reviewed_at || r.created_at)} • ${text(r.doctor_name) || "Doctor"}${text(r.review_type) ? ` (${text(r.review_type)}${text(r.order_mode) ? `, ${lc(r.order_mode)}` : ""})` : ""}`, kept, changes, notes: text(r.clinical_notes) };
  });

  // Daily care, food, physio, incidents
  const careOrderMap: Record<string, any> = Object.fromEntries(d.careOrders.map((o: any) => [o.id, o]));
  const careCount: Record<string, number> = {};
  for (const x of d.careLogs.filter((x: any) => ["completed", "done", "given"].includes(lc(x.status)))) { const o = careOrderMap[x.care_order_id] || {}; const k = text(o.care_type || o.task_name) || text(x.remarks) || "Care activity"; careCount[k] = (careCount[k] || 0) + 1; }
  const careTotal = Object.values(careCount).reduce((a, b) => a + b, 0);
  const careBreakdown = Object.entries(careCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" • ");
  const mealsFull = d.meals.filter((x: any) => /fully/i.test(text(x.consumption_status))).length;
  const mealsPart = d.meals.filter((x: any) => /partial/i.test(text(x.consumption_status))).length;
  const mealsPoor = d.meals.length - mealsFull - mealsPart;
  const bevKinds = [...new Set(d.beverages.map((x: any) => text(x.beverage) === "Fresh Juice" ? "fresh juice" : lc(x.beverage)).filter(Boolean))];
  const bevFull = d.beverages.filter((x: any) => /fully/i.test(text(x.consumption_status))).length;
  const physioDone = d.physio.filter((x: any) => lc(x.status) === "completed").length;
  const falls = d.incidents.filter((x: any) => /fall/i.test(text(x.incident_type || x.type))).length;

  // Nursing handover notes: behaviour pattern in plain words
  const H = d.handovers;
  const hText = (x: any) => `${text(x.patient_summary)} ${text(x.special_instructions)}`.replace(/\b(no|nil|without)\s+(signs?\s+of\s+|any\s+)?(agitation|restlessness)/gi, "");
  const agitDays = [...new Set(H.filter((x: any) => /agitat|restless|aggress|irritab|wander/i.test(hText(x))).map((x: any) => isoDay(x.created_at)))].sort() as string[];
  const share = (re: RegExp) => H.length ? H.filter((x: any) => re.test(hText(x))).length / H.length : 0;
  const traits = [share(/conscious|concious|consious/i) >= .5 ? "conscious" : "", share(/orient/i) >= .5 ? "oriented" : "", share(/stable/i) >= .5 ? "stable" : "", share(/slept well|sleep well|sleeping well/i) >= .3 ? "sleeping well" : "", share(/cooperat/i) >= .2 ? "cooperative with care" : ""].filter(Boolean);
  const reassurance = H.some((x: any) => /calm|reassur|repeated question/i.test(hText(x)));
  const hydration = H.some((x: any) => /hydrat|water frequently/i.test(hText(x)));
  const diaperPlan = H.some((x: any) => /diaper/i.test(hText(x)) && /2\s*(nd)?\s*hour|every 2|2hours|2 hours/i.test(hText(x)));
  const lastNote = [...H].reverse().find((x: any) => text(x.patient_summary));

  // Narrative
  const admissionWhy = lc(patient.admission_type || patient.patient_category || "care");
  const p1 = `${name}${age ? `, a ${age}-year-old ${female ? "lady" : male ? "gentleman" : "Guest"}` : ""}${dx.length ? ` with ${dx.join(", ").toLowerCase().replace(/, ([^,]*)$/, " and $1")}` : ""}, was admitted to Samara on ${dmy(d.startDay)} for ${admissionWhy}.${first ? ` On arrival ${possessive} readings were ${vitalLine(first)}.` : ""}`;
  let p2 = "";
  if (H.length) {
    p2 = agitDays.length
      ? `Nursing handovers recorded agitation or restlessness on ${agitDays.map(dmy).join(", ")}${reassurance ? ", which settled with calm reassurance" : ""}.${agitDays[agitDays.length - 1] < d.endDay ? ` No further agitation was recorded after ${dmy(agitDays[agitDays.length - 1])}.` : ""} `
      : "No agitation or behaviour concern was recorded in the nursing handovers. ";
    if (traits.length) p2 += `Across ${H.length} nursing handover notes, ${lc(pronoun) === "the guest" ? "the Guest was" : `${lc(pronoun)} was`} mostly described as ${traits.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
  }
  const p3parts: string[] = [];
  if (V.length) p3parts.push(`Vital signs were recorded ${V.length} times. Blood pressure ranged from ${sys.length ? Math.min(...sys) : "-"}/${dia.length ? Math.min(...dia) : "-"} to ${sys.length ? Math.max(...sys) : "-"}/${dia.length ? Math.max(...dia) : "-"} mmHg, SpO2 ${range(spo)}% and pulse ${range(pul)}/min${critical ? `, with ${critical} reading(s) in the critical range` : review ? `, with ${review} reading(s) needing closer observation and no critical readings` : ", with no critical readings"}.`);
  if (sugars.length) p3parts.push(`Blood sugar: ${sugars.join("; ")}.`);
  if (marRows.length) p3parts.push(`${given.length} of ${given.length + notGiven.length} scheduled medicine doses were given${notGiven.length ? ` (${notGiven.length} missed or refused)` : ", with none missed"}.`);
  if (reviewNotes.length) p3parts.push(`${reviewNotes.length === 1 ? "One doctor review was" : `${reviewNotes.length} doctor reviews were`} recorded${reviewNotes.some((r: any) => r.changes.length) ? `; changes: ${reviewNotes.flatMap((r: any) => r.changes).join("; ")}` : " and all medicines were continued"}.`);
  if (d.meals.length) p3parts.push(`${pronoun} ate ${mealsFull === d.meals.length ? "all" : `${mealsFull} of ${d.meals.length}`} recorded meals fully${text(patient.feeding_instruction || patient.diet_plan) ? ` on a ${lc(patient.feeding_instruction || patient.diet_plan)}` : ""}.`);
  p3parts.push(d.incidents.length ? `${d.incidents.length} incident(s) were recorded during the stay${falls ? `, including ${falls} fall(s)` : ""}.` : "There were no falls or incidents during the stay.");
  const p3 = p3parts.join(" ");
  const received = text(discharge.received_by_name || discharge.relative_name);
  const voluntary = /voluntary/i.test(text(discharge.initiation_basis));
  const p4 = `${pronoun} was discharged${text(discharge.destination) ? ` ${/^home$/i.test(text(discharge.destination)) ? "home" : `to ${text(discharge.destination)}`}` : ""} on ${dmy(d.endDay)} at ${time12(d.departure)} in ${lc(discharge.condition_at_discharge) || "stable"} condition${voluntary ? ", at the family's request" : ""}${received ? `, and was received by ${received}${text(discharge.received_by_relationship) ? ` (${lc(discharge.received_by_relationship)})` : ""}` : ""}.`;

  // Advice (only from what is recorded)
  const advice: string[] = [];
  if (text(discharge.doctor_discharge_advice)) advice.push(`Doctor's advice at discharge: ${text(discharge.doctor_discharge_advice)}.`);
  const fu = [text(discharge.review_doctor_name), text(discharge.review_hospital_clinic)].filter(Boolean).join(", ");
  if (discharge.review_appointment_date) advice.push(`Follow-up review on ${dmy(discharge.review_appointment_date)}${discharge.review_appointment_time ? ` at ${hhmm12(discharge.review_appointment_time)}` : ""}${fu ? ` with ${fu}` : ""}.`);
  if (text(discharge.review_instructions)) advice.push(`Follow-up: ${text(discharge.review_instructions).replace(/^./, (c: string) => c.toUpperCase())}${!discharge.review_appointment_date && fu ? ` (${fu})` : ""}.`);
  if (text(discharge.final_instructions)) advice.push(text(discharge.final_instructions));
  if (dischargeMeds.length) advice.push("Continue the medicines listed under Medicines at Discharge at the same times until the doctor reviews them. Do not stop or change any medicine without medical advice.");
  if (text(patient.feeding_instruction || patient.diet_plan)) advice.push(`Continue the ${lc(patient.feeding_instruction || patient.diet_plan)}.${hydration ? " Give water frequently to keep hydrated." : ""}`);
  if (patient.fall_risk || patient.wandering_risk) advice.push(`${[patient.fall_risk ? "falls" : "", patient.wandering_risk ? "wandering" : ""].filter(Boolean).join(" and ").replace(/^./, c => c.toUpperCase())} risk: someone should stay with ${female ? "her" : male ? "him" : "the Guest"} when walking.`);
  if (agitDays.length && reassurance) advice.push("If restless or repeating questions, answer calmly and reassure; this settled well at Samara.");
  if (diaperPlan) advice.push("Check the diaper every 2 hours and change it when wet, as was done at Samara.");
  if (allergies.length) advice.push(`Avoid: ${allergies.join(", ")} (known allergy).`);
  if (dx.some(x => /diab|hypert|bp/i.test(x))) advice.push("Check blood pressure and blood sugar regularly and share the readings with the doctor.");

  const risks = [patient.fall_risk ? "Fall risk" : "", patient.wandering_risk ? "Wandering risk" : "", patient.aspiration_risk ? "Aspiration risk" : "", patient.pressure_sore_risk ? "Pressure sore risk" : "", patient.infection_risk ? "Infection risk" : "", patient.seizure_history ? "Seizure history" : "", patient.oxygen_required ? "Oxygen support" : ""].filter(Boolean);

  return { name, age, pronoun, dx, allergies, risks, admitAt, stayDays, nights, V, sys, dia, pul, spo, tmp, sugars, first, lastV, vitalLine,
    perMed, given, notGiven, marRows, dischargeMeds, reviewNotes, careTotal, careBreakdown, mealsFull, mealsPart, mealsPoor, bevKinds, bevFull,
    physioDone, falls, lastNote, paragraphs: [p1, p2, p3, p4].filter(Boolean), advice };
}

// =====================================================================================
// PDF
// =====================================================================================
async function makePdf(patient: any, discharge: any, d: any, a: any) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Discharge Summary - ${a.name}`); pdf.setAuthor("Samara Health Care LLP"); pdf.setCreator("Samara Care ERP");
  const R = await pdf.embedFont(StandardFonts.Helvetica), B = await pdf.embedFont(StandardFonts.HelveticaBold), SERIF = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const W = 595.28, H = 841.89, M = 36, CW = W - 2 * M, BOTTOM = 58;
  const mag = rgb(.72, .02, .35), deep = rgb(.34, .05, .19), blush = rgb(.985, .905, .94), line = rgb(.94, .80, .87), ink = rgb(.20, .10, .16), grey = rgb(.48, .37, .43), ok = rgb(.04, .54, .29), warn = rgb(.70, .42, 0), white = rgb(1, 1, 1);
  let logo: any = null;
  try { const bytes = await fetch("https://samaraassistedliving.com/assets/samara-logo.png").then(r => r.ok ? r.arrayBuffer() : Promise.reject()); logo = await pdf.embedPng(bytes); } catch { /* text fallback */ }
  const pages: any[] = []; let page: any; let y = 0;
  const wrap = (font: any, value: string, size: number, max: number) => { const out: string[] = []; for (const para of pdfText(value).split(/\s{3,}/)) { let cur = ""; for (const w of para.split(/\s+/).filter(Boolean)) { const nx = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(nx, size) <= max) cur = nx; else { if (cur) out.push(cur); cur = w; while (font.widthOfTextAtSize(cur, size) > max && cur.length > 4) { let i = cur.length - 1; while (i > 1 && font.widthOfTextAtSize(cur.slice(0, i), size) > max) i--; out.push(cur.slice(0, i)); cur = cur.slice(i); } } } if (cur) out.push(cur); } return out.length ? out : [""]; };
  const T = (s: string, x: number, yy: number, size = 9, font = R, color = ink) => page.drawText(pdfText(s), { x, y: yy, size, font, color });
  const newPage = (first = false) => {
    page = pdf.addPage([W, H]); pages.push(page);
    page.drawRectangle({ x: 0, y: H - 7, width: W, height: 7, color: mag });
    if (first) {
      if (logo) { const s = Math.min(92 / logo.width, 60 / logo.height); page.drawImage(logo, { x: M, y: H - 78, width: logo.width * s, height: logo.height * s }); } else T("Samara", M, H - 52, 20, SERIF, mag);
      T("SAMARA HEALTH CARE LLP", M + 108, H - 40, 12.5, SERIF, mag);
      T("Samara Assisted Living", M + 108, H - 54, 8.5, R, grey);
      const title = "DISCHARGE SUMMARY"; T(title, W - M - SERIF.widthOfTextAtSize(title, 17), H - 42, 17, SERIF, deep);
      const ref = `Ref: DS/${text(patient.patient_id) || "-"} • Generated ${dmy(isoDay(new Date()))}`; T(ref, W - M - R.widthOfTextAtSize(pdfText(ref), 7.8), H - 56, 7.8, R, grey);
      page.drawLine({ start: { x: M, y: H - 86 }, end: { x: W - M, y: H - 86 }, thickness: 1.6, color: mag });
      y = H - 100;
    } else {
      T("DISCHARGE SUMMARY", M, H - 30, 9, B, deep); T(`•  ${a.name}  •  ${text(patient.patient_id)}`, M + B.widthOfTextAtSize("DISCHARGE SUMMARY", 9) + 7, H - 30, 9, R, grey);
      const r = `${dmy(d.startDay)} to ${dmy(d.endDay)}`; T(r, W - M - R.widthOfTextAtSize(r, 8.5), H - 30, 8.5, R, grey);
      page.drawLine({ start: { x: M, y: H - 38 }, end: { x: W - M, y: H - 38 }, thickness: .7, color: line });
      y = H - 52;
    }
  };
  const ensure = (h: number) => { if (y - h < BOTTOM) newPage(); };
  const section = (title: string) => { ensure(44); y -= 6; page.drawRectangle({ x: M, y: y - 16, width: CW, height: 17, color: mag }); T(title.toUpperCase(), M + 8, y - 11.5, 8.6, B, white); y -= 26; };
  const kv = (pairs: [string, string][], cols = 2, labelW = 92) => {
    const gap = 18, colW = (CW - gap * (cols - 1)) / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      const chunk = pairs.slice(i, i + cols);
      const lines = chunk.map(([, v]) => wrap(B, v || "-", 8.6, colW - labelW - 6));
      const h = Math.max(...lines.map(l => l.length)) * 11 + 6; ensure(h);
      chunk.forEach(([k], j) => { const x = M + j * (colW + gap); T(k, x, y - 9, 8, R, grey); lines[j].forEach((ln, li) => T(ln, x + labelW, y - 9 - li * 11, 8.6, B, ink)); page.drawLine({ start: { x, y: y - h + 1 }, end: { x: x + colW, y: y - h + 1 }, thickness: .5, color: line, dashArray: [1.5, 2] }); });
      y -= h + 2;
    }
  };
  const para = (s: string, size = 9.2, font = R, color = ink, indent = 0) => { for (const ln of wrap(font, s, size, CW - indent)) { ensure(size + 4); T(ln, M + indent, y - size, size, font, color); y -= size + 3.6; } y -= 4; };
  const bullets = (items: string[]) => { for (const it of items) { const ls = wrap(R, it, 9, CW - 14); ensure(ls.length * 12.6); T("•", M + 3, y - 9, 9, B, mag); ls.forEach((ln, i) => T(ln, M + 14, y - 9 - i * 12.6, 9, R, ink)); y -= ls.length * 12.6 + 2; } y -= 2; };
  const table = (heads: string[], widths: number[], data: string[][], size = 8.2) => {
    const scale = CW / widths.reduce((s, w) => s + w, 0), ws = widths.map(w => w * scale);
    const head = () => { ensure(18); let x = M; page.drawRectangle({ x: M, y: y - 15, width: CW, height: 15, color: blush }); heads.forEach((hd, i) => { T(hd, x + 5, y - 10.5, size, B, deep); x += ws[i]; }); y -= 15; };
    head();
    data.forEach((row, r) => {
      const cells = row.map((c, i) => wrap(R, c || "-", size, ws[i] - 9)); const h = Math.max(...cells.map(c => c.length)) * (size + 2.6) + 6;
      if (y - h < BOTTOM) { newPage(); head(); }
      if (r % 2) page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(1, .98, .99) });
      let x = M; cells.forEach((c, i) => { c.forEach((ln, li) => T(ln, x + 5, y - size - 3 - li * (size + 2.6), size, R, ink)); x += ws[i]; });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + CW, y: y - h }, thickness: .5, color: line }); y -= h;
    });
    y -= 8;
  };
  const chip = (label: string, x: number, yy: number, color = deep, fill = blush) => { const w = B.widthOfTextAtSize(pdfText(label), 7.8) + 14; page.drawRectangle({ x, y: yy - 4, width: w, height: 14, color: fill, borderColor: line, borderWidth: .5 }); T(label, x + 7, yy, 7.8, B, color); return w + 5; };

  // ---------------- Page 1 ----------------
  newPage(true);
  section("Guest Details");
  const discType = [text(discharge.discharge_type), /voluntary/i.test(text(discharge.initiation_basis)) ? "Voluntary (family request)" : text(discharge.initiation_basis)].filter(Boolean).join(" • ");
  const contact = text(discharge.received_by_name || discharge.relative_name || patient.attendant_name);
  const contactNo = text(discharge.received_by_contact || discharge.relative_contact || patient.attendant_phone);
  kv([
    ["Guest Name", a.name], ["Guest ID", text(patient.patient_id) || "-"],
    ["Age / Gender", `${a.age ? `${a.age} years` : "-"} / ${text(patient.gender) || "-"}`], ["Room / Bed", `${text(patient.room_no) || "-"}${text(patient.bed_no) ? ` - ${text(patient.bed_no)}` : ""}`],
    ["Admission Type", text(patient.admission_type) || text(patient.patient_category) || "-"], ["Care Level", text(patient.care_level) || "-"],
    ["Date of Admission", a.admitAt], ["Date of Discharge", `${dmy(d.endDay)}, ${time12(d.departure)}`],
    ["Length of Stay", `${a.stayDays} day${a.stayDays === 1 ? "" : "s"}${a.nights ? ` (${a.nights} night${a.nights === 1 ? "" : "s"})` : ""}`], ["Type of Discharge", discType || "-"],
    ["Reason for Admission", text(patient.referring_source) || text(patient.hospital_name) || "-"], ["Doctor", text(discharge.instructed_by_name) || text(patient.treating_doctor) || text(a.dischargeMeds[0]?.prescribed_by_doctor) || "-"],
    ["Relative / Attendant", `${contact || "-"}${contactNo ? ` • ${contactNo}` : ""}`], ["Discharged To", text(discharge.destination) || "-"],
  ]);

  section("Diagnosis & Alerts");
  kv([["Known Conditions", a.dx.length ? a.dx.map((x: string, i: number) => `${i + 1}. ${x}`).join("   ") : "Not recorded"], ["Allergy", a.allergies.length ? a.allergies.join(", ") : "None recorded"]]);
  if (a.risks.length || text(patient.feeding_instruction || patient.diet_plan)) { ensure(22); let x = M; T("Risk / care flags", x, y - 9, 8, R, grey); x += 92; for (const r of a.risks) x += chip(r, x, y - 9, warn, rgb(1, .955, .88)); if (text(patient.feeding_instruction || patient.diet_plan)) x += chip(text(patient.feeding_instruction || patient.diet_plan), x, y - 9); y -= 24; }

  section("Course During Stay");
  for (const p of a.paragraphs) para(p);

  // Stat tiles
  const stats: [string, string][] = [[`${a.stayDays}`, "days of stay"], [a.marRows.length ? `${a.given.length}/${a.given.length + a.notGiven.length}` : "-", "medicine doses given"], [`${a.V.length}`, "vital-sign checks"], [d.meals.length ? `${a.mealsFull}/${d.meals.length}` : "-", "meals fully eaten"], [`${d.incidents.length}`, "falls or incidents"]];
  ensure(50); const tw = (CW - 4 * 7) / 5;
  stats.forEach(([v, l], i) => { const x = M + i * (tw + 7); page.drawRectangle({ x, y: y - 42, width: tw, height: 42, color: blush, borderColor: line, borderWidth: .6 }); T(v, x + 8, y - 21, 16, SERIF, mag); T(l, x + 8, y - 34, 7.6, R, grey); });
  y -= 54;

  // ---------------- Vitals ----------------
  section("Vital Signs");
  const half = (CW - 10) / 2;
  ensure(52);
  [["AT ADMISSION", a.first], ["AT DISCHARGE", a.lastV]].forEach(([label, x]: any, i) => {
    const bx = M + i * (half + 10); page.drawRectangle({ x: bx, y: y - 46, width: half, height: 46, borderColor: line, borderWidth: .7, color: white });
    T(`${label}${x ? ` • ${dmyTime(x.recorded_at || x.created_at)}` : ""}`, bx + 8, y - 13, 7.6, B, mag);
    wrap(R, x ? a.vitalLine(x) : "Not recorded", 8.8, half - 16).slice(0, 2).forEach((ln, li) => T(ln, bx + 8, y - 27 - li * 11.5, 8.8, R, ink));
  });
  y -= 56;
  if (a.V.length >= 2) {
    // Blood pressure chart (every reading, or daily averages for long stays)
    let pts = a.V.map((x: any) => ({ day: isoDay(x.recorded_at || x.created_at), s: num(x.systolic), dd: num(x.diastolic) })).filter((p: any) => p.s !== null);
    if (pts.length > 45) { const byDay: Record<string, any[]> = {}; pts.forEach((p: any) => (byDay[p.day] = byDay[p.day] || []).push(p)); pts = Object.entries(byDay).map(([day, l]) => ({ day, s: avg(l.map((p: any) => p.s)), dd: avg(l.map((p: any) => p.dd).filter((v: any) => v !== null)) })); }
    const chH = 150; ensure(chH + 22);
    T("Blood pressure across the stay (mmHg)", M, y - 9, 8.6, B, deep); y -= 16;
    const L = M + 28, Rr = M + CW - 6, top = y - 6, bot = y - chH + 24;
    const lo = Math.max(30, Math.floor((Math.min(...pts.map((p: any) => p.dd ?? p.s)) - 10) / 20) * 20), hi = Math.ceil((Math.max(...pts.map((p: any) => p.s)) + 10) / 20) * 20;
    const sy = (v: number) => bot + (v - lo) * (top - bot) / (hi - lo), sx = (i: number) => pts.length === 1 ? (L + Rr) / 2 : L + i * (Rr - L) / (pts.length - 1);
    page.drawRectangle({ x: M, y: bot - 22, width: CW, height: top - bot + 30, borderColor: line, borderWidth: .6 });
    if (140 <= hi && 90 >= lo) { page.drawRectangle({ x: L, y: sy(90), width: Rr - L, height: sy(140) - sy(90), color: rgb(.91, .965, .93) }); const t = "usual range 90-140"; T(t, Rr - R.widthOfTextAtSize(t, 7) - 3, sy(140) - 9, 7, R, ok); }
    for (let g = lo; g <= hi; g += 20) { page.drawLine({ start: { x: L, y: sy(g) }, end: { x: Rr, y: sy(g) }, thickness: .4, color: line }); T(String(g), L - 4 - R.widthOfTextAtSize(String(g), 7), sy(g) - 2.5, 7, R, grey); }
    const plot = (key: "s" | "dd", color: any, dash?: number[]) => { let prev: any = null; pts.forEach((p: any, i: number) => { if (p[key] == null) return; const pt = { x: sx(i), y: sy(p[key]) }; if (prev) page.drawLine({ start: prev, end: pt, thickness: 1.5, color, dashArray: dash }); page.drawCircle({ x: pt.x, y: pt.y, size: 1.9, color }); prev = pt; }); };
    plot("s", mag); plot("dd", deep, [3, 2]);
    T("Systolic", L + 4, sy(pts[0].s) + 5, 7.4, B, mag); if (pts[0].dd != null) T("Diastolic", L + 4, sy(pts[0].dd) - 11, 7.4, B, deep);
    const days = [...new Set(pts.map((p: any) => p.day))] as string[]; const every = Math.ceil(days.length / 10);
    days.forEach((day, k) => { if (k % every) return; const idx = pts.map((p: any, i: number) => p.day === day ? i : -1).filter((i: number) => i >= 0); const cx = (sx(idx[0]) + sx(idx[idx.length - 1])) / 2; const lw = R.widthOfTextAtSize(dm(day), 7); T(dm(day), Math.min(Math.max(cx - lw / 2, L - 4), M + CW - lw - 4), bot - 14, 7, R, grey); });
    y = bot - 30;
  }
  para(`Range over the stay: BP ${a.sys.length ? `${Math.min(...a.sys)}-${Math.max(...a.sys)}` : "-"} / ${a.dia.length ? `${Math.min(...a.dia)}-${Math.max(...a.dia)}` : "-"} mmHg${a.sys.length ? ` (average ${avg(a.sys)}/${avg(a.dia)})` : ""} • Pulse ${range(a.pul)}/min • SpO2 ${range(a.spo)}% • Temperature ${range(a.tmp)}°F${a.sugars.length ? ` • Blood sugar: ${a.sugars.join(", ")}` : ""}.`, 8.2, R, grey);

  // Day-wise vitals table
  if (a.V.length) {
    const byDay: Record<string, any[]> = {}; a.V.forEach((x: any) => (byDay[isoDay(x.recorded_at || x.created_at)] = byDay[isoDay(x.recorded_at || x.created_at)] || []).push(x));
    const nums = (l: any[], k: string) => l.map(x => num(x[k])).filter(v => v !== null) as number[];
    table(["Date", "Checks", "BP (mmHg)", "Pulse", "SpO2 %", "Temp °F", "Blood sugar"], [62, 42, 92, 52, 52, 60, 100],
      Object.entries(byDay).map(([day, l]) => [dmy(day), String(l.length), `${range(nums(l, "systolic"))} / ${range(nums(l, "diastolic"))}`, range(nums(l, "pulse")), range(nums(l, "spo2")), range(nums(l, "temperature")), l.map(sugarOf).filter(Boolean).join(", ") || "-"]));
  }

  // ---------------- Medicines ----------------
  section("Medicines During Stay");
  const medRows = Object.entries(a.perMed as Record<string, { given: number; missed: number }>).sort((x, y2) => x[0].localeCompare(y2[0]));
  if (medRows.length) table(["Medicine", "Doses given", "Missed / refused"], [260, 110, 110], medRows.map(([k, v]) => [k, String(v.given), String(v.missed)]));
  else para("No medicine administration was recorded during the stay.", 9, R, grey);
  for (const r of a.reviewNotes) {
    const body = `${r.changes.length ? `Changes: ${r.changes.join("; ")}.` : "All medicines continued."}${r.changes.length && r.kept ? ` ${r.kept} other medicine(s) continued.` : ""}${r.notes ? ` Notes: ${r.notes}` : ""}`;
    const ls = wrap(R, body, 8.8, CW - 18); const h = 20 + ls.length * 11.5; ensure(h + 6);
    page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: blush }); page.drawRectangle({ x: M, y: y - h, width: 2.5, height: h, color: mag });
    T(`Doctor review • ${r.title}`, M + 10, y - 12, 8.6, B, deep); ls.forEach((ln, i) => T(ln, M + 10, y - 25 - i * 11.5, 8.8, R, ink)); y -= h + 8;
  }

  section("Medicines at Discharge");
  if (a.dischargeMeds.length) {
    table(["Medicine", "Dose", "How often", "Time", "Food"], [150, 80, 90, 100, 80], a.dischargeMeds.map((o: any) => [medLabel(o), text(o.strength || o.dose) || "-", freqLabel(o.frequency), timesLabel(o.scheduled_times), text(o.food_instruction) || "-"]));
    const routes = [...new Set(a.dischargeMeds.map((o: any) => lc(o.route)).filter(Boolean))];
    para(`${routes.length === 1 ? `All medicines are ${routes[0] === "oral" ? "by mouth" : `given ${routes[0]}`}. ` : ""}Continue them as listed until the doctor reviews them. Do not stop or change any medicine without medical advice.`, 8.4, R, grey);
  } else para("No medicines were active at the time of discharge.", 9, R, grey);

  // ---------------- Care & nutrition ----------------
  section("Daily Care & Nutrition");
  kv([
    ["Personal care given", a.careTotal ? `${a.careTotal} recorded episodes` : "Not recorded"], ["Breakdown", a.careBreakdown || "-"],
    ["Diet", text(patient.feeding_instruction || patient.diet_plan) || "Normal diet"], ["Meals recorded", d.meals.length ? `${d.meals.length} • ${a.mealsFull} fully eaten${a.mealsPart ? `, ${a.mealsPart} partly` : ""}${a.mealsPoor > 0 ? `, ${a.mealsPoor} poorly / not eaten` : ""}` : "Not recorded"],
    ["Beverages", d.beverages.length ? `${d.beverages.length} recorded (${a.bevKinds.join(", ")}), ${a.bevFull === d.beverages.length ? "all fully taken" : `${a.bevFull} fully taken`}` : "Not recorded"], ["Physiotherapy", d.physio.length ? `${d.physio.length} sessions (${a.physioDone} completed)` : "Not part of this stay"],
    ["Incidents", d.incidents.length ? d.incidents.map((x: any) => `${dmy(isoDay(x.incident_at || x.created_at))} ${text(x.incident_type) || "Incident"}`).join("; ") : "None"], ["Special instruction", text(patient.special_instructions) || "-"],
  ]);

  section("Condition at Discharge");
  kv([
    ["General condition", text(discharge.condition_at_discharge) || "Stable"], ["Last nursing note", a.lastNote ? `"${text(a.lastNote.patient_summary)}" (${dmyTime(a.lastNote.created_at)})` : "-"],
    ["Received by", `${text(discharge.received_by_name) || contact || "-"}${text(discharge.received_by_relationship) ? ` (${text(discharge.received_by_relationship)})` : ""}${text(discharge.received_by_contact) ? ` • ${text(discharge.received_by_contact)}` : ""}`],
    ["Transport", [text(discharge.transport_mode || discharge.transport_arrangement), text(discharge.transport_details)].filter(Boolean).join(" • ") || "-"],
  ]);

  section("Advice & Follow-up");
  bullets(a.advice.length ? a.advice : ["Continue routine care and follow up with the family doctor."]);

  section("Handover Checklist");
  const checks: [string, boolean][] = [["Discharge medicines", !!discharge.medicines_handed_over], ["Reports & documents", !!discharge.reports_handed_over], ["Belongings", !!discharge.belongings_handed_over], ["Valuables", !!discharge.valuables_handed_over], ["Instructions explained", !!discharge.final_instructions_explained], ["Condition confirmed", !!discharge.patient_condition_confirmed]];
  const cw3 = CW / 3;
  for (let i = 0; i < checks.length; i += 3) { ensure(16); checks.slice(i, i + 3).forEach(([label, done], j) => { const x = M + j * cw3; if (done) { page.drawLine({ start: { x, y: y - 6 }, end: { x: x + 3, y: y - 9 }, thickness: 1.4, color: ok }); page.drawLine({ start: { x: x + 3, y: y - 9 }, end: { x: x + 8, y: y - 2 }, thickness: 1.4, color: ok }); } else T("-", x + 2, y - 9, 9, B, grey); T(`${label}${done ? "" : " (not recorded)"}`, x + 14, y - 9, 8.8, R, done ? ink : grey); }); y -= 15; }

  // Signatures
  ensure(72); y -= 40;
  const sig: [string, string][] = [[text(discharge.completed_by_name) || text(discharge.final_departure_confirmed_by_name) || " ", "Nurse - discharge completed"], [text(discharge.management_approved_by_name) || " ", "Approved for discharge"], [text(discharge.received_by_name) || contact || " ", "Received by (relative)"]];
  const sw = (CW - 36) / 3;
  sig.forEach(([n, role], i) => { const x = M + i * (sw + 18); page.drawLine({ start: { x, y }, end: { x: x + sw, y }, thickness: .7, color: ink }); T(n, x, y - 12, 9, B, ink); T(role, x, y - 23, 7.8, R, grey); });
  y -= 36;
  para("This summary is compiled from the Samara ERP care records for the stay. It does not replace medical advice from the treating doctor.", 7.6, R, grey);

  // Footers
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: .6, color: line });
    pg.drawText(pdfText(`Samara Health Care LLP • Nursing team: 7395961616 / 7339121616 • family.samaraassistedliving.com`), { x: M, y: 28, size: 7.2, font: B, color: mag });
    pg.drawText(pdfText(`${a.name} • ${text(patient.patient_id)} • Confidential`), { x: M, y: 18, size: 7, font: R, color: grey });
    const pn = `Page ${i + 1} of ${pages.length}`; pg.drawText(pn, { x: W - M - R.widthOfTextAtSize(pn, 7.5), y: 22, size: 7.5, font: R, color: grey });
  });
  return await pdf.save();
}

// =====================================================================================
// WhatsApp (Meta Cloud API)
// =====================================================================================
async function sendPdf(to: string, bodyParams: string[], fileName: string, bytes: Uint8Array, caption: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN"), phone = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phone) throw new Error("WhatsApp configuration is missing.");
  const form = new FormData(); form.append("messaging_product", "whatsapp"); form.append("type", "application/pdf");
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  const mediaRes = await fetch(`https://graph.facebook.com/v25.0/${phone}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const media = await mediaRes.json(); if (!mediaRes.ok || !media?.id) throw new Error(`Meta document upload failed: ${media?.error?.message || JSON.stringify(media)}`);
  const send = async (payload: any) => { const r = await samaraInboxFetch(`https://graph.facebook.com/v25.0/${phone}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const res = await r.json().catch(() => ({})); return { ok: r.ok, res, inboxId: r.headers.get("x-samara-inbox-id") }; };
  const tpl = await send({ messaging_product: "whatsapp", to, type: "template", template: { name: TEMPLATE, language: { code: "en" }, components: [
    { type: "header", parameters: [{ type: "document", document: { id: media.id, filename: fileName } }] },
    { type: "body", parameters: bodyParams.map(t => ({ type: "text", text: t })) }] } });
  if (tpl.ok && tpl.res?.messages?.[0]?.id) return { id: tpl.res.messages[0].id, inboxId: tpl.inboxId, route: "template" };
  // Until Meta approves the template: a plain document message works only inside the 24-hour window
  // after the family last wrote to Samara. If that also fails, report the template error.
  const code = Number(tpl.res?.error?.code || 0);
  if ([132000, 132001, 132005, 132007, 132012, 132015, 132016].includes(code)) {
    const doc = await send({ messaging_product: "whatsapp", to, type: "document", document: { id: media.id, filename: fileName, caption } });
    if (doc.ok && doc.res?.messages?.[0]?.id) return { id: doc.res.messages[0].id, inboxId: doc.inboxId, route: "document (24-hour window)" };
    throw new Error(`Template ${TEMPLATE} is not available yet (${tpl.res?.error?.message || code}) and the direct PDF could not be sent: ${doc.res?.error?.message || "outside the 24-hour window"}. Use "Existing WhatsApp" for now.`);
  }
  throw new Error(tpl.res?.error?.message || `Meta rejected the Discharge Summary (${JSON.stringify(tpl.res)})`);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const auth = await sb.auth.getUser(jwt); if (auth.error || !auth.data.user) return json({ ok: false, error: "Your ERP session has expired. Please sign in again." }, 401);
    const uid = auth.data.user.id;
    const prof = await sb.from("duty_profiles").select("id,role,full_name,is_active,active").or(`id.eq.${uid},auth_user_id.eq.${uid}`).maybeSingle();
    const role = text(prof.data?.role);
    if (!prof.data || !(prof.data.is_active ?? prof.data.active ?? false) || !["Admin", "Manager", "Nurse"].includes(role)) return json({ ok: false, error: "Only Admin, Manager or Nurse can use the Discharge Summary." }, 403);
    const body = await req.json().catch(() => ({}));

    let discharge: any = null;
    if (text(body.discharge_id)) discharge = (await sb.from("patient_discharges").select("*").eq("id", text(body.discharge_id)).maybeSingle()).data;
    else if (text(body.patient_id)) discharge = (await sb.from("patient_discharges").select("*").eq("patient_id", text(body.patient_id)).eq("status", "Completed").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data;
    if (!discharge) return json({ ok: false, error: "No discharge record was found for this Guest." }, 404);
    if (lc(discharge.status) !== "completed") return json({ ok: false, error: "The Discharge Summary is available once the final discharge is completed." }, 409);
    const departure = discharge.actual_departure_at || discharge.final_departure_at || discharge.completed_at;
    if (role === "Nurse" && body.mode === "send" && (!departure || Date.now() - +new Date(departure) > 12 * 3600000)) return json({ ok: false, error: "Nurses can send the Discharge Summary only on the day of discharge. Please ask the Manager." }, 403);
    const pr = await sb.from("patients").select("*").eq("id", discharge.patient_id).single(); if (pr.error) return json({ ok: false, error: pr.error.message }, 404);
    const patient = pr.data;

    const data = await collect(sb, patient, discharge), a = analyse(patient, discharge, data);
    const bytes = await makePdf(patient, discharge, data, a);
    const safe = text(patient.full_name).replace(/[^a-zA-Z0-9_-]+/g, "_") || "Guest";
    const fileName = `${guestName(patient).replace(/[^a-zA-Z0-9 ._-]/g, "")} - Discharge Summary - ${dmy(data.endDay)}.pdf`;
    const path = `${patient.id}/discharge/${safe}_Discharge_Summary_${data.endDay}_${discharge.id.slice(0, 8)}.pdf`;
    await sb.storage.createBucket("patient-reports", { public: false }).catch(() => {});
    const up = await sb.storage.from("patient-reports").upload(path, bytes, { contentType: "application/pdf", upsert: true }); if (up.error) throw up.error;
    const signed = await sb.storage.from("patient-reports").createSignedUrl(path, 3600, { download: body.download ? fileName : undefined }); if (signed.error) throw signed.error;
    const now = new Date().toISOString();
    const saved = await sb.from("patient_discharges").update({ discharge_summary_storage_path: path, discharge_summary_generated_at: now, updated_at: now }).eq("id", discharge.id);
    if (saved.error) console.error("DISCHARGE_SUMMARY path save failed (run SQL 202)", saved.error.message);
    await sb.from("patients").update({ discharge_summary_url: path }).eq("id", patient.id);

    if (body.mode !== "send") return json({ ok: true, report_url: signed.data.signedUrl, storage_path: path, file_name: fileName });

    // ---- send ----
    const to = digits(body.recipient_mobile); const toNo = to.length === 10 ? `91${to}` : to;
    const registered = [patient.attendant_phone, patient.attendant_alternative_phone, patient.mobile, patient.notification_mobile, discharge.relative_contact, discharge.received_by_contact, discharge.voluntary_requester_contact, ...data.familyAccess.filter((f: any) => f.is_active !== false).map((f: any) => f.mobile)].map(last10).filter(x => x.length === 10);
    if (last10(toNo).length !== 10 || !registered.includes(last10(toNo))) return json({ ok: false, error: "This number is not registered for the Guest. Add it in Family Details first." }, 403);
    const recipient = text(body.recipient_name) || "Family Member";
    const params = [recipient.slice(0, 40), a.name.slice(0, 50), dmy(data.startDay), dmy(data.endDay)];
    const caption = `Dear ${recipient}, please find attached the Discharge Summary of ${a.name} for the stay at Samara Assisted Living from ${dmy(data.startDay)} to ${dmy(data.endDay)}. - Samara Health Care LLP`;
    try {
      const sent = await sendPdf(toNo, params, fileName, bytes, caption);
      const rendered = `Dear ${params[0]},\n\nPlease find attached the Discharge Summary of ${params[1]} for the stay at Samara Assisted Living from ${params[2]} to ${params[3]}.\n\nThis summary is confidential and meant only for the family and the treating doctor. Please keep it for future medical visits.\n\nFor any help, please contact the Samara nursing team on 7395961616.\n\nSamara Health Care LLP`;
      if (sent.inboxId) await sb.from("hr_whatsapp_communications").update({
        communication_type: body.automatic ? "Automatic Discharge Summary" : "Discharge Summary", contact_name: recipient, source_type: "Patient / Family · Discharge",
        sent_by: prof.data.id, sent_by_name: body.automatic ? "Samara System" : text(prof.data.full_name) || role, message_content: rendered,
        message_payload: { discharge_id: discharge.id, patient_id: patient.id, patient_code: patient.patient_id, patient_name: a.name, body_params: params, route: sent.route, automatic: !!body.automatic,
          _samara_media: { path, bucket: "patient-reports", filename: fileName, mime_type: "application/pdf" } }, updated_at: new Date().toISOString(),
      }).eq("id", sent.inboxId);
      await sb.from("patient_communications").insert({ patient_id: patient.id, communication_type: "Discharge Summary", method: "WhatsApp", recipient_type: "Relative", recipient_name: recipient, recipient_number: toNo, status: "Accepted", provider_message_id: sent.id, message_preview: `Discharge Summary PDF (${sent.route})`, created_at: new Date().toISOString() }).then(() => {}, () => {});
      await sb.from("patient_discharges").update({ discharge_summary_whatsapp_status: "Accepted", discharge_summary_whatsapp_message_id: sent.id, discharge_summary_whatsapp_sent_at: new Date().toISOString(), discharge_summary_whatsapp_error: null }).eq("id", discharge.id);
      return json({ ok: true, provider_message_id: sent.id, route: sent.route, report_url: signed.data.signedUrl, storage_path: path, file_name: fileName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("patient_discharges").update({ discharge_summary_whatsapp_status: "Failed", discharge_summary_whatsapp_error: msg.slice(0, 500) }).eq("id", discharge.id);
      return json({ ok: false, error: msg, report_url: signed.data.signedUrl, file_name: fileName }, 502);
    }
  } catch (e) { console.error(e); return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});

// Embed this helper in each Edge Function and use samaraInboxFetch instead of fetch.
// Non-message requests pass through unchanged. Never store authentication codes.
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
