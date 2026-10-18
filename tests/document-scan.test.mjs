// 2.18.0 live Document scan: prescription → Admission rows, ID card → Guest fields, supplier bill → stock lines.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=f=>fs.readFileSync(new URL('../src/app/'+f,import.meta.url),'utf8');
const ctx={window:{SamaraGuestAddress:{COUNTRIES:['India','Bangladesh'],INDIAN_STATES:['Kerala','Tamil Nadu']},SamaraTNDistrictTaluks:{'Chennai':['Ambattur','Mylapore'],'Pudukkottai':['Aranthangi','Pudukkottai']}},
  h:()=>null,React:{},client:{},todayISOIndia:()=>'2026-10-18',console,URL,Date,
  STORE_UNITS:['Nos','Pieces','Pairs','Sets','Packs','Packets','Boxes','Rolls','Bottles','Strips','Tablets','Capsules','Vials','Ampoules','Tubes','Sachets','Inhalers','Kg','Grams','Litres','ml','Dozens','Cans','Cylinders'],
  blankMedicine:()=>({prescribed_by_doctor:'',medicine_name:'',strength:'',dose:'',route:'Oral',food_instruction:'After food',times:'08:00',frequency:'Once Daily (OD)',duration:'Long Term',custom_duration_days:'',start_date:'2026-10-18',effective_from:'',special_instruction:'',is_locked:false})};
vm.createContext(ctx);
vm.runInContext(src('shared/05-document-scan.js')+'\n'+src('stores/store-bill-scan.js')+'\nthis.S=SAMARA_SCAN;this.billLines=billLines;this.billProblems=billProblems;this.billMatch=billMatch;',ctx);
const {S}=ctx;
const rx=meds=>({results:[{doctor_name:'Dr. R. Kumar',prescription_date:'12-10-2026',medicines:meds,__page:1}],failed:[],pages:1});

