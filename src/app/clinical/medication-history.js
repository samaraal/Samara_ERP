  // 2.18.60: Medicines → MEDICATION HISTORY (Boomi, 21-10-2026).
  // Every scheduled dose for a chosen Guest (or all Guests) and period, with what happened to it:
  // Given / Withheld / Refused / Missed / Delayed, or "Not recorded" when a past dose has no entry.
  // Filters (Apply button): Guest + search (from 3 letters), Date / Period (Today, Selected Date, This Week,
  // This Month, Month (choose), Selected Period — never before 27-08-2026), Status, Medicine.
  // Shown date → time → Guest (Guest once per group, one line per medicine; no wide table). Each date folds
  // to a one-line summary when the period is longer than a day. Tap a dose to see the full audit.
  // Print (A4 landscape), Download PDF (real .pdf) and Download Excel follow the applied filter.
  // Reuses srPeriodBounds / srMonthOptions / SR_PERIODS / srEsc / SR_COMPACT_CSS (stores/stock-report.js),
  // loadXlsxLibrary / freshFetchAll / freshSaveBlob / freshCsv / freshFileStamp (stores/stock-fresh-start.js),
  // loadAstPdfLibrary (accounts/11-accounts-statement.js), samaraPrintBar / RowDetailModal / useAppliedFilters.
  // Read only — no SQL, nothing is written.
  const MH_START='2026-08-27';
  // 2.18.61: the database returns times as HH:MM:SS, prescriptions as HH:MM — always compare HH:MM
  const mhT=t=>normalizeMedicationTime(t).slice(0,5);
  const MH_STATUSES=[['all','All statuses'],['Given','Given'],['Withheld','Withheld'],['Refused','Refused'],['Missed','Missed'],['Delayed','Delayed'],['Not recorded','Not recorded']];
  const MH_EXCEPTION=['missed','refused','delayed','not given','withheld','unavailable'];
  const mhName=p=>formalName(p)||p?.full_name||'Guest';
  const mhRoom=p=>p?.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'Room —';
  const mhMedicine=o=>[o?.medicine_name,o?.strength||o?.dose].filter(Boolean).join(' ')||'Medicine';
  const mhTimes=o=>(Array.isArray(o?.scheduled_times)?o.scheduled_times:String(o?.scheduled_times||'').split(',')).map(mhT).filter(Boolean);
  const mhDayIndia=v=>{if(!v)return '';const d=new Date(v);if(!Number.isFinite(d.getTime()))return '';try{return d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,10)}catch(_){return String(v).slice(0,10)}};
  const mhTimeIN=v=>{if(!v)return '';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true}).toUpperCase():''};
  function mhStatusOf(row){
    const log=row.log;if(!log)return 'Not recorded';
    if(log.status==='Withheld')return medicationWithholdOpen(log)?'Withheld · awaiting doctor':'Withheld';
    return log.status||'Recorded';
  }
  function mhStatusGroup(row){const s=row.log?String(row.log.status||'Recorded'):'Not recorded';return s}
  function mhTone(row){
    if(!row.log)return 'miss';
    const s=String(row.log.status||'').toLowerCase();
    if(s==='given')return 'ok';
    if(s==='withheld')return 'held';
    return MH_EXCEPTION.includes(s)?'warn':'ok';
  }
  function mhReason(log){
    if(!log)return '';
    return [log.withhold_reason,log.withhold_reading,log.doctor_instruction?`Doctor: ${log.doctor_instruction}${log.doctor_instruction_notes?` (${log.doctor_instruction_notes})`:''}`:(log.status==='Withheld'?"Doctor's instruction pending":''),
      log.rescheduled_time?`Rescheduled to ${medicationTimeLabel(log.rescheduled_time)}`:'',log.reschedule_reason,log.remarks].filter(x=>x&&String(x).trim()).join(' · ');
  }
  // Last day a Guest could have had doses (discharge), and the first (admission).
  function mhGuestWindow(p){
    const first=String(p?.admission_date||'').slice(0,10)||mhDayIndia(p?.created_at);
    const gone=p?.is_active===false||p?.admission_status==='Discharged';
    const last=gone?(String(p?.discharge_date||'').slice(0,10)||mhDayIndia(p?.discharged_at)||mhDayIndia(p?.updated_at)):'';
    return {first,last};
  }
  function buildMedicationHistory({orders,patients,logs,from,to,A}){
    const byPatient=new Map((patients||[]).map(p=>[p.id,p]));
    const byOrder=new Map((orders||[]).map(o=>[o.id,o]));
    const q=String(A.search||'').trim().toLowerCase();
    const wantGuest=p=>{
      if(!p)return false;
      if(A.guestId)return p.id===A.guestId;
      if(q.length>=3)return `${mhName(p)} ${p.full_name||''} ${p.patient_id||''} ${p.room_no||''}`.toLowerCase().includes(q);
      return true;
    };
    const key=(o,d,t)=>`${o}|${d}|${mhT(t)}`;
    const logMap=new Map();
    (logs||[]).forEach(l=>{const k=key(l.order_id,String(l.scheduled_date||'').slice(0,10),l.scheduled_time);const prev=logMap.get(k);
      if(!prev||String(l.entry_recorded_at||l.created_at||'')>String(prev.entry_recorded_at||prev.created_at||''))logMap.set(k,l)});
    const rows=[],seen=new Set(),now=Date.now();
    const push=(order,date,time,log,extra={})=>{
      const k=key(order.id,date,time);if(seen.has(k))return;seen.add(k);
      rows.push({k,order,patient:byPatient.get(order.patient_id)||{},date,time:mhT(time),log,...extra});
    };
    // 1. every entry recorded in the period
    logMap.forEach(l=>{const d=String(l.scheduled_date||'').slice(0,10);if(d<from||d>to)return;
      const order=byOrder.get(l.order_id);if(!order||!wantGuest(byPatient.get(order.patient_id)))return;push(order,d,l.scheduled_time,l)});
    // 2. rescheduled doses (the new time) — recorded or not yet
    (logs||[]).filter(l=>l.rescheduled_time).forEach(l=>{
      const d=rescheduledDoseDate(l);if(!d||d<from||d>to)return;
      const order=byOrder.get(l.order_id);if(!order||!wantGuest(byPatient.get(order.patient_id)))return;
      const t=mhT(l.rescheduled_time);const due=new Date(`${d}T${t}:00+05:30`).getTime();
      const log=logMap.get(key(order.id,d,t));if(!log&&due>now)return;
      push(order,d,t,log||null,{rescheduledFrom:mhT(l.scheduled_time)});
    });
    // 3. past scheduled doses with no entry → "Not recorded"
    const days=[];for(let d=from;d&&d<=to&&days.length<370;d=addDaysISODate(d,1))days.push(d);
    (orders||[]).forEach(order=>{
      const p=byPatient.get(order.patient_id);if(!wantGuest(p))return;
      const w=mhGuestWindow(p);
      const closed=order.discharge_closed_at?mhDayIndia(order.discharge_closed_at):'';
      days.forEach(d=>{
        if(w.first&&d<w.first)return;if(w.last&&d>w.last)return;if(closed&&d>closed)return;
        mhTimes(order).forEach(t=>{
          if(!medicationOrderDoseEligible(order,d,t))return;
          if(new Date(`${d}T${t}:00+05:30`).getTime()>now)return;
          push(order,d,t,logMap.get(key(order.id,d,t))||null);
        });
      });
    });
    const med=String(A.medicine||'').trim().toLowerCase();
    const shown=rows.filter(r=>(A.status==='all'||mhStatusGroup(r)===A.status)&&(!med||mhMedicine(r.order).toLowerCase().includes(med)));
    shown.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||String(a.patient.room_no||'').localeCompare(String(b.patient.room_no||''),'en',{numeric:true})||mhName(a.patient).localeCompare(mhName(b.patient))||mhMedicine(a.order).localeCompare(mhMedicine(b.order)));
    const count=s=>shown.filter(r=>mhStatusGroup(r)===s).length;
    const summary={total:shown.length,given:count('Given'),withheld:count('Withheld'),other:count('Refused')+count('Missed')+count('Delayed'),notRecorded:count('Not recorded')};
    return {rows:shown,summary};
  }
  // Group rows: date → time → Guest
  function mhGroups(rows){
    const dates=[];let cur=null;
    rows.forEach(r=>{
      if(!cur||cur.date!==r.date){cur={date:r.date,slots:[],rows:[]};dates.push(cur)}
      cur.rows.push(r);
      let slot=cur.slots[cur.slots.length-1];if(!slot||slot.time!==r.time){slot={time:r.time,guests:[]};cur.slots.push(slot)}
      let g=slot.guests[slot.guests.length-1];if(!g||g.patient.id!==r.patient.id){g={patient:r.patient,rows:[]};slot.guests.push(g)}
      g.rows.push(r);
    });
    return dates;
  }
  const mhPeriodText=(from,to)=>from===to?`Date: ${formatDateIN(from)}`:`Period: ${formatDateIN(from)} to ${formatDateIN(to)}`;
  const MH_HEAD=['S.No.','Date','Time','Room','Guest','Guest ID','Medicine','Route','Status','Given at','Entry recorded','Entry','Nurse','Reason / Remarks'];
  function mhExportRows(rows,staffName){
    return rows.map((r,i)=>[i+1,formatDateIN(r.date),medicationTimeLabel(r.time)+(r.rescheduledFrom?` (rescheduled from ${medicationTimeLabel(r.rescheduledFrom)})`:''),
      mhRoom(r.patient).replace('Room ',''),mhName(r.patient),r.patient.patient_id||'',mhMedicine(r.order),r.order.route||'',mhStatusOf(r),
      r.log?.administered_at?mhTimeIN(r.log.administered_at)+(mhDayIndia(r.log.administered_at)!==r.date?` (${formatDateIN(mhDayIndia(r.log.administered_at))})`:''):'',
      r.log?(r.log.entry_recorded_at||r.log.created_at?fmt(r.log.entry_recorded_at||r.log.created_at):''):'',
      r.log?(r.log.late_entry?`Late (${r.log.entry_delay_minutes||0} min)`:'On time'):'',
      r.log?staffName(r.log.administered_by):'',mhReason(r.log)]);
  }
  function mhTitle(A,patients){
    const p=A.guestId?(patients||[]).find(x=>x.id===A.guestId):null;
    return p?`${mhName(p)} · ${p.patient_id||'No ID'} · ${mhRoom(p)}`:'All Guests';
  }
  async function downloadMedicationHistoryExcel({rows,summary,from,to,who,title,staffName}){
    const sheet=[['SAMARA HEALTH CARE LLP'],['Medication Administration Record'],[title],[mhPeriodText(from,to)],
      [`Downloaded on ${formatDateTimeIN(new Date().toISOString())} by ${who}`],[],
      ['Total doses',summary.total],['Given',summary.given],['Withheld',summary.withheld],['Refused / Missed / Delayed',summary.other],['Not recorded',summary.notRecorded],[],
      MH_HEAD,...mhExportRows(rows,staffName)];
    if(!rows.length)sheet.push(['','No doses in this period']);
    const base=`Samara_Medication_History_${from}_to_${to}_${freshFileStamp()}`;
    try{
      const X=await loadXlsxLibrary(),wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(sheet);
      ws['!cols']=[6,11,12,8,24,16,26,10,20,12,20,12,18,40].map(w=>({wch:w}));
      ws['!merges']=[0,1,2,3,4].map(r=>({s:{r,c:0},e:{r,c:MH_HEAD.length-1}}));
      X.utils.book_append_sheet(wb,ws,'Medication History');
      X.writeFile(wb,`${base}.xlsx`);return 'xlsx';
    }catch(e){
      console.warn(e);freshSaveBlob(new Blob(['﻿'+freshCsv(sheet)],{type:'text/csv;charset=utf-8'}),`${base}.csv`);return 'csv';
    }
  }
  function openMedicationHistoryPrint({rows,summary,from,to,who,title,staffName,mode}){
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const now=formatDateTimeIN(new Date().toISOString());
    const body=mhExportRows(rows,staffName).map(r=>`<tr>${r.map((x,i)=>`<td class="c${i}">${srEsc(x)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${MH_HEAD.length}" style="text-align:center;padding:10px">No doses in this period</td></tr>`;
    const box=(l,v,hi)=>`<div class="box${hi?' hi':''}"><span>${srEsc(l)}</span><strong>${srEsc(v)}</strong></div>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Samara_Medication_History_${srEsc(from)}_to_${srEsc(to)}</title><style>
      @page{size:A4 landscape;margin:10mm 8mm 12mm}*{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:9.5px;line-height:1.35;background:#fff}
      .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:10px}
      .logo{width:120px;max-height:58px;object-fit:contain}.mid{text-align:center;color:#741041;font-weight:700;font-size:13px}
      .org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:15px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:16px;margin:2px 0;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 8px}
      .sum{display:flex;gap:8px;margin:0 0 8px}.box{flex:1;border:1px solid #e7c3d4;border-radius:8px;padding:6px 9px;background:#fff7fb}
      .box span{display:block;color:#6d5963;font-size:8.5px;font-weight:700;text-transform:uppercase}.box strong{display:block;font-size:15px;color:#321d28}
      .box.hi{background:#b20b5d;border-color:#b20b5d}.box.hi span,.box.hi strong{color:#fff}
      table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}
      th{background:#f7dce8;color:#67123d;border:1px solid #dfb4c6;padding:5px 4px;text-align:left}
      td{border:1px solid #ead4dd;padding:4px;overflow-wrap:anywhere;vertical-align:top}tbody tr:nth-child(even) td{background:#fffafd}
      .c0{width:30px;text-align:center}.c1{width:62px}.c2{width:58px}.c3{width:42px}.c4{width:100px;font-weight:700}.c5{width:78px}.c6{width:120px}.c7{width:52px}.c8{width:76px;font-weight:700}.c9{width:52px}.c10{width:92px}.c11{width:52px}.c12{width:80px}
      .sign{display:flex;justify-content:space-between;margin-top:30px}.sign div{border-top:1px solid #6f5c65;padding-top:5px;width:28%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:14px;padding-top:5px;text-align:center;color:#6f5a64;font-size:8px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="mid">Nursing · Medication</div><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>Medication Administration Record</h1>
      <p class="meta">${srEsc(title)} · ${srEsc(mhPeriodText(from,to))}</p>
      <div class="sum">${box('Total doses',summary.total)}${box('Given',summary.given,true)}${box('Withheld',summary.withheld)}${box('Refused / Missed / Delayed',summary.other)}${box('Not recorded',summary.notRecorded)}</div>
      <table><thead><tr>${MH_HEAD.map((x,i)=>`<th class="c${i}">${srEsc(x)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <div class="sign"><div>Nurse</div><div>Nursing Manager</div><div>Treating Doctor</div></div>
      <div class="footer">Generated from Samara Care ERP on ${srEsc(now)} by ${srEsc(who)} · Computer-generated record</div>
      <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
    </body></html>`;
    const win=samaraPrintBar(window.open('','_blank'));
    if(!win){alert(`Please allow pop-ups to ${mode==='print'?'print':'save'} the Medication History.`);return false}
    win.document.open();win.document.write(html);win.document.close();return true;
  }
  async function downloadMedicationHistoryPdfFile({rows,summary,from,to,who,title,staffName}){
    const jsPDF=await loadAstPdfLibrary();
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    const plain=x=>String(x??'').replace(/[–—]/g,'-').replace(/[•]/g,'·').replace(/[^\x00-\xFF]/g,'');
    try{
      const blob=await fetch(new URL('assets/samara-logo.png',window.location.href).href).then(r=>{if(!r.ok)throw 0;return r.blob()});
      const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob)});
      const img=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=data});
      if(img){const h2=15,w2=Math.min(46,h2*img.width/img.height);doc.addImage(data,'PNG',10,7,w2,h2)}
    }catch(_){}
    doc.setTextColor(178,11,93);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('SAMARA HEALTH CARE LLP',W-10,13,{align:'right'});
    doc.setTextColor(109,89,99);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Compassion · Comfort · Dignity',W-10,18,{align:'right'});
    doc.setTextColor(116,16,65);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Nursing · Medication',W/2,16,{align:'center'});
    doc.setDrawColor(178,11,93);doc.setLineWidth(0.8);doc.line(10,24,W-10,24);
    doc.setTextColor(50,29,40);doc.setFontSize(13);doc.text('Medication Administration Record',W/2,31,{align:'center'});
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(123,102,112);doc.text(plain(`${title} · ${mhPeriodText(from,to)}`),W/2,36,{align:'center'});
    const boxes=[['Total doses',summary.total],['Given',summary.given,true],['Withheld',summary.withheld],['Refused / Missed / Delayed',summary.other],['Not recorded',summary.notRecorded]];
    const gap=4,bw=(W-20-gap*(boxes.length-1))/boxes.length,y=40;
    boxes.forEach(([l,x,hi],i)=>{const bx=10+i*(bw+gap);
      if(hi){doc.setFillColor(178,11,93);doc.setDrawColor(178,11,93)}else{doc.setFillColor(255,247,251);doc.setDrawColor(231,195,212)}
      doc.roundedRect(bx,y,bw,13,2,2,'FD');
      doc.setFont('helvetica','bold');doc.setFontSize(7);hi?doc.setTextColor(255,255,255):doc.setTextColor(109,89,99);doc.text(l.toUpperCase(),bx+3,y+4.5);
      doc.setFontSize(12);hi?doc.setTextColor(255,255,255):doc.setTextColor(50,29,40);doc.text(String(x),bx+3,y+10.5);
    });
    const body=mhExportRows(rows,staffName).map(r=>r.map(plain));
    doc.autoTable({theme:'grid',startY:y+17,margin:{left:8,right:8,bottom:15},head:[MH_HEAD],
      body:body.length?body:[[{content:'No doses in this period',colSpan:MH_HEAD.length,styles:{halign:'center'}}]],
      styles:{fontSize:7.5,cellPadding:1.5,lineColor:[234,212,221],textColor:[59,40,51],overflow:'linebreak'},
      headStyles:{fillColor:[247,220,232],textColor:[103,18,61],fontStyle:'bold'},alternateRowStyles:{fillColor:[255,250,253]},
      columnStyles:{0:{cellWidth:9,halign:'center'},1:{cellWidth:17},2:{cellWidth:17},3:{cellWidth:12},4:{cellWidth:28,fontStyle:'bold'},5:{cellWidth:22},6:{cellWidth:32},7:{cellWidth:14},8:{cellWidth:22,fontStyle:'bold'},9:{cellWidth:15},10:{cellWidth:25},11:{cellWidth:15},12:{cellWidth:22}}});
    let yy=(doc.lastAutoTable?.finalY||60)+22;if(yy>H-20){doc.addPage();yy=30}
    doc.setDrawColor(111,92,101);doc.setLineWidth(0.3);doc.setFontSize(8.5);doc.setTextColor(80,70,75);
    const sw=(W-20-20)/3;[['Nurse',0],['Nursing Manager',1],['Treating Doctor',2]].forEach(([l,k])=>{const x=10+k*(sw+10);doc.line(x,yy,x+sw,yy);doc.text(l,x+sw/2,yy+4.5,{align:'center'})});
    const pages=doc.internal.getNumberOfPages(),now=formatDateTimeIN(new Date().toISOString());
    for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7.5);doc.setTextColor(111,90,100);
      doc.text(plain(`Generated from Samara Care ERP on ${now} by ${who} · Computer-generated record · Page ${i} of ${pages}`),W/2,H-6,{align:'center'})}
    doc.save(`Samara_Medication_History_${from}_to_${to}_${freshFileStamp()}.pdf`);
  }

  const MH_CSS=`.mh .mh-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0 0 10px}.mh .mh-box{border:1px solid #e7c3d4;border-radius:12px;padding:8px 12px;background:#fff7fb;color:#321d28}.mh .mh-box small{display:block;font-size:11.5px;font-weight:800;text-transform:uppercase;opacity:.75}.mh .mh-box b{font-size:21px}.mh .mh-box.hi{background:#b20b5d;border-color:#b20b5d;color:#fff}.mh .mh-box.hi small{opacity:.95}
.mh .mh-day{border:1px solid #ecd3df;border-radius:12px;margin:0 0 8px;background:#fff;overflow:hidden}.mh .mh-day>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:9px 12px;background:#fbeef4;font-weight:800;color:#5d1039}.mh .mh-day>summary::-webkit-details-marker{display:none}.mh .mh-day>summary .mh-chev{transition:transform .15s}.mh .mh-day[open]>summary .mh-chev{transform:rotate(90deg)}.mh .mh-day>summary span.mh-n{font-weight:600;font-size:12.5px;color:#6d5963}
.mh .mh-slot{padding:6px 12px 2px;border-top:1px solid #f3e3ea}.mh .mh-slot-time{font-weight:800;color:#741041;font-size:13.5px;margin:2px 0 4px}.mh .mh-guest{margin:0 0 6px}.mh .mh-guest-head{font-size:13px;color:#321d28;margin:0 0 2px}.mh .mh-guest-head b{color:#b20b5d;font-size:14.5px;margin-right:6px}.mh .mh-guest-head small{color:#7b6670}
.mh .mh-line{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:5px 8px 5px 18px;border-radius:8px;cursor:pointer;font-size:13.5px}.mh .mh-line:hover{background:#fff4f9}.mh .mh-line .mh-med{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}.mh .mh-line .mh-right{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;text-align:right}
.mh .mh-chip{font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:10px;white-space:nowrap}.mh .mh-chip.ok{background:#e8f6ee;color:#0a7a42}.mh .mh-chip.warn{background:#fff4dd;color:#8a5a00}.mh .mh-chip.held{background:#fdecec;color:#b42318}.mh .mh-chip.miss{background:#f2ecef;color:#6d5963}.mh .mh-chip.late{background:#fff4dd;color:#8a5a00}.mh .mh-when{font-size:12px;color:#6d5963;white-space:nowrap}
@media(max-width:700px){.mh .mh-line{flex-direction:column;align-items:flex-start;padding-left:10px}.mh .mh-line .mh-right{justify-content:flex-start;text-align:left}}`;

  function MedicationHistory({profile,orders,patients,onBack}){
    const today=todayISOIndia();
    const [guestId,setGuestId]=React.useState(''),[search,setSearch]=React.useState('');
    const [period,setPeriod]=React.useState('today'),[date,setDate]=React.useState(today),[month,setMonth]=React.useState(today.slice(0,7)),[from,setFrom]=React.useState(''),[to,setTo]=React.useState('');
    const [status,setStatus]=React.useState('all'),[medicine,setMedicine]=React.useState('');
    const fa=useAppliedFilters({guestId,search,period,date,month,from,to,status,medicine});const A=fa.applied;
    const [rawFrom,rawTo]=srPeriodBounds(A);
    const pFrom=rawFrom<MH_START?MH_START:rawFrom,pTo=rawTo<MH_START?MH_START:(rawTo>today?today:rawTo);
    const [logs,setLogs]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(''),[reloadKey,setReloadKey]=React.useState(0);
    const [staff,setStaff]=React.useState({}),[detail,setDetail]=React.useState(null);
    React.useEffect(()=>{
      let live=true;setLogs(null);setError('');
      // the day before too: a dose rescheduled past midnight belongs to the next day
      freshFetchAll('medication_administrations','*','id',q=>q.gte('scheduled_date',addDaysISODate(pFrom,-1)).lte('scheduled_date',pTo))
        .then(rows=>{if(live)setLogs(rows)}).catch(e=>{if(live){setLogs([]);setError(e.message||'Could not load the medication records.')}});
      return()=>{live=false};
    },[pFrom,pTo,reloadKey]);
    React.useEffect(()=>{
      let live=true;
      client.from('profiles').select('*').then(r=>{if(!live||r.error)return;const m={};(r.data||[]).forEach(x=>{if(x.id)m[x.id]=x;if(x.auth_user_id)m[x.auth_user_id]=x});setStaff(m)});
      return()=>{live=false};
    },[]);
    const staffName=id=>{if(!id)return '';const s=staff[id];return s?(formalName(s)||s.full_name||s.login_id||''):''};
    const data=logs?buildMedicationHistory({orders,patients,logs,from:pFrom,to:pTo,A}):null;
    const groups=data?mhGroups(data.rows):[];
    const title=mhTitle(A,patients);
    const who=formalName(profile)||profile?.full_name||profile?.login_id||'Staff';
    const q=search.trim().toLowerCase();
    const guestOptions=[...(patients||[])]
      .filter(p=>q.length<3||`${mhName(p)} ${p.full_name||''} ${p.patient_id||''} ${p.room_no||''}`.toLowerCase().includes(q))
      .sort((a,b)=>(a.is_active===false)-(b.is_active===false)||String(a.room_no||'').localeCompare(String(b.room_no||''),'en',{numeric:true})||mhName(a).localeCompare(mhName(b)));
    async function download(kind){
      if(!data||busy||fa.dirty)return;setBusy(kind);
      const args={rows:data.rows,summary:data.summary,from:pFrom,to:pTo,who,title,staffName,mode:kind};
      try{
        if(kind==='excel'){const f=await downloadMedicationHistoryExcel(args);showSamaraActionToast('success','Medication History downloaded',f==='xlsx'?'Saved to the Excel file.':'Excel library unavailable — saved as a CSV file instead (opens in Excel).')}
        else if(kind==='pdf'){
          try{await downloadMedicationHistoryPdfFile(args);showSamaraActionToast('success','Medication History PDF downloaded','Saved to the PDF file.')}
          catch(e){console.warn(e);openMedicationHistoryPrint({...args,mode:'pdf'});showSamaraActionToast('warning','PDF opened for saving',`${e.message||'PDF library unavailable'} — choose "Save as PDF" in the window that opened.`)}
        }else openMedicationHistoryPrint(args);
        try{writeAuditEvent('Download Medication History','Medication',A.guestId||null,{format:kind,from:pFrom,to:pTo,doses:data.rows.length})}catch(_){}
      }catch(e){showSamaraActionToast('error','Download failed',e.message||'Please try again.')}
      finally{setBusy('')}
    }
    const oneDay=pFrom===pTo;
    const line=r=>{
      const tone=mhTone(r),log=r.log;
      return h('div',{key:r.k,className:'mh-line',role:'button',tabIndex:0,title:'Show full details',onClick:()=>setDetail(r),onKeyDown:e=>{if(e.key==='Enter')setDetail(r)}},
        h('div',{className:'mh-med'},mhMedicine(r.order),r.order.route&&h('small',{style:{color:'#7b6670'}},` · ${r.order.route}`),r.rescheduledFrom&&h('small',{style:{color:'#8a5a00',fontWeight:700}},` · rescheduled from ${medicationTimeLabel(r.rescheduledFrom)}`)),
        h('div',{className:'mh-right'},
          h('span',{className:`mh-chip ${tone}`},mhStatusOf(r)),
          log?.administered_at&&h('span',{className:'mh-when'},`${mhTimeIN(log.administered_at)}${staffName(log.administered_by)?` · ${staffName(log.administered_by)}`:''}`),
          log?.late_entry&&h('span',{className:'mh-chip late'},'Late entry'),
          mhReason(log)&&h('span',{className:'mh-when',title:mhReason(log)},'📝')));
    };
    return h('div',{className:'sr-compact mh'},h('style',null,SR_COMPACT_CSS+MH_CSS),h(Section,{title:'Medication History',subtitle:'Every scheduled dose and what was done — choose the Guest and period, then press Apply. Tap a dose for full details.',actions:onBack?h('button',{type:'button',className:'btn btn-secondary',onClick:onBack},'‹ Back'):null},
      h('div',{className:'sr-filters'},
        h('div',{className:'field'},h('label',null,'Search Guest'),h('input',{type:'text',value:search,placeholder:'Name / ID / room (3 letters)',onChange:e=>setSearch(e.target.value)})),
        h('div',{className:'field sr-wide'},h('label',null,'Guest'),h('select',{value:guestId,onChange:e=>setGuestId(e.target.value)},
          h('option',{value:''},q.length>=3?'All matching Guests':'All Guests'),
          guestOptions.map(p=>h('option',{key:p.id,value:p.id},`${mhName(p)} · ${p.patient_id||'No ID'} · ${p.is_active===false?'Discharged':mhRoom(p)}`)))),
        h('div',{className:'field'},h('label',null,'Date / Period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},SR_PERIODS.map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='date'&&h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:date,min:MH_START,max:today,onChange:e=>setDate(e.target.value)})),
        period==='monthpick'&&h('div',{className:'field'},h('label',null,'Month'),h('select',{value:month,onChange:e=>setMonth(e.target.value)},srMonthOptions().filter(([v])=>v>=MH_START.slice(0,7)).map(([v,l])=>h('option',{key:v,value:v},l)))),
        period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,min:MH_START,max:today,onChange:e=>setFrom(e.target.value)})),
        period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,min:MH_START,max:today,onChange:e=>setTo(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Status'),h('select',{value:status,onChange:e=>setStatus(e.target.value)},MH_STATUSES.map(([v,l])=>h('option',{key:v,value:v},l)))),
        h('div',{className:'field'},h('label',null,'Medicine'),h('input',{type:'text',value:medicine,placeholder:'e.g. Actrapid',onChange:e=>setMedicine(e.target.value)})),
        h(ApplyFilterButton,{dirty:fa.dirty,onApply:fa.apply})
      ),
      h('div',{className:'sr-bar'},
        h('span',{className:'small-note'},`${title} · ${mhPeriodText(pFrom,pTo)}`),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!data||!!busy||fa.dirty,onClick:()=>download('print')},busy==='print'?'Preparing…':'🖨 Print'),
        h('button',{type:'button',className:'btn btn-primary',disabled:!data||!!busy||fa.dirty,onClick:()=>download('pdf')},busy==='pdf'?'Preparing PDF…':'⤓ Download PDF'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!data||!!busy||fa.dirty,onClick:()=>download('excel')},busy==='excel'?'Preparing Excel…':'⤓ Download Excel'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>setReloadKey(k=>k+1)},'Refresh'),
        fa.dirty&&h('small',{className:'error-text',style:{alignSelf:'center'}},'Press Apply first.')
      ),
      error&&h('p',{role:'alert',className:'message error'},error),
      !data&&!error&&h('p',{className:'small-note'},'Loading medication history…'),
      data&&h('div',{className:'mh-sum'},
        [['Total doses',data.summary.total],['Given',data.summary.given,true],['Withheld',data.summary.withheld],['Refused / Missed / Delayed',data.summary.other],['Not recorded',data.summary.notRecorded]]
          .map(([l,v,hi])=>h('div',{key:l,className:`mh-box${hi?' hi':''}`},h('small',null,l),h('b',null,v)))),
      data&&!data.rows.length&&h('div',{className:'message'},'No doses match this filter.'),
      groups.map(day=>{
        const given=day.rows.filter(r=>mhStatusGroup(r)==='Given').length,nr=day.rows.filter(r=>!r.log).length,ex=day.rows.length-given-nr;
        return h('details',{key:`${day.date}-${oneDay}`,className:'mh-day',open:oneDay||groups.length===1},
          h('summary',null,h('span',{className:'mh-chev','aria-hidden':'true'},'›'),formatDateWithDayIN(day.date),
            h('span',{className:'mh-n'},`${day.rows.length} doses · ${given} given${ex?` · ${ex} withheld / not given`:''}${nr?` · ${nr} not recorded`:''}`)),
          day.slots.map(slot=>h('div',{key:slot.time,className:'mh-slot'},
            h('div',{className:'mh-slot-time'},medicationTimeLabel(slot.time)),
            slot.guests.map(g=>h('div',{key:g.patient.id||'x',className:'mh-guest'},
              h('div',{className:'mh-guest-head'},h('b',null,mhRoom(g.patient).replace('Room ','')),mhName(g.patient),h('small',null,` · ${g.patient.patient_id||'No ID'}`)),
              g.rows.map(line))))));
      }),
      detail&&h(RowDetailModal,{title:`${mhMedicine(detail.order)} · ${medicationTimeLabel(detail.time)}`,subtitle:`${mhName(detail.patient)} · ${detail.patient.patient_id||'No ID'} · ${mhRoom(detail.patient)}`,onClose:()=>setDetail(null),
        fields:[['Scheduled',`${formatDateWithDayIN(detail.date)} · ${medicationTimeLabel(detail.time)}${detail.rescheduledFrom?` (rescheduled from ${medicationTimeLabel(detail.rescheduledFrom)})`:''}`],
          ['Status',mhStatusOf(detail)],['Route',detail.order.route],['Frequency',detail.order.frequency],['Food',detail.order.food_instruction],
          ['Special instruction',detail.order.special_instruction||detail.order.special_instructions],
          ['Actually given at',detail.log?.administered_at?fmt(detail.log.administered_at):''],
          ['Entry recorded at',detail.log?(detail.log.entry_recorded_at||detail.log.created_at?fmt(detail.log.entry_recorded_at||detail.log.created_at):''):''],
          ['Recorded by',detail.log?staffName(detail.log.administered_by):''],
          ['Late entry',detail.log?.late_entry?`${detail.log.entry_delay_minutes||0} min late · ${detail.log.late_entry_reason||''}${detail.log.late_entry_justification?` — ${detail.log.late_entry_justification}`:''}`:''],
          ['Withhold reason',detail.log?.withhold_reason],['Reading',detail.log?.withhold_reading],
          ['Doctor informed',detail.log?.doctor_informed_name?`${detail.log.doctor_informed_name} · ${detail.log.doctor_informed_via||''}${detail.log.doctor_informed_at?` · ${fmt(detail.log.doctor_informed_at)}`:''}`:''],
          ["Doctor's instruction",detail.log?.doctor_instruction?`${detail.log.doctor_instruction}${detail.log.doctor_instruction_notes?` — ${detail.log.doctor_instruction_notes}`:''}`:''],
          ['Rescheduled to',detail.log?.rescheduled_time?medicationTimeLabel(detail.log.rescheduled_time):''],
          ['Reschedule reason',detail.log?.reschedule_reason],
          ['Remarks',detail.log?.remarks],
          ['Note',!detail.log?'No administration entry was made for this scheduled dose.':'']]})
    ));
  }
