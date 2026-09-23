  function WhatsAppDeliveryLogs({profile}){
    const [rows,setRows]=React.useState([]),[patients,setPatients]=React.useState([]),[busy,setBusy]=React.useState(false),[status,setStatus]=React.useState('All'),[search,setSearch]=React.useState('');
    const canUse=['Admin','Manager','Accounts'].includes(profile?.role);
    async function load(){
      if(!canUse)return;
      setBusy(true);
      const [{data:r,error},{data:p}]=await Promise.all([
        client.from('patient_communications').select('*').order('created_at',{ascending:false}).limit(500),
        client.from('patients').select('id,title,full_name,patient_id').limit(1000)
      ]);
      setBusy(false);
      if(error){alert(error.message);return}
      setRows(r||[]);setPatients(p||[]);
    }
    React.useEffect(()=>{load()},[]);
    const patientMap=React.useMemo(()=>Object.fromEntries((patients||[]).map(p=>[p.id,p])),[patients]);
    const displayStatus=row=>String(row.status||'Pending');
    const filtered=(rows||[]).filter(row=>{
      const st=displayStatus(row).toLowerCase();
      if(status!=='All'&&st!==status.toLowerCase())return false;
      const p=patientMap[row.patient_id];
      const hay=[formalName(p),p?.patient_id,row.recipient_name,row.recipient_number,row.communication_type,row.provider_message_id,row.error_message].join(' ').toLowerCase();
      return !search.trim()||hay.includes(search.trim().toLowerCase());
    });
    const counts={total:rows.length,sent:rows.filter(r=>['accepted by meta','sent'].includes(displayStatus(r).toLowerCase())).length,delivered:rows.filter(r=>displayStatus(r).toLowerCase()==='delivered').length,read:rows.filter(r=>displayStatus(r).toLowerCase()==='read').length,failed:rows.filter(r=>displayStatus(r).toLowerCase()==='failed').length};
    if(!canUse)return h(Section,{title:'WhatsApp Logs'},h('p',{className:'empty'},'WhatsApp Logs are available to Admin, Manager and Accounts.'));
    const card=(label,value,color,bg)=>h('div',{style:{border:`1px solid ${color}`,background:bg,borderRadius:'14px',padding:'12px 16px',minWidth:'135px'}},h('small',{style:{color}},label),h('div',{style:{fontSize:'24px',fontWeight:800,color,marginTop:'4px'}},value));
    return h(React.Fragment,null,
      h(Section,{title:'WhatsApp Delivery Logs',subtitle:'Central delivery status for patient and family WhatsApp messages. “Accepted by Meta” confirms API acceptance; Delivered / Read / Failed are updated by the Meta webhook.'},
        h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'14px'}},card('Total',counts.total,'#334155','#f8fafc'),card('Accepted / Sent',counts.sent,'#1d4ed8','#eff6ff'),card('Delivered',counts.delivered,'#15803d','#f0fdf4'),card('Read',counts.read,'#a20b55','#fff0f6'),card('Failed',counts.failed,'#b91c1c','#fef2f2')),
        h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'end'}},
          h('label',{style:{flex:'1 1 300px'}},h('span',null,'Search'),h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Patient, mobile, report, Meta message ID...',style:{width:'100%'}})),
          h('label',null,h('span',null,'Status'),h('select',{value:status,onChange:e=>setStatus(e.target.value)},['All','Accepted by Meta','Sent','Delivered','Read','Failed'].map(x=>h('option',{key:x},x)))),
          h('button',{className:'btn btn-secondary',disabled:busy,onClick:load},busy?'Refreshing…':'Refresh')
        )
      ),
      h(Section,{title:'Message History',subtitle:`Showing ${filtered.length} of ${rows.length} messages`},
        h(LogTable,{title:'',heads:['Patient','Communication','Recipient','Report Date','Status','Accepted / Sent','Delivered','Read','Meta Message ID','Error'],rows:filtered.map(r=>{
          const p=patientMap[r.patient_id]; const st=displayStatus(r); const tone=st.toLowerCase()==='failed'?'#b91c1c':st.toLowerCase()==='delivered'?'#15803d':st.toLowerCase()==='read'?'#a20b55':'#1d4ed8';
          return [formalName(p)||'—',r.communication_type||'—',`${r.recipient_name||'—'}${r.recipient_number?` · ${r.recipient_number}`:''}`,r.report_date?formatDateIN(r.report_date):'—',h('strong',{style:{color:tone}},st),r.sent_at?fmt(r.sent_at):(r.created_at?fmt(r.created_at):'—'),r.delivered_at?fmt(r.delivered_at):'—',r.read_at?fmt(r.read_at):'—',r.provider_message_id||'—',r.error_message||'—'];
        })})
      )
    );
  }

  function RecoveryTimeline({profile}){
    const [patients]=usePatients(),[rows,setRows]=React.useState([]),[patient,setPatient]=React.useState(''),[event,setEvent]=React.useState('Walking with support'),[note,setNote]=React.useState('');async function load(){const {data}=await client.from('recovery_events').select('*,patients(full_name)').order('event_at',{ascending:false}).limit(100);setRows(data||[])}React.useEffect(()=>{load()},[]);async function save(e){e.preventDefault();const {error}=await client.from('recovery_events').insert({patient_id:patient,event_type:event,note,recorded_by:profile.id});if(error)return alert(error.message);setNote('');load()}
    return h(React.Fragment,null,h(Section,{title:'Recovery Progress Timeline',subtitle:'Track improvement from hospital discharge to return home'},h('form',{className:'modal-grid',onSubmit:save},patientSelect(patients,patient,setPatient),miniSelect('Milestone',event,['Admitted after hospital discharge','Pain reduced','Walking with support','Independent walking','Feeding improved','Restroom independence','Medicine reduced','Wound improved','Physiotherapy goal achieved','Ready for discharge','Other'],setEvent),miniInput('Progress note',note,setNote,true),h('button',{className:'btn btn-primary'},'Add milestone'))),h(LogTable,{title:'Recovery Events',heads:['Patient','Milestone','Note','Date'],rows:rows.map(r=>[r.patients?.full_name,r.event_type,r.note,fmt(r.event_at)])}))
  }


