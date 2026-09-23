  const normalizeLogin = value => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');
  const loginEmail = value => `${normalizeLogin(value)}@${cfg.employeeEmailDomain}`;
  const pad2 = value => String(value).padStart(2,'0');
  const SAMARA_WHATSAPP_LOGO_URL='https://samaraassistedliving.com/assets/samara-logo.png';
  const brandWhatsAppText = text => {
    const raw=String(text||'').trim();
    if(raw.includes(SAMARA_WHATSAPP_LOGO_URL))return raw;
    return `SAMARA ASSISTED LIVING\nCompassion • Comfort • Dignity\n\n${raw}`;
  };

  const normalizeWhatsAppRecipient = value => {
    const digits=String(value||'').replace(/\D/g,'');
    if(!digits)return '';
    if(digits.length===10)return `91${digits}`;
    if(digits.length===11&&digits.startsWith('0'))return `91${digits.slice(1)}`;
    return digits;
  };
  const FAMILY_COUNTRY_CODES=[
    ['India','+91'],['United Arab Emirates','+971'],['United States / Canada','+1'],['United Kingdom','+44'],
    ['Singapore','+65'],['Australia','+61'],['Saudi Arabia','+966'],['Qatar','+974'],['Oman','+968'],['Kuwait','+965'],
    ['Bahrain','+973'],['Malaysia','+60'],['New Zealand','+64'],['Germany','+49'],['France','+33'],['Ireland','+353'],
    ['Italy','+39'],['Netherlands','+31'],['Switzerland','+41'],['Japan','+81'],['South Korea','+82'],['Sri Lanka','+94'],
    ['Bangladesh','+880'],['Nepal','+977'],['Pakistan','+92'],['South Africa','+27']
  ];
  const splitGlobalPhone = value => {
    const raw=String(value||'').trim();
    const digits=raw.replace(/\D/g,'');
    if(!digits)return {country_code:'+91',mobile:''};
    // Legacy Samara records containing a bare 10-digit number are Indian.
    if(!raw.startsWith('+')&&digits.length===10)return {country_code:'+91',mobile:digits};
    const dial=FAMILY_COUNTRY_CODES.map(x=>x[1]).sort((a,b)=>b.length-a.length).find(code=>digits.startsWith(code.replace(/\D/g,'')));
    if(dial){const codeDigits=dial.replace(/\D/g,'');return {country_code:dial,mobile:digits.slice(codeDigits.length).slice(0,14)};}
    if(digits.length===12&&digits.startsWith('91'))return {country_code:'+91',mobile:digits.slice(2)};
    return {country_code:'+91',mobile:digits.slice(-10)};
  };
  const globalPhoneValue = (countryCode,mobile) => {
    const code=String(countryCode||'+91').replace(/\D/g,'').slice(0,3);
    const local=String(mobile||'').replace(/\D/g,'').slice(0,14);
    return code&&local?`+${code} ${local}`:'';
  };
  const validateGlobalPhone = (countryCode,mobile,label='mobile number') => {
    const selected=FAMILY_COUNTRY_CODES.find(([,dial])=>dial===countryCode);
    if(!selected)throw new Error(`Select a country code for ${label}.`);
    const code=selected[1].replace(/\D/g,'');
    const local=String(mobile||'').replace(/\D/g,'');
    if(selected[1]==='+91'&&local.length!==10)throw new Error(`Enter a valid 10-digit Indian ${label}.`);
    if(selected[1]!=='+91'&&(local.length<4||code.length+local.length>15))throw new Error(`Enter a valid ${selected[0]} ${label}.`);
    return `${selected[1]} ${local}`;
  };
  const compactWhatsAppParam = (value,max=60,fallback='—') => {
    const clean=String(value??'').replace(/\s+/g,' ').trim();
    if(!clean)return fallback;
    if(clean.length<=max)return clean;
    return `${clean.slice(0,Math.max(1,max-1)).trim()}…`;
  };
  const familyPortalTemplateParams = ({relativeName,patientName,admissionDate,patientId,reason,proposedStay,roomBed}) => [
    compactWhatsAppParam(relativeName,40,'Family Member'),
    compactWhatsAppParam(patientName,50,'Patient'),
    compactWhatsAppParam(admissionDate,20,'—'),
    compactWhatsAppParam(patientId,30,'—'),
    compactWhatsAppParam(reason,45,'Assisted living care'),
    compactWhatsAppParam(proposedStay,28,'As per agreed care plan'),
    compactWhatsAppParam(roomBed,35,'—')
  ];
  async function sendWhatsAppTemplate({to,templateName,languageCode='en',bodyParams=[],headerImage=SAMARA_WHATSAPP_LOGO_URL,communicationLog=null}){
    const recipient=normalizeWhatsAppRecipient(to);
    if(!recipient)throw new Error('A valid WhatsApp number is required.');
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/whatsapp-send`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`,
        'apikey':cfg.supabasePublishableKey
      },
      body:JSON.stringify({
        to:recipient,
        template_name:templateName,
        language_code:languageCode,
        header_image:headerImage||null,
        body_params:(bodyParams||[]).map(value=>String(value??'')),
        communication_log:communicationLog||null
      })
    });
    const result=await response.json().catch(()=>({success:false,error:'Unable to read WhatsApp server response.'}));
    if(!response.ok||result?.success===false){
      const metaMessage=result?.error?.error?.message||result?.error?.message||result?.error||`WhatsApp request failed (${response.status})`;
      throw new Error(typeof metaMessage==='string'?metaMessage:JSON.stringify(metaMessage));
    }
    const providerMessageId=result?.provider_message_id||result?.result?.messages?.[0]?.id||result?.messages?.[0]?.id||'';
    if(!providerMessageId)throw new Error('Meta did not return a WhatsApp message ID. The message is NOT confirmed as accepted.');
    return {...result,provider_message_id:providerMessageId};
  }

  // Welcome sends keep acceptance separate from Inbox persistence: retrying logging never sends again.
  async function sendEmployeeWelcomeRecorded(request){
    const number=normalizeWhatsAppRecipient(request.to);
    const key='samara_employee_welcome_accepted:'+String(request.communicationLog.message_payload.employee_id);
    const pending=JSON.parse(localStorage.getItem(key)||'null');
    if(!pending&&!request.communicationLog.message_payload.resend){
      const {data,error}=await client.from('hr_whatsapp_communications').select('id').eq('template_name','employee_welcome_samara').eq('recipient_number',number).limit(1);
      if(error)throw new Error('Unable to check previous welcomes. No message sent. '+error.message);
      if(data?.length)return {history_logged:true,already_sent:true};
    }
    const result=pending?.result||await sendWhatsAppTemplate(request);
    const log=pending?.log||request.communicationLog;
    const sentAt=pending?.sentAt||new Date().toISOString();
    if(result.history_logged===true){localStorage.removeItem(key);return result;}
    try{localStorage.setItem(key,JSON.stringify({result,log,sentAt}));}catch(error){console.warn('Unable to retain welcome logging recovery',error);}
    try{
      const {data,error}=await client.from('hr_whatsapp_communications').select('id').eq('provider_message_id',result.provider_message_id).limit(1);
      if(error)throw error;
      if(!data?.length){
        const {error:insertError}=await client.from('hr_whatsapp_communications').insert({
          recipient_number:number,template_name:'employee_welcome_samara',communication_type:log.communication_type,
          status:'Accepted',provider_message_id:result.provider_message_id,direction:'outbound',message_type:'template',
          message_content:log.message_content,message_payload:log.message_payload,contact_name:log.contact_name,
          source_type:log.source_type,sent_by:log.sent_by,sent_by_name:log.sent_by_name,
          sent_at:sentAt,created_at:sentAt,updated_at:sentAt
        });
        if(insertError)throw insertError;
      }
      localStorage.removeItem(key);
      return {...result,history_logged:true};
    }catch(error){return {...result,history_logged:false,history_error:error.message};}
  }

  async function sendWhatsAppText({to,text}){
    const recipient=normalizeWhatsAppRecipient(to);
    const clean=String(text||'').trim();
    if(!recipient)throw new Error('A valid WhatsApp number is required.');
    if(!clean)throw new Error('Please enter a reply.');
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/whatsapp-send`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
      body:JSON.stringify({to:recipient,message_type:'text',text:clean})
    });
    const result=await response.json().catch(()=>({success:false,error:'Unable to read WhatsApp server response.'}));
    if(!response.ok||result?.success===false){
      const metaMessage=result?.error?.error?.message||result?.error?.message||result?.error||`WhatsApp request failed (${response.status})`;
      throw new Error(typeof metaMessage==='string'?metaMessage:JSON.stringify(metaMessage));
    }
    const providerMessageId=result?.provider_message_id||result?.result?.messages?.[0]?.id||result?.messages?.[0]?.id||'';
    if(!providerMessageId)throw new Error('Meta did not return a WhatsApp message ID. The message is NOT confirmed as accepted.');
    return {...result,provider_message_id:providerMessageId};
  }

