  // 2.16.11: Intake / Output (fluid balance) chart — SQL 211_intake_output_chart.sql.
  // ON per Guest (catheter, bedridden, doctor's order …). Chart day 7 AM–7 AM, shifts Day 7–7 / Night 7–7 (India time).
  // Beverages from Resident Food Intake count automatically as oral intake (same rule as SQL io_beverage_ml):
  // ml as entered; cup 150, tumbler 200, glass 250, mug 250 ml; "Consumed partially" = half; "Refused" = nothing.
  const IO_INTAKE=[['Oral fluids','💧','Water, juice, soup … by mouth'],['IV fluids','💉','Drip / IV infusion'],['Tube feed','🧪','Ryle\'s tube / PEG feed'],['Other intake','➕','Any other measured intake']];
  const IO_OUTPUT=[['Urine','🚻','Passed urine (measured)'],['Catheter urine','🩺','Urine bag emptied'],['Drain','🩸','Drain output'],['Vomit','🤢','Vomiting'],['Stool','🧻','Bowel motion (count)'],['Other output','➖','Any other measured output']];
  const IO_STOOL_TYPES=['Formed','Soft','Loose','Watery','Hard','Black / tarry','Blood-stained'];
  const IO_DAY='Day Shift (7 AM–7 PM)',IO_NIGHT='Night Shift (7 PM–7 AM)';
  const ioIndiaParts=d=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);const g=t=>p.find(x=>x.type===t)?.value||'00';return {y:g('year'),m:g('month'),d:g('day'),hh:g('hour')==='24'?'00':g('hour'),mi:g('minute')}};
  const ioLocalInput=(d=new Date())=>{const p=ioIndiaParts(d);return `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mi}`};
  const ioFromLocal=v=>new Date(`${v}:00+05:30`);
  const ioChartDay=at=>{const d=new Date(new Date(at).getTime()-7*3600000);const p=ioIndiaParts(d);return `${p.y}-${p.m}-${p.d}`};
  const ioShiftOf=at=>{const hh=Number(ioIndiaParts(new Date(at)).hh);return hh>=7&&hh<19?IO_DAY:IO_NIGHT};
  const ioAddDays=(iso,n)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  const ioTime=at=>{const p=ioIndiaParts(new Date(at));const h=Number(p.hh);return `${((h+11)%12)+1}:${p.mi} ${h<12?'AM':'PM'}`};
  const ioMl=n=>`${Math.round(Number(n)||0).toLocaleString('en-IN')} ml`;
  function ioBeverageMl(b){
    const qty=b.quantity!=null&&b.quantity!==''?Number(b.quantity):b.quantity_ml!=null?Number(b.quantity_ml):null;
    const unit=String(b.quantity_unit||'ml').toLowerCase();
    const per={ml:1,cup:150,tumbler:200,glass:250,mug:250}[unit];
    if(qty===null||!Number.isFinite(qty)||!per)return 0;
    const factor=b.consumption_status==='Refused'?0:b.consumption_status==='Consumed partially'?0.5:1;
    return Math.round(qty*per*factor*10)/10;
  }
  function ioCanManage(profile){
    const r=String(profile?.role||'').toLowerCase();
    return isNursingManagerProfile(profile)||['admin','administrator','director','manager'].includes(r);
  }

  function IntakeOutput({profile,onNavigate}){
    const [patients]=usePatients();
    const [settings,setSettings]=React.useState([]);
    const [patientId,setPatientId]=React.useState('');
    const [chartDate,setChartDate]=React.useState(()=>ioChartDay(new Date()));
    const [draftDate,setDraftDate]=React.useState(()=>ioChartDay(new Date()));
    const [entries,setEntries]=React.useState([]);
    const [beverages,setBeverages]=React.useState([]);
    const [todayTotals,setTodayTotals]=React.useState({});
    const [busy,setBusy]=React.useState(false);
    const [openRow,setOpenRow]=React.useState('');
    const [startForm,setStartForm]=React.useState({reason:'',urine:'300',balance:'1000'});
    const [editLimits,setEditLimits]=React.useState(null);
    const blank={direction:'Intake',category:'Oral fluids',item:'',volume:'',stool_count:'1',stool_type:'Formed',at:ioLocalInput(),remarks:''};
    const [form,setForm]=React.useState(blank);
    const [focus,clearFocus]=useRecordFocus('Intake / Output');
    const canManage=ioCanManage(profile);
    const setting=settings.find(s=>s.patient_id===patientId);
    const chartOn=Boolean(setting&&setting.enabled);
    const patientRow=patients.find(p=>p.id===patientId);
    const guestLabel=p=>p?`${formalName(p)} · ${p.room_no?`Room ${p.room_no}${p.bed_no?'-'+p.bed_no:''}`:'Room —'}`:'';

    async function loadSettings(){
      const {data,error}=await client.from('io_chart_settings').select('*');
      if(error){if(!/io_chart_settings|does not exist|schema cache/i.test(error.message||''))showSamaraActionToast('error','Intake / Output',error.message);setSettings([]);return []}
      setSettings(data||[]);return data||[];
    }
    async function loadToday(list){
      const on=(list||settings).filter(s=>s.enabled).map(s=>s.patient_id);
      if(!on.length){setTodayTotals({});return}
      const today=ioChartDay(new Date());
      const fromIso=new Date(new Date(`${today}T07:00:00+05:30`).getTime()).toISOString();
      const [e,b]=await Promise.all([
        client.from('io_entries').select('patient_id,direction,category,volume_ml,voided').in('patient_id',on).eq('io_date',today).eq('voided',false),
        client.from('beverage_records').select('patient_id,quantity,quantity_unit,quantity_ml,consumption_status,given_at').in('patient_id',on).gte('given_at',fromIso)
      ]);
      const t={};on.forEach(id=>{t[id]={intake:0,output:0,urine:0}});
      (e.data||[]).forEach(r=>{const x=t[r.patient_id];if(!x)return;const v=Number(r.volume_ml)||0;if(r.direction==='Intake')x.intake+=v;else{x.output+=v;if(['Urine','Catheter urine'].includes(r.category))x.urine+=v}});
      (b.data||[]).forEach(r=>{const x=t[r.patient_id];if(x&&ioChartDay(r.given_at)===today)x.intake+=ioBeverageMl(r)});
      setTodayTotals(t);
    }
    async function loadChart(pid=patientId,day=chartDate){
      if(!pid){setEntries([]);setBeverages([]);return}
      const from=new Date(`${day}T07:00:00+05:30`),to=new Date(from.getTime()+24*3600000);
      const [e,b]=await Promise.all([
        client.from('io_entries').select('*').eq('patient_id',pid).eq('io_date',day).order('entry_at',{ascending:true}),
        client.from('beverage_records').select('*').eq('patient_id',pid).gte('given_at',from.toISOString()).lt('given_at',to.toISOString()).order('given_at',{ascending:true})
      ]);
      if(e.error){showSamaraActionToast('error','Intake / Output',/does not exist|schema cache/i.test(e.error.message||'')?'Run SQL 211_intake_output_chart.sql in Supabase first.':e.error.message);return}
      setEntries(e.data||[]);setBeverages(b.error?[]:(b.data||[]));
    }
    React.useEffect(()=>{(async()=>{const list=await loadSettings();await loadToday(list)})();
      const ch=client.channel(`io-live-${Math.random()}`).on('postgres_changes',{event:'*',schema:'public',table:'io_entries'},()=>{loadChart();loadToday()}).on('postgres_changes',{event:'*',schema:'public',table:'io_chart_settings'},async()=>{const l=await loadSettings();loadToday(l)}).subscribe();
      return()=>client.removeChannel(ch)},[]);
    React.useEffect(()=>{loadChart(patientId,chartDate)},[patientId,chartDate]);
    // Opened from an alert / notification: show that Guest and that chart day.
    React.useEffect(()=>{if(focus?.patient_id){setPatientId(focus.patient_id);if(focus.chart_date){setChartDate(focus.chart_date);setDraftDate(focus.chart_date)}}},[focus?.patient_id,focus?.chart_date]);

    async function startChart(e){
      e.preventDefault();if(!patientId||busy)return;
      const urine=Number(startForm.urine),balance=Number(startForm.balance);
      if(!startForm.reason.trim())return showSamaraActionToast('error','Reason needed','Enter why the chart is started (e.g. catheter, bedridden, doctor\'s order).');
      if(!(urine>=0&&urine<=3000)||!(balance>=200&&balance<=5000))return showSamaraActionToast('error','Check the limits','Low-urine limit 0–3000 ml per shift; balance limit 200–5000 ml.');
      setBusy(true);
      const payload={patient_id:patientId,enabled:true,reason:startForm.reason.trim(),urine_min_ml_shift:Math.round(urine),balance_limit_ml:Math.round(balance),started_at:new Date().toISOString(),started_by:profile.id,started_by_name:profile.full_name||null,stopped_at:null,stopped_by_name:null,updated_at:new Date().toISOString(),updated_by_name:profile.full_name||null};
      const {error}=await client.from('io_chart_settings').upsert(payload,{onConflict:'patient_id'});
      setBusy(false);
      if(error)return showSamaraActionToast('error','Chart not started',error.message);
      writeAuditEvent('Intake/Output Chart Started','Intake / Output',patientId,{reason:payload.reason,urine_min_ml_shift:payload.urine_min_ml_shift,balance_limit_ml:payload.balance_limit_ml},'Success');
      showSamaraActionToast('success','Intake / Output chart started',`${guestLabel(patientRow)} — record every intake and output from now on.`);
      const l=await loadSettings();loadToday(l);
    }
    async function saveLimits(stop=false){
      if(!setting||busy)return;
      const patch=stop?{enabled:false,stopped_at:new Date().toISOString(),stopped_by_name:profile.full_name||null}:{urine_min_ml_shift:Math.round(Number(editLimits.urine)),balance_limit_ml:Math.round(Number(editLimits.balance))};
      if(!stop&&(!(patch.urine_min_ml_shift>=0&&patch.urine_min_ml_shift<=3000)||!(patch.balance_limit_ml>=200&&patch.balance_limit_ml<=5000)))return showSamaraActionToast('error','Check the limits','Low-urine limit 0–3000 ml per shift; balance limit 200–5000 ml.');
      if(stop&&!window.confirm(`Stop the Intake / Output chart for ${guestLabel(patientRow)}? Entries already saved are kept.`))return;
      setBusy(true);
      const {error}=await client.from('io_chart_settings').update({...patch,updated_at:new Date().toISOString(),updated_by_name:profile.full_name||null}).eq('patient_id',setting.patient_id);
      setBusy(false);
      if(error)return showSamaraActionToast('error','Not saved',error.message);
      writeAuditEvent(stop?'Intake/Output Chart Stopped':'Intake/Output Limits Changed','Intake / Output',setting.patient_id,patch,'Success');
      showSamaraActionToast('success',stop?'Chart stopped':'Limits saved',stop?'The Intake / Output chart is stopped for this Guest.':'The new alert limits apply from the next shift.');
      setEditLimits(null);const l=await loadSettings();loadToday(l);
    }
    async function saveEntry(e){
      e.preventDefault();if(busy)return;
      if(!patientId||!chartOn)return showSamaraActionToast('error','Select a Guest','Choose a Guest whose Intake / Output chart is ON.');
      const at=ioFromLocal(form.at);
      if(Number.isNaN(at.getTime()))return showSamaraActionToast('error','Check the time','Enter a valid date and time.');
      if(at.getTime()>Date.now()+5*60000)return showSamaraActionToast('error','Time is in the future','Enter the time it was actually given / measured.');
      const maxBack=(canManage?72:24)*3600000;
      if(Date.now()-at.getTime()>maxBack)return showSamaraActionToast('error','Too old',canManage?'Entries can be added up to 3 days back.':'Nurses can add entries up to 24 hours back. Ask the Nursing Manager for older corrections.');
      const isStool=form.category==='Stool';
      const vol=form.volume===''?null:Number(form.volume);
      if(!isStool&&!(vol>0&&vol<=5000))return showSamaraActionToast('error','Enter the amount','Enter the amount in ml (1–5000).');
      if(isStool&&!(Number(form.stool_count)>0))return showSamaraActionToast('error','Enter the count','Enter how many times (1 or more).');
      setBusy(true);
      const payload={patient_id:patientId,entry_at:at.toISOString(),direction:form.direction,category:form.category,item:form.item.trim()||null,volume_ml:vol,stool_count:isStool?Math.round(Number(form.stool_count)):null,stool_type:isStool?form.stool_type:null,remarks:form.remarks.trim()||null,recorded_by:profile.id,recorded_by_name:profile.full_name||null};
      const {data,error}=await client.from('io_entries').insert(payload).select('id').single();
      setBusy(false);
      if(error)return showSamaraActionToast('error','Not saved',error.message);
      writeAuditEvent('Intake/Output Recorded','Intake / Output',data?.id||patientId,{patient_id:patientId,direction:payload.direction,category:payload.category,volume_ml:payload.volume_ml,stool_count:payload.stool_count,summary:`${payload.direction}: ${payload.category} ${isStool?`× ${payload.stool_count}`:ioMl(vol)}`},'Success');
      showSamaraActionToast('success',`${form.direction} saved`,`${form.category}${isStool?` × ${payload.stool_count} (${payload.stool_type})`:` — ${ioMl(vol)}`} for ${guestLabel(patientRow)}.`);
      setForm({...blank,direction:form.direction,category:form.category,at:ioLocalInput()});
      const day=ioChartDay(at);if(day!==chartDate){setChartDate(day);setDraftDate(day)}else loadChart();
      loadToday();
    }
    async function voidEntry(r){
      const mineThisShift=r.recorded_by===profile.id&&ioShiftOf(r.entry_at)===ioShiftOf(new Date())&&ioChartDay(r.entry_at)===ioChartDay(new Date());
      if(!canManage&&!mineThisShift)return showSamaraActionToast('error','Cannot remove','You can correct only your own entries in the same shift. Ask the Nursing Manager.');
      const reason=window.prompt('Reason for removing this entry (it stays in the audit, but is not counted):');
      if(!reason||!reason.trim())return;
      const {error}=await client.from('io_entries').update({voided:true,voided_reason:reason.trim(),voided_by_name:profile.full_name||null,voided_at:new Date().toISOString()}).eq('id',r.id);
      if(error)return showSamaraActionToast('error','Not removed',error.message);
      writeAuditEvent('Intake/Output Entry Removed','Intake / Output',r.id,{patient_id:r.patient_id,category:r.category,volume_ml:r.volume_ml,reason:reason.trim()},'Success');
      showSamaraActionToast('success','Entry removed','It is no longer counted in the totals.');
      loadChart();loadToday();
    }

    // Rows for the chosen chart day: chart entries + beverages from Food Intake.
    const rows=[
      ...entries.map(r=>({key:r.id,src:'Chart',r,at:r.entry_at,shift:r.shift||ioShiftOf(r.entry_at),direction:r.direction,category:r.category,ml:r.voided?0:Number(r.volume_ml)||0,stool:r.category==='Stool'&&!r.voided?Number(r.stool_count)||0:0,voided:r.voided,
        what:[r.item,r.category==='Stool'?`× ${r.stool_count||0}${r.stool_type?` · ${r.stool_type}`:''}`:''].filter(Boolean).join(' '),by:r.recorded_by_name,remarks:r.remarks})),
      ...beverages.map(b=>({key:`bev-${b.id}`,src:'Food Intake',r:b,at:b.given_at,shift:ioShiftOf(b.given_at),direction:'Intake',category:'Oral fluids',ml:ioBeverageMl(b),stool:0,voided:false,
        what:`${b.beverage==='Fresh Juice'&&b.juice_name?`Fresh Juice (${b.juice_name})`:b.beverage} — ${b.quantity??b.quantity_ml??'?'} ${b.quantity_unit||'ml'}${b.consumption_status&&b.consumption_status!=='Consumed fully'?` (${b.consumption_status})`:''}`,by:b.recorded_by_name,remarks:b.remarks}))
    ].sort((a,b)=>new Date(a.at)-new Date(b.at));
    const sum=(list,dir)=>list.filter(x=>x.direction===dir&&!x.voided).reduce((s,x)=>s+x.ml,0);
    const shiftTotals=name=>{const l=rows.filter(x=>x.shift===name);const urine=l.filter(x=>['Urine','Catheter urine'].includes(x.category)&&!x.voided).reduce((s,x)=>s+x.ml,0);return {intake:sum(l,'Intake'),output:sum(l,'Output'),urine,stool:l.reduce((s,x)=>s+x.stool,0)}};
    const day=shiftTotals(IO_DAY),night=shiftTotals(IO_NIGHT);
    const total={intake:day.intake+night.intake,output:day.output+night.output,urine:day.urine+night.urine,stool:day.stool+night.stool};
    const balance=total.intake-total.output;
    const overLimit=setting&&Math.abs(balance)>setting.balance_limit_ml&&(total.intake>0||total.output>0);
    const catTotals=[...IO_INTAKE,...IO_OUTPUT].map(([c])=>[c,rows.filter(x=>x.category===c&&!x.voided).reduce((s,x)=>s+x.ml,0)]).filter(([,v])=>v>0);
    const today=ioChartDay(new Date());
    const onGuests=settings.filter(s=>s.enabled).map(s=>({s,p:patients.find(p=>p.id===s.patient_id)})).filter(x=>x.p);
    const choices=form.direction==='Intake'?IO_INTAKE:IO_OUTPUT;

    const totalBox=(label,t,highlight)=>h('div',{className:`io-total${highlight?' io-total-main':''}`},
      h('small',null,label),
      h('div',{className:'io-total-row'},h('span',null,'Intake'),h('strong',null,ioMl(t.intake))),
      h('div',{className:'io-total-row'},h('span',null,'Output'),h('strong',null,ioMl(t.output))),
      h('div',{className:'io-total-row'},h('span',null,'Urine'),h('strong',null,ioMl(t.urine))),
      t.stool?h('div',{className:'io-total-row'},h('span',null,'Stool'),h('strong',null,`${t.stool} time${t.stool===1?'':'s'}`)):null,
      h('div',{className:'io-total-row io-bal'},h('span',null,'Balance'),h('strong',null,`${t.intake-t.output>=0?'+':'−'}${ioMl(Math.abs(t.intake-t.output))}`)));

    return h(React.Fragment,null,
      h('style',null,`
.io-guests{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:6px}
.io-guest{border:1px solid #f2c9dc;border-radius:14px;padding:10px 14px;background:#fff;cursor:pointer;min-width:200px;text-align:left}
.io-guest.active{border-color:#b01264;box-shadow:0 0 0 2px #f7d3e3;background:#fff7fb}
.io-guest small{display:block;color:#6b5560}
.io-guest .io-mini{font-size:12px;color:#3f2a35;margin-top:4px}
.io-toggle{display:flex;gap:8px;margin:6px 0 10px}
.io-toggle button{flex:1;padding:10px;border-radius:12px;border:1px solid #e8b6cd;background:#fff;font-weight:700;color:#7a0b44;cursor:pointer}
.io-toggle button.on{background:#b01264;color:#fff;border-color:#b01264}
.io-cats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px}
.io-cat{border:1px solid #f0cfdf;border-radius:12px;padding:8px 10px;background:#fff;cursor:pointer;text-align:left}
.io-cat.on{border-color:#b01264;background:#fdeef5}
.io-cat b{display:block;color:#3f2a35}.io-cat small{color:#7b6470}
.io-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:8px 0 12px}
.io-total{border:1px solid #f0cfdf;border-radius:14px;padding:10px 12px;background:#fff}
.io-total-main{background:#fff4f9;border-color:#e3a5c2}
.io-total>small{display:block;font-weight:700;color:#7a0b44;margin-bottom:4px}
.io-total-row{display:flex;justify-content:space-between;font-size:14px;padding:2px 0}
.io-bal{border-top:1px dashed #e8b6cd;margin-top:4px;padding-top:4px}
.io-warn{background:#ffe9ec;color:#a3122b;border-radius:12px;padding:8px 12px;margin-bottom:10px;font-weight:600}
.io-datebar{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:8px}
.io-row-voided td{text-decoration:line-through;color:#9a8a92}
.io-src{font-size:11px;border-radius:8px;padding:1px 6px;background:#eef6ff;color:#1f4f87}
`),
      h(Section,{title:'Intake / Output Chart',subtitle:'Fluid balance for Guests on the chart · chart day 7 AM to 7 AM · Day 7 AM–7 PM / Night 7 PM–7 AM'},
        focus&&h(RecordFocusBanner,{focus,onShowAll:()=>clearFocus()}),
        onGuests.length?h('div',null,
          h('small',{style:{display:'block',marginBottom:'6px',color:'#6b5560'}},`Guests on the chart — today so far (since 7 AM, ${formatDateIN(today)}). Tap a Guest to open the chart.`),
          h('div',{className:'io-guests'},onGuests.map(({s,p})=>{const t=todayTotals[s.patient_id]||{intake:0,output:0,urine:0};return h('button',{type:'button',key:s.patient_id,className:`io-guest${patientId===s.patient_id?' active':''}`,onClick:()=>{setPatientId(s.patient_id);setChartDate(today);setDraftDate(today)}},
            h('strong',null,formalName(p)),h('small',null,`${p.room_no?`Room ${p.room_no}${p.bed_no?'-'+p.bed_no:''}`:'Room —'} · ${s.reason||''}`),
            h('div',{className:'io-mini'},`In ${ioMl(t.intake)} · Out ${ioMl(t.output)} · Urine ${ioMl(t.urine)}`))}))
        ):h('p',{className:'empty',style:{margin:'4px 0 10px'}},'No Guest is on the Intake / Output chart yet. Select a Guest below and start the chart.'),
        h('div',{className:'modal-grid',style:{marginTop:'8px'}},patientSelect(patients,patientId,v=>{setPatientId(v);setChartDate(today);setDraftDate(today)},'Guest'))
      ),
      patientId&&!chartOn&&h(Section,{title:'Start the Intake / Output chart',subtitle:setting&&!setting.enabled?`The chart was stopped${setting.stopped_by_name?` by ${setting.stopped_by_name}`:''}. Start it again if needed.`:'Use for Guests with a catheter, bedridden Guests, IV / tube feeds, or on the doctor\'s order.'},
        h('form',{className:'modal-grid',onSubmit:startChart},
          miniInput('Reason (e.g. catheter, doctor\'s order)',startForm.reason,v=>setStartForm({...startForm,reason:v}),true),
          miniInput('Alert if urine in a 12-hour shift is below (ml) — 0 = no alert',startForm.urine,v=>setStartForm({...startForm,urine:v}),true,'number'),
          miniInput('Alert if the 24-hour balance is more than ± (ml)',startForm.balance,v=>setStartForm({...startForm,balance:v}),true,'number'),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Starting…':'Start chart')),
        h('small',null,'Limits are set as advised by the treating doctor. The Nursing Manager can change them later.')),
      patientId&&chartOn&&h(Section,{title:`Record Intake / Output — ${guestLabel(patientRow)}`,subtitle:`On the chart since ${fmt(setting.started_at)} · ${setting.reason||''} · Alerts: urine below ${ioMl(setting.urine_min_ml_shift)} per shift, balance beyond ± ${ioMl(setting.balance_limit_ml)} per day`,
          actions:canManage?h('div',{className:'employee-actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEditLimits(editLimits?null:{urine:String(setting.urine_min_ml_shift),balance:String(setting.balance_limit_ml)})},editLimits?'Close':'Change limits'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>saveLimits(true)},'Stop chart')):null},
        editLimits&&h('div',{className:'modal-grid',style:{marginBottom:'10px'}},
          miniInput('Low urine per 12-hour shift below (ml)',editLimits.urine,v=>setEditLimits({...editLimits,urine:v}),true,'number'),
          miniInput('24-hour balance beyond ± (ml)',editLimits.balance,v=>setEditLimits({...editLimits,balance:v}),true,'number'),
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>saveLimits(false)},'Save limits')),
        h('form',{onSubmit:saveEntry},
          h('div',{className:'io-toggle'},['Intake','Output'].map(d=>h('button',{type:'button',key:d,className:form.direction===d?'on':'',onClick:()=>setForm({...form,direction:d,category:(d==='Intake'?IO_INTAKE:IO_OUTPUT)[0][0],item:''})},d==='Intake'?'⬇ Intake (given)':'⬆ Output (passed)'))),
          h('div',{className:'io-cats'},choices.map(([c,icon,hint])=>h('button',{type:'button',key:c,className:`io-cat${form.category===c?' on':''}`,onClick:()=>setForm({...form,category:c})},h('b',null,`${icon} ${c}`),h('small',null,hint)))),
          h('div',{className:'modal-grid'},
            form.category==='Stool'
              ?h(React.Fragment,null,miniInput('How many times',form.stool_count,v=>setForm({...form,stool_count:v}),true,'number'),miniSelect('Type',form.stool_type,IO_STOOL_TYPES,v=>setForm({...form,stool_type:v})),miniInput('Amount in ml (optional)',form.volume,v=>setForm({...form,volume:v}),false,'number'))
              :miniInput('Amount (ml)',form.volume,v=>setForm({...form,volume:v}),true,'number'),
            ['IV fluids','Tube feed','Other intake','Drain','Other output','Oral fluids'].includes(form.category)&&miniInput(form.category==='IV fluids'?'Fluid (e.g. NS, DNS, RL)':form.category==='Tube feed'?'Feed (e.g. Ensure, kanji)':form.category==='Drain'?'Drain site':form.category==='Oral fluids'?'What (e.g. water, soup) — tea / milk from Food Intake are added automatically':'Details',form.item,v=>setForm({...form,item:v})),
            h('div',{className:'field'},h('label',null,'Time given / measured'),h(StrictDateTimeInput,{value:form.at,max:ioLocalInput(),onChange:e=>setForm({...form,at:e.target.value}),required:true})),
            miniInput('Remarks',form.remarks,v=>setForm({...form,remarks:v})),
            h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':`Save ${form.direction.toLowerCase()}`)))
      ),
      patientId&&(chartOn||entries.length>0)&&h(Section,{title:`Chart — ${formatDateWithDayIN(chartDate)} (7 AM to next day 7 AM)`,subtitle:'Includes tea / milk / juice from Resident Food Intake automatically (marked "Food Intake"). Tap a row for full details.'},
        h('div',{className:'io-datebar'},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{const d=ioAddDays(chartDate,-1);setChartDate(d);setDraftDate(d)}},'← Previous day'),
          h('div',{className:'field'},h('label',null,'Chart date'),h(StrictDateInput,{value:draftDate,max:today,onChange:e=>setDraftDate(e.target.value)})),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>setChartDate(draftDate||today)},'Apply'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:chartDate>=today,onClick:()=>{const d=ioAddDays(chartDate,1);setChartDate(d);setDraftDate(d)}},'Next day →'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setChartDate(today);setDraftDate(today)}},'Today')),
        overLimit&&h('div',{className:'io-warn',role:'status'},`Balance ${balance>=0?'+':'−'}${ioMl(Math.abs(balance))} is beyond the limit of ± ${ioMl(setting.balance_limit_ml)}. Inform the Nursing Manager / treating doctor.`),
        h('div',{className:'io-totals'},totalBox('Day shift (7 AM–7 PM)',day),totalBox('Night shift (7 PM–7 AM)',night),totalBox(chartDate===today?'24 hours — so far':'24 hours',total,true)),
        catTotals.length?h('small',{style:{display:'block',marginBottom:'8px',color:'#6b5560'}},catTotals.map(([c,v])=>`${c} ${ioMl(v)}`).join(' · ')):null,
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Time','Shift','In / Out','Type','Details','Amount','By',''].map(x=>h('th',{key:x},x)))),
          h('tbody',null,rows.length?rows.map(x=>h(React.Fragment,{key:x.key},
            h('tr',{className:x.voided?'io-row-voided':'',role:'button',tabIndex:0,style:{cursor:'pointer'},onClick:()=>setOpenRow(openRow===x.key?'':x.key),onKeyDown:e=>{if(e.key==='Enter')setOpenRow(openRow===x.key?'':x.key)}},
              h('td',null,ioTime(x.at)),h('td',null,x.shift===IO_DAY?'Day':'Night'),h('td',null,x.direction),
              h('td',null,x.category,' ',x.src==='Food Intake'?h('span',{className:'io-src'},'Food Intake'):null),
              h('td',null,x.what||'—'),h('td',null,x.ml?ioMl(x.ml):'—'),h('td',null,x.by||'—'),
              h('td',null,x.src==='Chart'&&!x.voided?h('button',{type:'button',className:'btn btn-secondary',style:{padding:'4px 10px'},onClick:ev=>{ev.stopPropagation();voidEntry(x.r)}},'Remove'):x.voided?'Removed':'')),
            openRow===x.key&&h('tr',null,h('td',{colSpan:8,style:{background:'#fff7fb'}},
              [`Recorded: ${fmt(x.r.created_at||x.at)}${x.by?` by ${x.by}`:''}`,`Time given / measured: ${fmt(x.at)}`,x.remarks?`Remarks: ${x.remarks}`:'',x.src==='Food Intake'?'From Resident Food Intake — edit it there if it is wrong.':'',x.voided?`Removed by ${x.r.voided_by_name||'—'} on ${fmt(x.r.voided_at)} — ${x.r.voided_reason||''}`:''].filter(Boolean).join(' · ')))))
            :h('tr',null,h('td',{colSpan:8,className:'empty'},'Nothing recorded for this chart day yet.')))))
      )
    );
  }
