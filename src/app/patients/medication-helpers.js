  const MEDICATION_TIME_OPTIONS = Array.from({length:24},(_,hour)=>({
    value:`${String(hour).padStart(2,'0')}:00`,
    label:`${hour===0?12:hour>12?hour-12:hour}:00 ${hour<12?'AM':'PM'}`
  }));
  const MEDICATION_FREQUENCY_TIMES = {
    'Once Daily (OD)':['08:00'],
    'Twice Daily (BD)':['08:00','20:00'],
    'Three Times Daily (TDS)':['06:00','14:00','22:00'],
    'Four Times Daily (QID)':['06:00','12:00','18:00','22:00'],
    'HS':['22:00'],
    'STAT':[],
    'Alternate Days':['08:00']
  };
  const MEDICATION_FREQUENCY_MAX_TIMES={
    'Once Daily (OD)':1,'Twice Daily (BD)':2,'Three Times Daily (TDS)':3,'Four Times Daily (QID)':4,
    'HS':1,'STAT':1,'SOS / PRN':24,'Weekly':1,'Monthly':1,'Alternate Days':4
  };
  function medicationTimeSelectionLimit(frequency){return MEDICATION_FREQUENCY_MAX_TIMES[String(frequency||'')]||1}
  function medicationTimesForFrequency(frequency,current){
    const suggested=MEDICATION_FREQUENCY_TIMES[frequency];
    const times=(suggested||String(current||'').split(',').map(normalizeMedicationTime).filter(Boolean));
    return times.slice(-medicationTimeSelectionLimit(frequency)).join(', ');
  }
  function normalizeMedicationTime(value){
    const text=String(value||'').trim();
    if(!text)return '';
    if(/^\d{2}:\d{2}$/.test(text))return text;
    const match=text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if(!match)return text;
    let hour=Number(match[1])%12;if(match[3].toUpperCase()==='PM')hour+=12;
    return `${String(hour).padStart(2,'0')}:${match[2]||'00'}`;
  }
  function medicationTimeLabel(value){
    const normalized=normalizeMedicationTime(value);const hour=Number(normalized.slice(0,2));
    if(Number.isNaN(hour))return String(value||'');
    return `${hour===0?12:hour>12?hour-12:hour}:${normalized.slice(3,5)||'00'} ${hour<12?'AM':'PM'}`;
  }
  // Clinical tasks scheduled before a same-day admission do not belong to the new stay.
  // Compare in Samara's local timezone so the rule is consistent on every device.
  function clinicalDateTimeInIndia(value){
    const stamp=new Date(value);if(Number.isNaN(stamp.getTime()))return null;
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(stamp).map(x=>[x.type,x.value]));
    return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
  }
  function clinicalSlotAfterAdmission(patient,dateISO,time){
    const slotDate=String(dateISO||'').slice(0,10);
    const admissionDate=String(patient?.admission_date||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)||!/^\d{4}-\d{2}-\d{2}$/.test(admissionDate))return true;
    if(slotDate!==admissionDate)return slotDate>admissionDate;
    const normalized=normalizeMedicationTime(time);
    if(!/^\d{2}:\d{2}$/.test(normalized))return true;
    const explicit=[patient.admission_datetime,patient.admission_timestamp,patient.admitted_at].filter(Boolean);
    const clock=String(patient.admission_time||'').slice(0,5);
    let boundary='';
    if(clock)boundary=clock;
    for(const value of explicit){
      const stamp=clinicalDateTimeInIndia(value);
      if(stamp?.date===admissionDate){boundary=stamp.time;break;}
    }
    const created=clinicalDateTimeInIndia(patient.created_at);
    const updated=clinicalDateTimeInIndia(patient.updated_at);
    if(!boundary&&created?.date===admissionDate)boundary=created.time;
    if(!boundary&&updated?.date===admissionDate)boundary=updated.time;
    return !boundary||normalized>=boundary;
  }
  // 2.18.84: was a GIVEN dose given on time? Compares "Actually given at" with the scheduled date + time (IST).
  // This is different from "Late entry", which only says whether it was RECORDED late after giving.
  // Late = 30 min or more after the scheduled time (same as the red "Administer (late)" button); early = 60 min or more before.
  function medicationDurationText(minutes){
    const m=Math.abs(Math.round(minutes)),hh=Math.floor(m/60),mm=m%60;
    return hh?`${hh} h${mm?` ${mm} min`:''}`:`${mm} min`;
  }
  function medicationGivenTiming(log){
    if(!log||String(log.status)!=='Given'||!log.administered_at)return null;
    const date=String(log.scheduled_date||'').slice(0,10),time=normalizeMedicationTime(log.scheduled_time).slice(0,5);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
    const due=new Date(`${date}T${time}:00+05:30`).getTime(),given=new Date(log.administered_at).getTime();
    if(!Number.isFinite(due)||!Number.isFinite(given))return null;
    const minutes=Math.round((given-due)/60000);
    if(minutes>=30)return {kind:'late',minutes,text:`Given late — ${medicationDurationText(minutes)} after the scheduled ${medicationTimeLabel(time)}`,short:`Given ${medicationDurationText(minutes)} late`};
    if(minutes<=-60)return {kind:'early',minutes,text:`Given early — ${medicationDurationText(minutes)} before the scheduled ${medicationTimeLabel(time)}`,short:`Given ${medicationDurationText(minutes)} early`};
    return {kind:'ontime',minutes,text:'Given on time',short:'On time'};
  }
  // 2.18.85: compulsory reason when a dose is GIVEN 30+ minutes late (SQL 276) — the Nursing Manager is informed.
  const MEDICATION_LATE_GIVEN_REASONS=['Guest asleep','Medicine not available','Guest refused at first, took it later','Guest away (hospital visit / outing)','Busy with an emergency','Doctor\'s instruction','Other'];
  function medicationLateGivenMinutes(scheduledDate,scheduledTime,givenAt){
    const t=medicationGivenTiming({status:'Given',scheduled_date:scheduledDate,scheduled_time:scheduledTime,administered_at:givenAt});
    return t&&t.kind==='late'?t.minutes:0;
  }
  const medicationLateGivenText=log=>log?.late_given_reason?`${log.late_given_reason}${log.late_given_details?` — ${log.late_given_details}`:''}`:'';
  const medicationRecordingText=log=>!log?'':log.late_entry
    ?`Late entry — recorded ${medicationDurationText(log.entry_delay_minutes||0)} after giving · ${log.late_entry_reason||''}${log.late_entry_justification?` — ${log.late_entry_justification}`:''}`
    :'Recorded at the time of giving (no delay in recording)';
  // Doses that were not given (refused, patient sleeping, missed, delayed) can be rescheduled.
  const MEDICATION_RESCHEDULE_STATUSES=['Refused','Missed','Delayed'];
  function addDaysISODate(dateISO,days){
    const d=new Date(`${String(dateISO).slice(0,10)}T00:00:00Z`);if(Number.isNaN(d.getTime()))return '';
    d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
  }
  // Minutes from the original dose to the re-medication time (crossing midnight when the new time is earlier).
  function medicationRescheduleGapMinutes(scheduledTime,rescheduledTime){
    const a=normalizeMedicationTime(scheduledTime),b=normalizeMedicationTime(rescheduledTime);
    if(!/^\d{2}:\d{2}$/.test(a)||!/^\d{2}:\d{2}$/.test(b))return NaN;
    const am=Number(a.slice(0,2))*60+Number(a.slice(3,5)),bm=Number(b.slice(0,2))*60+Number(b.slice(3,5));
    return bm>am?bm-am:bm+1440-am;
  }
  // 2.18.81: nurses may reschedule a dose to ANY time. A time later than the original dose falls on the same
  // date; an earlier clock time falls on the next date (the dose is moved forward, up to 24 hours). The only
  // time not allowed is the original time itself.
  function medicationRescheduleTimeValid(scheduledTime,rescheduledTime){
    const gap=medicationRescheduleGapMinutes(scheduledTime,rescheduledTime);
    return Number.isFinite(gap)&&gap>0&&gap<1440;
  }
  const MEDICATION_RESCHEDULE_TIME_MESSAGE='Choose a new time different from the original dose time.';
  // Date on which a rescheduled dose falls: same day, or the next day when the new time is past midnight.
  function rescheduledDoseDate(log){
    const date=String(log?.scheduled_date||'').slice(0,10);
    const from=normalizeMedicationTime(log?.scheduled_time),to=normalizeMedicationTime(log?.rescheduled_time);
    if(!date||!to)return '';
    return to>from?date:addDaysISODate(date,1);
  }
  function medicationOrderDoseEligible(order,dateISO,time){
    if(!order||!dateISO||!time)return false;
    const normalized=normalizeMedicationTime(time);
    const due=new Date(`${dateISO}T${normalized}:00`);
    if(Number.isNaN(due.getTime()))return false;
    if(order.start_date&&String(order.start_date).slice(0,10)>dateISO)return false;
    if(order.end_date&&String(order.end_date).slice(0,10)<dateISO)return false;
    const effective=order.effective_from?new Date(order.effective_from):null;
    if(effective&&!Number.isNaN(effective.getTime())&&due.getTime()<effective.getTime())return false;
    const stopped=order.stopped_at?new Date(order.stopped_at):null;
    if(stopped&&!Number.isNaN(stopped.getTime())&&due.getTime()>=stopped.getTime())return false;
    if(order.is_active===false&&!stopped)return false;
    const status=String(order.status||'').trim().toLowerCase();
    if(['completed','discontinued','stopped','inactive'].includes(status)&&!stopped)return false;
    if(!medicationOrderDueOnDate(order,dateISO))return false;
    return true;
  }
  // 2.14.74: Weekly / Monthly medicines are due only on their own day, counted from the first dose
  // (Effective From date in India time, else start date). Weekly = every 7 days; Monthly = the same date
  // each month (the last day of a shorter month). All other frequencies are due every day as before.
  function medicationOrderAnchorDate(order){
    const eff=order?.effective_from?new Date(order.effective_from):null;
    if(eff&&!Number.isNaN(eff.getTime())){
      try{return eff.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,10);}catch(_e){}
    }
    return String(order?.start_date||'').slice(0,10);
  }
  // 2.18.91: a Weekly medicine is due on its OWN weekday (e.g. "Every Friday"), not every 7 days from whatever date
  // the latest prescription version happened to start (Inj. Anfoe, 23-10-2026: started Sunday 18-10 after a doctor
  // review, note said Friday → the ERP counted Sundays and the Friday dose never appeared anywhere).
  // The day comes from: the order's dose_weekday (SQL 279) → the weekday written in the instruction → old 7-day rule.
  const MEDICATION_WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function medicationWeekdayFromText(text){
    const found=new Set();const re=/\b(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?s?\b/gi;let m;
    const map={sun:0,mon:1,tue:2,tues:2,wed:3,wednes:3,thu:4,thur:4,thurs:4,fri:5,sat:6,satur:6};
    while((m=re.exec(String(text||''))))found.add(map[m[1].toLowerCase()]);
    return found.size===1?[...found][0]:null; // none or more than one day → not decided from the text
  }
  function medicationMonthDayFromText(text){
    const m=String(text||'').match(/\bday\s*(\d{1,2})\b/i)||String(text||'').match(/\b(\d{1,2})(?:st|nd|rd|th)\s+(?:of\s+)?(?:every|each)\s+month\b/i);
    const n=m?Number(m[1]):NaN;return n>=1&&n<=31?n:null;
  }
  function medicationOrderWeekday(order){
    const v=order?.dose_weekday;if(v!==null&&v!==undefined&&v!==''&&Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=6)return Number(v);
    return medicationWeekdayFromText(order?.special_instruction);
  }
  function medicationOrderMonthDay(order){
    const v=Number(order?.dose_month_day);if(Number.isInteger(v)&&v>=1&&v<=31)return v;
    return medicationMonthDayFromText(order?.special_instruction);
  }
  // Puts the chosen weekday into the instruction text ("Every Friday · …"), replacing any other weekday written there.
  function medicationInstructionWithWeekday(text,weekday){
    const day=MEDICATION_WEEKDAYS[weekday];if(!day)return text||'';
    let t=String(text||'').replace(/\b(every|each|on)\s+(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?s?\b/gi,'').replace(/\b(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?s?\b/gi,'').replace(/\s{2,}/g,' ').replace(/^[\s·,;-]+|[\s·,;-]+$/g,'');
    return t?`Every ${day} · ${t}`:`Every ${day}`;
  }
  function medicationInstructionWithMonthDay(text,dayNo){
    if(!(dayNo>=1&&dayNo<=31))return text||'';
    let t=String(text||'').replace(/\b(every month on )?day\s*\d{1,2}\b/gi,'').replace(/\s{2,}/g,' ').replace(/^[\s·,;-]+|[\s·,;-]+$/g,'');
    return t?`Every month on day ${dayNo} · ${t}`:`Every month on day ${dayNo}`;
  }
  // 2.18.96: Alternate Days medicines (every other day). The cycle is fixed by one "dose day" written into the
  // instruction ("Alternate days from 23-10-2026") and saved as medication_orders.dose_anchor_date (SQL 283), so it
  // travels with every prescription version (Doctor Review keeps it) — never re-counted from a new version's start.
  function medicationIsAlternateDays(frequency){return /^alternate\s*days?$|^alternate\s*day\b|every\s*other\s*day|^eod$|^a\/?d$/i.test(String(frequency||'').trim())}
  function medicationAlternateStartFromText(text){
    const m=String(text||'').match(/alternate\s+days?\s+(?:from|starting|start)\s*:?\s*(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/i);
    if(!m)return '';
    const iso=`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime())?'':iso;
  }
  function medicationOrderAlternateAnchor(order){
    const v=String(order?.dose_anchor_date||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
    return medicationAlternateStartFromText(order?.special_instruction)||medicationOrderAnchorDate(order);
  }
  function medicationInstructionWithAlternateStart(text,iso){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return text||'';
    const t=String(text||'').replace(/alternate\s+days?\s+(?:from|starting|start)\s*:?\s*\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4}/gi,'').replace(/\s{2,}/g,' ').replace(/^[\s·,;-]+|[\s·,;-]+$/g,'');
    const label=`Alternate days from ${iso.slice(8,10)}-${iso.slice(5,7)}-${iso.slice(0,4)}`;
    return t?`${label} · ${t}`:label;
  }
  // Dates on which a Weekly / Monthly medicine falls from start to end (for the preview under the form fields).
  function medicationPeriodicPreview(order,startISO,endISO,max=8){
    const out=[];let d=String(startISO||'').slice(0,10);const end=String(endISO||'').slice(0,10)||addDaysISODate(d,62);
    for(let i=0;i<93&&d&&d<=end&&out.length<max;i++){if(medicationOrderDueOnDate({...order,start_date:startISO,effective_from:null},d))out.push(d);d=addDaysISODate(d,1);}
    return out;
  }
  function medicationOrderDueOnDate(order,dateISO){
    const freq=String(order?.frequency||'').trim().toLowerCase();
    if(medicationIsAlternateDays(freq)){
      // 2.18.96: Alternate Days = every 2nd day counted from the order's own dose day (kept across doctor reviews).
      const ad=medicationOrderAlternateAnchor(order);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(ad)||!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO||'')))return true;
      const ua=Date.UTC(+ad.slice(0,4),+ad.slice(5,7)-1,+ad.slice(8,10)),ud=Date.UTC(+dateISO.slice(0,4),+dateISO.slice(5,7)-1,+dateISO.slice(8,10));
      return Math.abs(Math.round((ud-ua)/86400000))%2===0;
    }
    if(freq!=='weekly'&&freq!=='monthly')return true;
    const anchor=medicationOrderAnchorDate(order);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO||'')))return true;
    const a=Date.UTC(+anchor.slice(0,4),+anchor.slice(5,7)-1,+anchor.slice(8,10));
    const d=Date.UTC(+dateISO.slice(0,4),+dateISO.slice(5,7)-1,+dateISO.slice(8,10));
    if(d<a)return false;
    if(freq==='weekly'){const wd=medicationOrderWeekday(order);if(wd!==null)return new Date(d).getUTCDay()===wd;return Math.round((d-a)/86400000)%7===0;}
    const fixedDay=medicationOrderMonthDay(order);
    const anchorDay=fixedDay||+anchor.slice(8,10),y=+dateISO.slice(0,4),m=+dateISO.slice(5,7),day=+dateISO.slice(8,10);
    const lastDay=new Date(Date.UTC(y,m,0)).getUTCDate();
    return day===Math.min(anchorDay,lastDay);
  }
  function medicationOrderNextDueDate(order,fromISO){
    let d=String(fromISO||'').slice(0,10);
    for(let i=0;i<62&&d;i++){if(medicationOrderDueOnDate(order,d))return d;d=addDaysISODate(d,1);}
    return '';
  }
  // 2.18.94: Physiotherapy plans — one session time per session of the day (Twice daily = 2 times, Three times daily = 3).
  // Saved in physiotherapy_plans.session_times (SQL 282); preferred_time keeps the first time for older screens.
  const PHYSIO_FREQUENCIES=['Once daily','Twice daily','Three times daily','Alternate days','Weekly','As advised'];
  function physioSessionsPerDayFor(frequency){
    const f=String(frequency||'').toLowerCase();
    if(/four|4\s*times|qid/.test(f))return 4;
    if(/thrice|three|3\s*times|tds|tid/.test(f))return 3;
    if(/twice|two|2\s*times|\bbd\b|\bbid\b/.test(f))return 2;
    return 1;
  }
  function physioPlanTimes(plan){
    const list=(Array.isArray(plan?.session_times)?plan.session_times:[]).map(t=>String(t||'').slice(0,5)).filter(t=>/^\d{2}:\d{2}$/.test(t));
    if(list.length)return [...new Set(list)].sort();
    const one=String(plan?.preferred_time||plan?.session_time||'').slice(0,5);
    return /^\d{2}:\d{2}$/.test(one)?[one]:[];
  }
  // Session time boxes for a plan form: n boxes for the frequency; returns the times array via onChange.
  function PhysioSessionTimesFields({frequency,times,onChange}){
    const n=physioSessionsPerDayFor(frequency);
    const list=Array.from({length:n},(_,i)=>String((times||[])[i]||'').slice(0,5));
    const label=i=>n===1?'Preferred time':`Session ${i+1} time`;
    return h(React.Fragment,null,list.map((t,i)=>h('div',{className:'field',key:`physio-time-${i}`},
      h('label',null,label(i),n>1?' *':''),
      h('input',{type:'time',required:n>1,value:t,onChange:e=>{const next=[...list];next[i]=e.target.value;onChange(next)}}),
      n>1&&i===n-1&&new Set(list.filter(Boolean)).size<list.filter(Boolean).length?h('small',{className:'error-text',style:{display:'block'}},'Each session needs a different time.'):null)));
  }
  function physioTimesProblem(frequency,times){
    const n=physioSessionsPerDayFor(frequency);if(n<2)return '';
    const list=(times||[]).slice(0,n).map(t=>String(t||'').slice(0,5)).filter(t=>/^\d{2}:\d{2}$/.test(t));
    if(list.length<n)return `Enter all ${n} session times for the ${frequency} physiotherapy plan.`;
    if(new Set(list).size<n)return 'Each physiotherapy session needs a different time.';
    return '';
  }
  // 2.14.75: Strength = amount + unit chosen from a list (avoids typing mistakes such as "500ma").
  // Saved as one text value, e.g. "500 mg", "2.5 mg/5 ml", "50/500 mg" — the same column as before.
  const MEDICATION_STRENGTH_UNITS=['mg','mcg','g','ml','mg/ml','mg/5 ml','IU','units','%','drops','tablet','capsule','puff','sachet','patch'];
  const MEDICATION_UNIT_ALIASES={'mgs':'mg','milligram':'mg','milligrams':'mg','µg':'mcg','ug':'mcg','microgram':'mcg','micrograms':'mcg','gm':'g','gram':'g','grams':'g','gms':'g','mls':'ml','millilitre':'ml','milliliter':'ml','iu':'IU','u':'units','unit':'units','drop':'drops','tab':'tablet','tabs':'tablet','tablets':'tablet','cap':'capsule','caps':'capsule','capsules':'capsule','puffs':'puff','sachets':'sachet','patches':'patch','mg/5ml':'mg/5 ml','mg / 5 ml':'mg/5 ml','mg/ml':'mg/ml'};
  function parseMedicationStrength(value){
    const text=String(value||'').trim();
    if(!text)return {amount:'',unit:'',raw:''};
    const m=text.match(/^([\d.,/+\-\s]*\d[\d.,/+\-]*)\s*(.*)$/);
    if(!m)return {amount:'',unit:'',raw:text};
    const amount=m[1].replace(/\s+/g,'');const rest=m[2].trim();
    if(!rest)return {amount,unit:'',raw:text};
    const key=rest.toLowerCase().replace(/\s+/g,' ');
    const exact=MEDICATION_STRENGTH_UNITS.find(u=>u.toLowerCase()===key)||MEDICATION_UNIT_ALIASES[key]||MEDICATION_UNIT_ALIASES[key.replace(/\s+/g,'')];
    return exact?{amount,unit:exact,raw:text}:{amount,unit:'',raw:text,unknownUnit:rest};
  }
  function composeMedicationStrength(amount,unit){
    const a=String(amount||'').trim();const u=String(unit||'').trim();
    return [a,u].filter(Boolean).join(' ');
  }
  function medicationStrengthValid(value){
    const p=parseMedicationStrength(value);
    return Boolean(p.amount&&p.unit);
  }
  function MedicationStrengthInput({label='Strength',value,onChange,required=false}){
    const parsed=parseMedicationStrength(value);
    const [amount,setAmount]=React.useState(parsed.amount);
    const [unit,setUnit]=React.useState(parsed.unit);
    React.useEffect(()=>{
      const p=parseMedicationStrength(value);
      if(composeMedicationStrength(amount,unit)!==String(value||'').trim()){setAmount(p.amount);setUnit(p.unit);}
    },[value]);
    function push(nextAmount,nextUnit){setAmount(nextAmount);setUnit(nextUnit);onChange(composeMedicationStrength(nextAmount,nextUnit));}
    const current=String(value||'').trim();const oldText=current&&!(parsed.amount&&parsed.unit)&&current!==composeMedicationStrength(amount,unit)?current:'';
    return h('div',{className:'field medication-strength-field'},
      h('label',null,label),
      h('div',{style:{display:'flex',gap:'6px'}},
        h('input',{type:'text',inputMode:'decimal',required,value:amount,placeholder:'e.g. 500',style:{flex:'1 1 55%',minWidth:0},
          onChange:e=>push(e.target.value.replace(/[^\d.,/+\-]/g,''),unit)}),
        h('select',{required,value:unit,style:{flex:'1 1 45%',minWidth:0},onChange:e=>push(amount,e.target.value)},
          h('option',{value:''},'Unit'),
          MEDICATION_STRENGTH_UNITS.map(u=>h('option',{key:u,value:u},u)))
      ),
      oldText?h('small',{className:'field-hint error-text',style:{display:'block',marginTop:'4px'}},`Previously entered as "${oldText}" — enter the number and choose the unit.`)
        :required&&amount&&!unit?h('small',{className:'field-hint error-text',style:{display:'block',marginTop:'4px'}},'Choose the unit'):null
    );
  }
  // 2.18.91: "Day of week" (Weekly, compulsory) / "Day of month" (Monthly) for a medicine, saved into the instruction
  // ("Every Friday · …") so it travels with every prescription version and every save path; shows the dose dates.
  function medicationPeriodicDayProblem(frequency,instruction,name){
    const f=String(frequency||'').trim().toLowerCase();
    if(f==='weekly'&&medicationWeekdayFromText(instruction)===null)return `Choose the Day of week for the weekly medicine ${name||''}`.trim()+'.';
    if(medicationIsAlternateDays(f)&&!medicationAlternateStartFromText(instruction))return `Choose the Dose day for the alternate-day medicine ${name||''}`.trim()+'.';
    return '';
  }
  function MedicationPeriodicDayField({frequency,instruction,onInstruction,startISO,endISO}){
    const f=String(frequency||'').trim().toLowerCase();
    if(medicationIsAlternateDays(f))return h(MedicationAlternateDayField,{instruction,onInstruction,startISO,endISO});
    if(f!=='weekly'&&f!=='monthly')return null;
    const start=String(startISO||'').slice(0,10);
    const order={frequency,special_instruction:instruction};
    const dates=start?medicationPeriodicPreview(order,start,endISO||'',8):[];
    const fmtD=d=>`${MEDICATION_WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()].slice(0,3)} ${formatDateIN(d)}`;
    const wd=medicationWeekdayFromText(instruction),md=medicationMonthDayFromText(instruction);
    const chosen=f==='weekly'?wd!==null:true;
    const note=!chosen?null:dates.length===0?h('small',{style:{display:'block',color:'#b42318',fontWeight:700}},'No dose falls between the start and the end date — check the Start and the Duration.')
      :h('small',{style:{display:'block',color:dates.length===1&&endISO?'#b42318':'#0a7a42',fontWeight:700}},
        `${dates.length===1&&endISO?'Only ONE dose in this Duration: ':'Doses: '}${dates.map(fmtD).join(', ')}${dates.length>=8?' …':''}${dates.length===1&&endISO?' — for 4 weeks choose Duration "28 Days".':''}`);
    return h('div',{className:'field'},
      f==='weekly'
        ?h(React.Fragment,null,h('label',null,'Day of week *'),h('select',{required:true,value:wd===null?'':String(wd),onChange:e=>{if(e.target.value!=='')onInstruction(medicationInstructionWithWeekday(instruction,Number(e.target.value)))}},
            h('option',{value:''},'Choose the day'),MEDICATION_WEEKDAYS.map((d,i)=>h('option',{key:d,value:String(i)},d))))
        :h(React.Fragment,null,h('label',null,'Day of month'),h('input',{type:'number',min:1,max:31,value:md||'',placeholder:'e.g. 5',onChange:e=>{const n=Number(e.target.value);if(n>=1&&n<=31)onInstruction(medicationInstructionWithMonthDay(instruction,n))}})),
      note);
  }
  // 2.18.96: "Dose day" for an Alternate Days medicine — any one day the medicine is (or was) given; the ERP then
  // shows it every 2nd day from there (MAR, Shift Tasks, screensaver, alerts). Shows the coming dose dates.
  function MedicationAlternateDayField({instruction,onInstruction,startISO,endISO}){
    const start=String(startISO||'').slice(0,10);
    const chosen=medicationAlternateStartFromText(instruction);
    const order={frequency:'Alternate Days',special_instruction:instruction};
    const dates=chosen&&start?medicationPeriodicPreview(order,start,endISO||'',8):[];
    const fmtD=d=>`${MEDICATION_WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()].slice(0,3)} ${formatDateIN(d)}`;
    const quick=start?[[start,'Start day'],[addDaysISODate(start,1),'Next day']]:[];
    return h('div',{className:'field'},
      h('label',null,'Dose day *'),
      h(StrictDateInput,{required:true,value:chosen,'aria-label':'Dose day',onChange:e=>{const v=String(e.target.value||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(v))onInstruction(medicationInstructionWithAlternateStart(instruction,v))}}),
      quick.length?h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'4px'}},quick.map(([d,l])=>h('button',{type:'button',key:d,className:`btn btn-secondary${chosen===d?' active':''}`,style:{padding:'3px 8px',fontSize:'12px'},onClick:()=>onInstruction(medicationInstructionWithAlternateStart(instruction,d))},`${l} (${formatDateIN(d)})`))):null,
      !chosen?h('small',{style:{display:'block'}},'Any day this medicine is given (first dose, or the last dose taken before) — doses then follow every 2nd day.')
        :dates.length===0?h('small',{style:{display:'block',color:'#b42318',fontWeight:700}},'No dose falls between the start and the end date — check the Start and the Duration.')
        :h('small',{style:{display:'block',color:'#0a7a42',fontWeight:700}},`Doses: ${dates.map(fmtD).join(', ')}${dates.length>=8?' …':''}`));
  }
  function MedicationTimeSelector({label,value,onChange,required=false,frequency='Once Daily (OD)'}){
    const limit=medicationTimeSelectionLimit(frequency);
    const selected=String(value||'').split(',').map(normalizeMedicationTime).filter(Boolean).slice(0,limit);
    const [open,setOpen]=React.useState(false);
    const [draft,setDraft]=React.useState(selected);
    React.useEffect(()=>{if(!open)setDraft(selected)},[value,frequency,open]);
    function openPicker(){setDraft(selected);setOpen(true)}
    function toggle(time){setDraft(current=>current.includes(time)?current.filter(x=>x!==time):limit===1?[time]:[...current.slice(-(limit-1)),time])}
    function confirm(){onChange([...draft].sort().join(', '));setOpen(false)}
    function reset(){setDraft([])}
    function cancel(){setDraft(selected);setOpen(false)}
    return h('div',{className:'field medication-time-field'},
      h('label',null,label),
      h('button',{type:'button',className:'time-picker-trigger',onClick:openPicker,'aria-expanded':open},
        h('span',{className:selected.length?'time-picker-value':'time-picker-placeholder'},selected.length?selected.map(medicationTimeLabel).join(' • '):'Select time'),
        h('span',{className:'time-picker-caret'},'▾')
      ),
      selected.length?h('div',{className:'time-chip-list'},selected.map(time=>h('span',{className:'time-chip',key:time},medicationTimeLabel(time),h('button',{type:'button','aria-label':`Remove ${medicationTimeLabel(time)}`,onClick:()=>onChange(selected.filter(x=>x!==time).join(', '))},'×')))):null,
      open&&ReactDOM.createPortal?h(React.Fragment,null,ReactDOM.createPortal(h('div',{className:'time-picker-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget)cancel()}},
        h('div',{className:'time-picker-popup',role:'dialog','aria-modal':'true','aria-label':'Select medication time'},
          h('div',{className:'time-picker-head'},h('div',null,h('h4',null,'Select Time'),h('small',null,limit===1?'Choose one medicine time':`Choose up to ${limit} medicine times · ${frequency}`)),h('button',{type:'button',className:'close',onClick:cancel},'×')),
          h('div',{className:'time-picker-grid'},MEDICATION_TIME_OPTIONS.map(opt=>h('button',{type:'button',className:`time-picker-option ${draft.includes(opt.value)?'selected':''}`,key:opt.value,onClick:()=>toggle(opt.value)},opt.label))),
          h('div',{className:'time-picker-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:reset},'Reset'),h('button',{type:'button',className:'btn btn-secondary',onClick:cancel},'Cancel'),h('button',{type:'button',className:'btn btn-primary',onClick:confirm},'OK'))
        )
      ),document.body)):null,
      required&&selected.length===0?h('small',{className:'field-hint error-text'},'Select at least one time'):null
    );
  }

  function blankMedicine(){
    return {
      prescribed_by_doctor:'',
      medicine_name:'',
      strength:'',
      dose:'',
      route:'Oral',
      food_instruction:'After food',
      times:'08:00',
      frequency:'Once Daily (OD)',
      duration:'Long Term',
      custom_duration_days:'',
      start_date:todayISOIndia(),
      effective_from:'', // 2.14.71: date & time the medicine starts (defaults to the admission date & time)
      special_instruction:'',
      is_locked:false
    };
  }


  function medicineOrderIsCurrentOrUpcoming(order){
    if(order?.is_active===false)return false;
    const today=todayISOIndia();
    const end=String(order?.end_date||'').slice(0,10);
    return !end||end>=today;
  }

  function medicineOrderKey(order){
    const times=Array.isArray(order?.scheduled_times)
      ?order.scheduled_times.map(String).sort().join('|')
      :String(order?.times||'').split(',').map(x=>x.trim()).filter(Boolean).sort().join('|');
    return [
      String(order?.medicine_name||'').trim().toLowerCase(),
      String(order?.strength||'').trim().toLowerCase(),
      String(order?.frequency||'').trim().toLowerCase(),
      String(order?.route||'').trim().toLowerCase(),
      String(order?.food_instruction||'').trim().toLowerCase(),
      times,
      String(order?.start_date||'').slice(0,10)
    ].join('::');
  }

  function currentUpcomingMedicineOrders(rows){
    const seen=new Set();
    return (rows||[])
      .filter(medicineOrderIsCurrentOrUpcoming)
      .sort((a,b)=>String(a.start_date||'').localeCompare(String(b.start_date||''))||String(a.medicine_name||'').localeCompare(String(b.medicine_name||'')))
      .filter(row=>{
        const key=medicineOrderKey(row);
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      });
  }

  // v2.14.87: optional preferred time window for a care task (e.g. 10:00 AM – 12:00 PM).
  const careTimeValue = v => { const m=String(v||'').match(/^(\d{1,2}):(\d{2})/); return m?`${m[1].padStart(2,'0')}:${m[2]}`:''; };
  const careWindowLabel = c => { const a=careTimeValue(c?.preferred_from),b=careTimeValue(c?.preferred_to); if(!a&&!b)return 'Any time in shift'; const fmt12=t=>{const [hh,mm]=t.split(':').map(Number);return `${String(hh%12||12).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${hh>=12?'PM':'AM'}`}; return a&&b?`Preferred ${fmt12(a)} – ${fmt12(b)}`:`Preferred ${a?'from '+fmt12(a):'by '+fmt12(b)}`; };
  function blankCare(){
    return {
      care_type:'',
      shift:'Both shifts',
      frequency:'Daily',
      instruction:'',
      preferred_from:'',
      preferred_to:'',
      is_locked:false
    };
  }



  // 2.15.11: clinical withholding of a dose (nurse's assessment) + doctor's instruction follow-up
  const MEDICATION_WITHHOLD_REASONS=['Low blood pressure','Low blood sugar','Low pulse / heart rate','Drowsy / unwell','Nil by mouth (NPO)','Vomiting / cannot swallow','Other clinical reason'];
  const MEDICATION_WITHHOLD_READING_HINT={
    'Low blood pressure':'Example: BP 90/58 mmHg at 7:50 AM',
    'Low blood sugar':'Example: RBS 68 mg/dL (glucometer) at 7:45 AM',
    'Low pulse / heart rate':'Example: Pulse 50/min at 8:00 AM',
    'Drowsy / unwell':'Example: Drowsy, responds to voice; BP 110/70, SpO₂ 96%',
    'Nil by mouth (NPO)':'Example: NPO for procedure from 6 AM (doctor order)',
    'Vomiting / cannot swallow':'Example: Vomited twice since 7 AM',
    'Other clinical reason':'Enter the observation / reading'
  };
  const MEDICATION_DOCTOR_CONTACT_MODES=['Phone call','WhatsApp','In person','Not reachable yet — will retry'];
  const MEDICATION_WITHHOLD_INSTRUCTIONS=['Give now','Give at a later time','Skip this dose','Change prescription (Doctor Review)'];
  const MEDICATION_BP_RE=/amlodipine|telmisartan|losartan|olmesartan|valsartan|irbesartan|azilsartan|ramipril|enalapril|lisinopril|perindopril|metoprolol|atenolol|bisoprolol|carvedilol|nebivolol|propranolol|labetalol|cilnidipine|nifedipine|felodipine|benidipine|hydrochlorothiazide|chlorthalidone|indapamide|furosemide|frusemide|torsemide|spironolactone|clonidine|prazosin|methyldopa|\btelma\b|\bamlong\b|\bstamlo\b/i;
  const MEDICATION_RATE_RE=/metoprolol|atenolol|bisoprolol|carvedilol|nebivolol|propranolol|labetalol|diltiazem|verapamil|digoxin|ivabradine/i;
  const MEDICATION_SUGAR_RE=/metformin|glimepiride|gliclazide|glipizide|glibenclamide|insulin|sitagliptin|vildagliptin|teneligliptin|linagliptin|saxagliptin|dapagliflozin|empagliflozin|canagliflozin|pioglitazone|voglibose|acarbose|repaglinide|\bglycomet\b|\bamaryl\b|\bjanuvia\b|\bgalvus\b|\bhuman mixtard\b|\blantus\b|\bnovorapid\b/i;
  function medicationWithholdOpen(log){return String(log?.status||'')==='Withheld'&&!log?.doctor_instruction}
  // Warn-only: returns a suggestion when a recent reading is low for this kind of medicine. The nurse decides.
  // 2.16.10: takes the Guest's recent vitals (any order) and uses the latest reading of EACH parameter, so a low
  // sugar at 7:00 is not missed when BP alone was recorded at 7:30 (before, only the single latest entry was read).
  function medicationWithholdSuggestion(order,recentVitals){
    const name=`${order?.medicine_name||''} ${order?.generic_name||''}`;
    const list=(Array.isArray(recentVitals)?recentVitals:(recentVitals?[recentVitals]:[])).filter(Boolean)
      .slice().sort((a,b)=>String(b.recorded_at||'').localeCompare(String(a.recorded_at||'')));
    const has=(v,field)=>v[field]!==null&&v[field]!==undefined&&v[field]!==''&&Number.isFinite(Number(v[field]))&&Number(v[field])>0; // 0 = not taken
    const latest=field=>list.find(v=>has(v,field))||null;
    const at=v=>v?.recorded_at?new Date(v.recorded_at).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}):'';
    const sv=latest('blood_sugar');
    if(MEDICATION_SUGAR_RE.test(name)&&sv&&Number(sv.blood_sugar)<100){
      const sugar=Number(sv.blood_sugar);
      const reading=`Blood sugar ${sugar} mg/dL${sv.blood_sugar_type&&sv.blood_sugar_type!=='Not Taken'?` (${sv.blood_sugar_type})`:''}${at(sv)?` at ${at(sv)}`:''}`;
      return {reason:'Low blood sugar',reading,text:`${sugar<70?'Low blood sugar (below 70 mg/dL)':'Blood sugar is already in the normal range'}: ${reading}. This diabetes medicine may lower it further — consider withholding and informing the treating doctor.`};
    }
    const bv=list.find(v=>has(v,'systolic')||has(v,'diastolic'))||null;
    if(MEDICATION_BP_RE.test(name)&&bv){
      const s=has(bv,'systolic')?Number(bv.systolic):NaN,d=has(bv,'diastolic')?Number(bv.diastolic):NaN;
      if((Number.isFinite(s)&&s<100)||(Number.isFinite(d)&&d<60)){
        const reading=`BP ${Number.isFinite(s)?s:'—'}/${Number.isFinite(d)?d:'—'} mmHg${at(bv)?` at ${at(bv)}`:''}`;
        return {reason:'Low blood pressure',reading,text:`Low blood pressure: ${reading}. This BP medicine may lower it further — consider withholding and informing the treating doctor.`};
      }
    }
    const pv=latest('pulse');
    if(MEDICATION_RATE_RE.test(name)&&pv&&Number(pv.pulse)<55){
      const pulse=Number(pv.pulse);
      const reading=`Pulse ${pulse}/min${at(pv)?` at ${at(pv)}`:''}`;
      return {reason:'Low pulse / heart rate',reading,text:`Low pulse: ${reading}. This medicine slows the heart rate — consider withholding and informing the treating doctor.`};
    }
    return null;
  }
  // 2.16.29: the same medicine-entry pieces are used by the Spot Assessment (spot-assessment.js)
  try{window.SamaraMedicationKit={MEDICATION_FREQUENCY_TIMES,MEDICATION_FREQUENCY_MAX_TIMES,medicationTimeSelectionLimit,medicationTimesForFrequency,normalizeMedicationTime,medicationTimeLabel,MedicationStrengthInput,MedicationTimeSelector,medicationStrengthValid,blankMedicine}}catch(_){}
