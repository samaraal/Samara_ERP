/* Samara Guest address + phone kit (2.16.45)
   ONE definition of the Guest's home address and phone numbers, used by
   Spot Assessment, Admission and Patients → Edit, so the three forms always have
   the same fields and a Spot Assessment carries over exactly.

   Address: Country → State / Division → District → Taluk / Upazila → Village / Town …
     - India + Tamil Nadu : District and Taluk lists (the existing Tamil Nadu list)
     - India, other states: State / UT list, District and Taluk / Tehsil / Mandal typed
     - Bangladesh         : Division list, District list, Upazila / Thana typed, 4-digit Postcode
     - Any other country  : State / Province, District / City typed, Postal code
   All values are kept in the same columns as before (state, district, taluk, pincode …)
   plus "country". Old records with no country are India. */
(() => {
  'use strict';
  const txt=v=>String(v==null?'':v).trim();
  const COUNTRIES=['India','Bangladesh','Nepal','Sri Lanka','Bhutan','Myanmar','Maldives','United Arab Emirates','Saudi Arabia','Qatar','Oman','Kuwait','Bahrain','Singapore','Malaysia','United Kingdom','United States','Canada','Australia'];
  const OTHER='__other';
  const OTHER_PENDING='Other'; // "Other country" chosen, name not typed yet
  const INDIAN_STATES=['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];
  const BANGLADESH={
    'Barishal Division':['Barguna','Barishal','Bhola','Jhalokati','Patuakhali','Pirojpur'],
    'Chattogram Division':['Bandarban','Brahmanbaria','Chandpur','Chattogram','Cox\'s Bazar','Cumilla','Feni','Khagrachhari','Lakshmipur','Noakhali','Rangamati'],
    'Dhaka Division':['Dhaka','Faridpur','Gazipur','Gopalganj','Kishoreganj','Madaripur','Manikganj','Munshiganj','Narayanganj','Narsingdi','Rajbari','Shariatpur','Tangail'],
    'Khulna Division':['Bagerhat','Chuadanga','Jashore','Jhenaidah','Khulna','Kushtia','Magura','Meherpur','Narail','Satkhira'],
    'Mymensingh Division':['Jamalpur','Mymensingh','Netrokona','Sherpur'],
    'Rajshahi Division':['Bogura','Chapai Nawabganj','Joypurhat','Naogaon','Natore','Pabna','Rajshahi','Sirajganj'],
    'Rangpur Division':['Dinajpur','Gaibandha','Kurigram','Lalmonirhat','Nilphamari','Panchagarh','Rangpur','Thakurgaon'],
    'Sylhet Division':['Habiganj','Moulvibazar','Sunamganj','Sylhet']
  };
  const tnMap=()=>window.SamaraTNDistrictTaluks||{};
  const ADDRESS_KEYS=['country','state','district','taluk','village_town','locality_area','street_name','house_no','apartment_name','flat_no','landmark','pincode'];

  // Country of an address. Old records have no country: a non-Indian country is found in the
  // assembled address text (it is always written there), otherwise India.
  function countryOf(d){
    d=d||{};
    const c=txt(d.country);
    if(c)return c;
    const st=txt(d.state);
    if(BANGLADESH[st])return 'Bangladesh';
    const text=`${txt(d.address)}\n${txt(d.home_address)}`.toLowerCase();
    const found=COUNTRIES.slice(1).find(x=>new RegExp(`(^|[\\s,])${x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([\\s,]|$)`).test(text));
    return found||'India';
  }
  function labels(d){
    const c=countryOf(d),st=txt(d?.state);
    if(c==='India')return {state:'State / UT',district:'District',taluk:st==='Tamil Nadu'||!st?'Taluk':'Taluk / Tehsil / Mandal',village:'Village / Town / City',pin:'PIN Code',pinHint:'6-digit PIN'};
    if(c==='Bangladesh')return {state:'Division',district:'District (Zila)',taluk:'Upazila / Thana',village:'Village / Town / City',pin:'Postcode',pinHint:'4-digit postcode'};
    return {state:'State / Province / Region',district:'District / County',taluk:'Sub-district',village:'Town / City / Village',pin:'Postal code',pinHint:'Postal code'};
  }
  function pinValid(d){
    const c=countryOf(d),p=txt(d?.pincode);
    if(!p)return true;
    if(c==='India')return /^\d{6}$/.test(p);
    if(c==='Bangladesh')return /^\d{4}$/.test(p);
    return /^[A-Za-z0-9 -]{3,10}$/.test(p);
  }
  function cleanPin(d,value){
    const c=countryOf(d),v=String(value||'');
    if(c==='India')return v.replace(/\D/g,'').slice(0,6);
    if(c==='Bangladesh')return v.replace(/\D/g,'').slice(0,4);
    return v.replace(/[^A-Za-z0-9 -]/g,'').slice(0,10).toUpperCase();
  }
  // "street / house no." are required for Indian addresses only (many foreign village addresses have neither)
  function requiredKeys(d){
    const c=countryOf(d);
    if(c==='India')return ['state','district','village_town','street_name','house_no'];
    if(c==='Bangladesh')return ['state','district','village_town'];
    return ['country','village_town'];
  }
  function composeAddress(d){
    d=d||{};
    const c=countryOf(d)===OTHER_PENDING?'':countryOf(d);
    const line1=[d.house_no,d.street_name,d.apartment_name,txt(d.flat_no)?`Flat ${txt(d.flat_no)}`:''].map(txt).filter(Boolean).join(', ');
    const line2=[d.locality_area,d.village_town,d.taluk,d.district,d.state,d.pincode].map(txt).filter(Boolean).join(', ');
    return [line1,[line2,c&&c!=='India'?c:''].filter(Boolean).join(', '),txt(d.landmark)?`Landmark: ${txt(d.landmark)}`:''].filter(Boolean).join('\n');
  }
  const hasAddress=d=>ADDRESS_KEYS.some(k=>!['country','state'].includes(k)&&txt(d?.[k]));
  // complete check (Admission / Patients edit save, Spot "Completed"); '' when fine
  function addressProblem(d){
    const L=labels(d),c=countryOf(d);
    if(!c||c===OTHER_PENDING)return 'Address: choose the Country (type the country name for “Other country”).';
    for(const k of requiredKeys(d)){
      if(!txt(d[k]))return `Address: enter the ${({state:L.state,district:L.district,village_town:L.village,street_name:'Street / Road Name',house_no:'Door / House No.',country:'Country'})[k]}.`;
    }
    if(!pinValid(d))return `${L.pin} must be ${c==='India'?'6 digits':c==='Bangladesh'?'4 digits':'3 to 10 letters / digits'}.`;
    return '';
  }

  // Identity document wording follows the Guest's country
  const idDocLabel=d=>countryOf(d)==='India'?'Aadhaar / Identity Card':'Passport / National ID card';

  // ---------------- Phones ----------------
  const DIAL_CODES=[
    ['India','+91'],['Bangladesh','+880'],['Nepal','+977'],['Sri Lanka','+94'],['Bhutan','+975'],['Myanmar','+95'],['Maldives','+960'],
    ['United Arab Emirates','+971'],['Saudi Arabia','+966'],['Qatar','+974'],['Oman','+968'],['Kuwait','+965'],['Bahrain','+973'],
    ['Singapore','+65'],['Malaysia','+60'],['United Kingdom','+44'],['United States / Canada','+1'],['Australia','+61'],['New Zealand','+64'],
    ['Germany','+49'],['France','+33'],['Ireland','+353'],['Italy','+39'],['Netherlands','+31'],['Switzerland','+41'],
    ['Japan','+81'],['South Korea','+82'],['Pakistan','+92'],['South Africa','+27']
  ];
  const CODES_LONGEST=DIAL_CODES.map(x=>x[1]).sort((a,b)=>b.length-a.length);
  const dialForCountry=c=>(DIAL_CODES.find(([n])=>n===c||(c==='United States'||c==='Canada')&&n==='United States / Canada')||[])[1]||'+91';
  // value formats accepted: "+880 1712345678", "+91 9876543210", bare "9876543210" (old records = India)
  function dialOf(value){
    const raw=String(value||'').trim();
    if(!raw.startsWith('+'))return '+91';
    const digits=raw.replace(/\D/g,'');
    return CODES_LONGEST.find(code=>digits.startsWith(code.slice(1)))||'+91';
  }
  function localOf(value){
    const raw=String(value||'').trim();
    const digits=raw.replace(/\D/g,'');
    if(!raw.startsWith('+'))return digits.length>10&&digits.startsWith('91')&&digits.length===12?digits.slice(2):digits;
    return digits.slice(dialOf(raw).length-1);
  }
  const phoneValue=(code,local)=>`${code} ${String(local||'').replace(/\D/g,'').slice(0,14)}`;
  // a leading trunk 0 (e.g. Bangladesh 01712…, UK 07…) is not part of the international number
  const localNumber=value=>localOf(value).replace(/^0+/,'');
  function phoneProblem(value,label='Mobile'){
    const local=localNumber(value);
    if(!local)return '';
    if(dialOf(value)==='+91')return local.length===10?'':`${label}: an Indian mobile number has 10 digits.`;
    if(dialOf(value)==='+880')return local.length===10?'':`${label}: a Bangladesh mobile number has 10 digits after +880 (e.g. 1712 345678; a leading 0 is dropped).`;
    return local.length>=6&&local.length<=13?'':`${label}: check the number (6 to 13 digits after the country code).`;
  }
  // How a family / WhatsApp number is stored: Indian numbers stay 10 digits (as always);
  // other countries keep their country code ("+880 1712345678") so WhatsApp reaches the right phone.
  function storedMobile(value){
    const local=localNumber(value);
    if(!local)return '';
    const code=dialOf(value);
    return code==='+91'?local.slice(-10):`${code} ${local}`;
  }
  // same number? (compares the full international number)
  const samePhone=(a,b)=>{const x=storedMobile(a),y=storedMobile(b);return !!x&&x.replace(/\D/g,'')===y.replace(/\D/g,'')};

  const RELATIONSHIPS=['Wife','Husband','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Nephew','Niece','Guardian','Caregiver','Friend','Other'];

  // ---------------- React pieces ----------------
  // <PhoneInput value onChange label required disabled id />
  function PhoneInput(props){
    const R=window.React,h=R.createElement;
    const {value,onChange,label,required,disabled,id,className='field',hint}=props;
    const code=dialOf(value),local=localOf(value);
    return h('div',{className},
      h('label',{htmlFor:id},label,required?' *':''),
      h('div',{style:{display:'grid',gridTemplateColumns:'minmax(118px,42%) 1fr',gap:'6px'}},
        h('select',{value:code,disabled,'aria-label':`${label} country code`,onChange:e=>onChange(phoneValue(e.target.value,local))},
          DIAL_CODES.map(([country,dial])=>h('option',{key:`${country}${dial}`,value:dial},`${dial} ${country}`))),
        h('input',{id,type:'tel',inputMode:'tel',required,disabled,value:local,placeholder:code==='+91'?'10-digit mobile':'Mobile number',onChange:e=>onChange(phoneValue(code,e.target.value))})),
      hint?h('small',{className:'small-note'},hint):null);
  }

  // <AddressFields value onChange(patch) strict disabled idPrefix /> — returns the fields only
  // (no wrapper), so it sits inside each form's own grid.
  function AddressFields(props){
    const R=window.React,h=R.createElement;
    const {value:d={},onChange,strict=false,disabled=false,idPrefix='addr'}=props;
    const country=countryOf(d);
    const typingOther=!COUNTRIES.includes(country);
    const L=labels(d);
    const req=k=>strict&&requiredKeys(d).includes(k);
    // required boxes get their "*" from the ERP's own required-field marker (strict forms)
    const lab=(k,text)=>h('label',{htmlFor:`${idPrefix}-${k}`},text);
    const set=patch=>onChange(patch);
    const input=(k,text,extra={})=>h('div',{className:'field',key:k},lab(k,text),
      h('input',{id:`${idPrefix}-${k}`,value:d[k]||'',disabled,required:req(k),onChange:e=>set({[k]:e.target.value}),...extra}));
    const select=(k,text,options,placeholder,extra={})=>{
      const v=d[k]||'';const opts=[...(v&&!options.includes(v)?[v]:[]),...options];
      return h('div',{className:'field',key:k},lab(k,text),
        h('select',{id:`${idPrefix}-${k}`,value:v,disabled:disabled||extra.disabled,required:req(k),onChange:e=>extra.onPick?extra.onPick(e.target.value):set({[k]:e.target.value})},
          h('option',{value:''},placeholder),opts.map(o=>h('option',{key:o,value:o},o))));
    };
    function pickCountry(v){
      if(v===OTHER){if(!typingOther)set({country:OTHER_PENDING,state:'',district:'',taluk:'',pincode:''});return}
      if(v===country)return;
      set({country:v,state:v==='India'?'Tamil Nadu':'',district:'',taluk:'',pincode:''});
    }
    const out=[];
    out.push(h('div',{className:'field',key:'country'},lab('country','Country'),
      h('select',{id:`${idPrefix}-country`,value:typingOther?OTHER:country,disabled,onChange:e=>pickCountry(e.target.value)},
        COUNTRIES.map(c=>h('option',{key:c,value:c},c)),h('option',{value:OTHER},'Other country (type)'))));
    if(typingOther)out.push(h('div',{className:'field',key:'country-name'},h('label',{htmlFor:`${idPrefix}-country-name`},'Country name'),
      h('input',{id:`${idPrefix}-country-name`,value:country===OTHER_PENDING?'':country,disabled,required:strict,placeholder:'Type the country',
        onChange:e=>set({country:e.target.value.trim()?e.target.value:OTHER_PENDING})})));
    if(country==='India'){
      out.push(select('state',L.state,INDIAN_STATES,'Select State / UT',{onPick:v=>set({state:v,...(v!==d.state?{district:'',taluk:''}:{})})}));
      if(txt(d.state)==='Tamil Nadu'){
        const districts=Object.keys(tnMap()).sort((a,b)=>a.localeCompare(b));
        out.push(select('district',L.district,districts,'Select District',{onPick:v=>set({district:v,...(v!==d.district?{taluk:''}:{})})}));
        out.push(select('taluk',L.taluk,tnMap()[d.district]||[],d.district?'Select Taluk':'Select District first',{disabled:!d.district}));
      }else{
        out.push(input('district',L.district,{placeholder:'Type the district'}));
        out.push(input('taluk',L.taluk,{placeholder:'Type (optional)'}));
      }
    }else if(country==='Bangladesh'){
      out.push(select('state',L.state,Object.keys(BANGLADESH),'Select Division',{onPick:v=>set({state:v,...(v!==d.state?{district:''}:{})})}));
      out.push(select('district',L.district,BANGLADESH[d.state]||[],d.state?'Select District':'Select Division first',{disabled:!d.state}));
      out.push(input('taluk',L.taluk,{placeholder:'e.g. Savar'}));
    }else{
      out.push(input('state',L.state));
      out.push(input('district',L.district));
      out.push(input('taluk',L.taluk));
    }
    out.push(input('village_town',L.village));
    out.push(input('locality_area','Locality / Area'));
    out.push(input('street_name','Street / Road Name'));
    out.push(input('house_no','Door / House No.'));
    out.push(input('apartment_name','Apartment / Building'));
    out.push(input('flat_no','Flat No.'));
    out.push(input('landmark','Landmark'));
    out.push(h('div',{className:'field',key:'pincode'},lab('pincode',L.pin),
      h('input',{id:`${idPrefix}-pincode`,value:d.pincode||'',disabled,inputMode:['India','Bangladesh'].includes(country)?'numeric':'text',placeholder:L.pinHint,
        onChange:e=>set({pincode:cleanPin(d,e.target.value)})})));
    return h(R.Fragment,null,...out);
  }

  window.SamaraGuestAddress={COUNTRIES,INDIAN_STATES,BANGLADESH,ADDRESS_KEYS,RELATIONSHIPS,DIAL_CODES,
    countryOf,labels,pinValid,cleanPin,requiredKeys,composeAddress,hasAddress,addressProblem,idDocLabel,
    dialOf,localOf,localNumber,phoneValue,phoneProblem,storedMobile,samePhone,dialForCountry,
    PhoneInput,AddressFields};
})();
