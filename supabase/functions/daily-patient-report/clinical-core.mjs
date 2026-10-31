// Samara Care ERP 2.18.142 — Daily & Weekly Clinical Reports: deterministic clinical logic.
// Plain ES module so the Edge Function (Deno) and the Node tests use exactly the same code.
// Everything here is arithmetic on recorded data. AI never computes counts, totals or dates.
// Times: Samara works in India time (Asia/Kolkata, UTC+05:30, no daylight saving).

export const TZ = 'Asia/Kolkata';
const IST_MS = 330 * 60000;
const HOUR = 3600000, DAY = 86400000;

// ---------- text / time helpers ----------
export const txt = v => String(v ?? '').trim();
export const isoOf = d => { const x = new Date(new Date(d).getTime() + IST_MS); return x.toISOString().slice(0, 10); };
export const hmOf = d => { const x = new Date(new Date(d).getTime() + IST_MS); return x.toISOString().slice(11, 16); };
export const at = (iso, hm = '00:00') => new Date(`${iso}T${hm.length === 5 ? hm : '00:00'}:00+05:30`);
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtDate = iso => iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '';
export const fmtDM = iso => iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : '';
export const fmtHM = hm => { const m = txt(hm).match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const h = +m[1]; return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
export const fmtTime = d => fmtHM(hmOf(d));
export const fmtDT = d => d ? `${fmtDate(isoOf(d))}, ${fmtTime(d)}` : '';
export const valid = d => d instanceof Date && !Number.isNaN(d.getTime());
const ts = v => { if (!v) return null; const d = new Date(v); return valid(d) ? d : null; };
export function normTime(value) {
  const t = txt(value); if (!t) return '';
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  if (/^\d:\d{2}/.test(t)) return '0' + t.slice(0, 4);
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i); if (!m) return '';
  let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
}
export const parseTimes = v => (Array.isArray(v) ? v : txt(v).replace(/[{}"]/g, '').split(',')).map(normTime).filter(Boolean);
const num = v => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) && x !== 0 ? x : null; };
const lc = v => txt(v).toLowerCase();
export const drName = v => { const d = txt(v); if (!d) return 'Treating Doctor'; return /^dr(\.|\s)/i.test(d) ? d.replace(/^dr\.?\s*/i, 'Dr. ') : `Dr. ${d}`; };
export const patientName = p => [txt(p?.title), txt(p?.full_name)].filter(Boolean).join(' ') || 'Guest';

// ---------- default configurable thresholds (Admin can change them in clinical_report_settings) ----------
export const DEFAULT_THRESHOLDS = {
  sys: [100, 140], dia: [60, 90], pulse: [60, 100], spo2_min: 94, temp: [96, 99.5], rr: [12, 22],
  glucose: { fasting: [80, 130], post_max: 180, random_max: 200, low: 70 }
};
export function thresholdsFrom(settings, pref) {
  const t = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
  const s = settings?.thresholds; if (s && typeof s === 'object') for (const k of Object.keys(t)) if (s[k] !== undefined) t[k] = k === 'glucose' ? { ...t.glucose, ...s.glucose } : s[k];
  // Guest-specific glucose targets set for the treating doctor (optional)
  const g = pref || {};
  if (num(g.glucose_fasting_min)) t.glucose.fasting[0] = Number(g.glucose_fasting_min);
  if (num(g.glucose_fasting_max)) t.glucose.fasting[1] = Number(g.glucose_fasting_max);
  if (num(g.glucose_post_max)) t.glucose.post_max = Number(g.glucose_post_max);
  if (num(g.glucose_low)) t.glucose.low = Number(g.glucose_low);
  t.glucoseGuestSpecific = Boolean(num(g.glucose_fasting_max) || num(g.glucose_post_max));
  return t;
}
export function vitalBad(k, v, T = DEFAULT_THRESHOLDS) {
  if (v === null || v === undefined) return false;
  switch (k) {
    case 'sys': return v >= T.sys[1] || v < T.sys[0];
    case 'dia': return v >= T.dia[1] || v < T.dia[0];
    case 'pulse': return v > T.pulse[1] || v < T.pulse[0];
    case 'spo2': return v < T.spo2_min;
    case 'temp': return v >= T.temp[1] || v < T.temp[0];
    case 'rr': return v > T.rr[1] || v < T.rr[0];
    case 'fasting': return v < T.glucose.low || v > T.glucose.fasting[1];
    case 'post': return v < T.glucose.low || v > T.glucose.post_max;
    case 'random': return v < T.glucose.low || v > T.glucose.random_max;
    default: return false;
  }
}

// ---------- admission / discharge ----------
export function admissionAt(p) {
  const date = txt(p?.admission_date).slice(0, 10);
  for (const v of [p?.admission_datetime, p?.admission_timestamp, p?.admitted_at]) { const d = ts(v); if (d) return d; }
  if (date && normTime(p?.admission_time)) return at(date, normTime(p.admission_time));
  const created = ts(p?.created_at);
  if (date && created && isoOf(created) === date) return created;
  if (date) return at(date, '00:00');
  return created;
}
// A discharge counts ONLY when the discharge record is Completed AND has a recorded departure time.
export function confirmedDischarge(discharges) {
  const done = (discharges || []).filter(d => txt(d.status) === 'Completed')
    .map(d => ({ d, at: ts(d.actual_departure_at) || ts(d.final_departure_at) || ts(d.completed_at) }))
    .filter(x => x.at).sort((a, b) => b.at - a.at);
  return done[0] ? { record: done[0].d, at: done[0].at } : null;
}

// ---------- reporting periods ----------
// Daily: the 24 h ending at the latest configured cutoff at or before `now`; starts at admission if later.
export function dailyPeriod({ cutoff = '20:00', now = new Date(), admission = null }) {
  const c = normTime(cutoff) || '20:00';
  let to = at(isoOf(now), c); if (to > now) to = new Date(to.getTime() - DAY);
  let from = new Date(to.getTime() - DAY), sinceAdmission = false;
  if (admission && admission > from) { from = admission; sinceAdmission = true; }
  return { from, to, sinceAdmission, valid: from < to };
}
// Weekly: consecutive 7-day windows from admission. Week k runs from day 7(k-1) 00:00 (week 1 from the
// admission time) to day 7k 00:00. No overlap; the final window ends at the confirmed discharge time.
export function weeklyWindows(admission, until) {
  if (!valid(admission) || !valid(until) || until <= admission) return [];
  const startIso = isoOf(admission), out = [];
  for (let k = 1; k < 400; k++) {
    const fromIso = addDays(startIso, 7 * (k - 1)), toIso = addDays(startIso, 7 * k);
    const from = k === 1 ? admission : at(fromIso), to = at(toIso);
    if (from >= until) break;
    out.push({ week: k, from, to: to > until ? until : to, complete: to <= until, fromDate: fromIso, toDate: addDays(toIso, -1) });
  }
  return out;
}
// Which weekly reports are due now. `existing` = rows already in clinical_reports for this Guest (kind weekly).
// runTime: complete weeks are generated after this time on the day after the week ends (chart day closes 7 AM).
export function dueWeeklyPeriods({ admission, now = new Date(), discharge = null, existing = [], runTime = '07:30', notBefore = null }) {
  const end = discharge?.at && discharge.at < now ? discharge.at : now;
  const wins = weeklyWindows(admission, end), out = [];
  const covered = (from, to) => existing.some(r => new Date(r.period_from) < to && new Date(r.period_to) > from);
  for (const w of wins) {
    if (w.complete) {
      const due = at(isoOf(w.to), normTime(runTime) || '07:30');
      if (now >= due && !covered(w.from, w.to) && (!notBefore || w.to >= notBefore)) out.push({ ...w, final: false });
    } else if (discharge?.at && w.to.getTime() === discharge.at.getTime()) {
      // final partial period: from the end of the last reported window (or admission) to the discharge time
      const last = existing.filter(r => new Date(r.period_to) <= discharge.at).map(r => new Date(r.period_to)).sort((a, b) => b - a)[0];
      const from = last && last > w.from ? last : w.from;
      if (from < discharge.at && !covered(from, discharge.at)) out.push({ ...w, from, final: true });
    }
  }
  return out;
}

// ---------- medication reconciliation ----------
const HIGH_RISK = /clexane|enoxaparin|heparin|warfarin|acitrom|apixaban|rivaroxaban|dabigatran|insulin|actrapid|mixtard|lantus|glargine|novorapid|humalog|levetiracetam|levipil|phenytoin|eptoin|valpro|carbamazepine|digoxin|amiodarone|piptaz|piperacillin|meropenem|ceftriaxone|vancomycin|emrok|linezolid|colistin|tazobactam/i;
export const isHighRisk = name => HIGH_RISK.test(txt(name));
export const isPrn = o => Boolean(o?.is_prn) || /\b(sos|prn|as needed|if needed|stat)\b/i.test(`${txt(o?.frequency)} ${txt(o?.scheduled_times)}`);
function alternateAnchor(o) {
  const v = txt(o?.dose_anchor_date).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = txt(o?.special_instruction).match(/alternate\s+days?\s+(?:from|starting|start)\s*:?\s*(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/i);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return anchorDate(o);
}
function anchorDate(o) { const e = ts(o?.effective_from); return e ? isoOf(e) : txt(o?.start_date).slice(0, 10); }
function weekdayOf(o) {
  const v = o?.dose_weekday; if (v !== null && v !== undefined && v !== '' && Number.isInteger(Number(v)) && +v >= 0 && +v <= 6) return +v;
  const found = new Set(), re = /\b(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?s?\b/gi, map = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, wednes: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, satur: 6 }; let m;
  while ((m = re.exec(txt(o?.special_instruction)))) found.add(map[m[1].toLowerCase()]);
  return found.size === 1 ? [...found][0] : null;
}
function monthDayOf(o) {
  const v = Number(o?.dose_month_day); if (Number.isInteger(v) && v >= 1 && v <= 31) return v;
  const m = txt(o?.special_instruction).match(/\bday\s*(\d{1,2})\b/i); const n = m ? +m[1] : NaN; return n >= 1 && n <= 31 ? n : null;
}
const dUTC = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
// Same rules as the ERP MAR (medicationOrderDueOnDate)
export function dueOnDate(o, iso) {
  const f = lc(o?.frequency);
  if (/^alternate\s*days?$|^alternate\s*day\b|every\s*other\s*day|^eod$|^a\/?d$/.test(f)) { const a = alternateAnchor(o); if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) return true; return Math.abs(Math.round((dUTC(iso) - dUTC(a)) / DAY)) % 2 === 0; }
  if (f !== 'weekly' && f !== 'monthly') return true;
  const a = anchorDate(o); if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) return true;
  if (dUTC(iso) < dUTC(a)) return false;
  if (f === 'weekly') { const wd = weekdayOf(o); if (wd !== null) return new Date(dUTC(iso)).getUTCDay() === wd; return Math.round((dUTC(iso) - dUTC(a)) / DAY) % 7 === 0; }
  const day = monthDayOf(o) || +a.slice(8, 10), last = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate();
  return +iso.slice(8, 10) === Math.min(day, last);
}
// Same rules as the ERP MAR (medicationOrderDoseEligible), evaluated in India time
export function doseEligible(o, iso, hm) {
  const due = at(iso, hm);
  if (txt(o?.start_date) && txt(o.start_date).slice(0, 10) > iso) return false;
  if (txt(o?.end_date) && txt(o.end_date).slice(0, 10) < iso) return false;
  const eff = ts(o?.effective_from); if (eff && due < eff) return false;
  const stop = ts(o?.stopped_at); if (stop && due >= stop) return false;
  const closed = ts(o?.discharge_closed_at); if (closed && due >= closed) return false;
  if (o?.is_active === false && !stop) return false;
  if (['completed', 'discontinued', 'stopped', 'inactive'].includes(lc(o?.status)) && !stop) return false;
  return dueOnDate(o, iso);
}
const rescheduledDate = row => { const d = txt(row?.scheduled_date).slice(0, 10), f = normTime(row?.scheduled_time), t = normTime(row?.rescheduled_time); if (!d || !t) return ''; return t > f ? d : addDays(d, 1); };
const STATUS_RANK = { given: 6, withheld: 5, refused: 4, missed: 3, unavailable: 3, delayed: 2, reschedule: 1 };
function bestRow(rows) { return [...rows].sort((a, b) => (STATUS_RANK[lc(b.status)] || 0) - (STATUS_RANK[lc(a.status)] || 0))[0] || null; }
const reasonOf = r => txt(r?.withhold_reason) ? `${txt(r.withhold_reason)}${txt(r.withhold_reading) ? `, ${txt(r.withhold_reading)}` : ''}` : (txt(r?.not_given_reason) || txt(r?.reschedule_reason) || txt(r?.late_given_reason) || txt(r?.remarks) || txt(r?.notes) || '');
export const medKey = o => `${txt(o?.medicine_name)} ${txt(o?.strength)}`.toLowerCase().replace(/[^a-z0-9]/g, '');
const medLabel = o => [txt(o?.medicine_name), txt(o?.strength)].filter(Boolean).join(' ');

