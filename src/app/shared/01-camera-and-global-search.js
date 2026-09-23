  function CameraCaptureModal({config,onClose}){
    const videoRef=React.useRef(null),canvasRef=React.useRef(null),streamRef=React.useRef(null);
    const [error,setError]=React.useState(''),[ready,setReady]=React.useState(false),[captured,setCaptured]=React.useState('');
    React.useEffect(()=>{
      let cancelled=false;
      async function start(){
        try{
          if(!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.');
          const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:config.facingMode||'user',width:{ideal:1280},height:{ideal:720}},audio:false});
          if(cancelled){stream.getTracks().forEach(t=>t.stop());return}
          streamRef.current=stream;
          if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setReady(true)}
        }catch(e){setError(e.message||'Unable to open camera. Please allow camera permission and try again.')}
      }
      start();
      return()=>{cancelled=true;streamRef.current?.getTracks().forEach(t=>t.stop())}
    },[config]);
    function takePhoto(){
      const video=videoRef.current,canvas=canvasRef.current;
      if(!video||!canvas)return;
      const width=video.videoWidth||1280,height=video.videoHeight||720;
      canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(video,0,0,width,height);
      setCaptured(canvas.toDataURL('image/jpeg',0.9));
    }
    function retake(){setCaptured('')}
    function usePhoto(){
      const canvas=canvasRef.current;
      canvas.toBlob(blob=>{
        if(!blob)return;
        const file=new File([blob],`${config.filePrefix||'camera'}-${Date.now()}.jpg`,{type:'image/jpeg'});
        config.onCapture(file);onClose();
      },'image/jpeg',0.9);
    }
    return h('div',{className:'modal-backdrop camera-backdrop'},h('div',{className:'card modal camera-modal'},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,config.title||'Camera Capture'),h('small',null,config.facingMode==='environment'?'Rear camera / document capture':'Front camera / webcam')),h('button',{type:'button',className:'close',onClick:onClose},'×')),
      error?h('div',{className:'message error'},error):null,
      h('div',{className:'camera-stage'},
        h('video',{ref:videoRef,playsInline:true,muted:true,className:'camera-video',style:{display:captured?'none':'block'}}),
        captured?h('img',{src:captured,alt:'Captured preview',className:'camera-preview'}):null,
        h('canvas',{ref:canvasRef,className:'camera-canvas'})
      ),
      h('div',{className:'camera-actions'},
        !captured?h('button',{type:'button',className:'btn btn-primary',disabled:!ready,onClick:takePhoto},ready?'Capture Photo':'Opening Camera…'):null,
        captured?h('button',{type:'button',className:'btn btn-secondary',onClick:retake},'Retake'):null,
        captured?h('button',{type:'button',className:'btn btn-primary',onClick:usePhoto},'Use This Photo'):null,
        h('button',{type:'button',className:'btn btn-danger',onClick:onClose},'Cancel')
      )
    ));
  }

  function GlobalSearch({onNavigate,profile}){
    const [query,setQuery]=React.useState('');
    const [results,setResults]=React.useState([]);
    const [busy,setBusy]=React.useState(false);
    const [open,setOpen]=React.useState(false);
    const timerRef=React.useRef(null);
    React.useEffect(()=>()=>clearTimeout(timerRef.current),[]);
    function searchable(value){return String(value||'').toLowerCase()}
    function matches(row,q,fields){return fields.some(key=>searchable(row[key]).includes(q))}
    function change(value){
      setQuery(value);clearTimeout(timerRef.current);
      const trimmed=value.trim().toLowerCase();
      if(trimmed.length<2){setResults([]);setOpen(false);return}
      timerRef.current=setTimeout(async()=>{
        setBusy(true);
        const clinicalOnly=CLINICAL_ROLES.includes(profile?.role);
        const [employees,patients]=await Promise.all([
          clinicalOnly?Promise.resolve({data:[]}):client.from('profiles').select('id,title,full_name,employee_id,login_id,mobile,role,is_active').limit(300),
          client.from('patients').select('id,title,full_name,patient_id,mobile,attendant_phone,room_no,bed_no,diagnosis,treating_doctor,referring_doctor,hospital_name,is_active').limit(500)
        ]);
        const employeeRows=(employees.data||[]).filter(row=>matches(row,trimmed,['title','full_name','employee_id','login_id','mobile','role'])).map(row=>({type:'Employee',row,label:formalName(row),sub:[row.employee_id,row.login_id,row.role,row.mobile].filter(Boolean).join(' · ')}));
        const patientRows=(patients.data||[]).filter(row=>matches(row,trimmed,['title','full_name','patient_id','mobile','attendant_phone','room_no','bed_no','diagnosis','treating_doctor','referring_doctor','hospital_name'])).map(row=>({type:'Patient',row,label:formalName(row),sub:[row.patient_id,row.room_no&&`Room ${row.room_no}${row.bed_no?`-${row.bed_no}`:''}`,row.diagnosis,row.mobile||row.attendant_phone].filter(Boolean).join(' · ')}));
        setResults([...patientRows,...employeeRows].slice(0,20));setOpen(true);setBusy(false);
      },250);
    }
    function choose(result){
      setOpen(false);setQuery('');
      onNavigate(result.type==='Patient'?'Patients':'Employees');
    }
    return h('div',{className:'global-search'},
      h('div',{className:'global-search-box'},h('span',{className:'global-search-icon','aria-hidden':'true'},'⌕'),h('input',{value:query,onChange:e=>change(e.target.value),onFocus:()=>query.trim().length>=2&&setOpen(true),placeholder:CLINICAL_ROLES.includes(profile?.role)?'Search patient…':'Search patient or employee…','aria-label':'Global search'}),query&&h('button',{type:'button',className:'global-search-clear',onClick:()=>{setQuery('');setResults([]);setOpen(false)}},'×')),
      open&&h('div',{className:'global-search-results'},busy?h('div',{className:'global-search-empty'},'Searching…'):results.length?results.map((result,index)=>h('button',{type:'button',className:'global-search-result',key:`${result.type}-${result.row.id}-${index}`,onClick:()=>choose(result)},h('span',{className:`search-type ${result.type.toLowerCase()}`},result.type),h('span',{className:'search-result-main'},h('strong',null,result.label||'Unnamed'),h('small',null,result.sub||'No additional details')))):h('div',{className:'global-search-empty'},CLINICAL_ROLES.includes(profile?.role)?'No matching patients found.':'No matching patients or employees found.'))
    );
  }


