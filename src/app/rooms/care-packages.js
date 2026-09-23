function CarePackages({profile}){
  const nursingManagerView=isNursingManagerProfile(profile);
  const canManage=profile?.role==='Admin';
  const blank={id:null,package_name:'',duration_value:15,duration_unit:'Days',
    included_services:'Room accommodation\nRoutine nursing care\nDaily care assistance\nMedication administration\nFood and diet support',
    private_fee:'',twin_fee:'',general_fee:'',is_active:true};
  const [rows,setRows]=React.useState([]),[form,setForm]=React.useState(blank),
    [show,setShow]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');

  async function load(){
    const {data,error}=await client.from('care_packages').select('*')
      .order('is_active',{ascending:false}).order('package_name');
    if(error){setMessage(error.message);return}
    setRows(data||[]);
  }
  React.useEffect(()=>{load()},[]);

  if(!canManage&&!nursingManagerView)return h(Section,{title:'Care Packages'},
    h('div',{className:'message error'},'Administrator access is required.'));

  const money=value=>`₹${Number(value||0).toLocaleString('en-IN')}`;
  const packageDetail=(label,value,wide=false)=>h('div',{className:`care-package-detail${wide?' wide':''}`},
    h('span',{className:'care-package-label'},label),h('span',{className:'care-package-colon'},':'),h('strong',{className:'care-package-value'},value||'—'));
  function openNew(){setForm(blank);setShow(true);setMessage('')}
  function openEdit(row){setForm({...blank,...row});setShow(true);setMessage('')}

  async function save(e){
    e.preventDefault();
    if(!form.package_name.trim()){setMessage('Package name is required.');return}
    if(Number(form.duration_value)<=0){setMessage('Enter a valid package duration.');return}
    setBusy(true);
    const payload={
      package_name:form.package_name.trim(),
      duration_value:Number(form.duration_value),
      duration_unit:form.duration_unit,
      included_services:form.included_services.trim(),
      private_fee:Number(form.private_fee||0),
      twin_fee:Number(form.twin_fee||0),
      general_fee:Number(form.general_fee||0),
      is_active:Boolean(form.is_active),
      updated_by:profile.id,
      updated_at:new Date().toISOString()
    };
    const result=form.id
      ?await client.from('care_packages').update(payload).eq('id',form.id).select().single()
      :await client.from('care_packages').insert({...payload,created_by:profile.id}).select().single();
    setBusy(false);
    if(result.error){setMessage(result.error.message);return}
    setShow(false);setMessage(`${form.id?'Package updated':'New package created'} successfully.`);
    await load();
    writeAuditEvent(form.id?'Care Package Updated':'Care Package Created','Care Packages',result.data.id,payload,'Success');
  }

  async function toggle(row){
    const {error}=await client.from('care_packages')
      .update({is_active:!row.is_active,updated_by:profile.id,updated_at:new Date().toISOString()})
      .eq('id',row.id);
    if(error){setMessage(error.message);return}
    setMessage(`Package ${row.is_active?'deactivated':'activated'} successfully.`);
    await load();
  }

  return h(React.Fragment,null,
    h('div',{className:'accounts-hero'},
      h('div',null,h('small',null,nursingManagerView?'NURSING MANAGER · VIEW ONLY':'ADMINISTRATOR CONTROL'),h('h3',null,'Assisted Living Care Packages'),
        h('p',null,nursingManagerView?'View package duration, inclusions and accommodation tariffs.':'Create fixed-duration packages with separate fees for Private, Twin Sharing and Triple Sharing accommodation.')),
      canManage?h('div',{className:'accounts-actions'},h('button',{className:'btn btn-primary',onClick:openNew},'+ Create Package')):h('span',{className:'badge'},'VIEW ONLY')),
    message&&h('div',{className:message.includes('successfully')?'message success':'message error'},message),
    h('div',{className:'care-package-grid'},rows.map(row=>h('div',{className:`care-package-card ${row.is_active?'active':'inactive'}`,key:row.id},
      h('div',{className:'care-package-card-head'},h('span',{className:'care-package-icon'},'📦'),
        h('span',{className:`care-package-status ${row.is_active?'active':'inactive'}`},row.is_active?'Active':'Inactive')),
      h('div',{className:'care-package-details'},
        packageDetail('Package',row.package_name),
        packageDetail('Duration',`${row.duration_value} ${row.duration_unit}`),
        packageDetail('Includes',String(row.included_services||'No inclusions entered').split(/\n+/).filter(Boolean).join(' · '),true),
        packageDetail('Private / Single',money(row.private_fee)),
        packageDetail('Twin Sharing',money(row.twin_fee)),
        packageDetail('Triple Sharing',money(row.general_fee))),
      canManage?h('div',{className:'actions care-package-actions'},
        h('button',{className:'btn btn-secondary',onClick:()=>openEdit(row)},'Edit'),
        h('button',{className:row.is_active?'btn btn-danger':'btn btn-primary',onClick:()=>toggle(row)},row.is_active?'Deactivate':'Activate')):null))),
    canManage&&show&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:save,style:{width:'min(900px,96vw)'}},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,form.id?'Edit Care Package':'Create Care Package'),
        h('small',null,'The fixed fee includes accommodation for the selected room type during the package period.')),
        h('button',{type:'button',className:'close',onClick:()=>setShow(false)},'×')),
      h('div',{className:'modal-grid'},
        miniInput('Package Name',form.package_name,v=>setForm({...form,package_name:v}),true),
        miniInput('Duration',form.duration_value,v=>setForm({...form,duration_value:v}),true,'number'),
        miniSelect('Duration Unit',form.duration_unit,['Days','Weeks','Months'],v=>setForm({...form,duration_unit:v})),
        h('div',{className:'field span-2'},h('label',null,'What the Package Includes'),
          h('textarea',{required:true,rows:6,value:form.included_services,onChange:e=>setForm({...form,included_services:e.target.value}),placeholder:'Enter one inclusion per line'})),
        miniInput('Private / Single Room Fee',form.private_fee,v=>setForm({...form,private_fee:v}),true,'number'),
        miniInput('Twin Sharing Fee',form.twin_fee,v=>setForm({...form,twin_fee:v}),true,'number'),
        miniInput('General Room Fee',form.general_fee,v=>setForm({...form,general_fee:v}),true,'number'),
        h('label',{className:'check-card'},h('input',{type:'checkbox',checked:form.is_active,onChange:e=>setForm({...form,is_active:e.target.checked})}),
          h('span',null,'Package available for new admissions'))),
      h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShow(false)},'Cancel'),
        h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':form.id?'Update Package':'Create Package'))))
  );
}

