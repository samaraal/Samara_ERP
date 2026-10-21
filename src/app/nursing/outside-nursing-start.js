  // 2.18.63: Outside Samara Nursing — "Start a New Procedure" (SQL 267).
  // Start: patient (or a new outside patient in the same form), procedure, place, SOURCE (who asked for it) and WHO APPROVED it
  // (+ how, optional photo). Not blocked — Admin still checks the charge before any invoice.
  // Finish: the existing completed-procedure form (used items etc.) opens prefilled and is saved + linked in one step.
  const ONS_SOURCES=["Doctor's prescription",'Family request','Hospital referral','Director / Admin'];
  const ONS_SOURCE_HINT={"Doctor's prescription":'Doctor name','Family request':'Family member name and relation','Hospital referral':'Hospital / doctor name','Director / Admin':'Name'};
  const ONS_VIA=['Phone call','WhatsApp','Written','In person'];
  const onsTime=v=>{if(!v)return '';const d=new Date(v);return Number.isFinite(d.getTime())?`${formatDateIN(d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))} ${d.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true}).toUpperCase()}`:''};
  const onsSourceText=s=>s?`${s.source}${s.source_detail?` (${s.source_detail})`:''} · Approved by ${s.approved_by} (${s.approved_via})`:'';
  // SQL 267 not yet run → {missing:true}: screens keep the earlier "Submit completed procedure" path.
  async function loadOutsideStarts(){
    try{
      const r=await client.rpc('outside_nursing_start',{p_action:'list',p_data:{}});
      if(r.error){if(r.error.code==='PGRST202'||/outside_nursing_start|could not find the function/i.test(String(r.error.message||'')))return {rows:[],missing:true};throw r.error}
      return {rows:Array.isArray(r.data)?r.data:[],missing:false};
    }catch(e){return {rows:[],missing:false,error:e.message||'Could not load started procedures.'}}
  }
  async function onsCompressImage(file){
    const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(Error('Could not read the photo.'));fr.readAsDataURL(file)});
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('This file is not a photo.'));i.src=data});
    let max=1200,q=0.72,out='';
    for(let k=0;k<4;k++){
      const scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');
      c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      out=c.toDataURL('image/jpeg',q);if(out.length<=650000)return out;max=Math.round(max*0.75);q=Math.max(0.5,q-0.08);
    }
    if(out.length>650000)throw Error('The photo is too large. Please take it again a little further away.');
    return out;
  }
  async function onsShowProof(id){
    const w=window.open('','_blank');
    try{const r=await client.rpc('outside_nursing_start',{p_action:'proof',p_data:{id}});if(r.error)throw r.error;
      if(!r.data?.proof_image){if(w)w.close();showSamaraActionToast('error','No photo','No proof photo was added for this procedure.');return}
      if(w){w.document.write(`<title>Approval proof</title><body style="margin:0;background:#222;display:flex;justify-content:center"><img src="${r.data.proof_image}" style="max-width:100%;height:auto"></body>`);w.document.close()}
    }catch(e){if(w)w.close();showSamaraActionToast('error','Could not open the photo',e.message||'')}
  }
  function OutsideStartForm({patients=[],procedureNames=[],onDone,onCancel}){
    const [f,setF]=React.useState({id:crypto.randomUUID(),patient_id:'',newPatient:false,full_name:'',phone:'',address:'',procedure_name:'',location:'At Samara',source:'',source_detail:'',approved_by:'',approved_via:'',notes:'',proof_image:''});
    const [q,setQ]=React.useState(''),[busy,setBusy]=React.useState(false),[err,setErr]=React.useState(''),[photoBusy,setPhotoBusy]=React.useState(false);
    const set=patch=>{setErr('');setF(cur=>({...cur,...patch}))};
    const ql=q.trim().toLowerCase();
    const list=[...patients].filter(p=>ql.length<3||`${p.full_name||''} ${p.phone||''}`.toLowerCase().includes(ql)).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||'')));
    async function pickPhoto(e){const file=e.target.files&&e.target.files[0];e.target.value='';if(!file)return;setPhotoBusy(true);try{set({proof_image:await onsCompressImage(file)})}catch(x){setErr(x.message)}finally{setPhotoBusy(false)}}
    async function save(e){
      e.preventDefault();if(busy)return;
      const need=(ok,text)=>{if(!ok){setErr(text);return true}return false};
      if(f.newPatient){if(need(f.full_name.trim(),'Enter the patient name.')||need(/^[0-9+\s-]{8,15}$/.test(f.phone.trim()),'Enter a valid contact phone number.'))return}
      else if(need(f.patient_id,'Choose the patient (or tap + New patient).'))return;
      if(need(f.procedure_name.trim(),'Enter the procedure.')||need(f.source,'Choose the source — who asked for this procedure.')||need(f.approved_by.trim(),'Enter who approved this procedure.')||need(f.approved_via,'Choose how it was approved.'))return;
      setBusy(true);setErr('');
      try{
        const p_data={id:f.id,procedure_name:f.procedure_name.trim(),location:f.location,source:f.source,source_detail:f.source_detail.trim(),approved_by:f.approved_by.trim(),approved_via:f.approved_via,notes:f.notes.trim(),proof_image:f.proof_image||null,
          ...(f.newPatient?{new_patient:{id:crypto.randomUUID(),full_name:f.full_name.trim(),phone:f.phone.trim(),address:f.address.trim()}}:{patient_id:f.patient_id})};
        const r=await client.rpc('outside_nursing_start',{p_action:'start',p_data});if(r.error)throw r.error;
        showSamaraActionToast('success','Procedure started',`${f.procedure_name.trim()} · press Finish when it is done.`);
        onDone&&onDone(r.data);
      }catch(x){setErr(x.message||'Could not start the procedure.');showSamaraActionToast('error','Could not start',x.message||'')}
      finally{setBusy(false)}
    };
    const fld=(label,el,wide)=>h('div',{className:'field',style:wide?{gridColumn:'1 / -1'}:undefined},h('label',null,label),el);
    return h('form',{className:'card panel ons-start',onSubmit:save,'data-no-hover':'true',id:'outside-start-form',tabIndex:-1},
      h('style',null,`.ons-start{border:2px solid #b20b5d;border-radius:16px;margin:12px 0;scroll-margin-top:90px}.ons-start .ons-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.ons-start .ons-sub{color:#7b6670;font-size:12.5px;margin:2px 0 0}.ons-start .ons-photo img{max-height:120px;border-radius:8px;border:1px solid #ecd3df}.ons-start .ons-link{background:none;border:0;color:#b20b5d;font-weight:800;cursor:pointer;padding:4px 0}`),
      h('h3',{style:{marginTop:0}},'Start a new procedure'),
      h('p',{className:'ons-sub'},'Record who asked for it and who approved it. Press Finish (with used items) once the procedure is done.'),
      err&&h('p',{className:'message error',role:'alert'},err),
      h('div',{className:'ons-grid'},
        !f.newPatient&&fld('Search patient',h('input',{type:'text',value:q,placeholder:'Name / phone (3 letters)',onChange:e=>setQ(e.target.value)})),
        !f.newPatient&&fld('Patient',h('div',null,h('select',{value:f.patient_id,onChange:e=>set({patient_id:e.target.value})},h('option',{value:''},'Choose patient'),list.map(p=>h('option',{key:p.id,value:p.id},`${p.full_name} · ${p.phone||''}`))),
          h('button',{type:'button',className:'ons-link',onClick:()=>set({newPatient:true,patient_id:''})},'+ New patient'))),
        f.newPatient&&fld('New patient name',h('input',{type:'text',value:f.full_name,onChange:e=>set({full_name:e.target.value})})),
        f.newPatient&&fld('Contact phone',h('input',{type:'tel',inputMode:'tel',value:f.phone,onChange:e=>set({phone:e.target.value})})),
        f.newPatient&&fld('Address (optional)',h('div',null,h('input',{type:'text',value:f.address,onChange:e=>set({address:e.target.value})}),h('button',{type:'button',className:'ons-link',onClick:()=>set({newPatient:false})},'‹ Choose an existing patient'))),
        fld('Procedure',h('div',null,h('input',{type:'text',list:'ons-procedures',value:f.procedure_name,placeholder:'e.g. IV line insertion',onChange:e=>set({procedure_name:e.target.value})}),h('datalist',{id:'ons-procedures'},procedureNames.map(n=>h('option',{key:n,value:n}))))),
        fld('Where',h('select',{value:f.location,onChange:e=>set({location:e.target.value})},['At Samara','Home / outside visit'].map(x=>h('option',{key:x,value:x},x)))),
        fld('Source — who asked for it',h('select',{value:f.source,onChange:e=>set({source:e.target.value})},h('option',{value:''},'Choose source'),ONS_SOURCES.map(x=>h('option',{key:x,value:x},x)))),
        f.source&&fld(ONS_SOURCE_HINT[f.source]||'Details',h('input',{type:'text',value:f.source_detail,onChange:e=>set({source_detail:e.target.value})})),
        fld('Approved by',h('input',{type:'text',value:f.approved_by,placeholder:'Name of the person who approved',onChange:e=>set({approved_by:e.target.value})})),
        fld('How was it approved',h('select',{value:f.approved_via,onChange:e=>set({approved_via:e.target.value})},h('option',{value:''},'Choose'),ONS_VIA.map(x=>h('option',{key:x,value:x},x)))),
        fld('Proof photo (optional) — prescription / message',h('div',{className:'ons-photo'},
          f.proof_image?h('div',null,h('img',{src:f.proof_image,alt:'Proof photo'}),h('div',null,h('button',{type:'button',className:'ons-link',onClick:()=>set({proof_image:''})},'Remove photo'))):
            h('input',{type:'file',accept:'image/*',capture:'environment',disabled:photoBusy,onChange:pickPhoto}),photoBusy&&h('small',null,' Preparing photo…'))),
        fld('Notes (optional)',h('input',{type:'text',value:f.notes,onChange:e=>set({notes:e.target.value})}),true)),
      h('div',{className:'actions',style:{marginTop:12}},
        h('button',{type:'submit',className:'btn btn-primary',disabled:busy||photoBusy},busy?'Starting…':'Start procedure'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:onCancel},'Cancel')));
  }
  function OutsideStartedList({starts=[],patients=[],profile,onFinish,onChanged,canStart}){
    const [cancelId,setCancelId]=React.useState(''),[reason,setReason]=React.useState(''),[busy,setBusy]=React.useState(false);
    const open=starts.filter(s=>s.status==='Started');
    const name=id=>(patients.find(p=>p.id===id)||{}).full_name||'Outside patient';
    const mayCancel=s=>s.started_by===profile?.id||s.started_by===profile?.auth_user_id||['Admin','Manager'].includes(profile?.role)||(profile?.__nurseMode&&['Admin','Manager'].includes(profile.__nurseMode.role));
    async function doCancel(s){
      if(String(reason).trim().length<5){showSamaraActionToast('error','Reason needed','Enter why the procedure was not done (at least 5 letters).');return}
      setBusy(true);
      try{const r=await client.rpc('outside_nursing_start',{p_action:'cancel',p_data:{id:s.id,reason:reason.trim()}});if(r.error)throw r.error;
        showSamaraActionToast('success','Procedure cancelled','Kept in history with the reason.');setCancelId('');setReason('');onChanged&&onChanged()}
      catch(e){showSamaraActionToast('error','Could not cancel',e.message||'')}finally{setBusy(false)}
    }
    if(!open.length)return h('p',{className:'small-note',style:{margin:'6px 0'}},'No procedure is waiting to be finished.');
    return h('div',{className:'ons-open','data-no-hover':'true'},
      h('style',null,`.ons-open .ons-row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;border:1px solid #f0c75e;background:#fffaf0;border-radius:12px;padding:10px 12px;margin:0 0 8px}.ons-open .ons-row b{color:#321d28}.ons-open .ons-row small{display:block;color:#6d5963}.ons-open .ons-acts{display:flex;gap:6px;flex-wrap:wrap}.ons-open .ons-go{background:#0a8a4a;border:1px solid #0a8a4a;color:#fff;border-radius:10px;padding:7px 16px;font-weight:800;cursor:pointer}`),
      open.map(s=>h('div',{key:s.id,className:'ons-row'},
        h('div',{style:{minWidth:0,flex:'1 1 260px'}},h('b',null,`${name(s.patient_id)} · ${s.procedure_name}`),
          h('small',null,`${s.location} · Started ${onsTime(s.started_at)} by ${s.started_by_name||'staff'}`),
          h('small',null,onsSourceText(s)),
          s.has_proof&&h('button',{type:'button',className:'ons-link',style:{background:'none',border:0,color:'#b20b5d',fontWeight:800,cursor:'pointer',padding:0},onClick:()=>onsShowProof(s.id)},'View proof photo')),
        cancelId===s.id?h('div',{className:'ons-acts'},h('input',{type:'text',value:reason,placeholder:'Why not done?',onChange:e=>setReason(e.target.value)}),
            h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>doCancel(s)},busy?'…':'Confirm cancel'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setCancelId('');setReason('')}},'Back')):
          h('div',{className:'ons-acts'},canStart&&h('button',{type:'button',className:'ons-go',onClick:()=>onFinish(s)},'Finish'),mayCancel(s)&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setCancelId(s.id);setReason('')}},'Cancel')))));
  }
