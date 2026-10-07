  // ---------------------------------------------------------------------------------------------
  // 2.15.83 Discharge Summary (PDF) — shared by the Patient card and the Discharge workflow.
  // The PDF is built by the Edge Function "discharge-summary" from ALL records of the stay.
  //   * Open / Save PDF
  //   * Send PDF by WhatsApp API (template samara_discharge_summary, PDF attached)
  //   * Existing WhatsApp: share the PDF file into WhatsApp (phones) or download it and open the chat
  // ---------------------------------------------------------------------------------------------
  async function callDischargeSummary(body){
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/discharge-summary`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
      body:JSON.stringify(body)
    });
    const result=await response.json().catch(()=>({ok:false,error:`The Discharge Summary service did not answer (${response.status}). Please check that the Edge Function "discharge-summary" is deployed.`}));
    if(!response.ok||result?.ok===false){const error=new Error(result?.error||`Discharge Summary failed (${response.status})`);error.result=result;throw error}
    return result;
  }
  // Called automatically right after the final discharge (and by Send buttons).
  async function sendDischargeSummaryWhatsAppApi({dischargeId,to,recipientName,automatic=false}){
    const recipient=normalizeWhatsAppRecipient(to);
    if(!recipient)throw new Error('A valid family WhatsApp number is required.');
    return callDischargeSummary({mode:'send',discharge_id:dischargeId,recipient_mobile:recipient,recipient_name:recipientName||'Family Member',automatic:Boolean(automatic)});
  }
  function dischargeSummaryContacts(patient,discharge,familyAccess){
    const list=[];const seen=new Set();
    const add=(name,relationship,mobile)=>{const key=String(mobile||'').replace(/\D/g,'').slice(-10);if(key.length!==10||seen.has(key))return;seen.add(key);list.push({name:String(name||'').trim()||'Family Member',relationship:String(relationship||'').trim(),mobile:String(mobile||'').trim()})};
    (familyAccess||[]).filter(row=>row?.is_active!==false).forEach(row=>add(row.relative_name,row.relationship||(row.primary_contact?'Primary contact':''),row.mobile));
    add(discharge?.received_by_name||patient?.attendant_name,discharge?.received_by_relationship||'Attendant',discharge?.received_by_contact);
    add(patient?.attendant_name,'Attendant',patient?.attendant_phone);
    add(patient?.attendant_name,'Attendant (alternate)',patient?.attendant_alternative_phone);
    return list;
  }

  function DischargeSummaryDialog({patient,discharge,familyAccess,profile,onClose,onUpdated}){
    const canSend=['Admin','Manager'].includes(profile?.role);
    const contacts=React.useMemo(()=>dischargeSummaryContacts(patient,discharge,familyAccess),[patient?.id,discharge?.id,familyAccess]);
    const [pick,setPick]=React.useState(0);
    const [busy,setBusy]=React.useState('');
    const [note,setNote]=React.useState(null);
    const [prepared,setPrepared]=React.useState(null); // {file,url,name} for Existing WhatsApp
    const [status,setStatus]=React.useState({state:discharge?.discharge_summary_whatsapp_status||'',at:discharge?.discharge_summary_whatsapp_sent_at||'',error:discharge?.discharge_summary_whatsapp_error||''});
    React.useEffect(()=>()=>{if(prepared?.url)URL.revokeObjectURL(prepared.url)},[prepared]);
    const contact=contacts[pick]||null;
    const guest=formalName(patient)||patient?.full_name||'Guest';
    const departure=discharge?.actual_departure_at||discharge?.final_departure_at||discharge?.completed_at;
    const canShareFiles=(()=>{try{return Boolean(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.pdf',{type:'application/pdf'})]}))}catch(_e){return false}})();
    const messageText=()=>`Dear ${contact?.name||'Family Member'},\n\nPlease find attached the Discharge Summary of ${guest} for the stay at Samara Assisted Living from ${formatDateIN(patient?.admission_date)} to ${formatDateIN(String(departure||'').slice(0,10))}.\n\nThis summary is confidential and meant only for the family and the treating doctor. Please keep it for future medical visits.\n\nFor any help, please contact the Samara nursing team on 7395961616.\n\nSamara Health Care LLP`;
    async function logManual(route){
      try{await client.from('patient_communications').insert({patient_id:patient.id,communication_type:'Discharge Summary',method:'WhatsApp (existing)',recipient_type:'Relative',recipient_name:contact?.name||null,recipient_number:normalizeWhatsAppRecipient(contact?.mobile||''),status:route,message_preview:'Discharge Summary PDF shared through existing WhatsApp',created_at:new Date().toISOString()})}catch(_e){}
    }
    async function openPdf(){
      const tab=window.open('about:blank','_blank');
      setBusy('open');setNote(null);
      try{
        const r=await callDischargeSummary({mode:'generate_only',discharge_id:discharge.id});
        if(tab)tab.location.href=r.report_url;else window.open(r.report_url,'_blank','noopener');
        setNote({type:'success',text:'Discharge Summary PDF opened in a new tab. Use Print / Save there.'});
      }catch(error){if(tab)tab.close();setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function sendApi(){
      if(!contact)return setNote({type:'error',text:'No registered family WhatsApp number. Add one in Family Details first.'});
      setBusy('api');setNote(null);
      try{
        const r=await sendDischargeSummaryWhatsAppApi({dischargeId:discharge.id,to:contact.mobile,recipientName:contact.name});
        const now=new Date().toISOString();
        setStatus({state:'Accepted',at:now,error:''});onUpdated?.({discharge_summary_whatsapp_status:'Accepted',discharge_summary_whatsapp_sent_at:now,discharge_summary_whatsapp_error:null});
        setNote({type:'success',text:`Discharge Summary PDF accepted by Meta for ${contact.name} (${contact.mobile})${/24-hour/.test(r.route||'')?' — sent as a direct PDF because the template is not approved yet':''}. It is recorded in WhatsApp Inbox.`});
      }catch(error){
        setStatus({state:'Failed',at:'',error:error.message||String(error)});onUpdated?.({discharge_summary_whatsapp_status:'Failed'});
        setNote({type:'error',text:`${error.message||error}`});
      }
      setBusy('');
    }
    async function preparePdf(){
      setBusy('prepare');setNote(null);
      try{
        const r=await callDischargeSummary({mode:'generate_only',discharge_id:discharge.id});
        const blob=await fetch(r.report_url).then(res=>{if(!res.ok)throw new Error('The PDF could not be downloaded.');return res.blob()});
        const file=new File([blob],r.file_name||`${guest} - Discharge Summary.pdf`,{type:'application/pdf'});
        setPrepared({file,url:URL.createObjectURL(blob),name:file.name});
        setNote({type:'success',text:canShareFiles?'PDF ready. Tap "Share PDF to WhatsApp" and choose the family chat.':'PDF ready. Download it, then open the WhatsApp chat and attach the PDF.'});
      }catch(error){setNote({type:'error',text:error.message||String(error)})}
      setBusy('');
    }
    async function sharePdf(){
      if(!prepared)return;
      try{await navigator.share({files:[prepared.file],title:prepared.name,text:messageText()});await logManual('Shared');setNote({type:'success',text:'Shared. Check that it reached the right family chat.'})}
      catch(error){if(error?.name!=='AbortError')setNote({type:'error',text:`Sharing failed: ${error.message||error}. Use Download PDF instead.`})}
    }
    function downloadPdf(){
      if(!prepared)return;
      const a=document.createElement('a');a.href=prepared.url;a.download=prepared.name;document.body.appendChild(a);a.click();a.remove();
    }
    function openChat(){
      const number=normalizeWhatsAppRecipient(contact?.mobile||'');
      if(!number)return setNote({type:'error',text:'No WhatsApp number for this contact.'});
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(brandWhatsAppText(messageText()))}`,'_blank','noopener');
      logManual('Opened');
    }
    const statusPill=status.state==='Accepted'
      ?h('span',{className:'pill',style:{background:'#e8f6ee',color:'#0a8a4a'}},`WhatsApp PDF sent ✓${status.at?` · ${formatDateIN(String(status.at).slice(0,10))} ${formatTimeIN(status.at)}`:''}`)
      :status.state==='Failed'?h('span',{className:'pill warning',title:status.error||''},'WhatsApp PDF failed')
      :h('span',{className:'pill'},'WhatsApp PDF not sent yet');
    return h('div',{className:'modal-backdrop discharge-summary-backdrop',style:{zIndex:12000},onClick:e=>{if(e.target===e.currentTarget)onClose()}},h('div',{className:'card modal discharge-summary-modal',style:{maxWidth:'640px'}},
      h('style',null,`.discharge-summary-modal .ds-contacts{display:grid;gap:8px;margin:8px 0 4px}
.discharge-summary-modal .ds-contact{display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid #ecd2df;border-radius:12px;cursor:pointer;background:#fff}
.discharge-summary-modal .ds-contact.on{border-color:#b8055a;background:#fdf1f6}
.discharge-summary-modal .ds-contact small{display:block;color:#7a5e6d}
.discharge-summary-modal .ds-block{border-top:1px solid #f0dbe5;padding-top:12px;margin-top:12px}
.discharge-summary-modal .ds-block h4{margin:0 0 4px;color:#7a0c43;font-size:14px}
.discharge-summary-modal .ds-block p{margin:0 0 8px;color:#6b5560;font-size:13px}
.discharge-summary-modal .actions{flex-wrap:wrap}`),
      h('div',{className:'panel-head'},
        h('div',null,h('h3',null,'Discharge Summary'),h('small',null,`${guest} · ${patient?.patient_id||''} · Discharged ${formatDateIN(String(departure||'').slice(0,10))} ${formatTimeIN(departure)}`)),
        h('button',{type:'button',className:'close',onClick:onClose},'×')),
      h('p',{className:'small-note',style:{marginTop:0}},'Built automatically from all records of the stay: vitals, medicines, doctor reviews, care, food, handovers and discharge details.'),
      h('div',{className:'actions'},
        h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:openPdf},busy==='open'?'Preparing PDF…':'Open / Save PDF'),
        statusPill),
      h('div',{className:'ds-block'},
        h('h4',null,'Send to family'),
        contacts.length
          ?h('div',{className:'ds-contacts',role:'radiogroup'},contacts.map((c,i)=>h('label',{key:c.mobile,className:`ds-contact ${i===pick?'on':''}`},
              h('input',{type:'radio',name:'ds-contact',id:`ds-contact-${i}`,checked:i===pick,onChange:()=>setPick(i)}),
              h('span',null,h('strong',null,c.name),h('small',null,`${c.relationship?`${c.relationship} · `:''}${c.mobile}`)))))
          :h('div',{className:'message warning'},'No registered family WhatsApp number. Add one in Family Details first.')),
      canSend&&h('div',{className:'ds-block'},
        h('h4',null,'WhatsApp API (PDF attached)'),
        h('p',null,'Sends the Discharge Summary PDF from the Samara WhatsApp number. It is recorded in WhatsApp Inbox.'),
        h('button',{type:'button',className:'btn btn-whatsapp',disabled:!!busy||!contact,onClick:sendApi},busy==='api'?'Generating & sending PDF…':status.state==='Accepted'?'Resend PDF · WhatsApp API':'Send PDF · WhatsApp API')),
      h('div',{className:'ds-block'},
        h('h4',null,'Existing WhatsApp'),
        h('p',null,canShareFiles?'Prepare the PDF, then share it straight into the family WhatsApp chat from this phone.':'Prepare the PDF, download it, then open the family chat in WhatsApp Web and attach it.'),
        h('div',{className:'actions'},
          !prepared&&h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:preparePdf},busy==='prepare'?'Preparing PDF…':'Prepare PDF'),
          prepared&&canShareFiles&&h('button',{type:'button',className:'btn btn-whatsapp',onClick:sharePdf},'Share PDF to WhatsApp'),
          prepared&&h('button',{type:'button',className:'btn btn-secondary',onClick:downloadPdf},'Download PDF'),
          prepared&&h('button',{type:'button',className:'btn btn-secondary',disabled:!contact,onClick:openChat},'Open WhatsApp chat'))),
      note&&h('div',{className:`message ${note.type}`,style:{marginTop:'12px'}},note.text),
      h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))
    ));
  }
