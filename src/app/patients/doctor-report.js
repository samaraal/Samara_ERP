  // ---------------------------------------------------------------------------------------------
  // 2.18.129 Patient card → "Reports": one button opening
  //   1. Daily Report (for family)  — the existing Daily Intelligent Patient Report, unchanged
  //   2. Report for Doctors         — Doctor's Daily Clinical Report (2.18.127)
  //   3. Discharge Summary          — existing popup (after the final discharge)
  // Both daily reports are built by the Edge Function "daily-patient-report":
  //   family: generate_only / manual (unchanged modes) · doctor: doctor_generate_only / doctor_send
  // Each report popup offers Print / Save PDF, WhatsApp API (Admin, Manager) and existing WhatsApp.
  // ---------------------------------------------------------------------------------------------
  async function callDailyReportFunction(body){
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/daily-patient-report`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
      body:JSON.stringify(body)
    });
    const result=await response.json().catch(()=>({ok:false,error:`The report service did not answer (${response.status}).`}));
    if(!response.ok||result?.ok===false||!result?.report_url)throw new Error(result?.error||`Report failed (${response.status})`);
    return result;
  }

  // kind: 'family' | 'doctor'
  function PatientReportPdfDialog({kind,patient,profile,onClose}){
    const doctor=kind==='doctor';
    const canSend=['Admin','Manager'].includes(profile?.role);
    const todayIso=(()=>{try{return todayISOIndia()}catch(_e){return new Date().toISOString().slice(0,10)}})();
    const [reportDate,setReportDate]=React.useState(todayIso);
    const [toName,setToName]=React.useState(doctor?(patient?.treating_doctor||patient?.referring_doctor||''):(patient?.attendant_name||''));
    const [toMobile,setToMobile]=React.useState(doctor?(patient?.doctor_phone||''):(patient?.attendant_phone||''));
    const [busy,setBusy]=React.useState('');
    const [note,setNote]=React.useState(null);
    const [prepared,setPrepared]=React.useState(null);
    const [pdfLink,setPdfLink]=React.useState(null); // 2.18.136 {url,name}: opened by the user's own click (no blocked pop-up)
    React.useEffect(()=>{let live=true;
      client.from('patient_family_communication_preferences').select('recipient_name,recipient_mobile,doctor_recipient_name,doctor_recipient_mobile').eq('patient_id',patient.id).maybeSingle()
        .then(({data})=>{if(!live||!data)return;
          const n=doctor?data.doctor_recipient_name:data.recipient_name,m=doctor?data.doctor_recipient_mobile:data.recipient_mobile;
          if(n)setToName(n);if(m)setToMobile(m)}).catch(()=>{});
      return ()=>{live=false};},[patient?.id,kind]);
    React.useEffect(()=>()=>{if(prepared?.url)URL.revokeObjectURL(prepared.url)},[prepared]);
    React.useEffect(()=>{setPrepared(null);setPdfLink(null)},[reportDate]);
    // 2.18.131: start preparing the doctor's PDF as soon as the popup opens (or the date changes),
    // so Print / Save PDF is usually ready by the time it is pressed.
    const warm=React.useRef(null);
    React.useEffect(()=>{if(!doctor)return;const p=callDailyReportFunction({mode:'doctor_generate_only',patient_id:patient.id,report_date:reportDate});p.catch(()=>{});warm.current={date:reportDate,p};},[patient?.id,reportDate,doctor]);
    // the early PDF uses the doctor saved for this Guest; if the name is edited here, a fresh PDF is made
    const nameEdited=React.useRef(false);
    const getPdf=()=>{const w=warm.current;if(doctor&&w&&w.date===reportDate&&!nameEdited.current)return w.p.catch(()=>callDailyReportFunction(genBody()));return callDailyReportFunction(genBody())};
    const guest=formalName(patient)||patient?.full_name||'Guest';
    const cleanName=String(toName||'').trim();
    const toLabel=doctor?(cleanName?(/^dr(\.|\s)/i.test(cleanName)?cleanName:`Dr. ${cleanName}`):'Doctor'):(cleanName||'Family Member');
    const number=normalizeWhatsAppRecipient(toMobile||'');
    const title=doctor?'Report for Doctors — Daily Clinical Report':'Daily Report (for family)';
    const reportName=doctor?'Daily Clinical Report':'Daily Intelligent Patient Report';
    const who=doctor?'doctor':'family';
    const canShareFiles=(()=>{try{return Boolean(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.pdf',{type:'application/pdf'})]}))}catch(_e){return false}})();
    const messageText=()=>doctor
      ?`Dear ${toLabel},\n\nPlease find attached the Daily Clinical Report of ${guest} dated ${formatDateIN(reportDate)} from Samara Assisted Living.\n\nYou may reply here with any instructions.`
      :`Dear ${toLabel},\n\nPlease find attached the Daily Report of ${guest} dated ${formatDateIN(reportDate)} from Samara Assisted Living.`;
    const genBody=()=>doctor?{mode:'doctor_generate_only',patient_id:patient.id,report_date:reportDate,doctor_name:cleanName||undefined}:{mode:'generate_only',patient_id:patient.id,report_date:reportDate};
    async function logManual(route){
      try{await client.from('patient_communications').insert({patient_id:patient.id,communication_type:doctor?'Doctor Daily Clinical Report':'Daily Intelligent Patient Report',method:'WhatsApp (existing)',recipient_type:doctor?'Doctor':'Relative',recipient_name:toLabel,recipient_number:number||null,report_date:reportDate,status:route,message_preview:`${reportName} PDF shared through existing WhatsApp`,created_at:new Date().toISOString()})}catch(_e){}
    }
    // 2.18.136: the PDF is prepared first and then opened by a real link the user clicks —
    // browsers block a new tab opened after waiting for the server, which left an empty tab.
    async function openPdf(){
      setBusy('open');setNote(null);setPdfLink(null);
      try{
        const r=await getPdf();
        setPdfLink({url:r.report_url,name:r.file_name||`${guest} - ${reportName}.pdf`});
        setNote({type:'success',text:`${reportName} is ready. Tap "Open PDF" to view / print it, or "Download PDF" to save it.${doctor&&!r.ai_observations?' Clinical Observations were not available this time; all records are in the report.':''}`});
      }catch(error){setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function downloadReady(){
      if(!pdfLink)return;
      try{const blob=await fetch(pdfLink.url).then(res=>{if(!res.ok)throw new Error('The PDF could not be downloaded.');return res.blob()});
        const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=pdfLink.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)}
      catch(error){setNote({type:'error',text:error.message||String(error)})}
    }
    async function sendApi(){
      if(!number)return setNote({type:'error',text:`Enter the ${who}'s 10-digit WhatsApp number.`});
      if(!confirm(`Send the ${reportName} of ${guest} (${formatDateIN(reportDate)}) to ${toLabel} on ${toMobile}?`))return;
      setBusy('api');setNote(null);
      try{
        const r=await callDailyReportFunction(doctor
          ?{mode:'doctor_send',patient_id:patient.id,report_date:reportDate,doctor_name:cleanName||undefined,recipient_mobile:number}
          :{mode:'manual',patient_id:patient.id,report_date:reportDate,recipient_mobile:number,recipient_name:toLabel});
        setNote({type:'success',text:`${reportName} PDF accepted by Meta for ${toLabel} (${toMobile}). It is recorded in WhatsApp Inbox.${doctor&&!r.ai_observations?' (Sent without Clinical Observations this time.)':''}`});
      }catch(error){setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function preparePdf(){
      setBusy('prepare');setNote(null);
      try{
        const r=await getPdf();
        const blob=await fetch(r.report_url).then(res=>{if(!res.ok)throw new Error('The PDF could not be downloaded.');return res.blob()});
        const file=new File([blob],r.file_name||`${guest} - ${reportName}.pdf`,{type:'application/pdf'});
        setPrepared({file,url:URL.createObjectURL(blob),name:file.name});
        setNote({type:'success',text:canShareFiles?`PDF ready. Tap "Share PDF to WhatsApp" and choose the ${who}'s chat.`:`PDF ready. Download it, then open the ${who}'s WhatsApp chat and attach the PDF.`});
      }catch(error){setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function sharePdf(){
      if(!prepared)return;
      try{await navigator.share({files:[prepared.file],title:prepared.name,text:messageText()});await logManual('Shared');setNote({type:'success',text:`Shared. Check that it reached the ${who}'s chat.`})}
      catch(error){if(error?.name!=='AbortError')setNote({type:'error',text:`Sharing failed: ${error.message||error}. Use Download PDF instead.`})}
    }
    function downloadPdf(){
      if(!prepared)return;
      const a=document.createElement('a');a.href=prepared.url;a.download=prepared.name;document.body.appendChild(a);a.click();a.remove();
    }
    function openChat(){
      if(!number)return setNote({type:'error',text:`Enter the ${who}'s 10-digit WhatsApp number.`});
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(brandWhatsAppText(messageText()))}`,'_blank','noopener');
      logManual('Opened');
    }
    return h('div',{className:'modal-backdrop patient-report-backdrop',style:{zIndex:12000},onClick:e=>{if(e.target===e.currentTarget)onClose()}},h('div',{className:'card modal patient-report-modal',style:{maxWidth:'640px'}},
      h('style',null,`.patient-report-modal .pr-block{border-top:1px solid #f0dbe5;padding-top:12px;margin-top:12px}
.patient-report-modal .pr-block h4{margin:0 0 4px;color:#7a0c43;font-size:14px}
.patient-report-modal .pr-block p{margin:0 0 8px;color:#6b5560;font-size:13px}
.patient-report-modal .pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.patient-report-modal .actions{flex-wrap:wrap}`),
      h('div',{className:'panel-head'},
        h('div',null,h('h3',null,title),h('small',null,`${guest} · ${patient?.patient_id||''}`)),
        h('button',{type:'button',className:'close',onClick:onClose},'×')),
      h('p',{className:'small-note',style:{marginTop:0}},doctor
        ?"For the treating doctor only: up to 7-day trends of vitals, medicines, physiotherapy and nursing, with AI clinical observations (observations only, no advice). The family's Daily Report is separate and unchanged."
        :'The same Daily Intelligent Patient Report the family receives every day (2 pages).'),
      h('div',{className:'pr-grid'},
        h('div',{className:'field'},h('label',null,'Report date'),h('input',{type:'date',value:reportDate,min:'2026-08-27',max:todayIso,onChange:e=>setReportDate(e.target.value||todayIso)})),
        h('div',{className:'field'},h('label',null,doctor?'Doctor':'Family member'),h('input',{value:toName,placeholder:doctor?'Treating doctor':'Name',onChange:e=>{nameEdited.current=true;setToName(e.target.value)}})),
        h('div',{className:'field'},h('label',null,'WhatsApp number'),h('input',{value:toMobile,inputMode:'tel',placeholder:'10-digit mobile',onChange:e=>setToMobile(e.target.value)}))),
      h('div',{className:'actions',style:{marginTop:'10px'}},
        h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:openPdf},busy==='open'?(doctor?'Preparing PDF (up to 1 min)…':'Preparing PDF…'):pdfLink?'Prepare again':'Print / Save PDF'),
        pdfLink&&h('a',{className:'btn btn-primary',href:pdfLink.url,target:'_blank',rel:'noopener'},'📄 Open PDF'),
        pdfLink&&h('button',{type:'button',className:'btn btn-secondary',onClick:downloadReady},'⬇ Download PDF')),
      canSend&&h('div',{className:'pr-block'},
        h('h4',null,'WhatsApp API (PDF attached)'),
        h('p',null,`Sends the PDF from the Samara WhatsApp number to the ${who}. It is recorded in WhatsApp Inbox${doctor?"; the doctor's reply comes there too":''}.`),
        h('button',{type:'button',className:'btn btn-whatsapp',disabled:!!busy||!number,onClick:sendApi},busy==='api'?'Preparing & sending PDF…':`Send PDF to ${doctor?'Doctor':'Family'} · WhatsApp API`)),
      h('div',{className:'pr-block'},
        h('h4',null,'Existing WhatsApp'),
        h('p',null,canShareFiles?`Prepare the PDF, then share it straight into the ${who}'s WhatsApp chat from this phone.`:`Prepare the PDF, download it, then open the ${who}'s chat in WhatsApp Web and attach it.`),
        h('div',{className:'actions'},
          !prepared&&h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:preparePdf},busy==='prepare'?'Preparing PDF…':'Prepare PDF'),
          prepared&&canShareFiles&&h('button',{type:'button',className:'btn btn-whatsapp',onClick:sharePdf},'Share PDF to WhatsApp'),
          prepared&&h('button',{type:'button',className:'btn btn-secondary',onClick:downloadPdf},'Download PDF'),
          prepared&&h('button',{type:'button',className:'btn btn-secondary',disabled:!number,onClick:openChat},`Open ${who}'s WhatsApp chat`))),
      note&&h('div',{className:`message ${note.type}`,style:{marginTop:'12px'}},note.text),
      h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))
    ));
  }

  // The "Reports" chooser in the Patient card.
  function PatientReportsMenu({patient,discharged,onPick,onClose}){
    const item=(n,key,label,sub,enabled=true)=>h('button',{type:'button',className:`patient-reports-item${enabled?'':' disabled'}`,disabled:!enabled,onClick:()=>onPick(key)},
      h('span',{className:'patient-reports-no'},n),h('span',null,h('strong',null,label),h('small',null,sub)));
    return h('div',{className:'modal-backdrop patient-reports-backdrop',style:{zIndex:11990},onClick:e=>{if(e.target===e.currentTarget)onClose()}},h('div',{className:'card modal patient-reports-menu',style:{maxWidth:'480px'}},
      h('style',null,`.patient-reports-menu .patient-reports-list{display:grid;gap:10px;margin-top:6px}
.patient-reports-menu .patient-reports-item{display:flex;gap:12px;align-items:center;text-align:left;width:100%;padding:14px 16px;border:1px solid #f0c9da;border-radius:14px;background:linear-gradient(135deg,#fff7fa,#fde7f0);cursor:pointer;font:inherit}
.patient-reports-menu .patient-reports-item:hover{border-color:#b8055a;box-shadow:0 2px 10px rgba(184,5,90,.12)}
.patient-reports-menu .patient-reports-item.disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.patient-reports-menu .patient-reports-item strong{display:block;color:#7a0c43;font-size:15px}
.patient-reports-menu .patient-reports-item small{display:block;color:#7a5e6d;font-size:12px;margin-top:2px}
.patient-reports-menu .patient-reports-no{flex:0 0 30px;height:30px;border-radius:50%;background:#b8055a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}`),
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Reports'),h('small',null,formalName(patient)||patient?.full_name||'')),h('button',{type:'button',className:'close',onClick:onClose},'×')),
      h('div',{className:'patient-reports-list'},
        item(1,'family','Daily Report (for family)','The daily Intelligent Patient Report · Print / WhatsApp'),
        item(2,'doctor','Report for Doctors','Daily Clinical Report with AI clinical observations · Print / WhatsApp'),
        item(3,'discharge','Discharge Summary',discharged?'Whole stay summary · Print / WhatsApp':'Available after the final discharge',discharged)),
      h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))
    ));
  }
