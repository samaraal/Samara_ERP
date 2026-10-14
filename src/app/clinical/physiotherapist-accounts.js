  function PhysioSessionCounts({profile}){
    const [from,setFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[to,setTo]=React.useState(todayISOIndia());
    const [rows,setRows]=React.useState([]),[error,setError]=React.useState('');
    React.useEffect(()=>{let stopped=false;const load=async()=>{try{const {data,error}=await client.rpc('physio_session_counts',{p_from:from,p_to:to});if(stopped)return;setError(error?.message||'');setRows(error?[]:data||[])}catch(error){if(!stopped)setError(error.message||'Unable to load counts.')}};load();const channel=client.channel('physio-counts-'+profile?.id).on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load).subscribe();const timer=setInterval(load,30000);window.addEventListener('focus',load);return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',load);client.removeChannel(channel)}},[from,to,profile?.id]);
    return h('section',{className:'card panel'},h('h3',null,'Physiotherapy Session Counts'),
      h('div',{className:'form-grid'},h('div',{className:'field'},h('label',null,'From'),h('input',{type:'date',value:from,onChange:e=>setFrom(e.target.value)})),h('div',{className:'field'},h('label',null,'To'),h('input',{type:'date',value:to,onChange:e=>setTo(e.target.value)}))),
      error&&h('p',{className:'message error'},error),
      h(LogTable,{title:'Sessions in selected period',heads:['Organisation / Physiotherapy name','Physiotherapist','Completed','Pending','Not Done'],rows:rows.map(row=>[row.organisation_name,row.physiotherapist_name,row.completed,row.pending,row.not_done])}));
  }

  function PhysiotherapistAccounts({profile}){
    const admin=profile?.role==='Admin';
    const [data,setData]=React.useState({organisations:[],practitioners:[],sessions:[],entries:[],opening:0,balance:0});
    const [organisation,setOrganisation]=React.useState(''),[tab,setTab]=React.useState('Organisations');
    const [from,setFrom]=React.useState(todayISOIndia().slice(0,8)+'01'),[to,setTo]=React.useState(todayISOIndia());
    const [form,setForm]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [loading,setLoading]=React.useState(false);const loadVersion=React.useRef(0);
    const money=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const voucher=row=>'PT-'+String(row.voucher_number||'').padStart(6,'0');
    const org=data.organisations.find(row=>row.id===organisation);
    async function load(){
      if(!admin)return;
      const version=++loadVersion.current;setLoading(true);
      try{
      const {data:result,error}=await client.rpc('physio_accounts',{p_action:'load',p_data:{organisation_id:organisation,from,to}});
      if(version!==loadVersion.current)return;
      if(error){setError(error.message);return;}
      setData(result);if(!organisation&&result.organisations?.length)setOrganisation(result.organisations[0].id);
      }catch(error){if(version===loadVersion.current)setError(error.message||'Unable to load accounts.');}finally{if(version===loadVersion.current)setLoading(false);}
    }
    React.useEffect(()=>{load();return()=>{++loadVersion.current}},[organisation,from,to,admin]);
    const button=(label,onClick,primary=false)=>h('button',{type:'button',className:'btn '+(primary?'btn-primary':'btn-secondary'),disabled:busy||loading,onClick},label);
    function begin(kind,row={}){
      setError('');setNotice('');
      if(kind==='organisation')setForm({kind,id:row.id||crypto.randomUUID(),existing:!!row.id,name:row.name||'',contact_person:row.contact_person||'',phone:row.phone||'',email:row.email||'',address:row.address||'',gst_number:row.gst_number||'',payment_terms:row.payment_terms||'',default_fee:row.default_fee??'',is_active:row.is_active!==false,opening_amount:'0',opening_date:from});
      else if(kind==='practitioner')setForm({kind,id:row.id||crypto.randomUUID(),full_name:row.full_name||'',phone:row.phone||'',qualification:row.qualification||'',is_active:row.is_active!==false});
      else if(kind==='post_fee')setForm({kind,session:row,practitioner_id:'',rate:org?.default_fee||'',notes:'',request_key:crypto.randomUUID()});
      else if(kind==='reverse')setForm({kind,entry:row,reason:'',request_key:crypto.randomUUID()});
      else setForm({kind,amount:'',entry_date:todayISOIndia(),method:'Bank transfer',reference:'',recipient:'',notes:'',request_key:crypto.randomUUID()});
    }
    async function submit(e){
      e.preventDefault();if(busy||!admin||!form)return;setBusy(true);setError('');
      try{
        const action=form.kind==='organisation'?'save_organisation':form.kind==='practitioner'?'save_practitioner':form.kind;
        const {kind,session,entry,existing,...fields}=form;
        const payload={...fields,organisation_id:kind==='organisation'?form.id:organisation,...(session?{session_id:session.id}:{}),...(entry?{entry_id:entry.id}:{})};
        const {data:result,error}=await client.rpc('physio_accounts',{p_action:action,p_data:payload});
        if(error)throw error;
        setForm(null);if(kind==='organisation')setOrganisation(result.id);
        setNotice(result.voucher?'Saved '+voucher({voucher_number:result.voucher}):'Details saved.');await load();
      }catch(error){setError(error.code==='23505'?'An organisation, physiotherapist, or active session fee with these details already exists. Refresh before retrying.':error.message||'Unable to save.');}finally{setBusy(false);}
    }
    const field=(label,key,type='text',required=false)=>h('div',{className:'field'},h('label',null,label),h('input',{'aria-label':label,type,required,value:form[key]??'',step:type==='number'?'0.01':undefined,max:type==='date'?todayISOIndia():undefined,onChange:e=>setForm({...form,[key]:e.target.value})}));
    const text=(label,key)=>h('div',{className:'field span-2'},h('label',null,label),h('textarea',{'aria-label':label,rows:2,value:form[key]||'',onChange:e=>setForm({...form,[key]:e.target.value})}));
    const select=(label,key,options)=>h('div',{className:'field'},h('label',null,label),h('select',{'aria-label':label,required:true,value:form[key],onChange:e=>setForm({...form,[key]:e.target.value})},h('option',{value:''},'Select…'),options.map(row=>h('option',{key:row.value,value:row.value},row.label))));
    const ledgerRows=()=>{let balance=Number(data.opening||0);return data.entries.map(row=>{balance=Math.round((balance+Number(row.amount))*100)/100;return {...row,balance}})};
    function exportCSV(){
      const safe=value=>'"'+String(value??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';
      const rows=[['SAMARA ASSISTED LIVING — PHYSIOTHERAPY LEDGER'],['Organisation',org?.name],['Contact',org?.contact_person,org?.phone,org?.email],['Address',org?.address],['Period',from,to],['Opening payable',data.opening],['Date','Voucher','Type','Organisation','Physiotherapist','Patient','Resident ID','Room','Session date','Session time','Fee rate','Debit / payments','Credit / fees','Balance payable','Method','Reference','Recipient / payer','Notes'],...ledgerRows().map(row=>[row.entry_date,voucher(row),row.kind,row.snapshot?.organisation||org?.name,row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id,row.snapshot?.room,row.snapshot?.session_date,row.snapshot?.session_time,row.rate,row.amount<0?-Number(row.amount):'',row.amount>0?Number(row.amount):'',row.balance,row.method,row.reference,row.recipient,row.notes]),['Closing payable',ledgerRows().at(-1)?.balance??data.opening]];
      const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Physiotherapy-ledger-'+from+'-'+to+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);
    }
    function printStatement(entry){
      const popup=window.open('','_blank');if(!popup){setError('Allow the print window to open.');return;}
      const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const rows=entry?[entry]:ledgerRows();
      const heads=['Date','Voucher','Type','Physiotherapist / Patient','Debit ₹','Credit ₹',...(entry?[]:['Balance payable ₹'])];
      const body=rows.map(row=>'<tr>'+[formatDateIN(row.entry_date),voucher(row),row.kind,[row.snapshot?.physiotherapist,row.snapshot?.patient_name,row.snapshot?.resident_id,row.snapshot?.room].filter(Boolean).join(' · '),row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',...(entry?[]:[money(row.balance)])].map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('');
      popup.document.write('<!doctype html><html><head><meta charset="UTF-8"><title>Physiotherapy '+(entry?'Voucher':'Ledger')+'</title><style>body{font:13px Arial;color:#382734;margin:30px}h1{color:#8e1350;font-size:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f9ecf3}@media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><button onclick="window.print()">Print / Save PDF</button><h1>Samara Assisted Living</h1><h2>Physiotherapy '+(entry?'Voucher '+esc(voucher(entry)):'Organisation Ledger')+'</h2><h3>'+esc(org?.name)+'</h3><p>'+esc([org?.contact_person,org?.phone,org?.email,org?.address].filter(Boolean).join(' · '))+'</p><p>'+esc(entry?'Date: '+formatDateIN(entry.entry_date):'Period: '+formatDateIN(from)+' to '+formatDateIN(to)+' · Opening payable ₹'+money(data.opening))+'</p><table><thead><tr>'+heads.map(head=>'<th>'+esc(head)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table><p>'+esc(entry?[entry.method,entry.reference,entry.recipient,entry.notes].filter(Boolean).join(' · '):'Closing payable ₹'+money(rows.at(-1)?.balance??data.opening))+'</p></body></html>');popup.document.close();
    }
    if(!admin)return h(PhysioSessionCounts,{profile});
    return h('div',null,
      h('section',{className:'card panel'},h('h3',null,'Outsourced Physiotherapy Accounts'),h('p',{className:'small-note'},'Admin access. Fees are posted only for completed sessions. Payment entries record money already paid; they do not transfer money.'),
        error&&h('div',{className:'message error'},error),notice&&h('div',{className:'message success'},notice),
        h('div',{className:'actions'},['Organisations','Physiotherapists','Sessions','Payments','Ledger','Session Counts'].map(name=>button(name,()=>setTab(name),tab===name))),
        h('div',{className:'form-grid'},h('div',{className:'field'},h('label',null,'Organisation'),h('select',{'aria-label':'Organisation',value:organisation,onChange:e=>{setOrganisation(e.target.value);setForm(null)}},h('option',{value:''},'Select organisation'),data.organisations.map(row=>h('option',{key:row.id,value:row.id},row.name+(row.is_active?'':' (inactive)'))))),h('div',{className:'field'},h('label',null,'From'),h('input',{type:'date',value:from,onChange:e=>setFrom(e.target.value)})),h('div',{className:'field'},h('label',null,'To'),h('input',{type:'date',value:to,onChange:e=>setTo(e.target.value)}))),
        h('div',{className:'actions'},button('Refresh',load),button('Add organisation',()=>begin('organisation'))),
        org&&h('p',null,h('strong',null,org.name+' · '),data.balance<0?'Advance with organisation ₹'+money(-data.balance):'Total payable ₹'+money(data.balance))),
      tab==='Organisations'&&h(LogTable,{title:'Physiotherapy Organisations',heads:['Organisation','Contact person','Phone','Email','Address','GST','Terms','Fee / session ₹','Active','Action'],rows:data.organisations.map(row=>[row.name,row.contact_person||'—',row.phone||'—',row.email||'—',row.address||'—',row.gst_number||'—',row.payment_terms||'—',money(row.default_fee),row.is_active?'Yes':'No',button('Edit details',()=>begin('organisation',row))])}),
      tab==='Physiotherapists'&&h('section',{className:'card panel'},button('Add physiotherapist',()=>begin('practitioner')),h(LogTable,{title:'Physiotherapists — '+(org?.name||'Select organisation'),heads:['Name','Phone','Qualification','Active','Action'],rows:data.practitioners.map(row=>[row.full_name,row.phone||'—',row.qualification||'—',row.is_active?'Yes':'No',button('Edit details',()=>begin('practitioner',row))])})),
      tab==='Sessions'&&h('section',{className:'card panel'},h('p',{className:'small-note'},'Completed sessions not yet posted. Choose the attending physiotherapist and confirm the fee. Posted fees retain their rate and patient details.'),h(LogTable,{title:'Completed sessions awaiting fee posting',heads:['Date','Time','Patient','Resident ID','Room','Recorded physiotherapy name','Notes','Action'],rows:data.sessions.map(row=>[formatDateIN(row.date),row.time||'—',row.patient_name,row.resident_id,row.room,row.physiotherapy_name,row.notes||'—',button('Post session fee',()=>begin('post_fee',row))])})),
      tab==='Payments'&&h('section',{className:'card panel'},h('div',{className:'actions'},button('Record payment',()=>begin('payment')),button('Record refund received',()=>begin('refund'))),h(LogTable,{title:'Payments and refunds',heads:['Date','Voucher','Type','Amount ₹','Method','Reference','Recipient / payer','Notes','Action'],rows:data.entries.filter(row=>['Payment','Refund'].includes(row.kind)).map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind,money(Math.abs(row.amount)),row.method,row.reference||'—',row.recipient||'—',row.notes||'—',h('div',{className:'actions'},button('Print voucher',()=>printStatement(row)),!row.reversed_at&&button('Reverse',()=>begin('reverse',row)))])})),
      tab==='Ledger'&&h('section',{className:'card panel'},h('div',{className:'actions'},button('Export CSV',exportCSV),button('Print / Save PDF',()=>printStatement())),h('p',null,'Period opening payable ₹'+money(data.opening)+' · Closing payable ₹'+money(ledgerRows().at(-1)?.balance??data.opening)),h(LogTable,{title:'Organisation Ledger — '+(org?.name||''),heads:['Date','Voucher','Type','Physiotherapist','Patient / Resident ID','Room','Session date / time','Rate ₹','Debit / payments ₹','Credit / fees ₹','Balance payable ₹','Reference / notes','Action'],rows:ledgerRows().map(row=>[formatDateIN(row.entry_date),voucher(row),row.kind+(row.reversed_at?' (reversed)':''),row.snapshot?.physiotherapist||'—',[row.snapshot?.patient_name,row.snapshot?.resident_id].filter(Boolean).join(' · ')||'—',row.snapshot?.room||'—',[row.snapshot?.session_date?formatDateIN(row.snapshot.session_date):'',row.snapshot?.session_time].filter(Boolean).join(' · ')||'—',row.rate?money(row.rate):'—',row.amount<0?money(-row.amount):'—',row.amount>0?money(row.amount):'—',money(row.balance),[row.reference,row.notes].filter(Boolean).join(' · ')||'—',row.kind!=='Reversal'&&!row.reversed_at?button('Reverse',()=>begin('reverse',row)):'—'])})),
      tab==='Session Counts'&&h(PhysioSessionCounts,{profile}),
      form&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:submit},h('div',{className:'panel-head'},h('h3',null,({organisation:'Organisation details',practitioner:'Physiotherapist details',post_fee:'Post completed-session fee',payment:'Record payment made',refund:'Record refund received',reverse:'Reverse ledger entry'})[form.kind]),button('Close',()=>{if(!busy)setForm(null)})),error&&h('div',{className:'message error'},error),
        h('div',{className:'modal-grid'},
          form.kind==='organisation'&&h(React.Fragment,null,field('Physiotherapy organisation name','name','text',true),field('Contact person','contact_person'),field('Phone','phone'),field('Email','email','email'),text('Address','address'),field('GST number (if applicable)','gst_number'),field('Payment terms','payment_terms'),field('Default fee per completed session ₹','default_fee','number',true),!form.existing&&h(React.Fragment,null,field('Opening payable ₹ (negative for advance)','opening_amount','number'),field('Opening date','opening_date','date')),h('label',null,h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),' Active organisation')),
          form.kind==='practitioner'&&h(React.Fragment,null,field('Physiotherapist name','full_name','text',true),field('Phone','phone'),field('Qualification / registration','qualification'),h('label',null,h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),' Active physiotherapist')),
          form.kind==='post_fee'&&h(React.Fragment,null,h('p',{className:'span-2'},form.session.patient_name+' · '+form.session.resident_id+' · '+formatDateIN(form.session.date)),select('Attending physiotherapist','practitioner_id',data.practitioners.filter(row=>row.is_active).map(row=>({value:row.id,label:row.full_name}))),field('Agreed fee for this session ₹','rate','number',true),text('Notes / invoice reference','notes')),
          ['payment','refund'].includes(form.kind)&&h(React.Fragment,null,field('Amount ₹','amount','number',true),field('Actual transaction date','entry_date','date',true),select('Payment method','method',['Bank transfer','UPI','Cheque','Cash','Other'].map(value=>({value,label:value}))),field('Transaction reference','reference','text',form.method!=='Cash'),field('Recipient / payer','recipient','text',form.method==='Cash'),text('Notes / invoice reference','notes')),
          form.kind==='reverse'&&h(React.Fragment,null,h('p',{className:'span-2'},voucher(form.entry)+' · '+form.entry.kind+' · ₹'+money(Math.abs(form.entry.amount))),h('div',{className:'field span-2'},h('label',null,'Reason'),h('textarea',{required:true,rows:2,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value})})))),
        h('div',{className:'actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save'),button('Cancel',()=>setForm(null))))));
  }
