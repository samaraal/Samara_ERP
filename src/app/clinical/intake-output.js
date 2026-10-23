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

  // 2.16.14: grid entry (like the Duty Roster): rows = 2-hour slots 7 AM → 7 AM, columns = intake / output types.
  // Tap a cell → choose the item + amount (time comes from the slot) → Save. Same io_entries rows as before.
  const IO_COLS=[
    {key:'oral',label:'Oral',icon:'💧',dir:'Intake',cats:['Oral fluids'],items:['Water','Juice','Soup','Kanji','Butter milk','Coconut water'],amounts:[50,100,150,200,250,300]},
    {key:'iv',label:'IV',icon:'💉',dir:'Intake',cats:['IV fluids'],items:['NS','DNS','RL','D5','D10'],amounts:[100,250,500,1000]},
    {key:'tube',label:'Tube',icon:'🧪',dir:'Intake',cats:['Tube feed'],items:['Ensure','Kanji','Milk','Water flush','Feed'],amounts:[50,100,150,200,250,300]},
    {key:'urine',label:'Urine',icon:'🚻',dir:'Output',cats:['Urine','Catheter urine'],items:['Passed urine','Catheter bag'],amounts:[100,200,300,400,500,600]},
    {key:'drain',label:'Drain',icon:'🩸',dir:'Output',cats:['Drain'],items:[],amounts:[10,25,50,100,200]},
    {key:'vomit',label:'Vomit',icon:'🤢',dir:'Output',cats:['Vomit'],items:[],amounts:[50,100,150,200,300]},
    {key:'stool',label:'Stool',icon:'🧻',dir:'Output',cats:['Stool'],items:[],amounts:[]},
    {key:'other',label:'Other',icon:'➕',dir:null,cats:['Other intake','Other output'],items:['Other intake','Other output'],amounts:[50,100,200,300,500]}
  ];
  const IO_SLOT_H=2,IO_SLOTS=24/IO_SLOT_H;
  const ioSlotStart=(day,i)=>new Date(new Date(`${day}T07:00:00+05:30`).getTime()+i*IO_SLOT_H*3600000);
  const ioSlotOf=(day,at)=>Math.floor((new Date(at).getTime()-ioSlotStart(day,0).getTime())/(IO_SLOT_H*3600000));
  const ioHour=d=>{const h=Number(ioIndiaParts(d).hh);return `${((h+11)%12)+1}${h<12?' AM':' PM'}`};
  const ioSlotLabel=(day,i)=>{const a=ioSlotStart(day,i),b=ioSlotStart(day,i+1);return `${ioHour(a).replace(/ (AM|PM)$/,ioHour(a).slice(-2)===ioHour(b).slice(-2)?'':' $1')}–${ioHour(b)}`};
  const ioColOf=category=>IO_COLS.find(c=>c.cats.includes(category))||IO_COLS[IO_COLS.length-1];

  // 2.18.87: printable Intake / Output PDF (full clinical detail) — day-wise totals with Day / Night shift totals,
  // bar chart, every entry with time, item, amount and nurse, alert limits, signature lines.
  const ioEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ioBal=n=>{n=Math.round(Number(n)||0);return `${n>0?'+':n<0?'−':''}${Math.abs(n).toLocaleString('en-IN')} ml`};
  function ioChartSvg(days){
    const list=[...days].sort((a,b)=>a.date.localeCompare(b.date)).slice(-31);if(!list.length)return '';
    const W=760,H=220,L=46,R=10,T=16,B=40,max=Math.max(500,...list.map(d=>Math.max(d.intake,d.output)));
    const top=Math.ceil(max/500)*500,gw=(W-L-R)/list.length,bw=Math.max(3,Math.min(26,gw*0.34)),y=v=>T+(H-T-B)*(1-(Number(v)||0)/top);
    let g='';for(let i=0;i<=4;i++){const v=top*i/4,yy=y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#f1dbe5"/><text x="${L-6}" y="${yy+4}" font-size="10" text-anchor="end" fill="#7b6670">${Math.round(v)}</text>`;}
    const step=Math.ceil(list.length/10),vals=list.length<=10;
    const bars=list.map((d,i)=>{const cx=L+gw*i+gw/2,xi=cx-bw-1,xo=cx+1,yi=y(d.intake),yo=y(d.output),base=y(0);
      return `<rect x="${xi}" y="${yi}" width="${bw}" height="${Math.max(0,base-yi)}" rx="3" fill="#b20b5d"/><rect x="${xo}" y="${yo}" width="${bw}" height="${Math.max(0,base-yo)}" rx="3" fill="#1d7fae"/>`
        +(vals?`<text x="${xi+bw/2}" y="${yi-3}" font-size="9" text-anchor="middle" fill="#b20b5d">${Math.round(d.intake)}</text><text x="${xo+bw/2}" y="${yo-3}" font-size="9" text-anchor="middle" fill="#1d7fae">${Math.round(d.output)}</text>`:'')
        +((i%step===0||i===list.length-1)?`<text x="${cx}" y="${H-B+15}" font-size="10" text-anchor="middle" fill="#5d1039">${ioEsc(formatDateIN(d.date).slice(0,5))}</text>`:'');}).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}<line x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}" stroke="#c9a3b5"/>${bars}</svg>`;
  }
  async function ioOpenPrint({patient,setting,from,to,who}){
    const win=samaraPrintBar(window.open('','_blank'));
    if(!win){alert('Please allow pop-ups to print / save the Intake / Output chart.');return false}
    win.document.open();win.document.write('<p style="font-family:Arial;padding:20px">Preparing the Intake / Output chart…</p>');win.document.close();
    const fromAt=new Date(`${from}T07:00:00+05:30`),toAt=new Date(new Date(`${to}T07:00:00+05:30`).getTime()+24*3600000);
    const [e,b]=await Promise.all([
      client.from('io_entries').select('*').eq('patient_id',patient.id).gte('io_date',from).lte('io_date',to).eq('voided',false).order('entry_at',{ascending:true}),
      client.from('beverage_records').select('*').eq('patient_id',patient.id).gte('given_at',fromAt.toISOString()).lt('given_at',toAt.toISOString()).order('given_at',{ascending:true})
    ]);
    if(e.error){win.document.body.innerHTML=`<p style="font-family:Arial;padding:20px;color:#b42318">${ioEsc(e.error.message)}</p>`;return false}
    const rows=[
      ...(e.data||[]).map(r=>({at:r.entry_at,date:r.io_date||ioChartDay(r.entry_at),shift:r.shift||ioShiftOf(r.entry_at),direction:r.direction,category:r.category,ml:Number(r.volume_ml)||0,stool:r.category==='Stool'?Number(r.stool_count)||0:0,
        what:[r.item,r.category==='Stool'&&r.stool_type?r.stool_type:''].filter(Boolean).join(' · '),by:r.recorded_by_name||'',remarks:r.remarks||''})),
      ...(b.error?[]:(b.data||[])).map(x=>({at:x.given_at,date:ioChartDay(x.given_at),shift:ioShiftOf(x.given_at),direction:'Intake',category:'Oral fluids',ml:ioBeverageMl(x),stool:0,
        what:`${x.beverage==='Fresh Juice'&&x.juice_name?`Fresh Juice (${x.juice_name})`:x.beverage||'Beverage'} — ${x.quantity??x.quantity_ml??'?'} ${x.quantity_unit||'ml'}${x.consumption_status&&x.consumption_status!=='Consumed fully'?` (${x.consumption_status})`:''}`,by:'Food Intake',remarks:''}))
    ].filter(r=>r.date>=from&&r.date<=to).sort((a,c)=>new Date(a.at)-new Date(c.at));
    const chartDays=new Set((e.data||[]).map(r=>r.io_date));
    const sumBy=(l,f)=>l.filter(f).reduce((t,x)=>t+x.ml,0);
    const days=[...chartDays].sort().reverse().map(date=>{
      const l=rows.filter(r=>r.date===date),sh=n=>{const k=l.filter(r=>r.shift===n);return {intake:sumBy(k,r=>r.direction==='Intake'),output:sumBy(k,r=>r.direction==='Output')}};
      const d={date,l,day:sh(IO_DAY),night:sh(IO_NIGHT),intake:sumBy(l,r=>r.direction==='Intake'),output:sumBy(l,r=>r.direction==='Output'),
        oral:sumBy(l,r=>r.category==='Oral fluids'),iv:sumBy(l,r=>r.category==='IV fluids'),tube:sumBy(l,r=>r.category==='Tube feed'),oin:sumBy(l,r=>r.category==='Other intake'),
        urine:sumBy(l,r=>['Urine','Catheter urine'].includes(r.category)),drain:sumBy(l,r=>r.category==='Drain'),vomit:sumBy(l,r=>r.category==='Vomit'),oout:sumBy(l,r=>['Other output','Stool'].includes(r.category)),
        stool:l.reduce((t,r)=>t+r.stool,0)};return d;});
    const T=days.reduce((a,d)=>({intake:a.intake+d.intake,output:a.output+d.output}),{intake:0,output:0});
    const today=ioChartDay(new Date()),n=v=>v?Math.round(v).toLocaleString('en-IN'):'—';
    const over=d=>setting&&Math.abs(d.intake-d.output)>setting.balance_limit_ml&&(d.intake>0||d.output>0);
    const lowUrine=d=>setting&&setting.urine_min_ml_shift>0&&d.date<today&&(sumBy(d.l,r=>r.shift===IO_DAY&&['Urine','Catheter urine'].includes(r.category))<setting.urine_min_ml_shift||sumBy(d.l,r=>r.shift===IO_NIGHT&&['Urine','Catheter urine'].includes(r.category))<setting.urine_min_ml_shift);
    const dayRows=days.map(d=>`<tr><td><b>${ioEsc(formatDateIN(d.date))}</b>${d.date===today?'<br><small>so far</small>':''}</td><td class="n">${n(d.oral)}</td><td class="n">${n(d.iv)}</td><td class="n">${n(d.tube)}</td><td class="n">${n(d.oin)}</td><td class="n b">${n(d.intake)}</td><td class="n">${n(d.urine)}${lowUrine(d)?' <span class="flag">low</span>':''}</td><td class="n">${n(d.drain)}</td><td class="n">${n(d.vomit)}</td><td class="n">${d.stool?`${d.stool}×`:'—'}</td><td class="n">${n(d.oout)}</td><td class="n b">${n(d.output)}</td><td class="n b ${over(d)?'bad':''}">${ioEsc(ioBal(d.intake-d.output))}</td><td class="sm">Day: ${n(d.day.intake)} / ${n(d.day.output)}<br>Night: ${n(d.night.intake)} / ${n(d.night.output)}</td></tr>`).join('')||'<tr><td colspan="14" style="text-align:center">No Intake / Output entries in this period</td></tr>';
    const entryRows=days.map(d=>`<tr class="dh"><td colspan="8">${ioEsc(formatDateWithDayIN(d.date))} · In ${ioEsc(ioMl(d.intake))} · Out ${ioEsc(ioMl(d.output))} · Balance ${ioEsc(ioBal(d.intake-d.output))}</td></tr>`+d.l.map(r=>`<tr><td>${ioEsc(ioTime(r.at))}</td><td>${r.shift===IO_DAY?'Day':'Night'}</td><td>${ioEsc(r.direction)}</td><td>${ioEsc(r.category)}</td><td>${ioEsc(r.what||'—')}</td><td class="n">${r.category==='Stool'?(r.stool?`${r.stool}×`:'')+(r.ml?` ${n(r.ml)} ml`:''):ioEsc(ioMl(r.ml))}</td><td>${ioEsc(r.by||'—')}</td><td>${ioEsc(r.remarks||'')}</td></tr>`).join('')).join('');
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const room=patient.room_no?`${patient.room_no}${patient.bed_no?'-'+patient.bed_no:''}`:'—';
    const box=(l,v,hi)=>`<div class="box${hi?' hi':''}"><span>${ioEsc(l)}</span><strong>${ioEsc(v)}</strong></div>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Samara_Intake_Output_${ioEsc(patient.patient_id||'')}_${ioEsc(from)}_to_${ioEsc(to)}</title><style>
      @page{size:A4;margin:10mm 8mm 12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:9.5px;line-height:1.35;background:#fff}
      .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:8px}.logo{width:110px;max-height:54px;object-fit:contain}.mid{text-align:center;color:#741041;font-weight:700;font-size:12px}
      .org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:14px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:15px;margin:2px 0;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 6px}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:3px 18px;border:1px solid #edc8da;border-radius:8px;padding:6px 10px;margin-bottom:8px}.info b{color:#7a1247}
      .sum{display:flex;gap:6px;margin:0 0 8px}.box{flex:1;border:1px solid #e7c3d4;border-radius:8px;padding:5px 8px;background:#fff7fb}.box span{display:block;color:#6d5963;font-size:8px;font-weight:700;text-transform:uppercase}.box strong{display:block;font-size:13px;color:#321d28}.box.hi{background:#b20b5d;border-color:#b20b5d}.box.hi span,.box.hi strong{color:#fff}
      .chart{border:1px solid #edc8da;border-radius:8px;padding:4px 8px;margin-bottom:8px}.chart svg{width:100%;height:auto}.legend{font-weight:700;color:#5d1039;margin:2px 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px;vertical-align:-1px}
      h2{font-size:11.5px;color:#741041;margin:10px 0 4px}
      table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:4px 3px;text-align:left;font-size:8.5px}
      td{border:1px solid #ead4dd;padding:3px 4px;vertical-align:top;overflow-wrap:anywhere}.n{text-align:right;white-space:nowrap}.b{font-weight:700}.bad{color:#b42318}.sm{font-size:8.5px;color:#5d4a54}.flag{color:#b42318;font-weight:700}
      th.in{background:#e6f0fb;color:#1d4f91}th.out{background:#fff1dc;color:#8a4b00}tr.dh td{background:#fbeef4;font-weight:700;color:#5d1039}
      .sign{display:flex;justify-content:space-between;margin-top:26px}.sign div{border-top:1px solid #6f5c65;padding-top:5px;width:28%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:12px;padding-top:5px;text-align:center;color:#6f5a64;font-size:8px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="mid">Nursing · Fluid Balance</div><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>Intake / Output Chart</h1>
      <p class="meta">${from===to?`Chart day ${ioEsc(formatDateIN(from))}`:`Period ${ioEsc(formatDateIN(from))} to ${ioEsc(formatDateIN(to))}`} · each day 7 AM to 7 AM · Day 7 AM–7 PM / Night 7 PM–7 AM</p>
      <div class="info"><div><b>Guest:</b> ${ioEsc(formalName(patient)||patient.full_name||'')}</div><div><b>Guest ID:</b> ${ioEsc(patient.patient_id||'—')} · <b>Room:</b> ${ioEsc(room)}</div>
        <div><b>On the chart since:</b> ${setting?ioEsc(fmt(setting.started_at)):'—'}${setting&&!setting.enabled&&setting.stopped_at?` · stopped ${ioEsc(fmt(setting.stopped_at))}`:''}</div><div><b>Reason:</b> ${ioEsc(setting?.reason||'—')}</div>
        <div><b>Alert limits:</b> urine below ${setting?ioEsc(ioMl(setting.urine_min_ml_shift)):'—'} per shift · balance beyond ± ${setting?ioEsc(ioMl(setting.balance_limit_ml)):'—'}</div><div><b>Treating doctor:</b> ${ioEsc(patient.treating_doctor||'—')}</div></div>
      <div class="sum">${box('Chart days',days.length)}${box('Total intake',ioMl(T.intake))}${box('Total output',ioMl(T.output))}${box('Net balance',ioBal(T.intake-T.output),true)}</div>
      ${days.length>1?`<div class="chart"><div class="legend"><i style="background:#b20b5d"></i>Intake<i style="background:#1d7fae"></i>Output (ml per day)</div>${ioChartSvg(days)}</div>`:''}
      <h2>Day-wise totals (ml)</h2>
      <table><thead><tr><th rowspan="2">Chart day</th><th class="in" colspan="5">INTAKE</th><th class="out" colspan="6">OUTPUT</th><th rowspan="2">Balance</th><th rowspan="2">Shift In / Out</th></tr>
        <tr><th class="in">Oral</th><th class="in">IV</th><th class="in">Tube</th><th class="in">Other</th><th class="in">Total</th><th class="out">Urine</th><th class="out">Drain</th><th class="out">Vomit</th><th class="out">Stool</th><th class="out">Other</th><th class="out">Total</th></tr></thead><tbody>${dayRows}</tbody></table>
      <h2>All entries</h2>
      <table><thead><tr><th style="width:9%">Time</th><th style="width:6%">Shift</th><th style="width:7%">In / Out</th><th style="width:12%">Type</th><th style="width:26%">Item</th><th style="width:10%">Amount</th><th style="width:14%">Recorded by</th><th>Remarks</th></tr></thead><tbody>${entryRows||'<tr><td colspan="8" style="text-align:center">No entries</td></tr>'}</tbody></table>
      <div class="sign"><div>Nurse</div><div>Nursing Manager</div><div>Treating Doctor</div></div>
      <div class="footer">Generated from Samara Care ERP on ${ioEsc(formatDateTimeIN(new Date().toISOString()))} by ${ioEsc(who)} · Tea / milk / juice from Resident Food Intake counted as oral intake · Computer-generated record</div>
      <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
    </body></html>`;
    win.document.open();win.document.write(html);win.document.close();return true;
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
    const [cell,setCell]=React.useState(null); // {col, slot}
    const [cf,setCf]=React.useState(null);     // popup form
    const [printForm,setPrintForm]=React.useState(null); // 2.18.87 {from,to}
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
    function openCell(col,slot){
      const st=ioSlotStart(chartDate,slot),en=ioSlotStart(chartDate,slot+1),now=new Date();
      if(st>now)return showSamaraActionToast('warning','Not yet','This time slot has not started yet.');
      const at=now>=st&&now<en?now:new Date(Math.min(st.getTime()+60*60000,now.getTime()));
      const catheter=/cath/i.test(setting?.reason||'');
      const item=col.key==='urine'?(catheter?'Catheter bag':'Passed urine'):col.key==='other'?'Other intake':'';
      setCell({col,slot});
      setCf({item,custom:'',volume:'',stool_count:'1',stool_type:'Formed',at:ioLocalInput(at),remarks:''});
    }
    async function saveCell(){
      if(busy||!cell||!cf)return;
      const col=cell.col;
      if(!patientId||!chartOn)return showSamaraActionToast('error','Chart is not ON','Start the Intake / Output chart for this Guest first.');
      const at=ioFromLocal(cf.at);
      if(Number.isNaN(at.getTime()))return showSamaraActionToast('error','Check the time','Enter a valid date and time.');
      if(at.getTime()>Date.now()+5*60000)return showSamaraActionToast('error','Time is in the future','Enter the time it was actually given / measured.');
      const maxBack=(canManage?72:24)*3600000;
      if(Date.now()-at.getTime()>maxBack)return showSamaraActionToast('error','Too old',canManage?'Entries can be added up to 3 days back.':'Nurses can add entries up to 24 hours back. Ask the Nursing Manager for older corrections.');
      const isStool=col.key==='stool';
      const category=col.key==='urine'?(cf.item==='Catheter bag'?'Catheter urine':'Urine'):col.key==='other'?(cf.item==='Other output'?'Other output':'Other intake'):col.cats[0];
      const direction=col.dir||(category==='Other output'?'Output':'Intake');
      const vol=cf.volume===''?null:Number(cf.volume);
      if(!isStool&&!(vol>0&&vol<=5000))return showSamaraActionToast('error','Choose the amount','Tap an amount or type the ml (1–5000).');
      if(isStool&&!(Number(cf.stool_count)>0))return showSamaraActionToast('error','Enter the count','How many times (1 or more).');
      const item=(cf.item==='Other…'?cf.custom:(['urine','other'].includes(col.key)?cf.custom:cf.item)).trim()||null;
      if(cf.item==='Other…'&&!item)return showSamaraActionToast('error','Type the item','Type what was given (e.g. Glucon-D, Horlicks).');
      setBusy(true);
      const payload={patient_id:patientId,entry_at:at.toISOString(),direction,category,item,volume_ml:vol,stool_count:isStool?Math.round(Number(cf.stool_count)):null,stool_type:isStool?cf.stool_type:null,remarks:cf.remarks.trim()||null,recorded_by:profile.id,recorded_by_name:profile.full_name||null};
      const {data,error}=await client.from('io_entries').insert(payload).select('id').single();
      setBusy(false);
      if(error)return showSamaraActionToast('error','Not saved',error.message);
      writeAuditEvent('Intake/Output Recorded','Intake / Output',data?.id||patientId,{patient_id:patientId,direction,category,volume_ml:vol,stool_count:payload.stool_count,summary:`${direction}: ${category}${item?` (${item})`:''} ${isStool?`× ${payload.stool_count}`:ioMl(vol)}`},'Success');
      showSamaraActionToast('success',`${direction} saved`,`${item?item+' · ':''}${category}${isStool?` × ${payload.stool_count} (${payload.stool_type})`:` — ${ioMl(vol)}`} · ${ioTime(at)}`);
      setCell(null);setCf(null);
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
.io-help{display:block;color:#6b5560;margin:2px 0 8px}
.io-gwrap{overflow-x:hidden;overflow-y:auto;max-height:70vh;border:1px solid #ead7e1;border-radius:12px;background:#fff}
.io-grid{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;font-size:13px}
.io-grid col.io-c-time{width:84px}
.io-grid th,.io-grid td{border-bottom:1px solid #f0e4ea;border-right:1px solid #f0e4ea;padding:0;text-align:center;white-space:nowrap;overflow:hidden}
.io-grid thead th{position:sticky;top:0;z-index:2;background:#fbf2f7;color:#5d1039;font-weight:800;padding:5px 2px}
.io-grid thead tr.io-dirrow th{position:static;font-size:11px;letter-spacing:.03em;padding:3px}
.io-grid thead tr:nth-child(2) th{top:0}
.io-grid th.io-in{background:#eaf4ff;color:#1d4f91}.io-grid th.io-out{background:#fff3e0;color:#8a4b00}
.io-grid .io-ic{display:block;font-size:15px;line-height:1.1}
.io-grid td.io-time,.io-grid th.io-time{text-align:left;padding:4px 6px;font-weight:700;color:#3f2a35;font-size:12px;white-space:normal}
.io-grid td.io-time small{display:inline-block;margin-left:4px;background:#a91360;color:#fff;border-radius:6px;padding:0 5px;font-size:10px}
.io-grid tr.io-now td{background:#fff7fb}
.io-grid tr.io-nightrow td.io-time{background:#f3f4fb}
.io-cell{width:100%;height:40px;border:0;background:transparent;cursor:pointer;font-weight:800;font-size:13px;color:#b9a5af;position:relative}
.io-cell.io-has.io-i{background:#e7f1ff;color:#1d4f91}.io-cell.io-has.io-o{background:#fff1dc;color:#8a4b00}
.io-cell:disabled{cursor:not-allowed;color:transparent;background:#faf8f9}
.io-bev{position:absolute;top:1px;right:2px;font-size:10px}
.io-grid tr.io-subtotal td{background:#f6eaf0;font-weight:800;color:#790c44;padding:5px 2px;font-size:12px}
.io-grid tr.io-shiftbal td{background:#fff;text-align:left;padding:5px 8px;font-size:12px;color:#5d4a54;white-space:normal}
.io-daybal{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-top:10px;padding:10px 12px;border-radius:12px;background:#fff4f9;border:1px solid #e3a5c2;font-size:14px}
.io-daybal strong{margin-left:auto;color:#790c44}
.io-daybal-warn{background:#ffe9ec;border-color:#f2a3ae}
.io-pop{width:min(520px,96vw);max-height:90vh;overflow:auto}
.io-lbl{display:block;font-weight:700;color:#5d1039;margin:10px 0 4px;font-size:13px}
.io-chips{display:flex;flex-wrap:wrap;gap:6px}
.io-chip{border:1px solid #e8b6cd;background:#fff;border-radius:999px;padding:8px 14px;font-weight:700;color:#7a0b44;cursor:pointer;font-size:14px;min-width:52px}
.io-chip.on{background:#b01264;color:#fff;border-color:#b01264}
.io-ml{margin-top:8px;width:100%;max-width:220px}
.io-here{background:#fbf7f9;border-radius:10px;padding:6px 10px;margin:6px 0}
.io-here>small{font-weight:700;color:#7b6871}
.io-here-row{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:13px;padding:3px 0}
.io-more{margin-top:10px}.io-more summary{cursor:pointer;color:#7a0b44;font-weight:600;font-size:13px}
.io-list summary{cursor:pointer;color:#7a0b44;font-weight:700;margin-bottom:8px}
@media (max-width:760px){.io-grid col.io-c-time{width:58px}.io-grid{font-size:11px}.io-grid td.io-time,.io-grid th.io-time{font-size:10px;padding:3px}.io-grid thead th{font-size:10px;padding:4px 0}.io-grid .io-ic{font-size:13px}.io-cell{height:38px;font-size:11px}.io-grid td.io-time small{display:block;margin:2px 0 0;width:max-content}}

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
        h('div',{className:'io-datebar'},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{const d=ioAddDays(chartDate,-1);setChartDate(d);setDraftDate(d)}},'‹ Previous day'),
          h('div',{className:'field'},h('label',null,'Chart date'),h(StrictDateInput,{value:draftDate,max:today,onChange:e=>setDraftDate(e.target.value)})),
          draftDate&&draftDate!==chartDate?h('button',{type:'button',className:'btn btn-primary',onClick:()=>setChartDate(draftDate||today)},'Apply'):null,
          h('button',{type:'button',className:'btn btn-secondary',disabled:chartDate>=today,onClick:()=>{const d=ioAddDays(chartDate,1);setChartDate(d);setDraftDate(d)}},'Next day ›'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:chartDate===today,onClick:()=>{setChartDate(today);setDraftDate(today)}},'Today'),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>setPrintForm({from:chartDate,to:chartDate})},'🖨 Print / PDF')),
        printForm&&h('div',{className:'modal-backdrop',onClick:ev=>{if(ev.target===ev.currentTarget)setPrintForm(null)}},
          h('div',{className:'card modal',style:{maxWidth:'520px'}},
            h('div',{className:'panel-head'},h('div',null,h('h3',null,'Print / Save PDF — Intake / Output'),h('small',null,guestLabel(patientRow))),h('button',{type:'button',className:'close',onClick:()=>setPrintForm(null)},'×')),
            h('div',{className:'actions',style:{display:'flex',gap:'6px',flexWrap:'wrap',margin:'4px 0 10px'}},
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPrintForm({from:chartDate,to:chartDate})},'This chart day'),
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPrintForm({from:ioAddDays(today,-6)<'2026-08-27'?'2026-08-27':ioAddDays(today,-6),to:today})},'Last 7 days'),
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPrintForm({from:`${today.slice(0,8)}01`,to:today})},'This month')),
            h('div',{className:'form-grid'},
              h('div',{className:'field'},h('label',null,'From (chart day)'),h(StrictDateInput,{value:printForm.from,min:'2026-08-27',max:today,onChange:ev=>setPrintForm({...printForm,from:ev.target.value})})),
              h('div',{className:'field'},h('label',null,'To (chart day)'),h(StrictDateInput,{value:printForm.to,min:'2026-08-27',max:today,onChange:ev=>setPrintForm({...printForm,to:ev.target.value})}))),
            h('small',{className:'io-help'},'Day-wise totals with Day / Night shift totals, a chart, every entry with time and nurse, and signature lines for Nurse, Nursing Manager and Treating Doctor.'),
            h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPrintForm(null)},'Cancel'),
              h('button',{type:'button',className:'btn btn-primary',onClick:()=>{const f=printForm.from<=printForm.to?printForm.from:printForm.to,t=printForm.from<=printForm.to?printForm.to:printForm.from;
                if(!f||!t){showSamaraActionToast('error','Intake / Output','Choose the From and To dates.');return}
                if((new Date(t)-new Date(f))/86400000>92){showSamaraActionToast('error','Intake / Output','Choose a period of up to 3 months.');return}
                ioOpenPrint({patient:patientRow,setting,from:f,to:t,who:profile?.full_name||profile?.name||'Staff'});setPrintForm(null)}},'Print / Save PDF')))),
        overLimit&&h('div',{className:'io-warn',role:'status'},`Balance ${balance>=0?'+':'−'}${ioMl(Math.abs(balance))} is beyond the limit of ± ${ioMl(setting.balance_limit_ml)}. Inform the Nursing Manager / treating doctor.`),
        h('small',{className:'io-help'},'Tap a box → choose what and how much → Save. ☕ = tea / milk / juice from Resident Food Intake (added automatically).'),
        h('div',{className:'io-gwrap'},h('table',{className:'io-grid'},
          h('colgroup',null,h('col',{className:'io-c-time'}),IO_COLS.map(c=>h('col',{key:c.key}))),
          h('thead',null,
            h('tr',{className:'io-dirrow'},h('th',null,''),h('th',{colSpan:3,className:'io-in'},'⬇ INTAKE'),h('th',{colSpan:4,className:'io-out'},'⬆ OUTPUT'),h('th',null,'±')),
            h('tr',null,h('th',{className:'io-time'},'Time'),IO_COLS.map(c=>h('th',{key:c.key,className:c.dir==='Intake'?'io-in':c.dir==='Output'?'io-out':''},h('span',{className:'io-ic'},c.icon),h('span',null,c.label))))),
          h('tbody',null,Array.from({length:IO_SLOTS},(_,i)=>{
            const st=ioSlotStart(chartDate,i),en=ioSlotStart(chartDate,i+1),now=new Date();
            const future=st>now,current=now>=st&&now<en;
            const rowsHere=rows.filter(x=>!x.voided&&ioSlotOf(chartDate,x.at)===i);
            const tr=h('tr',{key:`s${i}`,className:`${current?'io-now':''} ${i>=IO_SLOTS/2?'io-nightrow':''}`},
              h('td',{className:'io-time'},ioSlotLabel(chartDate,i),current?h('small',null,'now'):null),
              IO_COLS.map(c=>{
                const here=rowsHere.filter(x=>ioColOf(x.category)===c);
                const ml=here.reduce((t,x)=>t+x.ml,0),stool=here.reduce((t,x)=>t+x.stool,0),bev=here.some(x=>x.src==='Food Intake');
                const otherOut=c.key==='other'&&here.some(x=>x.direction==='Output');
                const text=c.key==='stool'?(stool?`${stool}×`:''):ml?Math.round(ml).toLocaleString('en-IN'):'';
                return h('td',{key:c.key},h('button',{type:'button',className:`io-cell ${text?'io-has':''} ${c.dir==='Output'||otherOut?'io-o':'io-i'}`,disabled:future||!chartOn,title:future?'Not yet':here.length?here.map(x=>`${ioTime(x.at)} ${x.what||x.category} ${x.ml?ioMl(x.ml):''}`).join('\n'):`Add ${c.label} · ${ioSlotLabel(chartDate,i)}`,'aria-label':`${c.label} ${ioSlotLabel(chartDate,i)}: ${text||'empty'}`,onClick:()=>openCell(c,i)},
                  text||(future||!chartOn?'':'+'),bev?h('span',{className:'io-bev'},'☕'):null));
              }));
            if(i===IO_SLOTS/2-1||i===IO_SLOTS-1){
              const t=i===IO_SLOTS/2-1?day:night;
              const sub=c=>{const l=rows.filter(x=>!x.voided&&ioColOf(x.category)===c&&x.shift===(i===IO_SLOTS/2-1?IO_DAY:IO_NIGHT));return c.key==='stool'?(l.reduce((a,x)=>a+x.stool,0)||''):(Math.round(l.reduce((a,x)=>a+x.ml,0))||'')};
              return [tr,h('tr',{key:`t${i}`,className:'io-subtotal'},h('td',{className:'io-time'},i===IO_SLOTS/2-1?'Day total':'Night total'),IO_COLS.map(c=>h('td',{key:c.key},String(sub(c)).replace(/^(\d+)$/,m=>c.key==='stool'?`${m}×`:Number(m).toLocaleString('en-IN'))))),
                h('tr',{key:`b${i}`,className:'io-shiftbal'},h('td',{colSpan:IO_COLS.length+1},`${i===IO_SLOTS/2-1?'Day 7 AM–7 PM':'Night 7 PM–7 AM'}: In ${ioMl(t.intake)} · Out ${ioMl(t.output)} · Urine ${ioMl(t.urine)} · Balance ${t.intake-t.output>=0?'+':'−'}${ioMl(Math.abs(t.intake-t.output))}`))];
            }
            return tr;
          })))),
        h('div',{className:`io-daybal ${overLimit?'io-daybal-warn':''}`},
          h('span',null,chartDate===today?'24 hours so far':'24 hours'),
          h('span',null,`In ${ioMl(total.intake)}`),h('span',null,`Out ${ioMl(total.output)}`),h('span',null,`Urine ${ioMl(total.urine)}`),
          h('strong',null,`Balance ${balance>=0?'+':'−'}${ioMl(Math.abs(balance))}`))
      ),
      patientId&&(chartOn||entries.length>0)&&h(Section,{title:`All entries — ${formatDateWithDayIN(chartDate)} (${rows.length})`,subtitle:'Every entry with time and nurse. Tap a row for full details; Remove wrong entries here.'},
        h('details',{className:'io-list'},h('summary',null,'Show the list'),
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
            :h('tr',null,h('td',{colSpan:8,className:'empty'},'Nothing recorded for this chart day yet.'))))))
      ),
      cell&&cf&&(()=>{const c=cell.col;const here=rows.filter(x=>ioSlotOf(chartDate,x.at)===cell.slot&&ioColOf(x.category)===c);
        const chips=(list,val,set)=>h('div',{className:'io-chips'},list.map(v=>h('button',{type:'button',key:v,className:`io-chip ${val===v?'on':''}`,onClick:()=>set(v)},v)));
        return h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget){setCell(null);setCf(null)}}},
          h('div',{className:'card modal io-pop',role:'dialog','aria-modal':true,'aria-label':`${c.label} entry`},
            h('div',{className:'panel-head'},h('div',null,h('h3',null,`${c.icon} ${c.label} · ${ioSlotLabel(chartDate,cell.slot)}`),h('small',null,guestLabel(patientRow))),h('button',{type:'button',className:'close',onClick:()=>{setCell(null);setCf(null)}},'×')),
            here.length?h('div',{className:'io-here'},h('small',null,'Already in this box'),here.map(x=>h('div',{key:x.key,className:`io-here-row ${x.voided?'io-row-voided':''}`},
              h('span',null,`${ioTime(x.at)} · ${x.what||x.category} · ${x.category==='Stool'?'':ioMl(x.ml)}${x.by?` · ${x.by}`:''}`,x.src==='Food Intake'?h('span',{className:'io-src'},'Food Intake'):null),
              x.src==='Chart'&&!x.voided?h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 8px'},onClick:()=>voidEntry(x.r)},'Remove'):x.voided?h('small',null,'Removed'):null))):null,
            c.items.length?h(React.Fragment,null,h('label',{className:'io-lbl'},c.key==='urine'?'How':c.key==='other'?'In or out':'What'),chips(c.key==='urine'||c.key==='other'?c.items:[...c.items,'Other…'],cf.item,v=>setCf({...cf,item:v}))):null,
            (cf.item==='Other…'||['drain','vomit','other'].includes(c.key))&&miniInput(c.key==='drain'?'Drain site (optional)':cf.item==='Other…'?'Type the item':'Details (optional)',cf.custom,v=>setCf({...cf,custom:v})),
            c.key==='stool'
              ?h(React.Fragment,null,h('label',{className:'io-lbl'},'How many times'),chips(['1','2','3','4'],cf.stool_count,v=>setCf({...cf,stool_count:v})),h('label',{className:'io-lbl'},'Type'),chips(IO_STOOL_TYPES,cf.stool_type,v=>setCf({...cf,stool_type:v})),miniInput('Amount in ml (optional)',cf.volume,v=>setCf({...cf,volume:v}),false,'number'))
              :h(React.Fragment,null,h('label',{className:'io-lbl'},'Amount (ml)'),chips(c.amounts.map(String),cf.volume,v=>setCf({...cf,volume:v})),
                h('input',{className:'io-ml',type:'number',inputMode:'numeric',min:1,max:5000,placeholder:'Other amount (ml)',value:c.amounts.map(String).includes(cf.volume)?'':cf.volume,onChange:e=>setCf({...cf,volume:e.target.value})})),
            h('details',{className:'io-more'},h('summary',null,`Time: ${ioTime(ioFromLocal(cf.at))} · change time / add remarks`),
              h('div',{className:'field'},h('label',null,'Time given / measured'),h(StrictDateTimeInput,{value:cf.at,max:ioLocalInput(),onChange:e=>setCf({...cf,at:e.target.value})})),
              miniInput('Remarks',cf.remarks,v=>setCf({...cf,remarks:v}))),
            h('div',{className:'actions',style:{display:'flex',gap:'8px',marginTop:'10px'}},
              h('button',{type:'button',className:'btn btn-secondary',style:{flex:1},onClick:()=>{setCell(null);setCf(null)}},'Cancel'),
              h('button',{type:'button',className:'btn btn-primary',style:{flex:2},disabled:busy,onClick:saveCell},busy?'Saving…':`Save ${c.label}`))));
      })()
    );
  }
