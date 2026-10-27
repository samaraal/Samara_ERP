const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const roles=fs.readFileSync(path.join(root,'src/app/core/04-supabase-roles-navigation.js'),'utf8');
const start=roles.indexOf('  const isNursingManagerProfile=');
const navStart=roles.indexOf('  const allowedPagesForProfile=',start);
const end=roles.indexOf('\n  };',navStart)+6;
const source=fs.readFileSync(path.join(root,'src/app/pages/whatsapp-inbox.js'),'utf8');
const manager={id:'manager',role:'Manager',designation:'Nurse Manager',department:'Nursing'};
function mount(profile,messages=[]){
  const states=[],effects=[],calls=[];let cursor=0;
  const slot=(initial,ref=false)=>{
    const i=cursor++;
    if(!(i in states))states[i]=ref?{current:initial}:typeof initial==='function'?initial():initial;
    return ref?states[i]:[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];
  };
  const chain={};
  for(const method of ['select','gte','lt','in','order','range','limit'])chain[method]=()=>chain;
  chain.then=(resolve,reject)=>Promise.resolve({data:messages,error:null}).then(resolve,reject);
  const session=new Map();
  const context=vm.createContext({
    console,Date,Set,Map,URL,FormData,setTimeout,clearTimeout,
    h:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
    React:{Fragment:'Fragment',useState:initial=>slot(initial),useRef:initial=>slot(initial,true),
      useEffect:fn=>effects.push(fn),useLayoutEffect:()=>{},useMemo:fn=>fn()},
    window:{matchMedia:()=>({matches:false}),SamaraDateTime:{text:value=>value}},
    localStorage:{getItem:()=>null},
    sessionStorage:{getItem:k=>session.get(k)||null,removeItem:k=>session.delete(k)},
    useAppliedFilters:()=>({applied:{from:'',to:''}}),
    Section:'Section',StrictDateInput:'StrictDateInput',ApplyFilterButton:'ApplyFilterButton',
    ROLE_NAV:{Nurse:['Clinical Dashboard'],Manager:['Dashboard'],HR:['Dashboard'],STD:['WhatsApp Inbox']},ROLE_HOME:{},STORE_SECTIONS:[],
    employeeDepartment:()=>'',formalName:p=>p?.full_name||'Manager',
    normalizeWhatsAppRecipient:p=>String(p||'').replace(/\D/g,''),
    whatsAppFolder:()=> 'Other',formatTimeIN:()=> '12:00',fmt:()=> 'Today',
    client:{from:table=>{calls.push(['table',table]);return chain;},rpc:async(name)=>{
      calls.push(['rpc',name]);assert.equal(name,'fv_whatsapp_vendor_phones');return {data:[],error:null};
    }}
  });
  vm.runInContext(roles.slice(start,end)+'\n'+source,context);
  const render=()=>{cursor=0;effects.length=0;return context.WhatsAppInboxView({profile});};
  return {render,calls,effects,session,pages:()=>vm.runInContext('allowedPagesForProfile',context)(profile)};
}
function nodes(tree){
  return !tree||typeof tree!=='object'?[]:[tree,...(tree.children||[]).flatMap(nodes)];
}
function text(tree){
  return typeof tree==='string'||typeof tree==='number'?String(tree):tree&&typeof tree==='object'?(tree.children||[]).map(text).join(' '):'';
}
(async()=>{
  const rows=[{id:'family-row',recipient_number:'15555550123',source_type:'Patient / Family',
    direction:'inbound',message_type:'text',message_content:'Family message',
    message_payload:{patient_id:'patient-a'},created_at:'2026-01-01T00:00:00Z',erp_read_at:'2026-01-01T00:00:00Z'},
    {id:'hidden-row',recipient_number:'15555550124',source_type:'Patient / Family',
    direction:'inbound',message_type:'text',message_content:'Hidden message',message_payload:{},
    created_at:'2026-01-01T00:00:00Z',deleted_at:'2026-01-02T00:00:00Z'}];
  for(const profile of [manager,{...manager,__foodVendor:{read:true},__dutyContext:{leave_cover:{}}}]){
    const app=mount(profile,rows);let tree=app.render();
    assert.ok(app.pages().includes('WhatsApp Inbox'));
    assert.ok(app.pages().includes('WhatsApp Logs'));
    assert.ok(!text(tree).includes('Sending remains limited to food vendors'));
    await nodes(tree).find(n=>n.type==='button'&&text(n)==='Refresh').props.onClick();
    tree=app.render();
    assert.ok(app.calls.some(c=>c[0]==='table'&&c[1]==='hr_whatsapp_communications'));
    assert.ok(!app.calls.some(c=>c[1]==='wa_food_inbox'));
    assert.ok(text(tree).includes('Family message'),'Non-vendor conversation must render');
    const templates=nodes(tree).filter(n=>n.type==='option').map(n=>n.props.value);
    assert.ok(templates.includes('samara_general_followup'));
    assert.ok(templates.includes('samara_admission_followup'));
    assert.ok(nodes(tree).some(n=>text(n).startsWith('Show deleted (1)')));
    app.session.set('samara_patient_whatsapp_context',JSON.stringify({phone:'15555550123',patient_id:'patient-a',patient_name:'Resident A'}));
    app.effects.find(fn=>fn.toString().includes("JSON.parse(sessionStorage.getItem('samara_patient_whatsapp_context')"))();
    tree=app.render();
    assert.ok(text(tree).includes('Show All WhatsApp'),'Patient chat deep link remains available');
  }
  const nurse=mount({role:'Nurse',designation:'Staff Nurse',department:'Nursing'});
  assert.ok(text(nurse.render()).includes('available to authorised communication staff'));
  assert.ok(!nurse.pages().includes('WhatsApp Logs'));
  const delegate=mount({role:'Nurse',designation:'Staff Nurse',__foodVendor:{read:true}});
  assert.ok(!text(delegate.render()).includes('available to authorised communication staff'),'Existing food delegate retains inbox');
  console.log('PASS: Nursing Manager full inbox, templates, restore, patient links, logs; nurse/delegate regression checks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
