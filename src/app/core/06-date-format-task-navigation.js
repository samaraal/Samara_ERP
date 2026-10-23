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
    const match=String(value||'').trim().match(/^(0?[1-9]|1[0-2])[:.]([0-5]\d)$/);
    if(!match)return '';
    let hour=Number(match[1])%12;
    if(String(period||'').toUpperCase()==='PM')hour+=12;
    else if(String(period||'').toUpperCase()!=='AM')return '';
    return `${String(hour).padStart(2,'0')}:${match[2]}`;
  };
  function ManualTimeInput(props){
    const {value,onChange,style,className,placeholder,min,max,step,required,name,validateTime,...inputProps}=props||{};
    const initial=formatManualTime(value).split(' ');
    const [draft,setDraft]=React.useState(initial[0]||'');
    const [period,setPeriod]=React.useState(initial[1]||'AM');
    const inputRef=React.useRef(null);
    React.useEffect(()=>{const parts=formatManualTime(value).split(' ');setDraft(parts[0]||'');setPeriod(parts[1]||'AM')},[value]);
    React.useEffect(()=>{
      const input=inputRef.current;
      if(!input)return;
      const parsed=parseManualTime(draft,period);
      let problem=parsed&&validateTime?validateTime(parsed)||'':'';
      if(parsed&&step&&Number(step)>60){
        const parts=time24Parts(parsed);
        if((parts.hour*3600+parts.minute*60)%Number(step)!==0)problem=problem||`Use a time in ${Math.round(Number(step)/60)}-minute intervals.`;
      }
      input.setCustomValidity(problem);
    },[draft,period,step,validateTime]);
    const emit=(nextDraft,nextPeriod,event)=>{
      const parsed=parseManualTime(nextDraft,nextPeriod);
      if(onChange&&parsed)onChange({target:{value:parsed},currentTarget:event?.currentTarget});
      else if(onChange&&!nextDraft.trim()&&!required)onChange({target:{value:''},currentTarget:event?.currentTarget});
    };
    return React.createElement(React.Fragment,null,
      React.createElement('div',{className:'samara-time-entry',style:{display:'flex',gap:'6px',width:'100%'}},
        React.createElement('input',{
          ...inputProps,
          ref:inputRef,
          type:'text',
          value:draft,
          required:Boolean(required),
          placeholder:placeholder||'h:mm',
          inputMode:'text',
          autoComplete:'off',
          pattern:'(?:0?[1-9]|1[0-2])[:.][0-5]\\d',
          title:'Enter the time as h:mm (or h.mm), then choose AM or PM.',
          'data-samara-time-entry':'true',
          'aria-label':inputProps['aria-label']||'Time (h:mm)',
          className,
          style:{flex:'1 1 auto',minWidth:0,...(style||{})},
          min:undefined,max:undefined,step:undefined,
          onChange:event=>{const next=event.target.value;setDraft(next);emit(next,period,event)}
        }),
        React.createElement('select',{value:period,disabled:Boolean(inputProps.disabled),'aria-label':'AM/PM',onChange:event=>{const next=event.target.value;setPeriod(next);emit(draft,next,event)},style:{flex:'0 0 78px',width:'78px',padding:'8px 6px'}},
          React.createElement('option',{value:'AM'},'AM'),React.createElement('option',{value:'PM'},'PM'))
      ),
      name?React.createElement('input',{type:'hidden',name,value:parseManualTime(draft,period)}):null
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
    const timeLabel=formatManualTime(time)||'Select time';
    const options=Array.from({length:24},(_,index)=>{const hour=index%12||12;const period=index<12?'AM':'PM';return {value:`${String(index).padStart(2,'0')}:00`,label:`${hour}:00 ${period}`}});
    const [timePickerOpen,setTimePickerOpen]=React.useState(false);
    const currentTime=time24Parts(time);
    const selectedTime=currentTime?`${String(currentTime.hour).padStart(2,'0')}:00`:'';
    const timePopup=timePickerOpen?h('div',{className:'time-picker-backdrop',onMouseDown:event=>{if(event.target===event.currentTarget)setTimePickerOpen(false)}},
      h('div',{className:'time-picker-popup',role:'dialog','aria-modal':'true','aria-label':'Select effective time'},
        h('div',{className:'time-picker-head'},h('div',null,h('h4',null,'Select Time'),h('small',null,'Choose one effective time')),h('button',{type:'button',className:'close',onClick:()=>setTimePickerOpen(false),'aria-label':'Close'},'×')),
        h('div',{className:'time-picker-grid'},options.map(option=>h('button',{type:'button',className:`time-picker-option ${selectedTime===option.value?'selected':''}`,key:option.value,onClick:()=>{chooseTime(option.value);setTimePickerOpen(false)}},option.label))),
        h('div',{className:'time-picker-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setTimePickerOpen(false)},'Cancel'))
      )):null;
    return h('div',{className:`samara-datetime-entry ${className||''}`.trim(),style:{width:'100%',display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:'8px',alignItems:'center',...(style||{})}},
      h('div',{className:'samara-date-entry',style:{position:'relative',minWidth:0}},
        h('button',{type:'button',className:'samara-date-display',disabled,onClick:showCalendar,'aria-label':inputProps['aria-label']||'Choose date'},h('span',null,date?formatDateIN(date):'DD-MM-YYYY'),h('span',{'aria-hidden':'true'},'▾')),
        h('input',{...inputProps,ref:picker,'data-samara-native':'1',id,name:undefined,type:'date',value:date,required:Boolean(required),disabled,min:dateMin,max:dateMax,onChange:dateChanged,tabIndex:-1,'aria-label':inputProps['aria-label']||'Choose date',style:{position:'absolute',width:'1px',height:'1px',opacity:0,pointerEvents:'none',left:0,bottom:0}})
      ),
      h('button',{type:'button',className:'time-picker-trigger samara-effective-time-trigger',onClick:()=>setTimePickerOpen(true),'aria-label':`${inputProps['aria-label']||'Effective date and time'} time: ${timeLabel}`},h('span',{className:time?'time-picker-value':'time-picker-placeholder'},timeLabel),h('span',{className:'time-picker-caret','aria-hidden':'true'},'▾')),
      name?h('input',{type:'hidden',name,value:valueToSubmit}):null
    ,timePopup&&ReactDOM.createPortal?ReactDOM.createPortal(timePopup,document.body):timePopup);
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

