  // ---------------------------------------------------------------------------------------------
  // 2.18.129 Patient card → "Reports": one button opening
  //   1. Daily Report (for family)  — the existing Daily Intelligent Patient Report, unchanged
  //   2. Daily Clinical Report      — 2.18.142 (history, automatic daily, WhatsApp)
  //   3. Weekly Clinical Report     — 2.18.142 (saved weekly / at discharge, manual WhatsApp)
  //   4. Discharge Summary          — existing popup (after the final discharge)
  //   (the earlier 'Report for Doctors' dialog stays reachable until SQL 299 is installed)
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

  // kind: 'family' | 'doctor' | 'clinical_daily' | 'clinical_weekly'
  function PatientReportPdfDialog(props){
    if(props.kind==='clinical_daily'||props.kind==='clinical_weekly')return h(ClinicalReportsPanel,props);
    return h(FamilyDoctorReportDialog,props);
  }
  function FamilyDoctorReportDialog({kind,patient,profile,onClose}){
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
      ?`Dear ${toLabel},\n\nPlease find attached the Daily Clinical Report of ${guest} dated ${formatDateIN(reportDate)} from Samara Assisted Living.\n\nWe would be grateful for any instructions you may wish to give; kindly reply here at your convenience. Thank you for your guidance.`
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


  // ---------------------------------------------------------------------------------------------
  // 2.18.142 Daily & Weekly Clinical Reports (for the treating doctor)
  //   Daily  — made automatically at the daily cutoff for the previous 24 h; sent on WhatsApp automatically
  //            only when Admin has switched automatic sending ON and verified the doctor's number.
  //   Weekly — saved automatically after each 7-day period from admission and at a confirmed discharge;
  //            sent on WhatsApp manually only, after confirming the recipient.
  // Every PDF is kept as a dated snapshot; a correction is a new version. Data comes from the Edge Function
  // "daily-patient-report" (modes clinical_*), which checks the user's role.
  // ---------------------------------------------------------------------------------------------
  async function callClinical(body){
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
    const r=await fetch(`${cfg.supabaseUrl}/functions/v1/daily-patient-report`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({ok:false,error:`The report service did not answer (${r.status}).`}));
    if(j?.not_installed)return j;
    if(!r.ok||j?.ok===false)throw new Error(j?.error||`Request failed (${r.status})`);
    return j;
  }
  const crDT=v=>{try{return formatDateTimeIN(v)}catch(_e){return String(v||'')}};
  const crPeriodEnd=v=>{const d=new Date(v);const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);return p==='00:00'?`${formatDateIN(new Date(d.getTime()-60000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))}, 11:59 PM`:crDT(v)};
  const crStatus={saved:['Saved','#5f4c57','#f3edf0'],held:['Held for review','#9a5300','#fff1dc'],sending:['Sending','#2a5fa8','#e8eefb'],sent:['Sent','#08703f','#e3f4ea'],failed:['Not sent — failed','#b0101f','#fde6e8']};
  const to24=(t,ap)=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return '';let hh=Number(m[1])%12;if(ap==='PM')hh+=12;if(Number(m[2])>59||Number(m[1])>12||Number(m[1])<1)return '';return `${String(hh).padStart(2,'0')}:${m[2]}`};
  const to12=t=>{const m=String(t||'').match(/^(\d{2}):(\d{2})/);if(!m)return ['08:00','PM'];const hh=Number(m[1]);return [`${String(((hh+11)%12)+1).padStart(2,'0')}:${m[2]}`,hh<12?'AM':'PM']};
  function ClinicalReportsPanel({kind,patient,profile,onClose}){
    const daily=kind==='clinical_daily',kindKey=daily?'daily':'weekly';
    const [state,setState]=React.useState({loading:true,error:'',data:null});
    const [busy,setBusy]=React.useState('');const [note,setNote]=React.useState(null);
    const [confirmSend,setConfirmSend]=React.useState(null);const [confirmed,setConfirmed]=React.useState(false);
    const [settingsForm,setSettingsForm]=React.useState(null);
    const [showOld,setShowOld]=React.useState(false);
    // Never call the clinical_* actions before the updated server function is live (an older function would
    // treat them as a family-report request): SQL 299 must exist and the new function must have reported in.
    const load=React.useCallback(async()=>{setState(s=>({...s,loading:true,error:''}));try{
      const chk=await client.from('clinical_report_settings').select('id,function_version').eq('id','global').maybeSingle();
      if(chk.error||!chk.data){setState({loading:false,error:'',data:{not_installed:true}});return}
      if(!chk.data.function_version){setState({loading:false,error:'',data:{not_installed:true,function_pending:true}});return}
      const d=await callClinical({mode:'clinical_list',patient_id:patient.id});setState({loading:false,error:'',data:d})}catch(e){setState({loading:false,error:e.message||String(e),data:null})}},[patient?.id]);
    React.useEffect(()=>{load()},[load]);
    const d=state.data,s=d?.settings,rc=d?.recipient;
    const reports=(d?.reports||[]).filter(r=>r.kind===kindKey);
    const open=async(r,download)=>{setBusy(`open-${r.id}`);try{const j=await callClinical({mode:'clinical_url',report_id:r.id,download:!!download});if(download){const a=document.createElement('a');a.href=j.url;a.download=j.file_name||'Clinical Report.pdf';document.body.appendChild(a);a.click();a.remove()}else window.open(j.url,'_blank','noopener')}catch(e){setNote({type:'error',text:e.message})}finally{setBusy('')}};
    const generate=async(regenId)=>{setBusy(regenId?`regen-${regenId}`:'gen');setNote(null);try{const j=await callClinical({mode:'clinical_generate',patient_id:patient.id,kind:kindKey,regenerate_report_id:regenId||undefined});setNote({type:'success',text:`${daily?'Daily':'Weekly'} Clinical Report saved (version ${j.report?.version||1}).${j.report?.status==='held'?' It is held for review — see the reasons below.':''}`});await load()}catch(e){setNote({type:'error',text:e.message})}finally{setBusy('')}};
    const verify=async()=>{setBusy('verify');try{await callClinical({mode:'clinical_verify_recipient',patient_id:patient.id});setNote({type:'success',text:"Doctor's WhatsApp number marked as verified."});await load()}catch(e){setNote({type:'error',text:e.message})}finally{setBusy('')}};
    const send=async()=>{const r=confirmSend;if(!r||!confirmed)return;setBusy(`send-${r.id}`);setNote(null);try{const j=await callClinical({mode:'clinical_send',report_id:r.id,confirm:true,confirm_recipient_mobile:rc?.mobile||''});setConfirmSend(null);setConfirmed(false);setNote({type:'success',text:`Sent on WhatsApp to ${rc?.name}. Delivery status will update in the history below and in WhatsApp Inbox.${j.provider_message_id?'':' (No message ID was returned — check WhatsApp Inbox before resending.)'}`});await load()}catch(e){setNote({type:'error',text:e.message})}finally{setBusy('')}};
    const markFailed=async(sid)=>{if(!confirm('Mark this send as NOT delivered? Only do this after checking WhatsApp Inbox — it allows the report to be sent again.'))return;setBusy(`mf-${sid}`);try{await callClinical({mode:'clinical_mark_send_failed',send_id:sid});await load()}catch(e){setNote({type:'error',text:e.message})}finally{setBusy('')}};
    const saveSettings=async()=>{const f=settingsForm;const c=to24(f.cut,f.cutAp),w=to24(f.wk,f.wkAp);if(!c||!w)return setNote({type:'error',text:'Enter the times as hh:mm (for example 08:00) and choose AM / PM.'});
      if(f.auto&&!s.daily_auto_send&&!confirm('Turn ON automatic WhatsApp sending of the Daily Clinical Report to treating doctors?\n\nOnly reports with a VERIFIED doctor number and no hold reason are sent. Keep this OFF until the test sends have been checked.'))return;
      setBusy('settings');try{await callClinical({mode:'clinical_settings',update:{daily_cutoff:c,weekly_run_time:w,daily_enabled:f.dailyOn,weekly_enabled:f.weeklyOn,daily_auto_send:f.auto}});setSettingsForm(null);setNote({type:'success',text:'Report settings saved.'});await load()}catch(e){setNote({type:'error',text:e.message})}finally{setBusy('')}};
    const chip=st=>{const c=crStatus[st]||[st,'#5f4c57','#f3edf0'];return h('span',{className:'cr-chip',style:{color:c[1],background:c[2]}},c[0])};
    const deliv=x=>{const w=x.delivery;const st=String(w?.status||x.status||'').toLowerCase();const label=w?.read_at||st==='read'?'Read':w?.delivered_at||st==='delivered'?'Delivered':st==='failed'||x.status==='failed'?'Failed':x.status==='unknown'?'Unknown — check WhatsApp Inbox':x.status==='accepted'?'Accepted by WhatsApp':x.status;return label};
    const [cut,cutAp]=to12(s?.daily_cutoff),[wk,wkAp]=to12(s?.weekly_run_time);
    const title=daily?'Daily Clinical Report':'Weekly Clinical Report';
    return h('div',{className:'modal-backdrop patient-report-backdrop',style:{zIndex:12000},onClick:e=>{if(e.target===e.currentTarget)onClose()}},h('div',{className:'card modal patient-report-modal cr-panel',style:{maxWidth:'720px'}},
      h('style',null,`.cr-panel .cr-box{border:1px solid #f0c9da;border-radius:12px;padding:10px 12px;background:#fff9fb;margin:8px 0;font-size:13px;color:#5f4c57}
.cr-panel .cr-row{border:1px solid #f0dbe5;border-radius:12px;padding:10px 12px;margin:8px 0;background:#fff}
.cr-panel .cr-row h5{margin:0;font-size:14px;color:#7a0c43}.cr-panel .cr-row small{color:#7a5e6d}
.cr-panel .cr-chip{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;margin-left:6px}
.cr-panel .cr-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cr-panel .cr-actions .btn{padding:6px 10px;font-size:13px}
.cr-panel .cr-holds{margin:6px 0 0 18px;padding:0;color:#9a5300;font-size:12.5px}.cr-panel .cr-sends{margin-top:6px;font-size:12.5px;color:#5f4c57}
.cr-panel .cr-set{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end}`),
      h('div',{className:'panel-head'},h('div',null,h('h3',null,title),h('small',null,`${formalName(patient)||patient?.full_name||''} · ${patient?.patient_id||''}`)),h('button',{type:'button',className:'close',onClick:onClose},'×')),
      state.loading&&h('p',{className:'small-note'},'Loading reports…'),
      state.error&&h('div',{className:'message error'},state.error),
      d?.not_installed&&h('div',{className:'message warning'},d.function_pending?'Daily and Weekly Clinical Reports: SQL 299 is installed, but the updated daily-patient-report server function has not run yet (it reports in within 5 minutes of being deployed).':'Daily and Weekly Clinical Reports are not activated yet on the server (Supabase SQL 299 and the updated daily-patient-report function are needed).',' The earlier "Report for Doctors" is still available.',daily&&h('div',{style:{marginTop:'8px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowOld(true)},'Open the earlier Report for Doctors'))),
      showOld&&h(FamilyDoctorReportDialog,{kind:'doctor',patient,profile,onClose:()=>setShowOld(false)}),
      d&&!d.not_installed&&h(React.Fragment,null,
        h('div',{className:'cr-box'},daily
          ?h('span',null,`Made automatically every day at ${cut} ${cutAp} (India time) for the previous 24 hours (from admission for a new Guest). Automatic WhatsApp to the treating doctor: `,h('b',{style:{color:s.daily_auto_send?'#08703f':'#9a5300'}},s.daily_auto_send?'ON':'OFF'),s.daily_enabled?'':' · daily reports are switched OFF')
          :h('span',null,`Saved automatically at ${wk} ${wkAp} on the day after each 7-day period from admission, and after a confirmed discharge (for the part not yet reported). Never sent automatically — send manually after checking.`,s.weekly_enabled?'':' Weekly reports are switched OFF.')),
        h('div',{className:'cr-box'},h('b',null,'Treating doctor (WhatsApp): '),rc?.mobile?`${rc.name} · ${rc.mobile_masked}`:'Not saved — add it in the Guest\'s Daily Report settings.',' ',rc?.mobile&&(rc.verified?h('span',{className:'cr-chip',style:{color:'#08703f',background:'#e3f4ea'}},`Verified${rc.verified_by?` by ${rc.verified_by}`:''}`):h('span',{className:'cr-chip',style:{color:'#9a5300',background:'#fff1dc'}},'Not verified')),
          rc?.mobile&&!rc.verified&&d.is_admin&&h('button',{type:'button',className:'btn btn-secondary',style:{marginLeft:'8px',padding:'4px 10px'},disabled:!!busy,onClick:verify},busy==='verify'?'Saving…':'Verify number'),
          !rc?.enabled&&h('div',{className:'small-note',style:{marginTop:'4px'}},'"Send to doctor" is not ticked in this Guest\'s Daily Report settings, so daily reports are saved but not sent automatically.')),
        d.can_send&&h('div',{className:'cr-actions'},h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:()=>generate()},busy==='gen'?'Preparing (up to 1 min)…':daily?'Generate latest report now':'Generate completed weekly report'),
          d.is_admin&&daily&&h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>setSettingsForm(settingsForm?null:{cut,cutAp,wk,wkAp,dailyOn:!!s.daily_enabled,weeklyOn:!!s.weekly_enabled,auto:!!s.daily_auto_send})},'Report settings')),
        settingsForm&&h('div',{className:'cr-box'},h('div',{className:'cr-set'},
          h('div',{className:'field'},h('label',null,'Daily report time'),h('div',{style:{display:'flex',gap:'6px'}},h('input',{value:settingsForm.cut,inputMode:'numeric',placeholder:'-- : --',style:{width:'80px'},onChange:e=>setSettingsForm({...settingsForm,cut:e.target.value})}),h('select',{value:settingsForm.cutAp,onChange:e=>setSettingsForm({...settingsForm,cutAp:e.target.value})},h('option',null,'AM'),h('option',null,'PM')))),
          h('div',{className:'field'},h('label',null,'Weekly report time'),h('div',{style:{display:'flex',gap:'6px'}},h('input',{value:settingsForm.wk,inputMode:'numeric',placeholder:'-- : --',style:{width:'80px'},onChange:e=>setSettingsForm({...settingsForm,wk:e.target.value})}),h('select',{value:settingsForm.wkAp,onChange:e=>setSettingsForm({...settingsForm,wkAp:e.target.value})},h('option',null,'AM'),h('option',null,'PM')))),
          h('label',{className:'checkbox'},h('input',{type:'checkbox',checked:settingsForm.dailyOn,onChange:e=>setSettingsForm({...settingsForm,dailyOn:e.target.checked})}),' Make daily reports'),
          h('label',{className:'checkbox'},h('input',{type:'checkbox',checked:settingsForm.weeklyOn,onChange:e=>setSettingsForm({...settingsForm,weeklyOn:e.target.checked})}),' Make weekly reports'),
          h('label',{className:'checkbox'},h('input',{type:'checkbox',checked:settingsForm.auto,onChange:e=>setSettingsForm({...settingsForm,auto:e.target.checked})}),' Send daily report to verified doctors automatically')),
          h('div',{className:'cr-actions'},h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:saveSettings},busy==='settings'?'Saving…':'Save settings'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setSettingsForm(null)},'Cancel'))),
        note&&h('div',{className:`message ${note.type}`,style:{marginTop:'8px'}},note.text),
        h('h4',{style:{margin:'12px 0 4px',color:'#7a0c43'}},`Saved reports (${reports.length})`),
        !reports.length&&h('p',{className:'small-note'},daily?'No Daily Clinical Report saved yet. The first one is made at the next report time.':'No Weekly Clinical Report saved yet. The first one is made after the first 7 days from admission (or after a confirmed discharge).'),
        reports.map(r=>{const sent=(r.sends||[]).some(x=>['accepted','sending','unknown'].includes(x.status));return h('div',{key:r.id,className:'cr-row'},
          h('h5',null,`${r.kind==='weekly'?(r.is_final?'Final period · ':r.week_no?`Week ${r.week_no} · `:''):''}${crDT(r.period_from)} → ${crPeriodEnd(r.period_to)}`,chip(r.status)),
          h('small',null,`Version ${r.version}${r.version>1?' (correction — earlier versions kept)':''} · saved ${crDT(r.generated_at)} by ${r.generated_by_name||'Samara Automatic Report'}${r.pages?` · ${r.pages} pages`:''}${r.ai_model?` · AI: ${r.ai_model}`:' · fixed-rule wording'}`),
          (r.hold_reasons||[]).length>0&&h('ul',{className:'cr-holds'},r.hold_reasons.map((x,i)=>h('li',{key:i},x))),
          (r.sends||[]).length>0&&h('div',{className:'cr-sends'},r.sends.map(x=>h('div',{key:x.id},`WhatsApp ${x.mode==='automatic'?'(automatic)':`(sent by ${x.sent_by_name||'staff'})`} to ${x.recipient_name||'doctor'} · ${crDT(x.created_at)} · `,h('b',null,deliv(x)),x.error&&x.status!=='accepted'?` — ${x.error}`:'',x.status==='unknown'&&d.is_admin&&h('button',{type:'button',className:'btn btn-secondary',style:{marginLeft:'6px',padding:'2px 8px'},onClick:()=>markFailed(x.id)},'Mark not delivered')))),
          h('div',{className:'cr-actions'},
            h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:()=>open(r,false)},busy===`open-${r.id}`?'Opening…':'View PDF'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>open(r,true)},'Download'),
            d.can_send&&!sent&&h('button',{type:'button',className:'btn btn-whatsapp',disabled:!!busy||!rc?.verified,title:rc?.verified?'':'Verify the doctor\'s number first',onClick:()=>{setConfirmSend(r);setConfirmed(false)}},'Send via WhatsApp'),
            d.can_send&&h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>{if(confirm('Make a NEW version of this report from the current records? The earlier version stays saved.'))generate(r.id)}},busy===`regen-${r.id}`?'Preparing…':'New version')));}),
        confirmSend&&h('div',{className:'modal-backdrop',style:{zIndex:12100},onClick:e=>{if(e.target===e.currentTarget)setConfirmSend(null)}},h('div',{className:'card modal',style:{maxWidth:'460px'}},
          h('h3',null,'Confirm WhatsApp recipient'),
          h('p',null,`${title}${confirmSend.week_no?` · Week ${confirmSend.week_no}`:confirmSend.is_final?' · Final period':''}`,h('br'),`${crDT(confirmSend.period_from)} → ${crPeriodEnd(confirmSend.period_to)} · version ${confirmSend.version}`),
          confirmSend.status==='held'&&h('div',{className:'message warning'},'This report was held: ',(confirmSend.hold_reasons||[]).join('; '),'. Send only after checking these points.'),
          h('p',null,'To: ',h('b',null,rc?.name),` · ${rc?.mobile_masked}`),
          h('label',{className:'checkbox'},h('input',{type:'checkbox',checked:confirmed,onChange:e=>setConfirmed(e.target.checked)}),' I have checked the PDF and confirm this is the treating doctor\'s authorised WhatsApp number.'),
          h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-whatsapp',disabled:!confirmed||!!busy,onClick:send},busy?'Sending…':'Send'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setConfirmSend(null)},'Cancel'))))),
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
        item(2,'clinical_daily','Daily Clinical Report','For the treating doctor · made automatically every day · history, PDF, WhatsApp'),
        item(3,'clinical_weekly','Weekly Clinical Report','For the treating doctor · saved every 7 days and at discharge · send manually'),
        item(4,'discharge','Discharge Summary',discharged?'Whole stay summary · Print / WhatsApp':'Available after the final discharge',discharged)),
      h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))
    ));
  }