test('BD after food → 9 AM and 9 PM, strength composed, row locked and unverified',()=>{
  const {rows}=S.prescriptionToMedicines(rx([{medicine_name:'Metformin',strength_amount:'500',strength_unit:'mg',dose_pattern:'1-0-1',food_instruction:'After food',route:'Oral',duration:'30 Days',confidence:'high',raw_text:'Tab Metformin 500mg 1-0-1 AF x 30d'}]));
  const r=rows[0];
  assert.equal(r.frequency,'Twice Daily (BD)');assert.equal(r.times,'09:00, 21:00');assert.equal(r.strength,'500 mg');
  assert.equal(r.prescribed_by_doctor,'Dr. R. Kumar');assert.equal(r.duration,'30 Days');assert.equal(r.is_locked,true);
  assert.equal(r.scan.verified,false);assert.equal(r.scan.raw,'Tab Metformin 500mg 1-0-1 AF x 30d');assert.equal(r.scan.flags.length,0);
});
test('0-0-1 without bedtime words = once daily 9 PM (not HS)',()=>{
  const {rows}=S.prescriptionToMedicines(rx([{medicine_name:'Atorvastatin',strength_amount:'10',strength_unit:'mg',frequency:'HS',dose_pattern:'0-0-1',food_instruction:'After food'}]));
  assert.equal(rows[0].frequency,'Once Daily (OD)');assert.equal(rows[0].times,'21:00');
});
test('Nasal route kept; missing route / food / duration flagged',()=>{
  const {rows}=S.prescriptionToMedicines(rx([{medicine_name:'Budecort',strength_amount:'200',strength_unit:'mcg',route:'Nasal',dose_pattern:'1-0-1'},{medicine_name:'Pantop',strength_amount:'40',strength_unit:'mg',dose_pattern:'1-0-0'}]));
  assert.equal(rows[0].route,'Nasal');
  assert.ok(rows[1].scan.flags.includes('route'));assert.ok(rows[1].scan.flags.includes('food_instruction'));assert.ok(rows[1].scan.flags.includes('duration'));
});
test('Fixed insulin units pre-filled; sliding scale left for staff with the scale noted',()=>{
  const {rows}=S.prescriptionToMedicines(rx([{medicine_name:'Lantus',dose_per_time:'12 units',frequency:'HS',raw_text:'Inj Lantus 12 units at bedtime'},{medicine_name:'Actrapid',raw_text:'Inj Actrapid as per sliding scale',dose_pattern:'1-1-1'}]));
  assert.equal(rows[0].strength,'12 units');assert.equal(rows[0].times,'22:00');assert.ok(rows[0].scan.flags.includes('strength'));
  assert.equal(rows[1].strength,'');assert.match(rows[1].special_instruction,/Dose varies/);assert.ok(rows[1].scan.flags.includes('strength'));
});
test('No doctor printed → flagged; duplicate of an existing medicine flagged',()=>{
  const reading={results:[{doctor_name:'',medicines:[{medicine_name:'Dolo 650',strength_amount:'650',strength_unit:'mg',dose_pattern:'1-1-1'}],__page:1}],failed:[],pages:1};
  const {rows}=S.prescriptionToMedicines(reading,['Dolo 650 mg']);
  assert.ok(rows[0].scan.flags.includes('prescribed_by_doctor'));assert.ok(rows[0].scan.flags.includes('medicine_name'));
});
test('ID card: name upper-case, DOB to ISO, Tamil Nadu district / taluk matched to the lists',()=>{
  const g=S.idToGuest({full_name:'Lakshmi Raman',date_of_birth:'05-03-1948',gender:'Female',document_type:'Aadhaar',state:'TamilNadu',district:'PUDUKKOTTAI',taluk:'Aranthangi',village_town:'Aranthangi',pincode:'614 616',id_last4:'4821',relation_type:'W/O',relation_name:'Raman'});
  assert.equal(g.fields.full_name,'LAKSHMI RAMAN');assert.equal(g.fields.date_of_birth,'1948-03-05');assert.equal(g.fields.country,'India');
  assert.equal(g.fields.state,'Tamil Nadu');assert.equal(g.fields.district,'Pudukkottai');assert.equal(g.fields.taluk,'Aranthangi');assert.equal(g.fields.pincode,'614616');
  assert.equal(g.relation,'W/O Raman');assert.equal(g.last4,'4821');
});
test('ID card: only year of birth → approximate age with a note; unknown district asks to choose',()=>{
  const g=S.idToGuest({full_name:'X',year_of_birth:'1950',country:'India',state:'Tamil Nadu',district:'Nowhere'});
  assert.equal(g.fields.age,String(new Date().getFullYear()-1950));assert.equal(g.fields.district,undefined);assert.ok(g.notes.some(n=>/District "Nowhere"/.test(n)));
});
const items=[{id:'i1',item_code:'CON-0001',item_name:'Sterile Gloves (6)',item_category:'Consumables',unit:'Pairs',active:true},{id:'i2',item_code:'PHA-0010',item_name:'Dolo 650',item_category:'Pharmacy',unit:'Tablets',active:true}];
test('Bill: exact match takes the Stores section and unit; size 6½ is not gloves 6; new item stays new',()=>{
  const ls=ctx.billLines({items:[{item_name:'DOLO 650',quantity:'2.00',unit:'strip',pack_size:"15's",unit_cost:'30'},{item_name:'Sterile Gloves 6 1/2',quantity:'100.00',unit:'Each'},{item_name:'Jomed Nebulizer Mouthpiece Kit',quantity:'1',unit_cost:'57.14',item_category:'Consumables'}]},items);
  assert.equal(ls[0].match.kind,'exact');assert.equal(ls[0].section,'Pharmacy');assert.equal(ls[0].unit,'Tablets');assert.equal(ls[0].quantity,'2');assert.match(ls[0].notes.unit,/Stores keeps/);
  assert.notEqual(ls[1].match.kind,'exact');assert.equal(ls[1].unit,'Nos');assert.equal(ls[1].quantity,'100');
  assert.equal(ls[2].match.kind,'none');assert.ok(ctx.billProblems(ls[2]).includes('Unit'));
});
test('Bill: MM/YY expiry → last day of month (flagged); Biomedical section not accepted',()=>{
  const ls=ctx.billLines({items:[{item_name:'Cotton Roll',quantity:'5',unit:'rolls',expiry_month:'2027-02',expiry_text:'02/27'},{item_name:'BP Apparatus',quantity:'1',unit:'Nos',item_category:'Biomedical Equipment'}]},items);
  assert.equal(ls[0].expiry_date,'2027-02-28');assert.ok(ls[0].flags.includes('expiry_date'));
  assert.equal(ls[1].section,'');assert.match(ls[1].notes.section,/Biomedical Equipment register/);
});
test('ID card: Tamil spellings of districts match the list (Thoothukkudi, Tuticorin)',()=>{
  const map={'Thoothukudi':['Srivaikuntam','Thoothukudi'],'Chennai':['Ambattur']};
  const saved=ctx.window.SamaraTNDistrictTaluks;ctx.window.SamaraTNDistrictTaluks=map;
  try{
    assert.equal(S.idToGuest({full_name:'A',state:'Tamil Nadu',district:'Thoothukkudi',taluk:'Srivaikundam'}).fields.district,'Thoothukudi');
    assert.equal(S.idToGuest({full_name:'A',state:'Tamil Nadu',district:'Thoothukkudi',taluk:'Srivaikundam'}).fields.taluk,'Srivaikuntam');
    assert.equal(S.idToGuest({full_name:'A',state:'Tamil Nadu',district:'Tuticorin'}).fields.district,'Thoothukudi');
  }finally{ctx.window.SamaraTNDistrictTaluks=saved}
});