// Outcome of one scheduled dose slot, from the individual MAR records only.
// given (late if >= 30 min after the scheduled time) | refused | withheld | missed (incl. "Unavailable") |
// unresolved (no entry, or "Delayed"/rescheduled with no later outcome). Missing documentation is NEVER "missed".
export function slotOutcome(order, slot, mar) {
  const same = r => r.order_id === order.id && txt(r.scheduled_date).slice(0, 10) === slot.date && normTime(r.scheduled_time) === slot.time;
  const rows = mar.filter(same), row = bestRow(rows);
  const lateBy = r => { const g = ts(r?.administered_at); return g ? Math.round((g - slot.due) / 60000) : null; };
  const given = r => { const mins = lateBy(r); return { outcome: 'given', late: (mins !== null && mins >= 30) || Boolean(txt(r.late_given_reason)), lateMin: mins, row: r }; };
  if (!row) return { outcome: 'unresolved', why: 'no administration entry' };
  const s = lc(row.status);
  if (s === 'given') return given(row);
  const resched = rows.find(r => normTime(r.rescheduled_time));
  if (resched) {
    const d2 = rescheduledDate(resched), t2 = normTime(resched.rescheduled_time);
    const later = bestRow(mar.filter(r => r.order_id === order.id && r.id !== resched.id && txt(r.scheduled_date).slice(0, 10) === d2 && normTime(r.scheduled_time) === t2));
    const first = { status: txt(resched.status), reason: reasonOf(resched) };
    if (later && lc(later.status) === 'given') { const g = given(later); return { ...g, late: true, afterDelay: true, first }; }
    if (later && ['withheld', 'refused', 'missed', 'unavailable', 'not given'].includes(lc(later.status))) return { outcome: ['unavailable', 'not given'].includes(lc(later.status)) ? 'missed' : lc(later.status), row: later, first };
    return { outcome: 'unresolved', why: `${txt(resched.status) || 'Rescheduled'} to ${fmtHM(t2)}; no later administration entry`, row: resched };
  }
  if (s === 'withheld') return { outcome: 'withheld', row };
  if (s === 'refused') return { outcome: 'refused', row };
  if (s === 'missed' || s === 'unavailable' || s === 'not given') return { outcome: 'missed', row };
  return { outcome: 'unresolved', why: `"${txt(row.status) || 'Recorded'}" with no administration entry`, row };
}
export function doseSlots(o, from, to, admission) {
  if (isPrn(o)) return [];
  const times = parseTimes(o.scheduled_times); if (!times.length) return [];
  const out = [];
  for (let d = isoOf(from); d <= isoOf(to); d = addDays(d, 1)) for (const t of times) {
    const due = at(d, t); if (due < from || due >= to) continue; if (admission && due < admission) continue;
    if (!doseEligible(o, d, t)) continue; out.push({ date: d, time: t, due });
  }
  return out;
}
// Reconcile every medicine over [from, to). Versions of the same medicine (time corrections, doctor changes)
// are merged into one row. Scheduled = Given + Refused + Withheld + Missed + Unresolved (always, by construction).
// 2.18.146: a medicine is under ONE order at a time — the newest version in force. Older versions' slots that a newer
// version replaced are not counted (they were the cause of phantom "unresolved" / double "given" rows), a stop followed by
// a re-entry of the same medicine is reported as "continued", not "stopped", and two "Given" entries for the same
// medicine within 60 min are flagged as a possible double entry for staff to verify.
const orderStart = o => ts(o.effective_from) || ts(o.created_at) || (txt(o.start_date) ? at(txt(o.start_date).slice(0, 10)) : null);
const orderEnd = o => ts(o.stopped_at) || ts(o.discharge_closed_at) || (txt(o.end_date) ? at(addDays(txt(o.end_date).slice(0, 10), 1)) : null);
const SWITCH_GRACE = 60 * 60000, MOVE_WINDOW = 3 * HOUR, DUP_WINDOW = 60 * 60000;
function supersededSlot(o, slot, versions, mar) {
  const so = orderStart(o);
  for (const x of versions) {
    if (x === o) continue;
    const sx = orderStart(x); if (!sx || !so || sx <= so) continue;           // only a NEWER version can replace this one
    const ex = orderEnd(x); if (ex && ex <= slot.due) continue;                // newer version already ended before this slot
    if (sx <= slot.due) return true;                                           // newer version in force at the due time
    if (sx - slot.due > SWITCH_GRACE) continue;                                // change made long after: the slot stands
    const recordedBefore = mar.some(r => r.order_id === o.id && txt(r.scheduled_date).slice(0, 10) === slot.date && normTime(r.scheduled_time) === slot.time && (ts(r.created_at) || ts(r.administered_at)) && (ts(r.created_at) || ts(r.administered_at)) < sx);
    if (recordedBefore) continue;
    const moved = parseTimes(x.scheduled_times).some(t => [slot.date, addDays(slot.date, 1), addDays(slot.date, -1)].some(d => Math.abs(at(d, t) - slot.due) <= MOVE_WINDOW && at(d, t) >= sx));
    if (moved) return true;                                                    // the open dose moved to the new schedule
  }
  return false;
}
export function reconcileMedications({ orders = [], mar = [], reviews = [], from, to, admission }) {
  const regular = new Map(), sos = new Map();
  const notDoctor = id => id ? reviews.find(r => r.id === id && r.not_doctor_review) : null;
  const correction = id => id ? reviews.find(r => r.id === id && r.is_admission_correction && !r.not_doctor_review) : null;
  const doctorStop = id => id ? reviews.find(r => r.id === id && !r.not_doctor_review && !r.is_admission_correction) : null;
  const overlaps = o => { const s = ts(o.effective_from) || (txt(o.start_date) ? at(txt(o.start_date).slice(0, 10)) : ts(o.created_at)); const e = ts(o.stopped_at) || ts(o.discharge_closed_at) || (txt(o.end_date) ? at(addDays(txt(o.end_date).slice(0, 10), 1)) : null); return (!s || s < to) && (!e || e > from); };
  const regularOrders = orders.filter(o => !isPrn(o) && o.status !== 'Removed');
  for (const o of orders.filter(overlaps)) {
    const key = medKey(o);
    if (isPrn(o)) {
      const g = mar.filter(r => r.order_id === o.id && lc(r.status) === 'given' && (() => { const t = ts(r.administered_at) || ts(r.created_at); return t && t >= from && t < to; })());
      const e = sos.get(key) || { name: medLabel(o), route: txt(o.route), given: 0, times: [], stopped: false, notes: [] };
      e.given += g.length; g.forEach(r => e.times.push({ at: ts(r.administered_at) || ts(r.created_at), reason: reasonOf(r) }));
      const unexpected = mar.filter(r => r.order_id === o.id && ['delayed', 'missed', 'refused'].includes(lc(r.status)) && (() => { const t = at(txt(r.scheduled_date).slice(0, 10) || isoOf(ts(r.created_at) || from), normTime(r.scheduled_time) || '00:00'); return t >= from && t < to; })());
      unexpected.forEach(r => e.notes.push(`${fmtDM(txt(r.scheduled_date).slice(0, 10))} "${txt(r.status)}" record for an as-needed medicine - requires verification`));
      if (ts(o.stopped_at) && ts(o.stopped_at) < to) e.stopped = true;
      sos.set(key, e); continue;
    }
    const e = regular.get(key) || { key, name: medLabel(o), dose: [txt(o.dose), txt(o.route)].filter(Boolean).join(', '), route: txt(o.route), times: '', scheduled: 0, given: 0, late: 0, refused: 0, withheld: 0, missed: 0, unresolved: 0, exceptions: [], highRisk: isHighRisk(o.medicine_name), stops: [], changes: [], duplicates: [], unresolvedSlots: [], replacedSlots: 0 };
    const versions = regularOrders.filter(x => medKey(x) === key);
    const slots = doseSlots(o, from, to, admission).filter(s => { if (supersededSlot(o, s, versions, mar)) { e.replacedSlots++; return false; } return true; });
    for (const s of slots) {
      const r = slotOutcome(o, s, mar); e.scheduled++;
      const when = `${fmtDM(s.date)} ${fmtHM(s.time)}`;
      if (r.outcome === 'given') { e.given++; if (r.late) { e.late++; e.exceptions.push(`${when} given late${r.lateMin !== null && r.lateMin >= 30 ? ` (${r.lateMin >= 120 ? `${Math.floor(r.lateMin / 60)} h ${r.lateMin % 60} min` : `${r.lateMin} min`})` : ''}${reasonOf(r.first || r.row) ? `: ${reasonOf(r.first || r.row)}` : ''}`); } }
      else if (r.outcome === 'refused') { e.refused++; e.exceptions.push(`${when} "Refused"${reasonOf(r.row) ? `: ${reasonOf(r.row)}` : ''}`); }
      else if (r.outcome === 'withheld') { e.withheld++; e.exceptions.push(`${when} withheld${reasonOf(r.row) ? `: ${reasonOf(r.row)}` : ''}${txt(r.row?.doctor_instruction) ? `; doctor's instruction: ${txt(r.row.doctor_instruction)}` : ' - doctor\'s instruction not recorded'}`); }
      else if (r.outcome === 'missed') { e.missed++; e.exceptions.push(`${when} "${txt(r.row?.status) || 'Missed'}"${reasonOf(r.row) ? `: ${reasonOf(r.row)}` : ''}`); }
      else { e.unresolved++; e.unresolvedSlots.push({ due: s.due }); e.exceptions.push(`${when} unresolved - ${r.why}${reasonOf(r.row) ? ` (${reasonOf(r.row)})` : ''}`); }
    }
    const stopAt = ts(o.stopped_at);
    if (stopAt && stopAt >= from && stopAt < to) {
      const nd = notDoctor(o.stopped_by_review_id), cr = correction(o.stopped_by_review_id), ds = doctorStop(o.stopped_by_review_id);
      const others = versions.filter(x => x !== o);
      // Same medicine still under an order after this stop? (a parallel version, or one re-entered later)
      const after = others.filter(x => { const sx = orderStart(x), ex = orderEnd(x); return (!ex || ex > stopAt) && (!sx || sx < to); }).sort((a, b) => (orderStart(a) || 0) - (orderStart(b) || 0));
      const plainModify = others.some(x => ts(x.effective_from) && Math.abs(ts(x.effective_from) - stopAt) < 5 * 60000);
      const source = nd ? 'a nurse entry (not a doctor review)' : cr ? 'a nurse admission-entry correction (not a doctor review)' : ds ? `doctor review by ${drName(ds.doctor_name)}` : '';
      if (after.length) {
        if (!plainModify) {
          const covered = after.filter(x => (orderStart(x) || 0) <= stopAt);
          const next = covered.length ? null : after[0];
          const by = source ? ` through ${source}` : '';
          e.changes.push(next
            ? { at: stopAt, gap: true, note: `Order stopped ${fmtDT(stopAt)}${by} and re-entered ${fmtDT(orderStart(next))} - continued (no order in force in between)` }
            : { at: stopAt, gap: false, note: `An order version was stopped ${fmtDT(stopAt)}${by}; the medicine continued without interruption under its other version` });
        }
      } else if (nd) e.stops.push({ at: stopAt, notDoctor: true, note: txt(nd.non_doctor_note) || 'Stopped by a nurse entry (not a doctor review)' });
      else if (cr) e.stops.push({ at: stopAt, notDoctor: true, note: 'Stopped through a nurse admission-entry correction (not a doctor review)' });
      else if (ds) e.stops.push({ at: stopAt, notDoctor: false, note: `Stopped at doctor review by ${drName(ds.doctor_name)}` });
      else if (!plainModify) e.stops.push({ at: stopAt, notDoctor: null, note: 'Order stopped; source of the stop not recorded' });
    }
    if (!stopAt || stopAt >= to) e.times = parseTimes(o.scheduled_times).map(fmtHM).join(', ') || txt(o.frequency);
    else if (!e.times) e.times = parseTimes(o.scheduled_times).map(fmtHM).join(', ') || txt(o.frequency);
    regular.set(key, e);
  }
  // Possible double entries: two "Given" records for the same medicine within 60 min (any order version)
  for (const r of regular.values()) {
    const ids = new Set(regularOrders.filter(o => medKey(o) === r.key).map(o => o.id));
    const given = mar.filter(m => ids.has(m.order_id) && lc(m.status) === 'given').map(m => ({ m, t: ts(m.administered_at) || ts(m.created_at) })).filter(x => x.t && x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
    let last = -1;
    for (let i = 1; i < given.length; i++) if (i - 1 !== last && given[i].t - given[i - 1].t < DUP_WINDOW) { r.duplicates.push({ first: given[i - 1].t, second: given[i].t }); last = i; }
  }
  const rows = [...regular.values()].filter(r => r.scheduled || r.stops.length || r.changes.length).sort((a, b) => a.name.localeCompare(b.name));
  rows.forEach(r => { r.active = orders.some(o => medKey(o) === r.key && (!ts(o.stopped_at) || ts(o.stopped_at) >= to) && o.is_active !== false); r.balanced = r.given + r.refused + r.withheld + r.missed + r.unresolved === r.scheduled; });
  const sosRows = [...sos.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = rows.reduce((t, r) => { for (const k of ['scheduled', 'given', 'late', 'refused', 'withheld', 'missed', 'unresolved']) t[k] += r[k]; return t; }, { scheduled: 0, given: 0, late: 0, refused: 0, withheld: 0, missed: 0, unresolved: 0 });
  return { rows, sos: sosRows, totals, balanced: rows.every(r => r.balanced) };
}

// ---------- vital signs ----------
const sugarKind = t => { const s = lc(t); if (/fbs|fast/.test(s)) return 'fasting'; if (/pp|post|after/.test(s)) return 'post'; return 'random'; };
export function vitalsIn(vitals = [], from, to) {
  return vitals.map(v => ({ v, at: ts(v.recorded_at) || ts(v.created_at) })).filter(x => x.at && x.at >= from && x.at < to).sort((a, b) => a.at - b.at)
    .map(({ v, at: t }) => ({ at: t, sys: num(v.systolic), dia: num(v.diastolic), pulse: num(v.pulse), spo2: num(v.spo2), temp: num(v.temperature) === null ? null : Math.round(Number(v.temperature) * 10) / 10, rr: num(v.respiration), pain: v.pain_score === 0 ? 0 : num(v.pain_score), sugar: num(v.blood_sugar), sugarKind: num(v.blood_sugar) ? sugarKind(v.blood_sugar_type) : null, sugarType: txt(v.blood_sugar_type), remarks: txt(v.remarks) }));
}
// A scheduled vitals check is "not recorded" when no reading exists from 90 min before to 4 h after it —
// the same rule the ERP alert engine uses. Only checks whose window has closed before `to` are judged.
export function missedVitalChecks({ schedule, vitals = [], from, to, admission }) {
  const times = (Array.isArray(schedule) && schedule.length ? schedule : ['06:00', '14:00', '22:00']).map(normTime).filter(Boolean);
  const out = [];
  for (let d = isoOf(from); d <= isoOf(to); d = addDays(d, 1)) for (const t of times) {
    const due = at(d, t); if (due < from || due >= to) continue; if (admission && due < admission) continue;
    if (due.getTime() + 4 * HOUR > to.getTime()) continue;
    const ok = vitals.some(v => v.at >= new Date(due.getTime() - 90 * 60000) && v.at < new Date(due.getTime() + 4 * HOUR));
    if (!ok) out.push({ due, date: d, time: t });
  }
  return out;
}
const rng = a => a.length ? { min: Math.min(...a), max: Math.max(...a) } : null;
export function vitalStats(list, T = DEFAULT_THRESHOLDS) {
  const pick = k => list.map(x => x[k]).filter(v => v !== null && v !== undefined);
  const bp = list.filter(x => x.sys !== null).map(x => ({ at: x.at, sys: x.sys, dia: x.dia }));
  const abnormal = [];
  for (const x of list) {
    for (const k of ['sys', 'dia', 'pulse', 'spo2', 'temp', 'rr']) if (x[k] !== null && vitalBad(k, x[k], T)) abnormal.push({ at: x.at, k, v: x[k], bp: k === 'sys' || k === 'dia' ? `${x.sys}/${x.dia ?? '-'}` : null });
    if (x.sugar !== null && vitalBad(x.sugarKind, x.sugar, T)) abnormal.push({ at: x.at, k: x.sugarKind, v: x.sugar });
  }
  const sug = k => list.filter(x => x.sugar !== null && x.sugarKind === k).map(x => ({ at: x.at, v: x.sugar }));
  return { n: list.length, bp, bpMin: bp.length ? bp.reduce((a, b) => (b.sys < a.sys ? b : a)) : null, bpMax: bp.length ? bp.reduce((a, b) => (b.sys > a.sys ? b : a)) : null,
    sys: rng(pick('sys')), dia: rng(pick('dia')), pulse: rng(pick('pulse')), spo2: rng(pick('spo2')), temp: rng(pick('temp')), rr: rng(pick('rr')),
    pain: list.filter(x => x.pain !== null && x.pain !== undefined).map(x => ({ at: x.at, v: x.pain })),
    fasting: sug('fasting'), post: sug('post'), random: sug('random'), abnormal };
}
export const rangeText = (r, unit = '') => r ? (r.min === r.max ? `${r.min}${unit}` : `${r.min}-${r.max}${unit}`) : '';

// ---------- intake / output (chart day 7 AM - 7 AM, as the ERP io_chart_day) ----------
export const chartDayOf = d => isoOf(new Date(new Date(d).getTime() - 7 * HOUR));
export function ioDays({ rows = [], setting = null, from, to, admission = null, discharge = null, now = new Date() }) {
  if (!setting) return { onChart: false, days: [] };
  const started = ts(setting.started_at), stopped = ts(setting.stopped_at);
  const firstDay = chartDayOf(new Date(Math.max(from.getTime(), started ? started.getTime() : from.getTime())));
  const lastDay = chartDayOf(new Date(Math.min(to.getTime() - 1, stopped ? stopped.getTime() : to.getTime() - 1)));
  if (setting.enabled === false && !rows.length) return { onChart: false, days: [] };
  const nowDay = chartDayOf(now), days = [];
  for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
    const r = rows.filter(x => txt(x.io_date).slice(0, 10) === d && (!x.at || (new Date(x.at) >= from && new Date(x.at) < to)));
    const intake = r.filter(x => x.direction === 'Intake').reduce((a, x) => a + Number(x.ml ?? x.volume_ml ?? 0), 0);
    const output = r.filter(x => x.direction === 'Output').reduce((a, x) => a + Number(x.ml ?? x.volume_ml ?? 0), 0);
    const dayStart = at(d, '07:00'), dayEnd = new Date(dayStart.getTime() + DAY);
    const reasons = [];
    if (admission && admission > dayStart && admission < dayEnd) reasons.push('admission day');
    if (started && started > dayStart && started < dayEnd && !(admission && Math.abs(started - admission) < HOUR)) reasons.push('chart started this day');
    if (discharge && discharge > dayStart && discharge < dayEnd) reasons.push('discharge day');
    if (stopped && stopped > dayStart && stopped < dayEnd) reasons.push('chart stopped this day');
    if (dayStart < from && !reasons.includes('admission day') && !reasons.includes('chart started this day')) reasons.push(`period starts ${fmtTime(from)}`);
    if (d >= nowDay || dayEnd > to) reasons.push(`period ends ${fmtTime(new Date(Math.min(to.getTime(), now.getTime())))}`);
    const status = !r.length ? 'missing' : reasons.length ? 'partial' : 'full';
    days.push({ date: d, intake, output, net: r.length ? intake - output : null, entries: r.length, status, reasons, stools: r.reduce((a, x) => a + Number(x.stool_count || 0), 0) });
  }
  let cum = 0; days.forEach(x => { if (x.status !== 'missing') { cum += x.net; x.cumulative = cum; } else x.cumulative = null; });
  return { onChart: true, days, totalNet: cum, recordedDays: days.filter(x => x.status !== 'missing').length };
}

// ---------- physiotherapy ----------
const sessionsPerDay = f => { const s = lc(f); if (/four|4\s*times|qid/.test(s)) return 4; if (/thrice|three|3\s*times|tds|tid/.test(s)) return 3; if (/twice|two|2\s*times|\bbd\b|\bbid\b/.test(s)) return 2; if (/alternate|weekly|as advised/.test(s)) return 0; return 1; };
const windowEnd = s => { const t = txt(s); if (t.includes('-')) return normTime(t.split('-')[1]); return normTime(t); };
const windowLabel = s => { const t = txt(s); if (!t) return ''; return t.includes('-') ? t.split('-').map(normTime).map(fmtHM).join(' - ') : fmtHM(normTime(t)); };
export function physioSummary({ plans = [], sessions = [], from, to }) {
  const active = plans.filter(p => p.is_active !== false && (!txt(p.end_date) || txt(p.end_date).slice(0, 10) >= isoOf(from)) && (!txt(p.start_date) || txt(p.start_date).slice(0, 10) <= isoOf(to)));
  const list = sessions.map(s => ({ s, at: ts(s.session_at) || (txt(s.session_date) ? at(txt(s.session_date).slice(0, 10), normTime(s.actual_time) || '12:00') : ts(s.created_at)) }))
    .filter(x => x.at && x.at >= from && x.at < to).sort((a, b) => a.at - b.at).map(({ s, at: t }) => {
      const date = txt(s.session_date).slice(0, 10) || isoOf(t), actual = normTime(s.actual_time) || hmOf(t), end = windowEnd(s.scheduled_time);
      let delay = null; if (end && actual) { delay = Math.round((at(date, actual) - at(date, end)) / 60000); }
      const done = /complet/i.test(txt(s.status));
      return { date, window: windowLabel(s.scheduled_time), actual: fmtHM(actual), delay, done, status: txt(s.status) || 'Recorded', who: txt(s.physiotherapist_name), notes: [txt(s.notes), txt(s.reason)].filter(Boolean).join(' | ') };
    });
  const days = []; for (let d = isoOf(from); d <= isoOf(new Date(to.getTime() - 1)); d = addDays(d, 1)) {
    const planned = active.filter(p => (!txt(p.start_date) || txt(p.start_date).slice(0, 10) <= d) && (!txt(p.end_date) || txt(p.end_date).slice(0, 10) >= d)).reduce((a, p) => a + (parseTimesWin(p.session_times).length || sessionsPerDay(p.frequency)), 0);
    const s = list.filter(x => x.date === d);
    days.push({ date: d, planned, recorded: s.length, done: s.filter(x => x.done).length, within2h: s.filter(x => x.done && (x.delay === null || x.delay <= 120)).length, late2h: s.filter(x => x.done && x.delay !== null && x.delay > 120).length, notDone: s.filter(x => !x.done).length, notes: s.map(x => x.notes).filter(Boolean) });
  }
  const planText = active.map(p => ({ therapy: txt(p.therapy_type) || 'Physiotherapy', frequency: txt(p.frequency), windows: parseTimesWin(p.session_times).map(windowLabel).join(', '), precautions: txt(p.precautions), advisedBy: txt(p.advised_by), until: txt(p.end_date) ? fmtDate(txt(p.end_date).slice(0, 10)) : 'until doctor review', startedOn: txt(p.start_date) ? fmtDate(txt(p.start_date).slice(0, 10)) : '' }));
  return { plans: planText, sessions: list, days, done: list.filter(x => x.done).length, total: list.length };
}
const parseTimesWin = v => (Array.isArray(v) ? v : txt(v).replace(/[{}"]/g, '').split(',')).map(x => txt(x)).filter(Boolean);

// ---------- nursing / reviews ----------
export function nursingSummary({ meals = [], care = [], notes = [], incidents = [], from, to }) {
  const inW = v => { const t = ts(v); return t && t >= from && t < to; };
  const m = meals.filter(x => inW(x.served_at) || (!x.served_at && txt(x.meal_date) && inW(at(txt(x.meal_date).slice(0, 10), '12:00'))));
  const counts = {}; m.forEach(x => { const k = txt(x.consumption_status) || 'Recorded'; counts[k] = (counts[k] || 0) + 1; });
  const c = care.filter(x => inW(x.completed_at) || inW(x.created_at));
  const careTypes = {}; c.forEach(x => { const k = txt(x.care_type || x.activity || x.task_name || x.care_name || x.remarks).slice(0, 60); if (k) careTypes[k] = (careTypes[k] || 0) + 1; });
  const n = notes.filter(x => inW(x.observed_at) || (!x.observed_at && inW(x.created_at)));
  const inc = incidents.filter(x => inW(x.incident_at) || (!x.incident_at && inW(x.created_at)));
  return { meals: m.length, mealCounts: counts, care: c.length, careTypes, notes: n.length, alertNotes: n.filter(x => x.is_alert).length, noteList: n, incidents: inc.map(x => ({ at: ts(x.incident_at) || ts(x.created_at), type: txt(x.incident_type || x.category), description: txt(x.description) })) };
}
export function doctorReviews({ reviews = [], items = [], mar = [], from, to }) {
  const inW = v => { const t = ts(v); return t && t >= from && t < to; };
  const real = reviews.filter(r => !r.is_admission_correction && !r.not_doctor_review && inW(r.reviewed_at || r.created_at)).sort((a, b) => ts(a.reviewed_at || a.created_at) - ts(b.reviewed_at || b.created_at));
  const lines = real.map(r => { const ch = items.filter(i => i.review_id === r.id && txt(i.action) !== 'Continue').slice(0, 8).map(i => `${({ Add: 'Added', Modify: 'Modified', Stop: 'Stopped' })[txt(i.action)] || txt(i.action)} ${txt(i.medicine_name)}${txt(i.strength || i.dose) ? ` ${txt(i.strength || i.dose)}` : ''}`);
    return { at: ts(r.reviewed_at || r.created_at), doctor: drName(r.doctor_name), source: txt(r.order_mode) || txt(r.review_type) || 'Doctor review', note: txt(r.clinical_notes), changes: ch }; });
  // doctor's instructions recorded on withheld doses
  const inst = mar.filter(r => lc(r.status) === 'withheld' && txt(r.doctor_instruction) && inW(r.doctor_instruction_at || r.updated_at || r.administered_at || r.created_at))
    .map(r => ({ at: ts(r.doctor_instruction_at || r.updated_at || r.created_at), doctor: drName(r.doctor_informed_name), source: txt(r.doctor_informed_via) || 'Instruction on a withheld dose', note: txt(r.doctor_instruction), changes: [] }));
  return [...lines, ...inst].sort((a, b) => a.at - b.at);
}

// ---------- validation: hold a report for review instead of sending ----------
export function validateForSend({ kind = 'daily', vitals, meds, recipient, period }) {
  const reasons = [];
  if (kind === 'daily' && !vitals.length) reasons.push('No vital signs recorded in the reporting period');
  if (!meds.balanced) reasons.push('Medication totals do not reconcile (internal check)');
  const hr = meds.rows.filter(r => r.highRisk && r.unresolvedSlots.some(s => period.to - s.due >= 2 * HOUR));
  if (hr.length) reasons.push(`Unresolved dose of a high-risk medicine: ${hr.map(r => r.name).join(', ')}`);
  if (meds.rows.some(r => r.stops.some(s => s.notDoctor === true))) reasons.push('A medicine was stopped without a doctor\'s order (requires verification)');
  const dup = meds.rows.filter(r => r.duplicates?.length);
  if (dup.length) reasons.push(`Possible double "Given" entry (two within 60 min): ${dup.map(r => r.name).join(', ')} - verify the MAR before sending`);
  if (recipient !== undefined) {
    if (!recipient || !recipient.mobile || recipient.mobile.replace(/\D/g, '').length < 10) reasons.push('Treating doctor WhatsApp number missing or invalid');
    else if (!recipient.verified) reasons.push('Treating doctor WhatsApp number not verified by Admin');
  }
  return reasons;
}

// ---------- deterministic narrative (sections B, C, D); AI may only rephrase / select from these facts ----------
const join = a => a.filter(Boolean).map(x => String(x).replace(/[.;\s]+$/, '')).join('; ') + '.';
export function sectionB({ kind, vitals, vstats, missed, meds, physio, io, nursing, reviews, T }) {
  const rows = [];
  const bp = vstats.bp.length ? (vstats.bp.length <= 3 ? vstats.bp.map(b => `${b.sys}/${b.dia ?? '-'}`).join(', ') : `${vstats.bpMin.sys}/${vstats.bpMin.dia ?? '-'} to ${vstats.bpMax.sys}/${vstats.bpMax.dia ?? '-'}`) : '';
  const out = vstats.abnormal.filter(a => ['sys', 'dia', 'pulse', 'spo2', 'temp', 'rr'].includes(a.k));
  const lab = { sys: 'BP', dia: 'BP', pulse: 'pulse', spo2: 'SpO2', temp: 'temperature', rr: 'RR' };
  const outTxt = [...new Map(out.map(a => [`${a.at}-${lab[a.k]}`, `${lab[a.k]} ${a.bp || a.v} at ${fmtDT(a.at)}`])).values()].slice(0, 4);
  rows.push(['Vital signs', vitals.length ? `${vitals.length} recording${vitals.length > 1 ? 's' : ''}${missed.length ? ` (${missed.length} scheduled check${missed.length > 1 ? 's' : ''} not recorded)` : ''}. ${join([bp && `BP ${bp} mmHg`, vstats.pulse && `pulse ${rangeText(vstats.pulse)} /min`, vstats.spo2 && `SpO2 ${rangeText(vstats.spo2)}%`, vstats.temp && `temperature ${rangeText(vstats.temp)} F`, vstats.rr && `RR ${rangeText(vstats.rr)} /min`])} ${outTxt.length ? `Outside the configured range: ${outTxt.join('; ')}.` : 'No value outside the configured ranges.'}` : `No vital signs recorded${missed.length ? ` (${missed.length} scheduled check${missed.length > 1 ? 's' : ''} not recorded)` : ''}.`]);
  const g = [vstats.fasting.length && `fasting ${vstats.fasting.map(x => x.v).join(', ')}`, vstats.post.length && `post-meal ${vstats.post.map(x => x.v).join(', ')}`, vstats.random.length && `random ${vstats.random.map(x => x.v).join(', ')}`].filter(Boolean);
  if (g.length) rows.push(['Blood glucose', `${g.join('; ')} mg/dL. ${vstats.abnormal.filter(a => ['fasting', 'post', 'random'].includes(a.k)).length ? `Outside target: ${vstats.abnormal.filter(a => ['fasting', 'post', 'random'].includes(a.k)).map(a => `${a.v} (${a.k === 'post' ? 'post-meal' : a.k}) at ${fmtDT(a.at)}`).slice(0, 4).join('; ')}.` : 'Within the configured targets.'}`]);
  const t = meds.totals, ex = meds.rows.filter(r => r.late || r.refused || r.withheld || r.missed || r.unresolved || r.stops.length);
  const medTxt = t.scheduled ? `${t.given} of ${t.scheduled} scheduled doses given${t.late ? ` (${t.late} late)` : ''}${t.refused ? `; ${t.refused} refused` : ''}${t.withheld ? `; ${t.withheld} withheld` : ''}${t.missed ? `; ${t.missed} missed / not available` : ''}${t.unresolved ? `; ${t.unresolved} unresolved (no administration entry)` : ''}.` : 'No regular doses were scheduled in the period.';
  const stops = meds.rows.flatMap(r => r.stops.map(s => `${r.name}: ${s.note}${s.notDoctor ? ' - order status requires the doctor\'s verification' : ''} (${fmtDT(s.at)})`));
  const sos = meds.sos.filter(s => s.given).map(s => `${s.name} (SOS) given ${s.given} time${s.given > 1 ? 's' : ''}`);
  const changes = meds.rows.flatMap(r => (r.changes || []).filter(c => c.gap).map(c => `${r.name}: ${c.note}${r.active && r.times ? `; current times ${r.times}` : ''}`));
  rows.push(['Medicines', join([medTxt, stops.join('; '), changes.join('; '), sos.join('; ')])]);
  if (physio.plans.length || physio.total) rows.push(['Mobility / rehab', physio.total ? `${physio.done} of ${physio.total} recorded physiotherapy session${physio.total > 1 ? 's' : ''} done${physio.sessions.filter(s => s.done && s.delay !== null && s.delay > 120).length ? `; ${physio.sessions.filter(s => s.done && s.delay !== null && s.delay > 120).length} done 2 h or more after the window` : ''}. ${physio.sessions.slice(-2).map(s => s.notes).filter(Boolean).join(' | ').slice(0, 260)}` : 'Physiotherapy plan active; no session recorded in the period.']);
  if (io.onChart) rows.push(['Nutrition / fluids', `${nursing.meals ? `${nursing.meals} meal${nursing.meals > 1 ? 's' : ''} recorded (${Object.entries(nursing.mealCounts).map(([k, v]) => `${k} ${v}`).join(', ')})` : 'No meals recorded'}. I/O: ${io.days.map(d => d.status === 'missing' ? `${fmtDM(d.date)} not charted` : `${fmtDM(d.date)} in ${d.intake} / out ${d.output} ml${d.status === 'partial' ? ` (partial: ${d.reasons.join(', ')})` : ''}`).join('; ')}.`]);
  else rows.push(['Nutrition', nursing.meals ? `${nursing.meals} meal${nursing.meals > 1 ? 's' : ''} recorded (${Object.entries(nursing.mealCounts).map(([k, v]) => `${k} ${v}`).join(', ')}). Not on the I/O chart.` : 'No meals recorded. Not on the I/O chart.']);
  rows.push(['Nursing', join([nursing.care ? `${nursing.care} care record${nursing.care > 1 ? 's' : ''}${Object.keys(nursing.careTypes).length ? ` (${Object.keys(nursing.careTypes).slice(0, 4).join(', ')})` : ''}` : 'No care records', nursing.notes ? `${nursing.notes} nursing note${nursing.notes > 1 ? 's' : ''}${nursing.alertNotes ? `, ${nursing.alertNotes} alert` : ''}` : '', nursing.incidents.length ? `Incidents: ${nursing.incidents.map(i => `${fmtDT(i.at)} ${i.type}`).join('; ')}` : 'No incidents recorded'])]);
  if (reviews.length) rows.push(['Doctor', reviews.map(r => `${fmtDT(r.at)} ${r.doctor} (${r.source}): ${r.note || ''}${r.changes.length ? ` ${r.changes.join('; ')}` : ''}`).join(' | ')]);
  const nd = [!vitals.some(v => v.pain !== null && v.pain !== undefined) && 'pain score'].filter(Boolean);
  if (nd.length) rows.push(['Not documented', nd.join(' - ')]);
  return rows;
}
export function candidateChanges({ vstats, meds, physio, io, nursing, reviews }) {
  const c = [];
  const stops = meds.rows.flatMap(r => r.stops.map(s => ({ r, s })));
  stops.forEach(({ r, s }) => c.push({ t: r.name, b: `${s.note}${s.notDoctor ? '. No doctor\'s discontinuation order is documented' : ''} (${fmtDT(s.at)}).` }));
  meds.rows.forEach(r => (r.changes || []).filter(ch => ch.gap).forEach(ch => c.push({ t: `${r.name}: order changed`, b: `${ch.note}${r.active && r.times ? `; current times ${r.times}` : ''}.` })));
  reviews.forEach(r => r.changes.length && c.push({ t: `Doctor review ${fmtDT(r.at)}`, b: `${r.doctor}: ${r.changes.join('; ')}.` }));
  const ab = vstats.abnormal.filter(a => ['sys', 'dia', 'pulse', 'spo2', 'temp', 'rr'].includes(a.k));
  if (ab.length) c.push({ t: 'Vital signs outside range', b: [...new Set(ab.map(a => `${({ sys: 'BP', dia: 'BP', pulse: 'pulse', spo2: 'SpO2', temp: 'temperature', rr: 'RR' })[a.k]} ${a.bp || a.v} (${fmtDT(a.at)})`))].slice(0, 5).join('; ') + '.' });
  const gl = vstats.abnormal.filter(a => ['fasting', 'post', 'random'].includes(a.k));
  if (gl.length) c.push({ t: 'Blood glucose outside target', b: gl.slice(0, 5).map(a => `${a.v} mg/dL ${a.k === 'post' ? 'post-meal' : a.k} (${fmtDT(a.at)})`).join('; ') + '.' });
  const ex = meds.rows.filter(r => r.refused || r.withheld || r.missed || r.unresolved);
  if (ex.length) c.push({ t: 'Medication exceptions', b: ex.map(r => `${r.name}: ${[r.refused && `${r.refused} refused`, r.withheld && `${r.withheld} withheld`, r.missed && `${r.missed} missed / not available`, r.unresolved && `${r.unresolved} unresolved`].filter(Boolean).join(', ')}`).join('; ') + '.' });
  if (meds.totals.late) c.push({ t: 'Dose timing', b: `${meds.totals.late} dose${meds.totals.late > 1 ? 's' : ''} given 30 min or more after the scheduled time.` });
  const late = physio.sessions.filter(s => s.done && s.delay !== null && s.delay > 120);
  if (late.length) c.push({ t: 'Physiotherapy timing', b: late.map(s => `${fmtDM(s.date)} window ${s.window} done ${s.actual}`).join('; ') + '.' });
  if (io.onChart && io.recordedDays) c.push({ t: 'Recorded net fluid balance', b: `cumulative ${io.totalNet > 0 ? '+' : ''}${io.totalNet} ml over ${io.recordedDays} charted day${io.recordedDays > 1 ? 's' : ''}${io.days.filter(d => d.status !== 'full').length ? `; ${io.days.filter(d => d.status === 'partial').length} partial, ${io.days.filter(d => d.status === 'missing').length} not charted` : ''}.` });
  if (nursing.incidents.length) c.push({ t: 'Incidents', b: nursing.incidents.map(i => `${fmtDT(i.at)} ${i.type}: ${i.description}`).join('; ').slice(0, 300) });
  return c;
}
export function candidateAttention({ meds, io, missed, vstats, vitals, physio }) {
  const a = [];
  meds.rows.forEach(r => r.stops.filter(s => s.notDoctor).forEach(s => a.push({ t: `${r.name}: order status`, b: `${s.note}. No doctor's instruction is documented.`, ask: `whether ${r.name} is to be continued`, src: 'MAR - medication orders' })));
  const hr = meds.rows.filter(r => r.highRisk && r.unresolved);
  if (hr.length) a.push({ t: 'High-risk medicine doses without an administration entry', b: hr.map(r => `${r.name}: ${r.unresolved}`).join('; ') + '.', src: 'MAR' });
  const neg = io.onChart && io.recordedDays && io.totalNet < 0 && io.days.some(d => d.status !== 'missing' && d.net < 0);
  if (neg) a.push({ t: 'Recorded net fluid balance', b: `${io.days.filter(d => d.status !== 'missing').map(d => `${d.net > 0 ? '+' : ''}${d.net}`).join(', ')} ml per chart day (cumulative ${io.totalNet} ml)${io.days.some(d => d.status !== 'full') ? `; ${io.days.filter(d => d.status !== 'full').length} day(s) partly or not charted` : ''}.`, src: 'I/O chart' });
  const gl = vstats.abnormal.filter(x => ['fasting', 'post', 'random'].includes(x.k));
  if (gl.length >= 2) a.push({ t: 'Blood glucose', b: `${gl.length} readings outside the configured targets (highest ${Math.max(...gl.map(x => x.v))} mg/dL).`, ask: 'the glucose targets and insulin plan for this Guest', src: 'Vital signs' });
  if (physio.plans.length && physio.plans.every(p => !p.precautions)) a.push({ t: 'Weight-bearing and precautions', b: 'Not documented in the physiotherapy plan.', ask: 'the permitted weight-bearing and any precautions', src: 'Physiotherapy plan' });
  if (missed.length >= 2) a.push({ t: 'Vital-sign checks not recorded', b: `${missed.length} scheduled checks have no reading (${missed.slice(0, 4).map(m => `${fmtDM(m.date)} ${fmtHM(m.time)}`).join(', ')}).`, src: 'Vital signs' });
  return a.slice(0, 5);
}
export const askLine = topic => topic ? `We would be grateful for your guidance on ${topic}.` : '';

// ---------- AI grounding checks ----------
export const ADVICE_RE = /\b(recommend\w*|advis(e|es|ed|ing)|suggest\w*|consider\w*|should|must|ought|need(s|ed)? to|may (require|need|benefit|warrant)|would benefit|warrant\w*|titrat\w*|prescrib\w*|refer(ral)? to|increase the|decrease the|reduce the|optimi[sz]\w*|adjust\w*|start (the|a|an)|it is (advisable|important|essential)|monitor(ing)? (is|closely)|evaluate|next step|diagnos\w*|likely|probabl\w*|suspect\w*|indicat(es|ive))\b/i;
// Every number the AI writes must already appear in the facts it was given (dates, values, counts).
export function groundedText(textOut, factsJson) {
  const s = txt(textOut); if (!s || ADVICE_RE.test(s)) return false;
  const nums = s.match(/\d+(?:\.\d+)?/g) || [];
  return nums.every(n => factsJson.includes(n));
}

// ---------- one model for both reports (all numbers computed here, never by AI) ----------
// kind: 'daily' | 'weekly'. period: {from,to}. For daily, page-2 trends cover the last 7 days (or since admission).
export function buildModel({ kind, patient, pref = {}, doctorName, period, data, settings = {}, now = new Date(), weekLabel = '', final = false, background = '' }) {
  const T = thresholdsFrom(settings, pref);
  const admission = admissionAt(patient), discharge = data.discharge || null;
  const trend = kind === 'daily' ? { from: new Date(Math.max(period.to.getTime() - 7 * DAY, admission ? admission.getTime() : 0)), to: period.to } : period;
  const reviewsAll = data.reviews || [];
  const vAll = vitalsIn(data.vitals, trend.from, trend.to), vPer = vitalsIn(data.vitals, period.from, period.to);
  const vstats = vitalStats(vPer, T), vtrend = vitalStats(vAll, T);
  const missed = missedVitalChecks({ schedule: patient.vitals_schedule, vitals: vPer, from: period.from, to: period.to, admission });
  const missedTrend = missedVitalChecks({ schedule: patient.vitals_schedule, vitals: vAll, from: trend.from, to: trend.to, admission });
  const medsPer = reconcileMedications({ orders: data.orders, mar: data.mar, reviews: reviewsAll, from: period.from, to: period.to, admission });
  const medsTrend = kind === 'daily' ? reconcileMedications({ orders: data.orders, mar: data.mar, reviews: reviewsAll, from: trend.from, to: trend.to, admission }) : medsPer;
  const physioPer = physioSummary({ plans: data.plans, sessions: data.sessions, from: period.from, to: period.to });
  const physioTrend = kind === 'daily' ? physioSummary({ plans: data.plans, sessions: data.sessions, from: trend.from, to: trend.to }) : physioPer;
  const ioPer = ioDays({ rows: data.ioRows, setting: data.ioSetting, from: period.from, to: period.to, admission, discharge: discharge?.at, now });
  const ioTrend = kind === 'daily' ? ioDays({ rows: data.ioRows, setting: data.ioSetting, from: trend.from, to: trend.to, admission, discharge: discharge?.at, now }) : ioPer;
  const nurPer = nursingSummary({ meals: data.meals, care: data.care, notes: data.notes, incidents: data.incidents, from: period.from, to: period.to });
  const nurTrend = kind === 'daily' ? nursingSummary({ meals: data.meals, care: data.care, notes: data.notes, incidents: data.incidents, from: trend.from, to: trend.to }) : nurPer;
  const revPer = doctorReviews({ reviews: reviewsAll, items: data.reviewItems, mar: data.mar, from: period.from, to: period.to });
  const revTrend = kind === 'daily' ? doctorReviews({ reviews: reviewsAll, items: data.reviewItems, mar: data.mar, from: trend.from, to: trend.to }) : revPer;
  const b = sectionB({ kind, vitals: vPer, vstats, missed, meds: medsPer, physio: physioPer, io: ioPer, nursing: nurPer, reviews: revPer, T });
  if (kind === 'weekly') {
    const doc = [missed.length && `${missed.length} scheduled vitals check${missed.length > 1 ? 's' : ''} not recorded`, ioPer.onChart && `I/O: ${ioPer.days.filter(d => d.status === 'full').length} days fully charted, ${ioPer.days.filter(d => d.status === 'partial').length} partial, ${ioPer.days.filter(d => d.status === 'missing').length} not charted`, medsPer.totals.unresolved && `${medsPer.totals.unresolved} dose${medsPer.totals.unresolved > 1 ? 's' : ''} without an administration entry`, ...medsPer.rows.filter(r => r.duplicates?.length).map(r => `${r.name}: ${r.duplicates.length} pair${r.duplicates.length > 1 ? 's' : ''} of "Given" entries within 60 min (${r.duplicates.slice(0, 3).map(d => `${fmtDT(d.first)} / ${fmtHM(hmOf(d.second))}`).join('; ')}) - possible double entry, being verified`)].filter(Boolean);
    if (doc.length) b.push(['Documentation', doc.join('. ') + '.']);
  }
  const changes = candidateChanges({ vstats: kind === 'daily' ? vtrend : vstats, meds: kind === 'daily' ? medsTrend : medsPer, physio: kind === 'daily' ? physioTrend : physioPer, io: kind === 'daily' ? ioTrend : ioPer, nursing: kind === 'daily' ? nurTrend : nurPer, reviews: kind === 'daily' ? revTrend : revPer });
  const attention = candidateAttention({ meds: kind === 'daily' ? medsTrend : medsPer, io: kind === 'daily' ? ioTrend : ioPer, missed: kind === 'daily' ? missedTrend : missed, vstats: kind === 'daily' ? vtrend : vstats, vitals: vPer, physio: physioPer });
  const age = (() => { const a = num(patient.age); if (a) return Math.round(a); const dob = ts(patient.date_of_birth); if (!dob) return null; let y = now.getFullYear() - dob.getFullYear(); const m = now.getMonth() - dob.getMonth(); if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) y--; return y > 0 && y < 130 ? y : null; })();
  const sex = txt(patient.gender).charAt(0).toUpperCase();
  const vByDay = []; for (let d = isoOf(trend.from); d <= isoOf(new Date(trend.to.getTime() - 1)); d = addDays(d, 1)) { const r = vAll.filter(v => isoOf(v.at) === d); vByDay.push({ date: d, n: r.length, bp: r.filter(x => x.sys !== null).map(x => `${x.sys}/${x.dia ?? '-'}`), pulse: rng(r.map(x => x.pulse).filter(v => v !== null)), spo2: rng(r.map(x => x.spo2).filter(v => v !== null)), temp: rng(r.map(x => x.temp).filter(v => v !== null)), rr: rng(r.map(x => x.rr).filter(v => v !== null)), pain: r.filter(x => x.pain !== null && x.pain !== undefined).map(x => x.pain), sugar: r.filter(x => x.sugar !== null).map(x => ({ v: x.sugar, k: x.sugarKind })), bad: { bp: r.some(x => vitalBad('sys', x.sys, T) || vitalBad('dia', x.dia, T)), pulse: r.some(x => vitalBad('pulse', x.pulse, T)), spo2: r.some(x => vitalBad('spo2', x.spo2, T)), temp: r.some(x => vitalBad('temp', x.temp, T)), rr: r.some(x => vitalBad('rr', x.rr, T)), sugar: r.some(x => x.sugar !== null && vitalBad(x.sugarKind, x.sugar, T)) } }); }
  return {
    kind, final, weekLabel, generatedAt: now, T,
    patient: { name: patientName(patient), ageSex: [age, sex].filter(Boolean).join(' / ') || '-', room: txt(patient.room_no) ? `${txt(patient.room_no)}${txt(patient.bed_no) ? '-' + txt(patient.bed_no) : ''}` : '-', id: txt(patient.patient_id) || '-', admitted: admission ? fmtDT(admission) : '-', admittedDate: admission ? fmtDate(isoOf(admission)) : '-', diagnosis: txt(patient.diagnosis), allergies: txt(patient.allergies), other: txt(patient.medical_history || patient.comorbidities || patient.past_medical_history) },
    doctor: drName(doctorName), period, trend, sinceAdmission: admission && period.from.getTime() === admission.getTime(),
    discharge: discharge?.at ? fmtDT(discharge.at) : '', background,
    b, changes, attention, aiUsed: false, aiModel: null,
    vitals: { list: vAll, period: vPer, stats: vstats, trendStats: vtrend, byDay: vByDay, missed: kind === 'daily' ? missedTrend : missed, schedule: patient.vitals_schedule },
    meds: kind === 'daily' ? medsTrend : medsPer, medsPeriod: medsPer,
    physio: kind === 'daily' ? physioTrend : physioPer, io: kind === 'daily' ? ioTrend : ioPer, nursing: kind === 'daily' ? nurTrend : nurPer, reviews: kind === 'daily' ? revTrend : revPer,
  };
}
// Compact facts for the AI. It may only select and phrase from these; every number is re-checked afterwards.
export function aiFacts(m) {
  return { report: m.kind, period: `${fmtDT(m.period.from)} to ${fmtDT(m.period.to)}`, guest: { age_sex: m.patient.ageSex, diagnosis: m.patient.diagnosis, other: m.patient.other, allergies: m.patient.allergies }, background_from_documents: m.background,
    status_rows: m.b, candidate_changes: m.changes, candidate_attention: m.attention.map(a => ({ title: a.t, body: a.b, ask_topic: a.ask || null })) };
}
