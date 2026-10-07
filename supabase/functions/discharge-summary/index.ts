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
  try { logo = await pdf.embedPng(Uint8Array.from(atob(SAMARA_LOGO_PNG), c => c.charCodeAt(0))); } catch { try { const bytes = await fetch("https://samaraassistedliving.com/assets/samara-logo.png").then(r => r.ok ? r.arrayBuffer() : Promise.reject()); logo = await pdf.embedPng(bytes); } catch { /* text fallback */ } }
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

// Samara logo (unchanged artwork, trimmed of empty margins) embedded so the PDF never depends on the network.
const SAMARA_LOGO_PNG = "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";
