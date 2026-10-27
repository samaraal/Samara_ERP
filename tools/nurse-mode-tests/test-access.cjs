const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,'src/app',file),'utf8');
const core=read('core/04-supabase-roles-navigation.js');
const shell=read('shell/01-app-main.js');
const menus=read('shell/04-navigation-menus.js');
const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
const context=vm.createContext({h,React:{Fragment:'Fragment'},CM_PAGE_PREFIX:'Charge Master: ',CHARGE_MASTER_PAGES:[],STORE_SECTIONS:[],employeeDepartment:()=>''});
vm.runInContext(core.slice(core.indexOf('  const ACCOUNTS_NAV_GROUPS=')),context);
const transform=shell.slice(shell.indexOf('    const toNurseView='),shell.indexOf('    const engineProfile='));
vm.runInContext(transform,context);
vm.runInContext(menus.slice(menus.indexOf('  function NursingMobileQuickActions(')),context);
vm.runInContext('this.api={toNurseView,nurseModeOn,allowedPagesForProfile,sectionsFor,NursingMobileQuickActions};',context);
const api=context.api;
const sobana={id:'manager-fixture',role:'Manager',designation:'Nurse Manager',department:'Nursing',nurse_mode_on:true,
 __foodVendor:{read:true},__kitchen:{read:true},__paymentsTrial:{full:true},
 __dutyContext:{additional_duties:[{covering_role:'STD'}],can_manage:true}};
const nurse=api.toNurseView(sobana);
assert.equal(nurse.role,'Nurse');
assert.equal(nurse.id,sobana.id);
assert.equal(nurse.designation,'Staff Nurse');
assert.equal(nurse.__dutyContext,undefined);
assert.equal(nurse.__foodVendor,undefined);
const regular={id:'nurse-fixture',role:'Nurse',designation:'Staff Nurse',department:'Nursing'};
const pages=p=>Array.from(api.allowedPagesForProfile(p)).sort();
assert.deepEqual(pages(nurse),pages(regular),'Switched Manager must receive the complete normal Nurse page set');
const required=['Charge Approvals','Approval Requests','Raise Indent','Received Indents / Used Balance','Medicines','Vital Signs','Daily Care','Shift Handover','Outside Samara Nursing Procedures'];
const allowed=api.allowedPagesForProfile(nurse);
const menuPages=api.sectionsFor(allowed,nurse.role).flatMap(s=>Array.from(s.items));
for(const page of required){assert.ok(allowed.includes(page),page+' must be authorised');assert.ok(menuPages.includes(page),page+' must appear in the menu');}
assert.equal(api.nurseModeOn(sobana),true);
assert.equal(api.nurseModeOn({...sobana,nurse_mode_on:false}),false);
assert.equal(api.nurseModeOn({...sobana,nurse_mode_on:undefined}),false,'A missing server flag must not activate Nurse mode');
assert.equal(api.nurseModeOn({...regular,nurse_mode_on:true}),false);
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...(tree.children||[]).flatMap(nodes)];}
for(const profile of [nurse,regular]){
 const opened=[];
 const tree=api.NursingMobileQuickActions({profile,page:'Clinical Dashboard',onNavigate:p=>opened.push(p)});
 const workflow=nodes(tree).find(n=>n.props.className==='nurse-workflow-actions');
 assert.ok(workflow,'Nurse task buttons must be present on the dashboard');
 assert.equal(workflow.props.style.display,'grid','Workflow buttons must be visible on desktop as well as mobile');
 const buttons=nodes(workflow).filter(n=>n.type==='button');
 assert.equal(buttons.length,4);
 buttons.forEach(button=>button.props.onClick());
 assert.deepEqual(opened,['Charge Approvals','Approval Requests','Raise Indent','Received Indents / Used Balance']);
}
for(const role of ['Manager','Caregiver']){
 const tree=api.NursingMobileQuickActions({profile:{role,designation:role==='Manager'?'Nurse Manager':'Caregiver'},page:'Clinical Dashboard',onNavigate(){}});
 assert.ok(!nodes(tree).some(n=>n.props.className==='nurse-workflow-actions'),'No new Nurse controls for '+role);
}
assert.equal(api.NursingMobileQuickActions({profile:nurse,page:'Medicines',onNavigate(){}}),null);
const switchSource=shell.slice(shell.indexOf('    const applyNurseMode='),shell.indexOf('    const viewProfile='));
async function switchCase(reply,turnOn,expectSuccess){
 let current={...sobana,nurse_mode_on:!turnOn};const alerts=[];
 const c=vm.createContext({realProfile:current,client:{rpc:async(name,args)=>{assert.equal(name,'set_nurse_mode');assert.equal(args.p_on,turnOn);return reply;}},
 window:{alert:m=>alerts.push(m)},setProfile:fn=>{current=fn(current);}});
 vm.runInContext(switchSource+'\nthis.apply=applyNurseMode;',c);
 assert.equal(await c.apply(turnOn),expectSuccess);
 assert.equal(current.nurse_mode_on,expectSuccess?turnOn:!turnOn);
 assert.equal(current.role,'Manager','Original Manager identity must be preserved');
 assert.equal(alerts.length,expectSuccess?0:1);
}
(async()=>{
 await switchCase({data:{success:true,nurse_mode_on:true}},true,true);
 await switchCase({data:{success:true,nurse_mode_on:false}},false,true);
 await switchCase({error:{code:'PGRST202',message:'set_nurse_mode missing'}},true,false);
 await switchCase({data:{success:true,nurse_mode_on:false}},true,false);
 await switchCase({data:null},true,false);
 console.log('PASS: full Nurse page/menu parity, visible charge/indent controls, navigation and server-confirmed switching; Manager/Caregiver boundaries preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
