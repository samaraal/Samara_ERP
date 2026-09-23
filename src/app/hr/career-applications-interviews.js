  function CareerApplications({profile,onNavigate}){
    const [rows,setRows]=React.useState([]),[selected,setSelected]=React.useState(null),[edit,setEdit]=React.useState(null),[msg,setMsg]=React.useState('');
    const [dashboardCareerFocus,setDashboardCareerFocus]=React.useState(()=>{
      const intent=readDashboardIntent('Career Applications');
      return String(intent?.focus||'');
    });
    const [waHistory,setWaHistory]=React.useState([]),[manualFallbackUrl,setManualFallbackUrl]=React.useState(''),[waBusy,setWaBusy]=React.useState(false);
    const [interviewDate,setInterviewDate]=React.useState(''),[interviewTime,setInterviewTime]=React.useState('10:00');
    const [rescheduleDate,setRescheduleDate]=React.useState(''),[rescheduleTime,setRescheduleTime]=React.useState('10:00');
    const interviewTimeOptions=Array.from({length:15},(_,i)=>{const total=10*60+i*30;const hh=Math.floor(total/60),mm=total%60;const value=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;const hour12=hh>12?hh-12:hh;const ampm=hh>=12?'PM':'AM';return {value,label:`${hour12}.${String(mm).padStart(2,'0')} ${ampm}`}});
    function splitInterviewDateTime(value){if(!value)return {date:'',time:'10:00'};const d=new Date(value);if(Number.isNaN(d.getTime()))return {date:'',time:'10:00'};return {date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}}
    async function load(){const {data,error}=await client.from('career_applications').select('*').order('created_at',{ascending:false});if(error){setMsg(error.message);return}setRows(data||[]);if(selected){const fresh=(data||[]).find(x=>x.id===selected.id);if(fresh){setSelected(fresh);setEdit({...fresh})}}}
    React.useEffect(()=>{load();const ch=client.channel('career-applications-live').on('postgres_changes',{event:'*',schema:'public',table:'career_applications'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    React.useEffect(()=>{if(!selected?.id)return;const ch=client.channel(`career-wa-chat-${selected.id}`).on('postgres_changes',{event:'*',schema:'public',table:'hr_whatsapp_communications',filter:`career_application_id=eq.${selected.id}`},()=>loadWhatsAppHistory(selected.id)).subscribe();return()=>client.removeChannel(ch)},[selected?.id]);
    async function loadWhatsAppHistory(applicationId){
      if(!applicationId){setWaHistory([]);return}
      const {data,error}=await client.from('hr_whatsapp_communications').select('*').eq('career_application_id',applicationId).order('created_at',{ascending:true});
      if(error){console.warn('Unable to load applicant WhatsApp history',error);setWaHistory([]);return}
      setWaHistory(data||[]);
    }
    async function recordHrWhatsApp(row,{communicationType,templateName,status='Accepted',providerMessageId=null,errorMessage=null,messageContent='',messageType='template',direction='outbound',messagePayload=null}){
      if(!row?.id)return;
      const nowIso=new Date().toISOString();
      const providerId=providerMessageId||null;
      const basePayload={career_application_id:row.id,application_id:row.application_id||null,applicant_name:row.applicant_name||null,recipient_number:normalizeWhatsAppRecipient(row.whatsapp||row.mobile||''),communication_type:communicationType,template_name:templateName||null,status,provider_message_id:providerId,error_message:errorMessage||null,sent_by:profile.id,sent_by_name:formalName(profile),direction,message_type:messageType,message_content:String(messageContent||''),message_payload:messagePayload||null,sent_at:direction==='outbound'?nowIso:null,received_at:direction==='inbound'?nowIso:null,updated_at:nowIso};

      // Meta provider_message_id is globally unique. A webhook/general inbox logger may
      // create the row milliseconds before the HR workflow finishes. In that case we
      // must enrich the SAME row with the complete applicant/template message rather
      // than inserting a second row (which violates the unique index) or leaving the
      // Inbox with only the generic text "WhatsApp API".
      async function enrichExisting(existing){
        if(!existing?.id)return {ok:false};
        const existingStatus=String(existing.status||'').toLowerCase();
        const preserveDeliveryStatus=['delivered','read'].includes(existingStatus);
        const patch={...basePayload,status:preserveDeliveryStatus?existing.status:status,updated_at:nowIso};
        delete patch.provider_message_id; // never change the provider identity of an existing row
        if(existing.sent_at)delete patch.sent_at;
        if(existing.received_at)delete patch.received_at;
        const {error:updateError}=await client.from('hr_whatsapp_communications').update(patch).eq('id',existing.id);
        if(updateError){console.warn('Unable to enrich existing WhatsApp communication history',updateError);return {ok:false,error:updateError}}
        await loadWhatsAppHistory(row.id);
        return {ok:true,reused:true};
      }

      if(providerId){
        const {data:existing,error:lookupError}=await client.from('hr_whatsapp_communications')
          .select('id,status,sent_at,received_at')
          .eq('provider_message_id',providerId)
          .maybeSingle();
        if(lookupError){console.warn('Unable to check existing WhatsApp provider message',lookupError)}
        if(existing?.id)return enrichExisting(existing);
      }

      const {error}=await client.from('hr_whatsapp_communications').insert(basePayload);
      if(error){
        // Protect against the small race where another logger inserts the same Meta ID
        // after our lookup but before this insert. Re-query and enrich instead.
        if(providerId&&(error.code==='23505'||String(error.message||'').toLowerCase().includes('duplicate key'))){
          const {data:existing}=await client.from('hr_whatsapp_communications')
            .select('id,status,sent_at,received_at')
            .eq('provider_message_id',providerId)
            .maybeSingle();
          if(existing?.id)return enrichExisting(existing);
        }
        console.warn('Unable to save WhatsApp communication history',error);return {ok:false,error};
      }
      await loadWhatsAppHistory(row.id);
      return {ok:true};
    }
    function interviewScheduledSnapshot(row){
      const p=interviewTemplateParams(row);
      return `Dear ${p[0]},\n\nThank you for your interest in joining Samara Assisted Living.\n\nWe are pleased to invite you for an interview for the position of ${p[1]}.\n\nInterview Date: ${p[2]}\nInterview Time: ${p[3]}\nInterview Mode: ${p[4]}\n\n${p[5]}\n\nKindly be available about 10 minutes before the scheduled time.\n\nWe look forward to meeting you.\n\nRegards,\nDr. Chella Boomi\nDirector\nSamara Health Care LLP\nContact: 9976735577`;
    }
    function interviewRescheduledSnapshot(row){
      const p=interviewTemplateParams(row);
      return `Dear ${p[0]},\n\nYour interview for the position of ${p[1]} at Samara Assisted Living has been rescheduled.\n\nNew Interview Date: ${p[2]}\nNew Interview Time: ${p[3]}\nInterview Mode: ${p[4]}\n\n${p[5]}\n\nWe regret any inconvenience caused by this change.\n\nKindly be available about 10 minutes before the scheduled time.\n\nWe look forward to meeting you.\n\nRegards,\nDr. Chella Boomi\nDirector\nSamara Health Care LLP\nContact: 9976735577`;
    }
    function applicationReturnedSnapshot(row,remarks){
      return `Dear ${candidateDisplayName(row)},\n\nThank you for your application to Samara Assisted Living.\n\nDuring verification of your application, we found that clarification or rectification is required.\n\nHR Remarks:\n${remarks}\n\nKindly review the above remarks and provide the required clarification or corrected information.\n\nApplication Reference: ${row.application_id||'—'}\n\nOnce the required information is received, your application can be reviewed further.\n\nFor any clarification, please contact us.\n\nRegards,\nHR Department\nSamara Assisted Living\nContact: 9976735577`;
    }
    function whatsappProviderMessageId(result){return result?.provider_message_id||result?.result?.messages?.[0]?.id||result?.messages?.[0]?.id||null}
    function waStatusStyle(status){const value=String(status||'').toLowerCase();if(value.includes('read')||value.includes('deliver'))return {background:'#e6f7ef',color:'#0f7a4f'};if(value.includes('accept')||value==='sent')return {background:'#edf7ff',color:'#176b9c'};if(value.includes('fail'))return {background:'#fff0f0',color:'#a51d2c'};if(value.includes('fallback'))return {background:'#fff5e8',color:'#9b5e0b'};return {background:'#f4eef2',color:'#6f5362'}}
    function normalizeCareerText(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
    function normalizeCareerPhone(value){return String(value||'').replace(/\D/g,'').slice(-10)}
    function previousDuplicateApplications(row){
      if(!row)return [];
      const name=normalizeCareerText(row.applicant_name);
      const mobile=normalizeCareerPhone(row.mobile);
      const email=normalizeCareerText(row.email);
      const dob=String(row.date_of_birth||'').slice(0,10);
      return rows.filter(other=>{
        if(!other||other.id===row.id)return false;
        const otherName=normalizeCareerText(other.applicant_name);
        if(!name||!otherName||name!==otherName)return false;
        const sameMobile=mobile&&mobile===normalizeCareerPhone(other.mobile);
        const sameEmail=email&&email===normalizeCareerText(other.email);
        const sameDob=dob&&dob===String(other.date_of_birth||'').slice(0,10);
        return !!(sameMobile||sameEmail||sameDob);
      }).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
    }
    function applicantDataIssues(row){
      const issues=[];
      if(!row)return issues;
      const duplicates=previousDuplicateApplications(row);
      if(duplicates.length){
        const refs=duplicates.slice(0,3).map(x=>`${x.application_id||'previous application'}${x.created_at?` (${formatDateIN(x.created_at)})`:''}`).join(', ');
        issues.push(`Duplicate application / previous application found with the same applicant details: ${refs}.`);
      }
      const mobile=normalizeCareerPhone(row.mobile);
      const emergency=normalizeCareerPhone(row.emergency_contact);
      if(mobile&&emergency&&mobile===emergency)issues.push('Same mobile number entered for Applicant and Parent / Emergency Contact. Please provide two different contact numbers.');
      if(row.mobile&&mobile.length!==10)issues.push('Applicant mobile number is not a valid 10-digit mobile number.');
      if(row.emergency_contact&&emergency.length!==10)issues.push('Parent / Emergency Contact number is not a valid 10-digit mobile number.');
      if(!String(row.gender||'').trim())issues.push('Gender is missing. Please provide Gender.');
      const gender=String(row.gender||'').toLowerCase();
      const title=String(row.title||'').trim();
      if(!title)issues.push('Title / Salutation is missing.');
      if(gender==='female'&&['Mr.','Shri','Fr.','Br.'].includes(title))issues.push(`Salutation ${title} does not match Female gender.`);
      if(gender==='male'&&['Mrs.','Ms.','Miss','Smt.','Sr.'].includes(title))issues.push(`Salutation ${title} does not match Male gender.`);
      if(!String(row.father_guardian_name||'').trim())issues.push('Father / Mother / Guardian Name is missing.');
      if(!String(row.email||'').trim())issues.push('Email ID is missing.');
      else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email).trim()))issues.push('Email ID appears to be invalid.');
      if(!String(row.department||'').trim())issues.push('Department is missing.');
      if(!String(row.designation||'').trim())issues.push('Designation is missing.');
      if(!String(row.qualification||'').trim())issues.push('Qualification is missing.');
      const refType=normalizeCareerText(row.reference_type);
      if(refType&&refType!=='direct'){
        if(!String(row.reference_name||'').trim())issues.push('Reference Name is missing for the selected reference source.');
        if(!normalizeCareerPhone(row.reference_contact))issues.push('Reference Contact Number is missing for the selected reference source.');
      }
      return [...new Set(issues)];
    }
    function detectedRemarks(row){
      const issues=applicantDataIssues(row);
      return issues.map((issue,index)=>`${index+1}. ${issue}`).join('\n');
    }
    function open(row){
      const parts=splitInterviewDateTime(row.interview_at);
      const autoRemarks=detectedRemarks(row);
      setSelected(row);
      setEdit({...row,hr_remarks:String(row.hr_remarks||'').trim()||autoRemarks});
      setInterviewDate(parts.date);
      setInterviewTime(interviewTimeOptions.some(x=>x.value===parts.time)?parts.time:'10:00');
      setRescheduleDate('');
      setRescheduleTime('10:00');
      setMsg(autoRemarks?'System pre-screen detected items requiring HR attention. Please review the suggested reasons before proceeding.':'');
      setManualFallbackUrl('');
      loadWhatsAppHistory(row.id);
    }
    function backToApplications(){setSelected(null);setEdit(null);setMsg('');setWaHistory([]);setManualFallbackUrl('');setWaBusy(false)}
    async function closeCareerApplication(){
      if(!edit||edit.status==='Closed')return;
      const reason=prompt('Enter the reason / HR remarks for closing this application:',String(edit.hr_remarks||''));
      if(reason===null)return;
      if(!String(reason).trim()){setMsg('Closure remarks are mandatory before closing an application.');return}
      if(!confirm(`Close the application of ${selected?.applicant_name||'this applicant'}?`))return;
      const now=new Date().toISOString();
      const prior=String(edit.hr_remarks||'').trim();
      const closureNote=`[CLOSED ${formatDateTimeIN(now)} · ${formalName(profile)}] ${String(reason).trim()}`;
      const payload={status:'Closed',hr_remarks:[prior,closureNote].filter(Boolean).join('\n\n'),handled_by:profile.id,updated_at:now};
      const {error}=await client.from('career_applications').update(payload).eq('id',edit.id);
      if(error){setMsg(error.message||'Unable to close the career application.');return}
      setSelected({...selected,...payload});setEdit({...edit,...payload});
      setMsg('Career application closed successfully.');
      await load();
    }
    async function reopenCareerApplication(){
      if(!edit||edit.status!=='Closed')return;
      const reason=prompt('Reason for reopening this closed application:','');
      if(reason===null)return;
      if(!String(reason).trim()){setMsg('Reason for reopening is mandatory.');return}
      if(!confirm(`Reopen the application of ${selected?.applicant_name||'this applicant'}?`))return;
      const now=new Date().toISOString();
      const prior=String(edit.hr_remarks||'').trim();
      const reopenNote=`[REOPENED ${formatDateTimeIN(now)} · ${formalName(profile)}] ${String(reason).trim()}`;
      const payload={status:'Under Review',hr_remarks:[prior,reopenNote].filter(Boolean).join('\n\n'),handled_by:profile.id,updated_at:now};
      const {error}=await client.from('career_applications').update(payload).eq('id',edit.id);
      if(error){setMsg(error.message||'Unable to reopen the career application.');return}
      setSelected({...selected,...payload});setEdit({...edit,...payload});
      setMsg('Career application reopened successfully. Editing is enabled again.');
      await load();
    }
    function useDetectedRemarks(){
      const auto=detectedRemarks(selected);
      if(!auto){setMsg('No discrepancy was automatically detected. HR may enter any other discrepancy manually in HR Remarks.');return}
      const current=String(edit?.hr_remarks||'').trim();
      setEdit({...edit,hr_remarks:current&&current!==auto?`${auto}\n${current}`:auto,status:'Returned for Rectification',interview_at:null,interview_mode:null,interview_venue:null,interview_result:null});
      setInterviewDate('');setInterviewTime('10:00');setRescheduleDate('');setRescheduleTime('10:00');
      setMsg('Detected reasons added to HR Remarks. Review them and click Return for Rectification to send the WhatsApp message.');
    }
    function setInterviewSchedule(){
      if(!interviewDate){setMsg('Please select the interview date.');return}
      const local=new Date(`${interviewDate}T${interviewTime}:00`);
      setEdit({...edit,interview_at:local.toISOString(),status:'Interview Scheduled'});
      setMsg(`Interview schedule set for ${interviewTimeOptions.find(x=>x.value===interviewTime)?.label||interviewTime}. Click Save HR Update to confirm.`);
    }
    function clearInterviewSchedule(){setInterviewDate('');setInterviewTime('10:00');setEdit({...edit,interview_at:null});setMsg('Interview schedule cleared. Click Save HR Update to confirm.')}
    function setRescheduledInterview(){
      if(!rescheduleDate){setMsg('Please select the new interview date.');return}
      const local=new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      if(Number.isNaN(local.getTime())){setMsg('Please select a valid reschedule date and time.');return}
      const oldText=edit?.interview_at?fmt(edit.interview_at):(selected?.interview_at?fmt(selected.interview_at):'Not recorded');
      const newIso=local.toISOString();
      if(edit?.interview_at===newIso){setMsg('Please choose a different date or time for rescheduling.');return}
      const stamp=`Interview rescheduled from ${oldText} to ${fmt(newIso)}.`;
      const remarks=[edit?.hr_remarks||'',stamp].filter(Boolean).join('\n');
      setEdit({...edit,interview_at:newIso,status:'Interview Scheduled',hr_remarks:remarks});
      setInterviewDate(rescheduleDate);setInterviewTime(rescheduleTime);
      setMsg(`Interview rescheduled to ${fmt(newIso)}. Click Save HR Update, or Send Reschedule WhatsApp to save and notify the applicant.`);
    }
    async function save(){
      if(!edit)return;
      if(edit.status==='Closed'){setMsg('This application is closed and read-only. Reopen the application before making changes.');return}
      const payload={status:edit.status,hr_remarks:edit.hr_remarks||null,interview_at:edit.interview_at||null,interview_mode:edit.interview_mode||null,interview_venue:edit.interview_venue||null,interview_result:edit.interview_result||null,handled_by:profile.id,updated_at:new Date().toISOString()};
      const {error}=await client.from('career_applications').update(payload).eq('id',edit.id);if(error){setMsg(error.message);return}setMsg('Career application updated successfully.');await load();
    }
    async function openDoc(path){if(!path)return;const {data,error}=await client.storage.from('career-applications').createSignedUrl(path,180);if(error){setMsg(error.message);return}window.open(data.signedUrl,'_blank','noopener')}
    function candidateDisplayName(row){
      return [row.title,row.applicant_name].filter(Boolean).join(' ').trim()||'Candidate';
    }
    function interviewTemplateParams(row){
      const when=row?.interview_at?new Date(row.interview_at):null;
      const modeInfo=interviewModeDetails(row);
      return [
        candidateDisplayName(row),
        row?.designation||'applied position',
        when?formatDateIN(when):'—',
        when?formatTimeIN(when):'—',
        modeInfo.mode,
        modeInfo.detail
      ];
    }
    function whatsappCandidate(row){
      const phone=String(row.whatsapp||row.mobile||'').replace(/\D/g,'').slice(-10);if(!phone)return '#';
      const when=row.interview_at?fmt(row.interview_at):'the scheduled date and time';
      const modeInfo=interviewModeDetails(row);
      const text=`Dear ${candidateDisplayName(row)},\n\nThank you for your interest in joining Samara Assisted Living.\n\nWe are pleased to invite you for an interview for the position of ${row.designation||'the applied position'}.\n\nInterview: ${when}\nMode: ${modeInfo.mode}\n${modeInfo.detail}\n\nRegards,\nHR Department\nSamara Assisted Living\nContact: 9976735577`;
      return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
    }
    async function sendInterviewWhatsApp(){
      if(!edit||waBusy)return;
      if(!edit.interview_at){setMsg('Please set the interview date and time before sending WhatsApp.');return}
      if(!edit.interview_mode){setMsg('Please select the Interview Mode before sending WhatsApp.');return}
      if(edit.interview_mode==='Online'&&!String(edit.interview_venue||'').trim()){setMsg('Please enter the Google Meet / Zoom / Teams link for the online interview.');return}
      const phone=normalizeWhatsAppRecipient(edit.whatsapp||edit.mobile||'');
      if(!phone){setMsg('WhatsApp / mobile number is not available for this applicant.');return}
      setWaBusy(true);setManualFallbackUrl('');setMsg('Sending interview WhatsApp through Meta Cloud API…');
      const payload={status:'Interview Scheduled',hr_remarks:edit.hr_remarks||null,interview_at:edit.interview_at,interview_mode:edit.interview_mode||null,interview_venue:edit.interview_venue||null,interview_result:edit.interview_result||null,handled_by:profile.id,updated_at:new Date().toISOString()};
      const {error}=await client.from('career_applications').update(payload).eq('id',edit.id);
      if(error){setWaBusy(false);setMsg(error.message);return}
      const updated={...edit,status:'Interview Scheduled'};
      setEdit(updated);setSelected({...selected,...updated});
      try{
        const waResult=await sendWhatsAppTemplate({to:phone,templateName:'samara_interview_scheduled',languageCode:'en',bodyParams:interviewTemplateParams(updated)});
        const history=await recordHrWhatsApp(updated,{communicationType:'Interview Scheduled',templateName:'samara_interview_scheduled',status:'Accepted',providerMessageId:whatsappProviderMessageId(waResult),messageContent:interviewScheduledSnapshot(updated),messagePayload:{body_params:interviewTemplateParams(updated)}});
        if(history?.ok===false)setMsg(`WhatsApp was accepted by Meta, but the ERP could not save the communication history: ${history.error?.message||'Database permission error'}. Please run the HR WhatsApp history policy fix.`);
        else setMsg('✓ WhatsApp accepted by Meta successfully. This communication has been recorded in the applicant history below.');
      }catch(apiError){
        const history=await recordHrWhatsApp(updated,{communicationType:'Interview Scheduled',templateName:'samara_interview_scheduled',status:'API Failed',errorMessage:String(apiError.message||apiError),messageContent:interviewScheduledSnapshot(updated),messagePayload:{body_params:interviewTemplateParams(updated)}});
        setManualFallbackUrl(whatsappCandidate(updated));
        setMsg(`WhatsApp API could not send: ${apiError.message||apiError}. The ERP has NOT left this page. Use the Manual WhatsApp Fallback button below only if required.${history?.ok===false?' Communication history could not be saved because of a database permission issue.':''}`);
      } finally {setWaBusy(false)}
      await load();
    }
    function whatsappRescheduleCandidate(row,previousAt){
      const phone=String(row.whatsapp||row.mobile||'').replace(/\D/g,'').slice(-10);if(!phone)return '#';
      const modeInfo=interviewModeDetails(row);
      const text=`Dear ${candidateDisplayName(row)},\n\nYour interview for the position of ${row.designation||'the applied position'} at Samara Assisted Living has been rescheduled.\n\nNew Interview: ${fmt(row.interview_at)}\nMode: ${modeInfo.mode}\n${modeInfo.detail}\n\nWe regret any inconvenience caused by this change.\n\nRegards,\nHR Department\nSamara Assisted Living\nContact: 9976735577`;
      return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
    }
    async function sendRescheduleWhatsApp(){
      if(!edit||waBusy)return;
      const previousAt=selected?.interview_at||null;
      if(!edit.interview_at){setMsg('Please set the revised interview date and time first.');return}
      if(previousAt===edit.interview_at){setMsg('Please choose a new date or time before sending a reschedule message.');return}
      if(!edit.interview_mode){setMsg('Please select the Interview Mode before sending WhatsApp.');return}
      if(edit.interview_mode==='Online'&&!String(edit.interview_venue||'').trim()){setMsg('Please enter the online meeting link before sending WhatsApp.');return}
      const phone=normalizeWhatsAppRecipient(edit.whatsapp||edit.mobile||'');
      if(!phone){setMsg('WhatsApp / mobile number is not available for this applicant.');return}
      setWaBusy(true);setManualFallbackUrl('');setMsg('Sending rescheduled interview WhatsApp through Meta Cloud API…');
      const payload={status:'Interview Scheduled',hr_remarks:edit.hr_remarks||null,interview_at:edit.interview_at,interview_mode:edit.interview_mode||null,interview_venue:edit.interview_venue||null,interview_result:edit.interview_result||null,handled_by:profile.id,updated_at:new Date().toISOString()};
      const {error}=await client.from('career_applications').update(payload).eq('id',edit.id);
      if(error){setWaBusy(false);setMsg(error.message);return}
      const updated={...edit,status:'Interview Scheduled'};
      setSelected({...selected,...updated});setEdit(updated);setRescheduleDate('');setRescheduleTime('10:00');
      try{
        const waResult=await sendWhatsAppTemplate({to:phone,templateName:'samara_interview_rescheduled',languageCode:'en',bodyParams:interviewTemplateParams(updated)});
        const history=await recordHrWhatsApp(updated,{communicationType:'Interview Rescheduled',templateName:'samara_interview_rescheduled',status:'Accepted',providerMessageId:whatsappProviderMessageId(waResult),messageContent:interviewRescheduledSnapshot(updated),messagePayload:{body_params:interviewTemplateParams(updated)}});
        if(history?.ok===false)setMsg(`Reschedule WhatsApp was accepted by Meta, but communication history could not be saved: ${history.error?.message||'Database permission error'}.`);
        else setMsg('✓ Rescheduled interview WhatsApp accepted by Meta and recorded in applicant history.');
      }catch(apiError){
        const history=await recordHrWhatsApp(updated,{communicationType:'Interview Rescheduled',templateName:'samara_interview_rescheduled',status:'API Failed',errorMessage:String(apiError.message||apiError),messageContent:interviewRescheduledSnapshot(updated),messagePayload:{body_params:interviewTemplateParams(updated)}});
        setManualFallbackUrl(whatsappRescheduleCandidate(updated,previousAt));
        setMsg(`WhatsApp API could not send: ${apiError.message||apiError}. Use Manual WhatsApp Fallback below only if required.${history?.ok===false?' History could not be recorded because of a database permission issue.':''}`);
      } finally {setWaBusy(false)}
      await load();
    }
    function whatsappRectificationCandidate(row,remarks){
      const phone=String(row.whatsapp||row.mobile||'').replace(/\D/g,'').slice(-10);if(!phone)return '#';
      const text=`Dear ${candidateDisplayName(row)},\n\nThank you for your application to Samara Assisted Living.\n\nDuring verification, clarification or rectification is required.\n\nHR Remarks:\n${remarks}\n\nApplication Reference: ${row.application_id||'—'}\n\nPlease provide the required clarification or corrected information.\n\nRegards,\nHR Department\nSamara Assisted Living\nContact: 9976735577`;
      return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
    }
    async function returnForRectification(){
      if(!edit||waBusy)return;
      let remarks=String(edit.hr_remarks||'').trim();
      if(!remarks){setMsg('HR Remarks is mandatory when returning an application for rectification. Please enter the discrepancy / correction required.');return}
      const reapplyInstruction='Please submit a fresh corrected application through the Samara Careers page after rectifying the above items.';
      if(!remarks.toLowerCase().includes('fresh corrected application')) remarks=`${remarks}\n\n${reapplyInstruction}`;
      const phone=normalizeWhatsAppRecipient(edit.whatsapp||edit.mobile||'');
      if(!phone){setMsg('A valid WhatsApp / mobile number is not available for this applicant.');return}
      setWaBusy(true);setManualFallbackUrl('');setMsg('Returning application and sending WhatsApp through Meta Cloud API…');
      const updated={...edit,status:'Returned for Rectification',hr_remarks:remarks,interview_at:null,interview_mode:null,interview_venue:null,interview_result:null};
      const payload={status:'Returned for Rectification',hr_remarks:remarks,interview_at:null,interview_mode:null,interview_venue:null,interview_result:null,handled_by:profile.id,updated_at:new Date().toISOString()};
      const {error}=await client.from('career_applications').update(payload).eq('id',edit.id);
      if(error){setWaBusy(false);setMsg(error.message);return}
      setInterviewDate('');setInterviewTime('10:00');setRescheduleDate('');setRescheduleTime('10:00');setEdit(updated);setSelected({...selected,...updated});
      try{
        const waResult=await sendWhatsAppTemplate({to:phone,templateName:'samara_application_returned',languageCode:'en',bodyParams:[candidateDisplayName(updated),remarks,updated.application_id||'—']});
        const history=await recordHrWhatsApp(updated,{communicationType:'Application Returned',templateName:'samara_application_returned',status:'Accepted',providerMessageId:whatsappProviderMessageId(waResult),messageContent:applicationReturnedSnapshot(updated,remarks),messagePayload:{body_params:[candidateDisplayName(updated),remarks,updated.application_id||'—']}});
        if(history?.ok===false)setMsg(`Return WhatsApp was accepted by Meta, but communication history could not be saved: ${history.error?.message||'Database permission error'}.`);
        else setMsg('✓ Application returned. WhatsApp accepted by Meta and recorded in applicant history.');
      }catch(apiError){
        const history=await recordHrWhatsApp(updated,{communicationType:'Application Returned',templateName:'samara_application_returned',status:'API Failed',errorMessage:String(apiError.message||apiError),messageContent:applicationReturnedSnapshot(updated,remarks),messagePayload:{body_params:[candidateDisplayName(updated),remarks,updated.application_id||'—']}});
        setManualFallbackUrl(whatsappRectificationCandidate(updated,remarks));
        setMsg(`Application was returned, but WhatsApp API could not send: ${apiError.message||apiError}. Use Manual WhatsApp Fallback below only if required.${history?.ok===false?' History could not be recorded because of a database permission issue.':''}`);
      } finally {setWaBusy(false)}
      await load();
    }
    function convert(row){
      const seed={
        application_id:row.application_id,
        career_application_id:row.id,
        title:row.title||'',
        full_name:row.applicant_name||'',
        gender:row.gender||'',
        mobile:row.mobile||'',
        emergency_contact:row.emergency_contact||'',
        employee_email:row.email||'',
        father_guardian_name:row.father_guardian_name||'',
        date_of_birth:row.date_of_birth||'',
        blood_group:row.blood_group||'',
        id_card_type:row.id_card_type||'Aadhaar',
        id_card_number:row.id_card_number||'',
        qualification:row.qualification||'',
        previous_workplace:row.previous_workplace||row.current_employer||'',
        reference_type:row.reference_type||'Direct',
        reference_name:row.reference_name||'',
        reference_contact:row.reference_contact||'',
        department:row.department||'',
        designation:row.designation||'',
        current_address:row.current_address||'',
        current_state:row.current_state||row.state||'Tamil Nadu',
        current_district:row.current_district||'',
        current_taluk:row.current_taluk||'',
        current_village_town:row.current_village_town||row.city||'',
        current_locality_area:row.current_locality_area||'',
        current_street_name:row.current_street_name||'',
        current_house_no:row.current_house_no||'',
        current_apartment_name:row.current_apartment_name||'',
        current_flat_no:row.current_flat_no||'',
        current_landmark:row.current_landmark||'',
        current_pincode:row.current_pincode||row.pincode||'',
        permanent_same_as_current:!!row.permanent_same_as_current,
        permanent_address:row.permanent_address||'',
        permanent_state:row.permanent_state||'Tamil Nadu',
        permanent_district:row.permanent_district||'',
        permanent_taluk:row.permanent_taluk||'',
        permanent_village_town:row.permanent_village_town||'',
        permanent_locality_area:row.permanent_locality_area||'',
        permanent_street_name:row.permanent_street_name||'',
        permanent_house_no:row.permanent_house_no||'',
        permanent_apartment_name:row.permanent_apartment_name||'',
        permanent_flat_no:row.permanent_flat_no||'',
        permanent_landmark:row.permanent_landmark||'',
        permanent_pincode:row.permanent_pincode||'',
        // HR assigns Employee ID, Date of Joining, ERP Access Scope, Login ID and Password.
        role:row.department==='Nursing'?'Nurse':
             row.department==='Caregiving'?'Caregiver':
             row.department==='Accounts & Finance'?'Accounts':
             row.department==='Food & Kitchen'?'Kitchen':'Caregiver'
      };
      localStorage.setItem('samara_hr_employee_seed',JSON.stringify(seed));
      onNavigate('Employees');
    }
    const dashboardCareerRows=rows.filter(r=>{
      if(!dashboardCareerFocus||dashboardCareerFocus==='All Applications'||dashboardCareerFocus==='WhatsApp Communications'||dashboardCareerFocus==='Applicant WhatsApp')return true;
      if(dashboardCareerFocus==='New Applications')return r.status==='New';
      if(dashboardCareerFocus==='Shortlisted')return r.status==='Shortlisted';
      if(dashboardCareerFocus==='Interviews')return r.status==='Interview Scheduled';
      if(dashboardCareerFocus==='Selected')return r.status==='Selected';
      if(dashboardCareerFocus==='On Hold')return r.status==='On Hold';
      return true;
    });
    const table=h('div',null,
      dashboardCareerFocus&&dashboardCareerFocus!=='All Applications'
        ?h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',marginBottom:'10px',flexWrap:'wrap'}},
            h('span',{className:'badge'},`Dashboard view: ${dashboardCareerFocus}`),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setDashboardCareerFocus('')},'Show All')
          )
        :null,
      h('div',{className:'table-wrap employee-master-table-wrap'},h('table',{className:'table employee-master-table'},h('thead',null,h('tr',null,['Application ID','Applicant','Department','Designation','Mobile','Status','Received','Action'].map(x=>h('th',{key:x},x)))),h('tbody',null,dashboardCareerRows.map(r=>h('tr',{key:r.id,onClick:()=>open(r),title:'Open complete applicant file',style:{cursor:'pointer'}},h('td',null,r.application_id),h('td',null,h('strong',null,r.applicant_name)),h('td',null,r.department),h('td',null,r.designation),h('td',null,r.mobile),h('td',null,h('span',{className:'badge'},r.status)),h('td',null,fmt(r.created_at)),h('td',null,h('button',{type:'button',className:'btn btn-primary',onClick:e=>{e.stopPropagation();open(r)}},'Open File')))),dashboardCareerRows.length===0?h('tr',null,h('td',{colSpan:8,className:'empty'},'No career applications in this dashboard view.')):null))));
    const isRectification=edit?.status==='Returned for Rectification';
    const isClosed=edit?.status==='Closed';
    const modal=selected&&edit?h('div',{className:'modal-backdrop',style:{position:'static',inset:'auto',background:'transparent',padding:0,display:'block',zIndex:'auto'}},h('div',{className:'card modal employee-modal',style:{width:'100%',maxWidth:'none',maxHeight:'none',overflow:'visible',margin:0}},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Applicant File — ',selected.applicant_name),h('small',null,`${selected.application_id} · Application received ${fmt(selected.created_at)} · ${selected.department} · ${selected.designation}`)),h('div',{className:'employee-actions'},!isClosed?h('button',{type:'button',className:'btn btn-secondary',onClick:closeCareerApplication,style:{borderColor:'#b31561',color:'#7d1748'}},'Close Application'):h(React.Fragment,null,h('span',{className:'badge',style:{background:'#fde5ec',color:'#a20f3d'}},'🔒 CLOSED'),h('button',{type:'button',className:'btn btn-primary',onClick:reopenCareerApplication},'Reopen Application')),h('button',{type:'button',className:'btn btn-secondary',onClick:backToApplications},'← Back to Applications'))),
      msg?h('div',{className:`message ${(msg.includes('✓')||msg.includes('successfully')||msg.includes('accepted by Meta'))?'success':'error'}`,style:{position:'sticky',top:'8px',zIndex:5,boxShadow:'0 5px 14px rgba(75,24,52,.10)'}},h('strong',null,msg),manualFallbackUrl?h('div',{style:{marginTop:'10px'}},h('button',{type:'button',className:'btn btn-whatsapp',onClick:()=>window.open(manualFallbackUrl,'_blank','noopener')},'Open Manual WhatsApp Fallback')):null):null,
      isClosed?h('div',{className:'message',style:{background:'#fff1f4',border:'1px solid #e7a8ba',color:'#8f1238',marginBottom:'12px'}},h('strong',null,'🔒 CLOSED APPLICATION — VIEW ONLY'),h('div',{style:{marginTop:'5px'}},'This application cannot be edited, returned, rescheduled, converted or otherwise changed. Use Reopen Application above and enter a mandatory reason to enable editing again.')):null,
      applicantDataIssues(selected).length?h('div',{className:'message error',style:{borderLeft:'5px solid #c31663'}},
        h('strong',null,'Smart HR Pre-screen — attention required'),
        h('div',{style:{marginTop:'7px'}},'The system automatically detected the following possible discrepancies:'),
        h('ol',{style:{margin:'8px 0 8px 22px',padding:0}},applicantDataIssues(selected).map((issue,index)=>h('li',{key:`hr-issue-${index}`,style:{marginBottom:'5px'}},issue))),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'10px'}},
          h('button',{type:'button',className:'btn btn-secondary',onClick:useDetectedRemarks},'Use Detected Reasons & Return'),
          h('small',{style:{alignSelf:'center',color:'#806575'}},'HR can edit, add or remove reasons in HR Remarks before sending.')
        )
      ):h('div',{className:'message success'},h('strong',null,'Smart HR Pre-screen'),h('div',{style:{marginTop:'5px'}},'No obvious discrepancy or duplicate application was automatically detected. HR may still enter any other discrepancy manually.')),
      h('div',{className:'modal-grid'},
        h('div',{className:'span-2',style:{marginTop:'4px',padding:'10px 12px',borderRadius:'10px',background:'#f8eef4',fontWeight:900,color:'#6d123f'}},'1. Application & Personal Details'),
        h('div',{className:'field'},h('label',null,'Title / Applicant'),h('div',null,[selected.title,selected.applicant_name].filter(Boolean).join(' ')||'—')),
        h('div',{className:'field'},h('label',null,'Father / Guardian'),h('div',null,selected.father_guardian_name||'—')),
        h('div',{className:'field'},h('label',null,'Date of Birth'),h('div',null,formatDateIN(selected.date_of_birth))),
        h('div',{className:'field'},h('label',null,'Gender'),h('div',null,selected.gender||'—')),
        h('div',{className:'field'},h('label',null,'Blood Group'),h('div',null,selected.blood_group||'—')),
        h('div',{className:'field'},h('label',null,'Mobile'),h('div',null,selected.mobile||'—')),
        h('div',{className:'field'},h('label',null,'Emergency Contact'),h('div',null,selected.emergency_contact||'—')),
        h('div',{className:'field'},h('label',null,'Email'),h('div',null,selected.email||'—')),
        h('div',{className:'field'},h('label',null,'Identity'),h('div',null,[selected.id_card_type,selected.id_card_number].filter(Boolean).join(' · ')||'—')),
        h('div',{className:'field'},h('label',null,'Qualification'),h('div',null,selected.qualification||'—')),
        h('div',{className:'field'},h('label',null,'Previous Working Place'),h('div',null,selected.previous_workplace||selected.current_employer||'—')),
        h('div',{className:'field'},h('label',null,'Joining Source'),h('div',null,selected.reference_type||'Direct')),
        h('div',{className:'field'},h('label',null,'Reference'),h('div',null,[selected.reference_name,selected.reference_contact].filter(Boolean).join(' · ')||'—')),
        h('div',{className:'span-2',style:{marginTop:'10px',padding:'10px 12px',borderRadius:'10px',background:'#eef8f4',fontWeight:900,color:'#165f4a'}},'2. Contact & Address Details'),
        h('div',{className:'field span-2'},h('label',null,'Current Residential Address'),h('div',null,selected.current_address||[selected.current_flat_no,selected.current_apartment_name,selected.current_house_no,selected.current_street_name,selected.current_locality_area,selected.current_village_town,selected.current_taluk,selected.current_district,selected.current_state,selected.current_pincode].filter(Boolean).join(', ')||selected.address||'—')),
        h('div',{className:'field span-2'},h('label',null,'Permanent Residential Address'),h('div',null,selected.permanent_same_as_current?'Same as Current Address':(selected.permanent_address||[selected.permanent_flat_no,selected.permanent_apartment_name,selected.permanent_house_no,selected.permanent_street_name,selected.permanent_locality_area,selected.permanent_village_town,selected.permanent_taluk,selected.permanent_district,selected.permanent_state,selected.permanent_pincode].filter(Boolean).join(', ')||'—'))),
        h('div',{className:'span-2',style:{marginTop:'10px',padding:'10px 12px',borderRadius:'10px',background:'#fff4e9',fontWeight:900,color:'#8a4e16'}},'3. Professional Details'),
        h('div',{className:'field'},h('label',null,'Experience'),h('div',null,selected.experience||'—')),
        h('div',{className:'field'},h('label',null,'Preferred Shift'),h('div',null,selected.preferred_shift||'—')),
        h('div',{className:'field'},h('label',null,'Current Salary'),h('div',null,selected.current_salary||'—')),
        h('div',{className:'field'},h('label',null,'Expected Salary'),h('div',null,selected.expected_salary||'—')),
        h('div',{className:'field span-2'},h('label',null,'Skills'),h('div',null,(selected.skills||[]).join(', ')||'—')),
        h('div',{className:'field span-2'},h('label',null,'Additional Information'),h('div',null,selected.additional_information||'—')),
        h('div',{className:'span-2',style:{marginTop:'10px',padding:'10px 12px',borderRadius:'10px',background:'#f1effb',fontWeight:900,color:'#5b459d'}},'4. Documents'),
        h('div',{className:'field span-2'},h('label',null,'Documents'),h('div',{className:'employee-actions'},
          selected.resume_path?h('button',{className:'btn btn-secondary',onClick:()=>openDoc(selected.resume_path)},'Open Resume / CV'):null,
          selected.photo_path?h('button',{className:'btn btn-secondary',onClick:()=>openDoc(selected.photo_path)},'Open Employee Photo'):null,
          (selected.qualification_certificate_path||selected.certificate_path)?h('button',{className:'btn btn-secondary',onClick:()=>openDoc(selected.qualification_certificate_path||selected.certificate_path)},'Open Qualification Certificate'):null,
          selected.experience_certificate_path?h('button',{className:'btn btn-secondary',onClick:()=>openDoc(selected.experience_certificate_path)},'Open Experience Certificate'):null,
          selected.other_certificate_path?h('button',{className:'btn btn-secondary',onClick:()=>openDoc(selected.other_certificate_path)},'Open Other Certificate'):null,
          selected.identity_path?h('button',{className:'btn btn-secondary',onClick:()=>openDoc(selected.identity_path)},'Open Identity Proof'):null
        )),
        h('div',{className:'span-2',style:{marginTop:'10px',padding:'10px 12px',borderRadius:'10px',background:'#fcecf4',fontWeight:900,color:'#8b174e'}},'5. HR Processing & Interview'),
        h('div',{className:'field'},h('label',null,'Application Status'),h('select',{value:edit.status||'New',disabled:isClosed,onChange:e=>setEdit({...edit,status:e.target.value})},HR_APPLICATION_STATUSES.map(x=>h('option',{key:x},x)))),
        !isRectification?h('div',{className:'field span-2'},
          h('label',null,'Interview Date & Time'),
          h('div',{style:{display:'grid',gridTemplateColumns:'minmax(170px,1fr) minmax(150px,0.7fr) auto auto',gap:'8px',alignItems:'end'}},
            h('div',null,h('small',{style:{display:'block',marginBottom:'5px',fontWeight:700}},'Date'),h(StrictDateInput,{disabled:isClosed,value:interviewDate,onChange:e=>setInterviewDate(e.target.value)})),
            h('div',null,h('small',{style:{display:'block',marginBottom:'5px',fontWeight:700}},'Time'),h('select',{value:interviewTime,disabled:isClosed,onChange:e=>setInterviewTime(e.target.value)},interviewTimeOptions.map(x=>h('option',{key:x.value,value:x.value},x.label)))),
            h('button',{type:'button',className:'btn btn-primary',disabled:isClosed,onClick:setInterviewSchedule},'Set'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:isClosed,onClick:clearInterviewSchedule},'Clear')
          ),
          edit.interview_at?h('small',{style:{display:'block',marginTop:'7px',fontWeight:700,color:'#7d1748'}},`Selected: ${fmt(edit.interview_at)}`):null
        ):null,
        !isRectification&&(selected.interview_at||edit.status==='Interview Scheduled')?h('div',{className:'field span-2',style:{padding:'12px',border:'1px solid #ead0de',borderRadius:'12px',background:'#fffafd'}},
          h('label',{style:{fontWeight:800,color:'#7d1748'}},'Reschedule Interview'),
          selected.interview_at?h('small',{style:{display:'block',marginBottom:'8px',color:'#806575'}},`Current schedule: ${fmt(selected.interview_at)}`):null,
          h('div',{style:{display:'grid',gridTemplateColumns:'minmax(170px,1fr) minmax(150px,0.7fr) auto',gap:'8px',alignItems:'end'}},
            h('div',null,h('small',{style:{display:'block',marginBottom:'5px',fontWeight:700}},'New Date'),h(StrictDateInput,{value:rescheduleDate,onChange:e=>setRescheduleDate(e.target.value)})),
            h('div',null,h('small',{style:{display:'block',marginBottom:'5px',fontWeight:700}},'New Time'),h('select',{value:rescheduleTime,onChange:e=>setRescheduleTime(e.target.value)},interviewTimeOptions.map(x=>h('option',{key:x.value,value:x.value},x.label)))),
            h('button',{type:'button',className:'btn btn-secondary',onClick:setRescheduledInterview},'Reschedule')
          ),
          h('small',{style:{display:'block',marginTop:'7px',color:'#806575'}},'Use this when Samara needs to change an already scheduled interview. The application will remain marked as Interview Scheduled.')
        ):null,
        !isRectification?h('div',{className:'field'},h('label',null,'Interview Mode'),h('select',{value:edit.interview_mode||'',onChange:e=>{const mode=e.target.value;setEdit({...edit,interview_mode:mode,interview_venue:mode==='Phone'?'':edit.interview_venue})}},['','In Person','Phone','Online'].map(x=>h('option',{key:x,value:x},x||'Select mode')))):null,
        !isRectification&&edit.interview_mode!=='Phone'?h('div',{className:'field'},h('label',null,edit.interview_mode==='Online'?'Google Meet Link':'Interview Venue'),h('input',{type:edit.interview_mode==='Online'?'url':'text',placeholder:edit.interview_mode==='Online'?'https://meet.google.com/xxx-xxxx-xxx':'Samara Assisted Living, Mogappair, Chennai',value:edit.interview_venue||'',onChange:e=>setEdit({...edit,interview_venue:e.target.value})}),edit.interview_mode==='Online'?h('small',{style:{display:'block',marginTop:'5px',color:'#806575'}},'Required for Online interview. This link will be included in the WhatsApp message.'):null):null,
        isRectification?h('div',{className:'message',style:{gridColumn:'1 / -1',background:'#fff7fb',border:'1px solid #ead0de',color:'#7d1748'}},h('strong',null,'Rectification only — no interview is scheduled'),h('div',{style:{marginTop:'5px'}},'Enter the discrepancy / correction required in HR Remarks, then click Return for Rectification. The ERP will first use the approved WhatsApp API template; the existing WhatsApp method remains available as fallback.')):null,
        h('div',{className:'field span-2'},h('label',null,'HR Remarks'),h('textarea',{rows:3,disabled:isClosed,value:edit.hr_remarks||'',onChange:e=>setEdit({...edit,hr_remarks:e.target.value}),placeholder:'Enter discrepancies / clarification required. Mandatory when returning the application for rectification.'}),h('small',{style:{display:'block',marginTop:'6px',color:'#806575'}},'For Return for Rectification, specify exactly what the applicant must correct or clarify.')),
        !isRectification?h('div',{className:'field span-2'},h('label',null,'Interview Result / Notes'),h('textarea',{rows:3,disabled:isClosed,value:edit.interview_result||'',onChange:e=>setEdit({...edit,interview_result:e.target.value})})):null
      ),
      h('div',{className:'card panel',style:{marginTop:'14px',background:'#fffafd',border:'1px solid #ead0de'}},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'6. WhatsApp Communication History'),h('small',null,'Chat-style chronological log — messages sent by Samara and replies received from the applicant'))),
        waHistory.length?h('div',{style:{display:'grid',gap:'10px',padding:'6px 0'}},waHistory.map(item=>{
          const inbound=String(item.direction||'outbound').toLowerCase()==='inbound';
          const bubbleBg=inbound?'#ffffff':'#e9f8ef';
          const align=inbound?'flex-start':'flex-end';
          const status=String(item.status||'Recorded');
          const statusMark=status.toLowerCase()==='read'?'✓✓ Read':status.toLowerCase()==='delivered'?'✓✓ Delivered':status.toLowerCase()==='sent'?'✓ Sent':status.toLowerCase().includes('accept')?'✓ Accepted':status;
          return h('div',{key:item.id,style:{display:'flex',justifyContent:align}},
            h('div',{style:{width:'min(82%,760px)',padding:'11px 13px',border:'1px solid #dfd7dc',borderRadius:inbound?'6px 16px 16px 16px':'16px 6px 16px 16px',background:bubbleBg,boxShadow:'0 2px 7px rgba(55,35,45,.06)'}},
              h('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',alignItems:'center',flexWrap:'wrap'}},
                h('strong',{style:{color:inbound?'#315d54':'#5d1039'}},inbound?(item.contact_name||item.applicant_name||'Applicant'):(item.communication_type||'Samara WhatsApp')),
                h('span',{style:{...waStatusStyle(status),display:'inline-block',padding:'3px 8px',borderRadius:'999px',fontSize:'11px',fontWeight:800}},inbound?'Received':statusMark)
              ),
              item.message_content?h('div',{style:{marginTop:'8px',whiteSpace:'pre-wrap',fontSize:'14px',lineHeight:'1.5',color:'#2e252a'}},window.SamaraDateTime.text(item.message_content)):h('div',{style:{marginTop:'8px',fontSize:'13px',fontStyle:'italic',color:'#8a7180'}},item.template_name?`Template: ${item.template_name}`:'Message content was not stored for this older record.'),
              h('div',{style:{marginTop:'8px',display:'flex',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',fontSize:'11px',color:'#8a7180'}},
                h('span',null,formatDateTimeIN(item.received_at||item.sent_at||item.created_at)),
                h('span',null,inbound?`From ${item.recipient_number||'—'}`:`To ${item.recipient_number||'—'} · ${item.sent_by_name||'ERP User'}`)
              ),
              item.template_name&&!inbound?h('div',{style:{marginTop:'4px',fontSize:'10px',color:'#a08896'}},`Template: ${item.template_name}${item.provider_message_id?` · Meta ID: ${item.provider_message_id}`:''}`):null,
              item.error_message?h('div',{style:{marginTop:'6px',fontSize:'12px',color:'#a51d2c'}},item.error_message):null
            )
          );
        })):h('p',{className:'empty'},'No WhatsApp communication has been recorded for this applicant yet.')
      ),
      !isClosed?h('div',{className:'employee-actions'},h('button',{className:'btn btn-primary',onClick:save},'Save HR Update'),h('button',{type:'button',className:'btn btn-secondary',disabled:waBusy,onClick:returnForRectification,style:{borderColor:'#b31561',color:'#7d1748'}},waBusy?'Please wait…':'Return & Send WhatsApp API'),!isRectification?h('button',{type:'button',className:'btn btn-whatsapp',disabled:waBusy,onClick:sendInterviewWhatsApp},waBusy?'Sending…':'Send Interview WhatsApp API'):null,!isRectification&&(selected.interview_at&&edit.interview_at&&selected.interview_at!==edit.interview_at)?h('button',{type:'button',className:'btn btn-whatsapp',disabled:waBusy,onClick:sendRescheduleWhatsApp},waBusy?'Sending…':'Send Reschedule WhatsApp API'):null,!isRectification&&['Selected','Shortlisted','Interview Scheduled'].includes(edit.status)?h('button',{className:'btn btn-secondary',onClick:()=>convert(edit)},'Create Employee from Application'):null):h('div',{className:'message',style:{marginTop:'14px',background:'#fff1f4',border:'1px solid #e7a8ba',color:'#8f1238'}},h('strong',null,'🔒 Application closed — all HR editing/actions are locked. Reopen to make further changes.')),
      h('div',{style:{display:'flex',justifyContent:'center',padding:'14px 0 4px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:backToApplications,style:{minWidth:'180px'}},'← Back to Applications'))
    )):null;
    return selected&&edit?modal:h(Section,{title:'Career Applications',subtitle:'Click any applicant row to open the complete applicant file in chronological sections'},table);
  }

    function interviewModeDetails(row){
      const mode=String(row?.interview_mode||'In Person').trim()||'In Person';
      const detail=String(row?.interview_venue||'').trim();
      if(mode==='Online')return {mode,detail:detail?`Online interview link: ${detail}`:'Online interview link will be shared by HR.'};
      if(mode==='Phone')return {mode,detail:'HR will contact you on your registered mobile number at the scheduled time.'};
      const atSamara=!detail||/\bsamara\b|சமரா/i.test(detail);
      const location=atSamara?' Google Maps: https://maps.app.goo.gl/NwdW9T6WFnosJg8V7?g_st=iw':'';
      return {mode:'In Person',detail:`Venue: ${detail||'Samara Assisted Living, Mogappair, Chennai – 37'}.${location} Please bring your relevant certificates and identification documents.`};
    }
  function interviewTestMessage(){
    const params=['Test Applicant (test only)','Staff Nurse','20-09-2026','10:00 AM','In Person',interviewModeDetails({interview_mode:'In Person'}).detail];
    return {params,text:`Dear ${params[0]},\n\nThank you for your interest in joining Samara Assisted Living.\n\nWe are pleased to invite you for an interview for the position of ${params[1]}.\n\nInterview Date: ${params[2]}\nInterview Time: ${params[3]}\nInterview Mode: ${params[4]}\n\n${params[5]}\n\nKindly be available about 10 minutes before the scheduled time.\n\nWe look forward to meeting you.\n\nRegards,\nDr. Chella Boomi\nDirector\nSamara Health Care LLP\nContact: 9976735577`};
  }
  function InterviewWhatsAppTest({profile}){
    const [open,setOpen]=React.useState(false);
    const [busy,setBusy]=React.useState(false);
    const [accepted,setAccepted]=React.useState(false);
    const [message,setMessage]=React.useState('');
    const sending=React.useRef(false);
    if(profile?.role!=='Admin')return null;
    const sample=interviewTestMessage();
    async function sendTest(){
      if(sending.current||accepted)return;
      sending.current=true;setBusy(true);setMessage('Sending test message…');
      try{
        const result=await sendWhatsAppTemplate({to:'919176735577',templateName:'samara_interview_scheduled',languageCode:'en',bodyParams:sample.params});
        setAccepted(true);
        setMessage('Test accepted by Meta. Please check WhatsApp on +91 9176735577 and open the map link. Acceptance does not confirm delivery.');
        try{
          const now=new Date().toISOString();
          const {error}=await client.from('hr_whatsapp_communications').insert({
            career_application_id:null,application_id:null,applicant_name:'Test Applicant (test only)',recipient_number:'919176735577',
            communication_type:'Interview Template Test',template_name:'samara_interview_scheduled',status:'Accepted',provider_message_id:result.provider_message_id,
            sent_by:profile.id,sent_by_name:formalName(profile),direction:'outbound',message_type:'template',message_content:sample.text,
            message_payload:{body_params:sample.params,test_only:true},contact_name:'Interview test recipient',source_type:'Template Test',sent_at:now,created_at:now,updated_at:now
          });
          if(error)throw error;
        }catch(_){setMessage('Test accepted by Meta, but saving its ERP history failed. Do not resend; check WhatsApp on +91 9176735577.');}
      }catch(error){setMessage(`Test could not be confirmed: ${error.message||error}. Check WhatsApp before retrying to avoid a duplicate.`);}
      finally{sending.current=false;setBusy(false);}
    }
    return h('div',{style:{marginBottom:'16px'}},
      h('button',{type:'button',className:'btn btn-secondary','aria-expanded':open,onClick:()=>setOpen(!open)},open?'Hide interview test':'Preview test interview message'),
      open?h('div',{className:'field',style:{marginTop:'12px',padding:'16px',border:'1px solid #ead0de',borderRadius:'12px',background:'#fffafd'}},
        h('h3',null,'Test interview WhatsApp'),
        h('p',null,'To: +91 9176735577 · Fictional applicant · No interview record will be created.'),
        h('small',null,'Approved template: samara_interview_scheduled · English'),
        h('div',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:'16px',margin:'12px 0',background:'#fff',color:'#331526',border:'1px solid #ead0de',borderRadius:'12px',maxWidth:'580px'}},sample.text),
        h('button',{type:'button',className:'btn btn-whatsapp',disabled:busy||accepted,onClick:sendTest},busy?'Sending…':accepted?'Test accepted by Meta':'Send one test to +91 9176735577'),
        message?h('p',{role:'status','aria-live':'polite'},message):null
      ):null
    );
  }

  function HRInterviews({profile,onNavigate}){
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    async function load(){const {data}=await client.from('career_applications').select('*').not('interview_at','is',null).order('interview_at',{ascending:true});setRows(data||[])}
    React.useEffect(()=>{load();const ch=client.channel('hr-interviews-live').on('postgres_changes',{event:'*',schema:'public',table:'career_applications'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    return h(Section,{title:'Interviews',subtitle:'Scheduled recruitment interviews and candidate status'},
      h(InterviewWhatsAppTest,{profile}),
      h('div',{className:'panel-head'},h('div',null),h('button',{className:'btn btn-primary',onClick:()=>onNavigate('Career Applications')},'Manage Applications')),
      h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Applicant','Department / Designation','Interview','Mode','Venue / Link','Status'].map(x=>h('th',{key:x},x)))),h('tbody',null,rows.map(r=>h('tr',{key:r.id},h('td',null,r.applicant_name),h('td',null,`${r.department} · ${r.designation}`),h('td',null,fmt(r.interview_at)),h('td',null,r.interview_mode||'—'),h('td',null,r.interview_venue||'—'),h('td',null,h('span',{className:'badge'},r.status)))),rows.length===0?h('tr',null,h('td',{colSpan:6,className:'empty'},'No interviews scheduled.')):null)))
    );
  }



