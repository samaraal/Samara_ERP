  // ---------------------------------------------------------------------------------------------
  // 2.18.128 Doctor's Daily Clinical Report — Patient card popup.
  // Built by the Edge Function "daily-patient-report" (modes doctor_generate_only / doctor_send).
  // The family's Daily Intelligent Report is NOT touched by anything here.
  //   * Print / Save PDF (Admin, Manager, Nurse)
  //   * Send PDF by WhatsApp API to the doctor (Admin, Manager)
  //   * Existing WhatsApp: share the PDF into the doctor's chat (phones) or download + open the chat
  // ---------------------------------------------------------------------------------------------
  async function callDoctorReport(body){
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/daily-patient-report`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
      body:JSON.stringify(body)
    });
    const result=await response.json().catch(()=>({ok:false,error:`The report service did not answer (${response.status}).`}));
    if(!response.ok||result?.ok===false||!result?.report_url)throw new Error(result?.error||`Doctor's report failed (${response.status})`);
    return result;
  }

  function DoctorReportDialog({patient,profile,onClose}){
    const canSend=['Admin','Manager'].includes(profile?.role);
    const todayIso=(()=>{try{return todayISOIndia()}catch(_e){return new Date().toISOString().slice(0,10)}})();
    const [reportDate,setReportDate]=React.useState(todayIso);
    const [doctorName,setDoctorName]=React.useState(patient?.treating_doctor||patient?.referring_doctor||'');
    const [doctorMobile,setDoctorMobile]=React.useState(patient?.doctor_phone||'');
    const [busy,setBusy]=React.useState('');
    const [note,setNote]=React.useState(null);
    const [prepared,setPrepared]=React.useState(null);
    React.useEffect(()=>{let live=true;
      client.from('patient_family_communication_preferences').select('doctor_recipient_name,doctor_recipient_mobile').eq('patient_id',patient.id).maybeSingle()
        .then(({data})=>{if(!live||!data)return;if(data.doctor_recipient_name)setDoctorName(data.doctor_recipient_name);if(data.doctor_recipient_mobile)setDoctorMobile(data.doctor_recipient_mobile)}).catch(()=>{});
      return ()=>{live=false};},[patient?.id]);
    React.useEffect(()=>()=>{if(prepared?.url)URL.revokeObjectURL(prepared.url)},[prepared]);
    React.useEffect(()=>{setPrepared(null)},[reportDate]);
    const guest=formalName(patient)||patient?.full_name||'Guest';
    const doctorLabel=String(doctorName||'').trim()?(/^dr(\.|\s)/i.test(String(doctorName).trim())?String(doctorName).trim():`Dr. ${String(doctorName).trim()}`):'Doctor';
    const number=normalizeWhatsAppRecipient(doctorMobile||'');
    const canShareFiles=(()=>{try{return Boolean(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.pdf',{type:'application/pdf'})]}))}catch(_e){return false}})();
    const messageText=()=>`Dear ${doctorLabel},\n\nPlease find attached the Daily Clinical Report of ${guest} dated ${formatDateIN(reportDate)} from Samara Assisted Living.\n\nYou may reply here with any instructions.`;
    const body=mode=>({mode,patient_id:patient.id,report_date:reportDate,doctor_name:String(doctorName||'').trim()||undefined});
    async function logManual(route){
      try{await client.from('patient_communications').insert({patient_id:patient.id,communication_type:'Doctor Daily Clinical Report',method:'WhatsApp (existing)',recipient_type:'Doctor',recipient_name:doctorLabel,recipient_number:number||null,report_date:reportDate,status:route,message_preview:'Daily Clinical Report PDF shared through existing WhatsApp',created_at:new Date().toISOString()})}catch(_e){}
    }
    async function openPdf(){
      const tab=window.open('about:blank','_blank');
      setBusy('open');setNote(null);
      try{
        const r=await callDoctorReport(body('doctor_generate_only'));
        if(tab)tab.location.href=r.report_url;else window.open(r.report_url,'_blank','noopener');
        setNote({type:'success',text:`Daily Clinical Report opened in a new tab. Use Print / Save there.${r.ai_observations?'':' Clinical Observations were not available this time; all records are in the report.'}`});
      }catch(error){if(tab)tab.close();setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function sendApi(){
      if(!number)return setNote({type:'error',text:"Enter the doctor's 10-digit WhatsApp number."});
      if(!confirm(`Send the Daily Clinical Report of ${guest} (${formatDateIN(reportDate)}) to ${doctorLabel} on ${doctorMobile}?`))return;
      setBusy('api');setNote(null);
      try{
        const r=await callDoctorReport({...body('doctor_send'),recipient_mobile:number});
        setNote({type:'success',text:`Daily Clinical Report PDF accepted by Meta for ${doctorLabel} (${doctorMobile}). It is recorded in WhatsApp Inbox.${r.ai_observations?'':' (Sent without Clinical Observations this time.)'}`});
      }catch(error){setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function preparePdf(){
      setBusy('prepare');setNote(null);
      try{
        const r=await callDoctorReport(body('doctor_generate_only'));
        const blob=await fetch(r.report_url).then(res=>{if(!res.ok)throw new Error('The PDF could not be downloaded.');return res.blob()});
        const file=new File([blob],r.file_name||`${guest} - Daily Clinical Report.pdf`,{type:'application/pdf'});
        setPrepared({file,url:URL.createObjectURL(blob),name:file.name});
        setNote({type:'success',text:canShareFiles?"PDF ready. Tap \"Share PDF to WhatsApp\" and choose the doctor's chat.":"PDF ready. Download it, then open the doctor's WhatsApp chat and attach the PDF."});
      }catch(error){setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function sharePdf(){
      if(!prepared)return;
      try{await navigator.share({files:[prepared.file],title:prepared.name,text:messageText()});await logManual('Shared');setNote({type:'success',text:"Shared. Check that it reached the doctor's chat."})}
      catch(error){if(error?.name!=='AbortError')setNote({type:'error',text:`Sharing failed: ${error.message||error}. Use Download PDF instead.`})}
    }
    function downloadPdf(){
      if(!prepared)return;
      const a=document.createElement('a');a.href=prepared.url;a.download=prepared.name;document.body.appendChild(a);a.click();a.remove();
    }
    function openChat(){
      if(!number)return setNote({type:'error',text:"Enter the doctor's 10-digit WhatsApp number."});
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(brandWhatsAppText(messageText()))}`,'_blank','noopener');
      logManual('Opened');
    }
    return h('div',{className:'modal-backdrop doctor-report-backdrop',style:{zIndex:12000},onClick:e=>{if(e.target===e.currentTarget)onClose()}},h('div',{className:'card modal doctor-report-modal',style:{maxWidth:'640px'}},
      h('style',null,`.doctor-report-modal .dr-block{border-top:1px solid #f0dbe5;padding-top:12px;margin-top:12px}
.doctor-report-modal .dr-block h4{margin:0 0 4px;color:#7a0c43;font-size:14px}
.doctor-report-modal .dr-block p{margin:0 0 8px;color:#6b5560;font-size:13px}
.doctor-report-modal .dr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.doctor-report-modal .actions{flex-wrap:wrap}`),
      h('div',{className:'panel-head'},
        h('div',null,h('h3',null,"Doctor's Daily Clinical Report"),h('small',null,`${guest} · ${patient?.patient_id||''}`)),
        h('button',{type:'button',className:'close',onClick:onClose},'×')),
      h('p',{className:'small-note',style:{marginTop:0}},"For the treating doctor only: up to 7-day trends of vitals, medicines, physiotherapy and nursing, with AI clinical observations (observations only, no advice). The family's Daily Report is separate and unchanged."),
      h('div',{className:'dr-grid'},
        h('div',{className:'field'},h('label',null,'Report date'),h('input',{type:'date',value:reportDate,min:'2026-08-27',max:todayIso,onChange:e=>setReportDate(e.target.value||todayIso)})),
        h('div',{className:'field'},h('label',null,'Doctor'),h('input',{value:doctorName,placeholder:'Treating doctor',onChange:e=>setDoctorName(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Doctor WhatsApp'),h('input',{value:doctorMobile,inputMode:'tel',placeholder:'10-digit mobile',onChange:e=>setDoctorMobile(e.target.value)}))),
      h('div',{className:'actions',style:{marginTop:'10px'}},
        h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:openPdf},busy==='open'?'Preparing PDF (up to 1 min)…':'Print / Save PDF')),
      canSend&&h('div',{className:'dr-block'},
        h('h4',null,'WhatsApp API (PDF attached)'),
        h('p',null,"Sends the PDF from the Samara WhatsApp number to the doctor. It is recorded in WhatsApp Inbox; the doctor's reply comes there too."),
        h('button',{type:'button',className:'btn btn-whatsapp',disabled:!!busy||!number,onClick:sendApi},busy==='api'?'Preparing & sending PDF…':'Send PDF to Doctor · WhatsApp API')),
      h('div',{className:'dr-block'},
        h('h4',null,'Existing WhatsApp'),
        h('p',null,canShareFiles?"Prepare the PDF, then share it straight into the doctor's WhatsApp chat from this phone.":"Prepare the PDF, download it, then open the doctor's chat in WhatsApp Web and attach it."),
        h('div',{className:'actions'},
          !prepared&&h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:preparePdf},busy==='prepare'?'Preparing PDF…':'Prepare PDF'),
          prepared&&canShareFiles&&h('button',{type:'button',className:'btn btn-whatsapp',onClick:sharePdf},'Share PDF to WhatsApp'),
          prepared&&h('button',{type:'button',className:'btn btn-secondary',onClick:downloadPdf},'Download PDF'),
          prepared&&h('button',{type:'button',className:'btn btn-secondary',disabled:!number,onClick:openChat},"Open doctor's WhatsApp chat"))),
      note&&h('div',{className:`message ${note.type}`,style:{marginTop:'12px'}},note.text),
      h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))
    ));
  }
