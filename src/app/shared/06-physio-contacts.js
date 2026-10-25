  // 2.18.124 (SQL 292): physiotherapist phone numbers for staff — 📞 Call / 💬 WhatsApp.
  // Numbers are kept in Physiotherapy → Therapist Accounts (Admin). Staff read names + phones only (no fees).
  // On a phone "Call" dials; on a laptop the number is shown large and a click copies it. WhatsApp opens the
  // staff member's own WhatsApp (app or WhatsApp Web) with that physiotherapist.
  let physioContactCache=null,physioContactPromise=null;
  const physioContactListeners=new Set();
  function physioNormName(s){return String(s||'').replace(/^\s*dr\.?\s*/i,'').toLowerCase().replace(/[^a-z]/g,'')}
  function physioPhoneDigits(p){let d=String(p||'').replace(/\D/g,'');if(d.length===12&&d.startsWith('91'))d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return /^[6-9]\d{9}$/.test(d)?d:''}
  function physioOnPhoneDevice(){try{return window.matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent||'')}catch(_e){return false}}
  function loadPhysioContacts(){
    if(physioContactPromise)return physioContactPromise;
    physioContactPromise=Promise.all([
      client.rpc('physio_contact_directory'),
      client.rpc('physio_today_contacts',{p_date:todayISOIndia()})
    ]).then(([dir,today])=>{
      physioContactCache={
        organisations:dir.error?[]:(dir.data?.organisations||[]),
        practitioners:dir.error?[]:(dir.data?.practitioners||[]),
        today:today.error||!Array.isArray(today.data)?[]:today.data,
        date:todayISOIndia(),at:Date.now(),error:dir.error?.message||''
      };
      physioContactListeners.forEach(f=>f(physioContactCache));
      return physioContactCache;
    }).catch(e=>({organisations:[],practitioners:[],today:[],error:e?.message||'Unable to load phone numbers'}))
      .finally(()=>{physioContactPromise=null});
    return physioContactPromise;
  }
  function usePhysioContacts(){
    const [contacts,setContacts]=React.useState(physioContactCache);
    React.useEffect(()=>{
      let alive=true;const update=v=>{if(alive)setContacts(v)};
      physioContactListeners.add(update);
      const stale=!physioContactCache||Date.now()-physioContactCache.at>10*60000||physioContactCache.date!==todayISOIndia();
      if(stale)loadPhysioContacts().then(update);
      return()=>{alive=false;physioContactListeners.delete(update)};
    },[]);
    return contacts;
  }
  // Finds the physiotherapist (and their organisation) from a session / plan: ids first, then the name.
  function resolvePhysioContact(contacts,{organisationId,practitionerId,name}={}){
    if(!contacts)return null;
    const n=physioNormName(name),orgs=contacts.organisations||[],people=contacts.practitioners||[];
    let person=people.find(p=>p.id===practitionerId)||null;
    if(!person&&n)person=people.find(p=>(!organisationId||p.organisation_id===organisationId)&&physioNormName(p.full_name)===n)||people.find(p=>physioNormName(p.full_name)===n)||null;
    let org=orgs.find(o=>o.id===(organisationId||person?.organisation_id))||null;
    if(!org&&n)org=orgs.find(o=>physioNormName(o.name)===n||(n.startsWith('vinayaga')&&physioNormName(o.name).startsWith('vinayaga')))||null;
    return person||org?{person,org}:null;
  }
  function PhysioPhoneButtons({label,phone}){
    const [copied,setCopied]=React.useState(false);
    const d=physioPhoneDigits(phone);if(!d)return null;
    const shown=d.slice(0,5)+' '+d.slice(5),stop=e=>e.stopPropagation();
    const copy=e=>{e.stopPropagation();try{navigator.clipboard.writeText(d).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1600)}).catch(()=>{})}catch(_e){}};
    return h('span',{className:'physio-contact-line','data-no-translate':'true'},
      label?h('small',{className:'physio-contact-label'},label):null,
      physioOnPhoneDevice()
        ?h('a',{className:'btn btn-secondary physio-call',href:'tel:+91'+d,onClick:stop,'aria-label':'Call '+(label||'physiotherapist')},'📞 Call '+shown)
        :h('button',{type:'button',className:'btn btn-secondary physio-call',onClick:copy,title:'Click to copy the number'},copied?'✓ Copied':'📞 '+shown),
      h('a',{className:'btn btn-secondary physio-wa',href:'https://wa.me/91'+d,target:'_blank',rel:'noopener noreferrer',onClick:stop,'aria-label':'WhatsApp '+(label||'physiotherapist')},'💬 WhatsApp'));
  }
  // showName: print the physiotherapist's name beside the buttons (when it isn't already shown nearby).
  function PhysioContact({organisationId,practitionerId,name,showName=false}){
    const contacts=usePhysioContacts();
    const found=resolvePhysioContact(contacts,{organisationId,practitionerId,name});
    if(!found)return null;
    const {person,org}=found,pPhone=physioPhoneDigits(person?.phone),oPhone=physioPhoneDigits(org?.phone);
    if(!pPhone&&!oPhone)return h('small',{className:'physio-nophone'},'📵 No phone saved'+(person?.full_name&&showName?' for '+person.full_name:''));
    return h('div',{className:'physio-contact'},
      pPhone?h(PhysioPhoneButtons,{phone:pPhone,label:showName?person.full_name:''}):null,
      oPhone&&oPhone!==pPhone?h(PhysioPhoneButtons,{phone:oPhone,label:(pPhone||person?'Desk · ':'')+org.name}):null);
  }
  // For an alert / task that knows only the plan id: uses today's plan list (assigned name, else last session's).
  function PhysioPlanContact({planId,showName=true}){
    const contacts=usePhysioContacts();
    const row=(contacts?.today||[]).find(r=>r.plan_id===planId);
    if(!row)return null;
    const name=row.physiotherapist_name||row.last_physiotherapist,sameAsLast=physioNormName(name)===physioNormName(row.last_physiotherapist);
    return h(PhysioContact,{name,organisationId:row.last_organisation_id,practitionerId:sameAsLast?row.last_practitioner_id:null,showName});
  }
  ;(function(){
    if(document.getElementById('physio-contact-css'))return;
    const st=document.createElement('style');st.id='physio-contact-css';
    st.textContent=`
      .physio-contact{display:flex;flex-direction:column;gap:4px;margin-top:4px}
      .physio-contact-line{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
      .physio-contact-label{color:#725d68;font-weight:600}
      .physio-contact .btn.physio-call,.physio-contact .btn.physio-wa{padding:4px 10px;min-height:32px;font-size:13px;white-space:nowrap;text-decoration:none}
      .physio-contact .btn.physio-call{font-weight:700;letter-spacing:.3px}
      .physio-contact .btn.physio-wa{border-color:#9fd8b4;color:#0a6b3c;background:#f3fbf6}
      .physio-nophone{display:block;color:#a08a95}
      .physio-today-row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
      .physio-today-row ul{margin:4px 0 0;padding-left:18px}
    `;
    document.head.appendChild(st);
  })();
