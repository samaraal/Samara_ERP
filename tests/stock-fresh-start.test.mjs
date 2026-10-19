// 2.18.37 Stock fresh start: bill MRP vs Charge Master rate note, Admin / Director check.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=f=>fs.readFileSync(new URL('../src/app/'+f,import.meta.url),'utf8');
const ctx={window:{},h:()=>null,React:{},client:{},console,URL,Date,STORE_UNITS:['Nos','Tablets','Bottles'],STORE_SECTION_NAMES:['Consumables','Pharmacy']};
vm.createContext(ctx);
vm.runInContext(src('stores/store-bill-scan.js')+'\n'+src('stores/stock-fresh-start.js')+'\nthis.gap=billMrpGap;this.admin=isStoreAdminDirector;this.secs=FRESH_START_SECTIONS;',ctx);

test('MRP equal to the Charge Master rate → nothing to review',()=>{
  assert.equal(ctx.gap({mrp:'250',match:{kind:'exact',item:{charge_rate:250,unit:'Bottles'}}}),'');
});
test('MRP different → note with both rates; Charge Master rate is not changed here',()=>{
  assert.match(ctx.gap({mrp:'285',pack_size:'1 btl',match:{kind:'exact',item:{charge_rate:250,unit:'Bottles'}}}),/Bill MRP ₹285\.00 per 1 btl · Charge Master ₹250\.00 per Bottles/);
});
test('New item or item without a rate → listed for Admin / Director; no MRP on the bill → nothing',()=>{
  assert.match(ctx.gap({mrp:'30',match:{kind:'none'}}),/NEW item/);
  assert.match(ctx.gap({mrp:'12',match:{kind:'exact',item:{charge_rate:0}}}),/no rate yet/);
  assert.equal(ctx.gap({mrp:'',match:{kind:'none'}}),'');
});
test('Only Admin / Director may reset; fresh start covers Pharmacy and Consumables only',()=>{
  assert.equal(ctx.admin({role:'Admin'}),true);
  assert.equal(ctx.admin({role:'Manager',designation:'Director'}),true);
  assert.equal(ctx.admin({role:'Manager',designation:'Nursing Manager'}),false);
  assert.deepEqual([...ctx.secs],['Pharmacy','Consumables']);
});
