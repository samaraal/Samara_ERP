  const FORM_FIELD_CATALOG = [
    ['Admissions','Patient name'],['Admissions','Age'],['Admissions','Gender'],['Admissions','Mobile'],
    ['Admissions','State'],['Admissions','District'],['Admissions','Taluk'],['Admissions','Village / Town / City'],['Admissions','Locality / Area'],['Admissions','Street / Road Name'],['Admissions','Door / House No.'],['Admissions','Apartment / Building'],['Admissions','Flat No.'],['Admissions','Landmark'],['Admissions','PIN Code'],['Admissions','Family / attendant name'],['Admissions','Attendant phone'],['Admissions','Alternative Mobile No.'],
    ['Admissions','Patient category'],['Admissions','Admission date'],['Admissions','Admission source'],
    ['Admissions','Hospital name'],['Admissions','Diagnosis / procedure'],['Admissions','Treating doctor'],
    ['Admissions','Doctor phone'],['Admissions','Known allergies'],['Admissions','Room number'],
    ['Admissions','Bed'],['Admissions','Medicine name'],['Admissions','Strength'],['Admissions','Dose'],
    ['Admissions','Route'],['Admissions','Administration times'],['Admissions','Food instruction'],
    ['Admissions','Care activity'],['Admissions','Shift'],['Admissions','Patient Photo'],
    ['Admissions','Identity Proof'],

    ['Employees','Employee name'],['Employees','Login ID'],['Employees','Role'],['Employees','Mobile'],
    ['Employees','Email'],['Employees','Date of joining'],['Employees','Residential Address'],
    ['Employees','Qualification'],['Employees','Previous employer'],['Employees','Reference Contact'],

    ['Enquiries','Name'],['Enquiries','Mobile'],['Enquiries','Enquiry source'],['Enquiries','Enquiry date'],

    ['Daily Care','Patient'],['Daily Care','Care activity'],['Daily Care','Shift'],['Daily Care','Status'],
    ['Vital Signs','Patient'],['Vital Signs','Date'],['Vital Signs','Time'],['Vital Signs','Temperature'],
    ['Vital Signs','Blood Pressure'],['Vital Signs','Pulse'],['Vital Signs','SpO₂'],
    ['Vital Signs','Blood Sugar'],['Vital Signs','Remarks'],

    ['Medicines','Patient'],['Medicines','Medicine'],['Medicines','Strength'],['Medicines','Frequency'],
    ['Medicines','Route'],['Medicines','Time'],['Medicines','Food'],['Medicines','Status'],
    ['Medicines','Actual Administration Time'],['Medicines','Remarks'],

    ['Food & Diet','Patient'],['Food & Diet','Meal'],['Food & Diet','Diet type'],['Food & Diet','Menu'],['Food & Diet','Food consumption'],['Food & Diet','Meal time'],['Food & Diet','Beverage'],['Food & Diet','Beverage time'],['Food & Diet','Status'],
    ['Physiotherapy','Patient'],['Physiotherapy','Therapy type'],['Physiotherapy','Frequency'],
    ['Physiotherapy','Time'],['Physiotherapy','Status'],

    ['Shift Handover','Patient'],['Shift Handover','Outgoing shift'],['Shift Handover','Patient summary'],
    ['Shift Handover','Pending tasks'],['Shift Handover','Special instructions'],['Shift Handover','Priority'],

    ['Incidents','Patient'],['Incidents','Incident type'],['Incidents','Severity'],['Incidents','Description'],
    ['Incidents','Immediate action'],

    ['Charge Approvals','Patient'],['Charge Approvals','Charge category'],['Charge Approvals','Amount'],
    ['Charge Approvals','Description'],['Payments','Patient'],['Payments','Transaction'],['Payments','Category'],
    ['Payments','Amount'],['Payments','Payment mode'],['Payments','Description / reference'],

    ['Discharge','Patient'],['Discharge','Initiation Basis'],['Discharge','Consultant / Doctor Name'],
    ['Discharge','Consultant / Doctor Contact'],['Discharge','Doctor Discharge Advice'],
    ['Discharge','Discharge Type'],['Discharge','Discharge Date'],['Discharge','Discharge Time'],
    ['Discharge','Destination'],['Discharge','Destination Details'],['Discharge','Condition at Discharge'],
    ['Discharge','Rectification / Correction Made'],['Discharge','Management Remarks'],
    ['Discharge','Discount Amount'],['Discharge','Discount Reason'],
    ['Discharge','Receiving Relative / Attendant'],['Discharge','Relative Contact'],
    ['Discharge','Transport Arrangement'],['Discharge','Final Nursing Remarks']
  ];

  const SYSTEM_LOCKED_REQUIRED = new Set([
    'Admissions::Patient name',
    'Admissions::Admission date',
    'Admissions::Room number',
    'Admissions::Bed',
    'Admissions::Medicine name',
    'Admissions::Administration times',
    'Daily Care::Patient',
    'Vital Signs::Patient',
    'Medicines::Patient',
    'Medicines::Medicine',
    'Incidents::Patient',
    'Incidents::Incident type',
    'Incidents::Description',
    'Payments::Patient',
    'Payments::Transaction',
    'Payments::Amount',
    'Payments::Payment mode',
    'Discharge::Patient',
    'Discharge::Initiation Basis'
  ]);

  const normaliseFieldLabel=value=>String(value||'')
    .replace(/\*/g,'')
    .replace(/\s+/g,' ')
    .trim();

  const formFieldKey=(moduleName,label)=>`${moduleName}::${normaliseFieldLabel(label)}`;

  function ensureFormRequirementStyle(){
    if(document.getElementById('samara-form-requirement-style'))return;
    const style=document.createElement('style');
    style.id='samara-form-requirement-style';
    style.textContent=`
      .samara-required-star{color:#d92d20;font-weight:900;margin-left:4px}
      .samara-required-note{
        margin:0 0 12px;padding:9px 12px;border-radius:10px;
        background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;
        font-size:12px;font-weight:700
      }
      .samara-field-error{
        border-color:#d92d20!important;
        box-shadow:0 0 0 3px rgba(217,45,32,.10)!important
      }
      .samara-field-error-text{display:block;margin-top:5px;color:#b42318;font-size:12px;font-weight:700}
      .samara-required-popup{
        position:fixed;top:76px;left:50%;transform:translateX(-50%);
        z-index:100000;min-width:min(520px,calc(100vw - 28px));max-width:720px;
        display:flex;align-items:flex-start;gap:12px;padding:14px 16px;
        border-radius:14px;background:#b42318;color:#fff;
        box-shadow:0 16px 36px rgba(91,19,15,.28);
        animation:samaraRequiredPopupIn .18s ease-out
      }
      .samara-required-popup strong{display:block;font-size:15px}
      .samara-required-popup small{display:block;margin-top:3px;color:#ffe9e7;font-size:12px}
      .samara-required-popup-icon{
        display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;
        border-radius:50%;background:rgba(255,255,255,.18);font-size:19px;font-weight:900
      }
      @keyframes samaraRequiredPopupIn{
        from{opacity:0;transform:translate(-50%,-10px)}
        to{opacity:1;transform:translate(-50%,0)}
      }
      .field-setting-grid{display:grid;gap:10px}
      .field-setting-row{
        display:grid;grid-template-columns:minmax(240px,1fr) 165px 170px;
        gap:14px;align-items:center;padding:14px 16px;border:1px solid #ead0de;
        border-radius:14px;background:#fff;transition:.18s ease
      }
      .field-setting-row:hover{border-color:#dda9c2;box-shadow:0 8px 18px rgba(176,18,100,.08)}
      .field-setting-row small{display:block;margin-top:4px;color:#7b6571}
      .field-setting-status{
        display:inline-flex;align-items:center;justify-content:center;gap:7px;
        min-height:34px;padding:7px 11px;border-radius:999px;
        font-size:12px;font-weight:900
      }
      .field-setting-status.mandatory{background:#ffeded;color:#b42318}
      .field-setting-status.optional{background:#fae7f0;color:#7a1247}
      .field-setting-status.locked{background:#f7e7ef;color:#705966}
      .field-toggle-button{
        min-height:42px;border:0;border-radius:12px;padding:9px 14px;
        font:inherit;font-weight:900;cursor:pointer;transition:.18s ease
      }
      .field-toggle-button.make-required{background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);color:#fff}
      .field-toggle-button.make-optional{background:#fff4df;color:#9a5c00;border:1px solid #f4c66b}
      .field-toggle-button.locked{background:#f7e7ef;color:#8c7180;cursor:not-allowed}
      .field-toggle-button:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 7px 15px rgba(176,18,100,.12)}
      .field-setting-saving{opacity:.68;pointer-events:none}
      .field-settings-autosave{
        display:flex;align-items:center;gap:8px;margin-top:8px;
        color:#ffe5f1;font-size:12px;font-weight:800
      }
      @media(max-width:720px){
        .field-setting-row{grid-template-columns:1fr}
        .field-setting-status,.field-toggle-button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function GlobalFormRequirementManager({page,profile}){
    const [settings,setSettings]=React.useState([]);

    React.useEffect(()=>{
      ensureFormRequirementStyle();
      let alive=true;
      async function load(){
        const {data,error}=await client.from('form_field_settings')
          .select('module_name,field_label,is_required,is_locked');
        if(!alive)return;
        if(error){
          console.warn('Form field settings unavailable; native required fields remain active:',error.message);
          setSettings([]);
        }else setSettings(data||[]);
      }
      load();
      const channel=client.channel('form-field-settings-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'form_field_settings'},load)
        .subscribe();
      return()=>{alive=false;client.removeChannel(channel)};
    },[]);

    React.useEffect(()=>{
      ensureFormRequirementStyle();
      const root=document.querySelector('.content');
      if(!root)return;

      const settingMap=new Map(settings.map(row=>[
        formFieldKey(row.module_name,row.field_label),
        row
      ]));

      function associatedControl(label){
        const forId=label.getAttribute('for');
        if(forId)return document.getElementById(forId);
        const field=label.closest('.field');
        return field?.querySelector('input,select,textarea')||null;
      }

      function cleanError(control){
        control?.classList.remove('samara-field-error');
        const field=control?.closest('.field');
        field?.querySelector('.samara-field-error-text')?.remove();
      }

      function showRequiredPopup(label){
        document.querySelector('.samara-required-popup')?.remove();
        const popup=document.createElement('div');
        popup.className='samara-required-popup';
        popup.innerHTML=`
          <span class="samara-required-popup-icon">!</span>
          <span>
            <strong>Please complete the mandatory field</strong>
            <small>${String(label||'This field').replace(/[<>]/g,'')} is required before saving.</small>
          </span>
        `;
        document.body.appendChild(popup);
        setTimeout(()=>popup.remove(),3600);
      }

      function focusInvalidControl(invalid){
        if(!invalid)return;
        root.querySelectorAll('.samara-field-error').forEach(cleanError);
        invalid.classList.add('samara-field-error');

        const field=invalid.closest('.field');
        const label=normaliseFieldLabel(field?.querySelector('label')?.textContent)||'This field';

        if(field&&!field.querySelector('.samara-field-error-text')){
          const error=document.createElement('small');
          error.className='samara-field-error-text';
          error.textContent=`${label} is required`;
          field.appendChild(error);
        }

        showRequiredPopup(label);
        invalid.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>{
          try{invalid.focus({preventScroll:true})}catch(_error){invalid.focus()}
        },420);
      }

      function apply(){
        root.querySelectorAll('label').forEach(label=>{
          const raw=normaliseFieldLabel(label.textContent);
          if(!raw)return;
          label.querySelector('.samara-required-star')?.remove();

          const control=associatedControl(label);
          if(!control||control.disabled||control.type==='hidden')return;

          const key=formFieldKey(page,raw);
          const configured=settingMap.get(key);
          const locked=SYSTEM_LOCKED_REQUIRED.has(key)||configured?.is_locked;
          const required=configured ? Boolean(configured.is_required) : Boolean(control.required);

          control.required=locked||required;
          control.dataset.samaraRequired=(locked||required)?'true':'false';

          if(locked||required){
            const star=document.createElement('span');
            star.className='samara-required-star';
            star.textContent='*';
            star.setAttribute('aria-hidden','true');
            label.appendChild(star);
          }else{
            cleanError(control);
          }
        });

        root.querySelectorAll('form').forEach(form=>{
          if(form.dataset.samaraRequiredBound==='true')return;
          form.dataset.samaraRequiredBound='true';
          form.addEventListener('submit',event=>{
            const invalid=[...form.querySelectorAll('[data-samara-required="true"]')]
              .find(control=>!control.disabled&&!String(control.value||'').trim());
            if(!invalid)return;
            event.preventDefault();
            event.stopImmediatePropagation();
            focusInvalidControl(invalid);
          },true);

          form.addEventListener('invalid',event=>{
            const invalid=event.target;
            if(!invalid?.matches?.('input,select,textarea'))return;
            event.preventDefault();
            focusInvalidControl(invalid);
          },true);

          form.addEventListener('input',event=>{
            const control=event.target;
            if(!control?.matches?.('input,select,textarea'))return;
            if(String(control.value||'').trim())cleanError(control);
          },true);

          form.addEventListener('change',event=>{
            const control=event.target;
            if(!control?.matches?.('input,select,textarea'))return;
            if(String(control.value||'').trim())cleanError(control);
          },true);
        });
      }

      function clickValidationHandler(event){
        const button=event.target.closest('button');
        if(!button||button.type==='button')return;
        const form=button.closest('form');
        if(!form)return;
        const invalid=[...form.querySelectorAll('[data-samara-required="true"]')]
          .find(control=>!control.disabled&&!String(control.value||'').trim());
        if(!invalid)return;
        event.preventDefault();
        event.stopImmediatePropagation();
        focusInvalidControl(invalid);
      }
      root.addEventListener('click',clickValidationHandler,true);

      apply();
      const observer=new MutationObserver(()=>requestAnimationFrame(apply));
      observer.observe(root,{childList:true,subtree:true});
      return()=>{
        observer.disconnect();
        root.removeEventListener('click',clickValidationHandler,true);
        document.querySelector('.samara-required-popup')?.remove();
      };
    },[page,settings]);

    return null;
  }

  function FormFieldSettings({profile}){
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [moduleName,setModuleName]=React.useState('Admissions');
    const [search,setSearch]=React.useState('');
    const [message,setMessage]=React.useState('');
    const [busyKey,setBusyKey]=React.useState('');
    const messageTimerRef=React.useRef(null);
    const showSettingMessage=(text,isError=false)=>{
      setMessage(`${isError?'ERROR:':''}${text}`);
      if(messageTimerRef.current)clearTimeout(messageTimerRef.current);
      messageTimerRef.current=setTimeout(()=>setMessage(''),3200);
    };

    React.useEffect(()=>{ensureFormRequirementStyle()},[]);

    async function load(){
      const {data,error}=await client.from('form_field_settings')
        .select('*')
        .order('module_name')
        .order('field_label');
      if(error){
        setMessage(`Settings table is not ready: ${error.message}`);
        return;
      }
      setRows(data||[]);
    }
    React.useEffect(()=>{load()},[]);

    if(profile?.role!=='Admin'){
      return h(Section,{title:'Form Field Settings'},
        h('div',{className:'message error'},'Administrator access is required.')
      );
    }

    const modules=[...new Set(FORM_FIELD_CATALOG.map(([module])=>module))];
    const savedMap=new Map(rows.map(row=>[formFieldKey(row.module_name,row.field_label),row]));
    const fields=FORM_FIELD_CATALOG
      .filter(([module])=>module===moduleName)
      .filter(([,label])=>normaliseFieldLabel(label).toLowerCase().includes(search.toLowerCase()));

    async function setRequired(label,nextRequired){
      const key=formFieldKey(moduleName,label);
      const locked=SYSTEM_LOCKED_REQUIRED.has(key);
      if(locked)return;

      const previousRows=rows;
      const existing=previousRows.find(row=>formFieldKey(row.module_name,row.field_label)===key);
      const optimistic={
        ...(existing||{}),
        module_name:moduleName,
        field_label:normaliseFieldLabel(label),
        is_required:Boolean(nextRequired),
        is_locked:false,
        updated_by:profile.id,
        updated_at:new Date().toISOString()
      };

      setBusyKey(key);
      setRows(current=>[
        ...current.filter(row=>formFieldKey(row.module_name,row.field_label)!==key),
        optimistic
      ]);

      const {error}=await client.from('form_field_settings')
        .upsert(optimistic,{onConflict:'module_name,field_label'});

      setBusyKey('');
      if(error){
        setRows(previousRows);
        showSettingMessage(error.message||'Unable to update the field requirement.',true);
        return;
      }

      showSettingMessage(
        `${label} marked as ${nextRequired?'Mandatory':'Optional'}. Saved automatically.`
      );

      writeAuditEvent(
        'Form Field Requirement Changed',
        'Form Field Settings',
        key,
        {module_name:moduleName,field_label:label,is_required:Boolean(nextRequired)},
        'Success'
      );
    }

    async function restoreDefaults(){
      if(!window.confirm(`Restore recommended mandatory/optional settings for ${moduleName}?`))return;
      setBusyKey('restore');
      const payload=FORM_FIELD_CATALOG.filter(([module])=>module===moduleName).map(([module,label])=>{
        const key=formFieldKey(module,label);
        return {
          module_name:module,
          field_label:normaliseFieldLabel(label),
          is_required:SYSTEM_LOCKED_REQUIRED.has(key),
          is_locked:SYSTEM_LOCKED_REQUIRED.has(key),
          updated_by:profile.id,
          updated_at:new Date().toISOString()
        };
      });
      const {error}=await client.from('form_field_settings')
        .upsert(payload,{onConflict:'module_name,field_label'});
      setBusyKey('');
      if(error){showSettingMessage(error.message||'Unable to restore defaults.',true);return}
      showSettingMessage(`Recommended defaults restored for ${moduleName}. Saved automatically.`);
      await load();
    }

    return h(React.Fragment,null,
      h('div',{className:'accounts-hero'},
        h('div',null,
          h('small',null,'ADMINISTRATOR CONTROL'),
          h('h3',null,'Form Field Settings'),
          h('p',null,'Decide which fields are mandatory or optional throughout Samara Care ERP.'),
          h('div',{className:'field-settings-autosave'},h('span',null,'●'),h('span',null,'Every change is saved automatically — no Save button required'))
        ),
        h('div',{className:'accounts-actions'},
          h('button',{className:'btn btn-secondary',disabled:busyKey==='restore',onClick:restoreDefaults},
            busyKey==='restore'?'Restoring…':'Restore Recommended Defaults'
          )
        )
      ),
      message&&h('div',{className:message.startsWith('ERROR:')?'message error':'message success'},
        message.replace(/^ERROR:/,'')
      ),
      h(Section,{title:'Select Module',subtitle:'System-critical fields remain locked as mandatory'},
        h('div',{className:'accounts-report-filters'},
          h('div',{className:'field'},h('label',null,'Module'),h('select',{
            value:moduleName,onChange:e=>{setModuleName(e.target.value);setSearch('')}
          },modules.map(module=>h('option',{key:module,value:module},module)))),
          h('div',{className:'field'},h('label',null,'Search field'),h('input',{
            value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search field name'
          }))
        )
      ),
      h('div',{className:'samara-required-note'},'Fields marked with a red * are mandatory. System-critical mandatory fields cannot be made optional.'),
      h('div',{className:'field-setting-grid'},
        fields.map(([,label])=>{
          const key=formFieldKey(moduleName,label);
          const locked=SYSTEM_LOCKED_REQUIRED.has(key);
          const saved=savedMap.get(key);
          const required=locked||Boolean(saved?.is_required);
          return h('div',{
            className:`field-setting-row ${busyKey===key?'field-setting-saving':''}`,
            key
          },
            h('div',null,
              h('strong',null,label,required&&h('span',{className:'samara-required-star'},'*')),
              h('small',null,locked?'System-critical field — cannot be changed':'Administrator configurable — one-click auto-save')
            ),
            h('span',{
              className:`field-setting-status ${locked?'locked':required?'mandatory':'optional'}`
            },
              h('span',null,locked?'🔒':required?'●':'●'),
              h('span',null,locked?'System Mandatory':required?'Mandatory':'Optional')
            ),
            h('button',{
              type:'button',
              className:`field-toggle-button ${locked?'locked':required?'make-optional':'make-required'}`,
              disabled:locked||busyKey===key,
              onClick:()=>setRequired(label,!required)
            },locked?'Locked':busyKey===key?'Saving automatically…':required?'Make Optional':'Make Mandatory')
          );
        })
      )
    );
  }


