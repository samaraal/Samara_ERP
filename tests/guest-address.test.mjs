// 2.16.45 Guest address / phone kit (guest-address.js) and the Spot Assessment rules that use it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
function load(){
  const window={SamaraTNDistrictTaluks:{Chennai:['Egmore','Mylapore'],Pudukkottai:['Aranthangi']}};
  vm.runInNewContext(read('guest-address.js'),{window});
  vm.runInNewContext(read('spot-assessment.js'),{window});
  return {K:window.SamaraGuestAddress,S:window.SamaraSpotAssessmentModel};
}
const {K,S}=load();

test('Country: old records are India; Bangladesh division / written country are recognised',()=>{
  assert.equal(K.countryOf({}),'India');
  assert.equal(K.countryOf({state:'Tamil Nadu',district:'Chennai'}),'India');
  assert.equal(K.countryOf({state:'Dhaka Division'}),'Bangladesh');
  assert.equal(K.countryOf({address:'12, Road 5\nDhanmondi, Dhaka, 1209, Bangladesh'}),'Bangladesh');
  assert.equal(K.countryOf({country:'Nepal',state:'Bagmati'}),'Nepal');
});
test('Bangladesh has 8 divisions and 64 districts',()=>{
  assert.equal(Object.keys(K.BANGLADESH).length,8);
  assert.equal(Object.values(K.BANGLADESH).flat().length,64);
  assert.equal(K.INDIAN_STATES.length,36);
});
test('Address text: India unchanged, other countries end with the country',()=>{
  const india={house_no:'5',street_name:'Anna Salai',village_town:'Chennai',taluk:'Egmore',district:'Chennai',state:'Tamil Nadu',pincode:'600008'};
  assert.equal(K.composeAddress(india),'5, Anna Salai\nChennai, Egmore, Chennai, Tamil Nadu, 600008');
  const bd={country:'Bangladesh',state:'Dhaka Division',district:'Gazipur',taluk:'Kaliakair',village_town:'Mouchak',pincode:'1751'};
  assert.equal(K.composeAddress(bd),'Mouchak, Kaliakair, Gazipur, Dhaka Division, 1751, Bangladesh');
  assert.equal(K.countryOf({address:K.composeAddress(bd)}),'Bangladesh'); // works even before SQL 220
});
test('Address checks per country',()=>{
  assert.match(K.addressProblem({country:'India',state:'Kerala',village_town:'Kochi',street_name:'MG Road',house_no:'4'}),/District/);
  assert.equal(K.addressProblem({country:'India',state:'Kerala',district:'Ernakulam',village_town:'Kochi',street_name:'MG Road',house_no:'4',pincode:'682011'}),'');
  assert.match(K.addressProblem({country:'India',state:'Kerala',district:'Ernakulam',village_town:'Kochi',street_name:'MG Road',house_no:'4',pincode:'68201'}),/6 digits/);
  // Bangladesh: no street / house number needed; 4-digit postcode
  assert.equal(K.addressProblem({country:'Bangladesh',state:'Sylhet Division',district:'Sylhet',village_town:'Zindabazar',pincode:'3100'}),'');
  assert.match(K.addressProblem({country:'Bangladesh',state:'Sylhet Division',district:'Sylhet',village_town:'Zindabazar',pincode:'310000'}),/4 digits/);
  assert.match(K.addressProblem({country:'Other',village_town:'X'}),/Country/);
  assert.equal(K.addressProblem({country:'Bhutan',village_town:'Thimphu'}),'');
  assert.equal(K.cleanPin({country:'Bangladesh'},'12a345'),'1234');
});
test('ID document wording',()=>{
  assert.equal(K.idDocLabel({}),'Aadhaar / Identity Card');
  assert.equal(K.idDocLabel({country:'Bangladesh'}),'Passport / National ID card');
});
test('Phones: Indian 10 digits; Bangladesh keeps +880 and drops the leading 0',()=>{
  assert.equal(K.storedMobile('+91 9876543210'),'9876543210');
  assert.equal(K.storedMobile('9876543210'),'9876543210');
  assert.equal(K.storedMobile('+880 01712345678'),'+880 1712345678');
  assert.equal(K.phoneProblem('+880 01712345678','X'),'');
  assert.match(K.phoneProblem('+880 171234','X'),/10 digits/);
  assert.match(K.phoneProblem('+91 98765','X'),/10 digits/);
  assert.equal(K.phoneProblem('+977 9841234567','X'),'');
  assert.equal(K.dialOf('+880 1712345678'),'+880');
  assert.equal(K.localOf('+880 1712345678'),'1712345678');
  assert.equal(K.dialOf('9876543210'),'+91');
  assert.ok(K.samePhone('+91 9876543210','9876543210'));
  assert.ok(!K.samePhone('+880 1712345678','1712345678')); // same digits, different country = different phone
  assert.equal(K.dialForCountry('Bangladesh'),'+880');
});
test('Spot Assessment: name and relationship are separate; old "Ravi, son" splits',()=>{
  assert.deepEqual({...S.splitNameRelationship('Ravi, son')},{name:'Ravi',relationship:'Son'});
  assert.deepEqual({...S.splitNameRelationship('Fatema Begum (Daughter-in-law)')},{name:'Fatema Begum',relationship:'Daughter-in-law'});
  assert.deepEqual({...S.splitNameRelationship('Ravi Kumar')},{name:'Ravi Kumar',relationship:''});
  const keys=S.sections.flatMap(s=>s.fields.map(f=>f.key));
  assert.ok(keys.includes('consent_given_by_name')&&keys.includes('consent_given_by_relationship')&&!keys.includes('consent_given_by'));
  assert.ok(keys.includes('title')&&keys.includes('_address'));
  assert.ok(S.relationships.includes('Other'));
});
test('Spot Assessment completion: Bangladesh address and +880 phones accepted; representative needs name and relationship',()=>{
  const base={...S.initial('Akshi','STD'),person_name:'RAHIMA KHATUN',general_condition:'Stable',mobility:'Bedbound',wounds_present:'No',summary:'Suitable',decision:'Suitable',
    family_name:'Karim',family_phone:'+880 1712345678',country:'Bangladesh',state:'Dhaka Division',district:'Dhaka',village_town:'Mirpur'};
  assert.equal(S.validate(base,'Completed'),'');
  assert.match(S.validate({...base,district:''},'Completed'),/District/);
  assert.match(S.validate({...base,family_phone:'+880 17123'},'Completed'),/10 digits/);
  assert.match(S.validate({...base,assessment_consent:'Obtained from representative',consent_given_by_name:'Karim'},'Completed'),/name and relationship/);
  assert.equal(S.validate({...base,assessment_consent:'Obtained from representative',consent_given_by_name:'Karim',consent_given_by_relationship:'Son'},'Completed'),'');
  // Kerala: district typed
  assert.equal(S.validate({...base,family_phone:'9876543210',country:'India',state:'Kerala',district:'Ernakulam',village_town:'Kochi'},'Completed'),'');
});
