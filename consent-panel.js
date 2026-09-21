(function(){
  'use strict';
  const h=React.createElement;
  const isConsent=doc=>/consent/i.test(String(doc.document_type||''));
  function Panel({client,patient,documents=[],canUpload,onSaved,onOpen,onPrint}){
    const [file,setFile]=React.useState(null),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[failed,setFailed]=React.useState(false);
    const lock=React.useRef(false),saved=React.useRef(null),input=React.useRef(null);
    const consentDocs=documents.filter(isConsent);
    function choose(e){
      const next=e.target.files?.[0]||null;
      if(!next)return;
      saved.current=null;setMessage('');setFailed(false);
      if(next.size>15*1024*1024||!(/\.(pdf|jpe?g|png|webp)$/i.test(next.name))){setFile(null);e.target.value='';setFailed(true);setMessage('Choose a PDF, JPG, PNG or WebP file up to 15 MB.');return;}
      setFile(next);
    }
    async function upload(e){
      e.preventDefault();
      if(!canUpload||lock.current)return;
      if(!file){setFailed(true);setMessage('Choose the signed consent form first.');return;}
      lock.current=true;setBusy(true);setFailed(false);setMessage('Uploading signed consent…');
      try{
        if(!saved.current){
          const {data:auth,error:authError}=await client.auth.getUser();
          if(authError||!auth?.user)throw authError||Error('Please sign in again.');
          const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
          const path=`${patient.id}/${Date.now()}-${Math.random().toString(36).slice(2,10)}-${safe}`;
          const uploaded=await client.storage.from('patient-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});
          if(uploaded.error)throw uploaded.error;
          const doc={patient_id:patient.id,document_type:'Signed Admission Consent Form',document_name:file.name,storage_path:path,mime_type:file.type||null,file_size:file.size,uploaded_by:auth.user.id,is_verified:true};
          const result=await client.from('patient_documents').insert(doc).select().single();
          if(result.error)throw Error('The file was stored, but its document entry could not be saved: '+result.error.message);
          saved.current={path,doc:result.data};
        }
        const changes={admission_consent_status:'Completed',admission_consent_uploaded_at:new Date().toISOString(),admission_consent_storage_path:saved.current.path,admission_consent_exception_reason:null};
        const updated=await client.from('patients').update(changes).eq('id',patient.id).select('id').single();
        if(updated.error)throw Error('Consent file saved. Updating consent status failed; click Retry to finish without uploading again. '+updated.error.message);
        onSaved?.(patient.id,saved.current.doc,changes);
        saved.current=null;setFile(null);if(input.current)input.current.value='';
        setMessage('Signed consent uploaded. Consent status: Completed.');
      }catch(error){setFailed(true);setMessage(error.message||'Unable to upload consent. Please try again.');}
      finally{lock.current=false;setBusy(false);}
    }
    return h('section',{className:'section-card'},
      h('h4',null,'Admission Consent'),
      h('p',null,`${patient.full_name||'Resident'} · ${patient.patient_id||''}`),
      h('p',null,`Status: ${patient.admission_consent_status||'Not recorded'}`),
      canUpload&&h('form',{onSubmit:upload},
        h('label',{className:'field'},'Signed consent form',h('input',{ref:input,type:'file',accept:'.pdf,.jpg,.jpeg,.png,.webp',disabled:busy||Boolean(saved.current),onChange:choose})),
        h('p',{className:'small-note'},file?`Selected: ${file.name}`:'Upload the signed PDF or photo (up to 15 MB).'),
        h('button',{type:'submit',className:'btn btn-primary',disabled:busy||!file},busy?'Uploading…':saved.current?'Retry consent status':'Upload Signed Consent')),
      message&&h('p',{role:failed?'alert':'status',className:`message ${failed?'warning':'success'}`},message),
      onPrint&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:onPrint},'Print Consent Form'),
      h('h4',null,'Saved Consent Forms'),
      consentDocs.length?consentDocs.map(doc=>h('div',{className:'timeline-item',key:doc.id||doc.storage_path},h('strong',null,doc.document_type),h('span',null,doc.document_name||doc.file_name||'Consent form'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onOpen(doc)},'Open Consent'))):h('p',{className:'small-note'},'No consent form uploaded.'),
      !canUpload&&h('p',{className:'small-note'},'View only. An authorised admission staff member can upload the signed consent.'));
  }
  window.SamaraConsent={Panel,isConsent};
})();
