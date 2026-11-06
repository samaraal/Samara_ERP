  // ---------------------------------------------------------------------------------------------
  // 2.19.71: CARE vs BILLING reconciliation PDF (MIS & Audit, Admin / Directors only).
  // Compares what was DONE for each Guest (MAR / nursing records) with what was CHARGED in Bills & Charges.
  // Admin rule (06-11-2026): of the medicines, only NEBULISATION is chargeable (oral / injections / others are not).
  //   • One nebulisation session = one dose time recorded "Given" for an inhalation / NEB medicine on a day
  //     (two medicines given at the same time = one session).
  //   • A charge counts unless it is Removed or Rejected by Accounts (Pending counts — it is already raised).
  //   • Both directions: given but not charged (lost revenue) and charged but not given (over-billing risk).
  // Also lists each Guest's medicines (admission prescription and every change) with the chargeable ones marked,
  // and adds the related findings from the MIS checks (procedures not charged, blood sugar, physiotherapy, duplicates).
  // Read-only: nothing is changed by this report.
  // ---------------------------------------------------------------------------------------------
  const CBR_RELATED_CHECKS=['np_started_not_charged','sugar_charge_vs_reading','physio_unbilled','possible_duplicates','charged_before_service','charge_outside_stay'];
  const cbrIsNeb=o=>/inhal/i.test(String(o?.route||''))||/^\s*neb/i.test(String(o?.medicine_name||''));
  const cbrIsNebCharge=r=>/nebul/i.test(`${r?.service_name||''} ${r?.description||''}`);
  const cbrCounts=r=>String(r?.status||'')!=='Removed'&&String(r?.approval_status||'')!=='Rejected';
  const cbrHHMM=v=>String(v||'').slice(0,5);
  const cbrRs=v=>'Rs. '+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  async function cbrFetchAll(build){
    const out=[];for(let from=0;;from+=1000){const res=await build().range(from,from+999);if(res.error)throw res.error;out.push(...(res.data||[]));if((res.data||[]).length<1000)return out;}
  }
  // The analysis itself (exported for tests through window.__cbrAnalyse)
  function cbrAnalyse({orders,doses,charges,patients,from,to,today}){
    const nebOrderIds=new Set(orders.filter(cbrIsNeb).map(o=>o.id));
    const orderById=new Map(orders.map(o=>[o.id,o]));
    const guests=new Map();
    const guest=id=>{if(!guests.has(id))guests.set(id,{id,days:new Map(),meds:[],rate:0,rateNote:''});return guests.get(id)};
    const day=(g,d)=>{if(!g.days.has(d))g.days.set(d,{date:d,times:new Set(),charged:0,pending:0});return g.days.get(d)};
    doses.forEach(a=>{
      if(String(a.status)!=='Given'||!nebOrderIds.has(a.order_id))return;
      const o=orderById.get(a.order_id);const d=String(a.scheduled_date||'').slice(0,10);if(!o||!d||d<from||d>to)return;
      day(guest(o.patient_id),d).times.add(cbrHHMM(a.scheduled_time));
    });
    const rates=new Map();
    charges.forEach(r=>{
      if(!cbrIsNebCharge(r)||!cbrCounts(r))return;
      const q=Number(r.quantity||0)||0,amt=Number(r.approved_amount??r.requested_amount??0)||0;
      if(q>0&&amt>0){const x=rates.get(r.patient_id)||[];x.push(amt/q);rates.set(r.patient_id,x)}
      const d=String(r.charge_date||'').slice(0,10);if(!d||d<from||d>to)return;
      const dd=day(guest(r.patient_id),d);dd.charged+=q;if((r.approval_status||'Pending')==='Pending')dd.pending+=q;
    });
    const result=[];
    guests.forEach(g=>{
      const p=patients.find(x=>x.id===g.id)||{};
      if(p.is_trial)return;
      const rs=rates.get(g.id)||[];g.rate=rs.length?rs[rs.length-1]:100;g.rateNote=rs.length?'':'rate assumed (no earlier nebulisation charge)';
      const days=[...g.days.values()].map(d=>{const given=d.times.size;return {date:d.date,times:[...d.times].sort(),given,charged:d.charged,pending:d.pending,diff:given-d.charged,today:d.date===today}}).sort((a,b)=>a.date.localeCompare(b.date));
      const done=days.filter(d=>!d.today);
      const missing=done.reduce((n,d)=>n+Math.max(0,d.diff),0),over=done.reduce((n,d)=>n+Math.max(0,-d.diff),0);
      g.meds=orders.filter(o=>o.patient_id===g.id).sort((a,b)=>String(a.effective_from||a.created_at||'').localeCompare(String(b.effective_from||b.created_at||'')));
      result.push({id:g.id,patient:p,name:formalName(p)||p.full_name||'Guest',room:p.room_no?`${p.room_no}${p.bed_no?'-'+p.bed_no:''}`:'—',
        active:p.is_active!==false&&String(p.admission_status||'')!=='Discharged',rate:g.rate,rateNote:g.rateNote,days,
        given:days.reduce((n,d)=>n+d.given,0),charged:days.reduce((n,d)=>n+d.charged,0),missing,over,missingValue:missing*g.rate,overValue:over*g.rate,meds:g.meds});
    });
    // Guests with medicines but no nebulisation still get their medicine list
    patients.forEach(p=>{if(p.is_trial||result.some(r=>r.id===p.id))return;const meds=orders.filter(o=>o.patient_id===p.id);
      const inStay=meds.some(o=>String(o.effective_from||o.created_at||'').slice(0,10)<=to&&(!o.stopped_at||String(o.stopped_at).slice(0,10)>=from));
      if(!inStay)return;
      result.push({id:p.id,patient:p,name:formalName(p)||p.full_name||'Guest',room:p.room_no?`${p.room_no}${p.bed_no?'-'+p.bed_no:''}`:'—',active:p.is_active!==false&&String(p.admission_status||'')!=='Discharged',
        rate:0,rateNote:'',days:[],given:0,charged:0,missing:0,over:0,missingValue:0,overValue:0,meds:meds.sort((a,b)=>String(a.effective_from||a.created_at||'').localeCompare(String(b.effective_from||b.created_at||'')))})});
    return result.sort((a,b)=>(b.missingValue+b.overValue)-(a.missingValue+a.overValue)||a.name.localeCompare(b.name));
  }
  window.__cbrAnalyse=cbrAnalyse;

  async function downloadCareBillingReconPdf({from,to,misData,profile}){
    const today=todayISOIndia();
    const [orders,patients,charges]=await Promise.all([
      cbrFetchAll(()=>client.from('medication_orders').select('id,patient_id,medicine_name,strength,dose,route,frequency,scheduled_times,status,is_active,effective_from,created_at,stopped_at,change_action,prescribed_by_doctor').order('id')),
      cbrFetchAll(()=>client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active,admission_status,admission_date,is_trial').order('id')),
      cbrFetchAll(()=>client.from('bill_charge_requests').select('id,patient_id,charge_date,service_name,description,quantity,requested_amount,approved_amount,status,approval_status').gte('charge_date',from).lte('charge_date',to).order('id'))
    ]);
    const nebIds=orders.filter(cbrIsNeb).map(o=>o.id);
    const doses=[];
    for(let i=0;i<nebIds.length;i+=100){
      doses.push(...await cbrFetchAll(()=>client.from('medication_administrations').select('id,order_id,scheduled_date,scheduled_time,status').in('order_id',nebIds.slice(i,i+100)).gte('scheduled_date',from).lte('scheduled_date',to).order('id')));
    }
    // earlier nebulisation charges (outside the period) only to learn each Guest's rate
    const rateRows=await cbrFetchAll(()=>client.from('bill_charge_requests').select('patient_id,service_name,description,quantity,requested_amount,approved_amount,status,approval_status,charge_date').ilike('service_name','%nebul%').order('charge_date'));
    const rows=cbrAnalyse({orders,doses,charges:[...rateRows.filter(r=>r.charge_date<from||r.charge_date>to),...charges],patients,from,to,today});
    const related=[];(misData?.sections||[]).forEach(s=>(s.checks||[]).forEach(c=>{if(CBR_RELATED_CHECKS.includes(c.key))related.push(c)}));

    const jsPDF=await loadAstPdfLibrary();
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    const period=from===to?formatDateIN(from):`${formatDateIN(from)} to ${formatDateIN(to)}`;
    const who=formalName(profile)||profile?.full_name||'Admin';
    const header=title=>{
      doc.setTextColor(178,11,93);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('SAMARA HEALTH CARE LLP',10,13);
      doc.setTextColor(109,89,99);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('MIS & Audit · Care vs Billing reconciliation · '+period,W-10,13,{align:'right'});
      doc.setDrawColor(178,11,93);doc.setLineWidth(0.6);doc.line(10,16,W-10,16);
      doc.setTextColor(50,29,40);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(title,10,23);
    };
    const T=(opts)=>doc.autoTable({theme:'grid',margin:{left:10,right:10,bottom:14},styles:{fontSize:8.2,cellPadding:1.6,lineColor:[234,212,221],textColor:[59,40,51],overflow:'linebreak'},headStyles:{fillColor:[247,220,232],textColor:[103,18,61],fontStyle:'bold'},...opts});
    const after=()=>doc.lastAutoTable?.finalY||30;

    // ---- Page 1: summary
    header('Care vs Billing — summary');
    const totMissing=rows.reduce((n,r)=>n+r.missingValue,0),totOver=rows.reduce((n,r)=>n+r.overValue,0);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,60,70);
    const intro=doc.splitTextToSize(`What was done for each Guest (MAR and nursing records) compared with what was charged in Bills & Charges. Chargeable medicine: nebulisation only (one session = one dose time given; two medicines at the same time = one session). A charge counts unless Removed or Rejected (Pending counts). Today (${formatDateIN(today)}) is shown but not counted as missing, because the day is not over. Generated ${formatDateTimeIN(new Date())} by ${who}.`,W-20);
    doc.text(intro,10,29);
    let y=29+intro.length*4+2;
    const box=(x,label,val,hi)=>{doc.setFillColor(...(hi?[178,11,93]:[255,247,251]));doc.setDrawColor(...(hi?[178,11,93]:[231,195,212]));doc.roundedRect(x,y,(W-26)/3,15,2,2,'FD');
      doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(...(hi?[255,255,255]:[109,89,99]));doc.text(label.toUpperCase(),x+3,y+5);
      doc.setFontSize(12);doc.setTextColor(...(hi?[255,255,255]:[50,29,40]));doc.text(val,x+3,y+12)};
    const bw=(W-26)/3;
    box(10,'Given, not charged',cbrRs(totMissing),true);box(10+bw+3,'Charged, not given',cbrRs(totOver),false);box(10+2*(bw+3),'Guests with a gap',String(rows.filter(r=>r.missing||r.over).length),false);
    y+=20;
    T({startY:y,head:[['Guest','Room','Status','Neb. sessions given','Charged','Not charged','Charged, not given','Rate','Value not charged']],
      body:rows.filter(r=>r.given||r.charged).map(r=>[r.name,r.room,r.active?'Current':'Discharged',r.given,r.charged,r.missing,r.over,cbrRs(r.rate)+(r.rateNote?' *':''),cbrRs(r.missingValue)]),
      columnStyles:{3:{halign:'right'},4:{halign:'right'},5:{halign:'right',fontStyle:'bold',textColor:[180,35,47]},6:{halign:'right',textColor:[29,78,216]},7:{halign:'right'},8:{halign:'right',fontStyle:'bold'}}});
    y=after()+4;
    if(rows.some(r=>r.rateNote)){doc.setFontSize(7.5);doc.setTextColor(109,89,99);doc.text('* rate assumed Rs. 100 (Samara nebulizer) — no earlier nebulisation charge for this Guest.',10,y);y+=5;}
    if(related.length){
      T({startY:y+2,head:[['Other care-vs-billing checks (from MIS)','Findings']],body:related.map(c=>[c.title,c.error?'could not run':String(c.count||0)]),columnStyles:{1:{halign:'right',cellWidth:30}}});
    }

    // ---- One section per Guest (new page each)
    rows.forEach(r=>{
      doc.addPage();header(`${r.name} · Room ${r.room} · ${r.patient.patient_id||''} · ${r.active?'Current Guest':'Discharged'}`);
      let yy=28;
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,60,70);
      doc.text(`Nebulisation: ${r.given} sessions given · ${r.charged} charged · ${r.missing} not charged (${cbrRs(r.missingValue)}) · ${r.over} charged but not given (${cbrRs(r.overValue)})`,10,yy);yy+=4;
      const gaps=r.days.filter(d=>d.diff!==0);
      T({startY:yy+1,head:[['Date','Session times given (MAR)','Given','Charged','Difference','Result']],
        body:gaps.length?gaps.map(d=>[formatDateIN(d.date),d.times.join(', ')||'—',d.given,d.charged+(d.pending?` (${d.pending} pending)`:''),d.diff>0?`+${d.diff}`:String(d.diff),d.today?'Today — day not over':d.diff>0?`Not charged: ${d.diff} × ${cbrRs(r.rate)}`:`Charged ${-d.diff} more than given — check`]):[['—','No difference in the period','','','','✓ matches']],
        columnStyles:{2:{halign:'right'},3:{halign:'right'},4:{halign:'right',fontStyle:'bold'}},
        didParseCell:c=>{if(c.section==='body'&&c.column.index===5){const t=String(c.cell.raw||'');if(/^Not charged/.test(t))c.cell.styles.textColor=[180,35,47];else if(/more than given/.test(t))c.cell.styles.textColor=[29,78,216]}}});
      yy=after()+5;
      doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(103,18,61);doc.text('Medicines — admission prescription and every change',10,yy);
      T({startY:yy+2,head:[['From','To','Medicine','Route','Times','Chargeable','Order']],
        body:r.meds.map(o=>[o.effective_from?formatDateIN(String(o.effective_from).slice(0,10)):'—',o.stopped_at?formatDateIN(String(o.stopped_at).slice(0,10)):'now',`${o.medicine_name||''} ${o.strength||o.dose||''}`.trim(),o.route||'—',
          (Array.isArray(o.scheduled_times)?o.scheduled_times:String(o.scheduled_times||'').replace(/[{}"]/g,'').split(',')).filter(Boolean).map(cbrHHMM).join(', ')||o.frequency||'—',
          cbrIsNeb(o)?'YES — nebulisation':'No',[o.change_action||'',o.status||''].filter(Boolean).join(' · ')]),
        columnStyles:{5:{fontStyle:'bold'}},
        didParseCell:c=>{if(c.section==='body'&&c.column.index===5&&/^YES/.test(String(c.cell.raw)))c.cell.styles.textColor=[178,11,93]}});
      const mine=related.flatMap(c=>(c.rows||[]).filter(x=>String(x.patient_id||'')===r.id||String(x.who||'').toLowerCase().includes(String(r.patient.full_name||'~').toLowerCase())).map(x=>[c.title,x.date||'—',x.detail||'',x.amount?cbrRs(x.amount):'']));
      if(mine.length){yy=after()+5;doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(103,18,61);doc.text('Other findings for this Guest (MIS checks)',10,yy);
        T({startY:yy+2,head:[['Check','Date','Detail','Amount']],body:mine,columnStyles:{3:{halign:'right'}}});}
    });
    const pages=doc.internal.getNumberOfPages();
    for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7.5);doc.setTextColor(140,120,130);doc.text(`Page ${i} of ${pages} · Read-only report — raise missing charges through Bills & Charges / Approval Requests`,W/2,H-7,{align:'center'});}
    doc.save(`Samara_Care_vs_Billing_${from}_to_${to}.pdf`);
    return {guests:rows.length,missing:totMissing,over:totOver};
  }
