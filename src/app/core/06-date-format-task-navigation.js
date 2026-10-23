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
    return h('div',{style:{position:'relative',width:'100%'}},
      h('input',{type:'text',readOnly:true,value:value?formatDateIN(value):'',placeholder:'DD-MM-YYYY',style:{...(style||{}),width:'100%',paddingRight:'48px',cursor:'pointer'}}),
      h('span',{'aria-hidden':'true',style:{position:'absolute',right:'15px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:'18px'}},'▾'),
      h('input',{...nativeProps,'data-samara-native':'1',type:'date',value:value||'',onChange,tabIndex:-1,'aria-label':nativeProps['aria-label']||'Choose date',style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}})
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
  const parseManualTime=value=>{
    const match=String(value||'').trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i);
    if(!match)return '';
    let hour=Number(match[1])%12;
    if(match[3].toUpperCase()==='PM')hour+=12;
    return `${String(hour).padStart(2,'0')}:${match[2]}`;
  };
  function ManualTimeInput(props){
    const {value,onChange,style,className,placeholder,min,max,step,required,name,...inputProps}=props||{};
    const [draft,setDraft]=React.useState(()=>formatManualTime(value));
    const inputRef=React.useRef(null);
    React.useEffect(()=>setDraft(formatManualTime(value)),[value]);
    React.useEffect(()=>{
      const input=inputRef.current;
      if(!input)return;
      const parsed=parseManualTime(draft);
      let problem='';
      if(parsed&&step&&Number(step)>60){
        const parts=time24Parts(parsed);
        if((parts.hour*3600+parts.minute*60)%Number(step)!==0)problem=`Use a time in ${Math.round(Number(step)/60)}-minute intervals.`;
      }
      input.setCustomValidity(problem);
    },[draft,step]);
    const update=event=>{
      const next=event.target.value;
      setDraft(next);
      const parsed=parseManualTime(next);
      if(onChange&&parsed)onChange({target:{value:parsed},currentTarget:event.currentTarget});
      else if(onChange&&!next.trim()&&!required)onChange({target:{value:''},currentTarget:event.currentTarget});
    };
    return React.createElement(React.Fragment,null,
      React.createElement('input',{
        ...inputProps,
        ref:inputRef,
        type:'text',
        value:draft,
        required:Boolean(required),
        placeholder:placeholder||'h:mm AM/PM',
        inputMode:'text',
        autoComplete:'off',
        pattern:'(?:0?[1-9]|1[0-2]):[0-5]\\d\\s?(?:AM|PM)',
        title:'Enter time as h:mm AM or h:mm PM (for example, 8:30 AM).',
        'data-samara-time-entry':'true',
        'aria-label':inputProps['aria-label']||'Time (h:mm AM/PM)',
        className,
        style,
        min:undefined,max:undefined,step:undefined,
        onChange:update
      }),
      name?React.createElement('input',{type:'hidden',name,value:parseManualTime(draft)}):null
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
    const [time,setTime]=React.useState(formatManualTime(initial.time));
    const timeRef=React.useRef(null);
    React.useEffect(()=>{const next=split(value);setDate(next.date);setTime(formatManualTime(next.time))},[value]);
    const emit=(nextDate,nextTime)=>{
      if(!onChange)return;
      const parsed=parseManualTime(nextTime);
      onChange({target:{value:nextDate&&parsed?`${nextDate}T${parsed}`:''}});
    };
    const dateChanged=event=>{
      const nextDate=event.target.value;
      setDate(nextDate);
      if(nextDate&&parseManualTime(time))emit(nextDate,time);
      else if(!nextDate&&!time.trim())emit('','');
    };
    const timeChanged=event=>{
      const nextTime=event.target.value;
      setTime(nextTime);
      if(date&&parseManualTime(nextTime))emit(date,nextTime);
      else if(!nextTime.trim()&&!required)emit('','');
    };
    React.useEffect(()=>{
      const control=timeRef.current;
      if(!control)return;
      const parsed=parseManualTime(time);
      let problem='';
      if(parsed&&date){
        const current=`${date}T${parsed}`;
        const minValue=String(min||'').slice(0,16),maxValue=String(max||'').slice(0,16);
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(minValue)&&current<minValue)problem='Choose a date and time at or after the allowed time.';
        if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(maxValue)&&current>maxValue)problem='Choose a date and time at or before the allowed time.';
      }
      control.setCustomValidity(problem);
    },[date,time,min,max]);
    const dateMax=String(max||'').slice(0,10)||undefined;
    const dateMin=String(min||'').slice(0,10)||undefined;
    const valueToSubmit=date&&parseManualTime(time)?`${date}T${parseManualTime(time)}`:'';
    return h('div',{className:`samara-datetime-entry ${className||''}`.trim(),style:{width:'100%',display:'grid',gridTemplateColumns:'minmax(0,1.15fr) minmax(118px,.85fr)',gap:'8px',alignItems:'center',...(style||{})}},
      h('div',{style:{position:'relative',minWidth:0}},
        h('input',{type:'text',readOnly:true,value:date?formatDateIN(date):'',placeholder:'DD-MM-YYYY',disabled,tabIndex:-1,'aria-hidden':'true',style:{width:'100%',paddingRight:'42px',cursor:'pointer'}}),
        h('span',{'aria-hidden':'true',style:{position:'absolute',right:'14px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:'16px'}},'▾'),
        h('input',{...inputProps,'data-samara-native':'1',id,name:undefined,type:'date',value:date,required:Boolean(required),disabled,min:dateMin,max:dateMax,onChange:dateChanged,tabIndex:0,'aria-label':inputProps['aria-label']||'Choose date',style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}})
      ),
      h('input',{...inputProps,ref:timeRef,id:undefined,name:undefined,type:'text',value:time,onChange:timeChanged,required:Boolean(required),disabled,placeholder:'h:mm AM/PM',inputMode:'text',autoComplete:'off',pattern:'(?:0?[1-9]|1[0-2]):[0-5]\\d\\s?(?:AM|PM)',title:'Enter time as h:mm AM or h:mm PM (for example, 8:30 AM).','data-samara-time-entry':'true','aria-label':`${inputProps['aria-label']||'Date and time'} — time (h:mm AM/PM)`,style:{minWidth:0}}),
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
    // Escalation register rows carry no title: Meal Due times are 8 AM / 1 PM / 8 PM.
    const byHour=hour===8?'Tiffin':hour===13?'Lunch':hour===20?'Dinner':'';
    return {meal_type:meal_type||(String(a?.alert_type||'').toLowerCase()==='meal'?byHour:''),meal_date,poor_intake:String(a?.alert_type||'').toLowerCase()==='meal intake'};
  };
  const clearTaskNavigationContext = () => {
    try{sessionStorage.removeItem(TASK_NAVIGATION_KEY)}catch(_error){}
  };

