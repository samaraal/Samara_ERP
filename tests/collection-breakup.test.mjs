import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync('src/app/accounts/03-accounts-dashboard.js','utf8');
const ctx=vm.createContext({Intl,Date,Map});vm.runInContext(source.slice(0,source.indexOf('  async function loadAccountsBillingHistory')),ctx);
let id=0;const row=(type,amount,category='Other',patient='p',date='2026-10-01')=>({id:String(++id),patient_id:patient,transaction_type:type,amount,category,transaction_date:date+'T12:00:00+05:30'});
const calc=rows=>ctx.collectionBreakup(rows,'2026-10','2026-10-16');
test('FIFO pays older charges before current month, advances carry forward',()=>{const r=calc([row('Advance',150,'Other','p','2026-09-01'),row('Charge',100,'Room Charges','p','2026-09-02'),row('Charge',100,'Medicine Charges')]);assert.equal(r.totals.realised,50);assert.equal(r.totals.pending,50)});
test('refunds reduce receipts; separate patients cannot subsidise balances',()=>{const r=calc([row('Charge',100),row('Payment',100),row('Refund',40),row('Advance',500,'Other','q')]);assert.equal(r.totals.realised,60);assert.equal(r.totals.pending,40);assert.equal(r.advances,500)});
test('discounts prorate with exact cent reconciliation',()=>{const r=calc([row('Charge',1,'Room Charges'),row('Charge',2,'Consumables'),row('Discount',1),row('Payment',1)]);assert.equal(r.totals.total,2);assert.equal(r.totals.realised,1);assert.equal(r.totals.pending,1)});
test('outside invoices remain separate and future entries excluded',()=>{const r=calc([row('Charge',100,'Materials','outside:1'),row('Payment',150,'Other','outside:2'),row('Charge',900,'Room Charges','p','2026-10-17')]);assert.equal(r.totals.pending,100);assert.equal(r.categories.find(x=>x.name==='Samara Outside Nursing Procedures').total,100)});
test('overpayment remains an advance and zero charges are safe',()=>{const r=calc([row('Charge',50),row('Discount',100),row('Payment',100)]);assert.equal(r.totals.total,0);assert.equal(r.advances,100)});
test('India date boundary includes late UTC posting on next day',()=>{const r=calc([{...row('Charge',100),transaction_date:'2026-09-30T20:00:00Z'}]);assert.equal(r.totals.total,100)});

test('expanded dashboard and category drilldown render without errors',()=>{
 let call=0;const data={loading:false,transactions:[row('Charge',10,'Room Charges')],patients:[],requests:[],discharges:[],outside:{}};
 const sandbox=vm.createContext({Intl,Date,Map,todayISOIndia:()=> '2026-10-16',React:{Fragment:'fragment',useEffect:()=>{},useState:()=>[ [data,true,'2026-10','Room Rent'][call++],()=>{}]},h:(tag,props,...children)=>({tag,props,children}),Section:'section'});
 vm.runInContext(source,sandbox);const tree=sandbox.AccountsDashboard({profile:{role:'Accounts'},onNavigate:()=>{}});const str=JSON.stringify(tree);assert.match(str,/Room Rent — charge details/);assert.match(str,/Total Charges/);assert.match(str,/₹10/);
});
