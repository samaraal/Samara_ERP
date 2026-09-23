  function SpecialNurseManagement({profile}){
    const canManage=['Admin','Manager'].includes(profile?.role);
    const canUpdate=['Admin','Manager','Nurse','Caregiver'].includes(profile?.role);
    const [assignments,setAssignments]=React.useState([]);
    const [patients,setPatients]=React.useState([]);
    const [employees,setEmployees]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [showForm,setShowForm]=React.useState(false);
    const [editing,setEditing]=React.useState(null);
    const [busy,setBusy]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const toastTimer=React.useRef(null);
    const emptyForm={
      patient_id:'',
      nurse_profile_id:'',
      nurse_name:'',
      nurse_source:'Our Employee',
      outsourced_company_name:'',
      outsourced_registration_number:'',
      outsourced_contact_person:'',
      outsourced_contact_number:'',
      outsourced_agreement_reference:'',
      assignment_type:'Dedicated Nurse',
      coverage_days:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      start_time:'07:00',
      end_time:'19:00',
      shift:'Day Shift',
      start_date:todayISOIndia(),
      end_date:'',
      duration_type:'Until further order',
      duration_value:'',
      responsibilities:'',
      special_instructions:'',
      emergency_contact:'',
      status:'Active',
      notes:''
    };
    const [form,setForm]=React.useState(emptyForm);

    function showToast(type,text){
      showSamaraActionToast(type,type==='success'?'Saved successfully':'Action failed',text);
      clearTimeout(toastTimer.current);
      setToast({type,text});
      toastTimer.current=setTimeout(()=>setToast(null),4500);
    }
    React.useEffect(()=>()=>clearTimeout(toastTimer.current),[]);

    async function load(){
      setLoading(true);setMessage('');
      const [a,p,e]=await Promise.all([
        client.from('special_nurse_assignments').select('*').order('created_at',{ascending:false}),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').order('full_name'),
        client.from('profiles').select('id,auth_user_id,title,full_name,employee_id,role,is_active').order('full_name')
      ]);
      if(a.error){setMessage(a.error.message||'Unable to load Special Nurse assignments.');setAssignments([])}
      else setAssignments(a.data||[]);
      if(!p.error)setPatients(p.data||[]);
      if(!e.error)setEmployees((e.data||[]).filter(x=>x.is_active!==false&&['Nurse','Caregiver'].includes(x.role)));
      setLoading(false);
    }

    React.useEffect(()=>{
      load();
      const channel=client.channel('special-nurse-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'special_nurse_assignments'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[]);

    const patientFor=id=>patients.find(p=>p.id===id)||{};
    const employeeFor=id=>employees.find(e=>e.id===id||e.auth_user_id===id)||{};
    const patientLabel=id=>{const p=patientFor(id);return p.id?`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}${p.bed_no?`-${p.bed_no}`:''}`:'Patient not linked'};
    const nurseLabel=row=>{const e=employeeFor(row.nurse_profile_id);return e.id?`${formalName(e)} · ${e.role}`:(row.nurse_name||'Not assigned')};
    const clockLabel=value=>{
      if(!value)return '—';
      const [hour,minute]=String(value).slice(0,5).split(':').map(Number);
      return `${hour%12||12}:${String(minute||0).padStart(2,'0')} ${hour<12?'AM':'PM'}`;
    };
    const daysLabel=value=>Array.isArray(value)?value.join(', '):(value||'—');

    function openCreate(){
      setEditing(null);
      setForm({...emptyForm,start_date:todayISOIndia()});
      setShowForm(true);
    }
    function openEdit(row){
      setEditing(row);
      setForm({
        ...emptyForm,...row,
        nurse_source:row.nurse_source||'Our Employee',
        outsourced_company_name:row.outsourced_company_name||'',
        outsourced_registration_number:row.outsourced_registration_number||'',
        outsourced_contact_person:row.outsourced_contact_person||'',
        outsourced_contact_number:row.outsourced_contact_number||'',
        outsourced_agreement_reference:row.outsourced_agreement_reference||'',
        coverage_days:Array.isArray(row.coverage_days)?row.coverage_days:[],
        start_time:String(row.start_time||'07:00').slice(0,5),
        end_time:String(row.end_time||'19:00').slice(0,5),
        start_date:row.start_date||todayISOIndia(),
        end_date:row.end_date||''
      });
      setShowForm(true);
    }
    function toggleDay(day){
      setForm(current=>({...current,coverage_days:current.coverage_days.includes(day)?current.coverage_days.filter(x=>x!==day):[...current.coverage_days,day]}));
    }

    async function save(e){
      e.preventDefault();
      if(!canManage)return;
      if(!form.patient_id){showToast('error','Please select the assigned patient.');return}
      if(form.nurse_source==='Our Employee'&&!form.nurse_profile_id){showToast('error','Please select the registered Nurse or Caregiver assigned for special duty.');return}
      if(form.nurse_source==='Our Employee'){
        const selected=employeeFor(form.nurse_profile_id);
        if(!selected.id||!['Nurse','Caregiver'].includes(selected.role)){
          showToast('error','Only employees with the role Nurse or Caregiver can be assigned for Special Nurse duty.');
          return;
        }
      }
      if(form.nurse_source==='Outsourced'&&!form.nurse_name.trim()){showToast('error','Please enter the outsourced Special Nurse name.');return}
      if(form.nurse_source==='Outsourced'&&!form.outsourced_company_name.trim()){showToast('error','Please enter the outsourcing company or organisation name.');return}
      if(!form.coverage_days.length){showToast('error','Select at least one coverage day.');return}
      if(isFutureDateIndia(form.start_date)){showToast('error','Future assignment start dates are not permitted.');return}
      if(form.end_date&&form.end_date<form.start_date){showToast('error','End date cannot be earlier than the start date.');return}
      setBusy(true);
      const {data:{user}}=await client.auth.getUser();
      const selectedEmployee=employeeFor(form.nurse_profile_id);
      const payload={
        patient_id:form.patient_id,
        nurse_profile_id:form.nurse_source==='Our Employee'?(form.nurse_profile_id||null):null,
        nurse_name:form.nurse_source==='Our Employee'?(formalName(selectedEmployee)||form.nurse_name||null):(form.nurse_name||null),
        nurse_source:form.nurse_source,
        outsourced_company_name:form.nurse_source==='Outsourced'?(form.outsourced_company_name||null):null,
        outsourced_registration_number:form.nurse_source==='Outsourced'?(form.outsourced_registration_number||null):null,
        outsourced_contact_person:form.nurse_source==='Outsourced'?(form.outsourced_contact_person||null):null,
        outsourced_contact_number:form.nurse_source==='Outsourced'?(form.outsourced_contact_number||null):null,
        outsourced_agreement_reference:form.nurse_source==='Outsourced'?(form.outsourced_agreement_reference||null):null,
        assignment_type:form.assignment_type,
        coverage_days:form.coverage_days,
        start_time:form.start_time||null,
        end_time:form.end_time||null,
        shift:form.shift,
        start_date:form.start_date,
        end_date:form.end_date||null,
        duration_type:form.duration_type,
        duration_value:form.duration_value||null,
        responsibilities:form.responsibilities||null,
        special_instructions:form.special_instructions||null,
        emergency_contact:form.emergency_contact||null,
        status:form.status,
        notes:form.notes||null,
        assigned_by:user?.id||profile?.id,
        updated_at:new Date().toISOString()
      };
      const query=editing
        ?client.from('special_nurse_assignments').update(payload).eq('id',editing.id).select('id').single()
        :client.from('special_nurse_assignments').insert(payload).select('id').single();
      const {data,error}=await query;
      setBusy(false);
      if(error){showToast('error',error.message||'Unable to save Special Nurse assignment.');return}
      showToast('success',editing?'Special Nurse assignment updated successfully.':'Special Nurse assigned successfully.');
      setShowForm(false);await load();
      writeAuditEvent(editing?'Special Nurse Assignment Updated':'Special Nurse Assigned','Special Nurse',data?.id||editing?.id,{
        patient_id:form.patient_id,
        nurse_name:payload.nurse_name,
        nurse_source:payload.nurse_source,
        outsourcing_organisation:payload.outsourced_company_name,
        shift:form.shift,
        coverage_days:form.coverage_days,
        status:form.status
      },'Success');
    }

    async function updateStatus(row,status){
      if(!canUpdate)return;
      const {data:{user}}=await client.auth.getUser();
      const {error}=await client.from('special_nurse_assignments').update({
        status,
        last_status_updated_by:user?.id||profile?.id,
        last_status_updated_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      }).eq('id',row.id);
      if(error){showToast('error',error.message||'Unable to update assignment status.');return}
      showToast('success',`Assignment status changed to ${status}.`);
      await load();
    }

    const rows=assignments.map(row=>[
      patientLabel(row.patient_id),
      nurseLabel(row),
      row.nurse_source||'Our Employee',
      row.nurse_source==='Outsourced'?(row.outsourced_company_name||'—'):'Samara Care',
      row.assignment_type||'Special Nurse',
      daysLabel(row.coverage_days),
      `${clockLabel(row.start_time)} – ${clockLabel(row.end_time)}`,
      row.shift||'—',
      `${formatDateIN(row.start_date)}${row.end_date?` to ${formatDateIN(row.end_date)}`:''}`,
      row.duration_type+(row.duration_value?` · ${row.duration_value}`:''),
      row.responsibilities||row.special_instructions||'—',
      h('span',{className:`badge ${row.status==='Active'?'':'off'}`},row.status||'Active'),
      h('div',{className:'employee-actions'},
        canManage&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openEdit(row)},'Edit'),
        canUpdate&&h('select',{value:row.status||'Active',onChange:e=>updateStatus(row,e.target.value)},['Active','On Duty','Off Duty','Leave','Completed','Cancelled'].map(x=>h('option',{key:x,value:x},x)))
      )
    ]);

    return h(React.Fragment,null,
      h(Section,{title:'Special Nurse Management',subtitle:'Dedicated nurse assignment, coverage, duration and responsibility tracking'},
        message&&h('div',{className:'message error'},message),
        h('div',{className:'panel-head'},
          h('div',null,h('p',{className:'small-note'},'All authorised users can view assignments. Admin and Manager can create/edit; Nurses and Caregivers can update duty status.')),
          canManage&&h('button',{type:'button',className:'btn btn-primary',onClick:openCreate},'Assign Special Nurse')
        )
      ),
      h(LogTable,{
        title:`Special Nurse Assignments (${rows.length})`,
        subtitle:'Current and historical dedicated nursing coverage',
        heads:['Assigned Patient','Special Nurse','Source','Company / Organisation','Assignment','Days','Time','Shift','Period','Duration','Responsibilities / Instructions','Status','Action'],
        rows
      }),
      !loading&&!message&&!rows.length&&h('div',{className:'card panel'},h('p',{className:'small-note'},'No Special Nurse assignment has been entered. Admin or Manager can create the first assignment.')),
      showForm&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setShowForm(false)}},
        h('form',{className:'card modal',style:{width:'min(1050px,96vw)',maxHeight:'92vh',overflow:'auto'},onSubmit:save},
          h('div',{className:'panel-head'},
            h('div',null,h('h3',null,editing?'Edit Special Nurse Assignment':'Assign Special Nurse'),h('small',null,'Patient-specific dedicated nursing coverage')),
            h('button',{type:'button',className:'close',onClick:()=>setShowForm(false)},'×')
          ),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Assigned Patient'),h('select',{required:true,value:form.patient_id,onChange:e=>setForm({...form,patient_id:e.target.value})},h('option',{value:''},'Select patient'),patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},patientLabel(p.id))))),
            h('div',{className:'field'},h('label',null,'Special Nurse Source'),h('select',{
              value:form.nurse_source,
              onChange:e=>setForm({...form,nurse_source:e.target.value,nurse_profile_id:'',nurse_name:'',outsourced_company_name:'',outsourced_registration_number:'',outsourced_contact_person:'',outsourced_contact_number:'',outsourced_agreement_reference:''})
            },['Our Employee','Outsourced'].map(x=>h('option',{key:x,value:x},x)))),
            form.nurse_source==='Our Employee'
              ?h('div',{className:'field'},h('label',null,'Registered Nurse / Caregiver'),h('select',{required:true,value:form.nurse_profile_id,onChange:e=>{const emp=employeeFor(e.target.value);setForm({...form,nurse_profile_id:e.target.value,nurse_name:formalName(emp)||''})}},h('option',{value:''},'Select Nurse or Caregiver'),employees.map(emp=>h('option',{key:emp.id,value:emp.id},`${formalName(emp)}${emp.employee_id?` · ${emp.employee_id}`:''} · ${emp.role}`))))
              :h('div',{className:'field'},h('label',null,'Outsourced Special Nurse Name'),h('input',{required:true,value:form.nurse_name,onChange:e=>setForm({...form,nurse_name:e.target.value}),placeholder:'Name of outsourced nurse'})),
            form.nurse_source==='Outsourced'&&h('div',{className:'field'},h('label',null,'Company / Organisation Name'),h('input',{required:true,value:form.outsourced_company_name,onChange:e=>setForm({...form,outsourced_company_name:e.target.value}),placeholder:'Agency, hospital or service provider'})),
            form.nurse_source==='Outsourced'&&h('div',{className:'field'},h('label',null,'Nurse Registration Number (optional)'),h('input',{value:form.outsourced_registration_number,onChange:e=>setForm({...form,outsourced_registration_number:e.target.value}),placeholder:'Nursing council registration number'})),
            form.nurse_source==='Outsourced'&&h('div',{className:'field'},h('label',null,'Organisation Contact Person'),h('input',{value:form.outsourced_contact_person,onChange:e=>setForm({...form,outsourced_contact_person:e.target.value}),placeholder:'Coordinator / supervisor name'})),
            form.nurse_source==='Outsourced'&&h('div',{className:'field'},h('label',null,'Organisation Contact Number'),h('input',{value:form.outsourced_contact_number,onChange:e=>setForm({...form,outsourced_contact_number:e.target.value}),placeholder:'Mobile / office number'})),
            form.nurse_source==='Outsourced'&&h('div',{className:'field'},h('label',null,'Agreement / Work Order Reference'),h('input',{value:form.outsourced_agreement_reference,onChange:e=>setForm({...form,outsourced_agreement_reference:e.target.value}),placeholder:'Optional agreement, invoice or work-order number'})),
            h('div',{className:'field'},h('label',null,'Assignment Type'),h('select',{value:form.assignment_type,onChange:e=>setForm({...form,assignment_type:e.target.value})},['Dedicated Nurse','Special Nurse','One-to-One Caregiver','Night Attendant','Procedure Support','Temporary Relief'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'Coverage Days'),h('div',{className:'check-grid'},['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day=>h('label',{className:'check-card',key:day},h('input',{type:'checkbox',checked:form.coverage_days.includes(day),onChange:()=>toggleDay(day)}),h('span',null,day))))),
            h('div',{className:'field'},h('label',null,'Start Time'),h('input',{type:'time',value:form.start_time,onChange:e=>setForm({...form,start_time:e.target.value})})),
            h('div',{className:'field'},h('label',null,'End Time'),h('input',{type:'time',value:form.end_time,onChange:e=>setForm({...form,end_time:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Shift'),h('select',{value:form.shift,onChange:e=>setForm({...form,shift:e.target.value})},['Day Shift','Night Shift','Both Shifts','Custom Hours'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value})},['Active','On Duty','Off Duty','Leave','Completed','Cancelled'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Start Date'),h(StrictDateInput,{max:todayISOIndia(),value:form.start_date,onChange:e=>setForm({...form,start_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'End Date'),h(StrictDateInput,{min:form.start_date||undefined,value:form.end_date,onChange:e=>setForm({...form,end_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Duration'),h('select',{value:form.duration_type,onChange:e=>setForm({...form,duration_type:e.target.value})},['Single Shift','1 Day','3 Days','5 Days','7 Days','15 Days','1 Month','Until further order','Custom'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Custom Duration / Details'),h('input',{value:form.duration_value,onChange:e=>setForm({...form,duration_value:e.target.value}),placeholder:'Example: 6 weeks / 12-hour duty'})),
            h('div',{className:'field'},h('label',null,'Emergency Contact'),h('input',{value:form.emergency_contact,onChange:e=>setForm({...form,emergency_contact:e.target.value}),placeholder:'Contact number'})),
            h('div',{className:'field span-2'},h('label',null,'Responsibilities'),h('textarea',{rows:3,value:form.responsibilities,onChange:e=>setForm({...form,responsibilities:e.target.value}),placeholder:'Medication supervision, mobility support, fall prevention, feeding, observation, escort, etc.'})),
            h('div',{className:'field span-2'},h('label',null,'Special Instructions / Precautions'),h('textarea',{rows:3,value:form.special_instructions,onChange:e=>setForm({...form,special_instructions:e.target.value}),placeholder:'Clinical precautions, escalation instructions, doctor advice or family requirements'})),
            h('div',{className:'field span-2'},h('label',null,'Other Notes'),h('textarea',{rows:2,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value})}))
          ),
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowForm(false)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':editing?'Update Assignment':'Save Assignment'))
        )
      ),
      toast&&h('div',{className:`samara-toast ${toast.type}`,role:'status','aria-live':'polite'},
        h('span',{className:'samara-toast-icon','aria-hidden':'true'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.type==='success'?'Special Nurse updated':'Update failed'),h('span',null,toast.text)),
        h('button',{type:'button','aria-label':'Close notification',onClick:()=>setToast(null)},'×')
      )
    );
  }

