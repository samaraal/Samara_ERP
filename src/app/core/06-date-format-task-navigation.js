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
  const StrictDateInput = props => {
    const {value,onChange,style,...nativeProps}=props||{};
    const picker=React.useRef(null);
    const showCalendar=()=>{const input=picker.current;if(!input)return;try{if(input.showPicker)input.showPicker();else input.click()}catch(_){input.focus();input.click()}};
    return h('div',{className:'samara-date-entry',style:{position:'relative',width:'100%',...style}},
      h('button',{type:'button',className:'samara-date-display',disabled:nativeProps.disabled,onClick:showCalendar,'aria-label':nativeProps['aria-label']||'Choose date'},
        h('span',null,value?formatDateIN(value):'DD-MM-YYYY'),h('span',{'aria-hidden':'true'},'▾')),
      h('input',{...nativeProps,ref:picker,'data-samara-native':'1',type:'date',value:value||'',onChange,tabIndex:-1,'aria-label':nativeProps['aria-label']||'Choose date',style:{position:'absolute',width:'1px',height:'1px',opacity:0,pointerEvents:'none',left:0,bottom:0}})
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
    return `${parts.hour%12||12}:${String(parts.minute).padStart(2,'0')} ${parts.hour>=12?'PM':'AM'}`;
  };
  const parseManualTime=(value,period)=>{
    const match=String(value||'').trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)$/);
    if(!match)return '';
    let hour=Number(match[1])%12;
    if(String(period||'').toUpperCase()==='PM')hour+=12;
    else if(String(period||'').toUpperCase()!=='AM')return '';
    return `${String(hour).padStart(2,'0')}:${match[2]}`;
  };
  // 2.18.83: time is typed by staff as  hh : mm  (the colon is fixed, not typed) + AM/PM dropdown.
  // Hour 1–12, minute 00–59; the cursor moves to the minutes by itself. The saved value stays 24-hour HH:MM.
  function ManualTimeInput(props){
    const {value,onChange,style,className,placeholder,min,max,step,required,name,validateTime,disabled,...inputProps}=props||{};
    const split=v=>{const t=formatManualTime(v);const m=t.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);return m?{hh:m[1].padStart(2,'0'),mm:m[2],ap:m[3]}:null};
    const init=split(value);
    const [hh,setHh]=React.useState(init?.hh||'');
    const [mm,setMm]=React.useState(init?.mm||'');
    const [period,setPeriod]=React.useState(init?.ap||'AM');
    const hourRef=React.useRef(null),minRef=React.useRef(null);
    const lastEmitted=React.useRef(String(value||'').slice(0,5));
    React.useEffect(()=>{
      const v=String(value||'').slice(0,5);
      if(v===lastEmitted.current)return; // our own change coming back — keep what the staff is typing
      lastEmitted.current=v;
      const next=split(value);
      setHh(next?.hh||'');setMm(next?.mm||'');if(next)setPeriod(next.ap);
    },[value]);
    const parsedOf=(h1,m1,ap)=>{
      const hn=Number(h1),mn=Number(m1);
      if(!/^\d{1,2}$/.test(h1)||!/^\d{2}$/.test(m1)||hn<1||hn>12||mn>59)return '';
      return parseManualTime(`${hn}:${m1}`,ap);
    };
    const parsed=parsedOf(hh,mm,period);
    React.useEffect(()=>{
      const input=hourRef.current;if(!input)return;
      let problem='';
      if((hh||mm)&&!parsed)problem='Enter the time as hh : mm (hour 1–12, minutes 00–59) and choose AM or PM.';
      else if(!hh&&!mm&&required)problem='Enter the time.';
      if(!problem&&parsed&&validateTime)problem=validateTime(parsed)||'';
      if(!problem&&parsed&&step&&Number(step)>60){const p=time24Parts(parsed);if((p.hour*3600+p.minute*60)%Number(step)!==0)problem=`Use a time in ${Math.round(Number(step)/60)}-minute intervals.`;}
      input.setCustomValidity(problem);
    },[hh,mm,period,parsed,required,step,validateTime]);
    const emit=(h1,m1,ap)=>{
      const out=parsedOf(h1,m1,ap);
      if(out){lastEmitted.current=out;onChange&&onChange({target:{value:out}});}
      else if(!h1&&!m1&&!required){lastEmitted.current='';onChange&&onChange({target:{value:''}});}
    };
    // a full box + one more digit typed = start again with the new digit (staff never have to delete first)
    const digits=v=>{const d=String(v||'').replace(/\D/g,'');return d.length>2?d.slice(-1):d;};
    const onHour=e=>{
      let v=digits(e.target.value);
      if(v.length===1&&Number(v)>1)v='0'+v;           // 2–9 → 02–09, jump to minutes
      if(v.length===2&&(Number(v)<1||Number(v)>12))v=v.slice(0,1); // 13+ not allowed
      setHh(v);emit(v,mm,period);
      if(v.length===2&&minRef.current){minRef.current.focus();minRef.current.select&&minRef.current.select();}
    };
    const onMin=e=>{
      let v=digits(e.target.value);
      if(v.length===1&&Number(v)>5)v='0'+v;           // 6–9 → 06–09
      setMm(v);emit(hh,v,period);
    };
    // read the box itself (not the state) — the state may not have caught up when the cursor jumps
    const padHour=()=>{const cur=hourRef.current?.value||'';if(cur.length===1&&Number(cur)>=1){const v='0'+cur;setHh(v);emit(v,minRef.current?.value||mm,period);}};
    const padMin=()=>{const cur=minRef.current?.value||'';if(cur.length===1){const v='0'+cur;setMm(v);emit(hourRef.current?.value||hh,v,period);}};
    const minKey=e=>{if(e.key==='Backspace'&&!mm&&hourRef.current){e.preventDefault();hourRef.current.focus();}};
    const hourKey=e=>{if((e.key===':'||e.key==='.'||e.key==='ArrowRight'&&e.currentTarget.selectionStart===hh.length)&&minRef.current){e.preventDefault();padHour();minRef.current.focus();}};
    const box={width:'2.6em',minWidth:'2.6em',textAlign:'center',padding:'8px 2px',fontVariantNumeric:'tabular-nums',letterSpacing:'.04em'};
    return React.createElement(React.Fragment,null,
      React.createElement('div',{className:`samara-time-entry ${className||''}`.trim(),style:{display:'flex',alignItems:'center',gap:'4px',width:'100%',...(style||{})},role:'group','aria-label':inputProps['aria-label']||'Time'},
        React.createElement('input',{...inputProps,ref:hourRef,type:'text',inputMode:'numeric',autoComplete:'off',maxLength:2,placeholder:'--',value:hh,disabled,required:Boolean(required),
          'data-samara-time-entry':'true','aria-label':`${inputProps['aria-label']||'Time'} – hour`,title:'Hour (1–12)',style:box,
          onChange:onHour,onBlur:padHour,onKeyDown:hourKey,onFocus:e=>e.target.select&&e.target.select(),onMouseUp:e=>e.preventDefault()}),
        React.createElement('span',{'aria-hidden':'true',style:{fontWeight:800,fontSize:'18px',lineHeight:1,padding:'0 1px',userSelect:'none'}},':'),
        React.createElement('input',{ref:minRef,type:'text',inputMode:'numeric',autoComplete:'off',maxLength:2,placeholder:'--',value:mm,disabled,required:Boolean(required),
          'aria-label':`${inputProps['aria-label']||'Time'} – minutes`,title:'Minutes (00–59)',style:box,
          onChange:onMin,onBlur:padMin,onKeyDown:minKey,onFocus:e=>e.target.select&&e.target.select(),onMouseUp:e=>e.preventDefault()}),
        React.createElement('select',{value:period,disabled:Boolean(disabled),'aria-label':'AM/PM',onChange:e=>{const ap=e.target.value;setPeriod(ap);emit(hh,mm,ap)},style:{flex:'0 0 74px',width:'74px',padding:'8px 6px',marginLeft:'4px'}},
          React.createElement('option',{value:'AM'},'AM'),React.createElement('option',{value:'PM'},'PM'))
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
        h('input',{...inputProps,ref:picker,'data-samara-native':'1',id,name:undefined,type:'date',value:date,required:Boolean(required),disabled,min:dateMin,max:dateMax,onChange:dateChanged,tabIndex:-1,'aria-label':inputProps['aria-label']||'Choose date',style:{position:'absolute',width:'1px',height:'1px',opacity:0,pointerEvents:'none',left:0,bottom:0}})
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
      if(!parent||parent.closest('script,style,textarea,option,[contenteditable]'))return;
      const updated=convert(node.nodeValue);
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

