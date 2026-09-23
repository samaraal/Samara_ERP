function ShiftManagement({profile}){
    const key='samara_shift_configuration_v1';
    const defaults={effective_from:todayISOIndia(),nursing_pattern:'2-shift',general_start:'09:00',general_end:'18:00'};
    const [form,setForm]=React.useState(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(key)||'{}')}}catch(_){return defaults}});
    const [saved,setSaved]=React.useState(false);
    const save=e=>{e.preventDefault();localStorage.setItem(key,JSON.stringify(form));setSaved(true);setTimeout(()=>setSaved(false),3000)};
    if(profile?.role!=='Admin'&&!(profile?.role==='Manager'&&!isNursingManagerProfile(profile)))return h(Section,{title:'Shift Management'},h('div',{className:'message error'},'Administrator or Director access is required.'));
    return h(Section,{title:'Shift Management',subtitle:'Configure shifts for new duty assignments. Previous records remain unchanged.'},
      h('form',{onSubmit:save},h('div',{className:'grid two'},
        h('div',{className:'field'},h('label',null,'Effective From'),h(StrictDateInput,{value:form.effective_from,onChange:e=>setForm({...form,effective_from:e.target.value}),required:true})),
        h('div',{className:'field'},h('label',null,'Nursing Shift Pattern'),h('select',{value:form.nursing_pattern,onChange:e=>setForm({...form,nursing_pattern:e.target.value})},h('option',{value:'2-shift'},'2 shifts: 7 AM–7 PM / 7 PM–7 AM'),h('option',{value:'3-shift'},'3 shifts: 7 AM–2 PM / 1 PM–7 PM / 7 PM–7 AM'))),
        h('div',{className:'field'},h('label',null,'General Shift Start'),h('input',{type:'time',value:form.general_start,onChange:e=>setForm({...form,general_start:e.target.value})})),
        h('div',{className:'field'},h('label',null,'General Shift End'),h('input',{type:'time',value:form.general_end,onChange:e=>setForm({...form,general_end:e.target.value})}))
      ),h('div',{className:'actions'},h('button',{className:'btn btn-primary'},'Save Shift Settings')),saved&&h('div',{className:'message success'},'Shift settings saved for new assignments from the effective date.')));
  }

  function DutyAssignment({profile,viewMode='mine'}){
    // Admin/Director management accounts can assign and modify duty for every
    // employee. A Nursing Manager can assign duty to other nursing staff;
    // the Nursing Manager's own duty remains an Admin/Director assignment.
    const nursingManager=isNursingManagerProfile(profile);
    const fullDutyControl=profile?.role==='Admin'||(profile?.role==='Manager'&&!nursingManager);
    const teamMode=viewMode==='team';
    const canManage=fullDutyControl||(nursingManager&&teamMode);
    const canModify=fullDutyControl;
    const SHIFT_OPTIONS=['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Morning Shift (7 AM–2 PM)','Evening Shift (1 PM–7 PM)','General Shift (9 AM–6 PM)'];
    const DUTY_TYPE_OPTIONS=['Medication Rounds','Vitals Check','Wound Dressing','Mobility Assistance','Feeding Assistance','Bathing / Hygiene Care','Patient Escort','Documentation / Charting','Ward Round','General Duty','Other'];
    const STATUS_ALL=['Assigned','Acknowledged','Cancelled','Leave granted'];
    const STATUS_STAFF=['Assigned','Acknowledged'];
    const [assignments,setAssignments]=React.useState([]);
    const [staff,setStaff]=React.useState([]);
    const [absenceRows,setAbsenceRows]=React.useState([]);
    const [patients,setPatients]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [loadError,setLoadError]=React.useState('');
    const loadGeneration=React.useRef(0);
    const [copyPreview,setCopyPreview]=React.useState(null);
    const [copyBusy,setCopyBusy]=React.useState(false);
    const saveLock=React.useRef(false);
    const [voiceFields,setVoiceFields]=React.useState([]);
    const [voiceCandidates,setVoiceCandidates]=React.useState([]);
    const [staffSearch,setStaffSearch]=React.useState('');
    const [shiftFilter,setShiftFilter]=React.useState('');
    const [statusFilter,setStatusFilter]=React.useState('');
    function parseISODateUTC(dateStr){
      const [year,month,day]=String(dateStr||'').slice(0,10).split('-').map(Number);
      return new Date(Date.UTC(year,month-1,day));
    }
    function mondayOfWeek(dateStr){
      const d=parseISODateUTC(dateStr);
      const day=d.getUTCDay();
      const diff=day===0?-6:1-day;
      d.setUTCDate(d.getUTCDate()+diff);
      return d.toISOString().slice(0,10);
    }
    function addDaysISO(dateStr,days){
      const d=parseISODateUTC(dateStr);
      d.setUTCDate(d.getUTCDate()+days);
      return d.toISOString().slice(0,10);
    }
    const [rangeStart,setRangeStart]=React.useState(()=>mondayOfWeek(todayISOIndia()));
    const [rangeEnd,setRangeEnd]=React.useState(()=>addDaysISO(mondayOfWeek(todayISOIndia()),6));
    const [calendarDate,setCalendarDate]=React.useState(()=>todayISOIndia());
    const dayCalendar=viewMode==='team';
    function showDutyWeek(start){
      if(dayCalendar)setCalendarDate(start);
      else{setRangeStart(start);setRangeEnd(addDaysISO(start,6))}
    }
    function jumpWeek(offsetWeeks){
      const displayed=dayCalendar?calendarDate:rangeStart;
      showDutyWeek(addDaysISO(mondayOfWeek(displayed||todayISOIndia()),offsetWeeks*7));
    }
    function selectRelativeWeek(offsetWeeks){
      // Presets are anchored to today, never to the currently displayed week.
      const today=todayISOIndia();
      showDutyWeek(dayCalendar&&offsetWeeks===0?today:addDaysISO(mondayOfWeek(today),offsetWeeks*7));
    }
    // Derive the selected state from the dates so manual changes stay in sync.
    const selectedWeekStart=dayCalendar?mondayOfWeek(calendarDate||todayISOIndia()):rangeStart;
    const selectedWeekEnd=dayCalendar?addDaysISO(selectedWeekStart,6):rangeEnd;
    const currentWeekStart=mondayOfWeek(todayISOIndia());
    const isWholeWeek=!!selectedWeekStart&&!!selectedWeekEnd&&selectedWeekStart===mondayOfWeek(selectedWeekStart)&&selectedWeekEnd===addDaysISO(selectedWeekStart,6);
    const weekOffset=isWholeWeek?Math.round((parseISODateUTC(selectedWeekStart)-parseISODateUTC(currentWeekStart))/604800000):null;
    const selectedWeekLabel=weekOffset===null?'Custom Date Range':weekOffset===0?'This Week':weekOffset===1?'Next Week':weekOffset===-1?'Previous Week':weekOffset>1?`${weekOffset} Weeks Ahead`:`${Math.abs(weekOffset)} Weeks Ago`;
    function weekNavigationButton(label,offset,onClick){
      const active=weekOffset===offset;
      return h('button',{type:'button',className:`btn ${active?'btn-primary':'btn-secondary'}`,'aria-pressed':active,onClick,
        style:active?{background:'#a91360',color:'#fff',border:'2px solid #790c44',boxShadow:'0 0 0 3px rgba(169,19,96,.16)',fontWeight:800}:undefined},active?`✓ ${label}`:label);
    }
    function dutyWeekControls(){
      return h('div',{role:'group','aria-label':'Choose or browse duty weeks',style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
        h('button',{type:'button',className:'btn btn-secondary','aria-label':'Browse one week earlier',title:'Browse one week earlier',onClick:()=>jumpWeek(-1)},'←'),
        weekNavigationButton('Previous Week',-1,()=>selectRelativeWeek(-1)),
        weekNavigationButton('This Week',0,()=>selectRelativeWeek(0)),
        weekNavigationButton('Next Week',1,()=>selectRelativeWeek(1)),
        h('button',{type:'button',className:'btn btn-secondary','aria-label':'Browse one week later',title:'Browse one week later',onClick:()=>jumpWeek(1)},'→'),
        h('small',{style:{flexBasis:'100%'}},'Week buttons are relative to today. Use the arrows to browse further weeks.'));
    }
    const selectedWeekNotice=h('div',{role:'status','aria-live':'polite',style:{padding:'12px 16px',margin:'12px 0',borderLeft:'5px solid #a91360',borderRadius:'10px',background:'#fce8f2',color:'#790c44'}},
      h('strong',{style:{display:'block',fontSize:'17px'}},`Viewing: ${selectedWeekLabel}`),
      h('span',null,selectedWeekStart&&selectedWeekEnd?`${formatDateWithDayIN(selectedWeekStart)} to ${formatDateWithDayIN(selectedWeekEnd)}`:'Select a start and end date'));
    const [showForm,setShowForm]=React.useState(false);
    const [editing,setEditing]=React.useState(null);
    const [selectedDuty,setSelectedDuty]=React.useState(null);
    const [busy,setBusy]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const toastTimer=React.useRef(null);
    const emptyForm={employee_id:'',duty_date:todayISOIndia(),week_start:mondayOfWeek(todayISOIndia()),weekly_off:'None',shift:SHIFT_OPTIONS[0],duty_type:'General Duty',patient_id:'',ward_room:'',duty_task:'',remarks:'',status:'Assigned'};
    const [form,setForm]=React.useState(emptyForm);
    const [employeeSearch,setEmployeeSearch]=React.useState('');
    const dutyVoiceSessionRef=React.useRef(0);

    // ---- Voice Assistant: auto-fill employee, shift, duty type and week from
    // an English or Tamil spoken command. The result only pre-fills the form
    // fields above — nothing is saved until the user reviews and presses Save.
    const [voiceOpen,setVoiceOpen]=React.useState(false);
    const [voiceListening,setVoiceListening]=React.useState(false);
    const [voiceProcessing,setVoiceProcessing]=React.useState(false);
    const [voiceMessage,setVoiceMessage]=React.useState('');
    const [voiceHeard,setVoiceHeard]=React.useState('');
    const dutyVoiceRecognitionRef=React.useRef(null);
    const dutyVoiceRecorderRef=React.useRef(null);
    const dutyVoiceStreamRef=React.useRef(null);
    const dutyVoiceChunksRef=React.useRef([]);
    const dutyVoiceLangRef=React.useRef('ta-IN');

    function showToast(type,text){
      const savedWithWarning=type==='success'&&/saved with warning|saved for review|warning/i.test(String(text));
      const noticeType=savedWithWarning?'warning':type;
      showSamaraActionToast(noticeType,savedWithWarning?'Assignment saved with warning':type==='success'?'Success':'Action failed',text);
      clearTimeout(toastTimer.current);
      setToast({type:noticeType,text});
      toastTimer.current=setTimeout(()=>setToast(null),4500);
    }
    React.useEffect(()=>()=>clearTimeout(toastTimer.current),[]);

    function stopDutyVoice(){
      if(dutyVoiceRecognitionRef.current||dutyVoiceRecorderRef.current)setVoiceProcessing(true);
      try{dutyVoiceRecognitionRef.current?.stop?.()}catch(_){}
      dutyVoiceRecognitionRef.current=null;
      try{if(dutyVoiceRecorderRef.current&&dutyVoiceRecorderRef.current.state!=='inactive')dutyVoiceRecorderRef.current.stop()}catch(_){}
      try{dutyVoiceStreamRef.current?.getTracks?.().forEach(t=>t.stop())}catch(_){}
      dutyVoiceStreamRef.current=null;
      setVoiceListening(false);
    }
    function closeDutyVoice(){
      dutyVoiceSessionRef.current++;
      stopDutyVoice();
      setVoiceFields([]);setVoiceOpen(false);setVoiceMessage('');setVoiceHeard('');setVoiceProcessing(false);
    }
    React.useEffect(()=>{if(!showForm)closeDutyVoice()},[showForm]);
    React.useEffect(()=>()=>{dutyVoiceSessionRef.current++;stopDutyVoice()},[]);

    function bestDutyVoiceMime(){
      for(const x of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported?.(x))return x}catch(_){}}
      return '';
    }
    function normaliseVoiceWords(text){
      return String(text||'').toLowerCase().replace(/[.,!?;:'"()]/g,' ').replace(/\s+/g,' ').trim();
    }
    function employeeVoiceMatches(text){
      const normalise=value=>normaliseVoiceWords(value).replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
      const words=` ${normalise(text)} `;
      const contains=value=>value&&words.includes(` ${value} `);
      const ranked=staffScope.map(person=>{
        const name=normalise(person.full_name||formalName(person)).replace(/^(mr|mrs|ms|miss|dr|smt|shri) /,'');
        const tokens=[...new Set(name.split(' ').filter(x=>x.length>1))];
        const score=contains(normalise(person.employee_id))?1000:contains(name)?100+tokens.length:tokens.filter(contains).length;
        return {person,score};
      }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
      // Never choose arbitrarily between staff with the same spoken name.
      return ranked.length?ranked.filter(x=>x.score===ranked[0].score).map(x=>x.person):[];
    }
    function matchEmployeeFromVoice(text){
      const matches=employeeVoiceMatches(text);return matches.length===1?matches[0]:null;
    }
    function matchShiftFromVoice(text){
      const t=` ${normaliseVoiceWords(text)} `;
      if(/\bnight\b|இரவு/.test(t))return 'Night Shift (7 PM–7 AM)';
      if(/\bmorning\b|காலை/.test(t))return 'Morning Shift (7 AM–2 PM)';
      if(/\bevening\b|மாலை/.test(t))return 'Evening Shift (1 PM–7 PM)';
      if(/general\s*shift|பொது\s*ஷிப்ட்|பொது\s*ஷிஃப்ட்/.test(t))return 'General Shift (9 AM–6 PM)';
      if(/\bday\s*shift\b|பகல்|\bfull\s*day\b/.test(t))return 'Day Shift (7 AM–7 PM)';
      return '';
    }
    function matchDutyTypeFromVoice(text){
      const t=normaliseVoiceWords(text);
      if(/medication|medicine|மருந்து/.test(t))return 'Medication Rounds';
      if(/\bvitals?\b|blood pressure|\bbp\b|temperature|வைட்டல்ஸ்|உயிர்.*அளவீடு/.test(t))return 'Vitals Check';
      if(/wound|dressing|காயம்|கட்டு/.test(t))return 'Wound Dressing';
      if(/mobility|walking assist|நடை\s*உதவி|இயக்க\s*உதவி/.test(t))return 'Mobility Assistance';
      if(/feeding|meal assist|உணவு\s*உதவி|சாப்பாடு/.test(t))return 'Feeding Assistance';
      if(/\bbath|hygiene|குளியல்|சுகாதாரம்/.test(t))return 'Bathing / Hygiene Care';
      if(/escort|transport.*patient|நோயாளி.*அழைத்து|எஸ்கார்ட்/.test(t))return 'Patient Escort';
      if(/documentation|charting|பதிவு|ஆவணப்படுத்த/.test(t))return 'Documentation / Charting';
      if(/ward round|வார்டு\s*சுற்று/.test(t))return 'Ward Round';
      if(/general duty|பொது\s*பணி/.test(t))return 'General Duty';
      if(/\bother\b|மற்ற|வேறு/.test(t))return 'Other';
      return '';
    }
    function matchWeekStartFromVoice(text){
      const t=normaliseVoiceWords(text).replace(/[௦-௯]/g,x=>String(x.charCodeAt(0)-0x0be6));
      if(/next week|அடுத்த\s*வார/.test(t))return mondayOfWeek(addDaysISO(todayISOIndia(),7));
      if(/this week|current week|இந்த\s*வார|இவ்வார/.test(t))return mondayOfWeek(todayISOIndia());
      const valid=(year,month,day)=>{
        const iso=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const date=parseISODateUTC(iso);
        return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===iso?mondayOfWeek(iso):'';
      };
      const iso=t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
      if(iso)return valid(+iso[1],+iso[2],+iso[3]);
      const dm=t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
      if(dm){let year=dm[3]?+dm[3]:+todayISOIndia().slice(0,4);if(year<100)year+=2000;return valid(year,+dm[2],+dm[1])}
      const months=['january|jan|ஜனவரி','february|feb|பிப்ரவரி','march|mar|மார்ச்','april|apr|ஏப்ரல்','may|மே','june|jun|ஜூன்','july|jul|ஜூலை','august|aug|ஆகஸ்ட்','september|sept|sep|செப்டம்பர்','october|oct|அக்டோபர்','november|nov|நவம்பர்','december|dec|டிசம்பர்'];
      for(let i=0;i<months.length;i++){
        const before=t.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th|ஆம்)?\\s+(?:of\\s+)?(?:${months[i]})(?:\\s+(\\d{4}))?`));
        const after=t.match(new RegExp(`(?:${months[i]})\\s+(\\d{1,2})(?:st|nd|rd|th|ஆம்)?(?:\\s+(\\d{4}))?`));
        const match=before||after;if(match)return valid(+(match[2]||todayISOIndia().slice(0,4)),i+1,+match[1]);
      }
      return '';
    }
    function applyDutyVoiceCommand(text,rawSpoken){
      const combined=`${text||''} ${rawSpoken||''}`.trim();
      if(!combined){setVoiceMessage('No usable speech was captured. Please try again.');return}
      const candidates=employeeVoiceMatches(combined);
      setVoiceCandidates(candidates.length>1?candidates:[]);
      const matchedEmployee=candidates.length===1?candidates[0]:null;
      const matchedShift=matchShiftFromVoice(combined);
      const matchedDutyType=matchDutyTypeFromVoice(combined);
      const matchedWeek=matchWeekStartFromVoice(combined);
      setVoiceFields([
        {label:'Employee',value:matchedEmployee?formalName(matchedEmployee):'',state:matchedEmployee?'Recognised':candidates.length>1?'Choose employee — unchanged':'Not recognised — unchanged'},
        {label:'Shift',value:matchedShift,state:matchedShift?'Recognised':'Not recognised — unchanged'},
        {label:'Duty Type',value:matchedDutyType,state:matchedDutyType?'Recognised':'Not recognised — unchanged'},
        {label:'Week',value:matchedWeek?formatDateIN(matchedWeek):'',state:matchedWeek?'Recognised':'Not recognised — unchanged'}
      ]);
      if(!matchedEmployee&&!matchedShift&&!matchedDutyType&&!matchedWeek){
        setVoiceMessage(`Heard: "${combined}". No matching employee, shift, duty type or week was recognised. Please try again or fill the form manually.`);
        setVoiceHeard(combined);
        return;
      }
      if(matchedEmployee)setEmployeeSearch('');
      setForm(current=>({
        ...current,
        employee_id:matchedEmployee?matchedEmployee.id:current.employee_id,
        shift:matchedShift||current.shift,
        duty_type:matchedDutyType||current.duty_type,
        week_start:matchedWeek||current.week_start,
        duty_date:editing&&matchedWeek?addDaysISO(matchedWeek,(parseISODateUTC(current.duty_date).getUTCDay()+6)%7):current.duty_date
      }));
      const summary=[
        matchedEmployee?`Employee: ${formalName(matchedEmployee)}`:'Employee: not uniquely recognised — search by name or employee ID',
        matchedShift?`Shift: ${matchedShift}`:'Shift: not recognised — please select',
        matchedDutyType?`Duty Type: ${matchedDutyType}`:'Duty Type: not recognised — please select',
        matchedWeek?`Week starting: ${formatDateIN(matchedWeek)}`:'Week: not recognised — please select'
      ].join(' · ');
      setVoiceHeard(combined);
      setVoiceMessage(`Heard: "${combined}". ${summary}. Please review the fields below before saving.`);
    }
    async function sendDutyVoiceTranscript(spoken,lang,token){
      if(token!==dutyVoiceSessionRef.current)return;
      setVoiceProcessing(true);
      try{
        if(String(lang).toLowerCase().startsWith('en')){applyDutyVoiceCommand(spoken,spoken);return}
        setVoiceMessage('Converting Tamil speech to simple English…');
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({transcript:spoken,spoken_language:lang,current_form_type:'Duty Assignment',current_task_kind:'Roster Voice Command',now_iso:new Date().toISOString(),timezone:'Asia/Kolkata'})});
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to convert Tamil speech.');
        if(token!==dutyVoiceSessionRef.current)return;
        const f=result.fields||{};
        const text=String(f.details||f.notes||f.description||f.title||result.translated_text||result.translation||'').trim()||spoken;
        applyDutyVoiceCommand(text,spoken);
      }catch(error){if(token!==dutyVoiceSessionRef.current)return;applyDutyVoiceCommand(spoken,'');setVoiceMessage(current=>`${current} English conversion unavailable; matched the original Tamil where possible.`)}
      finally{if(token===dutyVoiceSessionRef.current)setVoiceProcessing(false)}
    }
    async function sendDutyVoiceAudio(blob,lang,token){
      if(token!==dutyVoiceSessionRef.current)return;
      if(!blob){setVoiceMessage('The previous recording is not available. Please record again.');return}
      setVoiceProcessing(true);setVoiceMessage('Understanding your voice command…');
      try{
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
        const fd=new FormData();fd.append('audio',blob,`duty-voice.${ext}`);fd.append('spoken_language',lang);fd.append('current_form_type','Duty Assignment');fd.append('current_task_kind','Roster Voice Command');fd.append('provider_preference','auto');fd.append('now_iso',new Date().toISOString());fd.append('timezone','Asia/Kolkata');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:fd});
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to process voice.');
        if(token!==dutyVoiceSessionRef.current)return;
        const f=result.fields||{};
        const transcript=String(result.transcript||'').trim();
        const text=String(f.details||f.notes||f.description||f.title||result.translated_text||result.translation||transcript||'').trim();
        if(!text){setVoiceMessage('No usable speech was returned. Please try again.');return}
        applyDutyVoiceCommand(text,transcript||text);
      }catch(error){if(token===dutyVoiceSessionRef.current)setVoiceMessage(error.message||'Unable to process voice.')}
      finally{if(token===dutyVoiceSessionRef.current)setVoiceProcessing(false)}
    }
    function startDutyVoiceRecorder(lang,token){
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setVoiceProcessing(false);setVoiceMessage('Microphone recording is not available in this browser.');return}
      setVoiceProcessing(true);
      navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
        if(token!==dutyVoiceSessionRef.current){stream.getTracks().forEach(t=>t.stop());return}
        setVoiceProcessing(false);
        dutyVoiceStreamRef.current=stream;dutyVoiceChunksRef.current=[];dutyVoiceLangRef.current=lang;
        const mime=bestDutyVoiceMime();const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);dutyVoiceRecorderRef.current=rec;
        rec.ondataavailable=e=>{if(token===dutyVoiceSessionRef.current&&e.data?.size)dutyVoiceChunksRef.current.push(e.data)};
        rec.onstop=async()=>{
          if(token!==dutyVoiceSessionRef.current){stream.getTracks().forEach(t=>t.stop());return}
          const blob=new Blob(dutyVoiceChunksRef.current,{type:rec.mimeType||dutyVoiceChunksRef.current[0]?.type||'audio/webm'});
          dutyVoiceChunksRef.current=[];
          try{stream.getTracks().forEach(t=>t.stop())}catch(_){}
          dutyVoiceStreamRef.current=null;dutyVoiceRecorderRef.current=null;setVoiceListening(false);
          if(blob.size<1000){setVoiceProcessing(false);setVoiceMessage('No useful speech was captured. Please try again.');return}
          await sendDutyVoiceAudio(blob,lang,token);
        };
        rec.start();setVoiceListening(true);setVoiceMessage(lang==='ta-IN'?'🎤 Listening in Tamil… Tap Stop when finished.':'🎤 Listening in English… Tap Stop when finished.');
      }).catch(error=>{if(token!==dutyVoiceSessionRef.current)return;stopDutyVoice();setVoiceProcessing(false);setVoiceListening(false);setVoiceMessage(error?.name==='NotAllowedError'?'Microphone permission is blocked. Please allow microphone access.':(error.message||'Unable to start microphone.'))});
    }
    function startDutyVoice(lang){
      if(voiceListening||voiceProcessing)return;
      const token=++dutyVoiceSessionRef.current;
      setVoiceProcessing(true);setVoiceHeard('');setVoiceMessage('Starting microphone…');
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SR)return startDutyVoiceRecorder(lang,token);
      try{
        const rec=new SR();dutyVoiceRecognitionRef.current=rec;rec.lang=lang;rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
        let finalText='';let latest='';let handled=false;
        rec.onstart=()=>{if(token!==dutyVoiceSessionRef.current){rec.abort();return}setVoiceProcessing(false);setVoiceListening(true);setVoiceMessage(lang==='ta-IN'?'🎤 Listening in Tamil…':'🎤 Listening in English…')};
        rec.onresult=e=>{if(token!==dutyVoiceSessionRef.current)return;let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=`${t} `;else interim+=t}latest=(finalText+interim).trim();setVoiceHeard(latest)};
        const finish=()=>{if(handled||token!==dutyVoiceSessionRef.current)return;handled=true;dutyVoiceRecognitionRef.current=null;setVoiceProcessing(false);setVoiceListening(false);const spoken=(latest||finalText).trim();if(spoken)sendDutyVoiceTranscript(spoken,lang,token);else setVoiceMessage('No speech was captured. Please try again.')};
        rec.onerror=e=>{if(token!==dutyVoiceSessionRef.current)return;setVoiceProcessing(false);setVoiceListening(false);if(e?.error==='not-allowed'||e?.error==='service-not-allowed'){handled=true;setVoiceMessage('Microphone / speech permission is blocked. Please allow microphone access.')}else if(!latest&&!finalText){handled=true;startDutyVoiceRecorder(lang,token)}};
        rec.onend=finish;rec.start();
      }catch(_){startDutyVoiceRecorder(lang,token)}
    }

    async function allDutyPages(makeQuery){
      const rows=[];
      for(let page=0;;page++){
        const result=await makeQuery().range(page*500,page*500+499);
        if(result.error)throw result.error;
        rows.push(...(result.data||[]));
        if((result.data||[]).length<500)return rows;
      }
    }
    async function readDutyRange(start,end){
      return allDutyPages(()=>client.from('duty_assignments').select('*').gte('duty_date',start).lte('duty_date',end).order('id'));
    }
    async function load(){
      const generation=++loadGeneration.current;
      setLoading(true);setLoadError('');
      try{
        const start=dayCalendar?mondayOfWeek(calendarDate||todayISOIndia()):rangeStart;
        const end=dayCalendar?addDaysISO(start,6):rangeEnd;
        if(!start||!end||start>end)throw new Error('Select a valid start and end date.');
        const [a,e,p,l]=await Promise.all([
          readDutyRange(start,end),
          allDutyPages(()=>client.from('profiles').select('id,auth_user_id,title,full_name,employee_id,role,department,designation,reporting_superior_id,is_active').order('id')),
          allDutyPages(()=>client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').order('id')),
          allDutyPages(()=>client.from('absence_requests').select('*').in('status',['approved','pending_superior','pending_management']).order('id'))
        ]);
        if(generation!==loadGeneration.current)return;
        setAssignments(a);setStaff(e.filter(x=>x.is_active!==false&&!isNonPayrollManagementAccount(x)));setPatients(p);setAbsenceRows(l);
      }catch(error){if(generation===loadGeneration.current){setLoadError(error.message||'Unable to load duties.');setAssignments([])}}
      finally{if(generation===loadGeneration.current)setLoading(false)}
    }
    React.useEffect(()=>{
      load();
      const channel=client.channel('duty-assignment-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'duty_assignments'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'absence_requests'},load).subscribe();
      return()=>{loadGeneration.current++;client.removeChannel(channel)};
    },[rangeStart,rangeEnd,calendarDate,dayCalendar]);

    const isNursingTeamMember=React.useCallback(row=>{
      const role=String(row?.role||'').trim().toLowerCase();
      const dept=employeeDepartment(row).toLowerCase();
      const designation=String(row?.designation||'').trim().toLowerCase();
      if(designation==='nurse manager'||designation==='nursing manager')return false;
      return role==='nurse'||role==='caregiver'||dept==='nursing'||dept==='caregiving'||designation.includes('nursing supervisor');
    },[]);
    const staffScope=React.useMemo(()=>{
      if(fullDutyControl)return staff;
      if(nursingManager)return staff.filter(s=>isNursingTeamMember(s));
      return staff;
    },[staff,fullDutyControl,nursingManager,isNursingTeamMember]);
    const staffScopeIds=React.useMemo(()=>new Set(staffScope.map(s=>s.id)),[staffScope]);

    const staffFor=id=>staff.find(s=>s.id===id||s.auth_user_id===id)||{};
    const patientFor=id=>patients.find(p=>p.id===id)||{};
    const patientLabel=id=>{const p=patientFor(id);return p.id?`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}${p.bed_no?`-${p.bed_no}`:''}`:''};
    const leaveStatusLabel=status=>({approved:'Approved Leave / Permission',pending_superior:'Leave / Permission Pending Superior Approval',pending_management:'Leave / Permission Pending Management Approval'}[status]||status||'Leave / Permission');
    const employeeIdentityIds=employeeId=>{
      const person=staff.find(s=>s.id===employeeId||s.auth_user_id===employeeId)||{};
      return [...new Set([employeeId,person.id,person.auth_user_id].filter(Boolean).map(String))];
    };
    const leaveRowMatchesDate=(item,dutyDate)=>item.request_type==='Permission'
      ?item.permission_date===dutyDate
      :Boolean(item.from_date&&item.to_date&&item.from_date<=dutyDate&&item.to_date>=dutyDate);
    const loadedDutyLeaveConflict=row=>{
      const ids=new Set(employeeIdentityIds(row.employee_id));
      return absenceRows.find(item=>ids.has(String(item.employee_id))&&leaveRowMatchesDate(item,row.duty_date))||null;
    };
    const effectiveDutyStatus=row=>{
      const leave=loadedDutyLeaveConflict(row);
      return leave?.status==='approved'?'Leave granted':(row.status||'Assigned');
    };
    const leaveForStaffDate=(staffRow,date)=>{
      const ids=new Set(employeeIdentityIds(staffRow.id));
      return absenceRows.find(item=>ids.has(String(item.employee_id))&&leaveRowMatchesDate(item,date))||null;
    };
    async function findDutyLeaveConflict(employeeId,dutyDate){
      if(!employeeId||!dutyDate)return {conflict:null,error:null};
      const {data,error}=await client.from('absence_requests')
        .select('id,employee_id,employee_name,request_type,status,leave_type,from_date,to_date,permission_date,permission_from,permission_to')
        .in('employee_id',employeeIdentityIds(employeeId))
        .in('status',['approved','pending_superior','pending_management']);
      if(error)return {conflict:null,error};
      const matches=(data||[]).filter(item=>leaveRowMatchesDate(item,dutyDate));
      const conflict=matches.find(item=>item.status==='approved')||matches[0]||null;
      return {conflict,error:null};
    }

    function coveragePanel(rows,start,end){
      const active=rows.filter(row=>row.status!=='Cancelled'&&staffScope.some(p=>employeeIdentityIds(p.id).includes(String(row.employee_id))));
      const working=active.filter(row=>!row.is_weekly_off&&row.status!=='Weekly Off');
      const unique=items=>new Set(items.map(row=>staffFor(row.employee_id).id||row.employee_id)).size;
      const unassigned=staffScope.filter(p=>!active.some(row=>employeeIdentityIds(p.id).includes(String(row.employee_id))));
      const approved=absenceRows.filter(l=>l.status==='approved'&&staffScope.some(p=>employeeIdentityIds(p.id).includes(String(l.employee_id)))&&(l.request_type==='Permission'?l.permission_date>=start&&l.permission_date<=end:l.from_date<=end&&l.to_date>=start));
      const groups=new Map();active.forEach(row=>{const key=`${staffFor(row.employee_id).id||row.employee_id}/${row.duty_date}`;groups.set(key,[...(groups.get(key)||[]),row])});
      const overlaps=[...groups.values()].filter(rows=>rows.length>1);
      return h('div',{className:'staff-coverage'},h('strong',null,`Roster coverage · ${formatDateIN(start)} to ${formatDateIN(end)}`),
        h('p',null,`${unique(working)} staff assigned to working duties · ${unassigned.length} employees without any assignment · ${unique(approved)} staff with approved leave / permission · ${overlaps.length} employee-days with multiple assignments`),
        h('div',{className:'staff-coverage-shifts'},[...new Set(working.map(r=>r.shift))].map(shift=>h('span',{key:shift,className:'badge'},`${shift}: ${unique(working.filter(r=>r.shift===shift))} staff`))),
        h('small',null,'Counts are unique employees per shift across this period, not staffing targets.'),
        unassigned.length>0&&h('details',null,h('summary',null,'Unassigned employees'),unassigned.map(p=>h('div',{key:p.id},formalName(p)))),
        approved.length>0&&h('details',null,h('summary',null,'Approved leave / permission'),approved.map(l=>h('div',{key:l.id},`${formalName(staffFor(l.employee_id))}: ${formatDateIN(l.permission_date||l.from_date)} to ${formatDateIN(l.permission_date||l.to_date)}`))),
        overlaps.length>0&&h('details',null,h('summary',null,'Multiple assignments to review'),overlaps.map((rows,i)=>h('div',{key:i},`${formalName(staffFor(rows[0].employee_id))} · ${formatDateIN(rows[0].duty_date)} · ${rows.map(r=>r.shift).join(', ')}`))));
    }
    const [coverageRetry,setCoverageRetry]=React.useState(0);
    const [formCoverage,setFormCoverage]=React.useState({loading:false,rows:[],error:''});
    React.useEffect(()=>{
      let active=true;if(!showForm)return;
      const start=form.week_start;if(!start){setFormCoverage({loading:false,rows:[],error:'Select a week.'});return}
      setFormCoverage({loading:true,rows:[],error:''});
      readDutyRange(start,addDaysISO(start,6)).then(rows=>{if(active)setFormCoverage({loading:false,rows,error:''})}).catch(error=>{if(active)setFormCoverage({loading:false,rows:[],error:error.message||'Unable to load coverage.'})});
      return()=>{active=false};
    },[showForm,form.week_start,assignments,coverageRetry]);
    async function prepareCopy(target=selectedWeekStart){
      if(!canManage||copyBusy)return;
      setCopyBusy(true);
      try{
        if(!target||target!==mondayOfWeek(target))throw new Error('Select a complete Monday–Sunday week before copying.');
        const end=addDaysISO(target,6);if(end<todayISOIndia())throw new Error('Select the current or a future week.');
        const sourceStart=addDaysISO(target,-7);
        const [source,existing,leave]=await Promise.all([readDutyRange(sourceStart,addDaysISO(sourceStart,6)),readDutyRange(target,end),allDutyPages(()=>client.from('absence_requests').select('*').eq('status','approved').order('id'))]);
        const proposed=source.filter(r=>r.status!=='Cancelled'&&staffScope.some(p=>employeeIdentityIds(p.id).includes(String(r.employee_id)))).map(row=>{
          const date=addDaysISO(row.duty_date,7);const employee=staffFor(row.employee_id);const ids=employeeIdentityIds(employee.id);
          const reasons=[];
          if(date<todayISOIndia())reasons.push('Past date');
          if(existing.some(r=>r.status!=='Cancelled'&&ids.includes(String(r.employee_id))&&r.duty_date===date))reasons.push('Already assigned');
          if(leave.some(l=>ids.includes(String(l.employee_id))&&leaveRowMatchesDate(l,date)))reasons.push('Approved leave / permission');
          if(source.filter(r=>r.status!=='Cancelled'&&ids.includes(String(r.employee_id))&&r.duty_date===row.duty_date).length>1)reasons.push('Multiple source assignments');
          return {row,date,employee,reasons};
        });
        setCopyPreview({target,sourceStart,proposed});
      }catch(error){showToast('error',error.message||'Unable to prepare copy.')}finally{setCopyBusy(false)}
    }
    async function confirmCopy(){
      if(copyBusy||!copyPreview||saveLock.current)return;
      saveLock.current=true;setCopyBusy(true);
      try{
        const ready=copyPreview.proposed.filter(p=>!p.reasons.length);if(!ready.length)throw new Error('No conflict-free assignments to copy.');
        const current=await readDutyRange(copyPreview.target,addDaysISO(copyPreview.target,6));
        for(const p of ready){
          if(current.some(r=>r.status!=='Cancelled'&&employeeIdentityIds(p.employee.id).includes(String(r.employee_id))&&r.duty_date===p.date))throw new Error('Roster changed. Close and reopen the preview before copying.');
          const check=await findDutyLeaveConflict(p.employee.id,p.date);if(check.error)throw check.error;
          if(check.conflict?.status==='approved')throw new Error('Leave changed. Close and reopen the preview before copying.');
        }
        const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)throw new Error('Sign in again before copying.');
        const now=new Date().toISOString();
        const payload=ready.map(({row,date,employee})=>({employee_id:employee.id,duty_date:date,week_start:copyPreview.target,weekly_off_day:row.weekly_off_day??null,shift:row.shift,duty_type:row.duty_type,patient_id:row.patient_id||null,ward_room:row.ward_room||null,duty_task:row.duty_task||null,remarks:row.remarks||null,is_weekly_off:!!row.is_weekly_off||row.status==='Weekly Off',status:row.is_weekly_off||row.status==='Weekly Off'?'Weekly Off':'Assigned',assigned_by:user.id,assigned_by_name:formalName(profile),assigned_by_role:profile.role,assigned_at:now,updated_at:now}));
        const {error}=await client.from('duty_assignments').insert(payload);if(error)throw error;
        writeAuditEvent('Previous Week Copied','Duty Assignment',null,{week_start:copyPreview.target,count:payload.length},'Success');
        setCopyPreview(null);showToast('success',`${payload.length} assignments copied. Conflicting dates were skipped.`);await load();
      }catch(error){showToast('error',error.message||'Copy failed.')}finally{saveLock.current=false;setCopyBusy(false)}
    }

    const visibleAssignments=React.useMemo(()=>{
      const visibleStart=dayCalendar?calendarDate:rangeStart;
      const visibleEnd=dayCalendar?calendarDate:rangeEnd;
      let rows=assignments.filter(r=>r.duty_date>=visibleStart&&r.duty_date<=visibleEnd);
      if(fullDutyControl)rows=rows;
      else if(nursingManager&&teamMode)rows=rows.filter(r=>staffScopeIds.has(r.employee_id));
      else rows=rows.filter(r=>r.employee_id===profile.id);
      return [...rows].sort((a,b)=>a.duty_date===b.duty_date
        ?(formalName(staffFor(a.employee_id))||'').localeCompare(formalName(staffFor(b.employee_id))||'')
        :a.duty_date.localeCompare(b.duty_date));
    },[assignments,rangeStart,rangeEnd,calendarDate,dayCalendar,canManage,fullDutyControl,staffScopeIds,profile]);

    function openCreate(){
      setVoiceCandidates([]);setEmployeeSearch('');
      setEditing(null);
      const today=todayISOIndia();
      const weekStart=mondayOfWeek((today>=rangeStart&&today<=rangeEnd)?today:rangeStart);
      setForm({...emptyForm,duty_date:weekStart,week_start:weekStart,weekly_off:'None'});
      closeDutyVoice();
      setShowForm(true);
    }
    function openEdit(row){
      setVoiceCandidates([]);setEmployeeSearch('');
      setEditing(row);
      setForm({...emptyForm,...row,status:effectiveDutyStatus(row),week_start:row.week_start||mondayOfWeek(row.duty_date),weekly_off:row.weekly_off_day??'None',patient_id:row.patient_id||'',ward_room:row.ward_room||'',duty_task:row.duty_task||'',remarks:row.remarks||''});
      closeDutyVoice();
      setShowForm(true);
    }

    async function save(e){
      e.preventDefault();
      if(!canManage||saveLock.current)return;
      if(voiceCandidates.length){showToast('error','Open Voice Assistant and choose a matching employee, or select an employee manually before saving.');return}
      if(!staffScope.some(person=>person.id===form.employee_id)){showToast('error','Please select the staff member to assign.');return}
      if(!form.duty_date&&!form.week_start){showToast('error','Please select the week starting date.');return}
      const weekStart=mondayOfWeek(form.week_start||form.duty_date);
      const weekDates=Array.from({length:7},(_,index)=>addDaysISO(weekStart,index));
      if(weekDates[6]<todayISOIndia()){showToast('error','The selected week has already ended. Please select the current or a future week.');return}
      const offIndex=form.weekly_off==='None'?null:Number(form.weekly_off);
      const employeeIds=new Set(employeeIdentityIds(form.employee_id));
      saveLock.current=true;setBusy(true);
      try{
      const currentAssignments=await readDutyRange(weekStart,addDaysISO(weekStart,6));
      const existingDates=new Set(currentAssignments.filter(row=>row.status!=='Cancelled'&&row.id!==editing?.id&&employeeIds.has(String(row.employee_id))&&weekDates.includes(row.duty_date)).map(row=>row.duty_date));
      const missingDates=weekDates.filter(date=>!existingDates.has(date));
      const retainedDates=weekDates.filter(date=>existingDates.has(date));
      if(!editing&&missingDates.length===0){showToast('warning',`Weekly duty already exists for ${formalName(staffFor(form.employee_id))||'this employee'} on all dates from ${formatDateIN(weekStart)} to ${formatDateIN(weekDates[6])}. Open an existing row to modify it.`);return}
      setBusy(true);
      if(editing&&existingDates.has(form.duty_date))throw new Error('An assignment already exists for this employee and date.');
      const workingDates=editing?[form.duty_date]:missingDates.filter(date=>date!==weekDates[offIndex]);
      const checks=await Promise.all(workingDates.map(date=>findDutyLeaveConflict(form.employee_id,date)));
      const failedCheck=checks.find(result=>result.error);
      if(failedCheck){setBusy(false);showToast('error',`Leave conflict check failed: ${failedCheck.error.message||'Unable to verify leave / permission records. The weekly duty was not assigned.'}`);return}
      const leaveConflicts=checks.map((result,index)=>result.conflict?{date:workingDates[index],conflict:result.conflict}:null).filter(Boolean);
      if(leaveConflicts.some(item=>item.conflict.status==='approved'))throw new Error('Approved leave / permission overlaps this assignment. Change the dates or employee before saving.');
      const leaveWarning=leaveConflicts.length?leaveConflicts.map(item=>`${leaveStatusLabel(item.conflict.status)} on ${formatDateIN(item.date)}`).join('; '):'';
      const {data:{user}}=await client.auth.getUser();
      const actionNow=new Date().toISOString();
      const basePayload={employee_id:form.employee_id,patient_id:form.patient_id||null,ward_room:form.ward_room.trim()||null,duty_task:form.duty_task.trim()||null,remarks:form.remarks.trim()||null,assigned_by:user?.id||profile?.id,assigned_by_name:formalName(profile)||profile?.full_name||'Authorised user',assigned_by_role:profile?.role,assigned_at:editing?(editing.assigned_at||editing.created_at||null):actionNow,updated_at:actionNow};
      const payload=editing
        ?{...basePayload,duty_date:form.duty_date,week_start:weekStart,weekly_off_day:form.weekly_off==='None'?null:Number(form.weekly_off),shift:form.shift,duty_type:form.duty_type,status:form.status,is_weekly_off:false}
        :weekDates.filter(date=>!existingDates.has(date)).map(date=>{const index=weekDates.indexOf(date);const isOff=index===offIndex;return {...basePayload,duty_date:date,week_start:weekStart,weekly_off_day:offIndex,shift:isOff?'Weekly Off':form.shift,duty_type:isOff?'Weekly Off':form.duty_type,status:isOff?'Weekly Off':form.status,is_weekly_off:isOff}});
      const query=editing
        ?client.from('duty_assignments').update(payload).eq('id',editing.id).select('id').single()
        :client.from('duty_assignments').insert(payload).select('id');
      const {data,error}=await query;
      setBusy(false);
      if(error){showToast('error',error.message||'Unable to save duty assignment.');return}
      const retainedNote=!editing&&retainedDates.length?` Existing assignment${retainedDates.length===1?'':'s'} on ${retainedDates.map(formatDateIN).join(', ')} retained.`:'';
      showToast('success',leaveWarning?`Assignment saved with warning: ${formalName(staffFor(form.employee_id))||'This employee'} has ${leaveWarning}. It is available for review and modification.`:(editing?'Duty assignment updated successfully.':`Weekly duty assigned for ${formatDateIN(weekStart)} to ${formatDateIN(weekDates[6])}.${retainedNote}`));
      setShowForm(false);await load();
      if(leaveWarning)setMessage(`Warning: ${formalName(staffFor(form.employee_id))||'This employee'} has ${leaveWarning}. Assignment was saved for review and modification.`);
      writeAuditEvent(editing?'Duty Assignment Updated':'Duty Assigned','Duty Assignment',data?.id||editing?.id,{
        employee:formalName(staffFor(form.employee_id))||'Staff',
        duty_date:form.duty_date,
        shift:form.shift,
        duty_type:form.duty_type,
        status:form.status
      },'Success');
      }catch(error){showToast('error',error.message||'Unable to save duty assignment.')}finally{saveLock.current=false;setBusy(false)}
    }

    async function updateStatus(row,status){
      const isOwner=row.employee_id===profile.id;
      if(!canManage&&!isOwner)return;
      const actionNow=new Date().toISOString();
      const {data:{user}}=await client.auth.getUser();
      const actorId=user?.id||profile.id;
      const actorName=formalName(profile)||profile.full_name||'Authorised user';
      const update={status,updated_at:actionNow,status_updated_at:actionNow,status_updated_by:actorId,status_updated_by_name:actorName};
      if(status==='Acknowledged')Object.assign(update,{acknowledged_at:actionNow,acknowledged_by:actorId,acknowledged_by_name:actorName});
      const {error}=await client.from('duty_assignments').update(update).eq('id',row.id);
      if(error){showToast('error',error.message||'Unable to update duty status.');return}
      showToast('success',`Duty status changed to ${status}.`);
      await load();
    }
    async function requestModification(row){
      if(row.employee_id!==profile.id||row.status==='Acknowledged')return;
      const reason=prompt('Reason for requesting duty modification:','');
      if(!reason||!reason.trim())return;
      const actionNow=new Date().toISOString();
      const {error}=await client.from('duty_assignments').update({staff_response:'Modification Requested',modification_request:reason.trim(),modification_requested_at:actionNow,modification_requested_by:profile.id,modification_requested_by_name:formalName(profile)||profile.full_name||'Staff',updated_at:actionNow}).eq('id',row.id);
      if(error){showToast('error',error.message||'Unable to request modification.');return}
      showToast('success','Modification request sent','The reviewer will decide whether to modify or retain the assignment.');await load();
    }
    async function requestShiftChange(row){
      if(row.employee_id!==profile.id)return;
      const reason=prompt('Reason for requesting change of shift / reassignment:','');
      if(!reason||!reason.trim())return;
      const actionNow=new Date().toISOString();
      const {error}=await client.from('duty_assignments').update({staff_response:'Reassignment Requested',modification_request:`Request for Re-assignment: ${reason.trim()}`,modification_requested_at:actionNow,modification_requested_by:profile.id,modification_requested_by_name:formalName(profile)||profile.full_name||'Staff',updated_at:actionNow}).eq('id',row.id);
      if(error){showToast('error',error.message||'Unable to request change of shift.');return}
      showToast('success','Request for Re-assignment received','The reviewer will decide whether the duty should be reassigned.');await load();
    }
    async function reviewRequest(row,decision){
      if(!canManage||!row.modification_request)return;
      const remarks=prompt(`${decision==='Modified'?'Enter the revised duty details or approval note:':'Enter review remarks:'}`,row.modification_request||'');
      if(remarks===null)return;
      const {data:{user}}=await client.auth.getUser();
      const reassignment=/re-?assignment/i.test(String(row.staff_response||''))||/re-?assignment/i.test(String(row.modification_request||''));
      const actionNow=new Date().toISOString();
      const {error}=await client.from('duty_assignments').update({review_status:decision,review_remarks:remarks.trim()||null,reviewed_at:actionNow,reviewed_by:user?.id||profile.id,reviewed_by_name:formalName(profile)||profile.full_name||'Reviewer',staff_response:reassignment?(decision==='Modified'?'Reassignment Approved':'Reassignment Declined'):(decision==='Modified'?'Modified':'Original Retained'),updated_at:actionNow}).eq('id',row.id);
      if(error){showToast('error',error.message||'Unable to review request.');return}
      showToast('success',`Request reviewed: ${decision}`);await load();
    }

    const rows=visibleAssignments.map(row=>{
      const emp=staffFor(row.employee_id);
      const isOwner=row.employee_id===profile.id;
      const isOff=Boolean(row.is_weekly_off)||row.status==='Weekly Off';
      const statusOptions=canManage?STATUS_ALL:['Acknowledged'];
      const leaveConflict=loadedDutyLeaveConflict(row);
      const reassignmentRequested=/re-?assignment/i.test(String(row.staff_response||''))||/re-?assignment/i.test(String(row.modification_request||''));
      const requestDecision=h('div',{style:{display:'grid',gap:'3px',minWidth:0,maxWidth:'100%',overflowWrap:'anywhere',wordBreak:'break-word'}},
          row.assigned_at&&h('small',null,`Assigned: ${row.assigned_by_name||'Authorised user'} · ${fmt(row.assigned_at)}`),
          !row.assigned_at&&row.created_at&&h('small',null,`Assigned: ${row.assigned_by_name||'Authorised user'} · ${fmt(row.created_at)}`),
          row.acknowledged_at&&h('small',null,`Acknowledged: ${row.acknowledged_by_name||'Staff'} · ${fmt(row.acknowledged_at)}`),
          row.status_updated_at&&row.status!=='Acknowledged'&&h('small',null,`Status updated: ${row.status_updated_by_name||'Authorised user'} · ${fmt(row.status_updated_at)}`),
          row.staff_response==='Reassignment Requested'&&h('strong',{className:'small-note'},'Request for Re-assignment received'),
          leaveConflict&&h('strong',{style:{color:'#b42318',overflowWrap:'anywhere'}},`⚠ Leave conflict: ${leaveStatusLabel(leaveConflict.status)} · ${leaveConflict.request_type==='Permission'?formatDateIN(leaveConflict.permission_date):`${formatDateIN(leaveConflict.from_date)}${leaveConflict.to_date&&leaveConflict.to_date!==leaveConflict.from_date?` – ${formatDateIN(leaveConflict.to_date)}`:''}`}`),
          row.modification_requested_at&&h('small',null,`Requested: ${row.modification_requested_by_name||formalName(emp)||'Staff'} · ${fmt(row.modification_requested_at)}`),
          row.review_status&&h('small',null,`Decision: ${row.review_status}${row.reviewed_by_name?` · ${row.reviewed_by_name}`:''}${row.reviewed_at?` · ${fmt(row.reviewed_at)}`:''}`),
          row.review_remarks&&h('small',null,`Remarks: ${row.review_remarks}`)
        );
      const displayStatus=effectiveDutyStatus(row);
      const statusStyle=displayStatus==='Leave granted'?{background:'#fde2e2',color:'#b42318'}:isOff?{background:'#eee9ff',color:'#5940aa'}:displayStatus==='Acknowledged'?{background:'#d9f5e4',color:'#11643a'}:displayStatus==='Assigned'?{background:'#fff1c9',color:'#8b5a00'}:displayStatus==='Cancelled'?{background:'#f2f2f2',color:'#6d6d6d'}:{};
      return [
        canManage?`${formalName(emp)||'Staff'}${emp.role?` · ${emp.role}`:''}`:formalName(emp)||'You',
        formatDateWithDayIN(row.duty_date),
        row.shift||'—',
        row.duty_type||'General Duty',
        row.patient_id?patientLabel(row.patient_id):(row.ward_room||'—'),
        row.duty_task||row.remarks||'—',
        h('div',{style:{display:'grid',gap:'4px',justifyItems:'start'}},h('span',{className:'badge',style:statusStyle},displayStatus),leaveConflict?.status!=='approved'&&leaveConflict&&h('span',{className:'badge',style:{background:'#fde2e2',color:'#b42318'}},'Leave Conflict')),
        requestDecision,
        h('div',{className:'employee-actions'},
          canModify&&!isOff&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openEdit(row)},'Edit'),
          canManage&&!isOff&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openEdit(row)},'Modify'),
          isOwner&&!isOff&&h('button',{type:'button',className:'btn btn-secondary',disabled:row.status==='Acknowledged',onClick:()=>updateStatus(row,'Acknowledged')},'Action- Acknowledge'),
          isOwner&&!isOff&&h('button',{type:'button',className:'btn btn-secondary',disabled:row.status==='Acknowledged'||Boolean(row.modification_request),onClick:()=>requestModification(row)},'Request Modify'),
          isOwner&&!isOff&&h('button',{type:'button',className:'btn btn-secondary',disabled:row.staff_response==='Reassignment Requested'||reassignmentRequested&&Boolean(row.review_status),onClick:()=>requestShiftChange(row)},'Request for Change of Shift'),
          canManage&&row.modification_request&&h('button',{type:'button',className:'btn btn-secondary',disabled:Boolean(row.review_status),onClick:()=>reviewRequest(row,'Modified')},row.review_status?'Decision Recorded':'Modify / Approve'),
          canManage&&row.modification_request&&h('button',{type:'button',className:'btn btn-secondary',disabled:Boolean(row.review_status),onClick:()=>reviewRequest(row,'Original Retained')},row.review_status?'Decision Recorded':'Retain Original')
        )
      ];
    });

    const scheduleTitle=dayCalendar?'Duty Calendar':'Duty Assignment';
    const onlyMineView=!teamMode&&!fullDutyControl;
    const scheduleSubtitle=teamMode
      ?(fullDutyControl?'Assign and modify duty for all employees':'Duties assigned by the Nursing Manager to Nursing, Caregiving and Nursing Supervisor staff. Nursing Manager duties are assigned by Admin/Director.')
      :(formalName(profile)||profile?.full_name||'Assigned staff member');
    const cardHeads=onlyMineView?['Date','Shift','Duty Type','Patient / Ward / Room','Task / Remarks','Status','Request / Decision','Action']:['Staff','Date','Shift','Duty Type','Patient / Ward / Room','Task / Remarks','Status','Request / Decision','Action'];
    const calendarDays=dayCalendar?[calendarDate]:Array.from({length:7},(_,index)=>addDaysISO(rangeStart,index));
    const searchText=staffSearch.trim().toLowerCase();
    const dropdownSearch=Boolean(shiftFilter||statusFilter);
    const staffSearchReady=dropdownSearch||searchText.length>=3;
    const filteredRosterStaff=teamMode?staffScope.filter(person=>{
      if(!staffSearchReady)return true;
      const identity=[formalName(person),person.full_name,person.mobile,person.mobile_number,person.phone,person.designation,person.employee_id].filter(Boolean).join(' ').toLowerCase();
      const matchingDate=calendarDays.some(date=>formatDateIN(date).toLowerCase().includes(searchText)||date.includes(searchText));
      const hasMatchingDuty=visibleAssignments.some(row=>String(row.employee_id)===String(person.id)&&calendarDays.includes(row.duty_date));
      return identity.includes(searchText)||(matchingDate&&hasMatchingDuty);
    }):[];
    const rosterCell=(person,date)=>{
      const dutyRows=visibleAssignments.filter(row=>String(row.employee_id)===String(person.id)&&row.duty_date===date);
      const leave=leaveForStaffDate(person,date);
      if(!dutyRows.length)return leave?h('div',{className:'duty-roster-cell leave'},`${leave.status==='approved'?'Leave':'Pending Leave'}`):h('span',{className:'duty-roster-empty'},'—');
      return h('div',{className:'duty-roster-cell-stack'},...dutyRows.map(row=>{
        const off=Boolean(row.is_weekly_off)||row.status==='Weekly Off';
        const displayStatus=effectiveDutyStatus(row);
        const statusClass=displayStatus==='Leave granted'?'leave':off?'off':displayStatus==='Acknowledged'?'ack':displayStatus==='Assigned'?'assigned':'';
        return h('button',{type:'button',className:`duty-roster-cell ${statusClass}`,key:row.id,onClick:()=>setSelectedDuty(row),title:'Open duty details'},h('strong',null,off?'Weekly Off':row.shift||'Duty'),h('small',null,off?'':displayStatus),leave?.status!=='approved'&&leave&&h('em',null,'Leave conflict'))
      }));
    };
    const rosterHeader=h('div',{className:'duty-roster-header'},h('strong',null,'Staff'),...calendarDays.map((date,index)=>h('strong',{key:date},h('span',null,['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index]),h('small',null,formatDateWithDayIN(date)))));
    const rosterRows=filteredRosterStaff.map(person=>{
      const staffHeader=h('div',{className:'duty-roster-staff'},h('strong',null,formalName(person)||person.full_name||'Staff'),h('small',null,[person.mobile,person.designation].filter(Boolean).join(' · ')||'—'),h('small',null,person.employee_id||''));
      const dayCells=calendarDays.map((date,index)=>h('div',{className:'duty-roster-grid-cell','data-day':['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index],key:date},rosterCell(person,date)));
      return h('div',{className:'duty-roster-row',key:person.id},staffHeader,...dayCells);
    });
    const rosterNoResults=filteredRosterStaff.length===0?h('div',{className:'duty-roster-no-results'},staffSearchReady?'No staff or duty records match this search.':'No staff records found.'):null;
    const staffRoster=()=>teamMode?h('div',{className:'duty-roster-wrap'},
      h('div',{className:'duty-calendar-toolbar'},h('label',null,'Select date'),h('div',{className:'duty-calendar-date-control'},h(StrictDateInput,{value:calendarDate,onChange:e=>setCalendarDate(e.target.value)})),dutyWeekControls()),
      assignmentSearch,
      simpleAssignmentList
    ):null;
    const calendarColumns=calendarDays.map((date,index)=>{
      const dateLabel=formatDateWithDayIN(date);
      const dayRows=rows.filter(cells=>cells[1]===dateLabel);
      return h('div',{className:'duty-calendar-day',key:date},
        h('div',{className:'duty-calendar-day-head'},h('strong',null,['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][index]),h('small',null,dateLabel)),
        dayRows.length?dayRows.map((cells,rowIndex)=>{const displayCells=onlyMineView?cells.slice(1):cells;const wideIndexes=onlyMineView?[3,4,6,7]:[4,5,7,8];return h('div',{className:'duty-calendar-entry',key:rowIndex},...displayCells.map((cell,cellIndex)=>h('div',{className:`duty-assignment-card-field ${wideIndexes.includes(cellIndex)?'wide':''}`,key:cellIndex},h('small',null,cardHeads[cellIndex]),h('div',{className:'duty-assignment-card-value'},cell??'—'))))}):h('div',{className:'duty-calendar-empty'},'No duty')
      );
    });
    const dutyShiftOptions=['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Morning Shift (7 AM–2 PM)','Evening Shift (1 PM–7 PM)','General Shift (9 AM–6 PM)'];
    const dutyStatusOptions=['Assigned','Acknowledged','Cancelled','Leave granted'];
    const leaveCalendarRows=teamMode
      ?absenceRows.filter(item=>item.status==='approved'&&leaveRowMatchesDate(item,calendarDate)).map(item=>{
        const person=staffScope.find(person=>employeeIdentityIds(person.id).includes(String(item.employee_id)));
        if(!person)return null;
        const alreadyAssigned=visibleAssignments.some(row=>String(row.employee_id)===String(person.id)&&row.duty_date===calendarDate);
        if(alreadyAssigned)return null;
        return {id:`leave-${item.id}-${calendarDate}`,employee_id:person.id,duty_date:calendarDate,shift:'—',duty_type:item.request_type==='Permission'?'Permission':'Leave',status:'Leave granted',remarks:item.reason||item.leave_type||'Approved leave / permission',__leaveRecord:item};
      }).filter(Boolean)
      :[];
    const calendarAssignmentRows=[...visibleAssignments,...leaveCalendarRows];
    const filteredAssignmentRows=visibleAssignments.filter(row=>{
      const leaveConflict=loadedDutyLeaveConflict(row);
      if(shiftFilter&&row.shift!==shiftFilter)return false;
      if(statusFilter==='Leave granted'&&leaveConflict?.status!=='approved')return false;
      if(statusFilter&&statusFilter!=='Leave granted'&&effectiveDutyStatus(row)!==statusFilter)return false;
      if(!searchText)return true;
      if(!staffSearchReady)return true;
      const emp=staffFor(row.employee_id);
      const searchable=[formalName(emp),emp.full_name,emp.mobile,emp.mobile_number,emp.phone,emp.designation,emp.employee_id].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(searchText);
    });
    const filteredCalendarRows=calendarAssignmentRows.filter(row=>{
      const leaveConflict=row.__leaveRecord||loadedDutyLeaveConflict(row);
      if(shiftFilter&&row.shift!==shiftFilter)return false;
      if(statusFilter==='Leave granted'&&!((row.__leaveRecord)||leaveConflict?.status==='approved'))return false;
      if(statusFilter&&statusFilter!=='Leave granted'&&effectiveDutyStatus(row)!==statusFilter)return false;
      if(!searchText)return true;
      const emp=staffFor(row.employee_id);
      // Employee search only: matches the assigned staff member's identity
      // (name, mobile, employee ID, designation) — not the shift, duty type,
      // patient/ward or task text.
      const searchable=[formalName(emp),emp.full_name,emp.mobile,emp.mobile_number,emp.phone,emp.designation,emp.employee_id].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(searchText);
    });
    const assignmentSearch=h('div',{className:'duty-roster-search'},
      h('select',{value:shiftFilter,onChange:e=>setShiftFilter(e.target.value),'aria-label':'Filter by shift'},h('option',{value:''},'All shifts'),dutyShiftOptions.map(value=>h('option',{key:value,value},value))),
      h('select',{value:statusFilter,onChange:e=>setStatusFilter(e.target.value),'aria-label':'Filter by status'},h('option',{value:''},'All statuses'),dutyStatusOptions.map(value=>h('option',{key:value,value},value))),
      h('input',{type:'search',value:staffSearch,onChange:e=>setStaffSearch(e.target.value),placeholder:'Search employee by name, mobile, ID or designation…','aria-label':'Search employee by name, mobile, employee ID or designation'}),
      (!dropdownSearch&&staffSearch.length>0&&staffSearch.length<3)?h('small',null,'Type at least 3 characters'):null,
      h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setStaffSearch('');setShiftFilter('');setStatusFilter('')}},'Clear'));
    const simpleAssignmentList=h('div',{className:`duty-simple-list ${onlyMineView?'duty-simple-list-mine':''}`},
      filteredCalendarRows.map(row=>{
        const emp=staffFor(row.employee_id);
        const leaveOnly=Boolean(row.__leaveRecord);
        const leaveConflict=leaveOnly?null:loadedDutyLeaveConflict(row);
        const off=Boolean(row.is_weekly_off)||row.status==='Weekly Off';
        const displayStatus=effectiveDutyStatus(row);
        const statusStyle=leaveOnly||displayStatus==='Leave granted'?{background:'#fde2e2',color:'#b42318'}:off?{background:'#eee9ff',color:'#5940aa'}:displayStatus==='Acknowledged'?{background:'#d9f5e4',color:'#11643a'}:displayStatus==='Assigned'?{background:'#fff1c9',color:'#8b5a00'}:{};
        return h('button',{type:'button',className:'duty-simple-row',key:row.id,onClick:()=>setSelectedDuty(row),'data-hover-info':[`Staff: ${formalName(emp)||'Staff'}`,`Date: ${formatDateWithDayIN(row.duty_date)}`,`Shift: ${off?'Weekly Off':row.shift||'—'}`,`Duty: ${row.duty_type||'General Duty'}`,`Status: ${displayStatus}`,leaveConflict?.status!=='approved'&&leaveConflict?`Leave: ${leaveStatusLabel(leaveConflict.status)}`:''].filter(Boolean).join('\n')},
          !onlyMineView&&h('span',{className:'duty-simple-primary'},h('strong',null,formalName(emp)||'Staff'),h('small',null,emp.employee_id||emp.role||'—')),
          h('span',null,h('small',null,'Date'),h('strong',null,formatDateWithDayIN(row.duty_date))),
          h('span',null,h('small',null,'Shift'),h('strong',null,off?'Weekly Off':row.shift||'—')),
          h('span',null,h('small',null,'Duty'),h('strong',null,row.duty_type||'General Duty')),
          h('span',{className:'duty-simple-status'},h('small',null,'Status'),h('span',{className:'badge',style:statusStyle},displayStatus),leaveConflict?.status!=='approved'&&leaveConflict&&h('em',null,'Leave conflict')),
          h('span',{className:'duty-simple-open'},'View details ›')
        );
      })
    );
    return h(React.Fragment,null,
      h(Section,{
        title:teamMode?scheduleTitle:'My Duty',
        subtitle:scheduleSubtitle,
        actions:h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          !dayCalendar&&dutyWeekControls(),
          !dayCalendar&&h(StrictDateInput,{value:rangeStart,onChange:e=>setRangeStart(e.target.value)}),
          !dayCalendar&&h('span',{style:{opacity:.65,fontSize:'12px'}},'to'),
          !dayCalendar&&h(StrictDateInput,{value:rangeEnd,onChange:e=>setRangeEnd(e.target.value)}),
          dayCalendar&&h('strong',null,`Selected date: ${formatDateWithDayIN(calendarDate)}`),
          canManage&&h('button',{type:'button',className:'btn btn-secondary',disabled:copyBusy||loading||!!loadError||!isWholeWeek,onClick:()=>prepareCopy()},copyBusy?'Preparing…':'Copy Previous Week'),
          canManage&&h('button',{type:'button',className:'btn duty-create-button',style:{background:'#167347',color:'#fff',border:'1px solid #105b37',boxShadow:'0 4px 12px rgba(22,115,71,.20)'},onClick:openCreate},'＋ Assign Duty')
        )
      },
        selectedWeekNotice,
        loading&&h('p',{role:'status'},'Loading duties…'),
        loadError&&h('div',{role:'alert',className:'message error'},`Unable to load duties: ${loadError}`,h('button',{type:'button',className:'btn btn-secondary',onClick:load},'Retry')),
        canManage&&!loading&&!loadError&&coveragePanel(assignments,selectedWeekStart,selectedWeekEnd),
        message&&h('div',{className:'message error'},message),
      canManage&&h('p',{className:'small-note'},fullDutyControl?'Showing all active employees.':'Showing Nursing, Caregiving and Nursing Supervisor staff. Nursing Manager duties are assigned by Admin/Director.')
      ),
      !loading&&!loadError&&(teamMode? h(Section,{title:dayCalendar?`${scheduleTitle} — ${formatDateWithDayIN(calendarDate)}`:`${scheduleTitle} — ${formatDateWithDayIN(rangeStart)} to ${formatDateWithDayIN(rangeEnd)}`,subtitle:scheduleSubtitle},staffRoster()):h(Section,{title:`${scheduleTitle} — ${formatDateWithDayIN(rangeStart)} to ${formatDateWithDayIN(rangeEnd)} (${visibleAssignments.length})`,subtitle:scheduleSubtitle},assignmentSearch,simpleAssignmentList)),
      !loading&&!loadError&&!message&&!rows.length&&h('div',{className:'card panel'},h('p',{className:'small-note'},canManage?'No duty has been assigned for this period yet.':'No duty has been assigned to you for this period.')),
      copyPreview&&h('div',{className:'modal-backdrop'},h('div',{className:'card modal',role:'dialog','aria-modal':true,'aria-label':'Copy previous week preview',style:{maxHeight:'90vh',overflow:'auto'}},
        h('h3',null,'Copy Previous Week — Preview'),
        h('p',null,`${formatDateIN(copyPreview.sourceStart)} → ${formatDateIN(copyPreview.target)}. Only conflict-free rows will be copied; acknowledgements reset to Assigned.`),
        !copyPreview.proposed.length&&h('p',null,'No assignments in the previous week.'),
        copyPreview.proposed.map((p,i)=>h('div',{key:i,className:'staff-copy-row'},h('strong',null,formalName(p.employee)),` · ${formatDateIN(p.date)} · ${p.row.shift} · ${p.row.duty_type} · ${p.reasons.length?'Skip: '+p.reasons.join('; '):'Ready to copy'}`)),
        h('button',{type:'button',className:'btn btn-secondary',disabled:copyBusy,onClick:()=>setCopyPreview(null)},'Cancel'),
        h('button',{type:'button',className:'btn btn-primary',disabled:copyBusy||!copyPreview.proposed.some(p=>!p.reasons.length),onClick:confirmCopy},copyBusy?'Copying…':`Confirm Copy (${copyPreview.proposed.filter(p=>!p.reasons.length).length})`))),
      selectedDuty&&(()=>{
        const emp=staffFor(selectedDuty.employee_id);
        const selectedLeaveOnly=Boolean(selectedDuty.__leaveRecord);
        const selectedLeave=selectedLeaveOnly?selectedDuty.__leaveRecord:loadedDutyLeaveConflict(selectedDuty);
        const selectedOff=Boolean(selectedDuty.is_weekly_off)||selectedDuty.status==='Weekly Off'||selectedLeaveOnly;
        const selectedStatus=effectiveDutyStatus(selectedDuty);
        const selectedOwner=selectedDuty.employee_id===profile.id;
        const selectedReassignment=/re-?assignment/i.test(String(selectedDuty.staff_response||''))||/re-?assignment/i.test(String(selectedDuty.modification_request||''));
        return h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setSelectedDuty(null)}},
          h('div',{className:'card modal duty-detail-modal',style:{width:'min(760px,96vw)',maxHeight:'90vh',overflow:'auto'}},
            h('div',{className:'panel-head'},h('div',null,h('h3',null,'Duty Details'),h('small',null,`${formalName(emp)||'Staff'} · ${formatDateWithDayIN(selectedDuty.duty_date)}`)),h('button',{type:'button',className:'close',onClick:()=>setSelectedDuty(null)},'×')),
            h('div',{className:'duty-detail-grid'},
              h('div',{className:'duty-detail-item'},h('small',null,'Staff'),h('strong',null,formalName(emp)||'Staff')),
              h('div',{className:'duty-detail-item'},h('small',null,'Date'),h('strong',null,formatDateWithDayIN(selectedDuty.duty_date))),
              h('div',{className:'duty-detail-item'},h('small',null,'Shift'),h('strong',null,selectedDuty.shift||'—')),
              h('div',{className:'duty-detail-item'},h('small',null,'Duty Type'),h('strong',null,selectedDuty.duty_type||'General Duty')),
              h('div',{className:'duty-detail-item span-2'},h('small',null,'Patient / Ward / Room'),h('strong',null,selectedDuty.patient_id?patientLabel(selectedDuty.patient_id):(selectedDuty.ward_room||'—'))),
              h('div',{className:'duty-detail-item span-2'},h('small',null,'Task / Remarks'),h('strong',null,selectedDuty.duty_task||selectedDuty.remarks||'—')),
              h('div',{className:'duty-detail-item'},h('small',null,'Status'),h('span',{className:'badge',style:selectedStatus==='Leave granted'?{background:'#fde2e2',color:'#b42318'}:selectedOff?{background:'#eee9ff',color:'#5940aa'}:selectedStatus==='Acknowledged'?{background:'#d9f5e4',color:'#11643a'}:selectedStatus==='Assigned'?{background:'#fff1c9',color:'#8b5a00'}:{}},selectedStatus)),
              selectedLeave&&h('div',{className:'duty-detail-item span-2'},h('small',null,'Leave Check'),h('strong',{style:{color:selectedLeave.status==='approved'?'#b42318':'#a05a00'}},`${selectedLeave.status==='approved'?'Leave granted':'⚠ Leave conflict'}: ${leaveStatusLabel(selectedLeave.status)} · ${selectedLeave.request_type==='Permission'?formatDateIN(selectedLeave.permission_date):`${formatDateIN(selectedLeave.from_date)}${selectedLeave.to_date&&selectedLeave.to_date!==selectedLeave.from_date?` – ${formatDateIN(selectedLeave.to_date)}`:''}`}`)),
              h('div',{className:'duty-detail-history span-2'},h('strong',null,'Request / Decision History'),
                selectedLeaveOnly?h('small',null,`Leave granted: ${selectedLeave.leave_type||selectedDuty.duty_type||'Leave / Permission'} · ${selectedLeave.employee_name||formalName(emp)||'Staff'}`):h('small',null,`Assigned: ${selectedDuty.assigned_by_name||'Authorised user'} · ${fmt(selectedDuty.assigned_at||selectedDuty.created_at)}`),
                selectedDuty.acknowledged_at&&h('small',null,`Acknowledged: ${selectedDuty.acknowledged_by_name||'Staff'} · ${fmt(selectedDuty.acknowledged_at)}`),
                selectedDuty.status_updated_at&&h('small',null,`Status updated: ${selectedDuty.status_updated_by_name||'Authorised user'} · ${fmt(selectedDuty.status_updated_at)}`),
                selectedDuty.modification_requested_at&&h('small',null,`Request received: ${selectedDuty.modification_requested_by_name||formalName(emp)||'Staff'} · ${fmt(selectedDuty.modification_requested_at)}`),
                selectedReassignment&&h('small',null,'Request for Re-assignment received'),
                selectedDuty.review_status&&h('small',null,`Decision: ${selectedDuty.review_status}${selectedDuty.reviewed_by_name?` · ${selectedDuty.reviewed_by_name}`:''}${selectedDuty.reviewed_at?` · ${fmt(selectedDuty.reviewed_at)}`:''}`),
                selectedDuty.review_remarks&&h('small',null,`Remarks: ${selectedDuty.review_remarks}`)
              )
            ),
            h('div',{className:'actions duty-detail-actions'},
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setSelectedDuty(null)},'Close'),
              canModify&&!selectedOff&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setSelectedDuty(null);openEdit(selectedDuty)}},'Edit'),
              canManage&&!selectedOff&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setSelectedDuty(null);openEdit(selectedDuty)}},'Modify'),
              selectedOwner&&!selectedOff&&h('button',{type:'button',className:'btn btn-secondary',disabled:selectedDuty.status==='Acknowledged',onClick:()=>updateStatus(selectedDuty,'Acknowledged')},'Action- Acknowledge'),
              selectedOwner&&!selectedOff&&h('button',{type:'button',className:'btn btn-secondary',disabled:selectedDuty.status==='Acknowledged'||Boolean(selectedDuty.modification_request),onClick:()=>requestModification(selectedDuty)},'Request Modify'),
              selectedOwner&&!selectedOff&&h('button',{type:'button',className:'btn btn-secondary',disabled:selectedReassignment||Boolean(selectedDuty.review_status),onClick:()=>requestShiftChange(selectedDuty)},'Request for Change of Shift'),
              canManage&&selectedDuty.modification_request&&h('button',{type:'button',className:'btn btn-secondary',disabled:Boolean(selectedDuty.review_status),onClick:()=>reviewRequest(selectedDuty,'Modified')},selectedDuty.review_status?'Decision Recorded':'Modify / Approve'),
              canManage&&selectedDuty.modification_request&&h('button',{type:'button',className:'btn btn-secondary',disabled:Boolean(selectedDuty.review_status),onClick:()=>reviewRequest(selectedDuty,'Original Retained')},selectedDuty.review_status?'Decision Recorded':'Retain Original')
            )
          )
        );
      })(),
      showForm&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget){closeDutyVoice();setShowForm(false)}}},
        h('form',{className:'card modal duty-assignment-modal',style:{width:'min(760px,96vw)',maxHeight:'92vh',overflow:'auto'},onSubmit:save},
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,editing?'Edit Duty Assignment':'Assign Duty'),
              h('small',null,'Shift, task and patient / ward duty for a nursing staff member'),
              h('button',{type:'button',className:'btn btn-secondary duty-voice-toggle',onClick:()=>{if(voiceOpen){closeDutyVoice()}else{setVoiceOpen(true);setVoiceMessage('');setVoiceHeard('')}}},voiceOpen?'Hide Voice Assistant':'🎤 Voice Assistant')
            ),
            h('button',{type:'button',className:'close',onClick:()=>{closeDutyVoice();setShowForm(false)}},'×')
          ),
          voiceOpen&&h('div',{className:'duty-voice-panel'},
            h('div',{className:'samara-voice-modal-head'},h('div',null,h('strong',null,'🎤 Voice Assistant'),h('small',null,'Speak the employee, shift, duty type and week — in English or Tamil. Review the filled fields below before saving.'))),
            voiceListening?h('button',{type:'button',className:'btn btn-danger samara-voice-stop',onClick:stopDutyVoice},'■ Stop Recording'):
              h('div',{className:'samara-voice-actions'},
                h('button',{type:'button',className:'btn btn-primary',disabled:voiceProcessing,onClick:()=>startDutyVoice('ta-IN')},voiceProcessing?'Processing…':'🎤 Speak Tamil'),
                h('button',{type:'button',className:'btn btn-secondary',disabled:voiceProcessing,onClick:()=>startDutyVoice('en-IN')},'🎤 Speak English')
              ),
            voiceHeard&&h('div',{className:'samara-voice-transcript'},h('small',null,'Heard'),h('div',null,voiceHeard)),
            voiceFields.length>0&&h('div',{className:'staff-voice-results'},voiceFields.map(f=>h('div',{key:f.label},h('strong',null,f.label),` · ${f.state}${f.value?' · '+f.value:''}`))),
            voiceCandidates.length>0&&h('div',{className:'field'},h('label',{htmlFor:'voice-employee-choice'},'Multiple employees matched — choose one'),h('select',{id:'voice-employee-choice',value:'',onChange:e=>{const person=voiceCandidates.find(p=>p.id===e.target.value);if(!person)return;setForm(current=>({...current,employee_id:person.id}));setEmployeeSearch('');setVoiceCandidates([]);setVoiceFields(fields=>fields.map(f=>f.label==='Employee'?{label:'Employee',state:'Selected manually',value:formalName(person)}:f))}},h('option',{value:''},'Choose employee'),voiceCandidates.map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.employee_id||p.id}`)))),
            voiceMessage&&h('div',{className:'samara-voice-message',role:'status','aria-live':'polite'},voiceMessage),
            h('small',null,'Example: Priya, night shift, medication rounds, next week. / பிரியா, இரவு, மருந்து, அடுத்த வாரம்.'),
            h('label',{htmlFor:'duty-voice-review'},'Review or type a command'),
            h('textarea',{id:'duty-voice-review',rows:2,value:voiceHeard,disabled:voiceListening||voiceProcessing,onChange:e=>setVoiceHeard(e.target.value)}),
            h('button',{type:'button',className:'btn btn-secondary',disabled:voiceListening||voiceProcessing||!voiceHeard.trim(),onClick:()=>applyDutyVoiceCommand(voiceHeard,'')},'Apply Command')
          ),
          formCoverage.loading?h('p',{role:'status'},'Loading roster coverage…'):formCoverage.error?h('div',{role:'alert'},formCoverage.error,h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setCoverageRetry(n=>n+1)},'Retry Coverage')):form.week_start&&coveragePanel(formCoverage.rows,form.week_start,addDaysISO(form.week_start,6)),
          h('div',{className:'modal-grid'},
            h('div',{className:'field duty-employee-selector'},
              h('label',{htmlFor:'duty-employee-search'},'Search Employee'),
              h('input',{id:'duty-employee-search',type:'search',value:employeeSearch,placeholder:'Name, employee ID, role or department',autoComplete:'off',onChange:e=>setEmployeeSearch(e.target.value)}),
              h('label',{htmlFor:'duty-employee-select'},'Staff Member'),
              h('select',{id:'duty-employee-select',required:true,value:form.employee_id,onChange:e=>{setForm(current=>({...current,employee_id:e.target.value}));setVoiceCandidates([]);setVoiceFields(fields=>fields.map(f=>f.label==='Employee'?{label:'Employee',state:'Selected manually',value:formalName(staffFor(e.target.value))}:f))}},
                h('option',{value:''},'Select employee'),
                staffScope.filter(person=>person.id===form.employee_id||normaliseVoiceWords(employeeSearch).split(' ').every(word=>normaliseVoiceWords([formalName(person),person.employee_id,person.role,person.department,person.designation].join(' ')).includes(word))).map(person=>h('option',{key:person.id,value:person.id},`${formalName(person)} · ${person.employee_id||'No ID'} · ${person.role||''}`))),
              h('small',{role:'status'},staffScope.some(person=>normaliseVoiceWords(employeeSearch).split(' ').every(word=>normaliseVoiceWords([formalName(person),person.employee_id,person.role,person.department,person.designation].join(' ')).includes(word)))?'Filter the list, then select an employee.':'No matching employees. Any previously selected employee is retained.')),
            h('div',{className:'field'},h('label',null,editing?'Duty Date':'Week Starting (Monday)'),h(StrictDateInput,{value:editing?form.duty_date:form.week_start,min:editing?todayISOIndia():mondayOfWeek(todayISOIndia()),onChange:e=>setForm({...form,duty_date:editing?e.target.value:form.duty_date,week_start:e.target.value?mondayOfWeek(e.target.value):''})})),
            !editing&&h('div',{className:'field'},h('label',null,'Weekly Off'),h('select',{value:form.weekly_off,onChange:e=>setForm({...form,weekly_off:e.target.value})},h('option',{value:'None'},'No weekly off'),['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day,index)=>h('option',{key:day,value:String(index)},day)))),
            h('div',{className:'field'},h('label',null,'Shift'),h('select',{value:form.shift,onChange:e=>setForm({...form,shift:e.target.value})},SHIFT_OPTIONS.map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Duty Type'),h('select',{value:form.duty_type,onChange:e=>setForm({...form,duty_type:e.target.value})},DUTY_TYPE_OPTIONS.map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Assigned Patient (optional)'),h('select',{value:form.patient_id,onChange:e=>setForm({...form,patient_id:e.target.value})},h('option',{value:''},'Not patient-specific'),patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},patientLabel(p.id))))),
            h('div',{className:'field'},h('label',null,'Ward / Room (optional)'),h('input',{value:form.ward_room,onChange:e=>setForm({...form,ward_room:e.target.value}),placeholder:'Example: Ward B / Room 4'})),
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value})},STATUS_ALL.map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'Task Details / Instructions'),h('textarea',{rows:3,value:form.duty_task,onChange:e=>setForm({...form,duty_task:e.target.value}),placeholder:'Specific duty instructions for this assignment'})),
            h('div',{className:'field span-2'},h('label',null,'Remarks (optional)'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value})}))
          ),
          h('div',{className:'actions',style:{display:'flex',gap:'8px',flexWrap:'nowrap',justifyContent:'stretch',width:'100%'}},h('button',{type:'button',className:'btn btn-secondary',style:{flex:'1 1 0',minWidth:0},onClick:()=>{closeDutyVoice();setShowForm(false)}},'Cancel'),h('button',{className:'btn btn-primary',style:{flex:'1 1 0',minWidth:0},disabled:busy||formCoverage.loading||!!formCoverage.error},busy?'Saving…':editing?'Update Assignment':'Save Assignment'),h('button',{type:'button',className:'btn btn-secondary',style:{flex:'1 1 0',minWidth:0},onClick:()=>{closeDutyVoice();setShowForm(false)}},'Close'))
        )
      ),
      toast&&h('div',{className:`samara-toast ${toast.type}`,role:'status','aria-live':'polite'},
        h('span',{className:'samara-toast-icon','aria-hidden':'true'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.type==='success'?'Success':toast.type==='warning'?'Assignment saved with warning':'Action failed'),h('span',null,toast.text)),
        h('button',{type:'button','aria-label':'Close notification',onClick:()=>setToast(null)},'×')
      )
    );
  }

