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
    return true;
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
      start_date:new Date().toISOString().slice(0,10),
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


