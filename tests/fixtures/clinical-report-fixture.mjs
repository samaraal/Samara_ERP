// Controlled TEST records for the clinical report tests. Fictitious Guest — never real data.
import { at, addDays } from '../../supabase/functions/daily-patient-report/clinical-core.mjs';
const iso = (d, hm) => at(d, hm).toISOString();
export function fixture({ admit = '2026-10-18', admitTime = '10:00', days = 8, ioMissing = ['2026-10-22'], withDischarge = null } = {}) {
  const patient = { id: 'test-guest', title: 'Mrs.', full_name: 'TEST GUEST (fictitious)', gender: 'Female', age: 78, room_no: 'T01', patient_id: 'MOG-TEST-0001', admission_date: admit, admission_time: admitTime, diagnosis: 'Type 2 diabetes mellitus; hypertension (TEST)', allergies: 'None known', vitals_schedule: ['06:00', '14:00', '22:00'] };
  const vitals = [], mar = [], sessions = [], meals = [], care = [], ioRows = [];
  const bp = [[132, 78], [138, 80], [128, 76], [134, 80], [142, 86], [130, 78], [96, 60], [118, 70], [124, 74]];
  for (let i = 0; i < days; i++) {
    const d = addDays(admit, i);
    ['06:10', '14:05', '22:00'].forEach((t, k) => {
      if (d === addDays(admit, 3) && k === 2) return; // one scheduled check not recorded
      if (i === 0 && k === 0) return; // before admission
      const b = bp[(i * 3 + k) % bp.length];
      vitals.push({ recorded_at: iso(d, t), systolic: b[0], diastolic: b[1], pulse: 72 + ((i + k) % 5) * 4, spo2: 96 + (k % 2), temperature: i === 5 && k === 1 ? 99.8 : 98.2 + k * .2, respiration: 18, pain_score: k === 1 ? 2 : null });
    });
    vitals.push({ recorded_at: iso(d, '06:40'), blood_sugar: [132, 128, 118, 124, 136, 122, 126, 120][i % 8], blood_sugar_type: 'FBS' });
    vitals.push({ recorded_at: iso(d, '10:30'), blood_sugar: [178, 186, 164, 172, 236, 182, 174, 170][i % 8], blood_sugar_type: 'PPBS' });
    ['09:00', '21:00'].forEach(t => { if (at(d, t) < at(admit, admitTime)) return; mar.push({ id: `met-${d}-${t}`, order_id: 'met', scheduled_date: d, scheduled_time: t, status: 'Given', administered_at: iso(d, t === '21:00' && i === 3 ? '21:50' : t) }); });
    if (at(d, '09:00') > at(admit, admitTime)) mar.push(i === 2 ? { id: `aml-${d}`, order_id: 'aml', scheduled_date: d, scheduled_time: '09:00', status: 'Withheld', withhold_reason: 'Low blood pressure', withhold_reading: 'BP 96/60', doctor_instruction: 'Skip this dose', doctor_informed_name: 'Sample Doctor', updated_at: iso(d, '09:30') } : { id: `aml-${d}`, order_id: 'aml', scheduled_date: d, scheduled_time: '09:00', status: 'Given', administered_at: iso(d, '09:05') });
    if (i === 1) mar.push({ id: `pan-${d}`, order_id: 'pan', scheduled_date: d, scheduled_time: '07:00', status: 'Refused', remarks: 'Nausea, as stated by patient' });
    else if (i === 4) { mar.push({ id: `pan-${d}`, order_id: 'pan', scheduled_date: d, scheduled_time: '07:00', status: 'Delayed', rescheduled_time: '08:00', reschedule_reason: 'Patient sleeping' }); mar.push({ id: `pan2-${d}`, order_id: 'pan', scheduled_date: d, scheduled_time: '08:00', status: 'Given', administered_at: iso(d, '08:05') }); }
    else if (i === 5) mar.push({ id: `pan-${d}`, order_id: 'pan', scheduled_date: d, scheduled_time: '07:00', status: 'Delayed', remarks: 'Patient in physiotherapy session' });
    else if (at(d, '07:00') > at(admit, admitTime)) mar.push({ id: `pan-${d}`, order_id: 'pan', scheduled_date: d, scheduled_time: '07:00', status: 'Given', administered_at: iso(d, '07:02') });
    if (i >= 1) { sessions.push({ session_date: d, session_at: iso(d, i === 3 ? '10:40' : '09:10'), scheduled_time: '08:00-10:00', actual_time: i === 3 ? '10:40' : '09:10', status: 'Completed', physiotherapist_name: 'Test Physio', notes: `Walker gait ${8 + i * 2} m, 1 assist · tolerated` }); sessions.push({ session_date: d, session_at: iso(d, i === 4 ? '19:40' : '17:00'), scheduled_time: '16:00-18:00', actual_time: i === 4 ? '19:40' : '17:00', status: i === 5 ? 'Postponed' : 'Completed', physiotherapist_name: 'Test Physio', notes: i === 5 ? 'Not done: temperature 99.8 F' : 'Hip strengthening · tolerated' }); }
    ['08:00', '13:00', '20:00'].forEach((t, k) => meals.push({ served_at: iso(d, t), meal_type: ['Breakfast', 'Lunch', 'Dinner'][k], consumption_status: (i + k) % 5 === 0 ? 'Half eaten' : 'Consumed fully' }));
    care.push({ completed_at: iso(d, '07:30'), care_type: 'Bathing assistance' }, { completed_at: iso(d, '23:00'), care_type: 'Repositioning (pressure-injury prevention)' });
    if (!ioMissing.includes(d)) { const part = i === 0 ? .4 : 1; ioRows.push({ io_date: d, at: iso(d, '12:00'), direction: 'Intake', ml: Math.round((1350 + (i % 3) * 100) * part) }, { io_date: d, at: iso(d, '16:00'), direction: 'Output', ml: Math.round((1250 + (i % 2) * 100) * part) }, { io_date: d, at: iso(d, '23:30'), direction: 'Intake', ml: 150 }); }
  }
  const orders = [
    { id: 'met', medicine_name: 'T. Metformin', strength: '500 mg', route: 'Oral', scheduled_times: '09:00,21:00', start_date: admit, is_active: true },
    { id: 'aml', medicine_name: 'T. Amlodipine', strength: '5 mg', route: 'Oral', scheduled_times: '09:00', start_date: admit, is_active: true },
    { id: 'pan', medicine_name: 'T. Pan', strength: '40 mg', route: 'Oral', scheduled_times: '07:00', start_date: admit, is_active: true },
    { id: 'par', medicine_name: 'T. Paracetamol', strength: '650 mg', route: 'Oral', frequency: 'SOS', is_prn: true }];
  mar.push({ id: 'par1', order_id: 'par', status: 'Given', administered_at: iso(addDays(admit, 5), '14:30'), remarks: 'Temperature 99.8 F' });
  const plans = [{ therapy_type: 'Gait training with walker, hip strengthening', frequency: 'Twice daily', session_times: ['08:00-10:00', '16:00-18:00'], advised_by: 'Dr. Sample Doctor', start_date: addDays(admit, 1), is_active: true, precautions: '' }];
  const reviews = [{ id: 'r1', reviewed_at: iso(addDays(admit, 2), '11:00'), doctor_name: 'Sample Doctor', order_mode: 'Telephone Order', clinical_notes: 'Omit amlodipine for the low-BP dose' }];
  const discharge = withDischarge ? { at: at(withDischarge.date, withDischarge.time) } : null;
  return { patient, pref: { doctor_recipient_name: 'Dr. Sample Doctor', doctor_recipient_mobile: '+91 90000 00000' }, data: { vitals, orders, mar, reviews, reviewItems: [], plans, sessions, meals, care, notes: [], incidents: [], ioRows, ioSetting: { enabled: true, started_at: iso(admit, admitTime) }, discharge } };
}
