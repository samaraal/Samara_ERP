  // ── 2.19.93: BEDSIDE VERIFICATION (MAR) — QR TRIAL, later NFC (SQL 363) ─────────────────────────────────────
  // Self-contained. OFF by default: until Admin turns on "QR trial" (ADMIN → Bedside Verification) nothing here
  // shows or runs anywhere in the ERP. If SQL 363 is not installed yet, the mode reads as OFF.
  // Record-only trial: the scan is saved in its own table AFTER the dose is saved. It never blocks, changes or
  // delays a dose entry; any scan / network problem is ignored by the MAR.

  const BEDSIDE_QR_PREFIX='SAMARA-BED:';
  const BEDSIDE_NOT_SCANNED_REASONS=['Sticker missing / damaged','Camera / phone problem','Phone not available','Guest moved / bed changed','Other'];
  // 2.19.94: every bedside entry, not only "Administer now" (SQL 364)
  const BEDSIDE_TASK_LABEL={medicine:'Medicine',procedure:'Nursing Procedure',care:'Daily Care',vitals:'Vital Signs',meal:'Meal',beverage:'Beverage'};
  const BEDSIDE_RESULT_LABEL={verified:'✅ Bed verified',wrong_bed:'⚠️ Wrong bed',unknown_tag:'⚠️ Unknown sticker',no_bed:'⚠️ Guest has no bed on record',not_scanned:'— Not scanned'};

  // Mode is read once a minute; any error → 'off'.
  const bedsideModeCache={mode:'off',at:0};
  async function bedsideLoadMode(force=false){
    if(!force&&bedsideModeCache.at&&Date.now()-bedsideModeCache.at<60000)return bedsideModeCache.mode;
    let mode='off';
    try{
      const r=await client.from('bedside_verify_settings').select('mode').eq('id',1).maybeSingle();
      if(!r.error&&r.data&&['off','qr_trial','nfc'].includes(r.data.mode))mode=r.data.mode;
    }catch(_){mode='off'}
    bedsideModeCache.mode=mode;bedsideModeCache.at=Date.now();
    return mode;
  }
  function useBedsideMode(){
    const [mode,setMode]=React.useState(bedsideModeCache.mode);
    React.useEffect(()=>{let live=true;bedsideLoadMode().then(m=>{if(live)setMode(m)});return()=>{live=false}},[]);
    return mode;
  }

  // 2.19.95: "Scan & Administer" — one scan at the bed opens that Guest's work; the scan is carried to each entry
  // screen for 10 minutes (same Guest only), so every entry is saved as bed-verified.
  const BEDSIDE_SESSION_KEY='samara_bedside_session';
  function bedsideSessionGet(patientId){
    try{
      const s=JSON.parse(sessionStorage.getItem(BEDSIDE_SESSION_KEY)||'null');
      if(!s||!s.code||!s.patientId||Date.now()-Number(s.at||0)>10*60*1000)return null;
      if(patientId&&String(s.patientId)!==String(patientId))return null;
      return s;
    }catch(_){return null}
  }
  function bedsideSessionSet(s){try{sessionStorage.setItem(BEDSIDE_SESSION_KEY,JSON.stringify({...s,at:Date.now()}))}catch(_){}}
  function bedsideSessionClear(){try{sessionStorage.removeItem(BEDSIDE_SESSION_KEY)}catch(_){}}

  // A crash inside any bedside piece shows nothing instead of breaking the screen around it.
  class BedsideSafe extends React.Component{
    constructor(props){super(props);this.state={failed:false}}
    static getDerivedStateFromError(){return {failed:true}}
    componentDidCatch(error){console.warn('Bedside verification part hidden after an error:',error)}
    render(){return this.state.failed?null:this.props.children}
  }

  async function bedsideLoadJsQr(){
    if(window.jsQR)return window.jsQR;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/jsQR.js?v=1.4.0';s.onload=resolve;s.onerror=()=>reject(new Error('QR reader could not be loaded.'));document.head.appendChild(s)});
    if(!window.jsQR)throw new Error('QR reader is unavailable on this device.');
    return window.jsQR;
  }

  // Camera QR reader (phone back camera). Uses the browser's built-in reader when present, else jsQR.
  function BedsideQrScanner({title='Scan the bed sticker',onCode,onClose}){
    const videoRef=React.useRef(null),canvasRef=React.useRef(null);
    const [status,setStatus]=React.useState('Starting camera…'),[error,setError]=React.useState('');
    React.useEffect(()=>{
      let stream=null,timer=null,stopped=false,detector=null,reader=null;
      const stop=()=>{stopped=true;if(timer)clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>{try{t.stop()}catch(_){}})};
      (async()=>{
        try{
          if(!navigator.mediaDevices?.getUserMedia)throw new Error('This device or browser cannot open the camera. Use the Samara phone in Chrome.');
          stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
          if(stopped){stop();return}
          const v=videoRef.current;if(!v){stop();return}
          v.srcObject=stream;v.setAttribute('playsinline','true');await v.play();
          try{if('BarcodeDetector' in window){const f=await window.BarcodeDetector.getSupportedFormats();if(f.includes('qr_code'))detector=new window.BarcodeDetector({formats:['qr_code']})}}catch(_){detector=null}
          if(!detector)reader=await bedsideLoadJsQr();
          if(stopped)return;
          setStatus('Point the camera at the QR sticker on the bed');
          const tick=async()=>{
            if(stopped)return;
            let text='';
            try{
              const vv=videoRef.current;
              if(vv&&vv.readyState>=2){
                if(detector){const codes=await detector.detect(vv);text=codes?.[0]?.rawValue||''}
                else{
                  const c=canvasRef.current,w=vv.videoWidth,hgt=vv.videoHeight;
                  if(c&&w&&hgt){const scale=Math.min(1,640/w);c.width=Math.round(w*scale);c.height=Math.round(hgt*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(vv,0,0,c.width,c.height);const img=ctx.getImageData(0,0,c.width,c.height);const found=reader(img.data,c.width,c.height,{inversionAttempts:'dontInvert'});text=found?.data||''}
                }
              }
            }catch(_){text=''}
            if(stopped)return;
            if(text){
              if(String(text).toUpperCase().startsWith(BEDSIDE_QR_PREFIX)){stop();try{navigator.vibrate?.(80)}catch(_){}onCode(String(text).trim());return}
              setStatus('That QR is not a Samara bed sticker — scan the bed sticker');
            }
            timer=setTimeout(tick,220);
          };
          tick();
        }catch(e){
          const msg=e?.name==='NotAllowedError'?'Camera permission was refused. Allow the camera for this site in Chrome settings, then try again.':(e?.message||'Camera could not be opened.');
          setError(msg);stop();
        }
      })();
      return stop;
    },[]);
    return h('div',{className:'modal-backdrop bedside-scan-backdrop',onClick:e=>{if(e.target===e.currentTarget)onClose()}},
      h('div',{className:'card modal bedside-scan',role:'dialog','aria-modal':'true','data-no-hover':'true'},
        h('div',{className:'panel-head'},h('h3',null,title),h('button',{type:'button',className:'close',onClick:onClose},'×')),
        error?h('div',{className:'message error'},error):h('div',{className:'small-note'},status),
        h('div',{className:'bedside-scan-view'},h('video',{ref:videoRef,muted:true,playsInline:true}),h('div',{className:'bedside-scan-frame'})),
        h('canvas',{ref:canvasRef,style:{display:'none'}}),
        h('div',{className:'modal-actions',style:{marginTop:'10px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close'))));
  }

  const BEDSIDE_CSS=`.bedside-box{margin-top:12px;padding:10px 12px;border:1px dashed #e2a9c4;border-radius:12px;background:#fff7fb}
.bedside-box .bedside-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-weight:800;color:#5d1039;font-size:13.5px}
.bedside-box .bedside-trial{font-size:11px;font-weight:800;color:#8a5a00;background:#fff4dd;border:1px solid #f0c75e;border-radius:999px;padding:1px 8px}
.bedside-res{margin-top:8px;padding:8px 10px;border-radius:10px;font-weight:700;font-size:13.5px;overflow-wrap:anywhere}
.bedside-res.ok{background:#e8f6ee;color:#0a7a42;border:1px solid #bfe5cf}.bedside-res.bad{background:#fdecec;color:#b42318;border:1px solid #e8a0a0}
.bedside-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}.bedside-row select{flex:1 1 180px;min-width:0}
.bedside-scan{max-width:440px;width:96vw}.bedside-scan-view{position:relative;margin-top:8px;border-radius:14px;overflow:hidden;background:#111;aspect-ratio:3/4;max-height:62vh}
.bedside-scan-view video{width:100%;height:100%;object-fit:cover;display:block}.bedside-scan-frame{position:absolute;inset:18% 14%;border:3px solid #ff5fa2;border-radius:16px;box-shadow:0 0 0 999px rgba(0,0,0,.28)}
.bedside-page .bedside-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px}
.bedside-page table{width:100%;table-layout:fixed;border-collapse:collapse}.bedside-page th,.bedside-page td{white-space:normal;overflow-wrap:anywhere;word-break:normal;text-align:left;padding:7px 6px;border-bottom:1px solid #f0dce6;font-size:13px;vertical-align:top}
.bedside-page th{color:#5d1039;font-size:12px}.bedside-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:10px 0}
.bedside-card{border-radius:12px;padding:10px;background:linear-gradient(135deg,#fff,#fde8f1);border:1px solid #f0cfe0}.bedside-card b{display:block;font-size:20px;color:#7a1247}.bedside-card small{color:#5d1039;font-weight:700}
.bedside-chip{display:inline-block;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:800}.bedside-chip.verified{background:#e8f6ee;color:#0a7a42}.bedside-chip.not_scanned{background:#f3f0f2;color:#5d4a54}.bedside-chip.wrong_bed,.bedside-chip.unknown_tag,.bedside-chip.no_bed{background:#fdecec;color:#b42318}
.bedside-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.bedside-filters .field{flex:0 1 170px;min-width:0;margin:0}`;
  function BedsideCss(){return h('style',null,BEDSIDE_CSS)}

  // Shown inside the MAR "Administer now?" box. value = {code, check, reason}. Shows nothing unless the trial is ON.
  function BedsideDosePanel({patient,value,onChange,disabled}){
    const mode=useBedsideMode();
    const [scanning,setScanning]=React.useState(false),[checking,setChecking]=React.useState(false);
    // 2.19.95: arrived from Scan & Administer for this Guest → already bed-verified.
    React.useEffect(()=>{
      if(mode!=='qr_trial'||!patient?.id||value?.code)return;
      const s=bedsideSessionGet(patient.id);
      if(s)onChange({code:s.code,check:s.check||null,reason:'',patientId:patient.id,fromScanFirst:true});
    },[mode,patient?.id]);
    if(mode!=='qr_trial'||!patient?.id)return null;
    const v=value&&(!value.patientId||value.patientId===patient.id)?value:{};
    const roomText=patient?.room_no?`Room ${patient.room_no}${patient.bed_no?` · Bed ${patient.bed_no}`:''}`:'no bed on record';
    async function gotCode(code){
      setScanning(false);setChecking(true);onChange({code,check:null,reason:'',patientId:patient?.id});
      try{
        const r=await client.rpc('bedside_check_tag',{p_code:code,p_patient_id:patient?.id||null});
        if(r.error)throw r.error;
        onChange({code,check:r.data||null,reason:'',patientId:patient?.id});
      }catch(e){onChange({code,check:{result:'error',message:e?.message||'Could not check the sticker'},reason:'',patientId:patient?.id})}
      finally{setChecking(false)}
    }
    const c=v.check;
    const bedText=(room,bed)=>room?`Room ${room}${bed?` · Bed ${bed}`:''}`:'—';
    let res=null;
    if(checking)res=h('div',{className:'bedside-res'},'Checking the sticker…');
    else if(c?.result==='verified')res=h('div',{className:'bedside-res ok'},`✅ Bed verified — ${bedText(c.scanned_room_no,c.scanned_bed_no)}`);
    else if(c?.result==='wrong_bed')res=h('div',{className:'bedside-res bad'},`⚠️ Wrong bed — this sticker is ${bedText(c.scanned_room_no,c.scanned_bed_no)}; the Guest is in ${bedText(c.guest_room_no,c.guest_bed_no)}. Please check you are at the right bed.`);
    else if(c?.result==='unknown_tag')res=h('div',{className:'bedside-res bad'},'⚠️ This sticker is not registered (or was replaced). Tell the Nursing Manager.');
    else if(c?.result==='no_bed')res=h('div',{className:'bedside-res bad'},`⚠️ The Guest has no room / bed on record. Sticker: ${bedText(c.scanned_room_no,c.scanned_bed_no)}.`);
    else if(c?.result==='error')res=h('div',{className:'bedside-res bad'},`⚠️ ${c.message}. The dose can still be saved.`);
    return h('div',{className:'bedside-box'},
      h(BedsideCss),
      h('div',{className:'bedside-head'},h('span',null,`📍 Bedside check · ${roomText}`),h('span',{className:'bedside-trial'},'TRIAL — saves either way')),
      res,
      h('div',{className:'bedside-row'},
        h('button',{type:'button',className:'btn btn-secondary',disabled:disabled||checking,onClick:()=>setScanning(true)},v.code?'📷 Scan again':'📷 Scan bed QR'),
        !v.code&&h('select',{value:v.reason||'',disabled,onChange:e=>onChange({...v,reason:e.target.value,patientId:patient?.id}),'aria-label':'Reason for not scanning'},
          h('option',{value:''},'Not scanning? Reason (optional)'),BEDSIDE_NOT_SCANNED_REASONS.map(x=>h('option',{key:x,value:x},x)))),
      scanning&&h(BedsideQrScanner,{onCode:gotCode,onClose:()=>setScanning(false)}));
  }

  // Called by the MAR after a dose is saved. Fire-and-forget: never throws, never awaited by the MAR.
  function bedsideRecordAfterGiven({order,date,time,scan}){
    try{
      if(bedsideModeCache.mode!=='qr_trial'||!order?.patient_id)return;
      Promise.resolve()
        .then(()=>client.rpc('bedside_record_dose_check',{p_order_id:order.id||null,p_patient_id:order.patient_id,p_scheduled_date:date,p_scheduled_time:String(time||'').slice(0,5),
          p_code:scan?.code||null,p_reason:scan?.code?null:(scan?.reason||null),p_method:'qr'}))
        .then(r=>{if(r?.error)console.warn('Bedside check not recorded:',r.error.message)})
        .catch(e=>console.warn('Bedside check not recorded:',e));
    }catch(e){console.warn('Bedside check not recorded:',e)}
  }

  // 2.19.94: any bedside entry (full MAR form, Nursing Procedure, Daily Care, Vital Signs, Meal, Beverage) — SQL 364.
  // Fire-and-forget after the entry is saved; a scan for another Guest is never used.
  function bedsideRecordTask({kind,patientId,refId=null,date=null,time=null,label='',scan=null,reason=null}){
    try{
      if(!patientId)return;
      const s=scan&&(!scan.patientId||scan.patientId===patientId)?scan:null;
      bedsideLoadMode()
        .then(mode=>mode!=='qr_trial'?null:client.rpc('bedside_record_task_check',{p_kind:kind,p_patient_id:patientId,p_ref_id:refId||null,p_date:date||null,p_time:time?String(time).slice(0,5):null,p_label:label||null,
          p_code:s?.code||null,p_reason:s?.code?null:(s?.reason||reason||null),p_method:'qr'}))
        .then(r=>{if(r?.error)console.warn('Bedside check not recorded:',r.error.message)})
        .catch(e=>console.warn('Bedside check not recorded:',e));
    }catch(e){console.warn('Bedside check not recorded:',e)}
  }

  // ── ADMIN → Bedside Verification (Admin / Nursing Manager) ──────────────────────────────────────────────────
  function bedsidePeriodRange(period,month,from,to){
    const today=todayISOIndia();
    if(period==='Today')return {from:today,to:today};
    if(period==='This Week')return {from:mondayOfWeek(today),to:today};
    if(period==='Month'){const m=month||today.slice(0,7);const [y,mm]=m.split('-').map(Number);const last=new Date(Date.UTC(y,mm,0)).toISOString().slice(0,10);return {from:`${m}-01`,to:last}}
    return {from:from||today,to:to||today};
  }

  async function bedsidePrintStickers(tags){
    const list=(tags||[]).filter(t=>t&&t.tag_code);
    if(!list.length){showSamaraActionToast('error','Nothing to print','Issue stickers for the beds first.');return}
    const win=window.open('','_blank');
    if(!win){showSamaraActionToast('error','Pop-up blocked','Allow pop-ups for this site to print the stickers.');return}
    try{
      if(!window.SamaraQRCode){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/qrcode.bundle.js';s.onload=resolve;s.onerror=()=>reject(new Error('QR generator could not be loaded.'));document.head.appendChild(s)})}
      const esc=x=>String(x??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
      const logo=new URL('./assets/samara-logo.png',window.location.href).href;
      const cards=list.map(t=>`<div class="st"><div class="top"><img src="${esc(logo)}" alt=""/><span>Bedside check</span></div>
        <div class="qr">${window.SamaraQRCode.toSvg(BEDSIDE_QR_PREFIX+t.tag_code,{size:200,margin:2,errorCorrectionLevel:'M'})}</div>
        <div class="bed">Room ${esc(t.room_no)} · Bed ${esc(t.bed_no)}</div><div class="hint">Scan before giving medicine</div><div class="code">${esc(t.tag_code.slice(-4))}</div></div>`).join('');
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Samara bed stickers</title><style>
        @page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;margin:0;color:#3a1028}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.st{border:2px solid #e03a7c;border-radius:4mm;padding:3mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
        .top{display:flex;align-items:center;justify-content:center;gap:2mm;font-weight:700;color:#b01264;font-size:11pt}.top img{height:9mm}
        .qr svg{width:44mm;height:44mm}.bed{font-size:13pt;font-weight:800;color:#7a1247;white-space:nowrap}.hint{font-size:9pt;color:#5d1039}.code{font-size:7pt;color:#999;margin-top:1mm}
        .note{font-size:10pt;margin:0 0 5mm;color:#5d1039}@media print{.note{display:none}}</style></head><body>
        <p class="note">Print on sticker paper (or plain paper + clear tape). Stick each on its own bed headboard, where the nurse can reach. Replacing a sticker in the ERP makes the old one stop working.</p>
        <div class="grid">${cards}</div></body></html>`);
      win.document.close();
      if(typeof samaraPrintBar==='function')samaraPrintBar(win);
    }catch(e){try{win.close()}catch(_){}showSamaraActionToast('error','Could not prepare stickers',e?.message||'Please try again.')}
  }

  function BedsideVerification({profile}){
    const isAdmin=['Admin'].includes(profile?.role);
    const canManage=isAdmin||profile?.role==='Manager'||isNursingManagerProfile(profile);
    const [tab,setTab]=React.useState('Register');
    const [mode,setMode]=React.useState(bedsideModeCache.mode),[installed,setInstalled]=React.useState(true),[modeInfo,setModeInfo]=React.useState(null),[busy,setBusy]=React.useState('');
    const [beds,setBeds]=React.useState([]),[tags,setTags]=React.useState([]),[picked,setPicked]=React.useState({});
    const [testScan,setTestScan]=React.useState(false),[testResult,setTestResult]=React.useState(null);
    const [patients]=usePatients(true);
    const today=todayISOIndia();
    const [draft,setDraft]=React.useState({period:'Today',month:today.slice(0,7),from:today,to:today,patient:'',search:'',result:'',task:''});
    const {applied,apply,dirty}=useAppliedFilters(draft);
    const [rows,setRows]=React.useState([]),[loading,setLoading]=React.useState(false),[loadError,setLoadError]=React.useState('');

    const loadSettings=React.useCallback(async()=>{
      try{const r=await client.from('bedside_verify_settings').select('*').eq('id',1).maybeSingle();
        if(r.error){setInstalled(false);return}
        setInstalled(true);setModeInfo(r.data||null);setMode(r.data?.mode||'off');bedsideModeCache.mode=r.data?.mode||'off';bedsideModeCache.at=Date.now();
      }catch(_){setInstalled(false)}
    },[]);
    const loadBeds=React.useCallback(async()=>{
      const [b,t]=await Promise.all([client.from('room_beds').select('id,room_no,bed_no,room_type,status').order('room_no').order('bed_no'),client.from('bedside_bed_tags').select('*').eq('is_active',true)]);
      if(!b.error)setBeds((b.data||[]).filter(isPatientBed).sort((x,y)=>String(x.room_no).localeCompare(String(y.room_no),'en',{numeric:true})||String(x.bed_no).localeCompare(String(y.bed_no),'en',{numeric:true})));
      if(!t.error)setTags(t.data||[]);
    },[]);
    const loadRows=React.useCallback(async()=>{
      const rg=bedsidePeriodRange(applied.period,applied.month,applied.from,applied.to);
      if(rg.from>rg.to){setLoadError('From date is after To date.');setRows([]);return}
      setLoading(true);setLoadError('');
      try{
        let q=client.from('bedside_dose_checks').select('*').gte('scheduled_date',rg.from).lte('scheduled_date',rg.to).order('created_at',{ascending:false}).limit(2000);
        if(applied.patient)q=q.eq('patient_id',applied.patient);
        if(applied.result)q=q.eq('result',applied.result);
        if(applied.task)q=q.eq('task_kind',applied.task);
        const r=await q;if(r.error)throw r.error;setRows(r.data||[]);
      }catch(e){setRows([]);setLoadError(e?.message||'Could not load the register.')}
      finally{setLoading(false)}
    },[applied]);
    React.useEffect(()=>{loadSettings();loadBeds()},[loadSettings,loadBeds]);
    React.useEffect(()=>{if(installed)loadRows()},[loadRows,installed]);

    async function changeMode(next){
      if(!isAdmin||busy)return;
      setBusy('mode');
      try{const r=await client.rpc('set_bedside_verify_settings',{p_mode:next});if(r.error)throw r.error;await loadSettings();
        showSamaraActionToast('success','Bedside Verification',next==='qr_trial'?'QR trial is ON — nurses see "Scan bed QR" on bedside entry screens.':'Bedside Verification is OFF — every screen is exactly as before.');}
      catch(e){showSamaraActionToast('error','Could not change',e?.message||'Please try again.')}
      finally{setBusy('')}
    }
    async function issue(bedIds){
      if(!canManage||busy||!bedIds.length)return;
      setBusy('issue');
      try{for(const id of bedIds){const r=await client.rpc('bedside_tag_issue',{p_room_bed_id:id,p_kind:'qr'});if(r.error)throw r.error}
        await loadBeds();showSamaraActionToast('success','Stickers ready',`${bedIds.length} bed sticker(s) issued. Print and stick them on the beds.`);}
      catch(e){showSamaraActionToast('error','Could not issue',e?.message||'Please try again.');await loadBeds()}
      finally{setBusy('')}
    }
    async function testCode(code){
      setTestScan(false);setTestResult({checking:true});
      try{const r=await client.rpc('bedside_check_tag',{p_code:code,p_patient_id:null});if(r.error)throw r.error;setTestResult(r.data||{})}
      catch(e){setTestResult({error:e?.message||'Could not check'})}
    }

    if(!canManage)return h('div',{className:'card panel'},'Bedside Verification is for Admin and the Nursing Manager.');
    const tagFor=bedId=>tags.find(t=>String(t.room_bed_id)===String(bedId)&&t.tag_kind==='qr');
    const pFor=id=>patients.find(p=>String(p.id)===String(id))||{};
    const searchText=draft.search.trim().toLowerCase();
    const patientOptions=patients.filter(p=>searchText.length<3||`${formalName(p)} ${p.patient_id||''}`.toLowerCase().includes(searchText));
    const appliedSearch=String(applied.search||'').trim().toLowerCase();
    const shown=rows.filter(r=>{if(appliedSearch.length<3)return true;const p=pFor(r.patient_id);return `${formalName(p)} ${p.patient_id||''}`.toLowerCase().includes(appliedSearch)});
    const count=k=>shown.filter(r=>r.result===k).length;
    const staff=(()=>{const m=new Map();shown.forEach(r=>{const k=r.recorded_by_name||'—';const s=m.get(k)||{name:k,total:0,verified:0,not_scanned:0,problem:0};s.total++;if(r.result==='verified')s.verified++;else if(r.result==='not_scanned')s.not_scanned++;else s.problem++;m.set(k,s)});return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name))})();
    const pct=(a,b)=>b?`${Math.round(a*100/b)}%`:'—';

    const head=h('div',{className:'card panel'},
      h('div',{className:'panel-head'},h('div',null,h('h2',null,'Bedside Verification'),h('small',null,'Care given at the right bed — medicines, nursing procedures, daily care, vitals, meals. QR stickers now (trial), NFC stickers later.'))),
      !installed?h('div',{className:'message warning'},'Database step not installed yet: run supabase/sql/363_bedside_verification_trial.sql in Supabase. Until then this feature stays OFF and the MAR works exactly as before.')
      :h('div',{className:`message ${mode==='qr_trial'?'success':''}`},mode==='qr_trial'?'QR TRIAL is ON — record-only: nurses can scan the bed sticker before saving medicines, procedures, daily care, vitals and meals; entries save either way.':mode==='nfc'?'NFC mode is selected (NFC reader comes in the next update; nothing is shown to nurses yet).':'OFF — nurses see nothing new; every screen is exactly as before.',
        modeInfo?.updated_by_name?h('small',{style:{display:'block',marginTop:'4px'}},`Last changed by ${modeInfo.updated_by_name} · ${formatDateIN(modeInfo.updated_at)} ${formatTimeIN(modeInfo.updated_at)}`):null),
      h('div',{className:'bedside-tabs'},['Register','Bed stickers','Settings & test'].map(t=>h('button',{type:'button',key:t,className:`btn ${tab===t?'btn-primary':'btn-secondary'}`,onClick:()=>setTab(t)},t))));

    let body=null;
    if(tab==='Settings & test'){
      body=h('div',{className:'card panel'},
        h('h3',null,'Trial switch'),
        h('div',{className:'small-note'},'Only Admin / Director can switch. OFF = every screen exactly as before. QR trial = record-only (never blocks a save).'),
        h('div',{className:'bedside-tabs'},
          h('button',{type:'button',className:`btn ${mode==='off'?'btn-primary':'btn-secondary'}`,disabled:!isAdmin||!installed||busy==='mode',onClick:()=>changeMode('off')},'OFF'),
          h('button',{type:'button',className:`btn ${mode==='qr_trial'?'btn-primary':'btn-secondary'}`,disabled:!isAdmin||!installed||busy==='mode',onClick:()=>changeMode('qr_trial')},'QR trial (record-only)')),
        h('h3',{style:{marginTop:'14px'}},'Test a sticker'),
        h('div',{className:'small-note'},'Scan any printed sticker to see which bed it belongs to. Nothing is saved.'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!installed,onClick:()=>{setTestResult(null);setTestScan(true)}},'📷 Test a sticker'),
        testResult&&h('div',{className:`bedside-res ${testResult.scanned_room_no?'ok':'bad'}`,style:{marginTop:'8px'}},
          testResult.checking?'Checking…':testResult.error?`⚠️ ${testResult.error}`:testResult.scanned_room_no?`✅ This sticker belongs to Room ${testResult.scanned_room_no} · Bed ${testResult.scanned_bed_no}`:'⚠️ Not a registered sticker (or it was replaced).'),
        testScan&&h(BedsideQrScanner,{title:'Test a bed sticker',onCode:testCode,onClose:()=>setTestScan(false)}));
    }else if(tab==='Bed stickers'){
      const missing=beds.filter(b=>!tagFor(b.id));
      const pickedIds=Object.keys(picked).filter(k=>picked[k]);
      body=h('div',{className:'card panel'},
        h('div',{className:'small-note'},'One sticker per bed. "Replace" makes a new code — the old printed sticker for that bed stops working (use it if a sticker is lost or copied).'),
        h('div',{className:'bedside-tabs'},
          h('button',{type:'button',className:'btn btn-primary',disabled:!installed||!missing.length||Boolean(busy),onClick:()=>issue(missing.map(b=>b.id))},busy==='issue'?'Issuing…':`Issue for ${missing.length} bed(s) without a sticker`),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!tags.length,onClick:()=>bedsidePrintStickers(pickedIds.length?beds.filter(b=>picked[b.id]).map(b=>tagFor(b.id)).filter(Boolean):beds.map(b=>tagFor(b.id)).filter(Boolean))},pickedIds.length?`🖨 Print ${pickedIds.length} selected`:'🖨 Print all stickers')),
        h('table',null,h('thead',null,h('tr',null,h('th',{style:{width:'34px'}},''),h('th',null,'Room · Bed'),h('th',null,'Sticker'),h('th',{style:{width:'96px'}},''))),
          h('tbody',null,beds.map(b=>{const t=tagFor(b.id);return h('tr',{key:b.id},
            h('td',null,h('input',{type:'checkbox',disabled:!t,checked:Boolean(picked[b.id]),onChange:e=>setPicked(cur=>({...cur,[b.id]:e.target.checked}))})),
            h('td',null,`Room ${b.room_no} · Bed ${b.bed_no}`),
            h('td',null,t?`Issued ${formatDateIN(t.created_at)} · …${t.tag_code.slice(-4)}`:h('span',{className:'bedside-chip unknown_tag'},'Not issued')),
            h('td',null,h('button',{type:'button',className:'btn btn-secondary',disabled:!installed||Boolean(busy),onClick:()=>{if(t&&!window.confirm(`Replace the sticker for Room ${b.room_no} · Bed ${b.bed_no}? The old printed sticker will stop working.`))return;issue([b.id])}},t?'Replace':'Issue')))})),
          !beds.length&&h('tbody',null,h('tr',null,h('td',{colSpan:4},'No beds found in Rooms.')))));
    }else{
      body=h('div',{className:'card panel'},
        h('div',{className:'bedside-filters'},
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:draft.period,onChange:e=>setDraft({...draft,period:e.target.value})},['Today','This Week','Month','Period'].map(x=>h('option',{key:x,value:x},x)))),
          draft.period==='Month'&&h('div',{className:'field'},h('label',null,'Month'),h('input',{type:'month',min:'2026-08',max:today.slice(0,7),value:draft.month,onChange:e=>setDraft({...draft,month:e.target.value})})),
          draft.period==='Period'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{min:'2026-08-27',max:today,value:draft.from,onChange:e=>setDraft({...draft,from:e.target.value})})),
          draft.period==='Period'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{min:draft.from||'2026-08-27',max:today,value:draft.to,onChange:e=>setDraft({...draft,to:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Search Guest (3+ letters)'),h('input',{value:draft.search,placeholder:'Name or Guest ID',onChange:e=>setDraft({...draft,search:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Guest'),h('select',{value:draft.patient,onChange:e=>setDraft({...draft,patient:e.target.value})},h('option',{value:''},'All Guests'),
            [...patientOptions].sort((a,b)=>formalName(a).localeCompare(formalName(b))).map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.patient_id||'—'}`)))),
          h('div',{className:'field'},h('label',null,'Result'),h('select',{value:draft.result,onChange:e=>setDraft({...draft,result:e.target.value})},h('option',{value:''},'All results'),
            Object.entries(BEDSIDE_RESULT_LABEL).sort((a,b)=>a[1].replace(/^\W+/,'').localeCompare(b[1].replace(/^\W+/,''))).map(([k,l])=>h('option',{key:k,value:k},l)))),
          h('div',{className:'field'},h('label',null,'Task'),h('select',{value:draft.task,onChange:e=>setDraft({...draft,task:e.target.value})},h('option',{value:''},'All tasks'),
            Object.entries(BEDSIDE_TASK_LABEL).sort((a,b)=>a[1].localeCompare(b[1])).map(([k,l])=>h('option',{key:k,value:k},l)))),
          h(ApplyFilterButton,{dirty,onApply:apply})),
        loadError&&h('div',{className:'message error',style:{marginTop:'8px'}},loadError),
        h('div',{className:'bedside-cards'},
          [['Entries checked',shown.length],['Bed verified',count('verified')],['Not scanned',count('not_scanned')],['Wrong bed',count('wrong_bed')],['Unknown sticker',count('unknown_tag')+count('no_bed')]]
            .map(([l,n])=>h('div',{className:'bedside-card',key:l},h('b',null,n),h('small',null,l)))),
        staff.length>0&&h('details',{open:true},h('summary',null,'By staff'),
          h('table',null,h('thead',null,h('tr',null,h('th',null,'Staff'),h('th',null,'Entries'),h('th',null,'Verified'),h('th',null,'Not scanned'),h('th',null,'Problems'))),
            h('tbody',null,staff.map(s=>h('tr',{key:s.name},h('td',null,s.name),h('td',null,s.total),h('td',null,`${s.verified} (${pct(s.verified,s.total)})`),h('td',null,s.not_scanned),h('td',null,s.problem)))))),
        loading?h('div',{className:'loading',style:{marginTop:'10px'}},'Loading…'):!shown.length?h('div',{className:'small-note',style:{marginTop:'10px'}},'No bedside checks for this filter.'):
          h('table',{style:{marginTop:'10px'}},h('thead',null,h('tr',null,h('th',null,'Task'),h('th',null,'Guest'),h('th',null,'Result'),h('th',null,'Staff'))),
            h('tbody',null,shown.map(r=>{const p=pFor(r.patient_id);return h('tr',{key:r.id},
              h('td',null,`${formatDateIN(r.scheduled_date)} ${String(r.scheduled_time||'').slice(0,5)}`,h('small',{style:{display:'block'}},[BEDSIDE_TASK_LABEL[r.task_kind||'medicine']||r.task_kind,r.task_label].filter(Boolean).join(' · '))),
              h('td',null,`${formalName(p)||'Guest'} · Room ${r.guest_room_no||'—'}${r.guest_bed_no?`-${r.guest_bed_no}`:''}`),
              h('td',null,h('span',{className:`bedside-chip ${r.result}`},BEDSIDE_RESULT_LABEL[r.result]||r.result),
                r.scanned_room_no&&r.result!=='verified'?h('small',{style:{display:'block'}},`Scanned: Room ${r.scanned_room_no}-${r.scanned_bed_no}`):null,
                r.reason?h('small',{style:{display:'block'}},r.reason):null),
              h('td',null,r.recorded_by_name||'—',h('small',{style:{display:'block'}},`${formatDateIN(r.created_at)} ${formatTimeIN(r.created_at)}`)))}))));
    }
    return h('div',{className:'bedside-page'},h(BedsideCss),head,body);
  }

  // ── 2.19.95: NURSING DASHBOARD → 📷 SCAN & ADMINISTER (Nurse, Nursing Manager, Caregiver; SQL 365) ─────────────
  // Scan the bed first → that Guest's open work for this shift (from the same task list as the nurse screensaver);
  // each button opens the usual entry screen with the Guest already chosen and the bed already verified.
  // Shows nothing unless the QR trial is ON. Nothing is saved here.
  const BEDSIDE_SA_CSS=`.bsa{margin:12px 16px 4px;padding:14px;border-radius:16px;background:linear-gradient(135deg,#fff,#fde8f1);border:1px solid #f0cfe0}
.bsa-start{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;border:0;border-radius:14px;background:linear-gradient(100deg,#b01264,#e03a7c);color:#fff;font:inherit;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(176,18,100,.25)}
.bsa-start small{display:block;font-size:12px;font-weight:600;opacity:.92}
.bsa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}.bsa-head b{font-size:17px;color:#7a1247;overflow-wrap:anywhere}.bsa-head small{display:block;color:#0a7a42;font-weight:800}
.bsa-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}.bsa-task{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:#fff;border:1px solid #f0dce6}
.bsa-task.overdue{border-color:#e8a0a0;background:#fff7f7}.bsa-task .bsa-ic{font-size:20px}.bsa-task .bsa-txt{flex:1;min-width:0;overflow-wrap:anywhere}.bsa-task .bsa-txt b{display:block;color:#3a1028;font-size:14px}.bsa-task .bsa-txt small{color:#5d1039}
.bsa-task.overdue .bsa-txt small{color:#b42318;font-weight:700}.bsa-quick{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.bsa-quick .btn{flex:1 1 130px}`;

  function BedsideScanAdminister({profile,onNavigate}){
    const mode=useBedsideMode();
    const isNM=isNursingManagerProfile(profile)||Boolean(profile?.__nurseMode);
    const isCaregiver=profile?.role==='Caregiver';
    const eligible=['Nurse','Caregiver'].includes(profile?.role)||isNM;
    const allowed=React.useMemo(()=>{try{return allowedPagesForProfile(profile)||[]}catch(_){return []}},[profile]);
    const [scanning,setScanning]=React.useState(false),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState('');
    const [session,setSession]=React.useState(()=>bedsideSessionGet());
    const [tasks,setTasks]=React.useState(null),[taskErr,setTaskErr]=React.useState('');
    const [,tick]=React.useState(0);
    React.useEffect(()=>{const t=setInterval(()=>{tick(x=>x+1);if(!bedsideSessionGet())setSession(null)},30000);return()=>clearInterval(t)},[]);
    React.useEffect(()=>{
      if(!session?.patientId){setTasks(null);return}
      let live=true;setTasks(null);setTaskErr('');
      (async()=>{
        try{
          const d=await loadNurseSaverTasks();
          const pid=String(session.patientId);
          const mine=[...(d?.overdue||[]),...(d?.next||[])].filter(x=>!x.nextShift&&!x.done&&(
            String(x.patient?.id||'')===pid||(x.group==='meal'&&(x.pendingGuests||[]).some(p=>String(p?.id)===pid))));
          if(live)setTasks(mine);
        }catch(e){if(live){setTasks([]);setTaskErr('Could not load the due list — use the buttons below.')}}
      })();
      return()=>{live=false};
    },[session?.patientId,session?.code]);
    if(mode!=='qr_trial'||!eligible)return null;

    async function gotCode(code){
      setScanning(false);setBusy(true);setMsg('');
      try{
        const r=await client.rpc('bedside_resolve_tag',{p_code:code});
        if(r.error)throw r.error;
        const d=r.data||{};
        if(d.result==='unknown_tag'){setMsg('⚠️ This sticker is not registered (or was replaced). Tell the Nursing Manager.');return}
        if(d.result==='empty_bed'){setMsg(`⚠️ No active Guest is recorded in Room ${d.room_no} · Bed ${d.bed_no}. Check the bed in Patients.`);return}
        if(d.result!=='ok'||!d.guests?.[0]){setMsg(`⚠️ More than one Guest is recorded in Room ${d.room_no} · Bed ${d.bed_no}. Tell the Nursing Manager.`);return}
        const g=d.guests[0];
        const s={code,patientId:g.id,name:formalName(g)||g.full_name||'Guest',guestCode:g.patient_id||'',room:d.room_no,bed:d.bed_no,
          check:{result:'verified',scanned_room_no:d.room_no,scanned_bed_no:d.bed_no,guest_room_no:g.room_no,guest_bed_no:g.bed_no}};
        bedsideSessionSet(s);setSession({...s,at:Date.now()});
        try{navigator.vibrate?.([60,40,60])}catch(_){}
      }catch(e){setMsg(`⚠️ ${e?.message||'Could not read the sticker.'} Try again.`)}
      finally{setBusy(false)}
    }
    function open(page,ctx={}){
      if(!session)return;
      bedsideSessionSet(session); // keeps the bed check fresh for the next 10 minutes
      saveTaskNavigationContext({page,return_page:'Clinical Dashboard',patient_id:session.patientId,...ctx});
      onNavigate?.(page);
    }
    function end(){bedsideSessionClear();setSession(null);setTasks(null);setMsg('')}
    const can=page=>allowed.includes(page);
    const hhmm=d=>d instanceof Date&&!Number.isNaN(d.getTime())?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';
    const dayOf=d=>{try{return d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})}catch(_){return todayISOIndia()}};
    const mealCode=l=>/break|tiffin/i.test(l||'')?'Tiffin':/lunch/i.test(l||'')?'Lunch':/dinner/i.test(l||'')?'Dinner':'';
    function taskRow(x,i){
      const when=x.anyTime?'Any time this shift':x.awaiting?'Awaiting approval':hhmm(x.at);
      const late=x.state==='overdue';
      let ic='🧼',title=x.title||'Care',page='Daily Care',ctx={care_type:x.title||'',scheduled_time:x.fixedTime||''},btn='Record';
      if(x.group==='med'){ic='💊';title=`Medicines · ${x.meds?.length||''} due`.replace(/ · $/,'');page='Medicines';ctx={filter_only:true};btn='Give'}
      else if(x.group==='vitals'){ic='🩺';title='Vital signs';page='Vital Signs';ctx={};btn='Record'}
      else if(x.group==='meal'){ic='🍛';title=x.mealLabel||'Meal';page='Food & Diet';ctx={meal_type:mealCode(x.mealLabel),meal_date:dayOf(x.at)};btn='Record'}
      else if(x.group==='proc'){ic='🩹'}
      if(x.group==='med'&&isCaregiver)return null;
      const sub=x.group==='med'?(x.medLine||''):(x.note||'');
      const disabled=!can(page)||(x.awaiting&&x.group==='proc');
      return h('div',{key:`${x.group}-${i}`,className:`bsa-task ${late?'overdue':''}`},
        h('span',{className:'bsa-ic'},ic),
        h('div',{className:'bsa-txt'},h('b',null,title),h('small',null,[late?`${when} · late`:when,sub].filter(Boolean).join(' · '))),
        h('button',{type:'button',className:'btn btn-primary',disabled,onClick:()=>open(page,ctx)},disabled&&!can(page)?'Nurse mode':btn));
    }
    return h('div',{className:'bsa'},
      h('style',null,BEDSIDE_SA_CSS),h(BedsideCss),
      !session?h('button',{type:'button',className:'bsa-start',disabled:busy,onClick:()=>{setMsg('');setScanning(true)}},
          h('span',{style:{fontSize:'26px'}},'📷'),h('span',null,busy?'Checking the sticker…':'Scan & Administer',h('small',null,'Medicines · Vitals · Procedures · Care · Meals — scan the bed sticker')))
        :h('div',null,
          h('div',{className:'bsa-head'},
            h('div',null,h('b',null,`Room ${session.room} · Bed ${session.bed} — ${session.name}`),h('small',null,`✅ Bed verified ${hhmm(new Date(session.at||Date.now()))}${session.guestCode?` · ${session.guestCode}`:''}`)),
            h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setMsg('');setScanning(true)}},'📷 Next bed'),
              h('button',{type:'button',className:'btn btn-secondary',onClick:end},'Done'))),
          h('div',{className:'bsa-list'},
            tasks===null?h('div',{className:'small-note'},'Loading this Guest\'s due work…'):
            tasks.length?tasks.map(taskRow).filter(Boolean):h('div',{className:'small-note'},'Nothing due right now for this Guest in this shift.'),
            taskErr&&h('div',{className:'small-note'},taskErr)),
          h('div',{className:'small-note',style:{marginTop:'10px'}},'Something else for this Guest:'),
          h('div',{className:'bsa-quick'},
            !isCaregiver&&can('Medicines')&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>open('Medicines',{filter_only:true})},'💊 Medicines'),
            can('Vital Signs')&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>open('Vital Signs')},'🩺 Vital signs'),
            can('Daily Care')&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>open('Daily Care')},'🧼 Daily care / Procedure'),
            can('Food & Diet')&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>open('Food & Diet')},'🍛 Meal / Beverage'))),
      msg&&h('div',{className:'bedside-res bad',style:{marginTop:'10px'}},msg),
      scanning&&h(BedsideQrScanner,{title:'Scan the bed sticker',onCode:gotCode,onClose:()=>setScanning(false)}));
  }
