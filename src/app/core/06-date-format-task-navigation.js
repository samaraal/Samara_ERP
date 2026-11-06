  const formatDateIN = value => {
    if(!value)return '—';
    const raw=String(value).trim();
    const dateOnly=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(dateOnly)return `${dateOnly[3]}-${dateOnly[2]}-${dateOnly[1]}`;
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return raw;
    const parts=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    return `${get('day')}-${get('month')}-${get('year')}`;
  };
  const formatDateWithDayIN = value => {
    if(!value)return '—';
    const raw=String(value).trim();
    const dateOnly=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date=dateOnly?new Date(Date.UTC(Number(dateOnly[1]),Number(dateOnly[2])-1,Number(dateOnly[3]))):new Date(value);
    if(Number.isNaN(date.getTime()))return formatDateIN(value);
    const weekday=new Intl.DateTimeFormat('en-IN',{timeZone:dateOnly?'UTC':'Asia/Kolkata',weekday:'long'}).format(date);
    return `${formatDateIN(value)} – ${weekday}`;
  };
  // Strict ERP date controls: the visible value is always DD-MM-YYYY.
  // A transparent native picker is retained only for calendar selection; its locale-specific
  // MM/DD/YYYY rendering is never shown to the user. Database values remain YYYY-MM-DD.
  // 2.19.46 mobile date fix: shared style + click for the transparent native date input laid over the DD-MM-YYYY box.
  function samaraNativeDateOverlay(disabled){
    return {position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,margin:0,padding:0,border:0,zIndex:1,
      fontSize:'16px',cursor:disabled?'default':'pointer',pointerEvents:disabled?'none':'auto',WebkitAppearance:'none',appearance:'none'};
  }
  function samaraNativeDateClick(event){
    const input=event.currentTarget;
    if(!input||input.disabled||input.readOnly)return;
    // Phones open their own calendar on the tap itself; desktop browsers need showPicker().
    const coarse=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;
    if(!coarse){try{input.showPicker&&input.showPicker()}catch(_){}}
  }
  const StrictDateInput = props => {
    const {value,onChange,style,...nativeProps}=props||{};
    const picker=React.useRef(null);
    const showCalendar=()=>{const input=picker.current;if(!input)return;try{if(input.showPicker)input.showPicker();else input.click()}catch(_){input.focus();input.click()}};
    return h('div',{className:'samara-date-entry',style:{position:'relative',width:'100%',...style}},
      h('button',{type:'button',className:'samara-date-display',disabled:nativeProps.disabled,onClick:showCalendar,'aria-label':nativeProps['aria-label']||'Choose date'},
        h('span',null,value?formatDateIN(value):'DD-MM-YYYY'),h('span',{'aria-hidden':'true'},'▾')),
      // 2.19.46: the invisible native date input now covers the whole box, so a real finger tap lands on it
      // (iPhone / Android do not open a calendar from showPicker() on a hidden 1px input).
      h('input',{...nativeProps,ref:picker,'data-samara-native':'1',type:'date',value:value||'',onChange,onClick:e=>{if(nativeProps.onClick)nativeProps.onClick(e);samaraNativeDateClick(e)},tabIndex:-1,'aria-label':nativeProps['aria-label']||'Choose date',style:samaraNativeDateOverlay(nativeProps.disabled)})
    );
  };
  const time24Parts=value=>{
    const match=String(value||'').match(/^(\d{1,2}):([0-5]\d)(?::\d{2})?$/);
    if(!match)return null;
    const hour=Number(match[1]);
    return hour>23?null:{hour,minute:Number(match[2])};
  };
  const formatManualTime=value=>{
    const parts=time24Parts(value);
    if(!parts)return '';
    return `${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}`;
  };
  const parseManualTime=(value,period)=>{
    const match=String(value||'').trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)$/);
    if(!match)return '';
    let hour=Number(match[1])%12;
    if(String(period||'').toUpperCase()==='PM')hour+=12;
    else if(String(period||'').toUpperCase()!=='AM')return '';
    return `${String(hour).padStart(2,'0')}:${match[2]}`;
  };
  // 2.19.70: ERP-wide 24-hour clock (Admin, 06-11-2026) — no AM/PM anywhere, to avoid AM/PM mix-ups
  // (e.g. a dose rescheduled to 08:30 instead of 20:30). Staff type  HH : MM  (hour 00–23, minutes 00–59);
  // the colon is fixed and the cursor moves to the minutes by itself. The saved value is HH:MM, as before.
  function ManualTimeInput(props){
    const {value,onChange,style,className,placeholder,min,max,step,required,name,validateTime,disabled,...inputProps}=props||{};
    const split=v=>{const p=time24Parts(v);return p?{hh:String(p.hour).padStart(2,'0'),mm:String(p.minute).padStart(2,'0')}:null};
    const init=split(value);
    const [hh,setHh]=React.useState(init?.hh||'');
    const [mm,setMm]=React.useState(init?.mm||'');
    const hourRef=React.useRef(null),minRef=React.useRef(null);
    const lastEmitted=React.useRef(String(value||'').slice(0,5));
    React.useEffect(()=>{
      const v=String(value||'').slice(0,5);
      if(v===lastEmitted.current)return; // our own change coming back — keep what the staff is typing
      lastEmitted.current=v;
      const next=split(value);
      setHh(next?.hh||'');setMm(next?.mm||'');
    },[value]);
    const parsedOf=(h1,m1)=>{
      const hn=Number(h1),mn=Number(m1);
      if(!/^\d{1,2}$/.test(h1)||!/^\d{2}$/.test(m1)||hn>23||mn>59)return '';
      return `${String(hn).padStart(2,'0')}:${m1}`;
    };
    const parsed=parsedOf(hh,mm);
    React.useEffect(()=>{
      const input=hourRef.current;if(!input)return;
      let problem='';
      if((hh||mm)&&!parsed)problem='Enter the time in 24-hour format as HH : MM (hour 00–23, minutes 00–59), e.g. 20:30 for 8:30 in the evening.';
      else if(!hh&&!mm&&required)problem='Enter the time.';
      if(!problem&&parsed&&validateTime)problem=validateTime(parsed)||'';
      if(!problem&&parsed&&step&&Number(step)>60){const p=time24Parts(parsed);if((p.hour*3600+p.minute*60)%Number(step)!==0)problem=`Use a time in ${Math.round(Number(step)/60)}-minute intervals.`;}
      input.setCustomValidity(problem);
    },[hh,mm,parsed,required,step,validateTime]);
    const emit=(h1,m1)=>{
      const out=parsedOf(h1,m1);
      if(out){lastEmitted.current=out;onChange&&onChange({target:{value:out}});}
      else if(!h1&&!m1&&!required){lastEmitted.current='';onChange&&onChange({target:{value:''}});}
    };
    // a full box + one more digit typed = start again with the new digit (staff never have to delete first)
    const digits=v=>{const d=String(v||'').replace(/\D/g,'');return d.length>2?d.slice(-1):d;};
    const onHour=e=>{
      let v=digits(e.target.value);
      if(v.length===1&&Number(v)>2)v='0'+v;           // 3–9 → 03–09, jump to minutes
      if(v.length===2&&Number(v)>23)v=v.slice(0,1);    // 24+ not allowed
      setHh(v);emit(v,mm);
      if(v.length===2&&minRef.current){minRef.current.focus();minRef.current.select&&minRef.current.select();}
    };
    const onMin=e=>{
      let v=digits(e.target.value);
      if(v.length===1&&Number(v)>5)v='0'+v;           // 6–9 → 06–09
      setMm(v);emit(hh,v);
    };
    // read the box itself (not the state) — the state may not have caught up when the cursor jumps
    const padHour=()=>{const cur=hourRef.current?.value||'';if(cur.length===1){const v='0'+cur;setHh(v);emit(v,minRef.current?.value||mm);}};
    const padMin=()=>{const cur=minRef.current?.value||'';if(cur.length===1){const v='0'+cur;setMm(v);emit(hourRef.current?.value||hh,v);}};
    const minKey=e=>{if(e.key==='Backspace'&&!mm&&hourRef.current){e.preventDefault();hourRef.current.focus();}};
    const hourKey=e=>{if((e.key===':'||e.key==='.'||e.key==='ArrowRight'&&e.currentTarget.selectionStart===hh.length)&&minRef.current){e.preventDefault();padHour();minRef.current.focus();}};
    const box={width:'2.6em',minWidth:'2.6em',textAlign:'center',padding:'8px 2px',fontVariantNumeric:'tabular-nums',letterSpacing:'.04em'};
    return React.createElement(React.Fragment,null,
      React.createElement('div',{className:`samara-time-entry ${className||''}`.trim(),style:{display:'flex',alignItems:'center',gap:'4px',width:'100%',...(style||{})},role:'group','aria-label':inputProps['aria-label']||'Time'},
        React.createElement('input',{...inputProps,ref:hourRef,type:'text',inputMode:'numeric',autoComplete:'off',maxLength:2,placeholder:'HH',value:hh,disabled,required:Boolean(required),
          'data-samara-time-entry':'true','aria-label':`${inputProps['aria-label']||'Time'} – hour (00–23)`,title:'Hour (00–23, 24-hour clock)',style:box,
          onChange:onHour,onBlur:padHour,onKeyDown:hourKey,onFocus:e=>e.target.select&&e.target.select(),onMouseUp:e=>e.preventDefault()}),
        React.createElement('span',{'aria-hidden':'true',style:{fontWeight:800,fontSize:'18px',lineHeight:1,padding:'0 1px',userSelect:'none'}},':'),
        React.createElement('input',{ref:minRef,type:'text',inputMode:'numeric',autoComplete:'off',maxLength:2,placeholder:'MM',value:mm,disabled,required:Boolean(required),
          'aria-label':`${inputProps['aria-label']||'Time'} – minutes`,title:'Minutes (00–59)',style:box,
          onChange:onMin,onBlur:padMin,onKeyDown:minKey,onFocus:e=>e.target.select&&e.target.select(),onMouseUp:e=>e.preventDefault()}),
        React.createElement('span',{style:{fontSize:'12px',fontWeight:700,color:'#8a5a73',marginLeft:'4px',whiteSpace:'nowrap'}},'hrs (24 h)')
      ),
      name?React.createElement('input',{type:'hidden',name,value:parsed}):null
    );
  }
  function StrictDateTimeInput(props){
    const {value,onChange,style,className,required,disabled,min,max,id,name,...inputProps}=props||{};
    const split=value=>{
      const match=String(value||'').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      return {date:match?.[1]||'',time:match?.[2]||''};
    };
    const initial=split(value);
    const [date,setDate]=React.useState(initial.date);
    const [time,setTime]=React.useState(initial.time);
    React.useEffect(()=>{const next=split(value);setDate(next.date);setTime(next.time)},[value]);
    const emit=(nextDate,nextTime)=>{
      if(!onChange)return;
      const parsed=time24Parts(nextTime);
      onChange({target:{value:nextDate&&parsed?`${nextDate}T${nextTime}`:''}});
    };
    const dateChanged=event=>{
      const nextDate=event.target.value;
      setDate(nextDate);
      if(nextDate&&time24Parts(time))emit(nextDate,time);
      else if(!nextDate&&!time)emit('','');
    };
    const validateTime=parsed=>{
      let problem='';
      if(parsed&&date){
        const current=`${date}T${parsed}`;
        const minValue=String(min||'').slice(0,16),maxValue=String(max||'').slice(0,16);
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(minValue)&&current<minValue)problem='Choose a date and time at or after the allowed time.';
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(maxValue)&&current>maxValue)problem='Choose a date and time at or before the allowed time.';
      }
      return problem;
    };
    const dateMax=String(max||'').slice(0,10)||undefined;
    const dateMin=String(min||'').slice(0,10)||undefined;
    const valueToSubmit=date&&time24Parts(time)?`${date}T${time}`:'';
    const picker=React.useRef(null);
    const showCalendar=()=>{const input=picker.current;if(!input)return;try{if(input.showPicker)input.showPicker();else input.click()}catch(_){input.focus();input.click()}};
    const chooseTime=next=>{setTime(next);if(date&&time24Parts(next))emit(date,next);else if(!next&&!required)emit('','')};
    return h('div',{className:`samara-datetime-entry ${className||''}`.trim(),style:{width:'100%',display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center',...(style||{})}},
      h('div',{className:'samara-date-entry',style:{position:'relative',minWidth:'130px',flex:'1 1 130px'}},
        h('button',{type:'button',className:'samara-date-display',disabled,onClick:showCalendar,'aria-label':inputProps['aria-label']||'Choose date'},h('span',null,date?formatDateIN(date):'DD-MM-YYYY'),h('span',{'aria-hidden':'true'},'▾')),
        h('input',{...inputProps,ref:picker,'data-samara-native':'1',id,name:undefined,type:'date',value:date,required:Boolean(required),disabled,min:dateMin,max:dateMax,onChange:dateChanged,onClick:samaraNativeDateClick,tabIndex:-1,'aria-label':inputProps['aria-label']||'Choose date',style:samaraNativeDateOverlay(disabled)})
      ),
      h(ManualTimeInput,{style:{width:'auto',flex:'0 0 auto'},value:time,disabled,required:Boolean(required),validateTime,onChange:e=>chooseTime(e.target.value),'aria-label':`${inputProps['aria-label']||'Effective date and time'} time`}),
      name?h('input',{type:'hidden',name,value:valueToSubmit}):null
    );
  }

  const formatTimeIN = value => window.SamaraDateTime.time(value);
  const formatDateTimeIN = value => window.SamaraDateTime.dateTime(value);
  const fmt = value => formatDateTimeIN(value);
  const normaliseVisibleIndianDates = root => {
    if(!root)return;
    const convert = text => window.SamaraDateTime.text(String(text||''));
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const parent=node.parentElement;
      if(!parent||parent.closest('script,style,textarea,[contenteditable]'))return;
      // 2.19.70: dropdown options get only the 24-hour clock change (their date wording is left as it is)
      const updated=parent.closest('option')?(window.SamaraDateTime.clock24?window.SamaraDateTime.clock24(node.nodeValue):node.nodeValue):convert(node.nodeValue);
      if(updated!==node.nodeValue)node.nodeValue=updated;
    });
  };
  const TASK_NAVIGATION_KEY='samara_regular_task_context';
  const saveTaskNavigationContext = context => {
    try{
      sessionStorage.setItem(TASK_NAVIGATION_KEY,JSON.stringify({
        ...context,
        created_at:new Date().toISOString()
      }));
    }catch(error){console.warn('Task navigation context could not be saved.',error)}
  };
  const readTaskNavigationContext = expectedPage => {
    try{
      const raw=sessionStorage.getItem(TASK_NAVIGATION_KEY);
      if(!raw)return null;
      const context=JSON.parse(raw);
      if(expectedPage&&context?.page!==expectedPage)return null;
      const age=Date.now()-new Date(context.created_at||0).getTime();
      if(!Number.isFinite(age)||age>10*60*1000){
        sessionStorage.removeItem(TASK_NAVIGATION_KEY);
        return null;
      }
      return context;
    }catch(error){
      sessionStorage.removeItem(TASK_NAVIGATION_KEY);
      return null;
    }
  };
  // 2.17.10: Meal alert -> Resident Food Intake with the Guest, meal and date already chosen.
  const mealTaskContext = a => {
    const title=String(a?.title||'').toLowerCase();
    const meal_type=title.includes('breakfast')?'Tiffin':title.includes('lunch')?'Lunch':title.includes('dinner')?'Dinner':'';
    let meal_date='',hour=null;
    try{const d=new Date(a?.due_at);if(!Number.isNaN(d.getTime())){meal_date=d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});hour=Number(d.toLocaleString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}))}}catch(_error){}
    // Escalation register rows carry no title. Meal Due times: 9 AM / 2 PM / 9 PM (2.18.82 periods, SQL 275);
    // older rows 8 AM / 1 PM / 8 PM.
    const byHour=[8,9].includes(hour)?'Tiffin':[13,14].includes(hour)?'Lunch':[20,21].includes(hour)?'Dinner':'';
    return {meal_type:meal_type||(String(a?.alert_type||'').toLowerCase()==='meal'?byHour:''),meal_date,poor_intake:String(a?.alert_type||'').toLowerCase()==='meal intake'};
  };
  const clearTaskNavigationContext = () => {
    try{sessionStorage.removeItem(TASK_NAVIGATION_KEY)}catch(_error){}
  };


  // 2.19.46 mobile attachment fix. Phones block a new tab that is opened only AFTER waiting for the
  // secure Supabase link (it no longer counts as the user's tap). So the tab is opened at the moment of
  // the tap and the link is filled in afterwards. In the installed app (home-screen icon), or if the
  // tab is still blocked, a small "Open Document" box appears — tapping its button always works.
  function samaraIsStandaloneApp(){
    try{return !!(window.navigator.standalone||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches))}catch(_){return false}
  }
  function samaraPrepareDocWindow(){
    if(samaraIsStandaloneApp())return null;
    let win=null;
    try{win=window.open('','_blank')}catch(_){win=null}
    if(win){try{win.document.write('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening document…</title><p style="font-family:system-ui,sans-serif;padding:24px;color:#7d1748;font-weight:700">Opening document…</p>');win.document.close()}catch(_){}}
    return win;
  }
  function samaraShowDocLink(url,label){
    document.getElementById('samara-doc-link-box')?.remove();
    const box=document.createElement('div');
    box.id='samara-doc-link-box';
    box.setAttribute('role','dialog');
    box.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(60,20,40,.35);display:flex;align-items:center;justify-content:center;padding:16px';
    const card=document.createElement('div');
    card.style.cssText='background:linear-gradient(180deg,#fff6fa,#fde7f0);border:1px solid #ead0de;border-radius:16px;padding:18px;max-width:340px;width:100%;box-shadow:0 12px 30px rgba(75,24,52,.25);text-align:center;font-family:inherit';
    const title=document.createElement('div');
    title.textContent=label||'Document ready';
    title.style.cssText='font-weight:800;color:#7d1748;margin-bottom:12px';
    const link=document.createElement('a');
    link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Open Document';
    link.className='btn btn-primary';
    link.style.cssText='display:block;padding:12px;border-radius:10px;text-decoration:none;font-weight:800;margin-bottom:8px';
    const close=document.createElement('button');
    close.type='button';close.textContent='Close';close.className='btn btn-secondary';
    close.style.cssText='display:block;width:100%;padding:10px;border-radius:10px';
    const remove=()=>box.remove();
    link.addEventListener('click',()=>setTimeout(remove,300));
    close.addEventListener('click',remove);
    box.addEventListener('click',e=>{if(e.target===box)remove()});
    card.append(title,link,close);box.appendChild(card);document.body.appendChild(box);
  }
  function samaraSendDocWindow(win,url,label){
    if(win&&!win.closed){
      try{win.opener=null}catch(_){}
      try{win.location.replace(url);return true}catch(_){try{win.close()}catch(__){}}
    }
    samaraShowDocLink(url,label);
    return true;
  }
  // Use from any button: openSamaraStorageFile('bucket', path, seconds) — call it directly inside the tap handler.
  // Returns '' on success or the error text (the caller shows it in its own message area).
  async function openSamaraStorageFile(bucket,path,seconds=300,label){
    if(!path)return 'Document not available.';
    const win=samaraPrepareDocWindow();
    try{
      const {data,error}=await client.storage.from(bucket).createSignedUrl(path,seconds);
      if(error||!data?.signedUrl)throw error||new Error('Unable to open the document.');
      samaraSendDocWindow(win,data.signedUrl,label);
      return '';
    }catch(error){
      if(win)try{win.close()}catch(_){}
      return error?.message||'Unable to open the document.';
    }
  }
  function openSamaraUrl(url,label){
    if(!url)return;
    samaraSendDocWindow(samaraPrepareDocWindow(),url,label);
  }
