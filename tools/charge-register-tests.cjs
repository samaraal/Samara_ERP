const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/app/accounts/09-clinical-charges.js'),'utf8');
const component=source.slice(source.indexOf('  function ClinicalCharges('));
const alpha=source.slice(0,source.indexOf('  function ChargeMasterPage('));
const today='2026-10-28';
const people=[
  {id:'p1',patient_id:'SAM-001',full_name:'Alpha Resident',is_active:true},
  {id:'p2',patient_id:'SAM-002',full_name:'Beta Resident',is_active:true},
  {id:'p3',patient_id:'SAM-003',full_name:'Discharged Resident',is_active:false}
];
const fixtures=[
  {id:'c1',patient_id:'p1',category:'Consumables',service_name:'Gloves',charge_item_code:'CON-1',charge_date:today,quantity:2,requested_amount:20,approval_status:'Pending',raised_by:'n1'},
  {id:'c2',patient_id:'p2',category:'Nursing Procedures',service_name:'Dressing',charge_item_code:'NUR-1',charge_date:today,requested_amount:100,approved_amount:100,approval_status:'Approved',decision_date:'2026-10-28T06:00:00Z',raised_by:'n2'},
  {id:'c3',patient_id:'p3',category:'Physiotherapy',service_name:'Walking Training',charge_item_code:'PHY-1',charge_date:'2026-10-20',requested_amount:300,approved_amount:250,approval_status:'Partially Approved',decision_date:'2026-10-27T20:00:00Z',raised_by:'n1'},
  {id:'c4',patient_id:'p1',category:'Nursing Procedures',service_name:'Dressing',charge_item_code:'NUR-2',charge_date:'2026-10-27',requested_amount:200,approved_amount:200,approval_status:'Approved',approved_at:'2026-10-27T18:00:00Z',raised_by:'n1'},
  {id:'c5',patient_id:'p2',category:'Consumables',service_name:'Gloves',charge_item_code:'CON-1',charge_date:'2026-10-01',requested_amount:10,approved_amount:0,approval_status:'Rejected',raised_by:'n2'},
  {id:'c6',patient_id:'p1',category:'Physiotherapy',service_name:'Walking Training',charge_item_code:'PHY-1',charge_date:'2026-09-30',requested_amount:300,approved_amount:300,approval_status:'Approved',approved_at:'2026-10-28T06:00:00Z',raised_by:'n1'},
  {id:'c7',patient_id:'p1',category:'Nursing Procedures',service_name:'Dressing',charge_item_code:'NUR-1',charge_date:today,requested_amount:100,approved_amount:100,approval_status:'Approved',raised_by:'n1'}
];
const indianDate=value=>value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata'}).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?value+'T12:00:00Z':value)):'—';
function createHarness({role='Admin',requests=fixtures,storeItems=[],fail=false}={}){
  const states=[],effects=[],pending=[];let stateIndex=0,effectIndex=0,dirty=false,tree;
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(x=>x!==false&&x!==null&&x!==undefined)});
  const React={Fragment:'Fragment',useState(initial){const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;dirty=true}]},useMemo:fn=>fn(),useEffect(fn,deps){const i=effectIndex++;if(!effects[i]||JSON.stringify(effects[i])!==JSON.stringify(deps)){effects[i]=deps;pending.push(fn)}},useRef:value=>({current:value})};
  const tables={bill_charge_requests:requests,charge_tariff_master:[],consumable_store_items:storeItems,diagnostic_services:[],charge_category_settings:[]};
  const ranges=[];
  // A chainable, read-only Supabase query double; pagination uses inclusive range ends.
  function from(table){let start=0,end=Infinity;const checks=[];const chain={then(resolve){return Promise.resolve().then(()=>resolve(fail&&table==='bill_charge_requests'?{error:{message:'Test network failure'}}:{data:(tables[table]||[]).filter(r=>checks.every(fn=>fn(r))).slice(start,end+1),error:null}))},range(a,b){start=a;end=b;ranges.push([a,b]);return chain},eq(k,v){checks.push(r=>r[k]===v);return chain},in(k,v){checks.push(r=>v.includes(r[k]));return chain}};for(const k of ['select','order','limit','neq','gte'])chain[k]=()=>chain;for(const k of ['insert','update','delete','upsert'])chain[k]=()=>assert.fail('Unexpected data mutation');return chain}
  const client={auth:{getUser:async()=>({data:{user:{id:'n1'}}})},from,rpc:()=>from('__empty'),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){}};
  const field=(label,value,onChange,options,type='text')=>h('div',{className:'field'},h('label',null,label),h(options?'select':'input',{value,type,onChange:e=>onChange(e.target.value)},...(options||[]).map(v=>h('option',{value:v},v))));
  const context={React,h,client,console,Intl,Date,Set,Map,JSON,Number,String,Math,Promise,
    STORE_CHARGE_CATEGORIES:['Consumables','Pharmacy','Pharmacy & Basic Supplies'],STORE_SECTION_NAMES:['Consumables','Pharmacy'],
    usePharmacyStock:()=>({items:[]}),usePatients:()=>[people.filter(p=>p.is_active)],usePatientLookup:()=>({pFor:id=>people.find(p=>p.id===id)||{},pLabel:id=>people.find(p=>p.id===id)?.full_name||'Unknown'}),
    useDashboardView:()=>{const [view,setView]=React.useState('');return {view,openView:setView,backToDashboard:()=>setView('')}},
    todayISOIndia:()=>today,localDateTimeValue:()=>today+'T12:00',formalName:p=>p?.full_name||'',formatDateIN:indianDate,formatDateTimeIN:indianDate,fmt:indianDate,
    addDaysISO:(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},
    mondayOfWeek:day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)},
    samaraFriendlyError:e=>e.message||String(e),ensureAccountsWorkspaceStyle(){},showSamaraActionToast(){},outsideFillMissingFamilyLinks(){},
    Section:'Section',LogTable:'LogTable',ChargeMasterPage:'ChargeMasterPage',DashboardBackBar:'DashboardBackBar',ApplyFilterButton:'ApplyFilterButton',
    miniInput:(l,v,c,_required,t)=>field(l,v,c,null,t),miniSelect:(l,v,o,c)=>field(l,v,c,o),patientSelect:(p,v,c)=>field('Patient',v,c,p.map(x=>x.id)),
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
    window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){},getElementById:()=>null},sessionStorage:{getItem:()=>null},
  };
  vm.createContext(context);vm.runInContext(alpha+component,context);
  const render=()=>{stateIndex=0;effectIndex=0;dirty=false;tree=context.ClinicalCharges({profile:{role,id:'n1',full_name:'Nurse One'}});return tree};
  async function settle(){for(let i=0;i<12;i++){render();pending.splice(0).forEach(fn=>fn());await new Promise(setImmediate);if(!dirty&&!pending.length)break}return tree}
  const nodes=(node=tree)=>typeof node!=='object'||!node?[]:[node,...node.children.flatMap(child=>nodes(child))];
  const text=node=>typeof node==='object'&&node?node.children.map(text).join(' '):String(node??'');
  const button=label=>nodes().find(n=>n.type==='button'&&text(n.children[0])===label);
  function change(label,value){const box=nodes().find(n=>n.type==='div'&&n.props.className==='field'&&text(n.children[0])===label);assert.ok(box,`Missing field: ${label}`);const input=box.children.find(n=>n.type==='select'||n.type==='input');input.props.onChange({target:{value}});render()}
  const cards=()=>nodes().filter(n=>n.type==='article'&&n.props.className==='card samara-charge-card');
  const ids=()=>cards().map(n=>n.props.id.replace('charge-request-',''));
  const stat=label=>{const n=nodes().find(n=>['button','div'].includes(n.type)&&n.props.className==='card stat'&&text(n.children[0])===label);return n?text(n.children[1]):null};
  return {settle,render,nodes,text,button,change,cards,ids,stat,ranges,get tree(){return tree},apply(){nodes().find(n=>n.type==='ApplyFilterButton').props.onApply();return settle()}};
}
(async()=>{
  const app=createHarness();await app.settle();assert.deepEqual(app.ids(),['c1']);
  assert.equal(app.nodes().some(n=>n.type==='ChargeMasterPage'),false);
  for(const [label,expected] of [['Charges Raised',fixtures.map(x=>x.id)],['Today’s Entries',['c1','c2','c7']],['Pending Approval',['c1']],['Returned by Accounts',['c5']],['Approved Today',['c2','c3','c6','c7']],['Approved Value Today',['c2','c3','c6','c7']]]){
    app.change('Patient','p2');app.change('Category','Consumables');await app.apply();
    app.button(label).props.onClick();await app.settle();assert.deepEqual(app.ids(),expected,label+' must clear stale filters');assert.equal(Number(app.stat('Matching Entries')),expected.length);
  }
  assert.equal(app.stat('Approved Value Today'),'₹750.00');assert.equal(app.stat('Total Approved Amount'),'₹750.00');
  app.change('Patient','p3');await app.apply();assert.deepEqual(app.ids(),['c3'],'patient filter must narrow approvals made today');
  app.button('Charges Raised').props.onClick();await app.settle();
  app.change('Patient','p1');app.change('Category','Nursing Procedures');
  app.change('Item / Service',JSON.stringify(['Nursing Procedures','NUR-1']));
  app.change('Period','Month');app.change('Month','2026-10');await app.apply();
  assert.deepEqual(app.ids(),['c7']);assert.equal(app.stat('Total Approved Amount'),'₹100.00');
  app.change('Category','Consumables');await app.apply();assert.deepEqual(app.ids(),['c1'],'category change clears incompatible item');
  app.button('Charges Raised').props.onClick();await app.settle();
  app.change('Period','Custom period');app.change('From date','2026-10-29');app.change('To date','2026-10-01');await app.apply();assert.deepEqual(app.ids(),[]);assert.ok(app.nodes().some(n=>n.props.role==='alert'));
  app.change('From date','2026-10-01');app.change('To date',today);await app.apply();assert.deepEqual(app.ids(),['c1','c2','c3','c4','c5','c7']);
  app.change('Period','This Week');await app.apply();assert.deepEqual(app.ids(),['c1','c2','c4','c7']);
  app.change('Period','Month');app.change('Month','2026-99');await app.apply();assert.deepEqual(app.ids(),[],'invalid month must not crash');
  app.button('Charges Raised').props.onClick();await app.settle();
  assert.ok(app.nodes().some(n=>n.type==='option'&&app.text(n).includes('Discharged')));
  app.cards()[0].props.onClick();await app.settle();assert.ok(app.nodes().some(n=>n.props.role==='dialog'));assert.ok(app.text(app.tree).includes('Alpha Resident'));
  app.nodes().find(n=>n.props['aria-label']==='Close details').props.onClick();await app.settle();
  app.button('Charge Master').props.onClick();await app.settle();assert.ok(app.nodes().some(n=>n.type==='ChargeMasterPage'));assert.equal(app.cards().length,0);app.nodes().find(n=>n.type==='DashboardBackBar').props.onBack();await app.settle();assert.ok(app.button('Charges Raised'));
  const nurse=createHarness({role:'Nurse'});await nurse.settle();assert.equal(nurse.button('Charge Master'),undefined);assert.equal(nurse.button('Approved Value Today'),undefined);nurse.button('Charges Raised').props.onClick();await nurse.settle();assert.deepEqual(nurse.ids(),['c1','c3','c4','c6','c7']);assert.ok(!nurse.text(nurse.tree).includes('₹'));
  const accounts=createHarness({role:'Accounts'});await accounts.settle();assert.equal(accounts.button('Charge Master'),undefined);assert.ok(accounts.nodes().some(n=>n.props['data-charge-approve']));
  const error=createHarness({fail:true});error.render();assert.ok(error.text(error.tree).includes('Loading charges'));await error.settle();assert.equal(error.stat('Charges Raised'),'—');assert.ok(error.nodes().some(n=>n.props.role==='alert'));assert.ok(error.button('Charges Raised').props.disabled);
  const empty=createHarness({requests:[]});await empty.settle();assert.equal(empty.stat('Charges Raised'),'0');assert.ok(empty.text(empty.tree).includes('No charges match'));
  const many=createHarness({requests:Array.from({length:1101},(_,i)=>({...fixtures[0],id:'page-'+i}))});await many.settle();many.button('Charges Raised').props.onClick();await many.settle();assert.equal(many.cards().length,1101);assert.deepEqual(many.ranges.slice(0,3),[[0,499],[500,999],[1000,1499]]);
  // Reproduce the reported screen: four priced requests, fifteen unpriced nursing
  // requests, and four older services approved today. Never invent request prices.
  const auditRequests=[
    ...Array.from({length:4},(_,i)=>({...fixtures[0],id:'physio-'+i,category:'Physiotherapy',requested_amount:800,estimated_amount:800,approved_amount:800,approval_status:'Approved',decision_date:today+'T06:00:00Z'})),
    ...Array.from({length:15},(_,i)=>({...fixtures[0],id:'nursing-'+i,category:'Nursing Procedures',requested_amount:null,estimated_amount:null,approved_amount:i<5?100:i<9?25:100,approval_status:'Approved',decision_date:today+'T06:00:00Z'})),
    ...[650,20,4,11].map((amount,i)=>({...fixtures[0],id:'older-'+i,charge_date:'2026-10-27',requested_amount:null,estimated_amount:null,approved_amount:amount,approval_status:'Approved',decision_date:today+'T06:00:00Z'}))
  ];
  const audit=createHarness({requests:auditRequests});await audit.settle();audit.button('Approved Value Today').props.onClick();await audit.settle();
  assert.equal(audit.stat('Matching Entries'),'23');assert.equal(audit.stat('Total Approved Amount'),'₹5,085.00');assert.equal(audit.stat('Approved Value Today'),'₹5,085.00');assert.equal(audit.stat('Request Amount Recorded'),'₹3,200.00');
  assert.ok(audit.text(audit.tree).includes('4 of 23 requests included an amount; 19 had no amount entered'));
  audit.change('Period','Day');audit.change('Date',today);await audit.apply();assert.equal(audit.stat('Total Approved Amount'),'₹5,085.00','approval-day filter must retain older services approved that day');
  audit.change('Date basis','Service date');await audit.apply();assert.equal(audit.stat('Matching Entries'),'19');assert.equal(audit.stat('Total Approved Amount'),'₹4,400.00');assert.equal(audit.stat('Request Amount Recorded'),'₹3,200.00');assert.ok(audit.text(audit.tree).includes('15 had no amount entered'));
  audit.change('Date','2026-10-27');await audit.apply();assert.equal(audit.stat('Matching Entries'),'4');assert.equal(audit.stat('Total Approved Amount'),'₹685.00');assert.equal(audit.stat('Request Amount Recorded'),'Not entered');
  audit.change('Date basis','Approval date');await audit.apply();assert.equal(audit.stat('Matching Entries'),'0','services on 27th were approved on 28th');
  const historic=createHarness({requests:[{...fixtures[0],approval_status:'Approved',approved_amount:20}],storeItems:[{id:'s1',item_code:'CON-1',item_name:'Gloves',charge_rate:999,active:true,item_category:'Consumables'}]});await historic.settle();historic.button('Charges Raised').props.onClick();await historic.settle();assert.equal(historic.stat('Request Amount Recorded'),'₹20.00','later master rates must not rewrite the displayed original request');
  const zero=createHarness({requests:[{...fixtures[0],requested_amount:0,estimated_amount:50,approval_status:'Approved',approved_amount:0,final_amount:100}]});await zero.settle();zero.button('Charges Raised').props.onClick();await zero.settle();assert.equal(zero.stat('Request Amount Recorded'),'₹0.00');assert.equal(zero.stat('Total Approved Amount'),'₹0.00');
  const undecided=createHarness({requests:[{...fixtures[0],approved_amount:999},{...fixtures[0],id:'returned',approval_status:'Rejected',approved_amount:500}]});await undecided.settle();undecided.button('Charges Raised').props.onClick();await undecided.settle();assert.equal(undecided.stat('Total Approved Amount'),'₹0.00','only actual approvals contribute to approved totals');
  console.log('PASS: all summary drill-downs; matching counts/amounts; combined patient/category/item/date filters; India-time approvals; discharged patients; detail modal; Charge Master navigation; Nurse/Accounts permissions; loading/error/empty states; complete pagination.');
})().catch(error=>{console.error(error);process.exitCode=1});
