const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'src/app/rooms/rooms-beds.js'),'utf8');
const save=source.slice(source.indexOf('    async function saveRoom(e){'),source.indexOf('    function openTransfer(row){'));
const ledger=fs.readFileSync(path.join(root,'src/app/accounts/06-patient-ledger.js'),'utf8');
const calls=[],messages=[];
const context=vm.createContext({
 canManage:true,busy:false,editing:{id:'bed-109-b'},rows:[],
 form:{room_no:'109',bed_no:'B',room_type:'Triple Sharing',room_daily_rate:'3000',nursing_daily_rate:'0',special_nurse_daily_rate:'0',status:'Occupied',effective_from:'2026-09-01',tariff_reason:'Agreed rate',tariff_request_id:'fixed-request'},
 patientFor:()=>({id:'resident'}),setBusy(){},setMsg:m=>messages.push(m),setShow(){},showToast(){},load:async()=>{},
 todayISOIndia:()=> '2026-10-01',formatDateIN:x=>x,Event:class{constructor(type){this.type=type;}},window:{dispatchEvent:e=>calls.push(['event',e.type])},
 client:{rpc:async(name,payload)=>{calls.push([name,payload]);return {data:{success:true,entries_posted:2,patients_affected:1}};},from:()=>assert.fail('Editing must use the atomic server RPC')}
});
vm.runInContext(save,context);
vm.runInContext(ledger.slice(0,ledger.indexOf('  function PatientLedgerView(')),context);
(async()=>{
 await context.saveRoom({preventDefault(){}});
 assert.equal(calls[0][0],'save_room_tariff');assert.equal(calls[0][1].p_effective_from,'2026-09-01');
 assert.equal(calls[0][1].p_room.nursing_daily_rate,0);assert.equal(calls[0][1].p_request_id,'fixed-request');
 assert.equal(calls[1][1],'samara-refresh-charges');assert.equal(messages.at(-1),'');
 calls.length=0;context.form.effective_from='2026-10-02';await context.saveRoom({preventDefault(){}});
 assert.equal(calls.length,0);assert.match(messages.at(-1),/today or earlier/);
 context.form.effective_from='2026-09-01';context.client.rpc=async()=>({error:{code:'PGRST202'}});
 await context.saveRoom({preventDefault(){}});assert.match(messages.at(-1),/182_room_tariff_effective_dates.sql/);
 const original={source_key:'ROOM:resident:2026-09-01',amount:3200};
 const adjusted=context.accommodationChargeWithAdjustments(original,[
 {tariff_original_source_key:original.source_key,transaction_type:'Discount',amount:200},
 {tariff_original_source_key:original.source_key,transaction_type:'Charge',amount:100},
 {tariff_original_source_key:'ROOM:other:2026-09-01',transaction_type:'Charge',amount:999},
 {transaction_type:'Payment',amount:2000}
 ]);
 assert.equal(adjusted.amount,3100);assert.equal(original.amount,3200);
 const field=source.slice(source.indexOf("'Effective from'"),source.indexOf("'Reason for tariff change'"));
 assert.ok(field.includes('max:todayISOIndia()'));assert.ok(!field.includes('min:'));
 console.log('PASS: backdated form submission, atomic RPC, stable retry ID, zero rates, future-date validation, missing-migration message, accounts refresh, and adjusted ledger calculation.');
})().catch(e=>{console.error(e);process.exitCode=1});
