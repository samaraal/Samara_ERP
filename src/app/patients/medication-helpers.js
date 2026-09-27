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
    'STAT':[]
  };
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
  function medicationOrderDueOnDate(order,dateISO){
    const freq=String(order?.frequency||'').trim().toLowerCase();
    if(freq!=='weekly'&&freq!=='monthly')return true;
    const anchor=medicationOrderAnchorDate(order);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO||'')))return true;
    const a=Date.UTC(+anchor.slice(0,4),+anchor.slice(5,7)-1,+anchor.slice(8,10));
    const d=Date.UTC(+dateISO.slice(0,4),+dateISO.slice(5,7)-1,+dateISO.slice(8,10));
    if(d<a)return false;
    if(freq==='weekly')return Math.round((d-a)/86400000)%7===0;
    const anchorDay=+anchor.slice(8,10),y=+dateISO.slice(0,4),m=+dateISO.slice(5,7),day=+dateISO.slice(8,10);
    const lastDay=new Date(Date.UTC(y,m,0)).getUTCDate();
    return day===Math.min(anchorDay,lastDay);
  }
  function medicationOrderNextDueDate(order,fromISO){
    let d=String(fromISO||'').slice(0,10);
    for(let i=0;i<62&&d;i++){if(medicationOrderDueOnDate(order,d))return d;d=addDaysISODate(d,1);}
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
  function MedicationTimeSelector({label,value,onChange,required=false}){
    const selected=String(value||'').split(',').map(normalizeMedicationTime).filter(Boolean);
    const [open,setOpen]=React.useState(false);
    const [draft,setDraft]=React.useState(selected);
    React.useEffect(()=>{if(!open)setDraft(selected)},[value,open]);
    function openPicker(){setDraft(selected);setOpen(true)}
    function toggle(time){setDraft(current=>current.includes(time)?current.filter(x=>x!==time):[...current,time].sort())}
    function confirm(){onChange(draft.join(', '));setOpen(false)}
    function reset(){setDraft([])}
    function cancel(){setDraft(selected);setOpen(false)}
    return h('div',{className:'field medication-time-field'},
      h('label',null,label),
      h('button',{type:'button',className:'time-picker-trigger',onClick:openPicker,'aria-expanded':open},
        h('span',{className:selected.length?'time-picker-value':'time-picker-placeholder'},selected.length?selected.map(medicationTimeLabel).join(' • '):'Select time'),
        h('span',{className:'time-picker-caret'},'▾')
      ),
      selected.length?h('div',{className:'time-chip-list'},selected.map(time=>h('span',{className:'time-chip',key:time},medicationTimeLabel(time),h('button',{type:'button','aria-label':`Remove ${medicationTimeLabel(time)}`,onClick:()=>onChange(selected.filter(x=>x!==time).join(', '))},'×')))):null,
      open?h('div',{className:'time-picker-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget)cancel()}},
        h('div',{className:'time-picker-popup',role:'dialog','aria-modal':'true','aria-label':'Select medication time'},
          h('div',{className:'time-picker-head'},h('div',null,h('h4',null,'Select Time'),h('small',null,'Choose one or more medicine times')),h('button',{type:'button',className:'close',onClick:cancel},'×')),
          h('div',{className:'time-picker-grid'},MEDICATION_TIME_OPTIONS.map(opt=>h('button',{type:'button',className:`time-picker-option ${draft.includes(opt.value)?'selected':''}`,key:opt.value,onClick:()=>toggle(opt.value)},opt.label))),
          h('div',{className:'time-picker-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:reset},'Reset'),h('button',{type:'button',className:'btn btn-secondary',onClick:cancel},'Cancel'),h('button',{type:'button',className:'btn btn-primary',onClick:confirm},'OK'))
        )
      ):null,
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

  function blankCare(){
    return {
      care_type:'',
      shift:'Both shifts',
      frequency:'Daily',
      instruction:'',
      is_locked:false
    };
  }


