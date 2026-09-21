(function(){
  'use strict';
  const h=React.createElement;
  const signature=p=>[p?.role,p?.designation,p?.department,p?.__dutyContext?.assignment?.id||'',p?.__dutyContext?.leave_cover?.id||'',(p?.__dutyContext?.additional_duties||[]).map(x=>x.id).join(','),(p?.__dutyContext?.roles||[]).join(',')].join('|');
  function applyContext(profile,context){
    if(!context||context.profile_id!==profile.id)throw new Error('Duty assignment identity could not be verified.');
    return {...profile,role:context.role,designation:context.designation,department:context.department,__dutyContext:context};
  }
  function regularProfile(profile){
    const c=profile?.__dutyContext;
    return c?{...profile,role:c.regular_role,designation:c.regular_designation,department:c.regular_department}:profile;
  }
  function useContext({client,profile,setProfile,onChanged}){
    const [state,setState]=React.useState({id:null,ready:false,error:''});
    const latest=React.useRef({profile,onChanged});latest.current={profile,onChanged};
    const refreshRef=React.useRef(()=>{});
    React.useEffect(()=>{
      const id=profile?.id;if(!id){setState({id:null,ready:false,error:''});return;}
      let active=true,boundaryTimer,sequence=0;
      async function refresh(block=false){
        const attempt=++sequence;
        if(block)setState({id,ready:false,error:''});
        try{
          const {data,error}=await client.rpc('duty_swap_context');
          if(!active||attempt!==sequence)return;
          if(error)throw error;
          const before=latest.current.profile;
          if(before?.id!==id)return;
          const next=applyContext(before,data);
          latest.current.profile=next;setProfile(next);setState({id,ready:true,error:''});
          if(signature(before)!==signature(next))latest.current.onChanged(next);
          clearTimeout(boundaryTimer);
          if(data.next_change_at){
            const delay=new Date(data.next_change_at).getTime()-new Date(data.server_now).getTime();
            boundaryTimer=setTimeout(()=>refresh(true),Math.max(10,Math.min(delay+30,2147483000)));
          }
        }catch(error){if(active&&attempt===sequence)setState({id,ready:false,error:error.message||'Unable to verify current duties.'});}
      }
      refreshRef.current=()=>refresh(true);refresh(true);
      const interval=setInterval(()=>refresh(),15000);
      const focus=()=>refresh(true);
      const visible=()=>{if(document.visibilityState==='visible')refresh(true)};
      window.addEventListener('focus',focus);window.addEventListener('samara-duty-swap-changed',focus);document.addEventListener('visibilitychange',visible);
      return()=>{active=false;clearInterval(interval);clearTimeout(boundaryTimer);window.removeEventListener('focus',focus);window.removeEventListener('samara-duty-swap-changed',focus);document.removeEventListener('visibilitychange',visible)};
    },[profile?.id,Boolean(profile?.__dutyContext)]);
    return {...state,ready:state.id===profile?.id&&Boolean(profile?.__dutyContext)&&state.ready,refresh:()=>refreshRef.current()};
  }
  const indiaInput=date=>new Date(date.getTime()+330*60000).toISOString().slice(0,16);
  const indiaISO=value=>value?new Date(value+':00+05:30').toISOString():null;
  const display=value=>value?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))+' IST':'—';
  function useDailyNotice({client,profile,ready=true}){
    const [notice,setNotice]=React.useState(null);
    const context=profile?.__dutyContext;
    const day=context?.server_now?indiaInput(new Date(context.server_now)).slice(0,10):'';
    React.useEffect(()=>{
      let active=true;
      async function claim(){
        if(document.visibilityState!=='visible'||!profile?.id||!context)return;
        try{
          const {data,error}=await client.rpc('claim_department_duty_notice');
          if(active&&!error&&data?.profile_id===profile.id)setNotice(data);
        }catch(_error){/* A notice failure never changes verified duties. */}
      }
      claim();document.addEventListener('visibilitychange',claim);
      return()=>{active=false;document.removeEventListener('visibilitychange',claim)};
    },[profile?.id,day,context?.assignment?.id,context?.leave_cover?.id,context?.next_change_at]);
    React.useEffect(()=>{if(!notice||!ready)return;const timer=setTimeout(()=>setNotice(null),8000);return()=>clearTimeout(timer)},[notice,ready]);
    return {notice:notice?.profile_id===profile?.id?notice:null,onClose:()=>setNotice(null)};
  }
  function DailyNotice({notice,onClose}){
    if(!notice)return null;
    return h('div',{className:'duty-login-notice'},
      h('style',null,`.duty-login-notice{position:fixed;inset:0;z-index:11000;display:grid;place-items:center;overflow:hidden;background:rgba(255,248,252,.97);color:#7d104c;padding:24px}.duty-login-notice-message{width:min(100%,1050px);text-align:center;font-weight:900;line-height:1.2;animation:duty-notice-rise 8s ease-in-out both}.duty-login-notice-title{font-size:clamp(24px,3vw,44px);margin:0 0 14px}.duty-login-notice-main{font-size:clamp(30px,4.5vw,66px);margin:12px 0}.duty-login-notice-detail{font-size:clamp(18px,2vw,28px);margin:14px 0}.duty-login-notice-close{position:absolute;right:18px;top:18px;font-size:18px;font-weight:800}@keyframes duty-notice-rise{0%{transform:translateY(100vh);opacity:0}18%,80%{transform:translateY(0);opacity:1}100%{transform:translateY(-100vh);opacity:0}}@media(prefers-reduced-motion:reduce){.duty-login-notice-message{animation:none}}`),
      h('div',{className:'duty-login-notice-message',role:'status','aria-live':'polite'},
        h('p',{className:'duty-login-notice-title'},notice.kind==='leave'?'LEAVE COVER':'TEMPORARY DUTY SWAP'),
        h('p',{className:'duty-login-notice-detail'},notice.name),
        h('p',{className:'duty-login-notice-main'},notice.kind==='leave'?`Keep your duties and cover ${notice.acting_as} duties.`:notice.upcoming?`You will take charge of ${notice.acting_as} duties today.`:`You are assigned ${notice.acting_as} duties.`),
        notice.upcoming&&h('p',{className:'duty-login-notice-detail'},`Starts: ${display(notice.starts_at)}`),
        h('p',{className:'duty-login-notice-detail'},notice.kind==='leave'?'Until Admin/Director approves the return.':`Until ${display(notice.ends_at)}`),
        h('p',{className:'duty-login-notice-detail'},notice.kind==='leave'?'Use your own login.':'Your regular duties return automatically afterwards.')
      ),
      h('button',{type:'button',className:'btn btn-secondary duty-login-notice-close',onClick:onClose,'aria-label':'Dismiss duty assignment notice'},'Close ✕')
    );
  }
  function Page({client}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [form,setForm]=React.useState({std:'',nursing:'',start:indiaInput(new Date()),end:indiaInput(new Date(Date.now()+8*3600000)),reason:''});
    const [ending,setEnding]=React.useState(null),[endReason,setEndReason]=React.useState('');
    const lock=React.useRef(false);
    async function load(){
      const result=await client.rpc('duty_swap_workspace');
      if(result.error){setError(result.error.message);return;}
      setData(result.data);setError('');
      setForm(f=>({...f,std:f.std||result.data.candidates.find(p=>p.role==='STD')?.id||'',nursing:f.nursing||result.data.candidates.find(p=>p.role==='Manager')?.id||''}));
    }
    React.useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer)},[]);
    async function save(e){
      e.preventDefault();if(lock.current||!data?.can_manage)return;
      lock.current=true;setBusy(true);setError('');
      try{
        const {error}=await client.rpc('create_department_duty_swap',{p_std:form.std,p_nursing:form.nursing,p_starts_at:indiaISO(form.start),p_ends_at:indiaISO(form.end),p_reason:'Temporary duty swap'});
        if(error)throw error;
        setForm(f=>({...f,reason:''}));await load();window.dispatchEvent(new Event('samara-duty-swap-changed'));
      }catch(error){setError(error.message||'Unable to save assignment.')}finally{lock.current=false;setBusy(false)}
    }
    async function end(e){
      e.preventDefault();if(lock.current||!ending)return;lock.current=true;setBusy(true);
      try{
        const {error}=await client.rpc('cancel_department_duty_swap',{p_id:ending,p_reason:endReason.trim()});
        if(error)throw error;setEnding(null);setEndReason('');await load();window.dispatchEvent(new Event('samara-duty-swap-changed'));
      }catch(error){setError(error.message)}finally{lock.current=false;setBusy(false)}
    }
    const input=(label,key,type='text')=>h('label',{className:'field'},label,h('input',{type,required:true,value:form[key],onInput:e=>{const value=e.target.value;setForm(f=>({...f,[key]:value}))},onChange:e=>{const value=e.target.value;setForm(f=>({...f,[key]:value}))}}));
    const select=(label,key,role)=>h('label',{className:'field'},label,h('select',{required:true,value:form[key],onChange:e=>setForm({...form,[key]:e.target.value})},h('option',{value:''},'Select employee'),...(data?.candidates||[]).filter(p=>p.role===role).map(p=>h('option',{value:p.id,key:p.id},p.name))));
    return h('div',{className:'card',style:{maxWidth:'850px',padding:'24px'}},
      h('h3',null,'This period'),
      error&&h('div',{className:'message error',role:'alert'},error),
      !data?h('p',null,'Loading assignments…'):null,
      data?.can_manage&&h('form',{onSubmit:save},
        h('div',{className:'modal-grid'},select('Nursing Manager','std','STD'),select('STD','nursing','Manager')),
        h('h4',null,'Period'),h('div',{className:'modal-grid'},input('From','start','datetime-local'),input('To','end','datetime-local')),
        h('p',{className:'muted'},'India time. Regular duties return automatically after this period.'),
        h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Assigning…':'Assign')
      ),
      h('h4',null,'Assignments'),
      (data?.assignments||[]).map(s=>h('div',{className:'card',key:s.id,style:{marginTop:'12px'}},
        h('strong',null,s.status),h('p',null,`Nursing Manager: ${s.std_name}`),h('p',null,`STD: ${s.nursing_name}`),
        h('p',null,`${display(s.starts_at)} — ${display(s.ends_at)}`),h('small',null,`Assigned by ${s.created_by_name}`),
        s.cancellation_reason&&h('p',null,`Ended early: ${s.cancellation_reason}`),
        data?.can_manage&&['Active','Scheduled','Inactive employee'].includes(s.status)&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setEnding(s.id);setEndReason('')}},s.status==='Scheduled'?'Cancel assignment':'End assignment now')
      )),
      data&&!data.assignments.length&&h('p',null,'No assignments yet.'),
      ending&&h('form',{className:'card',onSubmit:end},h('h4',null,'End temporary assignment'),h('p',null,'This immediately restores regular department duties.'),h('textarea',{required:true,placeholder:'Reason',value:endReason,onChange:e=>setEndReason(e.target.value)}),h('button',{className:'btn btn-primary',disabled:busy},'Confirm end'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEnding(null),disabled:busy},'Keep assignment'))
    );
  }
  function AdditionalDutyPage({client}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[ending,setEnding]=React.useState(null),[endReason,setEndReason]=React.useState('');
    const [form,setForm]=React.useState({source:'',receiver:'',start:indiaInput(new Date()),end:'',reason:''});
    async function load(){const r=await client.rpc('additional_duty_workspace');if(r.error)setError(r.error.message);else{setData(r.data);setError('')}}
    React.useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[]);
    const people=data?.candidates||[],source=people.find(x=>x.id===form.source),receiver=people.find(x=>x.id===form.receiver);
    async function save(e){e.preventDefault();if(busy||!data?.can_manage)return;if(!form.source||!form.receiver||form.source===form.receiver){setError('Select two different employees.');return}setBusy(true);setError('');try{const r=await client.rpc('create_department_additional_duty',{p_source:form.source,p_receiver:form.receiver,p_starts_at:indiaISO(form.start),p_ends_at:form.end?indiaISO(form.end):null,p_reason:form.reason.trim()});if(r.error)throw r.error;setForm(f=>({...f,source:'',receiver:'',reason:'',end:''}));await load();window.dispatchEvent(new Event('samara-duty-swap-changed'))}catch(e){setError(e.message||'Unable to assign additional duty.')}finally{setBusy(false)}}
    async function end(e){e.preventDefault();setBusy(true);try{const r=await client.rpc('end_department_additional_duty',{p_id:ending,p_reason:endReason.trim()});if(r.error)throw r.error;setEnding(null);setEndReason('');await load();window.dispatchEvent(new Event('samara-duty-swap-changed'))}catch(e){setError(e.message)}finally{setBusy(false)}}
    const employeeSelect=(label,key)=>h('label',{className:'field'},label,h('select',{required:true,value:form[key],onChange:e=>setForm({...form,[key]:e.target.value})},h('option',{value:''},'Select employee'),...people.filter(p=>key!=='receiver'||p.id!==form.source).map(p=>h('option',{value:p.id,key:p.id},`${p.name}${p.designation?' — '+p.designation:p.role?' — '+p.role:''}`))));
    return h('div',{className:'card',style:{maxWidth:'850px',padding:'24px'}},h('h3',null,'Additional Duty Assignment'),h('p',null,'Admin/Director can give an employee another employee’s duties in addition to their regular duties. The original employee keeps the duty. Leave auto-cover and Temporary Duty Swap remain unchanged.'),error&&h('div',{className:'message error',role:'alert'},error),
      data?.can_manage&&h('form',{onSubmit:save},h('div',{className:'modal-grid'},employeeSelect('Duty belongs to','source'),employeeSelect('Assign additionally to','receiver')),source&&receiver&&h('p',{className:'muted'},`${receiver.name} keeps regular duties and additionally receives ${source.name}’s duty access.`),h('div',{className:'modal-grid'},h('label',{className:'field'},'From',h('input',{type:'datetime-local',required:true,value:form.start,onChange:e=>setForm({...form,start:e.target.value})})),h('label',{className:'field'},'Until (optional)',h('input',{type:'datetime-local',value:form.end,onChange:e=>setForm({...form,end:e.target.value})}))),h('label',{className:'field'},'Reason',h('textarea',{required:true,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value}),placeholder:'Reason for additional duty'})),h('p',{className:'muted'},'If Until is blank, the additional duty continues until Admin/Director ends it.'),h('button',{className:'btn btn-primary',disabled:busy||!form.source||!form.receiver||form.source===form.receiver},busy?'Saving…':'Assign Additional Duty')),
      h('h4',{style:{marginTop:'22px'}},'Assignments'),...(data?.assignments||[]).map(a=>h('div',{className:'card',key:a.id,style:{marginTop:'10px'}},h('strong',null,a.status),h('p',null,`${a.receiver_name} keeps regular duties + receives ${a.source_name}’s duties.`),h('p',null,`Reason: ${a.reason}`),h('p',null,`${display(a.starts_at)} — ${a.ends_at?display(a.ends_at):'Until ended by Admin/Director'}`),h('small',null,`Assigned by ${a.created_by_name}`),a.end_reason&&h('p',null,`Ended: ${a.end_reason}`),data?.can_manage&&['Active','Scheduled'].includes(a.status)&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setEnding(a.id);setEndReason('')}},a.status==='Scheduled'?'Cancel':'End Additional Duty'))),data&&!data.assignments.length&&h('p',null,'No additional-duty assignments yet.'),
      ending&&h('form',{className:'card',onSubmit:end},h('h4',null,'End Additional Duty'),h('textarea',{required:true,value:endReason,onChange:e=>setEndReason(e.target.value),placeholder:'Reason for ending'}),h('button',{className:'btn btn-primary',disabled:busy},'Confirm End'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEnding(null),disabled:busy},'Keep Assignment')));
  }
  function LeaveCoverPage({client}){
    const [data,setData]=React.useState(null),[error,setError]=React.useState('');
    React.useEffect(()=>{let active=true;async function load(){const result=await client.rpc('department_leave_workspace');if(!active)return;if(result.error)setError(result.error.message);else{setData(result.data);setError('')}}load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer)}},[client]);
    return h('div',{className:'card',style:{maxWidth:'850px',padding:'24px'}},
      h('h3',null,'Leave Cover'),
      h('p',null,'When approved leave starts, the other employee keeps their duties and covers the absent employee.'),
      h('p',null,'Cover continues until Admin/Director approves the return.'),
      error&&h('p',{className:'message error',role:'alert'},error),
      !data&&h('p',null,'Loading…'),
      data?.assignments.map(c=>h('div',{className:'card',key:c.id,style:{marginTop:'12px'}},
        h('strong',null,c.status),h('p',null,`On leave: ${c.absent_name} (${c.absent_role})`),
        h('p',null,`Covering: ${c.cover_name||'Admin/Director must arrange cover'}`),
        h('p',null,`From ${display(c.starts_at)}`),
        h('p',{className:'muted'},`Planned return: ${display(c.expected_return_at)}. Cover ends only after return approval.`),
        c.ended_at&&h('p',null,`Ended: ${display(c.ended_at)}`)
      )),
      data&&!data.assignments.length&&h('p',null,'No leave cover yet. It starts automatically from approved leave.'),
      data?.can_manage&&h('p',null,'Approve leave through Leave Approvals. Review return requests below.')
    );
  }
  window.SamaraDutySwap={applyContext,regularProfile,useContext,useDailyNotice,Page,AdditionalDutyPage,LeaveCoverPage,DailyNotice,signature,indiaISO,indiaInput};
})();
